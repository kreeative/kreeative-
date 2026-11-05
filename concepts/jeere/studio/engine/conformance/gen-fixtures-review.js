/* Conformance fixtures for the review fixes (§0.6). Appends conformance/fixtures/NNN-name.json
 * after the existing ones (gen-fixtures.js 001–203, adversarial review 204–257).
 *
 *   node engine/conformance/gen-fixtures-review.js
 *
 * Every fixture carries `source: 'review-fixes'`; re-running replaces only these files.
 * Groups: squircle-stroke (§3.2 SVG ring), isolation (§3.3 Normal groups), gradient-transform
 * (§3.3 Mat3, rotated radial, diamond), line (§3.4 caps), zorder (§2.2 reverseZ / §2.4), gap
 * (negative spacing), aspect (§3.1), grid-placement (CSS Grid §8.5), shadow (§3.5 drop-shadow()).
 */
const fs = require('fs');
const path = require('path');
const DE = require('../index.js');
const { model } = DE;

const OUT = path.join(__dirname, 'fixtures');
const SOURCE = 'review-fixes';
fs.readdirSync(OUT).filter(f => f.endsWith('.json')).forEach(f => {
  const fx = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  if (fx.source === SOURCE) fs.unlinkSync(path.join(OUT, f));
});
let next = Math.max(0, ...fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => parseInt(f, 10)));

let fixtureIndex = 0x300, nodeCounter = 0;
function id() { nodeCounter++; return (fixtureIndex.toString(16).padStart(3, '0') + nodeCounter.toString(16).padStart(5, '0')) + '-0000-4000-8000-000000000000'; }
const fixtures = [];
const hex = h => model.hex(h);
function solid(h, opacity) { return model.solid(h, opacity !== undefined ? { opacity } : undefined); }
function stroke(h, width, align, extra) { return Object.assign({ paint: solid(h), width, align: align || 'inside', cap: 'butt', join: 'miter', visible: true }, extra || {}); }
function shadow(x, y, blur, spread, color, extra) { return Object.assign({ type: 'dropShadow', x, y, blur, spread, color: typeof color === 'string' ? hex(color) : color, visible: true }, extra || {}); }
function corners(r, smoothing) { return typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r, smoothing: smoothing || 0 } : Object.assign({ tl: 0, tr: 0, br: 0, bl: 0, smoothing: 0 }, r); }
function geom(x, y, w, h, extra) { return Object.assign({ x, y, w, h, rotation: 0, flipH: false, flipV: false }, extra || {}); }
function rect(w, h, color, props) { return model.createNode('rect', Object.assign({ id: id(), geometry: geom(0, 0, w, h), fills: [solid(color || '#3657ff')] }, props || {})); }
function stack(dir, props, lp) { return model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'stack', direction: dir, gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 }, alignMain: 'start', alignCross: 'start', clip: false }, lp || {}) }, props || {})); }
function frameAbs(props, lp) { return model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'absolute', clip: false }, lp || {}) }, props || {})); }
function grid(cols, rows, props, lp) { return model.createNode('frame', Object.assign({ id: id(), layoutParent: Object.assign({ mode: 'grid', columns: cols, rows: rows || [], columnGap: 12, rowGap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 }, clip: false }, lp || {}) }, props || {})); }
const stops = list => list.map(s => ({ position: s[0], color: hex(s[1]) }));
function paint(type, st, extra) { return Object.assign({ type, stops: stops(st), opacity: 1, blend: 'normal', visible: true }, extra || {}); }

function fixture(name, group, description, build, opts) {
  fixtureIndex++; nodeCounter = 0;
  const doc = model.createDocument({ id: 'rdoc' + fixtureIndex, name, pageId: 'rpage' + fixtureIndex });
  build(doc);
  const errors = model.validateDocument(doc).filter(e => e.level === 'error');
  if (errors.length) throw new Error(name + ': ' + JSON.stringify(errors));
  fixtures.push({ name, group, description, pixel: !!(opts && opts.pixel), source: SOURCE, doc });
}
function addRoot(doc, node, w, h, fillWidth) {
  node.geometry = Object.assign(node.geometry, { w: w || 800, h: h || 400 });
  node.layoutChild = Object.assign(node.layoutChild, { widthMode: fillWidth === false ? 'fixed' : 'fill', heightMode: h ? 'fixed' : 'hug' });
  if (!node.fills.length) node.fills = [solid('#f6f6f8')];
  model.addNode(doc, node, null);
  return node;
}
const add = (doc, parent, node) => model.addNode(doc, node, parent.id);

