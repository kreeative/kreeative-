// End-to-end checks of the account page, in a real browser, against the built app (npm run build && npm run start).
// Supabase is answered by this file: no e-mail is sent, no account is created, nothing is written in the database.
//   node tests/auth.test.mjs            (BASE=http://localhost:3100 by default)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const USER = { id: '11111111-2222-4333-8444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'kady@exemple.com', created_at: '2026-11-23T10:00:00Z', user_metadata: { first_name: 'Kady' }, app_metadata: {} };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: USER });

/** A page whose Supabase calls are answered here. `world` is the fake server: its profile row and what it received. */
async function open(browser, viewport, world) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  await page.route('https://aezchxfvzfoqlvzchqyk.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return json(route, 204);
    const body = (() => { try { return JSON.parse(req.postData() ?? '{}'); } catch { return {}; } })();
    world.calls.push({ method, path: url.pathname, body });
    if (url.pathname === '/auth/v1/otp') {
      if (body.create_user === false && !world.known.includes(body.email)) return json(route, 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
      return json(route, 200, {});
    }
    if (url.pathname === '/auth/v1/verify') {
      if (body.token !== world.code) return json(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return json(route, 200, session());
    }
    if (url.pathname === '/auth/v1/logout') return json(route, 204);
    if (url.pathname === '/auth/v1/user') return json(route, 200, USER);
    if (url.pathname === '/rest/v1/profiles') {
      if (method === 'GET') return json(route, 200, (req.headers().accept ?? '').includes('vnd.pgrst.object') ? world.profile : [world.profile]);
      if (method === 'PATCH') { Object.assign(world.profile, body); return json(route, 204); }
    }
    if (url.pathname === '/rest/v1/rpc/accept_store_invites') return json(route, 200, []);
    if (url.pathname === '/rest/v1/rpc/launch_spots') return json(route, 200, { active: true, trial: true, spots: 10, left: 6, months: 3, trialMonths: 1 });
    return json(route, 404, { message: 'not mocked' });
  });
  return { ctx, page, errors };
}
const newWorld = (over = {}) => ({ code: '123456', known: [], calls: [], profile: { id: USER.id, first_name: null, phone: null, store_name: null, plan: 'gratuit', studio: null, created_at: '2026-11-23T10:00:00Z' }, ...over });
const typeCode = async (page, code) => { await page.locator('input[autocomplete="one-time-code"]').click(); await page.keyboard.type(code); };
const h1 = (page) => page.locator('h1').innerText();
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'the page must not scroll sideways');

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('  ✓', name); }
  catch (e) { results.push(['FAIL', name]); console.log('  ✗', name, '\n   ', String(e.message).split('\n')[0]); }
}

const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 860 };

