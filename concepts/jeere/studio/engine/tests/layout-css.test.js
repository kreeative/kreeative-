'use strict';
const DE = require('../index.js');
const M = DE.model, H = DE.history, C = DE.css;

module.exports = function (t) {
  const { assert, near } = t;
  const measurer = DE.text.createTableMeasurer();
  let seq = 0;
  const nid = () => (++seq).toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';

  function rowDoc() {
    const doc = M.createDocument();
    const root = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: { x: 0, y: 0, w: 800, h: 200, rotation: 0, flipH: false, flipV: false }, layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', gap: 10, padding: { top: 20, right: 20, bottom: 20, left: 20 } } }), null);
    const a = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: { x: 0, y: 0, w: 10, h: 50, rotation: 0, flipH: false, flipV: false }, layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' } }), root.id);
    const b = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: { x: 0, y: 0, w: 300, h: 80, rotation: 0, flipH: false, flipV: false }, layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' } }), root.id);
    const c = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: { x: 0, y: 0, w: 100, h: 30, rotation: 0, flipH: false, flipV: false } }), root.id);
    return { doc, root, a, b, c };
  }

  t.test('fill children share free space independently of content (flex: 1 1 0%)', () => {
    const { doc, root, a, b, c } = rowDoc();
    const L = new DE.layout.LayoutEngine(doc, { measurer }).layout('base');
    const inner = 800 - 40 - 100 - 20;
    assert.deepStrictEqual(L.boxes.get(a.id), { x: 20, y: 20, w: inner / 2, h: 50 });
    assert.deepStrictEqual(L.boxes.get(b.id), { x: 20 + inner / 2 + 10, y: 20, w: inner / 2, h: 80 });
    assert.strictEqual(L.boxes.get(c.id).x, 800 - 20 - 100);
    assert.strictEqual(L.boxes.get(root.id).h, 120, 'hug height = tallest + padding');
  });

  t.test('incremental layout: a patch re-lays out the touched node and its ancestors only', () => {
    const { doc, root, a, c } = rowDoc();
    const eng = new DE.layout.LayoutEngine(doc, { measurer });
    eng.layout('base');
    const h = new H.History();
    h.on('change', e => e.patches.forEach(p => eng.invalidateFromPatch(p)));
    h.commit(doc, [H.setProp(doc, c.id, 'geometry.h', 140)]);
    eng.stats.layouts = 0; eng.stats.cacheHits = 0;
    const L = eng.layout('base');
    assert.strictEqual(L.boxes.get(root.id).h, 180);
    assert.ok(eng.stats.layouts <= 3, 'only c + root (+1) recomputed, got ' + eng.stats.layouts);
    assert.ok(eng.stats.cacheHits >= 1, 'untouched siblings come from the cache');
    h.undo(doc);
    assert.strictEqual(eng.layout('base').boxes.get(root.id).h, 120, 'undo invalidates too');
    assert.deepStrictEqual(eng.layout('base').boxes.get(a.id).w, (800 - 160) / 2);
  });

  t.test('rotation: world box is the rotated bounding box (§1.4)', () => {
    const doc = M.createDocument();
    const f = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: { x: 0, y: 0, w: 400, h: 400, rotation: 0, flipH: false, flipV: false } }), null);
    const r = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: { x: 100, y: 100, w: 100, h: 50, rotation: 45, flipH: false, flipV: false } }), f.id);
    const L = DE.layout.layoutDocument(doc, { measurer });
    const w = L.world.get(r.id), e = M.rotatedBBox({ x: 100, y: 100, w: 100, h: 50 }, 45);
    near(w.x, e.x, 1e-9); near(w.y, e.y, 1e-9); near(w.w, e.w, 1e-9); near(w.h, e.h, 1e-9);
  });

  t.test('number formatting (§3.7): integers bare, ≤ 2 decimals, 0 without unit', () => {
    assert.strictEqual(C.px(12), '12px'); assert.strictEqual(C.px(12.345), '12.35px'); assert.strictEqual(C.px(0), '0'); assert.strictEqual(C.px(-0.001), '0');
    assert.strictEqual(C.cssColor(M.hex('#ffffff')), '#fff');
    assert.strictEqual(C.cssColor(M.color(0, 0, 0, 0.25)), 'rgba(0,0,0,.25)');
  });

  t.test('radius clamping: proportional reduction like CSS border-radius §5.5', () => {
    const r = C.effectiveRadii({ tl: 100, tr: 60, br: 0, bl: 20 }, 120, 80);
    const f = Math.min(120 / 160, 80 / 120);
    // then each radius ≤ min(w, h) / 2 (§3.2): 100·f = 66.7 → 40
    near(r.tl, Math.min(100 * f, 40)); near(r.tr, 60 * f); near(r.bl, 20 * f); assert.strictEqual(r.br, 0);
    const one = C.effectiveRadii({ tl: 80, tr: 0, br: 0, bl: 0 }, 100, 100);
    assert.strictEqual(one.tl, 50, 'a lone corner is capped at min(w, h) / 2');
    const k = C.cornerParams(one.tl, 0.6, 50);
    assert.ok(k.a >= -1e-9 && k.b >= -1e-9 && k.c >= 0 && k.d >= 0, 'no negative segment lengths (no folded path)');
  });

  t.test('squircle (§3.2): ξ = 0 degenerates to circular arcs; parameters follow the formula', () => {
    const p0 = C.cornerParams(24, 0, 60);
    near(p0.a, 0, 1e-9); near(p0.b, 0, 1e-9); near(p0.c, 0, 1e-9); near(p0.d, 0, 1e-9); near(p0.p, 24, 1e-9);
    const R = 24, xi = 0.6, p = C.cornerParams(R, xi, 100);
    const theta = 90 * (1 - xi), arc = Math.sin(theta / 2 * Math.PI / 180) * R * Math.SQRT2;
    const d34 = R * Math.tan((90 - theta) / 2 / 2 * Math.PI / 180), beta = 45 * xi;
    const c = d34 * Math.cos(beta * Math.PI / 180), d = c * Math.tan(beta * Math.PI / 180);
    near(p.p, (1 + xi) * R); near(p.arc, arc); near(p.c, c); near(p.d, d); near(p.b, ((1 + xi) * R - arc - c - d) / 3); near(p.a, 2 * p.b);
    const path = C.squirclePath(160, 120, { tl: 24, tr: 24, br: 24, bl: 24, smoothing: 0.6 });
    assert.match(path, /^M[0-9.]+ 0 C.* Z$/, 'absolute commands');
    assert.strictEqual((path.match(/ A/g) || []).length, 4);
    // spec §3.2 example (R = 16, ξ = 0.6, 200 wide): top-right corner endpoints, absolute
    const q = C.squirclePath(200, 100, { tl: 16, tr: 16, br: 16, bl: 16, smoothing: 0.6 });
    assert.ok(q.startsWith('M174.4 0 C183.36 0 187.84 0 191.26 1.74 A16 16 0 0 1 198.26 8.74 C200 12.16 200 16.64 200 25.6 L200 74.4'), q);
  });

  t.test('linear gradient angle + stop remap (§3.3)', () => {
    const lg = (s, e, w, h) => C.linearGradient({ type: 'linear', stops: [{ position: 0, color: M.hex('#000') }, { position: 1, color: M.hex('#fff') }], start: s, end: e, opacity: 1 }, w, h);
    assert.strictEqual(lg({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 200, 100).css, 'linear-gradient(90deg, #000 0%, #fff 100%)');
    assert.strictEqual(lg({ x: 0.5, y: 1 }, { x: 0.5, y: 0 }, 200, 100).angle, 0);
    const diag = lg({ x: 0, y: 0 }, { x: 1, y: 1 }, 200, 100);
    near(diag.angle, (Math.atan2(200, -100) * 180 / Math.PI + 360) % 360, 1e-9);
    near(diag.remap(0), 0, 1e-9); near(diag.remap(1), 1, 1e-9);
    const off = lg({ x: -0.5, y: 0.5 }, { x: 1.5, y: 0.5 }, 200, 100);
    near(off.remap(0), -0.5, 1e-9); near(off.remap(1), 1.5, 1e-9);
  });

  t.test('K_BLUR is the harness-calibrated named constant', () => {
    assert.strictEqual(typeof C.K_BLUR, 'number');
    assert.ok(C.K_BLUR >= 0.3 && C.K_BLUR <= 0.7);
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'css.js'), 'utf8');
    assert.match(src, /CALIBRATION: K_BLUR = [0-9.]+ \(mean ΔE00/);
  });

  t.test('text measurer: line-height normal from metrics, wrapping, CJK per character', () => {
    const style = M.defaultTextStyle({ family: 'Inter', size: 16 });
    const vm = DE.text.verticalMetrics(style);
    assert.strictEqual(vm.normal, Math.round(1984 * 16 / 2048) + Math.round(494 * 16 / 2048));
    const one = measurer.measureText('Hello world', style, Infinity, { mode: 'autoWidth' });
    assert.strictEqual(one.lines.length, 1);
    const wrapped = measurer.measureText('Hello world, this wraps', style, one.width, { mode: 'autoHeight' });
    assert.ok(wrapped.lines.length >= 2);
    assert.deepStrictEqual(DE.text.segment('日本語 ok-go').map(c => c.word), ['日', '本', '語', 'ok-', 'go']);
    const custom = DE.text.createTableMeasurer(undefined, { Inter: { upm: 1000, ascender: 800, descender: -200, lineGap: 100 } });
    assert.strictEqual(custom.verticalMetrics(style).normal, 13 + 3 + 2, 'explicit metrics can be passed');
  });

  t.test('exportDocument: HTML with classes, @media blocks ordered wide → narrow', () => {
    const { doc, root } = rowDoc();
    root.overrides = { tablet: { layoutParent: { gap: 6 } }, phone: { layoutParent: { gap: 2 } } };
    const out = DE.exportDocument(doc, { measurer });
    assert.ok(out.html.includes('class="' + M.classOf(root.id)));
    const iT = out.css.indexOf('@media (max-width: 1439.98px)'), iP = out.css.indexOf('@media (max-width: 833.98px)');
    assert.ok(iT > 0 && iP > iT, 'tablet block before phone block');
    assert.ok(out.css.includes('prefers-reduced-motion') || !/transition/.test(out.css));
  });
};
