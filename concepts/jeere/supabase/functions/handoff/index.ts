// Jehre — Edge Function `handoff` (Supabase project « Jehre », ref aezchxfvzfoqlvzchqyk): carries a session from
// Safari to the app added to the home screen. On an iPhone the two keep separate storage, so the installed app
// would start signed out. The page puts a one-time pass in the address the icon opens; the app redeems it once.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/handoff
//   body: { action: 'create' }          (Authorization: Bearer <her session>) → { ok, code }   20 minutes, one use
//         { action: 'redeem', code }    → { ok, tokenHash }  a one-time sign-in token for supabase-js verifyOtp
// Only the SHA-256 of a pass is stored (public.session_handoffs). A pass is 32 random bytes; 6 live passes per
// account at most. Deployed with verify_jwt = false: the session is checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TTL_MIN = 20;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
type Obj = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const db = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});
const hex = (buf: ArrayBuffer | Uint8Array) => Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }
  const now = new Date();

  if (b.action === 'create') {
    const auth = req.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+/.test(auth) || auth.includes(PUBLISHABLE)) return json({ ok: false, code: 'login' }, 401);
    const ur = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: auth } });
    const u = ur.ok ? await ur.json() : null;
    if (!u || typeof u.id !== 'string') return json({ ok: false, code: 'login' }, 401);
    if (!u.email) return json({ ok: false, code: 'no_email' }, 409); // a phone-only account signs in again in the app
    // a few live passes per account, the old ones swept
    await db('session_handoffs?expires_at=lt.' + encodeURIComponent(new Date(now.getTime() - 86400000).toISOString()), { method: 'DELETE' });
    const live = await db('session_handoffs?select=code_hash&user_id=eq.' + u.id + '&used_at=is.null&expires_at=gt.' + encodeURIComponent(now.toISOString())).then((r) => (r.ok ? r.json() : [])) as Obj[];
    if (live.length >= 6) return json({ ok: false, code: 'rate' }, 429);
    const code = hex(crypto.getRandomValues(new Uint8Array(32)));
    const ins = await db('session_handoffs', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ code_hash: await sha(code), user_id: u.id, expires_at: new Date(now.getTime() + TTL_MIN * 60000).toISOString() }) });
    if (!ins.ok) return json({ ok: false, code: 'server' }, 500);
    return json({ ok: true, code, minutes: TTL_MIN });
  }

  if (b.action === 'redeem') {
    const code = typeof b.code === 'string' ? b.code : '';
    if (!/^[0-9a-f]{64}$/.test(code)) return json({ ok: false, code: 'invalid' }, 400);
    // one use: marked used in the same request that reads it
    const upd = await db('session_handoffs?code_hash=eq.' + (await sha(code)) + '&used_at=is.null&expires_at=gt.' + encodeURIComponent(now.toISOString()), {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_at: now.toISOString() }) });
    const rows = upd.ok ? await upd.json() as Obj[] : [];
    if (!rows.length) return json({ ok: false, code: 'expired' }, 410);
    const ur = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + rows[0].user_id, { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } });
    const u = ur.ok ? await ur.json() : null;
    if (!u || !u.email) return json({ ok: false, code: 'user' }, 404);
    const gl = await fetch(SUPABASE_URL + '/auth/v1/admin/generate_link', { method: 'POST',
      headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: u.email }) });
    const link = gl.ok ? await gl.json() : null;
    const tokenHash = link && (link.hashed_token || (link.properties && link.properties.hashed_token));
    if (!tokenHash) return json({ ok: false, code: 'server' }, 500);
    return json({ ok: true, tokenHash });
  }

  return json({ ok: false, code: 'action' }, 400);
});
