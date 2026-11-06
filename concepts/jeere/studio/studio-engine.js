/* Jeere Studio — studio-engine.js: DualEngine as the Studio's document and layout core.
 *
 * Loaded after studio.js and the other modules, with ../creer/engine-sections.js and engine/*.js.
 * Exposes window.JeereStudioEngine (used by studio-canvas.js, studio-inspector.js and the tests).
 *
 *  1. The bridge fiche ↔ DualEngine document (toDocument / fromDocument): one component per section
 *     type (its elements, from the elstyles.js registry, as master nodes), one instance per section on
 *     the « Accueil » page (props = the section's settings, instance overrides = its element styles), and
 *     the free nodes of each detached section. fromDocument(toDocument(c), c) is byte-identical.
 *  2. « Détacher » (detach): the section rendered at 1200 (Ordinateur), 768 (Tablette) and 390
 *     (Téléphone) becomes free DualEngine nodes — frames with Auto Layout (stacks, grids) where the
 *     store's own CSS lays the elements out in flex / grid / block flow, absolute positions with
 *     constraints elsewhere, texts, images, buttons — with per-breakpoint overrides from the two
 *     narrower renders. Stored in the fiche as sections[].engine (engine-sections.js sanitises it).
 *  3. Editing: one DualEngine document and one engine History per detached section; every gesture is
 *     ONE transaction of RFC 6902 patches, pushed on the Studio's single undo stack as an entry that
 *     undoes itself through the engine history. Layout per artboard with the engine's solver
 *     (nominal references, so a 1440 or a 360 artboard matches the exported CSS).
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    var EN = window.JeereEngineSections;
    var DE = window.DualEngine;
    if (!S || !EN || !DE || !DE.model || !DE.layout) return;
    var M = DE.model, H = DE.history, Rz = DE.resolve;
    var hooks = S.hooks, toast = S.toast, clone = S.clone;
    var BPS = EN.BREAKPOINTS;

    function state() { return S.state(); }
    function cfg() { return state().config; }
    function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }
    function sectionById(id) { return S.sectionById(id); }
    function isDetached(sid) { return EN.isDetached(sectionById(sid)); }

    /* hooks are shared with the other modules: chain, never replace */
    function chain(name, fn) {
      var prev = hooks[name];
      hooks[name] = function () {
        var r;
        if (prev) { try { r = prev.apply(null, arguments); } catch (e) { /* the other module */ } }
        var r2 = fn.apply(null, arguments);
        return r2 !== undefined ? r2 : r;
      };
    }

    /* ================================================================ editing documents */

    var eds = {};          // sid → { doc, history, engines: { width: LayoutEngine }, json }
    var measurer = null;
    function getMeasurer() { if (!measurer) { try { measurer = DE.text.createCanvasMeasurer(); } catch (e) { measurer = DE.text.defaultMeasurer(); } } return measurer; }
    /* fonts load after the first layout: measure again once they are in */
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { measurer = null; Object.keys(eds).forEach(function (k) { eds[k].engines = {}; }); });

    function ed(sid) {
      var e = eds[sid];
      if (e) return e;
      var s = sectionById(sid);
      if (!EN.isDetached(s)) return null;
      // the nodes bound to the catalogue show the products as they are now (as render.js draws them)
      var src = s;
      if (EN.boundSection) {
        try {
          src = EN.boundSection(s, { products: S.products().map(function (p) {
            return { id: p.id, name: p.name, price: p.price, alt: p.alt, image: p.image, ownImage: !!p.image, photo: p.photo ? { id: p.photo } : null };
          }) });
        } catch (er) { src = s; }
      }
      var doc = EN.toDocument(src.engine, { name: S.sectionName(s) });
      if (!doc) return null;
      e = eds[sid] = { sid: sid, doc: doc, history: new H.History({ max: 1000 }), engines: {} };
      return e;
    }
    function dropAll() { eds = {}; }
    function dropEngines(e) { if (e) e.engines = {}; }

    /* the fiche's copy of an editing document (sanitised, without the engine's timestamps) */
    function extract(e) {
      var nodes = {};
      Object.keys(e.doc.nodes).forEach(function (id) {
        var n = clone(e.doc.nodes[id]);
        delete n.meta;
        nodes[id] = n;
      });
      var assets = {};
      Object.keys(e.doc.assets || {}).forEach(function (id) {
        var a = e.doc.assets[id];
        if (!a || typeof a.src !== 'string') return;
        assets[id] = { src: a.src };
        if (a.width) assets[id].w = a.width;
        if (a.height) assets[id].h = a.height;
      });
      var root = e.doc.pages[0].children[0];
      return EN.sanitize({ v: 1, root: root, nodes: nodes, assets: assets });
    }
    function writeBack(sid) {
      var e = eds[sid];
      var s = sectionById(sid);
      if (!e || !s) return;
      var eng = extract(e);
      if (eng) s.engine = eng;
    }

    /* ---------------------------------------------------------------- layout per artboard width */

    function layoutAt(sid, width) {
      var e = ed(sid);
      if (!e) return null;
      var w = Math.round(width) || 1200;
      var eng = e.engines[w];
      if (!eng) {
        eng = e.engines[w] = new DE.layout.LayoutEngine(e.doc, {
          measurer: getMeasurer(), viewport: { width: w, height: 900 }, rootPlacement: 'flow', nominalReference: true
        });
      }
      try { return eng.layout(EN.bpForWidth(w)); } catch (err) { return null; }
    }
    function bpOfWidth(w) { return EN.bpForWidth(w); }

    /* ---------------------------------------------------------------- transactions */

    var lastEntry = null;
    function topOf(list) { return list.length ? list[list.length - 1] : null; }

    /**
     * Apply patches to a section's document as ONE engine transaction, write the fiche, push one
     * entry on the Studio's undo stack (a coalesced commit extends the previous entry).
     */
    function apply(sid, patches, label, opts) {
      opts = opts || {};
      var e = ed(sid);
      if (!e || !patches || !patches.length) return null;
      var before = topOf(e.history.undoStack);
      var tx;
      try { tx = e.history.commit(e.doc, patches, { label: label, coalesceKey: opts.coalesce }); }
      catch (err) { toast('La modification n’a pas pu être appliquée.', 'err'); return null; }
      patches.forEach(function (p) { Object.keys(e.engines).forEach(function (k) { try { e.engines[k].invalidateFromPatch(p); } catch (er) { e.engines[k].invalidateAll(); } }); });
      writeBack(sid);
      if (!(tx === before && lastEntry && lastEntry.tx === tx)) {
        var entry = {
          label: label || 'Modification', sid: sid, tx: tx, engine: true,
          undo: function () { step(sid, tx, 'undo'); },
          redo: function () { step(sid, tx, 'redo'); }
        };
        lastEntry = entry;
        S.pushEntry(entry);
      } else lastEntry.label = label || lastEntry.label;
      if (opts.silent !== true) S.afterChange({ engine: true, sid: sid, structure: !!opts.structure });
      return tx;
    }
    function step(sid, tx, dir) {
      var e = ed(sid);
      if (!e) throw new Error('section not detached');
      var stackTop = dir === 'undo' ? topOf(e.history.undoStack) : topOf(e.history.redoStack);
      if (stackTop === tx) { if (dir === 'undo') e.history.undo(e.doc); else e.history.redo(e.doc); }
      else H.applyPatch(e.doc, dir === 'undo' ? tx.inverse : tx.patches);
      dropEngines(e);
      writeBack(sid);
      lastEntry = null;
    }

    /* outside changes (a snapshot undo, an import, a re-render of the fiche…) rebuild the documents */
    chain('afterChange', function (opts) {
      if (opts && (opts.engine || opts.engineEntry)) return;
      if (opts && opts.styleOnly) return;
      dropAll();
      lastEntry = null;
    });

    /* ================================================================ node helpers */

    function node(sid, id) { var e = ed(sid); return e && e.doc.nodes[id] || null; }
    function rootId(sid) { var e = ed(sid); return e ? e.doc.pages[0].children[0] : null; }
    function parentOf(sid, id) { var n = node(sid, id); return n && n.parent ? node(sid, n.parent) : null; }
    function isContainer(n) { return !!(n && n.children && n.layoutParent); }
    function resolved(sid, n, bp) { var e = ed(sid); return Rz.resolveNode(e.doc, n, bp || 'base'); }
    function esc(t) { return H.escapePointer(t); }
    function path(id, rest) { return '/nodes/' + esc(id) + (rest ? '/' + rest : ''); }
    var OVERRIDABLE = M.OVERRIDABLE;

    /**
     * Patches setting `prop` (a top-level property, or 'style' for a text node) to `value` on node
     * `id` at breakpoint `bp`. At base it replaces the property; on a narrower breakpoint it writes the
     * exact value as an override (objects merged per key, SPEC §1.5), never a delta.
     */
    function propPatches(sid, id, prop, value, bp) {
      var e = ed(sid), n = e && e.doc.nodes[id];
      if (!n) return [];
      bp = bp || 'base';
      if (bp === 'base' || (OVERRIDABLE.indexOf(prop) === -1 && prop !== 'style')) {
        return [H.setProp(e.doc, id, prop, clone(value))];
      }
      var key = prop === 'style' ? 'text' : prop;
      var out = [];
      if (!n.overrides) out.push({ op: 'add', path: path(id, 'overrides'), value: {} });
      if (!n.overrides || !n.overrides[bp]) out.push({ op: 'add', path: path(id, 'overrides/' + bp), value: {} });
      var cur = n.overrides && n.overrides[bp] ? n.overrides[bp][key] : undefined;
      var v = value;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // only the keys that differ from the inherited value: the override stays minimal
        var inherited = Rz.resolve(e.doc, n, key === 'text' ? 'text' : key, wider(bp));
        var diff = {};
        Object.keys(value).forEach(function (k) { if (!inherited || JSON.stringify(inherited[k]) !== JSON.stringify(value[k])) diff[k] = value[k]; });
        v = Object.assign({}, cur && typeof cur === 'object' ? cur : {}, diff);
        if (!Object.keys(v).length) return cur === undefined ? [] : [{ op: 'remove', path: path(id, 'overrides/' + bp + '/' + key) }];
      }
      out.push({ op: cur === undefined ? 'add' : 'replace', path: path(id, 'overrides/' + bp + '/' + key), value: clone(v) });
      return out;
    }
    function wider(bp) { return bp === 'phone' ? 'tablet' : 'base'; }
    /* patches removing an override (Ctrl + clic on the blue lock: « Réinitialiser au desktop ») */
    function resetOverride(sid, id, bp, prop) {
      var n = node(sid, id);
      if (!n || !n.overrides || !n.overrides[bp]) return [];
      var key = prop === 'style' ? 'text' : prop;
      if (prop) return n.overrides[bp][key] === undefined ? [] : [{ op: 'remove', path: path(id, 'overrides/' + bp + '/' + key) }];
      return [{ op: 'replace', path: path(id, 'overrides/' + bp), value: {} }];
    }
    function hasOverride(sid, id, bp, prop) {
      var n = node(sid, id);
      var key = prop === 'style' ? 'text' : prop;
      return !!(n && n.overrides && n.overrides[bp] && n.overrides[bp][key] !== undefined);
    }

    /* resolved value at a breakpoint (overrides merged), for the inspector */
    function value(sid, id, prop, bp) {
      var e = ed(sid), n = e && e.doc.nodes[id];
      if (!n) return undefined;
      if (prop === 'style') return Rz.resolve(e.doc, n, 'text', bp || 'base');
      if (OVERRIDABLE.indexOf(prop) === -1) return n[prop];
      return Rz.resolve(e.doc, n, prop, bp || 'base');
    }

    function newId() { return M.uuid(); }
    function subtreeIds(sid, id) { var e = ed(sid); return [id].concat(M.descendants(e.doc, id).map(function (d) { return d.id; })); }

    /* ---------------------------------------------------------------- structure ops (patch builders) */

    function insertPatches(sid, nodesList, parentId, index) {
      // nodesList: [root, ...descendants] already linked (root.parent = parentId)
      var p = node(sid, parentId);
      var out = [];
      nodesList.forEach(function (n) { out.push({ op: 'add', path: path(n.id), value: clone(n) }); });
      var at = index === undefined || index < 0 || index > p.children.length ? p.children.length : index;
      out.push({ op: 'add', path: path(parentId, 'children/' + at), value: nodesList[0].id });
      return out;
    }
    function removePatches(sid, ids) {
      var e = ed(sid), out = [];
      var all = {};
      ids.forEach(function (id) { subtreeIds(sid, id).forEach(function (x) { all[x] = true; }); });
      var tops = ids.filter(function (id) { var a = M.ancestors(e.doc, id); return !a.some(function (an) { return ids.indexOf(an.id) !== -1; }); });
      // children entries: highest index first per parent, so the indices stay valid
      var byParent = {};
      tops.forEach(function (id) { var n = e.doc.nodes[id]; if (!n || !n.parent) return; (byParent[n.parent] = byParent[n.parent] || []).push(e.doc.nodes[n.parent].children.indexOf(id)); });
      Object.keys(byParent).forEach(function (pid) { byParent[pid].sort(function (a, b) { return b - a; }).forEach(function (i) { out.push({ op: 'remove', path: path(pid, 'children/' + i) }); }); });
      Object.keys(all).forEach(function (id) { out.push({ op: 'remove', path: path(id) }); });
      return out;
    }
    function movePatches(sid, id, newParentId, index, geom, position) {
      var e = ed(sid), n = e.doc.nodes[id];
      var out = [];
      var oldP = e.doc.nodes[n.parent];
      var oldIdx = oldP.children.indexOf(id);
      out.push({ op: 'remove', path: path(oldP.id, 'children/' + oldIdx) });
      var np = e.doc.nodes[newParentId];
      var len = np.children.length - (np.id === oldP.id ? 1 : 0);
      var at = index === undefined || index < 0 || index > len ? len : index;
      out.push({ op: 'add', path: path(newParentId, 'children/' + at), value: id });
      if (np.id !== oldP.id) out.push({ op: 'replace', path: path(id, 'parent'), value: newParentId });
      if (geom) Object.keys(geom).forEach(function (k) { out.push({ op: 'replace', path: path(id, 'geometry/' + k), value: geom[k] }); });
      if (position) out.push({ op: 'replace', path: path(id, 'layoutChild/position'), value: position });
      return out;
    }

    /* the node's box in its parent's coordinates, from a layout (for group / ungroup / auto layout) */
    function boxIn(lay, id) { return lay && lay.boxes.get(id); }

    function createNode(sid, type, parentId, props, index) {
      var e = ed(sid);
      if (!e) return null;
      var p = e.doc.nodes[parentId];
      if (!isContainer(p)) return null;
      var n = M.createNode(type, props || {});
      delete n.meta;
      n.parent = parentId;
      var list = [n];
      (props && props._children || []).forEach(function (c) { list.push(c); });
      delete n._children;
      return { node: n, patches: insertPatches(sid, list, parentId, index) };
    }

    /* Ctrl G: wrap siblings in a frame (absolute inside, the frame takes their place) */
    function groupPatches(sid, ids, lay) {
      var e = ed(sid);
      if (!ids.length) return null;
      var parentId = e.doc.nodes[ids[0]].parent;
      if (!ids.every(function (id) { return e.doc.nodes[id] && e.doc.nodes[id].parent === parentId; })) return null;
      var p = e.doc.nodes[parentId];
      var order = ids.slice().sort(function (a, b) { return p.children.indexOf(a) - p.children.indexOf(b); });
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      order.forEach(function (id) { var b = boxIn(lay, id) || e.doc.nodes[id].geometry; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
      var parentStack = p.layoutParent && p.layoutParent.mode !== 'absolute';
      var allAbs = order.every(function (id) { return e.doc.nodes[id].layoutChild.position === 'absolute'; });
      var g = M.createNode('frame', { name: 'Groupe', geometry: { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0), rotation: 0, flipH: false, flipV: false },
        layoutChild: { position: parentStack && !allAbs ? 'flow' : 'absolute', widthMode: 'fixed', heightMode: 'fixed' } });
      delete g.meta;
      g.parent = parentId;
      var at = p.children.indexOf(order[0]);
      var out = [];
      // the members leave the parent (highest index first), the group comes in, they join it
      order.slice().sort(function (a, b) { return p.children.indexOf(b) - p.children.indexOf(a); }).forEach(function (id) { out.push({ op: 'remove', path: path(parentId, 'children/' + p.children.indexOf(id)) }); });
      out.push({ op: 'add', path: path(g.id), value: clone(g) });
      out.push({ op: 'add', path: path(parentId, 'children/' + at), value: g.id });
      order.forEach(function (id, i) {
        var b = boxIn(lay, id) || e.doc.nodes[id].geometry;
        out.push({ op: 'add', path: path(g.id, 'children/' + i), value: id });
        out.push({ op: 'replace', path: path(id, 'parent'), value: g.id });
        out.push({ op: 'replace', path: path(id, 'geometry/x'), value: round(b.x - x0) });
        out.push({ op: 'replace', path: path(id, 'geometry/y'), value: round(b.y - y0) });
        out.push({ op: 'replace', path: path(id, 'layoutChild/position'), value: 'absolute' });
      });
      return { patches: out, id: g.id };
    }
    /* Ctrl Shift G: the frame's children take its place */
    function ungroupPatches(sid, gid, lay) {
      var e = ed(sid), g = e.doc.nodes[gid];
      if (!isContainer(g) || !g.parent || !g.children.length) return null;
      var p = e.doc.nodes[g.parent];
      var at = p.children.indexOf(gid);
      var gb = boxIn(lay, gid) || g.geometry;
      var parentStack = p.layoutParent && p.layoutParent.mode !== 'absolute';
      var out = [];
      var kids = g.children.slice();
      kids.slice().reverse().forEach(function (cid, ri) { out.push({ op: 'remove', path: path(gid, 'children/' + (kids.length - 1 - ri)) }); });
      out.push({ op: 'remove', path: path(p.id, 'children/' + at) });
      kids.forEach(function (cid, i) {
        var b = boxIn(lay, cid) || e.doc.nodes[cid].geometry;
        out.push({ op: 'add', path: path(p.id, 'children/' + (at + i)), value: cid });
        out.push({ op: 'replace', path: path(cid, 'parent'), value: p.id });
        out.push({ op: 'replace', path: path(cid, 'geometry/x'), value: round(gb.x + b.x) });
        out.push({ op: 'replace', path: path(cid, 'geometry/y'), value: round(gb.y + b.y) });
        out.push({ op: 'replace', path: path(cid, 'layoutChild/position'), value: parentStack ? 'flow' : 'absolute' });
      });
      out.push({ op: 'remove', path: path(gid) });
      return { patches: out, ids: kids };
    }

    /* Shift A: Auto Layout — a free frame becomes a stack (direction, gap, padding inferred from its
     * children's boxes, like Figma); on a stack it goes back to free positions at the same place */
    function autoLayoutPatches(sid, fid, lay) {
      var e = ed(sid), f = e.doc.nodes[fid];
      if (!isContainer(f)) return null;
      var out = [];
      var kids = f.children.filter(function (c) { var n = e.doc.nodes[c]; return n && n.visible !== false; });
      if (f.layoutParent.mode !== 'absolute') {
        f.children.forEach(function (cid) {
          var b = boxIn(lay, cid) || e.doc.nodes[cid].geometry;
          out.push({ op: 'replace', path: path(cid, 'geometry/x'), value: round(b.x) });
          out.push({ op: 'replace', path: path(cid, 'geometry/y'), value: round(b.y) });
          out.push({ op: 'replace', path: path(cid, 'geometry/w'), value: round(b.w) });
          out.push({ op: 'replace', path: path(cid, 'geometry/h'), value: round(b.h) });
          out.push({ op: 'replace', path: path(cid, 'layoutChild/position'), value: 'absolute' });
          var lc = e.doc.nodes[cid].layoutChild;
          if (lc.widthMode === 'fill') out.push({ op: 'replace', path: path(cid, 'layoutChild/widthMode'), value: 'fixed' });
          if (lc.heightMode === 'fill') out.push({ op: 'replace', path: path(cid, 'layoutChild/heightMode'), value: 'fixed' });
        });
        out.push({ op: 'replace', path: path(fid, 'layoutParent'), value: { mode: 'absolute', clip: !!f.layoutParent.clip } });
        return { patches: out, mode: 'absolute' };
      }
      var boxes = kids.map(function (cid) { return { id: cid, b: boxIn(lay, cid) || e.doc.nodes[cid].geometry }; });
      var fb = boxIn(lay, fid) || f.geometry;
      var spanX = 0, spanY = 0;
      if (boxes.length > 1) {
        var xs = boxes.map(function (k) { return k.b.x + k.b.w / 2; }), ys = boxes.map(function (k) { return k.b.y + k.b.h / 2; });
        spanX = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      }
      var horiz = spanX > spanY;
      boxes.sort(function (a, b) { return horiz ? a.b.x - b.b.x : a.b.y - b.b.y; });
      var gaps = [];
      for (var i = 1; i < boxes.length; i++) gaps.push(horiz ? boxes[i].b.x - (boxes[i - 1].b.x + boxes[i - 1].b.w) : boxes[i].b.y - (boxes[i - 1].b.y + boxes[i - 1].b.h));
      gaps.sort(function (a, b) { return a - b; });
      var gap = gaps.length ? Math.max(0, round(gaps[Math.floor(gaps.length / 2)], 0)) : 0;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      boxes.forEach(function (k) { minX = Math.min(minX, k.b.x); minY = Math.min(minY, k.b.y); maxX = Math.max(maxX, k.b.x + k.b.w); maxY = Math.max(maxY, k.b.y + k.b.h); });
      if (!boxes.length) { minX = minY = 0; maxX = fb.w; maxY = fb.h; }
      var pad = { top: Math.max(0, round(minY, 0)), right: Math.max(0, round(fb.w - maxX, 0)), bottom: Math.max(0, round(fb.h - maxY, 0)), left: Math.max(0, round(minX, 0)) };
      out.push({ op: 'replace', path: path(fid, 'layoutParent'), value: { mode: 'stack', direction: horiz ? 'horizontal' : 'vertical', wrap: false, gap: gap, padding: pad, alignMain: 'start', alignCross: 'start', clip: !!f.layoutParent.clip } });
      // the new flow order follows the positions; the hidden children stay at the end
      var order = boxes.map(function (k) { return k.id; }).concat(f.children.filter(function (c) { return kids.indexOf(c) === -1; }));
      out.push({ op: 'replace', path: path(fid, 'children'), value: order });
      boxes.forEach(function (k) {
        out.push({ op: 'replace', path: path(k.id, 'layoutChild/position'), value: 'flow' });
        out.push({ op: 'replace', path: path(k.id, 'geometry/w'), value: round(k.b.w) });
        out.push({ op: 'replace', path: path(k.id, 'geometry/h'), value: round(k.b.h) });
      });
      // a frame that hugged nothing now hugs its children
      if (f.layoutChild.heightMode === 'fixed' && boxes.length) out.push({ op: 'replace', path: path(fid, 'layoutChild/heightMode'), value: 'hug' });
      return { patches: out, mode: 'stack' };
    }

    /* copies of subtrees with new ids (paste, duplicate) */
    function cloneSubtrees(sid, ids) {
      var e = ed(sid), map = {}, out = [];
      ids.forEach(function (id) { subtreeIds(sid, id).forEach(function (x) { map[x] = newId(); }); });
      ids.forEach(function (id) {
        var list = [];
        subtreeIds(sid, id).forEach(function (x) {
          var n = clone(e.doc.nodes[x]);
          n.id = map[x];
          n.parent = x === id ? null : map[n.parent];
          if (n.children) n.children = n.children.map(function (c) { return map[c]; });
          list.push(n);
        });
        out.push(list);
      });
      return out;
    }

    /* ================================================================ « Détacher » */

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    var colorCtx = null, colorCache = {};
    function parseColor(str) {
      if (!str || str === 'transparent' || str === 'none') return null;
      if (colorCache[str] !== undefined) return colorCache[str];
      var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(str);
      var c = null;
      if (m) {
        var a = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
        c = { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: a };
      } else {
        // any other CSS colour (oklch, color-mix, color(srgb …)): let the browser paint one pixel
        try {
          if (!colorCtx) { var cv = document.createElement('canvas'); cv.width = cv.height = 1; colorCtx = cv.getContext('2d', { willReadFrequently: true }); }
          colorCtx.clearRect(0, 0, 1, 1);
          colorCtx.fillStyle = '#000';
          colorCtx.fillStyle = str;
          colorCtx.fillRect(0, 0, 1, 1);
          var d = colorCtx.getImageData(0, 0, 1, 1).data;
          c = { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
          if (d[3] > 0) { c.r = d[0] / d[3]; c.g = d[1] / d[3]; c.b = d[2] / d[3]; }
        } catch (e) { c = null; }
      }
      if (c && c.a <= 0.002) c = null;
      colorCache[str] = c;
      return c;
    }
    function solid(c) { return { type: 'solid', color: { r: round(c.r, 4), g: round(c.g, 4), b: round(c.b, 4), a: round(c.a, 4) }, opacity: 1, blend: 'normal', visible: true }; }
    function splitTop(s) {
      var out = [], depth = 0, cur = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

    var assetsAcc = null, assetSeq = 0;
    function assetFor(src, w, h) {
      if (!src) return null;
      var key = null;
      var demo = /\/img\/demo\/(.+\.(?:webp|jpe?g|png|avif))(?:[?#].*)?$/i.exec(src);
      if (demo && window.JEERE_DATA && window.JEERE_DATA.DEMO_PHOTOS) {
        var cat = window.JEERE_DATA.DEMO_PHOTOS;
        Object.keys(cat).some(function (id) { if (cat[id] && cat[id].file === demo[1]) { key = 'demo:' + id; return true; } return false; });
      }
      if (!key && /^data:image\/(?:png|jpeg|webp|gif|avif|svg\+xml);base64,/.test(src)) key = src;
      if (!key) return null;
      var found = null;
      Object.keys(assetsAcc).some(function (id) { if (assetsAcc[id].src === key) { found = id; return true; } return false; });
      if (found) return found;
      var id = 'a' + (++assetSeq);
      assetsAcc[id] = { src: key };
      if (w) assetsAcc[id].w = Math.round(w);
      if (h) assetsAcc[id].h = Math.round(h);
      return id;
    }
    function svgAsset(el, color) {
      try {
        var c = el.cloneNode(true);
        var r = el.getBoundingClientRect();
        // the store styles its icons with CSS (stroke: currentColor…): written into the copy
        var src = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
        var dst = [c].concat(Array.prototype.slice.call(c.querySelectorAll('*')));
        src.forEach(function (s, i) {
          var st = getComputedStyle(s), d = dst[i];
          if (!d) return;
          SVG_PAINT.forEach(function (p) { var v = st.getPropertyValue(p); if (v) d.setAttribute(p, v); });
          d.removeAttribute('class');
          d.removeAttribute('style');
        });
        c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        c.setAttribute('width', String(Math.round(r.width)));
        c.setAttribute('height', String(Math.round(r.height)));
        c.removeAttribute('class');
        var txt = new XMLSerializer().serializeToString(c).replace(/currentColor/g, color || '#111');
        var b64 = btoa(unescape(encodeURIComponent(txt)));
        return assetFor('data:image/svg+xml;base64,' + b64, r.width, r.height);
      } catch (e) { return null; }
    }

    function gradientPaint(str, w, h) {
      var m = /^linear-gradient\((.*)\)$/.exec(str);
      if (!m) return null;
      var parts = splitTop(m[1]);
      var angle = 180;
      if (/deg$/.test(parts[0])) { angle = parseFloat(parts[0]); parts.shift(); }
      else if (/^to /.test(parts[0])) {
        var dir = parts.shift().slice(3).trim();
        var map = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135, 'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315 };
        angle = map[dir] !== undefined ? map[dir] : 180;
      }
      var stops = [];
      parts.forEach(function (p, i) {
        var cm = /^((?:rgba?|hsla?|oklch|oklab|color|lab|lch)\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s*(-?[\d.]+%)?/i.exec(p);
        if (!cm) return;
        var c = parseColor(cm[1]);
        if (!c) c = { r: 0, g: 0, b: 0, a: 0 };
        stops.push({ position: cm[2] ? parseFloat(cm[2]) / 100 : null, color: c });
      });
      if (stops.length < 2) return null;
      stops.forEach(function (s, i) { if (s.position === null) s.position = i / (stops.length - 1); });
      var t = angle * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t);
      var L = Math.abs(w * ux) + Math.abs(h * uy);
      var cx = w / 2, cy = h / 2;
      var W = w || 1, Hh = h || 1;
      return {
        type: 'linear', opacity: 1, blend: 'normal', visible: true,
        start: { x: round((cx - ux * L / 2) / W, 4), y: round((cy - uy * L / 2) / Hh, 4) },
        end: { x: round((cx + ux * L / 2) / W, 4), y: round((cy + uy * L / 2) / Hh, 4) },
        stops: stops.map(function (s) { return { position: round(s.position, 4), color: { r: round(s.color.r, 4), g: round(s.color.g, 4), b: round(s.color.b, 4), a: round(s.color.a, 4) } }; })
      };
    }
    function fillsOf(cs, w, h) {
      var out = [];
      var bg = parseColor(cs.backgroundColor);
      if (bg) out.push(solid(bg));
      var bi = cs.backgroundImage;
      if (bi && bi !== 'none') {
        splitTop(bi).reverse().forEach(function (layer) {
          if (/^linear-gradient/.test(layer)) { var g = gradientPaint(layer, w, h); if (g) out.push(g); }
          else if (/^url\(/.test(layer)) {
            var u = /^url\("?(.*?)"?\)$/.exec(layer);
            var a = u ? assetFor(u[1]) : null;
            if (a) out.push({ type: 'image', asset: a, fit: cs.backgroundSize === 'contain' ? 'fit' : 'fill', opacity: 1, blend: 'normal', visible: true });
          } else if (/gradient\(/.test(layer)) {
            // radial / conic: their first colour, flat (a documented approximation)
            var m = /((?:rgba?)\([^)]*\))/.exec(layer);
            var c = m ? parseColor(m[1]) : null;
            if (c) out.push(solid(c));
          }
        });
      }
      return out;
    }
    function shadowsOf(cs) {
      var s = cs.boxShadow;
      if (!s || s === 'none') return [];
      return splitTop(s).map(function (one) {
        var cm = /((?:rgba?|oklch|color)\([^)]*\)|#[0-9a-f]{3,8})/i.exec(one);
        var c = cm ? parseColor(cm[1]) : null;
        if (!c) return null;
        var rest = one.replace(cm[1], '').trim();
        var inset = /\binset\b/.test(rest);
        var nums = rest.replace('inset', '').trim().split(/\s+/).map(px);
        return { type: inset ? 'innerShadow' : 'dropShadow', x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: { r: round(c.r, 4), g: round(c.g, 4), b: round(c.b, 4), a: round(c.a, 4) }, visible: true };
      }).filter(Boolean);
    }
    function strokesOf(cs) {
      var w = { top: px(cs.borderTopWidth), right: px(cs.borderRightWidth), bottom: px(cs.borderBottomWidth), left: px(cs.borderLeftWidth) };
      var styles = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
      if (!(w.top || w.right || w.bottom || w.left)) return [];
      if (styles.every(function (s) { return s === 'none' || s === 'hidden'; })) return [];
      var c = parseColor(cs.borderTopColor) || parseColor(cs.borderLeftColor) || parseColor(cs.borderBottomColor);
      if (!c) return [];
      var uniform = w.top === w.right && w.right === w.bottom && w.bottom === w.left;
      var st = { paint: solid(c), width: uniform ? w.top : w, align: 'inside', cap: 'butt', join: 'miter', visible: true };
      if (styles[0] === 'dashed' || styles[0] === 'dotted') st.dash = [Math.max(2, w.top * 3), Math.max(2, w.top * 2)];
      return [st];
    }
    function cornersOf(cs) {
      return { tl: px(cs.borderTopLeftRadius), tr: px(cs.borderTopRightRadius), br: px(cs.borderBottomRightRadius), bl: px(cs.borderBottomLeftRadius), smoothing: 0 };
    }
    var BLEND_FROM_CSS = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'colorDodge', 'color-burn': 'colorBurn', 'hard-light': 'hardLight', 'soft-light': 'softLight', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', 'plus-lighter': 'linearDodge' };
    function effectsOf(cs) {
      var out = shadowsOf(cs);
      var kb = (DE.css && DE.css.K_BLUR) || 0.52;
      var f = /blur\(([\d.]+)px\)/.exec(cs.filter || '');
      if (f && parseFloat(f[1]) > 0) out.push({ type: 'layerBlur', radius: round(parseFloat(f[1]) / kb, 1), visible: true });
      var bf = /blur\(([\d.]+)px\)/.exec(cs.backdropFilter || cs.webkitBackdropFilter || '');
      if (bf && parseFloat(bf[1]) > 0) out.push({ type: 'backgroundBlur', radius: round(parseFloat(bf[1]) / kb, 1), visible: true });
      return out;
    }
    /* the store's whole font stack (its fallbacks draw the glyphs a web font lacks, e.g. the narrow
     * no-break space of French punctuation), each name checked */
    function familyOf(cs) {
      var names = String(cs.fontFamily || 'Inter').split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); })
        .filter(function (x) { return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(x); }).slice(0, 6);
      return names.length ? names.join(', ') : 'Inter';
    }
    function textStyleOf(cs) {
      var lh = cs.lineHeight === 'normal' ? { unit: 'auto' } : { unit: 'px', value: round(px(cs.lineHeight), 2) };
      var ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing);
      var col = parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
      var align = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : cs.textAlign === 'justify' ? 'justify' : 'left';
      var tt = cs.textTransform;
      var dec = String(cs.textDecorationLine || cs.textDecoration || '');
      return {
        family: familyOf(cs), weight: parseInt(cs.fontWeight, 10) || 400, italic: cs.fontStyle === 'italic', size: round(px(cs.fontSize), 2) || 16,
        lineHeight: lh, letterSpacing: { unit: 'px', value: round(ls, 2) }, paragraphSpacing: 0, paragraphIndent: 0, align: align, verticalAlign: 'top',
        case: tt === 'uppercase' ? 'upper' : tt === 'lowercase' ? 'lower' : tt === 'capitalize' ? 'title' : 'none',
        decoration: /underline/.test(dec) ? 'underline' : /line-through/.test(dec) ? 'strike' : 'none', fills: [solid(col)]
      };
    }

    var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, SPAN: 1, BR: 1, S: 1, U: 1, SUP: 1, SUB: 1, MARK: 1, ABBR: 1, TIME: 1, DEL: 1, INS: 1, Q: 1, CITE: 1, DATA: 1 };
    var SKIP = { STYLE: 1, SCRIPT: 1, NOSCRIPT: 1, TEMPLATE: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1 };
    function shown(el, cs) {
      if (!el || !cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect();
      return r.width > 0.5 || r.height > 0.5;
    }
    function directText(el) {
      for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) return true;
      return false;
    }
    /* the children walked by the converter: elements, and the text runs of mixed content */
    function kidNodes(el) {
      var mixed = directText(el);
      var out = [];
      for (var c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) out.push(c);
        else if (mixed && c.nodeType === 3 && c.nodeValue.trim()) out.push(c);
      }
      return out;
    }
    function isTextLeaf(el) {
      if (!el.textContent.trim()) return false;
      var stack = Array.prototype.slice.call(el.children);
      while (stack.length) {
        var c = stack.shift();
        if (!INLINE[c.tagName]) return false;
        var d = getComputedStyle(c);
        if (d.display !== 'inline' && c.tagName !== 'BR' && d.display !== 'contents') return false;
        if (parseColor(d.backgroundColor) || (d.backgroundImage && d.backgroundImage !== 'none')) return false;
        stack = stack.concat(Array.prototype.slice.call(c.children));
      }
      return true;
    }
    /* the element's text as DualEngine rich text: <br> (or a newline in pre-line text) starts a
     * paragraph; an inline child whose look differs (a coloured word, an italic) becomes a run */
    var RUN_KEYS = ['weight', 'italic', 'size', 'decoration', 'case', 'fills', 'family', 'letterSpacing'];
    function richTextOf(el, cs) {
      var pre = /pre/.test(cs.whiteSpace);
      var keepNl = pre || /pre-line/.test(cs.whiteSpace);
      var base = textStyleOf(cs);
      var paras = [[]];
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) {
            var styleOwner = c.parentNode;
            var st = null;
            if (styleOwner !== el && styleOwner.nodeType === 1) {
              var full = textStyleOf(getComputedStyle(styleOwner)), d = {};
              RUN_KEYS.forEach(function (k) { if (JSON.stringify(full[k]) !== JSON.stringify(base[k])) d[k] = full[k]; });
              if (Object.keys(d).length) st = d;
            }
            var txt = c.nodeValue;
            var chunks = keepNl ? txt.split('\n') : [txt.replace(/\n/g, ' ')];
            chunks.forEach(function (ch, i) {
              if (i) paras.push([]);
              paras[paras.length - 1].push({ text: ch, style: st });
            });
          } else if (c.nodeType === 1) {
            if (c.tagName === 'BR') paras.push([]);
            else if (!SKIP[c.tagName]) walk(c);
          }
        }
      })(el);
      var out = paras.map(function (runs) {
        if (!pre) {
          // white-space: normal — collapse every run of spaces, trim the paragraph's ends
          var joined = [];
          runs.forEach(function (r) { var t = r.text.replace(/[ \t\r\f\v]+/g, ' '); if (joined.length && / $/.test(joined[joined.length - 1].text) && /^ /.test(t)) t = t.slice(1); joined.push({ text: t, style: r.style }); });
          if (joined.length) { joined[0].text = joined[0].text.replace(/^ +/, ''); joined[joined.length - 1].text = joined[joined.length - 1].text.replace(/ +$/, ''); }
          runs = joined;
        }
        // neighbouring runs with the same look merge
        var merged = [];
        runs.forEach(function (r) {
          var last = merged[merged.length - 1];
          if (last && JSON.stringify(last.style) === JSON.stringify(r.style)) last.text += r.text;
          else if (r.text || !merged.length) merged.push({ text: r.text, style: r.style });
        });
        return { runs: merged.map(function (r) { return r.style ? { text: r.text, style: r.style } : { text: r.text }; }) };
      });
      while (out.length > 1 && out[0].runs.every(function (r) { return !r.text; })) out.shift();
      while (out.length > 1 && out[out.length - 1].runs.every(function (r) { return !r.text; })) out.pop();
      return { paragraphs: out.length ? out : [{ runs: [{ text: '' }] }] };
    }
    function hasBox(cs) {
      if (parseColor(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none')) return true;
      if (cs.boxShadow && cs.boxShadow !== 'none') return true;
      if (px(cs.borderTopWidth) || px(cs.borderLeftWidth) || px(cs.borderBottomWidth) || px(cs.borderRightWidth)) return true;
      return false;
    }
    /* a CSS border the engine draws as a real border (per-side widths, dashes: §3.4) already counts
     * in the engine's insets; a uniform solid one is a box-shadow there, so it joins the padding */
    function realBorder(cs) {
      var w = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
      if (!(w[0] || w[1] || w[2] || w[3])) return false;
      if (!(w[0] === w[1] && w[1] === w[2] && w[2] === w[3])) return true;
      return /dashed|dotted/.test(cs.borderTopStyle);
    }
    function padOf(cs) {
      var b = realBorder(cs) ? 0 : 1;
      return { top: px(cs.paddingTop) + b * px(cs.borderTopWidth), right: px(cs.paddingRight) + b * px(cs.borderRightWidth), bottom: px(cs.paddingBottom) + b * px(cs.borderBottomWidth), left: px(cs.paddingLeft) + b * px(cs.borderLeftWidth) };
    }
    var TAG_KEEP = { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', P: 'p', A: 'a', BUTTON: 'button', UL: 'ul', LI: 'li', NAV: 'nav', SECTION: 'section', ARTICLE: 'article', HEADER: 'header', FOOTER: 'footer', ASIDE: 'aside', LABEL: 'label', SPAN: 'span' };
    var TEXT_TAGS = { h1: 1, h2: 1, h3: 1, h4: 1, p: 1, span: 1, li: 1, label: 1 };
    var BOX_TAGS = { section: 1, article: 1, nav: 1, header: 1, footer: 1, aside: 1, ul: 1, li: 1, button: 1 };
    /* the semantic tag of a converted element (SPEC §0.4): headings and paragraphs for texts, links
     * with a real address, buttons, lists and landmarks for frames — div / p otherwise */
    function semTag(n, el, kind) {
      var t = TAG_KEEP[el.tagName] || null;
      var realLink = el.tagName === 'A' && !!EN.href(el.getAttribute('href') || '') && (el.getAttribute('href') || '#') !== '#';
      if (n.type === 'image') return 'img';
      if (n.type === 'text') {
        if (realLink) return 'a';
        if (t && TEXT_TAGS[t]) return t;
        return /^(A|BUTTON)$/.test(el.tagName) ? 'span' : 'p';
      }
      if (realLink) return 'a';
      if (t && BOX_TAGS[t]) return t;
      return 'div';
    }
    var SVG_PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule'];
    function nameOf(el, kind) {
      var cls = typeof el.className === 'string' ? el.className : '';
      var NAMES = { title: 'Titre', kicker: 'Petit titre', text: 'Texte', btn: 'Bouton', button: 'Bouton', price: 'Prix', badge: 'Badge', card: 'Carte', grid: 'Grille', media: 'Image', img: 'Image', name: 'Nom', head: 'En-tête', wrap: 'Contenu', copy: 'Texte', actions: 'Actions', stars: 'Étoiles', quote: 'Citation', author: 'Auteur', zone: 'Zone', zones: 'Zones', icon: 'Icône', panel: 'Panneau', sign: 'Signature', item: 'Élément', rating: 'Note', cat: 'Catégorie', arrow: 'Flèche', fav: 'Favori' };
      var parts = cls.split(/\s+/).filter(function (c) { return /^jst-/.test(c); }).map(function (c) { return c.replace(/^jst-/, '').replace(/--.*$/, ''); });
      for (var i = 0; i < parts.length; i++) {
        var segs = parts[i].split('-');
        for (var j = segs.length - 1; j >= 0; j--) if (NAMES[segs[j]]) return NAMES[segs[j]];
      }
      return kind === 'text' ? 'Texte' : kind === 'image' ? 'Image' : kind === 'rect' ? 'Forme' : 'Cadre';
    }

    /* What a converted element keeps of the store (wave 1): its behaviour (render.js's delegated clicks read
     * data-jst-action: « Ajouter » still adds to the cart, a card still opens its product), its aria-label,
     * a new tab; and, inside a product card, its binding to the catalogue (name, price, photo), so the
     * detached section keeps following the products (engine-sections.js boundSection). */
    var BEHAVIOUR_DATA = ['data-product', 'data-page', 'data-page-id', 'data-section', 'data-delta', 'data-quick'];
    function keepBehaviour(n, el) {
      if (!el || !el.getAttribute) return;
      var attrs = n.semantic.attrs || (n.semantic.attrs = {});
      var a = el.getAttribute('data-jst-action');
      if (a) {
        attrs['data-jst-action'] = a;
        BEHAVIOUR_DATA.forEach(function (k) { var v = el.getAttribute(k); if (v) attrs[k] = v; });
        if (!attrs.href && el.tagName === 'A' && n.type !== 'image' && EN.href(el.getAttribute('href') || '')) { attrs.href = EN.href(el.getAttribute('href')); n.semantic.tag = 'a'; }
      }
      var al = el.getAttribute('aria-label');
      if (al && n.type !== 'image') attrs['aria-label'] = al.slice(0, 160);
      if (el.getAttribute('target') === '_blank' && attrs.href) attrs.target = '_blank';
    }
    function bindingOf(el, n) {
      var host = el && el.nodeType === 3 ? el.parentElement : el;
      var card = host && host.closest ? host.closest('[data-product-id]') : null;
      if (!card) return null;
      var pid = card.getAttribute('data-product-id');
      if (!pid) return null;
      if (n.type === 'image' && host.tagName === 'IMG') return { product: pid, field: 'image' };
      if (n.type !== 'text') return null;
      if (host.closest('.jst-price') || (host.matches && host.matches('.jst-card-price, .jst-pdp-price, .jst-line-price')) || (host.querySelector && host.querySelector('.jst-price') && !host.querySelector('.jst-card-name'))) return { product: pid, field: 'price' };
      if (/jst-[\w-]*name\b/.test(String(host.className || '')) || host.closest('.jst-card-name, .jst-pdp-name, .jst-line-name')) return { product: pid, field: 'name' };
      return null;
    }

    /**
     * Free DualEngine nodes from the section rendered at the three breakpoints (same markup at every
     * width, so the three trees are walked in parallel; base = 1200).
     */
    function convertSection(els) {
      var nodes = {};
      assetsAcc = {}; assetSeq = 0;
      var origin = {};
      BPS.forEach(function (b) { origin[b.id] = els[b.id] ? els[b.id].getBoundingClientRect() : null; });
      function rectOf(bp, el) {
        var r = el.getBoundingClientRect(), o = origin[bp];
        return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      }
      function info(bp, el) {
        if (!el) return null;
        if (el.nodeType === 3) {
          // a run of text beside an icon (« [pin] Depuis Abidjan »): its box from a Range
          var pcs = getComputedStyle(el.parentNode);
          var rg = document.createRange();
          rg.selectNodeContents(el);
          var tr = rg.getBoundingClientRect(), o = origin[bp];
          if (!(tr.width > 0.5) || pcs.display === 'none' || pcs.visibility === 'hidden') return { el: el, cs: pcs, hidden: true, textNode: true };
          return { el: el, cs: pcs, textNode: true, r: { x: tr.left - o.left, y: tr.top - o.top, w: tr.width, h: tr.height } };
        }
        var cs = getComputedStyle(el);
        if (!shown(el, cs)) return { el: el, cs: cs, hidden: true };
        return { el: el, cs: cs, r: rectOf(bp, el) };
      }

      function make(type, name, inf) {
        var n = M.createNode(type, { name: name });
        delete n.meta;
        nodes[n.id] = n;
        return n;
      }
      function visuals(n, inf, bp, isText) {
        var cs = inf.cs, r = inf.r;
        var v = {};
        if (!isText) v.fills = fillsOf(cs, r.w, r.h);
        v.strokes = strokesOf(cs);
        v.effects = effectsOf(cs);
        v.corners = cornersOf(cs);
        v.opacity = round(parseFloat(cs.opacity), 3);
        if (!(v.opacity >= 0)) v.opacity = 1;
        return v;
      }
      function applyVisuals(n, base, others) {
        ['fills', 'strokes', 'effects', 'corners', 'opacity'].forEach(function (k) { if (base[k] !== undefined) n[k] = base[k]; });
        Object.keys(others).forEach(function (bp) {
          var o = others[bp];
          if (!o) return;
          ['fills', 'strokes', 'effects', 'corners', 'opacity'].forEach(function (k) {
            if (o[k] !== undefined && JSON.stringify(o[k]) !== JSON.stringify(base[k])) setOv(n, bp, k, o[k]);
          });
        });
      }
      function setOv(n, bp, k, v) {
        n.overrides[bp] = n.overrides[bp] || {};
        if (v && typeof v === 'object' && !Array.isArray(v) && n.overrides[bp][k] && typeof n.overrides[bp][k] === 'object') Object.assign(n.overrides[bp][k], v);
        else n.overrides[bp][k] = v;
      }

      /* one element (mirrors: { base, tablet, phone } infos) → a node id, or null */
      function convert(infs, parent) {
        var b = infs.base && !infs.base.hidden ? infs.base : (infs.tablet && !infs.tablet.hidden ? infs.tablet : (infs.phone && !infs.phone.hidden ? infs.phone : null));
        if (!b) return null;
        var bpOfB = b === infs.base ? 'base' : (b === infs.tablet ? 'tablet' : 'phone');
        var el = b.el, cs = b.cs, tag = el.tagName;
        var n;
        var kind;
        if (b.textNode) {
          n = make('text', 'Texte');
          var raw = String(el.nodeValue || '');
          n.text = M.richText(/pre/.test(cs.whiteSpace) ? raw : raw.replace(/\s+/g, ' ').trim());
          n.style = textStyleOf(cs);
          n.semantic.tag = 'span';
          n.resize = 'autoWidth';
          var tb = bindingOf(el, n);
          if (tb) n.bind = tb;
          ['tablet', 'phone'].forEach(function (bp) {
            var i = infs[bp];
            if (!i || i.hidden || bp === bpOfB) return;
            var st = textStyleOf(i.cs), diff = {};
            Object.keys(st).forEach(function (k) { if (JSON.stringify(st[k]) !== JSON.stringify(n.style[k])) diff[k] = st[k]; });
            if (Object.keys(diff).length) setOv(n, bp, 'text', diff);
          });
          var cv = true;
          BPS.forEach(function (bp) { var i = infs[bp.id], v = !!(i && !i.hidden); if (bp.id === 'base') { if (!v) n.visible = false; cv = v; } else if (v !== cv) { setOv(n, bp.id, 'visible', v); cv = v; } });
          return n.id;
        }
        if (SKIP[tag]) return null;
        if (tag === 'IMG') kind = 'image';
        else if (tag === 'svg' || tag === 'SVG') kind = 'svg';
        else if (!el.children.length && !el.textContent.trim()) kind = hasBox(cs) ? 'rect' : null;
        else if (isTextLeaf(el)) kind = hasBox(cs) || hasStaticPseudo(el) || (px(cs.paddingLeft) + px(cs.paddingTop) > 0 && (tag === 'A' || tag === 'BUTTON')) ? 'boxtext' : 'text';
        else kind = 'frame';    // and mixed content (text beside an icon): its text runs become texts
        if (!kind) return null;

        if (kind === 'image') {
          n = make('image', el.alt ? 'Image' : nameOf(el, 'image'));
          n.asset = assetFor(el.currentSrc || el.src, el.naturalWidth, el.naturalHeight) || '';
          n.fit = cs.objectFit === 'contain' ? 'fit' : 'fill';
          n.alt = String(el.alt || '').slice(0, 200);
          // the focal point of a cropped photo (object-position) → a crop of the same position
          var op = String(cs.objectPosition || '50% 50%').split(/\s+/).map(function (v) { return /%$/.test(v) ? parseFloat(v) / 100 : 0.5; });
          if (n.fit === 'fill' && (Math.abs(op[0] - 0.5) > 0.005 || Math.abs((op[1] === undefined ? 0.5 : op[1]) - 0.5) > 0.005)) {
            n.fit = 'crop';
            n.crop = { x: round(op[0] * 0.5, 4), y: round((op[1] === undefined ? 0.5 : op[1]) * 0.5, 4), w: 0.5, h: 0.5 };
          }
          if (!n.asset) { n.type = 'rect'; delete n.asset; delete n.fit; delete n.alt; delete n.crop; n.semantic = { tag: 'div', attrs: {} }; n.fills = [solid({ r: 0.9, g: 0.88, b: 0.85, a: 1 })]; }
        } else if (kind === 'svg') {
          var aid = svgAsset(el, cs.color);
          if (!aid) return null;
          n = make('image', 'Illustration');
          n.asset = aid; n.fit = 'fit'; n.alt = '';
        } else if (kind === 'rect') {
          n = make('rect', nameOf(el, 'rect'));
          n.layoutChild.widthMode = 'fixed';
        } else if (kind === 'text') {
          n = make('text', nameOf(el, 'text'));
          n.text = richTextOf(el, cs);
          n.style = textStyleOf(cs);
          n.resize = 'autoHeight';
        } else {
          n = make('frame', nameOf(el, 'frame'));
        }
        n.semantic.tag = semTag(n, el, kind);
        if (n.semantic.tag === 'a') { var h = EN.href(el.getAttribute('href') || ''); if (h) n.semantic.attrs.href = h; }
        keepBehaviour(n, el);
        var bnd = bindingOf(el, n);
        if (bnd) n.bind = bnd;

        // visuals per breakpoint
        var vis = {};
        BPS.forEach(function (bp) { var i = infs[bp.id]; if (i && !i.hidden) vis[bp.id] = visuals(n, i, bp.id, n.type === 'text'); });
        var vb = vis[bpOfB];
        applyVisuals(n, vb, { tablet: bpOfB !== 'tablet' ? vis.tablet : null, phone: bpOfB !== 'phone' ? vis.phone : null });
        if (n.type === 'text') {
          ['tablet', 'phone'].forEach(function (bp) {
            var i = infs[bp];
            if (!i || i.hidden || bp === bpOfB) return;
            var st = textStyleOf(i.cs), diff = {};
            Object.keys(st).forEach(function (k) { if (JSON.stringify(st[k]) !== JSON.stringify(n.style[k])) diff[k] = st[k]; });
            if (Object.keys(diff).length) setOv(n, bp, 'text', diff);
          });
        }
        var bm = BLEND_FROM_CSS[cs.mixBlendMode];
        if (bm && bm !== 'normal') n.blendMode = bm;
        // visibility per breakpoint
        var curVisible = true;
        BPS.forEach(function (bp) {
          var i = infs[bp.id];
          var vis2 = !!(i && !i.hidden);
          if (bp.id === 'base') { if (!vis2) n.visible = false; curVisible = vis2; }
          else if (vis2 !== curVisible) { setOv(n, bp.id, 'visible', vis2); curVisible = vis2; }
        });

        // the text inside a box (a button, a badge, a kicker with its line): a stack frame around a
        // text child, with the store's static ::before / ::after as rects in the flow
        if (kind === 'boxtext') {
          var isBtn = /^(A|BUTTON)$/.test(tag) || /btn/.test(String(el.className));
          var t = make('text', isBtn ? 'Libellé' : 'Texte');
          t.text = richTextOf(el, cs);
          t.style = textStyleOf(cs);
          t.semantic.tag = 'span';
          t.parent = n.id;
          n.children = [t.id];
          var tbd = bindingOf(el, t);
          if (tbd) t.bind = tbd;
          if (isBtn) n.name = 'Bouton';
          var pad = padOf(cs);
          var flexRow = /flex/.test(cs.display) && !/column/.test(cs.flexDirection);
          var justify = flexRow ? (/center/.test(cs.justifyContent) ? 'center' : /end/.test(cs.justifyContent) ? 'end' : 'start') : 'start';
          var crossC = flexRow ? (/center/.test(cs.alignItems) ? 'center' : /end/.test(cs.alignItems) ? 'end' : /baseline/.test(cs.alignItems) ? 'baseline' : 'start') : 'start';
          n.layoutParent = { mode: 'stack', direction: flexRow ? 'horizontal' : 'vertical', wrap: false, gap: flexRow ? round(px(cs.columnGap), 1) : 0, padding: pad, alignMain: justify, alignCross: crossC, clip: cs.overflow === 'hidden' };
          ['tablet', 'phone'].forEach(function (bp) {
            var i = infs[bp];
            if (!i || i.hidden || bp === bpOfB) return;
            var p2 = padOf(i.cs), d2 = {};
            if (JSON.stringify(p2) !== JSON.stringify(pad)) d2.padding = p2;
            var g2 = flexRow ? round(px(i.cs.columnGap), 1) : 0;
            if (g2 !== n.layoutParent.gap) d2.gap = g2;
            if (Object.keys(d2).length) setOv(n, bp, 'layoutParent', d2);
            var st = textStyleOf(i.cs), diff = {};
            Object.keys(st).forEach(function (k) { if (JSON.stringify(st[k]) !== JSON.stringify(t.style[k])) diff[k] = st[k]; });
            if (Object.keys(diff).length) { t.overrides[bp] = t.overrides[bp] || {}; t.overrides[bp].text = diff; }
          });
          // single line at every width in a row: the label hugs; otherwise it fills the box (and wraps)
          var multi = BPS.some(function (bp) { var i = infs[bp.id]; if (!i || i.hidden) return false; var lh = px(i.cs.lineHeight) || px(i.cs.fontSize) * 1.3; return i.r.h - padOf(i.cs).top - padOf(i.cs).bottom > lh * 1.6; });
          if (multi || !flexRow) { t.resize = 'autoHeight'; t.layoutChild.widthMode = 'fill'; t.layoutChild.heightMode = 'hug'; if (flexRow) t.layoutChild.grow = 1; }
          else { t.resize = 'autoWidth'; t.layoutChild.widthMode = 'hug'; t.layoutChild.heightMode = 'hug'; }
          t.geometry.w = round(b.r.w - pad.left - pad.right); t.geometry.h = round(b.r.h - pad.top - pad.bottom);
          pseudos(n, el, infs, bpOfB, true);
          return n.id;
        }

        if (n.type === 'frame') {
          n.children = [];
          n.layoutParent = { mode: 'absolute', clip: cs.overflow === 'hidden' || cs.overflowX === 'hidden' };
          n.clipsContent = n.layoutParent.clip;
          // the children, walked in parallel at the three widths
          var kidsB = kidNodes(el);
          var mirrors = {};
          BPS.forEach(function (bp) {
            var i = infs[bp.id];
            var list = i ? kidNodes(i.el) : [];
            mirrors[bp.id] = list.length === kidsB.length ? list : null;
          });
          var kidInfos = kidsB.map(function (kel, k) {
            var ki = {};
            BPS.forEach(function (bp) { ki[bp.id] = mirrors[bp.id] ? info(bp.id, mirrors[bp.id][k]) : null; });
            return ki;
          });
          kidInfos.forEach(function (ki) {
            var cid = convert(ki, n);
            if (cid) { nodes[cid].parent = n.id; n.children.push(cid); nodes[cid]._inf = ki; }
          });
          pseudos(n, el, infs, bpOfB, false);
          layoutContainer(n, infs, bpOfB);
          n.children.forEach(function (cid) { delete nodes[cid]._inf; });
        }
        return n.id;
      }

      /* ---- the store's ::before / ::after (scrims, frames, kicker lines, dots) as rects */
      function pseudoAt(el, pe) {
        var pcs;
        try { pcs = getComputedStyle(el, pe); } catch (e) { return null; }
        if (!pcs || pcs.content === 'none' || pcs.content === 'normal' || pcs.display === 'none') return null;
        var w = px(pcs.width), h = px(pcs.height);
        if (!(w > 0 && h > 0)) return null;
        var fills = fillsOf(pcs, w, h), strokes = strokesOf(pcs);
        if (!fills.length && !strokes.length) return null;
        return { cs: pcs, w: w, h: h, fills: fills, strokes: strokes, abs: pcs.position === 'absolute' };
      }
      function pseudos(n, el, infs, bpB, inFlow) {
        ['::before', '::after'].forEach(function (pe) {
          var per = {};
          BPS.forEach(function (bp) { var i = infs[bp.id]; per[bp.id] = i && !i.hidden ? pseudoAt(i.el, pe) : null; });
          var ref = per[bpB] || per.base || per.tablet || per.phone;
          if (!ref) return;
          if (ref.abs && infs[bpB] && infs[bpB].cs.position === 'static') return;
          if (!ref.abs && !inFlow) return;
          if (!ref.abs && !/block|flex|grid/.test(ref.cs.display)) return;
          var r = make('rect', ref.abs ? (ref.strokes.length && !ref.fills.length ? 'Cadre décoratif' : 'Voile') : 'Trait');
          r.parent = n.id;
          r._pseudo = true;
          var base = null;
          BPS.forEach(function (bp) {
            var p = per[bp.id], i = infs[bp.id];
            var g, lc, vis = { fills: null, strokes: null, corners: null, opacity: null };
            if (p) {
              if (p.abs) {
                g = { x: round(px(p.cs.left) + px(i.cs.borderLeftWidth), 2), y: round(px(p.cs.top) + px(i.cs.borderTopWidth), 2), w: round(p.w, 2), h: round(p.h, 2) };
                var W = i.r.w, Hh = i.r.h;
                lc = { position: 'absolute', widthMode: 'fixed', heightMode: 'fixed', constraints: consOf(g, { w: W, h: Hh }) };
              } else {
                g = { x: 0, y: 0, w: round(p.w, 2), h: round(p.h, 2) };
                lc = { position: 'flow', widthMode: 'fixed', heightMode: 'fixed' };
              }
              vis = { fills: p.fills, strokes: p.strokes, corners: cornersOf(p.cs), opacity: round(parseFloat(p.cs.opacity), 3) };
              if (!(vis.opacity >= 0)) vis.opacity = 1;
            }
            if (!base && p) {
              base = bp.id;
              r.geometry = Object.assign(r.geometry, g);
              r.layoutChild = lc;
              r.fills = vis.fills; r.strokes = vis.strokes; r.corners = vis.corners; r.opacity = vis.opacity;
              if (bp.id !== 'base') r.visible = false;
              if (bp.id !== 'base') setOv(r, bp.id, 'visible', true);
              return;
            }
            if (!base) return;
            if (!p) { if (r.visible !== false || (r.overrides[bp.id] && r.overrides[bp.id].visible)) setOv(r, bp.id, 'visible', false); return; }
            if (r.visible === false || (bp.id === 'phone' && r.overrides.tablet && r.overrides.tablet.visible === false)) setOv(r, bp.id, 'visible', true);
            var gd = {};
            ['x', 'y', 'w', 'h'].forEach(function (k) { if (Math.abs(g[k] - r.geometry[k]) > 0.01) gd[k] = g[k]; });
            if (Object.keys(gd).length) setOv(r, bp.id, 'geometry', gd);
            ['fills', 'strokes', 'corners', 'opacity'].forEach(function (k) { if (JSON.stringify(vis[k]) !== JSON.stringify(r[k])) setOv(r, bp.id, k, vis[k]); });
            if (lc.constraints && JSON.stringify(lc.constraints) !== JSON.stringify(r.layoutChild.constraints)) setOv(r, bp.id, 'layoutChild', { constraints: lc.constraints });
          });
          if (pe === '::before') n.children.unshift(r.id); else n.children.push(r.id);
        });
      }
      function hasStaticPseudo(el) {
        return ['::before', '::after'].some(function (pe) { var p = pseudoAt(el, pe); return !!(p && !p.abs && /block|flex|grid/.test(p.cs.display)); });
      }

      /* ---- layout inference for one container */
      function kidRects(n, bp) {
        return n.children.map(function (cid) {
          var c = nodes[cid], ki = c._inf;
          var i = ki ? ki[bp] : null;
          return { id: cid, n: c, i: i, r: i && !i.hidden ? i.r : null, abs: c._pseudo || (i && !i.hidden && !i.textNode && (i.cs.position === 'absolute' || i.cs.position === 'fixed')) };
        });
      }
      function inferStack(n, inf, bp) {
        // → { mode, direction, gap, spacers[], padding, alignMain, alignCross, wrap } or null (free positions)
        var cs = inf.cs, r = inf.r;
        var kids = kidRects(n, bp).filter(function (k) { return k.r && !k.abs; });
        var pad = padOf(cs);
        if (!kids.length) return { mode: 'stack', direction: 'vertical', gap: 0, padding: pad, alignMain: 'start', alignCross: 'start', wrap: false, spacers: [] };
        var disp = cs.display;
        var dir = null, wrap = false, gapCss = 0;
        if (/flex/.test(disp)) {
          if (/reverse/.test(cs.flexDirection)) return null;
          dir = /column/.test(cs.flexDirection) ? 'vertical' : 'horizontal';
          wrap = cs.flexWrap !== 'nowrap';
          gapCss = px(dir === 'vertical' ? cs.rowGap : cs.columnGap);
        } else if (/grid/.test(disp)) {
          return null;
        } else {
          // block flow: children one under the other, or one row of inline-blocks
          var vertical = true;
          for (var i = 1; i < kids.length; i++) if (kids[i].r.y < kids[i - 1].r.y + kids[i - 1].r.h - 1) { vertical = false; break; }
          if (vertical) dir = 'vertical';
          else {
            var sameRow = kids.every(function (k) { return Math.abs(k.r.y - kids[0].r.y) < 2 || Math.abs((k.r.y + k.r.h / 2) - (kids[0].r.y + kids[0].r.h / 2)) < 2; });
            if (!sameRow) return null;
            dir = 'horizontal';
          }
        }
        var main = dir === 'vertical' ? 'y' : 'x', mainS = dir === 'vertical' ? 'h' : 'w';
        // order along the main axis must be the DOM order (no `order`, no overlap) — or lines when wrapping
        var lines = [[kids[0]]];
        for (var j = 1; j < kids.length; j++) {
          var prev = kids[j - 1], cur = kids[j];
          var crossPrev = dir === 'vertical' ? 'x' : 'y';
          if (cur.r[main] < prev.r[main] + prev.r[mainS] - 1) {
            if (wrap && cur.r[crossPrev] > prev.r[crossPrev] + 1) { lines.push([cur]); continue; }
            return null;
          }
          lines[lines.length - 1].push(cur);
        }
        if (lines.length > 1 && !wrap) return null;
        var gaps = [];
        lines.forEach(function (ln) { for (var g = 1; g < ln.length; g++) gaps.push(ln[g].r[main] - (ln[g - 1].r[main] + ln[g - 1].r[mainS])); });
        var spaceBetween = /space-between/.test(cs.justifyContent) && lines.length === 1 && kids.length > 1;
        var gap = gaps.length ? Math.min.apply(null, gaps) : gapCss;
        if (gap < -0.5) return null;
        gap = Math.max(0, round(gap, 2));
        // uneven gaps: a spacer (a flow child, so the gap counts twice around it) — when one gap is
        // too short for that, no common gap: a spacer between every two children
        var spacers = [];
        if (!spaceBetween && !wrap) {
          if (gaps.some(function (g) { return g - gap > 0.25 && g - 2 * gap < 0; })) gap = 0;
          gaps.forEach(function (g, gi) { if (g - gap > 0.25) spacers.push({ after: kids[gi].id, size: round(g - 2 * gap, 2) }); });
        }
        // padding from the real offsets of the first and last children (margins included)
        var first = kids[0].r, last = kids[kids.length - 1].r;
        var p = { top: pad.top, right: pad.right, bottom: pad.bottom, left: pad.left };
        if (dir === 'vertical') {
          p.top = Math.max(0, round(first.y - r.y, 1));
          var contentBottom = Math.max.apply(null, kids.map(function (k) { return k.r.y + k.r.h; }));
          p.bottom = Math.max(0, round(r.y + r.h - contentBottom, 1));
        } else if (lines.length === 1) {
          p.left = Math.max(0, round(first.x - r.x, 1));
          if (!/center|end|between|around|evenly/.test(cs.justifyContent)) p.right = Math.max(0, round(pad.right, 1));
          var minY = Math.min.apply(null, kids.map(function (k) { return k.r.y; }));
          if (/start|normal|stretch|baseline/.test(cs.alignItems) || !/flex/.test(disp)) p.top = Math.max(0, round(minY - r.y, 1));
        }
        var aMain = spaceBetween ? 'spaceBetween' : /center/.test(cs.justifyContent) ? 'center' : /end/.test(cs.justifyContent) ? 'end' : 'start';
        var aCross = 'start';
        if (/flex/.test(disp)) aCross = /center/.test(cs.alignItems) ? 'center' : /end/.test(cs.alignItems) ? 'end' : /baseline/.test(cs.alignItems) ? 'baseline' : (/stretch|normal/.test(cs.alignItems) ? 'stretch' : 'start');
        if (dir === 'vertical' && !/flex/.test(disp)) aCross = 'start';
        if (dir === 'horizontal' && !/flex/.test(disp)) aCross = 'start';
        var rowGap = wrap && lines.length > 1 ? Math.max(0, round(lines[1][0].r[dir === 'vertical' ? 'x' : 'y'] - (lines[0][0].r[dir === 'vertical' ? 'x' : 'y'] + Math.max.apply(null, lines[0].map(function (k) { return k.r[dir === 'vertical' ? 'w' : 'h']; }))), 1)) : undefined;
        return { mode: 'stack', direction: dir, gap: spaceBetween ? 'auto' : gap, padding: p, alignMain: aMain, alignCross: aCross, wrap: wrap && lines.length > 1, rowGap: rowGap, spacers: spacers, kids: kids };
      }
      function inferGrid(n, inf, bp) {
        var cs = inf.cs;
        if (!/grid/.test(cs.display)) return null;
        var cols = String(cs.gridTemplateColumns || '').trim().split(/\s+/).filter(function (t) { return /px$/.test(t); }).map(px);
        if (!cols.length) return null;
        var kids = kidRects(n, bp).filter(function (k) { return k.r && !k.abs; });
        // auto placement only (the engine places in DOM order, like CSS without explicit lines)
        var placed = kids.some(function (k) { var c2 = k.i.cs; return (c2.gridColumnStart && c2.gridColumnStart !== 'auto' && !/^span/.test(c2.gridColumnStart)) || (c2.gridRowStart && c2.gridRowStart !== 'auto' && !/^span/.test(c2.gridRowStart)); });
        if (placed || String(cs.gridAutoFlow).indexOf('dense') !== -1 || /column/.test(cs.gridAutoFlow)) return null;
        var equal = cols.every(function (c) { return Math.abs(c - cols[0]) < 1; });
        var tracks = cols.map(function (c) { return equal ? { kind: 'fr', value: 1 } : { kind: 'fr', value: round(c / cols[0], 3) }; });
        var pad = padOf(cs);
        return { mode: 'grid', columns: tracks, rows: [], columnGap: round(px(cs.columnGap), 1), rowGap: round(px(cs.rowGap), 1), padding: pad, kids: kids };
      }
      function layoutContainer(n, infs, bpB) {
        var plan = {};
        BPS.forEach(function (bp) {
          var i = infs[bp.id];
          if (!i || i.hidden) return;
          plan[bp.id] = inferGrid(n, i, bp.id) || inferStack(n, i, bp.id);
        });
        var modes = Object.keys(plan).map(function (k) { return plan[k] ? plan[k].mode : 'absolute'; });
        var same = modes.every(function (m) { return m === modes[0]; });
        var basePlan = plan[bpB];
        // spacers (uneven gaps) need the same direction at every breakpoint that has some
        var anySpacer = Object.keys(plan).some(function (k) { return plan[k] && plan[k].spacers && plan[k].spacers.length; });
        var dirSame = Object.keys(plan).every(function (k) { return !plan[k] || plan[k].direction === (basePlan && basePlan.direction); });
        if (!basePlan || !same || modes[0] === 'absolute' || (basePlan.mode === 'stack' && anySpacer && !dirSame)) {
          absoluteLayout(n, infs, bpB);
          return;
        }
        // stack / grid: the parent's settings, overrides where a narrower render differs
        var lp = { mode: basePlan.mode, clip: n.layoutParent.clip, padding: basePlan.padding };
        if (basePlan.mode === 'stack') Object.assign(lp, { direction: basePlan.direction, wrap: basePlan.wrap, gap: basePlan.gap, alignMain: basePlan.alignMain, alignCross: basePlan.alignCross });
        if (basePlan.rowGap !== undefined) lp.rowGap = basePlan.rowGap;
        if (basePlan.mode === 'grid') Object.assign(lp, { columns: basePlan.columns, rows: [], columnGap: basePlan.columnGap, rowGap: basePlan.rowGap });
        n.layoutParent = lp;
        ['tablet', 'phone'].forEach(function (bp) {
          var pl = plan[bp];
          if (!pl || bp === bpB) return;
          var d = {};
          ['direction', 'wrap', 'gap', 'alignMain', 'alignCross', 'rowGap', 'columnGap'].forEach(function (k) { if (pl[k] !== undefined && JSON.stringify(pl[k]) !== JSON.stringify(lp[k])) d[k] = pl[k]; });
          if (JSON.stringify(pl.padding) !== JSON.stringify(lp.padding)) d.padding = pl.padding;
          if (pl.columns && JSON.stringify(pl.columns) !== JSON.stringify(lp.columns)) d.columns = pl.columns;
          if (Object.keys(d).length) setOv(n, bp, 'layoutParent', d);
        });
        // spacers (uneven gaps between the children of a vertical / horizontal flow): one per place
        // where some breakpoint needs one, hidden (so no gap either) where that breakpoint does not
        var places = [];
        Object.keys(plan).forEach(function (k) { (plan[k] && plan[k].spacers || []).forEach(function (sp) { if (places.indexOf(sp.after) === -1) places.push(sp.after); }); });
        places.sort(function (a, b) { return n.children.indexOf(b) - n.children.indexOf(a); }).forEach(function (after) {
          var at = n.children.indexOf(after);
          if (at === -1) return;
          var s = make('rect', 'Espace');
          s.parent = n.id;
          s.fills = [];
          var vert = basePlan.direction === 'vertical';
          s.layoutChild = { position: 'flow', widthMode: vert ? 'fill' : 'fixed', heightMode: 'fixed' };
          var curVis = true, curSize = null;
          BPS.forEach(function (bp) {
            var pl = plan[bp.id];
            if (!pl) return;
            var o = (pl.spacers || []).filter(function (x) { return x.after === after; })[0];
            var vis = !!o;
            if (bp.id === bpB) {
              s.visible = vis;
              curVis = vis;
              curSize = o ? o.size : 0;
              s.geometry.w = vert ? 1 : curSize; s.geometry.h = vert ? curSize : 1;
              return;
            }
            if (vis !== curVis) { setOv(s, bp.id, 'visible', vis); curVis = vis; }
            if (o && (curSize === null || Math.abs(o.size - curSize) > 0.01)) { setOv(s, bp.id, 'geometry', vert ? { h: o.size } : { w: o.size }); curSize = o.size; }
          });
          n.children.splice(at + 1, 0, s.id);
        });
        // each child's sizing in the flow (and the absolute ones by their constraints)
        n.children.forEach(function (cid) {
          var c = nodes[cid];
          if (c.name === 'Espace' && !c._inf) return;
          sizeChild(n, c, infs, bpB, lp);
        });
        // the container itself: hug its content when its size is its content's
        n._hug = hugOf(n, infs, bpB, lp);
      }
      function hugOf(n, infs, bpB, lp) {
        var i = infs[bpB];
        var kids = kidRects(n, bpB).filter(function (k) { return k.r && !k.abs; });
        if (!kids.length) return { h: false, w: false };
        var bottom = Math.max.apply(null, kids.map(function (k) { return k.r.y + k.r.h; }));
        var right = Math.max.apply(null, kids.map(function (k) { return k.r.x + k.r.w; }));
        var hugH = Math.abs((i.r.y + i.r.h) - (bottom + (lp.padding ? lp.padding.bottom : 0))) < 1.5;
        var hugW = lp.direction === 'horizontal' && Math.abs((i.r.x + i.r.w) - (right + (lp.padding ? lp.padding.right : 0))) < 1.5;
        return { h: hugH, w: hugW };
      }
      function sizeChild(parent, c, infs, bpB, lp) {
        var ki = c._inf;
        if (!ki) return;
        var horiz = lp.mode === 'stack' && lp.direction === 'horizontal';
        var grid = lp.mode === 'grid';
        // a text hugs (one line, never wraps) only when it is on one line at every width
        var oneLineAll = c.type === 'text' && BPS.every(function (bp) {
          var i = ki[bp.id];
          if (!i || i.hidden) return true;
          var lineH = px(i.cs.lineHeight) || px(i.cs.fontSize) * 1.3;
          return i.r.h < lineH * 1.6;
        });
        BPS.forEach(function (bp) {
          var pi = infs[bp.id], i = ki[bp.id];
          if (!pi || pi.hidden || !i || i.hidden) return;
          var abs = c._pseudo || (!i.textNode && (i.cs.position === 'absolute' || i.cs.position === 'fixed'));
          var pr = pi.r, r = i.r, pad = padOf(pi.cs);
          var lc;
          var geom = { x: round(r.x - pr.x, 2), y: round(r.y - pr.y, 2), w: round(r.w, 2), h: round(r.h, 2) };
          if (abs) {
            lc = { position: 'absolute', widthMode: 'fixed', heightMode: c.type === 'text' ? 'hug' : 'fixed', constraints: consFor(c, geom, pr, i.cs) };
          } else {
            var cl = pr.x + pad.left, cr = pr.x + pr.w - pad.right;
            var spansW = Math.abs(r.x - cl) < 1.5 && Math.abs((r.x + r.w) - cr) < 1.5;
            var ct = pr.y + pad.top, cb = pr.y + pr.h - pad.bottom;
            var spansH = Math.abs(r.y - ct) < 1.5 && Math.abs((r.y + r.h) - cb) < 1.5;
            lc = { position: 'flow', widthMode: 'fixed', heightMode: 'fixed' };
            if (grid) {
              var ai = String(i.cs.alignSelf === 'auto' ? pi.cs.alignItems : i.cs.alignSelf);
              var ji = String(i.cs.justifySelf === 'auto' ? pi.cs.justifyItems : i.cs.justifySelf);
              lc.widthMode = /center|start|end|left|right/.test(ji) ? (c.type === 'text' || (c.children && c._hug && c._hug.w) ? 'hug' : 'fixed') : 'fill';
              // the row's height comes from its items: they size themselves (a « fill » item adds
              // nothing to an auto row and the row would collapse)
              lc.heightMode = c.type === 'text' || (c.children && c._hug && c._hug.h) ? 'hug' : 'fixed';
              if (/center|start|end/.test(ai)) lc.alignSelf = /center/.test(ai) ? 'center' : /end/.test(ai) ? 'end' : 'start';
              if (c.type === 'image' && lc.widthMode === 'fill' && r.w > 0 && r.h > 0) c.aspectLocked = true;
            }
            else if (!horiz) {
              var mw = /px$/.test(i.cs.maxWidth) ? px(i.cs.maxWidth) : 0;
              var even = Math.abs(px(i.cs.marginLeft) - px(i.cs.marginRight)) < 1;
              if (spansW && mw > 0 && Math.abs(r.w - mw) < 1 && c.type !== 'text') {
                // a centred content column at its max width (.jst-wrap): fixed and centred, so a wider
                // screen keeps it at that width in the middle — the narrower breakpoints fill
                lc.widthMode = 'fixed';
                lc.alignSelf = even ? 'center' : 'start';
              } else if (spansW) lc.widthMode = 'fill';
              else {
                lc.widthMode = c.type === 'text' ? 'fill' : 'fixed';
                if (c.type === 'text') lc.maxW = Math.ceil(r.w * 100) / 100;
                var cxm = (r.x + r.w / 2) - (cl + cr) / 2;
                lc.alignSelf = Math.abs(cxm) < 1.5 ? 'center' : (Math.abs((r.x + r.w) - cr) < 1.5 ? 'end' : 'start');
              }
              lc.heightMode = c.type === 'text' ? 'hug' : (c.children && c._hug && c._hug.h ? 'hug' : 'fixed');
            } else {
              var grow = parseFloat(i.cs.flexGrow) || 0;
              lc.widthMode = grow > 0 ? 'fill' : (c.type === 'text' ? (oneLineAll ? 'hug' : 'fixed') : (c.children && c._hug && c._hug.w ? 'hug' : 'fixed'));
              lc.heightMode = spansH && /stretch|normal/.test(pi.cs.alignItems) ? 'fill' : (c.type === 'text' || (c.children && c._hug && c._hug.h) ? 'hug' : 'fixed');
              if (lc.heightMode === 'fill' && lp.alignCross !== 'stretch') lc.heightMode = c.type === 'text' ? 'hug' : 'fixed';
              if (lc.widthMode === 'fill') lc.grow = grow || 1;
            }
            if (c.type === 'image' && lc.widthMode === 'fill' && lc.heightMode === 'fixed' && r.w > 0 && r.h > 0) c.aspectLocked = true;
          }
          if (c.type === 'text' && bp.id === bpB) c.resize = lc.widthMode === 'hug' ? 'autoWidth' : (lc.heightMode === 'fixed' ? 'fixed' : 'autoHeight');
          if (bp.id === bpB) { c.layoutChild = lc; c.geometry = Object.assign(c.geometry, geom); }
          else {
            var d = {};
            Object.keys(lc).forEach(function (k) { if (JSON.stringify(lc[k]) !== JSON.stringify(c.layoutChild[k])) d[k] = lc[k]; });
            // what the wider breakpoint sets and this one does not: back to the neutral value
            var NEUTRAL = { alignSelf: 'auto', maxW: 1000000, grow: 1 };
            Object.keys(c.layoutChild).forEach(function (k) { if (lc[k] === undefined && NEUTRAL[k] !== undefined && c.layoutChild[k] !== NEUTRAL[k]) d[k] = NEUTRAL[k]; });
            if (Object.keys(d).length) setOv(c, bp.id, 'layoutChild', d);
            var gd = {};
            ['x', 'y', 'w', 'h'].forEach(function (k) { if (Math.abs(geom[k] - c.geometry[k]) > 0.01) gd[k] = geom[k]; });
            if (lc.position === 'flow') { delete gd.x; delete gd.y; }
            if (Object.keys(gd).length) setOv(c, bp.id, 'geometry', gd);
          }
        });
      }
      function consOf(g, pr) {
        var W = pr.w, Hh = pr.h;
        var h = 'left', v = 'top';
        if (Math.abs(g.x) < 1.5 && Math.abs(g.x + g.w - W) < 1.5) h = 'leftRight';
        else if (Math.abs((g.x + g.w / 2) - W / 2) < 1.5) h = 'center';
        else if (W - (g.x + g.w) < g.x) h = 'right';
        if (Math.abs(g.y) < 1.5 && Math.abs(g.y + g.h - Hh) < 1.5) v = 'topBottom';
        return { h: h, v: v };
      }
      function consFor(c, g, pr, ccs) {
        var k = consOf(g, pr);
        // a content column at its max width, centred (.jst-wrap): stays centred on a wider screen
        var mw = ccs && /px$/.test(ccs.maxWidth) ? px(ccs.maxWidth) : 0;
        if (k.h === 'leftRight' && mw > 0 && Math.abs(g.w - mw) < 1 && c.type !== 'text') k.h = 'center';
        // an <img> stretched by left + right (or top + bottom) keeps its own ratio in CSS (a replaced
        // element): scale stretches it with percentages, exactly the same at the reference width
        if (c.type === 'image') { if (k.h === 'leftRight') k.h = 'scale'; if (k.v === 'topBottom') k.v = 'scale'; }
        return k;
      }
      /* free positions: every child absolute, its box per breakpoint, constraints from its place */
      function absoluteLayout(n, infs, bpB) {
        n.layoutParent = { mode: 'absolute', clip: n.layoutParent.clip };
        n.children.forEach(function (cid) {
          var c = nodes[cid], ki = c._inf;
          if (!ki) return; // a pseudo overlay already placed
          // a column that keeps the same share of its parent at 1200 and at 768 (a 54 % copy beside a
          // 46 % photo): « scale », so a 1440 screen gets the same shares, as the store's CSS does
          var share = null;
          var bI = ki.base, tI = ki.tablet, bP = infs.base, tP = infs.tablet;
          if (bI && tI && bP && tP && !bI.hidden && !tI.hidden && !bP.hidden && !tP.hidden && bP.r.w > 0 && tP.r.w > 0) {
            var rw = [bI.r.w / bP.r.w, tI.r.w / tP.r.w], rx = [(bI.r.x - bP.r.x) / bP.r.w, (tI.r.x - tP.r.x) / tP.r.w];
            if (Math.abs(rw[0] - rw[1]) < 0.01 && Math.abs(rx[0] - rx[1]) < 0.01 && rw[0] < 0.98) share = true;
          }
          BPS.forEach(function (bp) {
            var pi = infs[bp.id], i = ki[bp.id];
            if (!pi || pi.hidden || !i || i.hidden) return;
            var g = { x: round(i.r.x - pi.r.x, 2), y: round(i.r.y - pi.r.y, 2), w: round(i.r.w, 2), h: round(i.r.h, 2) };
            var cons = consFor(c, g, pi.r, i.cs);
            if (share && bp.id !== 'phone' && cons.h !== 'leftRight' && cons.h !== 'scale') cons.h = 'scale';
            var lc = { position: 'absolute', widthMode: 'fixed', heightMode: c.type === 'text' ? 'hug' : 'fixed', constraints: cons };
            if (c.type === 'text') c.resize = 'autoHeight';
            if (bp.id === bpB) { c.layoutChild = lc; Object.assign(c.geometry, g); }
            else {
              var gd = {};
              ['x', 'y', 'w', 'h'].forEach(function (k) { if (Math.abs(g[k] - c.geometry[k]) > 0.01) gd[k] = g[k]; });
              if (Object.keys(gd).length) setOv(c, bp.id, 'geometry', gd);
              if (JSON.stringify(lc.constraints) !== JSON.stringify(c.layoutChild.constraints)) setOv(c, bp.id, 'layoutChild', { constraints: lc.constraints });
            }
          });
        });
        // its own height cannot hug free children: fixed, per breakpoint
        n._hug = { h: false, w: false };
      }

      var infs = {};
      BPS.forEach(function (b) { infs[b.id] = els[b.id] ? info(b.id, els[b.id]) : null; });
      var rid = convert(infs, null);
      if (!rid) return null;
      var root = nodes[rid];
      if (!root.children) { // a section with a single leaf: wrap it
        var f = make('frame', 'Section');
        f.children = [rid]; root.parent = f.id; f.layoutParent = { mode: 'absolute', clip: false };
        root = f; rid = f.id;
      }
      root.name = 'Section';
      root.semantic.tag = 'div';
      root.parent = null;
      root.layoutChild = { position: 'flow', widthMode: 'fill', heightMode: root.layoutParent.mode !== 'absolute' && root._hug && root._hug.h ? 'hug' : 'fixed' };
      root.geometry = { x: 0, y: 0, w: round(infs.base ? infs.base.r.w : 1200), h: round(infs.base && infs.base.r ? infs.base.r.h : 400), rotation: 0, flipH: false, flipV: false };
      ['tablet', 'phone'].forEach(function (bp) {
        var i = infs[bp];
        if (i && i.r && Math.abs(i.r.h - root.geometry.h) > 0.5) setOv(root, bp, 'geometry', { h: round(i.r.h) });
      });
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id];
        delete n._inf; delete n._hug; delete n._pseudo;
        if (n.children && !n.layoutParent) n.layoutParent = { mode: 'absolute', clip: false };
        Object.keys(n.overrides).forEach(function (bp) { if (!Object.keys(n.overrides[bp]).length) delete n.overrides[bp]; });
      });
      return { v: 1, root: rid, nodes: nodes, assets: assetsAcc };
    }

    /* the section rendered off-screen at the three breakpoint widths (fonts and photos loaded) */
    function renderOffscreen(config) {
      var host = document.createElement('div');
      host.className = 'st-eng-measure';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-40000px;top:0;opacity:0;pointer-events:none;contain:layout style;';
      var roots = {};
      [{ id: 'base', w: 1200, dev: 'desktop' }, { id: 'tablet', w: 768, dev: 'desktop' }, { id: 'phone', w: 390, dev: 'phone' }].forEach(function (b) {
        var r = document.createElement('div');
        r.style.width = b.w + 'px';
        host.appendChild(r);
        try { S.R.render(config, r, { device: b.dev, page: 'home' }); } catch (e) { /* empty */ }
        roots[b.id] = r;
      });
      document.body.appendChild(host);
      return { host: host, roots: roots };
    }
    function waitImages(root, ms) {
      var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
      var all = imgs.map(function (im) { return im.complete ? Promise.resolve() : new Promise(function (res) { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); }); });
      return Promise.race([Promise.all(all), sleep(ms)]);
    }

    /** « Détacher » : the section becomes free DualEngine nodes (one undo step). Resolves to true when done. */
    var detaching = false;
    function detach(sid, opts) {
      opts = opts || {};
      var s = sectionById(sid);
      if (!s) return Promise.resolve(false);
      if (EN.isDetached(s)) { toast('Cette section est déjà détachée.', 'info'); return Promise.resolve(false); }
      if (detaching) return Promise.resolve(false);
      detaching = true;
      var config = clone(cfg());
      // the section must be enabled to be measured; the other sections are left out (faster, no tint shift)
      var probe = clone(config);
      probe.sections = (probe.sections || []).map(function (x) { if (x.id === sid) x.enabled = true; return x; });
      var off = renderOffscreen(probe);
      var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      return Promise.all([fonts, waitImages(off.host, 1500)]).then(function () { return sleep(30); }).then(function () {
        var els = {};
        Object.keys(off.roots).forEach(function (k) { els[k] = off.roots[k].querySelector('[data-section-id="' + S.cssEsc(sid) + '"]'); });
        var eng = null;
        try { if (els.base) eng = convertSection(els); } catch (e) { eng = null; if (window.console) console.error(e); }
        off.host.remove();
        detaching = false;
        var clean = eng ? EN.sanitize(eng) : null;
        if (!clean) { toast('Cette section n’a pas pu être détachée.', 'err'); return false; }
        S.commit(opts.label || 'Détachement de la section', function (c) {
          var t = (c.sections || []).filter(function (x) { return x.id === sid; })[0];
          if (!t) return;
          t.engine = clean;
          // its element styles are now in its nodes
          if (c.elementStyles) Object.keys(c.elementStyles).forEach(function (k) { if (k.split('/')[0] === sid) delete c.elementStyles[k]; });
          if (c.elementStyles && !Object.keys(c.elementStyles).length) delete c.elementStyles;
        }, { structure: true });
        if (!opts.silent) toast('Section détachée : chaque élément se modifie librement. Ctrl Z pour annuler.', 'ok');
        return true;
      }).catch(function (err) {
        detaching = false;
        if (window.console) console.error(err);
        try { off.host.remove(); } catch (e) { /* gone */ }
        toast('Cette section n’a pas pu être détachée.', 'err');
        return false;
      });
    }
    /** « Rattacher » : back to the template's section (its settings never changed). */
    function attach(sid) {
      var s = sectionById(sid);
      if (!EN.isDetached(s)) return false;
      S.commit('Section rattachée au modèle', function (c) {
        var t = (c.sections || []).filter(function (x) { return x.id === sid; })[0];
        if (t) delete t.engine;
      }, { structure: true });
      S.select({ kind: 'section', id: sid });
      toast('Section rattachée : elle suit de nouveau le modèle de la boutique.', 'ok');
      return true;
    }

    /* ================================================================ the bridge: fiche ↔ DualEngine document */

    function registryOf(type) {
      var ES = window.JeereElStyles;
      try { return ES && ES.elementsFor ? ES.elementsFor(type) : []; } catch (e) { return []; }
    }
    var KIND_TYPE = { text: 'text', image: 'image', button: 'frame', container: 'frame', section: 'frame', card: 'frame', badge: 'frame', icon: 'frame', page: 'frame' };
    /* deterministic ids (the bridge is a pure function of the fiche) */
    function did(a, b) {
      var s = String(a) + '|' + String(b || ''), h1 = 0x811c9dc5, h2 = 0x01000193;
      for (var i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0; }
      var hx = ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
      return hx.slice(0, 8) + '-' + hx.slice(8, 12) + '-4' + hx.slice(13, 16) + '-8' + hx.slice(1, 4) + '-' + hx.slice(4, 16);
    }

    /**
     * The whole fiche as one DualEngine document: components (one per section type, and @header /
     * @footer / @page), the « Accueil » page with one instance per section (or the free nodes of a
     * detached one), the fiche's other keys kept verbatim in doc.fiche.
     */
    function toDocument(config) {
      var c = clone(config || cfg());
      var doc = M.createDocument({ id: did('doc', c.store && c.store.name), name: (c.store && c.store.name) || 'Boutique', breakpoints: BPS.map(function (b) { return { id: b.id, name: b.name, width: b.width }; }), pageId: did('page', 'home'), pageName: 'Accueil' });
      var masters = { id: did('page', 'components'), name: 'Composants', children: [] };
      doc.pages.push(masters);
      var D = S.D;
      function component(type, label) {
        var cid = did('component', type);
        if (doc.components[cid]) return cid;
        var rootN = M.createNode('component', { id: did('master', type), name: label, layoutParent: { mode: 'stack', direction: 'vertical', clip: false }, layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' } });
        rootN.def = cid; delete rootN.meta;
        M.addNode(doc, rootN, null);
        doc.pages[0].children.pop();
        masters.children.push(rootN.id);
        var props = [];
        var def = D.sectionTypes && D.sectionTypes[type];
        ((def && def.fields) || []).forEach(function (f) {
          if (!f || !f.key) return;
          var kind = f.type === 'number' ? 'number' : f.type === 'image' ? 'image' : f.type === 'items' ? 'text' : 'text';
          props.push({ kind: kind, name: f.key, default: def.defaults ? def.defaults[f.key] : null, binds: [] });
        });
        registryOf(type).forEach(function (el) {
          var mid = did('master', type + '/' + el.key);
          var n = M.createNode(KIND_TYPE[el.kind] === 'text' ? 'text' : (KIND_TYPE[el.kind] === 'image' ? 'image' : 'frame'), { id: mid, name: el.label || el.key });
          delete n.meta;
          n.elementKey = el.key;
          n.selector = el.sel || '';
          M.addNode(doc, n, rootN.id);
        });
        doc.components[cid] = { id: cid, name: label, sectionType: type, props: props, root: rootN.id };
        return cid;
      }
      var pageRoot = M.createNode('frame', { id: did('frame', 'home'), name: 'Accueil', layoutParent: { mode: 'stack', direction: 'vertical', gap: 0, clip: false }, layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' } });
      delete pageRoot.meta;
      M.addNode(doc, pageRoot, null);
      var es = c.elementStyles || {};
      (c.sections || []).forEach(function (s) {
        var def = D.sectionTypes && D.sectionTypes[s.type];
        var label = def && def.name ? def.name : s.type;
        var cid = component(s.type, label);
        if (EN.isDetached(s)) {
          var eng = s.engine;
          var r = clone(eng.nodes[eng.root]);
          Object.keys(eng.nodes).forEach(function (id) { if (id !== eng.root) doc.nodes[id] = clone(eng.nodes[id]); });
          r.parent = pageRoot.id;
          r.sectionId = s.id; r.sectionType = s.type; r.enabled = s.enabled; r.settings = clone(s.settings);
          r.detachedFrom = cid;
          r.engineAssets = clone(eng.assets || {});
          r.engineKeys = Object.keys(eng);
          doc.nodes[r.id] = r;
          pageRoot.children.push(r.id);
          return;
        }
        var inst = M.createNode('instance', { id: did('instance', s.id), name: S.sectionName(s), layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' } });
        delete inst.meta;
        inst.of = cid;
        inst.visible = s.enabled !== false;
        inst.props = { sectionId: s.id, type: s.type, enabled: s.enabled, settings: clone(s.settings) };
        inst.sectionKeys = Object.keys(s);
        inst.instanceOverrides = {};
        Object.keys(es).forEach(function (k) {
          var parts = k.split('/');
          if (parts[0] !== s.id) return;
          inst.instanceOverrides[did('master', s.type + '/' + parts[1].split('~')[0])] = { elementStyle: { key: k, entry: clone(es[k]) } };
        });
        M.addNode(doc, inst, pageRoot.id);
      });
      // what is not a section: kept as the document's « fiche » (header / footer / page styles included)
      var rest = {};
      Object.keys(c).forEach(function (k) { if (k !== 'sections') rest[k] = c[k]; });
      doc.fiche = { keys: Object.keys(c), rest: rest, esKeys: Object.keys(es) };
      return doc;
    }

    /** The fiche back from a document made by toDocument (instances → sections, free frames → detached). */
    function fromDocument(doc) {
      var f = doc.fiche || { keys: [], rest: {}, esKeys: [] };
      var pageRoot = doc.nodes[doc.pages[0].children[0]];
      var sections = [];
      var es = {};
      (pageRoot ? pageRoot.children : []).forEach(function (id) {
        var n = doc.nodes[id];
        if (!n) return;
        if (n.type === 'instance') {
          var p = n.props || {};
          var sec = {};
          (n.sectionKeys || ['id', 'type', 'enabled', 'settings']).forEach(function (k) {
            if (k === 'id') sec.id = p.sectionId;
            else if (k === 'type') sec.type = p.type;
            else if (k === 'enabled') sec.enabled = p.enabled;
            else if (k === 'settings') sec.settings = clone(p.settings);
          });
          sections.push(sec);
          Object.keys(n.instanceOverrides || {}).forEach(function (mid) { var o = n.instanceOverrides[mid].elementStyle; if (o) es[o.key] = clone(o.entry); });
        } else {
          // a detached section: its subtree back into an engine key
          var nodes = {};
          var rootCopy = clone(n);
          ['sectionId', 'sectionType', 'enabled', 'settings', 'detachedFrom', 'engineAssets', 'engineKeys'].forEach(function (k) { delete rootCopy[k]; });
          rootCopy.parent = null;
          nodes[n.id] = rootCopy;
          M.descendants(doc, n.id).forEach(function (d) { nodes[d.id] = clone(d); });
          var engine = {};
          (n.engineKeys || ['v', 'root', 'nodes', 'assets']).forEach(function (k) {
            if (k === 'v') engine.v = 1;
            else if (k === 'root') engine.root = n.id;
            else if (k === 'nodes') engine.nodes = nodes;
            else if (k === 'assets') engine.assets = clone(n.engineAssets || {});
          });
          sections.push({ id: n.sectionId, type: n.sectionType, enabled: n.enabled, settings: clone(n.settings), engine: engine });
        }
      });
      var out = {};
      (f.keys.length ? f.keys : ['version', 'template', 'store', 'theme', 'payments', 'sections', 'products', 'pages']).forEach(function (k) {
        if (k === 'sections') out.sections = sections;
        else if (k === 'elementStyles') {
          var ordered = {};
          var all = Object.assign({}, f.rest.elementStyles || {}, es);
          (f.esKeys || []).forEach(function (key) { if (all[key] !== undefined) ordered[key] = all[key]; });
          Object.keys(all).forEach(function (key) { if (ordered[key] === undefined) ordered[key] = all[key]; });
          out.elementStyles = ordered;
        } else out[k] = clone(f.rest[k]);
      });
      return out;
    }

    /* ================================================================ export (HTML / CSS of a detached section) */

    /* The section as a standalone HTML / CSS file (wave 1):
     *   - the root is a <section> (a <div> on the canvas);
     *   - the classes are readable, from the layer names (« hero__titre », « hero__bouton-2 »), not the
     *     engine's hashed « de-xxxxxxxx » (those stay in the Studio, where they key the nodes);
     *   - the photos point to the public copy of the demo photos (https://jeere.kreeative.xyz/creer/img/…),
     *     never to the address the Studio runs on (http://localhost…); her own photos are embedded. */
    var PUBLIC_ORIGIN = 'https://jeere.kreeative.xyz/';
    function publicUrl(u) {
      u = String(u || '');
      if (/^data:/i.test(u)) return u;
      var at = u.indexOf('/concepts/jeere/');
      if (at !== -1) return PUBLIC_ORIGIN + u.slice(at + '/concepts/jeere/'.length);
      try { var o = location.origin; if (o && u.indexOf(o + '/') === 0) return PUBLIC_ORIGIN + u.slice(o.length + 1); } catch (e) { /* file:// */ }
      return u;
    }
    function readableClasses(doc, sectionSlug) {
      var map = {}, used = {};
      Object.keys(doc.nodes).forEach(function (id) {
        var n = doc.nodes[id];
        var base = id === doc.pages[0].children[0] ? sectionSlug : sectionSlug + '__' + (slug(n.name || n.type).slice(0, 32) || n.type);
        var name = base, k = 2;
        while (used[name]) name = base + '-' + (k++);
        used[name] = true;
        map[M.classOf(id)] = name;
      });
      return map;
    }
    function exportSectionFile(sid) {
      var s = sectionById(sid);
      if (!EN.isDetached(s)) return null;
      var doc = EN.toDocument(s.engine, { name: S.sectionName(s) });
      var rid = doc.pages[0].children[0], rn = doc.nodes[rid];
      if (rn && rn.semantic && (!rn.semantic.tag || rn.semantic.tag === 'div')) rn.semantic = Object.assign({}, rn.semantic, { tag: 'section' });
      Object.keys(doc.assets || {}).forEach(function (k) { var a = doc.assets[k]; if (a && a.url) a.url = publicUrl(a.url); });
      var out = DE.exportDocument(doc, {});
      var map = readableClasses(doc, slug(S.sectionName(s)).slice(0, 24) || 'section');
      var swap = function (text) { return String(text).replace(/\bde-[0-9a-zA-Z]{8}\b/g, function (c) { return map[c] || c; }); };
      return { html: swap(out.html).replace('<head>', '<head>\n<!-- Exporté depuis Jeere Studio (DualEngine) : classes nommées d’après les calques -->'), css: swap(out.css), body: swap(out.body), warnings: out.warnings, classes: map };
    }
    function download(name, text, type) {
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/html' }));
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return true;
      } catch (e) { return false; }
    }
    function slug(s) { return String(s || 'section').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; }
    function downloadSection(sid) {
      var f = exportSectionFile(sid);
      if (!f) { toast('Détachez d’abord la section pour l’exporter en HTML / CSS.', 'warn'); return false; }
      download(slug(S.sectionName(sectionById(sid))) + '.html', f.html, 'text/html');
      toast('Section exportée en HTML / CSS (le code généré par DualEngine).', 'ok');
      return true;
    }

    /* ================================================================ public */

    window.JeereStudioEngine = {
      EN: EN, DE: DE, BPS: BPS,
      ed: ed, dropAll: dropAll, isDetached: isDetached, node: node, rootId: rootId, parentOf: parentOf, isContainer: isContainer,
      resolved: resolved, value: value, layoutAt: layoutAt, bpOfWidth: bpOfWidth,
      apply: apply, propPatches: propPatches, resetOverride: resetOverride, hasOverride: hasOverride,
      insertPatches: insertPatches, removePatches: removePatches, movePatches: movePatches, createNode: createNode,
      groupPatches: groupPatches, ungroupPatches: ungroupPatches, autoLayoutPatches: autoLayoutPatches, cloneSubtrees: cloneSubtrees,
      subtreeIds: subtreeIds, path: path, newId: newId, round: round,
      detach: detach, attach: attach, convertSection: convertSection, isDetaching: function () { return detaching; },
      toDocument: toDocument, fromDocument: fromDocument,
      exportSectionFile: exportSectionFile, downloadSection: downloadSection, download: download, slug: slug,
      parseColor: parseColor, assetFromSrc: function (sid, src, w, h) {
        var e = ed(sid);
        if (!e) return null;
        var key = null;
        Object.keys(e.doc.assets).some(function (id) { if (e.doc.assets[id].src === src) { key = id; return true; } return false; });
        return key;
      },
      chain: chain
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
