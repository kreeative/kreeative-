// End-to-end checks of the dashboard (home, orders, products), in a real browser, against the built app.
// Supabase is answered by this file: nothing is read from or written to the real database.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const CONNECT = (await import('node:fs')).readFileSync(new URL('../../concepts/jeere/connect/jeere-connect.js', import.meta.url), 'utf8');
mkdirSync(SHOTS, { recursive: true });

const USER = { id: '11111111-2222-4333-8444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'kady@exemple.com', created_at: '2026-11-01T10:00:00Z', email_confirmed_at: '2026-11-01T10:00:00Z', user_metadata: { first_name: 'Kady', has_password: true }, app_metadata: {} };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = () => ({ access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: USER });
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const store = () => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'boutique-test', published: true, published_at: ago(200), custom_domain: null, domain_status: 'none', plan: 'essentiel', updated_at: '2026-11-22T10:00:00.000Z', owner: USER.id,
  fiche: { version: 3, template: 'douce', theme: { accent: '#C2410C' }, sections: [{ id: 's1', type: 'hero' }, { id: 's7', type: 'delivery', enabled: true, settings: { title: 'Nos frais de livraison', text: 'Texte.', zones: [{ name: 'Cocody', fee: 1500 }, { name: 'Abobo', fee: 2500 }] } }], payments: { wave: true, orange: false, cod: true }, store: { name: 'Boutique Test', city: 'Abidjan', whatsapp: '+2250707123456' },
    products: [
      { id: 'p1', name: 'Beurre de karité brut', price: 6500, category: 'Corps', description: 'Pot de 250 g.', badge: 'best', art: 'jar', color: '#EFEEE5', image: null, photo: null },
      { id: 'p2', name: 'Savon noir au karité', price: 3000, category: 'Corps', description: '', badge: '', art: 'soap', color: '#DDD', image: null, photo: null },
      { id: 'p3', name: 'Huile de coco vierge', price: 4500, category: 'Cheveux', description: '', badge: 'new', art: 'bottle', color: '#EEE', image: null, photo: null },
    ] },
});
const orders = (sid) => [
  { id: 'o3', store_id: sid, number: 3, status: 'nouvelle', customer: { name: 'Mariam K.', phone: '+225 07 08 09 10 11', commune: 'Cocody', address: 'Riviera 2' }, lines: [{ id: 'p1', name: 'Beurre de karité brut', qty: 2, price: 6500, amount: 13000 }], subtotal: 13000, delivery_fee: 1500, total: 14500, currency: 'XOF', payment: 'Wave', payment_status: '', note: 'Livrer après 17 h.', source: 'boutique', created_at: new Date(Math.max(new Date().setHours(0, 0, 0, 0), Date.now() - 2 * 36e5)).toISOString() },
  { id: 'o2', store_id: sid, number: 2, status: 'confirmee', customer: { name: 'Fatou D.', phone: '+2250101020304', commune: 'Marcory' }, lines: [{ id: 'p3', name: 'Huile de coco vierge', qty: 1, price: 4500, amount: 4500 }], subtotal: 4500, delivery_fee: 1000, total: 5500, currency: 'XOF', payment: 'Orange Money', payment_status: 'payee', note: null, source: 'boutique', created_at: ago(30) },
  { id: 'o1', store_id: sid, number: 1, status: 'livree', customer: { name: 'Grâce A.' }, lines: [{ id: 'p2', name: 'Savon noir au karité', qty: 3, price: 3000, amount: 9000 }], subtotal: 9000, delivery_fee: 0, total: 9000, currency: 'XOF', payment: 'Carte bancaire', payment_status: 'payee', note: null, source: 'boutique', created_at: ago(24 * 9) },
];

async function open(browser, viewport, world, { logged = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  if (logged) await ctx.addInitScript((s) => { window.localStorage.setItem('sb-aezchxfvzfoqlvzchqyk-auth-token', JSON.stringify(s)); }, session());
  // the guided visit of the editor has its own test: elsewhere she has already seen it
  if (!world.firstVisit) await ctx.addInitScript(() => { window.localStorage.setItem('jehre-editor-tour', '1'); });
  // the payments guide too (its own test shows it the first time)
  if (!world.payGuide) await ctx.addInitScript(() => { window.localStorage.setItem('jeere-pay-guide-seen', '1'); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  // Stripe's embedded forms: a stand-in that draws a recognisable block (no request leaves for Stripe)
  await ctx.route('https://connect-js.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.StripeConnect = { init: (o) => ({ create: (name) => { const d = document.createElement('div'); d.setAttribute('data-stripe', name); d.textContent = 'Formulaire sécurisé Stripe : ' + name; d.style.cssText = 'padding:24px;border-radius:12px;background:#f6f6f6;font:500 14px Poppins'; d.setOnExit = (f) => { window.__stripeExit = f; }; return d; } }) };` }));
  // her country's money (jehre.com/api/geo): the franc CFA unless the test says otherwise (never the real one)
  await ctx.route('**/api/geo', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world.zone ?? { pay: 'xof', show: 'XOF', rate: 1 }) }));
  await ctx.route('**/connect/jeere-connect.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: CONNECT }));
  await ctx.route('https://www.theivorysukundu.com/api/admin', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return json(route, 204);
    const b = JSON.parse(req.postData() ?? '{}'); const T = world.tishe;
    (world.tisheCalls ??= []).push(b);
    if (!T) return json(route, 404, { error: 'Not found' });
    if (b.action === 'jeere') return T.noJehre ? json(route, 403, { error: 'No access' }) : json(route, 200, { token: 'tx-session', expiresAt: Date.now() + 864e5, email: 'hello@theivorysukundu.com' });
    if (b.action === 'link') return json(route, 200, { ok: true });
    if ((req.headers().authorization ?? '') !== 'Bearer tx-session') return json(route, 401, { error: 'Please sign in again.' });
    if (b.action === 'overview') return json(route, 200, { stats: { todo: { toOrder: T.orders.filter((o) => o.status === 'new').length, awaitingTracking: T.orders.filter((o) => o.status === 'ordered').length } }, setup: { stripe: true, webhook: true, resend: true }, orders: T.orders });
    if (b.action === 'legacyOrders') return json(route, 200, { orders: [] });
    T.doc ??= { products: [
      { id: 'gid1', handle: 'kente-wave', title: 'Kente Wave Wig', supplier: 'nine', hidden: false, descriptionHtml: '<p>Soft body wave.</p>', media: [], featuredImage: null, options: [{ name: 'Length' }], variants: [{ id: 'v1', selectedOptions: [{ name: 'Length', value: '18"' }], price: { CAD: 320, USD: 235 }, compareAtPrice: null, availableForSale: true }] },
      { id: 'gid2', handle: 'ivory-straight', title: 'Ivory Straight', supplier: 'evelyn', hidden: true, descriptionHtml: '', media: [], featuredImage: null, options: [{ name: 'Length' }], variants: [{ id: 'v2', selectedOptions: [{ name: 'Length', value: '22"' }], price: { CAD: 410, USD: 300 }, compareAtPrice: null, availableForSale: true }] },
    ], discounts: [{ code: 'CIRCLE10', kind: 'percent', percent: 10, active: true, label: '10% off' }], site: { announcements: ['Free shipping over $250'], sale: null },
      shipping: { zones: [{ id: 'ca', label: 'Canada', currency: 'CAD', rate: 15, countries: ['CA'] }, { id: 'us', label: 'États-Unis', currency: 'USD', rate: 20, countries: ['US'] }] } };
    const doc = () => ({ doc: T.doc });
    if (b.action === 'store') return json(route, 200, { ...doc(), usage: { CIRCLE10: 4 } });
    if (b.action === 'saveProduct') { const i = T.doc.products.findIndex((x) => x.id === b.product.id); const np = { ...b.product, handle: b.product.id ? T.doc.products[i].handle : 'new-' + T.doc.products.length, id: b.product.id || 'gid' + (T.doc.products.length + 1) }; if (i >= 0) T.doc.products[i] = np; else T.doc.products.push(np); return json(route, 200, doc()); }
    if (b.action === 'moveProduct') { const i = T.doc.products.findIndex((x) => x.id === b.id), j = b.direction === 'up' ? i - 1 : i + 1; const [x] = T.doc.products.splice(i, 1); T.doc.products.splice(j, 0, x); return json(route, 200, doc()); }
    if (b.action === 'deleteProduct') { T.doc.products = T.doc.products.filter((x) => x.id !== b.id); return json(route, 200, doc()); }
    if (b.action === 'upload') return json(route, 200, { url: 'https://cdn.example/full.jpg', thumb: 'https://cdn.example/thumb.jpg' });
    if (b.action === 'saveCode') { T.doc.discounts = [...T.doc.discounts.filter((x) => x.code !== b.previousCode && x.code !== b.rule.code), b.rule]; return json(route, 200, doc()); }
    if (b.action === 'deleteCode') { T.doc.discounts = T.doc.discounts.filter((x) => x.code !== b.code); return json(route, 200, doc()); }
    if (b.action === 'saveSite') { T.doc.site = { announcements: b.announcements, sale: b.sale }; return json(route, 200, doc()); }
    if (b.action === 'saveShipping') { T.doc.shipping.zones = T.doc.shipping.zones.map((z) => ({ ...z, rate: b.rates[z.id] ?? z.rate })); return json(route, 200, doc()); }
    if (b.action === 'customers') return json(route, 200, { customers: [{ name: 'Ama K.', email: 'ama@exemple.com', country: 'CA', orders: 2, spent: 505, last: new Date().toISOString() }] });
    if (b.action === 'subscribers') return json(route, 200, { subscribers: [{ email: 'circle@exemple.com', firstName: 'Efua', createdAt: new Date().toISOString() }] });
    const o = T.orders.find((x) => x.id === b.id);
    const full = () => ({ ...o, subtotal: o.total - 1500, shippingAmount: 1500, items: [{ title: 'Robe Kente', variant: 'M', quantity: 1, unitAmount: o.total - 1500, total: o.total - 1500 }], timeline: [{ title: 'Commande payée', at: o.createdAt }], paid: true });
    if (b.action === 'order') return json(route, 200, { order: full(), supplierMessages: [{ name: 'Atelier Accra', message: 'Hello, please make 1 Kente dress size M.' }] });
    if (b.action === 'update') { Object.assign(o, { status: b.tracking ? 'shipped' : b.status ?? o.status, supplierRef: b.supplierRef, carrier: b.carrier, trackingNumbers: b.tracking ? [b.tracking] : [] }); return json(route, 200, { order: full(), notified: !!(b.notify && b.tracking) }); }
    if (b.action === 'refund') { Object.assign(o, { refunded: !b.amount, refundedAmount: b.amount ?? o.total }); return json(route, 200, { order: full(), notified: b.notify }); }
    if (b.action === 'email') return json(route, 200, { ok: true });
    return json(route, 400, { error: 'Unknown action' });
  });
  await page.route('https://aezchxfvzfoqlvzchqyk.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return json(route, 204);
    const body = (() => { try { return JSON.parse(req.postData() ?? '{}'); } catch { return {}; } })();
    world.calls.push({ method, path: url.pathname, query: url.search, body });
    const p = url.pathname;
    if (p === '/auth/v1/user') return json(route, 200, USER);
    if (p === '/auth/v1/logout') return json(route, 204);
    if (p === '/rest/v1/profiles') return method === 'GET' ? json(route, 200, (req.headers().accept ?? '').includes('vnd.pgrst.object') ? world.profile : [world.profile]) : json(route, 204);
    if (p === '/rest/v1/rpc/accept_store_invites') return json(route, 200, []);
    if (p === '/auth/v1/otp') return json(route, 200, {});
    if (p === '/auth/v1/verify') { if (body.token !== '123456') return json(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); if (world.atlas) world.atlas.state = 'in'; return json(route, 200, session()); }
    if (p === '/functions/v1/atlas') {
      const A = world.atlas;
      if (!A || A.state === 'denied') return json(route, 403, { ok: false, code: 'denied', message: 'Cet espace est réservé à l’équipe Jehre.' });
      if (A.state === 'code') return json(route, 403, { ok: false, code: 'code', message: 'Confirmez avec le code reçu par e-mail.', email: USER.email });
      const RK = { fondatrice: 4, admin: 3, support: 2, lecture: 1 };
      const need = { suspend: 'admin', plan: 'admin', interac: 'admin', reset: 'support', mail_list: 'support', mail_get: 'support', mail_send: 'support', admin_set: 'fondatrice' }[body.action];
      if (need && RK[A.role] < RK[need]) return json(route, 403, { ok: false, code: 'role', message: 'Votre rôle ne permet pas cette action.' });
      if (body.action === 'me') return json(route, 200, { ok: true, role: A.role, email: USER.email });
      if (body.action === 'overview') return json(route, 200, { ok: true, accounts: A.accounts.length, newWeek: 1, verified: 2, stores: 2, published: 1, paying: 1, byPlan: { croissance: 1 }, suspended: A.accounts.filter((a) => a.suspended).length, purchases: 1, purchasesAmount: 25000 });
      if (body.action === 'accounts') return json(route, 200, { ok: true, accounts: A.accounts });
      if (body.action === 'suspend') { const a = A.accounts.find((x) => x.id === body.userId); a.suspended = body.on; a.stores.forEach((st) => { st.published = !body.on; }); return json(route, 200, { ok: true }); }
      if (body.action === 'plan') { A.accounts.flatMap((a) => a.stores).find((x) => x.id === body.storeId).plan = body.plan; return json(route, 200, { ok: true }); }
      if (body.action === 'reset') return json(route, 200, { ok: true });
      if (body.action === 'mail_list') return json(route, 200, { ok: true, more: false, mails: [
        { id: 'm1', from: 'Awa Koné <awa@exemple.com>', to: ['contact@jehre.com'], subject: 'Question sur ma boutique', at: new Date().toISOString(), read: false },
        { id: 'm2', from: 'Interac <catch@payments.interac.ca>', to: ['bonjour@jehre.com'], subject: 'Autodeposit', at: ago(30), read: true }] });
      if (body.action === 'mail_get') return json(route, 200, { ok: true, mail: { id: body.id, from: 'Awa Koné <awa@exemple.com>', to: ['contact@jehre.com'], cc: [], replyTo: [], subject: 'Question sur ma boutique', at: new Date().toISOString(), text: 'Bonjour, comment ajouter un produit ?', html: '<p>Bonjour, comment <b>ajouter un produit</b> ?</p>', messageId: '<abc@mail>', files: [{ name: 'capture.png', url: 'https://example.com/capture.png', size: 20480 }] } });
      if (body.action === 'mail_send') { (A.sent ??= []).push(body); return json(route, 200, { ok: true }); }
      if (body.action === 'interac') { (A.interac ??= []).push(body); A.accounts.find((x) => x.id === body.userId).purchases.push({ model: body.model, amount: Math.round(body.amount * 100), currency: 'cad', method: 'interac', at: new Date().toISOString(), install: false }); return json(route, 200, { ok: true }); }
      if (body.action === 'admins') return json(route, 200, { ok: true, admins: A.admins });
      if (body.action === 'admin_set') { A.admins = A.admins.filter((x) => x.email !== body.email); if (body.role) A.admins.push({ email: body.email, role: body.role, added_by: USER.email, added_at: new Date().toISOString() }); return json(route, 200, { ok: true }); }
      if (body.action === 'log') return json(route, 200, { ok: true, log: [{ at: new Date().toISOString(), actor: USER.email, action: 'suspendre', target: 'awa@exemple.com', detail: {} }] });
      if (body.action === 'live') return json(route, 200, { ok: true, now: 3, today: 41, week: 260, countries: [{ country: 'SN', n: 2 }, { country: 'CI', n: 1 }], points: [{ lat: 14.7, lon: -17.45, city: 'Dakar', country: 'SN', at: new Date().toISOString(), path: '/', live: true }, { lat: 5.35, lon: -4.0, city: 'Abidjan', country: 'CI', at: new Date(Date.now() - 36e5).toISOString(), path: '/modeles/' }] });
      return json(route, 400, { ok: false, message: 'Action inconnue.' });
    }
    if (p === '/functions/v1/sites-publish') return json(route, 200, { ok: true, editor: !!world.founder });
    if (p === '/rest/v1/rpc/my_ext_stores') return json(route, 200, world.extStores ?? []);
    if (p === '/rest/v1/rpc/site_visits_live') { (world.siteLive ??= []).push(body); return json(route, 200, { ok: true, now: 2, today: 14, week: 61, points: [{ lat: 45.5, lon: -73.6, city: 'Montréal', country: 'Canada', at: new Date().toISOString(), live: true }, { lat: 5.3, lon: -4.0, city: 'Abidjan', country: 'Côte d’Ivoire', at: new Date().toISOString(), live: false }] }); }
    if (p === '/rest/v1/rpc/my_models') { if (world.modelsLate > 0) { world.modelsLate--; return json(route, 200, []); } return json(route, 200, world.models ?? []); }
    if (p === '/rest/v1/rpc/my_stores') return json(route, 200, world.stores.map((x) => ({ id: x.id, slug: x.slug })));
    if (p === '/rest/v1/rpc/slug_available') return json(route, 200, { available: !(world.taken ?? []).includes(body.p_slug), reason: 'ok' });
    if (p === '/rest/v1/store_promos') {
      world.promos ??= [];
      if (method === 'GET') return json(route, 200, world.promos);
      if (method === 'POST') { if (world.promos.some((x) => x.code === body.code)) return json(route, 409, { code: '23505', message: 'duplicate' }); world.promos.unshift({ id: 'promo-' + (world.promos.length + 1), uses: 0, active: true, ...body }); return json(route, 201, []); }
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      if (method === 'PATCH') { world.promos = world.promos.map((x) => (x.id === id ? { ...x, ...body } : x)); return json(route, 204); }
      if (method === 'DELETE') { world.promos = world.promos.filter((x) => x.id !== id); return json(route, 204); }
    }
    if (p === '/rest/v1/abandoned_carts') {
      world.carts ??= [];
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      if (method === 'PATCH') { world.carts = world.carts.map((x) => (x.id === id ? { ...x, ...body } : x)); return json(route, 204); }
      return json(route, 200, world.carts.filter((x) => !x.recovered_at));
    }
    if (p === '/rest/v1/install_requests') { if (method === 'POST') { const row = { ...body, id: 'cccccccc-0000-4000-8000-00000000000' + ((world.installs ??= []).length + 1) }; world.installs.push(row); return json(route, 201, [{ id: row.id }]); } return json(route, 200, world.installs ?? []); }
    if (p === '/functions/v1/billing') {
      if (body.action === 'sync') { if (world.planAfter) Object.assign(world.stores[0], world.planAfter, { updated_at: new Date().toISOString() }); return json(route, 200, { ok: true, applied: world.planAfter ? 1 : 0 }); }
      return json(route, 200, world.billing ?? { ok: false, message: 'Paiement simulé : rien n’est prélevé.' });
    }
    if (p === '/functions/v1/domains') {
      const st = world.stores.find((x) => x.id === body.storeId);
      const recs = (d) => [{ type: 'A', name: '@', value: '76.76.21.21', host: d }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', host: 'www.' + d }];
      if (body.action === 'search') return json(route, 200, { ok: true, configured: true, label: body.name, results: [{ domain: body.name + '.com', available: true, purchaseFcfa: 12500, renewalFcfa: 14000 }, { domain: body.name + '.shop', available: false, purchaseFcfa: null, renewalFcfa: null }, { domain: body.name + '.store', available: true, purchaseFcfa: 4500, renewalFcfa: 38000 }] });
      if (!st) return json(route, 403, { ok: false, message: 'Cette boutique n’est pas à vous.' });
      if (body.action === 'attach') { if (body.domain === 'pris.com') return json(route, 409, { ok: false, code: 'taken', message: 'Ce domaine est déjà relié à une autre boutique Jehre. Si c’est le vôtre, écrivez-nous sur WhatsApp.' }); Object.assign(st, { custom_domain: body.domain, domain_status: 'attached', updated_at: new Date().toISOString() }); return json(route, 200, { ok: true, configured: true, domain: body.domain, status: 'attached', records: recs(body.domain) }); }
      if (body.action === 'verify') { const status = world.dnsReady ? 'verified' : 'attached'; Object.assign(st, { domain_status: status, updated_at: new Date().toISOString() }); return json(route, 200, { ok: true, configured: true, domain: st.custom_domain, status, records: recs(st.custom_domain) }); }
      if (body.action === 'detach') { Object.assign(st, { custom_domain: null, domain_status: 'none', updated_at: new Date().toISOString() }); return json(route, 200, { ok: true, configured: true }); }
      return json(route, 400, { ok: false });
    }
    if (p === '/functions/v1/appel') return json(route, 200, { ok: true });
    if (p === '/functions/v1/payments') {
      const C = world.card ?? (world.card = { ok: true, configured: true, connected: false, chargesEnabled: false, detailsSubmitted: false, country: '' });
      if (!world.stores.some((x) => x.id === body.storeId)) return json(route, 403, { ok: false, code: 'forbidden' });
      if (body.action === 'status') return json(route, 200, C);
      if (body.action === 'session') { C.connected = true; C.country = body.country || C.country; return json(route, 200, { ok: true, clientSecret: 'cs_test', publishableKey: 'pk_test', accountId: 'acct_test' }); }
      return json(route, 200, { ok: true, url: 'https://connect.stripe.com/test' });
    }
    if (p === '/functions/v1/bookings') {
      const B = world.booking ?? (world.booking = { settings: bookingSettings(), appts: [] });
      const mine = world.stores.some((x) => x.id === body.storeId) || B.appts.some((a) => a.id === body.id) || (B.blocks ?? []).some((x) => x.id === body.id);
      if (!mine) return json(route, 403, { ok: false, message: 'Cette boutique n’est pas à vous.' });
      if (body.action === 'settings') return json(route, 200, { ok: true, settings: B.settings, configured: B.settings.services.length > 0, store: { id: body.storeId, slug: 'boutique-test', currency: 'XOF' }, bookingUrl: 'https://jehre.com/rdv/?b=boutique-test', payments: ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Sur place', 'Carte bancaire'] });
      if (body.action === 'save') { let n = 0; B.settings = { ...body.settings, services: body.settings.services.map((x) => ({ ...x, id: x.id || `s${++n + 10}` })) }; return json(route, 200, { ok: true, settings: B.settings }); }
      if (body.action === 'list') return json(route, 200, { ok: true, appointments: B.appts, blocks: B.blocks ?? [], pending: B.appts.filter((a) => a.status === 'en_attente'), timezone: 'Africa/Abidjan', today: new Date().toISOString().slice(0, 10) });
      if (body.action === 'clients') return json(route, 200, { ok: true, currency: 'XOF', clients: [{ name: 'Mariam K.', phone: '+225 07 08 09 10 11', email: '', visits: 4, upcoming: 1, noShows: 0, cancelled: 0, spent: 80000, last: '', next: '', lastService: 'Pose classique' }, { name: 'Fatou D.', phone: '', email: 'fatou@exemple.com', visits: 1, upcoming: 0, noShows: 1, cancelled: 0, spent: 15000, last: '', next: '', lastService: 'Rehaussement' }] });
      if (body.action === 'create') {
        const sv = B.settings.services.find((x) => x.id === body.serviceId);
        if (B.appts.some((x) => x.starts_at === body.start && x.status !== 'annule')) return json(route, 409, { ok: false, message: 'Ce créneau est déjà occupé (un autre rendez-vous ou un blocage).' });
        const n = { id: `new${B.appts.length}`, number: 20 + B.appts.length, status: 'confirme', starts_at: body.start, ends_at: new Date(Date.parse(body.start) + sv.duration * 60000).toISOString(), service: { name: sv.name, duration: sv.duration, price: sv.price }, customer: body.customer, total: sv.price, deposit: 0, deposit_status: '', currency: 'XOF', memo: body.note, source: 'manuel' };
        B.appts.push(n); return json(route, 200, { ok: true, appointment: n });
      }
      if (body.action === 'block') { const bl = { id: `bl${(B.blocks ?? []).length + 1}`, staff_id: '', starts_at: body.from, ends_at: body.to, reason: body.reason }; B.blocks = [...(B.blocks ?? []), bl]; return json(route, 200, { ok: true, block: bl }); }
      if (body.action === 'unblock') { B.blocks = (B.blocks ?? []).filter((x) => x.id !== body.id); return json(route, 200, { ok: true }); }
      const a = B.appts.find((x) => x.id === body.id);
      if (body.action === 'move') { if (B.appts.some((x) => x.id !== a.id && x.starts_at === body.start && x.status !== 'annule')) return json(route, 409, { ok: false, message: 'Ce créneau est déjà occupé.' }); a.starts_at = body.start; a.ends_at = new Date(Date.parse(body.start) + 90 * 60000).toISOString(); return json(route, 200, { ok: true, appointment: a }); }
      if (body.action === 'memo') { a.memo = body.memo; return json(route, 200, { ok: true, appointment: a }); }
      if (body.action === 'status') { if (world.bookingFails) return json(route, 409, { ok: false, message: 'Ce créneau a été repris par un autre rendez-vous.' }); a.status = body.status; return json(route, 200, { ok: true, appointment: a }); }
      if (body.action === 'deposit') { a.deposit_status = body.depositStatus; return json(route, 200, { ok: true, appointment: a }); }
      return json(route, 400, { ok: false });
    }
    if (p === '/rest/v1/rpc/store_team') return json(route, 200, world.team ?? []);
    if (p === '/rest/v1/rpc/store_visits_live') return json(route, 200, world.live ?? { ok: false, reason: 'plan' });
    if (p === '/rest/v1/store_invites') {
      world.invites ??= [];
      if (method === 'GET') return json(route, 200, world.invites);
      if (method === 'POST') { const inv = { id: `inv${world.invites.length + 1}`, email: body.email, mode: body.mode, store_id: body.store_id, created_at: new Date().toISOString() }; world.invites.unshift(inv); return json(route, 201, [inv]); }
      if (method === 'DELETE') { world.invites = world.invites.filter((x) => !url.search.includes(`id=eq.${x.id}`)); return json(route, 204); }
    }
    if (p === '/rest/v1/store_members') {
      if (method === 'DELETE') { world.team = (world.team ?? []).filter((x) => !url.search.includes(`user_id=eq.${x.user_id}`)); return json(route, 204); }
      return json(route, 200, []);
    }
    // her uploaded photos, shown back (a colour per file) so the captures show real pictures
    if (p.startsWith('/storage/v1/object/public/store-media/')) { const c = ['#E8467C', '#1E9BE0', '#22C97E', '#F0C414', '#6A4CFF'][[...p].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 5]; return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${c}"/></svg>` }); }
    if (p.startsWith('/storage/v1/object/store-media/')) { world.uploads.push(p.replace('/storage/v1/object/store-media/', '')); return json(route, 200, { Key: p }); }
    if (p === '/rest/v1/stores') {
      // the dashboard must ask for HER stores only: a query without the owner filter would return every public store
      if (method === 'GET' && /owner=/.test(url.search)) return json(route, 403, { code: '42501', message: 'permission denied for table stores' });   // as the real database answers
      if (method === 'GET') { if (!/id=in\./.test(url.search)) return json(route, 200, [{ id: 'someone-else', slug: 'autre', fiche: {}, published: true }]); return json(route, 200, world.stores); }
      if (method === 'POST') { const row = { id: `bbbbbbbb-0000-4000-8000-00000000000${world.stores.length + 1}`, owner: USER.id, published: false, published_at: null, custom_domain: null, domain_status: 'none', plan: 'gratuit', updated_at: new Date().toISOString(), ...body }; world.stores.push(row); return json(route, 201, [row]); }
      if (method === 'PATCH') {
        const s = world.stores.find((x) => url.search.includes(`id=eq.${x.id}`));
        const guard = /updated_at=eq\.([^&]+)/.exec(url.search);
        if (!s || world.conflict || (guard && decodeURIComponent(guard[1]) !== s.updated_at)) return json(route, 200, []);
        Object.assign(s, body, { updated_at: new Date().toISOString() });
        return json(route, 200, [s]);
      }
    }
    if (p === '/rest/v1/orders') {
      if (method === 'HEAD') { const n = world.monthOrders ?? world.orders.length; return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-range': n ? `0-${n - 1}/${n}` : '*/0' }, body: '' }); }
      if (method === 'GET') return json(route, 200, world.orders);
      if (method === 'PATCH') { const o = world.orders.find((x) => url.search.includes(`id=eq.${x.id}`)); if (!o) return json(route, 200, []); Object.assign(o, body); return json(route, 200, [{ id: o.id }]); }
    }
    return json(route, 404, { message: 'not mocked' });
  });
  return { ctx, page, errors };
}
const bookingSettings = (services = []) => ({ enabled: true, timezone: 'Africa/Abidjan', step: 30, buffer: 0, lead: 120, horizon: 60, openUntil: '', autoConfirm: true, cancelWindow: 24,
  deposit: { mode: 'none', value: 0 }, payments: ['Sur place'], address: '', intro: '', mapUrl: '', policies: { deposit: '', late: '', cancel: '', payment: '', prep: '' },
  hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d !== 0, from: d === 6 ? '10:00' : '09:00', to: '18:00', breaks: [] })), services, addons: [], staff: [{ id: 'e1', name: 'Kady', role: '', photo: '', active: true, hours: null }], special: [] });
const world = (over = {}) => { const s = store(); return { calls: [], uploads: [], conflict: false, profile: { id: USER.id, first_name: 'Kady', phone: '+2250707123456', store_name: 'Boutique Test', plan: 'gratuit', studio: null, created_at: '2026-11-01T10:00:00Z' }, stores: [s], orders: orders(s.id), ...over }; };
/** a colour by its code, through the « + » picker of a colour field */
/** a colour field is one line: touching it unfolds its choices */
async function openColor(scope, label) {
  const row = scope.getByRole('button', { name: new RegExp(`^${label} : `) });
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
}
async function pickColor(scope, label, hex) {
  await openColor(scope, label);
  await scope.getByRole('group', { name: `${label} : couleurs de base` }).getByRole('button', { name: 'Personnaliser' }).click();
  const pk = scope.getByRole('group', { name: `Choisir la couleur : ${label}` });
  await pk.getByLabel('Code couleur').fill(hex.replace('#', ''));
  await pk.getByRole('button', { name: 'Appliquer' }).click();
}
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'the page must not scroll sideways');
const h1 = (page, text) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, text);

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); results.push(['ok', name]); console.log('  ✓', name); }
  catch (e) { results.push(['FAIL', name]); console.log('  ✗', name, '\n   ', String(e.message).split('\n').slice(0, 6).join(' / ')); }
}
const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 860 };

