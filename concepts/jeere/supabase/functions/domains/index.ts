// Jeere — Edge Function `domains` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// The only place that holds a Vercel token. The browser (../../../admin/, creer/domains.js) calls it with
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/domains
//   headers: apikey: <publishable key>, Authorization: Bearer <the seller's Supabase session> (when signed in)
//   body: { action, ... }
//
// Actions
//   status                      → { configured, purchases }                      anyone
//   search { name }             → availability and price (USD and FCFA) per TLD   anyone (needs the token)
//   attach { storeId, domain }  → saves stores.custom_domain, adds it to the Vercel project (apex + www)
//   verify { storeId }          → asks Vercel to check it again, updates stores.domain_status
//   detach { storeId }          → removes it from the project and from the store
//   buy { domain, years, expectedPrice, contact, storeId?, confirm: true }
//                               → the real purchase, team only: needs VERCEL_TOKEN, the DOMAINS_ADMIN_KEY
//                                 secret sent as the x-jeere-admin header, and confirm === true.
//                                 Never called by the demo checkout.
// attach / verify / detach need a signed-in seller who owns the store (stores.owner = her auth.users id).
//
// Secrets (Supabase › Edge Functions › Secrets): VERCEL_TOKEN (not set yet: every Vercel step then answers
// « pas encore configuré » and the store's domain waits for the team, domain_status = 'waiting_team'),
// DOMAINS_ADMIN_KEY (purchases), and optionally VERCEL_PROJECT_ID, VERCEL_TEAM_ID, VERCEL_GIT_BRANCH
// (the branch the store pages are deployed from; '' = production).
// Deployed with verify_jwt = false: the publishable key is not a JWT, so the function checks the session itself.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const VERCEL_TOKEN = Deno.env.get('VERCEL_TOKEN') ?? '';
const ADMIN_KEY = Deno.env.get('DOMAINS_ADMIN_KEY') ?? '';
const PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') || 'prj_fD8DW3XmW3iyaGNXSCquGcApR4AC';
const TEAM_ID = Deno.env.get('VERCEL_TEAM_ID') || 'team_baaIo2HD3gXK1oOziipXPpAl';
const GIT_BRANCH = Deno.env.get('VERCEL_GIT_BRANCH') ?? 'claude/session-setup-kcwzk4';
const API = 'https://api.vercel.com';

// The generic Vercel records (what Vercel's dashboard shows for any project domain)
const APEX_A = '76.76.21.21';
const CNAME_TARGET = 'cname.vercel-dns.com';

// Domains that are not stores and must never be attached or removed by this function
const PROTECTED = /(^|\.)(kreeative\.xyz|vercel\.app|vercel\.com|jeere\.shop|supabase\.co|localhost)$/;

// The TLDs Jeere resells through Vercel (Vercel does not offer .ci or .africa: see README « Domaines »)
const TLDS = ['com', 'shop', 'store', 'online', 'net', 'co', 'site', 'boutique'];

// Pricing in FCFA: Vercel's price in USD × 600 (a safety margin on ~575 FCFA per USD), + 40 %, + 2 000 FCFA,
// rounded up to the next 500 FCFA. Same formula as JeereDomains.fcfa (creer/domains.js).
const FX = 600, MARGIN = 0.40, FIXED = 2000;
function fcfa(usd: number): number {
  if (!isFinite(usd) || usd <= 0) return 0;
  return Math.ceil((usd * FX * (1 + MARGIN) + FIXED) / 500) * 500;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-jeere-admin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => json({ ok: false, code, message, ...extra }, status);
const NOT_CONFIGURED = 'La connexion à Vercel n’est pas encore configurée (pas encore configuré) : l’équipe Jeere relie votre domaine à la main, en général sous 24 h.';

/* ---------------------------------------------------------------- domain names */

function cleanDomain(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
}
function validDomain(d: string): boolean {
  return d.length >= 4 && d.length <= 253 && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) && !PROTECTED.test(d);
}
// 'www.awabeaute.ci' → { apex: 'awabeaute.ci', www: true }. Two-label public suffixes (.co.uk, .com.ci…) are kept whole.
const TWO_LEVEL = /\.(co|com|net|org|gouv|edu|ac|or|go)\.[a-z]{2}$/;
function apexOf(d: string): string {
  const parts = d.split('.');
  const keep = TWO_LEVEL.test(d) ? 3 : 2;
  return parts.slice(-keep).join('.');
}
function recordsFor(domain: string) {
  const apex = apexOf(domain);
  const isApex = domain === apex;
  const out = [{ type: 'A', name: '@', value: APEX_A, host: apex }];
  out.push({ type: 'CNAME', name: 'www', value: CNAME_TARGET, host: 'www.' + apex });
  if (!isApex && domain !== 'www.' + apex) out.push({ type: 'CNAME', name: domain.slice(0, -apex.length - 1), value: CNAME_TARGET, host: domain });
  return out;
}

