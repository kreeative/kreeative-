// Turns the proposal page into an A4 PDF, ready to attach to an email.
//   node concepts/proposition/render-pdf.mjs [output.pdf]
// Default output: concepts/proposition/proposition-kreeative.pdf
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'proposition-kreeative.pdf');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(here, 'index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('wrote', out);
