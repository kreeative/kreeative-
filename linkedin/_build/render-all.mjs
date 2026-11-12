// Renders every design listed in _build/jobs.json (written by build.py).
//   node linkedin/_build/render-all.mjs [ID ...]      e.g. node linkedin/_build/render-all.mjs M1-02
// Needs Playwright. Page previews for the contact sheet go to _build/previews/ (not committed).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const L = path.dirname(HERE);
const only = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(path.join(HERE, 'jobs.json'), 'utf8')).filter(j => !only.length || only.includes(j.id));
const PREV = path.join(HERE, 'previews');
fs.mkdirSync(PREV, { recursive: true });

const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(L, j.src), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const out = path.join(L, j.out);
  if (j.kind === 'pdf') {
    await page.pdf({ path: out, width: `${j.w}px`, height: `${j.h}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const pages = await page.$$('.page');
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(PREV, `${j.id}_${String(i + 1).padStart(2, '0')}.png`) });
  } else {
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: j.w, height: j.h } });
    fs.copyFileSync(out, path.join(PREV, `${j.id}_01.png`));
  }
  await page.close();
  console.log('rendered', j.id, j.out);
}
await browser.close();
