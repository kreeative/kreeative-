#!/usr/bin/env node
/* DualEngine conformance harness (§0.6) — Node + Playwright (Chromium).
 *
 *   node engine/conformance/harness.js [--filter <substr>] [--group <name>] [--no-pixel]
 *        [--calibrate] [--write-kblur] [--save-diffs <dir>] [--report <path>] [--quiet]
 *
 * For every fixture in conformance/fixtures/*.json:
 *   1. layout by the engine (Node, table text measurer) → world boxes per breakpoint;
 *   2. HTML/CSS export rendered by headless Chromium at each breakpoint's viewport width;
 *      every node's getBoundingClientRect must match the engine box within 0.5 px (x, y, w, h);
 *   3. every emitted declaration is checked with CSS.supports() and must survive parsing
 *      (present in the parsed CSSOM rule);
 *   4. pixel fixtures: the engine's Canvas2D raster vs a Chromium screenshot (ΔE00 mean ≤ 1.0,
 *      ≤ 2 % of pixels with ΔE00 > 5; text areas excluded).
 * --calibrate: find K_BLUR by minimising the mean ΔE00 on the blur-disc fixtures over
 *   candidates 0.30..0.70 (step 0.02); --write-kblur writes the result into css.js.
 * Produces conformance/REPORT.md (per-fixture max errors).
 */
const fs = require('fs');
const path = require('path');
const DE = require('../index.js');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; }
const FILTER = opt('--filter', null), GROUP = opt('--group', null), NO_PIXEL = !!opt('--no-pixel', false), CALIBRATE = !!opt('--calibrate', false);
const WRITE_KBLUR = !!opt('--write-kblur', false), SAVE_DIFFS = opt('--save-diffs', null), QUIET = !!opt('--quiet', false);
const REPORT = opt('--report', path.join(__dirname, 'REPORT.md'));
const BOX_TOL = 0.5, PIX_MEAN = 1.0, PIX_PCT5 = 2.0;
const FIX_DIR = path.join(__dirname, 'fixtures');
const ENGINE_DIR = path.join(__dirname, '..');

function log() { if (!QUIET) console.log.apply(console, arguments); }

const fixtures = fs.readdirSync(FIX_DIR).filter(f => f.endsWith('.json')).sort().map(f => Object.assign({ file: f }, JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf8'))))
  .filter(f => (!FILTER || f.name.includes(FILTER) || f.file.includes(FILTER)) && (!GROUP || f.group === GROUP));

const measurer = DE.text.createTableMeasurer();
const HARNESS_STYLE = '<style id="harness">html{overflow:hidden}</style>';

/* ------------------------------------------------------------------ page helpers */

async function measureBoxes(page, html, width, ids) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(html.replace('</head>', HARNESS_STYLE + '</head>'), { waitUntil: 'load' });
  return page.evaluate(async (ids) => {
    await document.fonts.ready;
    const out = {}, sx = window.scrollX, sy = window.scrollY;
    for (const id of ids) {
      const cls = 'de-' + id.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '0');
      const el = document.getElementsByClassName(cls)[0];
      if (!el) { out[id] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[id] = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, display: cs.display };
    }
    return { boxes: out, docHeight: document.documentElement.scrollHeight, docWidth: document.documentElement.scrollWidth };
  }, ids);
}

