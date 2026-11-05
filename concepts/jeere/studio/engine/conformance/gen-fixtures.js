/* Conformance fixtures generator (§0.6). Writes conformance/fixtures/NNN-name.json.
 *
 *   node engine/conformance/gen-fixtures.js
 *
 * Every fixture is a complete Document (deterministic ids) plus metadata:
 *   { name, group, description, pixel: boolean, doc }
 * Groups: matrix (§2.2 rows), nested, grid, absolute (§2.5 at 3 breakpoints), text (§2.7),
 * rotation (§1.4), radius (§3.2 clamping), squircle, stroke (§3.4), shadow / blur (§3.5),
 * gradient (§3.3, 8 angles, off-box handles), blend, state (§4.3), token (§4.4), responsive (§1.5),
 * image, shape.
 */
const fs = require('fs');
const path = require('path');
const DE = require('../index.js');
const { model } = DE;

const OUT = path.join(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
// remove only this generator's own fixtures: the adversarial-review fixtures (field `source`) and
// gen-fixtures-review.js's are kept
fs.readdirSync(OUT).filter(f => f.endsWith('.json')).forEach(f => {
  const fx = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  if (!fx.source) fs.unlinkSync(path.join(OUT, f));
});

let fixtureIndex = 0, nodeCounter = 0;
function id() { nodeCounter++; return (fixtureIndex.toString(16).padStart(3, '0') + nodeCounter.toString(16).padStart(5, '0')) + '-0000-4000-8000-000000000000'; }
const fixtures = [];

function hex(h) { return model.hex(h); }
function solid(h, opacity) { return model.solid(h, opacity !== undefined ? { opacity } : undefined); }
function stroke(h, width, align, extra) { return Object.assign({ paint: solid(h), width, align: align || 'inside', cap: 'butt', join: 'miter', visible: true }, extra || {}); }
function shadow(x, y, blur, spread, color, extra) { return Object.assign({ type: 'dropShadow', x, y, blur, spread, color: typeof color === 'string' ? hex(color) : color, visible: true }, extra || {}); }
function linear(stops, start, end, extra) { return Object.assign({ type: 'linear', stops: stops.map(s => ({ position: s[0], color: hex(s[1]) })), start, end, opacity: 1, blend: 'normal', visible: true }, extra || {}); }
function corners(r, smoothing) { return typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r, smoothing: smoothing || 0 } : Object.assign({ smoothing: 0 }, r); }
function text(str, styleOver, props) {
  return model.createNode('text', Object.assign({ id: id(), text: str, style: model.defaultTextStyle(Object.assign({ family: 'Inter', size: 16, weight: 400 }, styleOver || {})) }, props || {}));
}
function rect(w, h, color, props) { return model.createNode('rect', Object.assign({ id: id(), geometry: { x: 0, y: 0, w, h, rotation: 0, flipH: false, flipV: false }, fills: [solid(color || '#3657ff')] }, props || {})); }
function stack(dir, props, lp) {
  const node = model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'stack', direction: dir, gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 }, alignMain: 'start', alignCross: 'start', clip: false }, lp || {}) }, props || {}));
  return node;
}
function frameAbs(props, lp) { return model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'absolute', clip: false }, lp || {}) }, props || {})); }
function grid(cols, rows, props, lp) {
  return model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'grid', columns: cols, rows: rows || [], columnGap: 12, rowGap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 }, clip: false }, lp || {}) }, props || {}));
}
function geom(x, y, w, h, extra) { return Object.assign({ x, y, w, h, rotation: 0, flipH: false, flipV: false }, extra || {}); }

/** Build a document: root is a frame (fill width unless props say otherwise) */
function fixture(name, group, description, build, opts) {
  fixtureIndex++; nodeCounter = 0;
  const doc = model.createDocument({ id: 'doc' + fixtureIndex, name, pageId: 'page' + fixtureIndex, tokens: opts && opts.tokens, assets: opts && opts.assets });
  if (opts && opts.breakpoints) doc.breakpoints = opts.breakpoints;
  build(doc);
  const errors = model.validateDocument(doc).filter(e => e.level === 'error');
  if (errors.length) throw new Error(name + ': ' + JSON.stringify(errors));
  fixtures.push({ name, group, description, pixel: !!(opts && opts.pixel), doc });
}
function addRoot(doc, node, w, h, fillWidth) {
  node.geometry = Object.assign(node.geometry, { w: w || 800, h: h || 400 });
  node.layoutChild = Object.assign(node.layoutChild, { widthMode: fillWidth === false ? 'fixed' : 'fill', heightMode: h ? 'fixed' : 'hug' });
  if (!node.fills.length) node.fills = [solid('#f6f6f8')];
  model.addNode(doc, node, null);
  return node;
}
function add(doc, parent, node) { return model.addNode(doc, node, parent.id); }

/* ================================================================== 1. §2.2 matrix rows */

['horizontal', 'vertical'].forEach(dir => {
  fixture('matrix-direction-' + dir, 'matrix', 'Stack ' + dir + ', fixed children, gap 12, padding 16', doc => {
    const s = addRoot(doc, stack(dir), 800, dir === 'horizontal' ? 200 : 320);
    add(doc, s, rect(120, 60, '#3657ff')); add(doc, s, rect(80, 100, '#ff5722')); add(doc, s, rect(160, 40, '#4caf50'));
  }, { pixel: dir === 'horizontal' });
});
fixture('matrix-wrap', 'matrix', 'Wrap with rowGap 20, 7 items of 180px in 800px', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { wrap: true, gap: 12, rowGap: 20 }), 800);
  for (let i = 0; i < 7; i++) add(doc, s, rect(180, 40 + (i % 3) * 20, ['#3657ff', '#ff5722', '#4caf50'][i % 3]));
});
fixture('matrix-wrap-stretch', 'matrix', 'Wrap, fixed height container, alignCross stretch → align-content stretch', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { wrap: true, gap: 10, alignCross: 'stretch' }), 800, 400);
  for (let i = 0; i < 6; i++) add(doc, s, rect(220, 50, '#3657ff', { layoutChild: { heightMode: i % 2 ? 'fill' : 'fixed' } }));
});
fixture('matrix-wrap-align-end', 'matrix', 'Wrap in a fixed height container, lines packed at the end', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { wrap: true, gap: 10, alignCross: 'end' }), 800, 300);
  for (let i = 0; i < 5; i++) add(doc, s, rect(250, 40 + i * 10, '#ff5722'));
});
fixture('matrix-gap-auto', 'matrix', "Spacing 'Auto' → justify-content: space-between", doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 'auto' }), 800, 120);
  add(doc, s, rect(100, 60)); add(doc, s, rect(140, 60, '#ff5722')); add(doc, s, rect(60, 60, '#4caf50'));
}, { pixel: true });
fixture('matrix-gap-auto-single', 'matrix', "Spacing 'Auto' with a single child = start", doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 'auto' }), 800, 120);
  add(doc, s, rect(100, 60));
});
fixture('matrix-gap-auto-vertical', 'matrix', "Spacing 'Auto' in a vertical stack", doc => {
  const s = addRoot(doc, stack('vertical', {}, { gap: 'auto' }), 800, 400);
  add(doc, s, rect(100, 60)); add(doc, s, rect(140, 60, '#ff5722')); add(doc, s, rect(60, 60, '#4caf50'));
});
fixture('matrix-padding-asym', 'matrix', 'Asymmetric padding 8 24 40 56', doc => {
  const s = addRoot(doc, stack('vertical', {}, { padding: { top: 8, right: 24, bottom: 40, left: 56 }, gap: 0 }), 800);
  add(doc, s, rect(100, 60)); add(doc, s, rect(140, 60, '#ff5722'));
});
const MAINS = ['start', 'center', 'end', 'spaceBetween'], CROSSES = ['start', 'center', 'end', 'stretch'];
MAINS.forEach(am => CROSSES.forEach(ac => {
  fixture('matrix-align-' + am + '-' + ac, 'matrix', 'alignMain ' + am + ' × alignCross ' + ac + ' (row, fixed 800×200)', doc => {
    const s = addRoot(doc, stack('horizontal', {}, { alignMain: am, alignCross: ac }), 800, 200);
    add(doc, s, rect(120, 60)); add(doc, s, rect(80, 100, '#ff5722')); add(doc, s, rect(160, 40, '#4caf50', { layoutChild: { heightMode: ac === 'stretch' ? 'fill' : 'fixed' } }));
  }, { pixel: am === 'center' && ac === 'center' });
}));
['start', 'center', 'end', 'spaceBetween'].forEach(am => {
  fixture('matrix-align-col-' + am + '-center', 'matrix', 'Column: alignMain ' + am + ', alignCross center', doc => {
    const s = addRoot(doc, stack('vertical', {}, { alignMain: am, alignCross: 'center' }), 800, 400);
    add(doc, s, rect(120, 60)); add(doc, s, rect(80, 100, '#ff5722')); add(doc, s, rect(160, 40, '#4caf50'));
  });
});
fixture('matrix-clip', 'matrix', 'Clip content: overflow hidden, child larger than the parent', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { clip: true, padding: { top: 0, right: 0, bottom: 0, left: 0 } }), 400, 150, false);
  add(doc, s, rect(300, 100)); add(doc, s, rect(300, 100, '#ff5722'));
}, { pixel: true });
fixture('matrix-reverse-z', 'matrix', 'reverseZ: first child on top (z-index decreasing), overlapping via negative-gap-like absolute', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { reverseZ: true, gap: 0 }), 800, 200);
  add(doc, s, rect(200, 120)); add(doc, s, rect(200, 120, '#ff5722')); add(doc, s, rect(200, 120, '#4caf50'));
}, { pixel: true });
fixture('matrix-child-fixed-vw', 'matrix', 'Fixed 20vw child (Framer units)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  add(doc, s, rect(20, 60, '#3657ff', { layoutChild: { widthUnit: 'vw' } })); add(doc, s, rect(100, 60, '#ff5722'));
});
fixture('matrix-child-hug', 'matrix', 'Hug children (nested stacks) in a row', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  const h = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 6 }));
  add(doc, h, rect(60, 20)); add(doc, h, rect(90, 30, '#ff5722'));
  const h2 = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 6 }));
  add(doc, h2, rect(60, 20)); add(doc, h2, rect(90, 30, '#ff5722'));
});
fixture('matrix-child-fill-two', 'matrix', 'Two Fill children share the space independently of content (flex: 1 1 0%)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  add(doc, s, rect(10, 60, '#3657ff', { layoutChild: { widthMode: 'fill' } }));
  add(doc, s, rect(300, 60, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
  add(doc, s, rect(100, 60, '#4caf50'));
}, { pixel: true });
fixture('matrix-child-fill-grow', 'matrix', 'Fill children with grow 1 / 2 / 3', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  [1, 2, 3].forEach((g, i) => add(doc, s, rect(10, 60, ['#3657ff', '#ff5722', '#4caf50'][i], { layoutChild: { widthMode: 'fill', grow: g } })));
});
fixture('matrix-child-fill-cross', 'matrix', 'Fill on the cross axis → align-self: stretch', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(120, 60)); add(doc, s, rect(120, 60, '#ff5722', { layoutChild: { heightMode: 'fill' } }));
});
fixture('matrix-child-fill-column', 'matrix', 'Column: fill height children and fill width (cross)', doc => {
  const s = addRoot(doc, stack('vertical'), 800, 400);
  add(doc, s, rect(120, 10, '#3657ff', { layoutChild: { heightMode: 'fill' } }));
  add(doc, s, rect(120, 40, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
  add(doc, s, rect(120, 10, '#4caf50', { layoutChild: { heightMode: 'fill', widthMode: 'fill' } }));
});
fixture('matrix-child-minmax', 'matrix', 'Fill children clamped by min/max width', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  add(doc, s, rect(10, 60, '#3657ff', { layoutChild: { widthMode: 'fill', maxW: 120 } }));
  add(doc, s, rect(10, 60, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
  add(doc, s, rect(10, 60, '#4caf50', { layoutChild: { widthMode: 'fill', minW: 400 } }));
});
fixture('matrix-child-min-height', 'matrix', 'Hug container with min-height and fill child with max-height', doc => {
  const s = addRoot(doc, stack('vertical', { layoutChild: { minH: 300 } }), 800);
  add(doc, s, rect(100, 50));
});
fixture('matrix-child-order', 'matrix', 'Visual order via `order`', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  add(doc, s, rect(100, 60, '#3657ff', { layoutChild: { order: 2 } })); add(doc, s, rect(100, 60, '#ff5722', { layoutChild: { order: 1 } })); add(doc, s, rect(100, 60, '#4caf50'));
});
fixture('matrix-child-align-self', 'matrix', 'alignSelf overrides per child in a row (start container)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(100, 60, '#3657ff', { layoutChild: { alignSelf: 'center' } })); add(doc, s, rect(100, 60, '#ff5722', { layoutChild: { alignSelf: 'end' } })); add(doc, s, rect(100, 60, '#4caf50'));
});
fixture('matrix-hidden-child', 'matrix', 'Hidden child is skipped by the layout', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 150);
  add(doc, s, rect(100, 60)); add(doc, s, rect(100, 60, '#ff5722', { visible: false })); add(doc, s, rect(100, 60, '#4caf50'));
});
fixture('matrix-hug-root', 'matrix', 'Root hugs its width and height (fit-content root)', doc => {
  const s = stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' } });
  s.geometry.w = 100; s.geometry.h = 100; s.fills = [solid('#f6f6f8')];
  model.addNode(doc, s, null);
  add(doc, s, rect(100, 60)); add(doc, s, rect(140, 80, '#ff5722'));
});
fixture('matrix-hug-wrap-limited', 'matrix', 'Hug container with wrap inside a fixed parent: fit-content wraps', doc => {
  const s = addRoot(doc, stack('vertical'), 500, 400, false);
  const h = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { wrap: true, gap: 8 }));
  for (let i = 0; i < 6; i++) add(doc, h, rect(150, 30, i % 2 ? '#3657ff' : '#ff5722'));
});