/* ---------------------------------------------------------------- Supabase */

async function currentUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token.startsWith('sb_')) return null; // the publishable key itself is not a session
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && typeof u.id === 'string' ? { id: u.id } : null;
}
function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { apikey: SECRET, 'Content-Type': 'application/json' };
  if (SECRET && !SECRET.startsWith('sb_')) h.Authorization = 'Bearer ' + SECRET; // legacy service_role JWT
  return h;
}
type Store = { id: string; owner: string | null; slug: string; custom_domain: string | null; domain_status: string };
async function loadStore(id: unknown): Promise<Store | null> {
  const sid = String(id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(sid)) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${sid}&select=id,owner,slug,custom_domain,domain_status`, { headers: adminHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] as Store : null;
}
async function domainTakenBy(domain: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/stores?custom_domain=eq.${encodeURIComponent(domain)}&select=id`, { headers: adminHeaders() });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}
async function patchStore(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${id}`, {
    method: 'PATCH', headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, domain_checked_at: new Date().toISOString() })
  });
  return r.ok;
}
async function ownedStore(req: Request, storeId: unknown): Promise<{ store: Store } | { error: Response }> {
  if (!SECRET) return { error: fail(500, 'server', 'Le serveur Jeere n’a pas sa clé : réessayez plus tard.') };
  const user = await currentUser(req);
  if (!user) return { error: fail(401, 'login', 'Connectez-vous à votre compte Jeere pour relier un domaine.') };
  const store = await loadStore(storeId);
  if (!store || store.owner !== user.id) return { error: fail(403, 'owner', 'Cette boutique n’est pas à votre nom : seule sa propriétaire peut changer son domaine.') };
  return { store };
}

/* ---------------------------------------------------------------- Vercel */

async function vercel(path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(API + path + sep + 'teamId=' + TEAM_ID, {
    ...init, headers: { Authorization: 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: body as Record<string, any> };
}
async function addToProject(name: string, redirect?: string) {
  const body: Record<string, unknown> = { name };
  if (GIT_BRANCH) body.gitBranch = GIT_BRANCH;
  if (redirect) { body.redirect = redirect; body.redirectStatusCode = 308; }
  const r = await vercel(`/v10/projects/${PROJECT_ID}/domains`, { method: 'POST', body: JSON.stringify(body) });
  // Already on this project: fine
  if (!r.ok && r.status === 400 && /already/i.test(String(r.body?.error?.code ?? '') + String(r.body?.error?.message ?? ''))) return { ok: true, status: 200, body: {} };
  return r;
}
async function vercelState(domain: string) {
  const pd = await vercel(`/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(domain)}`);
  const cfg = await vercel(`/v6/domains/${encodeURIComponent(domain)}/config`);
  const verified = pd.ok && pd.body.verified === true;
  const misconfigured = !cfg.ok || cfg.body.misconfigured !== false;
  const verification = pd.ok && Array.isArray(pd.body.verification) ? pd.body.verification.map((v: any) => ({ type: v.type, name: v.domain, value: v.value, reason: v.reason })) : [];
  const ipv4 = cfg.ok && Array.isArray(cfg.body.recommendedIPv4) ? (cfg.body.recommendedIPv4.find((x: any) => x.rank === 1)?.value?.[0] ?? APEX_A) : APEX_A;
  const cname = cfg.ok && Array.isArray(cfg.body.recommendedCNAME) ? (cfg.body.recommendedCNAME.find((x: any) => x.rank === 1)?.value ?? CNAME_TARGET) : CNAME_TARGET;
  const status = verified && !misconfigured ? 'verified' : (pd.ok ? 'attached' : 'error');
  return { status, verified, misconfigured, verification, recommended: { a: ipv4, cname: String(cname).replace(/\.$/, '') } };
}

/* ---------------------------------------------------------------- DNS (no token: what the browser can see too) */

async function doh(name: string, type: 'A' | 'CNAME'): Promise<string[]> {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { headers: { Accept: 'application/dns-json' } });
    const j = await r.json();
    return Array.isArray(j.Answer) ? j.Answer.filter((a: any) => a.type === (type === 'A' ? 1 : 5)).map((a: any) => String(a.data).replace(/\.$/, '').toLowerCase()) : [];
  } catch { return []; }
}
async function dnsPointsToVercel(domain: string): Promise<boolean> {
  const apex = apexOf(domain);
  if (domain === apex) return (await doh(domain, 'A')).includes(APEX_A);
  const c = await doh(domain, 'CNAME');
  return c.some((v) => v === CNAME_TARGET || v.endsWith('.vercel-dns.com') || v.endsWith('.vercel-dns-017.com'));
}

/* ---------------------------------------------------------------- actions */

async function attach(req: Request, b: Record<string, unknown>) {
  const o = await ownedStore(req, b.storeId);
  if ('error' in o) return o.error;
  const domain = cleanDomain(b.domain);
  if (!validDomain(domain)) return fail(400, 'format', 'Écrivez le domaine sans espace ni « https », par exemple awabeaute.com ou www.awabeaute.com.');
  const other = await domainTakenBy(domain);
  if (other && other !== o.store.id) return fail(409, 'taken', 'Ce domaine est déjà relié à une autre boutique Jeere. Si c’est le vôtre, écrivez-nous sur WhatsApp.');
  const records = recordsFor(domain);
  if (!VERCEL_TOKEN) {
    const dns = await dnsPointsToVercel(domain);
    await patchStore(o.store.id, { custom_domain: domain, domain_status: 'waiting_team' });
    return json({ ok: true, configured: false, domain, status: 'waiting_team', dns, records, message: NOT_CONFIGURED });
  }
  const apex = apexOf(domain);
  const primary = await addToProject(domain);
  if (!primary.ok) {
    await patchStore(o.store.id, { custom_domain: domain, domain_status: 'error' });
    return fail(502, 'vercel', 'Vercel a refusé ce domaine : ' + String(primary.body?.error?.message ?? primary.status), { records });
  }
  // The other half redirects to the one she typed: apex ⇄ www
  const twin = domain === apex ? 'www.' + apex : (domain === 'www.' + apex ? apex : '');
  if (twin) await addToProject(twin, domain);
  const st = await vercelState(domain);
  await patchStore(o.store.id, { custom_domain: domain, domain_status: st.status });
  return json({ ok: true, configured: true, domain, ...st, records });
}

async function verify(req: Request, b: Record<string, unknown>) {
  const o = await ownedStore(req, b.storeId);
  if ('error' in o) return o.error;
  const domain = o.store.custom_domain;
  if (!domain) return fail(400, 'none', 'Cette boutique n’a pas encore de domaine.');
  const records = recordsFor(domain);
  if (!VERCEL_TOKEN) {
    const dns = await dnsPointsToVercel(domain);
    const status = o.store.domain_status === 'verified' ? 'verified' : 'waiting_team';
    await patchStore(o.store.id, { domain_status: status });
    return json({ ok: true, configured: false, domain, status, dns, records, message: NOT_CONFIGURED });
  }
  await vercel(`/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' });
  const st = await vercelState(domain);
  await patchStore(o.store.id, { domain_status: st.status });
  return json({ ok: true, configured: true, domain, ...st, records });
}

