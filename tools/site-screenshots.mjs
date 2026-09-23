// Captures screenshots of the websites shown in the "Websites" section of
// the home page. Runs in the "Site screenshots" GitHub Actions workflow
// (.github/workflows/site-screenshots.yml); run it by hand with:
//   npm i playwright sharp && npx playwright install --with-deps chromium
//   node tools/site-screenshots.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

const SITES = [
  ['rich',   'https://richandfriends.xyz/'],
  ['ivory',  'https://www.theivorysukundu.com/'],
  ['keewal', 'https://keewaomeere.vercel.app/'],
];
const OUT = 'assets/img/sites';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [name, url] of SITES) {
  const shots = [
    ['desktop', { width: 1440, height: 900 }, 1, [1440, 960]],
    ['phone',   { width: 390,  height: 844 }, 2, [780, 390]],
  ];
  for (const [tag, viewport, deviceScaleFactor, widths] of shots) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor, locale: 'fr-CA' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3000);
    const png = await page.screenshot();
    for (const w of widths) {
      const file = `${OUT}/site-${name}-${tag}-${w}.webp`;
      await sharp(png).resize({ width: w }).webp({ quality: 80 }).toFile(file);
      console.log(file, fs.statSync(file).size, 'bytes');
    }
    await ctx.close();
  }
}
await browser.close();
