/*
 * Jeere — quickstyle.js: quick element styles in the simple editor (phone first).
 * Global: window.JeereQuickStyle = { tap(event), wants(node), open(key), close(), isOpen() }.
 *
 * A tap on a button, a title, a text, an image or an icon of the phone preview opens a bottom
 * sheet: colours (the Studio's picker, jcolor.js, made for the finger), corner rounding, size
 * S / M / L, border on / off + colour, bold; for an image, its crop: drag the photo in the preview
 * to reposition, pinch (or the slider) to zoom, a format (1:1, 4:5, 16:9). Everything is written
 * to config.elementStyles (the same contract as the Studio's Design tab, elstyles.js), through the
 * editor's one change path (window.JeereBuilder.quick): undo, autosave and the dashboard follow.
 * The store's own controls (add to cart, menu, links: data-jst-action) and the product cards keep
 * working as before.
 */
(function () {
  'use strict';

  function Q() { return window.JeereBuilder && window.JeereBuilder.quick; }
  function ES() { return window.JeereElStyles; }
  function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var KINDS = { button: 1, text: 1, image: 1, icon: 1, badge: 1 };
  var NAMES = { button: 'Bouton', text: 'Texte', image: 'Image', icon: 'Icône', badge: 'Badge' };

  /* the element under the finger: { key, sid, type, def, node } or null */
  function find(t) {
    var es = ES(), q = Q();
    if (!es || !q || !t || !t.closest) return null;
    var store = q.store();
    if (!store || !store.contains(t)) return null;
    if (t.closest('[data-product-id]')) return null;          // a product card opens the product
    var scope = t.closest('[data-section-id]');
    var sid, type;
    if (scope) { sid = scope.getAttribute('data-section-id'); type = scope.getAttribute('data-section-type'); }
    else {
      scope = t.closest('.jst-header');
      if (!scope) return null;
      sid = '@header'; type = '@header';
    }
    var best = null, node = null;
    es.elementsFor(type).forEach(function (d) {
      if (!d.sel || !KINDS[d.kind]) return;
      var n = null;
      try { n = t.closest(d.sel); } catch (e) { n = null; }
      if (!n || !scope.contains(n) || n === scope) return;
      if (!node || node.contains(n)) { best = d; node = n; }
    });
    if (!best) return null;
    if (node.closest('[data-jst-action]') || node.querySelector('[data-jst-action]')) return null; // the store's own controls
    return { key: es.keyOf(sid, best.key), sid: sid, type: type, def: best, node: node };
  }
  function wants(t) { return !!find(t); }

  /* ---------------------------------------------------------------- the fiche */
  function entry(key) { var c = Q().config(); return c && c.elementStyles && c.elementStyles[key] ? c.elementStyles[key] : null; }
  function get(key, prop) { var e = entry(key); return e && e.base && Object.prototype.hasOwnProperty.call(e.base, prop) ? e.base[prop] : undefined; }
  function set(key, patch, opts) {
    var q = Q(), es = ES(), c = q.config();
    if (!c) return;
    if (!c.elementStyles || typeof c.elementStyles !== 'object') c.elementStyles = {};
    var e = c.elementStyles[key] || (c.elementStyles[key] = {});
    var b = e.base || (e.base = {});
    Object.keys(patch).forEach(function (k) {
      var v = patch[k] == null ? null : es.normProp(k, patch[k]);
      if (v === null) delete b[k]; else b[k] = v;
    });
    if (!Object.keys(b).length) delete e.base;
    if (!Object.keys(e).length) delete c.elementStyles[key];
    if (!Object.keys(c.elementStyles).length) delete c.elementStyles;
    q.applyStyles();
    if (!(opts && opts.live)) q.change();
    paint();
  }
  function live(cur, prop) {
    try {
      var c = getComputedStyle(cur.node);
      if (prop === 'fill') return ES().color.hex(ES().color.parse(c.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 });
      if (prop === 'color') return ES().color.hex(ES().color.parse(c.color) || { r: 0, g: 0, b: 0, a: 1 });
      if (prop === 'radius') return Math.round(parseFloat(c.borderTopLeftRadius) || 0);
      if (prop === 'fontSize') return Math.round(parseFloat(c.fontSize) || 16);
    } catch (e) { /* none */ }
    return null;
  }

  /* ---------------------------------------------------------------- the sheet */
  var sheet = null, cur = null, sub = null;
  var SIZES = {
    S: { pt: 8, pb: 8, pl: 14, pr: 14, fontSize: 12, minH: 34 },
    M: { pt: 12, pb: 12, pl: 22, pr: 22, fontSize: 14, minH: 44 },
    L: { pt: 16, pb: 16, pl: 32, pr: 32, fontSize: 16, minH: 56 }
  };
  var RATIOS = [[null, 'Libre'], [1, '1:1'], [0.8, '4:5'], [1.78, '16:9']];
  var I = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
    button: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8.5 12h7"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12C3 6.38 5.25 4.5 12 4.5C18.75 4.5 21 6.38 21 12C21 17.62 18.75 19.5 12 19.5C5.25 19.5 3 17.62 3 12Z"/><circle cx="9" cy="10" r="1.8"/><path d="M3.6 17.4l5-4.4 3.6 3 3.1-2.7 5 4.3"/></svg>',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    badge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/></svg>'
  };

  function close() {
    if (!sheet) return false;
    if (window.JeereColor) window.JeereColor.close();
    sheet.remove();
    sheet = null; cur = null; sub = null;
    document.documentElement.classList.remove('qs-open');
    var q = Q();
    var store = q && q.store();
    if (store) store.querySelectorAll('.qs-target').forEach(function (n) { n.classList.remove('qs-target'); });
    return true;
  }
  function isOpen() { return !!sheet; }

  function markTarget() {
    var q = Q(), store = q && q.store();
    if (!store || !cur) return;
    store.querySelectorAll('.qs-target').forEach(function (n) { n.classList.remove('qs-target'); });
    var sel = ES().selectorFor(cur.sid, cur.def, null);
    var n = null;
    try { n = store.querySelector(sel); } catch (e) { n = null; }
    if (n) { n.classList.add('qs-target'); cur.node = n; }
  }

  function swatch(v) {
    var c = v ? ES().color.css(v) : null;
    return c ? 'linear-gradient(' + c + ',' + c + '), var(--qs-checker)' : 'var(--qs-checker)';
  }

  function openColor(label, prop, ph) {
    sub = { label: label, prop: prop };
    var body = sheet.querySelector('.qs-body');
    body.innerHTML = '';
    var head = sheet.querySelector('.qs-sub');
    head.hidden = false;
    head.querySelector('span').textContent = label;
    var key = cur.key;
    var box = document.createElement('div');
    body.appendChild(box);
    var store = Q().store();
    window.JeereColor.open({
      container: box, theme: 'light', touch: true, title: label,
      value: get(key, prop === 'fill' ? 'fill' : prop) || ph || '#000000',
      palette: ['accent', 'onAccent', 'text', 'muted', 'bg', 'surface', 'line'].map(function (k) { return { v: '@' + k }; }),
      recents: recents(),
      resolve: function (v) {
        var m = /^@(\w+)(?:\/(\d+))?$/.exec(v || '');
        if (!m) return ES().color.parse(v);
        var raw = store ? getComputedStyle(store).getPropertyValue(ES().TOKENS[m[1]] || '--st-accent').trim() : '';
        var c = ES().color.parse(raw) || { r: 0, g: 0, b: 0, a: 1 };
        if (m[2]) c.a = c.a * Number(m[2]) / 100;
        return c;
      },
      onChange: function (v, isLive) {
        var p = {};
        if (prop === 'fill') { p.fillType = 'solid'; p.fill = v; }
        else if (prop === 'bColor') { p.bColor = v; if (get(key, 'bW') === undefined) { p.bW = 1.5; p.bAlign = 'inside'; } }
        else p[prop] = v;
        set(key, p, { live: isLive });
        if (!isLive) pushRecent(v);
      }
    });
  }
  function recents() { try { return JSON.parse(localStorage.getItem('jeere-quick-colors') || '[]').slice(0, 10); } catch (e) { return []; } }
  function pushRecent(v) {
    if (!v) return;
    try { var l = recents().filter(function (x) { return x !== v; }); l.unshift(v); localStorage.setItem('jeere-quick-colors', JSON.stringify(l.slice(0, 10))); } catch (e) { /* ok */ }
  }

  function rowEl(label, ctl) {
    var r = document.createElement('div');
    r.className = 'qs-row';
    r.innerHTML = '<span class="qs-lab">' + esc(label) + '</span>';
    r.appendChild(ctl);
    return r;
  }
  function seg(options, getV, onPick, aria) {
    var box = document.createElement('div');
    box.className = 'qs-seg';
    box.setAttribute('role', 'group');
    if (aria) box.setAttribute('aria-label', aria);
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = o[1];
      b.setAttribute('data-v', String(o[0]));
      b.addEventListener('click', function () { onPick(getV() === o[0] ? null : o[0]); });
      box.appendChild(b);
    });
    box.paint = function () { var v = getV(); box.querySelectorAll('button').forEach(function (b, i) { var on = options[i][0] === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); };
    return box;
  }
  function range(min, max, getV, onSet, unit, aria) {
    var box = document.createElement('div');
    box.className = 'qs-range';
    var inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min); inp.max = String(max); inp.step = '1';
    inp.setAttribute('aria-label', aria || '');
    var out = document.createElement('output');
    box.appendChild(inp);
    box.appendChild(out);
    inp.addEventListener('input', function () { onSet(Number(inp.value), true); out.textContent = inp.value + unit; });
    inp.addEventListener('change', function () { onSet(Number(inp.value), false); });
    box.paint = function () {
      var v = getV();
      inp.value = String(v);
      out.textContent = Math.round(v) + unit;
      inp.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
    };
    inp.addEventListener('input', function () { inp.style.setProperty('--p', ((Number(inp.value) - min) / (max - min) * 100) + '%'); });
    return box;
  }
  function toggle(getV, onSet, aria) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'qs-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', aria);
    b.innerHTML = '<i></i>';
    b.addEventListener('click', function () { onSet(!getV()); });
    b.paint = function () { var on = !!getV(); b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); };
    return b;
  }
  function colorChip(label, getV, ph, prop) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'qs-chip';
    b.innerHTML = '<i></i><span>' + esc(label) + '</span>';
    b.addEventListener('click', function () { openColor(label, prop, ph()); });
    b.paint = function () { b.querySelector('i').style.background = swatch(getV() || ph()); };
    return b;
  }

  var painters = [];
  /* the template's own size of a text (its override set aside for a moment) */
  function baseFontSize() {
    var c = Q().config();
    var e = c && c.elementStyles && c.elementStyles[cur.key];
    var keep = e && e.base && e.base.fontSize;
    if (keep !== undefined && keep !== null) { delete e.base.fontSize; Q().applyStyles(); }
    markTarget();
    var v = live(cur, 'fontSize') || 16;
    if (keep !== undefined && keep !== null) { e.base.fontSize = keep; Q().applyStyles(); markTarget(); }
    return v;
  }
  function paint() { painters.forEach(function (p) { try { p.paint(); } catch (e) { /* one control */ } }); }

  function buildMain() {
    sub = null;
    painters = [];
    var body = sheet.querySelector('.qs-body');
    sheet.querySelector('.qs-sub').hidden = true;
    body.innerHTML = '';
    var k = cur.def.kind, key = cur.key;
    function add(ctl) { painters.push(ctl); return ctl; }
    if (k === 'button' || k === 'badge' || k === 'icon' || k === 'text') {
      var colors = document.createElement('div');
      colors.className = 'qs-colors';
      if (k === 'button' || k === 'badge') colors.appendChild(add(colorChip('Fond', function () { return get(key, 'fillType') === 'solid' ? get(key, 'fill') : null; }, function () { return live(cur, 'fill'); }, 'fill')));
      colors.appendChild(add(colorChip(k === 'icon' ? 'Couleur' : 'Texte', function () { return get(key, 'color'); }, function () { return live(cur, 'color'); }, 'color')));
      body.appendChild(rowEl('Couleurs', colors));
    }
    if (k === 'button' || k === 'badge' || k === 'image') {
      body.appendChild(rowEl('Arrondi', add(range(0, 48, function () { var v = get(key, 'rTL'); return v === undefined ? (live(cur, 'radius') || 0) : v; },
        function (v, isLive) { set(key, { rTL: v, rTR: v, rBR: v, rBL: v }, { live: isLive }); }, ' px', 'Arrondi des coins'))));
    }
    if (k === 'button') {
      body.appendChild(rowEl('Taille', add(seg([['S', 'S'], ['M', 'M'], ['L', 'L']], function () {
        var fs = get(key, 'fontSize'), mh = get(key, 'minH'), hit = null;
        Object.keys(SIZES).forEach(function (s) { if (SIZES[s].fontSize === fs && SIZES[s].minH === mh) hit = s; });
        return hit;
      }, function (v) { var p = {}; Object.keys(SIZES.M).forEach(function (x) { p[x] = v ? SIZES[v][x] : null; }); set(key, p); }, 'Taille du bouton'))));
    }
    if (k === 'text') {
      var base = baseFontSize();
      body.appendChild(rowEl('Taille', add(seg([[0.85, 'S'], [1, 'M'], [1.2, 'L'], [1.45, 'XL']], function () {
        var v = get(key, 'fontSize');
        if (v === undefined) return 1;
        return [0.85, 1, 1.2, 1.45].filter(function (f) { return Math.round(base * f) === v; })[0] || null;
      }, function (f) { set(key, { fontSize: !f || f === 1 ? null : Math.round(base * f) }); }, 'Taille du texte'))));
      body.appendChild(rowEl('Aligner', add(seg([['left', '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>'], ['center', '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>'], ['right', '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>']],
        function () { return get(key, 'textAlign') || null; }, function (v) { set(key, { textAlign: v }); }, 'Alignement'))));
    }
    if (k === 'button' || k === 'text' || k === 'badge') {
      body.appendChild(rowEl('Gras', add(toggle(function () { var w = get(key, 'fontWeight'); return w !== undefined && w >= 600; }, function (on) { set(key, { fontWeight: on ? 700 : null }); }, 'Gras'))));
    }
    if (k === 'button' || k === 'badge' || k === 'image') {
      var brow = document.createElement('div');
      brow.className = 'qs-inline';
      brow.appendChild(add(toggle(function () { var w = get(key, 'bW'); return w !== undefined && w > 0; }, function (on) {
        set(key, on ? { bW: 1.5, bAlign: 'inside', bColor: get(key, 'bColor') || '@text' } : { bW: null, bColor: null, bAlign: null });
        buildMain();
      }, 'Bordure')));
      if (get(key, 'bW') > 0) brow.appendChild(add(colorChip('Couleur', function () { return get(key, 'bColor'); }, function () { return '#000000'; }, 'bColor')));
      body.appendChild(rowEl('Bordure', brow));
    }
    if (k === 'icon') {
      body.appendChild(rowEl('Taille', add(range(12, 48, function () { var v = get(key, 'iconSize'); return v === undefined ? 20 : v; },
        function (v, isLive) { set(key, { iconSize: v }, { live: isLive }); }, ' px', 'Taille de l’icône'))));
    }
    if (k === 'image') {
      body.appendChild(rowEl('Zoom', add(range(100, 300, function () { var v = get(key, 'zoom'); return v === undefined ? 100 : v; },
        function (v, isLive) { set(key, { zoom: v <= 100 ? null : v }, { live: isLive }); }, ' %', 'Zoom'))));
      body.appendChild(rowEl('Format', add(seg(RATIOS, function () { var r = get(key, 'ratio'); return r === undefined ? null : r; },
        function (v) { set(key, { ratio: v }); }, 'Format de l’image'))));
      var hint = document.createElement('p');
      hint.className = 'qs-hint';
      hint.textContent = 'Glissez la photo dans l’aperçu pour la recadrer, pincez pour zoomer.';
      body.appendChild(hint);
    }
    paint();
  }

  function titleOf(f) {
    var n = NAMES[f.def.kind] || 'Élément';
    if (f.def.kind === 'button') { var tx = f.node ? String(f.node.textContent || '').replace(/\s+/g, ' ').trim() : ''; return n + (tx ? ' · ' + (tx.length > 22 ? tx.slice(0, 21) + '…' : tx) : ''); }
    if (f.def.kind === 'text' || f.def.label === n) return f.def.label;
    return n + ' · ' + f.def.label;
  }
  function openFor(found) {
    if (!window.JeereColor || !ES()) return false;
    close();
    cur = found;
    sheet = document.createElement('div');
    sheet.className = 'qs' + (Q().isMobile() ? '' : ' qs--float');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Style · ' + found.def.label);
    var secName = '';
    try {
      var s = (Q().config().sections || []).filter(function (x) { return x.id === found.sid; })[0];
      var d = window.JEERE_DATA && s ? window.JEERE_DATA.sectionTypes[s.type] : null;
      secName = found.sid === '@header' ? 'En-tête' : (d && d.name) || '';
    } catch (e) { secName = ''; }
    sheet.innerHTML =
      '<div class="qs-grab" aria-hidden="true"></div>' +
      '<div class="qs-head"><span class="qs-ic">' + (I[found.def.kind] || I.text) + '</span><span class="qs-t"><b>' + esc(titleOf(found)) + '</b><small>' + esc(secName) + '</small></span>' +
      '<button type="button" class="qs-x" aria-label="Fermer">' + I.x + '</button></div>' +
      '<div class="qs-sub" hidden><button type="button" class="qs-back" aria-label="Retour">' + I.back + '</button><span></span><button type="button" class="qs-done">OK</button></div>' +
      '<div class="qs-body"></div>' +
      '<div class="qs-foot"><button type="button" class="qs-reset">Réinitialiser</button>' +
      (found.sid !== '@header' ? '<button type="button" class="qs-edit">Modifier le contenu</button>' : '') + '</div>';
    document.body.appendChild(sheet);
    document.documentElement.classList.add('qs-open');
    sheet.querySelector('.qs-x').addEventListener('click', close);
    sheet.querySelector('.qs-back').addEventListener('click', function () { if (window.JeereColor) window.JeereColor.close(); buildMain(); });
    sheet.querySelector('.qs-done').addEventListener('click', function () { if (window.JeereColor) window.JeereColor.close(); buildMain(); });
    sheet.querySelector('.qs-reset').addEventListener('click', function () {
      var c = Q().config();
      if (c && c.elementStyles && c.elementStyles[found.key]) { delete c.elementStyles[found.key].base; if (!Object.keys(c.elementStyles[found.key]).length) delete c.elementStyles[found.key]; if (!Object.keys(c.elementStyles).length) delete c.elementStyles; }
      Q().applyStyles(); Q().change(); buildMain();
      Q().toast('Style du modèle rétabli.');
    });
    var ed = sheet.querySelector('.qs-edit');
    if (ed) ed.addEventListener('click', function () { var t = { kind: 'section', id: found.sid }; close(); Q().editTarget(t); });
    sheet.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (sub) buildMain(); else close(); } });
    markTarget();
    buildMain();
    reveal();
    // the preview re-renders after each change: the target keeps its outline
    var store = Q().store();
    if (store && typeof MutationObserver === 'function') {
      if (!openFor.mo) openFor.mo = new MutationObserver(function () { if (cur) { var had = cur.node && document.contains(cur.node); if (!had) markTarget(); } });
      openFor.mo.disconnect();
      openFor.mo.observe(store, { childList: true });
    }
    return true;
  }

  /* the element stays in sight above the sheet (a phone: the sheet covers the lower half) */
  function reveal() {
    if (!cur || !cur.node || !sheet || !Q().isMobile()) return;
    var r = cur.node.getBoundingClientRect();
    var top = sheet.getBoundingClientRect().top;
    var want = Math.max(150, Math.min(top - r.height - 16, 260));
    var delta = r.top - want;
    if (Math.abs(delta) < 8 && r.bottom <= top) return;
    var sc = cur.node.parentElement;
    while (sc && sc !== document.body) {
      var cs = getComputedStyle(sc);
      if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 4) break;
      sc = sc.parentElement;
    }
    if (sc && sc !== document.body) sc.scrollTop += delta; else window.scrollBy(0, delta);
  }
  function tap(e) {
    if (Date.now() < suppressUntil) return true;
    var f = find(e.target);
    if (!f) { if (sheet && !sheet.contains(e.target)) close(); return false; }
    e.preventDefault();
    if (cur && cur.key === f.key) return true;
    openFor(f);
    return Q().isMobile();  // on a phone the sheet replaces « Modifier » ; on a computer the panel opens too
  }

  /* drag the photo in the preview to reposition it, pinch to zoom (the open image sheet) */
  var pts = {}, gesture = null, suppressUntil = 0;
  document.addEventListener('pointerdown', function (e) {
    if (!cur || cur.def.kind !== 'image') return;
    var q = Q(), store = q && q.store();
    var node = cur.node && document.contains(cur.node) ? cur.node : null;
    if (!node) { markTarget(); node = cur.node; }
    if (!node || !node.contains(e.target)) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var img = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!img || !img.naturalWidth) return;
    e.preventDefault();
    var ids = Object.keys(pts);
    var z = (get(cur.key, 'zoom') || 100) / 100;
    var fw = img.offsetWidth, fh = img.offsetHeight, k = img.offsetWidth ? (img.getBoundingClientRect().width / z) / img.offsetWidth : 1;
    var sc = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    gesture = {
      start: JSON.parse(JSON.stringify(pts)), fx: get(cur.key, 'focusX') === undefined ? 50 : get(cur.key, 'focusX'),
      fy: get(cur.key, 'focusY') === undefined ? 50 : get(cur.key, 'focusY'), z: z * 100,
      sx: fw - z * img.naturalWidth * sc, sy: fh - z * img.naturalHeight * sc, k: k || 1,
      dist: ids.length > 1 ? Math.hypot(pts[ids[0]].x - pts[ids[1]].x, pts[ids[0]].y - pts[ids[1]].y) : 0
    };
    if (store) store.classList.add('qs-dragging');
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (!gesture || !pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length > 1 && gesture.dist) {
      var d = Math.hypot(pts[ids[0]].x - pts[ids[1]].x, pts[ids[0]].y - pts[ids[1]].y);
      set(cur.key, { zoom: clamp(Math.round(gesture.z * d / gesture.dist), 100, 400) }, { live: true });
      return;
    }
    var s0 = gesture.start[e.pointerId];
    if (!s0) return;
    var dx = (e.clientX - s0.x) / gesture.k, dy = (e.clientY - s0.y) / gesture.k;
    var p = {};
    if (Math.abs(gesture.sx) > 0.5) p.focusX = Math.round(clamp(gesture.fx + dx * 100 / gesture.sx, 0, 100) * 10) / 10;
    if (Math.abs(gesture.sy) > 0.5) p.focusY = Math.round(clamp(gesture.fy + dy * 100 / gesture.sy, 0, 100) * 10) / 10;
    if (Object.keys(p).length) { set(cur.key, p, { live: true }); gesture.moved = true; }
  }, true);
  function endGesture(e) {
    if (!pts[e.pointerId]) return;
    delete pts[e.pointerId];
    if (gesture && !Object.keys(pts).length) {
      if (gesture.moved) suppressUntil = Date.now() + 400;
      gesture = null;
      var q = Q(), store = q && q.store();
      if (store) store.classList.remove('qs-dragging');
      if (q) q.change();
    }
  }
  document.addEventListener('pointerup', endGesture, true);
  document.addEventListener('pointercancel', endGesture, true);

  window.JeereQuickStyle = {
    tap: tap, wants: wants, close: close, isOpen: isOpen,
    open: function (key) {
      var es = ES(), q = Q();
      var pk = es && es.parseKey(key);
      if (!pk || !q || !q.store()) return false;
      var type = pk.sid === '@header' ? '@header' : ((q.config().sections || []).filter(function (s) { return s.id === pk.sid; })[0] || {}).type;
      var def = type ? es.elementDef(type, pk.el) : null;
      var node = null;
      try { node = def ? q.store().querySelector(es.selectorFor(pk.sid, def, null)) : null; } catch (e) { node = null; }
      return !!(def && node && openFor({ key: key, sid: pk.sid, type: type, def: def, node: node }));
    },
    current: function () { return cur ? cur.key : null; }
  };
})();
