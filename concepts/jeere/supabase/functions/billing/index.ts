// Jeere — Edge Function `billing` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk): what sellers pay JEERE,
// by card through Stripe (Jeere's own Stripe account, not Connect): the Studio subscriptions, the boutique plans,
// and the domain names Jeere buys for them. Mobile money comes later (CinetPay).
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/billing
//   headers: apikey: <publishable key>, Authorization: Bearer <her Supabase session>
//   body: { action: 'prices' }                                   → the price lists (anyone)
//         { action: 'subscribe', kind: 'studio'|'boutique', plan, period, returnUrl }
//                                                               → { ok, url } Stripe Checkout (subscription)
//         { action: 'portal', returnUrl }                       → { ok, url } her Stripe billing portal (cards, invoices, cancel)
//         { action: 'domain', domain, storeId?, returnUrl }     → { ok, url, price } Stripe Checkout (one payment)
//   Stripe's webhook (events of Jeere's own account) POSTs here with Stripe-Signature:
//     customer.subscription.created / updated / deleted → profiles.plan (boutique) or profiles.studio (Studio)
//     invoice.paid                                        → the invoice in profiles.studio.invoices
//     checkout.session.completed (kind domain, paid)      → buys the domain at Vercel, adds it to the store
//
// Prices are decided HERE (never by the browser): the Studio plans of studio/plans.js, the boutique plans of
// creer/data.js, the domains at Vercel's price × 600 FCFA/USD + 40 % + 2 000 FCFA (creer/domains.js).
// Secrets: STRIPE_SECRET_KEY (shared with `payments`), STRIPE_BILLING_WEBHOOK_SECRET (the whsec_ of the webhook
// endpoint « Your account » → this URL), VERCEL_TOKEN (domains), RESEND_API_KEY (the team's e-mail), optional
// JEERE_TEAM_EMAIL (default annklyy@gmail.com).
// Deployed with verify_jwt = false (the publishable key is not a JWT; Stripe sends no JWT): checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_KEY = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
const WEBHOOK_SECRET = (Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') ?? '').trim();
const VERCEL_TOKEN = (Deno.env.get('VERCEL_TOKEN') ?? '').trim();
const PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') || 'prj_fD8DW3XmW3iyaGNXSCquGcApR4AC';
const TEAM_ID = Deno.env.get('VERCEL_TEAM_ID') || 'team_baaIo2HD3gXK1oOziipXPpAl';
const GIT_BRANCH = Deno.env.get('VERCEL_GIT_BRANCH') ?? 'claude/session-setup-kcwzk4';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TEAM_EMAIL = Deno.env.get('JEERE_TEAM_EMAIL') ?? 'annklyy@gmail.com';
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jeere.kreeative.xyz').replace(/\/$/, '');

/* ------------------------------------------------------------------ prices (FCFA, XOF has no decimals) */
// Studio (studio/plans.js): month = billed monthly; year = the price per month billed yearly
const STUDIO: Record<string, { name: string; month: number; year: number }> = {
  solo: { name: 'Studio Solo', month: 7900, year: 5400 },
  pro: { name: 'Studio Pro', month: 24900, year: 16900 },
  agence: { name: 'Studio Agence', month: 79900, year: 54900 }
};
// Boutique plans (creer/data.js PLANS): per month, and per week where offered
const BOUTIQUE: Record<string, { name: string; month: number; week: number | null }> = {
  essentiel: { name: 'Jeere Essentiel', month: 3000, week: 1000 },
  pro: { name: 'Jeere Pro', month: 10000, week: null },
  business: { name: 'Jeere Business', month: 25000, week: null }
};
const FX = 600, MARGIN = 0.40, FIXED = 2000;
const domainFcfa = (usd: number) => Math.ceil((usd * FX * (1 + MARGIN) + FIXED) / 500) * 500;
const DAY = 86400000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string, extra: Obj = {}) => json({ ok: false, code, message, ...extra }, status);
const NOT_CONFIGURED = 'Le paiement par carte n’est pas encore activé sur Jeere : réessayez bientôt.';

