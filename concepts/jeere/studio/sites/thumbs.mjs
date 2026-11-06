// Jeere Studio › Mes sites — the cards' thumbnails (thumbs/<site id>.webp, 640 × 400, small WebP).
// Run from the repository root, with a static server of the repository on BASE:
//   python3 -m http.server 8941 &
//   BASE=http://127.0.0.1:8941 node concepts/jeere/studio/sites/thumbs.mjs            (all sites)
//   ONLY=websites--tabouret,aissakee node concepts/jeere/studio/sites/thumbs.mjs      (some)
// Playwright: `npm i playwright && npx playwright install chromium` (or PLAYWRIGHT=<path to its index.js>).
// A site that lives only on another branch is read with `git archive` (its folder and assets/) into a
// temporary folder served on its own port: nothing is checked out. The WebP is encoded by Chromium itself
// (canvas.toDataURL('image/webp')), so no image library is needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const BASE = (process.env.BASE || 'http://127.0.0.1:8941').replace(/\/$/, '');
const ONLY = (process.env.ONLY || '').split(/[\s,]+/).filter(Boolean);
const OUT = path.join(HERE, 'thumbs');
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'sites.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.mp4': 'video/mp4' };
function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, path.normalize(p));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function extract(branch, folders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jeere-thumb-'));
  const tar = execFileSync('git', ['archive', '--format=tar', 'origin/' + branch, ...folders], { cwd: REPO_ROOT, maxBuffer: 512 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 512 * 1024 * 1024 });
  return dir;
}

const browser = await chromium.launch();
const enc = await (await browser.newContext()).newPage();
await enc.setContent('<canvas id="c" width="640" height="400"></canvas>');
async function toWebp(png) {
  const dataUrl = await enc.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.getElementById('c'), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const s = Math.max(c.width / img.width, c.height / img.height);
    g.drawImage(img, 0, 0, img.width * s, img.height * s);
    return c.toDataURL('image/webp', 0.78);
  }, png.toString('base64'));
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

for (const site of manifest.sites) {
  if (ONLY.length && !ONLY.includes(site.id)) continue;
  const main = site.pages.find((p) => p.path === (site.path ? site.path + '/index.html' : 'index.html')) || site.pages[0];
  let srv = null, base = BASE, tmp = null;
  if (!main.local) {
    tmp = extract(site.branch, [site.path, 'assets'].filter((f) => { try { execFileSync('git', ['cat-file', '-e', 'origin/' + site.branch + ':' + f], { cwd: REPO_ROOT }); return true; } catch { return false; } }));
    srv = await serve(tmp);
    base = 'http://127.0.0.1:' + srv.address().port;
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  try {
    await page.goto(base + '/' + main.path.replace(/index\.html$/, ''), { waitUntil: 'networkidle', timeout: 45000 });
    // sections that rise into place: scroll through once, then back to the top
    await page.evaluate(async () => {
      for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape').catch(() => {});
    const png = await page.screenshot();
    const webp = await toWebp(png);
    fs.writeFileSync(path.join(OUT, site.id + '.webp'), webp);
    console.log('thumbs/' + site.id + '.webp', webp.length, 'bytes');
  } catch (e) {
    console.log('FAILED', site.id, e.message.split('\n')[0]);
  }
  await ctx.close();
  if (srv) srv.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
await browser.close();
