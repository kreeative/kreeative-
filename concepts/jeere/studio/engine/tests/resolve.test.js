'use strict';
const DE = require('../index.js');
const M = DE.model, R = DE.resolve;

module.exports = function (t) {
  const { assert } = t;

  function docWith(nodeProps, tokens) {
    const doc = M.createDocument({ tokens });
    const n = M.addNode(doc, M.createNode('rect', Object.assign({ id: 'n0000000-0000-4000-8000-000000000000' }, nodeProps || {})), null);
    return { doc, n };
  }

  t.test('breakpoint chains (§1.5)', () => {
    const { doc } = docWith();
    assert.deepStrictEqual(R.chainOf(doc, 'phone'), ['phone', 'tablet', 'base']);
    assert.deepStrictEqual(R.chainOf(doc, 'tablet'), ['tablet', 'base']);
    assert.deepStrictEqual(R.chainOf(doc, 'base'), ['base']);
    assert.throws(() => R.chainOf(doc, 'watch'));
  });

  t.test('media bounds use the .98 convention', () => {
    const { doc } = docWith();
    assert.deepStrictEqual(R.mediaBounds(doc).map(b => [b.id, b.maxWidth]), [['base', null], ['tablet', 1439.98], ['phone', 833.98]]);
    assert.strictEqual(R.mediaQuery(doc, 'tablet'), '(max-width: 1439.98px)');
    assert.strictEqual(R.mediaQuery(doc, 'phone'), '(max-width: 833.98px)');
    assert.strictEqual(R.mediaQuery(doc, 'base'), null);
    assert.strictEqual(R.activeBreakpoint(doc, 1440), 'base');
    assert.strictEqual(R.activeBreakpoint(doc, 1439), 'tablet');
    assert.strictEqual(R.activeBreakpoint(doc, 834), 'tablet', 'the 834 artboard is inside tablet');
    assert.strictEqual(R.activeBreakpoint(doc, 833), 'phone');
    assert.strictEqual(R.activeBreakpoint(doc, 390), 'phone');
    doc.breakpoints = [{ id: 'base', width: 1280 }, { id: 'md', width: 1000 }, { id: 'sm', width: 600 }, { id: 'xs', width: 320 }];
    assert.deepStrictEqual(R.mediaBounds(doc).map(b => b.maxWidth), [null, 1279.98, 999.98, 599.98]);
  });

  t.test('descending cascade: narrower inherits from the next wider unless overridden', () => {
    const { doc, n } = docWith({ opacity: 1, overrides: { tablet: { opacity: 0.5 } } });
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'base'), 1);
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'tablet'), 0.5);
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'phone'), 0.5, 'phone inherits tablet');
    n.overrides.phone = { opacity: 0.25 };
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'phone'), 0.25);
    assert.strictEqual(R.definingBreakpoint(doc, n, 'opacity', 'phone'), 'phone');
    delete n.overrides.phone;
    assert.strictEqual(R.definingBreakpoint(doc, n, 'opacity', 'phone'), 'tablet');
    assert.ok(R.hasOverride(n, 'opacity', 'tablet') && !R.hasOverride(n, 'opacity', 'phone'));
  });

  t.test('overrides are per property, never per node; object props merge per key', () => {
    const { doc, n } = docWith({ geometry: { x: 10, y: 20, w: 300, h: 100, rotation: 0, flipH: false, flipV: false }, overrides: { tablet: { geometry: { w: 200 } }, phone: { geometry: { h: 50 } } } });
    assert.deepStrictEqual(R.resolve(doc, n, 'geometry', 'phone'), { x: 10, y: 20, w: 200, h: 50, rotation: 0, flipH: false, flipV: false });
    n.fills = [M.solid('#ff0000')];
    assert.deepStrictEqual(R.resolve(doc, n, 'fills', 'phone'), n.fills, 'changing w on phone does not freeze the colour');
  });

  t.test('states sit on top of the cascade: state > breakpoint > base (§4.3)', () => {
    const red = [M.solid('#ff0000')], blue = [M.solid('#0000ff')], green = [M.solid('#00ff00')];
    const { doc, n } = docWith({ fills: red, states: { hover: { fills: blue, opacity: 0.8 } }, overrides: { tablet: { fills: green } } });
    assert.deepStrictEqual(R.resolve(doc, n, 'fills', 'tablet'), green);
    assert.deepStrictEqual(R.resolve(doc, n, 'fills', 'tablet', 'hover'), blue);
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'phone', 'hover'), 0.8);
    assert.strictEqual(R.resolve(doc, n, 'opacity', 'phone', 'pressed'), 1, 'unknown state = no change');
    // the state itself overridden on phone (remove hover on mobile)
    n.overrides.phone = { states: { hover: { fills: green } } };
    assert.deepStrictEqual(R.resolve(doc, n, 'fills', 'phone', 'hover'), green);
    assert.deepStrictEqual(R.resolve(doc, n, 'fills', 'tablet', 'hover'), blue);
  });

  t.test('text style overrides merge over node.style', () => {
    const doc = M.createDocument();
    const tx = M.addNode(doc, M.createNode('text', { id: 't0000000-0000-4000-8000-000000000000', text: 'x', style: M.defaultTextStyle({ size: 48 }), overrides: { phone: { text: { size: 32 } } } }), null);
    const rn = R.resolveNode(doc, tx, 'phone');
    assert.strictEqual(rn.style.size, 32); assert.strictEqual(rn.style.family, 'Inter');
    assert.strictEqual(R.resolveNode(doc, tx, 'tablet').style.size, 48);
  });

  const TOKENS = {
    modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }], activeMode: { core: 'light' },
    sets: [{ id: 'core', name: 'Core', tokens: {
      'color.brand.500': { type: 'color', valueByMode: { light: '#3657ff', dark: '#8fa3ff' } },
      'color.brand.600': { type: 'color', valueByMode: { light: { alias: '{color.brand.500}' }, dark: { alias: '{color.brand.500}' } } },
      'space.4': { type: 'dimension', valueByMode: { light: { value: 16, unit: 'px' } } },
      'loop.a': { type: 'color', valueByMode: { light: { alias: '{loop.b}' } } },
      'loop.b': { type: 'color', valueByMode: { light: { alias: '{loop.a}' } } }
    } }]
  };

  t.test('token references resolve per mode, through aliases (§4.4)', () => {
    const { doc } = docWith({}, JSON.parse(JSON.stringify(TOKENS)));
    assert.strictEqual(R.resolveToken(doc, 'color.brand.500'), '#3657ff', 'active mode');
    assert.strictEqual(R.resolveToken(doc, '{color.brand.600}', 'dark'), '#8fa3ff', 'alias followed in the requested mode');
    doc.tokens.activeMode.core = 'dark';
    assert.strictEqual(R.resolveToken(doc, 'color.brand.600'), '#8fa3ff');
    assert.deepStrictEqual(R.resolveToken(doc, 'space.4', 'dark'), { value: 16, unit: 'px' }, 'missing mode → first value');
    assert.throws(() => R.resolveToken(doc, 'nope'), /unknown token/);
  });

  t.test('alias cycles and the depth limit of 32 are detected', () => {
    const tokens = JSON.parse(JSON.stringify(TOKENS));
    const { doc } = docWith({}, tokens);
    assert.throws(() => R.resolveToken(doc, 'loop.a'), /cycle/);
    for (let i = 0; i < 40; i++) tokens.sets[0].tokens['chain.' + i] = { type: 'number', valueByMode: { light: i === 39 ? 1 : { alias: '{chain.' + (i + 1) + '}' } } };
    assert.throws(() => R.resolveToken(doc, 'chain.0'), /depth/);
    assert.strictEqual(R.resolveToken(doc, 'chain.10'), 1, '29 hops is fine');
    const errs = R.checkTokens(doc);
    assert.ok(errs.some(e => e.startsWith('loop.a')) && errs.some(e => e.startsWith('chain.0')));
  });

  t.test('resolveNode replaces {ref} values (colours → Color, dimensions → px numbers)', () => {
    const { doc, n } = docWith({ fills: [{ type: 'solid', color: { ref: 'color.brand.500' }, opacity: 1, blend: 'normal', visible: true }], corners: { tl: { ref: 'space.4' }, tr: 0, br: 0, bl: 0, smoothing: 0 } }, JSON.parse(JSON.stringify(TOKENS)));
    const rn = R.resolveNode(doc, n, 'base');
    assert.deepStrictEqual(rn.fills[0].color, M.hex('#3657ff'));
    assert.strictEqual(rn.corners.tl, 16);
    const dark = R.resolveNode(doc, n, 'base', undefined, { mode: 'dark' });
    assert.deepStrictEqual(dark.fills[0].color, M.hex('#8fa3ff'));
    const kept = R.resolveNode(doc, n, 'base', undefined, { keepRefs: true });
    assert.deepStrictEqual(kept.fills[0].color, { ref: 'color.brand.500' });
    assert.strictEqual(R.cssVarName('color.brand.500'), '--color-brand-500');
  });
};