/* ================================================================== 2. nested / baseline */

fixture('nested-three-levels', 'nested', 'Row > column > row with fills and hugs', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { alignCross: 'stretch' }), 900, 360);
  const side = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'fixed', heightMode: 'fill' }, geometry: geom(0, 0, 220, 100), fills: [solid('#fff')] }, { gap: 8 }));
  add(doc, side, rect(100, 24)); add(doc, side, rect(140, 24, '#ff5722')); add(doc, side, rect(60, 24, '#4caf50', { layoutChild: { heightMode: 'fill' } }));
  const main = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'fill', heightMode: 'fill' }, fills: [solid('#fff')] }, { gap: 16, alignCross: 'stretch' }));
  const row = add(doc, main, stack('horizontal', { layoutChild: { widthMode: 'fill', heightMode: 'hug' } }, { gap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
  add(doc, row, rect(10, 80, '#3657ff', { layoutChild: { widthMode: 'fill' } })); add(doc, row, rect(10, 80, '#ff5722', { layoutChild: { widthMode: 'fill' } })); add(doc, row, rect(10, 80, '#4caf50', { layoutChild: { widthMode: 'fill' } }));
  add(doc, main, rect(10, 10, '#9c27b0', { layoutChild: { widthMode: 'fill', heightMode: 'fill' } }));
}, { pixel: true });
fixture('nested-wrap-space-between', 'nested', 'Wrap + space-between rows inside a column', doc => {
  const s = addRoot(doc, stack('vertical', {}, { gap: 20 }), 700, 400, false);
  for (let r = 0; r < 2; r++) {
    const row = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'fill', heightMode: 'hug' } }, { wrap: true, gap: 'auto', rowGap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
    for (let i = 0; i < 5; i++) add(doc, row, rect(200, 40, i % 2 ? '#3657ff' : '#ff5722'));
  }
});
fixture('nested-baseline-text', 'nested', 'Baseline alignment of three texts of different sizes', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { alignCross: 'baseline', gap: 16 }), 800, 160);
  add(doc, s, text('Large 48', { size: 48, weight: 700 })); add(doc, s, text('medium 24', { size: 24 })); add(doc, s, text('small 14', { size: 14 }));
});
fixture('nested-baseline-mixed', 'nested', 'Baseline alignment: text + rect (synthesised baseline = bottom edge)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { alignCross: 'baseline', gap: 16 }), 800, 160);
  add(doc, s, text('Title 32', { size: 32 })); add(doc, s, rect(60, 24, '#ff5722')); add(doc, s, text('body 16', { size: 16 }));
});
fixture('nested-baseline-container', 'nested', 'Baseline alignment with a nested stack containing text', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { alignCross: 'baseline', gap: 16 }), 800, 200);
  add(doc, s, text('Big 40', { size: 40 }));
  const inner = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 4, padding: { top: 10, right: 10, bottom: 10, left: 10 } }));
  add(doc, inner, text('inner 18', { size: 18 })); add(doc, inner, rect(50, 20, '#4caf50'));
});
fixture('nested-column-stretch-text', 'nested', 'Column with fill-width wrapping texts (fill + autoHeight)', doc => {
  const s = addRoot(doc, stack('vertical', {}, { gap: 12, alignCross: 'stretch' }), 420, undefined, false);
  add(doc, s, text('A fairly long paragraph of text that will wrap over several lines inside the column, exercising the wrapping algorithm.', { size: 16 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } }));
  add(doc, s, text('Second paragraph, shorter.', { size: 14 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } }));
  add(doc, s, rect(10, 40, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
});
fixture('nested-card-grid-like', 'nested', 'Three cards in a row, each a column with image placeholder, title, text and button', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 24, alignCross: 'stretch' }), 960, undefined, false);
  for (let i = 0; i < 3; i++) {
    const card = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'fill', heightMode: 'hug' }, fills: [solid('#fff')], corners: corners(12) }, { gap: 12, alignCross: 'stretch' }));
    add(doc, card, rect(10, 140, '#dfe3f0', { layoutChild: { widthMode: 'fill' } }));
    add(doc, card, text('Card title ' + (i + 1), { size: 20, weight: 600 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } }));
    add(doc, card, text('Some description text that wraps inside the card width and makes the cards different heights ' + 'x'.repeat(i * 10), { size: 14 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } }));
    const btn = add(doc, card, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#3657ff')], corners: corners(8), semantic: { tag: 'button', attrs: {} } }, { padding: { top: 10, right: 18, bottom: 10, left: 18 }, gap: 8, alignCross: 'center' }));
    add(doc, btn, text('Buy', { size: 14, weight: 600, fills: [solid('#fff')] }));
  }
});

/* ================================================================== 3. grids */

