'use strict';
/* Incremental layout == full layout (§2.3), under random edits committed through History (every
 * change, including the fix-ups that keep the document valid, is a recorded patch). */
const DE = require('../index.js');
const M = DE.model, H = DE.history;

module.exports = function (t) {
  const { assert } = t;
  const measurer = DE.text.createTableMeasurer();

  function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
  const G = (w, h, extra) => Object.assign({ x: 0, y: 0, w, h, rotation: 0, flipH: false, flipV: false }, extra || {});

  function buildDoc(r, n) {
    const ri = k => Math.floor(r() * k), pick = a => a[ri(a.length)];
    const doc = M.createDocument({ id: 'fuzz' });
    const root = M.addNode(doc, M.createNode('frame', { geometry: G(1200, 100), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', gap: 8, padding: { top: 10, right: 10, bottom: 10, left: 10 } }, overrides: { tablet: { geometry: { w: 700 } }, phone: { geometry: { w: 360 } } } }), null);
    const conts = [root];
    for (let i = 0; i < n; i++) {
      const par = pick(conts), k = ri(10);
      let node;
      if (k < 3) node = M.createNode('frame', { layoutParent: { mode: 'stack', direction: pick(['horizontal', 'vertical']), wrap: r() < 0.3, gap: ri(12) - (r() < 0.1 ? 20 : 0), padding: { top: ri(9), right: ri(9), bottom: ri(9), left: ri(9) }, alignCross: pick(['start', 'center', 'stretch', 'end', 'baseline']) }, layoutChild: { position: 'flow', widthMode: pick(['fill', 'hug', 'fixed']), heightMode: pick(['hug', 'fixed']) }, geometry: G(100 + ri(400), 40 + ri(200)) });
      else if (k === 3) node = M.createNode('frame', { layoutParent: { mode: 'absolute' }, layoutChild: { position: 'flow', widthMode: pick(['fill', 'fixed']), heightMode: 'fixed' }, geometry: G(300, 150), strokes: r() < 0.3 ? [{ paint: M.solid('#000'), width: 4, align: 'inside', dash: [4, 2], cap: 'butt', join: 'miter', visible: true }] : [] });
      else if (k === 4) node = M.createNode('frame', { layoutParent: { mode: 'grid', columns: [{ kind: 'fr', value: 1 }, { kind: 'auto' }, { kind: 'px', value: 60 }], rows: [], columnGap: 6, rowGap: 6 }, layoutChild: { position: 'flow', widthMode: pick(['fill', 'fixed']), heightMode: 'hug' }, geometry: G(400, 10) });
      else if (k < 7) node = M.createNode('text', { text: pick(['Hello world', 'A longer sentence that will wrap in narrow boxes', 'x', 'tab\tstop']), resize: pick(['autoWidth', 'autoHeight']), geometry: G(80 + ri(200), 20), layoutChild: { position: 'flow', widthMode: pick(['fixed', 'fill']), heightMode: 'hug' } });
      else node = M.createNode('rect', { geometry: G(10 + ri(150), 10 + ri(80), { x: ri(200), y: ri(100), rotation: r() < 0.1 ? 45 : 0 }), layoutChild: { position: 'flow', widthMode: pick(['fixed', 'fixed', 'fill']), heightMode: pick(['fixed', 'fill']), widthUnit: r() < 0.05 ? '%' : undefined, constraints: { h: pick(['left', 'right', 'leftRight', 'center', 'scale']), v: pick(['top', 'bottom', 'center', 'scale']) } } });
      if (par.layoutParent.mode === 'stack' && r() < 0.08) node.layoutChild.position = 'absolute';
      if (r() < 0.15) node.overrides = { tablet: { geometry: { w: 50 + ri(300) } } };
      M.addNode(doc, node, par.id);
      if (node.children) conts.push(node);
    }
    return doc;
  }
  /** patches that remove the hug-parent / fill-child contradiction (§2.2) at every breakpoint */
  function fixups(doc) {
    const out = [];
    Object.values(doc.nodes).forEach(n => {
      if (!n.children) return;
      doc.breakpoints.forEach(b => {
        const lp = DE.resolve.resolve(doc, n, 'layoutParent', b.id), lc = DE.resolve.resolve(doc, n, 'layoutChild', b.id);
        if (lp.mode !== 'stack') return;
        const horiz = lp.direction === 'horizontal';
        n.children.forEach(cid => {
          const c = doc.nodes[cid]; if (!c) return;
          const cl = DE.resolve.resolve(doc, c, 'layoutChild', b.id);
          if (cl.position === 'absolute') return;
          if (horiz && lc.widthMode === 'hug' && cl.widthMode === 'fill') out.push(H.setProp(doc, cid, 'layoutChild.widthMode', 'fixed'));
          if (!horiz && lc.heightMode === 'hug' && cl.heightMode === 'fill') out.push(H.setProp(doc, cid, 'layoutChild.heightMode', 'fixed'));
        });
      });
    });
    return out;
  }
  function compare(a, b) {
    let worst = 0, where = null;
    Object.keys(b).forEach(bp => {
      b[bp].world.forEach((bx, id) => {
        const ax = a[bp].world.get(id);
        if (!ax) { worst = Infinity; where = { bp, id, why: 'missing' }; return; }
        const d = Math.max(Math.abs(ax.x - bx.x), Math.abs(ax.y - bx.y), Math.abs(ax.w - bx.w), Math.abs(ax.h - bx.h));
        if (d > worst) { worst = d; where = { bp, id, inc: ax, full: bx }; }
      });
      b[bp].text.forEach((tm, id) => { if (a[bp].text.get(id) && a[bp].text.get(id).height !== tm.height) { worst = Math.max(worst, 1); where = { bp, id, why: 'text' }; } });
    });
    return { worst, where };
  }

  function fuzz(seed, steps) {
    const r = rng(seed), ri = k => Math.floor(r() * k), pick = a => a[ri(a.length)];
    const doc = buildDoc(r, 160);
    H.applyPatch(doc, fixups(doc));
    const eng = new DE.layout.LayoutEngine(doc, { measurer });
    const hist = new H.History({ now: () => 0 });
    hist.on('change', e => e.patches.forEach(p => eng.invalidateFromPatch(p)));
    eng.layoutAll();
    const rootId = doc.pages[0].children[0];
    let mutations = 0;
    for (let i = 0; i < steps; i++) {
      const ids = Object.keys(doc.nodes), id = pick(ids), n = doc.nodes[id];
      const kind = pick(['w', 'h', 'x', 'gap', 'pad', 'dir', 'wrap', 'mode', 'ovr', 'text', 'vis', 'move', 'remove', 'rootw', 'align', 'undo', 'redo', 'cons', 'opacity', 'fill', 'rot']);
      let patch = null;
      if (kind === 'w') patch = [H.setProp(doc, id, 'geometry.w', 10 + ri(500))];
      else if (kind === 'h') patch = [H.setProp(doc, id, 'geometry.h', 10 + ri(300))];
      else if (kind === 'x') patch = [H.setProp(doc, id, 'geometry.x', ri(300))];
      else if (kind === 'rot') patch = [H.setProp(doc, id, 'geometry.rotation', pick([0, 30, -90]))];
      else if (kind === 'gap' && n.layoutParent && n.layoutParent.mode === 'stack') patch = [H.setProp(doc, id, 'layoutParent.gap', ri(30) - 10)];
      else if (kind === 'pad' && n.layoutParent && n.layoutParent.padding) patch = [H.setProp(doc, id, 'layoutParent.padding.left', ri(30))];
      else if (kind === 'dir' && n.layoutParent && n.layoutParent.mode === 'stack') patch = [H.setProp(doc, id, 'layoutParent.direction', n.layoutParent.direction === 'horizontal' ? 'vertical' : 'horizontal')];
      else if (kind === 'wrap' && n.layoutParent && n.layoutParent.mode === 'stack') patch = [H.setProp(doc, id, 'layoutParent.wrap', !n.layoutParent.wrap)];
      else if (kind === 'align' && n.layoutParent && n.layoutParent.mode === 'stack') patch = [H.setProp(doc, id, 'layoutParent.alignCross', pick(['start', 'center', 'end', 'stretch', 'baseline']))];
      else if (kind === 'mode' && id !== rootId) patch = [H.setProp(doc, id, 'layoutChild.widthMode', pick(['fixed', 'fill', 'hug']))];
      else if (kind === 'cons' && id !== rootId) patch = [H.setProp(doc, id, 'layoutChild.constraints', { h: pick(['left', 'right', 'leftRight', 'center', 'scale']), v: pick(['top', 'bottom', 'center', 'scale']) })];
      else if (kind === 'ovr') patch = [H.setProp(doc, id, 'overrides', { tablet: { geometry: { w: 20 + ri(400) } }, phone: r() < 0.5 ? { visible: r() < 0.8 } : {} })];
      else if (kind === 'text' && n.type === 'text') patch = [H.setProp(doc, id, 'text', M.richText(pick(['short', 'a much longer text that will wrap at small widths for sure', 'mid length\ttext', ''])))];
      else if (kind === 'vis' && id !== rootId) patch = [H.setProp(doc, id, 'visible', !n.visible)];
      else if (kind === 'opacity') patch = [H.setProp(doc, id, 'opacity', r())];
      else if (kind === 'fill') patch = [H.setProp(doc, id, 'fills', [M.solid('#' + (ri(0xffffff)).toString(16).padStart(6, '0'))])];
      else if (kind === 'rootw') patch = [H.setProp(doc, rootId, 'geometry.w', 900 + ri(600))];
      else if (kind === 'move' && id !== rootId) {
        const targets = ids.filter(x => doc.nodes[x].children && x !== id && !M.ancestors(doc, x).some(a => a.id === id));
        const to = pick(targets), from = n.parent, fi = doc.nodes[from].children.indexOf(id);
        patch = [{ op: 'remove', path: '/nodes/' + from + '/children/' + fi }, { op: 'add', path: '/nodes/' + to + '/children/-', value: id }, { op: 'replace', path: '/nodes/' + id + '/parent', value: to }];
      } else if (kind === 'remove' && id !== rootId && !n.children) {
        const from = n.parent, fi = doc.nodes[from].children.indexOf(id);
        patch = [{ op: 'remove', path: '/nodes/' + from + '/children/' + fi }, { op: 'remove', path: '/nodes/' + id }];
      } else if (kind === 'undo') { if (hist.canUndo()) { hist.undo(doc); patch = 'undo'; } }
      else if (kind === 'redo') { if (hist.canRedo()) { hist.redo(doc); patch = 'redo'; } }
      if (!patch) continue;
      if (Array.isArray(patch)) hist.commit(doc, patch);
      const fx = fixups(doc); if (fx.length) hist.commit(doc, fx);
      if (M.validateDocument(doc).some(e => e.level === 'error')) continue;
      mutations++;
      const inc = eng.layoutAll();
      const full = new DE.layout.LayoutEngine(doc, { measurer }).layoutAll();
      const c = compare(inc, full);
      if (c.worst > 1e-6) return { mutations, failure: { step: i, kind, patch: patch === 'undo' || patch === 'redo' ? patch : JSON.stringify(patch).slice(0, 300), where: c.where, worst: c.worst } };
    }
    return { mutations, failure: null };
  }

  t.test('incremental layout == full layout under 4 × 150 random recorded edits (fuzz)', () => {
    let total = 0;
    for (const seed of [1, 7, 42, 2024]) {
      const r = fuzz(seed, 150);
      assert.strictEqual(r.failure, null, 'seed ' + seed + ': ' + JSON.stringify(r.failure));
      total += r.mutations;
    }
    assert.ok(total > 300, 'enough effective mutations (' + total + ')');
  });

  t.test('narrower breakpoints re-read the reference size after a base-only edit (§2.5)', () => {
    const doc = M.createDocument({ id: 'stale' });
    const root = M.addNode(doc, M.createNode('frame', { geometry: G(1000, 400), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fixed' }, layoutParent: { mode: 'stack', direction: 'vertical', padding: { top: 0, right: 0, bottom: 0, left: 0 } }, overrides: { tablet: { geometry: { w: 600 } }, phone: { geometry: { w: 300 } } } }), null);
    const f = M.addNode(doc, M.createNode('frame', { geometry: G(1000, 300), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' }, layoutParent: { mode: 'absolute' } }), root.id);
    const a = M.addNode(doc, M.createNode('rect', { geometry: G(100, 50, { x: 800, y: 10 }), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fixed', constraints: { h: 'right', v: 'top' } } }), f.id);
    const eng = new DE.layout.LayoutEngine(doc, { measurer });
    eng.layoutAll();
    const hist = new H.History(); hist.on('change', e => e.patches.forEach(p => eng.invalidateFromPatch(p)));
    hist.commit(doc, [H.setProp(doc, root.id, 'geometry.w', 1200)]);
    const inc = eng.layoutAll(), full = new DE.layout.LayoutEngine(doc, { measurer }).layoutAll();
    ['tablet', 'phone'].forEach(bp => assert.strictEqual(inc[bp].world.get(a.id).x, full[bp].world.get(a.id).x, bp));
    assert.strictEqual(full.tablet.world.get(a.id).x, 200); assert.strictEqual(full.phone.world.get(a.id).x, -100);
  });

  t.test('paint-only patches never touch the layout; local edits re-lay out a handful of nodes', () => {
    const doc = M.createDocument({ id: 'perf' });
    const root = M.addNode(doc, M.createNode('frame', { geometry: G(1200, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', gap: 8, padding: { top: 8, right: 8, bottom: 8, left: 8 } } }), null);
    const leaves = [];
    for (let s = 0; s < 40; s++) {
      const row = M.addNode(doc, M.createNode('frame', { geometry: G(10, 10), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'horizontal', wrap: true, gap: 8, rowGap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 } } }), root.id);
      for (let c = 0; c < 25; c++) {
        const card = M.addNode(doc, M.createNode('frame', { geometry: G(200, 10), layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'hug' }, layoutParent: { mode: 'stack', direction: 'vertical', gap: 4, padding: { top: 6, right: 6, bottom: 6, left: 6 } } }), row.id);
        leaves.push(M.addNode(doc, M.createNode('rect', { geometry: G(100, 60), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' } }), card.id).id);
        M.addNode(doc, M.createNode('text', { text: 'Card ' + c, resize: 'autoWidth' }), card.id);
      }
    }
    const eng = new DE.layout.LayoutEngine(doc, { measurer });
    eng.layoutAll();
    const hist = new H.History(); hist.on('change', e => e.patches.forEach(p => eng.invalidateFromPatch(p)));
    eng.stats.layouts = 0; eng.stats.worldUpdates = 0;
    hist.commit(doc, [H.setProp(doc, leaves[500], 'opacity', 0.5), H.setProp(doc, leaves[500], 'fills', [M.solid('#f00')])]);
    eng.layoutAll();
    assert.strictEqual(eng.stats.layouts, 0, 'paint-only patch: no layout'); assert.strictEqual(eng.stats.worldUpdates, 0);
    hist.commit(doc, [H.setProp(doc, leaves[500], 'geometry.h', 90)]);
    eng.layout('base');
    assert.ok(eng.stats.layouts < 100, 'local edit re-lays out the path to the root (and the calls it makes) only (' + eng.stats.layouts + ')');
    // the edited card's row grows: only the rows below it move (their world boxes are recomputed)
    assert.ok(eng.stats.worldUpdates < 0.55 * Object.keys(doc.nodes).length, 'world boxes of the moved subtrees only (' + eng.stats.worldUpdates + ' of ' + Object.keys(doc.nodes).length + ')');
    const full = new DE.layout.LayoutEngine(doc, { measurer }).layout('base');
    assert.deepStrictEqual(eng.layout('base').world.get(leaves[999]), full.world.get(leaves[999]));
  });
};
