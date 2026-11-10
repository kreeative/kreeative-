// Jeere — Edge Function `push` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk): Web Push notifications to the
// sellers' phones and computers (the Jeere dashboard installed as an app, or open in a browser).
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/push
//   body: { action: 'key' }                                   → { ok, publicKey }  the VAPID public key        anyone
//         { action: 'subscribe', subscription, device }       → { ok }  this device receives the notifications  signed in
//         { action: 'unsubscribe', endpoint }                 → { ok }                                           signed in
//         { action: 'test' }                                  → { ok, sent }  a test notification to my devices signed in
//         { action: 'notify', storeId, title, body, url, tag } → { ok, sent }  to the store's owner and team    the other
//                                                               Jeere functions only (header x-jeere-internal)
//
// The VAPID keys are made here the first time and kept in public.push_config (no access for anon or signed-in
// users): no secret to add by hand. Subscriptions live in public.push_subscriptions (migration jeere_push.sql).
// Deployed with verify_jwt = false: sessions and the internal header are checked here.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jeere.kreeative.xyz').replace(/\/$/, '');

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

/* ------------------------------------------------------------------ the VAPID keys (made once, kept server-side) */
let KEYS: { publicKey: string; privateKey: string } | null = null;
async function keys() {
  if (KEYS) return KEYS;
  const got = (await rows('push_config?select=public_key,private_key&id=eq.1'))[0];
  if (got && got.public_key && got.private_key) {
    KEYS = { publicKey: String(got.public_key), privateKey: String(got.private_key) };
  } else {
    const k = webpush.generateVAPIDKeys();
    // first writer wins (two cold starts at once): read back what is stored
    await admin('push_config', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, public_key: k.publicKey, private_key: k.privateKey }) });
    const again = (await rows('push_config?select=public_key,private_key&id=eq.1'))[0];
    if (!again) throw new Error('push_config');
    KEYS = { publicKey: String(again.public_key), privateKey: String(again.private_key) };
  }
  webpush.setVapidDetails(SITE, KEYS.publicKey, KEYS.privateKey);
  return KEYS;
}

/* ------------------------------------------------------------------ sending */
async function sendTo(userIds: string[], msg: Obj) {
  const ids = [...new Set(userIds.filter((x) => UUID.test(x)))];
  if (!ids.length) return 0;
  await keys();
  const subs = await rows('push_subscriptions?select=id,endpoint,p256dh,auth&user_id=in.(' + ids.join(',') + ')');
  const payload = JSON.stringify(msg);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = Number((e as { statusCode?: number }).statusCode);
      // the device dropped this subscription (app removed, permission withdrawn): forget it
      if (code === 404 || code === 410) await admin('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' });
    }
  }));
  if (sent) await admin('push_subscriptions?user_id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
  return sent;
}

/* ------------------------------------------------------------------ the handler */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (isObj(x)) b = x; } catch { /* empty */ }
  const action = String(b.action ?? '');

  try {
    if (action === 'key') return json({ ok: true, publicKey: (await keys()).publicKey });

    // from the other Jeere functions (orders, payments): the store's owner and team
    if (action === 'notify') {
      if (req.headers.get('x-jeere-internal') !== SECRET) return json({ ok: false, code: 'forbidden' }, 403);
      const sid = str(b.storeId, 40);
      if (!UUID.test(sid)) return json({ ok: false, code: 'store' }, 400);
      const st = (await rows('stores?select=id,owner&id=eq.' + sid))[0];
      if (!st) return json({ ok: false, code: 'store' }, 404);
      const team = await rows('store_members?select=user_id&store_id=eq.' + sid);
      const url = str(b.url, 300);
      const sent = await sendTo([String(st.owner ?? ''), ...team.map((m) => String(m.user_id ?? ''))], {
        title: str(b.title, 80) || 'Nouvelle activité', body: str(b.body, 200), tag: str(b.tag, 60) || undefined,
        url: url.startsWith('/') ? url : '/admin/'
      });
      return json({ ok: true, sent });
    }

    const user = await userOf(req);
    if (!user) return json({ ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere.' }, 401);

    if (action === 'subscribe') {
      const s = isObj(b.subscription) ? b.subscription : {};
      const k = isObj(s.keys) ? s.keys : {};
      const endpoint = str(s.endpoint, 800), p256dh = str(k.p256dh, 200), auth = str(k.auth, 100);
      if (!/^https:\/\/[^\s]+$/.test(endpoint) || !p256dh || !auth) return json({ ok: false, code: 'subscription', message: 'Abonnement invalide.' }, 400);
      const r = await admin('push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: user.id, endpoint, p256dh, auth, device: str(b.device, 120), created_at: new Date().toISOString() }) });
      return r.ok ? json({ ok: true }) : json({ ok: false, code: 'server', message: 'L’appareil n’a pas pu être enregistré.' }, 500);
    }

    if (action === 'unsubscribe') {
      const endpoint = str(b.endpoint, 800);
      if (endpoint) await admin('push_subscriptions?user_id=eq.' + user.id + '&endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' });
      return json({ ok: true });
    }

    if (action === 'test') {
      const sent = await sendTo([user.id], { title: 'Notifications activées', body: 'Vous serez prévenue à chaque nouvelle commande et à chaque paiement par carte.', tag: 'test', url: '/admin/' });
      return json({ ok: true, sent, message: sent ? 'Notification envoyée.' : 'Aucun appareil n’est inscrit pour ce compte.' });
    }
  } catch (e) {
    return json({ ok: false, code: 'server', message: 'Les notifications ne sont pas encore prêtes (migration jeere_push).', detail: String((e as Error).message ?? e).slice(0, 120) }, 503);
  }

  return json({ ok: false, code: 'action' }, 400);
});
