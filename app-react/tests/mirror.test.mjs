// The mirror (src/lib/mirror.ts), end to end against the built app (localhost:3100), Supabase answered here (nothing real is read or written):
// the founder's own session stays in place; the mirror tab signs in as the client, shows her booking dashboard,
// refuses every write while read only, lets an admin switch editing on, and its « Quitter » forgets everything.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100', SHOTS = new URL('./shots/', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const CLIENT = { id: 'cccccccc-2222-4333-8444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'client@exemple.com', created_at: '2026-11-20T10:00:00Z', email_confirmed_at: '2026-11-20T10:00:00Z', user_metadata: { first_name: 'Lyse-Marie' }, app_metadata: { provider: 'email' } };
const tok = (u) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const FOUNDER_TOKEN = { access_token: 'founder-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'founder-r', user: { id: 'ffff', email: 'founder@exemple.com' } };
const STORE = { id: 'f854022e-d314-48a8-b228-1591377a2ea5', owner: CLIENT.id, slug: 'lyzma', published: true, published_at: '2026-11-25T00:35:36Z', custom_domain: null, domain_status: 'none', plan: 'business', plan_promo: 'concierge', updated_at: '2026-11-25T10:00:00Z', created_at: '2026-11-25T00:35:36Z',
  fiche: { version: 3, store: { name: 'La dame aux perles', currency: 'CAD' }, products: [], sections: [] } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await ctx.addInitScript((t) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('sb-aezchxfvzfoqlvzchqyk-auth-token', JSON.stringify(t)); localStorage.setItem('jeere-account', '{"founder":true}'); } }, FOUNDER_TOKEN);
const sent = [];   // every request that reached « Supabase »
const json = (r, s, body) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
await ctx.route('**/api/geo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pay: 'cad', show: 'CAD', rate: 1 }) }));
await ctx.route('https://kreeative.xyz/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1 style="font:40px sans-serif;color:#e60023">La dame aux perles</h1>' }));
await ctx.route('https://aezchxfvzfoqlvzchqyk.supabase.co/**', async (r) => {
  const q = r.request(); const u = new URL(q.url()); const m = q.method();
  if (m === 'OPTIONS') return json(r, 204);
  sent.push(m + ' ' + u.pathname + (u.pathname.startsWith('/functions/') ? ' ' + (q.postData() || '').slice(0, 40) : ''));
  if (u.pathname === '/auth/v1/verify') return json(r, 200, { access_token: tok(CLIENT), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'client-r', user: CLIENT });
  if (u.pathname === '/auth/v1/user') return json(r, 200, CLIENT);
  if (u.pathname.startsWith('/rest/v1/stores')) return json(r, 200, [STORE]);
  if (u.pathname.startsWith('/rest/v1/profiles')) return json(r, 200, m === 'GET' ? [{ id: CLIENT.id, first_name: 'Lyse-Marie', phone: '', store_name: 'La dame aux perles', plan: 'gratuit', created_at: CLIENT.created_at }] : []);
  if (u.pathname.startsWith('/rest/v1/rpc/my_stores')) return json(r, 200, [{ ...STORE, role: 'owner' }]);
  if (u.pathname.startsWith('/functions/v1/bookings')) return json(r, 200, { ok: true, appointments: [], blocks: [], pending: [], timezone: 'America/Moncton', today: '2026-11-25', now: new Date().toISOString(), settings: {}, configured: true, bookingUrl: '', store: { currency: 'CAD' }, clients: [], currency: 'CAD' });
  return json(r, 200, m === 'GET' ? [] : {});
});

