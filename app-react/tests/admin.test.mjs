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

const USER = { id: '11111111-2222-4333-8444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'kady@exemple.com', created_at: '2026-11-01T10:00:00Z', user_metadata: { first_name: 'Kady' }, app_metadata: {} };
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
  { id: 'o3', store_id: sid, number: 3, status: 'nouvelle', customer: { name: 'Mariam K.', phone: '+225 07 08 09 10 11', commune: 'Cocody', address: 'Riviera 2' }, lines: [{ id: 'p1', name: 'Beurre de karité brut', qty: 2, price: 6500, amount: 13000 }], subtotal: 13000, delivery_fee: 1500, total: 14500, currency: 'XOF', payment: 'Wave', payment_status: '', note: 'Livrer après 17 h.', source: 'boutique', created_at: ago(2) },
  { id: 'o2', store_id: sid, number: 2, status: 'confirmee', customer: { name: 'Fatou D.', phone: '+2250101020304', commune: 'Marcory' }, lines: [{ id: 'p3', name: 'Huile de coco vierge', qty: 1, price: 4500, amount: 4500 }], subtotal: 4500, delivery_fee: 1000, total: 5500, currency: 'XOF', payment: 'Orange Money', payment_status: 'payee', note: null, source: 'boutique', created_at: ago(30) },
  { id: 'o1', store_id: sid, number: 1, status: 'livree', customer: { name: 'Grâce A.' }, lines: [{ id: 'p2', name: 'Savon noir au karité', qty: 3, price: 3000, amount: 9000 }], subtotal: 9000, delivery_fee: 0, total: 9000, currency: 'XOF', payment: 'Carte bancaire', payment_status: 'payee', note: null, source: 'boutique', created_at: ago(24 * 9) },
];

async function open(browser, viewport, world, { logged = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  if (logged) await ctx.addInitScript((s) => { window.localStorage.setItem('sb-aezchxfvzfoqlvzchqyk-auth-token', JSON.stringify(s)); }, session());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  await ctx.route('**/connect/jeere-connect.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: CONNECT }));
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
    if (p === '/rest/v1/rpc/my_models') { if (world.modelsLate > 0) { world.modelsLate--; return json(route, 200, []); } return json(route, 200, world.models ?? []); }
    if (p === '/rest/v1/rpc/my_stores') return json(route, 200, world.stores.map((x) => ({ id: x.id, slug: x.slug })));
    if (p === '/rest/v1/rpc/slug_available') return json(route, 200, { available: !(world.taken ?? []).includes(body.p_slug), reason: 'ok' });
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
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'the page must not scroll sideways');
const h1 = (page, text) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, text);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('  ✓', name); }
  catch (e) { results.push(['FAIL', name]); console.log('  ✗', name, '\n   ', String(e.message).split('\n').slice(0, 6).join(' / ')); }
}
const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 860 };