async function checkCSS(page, rules) {
  return page.evaluate((rules) => {
    const unsupported = [], dropped = [];
    // CSS.supports on every declaration
    // a rule under @supports applies only where its condition holds (e.g. the -webkit- prefix
    // fallback for old Safari): it is not checked in a browser that does not meet the condition
    const applicable = r => !r.supports || CSS.supports(r.supports);
    rules.forEach(r => {
      if (r.selector === '@font-face' || !applicable(r)) return;
      r.declarations.forEach(d => {
        if (!CSS.supports(d[0], d[1])) unsupported.push({ selector: r.selector, media: r.media, prop: d[0], value: d[1] });
      });
    });
    // parsed CSSOM: every rule found with every property retained
    const sheet = document.styleSheets[0];
    const parsed = [];
    function walk(list, media) { for (const cr of list) { if (cr.type === CSSRule.STYLE_RULE) parsed.push({ selector: cr.selectorText, media, style: cr.style }); else if (cr.type === CSSRule.MEDIA_RULE) walk(cr.cssRules, cr.conditionText || cr.media.mediaText); } }
    walk(sheet.cssRules, null);
    rules.forEach(r => {
      if (r.selector === '@font-face' || r.selector === ':root' || r.selector.startsWith('[') || !applicable(r)) return;
      const hits = parsed.filter(p => p.selector === r.selector && (p.media || null) === (r.media || null));
      if (!hits.length) { dropped.push({ selector: r.selector, media: r.media, prop: '*', value: 'rule missing' }); return; }
      r.declarations.forEach(d => {
        const ok = hits.some(h => h.style.getPropertyValue(d[0]) !== '' || (d[0].startsWith('--')));
        if (!ok) dropped.push({ selector: r.selector, media: r.media, prop: d[0], value: d[1] });
      });
    });
    let total = 0; rules.forEach(r => { if (r.selector !== '@font-face') total += r.declarations.length; });
    return { unsupported, dropped, total };
  }, rules);
}

async function screenshotPage(page, html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html.replace('</head>', HARNESS_STYLE + '</head>'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width, height }, type: 'png' });
  return 'data:image/png;base64,' + buf.toString('base64');
}