fixture('grid-px-fr', 'grid', 'Columns 200px 1fr 2fr, auto rows', doc => {
  const g = addRoot(doc, grid([{ kind: 'px', value: 200 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 2 }]), 800);
  for (let i = 0; i < 6; i++) add(doc, g, rect(50, 40 + (i % 2) * 20, ['#3657ff', '#ff5722', '#4caf50'][i % 3], { layoutChild: { widthMode: 'fill' } }));
}, { pixel: true });
fixture('grid-auto-tracks', 'grid', 'Columns auto auto (stretched auto tracks)', doc => {
  const g = addRoot(doc, grid([{ kind: 'auto' }, { kind: 'auto' }]), 800);
  add(doc, g, rect(100, 40)); add(doc, g, rect(200, 40, '#ff5722')); add(doc, g, rect(150, 40, '#4caf50')); add(doc, g, rect(50, 40, '#9c27b0'));
});
fixture('grid-minmax', 'grid', 'minmax(100px, 1fr) minmax(200px, 300px) auto', doc => {
  const g = addRoot(doc, grid([{ kind: 'minmax', min: { kind: 'px', value: 100 }, max: { kind: 'fr', value: 1 } }, { kind: 'minmax', min: { kind: 'px', value: 200 }, max: { kind: 'px', value: 300 } }, { kind: 'auto' }]), 800);
  for (let i = 0; i < 6; i++) add(doc, g, rect(80, 40, ['#3657ff', '#ff5722', '#4caf50'][i % 3]));
});
fixture('grid-spans', 'grid', 'Explicit areas with column and row spans', doc => {
  const g = addRoot(doc, grid([{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }], [{ kind: 'px', value: 80 }, { kind: 'px', value: 80 }, { kind: 'px', value: 80 }]), 800);
  add(doc, g, rect(10, 10, '#3657ff', { layoutChild: { widthMode: 'fill', heightMode: 'fill', gridArea: { col: 1, colSpan: 2, row: 1, rowSpan: 1 } } }));
  add(doc, g, rect(10, 10, '#ff5722', { layoutChild: { widthMode: 'fill', heightMode: 'fill', gridArea: { col: 3, colSpan: 1, row: 1, rowSpan: 2 } } }));
  add(doc, g, rect(10, 10, '#4caf50', { layoutChild: { widthMode: 'fill', heightMode: 'fill', gridArea: { col: 1, colSpan: 1, row: 2, rowSpan: 2 } } }));
  add(doc, g, rect(10, 10, '#9c27b0', { layoutChild: { widthMode: 'fill', heightMode: 'fill', gridArea: { col: 2, colSpan: 2, row: 3, rowSpan: 1 } } }));
}, { pixel: true });
fixture('grid-self-alignment', 'grid', 'Fixed items with justify-self / align-self in 1fr cells', doc => {
  const g = addRoot(doc, grid([{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }], [{ kind: 'px', value: 120 }]), 800);
  add(doc, g, rect(60, 40, '#3657ff', { layoutChild: { justifySelf: 'start', alignSelf: 'start' } }));
  add(doc, g, rect(60, 40, '#ff5722', { layoutChild: { justifySelf: 'center', alignSelf: 'center' } }));
  add(doc, g, rect(60, 40, '#4caf50', { layoutChild: { justifySelf: 'end', alignSelf: 'end' } }));
});
fixture('grid-gaps-different', 'grid', 'columnGap 30, rowGap 6, 4 columns', doc => {
  const g = addRoot(doc, grid([1, 1, 1, 1].map(() => ({ kind: 'fr', value: 1 })), [], {}, { columnGap: 30, rowGap: 6 }), 800);
  for (let i = 0; i < 10; i++) add(doc, g, rect(10, 30, i % 2 ? '#3657ff' : '#ff5722', { layoutChild: { widthMode: 'fill' } }));
});
fixture('grid-with-text', 'grid', 'Grid rows sized by wrapping text', doc => {
  const g = addRoot(doc, grid([{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]), 600, undefined, false);
  add(doc, g, text('A long text that wraps inside the first grid cell to size the auto row', { size: 16 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } }));
  add(doc, g, rect(10, 30, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
  add(doc, g, rect(10, 30, '#4caf50', { layoutChild: { widthMode: 'fill', heightMode: 'fill' } }));
  add(doc, g, text('Short', { size: 16 }));
});
fixture('grid-nested-stack', 'grid', 'Grid cells containing hug stacks', doc => {
  const g = addRoot(doc, grid([{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]), 800);
  for (let i = 0; i < 4; i++) {
    const c = add(doc, g, stack('vertical', { layoutChild: { widthMode: 'fill', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 6 }));
    add(doc, c, rect(40, 20)); add(doc, c, text('Cell ' + i, { size: 14 }));
  }
});

/* ================================================================== 4. absolute + constraints at 3 breakpoints */

const HC = ['left', 'right', 'leftRight', 'center', 'scale'], VC = ['top', 'bottom', 'topBottom', 'center', 'scale'];
HC.forEach((h, i) => {
  const v = VC[i];
  fixture('absolute-constraint-' + h + '-' + v, 'absolute', 'Constraints ' + h + ' / ' + v + ' in a fill-width frame across 3 breakpoints', doc => {
    const f = addRoot(doc, frameAbs(), 800, 300);
    add(doc, f, rect(120, 60, '#3657ff', { geometry: geom(40, 30, 120, 60), layoutChild: { constraints: { h, v } } }));
    add(doc, f, rect(80, 40, '#ff5722', { geometry: geom(600, 200, 80, 40), layoutChild: { constraints: { h, v } } }));
  });
});
fixture('absolute-constraint-matrix', 'absolute', 'All five horizontal constraints side by side (top)', doc => {
  const f = addRoot(doc, frameAbs(), 1000, 200);
  HC.forEach((h, i) => add(doc, f, rect(80, 40, ['#3657ff', '#ff5722', '#4caf50', '#9c27b0', '#ff9800'][i], { geometry: geom(60 + i * 180, 40, 80, 40), layoutChild: { constraints: { h, v: 'top' } } })));
});
fixture('absolute-constraint-vertical', 'absolute', 'All five vertical constraints stacked (fixed height frame changes height on tablet)', doc => {
  const f = addRoot(doc, frameAbs({ overrides: { tablet: { geometry: { h: 500 } }, phone: { geometry: { h: 400 } } } }), 800, 300);
  VC.forEach((v, i) => add(doc, f, rect(100, 30, ['#3657ff', '#ff5722', '#4caf50', '#9c27b0', '#ff9800'][i], { geometry: geom(40 + i * 140, 40 + i * 40, 100, 30), layoutChild: { constraints: { h: 'left', v } } })));
});
fixture('absolute-in-stack', 'absolute', 'Absolute child inside a stack (relative to the padding box, z-index 1)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(120, 60)); add(doc, s, rect(120, 60, '#ff5722'));
  add(doc, s, rect(40, 40, '#4caf50', { geometry: geom(700, 20, 40, 40), layoutChild: { position: 'absolute', constraints: { h: 'right', v: 'top' } } }));
}, { pixel: true });
fixture('absolute-in-stack-hug', 'absolute', 'Absolute child does not contribute to the hug of its parent', doc => {
  const s = addRoot(doc, stack('vertical', { layoutChild: { widthMode: 'fixed', heightMode: 'hug' } }), 400, undefined, false);
  add(doc, s, rect(120, 60));
  add(doc, s, rect(40, 40, '#4caf50', { geometry: geom(300, 300, 40, 40), layoutChild: { position: 'absolute' } }));
});
fixture('absolute-fill-child', 'absolute', 'Fill width/height child in an absolute frame (width: 100%)', doc => {
  const f = addRoot(doc, frameAbs(), 800, 300);
  add(doc, f, rect(10, 10, '#3657ff', { geometry: geom(0, 0, 10, 10), layoutChild: { widthMode: 'fill', heightMode: 'fill' } }));
  add(doc, f, rect(100, 100, '#ff5722', { geometry: geom(50, 50, 100, 100) }));
});
fixture('absolute-hug-child', 'absolute', 'Hug (fit-content) stack child in an absolute frame', doc => {
  const f = addRoot(doc, frameAbs(), 800, 300);
  const h = add(doc, f, stack('horizontal', { geometry: geom(30, 30, 10, 10), layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }));
  add(doc, h, rect(60, 30)); add(doc, h, text('Hug me', { size: 16 }));
});
fixture('absolute-nested-frames', 'absolute', 'Absolute frames nested with mixed constraints', doc => {
  const f = addRoot(doc, frameAbs(), 800, 400);
  const inner = add(doc, f, frameAbs({ geometry: geom(100, 50, 600, 300), fills: [solid('#fff')], layoutChild: { constraints: { h: 'leftRight', v: 'topBottom' } } }));
  add(doc, inner, rect(100, 50, '#3657ff', { geometry: geom(20, 20, 100, 50), layoutChild: { constraints: { h: 'scale', v: 'scale' } } }));
  add(doc, inner, rect(100, 50, '#ff5722', { geometry: geom(480, 230, 100, 50), layoutChild: { constraints: { h: 'right', v: 'bottom' } } }));
});
fixture('absolute-geometry-override', 'absolute', 'Geometry override on tablet redefines the constraint reference', doc => {
  const f = addRoot(doc, frameAbs(), 800, 300);
  add(doc, f, rect(120, 60, '#3657ff', { geometry: geom(40, 30, 120, 60), layoutChild: { constraints: { h: 'right', v: 'top' } }, overrides: { tablet: { geometry: { x: 500, w: 200 } } } }));
});

/* ================================================================== 5. text modes */

fixture('text-auto-width', 'text', 'Auto width texts (max-content, white-space pre) in a column', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  [12, 14, 16, 18, 24, 32].forEach(sz => add(doc, s, text('The quick brown fox jumps over the lazy dog — ' + sz, { size: sz })));
});
fixture('text-auto-width-bold', 'text', 'Auto width at several weights (Inter 500/600/700)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  [400, 500, 600, 700].forEach(w => add(doc, s, text('Weight ' + w + ' Waterfall AVAWay', { size: 20, weight: w })));
});
fixture('text-auto-width-dejavu', 'text', 'Auto width with DejaVu Sans', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  [14, 18, 24].forEach(sz => add(doc, s, text('DejaVu Sans text sample ' + sz, { size: sz, family: 'DejaVu Sans' })));
  add(doc, s, text('DejaVu Bold sample', { size: 18, family: 'DejaVu Sans', weight: 700 }));
});
fixture('text-auto-height', 'text', 'Auto height: fixed 320px width, wrapping', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Auto height text wraps at three hundred and twenty pixels and grows vertically as needed, with hyphen-ated words and punctuation.', { size: 16 }, { resize: 'autoHeight', geometry: geom(0, 0, 320, 10) }));
  add(doc, s, text('Short one.', { size: 16 }, { resize: 'autoHeight', geometry: geom(0, 0, 320, 10) }));
});
fixture('text-auto-height-anywhere', 'text', 'Auto height with an over-long word (overflow-wrap: anywhere)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Supercalifragilisticexpialidociousandevenlongerthanthat word then normal text', { size: 16 }, { resize: 'autoHeight', geometry: geom(0, 0, 200, 10) }));
});
fixture('text-fixed', 'text', 'Fixed size text boxes (overflow hidden)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, text('Fixed box with a lot of text that overflows the box and is clipped by overflow hidden.', { size: 16 }, { resize: 'fixed', geometry: geom(0, 0, 200, 60), fills: [] }));
  add(doc, s, text('Middle', { size: 16, verticalAlign: 'middle' }, { resize: 'fixed', geometry: geom(0, 0, 200, 100) }));
  add(doc, s, text('Bottom', { size: 16, verticalAlign: 'bottom' }, { resize: 'fixed', geometry: geom(0, 0, 200, 100) }));
});
fixture('text-truncate', 'text', 'Truncate to 2 lines (-webkit-line-clamp)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('This paragraph is clamped to two lines by the line-clamp property; everything after the second line is hidden with an ellipsis in the browser.', { size: 16 }, { resize: 'autoHeight', geometry: geom(0, 0, 300, 10), truncate: { lines: 2 } }));
});
fixture('text-line-height', 'text', 'Line height px / % / auto', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Line height 32px\nsecond line', { size: 16, lineHeight: { unit: 'px', value: 32 } }));
  add(doc, s, text('Line height 150%\nsecond line', { size: 16, lineHeight: { unit: '%', value: 150 } }));
  add(doc, s, text('Line height auto\nsecond line', { size: 16 }));
});
fixture('text-letter-spacing', 'text', 'Letter spacing px and %', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Spaced out letters 2px', { size: 16, letterSpacing: { unit: 'px', value: 2 } }));
  add(doc, s, text('Spaced out letters 10%', { size: 20, letterSpacing: { unit: '%', value: 10 } }));
  add(doc, s, text('Tight letters -1px', { size: 20, letterSpacing: { unit: 'px', value: -1 } }));
});
fixture('text-paragraphs', 'text', 'Multiple paragraphs with paragraph spacing and indent', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('First paragraph\nSecond paragraph\nThird', { size: 16, paragraphSpacing: 12 }));
  add(doc, s, text('Indented first line of a paragraph that wraps\nAnother paragraph', { size: 16, paragraphIndent: 24, paragraphSpacing: 8 }, { resize: 'autoHeight', geometry: geom(0, 0, 260, 10) }));
});
fixture('text-align-case', 'text', 'Text alignment and case transforms in fixed-width boxes', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('centered text', { size: 16, align: 'center' }, { resize: 'autoHeight', geometry: geom(0, 0, 400, 10) }));
  add(doc, s, text('right aligned', { size: 16, align: 'right' }, { resize: 'autoHeight', geometry: geom(0, 0, 400, 10) }));
  add(doc, s, text('upper case words', { size: 16, case: 'upper' }));
  add(doc, s, text('title case words', { size: 16, case: 'title', decoration: 'underline' }));
});
fixture('text-runs', 'text', 'Rich text runs (bold / coloured spans)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  const t = text('x', { size: 18 });
  t.text = { paragraphs: [{ runs: [{ text: 'Regular then ' }, { text: 'bold', style: { weight: 700 } }, { text: ' then ' }, { text: 'red', style: { fills: [solid('#e53935')] } }] }] };
  add(doc, s, t);
});
fixture('text-fill-in-row', 'text', 'Fill-width wrapping text between two fixed rects in a row', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { alignCross: 'center' }), 700, undefined, false);
  add(doc, s, rect(80, 80)); add(doc, s, text('This text fills the remaining space of the row and wraps onto several lines as the width shrinks on narrower breakpoints.', { size: 15 }, { resize: 'autoHeight', layoutChild: { widthMode: 'fill' } })); add(doc, s, rect(80, 80, '#ff5722'));
});
fixture('text-hug-in-row-overflow', 'text', 'Hug stack of texts in a row that is narrower than max-content → fit-content', doc => {
  const s = addRoot(doc, stack('horizontal'), 500, undefined, false);
  add(doc, s, rect(100, 40));
  const h = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 4 }));
  add(doc, h, text('A reasonably long line of text', { size: 16 })); add(doc, h, text('Short', { size: 16 }));
});
fixture('text-semantic-tags', 'text', 'h1 / h2 / p tags with explicit font declarations (UA styles neutralised)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Heading one', { size: 40, weight: 700 }, { semantic: { tag: 'h1', attrs: {} } }));
  add(doc, s, text('Heading two', { size: 28, weight: 600 }, { semantic: { tag: 'h2', attrs: {} } }));
  add(doc, s, text('Paragraph text', { size: 16 }, { semantic: { tag: 'p', attrs: {} } }));
  add(doc, s, text('Link text', { size: 16, fills: [solid('#3657ff')] }, { semantic: { tag: 'a', attrs: { href: '#' } } }));
});
fixture('text-cjk', 'text', 'CJK text wraps per character', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('日本語のテキストは文字ごとに折り返されます。これはテストです。', { size: 18, family: 'DejaVu Sans' }, { resize: 'autoHeight', geometry: geom(0, 0, 240, 10) }));
});