await test('without a session, the dashboard sends to the login page', async () => {
  const { page, ctx } = await open(browser, DESK, world(), { logged: false });
  await page.goto(`${BASE}/admin/`); await page.waitForURL('**/compte/#connexion'); await ctx.close();
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

await test('products: a photo is shrunk, sent to her own folder, and saved on the product', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/produits/`); await h1(page, 'Produits');
  await page.getByText('Savon noir au karité').click();
  const sheet = page.getByRole('dialog');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await sheet.getByLabel('Choisir une photo').setInputFiles({ name: 'savon.png', mimeType: 'image/png', buffer: png });
  await sheet.getByRole('button', { name: 'Changer la photo' }).waitFor();
  assert.equal(w.uploads.length, 1); assert.match(w.uploads[0], new RegExp(`^${USER.id}/[0-9a-f]{20}-1\\.webp$`), 'under her own folder, named by its content');
  await page.screenshot({ path: `${SHOTS}18-produit-photo.png` });
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  const saved = w.stores[0].fiche.products[1];
  assert.match(saved.image, new RegExp(`/storage/v1/object/public/store-media/${USER.id}/[0-9a-f]{20}-1\\.webp$`)); assert.equal(saved.art, 'soap', 'the rest of the product is kept');
  // a file that is not an image is refused, and nothing is sent
  await page.getByText('Huile de coco vierge').click();
  await sheet.getByLabel('Choisir une photo').setInputFiles({ name: 'liste.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
  await sheet.getByText('Choisissez une image').waitFor();
  assert.equal(w.uploads.length, 1);
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
  await page.getByText('Ce numéro ne semble pas complet').waitFor();
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
  for (const t of ['Je remplis moi-même', '50 000 FCFA', 'Jehre installe tout pour moi', 'Dès 150 000 FCFA', 'Un site 100 % sur mesure', 'À partir de 300 000 FCFA']) assert.ok(opts.includes(t), t);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}41-modele-choisir.png` });
  // she fills it herself: the card payment is asked from the server, for this model and this store
  await sheet.getByRole('button', { name: 'Payer par carte' }).click();
  await sheet.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  const bill = w.calls.find((c) => c.path === '/functions/v1/billing');
  assert.equal(bill.body.action, 'model'); assert.equal(bill.body.model, 'michou'); assert.equal(bill.body.install, false);
  assert.equal(bill.body.storeId, w.stores[0].id); assert.equal(bill.body.shopName, 'Boutique Test'); assert.ok(bill.body.returnUrl.endsWith('/admin/modeles/'));
  // the team installs it: three questions, no payment, a quote
  await sheet.getByText('Jehre installe tout pour moi').click();
  await sheet.getByLabel('Combien de produits ou prestations ?').selectOption('11 à 30');
  await sheet.getByLabel('Vous avez un logo ?').selectOption('Non');
  assert.equal(await sheet.getByLabel('Votre numéro WhatsApp').inputValue(), '+2250707123456');
  await sheet.getByLabel('Votre numéro WhatsApp').fill('07');
  await sheet.getByRole('button', { name: 'Recevoir mon devis' }).click();
  await sheet.getByText('Écrivez un numéro WhatsApp complet, avec l’indicatif.').waitFor();
  assert.equal(w.calls.some((c) => c.path === '/functions/v1/appel'), false);
  await sheet.getByLabel('Votre numéro WhatsApp').fill('+225 07 07 12 34 56');
  await sheet.getByRole('button', { name: 'Recevoir mon devis' }).click();
  await page.getByText('C’est noté. Vous recevez votre devis sur WhatsApp très vite.').waitFor();
  const ask = w.calls.find((c) => c.path === '/functions/v1/appel');
  assert.equal(ask.body.source, 'devis-installation'); assert.equal(ask.body.firstName, 'Kady'); assert.equal(ask.body.whatsapp, '+225 07 07 12 34 56');
  assert.ok(ask.body.need.startsWith('DEVIS INSTALLATION. Modèle : MICHOU. Produits : 11 à 30. Photos prêtes : Oui. Logo : Non.'));
  await page.getByRole('dialog').waitFor({ state: 'detached' });
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
  await page.goto(`${BASE}/admin/modeles/`); await h1(page, 'Modèles de designer');
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
    assert.equal(start.bottom, 832, `${path}: the bar floats 12 px above the bottom edge`); assert.equal(start.left, 12); assert.equal(start.width, 366);
    for (const dy of [300, 500, 700, -400, 900]) {
      await page.mouse.wheel(0, dy); await page.waitForTimeout(120);
      const now = await where();
      assert.equal(now.top, start.top, `${path}: the bar moved while scrolling`); assert.equal(now.bottom, 832);
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
  assert.equal(Math.round((await page.locator('header').boundingBox()).height), 56);
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
  for (const old of ['Menthe', 'Sable', 'Hibiscus', 'Karité', 'Plateau', 'Treichville', 'Style', 'Ajouter une section', 'image Pinterest', 'Cold Culture']) assert.equal(ui.includes(old), false, `« ${old} » must not show`);
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
  await right.getByRole('button', { name: 'Remettre le texte du modèle' }).waitFor();
  assert.equal(await right.getByLabel('Titre', { exact: true }).inputValue(), 'Collection Harmattan', 'two lines of a title read as two words');
  // pictures: a clean card (miniature, plain name, « Remplacer »), never the model's own notes
  const media = right.getByRole('region', { name: 'Images' });
  assert.deepEqual(await media.locator('b').allInnerTexts(), ['Image principale', 'Image secondaire']);
  assert.equal(await media.getByRole('button', { name: /^Remplacer/ }).count(), 2);
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
  assert.ok(leaves.some((x) => x.startsWith('Titre – Collection Harmattan')), leaves.join(' | ')); assert.ok(leaves.includes('Image principale'));
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
  assert.deepEqual(await left.evaluate(card), { x: 12, top: 68, w: 260, gapBottom: 12, radius: '16px', bg: 'rgb(255, 255, 255)', shadow: true });
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
  assert.deepEqual(await right.evaluate(card), { x: 1440 - 12 - 300, top: 68, w: 300, gapBottom: 12, radius: '16px', bg: 'rgb(255, 255, 255)', shadow: true });
  assert.deepEqual(await right.locator('h3').evaluateAll((els) => els.filter((e) => e.parentElement.tagName !== 'SECTION').map((e) => e.textContent)), ['Contenu', 'Mise en page', 'Apparence']);
  assert.equal(Math.round((await right.getByLabel('Espace au-dessus (px)').boundingBox()).height), 32);
  // layout and appearance: written in her store, drawn on the site at once, and undone in one click
  const sec = () => site.locator('body').evaluate(() => { const all = [...document.querySelectorAll('header, footer, section, .strip')].filter((el) => !el.closest('.concept, .concept-bar') && !(el.parentElement && el.parentElement.closest('header, footer, section, .strip'))); const el = all.find((x) => /nouveaut/i.test(x.textContent.slice(0, 200)) && x.tagName === 'SECTION'); const c = getComputedStyle(el); const img = el.querySelector('img'); return { pt: c.paddingTop, pb: c.paddingBottom, align: c.textAlign, bg: c.backgroundColor, line: c.borderTopWidth, radius: img ? getComputedStyle(img).borderTopLeftRadius : '' }; });
  const model = await sec();
  await right.getByLabel('Espace au-dessus (px)').fill('120');
  await right.getByLabel('Espace en dessous (px)').fill('64');
  await right.getByRole('button', { name: 'Centre' }).click();
  await right.getByRole('button', { name: 'Crème' }).click();
  await right.getByLabel('Coins des images (px)').fill('24');
  await right.getByRole('switch', { name: 'Filet au-dessus de la section' }).click();
  await page.waitForFunction(() => true); await page.waitForTimeout(500);
  assert.deepEqual(await sec(), { pt: '120px', pb: '64px', align: 'center', bg: 'rgb(250, 246, 239)', line: '1px', radius: '24px' });
  assert.equal(w.calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/stores'), false);
  await page.screenshot({ path: `${SHOTS}55-editeur-studio-ordinateur.png` });
  // the zoom bar floats over the site and changes its scale only
  const zoom = page.getByRole('group', { name: 'Zoom' });
  const z0 = await zoom.boundingBox();
  await zoom.getByRole('button', { name: 'Agrandir' }).click(); await zoom.getByRole('button', { name: 'Agrandir' }).click();
  await zoom.getByText('120 %').waitFor();
  await page.waitForTimeout(400);
  assert.deepEqual(await zoom.boundingBox(), z0, 'the bar did not move');
  assert.deepEqual(await left.evaluate(card), { x: 12, top: 68, w: 260, gapBottom: 12, radius: '16px', bg: 'rgb(255, 255, 255)', shadow: true });
  await zoom.getByRole('button', { name: /revenir à 100 %/ }).click(); await zoom.getByText('100 %').waitFor();
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByRole('status').filter({ hasText: 'Votre site est en ligne' }).waitFor();
  assert.deepEqual(Object.values(w.stores[0].fiche.store.site.s), [{ pt: 120, pb: 64, align: 'center', bg: '#FAF6EF', radius: 24, line: true }]);
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
    assert.equal(r.x, vp.width - 312); assert.equal(r.w, 300); assert.equal(r.radius, '16px'); assert.equal(r.bg, 'rgb(255, 255, 255)');
    assert.equal(await left.count(), 0, 'the list is away while a section is open');
    assert.equal(Math.round((await page.locator('header').boundingBox()).height), 56, 'one line of bar on a tablet');
    assert.ok((await page.locator('iframe[title="Votre site"]').boundingBox()).x <= 24, 'on a tablet the site takes the whole width, under the panels');
    await page.screenshot({ path: `${SHOTS}${vp.shot}.png` });
    await page.getByRole('button', { name: 'Afficher les sections' }).click();
    await left.getByRole('list').first().waitFor();
    const l = await left.evaluate(card);
    assert.equal(l.x, 12); assert.equal(l.w, 260); assert.equal(l.radius, '16px'); assert.equal(l.bg, 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Masquer les sections' }).click();
    await left.waitFor({ state: 'detached' });
    await noOverflow(page);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor on a phone: her site on top, the sections under it, the content in a bottom sheet; a booking model works the same', async () => {
  const w = withModel(world(), 'regard'); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  await page.getByText('En ligne', { exact: true }).waitFor({ timeout: 30000 });
  const left = page.getByRole('complementary', { name: 'Sections de la page' });
  await left.getByRole('list').first().waitFor({ timeout: 60000 });
  assert.equal(await page.getByRole('button', { name: /^Page :/ }).count(), 0, 'a one-page model has no page menu');
  assert.equal(await page.locator('iframe[title="Votre site"]').getAttribute('width'), '390', 'on a phone the site is shown as a phone');
  await noOverflow(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}52-editeur-telephone.png` });
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').first().fill('Regard Test');
  await page.frameLocator('iframe[title="Votre site"]').getByText('Regard Test').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500); await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}53-editeur-telephone-contenu.png` });
  await page.keyboard.press('Escape');
  w.conflict = true;
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByText('Votre boutique a changé entre-temps').waitFor();
  assert.equal(w.stores[0].fiche.store.site, undefined);
  assert.deepEqual(errors, []); await ctx.close();
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
  await page.getByText('Modèle utilisé').waitFor();
  assert.equal(await page.getByText('Acheté · il est à vous').count(), 1);
  await page.screenshot({ path: `${SHOTS}45-modele-achete.png` });
  // « Modifier » carries the site's own id to the editor, which loads that site
  const edit = page.getByRole('link', { name: 'Modifier mon site MICHOU' });
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
  assert.equal(await page.getByRole('link', { name: 'Modifier mon site SÈVE' }).getAttribute('href'), `/admin/editeur/?b=${w.stores[0].id}`);
  await noOverflow(page);
  await ctx.close();
  const w2 = world({ stores: [], orders: [] }); w2.models = [{ model: 'vernie', install: false }]; w2.taken = ['boutique-test'];
  const o = await open(browser, DESK, w2);
  await o.page.goto(`${BASE}/admin/modeles/`); await h1(o.page, 'Modèles de designer');
  // she paid some time ago and never had a store: opening her dashboard makes her site, once
  await o.page.getByRole('link', { name: 'Modifier mon site VERNIE' }).waitFor();
  await o.page.reload(); await o.page.getByRole('link', { name: 'Modifier mon site VERNIE' }).waitFor();
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

await test('subscription: the plan of this store, the four plans with their prices; choosing one asks Stripe for THIS store; back from Stripe the plan is active', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/abonnement/`); await h1(page, 'Abonnement');
  await page.getByText('Boutique Test · formule Essentiel').waitFor();
  const plans = await page.locator('main > div > ul > li').evaluateAll((els) => els.map((li) => [li.querySelector('h2').textContent, li.querySelector('p b').textContent.replace(/\s/g, ' '), [...li.querySelectorAll('button')].map((b) => b.textContent)]));
  assert.deepEqual(plans, [['Gratuit', '0 FCFA', []], ['Essentiel', '3 500 FCFA', []], ['Pro', '10 000 FCFA', ['Choisir Pro']], ['Business', '25 000 FCFA', ['Choisir Business']]]);
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
  // the weekly price exists for Essentiel only, from the free plan
  const w2 = world(); w2.stores[0].plan = 'gratuit'; const o = await open(browser, PHONE, w2);
  await o.page.goto(`${BASE}/admin/abonnement/`); await h1(o.page, 'Abonnement');
  await o.page.getByRole('button', { name: 'Choisir Essentiel à la semaine' }).click();
  await o.page.getByText('Paiement simulé : rien n’est prélevé.').waitFor();
  assert.equal(w2.calls.find((c) => c.body.action === 'subscribe').body.period, 'semaine');
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
  assert.deepEqual(await bar(), [12, 832, 366]);
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
  assert.deepEqual([...new Set(seen)], ['12,832,366'], 'the bottom bar stayed where it is during the transition');
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
  await page.getByText('Avec les formules Pro et Business').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Voir les formules' }).getAttribute('href'), '/admin/abonnement/');
  w.live = { ok: true, now: 3, today: 41, week: 212, countries: [{ country: 'CI', n: 30 }, { country: 'SN', n: 8 }, { country: 'CA', n: 3 }], points: [{ city: 'Abidjan', country: 'CI', live: true }, { city: 'Dakar', country: 'SN', live: true }, { city: 'Paris', country: 'FR', live: false }] };
  await page.reload(); await h1(page, 'En direct');
  await page.getByText('Cette semaine').waitFor();
  assert.deepEqual(await page.locator('main dl dd').allInnerTexts(), ['3', '41', '212']);
  await page.getByText('Abidjan, Côte d’Ivoire · Dakar, Sénégal').waitFor();
  assert.deepEqual((await page.getByRole('region', { name: 'Pays' }).locator('li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')), ['Côte d’Ivoire 30', 'Sénégal 8', 'Canada 3']);
  await page.screenshot({ path: `${SHOTS}83-en-direct.png` });
  await page.setViewportSize(PHONE); await page.waitForTimeout(300); await noOverflow(page);
  assert.deepEqual(errors, []); await ctx.close();
});

await browser.close();
const failed = results.filter((r) => r[0] !== 'ok').length;
console.log(`\n${results.length - failed} / ${results.length} tests passés`);
process.exit(failed ? 1 : 0);
