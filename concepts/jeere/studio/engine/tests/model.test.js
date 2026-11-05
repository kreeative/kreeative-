'use strict';
const DE = require('../index.js');
const M = DE.model;

module.exports = function (t) {
  const { assert, near } = t;

  function sampleDoc() {
    const doc = M.createDocument({ id: 'd1', pageId: 'p1' });
    const root = M.addNode(doc, M.createNode('frame', { id: 'aaaaaaaa-0000-4000-8000-000000000001', layoutParent: { mode: 'stack', direction: 'horizontal' } }), null);
    const a = M.addNode(doc, M.createNode('rect', { id: 'bbbbbbbb-0000-4000-8000-000000000002', geometry: { x: 10, y: 20, w: 50, h: 40, rotation: 0, flipH: false, flipV: false } }), root.id);
    const g = M.addNode(doc, M.createNode('frame', { id: 'cccccccc-0000-4000-8000-000000000003', geometry: { x: 5, y: 6, w: 200, h: 100, rotation: 0, flipH: false, flipV: false } }), root.id);
    const b = M.addNode(doc, M.createNode('text', { id: 'dddddddd-0000-4000-8000-000000000004', text: 'Hello\nWorld' }), g.id);
    return { doc, root, a, g, b };
  }

  t.test('uuid is RFC 4122 v4 and unique', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const id = M.uuid();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.ok(!seen.has(id)); seen.add(id);
    }
  });

  t.test('classOf → de- + first 8 chars, non-alnum replaced', () => {
    assert.strictEqual(M.classOf('3f9a1c2e-1111-4000-8000-000000000000'), 'de-3f9a1c2e');
    assert.strictEqual(M.classOf('ab_c.efgh-zz'), 'de-ab0c0efg');
  });

  t.test('createDocument defaults (§0.3, §1.5)', () => {
    const doc = M.createDocument();
    assert.strictEqual(doc.version, 3);
    assert.deepStrictEqual(doc.breakpoints.map(b => [b.id, b.width]), [['base', 1440], ['tablet', 834], ['phone', 390]]);
    assert.strictEqual(doc.pages.length, 1);
    assert.deepStrictEqual(doc.tokens, { sets: [], modes: [], activeMode: {} });
    assert.deepStrictEqual(M.validateDocument(doc).filter(e => e.level === 'error'), []);
  });

  t.test('createNode fills every BaseNode field and merges props one level deep', () => {
    const n = M.createNode('frame', { layoutParent: { mode: 'stack', gap: 8, padding: { top: 4 } }, geometry: { w: 300 } });
    for (const k of ['id', 'type', 'name', 'parent', 'visible', 'locked', 'opacity', 'blendMode', 'isolate', 'semantic', 'geometry', 'layoutChild', 'fills', 'strokes', 'effects', 'corners', 'overrides', 'meta', 'children', 'layoutParent']) assert.ok(k in n, 'missing ' + k);
    assert.strictEqual(n.geometry.w, 300); assert.strictEqual(n.geometry.h, 100);
    assert.strictEqual(n.layoutParent.mode, 'stack'); assert.strictEqual(n.layoutParent.gap, 8);
    assert.deepStrictEqual(n.layoutParent.padding, { top: 4, right: 0, bottom: 0, left: 0 });
    assert.strictEqual(n.layoutParent.direction, 'vertical', 'stack defaults filled in');
    assert.strictEqual(n.blendMode, 'passThrough');
    assert.throws(() => M.createNode('banana'));
    const tx = M.createNode('text', { text: 'a\nb' });
    assert.strictEqual(tx.text.paragraphs.length, 2); assert.strictEqual(M.plainText(tx.text), 'a\nb');
    assert.strictEqual(tx.semantic.tag, 'p'); assert.strictEqual(tx.resize, 'autoWidth');
    assert.strictEqual(M.createNode('line').geometry.h, 0);
  });

  t.test('tree helpers: parentOf, childrenOf, ancestors, descendants, pageOf, indexInParent', () => {
    const { doc, root, a, g, b } = sampleDoc();
    assert.strictEqual(M.parentOf(doc, b.id), g);
    assert.strictEqual(M.parentOf(doc, root.id), null);
    assert.deepStrictEqual(M.childrenOf(doc, root.id).map(n => n.id), [a.id, g.id]);
    assert.deepStrictEqual(M.ancestors(doc, b.id).map(n => n.id), [g.id, root.id]);
    assert.deepStrictEqual(M.descendants(doc, root.id).map(n => n.id), [a.id, g.id, b.id]);
    assert.strictEqual(M.pageOf(doc, b.id).id, 'p1');
    assert.strictEqual(M.indexInParent(doc, g.id), 1);
    assert.strictEqual(M.indexInParent(doc, root.id), 0);
    M.addNode(doc, M.createNode('rect', { id: 'eeeeeeee-0000-4000-8000-000000000005' }), root.id, 0);
    assert.strictEqual(M.indexInParent(doc, a.id), 1, 'insert at index shifts siblings');
  });

  t.test('removeNode removes the subtree and the parent link', () => {
    const { doc, root, g, b } = sampleDoc();
    M.removeNode(doc, g.id);
    assert.ok(!doc.nodes[g.id] && !doc.nodes[b.id]);
    assert.ok(root.children.indexOf(g.id) < 0);
    assert.deepStrictEqual(M.validateDocument(doc).filter(e => e.level === 'error'), []);
  });

  t.test('worldBox: layout cache first, stored geometry fallback', () => {
    const { doc, b, g } = sampleDoc();
    b.geometry.x = 3; b.geometry.y = 4;
    assert.deepStrictEqual(M.worldBox(doc, b.id), { x: 3 + g.geometry.x, y: 4 + g.geometry.y, w: b.geometry.w, h: b.geometry.h });
    const fake = { world: new Map([[b.id, { x: 1, y: 2, w: 3, h: 4 }]]) };
    assert.deepStrictEqual(M.worldBox(doc, b.id, fake), { x: 1, y: 2, w: 3, h: 4 });
  });

  t.test('rotatedBBox implements §1.4', () => {
    const r = M.rotatedBBox({ x: 0, y: 0, w: 100, h: 50 }, 30);
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    near(r.w, 100 * c + 50 * s, 1e-9); near(r.h, 100 * s + 50 * c, 1e-9);
    near(r.x + r.w / 2, 50, 1e-9); near(r.y + r.h / 2, 25, 1e-9);
    const q = M.rotatedBBox({ x: 10, y: 10, w: 40, h: 20 }, 90);
    near(q.w, 20, 1e-9); near(q.h, 40, 1e-9);
    assert.deepStrictEqual(M.rotatedBBox({ x: 1, y: 2, w: 3, h: 4 }, 0), { x: 1, y: 2, w: 3, h: 4 });
  });

  t.test('validateDocument reports structural errors', () => {
    const codes = doc => M.validateDocument(doc).filter(e => e.level === 'error').map(e => e.path + ' ' + e.message);
    let s = sampleDoc();
    assert.deepStrictEqual(codes(s.doc), []);
    s.doc.version = 2; assert.ok(codes(s.doc).some(m => m.includes('/version')));
    s = sampleDoc(); s.a.type = 'blob'; assert.ok(codes(s.doc).some(m => m.includes('unknown type')));
    s = sampleDoc(); s.b.parent = s.root.id; assert.ok(codes(s.doc).some(m => m.includes('back-pointer') || m.includes('does not list')));
    s = sampleDoc(); s.a.geometry.w = -5; assert.ok(codes(s.doc).some(m => m.includes('negative size')));
    s = sampleDoc(); s.a.geometry.x = NaN; assert.ok(codes(s.doc).some(m => m.includes('finite')));
    s = sampleDoc(); s.a.semantic.tag = 'marquee'; assert.ok(codes(s.doc).some(m => m.includes('invalid tag')));
    s = sampleDoc(); s.doc.breakpoints = [{ id: 'base', width: 1440 }, { id: 'phone', width: 390 }, { id: 'tablet', width: 834 }]; assert.ok(codes(s.doc).some(m => m.includes('descending')));
    s = sampleDoc(); s.root.layoutChild.widthMode = 'hug'; s.a.layoutChild.widthMode = 'fill'; assert.ok(codes(s.doc).some(m => m.includes('hug container with a fill child')));
    s = sampleDoc(); s.a.overrides = { desktop2: { opacity: 0.5 } }; assert.ok(codes(s.doc).some(m => m.includes('unknown breakpoint')));
    s = sampleDoc(); s.b.resize = 'grow'; assert.ok(codes(s.doc).some(m => m.includes('resize')));
    // class collision: two ids sharing the first 8 chars
    s = sampleDoc(); M.addNode(s.doc, M.createNode('rect', { id: 'bbbbbbbb-ffff-4000-8000-000000000009' }), s.root.id);
    assert.ok(codes(s.doc).some(m => m.includes('class collision')));
    // parent cycle
    s = sampleDoc(); s.g.parent = s.b.id; s.b.children = [s.g.id]; s.b.layoutParent = { mode: 'absolute' };
    assert.ok(codes(s.doc).some(m => m.includes('cycle')));
  });

  t.test('serialize / deserialize round-trip is lossless', () => {
    const { doc } = sampleDoc();
    const back = M.deserialize(M.serialize(doc));
    assert.deepStrictEqual(back, JSON.parse(JSON.stringify(doc)));
    const minimal = M.deserialize('{"pages":[{"id":"p","name":"P","children":[]}],"nodes":{}}');
    assert.strictEqual(minimal.version, 3); assert.ok(minimal.tokens && minimal.breakpoints.length === 3);
  });

  t.test('colour helpers', () => {
    assert.deepStrictEqual(M.hex('#fff'), { r: 1, g: 1, b: 1, a: 1 });
    const c = M.hex('#3657FF80');
    near(c.r, 0x36 / 255); near(c.b, 1); near(c.a, 128 / 255);
    assert.strictEqual(M.solid('#000').type, 'solid');
  });

  t.test('stroke modes and border insets (§3.4)', () => {
    const solid = M.solid('#000');
    assert.strictEqual(M.strokeMode({ paint: solid, width: 2, align: 'center' }), 'shadow');
    assert.strictEqual(M.strokeMode({ paint: solid, width: 2, align: 'inside', dash: [4, 2] }), 'border');
    assert.strictEqual(M.strokeMode({ paint: solid, width: 2, align: 'outside', dash: [4, 2] }), 'outline');
    assert.strictEqual(M.strokeMode({ paint: solid, width: { top: 1, right: 2, bottom: 3, left: 4 }, align: 'inside' }), 'border');
    assert.deepStrictEqual(M.borderInsets([{ paint: solid, width: { top: 1, right: 2, bottom: 3, left: 4 }, align: 'inside' }, { paint: solid, width: 5, align: 'inside' }]), { top: 1, right: 2, bottom: 3, left: 4 });
  });
};