/* ================================================================== 6. rotation */

[15, 45, 90, 137, -30, 180].forEach(a => {
  fixture('rotation-' + (a < 0 ? 'neg' + (-a) : a), 'rotation', 'Rotated rect ' + a + '° in a row (bbox compared)', doc => {
    const s = addRoot(doc, stack('horizontal', {}, { padding: { top: 80, right: 80, bottom: 80, left: 80 }, gap: 60 }), 800, 320);
    add(doc, s, rect(120, 60, '#3657ff', { geometry: geom(0, 0, 120, 60, { rotation: a }) }));
    add(doc, s, rect(100, 100, '#ff5722', { geometry: geom(0, 0, 100, 100, { rotation: a / 2 }) }));
  }, { pixel: a === 45 });
});
fixture('rotation-nested', 'rotation', 'Rotated parent with children (compound transforms)', doc => {
  const f = addRoot(doc, frameAbs(), 800, 400);
  const inner = add(doc, f, stack('horizontal', { geometry: geom(200, 100, 300, 120, { rotation: 20 }), fills: [solid('#fff')] }));
  add(doc, inner, rect(80, 40)); add(doc, inner, rect(80, 40, '#ff5722', { geometry: geom(0, 0, 80, 40, { rotation: -35 }) }));
});
fixture('rotation-flip', 'rotation', 'Flip H / V and rotation combined (transform order rotate·scaleX·scaleY)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { padding: { top: 60, right: 60, bottom: 60, left: 60 }, gap: 60 }), 800, 260);
  add(doc, s, rect(120, 60, '#3657ff', { geometry: geom(0, 0, 120, 60, { flipH: true }) }));
  add(doc, s, rect(120, 60, '#ff5722', { geometry: geom(0, 0, 120, 60, { flipV: true, rotation: 30 }) }));
  add(doc, s, rect(120, 60, '#4caf50', { geometry: geom(0, 0, 120, 60, { flipH: true, flipV: true, rotation: 60 }) }));
});

/* ================================================================== 7. radius clamping */

fixture('radius-uniform', 'radius', 'Uniform radii 0 / 8 / 24', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  [0, 8, 24].forEach(r => add(doc, s, rect(120, 80, '#3657ff', { corners: corners(r) })));
}, { pixel: true });
fixture('radius-clamp-large', 'radius', 'Radius larger than half the box (clamped to w/2, h/2)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(120, 60, '#3657ff', { corners: corners(100) })); add(doc, s, rect(60, 120, '#ff5722', { corners: corners(500) }));
}, { pixel: true });
fixture('radius-mixed', 'radius', 'Independent radii with adjacent sum exceeding the side (proportional reduction)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(120, 80, '#3657ff', { corners: corners({ tl: 100, tr: 60, br: 0, bl: 20 }) }));
  add(doc, s, rect(120, 80, '#ff5722', { corners: corners({ tl: 0, tr: 0, br: 40, bl: 40 }) }));
}, { pixel: true });
fixture('radius-ellipse', 'radius', 'Ellipse nodes (border-radius 50%)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, model.createNode('ellipse', { id: id(), geometry: geom(0, 0, 100, 100), fills: [solid('#3657ff')] }));
  add(doc, s, model.createNode('ellipse', { id: id(), geometry: geom(0, 0, 160, 80), fills: [solid('#ff5722')] }));
}, { pixel: true });

/* ================================================================== 8. squircle */

