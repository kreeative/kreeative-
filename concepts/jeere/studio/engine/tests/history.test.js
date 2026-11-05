'use strict';
const DE = require('../index.js');
const H = DE.history;

module.exports = function (t) {
  const { assert } = t;
  const clone = v => JSON.parse(JSON.stringify(v));

  /** apply → check result; apply inverse → original */
  function roundTrip(doc, patch, expected) {
    const orig = clone(doc);
    const inv = H.applyPatch(doc, patch);
    assert.deepStrictEqual(doc, expected);
    H.applyPatch(doc, inv);
    assert.deepStrictEqual(doc, orig);
  }

  // RFC 6902 Appendix A examples
  t.test('RFC 6902 A.1 add object member', () => roundTrip({ foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux' }], { baz: 'qux', foo: 'bar' }));
  t.test('RFC 6902 A.2 add array element', () => roundTrip({ foo: ['bar', 'baz'] }, [{ op: 'add', path: '/foo/1', value: 'qux' }], { foo: ['bar', 'qux', 'baz'] }));
  t.test('RFC 6902 A.3 remove object member', () => roundTrip({ baz: 'qux', foo: 'bar' }, [{ op: 'remove', path: '/baz' }], { foo: 'bar' }));
  t.test('RFC 6902 A.4 remove array element', () => roundTrip({ foo: ['bar', 'qux', 'baz'] }, [{ op: 'remove', path: '/foo/1' }], { foo: ['bar', 'baz'] }));
  t.test('RFC 6902 A.5 replace', () => roundTrip({ baz: 'qux', foo: 'bar' }, [{ op: 'replace', path: '/baz', value: 'boo' }], { baz: 'boo', foo: 'bar' }));
  t.test('RFC 6902 A.6 move value', () => roundTrip({ foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } }, [{ op: 'move', from: '/foo/waldo', path: '/qux/thud' }], { foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } }));
  t.test('RFC 6902 A.7 move array element', () => roundTrip({ foo: ['all', 'grass', 'cows', 'eat'] }, [{ op: 'move', from: '/foo/1', path: '/foo/3' }], { foo: ['all', 'cows', 'eat', 'grass'] }));
  t.test('RFC 6902 A.8/A.9 test success and failure', () => {
    const doc = { baz: 'qux', foo: ['a', 2, 'c'] };
    H.applyPatch(doc, [{ op: 'test', path: '/baz', value: 'qux' }, { op: 'test', path: '/foo/1', value: 2 }]);
    assert.throws(() => H.applyPatch(doc, [{ op: 'test', path: '/baz', value: 'bar' }]), /test failed/);
  });
  t.test('RFC 6902 A.10 add nested object', () => roundTrip({ foo: 'bar' }, [{ op: 'add', path: '/child', value: { grandchild: {} } }], { foo: 'bar', child: { grandchild: {} } }));
  t.test('RFC 6902 A.12 add to a nonexistent target fails', () => assert.throws(() => H.applyPatch({ foo: 'bar' }, [{ op: 'add', path: '/baz/bat', value: 'qux' }]), /not found/));
  t.test('RFC 6902 A.14 ~ escaping', () => {
    const doc = { '/': 9, '~1': 10 };
    H.applyPatch(doc, [{ op: 'test', path: '/~01', value: 10 }, { op: 'test', path: '/~1', value: 9 }]);
    assert.deepStrictEqual(H.parsePointer('/a~1b/c~0d'), ['a/b', 'c~d']);
    assert.strictEqual(H.joinPointer(['a/b', 'c~d']), '/a~1b/c~0d');
  });
  t.test('RFC 6902 A.16 add array value / append with "-"', () => roundTrip({ foo: ['bar'] }, [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }], { foo: ['bar', ['abc', 'def']] }));
  t.test('copy and its inverse', () => roundTrip({ a: { x: 1 }, b: {} }, [{ op: 'copy', from: '/a/x', path: '/b/y' }], { a: { x: 1 }, b: { y: 1 } }));
  t.test('add over an existing member inverts to replace', () => roundTrip({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }], { a: 2 }));
  t.test('a failing patch is rolled back atomically', () => {
    const doc = { a: 1, list: [1, 2] };
    assert.throws(() => H.applyPatch(doc, [{ op: 'replace', path: '/a', value: 5 }, { op: 'remove', path: '/list/0' }, { op: 'remove', path: '/nope' }]));
    assert.deepStrictEqual(doc, { a: 1, list: [1, 2] });
  });
  t.test('invertPatch does not mutate', () => {
    const doc = { a: 1 };
    const inv = H.invertPatch(doc, [{ op: 'replace', path: '/a', value: 2 }]);
    assert.deepStrictEqual(doc, { a: 1 });
    assert.deepStrictEqual(inv, [{ op: 'replace', path: '/a', value: 1 }]);
  });
  t.test('patched values are copied (no aliasing with the patch)', () => {
    const v = { k: [1] }, doc = {};
    H.applyPatch(doc, [{ op: 'add', path: '/v', value: v }]);
    v.k.push(2);
    assert.deepStrictEqual(doc.v, { k: [1] });
  });

  /* ---- History */

  function makeDoc() {
    const doc = DE.model.createDocument();
    const r = DE.model.addNode(doc, DE.model.createNode('rect', { id: 'r1000000-0000-4000-8000-000000000000' }), null);
    return { doc, r };
  }
  function clock() { let now = 1000; const f = () => now; f.advance = ms => { now += ms; }; return f; }

  t.test('commit / undo / redo restore exact states; ids never change', () => {
    const { doc, r } = makeDoc();
    const h = new H.History();
    const s0 = clone(doc);
    h.commit(doc, [H.setProp(doc, r.id, 'geometry.x', 42)], { label: 'move' });
    h.commit(doc, [H.setProp(doc, r.id, 'fills', [DE.model.solid('#f00')])], { label: 'fill' });
    const s2 = clone(doc);
    assert.strictEqual(h.undo(doc).label, 'fill');
    assert.strictEqual(doc.nodes[r.id].geometry.x, 42);
    h.undo(doc);
    assert.deepStrictEqual(doc, s0);
    assert.ok(!h.canUndo() && h.canRedo());
    h.redo(doc); h.redo(doc);
    assert.deepStrictEqual(doc, s2);
    assert.strictEqual(h.redo(doc), null);
    assert.ok(doc.nodes[r.id], 'node id survives undo/redo (selection stays valid)');
  });

  t.test('coalescing: same key within 500 ms merges, outside the window does not', () => {
    const { doc, r } = makeDoc();
    const now = clock();
    const h = new H.History({ now });
    for (let i = 1; i <= 10; i++) { h.commit(doc, [H.setProp(doc, r.id, 'geometry.x', i * 10)], { coalesceKey: 'drag:' + r.id }); now.advance(100); }
    assert.strictEqual(h.undoStack.length, 1, '10 drag steps 100 ms apart → one transaction');
    now.advance(600);
    h.commit(doc, [H.setProp(doc, r.id, 'geometry.x', 999)], { coalesceKey: 'drag:' + r.id });
    assert.strictEqual(h.undoStack.length, 2, 'a pause > 500 ms starts a new transaction');
    h.commit(doc, [H.setProp(doc, r.id, 'geometry.y', 5)], { coalesceKey: 'other' });
    assert.strictEqual(h.undoStack.length, 3, 'different key → new transaction');
    h.undo(doc); h.undo(doc);
    assert.strictEqual(doc.nodes[r.id].geometry.x, 100);
    h.undo(doc);
    assert.strictEqual(doc.nodes[r.id].geometry.x, 0, 'one undo reverts the whole coalesced drag');
  });

  t.test('exactly 500 ms still coalesces; 501 ms does not', () => {
    const { doc, r } = makeDoc();
    const now = clock(); const h = new H.History({ now });
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.9)], { coalesceKey: 'k' }); now.advance(500);
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.8)], { coalesceKey: 'k' }); now.advance(501);
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.7)], { coalesceKey: 'k' });
    assert.strictEqual(h.undoStack.length, 2);
  });

  t.test('seal() breaks coalescing; a new commit clears redo', () => {
    const { doc, r } = makeDoc();
    const now = clock(); const h = new H.History({ now });
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.9)], { coalesceKey: 'k' });
    h.seal();
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.8)], { coalesceKey: 'k' });
    assert.strictEqual(h.undoStack.length, 2);
    h.undo(doc); assert.ok(h.canRedo());
    h.commit(doc, [H.setProp(doc, r.id, 'opacity', 0.5)]);
    assert.ok(!h.canRedo());
  });

  t.test('history is capped at 1000 transactions', () => {
    const { doc, r } = makeDoc();
    const h = new H.History();
    assert.strictEqual(H.MAX_HISTORY, 1000);
    for (let i = 0; i < 1005; i++) h.commit(doc, [H.setProp(doc, r.id, 'geometry.x', i)]);
    assert.strictEqual(h.undoStack.length, 1000);
    let n = 0; while (h.undo(doc)) n++;
    assert.strictEqual(n, 1000);
    assert.strictEqual(doc.nodes[r.id].geometry.x, 4, 'the oldest 5 were dropped');
  });

  t.test('change events for commit / undo / redo; unsubscribe works', () => {
    const { doc, r } = makeDoc();
    const h = new H.History(); const seen = [];
    const off = h.on('change', e => seen.push(e.type + ':' + e.patches.length));
    h.commit(doc, [H.setProp(doc, r.id, 'name', 'A'), H.setProp(doc, r.id, 'opacity', 0.5)]);
    h.undo(doc); h.redo(doc);
    off();
    h.commit(doc, [H.setProp(doc, r.id, 'name', 'B')]);
    assert.deepStrictEqual(seen, ['commit:2', 'undo:2', 'redo:2']);
  });

  t.test('setProp picks add vs replace; nodePath escapes ids', () => {
    const { doc, r } = makeDoc();
    assert.strictEqual(H.setProp(doc, r.id, 'geometry.x', 1).op, 'replace');
    assert.strictEqual(H.setProp(doc, r.id, 'states', {}).op, 'add');
    assert.strictEqual(H.nodePath('a/b', 'x.y'), '/nodes/a~1b/x/y');
  });
};
