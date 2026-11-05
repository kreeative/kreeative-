'use strict';
/* Regression tests for the review findings (history atomicity, CSS cascade, mappings, validation). */
const DE = require('../index.js');
const M = DE.model, H = DE.history, C = DE.css, R = DE.resolve;

module.exports = function (t) {
  const { assert, near } = t;
  const measurer = DE.text.createTableMeasurer();
  let seq = 0x9000;
  const nid = () => (++seq).toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
  const G = (w, h, extra) => Object.assign({ x: 0, y: 0, w, h, rotation: 0, flipH: false, flipV: false }, extra || {});
  const decl = (list, p) => { const d = (list || []).find(x => x[0] === p); return d && d[1]; };
  function gen(doc) { const layouts = new DE.layout.LayoutEngine(doc, { measurer }).layoutAll(); return Object.assign(C.generate(doc, { layouts }), { layouts }); }
  const rulesOf = (g, sel, media) => g.rules.filter(r => r.selector === sel && (r.media || null) === (media || null));

  /* ---------------------------------------------------------------- history (RFC 6902) */

  t.test('move to "-" undoes to the original order; history stays consistent', () => {
    const doc = { nodes: { p: { children: ['a', 'b', 'c'] } } };
    const h = new H.History();
    h.commit(doc, [{ op: 'move', from: '/nodes/p/children/0', path: '/nodes/p/children/-' }]);
    assert.deepStrictEqual(doc.nodes.p.children, ['b', 'c', 'a']);
    h.undo(doc);
    assert.deepStrictEqual(doc.nodes.p.children, ['a', 'b', 'c']);
    assert.strictEqual(h.undoStack.length, 0); assert.strictEqual(h.redoStack.length, 1);
    h.redo(doc); assert.deepStrictEqual(doc.nodes.p.children, ['b', 'c', 'a']);
  });
  t.test('move onto an existing key restores the overwritten value; failed moves are atomic', () => {
    const o = { o: { x: 1, y: 2 } };
    const inv = H.applyPatch(o, [{ op: 'move', from: '/o/x', path: '/o/y' }]);
    assert.deepStrictEqual(o, { o: { y: 1 } });
    H.applyPatch(o, inv); assert.ok(H.deepEqual(o, { o: { x: 1, y: 2 } }));
    const n = { nodes: { a: 1 } };
    assert.throws(() => H.applyPatch(n, [{ op: 'move', from: '/nodes/a', path: '/nodes/missing/a' }]));
    assert.deepStrictEqual(n, { nodes: { a: 1 } }, 'the source is not lost');
    const q = { x: 1, y: 2 };
    assert.throws(() => H.applyPatch(q, [{ op: 'move', from: '/x', path: '/z' }, { op: 'remove', path: '/nope' }]));
    assert.ok(H.deepEqual(q, { x: 1, y: 2 }), 'rolled back');
    assert.throws(() => H.applyPatch({ a: 1 }, [{ op: 'add', path: '/a/b', value: 1 }]), /path not found/, 'a patch error, not a TypeError');
  });
  t.test('patch paths through __proto__ / constructor / prototype are refused', () => {
    assert.throws(() => H.applyPatch({ nodes: {} }, [{ op: 'add', path: '/__proto__/dePolluted', value: 'yes' }]), /forbidden/);
    assert.throws(() => H.applyPatch({ nodes: {} }, [{ op: 'add', path: '/constructor/prototype/x', value: 1 }]), /forbidden/);
    assert.strictEqual(({}).dePolluted, undefined);
  });
  t.test('coalescing never merges into a transaction from before an undo', () => {
    let now = 0; const doc = { v: 0 }; const h = new H.History({ now: () => now });
    h.commit(doc, [{ op: 'replace', path: '/v', value: 1 }], { coalesceKey: 'k' });
    h.commit(doc, [{ op: 'replace', path: '/v', value: 2 }], { coalesceKey: 'other' });
    h.undo(doc); now = 100;
    h.commit(doc, [{ op: 'replace', path: '/v', value: 3 }], { coalesceKey: 'k' });
    assert.strictEqual(h.undoStack.length, 2);
    h.undo(doc); assert.strictEqual(doc.v, 1);
  });

  /* ---------------------------------------------------------------- CSS: state × breakpoint cascade (§1.5 / §4.3) */

  t.test('a state equal to a breakpoint override is never reset to the initial value', () => {
    const doc = M.createDocument();
    const x = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 100), fills: [M.solid('#3657ff')], states: { hover: { opacity: 0.5 } }, overrides: { tablet: { opacity: 0.5 } } }), null);
    const g = gen(doc), cls = '.' + M.classOf(x.id);
    // resolved: hover is .5 at every breakpoint
    ['base', 'tablet', 'phone'].forEach(bp => assert.strictEqual(R.resolve(doc, x, 'opacity', bp, 'hover'), 0.5));
    // simulate the browser cascade: last :hover declaration of opacity wins over plain rules
    ['tablet', 'phone'].forEach(bp => {
      const media = [null].concat(doc.breakpoints.slice(1, doc.breakpoints.findIndex(b => b.id === bp) + 1).map(b => R.mediaQuery(doc, b.id)));
      let hover;
      g.rules.filter(r => r.selector === cls + ':hover' && media.indexOf(r.media || null) >= 0).forEach(r => { const v = decl(r.declarations, 'opacity'); if (v !== undefined) hover = v; });
      assert.notStrictEqual(hover, '1', bp + ': the hover opacity is never reset to 1');
      assert.ok(hover === undefined || hover === '.5', bp + ': ' + hover);
    });
  });
  t.test('a state value that changes per breakpoint is re-emitted in the media block', () => {
    const doc = M.createDocument();
    const x = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 100), states: { hover: { opacity: 0.5 } }, overrides: { phone: { states: { hover: { opacity: 1 } } } } }), null);
    const g = gen(doc), cls = '.' + M.classOf(x.id);
    assert.strictEqual(decl(rulesOf(g, cls + ':hover')[0].declarations, 'opacity'), '.5');
    const ph = rulesOf(g, cls + ':hover', R.mediaQuery(doc, 'phone'))[0];
    assert.ok(ph && decl(ph.declarations, 'opacity') === '1', 'phone hover back to 1');
  });
  t.test('disabled → [disabled] and [aria-disabled="true"]', () => {
    assert.strictEqual(C.STATE_SELECTOR.disabled.length, 2);
    const doc = M.createDocument();
    const x = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(100, 40), states: { disabled: { opacity: 0.5 } } }), null);
    const cls = M.classOf(x.id);
    assert.ok(gen(doc).rules.some(r => r.selector === '.' + cls + '[disabled], .' + cls + '[aria-disabled="true"]'));
  });

  /* ---------------------------------------------------------------- CSS mappings */

  t.test('constraints in a bordered parent: right / bottom use padding-box coordinates (§2.4)', () => {
    const doc = M.createDocument();
    const p = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(400, 300), layoutParent: { mode: 'absolute' }, strokes: [{ paint: M.solid('#000'), width: 4, align: 'inside', dash: [4, 2], cap: 'butt', join: 'miter', visible: true }] }), null);
    const c = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 60, { x: 50, y: 40 }), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fixed', constraints: { h: 'right', v: 'bottom' } } }), p.id);
    const g = gen(doc), d = rulesOf(g, '.' + M.classOf(c.id))[0].declarations;
    // padding box 392 × 292; child at (46, 36) in it → right 392 − 46 − 100 = 246, bottom 292 − 36 − 60 = 196
    assert.strictEqual(decl(d, 'right'), '246px'); assert.strictEqual(decl(d, 'bottom'), '196px');
    const box = g.layouts.base.boxes.get(c.id);
    assert.strictEqual(box.x, 50); assert.strictEqual(box.y, 40, 'stored geometry is kept at the defining breakpoint');
  });
  t.test('Normal groups are isolated; pass-through groups are not (§3.3)', () => {
    const doc = M.createDocument();
    const a = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(100, 100), blendMode: 'normal' }), null);
    const b = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(100, 100), blendMode: 'passThrough' }), null);
    const g = gen(doc);
    assert.strictEqual(decl(rulesOf(g, '.' + M.classOf(a.id))[0].declarations, 'isolation'), 'isolate');
    assert.strictEqual(decl(rulesOf(g, '.' + M.classOf(b.id))[0].declarations, 'isolation'), undefined);
  });
  t.test('reverseZ keeps absolute children above flow siblings; negative spacing → margins', () => {
    const doc = M.createDocument();
    const s = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(600, 100), layoutParent: { mode: 'stack', direction: 'horizontal', gap: -20, reverseZ: true } }), null);
    const k = [0, 1, 2].map(() => M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 50) }), s.id));
    const ab = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(50, 50), layoutChild: { position: 'absolute', widthMode: 'fixed', heightMode: 'fixed' } }), s.id);
    const g = gen(doc), z = n => +decl(rulesOf(g, '.' + M.classOf(n.id))[0].declarations, 'z-index');
    assert.ok(z(k[0]) > z(k[1]) && z(k[1]) > z(k[2]), 'decreasing'); assert.ok(z(ab) > z(k[0]), 'absolute on top');
    assert.strictEqual(decl(rulesOf(g, '.' + M.classOf(s.id))[0].declarations, 'gap'), undefined, 'no negative gap');
    assert.strictEqual(decl(rulesOf(g, '.' + M.classOf(k[0].id))[0].declarations, 'margin-left'), undefined);
    assert.strictEqual(decl(rulesOf(g, '.' + M.classOf(k[1].id))[0].declarations, 'margin-left'), '-20px');
    assert.strictEqual(g.layouts.base.boxes.get(k[1].id).x, 80);
  });
  t.test('squircle strokes: unclipped wrapper with an SVG ring (::after); shadow-less squircle stays single', () => {
    const doc = M.createDocument();
    const x = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(200, 120), fills: [M.solid('#3657ff')], corners: { tl: 16, tr: 16, br: 16, bl: 16, smoothing: 0.6 }, strokes: [{ paint: M.solid('#000'), width: 4, align: 'outside', cap: 'butt', join: 'miter', visible: true }] }), null);
    const g = gen(doc), cls = M.classOf(x.id);
    assert.ok(g.wrappers[x.id]);
    const main = rulesOf(g, '.' + cls)[0].declarations, inner = rulesOf(g, '.' + cls + ' > .' + cls + '-in')[0] || rulesOf(g, '.' + cls + '-in')[0], after = rulesOf(g, '.' + cls + '::after')[0];
    assert.strictEqual(decl(main, 'clip-path'), undefined, 'the outer box is not clipped');
    assert.strictEqual(decl(main, 'box-shadow'), undefined);
    assert.ok(after && /^url\("data:image\/svg\+xml,/.test(decl(after.declarations, 'background-image')));
    assert.strictEqual(decl(after.declarations, 'inset'), '-5px');
    assert.ok(inner || g.rules.some(r => r.selector === '.' + cls + '-in'), 'clipped inner box');
    assert.ok(DE.html.emit(doc, { css: g.css, layouts: g.layouts, wrappers: g.wrappers }).body.indexOf(cls + '-in') > 0);
  });
  t.test('backdrop-filter gets its -webkit- twin under @supports; drop-shadow() when not behind transparent parts', () => {
    const doc = M.createDocument();
    const x = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 100), fills: [M.solid('#ffffff', { opacity: 0.5 })], effects: [{ type: 'backgroundBlur', radius: 10, visible: true }, { type: 'dropShadow', x: 0, y: 2, blur: 4, spread: 0, color: M.color(0, 0, 0, 0.5), visible: true, showBehindTransparent: false }] }), null);
    const g = gen(doc), cls = '.' + M.classOf(x.id);
    const tw = g.rules.find(r => r.selector === cls && r.supports);
    assert.ok(tw && decl(tw.declarations, '-webkit-backdrop-filter') === decl(rulesOf(g, cls)[0].declarations, 'backdrop-filter'));
    assert.ok(/@supports \(-webkit-backdrop-filter: none\)/.test(g.css));
    assert.strictEqual(decl(rulesOf(g, cls)[0].declarations, 'filter'), 'drop-shadow(0 2px 4px rgba(0,0,0,.5))');
    assert.strictEqual(decl(rulesOf(g, cls)[0].declarations, 'box-shadow'), undefined);
  });
  t.test('aspect lock → aspect-ratio, image crop → object-position, hug absolute frame → px, line → SVG stroke', () => {
    const doc = M.createDocument();
    const s = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(600, 100), layoutParent: { mode: 'stack', direction: 'horizontal', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), null);
    const a = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(160, 90), aspectLocked: true, layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' } }), s.id);
    const img = M.addNode(doc, M.createNode('image', { id: nid(), geometry: G(100, 100), fit: 'crop', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }), s.id);
    const hf = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'hug', heightMode: 'hug' } }), s.id);
    M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(80, 30, { x: 20, y: 10 }) }), hf.id);
    const ln = M.addNode(doc, M.createNode('line', { id: nid(), geometry: G(100, 0), strokes: [{ paint: M.solid('#f00'), width: 6, align: 'center', cap: 'round', join: 'miter', visible: true }] }), s.id);
    const g = gen(doc), d = n => rulesOf(g, '.' + M.classOf(n.id))[0].declarations;
    assert.strictEqual(decl(d(a), 'aspect-ratio'), '160 / 90'); assert.strictEqual(decl(d(a), 'height'), undefined);
    const box = g.layouts.base.boxes.get(a.id); near(box.h, box.w * 90 / 160, 1e-9);
    assert.strictEqual(decl(d(img), 'object-position'), '20% 50%');
    assert.strictEqual(decl(d(hf), 'width'), '100px'); assert.strictEqual(decl(d(hf), 'height'), '40px');
    const sv = rulesOf(g, '.' + M.classOf(ln.id) + ' .' + M.classOf(ln.id) + '-s')[0];
    assert.ok(sv && decl(sv.declarations, 'stroke-linecap') === 'round' && decl(sv.declarations, 'stroke-width') === '6px');
    assert.strictEqual(decl(d(ln), 'box-shadow'), undefined);
  });
  t.test('gradients: Mat3 transform, rotated radial → SVG, diamond → SVG (§3.3)', () => {
    const stops = [{ position: 0, color: M.hex('#f00') }, { position: 1, color: M.hex('#00f') }];
    assert.strictEqual(C.linearGradient({ type: 'linear', stops, opacity: 1, transform: [[0, 1, 0], [-1, 0, 1]] }, 100, 100).css, 'linear-gradient(180deg, #f00 0%, #00f 100%)');
    assert.ok(/^radial-gradient\(/.test(C.radialGradient({ type: 'radial', stops, opacity: 1, transform: [[2, 0, -0.5], [0, 2, -0.5]] }, 200, 100)));
    assert.ok(/^url\("data:image\/svg\+xml,/.test(C.radialGradient({ type: 'radial', stops, opacity: 1, transform: [[1.4, 1.4, -0.9], [-1.4, 1.4, 0.5]] }, 200, 100)));
    const w = []; const l = C.paintLayer({ assets: {} }, { type: 'diamond', stops, opacity: 1 }, 100, 100, (c, m) => w.push(c));
    assert.ok(/linearGradient/.test(decodeURIComponent(l.image)) && w[0] === 'rasterised');
  });
  t.test('number formatting: no leading zero (§3.5 / §3.7)', () => {
    assert.strictEqual(C.num(0.5), '.5'); assert.strictEqual(C.num(-0.25), '-.25'); assert.strictEqual(C.px(0.5), '.5px'); assert.strictEqual(C.num(12.345), '12.35');
  });

  /* ---------------------------------------------------------------- tokens */

  t.test('alias cycles never break the export: neutral fallback + warnings', () => {
    const doc = M.createDocument({ tokens: { sets: [{ id: 's', name: 'S', tokens: { 'cyc.a': { type: 'color', valueByMode: { light: { alias: '{cyc.b}' } } }, 'cyc.b': { type: 'color', valueByMode: { light: { alias: '{cyc.a}' } } } } }], modes: [{ id: 'light', name: 'Light' }], activeMode: {} } });
    M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(10, 10), fills: [{ type: 'solid', color: { ref: 'cyc.a' }, opacity: 1, blend: 'normal', visible: true }] }), null);
    assert.ok(M.validateDocument(doc).some(e => e.level === 'warning' && /cycle/.test(e.message)));
    const out = DE.exportDocument(doc, { measurer });
    assert.ok(!/--cyc-a: var\(--cyc-b\)/.test(out.css), 'no mutually recursive custom properties');
    assert.ok(/--cyc-a: transparent/.test(out.css));
    assert.ok(out.warnings.some(w => /cycle/.test(w.message)));
  });

  /* ---------------------------------------------------------------- validation */

  t.test('validation: hug/fill per breakpoint, x/y override on a flow child, rotation range, huge coordinates', () => {
    const doc = M.createDocument();
    const s = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(300, 100, { rotation: 270 }), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal' }, overrides: { tablet: { layoutParent: { direction: 'vertical' } } } }), null);
    M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(100, 4e7), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fill' }, overrides: { phone: { geometry: { x: 10 } } } }), s.id);
    const v = M.validateDocument(doc);
    assert.ok(v.some(e => e.level === 'error' && /fill child on the main axis .* at breakpoint tablet/.test(e.message)));
    assert.ok(v.some(e => e.level === 'warning' && /x\/y override on a flow child/.test(e.message)));
    assert.ok(v.some(e => e.level === 'warning' && /rotation 270/.test(e.message)));
    assert.ok(v.some(e => e.level === 'warning' && /LayoutUnit/.test(e.message)));
  });
  t.test('tag inference (§0.4): Heading/N text → hN, Bouton instance → button / a', () => {
    const doc = M.createDocument();
    doc.styles.h2 = { name: 'Heading/2' };
    const t1 = M.addNode(doc, M.createNode('text', { id: nid(), styleId: 'h2' }), null);
    doc.components.btn = { name: 'Bouton' };
    const i1 = M.addNode(doc, M.createNode('instance', { id: nid(), of: 'btn' }), null);
    M.inferTags(doc);
    assert.strictEqual(t1.semantic.tag, 'h2'); assert.strictEqual(i1.semantic.tag, 'button');
  });

  /* ---------------------------------------------------------------- layout */

  t.test('layout: padding floor, grow < 1, synthesized baseline, implicit grid columns, cyclic %', () => {
    const doc = M.createDocument();
    const s = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(1000, 10), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), null);
    const tiny = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(20, 20), layoutParent: { mode: 'stack', direction: 'horizontal', padding: { top: 30, right: 30, bottom: 30, left: 30 } } }), s.id);
    const row = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(1000, 50), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' }, layoutParent: { mode: 'stack', direction: 'horizontal', padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), s.id);
    const g1 = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed', grow: 0.25 } }), row.id);
    const grid = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(1000, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' }, layoutParent: { mode: 'grid', columns: [{ kind: 'px', value: 100 }, { kind: 'px', value: 100 }], columnGap: 0, rowGap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), s.id);
    const span = M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed', gridArea: { col: 2, colSpan: 3, row: 1, rowSpan: 1 } } }), grid.id);
    const hug = M.addNode(doc, M.createNode('frame', { id: nid(), geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'hug', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), s.id);
    M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(50, 10), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fixed', widthUnit: '%' } }), hug.id);
    M.addNode(doc, M.createNode('rect', { id: nid(), geometry: G(144, 10) }), hug.id);
    const L = new DE.layout.LayoutEngine(doc, { measurer }).layout('base');
    assert.deepStrictEqual([L.boxes.get(tiny.id).w, L.boxes.get(tiny.id).h], [60, 60], 'border-box floor = padding');
    assert.strictEqual(L.boxes.get(g1.id).w, 250, 'grow .25 takes a quarter of the free space');
    assert.strictEqual(L.boxes.get(span.id).w, 900, 'implicit auto columns stretch to the free space');
    assert.strictEqual(L.boxes.get(hug.id).w, 144, 'a cyclic % width contributes auto (0) to the hug size');
    const brow = M.createDocument();
    const r0 = M.addNode(brow, M.createNode('frame', { id: nid(), geometry: G(600, 10), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', alignCross: 'baseline', padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), null);
    M.addNode(brow, M.createNode('text', { id: nid(), text: 'Base', style: M.defaultTextStyle({ size: 40 }) }), r0.id);
    const nested = M.addNode(brow, M.createNode('frame', { id: nid(), geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'hug', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), r0.id);
    M.addNode(brow, M.createNode('rect', { id: nid(), geometry: G(20, 20) }), nested.id);
    const LB = new DE.layout.LayoutEngine(brow, { measurer }).layout('base');
    const tm = LB.text.get(brow.nodes[r0.children[0]].id);
    near(LB.boxes.get(nested.id).y + 20, tm.firstBaseline, 1e-9, 'a rect-first container is aligned by its synthesized (bottom) baseline');
  });
  t.test('text: tab stops (tab-size 8), NBSP = space advance, empty paragraphs keep their line', () => {
    const st = M.defaultTextStyle();
    const sp = measurer.measureText(' ', st, Infinity).width;
    const a = measurer.measureText('ab\tc', st, Infinity).width, ab = measurer.measureText('ab', st, Infinity).width, c = measurer.measureText('c', st, Infinity).width;
    near(a, 8 * sp + c, 1e-9);
    assert.ok(ab < 8 * sp);
    near(measurer.measureText('a b', st, Infinity).width, measurer.measureText('a b', st, Infinity).width, 1e-9);
    const doc = M.createDocument();
    const tx = M.addNode(doc, M.createNode('text', { id: nid(), text: 'line1\n\nline3\n' }), null);
    assert.strictEqual(DE.html.textContent(tx, M.classOf(tx.id)).split('<br>').length - 1, 2);
    assert.strictEqual(measurer.measureText(tx.text, st, Infinity).lines.length, 4);
  });
};