await test('without a session, the dashboard sends to the login page', async () => {
  const { page, ctx } = await open(browser, DESK, world(), { logged: false });
  await page.goto(`${BASE}/admin/`); await page.waitForURL('**/compte/#connexion'); await ctx.close();
});

await test('an account without a password is sent to its account page before the dashboard', async () => {
  const ctx = await browser.newContext({ viewport: DESK });
  const bare = { ...session(), user: { ...USER, user_metadata: { first_name: 'Kady' } } };
  await ctx.addInitScript((s) => { window.localStorage.setItem('sb-aezchxfvzfoqlvzchqyk-auth-token', JSON.stringify(s)); }, bare);
  const page = await ctx.newPage();
  await page.route('https://aezchxfvzfoqlvzchqyk.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: route.request().url().includes('/auth/v1/user') ? JSON.stringify(bare.user) : '[]' }));
  await page.goto(`${BASE}/admin/`);
  await page.waitForURL(/\/compte\/$/);
  await ctx.close();
});

await test('a seller without a store sees how to create one, and no one else’s store', async () => {
  const w = world({ stores: [], orders: [] }); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady');
  await page.getByText('Pas encore de boutique').waitFor();
  assert.equal(await page.getByText('autre').count(), 0);
  assert.ok(w.calls.some((c) => c.path === '/rest/v1/rpc/my_stores'), 'her stores are named by the server');
  assert.equal(w.calls.some((c) => c.path === '/rest/v1/stores' && /owner=/.test(c.query)), false, 'the owner column is never asked from the browser');
  await page.screenshot({ path: `${SHOTS}10-accueil-sans-boutique.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('home: sales, orders to handle, products and the last orders', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady');
  await page.getByText('N° 3 · Mariam K.').waitFor();
  const text = await page.locator('main').innerText();
  assert.match(text, /Ventes aujourd’hui\s+14\s500\sFCFA/); assert.match(text, /Ventes sur 7 jours\s+20\s000\sFCFA/); assert.match(text, /À traiter\s+1/); assert.match(text, /Produits\s+3/);
  await page.screenshot({ path: `${SHOTS}11-accueil-ordinateur.png` });
  await page.setViewportSize(PHONE); await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}12-accueil-telephone.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('orders: filters, the detail of an order, and its status saved', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/commandes/`); await h1(page, 'Commandes');
  await page.getByText('N° 3 · Mariam K.').waitFor();
  await page.getByRole('button', { name: /^Terminées/ }).click();
  assert.equal(await page.locator('main ul li').count(), 1);
  await page.getByRole('button', { name: /^Toutes/ }).click();
  await page.screenshot({ path: `${SHOTS}13-commandes.png` });
  await page.getByText('N° 3 · Mariam K.').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('Livrer après 17 h.').waitFor();
  assert.match(await sheet.innerText(), /2 × Beurre de karité brut[\s\S]*Livraison[\s\S]*14\s500\sFCFA/);
  assert.equal(await sheet.getByRole('link', { name: 'Écrire sur WhatsApp' }).getAttribute('href'), 'https://wa.me/2250708091011');
  await page.screenshot({ path: `${SHOTS}14-commande-detail.png` });
  await sheet.getByRole('button', { name: 'Confirmée' }).click();
  await page.waitForFunction(() => document.querySelector('[role=dialog] button[aria-pressed=true]')?.textContent === 'Confirmée');
  const patch = w.calls.find((c) => c.path === '/rest/v1/orders' && c.method === 'PATCH');
  assert.deepEqual(patch.body, { status: 'confirmee' }); assert.match(patch.query, /id=eq\.o3/);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('products: add, edit and delete write only the products; everything else in the store is kept', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/produits/`); await h1(page, 'Produits');
  await page.getByText('Beurre de karité brut').waitFor();
  await page.screenshot({ path: `${SHOTS}15-produits-telephone.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ajouter un produit' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Ajouter le produit' }).click();
  assert.equal(await sheet.locator('[role="alert"]').count(), 2, 'a name and a price are asked');
  await sheet.getByLabel('Nom du produit').fill('Sérum éclat au baobab');
  await sheet.getByLabel('Prix (FCFA)').fill('9 500');
  await sheet.getByLabel(/Catégorie/).fill('Visage');
  await sheet.getByRole('button', { name: 'Nouveau' }).click();
  await page.screenshot({ path: `${SHOTS}16-produit-nouveau.png` });
  await sheet.getByRole('button', { name: 'Ajouter le produit' }).click();
  await page.getByText('Sérum éclat au baobab').waitFor();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  let f = w.stores[0].fiche;
  assert.equal(f.products.length, 4); assert.deepEqual(f.products[3], { id: 'p4', name: 'Sérum éclat au baobab', price: 9500, category: 'Visage', description: '', badge: 'new', image: null, photo: null });
  assert.equal(f.template, 'douce'); assert.equal(f.sections.length, 2); assert.deepEqual(f.sections[0], { id: 's1', type: 'hero' }); assert.equal(f.store.name, 'Boutique Test'); assert.deepEqual(f.theme, { accent: '#C2410C' });
  const first = w.calls.find((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH');
  assert.deepEqual(Object.keys(first.body), ['fiche']); assert.match(first.query, /updated_at=eq\./);
  // edit: the price changes, the drawing and the colour of the product stay
  await page.getByText('Beurre de karité brut').click();
  await sheet.getByLabel('Prix (FCFA)').fill('7000');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/7\s000\sFCFA/).waitFor();
  f = w.stores[0].fiche;
  assert.equal(f.products[0].price, 7000); assert.equal(f.products[0].art, 'jar'); assert.equal(f.products[0].color, '#EFEEE5');
  // delete asks first
  await page.getByText('Savon noir au karité').click();
  await sheet.getByRole('button', { name: 'Supprimer ce produit' }).click();
  assert.equal(w.stores[0].fiche.products.length, 4, 'nothing is deleted before the confirmation');
  await sheet.getByRole('button', { name: 'Oui, supprimer' }).click();
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  assert.deepEqual(w.stores[0].fiche.products.map((p) => p.id), ['p1', 'p3', 'p4']);
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('products: a store changed elsewhere meanwhile is not overwritten', async () => {
  const w = world(); const { page, ctx } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/produits/`); await h1(page, 'Produits');
  await page.getByText('Beurre de karité brut').click();
  w.stores[0].updated_at = '2026-11-23T09:00:00.000Z';                    // a partner saved the store in the meantime
  w.stores[0].fiche.products[0].name = 'Beurre de karité (nouveau nom)';
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Prix (FCFA)').fill('1');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await sheet.getByText('Votre boutique a changé entre-temps').waitFor();
  assert.equal(w.stores[0].fiche.products[0].price, 6500, 'her partner’s version is intact');
  await page.screenshot({ path: `${SHOTS}17-produit-conflit.png` });
  await sheet.getByRole('button', { name: 'Recharger' }).click();
  await page.getByText('Beurre de karité (nouveau nom)').waitFor();
  await ctx.close();
});

await test('products: several photos per product, each shrunk and sent to her own folder; the first is the main one, any can become it', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/produits/`); await h1(page, 'Produits');
  await page.getByText('Savon noir au karité').click();
  const sheet = page.getByRole('dialog');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  // three photos at once (three different pictures)
  const red = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4Iyf3HwAFCgIYn0f7egAAAABJRU5ErkJggg==', 'base64');
  const blue = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQs7nzHwAD6AI2lMYubQAAAABJRU5ErkJggg==', 'base64');
  await sheet.getByLabel('Choisir des photos').setInputFiles([{ name: 'savon.png', mimeType: 'image/png', buffer: png }, { name: 'savon-2.png', mimeType: 'image/png', buffer: red }, { name: 'savon-3.png', mimeType: 'image/png', buffer: blue }]);
  const photos = sheet.getByRole('list', { name: 'Photos du produit' });
  await photos.getByRole('img', { name: 'Photo 3' }).waitFor();
  assert.equal(w.uploads.length, 3); assert.match(w.uploads[0], new RegExp(`^${USER.id}/[0-9a-f]{20}-1\\.webp$`), 'under her own folder, named by its content');
  await photos.getByText('Principale').waitFor();
  // the third becomes the main one; the second is removed
  await photos.getByRole('button', { name: 'Mettre la photo 3 en principale' }).click();
  await photos.getByRole('button', { name: 'Retirer la photo 3' }).click();
  assert.equal(await photos.getByRole('img').count(), 2);
  await page.screenshot({ path: `${SHOTS}18-produit-photo.png` });
  const shown = await photos.getByRole('img').evaluateAll((xs) => xs.map((x) => x.getAttribute('src')));
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  const saved = w.stores[0].fiche.products[1];
  assert.deepEqual(saved.images, shown, 'her photos, in her order');
  assert.equal(saved.image, shown[0], 'the main photo is the first');
  assert.match(saved.image, new RegExp(`/storage/v1/object/public/store-media/${USER.id}/[0-9a-f]{20}-1\\.webp$`)); assert.equal(saved.art, 'soap', 'the rest of the product is kept');
  // a file that is not an image is refused, and nothing is sent
  await page.getByText('Huile de coco vierge').click();
  await sheet.getByLabel('Choisir des photos').setInputFiles({ name: 'liste.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
  await sheet.getByText('Choisissez une image').waitFor();
  assert.equal(w.uploads.length, 3);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('customers: one line per customer, made from her orders', async () => {
  const w = world(); w.orders.push({ ...w.orders[0], id: 'o4', number: 4, total: 5000, created_at: ago(50) });
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/clients/`); await h1(page, 'Clients');
  await page.getByText('Mariam K.').waitFor();
  assert.equal(await page.locator('main ul li').count(), 3);
  assert.match(await page.locator('main ul li').first().innerText(), /Mariam K\.[\s\S]*19\s500\sFCFA[\s\S]*2\scommandes/);
  await page.screenshot({ path: `${SHOTS}19-clients.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('payments: the means offered and the numbers are saved; a wrong number is refused', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/paiements/`); await h1(page, 'Paiements');
  assert.equal(await page.getByRole('switch', { name: 'Wave' }).getAttribute('aria-checked'), 'true');
  await page.getByRole('switch', { name: 'Orange Money' }).click();
  await page.getByLabel('Numéro qui reçoit Orange Money').fill('0707');
  await page.getByLabel('Numéro qui reçoit Wave').fill('+225 07 79 01 16 40');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Numéro incomplet').waitFor();
  assert.equal(w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').length, 0);
  await page.getByLabel('Numéro qui reçoit Orange Money').fill('+225 05 05 12 34 56');
  await page.screenshot({ path: `${SHOTS}21-paiements.png` });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  const f = w.stores[0].fiche;
  assert.deepEqual(f.payments, { wave: true, orange: true, cod: true }); assert.deepEqual(f.store.pay, { wavePhone: '+2250779011640', orange: '+2250505123456' });
  assert.equal(f.store.name, 'Boutique Test'); assert.equal(f.products.length, 3);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('delivery: zones are edited in the store\u2019s « Livraison » section, its other words kept', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/livraison/`); await h1(page, 'Livraison');
  await page.getByLabel('Zone 1 : commune ou zone').waitFor();
  assert.equal(await page.getByLabel('Zone 2 : frais de livraison en FCFA').inputValue(), '2500');
  await page.getByRole('button', { name: 'Ajouter une zone' }).click();
  await page.getByLabel('Zone 3 : commune ou zone').fill('Marcory');
  await page.getByLabel('Zone 3 : frais de livraison en FCFA').fill('2 000');
  await page.getByRole('button', { name: /Retirer la zone Abobo/ }).click();
  await page.screenshot({ path: `${SHOTS}22-livraison-telephone.png`, fullPage: true });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  const sec = w.stores[0].fiche.sections[1];
  assert.deepEqual(sec.settings.zones, [{ name: 'Cocody', fee: 1500 }, { name: 'Marcory', fee: 2000 }]); assert.equal(sec.settings.title, 'Nos frais de livraison'); assert.equal(sec.id, 's7');
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('settings: the store\u2019s name and WhatsApp are saved; the menu reaches every page on a phone', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady');
  await page.getByRole('button', { name: /Plus/ }).click();
  await page.screenshot({ path: `${SHOTS}23-menu-plus.png` });
  await page.getByRole('menuitem', { name: 'Paramètres' }).click();
  await h1(page, 'Paramètres');
  await page.getByLabel('Nom de la boutique').fill('Boutique Test Naturelle');
  await page.getByLabel(/Numéro WhatsApp/).fill('+221 77 123 45 67');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  const st = w.stores[0].fiche.store;
  assert.equal(st.name, 'Boutique Test Naturelle'); assert.equal(st.whatsapp, '+221771234567'); assert.equal(st.city, 'Abidjan');
  await page.screenshot({ path: `${SHOTS}24-parametres-telephone.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('the product panel opens full page and comes back; on a phone it is a bottom sheet, like « Plus »', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/produits/`); await h1(page, 'Produits');
  await page.getByText('Beurre de karité brut').click();
  const sheet = page.getByRole('dialog');
  const width = async () => Math.round((await sheet.boundingBox()).width);
  await page.waitForTimeout(400);
  assert.equal(await width(), 480);
  await page.screenshot({ path: `${SHOTS}30-produit-panneau.png` });
  await sheet.getByRole('button', { name: 'Ouvrir en grand' }).click(); await page.waitForTimeout(400);
  assert.equal(await width(), 1280, 'the panel takes the whole page');
  await sheet.getByLabel('Prix (FCFA)').fill('6 900');                       // what she typed stays when the size changes
  await page.screenshot({ path: `${SHOTS}31-produit-pleine-page.png` });
  await sheet.getByRole('button', { name: 'Revenir au panneau' }).click(); await page.waitForTimeout(400);
  assert.equal(await width(), 480); assert.equal(await sheet.getByLabel('Prix (FCFA)').inputValue(), '6 900');
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
  // a phone
  await page.setViewportSize(PHONE);
  await page.getByText('Beurre de karité brut').click(); await page.waitForTimeout(500);
  const box = await page.getByRole('dialog').boundingBox();
  assert.equal(Math.round(box.width), 390); assert.equal(Math.round(box.y + box.height), 844, 'it sits at the bottom of the screen');
  assert.equal(await page.getByRole('button', { name: 'Ouvrir en grand' }).isVisible(), false);
  await page.screenshot({ path: `${SHOTS}32-produit-tiroir-telephone.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Plus/ }).click(); await page.waitForTimeout(500);
  const menu = await page.getByRole('menu').boundingBox();
  assert.equal(Math.round(menu.width), 390); assert.equal(Math.round(menu.y + menu.height), 844);
  await page.screenshot({ path: `${SHOTS}33-plus-tiroir.png` });
  await page.mouse.click(195, 120);                                          // a tap on the dimmed page closes it
  await page.getByRole('menu').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('models: the seven designer models, with their price, « Choisir » and the real demo', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/modeles/`); await h1(page, 'Modèles de designer');
  await page.getByText('Un site dessiné pour votre métier, payé une seule fois. Vous le remplissez vous-même, ou notre équipe l’installe pour vous.').waitFor();
  const cards = page.locator('main ul > li');
  assert.equal(await cards.count(), 7);
  // the gallery shows each model as an example of layout (its photos become plain frames on her store)
  assert.equal(await page.getByText('Exemple de mise en page', { exact: true }).count(), 7);
  await page.waitForFunction(() => [...document.querySelectorAll('main ul > li img')].every((i) => i.complete), null, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}133-galerie-exemple.png` });
  const seen = await cards.evaluateAll((els) => els.map((li) => ({
    name: li.querySelector('p')?.textContent, kind: li.querySelectorAll('p')[1]?.textContent,
    price: li.querySelector('strong')?.textContent.replace(/\s/g, ' '), was: li.querySelector('s')?.textContent.replace(/\s/g, ' ') ?? '',
    img: li.querySelector('img')?.getAttribute('src'), demo: [...li.querySelectorAll('a')].map((x) => x.getAttribute('href') + '|' + x.getAttribute('target')),
    buttons: [...li.querySelectorAll('button, a:not(:has(img))')].map((x) => x.textContent),
  })));
  assert.deepEqual(seen.map((c) => [c.name, c.kind, c.price, c.was]), [
    ['SÈVE', 'Soins et cosmétiques', '25 000 FCFA', '50 000 FCFA'], ['SOYEUSE', 'Perruques et tissages', '25 000 FCFA', '50 000 FCFA'],
    ['MICHOU', 'Streetwear', '50 000 FCFA', '100 000 FCFA'], ['ANSE', 'Maroquinerie', '300 000 FCFA', ''],
    ['REGARD', 'Cils et sourcils · rendez-vous', '25 000 FCFA', '50 000 FCFA'], ['VERNIE', 'Ongles · rendez-vous', '25 000 FCFA', '50 000 FCFA'],
    ['MINUIT', 'Cils et ongles · rendez-vous', '25 000 FCFA', '50 000 FCFA']]);
  for (const [i, slug] of ['seve', 'soyeuse', 'michou', 'anse', 'regard', 'vernie', 'minuit'].entries()) {
    assert.equal(seen[i].img, `https://jehre.com/studio/sites/thumbs/concepts--${slug}.webp`);
    assert.deepEqual(seen[i].demo, [`/admin/modeles/apercu/?m=${slug}|null`, `/admin/modeles/apercu/?m=${slug}|null`], 'the picture and « Voir la démo » open the model INSIDE Jehre, not a public page');
    assert.deepEqual(seen[i].buttons, ['Choisir', 'Voir la démo']);
  }
  // the two buttons sit side by side, and the pictures are really loaded
  const one = cards.nth(2), b1 = await one.getByRole('button').boundingBox(), b2 = await one.getByRole('link', { name: 'Voir la démo', exact: true }).boundingBox();
  assert.ok(Math.abs(b1.y - b2.y) <= 4, 'side by side (a card may be lifting under the pointer)'); assert.ok(b2.x > b1.x + b1.width - 1);
  await page.waitForFunction(() => [...document.querySelectorAll('main ul img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  const body = await page.locator('main').innerText();
  for (const old of ['Plateau', 'Cocody', 'Treichville']) assert.equal(body.includes(old), false, `${old} is no longer a model`);
  assert.equal(await page.locator('main iframe').count(), 0);
  await page.screenshot({ path: `${SHOTS}40-modeles-ordinateur.png`, fullPage: true });

  // « Choisir »: the three ways to install it
  await page.getByRole('button', { name: 'Choisir le modèle MICHOU' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('Comment voulez-vous l’installer ?').waitFor();
  const opts = (await sheet.getByRole('radiogroup').innerText()).replace(/\s/g, ' ');
  for (const t of ['Je remplis moi-même', '50 000 FCFA', 'Jehre installe tout pour moi', 'À partir de 150 000 FCFA', 'Un site 100 % sur mesure', 'À partir de 300 000 FCFA']) assert.ok(opts.includes(t), t);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}41-modele-choisir.png` });
  // she fills it herself: the card payment is asked from the server, for this model and this store
  await sheet.getByRole('button', { name: 'Payer par carte' }).click();
  await sheet.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const bill = w.calls.find((c) => c.path === '/functions/v1/billing');
  assert.equal(bill.body.action, 'model'); assert.equal(bill.body.model, 'michou'); assert.equal(bill.body.install, false);
  assert.equal(bill.body.storeId, w.stores[0].id); assert.equal(bill.body.shopName, 'Boutique Test'); assert.ok(bill.body.returnUrl.endsWith('/admin/modeles/'));
  // the team installs it: a form to fill and sign first (its own page), then the payment
  await sheet.getByText('Jehre installe tout pour moi').click();
  await sheet.getByRole('button', { name: 'Remplir le formulaire' }).click();
  await h1(page, 'Formulaire d’installation');
  await page.goto(`${BASE}/admin/modeles/`); await h1(page, 'Modèles de designer');
  // ANSE: one price, the installation is part of it
  await page.getByRole('button', { name: 'Choisir le modèle ANSE' }).click();
  await page.getByRole('dialog').getByText('payé une seule fois, installation par notre équipe incluse.').waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('radio').count(), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('models: a model she bought is hers; she switches model and her texts are kept for each', async () => {
  const w = world(); w.models = [{ model: 'seve', install: false }, { model: 'soyeuse', install: false }];
  w.stores[0].fiche.store.model = 'seve'; w.stores[0].fiche.store.site = { title: 'Mon texte SÈVE' };
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/modeles/`); await h1(page, 'Ma boutique');
  await page.getByRole('button', { name: 'Voir plus de modèles' }).click(); await h1(page, 'Modèles de designer');
  await page.getByText('Les modèles achetés sont à vous').waitFor();
  assert.equal(await page.getByText('Modèle utilisé').count(), 1);
  assert.equal(await page.getByText('Acheté · il est à vous').count(), 2);
  await page.waitForFunction(() => [...document.querySelectorAll('main ul img')].slice(0, 2).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}42-modeles-telephone.png` });
  await page.getByRole('button', { name: 'Utiliser ce modèle' }).click();
  await page.getByText('Votre boutique utilise maintenant le modèle SOYEUSE.').waitFor();
  const st = w.stores[0].fiche.store;
  assert.equal(st.model, 'soyeuse'); assert.equal(st.site, undefined); assert.deepEqual(st.siteBy, { seve: { title: 'Mon texte SÈVE' } });
  assert.equal(w.stores[0].fiche.products.length, 3); assert.equal(st.name, 'Boutique Test');
  // the way to choose, on a phone: a bottom sheet, the two buttons side by side
  await page.getByRole('button', { name: 'Choisir le modèle MICHOU' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Choisir le modèle MICHOU' }).click();
  await page.getByRole('dialog').getByText('Comment voulez-vous l’installer ?').waitFor(); await page.waitForTimeout(500);
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}43-modele-choisir-telephone.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('phone: the floating bottom bar stays in place while the page scrolls', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  for (const path of ['/admin/modeles/', '/admin/', '/admin/produits/']) {
    await page.goto(`${BASE}${path}`); await page.locator('aside nav').waitFor();
    // make sure the page is much taller than the screen, then scroll it step by step, as a thumb does
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '2400px'; document.querySelector('main').appendChild(d); });
    const where = () => page.evaluate(() => { const r = document.querySelector('aside').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), y: Math.round(window.scrollY), h: window.innerHeight }; });
    const start = await where();
    assert.equal(start.bottom, 834, `${path}: the bar floats 10 px above the bottom edge`); assert.equal(start.left, 12); assert.equal(start.width, 366);
    for (const dy of [300, 500, 700, -400, 900]) {
      await page.mouse.wheel(0, dy); await page.waitForTimeout(120);
      const now = await where();
      assert.equal(now.top, start.top, `${path}: the bar moved while scrolling`); assert.equal(now.bottom, 834);
    }
    const end = await where(); assert.ok(end.y > 1200, 'the page really scrolled');
    // nothing around the bar can detach it: no ancestor transforms, filters, clips or scrolls
    const bad = await page.evaluate(() => { const out = []; for (let e = document.querySelector('aside').parentElement; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.transform !== 'none' || c.filter !== 'none' || /(hidden|auto|scroll)/.test(c.overflowX + c.overflowY) || c.contain !== 'none') out.push(e.tagName); } return out; });
    assert.deepEqual(bad, []);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('aside')).position), 'fixed');
    // the last thing on the page stops above the bar
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150);
    const gap = await page.evaluate(() => { const m = document.querySelector('main'); const last = m.lastElementChild.getBoundingClientRect().bottom; return document.querySelector('aside').getBoundingClientRect().top - last; });
    assert.ok(gap >= 16, `${path}: the end of the page is hidden by the bar (${gap})`);
    if (path === '/admin/modeles/') { await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}44-barre-du-bas-apres-defilement.png` }); }
  }
  assert.deepEqual(errors, []); await ctx.close();
});

await test('no figure ever leaves its card, even a very long amount on a very narrow phone', async () => {
  const w = world(); w.orders[0].total = 123456789; w.orders[1].total = 98765432;
  for (const vp of [{ width: 320, height: 640 }, PHONE, { width: 768, height: 900 }, DESK]) {
    const { page, ctx } = await open(browser, vp, w);
    await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady'); await page.getByText('N° 3 · Mariam K.').waitFor();
    const out = await page.evaluate(() => [...document.querySelectorAll('main dl > div')].flatMap((card) => {
      const c = card.getBoundingClientRect();
      return [...card.children].filter((el) => { const r = el.getBoundingClientRect(); return r.right > c.right + 0.5 || r.left < c.left - 0.5; }).map((el) => el.textContent);
    }));
    assert.deepEqual(out, [], `at ${vp.width} px`);
    await noOverflow(page);
    if (vp.width === 320) await page.screenshot({ path: `${SHOTS}34-cartes-320.png`, fullPage: true });
    if (vp.width === 390) await page.screenshot({ path: `${SHOTS}35-cartes-390.png`, fullPage: true });
    await ctx.close();
  }
});

const withModel = (w, slug) => { w.models = [{ model: slug, install: false }]; w.stores[0].fiche.store.model = slug; return w; };

await test('editor: a bar, the sections, HER model in the middle, the inspector; texts, order, hidden sections, undo; nothing is live before « Publier »', async () => {
  const w = withModel(world(), 'michou');
  const before = JSON.parse(JSON.stringify(w.stores[0].fiche));
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  await page.getByText('En ligne', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('iframe[title="Votre site"]').getAttribute('src'), 'https://kreeative.xyz/concepts/michou/');
  // the bar: 56 px, the page in a drop-down, the sizes as icons, undo and redo, one main button
  assert.equal(Math.round((await page.locator('header').boundingBox()).height), 52);
  await page.getByRole('button', { name: 'Page : Accueil' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Ordinateur' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Annuler' }).isDisabled(), true);
  const save = page.getByRole('button', { name: 'Publier' });
  assert.equal(await save.isDisabled(), true, 'nothing to publish yet');
  assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).count(), 0);
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });            // the model's page described itself
  assert.equal(Math.round((await left.boundingBox()).width), 260);
  await left.getByText('Page d’accueil').waitFor();
  const rows = () => left.locator('ol > li > div > button:not([aria-label])').allInnerTexts();
  const names = await rows();
  assert.equal(names[0], 'En-tête'); assert.equal(names.at(-1), 'Pied de page'); assert.ok(names.length >= 5, names.join(' | '));
  // none of the old engine's presets, none of the old controls
  const ui = await page.locator('body').innerText();
  for (const old of ['Menthe', 'Sable', 'Hibiscus', 'Karité', 'Plateau', 'Treichville', 'Style', 'image Pinterest', 'Cold Culture']) assert.equal(ui.includes(old), false, `« ${old} » must not show`);
  assert.equal(await left.getByRole('switch').count(), 0, 'an eye, not a big switch');
  assert.equal(await page.getByRole('tab').count(), 0, 'the pages are in the drop-down, not a row of pills');
  const site = page.frameLocator('iframe[title="Votre site"]');

  // a section opens on what it holds, in a 300 px inspector; a text changes on the site as she types
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Contenu : Grande bannière' });
  assert.equal(Math.round((await right.boundingBox()).width), 300);
  const title = right.getByRole('textbox').first();
  assert.ok((await title.inputValue()).length > 0, 'the field starts with the model’s own text');
  await title.fill('Collection Test 2027');
  await site.getByText('Collection Test 2027').first().waitFor({ timeout: 15000 });
  assert.equal(await right.getByRole('button', { name: 'Remettre le texte du modèle' }).count(), 0, 'no « Remettre le texte du modèle » under the texts');
  assert.equal(await right.getByLabel('Titre', { exact: true }).inputValue(), 'Collection Harmattan', 'two lines of a title read as two words');
  // pictures: a clean card (miniature, plain name, « Remplacer »), never the model's own notes
  const media = right.getByRole('region', { name: 'Images' });
  // several pictures: a compact grid of miniatures, and ONE card for the picture chosen (never a pile of cards)
  assert.deepEqual(await media.getByRole('group', { name: 'Choisir une image' }).getByRole('button').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label'))), ['Image principale', 'Image secondaire']);
  assert.deepEqual(await media.locator('b').allInnerTexts(), ['Image principale']);
  await media.getByRole('button', { name: 'Image secondaire', exact: true }).click();
  assert.deepEqual(await media.locator('b').allInnerTexts(), ['Image secondaire']);
  assert.equal(await media.getByRole('button', { name: /^Remplacer/ }).count(), 1);
  // the panels float as glass cards, 12 px from the edges
  const glass = await right.evaluate((n) => { const c = getComputedStyle(n), r = n.getBoundingClientRect(); return [c.backdropFilter || c.webkitBackdropFilter, c.borderRadius, Math.round(window.innerWidth - r.right), Math.round(r.top - 52)]; });
  assert.match(glass[0], /blur\(16px\)/); assert.deepEqual(glass.slice(1), ['16px', 12, 12]);
  assert.equal((await right.innerText()).match(/Pinterest|mannequin|Cold Culture/i), null);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}50-editeur-ordinateur.png` });
  // undo, redo
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.waitForFunction(() => !document.querySelector('iframe[title="Votre site"]').contentDocument || true);
  assert.equal(await save.isDisabled(), true, 'undone: nothing left to publish');
  await page.getByRole('button', { name: 'Rétablir' }).click();
  await site.getByText('Collection Test 2027').first().waitFor({ timeout: 15000 });
  // the tree: a section unfolds on its elements; one of them opens its field
  await left.getByRole('button', { name: 'Déplier Grande bannière' }).click();
  const leaves = await left.locator('ol > li ul button').allInnerTexts();
  assert.ok(leaves.some((x) => x.startsWith('Titre – Collection Harmattan')), leaves.join(' | ')); assert.ok(leaves.includes('2 images'), 'the pictures of a section are one line of the tree, not one line each');
  // a click on the site opens the field of what was clicked
  const target = site.locator('footer [data-jeere-pickable="t"]').first();
  const clicked = (await target.innerText()).replace(/\s+/g, ' ').trim();
  await target.click();
  await page.getByRole('complementary', { name: 'Contenu : Pied de page' }).waitFor();
  await page.waitForFunction(() => !!document.activeElement?.closest('[data-site-key]'), null, { timeout: 10000 });
  const focused = await page.evaluate(() => document.activeElement.value.replace(/\s+/g, ' ').trim());
  assert.ok(clicked.toLowerCase().includes(focused.toLowerCase()) || focused.toLowerCase().includes(clicked.toLowerCase()), `clicked « ${clicked} », field « ${focused} »`);
  // a section is hidden with its eye (not the header, not the footer)
  assert.equal(await left.getByRole('button', { name: /^Masquer / }).count(), names.length - 2);
  await left.getByRole('button', { name: `Masquer ${names[3]}` }).click();
  await left.getByRole('button', { name: `Afficher ${names[3]}` }).waitFor();
  // the order: a section is moved down with its handle; the site follows, her text stays on its section
  await left.getByRole('button', { name: `Déplacer ${names[1]} (flèches haut et bas)` }).focus();
  await page.keyboard.press('ArrowDown');
  const moved = await rows();
  assert.deepEqual(moved.slice(0, 4), [names[0], names[2], names[1], names[3]]);
  await page.waitForFunction(() => { const d = document.querySelector('iframe[title="Votre site"]'); return true && !!d; });
  const orders = await site.locator('body').evaluate(() => { const secs = [...document.querySelectorAll('header, footer, section, .strip')].filter((el) => !el.closest('.concept, .concept-bar') && !(el.parentElement && el.parentElement.closest('header, footer, section, .strip'))); return secs.map((el) => Number(getComputedStyle(el).order)); });
  assert.ok(orders[1] > orders[2], `the first section now comes after the second (${orders.join(',')})`);
  await site.getByText('Collection Test 2027').first().waitFor();
  // another page of the model, from the drop-down
  await page.getByRole('button', { name: 'Page : Accueil' }).click();
  assert.deepEqual(await page.getByRole('listbox', { name: 'Page' }).getByRole('option').allInnerTexts(), ['Accueil', 'Boutique', 'Commande', 'Mentions légales']);
  await page.getByRole('listbox', { name: 'Page' }).getByRole('option', { name: 'Boutique' }).click();
  await page.waitForFunction(() => document.querySelector('iframe[title="Votre site"]').getAttribute('src') === 'https://kreeative.xyz/concepts/michou/boutique/');
  await left.getByText('Page Boutique').waitFor();
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  // nothing was written yet; « Publier » writes, and says so in a small toast (no banner pushing the page down)
  assert.equal(w.calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/stores'), false);
  const top = (await page.locator('iframe[title="Votre site"]').boundingBox()).y;
  await save.click();
  await page.getByRole('status').filter({ hasText: 'Votre site est en ligne · boutique-test.store.jehre.com' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Voir mon site' }).getAttribute('href'), 'https://boutique-test.store.jehre.com');
  assert.equal((await page.locator('iframe[title="Votre site"]').boundingBox()).y, top, 'the page did not move');
  const f = w.stores[0].fiche;
  assert.deepEqual(Object.values(f.store.site.t), ['Collection Test 2027']);
  assert.match(Object.keys(f.store.site.t)[0], /^\/\|t\|\d+$/);
  assert.deepEqual(Object.values(f.store.site.h), ['1']);
  assert.equal(f.store.site.o['/'].length, names.length - 2); assert.notDeepEqual(f.store.site.o['/'], [...f.store.site.o['/']].sort((x, y) => x - y));
  assert.equal(f.store.model, 'michou');
  // her store is otherwise untouched: no preset section, palette or product was added
  assert.deepEqual({ ...f, store: { ...f.store, site: undefined } }, { ...before, store: { ...before.store, site: undefined } });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor, studio level: floating light panels, search, zoom, layout and appearance of a section applied on the site; a tablet in landscape and portrait', async () => {
  const w = withModel(world(), 'michou');
  const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('h1, h2').first().waitFor({ timeout: 30000 });
  // the panels float: 12 px from the edges, rounded 16 px, white, over a light canvas (never a dark theme)
  const card = (el) => { const r = el.getBoundingClientRect(), c = getComputedStyle(el); return { x: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), gapBottom: Math.round(innerHeight - r.bottom), radius: c.borderTopLeftRadius, bg: c.backgroundColor, shadow: c.boxShadow !== 'none' }; };
  assert.deepEqual(await left.evaluate(card), { x: 12, top: 64, w: 260, gapBottom: 12, radius: '16px', bg: 'rgba(255, 255, 255, 0.78)', shadow: true });
  assert.equal(await page.locator('header').evaluate((h) => getComputedStyle(h).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('header').evaluate((h) => getComputedStyle(h.parentElement).backgroundColor), 'rgb(245, 245, 247)');
  // the site keeps clear of the left panel on a wide screen
  assert.ok((await page.locator('iframe[title="Votre site"]').boundingBox()).x >= 284);
  // quick search: by the name of a section, or by a word it holds
  await left.getByRole('searchbox').fill('lookbook');
  const found = () => left.locator('ol > li > div > button:not([aria-label])').allInnerTexts();
  let hits = await found();
  assert.ok(hits.includes('Lookbook') && !hits.includes('Nouveautés') && hits.length <= 3, hits.join(' | '));
  await left.getByRole('searchbox').fill('harmattan');
  hits = await found();
  assert.ok(hits.includes('Grande bannière') && !hits.includes('Lookbook'), hits.join(' | '));
  assert.ok((await left.locator('ol > li ul button').allInnerTexts()).some((x) => x.includes('Harmattan')), 'the matching element is shown under its section');
  await left.getByRole('searchbox').fill('zzzz'); await left.getByText('Aucune section ne correspond.').waitFor();
  await left.getByRole('searchbox').fill('');
  // the inspector: three blocks, dense controls (32 px)
  await left.getByRole('button', { name: 'Nouveautés', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Contenu : Nouveautés' });
  await right.waitFor(); await page.waitForTimeout(400);      // it slides in
  assert.deepEqual(await right.evaluate(card), { x: 1440 - 12 - 300, top: 64, w: 300, gapBottom: 12, radius: '16px', bg: 'rgba(255, 255, 255, 0.78)', shadow: true });
  assert.deepEqual(await right.locator('h3').evaluateAll((els) => els.filter((e) => e.parentElement.tagName !== 'SECTION').map((e) => e.textContent)), ['Contenu', 'Mise en page', 'Apparence']);
  assert.equal(Math.round((await right.getByLabel('Espace au-dessus', { exact: true }).boundingBox()).height), 32);
  // layout and appearance: written in her store, drawn on the site at once, and undone in one click
  const sec = () => site.locator('body').evaluate(() => { const all = [...document.querySelectorAll('header, footer, section, .strip')].filter((el) => !el.closest('.concept, .concept-bar') && !(el.parentElement && el.parentElement.closest('header, footer, section, .strip'))); const el = all.find((x) => /nouveaut/i.test(x.textContent.slice(0, 200)) && x.tagName === 'SECTION'); const c = getComputedStyle(el); const img = el.querySelector('img'); return { pt: c.paddingTop, pb: c.paddingBottom, align: c.textAlign, bg: c.backgroundColor, line: c.borderTopWidth, radius: img ? getComputedStyle(img).borderTopLeftRadius : '' }; });
  const model = await sec();
  await right.getByLabel('Espace au-dessus', { exact: true }).fill('120');
  await right.getByLabel('Espace en dessous', { exact: true }).fill('64');
  await right.getByRole('button', { name: 'Centre' }).click();
  await openColor(right, 'Fond de la section');
  await right.getByRole('group', { name: 'Fond de la section : couleurs de base' }).getByRole('button', { name: 'Or' }).click();
  await right.getByLabel('Coins des images', { exact: true }).fill('24');
  await right.getByRole('switch', { name: 'Filet au-dessus de la section' }).click();
  await page.waitForFunction(() => true); await page.waitForTimeout(500);
  assert.deepEqual(await sec(), { pt: '120px', pb: '64px', align: 'center', bg: 'rgb(232, 185, 49)', line: '1px', radius: '24px' });
  assert.equal(w.calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/stores'), false);
  await page.screenshot({ path: `${SHOTS}55-editeur-studio-ordinateur.png` });
  // the zoom bar floats over the site and changes its scale only
  const zoom = page.getByRole('group', { name: 'Zoom' });
  const z0 = await zoom.boundingBox();
  await zoom.getByRole('button', { name: 'Agrandir' }).click(); await zoom.getByRole('button', { name: 'Agrandir' }).click();
  await zoom.getByText('120 %').waitFor();
  await page.waitForTimeout(400);
  assert.deepEqual(await zoom.boundingBox(), z0, 'the bar did not move');
  assert.deepEqual(await left.evaluate(card), { x: 12, top: 64, w: 260, gapBottom: 12, radius: '16px', bg: 'rgba(255, 255, 255, 0.78)', shadow: true });
  await zoom.getByRole('button', { name: /revenir à 100 %/ }).click(); await zoom.getByText('100 %').waitFor();
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByRole('status').filter({ hasText: 'Votre site est en ligne' }).waitFor();
  assert.deepEqual(Object.values(w.stores[0].fiche.store.site.s), [{ pt: 120, pb: 64, align: 'center', bg: '#E8B931', radius: 24, line: true }]);
  // « Remettre l’apparence du modèle » gives the section back as the designer drew it
  await right.getByRole('button', { name: 'Remettre l’apparence du modèle' }).click();
  await page.waitForTimeout(500);
  assert.deepEqual(await sec(), model);

  // a tablet, landscape then portrait: the same floating panels, over the site, nothing overflows
  for (const vp of [{ width: 1024, height: 768, shot: '56-editeur-tablette-paysage' }, { width: 768, height: 1024, shot: '57-editeur-tablette-portrait' }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(700);
    await noOverflow(page);
    // one panel beside the site: the section's settings; the list is put away, one tap brings it back
    const r = await right.evaluate(card);
    assert.equal(r.x, vp.width - 312); assert.equal(r.w, 300); assert.equal(r.radius, '16px'); assert.equal(r.bg, 'rgba(255, 255, 255, 0.78)');
    assert.equal(await left.count(), 0, 'the list is away while a section is open');
    assert.equal(Math.round((await page.locator('header').boundingBox()).height), 52, 'one line of bar on a tablet');
    assert.ok((await page.locator('iframe[title="Votre site"]').boundingBox()).x <= 24, 'on a tablet the site takes the whole width, under the panels');
    await page.screenshot({ path: `${SHOTS}${vp.shot}.png` });
    await page.getByRole('button', { name: 'Afficher les sections' }).click();
    await left.getByRole('list').first().waitFor();
    const l = await left.evaluate(card);
    assert.equal(l.x, 12); assert.equal(l.w, 260); assert.equal(l.radius, '16px'); assert.equal(l.bg, 'rgba(255, 255, 255, 0.78)');
    await page.getByRole('button', { name: 'Masquer les sections' }).click();
    await left.waitFor({ state: 'detached' });
    await noOverflow(page);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor, a busy model (SÈVE): every section stays in view on the left, and a section with many pictures and products stays short on the right', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  // the tree: all the sections, none unfolded, nothing to scroll
  assert.equal(await left.locator('ol > li ul').count(), 0, 'nothing is unfolded at first');
  assert.equal(await left.evaluate((n) => n.scrollHeight <= n.clientHeight + 1), true, 'the list of sections fits without scrolling');
  const names = await left.locator('ol > li > div > button[aria-current], ol > li > div > button:not([aria-label])').allInnerTexts();
  const busy = names.find((n) => /catalogue/i.test(n)) ?? names[2];
  await left.getByRole('button', { name: `Déplier ${busy}` }).click();
  const leaves = await left.locator('ol > li ul button').allInnerTexts();
  assert.ok(leaves.length <= 8, `a section unfolds on a few lines, not one per picture: ${leaves.join(' | ')}`);
  await left.getByRole('button', { name: busy, exact: true }).click();
  const right = page.getByRole('complementary', { name: `Contenu : ${busy}` });
  await right.waitFor();
  assert.ok(await right.getByRole('button', { name: /^Remplacer/ }).count() <= 1, 'one picture card at a time');
  assert.ok(await right.getByRole('combobox').count() + await right.locator('select').count() <= 10, 'the product cases are not all unrolled (each list counts twice; one more for « Afficher »)');
  // the longest lines (the footer's links) are cut with « … » inside the panel: nothing is wider than it
  await left.getByRole('button', { name: 'Déplier Pied de page' }).click();
  const wide = await left.evaluate((n) => { const r = n.getBoundingClientRect(); return [n.scrollWidth <= n.clientWidth, [...n.querySelectorAll('button, li, p, input, h2, ol, ul')].every((e) => { const b = e.getBoundingClientRect(); return !b.width || b.right <= r.right + 0.5; })]; });
  assert.deepEqual(wide, [true, true], 'nothing of the tree goes past the edge of the panel');
  await page.screenshot({ path: `${SHOTS}57-editeur-seve-arbre.png` });
  // what is chosen is framed on the site, exactly on it, inside the page
  const frame = await site.locator('[data-jeere-sel]').evaluate((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), document.documentElement.clientWidth]; });
  assert.ok(frame[0] >= 0 && frame[1] <= frame[2], `the frame stays inside the page: ${frame}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}57-editeur-seve.png` });
  // a click on a card of the site frames that card, no wider than it
  const card = site.locator('[data-jeere-pickable="p"]').first();
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded(); await card.click({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(700);
    const fit = await site.locator('body').evaluate(() => { const b = document.querySelector('[data-jeere-sel]').getBoundingClientRect(); const all = [...document.querySelectorAll('[data-jeere-pickable]')]; const hit = all.find((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.left - b.left) < 2 && Math.abs(r.top - b.top) < 2 && Math.abs(r.width - b.width) < 2 && Math.abs(r.height - b.height) < 2; }); return !!hit; });
    assert.equal(fit, true, 'the frame has the size of the element chosen');
    await page.screenshot({ path: `${SHOTS}58-editeur-seve-selection.png` });
  }
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor: « Ordinateur / Téléphone » is in the bar, its thumb slides to the option chosen, and no scrollbar is drawn on the panels', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const pick = page.getByRole('group', { name: 'Taille de l’aperçu' });
  await pick.waitFor({ timeout: 30000 });
  assert.deepEqual(await pick.getByRole('button').allInnerTexts(), ['Ordinateur', 'Téléphone'], 'both options are named, not only drawn');
  const thumb = () => pick.locator('span[aria-hidden]').first().evaluate((n) => Math.round(n.getBoundingClientRect().left - n.parentElement.getBoundingClientRect().left));
  const frame = page.locator('iframe[title="Votre site"]');
  await page.frameLocator('iframe[title="Votre site"]').locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  assert.equal(await thumb(), 2); assert.ok(Number(await frame.getAttribute('width')) >= 1280);
  await page.screenshot({ path: `${SHOTS}59-editeur-apercu-ordinateur.png` });
  await pick.getByRole('button', { name: 'Téléphone' }).click();
  await page.waitForTimeout(500);
  assert.ok(await thumb() > 60, 'the thumb went under « Téléphone »');
  assert.match(await pick.locator('span[aria-hidden]').first().evaluate((n) => getComputedStyle(n).transitionTimingFunction), /cubic-bezier\(0\.34, 1\.4, 0\.64, 1\)/);
  assert.equal(await frame.getAttribute('width'), '390');
  const box = await frame.boundingBox(), stage = await page.locator('iframe[title="Votre site"]').locator('xpath=../..').boundingBox();
  assert.ok(Math.abs((box.x + box.width / 2) - (stage.x + stage.width / 2)) < 160, 'the phone frame sits in the middle of the canvas');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}60-editeur-apercu-telephone.png` });
  await pick.getByRole('button', { name: 'Ordinateur' }).click();
  await page.waitForTimeout(400); assert.equal(await thumb(), 2);
  // the panels scroll, without a drawn scrollbar
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  assert.deepEqual(await left.evaluate((n) => [getComputedStyle(n).scrollbarWidth, getComputedStyle(n).overflowY]), ['none', 'auto']);
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const right = page.getByRole('complementary', { name: /^Contenu/ });
  assert.equal(await right.evaluate((n) => getComputedStyle(n).scrollbarWidth), 'none');
  assert.equal(await right.evaluate((n) => { n.scrollTop = 200; return n.scrollTop > 0 || n.scrollHeight <= n.clientHeight; }), true, 'it still scrolls');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor, the real tools: add a section, duplicate and delete it, where a button leads, the colours and shape of a button, her logo', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  // the bar: 52 px, everything in it
  assert.equal(Math.round((await page.locator('header').boundingBox()).height), 52);
  for (const n of ['Retour au tableau de bord', 'Ordinateur', 'Téléphone', 'Annuler', 'Rétablir']) await page.locator('header').getByLabel(n).waitFor();
  await page.locator('header').getByRole('button', { name: /^Page :/ }).waitFor(); await page.locator('header').getByRole('button', { name: 'Publier' }).waitFor();
  // the finer type of the panels
  assert.deepEqual(await left.locator('h2').evaluate((n) => [getComputedStyle(n).fontSize, getComputedStyle(n).fontWeight]), ['13px', '600']);
  assert.deepEqual(await left.getByRole('button', { name: 'Nouveautés', exact: true }).evaluate((n) => [getComputedStyle(n).fontSize, n.parentElement.getBoundingClientRect().height]), ['12px', 28]);
  assert.equal(await left.getByRole('searchbox').getAttribute('placeholder'), 'Rechercher...');

  // the help is a very small notice on top of the screen, centred over the site (not in the panel); closed, it does not come back
  const tip = page.getByRole('note');
  assert.equal(await left.getByRole('note').count(), 0, 'not inside the panel of sections');
  const tb = await tip.boundingBox();
  assert.equal(await tip.evaluate((n) => getComputedStyle(n).fontSize), '11px');
  assert.ok(tb.y >= 52 && tb.y < 80 && Math.abs(tb.x + tb.width / 2 - 720) < 4, `on top, in the middle: ${JSON.stringify(tb)}`);
  await page.screenshot({ path: `${SHOTS}63-editeur-aide.png` });
  await tip.getByRole('button', { name: 'Fermer cette aide' }).click();
  assert.equal(await page.getByRole('note').count(), 0); assert.equal(await page.evaluate(() => localStorage.getItem('jehre-editor-tip')), '1');
  // + Ajouter une section: a small menu, the section appears on the site after the one she was on, and in the tree
  const numbered = await site.locator('[data-jeere-pickable="t"]').count();
  await left.getByRole('button', { name: 'Nouveautés', exact: true }).click();
  await left.getByRole('button', { name: 'Ajouter une section' }).click();
  assert.deepEqual(await page.getByRole('menu', { name: 'Type de section' }).getByRole('menuitem').allInnerTexts(), ['Bannière', 'Grille de produits', 'Texte et image', 'Texte', 'Avis', 'Questions fréquentes']);
  await page.getByRole('menuitem', { name: 'Questions fréquentes' }).click();
  const mine = site.locator('[data-jeere-added]');
  await mine.waitFor({ timeout: 15000 });
  const panel = page.getByRole('complementary', { name: 'Contenu : Questions fréquentes' });
  await panel.getByLabel('Titre').fill('Vos questions');
  await mine.getByText('Vos questions').waitFor({ timeout: 15000 });
  await panel.getByLabel('Question 1').fill('Livrez-vous à Dakar ?');
  await mine.getByText('Livrez-vous à Dakar ?').waitFor();
  assert.equal(await site.locator('[data-jeere-pickable="t"]').count(), numbered, 'the texts of the model keep their numbers');
  await left.getByRole('button', { name: /^Questions fréquentes – Vos questions/ }).waitFor();
  // a banner with a picture place, a button and its destination; duplicate, then delete the copy
  await left.getByRole('button', { name: 'Ajouter une section' }).click();
  await page.getByRole('menuitem', { name: 'Bannière' }).click();
  const banner = page.getByRole('complementary', { name: 'Contenu : Bannière' });
  await banner.getByLabel('Texte du bouton').fill('Voir la boutique');
  await banner.getByLabel('Destination').selectOption('Page');
  await banner.getByLabel('Page', { exact: true }).selectOption('Boutique');
  await page.waitForTimeout(400);
  assert.equal(await site.locator('[data-jeere-added] a').getAttribute('href'), '/concepts/michou/boutique/');
  await banner.getByRole('button', { name: 'Importer : Image de fond' }).waitFor();
  assert.equal(await mine.count(), 2);
  await left.getByRole('button', { name: 'Dupliquer Bannière' }).click();
  await page.waitForTimeout(400); assert.equal(await mine.count(), 3);
  await left.getByRole('button', { name: 'Supprimer Bannière' }).first().click();
  await page.waitForTimeout(400); assert.equal(await mine.count(), 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}61-editeur-ajouter-section.png` });

  // a button of the model: where it leads, its colour, its shape
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Contenu : Grande bannière' });
  // a title emptied stays empty while she types (it does not jump back to the model's words), and the site follows
  const ttl = right.getByLabel('Titre', { exact: true });
  await ttl.fill(''); await page.waitForTimeout(200);
  assert.equal(await ttl.inputValue(), '');
  await ttl.pressSequentially('Ornella'); await site.getByText('Ornella').first().waitFor({ timeout: 15000 });
  assert.equal(await ttl.inputValue(), 'Ornella');
  const btn = site.locator('section a[data-jeere-pickable="t"]').first();
  await btn.click();
  const style = right.getByRole('region', { name: 'Style du texte choisi' });
  await style.waitFor();
  await style.getByLabel('Destination').selectOption('Lien externe');
  await style.getByLabel('Adresse').fill('https://exemple.com/promo');
  await style.getByRole('button', { name: 'Plein' }).click();
  // two plain choices, the model's look already marked; no « Modèle », no switch
  assert.equal(await style.getByRole('group', { name: 'Style', exact: true }).getByRole('button', { name: 'Modèle' }).count(), 0);
  await style.getByRole('group', { name: 'Forme' }).getByRole('button', { name: 'Arrondi' }).click();
  await pickColor(style, 'Couleur du bouton', '#1E6FE0');
  await page.waitForTimeout(500);
  assert.deepEqual(await btn.evaluate((n) => [n.getAttribute('href'), n.style.borderRadius, n.style.backgroundColor, n.style.color]), ['https://exemple.com/promo', '999px', 'rgb(30, 111, 224)', 'rgb(255, 255, 255)']);
  // its size: typed freely (no « (px) » in the label, « px » inside the box), and the ▲▼ arrows
  const size = style.getByLabel('Taille', { exact: true });
  await size.fill('20'); await page.waitForTimeout(300);
  assert.equal(await btn.evaluate((n) => n.style.fontSize), '20px');
  await style.getByRole('button', { name: 'Taille : plus' }).click(); await style.getByRole('button', { name: 'Taille : plus' }).click(); await page.waitForTimeout(300);
  assert.equal(await size.inputValue(), '22');
  assert.equal(await btn.evaluate((n) => n.style.fontSize), '22px');
  await style.getByRole('button', { name: 'Taille : moins' }).click(); await page.waitForTimeout(300);
  assert.equal(await btn.evaluate((n) => n.style.fontSize), '21px');
  await size.fill('300'); await size.press('Enter'); await page.waitForTimeout(300);
  assert.equal(await btn.evaluate((n) => n.style.fontSize), '300px');
  await size.fill('18'); await size.press('Enter'); await page.waitForTimeout(300);
  assert.equal(await btn.evaluate((n) => n.style.fontSize), '18px');
  await page.screenshot({ path: `${SHOTS}62b-editeur-taille.png` });
  // the background of a section: the theme's colours and any other by its code
  await pickColor(right, 'Fond de la section', '#FFE9F1');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}62-editeur-bouton-style.png` });
  // her logo, imported in the header
  await left.getByRole('button', { name: 'En-tête', exact: true }).click();
  const head = page.getByRole('complementary', { name: 'Contenu : En-tête' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await head.getByRole('group', { name: 'Afficher en haut du site' }).getByRole('button', { name: 'Votre logo' }).click();
  await head.getByLabel('Choisir une image : Votre logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  // a new logo opens the cropping window first
  await page.getByRole('dialog', { name: 'Recadrer le logo' }).getByRole('button', { name: 'Appliquer' }).click();
  await head.getByRole('button', { name: 'Remplacer : Votre logo' }).waitFor({ timeout: 15000 });

  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  const st = w.stores[0].fiche.store, saved = st.site;
  assert.match(st.logo, /^https:\/\//);
  assert.deepEqual(saved.a['/'].map((x) => [x.type, x.title]), [['faq', 'Vos questions'], ['banner', 'Votre titre']]);
  assert.equal(saved.a['/'][1].href, 'page:boutique/');
  assert.deepEqual(Object.values(saved.k), ['https://exemple.com/promo']);
  assert.deepEqual(Object.values(saved.x), [{ btn: 'fill', round: true, fill: '#1E6FE0', size: 18 }]);
  assert.deepEqual(Object.values(saved.s), [{ bg: '#FFE9F1' }]);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor: the first time, a guided visit shows how it works (computer and phone); it can be skipped, and seen again from the « ? »', async () => {
  const w = withModel(world({ firstVisit: true }), 'michou'); const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const tour = page.getByRole('dialog', { name: /^Visite de l’éditeur/ });
  await tour.waitFor({ timeout: 60000 });
  const seen = [];
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(350);
    seen.push(await tour.locator('h2').innerText());
    const card = await tour.locator('h2').locator('xpath=..').boundingBox();
    assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.width <= 1440 && card.y + card.height <= 900, `step ${i + 1}: the card is whole on the screen`);
    if (i === 2) { const lp = await page.getByRole('complementary', { name: 'Sections de la page' }).boundingBox(); assert.ok(card.x >= lp.x + lp.width, 'the card is beside the panel it explains, not over it'); }
    if (i === 2) await page.screenshot({ path: `${SHOTS}65-visite-ordinateur.png` });
    await tour.getByRole('button', { name: i === 6 ? 'C’est parti' : 'Suivant' }).click();
  }
  assert.deepEqual(seen, ['Bienvenue dans votre éditeur', 'Cliquez pour changer', 'Les sections de la page', 'Ajouter une section', 'Ordinateur ou téléphone', 'Une erreur ? Annulez', 'Publier']);
  await tour.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('jehre-editor-tour')), '1');
  await page.reload();
  await page.getByRole('complementary', { name: 'Sections de la page' }).getByRole('list').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500); assert.equal(await tour.count(), 0, 'seen once, it does not come back by itself');
  await page.getByRole('button', { name: 'Revoir la visite de l’éditeur' }).click();
  await tour.waitFor(); await tour.getByRole('button', { name: 'Passer la visite' }).click(); await tour.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []); await ctx.close();
  // on a phone: its own words (toucher, the bar of tools), the card whole on the screen
  const o = await open(browser, PHONE, withModel(world({ firstVisit: true }), 'michou'));
  await o.page.goto(`${BASE}/admin/editeur/`);
  const t2 = o.page.getByRole('dialog', { name: /^Visite de l’éditeur/ });
  await t2.waitFor({ timeout: 60000 });
  const names = [];
  for (let i = 0; i < 5; i++) {
    await o.page.waitForTimeout(350);
    names.push(await t2.locator('h2').innerText());
    const card = await t2.locator('h2').locator('xpath=..').boundingBox();
    assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.width <= 390 && card.y + card.height <= 844, `phone step ${i + 1}: the card is whole on the screen`);
    // the card never hides what it talks about (except the site, which fills the screen)
    if (i === 2 || i === 3 || i === 4) {
      const hole = await o.page.locator('[class*="hole"]').boundingBox();
      assert.ok(card.y + card.height <= hole.y + 1 || card.y >= hole.y + hole.height - 1, `phone step ${i + 1}: the card is beside its part, not over it`);
    }
    if (i === 1) await o.page.screenshot({ path: `${SHOTS}66-visite-telephone.png` });
    if (i === 2) await o.page.screenshot({ path: `${SHOTS}127-visite-telephone-outils.png` });
    await t2.getByRole('button', { name: i === 4 ? 'C’est parti' : 'Suivant' }).click();
  }
  assert.deepEqual(names, ['Bienvenue dans votre éditeur', 'Touchez pour changer', 'Les outils du site', 'Une erreur ? Annulez', 'Publier']);
  await noOverflow(o.page); assert.deepEqual(o.errors, []); await o.ctx.close();
});

