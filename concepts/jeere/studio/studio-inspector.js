/* Jeere Studio — studio-inspector.js: the inspector of the DualEngine nodes (SPEC-DUALENGINE module 3),
 * their layers, the « Détacher » / « Rattacher » actions and the generated code.
 *
 * When a detached section or one of its nodes is selected, the Réglages panel shows the engine's
 * properties (studio.js hooks.customInspector), in the controls and the dark chrome of the Design tab
 * (studio-design.css: groups, 24 px fields, segments, the jcolor.js picker):
 *   breakpoint (Ordinateur / Tablette / Téléphone: an edit on a narrower one is an exact override, blue
 *   marker, click to go back to the wider value) · position (X, Y, rotation, in the flow or absolute,
 *   constraints) · size (fixed / hug / fill, min / max) · Auto Layout (free / stack / grid, direction,
 *   gap or Auto, padding, 3 × 3 alignment, wrap, columns, clip) · appearance (opacity, radius per
 *   corner, smoothing) · fills (solid, linear / radial gradients, image) · stroke · effects (drop /
 *   inner shadows, layer and background blur) · typography · image · web (tag, link) · CSS.
 * Every edit is one engine transaction (scrubs coalesced), on the Studio's single undo stack.
 * When an element of a section that is NOT detached is selected, nothing changes: elementStyles and the
 * Design tab as before.
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    var E = window.JeereStudioEngine, C = window.JeereStudioCanvas;
    if (!S || !E || !C) return;
    var EN = E.EN, DE = E.DE, M = DE.model;
    var hooks = S.hooks, ce = S.ce, esc = S.esc, toast = S.toast, clone = S.clone, clamp = S.clamp, round = E.round;
    function state() { return S.state(); }
    function $(id) { return document.getElementById(id); }
    function chain(n, f) { E.chain(n, f); }

    /* ================================================================ colours */

    function h2(v) { var s = Math.round(clamp(v, 0, 1) * 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
    function toHex(c) { return c ? '#' + h2(c.r) + h2(c.g) + h2(c.b) + (c.a >= 0.999 ? '' : h2(c.a)) : null; }
    function fromHex(v) {
      var m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(v || ''));
      if (!m) { var p = window.JeereElStyles && window.JeereElStyles.color.parse(v); return p ? { r: p.r / 255, g: p.g / 255, b: p.b / 255, a: p.a == null ? 1 : p.a } : null; }
      return { r: parseInt(m[1].slice(0, 2), 16) / 255, g: parseInt(m[1].slice(2, 4), 16) / 255, b: parseInt(m[1].slice(4, 6), 16) / 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    }
    function cssColor(c) { return c ? 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + round(c.a, 3) + ')' : 'transparent'; }
    function paintCss(p) {
      if (!p) return 'transparent';
      if (p.type === 'solid') return cssColor(p.color);
      if (p.stops) return 'linear-gradient(90deg,' + p.stops.map(function (s) { return cssColor(s.color) + ' ' + round(s.position * 100, 1) + '%'; }).join(',') + ')';
      if (p.type === 'image') return '#8a8a8a';
      return 'transparent';
    }
    /* a gradient of the jcolor picker ↔ an engine paint (handles in the box's normalised space, §3.3) */
    function linearPaint(angle, stops, w, h) {
      var t = angle * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t);
      w = w || 1; h = h || 1;
      var L = Math.abs(w * ux) + Math.abs(h * uy);
      return { type: 'linear', opacity: 1, blend: 'normal', visible: true,
        start: { x: round((w / 2 - ux * L / 2) / w, 4), y: round((h / 2 - uy * L / 2) / h, 4) },
        end: { x: round((w / 2 + ux * L / 2) / w, 4), y: round((h / 2 + uy * L / 2) / h, 4) }, stops: stops };
    }
    function gradOf(p, w, h) {
      if (!p || !p.stops) return null;
      var st = p.start || { x: 0, y: 0.5 }, en = p.end || { x: 1, y: 0.5 };
      var ang = p.type === 'radial' ? 180 : Math.round(((Math.atan2((en.x - st.x) * (w || 1), -(en.y - st.y) * (h || 1)) * 180 / Math.PI) + 360) % 360);
      return { type: p.type === 'radial' ? 'radial' : 'linear', angle: ang, stops: p.stops.map(function (s) { return { c: toHex(s.color), p: round(s.position * 100, 1) }; }) };
    }
    function paintFromGrad(g, w, h) {
      var stops = (g.stops || []).map(function (s) { return { position: clamp(s.p / 100, 0, 1), color: fromHex(s.c) || { r: 0, g: 0, b: 0, a: 1 } }; });
      if (g.type === 'radial') return { type: 'radial', opacity: 1, blend: 'normal', visible: true, start: { x: 0.5, y: 0.5 }, end: { x: 1, y: 0.5 }, radius: { x: 0.5, y: 0.5 }, stops: stops };
      return linearPaint(g.angle == null ? 180 : g.angle, stops, w, h);
    }
    var picker = false;
    function openPicker(anchor, value, onSet, title, grad) {
      var JC = window.JeereColor;
      if (!JC) return;
      JC.close();
      picker = true;
      JC.open({
        anchor: anchor, title: title || 'Couleur', theme: (window.JeereStudioTheme && window.JeereStudioTheme.get()) || 'light', value: value || '#000000',
        palette: [['--st-accent', 'Accent'], ['--st-text', 'Texte'], ['--st-bg', 'Fond'], ['--st-surface', 'Surface'], ['--st-muted', 'Atténué']].map(function (t) {
          var r = S.roots()[S.primaryKey()], c = r ? E.parseColor(getComputedStyle(r).getPropertyValue(t[0]).trim()) : null;
          return c ? { v: toHex(c), label: t[1] } : null;
        }).filter(Boolean),
        recents: Array.isArray(S.ui().recentColors) ? S.ui().recentColors.filter(function (v) { return /^#/.test(v); }) : [],
        onChange: function (v, live) { onSet(v, live); },
        allowGradient: !!grad, gradient: grad ? grad.get() : null, mode: grad && grad.get() ? 'gradient' : 'solid',
        onGradient: grad ? function (g, live) { grad.set(g, live); } : null,
        place: function (el) {
          var ar = anchor.getBoundingClientRect(), right = document.querySelector('.st-right');
          var rr = right ? right.getBoundingClientRect() : { left: window.innerWidth - 280 };
          el.style.left = Math.max(8, rr.left - el.offsetWidth - 8) + 'px';
          el.style.top = Math.max(56, Math.min(window.innerHeight - el.offsetHeight - 8, ar.top - 40)) + 'px';
        },
        onClose: function () { picker = false; }
      });
    }

    /* ================================================================ the selection being inspected */

    function target() {
      var c = C.current();
      if (!c) return null;
      var n = E.node(c.sid, c.ids[0]);
      return n ? { sid: c.sid, ids: c.ids, id: c.ids[0], n: n, root: c.root, bp: C.editBp() } : null;
    }
    function val(t, prop) { return E.value(t.sid, t.id, prop, t.bp); }
    function write(t, prop, value, label, co) {
      var patches = [];
      t.ids.forEach(function (id) {
        var v = value;
        if (typeof value === 'function') v = value(E.value(t.sid, id, prop, t.bp), id);
        if (v === undefined) return;
        patches = patches.concat(E.propPatches(t.sid, id, prop, v, t.bp));
      });
      if (patches.length) E.apply(t.sid, patches, label || 'Propriété modifiée', { coalesce: co ? co + ':' + t.ids.join(',') + ':' + t.bp : undefined });
    }
    /* one key of an object property (geometry.x, layoutParent.gap…) at the breakpoint being edited */
    function writeKey(t, prop, key, v, label, co) {
      write(t, prop, function (cur) {
        if (t.bp === 'base') { var o = clone(cur || {}); o[key] = v; return o; }
        var d = {}; d[key] = v; return d;
      }, label, co);
    }
    function isOver(t, prop, key) {
      if (t.bp === 'base') return false;
      var o = t.n.overrides && t.n.overrides[t.bp];
      var k = prop === 'style' ? 'text' : prop;
      if (!o || o[k] === undefined) return false;
      return key ? (o[k] && typeof o[k] === 'object' && o[k][key] !== undefined) : true;
    }
    function resetOver(t, prop, key) {
      var k = prop === 'style' ? 'text' : prop;
      var patches = [];
      t.ids.forEach(function (id) {
        var n = E.node(t.sid, id), o = n.overrides && n.overrides[t.bp];
        if (!o || o[k] === undefined) return;
        if (key && o[k] && typeof o[k] === 'object') {
          if (o[k][key] === undefined) return;
          if (Object.keys(o[k]).length === 1) patches.push({ op: 'remove', path: E.path(id, 'overrides/' + t.bp + '/' + k) });
          else patches.push({ op: 'remove', path: E.path(id, 'overrides/' + t.bp + '/' + k + '/' + key) });
        } else patches.push({ op: 'remove', path: E.path(id, 'overrides/' + t.bp + '/' + k) });
      });
      if (patches.length) { E.apply(t.sid, patches, 'Retour à la valeur ' + (t.bp === 'phone' ? 'de la tablette' : 'de l’ordinateur')); toast('Valeur ' + (t.bp === 'phone' ? 'de la tablette' : 'de l’ordinateur') + ' rétablie.', 'info'); }
    }

    /* ================================================================ controls (the Design tab's look) */

    var updaters = [];
    function reg(f) { updaters.push(f); return f; }
    /* several nodes selected: a control reads every one of them (its getter is evaluated with the target
     * pointing at each node in turn) and says « Mixte » when they differ; its setter writes them all */
    var curT = null;
    function mixedOf(get) {
      var t = curT;
      if (!t || !t.ids || t.ids.length < 2) return { mixed: false };
      var keepId = t.id, keepN = t.n, first, mixed = false;
      try {
        t.ids.forEach(function (id, i) {
          var n = E.node(t.sid, id);
          if (!n) return;
          t.id = id; t.n = n;
          var v;
          try { v = get(); } catch (e) { v = undefined; }
          var k = JSON.stringify(v === undefined ? null : v);
          if (i === 0) first = k; else if (k !== first) mixed = true;
        });
      } finally { t.id = keepId; t.n = keepN; }
      return { mixed: mixed };
    }
    function refresh() { updaters.forEach(function (f) { try { f(); } catch (e) { /* stale */ } }); }
    function parseNum(s) { var p = window.JeereStudioDesign && window.JeereStudioDesign.parseExpr; var v = p ? p(s) : parseFloat(String(s).replace(',', '.')); return v === null || !isFinite(v) ? null : v; }
    function fmt(v) { return v === null || v === undefined || v === '' ? '' : String(round(Number(v), 2)).replace('.', ','); }

    /* o: { letter, title, get(), set(v, live), min, max, step, over(), reset(), disabled() } */
    function num(o) {
      var w = ce('label', 'st-eng-num');
      var l = ce('span', '', esc(o.letter || ''));
      var inp = ce('input');
      inp.type = 'text'; inp.inputMode = 'decimal'; inp.spellcheck = false;
      inp.setAttribute('aria-label', o.title || o.letter || 'Valeur');
      if (o.title) w.setAttribute('data-tip', o.title);
      w.appendChild(l); w.appendChild(inp);
      var lock = null;
      if (o.over) {
        lock = ce('button', 'st-eng-lock');
        lock.type = 'button';
        lock.setAttribute('data-tip', 'Valeur propre à cet écran — clic : revenir à la valeur plus large');
        lock.setAttribute('aria-label', 'Revenir à la valeur plus large');
        lock.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (o.reset) o.reset(); });
        w.appendChild(lock);
      }
      function set(v, live) { if (v === null) return; v = clamp(v, o.min == null ? -1e6 : o.min, o.max == null ? 1e6 : o.max); o.set(round(v, 2), live); }
      var before = '';
      inp.addEventListener('focus', function () { before = inp.value; setTimeout(function () { try { inp.select(); } catch (e) { /* ok */ } }, 0); });
      function commit() { if (inp.value === before) return; var v = parseNum(inp.value); if (v === null) { inp.value = before; return; } set(v, false); before = inp.value; }
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); inp.value = before; inp.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var cur = parseNum(inp.value); if (cur === null) cur = o.get() || 0;
          var st = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (o.step || 1);
          set(cur + (e.key === 'ArrowUp' ? st : -st), true);
          inp.value = fmt(o.get()); before = inp.value;
        }
      });
      inp.addEventListener('blur', commit);
      // scrub on the letter: 1 per px, Maj × 10, Alt × 0,1 (§3)
      l.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || (o.disabled && o.disabled())) return;
        e.preventDefault();
        var v = Number(o.get()) || 0, lastX = e.clientX, raf = 0, pend = null;
        try { l.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
        function mv(ev) {
          var dx = ev.clientX - lastX; lastX = ev.clientX;
          v += dx * (o.step || 1) * (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1);
          pend = v;
          if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (pend !== null) { set(pend, true); pend = null; } });
        }
        function up() { l.removeEventListener('pointermove', mv); l.removeEventListener('pointerup', up); l.removeEventListener('pointercancel', up); }
        l.addEventListener('pointermove', mv); l.addEventListener('pointerup', up); l.addEventListener('pointercancel', up);
      });
      reg(function () {
        var dis = !!(o.disabled && o.disabled());
        inp.disabled = dis;
        var mx = mixedOf(o.get).mixed;
        w.classList.toggle('is-mixed', mx);
        inp.placeholder = mx ? 'Mixte' : '';
        if (document.activeElement !== inp) { var v = o.get(); inp.value = mx || v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : fmt(v); before = inp.value; }
        var ov = !!(o.over && o.over());
        w.classList.toggle('is-over', ov);
        if (lock) lock.hidden = !ov;
      });
      return w;
    }
    function seg(o) {
      var box = ce('div', 'st-eng-seg');
      box.setAttribute('role', 'group');
      if (o.title) box.setAttribute('aria-label', o.title);
      var btns = o.options.map(function (op) {
        var b = ce('button', '', op.html || esc(op.label));
        b.type = 'button';
        if (op.tip) b.setAttribute('data-tip', op.tip);
        b.setAttribute('data-v', String(op.v));
        b.addEventListener('click', function (e) { e.preventDefault(); o.set(op.v); });
        box.appendChild(b);
        return b;
      });
      reg(function () {
        var cur = o.get();
        var mx = mixedOf(o.get).mixed;
        box.classList.toggle('is-mixed', mx);
        if (mx) cur = { mixed: true };
        btns.forEach(function (b, i) { var on = o.options[i].v === cur; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-over', on && !!(o.over && o.over())); });
      });
      return box;
    }
    function sel(o) {
      var s = ce('select', 'st-eng-select');
      if (o.title) s.setAttribute('aria-label', o.title);
      o.options.forEach(function (op) { var x = ce('option'); x.value = String(op.v); x.textContent = op.label; s.appendChild(x); });
      s.addEventListener('change', function () { o.set(o.numeric ? Number(s.value) : s.value); });
      s.addEventListener('keydown', function (e) { e.stopPropagation(); });
      var mixOpt = null;
      reg(function () {
        var mx = mixedOf(o.get).mixed;
        if (mx && !mixOpt) { mixOpt = ce('option'); mixOpt.value = '__mixed'; mixOpt.textContent = 'Mixte'; mixOpt.disabled = true; s.insertBefore(mixOpt, s.firstChild); }
        if (!mx && mixOpt) { mixOpt.remove(); mixOpt = null; }
        var v = o.get(); s.value = mx ? '__mixed' : (v === undefined || v === null ? '' : String(v));
      });
      return s;
    }
    function colorCtl(o) {
      var box = ce('div', 'st-eng-color');
      var sw = ce('button', 'st-eng-sw', '<i></i>');
      sw.type = 'button';
      sw.setAttribute('aria-label', (o.title || 'Couleur') + ' : choisir');
      var hex = ce('input', 'st-eng-input');
      hex.spellcheck = false;
      hex.setAttribute('aria-label', (o.title || 'Couleur') + ' (hex)');
      box.appendChild(sw); box.appendChild(hex);
      sw.addEventListener('click', function (e) {
        e.preventDefault();
        var p = o.get();
        openPicker(sw, p && p.type === 'solid' ? toHex(p.color) : (p && p.stops ? toHex(p.stops[0].color) : '#000000'), function (v, live) {
          var c = fromHex(v); if (c) o.set({ type: 'solid', color: c, opacity: 1, blend: 'normal', visible: true }, live);
        }, o.title, o.gradient ? { get: function () { var b = o.box ? o.box() : null; return gradOf(o.get(), b && b.w, b && b.h); }, set: function (g, live) { var b = o.box ? o.box() : null; o.set(paintFromGrad(g, b && b.w, b && b.h), live); } } : null);
      });
      hex.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); var c = fromHex(hex.value.trim().charAt(0) === '#' ? hex.value.trim() : '#' + hex.value.trim()); if (c) o.set({ type: 'solid', color: c, opacity: 1, blend: 'normal', visible: true }, false); hex.blur(); }
      });
      reg(function () {
        var p = o.get();
        var mx = mixedOf(o.get).mixed;
        box.classList.toggle('is-mixed', mx);
        sw.firstChild.style.background = mx ? 'repeating-conic-gradient(#8a8a8a 0 25%, #c8c8c8 0 50%) 0 0 / 8px 8px' : paintCss(p);
        if (document.activeElement !== hex) hex.value = mx ? 'Mixte' : p ? (p.type === 'solid' ? toHex(p.color).slice(1) : p.type === 'image' ? 'Image' : (p.type === 'radial' ? 'Dégradé radial' : 'Dégradé')) : '';
      });
      return box;
    }
    function ib(svg, label, fn) {
      var b = ce('button', 'st-eng-ib', /^<svg/.test(svg) ? svg : '<svg viewBox="0 0 16 16" aria-hidden="true">' + svg + '</svg>');
      b.type = 'button';
      b.setAttribute('data-tip', label); b.setAttribute('aria-label', label);
      b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
      return b;
    }
    var IC = { plus: PHI('plus'), minus: PHI('minus'), eye: PHI('eye'),
      x: PHI('x') };
    function group(title, open) {
      var g = ce('section', 'dz-g' + (open === false ? ' is-closed' : ''));
      var head = ce('div', 'dz-gh');
      var tb = ce('button', 'dz-gh__t', '<span class="dz-gh__c"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5L8 10l3.5-3.5"/></svg></span><span>' + esc(title) + '</span>');
      tb.type = 'button';
      tb.setAttribute('aria-expanded', String(open !== false));
      tb.addEventListener('click', function () { var closed = g.classList.toggle('is-closed'); tb.setAttribute('aria-expanded', String(!closed)); });
      head.appendChild(tb);
      var acts = ce('div', 'dz-gh__a');
      head.appendChild(acts);
      var body = ce('div', 'dz-gb');
      var inner = ce('div', 'dz-gb__in');
      body.appendChild(inner);
      g.appendChild(head); g.appendChild(body);
      g.body = inner; g.acts = acts;
      return g;
    }
    function row(cls, els) { var r = ce('div', 'st-eng-row' + (cls ? ' ' + cls : '')); els.forEach(function (x) { if (x) r.appendChild(x); }); return r; }
    function lab(text) { return ce('span', 'st-eng-lab', esc(text)); }

    /* ================================================================ the panel */

    var BP_LABEL = { base: 'Ordinateur', tablet: 'Tablette', phone: 'Téléphone' };
    var TYPE_LABEL = { frame: 'Cadre', stack: 'Pile', grid: 'Grille', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Ligne', text: 'Texte', image: 'Image' };
    function boxOf(t) { var ab = C.activeAb(); return C.previewBox ? C.previewBox(ab, t.sid, t.id) : C.boxF(ab, t.sid, t.id); }

    function build(insp, titleEl, subEl) {
      updaters = [];
      var t = target();
      if (!t) return false;
      curT = t;
      var allOf = function (type) { return t.ids.every(function (id) { var n = E.node(t.sid, id); return n && n.type === type; }); };
      var s = S.sectionById(t.sid);
      titleEl.textContent = t.root ? S.sectionName(s) : (t.ids.length > 1 ? t.ids.length + ' éléments' : t.n.name || TYPE_LABEL[t.n.type]);
      subEl.textContent = t.root ? 'Section détachée' : (TYPE_LABEL[t.n.type] || t.n.type) + ' · ' + S.sectionName(s);
      var root = ce('div', 'dz st-eng-insp');
      root.setAttribute('data-eng-insp', t.id);

      // the breakpoint being edited
      var bps = ce('div', 'st-eng-bps');
      bps.appendChild(seg({ title: 'Écran modifié', options: ['base', 'tablet', 'phone'].map(function (b) { return { v: b, label: BP_LABEL[b], tip: b === 'base' ? 'Ordinateur : la valeur de base (1200 px et plus)' : b === 'tablet' ? 'Tablette (moins de 1200 px) : une valeur ici ne change que les écrans plus étroits' : 'Téléphone (moins de 768 px)' }; }), get: function () { return t.bp; }, set: function (v) { C.setEditBp(v); rebuild(); } }));
      root.appendChild(bps);
      if (t.bp !== 'base') root.appendChild(ce('p', 'st-eng-note', 'Vous modifiez <b>' + BP_LABEL[t.bp] + '</b> : chaque valeur réglée ici remplace celle ' + (t.bp === 'phone' ? 'de la tablette' : 'de l’ordinateur') + ' (pastille bleue).'));

      if (t.root) root.appendChild(sectionGroup(t, s));
      if (!t.root) root.appendChild(positionGroup(t));
      root.appendChild(sizeGroup(t));
      if (E.isContainer(t.n)) root.appendChild(layoutGroup(t));
      root.appendChild(appearanceGroup(t));
      if (!t.root && C.align) root.insertBefore(alignRow(t), root.children[1] || null);
      if (!t.root && t.ids.length === 1 && t.n.bind) root.insertBefore(bindGroup(t), root.children[2] || null);
      if (t.n.type !== 'text' && t.n.type !== 'image') root.appendChild(fillGroup(t));
      if (allOf('image')) root.appendChild(imageGroup(t));
      if (allOf('text')) root.appendChild(typoGroup(t));
      root.appendChild(strokeGroup(t));
      root.appendChild(effectsGroup(t));
      if (!t.root && t.ids.length === 1) root.appendChild(webGroup(t));
      root.appendChild(cssGroup(t));
      insp.appendChild(root);
      refresh();
      return true;
    }
    function rebuild() { if (S.state().sel) S.buildInspector(); }

    /* the align / distribute row at the top of the panel (Figma): 6 alignments, 2 distributions */
    var AL_IC = {
      left: '<path d="M2.5 2v12"/><rect x="4.5" y="4" width="8" height="3" rx=".8"/><rect x="4.5" y="9" width="5" height="3" rx=".8"/>',
      hcenter: '<path d="M8 2v12"/><rect x="3.5" y="4" width="9" height="3" rx=".8"/><rect x="5" y="9" width="6" height="3" rx=".8"/>',
      right: '<path d="M13.5 2v12"/><rect x="3.5" y="4" width="8" height="3" rx=".8"/><rect x="6.5" y="9" width="5" height="3" rx=".8"/>',
      top: '<path d="M2 2.5h12"/><rect x="4" y="4.5" width="3" height="8" rx=".8"/><rect x="9" y="4.5" width="3" height="5" rx=".8"/>',
      vcenter: '<path d="M2 8h12"/><rect x="4" y="3.5" width="3" height="9" rx=".8"/><rect x="9" y="5" width="3" height="6" rx=".8"/>',
      bottom: '<path d="M2 13.5h12"/><rect x="4" y="3.5" width="3" height="8" rx=".8"/><rect x="9" y="6.5" width="3" height="5" rx=".8"/>',
      dh: '<path d="M2.5 2.5v11M13.5 2.5v11"/><rect x="6.5" y="5" width="3" height="6" rx=".8"/>',
      dv: '<path d="M2.5 2.5h11M2.5 13.5h11"/><rect x="5" y="6.5" width="6" height="3" rx=".8"/>'
    };
    function alignRow(t) {
      var r = ce('div', 'st-eng-alignrow');
      r.setAttribute('role', 'toolbar');
      r.setAttribute('aria-label', 'Aligner et répartir');
      [['left', 'Aligner à gauche', 'Alt A'], ['hcenter', 'Centrer horizontalement', 'Alt H'], ['right', 'Aligner à droite', 'Alt D'],
        ['top', 'Aligner en haut', 'Alt W'], ['vcenter', 'Centrer verticalement', 'Alt V'], ['bottom', 'Aligner en bas', 'Alt S']].forEach(function (a) {
        var b = ib(AL_IC[a[0]], a[1] + (t.ids.length > 1 ? '' : ' (dans son cadre)'), function () { C.align(C.current(), a[0]); });
        b.setAttribute('data-align', a[0]);
        b.setAttribute('data-kbd', a[2]);
        r.appendChild(b);
      });
      r.appendChild(ce('span', 'st-eng-alignrow__sep'));
      [['h', 'dh', 'Répartir l’espacement horizontal', 'Alt ⇧ H'], ['v', 'dv', 'Répartir l’espacement vertical', 'Alt ⇧ V']].forEach(function (a) {
        var b = ib(AL_IC[a[1]], a[2] + ' (3 éléments ou plus)', function () { C.distribute(C.current(), a[0]); });
        b.setAttribute('data-distribute', a[0]);
        b.setAttribute('data-kbd', a[3]);
        b.disabled = t.ids.length < 3;
        r.appendChild(b);
      });
      return r;
    }

    /* a node bound to the catalogue (detached products, wave 1): it follows the product; « Délier » freezes it */
    var BIND_LABEL = { name: 'nom', price: 'prix', image: 'photo' };
    function bindGroup(t) {
      var g = group('Lié au catalogue');
      var p = S.productById(t.n.bind.product);
      g.body.appendChild(ce('p', 'st-eng-note', 'Lié à <b>Produit · ' + esc(BIND_LABEL[t.n.bind.field] || t.n.bind.field) + '</b>' + (p ? ' (« ' + esc(p.name || p.id) + ' »)' : ' (produit supprimé)') + ' : ' + (t.n.bind.field === 'image' ? 'la photo du produit s’affiche ici.' : 'modifier ce texte modifie le produit, partout dans la boutique.')));
      var a = ce('div', 'st-eng-actions');
      if (p) {
        var go = ce('button', 'st-secbtn', 'Ouvrir le produit');
        go.type = 'button';
        go.addEventListener('click', function () { S.select({ kind: 'product', id: p.id }); });
        a.appendChild(go);
      }
      var un = ce('button', 'st-secbtn', 'Délier');
      un.type = 'button';
      un.addEventListener('click', function () { E.apply(t.sid, [{ op: 'remove', path: E.path(t.id, 'bind') }], 'Élément délié du catalogue', { structure: true }); });
      a.appendChild(un);
      g.body.appendChild(a);
      g.setAttribute('data-bind', t.n.bind.field);
      return g;
    }

    function sectionGroup(t, s) {
      var g = group('Section détachée');
      var count = Object.keys(E.ed(t.sid).doc.nodes).length;
      g.body.appendChild(ce('p', 'st-eng-note', 'Ses <b>' + count + ' éléments</b> se modifient librement (DualEngine) : double-cliquez pour entrer, glissez, redimensionnez. Ses réglages de contenu ne s’appliquent plus tant qu’elle est détachée.'));
      var a = ce('div', 'st-eng-actions');
      var b1 = ce('button', 'st-secbtn', 'Entrer dans la section <kbd>Entrée</kbd>');
      b1.type = 'button';
      b1.addEventListener('click', function () { var r = E.node(t.sid, E.rootId(t.sid)); if (r.children.length) C.selectNodes(t.sid, [r.children[0]]); });
      var b2 = ce('button', 'st-secbtn', 'Exporter en HTML / CSS');
      b2.type = 'button';
      b2.addEventListener('click', function () { E.downloadSection(t.sid); });
      var b3 = ce('button', 'st-secbtn', 'Rattacher au modèle <kbd>Ctrl Alt B</kbd>');
      b3.type = 'button';
      b3.addEventListener('click', function () { E.attach(t.sid); });
      a.appendChild(b1); a.appendChild(b2); a.appendChild(b3);
      g.body.appendChild(a);
      return g;
    }

    function positionGroup(t) {
      var g = group('Position');
      var parent = E.node(t.sid, t.n.parent);
      var plp = function () { return E.value(t.sid, parent.id, 'layoutParent', t.bp) || { mode: 'absolute' }; };
      var lc = function () { return val(t, 'layoutChild') || {}; };
      var abs = function () { return plp().mode === 'absolute' || lc().position === 'absolute'; };
      if (parent && parent.layoutParent && parent.layoutParent.mode !== 'absolute') {
        g.body.appendChild(row('st-eng-row--1', [seg({ title: 'Placement', options: [{ v: 'flow', label: 'Dans la pile', tip: 'Suit l’Auto Layout du cadre' }, { v: 'absolute', label: 'Absolu', tip: 'Sort du flux, placé par ses contraintes (§2.4)' }],
          get: function () { return lc().position || 'flow'; }, over: function () { return isOver(t, 'layoutChild', 'position'); },
          set: function (v) {
            var b = boxOf(t), pb = C.boxF(C.activeAb(), t.sid, parent.id);
            write(t, 'layoutChild', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.position = v; return o; }, v === 'absolute' ? 'Élément sorti du flux' : 'Élément remis dans la pile');
            if (v === 'absolute' && b && pb) write(t, 'geometry', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.x = round(b.x - pb.x, 2); o.y = round(b.y - pb.y, 2); return o; }, 'Élément sorti du flux');
          } })]));
      }
      var gx = function (k) { return function () { var b = boxOf(t), pb = C.boxF(C.activeAb(), t.sid, t.n.parent); if (!abs() && b && pb) return k === 'x' ? round(b.x - pb.x, 2) : round(b.y - pb.y, 2); return (val(t, 'geometry') || {})[k]; }; };
      g.body.appendChild(row('', [
        num({ letter: 'X', title: 'X (px, depuis le bord gauche du cadre)', get: gx('x'), set: function (v, live) { writeKey(t, 'geometry', 'x', v, 'Position X', live ? 'x' : null); }, over: function () { return isOver(t, 'geometry', 'x'); }, reset: function () { resetOver(t, 'geometry', 'x'); }, disabled: function () { return !abs(); } }),
        num({ letter: 'Y', title: 'Y (px, depuis le haut du cadre)', get: gx('y'), set: function (v, live) { writeKey(t, 'geometry', 'y', v, 'Position Y', live ? 'y' : null); }, over: function () { return isOver(t, 'geometry', 'y'); }, reset: function () { resetOver(t, 'geometry', 'y'); }, disabled: function () { return !abs(); } })
      ]));
      var flowNote = ce('p', 'st-eng-note', 'Position dans le flux : X et Y découlent de l’Auto Layout du cadre.');
      reg(function () { flowNote.hidden = abs(); });
      g.body.appendChild(flowNote);
      g.body.appendChild(row('', [
        num({ letter: '°', title: 'Rotation (degrés, sens horaire)', min: -180, max: 180, get: function () { return (val(t, 'geometry') || {}).rotation || 0; }, set: function (v, live) { writeKey(t, 'geometry', 'rotation', v, 'Rotation', live ? 'rot' : null); }, over: function () { return isOver(t, 'geometry', 'rotation'); }, reset: function () { resetOver(t, 'geometry', 'rotation'); } }),
        seg({ title: 'Miroir', options: [{ v: 'h', label: '⇋', tip: 'Miroir horizontal' }, { v: 'v', label: '⇵', tip: 'Miroir vertical' }], get: function () { return null; }, set: function (v) { writeKey(t, 'geometry', v === 'h' ? 'flipH' : 'flipV', !(val(t, 'geometry') || {})[v === 'h' ? 'flipH' : 'flipV'], 'Miroir'); } })
      ]));
      // constraints (§2.5), for the absolute children
      var cons = ce('div');
      cons.appendChild(lab('Contraintes'));
      cons.appendChild(row('', [
        sel({ title: 'Contrainte horizontale', options: [['left', 'Gauche'], ['right', 'Droite'], ['leftRight', 'Gauche et droite'], ['center', 'Centre'], ['scale', 'Proportionnelle']].map(function (x) { return { v: x[0], label: x[1] }; }),
          get: function () { return ((lc().constraints) || {}).h || 'left'; }, set: function (v) { write(t, 'layoutChild', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.constraints = Object.assign({}, (cur && cur.constraints) || { v: 'top' }, { h: v }); return o; }, 'Contrainte horizontale'); } }),
        sel({ title: 'Contrainte verticale', options: [['top', 'Haut'], ['bottom', 'Bas'], ['topBottom', 'Haut et bas'], ['center', 'Centre'], ['scale', 'Proportionnelle']].map(function (x) { return { v: x[0], label: x[1] }; }),
          get: function () { return ((lc().constraints) || {}).v || 'top'; }, set: function (v) { write(t, 'layoutChild', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.constraints = Object.assign({}, (cur && cur.constraints) || { h: 'left' }, { v: v }); return o; }, 'Contrainte verticale'); } })
      ]));
      reg(function () { cons.hidden = !abs(); });
      g.body.appendChild(cons);
      return g;
    }

    function sizeGroup(t) {
      var g = group('Dimensions');
      var lc = function () { return val(t, 'layoutChild') || {}; };
      var gw = function (k) { return function () { var b = boxOf(t); return b ? round(k === 'w' ? b.w : b.h, 2) : (val(t, 'geometry') || {})[k]; }; };
      function setSize(k) {
        return function (v, live) {
          var mk = k === 'w' ? 'widthMode' : 'heightMode';
          if (lc()[mk] !== 'fixed') write(t, 'layoutChild', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o[mk] = 'fixed'; return o; }, 'Taille fixe');
          if (t.n.type === 'text' && k === 'w' && t.n.resize === 'autoWidth') E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'resize'), value: 'autoHeight' }], 'Texte à largeur fixe');
          writeKey(t, 'geometry', k, Math.max(0, v), k === 'w' ? 'Largeur' : 'Hauteur', live ? k : null);
        };
      }
      g.body.appendChild(row('', [
        num({ letter: 'L', title: 'Largeur (px)', min: 0, get: gw('w'), set: setSize('w'), over: function () { return isOver(t, 'geometry', 'w'); }, reset: function () { resetOver(t, 'geometry', 'w'); }, disabled: function () { return t.root; } }),
        num({ letter: 'H', title: 'Hauteur (px)', min: 0, get: gw('h'), set: setSize('h'), over: function () { return isOver(t, 'geometry', 'h'); }, reset: function () { resetOver(t, 'geometry', 'h'); } })
      ]));
      function modeSeg(k) {
        var mk = k === 'w' ? 'widthMode' : 'heightMode';
        return seg({ title: k === 'w' ? 'Largeur' : 'Hauteur', options: [{ v: 'fixed', label: 'Fixe', tip: 'Taille fixe (px)' }, { v: 'hug', label: 'Contenu', tip: 'S’ajuste au contenu (fit-content)' }, { v: 'fill', label: 'Remplir', tip: 'Remplit le cadre (flex: 1 1 0 % / 100 %)' }],
          get: function () { return lc()[mk]; }, over: function () { return isOver(t, 'layoutChild', mk); },
          set: function (v) {
            if (t.root && k === 'w') { toast('Une section occupe toujours toute la largeur de la boutique.', 'info'); return; }
            // a hug container with a fill child on its main axis is refused (§2.2), like Figma
            if (v === 'hug' && E.isContainer(t.n)) {
              var lp = val(t, 'layoutParent') || {};
              var main = lp.mode === 'stack' ? (lp.direction === 'horizontal' ? 'w' : 'h') : null;
              if (main === k && t.n.children.some(function (c) { return (E.value(t.sid, c, 'layoutChild', t.bp) || {})[mk] === 'fill'; })) { toast('« Contenu » est impossible : un enfant remplit déjà ce cadre sur cet axe.', 'warn'); return; }
            }
            if (t.n.type === 'text' && k === 'w') E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'resize'), value: v === 'hug' ? 'autoWidth' : 'autoHeight' }], 'Texte : largeur');
            write(t, 'layoutChild', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o[mk] = v; if (v === 'fill' && t.bp === 'base') o.grow = 1; return o; }, (k === 'w' ? 'Largeur' : 'Hauteur') + ' : ' + ({ fixed: 'fixe', hug: 'contenu', fill: 'remplir' })[v]);
          } });
      }
      g.body.appendChild(lab('Largeur'));
      g.body.appendChild(row('st-eng-row--1', [modeSeg('w')]));
      g.body.appendChild(lab('Hauteur'));
      g.body.appendChild(row('st-eng-row--1', [modeSeg('h')]));
      g.body.appendChild(row('', [
        num({ letter: '≥', title: 'Largeur minimale (px)', min: 0, get: function () { return lc().minW; }, set: function (v) { writeKey(t, 'layoutChild', 'minW', v, 'Largeur minimale'); } }),
        num({ letter: '≤', title: 'Largeur maximale (px)', min: 0, get: function () { var m = lc().maxW; return m >= 100000 ? null : m; }, set: function (v) { writeKey(t, 'layoutChild', 'maxW', v, 'Largeur maximale'); } })
      ]));
      return g;
    }

    var ALIGN_MAIN = ['start', 'center', 'end'], ALIGN_CROSS = ['start', 'center', 'end'];
    function layoutGroup(t) {
      var g = group('Auto Layout');
      var lp = function () { return val(t, 'layoutParent') || { mode: 'absolute' }; };
      function lpKey(k, v, label, co) { writeKey(t, 'layoutParent', k, v, label, co); }
      g.body.appendChild(row('st-eng-row--1', [seg({ title: 'Mise en page', options: [{ v: 'absolute', label: 'Libre', tip: 'Positions libres (absolu, contraintes)' }, { v: 'stack', label: 'Pile', tip: 'Auto Layout : display flex' }, { v: 'grid', label: 'Grille', tip: 'display grid, colonnes en fr' }],
        get: function () { return lp().mode; }, over: function () { return isOver(t, 'layoutParent', 'mode'); },
        set: function (v) {
          var cur = lp().mode;
          if (v === cur) return;
          if (t.bp === 'base' && (v === 'stack' && cur === 'absolute' || v === 'absolute' && cur === 'stack')) { C.autoLayout({ sid: t.sid, ids: [t.id], root: false }); return; }
          var lay = C.layout(t.sid, C.activeAb());
          var o = { mode: v, clip: !!lp().clip, padding: lp().padding || { top: 0, right: 0, bottom: 0, left: 0 } };
          if (v === 'grid') { o.columns = [{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]; o.rows = []; o.columnGap = 16; o.rowGap = 16; }
          if (v === 'stack') Object.assign(o, { direction: 'vertical', gap: 0, alignMain: 'start', alignCross: 'start', wrap: false });
          var patches = E.propPatches(t.sid, t.id, 'layoutParent', o, t.bp);
          if (v !== 'absolute') t.n.children.forEach(function (c) { if (E.node(t.sid, c).layoutChild.position === 'absolute' && t.bp === 'base') patches.push({ op: 'replace', path: E.path(c, 'layoutChild/position'), value: 'flow' }); });
          else t.n.children.forEach(function (c) { var b = lay && lay.boxes.get(c); if (b && t.bp === 'base') { patches.push({ op: 'replace', path: E.path(c, 'geometry/x'), value: round(b.x, 2) }); patches.push({ op: 'replace', path: E.path(c, 'geometry/y'), value: round(b.y, 2) }); } });
          E.apply(t.sid, patches, v === 'grid' ? 'Grille' : v === 'stack' ? 'Auto Layout' : 'Positions libres', { structure: true });
        } })]));
      var st = ce('div');
      st.appendChild(row('', [
        seg({ title: 'Direction', options: [{ v: 'vertical', label: '↓ Colonne' }, { v: 'horizontal', label: '→ Ligne' }], get: function () { return lp().direction; }, over: function () { return isOver(t, 'layoutParent', 'direction'); }, set: function (v) { lpKey('direction', v, 'Direction'); } }),
        seg({ title: 'Retour à la ligne', options: [{ v: false, label: 'Une ligne' }, { v: true, label: 'Retour' }], get: function () { return !!lp().wrap; }, over: function () { return isOver(t, 'layoutParent', 'wrap'); }, set: function (v) { lpKey('wrap', v, 'Retour à la ligne'); } })
      ]));
      var gapNum = num({ letter: '↔', title: 'Espacement (px)', min: -1000, get: function () { var gp = lp().gap; return gp === 'auto' ? null : gp; }, set: function (v, live) { lpKey('gap', v, 'Espacement', live ? 'gap' : null); }, over: function () { return isOver(t, 'layoutParent', 'gap'); }, reset: function () { resetOver(t, 'layoutParent', 'gap'); } });
      st.appendChild(row('', [gapNum, seg({ title: 'Espacement automatique', options: [{ v: true, label: 'Auto', tip: 'Espacement automatique (space-between)' }], get: function () { return lp().gap === 'auto'; }, set: function () { lpKey('gap', lp().gap === 'auto' ? 0 : 'auto', 'Espacement automatique'); } })]));
      // the 3 × 3 alignment (alignMain × alignCross) and « étirer »
      var al = ce('div', 'st-eng-align');
      al.setAttribute('role', 'group'); al.setAttribute('aria-label', 'Alignement');
      var cells = [];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) (function (r, c) {
        var b = ce('button');
        b.type = 'button';
        b.addEventListener('click', function () {
          var horiz = lp().direction === 'horizontal';
          var main = ALIGN_MAIN[horiz ? c : r], cross = ALIGN_CROSS[horiz ? r : c];
          write(t, 'layoutParent', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; if (cur.gap !== 'auto') o.alignMain = main; o.alignCross = cross; return o; }, 'Alignement');
        });
        cells.push({ b: b, r: r, c: c });
        al.appendChild(b);
      })(r, c);
      reg(function () {
        var l2 = lp(), horiz = l2.direction === 'horizontal';
        cells.forEach(function (x) {
          var main = ALIGN_MAIN[horiz ? x.c : x.r], cross = ALIGN_CROSS[horiz ? x.r : x.c];
          var on = (l2.alignMain === main || (l2.gap === 'auto' && (horiz ? x.c : x.r) === 1)) && (l2.alignCross === cross || (l2.alignCross === 'stretch' && cross === 'start'));
          x.b.classList.toggle('is-on', on);
        });
      });
      st.appendChild(row('', [al, seg({ title: 'Étirer les enfants', options: [{ v: 'stretch', label: 'Étirer', tip: 'Les enfants remplissent l’axe croisé (align-items: stretch)' }, { v: 'baseline', label: 'Ligne de base' }], get: function () { return lp().alignCross; }, set: function (v) { lpKey('alignCross', lp().alignCross === v ? 'start' : v, 'Alignement croisé'); } })]));
      var grid = ce('div');
      grid.appendChild(row('st-eng-row--3', [
        num({ letter: '▥', title: 'Colonnes', min: 1, max: 12, get: function () { return (lp().columns || []).length || 1; }, set: function (v) { var n = Math.round(clamp(v, 1, 12)); var cols = []; for (var i = 0; i < n; i++) cols.push({ kind: 'fr', value: 1 }); lpKey('columns', cols, 'Colonnes'); } }),
        num({ letter: '↔', title: 'Espace entre colonnes', min: 0, get: function () { return lp().columnGap; }, set: function (v, live) { lpKey('columnGap', v, 'Espace entre colonnes', live ? 'cgap' : null); } }),
        num({ letter: '↕', title: 'Espace entre lignes', min: 0, get: function () { return lp().rowGap; }, set: function (v, live) { lpKey('rowGap', v, 'Espace entre lignes', live ? 'rgap' : null); } })
      ]));
      g.body.appendChild(st);
      g.body.appendChild(grid);
      var pad = ce('div');
      pad.appendChild(lab('Marges intérieures'));
      pad.appendChild(row('st-eng-row--4', ['top', 'right', 'bottom', 'left'].map(function (k) {
        return num({ letter: { top: '↑', right: '→', bottom: '↓', left: '←' }[k], title: 'Marge ' + { top: 'haute', right: 'droite', bottom: 'basse', left: 'gauche' }[k], min: 0, get: function () { return (lp().padding || {})[k]; },
          set: function (v, live) { write(t, 'layoutParent', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.padding = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, (cur && cur.padding) || {}); o.padding[k] = v; return o; }, 'Marge intérieure', live ? 'pad' + k : null); },
          over: function () { return isOver(t, 'layoutParent', 'padding'); }, reset: function () { resetOver(t, 'layoutParent', 'padding'); } });
      })));
      g.body.appendChild(pad);
      g.body.appendChild(row('st-eng-row--1', [seg({ title: 'Contenu qui dépasse', options: [{ v: false, label: 'Visible' }, { v: true, label: 'Masqué (clip)' }], get: function () { return !!lp().clip; }, set: function (v) { lpKey('clip', v, v ? 'Contenu masqué' : 'Contenu visible'); } })]));
      reg(function () { var m = lp().mode; st.hidden = m !== 'stack'; grid.hidden = m !== 'grid'; pad.hidden = m === 'absolute'; });
      return g;
    }

    function appearanceGroup(t) {
      var g = group('Apparence');
      g.body.appendChild(row('', [
        num({ letter: '%', title: 'Opacité (%)', min: 0, max: 100, get: function () { var o = val(t, 'opacity'); return round((o == null ? 1 : o) * 100, 1); }, set: function (v, live) { write(t, 'opacity', clamp(v / 100, 0, 1), 'Opacité', live ? 'op' : null); }, over: function () { return isOver(t, 'opacity'); }, reset: function () { resetOver(t, 'opacity'); } }),
        num({ letter: '◜', title: 'Rayon (tous les coins)', min: 0, get: function () { var c = val(t, 'corners') || {}; return c.tl === c.tr && c.tr === c.br && c.br === c.bl ? c.tl : null; },
          set: function (v, live) { write(t, 'corners', function (cur) { var o = t.bp === 'base' ? clone(cur || {}) : {}; o.tl = o.tr = o.br = o.bl = Math.max(0, v); if (t.bp === 'base' && o.smoothing === undefined) o.smoothing = 0; return o; }, 'Rayon', live ? 'rad' : null); },
          over: function () { return isOver(t, 'corners'); }, reset: function () { resetOver(t, 'corners'); } })
      ]));
      g.body.appendChild(row('st-eng-row--4', ['tl', 'tr', 'br', 'bl'].map(function (k) {
        return num({ letter: { tl: '◸', tr: '◹', br: '◿', bl: '◺' }[k], title: 'Rayon ' + { tl: 'haut gauche', tr: 'haut droit', br: 'bas droit', bl: 'bas gauche' }[k], min: 0, get: function () { return (val(t, 'corners') || {})[k]; }, set: function (v, live) { writeKey(t, 'corners', k, Math.max(0, v), 'Rayon', live ? 'rad' + k : null); } });
      })));
      g.body.appendChild(row('', [
        num({ letter: '≈', title: 'Lissage des coins (%) : 60 = iOS (squircle, §3.2)', min: 0, max: 100, get: function () { return round(((val(t, 'corners') || {}).smoothing || 0) * 100, 0); }, set: function (v, live) { writeKey(t, 'corners', 'smoothing', clamp(v / 100, 0, 1), 'Lissage des coins', live ? 'smooth' : null); } }),
        seg({ title: 'Visibilité', options: [{ v: true, label: 'Visible' }, { v: false, label: 'Masqué' }], get: function () { return val(t, 'visible') !== false; }, over: function () { return isOver(t, 'visible'); }, set: function (v) { write(t, 'visible', v, v ? 'Élément affiché' : 'Élément masqué'); } })
      ]));
      return g;
    }

    function paintList(t, prop, title, textMode) {
      var g = group(title);
      var get = function () { if (textMode) { var st = val(t, 'style') || {}; return st.fills || []; } return val(t, prop) || []; };
      function setList(list, label, co) {
        if (textMode) write(t, 'style', function (cur) { var o = t.bp === 'base' ? clone(cur) : {}; o.fills = list; return o; }, label, co);
        else write(t, prop, list, label, co);
      }
      g.acts.appendChild(ib(IC.plus, 'Ajouter un remplissage', function () { var l = clone(get()); l.push({ type: 'solid', color: { r: 0.85, g: 0.85, b: 0.85, a: 1 }, opacity: 1, blend: 'normal', visible: true }); setList(l, 'Remplissage ajouté'); rebuild(); }));
      var list = ce('div', 'st-eng-list');
      g.body.appendChild(list);
      var drawn = -1;
      function render() {
        var fills = get();
        if (fills.length === drawn) return;
        drawn = fills.length;
        list.innerHTML = '';
        if (!fills.length) { list.appendChild(ce('p', 'st-eng-note', 'Aucun remplissage.')); return; }
        // the top paint first, as in Figma (the list is stored bottom → top, §3.3)
        fills.map(function (p, i) { return i; }).reverse().forEach(function (i) {
          var it = ce('div', 'st-eng-item');
          it.appendChild(colorCtl({ title: title, get: function () { return get()[i]; }, box: function () { return boxOf(t); }, gradient: !textMode || true,
            set: function (p, live) { var l = clone(get()); if (!l[i]) return; var keep = l[i]; p.opacity = keep.opacity == null ? 1 : keep.opacity; p.visible = keep.visible !== false; l[i] = p; setList(l, 'Couleur modifiée', live ? 'fill' + i : null); } }));
          var op = num({ letter: '%', title: 'Opacité du remplissage', min: 0, max: 100, get: function () { var p = get()[i]; return p ? round((p.opacity == null ? 1 : p.opacity) * 100, 0) : null; }, set: function (v, live) { var l = clone(get()); if (!l[i]) return; l[i].opacity = clamp(v / 100, 0, 1); setList(l, 'Opacité du remplissage', live ? 'fop' + i : null); } });
          it.appendChild(op);
          it.appendChild(ib(IC.eye, 'Afficher / masquer', function () { var l = clone(get()); if (!l[i]) return; l[i].visible = l[i].visible === false; setList(l, 'Remplissage ' + (l[i].visible ? 'affiché' : 'masqué')); }));
          it.appendChild(ib(IC.minus, 'Retirer', function () { var l = clone(get()); l.splice(i, 1); setList(l, 'Remplissage retiré'); drawn = -1; render(); refresh(); }));
          list.appendChild(it);
        });
        refresh();
      }
      reg(render);
      return g;
    }
    function fillGroup(t) { return paintList(t, 'fills', 'Remplissage', false); }

    function strokeGroup(t) {
      var g = group('Bordure');
      var get = function () { return val(t, 'strokes') || []; };
      g.acts.appendChild(ib(IC.plus, 'Ajouter une bordure', function () { var l = clone(get()); l.push({ paint: { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, blend: 'normal', visible: true }, width: 1, align: 'inside', cap: 'butt', join: 'miter', visible: true }); write(t, 'strokes', l, 'Bordure ajoutée'); }));
      var body = ce('div');
      g.body.appendChild(body);
      function s0() { return get()[0]; }
      function upd(fn, label, co) { var l = clone(get()); if (!l[0]) return; fn(l[0]); write(t, 'strokes', l, label, co); }
      var ctl = ce('div');
      ctl.appendChild(row('', [
        colorCtl({ title: 'Couleur de la bordure', get: function () { var s = s0(); return s && s.paint; }, set: function (p, live) { upd(function (s) { s.paint = p.type === 'solid' ? p : { type: 'solid', color: p.stops[0].color, opacity: 1, blend: 'normal', visible: true }; }, 'Couleur de la bordure', live ? 'sc' : null); } }),
        num({ letter: '▭', title: 'Épaisseur (px)', min: 0, max: 400, get: function () { var s = s0(); return s ? (typeof s.width === 'number' ? s.width : null) : null; }, set: function (v, live) { upd(function (s) { s.width = Math.max(0, v); }, 'Épaisseur de la bordure', live ? 'sw' : null); } })
      ]));
      ctl.appendChild(row('', [
        seg({ title: 'Alignement de la bordure', options: [{ v: 'inside', label: 'Int.', tip: 'Intérieure' }, { v: 'center', label: 'Centre' }, { v: 'outside', label: 'Ext.', tip: 'Extérieure' }], get: function () { var s = s0(); return s && s.align; }, set: function (v) { upd(function (s) { s.align = v; }, 'Alignement de la bordure'); } }),
        seg({ title: 'Style', options: [{ v: false, label: 'Plein' }, { v: true, label: 'Tirets' }], get: function () { var s = s0(); return !!(s && s.dash); }, set: function (v) { upd(function (s) { if (v) s.dash = [6, 4]; else delete s.dash; }, v ? 'Bordure en tirets' : 'Bordure pleine'); } })
      ]));
      ctl.appendChild(row('st-eng-row--1', [(function () { var b = ce('button', 'st-secbtn', 'Retirer la bordure'); b.type = 'button'; b.addEventListener('click', function () { write(t, 'strokes', [], 'Bordure retirée'); }); return b; })()]));
      body.appendChild(ctl);
      reg(function () { ctl.hidden = !s0(); });
      return g;
    }

    function effectsGroup(t) {
      var g = group('Effets', (val(t, 'effects') || []).length > 0);
      var get = function () { return val(t, 'effects') || []; };
      function add(e, label) { var l = clone(get()); l.push(e); write(t, 'effects', l, label); rebuild(); }
      g.acts.appendChild(ib(IC.plus, 'Ajouter une ombre portée', function () { add({ type: 'dropShadow', x: 0, y: 4, blur: 12, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.25 }, visible: true }, 'Ombre ajoutée'); }));
      var list = ce('div', 'st-eng-list');
      g.body.appendChild(list);
      var drawn = -1;
      function render() {
        var fx = get();
        if (fx.length === drawn) return;
        drawn = fx.length;
        list.innerHTML = '';
        fx.forEach(function (e, i) {
          function upd(fn, label, co) { var l = clone(get()); if (!l[i]) return; fn(l[i]); write(t, 'effects', l, label, co); }
          var head = ce('div', 'st-eng-item');
          head.appendChild(sel({ title: 'Type d’effet', options: [['dropShadow', 'Ombre portée'], ['innerShadow', 'Ombre intérieure'], ['layerBlur', 'Flou du calque'], ['backgroundBlur', 'Flou d’arrière-plan']].map(function (x) { return { v: x[0], label: x[1] }; }),
            get: function () { return (get()[i] || {}).type; }, set: function (v) { upd(function (x) { var shadow = v === 'dropShadow' || v === 'innerShadow'; x.type = v; if (shadow && x.x === undefined) { x.x = 0; x.y = 4; x.blur = 12; x.spread = 0; x.color = { r: 0, g: 0, b: 0, a: 0.25 }; delete x.radius; } if (!shadow) { x.radius = x.radius || 8; ['x', 'y', 'blur', 'spread', 'color', 'showBehindTransparent'].forEach(function (k) { delete x[k]; }); } }, 'Effet modifié'); drawn = -1; render(); } }));
          head.appendChild(ce('span'));
          head.appendChild(ib(IC.eye, 'Afficher / masquer', function () { upd(function (x) { x.visible = x.visible === false; }, 'Effet ' + (get()[i].visible === false ? 'affiché' : 'masqué')); }));
          head.appendChild(ib(IC.minus, 'Retirer', function () { var l = clone(get()); l.splice(i, 1); write(t, 'effects', l, 'Effet retiré'); drawn = -1; render(); }));
          list.appendChild(head);
          if (e.type === 'dropShadow' || e.type === 'innerShadow') {
            list.appendChild(row('st-eng-row--4', ['x', 'y', 'blur', 'spread'].map(function (k) {
              return num({ letter: { x: 'X', y: 'Y', blur: 'F', spread: 'É' }[k], title: { x: 'Décalage X', y: 'Décalage Y', blur: 'Flou', spread: 'Étendue' }[k], min: k === 'blur' ? 0 : -500, get: function () { return (get()[i] || {})[k]; }, set: function (v, live) { upd(function (x) { x[k] = v; }, 'Ombre modifiée', live ? 'fx' + i + k : null); } });
            })));
            list.appendChild(row('st-eng-row--1', [colorCtl({ title: 'Couleur de l’ombre', get: function () { var x = get()[i]; return x && x.color ? { type: 'solid', color: x.color } : null; }, set: function (p, live) { upd(function (x) { x.color = p.type === 'solid' ? p.color : p.stops[0].color; }, 'Couleur de l’ombre', live ? 'fxc' + i : null); } })]));
          } else {
            list.appendChild(row('', [num({ letter: 'F', title: 'Rayon du flou (px)', min: 0, max: 500, get: function () { return (get()[i] || {}).radius; }, set: function (v, live) { upd(function (x) { x.radius = Math.max(0, v); }, 'Flou modifié', live ? 'fxr' + i : null); } })]));
          }
        });
        if (!fx.length) list.appendChild(ce('p', 'st-eng-note', 'Ombres portées ou intérieures, flou du calque ou de l’arrière-plan : « + ».'));
        refresh();
      }
      reg(render);
      return g;
    }

    function fontOptions(cur) {
      var list = [];
      var r = S.roots()[S.primaryKey()];
      ['--st-font-display', '--st-font-text'].forEach(function (v, i) {
        var f = r ? getComputedStyle(r).getPropertyValue(v).trim() : '';
        var names = f.split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }).filter(function (x) { return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(x); }).slice(0, 6).join(', ');
        if (names) list.push({ v: names, label: (i ? 'Texte de la boutique' : 'Titres de la boutique') + ' — ' + names.split(',')[0] });
      });
      var F = S.D.FONTS;
      if (F) Object.keys(F).forEach(function (k) { var f = F[k]; if (f && f.family && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(f.family)) list.push({ v: f.family, label: f.family }); });
      ['Inter', 'Georgia', 'system-ui'].forEach(function (x) { list.push({ v: x, label: x }); });
      if (cur && !list.some(function (o) { return o.v === cur; })) list.unshift({ v: cur, label: cur.split(',')[0] + ' (actuelle)' });
      var seen = {};
      return list.filter(function (o) { if (seen[o.v]) return false; seen[o.v] = true; return true; });
    }
    function typoGroup(t) {
      var g = group('Texte');
      var st = function () { return val(t, 'style') || {}; };
      function sk(k, v, label, co) { writeKey(t, 'style', k, v, label, co); }
      var ta = ce('textarea', 'st-eng-text');
      ta.setAttribute('aria-label', 'Contenu du texte');
      ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
      ta.addEventListener('change', function () {
        var v = ta.value.slice(0, 8000);
        var r0 = t.n.text.paragraphs[0] && t.n.text.paragraphs[0].runs[0];
        E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'text'), value: M.richText(v, r0 && r0.style ? r0.style : undefined) }], 'Texte modifié');
      });
      if (t.ids.length > 1) { ta.disabled = true; ta.placeholder = t.ids.length + ' textes : modifiez le contenu de chacun séparément (double-clic sur le canevas).'; }
      reg(function () { if (t.ids.length > 1) { ta.value = ''; return; } if (document.activeElement !== ta) ta.value = M.plainText(E.node(t.sid, t.id).text); });
      g.body.appendChild(row('st-eng-row--1', [ta]));
      g.body.appendChild(row('st-eng-row--1', [sel({ title: 'Police', options: fontOptions(st().family), get: function () { return st().family; }, set: function (v) { sk('family', v, 'Police'); } })]));
      g.body.appendChild(row('', [
        sel({ title: 'Graisse', numeric: true, options: [[300, 'Light 300'], [400, 'Regular 400'], [500, 'Medium 500'], [600, 'Semibold 600'], [700, 'Bold 700'], [800, 'Extrabold 800'], [900, 'Black 900']].map(function (x) { return { v: x[0], label: x[1] }; }), get: function () { return st().weight; }, set: function (v) { sk('weight', v, 'Graisse'); } }),
        num({ letter: 'Aa', title: 'Taille (px)', min: 1, max: 400, get: function () { return st().size; }, set: function (v, live) { sk('size', v, 'Taille du texte', live ? 'fs' : null); }, over: function () { return isOver(t, 'style', 'size'); }, reset: function () { resetOver(t, 'style', 'size'); } })
      ]));
      g.body.appendChild(row('', [
        num({ letter: '↕', title: 'Interligne (px, vide = auto)', min: 0, get: function () { var lh = st().lineHeight || {}; return lh.unit === 'px' ? lh.value : null; }, set: function (v, live) { sk('lineHeight', v > 0 ? { unit: 'px', value: v } : { unit: 'auto' }, 'Interligne', live ? 'lh' : null); } }),
        num({ letter: '↔', title: 'Espacement des lettres (px)', min: -50, max: 50, step: 0.1, get: function () { var ls = st().letterSpacing || {}; return ls.value; }, set: function (v, live) { sk('letterSpacing', { unit: 'px', value: v }, 'Espacement des lettres', live ? 'ls' : null); } })
      ]));
      g.body.appendChild(row('st-eng-row--1', [seg({ title: 'Alignement', options: [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite'], ['justify', 'Justifié']].map(function (x) { return { v: x[0], label: x[1] }; }), get: function () { return st().align; }, over: function () { return isOver(t, 'style', 'align'); }, set: function (v) { sk('align', v, 'Alignement du texte'); } })]));
      g.body.appendChild(row('', [
        seg({ title: 'Casse', options: [['none', 'Aa'], ['upper', 'AA'], ['lower', 'aa']].map(function (x) { return { v: x[0], label: x[1] }; }), get: function () { return st().case; }, set: function (v) { sk('case', v, 'Casse'); } }),
        seg({ title: 'Décoration', options: [['none', '—'], ['underline', 'S̲'], ['strike', 'S̶']].map(function (x) { return { v: x[0], label: x[1] }; }), get: function () { return st().decoration; }, set: function (v) { sk('decoration', v, 'Décoration'); } })
      ]));
      g.body.appendChild(row('', [
        seg({ title: 'Italique', options: [{ v: false, label: 'Droit' }, { v: true, label: 'Italique' }], get: function () { return !!st().italic; }, set: function (v) { sk('italic', v, v ? 'Italique' : 'Droit'); } }),
        seg({ title: 'Redimensionnement', options: [{ v: 'autoWidth', label: '↔', tip: 'Largeur auto (une ligne)' }, { v: 'autoHeight', label: '↕', tip: 'Hauteur auto (largeur fixe)' }, { v: 'fixed', label: '▭', tip: 'Taille fixe' }], get: function () { return E.node(t.sid, t.id).resize; },
          set: function (v) { var lcp = { autoWidth: { widthMode: 'hug', heightMode: 'hug' }, autoHeight: { widthMode: 'fixed', heightMode: 'hug' }, fixed: { widthMode: 'fixed', heightMode: 'fixed' } }[v]; var cur = E.node(t.sid, t.id).layoutChild; var p = [{ op: 'replace', path: E.path(t.id, 'resize'), value: v }]; if (cur.widthMode !== 'fill') p.push({ op: 'replace', path: E.path(t.id, 'layoutChild/widthMode'), value: lcp.widthMode }); p.push({ op: 'replace', path: E.path(t.id, 'layoutChild/heightMode'), value: lcp.heightMode }); E.apply(t.sid, p, 'Redimensionnement du texte'); } })
      ]));
      var cg = ce('div');
      cg.appendChild(lab('Couleur'));
      cg.appendChild(row('st-eng-row--1', [colorCtl({ title: 'Couleur du texte', gradient: true, box: function () { return boxOf(t); }, get: function () { return (st().fills || [])[0]; }, set: function (p, live) { sk('fills', [p], 'Couleur du texte', live ? 'tc' : null); } })]));
      g.body.appendChild(cg);
      return g;
    }

    function imageGroup(t) {
      var g = group('Image');
      var D = S.D;
      var niche = state().config.store && state().config.store.niche;
      var photos = D.DEMO_PHOTOS ? Object.keys(D.DEMO_PHOTOS).filter(function (id) { return !niche || id.indexOf(niche) === 0; }).slice(0, 12) : [];
      function setAsset(src, w, h, label) {
        var e = E.ed(t.sid);
        var aid = null;
        Object.keys(e.doc.assets).some(function (k) { if (e.doc.assets[k].src === src) { aid = k; return true; } return false; });
        var patches = [];
        if (!aid) {
          aid = 'a' + Date.now().toString(36);
          var url = /^demo:/.test(src) ? (S.R.photoSrc(src.slice(5)) || '') : src;
          var a = { url: url, src: src };
          if (w) a.width = w; if (h) a.height = h;
          patches.push({ op: 'add', path: '/assets/' + aid, value: a });
        }
        patches.push({ op: 'replace', path: E.path(t.id, 'asset'), value: aid });
        E.apply(t.sid, patches, label || 'Image remplacée');
      }
      if (photos.length) {
        var grid = ce('div', 'st-eng-photos');
        photos.forEach(function (id) {
          var info = S.R.photoInfo(id);
          if (!info) return;
          var b = ce('button');
          b.type = 'button';
          b.style.backgroundImage = 'url("' + info.src + '")';
          b.setAttribute('aria-label', 'Photo : ' + (info.alt || id));
          b.setAttribute('data-tip', info.alt || id);
          b.addEventListener('click', function () { setAsset('demo:' + id, 0, 0, 'Photo choisie'); if (!E.node(t.sid, t.id).alt && info.alt) E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'alt'), value: info.alt.slice(0, 200) }], 'Texte alternatif'); });
          grid.appendChild(b);
        });
        g.body.appendChild(lab('Photos d’exemple'));
        g.body.appendChild(grid);
      }
      var file = ce('input');
      file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
      file.addEventListener('change', function () { var f = file.files && file.files[0]; file.value = ''; if (f) S.readFileAsImage(f, function (data) { setAsset(data, 0, 0, 'Votre photo'); toast('Photo importée (réduite à 800 px).', 'ok'); }); });
      var up = ce('button', 'st-secbtn', 'Mettre ma photo…');
      up.type = 'button';
      up.addEventListener('click', function () { file.click(); });
      g.body.appendChild(row('st-eng-row--1', [up, file]));
      g.body.appendChild(row('st-eng-row--1', [seg({ title: 'Ajustement', options: [{ v: 'fill', label: 'Remplir', tip: 'object-fit: cover' }, { v: 'fit', label: 'Contenir', tip: 'object-fit: contain' }, { v: 'crop', label: 'Recadrer' }], get: function () { return E.node(t.sid, t.id).fit; }, set: function (v) { var p = [{ op: 'replace', path: E.path(t.id, 'fit'), value: v }]; if (v === 'crop' && !E.node(t.sid, t.id).crop) p.push({ op: 'add', path: E.path(t.id, 'crop'), value: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }); E.apply(t.sid, p, 'Ajustement de l’image'); } })]));
      // the crop (wave 1): zoom and focal point, as the template photos have, and « Recadrer » on the canvas
      var cv = function () { return C.cropOf ? C.cropOf(t.sid, t.id) : { z: 1, fx: 0.5, fy: 0.5 }; };
      var setC = function (k, label) { return function (v, live) { var c = cv(); c[k] = k === 'z' ? clamp(v / 100, 1, 4) : clamp(v / 100, 0, 1); C.setNodeCrop(t.sid, t.id, c, label, live ? 'ccrop' + k : null); }; };
      g.body.appendChild(row('', [
        num({ letter: '⤢', title: 'Zoom de la photo (%)', min: 100, max: 400, get: function () { return round(cv().z * 100, 0); }, set: setC('z', 'Zoom de l’image') }),
        ib('<path d="M4.5 1.5v10h10M1.5 4.5h10v10"/>', 'Recadrer sur le canevas (double-clic, Entrée)', function () { if (C.startNodeCrop) C.startNodeCrop(t.sid, t.id, C.activeAb()); })
      ]));
      g.body.appendChild(lab('Point focal'));
      g.body.appendChild(row('', [
        num({ letter: 'X', title: 'Point focal horizontal (%)', min: 0, max: 100, get: function () { return round(cv().fx * 100, 1); }, set: setC('fx', 'Point focal') }),
        num({ letter: 'Y', title: 'Point focal vertical (%)', min: 0, max: 100, get: function () { return round(cv().fy * 100, 1); }, set: setC('fy', 'Point focal') })
      ]));
      // the filters (adjust), as the template photos have
      var ADJ = [['brightness', 'Lumière', 0, 200, 100, '☀'], ['contrast', 'Contraste', 0, 200, 100, '◐'], ['saturate', 'Saturation', 0, 200, 100, '◉'], ['grayscale', 'N & B', 0, 100, 0, '◑'], ['sepia', 'Sépia', 0, 100, 0, 'S'], ['hue', 'Teinte (°)', -180, 180, 0, 'H']];
      var adjOf = function () { return (E.node(t.sid, t.id) || {}).adjust || {}; };
      var setAdj = function (k, dflt) {
        return function (v, live) {
          var o = clone(adjOf()), n0 = E.node(t.sid, t.id);
          if (Math.abs(v - dflt) < 0.001) delete o[k]; else o[k] = v;
          var p = Object.keys(o).length ? { op: n0.adjust ? 'replace' : 'add', path: E.path(t.id, 'adjust'), value: o } : (n0.adjust ? { op: 'remove', path: E.path(t.id, 'adjust') } : null);
          if (p) E.apply(t.sid, [p], 'Filtre de l’image', { coalesce: live ? 'adj' + k + t.id : undefined });
        };
      };
      g.body.appendChild(lab('Filtres'));
      for (var ai = 0; ai < ADJ.length; ai += 2) {
        g.body.appendChild(row('', [ADJ[ai], ADJ[ai + 1]].map(function (a) {
          return num({ letter: a[5], title: a[1] + (a[0] === 'hue' ? '' : ' (%)'), min: a[2], max: a[3], get: function () { var v = adjOf()[a[0]]; return v === undefined ? a[4] : v; }, set: setAdj(a[0], a[4]) });
        })));
      }
      var alt = ce('input', 'st-eng-input');
      alt.placeholder = 'Texte alternatif (décrit la photo)';
      alt.setAttribute('aria-label', 'Texte alternatif');
      alt.maxLength = 200;
      alt.addEventListener('keydown', function (e) { e.stopPropagation(); });
      alt.addEventListener('change', function () { E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'alt'), value: alt.value.slice(0, 200) }], 'Texte alternatif'); });
      reg(function () { if (document.activeElement !== alt) alt.value = E.node(t.sid, t.id).alt || ''; });
      g.body.appendChild(row('st-eng-row--1', [alt]));
      return g;
    }

    function webGroup(t) {
      var g = group('Web', false);
      var tags = t.n.type === 'text' ? ['p', 'h1', 'h2', 'h3', 'h4', 'span', 'a', 'li', 'label'] : t.n.type === 'image' ? ['img'] : ['div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'a', 'button', 'ul', 'li'];
      g.body.appendChild(row('st-eng-row--1', [sel({ title: 'Balise HTML', options: tags.map(function (x) { return { v: x, label: '<' + x + '>' }; }), get: function () { return E.node(t.sid, t.id).semantic.tag; },
        set: function (v) { var s = clone(E.node(t.sid, t.id).semantic); s.tag = v; s.tagLocked = true; if (v !== 'a' && v !== 'button') delete s.attrs.href; E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'semantic'), value: s }], 'Balise ' + v); } })]));
      var href = ce('input', 'st-eng-input');
      href.placeholder = 'Lien : https://…, #section, /pages/…, tel:, mailto:';
      href.setAttribute('aria-label', 'Lien');
      href.addEventListener('keydown', function (e) { e.stopPropagation(); });
      href.addEventListener('change', function () {
        var v = href.value.trim();
        var ok = !v || EN.href(v);
        if (!ok) { toast('Lien refusé : https://, #, /, tel: ou mailto: seulement.', 'warn'); return; }
        var s = clone(E.node(t.sid, t.id).semantic);
        if (v) { s.attrs.href = v; if (s.tag !== 'a' && s.tag !== 'button') s.tag = 'a'; } else delete s.attrs.href;
        E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'semantic'), value: s }], v ? 'Lien ajouté' : 'Lien retiré');
      });
      reg(function () { if (document.activeElement !== href) href.value = (E.node(t.sid, t.id).semantic.attrs || {}).href || ''; });
      g.body.appendChild(row('st-eng-row--1', [href]));
      var name = ce('input', 'st-eng-input');
      name.setAttribute('aria-label', 'Nom du calque');
      name.maxLength = 80;
      name.addEventListener('keydown', function (e) { e.stopPropagation(); });
      name.addEventListener('change', function () { E.apply(t.sid, [{ op: 'replace', path: E.path(t.id, 'name'), value: name.value.slice(0, 80) || TYPE_LABEL[t.n.type] }], 'Calque renommé'); });
      reg(function () { if (document.activeElement !== name) name.value = E.node(t.sid, t.id).name; });
      g.body.appendChild(lab('Nom du calque'));
      g.body.appendChild(row('st-eng-row--1', [name]));
      return g;
    }

    /* the CSS of the node, exactly as exported (the same generator, §3.7) */
    function nodeCss(sid, ids) {
      var s = S.sectionById(sid);
      var out = s ? EN.exportSection(s) : null;
      if (!out) return '';
      var rules = out.rules.filter(function (r) { return r.node && ids.indexOf(r.node) !== -1; });
      return DE.css.rulesToCSS(rules);
    }
    function cssGroup(t) {
      var g = group('CSS', false);
      var pre = ce('pre', 'st-eng-code');
      reg(function () { if (!g.classList.contains('is-closed')) pre.textContent = nodeCss(t.sid, t.ids) || '/* … */'; });
      g.querySelector('.dz-gh__t').addEventListener('click', function () { setTimeout(refresh, 0); });
      g.body.appendChild(pre);
      return g;
    }

    /* ================================================================ studio hooks */

    hooks.customInspector = (function (prev) {
      return function (sel, insp, title, sub) {
        if (sel && (sel.kind === 'engine' || (sel.kind === 'section' && !sel.el && !sel.field)) && E.isDetached(sel.id)) {
          try { return build(insp, title, sub); } catch (e) { if (window.console) console.error(e); return false; }
        }
        return prev ? prev(sel, insp, title, sub) : false;
      };
    })(hooks.customInspector);

    /* keep the panel's values live (an undo, a drag on the canvas, a scrub) without rebuilding it */
    chain('afterChange', function (opts) {
      var c = C.current();
      var panel = $('inspector') && $('inspector').querySelector('[data-eng-insp]');
      if (!c) return;
      if (!panel || panel.getAttribute('data-eng-insp') !== c.ids[0]) { if (!picker) S.buildInspector(); return; }
      refresh();
    });
    chain('engineBpChanged', function () { refresh(); });
    // the X / Y / L / H fields follow a drag or a resize on the canvas, live
    chain('engineDragging', function () { if ($('inspector') && $('inspector').querySelector('[data-eng-insp]')) refresh(); });
    /* Échap closes the colour picker first (the selection stays) */
    chain('escapeOverlay', function () {
      if (picker && window.JeereColor && window.JeereColor.isOpen()) { window.JeereColor.close(); picker = false; return true; }
      return undefined;
    });

    /* « Détacher » for a section of the template: the Réglages panel, the context menu, Ctrl Alt B */
    chain('inspectorBuilt', function (sel) {
      var insp = $('inspector');
      if (!insp || !sel || sel.kind !== 'section' || sel.el || sel.field || E.isDetached(sel.id) || state().sel && state().sel.kind === 'multi') return;
      if (insp.querySelector('.st-eng-detach')) return;
      var g = ce('div', 'st-insp__group st-eng-detach');
      var head = ce('div', 'st-insp__head', '<span>Édition libre</span>');
      var body = ce('div', 'st-insp__body');
      body.appendChild(ce('p', 'st-insp__empty', 'Détachez la section pour modifier chaque élément librement : position, taille, Auto Layout, couleurs, ombres, par écran. Elle ne suit plus le modèle (Ctrl Z ou « Rattacher » pour revenir).'));
      var b = ce('button', 'st-secbtn', 'Détacher la section <kbd>Ctrl Alt B</kbd>');
      b.type = 'button';
      b.addEventListener('click', function () { E.detach(sel.id).then(function (ok) { if (ok) { S.ui().engRulers = S.ui().engRulers !== false; S.saveUI(); } }); });
      body.appendChild(b);
      g.appendChild(head); g.appendChild(body);
      insp.appendChild(g);
    });
    hooks.sectionCtxItems = (function (prev) {
      return function (items, s) {
        var list = prev ? (prev(items, s) || items) : items;
        list = list.slice();
        list.push(null);
        if (EN.isDetached(s)) {
          list.push(['Rattacher au modèle', 'Ctrl Alt B', function () { E.attach(s.id); }]);
          list.push(['Exporter en HTML / CSS', '', function () { E.downloadSection(s.id); }]);
        } else list.push(['Détacher la section', 'Ctrl Alt B', function () { E.detach(s.id); }]);
        return list;
      };
    })(hooks.sectionCtxItems);

    /* the Code tab, CSS mode: the engine's CSS for the selected nodes (or the whole detached section) */
    hooks.selectionCss = (function (prev) {
      return function () {
        var c = C.current();
        if (c) {
          var s = S.sectionById(c.sid);
          if (c.root) { var out = EN.exportSection(s); return { label: 'CSS · ' + S.sectionName(s) + ' (DualEngine)', css: out ? out.css : '' }; }
          return { label: 'CSS · ' + (E.node(c.sid, c.ids[0]).name || 'élément') + ' (DualEngine)', css: nodeCss(c.sid, c.ids) };
        }
        return prev ? prev() : null;
      };
    })(hooks.selectionCss);
    /* the Design tab has nothing to say about engine nodes: it points to Réglages */
    function designNote() {
      var p = $('inspectorDesign');
      if (!p || p.hidden || !C.current()) return;
      p.innerHTML = '<div class="dz-empty st-eng-note" style="padding:16px 12px">Section détachée : son design se règle dans <b>Réglages</b> (DualEngine : Auto Layout, remplissages, bordures, effets, typographie, par écran).</div>';
    }
    chain('inspTabChanged', function () { setTimeout(designNote, 0); });
    chain('inspectorBuilt', function () { designNote(); });

    /* ================================================================ layers: the nodes of a detached section */

    var NODE_ICON = {
      frame: PHI('hash'), stack: PHI('stack'),
      grid: PHI('grid-four'),
      rect: PHI('rectangle'), ellipse: PHI('circle'), text: PHI('text-t'),
      image: PHI('image'), line: PHI('line-segment')
    };
    var openRows = {};
    /* Reorder the layers by dragging their rows (wave 2, Figma): before / after a sibling (upper / lower half
     * of its row), or into a frame (the middle of a frame's row: last child). One undo step. A node never goes
     * into itself or its own children. */
    var rowDrag = null, rowEat = false;
    function isFrameNode(n) { return !!n && (n.type === 'frame' || n.type === 'stack' || n.type === 'grid'); }
    function rowDown(ev, sid, cid, r) {
      if (ev.button !== 0 || (ev.target.closest && ev.target.closest('.st-row__btn, input'))) return;
      rowDrag = { sid: sid, cid: cid, row: r, y: ev.clientY, x: ev.clientX, moved: false, drop: null, line: null };
      window.addEventListener('pointermove', rowMove);
      window.addEventListener('pointerup', rowUp);
      window.addEventListener('pointercancel', rowUp);
    }
    function rowTarget(ev) {
      var d = rowDrag, e = E.ed(d.sid);
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var tr = el && el.closest ? el.closest('[data-eng-row]') : null;
      if (!tr || !e) return null;
      var parts = tr.getAttribute('data-eng-row').split('|');
      if (parts[0] !== d.sid || parts[1] === d.cid) return null;
      var tid = parts[1], tn = e.doc.nodes[tid];
      if (!tn) return null;
      if (E.subtreeIds(d.sid, d.cid).indexOf(tid) !== -1) return null; // not into its own children
      var b = tr.getBoundingClientRect(), f = (ev.clientY - b.top) / Math.max(1, b.height);
      if (isFrameNode(tn) && f > 0.3 && f < 0.7) return { row: tr, into: tid, b: b };
      return { row: tr, parent: tn.parent, ref: tid, after: f >= 0.5, b: b };
    }
    function rowMove(ev) {
      var d = rowDrag;
      if (!d) return;
      if (!d.moved) { if (Math.abs(ev.clientY - d.y) + Math.abs(ev.clientX - d.x) < 5) return; d.moved = true; d.row.classList.add('is-dragging'); document.body.classList.add('st-rowdragging'); }
      var t = rowTarget(ev);
      d.drop = t;
      if (!d.line) { d.line = ce('div', 'st-erow-drop'); document.body.appendChild(d.line); }
      if (!t) { d.line.hidden = true; return; }
      d.line.hidden = false;
      d.line.classList.toggle('is-into', !!t.into);
      d.line.style.left = t.b.left + 'px';
      d.line.style.width = t.b.width + 'px';
      if (t.into) { d.line.style.top = t.b.top + 'px'; d.line.style.height = t.b.height + 'px'; }
      else { d.line.style.top = (t.after ? t.b.bottom : t.b.top) - 1 + 'px'; d.line.style.height = '2px'; }
    }
    function rowUp() {
      var d = rowDrag;
      rowDrag = null;
      window.removeEventListener('pointermove', rowMove);
      window.removeEventListener('pointerup', rowUp);
      window.removeEventListener('pointercancel', rowUp);
      if (!d) return;
      if (d.line) d.line.remove();
      d.row.classList.remove('is-dragging');
      document.body.classList.remove('st-rowdragging');
      if (!d.moved) return;
      rowEat = true; setTimeout(function () { rowEat = false; }, 0);
      var t = d.drop, e = E.ed(d.sid);
      if (!t || !e) return;
      var n = e.doc.nodes[d.cid], from = e.doc.nodes[n.parent];
      var toId = t.into || t.parent, to = e.doc.nodes[toId];
      if (!from || !to) return;
      var patches = [];
      if (toId === n.parent) {
        var order = from.children.filter(function (x) { return x !== d.cid; });
        var at = order.indexOf(t.ref) + (t.after ? 1 : 0);
        order.splice(Math.max(0, at), 0, d.cid);
        if (JSON.stringify(order) === JSON.stringify(from.children)) return;
        patches.push({ op: 'replace', path: E.path(from.id, 'children'), value: order });
      } else {
        var dest = to.children.slice();
        var at2 = t.into ? dest.length : dest.indexOf(t.ref) + (t.after ? 1 : 0);
        dest.splice(Math.max(0, at2), 0, d.cid);
        patches.push({ op: 'replace', path: E.path(from.id, 'children'), value: from.children.filter(function (x) { return x !== d.cid; }) });
        patches.push({ op: 'replace', path: E.path(toId, 'children'), value: dest });
        patches.push({ op: 'replace', path: E.path(d.cid, 'parent'), value: toId });
      }
      E.apply(d.sid, patches, t.into ? 'Calque déplacé dans un cadre' : 'Calques réordonnés', { structure: true });
      C.selectNodes(d.sid, [d.cid]);
    }
    hooks.treeSection = (function (prev) {
      return function (s, container) {
        if (prev) { try { prev(s, container); } catch (e) { /* module */ } }
        if (!EN.isDetached(s)) return;
        var row0 = container.querySelector('[data-section-row="' + S.cssEsc(s.id) + '"]');
        if (row0 && row0.classList) row0.classList.add('is-detached');
        var e = E.ed(s.id);
        if (!e) return;
        var cur = C.current();
        var rid = E.rootId(s.id);
        // the tree shows the section's nodes when it (or one of them) is selected
        if (!(cur && cur.sid === s.id) && !openRows[s.id]) return;
        openRows[s.id] = true;
        var count = 0;
        (function walk(id, depth) {
          var n = e.doc.nodes[id];
          if (!n || count > 400) return;
          (n.children || []).forEach(function (cid) {
            var c = e.doc.nodes[cid];
            if (!c) return;
            count++;
            var r = ce('div', 'st-row st-row--child st-erow' + (c.visible === false ? ' is-hidden-node' : ''));
            r.setAttribute('data-eng-row', s.id + '|' + cid);
            r.style.paddingLeft = (28 + depth * 12) + 'px';
            var kind = c.type === 'frame' && c.layoutParent ? (c.layoutParent.mode === 'stack' ? 'stack' : c.layoutParent.mode === 'grid' ? 'grid' : 'frame') : c.type;
            r.appendChild(ce('span', 'st-row__icon', NODE_ICON[kind] || NODE_ICON.rect));
            r.appendChild(ce('span', 'st-row__name', esc(c.type === 'text' ? (M.plainText(c.text).slice(0, 40) || c.name) : c.name)));
            var eye = ce('button', 'st-row__btn' + (c.visible === false ? ' is-active' : ''), S.icon(c.visible === false ? 'eyeOff' : 'eye'));
            eye.type = 'button';
            eye.title = c.visible === false ? 'Afficher' : 'Masquer';
            eye.addEventListener('click', function (ev) { ev.stopPropagation(); E.apply(s.id, [{ op: 'replace', path: E.path(cid, 'visible'), value: c.visible === false }], c.visible === false ? 'Élément affiché' : 'Élément masqué'); });
            r.appendChild(eye);
            r.addEventListener('pointerdown', function (ev) { rowDown(ev, s.id, cid, r); });
            r.addEventListener('click', function (ev) {
              if (rowEat) return;
              var c0 = C.current();
              if (ev.shiftKey && c0 && c0.sid === s.id && !c0.root) { var ids = c0.ids.slice(); var at = ids.indexOf(cid); if (at === -1) ids.push(cid); else ids.splice(at, 1); C.selectNodes(s.id, ids.length ? ids : [rid]); }
              else C.selectNodes(s.id, [cid], { fromTree: true });
            });
            r.addEventListener('dblclick', function (ev) {
              ev.stopPropagation();
              var nm = r.querySelector('.st-row__name');
              var inp = document.createElement('input');
              inp.value = c.name; inp.maxLength = 80;
              nm.textContent = ''; nm.appendChild(inp); inp.focus(); inp.select();
              var finished = false;
              var fin = function (ok) { if (finished) return; finished = true; var v = inp.value.trim(); inp.remove(); if (ok && v && v !== c.name) E.apply(s.id, [{ op: 'replace', path: E.path(cid, 'name'), value: v.slice(0, 80) }], 'Calque renommé', { structure: true }); else S.buildTree(); };
              inp.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter') fin(true); if (k.key === 'Escape') fin(false); });
              inp.addEventListener('blur', function () { fin(true); });
            });
            container.appendChild(r);
            if (c.children && c.children.length) walk(cid, depth + 1);
          });
        })(rid, 1);
      };
    })(hooks.treeSection);
    hooks.treeRowSelected = (function (prev) {
      return function (r, sel) {
        var a = r.getAttribute('data-eng-row');
        if (!a) return prev ? prev(r, sel) : false;
        var parts = a.split('|');
        return !!(sel && sel.kind === 'engine' && sel.id === parts[0] && (sel.nodes || []).indexOf(parts[1]) !== -1);
      };
    })(hooks.treeRowSelected);
    // a new engine selection shows its section's nodes in the tree
    chain('inspectorBuilt', function () {
      var c = C.current();
      if (c && !document.querySelector('[data-eng-row^="' + S.cssEsc(c.sid) + '|"]')) S.buildTree();
      if (c) {
        var row = document.querySelector('[data-eng-row="' + S.cssEsc(c.sid + '|' + c.ids[0]) + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      }
    });

    window.JeereStudioInspector = { target: target, refresh: refresh, rebuild: rebuild, nodeCss: nodeCss, toHex: toHex, fromHex: fromHex, linearPaint: linearPaint };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
