// End-to-end checks of the dashboard (home, orders, products), in a real browser, against the built app.
// Supabase is answered by this file: nothing is read from or written to the real database.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const USER = { id: '11111111-2222-4333-8444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'awa@exemple.com', created_at: '2026-11-01T10:00:00Z', user_metadata: { first_name: 'Awa' }, app_metadata: {} };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = () => ({ access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: USER });
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const store = () => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'awa-beaute', published: true, published_at: ago(200), custom_domain: null, domain_status: 'none', plan: 'essentiel', updated_at: '2026-11-22T10:00:00.000Z', owner: USER.id,
  fiche: { version: 3, template: 'douce', theme: { accent: '#C2410C' }, sections: [{ id: 's1', type: 'hero' }, { id: 's7', type: 'delivery', enabled: true, settings: { title: 'Nos frais de livraison', text: 'Texte.', zones: [{ name: 'Cocody', fee: 1500 }, { name: 'Abobo', fee: 2500 }] } }], payments: { wave: true, orange: false, cod: true }, store: { name: 'Awa Beauté', city: 'Abidjan', whatsapp: '+2250707123456' },
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
    if (p === '/rest/v1/rpc/my_models') return json(route, 200, world.models ?? []);
    if (p === '/functions/v1/billing') return json(route, 200, world.billing ?? { ok: false, message: 'Paiement simulé : rien n’est prélevé.' });
    if (p === '/functions/v1/appel') return json(route, 200, { ok: true });
    if (p === '/rest/v1/store_members') return json(route, 200, []);
    if (p.startsWith('/storage/v1/object/store-media/')) { world.uploads.push(p.replace('/storage/v1/object/store-media/', '')); return json(route, 200, { Key: p }); }
    if (p === '/rest/v1/stores') {
      // the dashboard must ask for HER stores only: a query without the owner filter would return every public store
      if (method === 'GET') { if (!/owner=eq\./.test(url.search) && !/id=in\./.test(url.search)) return json(route, 200, [{ id: 'someone-else', slug: 'autre', fiche: {}, published: true }]); return json(route, 200, world.stores); }
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
const world = (over = {}) => { const s = store(); return { calls: [], uploads: [], conflict: false, profile: { id: USER.id, first_name: 'Awa', phone: '+2250707123456', store_name: 'Awa Beauté', plan: 'gratuit', studio: null, created_at: '2026-11-01T10:00:00Z' }, stores: [s], orders: orders(s.id), ...over }; };
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'the page must not scroll sideways');
const h1 = (page, text) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, text);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('  ✓', name); }
  catch (e) { results.push(['FAIL', name]); console.log('  ✗', name, '\n   ', String(e.message).split('\n')[0]); }
}
const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 860 };

await test('without a session, the dashboard sends to the login page', async () => {
  const { page, ctx } = await open(browser, DESK, world(), { logged: false });
  await page.goto(`${BASE}/admin/`); await page.waitForURL('**/compte/#connexion'); await ctx.close();
});

