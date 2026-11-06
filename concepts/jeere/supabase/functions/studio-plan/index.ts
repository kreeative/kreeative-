// Jeere — Edge Function `studio-plan` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// The only writer of a seller's entitlements: public.profiles.plan (the store plan) and
// public.profiles.studio (the Studio subscription, the shape of studio/plans.js). Browsers can no longer
// write those two columns (migration jeere_wave2 revokes it); the badge « Fait avec Jeere » on her stores
// is decided from them by the database (stores.badge, trigger stores_badge).
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/studio-plan
//   headers: apikey: <publishable key>, Authorization: Bearer <her Supabase session>
//   body: { action: 'get' }                          → { ok, mode, plan, studio }
//         { action: 'trial' }                        → one 14-day trial per account, in every mode
//         { action: 'sync', demo: true, studio, plan } → demo mode only (see below)
//
// Billing mode (secret JEERE_BILLING_MODE, default 'demo'):
//   demo  there is no real payment yet (« Mode démo · aucun paiement réel »): the demo checkout of
//         plans.js still works — it sends the subscription it made with `demo: true` and the server keeps
//         it, cleaned and marked source: 'demo'. This is NOT a security boundary: anyone signed in can give
//         herself a plan, as before, but now only through this function, logged, and switchable.
//   live  set JEERE_BILLING_MODE=live once Paystack / Wave are connected: 'sync' is refused (403) and only
//         the payment webhook (to be written, service role) changes a plan. 'get' and 'trial' still work.
// Deployed with verify_jwt = false (the publishable key is not a JWT): the session is checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MODE = (Deno.env.get('JEERE_BILLING_MODE') ?? 'demo') === 'live' ? 'live' : 'demo';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const PLANS = ['decouverte', 'solo', 'pro', 'agence'];
const STORE_PLANS = ['gratuit', 'essentiel', 'pro', 'business'];
const METHODS = ['wave', 'orange', 'mtn', 'moov', 'card', ''];
const DAY = 86400000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const iso = (v: unknown, max?: number) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!isFinite(t)) return '';
  return new Date(max ? Math.min(t, max) : t).toISOString();
};

// The subscription the demo checkout made, cleaned (same fields as plans.js normalizeSub), bounded in time
function cleanStudio(s: unknown, prev: Record<string, unknown> | null) {
  const o = isObj(s) ? s : {};
  const now = Date.now();
  const plan = PLANS.includes(o.plan as string) ? o.plan as string : 'decouverte';
  let status = o.status === 'trial' || o.status === 'active' ? o.status as string : 'free';
  if (status === 'active' && plan === 'decouverte') status = 'free';
  // a trial is 14 days once: the server's trial end wins over the browser's
  const prevTrialEnd = prev && typeof prev.trialEndsAt === 'string' ? prev.trialEndsAt : '';
  const trialEndsAt = status === 'trial' ? (prevTrialEnd || iso(o.trialEndsAt, now + 14 * DAY + 60000)) : iso(o.trialEndsAt);
  const members = (Array.isArray(o.members) ? o.members : []).filter(isObj).slice(0, 30).map((m) => ({ id: str(m.id, 24), name: str(m.name, 40), phone: str(m.phone, 20), at: iso(m.at) }));
  const invoices = (Array.isArray(o.invoices) ? o.invoices : []).filter(isObj).slice(0, 60).map((v) => ({
    id: str(v.id, 24), date: iso(v.date), label: str(v.label, 80), plan: PLANS.includes(v.plan as string) ? v.plan : 'solo',
    period: v.period === 'an' ? 'an' : 'mois', amount: Math.max(0, Math.min(1e9, Math.round(Number(v.amount) || 0))),
    credit: Math.max(0, Math.min(1e9, Math.round(Number(v.credit) || 0))), method: METHODS.includes(v.method as string) ? v.method : '',
    status: str(v.status, 20) || 'payée', provider: 'demo', ref: str(v.ref, 60)
  }));
  const pending = isObj(o.pending) && PLANS.includes(o.pending.plan as string) ? { plan: o.pending.plan, period: o.pending.period === 'an' ? 'an' : 'mois' } : null;
  return {
    version: 1, plan, period: o.period === 'an' ? 'an' : 'mois', status,
    startedAt: iso(o.startedAt), periodEnd: iso(o.periodEnd, now + 400 * DAY),
    cancelAtPeriodEnd: o.cancelAtPeriodEnd === true, pending,
    trialUsed: o.trialUsed === true || status === 'trial' || !!(prev && prev.trialUsed === true),
    trialEndsAt, extraSeats: plan === 'agence' ? Math.max(0, Math.min(20, Math.round(Number(o.extraSeats) || 0))) : 0,
    members, invoices, method: METHODS.includes(o.method as string) ? o.method : '',
    hideBadge: o.hideBadge !== false, source: 'demo', syncedAt: new Date(now).toISOString()
  };
}