await test('editor, SOYEUSE: its logo is drawn with ornamental letters; the editor shows and edits it as plain letters', async () => {
  // a store that keeps the model's name: the ornamental logo stays, and its field reads « SOYEUSE », not unknown signs
  const w = withModel(world(), 'soyeuse'); w.stores[0].fiche.store.name = 'SOYEUSE';
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  const mark = site.locator('.hero__brand').first();
  await mark.waitFor({ timeout: 60000 });
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  assert.match(await mark.evaluate((n) => n.textContent), /[-]/, 'the model draws its name with letters of its own');
  await mark.click();
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.getByRole('button', { name: 'Modifier le texte' }).click();
  const field = page.getByRole('dialog').getByRole('textbox');
  assert.equal(await field.inputValue(), 'SOYEUSE', 'plain letters in the field');
  await field.fill('Maison Awa');
  await page.waitForTimeout(400);
  assert.equal(await mark.evaluate((n) => n.textContent), 'Maison Awa');
  await page.screenshot({ path: `${SHOTS}67-soyeuse-logo.png` });
  assert.deepEqual(errors, []); await ctx.close();
  // a store with its own name: the ornamental logo takes that name by itself, as the other models do
  const o = await open(browser, PHONE, withModel(world(), 'soyeuse'));
  await o.page.goto(`${BASE}/admin/editeur/`);
  const m2 = o.page.frameLocator('iframe[title="Votre site"]').locator('.hero__brand').first();
  await o.page.frameLocator('iframe[title="Votre site"]').locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  await o.page.waitForTimeout(400);
  assert.equal(await m2.evaluate((n) => n.textContent), 'Boutique Test');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

await test('editor, MINUIT: hiding a line of the checklist removes its ticked box with it, and bringing it back restores both', async () => {
  const w = withModel(world(), 'minuit'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const line = site.locator('.prep__list li').first();
  await line.scrollIntoViewIfNeeded();
  assert.equal(await line.locator('svg').count(), 1, 'a line is a ticked box and its words');
  await page.waitForTimeout(900);                                    // the list comes in with the model's own animation
  await line.locator('span').click({ force: true });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.getByRole('button', { name: 'Masquer', exact: true }).click();
  await page.getByRole('navigation', { name: 'Outils du site' }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await line.evaluate((n) => getComputedStyle(n).display), 'none', 'the whole line is gone: the box does not stay alone');
  assert.equal(await site.locator('.prep__list li').nth(1).evaluate((n) => getComputedStyle(n).display !== 'none'), true, 'the other lines stay');
  await page.screenshot({ path: `${SHOTS}68-minuit-ligne-masquee.png` });
  await page.getByRole('navigation', { name: 'Outils du site' }).getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Remettre «/ }).first().click();
  await page.waitForTimeout(300);
  assert.notEqual(await line.evaluate((n) => getComputedStyle(n).display), 'none');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor, the scrolling band (MICHOU): one stable block, ONE text written once that loops without a seam, its colours and speed', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const band = site.locator('.ruban');
  // the texts after the band keep their numbers: what the model offered before is counted the same
  const keyOf = () => site.locator('section h2[data-jeere-pickable]').first().evaluate((n) => n.textContent);
  const firstTitle = await keyOf();
  // its moving pieces are not offered one by one: a touch anywhere on it chooses the band itself
  assert.equal(await band.locator('span[data-jeere-pickable]').count(), 0);
  await band.scrollIntoViewIfNeeded();
  await band.click({ position: { x: 120, y: 10 }, force: true });
  const tools = page.getByRole('navigation', { name: 'Outils : Bandeau défilant' });
  await tools.waitFor();
  // the blue frame is on the band (which does not move), not on a piece of text that runs away
  const steady = async () => site.locator('body').evaluate(() => { const b = document.querySelector('[data-jeere-sel]').getBoundingClientRect(), r = document.querySelector('.ruban').getBoundingClientRect(); return [Math.round(b.left - r.left), Math.round(b.top - r.top), Math.round(b.height - r.height)]; });
  const f1 = await steady(); await page.waitForTimeout(700); const f2 = await steady();
  assert.deepEqual(f1, f2, 'the frame does not move while the text runs'); assert.ok(Math.abs(f1[1]) <= 1 && Math.abs(f1[2]) <= 1, `the frame is the band: ${f1}`);
  // ONE field with everything it says
  await tools.getByRole('button', { name: 'Modifier le texte' }).click();
  const field = page.getByRole('dialog').getByRole('textbox');
  assert.equal(await field.inputValue(), 'Nouvelle collection • Livraison à Abidjan en 48 h • Échange sous 7 jours • Paiement mobile money');
  await field.fill('Soldes de fin d’année • Livraison offerte dès 20 000 F');
  await page.waitForTimeout(500);
  const loop = await band.evaluate((b) => { const tr = b.querySelector('.ruban__track'), kids = [...tr.children], half = kids.length / 2; return { words: [...new Set(kids.map((k) => k.textContent))], twoHalves: kids.slice(0, half).map((k) => k.textContent).join('|') === kids.slice(half).map((k) => k.textContent).join('|'), wide: kids[half].offsetLeft - kids[0].offsetLeft >= b.clientWidth, shift: getComputedStyle(tr).getPropertyValue('--jeere-band').trim() === `-${kids[half].offsetLeft - kids[0].offsetLeft}px`, anim: getComputedStyle(tr).animationName }; });
  assert.deepEqual(loop, { words: ['Soldes de fin d’année', 'Livraison offerte dès 20 000 F'], twoHalves: true, wide: true, shift: true, anim: 'jeere-band' });
  await page.screenshot({ path: `${SHOTS}69-bandeau-defilant.png` });
  // its colours and its speed
  await tools.getByRole('button', { name: 'Couleurs', exact: true }).click();
  await openColor(page.getByRole('dialog'), 'Couleur du bandeau');
  await page.getByRole('dialog').getByRole('group', { name: 'Couleur du bandeau : couleurs de base' }).getByRole('button', { name: 'Rouge' }).click();
  await openColor(page.getByRole('dialog'), 'Couleur du texte du bandeau');
  await page.getByRole('dialog').getByRole('group', { name: 'Couleur du texte du bandeau : couleurs de base' }).getByRole('button', { name: 'Blanc' }).click();
  const slow = await band.evaluate((b) => parseFloat(getComputedStyle(b.querySelector('.ruban__track')).animationDuration));
  await tools.getByRole('button', { name: 'Vitesse', exact: true }).click();
  await page.waitForTimeout(400);
  const fast = await band.evaluate((b) => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color, parseFloat(getComputedStyle(b.querySelector('.ruban__track')).animationDuration)]);
  assert.deepEqual(fast.slice(0, 2), ['rgb(229, 57, 53)', 'rgb(255, 255, 255)']); assert.ok(fast[2] < slow, 'faster');
  await page.screenshot({ path: `${SHOTS}70-bandeau-couleurs.png` });
  assert.equal(await keyOf(), firstTitle);
  await tools.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  assert.deepEqual(Object.values(w.stores[0].fiche.store.site.m), [{ text: 'Soldes de fin d’année • Livraison offerte dès 20 000 F', bg: '#E53935', color: '#FFFFFF', speed: 'fast' }]);
  assert.equal(w.stores[0].fiche.store.site.t, undefined, 'no piece of the band was saved as a text of its own');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor on a phone: a thin bar, her site on the whole screen, one bar of tools at the bottom that becomes the tools of what she touches', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const bar = page.getByRole('navigation', { name: 'Outils du site' });
  await bar.waitFor({ timeout: 30000 });
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  // no side panel: the bar on top (52 px), the site between the two bars, the tools fixed to the bottom
  assert.equal(await page.getByRole('complementary', { name: /Sections de la page|Contenu/ }).count(), 0, 'no side panel on a phone');
  const box = async (l) => { const r = await l.boundingBox(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  assert.deepEqual(await box(page.locator('header').first()), [0, 0, 390, 52]);
  assert.deepEqual(await box(bar), [10, 776, 370, 58]);
  // the site is shown a little smaller, with air around it, in a rounded frame with a soft shadow
  const fr = await page.locator('iframe[title="Votre site"]').evaluate((f) => { const b = f.parentElement.getBoundingClientRect(), c = getComputedStyle(f.parentElement); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), radius: c.borderRadius, shadow: c.boxShadow !== 'none', zoom: Math.round(f.getBoundingClientRect().width / f.offsetWidth * 100) }; });
  assert.deepEqual(fr, { x: 14, y: 64, w: 362, h: 698, radius: '14px', shadow: true, zoom: 88 });
  for (const t of ['Sections', 'Pages', 'Style', 'Thème', 'Ajouter']) await bar.getByRole('button', { name: t, exact: true }).waitFor();
  assert.match(await bar.evaluate((n) => getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter), /blur\(16px\)/);
  await noOverflow(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}52-editeur-telephone.png` });

  // a tool opens a small drawer above the bar; the site stays in view
  await bar.getByRole('button', { name: 'Sections', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Grande bannière', exact: true }).waitFor();
  await page.waitForTimeout(400);                       // its way in is over
  const d = await drawer.boundingBox();
  assert.ok(d.y > 844 * 0.4 && d.y + d.height <= 776, 'the drawer sits just above the bar and leaves the site visible');
  await page.screenshot({ path: `${SHOTS}54-editeur-telephone-sections.png` });
  await drawer.getByRole('button', { name: 'Fermer' }).click(); await drawer.waitFor({ state: 'detached' });

  // she touches a title: framed in blue on the site, and the bar becomes the tools of a text
  const title = site.locator('h1[data-jeere-pickable], h2[data-jeere-pickable]').first();
  await title.click();
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  for (const t of ['Modifier le texte', 'Police', 'Taille', 'Couleur', 'Gras', 'Alignement']) await tools.getByRole('button', { name: t, exact: true }).waitFor();
  await site.locator('[data-jeere-sel]').waitFor();
  assert.match(await site.locator('[data-jeere-sel]').evaluate((n) => getComputedStyle(n).borderColor), /54, 87, 255/, 'a thin blue frame');
  assert.equal(await site.locator('[data-jeere-sel] i').count(), 4, 'four small handles');
  // at this smaller scale the frame is still exactly on the element (both are drawn by the site itself)
  const on = await title.evaluate((n) => { const a = n.getBoundingClientRect(), b = document.querySelector('[data-jeere-sel]').getBoundingClientRect(); return [Math.abs(a.top - b.top) < 1.5, Math.abs(a.height - b.height) < 1.5, b.left >= 0, b.right <= document.documentElement.clientWidth]; });
  assert.deepEqual(on, [true, true, true, true]);
  // every tool is read whole: no word is cut, the ✓ is beside the tools, never over them
  const cut = await tools.evaluate((n) => { const ok = n.querySelector('button[aria-label="Terminer"]').getBoundingClientRect(); const strip = n.firstElementChild.getBoundingClientRect(); return [[...n.querySelectorAll('button span')].every((s) => s.scrollWidth <= s.clientWidth + 1), strip.right <= ok.left + 1, getComputedStyle(n.querySelector('button span')).fontSize]; });
  assert.deepEqual(cut, [true, true, '11.5px']);
  assert.deepEqual(await box(tools), [10, 776, 370, 58], 'the bar did not move');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}53-editeur-telephone-texte.png` });
  await tools.getByRole('button', { name: 'Modifier le texte' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Bonjour Test');
  await site.getByText('Bonjour Test').first().waitFor({ timeout: 15000 });
  await tools.getByRole('button', { name: 'Gras', exact: true }).click();
  await page.waitForFunction(() => true); await page.waitForTimeout(300);
  assert.equal(await site.getByText('Bonjour Test').first().evaluate((n) => n.style.fontWeight), '700');
  await tools.getByRole('button', { name: 'Taille', exact: true }).click();
  const before = parseInt(await page.getByRole('dialog').locator('output').innerText(), 10);
  await page.getByRole('dialog').getByRole('button', { name: 'Plus grand' }).click();
  await page.waitForTimeout(300);
  assert.equal(await site.getByText('Bonjour Test').first().evaluate((n) => n.style.fontSize), `${before + 2}px`);
  await tools.getByRole('button', { name: 'Couleur', exact: true }).click();
  await openColor(page.getByRole('dialog'), 'Couleur du texte');
  await page.getByRole('dialog').getByRole('group', { name: 'Couleur du texte : couleurs de base' }).getByRole('button', { name: 'Rouge' }).click();
  await page.waitForTimeout(300);
  assert.equal(await site.getByText('Bonjour Test').first().evaluate((n) => n.style.color), 'rgb(229, 57, 53)');
  await page.screenshot({ path: `${SHOTS}55-editeur-telephone-couleur.png` });
  // ✓ ends it: the site's tools come back and the frame goes
  await tools.getByRole('button', { name: 'Terminer' }).click();
  await bar.getByRole('button', { name: 'Sections', exact: true }).waitFor();
  await site.locator('[data-jeere-sel]').waitFor({ state: 'hidden' });

  // a picture: replace, frame, remove (it stays greyed in the editor so she can bring it back)
  const img = site.locator('img[data-jeere-pickable="i"]').first();
  await img.scrollIntoViewIfNeeded(); await img.click();
  for (const t of ['Remplacer la photo', 'Ajuster / Cadre', 'Supprimer']) await tools.getByRole('button', { name: t, exact: true }).waitFor();
  assert.deepEqual(await tools.locator('div button span').allInnerTexts(), ['Remplacer', 'Recadrer', 'Cadrer', 'Supprimer']);
  // the frame is on what one SEES of the picture (a picture cropped by its box is framed where it is cropped), with small handles
  const seen = await img.evaluate((n) => { const b = document.querySelector('[data-jeere-sel]').getBoundingClientRect(); let r = n.getBoundingClientRect(), box = { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflow !== 'visible') { const q = p.getBoundingClientRect(); box = { top: Math.max(box.top, q.top), bottom: Math.min(box.bottom, q.bottom), left: Math.max(box.left, q.left), right: Math.min(box.right, q.right) }; } } const h = document.querySelector('[data-jeere-sel] i').getBoundingClientRect(); return [Math.abs(b.top - box.top) < 2, Math.abs(b.bottom - box.bottom) < 2, Math.round(h.width)]; });
  assert.deepEqual(seen, [true, true, 6]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}56-editeur-telephone-image.png` });
  await tools.getByRole('button', { name: 'Ajuster / Cadre' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Entière' }).click();
  await page.waitForTimeout(300);
  assert.equal(await img.evaluate((n) => n.style.objectFit), 'contain');
  // « Supprimer »: the picture is gone from the site (not just faded), the bar goes back to the site's tools,
  // and « Ajouter » lists it to bring it back
  await tools.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await bar.getByRole('button', { name: 'Ajouter', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await img.evaluate((n) => [n.style.display, n.style.opacity]), ['none', '']);
  await site.locator('[data-jeere-sel]').waitFor({ state: 'hidden' });
  await bar.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remettre une photo' }).click();
  await page.waitForTimeout(300);
  assert.equal(await img.evaluate((n) => n.style.display), '');
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
  // a section chosen in « Sections »: colour, spaces, hide, move
  await bar.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Grande bannière', exact: true }).click();
  for (const t of ['Couleur', 'Espaces', 'Masquer']) await tools.getByRole('button', { name: t, exact: true }).waitFor();
  await tools.getByRole('button', { name: 'Masquer', exact: true }).click();
  await bar.getByRole('button', { name: 'Sections', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await site.locator('section').first().evaluate((n) => n.style.display), 'none', 'a hidden section is gone from the editor too');
  // the pages of the model, from the top bar and from « Pages »
  await bar.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Boutique', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
  await noOverflow(page);

  // nothing was live until « Publier »; then her changes are in her store, each in its place
  assert.equal(w.stores[0].fiche.store.site, undefined);
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  const saved = w.stores[0].fiche.store.site;
  assert.deepEqual(Object.values(saved.t), ['Bonjour Test']);
  assert.deepEqual(Object.values(saved.x), [{ bold: true, size: before + 2, color: '#E53935' }]);
  assert.deepEqual(Object.values(saved.f), [{ fit: 'contain' }]);
  assert.equal(Object.keys(saved.h).length, 1);
  assert.deepEqual(await box(bar), [10, 776, 370, 58], 'the bar is still fixed to the bottom');
  assert.deepEqual(errors, []); await ctx.close();

  // a one-page booking model: no page menu, the same tools
  const w2 = withModel(world(), 'regard'); const o = await open(browser, PHONE, w2);
  await o.page.goto(`${BASE}/admin/editeur/`);
  await o.page.getByRole('navigation', { name: 'Outils du site' }).waitFor({ timeout: 30000 });
  await o.page.frameLocator('iframe[title="Votre site"]').locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  assert.equal(await o.page.getByRole('button', { name: /^Page :/ }).count(), 0, 'a one-page model has no page menu');
  w2.conflict = true;
  await o.page.getByRole('navigation', { name: 'Outils du site' }).getByRole('button', { name: 'Style', exact: true }).click();
  await o.page.getByRole('dialog').getByRole('button', { name: 'Classique' }).click();
  await o.page.getByRole('button', { name: 'Publier' }).click();
  await o.page.getByText('Votre boutique a changé entre-temps').waitFor();
  assert.equal(w2.stores[0].fiche.store.site, undefined);
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

await test('from payment to a live site: the model bought is in the account at once (her store is made for her), « Modifier » opens it, « Publier » puts it online', async () => {
  // she has no store yet, and the payment server writes the purchase a few seconds after the card is accepted
  const w = world({ stores: [], orders: [] }); w.models = [{ model: 'michou', install: false }]; w.modelsLate = 2;
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/modeles/?modele=ok&nom=michou`); await h1(page, 'Modèles de designer');
  await page.getByText('Nous mettons le modèle MICHOU dans votre compte…').waitFor();
  await page.getByText('Paiement reçu. Le modèle MICHOU est à vous, il est dans votre compte.').waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).search, '', 'the payment answer leaves the address: a reload does not replay it');
  // her store exists, with the model on it, not online yet
  assert.equal(w.stores.length, 1);
  const st = w.stores[0];
  assert.equal(st.slug, 'boutique-test'); assert.equal(st.published, false); assert.deepEqual(st.fiche.store, { name: 'Boutique Test', model: 'michou' });
  await h1(page, 'Ma boutique');
  await page.getByText('Modèle MICHOU', { exact: true }).waitFor();
  await page.screenshot({ path: `${SHOTS}45-modele-achete.png` });
  // « Modifier mon site » carries the site's own id to the editor, which loads that site
  const edit = page.getByRole('link', { name: 'Modifier mon site' }).first();
  assert.equal(await edit.getAttribute('href'), `/admin/editeur/?b=${st.id}`);
  await edit.click();
  await page.getByText('Brouillon', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('iframe[title="Votre site"]').getAttribute('src'), 'https://kreeative.xyz/concepts/michou/');
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  // a draft: « Enregistrer » keeps it without putting anything online
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  await page.getByRole('complementary', { name: 'Contenu : Grande bannière' }).getByRole('textbox').first().fill('Ma première collection');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Brouillon enregistré. Votre site n’est pas encore en ligne.').waitFor();
  assert.equal(st.published, false); assert.deepEqual(Object.values(st.fiche.store.site.t), ['Ma première collection']);
  // « Publier »: online, at her address, with what she wrote
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText('Votre site est en ligne · boutique-test.store.jehre.com').waitFor();
  await page.getByText('En ligne', { exact: true }).waitFor();
  assert.equal(st.published, true); assert.equal(st.fiche.store.model, 'michou'); assert.deepEqual(Object.values(st.fiche.store.site.t), ['Ma première collection']);
  assert.equal(await page.getByRole('link', { name: 'Voir mon site' }).getAttribute('href'), 'https://boutique-test.store.jehre.com');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}54-editeur-publie.png` });
  assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Publier' }).isDisabled(), true);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a model bought for a store she already has is put on that store; a taken address gets another one', async () => {
  const w = world(); w.models = [{ model: 'seve', install: false }]; w.modelsLate = 1;
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/modeles/?modele=ok&nom=seve`); await h1(page, 'Modèles de designer');
  await page.getByText('Paiement reçu. Le modèle SÈVE est à vous, il est dans votre compte.').waitFor({ timeout: 30000 });
  // her only model is the one in use (the server reads it the same way): nothing of her store is rewritten
  assert.equal(w.stores.length, 1, 'no second store is made'); assert.equal(w.stores[0].fiche.products.length, 3);
  assert.equal(await page.getByRole('link', { name: 'Modifier mon site' }).first().getAttribute('href'), `/admin/editeur/?b=${w.stores[0].id}`);
  await noOverflow(page);
  await ctx.close();
  const w2 = world({ stores: [], orders: [] }); w2.models = [{ model: 'vernie', install: false }]; w2.taken = ['boutique-test'];
  const o = await open(browser, DESK, w2);
  await o.page.goto(`${BASE}/admin/modeles/`);
  // she paid some time ago and never had a store: opening her dashboard makes her site, once, and shows it
  await o.page.getByText('Modèle VERNIE').waitFor(); await h1(o.page, 'Ma boutique');
  await o.page.reload(); await o.page.getByText('Modèle VERNIE').waitFor();
  assert.equal(w2.stores.length, 1); assert.equal(w2.stores[0].slug, 'boutique-test-2'); assert.equal(w2.stores[0].fiche.store.model, 'vernie'); assert.equal(w2.stores[0].published, false);
  assert.deepEqual([...errors, ...o.errors], []); await o.ctx.close();
});

