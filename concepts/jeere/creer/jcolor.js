/*
 * Jeere — jcolor.js: the colour picker of the Studio and of the simple editor (never a native
 * <input type="color">). Global: window.JeereColor = { open(opts), close() }.
 *
 * A popover (anchor) or an inline panel (container, the simple editor's bottom sheet), in the
 * Studio's design language (SPEC-DUALENGINE-UI): 12 px radius, layered shadow, a large
 * saturation / brightness square with a round thumb, hue and alpha sliders over a checkerboard,
 * Hex / RGB / HSL fields, the pipette (EyeDropper API), the store's palette and the recent colours
 * as 20 px rounded chips (28 px to the finger), and a « Dégradé » tab: stops on a bar (drag, click to
 * add, Suppr to remove), linear / radial, an angle dial. Every part works at the keyboard (arrows,
 * Maj ×10). Fixed sizes: nothing jumps while you drag.
 *
 * opts: {
 *   anchor | container, place(el, anchor),   title, theme: 'dark' | 'light', touch,
 *   value: '#RRGGBB' | '#RRGGBBAA' | '@token' | '@token/40',
 *   onChange(value, live),                     solid colour
 *   gradient: { type, angle, stops: [{ c, p }], shape } | null, allowGradient, mode: 'solid' | 'gradient',
 *   onGradient(gradient, live),                the gradient tab
 *   palette: [{ v: '@accent', label }],        resolve(v) → { r, g, b, a } (tokens read from the store)
 *   recents: [values], onClose(lastValue)
 * }
 * Depends on JeereElStyles.color (parse / hex) when present.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : {};

  function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
  function round(n, d) { var p = Math.pow(10, d || 0); return Math.round(n * p) / p; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function C() { return root.JeereElStyles && root.JeereElStyles.color; }
  function parse(v) {
    var c = C();
    if (c) return c.parse(v);
    var m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(v || ''));
    return m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 } : null;
  }
  function h2(n) { var s = clamp(Math.round(n), 0, 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
  function hex(c) { return '#' + h2(c.r) + h2(c.g) + h2(c.b) + ((c.a == null || c.a >= 0.999) ? '' : h2(c.a * 255)); }
  function rgbToHsv(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: mx ? d / mx : 0, v: mx, a: c.a == null ? 1 : c.a };
  }
  function hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }
  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: s * 100, l: l * 100 };
  }
  function cssOf(c) { return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + round(c.a == null ? 1 : c.a, 3) + ')'; }
  var TOKEN_NAMES = { accent: 'Accent', bg: 'Fond', surface: 'Surface', text: 'Texte', muted: 'Atténué', line: 'Ligne', onAccent: 'Sur accent' };
  function tokenName(v) { var m = /^@(\w+)(?:\/(\d+))?$/.exec(v || ''); return m ? (TOKEN_NAMES[m[1]] || m[1]) + (m[2] ? ' ' + m[2] + ' %' : '') : null; }

  var I = {
    drop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.2 2.8l3 3-1.3 1.3-3-3zM9 5.2l-5.6 5.6-.6 2.4 2.4-.6L10.8 7"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
    flip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5"/></svg>',
    minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>'
  };

  var current = null;
  function close() {
    if (!current) return false;
    var p = current;
    current = null;
    try { document.removeEventListener('pointerdown', p.outside, true); } catch (e) { /* ok */ }
    try { if (p.esc) window.removeEventListener('keydown', p.esc, true); } catch (e) { /* ok */ }
    if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    if (p.opts.onClose) { try { p.opts.onClose(p.last); } catch (e) { /* the host */ } }
    return true;
  }

  function open(opts) {
    close();
    opts = opts || {};
    var resolve = opts.resolve || function (v) { return parse(v); };
    var mode = opts.mode === 'gradient' && opts.allowGradient ? 'gradient' : 'solid';
    var grad = opts.gradient && Array.isArray(opts.gradient.stops) && opts.gradient.stops.length >= 2
      ? { type: opts.gradient.type === 'radial' ? 'radial' : 'linear', angle: opts.gradient.angle == null ? 135 : opts.gradient.angle, shape: opts.gradient.shape || 'circle', stops: opts.gradient.stops.map(function (s) { return { c: s.c, p: s.p }; }) }
      : null;
    var stopIdx = 0;
    var token = typeof opts.value === 'string' && opts.value.charAt(0) === '@' ? opts.value : null;
    var hsv = rgbToHsv(resolve(opts.value) || { r: 0, g: 0, b: 0, a: 1 });
    var fmt = 'hex';
    try { fmt = localStorage.getItem('jeere-color-fmt') || 'hex'; } catch (e) { /* ok */ }

    var el = document.createElement('div');
    el.className = 'jc' + (opts.theme === 'light' ? ' jc--light' : '') + (opts.touch ? ' jc--touch' : '') + (opts.container ? ' jc--inline' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', opts.title || 'Couleur');
    el.innerHTML =
      (opts.container ? '' : '<div class="jc-head"><span class="jc-title">' + esc(opts.title || 'Couleur') + '</span><button type="button" class="jc-ib" data-x aria-label="Fermer">' + I.x + '</button></div>') +
      (opts.allowGradient ? '<div class="jc-tabs" role="tablist"><button type="button" role="tab" data-tab="solid">Uni</button><button type="button" role="tab" data-tab="gradient">Dégradé</button></div>' : '') +
      '<div class="jc-grad" hidden><div class="jc-gtop"><div class="jc-seg" data-gtype><button type="button" data-v="linear">Linéaire</button><button type="button" data-v="radial">Radial</button></div>' +
      '<div class="jc-dial" tabindex="0" role="slider" aria-label="Angle du dégradé" aria-valuemin="0" aria-valuemax="360"><i></i></div><input class="jc-in jc-angle" data-angle aria-label="Angle (degrés)"><span class="jc-u">°</span>' +
      '<button type="button" class="jc-ib" data-flip aria-label="Inverser le dégradé">' + I.flip + '</button></div>' +
      '<div class="jc-gbar"><div class="jc-gbar__in"></div></div>' +
      '<div class="jc-gstop"><span class="jc-lab" data-stoplab>Arrêt 1</span><input class="jc-in" data-stoppos aria-label="Position de l’arrêt (%)"><span class="jc-u">%</span><button type="button" class="jc-ib" data-stopdel aria-label="Retirer cet arrêt">' + I.minus + '</button></div></div>' +
      '<div class="jc-sv" tabindex="0" role="slider" aria-label="Saturation et luminosité"><div class="jc-sv__w"></div><div class="jc-sv__b"></div><div class="jc-sv__k"></div></div>' +
      '<div class="jc-bars"><button type="button" class="jc-ib jc-drop" data-drop aria-label="Pipette : prendre une couleur à l’écran" title="Pipette">' + I.drop + '</button>' +
      '<div class="jc-sliders"><div class="jc-hue" tabindex="0" role="slider" aria-label="Teinte" aria-valuemin="0" aria-valuemax="360"><div class="jc-k"></div></div>' +
      '<div class="jc-al" tabindex="0" role="slider" aria-label="Opacité" aria-valuemin="0" aria-valuemax="100"><div class="jc-alg"></div><div class="jc-k"></div></div></div></div>' +
      '<div class="jc-vals"><div class="jc-seg jc-fmt" data-fmt><button type="button" data-v="hex">Hex</button><button type="button" data-v="rgb">RGB</button><button type="button" data-v="hsl">HSL</button></div></div>' +
      '<div class="jc-row"><div class="jc-inputs"></div><span class="jc-aw"><input class="jc-in" data-a aria-label="Opacité (%)"><span class="jc-u">%</span></span></div>' +
      (opts.palette && opts.palette.length ? '<div class="jc-sec">Palette de la boutique</div><div class="jc-chips" data-pal></div>' : '') +
      '<div class="jc-sec" data-rech>Récentes</div><div class="jc-chips" data-rec></div>';
    var host = opts.container || document.body;
    host.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    var sv = q('.jc-sv'), svk = q('.jc-sv__k'), hue = q('.jc-hue'), hk = hue.querySelector('.jc-k'), al = q('.jc-al'), ak = al.querySelector('.jc-k'), alg = q('.jc-alg');
    var inputs = q('.jc-inputs'), aIn = q('[data-a]');
    var p = { el: el, opts: opts, last: opts.value };

    function cur() { var c = hsvToRgb(hsv.h, hsv.s, hsv.v); c.a = hsv.a; return c; }
    function emit(live) {
      var hx = hex(cur());
      token = null;
      if (mode === 'gradient' && grad) {
        grad.stops[stopIdx].c = hx;
        p.last = grad;
        if (opts.onGradient) opts.onGradient(cloneG(), live);
      } else {
        p.last = hx;
        if (opts.onChange) opts.onChange(hx, live);
      }
      paint();
    }
    function cloneG() { return { type: grad.type, angle: grad.angle, shape: grad.shape, stops: grad.stops.map(function (s) { return { c: s.c, p: s.p }; }) }; }
    function setFromValue(v) { var c = resolve(v); if (c) { var a = c.a; hsv = rgbToHsv(c); hsv.a = a; } }

    function paintInputs() {
      if (inputs.contains(document.activeElement)) return;
      var c = cur();
      var f;
      if (fmt === 'hex') f = [['hex', token && mode === 'solid' ? tokenName(token) : hex({ r: c.r, g: c.g, b: c.b }).slice(1), 'Hex']];
      else if (fmt === 'rgb') f = [['r', Math.round(c.r), 'R'], ['g', Math.round(c.g), 'V'], ['b', Math.round(c.b), 'B']];
      else { var hl = rgbToHsl(c); f = [['h', Math.round(hl.h), 'T'], ['s', Math.round(hl.s), 'S'], ['l', Math.round(hl.l), 'L']]; }
      if (inputs.children.length !== f.length || inputs.getAttribute('data-fmt') !== fmt) {
        inputs.innerHTML = '';
        inputs.setAttribute('data-fmt', fmt);
        f.forEach(function (x) {
          var w = document.createElement('label');
          w.className = 'jc-field' + (x[0] === 'hex' ? ' is-hex' : '');
          w.innerHTML = '<span>' + esc(x[2]) + '</span><input class="jc-in" data-k="' + x[0] + '" aria-label="' + esc(x[2]) + '">';
          inputs.appendChild(w);
          var i = w.querySelector('input');
          i.addEventListener('keydown', function (e) {
if (e.key === 'Escape') return;             if (e.key === 'Enter') { e.preventDefault(); applyInputs(); }
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && x[0] !== 'hex') {
              e.preventDefault();
              i.value = String((parseFloat(i.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
              applyInputs();
            }
            e.stopPropagation();
          });
          i.addEventListener('change', applyInputs);
        });
      }
      f.forEach(function (x) { var i = inputs.querySelector('[data-k="' + x[0] + '"]'); if (i && document.activeElement !== i) i.value = String(x[1]); });
    }
    function applyInputs() {
      var g = function (k) { var i = inputs.querySelector('[data-k="' + k + '"]'); return i ? i.value.trim() : ''; };
      var c = null;
      if (fmt === 'hex') { var h = g('hex'); c = parse(h.charAt(0) === '#' ? h : '#' + h); }
      else if (fmt === 'rgb') c = parse('rgb(' + ['r', 'g', 'b'].map(function (k) { return clamp(parseFloat(g(k)) || 0, 0, 255); }).join(',') + ')');
      else c = parse('hsl(' + (parseFloat(g('h')) || 0) + ',' + clamp(parseFloat(g('s')) || 0, 0, 100) + '%,' + clamp(parseFloat(g('l')) || 0, 0, 100) + '%)');
      if (!c) { inputs.innerHTML = ''; paintInputs(); return; }
      var a = hsv.a;
      hsv = rgbToHsv(c);
      hsv.a = a;
      emit(false);
    }
    function paint() {
      var pure = hsvToRgb(hsv.h, 1, 1);
      sv.style.backgroundColor = 'rgb(' + Math.round(pure.r) + ',' + Math.round(pure.g) + ',' + Math.round(pure.b) + ')';
      svk.style.left = (hsv.s * 100) + '%';
      svk.style.top = ((1 - hsv.v) * 100) + '%';
      var c = cur();
      var solid = 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
      svk.style.backgroundColor = solid;
      hk.style.left = (hsv.h / 360 * 100) + '%';
      ak.style.left = (hsv.a * 100) + '%';
      alg.style.background = 'linear-gradient(90deg, rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',0), ' + solid + ')';
      sv.setAttribute('aria-valuetext', 'Saturation ' + Math.round(hsv.s * 100) + ' %, luminosité ' + Math.round(hsv.v * 100) + ' %');
      hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
      al.setAttribute('aria-valuenow', String(Math.round(hsv.a * 100)));
      if (document.activeElement !== aIn) aIn.value = String(Math.round(hsv.a * 100));
      paintInputs();
      el.querySelectorAll('[data-tok]').forEach(function (b) { b.classList.toggle('is-on', mode === 'solid' && !!token && token.split('/')[0] === b.getAttribute('data-tok')); });
      el.querySelectorAll('[data-fmt] button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-v') === fmt); });
      if (opts.allowGradient) el.querySelectorAll('[data-tab]').forEach(function (b) { var on = b.getAttribute('data-tab') === mode; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
      var gbox = q('.jc-grad');
      gbox.hidden = mode !== 'gradient' || !grad;
      if (mode === 'gradient' && grad) paintGrad();
    }
    function stopCss(s) { var c = resolve(s.c); return c ? cssOf(c) : '#000'; }
    function paintGrad() {
      var bar = q('.jc-gbar'), barIn = q('.jc-gbar__in');
      barIn.style.background = 'linear-gradient(90deg, ' + grad.stops.map(function (s) { return stopCss(s) + ' ' + s.p + '%'; }).join(', ') + '), var(--jc-checker)';
      var hs = bar.querySelectorAll('.jc-stop');
      if (hs.length !== grad.stops.length) {
        hs.forEach(function (h) { h.remove(); });
        grad.stops.forEach(function (s, i) {
          var h = document.createElement('button');
          h.type = 'button';
          h.className = 'jc-stop';
          h.setAttribute('aria-label', 'Arrêt ' + (i + 1));
          h.addEventListener('pointerdown', function (e) { stopDrag(e, h); });
          h.addEventListener('keydown', function (e) {
            var k = Array.prototype.indexOf.call(bar.querySelectorAll('.jc-stop'), h);
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              grad.stops[k].p = clamp(grad.stops[k].p + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, 100);
              sortStops(k);
              gEmit(false);
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && grad.stops.length > 2) { e.preventDefault(); removeStop(k); }
            e.stopPropagation();
          });
          h.addEventListener('focus', function () { selectStop(Array.prototype.indexOf.call(bar.querySelectorAll('.jc-stop'), h)); });
          bar.appendChild(h);
        });
        hs = bar.querySelectorAll('.jc-stop');
      }
      hs.forEach(function (h, i) {
        h.style.left = grad.stops[i].p + '%';
        h.style.setProperty('--c', stopCss(grad.stops[i]));
        h.classList.toggle('is-on', i === stopIdx);
      });
      el.querySelectorAll('[data-gtype] button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-v') === grad.type); });
      var dial = q('.jc-dial');
      dial.querySelector('i').style.transform = 'rotate(' + grad.angle + 'deg)';
      dial.setAttribute('aria-valuenow', String(Math.round(grad.angle)));
      dial.classList.toggle('is-off', grad.type !== 'linear');
      var ang = q('[data-angle]');
      if (document.activeElement !== ang) ang.value = String(Math.round(grad.angle));
      ang.disabled = grad.type !== 'linear';
      q('[data-stoplab]').textContent = 'Arrêt ' + (stopIdx + 1);
      var sp = q('[data-stoppos]');
      if (document.activeElement !== sp) sp.value = String(round(grad.stops[stopIdx].p, 1));
      q('[data-stopdel]').disabled = grad.stops.length <= 2;
    }
    function gEmit(live) { p.last = grad; if (opts.onGradient) opts.onGradient(cloneG(), live); paint(); }
    function selectStop(i) { stopIdx = clamp(i, 0, grad.stops.length - 1); setFromValue(grad.stops[stopIdx].c); paint(); }
    function sortStops(keep) {
      var me = grad.stops[keep];
      grad.stops.sort(function (a, b) { return a.p - b.p; });
      stopIdx = grad.stops.indexOf(me);
    }
    function removeStop(i) { grad.stops.splice(i, 1); stopIdx = 0; q('.jc-gbar').querySelectorAll('.jc-stop').forEach(function (h) { h.remove(); }); setFromValue(grad.stops[0].c); gEmit(false); }
    function stopDrag(e, h) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var bar = q('.jc-gbar');
      var i = Array.prototype.indexOf.call(bar.querySelectorAll('.jc-stop'), h);
      selectStop(i);
      try { h.focus({ preventScroll: true }); } catch (err) { /* ok */ }
      var raf = 0, last = e;
      function mv(ev) {
        last = ev;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = bar.getBoundingClientRect();
          grad.stops[stopIdx].p = round(clamp((last.clientX - r.left) / r.width * 100, 0, 100), 1);
          sortStops(stopIdx);
          gEmit(true);
        });
      }
      function up() { window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); gEmit(false); }
      window.addEventListener('pointermove', mv, true);
      window.addEventListener('pointerup', up, true);
    }
    q('.jc-gbar__in').addEventListener('pointerdown', function (e) {
      if (!grad || grad.stops.length >= 8) return;
      var r = q('.jc-gbar').getBoundingClientRect();
      var pos = round(clamp((e.clientX - r.left) / r.width * 100, 0, 100), 1);
      var near = grad.stops.reduce(function (a, s) { return Math.abs(s.p - pos) < Math.abs(a.p - pos) ? s : a; }, grad.stops[0]);
      var ns = { c: near.c, p: pos };
      grad.stops.push(ns);
      grad.stops.sort(function (a, b) { return a.p - b.p; });
      stopIdx = grad.stops.indexOf(ns);
      q('.jc-gbar').querySelectorAll('.jc-stop').forEach(function (h) { h.remove(); });
      gEmit(false);
    });
    el.querySelectorAll('[data-gtype] button').forEach(function (b) { b.addEventListener('click', function () { grad.type = b.getAttribute('data-v'); gEmit(false); }); });
    q('[data-flip]').addEventListener('click', function () { grad.stops = grad.stops.map(function (s) { return { c: s.c, p: 100 - s.p }; }).reverse(); q('.jc-gbar').querySelectorAll('.jc-stop').forEach(function (h) { h.remove(); }); gEmit(false); });
    q('[data-angle]').addEventListener('keydown', function (e) {
if (e.key === 'Escape') return;       if (e.key === 'Enter') { e.preventDefault(); grad.angle = ((parseFloat(this.value) || 0) % 360 + 360) % 360; gEmit(false); }
      e.stopPropagation();
    });
    q('[data-angle]').addEventListener('change', function () { grad.angle = ((parseFloat(this.value) || 0) % 360 + 360) % 360; gEmit(false); });
    q('[data-stoppos]').addEventListener('change', function () { grad.stops[stopIdx].p = clamp(parseFloat(this.value) || 0, 0, 100); sortStops(stopIdx); gEmit(false); });
    q('[data-stoppos]').addEventListener('keydown', function (e) { if (e.key === 'Escape') return; e.stopPropagation(); if (e.key === 'Enter') this.blur(); });
    q('[data-stopdel]').addEventListener('click', function () { if (grad.stops.length > 2) removeStop(stopIdx); });
    var dial = q('.jc-dial');
    function dialAt(ev) {
      var r = dial.getBoundingClientRect();
      var a = Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
      a = (a + 360) % 360;
      if (ev.shiftKey) a = Math.round(a / 15) * 15 % 360;
      grad.angle = Math.round(a);
    }
    dial.addEventListener('pointerdown', function (e) {
      if (!grad || grad.type !== 'linear') return;
      e.preventDefault();
      dialAt(e); gEmit(true);
      function mv(ev) { dialAt(ev); gEmit(true); }
      function up() { window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); gEmit(false); }
      window.addEventListener('pointermove', mv, true);
      window.addEventListener('pointerup', up, true);
    });
    dial.addEventListener('keydown', function (e) {
      if (!grad) return;
      var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      grad.angle = ((grad.angle + d * (e.shiftKey ? 15 : 1)) % 360 + 360) % 360;
      gEmit(false);
    });

    // drags: the square, the hue, the alpha
    function drag(area, fn) {
      area.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        try { area.focus({ preventScroll: true }); } catch (err) { /* ok */ }
        var raf = 0, last = e;
        function go(live) { var r = area.getBoundingClientRect(); fn(clamp((last.clientX - r.left) / r.width, 0, 1), clamp((last.clientY - r.top) / r.height, 0, 1)); emit(live); }
        go(true);
        function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; go(true); }); }
        function up() { window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); if (raf) cancelAnimationFrame(raf); go(false); }
        window.addEventListener('pointermove', mv, true);
        window.addEventListener('pointerup', up, true);
      });
    }
    drag(sv, function (x, y) { hsv.s = x; hsv.v = 1 - y; });
    drag(hue, function (x) { hsv.h = Math.min(359.9, x * 360); });
    drag(al, function (x) { hsv.a = round(x, 2); });
    function keys(area, fn) {
      area.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 10 : 1;
        var k = e.key;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(k) === -1) return;
        e.preventDefault();
        e.stopPropagation();
        fn(k, step);
        emit(false);
      });
    }
    keys(sv, function (k, s) {
      if (k === 'ArrowLeft') hsv.s = clamp(hsv.s - s / 100, 0, 1);
      if (k === 'ArrowRight') hsv.s = clamp(hsv.s + s / 100, 0, 1);
      if (k === 'ArrowUp') hsv.v = clamp(hsv.v + s / 100, 0, 1);
      if (k === 'ArrowDown') hsv.v = clamp(hsv.v - s / 100, 0, 1);
    });
    keys(hue, function (k, s) { hsv.h = clamp(hsv.h + (k === 'ArrowRight' || k === 'ArrowUp' ? s : -s), 0, 359.9); });
    keys(al, function (k, s) { hsv.a = clamp(round(hsv.a + (k === 'ArrowRight' || k === 'ArrowUp' ? s : -s) / 100, 2), 0, 1); });

    el.querySelectorAll('[data-fmt] button').forEach(function (b) {
      b.addEventListener('click', function () { fmt = b.getAttribute('data-v'); try { localStorage.setItem('jeere-color-fmt', fmt); } catch (e) { /* ok */ } inputs.innerHTML = ''; paint(); });
    });
    aIn.addEventListener('keydown', function (e) {
if (e.key === 'Escape') return;       if (e.key === 'Enter') { e.preventDefault(); hsv.a = clamp((parseFloat(aIn.value) || 0) / 100, 0, 1); emit(false); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); hsv.a = clamp(round(hsv.a + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01), 2), 0, 1); emit(false); }
      e.stopPropagation();
    });
    aIn.addEventListener('change', function () { var n = clamp((parseFloat(aIn.value) || 0) / 100, 0, 1); if (Math.abs(n - hsv.a) > 0.001) { hsv.a = n; emit(false); } });
    var dropB = q('[data-drop]');
    if (typeof root.EyeDropper !== 'function') dropB.classList.add('is-na');
    dropB.addEventListener('click', function () {
      if (typeof root.EyeDropper !== 'function') { if (opts.toast) opts.toast('La pipette n’existe pas dans ce navigateur (Chrome ou Edge sur ordinateur).'); return; }
      try {
        new root.EyeDropper().open().then(function (r) {
          var c = parse(r && r.sRGBHex);
          if (!c) return;
          var a = hsv.a;
          hsv = rgbToHsv(c);
          hsv.a = a;
          emit(false);
        }, function () { /* cancelled */ });
      } catch (e) { /* blocked */ }
    });
    if (opts.allowGradient) el.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-tab');
        if (m === mode) return;
        mode = m;
        if (mode === 'gradient') {
          if (!grad) {
            var base = hex(cur());
            grad = { type: 'linear', angle: 135, shape: 'circle', stops: [{ c: base, p: 0 }, { c: '#000000', p: 100 }] };
          }
          stopIdx = 0;
          setFromValue(grad.stops[0].c);
          gEmit(false);
        } else {
          setFromValue(grad ? grad.stops[stopIdx].c : opts.value);
          emit(false);
        }
      });
    });
    // chips: the store's palette (live tokens) and the recent colours
    var pal = q('[data-pal]');
    if (pal) (opts.palette || []).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jc-chip';
      b.setAttribute('data-tok', t.v);
      var c = resolve(t.v);
      b.style.background = c ? cssOf(c) : '#000';
      b.title = (t.label || tokenName(t.v) || t.v) + ' — suit la palette';
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', function () {
        var c2 = resolve(t.v);
        if (c2) { var a = hsv.a; hsv = rgbToHsv(c2); hsv.a = a; }
        if (mode === 'gradient' && grad) { grad.stops[stopIdx].c = t.v; gEmit(false); return; }
        var A = Math.round(hsv.a * 100);
        token = t.v + (A < 100 ? '/' + A : '');
        p.last = token;
        if (opts.onChange) opts.onChange(token, false);
        paint();
      });
      pal.appendChild(b);
    });
    var rec = q('[data-rec]');
    var rl = (opts.recents || []).slice(0, 14);
    if (!rl.length) { q('[data-rech]').hidden = true; rec.hidden = true; }
    rl.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jc-chip';
      var c = resolve(v);
      b.style.background = c ? 'linear-gradient(' + cssOf(c) + ',' + cssOf(c) + '), var(--jc-checker)' : '#000';
      b.title = tokenName(v) || v;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', function () {
        setFromValue(v);
        if (mode === 'solid' && v.charAt(0) === '@') { token = v; p.last = v; if (opts.onChange) opts.onChange(v, false); paint(); return; }
        emit(false);
      });
      rec.appendChild(b);
    });
    var xb = q('[data-x]');
    if (xb) xb.addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !opts.container) { e.preventDefault(); e.stopPropagation(); close(); } });

    if (mode === 'gradient' && grad) setFromValue(grad.stops[0].c);
    paint();
    if (!opts.container) {
      if (opts.place) opts.place(el, opts.anchor);
      else if (opts.anchor) {
        var r = opts.anchor.getBoundingClientRect();
        el.style.left = clamp(r.left, 8, window.innerWidth - el.offsetWidth - 8) + 'px';
        el.style.top = clamp(r.bottom + 8, 8, window.innerHeight - el.offsetHeight - 8) + 'px';
      }
      p.outside = function (e) {
        if (el.contains(e.target) || (opts.anchor && (e.target === opts.anchor || opts.anchor.contains(e.target)))) return;
        close();
      };
      document.addEventListener('pointerdown', p.outside, true);
      // Échap closes the picker first, whatever has the focus (a drawer's own Échap may run too)
      p.esc = function (e) { if (e.key === 'Escape' && current === p) { e.preventDefault(); close(); } };
      window.addEventListener('keydown', p.esc, true);
    }
    current = p;
    return { el: el, close: close, isOpen: function () { return current === p; } };
  }

  root.JeereColor = { open: open, close: close, isOpen: function () { return !!current; } };
})();