fixture('squircle-basic', 'squircle', 'Smoothing 0.6 (iOS) on 24px radius', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(160, 120, '#3657ff', { corners: corners(24, 0.6) })); add(doc, s, rect(160, 120, '#ff5722', { corners: corners(24, 1) })); add(doc, s, rect(160, 120, '#4caf50', { corners: corners(24, 0.3) }));
}, { pixel: true });
fixture('squircle-large-radius', 'squircle', 'Smoothing with radius hitting the budget (min(w,h)/2)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(200, 80, '#3657ff', { corners: corners(40, 0.6) })); add(doc, s, rect(100, 100, '#ff5722', { corners: corners(50, 0.6) }));
}, { pixel: true });
fixture('squircle-shadow', 'squircle', 'Squircle + drop shadow → wrapper with filter: drop-shadow', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 240);
  add(doc, s, rect(160, 120, '#3657ff', { corners: corners(24, 0.6), effects: [shadow(0, 8, 24, 0, model.color(0, 0, 0, 0.3))] }));
  add(doc, s, rect(160, 120, '#ff5722', { corners: corners(24, 0.6), effects: [shadow(4, 4, 0, 0, model.color(0, 0, 0, 0.5))] }));
});
fixture('squircle-stroke', 'squircle', 'Squircle + inside stroke (box-shadow inset follows border-radius: flagged)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(160, 120, '#3657ff', { corners: corners(24, 0.6), strokes: [stroke('#111', 3, 'inside')] }));
});
fixture('squircle-responsive', 'squircle', 'Squircle on a fill-width node: path recomputed per breakpoint', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, rect(10, 120, '#3657ff', { corners: corners(32, 0.6), layoutChild: { widthMode: 'fill' } }));
});

/* ================================================================== 9. strokes */

['inside', 'center', 'outside'].forEach(al => {
  fixture('stroke-' + al, 'stroke', 'Solid stroke ' + al + ' (box-shadow), radius 12', doc => {
    const s = addRoot(doc, stack('horizontal'), 800, 200);
    add(doc, s, rect(160, 100, '#fff', { corners: corners(12), strokes: [stroke('#3657ff', 6, al)] }));
    add(doc, s, rect(160, 100, '#fff', { strokes: [stroke('#ff5722', 1, al)] }));
  }, { pixel: true });
});
fixture('stroke-dashed-inside', 'stroke', 'Dashed inside stroke → real border (content box shrinks: children offset)', doc => {
  const s = addRoot(doc, stack('horizontal', { strokes: [stroke('#3657ff', 4, 'inside', { dash: [8, 4] })] }), 800, 200);
  add(doc, s, rect(100, 60)); add(doc, s, rect(100, 60, '#ff5722'));
});
fixture('stroke-dashed-outside', 'stroke', 'Dashed center / outside strokes → outline + outline-offset', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(160, 100, '#fff', { strokes: [stroke('#3657ff', 4, 'outside', { dash: [8, 4] })] }));
  add(doc, s, rect(160, 100, '#fff', { strokes: [stroke('#ff5722', 4, 'center', { dash: [8, 4] })] }));
});
fixture('stroke-per-side', 'stroke', 'Per-side widths (border-top/right/bottom/left) on a container with absolute child', doc => {
  const f = addRoot(doc, frameAbs({ strokes: [{ paint: solid('#3657ff'), width: { top: 2, right: 8, bottom: 4, left: 16 }, align: 'inside', cap: 'butt', join: 'miter', visible: true }] }), 800, 200);
  add(doc, f, rect(100, 60, '#ff5722', { geometry: geom(30, 30, 100, 60) }));
});
fixture('stroke-per-side-stack', 'stroke', 'Per-side border on a stack: flow children offset by the border', doc => {
  const s = addRoot(doc, stack('horizontal', { strokes: [{ paint: solid('#3657ff'), width: { top: 10, right: 0, bottom: 0, left: 30 }, align: 'inside', cap: 'butt', join: 'miter', visible: true }] }), 800, 200);
  add(doc, s, rect(100, 60)); add(doc, s, rect(100, 60, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
});
fixture('stroke-gradient', 'stroke', 'Gradient border (background padding-box / border-box)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(200, 100, '#fff', { corners: corners(16), strokes: [{ paint: linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0 }, { x: 1, y: 1 }), width: 4, align: 'inside', cap: 'butt', join: 'miter', visible: true }] }));
});
fixture('stroke-multiple', 'stroke', 'Two strokes + drop shadow in one box-shadow list', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(160, 100, '#fff', { corners: corners(8), strokes: [stroke('#3657ff', 2, 'inside'), stroke('#ff5722', 4, 'outside')], effects: [shadow(0, 6, 16, 0, model.color(0, 0, 0, 0.25))] }));
}, { pixel: true });
fixture('stroke-line', 'stroke', 'Line nodes (h = 0, stroke only)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, model.createNode('line', { id: id(), geometry: geom(0, 0, 300, 0), strokes: [stroke('#3657ff', 2, 'center')] }));
  add(doc, s, rect(100, 40, '#ff5722'));
  add(doc, s, model.createNode('line', { id: id(), geometry: geom(0, 0, 300, 0), strokes: [stroke('#111', 1, 'center')] }));
});

/* ================================================================== 10. shadows + blur */

fixture('shadow-drop', 'shadow', 'Drop shadows: offset, blur, spread', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 60, padding: { top: 60, right: 60, bottom: 60, left: 60 } }), 800, 260);
  add(doc, s, rect(140, 100, '#fff', { corners: corners(12), effects: [shadow(0, 4, 12, 0, model.color(0, 0, 0, 0.25))] }));
  add(doc, s, rect(140, 100, '#fff', { corners: corners(12), effects: [shadow(10, 10, 0, 0, model.color(0.2, 0.3, 1, 1))] }));
  add(doc, s, rect(140, 100, '#fff', { corners: corners(12), effects: [shadow(0, 0, 20, 8, model.color(1, 0.3, 0.1, 0.6))] }));
}, { pixel: true });
fixture('shadow-inner', 'shadow', 'Inner shadows', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 60, padding: { top: 60, right: 60, bottom: 60, left: 60 } }), 800, 260);
  add(doc, s, rect(140, 100, '#fff', { corners: corners(12), effects: [{ type: 'innerShadow', x: 0, y: 4, blur: 12, spread: 0, color: model.color(0, 0, 0, 0.4), visible: true }] }));
  add(doc, s, rect(140, 100, '#3657ff', { effects: [{ type: 'innerShadow', x: 6, y: 6, blur: 0, spread: 2, color: model.color(0, 0, 0, 0.5), visible: true }] }));
}, { pixel: true });
fixture('shadow-multiple', 'shadow', 'Several shadows, first on top', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { padding: { top: 80, right: 80, bottom: 80, left: 80 } }), 800, 300);
  add(doc, s, rect(200, 120, '#fff', { corners: corners(16), effects: [shadow(0, 1, 2, 0, model.color(0, 0, 0, 0.3)), shadow(0, 8, 24, -4, model.color(0, 0, 0, 0.25)), shadow(0, 24, 48, 0, model.color(0.2, 0.3, 1, 0.3))] }));
}, { pixel: true });
fixture('shadow-on-group', 'shadow', 'Shadow + opacity on a container with children (group compositing)', doc => {
  const f = addRoot(doc, frameAbs(), 800, 300);
  const g = add(doc, f, stack('horizontal', { geometry: geom(100, 60, 400, 160), opacity: 0.6, fills: [solid('#fff')], corners: corners(20), effects: [shadow(0, 10, 30, 0, model.color(0, 0, 0, 0.4))] }));
  add(doc, g, rect(100, 100)); add(doc, g, rect(100, 100, '#ff5722'));
}, { pixel: true });
[4, 8, 16, 24, 40].forEach(r => {
  fixture('blur-disc-' + r, 'blur', 'Layer blur radius ' + r + ' on a disc (K_BLUR calibration fixture)', doc => {
    const f = addRoot(doc, frameAbs(), 400, 300, false);
    add(doc, f, model.createNode('ellipse', { id: id(), geometry: geom(100, 50, 200, 200), fills: [solid('#3657ff')], effects: [{ type: 'layerBlur', radius: r, visible: true }] }));
  }, { pixel: true });
});
fixture('blur-background', 'blur', 'Background blur over a gradient (backdrop-filter)', doc => {
  const f = addRoot(doc, frameAbs({ fills: [linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0 }, { x: 1, y: 0 })] }), 600, 300, false);
  add(doc, f, rect(300, 150, '#fff', { geometry: geom(150, 75, 300, 150), fills: [solid('#ffffff', 0.4)], corners: corners(16), effects: [{ type: 'backgroundBlur', radius: 20, visible: true }] }));
});
fixture('blur-layer-rect', 'blur', 'Layer blur on a rectangle with children', doc => {
  const f = addRoot(doc, frameAbs(), 600, 300, false);
  const g = add(doc, f, stack('horizontal', { geometry: geom(100, 60, 400, 160), fills: [solid('#fff')], effects: [{ type: 'layerBlur', radius: 6, visible: true }] }));
  add(doc, g, rect(100, 100)); add(doc, g, rect(100, 100, '#ff5722'));
}, { pixel: true });

/* ================================================================== 11. gradients */

const ANGLES = [{ s: { x: 0, y: 0.5 }, e: { x: 1, y: 0.5 }, n: '90' }, { s: { x: 0.5, y: 1 }, e: { x: 0.5, y: 0 }, n: '0' }, { s: { x: 0, y: 0 }, e: { x: 1, y: 1 }, n: 'diag' }, { s: { x: 1, y: 1 }, e: { x: 0, y: 0 }, n: 'diag-rev' },
  { s: { x: -0.3, y: 0.2 }, e: { x: 1.4, y: 0.7 }, n: 'off-box-1' }, { s: { x: 0.2, y: -0.5 }, e: { x: 0.9, y: 1.6 }, n: 'off-box-2' }, { s: { x: 0.3, y: 0.3 }, e: { x: 0.6, y: 0.8 }, n: 'inside-short' }, { s: { x: 1.2, y: -0.2 }, e: { x: -0.4, y: 1.1 }, n: 'off-box-3' }];