await test('a model is seen inside Jehre by anyone, without an account; only « Choisir ce modèle » asks for one', async () => {
  // someone who received a link, without an account: the model shows, in Jehre's viewer
  const out = await open(browser, PHONE, world(), { logged: false });
  await out.page.goto(`${BASE}/modeles/michou/`);
  await out.page.getByRole('group', { name: 'Modèle MICHOU · Streetwear' }).waitFor();
  assert.equal(new URL(out.page.url()).pathname, '/modeles/michou/', 'no login wall');
  assert.equal(await out.page.locator('iframe[title="Modèle MICHOU"]').getAttribute('src'), 'https://kreeative.xyz/concepts/michou/');
  await out.page.frameLocator('iframe[title="Modèle MICHOU"]').locator('h1, h2').first().waitFor({ timeout: 30000 });
  await out.page.waitForTimeout(1200);
  await out.page.screenshot({ path: `${SHOTS}46-modele-public-telephone.png` });
  // the dashboard's own preview address, without a session, leads to the public one
  await out.page.goto(`${BASE}/admin/modeles/apercu/?m=regard`);
  await out.page.waitForURL(/\/modeles\/regard\/$/);
  await out.page.getByRole('group', { name: /Modèle REGARD/ }).waitFor();
  // choosing it is what needs the account, and the page says so
  await out.page.getByRole('link', { name: 'Choisir ce modèle' }).click();
  await out.page.waitForURL(/\/compte\/\?suite=modele&m=regard#inscription$/);
  await out.page.getByText('Créez votre compte pour choisir le modèle REGARD.').waitFor();
  await out.ctx.close();

  // with an account: the same link, the same viewer
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/modeles/michou/`);
  await page.waitForFunction(() => document.querySelector('a[href="/admin/modeles/?choisir=michou"]'));
  // as a theme inside Shopify: back, the sizes, full screen, one button; then the site itself
  await page.getByRole('group', { name: 'Modèle MICHOU · Streetwear' }).waitFor();
  assert.equal(await page.locator('iframe[title="Modèle MICHOU"]').getAttribute('src'), 'https://kreeative.xyz/concepts/michou/');
  await page.frameLocator('iframe[title="Modèle MICHOU"]').locator('h1, h2').first().waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('button', { name: 'Ordinateur' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('iframe').getAttribute('width'), '1280');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}47-modele-apercu-dans-jehre.png` });
  await page.getByRole('button', { name: 'Téléphone' }).click();
  assert.equal(await page.locator('iframe').getAttribute('width'), '390');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}49-modele-apercu-telephone.png` });
  await page.getByRole('button', { name: 'Plein écran' }).click();
  await page.waitForTimeout(450);
  assert.equal(await page.getByRole('link', { name: 'Choisir ce modèle' }).count(), 0);
  const box = await page.locator('iframe').boundingBox();
  assert.equal(Math.round(box.width), 1280, 'the frame takes the whole screen once its size has settled'); assert.equal(Math.round(box.height), 860);
  await page.getByRole('button', { name: 'Quitter le plein écran' }).click();
  // « Choisir ce modèle » leads to the three ways to get it
  await page.getByRole('link', { name: 'Choisir ce modèle' }).click();
  await page.getByRole('dialog').getByText('Comment voulez-vous l’installer ?').waitFor();
  await page.getByRole('dialog').getByText('Modèle MICHOU').waitFor();
  // a model she owns: the preview offers to edit her site, not to buy it again
  const w2 = withModel(world(), 'seve'); const o = await open(browser, DESK, w2);
  await o.page.goto(`${BASE}/admin/modeles/apercu/?m=seve`);
  assert.equal(await o.page.getByRole('link', { name: 'Modifier mon site' }).getAttribute('href'), `/admin/editeur/?b=${w2.stores[0].id}`);
  await o.page.goto(`${BASE}/admin/modeles/apercu/?m=inconnu`);
  await o.page.getByText('Ce modèle n’existe pas').waitFor();
  assert.deepEqual([...errors, ...o.errors], []); await ctx.close(); await o.ctx.close();
});

await test('editor: without a model there is nothing to edit, and no example store is shown', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  await page.getByText('Choisissez d’abord un modèle').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByRole('link', { name: 'Voir les modèles' }).click();
  await h1(page, 'Modèles de designer');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('the founder’s stores that ARE the models (REGARD, SÈVE…) open their model in the editor, without a purchase', async () => {
  const s = { ...store(), slug: 'regard' }; s.fiche = { ...s.fiche, store: { ...s.fiche.store, name: 'REGARD' } };
  const w = world({ stores: [s], models: [] }); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  await page.locator('iframe[src*="/concepts/regard/"]').waitFor({ timeout: 30000 });
  assert.equal(await page.getByText('Choisissez d’abord un modèle').count(), 0);
  await page.goto(`${BASE}/admin/`);
  await page.getByRole('link', { name: /Rendez-vous/ }).first().waitFor({ timeout: 30000 });   // a booking model: its own menu
  assert.deepEqual(errors, []); await ctx.close();
});

const at = (dayOffset, h, m = 0) => { const d = new Date(); d.setUTCHours(h, m, 0, 0); return new Date(d.getTime() + dayOffset * 864e5).toISOString(); };
const appt = (id, number, status, start, name, service, extra = {}) => ({ id, number, status, starts_at: start, ends_at: new Date(Date.parse(start) + 90 * 60000).toISOString(), service: { name: service, duration: 90, price: 20000 }, customer: { name, phone: '+225 07 08 09 10 11' }, total: 20000, deposit: 0, deposit_status: '', currency: 'XOF', ...extra });

await test('appointments: a booking model puts « Rendez-vous » first; requests are confirmed, the day is listed, the status is saved on the server', async () => {
  const w = withModel(world(), 'regard');
  w.booking = { settings: bookingSettings([{ id: 's1', name: 'Pose classique', category: 'Cils', duration: 90, price: 20000, from: false, deposit: null, desc: '', photo: '', active: true, staff: [] }]),
    appts: [appt('a1', 11, 'confirme', at(0, 10), 'Mariam K.', 'Pose classique', { deposit: 5000, deposit_status: 'en_attente' }), appt('a2', 12, 'en_attente', at(1, 14, 30), 'Fatou D.', 'Rehaussement'), appt('a3', 13, 'annule', at(0, 16), 'Annulée A.', 'Pose classique')] };
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/rendez-vous/`); await h1(page, 'Rendez-vous');
  // the menu of a booking store
  assert.deepEqual((await page.locator('aside nav a').allInnerTexts()).slice(0, 3), ['Accueil', 'Rendez-vous', 'Prestations']);
  await page.getByText('1 demande à confirmer').waitFor();
  await page.getByText('jehre.com/rdv/?b=boutique-test').waitFor();
  // today: the confirmed appointment, not the cancelled one
  const main = page.locator('main');
  await main.getByText('Mariam K.').waitFor();
  assert.equal(await main.getByText('Annulée A.').count(), 0);
  assert.equal(await main.getByText('10:00').count(), 1, 'the hour is shown in the store’s time zone');
  await page.screenshot({ path: `${SHOTS}70-rendez-vous.png`, fullPage: true });
  // a request: confirmed from the list
  await page.getByRole('button', { name: 'Confirmer le rendez-vous de Fatou D.' }).click();
  await page.getByText('Aucune demande en attente').waitFor();
  assert.equal(w.booking.appts[1].status, 'confirme');
  assert.equal(await page.getByRole('region', { name: 'Demandes à confirmer' }).count(), 0);
  // the detail: status and deposit
  await main.getByText('Mariam K.').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('Rendez-vous n° 11').waitFor();
  await sheet.getByText(/5.000.FCFA · Acompte à recevoir/).waitFor();
  await sheet.getByRole('button', { name: 'Acompte reçu' }).click();
  await sheet.getByText(/Acompte reçu$/).waitFor();
  assert.equal(w.booking.appts[0].deposit_status, 'recu');
  w.bookingFails = true;
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await sheet.getByText('Ce créneau a été repris par un autre rendez-vous.').waitFor();
  assert.equal(w.booking.appts[0].status, 'confirme');
  w.bookingFails = false;
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await sheet.getByRole('button', { name: 'Remettre « Confirmé »' }).waitFor();
  assert.equal(w.booking.appts[0].status, 'termine');
  await page.keyboard.press('Escape');
  // tomorrow
  await page.getByRole('group', { name: 'Jours de la semaine' }).getByRole('button').nth(4).click();
  await main.getByText('Fatou D.').waitFor();
  await page.getByRole('button', { name: 'Revenir à aujourd’hui' }).click();
  await main.getByText('Mariam K.').waitFor();
  // an appointment she writes herself; a taken slot is refused by the server and said so
  await page.getByRole('button', { name: 'Ajouter un rendez-vous' }).click();
  const add = page.getByRole('dialog');
  await add.getByRole('button', { name: 'Ajouter le rendez-vous' }).click();
  await add.getByText('Le nom de la cliente est nécessaire.').waitFor();
  await add.getByLabel('Nom de la cliente').fill('Aïcha B.');
  await add.getByLabel('Heure').fill('10:00');
  await add.getByRole('button', { name: 'Ajouter le rendez-vous' }).click();
  await add.getByText('Ce créneau est déjà occupé').waitFor();
  await add.getByLabel('Heure').fill('15:30');
  await add.getByLabel('Téléphone').fill('+225 05 06 07 08 09');
  await add.getByRole('button', { name: 'Ajouter le rendez-vous' }).click();
  await main.getByText('Aïcha B.').waitFor();
  assert.equal(await main.getByText('15:30').count(), 1);
  const made = w.booking.appts.at(-1);
  assert.equal(made.starts_at.slice(11, 16), '15:30', 'Abidjan is on UTC: 15:30 there is 15:30 UTC'); assert.equal(made.customer.phone, '+225 05 06 07 08 09'); assert.equal(made.service.name, 'Pose classique');
  // moved to another hour: a taken hour is refused, a free one is saved
  await main.getByText('Aïcha B.').click();
  const det = page.getByRole('dialog');
  await det.getByRole('button', { name: 'Changer le jour ou l’heure' }).click();
  assert.equal(await det.getByLabel('Nouvelle heure').inputValue(), '15:30');
  await det.getByLabel('Nouvelle heure').fill('10:00');
  await det.getByRole('button', { name: 'Déplacer le rendez-vous' }).click();
  await det.getByText('Ce créneau est déjà occupé.').waitFor();
  await det.getByLabel('Nouvelle heure').fill('16:15');
  await det.getByRole('button', { name: 'Déplacer le rendez-vous' }).click();
  await det.getByText(/16:15 – 17:45/).waitFor();
  assert.equal(made.starts_at.slice(11, 16), '16:15');
  // her own note
  await det.getByRole('button', { name: 'Ajouter une note' }).click();
  await det.getByLabel('Note privée').fill('Allergie à la colle classique.');
  await det.getByRole('button', { name: 'Enregistrer la note' }).click();
  await det.getByRole('button', { name: 'Modifier la note' }).waitFor();
  assert.equal(made.memo, 'Allergie à la colle classique.');
  await page.keyboard.press('Escape');
  // a blocked slot: shown on its day, and removed
  await page.getByRole('button', { name: 'Bloquer un créneau' }).click();
  const bk = page.getByRole('dialog');
  await bk.getByLabel('De', { exact: true }).fill('14:00'); await bk.getByLabel('À', { exact: true }).fill('13:00');
  await bk.getByRole('button', { name: 'Bloquer ce créneau' }).click();
  await bk.getByText('La fin doit être après le début.').waitFor();
  await bk.getByLabel('De', { exact: true }).fill('12:00'); await bk.getByLabel('Raison').fill('Pause déjeuner');
  await bk.getByRole('button', { name: 'Bloquer ce créneau' }).click();
  await main.getByText('Bloqué jusqu’à 13:00').waitFor();
  await main.getByText('Pause déjeuner').waitFor();
  assert.equal(w.booking.blocks.length, 1); assert.equal(w.booking.blocks[0].starts_at.slice(11, 16), '12:00');
  await page.screenshot({ path: `${SHOTS}73-agenda-complet.png`, fullPage: true });
  await page.getByRole('button', { name: 'Débloquer le créneau de 12:00' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Bloqué jusqu’à'));
  assert.equal(w.booking.blocks.length, 0);
  // her clients come from her appointments, not from orders
  await page.goto(`${BASE}/admin/clients/`); await h1(page, 'Clientes');
  await page.getByText('2 clientes').waitFor();
  const rows = await page.locator('main ul li').allInnerTexts();
  assert.match(rows[0].replace(/\s+/g, ' '), /Mariam K\..*Pose classique.*80.000.FCFA.*4.visites · 1.à venir/);
  assert.match(rows[1].replace(/\s+/g, ' '), /Fatou D\..*fatou@exemple\.com.*1.visite · 1.absence/);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('services: add, edit and delete write only the services; her other booking settings travel untouched', async () => {
  const w = withModel(world(), 'vernie'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/prestations/`); await h1(page, 'Prestations');
  await page.getByText('Aucune prestation pour l’instant').waitFor();
  await page.getByRole('button', { name: 'Ajouter une prestation' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Ajouter la prestation' }).click();
  await sheet.getByText('Donnez un nom à la prestation.').waitFor();
  assert.equal(w.calls.some((c) => c.path === '/functions/v1/bookings' && c.body.action === 'save'), false);
  await sheet.getByLabel('Nom de la prestation').fill('Pose gel');
  await sheet.getByLabel('Catégorie').fill('Ongles');
  await sheet.getByLabel('Durée (minutes)').fill('75');
  await sheet.getByLabel('Prix (FCFA)').fill('12 000');
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}71-prestation-telephone.png` });
  await sheet.getByRole('button', { name: 'Ajouter la prestation' }).click();
  await page.locator('main').getByText('Pose gel').waitFor();
  await page.locator('main').getByText(/Ongles · 1 h 15/).waitFor();
  const S = () => w.booking.settings;
  assert.deepEqual(S().services.map((x) => [x.name, x.category, x.duration, x.price, x.deposit, x.active]), [['Pose gel', 'Ongles', 75, 12000, null, true]]);
  assert.equal(S().step, 30); assert.deepEqual(S().payments, ['Sur place']); assert.equal(S().timezone, 'Africa/Abidjan');
  // an option the client can add
  await page.getByRole('button', { name: 'Ajouter une option' }).click();
  await sheet.getByLabel('Nom de l’option').fill('Dépose');
  await sheet.getByLabel('Durée en plus (minutes)').fill('15'); await sheet.getByLabel('Prix (FCFA)').fill('2000');
  await sheet.getByRole('button', { name: 'Ajouter l’option' }).click();
  await page.getByRole('region', { name: 'Options' }).getByText('Dépose', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Options' }).getByText(/\+ 2.000.FCFA/).waitFor();
  assert.deepEqual(S().addons.map((x) => [x.name, x.duration, x.price, x.active]), [['Dépose', 15, 2000, true]]);
  assert.equal(S().services.length, 1, 'adding an option leaves the services as they were');
  await page.getByRole('button', { name: 'Modifier l’option Dépose' }).click();
  await sheet.getByRole('button', { name: 'Supprimer cette option' }).click();
  await page.waitForFunction(() => !document.querySelector('main').innerText.includes('Dépose'));
  assert.deepEqual(S().addons, []);
  await page.getByRole('button', { name: 'Modifier Pose gel' }).click();
  await sheet.getByRole('switch', { name: 'Prix à partir de' }).click();
  await sheet.getByLabel('Acompte').fill('3000');
  await sheet.getByRole('switch', { name: 'Proposée à la réservation' }).click();
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await page.locator('main').getByText(/Masquée/).waitFor();
  assert.equal(S().services[0].deposit, 3000); assert.equal(S().services[0].active, false); assert.equal(S().services[0].from, true); assert.equal(S().services.length, 1);
  await page.locator('main').getByText(/Dès 12.000.FCFA/).waitFor();
  await page.getByRole('button', { name: 'Modifier Pose gel' }).click();
  await sheet.getByRole('button', { name: 'Supprimer cette prestation' }).click();
  await sheet.getByRole('button', { name: 'Oui, supprimer' }).click();
  await page.getByText('Aucune prestation pour l’instant').waitFor();
  assert.deepEqual(S().services, []);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('booking hours and rules: hours, a break, special days, the team, the end date, the time zone, the deposit and the policies are saved; services travel untouched', async () => {
  const w = withModel(world(), 'minuit');
  w.booking = { settings: bookingSettings([{ id: 's1', name: 'Pose classique', category: 'Cils', duration: 90, price: 20000, from: false, deposit: null, desc: '', photo: '', active: true, staff: [] }]), appts: [] };
  const before = JSON.parse(JSON.stringify(w.booking.settings));
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/rendez-vous/`); await h1(page, 'Rendez-vous');
  await page.getByRole('link', { name: 'Horaires et règles' }).click();
  await h1(page, 'Horaires et réservation');
  const save = page.getByRole('button', { name: 'Enregistrer' });
  await save.waitFor(); assert.equal(await save.isDisabled(), true);
  assert.equal(await page.getByRole('switch', { name: 'Ouvert le dimanche' }).getAttribute('aria-checked'), 'false');
  await page.getByRole('switch', { name: 'Ouvert le lundi' }).click();
  const tue = page.getByRole('group', { name: 'mardi' });
  await tue.getByLabel('Fermeture').fill('08:00');
  await save.click();
  await page.getByText('Le mardi, la fermeture doit être après l’ouverture.').waitFor();
  assert.equal(w.calls.some((c) => c.path === '/functions/v1/bookings' && c.body.action === 'save'), false);
  await tue.getByLabel('Fermeture').fill('19:30');
  await tue.getByLabel('Pause de').fill('13:00'); await tue.getByLabel('à', { exact: true }).fill('14:00');
  await page.getByRole('switch', { name: 'Confirmer automatiquement' }).click();
  await page.getByLabel('Un créneau toutes les').selectOption('45 minutes');
  await page.getByLabel('Demander').selectOption('Un montant fixe');
  await page.getByLabel('Montant (FCFA)').fill('5000');
  await page.getByRole('checkbox', { name: 'Wave' }).check();
  await page.getByLabel('Réserver jusqu’à').selectOption('Une date précise (j’ouvre mon agenda)');
  await page.getByLabel('Réservations ouvertes jusqu’au').fill('2027-01-31');
  await page.getByLabel('Fuseau horaire').selectOption('Paris, Bruxelles');
  const sp = page.getByRole('region', { name: 'Jours particuliers' });
  assert.equal(await sp.getByRole('button', { name: 'Ajouter ce jour' }).isDisabled(), true);
  await sp.getByLabel('Date').fill('2026-12-25'); await sp.getByRole('checkbox', { name: 'Ouvert ce jour-là' }).uncheck();
  await sp.getByRole('button', { name: 'Ajouter ce jour' }).click();
  await sp.getByText('vendredi 25 décembre').waitFor(); await sp.getByText('Fermé', { exact: true }).waitFor();
  await sp.getByLabel('Date').fill('2026-12-20'); await sp.getByLabel('De', { exact: true }).fill('10:00'); await sp.getByLabel('Jusqu’à').fill('15:00');
  await sp.getByRole('button', { name: 'Ajouter ce jour' }).click();
  await sp.getByText('Ouvert de 10:00 à 15:00').waitFor();
  const team = page.getByRole('region', { name: 'Équipe' });
  await team.getByLabel('Prénom').fill('Mariam'); await team.getByLabel('Spécialité').fill('Sourcils');
  await team.getByRole('button', { name: 'Ajouter cette personne' }).click();
  await team.getByText('Mariam').waitFor();
  await team.getByRole('button', { name: 'Retirer Kady' }).click();
  await page.getByLabel('Adresse du studio').fill('Riviera 2, Abidjan');
  await page.getByLabel('Retard').fill('Dix minutes de retard au plus.');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}72-horaires-et-regles.png` });
  await save.click();
  await page.getByText('Enregistré.').waitFor();
  const S = w.booking.settings;
  assert.equal(S.hours[1].open, false);
  assert.deepEqual(S.hours[2], { open: true, from: '09:00', to: '19:30', breaks: [{ from: '13:00', to: '14:00' }] });
  assert.deepEqual(S.hours[3], before.hours[3]);
  assert.equal(S.autoConfirm, false); assert.equal(S.step, 45); assert.deepEqual(S.deposit, { mode: 'fixed', value: 5000 });
  assert.deepEqual(S.payments, ['Sur place', 'Wave']); assert.equal(S.address, 'Riviera 2, Abidjan'); assert.equal(S.policies.late, 'Dix minutes de retard au plus.');
  assert.deepEqual(S.services.map((x) => x.name), ['Pose classique']); assert.equal(S.lead, 120);
  assert.equal(S.openUntil, '2027-01-31'); assert.equal(S.timezone, 'Europe/Paris');
  assert.deepEqual(S.special, [{ date: '2026-12-20', open: true, from: '10:00', to: '15:00' }, { date: '2026-12-25', open: false, from: '10:00', to: '16:00' }]);
  assert.deepEqual(S.staff.map((x) => [x.name, x.role, x.active]), [['Mariam', 'Sourcils', true]]);
  assert.equal(await save.isDisabled(), true);
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('subscription: the plan of this store, the five plans with their prices (no free plan, no weekly price); choosing one asks Stripe for THIS store; back from Stripe the plan is active', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/abonnement/`); await h1(page, 'Abonnement');
  await page.getByText('Boutique Test · formule Essentiel').waitFor();
  const plans = await page.locator('main > div > ul > li').evaluateAll((els) => els.map((li) => [li.querySelector('h2').textContent, li.querySelector('p b').textContent.replace(/\s/g, ' '), [...li.querySelectorAll('button')].map((b) => b.textContent)]));
  assert.deepEqual(plans, [['Essentiel', '3 500 FCFA', []], ['Croissance', '7 500 FCFA', ['Choisir Croissance']], ['Pro', '15 000 FCFA', ['Choisir Pro']], ['Business', '30 000 FCFA', ['Choisir Business']], ['Entreprise', '60 000 FCFA', ['Choisir Entreprise']]]);
  assert.ok((await page.locator('main').innerText()).includes('Jusqu’à 10 commandes par mois'), 'Essentiel: 10 orders');
  assert.equal(await page.getByText('Gratuit', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Votre formule').count(), 1);
  await page.screenshot({ path: `${SHOTS}80-abonnement.png`, fullPage: true });
  await page.getByRole('button', { name: 'Choisir Pro au mois' }).click();
  await page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const sub = w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'subscribe');
  assert.deepEqual({ kind: sub.body.kind, plan: sub.body.plan, period: sub.body.period, storeId: sub.body.storeId }, { kind: 'boutique', plan: 'pro', period: 'mois', storeId: w.stores[0].id });
  assert.ok(sub.body.returnUrl.endsWith('/admin/abonnement/'));
  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click();
  await page.waitForFunction(() => true); assert.ok(w.calls.some((c) => c.path === '/functions/v1/billing' && c.body.action === 'portal'));
  // back from Stripe: the plan is read from Stripe at once
  w.planAfter = { plan: 'pro', plan_until: '2026-12-23T10:00:00.000Z' };
  await page.goto(`${BASE}/admin/abonnement/?abonnement=ok`);
  await page.getByText('Votre formule est active.').waitFor();
  await page.getByText(/Boutique Test · formule Pro jusqu’au 23 décembre 2026/).waitFor();
  assert.equal(new URL(page.url()).search, '');
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  // a store still on the old free plan: no plan; she is asked to choose one (her store stays online)
  const w2 = world(); w2.stores[0].plan = 'gratuit'; const o = await open(browser, PHONE, w2);
  await o.page.goto(`${BASE}/admin/abonnement/`); await h1(o.page, 'Abonnement');
  await o.page.getByText('Choisissez une formule', { exact: true }).waitFor();
  assert.equal(await o.page.getByRole('button', { name: /à la semaine/ }).count(), 0);
  await o.page.screenshot({ path: `${SHOTS}129-abonnement-sans-formule.png`, fullPage: true });
  await o.page.getByRole('button', { name: 'Choisir Essentiel au mois' }).click();
  await o.page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  assert.equal(w2.calls.find((c) => c.body.action === 'subscribe').body.period, 'mois');
  await o.page.goto(`${BASE}/admin/`); await o.page.getByRole('link', { name: 'Choisir une formule' }).waitFor();
  assert.equal(await o.page.getByRole('button', { name: 'Gérer mon abonnement' }).count(), 0);
  assert.deepEqual([...errors, ...o.errors], []); await ctx.close(); await o.ctx.close();
});

await test('domain name: a domain she already owns is connected (DNS lines shown, then verified, then removed); one can be searched and bought by card', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/domaine/`); await h1(page, 'Nom de domaine');
  await page.getByText('boutique-test.store.jehre.com').waitFor();
  // a wrong name is refused before any call; a name used by another store is refused by the server
  await page.getByLabel('Votre domaine').fill('pas un domaine');
  await page.getByRole('button', { name: 'Relier' }).click();
  await page.getByText('Écrivez le domaine sans espace ni « https », par exemple maboutique.com.').waitFor();
  assert.equal(w.calls.some((c) => c.path === '/functions/v1/domains'), false);
  await page.getByLabel('Votre domaine').fill('pris.com'); await page.getByRole('button', { name: 'Relier' }).click();
  await page.getByText('Ce domaine est déjà relié à une autre boutique Jehre.').waitFor();
  assert.equal(w.stores[0].custom_domain, null);
  // hers: saved, the two DNS lines to write, not active yet
  await page.getByLabel('Votre domaine').fill('https://MaBoutique.com/'); await page.getByRole('button', { name: 'Relier' }).click();
  await page.getByText('maboutique.com est enregistré.').waitFor();
  assert.equal(w.stores[0].custom_domain, 'maboutique.com');
  const dns = await page.getByRole('region', { name: 'Réglages DNS' }).locator('tbody tr').allInnerTexts();
  assert.deepEqual(dns.map((x) => x.replace(/\s+/g, ' ')), ['A @ 76.76.21.21', 'CNAME www cname.vercel-dns.com']);
  await page.getByText('En attente de vos réglages DNS').waitFor();
  await page.screenshot({ path: `${SHOTS}81-domaine.png`, fullPage: true });
  await page.getByRole('button', { name: 'Vérifier maintenant' }).click();
  await page.getByText('Pas encore : les réglages peuvent mettre jusqu’à 24 h').waitFor();
  w.dnsReady = true;
  await page.getByRole('button', { name: 'Vérifier maintenant' }).click();
  await page.getByText('maboutique.com est actif. Votre boutique répond à cette adresse.').waitFor();
  await page.getByText('Actif', { exact: true }).waitFor();
  assert.equal(w.stores[0].domain_status, 'verified');
  assert.equal(await page.getByRole('link', { name: 'Voir la boutique' }).getAttribute('href'), 'https://maboutique.com');
  assert.equal(await page.getByRole('region', { name: 'Réglages DNS' }).count(), 0);
  // removed, with a confirmation
  await page.getByRole('button', { name: 'Retirer ce domaine' }).click();
  assert.equal(w.stores[0].custom_domain, 'maboutique.com');
  await page.getByRole('button', { name: 'Oui, retirer' }).click();
  await page.getByText('Le domaine est retiré.').waitFor();
  assert.equal(w.stores[0].custom_domain, null);
  // buying one: the price shown is the server's, the payment is asked for this store
  await page.getByLabel('Le nom que vous voulez').fill('maboutique'); await page.getByRole('button', { name: 'Chercher' }).click();
  await page.getByRole('button', { name: 'Acheter maboutique.com' }).waitFor();
  const offers = (await page.locator('main ul li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  assert.match(offers[0], /maboutique\.com 12.500.FCFA la première année, puis 14.000.FCFA par an Acheter/);
  assert.match(offers[1], /maboutique\.shop Déjà pris/);
  await page.getByRole('button', { name: 'Acheter maboutique.com' }).click();
  await page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const buy = w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'domain');
  assert.equal(buy.body.domain, 'maboutique.com'); assert.equal(buy.body.storeId, w.stores[0].id); assert.ok(buy.body.returnUrl.endsWith('/admin/domaine/'));
  await page.goto(`${BASE}/admin/domaine/?domaine=ok&nom=maboutique.com`);
  await page.getByText('Paiement reçu. Nous achetons maboutique.com et le relions à votre boutique').waitFor();
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('floating menu and motion: the menu closes on a choice, Échap and a click outside; pages fade in; nothing moves the bottom bar; reduced motion is respected', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady');
  // on a computer every page is already in the bar: her name opens no list, it goes straight to her account
  await page.getByRole('button', { name: /Kady/ }).click();
  await page.waitForURL(/\/compte\/$/); assert.equal(await page.getByRole('menu').count(), 0);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Kady');
  // one easing and one short duration for a press, as asked
  const press = await page.locator('aside nav a').first().evaluate((a) => { const c = getComputedStyle(a); return [c.transitionTimingFunction.split('),')[0] + ')', c.transitionDuration.split(',')[0]]; });
  assert.deepEqual(press, ['cubic-bezier(0.22, 1, 0.36, 1)', '0.16s']);
  // a page comes in with a fade and a 6 px move, which ends on nothing (no transform left behind)
  await page.getByRole('link', { name: 'Produits', exact: true }).click(); await h1(page, 'Produits');
  assert.match(await page.locator('main > div').evaluate((d) => getComputedStyle(d).animationName), /pageIn/);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('main > div').evaluate((d) => getComputedStyle(d).transform), 'none');
  await ctx.close();

  // a phone: « Plus » opens as a sheet; a choice goes to the page and closes it; the bar never moves meanwhile
  const o = await open(browser, PHONE, world());
  await o.page.goto(`${BASE}/admin/`); await h1(o.page, 'Bonjour Kady');
  const bar = () => o.page.evaluate(() => { const r = document.querySelector('aside').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.bottom), Math.round(r.width)]; });
  assert.deepEqual(await bar(), [12, 834, 366]);
  // pulled down with a finger, « Plus » follows it and closes; a short pull lets it come back
  const pull = (sel, dy) => o.page.evaluate(([q, d]) => {
    const el = document.querySelector(q), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 12;
    const t = (yy) => new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(y)], changedTouches: [t(y)], bubbles: true, cancelable: true }));
    for (const k of [0.3, 0.6, 1]) el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(y + d * k)], changedTouches: [t(y + d * k)], bubbles: true, cancelable: true }));
    const moved = el.style.transform;
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(y + d)], bubbles: true, cancelable: true }));
    return moved;
  }, [sel, dy]);
  await o.page.getByRole('button', { name: /Plus/ }).click(); await o.page.getByRole('menu').waitFor();
  await o.page.waitForTimeout(700);                              // a slow, short pull: it comes back
  assert.equal(await pull('[role="menu"]', 20), 'translateY(20px)', 'the sheet follows the finger');
  await o.page.waitForTimeout(400); assert.equal(await o.page.getByRole('menu').count(), 1);
  assert.equal(await pull('[role="menu"]', 160), 'translateY(160px)');
  await o.page.getByRole('menu').waitFor({ state: 'detached' });
  // the drawer of a product closes the same way
  await o.page.goto(`${BASE}/admin/produits/`); await h1(o.page, 'Produits');
  await o.page.getByRole('button', { name: 'Ajouter un produit' }).first().click();
  await o.page.getByRole('dialog').waitFor(); await o.page.waitForTimeout(500);
  await pull('[role="dialog"]', 180);
  await o.page.getByRole('dialog').waitFor({ state: 'detached' });
  await o.page.goto(`${BASE}/admin/`); await h1(o.page, 'Bonjour Kady');
  // five tabs of exactly the same width, each an icon of 20 px over a word of 11 px; nothing is cut, even at 375 px
  const tabs = () => o.page.evaluate(() => { const side = document.querySelector('aside'); const els = [...side.querySelectorAll('nav > a, nav + div > button')].filter((e) => getComputedStyle(e).display !== 'none'); return els.map((e) => { const r = e.getBoundingClientRect(), i = e.querySelector('svg').getBoundingClientRect(), t = [...e.querySelectorAll('span')].filter((x) => !x.children.length && x.textContent.trim() && getComputedStyle(x).display !== 'none').pop(); return [t.textContent.trim(), Math.round(r.width * 10) / 10, Math.round(i.width), getComputedStyle(t).fontSize, t.getBoundingClientRect().left, t.getBoundingClientRect().right]; }); });
  const apart = (l) => l.every((x, i) => i === 0 || x[4] - l[i - 1][5] >= 6) && l[0][4] >= 16 && l[l.length - 1][5] <= innerW - 16;   // whole words, clear of each other and of the pill's edge
  let innerW = 390;
  let five = await tabs();
  assert.deepEqual(five.map((x) => x[0]), ['Accueil', 'Commandes', 'Produits', 'Boutique', 'Plus']);
  assert.equal(new Set(five.map((x) => x[1])).size, 1, `five equal widths: ${five.map((x) => x[1])}`);
  assert.deepEqual(five.map((x) => x.slice(2, 4)), Array(5).fill([20, '11px'])); assert.ok(apart(five), JSON.stringify(five));
  assert.deepEqual(await o.page.locator('aside').evaluate((n) => { const c = getComputedStyle(n), b = getComputedStyle(n, '::before'); return [Math.round(n.getBoundingClientRect().height), c.borderRadius, c.zIndex, b.backdropFilter || b.webkitBackdropFilter]; }), [62, '28px', '50', 'blur(18px) saturate(1.6)']);
  assert.equal(await o.page.locator('aside a[aria-current="page"]').evaluate((a) => getComputedStyle(a).fontWeight), '600');
  await o.page.screenshot({ path: `${SHOTS}45-barre-du-bas-5-onglets.png`, clip: { x: 0, y: 844 - 130, width: 390, height: 130 } });
  await o.page.setViewportSize({ width: 375, height: 667 }); await o.page.waitForTimeout(200);
  five = await tabs();
  innerW = 375; assert.equal(new Set(five.map((x) => x[1])).size, 1); assert.ok(apart(five), `no word is cut or touches another at 375 px: ${JSON.stringify(five)}`);
  await noOverflow(o.page);
  await o.page.setViewportSize(PHONE); await o.page.waitForTimeout(200);
  // Échap closes it and gives the focus back; a touch outside closes it; the button itself closes it
  const me = o.page.getByRole('button', { name: /Plus/ });
  await me.click(); await o.page.getByRole('menu').waitFor();
  assert.equal(await me.getAttribute('aria-expanded'), 'true');
  await o.page.keyboard.press('Escape'); await o.page.getByRole('menu').waitFor({ state: 'detached' });
  assert.equal(await me.evaluate((b) => b === document.activeElement), true);
  await me.click(); await o.page.getByRole('menu').waitFor();
  await o.page.mouse.click(195, 60); await o.page.getByRole('menu').waitFor({ state: 'detached' });
  assert.equal(await me.getAttribute('aria-expanded'), 'false');
  await o.page.getByRole('button', { name: /Plus/ }).click(); await o.page.getByRole('menu').waitFor();
  await o.page.getByRole('menuitem', { name: 'Paiements' }).click();
  const seen = [];
  for (let i = 0; i < 12; i++) { seen.push((await bar()).join()); await o.page.waitForTimeout(30); }      // while the page changes and fades in
  assert.deepEqual([...new Set(seen)], ['12,834,366'], 'the bottom bar stayed where it is during the transition');
  await h1(o.page, 'Paiements'); await o.page.getByRole('menu').waitFor({ state: 'detached' });
  await noOverflow(o.page);
  // a drawer leaves softly and is gone; opened while the page is still coming in, it is already in its place
  await o.page.goto(`${BASE}/admin/modeles/?choisir=michou`);
  const sheet = o.page.getByRole('dialog'); await sheet.waitFor();
  const b0 = await sheet.boundingBox();
  assert.equal(Math.round(b0.x), 0); assert.equal(Math.round(b0.width), 390, 'the drawer is drawn on the screen, not inside the page that is fading in');
  await o.page.waitForTimeout(500);
  assert.equal(Math.round((await sheet.boundingBox()).y + (await sheet.boundingBox()).height), 844);
  await o.page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
  await noOverflow(o.page);
  await o.ctx.close();

  // « reduce motion »: nothing animates, everything still works
  const r = await open(browser, DESK, world());
  await r.page.emulateMedia({ reducedMotion: 'reduce' });
  await r.page.goto(`${BASE}/admin/produits/`); await h1(r.page, 'Produits');
  assert.ok(parseFloat(await r.page.locator('main > div').evaluate((d) => getComputedStyle(d).animationDuration)) < 0.001);
  assert.ok(parseFloat(await r.page.locator('aside nav a').first().evaluate((a) => getComputedStyle(a).transitionDuration)) < 0.001);
  await r.page.setViewportSize(PHONE);
  await r.page.getByRole('button', { name: /Plus/ }).click(); await r.page.getByRole('menu').waitFor();
  await r.page.keyboard.press('Escape'); await r.page.getByRole('menu').waitFor({ state: 'detached' });
  assert.deepEqual([...errors, ...o.errors, ...r.errors], []); await r.ctx.close();
});

