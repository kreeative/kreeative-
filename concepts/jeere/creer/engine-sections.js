/*
 * Jeere — engine-sections.js: the store side of the Studio's DualEngine sections.
 *
 * A section the seller « détache » in the Studio (studio/studio-engine.js) keeps its id, type, enabled
 * flag and settings, and gains an optional key `engine`: the free nodes of that section, a small
 * DualEngine sub-document (studio/engine/, SPEC-DUALENGINE.md §0.3):
 *
 *   "engine": { "v": 1, "root": "<uuid>", "nodes": { "<uuid>": { DualEngine node }, … },
 *               "assets": { "a1": { "src": "demo:beauty-hero" | "data:image/…;base64,…", "w": 800, "h": 600 } } }
 *
 * This file is loaded next to elstyles.js on every page that reads the fiche (creer/, admin/, compte/,
 * studio/). It is pure for the sanitiser (also in Node, used by JEERE_DATA.normalizeConfig) and, in the
 * browser, it renders a detached section from the engine's own generated HTML and CSS
 * (DualEngine.exportDocument): the CSS is scoped under `.jst [data-eng="<id>"]`, and the engine's
 * breakpoint media queries become container queries on the section, so the Studio's artboards, the
 * editor's preview, the dashboard and the real store all pick the breakpoint from the store's width,
 * never from the window. A fiche without `engine` keys never loads the engine and renders as before.
 *
 * Global: window.JeereEngineSections = { BREAKPOINTS, sanitize, isDetached, hasDetached, toDocument,
 *   exportSection, sectionHTML, apply, bpForWidth, ensureEngine, ready, scopeCSS }
 */