const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/admin/#miroir=abcdefghijklmnop1234&m=client%40exemple.com&n=Lyse-Marie&e=1', { waitUntil: 'load' });
await p.waitForSelector('[aria-label="Miroir d’un compte"]', { timeout: 15000 });
await p.waitForTimeout(2500);
const url = p.url();
assert.ok(!url.includes('miroir='), 'the token leaves the address bar');
const nav = await p.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 8));
console.log('address:', url.replace(BASE, ''), '| menu:', nav.join(' · '));
assert.ok(nav.some((t) => /Rendez-vous/.test(t)), 'a booking business shows Rendez-vous');
const frame = await p.$$eval('iframe', (f) => f.map((x) => x.src));
console.log('preview:', frame.join(' '));
await p.screenshot({ path: SHOTS + 'mirror-desktop.png' });
// the founder's own keys are untouched; the mirror's live in this tab only
const other = await ctx.newPage(); await other.goto(BASE + '/a-propos/', { waitUntil: 'domcontentloaded' });
const keys = await other.evaluate(() => ({ founderToken: JSON.parse(localStorage.getItem('sb-aezchxfvzfoqlvzchqyk-auth-token') || '{}').access_token, account: localStorage.getItem('jeere-account'), mirrorKeysHere: Object.keys(sessionStorage).length }));
await other.close();
const mk = await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('jehre-mirror:')).length);
keys.mirrorTabKeys = mk;
console.log('founder storage:', JSON.stringify(keys));
assert.equal(keys.founderToken, 'founder-token', 'the founder stays signed in as herself');
assert.equal(keys.account, '{"founder":true}', 'her account copy is untouched');
// a write while read only: refused here, never sent
const before = sent.length;
const w = await p.evaluate(async () => { const r = await fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/stores?id=eq.x', { method: 'PATCH', body: '{}' }); return [r.status, (await r.json()).code]; });
console.log('write while read only:', w.join(' '), '| sent:', sent.length - before);
assert.equal(w[0], 403); assert.equal(sent.length, before);
const inv = sent.filter((s) => /accept_store_invites|logout|functions\/v1\/(atlas|push)/.test(s));
assert.equal(inv.length, 0, 'never: invites, logout, Atlas, push');
// editing switched on (an admin): writes go through, invitations still never
p.once('dialog', (d) => d.accept());
await p.click('[aria-label="Miroir d’un compte"] button:has-text("Modifier")');
await p.waitForTimeout(200);
const w2 = await p.evaluate(async () => (await fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/stores?id=eq.x', { method: 'PATCH', body: '{}' })).status);
const w3 = await p.evaluate(async () => (await fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/rpc/accept_store_invites', { method: 'POST', body: '{}' })).status);
console.log('editing on → write', w2, '| accept invites', w3);
assert.equal(w2, 200); assert.equal(w3, 403);
await p.screenshot({ path: SHOTS + 'mirror-edit.png', clip: { x: 340, y: 0, width: 600, height: 70 } });
// a phone
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ph.route('**/api/geo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"pay":"cad","show":"CAD","rate":1}' }));
await ph.route('https://kreeative.xyz/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1 style="font:28px sans-serif;color:#e60023">La dame aux perles</h1>' }));
await ph.route('https://aezchxfvzfoqlvzchqyk.supabase.co/**', async (r) => {
  const q = r.request(); const u = new URL(q.url()); const m = q.method();
  if (m === 'OPTIONS') return json(r, 204);
  if (u.pathname === '/auth/v1/verify') return json(r, 200, { access_token: tok(CLIENT), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'client-r', user: CLIENT });
  if (u.pathname === '/auth/v1/user') return json(r, 200, CLIENT);
  if (u.pathname.startsWith('/rest/v1/stores')) return json(r, 200, [STORE]);
  if (u.pathname.startsWith('/rest/v1/rpc/my_stores')) return json(r, 200, [{ ...STORE, role: 'owner' }]);
  return json(r, 200, m === 'GET' ? [] : {});
});
const pp = await ph.newPage();
await pp.goto(BASE + '/admin/#miroir=abcdefghijklmnop1234&m=client%40exemple.com&n=Lyse-Marie&e=0', { waitUntil: 'load' });
await pp.waitForSelector('[aria-label="Miroir d’un compte"]', { timeout: 15000 }); await pp.waitForTimeout(2500);
const hasEdit = await pp.$$eval('[aria-label="Miroir d’un compte"] button', (x) => x.map((y) => y.textContent.trim()));
console.log('support role buttons:', hasEdit.join(' · '));
assert.ok(!hasEdit.includes('Modifier'), 'no « Modifier » without the admin role');
await pp.screenshot({ path: SHOTS + 'mirror-phone.png' });
// « Quitter » forgets her session in this tab
await p.evaluate(() => { window.close = () => {}; });
await p.click('[aria-label="Miroir d’un compte"] button:has-text("Quitter")');
await p.waitForTimeout(400);
const left = await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('jehre-mirror')).length);
console.log('after Quitter, mirror keys left:', left);
assert.equal(left, 0);
console.log('errors', JSON.stringify(errs.slice(0, 4)));
await b.close();
console.log('mirror: all checks passed');
