// A check by hand, not part of `npm test`: it reads the REAL site and a REAL published store (nothing is written:
// no order, no account). It shows that the addresses this app does not own yet are answered by the current site.
//   node tests/site.check.mjs [slug]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://localhost:3100', SLUG = process.argv[2] ?? 'rhorho', SHOTS = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route(/\/api\/visit/, (r) => r.fulfill({ status: 204 }));          // no visit is counted
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.locator('#sur-mesure-modeles').waitFor({ state: 'attached' });
console.log('  ✓ home page of the current site, through this app:', await page.title());
await page.screenshot({ path: `${SHOTS}60-accueil-par-la-nouvelle-app.png` });

await page.goto(`${BASE}/b/${SLUG}/`, { waitUntil: 'load' });
await page.locator('#jb-main [data-section-id]').first().waitFor({ timeout: 30000 });
const products = await page.locator('#jb-main [data-section-type="products"] a, #jb-main .jst-card').count();
assert.ok(products > 0, 'the store shows its products');
console.log(`  ✓ public store /b/${SLUG}/ drawn by the current engine (${products} product links)`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}61-boutique-publique.png` });

await page.goto(`${BASE}/b/${SLUG}/panier`, { waitUntil: 'load' });
await page.waitForFunction(() => /panier/i.test(document.querySelector('#jb-main')?.textContent ?? ''), null, { timeout: 30000 });
console.log('  ✓ the cart page of that store');
await page.screenshot({ path: `${SHOTS}62-boutique-panier.png` });

for (const p of ['/compte/', '/admin/']) { const r = await page.goto(`${BASE}${p}`); assert.equal(r.status(), 200); assert.ok((await r.text()).includes('_next/'), `${p} is answered by this app`); }
console.log('  ✓ /compte/ and /admin/ are answered by this app');
assert.deepEqual(errors, []);
await browser.close();