/* ------------------------------------------------------------------ data */
const admin = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) }
});
async function rows(path: string) { const r = await admin(path); return r.ok ? await r.json() as Obj[] : []; }
async function userOf(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth) || auth.includes(PUBLISHABLE)) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && typeof u.id === 'string' ? { id: u.id, email: String(u.email ?? '') } : null;
}
async function profile(id: string) { return (await rows('profiles?select=id,first_name,phone,plan,studio&id=eq.' + id))[0] ?? null; }
async function saveProfile(id: string, patch: Obj) { await admin('profiles?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); }

/* ------------------------------------------------------------------ Stripe (v1, form-encoded) */
function form(o: Obj, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + '[' + k + ']' : k;
    if (Array.isArray(v)) v.forEach((x, i) => { if (isObj(x)) out.push(...form(x, key + '[' + i + ']')); else out.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(String(x))); });
    else if (isObj(v)) out.push(...form(v, key));
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out;
}
async function stripe(method: string, path: string, body?: Obj): Promise<{ ok: boolean; status: number; data: Obj }> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + STRIPE_KEY, 'Stripe-Version': '2024-06-20' };
  let url = 'https://api.stripe.com/v1/' + path;
  let payload: string | undefined;
  if (body && method === 'GET') url += '?' + form(body).join('&');
  else if (body) { payload = form(body).join('&'); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const r = await fetch(url, { method, headers, body: payload });
  let data: Obj = {};
  try { data = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, data };
}
const stripeError = (d: Obj) => (isObj(d.error) ? str(d.error.message, 300) : '') || 'Stripe a refusé la demande.';

// Her Stripe customer: found by metadata.user_id, else created (one per Jeere account)
async function customerFor(user: { id: string; email: string }, name: string): Promise<string | null> {
  const found = await stripe('GET', 'customers/search', { query: "metadata['user_id']:'" + user.id + "'", limit: 1 });
  const list = found.ok && Array.isArray(found.data.data) ? found.data.data as Obj[] : [];
  if (list[0] && typeof list[0].id === 'string') return list[0].id;
  if (user.email) {
    const byMail = await stripe('GET', 'customers', { email: user.email, limit: 10 });
    const l2 = byMail.ok && Array.isArray(byMail.data.data) ? (byMail.data.data as Obj[]).filter((c) => isObj(c.metadata) && (c.metadata as Obj).user_id === user.id) : [];
    if (l2[0]) return String(l2[0].id);
  }
  const made = await stripe('POST', 'customers', { email: user.email || undefined, name: name || undefined, metadata: { user_id: user.id } });
  return made.ok ? String(made.data.id) : null;
}
// Back to the page she came from, on Jeere only
function backUrl(v: unknown, fallback: string) {
  const u = str(v, 300);
  return /^https:\/\/(jeere\.kreeative\.xyz|kreeative\.xyz|localhost)(:\d+)?\//.test(u) ? u.replace(/#.*$/, '') : fallback;
}
const withParam = (u: string, p: string) => u + (u.includes('?') ? '&' : '?') + p;