/* ------------------------------------------------------------------ main */

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const rasterPage = await ctx.newPage();
  await rasterPage.setContent('<!doctype html><html><body></body></html>');
  for (const s of DE.SCRIPTS) await rasterPage.addScriptTag({ content: fs.readFileSync(path.join(ENGINE_DIR, s), 'utf8') });
  await rasterPage.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'pixel-compare.js'), 'utf8') });
  if (SAVE_DIFFS) fs.mkdirSync(SAVE_DIFFS, { recursive: true });

  const results = [];
  let kBlur = DE.css.K_BLUR;
  const engineRasterCache = {};

  async function engineRaster(fix, width, height) {
    const key = fix.name + '|' + width + 'x' + height;
    if (!engineRasterCache[key]) engineRasterCache[key] = await rasterPage.evaluate(({ doc, width, height }) => window.DualEngineConformance.renderEngine(doc, 'base', width, height), { doc: fix.doc, width, height });
    return engineRasterCache[key];
  }

  /* ---- K_BLUR calibration */
  if (CALIBRATE) {
    const blurFix = fixtures.filter(f => f.name.startsWith('blur-disc'));
    const candidates = []; for (let k = 0.30; k <= 0.7001; k += 0.02) candidates.push(Math.round(k * 100) / 100);
    const table = {};
    for (const fix of blurFix) {
      const doc = DE.model.deserialize(JSON.parse(JSON.stringify(fix.doc)));
      const base = doc.breakpoints[0];
      const layouts = DE.layout.layoutAll(doc, { measurer });
      const h = Math.min(900, Math.ceil(layouts.base.boxes.get(doc.pages[0].children[0]).h));
      const ref = await engineRaster(fix, base.width, h);
      for (const k of candidates) {
        const gen = DE.css.generate(doc, { layouts, kBlur: k });
        const html = DE.html.emit(doc, { css: gen.css, layouts }).html;
        const shot = await screenshotPage(page, html, base.width, h);
        const cmp = await rasterPage.evaluate(({ a, b, masks }) => window.DualEngineConformance.compare(a, b, masks), { a: ref.dataUrl, b: shot, masks: ref.masks });
        table[k] = (table[k] || 0) + cmp.mean;
        log('calibrate', fix.name, 'K=' + k.toFixed(2), 'meanΔE=' + cmp.mean.toFixed(4));
      }
    }
    let best = null;
    candidates.forEach(k => { const m = table[k] / blurFix.length; if (best === null || m < best.mean) best = { k, mean: m }; });
    console.log('K_BLUR calibration over ' + blurFix.length + ' fixtures:');
    candidates.forEach(k => console.log('  K=' + k.toFixed(2) + '  mean ΔE00 = ' + (table[k] / blurFix.length).toFixed(4) + (k === best.k ? '   ← best' : '')));
    kBlur = best.k;
    const calibLine = 'K_BLUR = ' + best.k.toFixed(2) + ' (mean ΔE00 ' + best.mean.toFixed(4) + ' over ' + blurFix.map(f => f.name.replace('blur-disc-', 'r=')).join(', ') + ', Chromium ' + browser.version() + ')';
    if (WRITE_KBLUR) {
      const cssPath = path.join(ENGINE_DIR, 'css.js');
      let src = fs.readFileSync(cssPath, 'utf8');
      src = src.replace(/var K_BLUR = [0-9.]+;/, 'var K_BLUR = ' + best.k.toFixed(2) + ';');
      src = src.replace(/\* CALIBRATION: .*\n(?:\s*\*\s+candidates: .*\n)*/, '* CALIBRATION: ' + calibLine + '\n   *   candidates: ' + candidates.map(k => k.toFixed(2) + '→' + (table[k] / blurFix.length).toFixed(3)).join(' ') + '\n');
      fs.writeFileSync(cssPath, src);
      console.log('wrote K_BLUR =', best.k.toFixed(2), 'into css.js');
    }
    results.calibration = { best, table, line: calibLine, candidates };
  }

  /* ---- fixtures */
  let failures = 0;
  for (const fix of fixtures) {
    const res = { name: fix.name, group: fix.group, file: fix.file, pixel: fix.pixel, bps: {}, maxErr: 0, worst: null, css: null, pix: null, errors: [], warnings: [] };
    results.push(res);
    try {
      const doc = DE.model.deserialize(JSON.parse(JSON.stringify(fix.doc)));
      const verr = DE.model.validateDocument(doc).filter(e => e.level === 'error');
      if (fix.expectInvalid) {
        // the engine must refuse this state (§2.2 hug parent + fill child …): pass when refused
        res.expectInvalid = true;
        if (!verr.length) res.errors.push('expected validateDocument to refuse the document');
        else res.warnings = ['refused: ' + verr[0].message.slice(0, 60)];
        throw null;
      }
      if (verr.length) throw new Error('invalid: ' + verr.map(e => e.path + ' ' + e.message).join('; '));
      const out = DE.exportDocument(doc, { measurer, kBlur });
      res.warnings = out.warnings.map(w => w.code);
      const ids = Object.keys(doc.nodes);
      for (const bp of doc.breakpoints) {
        const lay = out.layouts[bp.id];
        const m = await measureBoxes(page, out.html, bp.width, ids);
        let maxErr = 0, worst = null, missing = 0;
        for (const id of ids) {
          const n = doc.nodes[id];
          const e = lay.world.get(id), b = m.boxes[id];
          const rn = DE.resolve.resolveNode(doc, n, bp.id);
          const hidden = rn.visible === false || DE.model.ancestors(doc, id).some(a => DE.resolve.resolveNode(doc, a, bp.id).visible === false);
          if (hidden) { if (b && b.display !== 'none' && !(e)) { /* fine */ } continue; }
          if (!e || !b) { missing++; res.errors.push('bp ' + bp.id + ': missing box for ' + n.name + ' (' + (e ? 'browser' : 'engine') + ')'); continue; }
          const d = { x: Math.abs(e.x - b.x), y: Math.abs(e.y - b.y), w: Math.abs(e.w - b.w), h: Math.abs(e.h - b.h) };
          const dm = Math.max(d.x, d.y, d.w, d.h);
          if (dm > maxErr) { maxErr = dm; worst = { node: n.name, id, engine: e, browser: b, d }; }
        }
        res.bps[bp.id] = { maxErr, worst, missing, docHeight: m.docHeight };
        if (maxErr > res.maxErr) { res.maxErr = maxErr; res.worst = Object.assign({ bp: bp.id }, worst); }
      }
      // CSS validity (base viewport is loaded last → reload base to inspect its CSSOM)
      await measureBoxes(page, out.html, doc.breakpoints[0].width, []);
      res.css = await checkCSS(page, out.rules);
      // pixels
      if (fix.pixel && !NO_PIXEL) {
        const base = doc.breakpoints[0];
        const h = Math.min(900, Math.ceil(out.layouts.base.boxes.get(doc.pages[0].children[0]).h));
        const ref = await engineRaster(fix, base.width, h);
        const shot = await screenshotPage(page, out.html, base.width, h);
        const cmp = await rasterPage.evaluate(({ a, b, masks, diff }) => window.DualEngineConformance.compare(a, b, masks, { diff }), { a: ref.dataUrl, b: shot, masks: ref.masks, diff: !!SAVE_DIFFS });
        res.pix = { mean: cmp.mean, max: cmp.max, pctOver5: cmp.pctOver5, width: cmp.width, height: cmp.height };
        if (SAVE_DIFFS && (cmp.mean > PIX_MEAN || cmp.pctOver5 > PIX_PCT5 || opt('--save-all', false))) {
          fs.writeFileSync(path.join(SAVE_DIFFS, fix.name + '-engine.png'), Buffer.from(ref.dataUrl.split(',')[1], 'base64'));
          fs.writeFileSync(path.join(SAVE_DIFFS, fix.name + '-chromium.png'), Buffer.from(shot.split(',')[1], 'base64'));
          if (cmp.diffDataUrl) fs.writeFileSync(path.join(SAVE_DIFFS, fix.name + '-diff.png'), Buffer.from(cmp.diffDataUrl.split(',')[1], 'base64'));
        }
      }
    } catch (e) {
      if (e !== null) res.errors.push(String(e && e.stack || e));
    }
    const boxOk = res.maxErr <= BOX_TOL && Object.values(res.bps).every(b => b.missing === 0);
    const cssOk = res.expectInvalid || (res.css && res.css.unsupported.length === 0 && res.css.dropped.length === 0);
    const pixOk = !res.pix || (res.pix.mean <= PIX_MEAN && res.pix.pctOver5 <= PIX_PCT5);
    res.pass = boxOk && cssOk && pixOk && res.errors.length === 0;
    // a fixture that probes a documented limit of the browser (e.g. coordinates beyond Blink's
    // LayoutUnit range, which validateDocument flags) is reported as LIMIT, never as a pass
    if (!res.pass && fix.knownLimitation) { res.limit = fix.knownLimitation; }
    else if (!res.pass) failures++;
    log((res.pass ? 'PASS' : res.limit ? 'LIMIT' : 'FAIL').padEnd(5), fix.name.padEnd(40), 'box max ' + res.maxErr.toFixed(3) + (res.worst ? ' (' + res.worst.bp + ' ' + res.worst.node + ')' : ''),
      res.css ? 'css ' + res.css.total + ' decl' + (res.css.unsupported.length ? ' UNSUPPORTED ' + res.css.unsupported.length : '') + (res.css.dropped.length ? ' DROPPED ' + res.css.dropped.length : '') : 'css -',
      res.pix ? 'pix mean ' + res.pix.mean.toFixed(3) + ' >5: ' + res.pix.pctOver5.toFixed(2) + '%' : '',
      res.errors.length ? 'ERR ' + res.errors[0].split('\n')[0].slice(0, 120) : '');
    if (!res.pass && res.css) { res.css.unsupported.slice(0, 5).forEach(u => log('   unsupported:', u.selector, u.prop + ':', u.value)); res.css.dropped.slice(0, 5).forEach(u => log('   dropped:', u.selector, u.media || '', u.prop + ':', u.value)); }
    if (!res.pass && res.worst && res.maxErr > BOX_TOL) log('   worst:', JSON.stringify(res.worst));
  }
  await browser.close();

  /* ---- report */
  const passCount = results.filter(r => r.pass).length, limitCount = results.filter(r => r.limit).length;
  let md = '# DualEngine — Conformance report (Phase A)\n\n';
  md += 'Generated ' + new Date().toISOString() + ' · Chromium (Playwright) · ' + results.length + ' fixtures · **' + passCount + ' pass / ' + (results.length - passCount - limitCount) + ' fail**' + (limitCount ? ' · ' + limitCount + ' documented limit' + (limitCount > 1 ? 's' : '') + ' (not counted as passes)' : '') + '\n\n';
  md += 'Criteria (§0.6): boxes |Δx|,|Δy|,|Δw|,|Δh| ≤ ' + BOX_TOL + ' px at every breakpoint (getBoundingClientRect, rotated bbox); every declaration accepted by `CSS.supports` and retained by the CSSOM; pixel fixtures ΔE00 mean ≤ ' + PIX_MEAN + ' and ≤ ' + PIX_PCT5 + ' % of pixels with ΔE00 > 5 (text excluded).\n\n';
  md += 'K_BLUR used: **' + kBlur.toFixed(2) + '**' + (results.calibration ? ' — ' + results.calibration.line : ' (from css.js)') + '\n\n';
  if (results.calibration) {
    md += '## K_BLUR calibration\n\n| K | mean ΔE00 |\n| --- | --- |\n';
    results.calibration.candidates.forEach(k => { md += '| ' + k.toFixed(2) + ' | ' + (results.calibration.table[k] / fixtures.filter(f => f.name.startsWith('blur-disc')).length).toFixed(4) + (k === results.calibration.best.k ? ' ← best' : '') + ' |\n'; });
    md += '\n';
  }
  const totalDecl = results.reduce((a, r) => a + (r.css ? r.css.total : 0), 0);
  const maxBox = Math.max.apply(null, results.filter(r => !r.limit).map(r => r.maxErr)); // documented limits are listed separately
  md += 'Totals: max box error ' + maxBox.toFixed(3) + ' px · ' + totalDecl + ' declarations checked · ' + results.filter(r => r.pix).length + ' pixel comparisons' + (results.filter(r => r.pix).length ? ' (worst mean ΔE00 ' + Math.max.apply(null, results.filter(r => r.pix).map(r => r.pix.mean)).toFixed(3) + ', worst % > 5: ' + Math.max.apply(null, results.filter(r => r.pix).map(r => r.pix.pctOver5)).toFixed(2) + ')' : '') + '\n\n';
  md += '| # | fixture | group | status | max Δ (px) | worst node (bp) | decl | css issues | ΔE00 mean | % > 5 | warnings |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
  results.forEach((r, i) => {
    md += '| ' + (i + 1) + ' | ' + r.name + ' | ' + r.group + ' | ' + (r.pass ? 'pass' : r.limit ? 'limit' : '**FAIL**') + ' | ' + r.maxErr.toFixed(3) + ' | ' + (r.worst ? r.worst.node + ' (' + r.worst.bp + ')' : '') + ' | ' + (r.css ? r.css.total : '') + ' | ' + (r.css ? (r.css.unsupported.length + r.css.dropped.length) : '') + ' | ' + (r.pix ? r.pix.mean.toFixed(3) : '') + ' | ' + (r.pix ? r.pix.pctOver5.toFixed(2) : '') + ' | ' + Array.from(new Set(r.warnings)).join(', ') + (r.errors.length ? ' ERROR: ' + r.errors[0].split('\n')[0].slice(0, 80) : '') + ' |\n';
  });
  // performance figures (conformance/perf.js --md conformance/PERF.md) are appended when present
  const perfMd = path.join(__dirname, 'PERF.md');
  if (fs.existsSync(perfMd) && !FILTER && !GROUP) md += '\n' + fs.readFileSync(perfMd, 'utf8');
  if (limitCount) results.filter(r => r.limit).forEach(r => { md += '\nLimit — ' + r.name + ': ' + r.limit + ' (max Δ ' + r.maxErr.toFixed(3) + ' px)\n'; });
  fs.writeFileSync(REPORT, md);
  console.log('\n' + passCount + '/' + results.length + ' fixtures pass' + (limitCount ? ' (+' + limitCount + ' documented limit)' : '') + ' · max box error ' + maxBox.toFixed(3) + ' px · ' + totalDecl + ' declarations · report: ' + REPORT);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