await test('sign-up: an empty form says what is missing, and nothing is sent', async () => {
  const w = newWorld(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/compte/`); await page.waitForSelector('h1');
  assert.equal(await h1(page), 'Créez votre compte');
  await page.screenshot({ path: `${SHOTS}01-inscription-telephone.png`, fullPage: true });
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  assert.equal(await page.locator('main [role="alert"]').count(), 3, 'first name, e-mail and consent');
  assert.equal(w.calls.filter((c) => c.path === '/auth/v1/otp').length, 0);
  await page.screenshot({ path: `${SHOTS}02-inscription-erreurs.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('sign-up: code, store name, « Compte créé »; the profile and the local copy are written', async () => {
  const w = newWorld(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/compte/?ref=tiktok`); await page.waitForSelector('h1');
  await page.getByLabel('Votre prénom').fill('Kady');
  await page.getByLabel('Adresse e-mail').fill(' Kady@Exemple.com ');
  await page.getByLabel(/Numéro WhatsApp/).fill('07 07 12 34 56');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Entrez le code');
  const otp = w.calls.find((c) => c.path === '/auth/v1/otp');
  assert.equal(otp.body.email, 'kady@exemple.com'); assert.equal(otp.body.create_user, true);
  assert.deepEqual(otp.body.data, { first_name: 'Kady', source: 'tiktok' });
  assert.match(await page.locator('main').innerText(), /k•+@exemple\.com/);
  await page.screenshot({ path: `${SHOTS}03-code.png`, fullPage: true });
  await typeCode(page, '123456');                       // the sixth digit validates by itself
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Le nom de votre boutique');
  assert.equal(w.profile.first_name, 'Kady'); assert.equal(w.profile.phone, '+2250707123456');
  await page.getByLabel('Nom de la boutique').fill('Boutique Test');
  assert.match(await page.locator('main').innerText(), /jehre\.com\/b\/boutique-test/);
  await page.screenshot({ path: `${SHOTS}04-boutique.png`, fullPage: true });
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Compte créé');
  assert.equal(w.profile.store_name, 'Boutique Test');
  const acc = await page.evaluate(() => JSON.parse(localStorage.getItem('jeere-account')));
  assert.equal(acc.userId, USER.id); assert.equal(acc.storeName, 'Boutique Test'); assert.equal(acc.firstName, 'Kady'); assert.equal(acc.loggedIn, true); assert.equal(acc.version, 1);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('sb-aezchxfvzfoqlvzchqyk-auth-token')), 'the session is kept where the current site reads it');
  assert.equal(await page.getByRole('link', { name: /Aller au tableau de bord/ }).getAttribute('href'), '/admin/');
  await page.screenshot({ path: `${SHOTS}05-compte-cree.png`, fullPage: true });
  await noOverflow(page); assert.deepEqual(errors, []); await ctx.close();
});

await test('sign-up: « Je ne veux pas de boutique » saves no name and goes to the dashboard', async () => {
  const w = newWorld(); const { page, ctx } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/compte/`); await page.waitForSelector('h1');
  await page.getByLabel('Votre prénom').fill('Kady'); await page.getByLabel('Adresse e-mail').fill('kady@exemple.com'); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Entrez le code');
  await typeCode(page, '123456');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Le nom de votre boutique');
  await page.getByRole('button', { name: 'Je ne veux pas de boutique' }).click();
  await page.waitForURL('**/admin/');
  assert.equal(w.profile.store_name, ''); await ctx.close();
});

await test('login: an address without an account offers to create one, and no account is created', async () => {
  const w = newWorld(); const { page, ctx, errors } = await open(browser, PHONE, w);
  await page.goto(`${BASE}/compte/#connexion`); await page.waitForSelector('h1');
  assert.equal(await h1(page), 'Connectez-vous');
  await page.getByLabel('Adresse e-mail').fill('inconnue@exemple.com');
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await page.getByText('Aucun compte avec cette adresse').waitFor();
  assert.equal(w.calls.find((c) => c.path === '/auth/v1/otp').body.create_user, false);
  await page.screenshot({ path: `${SHOTS}06-connexion-aucun-compte.png`, fullPage: true });
  await page.getByRole('status').getByRole('button', { name: 'Créer un compte' }).click();
  assert.equal(await h1(page), 'Créez votre compte');
  assert.equal(await page.getByLabel('Adresse e-mail').inputValue(), 'inconnue@exemple.com', 'the address she typed is kept');
  assert.deepEqual(errors, []); await ctx.close();
});

await test('login: a wrong code is refused, the right one opens the account; logging out closes the session', async () => {
  const w = newWorld({ known: ['kady@exemple.com'] }); Object.assign(w.profile, { first_name: 'Kady', store_name: 'Boutique Test', phone: '+2250707123456' });
  const { page, ctx, errors } = await open(browser, DESK, w);
  await page.goto(`${BASE}/compte/#connexion`); await page.waitForSelector('h1');
  await page.screenshot({ path: `${SHOTS}07-connexion-ordinateur.png` });
  await page.getByLabel('Adresse e-mail').fill('kady@exemple.com');
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Entrez le code');
  await typeCode(page, '000000');
  await page.getByText('Ce code n’est pas le bon').waitFor();
  await page.screenshot({ path: `${SHOTS}08-code-refuse.png` });
  assert.equal(await page.evaluate(() => localStorage.getItem('jeere-account')), null);
  assert.equal(await page.locator('input[autocomplete="one-time-code"]').inputValue(), '', 'the boxes are emptied');
  await page.keyboard.type('123456');                    // the first box has the focus again
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Bonjour Kady');
  assert.doesNotMatch(await page.locator('main').innerText(), /Boutique Test|kady@exemple/, 'no list of her details: she may have several stores');
  await page.screenshot({ path: `${SHOTS}09-mon-compte.png` });
  await page.reload(); await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Bonjour Kady');   // the session is found again
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Connectez-vous');
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-aezchxfvzfoqlvzchqyk-auth-token')), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jeere-account')).loggedIn), false);
  assert.deepEqual(errors, []); await ctx.close();
});

await test('a pasted code fills every box; the code can be asked again only after a minute', async () => {
  const w = newWorld({ known: ['kady@exemple.com'] }); const { page, ctx } = await open(browser, PHONE, w);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${BASE}/compte/#connexion`); await page.waitForSelector('h1');
  await page.getByLabel('Adresse e-mail').fill('kady@exemple.com');
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Entrez le code');
  assert.match(await page.locator('main').innerText(), /Renvoyer dans 0:5\d|Renvoyer dans 1:00/);
  assert.equal(await page.getByRole('button', { name: 'Renvoyer le code' }).count(), 0);
  await page.evaluate(() => navigator.clipboard.writeText('Votre code : 123 456'));
  await page.locator('input[autocomplete="one-time-code"]').click(); await page.keyboard.press('Control+v');
  await page.waitForFunction(() => /Bonjour|Votre compte/.test(document.querySelector('h1')?.textContent ?? ''));
  await ctx.close();
});

await browser.close();
const failed = results.filter((r) => r[0] !== 'ok').length;
console.log(`\n${results.length - failed} / ${results.length} tests passés`);
process.exit(failed ? 1 : 0);
