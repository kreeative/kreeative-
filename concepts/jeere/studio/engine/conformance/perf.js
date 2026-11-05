#!/usr/bin/env node
/* DualEngine performance benchmark (Annexe A / §2.3 budgets) on a synthetic 50 000-node document
 * (50 sections × 20 wrapping rows × 10 cards; 20 000 text nodes), Node + table measurer.
 *
 *   node engine/conformance/perf.js [--sections 50] [--json out.json] [--md out.md]
 *
 * Measures: open (parse + validate + first base layout), cold layout of the 3 breakpoints, full
 * export (HTML + CSS), and incremental re-layout after local patches (leaf height, text edit,
 * card width, opacity-only) — median / max over 25 patches each, for one breakpoint and for all
 * three. Budgets are printed next to each figure; the script exits 0 (it is a measurement).
 */
'use strict';
const DE = require('../index.js');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const SECTIONS = +opt('--sections', 50);

function build(sections, rows, cards) {
  const M = DE.model; let k = 0;
  const id = () => { k++; return k.toString(16).padStart(8, '0') + '-0000-4000-8000-' + k.toString(16).padStart(12, '0'); };
  const doc = M.createDocument({ id: 'perf' });
  const g = (w, h) => ({ x: 0, y: 0, w, h, rotation: 0, flipH: false, flipV: false });
  const leaves = [], texts = [], cardIds = [];
  for (let s = 0; s < sections; s++) {
    const sec = M.addNode(doc, M.createNode('frame', { id: id(), geometry: g(1200, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', gap: 16, padding: { top: 40, right: 40, bottom: 40, left: 40 } }, fills: [M.solid('#ffffff')], overrides: { phone: { layoutParent: { padding: { top: 16, right: 16, bottom: 16, left: 16 } } } } }), null);
    for (let r = 0; r < rows; r++) {
      const row = M.addNode(doc, M.createNode('frame', { id: id(), geometry: g(100, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', wrap: true, gap: 12, rowGap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), sec.id);
      for (let c = 0; c < cards; c++) {
        const card = M.addNode(doc, M.createNode('frame', { id: id(), geometry: g(220, 10), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', gap: 8, padding: { top: 12, right: 12, bottom: 12, left: 12 } }, fills: [M.solid('#f6f6f8')], corners: { tl: 12, tr: 12, br: 12, bl: 12, smoothing: 0 }, effects: [{ type: 'dropShadow', x: 0, y: 4, blur: 12, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.15 }, visible: true }] }), row.id);
        cardIds.push(card.id);
        leaves.push(M.addNode(doc, M.createNode('rect', { id: id(), geometry: g(196, 120), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' }, fills: [M.solid('#3657ff')] }), card.id).id);
        texts.push(M.addNode(doc, M.createNode('text', { id: id(), text: 'Product ' + s + '-' + r + '-' + c, style: M.defaultTextStyle({ size: 16, weight: 600 }), resize: 'autoWidth' }), card.id).id);
        texts.push(M.addNode(doc, M.createNode('text', { id: id(), text: 'A short description that wraps on two lines inside the card body', style: M.defaultTextStyle({ size: 13 }), resize: 'autoHeight', geometry: g(196, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' } }), card.id).id);
        leaves.push(M.addNode(doc, M.createNode('rect', { id: id(), geometry: g(80, 28), fills: [M.solid('#ff5722')] }), card.id).id);
      }
    }
  }
  return { doc, leaves, texts, cardIds };
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

function run() {
  const res = { sections: SECTIONS };
  const measurer = DE.text.createTableMeasurer();
  const { doc, leaves, texts, cardIds } = build(SECTIONS, 20, 10);
  res.nodes = Object.keys(doc.nodes).length;
  const json = DE.model.serialize(doc); res.jsonMB = r1(json.length / 1e6);
  let t = now(); const doc2 = DE.model.deserialize(json); res.parseMs = r1(now() - t);
  t = now(); DE.model.validateDocument(doc2); res.validateMs = r1(now() - t);
  const eng = new DE.layout.LayoutEngine(doc2, { measurer });
  t = now(); eng.layout('base'); res.firstLayoutBaseMs = r1(now() - t);
  res.openMs = r1(res.parseMs + res.validateMs + res.firstLayoutBaseMs);
  t = now(); eng.layoutAll(); res.remaining2BpsMs = r1(now() - t);
  t = now(); new DE.layout.LayoutEngine(doc2, { measurer }).layoutAll(); res.coldLayoutAll3BpsMs = r1(now() - t);
  t = now(); const ex = DE.exportDocument(doc2, { measurer }); res.exportMs = r1(now() - t); res.cssKB = Math.round(ex.css.length / 1024); res.htmlKB = Math.round(ex.html.length / 1024);
  const H = DE.history, hist = new H.History();
  hist.on('change', e => e.patches.forEach(p => eng.invalidateFromPatch(p)));
  function incr(kind, n) {
    const base = [], all = [];
    for (let i = 0; i < n; i++) {
      let patch;
      if (kind === 'leafHeight') patch = [H.setProp(doc2, leaves[(i * 7919) % leaves.length], 'geometry.h', 100 + (i % 40))];
      else if (kind === 'textEdit') patch = [H.setProp(doc2, texts[(i * 7919) % texts.length], 'text', DE.model.richText('Edited ' + i))];
      else if (kind === 'cardWidth') patch = [H.setProp(doc2, cardIds[(i * 7919) % cardIds.length], 'geometry.w', 200 + (i % 50))];
      else patch = [H.setProp(doc2, leaves[(i * 7919) % leaves.length], 'opacity', (i % 10) / 10)];
      let t0 = now(); hist.commit(doc2, patch); eng.layout('base'); base.push(now() - t0);
      t0 = now(); eng.layoutAll(); all.push(now() - t0);
    }
    return { patchAndLayoutBaseMedianMs: r2(median(base)), patchAndLayoutBaseMaxMs: r2(Math.max.apply(null, base)), otherBpsMedianMs: r2(median(all)) };
  }
  res.incremental = { leafHeight: incr('leafHeight', 25), textEdit: incr('textEdit', 25), cardWidth: incr('cardWidth', 25), opacityOnly: incr('opacity', 25) };
  return res;
}

function markdown(r) {
  const i = r.incremental;
  const row = (label, v, budget, ok) => '| ' + label + ' | ' + v + ' | ' + budget + ' | ' + (ok ? 'within' : '**over**') + ' |\n';
  let md = '## Performance (Annexe A / §2.3) — ' + r.nodes + ' nodes, Node ' + process.version + ', table measurer\n\n';
  md += '| measure | ms | budget | |\n| --- | --- | --- | --- |\n';
  md += row('open: parse ' + r.parseMs + ' + validate ' + r.validateMs + ' + first base layout ' + r.firstLayoutBaseMs, r.openMs, '≤ 1500 (+ first frame)', r.openMs <= 1500);
  md += row('full export (3 breakpoints, ' + r.cssKB + ' KB CSS, ' + r.htmlKB + ' KB HTML)', r.exportMs, '≤ 2000', r.exportMs <= 2000);
  md += row('cold layout of the 3 breakpoints', r.coldLayoutAll3BpsMs, '—', true);
  Object.keys(i).forEach(k => md += row('patch + incremental layout, ' + k + ' (median / max of 25)', i[k].patchAndLayoutBaseMedianMs + ' / ' + i[k].patchAndLayoutBaseMaxMs, '< 4 (§2.3), ≤ 12 with redraw', i[k].patchAndLayoutBaseMedianMs < 4));
  md += row('then the 2 other breakpoints (median)', Object.keys(i).map(k => i[k].otherBpsMedianMs).join(' / '), '—', true);
  return md;
}

const r = run();
console.log(JSON.stringify(r, null, 1));
if (opt('--json', null)) require('fs').writeFileSync(opt('--json'), JSON.stringify(r, null, 1));
if (opt('--md', null)) require('fs').writeFileSync(opt('--md'), markdown(r));
console.log('\n' + markdown(r));