(function (root) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function own(o, k) { return isObj(o) && hasOwn.call(o, k); }
  function num(v, min, max, dflt) {
    var n = typeof v === 'number' ? v : NaN;
    if (!isFinite(n)) return dflt;
    return n < min ? min : (n > max ? max : n);
  }
  function bool(v, dflt) { return typeof v === 'boolean' ? v : dflt; }
  function oneOf(v, list, dflt) { return list.indexOf(v) !== -1 ? v : dflt; }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

  /* The breakpoints of every detached section: the Studio's three artboard families (SPEC §1.5).
   * base 1200 (computer, no query), tablet < 1200 (768 artboard), phone < 768 (390 / 360). */
  var BREAKPOINTS = [
    { id: 'base', name: 'Ordinateur', width: 1200 },
    { id: 'tablet', name: 'Tablette', width: 768 },
    { id: 'phone', name: 'Téléphone', width: 390 }
  ];
  var BP_IDS = ['base', 'tablet', 'phone'];
  function bpForWidth(w) { return w < 768 ? 'phone' : (w < 1200 ? 'tablet' : 'base'); }

  /* ------------------------------------------------------------------ sanitiser */

  var LIMITS = { nodes: 3000, depth: 48, children: 600, paints: 8, strokes: 4, effects: 8, stops: 16, paras: 400, runs: 64, text: 8000, assets: 120, assetBytes: 1700000 };
  var TYPES = ['frame', 'stack', 'grid', 'rect', 'ellipse', 'line', 'text', 'image'];
  var CONTAINERS = { frame: 1, stack: 1, grid: 1 };
  var TAGS = ['div', 'section', 'header', 'nav', 'main', 'footer', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'p', 'span', 'a', 'button', 'img', 'ul', 'li', 'label'];
  var BLENDS = ['passThrough', 'normal', 'darken', 'multiply', 'colorBurn', 'linearBurn', 'lighten', 'screen', 'colorDodge', 'linearDodge', 'overlay', 'softLight', 'hardLight', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  var ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{3,39}$/;
  var ASSET_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  // one family, or a fallback list of up to 6 (« Playfair, Playfair Display, Georgia, serif »): letters,
  // digits, spaces, dots, dashes — never a quote, a semicolon or a brace (the CSS quotes each name)
  var FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}(?:, ?[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}){0,5}$/;
  var DEMO_RE = /^demo:[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var DATA_RE = /^data:image\/(?:png|jpeg|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

  function color(c) {
    if (!isObj(c)) return null;
    var out = { r: num(c.r, 0, 1, 0), g: num(c.g, 0, 1, 0), b: num(c.b, 0, 1, 0), a: num(c.a, 0, 1, 1) };
    return out;
  }
  function pt(p, lim) { if (!isObj(p)) return null; return { x: num(p.x, -lim, lim, 0), y: num(p.y, -lim, lim, 0) }; }

  function paint(p, assets, textOnly) {
    if (!isObj(p)) return null;
    var t = p.type;
    var out = { type: t, opacity: num(p.opacity, 0, 1, 1), blend: oneOf(p.blend, BLENDS, 'normal'), visible: bool(p.visible, true) };
    if (t === 'solid') { out.color = color(p.color); if (!out.color) return null; return out; }
    if (t === 'linear' || t === 'radial' || t === 'angular' || t === 'diamond') {
      if (textOnly && t !== 'linear') return null;
      var stops = (Array.isArray(p.stops) ? p.stops : []).slice(0, LIMITS.stops).map(function (s) {
        var c = isObj(s) ? color(s.color) : null;
        return c ? { position: num(s.position, -4, 5, 0), color: c } : null;
      }).filter(Boolean);
      if (stops.length < 1) return null;
      out.stops = stops;
      ['start', 'end', 'radius'].forEach(function (k) { if (own(p, k)) { var v = pt(p[k], 16); if (v) out[k] = v; } });
      if (Array.isArray(p.transform) && (p.transform.length === 6 || p.transform.length === 9) && p.transform.every(function (v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e4; })) out.transform = p.transform.slice();
      return out;
    }
    if (t === 'image' && !textOnly) {
      if (typeof p.asset !== 'string' || !own(assets, p.asset)) return null;
      out.asset = p.asset;
      out.fit = oneOf(p.fit, ['fill', 'fit', 'crop', 'tile'], 'fill');
      if (own(p, 'scale')) out.scale = num(p.scale, 0.01, 100, 1);
      if (isObj(p.crop)) out.crop = { x: num(p.crop.x, 0, 1, 0), y: num(p.crop.y, 0, 1, 0), w: num(p.crop.w, 0.01, 1, 1), h: num(p.crop.h, 0.01, 1, 1) };
      return out;
    }
    return null;
  }
  function paints(list, assets, textOnly) {
    return (Array.isArray(list) ? list : []).slice(0, LIMITS.paints).map(function (p) { return paint(p, assets, textOnly); }).filter(Boolean);
  }
  function stroke(s, assets) {
    if (!isObj(s)) return null;
    var p = paint(s.paint, assets, true);
    if (!p) return null;
    var w;
    if (isObj(s.width)) w = { top: num(s.width.top, 0, 400, 0), right: num(s.width.right, 0, 400, 0), bottom: num(s.width.bottom, 0, 400, 0), left: num(s.width.left, 0, 400, 0) };
    else w = num(s.width, 0, 400, 1);
    var out = { paint: p, width: w, align: oneOf(s.align, ['inside', 'center', 'outside'], 'inside'), cap: oneOf(s.cap, ['butt', 'round', 'square'], 'butt'), join: oneOf(s.join, ['miter', 'round', 'bevel'], 'miter'), visible: bool(s.visible, true) };
    if (Array.isArray(s.dash) && s.dash.length === 2) out.dash = [num(s.dash[0], 0, 400, 0), num(s.dash[1], 0, 400, 0)];
    return out;
  }
  function effect(e) {
    if (!isObj(e)) return null;
    if (e.type === 'dropShadow' || e.type === 'innerShadow') {
      var c = color(e.color); if (!c) return null;
      var o = { type: e.type, x: num(e.x, -2000, 2000, 0), y: num(e.y, -2000, 2000, 0), blur: num(e.blur, 0, 2000, 0), spread: num(e.spread, -2000, 2000, 0), color: c, visible: bool(e.visible, true) };
      if (own(e, 'showBehindTransparent')) o.showBehindTransparent = bool(e.showBehindTransparent, true);
      return o;
    }
    if (e.type === 'layerBlur' || e.type === 'backgroundBlur') return { type: e.type, radius: num(e.radius, 0, 1000, 0), visible: bool(e.visible, true) };
    return null;
  }
  function corners(c, partial) {
    if (!isObj(c)) return partial ? null : { tl: 0, tr: 0, br: 0, bl: 0, smoothing: 0 };
    var out = {};
    ['tl', 'tr', 'br', 'bl'].forEach(function (k) { if (!partial || own(c, k)) out[k] = num(c[k], 0, 100000, 0); });
    if (!partial || own(c, 'smoothing')) out.smoothing = num(c.smoothing, 0, 1, 0);
    return out;
  }
  function geometry(g, partial) {
    if (!isObj(g)) return partial ? null : { x: 0, y: 0, w: 100, h: 100, rotation: 0, flipH: false, flipV: false };
    var out = {};
    if (!partial || own(g, 'x')) out.x = num(g.x, -1e6, 1e6, 0);
    if (!partial || own(g, 'y')) out.y = num(g.y, -1e6, 1e6, 0);
    if (!partial || own(g, 'w')) out.w = num(g.w, 0, 1e6, 100);
    if (!partial || own(g, 'h')) out.h = num(g.h, 0, 1e6, 100);
    if (!partial || own(g, 'rotation')) { var r = num(g.rotation, -1e4, 1e4, 0); r = ((r + 180) % 360 + 360) % 360 - 180; out.rotation = r; }
    if (!partial || own(g, 'flipH')) out.flipH = bool(g.flipH, false);
    if (!partial || own(g, 'flipV')) out.flipV = bool(g.flipV, false);
    return out;
  }
  var H_CONS = ['left', 'right', 'leftRight', 'center', 'scale'];
  var V_CONS = ['top', 'bottom', 'topBottom', 'center', 'scale'];
  function layoutChild(l, partial) {
    if (!isObj(l)) return partial ? null : { position: 'flow', widthMode: 'fixed', heightMode: 'fixed' };
    var out = {};
    if (!partial || own(l, 'position')) out.position = oneOf(l.position, ['flow', 'absolute'], 'flow');
    if (!partial || own(l, 'widthMode')) out.widthMode = oneOf(l.widthMode, ['fixed', 'hug', 'fill'], 'fixed');
    if (!partial || own(l, 'heightMode')) out.heightMode = oneOf(l.heightMode, ['fixed', 'hug', 'fill'], 'fixed');
    ['minW', 'maxW', 'minH', 'maxH'].forEach(function (k) { if (own(l, k) && typeof l[k] === 'number' && isFinite(l[k])) out[k] = num(l[k], 0, 1e6, 0); });
    // vw / vh would read the window, not the store (an artboard is narrower than the window): never kept
    if (own(l, 'widthUnit')) out.widthUnit = oneOf(l.widthUnit, ['px', '%'], 'px');
    if (own(l, 'heightUnit')) out.heightUnit = oneOf(l.heightUnit, ['px', '%'], 'px');
    if (own(l, 'grow')) out.grow = num(l.grow, 0, 100, 1);
    if (own(l, 'alignSelf')) out.alignSelf = oneOf(l.alignSelf, ['auto', 'start', 'center', 'end', 'stretch'], 'auto');
    if (isObj(l.constraints)) out.constraints = { h: oneOf(l.constraints.h, H_CONS, 'left'), v: oneOf(l.constraints.v, V_CONS, 'top') };
    if (isObj(l.gridArea)) out.gridArea = { col: Math.round(num(l.gridArea.col, 1, 64, 1)), colSpan: Math.round(num(l.gridArea.colSpan, 1, 64, 1)), row: Math.round(num(l.gridArea.row, 1, 400, 1)), rowSpan: Math.round(num(l.gridArea.rowSpan, 1, 64, 1)) };
    if (own(l, 'order')) out.order = Math.round(num(l.order, -1000, 1000, 0));
    return out;
  }
  function track(t, depth) {
    if (!isObj(t) || depth > 2) return null;
    if (t.kind === 'px') return { kind: 'px', value: num(t.value, 0, 1e5, 0) };
    if (t.kind === 'fr') return { kind: 'fr', value: num(t.value, 0, 100, 1) };
    if (t.kind === 'auto') return { kind: 'auto' };
    if (t.kind === 'minmax') { var a = track(t.min, depth + 1), b = track(t.max, depth + 1); return a && b ? { kind: 'minmax', min: a, max: b } : null; }
    return null;
  }
  function padding(p) {
    if (!isObj(p)) return null;
    return { top: num(p.top, 0, 1e4, 0), right: num(p.right, 0, 1e4, 0), bottom: num(p.bottom, 0, 1e4, 0), left: num(p.left, 0, 1e4, 0) };
  }
  function layoutParent(l, partial) {
    if (!isObj(l)) return partial ? null : { mode: 'absolute', clip: false };
    var out = {};
    if (!partial || own(l, 'mode')) out.mode = oneOf(l.mode, ['absolute', 'stack', 'grid'], 'absolute');
    if (own(l, 'direction')) out.direction = oneOf(l.direction, ['horizontal', 'vertical'], 'vertical');
    if (own(l, 'wrap')) out.wrap = bool(l.wrap, false);
    if (own(l, 'gap')) out.gap = l.gap === 'auto' ? 'auto' : num(l.gap, -1e4, 1e4, 0);
    if (own(l, 'rowGap')) out.rowGap = num(l.rowGap, 0, 1e4, 0);
    if (own(l, 'columnGap')) out.columnGap = num(l.columnGap, 0, 1e4, 0);
    if (own(l, 'padding')) { var p = padding(l.padding); if (p) out.padding = p; }
    if (own(l, 'alignMain')) out.alignMain = oneOf(l.alignMain, ['start', 'center', 'end', 'spaceBetween'], 'start');
    if (own(l, 'alignCross')) out.alignCross = oneOf(l.alignCross, ['start', 'center', 'end', 'stretch', 'baseline'], 'start');
    ['columns', 'rows'].forEach(function (k) {
      if (Array.isArray(l[k])) out[k] = l[k].slice(0, 24).map(function (t) { return track(t, 0); }).filter(Boolean);
    });
    if (!partial || own(l, 'clip')) out.clip = bool(l.clip, false);
    if (own(l, 'reverseZ')) out.reverseZ = bool(l.reverseZ, false);
    return out;
  }
  function textStyle(s, partial) {
    if (!isObj(s)) return partial ? null : null;
    var out = {};
    function has(k) { return !partial || own(s, k); }
    if (has('family')) out.family = typeof s.family === 'string' && FAMILY_RE.test(s.family) ? s.family : 'Inter';
    if (has('weight')) out.weight = Math.round(num(s.weight, 100, 900, 400));
    if (has('italic')) out.italic = bool(s.italic, false);
    if (has('size')) out.size = num(s.size, 1, 1000, 16);
    if (has('lineHeight')) {
      var lh = isObj(s.lineHeight) ? s.lineHeight : {};
      var u = oneOf(lh.unit, ['auto', 'px', '%'], 'auto');
      out.lineHeight = u === 'auto' ? { unit: 'auto' } : { unit: u, value: num(lh.value, 0, 2000, u === '%' ? 120 : 20) };
    }
    if (has('letterSpacing')) {
      var ls = isObj(s.letterSpacing) ? s.letterSpacing : {};
      out.letterSpacing = { unit: oneOf(ls.unit, ['px', '%'], 'px'), value: num(ls.value, -200, 200, 0) };
    }
    if (has('paragraphSpacing')) out.paragraphSpacing = num(s.paragraphSpacing, 0, 1000, 0);
    if (has('paragraphIndent')) out.paragraphIndent = num(s.paragraphIndent, 0, 1000, 0);
    if (has('align')) out.align = oneOf(s.align, ['left', 'center', 'right', 'justify'], 'left');
    if (has('verticalAlign')) out.verticalAlign = oneOf(s.verticalAlign, ['top', 'middle', 'bottom'], 'top');
    if (has('case')) out.case = oneOf(s.case, ['none', 'upper', 'lower', 'title'], 'none');
    if (has('decoration')) out.decoration = oneOf(s.decoration, ['none', 'underline', 'strike'], 'none');
    if (has('fills')) { out.fills = paints(s.fills, {}, true); if (!partial && !out.fills.length) out.fills = [{ type: 'solid', color: { r: 0.07, g: 0.07, b: 0.07, a: 1 }, opacity: 1, blend: 'normal', visible: true }]; }
    return out;
  }
  function richText(t) {
    var paras = isObj(t) && Array.isArray(t.paragraphs) ? t.paragraphs : null;
    if (!paras) return { paragraphs: [{ runs: [{ text: typeof t === 'string' ? t.slice(0, LIMITS.text) : '' }] }] };
    var budget = LIMITS.text;
    var out = paras.slice(0, LIMITS.paras).map(function (p) {
      var runs = (isObj(p) && Array.isArray(p.runs) ? p.runs : []).slice(0, LIMITS.runs).map(function (r) {
        if (!isObj(r)) return null;
        var txt = str(r.text, Math.max(0, budget));
        budget -= txt.length;
        var o = { text: txt.replace(/[\u0000-\u0008\u000B-\u001F]/g, '') };
        if (isObj(r.style)) { var st = textStyle(r.style, true); if (st && Object.keys(st).length) o.style = st; }
        return o;
      }).filter(Boolean);
      return { runs: runs.length ? runs : [{ text: '' }] };
    });
    return { paragraphs: out.length ? out : [{ runs: [{ text: '' }] }] };
  }
  /* links: the store's own pages, its WhatsApp, a phone, an e-mail, or a web address — never javascript: */
  function href(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim().slice(0, 500);
    if (/^(https?:\/\/|mailto:|tel:|#|\/|\.\/|\.\.\/)[^\s"'<>\\`]*$/i.test(s) && !/^\/\//.test(s)) return s;
    return null;
  }
  function semantic(s, type) {
    var dflt = type === 'text' ? 'p' : (type === 'image' ? 'img' : 'div');
    var out = { tag: dflt, attrs: {} };
    if (!isObj(s)) return out;
    out.tag = oneOf(s.tag, TAGS, dflt);
    if (type === 'image') out.tag = 'img';
    if (out.tag === 'img' && type !== 'image') out.tag = 'div';
    var a = isObj(s.attrs) ? s.attrs : {};
    var h = href(a.href);
    if (h && (out.tag === 'a' || out.tag === 'button')) out.attrs.href = h;
    ['aria-label', 'title'].forEach(function (k) { if (typeof a[k] === 'string' && a[k].trim()) out.attrs[k] = a[k].trim().slice(0, 160); });
    // a store behaviour kept through « Détacher » (wave 1): render.js's delegated clicks (add to the cart,
    // open a product, a page…) read these, so a detached « Ajouter » still adds to the cart
    if (typeof a['data-jst-action'] === 'string' && ACTIONS.indexOf(a['data-jst-action']) !== -1) {
      out.attrs['data-jst-action'] = a['data-jst-action'];
      ['data-product', 'data-page', 'data-page-id', 'data-section', 'data-delta', 'data-quick'].forEach(function (k) {
        if (typeof a[k] === 'string' && /^[\w:-]{0,40}$/.test(a[k])) out.attrs[k] = a[k];
      });
    }
    if (a.target === '_blank' && out.attrs.href) { out.attrs.target = '_blank'; out.attrs.rel = 'noopener'; }
    if (s.tagLocked === true) out.tagLocked = true;
    return out;
  }
  var ACTIONS = ['go', 'add', 'menu', 'wa', 'scroll', 'ext', 'qty', 'pdp-qty', 'remove'];
  /* a node bound to the catalogue (wave 1): { product: 'p1', field: 'name' | 'price' | 'image' } — the detached
   * section keeps following the product (sectionHTML(s, model) puts its current name, price, photo in place) */
  function binding(b) {
    if (!isObj(b) || typeof b.product !== 'string' || !/^[\w-]{1,40}$/.test(b.product)) return null;
    return ['name', 'price', 'image'].indexOf(b.field) === -1 ? null : { product: b.product, field: b.field };
  }
  /* an image's colour adjustments (wave 1), as the template photos have: CSS filter() percentages */
  var ADJUST = { brightness: [0, 200, 100], contrast: [0, 200, 100], saturate: [0, 200, 100], grayscale: [0, 100, 0], sepia: [0, 100, 0], hue: [-180, 180, 0] };
  function adjust(v) {
    if (!isObj(v)) return null;
    var out = {};
    Object.keys(ADJUST).forEach(function (k) { var r = ADJUST[k]; if (typeof v[k] === 'number' && isFinite(v[k])) { var n = num(v[k], r[0], r[1], r[2]); if (n !== r[2]) out[k] = n; } });
    return Object.keys(out).length ? out : null;
  }
  var OV_PROPS = ['visible', 'opacity', 'geometry', 'layoutChild', 'layoutParent', 'fills', 'strokes', 'effects', 'corners', 'text'];
  function overridable(o, node, assets) {
    if (!isObj(o)) return null;
    var out = {};
    OV_PROPS.forEach(function (k) {
      if (!own(o, k)) return;
      var v = o[k], c = null;
      switch (k) {
        case 'visible': c = typeof v === 'boolean' ? v : null; break;
        case 'opacity': c = typeof v === 'number' && isFinite(v) ? num(v, 0, 1, 1) : null; break;
        case 'geometry': c = geometry(v, true); break;
        case 'layoutChild': c = layoutChild(v, true); break;
        case 'layoutParent': c = node.children ? layoutParent(v, true) : null; break;
        case 'fills': c = Array.isArray(v) ? paints(v, assets) : null; break;
        case 'strokes': c = Array.isArray(v) ? v.slice(0, LIMITS.strokes).map(function (s) { return stroke(s, assets); }).filter(Boolean) : null; break;
        case 'effects': c = Array.isArray(v) ? v.slice(0, LIMITS.effects).map(effect).filter(Boolean) : null; break;
        case 'corners': c = corners(v, true); break;
        case 'text': c = node.type === 'text' ? textStyle(v, true) : null; break;
      }
      if (c !== null && c !== undefined && !(isObj(c) && !Object.keys(c).length)) out[k] = c;
    });
    return Object.keys(out).length ? out : null;
  }

  function sanitizeAssets(a) {
    var out = {};
    if (!isObj(a)) return out;
    var n = 0, bytes = 0;
    Object.keys(a).forEach(function (id) {
      if (n >= LIMITS.assets || !ASSET_ID_RE.test(id) || !isObj(a[id])) return;
      var src = typeof a[id].src === 'string' ? a[id].src : '';
      if (!(DEMO_RE.test(src) || (DATA_RE.test(src) && src.length <= LIMITS.assetBytes))) return;
      if (DATA_RE.test(src)) { if (bytes + src.length > LIMITS.assetBytes * 4) return; bytes += src.length; }
      var e = { src: src };
      if (typeof a[id].w === 'number' && a[id].w > 0) e.w = Math.round(num(a[id].w, 1, 20000, 1));
      if (typeof a[id].h === 'number' && a[id].h > 0) e.h = Math.round(num(a[id].h, 1, 20000, 1));
      out[id] = e;
      n++;
    });
    return out;
  }

  /**
   * The engine key of a section, repaired: whitelisted node types and properties, numbers clamped,
   * colours as {r,g,b,a} in [0, 1], links without javascript:, images a demo photo or a base64 image,
   * a single tree under `root` (unreachable nodes dropped, cycles cut), at most 3 000 nodes.
   * Never throws; returns null when nothing usable is left (the section then renders as before).
   */
  function sanitize(engine) {
    try {
      if (!isObj(engine) || !isObj(engine.nodes) || typeof engine.root !== 'string') return null;
      var src = engine.nodes;
      var assets = sanitizeAssets(engine.assets);
      var nodes = {};
      var count = 0;
      var seen = {};
      function clean(id, parent, depth) {
        if (count >= LIMITS.nodes || depth > LIMITS.depth || seen[id] || !ID_RE.test(id) || !own(src, id)) return null;
        var s = src[id];
        if (!isObj(s) || TYPES.indexOf(s.type) === -1) return null;
        seen[id] = true;
        count++;
        var n = {
          id: id, type: s.type, name: str(s.name, 80) || s.type, parent: parent,
          visible: bool(s.visible, true), locked: bool(s.locked, false), opacity: num(s.opacity, 0, 1, 1),
          blendMode: oneOf(s.blendMode, BLENDS, CONTAINERS[s.type] ? 'passThrough' : 'normal'), isolate: bool(s.isolate, false),
          semantic: semantic(s.semantic, s.type),
          geometry: geometry(s.geometry, false),
          layoutChild: layoutChild(s.layoutChild, false),
          fills: paints(s.fills, assets), strokes: (Array.isArray(s.strokes) ? s.strokes : []).slice(0, LIMITS.strokes).map(function (x) { return stroke(x, assets); }).filter(Boolean),
          effects: (Array.isArray(s.effects) ? s.effects : []).slice(0, LIMITS.effects).map(effect).filter(Boolean),
          corners: corners(s.corners, false),
          overrides: {}
        };
        if (s.aspectLocked === true) n.aspectLocked = true;
        var bind = binding(s.bind);
        if (bind && (bind.field === 'image' ? s.type === 'image' : s.type === 'text')) n.bind = bind;
        if (CONTAINERS[s.type]) {
          n.children = [];
          n.layoutParent = layoutParent(s.layoutParent, false);
          if (s.type === 'stack') n.layoutParent.mode = 'stack';
          if (s.type === 'grid') n.layoutParent.mode = 'grid';
          n.clipsContent = bool(s.clipsContent, false);
        }
        if (s.type === 'text') {
          n.text = richText(s.text);
          n.style = textStyle(s.style, false) || textStyle({}, false);
          n.resize = oneOf(s.resize, ['autoWidth', 'autoHeight', 'fixed'], 'autoHeight');
          if (isObj(s.truncate)) n.truncate = { lines: Math.round(num(s.truncate.lines, 1, 40, 1)) };
        }
        if (s.type === 'image') {
          n.asset = typeof s.asset === 'string' && own(assets, s.asset) ? s.asset : '';
          n.fit = oneOf(s.fit, ['fill', 'fit', 'crop', 'tile'], 'fill');
          n.alt = str(s.alt, 200);
          if (isObj(s.crop)) {
            n.crop = { x: num(s.crop.x, 0, 1, 0), y: num(s.crop.y, 0, 1, 0), w: num(s.crop.w, 0.01, 1, 1), h: num(s.crop.h, 0.01, 1, 1) };
            // the focal point (wave 1: the Studio's crop mode), 0–1 on each axis
            if (typeof s.crop.fx === 'number' && isFinite(s.crop.fx)) n.crop.fx = num(s.crop.fx, 0, 1, 0.5);
            if (typeof s.crop.fy === 'number' && isFinite(s.crop.fy)) n.crop.fy = num(s.crop.fy, 0, 1, 0.5);
          }
          var adj = adjust(s.adjust);
          if (adj) n.adjust = adj;
        }
        if (isObj(s.overrides)) {
          ['tablet', 'phone'].forEach(function (bp) {
            var o = overridable(s.overrides[bp], n, assets);
            if (o) n.overrides[bp] = o;
          });
        }
        nodes[id] = n;
        if (n.children && Array.isArray(s.children)) {
          s.children.slice(0, LIMITS.children).forEach(function (cid) {
            if (typeof cid !== 'string') return;
            var c = clean(cid, id, depth + 1);
            if (c) n.children.push(cid);
          });
        }
        return n;
      }
      var rootNode = clean(engine.root, null, 0);
      if (!rootNode || !CONTAINERS[rootNode.type]) return null;
      // the root is the section itself: it spans the store's width and sits in the flow
      rootNode.layoutChild.position = 'flow';
      rootNode.layoutChild.widthMode = 'fill';
      if (rootNode.layoutChild.heightMode === 'fill') rootNode.layoutChild.heightMode = 'hug';
      rootNode.geometry.x = 0; rootNode.geometry.y = 0; rootNode.geometry.rotation = 0;
      // keep only the assets the nodes use
      var used = {};
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id];
        if (n.asset) used[n.asset] = true;
        [n.fills].concat(Object.keys(n.overrides).map(function (b) { return n.overrides[b].fills || []; })).forEach(function (list) {
          (list || []).forEach(function (p) { if (p.type === 'image') used[p.asset] = true; });
        });
      });
      var keptAssets = {};
      Object.keys(assets).forEach(function (id) { if (used[id]) keptAssets[id] = assets[id]; });
      return { v: 1, root: engine.root, nodes: nodes, assets: keptAssets };
    } catch (e) { return null; }
  }

  function isDetached(s) { return !!(isObj(s) && isObj(s.engine) && typeof s.engine.root === 'string' && isObj(s.engine.nodes)); }
  function hasDetached(config) {
    return !!(isObj(config) && Array.isArray(config.sections) && config.sections.some(function (s) { return isDetached(s) && s.enabled !== false; }));
  }

  /* ------------------------------------------------------------------ the engine (browser) */

  function DE() { return root.DualEngine && typeof root.DualEngine.exportDocument === 'function' ? root.DualEngine : null; }
  function ready() { return !!DE(); }

  var SELF_SRC = (function () {
    try { return typeof document !== 'undefined' && document.currentScript ? String(document.currentScript.src || '') : ''; } catch (e) { return ''; }
  })();
  var ENGINE_SCRIPTS = ['model.js', 'history.js', 'resolve.js', 'text-metrics.js', 'text.js', 'layout.js', 'motion.js', 'css.js', 'html.js', 'raster.js', 'index.js'];
  var loading = null, waiters = [];
  /* loads ../studio/engine/*.js once, in order, only when a fiche has a detached section */
  function ensureEngine(cb) {
    if (ready()) { if (cb) cb(true); return; }
    if (cb) waiters.push(cb);
    if (loading || typeof document === 'undefined' || !SELF_SRC) return;
    var base = SELF_SRC.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + '../studio/engine/';
    loading = true;
    var i = 0;
    function next() {
      if (i >= ENGINE_SCRIPTS.length) { var w = waiters.splice(0); w.forEach(function (f) { try { f(ready()); } catch (e) { /* a host */ } }); return; }
      var sc = document.createElement('script');
      sc.src = base + ENGINE_SCRIPTS[i++];
      sc.onload = next;
      sc.onerror = function () { var w = waiters.splice(0); w.forEach(function (f) { try { f(false); } catch (e) { /* a host */ } }); };
      (document.head || document.documentElement).appendChild(sc);
    }
    next();
  }

  function photoUrl(id) {
    var R = root.JeereRender;
    try { return R && typeof R.photoSrc === 'function' ? R.photoSrc(id) : null; } catch (e) { return null; }
  }
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  function assetSrc(a) {
    if (!a || typeof a.src !== 'string') return BLANK;
    if (DEMO_RE.test(a.src)) return photoUrl(a.src.slice(5)) || BLANK;
    return DATA_RE.test(a.src) ? a.src : BLANK;
  }

  /** A DualEngine document for a (sanitised) engine key: one page, the section's root frame. */
  function toDocument(engine, opts) {
    var E = DE();
    var clean = opts && opts.trusted ? engine : sanitize(engine);
    if (!E || !clean) return null;
    var M = E.model;
    var doc = M.createDocument({ id: 'eng-' + clean.root, name: (opts && opts.name) || 'Section', breakpoints: BREAKPOINTS.map(function (b) { return { id: b.id, name: b.name, width: b.width }; }), pageId: 'page-' + clean.root, pageName: 'Section' });
    doc.nodes = JSON.parse(JSON.stringify(clean.nodes));
    doc.pages[0].children = [clean.root];
    Object.keys(clean.assets || {}).forEach(function (id) {
      var a = clean.assets[id];
      doc.assets[id] = { url: assetSrc(a), width: a.w, height: a.h, src: a.src };
    });
    return doc;
  }

  /* `.jst [data-eng="s3"]` + the engine's selectors; breakpoint media blocks → container queries */
  function scopeCSS(gen, doc, scope) {
    var E = DE();
    var R = E.resolve;
    var bpMedia = {};
    doc.breakpoints.slice(1).forEach(function (b) { var q = R.mediaQuery(doc, b.id); if (q) bpMedia[q] = true; });
    var out = [scope + ' { display: block; position: relative; width: 100%; container-type: inline-size; }',
      scope + ' [class*="de-"] { letter-spacing: normal; word-spacing: normal; text-shadow: none; }'];
    var cur = null, buf = [];
    function flush() {
      if (!buf.length) return;
      if (cur) out.push(cur + ' {\n' + buf.map(function (l) { return '  ' + l; }).join('\n') + '\n}');
      else out = out.concat(buf);
      buf = [];
    }
    (gen.rules || []).forEach(function (r) {
      if (!r || !r.selector || r.selector === 'html, body' || r.selector.charAt(0) === '@' || r.selector === ':root' || /^\[data-theme/.test(r.selector)) return;
      var sel = r.selector.split(/,\s*/).map(function (s) { return scope + ' ' + s; }).join(', ');
      var wrap = r.media ? (bpMedia[r.media] ? '@container ' + r.media : '@media ' + r.media) : null;
      if (wrap !== cur) { flush(); cur = wrap; }
      var body = r.declarations.map(function (d) { return d[0] + ': ' + d[1] + ';'; }).join(' ');
      var line = sel + ' { ' + body + ' }';
      buf.push(r.supports ? '@supports ' + r.supports + ' { ' + line + ' }' : line);
    });
    flush();
    return out.join('\n') + '\n';
  }

  var cache = [];   // [{ key, sid, out }] — the newest last, 24 at most
  function attrEsc(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, ''); }

  /**
   * The engine's HTML and the scoped CSS of a detached section (cached by content).
   * @returns {{html, css, body, rules, warnings, doc}|null}
   */
  function exportSection(section, opts) {
    var E = DE();
    if (!E || !isDetached(section)) return null;
    var sid = attrEsc(section.id || 's');
    var key;
    try { key = sid + '|' + JSON.stringify(section.engine); } catch (e) { return null; }
    for (var i = cache.length - 1; i >= 0; i--) if (cache[i].key === key) return cache[i].out;
    var doc = toDocument(section.engine);
    if (!doc) return null;
    var res;
    try { res = E.exportDocument(doc, opts || {}); } catch (e) { return null; }
    var scope = '.jst [data-eng="' + sid + '"]';
    var css = scopeCSS(res, doc, scope);
    var out = { html: res.html, body: res.body, css: css, rawCss: res.css, rules: res.rules, warnings: res.warnings, doc: doc, layouts: res.layouts };
    cache.push({ key: key, out: out });
    if (cache.length > 24) cache.shift();
    return out;
  }

  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  var pending = false;
  /** The markup render.js puts in place of the section (null: not detached → the template renders it). */
  /* A detached section whose nodes are bound to products (node.bind, wave 1): a copy with the products' current
   * name, price and photo in place (render.js passes its model: m.products). The fiche keeps the binding,
   * the markup follows the catalogue. */
  function fmtPrice(n) {
    var D = root.JEERE_DATA;
    var t = D && typeof D.formatNumber === 'function' ? D.formatNumber(n) : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    return t + '\u00A0FCFA';
  }
  function boundSection(s, m) {
    var nodes = s.engine && s.engine.nodes;
    if (!nodes || !m || !Array.isArray(m.products)) return s;
    var ids = Object.keys(nodes).filter(function (id) { return isObj(nodes[id]) && isObj(nodes[id].bind); });
    if (!ids.length) return s;
    var copy = JSON.parse(JSON.stringify(s));
    ids.forEach(function (id) {
      var n = copy.engine.nodes[id], b = n.bind;
      var p = m.products.filter(function (x) { return x && x.id === b.product; })[0];
      if (!p) return;
      if (b.field === 'image') {
        var src = p.photo && p.photo.id && !p.ownImage ? 'demo:' + p.photo.id : (typeof p.image === 'string' && DATA_RE.test(p.image) ? p.image : null);
        if (!src) return;
        var aid = 'bind-' + String(b.product).slice(0, 30);
        copy.engine.assets = isObj(copy.engine.assets) ? copy.engine.assets : {};
        copy.engine.assets[aid] = { src: src };
        n.asset = aid;
        n.alt = p.alt || p.name || n.alt || '';
        return;
      }
      var txt = b.field === 'price' ? (typeof p.price === 'number' ? fmtPrice(p.price) : 'Prix à venir') : (p.name || 'Produit');
      var paras = n.text && Array.isArray(n.text.paragraphs) ? n.text.paragraphs : [];
      var runs = paras[0] && Array.isArray(paras[0].runs) ? paras[0].runs : [];
      if (b.field === 'price' && runs.length > 1) {
        // « 6 500 » + « FCFA » in two runs: the number run takes the number, the rest stays
        var num = typeof p.price === 'number' ? fmtPrice(p.price).replace(/\u00A0FCFA$/, '') : 'Prix à venir';
        var at = runs.findIndex ? runs.findIndex(function (r) { return /\d/.test(r.text || ''); }) : 0;
        var r0 = runs[at < 0 ? 0 : at];
        r0.text = num + ((String(r0.text || '').match(/\s+$/) || [''])[0]);
        return;
      }
      n.text = { paragraphs: [{ runs: [Object.assign({}, runs[0] || {}, { text: txt })] }] };
      if (paras[0] && paras[0].style) n.text.paragraphs[0].style = paras[0].style;
    });
    return copy;
  }

  function sectionHTML(s, m) {
    if (!isDetached(s)) return null;
    if (m) { try { s = boundSection(s, m); } catch (e) { /* the section as it was detached */ } }
    var sid = attrEsc(s.id || 's');
    var type = attrEsc(s.type || '');
    var open = '<section class="jst-eng" data-section-id="' + escAttr(s.id || sid) + '" data-section-type="' + type + '" data-eng="' + sid + '"';
    if (!ready()) {
      pending = true;
      ensureEngine();
      return open + ' data-eng-pending=""><div class="jst-eng__wait" style="min-height:240px"></div></section>';
    }
    var out = exportSection(s);
    if (!out) {
      return open + '><div class="jst-wrap" style="padding:48px 20px;text-align:center;opacity:.7">Cette section n’a pas pu être affichée.</div></section>';
    }
    // the CSS never contains '</': it is generated from numbers, whitelisted names and base64 URLs
    return open + '><style data-jst-eng>' + out.css.replace(/<\//g, '<\\/') + '</style>' + out.body + '</section>';
  }

  /* After render(): a store that waited for the engine renders again once it is there (once). */
  function apply(config, rootEl) {
    if (!rootEl || !rootEl.querySelector || !pending) return;
    if (!rootEl.querySelector('[data-eng-pending]')) return;
    ensureEngine(function (ok) {
      if (!ok || !rootEl.isConnected || !rootEl.querySelector('[data-eng-pending]')) return;
      var R = root.JeereRender, v = rootEl.__jstView;
      if (!R || !v) return;
      try { R.render(v.config, rootEl, { device: v.device, page: v.page, productId: v.productId, pageId: v.pageId }); } catch (e) { /* the store stays as it is */ }
    });
  }

  var api = {
    version: 1, BREAKPOINTS: BREAKPOINTS, BP_IDS: BP_IDS, LIMITS: LIMITS, TAGS: TAGS,
    sanitize: sanitize, isDetached: isDetached, hasDetached: hasDetached, bpForWidth: bpForWidth,
    href: href, assetSrc: assetSrc, toDocument: toDocument, scopeCSS: scopeCSS, exportSection: exportSection,
    sectionHTML: sectionHTML, boundSection: boundSection, apply: apply, ensureEngine: ensureEngine, ready: ready,
    clearCache: function () { cache.length = 0; }
  };
  root.JeereEngineSections = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