async function detach(req: Request, b: Record<string, unknown>) {
  const o = await ownedStore(req, b.storeId);
  if ('error' in o) return o.error;
  const domain = o.store.custom_domain;
  if (domain && VERCEL_TOKEN && !PROTECTED.test(domain)) {
    const apex = apexOf(domain);
    const twin = domain === apex ? 'www.' + apex : (domain === 'www.' + apex ? apex : '');
    for (const d of [twin, domain]) {
      if (d && !PROTECTED.test(d)) await vercel(`/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(d)}`, { method: 'DELETE' });
    }
  }
  await patchStore(o.store.id, { custom_domain: null, domain_status: 'none' });
  return json({ ok: true, configured: !!VERCEL_TOKEN });
}

async function search(b: Record<string, unknown>) {
  const label = String(b.name ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z.]*$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
  if (label.length < 2) return fail(400, 'format', 'Écrivez au moins deux lettres, par exemple awabeaute.');
  const domains = TLDS.map((t) => label + '.' + t);
  if (!VERCEL_TOKEN) return json({ ok: true, configured: false, label, domains, message: 'Recherche en direct pas encore configurée : vérification finale par l’équipe.' });
  const [av, pr] = await Promise.all([
    vercel('/v1/registrar/domains/availability', { method: 'POST', body: JSON.stringify({ domains }) }),
    vercel('/v1/registrar/domains/price', { method: 'POST', body: JSON.stringify({ domains }) })
  ]);
  const avail: Record<string, boolean> = {};
  (av.body?.results ?? []).forEach((x: any) => { avail[x.domain] = x.available === true; });
  const price: Record<string, any> = {};
  (pr.body?.results ?? []).forEach((x: any) => { price[x.domain] = x; });
  return json({
    ok: true, configured: true, label,
    results: domains.map((d) => {
      const p = price[d] ?? {};
      return { domain: d, available: avail[d] === true, years: p.years ?? 1, purchaseUsd: p.purchasePrice ?? null, renewalUsd: p.renewalPrice ?? null, purchaseFcfa: fcfa(p.purchasePrice), renewalFcfa: fcfa(p.renewalPrice) };
    })
  });
}

