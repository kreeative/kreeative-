// Renders a LinkedIn design from its source.html.
//   node linkedin/render.mjs <source.html> <out.png|out.pdf> [width] [height]
// PNG: screenshots the page at width × height, 1:1 pixels.
// PDF: every element with class "page" becomes one page of width × height.
import { chromium } from 'playwright';
import path from 'node:path';

const [src, out, w = '1080', h = '1350'] = process.argv.slice(2);
const width = Number(w), height = Number(h);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
if (out.endsWith('.pdf')) {
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: out, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: false, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
} else {
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
}
await browser.close();
console.log('rendered', out);