/* ---- §3.2 squircle strokes: an SVG ring on the unclipped wrapper (clip-path no longer eats them) */
fixture('squircle-stroke-outside', 'squircle-stroke', 'Squircle (R 24, ξ .6) with a 4px outside stroke: drawn outside the clip-path', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 40, padding: { top: 30, right: 30, bottom: 30, left: 30 } }), 800, 200);
  add(doc, s, rect(200, 120, '#3657ff', { corners: corners(24, 0.6), strokes: [stroke('#111111', 4, 'outside')] }));
  add(doc, s, rect(120, 120, '#ff5722', { corners: corners(40, 1), strokes: [stroke('#4caf50', 6, 'outside')] }));
}, { pixel: true });
fixture('squircle-stroke-inside-center', 'squircle-stroke', 'Inside 6px and centre 4px strokes following the squircle', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 40, padding: { top: 30, right: 30, bottom: 30, left: 30 } }), 800, 200);
  add(doc, s, rect(200, 120, '#ffcc00', { corners: corners(28, 0.6), strokes: [stroke('#111111', 6, 'inside')] }));
  add(doc, s, rect(200, 120, '#e8ecff', { corners: corners(28, 0.6), strokes: [stroke('#3657ff', 4, 'center')] }));
}, { pixel: true });
fixture('squircle-stroke-shadow', 'squircle-stroke', 'Squircle with an outside stroke and a drop shadow (wrapper: filter + ::after ring)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 40, padding: { top: 40, right: 40, bottom: 40, left: 40 } }), 800, 220);
  add(doc, s, rect(220, 120, '#ffffff', { corners: corners(24, 0.6), strokes: [stroke('#3657ff', 3, 'outside')], effects: [shadow(0, 8, 16, 0, model.color(0, 0, 0, 0.3))] }));
}, { pixel: true });
fixture('squircle-lone-corner', 'squircle-stroke', 'A single 90px corner on 200×100 is capped at min(w,h)/2 (no folded path)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 40, padding: { top: 30, right: 30, bottom: 30, left: 30 } }), 800, 200);
  add(doc, s, rect(200, 100, '#3657ff', { corners: corners({ tl: 90, smoothing: 0.6 }) }));
  add(doc, s, rect(200, 100, '#ff5722', { corners: corners({ tl: 90 }) }));
}, { pixel: true });

/* ---- §3.3 Normal groups are isolated */
fixture('isolation-normal-group', 'isolation', 'Multiply child inside a Normal group (isolated) vs inside a pass-through group', doc => {
  const f = addRoot(doc, frameAbs({ fills: [solid('#3657ff')] }), 420, 200, false);
  const g = add(doc, f, frameAbs({ geometry: geom(20, 20, 180, 160), blendMode: 'normal', fills: [] }));
  add(doc, g, rect(120, 120, '#ff5722', { geometry: geom(30, 20, 120, 120), blendMode: 'multiply' }));
  const p = add(doc, f, frameAbs({ geometry: geom(220, 20, 180, 160), blendMode: 'passThrough', fills: [] }));
  add(doc, p, rect(120, 120, '#ff5722', { geometry: geom(30, 20, 120, 120), blendMode: 'multiply' }));
}, { pixel: true });

