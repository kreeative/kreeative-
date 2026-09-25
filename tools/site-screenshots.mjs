// Captures screenshots of the websites shown in the "Websites" section of
// the home page. Runs in the "Site screenshots" GitHub Actions workflow
// (.github/workflows/site-screenshots.yml); run it by hand with:
//   npm i playwright sharp && npx playwright install --with-deps chromium
//   node tools/site-screenshots.mjs
// To capture only some sites, list their names: ONLY="tabouret" node tools/site-screenshots.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

const SITES = [
  ['rich',     'https://richandfriends.xyz/'],
  ['ivory',    'https://www.theivorysukundu.com/'],
  ['keewal',   'https://keewaomeere.vercel.app/'],
  // Reveals its sections as you scroll, so it is scrolled through before the long capture.
  ['cameleon', 'https://cameleon-concept.vercel.app/', { scrollFirst: true }],
  // An app that fits the window, so instead of a long capture it gets a second
  // screen (a dish page). The clock is set to lunchtime in New York so the
  // restaurant shows as open.
  ['tabouret', 'https://tabouret.vercel.app/', { detail: '#/dish/tonkotsu-ramen', time: '2026-09-24T16:30:00Z' }],
];
const ONLY = (process.env.ONLY || '').split(/[\s,]+/).filter(Boolean);
const RUN = SITES.filter(([name]) => !ONLY.length || ONLY.includes(name));
const OUT = 'assets/img/sites';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [name, url, opts = {}] of RUN) {
  const shots = [
    ['desktop', { width: 1440, height: 900 }, 1, [1440, 960]],
    ['phone',   { width: 390,  height: 844 }, 2, [780, 390]],
  ];
  for (const [tag, viewport, deviceScaleFactor, widths] of shots) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor, locale: 'fr-CA' });
    const page = await ctx.newPage();
    if (opts.time) await page.clock.setFixedTime(new Date(opts.time));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3000);
    // Dismiss newsletter / cookie popups so the screenshot shows the page.
    await page.keyboard.press('Escape').catch(() => {});
    for (const sel of ['text=/decline offer/i', 'text=/no thanks/i', '[aria-label*="close" i]', 'button:has-text("×")']) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); break; }
    }
    await page.waitForTimeout(1200);
    const png = await page.screenshot();
    for (const w of widths) {
      const file = `${OUT}/site-${name}-${tag}-${w}.webp`;
      await sharp(png).resize({ width: w }).webp({ quality: 80 }).toFile(file);
      console.log(file, fs.statSync(file).size, 'bytes');
    }
    if (tag === 'desktop' && opts.detail) {
      // A second screen of the app, at the same size as the first one.
      await page.goto(url + opts.detail, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(2500);
      const detail = await page.screenshot();
      for (const w of [1000, 1440]) {
        const file = `${OUT}/site-${name}-detail-${w}.webp`;
        await sharp(detail).resize({ width: w }).webp({ quality: 80 }).toFile(file);
        console.log(file, fs.statSync(file).size, 'bytes');
      }
    } else if (tag === 'desktop') {
      if (opts.scrollFirst) {
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
            scrollTo({ top: y, behavior: 'instant' });
            await new Promise(r => setTimeout(r, 150));
          }
          scrollTo({ top: 0, behavior: 'instant' });
        });
        await page.waitForTimeout(1200);
      }
      // A long, scrolled view of the page for the detail page (capped height).
      const h = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 3200);
      const full = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: 1440, height: h } });
      for (const w of [1000, 1440]) {
        const file = `${OUT}/site-${name}-full-${w}.webp`;
        await sharp(full).resize({ width: w }).webp({ quality: 80 }).toFile(file);
        console.log(file, fs.statSync(file).size, 'bytes');
      }
    }
    await ctx.close();
  }
}
await browser.close();

// Stamp a version on every reference to these images so browsers and CDNs
// fetch the new capture instead of a cached copy with the same file name.
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
// Only the sites captured in this run are stamped.
const shot = new RegExp(`(assets/img/sites/site-(?:${RUN.map(([name]) => name).join('|')})-[a-z0-9-]+\\.webp)(\\?v=\\d+)?`, 'g');
const pages = ['index.html', ...fs.readdirSync('websites').map(d => `websites/${d}/index.html`)];
for (const p of pages) {
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(shot, `$1?v=${stamp}`);
  if (after !== before) { fs.writeFileSync(p, after); console.log('stamped', p); }
}