await test('a seller without a store sees how to create one, and no one else’s store', async () => {
  const w = world({ stores: [], orders: [] }); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Awa');
  await page.getByText('Pas encore de boutique').waitFor();
  assert.equal(await page.getByText('autre').count(), 0);
  assert.ok(w.calls.some((c) => c.path === '/rest/v1/stores' && /owner=eq\./.test(c.query)), 'her stores are asked by owner');
  await page.screenshot({ path: `${SHOTS}10-accueil-sans-boutique.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('home: sales, orders to handle, products and the last orders', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Awa');
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
  assert.equal(await page.getByRole('dialog').count(), 0);
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
  assert.equal(await page.getByRole('dialog').count(), 0);
  let f = w.stores[0].fiche;
  assert.equal(f.products.length, 4); assert.deepEqual(f.products[3], { id: 'p4', name: 'Sérum éclat au baobab', price: 9500, category: 'Visage', description: '', badge: 'new', image: null, photo: null });
  assert.equal(f.template, 'douce'); assert.equal(f.sections.length, 2); assert.deepEqual(f.sections[0], { id: 's1', type: 'hero' }); assert.equal(f.store.name, 'Awa Beauté'); assert.deepEqual(f.theme, { accent: '#C2410C' });
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
  assert.equal(f.store.name, 'Awa Beauté'); assert.equal(f.products.length, 3);
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
  await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Awa');
  await page.getByRole('button', { name: /Plus/ }).click();
  await page.screenshot({ path: `${SHOTS}23-menu-plus.png` });
  await page.getByRole('menuitem', { name: 'Paramètres' }).click();
  await h1(page, 'Paramètres');
  await page.getByLabel('Nom de la boutique').fill('Awa Beauté Naturelle');
  await page.getByLabel(/Numéro WhatsApp/).fill('+221 77 123 45 67');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Enregistré.').waitFor();
  const st = w.stores[0].fiche.store;
  assert.equal(st.name, 'Awa Beauté Naturelle'); assert.equal(st.whatsapp, '+221771234567'); assert.equal(st.city, 'Abidjan');
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
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
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
  assert.equal(await page.getByRole('menu').count(), 0);
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
    assert.deepEqual(seen[i].demo, [`https://jehre.com/modeles/${slug}/|_blank`, `https://jehre.com/modeles/${slug}/|_blank`], 'the picture and « Voir la démo » open the real demo');
    assert.deepEqual(seen[i].buttons, ['Choisir', 'Voir la démo']);
  }
  // the two buttons sit side by side, and the pictures are really loaded
  const one = cards.nth(2), b1 = await one.getByRole('button').boundingBox(), b2 = await one.getByRole('link', { name: 'Voir la démo', exact: true }).boundingBox();
  assert.equal(Math.round(b1.y), Math.round(b2.y)); assert.ok(b2.x > b1.x + b1.width - 1);
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
  assert.equal(bill.body.storeId, w.stores[0].id); assert.equal(bill.body.shopName, 'Awa Beauté'); assert.ok(bill.body.returnUrl.endsWith('/admin/modeles/'));
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
  assert.equal(ask.body.source, 'devis-installation'); assert.equal(ask.body.firstName, 'Awa'); assert.equal(ask.body.whatsapp, '+225 07 07 12 34 56');
  assert.ok(ask.body.need.startsWith('DEVIS INSTALLATION. Modèle : MICHOU. Produits : 11 à 30. Photos prêtes : Oui. Logo : Non.'));
  assert.equal(await page.getByRole('dialog').count(), 0);
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
  assert.equal(w.stores[0].fiche.products.length, 3); assert.equal(st.name, 'Awa Beauté');
  // the way to choose, on a phone: a bottom sheet, the two buttons side by side
  await page.getByRole('button', { name: 'Choisir le modèle MICHOU' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Choisir le modèle MICHOU' }).click();
  await page.getByRole('dialog').getByText('Comment voulez-vous l’installer ?').waitFor(); await page.waitForTimeout(500);
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}43-modele-choisir-telephone.png` });
  assert.deepEqual(errors, []); await ctx.close();
});

await test('phone: the bottom bar stays glued to the bottom of the screen while the page scrolls', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  for (const path of ['/admin/modeles/', '/admin/', '/admin/produits/']) {
    await page.goto(`${BASE}${path}`); await page.locator('aside nav').waitFor();
    // make sure the page is much taller than the screen, then scroll it step by step, as a thumb does
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '2400px'; document.querySelector('main').appendChild(d); });
    const where = () => page.evaluate(() => { const r = document.querySelector('aside').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), y: Math.round(window.scrollY), h: window.innerHeight }; });
    const start = await where();
    assert.equal(start.bottom, 844, `${path}: the bar sits on the bottom edge`); assert.equal(start.left, 0); assert.equal(start.width, 390);
    for (const dy of [300, 500, 700, -400, 900]) {
      await page.mouse.wheel(0, dy); await page.waitForTimeout(120);
      const now = await where();
      assert.equal(now.top, start.top, `${path}: the bar moved while scrolling`); assert.equal(now.bottom, 844);
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
    await page.goto(`${BASE}/admin/`); await h1(page, 'Bonjour Awa'); await page.getByText('N° 3 · Mariam K.').waitFor();
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

await test('editor: sections on the left, the real store in the middle, settings on the right; nothing is live before « Enregistrer »', async () => {
  const w = world(); w.stores[0].fiche.theme = { palette: 'hibiscus', fonts: 'doux', radius: 'round', buttons: 'solid', colors: { accent: '#C2410C' } };
  w.stores[0].fiche.sections.push({ id: 's3', type: 'products', enabled: true, settings: { title: 'Nos produits' } });
  const before = JSON.parse(JSON.stringify(w.stores[0].fiche));
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Contenu de la boutique' });
  await left.getByRole('list').waitFor({ timeout: 30000 });
  assert.deepEqual(await left.locator('ol li b').allInnerTexts(), ['Grande bannière', 'Livraison', 'Produits']);
  const shop = page.frameLocator('iframe[title="Aperçu de votre boutique"]');
  await shop.getByText('Beurre de karité brut').first().waitFor({ timeout: 30000 });
  const save = page.getByRole('button', { name: 'Enregistrer' });
  assert.equal(await save.isDisabled(), true);

  // a section: its fields come from the engine, and the store changes as she types
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const right = page.getByRole('complementary', { name: 'Réglages : Grande bannière' });
  await right.getByLabel('Titre', { exact: true }).fill('Le karité de Korhogo');
  await right.getByLabel('Texte du bouton').fill('Voir les soins');
  await shop.getByText('Le karité de Korhogo').first().waitFor();
  await shop.getByText('Voir les soins').first().waitFor();
  assert.equal(await shop.locator('[data-section-id="s1"]').evaluate((e) => getComputedStyle(e).outlineStyle), 'solid', 'the edited section is framed');
  await page.getByText('Modifications non enregistrées').waitFor();
  // a click in the store selects the section under it
  await shop.locator('[data-section-id="s7"]').first().click({ position: { x: 20, y: 20 } });
  const zones = page.getByRole('complementary', { name: 'Réglages : Livraison' });
  assert.equal(await zones.getByLabel('Commune ou zone').first().inputValue(), 'Cocody');
  await zones.getByLabel('Frais de livraison (FCFA)').first().fill('2000');
  await zones.getByRole('button', { name: 'Ajouter' }).click();
  await zones.getByLabel('Commune ou zone').nth(2).fill('Bingerville');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}50-editeur-ordinateur.png` });
  // order and visibility
  await left.getByRole('button', { name: 'Monter Produits' }).click();
  assert.deepEqual(await left.locator('ol li b').allInnerTexts(), ['Grande bannière', 'Produits', 'Livraison']);
  await left.getByRole('switch', { name: 'Afficher Livraison' }).click();
  await left.getByText('Masquée').waitFor();
  await page.waitForFunction(() => !document.querySelector('iframe[title="Aperçu de votre boutique"]').contentDocument.querySelector('[data-section-id="s7"]'));
  // a new section, among those the store does not have yet
  await left.getByRole('button', { name: 'Ajouter une section' }).click();
  const addable = await page.getByRole('dialog').locator('li b').allInnerTexts();
  assert.deepEqual(addable, ['Bandeau d’annonce', 'Catégories', 'À propos', 'Avis clients', 'Commander sur WhatsApp']);
  await page.getByRole('dialog').getByRole('button', { name: /Bandeau d’annonce/ }).click();
  await page.getByRole('complementary', { name: 'Réglages : Bandeau d’annonce' }).getByLabel('Message').fill('Livraison offerte dès 20 000 FCFA');
  await shop.getByText('Livraison offerte dès 20 000 FCFA').first().waitFor();
  // style: a palette replaces her own colours, as in the current editor
  await left.getByRole('tab', { name: 'Style' }).click();
  await left.getByRole('button', { name: 'Menthe' }).click();
  await left.getByRole('button', { name: 'Droit' }).click();
  await left.getByRole('button', { name: 'Contour' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}51-editeur-style.png` });
  // nothing was written yet
  assert.equal(w.calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/stores'), false);
  assert.deepEqual(w.stores[0].fiche, before);
  await save.click();
  await page.getByText('Enregistré', { exact: true }).waitFor();
  const f = w.stores[0].fiche;
  assert.deepEqual(f.sections.map((x) => x.type), ['announcement', 'hero', 'products', 'delivery']);
  assert.equal(f.sections[1].settings.title, 'Le karité de Korhogo'); assert.equal(f.sections[1].settings.button, 'Voir les soins');
  assert.equal(f.sections[3].enabled, false);
  assert.deepEqual(f.sections[3].settings.zones, [{ name: 'Cocody', fee: 2000 }, { name: 'Abobo', fee: 2500 }, { name: 'Bingerville', fee: 1500 }]);
  assert.equal(f.sections[3].settings.title, 'Nos frais de livraison');
  assert.equal(f.sections[0].settings.text, 'Livraison offerte dès 20 000 FCFA');
  assert.deepEqual(f.theme, { palette: 'menthe', fonts: 'doux', radius: 'none', buttons: 'outline' });
  assert.deepEqual(f.products, before.products); assert.deepEqual(f.store, before.store); assert.deepEqual(f.payments, before.payments);
  assert.equal(await save.isDisabled(), true);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('editor on a phone: the store on top, the sections under it, the settings in a bottom sheet; a conflict overwrites nothing', async () => {
  const w = world(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/admin/editeur/`);
  const left = page.getByRole('complementary', { name: 'Contenu de la boutique' });
  await left.getByRole('list').waitFor({ timeout: 30000 });
  await page.frameLocator('iframe[title="Aperçu de votre boutique"]').getByText('Beurre de karité brut').first().waitFor({ timeout: 30000 });
  await noOverflow(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}52-editeur-telephone.png` });
  await left.getByRole('button', { name: 'Grande bannière', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Titre', { exact: true }).fill('Bienvenue chez Awa');
  await page.waitForTimeout(500); await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}53-editeur-telephone-reglages.png` });
  await page.keyboard.press('Escape');
  w.conflict = true;
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Votre boutique a changé entre-temps').waitFor();
  assert.equal(w.stores[0].fiche.sections[0].settings, undefined);
  assert.deepEqual(errors, []); await ctx.close();
});

await browser.close();
const failed = results.filter((r) => r[0] !== 'ok').length;
console.log(`\n${results.length - failed} / ${results.length} tests passés`);
process.exit(failed ? 1 : 0);