ANGLES.forEach(a => {
  fixture('gradient-linear-' + a.n, 'gradient', 'Linear gradient handles ' + JSON.stringify(a.s) + ' → ' + JSON.stringify(a.e) + ' (exact angle + stop remap)', doc => {
    const s = addRoot(doc, stack('horizontal'), 600, 260, false);
    add(doc, s, rect(240, 160, '#fff', { fills: [linear([[0, '#3657ff'], [0.5, '#ffffff'], [1, '#ff5722']], a.s, a.e)] }));
    add(doc, s, rect(160, 200, '#fff', { fills: [linear([[0, '#111111'], [1, '#4caf50']], a.s, a.e)] }));
  }, { pixel: true });
});
fixture('gradient-radial', 'gradient', 'Radial gradient (ellipse radii from handles)', doc => {
  const s = addRoot(doc, stack('horizontal'), 600, 260, false);
  add(doc, s, rect(240, 160, '#fff', { fills: [{ type: 'radial', stops: [{ position: 0, color: hex('#ffffff') }, { position: 1, color: hex('#3657ff') }], start: { x: 0.5, y: 0.5 }, radius: { x: 0.5, y: 0.5 }, opacity: 1, blend: 'normal', visible: true }] }));
  add(doc, s, rect(240, 160, '#fff', { fills: [{ type: 'radial', stops: [{ position: 0, color: hex('#ff5722') }, { position: 1, color: hex('#111111') }], start: { x: 0.3, y: 0.4 }, radius: { x: 0.6, y: 0.3 }, opacity: 1, blend: 'normal', visible: true }] }));
}, { pixel: true });
fixture('gradient-conic', 'gradient', 'Angular (conic) gradient', doc => {
  const s = addRoot(doc, stack('horizontal'), 600, 260, false);
  add(doc, s, rect(200, 200, '#fff', { fills: [{ type: 'angular', stops: [{ position: 0, color: hex('#3657ff') }, { position: 0.5, color: hex('#ff5722') }, { position: 1, color: hex('#3657ff') }], start: { x: 0.5, y: 0.5 }, end: { x: 1, y: 0.5 }, opacity: 1, blend: 'normal', visible: true }], corners: corners(100) }));
}, { pixel: true });
fixture('gradient-multi-fill', 'gradient', 'Stacked fills: solid under a semi-transparent gradient with multiply blend', doc => {
  const s = addRoot(doc, stack('horizontal'), 600, 260, false);
  add(doc, s, rect(300, 160, '#fff', { fills: [solid('#ffcc00'), linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0 }, { x: 1, y: 0 }, { opacity: 0.6 })] }));
  add(doc, s, rect(200, 160, '#fff', { fills: [solid('#ffcc00'), linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0 }, { x: 0, y: 1 }, { blend: 'multiply' })] }));
}, { pixel: true });
fixture('gradient-stops-outside', 'gradient', 'Stops projected outside [0,1] on a tall box', doc => {
  const s = addRoot(doc, stack('horizontal'), 600, 320, false);
  add(doc, s, rect(120, 280, '#fff', { fills: [linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0.4 }, { x: 1, y: 0.6 })] }));
}, { pixel: true });
fixture('gradient-text', 'gradient', 'Gradient text fill (background-clip: text)', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Gradient headline', { size: 40, weight: 700, fills: [linear([[0, '#3657ff'], [1, '#ff5722']], { x: 0, y: 0.5 }, { x: 1, y: 0.5 })] }));
});

/* ================================================================== 12. blend modes */

const BLENDS = ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'colorDodge', 'colorBurn', 'hardLight', 'softLight', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'linearDodge', 'linearBurn'];
BLENDS.forEach(b => {
  fixture('blend-' + b, 'blend', 'Blend mode ' + b + ' of an orange rect over a blue one', doc => {
    const f = addRoot(doc, frameAbs({ fills: [solid('#ffffff')] }), 300, 200, false);
    add(doc, f, rect(160, 120, '#3657ff', { geometry: geom(20, 40, 160, 120) }));
    add(doc, f, rect(160, 120, '#ff5722', { geometry: geom(120, 20, 160, 120), blendMode: b }));
  }, { pixel: ['multiply', 'screen', 'difference', 'overlay'].indexOf(b) >= 0 });
});
fixture('blend-group-isolate', 'blend', 'Normal group isolates (isolation: isolate), pass-through does not', doc => {
  const f = addRoot(doc, frameAbs({ fills: [solid('#3657ff')] }), 400, 200, false);
  const g = add(doc, f, frameAbs({ geometry: geom(20, 20, 160, 160), blendMode: 'normal', fills: [] }));
  add(doc, g, rect(120, 120, '#ff5722', { geometry: geom(20, 20, 120, 120), blendMode: 'multiply' }));
  const p = add(doc, f, frameAbs({ geometry: geom(220, 20, 160, 160), blendMode: 'passThrough', fills: [] }));
  add(doc, p, rect(120, 120, '#ff5722', { geometry: geom(20, 20, 120, 120), blendMode: 'multiply' }));
}, { pixel: true });
fixture('blend-opacity', 'blend', 'Layer opacity vs fill opacity (rgba)', doc => {
  const f = addRoot(doc, frameAbs({ fills: [solid('#ffffff')] }), 400, 200, false);
  add(doc, f, rect(160, 120, '#3657ff', { geometry: geom(20, 40, 160, 120), opacity: 0.5 }));
  add(doc, f, rect(160, 120, '#3657ff', { geometry: geom(220, 40, 160, 120), fills: [solid('#3657ff', 0.5)] }));
}, { pixel: true });

/* ================================================================== 13. states */

fixture('state-hover-fill', 'state', 'Hover state: fill, shadow and scale (transition with cubic-bezier)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  const btn = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#3657ff')], corners: corners(8), semantic: { tag: 'button', attrs: {} }, states: { hover: { fills: [solid('#2440c9')], effects: [shadow(0, 6, 16, -6, model.color(0, 0, 0, 0.35))] }, pressed: { transform: { scale: 0.97 } }, disabled: { opacity: 0.5 } }, animation: { trigger: 'hover', duration: 180, easing: { kind: 'bezier', p1x: 0.2, p1y: 0.8, p2x: 0.2, p2y: 1 } } }, { padding: { top: 12, right: 20, bottom: 12, left: 20 } }));
  add(doc, btn, text('Hover me', { size: 16, weight: 600, fills: [solid('#fff')] }));
});
fixture('state-spring-transition', 'state', 'Spring easing exported as linear()', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  add(doc, s, rect(120, 60, '#3657ff', { states: { hover: { fills: [solid('#ff5722')], geometry: { rotation: 10 } } }, animation: { trigger: 'hover', easing: { kind: 'spring', mass: 1, stiffness: 100, damping: 10 } } }));
});
fixture('state-custom-and-checked', 'state', 'Custom state ([data-state]) and checked ([aria-checked])', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  add(doc, s, rect(120, 60, '#3657ff', { states: { selected: { fills: [solid('#4caf50')] }, checked: { strokes: [stroke('#111', 2, 'inside')] }, focused: { strokes: [stroke('#3657ff', 2, 'outside')] } } }));
});
fixture('state-breakpoint-override', 'state', 'Hover removed on phone (state override per breakpoint)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  add(doc, s, rect(120, 60, '#3657ff', { states: { hover: { fills: [solid('#ff5722')] } }, overrides: { phone: { states: { hover: { fills: [solid('#3657ff')] } } } } }));
});

/* ================================================================== 14. tokens */

const TOKENS = {
  sets: [{ id: 'core', name: 'Core', tokens: {
    'color.brand.500': { type: 'color', valueByMode: { light: '#3657ff', dark: '#8fa3ff' } },
    'color.brand.600': { type: 'color', valueByMode: { light: { alias: '{color.brand.500}' }, dark: { alias: '{color.brand.500}' } } },
    'color.surface': { type: 'color', valueByMode: { light: '#ffffff', dark: '#1e1e1e' } },
    'space.4': { type: 'dimension', valueByMode: { light: { value: 16, unit: 'px' }, dark: { value: 16, unit: 'px' } } },
    'space.2': { type: 'dimension', valueByMode: { light: 8, dark: 8 } },
    'radius.md': { type: 'dimension', valueByMode: { light: 12, dark: 12 } },
    'font.body': { type: 'fontFamily', valueByMode: { light: 'Inter', dark: 'Inter' } },
    'size.md': { type: 'dimension', valueByMode: { light: 18, dark: 18 } }
  } }],
  modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
  activeMode: { core: 'light' }
};
fixture('token-colors-dimensions', 'token', 'Token refs on fills, padding, gap, radius → var() and :root', doc => {
  const s = addRoot(doc, stack('horizontal', { fills: [solid({ ref: 'color.surface' })] }, { gap: { ref: 'space.2' }, padding: { top: { ref: 'space.4' }, right: { ref: 'space.4' }, bottom: { ref: 'space.4' }, left: { ref: 'space.4' } } }), 800, 160);
  add(doc, s, rect(120, 60, '#000', { fills: [solid({ ref: 'color.brand.500' })], corners: { tl: { ref: 'radius.md' }, tr: { ref: 'radius.md' }, br: { ref: 'radius.md' }, bl: { ref: 'radius.md' }, smoothing: 0 } }));
  add(doc, s, rect(120, 60, '#000', { fills: [solid({ ref: 'color.brand.600' })] }));
  add(doc, s, text('Token text', { family: { ref: 'font.body' }, size: { ref: 'size.md' } }));
}, { tokens: JSON.parse(JSON.stringify(TOKENS)) });
fixture('token-dark-mode', 'token', 'Same document with dark mode active (values resolved in the layout, vars in CSS)', doc => {
  const s = addRoot(doc, stack('horizontal', { fills: [solid({ ref: 'color.surface' })] }, { gap: { ref: 'space.2' } }), 800, 160);
  add(doc, s, rect(120, 60, '#000', { fills: [solid({ ref: 'color.brand.500' })] }));
}, { tokens: Object.assign(JSON.parse(JSON.stringify(TOKENS)), { activeMode: { core: 'dark' } }) });