/* ------------------------------------------------------------------ Vercel (domains) */
async function vercel(path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch('https://api.vercel.com' + path + sep + 'teamId=' + TEAM_ID, { ...init, headers: { Authorization: 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  let body: any = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, body };
}
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const PROTECTED = /(^|\.)(kreeative\.xyz|vercel\.app|vercel\.com|jeere\.shop|supabase\.co)$/;
async function domainQuote(domain: string) {
  const [av, pr] = await Promise.all([
    vercel('/v1/registrar/domains/availability', { method: 'POST', body: JSON.stringify({ domains: [domain] }) }),
    vercel('/v1/registrar/domains/' + encodeURIComponent(domain) + '/price?years=1')
  ]);
  const a = (av.body?.results ?? []).find((x: any) => x.domain === domain);
  const usd = Number(pr.body?.purchasePrice);
  return { available: !!a && a.available === true, usd: isFinite(usd) ? usd : NaN };
}
async function addToProject(name: string, redirect?: string) {
  return vercel('/v10/projects/' + PROJECT_ID + '/domains', { method: 'POST', body: JSON.stringify({ name, ...(redirect ? { redirect, redirectStatusCode: 308 } : {}), ...(GIT_BRANCH ? { gitBranch: GIT_BRANCH } : {}) }) });
}

async function teamMail(subject: string, text: string) {
  if (!RESEND_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Jeere <commandes@kreeative.xyz>', to: [TEAM_EMAIL], subject, text })
  }).catch(() => null);
}

/* ------------------------------------------------------------------ the webhook */
async function verify(payload: string, header: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && s.split('').reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}
const iso = (sec: unknown) => (Number(sec) > 0 ? new Date(Number(sec) * 1000).toISOString() : '');

// A subscription's state → her entitlements
async function applySubscription(sub: Obj) {
  const md = isObj(sub.metadata) ? sub.metadata : {};
  const userId = str(md.user_id, 40), kind = str(md.kind, 20), plan = str(md.plan, 20), period = str(md.period, 10);
  if (!UUID.test(userId)) return;
  const pr = await profile(userId);
  if (!pr) return;
  const status = String(sub.status ?? '');
  const live = status === 'active' || status === 'trialing' || status === 'past_due';
  if (kind === 'boutique') {
    if (!(plan in BOUTIQUE)) return;
    if (live) await saveProfile(userId, { plan });
    else if (pr.plan === plan) await saveProfile(userId, { plan: 'gratuit' });
    return;
  }
  if (kind !== 'studio' || !(plan in STUDIO)) return;
  const prev = isObj(pr.studio) ? pr.studio as Obj : {};
  if (prev.lifetime === true) return;
  const studio: Obj = {
    ...prev, version: 1, plan: live ? plan : 'decouverte', period: period === 'an' ? 'an' : 'mois',
    status: live ? 'active' : 'free', startedAt: iso(sub.start_date) || prev.startedAt || '',
    periodEnd: iso(sub.current_period_end), cancelAtPeriodEnd: sub.cancel_at_period_end === true, pending: null,
    trialUsed: true, hideBadge: prev.hideBadge !== false, source: 'stripe',
    stripe: { customer: str(sub.customer, 60), subscription: str(sub.id, 60) }, syncedAt: new Date().toISOString()
  };
  await saveProfile(userId, { studio });
}
async function addInvoice(inv: Obj) {
  const lines = isObj(inv.lines) && Array.isArray((inv.lines as Obj).data) ? (inv.lines as Obj).data as Obj[] : [];
  const md = lines[0] && isObj(lines[0].metadata) ? lines[0].metadata as Obj : (isObj(inv.subscription_details) && isObj((inv.subscription_details as Obj).metadata) ? (inv.subscription_details as Obj).metadata as Obj : {});
  const userId = str(md.user_id, 40);
  if (!UUID.test(userId) || md.kind !== 'studio') return;
  const pr = await profile(userId);
  if (!pr) return;
  const prev = isObj(pr.studio) ? pr.studio as Obj : {};
  const list = Array.isArray(prev.invoices) ? (prev.invoices as Obj[]).filter(isObj) : [];
  if (list.some((v) => v.ref === inv.id)) return;
  const plan = str(md.plan, 20);
  const entry = {
    id: str(inv.number, 24) || str(inv.id, 24), date: iso(inv.created) || new Date().toISOString(),
    label: (STUDIO[plan]?.name ?? 'Studio') + (md.period === 'an' ? ' · annuel' : ' · mensuel'), plan, period: md.period === 'an' ? 'an' : 'mois',
    amount: Math.round(Number(inv.amount_paid) || 0), credit: 0, method: 'card', status: 'payée', provider: 'stripe', ref: str(inv.id, 60),
    url: str(inv.hosted_invoice_url, 300)
  };
  await saveProfile(userId, { studio: { ...prev, invoices: [entry, ...list].slice(0, 60) } });
}
// A domain paid by card: bought at Vercel, then added to her store
async function buyDomain(session: Obj) {
  const md = isObj(session.metadata) ? session.metadata : {};
  const domain = str(md.domain, 253);
  const expected = Number(md.usd);
  const cd = isObj(session.customer_details) ? session.customer_details as Obj : {};
  const ad = isObj(cd.address) ? cd.address as Obj : {};
  const full = str(cd.name, 80) || 'Client Jeere';
  const parts = full.split(' ');
  const contact = {
    firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0], email: str(cd.email, 120) || TEAM_EMAIL,
    phone: (str(cd.phone, 30) || '+10000000000').replace(/[^\d+]/g, '').replace(/^(\+\d{1,3})(\d+)$/, '$1.$2'),
    address1: str(ad.line1, 100) || 'N/A', city: str(ad.city, 60) || 'Abidjan', state: str(ad.state, 60) || str(ad.city, 60) || 'Abidjan',
    zip: str(ad.postal_code, 20) || '00000', country: (str(ad.country, 2) || 'CI').toUpperCase()
  };
  const paidFcfa = Math.round(Number(session.amount_total) || 0);
  const report = (ok: boolean, why: string) => teamMail((ok ? 'Domaine acheté : ' : 'À FAIRE — domaine payé mais pas acheté : ') + domain,
    'Domaine : ' + domain + '\nPayé : ' + paidFcfa + ' FCFA (Stripe ' + str(session.id, 80) + ')\nPrix Vercel attendu : ' + expected + ' USD\nTitulaire : ' + full + ' · ' + contact.email + ' · ' + contact.phone + '\n' + why);
  if (!VERCEL_TOKEN || !DOMAIN_RE.test(domain) || PROTECTED.test(domain)) { await report(false, 'Vercel pas configuré ou domaine refusé : achetez-le à la main, puis reliez-le dans Gérer › Domaine.'); return; }
  const quote = await vercel('/v1/registrar/domains/' + encodeURIComponent(domain) + '/price?years=1');
  const price = Number(quote.body?.purchasePrice);
  if (!quote.ok || !isFinite(price) || (isFinite(expected) && price > expected + 0.5)) { await report(false, 'Le prix Vercel a changé (' + price + ' USD) : vérifiez, achetez à la main ou remboursez.'); return; }
  const r = await vercel('/v1/registrar/domains/' + encodeURIComponent(domain) + '/buy', { method: 'POST', body: JSON.stringify({ autoRenew: false, years: 1, expectedPrice: price, contactInformation: contact }) });
  if (!r.ok) { await report(false, 'Vercel a refusé l’achat : ' + String(r.body?.error?.message ?? r.body?.message ?? r.status) + '. Achetez-le à la main ou remboursez.'); return; }
  const storeId = str(md.store_id, 40);
  let attached = '';
  if (UUID.test(storeId)) {
    const a = await addToProject(domain);
    if (a.ok) await addToProject('www.' + domain, domain);
    await admin('stores?id=eq.' + storeId, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ custom_domain: domain, domain_status: a.ok ? 'attached' : 'error' }) });
    attached = a.ok ? 'Relié à la boutique.' : 'Pas encore relié à la boutique : Gérer › Domaine › Vérifier.';
  }
  await report(true, 'Acheté chez Vercel pour ' + price + ' USD. ' + attached);
}

