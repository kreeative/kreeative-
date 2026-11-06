/* Jeere Studio — the « Design » tab: a Framer-level inspector for every element of the store.
 *
 * Loaded after studio.js, studio-power.js and studio-toolbar.js; built on the studio's bridge
 * (window.JeereStudio._internals) and on ../creer/elstyles.js (window.JeereElStyles: the element
 * registry, the property whitelist, the cascade and the CSS generator). Everything it writes goes
 * to config.elementStyles through the ONE undo history (commit, coalesced per property, with the
 * styleOnly fast path: no re-render, only the scoped <style> of each artboard — 60 fps scrubbing).
 *
 *   - Target: the selection (a section, a sub-element of it — title, button, image, card… —, a
 *     product card (all cards or this one), the header or the footer) → one key « s2/button ».
 *   - Breakpoints: Toutes / Ordinateur / Tablette / Téléphone at the top. On a narrower one, an
 *     edit is an override: a blue dot next to the property; click it to go back to the wider value.
 *   - States: Normal / Survol / Pressé (/ Focus): an edit goes into the state; the state is shown
 *     on the artboards while its tab is open; transition duration + easing (incl. spring, bounce).
 *   - Groups: Disposition, Rayon, Remplissage, Bordure, Ombre, Effets, Typographie, Image, CSS.
 *   - Fields: scrub the label (Shift ×10, Alt ×0.1), ↑ ↓ (±1, Shift ±10, Alt ±0.1), expressions
 *     (« 24*2 », « 100-8 »), Entrée valide, Échap annule. Placeholders show the live value.
 *   - Colour picker: HSV square, hue, alpha, HEX / RGB / HSL, pipette (EyeDropper), the store's
 *     palette (as live tokens) and the recent colours.
 *   - Canvas: padding tinted while you hover a padding field or the padding of the selection,
 *     corner handles that drag the radius, live in every artboard.
 *   - Ctrl Alt C / Ctrl Alt V: copy / paste the style; « Réinitialiser ».
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    var ES = window.JeereElStyles;
    var panel = document.getElementById('inspectorDesign');
    if (!S || !ES || !panel) return;
    var D = S.D;
    var esc = S.esc, ce = S.ce, clamp = S.clamp, toast = S.toast, hooks = S.hooks, clone = S.clone;

    function $(id) { return document.getElementById(id); }
    function state() { return S.state(); }
    function ui() { return S.ui(); }
    function cfg() { return state().config; }
    function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }

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

    /* ================================================================ icons (16 × 16, 1.25 stroke) */

    function svg(d, extra) { return '<svg viewBox="0 0 16 16" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>'; }
    var IC = {
      all: svg('<rect x="2" y="3.5" width="8" height="6" rx="1"/><rect x="9" y="6.5" width="5" height="7" rx="1"/><path d="M4.5 12.5h3"/>'),
      desktop: svg('<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 13.5h4M8 11v2.5"/>'),
      tablet: svg('<rect x="3.5" y="2" width="9" height="12" rx="1.5"/><path d="M7.2 12h1.6"/>'),
      phone: svg('<rect x="5" y="2" width="6" height="12" rx="1.5"/><path d="M7.4 12h1.2"/>'),
      copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.2V3a1 1 0 00-1-1H3.5a1 1 0 00-1 1v6a1 1 0 001 1h.3"/>'),
      paste: svg('<rect x="3" y="3" width="10" height="11" rx="1.5"/><path d="M6 3V2h4v1M5.5 7h5M5.5 9.5h5M5.5 12h3"/>'),
      reset: svg('<path d="M3 8a5 5 0 105-5 5 5 0 00-3.6 1.5L3 6"/><path d="M3 2.5V6h3.5"/>'),
      link: svg('<path d="M6.5 9.5l3-3M7 4.6l1-1a2.6 2.6 0 013.7 3.7l-1 1M9 11.4l-1 1a2.6 2.6 0 01-3.7-3.7l1-1"/>'),
      unlink: svg('<path d="M7 4.6l1-1a2.6 2.6 0 013.7 3.7l-1 1M9 11.4l-1 1a2.6 2.6 0 01-3.7-3.7l1-1M2.5 2.5l2 2M11.5 11.5l2 2"/>'),
      plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
      minus: svg('<path d="M3.5 8h9"/>'),
      up: svg('<path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/>'),
      down: svg('<path d="M8 3.5v9M4.5 9L8 12.5 11.5 9"/>'),
      eye: svg('<path d="M1.8 8S4 3.9 8 3.9 14.2 8 14.2 8 12 12.1 8 12.1 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>'),
      drop: svg('<path d="M10.2 2.8l3 3-1.3 1.3-3-3zM9 5.2l-5.6 5.6-.6 2.4 2.4-.6L10.8 7"/>'),
      caret: svg('<path d="M4.5 6.5L8 10l3.5-3.5"/>'),
      x: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
      alL: svg('<path d="M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7"/>'),
      alC: svg('<path d="M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7"/>'),
      alR: svg('<path d="M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7"/>'),
      alJ: svg('<path d="M2.5 4h11M2.5 7h11M2.5 10h11M2.5 13h11"/>'),
      col: svg('<rect x="4" y="2.5" width="8" height="4" rx="1"/><rect x="4" y="9.5" width="8" height="4" rx="1"/>'),
      row: svg('<rect x="2.5" y="4" width="4" height="8" rx="1"/><rect x="9.5" y="4" width="4" height="8" rx="1"/>'),
      free: svg('<path d="M3 3h3M3 3v3M13 13h-3M13 13v-3M13 3h-3M13 3v3M3 13h3M3 13v-3"/>'),
      inset: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor" stroke="none" opacity=".45"/>'),
      blur: svg('<circle cx="8" cy="8" r="5.5" stroke-dasharray="1.6 1.6"/><circle cx="8" cy="8" r="2.5"/>'),
      rot: svg('<path d="M12.5 8A4.5 4.5 0 118 3.5h2.5"/><path d="M9 1.8l1.7 1.7L9 5.2"/>'),
      scale: svg('<path d="M9.5 2.5h4v4M13.5 2.5L8.5 7.5"/><rect x="2.5" y="8.5" width="5" height="5" rx="1"/>'),
      grip: svg('<circle cx="6" cy="4" r=".8"/><circle cx="10" cy="4" r=".8"/><circle cx="6" cy="8" r=".8"/><circle cx="10" cy="8" r=".8"/><circle cx="6" cy="12" r=".8"/><circle cx="10" cy="12" r=".8"/>'),
      flip: svg('<path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5"/>'),
      image: svg('<rect x="2" y="2.8" width="12" height="10.4" rx="1.6"/><circle cx="6" cy="6.6" r="1.2"/><path d="M2.4 11.6l3.4-3 2.4 2 2.1-1.8 3.3 2.9"/>'),
      upload: svg('<path d="M8 10.5V3M5 6l3-3 3 3M3 10.5v2a1 1 0 001 1h8a1 1 0 001-1v-2"/>'),
      italic: svg('<path d="M7 3h5M4 13h5M9.5 3l-3 10"/>'),
      ul: svg('<path d="M4.5 3v4.5a3.5 3.5 0 007 0V3M3.5 13.5h9"/>'),
      strike: svg('<path d="M2.5 8h11M11 4.6C10.4 3.6 9.3 3 8 3 6.3 3 5 4 5 5.3c0 .8.4 1.4 1.1 1.8M5 11.2c.6 1.1 1.7 1.8 3.1 1.8 1.8 0 3.1-1 3.1-2.4 0-.6-.2-1.1-.6-1.5"/>')
    };

    /* ================================================================ design-tab state (not the fiche) */

    var ds = {
      bp: 'base',                // 'base' | 'desktop' | 'tablet' | 'phone'
      st: 'normal',              // 'normal' | 'hover' | 'pressed' | 'focus'
      cardScope: 'all',          // product cards: 'all' | 'one'
      scrubbing: false,
      links: {},                 // linked quads (padding, margin, radius, border) per key
      gStop: 0,                  // the gradient stop being edited
      shadowOpen: -1,            // the shadow row open for editing
      padHover: false            // tint the padding on the canvas
    };
    var BP_LABEL = { base: 'Toutes les tailles', desktop: 'Ordinateur', tablet: 'Tablette', phone: 'Téléphone' };
    var BP_HINT = {
      base: 'Les réglages valent pour tous les écrans.',
      desktop: 'Seulement sur ordinateur (1024 px et plus).',
      tablet: 'Tablette et téléphone (moins de 1024 px) : vos valeurs en bleu remplacent celles de « Toutes ».',
      phone: 'Seulement sur téléphone : vos valeurs en bleu remplacent celles de la tablette et de « Toutes ».'
    };
    var BP_AB = { desktop: ['desktop', '1440'], tablet: ['768'], phone: ['phone', '360'] };
    var ST_LABEL = { normal: 'Normal', hover: 'Survol', pressed: 'Pressé', focus: 'Focus' };
    var GROUP_TITLES = { layout: 'Disposition', radius: 'Rayon', fill: 'Remplissage', border: 'Bordure', shadow: 'Ombre',
      effects: 'Effets', typography: 'Typographie', text: 'Texte', image: 'Image et recadrage', css: 'CSS', quick: 'Essentiel', content: 'Contenu',
      icon: 'Icône', iconBox: 'Fond de l’icône', btnIcon: 'Icône du bouton', cardFields: 'Champs de la carte', section: 'Section',
      structure: 'Structure de la page', pageSettings: 'Réglages de la page', seo: 'Référencement', stats: 'En chiffres' };
    /* each element type, its own panel: the groups in the order she needs them */
    var ORDER = {
      button: ['quick', 'content', 'layout', 'radius', 'fill', 'border', 'typography', 'btnIcon', 'shadow', 'effects'],
      text: ['quick', 'content', 'typography', 'layout', 'fill', 'radius', 'border', 'shadow', 'effects'],
      badge: ['quick', 'typography', 'layout', 'radius', 'fill', 'border', 'shadow', 'effects'],
      image: ['image', 'content', 'layout', 'radius', 'border', 'shadow', 'effects'],
      icon: ['icon', 'iconBox', 'layout', 'border', 'shadow', 'effects'],
      card: ['cardFields', 'layout', 'radius', 'fill', 'border', 'shadow', 'effects'],
      container: ['layout', 'radius', 'fill', 'border', 'shadow', 'effects'],
      section: ['section', 'layout', 'fill', 'text', 'radius', 'border', 'shadow', 'effects']
    };

    function openGroups() {
      var u = ui();
      if (!u.dzGroups || typeof u.dzGroups !== 'object') u.dzGroups = {};
      return u.dzGroups;
    }

    /* ================================================================ the target of the selection */

    function firstProductsSectionFor(pid) {
      var key = S.primaryKey();
      var rootEl = S.roots()[key];
      var card = rootEl && rootEl.querySelector('[data-product-id="' + S.cssEsc(pid) + '"]');
      var sec = card && card.closest('[data-section-id]');
      if (sec && S.sectionById(sec.getAttribute('data-section-id'))) return S.sectionById(sec.getAttribute('data-section-id'));
      return S.sections().filter(function (s) { return s.type === 'products'; })[0] || null;
    }

    function target() {
      var sel = state().sel;
      if (!sel || sel.kind === 'page') return pageTarget();
      if (S.isMulti(sel)) return null;
      var t = null;
      if (sel.kind === 'section') {
        var s = S.sectionById(sel.id);
        if (!s) return null;
        var els = ES.elementsFor(s.type);
        var key = sel.el || null;
        if (!key && sel.field) { var byField = els.filter(function (d) { return d.field === sel.field; })[0]; key = byField ? byField.key : null; }
        var def = key ? ES.elementDef(s.type, key) : null;
        if (!def) { key = 'section'; def = ES.elementDef(s.type, 'section'); }
        t = { sid: s.id, type: s.type, el: key, item: null, def: def, scopeName: S.sectionName(s) };
      } else if (sel.kind === 'product') {
        var p = S.productById(sel.id);
        var sec = p ? firstProductsSectionFor(p.id) : null;
        if (!sec) return null;
        t = { sid: sec.id, type: 'products', el: 'card', item: ds.cardScope === 'one' ? p.id : null, def: ES.elementDef('products', 'card'),
          scopeName: S.sectionName(sec), product: p };
      } else if (sel.kind === 'chrome') {
        var ck = sel.el || (sel.id === '@footer' ? 'footer' : 'header');
        var cdef = ES.elementDef(sel.id, ck);
        if (!cdef) return null;
        t = { sid: sel.id, type: sel.id, el: ck, item: null, def: cdef, scopeName: S.chromeName(sel.id) };
      }
      if (!t || !t.def) return null;
      t.key = ES.keyOf(t.sid, t.el, t.item);
      t.kind = ES.KINDS[t.def.kind] || ES.KINDS.container;
      return t;
    }

    function entryOf(t, c) {
      var es = (c || cfg()).elementStyles;
      return es && t && es[t.key] ? es[t.key] : null;
    }
    function layerName() { return ds.st !== 'normal' ? ds.st : ds.bp; }
    function getV(t, prop) {
      return ES.resolve(entryOf(t), prop, ds.bp, ds.st !== 'normal' ? ds.st : null);
    }
    function val(t, prop) { return getV(t, prop).value; }

    /* the one way to write: sanitized values into the current layer, through the history */
    function setProps(t, patch, label, co, opts) {
      opts = opts || {};
      var L = opts.layer || layerName();
      S.commit(label || 'Design modifié', function (c) {
        var es = c.elementStyles && typeof c.elementStyles === 'object' ? c.elementStyles : (c.elementStyles = {});
        var e = es[t.key] && typeof es[t.key] === 'object' ? es[t.key] : (es[t.key] = {});
        var layer = e[L] && typeof e[L] === 'object' ? e[L] : (e[L] = {});
        Object.keys(patch).forEach(function (k) {
          var v = patch[k];
          if (v === undefined || v === null) { delete layer[k]; return; }
          if (k === 'tDur' || k === 'tEase') { // transitions live on base
            var b = e.base || (e.base = {});
            var nv = ES.normProp(k, v);
            if (nv === null) delete b[k]; else b[k] = nv;
            return;
          }
          var n = ES.normProp(k, v);
          if (n === null) delete layer[k]; else layer[k] = n;
        });
        tidy(c, t.key);
      }, { styleOnly: true, coalesce: co ? 'es:' + t.key + ':' + L + ':' + co : null });
      if (!opts.noRefresh) refresh();
    }
    function tidy(c, key) {
      var es = c.elementStyles;
      if (!es) return;
      var e = es[key];
      if (e) {
        Object.keys(e).forEach(function (L) { if (!e[L] || typeof e[L] !== 'object' || !Object.keys(e[L]).length) delete e[L]; });
        if (!Object.keys(e).length) delete es[key];
      }
      if (!Object.keys(es).length) delete c.elementStyles;
    }
    function clearLayer(t, L, label) {
      S.commit(label, function (c) {
        var es = c.elementStyles;
        if (!es || !es[t.key]) return;
        if (L === '*') delete es[t.key]; else delete es[t.key][L];
        tidy(c, t.key);
      }, { styleOnly: true });
      render();
    }

    /* ================================================================ live element (placeholders, overlays) */

    function bpArtboardKeys(bp) {
      var on = S.activePresets().map(function (p) { return p.key; });
      if (bp === 'base') return on;
      return (BP_AB[bp] || []).filter(function (k) { return on.indexOf(k) !== -1; });
    }
    function liveRootKey() {
      var keys = bpArtboardKeys(ds.bp === 'base' ? 'desktop' : ds.bp);
      var pk = S.primaryKey();
      if (keys.indexOf(pk) !== -1) return pk;
      return keys[0] || pk;
    }
    function nodesIn(rootEl, t) {
      if (!rootEl || !t) return [];
      var sel = ES.selectorFor(t.sid, t.def, t.item);
      try { return Array.prototype.slice.call(rootEl.querySelectorAll(sel)); } catch (e) { return []; }
    }
    function liveEl(t) { return nodesIn(S.roots()[liveRootKey()], t)[0] || null; }
    function cs(t) { var el = liveEl(t); try { return el ? getComputedStyle(el) : null; } catch (e) { return null; } }
    function pxNum(s) { var n = parseFloat(s); return isFinite(n) ? round(n, 1) : null; }
    function cssToHex(s) { var c = ES.color.parse(String(s || '').replace(/\s+/g, ' ')); return c ? ES.color.hex(c) : null; }
    function live(t, prop) {
      var c = cs(t);
      if (!c) return null;
      var el = liveEl(t);
      switch (prop) {
        case 'w': return el ? round(el.getBoundingClientRect().width / scaleOf(el), 0) : null;
        case 'h': return el ? round(el.getBoundingClientRect().height / scaleOf(el), 0) : null;
        case 'pt': return pxNum(c.paddingTop); case 'pr': return pxNum(c.paddingRight);
        case 'pb': return pxNum(c.paddingBottom); case 'pl': return pxNum(c.paddingLeft);
        case 'mt': return pxNum(c.marginTop); case 'mr': return pxNum(c.marginRight);
        case 'mb': return pxNum(c.marginBottom); case 'ml': return pxNum(c.marginLeft);
        case 'gap': return pxNum(c.rowGap || c.gap);
        case 'rTL': return pxNum(c.borderTopLeftRadius); case 'rTR': return pxNum(c.borderTopRightRadius);
        case 'rBR': return pxNum(c.borderBottomRightRadius); case 'rBL': return pxNum(c.borderBottomLeftRadius);
        case 'fontSize': return pxNum(c.fontSize);
        case 'fontWeight': return parseInt(c.fontWeight, 10) || null;
        case 'lh': { var fs = parseFloat(c.fontSize), lh = parseFloat(c.lineHeight); return fs && lh ? round(lh / fs, 2) : null; }
        case 'ls': { var f2 = parseFloat(c.fontSize), l2 = parseFloat(c.letterSpacing); return f2 && isFinite(l2) ? round(l2 / f2 * 100, 1) : 0; }
        case 'opacity': return round(parseFloat(c.opacity) * 100, 0);
        case 'color': return cssToHex(c.color);
        case 'fill': return cssToHex(c.backgroundColor);
        case 'z': return c.zIndex === 'auto' ? null : parseInt(c.zIndex, 10);
        case 'minH': return pxNum(c.minHeight);
        case 'contentW': { var w = el && el.querySelector('.jst-wrap'); return w ? pxNum(getComputedStyle(w).maxWidth) : null; }
      }
      return null;
    }
    function scaleOf(el) {
      var frame = el.closest('.st-ab__frame');
      return frame ? (S.frameScale ? S.frameScale(frame) : 1) : 1;
    }

    /* ================================================================ small DOM helpers */

    function tip(el, text, kbd) { el.setAttribute('data-tip', text); el.setAttribute('aria-label', text); if (kbd) el.setAttribute('data-kbd', kbd); return el; }
    function ibtn(icon, label, fn, cls) {
      var b = ce('button', 'dz-ib' + (cls ? ' ' + cls : ''), icon);
      b.type = 'button';
      tip(b, label);
      b.addEventListener('click', function (e) { e.preventDefault(); fn(e, b); });
      return b;
    }
    var updaters = [];
    function reg(fn) { updaters.push(fn); return fn; }

    function fmt(v, dec) {
      if (v === null || v === undefined || v === '') return '';
      var n = Number(v);
      if (!isFinite(n)) return String(v);
      return String(round(n, dec == null ? 2 : dec)).replace('.', ',');
    }
    /* « 24 », « 24px », « 1,5 », « 100-8 », « 24*2 », « (10+2)/3 » — no eval */
    function parseExpr(str) {
      var s = String(str == null ? '' : str).trim().toLowerCase().replace(/,/g, '.').replace(/(px|%|°|deg|ms|em|vw|vh|x)$/, '').trim();
      if (!s) return null;
      var i = 0;
      function peek() { while (s[i] === ' ') i++; return s[i]; }
      function num() {
        peek();
        var m = /^-?\d*\.?\d+/.exec(s.slice(i));
        if (!m) return NaN;
        i += m[0].length;
        return Number(m[0]);
      }
      function factor() {
        var c = peek();
        if (c === '(') { i++; var v = expr(); if (peek() === ')') i++; return v; }
        if (c === '-') { i++; return -factor(); }
        return num();
      }
      function term() { var v = factor(); for (;;) { var c = peek(); if (c === '*') { i++; v *= factor(); } else if (c === '/') { i++; var d = factor(); v = d ? v / d : NaN; } else return v; } }
      function expr() { var v = term(); for (;;) { var c = peek(); if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v; } }
      var out = expr();
      return i >= s.trim().length && isFinite(out) ? out : null;
    }

    /* override marker: blue = this breakpoint / state has its own value (click: back to the wider one) */
    function dot(t, props) {
      var b = ce('button', 'dz-dot');
      b.type = 'button';
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var L = layerName();
        var e2 = entryOf(t);
        var here = props.filter(function (p) { return e2 && e2[L] && Object.prototype.hasOwnProperty.call(e2[L], p); });
        if (!here.length) return;
        var patch = {};
        here.forEach(function (p) { patch[p] = null; });
        var where = ds.st !== 'normal' ? ST_LABEL[ds.st] : (ds.bp === 'base' ? 'le modèle' : (ds.bp === 'phone' ? 'la tablette' : 'Toutes'));
        setProps(t, patch, 'Retour à ' + where + ' (' + ES.elementDef(t.type, t.el).label + ')');
        toast(ds.bp === 'base' && ds.st === 'normal' ? 'Valeur du modèle rétablie.' : 'Valeur de ' + where + ' rétablie.', 'info');
      });
      reg(function () {
        var L = layerName();
        var e2 = entryOf(t);
        var here = props.some(function (p) { return e2 && e2[L] && Object.prototype.hasOwnProperty.call(e2[L], p); });
        var inh = !here && ds.st === 'normal' && ds.bp === 'phone' && props.some(function (p) { return e2 && e2.tablet && Object.prototype.hasOwnProperty.call(e2.tablet, p); });
        b.className = 'dz-dot' + (here ? (ds.bp === 'base' && ds.st === 'normal' ? ' is-base' : ' is-over') : (inh ? ' is-inh' : ''));
        b.disabled = !here;
        var txt = here
          ? (ds.st !== 'normal' ? 'Valeur de l’état « ' + ST_LABEL[ds.st] + ' » — cliquer pour la retirer'
            : ds.bp === 'base' ? 'Valeur réglée — cliquer pour revenir au modèle'
              : 'Valeur propre à « ' + BP_LABEL[ds.bp] + ' » — cliquer pour revenir à ' + (ds.bp === 'phone' ? 'la tablette' : '« Toutes »'))
          : (inh ? 'Valeur héritée de « Tablette »' : '');
        if (txt) tip(b, txt); else { b.removeAttribute('data-tip'); b.setAttribute('aria-label', 'Pas de valeur propre'); }
      });
      return b;
    }

    /* a row: label (scrub handle when given), controls, override dot */
    function row(label, ctlEls, t, props, cls) {
      var r = ce('div', 'dz-row' + (cls ? ' ' + cls : ''));
      var l = ce('span', 'dz-lab', esc(label));
      r.appendChild(l);
      var c = ce('div', 'dz-ctl');
      (Array.isArray(ctlEls) ? ctlEls : [ctlEls]).forEach(function (x) { if (x) c.appendChild(x); });
      r.appendChild(c);
      if (t && props && props.length) r.appendChild(dot(t, props)); else r.appendChild(ce('span', 'dz-dot dz-dot--none'));
      r.lab = l;
      return r;
    }

    /* ================================================================ number field (scrub, arrows, expressions) */

    function scrub(handle, o) {
      // o: { get() → number, set(v, live), step, min, max }
      handle.classList.add('dz-scrub');
      handle.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var start = o.get();
        var v = typeof start === 'number' && isFinite(start) ? start : 0;
        var lastX = e.clientX, moved = false, raf = 0, pending = null;
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* old engine */ }
        function flush() { raf = 0; if (pending !== null) { o.set(pending, true); pending = null; } }
        function mv(ev) {
          var dx = ev.clientX - lastX;
          lastX = ev.clientX;
          if (!dx) return;
          if (!moved) { moved = true; ds.scrubbing = true; document.body.classList.add('dz-scrubbing'); }
          var step = (o.step || 1) * (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1);
          v = clamp(v + dx * step, o.min == null ? -1e9 : o.min, o.max == null ? 1e9 : o.max);
          pending = round(v, step < 1 ? 2 : (o.step && o.step < 1 ? 2 : 0));
          if (!raf) raf = requestAnimationFrame(flush);
        }
        function up() {
          handle.removeEventListener('pointermove', mv);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          if (raf) { cancelAnimationFrame(raf); flush(); }
          if (moved) {
            ds.scrubbing = false; document.body.classList.remove('dz-scrubbing');
            document.body.classList.remove('dz-scrubbing');
            S.applyElStyles(); // transitions back on
            refresh();
            // the click that ends a scrub must not focus the field (Ctrl Z would go to the input)
            var eat = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
            handle.addEventListener('click', eat, true);
            setTimeout(function () { handle.removeEventListener('click', eat, true); }, 0);
          }
        }
        handle.addEventListener('pointermove', mv);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }

    /* o: { t, prop | get/set, label (letter or icon html), unit, min, max, step, dec, ph(), title, co, labelText, onCommit } */
    function num(o) {
      var t = o.t;
      var wrap = ce('label', 'dz-num' + (o.wide ? ' dz-num--wide' : ''));
      var h = ce('span', 'dz-num__l', o.icon || esc(o.letter || ''));
      if (!o.icon && !o.letter) h.classList.add('is-empty');
      var inp = ce('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.spellcheck = false;
      inp.autocomplete = 'off';
      if (o.title) inp.setAttribute('aria-label', o.title);
      wrap.appendChild(h);
      wrap.appendChild(inp);
      var unitEl = null;
      if (o.unit) {
        unitEl = ce('span', 'dz-num__u', esc(typeof o.unit === 'function' ? o.unit() : o.unit));
        wrap.appendChild(unitEl);
        if (o.onUnit) { unitEl.classList.add('is-btn'); tip(unitEl, 'Changer d’unité'); unitEl.addEventListener('mousedown', function (e) { e.preventDefault(); o.onUnit(); }); }
      }
      if (o.title) tip(wrap, o.title);
      function get() {
        if (o.get) return o.get();
        var v = val(t, o.prop);
        return v;
      }
      function placeholderV() { return o.ph ? o.ph() : (o.prop ? live(t, o.prop) : null); }
      function set(v, isLive) {
        if (v !== null && v !== undefined) v = clamp(v, o.min == null ? -1e9 : o.min, o.max == null ? 1e9 : o.max);
        if (o.set) o.set(v, isLive);
        else {
          var patch = {};
          patch[o.prop] = v;
          setProps(t, patch, o.labelText ? o.labelText + ' modifié' : 'Design modifié', o.co || o.prop);
        }
      }
      scrub(h, { get: function () { var v = get(); return v === undefined || v === null ? (placeholderV() || 0) : v; }, set: set, step: o.step || 1, min: o.min, max: o.max });
      var before = '';
      inp.addEventListener('focus', function () { before = inp.value; setTimeout(function () { try { inp.select(); } catch (e) { /* ok */ } }, 0); });
      function commitText() {
        var raw = inp.value.trim();
        if (raw === before) return;
        if (!raw) { set(null); return; }
        var n = parseExpr(raw);
        if (n === null) { inp.value = before; toast('Valeur non comprise : un nombre, ou un calcul comme « 24*2 ».', 'warn'); return; }
        set(round(n, o.dec == null ? 2 : o.dec));
        before = inp.value;
      }
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitText(); inp.blur(); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = before; inp.blur(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var cur = parseExpr(inp.value);
          if (cur === null) { var g = get(); cur = g === undefined || g === null ? (placeholderV() || 0) : g; }
          var step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (o.kstep || 1);
          var nv = round(cur + (e.key === 'ArrowUp' ? step : -step), 2);
          set(nv);
          inp.value = fmt(clamp(nv, o.min == null ? -1e9 : o.min, o.max == null ? 1e9 : o.max), o.dec);
          before = inp.value;
        }
        e.stopPropagation();
      });
      inp.addEventListener('blur', commitText);
      inp.addEventListener('focus', function () { if (o.onFocus) o.onFocus(true); });
      inp.addEventListener('blur', function () { if (o.onFocus) o.onFocus(false); });
      if (o.onFocus) { wrap.addEventListener('mouseenter', function () { o.onFocus(true); }); wrap.addEventListener('mouseleave', function () { if (document.activeElement !== inp) o.onFocus(false); }); }
      reg(function () {
        if (unitEl && typeof o.unit === 'function') unitEl.textContent = o.unit();
        if (document.activeElement === inp && !ds.scrubbing) return;
        var v = get();
        if (v === undefined || v === null) {
          inp.value = '';
          var ph = placeholderV();
          inp.placeholder = ph === null || ph === undefined ? (o.phText || '—') : fmt(ph, o.dec == null ? 1 : o.dec);
          wrap.classList.remove('is-set');
        } else {
          inp.value = fmt(v, o.dec);
          inp.placeholder = '';
          wrap.classList.add('is-set');
        }
        before = inp.value;
      });
      wrap.input = inp;
      wrap.handle = h;
      return wrap;
    }

    /* a slider + its number (opacity, smoothing, filters) */
    function slider(o) {
      var box = ce('div', 'dz-sl');
      var track = ce('div', 'dz-sl__t');
      var fill = ce('div', 'dz-sl__f');
      var knob = ce('div', 'dz-sl__k');
      track.appendChild(fill);
      track.appendChild(knob);
      if (o.neutral !== undefined) { var n = ce('div', 'dz-sl__n'); n.style.left = ((o.neutral - o.min) / (o.max - o.min) * 100) + '%'; track.appendChild(n); }
      box.appendChild(track);
      var nf = num(o);
      nf.classList.add('dz-num--sm');
      box.appendChild(nf);
      function get() { var v = o.get ? o.get() : val(o.t, o.prop); return v === undefined || v === null ? (o.ph ? o.ph() : o.neutral) : v; }
      function setFrom(ev, isLive) {
        var r = track.getBoundingClientRect();
        var f = clamp((ev.clientX - r.left) / Math.max(1, r.width), 0, 1);
        var v = round(o.min + f * (o.max - o.min), o.step && o.step < 1 ? 2 : 0);
        if (o.neutral !== undefined && Math.abs(v - o.neutral) < (o.max - o.min) * 0.015) v = o.neutral; // a soft snap to neutral
        if (o.set) o.set(v, isLive);
        else { var p = {}; p[o.prop] = v; setProps(o.t, p, (o.labelText || 'Réglage') + ' modifié', o.co || o.prop); }
      }
      track.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
        document.body.classList.add('dz-scrubbing');
        var raf = 0, last = null;
        setFrom(e, true);
        function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (last) setFrom(last, true); }); }
        function up() {
          track.removeEventListener('pointermove', mv);
          track.removeEventListener('pointerup', up);
          track.removeEventListener('pointercancel', up);
          ds.scrubbing = false; document.body.classList.remove('dz-scrubbing');
          document.body.classList.remove('dz-scrubbing');
          S.applyElStyles();
          refresh();
        }
        track.addEventListener('pointermove', mv);
        track.addEventListener('pointerup', up);
        track.addEventListener('pointercancel', up);
      });
      reg(function () {
        var v = get();
        var f = v === undefined || v === null ? 0 : clamp((v - o.min) / (o.max - o.min), 0, 1);
        knob.style.left = (f * 100) + '%';
        var from = o.neutral !== undefined ? (o.neutral - o.min) / (o.max - o.min) : 0;
        fill.style.left = (Math.min(from, f) * 100) + '%';
        fill.style.width = (Math.abs(f - from) * 100) + '%';
      });
      return box;
    }

    /* segmented control. opts: [{ v, html, tip }]; value v or undefined (unset) */
    function seg(o) {
      var box = ce('div', 'dz-seg' + (o.cls ? ' ' + o.cls : ''));
      box.setAttribute('role', 'group');
      var btns = o.options.map(function (op) {
        var b = ce('button', '', op.html);
        b.type = 'button';
        if (op.tip) tip(b, op.tip);
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var cur = o.get ? o.get() : val(o.t, o.prop);
          var nv = (o.toggle && cur === op.v) ? null : op.v;
          if (o.set) o.set(nv);
          else { var p = {}; p[o.prop] = nv; setProps(o.t, p, (o.labelText || 'Réglage') + ' modifié', null); }
          if (o.structural) render();
        });
        box.appendChild(b);
        return b;
      });
      reg(function () {
        var cur = o.get ? o.get() : val(o.t, o.prop);
        if ((cur === undefined || cur === null) && o.dflt !== undefined) cur = o.dflt;
        btns.forEach(function (b, i) { var on = o.options[i].v === cur; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      });
      return box;
    }

    function selectCtl(o) {
      var s = ce('select', 'dz-select');
      o.options.forEach(function (op) { var x = ce('option'); x.value = op.v; x.textContent = op.label; s.appendChild(x); });
      if (o.title) s.setAttribute('aria-label', o.title);
      s.addEventListener('change', function () {
        var v = s.value === '' ? null : (o.numeric ? Number(s.value) : s.value);
        if (o.set) o.set(v);
        else { var p = {}; p[o.prop] = v; setProps(o.t, p, (o.labelText || 'Réglage') + ' modifié', null); }
        if (o.structural) render();
      });
      s.addEventListener('keydown', function (e) { e.stopPropagation(); });
      reg(function () {
        var v = o.get ? o.get() : val(o.t, o.prop);
        s.value = v === undefined || v === null ? '' : String(v);
        s.classList.toggle('is-set', !(v === undefined || v === null));
      });
      return s;
    }

    /* ================================================================ colour: swatch + hex + alpha, and the picker */

    function swatchBg(v) {
      var c = ES.color.css(v);
      return c ? 'linear-gradient(' + c + ', ' + c + '), var(--dz-checker)' : 'var(--dz-checker)';
    }
    function tokenLabel(v) {
      var m = /^@(\w+)(?:\/(\d+))?$/.exec(v || '');
      if (!m) return null;
      var names = { accent: 'Accent', bg: 'Fond', surface: 'Surface', text: 'Texte', muted: 'Atténué', line: 'Ligne', onAccent: 'Sur accent' };
      return (names[m[1]] || m[1]) + (m[2] ? ' ' + m[2] + ' %' : '');
    }
    /* the hex value of a stored colour (tokens read from the live store) */
    function colorRgba(v) {
      if (typeof v === 'string' && v.charAt(0) === '@') {
        var m = /^@(\w+)(?:\/(\d+))?$/.exec(v);
        var rootEl = S.roots()[S.primaryKey()];
        var raw = rootEl ? getComputedStyle(rootEl).getPropertyValue(ES.TOKENS[m[1]] || '--st-accent').trim() : '';
        var c = ES.color.parse(raw) || { r: 0, g: 0, b: 0, a: 1 };
        if (m[2]) c.a = c.a * Number(m[2]) / 100;
        return c;
      }
      return ES.color.parse(v);
    }

    /* o: { t, prop | get/set, label, dflt } */
    function colorField(o) {
      var box = ce('div', 'dz-color');
      var sw = ce('button', 'dz-sw');
      sw.type = 'button';
      tip(sw, 'Choisir la couleur');
      var hex = ce('input', 'dz-hex');
      hex.type = 'text';
      hex.spellcheck = false;
      hex.setAttribute('aria-label', (o.label || 'Couleur') + ' (hex)');
      var al = ce('input', 'dz-alpha');
      al.type = 'text';
      al.inputMode = 'numeric';
      al.setAttribute('aria-label', 'Opacité de la couleur');
      var alWrap = ce('span', 'dz-alpha-w');
      alWrap.appendChild(al);
      alWrap.appendChild(ce('span', 'dz-num__u', '%'));
      box.appendChild(sw);
      box.appendChild(hex);
      box.appendChild(alWrap);
      function get() { return o.get ? o.get() : val(o.t, o.prop); }
      function set(v, isLive) {
        if (o.set) o.set(v, isLive);
        else { var p = {}; p[o.prop] = v; setProps(o.t, p, (o.label || 'Couleur') + ' modifiée', o.co || o.prop); }
      }
      sw.addEventListener('click', function (e) {
        e.preventDefault();
        if (picker && window.JeereColor && window.JeereColor.isOpen()) { closePicker(); return; }
        openPicker(sw, get() || (o.ph && o.ph()) || o.dflt || '#000000', set, o.label || 'Couleur', o.gradient ? o.gradient() : null);
      });
      var beforeHex = '';
      hex.addEventListener('focus', function () { beforeHex = hex.value; setTimeout(function () { try { hex.select(); } catch (e) { /* ok */ } }, 0); });
      function commitHex() {
        var raw = hex.value.trim();
        if (raw === beforeHex) return;
        if (!raw) { set(null); return; }
        var tok = /^@?(accent|bg|surface|text|muted|line|onaccent)$/i.exec(raw);
        if (tok) { set('@' + (tok[1].toLowerCase() === 'onaccent' ? 'onAccent' : tok[1].toLowerCase())); return; }
        var c = ES.color.parse(raw.charAt(0) === '#' || /^(rgb|hsl)/i.test(raw) ? raw : '#' + raw);
        if (!c) { hex.value = beforeHex; toast('Couleur non comprise : #RRGGBB, rgb(…) ou hsl(…).', 'warn'); return; }
        var cur = colorRgba(get());
        if (cur && !/^#?[0-9a-f]{8}$/i.test(raw) && !/^(rgba|hsla)/i.test(raw)) c.a = cur.a; // keep the alpha typed beside
        set(ES.color.hex(c));
        pushRecent(ES.color.hex(c));
      }
      hex.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitHex(); hex.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); hex.value = beforeHex; hex.blur(); }
        e.stopPropagation();
      });
      hex.addEventListener('blur', commitHex);
      var beforeA = '';
      al.addEventListener('focus', function () { beforeA = al.value; setTimeout(function () { try { al.select(); } catch (e) { /* ok */ } }, 0); });
      function commitA() {
        if (al.value === beforeA) return;
        var n = parseExpr(al.value);
        var cur = get() || o.dflt;
        if (n === null || !cur) { al.value = beforeA; return; }
        n = clamp(n, 0, 100);
        if (typeof cur === 'string' && cur.charAt(0) === '@') { set(cur.split('/')[0] + (n >= 100 ? '' : '/' + Math.round(n))); return; }
        var c = ES.color.parse(cur);
        if (!c) return;
        c.a = n / 100;
        set(ES.color.hex(c));
      }
      al.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitA(); al.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); al.value = beforeA; al.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var n = (parseExpr(al.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          al.value = String(clamp(Math.round(n), 0, 100));
          commitA();
          beforeA = al.value;
        }
        e.stopPropagation();
      });
      al.addEventListener('blur', commitA);
      reg(function () {
        var v = get();
        var shown = v || null;
        var phc = !shown && o.ph ? o.ph() : null;
        sw.style.background = swatchBg(shown || phc || o.dflt || null);
        sw.classList.toggle('is-empty', !shown && !phc && !o.dflt);
        sw.classList.toggle('is-ph', !shown && !!(phc || o.dflt));
        if (document.activeElement !== hex) {
          var tl = tokenLabel(shown);
          if (tl) { hex.value = tl; hex.classList.add('is-token'); }
          else {
            hex.classList.remove('is-token');
            var c = shown ? ES.color.parse(shown) : null;
            hex.value = c ? ES.color.hex({ r: c.r, g: c.g, b: c.b, a: 1 }).slice(1) : '';
            var ph = o.ph ? o.ph() : null;
            hex.placeholder = ph ? String(ph).replace('#', '').slice(0, 6) : 'Modèle';
          }
        }
        if (document.activeElement !== al) {
          var rgba = shown ? colorRgba(shown) : null;
          al.value = rgba ? String(Math.round(rgba.a * 100)) : '';
          al.placeholder = '100';
        }
      });
      return box;
    }

    /* ---------------- recent colours */
    function recents() { var u = ui(); if (!Array.isArray(u.recentColors)) u.recentColors = []; return u.recentColors; }
    function pushRecent(v) {
      if (!v || typeof v !== 'string') return;
      var list = recents().filter(function (x) { return x !== v; });
      list.unshift(v);
      ui().recentColors = list.slice(0, 14);
      S.saveUI();
    }

    /* ---------------- the picker: jcolor.js (the Studio's own, never the native one) */
    var picker = null;
    function closePicker() {
      if (!picker) return false;
      picker = null;
      return window.JeereColor ? window.JeereColor.close() : false;
    }
    /* gopts (fills): { get() → gradient | null, mode, set(gradient, live) } — the « Dégradé » tab */
    function openPicker(anchor, value, onSet, title, gopts) {
      closePicker();
      var JC = window.JeereColor;
      if (!JC) return null;
      function live(on) {
        ds.scrubbing = !!on;
        document.body.classList.toggle('dz-scrubbing', !!on);
        if (!on) { S.applyElStyles(); refresh(); }
      }
      var h = JC.open({
        anchor: anchor, title: title || 'Couleur', theme: 'dark', value: value,
        palette: ['accent', 'onAccent', 'text', 'muted', 'bg', 'surface', 'line'].map(function (k) { return { v: '@' + k, label: tokenLabel('@' + k) }; }),
        recents: recents(), resolve: colorRgba, toast: function (m) { toast(m, 'warn'); },
        onChange: function (v, isLive) { live(isLive); onSet(v, isLive); if (!isLive) live(false); },
        allowGradient: !!gopts, gradient: gopts ? gopts.get() : null, mode: gopts ? gopts.mode : 'solid',
        onGradient: gopts ? function (g, isLive) { live(isLive); gopts.set(g, isLive); if (!isLive) live(false); } : null,
        place: function (el) {
          var ar = anchor.getBoundingClientRect();
          var right = document.querySelector('.st-right');
          var rr = right ? right.getBoundingClientRect() : { left: window.innerWidth - 280 };
          el.style.left = Math.max(8, rr.left - el.offsetWidth - 8) + 'px';
          el.style.top = Math.max(56, Math.min(window.innerHeight - el.offsetHeight - 8, ar.top - 40)) + 'px';
        },
        onClose: function (last) {
          if (typeof last === 'string') pushRecent(last);
          else if (last && last.stops) last.stops.forEach(function (st) { pushRecent(st.c); });
          picker = null;
          live(false);
        }
      });
      picker = h;
      return h;
    }
    /* a fill's « Dégradé » tab writes the fill type, stops, angle */
    function fillGradient(t) {
      return {
        mode: (val(t, 'fillType') === 'linear' || val(t, 'fillType') === 'radial') ? 'gradient' : 'solid',
        get: function () {
          var st = val(t, 'gradStops');
          return st ? { type: val(t, 'fillType') === 'radial' ? 'radial' : 'linear', angle: val(t, 'gradAngle') === undefined ? 180 : val(t, 'gradAngle'), stops: st } : null;
        },
        set: function (g) {
          var was = val(t, 'fillType');
          setProps(t, { fillType: g.type, gradStops: g.stops, gradAngle: g.angle }, 'Dégradé modifié', 'grad');
          if (was !== g.type) render();
        }
      };
    }

    /* ================================================================ groups */

    function group(id, t, actions, extraCls) {
      var g = ce('section', 'dz-g' + (extraCls ? ' ' + extraCls : ''));
      g.setAttribute('data-group', id);
      var head = ce('div', 'dz-gh');
      var tbtn = ce('button', 'dz-gh__t', '<span class="dz-gh__c">' + IC.caret + '</span><span>' + esc(GROUP_TITLES[id] || id) + '</span>');
      tbtn.type = 'button';
      tbtn.setAttribute('aria-expanded', 'true');
      head.appendChild(tbtn);
      var acts = ce('div', 'dz-gh__a');
      (actions || []).forEach(function (a) { if (a) acts.appendChild(a); });
      head.appendChild(acts);
      var body = ce('div', 'dz-gb');
      var inner = ce('div', 'dz-gb__in');
      body.appendChild(inner);
      g.appendChild(head);
      g.appendChild(body);
      var og = openGroups();
      if (og[id] === false) { g.classList.add('is-closed'); tbtn.setAttribute('aria-expanded', 'false'); }
      tbtn.addEventListener('click', function () {
        var closed = g.classList.toggle('is-closed');
        tbtn.setAttribute('aria-expanded', String(!closed));
        openGroups()[id] = !closed;
        S.saveUI();
      });
      g.body = inner;
      g.mark = function (on) { g.classList.toggle('has-val', !!on); };
      return g;
    }
    // does the entry set any of these props (any layer)?
    function anySet(t, props) {
      var e = entryOf(t);
      if (!e) return false;
      return Object.keys(e).some(function (L) { return props.some(function (p) { return e[L] && Object.prototype.hasOwnProperty.call(e[L], p); }); });
    }

    /* linked quad (padding, margin, border widths): one field when linked, four when not */
    function quad(t, o) {
      // o: { props: [T, R, B, L], label, key, min, max, letters, onHover }
      var box = ce('div', 'dz-quad');
      var linkKey = t.key + ':' + o.key;
      var vals = o.props.map(function (p) { return val(t, p); });
      var allSame = vals.every(function (v) { return v === vals[0]; });
      if (ds.links[linkKey] === undefined) ds.links[linkKey] = allSame;
      var linked = ds.links[linkKey];
      var r1 = ce('div', 'dz-quad__r');
      var lk = ibtn(linked ? IC.link : IC.unlink, linked ? 'Valeurs liées — cliquer pour régler chaque côté' : 'Côtés indépendants — cliquer pour lier', function () {
        ds.links[linkKey] = !ds.links[linkKey];
        render();
      }, 'dz-link' + (linked ? ' is-on' : ''));
      if (linked) {
        r1.appendChild(num({ t: t, letter: o.letterAll || '', icon: o.iconAll, min: o.min, max: o.max, labelText: o.label, co: o.key, title: o.label + ' (les quatre côtés)', onFocus: o.onHover,
          get: function () { var v = o.props.map(function (p) { return val(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : undefined; },
          ph: function () { var v = o.props.map(function (p) { return live(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : null; },
          phText: 'Mixte',
          set: function (v) { var patch = {}; o.props.forEach(function (p) { patch[p] = v; }); setProps(t, patch, o.label + ' modifié', o.key); }
        }));
        if (o.pair) {
          // the vertical / horizontal shortcut, Figma-style
          r1.innerHTML = '';
          [[0, 2, '↕', 'haut et bas'], [1, 3, '↔', 'gauche et droite']].forEach(function (pp) {
            r1.appendChild(num({ t: t, letter: pp[2], min: o.min, max: o.max, labelText: o.label, co: o.key + pp[0], title: o.label + ' ' + pp[3], onFocus: o.onHover,
              get: function () { var a = val(t, o.props[pp[0]]), b = val(t, o.props[pp[1]]); return a === b ? a : undefined; },
              ph: function () { var a = live(t, o.props[pp[0]]), b = live(t, o.props[pp[1]]); return a === b ? a : null; },
              phText: 'Mixte',
              set: function (v) { var patch = {}; patch[o.props[pp[0]]] = v; patch[o.props[pp[1]]] = v; setProps(t, patch, o.label + ' modifié', o.key + pp[0]); }
            }));
          });
        }
        r1.appendChild(lk);
        box.appendChild(r1);
      } else {
        var r2 = ce('div', 'dz-quad__g');
        o.props.forEach(function (p, i) {
          r2.appendChild(num({ t: t, prop: p, letter: (o.letters || 'HDBG')[i], min: o.min, max: o.max, labelText: o.label, co: o.key + p, onFocus: o.onHover,
            title: o.label + ' ' + ['haut', 'droite', 'bas', 'gauche'][i] }));
        });
        r1.appendChild(r2);
        r1.appendChild(lk);
        box.appendChild(r1);
      }
      return box;
    }

    /* ---------------------------------------------------------------- Disposition */
    function layoutGroup(t) {
      var k = t.def.kind;
      var g = group('layout', t);
      var props = ['wMode', 'w', 'hMode', 'h', 'minW', 'maxW', 'minH', 'maxH', 'pt', 'pr', 'pb', 'pl', 'mt', 'mr', 'mb', 'ml', 'gap', 'stack', 'alignX', 'alignY', 'pos', 'top', 'right', 'bottom', 'left', 'z', 'overflow', 'contentW', 'wrap'];
      g.mark(anySet(t, props));
      var b = g.body;
      b.appendChild(visibilityRow(t));
      if (k === 'section') {
        b.appendChild(row('Contenu', [num({ t: t, prop: 'contentW', letter: 'L', unit: 'px', min: 240, max: 2400, labelText: 'Largeur du contenu', title: 'Largeur maximale du contenu' })], t, ['contentW']));
        b.appendChild(row('Haut. min', [num({ t: t, prop: 'minH', letter: 'H', unit: 'px', min: 0, max: 4000, labelText: 'Hauteur minimale', title: 'Hauteur minimale' })], t, ['minH']));
      }
      if (k === 'container' || k === 'button' || k === 'image' || k === 'text' || k === 'badge' || k === 'card' || k === 'icon') sizeRows(t, b, k);
      if (k === 'container' || k === 'card') stackRows(t, b);
      if (k !== 'image') {
        var pr = row('Padding', [quad(t, { props: ['pt', 'pr', 'pb', 'pl'], label: 'Marge intérieure', key: 'pad', min: 0, max: 600, pair: true, onHover: padHover })], t, ['pt', 'pr', 'pb', 'pl'], 'dz-row--top');
        tip(pr.lab, 'Marge intérieure (padding) : l’espace entre le bord et le contenu');
        pr.addEventListener('mouseenter', function () { padHover(true); });
        pr.addEventListener('mouseleave', function () { padHover(false); });
        b.appendChild(pr);
      }
      if (k !== 'section') {
        var mr = row('Marge', [quad(t, { props: ['mt', 'mr', 'mb', 'ml'], label: 'Marge extérieure', key: 'mar', min: -600, max: 600, pair: true })], t, ['mt', 'mr', 'mb', 'ml'], 'dz-row--top');
        tip(mr.lab, 'Marge extérieure (margin) : l’espace autour de l’élément');
        b.appendChild(mr);
        positionRows(t, b);
      }
      b.appendChild(row('Débord', [seg({ t: t, prop: 'overflow', labelText: 'Débord', toggle: true, options: [
        { v: 'visible', html: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke-dasharray="2 1.6"/><path d="M8 1v14"/>'), tip: 'Visible : le contenu peut dépasser' },
        { v: 'hidden', html: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/><path d="M8 3.5v9"/>'), tip: 'Rogner ce qui dépasse (et les coins arrondis)' }] })], t, ['overflow']));
      return g;
    }
    function sizeRows(t, b, k) {
      var units = ['px', '%', 'vw'];
      ['w', 'h'].forEach(function (ax) {
        var modeP = ax + 'Mode', unitP = ax + 'Unit';
        var axUnits = ax === 'w' ? units : ['px', '%', 'vh'];
        var rot = ax === 'h' ? ' style="transform:rotate(90deg)"' : '';
        var modeSeg = seg({ t: t, prop: modeP, labelText: ax === 'w' ? 'Largeur' : 'Hauteur', toggle: true, cls: 'dz-seg--modes', options: [
          { v: 'hug', html: svg('<path d="M2.5 4v8M13.5 4v8M5 8h6M6.6 6.4L5 8l1.6 1.6M9.4 6.4L11 8 9.4 9.6"/>', rot), tip: ax === 'w' ? 'Auto : la largeur du contenu' : 'Auto : la hauteur du contenu' },
          { v: 'fill', html: svg('<path d="M2.5 4v8M13.5 4v8M4.6 8h6.8M6.2 6.4L4.6 8l1.6 1.6M9.8 6.4L11.4 8 9.8 9.6"/>', rot), tip: ax === 'w' ? 'Plein : toute la largeur disponible' : 'Plein : toute la hauteur du parent' },
          { v: 'fixed', html: svg('<rect x="2" y="5.5" width="12" height="5" rx="1"/><path d="M5 5.5v2M8 5.5v2.5M11 5.5v2"/>', rot), tip: 'Fixe : une valeur précise' }] });
        var nf = num({ t: t, letter: ax === 'w' ? 'L' : 'H', min: 0, max: 4000, labelText: ax === 'w' ? 'Largeur' : 'Hauteur', co: ax,
          unit: function () { var u = val(t, unitP); return u || 'px'; },
          onUnit: function () {
            var u = val(t, unitP) || 'px';
            var nu = axUnits[(axUnits.indexOf(u) + 1) % axUnits.length];
            var p = {}; p[unitP] = nu; p[modeP] = 'fixed';
            if (val(t, ax) === undefined) p[ax] = nu === 'px' ? (live(t, ax) || 100) : 100;
            setProps(t, p, (ax === 'w' ? 'Largeur' : 'Hauteur') + ' : unité ' + nu, null);
          },
          get: function () { return val(t, modeP) === 'fixed' ? val(t, ax) : undefined; },
          ph: function () { return live(t, ax); },
          set: function (v) {
            var p = {};
            if (v === null) { p[ax] = null; p[modeP] = null; }
            else { p[ax] = v; p[modeP] = 'fixed'; }
            setProps(t, p, (ax === 'w' ? 'Largeur' : 'Hauteur') + ' modifiée', ax);
          },
          title: ax === 'w' ? 'Largeur (tapez une valeur : taille fixe)' : 'Hauteur (tapez une valeur : taille fixe)' });
        b.appendChild(row(ax === 'w' ? 'Largeur' : 'Hauteur', [nf, modeSeg], t, [ax, modeP, unitP]));
      });
      var mm = ce('div', 'dz-grid2');
      [['minW', 'Min L'], ['maxW', 'Max L'], ['minH', 'Min H'], ['maxH', 'Max H']].forEach(function (p) {
        mm.appendChild(num({ t: t, prop: p[0], letter: p[1].split(' ')[0] === 'Min' ? '≥' : '≤', unit: 'px', min: 0, max: 4000, labelText: p[1], title: p[1] === 'Min L' ? 'Largeur minimale' : p[1] === 'Max L' ? 'Largeur maximale' : p[1] === 'Min H' ? 'Hauteur minimale' : 'Hauteur maximale' }));
      });
      b.appendChild(row('Min / max', [mm], t, ['minW', 'maxW', 'minH', 'maxH'], 'dz-row--top'));
    }
    function stackRows(t, b) {
      var stack = val(t, 'stack');
      b.appendChild(row('Empiler', [seg({ t: t, prop: 'stack', labelText: 'Disposition', toggle: true, structural: true, options: [
        { v: 'col', html: IC.col, tip: 'Pile verticale (flex colonne)' }, { v: 'row', html: IC.row, tip: 'Pile horizontale (flex ligne)' }] }),
        stack ? null : ce('span', 'dz-note', 'Disposition du modèle')], t, ['stack']));
      if (!stack) return;
      // the 3 × 3 alignment grid
      var grid = ce('div', 'dz-align');
      tip(grid, 'Alignement du contenu');
      var cells = [];
      ['start', 'center', 'end'].forEach(function (y) {
        ['start', 'center', 'end'].forEach(function (x) {
          var c = ce('button', 'dz-align__c');
          c.type = 'button';
          c.setAttribute('aria-label', 'Aligner ' + ({ start: 'en haut', center: 'au milieu', end: 'en bas' })[y] + ' ' + ({ start: 'à gauche', center: 'au centre', end: 'à droite' })[x]);
          c.addEventListener('click', function () { setProps(t, { alignX: x, alignY: y }, 'Alignement modifié', null); });
          grid.appendChild(c);
          cells.push({ el: c, x: x, y: y });
        });
      });
      reg(function () {
        var ax = val(t, 'alignX'), ay = val(t, 'alignY');
        cells.forEach(function (c) { c.el.classList.toggle('is-on', c.x === (ax || 'start') && c.y === (ay || 'start') && !!(ax || ay)); });
        grid.classList.toggle('is-between', ay === 'between' || ax === 'stretch');
      });
      var side = ce('div', 'dz-align__side');
      side.appendChild(num({ t: t, prop: 'gap', letter: '⇵', unit: 'px', min: 0, max: 400, labelText: 'Espacement', title: 'Espace entre les éléments (gap)' }));
      side.appendChild(seg({ t: t, labelText: 'Répartition', cls: 'dz-seg--txt', toggle: true, options: [{ v: 'between', html: 'Répartir', tip: 'Répartir l’espace entre les éléments' }],
        get: function () { var main = stack === 'row' ? val(t, 'alignX') : val(t, 'alignY'); return main === 'between' || main === 'stretch' ? 'between' : null; },
        set: function (v) { var p = {}; p[stack === 'row' ? 'alignX' : 'alignY'] = v ? (stack === 'row' ? 'stretch' : 'between') : 'start'; setProps(t, p, 'Répartition modifiée', null); } }));
      if (stack === 'row') side.appendChild(seg({ t: t, prop: 'wrap', labelText: 'Retour à la ligne', cls: 'dz-seg--txt', options: [{ v: true, html: 'Retour lig.', tip: 'Passer à la ligne quand la place manque' }], toggle: true }));
      var alRow = row('Aligner', [grid, side], t, ['alignX', 'alignY', 'gap', 'wrap'], 'dz-row--top');
      b.appendChild(alRow);
    }
    function positionRows(t, b) {
      var pos = val(t, 'pos');
      b.appendChild(row('Position', [seg({ t: t, prop: 'pos', labelText: 'Position', toggle: true, structural: true, options: [
        { v: 'relative', html: svg('<rect x="2.5" y="5.5" width="7" height="7" rx="1" stroke-dasharray="1.6 1.4"/><rect x="6.5" y="3" width="7" height="7" rx="1"/>'), tip: 'Relative : décalée de sa place dans le flux' },
        { v: 'absolute', html: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><rect x="8" y="4" width="4" height="4" rx=".6" fill="currentColor"/>'), tip: 'Absolue : posée librement dans son bloc' }] }),
        num({ t: t, prop: 'z', letter: 'Z', min: -10, max: 100, dec: 0, labelText: 'Plan', title: 'Plan (z-index) : plus haut = devant' })], t, ['pos', 'z']));
      if (!pos) return;
      var gq = ce('div', 'dz-grid2');
      [['top', 'H', 'Haut'], ['right', 'D', 'Droite'], ['bottom', 'B', 'Bas'], ['left', 'G', 'Gauche']].forEach(function (p) {
        gq.appendChild(num({ t: t, prop: p[0], letter: p[1], unit: 'px', min: -2000, max: 2000, labelText: 'Décalage ' + p[2].toLowerCase(), title: 'Décalage depuis le ' + p[2].toLowerCase(), phText: 'auto' }));
      });
      b.appendChild(row('Décalages', [gq], t, ['top', 'right', 'bottom', 'left'], 'dz-row--top'));
    }

    /* ---------------------------------------------------------------- Rayon */
    function radiusGroup(t) {
      var g = group('radius', t);
      var props = ['rTL', 'rTR', 'rBR', 'rBL', 'smooth'];
      g.mark(anySet(t, props));
      var b = g.body;
      var linkKey = t.key + ':rad';
      var vals = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { return val(t, p); });
      if (ds.links[linkKey] === undefined) ds.links[linkKey] = vals.every(function (v) { return v === vals[0]; });
      var linked = ds.links[linkKey];
      // the visual corner control: a rounded square; each corner is a button (click: edit that corner)
      var vis = ce('div', 'dz-corners');
      var shape = ce('div', 'dz-corners__s');
      vis.appendChild(shape);
      var cbtns = {};
      [['rTL', 'tl', 'Coin haut gauche'], ['rTR', 'tr', 'Coin haut droit'], ['rBR', 'br', 'Coin bas droit'], ['rBL', 'bl', 'Coin bas gauche']].forEach(function (c) {
        var bt = ce('button', 'dz-corners__c dz-corners__c--' + c[1]);
        bt.type = 'button';
        tip(bt, c[2] + ' — glisser pour régler');
        cbtns[c[0]] = bt;
        vis.appendChild(bt);
        bt.addEventListener('click', function () {
          if (ds.links[linkKey]) { ds.links[linkKey] = false; render(); }
          var f = panel.querySelector('[data-corner="' + c[0] + '"] input');
          if (f) f.focus();
        });
        scrub(bt, { get: function () { var v = val(t, c[0]); return v === undefined ? (live(t, c[0]) || 0) : v; }, step: 1, min: 0, max: 999,
          set: function (v) { var p = {}; if (ds.links[linkKey]) ['rTL', 'rTR', 'rBR', 'rBL'].forEach(function (k) { p[k] = v; }); else p[c[0]] = v; setProps(t, p, 'Rayon modifié', 'rad'); } });
      });
      reg(function () {
        var r = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { var v = val(t, p); if (v === undefined) v = live(t, p); return Math.min(14, (v || 0) / 3); });
        shape.style.borderRadius = r.map(function (x) { return x + 'px'; }).join(' ');
      });
      var fields = ce('div', 'dz-corners__f');
      if (linked) {
        fields.appendChild(num({ t: t, icon: svg('<path d="M3 13V8a5 5 0 015-5h5"/>'), unit: 'px', min: 0, max: 999, labelText: 'Rayon', co: 'rad', title: 'Rayon des quatre coins',
          get: function () { var v = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { return val(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : undefined; },
          ph: function () { var v = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { return live(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : null; },
          phText: 'Mixte',
          set: function (v) { setProps(t, { rTL: v, rTR: v, rBR: v, rBL: v }, 'Rayon modifié', 'rad'); } }));
      } else {
        var g4 = ce('div', 'dz-grid2');
        [['rTL', '◜'], ['rTR', '◝'], ['rBL', '◟'], ['rBR', '◞']].forEach(function (c) {
          var f = num({ t: t, prop: c[0], letter: c[1], unit: 'px', min: 0, max: 999, labelText: 'Rayon', co: 'rad' + c[0], title: { rTL: 'Haut gauche', rTR: 'Haut droit', rBL: 'Bas gauche', rBR: 'Bas droit' }[c[0]] });
          f.setAttribute('data-corner', c[0]);
          g4.appendChild(f);
        });
        fields.appendChild(g4);
      }
      var lk = ibtn(linked ? IC.link : IC.unlink, linked ? 'Coins liés — cliquer pour régler chaque coin' : 'Coins indépendants — cliquer pour lier', function () { ds.links[linkKey] = !ds.links[linkKey]; render(); }, 'dz-link' + (linked ? ' is-on' : ''));
      var rr = row('Coins', [vis, fields, lk], t, ['rTL', 'rTR', 'rBR', 'rBL'], 'dz-row--top dz-row--corners');
      b.appendChild(rr);
      var smoothSupported = false;
      try { smoothSupported = CSS.supports('corner-shape', 'superellipse(1.6)'); } catch (e) { smoothSupported = false; }
      var sr = row('Lissage', [slider({ t: t, prop: 'smooth', min: 0, max: 100, neutral: 0, unit: '%', labelText: 'Lissage des coins', title: 'Lissage des coins (courbure continue, façon iOS) — 60 % = iOS' })], t, ['smooth']);
      if (!smoothSupported) { sr.classList.add('is-soft'); tip(sr.lab, 'Lissage des coins : rendu par les navigateurs récents (corner-shape) ; ailleurs, un arrondi classique.'); }
      b.appendChild(sr);
      return g;
    }

    /* ---------------------------------------------------------------- Remplissage */
    var FILL_OPTS = [
      { v: null, html: 'Modèle', tip: 'Le fond du modèle (rien de réglé)' },
      { v: 'solid', html: '<i class="dz-fi dz-fi--solid"></i>', tip: 'Couleur unie' },
      { v: 'linear', html: '<i class="dz-fi dz-fi--lin"></i>', tip: 'Dégradé linéaire' },
      { v: 'radial', html: '<i class="dz-fi dz-fi--rad"></i>', tip: 'Dégradé radial' },
      { v: 'image', html: IC.image, tip: 'Image' },
      { v: 'none', html: '<i class="dz-fi dz-fi--none"></i>', tip: 'Aucun fond (transparent)' }
    ];
    function fillGroup(t) {
      var g = group('fill', t);
      g.mark(anySet(t, ['fillType', 'fill', 'gradStops', 'bgImage', 'opacity', 'blend']));
      var b = g.body;
      var ft = val(t, 'fillType');
      var opts = FILL_OPTS.filter(function (o) { return o.v !== 'image' || t.def.kind === 'section' || t.def.kind === 'container'; });
      b.appendChild(row('Type', [seg({ t: t, labelText: 'Remplissage', cls: 'dz-seg--fill', options: opts,
        get: function () { return val(t, 'fillType') || null; },
        set: function (v) {
          var p = { fillType: v };
          if (v === 'solid' && !val(t, 'fill')) p.fill = live(t, 'fill') && live(t, 'fill') !== '#00000000' ? live(t, 'fill') : '@accent';
          if ((v === 'linear' || v === 'radial') && !val(t, 'gradStops')) {
            var base = val(t, 'fill') || '@accent';
            p.gradStops = [{ c: base, p: 0 }, { c: '#000000', p: 100 }];
            if (v === 'linear' && val(t, 'gradAngle') === undefined) p.gradAngle = 135;
          }
          setProps(t, p, 'Remplissage : ' + (v ? FILL_OPTS.filter(function (o) { return o.v === v; })[0].tip.toLowerCase() : 'modèle'), null);
          render();
        } })], t, ['fillType']));
      if (ft === 'solid') b.appendChild(row('Couleur', [colorField({ t: t, label: 'Fond', ph: function () { return live(t, 'fill'); }, gradient: function () { return fillGradient(t); },
        get: function () { return val(t, 'fill'); },
        set: function (v) { setProps(t, { fillType: 'solid', fill: v }, 'Fond modifié', 'fill'); } })], t, ['fill']));
      if (ft === 'linear' || ft === 'radial') gradientRows(t, b, ft);
      if (ft === 'image') imageFillRows(t, b);
      b.appendChild(row('Opacité', [slider({ t: t, prop: 'opacity', min: 0, max: 100, neutral: 100, unit: '%', labelText: 'Opacité', title: 'Opacité de l’élément' })], t, ['opacity']));
      var blendOpts = [{ v: '', label: 'Normal (modèle)' }].concat(ES.BLEND.filter(function (x) { return x !== 'normal'; }).map(function (x) {
        var L = { multiply: 'Produit', screen: 'Superposition claire', overlay: 'Incrustation', darken: 'Assombrir', lighten: 'Éclaircir', 'color-dodge': 'Densité couleur −', 'color-burn': 'Densité couleur +',
          'hard-light': 'Lumière crue', 'soft-light': 'Lumière tamisée', difference: 'Différence', exclusion: 'Exclusion', hue: 'Teinte', saturation: 'Saturation', color: 'Couleur', luminosity: 'Luminosité', 'plus-lighter': 'Addition' };
        return { v: x, label: L[x] || x };
      }));
      b.appendChild(row('Fusion', [selectCtl({ t: t, prop: 'blend', options: blendOpts, labelText: 'Mode de fusion', title: 'Mode de fusion avec ce qui est dessous' })], t, ['blend']));
      return g;
    }
    function gradientRows(t, b, ft) {
      var stops = function () { return (val(t, 'gradStops') || []).slice(); };
      var ed = ce('div', 'dz-grad');
      var bar = ce('div', 'dz-grad__bar');
      var barIn = ce('div', 'dz-grad__in');
      bar.appendChild(barIn);
      ed.appendChild(bar);
      function setStops(list, isLive) { setProps(t, { gradStops: list.map(function (s) { return { c: s.c, p: round(s.p, 1) }; }) }, 'Dégradé modifié', 'grad'); }
      function paintBar() {
        var list = stops();
        barIn.style.background = 'linear-gradient(90deg, ' + list.map(function (s) { return (ES.color.css(s.c) || '#000') + ' ' + s.p + '%'; }).join(', ') + '), var(--dz-checker)';
        bar.querySelectorAll('.dz-grad__h').forEach(function (h) { h.remove(); });
        if (ds.gStop >= list.length) ds.gStop = 0;
        list.forEach(function (s, i) {
          var h = ce('button', 'dz-grad__h' + (i === ds.gStop ? ' is-on' : ''));
          h.type = 'button';
          h.style.left = s.p + '%';
          h.style.setProperty('--c', ES.color.css(s.c) || '#000');
          tip(h, 'Arrêt ' + (i + 1) + ' — glisser pour déplacer, Suppr pour retirer');
          h.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            ds.gStop = i;
            try { h.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
            var moved = false, raf = 0, lastE = null, cur = stops(), me = cur[i];
            function mv(ev) {
              lastE = ev;
              if (raf) return;
              raf = requestAnimationFrame(function () {
                raf = 0;
                var r = bar.getBoundingClientRect();
                me.p = round(clamp((lastE.clientX - r.left) / r.width * 100, 0, 100), 1);
                moved = true;
                ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
                var sorted = cur.slice().sort(function (a, b2) { return a.p - b2.p; });
                ds.gStop = sorted.indexOf(me);
                setStops(sorted, true);
              });
            }
            function up() {
              h.removeEventListener('pointermove', mv);
              h.removeEventListener('pointerup', up);
              ds.scrubbing = false; document.body.classList.remove('dz-scrubbing');
              S.applyElStyles();
              render();
            }
            h.addEventListener('pointermove', mv);
            h.addEventListener('pointerup', up);
            if (!moved) render();
          });
          h.addEventListener('keydown', function (e) {
            if ((e.key === 'Delete' || e.key === 'Backspace') && stops().length > 2) {
              e.preventDefault(); e.stopPropagation();
              var l2 = stops(); l2.splice(i, 1); ds.gStop = 0; setStops(l2); render();
            }
          });
          bar.appendChild(h);
        });
      }
      reg(paintBar);
      barIn.addEventListener('click', function (e) {
        var r = bar.getBoundingClientRect();
        var pos = round(clamp((e.clientX - r.left) / r.width * 100, 0, 100), 1);
        var list = stops();
        if (list.length >= 8) { toast('8 arrêts au maximum.', 'warn'); return; }
        // the colour at that point: the nearest stop's
        var near = list.reduce(function (a, s) { return Math.abs(s.p - pos) < Math.abs(a.p - pos) ? s : a; }, list[0]);
        var ns = { c: near.c, p: pos };
        list.push(ns);
        list.sort(function (a, b2) { return a.p - b2.p; });
        ds.gStop = list.indexOf(ns);
        setStops(list);
        render();
      });
      tip(barIn, 'Cliquer pour ajouter un arrêt');
      b.appendChild(row('Dégradé', [ed, ibtn(IC.flip, 'Inverser le dégradé', function () {
        setStops(stops().map(function (s) { return { c: s.c, p: 100 - s.p }; }).reverse());
        render();
      })], t, ['gradStops'], 'dz-row--top'));
      var list0 = stops();
      var si = Math.min(ds.gStop, list0.length - 1);
      if (list0[si]) {
        var stopRow = row('Arrêt ' + (si + 1), [
          colorField({ t: t, label: 'Couleur de l’arrêt', get: function () { var l = stops(); return l[si] ? l[si].c : null; },
            set: function (v, isLive) { var l = stops(); if (!l[si] || !v) return; l[si] = { c: v, p: l[si].p }; setStops(l, isLive); } }),
          list0.length > 2 ? ibtn(IC.minus, 'Retirer cet arrêt', function () { var l = stops(); l.splice(si, 1); ds.gStop = 0; setStops(l); render(); }) : null
        ], null, null, 'dz-row--stop');
        b.appendChild(stopRow);
        b.appendChild(row('Position', [
          num({ t: t, letter: '', unit: '%', min: 0, max: 100, dec: 1, title: 'Position de l’arrêt', co: 'gpos',
            get: function () { var l = stops(); return l[si] ? l[si].p : undefined; },
            set: function (v) { var l = stops(); if (!l[si] || v === null) return; var me = { c: l[si].c, p: v }; l[si] = me; l.sort(function (a, b2) { return a.p - b2.p; }); ds.gStop = l.indexOf(me); setStops(l); } })
        ]));
      }
      if (ft === 'linear') {
        var dial = ce('div', 'dz-dial');
        var needle = ce('i', 'dz-dial__n');
        dial.appendChild(needle);
        tip(dial, 'Angle — glisser autour du cercle (Maj : par 15°)');
        reg(function () { var a = val(t, 'gradAngle'); needle.style.transform = 'rotate(' + (a === undefined ? 180 : a) + 'deg)'; });
        dial.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { dial.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
          ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
          function at(ev) {
            var r = dial.getBoundingClientRect();
            var a = Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
            a = (a + 360) % 360;
            if (ev.shiftKey) a = Math.round(a / 15) * 15 % 360;
            setProps(t, { gradAngle: round(a, 0) }, 'Angle du dégradé', 'gangle');
          }
          at(e);
          function mv(ev) { at(ev); }
          function up() { dial.removeEventListener('pointermove', mv); dial.removeEventListener('pointerup', up); ds.scrubbing = false; document.body.classList.remove('dz-scrubbing'); S.applyElStyles(); }
          dial.addEventListener('pointermove', mv);
          dial.addEventListener('pointerup', up);
        });
        b.appendChild(row('Angle', [dial, num({ t: t, prop: 'gradAngle', letter: '∠', unit: '°', min: 0, max: 360, dec: 0, labelText: 'Angle du dégradé', title: 'Angle (0° = vers le haut)', phText: '180' })], t, ['gradAngle']));
      } else {
        b.appendChild(row('Forme', [seg({ t: t, prop: 'gradShape', labelText: 'Forme', cls: 'dz-seg--txt', dflt: 'circle', options: [{ v: 'circle', html: 'Cercle' }, { v: 'ellipse', html: 'Ellipse' }] })], t, ['gradShape']));
        var cg = ce('div', 'dz-grid2');
        cg.appendChild(num({ t: t, prop: 'gradX', letter: 'X', unit: '%', min: 0, max: 100, labelText: 'Centre X', phText: '50' }));
        cg.appendChild(num({ t: t, prop: 'gradY', letter: 'Y', unit: '%', min: 0, max: 100, labelText: 'Centre Y', phText: '50' }));
        b.appendChild(row('Centre', [cg], t, ['gradX', 'gradY']));
      }
    }
    function imageFillRows(t, b) {
      var cur = val(t, 'bgImage');
      var url = cur ? ES.imageUrl(cur) : null;
      var th = focal({ t: t, src: url, xp: 'bgPosX', yp: 'bgPosY', empty: 'Aucune image : choisissez-en une' });
      b.appendChild(row('Image', [th], t, ['bgImage', 'bgPosX', 'bgPosY'], 'dz-row--top'));
      var acts = ce('div', 'dz-btns');
      var pick = ce('button', 'dz-btn', IC.image + '<span>Images…</span>');
      pick.type = 'button';
      tip(pick, 'Choisir dans le panneau Images (vos photos et la photothèque)');
      pick.addEventListener('click', function () {
        if (!hooks.pickAsset) { toast('Le panneau Images n’est pas disponible.', 'warn'); return; }
        hooks.pickAsset({ label: 'Fond : ' + ES.elementDef(t.type, t.el).label, set: function (v) {
          var ref = v && v.image ? v.image : (v && v.photo ? 'demo:' + v.photo : null);
          if (!ref || !ES.normProp('bgImage', ref)) { toast('Cette image n’a pas pu être utilisée.', 'warn'); return; }
          setProps(t, { fillType: 'image', bgImage: ref }, 'Image de fond', null);
          render();
        } });
      });
      var up = ce('button', 'dz-btn', IC.upload + '<span>Importer</span>');
      up.type = 'button';
      up.addEventListener('click', function () {
        var fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = 'image/*';
        fi.addEventListener('change', function () { readBg(fi.files && fi.files[0], function (data) { setProps(t, { fillType: 'image', bgImage: data }, 'Image de fond importée', null); render(); }); });
        fi.click();
      });
      acts.appendChild(pick);
      acts.appendChild(up);
      b.appendChild(row('', [acts]));
      b.appendChild(row('Cadrage', [seg({ t: t, prop: 'bgFit', labelText: 'Cadrage', cls: 'dz-seg--txt', dflt: 'cover', options: [
        { v: 'cover', html: 'Couvrir', tip: 'Couvrir tout le bloc (recadré)' }, { v: 'contain', html: 'Entière', tip: 'Image entière, sans recadrage' },
        { v: 'fill', html: 'Étirer', tip: 'Étirer à la taille du bloc' }, { v: 'tile', html: 'Motif', tip: 'Répéter l’image en motif' }] })], t, ['bgFit']));
      b.appendChild(row('Voile', [colorField({ t: t, prop: 'bgTint', label: 'Voile sur l’image', dflt: '#00000066' })], t, ['bgTint']));
      b.appendChild(row('Fond', [colorField({ t: t, prop: 'fill', label: 'Couleur sous l’image' })], t, ['fill']));
    }
    function readBg(file, done) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('Ce fichier n’est pas une image.', 'warn'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1600;
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var data = c.toDataURL('image/jpeg', 0.82);
          if (data.length > 1500 * 1024) data = c.toDataURL('image/jpeg', 0.6);
          done(data);
        };
        img.onerror = function () { toast('L’image n’a pas pu être lue.', 'err'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    /* the focal-point thumbnail (image fill position, image focus) */
    function focal(o) {
      var box = ce('div', 'dz-focal');
      var img = ce('div', 'dz-focal__img');
      var pt = ce('i', 'dz-focal__p');
      box.appendChild(img);
      box.appendChild(pt);
      if (!o.src) { box.classList.add('is-empty'); box.appendChild(ce('span', 'dz-focal__e', esc(o.empty || 'Aucune image'))); }
      else img.style.backgroundImage = 'url("' + String(o.src).replace(/["\\]/g, '') + '")';
      tip(box, 'Cliquer ou glisser : le point qui reste visible (point focal)');
      function at(e) {
        var r = box.getBoundingClientRect();
        var x = round(clamp((e.clientX - r.left) / r.width * 100, 0, 100), 0), y = round(clamp((e.clientY - r.top) / r.height * 100, 0, 100), 0);
        var p = {}; p[o.xp] = x; p[o.yp] = y;
        setProps(o.t, p, 'Point focal', 'focal' + o.xp);
      }
      box.addEventListener('pointerdown', function (e) {
        if (!o.src || e.button !== 0) return;
        e.preventDefault();
        try { box.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
        at(e);
        var raf = 0, last = null;
        function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (last) at(last); }); }
        function up() { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); ds.scrubbing = false; document.body.classList.remove('dz-scrubbing'); S.applyElStyles(); refresh(); }
        box.addEventListener('pointermove', mv);
        box.addEventListener('pointerup', up);
      });
      reg(function () {
        var x = val(o.t, o.xp), y = val(o.t, o.yp);
        pt.style.left = (x === undefined ? 50 : x) + '%';
        pt.style.top = (y === undefined ? 50 : y) + '%';
        img.style.backgroundPosition = (x === undefined ? 50 : x) + '% ' + (y === undefined ? 50 : y) + '%';
      });
      return box;
    }

    /* ---------------------------------------------------------------- Bordure */
    function borderGroup(t) {
      var on = ['bW', 'bWT', 'bWR', 'bWB', 'bWL'].some(function (p) { return val(t, p) !== undefined; });
      var add = ibtn(on ? IC.minus : IC.plus, on ? 'Retirer la bordure' : 'Ajouter une bordure', function () {
        if (on) setProps(t, { bW: null, bWT: null, bWR: null, bWB: null, bWL: null, bStyle: null, bColor: null, bAlign: null }, 'Bordure retirée', null);
        else setProps(t, { bW: 1, bColor: val(t, 'bColor') || '@text/20', bAlign: val(t, 'bAlign') || 'inside' }, 'Bordure ajoutée', null);
        render();
      });
      var g = group('border', t, [add]);
      g.mark(on);
      if (!on) { g.classList.add('is-empty'); return g; }
      var b = g.body;
      b.appendChild(row('Couleur', [colorField({ t: t, prop: 'bColor', label: 'Bordure', dflt: '#000000' })], t, ['bColor']));
      b.appendChild(row('Épaisseur', [borderWidths(t)], t, ['bW', 'bWT', 'bWR', 'bWB', 'bWL'], 'dz-row--top'));
      b.appendChild(row('Style', [seg({ t: t, prop: 'bStyle', labelText: 'Style de bordure', dflt: 'solid', cls: 'dz-seg--lines', options: [
        { v: 'solid', html: '<i class="dz-ln dz-ln--solid"></i>', tip: 'Continue' }, { v: 'dashed', html: '<i class="dz-ln dz-ln--dashed"></i>', tip: 'Tirets' },
        { v: 'dotted', html: '<i class="dz-ln dz-ln--dotted"></i>', tip: 'Pointillés' }] })], t, ['bStyle']));
      var perSide = ['bWT', 'bWR', 'bWB', 'bWL'].some(function (p) { return val(t, p) !== undefined; });
      var dashed = (val(t, 'bStyle') || 'solid') !== 'solid';
      var alRow = row('Position', [seg({ t: t, prop: 'bAlign', labelText: 'Position de la bordure', dflt: 'inside', options: [
        { v: 'inside', html: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-dasharray="1.4 1.4"/><rect x="4.5" y="4.5" width="7" height="7" rx=".5" stroke-width="2"/>'), tip: 'Intérieure : dans la boîte (ne déplace rien)' },
        { v: 'center', html: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke-width="2.2"/>'), tip: 'Centrée : à cheval sur le bord' },
        { v: 'outside', html: svg('<rect x="5" y="5" width="6" height="6" rx=".5" stroke-dasharray="1.4 1.4"/><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-width="2"/>'), tip: 'Extérieure : autour de la boîte (ne déplace rien)' }] })], t, ['bAlign']);
      if (perSide || dashed) { alRow.classList.add('is-soft'); tip(alRow.lab, 'Une bordure en tirets, en pointillés ou par côté est toujours intérieure.'); }
      b.appendChild(alRow);
      return g;
    }

    /* uniform width (bW) when linked; per side (bWT…bWL, inside) when not */
    function borderWidths(t) {
      var box = ce('div', 'dz-quad');
      var r1 = ce('div', 'dz-quad__r');
      var linkKey = t.key + ':bw';
      if (ds.links[linkKey] === undefined) ds.links[linkKey] = !['bWT', 'bWR', 'bWB', 'bWL'].some(function (p) { return val(t, p) !== undefined; });
      var linked = ds.links[linkKey];
      var wIcon = svg('<path d="M2.5 4h11" stroke-width="1"/><path d="M2.5 8h11" stroke-width="2"/><path d="M2.5 12.5h11" stroke-width="3"/>');
      if (linked) {
        r1.appendChild(num({ t: t, prop: 'bW', icon: wIcon, unit: 'px', min: 0, max: 64, labelText: 'Épaisseur de bordure', title: 'Épaisseur de la bordure', co: 'bw' }));
      } else {
        var g4 = ce('div', 'dz-quad__g');
        ['bWT', 'bWR', 'bWB', 'bWL'].forEach(function (p, i) {
          g4.appendChild(num({ t: t, prop: p, letter: 'HDBG'[i], min: 0, max: 64, labelText: 'Épaisseur de bordure', co: 'bw' + p,
            title: 'Bordure ' + ['haut', 'droite', 'bas', 'gauche'][i], ph: function () { var w = val(t, 'bW'); return w === undefined ? null : w; } }));
        });
        r1.appendChild(g4);
      }
      r1.appendChild(ibtn(linked ? IC.link : IC.unlink, linked ? 'Même épaisseur partout — cliquer pour régler chaque côté' : 'Un côté à la fois — cliquer pour une épaisseur unique', function () {
        var nowLinked = !ds.links[linkKey];
        ds.links[linkKey] = nowLinked;
        if (nowLinked) setProps(t, { bWT: null, bWR: null, bWB: null, bWL: null }, 'Bordure uniforme', null);
        render();
      }, 'dz-link' + (linked ? ' is-on' : '')));
      box.appendChild(r1);
      return box;
    }

    /* ---------------------------------------------------------------- Ombre */
    function shadowGroup(t) {
      var list = val(t, 'shadows');
      var add = ibtn(IC.plus, 'Ajouter une ombre', function () {
        var l = (val(t, 'shadows') || []).slice();
        if (l.length >= 6) { toast('6 ombres au maximum.', 'warn'); return; }
        l.push({ x: 0, y: 4, blur: 12, spread: 0, c: '#00000026', inset: false });
        ds.shadowOpen = l.length - 1;
        setProps(t, { shadows: l }, 'Ombre ajoutée', null);
        render();
      });
      var g = group('shadow', t, [add]);
      g.mark(Array.isArray(list));
      var b = g.body;
      var chips = ce('div', 'dz-presets');
      ES.SHADOW_PRESETS.forEach(function (p) {
        var c = ce('button', 'dz-preset', '<i class="dz-preset__bg"><i class="dz-preset__s" style="box-shadow:' + esc(ES.decls({ shadows: p.shadows }, t.def)['']['box-shadow'] || 'none') + '"></i></i><span>' + esc(p.label) + '</span>');
        c.type = 'button';
        tip(c, p.id === 'none' ? 'Retirer toute ombre (même celle du modèle)' : 'Ombre « ' + p.label + ' »');
        c.addEventListener('click', function () { ds.shadowOpen = -1; setProps(t, { shadows: clone(p.shadows) }, 'Ombre « ' + p.label + ' »', null); render(); });
        chips.appendChild(c);
      });
      b.appendChild(chips);
      if (!Array.isArray(list)) { b.appendChild(ce('p', 'dz-note dz-note--block', 'L’ombre du modèle. Choisissez un préréglage ou ajoutez une ombre (+).')); return g; }
      if (!list.length) { b.appendChild(ce('p', 'dz-note dz-note--block', 'Aucune ombre (celle du modèle est retirée).')); }
      function setList(l, co) { setProps(t, { shadows: l }, 'Ombre modifiée', co || 'shadow'); }
      list.forEach(function (s, i) {
        var item = ce('div', 'dz-sh' + (ds.shadowOpen === i ? ' is-open' : ''));
        var head = ce('div', 'dz-sh__h');
        var cf = colorField({ t: t, label: 'Couleur de l’ombre', get: function () { var l = val(t, 'shadows') || []; return l[i] ? l[i].c : null; },
          set: function (v) { var l = clone(val(t, 'shadows') || []); if (!l[i] || !v) return; l[i].c = v; setList(l, 'shc' + i); } });
        cf.classList.add('dz-color--mini');
        head.appendChild(cf);
        var sum = ce('button', 'dz-sh__sum');
        sum.type = 'button';
        reg(function () { var l = val(t, 'shadows') || []; var x = l[i]; if (x) sum.textContent = (x.inset ? 'Intérieure · ' : '') + x.x + ' · ' + x.y + ' · ' + x.blur + ' · ' + x.spread; });
        tip(sum, 'X · Y · flou · étendue — cliquer pour régler');
        sum.addEventListener('click', function () { ds.shadowOpen = ds.shadowOpen === i ? -1 : i; render(); });
        head.appendChild(sum);
        head.appendChild(ibtn(IC.minus, 'Retirer cette ombre', function () {
          var l = clone(val(t, 'shadows') || []);
          l.splice(i, 1);
          ds.shadowOpen = -1;
          setProps(t, { shadows: l.length ? l : null }, 'Ombre retirée', null);
          render();
        }));
        item.appendChild(head);
        if (ds.shadowOpen === i) {
          var gq = ce('div', 'dz-grid2');
          [['x', 'X', -200, 200, 'Décalage horizontal'], ['y', 'Y', -200, 200, 'Décalage vertical'], ['blur', 'F', 0, 400, 'Flou'], ['spread', 'É', -200, 200, 'Étendue']].forEach(function (f) {
            gq.appendChild(num({ t: t, letter: f[1], unit: 'px', min: f[2], max: f[3], title: f[4], co: 'sh' + i + f[0],
              get: function () { var l = val(t, 'shadows') || []; return l[i] ? l[i][f[0]] : undefined; },
              set: function (v) { var l = clone(val(t, 'shadows') || []); if (!l[i]) return; l[i][f[0]] = v === null ? 0 : v; setList(l, 'sh' + i + f[0]); } }));
          });
          item.appendChild(gq);
          var tools = ce('div', 'dz-sh__tools');
          tools.appendChild(seg({ t: t, cls: 'dz-seg--txt', options: [{ v: false, html: 'Portée', tip: 'Ombre portée (dehors)' }, { v: true, html: 'Intérieure', tip: 'Ombre intérieure (inset)' }],
            get: function () { var l = val(t, 'shadows') || []; return l[i] ? !!l[i].inset : false; },
            set: function (v) { var l = clone(val(t, 'shadows') || []); if (!l[i]) return; l[i].inset = !!v; setList(l, null); } }));
          var upB = ibtn(IC.up, 'Monter (dessinée au-dessus)', function () { var l = clone(val(t, 'shadows') || []); if (i < 1) return; var x = l.splice(i, 1)[0]; l.splice(i - 1, 0, x); ds.shadowOpen = i - 1; setList(l, null); render(); });
          var dnB = ibtn(IC.down, 'Descendre', function () { var l = clone(val(t, 'shadows') || []); if (i >= l.length - 1) return; var x = l.splice(i, 1)[0]; l.splice(i + 1, 0, x); ds.shadowOpen = i + 1; setList(l, null); render(); });
          upB.disabled = i === 0;
          dnB.disabled = i === list.length - 1;
          tools.appendChild(upB);
          tools.appendChild(dnB);
          item.appendChild(tools);
        }
        b.appendChild(item);
      });
      var dr = ce('div', 'dz-dotrow');
      dr.appendChild(ce('span', 'dz-note', 'Ombres'));
      dr.appendChild(dot(t, ['shadows']));
      b.appendChild(dr);
      return g;
    }

    /* ---------------------------------------------------------------- Effets */
    function effectsGroup(t) {
      var g = group('effects', t);
      g.mark(anySet(t, ['blur', 'bblur', 'rotate', 'scale', 'skewX', 'skewY', 'tx', 'ty']));
      var b = g.body;
      var bl = ce('div', 'dz-grid2');
      bl.appendChild(num({ t: t, prop: 'blur', icon: IC.blur, unit: 'px', min: 0, max: 100, labelText: 'Flou', title: 'Flou de l’élément' }));
      bl.appendChild(num({ t: t, prop: 'bblur', letter: '▒', unit: 'px', min: 0, max: 100, labelText: 'Flou d’arrière-plan', title: 'Flou de ce qui est derrière (verre dépoli) — avec un fond semi-transparent' }));
      b.appendChild(row('Flou', [bl], t, ['blur', 'bblur']));
      var tr = ce('div', 'dz-grid2');
      tr.appendChild(num({ t: t, prop: 'rotate', icon: IC.rot, unit: '°', min: -360, max: 360, labelText: 'Rotation', title: 'Rotation', phText: '0' }));
      tr.appendChild(num({ t: t, prop: 'scale', icon: IC.scale, unit: '%', min: 10, max: 400, labelText: 'Échelle', title: 'Échelle (100 % = taille normale)', phText: '100' }));
      b.appendChild(row('Rotation', [tr], t, ['rotate', 'scale']));
      var sk = ce('div', 'dz-grid2');
      sk.appendChild(num({ t: t, prop: 'skewX', letter: '⧸', unit: '°', min: -80, max: 80, labelText: 'Inclinaison X', title: 'Inclinaison horizontale', phText: '0' }));
      sk.appendChild(num({ t: t, prop: 'skewY', letter: '⧹', unit: '°', min: -80, max: 80, labelText: 'Inclinaison Y', title: 'Inclinaison verticale', phText: '0' }));
      b.appendChild(row('Incliner', [sk], t, ['skewX', 'skewY']));
      var mv = ce('div', 'dz-grid2');
      mv.appendChild(num({ t: t, prop: 'tx', letter: 'X', unit: 'px', min: -2000, max: 2000, labelText: 'Décalage X', title: 'Déplacer horizontalement (sans changer la mise en page)', phText: '0' }));
      mv.appendChild(num({ t: t, prop: 'ty', letter: 'Y', unit: 'px', min: -2000, max: 2000, labelText: 'Décalage Y', title: 'Déplacer verticalement (sans changer la mise en page)', phText: '0' }));
      b.appendChild(row('Décaler', [mv], t, ['tx', 'ty']));
      return g;
    }

    /* ---------------------------------------------------------------- Typographie */
    function fontLabel(v) {
      if (!v) return 'Police du modèle';
      if (v === '@display') return 'Police des titres (boutique)';
      if (v === '@text') return 'Police des textes (boutique)';
      var f = ES.fontInfo(v);
      return f ? f.name : v;
    }
    var fontMenu = null;
    function closeFontMenu() { if (fontMenu) { fontMenu.remove(); fontMenu = null; document.removeEventListener('pointerdown', fontOutside, true); return true; } return false; }
    function fontOutside(e) { if (fontMenu && !fontMenu.contains(e.target) && !(e.target.closest && e.target.closest('.dz-font'))) closeFontMenu(); }
    var samplesLoaded = {};
    function fontPicker(t, fprop) {
      fprop = fprop || 'font';
      var b = ce('button', 'dz-font');
      b.type = 'button';
      var nameEl = ce('span', 'dz-font__n');
      b.appendChild(nameEl);
      b.insertAdjacentHTML('beforeend', IC.caret);
      reg(function () {
        var v = val(t, fprop);
        nameEl.textContent = fprop === 'font' ? fontLabel(v) : (v ? fontLabel(v) : 'Police de la boutique');
        b.classList.toggle('is-set', !!v);
        var f = v && v.charAt(0) !== '@' ? ES.fontInfo(v) : null;
        nameEl.style.fontFamily = f ? f.stack : (v === '@display' ? 'var(--dz-store-display)' : '');
      });
      b.addEventListener('click', function () {
        if (fontMenu) { closeFontMenu(); return; }
        var m = ce('div', 'dz-fontmenu');
        m.setAttribute('role', 'listbox');
        var search = ce('input', 'dz-fontmenu__q');
        search.placeholder = 'Rechercher une police…';
        search.setAttribute('aria-label', 'Rechercher une police');
        m.appendChild(search);
        var list = ce('div', 'dz-fontmenu__l');
        m.appendChild(list);
        var items = [];
        function item(v, label, family, cat) {
          /* « Abonnements Studio »: the catalogue fonts are locked on Découverte (visible, with a lock;
           * a click opens the upgrade sheet); the template's own fonts always stay free */
          var locked = !!v && v.charAt(0) !== '@' && typeof S.can === 'function' && !S.can('fonts');
          var it = ce('button', 'dz-fontmenu__i' + (val(t, fprop) === v || (!v && !val(t, fprop)) ? ' is-on' : '') + (locked ? ' is-locked' : ''), '<span>' + esc(label) + '</span>' + (cat ? '<small>' + esc(cat) + '</small>' : '') + (locked ? '<svg class="dz-fontmenu__lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' : ''));
          it.type = 'button';
          if (locked) it.setAttribute('aria-label', label + ' (avec un abonnement Studio)');
          if (family) it.firstChild.style.fontFamily = family;
          it.addEventListener('click', function () {
            closeFontMenu();
            if (locked && typeof S.gate === 'function' && !S.gate('fonts')) return;
            var fp = {}; fp[fprop] = v; setProps(t, fp, 'Police : ' + label, null);
          });
          it.setAttribute('data-q', (label + ' ' + (cat || '')).toLowerCase());
          list.appendChild(it);
          items.push(it);
        }
        item(null, fprop === 'font' ? 'Police du modèle' : 'Police de la boutique', '', '');
        if (fprop === 'font') {
          item('@display', 'Police des titres', 'var(--dz-store-display)', 'boutique');
          item('@text', 'Police des textes', 'var(--dz-store-text)', 'boutique');
        }
        var styles = {};
        try { (D.FONT_STYLES || []).forEach(function (s) { if (s && s.id) styles[s.id] = s.label || s.name || s.id; }); } catch (e) { /* none */ }
        var fonts = [];
        try { (D.FONTS || []).forEach(function (f) { fonts.push(f); }); } catch (e) { /* none */ }
        fonts.forEach(function (f) {
          // a sample of the name in its own face (a few KB each), once per page
          if (!samplesLoaded[f.id] && typeof D.fontSampleUrl === 'function') {
            samplesLoaded[f.id] = 1;
            try {
              var l = document.createElement('link');
              l.rel = 'stylesheet';
              l.href = D.fontSampleUrl(f.id, f.name);
              document.head.appendChild(l);
            } catch (e) { /* the name shows in Inter */ }
          }
          item(f.id, f.name, f.stack, styles[f.style] || styles[f.kind] || f.style || '');
        });
        search.addEventListener('input', function () {
          var q = search.value.trim().toLowerCase();
          items.forEach(function (it) { it.hidden = !!q && it.getAttribute('data-q').indexOf(q) === -1; });
        });
        search.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFontMenu(); b.focus(); }
          if (e.key === 'Enter') { var first = items.filter(function (it) { return !it.hidden; })[0]; if (first) first.click(); }
          e.stopPropagation();
        });
        document.body.appendChild(m);
        var r = b.getBoundingClientRect();
        var right = document.querySelector('.st-right');
        var rr = right ? right.getBoundingClientRect() : r;
        m.style.left = Math.max(8, rr.left - 248) + 'px';
        m.style.top = Math.max(56, Math.min(window.innerHeight - 420, r.top - 60)) + 'px';
        fontMenu = m;
        document.addEventListener('pointerdown', fontOutside, true);
        var on = list.querySelector('.is-on');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'center' });
        search.focus();
      });
      return b;
    }
    function typoGroup(t) {
      var g = group('typography', t);
      g.mark(anySet(t, ['font', 'fontSize', 'fontWeight', 'italic', 'lh', 'ls', 'textCase', 'deco', 'color', 'textAlign']));
      var b = g.body;
      b.appendChild(row('Police', [fontPicker(t)], t, ['font']));
      var r1 = ce('div', 'dz-grid2');
      r1.appendChild(num({ t: t, prop: 'fontSize', letter: 'T', unit: 'px', min: 6, max: 240, labelText: 'Taille du texte', title: 'Taille du texte' }));
      var wOpts = [{ v: '', label: 'Graisse' }];
      var f = val(t, 'font');
      var fi = f && f.charAt(0) !== '@' ? ES.fontInfo(f) : null;
      var WL = { 100: 'Très fin', 200: 'Ultra fin', 300: 'Fin', 400: 'Normal', 500: 'Moyen', 600: 'Semi-gras', 700: 'Gras', 800: 'Très gras', 900: 'Noir' };
      ((fi && fi.weights) || [100, 200, 300, 400, 500, 600, 700, 800, 900]).forEach(function (w) { wOpts.push({ v: String(w), label: w + ' · ' + (WL[w] || '') }); });
      var ws = selectCtl({ t: t, prop: 'fontWeight', options: wOpts, numeric: true, labelText: 'Graisse', title: 'Graisse' });
      r1.appendChild(ws);
      b.appendChild(row('Taille', [r1], t, ['fontSize', 'fontWeight']));
      var r2 = ce('div', 'dz-grid2');
      r2.appendChild(num({ t: t, prop: 'lh', letter: '↕', unit: '×', min: 0.5, max: 4, step: 0.01, kstep: 0.05, dec: 2, labelText: 'Interligne', title: 'Interligne (× la taille)' }));
      r2.appendChild(num({ t: t, prop: 'ls', letter: '↔', unit: '%', min: -20, max: 100, step: 0.1, kstep: 0.5, dec: 1, labelText: 'Espacement des lettres', title: 'Espacement des lettres (% de la taille, comme Figma)' }));
      b.appendChild(row('Espaces', [r2], t, ['lh', 'ls']));
      b.appendChild(row('Casse', [seg({ t: t, prop: 'textCase', labelText: 'Casse', toggle: true, cls: 'dz-seg--txt', options: [
        { v: 'none', html: '—', tip: 'Casse d’origine' }, { v: 'upper', html: 'AB', tip: 'Capitales' }, { v: 'lower', html: 'ab', tip: 'Minuscules' }, { v: 'capitalize', html: 'Ab', tip: 'Initiales en capitale' }] })], t, ['textCase']));
      var styleCtl = ce('div', 'dz-flex');
      styleCtl.appendChild(seg({ t: t, prop: 'italic', labelText: 'Italique', toggle: true, options: [{ v: true, html: IC.italic, tip: 'Italique' }] }));
      styleCtl.appendChild(seg({ t: t, prop: 'deco', labelText: 'Décoration', toggle: true, options: [{ v: 'underline', html: IC.ul, tip: 'Souligné' }, { v: 'line-through', html: IC.strike, tip: 'Barré' }] }));
      b.appendChild(row('Style', [styleCtl], t, ['italic', 'deco']));
      b.appendChild(row('Couleur', [colorField({ t: t, prop: 'color', label: 'Couleur du texte', ph: function () { return live(t, 'color'); } })], t, ['color']));
      b.appendChild(row('Aligner', [seg({ t: t, prop: 'textAlign', labelText: 'Alignement du texte', toggle: true, options: [
        { v: 'left', html: IC.alL, tip: 'À gauche' }, { v: 'center', html: IC.alC, tip: 'Centré' }, { v: 'right', html: IC.alR, tip: 'À droite' }, { v: 'justify', html: IC.alJ, tip: 'Justifié' }] })], t, ['textAlign']));
      return g;
    }
    // a section: the colour of its texts (and of the store's --st-text inside it)
    function sectionTextGroup(t) {
      var g = group('text', t);
      g.mark(anySet(t, ['color', 'textAlign']));
      g.body.appendChild(row('Couleur', [colorField({ t: t, prop: 'color', label: 'Couleur des textes', ph: function () { return live(t, 'color'); } })], t, ['color']));
      g.body.appendChild(row('Aligner', [seg({ t: t, prop: 'textAlign', labelText: 'Alignement', toggle: true, options: [
        { v: 'left', html: IC.alL, tip: 'À gauche' }, { v: 'center', html: IC.alC, tip: 'Centré' }, { v: 'right', html: IC.alR, tip: 'À droite' }] })], t, ['textAlign']));
      return g;
    }

    /* ---------------------------------------------------------------- Image */
    function imageGroup(t) {
      var g = group('image', t);
      g.mark(anySet(t, ['fit', 'focusX', 'focusY', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'hue']));
      var b = g.body;
      var el = liveEl(t);
      var img = el ? (el.tagName === 'IMG' ? el : el.querySelector('img')) : null;
      var src = img ? (img.currentSrc || img.src) : null;
      var th = focal({ t: t, src: src, xp: 'focusX', yp: 'focusY', empty: 'Pas de photo ici : une illustration du modèle' });
      th.classList.add('dz-focal--img');
      b.appendChild(row('Cadrer', [th], t, ['focusX', 'focusY'], 'dz-row--top'));
      b.appendChild(row('Ajuster', [seg({ t: t, prop: 'fit', labelText: 'Ajustement', toggle: true, cls: 'dz-seg--txt', options: [
        { v: 'cover', html: 'Remplir', tip: 'Remplir le cadre (recadrée)' }, { v: 'contain', html: 'Ajuster', tip: 'Image entière dans le cadre' },
        { v: 'fill', html: 'Étirer', tip: 'Étirer au cadre' }, { v: 'none', html: 'Réelle', tip: 'Taille réelle, sans redimensionner' }] })], t, ['fit']));
      [['brightness', 'Lumière', 0, 200, 100], ['contrast', 'Contraste', 0, 200, 100], ['saturate', 'Saturation', 0, 200, 100], ['grayscale', 'N & B', 0, 100, 0],
        ['sepia', 'Sépia', 0, 100, 0], ['hue', 'Teinte', -180, 180, 0]].forEach(function (f) {
        b.appendChild(row(f[1], [slider({ t: t, prop: f[0], min: f[2], max: f[3], neutral: f[4], unit: f[0] === 'hue' ? '°' : '%', labelText: f[1], title: f[1] })], t, [f[0]]));
      });
      var rs = ce('button', 'dz-linkbtn', 'Réinitialiser les filtres');
      rs.type = 'button';
      rs.addEventListener('click', function () { setProps(t, { brightness: null, contrast: null, saturate: null, grayscale: null, sepia: null, hue: null }, 'Filtres réinitialisés', null); });
      b.appendChild(row('', [rs]));
      return g;
    }

    /* ---------------------------------------------------------------- CSS */
    function cssFor(t) {
      try { return ES.css(cfg(), { only: t.key, scope: '.jst' }); } catch (e) { return ''; }
    }
    function shortenData(css) {
      css = css.replace(/url\("data:image\/svg\+xml,[^"]+"\)/g, 'url("data:image/svg+xml,…") /* icône */');
      return css.replace(/url\("data:image\/(\w+);base64,([A-Za-z0-9+/=]+)"\)/g, function (m, kind, b64) {
        return 'url("data:image/' + kind + ';base64,…") /* image intégrée, ' + Math.max(1, Math.round(b64.length * 3 / 4 / 1024)) + ' Ko */';
      });
    }
    function cssGroup(t) {
      var g = group('css', t, [ibtn(IC.copy, 'Copier le CSS', function () {
        var text = cssFor(t);
        if (!text) { toast('Aucun style à copier ici.'); return; }
        try { navigator.clipboard.writeText(text).then(function () { toast('CSS copié.', 'ok'); }, function () { toast('La copie a été bloquée par le navigateur.', 'warn'); }); }
        catch (e) { toast('La copie a été bloquée par le navigateur.', 'warn'); }
      })]);
      var pre = ce('pre', 'dz-css');
      pre.tabIndex = 0;
      reg(function () {
        var text = cssFor(t);
        pre.textContent = text ? shortenData(text) : '/* Le modèle, sans réglage. Réglez une valeur : le CSS généré s’affiche ici. */';
      });
      g.body.appendChild(pre);
      return g;
    }

    /* ================================================================ per-type panels */

    var KIND_NAME = { button: 'Bouton', text: 'Texte', image: 'Image', container: 'Bloc', section: 'Section', badge: 'Badge', icon: 'Icône', card: 'Carte produit', page: 'Page' };
    var KIND_ICON = {
      button: svg('<rect x="2" y="4.5" width="12" height="7" rx="3.5"/><path d="M5.5 8h5"/>'),
      text: svg('<path d="M3.5 4.5V3.2h9v1.3M8 3.2v9.6M6 12.8h4"/>'),
      image: IC.image,
      container: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/>'),
      section: svg('<rect x="1.8" y="3" width="12.4" height="10" rx="1.5"/><path d="M1.8 6.5h12.4"/>'),
      badge: svg('<path d="M2.5 8.6V3.5a1 1 0 0 1 1-1h5.1l5.4 5.4-5.6 5.6z"/><circle cx="5.6" cy="5.6" r="1"/>'),
      icon: svg('<path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z"/>'),
      card: svg('<rect x="3" y="1.8" width="10" height="12.4" rx="1.5"/><rect x="4.6" y="3.4" width="6.8" height="5" rx="1"/><path d="M4.6 10.6h4.5M4.6 12.4h2.6"/>'),
      page: svg('<path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M9.5 1.8V5h3"/>')
    };
    function fieldValue(t) {
      var s = S.sectionById(t.sid);
      if (!s || !t.def.field || !s.settings) return '';
      var v = s.settings[t.def.field];
      return typeof v === 'string' ? v.trim() : '';
    }
    function short(text, n) { text = String(text || '').replace(/\s+/g, ' ').trim(); return text.length > n ? text.slice(0, n - 1) + '…' : text; }
    function typedTitle(t) {
      var k = t.def.kind;
      if (k === 'page') return 'Page · Accueil';
      if (!t.def.sel && CHROME_IDS[t.sid]) return S.chromeName(t.sid);
      if (k === 'section') {
        var st = D.sectionTypes && D.sectionTypes[t.type];
        return 'Section · ' + ((st && st.name) || t.type);
      }
      if (k === 'button') {
        var lab = fieldValue(t);
        if (!lab) { var el = liveEl(t); lab = el ? el.textContent : ''; }
        return 'Bouton · ' + short(lab || t.def.label, 22);
      }
      if (k === 'image') return 'Image · ' + short(t.scopeName, 22);
      if (k === 'icon') return 'Icône · ' + t.def.label;
      if (k === 'card') return 'Carte produit' + (t.item && t.product ? ' · ' + short(t.product.name, 18) : '');
      if (k === 'badge') return 'Badge';
      return t.def.label;
    }

    /* « Essentiel » — the controls she reaches for first, in one place */
    var SIZES = {
      S: { pt: 8, pb: 8, pl: 14, pr: 14, fontSize: 12, minH: 34 },
      M: { pt: 12, pb: 12, pl: 22, pr: 22, fontSize: 14, minH: 44 },
      L: { pt: 16, pb: 16, pl: 32, pr: 32, fontSize: 16, minH: 56 }
    };
    function sizeOf(t) {
      var fs = val(t, 'fontSize'), mh = val(t, 'minH');
      var hit = null;
      Object.keys(SIZES).forEach(function (k) { if (SIZES[k].fontSize === fs && SIZES[k].minH === mh) hit = k; });
      return hit;
    }
    function quickGroup(t) {
      var g = group('quick', t);
      var b = g.body;
      var k = t.def.kind;
      if (k === 'button' || k === 'badge') {
        b.appendChild(row('Fond', [colorField({ t: t, label: 'Fond', ph: function () { return live(t, 'fill'); }, gradient: function () { return fillGradient(t); },
          get: function () { var ft = val(t, 'fillType'); return ft === 'solid' ? val(t, 'fill') : (ft === 'linear' || ft === 'radial') ? ((val(t, 'gradStops') || [])[0] || {}).c : null; },
          set: function (v) { setProps(t, { fillType: 'solid', fill: v }, 'Fond modifié', 'qfill'); } })], t, ['fillType', 'fill', 'gradStops']));
        b.appendChild(row('Texte', [colorField({ t: t, prop: 'color', label: 'Couleur du texte', ph: function () { return live(t, 'color'); } })], t, ['color']));
      }
      if (k === 'button' || k === 'badge') {
        var r = ce('div', 'dz-flex dz-flex--nowrap');
        r.appendChild(num({ t: t, icon: svg('<path d="M3 13V8a5 5 0 015-5h5"/>'), unit: 'px', min: 0, max: 999, labelText: 'Rayon', co: 'rad', title: 'Rayon des coins',
          get: function () { var v = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { return val(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : undefined; },
          ph: function () { return live(t, 'rTL'); },
          set: function (v) { setProps(t, { rTL: v, rTR: v, rBR: v, rBL: v }, 'Rayon modifié', 'rad'); } }));
        if (k === 'button') r.appendChild(seg({ t: t, cls: 'dz-seg--txt dz-seg--sml', toggle: true, options: [{ v: 'S', html: 'S', tip: 'Petit' }, { v: 'M', html: 'M', tip: 'Moyen' }, { v: 'L', html: 'L', tip: 'Grand' }],
          get: function () { return sizeOf(t); },
          set: function (v) {
            var p = {};
            Object.keys(SIZES.M).forEach(function (key) { p[key] = v ? SIZES[v][key] : null; });
            setProps(t, p, 'Taille ' + (v || 'du modèle'), null);
          } }));
        b.appendChild(row('Forme', [r], t, ['rTL', 'rTR', 'rBR', 'rBL', 'fontSize', 'minH']));
      }
      if (k === 'text') {
        var r2 = ce('div', 'dz-flex dz-flex--nowrap');
        r2.appendChild(num({ t: t, prop: 'fontSize', letter: 'T', unit: 'px', min: 6, max: 240, labelText: 'Taille du texte', title: 'Taille du texte' }));
        r2.appendChild(boldSeg(t));
        b.appendChild(row('Taille', [r2], t, ['fontSize', 'fontWeight']));
        b.appendChild(row('Couleur', [colorField({ t: t, prop: 'color', label: 'Couleur du texte', ph: function () { return live(t, 'color'); } })], t, ['color']));
        b.appendChild(row('Aligner', [seg({ t: t, prop: 'textAlign', labelText: 'Alignement du texte', toggle: true, options: [
          { v: 'left', html: IC.alL, tip: 'À gauche' }, { v: 'center', html: IC.alC, tip: 'Centré' }, { v: 'right', html: IC.alR, tip: 'À droite' }, { v: 'justify', html: IC.alJ, tip: 'Justifié' }] })], t, ['textAlign']));
      }
      if (k === 'button') {
        var r3 = ce('div', 'dz-flex dz-flex--nowrap');
        r3.appendChild(boldSeg(t));
        r3.appendChild(seg({ t: t, cls: 'dz-seg--txt', options: [{ v: false, html: 'Sans bord', tip: 'Pas de bordure' }, { v: true, html: 'Bordure', tip: 'Une bordure de 1,5 px' }],
          get: function () { var w = val(t, 'bW'); return w !== undefined ? w > 0 : null; },
          set: function (v) { setProps(t, v ? { bW: 1.5, bColor: val(t, 'bColor') || '@text', bAlign: 'inside' } : { bW: 0 }, v ? 'Bordure ajoutée' : 'Bordure retirée', null); render(); } }));
        b.appendChild(row('Style', [r3], t, ['fontWeight', 'bW']));
        // the hover colour, whatever the state tab shows
        b.appendChild(row('Au survol', [colorField({ t: t, label: 'Fond au survol',
          get: function () { var e = entryOf(t); return e && e.hover && e.hover.fillType === 'solid' ? e.hover.fill : null; },
          set: function (v) { setProps(t, { fillType: v ? 'solid' : null, fill: v }, 'Fond au survol', 'qhover', { layer: 'hover' }); } })], null, null));
      }
      return g;
    }
    function boldSeg(t) {
      return seg({ t: t, labelText: 'Gras', toggle: true, options: [{ v: 700, html: '<b class="dz-bold">B</b>', tip: 'Gras' }],
        get: function () { var w = val(t, 'fontWeight'); return w !== undefined && w >= 600 ? 700 : null; },
        set: function (v) { setProps(t, { fontWeight: v ? 700 : null }, v ? 'Gras' : 'Graisse du modèle', null); } });
    }

    /* « Contenu » — the words (fiche fields), the link, the photo */
    var LINKS = { hero: 'Ouvre le catalogue de la boutique', whatsapp: 'Ouvre WhatsApp, au numéro de la boutique', products: 'Ajoute le produit au panier' };
    function contentGroup(t) {
      var s = S.sectionById(t.sid);
      var k = t.def.kind;
      var hasText = !!(t.def.field && s && S.hasField(s.type, t.def.field));
      var hasImg = k === 'image' && (t.type === 'hero' || t.type === 'about');
      if (!hasText && k !== 'button' && !hasImg) return null;
      var g = group('content', t);
      var b = g.body;
      if (hasText) {
        var f = S.defFields(s.type).filter(function (x) { return x.key === t.def.field; })[0] || {};
        var multi = f.type === 'textarea';
        var inp = ce(multi ? 'textarea' : 'input', 'dz-text');
        if (!multi) inp.type = 'text';
        if (typeof f.max === 'number') inp.maxLength = f.max;
        inp.value = s.settings[t.def.field] == null ? '' : String(s.settings[t.def.field]);
        inp.setAttribute('aria-label', f.label || 'Texte');
        inp.addEventListener('input', function () {
          var v = inp.value;
          S.commit('Texte modifié (' + String(f.label || t.def.label).toLowerCase() + ')', function (c) {
            var x = (c.sections || []).filter(function (y) { return y.id === t.sid; })[0];
            if (x && x.settings) x.settings[t.def.field] = v;
          }, { coalesce: 'field:' + t.sid + ':' + t.def.field });
        });
        inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
        reg(function () {
          if (document.activeElement === inp) return;
          var x = S.sectionById(t.sid);
          var v = x && x.settings && x.settings[t.def.field] != null ? String(x.settings[t.def.field]) : '';
          if (inp.value !== v) inp.value = v;
        });
        b.appendChild(row(k === 'button' ? 'Libellé' : (f.label && f.label.length < 10 ? f.label : 'Texte'), [inp], null, null, multi ? 'dz-row--top' : ''));
      }
      if (k === 'button') b.appendChild(linkRows(t, s));
      if (hasImg) {
        var acts = ce('div', 'dz-btns');
        var rep = ce('button', 'dz-btn', IC.image + '<span>Remplacer…</span>');
        rep.type = 'button';
        tip(rep, 'Choisir une autre photo (panneau Images)');
        rep.addEventListener('click', function () { S.select({ kind: 'section', id: t.sid }); S.pickImageForSelection(); });
        acts.appendChild(rep);
        b.appendChild(row('Photo', [acts]));
        var ar = altRow(t);
        if (ar) b.appendChild(ar);
      }
      return g;
    }

    /* « Lien » of a button (sections[].settings.buttonLink): the template's default, a page of the journey,
     * one of her pages, a section of the home page (scroll), a product, WhatsApp, or an https:// address,
     * in a new tab or not. render.js turns the button into an <a href> */
    function linkRows(t, s) {
      var box = ce('div', 'dz-link');
      if (!s || !s.settings || (t.type !== 'hero' && t.type !== 'whatsapp')) { box.appendChild(ce('span', 'dz-note dz-note--wrap', esc(LINKS[t.type] || 'Lien du modèle'))); return row('Lien', [box]); }
      var cur = function () { var x = S.sectionById(t.sid); return x && x.settings ? (x.settings.buttonLink || '') : ''; };
      var opts = [['', t.type === 'whatsapp' ? 'Par défaut : WhatsApp (aperçu)' : 'Aucun lien (le bouton du modèle)'], ['home', 'Accueil'], ['cart', 'Panier']];
      (cfg().pages || []).forEach(function (pg) { opts.push(['page:' + pg.id, 'Page : ' + (pg.title || pg.slug)]); });
      S.sections().forEach(function (x) { if (x.id !== t.sid) opts.push(['section:' + x.id, 'Section : ' + S.sectionName(x)]); });
      S.products().slice(0, 60).forEach(function (pr) { opts.push(['product:' + pr.id, 'Produit : ' + (pr.name || pr.id)]); });
      opts.push(['whatsapp', 'WhatsApp de la boutique'], ['url', 'Adresse web (https://…)']);
      var sel = ce('select', 'dz-select');
      sel.setAttribute('aria-label', 'Lien du bouton');
      opts.forEach(function (o) { var op = ce('option'); op.value = o[0]; op.textContent = o[1].length > 48 ? o[1].slice(0, 47) + '…' : o[1]; sel.appendChild(op); });
      var url = ce('input', 'dz-text');
      url.type = 'url'; url.placeholder = 'https://…'; url.maxLength = 300;
      url.setAttribute('aria-label', 'Adresse du lien (https://)');
      var nt = ce('label', 'dz-check', '<input type="checkbox"><span>Nouvel onglet</span>');
      var ntIn = nt.querySelector('input');
      function write(v, newTab) {
        S.commit('Lien du bouton', function (c) {
          var x = (c.sections || []).filter(function (y) { return y.id === t.sid; })[0];
          if (!x || !x.settings) return;
          if (v) x.settings.buttonLink = v; else delete x.settings.buttonLink;
          if (v && newTab) x.settings.buttonNewTab = true; else delete x.settings.buttonNewTab;
        }, { structure: false });
      }
      sel.addEventListener('change', function () {
        if (sel.value === 'url') { url.hidden = false; url.focus(); return; }
        write(sel.value, ntIn.checked);
      });
      url.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); url.blur(); } });
      url.addEventListener('change', function () {
        var v = url.value.trim();
        if (v && !/^https:\/\/[^\s"'<>]{1,300}$/i.test(v)) { toast('Lien refusé : une adresse https:// complète (par exemple https://instagram.com/maboutique).', 'warn'); return; }
        write(v, ntIn.checked);
      });
      ntIn.addEventListener('change', function () { write(cur(), ntIn.checked); });
      reg(function () {
        var v = cur(), isUrl = /^https:/i.test(v);
        if (document.activeElement !== sel) sel.value = isUrl ? 'url' : (opts.some(function (o) { return o[0] === v; }) ? v : '');
        url.hidden = !isUrl && sel.value !== 'url';
        if (document.activeElement !== url) url.value = isUrl ? v : '';
        var x = S.sectionById(t.sid);
        ntIn.checked = !!(x && x.settings && x.settings.buttonNewTab);
        nt.hidden = !v;
      });
      box.appendChild(sel); box.appendChild(url); box.appendChild(nt);
      return row('Lien', [box], null, null, 'dz-row--top');
    }
    /* « Texte alternatif » of a picture: the section's (settings.imageAlt), what screen readers and Google
     * read; empty: the demo photo's own description, else the section's title */
    function altRow(t) {
      var s = S.sectionById(t.sid);
      if (!s || !s.settings || (t.type !== 'hero' && t.type !== 'about')) return null;
      var inp = ce('input', 'dz-text');
      inp.type = 'text'; inp.maxLength = 160;
      inp.setAttribute('aria-label', 'Texte alternatif de la photo');
      function fallback() {
        var x = S.sectionById(t.sid) || {}, st = x.settings || {};
        var info = st.photo && S.R && S.R.photoInfo ? S.R.photoInfo(st.photo) : null;
        return (!st.image && info && info.alt) || String(st.title || '').trim() || 'Décrivez la photo';
      }
      inp.addEventListener('input', function () {
        var v = inp.value;
        S.commit('Texte alternatif modifié', function (c) {
          var x = (c.sections || []).filter(function (y) { return y.id === t.sid; })[0];
          if (!x || !x.settings) return;
          if (v.trim()) x.settings.imageAlt = v; else delete x.settings.imageAlt;
        }, { coalesce: 'alt:' + t.sid });
      });
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
      reg(function () {
        var x = S.sectionById(t.sid);
        if (document.activeElement !== inp) inp.value = (x && x.settings && x.settings.imageAlt) || '';
        inp.placeholder = fallback();
      });
      var r = row('Texte alt.', [inp]);
      tip(r.lab, 'Texte alternatif : ce que lisent les lecteurs d’écran et Google. Vide : la description de la photo d’exemple, ou le titre de la section.');
      return r;
    }

    /* visibility per screen (Disposition): three toggles, each screen says itself */
    function visibilityRow(t) {
      var box = ce('div', 'dz-seg dz-vis');
      [['desktop', IC.desktop, 'ordinateur'], ['tablet', IC.tablet, 'tablette'], ['phone', IC.phone, 'téléphone']].forEach(function (v) {
        var b = ce('button', '', v[1]);
        b.type = 'button';
        b.setAttribute('data-vis', v[0]);
        b.addEventListener('click', function () {
          var shown = visibleOn(t, v[0]);
          var p = {};
          p.hide = shown ? true : null;
          setProps(t, p, (shown ? 'Masqué sur ' : 'Affiché sur ') + v[2], null, { layer: v[0] });
          if (!shown && visibleOn(t, v[0]) === false) setProps(t, { hide: false }, 'Affiché sur ' + v[2], null, { layer: v[0] });
        });
        reg(function () {
          var on = visibleOn(t, v[0]);
          b.classList.toggle('is-on', on);
          b.classList.toggle('is-off', !on);
          tip(b, (on ? 'Visible sur ' : 'Masqué sur ') + v[2] + ' — cliquer pour ' + (on ? 'masquer' : 'afficher'));
        });
        box.appendChild(b);
      });
      return row('Visible', [box], null, null);
    }
    function visibleOn(t, L) {
      var e = entryOf(t);
      if (!e) return true;
      var v = e[L] && Object.prototype.hasOwnProperty.call(e[L], 'hide') ? e[L].hide : (e.base && e.base.hide);
      return v !== true;
    }

    /* the icon grid (an icon element, a button's icon) */
    function iconGrid(t, prop, withNone) {
      var wrap = ce('div', 'dz-icons');
      var q = ce('input', 'dz-icons__q');
      q.placeholder = 'Rechercher une icône…';
      q.setAttribute('aria-label', 'Rechercher une icône');
      q.addEventListener('keydown', function (e) { e.stopPropagation(); });
      wrap.appendChild(q);
      var grid = ce('div', 'dz-icons__g');
      var items = [];
      (withNone ? [null] : []).concat(ES.ICON_IDS).forEach(function (id) {
        var b = ce('button', 'dz-icons__i' + (id ? '' : ' is-none'), id ? ES.iconSvg(id, 1.6, 'currentColor') : svg('<circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/>'));
        b.type = 'button';
        tip(b, id ? (ES.ICON_LABELS[id] || id) : 'L’icône du modèle');
        b.setAttribute('data-icon', id || '');
        b.setAttribute('data-q', ((id && ES.ICON_LABELS[id]) || 'modele') .toLowerCase() + ' ' + (id || ''));
        b.addEventListener('click', function () { var p = {}; p[prop] = id; setProps(t, p, 'Icône : ' + (id ? ES.ICON_LABELS[id] : 'du modèle'), null); });
        grid.appendChild(b);
        items.push(b);
      });
      q.addEventListener('input', function () {
        var v = q.value.trim().toLowerCase();
        items.forEach(function (b) { b.hidden = !!v && b.getAttribute('data-q').indexOf(v) === -1; });
      });
      reg(function () { var cur = val(t, prop) || ''; items.forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-icon') === cur); }); });
      wrap.appendChild(grid);
      return wrap;
    }
    function iconGroup(t) {
      var g = group('icon', t);
      g.mark(anySet(t, ['icon', 'iconSize', 'iconStroke', 'color', 'rotate']));
      var b = g.body;
      b.appendChild(row('Icône', [iconGrid(t, 'icon', true)], t, ['icon'], 'dz-row--top'));
      var r = ce('div', 'dz-grid2');
      r.appendChild(num({ t: t, prop: 'iconSize', icon: IC.scale, unit: 'px', min: 8, max: 160, labelText: 'Taille de l’icône', title: 'Taille de l’icône', phText: '20' }));
      r.appendChild(num({ t: t, prop: 'iconStroke', letter: '╱', unit: 'px', min: 0.5, max: 4, step: 0.05, kstep: 0.1, dec: 2, labelText: 'Épaisseur du trait', title: 'Épaisseur du trait', phText: '1,7' }));
      b.appendChild(row('Taille', [r], t, ['iconSize', 'iconStroke']));
      b.appendChild(row('Couleur', [colorField({ t: t, prop: 'color', label: 'Couleur de l’icône', ph: function () { return live(t, 'color'); } })], t, ['color']));
      b.appendChild(row('Rotation', [num({ t: t, prop: 'rotate', icon: IC.rot, unit: '°', min: -360, max: 360, labelText: 'Rotation', title: 'Rotation', phText: '0' })], t, ['rotate']));
      return g;
    }
    function iconBoxGroup(t) {
      var g = group('iconBox', t);
      g.mark(anySet(t, ['shape', 'fill', 'fillType', 'pt']));
      var b = g.body;
      b.appendChild(row('Forme', [seg({ t: t, prop: 'shape', labelText: 'Forme du fond', toggle: true, options: [
        { v: 'circle', html: '<i class="dz-shp dz-shp--c"></i>', tip: 'Cercle' }, { v: 'rounded', html: '<i class="dz-shp dz-shp--r"></i>', tip: 'Carré arrondi' },
        { v: 'square', html: '<i class="dz-shp dz-shp--s"></i>', tip: 'Carré' }],
        set: function (v) {
          var p = { shape: v };
          if (v && !val(t, 'fillType')) { p.fillType = 'solid'; p.fill = '@accent/15'; }
          if (v && val(t, 'pt') === undefined) { p.pt = 8; p.pr = 8; p.pb = 8; p.pl = 8; }
          if (!v) { p.fillType = null; p.fill = null; }
          setProps(t, p, v ? 'Fond de l’icône' : 'Icône sans fond', null);
        } })], t, ['shape']));
      b.appendChild(row('Fond', [colorField({ t: t, label: 'Fond de l’icône', get: function () { return val(t, 'fillType') === 'solid' ? val(t, 'fill') : null; },
        set: function (v) { setProps(t, { fillType: v ? 'solid' : null, fill: v }, 'Fond de l’icône', 'ibfill'); } })], t, ['fill', 'fillType']));
      b.appendChild(row('Marge int.', [num({ t: t, letter: '⊡', unit: 'px', min: 0, max: 80, labelText: 'Marge intérieure', co: 'ibpad', title: 'Marge intérieure (autour de l’icône)',
        get: function () { var v = ['pt', 'pr', 'pb', 'pl'].map(function (p) { return val(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : undefined; },
        ph: function () { return live(t, 'pt'); },
        set: function (v) { setProps(t, { pt: v, pr: v, pb: v, pl: v }, 'Marge de l’icône', 'ibpad'); } })], t, ['pt', 'pr', 'pb', 'pl']));
      return g;
    }
    function btnIconGroup(t) {
      var g = group('btnIcon', t);
      g.mark(anySet(t, ['btnIcon', 'btnIconPos', 'gap']));
      var b = g.body;
      var cur = val(t, 'btnIcon');
      b.appendChild(row('Icône', [seg({ t: t, cls: 'dz-seg--txt', options: [{ v: 'model', html: 'Modèle', tip: 'L’icône du modèle' }, { v: 'none', html: 'Aucune', tip: 'Pas d’icône' },
        { v: 'left', html: '← Gauche', tip: 'Une icône à gauche du texte' }, { v: 'right', html: 'Droite →', tip: 'Une icône à droite du texte' }],
        get: function () { var i = val(t, 'btnIcon'); return !i ? 'model' : i === 'none' ? 'none' : (val(t, 'btnIconPos') === 'left' ? 'left' : 'right'); },
        set: function (v) {
          var p = v === 'model' ? { btnIcon: null, btnIconPos: null } : v === 'none' ? { btnIcon: 'none', btnIconPos: null } : { btnIcon: val(t, 'btnIcon') && val(t, 'btnIcon') !== 'none' ? val(t, 'btnIcon') : 'arrow', btnIconPos: v };
          setProps(t, p, 'Icône du bouton', null);
          render();
        } })], t, ['btnIcon', 'btnIconPos']));
      if (cur && cur !== 'none') {
        b.appendChild(row('Choisir', [iconGrid(t, 'btnIcon', false)], null, null, 'dz-row--top'));
        var r = ce('div', 'dz-grid2');
        r.appendChild(num({ t: t, prop: 'iconSize', icon: IC.scale, unit: 'px', min: 8, max: 64, labelText: 'Taille de l’icône', title: 'Taille de l’icône', phText: 'auto' }));
        r.appendChild(num({ t: t, prop: 'gap', letter: '↔', unit: 'px', min: 0, max: 64, labelText: 'Écart', title: 'Écart entre l’icône et le texte' }));
        b.appendChild(row('Taille', [r], t, ['iconSize', 'gap']));
      }
      return g;
    }
    var RATIOS = [{ v: null, html: 'Libre', tip: 'La forme du modèle' }, { v: 'orig', html: 'Orig.', tip: 'Le format de la photo' }, { v: 1, html: '1:1', tip: 'Carré' },
      { v: 0.8, html: '4:5', tip: 'Portrait 4:5' }, { v: 0.75, html: '3:4', tip: 'Portrait 3:4' }, { v: 1.78, html: '16:9', tip: 'Paysage 16:9' }];
    function cardFieldsGroup(t) {
      var g = group('cardFields', t);
      g.mark(anySet(t, ['hidePrice', 'hideBadge', 'hideButton', 'hideCat', 'mediaRatio']));
      var b = g.body;
      var box = ce('div', 'dz-checks');
      [['hideCat', 'Catégorie'], ['hidePrice', 'Prix'], ['hideBadge', 'Badge'], ['hideButton', 'Bouton « Ajouter »']].forEach(function (f) {
        var l = ce('label', 'dz-check');
        var c = ce('input');
        c.type = 'checkbox';
        c.addEventListener('change', function () { var p = {}; p[f[0]] = c.checked ? null : true; setProps(t, p, (c.checked ? 'Afficher : ' : 'Masquer : ') + f[1].toLowerCase(), null); });
        reg(function () { c.checked = val(t, f[0]) !== true; });
        l.appendChild(c);
        l.appendChild(ce('span', '', esc(f[1])));
        box.appendChild(l);
      });
      b.appendChild(row('Afficher', [box], t, ['hidePrice', 'hideBadge', 'hideButton', 'hideCat'], 'dz-row--top'));
      b.appendChild(row('Photo', [seg({ t: t, cls: 'dz-seg--txt dz-seg--ratio', options: RATIOS.filter(function (r) { return r.v !== 'orig'; }),
        get: function () { var r = val(t, 'mediaRatio'); return r === undefined ? null : r; },
        set: function (v) { setProps(t, { mediaRatio: v }, 'Format des photos', null); } })], t, ['mediaRatio']));
      return g;
    }
    function sectionGroup(t) {
      var g = group('section', t);
      var b = g.body;
      var tplName = '';
      try { D.templates.forEach(function (x) { if (x.id === cfg().template) tplName = x.name; }); } catch (e) { /* none */ }
      var link = ce('button', 'dz-linkbtn', 'Modèle « ' + esc(tplName || cfg().template) + ' » · changer…');
      link.type = 'button';
      link.addEventListener('click', function () { S.select(null); if (S.switchInspTab) S.switchInspTab('settings'); });
      b.appendChild(row('Disposition', [link]));
      return g;
    }

    /* the image's crop: thumbnail (drag to reposition), zoom, format, fit — and the crop mode on the canvas */
    function cropGroup(t) {
      var g = group('image', t);
      g.mark(anySet(t, ['fit', 'focusX', 'focusY', 'zoom', 'ratio', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'hue']));
      var b = g.body;
      var img = liveImg(t);
      var src = img ? (img.currentSrc || img.src) : null;
      var th = focal({ t: t, src: src, xp: 'focusX', yp: 'focusY', empty: 'Pas de photo ici : une illustration du modèle', drag: true });
      th.classList.add('dz-focal--img');
      b.appendChild(row('Cadrer', [th], t, ['focusX', 'focusY'], 'dz-row--top'));
      b.appendChild(row('Zoom', [slider({ t: t, prop: 'zoom', min: 100, max: 400, neutral: 100, unit: '%', labelText: 'Zoom', title: 'Zoom dans le cadre' })], t, ['zoom']));
      b.appendChild(row('Format', [seg({ t: t, cls: 'dz-seg--txt dz-seg--ratio', options: RATIOS,
        get: function () { var r = val(t, 'ratio'); if (r === undefined) return null; var nat = natRatio(t); return nat && Math.abs(nat - r) < 0.005 && [1, 0.8, 0.75, 1.78].indexOf(r) === -1 ? 'orig' : r; },
        set: function (v) { setProps(t, { ratio: v === 'orig' ? (natRatio(t) || null) : v }, 'Format de l’image', null); } })], t, ['ratio']));
      b.appendChild(row('Ajuster', [seg({ t: t, prop: 'fit', labelText: 'Ajustement', toggle: true, cls: 'dz-seg--txt', options: [
        { v: 'cover', html: 'Remplir', tip: 'Remplir le cadre (recadrée)' }, { v: 'contain', html: 'Entière', tip: 'Image entière dans le cadre' },
        { v: 'fill', html: 'Étirer', tip: 'Étirer au cadre' }, { v: 'none', html: 'Réelle', tip: 'Taille réelle, sans redimensionner' }] })], t, ['fit']));
      var cb = ce('button', 'dz-btn', svg('<path d="M4.5 1.5v10h10M1.5 4.5h10v10"/>') + '<span>Recadrer sur l’aperçu</span>');
      cb.type = 'button';
      tip(cb, 'Mode recadrage : glisser la photo, molette pour zoomer (double-clic sur l’image, ou Entrée)', 'Entrée');
      cb.addEventListener('click', function () { startCrop(); });
      b.appendChild(row('', [cb]));
      [['brightness', 'Lumière', 0, 200, 100], ['contrast', 'Contraste', 0, 200, 100], ['saturate', 'Saturation', 0, 200, 100], ['grayscale', 'N & B', 0, 100, 0],
        ['sepia', 'Sépia', 0, 100, 0], ['hue', 'Teinte', -180, 180, 0]].forEach(function (f) {
        b.appendChild(row(f[1], [slider({ t: t, prop: f[0], min: f[2], max: f[3], neutral: f[4], unit: f[0] === 'hue' ? '°' : '%', labelText: f[1], title: f[1] })], t, [f[0]]));
      });
      var rs = ce('button', 'dz-linkbtn', 'Réinitialiser les filtres');
      rs.type = 'button';
      rs.addEventListener('click', function () { setProps(t, { brightness: null, contrast: null, saturate: null, grayscale: null, sepia: null, hue: null }, 'Filtres réinitialisés', null); });
      b.appendChild(row('', [rs]));
      return g;
    }
    function liveImg(t) {
      var el = liveEl(t);
      return el ? (el.tagName === 'IMG' ? el : el.querySelector('img')) : null;
    }
    function natRatio(t) {
      var img = liveImg(t);
      return img && img.naturalWidth && img.naturalHeight ? round(img.naturalWidth / img.naturalHeight, 2) : null;
    }

    /* ================================================================ crop mode on the canvas */

    var crop = null; // { key, ab, layer, bar }
    function cropTargetOk(t) {
      if (!t) return false;
      if (t.def.kind === 'image') return !!liveImg(t);
      return val(t, 'fillType') === 'image' && !!val(t, 'bgImage');
    }
    function startCrop() {
      var t = target();
      if (!t) return;
      if (!cropTargetOk(t)) { toast(t.def.kind === 'image' ? 'Pas de photo ici : choisissez-en une (Remplacer…), puis recadrez.' : 'Recadrage : sélectionnez une image, ou un fond en image.', 'warn'); return; }
      if (S.switchInspTab && (!S.inspMode || S.inspMode() !== 'design')) S.switchInspTab('design');
      endCrop(true);
      crop = { key: t.key, ab: S.primaryKey() };
      document.body.classList.add('dz-cropping');
      drawCrop();
      toast('Recadrage : glissez la photo, molette pour zoomer. Entrée ou Échap pour terminer.', 'info');
    }
    function endCrop(silent) {
      if (!crop) return false;
      var c = crop;
      crop = null;
      document.body.classList.remove('dz-cropping');
      if (c.layer) c.layer.remove();
      if (c.bar) c.bar.remove();
      if (!silent) { S.applyElStyles(); render(); }
      return true;
    }
    function cropGeom(t, el, frame) {
      // the frame (layout box, without the zoom transform) and the drawn picture, in artboard px
      var isBg = t.def.kind !== 'image';
      var z = isBg ? 1 : (val(t, 'zoom') || 100) / 100;
      var fx = isBg ? (val(t, 'bgPosX') === undefined ? 50 : val(t, 'bgPosX')) : (val(t, 'focusX') === undefined ? 50 : val(t, 'focusX'));
      var fy = isBg ? (val(t, 'bgPosY') === undefined ? 50 : val(t, 'bgPosY')) : (val(t, 'focusY') === undefined ? 50 : val(t, 'focusY'));
      var img = isBg ? crop.bgImg : liveImg(t);
      if (!img || !img.naturalWidth) return null;
      var host = isBg ? el : img;
      var fw = host.offsetWidth, fh = host.offsetHeight;
      var br = S.rectInFrame(host, frame);
      var L = br.x - (fx / 100 * fw) * (1 - z), T = br.y - (fy / 100 * fh) * (1 - z);
      if (isBg) { L = br.x; T = br.y; }
      var fit = isBg ? (val(t, 'bgFit') || 'cover') : (val(t, 'fit') || 'cover');
      var nw = img.naturalWidth, nh = img.naturalHeight;
      var sc = fit === 'contain' ? Math.min(fw / nw, fh / nh) : Math.max(fw / nw, fh / nh);
      var dw = nw * sc, dh = nh * sc;
      var ox = (fw - dw) * fx / 100, oy = (fh - dh) * fy / 100;
      var Ox = L + fx / 100 * fw, Oy = T + fy / 100 * fh;
      return { L: L, T: T, fw: fw, fh: fh, z: z, fx: fx, fy: fy, dw: dw, dh: dh, isBg: isBg, src: img.currentSrc || img.src,
        gx: Ox + z * (L + ox - Ox), gy: Oy + z * (T + oy - Oy), gw: dw * z, gh: dh * z };
    }
    function drawCrop() {
      if (!crop) return;
      var t = target();
      if (!t || t.key !== crop.key) { endCrop(true); return; }
      var ab = S.abEls()[crop.ab], rootEl = S.roots()[crop.ab];
      var frame = ab && ab.querySelector('.st-ab__frame');
      var el = rootEl ? nodesIn(rootEl, t)[0] : null;
      if (!frame || !el) { endCrop(true); return; }
      if (t.def.kind !== 'image' && (!crop.bgImg || crop.bgSrc !== val(t, 'bgImage'))) {
        crop.bgSrc = val(t, 'bgImage');
        crop.bgImg = new Image();
        crop.bgImg.onload = function () { drawCrop(); };
        crop.bgImg.src = ES.imageUrl(crop.bgSrc) || '';
      }
      var gm = cropGeom(t, el, frame);
      if (!gm) return;
      var kz = S.frameScale ? S.frameScale(frame) : 1;
      if (!crop.layer) {
        crop.layer = ce('div', 'dz-crop');
        crop.layer.innerHTML = '<img class="dz-crop__ghost" alt=""><div class="dz-crop__frame"><i></i><i></i><i></i><i></i></div><div class="dz-crop__hit"></div>';
        ab.appendChild(crop.layer);
        var hit = crop.layer.querySelector('.dz-crop__hit');
        hit.addEventListener('pointerdown', function (e) { cropPan(e); });
        hit.addEventListener('wheel', function (e) {
          if (t.def.kind !== 'image') return;
          e.preventDefault();
          e.stopPropagation();
          var cur = val(target(), 'zoom') || 100;
          setProps(target(), { zoom: clamp(Math.round(cur * (e.deltaY < 0 ? 1.06 : 1 / 1.06)), 100, 400) }, 'Zoom de l’image', 'czoom');
          drawCrop();
        }, { passive: false });
        hit.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); endCrop(); });
      }
      crop.layer.style.setProperty('--k', String(kz || 1));
      var ghost = crop.layer.querySelector('.dz-crop__ghost');
      if (ghost.getAttribute('src') !== gm.src) ghost.setAttribute('src', gm.src);
      ghost.style.left = gm.gx + 'px'; ghost.style.top = gm.gy + 'px'; ghost.style.width = gm.gw + 'px'; ghost.style.height = gm.gh + 'px';
      var fr = crop.layer.querySelector('.dz-crop__frame');
      fr.style.left = gm.L + 'px'; fr.style.top = gm.T + 'px'; fr.style.width = gm.fw + 'px'; fr.style.height = gm.fh + 'px';
      var hitEl = crop.layer.querySelector('.dz-crop__hit');
      var ux = Math.min(gm.gx, gm.L), uy = Math.min(gm.gy, gm.T);
      hitEl.style.left = ux + 'px'; hitEl.style.top = uy + 'px';
      hitEl.style.width = (Math.max(gm.gx + gm.gw, gm.L + gm.fw) - ux) + 'px';
      hitEl.style.height = (Math.max(gm.gy + gm.gh, gm.T + gm.fh) - uy) + 'px';
      drawCropBar(t, frame, gm);
    }
    function drawCropBar(t, frame, gm) {
      var stage = S.stage();
      if (!stage) return;
      if (!crop.bar) {
        crop.bar = ce('div', 'dz-cropbar');
        crop.bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        stage.appendChild(crop.bar);
        var isImg = t.def.kind === 'image';
        if (isImg) {
          var zl = ce('div', 'dz-cropbar__z');
          zl.appendChild(ce('span', 'dz-cropbar__l', IC.scale));
          zl.appendChild(slider({ t: t, prop: 'zoom', min: 100, max: 400, neutral: 100, unit: '%', labelText: 'Zoom', title: 'Zoom' }));
          crop.bar.appendChild(zl);
          crop.bar.appendChild(seg({ t: t, cls: 'dz-seg--txt dz-seg--ratio', options: RATIOS,
            get: function () { var r = val(t, 'ratio'); if (r === undefined) return null; var nat = natRatio(t); return nat && Math.abs(nat - r) < 0.005 && [1, 0.8, 0.75, 1.78].indexOf(r) === -1 ? 'orig' : r; },
            set: function (v) { setProps(t, { ratio: v === 'orig' ? (natRatio(t) || null) : v }, 'Format de l’image', null); requestAnimationFrame(drawCrop); } }));
        } else {
          crop.bar.appendChild(seg({ t: t, prop: 'bgFit', cls: 'dz-seg--txt', dflt: 'cover', options: [{ v: 'cover', html: 'Remplir' }, { v: 'contain', html: 'Entière' }],
            set: function (v) { setProps(t, { bgFit: v }, 'Cadrage du fond', null); requestAnimationFrame(drawCrop); } }));
        }
        var done = ce('button', 'dz-cropbar__ok', 'Terminé');
        done.type = 'button';
        done.addEventListener('click', function () { endCrop(); });
        crop.bar.appendChild(done);
        refresh();
      }
      var fr = frame.getBoundingClientRect();
      var kz = S.frameScale ? S.frameScale(frame) : 1;
      var sr = stage.getBoundingClientRect();
      var bw = crop.bar.offsetWidth, bh = crop.bar.offsetHeight;
      var x = fr.left + (gm.L + gm.fw / 2) * kz - sr.left - bw / 2;
      var y = fr.top + (gm.T + gm.fh) * kz - sr.top + 12;
      if (y + bh > sr.height - 80) y = fr.top + gm.T * kz - sr.top - bh - 12;
      crop.bar.style.left = clamp(x, 8, sr.width - bw - 8) + 'px';
      crop.bar.style.top = clamp(y, 8, sr.height - bh - 76) + 'px';
    }
    function cropPan(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var t = target();
      var ab = S.abEls()[crop.ab];
      var frame = ab.querySelector('.st-ab__frame');
      var kz = S.frameScale ? S.frameScale(frame) : 1;
      var el = nodesIn(S.roots()[crop.ab], t)[0];
      var gm0 = cropGeom(t, el, frame);
      if (!gm0) return;
      var x0 = e.clientX, y0 = e.clientY, raf = 0, last = e;
      ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
      crop.layer.classList.add('is-drag');
      function at() {
        var dx = (last.clientX - x0) / kz, dy = (last.clientY - y0) / kz;
        var sx = gm0.fw - gm0.z * gm0.dw, sy = gm0.fh - gm0.z * gm0.dh;
        var nfx = Math.abs(sx) > 0.5 ? clamp(gm0.fx + dx * 100 / sx, 0, 100) : gm0.fx;
        var nfy = Math.abs(sy) > 0.5 ? clamp(gm0.fy + dy * 100 / sy, 0, 100) : gm0.fy;
        var p = {};
        p[gm0.isBg ? 'bgPosX' : 'focusX'] = round(nfx, 1);
        p[gm0.isBg ? 'bgPosY' : 'focusY'] = round(nfy, 1);
        setProps(t, p, 'Recadrage', 'cpan');
        drawCrop();
      }
      function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; at(); }); }
      function up() {
        window.removeEventListener('pointermove', mv, true);
        window.removeEventListener('pointerup', up, true);
        if (raf) { cancelAnimationFrame(raf); at(); }
        ds.scrubbing = false; document.body.classList.remove('dz-scrubbing');
        if (crop && crop.layer) crop.layer.classList.remove('is-drag');
        S.applyElStyles();
        refresh();
      }
      window.addEventListener('pointermove', mv, true);
      window.addEventListener('pointerup', up, true);
    }
    // double-click an image (or Entrée) enters the crop; Entrée / Échap leaves it
    var stageForCrop = S.stage();
    if (stageForCrop) stageForCrop.addEventListener('dblclick', function (e) {
      if (crop) return;
      var t = target();
      if (!t || (t.def.kind !== 'image' && !cropTargetOk(t))) return;
      var ab = e.target && e.target.closest ? e.target.closest('.st-ab') : null;
      var rootEl = ab ? S.roots()[ab.getAttribute('data-ab')] : null;
      var el = rootEl ? nodesIn(rootEl, t).filter(function (n) {
        if (n.contains(e.target)) return true;
        var r = n.getBoundingClientRect();   // under a scrim or a veil: the pointer is still on the photo
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      })[0] : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      startCrop();
    }, true);
    window.addEventListener('keydown', function (e) {
      if (!crop) {
        if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        var a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable || a.tagName === 'BUTTON')) return;
        var t = target();
        if (t && t.def.kind === 'image' && liveImg(t)) { e.preventDefault(); e.stopPropagation(); startCrop(); }
        return;
      }
      if (e.key === 'Escape' || e.key === 'Enter') {
        var a2 = document.activeElement;
        if (e.key === 'Enter' && a2 && (a2.tagName === 'INPUT' || a2.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        e.stopPropagation();
        endCrop();
      }
    }, true);
    document.addEventListener('pointerdown', function (e) {
      if (!crop) return;
      if (e.target.closest && (e.target.closest('.dz-crop') || e.target.closest('.dz-cropbar') || e.target.closest('.st-right') || e.target.closest('.jc'))) return;
      endCrop();
    }, true);

    /* ================================================================ the quick bar on the canvas */

    var qbar = null;
    function buildQbar(t) {
      if (qbar) { qbar.remove(); qbar = null; }
      var stage = S.stage();
      var sel = state().sel;
      if (!stage || !t || !isShown()) return;
      var k = t.def.kind;
      var isSub = sel && (sel.el || sel.field || (sel.kind === 'chrome' && sel.el));
      if (!isSub || ['button', 'text', 'badge', 'image', 'icon'].indexOf(k) === -1) return;
      qbar = ce('div', 'dz-qbar');
      qbar.setAttribute('role', 'toolbar');
      qbar.setAttribute('aria-label', 'Style rapide');
      qbar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      qbar.addEventListener('click', function (e) { e.stopPropagation(); });
      function swatchBtn(label, get, set, gopts) {
        var b = ce('button', 'dz-qbar__sw');
        b.type = 'button';
        tip(b, label);
        b.addEventListener('click', function () { openPicker(b, get() || '#000000', set, label, gopts ? gopts() : null); });
        reg(function () { var v = get(); b.style.background = swatchBg(v || null); b.classList.toggle('is-ph', !v); });
        return b;
      }
      if (k === 'button' || k === 'badge' || k === 'icon') {
        qbar.appendChild(swatchBtn(k === 'icon' ? 'Fond de l’icône' : 'Fond',
          function () { var ft = val(t, 'fillType'); return ft === 'solid' ? val(t, 'fill') : (ft === 'linear' || ft === 'radial') ? ((val(t, 'gradStops') || [])[0] || {}).c : live(t, 'fill'); },
          function (v) { setProps(t, { fillType: 'solid', fill: v }, 'Fond modifié', 'qfill'); }, k === 'icon' ? null : function () { return fillGradient(t); }));
      }
      if (k !== 'image') {
        var ts = swatchBtn(k === 'icon' ? 'Couleur de l’icône' : 'Couleur du texte', function () { return val(t, 'color') || live(t, 'color'); },
          function (v) { setProps(t, { color: v }, 'Couleur modifiée', 'qcolor'); });
        ts.classList.add('dz-qbar__sw--text');
        ts.innerHTML = '<span>A</span>';
        qbar.appendChild(ts);
      }
      qbar.appendChild(ce('span', 'dz-qbar__sep'));
      if (k === 'button' || k === 'badge' || k === 'image' || k === 'icon') {
        var rn = num({ t: t, icon: svg('<path d="M3 13V8a5 5 0 015-5h5"/>'), min: 0, max: 999, labelText: 'Rayon', co: 'rad', title: 'Rayon',
          get: function () { var v = ['rTL', 'rTR', 'rBR', 'rBL'].map(function (p) { return val(t, p); }); return v.every(function (x) { return x === v[0]; }) ? v[0] : undefined; },
          ph: function () { return live(t, 'rTL'); },
          set: function (v) { setProps(t, { rTL: v, rTR: v, rBR: v, rBL: v }, 'Rayon modifié', 'rad'); } });
        rn.classList.add('dz-num--q');
        qbar.appendChild(rn);
      }
      if (k === 'button') {
        qbar.appendChild(seg({ t: t, cls: 'dz-seg--txt', toggle: true, options: [{ v: 'S', html: 'S', tip: 'Petit' }, { v: 'M', html: 'M', tip: 'Moyen' }, { v: 'L', html: 'L', tip: 'Grand' }],
          get: function () { return sizeOf(t); },
          set: function (v) { var p = {}; Object.keys(SIZES.M).forEach(function (key) { p[key] = v ? SIZES[v][key] : null; }); setProps(t, p, 'Taille ' + (v || 'du modèle'), null); } }));
      }
      if (k === 'text') {
        var fn = num({ t: t, prop: 'fontSize', letter: 'T', min: 6, max: 240, labelText: 'Taille du texte', title: 'Taille du texte' });
        fn.classList.add('dz-num--q');
        qbar.appendChild(fn);
      }
      if (k === 'button' || k === 'text' || k === 'badge') qbar.appendChild(boldSeg(t));
      if (k === 'icon') {
        var isz = num({ t: t, prop: 'iconSize', icon: IC.scale, min: 8, max: 160, labelText: 'Taille de l’icône', title: 'Taille de l’icône', phText: '20' });
        isz.classList.add('dz-num--q');
        qbar.appendChild(isz);
      }
      if (k === 'image') {
        var cb = ce('button', 'dz-qbar__btn', svg('<path d="M4.5 1.5v10h10M1.5 4.5h10v10"/>') + '<span>Recadrer</span>');
        cb.type = 'button';
        tip(cb, 'Recadrer : glisser la photo, zoomer', 'Entrée');
        cb.addEventListener('click', function () { startCrop(); });
        qbar.appendChild(cb);
      }
      qbar.appendChild(ce('span', 'dz-qbar__sep'));
      var more = ce('button', 'dz-ib', svg('<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>'));
      more.type = 'button';
      tip(more, 'Tous les réglages (panneau Design)');
      more.addEventListener('click', function () { panel.scrollTop = 0; var g = panel.querySelector('.dz-g'); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start' }); });
      qbar.appendChild(more);
      stage.appendChild(qbar);
      positionQbar();
    }
    function positionQbar() {
      if (!qbar) return;
      var t = target();
      var key = S.primaryKey();
      var ab = S.abEls()[key], rootEl = S.roots()[key];
      var el = t && rootEl ? nodesIn(rootEl, t)[0] : null;
      var stage = S.stage();
      if (!el || !ab || ab.classList.contains('is-hidden') || crop || (S.isDragging && S.isDragging())) { qbar.hidden = true; return; }
      var r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      if (r.bottom < sr.top || r.top > sr.bottom || r.right < sr.left || r.left > sr.right) { qbar.hidden = true; return; }
      qbar.hidden = false;
      var bw = qbar.offsetWidth, bh = qbar.offsetHeight;
      var p = qbarSpot(el, r, sr, bw, bh, ab);
      qbar.style.left = p.x + 'px';
      qbar.style.top = p.y + 'px';
      qbar.setAttribute('data-spot', p.name);
    }
    /* where the quick bar goes: never over what she may click next. Above the element when there is
     * room, else below, else beside the artboard; each spot is scored by what it would cover (the other
     * texts, buttons and photos of the section, the selection bar, the other artboards, the tool bar)
     * and the first spot that covers nothing wins (else the one that covers least). */
    function qbarSpot(el, r, sr, bw, bh, ab) {
      var maxY = sr.height - bh - 76, maxX = sr.width - bw - 8;
      var cx = clamp(r.left - sr.left + r.width / 2 - bw / 2, 8, maxX);
      var fr = (ab.querySelector('.st-ab__frame') || ab).getBoundingClientRect();
      var bar = document.getElementById('selbar');
      var br = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
      var spots = [
        { name: 'above', x: cx, y: r.top - sr.top - bh - 8 },
        { name: 'below', x: cx, y: r.bottom - sr.top + 8 },
        // a photo: its own lower edge (covering the selected photo hides nothing she wants to click)
        { name: 'inside', x: cx, y: r.bottom - sr.top - bh - 8, only: el.tagName === 'IMG' || !!el.querySelector('img') ? r.height > bh * 2.5 && r.width > bw * 0.8 : false },
        { name: 'left', x: fr.left - sr.left - bw - 12, y: r.top - sr.top + r.height / 2 - bh / 2 },
        { name: 'right', x: fr.right - sr.left + 12, y: r.top - sr.top + r.height / 2 - bh / 2 },
        // stacked over the selection bar
        { name: 'over-bar', x: br ? clamp(br.left - sr.left, 8, maxX) : cx, y: br ? br.top - sr.top - bh - 6 : -1, only: !!br }
      ].filter(function (s) { return s.only !== false; });
      var obstacles = [];
      var sec = el.closest('[data-section-id], .jst-header, .jst-footer');
      if (sec) {
        Array.prototype.forEach.call(sec.querySelectorAll('h1, h2, h3, h4, p, a, button, img, li, label, .jst-btn, .jst-price, [data-jst-field]'), function (o) {
          if (o === el || o.contains(el) || el.contains(o)) return;
          var q = o.getBoundingClientRect();
          if (q.width > 2 && q.height > 2) obstacles.push(q);
        });
      }
      if (br) obstacles.push(br);
      Object.keys(S.abEls()).forEach(function (k) {
        var a = S.abEls()[k];
        if (a !== ab && !a.classList.contains('is-hidden')) obstacles.push((a.querySelector('.st-ab__frame') || a).getBoundingClientRect());
      });
      var best = null;
      spots.forEach(function (s, i) {
        var fits = s.x >= 8 && s.x <= maxX && s.y >= 8 && s.y <= maxY;
        var x = clamp(s.x, 8, maxX), y = clamp(s.y, 8, maxY);
        var L = sr.left + x, T = sr.top + y, cover = 0;
        obstacles.concat(s.name === 'inside' ? [] : [r]).forEach(function (q) {
          var w = Math.min(L + bw, q.right) - Math.max(L, q.left), h = Math.min(T + bh, q.bottom) - Math.max(T, q.top);
          if (w > 0 && h > 0) cover += w * h;
        });
        var score = cover + (fits ? 0 : 1e6) + i;   // the order breaks the ties
        if (!best || score < best.score) best = { name: s.name, x: Math.round(x), y: Math.round(y), score: score, cover: cover };
      });
      return best;
    }

    /* ================================================================ the page overview (nothing selected) */

    function pageTarget() {
      var def = ES.elementDef('@page', 'page');
      var t = { sid: '@page', type: '@page', el: 'page', item: null, def: def, scopeName: 'Accueil', key: '@page/page' };
      t.kind = ES.KINDS.page;
      return t;
    }
    /* « Référencement »: the title and the description for the search engines, apart from the store's name
     * and tagline (store.seo; a page of hers: pages[].seo). Empty: the name / the tagline are used, shown as
     * placeholders. Plus the search-result preview (Google, WhatsApp). */
    function seoRows(body, pageId) {
      function own() { var c = cfg(); if (pageId) { var pg = (c.pages || []).filter(function (x) { return x.id === pageId; })[0]; return (pg && pg.seo) || {}; } return (c.store && c.store.seo) || {}; }
      function fallback(k) {
        var c = cfg(), st = c.store || {};
        if (pageId) { var pg = (c.pages || []).filter(function (x) { return x.id === pageId; })[0] || {}; return k === 'title' ? (pg.title || '') + (st.name ? ' · ' + st.name : '') : String(pg.body || '').replace(/\s+/g, ' ').trim().slice(0, 155); }
        return k === 'title' ? (st.name || '') : (st.tagline || '');
      }
      var prev = ce('div', 'dz-serp');
      function paint() {
        var o = own();
        var url = S.storeAddress ? S.storeAddress(pageId ? '/pages/' + ((cfg().pages || []).filter(function (x) { return x.id === pageId; })[0] || {}).slug : '') : '';
        prev.innerHTML = '<small>' + esc(url) + '</small><b>' + esc(o.title || fallback('title') || 'Titre de la page') + '</b><span>' + esc(o.description || fallback('description') || 'Ajoutez une description : deux phrases qui donnent envie de cliquer.') + '</span>';
      }
      [['title', 'Titre', 'Le titre dans Google et dans l’onglet (70 caractères). Vide : ' + (pageId ? 'le titre de la page et le nom de la boutique' : 'le nom de la boutique'), 70],
        ['description', 'Description', 'La description dans Google et dans les aperçus WhatsApp (160 caractères). Vide : ' + (pageId ? 'le début de la page' : 'le slogan'), 160]].forEach(function (f) {
        var inp = ce(f[0] === 'description' ? 'textarea' : 'input', 'dz-text');
        if (f[0] !== 'description') inp.type = 'text';
        inp.maxLength = f[3];
        inp.value = own()[f[0]] || '';
        inp.placeholder = fallback(f[0]);
        inp.setAttribute('aria-label', (pageId ? 'Page : ' : '') + f[1] + ' pour les moteurs de recherche');
        inp.setAttribute('data-seo', f[0]);
        inp.addEventListener('input', function () {
          var v = inp.value;
          S.commit(f[1] + ' (référencement) modifié', function (c) {
            var host;
            if (pageId) { host = (c.pages || []).filter(function (x) { return x.id === pageId; })[0]; if (!host) return; }
            else host = c.store = c.store || {};
            var seo = host.seo && typeof host.seo === 'object' ? host.seo : (host.seo = {});
            if (v.trim()) seo[f[0]] = v; else delete seo[f[0]];
            if (!Object.keys(seo).length) delete host.seo;
          }, { coalesce: 'seo:' + (pageId || 'store') + ':' + f[0] });
          paint();
        });
        inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
        var r = row(f[1], [inp], null, null, f[0] === 'description' ? 'dz-row--top' : '');
        tip(r.lab, f[2]);
        body.appendChild(r);
      });
      paint();
      body.appendChild(row('Aperçu', [prev], null, null, 'dz-row--top'));
    }
    S.seoRows = seoRows;
    function pageOverview(t) {
      var frag = document.createDocumentFragment();
      // structure
      var gs = group('structure', t);
      var list = ce('div', 'dz-struct');
      S.sections().forEach(function (s) {
        var def = S.sectionDef(s.type);
        var b = ce('button', 'dz-struct__i' + (s.enabled === false ? ' is-off' : ''), '<span class="dz-struct__ic">' + S.icon(s.type) + '</span><span class="dz-struct__n">' + esc(S.sectionName(s)) + '</span><small>' + esc(def && def.name ? def.name : s.type) + '</small>' +
          (anyStyled(s.id) ? '<i class="dz-struct__dot" title="Design réglé"></i>' : ''));
        b.type = 'button';
        b.addEventListener('click', function () { S.select({ kind: 'section', id: s.id }, { pan: true }); });
        list.appendChild(b);
      });
      [['@header', 'En-tête'], ['@footer', 'Pied de page']].forEach(function (c) {
        var b = ce('button', 'dz-struct__i is-chrome', '<span class="dz-struct__ic">' + KIND_ICON.section + '</span><span class="dz-struct__n">' + esc(c[1]) + '</span><small>toutes les pages</small>');
        b.type = 'button';
        b.addEventListener('click', function () { S.select({ kind: 'chrome', id: c[0] }); });
        list.appendChild(b);
      });
      gs.body.appendChild(list);
      frag.appendChild(gs);
      // page settings
      var gp = group('pageSettings', t);
      var b = gp.body;
      b.appendChild(row('Fond', [colorField({ t: t, label: 'Fond de la page', gradient: function () { return fillGradient(t); },
        get: function () { var ft = val(t, 'fillType'); return ft === 'solid' ? val(t, 'fill') : null; },
        ph: function () { var rootEl = S.roots()[S.primaryKey()]; return rootEl ? cssToHex(getComputedStyle(rootEl).backgroundColor) : null; },
        set: function (v) { setProps(t, { fillType: v ? 'solid' : null, fill: v }, 'Fond de la page', 'pfill'); } })], t, ['fill', 'fillType']));
      b.appendChild(row('Texte', [colorField({ t: t, prop: 'color', label: 'Couleur des textes',
        ph: function () { var rootEl = S.roots()[S.primaryKey()]; return rootEl ? cssToHex(getComputedStyle(rootEl).getPropertyValue('--st-text').trim()) : null; } })], t, ['color']));
      b.appendChild(row('Contenu', [num({ t: t, prop: 'contentW', letter: 'L', unit: 'px', min: 240, max: 2400, labelText: 'Largeur du contenu', title: 'Largeur maximale du contenu, sur toute la page',
        ph: function () { var rootEl = S.roots()[S.primaryKey()]; var w = rootEl && rootEl.querySelector('.jst-wrap'); return w ? pxNum(getComputedStyle(w).maxWidth) : null; } })], t, ['contentW']));
      b.appendChild(row('Titres', [fontPicker(t, 'fontDisplay')], t, ['fontDisplay']));
      b.appendChild(row('Textes', [fontPicker(t, 'fontText')], t, ['fontText']));
      // the palette: shown live, edited in « Jetons »
      var pal = ce('div', 'dz-pal');
      ['accent', 'onAccent', 'text', 'muted', 'bg', 'surface', 'line'].forEach(function (k) {
        var c = colorRgba('@' + k);
        var sw = ce('button', 'dz-pal__c');
        sw.type = 'button';
        sw.style.background = c ? 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')' : '#000';
        tip(sw, tokenLabel('@' + k) + ' — modifier dans Jetons');
        sw.addEventListener('click', function () { var tb = $('tokensBtn'); if (tb) tb.click(); });
        pal.appendChild(sw);
      });
      b.appendChild(row('Couleurs', [pal]));
      frag.appendChild(gp);
      // référencement
      var gr = group('seo', t);
      seoRows(gr.body, null);
      var sub = 'jeere.kreeative.xyz/b/ma-boutique';
      try { sub = S.storeAddress ? S.storeAddress() : (typeof D.subdomainFor === 'function' ? D.subdomainFor((cfg().store || {}).name) || sub : sub); } catch (e) { /* default */ }
      gr.body.appendChild(row('Adresse', [ce('span', 'dz-note', esc(sub))]));
      frag.appendChild(gr);
      // stats
      var gst = group('stats', t);
      var secs = S.sections(), hidden = secs.filter(function (s) { return s.enabled === false; }).length;
      var es = cfg().elementStyles || {};
      var weight = 0;
      try { weight = JSON.stringify(cfg()).length; } catch (e) { weight = 0; }
      var stats = ce('div', 'dz-stats');
      [[secs.length, 'sections' + (hidden ? ' (' + hidden + ' masquée' + (hidden > 1 ? 's' : '') + ')' : '')], [S.products().length, 'produits'], [Object.keys(es).length, 'éléments stylés'],
        [(cfg().pages || []).length, 'pages'], [Math.max(1, Math.round(weight / 1024)) + ' Ko', 'poids de la fiche']].forEach(function (x) {
        stats.appendChild(ce('div', 'dz-stat', '<b>' + esc(String(x[0])) + '</b><span>' + esc(x[1]) + '</span>'));
      });
      gst.body.appendChild(stats);
      frag.appendChild(gst);
      return frag;
    }
    function anyStyled(sid) {
      var es = cfg().elementStyles;
      return !!es && Object.keys(es).some(function (k) { return k.indexOf(sid + '/') === 0; });
    }

    /* ================================================================ header: element, breakpoints, states */

    function overrideCount(t, L) {
      var e = entryOf(t);
      return e && e[L] ? Object.keys(e[L]).length : 0;
    }
    function headerBlock(t) {
      var h = ce('div', 'dz-head');
      // the breadcrumb: Accueil › section › element (each climbs to its parent)
      var bc = ce('nav', 'dz-bc');
      bc.setAttribute('aria-label', 'Fil d’Ariane');
      var home = ce('button', 'dz-bc__i', 'Accueil');
      home.type = 'button';
      home.addEventListener('click', function () { S.select(null); });
      bc.appendChild(home);
      var isPage = t.def.kind === 'page';
      var isRoot = !t.def.sel && !t.item;
      if (!isPage) {
        bc.appendChild(ce('span', 'dz-bc__s', '›'));
        var secBtn = ce('button', 'dz-bc__i' + (isRoot ? ' is-cur' : ''), esc(short(t.scopeName || '', isRoot ? 40 : 22)));
        secBtn.type = 'button';
        secBtn.addEventListener('click', function () {
          var sel = state().sel;
          if (sel && sel.kind === 'chrome') S.select({ kind: 'chrome', id: sel.id });
          else if (!CHROME_IDS[t.sid]) S.select({ kind: 'section', id: t.sid });
        });
        bc.appendChild(secBtn);
        if (!isRoot) {
          bc.appendChild(ce('span', 'dz-bc__s', '›'));
          bc.appendChild(ce('span', 'dz-bc__i is-cur', esc(t.item ? 'Cette carte' : t.def.label)));
        }
      } else { home.classList.add('is-cur'); }
      h.appendChild(bc);
      // the typed title: icon + type · name, and the menu of the section's elements
      var er = ce('div', 'dz-el');
      var crumb = ce('div', 'dz-el__crumb');
      crumb.appendChild(ce('span', 'dz-el__ic', KIND_ICON[t.def.kind] || KIND_ICON.container));
      crumb.appendChild(ce('span', 'dz-el__t', esc(typedTitle(t))));
      var pick = ce('select', 'dz-el__pick');
      pick.setAttribute('aria-label', 'Élément à régler');
      ES.elementsFor(t.type).forEach(function (d) {
        var o = ce('option');
        o.value = d.key;
        o.textContent = d.label;
        pick.appendChild(o);
      });
      pick.value = t.el;
      tip(pick, 'Choisir un autre élément de ce bloc');
      pick.addEventListener('change', function () {
        var k = pick.value;
        var def = ES.elementDef(t.type, k);
        if (CHROME_IDS[t.sid]) { S.select(def && def.sel ? { kind: 'chrome', id: t.sid, el: k } : { kind: 'chrome', id: t.sid }); return; }
        if (!def || !def.sel) { S.select({ kind: 'section', id: t.sid }); return; }
        var s = S.sectionById(t.sid);
        var sel = { kind: 'section', id: t.sid, el: k };
        if (def.field && s && S.hasField(s.type, def.field)) { sel.field = def.field; sel.fieldType = s.type; }
        S.select(sel);
      });
      pick.addEventListener('keydown', function (e) { e.stopPropagation(); });
      if (!isPage) crumb.appendChild(pick);
      er.appendChild(crumb);
      var acts = ce('div', 'dz-el__acts');
      acts.appendChild(ibtn(IC.copy, 'Copier le style', copyStyle));
      var pb = ibtn(IC.paste, 'Coller le style', pasteStyle);
      pb.disabled = !styleClip();
      acts.appendChild(pb);
      acts.appendChild(ibtn(IC.reset, ds.st !== 'normal' ? 'Réinitialiser l’état « ' + ST_LABEL[ds.st] + ' »' : ds.bp !== 'base' ? 'Réinitialiser « ' + BP_LABEL[ds.bp] + ' »' : 'Réinitialiser le style', resetStyle));
      [['copy', 'Ctrl Alt C'], ['paste', 'Ctrl Alt V']].forEach(function (k, i) { acts.children[i].setAttribute('data-kbd', k[1]); });
      er.appendChild(acts);
      h.appendChild(er);
      // product cards: all of them, or this one
      if (t.product) {
        var sc = ce('div', 'dz-seg dz-seg--txt dz-scope');
        [['all', 'Toutes les cartes'], ['one', 'Cette carte']].forEach(function (o) {
          var bb = ce('button', ds.cardScope === o[0] ? 'is-on' : '', esc(o[1]));
          bb.type = 'button';
          bb.addEventListener('click', function () { ds.cardScope = o[0]; render(); markArtboards(); });
          sc.appendChild(bb);
        });
        h.appendChild(sc);
      }
      // breakpoints
      var bps = ce('div', 'dz-bps');
      bps.setAttribute('role', 'tablist');
      bps.setAttribute('aria-label', 'Taille d’écran');
      [['base', IC.all, 'Toutes'], ['desktop', IC.desktop, ''], ['tablet', IC.tablet, ''], ['phone', IC.phone, '']].forEach(function (b) {
        var n = b[0] === 'base' ? 0 : overrideCount(t, b[0]);
        var bt = ce('button', 'dz-bp' + (ds.bp === b[0] ? ' is-on' : '') + (n ? ' has-ov' : ''), b[1] + (b[2] ? '<span>' + esc(b[2]) + '</span>' : '') + (n ? '<b>' + n + '</b>' : ''));
        bt.type = 'button';
        bt.setAttribute('role', 'tab');
        bt.setAttribute('aria-selected', String(ds.bp === b[0]));
        bt.setAttribute('data-bp', b[0]);
        tip(bt, BP_LABEL[b[0]] + (n ? ' — ' + n + ' valeur' + (n > 1 ? 's' : '') + ' propre' + (n > 1 ? 's' : '') : ''));
        bt.addEventListener('click', function () { setBp(b[0]); });
        bps.appendChild(bt);
      });
      h.appendChild(bps);
      h.appendChild(ce('p', 'dz-hint' + (ds.bp !== 'base' ? ' is-bp' : ''), esc(BP_HINT[ds.bp])));
      // states
      var states = ['normal'].concat(t.kind.states || []);
      if (states.length === 1) return h;
      var stb = ce('div', 'dz-seg dz-seg--txt dz-states');
      states.forEach(function (s) {
        var has = s !== 'normal' && overrideCount(t, s);
        var bt = ce('button', (ds.st === s ? 'is-on' : '') + (has ? ' has-ov' : ''), esc(ST_LABEL[s]) + (has ? '<i class="dz-sdot"></i>' : ''));
        bt.type = 'button';
        bt.setAttribute('data-state', s);
        tip(bt, s === 'normal' ? 'L’état normal' : 'État « ' + ST_LABEL[s] + ' » : ce que vous réglez ici ne change qu’à ' + ({ hover: 'l’approche de la souris', pressed: 'l’appui', focus: 'la sélection au clavier' })[s]);
        bt.addEventListener('click', function () { setState(s); });
        stb.appendChild(bt);
      });
      h.appendChild(stb);
      var e = entryOf(t);
      var hasStates = e && (e.hover || e.pressed || e.focus);
      if (ds.st !== 'normal' || hasStates) {
        var tr = ce('div', 'dz-trans');
        tr.appendChild(ce('span', 'dz-lab', 'Durée'));
        var dur = num({ t: t, letter: '', unit: 'ms', min: 0, max: 3000, dec: 0, step: 10, kstep: 10, title: 'Durée de la transition', co: 'tdur', phText: '200',
          get: function () { var x = entryOf(t); return x && x.base ? x.base.tDur : undefined; },
          set: function (v) { setProps(t, { tDur: v }, 'Durée de transition', 'tdur', { layer: 'base' }); } });
        tr.appendChild(dur);
        var eo = ES.EASES.map(function (k) { return { v: k, label: ES.EASE_LABELS[k] || k }; });
        tr.appendChild(selectCtl({ t: t, options: [{ v: '', label: 'Douce' }].concat(eo.filter(function (o) { return o.v !== 'ease-out'; })), title: 'Courbe de la transition',
          get: function () { var x = entryOf(t); var v = x && x.base ? x.base.tEase : undefined; return v === 'ease-out' ? undefined : v; },
          set: function (v) { setProps(t, { tEase: v }, 'Courbe de transition', null, { layer: 'base' }); } }));
        var play = ibtn(svg('<path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" stroke="none"/>'), 'Rejouer la transition', previewTransition);
        tr.appendChild(play);
        h.appendChild(tr);
      }
      if (ds.st !== 'normal') h.appendChild(ce('p', 'dz-hint is-state', 'État « ' + esc(ST_LABEL[ds.st]) + ' » affiché sur les aperçus : réglez seulement ce qui change.'));
      return h;
    }
    var CHROME_IDS = { '@header': 1, '@footer': 1 };

    function setBp(bp) {
      ds.bp = bp;
      render();
      markArtboards();
    }
    function setState(s) {
      ds.st = s;
      render();
      S.applyElStyles();
    }
    function previewTransition() {
      var t = target();
      if (!t) return;
      var e = entryOf(t);
      var st = ds.st !== 'normal' ? ds.st : (e && e.hover ? 'hover' : e && e.pressed ? 'pressed' : null);
      if (!st) { toast('Réglez d’abord un état (Survol, Pressé).'); return; }
      var keep = ds.st;
      ds.st = keep === 'normal' ? st : 'normal';
      S.applyElStyles(true);
      setTimeout(function () { ds.st = keep === 'normal' ? 'normal' : keep; S.applyElStyles(true); }, 700);
    }

    /* artboards of the edited breakpoint: their names in blue */
    function markArtboards() {
      var on = isShown() && target() ? bpArtboardKeys(ds.bp) : [];
      // a tablet value also reaches the phones (the cascade): only the others are dimmed
      var reach = ds.bp === 'tablet' ? on.concat(bpArtboardKeys('phone')) : on;
      var abs = S.abEls();
      Object.keys(abs).forEach(function (k) {
        var ab = abs[k];
        if (!ab) return;
        ab.classList.toggle('dz-ab-on', on.indexOf(k) !== -1 && ds.bp !== 'base');
        ab.classList.toggle('dz-ab-off', ds.bp !== 'base' && reach.indexOf(k) === -1 && isShown() && !!target());
      });
    }

    /* ================================================================ copy / paste / reset */

    function styleClip() { var u = ui(); return u.styleClip && typeof u.styleClip === 'object' ? u.styleClip : null; }
    function copyStyle() {
      var t = target();
      if (!t) { toast('Sélectionnez un élément dont copier le style.'); return; }
      var e = entryOf(t);
      if (!e) { toast('Cet élément n’a pas de style réglé : rien à copier.'); return; }
      var data = clone(e);
      // a heavy image stays out of the clipboard (it lives in the fiche)
      if (JSON.stringify(data).length > 400 * 1024) { Object.keys(data).forEach(function (L) { if (data[L] && data[L].bgImage && data[L].bgImage.indexOf('data:') === 0) delete data[L].bgImage; }); }
      ui().styleClip = { from: ES.elementDef(t.type, t.el).label, kind: t.def.kind, data: data };
      S.saveUI();
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ES.css(cfg(), { only: t.key, scope: '.jst' })).catch(function () {}); } catch (err) { /* the in-app clipboard is enough */ }
      toast('Style copié (' + ui().styleClip.from + '). Ctrl Alt V pour le coller sur un autre élément.', 'ok');
      render();
    }
    function pasteStyle() {
      var t = target();
      var c = styleClip();
      if (!t) { toast('Sélectionnez l’élément qui recevra le style.'); return; }
      if (!c) { toast('Rien à coller : copiez d’abord un style (Ctrl Alt C).'); return; }
      S.commit('Style collé (' + ES.elementDef(t.type, t.el).label + ')', function (cf) {
        var es = cf.elementStyles && typeof cf.elementStyles === 'object' ? cf.elementStyles : (cf.elementStyles = {});
        var o = {};
        o[t.key] = clone(c.data);
        var clean = ES.sanitize(o, null);
        if (clean && clean[t.key]) es[t.key] = clean[t.key];
        tidy(cf, t.key);
      }, { styleOnly: true });
      toast('Style collé sur « ' + ES.elementDef(t.type, t.el).label + ' ».', 'ok');
      render();
    }
    function resetStyle() {
      var t = target();
      if (!t) return;
      var e = entryOf(t);
      var L = layerName();
      if (!e || (L !== 'base' && !e[L])) { toast(L === 'base' ? 'Aucun style à réinitialiser.' : 'Rien à réinitialiser pour « ' + (ST_LABEL[L] || BP_LABEL[L]) + ' ».'); return; }
      var all = L === 'base';
      clearLayer(t, all ? '*' : L, all ? 'Style réinitialisé (' + ES.elementDef(t.type, t.el).label + ')' : 'Réinitialisation de « ' + (ST_LABEL[L] || BP_LABEL[L]) + ' »');
      toast(all ? 'Style réinitialisé : retour au modèle. Ctrl Z pour annuler.' : '« ' + (ST_LABEL[L] || BP_LABEL[L]) + ' » réinitialisé. Ctrl Z pour annuler.', 'info');
    }

    /* ================================================================ render / refresh */

    function isShown() { return !panel.hidden; }
    var renderedFor = '';
    function render() {
      closeFontMenu();
      updaters = [];
      panel.innerHTML = '';
      var t = target();
      var sel = state().sel;
      if (!t) {
        renderedFor = '';
        buildQbar(null);
        panel.appendChild(emptyState(sel));
        markArtboards();
        overlay();
        return;
      }
      if (renderedFor !== t.key) panel.scrollTop = 0; // a new element opens its panel at the top
      renderedFor = t.key;
      var states = ['normal'].concat(t.kind.states || []);
      if (states.indexOf(ds.st) === -1) ds.st = 'normal';
      panel.appendChild(headerBlock(t));
      if (t.def.kind === 'page') {
        panel.appendChild(pageOverview(t));
      } else {
        var groups = ORDER[t.def.kind] || t.kind.groups;
        groups.forEach(function (gid) {
          var g = null;
          if (gid === 'layout') g = layoutGroup(t);
          else if (gid === 'radius') g = radiusGroup(t);
          else if (gid === 'fill') g = fillGroup(t);
          else if (gid === 'border') g = borderGroup(t);
          else if (gid === 'shadow') g = shadowGroup(t);
          else if (gid === 'effects') g = effectsGroup(t);
          else if (gid === 'typography') g = typoGroup(t);
          else if (gid === 'text') g = sectionTextGroup(t);
          else if (gid === 'image') g = cropGroup(t);
          else if (gid === 'quick') g = quickGroup(t);
          else if (gid === 'content') g = contentGroup(t);
          else if (gid === 'icon') g = iconGroup(t);
          else if (gid === 'iconBox') g = iconBoxGroup(t);
          else if (gid === 'btnIcon') g = btnIconGroup(t);
          else if (gid === 'cardFields') g = cardFieldsGroup(t);
          else if (gid === 'section') g = sectionGroup(t);
          if (g) panel.appendChild(g);
        });
      }
      panel.appendChild(cssGroup(t));
      buildQbar(t);
      refresh();
      markArtboards();
      if (crop) requestAnimationFrame(drawCrop);
    }
    function refresh() {
      updaters.forEach(function (fn) { try { fn(); } catch (e) { /* one control, not the panel */ } });
      // the counts on the breakpoint and state buttons
      var t = target();
      if (t) {
        panel.querySelectorAll('.dz-bp[data-bp]').forEach(function (b) {
          var L = b.getAttribute('data-bp');
          if (L === 'base') return;
          var n = overrideCount(t, L);
          var bb = b.querySelector('b');
          if (n && !bb) { bb = ce('b'); b.appendChild(bb); }
          if (bb) { if (n) bb.textContent = String(n); else bb.remove(); }
          b.classList.toggle('has-ov', !!n);
        });
        panel.querySelectorAll('.dz-states [data-state]').forEach(function (b) {
          var s = b.getAttribute('data-state');
          if (s === 'normal') return;
          var has = !!overrideCount(t, s);
          b.classList.toggle('has-ov', has);
          var d = b.querySelector('.dz-sdot');
          if (has && !d) b.appendChild(ce('i', 'dz-sdot'));
          if (!has && d) d.remove();
        });
        var ps = panel.querySelector('.dz-el__acts .dz-ib:nth-child(2)');
        if (ps) ps.disabled = !styleClip();
      }
      overlay();
      positionQbar();
    }

    function emptyState(sel) {
      var box = ce('div', 'dz-empty');
      var multi = sel && S.isMulti(sel);
      box.appendChild(ce('div', 'dz-empty__ill', '<svg viewBox="0 0 64 48" aria-hidden="true"><rect x="6" y="6" width="52" height="36" rx="8"/><rect x="14" y="14" width="22" height="6" rx="3"/><rect x="14" y="24" width="34" height="4" rx="2"/><rect x="14" y="31" width="16" height="5" rx="2.5"/><path d="M44 26l10 4-4 1.6L48 36z" fill="currentColor"/></svg>'));
      box.appendChild(ce('h3', '', multi ? 'Un élément à la fois' : sel && sel.kind === 'page' ? 'Les pages suivent le modèle' : 'Le design de chaque élément'));
      box.appendChild(ce('p', '', multi
        ? 'Le design se règle élément par élément : sélectionnez une seule section, un titre, un bouton…'
        : 'Cliquez une section sur un aperçu, puis un titre, un bouton, une image, une carte produit : rayon, remplissage, bordure, ombre, typographie, états et tailles d’écran se règlent ici.'));
      var quick = ce('div', 'dz-empty__q');
      [['@header', 'En-tête'], ['@footer', 'Pied de page']].forEach(function (c) {
        var b = ce('button', 'dz-btn', esc(c[1]));
        b.type = 'button';
        b.addEventListener('click', function () { S.select({ kind: 'chrome', id: c[0] }); });
        quick.appendChild(b);
      });
      box.appendChild(quick);
      // the elements that already have a style: one click to come back to them
      var es = cfg().elementStyles;
      var keys = es ? Object.keys(es) : [];
      if (keys.length) {
        box.appendChild(ce('div', 'dz-empty__t', keys.length + ' élément' + (keys.length > 1 ? 's' : '') + ' stylé' + (keys.length > 1 ? 's' : '')));
        var list = ce('div', 'dz-empty__l');
        keys.slice(0, 30).forEach(function (k) {
          var pk = ES.parseKey(k);
          if (!pk) return;
          var type = CHROME_IDS[pk.sid] ? pk.sid : (S.sectionById(pk.sid) || {}).type;
          var def = type ? ES.elementDef(type, pk.el) : null;
          if (!def) return;
          var scope = CHROME_IDS[pk.sid] ? S.chromeName(pk.sid) : S.sectionName(S.sectionById(pk.sid));
          var b = ce('button', 'dz-empty__i', '<span>' + esc(scope) + '</span><small>› ' + esc(def.label) + (pk.item ? ' (une carte)' : '') + '</small>');
          b.type = 'button';
          b.addEventListener('click', function () {
            if (CHROME_IDS[pk.sid]) { S.select(def.sel ? { kind: 'chrome', id: pk.sid, el: pk.el } : { kind: 'chrome', id: pk.sid }); return; }
            if (pk.item && S.productById(pk.item)) { ds.cardScope = 'one'; S.select({ kind: 'product', id: pk.item }); return; }
            if (!def.sel) { S.select({ kind: 'section', id: pk.sid }); return; }
            var sel2 = { kind: 'section', id: pk.sid, el: pk.el };
            if (def.field && S.hasField(type, def.field)) { sel2.field = def.field; sel2.fieldType = type; }
            S.select(sel2);
          });
          list.appendChild(b);
        });
        box.appendChild(list);
      }
      return box;
    }

    /* ================================================================ canvas: padding tint + radius handles */

    var padOn = false;
    function padHover(on) { padOn = !!on; overlay(); }
    var canvasPad = null; // { key, ab } the selection's padding under the pointer
    function overlay() {
      var abs = S.abEls();
      var t = isShown() ? target() : null;
      Object.keys(abs).forEach(function (k) {
        var ab = abs[k];
        if (!ab) return;
        var layer = ab.querySelector('.dz-ov');
        if (!t) { if (layer) layer.innerHTML = ''; return; }
        if (!layer) { layer = ce('div', 'dz-ov'); ab.appendChild(layer); }
        layer.innerHTML = '';
        if (ab.classList.contains('is-hidden')) return;
        var frame = ab.querySelector('.st-ab__frame');
        var rootEl = S.roots()[k];
        if (!frame || !rootEl) return;
        var nodes = nodesIn(rootEl, t);
        var el = nodes[0];
        if (!el) return;
        var kz = S.frameScale ? S.frameScale(frame) : 1;
        layer.style.setProperty('--k', String(kz || 1));
        var showPad = padOn || (canvasPad && canvasPad.ab === k);
        if (showPad) {
          nodes.slice(0, 12).forEach(function (n) {
            var r = S.rectInFrame(n, frame);
            var c = getComputedStyle(n);
            var p = [parseFloat(c.paddingTop) || 0, parseFloat(c.paddingRight) || 0, parseFloat(c.paddingBottom) || 0, parseFloat(c.paddingLeft) || 0];
            var bands = [
              { x: r.x, y: r.y, w: r.w, h: p[0], v: p[0], lx: r.x + r.w / 2, ly: r.y + p[0] / 2 },
              { x: r.x + r.w - p[1], y: r.y + p[0], w: p[1], h: r.h - p[0] - p[2], v: p[1], lx: r.x + r.w - p[1] / 2, ly: r.y + r.h / 2 },
              { x: r.x, y: r.y + r.h - p[2], w: r.w, h: p[2], v: p[2], lx: r.x + r.w / 2, ly: r.y + r.h - p[2] / 2 },
              { x: r.x, y: r.y + p[0], w: p[3], h: r.h - p[0] - p[2], v: p[3], lx: r.x + p[3] / 2, ly: r.y + r.h / 2 }
            ];
            bands.forEach(function (b, i) {
              if (b.w <= 0 || b.h <= 0) return;
              var d = ce('div', 'dz-ov__pad');
              d.style.left = b.x + 'px'; d.style.top = b.y + 'px'; d.style.width = b.w + 'px'; d.style.height = b.h + 'px';
              layer.appendChild(d);
              if (n === el && b.v * (kz || 1) >= 12) {
                var lab = ce('div', 'dz-ov__lab', String(Math.round(b.v)));
                lab.style.left = b.lx + 'px'; lab.style.top = b.ly + 'px';
                layer.appendChild(lab);
              }
            });
          });
        }
        // corner handles on the active artboard (radius by dragging)
        if (k === S.primaryKey() && t.kind.groups.indexOf('radius') !== -1 && t.def.kind !== 'text' && !ds.scrubbing) {
          var rr = S.rectInFrame(el, frame);
          if (rr.w * kz >= 120 && rr.h * kz >= 44) {
            var cs2 = getComputedStyle(el);
            [['rTL', 0, 0, cs2.borderTopLeftRadius], ['rTR', 1, 0, cs2.borderTopRightRadius], ['rBR', 1, 1, cs2.borderBottomRightRadius], ['rBL', 0, 1, cs2.borderBottomLeftRadius]].forEach(function (c) {
              var rad = Math.min(parseFloat(c[3]) || 0, rr.w / 2, rr.h / 2);
              var off = Math.max(rad, 0) * (1 - Math.SQRT1_2) + 10 / (kz || 1);
              var hx = c[1] ? rr.x + rr.w - off : rr.x + off;
              var hy = c[2] ? rr.y + rr.h - off : rr.y + off;
              var hdl = ce('div', 'dz-ov__rad');
              hdl.style.left = hx + 'px';
              hdl.style.top = hy + 'px';
              hdl.setAttribute('data-corner', c[0]);
              tip(hdl, 'Glisser pour arrondir (Alt : ce coin seulement)');
              hdl.addEventListener('pointerdown', function (e) { radiusDrag(e, t, c, el, frame); });
              layer.appendChild(hdl);
            });
          }
        }
      });
    }
    function radiusDrag(e, t, c, el, frame) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var h = e.currentTarget;
      var layer = h.parentNode;
      ds.scrubbing = true; document.body.classList.add('dz-scrubbing');
      var only = e.altKey;
      var raf = 0, last = e;
      var lab = ce('div', 'dz-ov__rlab');
      var labHost = layer.parentNode; // the artboard: the overlay layer is redrawn while dragging
      labHost.appendChild(lab);
      lab.style.position = 'absolute';
      function at() {
        var r = S.rectInFrame(el, frame);
        var fr = frame.getBoundingClientRect();
        var kz = S.frameScale ? S.frameScale(frame) : 1;
        var px = (last.clientX - fr.left) / kz, py = (last.clientY - fr.top) / kz;
        var lx = c[1] ? r.x + r.w - px : px - r.x, ly = c[2] ? r.y + r.h - py : py - r.y;
        var d = Math.max(0, (lx + ly) / 2 - 10 / kz);
        var rad = Math.round(clamp(d / (1 - Math.SQRT1_2), 0, Math.min(r.w, r.h) / 2));
        if (last.shiftKey) rad = Math.round(rad / 4) * 4;
        var p = {};
        if (only || last.altKey) p[c[0]] = rad; else { p.rTL = rad; p.rTR = rad; p.rBR = rad; p.rBL = rad; }
        setProps(t, p, 'Rayon modifié', 'rad');
        lab.textContent = 'Rayon ' + rad;
        lab.style.left = (c[1] ? r.x + r.w : r.x) + 'px';
        lab.style.top = (c[2] ? r.y + r.h : r.y) + 'px';
        lab.style.setProperty('--k', String(kz || 1));
      }
      function mv(ev) { last = ev; if (!raf) raf = requestAnimationFrame(function () { raf = 0; at(); }); }
      function up() {
        window.removeEventListener('pointermove', mv, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        if (raf) { cancelAnimationFrame(raf); raf = 0; at(); }
        ds.scrubbing = false; document.body.classList.remove('dz-scrubbing');
        lab.remove();
        S.applyElStyles();
        render();
      }
      window.addEventListener('pointermove', mv, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    }
    /* hovering the padding of the selected element on an artboard tints it, like Webflow */
    var stageEl = S.stage();
    var padRaf = 0, padEv = null;
    if (stageEl) stageEl.addEventListener('pointermove', function (e) {
      padEv = e;
      if (padRaf) return;
      padRaf = requestAnimationFrame(function () {
        padRaf = 0;
        var ev = padEv;
        var t = isShown() ? target() : null;
        var next = null;
        if (t && !ds.scrubbing && t.kind.groups.indexOf('layout') !== -1 && t.def.kind !== 'image') {
          var ab = ev.target && ev.target.closest ? ev.target.closest('.st-ab') : null;
          var k = ab ? ab.getAttribute('data-ab') : null;
          var rootEl = k ? S.roots()[k] : null;
          var el = rootEl ? nodesIn(rootEl, t).filter(function (n) { return n.contains(ev.target); })[0] : null;
          if (el) {
            var r = el.getBoundingClientRect();
            var c = getComputedStyle(el);
            var kz = r.width / Math.max(1, el.offsetWidth);
            var p = [parseFloat(c.paddingTop), parseFloat(c.paddingRight), parseFloat(c.paddingBottom), parseFloat(c.paddingLeft)].map(function (x) { return (x || 0) * kz; });
            var inPad = ev.clientY < r.top + p[0] || ev.clientY > r.bottom - p[2] || ev.clientX < r.left + p[3] || ev.clientX > r.right - p[1];
            if (inPad && (p[0] + p[1] + p[2] + p[3]) > 0) next = { key: t.key, ab: k };
          }
        }
        var changed = (!!next) !== (!!canvasPad) || (next && canvasPad && next.ab !== canvasPad.ab);
        canvasPad = next;
        if (changed) overlay();
      });
    }, { passive: true });
    if (stageEl) stageEl.addEventListener('pointerleave', function () { if (canvasPad) { canvasPad = null; overlay(); } });

    /* ================================================================ wiring */

    hooks.elStyleOptions = function () {
      var t = isShown() ? target() : null;
      var o = {};
      if (t && ds.st !== 'normal') o.force = { key: t.key, state: ds.st };
      if (ds.scrubbing) o.noTransition = true;
      return o;
    };
    hooks.selectionCss = function () {
      var t = target();
      if (t) return { label: 'CSS — ' + t.scopeName + ' › ' + ES.elementDef(t.type, t.el).label, css: shortenData(cssFor(t)) };
      var all = '';
      try { all = ES.css(cfg(), { scope: '.jst' }); } catch (e) { all = ''; }
      return { label: 'CSS — toute la boutique', css: shortenData(all) };
    };
    /* 1 … 9, 0 (studio.js): the opacity of the template selection, at the breakpoint and state shown */
    chain('selectionOpacity', function (pct) {
      var sel = state().sel;
      if (!sel) return undefined;
      if (window.JeereStudioCanvas && window.JeereStudioCanvas.current && window.JeereStudioCanvas.current()) return undefined; // a detached section: the canvas
      if (S.isMulti(sel)) {
        var L = layerName();
        S.commit('Opacité ' + pct + ' %', function (c) {
          var es = c.elementStyles && typeof c.elementStyles === 'object' ? c.elementStyles : (c.elementStyles = {});
          sel.ids.forEach(function (sid) {
            var s = S.sectionById(sid);
            if (!s || !ES.elementDef(s.type, 'section')) return;
            var key = ES.keyOf(sid, 'section', null);
            var e = es[key] && typeof es[key] === 'object' ? es[key] : (es[key] = {});
            var layer = e[L] && typeof e[L] === 'object' ? e[L] : (e[L] = {});
            var n = ES.normProp('opacity', pct);
            if (n === null || (pct === 100 && L === 'base')) delete layer.opacity; else layer.opacity = n;
            tidy(c, key);
          });
        }, { styleOnly: true, coalesce: 'es:multi:opacity' });
        if (isShown()) refresh();
        return true;
      }
      var t = target();
      if (!t || !t.def || t.def.kind === 'page') return undefined;
      setProps(t, { opacity: pct === 100 && layerName() === 'base' ? null : pct }, 'Opacité ' + pct + ' %', 'digit-opacity');
      return true;
    });
    hooks.openDesign = function () {
      if (S.switchInspTab) S.switchInspTab('design');
    };
    /* « Recadrer et zoomer » (Réglages, under the photo): the selected photo, straight into the crop mode */
    hooks.cropImage = function () {
      if (S.switchInspTab) S.switchInspTab('design');
      startCrop();
    };
    /* clicking an element (a button, a title, an image, an icon, the header) opens its Design panel at
     * once; climbing back to a section returns to the tab she was on, unless she chose a tab herself */
    var autoFrom = null, switching = false, preferSettings = false;
    function isElementSel(sel) { return !!(sel && (((sel.kind === 'section' || sel.kind === 'chrome') && (sel.el || sel.field)) || sel.kind === 'chrome')); }
    function autoTab() {
      if (!S.switchInspTab || !S.inspMode) return;
      var sel = state().sel, mode = S.inspMode();
      if (isElementSel(sel)) {
        if (mode === 'settings' && !preferSettings) { autoFrom = 'settings'; switching = true; S.switchInspTab('design'); switching = false; }
      } else {
        preferSettings = false;
        if (autoFrom && mode === 'design') { var back = autoFrom; autoFrom = null; switching = true; S.switchInspTab(back); switching = false; }
        else autoFrom = null;
      }
    }
    chain('inspTabChanged', function (mode) {
      if (!switching) {
        autoFrom = null;
        if (mode !== 'design' && isElementSel(state().sel)) preferSettings = true;
        ui().inspTab = mode;
        S.saveUI();
      }
      closePicker();
      closeFontMenu();
      if (mode === 'design') render();
      else { endCrop(true); buildQbar(null); overlay(); markArtboards(); }
      S.applyElStyles();
    });
    chain('inspectorBuilt', function () {
      autoTab();
      addDesignShortcut();
      var t = target();
      // a new element: the panel starts over (the breakpoint you are on stays)
      if (!t || t.key !== renderedFor) { ds.shadowOpen = -1; ds.gStop = 0; }
      if (isShown()) render(); else markArtboards();
      S.applyElStyles();
    });
    chain('afterChange', function (opts) {
      if (!isShown()) return;
      if (opts && opts.styleOnly) return; // refreshed by setProps (or by undo/redo through inspectorBuilt)
      var t = target();
      if (!t || t.key !== renderedFor) render(); else refresh();
    });
    /* the placeholders (« 20 » in the radius field) and the quick bar read the live element: after an undo
     * the artboards are drawn on the next frame, so read them again once they are */
    chain('afterRender', function () { if (isShown() && !ds.scrubbing && target()) refresh(); });
    chain('afterDecor', function () { if (isShown()) { overlay(); positionQbar(); if (crop) drawCrop(); } });
    chain('viewChanged', function () { if (isShown()) { overlay(); positionQbar(); if (crop) drawCrop(); } });
    chain('escapeOverlay', function () {
      if (endCrop()) return true;
      if (closePicker()) return true;
      if (closeFontMenu()) return true;
      return undefined;
    });

    /* the Réglages tab: a line that leads to the Design tab for anything with a design */
    function addDesignShortcut() {
      var insp = $('inspector');
      var t = target();
      if (!insp || !t || insp.querySelector('.dz-go')) return;
      var b = ce('button', 'dz-go', '<span class="dz-go__i">' + svg('<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6"/><circle cx="10" cy="4.5" r="1.5"/><circle cx="6" cy="11.5" r="1.5"/>') +
        '</span><span><b>Design</b> de « ' + esc(ES.elementDef(t.type, t.el).label) + ' »<small>Rayon, remplissage, ombre, typographie, états…</small></span>');
      b.type = 'button';
      b.addEventListener('click', function () { hooks.openDesign(); });
      insp.insertBefore(b, insp.firstChild);
    }

    /* Ctrl Alt C / Ctrl Alt V (e.code: AZERTY and Mac Option keys alike) — before the studio's Ctrl C */
    window.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.altKey || e.shiftKey) return;
      var a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      // nodes of a detached section: their own style clipboard (studio-canvas.js)
      if (window.JeereStudioCanvas && window.JeereStudioCanvas.current && window.JeereStudioCanvas.current()) return;
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') { e.preventDefault(); e.stopPropagation(); copyStyle(); }
      else if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') { e.preventDefault(); e.stopPropagation(); pasteStyle(); }
    }, true);

    // the store's fonts, for the font menu's « boutique » rows
    function syncStoreFonts() {
      var rootEl = S.roots()[S.primaryKey()];
      if (!rootEl) return;
      var c = getComputedStyle(rootEl);
      panel.style.setProperty('--dz-store-display', c.getPropertyValue('--st-font-display') || 'inherit');
      panel.style.setProperty('--dz-store-text', c.getPropertyValue('--st-font-text') || 'inherit');
      document.documentElement.style.setProperty('--dz-store-display', c.getPropertyValue('--st-font-display') || 'inherit');
      document.documentElement.style.setProperty('--dz-store-text', c.getPropertyValue('--st-font-text') || 'inherit');
    }
    chain('afterRender', syncStoreFonts);
    syncStoreFonts();

    // the tab she left open last time
    if (ui().inspTab === 'design' && S.switchInspTab) S.switchInspTab('design');

    /* the tests' handle */
    window.JeereStudioDesign = {
      target: target,
      state: function () { return { bp: ds.bp, st: ds.st, cardScope: ds.cardScope, scrubbing: ds.scrubbing }; },
      setBp: setBp,
      setState: setState,
      setCardScope: function (s) { ds.cardScope = s === 'one' ? 'one' : 'all'; render(); },
      set: function (patch, label) { var t = target(); if (t) setProps(t, patch, label || 'Design (test)', null); },
      render: render,
      copyStyle: copyStyle,
      pasteStyle: pasteStyle,
      resetStyle: resetStyle,
      openPicker: function (sel) { var sw = panel.querySelector(sel || '.dz-sw'); if (sw) sw.click(); return !!picker; },
      closePicker: closePicker,
      cssFor: function () { var t = target(); return t ? cssFor(t) : ''; },
      parseExpr: parseExpr
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