/* ---- §3.3 gradient transforms (Mat3), rotated radial, diamond */
fixture('gradient-diamond', 'gradient-transform', 'Diamond gradient → SVG background (four quadrant linear gradients)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 20 }), 800, 220);
  add(doc, s, rect(240, 160, '#fff', { fills: [paint('diamond', [[0, '#ffffff'], [1, '#3657ff']])] }));
  add(doc, s, rect(240, 160, '#fff', { fills: [paint('diamond', [[0, '#ff5722'], [0.6, '#ffcc00'], [1, '#111111']], { start: { x: 0.4, y: 0.6 }, radius: { x: 0.4, y: 0.3 } })] }));
}, { pixel: true });
fixture('gradient-radial-rotated', 'gradient-transform', 'Radial gradient with a rotated Mat3 transform → SVG radialGradient', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 20 }), 800, 220);
  const c = Math.cos(Math.PI / 6), n = Math.sin(Math.PI / 6);
  // gradient space = R(30°)·S(1/.45, 1/.25) about the centre: (p − .5) ↦ …, then + .5
  const a = c / 0.45, b = n / 0.45, d = -n / 0.25, e = c / 0.25;
  add(doc, s, rect(260, 160, '#fff', { fills: [paint('radial', [[0, '#ffcc00'], [1, '#3657ff']], { transform: [[a, b, 0.5 - 0.5 * a - 0.5 * b], [d, e, 0.5 - 0.5 * d - 0.5 * e]] })] }));
  add(doc, s, rect(200, 160, '#fff', { fills: [paint('radial', [[0, '#ffffff'], [1, '#ff5722']], { transform: [[2, 0, -0.5], [0, 2, -0.5]] })] }));
}, { pixel: true });
fixture('gradient-linear-transform', 'gradient-transform', 'Linear gradient defined only by a Mat3 transform (rotated 45°, scaled)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 20 }), 800, 220);
  const c = Math.SQRT1_2;
  add(doc, s, rect(300, 160, '#fff', { fills: [paint('linear', [[0, '#3657ff'], [0.5, '#ffffff'], [1, '#ff5722']], { transform: [[c, c, 0.5 - c], [-c, c, 0.5]] })] }));
  add(doc, s, rect(160, 160, '#fff', { fills: [paint('linear', [[0, '#111111'], [1, '#4caf50']], { transform: [[0, 1, 0], [-1, 0, 1]] })] }));
}, { pixel: true });

/* ---- §3.4 lines: SVG strokes with caps */
fixture('line-caps', 'line', 'Lines with butt / round / square caps (inline SVG stroke-linecap)', doc => {
  const f = addRoot(doc, frameAbs({ fills: [solid('#ffffff')] }), 400, 200, false);
  ['butt', 'round', 'square'].forEach((cap, i) => add(doc, f, model.createNode('line', { id: id(), geometry: geom(60, 40 + i * 50, 280, 0), strokes: [stroke(['#3657ff', '#ff5722', '#111111'][i], 12, 'center', { cap })] })));
}, { pixel: true });

/* ---- §2.2 reverseZ + §2.4 absolute children, negative spacing */
fixture('zorder-reverse-absolute', 'zorder', 'reverseZ stack with overlapping items (negative spacing) and an absolute child that stays on top', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: -40, reverseZ: true, padding: { top: 30, right: 30, bottom: 30, left: 30 } }), 800, 200);
  ['#3657ff', '#ff5722', '#4caf50'].forEach(col => add(doc, s, rect(140, 120, col)));
  add(doc, s, rect(120, 60, '#111111', { geometry: geom(100, 60, 120, 60), layoutChild: { position: 'absolute', widthMode: 'fixed', heightMode: 'fixed', constraints: { h: 'left', v: 'top' } } }));
}, { pixel: true });
fixture('negative-gap-overlap', 'gap', 'Negative spacing overlaps items in tree order (margins in CSS)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: -30, alignCross: 'center' }), 800, 200);
  ['#3657ff', '#ff5722', '#4caf50', '#ffcc00'].forEach((col, i) => add(doc, s, rect(120, 80 + i * 20, col)));
  const col = add(doc, s, stack('vertical', { layoutChild: { widthMode: 'hug', heightMode: 'hug' }, fills: [solid('#e8ecff')] }, { gap: -10 }));
  add(doc, col, rect(60, 40, '#111111')); add(doc, col, rect(60, 40, '#888888'));
}, { pixel: true });