/* ================================================================== 15. responsive overrides */

fixture('responsive-direction', 'responsive', 'Row on desktop, column on phone (layoutParent override)', doc => {
  const s = addRoot(doc, stack('horizontal', { overrides: { phone: { layoutParent: { direction: 'vertical', gap: 8 } } } }), 800);
  add(doc, s, rect(200, 80)); add(doc, s, rect(200, 80, '#ff5722')); add(doc, s, rect(200, 80, '#4caf50'));
});
fixture('responsive-visibility', 'responsive', 'Child hidden on tablet and phone, another shown only on phone', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 160);
  add(doc, s, rect(200, 80)); add(doc, s, rect(200, 80, '#ff5722', { overrides: { tablet: { visible: false } } })); add(doc, s, rect(200, 80, '#4caf50', { visible: false, overrides: { phone: { visible: true } } }));
});
fixture('responsive-padding-cascade', 'responsive', 'Padding 64 → 40 (tablet) → 20 (phone), width 1200 → 100%', doc => {
  const s = addRoot(doc, stack('vertical', { layoutChild: { widthMode: 'fixed', heightMode: 'hug' }, overrides: { tablet: { layoutChild: { widthMode: 'fill' }, layoutParent: { padding: { top: 40, right: 40, bottom: 40, left: 40 } } }, phone: { layoutParent: { padding: { top: 20, right: 20, bottom: 20, left: 20 } } } } }, { padding: { top: 64, right: 64, bottom: 64, left: 64 } }), 1200, undefined, false);
  add(doc, s, rect(10, 80, '#3657ff', { layoutChild: { widthMode: 'fill' } }));
});
fixture('responsive-size-override', 'responsive', 'Child width / radius / fill override per breakpoint (merged geometry)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, rect(300, 100, '#3657ff', { corners: corners(0), overrides: { tablet: { geometry: { w: 200 }, corners: corners(24) }, phone: { geometry: { h: 60 }, fills: [solid('#ff5722')] } } }));
});
fixture('responsive-text-size', 'responsive', 'Text size override per breakpoint', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Responsive headline', { size: 48, weight: 700 }, { overrides: { tablet: { text: { size: 36 } }, phone: { text: { size: 28, weight: 600 } } } }));
});
fixture('responsive-custom-breakpoints', 'responsive', 'Custom breakpoints 1280 / 1024 / 600 / 360', doc => {
  const s = addRoot(doc, stack('horizontal', { overrides: { md: { layoutParent: { gap: 4 } }, xs: { layoutParent: { direction: 'vertical' } } } }), 800, undefined);
  add(doc, s, rect(10, 60, '#3657ff', { layoutChild: { widthMode: 'fill' } })); add(doc, s, rect(10, 60, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
}, { breakpoints: [{ id: 'base', name: 'XL', width: 1280 }, { id: 'lg', name: 'LG', width: 1024 }, { id: 'md', name: 'MD', width: 600 }, { id: 'xs', name: 'XS', width: 360 }] });

/* ================================================================== 16. images / shapes / semantic */

const SVG_DATA = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#3657ff"/><circle cx="100" cy="60" r="40" fill="#ff5722"/></svg>');
fixture('image-node-fits', 'image', 'ImageNode (<img>) with cover / contain', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, model.createNode('image', { id: id(), geometry: geom(0, 0, 160, 160), asset: 'img1', fit: 'fill', alt: 'cover' }));
  add(doc, s, model.createNode('image', { id: id(), geometry: geom(0, 0, 160, 160), asset: 'img1', fit: 'fit', alt: 'contain' }));
  add(doc, s, model.createNode('image', { id: id(), geometry: geom(0, 0, 10, 10), asset: 'img1', fit: 'fill', alt: 'intrinsic', layoutChild: { widthMode: 'hug', heightMode: 'hug' } }));
}, { assets: { img1: { type: 'image', url: SVG_DATA, width: 200, height: 120 } } });
fixture('image-fill-paint', 'image', 'Image fills on rects (background-size cover / contain / tile)', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  ['fill', 'fit', 'tile'].forEach(fit => add(doc, s, rect(160, 120, '#fff', { fills: [{ type: 'image', asset: 'img1', fit, scale: 0.5, opacity: 1, blend: 'normal', visible: true }] })));
}, { assets: { img1: { type: 'image', url: SVG_DATA, width: 200, height: 120 } } });
fixture('shape-vector', 'image', 'Vector node rendered as inline SVG', doc => {
  const s = addRoot(doc, stack('horizontal'), 800, 200);
  add(doc, s, model.createNode('vector', { id: id(), geometry: geom(0, 0, 120, 120), network: { paths: [{ d: 'M60 0 L120 120 L0 120 Z', fill: '#3657ff' }] }, fillRule: 'nonzero' }));
  add(doc, s, rect(100, 100, '#ff5722'));
});
fixture('semantic-landing', 'image', 'A small landing section: header nav, hero with heading, paragraph, buttons', doc => {
  const page = addRoot(doc, stack('vertical', { semantic: { tag: 'main', attrs: {} } }, { gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignCross: 'stretch' }), 1200);
  const header = add(doc, page, stack('horizontal', { layoutChild: { widthMode: 'fill', heightMode: 'hug' }, semantic: { tag: 'header', attrs: {} }, fills: [solid('#fff')] }, { gap: 'auto', alignCross: 'center', padding: { top: 16, right: 40, bottom: 16, left: 40 } }));
  add(doc, header, text('Jeere', { size: 22, weight: 700 }));
  const nav = add(doc, header, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, semantic: { tag: 'nav', attrs: {} } }, { gap: 24, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
  ['Boutique', 'Tarifs', 'Aide'].forEach(l => add(doc, nav, text(l, { size: 15 }, { semantic: { tag: 'a', attrs: { href: '#' } } })));
  const hero = add(doc, page, stack('vertical', { layoutChild: { widthMode: 'fill', heightMode: 'hug' }, semantic: { tag: 'section', attrs: {} }, fills: [solid('#f3f5ff')] }, { gap: 20, alignCross: 'center', padding: { top: 80, right: 40, bottom: 80, left: 40 } }));
  add(doc, hero, text('Vendez en ligne en dix minutes', { size: 48, weight: 700, align: 'center' }, { semantic: { tag: 'h1', attrs: {} }, resize: 'autoHeight', geometry: geom(0, 0, 640, 10), overrides: { phone: { text: { size: 32 }, geometry: { w: 320 } } } }));
  add(doc, hero, text('Une boutique mobile-first, paiement mobile money intégré, sans frais cachés. Un texte un peu long pour obtenir un retour à la ligne.', { size: 18, align: 'center' }, { semantic: { tag: 'p', attrs: {} }, resize: 'autoHeight', geometry: geom(0, 0, 560, 10), overrides: { phone: { geometry: { w: 320 } } } }));
  const ctas = add(doc, hero, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' } }, { gap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
  const b1 = add(doc, ctas, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#3657ff')], corners: corners(10), semantic: { tag: 'button', attrs: {} } }, { padding: { top: 14, right: 24, bottom: 14, left: 24 } }));
  add(doc, b1, text('Commencer', { size: 16, weight: 600, fills: [solid('#fff')] }));
  const b2 = add(doc, ctas, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')], corners: corners(10), strokes: [stroke('#3657ff', 1.5, 'inside')], semantic: { tag: 'a', attrs: { href: '#' } } }, { padding: { top: 14, right: 24, bottom: 14, left: 24 } }));
  add(doc, b2, text('Voir la démo', { size: 16, weight: 600, fills: [solid('#3657ff')] }));
});

/* ================================================================== 17. extension set (→ 200+, Annexe C exit criterion) */

// gradients at 8 exact CSS angles, handles running beyond the box on both ends
[0, 45, 90, 135, 180, 225, 270, 315].forEach(deg => {
  const t = deg * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t), k = 0.8;
  fixture('gradient-angle-' + deg, 'gradient', 'Linear gradient at ' + deg + '° with off-box handles (centre ± 0.8·dir)', doc => {
    const s = addRoot(doc, stack('horizontal'), 600, 260, false);
    const st = { x: 0.5 - k * ux, y: 0.5 - k * uy }, en = { x: 0.5 + k * ux, y: 0.5 + k * uy };
    add(doc, s, rect(240, 160, '#fff', { fills: [linear([[0, '#3657ff'], [0.35, '#ffffff'], [1, '#ff5722']], st, en)] }));
    add(doc, s, rect(120, 200, '#fff', { corners: corners(16), fills: [linear([[0.1, '#111111'], [0.9, '#4caf50']], st, en)] }));
  }, { pixel: true });
});
// remaining blend modes, pixel-compared
['darken', 'lighten', 'colorDodge', 'colorBurn', 'hardLight', 'softLight', 'exclusion'].forEach(b => {
  fixture('blend-px-' + b, 'blend', 'Blend mode ' + b + ' (pixel-compared) of a green rect over a gradient', doc => {
    const f = addRoot(doc, frameAbs({ fills: [linear([[0, '#3657ff'], [1, '#ffcc00']], { x: 0, y: 0 }, { x: 1, y: 0 })] }), 300, 200, false);
    add(doc, f, rect(160, 120, '#4caf50', { geometry: geom(70, 40, 160, 120), blendMode: b, corners: corners(12) }));
  }, { pixel: true });
});
fixture('rotation-shadow', 'rotation', 'Rotated rects carrying drop and inner shadows (shadow offsets stay in page space)', doc => {
  const f = addRoot(doc, frameAbs(), 600, 300, false);
  add(doc, f, rect(160, 100, '#fff', { geometry: geom(60, 80, 160, 100, { rotation: 30 }), corners: corners(12), effects: [shadow(0, 8, 16, 0, model.color(0, 0, 0, 0.3))] }));
  add(doc, f, rect(160, 100, '#3657ff', { geometry: geom(340, 80, 160, 100, { rotation: -20 }), effects: [{ type: 'innerShadow', x: 4, y: 6, blur: 8, spread: 0, color: model.color(0, 0, 0, 0.5), visible: true }] }));
}, { pixel: true });
fixture('rotation-stroke-radius', 'rotation', 'Rotated rect with outside stroke and radius', doc => {
  const f = addRoot(doc, frameAbs(), 400, 300, false);
  add(doc, f, rect(180, 120, '#ffcc00', { geometry: geom(110, 90, 180, 120, { rotation: 15 }), corners: corners(20), strokes: [stroke('#111111', 4, 'outside')] }));
}, { pixel: true });
fixture('shadow-spread-negative', 'shadow', 'Negative spread + inner shadow with spread on rounded boxes', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 60, padding: { top: 60, right: 60, bottom: 60, left: 60 } }), 800, 280);
  add(doc, s, rect(160, 120, '#fff', { corners: corners(20), effects: [shadow(0, 16, 24, -8, model.color(0, 0, 0, 0.45))] }));
  add(doc, s, rect(160, 120, '#fff', { corners: corners(20), effects: [{ type: 'innerShadow', x: 0, y: 0, blur: 16, spread: 6, color: model.color(0.2, 0.3, 1, 0.6), visible: true }] }));
}, { pixel: true });
fixture('stroke-center-radius-px', 'stroke', 'Centre strokes of 2 / 8 px on rounded and square boxes', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 40, padding: { top: 40, right: 40, bottom: 40, left: 40 } }), 800, 220);
  add(doc, s, rect(160, 120, '#e8ecff', { corners: corners(24), strokes: [stroke('#3657ff', 8, 'center')] }));
  add(doc, s, rect(160, 120, '#fff3e0', { strokes: [stroke('#ff5722', 2, 'center')] }));
}, { pixel: true });
fixture('radius-clamp-mixed-px', 'radius', 'Pill (radius 999) and per-corner radii summing past the side', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 30, padding: { top: 40, right: 40, bottom: 40, left: 40 } }), 800, 220);
  add(doc, s, rect(240, 64, '#3657ff', { corners: corners(999) }));
  add(doc, s, rect(140, 140, '#ff5722', { corners: corners({ tl: 140, tr: 0, br: 140, bl: 0 }) }));
}, { pixel: true });
fixture('nested-pixel-card', 'nested', 'Card: stack with radius, clip, shadow and three nested rows (pixel)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { padding: { top: 40, right: 40, bottom: 40, left: 40 } }), 800, 320);
  const card = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'fixed', heightMode: 'hug' }, geometry: geom(0, 0, 320, 10), fills: [solid('#fff')], corners: corners(16), effects: [shadow(0, 4, 16, 0, model.color(0, 0, 0, 0.15))] }, { clip: true, gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignCross: 'stretch' }));
  add(doc, card, rect(10, 120, '#3657ff', { layoutChild: { widthMode: 'fill' } }));
  const row = add(doc, card, stack('horizontal', { layoutChild: { widthMode: 'fill', heightMode: 'hug' } }, { gap: 8 }));
  add(doc, row, rect(40, 40, '#ff5722', { corners: corners(20) })); add(doc, row, rect(10, 40, '#eeeeee', { layoutChild: { widthMode: 'fill' } }));
  add(doc, card, rect(10, 24, '#4caf50', { layoutChild: { widthMode: 'fill' } }));
}, { pixel: true });
fixture('matrix-wrap-column-stretch', 'matrix', 'Vertical wrap, fixed width, stretch: fill-width items stretch to their column line', doc => {
  const s = addRoot(doc, stack('vertical', {}, { wrap: true, gap: 10, alignCross: 'stretch' }), 800, 300);
  for (let i = 0; i < 7; i++) add(doc, s, rect(120 + (i % 3) * 30, 70, ['#3657ff', '#ff5722', '#4caf50'][i % 3], { layoutChild: { widthMode: i % 2 ? 'fill' : 'fixed' } }));
});
fixture('matrix-wrap-hug-stretch', 'matrix', 'Wrap with hug height + stretch: lines sized by content, fill items stretch to the line', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { wrap: true, gap: 12, rowGap: 8, alignCross: 'stretch' }), 800);
  for (let i = 0; i < 8; i++) add(doc, s, rect(170, 30 + (i % 4) * 15, ['#3657ff', '#ff5722', '#4caf50', '#9c27b0'][i % 4], { layoutChild: { heightMode: i % 3 === 0 ? 'fill' : 'fixed' } }));
});
fixture('text-cjk-mixed', 'text', 'Mixed Latin + CJK paragraphs (fallback font widens the line box) at 14 and 24 px', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('Jeere ストア — 東京でも Dakar でも。モバイルマネー対応のオンラインショップ。', { size: 14, family: 'DejaVu Sans' }, { resize: 'autoHeight', geometry: geom(0, 0, 220, 10) }));
  add(doc, s, text('中文测试：每个汉字都可以换行。', { size: 24, family: 'DejaVu Sans' }, { resize: 'autoHeight', geometry: geom(0, 0, 200, 10) }));
  add(doc, s, text('한국어 텍스트', { size: 18, family: 'DejaVu Sans' }));
});
fixture('text-letter-spacing-percent', 'text', 'Letter spacing in % and negative px, with kerning pairs', doc => {
  const s = addRoot(doc, stack('vertical'), 800);
  add(doc, s, text('AVATAR Wave Toyota', { size: 32, weight: 700, letterSpacing: { unit: '%', value: 8 } }));
  add(doc, s, text('Tight AVAWAY tracking', { size: 24, letterSpacing: { unit: 'px', value: -0.6 } }));
  add(doc, s, text('Wide spacing in a wrapping paragraph of several words', { size: 16, letterSpacing: { unit: '%', value: 12 } }, { resize: 'autoHeight', geometry: geom(0, 0, 260, 10) }));
});
fixture('grid-minmax-auto-fr', 'grid', 'Tracks minmax(120px, 1fr) / auto / 2fr with text driving the auto column', doc => {
  const g = addRoot(doc, grid([{ kind: 'minmax', min: { kind: 'px', value: 120 }, max: { kind: 'fr', value: 1 } }, { kind: 'auto' }, { kind: 'fr', value: 2 }], [{ kind: 'auto' }, { kind: 'px', value: 60 }]), 800);
  add(doc, g, rect(10, 40, '#3657ff', { layoutChild: { widthMode: 'fill' } }));
  add(doc, g, text('Auto column label', { size: 16 }));
  add(doc, g, rect(10, 40, '#ff5722', { layoutChild: { widthMode: 'fill' } }));
  add(doc, g, rect(10, 10, '#4caf50', { layoutChild: { widthMode: 'fill', heightMode: 'fill' } }));
  add(doc, g, rect(50, 30, '#9c27b0'));
  add(doc, g, rect(10, 10, '#ff9800', { layoutChild: { widthMode: 'fill', heightMode: 'fill' } }));
});
fixture('grid-responsive-columns', 'grid', 'Grid columns overridden per breakpoint (4 → 2 → 1)', doc => {
  const fr = n => Array.from({ length: n }, () => ({ kind: 'fr', value: 1 }));
  const g = addRoot(doc, grid(fr(4), [], { overrides: { tablet: { layoutParent: { columns: fr(2) } }, phone: { layoutParent: { columns: fr(1) } } } }), 800);
  for (let i = 0; i < 6; i++) add(doc, g, rect(10, 50 + (i % 2) * 20, ['#3657ff', '#ff5722', '#4caf50'][i % 3], { layoutChild: { widthMode: 'fill' } }));
});
fixture('absolute-center-scale-3bp', 'absolute', 'Center + scale constraints in a fill frame whose height changes per breakpoint', doc => {
  const f = addRoot(doc, frameAbs({ overrides: { tablet: { geometry: { h: 360 } }, phone: { geometry: { h: 480 } } } }), 900, 300);
  add(doc, f, rect(200, 80, '#3657ff', { geometry: geom(350, 110, 200, 80), layoutChild: { constraints: { h: 'center', v: 'center' } } }));
  add(doc, f, rect(180, 60, '#ff5722', { geometry: geom(90, 30, 180, 60), layoutChild: { constraints: { h: 'scale', v: 'scale' } } }));
  add(doc, f, rect(120, 40, '#4caf50', { geometry: geom(700, 230, 120, 40), layoutChild: { constraints: { h: 'leftRight', v: 'bottom' } } }));
});
fixture('nested-hug-in-hug-text', 'nested', 'Hug stack inside hug stack inside a fill column, text leaves, alignCross center', doc => {
  const s = addRoot(doc, stack('vertical', {}, { alignCross: 'center' }), 800);
  const outer = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#fff')] }, { gap: 10, alignCross: 'center' }));
  const inner = add(doc, outer, stack('vertical', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#e8ecff')] }, { gap: 4, padding: { top: 8, right: 8, bottom: 8, left: 8 } }));
  add(doc, inner, text('Nested title', { size: 20, weight: 600 })); add(doc, inner, text('and a subtitle', { size: 13 }));
  add(doc, outer, rect(48, 48, '#ff5722', { corners: corners(24) }));
});

/* ================================================================== write */

fixtures.forEach((f, i) => {
  const file = path.join(OUT, String(i + 1).padStart(3, '0') + '-' + f.name + '.json');
  fs.writeFileSync(file, JSON.stringify(f, null, 0));
});
const groups = {};
fixtures.forEach(f => { groups[f.group] = (groups[f.group] || 0) + 1; });
console.log('wrote', fixtures.length, 'fixtures to', OUT, JSON.stringify(groups), 'pixel:', fixtures.filter(f => f.pixel).length);
