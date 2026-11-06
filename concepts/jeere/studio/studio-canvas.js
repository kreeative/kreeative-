/* Jeere Studio — studio-canvas.js: the canvas of the DualEngine nodes (SPEC-DUALENGINE module 1).
 *
 * Built on studio.js (the infinite canvas, zoom 10 % – 25 600 %, pan, artboards) and studio-engine.js
 * (the documents, the engine history, the layout). The artboards ARE the breakpoint frames: 1200 / 1440
 * = Ordinateur (base), 768 = Tablette, 390 / 360 = Téléphone; an edit made on an artboard is written at
 * its breakpoint (an exact override, never a delta).
 *
 *   - Selection of the nodes of a detached section (click: the next level, Ctrl / ⌘ + click: the deepest,
 *     double-click: one level in or edit a text, Maj + clic: several, Échap: the parent), hover outline.
 *   - Move (smart guides on the siblings, the parent and the user guides; equal spacings; pixel snapping;
 *     insertion in a stack by the midpoint rule, Ctrl held = absolute), resize with 8 handles (Maj keeps
 *     the ratio, Alt from the centre), rotate (outside a corner, Maj by 15°), arrows (Maj = 10 px).
 *   - Ctrl G / Ctrl ⇧ G, Ctrl ] / [ (⇧: to the front / back), Ctrl C / V / D / X, Suppr, ⇧ A Auto Layout.
 *   - Tools F (cadre), R (rectangle), O (ellipse), T (texte, on an empty spot), I (image), H (main):
 *     drawing over a section that is not detached detaches it first (one more undo step).
 *   - Rulers (⇧ R) with draggable guides, layout grid (⇧ G), pixel grid from 800 % (Ctrl ⇧ ').
 *   - Rendering: the store's DOM (the engine's exported HTML/CSS, container queries per artboard); the
 *     gestures preview with transforms on the dragged elements only and commit ONE engine transaction.
 *
 * window.JeereStudioCanvas exposes the state for the inspector and the tests.
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    var E = window.JeereStudioEngine;
    if (!S || !E) return;
    var EN = E.EN, DE = E.DE, M = DE.model;
    var hooks = S.hooks, toast = S.toast, ce = S.ce, esc = S.esc, clamp = S.clamp, clone = S.clone;
    var round = E.round;
    var stage = S.stage();
    if (!stage) return;
    function state() { return S.state(); }
    function ui() { return S.ui(); }
    function $(id) { return document.getElementById(id); }

    /* ================================================================ artboards ↔ breakpoints */

    function presetOf(ab) { return S.presets.filter(function (p) { return p.key === ab; })[0] || null; }
    function abWidth(ab) { var p = presetOf(ab); return p ? p.width : 1200; }
    function abBp(ab) { return EN.bpForWidth(abWidth(ab)); }
    function abFrame(ab) { var a = S.abEls()[ab]; return a ? a.querySelector('.st-ab__frame') : null; }
    function abOf(el) { var a = el && el.closest ? el.closest('.st-ab') : null; return a ? a.getAttribute('data-ab') : null; }
    function activeAb() { return S.primaryKey(); }
    var cv = { bp: null };   // the breakpoint being edited (null: the active artboard's)
    function editBp() { return cv.bp || abBp(activeAb()); }
    function setEditBp(bp) { cv.bp = bp; markBps(); draw(); if (hooks.engineBpChanged) { try { hooks.engineBpChanged(bp); } catch (e) { /* module */ } } }

    function secEl(ab, sid) { var r = S.roots()[ab]; return r ? r.querySelector('[data-eng="' + S.cssEsc(sid) + '"]') : null; }
    function nodeEl(ab, sid, id) { var s = secEl(ab, sid); return s ? s.querySelector('.' + M.classOf(id)) : null; }
    var CLS_RE = /^de-[0-9a-zA-Z]{8}$/;
    function idOfEl(sid, el) {
      var e = E.ed(sid);
      if (!e || !el || !el.classList) return null;
      for (var i = 0; i < el.classList.length; i++) {
        var c = el.classList[i];
        if (!CLS_RE.test(c)) continue;
        var ids = Object.keys(e.doc.nodes);
        for (var k = 0; k < ids.length; k++) if (M.classOf(ids[k]) === c) return ids[k];
      }
      return null;
    }
    /* the engine node under a DOM target: { ab, sid, id } */
    function hit(target) {
      if (!target || !target.closest) return null;
      var sec = target.closest('[data-eng]');
      if (!sec || sec.hasAttribute('data-eng-pending')) return null;
      var sid = sec.getAttribute('data-section-id');
      if (!E.isDetached(sid)) return null;
      var el = target;
      while (el && el !== sec) {
        var id = idOfEl(sid, el);
        if (id) return { ab: abOf(sec), sid: sid, id: id, el: el };
        el = el.parentElement;
      }
      return { ab: abOf(sec), sid: sid, id: E.rootId(sid), el: sec };
    }

    /* the node under a point, as Figma picks it: a shape without a fill is hit on its stroke only
     * (a decorative frame over a photo lets the clicks through to what is under it) */
    function hitPoint(e) {
      var list = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target];
      for (var i = 0; i < list.length; i++) {
        var h = hit(list[i]);
        if (!h) { if (list[i].closest && list[i].closest('.st-ab__frame')) return hit(e.target); continue; }
        var n = E.node(h.sid, h.id);
        if (n && (n.type === 'rect' || n.type === 'ellipse') && !(n.fills || []).some(function (f) { return f.visible !== false; })) {
          var r = h.el.getBoundingClientRect(), sw = 6;
          (n.strokes || []).forEach(function (s) { if (typeof s.width === 'number') sw = Math.max(sw, s.width * frameScale(h.ab) + 4); });
          var inside = e.clientX > r.left + sw && e.clientX < r.right - sw && e.clientY > r.top + sw && e.clientY < r.bottom - sw;
          if (inside) continue;
        }
        return h;
      }
      return hit(e.target);
    }

    /* ---------------------------------------------------------------- geometry: doc ↔ frame ↔ screen */

    function frameScale(ab) { var f = abFrame(ab); return f ? (f.getBoundingClientRect().width / (f.offsetWidth || 1)) || state().zoom : state().zoom; }
    function secOrigin(ab, sid) {
      var f = abFrame(ab), s = secEl(ab, sid);
      if (!f || !s) return null;
      var r = S.rectInFrame(s, f);
      return { x: r.x, y: r.y };
    }
    function lay(sid, ab) { return E.layoutAt(sid, abWidth(ab)); }
    /* a node's world box in its artboard frame (doc px) */
    function boxF(ab, sid, id) {
      var l = lay(sid, ab), o = secOrigin(ab, sid);
      var b = l && l.world.get(id);
      if (!b || !o) return null;
      return { x: o.x + b.x, y: o.y + b.y, w: b.w, h: b.h };
    }
    function toScreen(ab, x, y) {
      var f = abFrame(ab);
      var fr = f.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = frameScale(ab);
      return { x: fr.left - sr.left + x * k, y: fr.top - sr.top + y * k, k: k };
    }
    function toFrame(ab, clientX, clientY) {
      var f = abFrame(ab);
      var fr = f.getBoundingClientRect(), k = frameScale(ab);
      return { x: (clientX - fr.left) / k, y: (clientY - fr.top) / k, k: k };
    }

    /* ================================================================ selection */

    function current() {
      var s = state().sel;
      if (!s) return null;
      if (s.kind === 'engine' && E.isDetached(s.id) && Array.isArray(s.nodes) && s.nodes.length) return { sid: s.id, ids: s.nodes.slice(), root: false };
      if (s.kind === 'section' && !s.el && !s.field && E.isDetached(s.id)) { var r = E.rootId(s.id); return r ? { sid: s.id, ids: [r], root: true } : null; }
      return null;
    }
    function selectNodes(sid, ids, opts) {
      ids = (ids || []).filter(function (id) { return !!E.node(sid, id); });
      var r = E.rootId(sid);
      if (!ids.length) { S.select(null); return; }
      if (state().page !== 'home') S.showPage('home');
      if (ids.length === 1 && ids[0] === r) S.select({ kind: 'section', id: sid }, opts);
      else S.select({ kind: 'engine', id: sid, nodes: ids.filter(function (id) { return id !== r; }) }, opts);
    }
    chain('validateSelection', function (sel) {
      if (!sel || sel.kind !== 'engine') return sel;
      if (!E.isDetached(sel.id)) return S.sectionById(sel.id) ? { kind: 'section', id: sel.id } : null;
      var ids = (sel.nodes || []).filter(function (id) { return !!E.node(sel.id, id); });
      return ids.length ? { kind: 'engine', id: sel.id, nodes: ids } : { kind: 'section', id: sel.id };
    });

    function chain(name, fn) { E.chain(name, fn); }

    /* Figma's click: inside the selection → one level deeper; on a sibling → that sibling; elsewhere
     * in the section → the section; Ctrl / ⌘ → the deepest node */
    function pickTarget(h, deep) {
      var e = E.ed(h.sid);
      var chainIds = [h.id].concat(M.ancestors(e.doc, h.id).map(function (a) { return a.id; })).reverse(); // root … deepest
      if (deep) return h.id;
      var cur = current();
      if (!cur || cur.sid !== h.sid) return chainIds[0];
      if (cur.root) return chainIds[1] || chainIds[0];
      // inside a selected node: it stays selected (so it can be dragged; a double-click goes in)
      for (var s = 0; s < cur.ids.length; s++) if (chainIds.indexOf(cur.ids[s]) !== -1) return cur.ids[s];
      // elsewhere: the node at the selection's level (a sibling, or a cousin higher up)
      var p = E.node(h.sid, cur.ids[0]) && E.node(h.sid, cur.ids[0]).parent;
      while (p) {
        var i = chainIds.indexOf(p);
        if (i !== -1) return chainIds[i + 1] || chainIds[i];
        p = E.node(h.sid, p) ? E.node(h.sid, p).parent : null;
      }
      return chainIds[1] || chainIds[0];
    }

    /* ================================================================ overlay (screen space) */

    var ov = ce('div', 'st-eng-ov');
    ov.setAttribute('aria-hidden', 'true');
    stage.appendChild(ov);
    var rulerX = ce('canvas', 'st-eng-ruler st-eng-ruler--x'), rulerY = ce('canvas', 'st-eng-ruler st-eng-ruler--y'), rulerC = ce('div', 'st-eng-ruler st-eng-ruler--c');
    stage.appendChild(rulerX); stage.appendChild(rulerY); stage.appendChild(rulerC);
    var pix = ce('canvas', 'st-eng-pixgrid');
    stage.appendChild(pix);

    var hoverId = null, hoverSid = null, hoverAb = null;
    var drag = null;          // the gesture in progress
    var snapLines = [], measures = [], insertLine = null, drawRect = null;
    var drawQueued = false;
    function draw() {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(function () { drawQueued = false; drawNow(); });
    }
    function box(cls, x, y, w, h) {
      var b = ce('div', cls);
      b.style.transform = 'translate(' + round(x, 2) + 'px,' + round(y, 2) + 'px)';
      b.style.width = Math.max(0, round(w, 2)) + 'px';
      b.style.height = Math.max(0, round(h, 2)) + 'px';
      ov.appendChild(b);
      return b;
    }
    var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    function drawNow() {
      ov.innerHTML = '';
      var cur = current();
      var ab = activeAb();
      // the hover outline
      if (hoverId && hoverSid && hoverAb && !drag && !(cur && cur.sid === hoverSid && cur.ids.indexOf(hoverId) !== -1)) {
        var hb = boxF(hoverAb, hoverSid, hoverId);
        if (hb) { var a = toScreen(hoverAb, hb.x, hb.y); box('st-eng-hov', a.x, a.y, hb.w * a.k, hb.h * a.k); }
      }
      if (cur) {
        Object.keys(S.abEls()).forEach(function (k) {
          var ab2 = S.abEls()[k];
          if (!ab2 || ab2.classList.contains('is-hidden') || !secEl(k, cur.sid)) return;
          var union = null;
          cur.ids.forEach(function (id) {
            var b = previewBox(k, cur.sid, id);
            if (!b) return;
            var s = toScreen(k, b.x, b.y);
            if (!cur.root) box('st-eng-sel' + (k === ab ? '' : ' is-other'), s.x, s.y, b.w * s.k, b.h * s.k);
            union = union ? { x0: Math.min(union.x0, s.x), y0: Math.min(union.y0, s.y), x1: Math.max(union.x1, s.x + b.w * s.k), y1: Math.max(union.y1, s.y + b.h * s.k) } : { x0: s.x, y0: s.y, x1: s.x + b.w * s.k, y1: s.y + b.h * s.k };
          });
          if (!union || k !== ab || cur.root) return;
          // handles and the size label, on the active artboard only
          if (!drag || drag.kind !== 'move') {
            var mx = (union.x0 + union.x1) / 2, my = (union.y0 + union.y1) / 2;
            var pts = { nw: [union.x0, union.y0], n: [mx, union.y0], ne: [union.x1, union.y0], e: [union.x1, my], se: [union.x1, union.y1], s: [mx, union.y1], sw: [union.x0, union.y1], w: [union.x0, my] };
            var small = (union.x1 - union.x0) < 24 || (union.y1 - union.y0) < 24;
            // 8 px handles, 16 px to the finger (iPad)
            var hs = document.documentElement.classList.contains('st-touch') || document.body.classList.contains('st-touch') || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 16 : 8;
            HANDLES.forEach(function (hk) {
              if (small && hk.length === 1) return;
              var hdl = box('st-eng-h st-eng-h--' + hk, pts[hk][0] - hs / 2, pts[hk][1] - hs / 2, hs, hs);
              hdl.setAttribute('data-h', hk);
            });
            ['nw', 'ne', 'se', 'sw'].forEach(function (hk) {
              var rx = pts[hk][0] + (hk.indexOf('w') !== -1 ? -14 : 2), ry = pts[hk][1] + (hk.indexOf('n') !== -1 ? -14 : 2);
              var r = box('st-eng-rot st-eng-rot--' + hk, rx, ry, 12, 12);
              r.setAttribute('data-rot', hk);
            });
          }
          if (cur.ids.length === 1 || (drag && drag.kind === 'resize' && drag.group)) {
            var b0 = cur.ids.length === 1 ? previewBox(k, cur.sid, cur.ids[0]) : null;
            if (!b0 && drag && drag.group && drag.res) b0 = { w: drag.res.w, h: drag.res.h };
            if (b0) {
              var lab = ce('div', 'st-eng-size', fmt(b0.w) + ' × ' + fmt(b0.h));
              lab.style.transform = 'translate(' + round((union.x0 + union.x1) / 2, 1) + 'px,' + round(union.y1 + 8, 1) + 'px) translateX(-50%)';
              ov.appendChild(lab);
            }
          }
        });
      }
      // smart guides, measurements, insertion line, drawing rectangle
      snapLines.forEach(function (l) {
        var a1 = toScreen(l.ab, l.x1, l.y1), a2 = toScreen(l.ab, l.x2, l.y2);
        if (l.x1 === l.x2) box('st-eng-snap st-eng-snap--v', a1.x, Math.min(a1.y, a2.y), 1, Math.abs(a2.y - a1.y));
        else box('st-eng-snap st-eng-snap--h', Math.min(a1.x, a2.x), a1.y, Math.abs(a2.x - a1.x), 1);
      });
      measures.forEach(function (m) {
        var a1 = toScreen(m.ab, m.x1, m.y1), a2 = toScreen(m.ab, m.x2, m.y2);
        var vert = m.x1 === m.x2;
        if (vert) box('st-eng-meas st-eng-meas--v', a1.x, Math.min(a1.y, a2.y), 1, Math.abs(a2.y - a1.y));
        else box('st-eng-meas st-eng-meas--h', Math.min(a1.x, a2.x), a1.y, Math.abs(a2.x - a1.x), 1);
        var t = ce('div', 'st-eng-meas__l', fmt(m.v));
        t.style.transform = 'translate(' + round((a1.x + a2.x) / 2, 1) + 'px,' + round((a1.y + a2.y) / 2, 1) + 'px) translate(-50%,-50%)';
        ov.appendChild(t);
      });
      if (insertLine) {
        var i1 = toScreen(insertLine.ab, insertLine.x1, insertLine.y1), i2 = toScreen(insertLine.ab, insertLine.x2, insertLine.y2);
        if (insertLine.x1 === insertLine.x2) box('st-eng-ins st-eng-ins--v', i1.x - 1, i1.y, 2, i2.y - i1.y);
        else box('st-eng-ins st-eng-ins--h', i1.x, i1.y - 1, i2.x - i1.x, 2);
      }
      if (drawRect) {
        var d1 = toScreen(drawRect.ab, drawRect.x, drawRect.y);
        box('st-eng-draw', d1.x, d1.y, drawRect.w * d1.k, drawRect.h * d1.k);
      }
      drawGuides();
      drawRulers();
      drawPixelGrid();
      markBps();
    }
    function fmt(v) { var r = Math.round(v * 100) / 100; return String(r).replace('.', ','); }

    /* a node's box as the gesture in progress shows it: the selection box and the size label follow the
     * dragged / resized elements live (the preview moves them with a transform, the layout is untouched
     * until the drop) */
    function previewBox(ab, sid, id) {
      var b = boxF(ab, sid, id);
      if (!b || !drag || drag.sid !== sid || ab !== drag.ab || !drag.moved) return b;
      if (drag.kind === 'move' && drag.ids.indexOf(id) !== -1 && (drag.dx || drag.dy)) return { x: b.x + drag.dx, y: b.y + drag.dy, w: b.w, h: b.h };
      if (drag.kind === 'resize' && drag.res) {
        if (!drag.group && drag.id === id) return { x: b.x - drag.b0.x + drag.res.x, y: b.y - drag.b0.y + drag.res.y, w: drag.res.w, h: drag.res.h };
        if (drag.group && drag.boxes && drag.boxes[id]) { var r = drag.boxes[id]; return { x: b.x - r.from.x + r.to.x, y: b.y - r.from.y + r.to.y, w: r.to.w, h: r.to.h }; }
      }
      return b;
    }
    /* the inspector's X / Y / W / H while a gesture is in progress (null when there is none) */
    function dragPreview(sid, id) {
      if (!drag || !drag.moved || drag.sid !== sid) return null;
      if (drag.kind === 'move' && drag.ids.indexOf(id) !== -1) return { dx: drag.dx || 0, dy: drag.dy || 0 };
      if (drag.kind === 'resize' && drag.res && !drag.group && drag.id === id) return { res: drag.res, b0: drag.b0 };
      if (drag.kind === 'resize' && drag.group && drag.boxes && drag.boxes[id]) return { res: drag.boxes[id].to, b0: drag.boxes[id].from };
      return null;
    }

    /* ================================================================ rulers, guides, grids */

    function guides() { var u = ui(); if (!Array.isArray(u.engGuides)) u.engGuides = []; return u.engGuides; }
    function rulersOn() { return ui().engRulers === true; }
    function drawGuides() {
      var ab = activeAb();
      guides().forEach(function (g, gi) {
        var f = abFrame(g.ab);
        if (!f || !S.abEls()[g.ab] || S.abEls()[g.ab].classList.contains('is-hidden')) return;
        var h = f.offsetHeight, w = f.offsetWidth;
        var a = toScreen(g.ab, g.axis === 'x' ? g.v : 0, g.axis === 'x' ? 0 : g.v);
        var el = g.axis === 'x' ? box('st-eng-guide st-eng-guide--x', a.x, a.y, 1, h * a.k) : box('st-eng-guide st-eng-guide--y', a.x, a.y, w * a.k, 1);
        el.setAttribute('data-guide', String(gi));
        if (g.ab !== ab) el.classList.add('is-other');
      });
    }
    function niceStep(k) {
      var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      for (var i = 0; i < steps.length; i++) if (steps[i] * k >= 60) return steps[i];
      return 10000;
    }
    /* the rulers' colours: the chrome's tokens (studio.css --st-ruler-*), read once per theme */
    var rulerInk = null;
    function rulerColors() {
      var t = document.documentElement.getAttribute('data-theme') || 'light';
      if (rulerInk && rulerInk.t === t) return rulerInk;
      var cs = getComputedStyle(document.documentElement);
      function v(n, d) { var x = cs.getPropertyValue(n).trim(); return x || d; }
      rulerInk = { t: t, bg: v('--st-ruler-bg', '#FFFFFF'), line: v('--st-ruler-line', 'rgba(0,0,0,.1)'),
        tick: v('--st-ruler-tick', 'rgba(0,0,0,.3)'), ink: v('--st-ruler-ink', '#6B6B6B') };
      return rulerInk;
    }
    window.addEventListener('jeere-studio-theme', function () { rulerInk = null; try { drawRulers(); } catch (e) { /* not ready */ } });
    function drawRulers() {
      var on = rulersOn();
      [rulerX, rulerY, rulerC].forEach(function (c) { c.hidden = !on; });
      stage.classList.toggle('st-eng-has-rulers', on);
      if (!on) return;
      var ab = activeAb(), f = abFrame(ab);
      if (!f) return;
      var sr = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var o = toScreen(ab, 0, 0), k = o.k, step = niceStep(k);
      [[rulerX, sr.width, 20, 'x'], [rulerY, 20, sr.height, 'y']].forEach(function (d) {
        var c = d[0];
        if (c.width !== Math.round(d[1] * dpr) || c.height !== Math.round(d[2] * dpr)) { c.width = Math.round(d[1] * dpr); c.height = Math.round(d[2] * dpr); c.style.width = d[1] + 'px'; c.style.height = d[2] + 'px'; }
        var x = c.getContext('2d');
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        var rc = rulerColors();
        x.fillStyle = rc.bg; x.fillRect(0, 0, d[1], d[2]);
        x.fillStyle = rc.line;
        x.fillRect(d[3] === 'x' ? 0 : 19, d[3] === 'x' ? 19 : 0, d[3] === 'x' ? d[1] : 1, d[3] === 'x' ? 1 : d[2]);
        x.strokeStyle = rc.tick; x.fillStyle = rc.ink; x.font = '10px Inter, system-ui, sans-serif'; x.lineWidth = 1;
        var len = d[3] === 'x' ? d[1] : d[2], origin = d[3] === 'x' ? o.x : o.y;
        var first = Math.floor((-origin) / k / step) * step;
        x.beginPath();
        for (var v = first; (origin + v * k) < len + step * k; v += step / 5) {
          var p = Math.round(origin + v * k) + 0.5;
          var major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
          if (d[3] === 'x') { x.moveTo(p, major ? 8 : 15); x.lineTo(p, 20); }
          else { x.moveTo(major ? 8 : 15, p); x.lineTo(20, p); }
          if (major) {
            if (d[3] === 'x') x.fillText(String(Math.round(v)), p + 3, 10);
            else { x.save(); x.translate(10, p - 3); x.rotate(-Math.PI / 2); x.fillText(String(Math.round(v)), 0, 0); x.restore(); }
          }
        }
        x.stroke();
        // the selection's extent, in blue, like Figma
        var cur = current();
        if (cur && !cur.root) {
          var b = boxF(ab, cur.sid, cur.ids[0]);
          if (b) {
            x.fillStyle = 'rgba(54,87,255,.35)';
            if (d[3] === 'x') x.fillRect(origin + b.x * k, 0, b.w * k, 20); else x.fillRect(0, origin + b.y * k, 20, b.h * k);
          }
        }
      });
    }
    function drawPixelGrid() {
      var z = state().zoom;
      var on = z >= 8 && ui().engPixelGrid !== false;
      pix.hidden = !on;
      if (!on) return;
      var ab = activeAb(), f = abFrame(ab);
      if (!f) { pix.hidden = true; return; }
      var sr = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (pix.width !== Math.round(sr.width * dpr)) { pix.width = Math.round(sr.width * dpr); pix.style.width = sr.width + 'px'; }
      if (pix.height !== Math.round(sr.height * dpr)) { pix.height = Math.round(sr.height * dpr); pix.style.height = sr.height + 'px'; }
      var x = pix.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, pix.width, pix.height);
      var o = toScreen(ab, 0, 0), k = o.k * dpr;
      x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 1;
      x.beginPath();
      var ox = o.x * dpr, oy = o.y * dpr;
      for (var px = ox - Math.ceil(ox / k) * k; px < pix.width; px += k) { var xx = Math.round(px) + 0.5; x.moveTo(xx, 0); x.lineTo(xx, pix.height); }
      for (var py = oy - Math.ceil(oy / k) * k; py < pix.height; py += k) { var yy = Math.round(py) + 0.5; x.moveTo(0, yy); x.lineTo(pix.width, yy); }
      x.stroke();
    }
    /* the layout grid (⇧ G): columns of each artboard, in the world layer (it pans and zooms with it) */
    function gridSpec(w) { return w >= 1200 ? { cols: 12, gutter: 24, margin: Math.max(40, (w - 1120) / 2) } : w >= 768 ? { cols: 8, gutter: 20, margin: 32 } : { cols: 4, gutter: 16, margin: 20 }; }
    function drawLayoutGrid() {
      var on = ui().engGrid === true;
      Object.keys(S.abEls()).forEach(function (k) {
        var a = S.abEls()[k], f = abFrame(k);
        if (!a || !f) return;
        var g = a.querySelector('.st-eng-lgrid');
        if (!on) { if (g) g.remove(); return; }
        if (!g) { g = ce('div', 'st-eng-lgrid'); a.appendChild(g); }
        var w = abWidth(k), sp = gridSpec(w);
        g.style.left = f.offsetLeft + 'px'; g.style.top = f.offsetTop + 'px'; g.style.width = w + 'px'; g.style.height = f.offsetHeight + 'px';
        var colW = (w - 2 * sp.margin - (sp.cols - 1) * sp.gutter) / sp.cols;
        var html = '';
        for (var i = 0; i < sp.cols; i++) html += '<span style="left:' + round(sp.margin + i * (colW + sp.gutter), 2) + 'px;width:' + round(colW, 2) + 'px"></span>';
        if (g.getAttribute('data-sig') !== w + ':' + f.offsetHeight) { g.innerHTML = html; g.setAttribute('data-sig', w + ':' + f.offsetHeight); }
      });
    }
    function toggleRulers() { ui().engRulers = !rulersOn(); S.saveUI(); draw(); toast(rulersOn() ? 'Règles affichées (⇧ R). Tirez un guide depuis une règle.' : 'Règles masquées.', 'info'); }
    function toggleGrid() { ui().engGrid = ui().engGrid !== true; S.saveUI(); drawLayoutGrid(); toast(ui().engGrid ? 'Grille de mise en page affichée (⇧ G).' : 'Grille de mise en page masquée.', 'info'); }
    function togglePixelGrid() { ui().engPixelGrid = ui().engPixelGrid === false; S.saveUI(); draw(); toast(ui().engPixelGrid !== false ? 'Grille de pixels : visible à partir de 800 %.' : 'Grille de pixels masquée.', 'info'); }

    /* the breakpoint of each artboard on its name, the edited one marked (Framer's breakpoints) */
    function markBps() {
      var any = S.sections().some(function (s) { return EN.isDetached(s); });
      var eb = editBp();
      Object.keys(S.abEls()).forEach(function (k) {
        var a = S.abEls()[k];
        var nm = a && a.querySelector('.st-ab__name');
        if (!nm) return;
        var chip = nm.querySelector('.st-eng-bp');
        if (!any) { if (chip) chip.remove(); a.classList.remove('is-bp-edit'); return; }
        var bp = abBp(k);
        if (!chip) { chip = ce('em', 'st-eng-bp'); nm.appendChild(chip); }
        var label = bp === 'base' ? 'Ordinateur' : bp === 'tablet' ? 'Tablette' : 'Téléphone';
        if (chip.textContent !== ' · ' + label) chip.textContent = ' · ' + label;
        a.classList.toggle('is-bp-edit', bp === eb);
      });
    }

    /* ================================================================ snapping (SPEC §1.3) */

    var TOL = 6; // screen px
    /* candidates in the parent's coordinates: its edges and centre, the visible siblings', the guides */
    function snapTargets(ab, sid, parentId, skip) {
      var l = lay(sid, ab), e = E.ed(sid);
      var p = e.doc.nodes[parentId];
      var pb = l && l.world.get(parentId);
      if (!p || !pb) return { xs: [], ys: [], boxes: [], pb: null };
      var xs = [0, pb.w / 2, pb.w], ys = [0, pb.h / 2, pb.h], boxes = [];
      (p.children || []).forEach(function (cid) {
        if (skip[cid]) return;
        var b = l.world.get(cid);
        if (!b || !b.w && !b.h) return;
        var r = { x: b.x - pb.x, y: b.y - pb.y, w: b.w, h: b.h };
        boxes.push(r);
        xs.push(r.x, r.x + r.w / 2, r.x + r.w);
        ys.push(r.y, r.y + r.h / 2, r.y + r.h);
      });
      var o = secOrigin(ab, sid);
      guides().forEach(function (g) {
        if (g.ab !== ab || !o) return;
        if (g.axis === 'x') xs.push(g.v - o.x - pb.x); else ys.push(g.v - o.y - pb.y);
      });
      return { xs: xs, ys: ys, boxes: boxes, pb: pb };
    }
    function bestSnap(edges, cands, tol) {
      var best = null;
      edges.forEach(function (e, ei) { cands.forEach(function (c) { var d = c - e; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: c, edge: ei }; }); });
      return best;
    }
    function pixelSnap(v) { var dpr = 1; return Math.round(v * dpr) / dpr; }

    /* ================================================================ gestures */

    var suppressClick = false;
    function eatClick() { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }

    function startMove(e, h) {
      var cur = current();
      if (!cur || cur.root) return false;
      var ids = cur.ids.filter(function (id) { return !E.node(cur.sid, id).locked; });
      if (!ids.length) return false;
      var n0 = E.node(cur.sid, ids[0]);
      var parentId = n0.parent;
      var l = lay(cur.sid, h.ab);
      var pb = l.world.get(parentId);
      var parent = E.node(cur.sid, parentId);
      var bp = abBp(h.ab);
      var plp = E.value(cur.sid, parentId, 'layoutParent', bp) || { mode: 'absolute' };
      var skip = {};
      ids.forEach(function (id) { E.subtreeIds(cur.sid, id).forEach(function (x) { skip[x] = true; }); });
      // snapping reads the (rotated) bounding boxes; the stored x / y are the unrotated box's (§1.4)
      var starts = ids.map(function (id) {
        var wb = l.world.get(id), b = l.boxes.get(id) || { x: wb.x - pb.x, y: wb.y - pb.y, w: wb.w, h: wb.h };
        return { id: id, x: wb.x - pb.x, y: wb.y - pb.y, w: wb.w, h: wb.h, gx: b.x, gy: b.y, gw: b.w, gh: b.h, flow: (E.value(cur.sid, id, 'layoutChild', bp) || {}).position !== 'absolute' && plp.mode !== 'absolute' };
      });
      var p0 = toFrame(h.ab, e.clientX, e.clientY);
      drag = { kind: 'move', sid: cur.sid, ab: h.ab, bp: bp, ids: ids, parentId: parentId, parentMode: plp.mode, plp: plp, starts: starts, p0: p0, moved: false, pid: e.pointerId,
        targets: snapTargets(h.ab, cur.sid, parentId, skip), skip: skip, els: ids.map(function (id) { return nodeEl(h.ab, cur.sid, id); }) };
      return true;
    }
    function moveDrag(e) {
      var d = drag;
      var p = toFrame(d.ab, e.clientX, e.clientY);
      var dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (!d.moved) { if (Math.abs(dx) * p.k + Math.abs(dy) * p.k < 3) return; d.moved = true; S.closeCtx(); stage.classList.add('st-eng-dragging'); }
      // Alt held (at any time of the drag): a copy is dropped, the original stays (Figma, wave 2)
      d.alt = !!e.altKey;
      stage.classList.toggle('st-eng-altcopy', d.alt);
      snapLines = []; measures = []; insertLine = null;
      var s0 = d.starts[0];
      var union = unionOf(d.starts);
      var flowMove = d.starts.every(function (s) { return s.flow; }) && !(e.ctrlKey || e.metaKey);
      d.flowMove = flowMove;
      if (flowMove) {
        // insertion in the stack by the midpoint rule (§1.3)
        var horiz = d.plp.mode === 'stack' && d.plp.direction === 'horizontal';
        var px2 = (horiz ? union.x + union.w / 2 + dx : union.y + union.h / 2 + dy);
        var parent = E.node(d.sid, d.parentId);
        var l = lay(d.sid, d.ab);
        var kids = parent.children.filter(function (c) { return !d.skip[c] && l.world.get(c) && (E.value(d.sid, c, 'layoutChild', d.bp) || {}).position !== 'absolute' && E.value(d.sid, c, 'visible', d.bp) !== false; });
        var idx = 0;
        kids.forEach(function (c) { var b = l.world.get(c); var mid = horiz ? b.x - d.targets.pb.x + b.w / 2 : b.y - d.targets.pb.y + b.h / 2; if (mid < px2) idx++; });
        d.insertAt = idx;
        var o = secOrigin(d.ab, d.sid), pb = d.targets.pb;
        var gap = typeof d.plp.gap === 'number' ? d.plp.gap : 0;
        var pos;
        if (idx < kids.length) { var bn = l.world.get(kids[idx]); pos = horiz ? bn.x - gap / 2 : bn.y - gap / 2; }
        else if (kids.length) { var bl = l.world.get(kids[kids.length - 1]); pos = horiz ? bl.x + bl.w + gap / 2 : bl.y + bl.h + gap / 2; }
        else pos = horiz ? pb.x + 8 : pb.y + 8;
        if (horiz) insertLine = { ab: d.ab, x1: o.x + pos, y1: o.y + pb.y, x2: o.x + pos, y2: o.y + pb.y + pb.h };
        else insertLine = { ab: d.ab, x1: o.x + pb.x, y1: o.y + pos, x2: o.x + pb.x + pb.w, y2: o.y + pos };
        d.dx = dx; d.dy = dy;
      } else {
        var tol = TOL / p.k;
        var nx = union.x + dx, ny = union.y + dy;
        var sx = bestSnap([nx, nx + union.w / 2, nx + union.w], d.targets.xs, tol);
        var sy = bestSnap([ny, ny + union.h / 2, ny + union.h], d.targets.ys, tol);
        if (sx) nx += sx.d; else if (state().config && E.ed(d.sid).doc.settings.snapToPixel !== false) nx = pixelSnap(nx);
        if (sy) ny += sy.d; else if (E.ed(d.sid).doc.settings.snapToPixel !== false) ny = pixelSnap(ny);
        // equal spacing between two neighbours on one axis (pink measures)
        d.dx = nx - union.x; d.dy = ny - union.y;
        var o2 = secOrigin(d.ab, d.sid), pb2 = d.targets.pb;
        var ax = o2.x + pb2.x, ay = o2.y + pb2.y;
        if (sx) snapLines.push({ ab: d.ab, x1: ax + sx.at, y1: ay + Math.min(ny, 0), x2: ax + sx.at, y2: ay + Math.max(ny + union.h, pb2.h) });
        if (sy) snapLines.push({ ab: d.ab, x1: ax + Math.min(nx, 0), y1: ay + sy.at, x2: ax + Math.max(nx + union.w, pb2.w), y2: ay + sy.at });
        measureAround(d, { x: nx, y: ny, w: union.w, h: union.h }, ax, ay);
      }
      // the preview: only the dragged elements move (a transform), the rest of the store stays put
      d.els.forEach(function (el) { if (el) el.style.transform = 'translate(' + round(d.dx, 2) + 'px,' + round(d.dy, 2) + 'px)'; });
      liveXY(d);
      draw();
    }
    /* X and Y of the inspector follow the drag (wave 2: Figma shows the position live), whole pixels */
    function liveXY(d) {
      if (d.ids.length !== 1 || d.flowMove) return;
      var s0 = d.starts[0];
      [['X (px', s0.gx + d.dx], ['Y (px', s0.gy + d.dy]].forEach(function (f) {
        var inp = document.querySelector('.st-right input[aria-label^="' + f[0] + '"]');
        if (inp && document.activeElement !== inp) inp.value = String(Math.round(f[1]));
      });
    }
    function unionOf(list) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      list.forEach(function (s) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); });
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    /* the distances to the nearest neighbours (and the parent's edges), Figma's red measures */
    function measureAround(d, b, ax, ay) {
      var best = { l: null, r: null, t: null, btm: null };
      d.targets.boxes.forEach(function (o) {
        var overlapY = o.y < b.y + b.h && o.y + o.h > b.y, overlapX = o.x < b.x + b.w && o.x + o.w > b.x;
        if (overlapY && o.x + o.w <= b.x) { var gl = b.x - (o.x + o.w); if (best.l === null || gl < best.l.v) best.l = { v: gl, o: o }; }
        if (overlapY && o.x >= b.x + b.w) { var gr = o.x - (b.x + b.w); if (best.r === null || gr < best.r.v) best.r = { v: gr, o: o }; }
        if (overlapX && o.y + o.h <= b.y) { var gt = b.y - (o.y + o.h); if (best.t === null || gt < best.t.v) best.t = { v: gt, o: o }; }
        if (overlapX && o.y >= b.y + b.h) { var gb = o.y - (b.y + b.h); if (best.btm === null || gb < best.btm.v) best.btm = { v: gb, o: o }; }
      });
      var cy = ay + b.y + b.h / 2, cx = ax + b.x + b.w / 2;
      if (best.l) measures.push({ ab: d.ab, x1: ax + b.x - best.l.v, y1: cy, x2: ax + b.x, y2: cy, v: best.l.v });
      if (best.r) measures.push({ ab: d.ab, x1: ax + b.x + b.w, y1: cy, x2: ax + b.x + b.w + best.r.v, y2: cy, v: best.r.v });
      if (best.t) measures.push({ ab: d.ab, x1: cx, y1: ay + b.y - best.t.v, x2: cx, y2: ay + b.y, v: best.t.v });
      if (best.btm) measures.push({ ab: d.ab, x1: cx, y1: ay + b.y + b.h, x2: cx, y2: ay + b.y + b.h + best.btm.v, v: best.btm.v });
    }
    /* the drop: ONE transaction — new x / y at the artboard's breakpoint, or a new place in the stack */
    /* Alt + drag (wave 2): copies of the dragged nodes at the dropped place (or the dropped rank in a stack),
     * the originals untouched; one transaction, the copies selected — Figma's « Alt-drag to duplicate » */
    function endAltCopy(d) {
      var sid = d.sid, e = E.ed(sid);
      var parent = E.node(sid, d.parentId);
      var ordered = d.ids.slice().sort(function (a, b) { return parent.children.indexOf(a) - parent.children.indexOf(b); });
      var at = parent.children.length;
      if (d.flowMove) {
        var l = lay(sid, d.ab);
        var flowKids = parent.children.filter(function (c) { return l.world.get(c) && (E.value(sid, c, 'layoutChild', d.bp) || {}).position !== 'absolute' && E.value(sid, c, 'visible', d.bp) !== false; });
        var kidsNoSel = flowKids.filter(function (c) { return !d.skip[c]; });
        var before = kidsNoSel[d.insertAt];
        at = before ? parent.children.indexOf(before) : (kidsNoSel.length ? parent.children.indexOf(kidsNoSel[kidsNoSel.length - 1]) + 1 : parent.children.length);
      }
      var patches = [], newIds = [];
      ordered.forEach(function (id) {
        var list = E.subtreeIds(sid, id).map(function (x) { return clone(e.doc.nodes[x]); });
        var map = {};
        list.forEach(function (n) { map[n.id] = E.newId(); });
        var copies = list.map(function (n0, i) {
          var n = clone(n0);
          n.id = map[n0.id];
          n.parent = i === 0 ? d.parentId : map[n0.parent];
          if (n.children) n.children = n.children.map(function (x) { return map[x]; });
          return n;
        });
        if (!d.flowMove) {
          var st = d.starts.filter(function (x) { return x.id === id; })[0];
          var g = { x: round(st.gx + d.dx, 2), y: round(st.gy + d.dy, 2) };
          var top = copies[0];
          if (d.bp === 'base') top.geometry = Object.assign({}, top.geometry, g);
          else { top.overrides = top.overrides || {}; top.overrides[d.bp] = Object.assign({}, top.overrides[d.bp] || {}); top.overrides[d.bp].geometry = Object.assign({}, top.overrides[d.bp].geometry || {}, g); }
        }
        copies.forEach(function (n) { patches.push({ op: 'add', path: E.path(n.id), value: n }); });
        patches.push({ op: 'add', path: E.path(d.parentId, 'children/' + at), value: copies[0].id });
        at++;
        newIds.push(copies[0].id);
      });
      E.apply(sid, patches, newIds.length > 1 ? 'Éléments dupliqués (Alt)' : 'Élément dupliqué (Alt)', { structure: true });
      selectNodes(sid, newIds);
      return true;
    }
    function endMove(e) {
      var d = drag;
      d.els.forEach(function (el) { if (el) el.style.transform = ''; });
      stage.classList.remove('st-eng-dragging');
      stage.classList.remove('st-eng-altcopy');
      snapLines = []; measures = []; insertLine = null;
      if (!d.moved) return false;
      if ((d.alt || (e && e.altKey)) && !(d.parentMode !== 'absolute' && !d.flowMove)) return endAltCopy(d);
      var patches = [];
      if (d.flowMove) {
        var parent = E.node(d.sid, d.parentId);
        var l = lay(d.sid, d.ab);
        // the target index among all the children (the hidden and absolute ones keep their places)
        var flowKids = parent.children.filter(function (c) { return !d.skip[c] && l.world.get(c) && (E.value(d.sid, c, 'layoutChild', d.bp) || {}).position !== 'absolute' && E.value(d.sid, c, 'visible', d.bp) !== false; });
        var before = flowKids[d.insertAt];
        var order = parent.children.filter(function (c) { return d.ids.indexOf(c) === -1; });
        var at = before ? order.indexOf(before) : order.length;
        var newOrder = order.slice(0, at).concat(d.ids.slice().sort(function (a, b) { return parent.children.indexOf(a) - parent.children.indexOf(b); })).concat(order.slice(at));
        if (JSON.stringify(newOrder) === JSON.stringify(parent.children)) { draw(); return true; }
        patches.push({ op: 'replace', path: E.path(d.parentId, 'children'), value: newOrder });
        E.apply(d.sid, patches, 'Élément déplacé dans la pile');
      } else {
        var toAbs = d.parentMode !== 'absolute';
        d.starts.forEach(function (s) {
          // whole pixels on the drop (wave 2), unless the document asks for sub-pixels
          var whole = E.ed(d.sid).doc.settings.snapToPixel !== false;
          var g = { x: whole ? Math.round(s.gx + d.dx) : round(s.gx + d.dx, 2), y: whole ? Math.round(s.gy + d.dy) : round(s.gy + d.dy, 2) };
          if (toAbs) {
            // Ctrl held in a stack: the child leaves the flow, absolute at the dropped place (§1.3)
            var lc = clone(E.value(d.sid, s.id, 'layoutChild', 'base'));
            lc.position = 'absolute';
            if (lc.widthMode === 'fill') lc.widthMode = 'fixed';
            if (lc.heightMode === 'fill') lc.heightMode = 'fixed';
            g.w = round(s.gw, 2); g.h = round(s.gh, 2);
            patches = patches.concat(E.propPatches(d.sid, s.id, 'layoutChild', lc, 'base'));
            patches = patches.concat(E.propPatches(d.sid, s.id, 'geometry', Object.assign({}, E.value(d.sid, s.id, 'geometry', 'base'), g), 'base'));
          } else {
            var cur = E.value(d.sid, s.id, 'geometry', d.bp);
            patches = patches.concat(E.propPatches(d.sid, s.id, 'geometry', d.bp === 'base' ? Object.assign({}, cur, g) : g, d.bp));
          }
        });
        E.apply(d.sid, patches, d.ids.length > 1 ? 'Éléments déplacés' : 'Élément déplacé');
      }
      return true;
    }

    /* resize with the 8 handles (Maj: ratio, Alt: from the centre), on the artboard's breakpoint. Several
     * nodes: the handles scale the group's bounding box, every node keeps its place and its share of it
     * (Figma), one transaction. */
    function startResize(e, hk) {
      var cur = current();
      if (!cur || cur.root) return false;
      var ab = activeAb(), bp = abBp(ab);
      var l = lay(cur.sid, ab);
      if (cur.ids.length > 1) return startGroupResize(e, hk, cur, ab, bp, l);
      var id = cur.ids[0];
      var n = E.node(cur.sid, id);
      var b = l.world.get(id), pb = l.world.get(n.parent);
      if (!b || !pb) return false;
      var skip = {}; E.subtreeIds(cur.sid, id).forEach(function (x) { skip[x] = true; });
      var lb = l.boxes.get(id) || { x: b.x - pb.x, y: b.y - pb.y, w: b.w, h: b.h };
      drag = { kind: 'resize', hk: hk, sid: cur.sid, ab: ab, bp: bp, id: id, b0: { x: lb.x, y: lb.y, w: lb.w, h: lb.h }, p0: toFrame(ab, e.clientX, e.clientY),
        targets: snapTargets(ab, cur.sid, n.parent, skip), el: nodeEl(ab, cur.sid, id), moved: false, pid: e.pointerId,
        abs: (E.value(cur.sid, id, 'layoutChild', bp) || {}).position === 'absolute' || (E.value(cur.sid, n.parent, 'layoutParent', bp) || {}).mode === 'absolute' };
      return true;
    }
    function startGroupResize(e, hk, cur, ab, bp, l) {
      var ids = cur.ids.filter(function (id) { var n = E.node(cur.sid, id); return n && !n.locked; });
      if (!ids.length) return false;
      var parents = {};
      ids.forEach(function (id) { parents[E.node(cur.sid, id).parent] = true; });
      var common = Object.keys(parents).length === 1 ? Object.keys(parents)[0] : null;
      var pb = common ? l.world.get(common) : { x: 0, y: 0, w: 0, h: 0 };
      var skip = {};
      ids.forEach(function (id) { E.subtreeIds(cur.sid, id).forEach(function (x) { skip[x] = true; }); });
      var items = ids.map(function (id) {
        var n = E.node(cur.sid, id), wb = l.world.get(id), ppb = l.world.get(n.parent) || { x: 0, y: 0 };
        var lb = l.boxes.get(id) || { x: wb.x - ppb.x, y: wb.y - ppb.y, w: wb.w, h: wb.h };
        return { id: id, wb: { x: wb.x - pb.x, y: wb.y - pb.y, w: wb.w, h: wb.h }, lb: { x: lb.x, y: lb.y, w: lb.w, h: lb.h }, el: nodeEl(ab, cur.sid, id),
          abs: (E.value(cur.sid, id, 'layoutChild', bp) || {}).position === 'absolute' || (E.value(cur.sid, n.parent, 'layoutParent', bp) || {}).mode === 'absolute' };
      }).filter(function (it) { return it.wb && it.wb.w >= 0; });
      var u = unionOf(items.map(function (it) { return it.wb; }));
      drag = { kind: 'resize', group: true, hk: hk, sid: cur.sid, ab: ab, bp: bp, ids: ids, items: items, b0: u, p0: toFrame(ab, e.clientX, e.clientY),
        targets: common ? snapTargets(ab, cur.sid, common, skip) : { xs: [], ys: [], boxes: [], pb: pb }, moved: false, pid: e.pointerId };
      return true;
    }
    /* the new rectangle of a resized box b (handle hk, pointer delta dx / dy), snapped on its moving edges */
    function resizedRect(d, e, dx, dy, tol) {
      var b = d.b0, hk = d.hk;
      var x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      if (hk.indexOf('w') !== -1) x0 += dx;
      if (hk.indexOf('e') !== -1) x1 += dx;
      if (hk.indexOf('n') !== -1) y0 += dy;
      if (hk.indexOf('s') !== -1) y1 += dy;
      snapLines = [];
      var o = secOrigin(d.ab, d.sid), pb = d.targets.pb || { x: 0, y: 0, w: 0, h: 0 };
      // snap the moving edges
      if (hk.indexOf('w') !== -1 || hk.indexOf('e') !== -1) {
        var ex = hk.indexOf('w') !== -1 ? x0 : x1;
        var sx = bestSnap([ex], d.targets.xs, tol);
        ex = sx ? ex + sx.d : pixelSnap(ex);
        if (hk.indexOf('w') !== -1) x0 = ex; else x1 = ex;
        if (sx && o) snapLines.push({ ab: d.ab, x1: o.x + pb.x + sx.at, y1: o.y + pb.y, x2: o.x + pb.x + sx.at, y2: o.y + pb.y + pb.h });
      }
      if (hk.indexOf('n') !== -1 || hk.indexOf('s') !== -1) {
        var ey = hk.indexOf('n') !== -1 ? y0 : y1;
        var sy = bestSnap([ey], d.targets.ys, tol);
        ey = sy ? ey + sy.d : pixelSnap(ey);
        if (hk.indexOf('n') !== -1) y0 = ey; else y1 = ey;
        if (sy && o) snapLines.push({ ab: d.ab, x1: o.x + pb.x, y1: o.y + pb.y + sy.at, x2: o.x + pb.x + pb.w, y2: o.y + pb.y + sy.at });
      }
      var w = x1 - x0, h = y1 - y0;
      if (e.shiftKey && b.w > 0 && b.h > 0) {
        var ratio = b.w / b.h;
        if (hk.length === 2 || hk === 'e' || hk === 'w') h = w / ratio; else w = h * ratio;
        if (hk.indexOf('n') !== -1) y0 = y1 - h; else y1 = y0 + h;
        if (hk.indexOf('w') !== -1) x0 = x1 - w; else x1 = x0 + w;
      }
      if (e.altKey) {
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (hk.indexOf('w') !== -1 || hk.indexOf('e') !== -1) { var hw = Math.abs((hk.indexOf('e') !== -1 ? x1 : x0) - cx); x0 = cx - hw; x1 = cx + hw; w = 2 * hw; }
        if (hk.indexOf('n') !== -1 || hk.indexOf('s') !== -1) { var hh = Math.abs((hk.indexOf('s') !== -1 ? y1 : y0) - cy); y0 = cy - hh; y1 = cy + hh; h = 2 * hh; }
      }
      if (w < 1) { w = 1; } if (h < 1) { h = 1; }
      return { x: round(Math.min(x0, x1), 2), y: round(Math.min(y0, y1), 2), w: round(Math.abs(w), 2), h: round(Math.abs(h), 2) };
    }
    function resizeDrag(e) {
      var d = drag;
      var p = toFrame(d.ab, e.clientX, e.clientY);
      var dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (!d.moved) { if (Math.abs(dx) * p.k + Math.abs(dy) * p.k < 2) return; d.moved = true; }
      d.res = resizedRect(d, e, dx, dy, TOL / p.k);
      if (d.group) {
        // every node keeps its share of the group's box (scaled from the box's own origin)
        var u = d.b0, r = d.res, sx = u.w ? r.w / u.w : 1, sy = u.h ? r.h / u.h : 1;
        d.boxes = {};
        d.items.forEach(function (it) {
          var nx = r.x + (it.wb.x - u.x) * sx, ny = r.y + (it.wb.y - u.y) * sy;
          var to = { x: round(it.lb.x + (nx - it.wb.x), 2), y: round(it.lb.y + (ny - it.wb.y), 2), w: round(Math.max(1, it.wb.w * sx), 2), h: round(Math.max(1, it.wb.h * sy), 2) };
          d.boxes[it.id] = { from: it.lb, to: to };
          if (it.el) {
            it.el.style.width = to.w + 'px';
            it.el.style.height = to.h + 'px';
            it.el.style.maxWidth = 'none';
            it.el.style.transform = it.abs ? 'translate(' + round(to.x - it.lb.x, 2) + 'px,' + round(to.y - it.lb.y, 2) + 'px)' : '';
          }
        });
      } else if (d.el) {
        var b = d.b0;
        d.el.style.width = d.res.w + 'px';
        d.el.style.height = d.res.h + 'px';
        if (d.abs) d.el.style.transform = 'translate(' + round(d.res.x - b.x, 2) + 'px,' + round(d.res.y - b.y, 2) + 'px)';
        d.el.style.maxWidth = 'none';
      }
      sizeLabel = d.res;
      draw();
    }
    var sizeLabel = null;
    /* the patches of one resized node: the geometry at the breakpoint, a hug / fill size made fixed */
    function resizePatches(sid, id, bp, r, b, hk, abs) {
      var patches = [];
      var n = E.node(sid, id);
      var lc = clone(E.value(sid, id, 'layoutChild', bp) || {});
      var g = {};
      if (hk.indexOf('w') !== -1 || hk.indexOf('e') !== -1 || abs) g.w = r.w;
      if (hk.indexOf('n') !== -1 || hk.indexOf('s') !== -1 || abs) g.h = r.h;
      if (abs) { g.x = r.x; g.y = r.y; }
      // a hug / fill size resized by hand becomes fixed on that axis (Figma), at this breakpoint
      var lcd = {};
      if (g.w !== undefined && Math.abs(r.w - b.w) > 0.01 && lc.widthMode !== 'fixed') lcd.widthMode = 'fixed';
      if (g.h !== undefined && Math.abs(r.h - b.h) > 0.01 && lc.heightMode !== 'fixed') lcd.heightMode = 'fixed';
      if (n.type === 'text' && n.resize === 'autoWidth' && lcd.widthMode) patches.push({ op: 'replace', path: E.path(id, 'resize'), value: 'autoHeight' });
      if (Object.keys(lcd).length) patches = patches.concat(E.propPatches(sid, id, 'layoutChild', bp === 'base' ? Object.assign(lc, lcd) : lcd, bp));
      patches = patches.concat(E.propPatches(sid, id, 'geometry', bp === 'base' ? Object.assign({}, E.value(sid, id, 'geometry', 'base'), g) : g, bp));
      return patches;
    }
    function endResize() {
      var d = drag;
      if (d.el) { d.el.style.width = ''; d.el.style.height = ''; d.el.style.transform = ''; d.el.style.maxWidth = ''; }
      if (d.items) d.items.forEach(function (it) { if (it.el) { it.el.style.width = ''; it.el.style.height = ''; it.el.style.transform = ''; it.el.style.maxWidth = ''; } });
      snapLines = [];
      sizeLabel = null;
      if (!d.moved || !d.res) return false;
      if (d.group) {
        var patches = [];
        d.items.forEach(function (it) { var bx = d.boxes && d.boxes[it.id]; if (bx) patches = patches.concat(resizePatches(d.sid, it.id, d.bp, bx.to, it.lb, 'nesw', it.abs)); });
        if (patches.length) E.apply(d.sid, patches, d.items.length + ' éléments redimensionnés');
        return true;
      }
      E.apply(d.sid, resizePatches(d.sid, d.id, d.bp, d.res, d.b0, d.hk, d.abs), 'Élément redimensionné');
      return true;
    }

    function startRotate(e, hk) {
      var cur = current();
      if (!cur || cur.root || cur.ids.length !== 1) return false;
      var ab = activeAb(), id = cur.ids[0];
      var b = boxF(ab, cur.sid, id);
      if (!b) return false;
      var c = toScreen(ab, b.x + b.w / 2, b.y + b.h / 2), sr = stage.getBoundingClientRect();
      var g = E.value(cur.sid, id, 'geometry', abBp(ab));
      drag = { kind: 'rotate', sid: cur.sid, ab: ab, bp: abBp(ab), id: id, cx: c.x + sr.left, cy: c.y + sr.top, a0: Math.atan2(e.clientY - c.y - sr.top, e.clientX - c.x - sr.left), r0: g.rotation || 0, el: nodeEl(ab, cur.sid, id), moved: false, pid: e.pointerId };
      return true;
    }
    function rotateDrag(e) {
      var d = drag;
      var a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      var deg = d.r0 + (a - d.a0) * 180 / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg + 180) % 360 + 360) % 360 - 180;
      d.moved = true;
      d.deg = round(deg, 2);
      if (d.el) d.el.style.transform = 'rotate(' + (d.deg - d.r0) + 'deg)';
      draw();
    }
    function endRotate() {
      var d = drag;
      if (d.el) d.el.style.transform = '';
      if (!d.moved || d.deg === undefined) return false;
      var g = E.value(d.sid, d.id, 'geometry', 'base');
      E.apply(d.sid, E.propPatches(d.sid, d.id, 'geometry', d.bp === 'base' ? Object.assign({}, g, { rotation: d.deg }) : { rotation: d.deg }, d.bp), 'Rotation');
      return true;
    }

    /* ================================================================ drawing tools (F R O T I) */

    var DRAW_TOOLS = { frame: 1, rect: 1, ellipse: 1, image: 1 };
    function drawTool() { var t = state().tool; return DRAW_TOOLS[t] || t === 'text' ? t : null; }
    function containerAt(ab, sid, clientX, clientY, target) {
      // the deepest engine frame under the pointer (a container), else the section's root
      var h = target ? hit(target) : null;
      var id = h && h.sid === sid ? h.id : E.rootId(sid);
      while (id && !E.isContainer(E.node(sid, id))) id = E.node(sid, id).parent;
      return id || E.rootId(sid);
    }
    function startDraw(e, target) {
      var frame = target && target.closest ? target.closest('.st-ab__frame') : null;
      if (!frame) return false;
      var ab = abOf(frame);
      var sec = target.closest('[data-section-id]');
      if (!sec) { S.hintOnce('eng-draw-out', 'Dessinez dans une section de l’aperçu : en-tête et pied de page suivent le modèle.', 5000); return true; }
      var p = toFrame(ab, e.clientX, e.clientY);
      drag = { kind: 'draw', tool: state().tool, ab: ab, sid: sec.getAttribute('data-section-id'), p0: p, target: target, moved: false, pid: e.pointerId, cx: e.clientX, cy: e.clientY };
      return true;
    }
    function drawDrag(e) {
      var d = drag;
      var p = toFrame(d.ab, e.clientX, e.clientY);
      var x0 = pixelSnap(Math.min(d.p0.x, p.x)), y0 = pixelSnap(Math.min(d.p0.y, p.y));
      var w = Math.abs(p.x - d.p0.x), h = Math.abs(p.y - d.p0.y);
      if (e.shiftKey) { var m = Math.max(w, h); w = h = m; }
      if (w * p.k + h * p.k > 4) d.moved = true;
      drawRect = { ab: d.ab, x: x0, y: y0, w: pixelSnap(w), h: pixelSnap(h) };
      draw();
    }
    function endDraw() {
      var d = drag;
      var r = drawRect;
      drawRect = null;
      draw();
      var tool = d.tool;
      var go = function () {
        var sid = d.sid;
        var o = secOrigin(d.ab, sid);
        if (!o) return;
        var parentId = containerAt(d.ab, sid, d.cx, d.cy, d.target);
        var pbox = boxF(d.ab, sid, parentId);
        var rect = r && d.moved ? r : { x: d.p0.x, y: d.p0.y, w: tool === 'text' ? 0 : (tool === 'image' ? 240 : 100), h: tool === 'text' ? 0 : (tool === 'image' ? 180 : 100) };
        var rel = { x: round(rect.x - pbox.x, 2), y: round(rect.y - pbox.y, 2), w: Math.max(1, round(rect.w, 2)), h: Math.max(1, round(rect.h, 2)) };
        create(sid, tool, parentId, rel, d.ab, !!(r && d.moved));
      };
      if (!E.isDetached(d.sid)) {
        if (!S.sectionById(d.sid)) return true;
        E.detach(d.sid, { label: 'Section détachée pour dessiner', silent: true }).then(function (ok) {
          if (!ok) return;
          toast('Section détachée pour y dessiner. Ctrl Z pour annuler.', 'ok');
          requestAnimationFrame(function () { requestAnimationFrame(go); });
        });
      } else go();
      return true;
    }
    function storeFont(ab, which) {
      var r = S.roots()[ab];
      var v = r ? getComputedStyle(r).getPropertyValue(which === 'display' ? '--st-font-display' : '--st-font-text') : '';
      var names = String(v || '').split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }).filter(function (x) { return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(x); });
      return names.length ? names.slice(0, 6).join(', ') : 'Inter';
    }
    function storeColor(ab, v) { var r = S.roots()[ab]; return E.parseColor(r ? getComputedStyle(r).getPropertyValue(v).trim() : '') || { r: 0.08, g: 0.07, b: 0.06, a: 1 }; }
    function demoPhoto() {
      var c = state().config;
      var ps = (c.products || []).filter(function (p) { return p.photo; });
      var id = ps.length ? ps[0].photo : null;
      if (!id) { var s = (c.sections || []).filter(function (x) { return x.settings && x.settings.photo; })[0]; id = s ? s.settings.photo : null; }
      return id && S.R.photoInfo && S.R.photoInfo(id) ? id : null;
    }
    /** a new node (Frame, Rectangle, Ellipse, Text, Image) in a container of a detached section */
    function create(sid, tool, parentId, rel, ab, sized) {
      var parent = E.node(sid, parentId);
      var bp = abBp(ab);
      var plp = E.value(sid, parentId, 'layoutParent', bp) || { mode: 'absolute' };
      var inFlow = plp.mode !== 'absolute';
      var lc = { position: inFlow ? 'flow' : 'absolute', widthMode: 'fixed', heightMode: 'fixed' };
      var props = { geometry: { x: inFlow ? 0 : rel.x, y: inFlow ? 0 : rel.y, w: rel.w, h: rel.h, rotation: 0, flipH: false, flipV: false }, layoutChild: lc };
      var type = tool === 'rect' ? 'rect' : tool === 'ellipse' ? 'ellipse' : tool === 'text' ? 'text' : tool === 'image' ? 'image' : 'frame';
      var label = { frame: 'Cadre', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Texte', image: 'Image' }[type];
      props.name = label;
      var patches = [];
      if (type === 'frame') { props.fills = [M.solid('#FFFFFF')]; props.layoutParent = { mode: 'absolute', clip: false }; }
      if (type === 'rect' || type === 'ellipse') props.fills = [M.solid('#D9D9D9')];
      if (type === 'text') {
        var col = storeColor(ab, '--st-text');
        props.style = M.defaultTextStyle({ family: storeFont(ab, 'text'), size: 18, lineHeight: { unit: 'auto' }, fills: [{ type: 'solid', color: col, opacity: 1, blend: 'normal', visible: true }] });
        props.text = 'Votre texte';
        props.resize = sized ? 'autoHeight' : 'autoWidth';
        lc.widthMode = sized ? 'fixed' : 'hug';
        lc.heightMode = 'hug';
        props.semantic = { tag: 'p', attrs: {} };
      }
      if (type === 'image') {
        var photo = demoPhoto();
        var e = E.ed(sid);
        var aid = null;
        if (photo) {
          Object.keys(e.doc.assets).some(function (k) { if (e.doc.assets[k].src === 'demo:' + photo) { aid = k; return true; } return false; });
          if (!aid) {
            aid = 'a' + Date.now().toString(36);
            var info = S.R.photoInfo(photo);
            patches.push({ op: 'add', path: '/assets/' + aid, value: { url: info.src, src: 'demo:' + photo } });
          }
          props.asset = aid;
          props.alt = (S.R.photoInfo(photo) || {}).alt || '';
        } else { type = 'rect'; props.fills = [M.solid('#E9D8BD')]; }
        props.fit = 'fill';
      }
      var idx;
      if (inFlow) {
        // in a stack: where the pointer is, by the midpoint rule
        var l = lay(sid, ab), pb = l.world.get(parentId);
        var horiz = plp.direction === 'horizontal';
        idx = 0;
        (parent.children || []).forEach(function (c) { var b = l.world.get(c); if (!b) return; var mid = horiz ? b.x - pb.x + b.w / 2 : b.y - pb.y + b.h / 2; if (mid < (horiz ? rel.x : rel.y)) idx++; });
      }
      var made = E.createNode(sid, type, parentId, props, idx);
      if (!made) return null;
      E.apply(sid, patches.concat(made.patches), label + ' ajouté' + (type === 'image' ? 'e' : ''), { structure: true });
      S.setTool('select');
      selectNodes(sid, [made.node.id]);
      if (type === 'text') requestAnimationFrame(function () { requestAnimationFrame(function () { editText(sid, made.node.id, ab, true); }); });
      return made.node.id;
    }

    /* ================================================================ text edited in place */

    var editing = null;
    function editText(sid, id, ab, selectAll) {
      var n = E.node(sid, id);
      if (!n || n.type !== 'text') return false;
      ab = ab || activeAb();
      var el = nodeEl(ab, sid, id);
      if (!el) return false;
      finishEdit(true);
      editing = { sid: sid, id: id, el: el, orig: M.plainText(n.text) };
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.classList.add('st-eng-editing');
      el.spellcheck = false;
      el.focus();
      try { var r = document.createRange(); r.selectNodeContents(el); if (!selectAll) r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ok */ }
      el.addEventListener('keydown', onEditKey);
      el.addEventListener('blur', onEditBlur);
      el.addEventListener('paste', onEditPaste);
      return true;
    }
    function onEditKey(e) {
      e.stopPropagation();
      // Escape ends editing and KEEPS the text, as in Figma, Framer and Webflow (wave 2); Ctrl Z undoes it
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); }
    }
    function onEditBlur() { finishEdit(true); }
    function onEditPaste(e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      document.execCommand('insertText', false, t);
    }
    function finishEdit(apply) {
      var ed = editing;
      if (!ed) return;
      editing = null;
      ed.el.removeEventListener('keydown', onEditKey);
      ed.el.removeEventListener('blur', onEditBlur);
      ed.el.removeEventListener('paste', onEditPaste);
      ed.el.removeAttribute('contenteditable');
      ed.el.classList.remove('st-eng-editing');
      var v = String(ed.el.innerText || '').replace(/ /g, ' ').replace(/\n$/, '').slice(0, 8000);
      if (apply && v !== ed.orig) {
        var n = E.node(ed.sid, ed.id);
        // a text bound to a product (wave 1): the edit renames / reprices the product, everywhere
        if (n.bind && (n.bind.field === 'name' || n.bind.field === 'price') && S.productById(n.bind.product)) {
          var pid = n.bind.product, fld = n.bind.field;
          var price = fld === 'price' ? parseInt(String(v).replace(/[^0-9]/g, ''), 10) : null;
          if (fld === 'price' && !isFinite(price)) { toast('Prix non compris : des chiffres, en FCFA.', 'warn'); S.scheduleRender(); return; }
          S.commit(fld === 'name' ? 'Texte modifié (nom du produit)' : 'Prix modifié', function (cfg) {
            var pr = (cfg.products || []).filter(function (x) { return x.id === pid; })[0];
            if (pr) { if (fld === 'name') pr.name = v.replace(/\s+/g, ' ').trim().slice(0, 60); else pr.price = price; }
          });
          return;
        }
        // the first run's own look is kept for the whole text (rich runs are edited in the inspector)
        var st = n.text.paragraphs[0] && n.text.paragraphs[0].runs[0] && n.text.paragraphs[0].runs[0].style;
        E.apply(ed.sid, [{ op: 'replace', path: E.path(ed.id, 'text'), value: M.richText(v, st || undefined) }], 'Texte modifié');
      } else S.scheduleRender();
    }

    /* ================================================================ structure commands */

    function cmd(fn) { return function () { var c = current(); if (c) fn(c); }; }
    function deleteNodes(c) {
      if (c.root) return false;
      E.apply(c.sid, E.removePatches(c.sid, c.ids), c.ids.length > 1 ? 'Éléments supprimés' : 'Élément supprimé', { structure: true });
      selectNodes(c.sid, [E.rootId(c.sid)]);
      return true;
    }
    function group(c) {
      if (c.root) return;
      var g = E.groupPatches(c.sid, c.ids, lay(c.sid, activeAb()));
      if (!g) { toast('Groupez des éléments du même cadre.', 'warn'); return; }
      E.apply(c.sid, g.patches, 'Éléments groupés', { structure: true });
      selectNodes(c.sid, [g.id]);
    }
    function ungroup(c) {
      if (c.root || c.ids.length !== 1) return;
      var u = E.ungroupPatches(c.sid, c.ids[0], lay(c.sid, activeAb()));
      if (!u) { toast('Sélectionnez un cadre qui contient des éléments.', 'info'); return; }
      E.apply(c.sid, u.patches, 'Groupe dissocié', { structure: true });
      selectNodes(c.sid, u.ids);
    }
    function zorder(c, delta, extreme) {
      if (c.root) return;
      var n = E.node(c.sid, c.ids[0]);
      var p = E.node(c.sid, n.parent);
      var order = p.children.slice();
      var ids = c.ids.filter(function (id) { return E.node(c.sid, id).parent === p.id; }).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var rest = order.filter(function (x) { return ids.indexOf(x) === -1; });
      var at;
      if (extreme) at = delta > 0 ? rest.length : 0;
      else { var i0 = order.indexOf(ids[0]); at = clamp(i0 + delta, 0, rest.length); }
      var next = rest.slice(0, at).concat(ids).concat(rest.slice(at));
      if (JSON.stringify(next) === JSON.stringify(order)) return;
      E.apply(c.sid, [{ op: 'replace', path: E.path(p.id, 'children'), value: next }], delta > 0 ? (extreme ? 'Mis au premier plan' : 'Avancé d’un plan') : (extreme ? 'Mis à l’arrière-plan' : 'Reculé d’un plan'));
    }
    var clip = null;
    function copy(c, silent) {
      if (c.root) return false;
      var e = E.ed(c.sid);
      clip = { nodes: c.ids.map(function (id) { return E.subtreeIds(c.sid, id).map(function (x) { return clone(e.doc.nodes[x]); }); }), assets: clone(e.doc.assets) };
      if (!silent) toast(c.ids.length > 1 ? c.ids.length + ' éléments copiés.' : 'Élément copié.', 'info');
      return true;
    }
    function paste(c, offset) {
      if (!clip) return false;
      var sid = c.sid;
      var target = c.root ? E.rootId(sid) : (E.isContainer(E.node(sid, c.ids[0])) && !offset ? c.ids[0] : E.node(sid, c.ids[0]).parent);
      var e = E.ed(sid);
      var plp = E.value(sid, target, 'layoutParent', 'base');
      var patches = [], newIds = [];
      Object.keys(clip.assets || {}).forEach(function (k) { if (!e.doc.assets[k]) patches.push({ op: 'add', path: '/assets/' + k, value: clip.assets[k] }); });
      var at = E.node(sid, target).children.length;
      clip.nodes.forEach(function (list) {
        var map = {};
        list.forEach(function (n) { map[n.id] = E.newId(); });
        var copies = list.map(function (n0, i) {
          var n = clone(n0);
          n.id = map[n0.id];
          n.parent = i === 0 ? target : map[n0.parent];
          if (n.children) n.children = n.children.map(function (x) { return map[x]; });
          if (i === 0 && n.layoutChild.position === 'absolute' || (i === 0 && plp.mode === 'absolute')) { n.geometry.x += offset ? 10 : 0; n.geometry.y += offset ? 10 : 0; n.layoutChild.position = plp.mode === 'absolute' ? 'absolute' : n.layoutChild.position; }
          return n;
        });
        copies.forEach(function (n) { patches.push({ op: 'add', path: E.path(n.id), value: n }); });
        patches.push({ op: 'add', path: E.path(target, 'children/' + at), value: copies[0].id });
        at++;
        newIds.push(copies[0].id);
      });
      E.apply(sid, patches, offset ? 'Duplication' : 'Collage', { structure: true });
      selectNodes(sid, newIds);
      return true;
    }
    function duplicate(c) { if (c.root) return false; var keep = clip; var n = c.ids.length; copy(c, true); paste(c, true); clip = keep || clip; toast(n > 1 ? n + ' éléments dupliqués.' : 'Élément dupliqué.', 'info'); return true; }
    function autoLayout(c) {
      var id = c.ids.length === 1 ? c.ids[0] : null;
      var n = id ? E.node(c.sid, id) : null;
      if (c.ids.length > 1) {
        // several siblings: wrapped in a new stack (Figma's ⇧ A on a selection)
        var g = E.groupPatches(c.sid, c.ids, lay(c.sid, activeAb()));
        if (!g) { toast('Sélectionnez des éléments du même cadre.', 'warn'); return; }
        var e = E.ed(c.sid);
        var tmp = clone(e.doc);
        DE.history.applyPatch(tmp, g.patches);
        var l2 = new DE.layout.LayoutEngine(tmp, { measurer: DE.text.defaultMeasurer(), viewport: { width: abWidth(activeAb()), height: 900 }, nominalReference: true }).layout(abBp(activeAb()));
        var a = (function () { var save = e.doc; e.doc = tmp; try { return E.autoLayoutPatches(c.sid, g.id, l2); } finally { e.doc = save; } })();
        E.apply(c.sid, g.patches.concat(a ? a.patches : []), 'Auto Layout ajouté', { structure: true });
        selectNodes(c.sid, [g.id]);
        return;
      }
      if (!n || !E.isContainer(n)) { toast('Auto Layout : sélectionnez un cadre (ou plusieurs éléments).', 'info'); return; }
      var r = E.autoLayoutPatches(c.sid, id, lay(c.sid, activeAb()));
      if (!r) return;
      E.apply(c.sid, r.patches, r.mode === 'stack' ? 'Auto Layout ajouté' : 'Auto Layout retiré', { structure: true });
      toast(r.mode === 'stack' ? 'Auto Layout : les éléments se suivent (pile flex). ⇧ A pour revenir aux positions libres.' : 'Positions libres : chaque élément garde sa place.', 'info');
    }
    function nudge(c, dx, dy) {
      if (c.root) return false;
      var ab = activeAb(), bp = abBp(ab);
      var patches = [];
      var flowOnly = true;
      c.ids.forEach(function (id) {
        var n = E.node(c.sid, id);
        var plp = E.value(c.sid, n.parent, 'layoutParent', bp) || {};
        var abs = plp.mode === 'absolute' || (E.value(c.sid, id, 'layoutChild', bp) || {}).position === 'absolute';
        if (!abs) return;
        flowOnly = false;
        var g = E.value(c.sid, id, 'geometry', bp);
        var ng = { x: round(g.x + dx, 2), y: round(g.y + dy, 2) };
        patches = patches.concat(E.propPatches(c.sid, id, 'geometry', bp === 'base' ? Object.assign({}, g, ng) : ng, bp));
      });
      if (flowOnly) {
        // in a stack the arrows move the element along the flow (Figma)
        var n0 = E.node(c.sid, c.ids[0]);
        var plp0 = E.value(c.sid, n0.parent, 'layoutParent', bp) || {};
        var along = plp0.direction === 'horizontal' ? dx : dy;
        if (along) zorder(c, along > 0 ? 1 : -1, false);
        return true;
      }
      E.apply(c.sid, patches, 'Déplacement au clavier', { coalesce: 'nudge:' + c.ids.join(',') });
      return true;
    }

    /* ================================================================ align and distribute (Figma: Alt A D W S H V, Ctrl Alt H / V)
     * One node: aligned in its frame. Several: on the selection's bounding box. A node placed by an Auto
     * Layout (in a stack) is aligned by the stack: on the cross axis its own align-self, on the main axis
     * the stack's alignment. One transaction, at the breakpoint being edited. */
    var ALIGN_LABEL = { left: 'Aligné à gauche', hcenter: 'Centré horizontalement', right: 'Aligné à droite', top: 'Aligné en haut', vcenter: 'Centré verticalement', bottom: 'Aligné en bas' };
    function alignItems(c) {
      var ab = activeAb(), bp = editBp(), l = lay(c.sid, ab);
      if (!l) return null;
      return { ab: ab, bp: bp, l: l, list: c.ids.map(function (id) {
        var n = E.node(c.sid, id), wb = l.world.get(id), pw = n ? l.world.get(n.parent) : null;
        if (!n || !wb || !pw || n.locked) return null;
        var plp = E.value(c.sid, n.parent, 'layoutParent', bp) || { mode: 'absolute' };
        var abs = plp.mode === 'absolute' || (E.value(c.sid, id, 'layoutChild', bp) || {}).position === 'absolute';
        var lb = l.boxes.get(id) || { x: wb.x - pw.x, y: wb.y - pw.y, w: wb.w, h: wb.h };
        return { id: id, n: n, wb: wb, pw: pw, lb: lb, abs: abs, plp: plp };
      }).filter(Boolean) };
    }
    function geomPatch(sid, id, bp, g) {
      return E.propPatches(sid, id, 'geometry', bp === 'base' ? Object.assign({}, E.value(sid, id, 'geometry', 'base'), g) : g, bp);
    }
    function align(c, how) {
      c = c || current();
      if (!c || c.root || !ALIGN_LABEL[how]) return false;
      var A = alignItems(c);
      if (!A || !A.list.length) return false;
      var horizAxis = how === 'left' || how === 'hcenter' || how === 'right';
      var ref;
      if (A.list.length === 1) { var it0 = A.list[0]; ref = it0.pw; var pad = it0.abs ? null : (it0.plp.padding || null); if (pad) ref = { x: ref.x + (pad.left || 0), y: ref.y + (pad.top || 0), w: ref.w - (pad.left || 0) - (pad.right || 0), h: ref.h - (pad.top || 0) - (pad.bottom || 0) }; }
      else { var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; A.list.forEach(function (it) { x0 = Math.min(x0, it.wb.x); y0 = Math.min(y0, it.wb.y); x1 = Math.max(x1, it.wb.x + it.wb.w); y1 = Math.max(y1, it.wb.y + it.wb.h); }); ref = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
      var patches = [], stackDone = {}, flowNote = false;
      var pos = how === 'left' || how === 'top' ? 'start' : (how === 'right' || how === 'bottom' ? 'end' : 'center');
      A.list.forEach(function (it) {
        if (!it.abs) {
          var horizStack = it.plp.mode === 'stack' && it.plp.direction === 'horizontal';
          var cross = it.plp.mode === 'stack' && (horizStack ? !horizAxis : horizAxis);
          if (cross) {
            var lc = E.value(c.sid, it.id, 'layoutChild', A.bp) || {};
            patches = patches.concat(E.propPatches(c.sid, it.id, 'layoutChild', A.bp === 'base' ? Object.assign({}, lc, { alignSelf: pos }) : { alignSelf: pos }, A.bp));
          } else if (it.plp.mode === 'stack' && !stackDone[it.n.parent] && it.plp.gap !== 'auto') {
            stackDone[it.n.parent] = true;
            var lp = E.value(c.sid, it.n.parent, 'layoutParent', A.bp) || {};
            patches = patches.concat(E.propPatches(c.sid, it.n.parent, 'layoutParent', A.bp === 'base' ? Object.assign({}, lp, { alignMain: pos }) : { alignMain: pos }, A.bp));
            flowNote = true;
          }
          return;
        }
        var nx = it.wb.x, ny = it.wb.y;
        if (how === 'left') nx = ref.x; else if (how === 'right') nx = ref.x + ref.w - it.wb.w; else if (how === 'hcenter') nx = ref.x + (ref.w - it.wb.w) / 2;
        if (how === 'top') ny = ref.y; else if (how === 'bottom') ny = ref.y + ref.h - it.wb.h; else if (how === 'vcenter') ny = ref.y + (ref.h - it.wb.h) / 2;
        var g = {};
        if (horizAxis) g.x = round(it.lb.x + nx - it.wb.x, 2); else g.y = round(it.lb.y + ny - it.wb.y, 2);
        if (Math.abs((horizAxis ? nx - it.wb.x : ny - it.wb.y)) < 0.005) return;
        patches = patches.concat(geomPatch(c.sid, it.id, A.bp, g));
      });
      if (!patches.length) { toast('Déjà aligné.', 'info'); return true; }
      E.apply(c.sid, patches, ALIGN_LABEL[how]);
      if (flowNote) toast('Dans une pile, l’axe principal suit l’Auto Layout : c’est l’alignement de la pile qui change.', 'info');
      return true;
    }
    function distribute(c, axis) {
      c = c || current();
      if (!c || c.root) return false;
      var A = alignItems(c);
      var list = A ? A.list.filter(function (it) { return it.abs; }) : [];
      if (list.length < 3) { toast('Répartir : sélectionnez au moins 3 éléments à position libre' + (A && A.list.length > list.length ? ' (ceux d’une pile suivent son espacement).' : '.'), 'info'); return false; }
      var hz = axis !== 'v';
      list.sort(function (a, b) { return hz ? a.wb.x - b.wb.x : a.wb.y - b.wb.y; });
      var first = list[0], last = list[list.length - 1];
      var span = hz ? (last.wb.x + last.wb.w) - first.wb.x : (last.wb.y + last.wb.h) - first.wb.y;
      var sizes = list.reduce(function (s, it) { return s + (hz ? it.wb.w : it.wb.h); }, 0);
      var gap = (span - sizes) / (list.length - 1);
      var at = hz ? first.wb.x : first.wb.y, patches = [];
      list.forEach(function (it, i) {
        if (i > 0 && i < list.length - 1) {
          var d = at - (hz ? it.wb.x : it.wb.y);
          if (Math.abs(d) > 0.005) patches = patches.concat(geomPatch(c.sid, it.id, A.bp, hz ? { x: round(it.lb.x + d, 2) } : { y: round(it.lb.y + d, 2) }));
        }
        at += (hz ? it.wb.w : it.wb.h) + gap;
      });
      if (!patches.length) { toast('Déjà réparti.', 'info'); return true; }
      E.apply(c.sid, patches, hz ? 'Espacement horizontal réparti' : 'Espacement vertical réparti');
      return true;
    }

    /* Ranger / Tidy up (Ctrl Alt T, wave 2): the selected free nodes in a tidy grid — the rows and columns
     * they are roughly in, aligned, with one spacing (the average of the gaps they have, never negative),
     * from the top-left corner of the selection. A single row or column is spaced evenly. Like Figma. */
    function tidy(c) {
      c = c || current();
      if (!c || c.root) return false;
      var A = alignItems(c);
      var list = A ? A.list.filter(function (it) { return it.abs; }) : [];
      if (list.length < 2) { toast('Ranger : sélectionnez au moins 2 éléments à position libre.', 'info'); return false; }
      // rows: centres closer than half the smallest height belong to the same row
      var byY = list.slice().sort(function (a, b) { return (a.wb.y + a.wb.h / 2) - (b.wb.y + b.wb.h / 2); });
      var rows = [];
      byY.forEach(function (it) {
        var cy = it.wb.y + it.wb.h / 2, r = rows[rows.length - 1];
        if (r && Math.abs(cy - r.cy) <= Math.min(r.h, it.wb.h) / 2) { r.items.push(it); r.h = Math.max(r.h, it.wb.h); }
        else rows.push({ cy: cy, h: it.wb.h, items: [it] });
      });
      rows.forEach(function (r) { r.items.sort(function (a, b) { return a.wb.x - b.wb.x; }); });
      var cols = Math.max.apply(null, rows.map(function (r) { return r.items.length; }));
      var gapsX = [], gapsY = [];
      rows.forEach(function (r, ri) {
        r.items.forEach(function (it, i) { if (i) gapsX.push(it.wb.x - (r.items[i - 1].wb.x + r.items[i - 1].wb.w)); });
        if (ri) gapsY.push(Math.min.apply(null, r.items.map(function (it) { return it.wb.y; })) - Math.max.apply(null, rows[ri - 1].items.map(function (it) { return it.wb.y + it.wb.h; })));
      });
      var avg = function (a) { return a.length ? Math.max(0, Math.round(a.reduce(function (s, v) { return s + v; }, 0) / a.length)) : 0; };
      var gx = avg(gapsX), gy = rows.length > 1 ? avg(gapsY) : 0;
      if (rows.length === 1 && !gapsX.length) gx = 16;
      var colW = [];
      for (var ci = 0; ci < cols; ci++) colW[ci] = Math.max.apply(null, rows.map(function (r) { return r.items[ci] ? r.items[ci].wb.w : 0; }));
      var x0 = Math.min.apply(null, list.map(function (it) { return it.wb.x; }));
      var y = Math.min.apply(null, list.map(function (it) { return it.wb.y; }));
      var patches = [];
      rows.forEach(function (r) {
        var x = x0;
        r.items.forEach(function (it, i) {
          var dx = x - it.wb.x, dy = y - it.wb.y;
          if (Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005) patches = patches.concat(geomPatch(c.sid, it.id, A.bp, { x: Math.round(it.lb.x + dx), y: Math.round(it.lb.y + dy) }));
          x += colW[i] + gx;
        });
        y += r.h + gy;
      });
      if (!patches.length) { toast('Déjà rangé.', 'info'); return true; }
      E.apply(c.sid, patches, 'Éléments rangés');
      toast('Rangé : ' + rows.length + ' ligne' + (rows.length > 1 ? 's' : '') + ' × ' + cols + ' colonne' + (cols > 1 ? 's' : '') + ', espacement ' + gx + (rows.length > 1 ? ' × ' + gy : '') + ' px.', 'ok');
      return true;
    }

    /* ================================================================ crop mode of a detached photo (wave 1)
     * As the template photos (studio-design.js): double-click (or Entrée) on an image node → the whole photo
     * shows faded around its frame; drag it to place it, the wheel (or the slider) zooms 100–400 %, the ratios
     * reshape the frame; Entrée / Échap / a click outside leave. The model: fit 'crop' and crop { x, y, w, h,
     * fx, fy } — the visible window of the photo (w = 1 / zoom) and its focal point; css.js draws it with
     * object-position + a scale about the focal point clipped back to the box (the layout never moves). */
    var ncrop = null;
    var CROP_RATIOS = [['', 'Libre'], ['orig', 'Orig.'], [1, '1:1'], [0.8, '4:5'], [0.75, '3:4'], [1.7778, '16:9']];
    function cropOf(sid, id) {
      var n = E.node(sid, id), c = (n && n.crop) || {};
      var isNew = n && n.fit === 'crop' && typeof c.fx === 'number';
      var z = isNew && c.w > 0 ? 1 / c.w : 1;
      var fx = typeof c.fx === 'number' ? c.fx : (n && n.fit === 'crop' && c.w < 1 ? c.x / (1 - c.w) : 0.5);
      var fy = typeof c.fy === 'number' ? c.fy : (n && n.fit === 'crop' && c.h < 1 ? c.y / (1 - c.h) : 0.5);
      return { z: clamp(z, 1, 4), fx: clamp(fx, 0, 1), fy: clamp(fy, 0, 1) };
    }
    /* one transaction: fit 'crop' and the crop of { z, fx, fy } (co: a coalesce key for a gesture) */
    function setNodeCrop(sid, id, v, label, co) {
      var n = E.node(sid, id);
      if (!n || n.type !== 'image') return false;
      var w = round(1 / clamp(v.z, 1, 4), 4);
      var crop = { x: round(v.fx * (1 - w), 4), y: round(v.fy * (1 - w), 4), w: w, h: w, fx: round(clamp(v.fx, 0, 1), 4), fy: round(clamp(v.fy, 0, 1), 4) };
      var patches = [];
      if (n.fit !== 'crop') patches.push({ op: 'replace', path: E.path(id, 'fit'), value: 'crop' });
      patches.push({ op: n.crop ? 'replace' : 'add', path: E.path(id, 'crop'), value: crop });
      E.apply(sid, patches, label || 'Recadrage de l’image', { coalesce: co });
      return true;
    }
    function liveImgOf(c) { return nodeEl(c.ab, c.sid, c.id); }
    function cropGeomN(c) {
      var b = boxF(c.ab, c.sid, c.id), img = liveImgOf(c);
      if (!b || !img) return null;
      var tag = img.tagName === 'IMG' ? img : img.querySelector('img');
      var nw = tag && tag.naturalWidth || b.w, nh = tag && tag.naturalHeight || b.h;
      var sc = Math.max(b.w / nw, b.h / nh), dw = nw * sc, dh = nh * sc;
      var ox = (b.w - dw) * c.fx, oy = (b.h - dh) * c.fy, Ox = c.fx * b.w, Oy = c.fy * b.h;
      return { b: b, dw: dw, dh: dh, src: tag ? (tag.currentSrc || tag.src) : '', gx: b.x + Ox + c.z * (ox - Ox), gy: b.y + Oy + c.z * (oy - Oy), gw: dw * c.z, gh: dh * c.z };
    }
    /* the live preview on the photo itself, before the transaction (the same CSS as css.js) */
    function previewCrop(c) {
      var el = liveImgOf(c);
      if (!el) return;
      var tag = el.tagName === 'IMG' ? el : el.querySelector('img') || el;
      var zk = 1 - 1 / c.z, fx = c.fx * 100, fy = c.fy * 100;
      tag.style.objectFit = 'cover';
      tag.style.objectPosition = round(fx, 3) + '% ' + round(fy, 3) + '%';
      if (c.z > 1.0005) {
        tag.style.transformOrigin = round(fx, 3) + '% ' + round(fy, 3) + '%';
        tag.style.transform = 'scale(' + round(c.z, 4) + ')';
        tag.style.clipPath = 'inset(' + [fy * zk, (100 - fx) * zk, (100 - fy) * zk, fx * zk].map(function (v) { return round(v, 3) + '%'; }).join(' ') + ')';
      } else { tag.style.transform = ''; tag.style.clipPath = 'none'; }
      c.previewEl = tag;
    }
    function clearPreview(c) { var t = c && c.previewEl; if (t) { t.style.objectFit = ''; t.style.objectPosition = ''; t.style.transformOrigin = ''; t.style.transform = ''; t.style.clipPath = ''; } }
    function startNodeCrop(sid, id, ab) {
      var n = E.node(sid, id);
      if (!n || n.type !== 'image' || n.locked) return false;
      endNodeCrop(true);
      var v = cropOf(sid, id);
      ncrop = { sid: sid, id: id, ab: ab || activeAb(), z: v.z, fx: v.fx, fy: v.fy, dirty: false };
      document.body.classList.add('dz-cropping', 'st-eng-cropping');
      drawNodeCrop();
      toast('Recadrage : glissez la photo, molette pour zoomer, un format dans la barre. Entrée ou Échap pour terminer.', 'info');
      return true;
    }
    var cropTimer = null;
    function flushCrop(label) {
      if (cropTimer) { clearTimeout(cropTimer); cropTimer = null; }
      var c = ncrop;
      if (!c || !c.dirty) return;
      c.dirty = false;
      setNodeCrop(c.sid, c.id, c, label || 'Recadrage de l’image', 'ncrop:' + c.id);
      clearPreview(c);
    }
    function endNodeCrop(silent) {
      if (!ncrop) return false;
      flushCrop();
      var c = ncrop;
      ncrop = null;
      clearPreview(c);
      document.body.classList.remove('dz-cropping', 'st-eng-cropping');
      if (c.layer) c.layer.remove();
      if (c.bar) c.bar.remove();
      if (!silent) draw();
      return true;
    }
    function drawNodeCrop() {
      var c = ncrop;
      if (!c) return;
      if (!E.node(c.sid, c.id)) { endNodeCrop(true); return; }
      var a = S.abEls()[c.ab], f = abFrame(c.ab);
      var gm = cropGeomN(c);
      if (!a || !f || !gm) return;
      var k = frameScale(c.ab);
      if (!c.layer) {
        c.layer = ce('div', 'dz-crop st-eng-crop');
        c.layer.innerHTML = '<img class="dz-crop__ghost" alt=""><div class="dz-crop__frame"><i></i><i></i><i></i><i></i></div><div class="dz-crop__hit"></div>';
        a.appendChild(c.layer);
        var hit = c.layer.querySelector('.dz-crop__hit');
        hit.addEventListener('pointerdown', cropPanN);
        hit.addEventListener('wheel', function (e) {
          e.preventDefault(); e.stopPropagation();
          c.z = clamp(c.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 4);
          c.dirty = true;
          previewCrop(c); drawNodeCrop();
          if (cropTimer) clearTimeout(cropTimer);
          cropTimer = setTimeout(function () { flushCrop('Zoom de l’image'); }, 260);
        }, { passive: false });
        hit.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); endNodeCrop(); });
      }
      c.layer.style.setProperty('--k', String(k || 1));
      var ghost = c.layer.querySelector('.dz-crop__ghost');
      if (ghost.getAttribute('src') !== gm.src) ghost.setAttribute('src', gm.src);
      ghost.style.left = gm.gx + 'px'; ghost.style.top = gm.gy + 'px'; ghost.style.width = gm.gw + 'px'; ghost.style.height = gm.gh + 'px';
      var fr = c.layer.querySelector('.dz-crop__frame');
      fr.style.left = gm.b.x + 'px'; fr.style.top = gm.b.y + 'px'; fr.style.width = gm.b.w + 'px'; fr.style.height = gm.b.h + 'px';
      var hitEl = c.layer.querySelector('.dz-crop__hit');
      var ux = Math.min(gm.gx, gm.b.x), uy = Math.min(gm.gy, gm.b.y);
      hitEl.style.left = ux + 'px'; hitEl.style.top = uy + 'px';
      hitEl.style.width = (Math.max(gm.gx + gm.gw, gm.b.x + gm.b.w) - ux) + 'px';
      hitEl.style.height = (Math.max(gm.gy + gm.gh, gm.b.y + gm.b.h) - uy) + 'px';
      drawCropBarN(gm, k);
    }
    function drawCropBarN(gm, k) {
      var c = ncrop;
      if (!c.bar) {
        c.bar = ce('div', 'dz-cropbar st-eng-cropbar');
        c.bar.setAttribute('role', 'toolbar');
        c.bar.setAttribute('aria-label', 'Recadrage de la photo');
        c.bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        var zl = ce('label', 'dz-cropbar__z', '<span class="dz-cropbar__l"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5L8.5 7.5"/><rect x="2.5" y="8.5" width="5" height="5" rx="1"/></svg></span>');
        var range = ce('input');
        range.type = 'range'; range.min = '100'; range.max = '400'; range.step = '1';
        range.setAttribute('aria-label', 'Zoom (%)');
        range.addEventListener('input', function () { c.z = clamp(Number(range.value) / 100, 1, 4); c.dirty = true; previewCrop(c); drawNodeCrop(); });
        range.addEventListener('change', function () { flushCrop('Zoom de l’image'); });
        zl.appendChild(range);
        c.bar.appendChild(zl);
        c.range = range;
        var seg = ce('div', 'dz-seg dz-seg--txt dz-seg--ratio');
        CROP_RATIOS.forEach(function (r) {
          var b = ce('button', '', esc(r[1]));
          b.type = 'button';
          b.setAttribute('data-ratio', String(r[0]));
          b.addEventListener('click', function () { setRatio(r[0]); });
          seg.appendChild(b);
        });
        c.bar.appendChild(seg);
        var ok = ce('button', 'dz-cropbar__ok', 'Terminé');
        ok.type = 'button';
        ok.addEventListener('click', function () { endNodeCrop(); });
        c.bar.appendChild(ok);
        stage.appendChild(c.bar);
      }
      if (document.activeElement !== c.range) c.range.value = String(Math.round(c.z * 100));
      var p1 = toScreen(c.ab, gm.b.x + gm.b.w / 2, gm.b.y + gm.b.h);
      var sr = stage.getBoundingClientRect(), bw = c.bar.offsetWidth, bh = c.bar.offsetHeight;
      var y = p1.y + 12;
      if (y + bh > sr.height - 80) y = toScreen(c.ab, 0, gm.b.y).y - bh - 12;
      c.bar.style.left = clamp(p1.x - bw / 2, 8, sr.width - bw - 8) + 'px';
      c.bar.style.top = clamp(y, 8, sr.height - bh - 76) + 'px';
    }
    /* a format: the frame keeps its width, its height follows the ratio (at the breakpoint being edited) */
    function setRatio(r) {
      var c = ncrop;
      if (!c || r === '') return;
      var img = liveImgOf(c), tag = img && (img.tagName === 'IMG' ? img : img.querySelector('img'));
      var ratio = r === 'orig' ? (tag && tag.naturalWidth && tag.naturalHeight ? tag.naturalWidth / tag.naturalHeight : null) : r;
      if (!ratio) return;
      flushCrop();
      var bp = editBp(), b = boxF(c.ab, c.sid, c.id);
      if (!b) return;
      var h = round(b.w / ratio, 2);
      var lc = E.value(c.sid, c.id, 'layoutChild', bp) || {};
      var patches = [];
      if (lc.heightMode !== 'fixed') patches = patches.concat(E.propPatches(c.sid, c.id, 'layoutChild', bp === 'base' ? Object.assign({}, lc, { heightMode: 'fixed' }) : { heightMode: 'fixed' }, bp));
      patches = patches.concat(E.propPatches(c.sid, c.id, 'geometry', bp === 'base' ? Object.assign({}, E.value(c.sid, c.id, 'geometry', 'base'), { h: h }) : { h: h }, bp));
      E.apply(c.sid, patches, 'Format de l’image');
      requestAnimationFrame(drawNodeCrop);
    }
    function cropPanN(e) {
      var c = ncrop;
      if (!c || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      var gm0 = cropGeomN(c);
      if (!gm0) return;
      var k = frameScale(c.ab), x0 = e.clientX, y0 = e.clientY, f0 = { fx: c.fx, fy: c.fy }, raf = 0, last = e;
      c.layer.classList.add('is-drag');
      function at() {
        var dx = (last.clientX - x0) / k, dy = (last.clientY - y0) / k;
        var sx = gm0.b.w - c.z * gm0.dw, sy = gm0.b.h - c.z * gm0.dh;
        if (Math.abs(sx) > 0.5) c.fx = clamp(f0.fx + dx / sx, 0, 1);
        if (Math.abs(sy) > 0.5) c.fy = clamp(f0.fy + dy / sy, 0, 1);
        c.dirty = true;
        previewCrop(c); drawNodeCrop();
      }
      function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; at(); }); }
      function up() {
        window.removeEventListener('pointermove', mv, true);
        window.removeEventListener('pointerup', up, true);
        if (raf) { cancelAnimationFrame(raf); raf = 0; at(); }
        if (c.layer) c.layer.classList.remove('is-drag');
        flushCrop('Recadrage de l’image');
      }
      window.addEventListener('pointermove', mv, true);
      window.addEventListener('pointerup', up, true);
    }
    window.addEventListener('keydown', function (e) {
      if (!ncrop) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && !(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range'))) { e.preventDefault(); e.stopImmediatePropagation(); endNodeCrop(); }
    }, true);
    document.addEventListener('pointerdown', function (e) {
      if (!ncrop || !e.target.closest) return;
      if (e.target.closest('.st-eng-crop, .st-eng-cropbar, .st-right')) return;
      endNodeCrop();
    }, true);
    chain('afterRender', function () { if (ncrop) requestAnimationFrame(drawNodeCrop); });
    chain('viewChanged', function () { if (ncrop) drawNodeCrop(); });

    /* ================================================================ zoom on the selection (⇧ 2) up to 25 600 % */

    function zoomToNodes() {
      var c = current();
      if (!c || c.root) return false;
      var ab = activeAb();
      var u = null;
      c.ids.forEach(function (id) { var b = boxF(ab, c.sid, id); if (b) u = u ? { x0: Math.min(u.x0, b.x), y0: Math.min(u.y0, b.y), x1: Math.max(u.x1, b.x + b.w), y1: Math.max(u.y1, b.y + b.h) } : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }; });
      if (!u) return false;
      var f = abFrame(ab), a = S.abEls()[ab];
      var wx = a.offsetLeft + f.offsetLeft + u.x0, wy = a.offsetTop + f.offsetTop + u.y0;
      var ww = Math.max(1, u.x1 - u.x0), wh = Math.max(1, u.y1 - u.y0);
      var sr = stage.getBoundingClientRect(), st = state(), zr = S.zoomRange();
      var z = clamp(Math.min((sr.width - 160) / ww, (sr.height - 140) / wh), zr.min, zr.max);
      S.camera(function () {
        st.zoom = z;
        st.panX = (sr.width - ww * z) / 2 - wx * z;
        st.panY = (sr.height - wh * z) / 2 - wy * z;
        S.applyTransform();
      });
      return true;
    }

    /* ================================================================ events */

    function inStage(t) { return !!(t && t.closest && stage.contains(t) && !t.closest('.st-ftb, .st-pop, .st-selbar, .st-pinlayer, .st-coach, .st-pin, .dz-qbar, .dz-cropbar, .dz-crop, .dz-ov__rad')); }
    function panMode(e) { return e.button === 1 || state().tool === 'hand' || S.isSpaceHeld(); }

    document.addEventListener('pointerdown', function (e) {
      if (!inStage(e.target) || panMode(e)) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (editing && editing.el.contains(e.target)) return;
      if (editing) finishEdit(true);
      var t = e.target;
      // handles, rotation corners and guides of the overlay
      if (t.closest('.st-eng-h')) { if (startResize(e, t.closest('.st-eng-h').getAttribute('data-h'))) { capture(e); return; } }
      if (t.closest('.st-eng-rot')) { if (startRotate(e, t.closest('.st-eng-rot').getAttribute('data-rot'))) { capture(e); return; } }
      if (t.closest('.st-eng-guide')) { startGuideDrag(e, +t.closest('.st-eng-guide').getAttribute('data-guide')); return; }
      if (t === rulerX || t === rulerY) { startGuideFromRuler(e, t === rulerX ? 'y' : 'x'); return; }
      var tool = drawTool();
      if (tool && tool !== 'text') { if (startDraw(e, t)) { capture(e); return; } }
      var h = hitPoint(e);
      if (tool === 'text') {
        // the Text tool on an engine text edits it, on an empty spot of a section creates one
        if (h && E.node(h.sid, h.id).type === 'text') { stop(e); S.setTool('select'); selectNodes(h.sid, [h.id]); editText(h.sid, h.id, h.ab); return; }
        var sec = t.closest && t.closest('[data-section-id]');
        var spec = sec && !EN.isDetached(S.sectionById(sec.getAttribute('data-section-id'))) ? S.inlineSpecFor(t, sec) : null;
        if (spec) return; // a store text: the studio edits it in place
        if (startDraw(e, t)) { capture(e); return; }
        return;
      }
      if (state().tool !== 'select' || !h) return;
      S.setActiveAbFrom && S.setActiveAbFrom(t);
      if (h.ab && h.ab !== state().activeAb) { state().activeAb = h.ab; }
      var cur = current();
      var deep = e.ctrlKey || e.metaKey;
      var target = pickTarget(h, deep);
      // a press inside the selection's box drags the selection, even under another node (Figma)
      if (cur && cur.sid === h.sid && !cur.root && !deep && !e.shiftKey) {
        var pf = toFrame(h.ab, e.clientX, e.clientY);
        if (cur.ids.some(function (id) { var b = boxF(h.ab, cur.sid, id); return b && pf.x >= b.x && pf.x <= b.x + b.w && pf.y >= b.y && pf.y <= b.y + b.h; })) target = cur.ids[0];
      }
      if (e.shiftKey && cur && cur.sid === h.sid && target !== E.rootId(h.sid)) {
        stop(e);
        var ids = cur.root ? [] : cur.ids.slice();
        var at = ids.indexOf(target);
        if (at === -1) ids.push(target); else ids.splice(at, 1);
        selectNodes(h.sid, ids.length ? ids : [E.rootId(h.sid)]);
        eatClick();
        return;
      }
      if (target === E.rootId(h.sid)) {
        // the section itself: the studio's own section gestures (select, drag to reorder)
        if (!(cur && cur.sid === h.sid) || cur.root) return;
        stop(e); selectNodes(h.sid, [E.rootId(h.sid)]); eatClick(); return;
      }
      stop(e);
      var alreadySel = cur && cur.sid === h.sid && cur.ids.indexOf(target) !== -1;
      if (!alreadySel) selectNodes(h.sid, [target]);
      eatClick();
      if (startMove(e, h)) capture(e);
    }, true);
    function stop(e) { if (e.pointerType !== 'touch') e.stopPropagation(); }
    function capture(e) {
      stop(e);
      e.preventDefault();
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    }
    var moveRaf = 0, lastMove = null;
    function onMove(e) {
      if (!drag || (drag.pid !== undefined && e.pointerId !== drag.pid)) return;
      lastMove = e;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(function () {
        moveRaf = 0;
        var ev = lastMove;
        if (!drag || !ev) return;
        var t0 = performance.now();
        if (drag.kind === 'move') moveDrag(ev);
        else if (drag.kind === 'resize') resizeDrag(ev);
        else if (drag.kind === 'rotate') rotateDrag(ev);
        else if (drag.kind === 'draw') drawDrag(ev);
        else if (drag.kind === 'guide') guideDrag(ev);
        perf.push(performance.now() - t0);
        if (perf.length > 600) perf.shift();
        if (hooks.engineDragging && (drag.kind === 'move' || drag.kind === 'resize')) { try { hooks.engineDragging(); } catch (er) { /* module */ } }
      });
    }
    var perf = [];
    function onUp(e) {
      if (!drag || (drag.pid !== undefined && e.pointerId !== drag.pid)) return;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; if (lastMove) { var k = drag.kind; if (k === 'move') moveDrag(lastMove); else if (k === 'resize') resizeDrag(lastMove); else if (k === 'rotate') rotateDrag(lastMove); else if (k === 'draw') drawDrag(lastMove); else if (k === 'guide') guideDrag(lastMove); } }
      var d = drag, did = false;
      try {
        if (e.type === 'pointercancel') { if (d.els) d.els.forEach(function (el) { if (el) el.style.transform = ''; }); if (d.el) { d.el.style.transform = ''; d.el.style.width = ''; d.el.style.height = ''; } if (d.items) d.items.forEach(function (it) { if (it.el) { it.el.style.transform = ''; it.el.style.width = ''; it.el.style.height = ''; it.el.style.maxWidth = ''; } }); snapLines = []; insertLine = null; drawRect = null; }
        else if (d.kind === 'move') did = endMove(e);
        else if (d.kind === 'resize') did = endResize(e);
        else if (d.kind === 'rotate') did = endRotate(e);
        else if (d.kind === 'draw') did = endDraw(e);
        else if (d.kind === 'guide') did = endGuide(e);
      } finally {
        drag = null;
        lastMove = null;
        stage.classList.remove('st-eng-dragging');
        if (did || (d && d.moved)) eatClick();
        draw();
      }
    }

    /* guides: drag from a ruler, move, drag back onto a ruler to delete */
    function startGuideFromRuler(e, axis) {
      var ab = activeAb();
      var p = toFrame(ab, e.clientX, e.clientY);
      guides().push({ ab: ab, axis: axis, v: round(axis === 'x' ? p.x : p.y, 0) });
      drag = { kind: 'guide', gi: guides().length - 1, ab: ab, axis: axis, pid: e.pointerId, moved: true };
      capture(e);
    }
    function startGuideDrag(e, gi) {
      var g = guides()[gi];
      if (!g) return;
      drag = { kind: 'guide', gi: gi, ab: g.ab, axis: g.axis, pid: e.pointerId, moved: false };
      capture(e);
    }
    function guideDrag(e) {
      var d = drag, g = guides()[d.gi];
      if (!g) return;
      var p = toFrame(d.ab, e.clientX, e.clientY);
      g.v = round(d.axis === 'x' ? p.x : p.y, 0);
      d.moved = true;
      var sr = stage.getBoundingClientRect();
      d.remove = rulersOn() && (d.axis === 'x' ? e.clientX - sr.left < 20 : e.clientY - sr.top < 20);
      draw();
    }
    function endGuide() {
      var d = drag;
      if (d.remove) { guides().splice(d.gi, 1); toast('Guide retiré.', 'info'); }
      S.saveUI();
      return d.moved;
    }

    /* clicks inside a detached section never reach the studio's section selection */
    document.addEventListener('click', function (e) {
      if (!inStage(e.target)) return;
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
      if (DRAW_TOOLS[state().tool]) { e.stopPropagation(); e.preventDefault(); return; }
      var h = hit(e.target);
      if (h && state().tool === 'select') {
        var cur = current();
        if (cur && cur.sid === h.sid) { e.stopPropagation(); e.preventDefault(); }
      }
    }, true);
    document.addEventListener('dblclick', function (e) {
      if (!inStage(e.target) || state().tool !== 'select') return;
      // the selected photo (even under a scrim or a frame drawn over it): its crop mode
      var c0 = current();
      if (c0 && !c0.root && c0.ids.length === 1 && E.node(c0.sid, c0.ids[0]).type === 'image') {
        var ab0 = abOf(e.target) || activeAb(), b0 = boxF(ab0, c0.sid, c0.ids[0]);
        var pf = b0 ? toFrame(ab0, e.clientX, e.clientY) : null;
        if (pf && pf.x >= b0.x && pf.x <= b0.x + b0.w && pf.y >= b0.y && pf.y <= b0.y + b0.h) { e.stopPropagation(); e.preventDefault(); startNodeCrop(c0.sid, c0.ids[0], ab0); return; }
      }
      var h = hitPoint(e);
      if (!h) return;
      e.stopPropagation(); e.preventDefault();
      var n = E.node(h.sid, h.id);
      if (n.type === 'text') { selectNodes(h.sid, [h.id]); editText(h.sid, h.id, h.ab); return; }
      var cur0 = current();
      if (n.type === 'image' && cur0 && cur0.sid === h.sid && cur0.ids.indexOf(h.id) !== -1) { startNodeCrop(h.sid, h.id, h.ab); return; }
      var cur = current();
      var e2 = E.ed(h.sid);
      var chainIds = [h.id].concat(M.ancestors(e2.doc, h.id).map(function (a) { return a.id; })).reverse();
      var selId = cur && cur.sid === h.sid ? cur.ids[0] : chainIds[0];
      var at = chainIds.indexOf(selId);
      selectNodes(h.sid, [chainIds[Math.min(chainIds.length - 1, at + 1)]]);
    }, true);
    document.addEventListener('contextmenu', function (e) {
      if (!inStage(e.target)) return;
      var h = hitPoint(e);
      var cur = current();
      if (!h || !cur || cur.sid !== h.sid || cur.root) return;
      e.preventDefault(); e.stopPropagation();
      S.openCtx(e.clientX, e.clientY, menuItems(cur));
    }, true);
    function menuItems(c) {
      return [
        ['Copier', 'Ctrl C', function () { copy(c); }],
        ['Coller', 'Ctrl V', function () { paste(current() || c); }],
        ['Dupliquer', 'Ctrl D', function () { duplicate(c); }],
        null,
        ['Grouper', 'Ctrl G', function () { group(c); }],
        ['Dissocier', 'Ctrl ⇧ G', function () { ungroup(c); }],
        ['Auto Layout', '⇧ A', function () { autoLayout(c); }],
        null,
        ['Premier plan', 'Ctrl ⇧ ]', function () { zorder(c, 1, true); }],
        ['Avancer', 'Ctrl ]', function () { zorder(c, 1, false); }],
        ['Reculer', 'Ctrl [', function () { zorder(c, -1, false); }],
        ['Arrière-plan', 'Ctrl ⇧ [', function () { zorder(c, -1, true); }],
        null,
        ['Supprimer', 'Suppr', function () { deleteNodes(c); }]
      ];
    }

    /* hover: the engine node under the pointer */
    stage.addEventListener('pointermove', function (e) {
      if (drag || e.pointerType === 'touch') return;
      var h = state().tool === 'select' ? hitPoint(e) : null;
      var cur = current();
      var nid = null;
      if (h && cur && cur.sid === h.sid) nid = pickTarget(h, e.ctrlKey || e.metaKey);
      if (nid === E.rootId(h && h.sid)) nid = null;
      if (nid !== hoverId || (h && h.ab) !== hoverAb) { hoverId = nid; hoverSid = h ? h.sid : null; hoverAb = h ? h.ab : null; draw(); }
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { if (hoverId) { hoverId = null; draw(); } });

    /* the letter of a shortcut: the key when it is a plain letter (AZERTY, QWERTZ…), else the physical
     * key (Mac Option turns Alt A into « å »: e.code then says KeyA) */
    function letterOf(e) {
      var k = typeof e.key === 'string' ? e.key : '';
      if (/^[a-z]$/i.test(k)) return k.toLowerCase();
      var c = e.code || '';
      return /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase() : '';
    }
    var ALIGN_KEYS = { a: 'left', d: 'right', w: 'top', s: 'bottom', h: 'hcenter', v: 'vcenter' };
    var IS_MAC = /Mac|iPhone|iPad/.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''));
    /* Ctrl + arrows: the size by 1 px (10 with Maj) at the breakpoint being edited; a hug / fill size
     * becomes fixed on that axis */
    function resizeBy(c, dw, dh) {
      var bp = editBp(), ab = activeAb(), patches = [];
      c.ids.forEach(function (id) {
        var b = boxF(ab, c.sid, id);
        if (!b || E.node(c.sid, id).locked) return;
        var lc = E.value(c.sid, id, 'layoutChild', bp) || {}, g = {}, lcd = {};
        if (dw) { g.w = round(Math.max(1, b.w + dw), 2); if (lc.widthMode !== 'fixed') lcd.widthMode = 'fixed'; }
        if (dh) { g.h = round(Math.max(1, b.h + dh), 2); if (lc.heightMode !== 'fixed') lcd.heightMode = 'fixed'; }
        if (Object.keys(lcd).length) patches = patches.concat(E.propPatches(c.sid, id, 'layoutChild', bp === 'base' ? Object.assign({}, lc, lcd) : lcd, bp));
        patches = patches.concat(E.propPatches(c.sid, id, 'geometry', bp === 'base' ? Object.assign({}, E.value(c.sid, id, 'geometry', 'base'), g) : g, bp));
      });
      if (patches.length) E.apply(c.sid, patches, 'Redimensionné au clavier', { coalesce: 'kresize:' + c.ids.join(',') });
    }
    /* Ctrl Alt C / V on nodes: the look (fills, strokes, effects, corners, opacity, blend; a text's style)
     * of one node onto the selected ones — the effective values, not only the ones set by hand */
    var styleClip = null;
    var STYLE_PROPS = ['fills', 'strokes', 'effects', 'corners', 'opacity', 'blendMode'];
    function copyNodeStyle(c) {
      var id = c.ids[0], n = E.node(c.sid, id), bp = editBp();
      styleClip = { type: n.type, props: {} };
      STYLE_PROPS.forEach(function (p) { var v = E.value(c.sid, id, p, bp); if (v !== undefined) styleClip.props[p] = clone(v); });
      if (n.type === 'text') styleClip.text = clone(E.value(c.sid, id, 'style', bp));
      toast('Style copié — Ctrl Alt V pour le coller sur d’autres éléments.', 'info');
    }
    function pasteNodeStyle(c) {
      if (!styleClip) { toast('Copiez d’abord un style (Ctrl Alt C).', 'info'); return; }
      var bp = editBp(), patches = [];
      c.ids.forEach(function (id) {
        var n = E.node(c.sid, id);
        Object.keys(styleClip.props).forEach(function (p) {
          if (p === 'fills' && n.type === 'text') return;
          patches = patches.concat(E.propPatches(c.sid, id, p, clone(styleClip.props[p]), bp));
        });
        if (n.type === 'text' && styleClip.text) patches = patches.concat(E.propPatches(c.sid, id, 'style', clone(styleClip.text), bp));
      });
      if (patches.length) { E.apply(c.sid, patches, 'Style collé'); toast('Style collé.', 'ok'); }
    }
    function toggleVisible(c) {
      var hide = c.ids.some(function (id) { return E.value(c.sid, id, 'visible', 'base') !== false; });
      var patches = c.ids.map(function (id) { return { op: 'replace', path: E.path(id, 'visible'), value: !hide }; });
      E.apply(c.sid, patches, hide ? (c.ids.length > 1 ? 'Éléments masqués' : 'Élément masqué') : (c.ids.length > 1 ? 'Éléments affichés' : 'Élément affiché'), { structure: true });
      toast(hide ? 'Masqué (Ctrl ⇧ H pour afficher).' : 'Affiché.', 'info');
    }
    function toggleLocked(c) {
      var lock = c.ids.some(function (id) { return !E.node(c.sid, id).locked; });
      var patches = c.ids.map(function (id) { return { op: E.node(c.sid, id).locked === undefined ? 'add' : 'replace', path: E.path(id, 'locked'), value: lock }; });
      E.apply(c.sid, patches, lock ? 'Verrouillé' : 'Déverrouillé', { structure: true });
      toast(lock ? 'Verrouillé : il ne se déplace plus sur le canevas (Ctrl ⇧ L pour libérer).' : 'Déverrouillé.', 'info');
    }
    /* rename in the layers panel (its row turns into a field), like a double-click on the row */
    function renameNode(c) {
      var id = c.ids[0];
      function rowEl() { return document.querySelector('[data-eng-row="' + S.cssEsc(c.sid + '|' + id) + '"]'); }
      var r = rowEl();
      if (!r) { S.buildTree(); r = rowEl(); }
      if (!r) { toast('Renommer : ouvrez le panneau Calques.', 'info'); return; }
      if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
      r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }

    /* keys (before the studio's): the engine selection's shortcuts, the drawing tools, rulers, grids */
    function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
    window.addEventListener('keydown', function (e) {
      if (typing(e.target) || S.anyModalOpen()) return;
      // the colour picker (and the other popovers) close first on Échap
      if (e.key === 'Escape' && window.JeereColor && window.JeereColor.isOpen() && current()) { e.preventDefault(); e.stopImmediatePropagation(); window.JeereColor.close(); return; }
      var k = e.key || '', low = k.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      var c = current();
      function done() { e.preventDefault(); e.stopImmediatePropagation(); }
      // tools and canvas toggles
      if (!mod && !e.altKey) {
        if (!e.shiftKey && low === 'f') { done(); S.setTool(state().tool === 'frame' ? 'select' : 'frame'); return; }
        if (!e.shiftKey && low === 'r') { done(); S.setTool(state().tool === 'rect' ? 'select' : 'rect'); return; }
        if (!e.shiftKey && low === 'o') { done(); S.setTool(state().tool === 'ellipse' ? 'select' : 'ellipse'); return; }
        if (!e.shiftKey && low === 'i' && c) { done(); S.setTool(state().tool === 'image' ? 'select' : 'image'); return; }
        if (e.shiftKey && (low === 'r' || e.code === 'KeyR')) { done(); toggleRulers(); return; }
        if (e.shiftKey && (low === 'g' || e.code === 'KeyG')) { done(); toggleGrid(); return; }
        if (e.shiftKey && (e.code === 'Digit2' || e.code === 'Numpad2') && c && !c.root) { done(); zoomToNodes(); return; }
        if (e.shiftKey && (low === 'a' || e.code === 'KeyA') && c) { done(); autoLayout(c); return; }
      }
      if (mod && e.shiftKey && (k === "'" || k === '"' || e.code === 'Quote')) { done(); togglePixelGrid(); return; }
      if (mod && e.altKey && (low === 'b' || e.code === 'KeyB')) {
        var s0 = state().sel;
        if (s0 && s0.kind === 'section') { done(); if (EN.isDetached(S.sectionById(s0.id))) E.attach(s0.id); else E.detach(s0.id); }
        return;
      }
      if (k === 'Escape' && DRAW_TOOLS[state().tool]) { done(); S.setTool('select'); return; }
      if (!c) return;
      if (k === 'Escape' && !c.root) {
        done();
        var p = E.node(c.sid, c.ids[0]).parent;
        selectNodes(c.sid, [p || E.rootId(c.sid)]);
        return;
      }
      if (k === 'Enter' && !mod) {
        var n = E.node(c.sid, c.ids[0]);
        // Maj Entrée: the parent; Entrée: the children (a text: edit it), like Figma
        if (e.shiftKey) { if (!c.root) { done(); selectNodes(c.sid, [n.parent]); } return; }
        if (!c.root && n.type === 'text') { done(); editText(c.sid, n.id, activeAb(), true); return; }
        if (!c.root && n.type === 'image' && c.ids.length === 1) { done(); startNodeCrop(c.sid, n.id, activeAb()); return; }
        if (n.children && n.children.length) { done(); selectNodes(c.sid, c.root ? [n.children[0]] : n.children.slice()); return; }
        if (!c.root) { done(); toast('Cet élément n’a pas d’enfants. Maj Entrée : le parent.', 'info'); return; }
      }
      // Tab / Maj Tab: the next / previous sibling (in the layer order), Figma
      if (k === 'Tab' && !mod && !e.altKey && !c.root && !(e.target && e.target.closest && e.target.closest('button, a, [role="tab"], [role="treeitem"], .st-left, .st-right'))) {
        done();
        var n1 = E.node(c.sid, c.ids[c.ids.length - 1]), par = n1 && E.node(c.sid, n1.parent);
        if (!par || !par.children || !par.children.length) return;
        var at = par.children.indexOf(n1.id), len = par.children.length;
        selectNodes(c.sid, [par.children[((at + (e.shiftKey ? -1 : 1)) % len + len) % len]]);
        return;
      }
      if (!c.root) {
        var L = letterOf(e);
        // align (Alt A D W S H V) and distribute (Ctrl Alt H / V, or Alt Maj H / V)
        if (e.altKey && !mod && !e.shiftKey && ALIGN_KEYS[L]) { done(); align(c, ALIGN_KEYS[L]); return; }
        // Ctrl Alt T: Ranger (Figma's Tidy up), by e.code so AZERTY works too
        if (mod && e.altKey && !e.shiftKey && (L === 't' || e.code === 'KeyT')) { done(); tidy(c); return; }
        // Figma: Alt ⇧ H / V (Windows), Ctrl ⌥ H / V (Mac, the Control key); Ctrl Alt H too. On Windows Ctrl Alt V
        // stays « coller le style » (Figma's paste properties), on a Mac that is ⌘ ⌥ V
        var macCtrl = IS_MAC && e.ctrlKey && !e.metaKey;
        if (e.altKey && ((mod && !e.shiftKey && (L === 'h' || macCtrl)) || (!mod && e.shiftKey)) && (L === 'h' || L === 'v')) { done(); distribute(c, L); return; }
        // show / hide, lock, rename
        if (mod && e.shiftKey && !e.altKey && L === 'h') { done(); toggleVisible(c); return; }
        if (mod && e.shiftKey && !e.altKey && L === 'l') { done(); toggleLocked(c); return; }
        if ((mod && !e.shiftKey && !e.altKey && L === 'r') || (k === 'F2' && !mod)) { done(); renameNode(c); return; }
      }
      if (c.root) {
        if (mod && low === 'g') { done(); toast('Sélectionnez des éléments de la section pour les grouper (double-clic pour entrer).', 'info'); }
        return;
      }
      if (k === 'Delete' || k === 'Backspace') { done(); deleteNodes(c); return; }
      if (mod && !e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) {
        // Ctrl + arrows resize (Maj: 10 px), like Figma
        done();
        var rs = e.shiftKey ? 10 : 1;
        resizeBy(c, k === 'ArrowLeft' ? -rs : k === 'ArrowRight' ? rs : 0, k === 'ArrowUp' ? -rs : k === 'ArrowDown' ? rs : 0);
        return;
      }
      if (!mod && e.shiftKey && !e.altKey && (L === 'h' || L === 'v') && !(e.target && e.target.closest && e.target.closest('button, a, [role="tab"]'))) {
        // Maj H / Maj V: flip horizontally / vertically
        done();
        var fk = L === 'h' ? 'flipH' : 'flipV', bpf = editBp(), pf = [];
        c.ids.forEach(function (id) { var g = E.value(c.sid, id, 'geometry', bpf) || {}; var o = {}; o[fk] = !g[fk]; pf = pf.concat(E.propPatches(c.sid, id, 'geometry', bpf === 'base' ? Object.assign({}, E.value(c.sid, id, 'geometry', 'base'), o) : o, bpf)); });
        E.apply(c.sid, pf, L === 'h' ? 'Miroir horizontal' : 'Miroir vertical');
        return;
      }
      if (mod && e.altKey && !e.shiftKey && (L === 'c' || L === 'v')) { done(); if (L === 'c') copyNodeStyle(c); else pasteNodeStyle(c); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        done();
        var st = e.shiftKey ? 10 : 1;
        nudge(c, k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0);
        return;
      }
      if (mod && low === 'g') { done(); if (e.shiftKey) ungroup(c); else group(c); return; }
      if (mod && (k === ']' || k === '}' || e.code === 'BracketRight')) { done(); zorder(c, 1, e.shiftKey); return; }
      if (mod && (k === '[' || k === '{' || e.code === 'BracketLeft')) { done(); zorder(c, -1, e.shiftKey); return; }
      if (mod && low === 'c' && !e.shiftKey && !e.altKey) { done(); copy(c); return; }
      if (mod && low === 'x') { done(); if (copy(c)) deleteNodes(c); return; }
      if (mod && low === 'v' && !e.altKey) { done(); paste(c, false); return; }
      if (mod && low === 'd') { done(); duplicate(c); return; }
      if (mod && low === 'a') { done(); var p2 = E.node(c.sid, E.node(c.sid, c.ids[0]).parent); selectNodes(c.sid, p2.children.slice()); return; }
    }, true);
    // paste into a detached section selected as a whole
    window.addEventListener('keydown', function (e) {
      if (typing(e.target) || S.anyModalOpen() || !(e.ctrlKey || e.metaKey) || (e.key || '').toLowerCase() !== 'v' || !clip) return;
      var c = current();
      if (c && c.root) { e.preventDefault(); e.stopImmediatePropagation(); paste(c, false); }
    }, true);

    /* the floating toolbar: Cadre (F), Rectangle (R), Ellipse (O) next to Section / Texte / Image */
    function addToolButtons() {
      var ftb = $('ftb'), anchor = $('ftbSection');
      if (!ftb || !anchor || ftb.querySelector('[data-tool="frame"]')) return;
      var defs = [
        ['frame', 'Cadre', 'F', 'Dessiner un cadre libre (détache la section)', '<path d="M22 6H2M22 18H2M6 2v20M18 2v20"/>'],
        ['rect', 'Rectangle', 'R', 'Dessiner un rectangle', '<rect width="18" height="18" x="3" y="3" rx="2.5"/>'],
        ['ellipse', 'Ellipse', 'O', 'Dessiner une ellipse', '<circle cx="12" cy="12" r="9"/>']
      ];
      var after = anchor;
      defs.forEach(function (d) {
        var b = ce('button', 'st-ftb__btn st-eng-tool');
        b.type = 'button';
        b.setAttribute('data-tool', d[0]);
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', d[1]);
        b.setAttribute('data-tip', d[1]);
        b.setAttribute('data-kbd', d[2]);
        b.setAttribute('data-sub', d[3]);
        b.innerHTML = '<svg class="st-ico" viewBox="0 0 24 24" aria-hidden="true">' + d[4] + '</svg>';
        b.addEventListener('click', function () { S.setTool(state().tool === d[0] ? 'select' : d[0]); });
        after.parentNode.insertBefore(b, after.nextSibling);
        after = b;
      });
      // the Image button draws an image node when the selection is in a detached section
      var img = $('ftbImage');
      if (img) img.addEventListener('click', function (e) {
        if (!current()) return;
        e.stopImmediatePropagation(); e.preventDefault();
        S.setTool(state().tool === 'image' ? 'select' : 'image');
      }, true);
    }
    addToolButtons();
    // like Figma, picking something in the layers panel or the inspector puts the Move tool back
    document.addEventListener('pointerdown', function (e) {
      if (DRAW_TOOLS[state().tool] && e.target && e.target.closest && e.target.closest('.st-left, .st-right')) S.setTool('select');
    }, true);
    document.addEventListener('keydown', function (e) {
      if (DRAW_TOOLS[state().tool] && e.key === 'F2') S.setTool('select');
    }, true);
    chain('toolChanged', function (t) {
      stage.classList.toggle('st-eng-drawing', !!DRAW_TOOLS[t]);
      if (DRAW_TOOLS[t]) S.hintOnce('eng-tool-' + t, ({ frame: 'Cadre', rect: 'Rectangle', ellipse: 'Ellipse', image: 'Image' })[t] + ' : glissez dans une section pour dessiner (un clic = taille par défaut). Les sections du modèle sont d’abord détachées ; Échap pour revenir.', 30000);
      var img = $('ftbImage');
      if (img) { img.classList.toggle('is-on', t === 'image'); img.setAttribute('aria-pressed', String(t === 'image')); }
    });

    /* redraw with the view, the renders, the selection */
    chain('viewChanged', function () { draw(); });
    chain('afterDecor', function () { draw(); drawLayoutGrid(); });
    chain('afterRender', function () { if (editing && !document.contains(editing.el)) editing = null; draw(); drawLayoutGrid(); });
    chain('afterChange', function () { draw(); });
    // 1 … 9, 0 (studio.js): the opacity of the selected nodes, at the breakpoint being edited
    chain('selectionOpacity', function (pct) {
      var c = current();
      if (!c) return undefined;
      var bp = editBp(), patches = [];
      c.ids.forEach(function (id) { patches = patches.concat(E.propPatches(c.sid, id, 'opacity', round(pct / 100, 3), bp)); });
      if (patches.length) E.apply(c.sid, patches, 'Opacité ' + pct + ' %', { coalesce: 'digit-op:' + c.ids.join(',') });
      return true;
    });
    // leaving the Studio: a text being edited on the canvas is committed first
    chain('flushPending', function () { if (editing) finishEdit(true); });
    chain('inspectorBuilt', function () { var s = state().sel; if (s && (s.kind === 'engine' || s.kind === 'section') && s.id && E.isDetached(s.id)) { var a = activeAb(); if (!cv.bp && a) { /* follows the artboard */ } } draw(); });
    window.addEventListener('resize', draw);
    markBps();
    draw();

    window.JeereStudioCanvas = {
      current: current, selectNodes: selectNodes, hit: hit, editBp: editBp, setEditBp: setEditBp, abBp: abBp, activeAb: activeAb,
      boxF: boxF, previewBox: previewBox, dragPreview: dragPreview, nodeEl: nodeEl, secEl: secEl, toScreen: toScreen, layout: lay,
      create: create, editText: editText, finishEdit: finishEdit, isEditing: function () { return !!editing; },
      align: align, distribute: distribute, resizeBy: resizeBy, copyNodeStyle: copyNodeStyle, pasteNodeStyle: pasteNodeStyle, startNodeCrop: startNodeCrop, endNodeCrop: endNodeCrop, setNodeCrop: setNodeCrop, cropOf: cropOf, isCropping: function () { return !!ncrop; }, toggleVisible: toggleVisible, toggleLocked: toggleLocked, renameNode: renameNode,
      deleteNodes: deleteNodes, group: group, ungroup: ungroup, zorder: zorder, copy: copy, paste: paste, duplicate: duplicate, autoLayout: autoLayout, nudge: nudge,
      zoomToNodes: zoomToNodes, toggleRulers: toggleRulers, toggleGrid: toggleGrid, togglePixelGrid: togglePixelGrid, guides: guides,
      perf: function () { return perf.slice(); }, resetPerf: function () { perf.length = 0; }, isDragging: function () { return !!drag; },
      menuItems: menuItems, draw: drawNow
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