/* ---- §3.1 aspect lock */
fixture('aspect-fill-row', 'aspect', 'Aspect-locked fill items: height follows the width (aspect-ratio)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 16, alignCross: 'stretch' }), 800);
  add(doc, s, rect(160, 90, '#3657ff', { aspectLocked: true, layoutChild: { widthMode: 'fill', heightMode: 'fixed' } }));
  add(doc, s, rect(100, 100, '#ff5722', { aspectLocked: true, layoutChild: { widthMode: 'fill', heightMode: 'fixed', grow: 2 } }));
  add(doc, s, rect(120, 40, '#4caf50'));
}, { pixel: true });
fixture('aspect-fill-column', 'aspect', 'Aspect-locked items in a column: fill width → derived height; responsive widths', doc => {
  const s = addRoot(doc, stack('vertical', { overrides: { phone: { layoutParent: { padding: { top: 8, right: 8, bottom: 8, left: 8 } } } } }, { gap: 12 }), 800);
  add(doc, s, rect(400, 225, '#3657ff', { aspectLocked: true, layoutChild: { widthMode: 'fill', heightMode: 'fixed' } }));
  const row = add(doc, s, stack('horizontal', { layoutChild: { widthMode: 'fill', heightMode: 'hug' } }, { gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));
  for (let i = 0; i < 3; i++) add(doc, row, rect(100, 100, '#ff5722', { aspectLocked: true, layoutChild: { widthMode: 'fill', heightMode: 'fixed' } }));
});

/* ---- CSS Grid §8.5 placement order */
fixture('grid-placement-order', 'grid-placement', 'Explicit items placed first, a row-locked item, a column-only item and auto items', doc => {
  const g = addRoot(doc, grid([{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]), 800);
  add(doc, g, rect(10, 40, '#3657ff', { layoutChild: { widthMode: 'fill', heightMode: 'fixed' } }));                                  // auto
  add(doc, g, rect(10, 60, '#ff5722', { layoutChild: { widthMode: 'fill', heightMode: 'fixed', gridArea: { col: 1, colSpan: 2, row: 1, rowSpan: 1 } } })); // explicit
  add(doc, g, rect(10, 50, '#4caf50', { layoutChild: { widthMode: 'fill', heightMode: 'fixed', gridArea: { col: 0, colSpan: 1, row: 2, rowSpan: 1 } } })); // row-locked
  add(doc, g, rect(10, 30, '#ffcc00', { layoutChild: { widthMode: 'fill', heightMode: 'fixed', gridArea: { col: 2, colSpan: 1, row: 0, rowSpan: 1 } } })); // column only
  add(doc, g, rect(10, 45, '#111111', { layoutChild: { widthMode: 'fill', heightMode: 'fixed' } }));                                  // auto
});

/* ---- §3.5 drop-shadow() when the shadow must not show behind transparent parts */
fixture('shadow-behind-transparent', 'shadow', 'showBehindTransparent: false → filter: drop-shadow() (same look on an opaque box)', doc => {
  const s = addRoot(doc, stack('horizontal', {}, { gap: 60, padding: { top: 40, right: 40, bottom: 40, left: 40 } }), 800, 220);
  add(doc, s, rect(160, 120, '#3657ff', { corners: corners(12), effects: [shadow(0, 8, 16, 0, model.color(0, 0, 0, 0.35), { showBehindTransparent: false })] }));
  add(doc, s, rect(160, 120, '#3657ff', { corners: corners(12), effects: [shadow(0, 8, 16, 0, model.color(0, 0, 0, 0.35))] }));
}, { pixel: true });

/* ---- write */
fixtures.forEach(f => {
  next++;
  fs.writeFileSync(path.join(OUT, String(next).padStart(3, '0') + '-' + f.name + '.json'), JSON.stringify(f));
});
console.log('wrote', fixtures.length, 'review fixtures (' + fixtures.filter(f => f.pixel).length + ' pixel) up to', next);