await test('partners: invite by e-mail, cancel an invitation, remove a partner; live visits come with the Pro plan', async () => {
  const w = world(); w.team = [{ user_id: 'u-2', email: 'mariam@exemple.com', first_name: 'Mariam', role: 'editor', added_at: ago(48) }];
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/equipe/`); await h1(page, 'Associés');
  const list = page.getByRole('region', { name: 'Associés et invitations' });
  await list.getByText('Mariam').first().waitFor();
  await list.getByText('Propriétaire').waitFor();
  // a wrong address, her own address, someone already there: refused before anything is sent
  for (const [typed, said] of [['pas une adresse', 'Vérifiez l’adresse e-mail.'], ['kady@exemple.com', 'C’est votre propre adresse.'], ['Mariam@Exemple.com', 'Cette personne est déjà invitée ou associée.']]) {
    await page.getByLabel('Son adresse e-mail').fill(typed); await page.getByRole('button', { name: 'Inviter' }).click();
    await page.getByText(said).waitFor();
  }
  assert.equal((w.invites ?? []).length, 0);
  await page.getByLabel('Son adresse e-mail').fill(' Fatou@Exemple.com '); await page.getByRole('button', { name: 'Inviter' }).click();
  await page.getByText('fatou@exemple.com est invitée.').waitFor();
  assert.deepEqual(w.invites.map((x) => [x.email, x.mode, x.store_id]), [['fatou@exemple.com', 'editor', w.stores[0].id]]);
  await list.getByText('En attente').waitFor();
  await page.screenshot({ path: `${SHOTS}82-associes.png` });
  await page.getByRole('button', { name: 'Annuler l’invitation de fatou@exemple.com' }).click();
  await page.waitForFunction(() => !document.querySelector('main').innerText.includes('En attente'));
  assert.equal(w.invites.length, 0);
  // removing a partner asks to confirm
  await page.getByRole('button', { name: 'Retirer Mariam' }).click();
  assert.equal(w.team.length, 1);
  await page.getByRole('button', { name: 'Oui, retirer' }).click();
  await page.waitForFunction(() => !document.querySelector('main').innerText.includes('mariam@exemple.com'));
  assert.equal(w.team.length, 0);
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  // live visits: not in this plan → the page says which plans have it; with it, the three figures and the countries
  await page.setViewportSize(DESK);
  await page.goto(`${BASE}/admin/en-direct/`); await h1(page, 'En direct');
  await page.getByText('À partir de la formule Pro').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Voir les formules' }).getAttribute('href'), '/admin/abonnement/');
  // the globe is there even then, alive, with example visitors (said so)
  const globe = page.getByRole('img', { name: 'Globe des visiteurs de votre boutique' });
  await globe.waitFor(); await page.getByText('Aperçu · visiteurs d’exemple').waitFor();
  const drawn = () => globe.evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0, green = 0; for (let i = 0; i < d.length; i += 16) { if (d[i + 3] > 200 && d[i] < 205 && Math.abs(d[i] - d[i + 1]) < 12 && Math.abs(d[i + 1] - d[i + 2]) < 12) ink++; if (d[i] < 80 && d[i + 1] > 170 && d[i + 2] > 90 && d[i + 2] < 170) green++; } return [c.width > 200, ink > 200, green > 3]; });
  await page.waitForTimeout(600);
  assert.deepEqual(await drawn(), [true, true, true], 'a sphere, the land in dots, visitors in green');
  await page.screenshot({ path: `${SHOTS}83-en-direct-apercu.png` });
  w.live = { ok: true, now: 3, today: 41, week: 212, countries: [{ country: 'CI', n: 30 }, { country: 'SN', n: 8 }, { country: 'CA', n: 3 }], points: [{ lat: 5.35, lon: -4.0, city: 'Abidjan', country: 'CI', live: true, at: new Date(Date.now() - 60000).toISOString() }, { lat: 14.7, lon: -17.45, city: 'Dakar', country: 'SN', live: true, at: new Date(Date.now() - 120000).toISOString() }, { lat: 48.85, lon: 2.35, city: 'Paris', country: 'FR', live: false, at: new Date(Date.now() - 3 * 3600e3).toISOString() }] };
  await page.reload(); await h1(page, 'En direct');
  await page.getByText('Cette semaine').waitFor();
  assert.deepEqual(await page.locator('main dl dd').allInnerTexts(), ['3', '41', '212']);
  assert.equal(await page.getByText('Aperçu · visiteurs d’exemple').count(), 0, 'her real visitors, not the example');
  assert.deepEqual((await page.getByRole('region', { name: 'Dernières visites' }).locator('li span').allInnerTexts()), ['Abidjan, Côte d’Ivoire', 'Dakar, Sénégal', 'Paris, France']);
  await page.waitForTimeout(600); assert.deepEqual(await drawn(), [true, true, true]);
  // she turns it with the mouse (or a finger)
  const gb = await globe.boundingBox(); const before = await globe.evaluate((c) => c.toDataURL().length + c.toDataURL().slice(5000, 5200));
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await page.mouse.move(gb.x + gb.width / 2 + 140, gb.y + gb.height / 2 + 30, { steps: 6 }); await page.mouse.up();
  assert.notEqual(await globe.evaluate((c) => c.toDataURL().length + c.toDataURL().slice(5000, 5200)), before, 'the globe turned');
  assert.deepEqual((await page.getByRole('region', { name: 'Pays' }).locator('li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')), ['Côte d’Ivoire 30', 'Sénégal 8', 'Canada 3']);
  await page.screenshot({ path: `${SHOTS}83-en-direct.png` });
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('Branding: logo, colours and shape of the buttons for the whole site, seen at once on her site, saved in her store', async () => {
  const w = withModel(world(), 'soyeuse'); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/branding/`);
  const site = page.frameLocator('iframe[title="Aperçu de votre site"]');
  await site.locator('[data-jeere-add]').first().waitFor({ timeout: 60000 });
  await page.getByRole('group', { name: 'Forme' }).getByRole('button', { name: 'Carré', exact: true }).click();
  await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Contour', exact: true }).click();
  const btn = site.locator('[data-jeere-add]').first();
  await page.waitForFunction(() => true);
  await site.locator('style#jeere-brand').waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const look = await btn.evaluate((n) => { const c = getComputedStyle(n); return [c.borderTopLeftRadius, c.backgroundColor]; });
  assert.deepEqual(look, ['0px', 'rgba(0, 0, 0, 0)'], 'the buttons of her site are square and outlined at once');
  await page.screenshot({ path: `${SHOTS}80-branding.png` });
  // the fonts: the 33 of Jehre in five styles, for the titles and for the texts, applied to her whole site
  // one compact field each: a menu drops down, by style, each name in its own font
  // the field says which font her site uses now (SOYEUSE: Hastegi, Montserrat); no « Celle du modèle »
  const polices = page.getByRole('region', { name: 'Polices' });
  assert.deepEqual(await polices.getByRole('button').allInnerTexts(), ['Hastegi', 'Hastegi', 'Montserrat', 'Montserrat']);
  assert.equal(await page.getByText('Celle du modèle').count(), 0);
  await page.getByRole('region', { name: 'Polices' }).getByRole('button', { name: /^Titres/ }).click();
  await page.getByRole('listbox', { name: 'Titres' }).getByRole('option', { name: 'Bodoni Moda' }).click();
  assert.equal(await page.getByRole('listbox').count(), 0, 'the menu closes on a choice');
  await page.getByRole('region', { name: 'Polices' }).getByRole('button', { name: /^Paragraphes/ }).click();
  const textList = page.getByRole('listbox', { name: 'Paragraphes' });
  assert.equal(await textList.getByRole('group', { name: 'Manuscrit' }).count(), 0, 'no handwritten font for paragraphs');
  await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}81-branding-polices-menu.png` });
  await textList.getByRole('option', { name: 'DM Sans' }).click();
  await page.waitForTimeout(500);
  const fonts = await site.locator('body').evaluate(() => [getComputedStyle(document.querySelector('h1, h2')).fontFamily, getComputedStyle(document.querySelector('p')).fontFamily, document.getElementById('jeere-brand-fonts')?.getAttribute('href') ?? '']);
  assert.match(fonts[0], /Bodoni Moda/); assert.match(fonts[1], /DM Sans/);
  assert.match(fonts[2], /^https:\/\/fonts\.googleapis\.com\/css2\?family=Bodoni\+Moda:wght@[\d;]+&family=DM\+Sans:wght@[\d;]+&display=swap$/);
  await page.getByRole('region', { name: 'Polices' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}81-branding-polices.png` });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText(/C’est enregistré/).waitFor();
  const saved = w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').pop();
  assert.deepEqual(saved.body.fiche.store.site.b, { shape: 'square', btnStyle: 'outline', headFont: 'bodoni-moda', paraFont: 'dm-sans' });
  assert.equal(JSON.stringify(saved.body.fiche.products), JSON.stringify(w.stores[0].fiche.products), 'her products travel untouched');
  // the menu and the editor lead there
  await page.goto(`${BASE}/admin/editeur/`);
  await page.locator('a[href="/admin/branding/"]').first().waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor: the payment of the checkout page is not edited there; a note leads to Paiements; the frame of a card leaves with it when scrolled away', async () => {
  const w = withModel(world(), 'soyeuse'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  assert.equal(await page.getByText('Touchez un texte, une image ou un bouton pour le modifier').count() >= 0, true);
  // a product card: its own tools
  const card = site.locator('[data-jeere-product]').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-jeere-name]').click({ force: true });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.waitFor();
  await site.locator('[data-jeere-sel]').waitFor();
  await page.waitForTimeout(1500);                                   // the cards come in with the model's own animation
  await page.screenshot({ path: `${SHOTS}81-carte-avant-defilement.png` });
  // scrolled far away: the frame does not stay alone on the screen
  await site.locator('body').evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  assert.equal(await site.locator('[data-jeere-sel]').evaluate((n) => n.style.display), 'none', 'no frame left behind');
  await page.screenshot({ path: `${SHOTS}82-carte-apres-defilement.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('colours: the model’s own and the base colours, a « + » that opens a picker of any colour, and her recent colours', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  await site.locator('.ruban').first().click({ force: true });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.getByRole('button', { name: 'Couleurs', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Couleurs du bandeau' });
  // one calm line per colour, nothing unfolded at first
  assert.equal(await sheet.locator('[role=group][aria-label$="couleurs de base"]').count(), 0, 'no wall of swatches');
  await page.screenshot({ path: `${SHOTS}89-couleurs-lignes.png` });
  await openColor(sheet, 'Couleur du bandeau');
  const own = sheet.getByRole('group', { name: 'Couleur du bandeau : couleurs du modèle' });
  assert.ok(await own.getByRole('button', { name: 'Rouge soldes' }).count() === 1, 'MICHOU’s own red is offered first');
  assert.deepEqual(await sheet.getByRole('group', { name: 'Couleur du bandeau : couleurs de base' }).getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label') ?? x.textContent)), ['Blanc', 'Rouge', 'Bleu', 'Vert', 'Or', 'Personnaliser'], 'plain base colours (black is already MICHOU’s ink)');
  assert.equal(await sheet.locator('input[type="color"]').count(), 0, 'no raw colour input of the browser');
  await page.screenshot({ path: `${SHOTS}90-couleurs-bandeau.png` });
  await sheet.getByRole('group', { name: 'Couleur du bandeau : couleurs de base' }).getByRole('button', { name: 'Personnaliser' }).click();
  const picker = sheet.getByRole('group', { name: 'Choisir la couleur : Couleur du bandeau' });
  await picker.waitFor();
  // dragging in the field and along the band of hues changes the colour; its code can be typed
  const f = await picker.locator('[class*="field"]').first().boundingBox();
  await page.mouse.click(f.x + f.width * 0.8, f.y + f.height * 0.25);
  await picker.getByLabel('Code couleur').fill('2E7D5B');
  await picker.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}91-selecteur-couleur.png` });
  await picker.getByRole('button', { name: 'Appliquer' }).click();
  await page.waitForTimeout(300);
  assert.equal(await site.locator('.ruban').first().evaluate((b) => getComputedStyle(b).backgroundColor), 'rgb(46, 125, 91)');
  const recent = sheet.getByRole('group', { name: 'Couleur du bandeau : couleurs récentes' });
  assert.deepEqual(await recent.getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label'))), ['#2E7D5B']);
  // the same recent colour is offered for the text too, one touch applies it
  await openColor(sheet, 'Couleur du texte du bandeau');
  assert.equal(await sheet.getByRole('group', { name: 'Couleur du bandeau : couleurs de base' }).count(), 0, 'opening one folds the other');
  await sheet.getByRole('group', { name: 'Couleur du texte du bandeau : couleurs récentes' }).getByRole('button', { name: '#2E7D5B' }).click();
  await page.waitForTimeout(300);
  assert.equal(await site.locator('.ruban').first().evaluate((b) => getComputedStyle(b).color), 'rgb(46, 125, 91)');
  await page.screenshot({ path: `${SHOTS}92-couleurs-recentes.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('payments: Wave first, on by default and recommended with its link; the others off; a guide; the card with Stripe, connected inside Jehre', async () => {
  const w = world(); w.payGuide = true; delete w.stores[0].fiche.payments; const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/paiements/`);
  // the first time: the guide takes the whole screen, and stays until « J'ai compris »
  const guide = page.getByRole('dialog', { name: 'Comment configurer vos paiements' });
  await guide.waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}118-paiements-guide.png` });
  await page.mouse.click(10, 10); await page.keyboard.press('Escape');
  assert.equal(await guide.isVisible(), true, 'it does not go away by itself');
  await guide.getByRole('button', { name: 'J’ai compris' }).click();
  await guide.waitFor({ state: 'detached' });
  // afterwards one clear line brings it back
  await page.getByRole('button', { name: 'Comment configurer vos paiements ?' }).click();
  await guide.waitFor();
  await guide.getByRole('button', { name: 'J’ai compris' }).click();
  await page.reload(); await h1(page, 'Paiements');
  assert.equal(await guide.count(), 0, 'once understood, it does not come back by itself');
  await page.setViewportSize(DESK);
  const sw = async (n) => page.getByRole('switch', { name: n, exact: true }).getAttribute('aria-checked');
  assert.deepEqual([await sw('Wave'), await sw('Orange Money'), await sw('MTN MoMo'), await sw('Moov Money'), await sw('Paiement à la livraison')], ['true', 'false', 'false', 'false', 'false']);
  await page.getByText('Recommandé', { exact: true }).waitFor();
  await page.getByLabel('Lien de paiement Wave (recommandé)').waitFor();
  await page.getByText('Avec un numéro seul, elle envoie sa commande').waitFor();
  const card = page.getByRole('region', { name: 'Carte bancaire' });
  await card.getByText('À configurer').waitFor();
  await page.getByLabel('Lien de paiement Wave (recommandé)').fill('https://pay.wave.com/m/M_ci_test/c/ci/');
  await page.getByText('La cliente paie à l’avance', { exact: false }).first().waitFor();
  await page.screenshot({ path: `${SHOTS}93-paiements.png`, fullPage: true });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  assert.deepEqual(w.stores[0].fiche.payments, { wave: true, orange: false, mtn: false, moov: false, cod: false });
  // the card: her country, then Stripe’s own form inside Jehre, for THIS store
  await card.getByRole('link', { name: 'Connecter Stripe' }).click();
  await h1(page, 'Paiements par carte');
  await page.getByLabel('Pays où votre activité est enregistrée').selectOption('Canada');
  await page.screenshot({ path: `${SHOTS}94-stripe-pays.png` });
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.locator('[data-stripe="account-onboarding"]').waitFor();
  const asked = w.calls.find((c) => c.path === '/functions/v1/payments' && c.body.action === 'session');
  assert.deepEqual([asked.body.storeId, asked.body.country], [w.stores[0].id, 'CA'], 'tied to her store, in her country');
  await page.screenshot({ path: `${SHOTS}95-stripe-formulaire.png` });
  // once Stripe has checked her: « Connecté » on Paiements and ticked on the home
  Object.assign(w.card, { chargesEnabled: true, detailsSubmitted: true });
  await page.evaluate(() => window.__stripeExit && window.__stripeExit());
  await page.waitForURL(/\/admin\/paiements\/\?carte=1/);
  await page.getByRole('region', { name: 'Carte bancaire' }).getByText('Connecté').waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

await test('home: a living checklist — currency, brand, categories linked, products, Wave, Stripe, delivery, publish — each with its state and one tap to the right place', async () => {
  const w = withModel(world(), 'soyeuse'); w.stores[0].published = false; const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/`);
  await page.getByRole('heading', { name: 'Premiers pas' }).waitFor();
  await page.getByRole('button', { name: /^Voir les \d+ étapes/ }).click();
  const list = page.locator('section[aria-labelledby="h-steps"] li');
  await page.getByText('Acceptez les cartes bancaires (Stripe)').waitFor();
  const titles = await list.allInnerTexts();
  for (const t of ['monnaie', 'logo, vos couleurs', 'catégories', 'produits', 'Wave', 'Stripe', 'livraison', 'Publiez']) assert.ok(titles.some((x) => x.includes(t)), `a step about ${t}`);
  assert.ok(titles.some((x) => /Stripe[\s\S]*À configurer[\s\S]*Connecter/.test(x)), 'Stripe: its state and its action');
  await page.screenshot({ path: `${SHOTS}96-accueil-checklist.png`, fullPage: true });
  // the currency is set in Paramètres: back on the home, the step is ticked
  await list.filter({ hasText: 'monnaie' }).getByRole('link').click();
  await h1(page, 'Paramètres');
  await page.getByLabel('Monnaie de la boutique').selectOption('Euro (€)');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  assert.equal(w.stores[0].fiche.store.currency, 'EUR');
  await page.goto(`${BASE}/admin/`);
  await page.getByRole('button', { name: /^Voir les \d+ étapes/ }).click();
  assert.match(await list.filter({ hasText: 'monnaie' }).innerText(), /Configuré/);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor: leaving with changes not saved asks first — save and leave, leave without saving, or stay; without changes the arrow leaves at once', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  // nothing changed: straight back
  await page.getByRole('link', { name: 'Retour au tableau de bord' }).click();
  await page.waitForURL(`${BASE}/admin/`);
  await page.goto(`${BASE}/admin/editeur/`);
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const title = site.locator('h1[data-jeere-pickable], h2[data-jeere-pickable]').first();
  await title.click();
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.getByRole('button', { name: 'Gras', exact: true }).click();
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('jeere-editor-draft:'))), 'a safety copy is kept on the device');
  // the arrow: the question, « Rester » keeps her where she was
  await page.getByRole('link', { name: 'Retour au tableau de bord' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Enregistrer vos modifications ?' });
  await ask.waitFor();
  await page.screenshot({ path: `${SHOTS}97-quitter-editeur.png` });
  await ask.getByRole('button', { name: 'Rester' }).click();
  await ask.waitFor({ state: 'detached' });
  assert.match(page.url(), /\/admin\/editeur\/$/);
  await tools.waitFor();
  // a link of the editor (Branding) asks too; « Enregistrer et quitter » saves, then leaves
  await page.getByRole('link', { name: 'Retour au tableau de bord' }).click();
  await ask.getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await page.waitForURL(`${BASE}/admin/`);
  const saved = w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').pop();
  assert.ok(saved && JSON.stringify(saved.body.fiche.store.site.x).includes('"bold"'), 'the change was saved before leaving');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('jeere-editor-draft:'))), false, 'the safety copy is dropped once saved');
  // « Quitter sans enregistrer »: nothing is written
  await page.goto(`${BASE}/admin/editeur/`);
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  await site.locator('h1[data-jeere-pickable], h2[data-jeere-pickable]').first().click();
  await tools.getByRole('button', { name: 'Gras', exact: true }).click();
  await page.waitForTimeout(300);
  const before = w.calls.filter((c) => c.method === 'PATCH').length;
  await page.getByRole('link', { name: 'Retour au tableau de bord' }).click();
  await ask.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
  await page.waitForURL(`${BASE}/admin/`);
  assert.equal(w.calls.filter((c) => c.method === 'PATCH').length, before);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('catalogue links (MICHOU): each campaign banner is associated with a category or a product; a product card’s photo chooses the card; the public links follow', async () => {
  const w = withModel(world(), 'michou'); w.stores[0].fiche.products.push({ id: 'bonnet-laine', name: 'Bonnet en laine', price: 8000, category: 'Accessoires', image: null, photo: null }); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  const hauts = site.locator('.edito a').first();
  await hauts.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await hauts.locator('img').click({ force: true });
  await tools.getByRole('button', { name: 'Associer', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Associer à une catégorie / un produit' });
  await sheet.getByText('Visuel 1 → Catégorie Hauts (modèle)').waitFor();
  await sheet.getByLabel('Associer à').selectOption('Catégorie Cheveux');
  await sheet.getByText('Visuel 1 → Catégorie Cheveux').waitFor();
  await page.waitForTimeout(300);
  assert.match(await hauts.getAttribute('href'), /boutique\/#cheveux$/, 'the banner leads to her category');
  await page.screenshot({ path: `${SHOTS}98-bannière-associer.png` });
  // the second banner on its own: one of her products (no card of it on the page: the shop, on its category)
  await page.keyboard.press('Escape');
  await tools.getByRole('button', { name: 'Terminer' }).click(); await page.waitForTimeout(300);
  const bas = site.locator('.edito a').nth(1);
  await bas.locator('img').click({ force: true });
  await tools.getByRole('button', { name: 'Associer', exact: true }).click();
  await sheet.getByText('Visuel 2 → Catégorie Bas (modèle)').waitFor();
  await sheet.getByLabel('Associer à').selectOption('Produit Bonnet en laine');
  await page.waitForTimeout(300);
  assert.match(await bas.getAttribute('href'), /boutique\/#accessoires$/, 'a product with no card here: the shop, on its category');
  assert.match(await hauts.getAttribute('href'), /#cheveux$/, 'each banner keeps its own');
  await page.keyboard.press('Escape');
  await tools.getByRole('button', { name: 'Terminer' }).click(); await page.waitForTimeout(300);
  // a product card: its photo chooses the card (which of her products goes in it)
  const card = site.locator('[data-jeere-product]').first();
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await card.locator('img').first().click({ force: true });
  assert.equal((await tools.locator('button span').allInnerTexts())[0], 'Produit', 'the card, not a loose picture');
  await tools.getByRole('button', { name: 'Produit', exact: true }).click();
  await page.getByRole('dialog', { name: 'Produit de cette case' }).getByText(/^Cette carte → /).waitFor();
  await page.screenshot({ path: `${SHOTS}99-carte-produit.png` });
  await page.keyboard.press('Escape');
  await tools.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  const l = w.stores[0].fiche.store.site.l;
  assert.deepEqual(Object.values(l).sort(), ['c:Cheveux', 'p:bonnet-laine']);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('catalogue links on a computer: the inspector of a banner shows what it is associated with', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const hauts = site.locator('.edito a').first();
  await hauts.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await hauts.locator('img').click({ force: true });
  await page.getByText('Visuel 1 → Catégorie Hauts (modèle)').waitFor();
  await page.getByLabel('Associer à une catégorie / un produit').selectOption('Catégorie Corps');
  await page.getByText('Visuel 1 → Catégorie Corps').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}100-bannière-associer-ordinateur.png` });
  assert.match(await hauts.getAttribute('href'), /boutique\/#corps$/);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a title with its own small line (MICHOU « Hauts » / « t-shirts lourds et délavés »): two texts, each edited without touching the other', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('button', { name: 'Campagne', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Contenu : Campagne' });
  await right.waitFor();
  const values = await right.locator('input:not([type=file]):not([type=checkbox]), textarea').evaluateAll((xs) => xs.map((x) => x.value));
  for (const v of ['Hauts', 't-shirts lourds et délavés', 'Bas', 'jorts et pantalons larges']) assert.ok(values.includes(v), `« ${v} » is a text of its own: ${values.join(' | ')}`);
  assert.equal(values.some((v) => /Hautst-shirts|Hauts ?t-shirts/.test(v)), false, 'never the two glued together');
  const title = right.locator('input:not([type=file]):not([type=checkbox]), textarea').nth(values.indexOf('Hauts'));
  await title.fill('Tops');
  const line = right.locator('input:not([type=file]):not([type=checkbox]), textarea').nth(values.indexOf('t-shirts lourds et délavés'));
  await line.fill('coton épais, coupe large');
  await page.waitForTimeout(500);
  const span = site.locator('.edito a span').first();
  assert.deepEqual(await span.evaluate((n) => [n.firstChild.nodeValue.trim(), n.querySelector('small').textContent]), ['Tops', 'coton épais, coupe large']);
  await page.screenshot({ path: `${SHOTS}101-titre-et-petite-ligne.png` });
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  const t = w.stores[0].fiche.store.site.t;
  assert.ok(Object.entries(t).some(([k, v]) => /\|t\|/.test(k) && v === 'Tops') && Object.entries(t).some(([k, v]) => /\|w\|/.test(k) && v === 'coton épais, coupe large'), JSON.stringify(t));
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a product card in the editor (SÈVE): which product of the catalogue it shows and Masquer; the sentence leads to Produits; never its photo, name or price', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-product][data-jeere-pickable]').first().waitFor({ state: 'attached', timeout: 60000 });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  const card = site.locator('[data-jeere-product]').first();
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await card.locator('img').first().click({ force: true });
  await tools.getByRole('button', { name: 'Produit', exact: true }).click();
  await page.getByRole('dialog', { name: 'Produit de cette case' }).getByLabel('Produit').selectOption('Savon noir au karité');
  const drawer = page.getByRole('dialog', { name: 'Produit de cette case' });
  await drawer.getByText('Vos produits se gèrent et se modifient dans').waitFor();
  await page.screenshot({ path: `${SHOTS}102b-carte-produit-tiroir.png` });
  await drawer.getByRole('button', { name: 'Fermer' }).click(); await page.waitForTimeout(500);
  assert.deepEqual(await tools.locator('button span').allInnerTexts(), ['Produit', 'Masquer'], 'no Photo, Nom or Prix on a card, and no second way to Produits');
  await page.screenshot({ path: `${SHOTS}102-carte-produit-barre.png` });
  // the sentence's link: her changes are kept first, then the product opens in Produits
  await tools.getByRole('button', { name: 'Produit', exact: true }).click();
  await drawer.getByRole('link', { name: 'Produits' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await page.waitForURL(/\/admin\/produits\/\?produit=p2$/);
  const sheet = page.getByRole('dialog', { name: 'Modifier le produit' });
  assert.equal(await sheet.getByLabel('Nom du produit').inputValue(), 'Savon noir au karité');
  await page.screenshot({ path: `${SHOTS}103-produit-ouvert.png` });
  assert.equal(Object.values(w.stores[0].fiche.store.slots ?? {}).includes('p2'), true, 'the card’s product was saved');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('Branding on a phone: one calm line per colour, one open at a time, recent colours once, nothing hidden under the bottom bar', async () => {
  const w = withModel(world(), 'seve'); w.stores[0].fiche.store.logo = 'https://aezchxfvzfoqlvzchqyk.supabase.co/storage/v1/object/public/store-media/x/logo.webp'; const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.addInitScript(() => localStorage.setItem('jeere-recent-colors', JSON.stringify(['#A52A22'])));
  await page.goto(`${BASE}/admin/branding/`);
  const colours = page.getByRole('region', { name: 'Couleurs' });
  await colours.waitFor();
  assert.equal(await colours.locator('[role=group]').count(), 0, 'every colour folded at first');
  await colours.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  // her logo once, with Remplacer, Recadrer, Retirer and its height: no pile of previews under it
  const logoCard = page.getByRole('region', { name: 'Logo' });
  await logoCard.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  assert.equal(await logoCard.getByLabel('Aperçu du logo').count(), 0);
  assert.equal(await logoCard.locator('img').count(), 1);
  for (const n of ['Remplacer : Votre logo', 'Recadrer : Votre logo', 'Retirer : Votre logo']) await logoCard.getByRole('button', { name: n }).waitFor();
  await logoCard.getByLabel('Hauteur dans l’en-tête (px)').waitFor();
  const inside = await logoCard.evaluate((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('button')].every((e) => { const b = e.getBoundingClientRect(); return b.left >= r.left - 0.5 && b.right <= r.right + 0.5; }); });
  assert.equal(inside, true, 'the logo buttons stay inside the card');
  await page.screenshot({ path: `${SHOTS}115-branding-logo-telephone.png` });
  await page.screenshot({ path: `${SHOTS}104-branding-couleurs-telephone.png` });
  await openColor(colours, 'Boutons');
  assert.equal(await colours.getByRole('group', { name: /couleurs récentes$/ }).count(), 1, 'recent colours shown once');
  await colours.getByRole('group', { name: 'Boutons : couleurs récentes' }).getByRole('button', { name: '#A52A22' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}105-branding-boutons-ouvert.png` });
  await openColor(colours, 'Fond du site');
  assert.equal(await colours.locator('[role=group]').count(), 3, 'only the open one shows its choices');
  // the last line of the page can be scrolled above the bottom bar
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const lastBottom = await page.locator('main').evaluate((m) => { const kids = m.querySelectorAll('section, iframe, p'); return kids[kids.length - 1].getBoundingClientRect().bottom; });
  const barTop = await page.getByRole('navigation', { name: 'Tableau de bord' }).evaluate((n) => n.closest('aside').getBoundingClientRect().top);
  assert.ok(lastBottom <= barTop + 1, `the end of the page clears the bar: ${lastBottom} / ${barTop}`);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('the top bar on a phone floats like the bottom one: a glass capsule away from the edges, never over the first line of the page', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/`);
  const bar = page.locator('header').filter({ has: page.getByRole('link', { name: 'Mon compte' }) }).first();
  await bar.waitFor();
  const look = await bar.evaluate((n) => { const r = n.getBoundingClientRect(), c = getComputedStyle(n); return { left: Math.round(r.left), right: Math.round(innerWidth - r.right), top: Math.round(r.top), radius: c.borderTopLeftRadius, position: c.position }; });
  assert.deepEqual(look, { left: 12, right: 12, top: 8, radius: '22px', position: 'sticky' });
  const first = await page.locator('main h1, main p').first().evaluate((n) => n.getBoundingClientRect().top);
  const barBottom = await bar.evaluate((n) => n.getBoundingClientRect().bottom);
  assert.ok(first >= barBottom, `the first line is below the bar: ${first} / ${barBottom}`);
  await page.screenshot({ path: `${SHOTS}108-barre-haut-flottante.png` });
  await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(300);
  assert.equal(Math.round(await bar.evaluate((n) => n.getBoundingClientRect().top)), 8, 'it stays, floating, while the page passes under it');
  await page.screenshot({ path: `${SHOTS}109-barre-haut-defilement.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a product with several photos: on its page, small photos under the big one; a touch shows it big (MICHOU)', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/compte/`);
  const pics = ['https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=640', 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=640', 'https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?w=640'];
  await page.evaluate(() => { document.body.innerHTML = '<iframe id="f" title="Page produit" style="width:390px;height:844px;border:0" src="https://kreeative.xyz/concepts/michou/produits/casquette-etoile/"></iframe>'; });
  const frame = page.frameLocator('#f');
  await frame.locator('img[data-jeere-photo]').first().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => true); await page.waitForTimeout(1500);
  const fiche = { ...w.stores[0].fiche, products: [{ id: 'p8', name: 'Casquette Étoile', price: 15000, category: 'Accessoires', description: '', images: pics, image: pics[0] }] };
  await page.evaluate((f) => document.getElementById('f').contentWindow.postMessage({ jeerePreview: 'michou', fiche: f, edit: false, store: 'boutique-test' }, '*'), fiche);
  const gallery = frame.getByRole('group', { name: 'Photos du produit' });
  await gallery.waitFor({ timeout: 15000 });
  assert.equal(await gallery.getByRole('button').count(), 3);
  assert.deepEqual(await gallery.locator('img').evaluateAll((xs) => xs.map((x) => x.getAttribute('src'))), pics, 'her three photos, in her order');
  const big = frame.locator('main img[data-jeere-photo]').first();
  assert.equal(await big.getAttribute('src'), pics[0]);
  await gallery.getByRole('button', { name: 'Photo 2 sur 3' }).click();
  assert.equal(await big.getAttribute('src'), pics[1], 'the photo touched is shown big');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}112-page-produit-photos.png` });
  assert.deepEqual(errors.filter((e) => !/net::|Failed to load resource/.test(e)), []); await ctx.close();
});

await test('a card given another product (SÈVE): its label, its small line and its photo follow the product; back on the model’s, all of it comes back', async () => {
  const w = withModel(world(), 'seve');
  w.stores[0].fiche.products.push({ id: 'deo-bergamote', name: 'Déodorant Bergamote', price: 7000, category: 'Corps', description: '', badge: '', image: null, photo: null });
  w.stores[0].fiche.products.push({ id: 'huile-ricin', name: 'Huile de ricin', price: 5000, category: 'Cheveux', description: '', badge: 'new', image: 'https://aezchxfvzfoqlvzchqyk.supabase.co/storage/v1/object/public/store-media/x/ricin.webp', photo: null });
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-product][data-jeere-pickable]').first().waitFor({ state: 'attached', timeout: 60000 });
  const card = site.locator('[data-jeere-slot-product="p1"], [data-jeere-product="p1"]').first();
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  const read = () => card.evaluate((c) => {
    const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
    const badge = c.querySelector('[class*="badge"]'), line = c.querySelector('[class*="__cat"]'), img = c.querySelector('img');
    return { name: c.querySelector('[data-jeere-name]')?.textContent.trim(), badge: vis(badge) ? badge.textContent.trim() : null, line: vis(line) ? line.textContent.trim() : null, photo: img.getAttribute('src').startsWith('data:image/svg') ? 'vide' : img.getAttribute('src').split('/').pop() };
  });
  const model = await read();
  // her own product under the model's number (another name than the model's): her label, her category, no photo of the model's product
  assert.deepEqual(model, { name: 'Beurre de karité brut', badge: 'Best-seller', line: 'Corps', photo: 'vide' });
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  const choose = async (name) => {
    await card.locator('img').first().click({ force: true });
    await tools.getByRole('button', { name: 'Produit', exact: true }).click();
    await page.getByRole('dialog', { name: 'Produit de cette case' }).getByLabel('Produit').selectOption(name);
    await page.getByRole('dialog', { name: 'Produit de cette case' }).getByRole('button', { name: 'Fermer' }).click();
    await tools.getByRole('button', { name: 'Terminer' }).click();
    await page.waitForTimeout(700);
  };
  // a product with no photo and no label: no label, her category, a plain square (never the photo of another product)
  await choose('Déodorant Bergamote');
  assert.deepEqual(await read(), { name: 'Déodorant Bergamote', badge: null, line: 'Corps', photo: 'vide' });
  await page.screenshot({ path: `${SHOTS}113-carte-autre-produit.png` });
  // a product with its photo and « Nouveau »
  await choose('Huile de ricin');
  assert.deepEqual(await read(), { name: 'Huile de ricin', badge: 'Nouveau', line: 'Cheveux', photo: 'ricin.webp' });
  await page.screenshot({ path: `${SHOTS}114-carte-produit-photo.png` });
  // back on the model's product: the card is exactly the model's again
  await choose('Beurre de karité brut');   // her product with the case's own number: the model's card
  const back = await read();
  assert.deepEqual({ badge: back.badge, line: back.line, photo: back.photo }, { badge: model.badge, line: model.line, photo: model.photo });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a model she already has: its page says « Modifier mon site » (her site opens), never « Choisir ce modèle »; another model still offers it', async () => {
  const w = withModel(world(), 'regard'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/modeles/regard/`);
  const mine = page.getByRole('link', { name: 'Modifier mon site' });
  await mine.waitFor();
  assert.equal(await mine.getAttribute('href'), `/admin/editeur/?b=${w.stores[0].id}`);
  assert.equal(await page.getByRole('link', { name: 'Choisir ce modèle' }).count(), 0);
  await page.screenshot({ path: `${SHOTS}116-modele-deja-a-moi.png` });
  await page.goto(`${BASE}/modeles/michou/`);
  await page.getByRole('link', { name: 'Choisir ce modèle' }).waitFor();
  // and inside the dashboard, the same
  await page.goto(`${BASE}/admin/modeles/apercu/?m=regard`);
  await page.getByRole('link', { name: 'Modifier mon site' }).waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

await test('« Boutique » with a site: HER shop first (its picture, online or not, two actions, its settings); every model only under « Voir plus de modèles »', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/modeles/`); await h1(page, 'Ma boutique');
  await page.getByText('Modèle SÈVE', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Choisir/ }).count(), 0, 'no model to choose on her shop');
  await page.waitForFunction(() => [...document.querySelectorAll('main img')].every((i) => i.complete), null, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}119-ma-boutique.png`, fullPage: true });
  await page.getByRole('button', { name: 'Voir plus de modèles' }).click();
  await h1(page, 'Modèles de designer');
  await page.getByRole('button', { name: 'Ma boutique' }).click();
  await h1(page, 'Ma boutique');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('Logo: one picture and Remplacer / Recadrer / Retirer; a new logo opens the cropping window (grid, darkened outside, zoom, drag, Réinitialiser, Annuler, Appliquer)', async () => {
  const LOGO = 'https://aezchxfvzfoqlvzchqyk.supabase.co/storage/v1/object/public/store-media/x/logo-awa.webp';
  const w = withModel(world(), 'seve'); w.stores[0].fiche.store.logo = LOGO; const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.route(LOGO, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520"><circle cx="250" cy="260" r="150" fill="#E8467C"/><circle cx="330" cy="230" r="90" fill="#F0C414" opacity=".9"/><text x="440" y="300" font-family="Georgia, serif" font-size="120" font-weight="700" fill="#111">Awa</text><text x="446" y="370" font-family="Arial, sans-serif" font-size="40" letter-spacing="14" fill="#555">BEAUTÉ</text></svg>' }));
  await page.goto(`${BASE}/admin/branding/`);
  const card = page.getByRole('region', { name: 'Logo' });
  await card.getByRole('button', { name: 'Recadrer : Votre logo' }).click();
  const dlg = page.getByRole('dialog', { name: 'Recadrer le logo' });
  await dlg.waitFor();
  const stage = dlg.getByLabel(/^Zone de recadrage/);
  await stage.locator('img').waitFor();
  // the grid of thirds and the darkened outside
  const frame = await stage.evaluate((s) => { const f = s.querySelector('[aria-hidden="true"]'); return { lines: f.querySelectorAll('i').length, corners: f.querySelectorAll('b').length, mask: getComputedStyle(f).boxShadow.includes('rgba(17, 17, 17, 0.62)') }; });
  assert.deepEqual(frame, { lines: 4, corners: 4, mask: true });
  for (const n of ['Annuler', 'Appliquer', 'Réinitialiser', 'Zoomer', 'Dézoomer']) await dlg.getByRole('button', { name: n, exact: true }).first().waitFor();
  await dlg.getByRole('group', { name: 'Forme du cadre' }).getByRole('button', { name: 'Carré' }).click();
  // zoom with « + » and the slider, then move the picture with a finger
  await dlg.getByRole('button', { name: 'Zoomer', exact: true }).click(); await dlg.getByRole('button', { name: 'Zoomer', exact: true }).click();
  assert.equal(await dlg.locator('output').innerText(), '144 %');
  const before = await stage.locator('img').evaluate((i) => i.style.transform);
  const b = await stage.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 10, { steps: 6 }); await page.mouse.up();
  assert.notEqual(await stage.locator('img').evaluate((i) => i.style.transform), before, 'the picture follows the finger');
  await dlg.getByRole('slider', { name: 'Zoom' }).fill('300');
  assert.notEqual(await dlg.locator('output').innerText(), '144 %');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}125-recadrage-logo-telephone.png` });
  // Réinitialiser: back to the whole logo, centred
  await dlg.getByRole('button', { name: 'Réinitialiser' }).click();
  assert.equal(await dlg.locator('output').innerText(), '100 %');
  await dlg.getByRole('button', { name: 'Zoomer', exact: true }).click();
  // Appliquer: the cropped logo is sent to her folder and becomes her logo
  const n = w.uploads.length;
  await dlg.getByRole('button', { name: 'Appliquer' }).click();
  await dlg.waitFor({ state: 'detached', timeout: 15000 });
  assert.ok(w.uploads.length > n, 'the cropped logo is uploaded');
  assert.match(await card.locator('img').getAttribute('src'), new RegExp(`/store-media/${USER.id}/[0-9a-f]{20}-\\d+\\.webp$`));
  // a new file opens the window first; Annuler leaves her logo as it was
  const now = await card.locator('img').getAttribute('src');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await card.getByLabel('Choisir une image : Votre logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await card.locator('img').getAttribute('src'), now);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await page.getByText(/C’est enregistré/).waitFor();
  assert.equal(w.stores[0].fiche.store.logo, now, 'the cropped logo is saved in her store');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor: « Recadrer » a photo of her site, on a phone and on a computer, with the grid and the zoom; the cropped photo replaces it', async () => {
  const w = withModel(world(), 'michou'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  const img = site.locator('img[data-jeere-pickable="i"]').first();
  await img.scrollIntoViewIfNeeded(); await img.click();
  const tools = page.getByRole('navigation', { name: /^Outils : / });
  await tools.getByRole('button', { name: 'Recadrer', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Recadrer la photo' });
  const stage = dlg.getByLabel(/^Zone de recadrage/);
  await stage.locator('img').waitFor({ timeout: 30000 });
  await dlg.getByRole('group', { name: 'Forme du cadre' }).getByRole('button', { name: 'Portrait' }).click();
  await dlg.getByRole('slider', { name: 'Zoom' }).fill('160');
  const b = await stage.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2 - 30, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}126-recadrage-photo-editeur.png` });
  await dlg.getByRole('button', { name: 'Appliquer' }).click();
  await dlg.waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForTimeout(500);
  assert.match(await img.getAttribute('src'), /store-media\//, 'the cropped photo is on her site');
  // « Ajuster / Cadre » opens the same window
  await img.click();
  await tools.getByRole('button', { name: 'Ajuster / Cadre' }).click();
  await page.getByRole('button', { name: 'Recadrer la photo' }).click();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await dlg.waitFor({ state: 'detached' });
  // on a computer: the « Recadrer » of a picture in the side panel
  await page.setViewportSize(DESK); await page.waitForTimeout(800);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('Produits: only the products of the shop she is on; another shop with none shows the empty state, never examples nor the products of the first', async () => {
  const a = store(), b = { ...store(), id: 'bbbbbbbb-0000-4000-8000-000000000002', slug: 'rhorho', fiche: { version: 1, store: { name: 'rhorho', model: 'michou' } } };
  const w = world({ stores: [a, b] }); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/produits/`);
  await page.getByText('Beurre de karité brut').first().waitFor();
  // she changes shop from the top bar, without reloading
  await page.getByRole('combobox', { name: 'Boutique' }).first().selectOption({ label: 'rhorho' });
  await page.getByText('Aucun produit pour le moment').waitFor();
  for (const n of ['Beurre de karité brut', 'Savon noir au karité', 'Huile de coco vierge', 'Collier en perles de verre', 'Créoles torsadées dorées']) assert.equal(await page.getByText(n).count(), 0, `${n} is not shown on rhorho`);
  await page.getByRole('button', { name: 'Ajouter un produit' }).first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}128-produits-rhorho-vide.png` });
  assert.equal(w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').length, 0, 'nothing written by just looking');
  // and after a reload, still rhorho, still empty
  await page.reload(); await page.getByText('Aucun produit pour le moment').waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

await test('sidebar: the page she is on is light glass with a thin rainbow edge, never a black block, and nothing of it is cut', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/commandes/`); await h1(page, 'Commandes');
  const on = page.locator('aside nav a[aria-current="page"]').first();
  await on.waitFor();
  const look = await on.evaluate((a) => { const c = getComputedStyle(a); return { bg: c.backgroundColor, color: c.color, img: c.backgroundImage.includes('gradient') }; });
  assert.notEqual(look.bg, 'rgb(17, 17, 17)', 'not a black block');
  assert.equal(look.img, true, 'a rainbow edge');
  const inside = await on.evaluate((a) => { const r = a.getBoundingClientRect(), s = a.closest('aside').getBoundingClientRect(); return r.left - s.left >= 8 && s.right - r.right >= 8; });
  assert.equal(inside, true, 'it floats inside the panel');
  await page.waitForTimeout(300);
  const box = await page.locator('aside').boundingBox();
  await page.screenshot({ path: `${SHOTS}130-barre-onglet-actif.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 620) } });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a model on her store: its demo photos are plain frames (« Ajoutez votre photo » in the editor), its demo product cases are not her products', async () => {
  const w = withModel(world(), 'michou'); w.stores[0].fiche.products = []; const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const site = page.frameLocator('iframe[title="Votre site"]');
  await site.locator('[data-jeere-pickable]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const n = await site.locator('img[data-jeere-plain]').count();
  assert.ok(n >= 3, `the demo photos are plain frames (${n})`);
  assert.match(await site.locator('img[data-jeere-plain]').first().getAttribute('src'), /Ajoutez%20votre%20photo/);
  await page.screenshot({ path: `${SHOTS}132-editeur-mode-neutre.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('installation by the team: a complete form, read to the end, accepted, signed with her legal name and her hand; the price follows her products (100 000 F for 10, 5 000 F each beyond); then Stripe', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/modeles/?tous=1`); await h1(page, 'Modèles de designer');
  await page.locator('main ul > li').filter({ hasText: 'MICHOU' }).getByRole('button', { name: /^Choisir/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('Jehre installe tout pour moi').click();
  await sheet.getByRole('button', { name: 'Remplir le formulaire' }).click();
  await h1(page, 'Formulaire d’installation');
  // signing is impossible before reading, and every field is asked
  await page.getByRole('button', { name: /^Signer et payer/ }).click();
  for (const t of ['Dites en quelques mots ce que vous vendez.', 'Lisez le formulaire jusqu’en bas.', 'Signez dans le cadre.']) await page.getByText(t).first().waitFor();
  assert.equal(await page.getByRole('checkbox').isDisabled(), true, 'the box is ticked only once read');
  await page.getByLabel('Ce que vous vendez').fill('Streetwear : t-shirts et casquettes');
  await page.getByLabel('Nombre de produits à mettre en ligne').fill('14');
  assert.match((await page.locator('main').innerText()).replace(/\s/g, ' '), /Installation · 14 produits 120 000 FCFA/);
  assert.match((await page.locator('main').innerText()).replace(/\s/g, ' '), /Total, payé une seule fois 170 000 FCFA/);
  const terms = page.getByLabel('Formulaire à lire');
  assert.match(await terms.innerText(), /plus 4 produits à 5\s000\sFCFA/);
  assert.match(await terms.innerText(), /2 séries de corrections/);
  await terms.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.getByRole('checkbox').check();
  await page.getByLabel('Votre nom légal').fill('Awa KONÉ');
  await page.getByRole('img', { name: 'Votre signature' }).scrollIntoViewIfNeeded();
  const pad = await page.getByRole('img', { name: 'Votre signature' }).boundingBox();
  assert.equal(await page.getByText('Lisez le formulaire jusqu’en bas.').count(), 0, 'the error goes once read');
  await page.mouse.move(pad.x + 30, pad.y + 100); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 30 + i * 18, pad.y + 100 - Math.sin(i / 2) * 30);
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal(await page.getByText('Signez dans le cadre.').count(), 0, 'signed');
  await page.evaluate(() => { window.getSelection()?.removeAllRanges(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${SHOTS}134-formulaire-installation.png`, fullPage: true });
  await page.getByRole('button', { name: 'Signer et payer 170 000 FCFA' }).click();
  await page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const row = w.installs[0];
  assert.equal(row.model, 'michou'); assert.equal(row.products_count, 14); assert.equal(row.install_price, 120000);
  assert.equal(row.legal_name, 'Awa KONÉ'); assert.match(row.signature_png, /^data:image\/png;base64,/);
  assert.match(row.terms_text, /Il décrit exactement le travail commandé/);
  const bill = w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'model');
  assert.deepEqual([bill.body.model, bill.body.install, bill.body.installRequestId], ['michou', true, row.id]);
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}135-formulaire-installation-telephone.png`, fullPage: true });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('promo codes, abandoned carts, pickup in the shop, WhatsApp button, trackers, catalogue and the export of her data', async () => {
  const w = withModel(world(), 'seve');
  w.carts = [{ id: 'cart-1', name: 'Mariam', phone: '07 08 09 10 11', email: '', cart: [{ name: 'Beurre de karité brut', qty: 2 }], total: 13000, currency: 'XOF', updated_at: new Date(Date.now() - 3 * 3600000).toISOString(), relaunched_at: null }];
  const { page, ctx, errors } = await open(browser, DESK, w);
  // a promo code: checked fields, created, paused, deleted
  await page.goto(`${BASE}/admin/promos/`); await h1(page, 'Codes promo');
  await page.getByLabel('Code', { exact: true }).fill('ab');
  await page.getByRole('button', { name: 'Créer le code' }).click();
  await page.getByText('De 3 à 24 lettres ou chiffres, sans espace (ex. BIENVENUE10).').waitFor();
  await page.getByLabel('Code', { exact: true }).fill('BIENVENUE10');
  await page.getByLabel('Panier minimum (FCFA)').fill('10000');
  await page.getByRole('button', { name: 'Créer le code' }).click();
  await page.getByText('BIENVENUE10', { exact: true }).waitFor();
  assert.deepEqual([w.promos[0].code, w.promos[0].kind, w.promos[0].value, w.promos[0].min_total, w.promos[0].store_id], ['BIENVENUE10', 'percent', 10, 10000, w.stores[0].id]);
  await page.getByText(/-10 % · dès 10.000.FCFA · 0 utilisation/).waitFor();
  await page.screenshot({ path: `${SHOTS}136-codes-promo.png` });
  await page.getByRole('button', { name: 'Mettre en pause' }).click();
  await page.getByRole('button', { name: 'Réactiver' }).waitFor();
  assert.equal(w.promos[0].active, false);
  // abandoned carts: one tap to WhatsApp with the cart written out
  await page.goto(`${BASE}/admin/paniers/`); await h1(page, 'Paniers abandonnés');
  const wa = page.getByRole('link', { name: 'Relancer sur WhatsApp' });
  const href = await wa.getAttribute('href');
  assert.match(href, /^https:\/\/wa\.me\/2250708091011\?text=/);
  assert.match(decodeURIComponent(href), /2 × Beurre de karité brut/);
  await page.screenshot({ path: `${SHOTS}137-paniers-abandonnes.png` });
  await page.getByRole('button', { name: 'Traité' }).click();
  await page.getByText('Aucun panier abandonné ces 30 derniers jours.').waitFor();
  // pickup in the shop
  await page.goto(`${BASE}/admin/livraison/`); await h1(page, 'Livraison');
  await page.getByText('Vos clientes peuvent venir chercher leur commande, sans frais de livraison.').click();
  await page.getByLabel(/^Adresse de la boutique/).fill('Cocody Riviera 2, en face de la pharmacie');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(600);
  let saved = w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').pop();
  assert.deepEqual(saved.body.fiche.store.pickup, { on: true, address: 'Cocody Riviera 2, en face de la pharmacie' });
  // settings: WhatsApp button off, Pixel and GA4, the catalogue address, the exports
  await page.goto(`${BASE}/admin/parametres/`); await h1(page, 'Paramètres');
  await page.getByLabel('Pixel Meta (Facebook, Instagram)').fill('12ab');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/L’identifiant du Pixel est une suite de chiffres/).waitFor();
  await page.getByLabel('Pixel Meta (Facebook, Instagram)').fill('123456789012345');
  await page.getByLabel('Google Analytics 4').fill('g-abc12345');
  await page.getByText('Bouton WhatsApp rond en bas de votre site (avec votre numéro ci-dessus).').click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForTimeout(600);
  saved = w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').pop();
  assert.deepEqual([saved.body.fiche.store.tracking, saved.body.fiche.store.waButton], [{ metaPixel: '123456789012345', ga4: 'G-ABC12345' }, false]);
  await page.getByText('https://boutique-test.store.jehre.com/catalogue.csv').waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Commandes (CSV)' }).click()]);
  assert.equal(dl.suggestedFilename(), 'commandes-boutique-test.csv');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Clients (CSV)' }).click()]);
  const txt = (await import('node:fs')).readFileSync(await dl2.path(), 'utf8');
  assert.match(txt, /Nom;Téléphone;E-mail;Commune;Commandes;Total dépensé/);
  await page.screenshot({ path: `${SHOTS}138-parametres-pub-donnees.png`, fullPage: true });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('the orders of the month count against the plan: every order received; a word near and past the limit, never a block', async () => {
  const w = world(); w.monthOrders = 12; const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/`);
  await page.getByText('12 commandes ce mois-ci, pour 10 dans votre formule. Vos commandes continuent d’arriver.').waitFor();
  await page.getByRole('link', { name: 'Passer à Croissance' }).waitFor();
  await page.goto(`${BASE}/admin/abonnement/`); await h1(page, 'Abonnement');
  await page.getByText('12 / 10 commandes ce mois-ci').waitFor();
  await page.getByText('Toutes les commandes reçues par la boutique comptent, quel que soit le paiement.').waitFor();
  await page.screenshot({ path: `${SHOTS}141-commandes-du-mois.png` });
  w.monthOrders = 8; await page.goto(`${BASE}/admin/`);
  await page.getByText('8 commandes sur 10 ce mois-ci.').waitFor();
  w.monthOrders = 3; await page.goto(`${BASE}/admin/`); await page.waitForTimeout(1200);
  assert.equal(await page.getByText(/commandes sur 10 ce mois-ci/).count(), 0, 'nothing said while far from the limit');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('home with her store in a phone on the right; pages use the width; About; booking sites: products are an option; the deposit', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, { width: 1600, height: 1000 }, w);
  // the test store has no site on the internet: its phone shows the SÈVE demo instead (when the network allows it)
  await ctx.route('https://boutique-test.store.jehre.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const to = path.startsWith('/connect/') ? null : path.startsWith('/concepts/') ? `https://kreeative.xyz${path}` : `https://kreeative.xyz/concepts/seve${path}`;
    if (!to) return route.fallback();
    try { const r = await route.fetch({ url: to }); await route.fulfill({ response: r }); } catch { await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Boutique</p>' }); }
  });
  await page.goto(`${BASE}/admin/`);
  const prev = page.getByRole('region', { name: 'Votre boutique' });
  await prev.getByText('En ligne', { exact: true }).waitFor();
  for (const n of ['Personnaliser', 'Voir']) await prev.getByRole('link', { name: n }).waitFor();
  await prev.getByRole('button', { name: 'Partager' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}142-accueil-apercu.png` });
  // the deposit, in Paiements
  await page.goto(`${BASE}/admin/paiements/`);
  await page.getByText('Avec Wave ou le mobile money, la cliente paie une partie à la commande, et le reste à la livraison.').click();
  await page.getByLabel('Part payée à la commande (%)').fill('30');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.waitForTimeout(800);
  const saved = w.calls.filter((c) => c.path === '/rest/v1/stores' && c.method === 'PATCH').pop();
  assert.deepEqual(saved.body.fiche.store.deposit, { on: true, percent: 30 });
  // About, public
  await page.goto(`${BASE}/a-propos/`);
  await page.getByRole('heading', { name: 'L’histoire de Jehre' }).waitFor();
  await page.getByText(/Anne-Kelly Kouyate/).first().waitFor();
  await page.screenshot({ path: `${SHOTS}143-a-propos.png` });
  assert.deepEqual(errors, []); await ctx.close();
  // a booking site (REGARD) without the option: Produits offers it; the model's price says « À partir de »
  const w2 = withModel(world(), 'regard'); w2.stores[0].fiche.store.model = 'regard';
  const o = await open(browser, DESK, w2);
  await o.page.goto(`${BASE}/admin/produits/`);
  await o.page.getByText('Vendre aussi des produits').waitFor();
  await o.page.getByRole('button', { name: /^Activer pour 25.000.FCFA$/ }).click();
  await o.page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const opt = w2.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'shop_option');
  assert.equal(opt.body.storeId, w2.stores[0].id);
  await o.page.screenshot({ path: `${SHOTS}144-option-produits.png` });
  // with the option bought for this store, the products are there
  w2.models = [...(w2.models ?? []), { model: 'option-produits', store_id: w2.stores[0].id }];
  await o.page.goto(`${BASE}/admin/produits/`);
  await o.page.getByText('Beurre de karité brut').first().waitFor();
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

await test('wide settings pages: Paramètres, Paiements, Livraison, Associés, Domaine and Modèles use the screen; light glass cards; one focus ring', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, { width: 1600, height: 1000 }, w);
  const narrow = [];
  const pages = [['parametres', 'Paramètres'], ['paiements', 'Paiements'], ['livraison', 'Livraison'], ['equipe', 'Associés'], ['domaine', 'Nom de domaine'], ['modeles', 'Ma boutique'], ['modeles', 'Modèles de designer', true]];
  for (const [path, title, all] of pages) {
    if (all) { w.models = []; delete w.stores[0].fiche.store.model; }
    await page.goto(`${BASE}/admin/${path}/`);
    await page.getByRole('heading', { level: 1, name: title }).waitFor();
    await page.waitForTimeout(900);
    // the content runs from the side bar to the right edge (less its margin): no narrow column with an empty right half
    const used = await page.evaluate(() => {
      const main = document.querySelector('main'); if (!main) return 0;
      const kids = [...main.querySelectorAll('section, form, ul')].filter((n) => n.getBoundingClientRect().height > 40);
      const right = Math.max(...kids.map((n) => n.getBoundingClientRect().right));
      return right / window.innerWidth;
    });
    if (used <= 0.9) narrow.push(`${title} : ${Math.round(used * 100)} %`);
    await page.screenshot({ path: `${SHOTS}150-large-${path}${all ? '-grille' : ''}.png`, fullPage: true });
  }
  assert.deepEqual(narrow, [], 'pages qui s’arrêtent avant la droite');
  // a field in focus has one ring, never a grey and a black one stacked
  await page.goto(`${BASE}/admin/parametres/`);
  const f = page.locator('main input[type="text"], main input:not([type])').first();
  await f.focus();
  const ring = await f.evaluate((el) => { const cs = getComputedStyle(el); return { outline: cs.outlineStyle, shadow: cs.boxShadow }; });
  assert.ok(ring.outline === 'none' || ring.shadow === 'none', `double contour : ${JSON.stringify(ring)}`);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor, header (SÈVE): her name or her logo', async () => {
  const w = withModel(world(), 'seve'); const { page, ctx, errors } = await open(browser, { width: 1440, height: 900 }, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('button', { name: 'En-tête', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Contenu : En-tête' });
  await right.waitFor(); await page.waitForTimeout(1200);
  const site = page.frameLocator('iframe[title="Votre site"]');
  const before = await site.locator('body').evaluate(() => ({ imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')), head: document.querySelector('header').innerText.replace(/\s+/g, ' ').trim() }));
  const pick = right.getByRole('group', { name: 'Afficher en haut du site' });
  assert.equal(await pick.getByRole('button', { name: 'Votre nom' }).getAttribute('aria-pressed'), 'true');
  await pick.getByRole('button', { name: 'Votre logo' }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await right.getByLabel('Choisir une image : Votre logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('dialog', { name: 'Recadrer le logo' }).getByRole('button', { name: 'Appliquer' }).click();
  await right.getByRole('button', { name: 'Remplacer : Votre logo' }).waitFor({ timeout: 15000 });
  await site.locator('header [data-jeere-logo-img] img').waitFor();
  await page.waitForTimeout(500);
  // her logo is in the header; every other text and picture of the page stays where it was (nothing shifts)
  const after = await site.locator('body').evaluate(() => ({ imgs: [...document.querySelectorAll('img')].filter((i) => !i.closest('[data-jeere-logo-img]')).map((i) => i.getAttribute('src')), head: document.querySelector('header').innerText.replace(/\s+/g, ' ').trim() }));
  assert.deepEqual(after.imgs, before.imgs);
  assert.equal(after.head, before.head.replace(/\s*sève\s*/, ' ').replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${SHOTS}161-entete-seve-logo.png` });
  // « Votre nom »: the name comes back, the logo is kept aside
  await pick.getByRole('button', { name: 'Votre nom' }).click();
  await page.waitForTimeout(500);
  assert.equal(await site.locator('header [data-jeere-logo-img]').count(), 0);
  assert.equal(await site.locator('body').evaluate(() => document.querySelector('header').innerText.replace(/\s+/g, ' ').trim()), before.head);
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText(/Votre site est en ligne/).waitFor();
  assert.equal(w.stores[0].fiche.store.brand, 'text');
  assert.match(w.stores[0].fiche.store.logo, /^https:\/\//);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('The Ivory Sukundu in the new dashboard: in the switcher for the founder only; signed in with her Jehre account; Accueil (sales, chart, to do); Commandes; an order: supplier, tracking, refund, e-mail', async () => {
  // another account does not see it
  const o0 = await open(browser, DESK, world());
  await o0.page.goto(`${BASE}/admin/`);
  await o0.page.getByRole('heading', { name: /Bonjour/ }).waitFor();
  assert.equal(await o0.page.locator('#store-pick option', { hasText: 'The Ivory Sukundu' }).count(), 0);
  await o0.ctx.close();
  // the founder: it is in the switcher, and opens with her Jehre account (no e-mail)
  const now = Date.now(), d = (h) => new Date(now - h * 3600e3).toISOString();
  const w = world({ founder: true, tishe: { orders: [
    { id: 'cs_1', number: 1007, name: 'Ama K.', email: 'ama@exemple.com', status: 'new', total: 18500, currency: 'cad', createdAt: d(5), shipping: { city: 'Montréal', country: 'CA' } },
    { id: 'cs_2', number: 1006, name: 'Kofi B.', email: 'kofi@exemple.com', status: 'ordered', total: 9900, currency: 'cad', createdAt: d(80), shipping: { city: 'Toronto', country: 'CA' } },
    { id: 'cs_3', number: 1005, name: 'Esi D.', email: 'esi@exemple.com', status: 'delivered', total: 24000, currency: 'cad', createdAt: d(900), shipping: { city: 'Paris', country: 'FR' } },
  ] } });
  const { page, ctx, errors } = await open(browser, DESK, w);
  page.on('dialog', (dl) => dl.accept());
  await page.goto(`${BASE}/admin/`);
  await page.locator('#store-pick').selectOption('ext:tishe');
  await page.getByRole('heading', { name: 'The Ivory Sukundu', level: 1 }).waitFor();
  assert.ok(w.tisheCalls.some((c) => c.action === 'jeere' && c.accessToken), 'signed in with her Jehre session');
  await page.getByText('À commander chez le fournisseur').waitFor();
  await page.getByRole('link', { name: /#1007/ }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Voir la boutique' }).first().getAttribute('href'), 'https://www.theivorysukundu.com');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}170-tishe-accueil.png`, fullPage: true });
  // Commandes: filtered from Accueil's figure, then an order in the side panel
  await page.getByRole('link', { name: /À commander chez le fournisseur/ }).click();
  await page.getByRole('heading', { name: 'Commandes', level: 1 }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Filtrer les commandes' }).getByRole('button', { pressed: true }).innerText(), 'À commander · 1');
  await page.getByRole('button', { name: /#1007/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Commande #1007' });
  await sheet.getByText('Robe Kente').waitFor();
  await sheet.getByText('Hello, please make 1 Kente dress size M.').waitFor();
  await page.screenshot({ path: `${SHOTS}171-tishe-commande.png` });
  // the supplier and the tracking: saved on the shop, the customer told
  await sheet.getByLabel('Référence chez le fournisseur').fill('ACC-88');
  await sheet.getByLabel('Transporteur').fill('DHL');
  await sheet.getByLabel('Numéros de suivi').fill('JD0123');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré. La cliente a reçu son numéro de suivi.').waitFor();
  const up = w.tisheCalls.filter((c) => c.action === 'update').pop();
  assert.deepEqual([up.id, up.supplierRef, up.carrier, up.tracking, up.notify], ['cs_1', 'ACC-88', 'DHL', 'JD0123', true]);
  // a partial refund, after a confirmation
  await sheet.getByRole('button', { name: 'Rembourser' }).first().click();
  await sheet.getByLabel('Montant (CAD)').fill('20,00');
  await sheet.getByRole('button', { name: 'Rembourser' }).last().click();
  await page.getByText(/Remboursement fait/).waitFor();
  assert.equal(w.tisheCalls.filter((c) => c.action === 'refund').pop().amount, 2000);
  // an e-mail to the customer, from the shop
  await sheet.getByRole('button', { name: 'Écrire à la cliente' }).click();
  await sheet.getByLabel('Message', { exact: true }).fill('Votre robe part demain.');
  await sheet.getByRole('button', { name: 'Envoyer depuis la boutique' }).click();
  await page.getByText('E-mail envoyé.').waitFor();
  assert.equal(w.tisheCalls.filter((c) => c.action === 'email').pop().to, 'ama@exemple.com');
  // back to her Jehre store
  await page.keyboard.press('Escape');
  await page.locator('#store-pick').selectOption(w.stores[0].id);
  await page.getByRole('heading', { name: 'Commandes', level: 1 }).waitFor();
  await page.getByText('Mariam K.').first().waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

await test('The Ivory Sukundu, its other pages: Produits (order, a product with its options and prices), Codes promo, Bandeau et soldes, Livraison, Clientes, Paramètres', async () => {
  const w = world({ founder: true, tishe: { orders: [] } });
  const { page, ctx, errors } = await open(browser, DESK, w);
  page.on('dialog', (dl) => dl.accept());
  await page.addInitScript(() => window.localStorage.setItem('jeere-ext', 'tishe'));
  // Produits: the shop's order, one product edited
  await page.goto(`${BASE}/admin/produits/`);
  await page.getByRole('heading', { name: 'Produits', level: 1 }).waitFor();
  await page.getByText('Kente Wave Wig').waitFor();
  await page.getByRole('button', { name: 'Descendre Kente Wave Wig' }).click();
  await page.getByText('Ordre enregistré.').waitFor();
  assert.deepEqual(w.tishe.doc.products.map((x) => x.handle), ['ivory-straight', 'kente-wave']);
  await page.getByRole('button', { name: /^Kente Wave Wig/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Kente Wave Wig' });
  await sheet.getByLabel('Prix CAD 1').fill('299');
  await sheet.getByRole('button', { name: 'Ajouter une option' }).click();
  await sheet.getByLabel('Option 2', { exact: true }).fill('20"');
  await sheet.getByLabel('Prix CAD 2').fill('340');
  await page.screenshot({ path: `${SHOTS}172-tishe-produit.png` });
  await sheet.getByRole('button', { name: 'Enregistrer sur la boutique' }).click();
  await page.getByText('Produit enregistré sur la boutique.').waitFor();
  const saved = w.tisheCalls.filter((c) => c.action === 'saveProduct').pop().product;
  assert.deepEqual(saved.variants.map((v) => [v.selectedOptions[0].value, v.price.CAD]), [['18"', 299], ['20"', 340]]);
  assert.equal(saved.descriptionHtml, '<p>Soft body wave.</p>', 'its own formatting is kept while she does not touch the words');
  await page.keyboard.press('Escape');
  // Codes promo
  await page.goto(`${BASE}/admin/promos/`);
  await page.getByText('CIRCLE10').waitFor();
  await page.getByText('4 utilisations').waitFor();
  await page.getByRole('button', { name: 'Nouveau code' }).click();
  const code = page.getByRole('dialog', { name: 'Nouveau code' });
  await code.getByLabel('Code').fill('vip20');
  await code.getByLabel('Pourcentage').fill('20');
  await code.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Code enregistré.').waitFor();
  assert.deepEqual(w.tisheCalls.filter((c) => c.action === 'saveCode').pop().rule, { code: 'VIP20', kind: 'percent', active: true, label: '', percent: 20 });
  // Bandeau et soldes
  await page.goto(`${BASE}/admin/bandeau/`);
  await page.getByLabel('Message 2').fill('New lengths in stock');
  await page.getByText('Des soldes en cours').click();
  await page.getByLabel('Fin des soldes').fill('2026-12-31T23:00');
  await page.getByText('Ivory Straight').click();
  await page.getByRole('button', { name: 'Enregistrer sur la boutique' }).click();
  await page.getByText('Bandeau et soldes enregistrés sur la boutique.').waitFor();
  const site = w.tisheCalls.filter((c) => c.action === 'saveSite').pop();
  assert.deepEqual(site.announcements, ['Free shipping over $250', 'New lengths in stock']);
  assert.deepEqual(site.sale.handles, ['ivory-straight']);
  await page.screenshot({ path: `${SHOTS}173-tishe-bandeau.png`, fullPage: true });
  // Livraison
  await page.goto(`${BASE}/admin/livraison/`);
  await page.getByLabel('Canada (CAD)').fill('12,50');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Tarifs de livraison enregistrés.').waitFor();
  assert.deepEqual(w.tisheCalls.filter((c) => c.action === 'saveShipping').pop().rates, { ca: 12.5, us: 20 });
  // En direct: the visitors of its own site
  await page.goto(`${BASE}/admin/en-direct/`);
  await page.getByText('Montréal').first().waitFor();
  assert.deepEqual(w.siteLive.pop(), { p_site: 'the-ivory-sukundu' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}175-tishe-en-direct.png` });
  // Clientes and the Circle
  await page.goto(`${BASE}/admin/clients/`);
  await page.getByText('ama@exemple.com').waitFor();
  await page.getByText('circle@exemple.com').waitFor();
  // Paramètres: its services, and a way to disconnect this browser
  await page.goto(`${BASE}/admin/parametres/`);
  await page.getByRole('link', { name: 'Ouvrir Stripe' }).waitFor();
  await page.getByRole('link', { name: 'Le site' }).first().waitFor();
  // Le site: its pages, edited in place (the real site in its frame; nothing is saved here)
  await page.goto(`${BASE}/admin/le-site/`);
  await page.getByRole('heading', { name: 'Le site', level: 1 }).waitFor();
  assert.equal(await page.locator('iframe[title="theivorysukundu.com, modifiable"]').getAttribute('src'), 'https://www.theivorysukundu.com/?jeere=edit#/');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOTS}174-tishe-site.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

const atlasWorld = (role = 'fondatrice', state = 'in') => world({ atlas: { state, role,
  admins: [{ email: USER.email, role: 'fondatrice', added_by: 'migration', added_at: '2026-11-01T10:00:00Z' }],
  accounts: [
    { id: 'u1', email: 'awa@exemple.com', firstName: 'Awa', source: 'tiktok', phone: '+2250707000000', createdAt: ago(48), lastSignIn: ago(2), verified: true, suspended: false, stores: [{ id: 's1', slug: 'awa-beaute', name: 'Awa Beauté', published: true, plan: 'croissance', promo: false }], purchases: [{ model: 'SÈVE', amount: 25000, at: ago(40), install: true, installedAt: null }] },
    { id: 'u2', email: 'fanta@exemple.com', firstName: 'Fanta', createdAt: ago(300), lastSignIn: null, verified: true, suspended: false, stores: [{ id: 's2', slug: 'fanta-wax', name: 'Fanta Wax', published: false, plan: 'gratuit', promo: false }], purchases: [] },
    { id: 'u3', email: 'nouvelle@exemple.com', firstName: '', createdAt: ago(5), lastSignIn: ago(5), verified: false, suspended: false, stores: [], purchases: [] },
  ] } });

await test('atlas: the e-mail code comes first, then the overview', async () => {
  const w = atlasWorld('fondatrice', 'code');
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/atlas/`);
  await page.getByRole('button', { name: 'Recevoir le code' }).click();
  const otp = w.calls.find((c) => c.path === '/auth/v1/otp');
  assert.equal(otp.body.email, USER.email); assert.equal(otp.body.create_user, false);
  await page.screenshot({ path: `${SHOTS}180-atlas-code.png` });
  await page.locator('input[autocomplete="one-time-code"]').click();
  await page.keyboard.type('123456');
  assert.equal(w.calls.find((c) => c.path === '/auth/v1/verify').body.token, '123456');
  await page.getByRole('heading', { name: 'Vue d’ensemble' }).waitFor();
  await page.getByText('Formules payées').waitFor();
  await page.getByText('Installations à faire').first().waitFor();
  await page.getByText('Tiktok', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}181-atlas-vue.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('atlas: an account outside the team is turned away', async () => {
  const { page, ctx } = await open(browser, DESK, atlasWorld('lecture', 'denied'));
  await page.goto(`${BASE}/atlas/`);
  await page.getByText('Cet espace est réservé à l’équipe Jehre.').waitFor();
  await ctx.close();
});

await test('atlas: the founder suspends, reactivates, changes a plan and manages the admins', async () => {
  const w = atlasWorld('fondatrice');
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/atlas/`);
  await page.getByRole('heading', { name: 'Vue d’ensemble' }).waitFor();
  await page.getByRole('button', { name: 'Comptes', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Rechercher un compte' }).fill('awa');
  await page.getByRole('button', { name: /awa@exemple\.com/ }).click();
  await page.screenshot({ path: `${SHOTS}182-atlas-comptes.png` });
  await page.getByLabel('Formule de Awa Beauté').selectOption('Pro');
  await page.getByText('Formule de Awa Beauté : Pro.').waitFor();
  assert.deepEqual(w.calls.filter((c) => c.path === '/functions/v1/atlas' && c.body.action === 'plan').pop().body, { action: 'plan', storeId: 's1', plan: 'pro' });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Suspendre le compte' }).click();
  await page.getByText('Compte suspendu.').waitFor();
  await page.getByText('Suspendu', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Réactiver le compte' }).click();
  await page.getByText(/Compte réactivé/).waitFor();
  await page.getByRole('button', { name: 'Envoyer un lien de mot de passe' }).click();
  await page.getByText('Lien de mot de passe envoyé à awa@exemple.com.').waitFor();
  // Administrateurs: add a support member, then remove her
  await page.getByRole('button', { name: 'Administrateurs', exact: true }).click();
  await page.getByLabel('Adresse e-mail').fill('aide@exemple.com');
  await page.getByLabel('Rôle', { exact: true }).selectOption('Support');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByText('aide@exemple.com est support.').waitFor();
  await page.getByText('aide@exemple.com', { exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}183-atlas-admins.png` });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Retirer' }).click();
  await page.getByText('aide@exemple.com n’est plus administrateur.').waitFor();
  assert.equal(w.atlas.admins.length, 1);
  // Journal and En direct
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByText('suspendre · awa@exemple.com').waitFor();
  await page.getByRole('button', { name: 'En direct', exact: true }).click();
  await page.getByText('Dakar, Sénégal').waitFor();
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}184-atlas-direct.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('atlas: read-only sees, but cannot act; on a phone nothing overflows', async () => {
  const w = atlasWorld('lecture');
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/atlas/`);
  await page.getByRole('heading', { name: 'Vue d’ensemble' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Administrateurs', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Comptes', exact: true }).click();
  await page.getByRole('button', { name: /awa@exemple\.com/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Suspendre le compte' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Envoyer un lien de mot de passe' }).count(), 0);
  assert.equal(await page.getByLabel('Formule de Awa Beauté').count(), 0);
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}185-atlas-phone.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('prices in her money: in Canada $ CA and charged in CAD; in the United States about the same in $ US', async () => {
  const w = world({ zone: { pay: 'cad', show: 'CAD', rate: 1 } });
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/abonnement/`);
  await page.getByText('19 $ CA').first().waitFor();
  await page.getByText('149 $ CA').first().waitFor();
  assert.equal(await page.getByText('7 500 FCFA').count(), 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}190-zone-cad-abonnement.png` });
  await page.getByRole('button', { name: 'Choisir Croissance au mois' }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  const sub = w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'subscribe');
  assert.equal(sub.body.currency, 'cad');
  await page.goto(`${BASE}/admin/modeles/`);
  await page.getByText('59,99 $ CA').first().waitFor();
  await page.getByText('119,99 $ CA').first().waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}191-zone-cad-modeles.png` });
  assert.deepEqual(errors, []); await ctx.close();
  const w2 = world({ zone: { pay: 'cad', show: 'USD', rate: 0.74 } });
  const o2 = await open(browser, PHONE, w2);
  await o2.page.goto(`${BASE}/admin/abonnement/`);
  await o2.page.getByText('≈ 14 $ US').first().waitFor();
  await o2.page.getByText(/Montants approximatifs/).waitFor();
  await noOverflow(o2.page);
  await o2.page.screenshot({ path: `${SHOTS}192-zone-usd-abonnement.png` });
  assert.deepEqual(o2.errors, []); await o2.ctx.close();
});

await test('in the franc CFA zones, nothing changes: FCFA prices, charged in FCFA', async () => {
  const w = world({ zone: { pay: 'xof', show: 'XOF', rate: 1 } });
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/abonnement/`);
  await page.getByText('7 500 FCFA').first().waitFor();
  await page.getByRole('button', { name: 'Choisir Croissance au mois' }).click();
  await page.waitForTimeout(400);
  assert.equal(w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'subscribe').body.currency, 'xof');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('atlas: a model paid by Interac is written by hand and opens for her', async () => {
  const w = atlasWorld('fondatrice');
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/atlas/`);
  await page.getByRole('heading', { name: 'Vue d’ensemble' }).waitFor();
  await page.getByRole('button', { name: 'Comptes', exact: true }).click();
  await page.getByRole('button', { name: /fanta@exemple\.com/ }).click();
  await page.getByRole('button', { name: 'Enregistrer un paiement Interac' }).click();
  await page.getByLabel('Ce qu’elle a payé').selectOption('SOYEUSE');
  assert.equal(await page.getByLabel('Montant reçu ($ CA)').inputValue(), '59,99');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}186-atlas-interac.png` });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await page.getByText('Paiement Interac enregistré : SOYEUSE est ouvert pour fanta@exemple.com.').waitFor();
  assert.deepEqual(w.atlas.interac[0], { action: 'interac', userId: 'u2', model: 'soyeuse', amount: 59.99, storeId: 's2' });
  await page.getByText(/soyeuse \(59,99\s\$\sCA par Interac/).waitFor();
  assert.deepEqual(errors, []); await ctx.close();
  const o2 = await open(browser, DESK, atlasWorld('support'));
  await o2.page.goto(`${BASE}/atlas/`);
  await o2.page.getByRole('button', { name: 'Comptes', exact: true }).click();
  await o2.page.getByRole('button', { name: /fanta@exemple\.com/ }).click();
  await o2.page.getByRole('button', { name: 'Envoyer un lien de mot de passe' }).waitFor();
  assert.equal(await o2.page.getByRole('button', { name: 'Enregistrer un paiement Interac' }).count(), 0);
  await o2.ctx.close();
});

await test('atlas: the mail of @jehre.com is read here and answered from contact@, seen before it leaves', async () => {
  const w = atlasWorld('support');
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/atlas/`);
  await page.getByRole('button', { name: 'Courriels', exact: true }).click();
  await page.getByText('1 non lus').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}187-atlas-courriels.png` });
  await page.getByRole('button', { name: /Question sur ma boutique/ }).click();
  await page.getByRole('heading', { name: 'Question sur ma boutique' }).waitFor();
  assert.match(await page.frameLocator('iframe[title="Contenu du courriel"]').locator('body').innerText(), /ajouter un produit/);
  await page.getByRole('link', { name: /capture\.png/ }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}188-atlas-courriel.png` });
  await page.getByRole('button', { name: 'Répondre' }).click();
  assert.equal(await page.getByLabel('De', { exact: true }).inputValue(), 'contact@jehre.com');
  assert.equal(await page.getByLabel('À', { exact: true }).inputValue(), 'awa@exemple.com');
  assert.equal(await page.getByLabel('Objet').inputValue(), 'Re: Question sur ma boutique');
  await page.getByLabel('Message').fill('Bonjour Awa,\n\nDans Produits, touchez « Ajouter ».\n\nL’équipe Jehre');
  await page.getByRole('button', { name: 'Voir avant d’envoyer' }).click();
  assert.match(await page.frameLocator('iframe[title="Aperçu du courriel"]').locator('body').innerText(), /touchez « Ajouter »/);
  await page.screenshot({ path: `${SHOTS}189-atlas-courriel-apercu.png` });
  assert.equal((w.atlas.sent ?? []).length, 0, 'nothing leaves before « Envoyer »');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.getByText('Courriel envoyé à awa@exemple.com.').waitFor();
  const sent = w.atlas.sent[0];
  assert.equal(sent.from, 'contact'); assert.equal(sent.to, 'awa@exemple.com'); assert.equal(sent.inReplyTo, '<abc@mail>');
  assert.match(sent.html, /touchez « Ajouter »/);
  // the test's own start-up scripts also run in the sandboxed mail frames (no storage there): not the page's errors
  assert.deepEqual(errors.filter((e) => !/sandboxed/.test(e)), []); await ctx.close();
  const o2 = await open(browser, DESK, atlasWorld('lecture'));
  await o2.page.goto(`${BASE}/atlas/`);
  await o2.page.getByRole('heading', { name: 'Vue d’ensemble' }).waitFor();
  assert.equal(await o2.page.getByRole('button', { name: 'Courriels', exact: true }).count(), 0);
  await o2.ctx.close();
});

await test('the free month asks for her card first (nothing charged before its end); without one at the end, the store is offline', async () => {
  const until = new Date(Date.now() + 20 * 864e5).toISOString();
  const w = world(); Object.assign(w.stores[0], { plan: 'essentiel', plan_until: until, plan_promo: 'essai' });
  w.zone = { pay: 'cad', show: 'CAD', rate: 1 };
  const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/`);
  await page.getByRole('heading', { name: 'Ajoute ta carte' }).waitFor();
  await page.getByText(/Rien n’est prélevé avant\./).waitFor();
  await page.getByText(/9\s\$\sCA par mois/).waitFor();
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}193-carte-mois-offert.png` });
  // the other pages wait too; the plans page stays open
  await page.goto(`${BASE}/admin/produits/`);
  await page.getByRole('heading', { name: 'Ajoute ta carte' }).waitFor();
  await page.goto(`${BASE}/admin/abonnement/`);
  await page.getByText(/rien n’est prélevé avant le/).waitFor();
  await page.goto(`${BASE}/admin/`);
  await page.getByRole('button', { name: 'Ajouter ma carte' }).click();
  await page.waitForTimeout(400);
  const sub = w.calls.find((c) => c.path === '/functions/v1/billing' && c.body.action === 'subscribe');
  assert.equal(sub.body.plan, 'essentiel'); assert.equal(sub.body.currency, 'cad'); assert.match(sub.body.returnUrl, /\/admin\/abonnement\/$/);
  assert.deepEqual(errors, []); await ctx.close();
  // the month ended without a card: offline, and the same card brings it back
  const w2 = world(); Object.assign(w2.stores[0], { plan: 'gratuit', plan_until: null, plan_promo: 'essai-coupe', published: false });
  const o2 = await open(browser, DESK, w2);
  await o2.page.goto(`${BASE}/admin/`);
  await o2.page.getByRole('heading', { name: 'Ta boutique est hors ligne' }).waitFor();
  await o2.page.screenshot({ path: `${SHOTS}194-carte-hors-ligne.png` });
  assert.deepEqual(o2.errors, []); await o2.ctx.close();
  // paid (« essai-fini »): the dashboard as usual
  const w3 = world(); Object.assign(w3.stores[0], { plan: 'essentiel', plan_until: null, plan_promo: 'essai-fini' });
  const o3 = await open(browser, DESK, w3);
  await o3.page.goto(`${BASE}/admin/`);
  await o3.page.getByRole('heading', { name: 'Bonjour Kady' }).or(o3.page.locator('h1').first()).waitFor();
  assert.equal(await o3.page.getByRole('heading', { name: 'Ajoute ta carte' }).count(), 0);
  await o3.ctx.close();
});

await test('her own websites (Kreeative, Aïssa Kee…): « Mes sites » opens the Studio, for the founder only', async () => {
  const { page, ctx, errors } = await open(browser, DESK, world({ founder: true }));
  await page.goto(`${BASE}/admin/`);
  const link = page.getByRole('link', { name: 'Mes sites' });
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), '/studio/mes-sites/');
  await page.screenshot({ path: `${SHOTS}195-mes-sites-lien.png` });
  assert.deepEqual(errors, []); await ctx.close();
  const o2 = await open(browser, DESK, world());
  await o2.page.goto(`${BASE}/admin/`);
  await o2.page.getByRole('link', { name: 'Commandes' }).first().waitFor();
  await o2.page.waitForTimeout(800);
  assert.equal(await o2.page.getByRole('link', { name: 'Mes sites' }).count(), 0);
  await o2.ctx.close();
});

await browser.close();
const failed = results.filter((r) => r[0] !== 'ok').length;
console.log(`\n${results.length - failed} / ${results.length} tests passés`);
process.exit(failed ? 1 : 0);