async function webhook(req: Request) {
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('Stripe-Signature') ?? ''))) return json({ ok: false, code: 'signature' }, 400);
  let ev: Obj = {};
  try { ev = JSON.parse(payload); } catch { return json({ ok: false }, 400); }
  if (ev.account) return json({ ok: true }); // a connected store's event: the `payments` function's
  const type = String(ev.type ?? '');
  const obj = isObj(ev.data) && isObj((ev.data as Obj).object) ? (ev.data as Obj).object as Obj : {};
  if (type.startsWith('customer.subscription.')) { await applySubscription(obj); return json({ ok: true }); }
  if (type === 'invoice.paid') { await addInvoice(obj); return json({ ok: true }); }
  if (type === 'checkout.session.completed' && isObj(obj.metadata) && (obj.metadata as Obj).kind === 'domain' && obj.payment_status === 'paid') {
    await buyDomain(obj);
    return json({ ok: true });
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------------ the handler */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  if (req.headers.get('Stripe-Signature')) return webhook(req);
  let b: Obj = {};
  try { const x = await req.json(); if (isObj(x)) b = x; } catch { /* empty */ }
  const action = String(b.action ?? '');

  if (action === 'prices') return json({ ok: true, configured: !!STRIPE_KEY, studio: STUDIO, boutique: BOUTIQUE, domains: { fx: FX, margin: MARGIN, fixed: FIXED } });
  if (!STRIPE_KEY) return fail(503, 'not_configured', NOT_CONFIGURED);
  const user = await userOf(req);
  if (!user) return fail(401, 'login', 'Connectez-vous à votre compte Jeere pour payer.');
  const pr = await profile(user.id);
  const name = str(pr?.first_name, 40);

  if (action === 'subscribe') {
    const kind = b.kind === 'boutique' ? 'boutique' : 'studio';
    const plan = str(b.plan, 20);
    let amount = 0, interval = 'month', label = '', period = '';
    if (kind === 'studio') {
      const p = STUDIO[plan];
      if (!p) return fail(400, 'plan', 'Choisissez une formule Studio payante.');
      period = b.period === 'an' ? 'an' : 'mois';
      amount = period === 'an' ? p.year * 12 : p.month;
      interval = period === 'an' ? 'year' : 'month';
      label = p.name + (period === 'an' ? ' · annuel' : ' · mensuel');
    } else {
      const p = BOUTIQUE[plan];
      if (!p) return fail(400, 'plan', 'Choisissez une formule boutique payante.');
      period = b.period === 'semaine' && p.week ? 'semaine' : 'mois';
      amount = period === 'semaine' ? p.week as number : p.month;
      interval = period === 'semaine' ? 'week' : 'month';
      label = p.name + (period === 'semaine' ? ' · à la semaine' : ' · au mois');
    }
    const customer = await customerFor(user, name);
    if (!customer) return fail(502, 'stripe', 'Stripe n’a pas pu créer votre fiche client. Réessayez.');
    // one live subscription per kind: a change of plan goes through the portal
    const subs = await stripe('GET', 'subscriptions', { customer, status: 'all', limit: 20 });
    const same = (subs.ok && Array.isArray(subs.data.data) ? subs.data.data as Obj[] : []).find((s) => ['active', 'trialing', 'past_due'].includes(String(s.status)) && isObj(s.metadata) && (s.metadata as Obj).kind === kind);
    const back = backUrl(b.returnUrl, SITE + (kind === 'studio' ? '/abonnements/' : '/admin/'));
    if (same) {
      const portal = await stripe('POST', 'billing_portal/sessions', { customer, return_url: back });
      return portal.ok ? json({ ok: true, url: portal.data.url, portal: true, message: 'Vous avez déjà un abonnement : changez de formule depuis votre espace de paiement.' }) : fail(409, 'exists', 'Vous avez déjà un abonnement ' + (kind === 'studio' ? 'Studio' : 'boutique') + '.');
    }
    const meta = { user_id: user.id, kind, plan, period };
    const session = await stripe('POST', 'checkout/sessions', {
      mode: 'subscription', customer, locale: 'fr', client_reference_id: user.id,
      line_items: [{ quantity: 1, price_data: { currency: 'xof', unit_amount: amount, recurring: { interval }, product_data: { name: label } } }],
      subscription_data: { metadata: meta, description: label },
      metadata: meta, allow_promotion_codes: true,
      success_url: withParam(back, 'abonnement=ok'), cancel_url: withParam(back, 'abonnement=annule')
    });
    if (!session.ok) return fail(502, 'stripe', stripeError(session.data));
    return json({ ok: true, url: session.data.url, amount, label });
  }

  if (action === 'portal') {
    const customer = await customerFor(user, name);
    if (!customer) return fail(502, 'stripe', 'Stripe n’a pas pu trouver votre fiche client.');
    const portal = await stripe('POST', 'billing_portal/sessions', { customer, return_url: backUrl(b.returnUrl, SITE + '/abonnements/') });
    if (!portal.ok) return fail(502, 'stripe', stripeError(portal.data) + ' (Stripe › Paramètres › Portail client : activez-le une fois.)');
    return json({ ok: true, url: portal.data.url });
  }

  if (action === 'domain') {
    if (!VERCEL_TOKEN) return fail(503, 'not_configured', 'L’achat de domaine n’est pas encore activé.');
    const domain = str(b.domain, 253).toLowerCase().replace(/^www\./, '');
    if (!DOMAIN_RE.test(domain) || PROTECTED.test(domain) || domain.split('.').length !== 2) return fail(400, 'format', 'Un nom de domaine sans www, par exemple awabeaute.com.');
    let storeId = str(b.storeId, 40);
    if (storeId) {
      const st = (await rows('stores?select=id,owner&id=eq.' + (UUID.test(storeId) ? storeId : '00000000-0000-0000-0000-000000000000')))[0];
      if (!st || st.owner !== user.id) storeId = '';
    }
    const q = await domainQuote(domain);
    if (!q.available) return fail(409, 'taken', domain + ' n’est plus disponible. Essayez une autre extension.');
    if (!isFinite(q.usd) || q.usd <= 0 || q.usd > 300) return fail(502, 'price', 'Pas de prix pour ce domaine pour l’instant. Réessayez plus tard.');
    const price = domainFcfa(q.usd);
    const customer = await customerFor(user, name);
    const back = backUrl(b.returnUrl, SITE + '/admin/');
    const session = await stripe('POST', 'checkout/sessions', {
      mode: 'payment', locale: 'fr', client_reference_id: user.id, ...(customer ? { customer } : { customer_email: user.email || undefined }),
      line_items: [{ quantity: 1, price_data: { currency: 'xof', unit_amount: price, product_data: { name: 'Nom de domaine ' + domain + ' (1 an)' } } }],
      billing_address_collection: 'required', phone_number_collection: { enabled: true },
      ...(customer ? { customer_update: { address: 'auto', name: 'auto' } } : {}),
      metadata: { kind: 'domain', user_id: user.id, domain, usd: String(q.usd), store_id: storeId },
      payment_intent_data: { description: 'Domaine ' + domain + ' · 1 an', metadata: { kind: 'domain', domain } },
      success_url: withParam(back, 'domaine=ok&nom=' + encodeURIComponent(domain)), cancel_url: withParam(back, 'domaine=annule')
    });
    if (!session.ok) return fail(502, 'stripe', stripeError(session.data));
    return json({ ok: true, url: session.data.url, price, domain });
  }

  return fail(400, 'action', 'Action inconnue.');
});