async function buy(req: Request, b: Record<string, unknown>) {
  // Three locks: the token, the team's own key, and an explicit confirm flag. The demo checkout sends none of them.
  if (!VERCEL_TOKEN) return fail(503, 'not_configured', NOT_CONFIGURED);
  if (!ADMIN_KEY || req.headers.get('x-jeere-admin') !== ADMIN_KEY) return fail(403, 'team_only', 'L’achat réel d’un domaine est fait par l’équipe Jeere, après le paiement de la vendeuse.');
  if (b.confirm !== true) return fail(400, 'confirm', 'Ajoutez "confirm": true pour acheter vraiment ce domaine (il sera facturé sur le compte Vercel de Jeere).');
  const domain = cleanDomain(b.domain);
  if (!validDomain(domain) || domain !== apexOf(domain)) return fail(400, 'format', 'Un nom de domaine sans www, par exemple awabeaute.com.');
  const years = Math.max(1, Math.min(10, Math.round(Number(b.years) || 1)));
  const expected = Number(b.expectedPrice);
  const c = (b.contact ?? {}) as Record<string, string>;
  const need = ['firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'zip', 'country'];
  const missing = need.filter((k) => !String(c[k] ?? '').trim());
  if (missing.length) return fail(400, 'contact', 'Coordonnées du titulaire incomplètes : ' + missing.join(', ') + '.');
  const quote = await vercel(`/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=${years}`);
  const price = Number(quote.body?.purchasePrice);
  if (!quote.ok || !isFinite(price)) return fail(502, 'price', 'Vercel n’a pas donné de prix pour ce domaine.');
  if (!isFinite(expected) || Math.abs(expected - price) > 0.001) return fail(409, 'price_changed', 'Le prix a changé : ' + price + ' USD. Relancez avec ce expectedPrice.', { price });
  const r = await vercel(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`, {
    method: 'POST',
    body: JSON.stringify({ autoRenew: false, years, expectedPrice: price, contactInformation: { ...c, country: String(c.country).toUpperCase() } })
  });
  if (!r.ok) return fail(502, 'vercel', 'Vercel a refusé l’achat : ' + String(r.body?.error?.message ?? r.body?.message ?? r.status));
  let attached = null;
  if (b.storeId) {
    const store = await loadStore(b.storeId);
    if (store) {
      const a = await addToProject(domain);
      if (a.ok) await addToProject('www.' + domain, domain);
      await patchStore(store.id, { custom_domain: domain, domain_status: a.ok ? 'attached' : 'error' });
      attached = a.ok;
    }
  }
  return json({ ok: true, orderId: r.body.orderId ?? null, domain, years, priceUsd: price, attached });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'POST seulement.');
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return fail(400, 'json', 'Corps JSON attendu.'); }
  try {
    switch (b.action) {
      case 'status': return json({ ok: true, configured: !!VERCEL_TOKEN, purchases: !!(VERCEL_TOKEN && ADMIN_KEY), records: { a: APEX_A, cname: CNAME_TARGET } });
      case 'search': return await search(b);
      case 'attach': return await attach(req, b);
      case 'verify': return await verify(req, b);
      case 'detach': return await detach(req, b);
      case 'buy': return await buy(req, b);
      default: return fail(400, 'action', 'Action inconnue.');
    }
  } catch (e) {
    return fail(500, 'error', 'Une erreur est survenue : ' + String((e as Error)?.message ?? e));
  }
});