async function userOf(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && typeof u.id === 'string' ? { id: u.id } : null;
}
const admin = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init,
  headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) }
});
async function profile(id: string) {
  const r = await admin('profiles?select=plan,studio&id=eq.' + id);
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) && rows[0] ? rows[0] as { plan: string; studio: Record<string, unknown> | null } : null;
}
async function save(id: string, patch: Record<string, unknown>) {
  const r = await admin('profiles?id=eq.' + id + '&select=plan,studio', { method: 'PATCH', body: JSON.stringify(patch) });
  const rows = r.ok ? await r.json() : null;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  let body: Record<string, unknown> = {};
  try { const b = await req.json(); if (isObj(b)) body = b; } catch { /* empty */ }
  const user = await userOf(req);
  if (!user) return json({ ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere.' }, 401);
  const prof = await profile(user.id);
  if (!prof) return json({ ok: false, code: 'profile', message: 'Profil introuvable.' }, 404);
  const prev = isObj(prof.studio) ? prof.studio : null;
  const action = String(body.action ?? 'get');

  if (action === 'get') return json({ ok: true, mode: MODE, plan: prof.plan, studio: prev });

  if (action === 'trial') {
    if (prev && prev.trialUsed === true) return json({ ok: false, code: 'used', mode: MODE, plan: prof.plan, studio: prev, message: 'Votre essai gratuit a déjà été utilisé.' }, 409);
    const now = Date.now();
    const studio = { ...(prev ?? {}), version: 1, plan: 'decouverte', status: 'trial', trialUsed: true, trialEndsAt: new Date(now + 14 * DAY).toISOString(), hideBadge: prev ? prev.hideBadge !== false : true, source: 'trial' };
    const row = await save(user.id, { studio });
    return row ? json({ ok: true, mode: MODE, plan: row.plan, studio: row.studio }) : json({ ok: false, code: 'server' }, 500);
  }

  if (action === 'sync') {
    if (MODE === 'live' || body.demo !== true) {
      return json({ ok: false, code: 'live', mode: MODE, plan: prof.plan, studio: prev, message: 'Les formules changent seulement après un paiement confirmé.' }, 403);
    }
    const patch: Record<string, unknown> = {};
    if (body.studio !== undefined) {
      const studio = cleanStudio(body.studio, prev);
      if (JSON.stringify(studio).length > 50000) return json({ ok: false, code: 'size' }, 413);
      patch.studio = studio;
    }
    if (typeof body.plan === 'string' && STORE_PLANS.includes(body.plan)) patch.plan = body.plan;
    if (!Object.keys(patch).length) return json({ ok: true, mode: MODE, plan: prof.plan, studio: prev });
    const row = await save(user.id, patch);
    return row ? json({ ok: true, mode: MODE, plan: row.plan, studio: row.studio }) : json({ ok: false, code: 'server' }, 500);
  }

  return json({ ok: false, code: 'action' }, 400);
});
