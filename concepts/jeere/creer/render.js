/*
 * JEERE Studio — render.js
 * Turns a fiche boutique (store config v1) into a store page, with one of three tested templates:
 * Plateau (editorial), Cocody (soft) and Treichville (bold).
 *
 * Global: window.JeereRender = { render, ensureFonts, artSVG, PAGES }
 *
 * render(config, rootEl, { device: 'phone' | 'desktop', page: 'home' | 'product' | 'cart' |
 *   'checkout' | 'confirmation', productId })
 *   Draws one page of the store. The whole customer journey works inside the preview: a product
 *   card opens its page, « Ajouter au panier » opens the cart, then the checkout and the
 *   confirmation. Each such move re-renders the same rootEl and dispatches a bubbling, cancelable
 *   CustomEvent 'jst:navigate' on rootEl with detail { page, productId } (productId is null except
 *   on the product page). Cancel it to stop the default scroll back to the top of the store.
 *   The demo cart lives on the element: rootEl.__jstCart = { [productId]: qty } (1 to 20). The
 *   checkout form lives in rootEl.__jstForm. Nothing is sent anywhere: no location, no history,
 *   no network request.
 *
 * Rules kept here:
 * - pure and defensive: reads only JEERE_DATA and the config, never throws, falls back to defaults;
 * - every user string is escaped (esc) before it reaches the markup;
 * - layout depends only on data-device ('phone' | 'desktop'), never on the viewport;
 * - colour intensity: data-intensity 'vivid' (default) or 'soft' on the root, from theme.intensity;
 * - styles live in store.css, scoped under .jst.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  const DATA = () => root.JEERE_DATA || null;

  const NBSP = ' ';

  /* ------------------------------------------------------------------ small helpers */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => isObj(o) && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  // Collections in JEERE_DATA are keyed by id with non-enumerable array helpers: test the ids only.
  const inColl = (coll, id) => !!coll && typeof id === 'string' && Object.prototype.propertyIsEnumerable.call(coll, id);
  const str = (v, d) => (typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v) ? String(v) : (d === undefined ? '' : d)));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/[\s  ]/g, '').replace(/fcfa$/i, '').replace(',', '.'));
      return isFinite(n) ? n : null;
    }
    return null;
  }

  function fmtNum(n) {
    const d = DATA();
    if (d && typeof d.formatNumber === 'function') return d.formatNumber(n);
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // « 14 500 FCFA » as plain text that never breaks (button labels, sentences).
  function money(n) {
    const d = DATA();
    let s = '';
    try { s = d && typeof d.formatPrice === 'function' ? String(d.formatPrice(n)) : ''; } catch (e) { s = ''; }
    if (!s) s = fmtNum(n) + ' FCFA';
    return s.replace(/\s/g, NBSP);
  }

  const plural = (n, one, many) => n + NBSP + (n > 1 ? many : one);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  // French typography on display only (the fiche keeps what the seller typed): a no-break space
  // before : ; ? ! and inside « », so a lone colon never starts a line.
  const fr = (t) => t.replace(/[ \t]+([:;?!»])/g, NBSP + '$1').replace(/«[ \t]+/g, '«' + NBSP);

  // Multi-line text (textarea): paragraphs on blank lines, <br> on single line breaks. Escaped.
  function paras(text) {
    const t = str(text).trim();
    if (!t) return '';
    return t.split(/\n\s*\n/).map((p) => '<p>' + esc(fr(p.trim())).replace(/\n/g, '<br>') + '</p>').join('');
  }
  const line = (text) => esc(fr(str(text).replace(/\s*\n\s*/g, ' ').trim()));

  const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
  const validImage = (v) => (typeof v === 'string' && v.length < 16000000 && IMAGE_RE.test(v) ? v.replace(/\s+/g, '') : null);

  /* ------------------------------------------------------------------ colours */

  function parseHex(h) {
    if (typeof h !== 'string') return null;
    let s = h.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const validHex = (h) => (parseHex(h) ? toHex(parseHex(h)) : null);
  function toHex(rgb) {
    return '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function mix(a, b, t) {
    const A = parseHex(a) || [0, 0, 0];
    const B = parseHex(b) || [255, 255, 255];
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  }
  function rgbToHsl(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const dd = max - min;
    const s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    let h;
    if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / dd + 2;
    else h = (r - g) / dd + 4;
    return [h / 6, s, l];
  }
  function hslToRgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
  }
  function shade(hex, dl, ds) {
    const hsl = rgbToHsl(parseHex(hex) || [200, 200, 200]);
    return toHex(hslToRgb(hsl[0], clamp(hsl[1] + (ds || 0), 0, 1), clamp(hsl[2] + dl, 0.07, 0.97)));
  }
  function lum(hex) {
    const c = parseHex(hex) || [0, 0, 0];
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  // Moves a colour's lightness (keeping its hue) until it reaches `min` contrast on every
  // background given: an accent that is too pale on cream becomes a deeper, readable accent.
  function readable(fg, bgs, min, lighten) {
    const hsl = rgbToHsl(parseHex(fg) || [0, 0, 0]);
    let out = validHex(fg) || '#000000';
    for (let i = 0; i < 48; i++) {
      if (bgs.every((b) => contrast(out, b) >= min)) return out;
      hsl[2] = clamp(hsl[2] + (lighten ? 0.02 : -0.02), 0, 1);
      out = toHex(hslToRgb(hsl[0], hsl[1], hsl[2]));
    }
    return out;
  }

  // Set while one page is being built (render is synchronous): vivid stores get richer tiles.
  let VIVID = false;

  // The tile behind a product illustration. Soft: a lighter tint of the product colour, or a
  // slightly deeper one when the colour is already very light (a white sneaker on a pale grey
  // card). Vivid: the same hue pushed towards saturation and a mid tone, never washed out.
  const tileCache = new Map();
  function tileColors(hex) {
    const key = (VIVID ? 'v' : 's') + String(hex);
    if (tileCache.has(key)) return tileCache.get(key);
    const hsl = rgbToHsl(parseHex(hex) || [233, 216, 189]);
    const L = hsl[2];
    const S = hsl[1];
    let out;
    if (VIVID) {
      const s = S < 0.04 ? S : clamp(S * 1.3 + 0.14, 0, 0.82);
      const tl = L > 0.78 ? L - 0.14 : clamp(L + (0.8 - L) * 0.42, 0.3, 0.8);
      out = {
        tile: toHex(hslToRgb(hsl[0], s, tl)),
        hi: toHex(hslToRgb(hsl[0], s * 0.9, Math.min(0.94, tl + 0.08)))
      };
    } else {
      const tl = L > 0.8 ? L - 0.075 : L + (0.93 - L) * 0.62;
      out = {
        tile: toHex(hslToRgb(hsl[0], S * 0.72, tl)),
        hi: toHex(hslToRgb(hsl[0], S * 0.6, Math.min(0.975, tl + 0.055)))
      };
    }
    if (tileCache.size > 600) tileCache.clear();
    tileCache.set(key, out);
    return out;
  }

  /* ------------------------------------------------------------------ icons */

  const ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    bag: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    search: '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.3-4.3"/>',
    chat: '<path d="M20 11.6a7.9 7.9 0 0 1-11.6 7l-4.4 1.2 1.2-4.2A7.9 7.9 0 1 1 20 11.6z"/><path d="M8.6 10.4h6.8M8.6 13.4h4.2"/>',
    arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    truck: '<path d="M2.8 6.5h11v9.5h-11z"/><path d="M13.8 9.5h3.7l3.7 3.6V16h-7.4"/><circle cx="6.8" cy="17.6" r="1.9"/><circle cx="17.2" cy="17.6" r="1.9"/>',
    heart: '<path d="M12 19.6s-7.4-4.5-7.4-9.9A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.4 2.4c0 5.4-7.4 9.9-7.4 9.9z"/>',
    check: '<path d="M5 12.5l4.3 4.3L19 7.2"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.6v2"/>',
    shield: '<path d="M12 3.2l7 2.6v5.6c0 4.5-3 8-7 9.4-4-1.4-7-4.9-7-9.4V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.4"/>',
    minus: '<path d="M6.5 12h11"/>',
    plus: '<path d="M12 6.5v11M6.5 12h11"/>',
    close: '<path d="M7 7l10 10M17 7L7 17"/>',
    back: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
    chevron: '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
    down: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
    phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M10.6 17.9h2.8"/>',
    cash: '<rect x="2.8" y="6.5" width="18.4" height="11" rx="1.8"/><circle cx="12" cy="12" r="2.6"/><path d="M6.2 9.6v4.8M17.8 9.6v4.8"/>',
    card: '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path d="M2.8 9.8h18.4M6.5 15h4"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/>',
    user: '<circle cx="12" cy="8.4" r="3.8"/><path d="M4.8 20c.8-3.8 3.6-6 7.2-6s6.4 2.2 7.2 6"/>'
  };
  const icon = (name, cls) => '<svg class="jst-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';

  const STAR = '<path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';
  function stars(rating, cls) {
    const r = clamp(Math.round(num(rating) || 5), 1, 5);
    let out = '<span class="jst-stars' + (cls ? ' ' + cls : '') + '" role="img" aria-label="Note' + NBSP + ': ' + r + ' sur 5">';
    for (let i = 1; i <= 5; i++) {
      out += '<svg class="jst-star' + (i <= r ? '' : ' is-off') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' + STAR + '</svg>';
    }
    return out + '</span>';
  }

  /* ------------------------------------------------------------------ product illustrations
   * viewBox 0 0 200 250, transparent background, flat shapes in the product colour and shades
   * derived from it. No ids or gradients, so many copies can live on one page.
   */

  const SH = (cx, cy, rx, ry) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#000" fill-opacity=".11"/>';
  const HI = 'fill="#fff" fill-opacity=".32"';

  function artColors(color) {
    const c = validHex(color) || '#E9D8BD';
    return {
      c: c,
      d1: shade(c, -0.11, 0.02),
      d2: shade(c, -0.22, 0.04),
      d3: shade(c, -0.36, 0.04),
      l1: shade(c, 0.07),
      l2: shade(c, 0.15),
      w: mix(c, '#FFFFFF', 0.8)
    };
  }

  const ART = {
    jar: (p) =>
      SH(100, 214, 64, 7) +
      '<rect x="46" y="116" width="108" height="97" rx="20" fill="' + p.c + '"/>' +
      '<path d="M46 140v-4c0-11 9-20 20-20h68c11 0 20 9 20 20v4z" fill="' + p.d1 + '" fill-opacity=".5"/>' +
      '<rect x="138" y="128" width="16" height="78" rx="8" fill="' + p.d1 + '" fill-opacity=".35"/>' +
      '<rect x="40" y="84" width="120" height="42" rx="12" fill="' + p.d2 + '"/>' +
      '<rect x="48" y="89" width="104" height="6" rx="3" fill="#fff" fill-opacity=".18"/>' +
      '<rect x="40" y="114" width="120" height="6" fill="' + p.d3 + '" fill-opacity=".35"/>' +
      '<rect x="64" y="148" width="72" height="46" rx="9" fill="' + p.w + '"/>' +
      '<rect x="76" y="161" width="48" height="6" rx="3" fill="' + p.d2 + '"/>' +
      '<rect x="84" y="174" width="32" height="5" rx="2.5" fill="' + p.d1 + '"/>' +
      '<rect x="55" y="140" width="8" height="60" rx="4" ' + HI + '/>',

    bottle: (p) =>
      SH(100, 215, 48, 6.5) +
      '<rect x="62" y="100" width="76" height="114" rx="24" fill="' + p.c + '"/>' +
      '<rect x="120" y="112" width="18" height="90" rx="9" fill="' + p.d1 + '" fill-opacity=".4"/>' +
      '<rect x="86" y="82" width="28" height="26" rx="5" fill="' + p.d1 + '"/>' +
      '<rect x="77" y="42" width="46" height="46" rx="10" fill="' + p.d3 + '"/>' +
      '<rect x="77" y="56" width="46" height="4" fill="#000" fill-opacity=".14"/>' +
      '<rect x="77" y="68" width="46" height="4" fill="#000" fill-opacity=".14"/>' +
      '<rect x="84" y="47" width="6" height="34" rx="3" fill="#fff" fill-opacity=".16"/>' +
      '<rect x="74" y="134" width="52" height="58" rx="8" fill="' + p.w + '"/>' +
      '<circle cx="100" cy="152" r="7" fill="' + p.d1 + '"/>' +
      '<rect x="84" y="166" width="32" height="5" rx="2.5" fill="' + p.d2 + '"/>' +
      '<rect x="89" y="177" width="22" height="4" rx="2" fill="' + p.d1 + '"/>' +
      '<rect x="69" y="112" width="8" height="88" rx="4" ' + HI + '/>',

    bag: (p) =>
      SH(100, 216, 70, 7.5) +
      '<path d="M72 120V96a28 28 0 0 1 56 0v24" fill="none" stroke="' + p.d3 + '" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M46 110h108l12 94a10 10 0 0 1-10 11H44a10 10 0 0 1-10-11z" fill="' + p.c + '"/>' +
      '<path d="M138 110h16l12 94a10 10 0 0 1-10 11h-12z" fill="' + p.d1 + '" fill-opacity=".45"/>' +
      '<path d="M46 110h108l2.4 20H43.6z" fill="' + p.d1 + '"/>' +
      '<rect x="88" y="122" width="24" height="18" rx="5" fill="' + p.d3 + '"/>' +
      '<rect x="94" y="128" width="12" height="6" rx="3" fill="' + p.l2 + '"/>' +
      '<path d="M64 150h72" stroke="' + p.d1 + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" fill="none"/>' +
      '<rect x="54" y="140" width="8" height="62" rx="4" ' + HI + '/>' +
      '<path d="M72 120v-8M128 120v-8" stroke="' + p.d3 + '" stroke-width="9" stroke-linecap="round"/>',

    dress: (p) =>
      SH(100, 219, 62, 7) +
      '<path d="M93 34a7 7 0 1 1 7 7v7" fill="none" stroke="' + p.d3 + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M100 48L60 68h80z" fill="none" stroke="' + p.d3 + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M78 64h11c3 10 7 15 11 15s8-5 11-15h11l4 40c-4 4-5 9-3 14l38 88c-18 9-40 13-61 13s-43-4-61-13l38-88c2-5 1-10-3-14z" fill="' + p.c + '"/>' +
      '<path d="M74 104c8 5 17 7 26 7s18-2 26-7l-1 16c-8 4-16 6-25 6s-17-2-25-6z" fill="' + p.d1 + '"/>' +
      '<path d="M100 126v94M84 126l-22 86M116 126l22 86" stroke="' + p.d1 + '" stroke-width="2.5" stroke-opacity=".55" fill="none"/>' +
      '<path d="M120 126l38 82c-6 3-12 5-19 7l-21-89z" fill="' + p.d1 + '" fill-opacity=".35"/>' +
      '<path d="M80 72l3 28" stroke="#fff" stroke-opacity=".4" stroke-width="6" stroke-linecap="round"/>' +
      '<circle cx="100" cy="118" r="4" fill="' + p.l2 + '"/>',

    tshirt: (p) =>
      SH(100, 215, 64, 7) +
      '<path d="M72 62l18-7c3 10 6 14 10 14s7-4 10-14l18 7 38 23-14 30-17-8v95c0 3-2 5-5 5H68c-3 0-5-2-5-5v-95l-17 8-14-30z" fill="' + p.c + '"/>' +
      '<path d="M90 55c3 10 6 14 10 14s7-4 10-14c-3-1.6-6.5-2.4-10-2.4s-7 .8-10 2.4z" fill="' + p.d2 + '"/>' +
      '<path d="M32 85l14 30 9.5-4.5L41.5 80.6z" fill="' + p.d1 + '" fill-opacity=".7"/>' +
      '<path d="M168 85l-14 30-9.5-4.5 14-29.9z" fill="' + p.d1 + '" fill-opacity=".7"/>' +
      '<path d="M118 99l19 9v95c0 3-2 5-5 5h-14z" fill="' + p.d1 + '" fill-opacity=".38"/>' +
      '<path d="M90 55c3 10 6 14 10 14s7-4 10-14" fill="none" stroke="' + p.d1 + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<rect x="108" y="92" width="18" height="20" rx="3" fill="' + p.d1 + '" fill-opacity=".6"/>' +
      '<path d="M76 92v100" stroke="#fff" stroke-opacity=".3" stroke-width="7" stroke-linecap="round"/>',

    shoe: (p) =>
      SH(102, 172, 86, 7) +
      '<path d="M14 140h170c6 0 9 4 7 10-3 9-10 14-20 14H30c-10 0-16-6-16-14z" fill="' + p.w + '"/>' +
      '<path d="M15.5 155H190c-4 6-10 9-19 9H30c-8 0-12.5-3-14.5-9z" fill="' + p.d2 + '" fill-opacity=".55"/>' +
      '<path d="M24 147.5h156" stroke="' + p.d1 + '" stroke-width="2" stroke-dasharray="3 5" stroke-opacity=".7"/>' +
      '<path d="M18 140l4-38c1-9 6-14 15-14h22c7 0 11 3 15 9 10 15 22 22 40 24l34 5c22 3 33 6 36 14z" fill="' + p.c + '"/>' +
      '<path d="M150 126.3c20 3 30 6 34 13.7h-30c-.5-5-2-9.5-4-13.7z" fill="' + p.l1 + '"/>' +
      '<path d="M22 102c1-9 6-14 15-14h6l-4 52H18z" fill="' + p.d1 + '"/>' +
      '<path d="M72 95c10 15 22 23 42 26l6 19c-28 0-50-9-62-26z" fill="' + p.d1 + '" fill-opacity=".5"/>' +
      '<path d="M80 104l10-7M90 112l10-7M101 118l10-6" stroke="' + p.w + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M30 91c10-5 20-5 30 0" stroke="' + p.d3 + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<path d="M48 129h66" stroke="' + p.d2 + '" stroke-width="4" stroke-linecap="round" stroke-opacity=".5"/>' +
      '<path d="M30 106v24" stroke="#fff" stroke-opacity=".3" stroke-width="6" stroke-linecap="round"/>',

    cap: (p) =>
      SH(102, 184, 76, 7) +
      '<path d="M38 160c-3-48 24-78 62-78 36 0 58 28 56 66z" fill="' + p.c + '"/>' +
      '<path d="M100 82c24 4 46 24 56 66l-46 6c-2-30-5-52-10-72z" fill="' + p.l1 + '"/>' +
      '<path d="M100 82c-7 24-9 50-7 76M100 82c-26 12-42 40-46 78" stroke="' + p.d1 + '" stroke-width="2.5" fill="none" stroke-opacity=".8"/>' +
      '<path d="M38 160c-1-14 0-26 4-38 6 20 12 30 24 36z" fill="' + p.d1 + '" fill-opacity=".45"/>' +
      '<circle cx="72" cy="116" r="3" fill="' + p.d2 + '"/><circle cx="124" cy="104" r="3" fill="' + p.d2 + '"/>' +
      '<ellipse cx="100" cy="83" rx="9" ry="4.5" fill="' + p.d2 + '"/>' +
      '<path d="M38 160l118-12" stroke="' + p.d2 + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M126 150c24-7 50-7 68 2 5 3 3 9-3 10-26 5-50 4-68-2z" fill="' + p.d2 + '"/>' +
      '<path d="M136 152c18-4 36-4 50 0" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<path d="M58 132c4-16 12-28 22-36" stroke="#fff" stroke-opacity=".35" stroke-width="6" stroke-linecap="round" fill="none"/>',

    jewel: (p) => {
      // A bead necklace with a faceted pendant. Beads follow a quadratic curve.
      let beads = '';
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (Math.abs(t - 0.5) < 0.03) continue;
        const x = (1 - t) * (1 - t) * 46 + 2 * (1 - t) * t * 100 + t * t * 154;
        const y = (1 - t) * (1 - t) * 52 + 2 * (1 - t) * t * 206 + t * t * 52;
        const big = i % 2 === 0;
        beads += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (big ? 6.2 : 3.4) + '" fill="' + (big ? p.c : p.d2) + '"/>';
        if (big) beads += '<circle cx="' + (x - 1.8).toFixed(1) + '" cy="' + (y - 1.8).toFixed(1) + '" r="1.8" fill="#fff" fill-opacity=".45"/>';
      }
      return SH(100, 222, 34, 5) + beads +
        '<circle cx="100" cy="134" r="6" fill="none" stroke="' + p.d3 + '" stroke-width="3.5"/>' +
        '<path d="M100 141l25 24-25 45-25-45z" fill="' + p.c + '"/>' +
        '<path d="M100 141l25 24-25 7z" fill="' + p.l2 + '"/>' +
        '<path d="M100 141l-25 24 25 7z" fill="' + p.l1 + '"/>' +
        '<path d="M75 165l25 7v38z" fill="' + p.d1 + '"/>' +
        '<path d="M125 165l-25 7v38z" fill="' + p.d2 + '"/>' +
        '<path d="M146 150l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="' + p.l2 + '"/>' +
        '<path d="M56 182l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="' + p.l1 + '"/>';
    },

    hair: (p) =>
      SH(100, 224, 58, 6) +
      '<path d="M50 224c4-20 24-30 50-30s46 10 50 30z" fill="#E4D4C3"/>' +
      '<path d="M88 150h24v48c-4 2-8 3-12 3s-8-1-12-3z" fill="#EADCCD"/>' +
      '<path d="M100 44c-40 0-58 30-58 70 0 30-6 54-13 76 11 9 26 11 38 6 4-24 8-48 6-72h54c-2 24 2 48 6 72 12 5 27 3 38-6-7-22-13-46-13-76 0-40-18-70-58-70z" fill="' + p.c + '"/>' +
      '<ellipse cx="100" cy="128" rx="25" ry="32" fill="#F2E8DD"/>' +
      '<path d="M76 110c-3 22-1 44 6 62M124 110c3 22 1 44-6 62" stroke="' + p.d2 + '" stroke-width="4" stroke-linecap="round" fill="none" stroke-opacity=".45"/>' +
      '<path d="M100 44c-34 0-52 24-54 60 13-17 30-27 52-28 18-1 36 7 52 24-2-34-17-56-50-56z" fill="' + p.c + '"/>' +
      '<path d="M48 110c10-21 31-33 58-31-17 8-27 21-31 39-8-6-18-9-27-8z" fill="' + p.d1 + '"/>' +
      '<path d="M57 124c-5 22 4 38-3 64M66 118c-3 26 4 44 0 72M143 124c5 22-4 38 3 64M134 118c3 26-4 44 0 72" stroke="' + p.d2 + '" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-opacity=".6"/>' +
      '<path d="M80 58c12-7 27-8 40-3" stroke="' + p.l2 + '" stroke-width="5" stroke-linecap="round" fill="none" stroke-opacity=".85"/>',

    plate: (p) =>
      '<path d="M82 62c-7 8-7 15 0 22s7 14 0 22M108 54c-7 8-7 15 0 22s7 14 0 22" fill="none" stroke="' + p.d2 + '" stroke-width="4" stroke-linecap="round" stroke-opacity=".35"/>' +
      '<ellipse cx="100" cy="174" rx="84" ry="24" fill="#000" fill-opacity=".1"/>' +
      '<ellipse cx="100" cy="166" rx="82" ry="35" fill="' + shade(p.w, -0.08) + '"/>' +
      '<ellipse cx="100" cy="161" rx="82" ry="35" fill="' + p.w + '"/>' +
      '<ellipse cx="100" cy="161" rx="60" ry="24" fill="' + mix(p.w, p.c, 0.28) + '"/>' +
      '<path d="M54 162c2-34 22-50 46-50s44 16 46 50c-14 6-30 9-46 9s-32-3-46-9z" fill="' + p.c + '"/>' +
      '<path d="M100 112c24 0 44 16 46 50-8 3-16 5-25 7 6-22-4-46-21-57z" fill="' + p.d1 + '" fill-opacity=".45"/>' +
      '<ellipse cx="128" cy="146" rx="25" ry="12" transform="rotate(-20 128 146)" fill="' + p.d2 + '"/>' +
      '<path d="M114 146l8-8M124 150l9-9M134 152l7-8" stroke="' + p.d3 + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '<circle cx="76" cy="140" r="2.6" fill="' + p.l2 + '"/><circle cx="88" cy="128" r="2.6" fill="' + p.l2 + '"/><circle cx="72" cy="154" r="2.6" fill="' + p.l2 + '"/><circle cx="96" cy="142" r="2.6" fill="' + p.l2 + '"/><circle cx="84" cy="150" r="2.6" fill="' + p.l2 + '"/><circle cx="104" cy="124" r="2.6" fill="' + p.l2 + '"/>' +
      '<path d="M80 118c-8-2-14 2-16 8 8 2 14-2 16-8zM92 113c-3-7-10-9-16-6 3 7 10 9 16 6z" fill="#6F9A4E"/>',

    basket: (p) => {
      const leftX = (y) => 42 + (y - 116) * (10 / 92);
      let weave = '';
      for (let r = 0; r < 5; r++) {
        const y = 130 + r * 17;
        const xl = leftX(y) + 2, xr = 200 - xl;
        weave += '<path d="M' + xl.toFixed(1) + ' ' + y + 'H' + xr.toFixed(1) + '" stroke="' + p.d1 + '" stroke-width="3" stroke-opacity=".7"/>';
        for (let x = xl + (r % 2 ? 9 : 2); x < xr - 6; x += 14) {
          weave += '<rect x="' + x.toFixed(1) + '" y="' + (y + 4) + '" width="6" height="9" rx="3" fill="' + p.l1 + '"/>';
        }
      }
      return SH(100, 216, 66, 7) +
        '<path d="M58 118c0-44 18-66 42-66s42 22 42 66" fill="none" stroke="' + p.d2 + '" stroke-width="9" stroke-linecap="round"/>' +
        '<path d="M42 116h116l-11 90c-1 5-5 8-10 8H63c-5 0-9-3-10-8z" fill="' + p.c + '"/>' + weave +
        '<path d="M136 116h22l-11 90c-1 5-5 8-10 8h-15z" fill="' + p.d1 + '" fill-opacity=".3"/>' +
        '<rect x="34" y="106" width="132" height="18" rx="8" fill="' + p.d2 + '"/>' +
        '<rect x="42" y="109" width="116" height="4" rx="2" fill="#fff" fill-opacity=".2"/>';
    },

    box: (p) =>
      SH(100, 215, 66, 7) +
      '<rect x="48" y="118" width="104" height="96" rx="6" fill="' + p.c + '"/>' +
      '<path d="M122 118h24a6 6 0 0 1 6 6v84a6 6 0 0 1-6 6h-24z" fill="' + p.d1 + '" fill-opacity=".4"/>' +
      '<rect x="40" y="98" width="120" height="28" rx="6" fill="' + p.d1 + '"/>' +
      '<rect x="40" y="122" width="120" height="5" fill="#000" fill-opacity=".1"/>' +
      '<rect x="91" y="98" width="18" height="116" fill="' + p.d3 + '"/>' +
      '<path d="M100 98c-10-20-34-28-38-14-3 9 14 15 38 14z" fill="' + p.d3 + '"/>' +
      '<path d="M100 98c10-20 34-28 38-14 3 9-14 15-38 14z" fill="' + p.d3 + '"/>' +
      '<path d="M100 98c-6-11-22-17-26-9" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<rect x="93" y="91" width="14" height="13" rx="4" fill="' + p.d2 + '"/>' +
      '<rect x="57" y="134" width="8" height="70" rx="4" ' + HI + '/>'
  };

  // Re-centres the bottom-heavy drawings so every kind sits at the same optical height.
  const ART_FIT = {
    jar: 'translate(0 -14)',
    bag: 'translate(0 -10)',
    tshirt: 'translate(0 -6)',
    cap: 'translate(-12 -8)',
    box: 'translate(0 -12)',
    hair: 'translate(0 -8)',
    basket: 'translate(0 -6)'
  };

  const artCache = new Map();
  function artSVG(kind, color) {
    try {
      const k = own(ART, kind) ? kind : 'box';
      const c = validHex(color) || '#E9D8BD';
      const key = k + c;
      if (artCache.has(key)) return artCache.get(key);
      const inner = ART[k](artColors(c));
      const svg = '<svg class="jst-art" viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
        (ART_FIT[k] ? '<g transform="' + ART_FIT[k] + '">' + inner + '</g>' : inner) + '</svg>';
      if (artCache.size > 400) artCache.clear();
      artCache.set(key, svg);
      return svg;
    } catch (e) {
      return '<svg class="jst-art" viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"></svg>';
    }
  }

  /* ------------------------------------------------------------------ fonts */

  function fontPairId(config) {
    const d = DATA();
    if (!d) return null;
    const cfg = isObj(config) ? config : {};
    const theme = isObj(cfg.theme) ? cfg.theme : {};
    if (inColl(d.fontPairs, theme.fonts)) return theme.fonts;
    const tpl = inColl(d.templates, cfg.template) ? cfg.template : 'plateau';
    return d.templates[tpl].defaults.fonts;
  }

  function ensureFonts(config) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      const d = DATA();
      const id = fontPairId(config);
      if (!d || !id) return;
      const pair = d.fontPairs[id];
      if (!pair || typeof pair.googleUrl !== 'string') return;
      const head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      if (!document.getElementById('jst-font-preconnect')) {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = 'https://fonts.gstatic.com';
        pre.crossOrigin = 'anonymous';
        pre.id = 'jst-font-preconnect';
        head.appendChild(pre);
      }
      if (document.getElementById('jst-font-' + id)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'jst-font-' + id;
      link.href = pair.googleUrl;
      head.appendChild(link);
    } catch (e) { /* fonts are a nicety, never a failure */ }
  }

  /* ------------------------------------------------------------------ model
   * Everything the templates need, read defensively from the config.
   */

  const FALLBACK_COLORS = { bg: '#F6F2EA', surface: '#FFFFFF', text: '#1B1814', muted: '#655C52', accent: '#1F1B16', onAccent: '#FFFFFF', line: 'rgba(27,24,20,0.14)' };

  // The pages of the customer journey. JEERE_DATA.PAGES is the contract; this is its fallback.
  const PAGES_FALLBACK = [
    { id: 'home', label: 'Accueil' },
    { id: 'product', label: 'Fiche produit' },
    { id: 'cart', label: 'Panier' },
    { id: 'checkout', label: 'Paiement' },
    { id: 'confirmation', label: 'Confirmation' }
  ];
  function pagesList() {
    const d = DATA();
    const list = d && Array.isArray(d.PAGES) && d.PAGES.length ? d.PAGES : PAGES_FALLBACK;
    return list.filter((p) => isObj(p) && typeof p.id === 'string').map((p) => ({ id: p.id, label: str(p.label, p.id) }));
  }

  const MOMO_HINT = 'Validez le paiement sur votre téléphone.';
  const PAY_FALLBACK = {
    wave: { label: 'Wave', hint: 'Vous recevrez une demande de paiement sur votre numéro Wave.' },
    orange: { label: 'Orange Money', hint: MOMO_HINT },
    mtn: { label: 'MTN MoMo', hint: MOMO_HINT },
    moov: { label: 'Moov Money', hint: MOMO_HINT },
    cod: { label: 'Paiement à la livraison', hint: 'Vous payez le livreur en espèces ou par mobile money à la réception.' },
    card: { label: 'Carte bancaire', hint: 'Visa ou Mastercard, idéal depuis l’étranger.' }
  };
  const PAY_ORDER = ['wave', 'orange', 'mtn', 'moov', 'cod', 'card'];
  const PAY_ICON = { wave: 'phone', orange: 'phone', mtn: 'phone', moov: 'phone', cod: 'cash', card: 'card' };

  // The order number shown on the demo confirmation.
  const ORDER_NO = '1042';

  function mergeSettings(defaults, settings) {
    const out = isObj(defaults) ? JSON.parse(JSON.stringify(defaults)) : {};
    if (isObj(settings)) {
      Object.keys(settings).forEach((k) => { if (settings[k] !== undefined) out[k] = settings[k]; });
    }
    return out;
  }

  function isDisabled(s) {
    return s.enabled === false || s.enabled === 0 || s.enabled === 'false' || s.enabled === 'non' || s.enabled === 'off';
  }

  function normProduct(p, i, d) {
    const kinds = Array.isArray(d.ART_KINDS) ? d.ART_KINDS : Object.keys(ART);
    const price = num(p.price);
    return {
      id: str(p.id) || 'p' + (i + 1),
      name: str(p.name).trim(),
      price: price === null ? null : Math.max(0, Math.round(price)),
      category: str(p.category).trim(),
      badge: typeof p.badge === 'string' && own(d.BADGES, p.badge) ? p.badge : null,
      art: kinds.indexOf(p.art) !== -1 && own(ART, p.art) ? p.art : 'box',
      color: validHex(p.color) || '#E9D8BD',
      description: str(p.description),
      image: validImage(p.image)
    };
  }

  /* The vivid colour set, derived from the palette so every pair keeps its contrast:
   *   tint / tintStrong   bg mixed with the accent (≈13 % / ≈30 %), or a deeper shade of the
   *                       background when the accent is a neutral (black, white, grey);
   *   accentText          the accent, deepened (or lightened on dark stores) until it reads at
   *                       4.5:1 on bg, surface, tint and tintStrong: prices, badges, links;
   *   mutedTint / mutedStrong   secondary text that still reads at 4.5:1 on each tint;
   *   onAccentSoft        secondary text on an accent block (4.5:1 on the accent);
   *   fieldLine           form borders, 3:1 on the surface (WCAG 1.4.11).
   */
  function vividColors(c, dark) {
    const ahsl = rgbToHsl(parseHex(c.accent) || [0, 0, 0]);
    const neutral = ahsl[1] < 0.25 || ahsl[2] < 0.13 || ahsl[2] > 0.92;
    let tint, tintStrong;
    if (neutral) {
      tint = shade(c.bg, dark ? 0.07 : -0.055, 0.1);
      tintStrong = shade(c.bg, dark ? 0.13 : -0.11, 0.16);
    } else {
      tint = mix(c.bg, c.accent, dark ? 0.15 : 0.13);
      tintStrong = mix(c.bg, c.accent, dark ? 0.28 : 0.3);
    }
    const surfaces = [c.bg, c.surface, tint, tintStrong];
    const accentText = readable(c.accent, surfaces, 4.5, dark);
    const mutedTint = readable(c.muted, [tint, c.surface, c.bg], 4.5, dark);
    const mutedStrong = readable(c.muted, [tintStrong], 4.5, dark);
    const soft = mix(c.accent, c.onAccent, 0.84);
    const onAccentSoft = contrast(soft, c.accent) >= 4.5 ? soft : c.onAccent;
    const fieldLine = readable(mix(c.surface, c.muted, 0.7), [c.surface, c.bg], 3, dark);
    return { tint: tint, tintStrong: tintStrong, accentText: accentText, mutedTint: mutedTint, mutedStrong: mutedStrong, onAccentSoft: onAccentSoft, fieldLine: fieldLine };
  }

  function buildModel(config, device) {
    const d = DATA();
    if (!d || !d.templates || !d.palettes || !d.fontPairs || !d.sectionTypes) throw new Error('JEERE_DATA indisponible');
    const cfg = isObj(config) ? config : {};
    const tpl = inColl(d.templates, cfg.template) ? cfg.template : 'plateau';
    const tdef = d.templates[tpl].defaults;
    const theme = isObj(cfg.theme) ? cfg.theme : {};
    const paletteId = inColl(d.palettes, theme.palette) ? theme.palette : (inColl(d.palettes, tdef.palette) ? tdef.palette : null);
    const fontsId = inColl(d.fontPairs, theme.fonts) ? theme.fonts : tdef.fonts;
    const radii = isObj(d.radii) ? d.radii : { none: 0, soft: 10, round: 22 };
    const radiusId = own(radii, theme.radius) ? theme.radius : tdef.radius;
    const buttons = theme.buttons === 'outline' || theme.buttons === 'solid' ? theme.buttons : (tdef.buttons === 'outline' ? 'outline' : 'solid');

    const pal = paletteId && isObj(d.palettes[paletteId].colors) ? d.palettes[paletteId].colors : FALLBACK_COLORS;
    const colors = {};
    ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent'].forEach((k) => { colors[k] = validHex(pal[k]) || FALLBACK_COLORS[k]; });
    colors.line = typeof pal.line === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(pal.line.trim()) ? pal.line.trim() : FALLBACK_COLORS.line;

    const pair = d.fontPairs[fontsId] || {};
    const fontStack = (f, fb) => (isObj(f) && typeof f.family === 'string' && !/[;{}<>]/.test(f.family) ? f.family : fb);

    const store = isObj(cfg.store) ? cfg.store : {};
    const niche = inColl(d.niches, store.niche) ? d.niches[store.niche] : null;
    const wa = str(store.whatsapp).trim();
    const waOk = /^\+\d{8,15}$/.test(wa);

    const products = (Array.isArray(cfg.products) ? cfg.products : []).filter(isObj).map((p, i) => normProduct(p, i, d));

    const usedIds = {};
    const sections = [];
    (Array.isArray(cfg.sections) ? cfg.sections : []).forEach((s, i) => {
      if (!isObj(s) || !inColl(d.sectionTypes, s.type) || isDisabled(s)) return;
      let id = str(s.id) || 's' + (i + 1);
      if (usedIds[id]) id = id + '-' + i;
      usedIds[id] = true;
      sections.push({ id: id, type: s.type, settings: mergeSettings(d.sectionTypes[s.type].defaults, s.settings) });
    });

    // Enabled payment methods, in the contract's order, each with its checkout hint.
    const payments = [];
    const pay = isObj(cfg.payments) ? cfg.payments : {};
    const payDefs = Array.isArray(d.PAYMENTS) && d.PAYMENTS.length
      ? d.PAYMENTS.filter((p) => isObj(p) && typeof p.key === 'string')
      : PAY_ORDER.map((k) => ({ key: k, label: PAY_FALLBACK[k].label }));
    payDefs.forEach((p) => {
      if (pay[p.key] !== true) return;
      const fb = PAY_FALLBACK[p.key] || {};
      payments.push({
        key: p.key,
        label: str(p.label).trim() || fb.label || p.key,
        hint: str(p.hint).trim() || fb.hint || '',
        status: str(p.status).trim(), // the confirmation line, e.g. « Paiement Wave reçu »
        icon: PAY_ICON[p.key] || 'card'
      });
    });

    // Delivery zones for the product page and the checkout: the delivery section's zones
    // (an enabled one first), or Abidjan's communes when the store has no delivery section.
    const zoneList = (s) => {
      const st = mergeSettings(d.sectionTypes.delivery ? d.sectionTypes.delivery.defaults : {}, s.settings);
      return (Array.isArray(st.zones) ? st.zones : []).filter(isObj).map((z) => {
        const fee = num(z.fee);
        return { name: str(z.name).replace(/\s+/g, ' ').trim(), fee: fee === null ? null : Math.max(0, Math.round(fee)) };
      }).filter((z) => z.name);
    };
    const delSecs = (Array.isArray(cfg.sections) ? cfg.sections : []).filter((s) => isObj(s) && s.type === 'delivery');
    let zones = [];
    const withZones = delSecs.filter((s) => !isDisabled(s)).concat(delSecs.filter(isDisabled));
    for (let i = 0; i < withZones.length && !zones.length; i++) zones = zoneList(withZones[i]);
    if (!zones.length) {
      zones = (Array.isArray(d.communes) ? d.communes : []).filter(isObj).map((z) => {
        const fee = num(z.fee);
        return { name: str(z.name).trim(), fee: fee === null ? null : Math.max(0, Math.round(fee)) };
      }).filter((z) => z.name);
    }
    // Same name twice: keep the first, the select needs distinct values.
    const seenZone = {};
    zones = zones.filter((z) => { const k = z.name.toLowerCase(); if (seenZone[k]) return false; seenZone[k] = true; return true; });

    // Distinct categories, in order of first appearance; empty ones are skipped.
    const catMap = new Map();
    products.forEach((p) => {
      if (!p.category) return;
      const key = p.category.toLowerCase();
      if (!catMap.has(key)) catMap.set(key, { name: p.category, count: 0, product: p });
      catMap.get(key).count++;
    });

    // Average rating from the first enabled reviews section that has items.
    let rating = null;
    sections.some((s) => {
      if (s.type !== 'reviews' || !Array.isArray(s.settings.items)) return false;
      const items = s.settings.items.filter(isObj);
      if (!items.length) return false;
      const sum = items.reduce((a, it) => a + clamp(Math.round(num(it.rating) || 5), 1, 5), 0);
      rating = { avg: sum / items.length, count: items.length };
      return true;
    });

    const prices = products.map((p) => p.price).filter((n) => typeof n === 'number' && n > 0);

    const dark = lum(colors.bg) < 0.18;
    const intensity = theme.intensity === 'soft' ? 'soft' : 'vivid';
    const vivid = intensity === 'vivid';
    const v = vividColors(colors, dark);
    // Soft keeps the palette's accent for text only where it reads on the background; vivid uses
    // the accent everywhere, deepened just enough to stay readable.
    // Tint for chips, avatars and icon discs. They sit on cards, so it is mixed from the surface.
    const accentSoft = mix(colors.surface, colors.accent, dark ? 0.2 : 0.14);
    const accentInk = vivid
      ? readable(v.accentText, [accentSoft], 4.5, dark)
      : (contrast(colors.accent, colors.bg) >= 4.5 ? readable(colors.accent, [colors.bg, colors.surface, accentSoft], 4.5, dark) : colors.text);

    // Fallback visual when there is no product yet: the niche art, or a box in a soft accent tint.
    const leadFallback = {
      id: '', name: '', price: null, category: '', badge: null, description: '', image: null,
      art: niche && own(ART, niche.art) ? niche.art : 'box',
      color: validHex(niche && niche.color) || mix(colors.accent, '#FFFFFF', 0.72)
    };

    return {
      d: d, tpl: tpl, device: device, buttons: buttons, dark: dark,
      intensity: intensity, vivid: vivid, v: v, zones: zones,
      colors: colors, accentInk: accentInk, accentSoft: accentSoft,
      radius: clamp(num(radii[radiusId]) || 0, 0, 40),
      fontDisplay: fontStack(pair.display, "Georgia, 'Times New Roman', serif"),
      fontText: fontStack(pair.text, "system-ui, -apple-system, 'Segoe UI', sans-serif"),
      displayWeight: clamp(Math.round(num(isObj(pair.display) ? pair.display.weight : 600) || 600), 100, 900),
      rawName: str(store.name).trim(),
      name: str(store.name).trim() || 'Votre boutique',
      tagline: str(store.tagline).trim(),
      city: str(store.city).trim(),
      whatsapp: waOk ? wa : '',
      niche: niche,
      products: products,
      sections: sections,
      payments: payments,
      cod: pay.cod === true,
      categories: Array.from(catMap.values()),
      rating: rating,
      minPrice: prices.length ? Math.min.apply(null, prices) : null,
      lead: products[0] || leadFallback,
      second: products[1] || null
    };
  }

  /* ------------------------------------------------------------------ building blocks */

  function priceHTML(n, cls) {
    if (typeof n !== 'number') return '<span class="jst-price is-empty' + (cls ? ' ' + cls : '') + '">Prix à venir</span>';
    return '<span class="jst-price' + (cls ? ' ' + cls : '') + '"><span class="jst-price-n">' + esc(fmtNum(n)) + '</span>' + NBSP + '<span class="jst-price-c">FCFA</span></span>';
  }

  // A store action: data-jst-action plus its data (escaped). Read back by onClick.
  function act(name, data) {
    let out = ' data-jst-action="' + name + '"';
    if (isObj(data)) Object.keys(data).forEach((k) => { if (data[k] != null && data[k] !== '') out += ' data-' + k + '="' + esc(data[k]) + '"'; });
    return out;
  }
  const go = (page, productId) => act('go', { page: page, product: productId || null });

  function btn(label, opts) {
    const o = opts || {};
    const text = str(label).trim();
    const cls = 'jst-btn' + (o.size ? ' jst-btn--' + o.size : '') + (o.block ? ' jst-btn--block' : '') + (o.cls ? ' ' + o.cls : '');
    const before = o.icon ? icon(o.icon) : '';
    const after = o.arrow ? icon('arrow', 'jst-btn-arrow') : '';
    return '<button type="button" class="' + cls + '" tabindex="-1"' + (o.attrs || '') + '>' + before + '<span class="jst-btn-label">' + (text ? esc(text) : 'Découvrir') + '</span>' + after + '</button>';
  }

  function tileStyle(color) {
    const t = tileColors(color);
    return '--tile:' + t.tile + ';--tile-hi:' + t.hi + ';--ink:' + inkOn(t.tile);
  }
  // Dark or white ink, whichever reads better on the tile.
  function inkOn(bg) { return contrast('#15120E', bg) >= contrast('#FFFFFF', bg) ? '#15120E' : '#FFFFFF'; }

  // A product visual: the seller's photo if there is one, else the illustration on a tile of its colour.
  function media(p, cls, extra) {
    const inner = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
      : artSVG(p.art, p.color);
    return '<div class="jst-tile' + (p.image ? ' has-photo' : '') + (cls ? ' ' + cls : '') + '" style="' + tileStyle(p.color) + '">' + inner + (extra || '') + '</div>';
  }

  function badge(b, d) {
    if (!b || !own(d.BADGES, b)) return '';
    return '<span class="jst-badge jst-badge--' + esc(b) + '">' + esc(d.BADGES[b]) + '</span>';
  }

  function sectionOpen(s, extraCls) {
    return '<section class="jst-sec jst-sec--' + s.type + (s.tint ? ' jst-sec--tint' : '') + (extraCls ? ' ' + extraCls : '') + '" data-section-id="' + esc(s.id) + '" data-section-type="' + s.type + '">';
  }

  function head(title, aside, cls) {
    const t = str(title).trim();
    if (!t && !aside) return '';
    return '<div class="jst-head' + (cls ? ' ' + cls : '') + '">' +
      (t ? '<h2 class="jst-h jst-head-title">' + line(t) + '</h2>' : '<span></span>') +
      (aside ? '<div class="jst-head-aside">' + aside + '</div>' : '') + '</div>';
  }

  function empty(text) {
    return '<div class="jst-empty">' + icon('spark') + '<p>' + esc(text) + '</p></div>';
  }

  function splitName(n) {
    const s = str(n).trim();
    const i = s.indexOf(',');
    if (i <= 0) return { who: s, where: '' };
    return { who: s.slice(0, i).trim(), where: s.slice(i + 1).trim() };
  }

  function prettyPhone(n) {
    const m = /^\+225(\d{10})$/.exec(n);
    if (m) return '+225' + NBSP + m[1].replace(/(\d{2})(?=\d)/g, '$1' + NBSP);
    return n;
  }

  const fmtRating = (avg) => (Math.round(avg * 10) / 10).toFixed(1).replace('.', ',').replace(',0', '');
  const titleLen = (t) => { const n = str(t).length; return n <= 24 ? 's' : (n <= 44 ? 'm' : 'l'); };

  /* ------------------------------------------------------------------ header and footer */

  const NAV_LABELS = { products: 'Boutique', categories: 'Catégories', reviews: 'Avis', about: 'À propos', delivery: 'Livraison', whatsapp: 'Contact' };

  function header(m, j) {
    const seen = {};
    const nav = [];
    m.sections.forEach((s) => {
      const label = NAV_LABELS[s.type];
      if (label && !seen[label] && nav.length < 4) { seen[label] = true; nav.push(label); }
    });
    if (!nav.length) nav.push('Boutique');
    const count = j ? j.count : 0;
    const bagLabel = count ? 'Panier, ' + plural(count, 'article', 'articles') : 'Panier';
    return '<header class="jst-header"><div class="jst-wrap jst-header-in">' +
      '<button type="button" class="jst-icon-btn jst-menu" aria-label="Menu" tabindex="-1">' + icon('menu') + '</button>' +
      '<a class="jst-logo' + (m.rawName ? '' : ' is-placeholder') + '"' + go('home') + '>' + esc(m.name) + '</a>' +
      '<nav class="jst-nav" aria-label="Menu de la boutique">' + nav.map((n, i) => '<a class="jst-nav-link' + (i === 0 && j && j.page === 'home' ? ' is-current' : '') + '"' + go('home') + '>' + esc(n) + '</a>').join('') + '</nav>' +
      '<div class="jst-header-actions">' +
      '<button type="button" class="jst-icon-btn jst-search" aria-label="Rechercher" tabindex="-1">' + icon('search') + '</button>' +
      '<button type="button" class="jst-icon-btn jst-bag' + (j && j.page === 'cart' ? ' is-current' : '') + '" aria-label="' + esc(bagLabel) + '" tabindex="-1"' + go('cart') + '>' + icon('bag') +
      (count ? '<span class="jst-bag-n" aria-hidden="true">' + (count > 99 ? '99+' : count) + '</span>' : '') + '</button>' +
      '</div></div></header>';
  }

  // Checkout: logo, « Paiement sécurisé » and a way back to the cart, nothing to wander off to.
  function headerCheckout(m) {
    return '<header class="jst-header jst-header--co"><div class="jst-wrap jst-co-head">' +
      '<a class="jst-co-back"' + go('cart') + ' aria-label="Retour au panier">' + icon('back') + '<span>Panier</span></a>' +
      '<a class="jst-logo' + (m.rawName ? '' : ' is-placeholder') + '"' + go('home') + '>' + esc(m.name) + '</a>' +
      '<span class="jst-secure">' + icon('lock') + '<span>Paiement sécurisé</span></span>' +
      '</div></header>';
  }

  function footer(m) {
    const chips = m.payments.length
      ? '<ul class="jst-chips">' + m.payments.map((p) => '<li class="jst-chip">' + esc(p.label) + '</li>').join('') + '</ul>'
      : '<p class="jst-footer-muted">Aucun moyen de paiement activé pour l’instant.</p>';
    const contact = [];
    if (m.city) contact.push('<p class="jst-footer-line">' + icon('pin') + '<span>' + esc(m.city) + '</span></p>');
    if (m.whatsapp) {
      contact.push('<a class="jst-footer-line jst-footer-wa" href="https://wa.me/' + esc(m.whatsapp.slice(1)) + '" target="_blank" rel="noopener noreferrer">' +
        icon('chat') + '<span>WhatsApp · ' + esc(prettyPhone(m.whatsapp)) + '</span></a>');
    }
    if (!contact.length) contact.push('<p class="jst-footer-muted">Ajoutez votre ville et votre numéro WhatsApp.</p>');
    return '<footer class="jst-footer"><div class="jst-wrap">' +
      '<div class="jst-footer-top">' +
      '<div class="jst-footer-brand"><p class="jst-h jst-footer-name">' + esc(m.name) + '</p>' +
      (m.tagline ? '<p class="jst-footer-tag">' + line(m.tagline) + '</p>' : '') + '</div>' +
      '<div class="jst-footer-col"><h3 class="jst-footer-h">Moyens de paiement</h3>' + chips + '</div>' +
      '<div class="jst-footer-col"><h3 class="jst-footer-h">Nous trouver</h3>' + contact.join('') + '</div>' +
      '</div>' +
      '<div class="jst-footer-bottom"><span>©' + NBSP + esc(m.name) + '</span><span class="jst-powered">Propulsé par <b>Jeere</b></span></div>' +
      '</div></footer>';
  }

  /* ------------------------------------------------------------------ sections */

  function secAnnouncement(m, s) {
    const text = line(s.settings.text);
    const content = text || '<span class="jst-muted-inline">Écrivez ici votre annonce</span>';
    let inner = '<span class="jst-ann-item">' + content + '</span>';
    if (m.tpl === 'treichville' && text) {
      for (let i = 0; i < 3; i++) inner += '<span class="jst-ann-sep" aria-hidden="true">✦</span><span class="jst-ann-item jst-ann-rep" aria-hidden="true">' + text + '</span>';
    }
    return sectionOpen(s, 'jst-on-accent') + '<div class="jst-ann"><div class="jst-wrap jst-ann-in">' + inner + '</div></div></section>';
  }

  function heroCopy(m, st, kickerCls) {
    const kicker = line(st.kicker);
    const title = str(st.title).trim();
    const text = str(st.text).trim();
    return '<div class="jst-hero-copy">' +
      (kicker ? '<p class="' + kickerCls + '">' + kicker + '</p>' : '') +
      (title ? '<h1 class="jst-h jst-hero-title" data-len="' + titleLen(title) + '">' + line(title) + '</h1>' : '') +
      (text ? '<p class="jst-hero-text">' + line(text) + '</p>' : '') +
      '<div class="jst-hero-actions">' + btn(st.button, { arrow: m.tpl !== 'cocody', size: 'lg' }) +
      (m.tpl === 'cocody' && m.rating
        ? '<p class="jst-hero-proof">' + stars(Math.round(m.rating.avg)) + '<span>' + fmtRating(m.rating.avg) + '/5 · ' + plural(m.rating.count, 'avis', 'avis') + '</span></p>'
        : '') +
      '</div></div>';
  }

  function secHero(m, s) {
    const st = s.settings;
    const img = validImage(st.image);
    const p = m.lead;
    const imgTag = img ? '<img class="jst-hero-img" src="' + esc(img) + '" alt="" decoding="async">' : '';

    if (m.tpl === 'cocody') {
      const visual = img
        ? '<div class="jst-hero-photo">' + imgTag + '</div>'
        : '<div class="jst-hero-circle" style="' + tileStyle(p.color) + '">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : artSVG(p.art, p.color)) + '</div>';
      const float = m.products[0]
        ? '<div class="jst-float"' + go('product', m.products[0].id) + '>' + media(m.products[0], 'jst-float-media') +
          '<div class="jst-float-body"><p class="jst-float-name">' + esc(m.products[0].name || 'Produit') + '</p>' + priceHTML(m.products[0].price) + '</div></div>'
        : '';
      return sectionOpen(s) + '<div class="jst-wrap"><div class="jst-hero-card' + (img ? ' has-img' : '') + '">' +
        '<span class="jst-blob jst-blob--a" aria-hidden="true"></span><span class="jst-blob jst-blob--b" aria-hidden="true"></span><span class="jst-blob jst-blob--c" aria-hidden="true"></span>' +
        heroCopy(m, st, 'jst-pill') +
        '<div class="jst-hero-visual">' + visual + float + '</div>' +
        '</div></div></section>';
    }

    if (m.tpl === 'treichville') {
      const block = img
        ? '<div class="jst-hero-block has-img">' + imgTag + '</div>'
        : '<div class="jst-hero-block" style="' + tileStyle(p.color) + '">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : artSVG(p.art, p.color)) + '</div>';
      const sticker = m.minPrice !== null
        ? '<div class="jst-sticker" aria-hidden="true"><span>Dès</span><b>' + esc(fmtNum(m.minPrice)) + '</b><span>FCFA</span></div>'
        : '';
      const strip = [];
      if (m.city) strip.push('Livraison à ' + esc(m.city));
      m.payments.forEach((pp) => strip.push(esc(pp.label)));
      const stripHTML = strip.length
        ? '<div class="jst-strip" aria-hidden="true"><div class="jst-strip-in">' + strip.concat(strip).map((t) => '<span>' + t + '</span><i>✦</i>').join('') + '</div></div>'
        : '';
      return sectionOpen(s) + '<div class="jst-wrap jst-hero-grid">' + heroCopy(m, st, 'jst-tag') +
        '<div class="jst-hero-visual">' + block + sticker + '</div></div>' + stripHTML + '</section>';
    }

    // Plateau: a large stage, image or arch composition, text set over it.
    let stage;
    if (img) {
      stage = '<div class="jst-hero-stage has-img" style="--ink:#FFFFFF">' + imgTag + '<div class="jst-hero-scrim" aria-hidden="true"></div>' + heroCopy(m, st, 'jst-kicker') + '</div>';
    } else {
      const t = tileColors(p.color);
      const cap = p.name
        ? '<p class="jst-hero-cap"><span>N°' + NBSP + '01</span><span>' + esc(p.name) + '</span>' + (typeof p.price === 'number' ? '<span>' + esc(fmtNum(p.price)) + NBSP + 'FCFA</span>' : '') + '</p>'
        : '';
      // The hero button keeps the seller's accent unless it would vanish on the tile.
      const ink = inkOn(t.tile);
      const c = m.colors;
      const solidOk = contrast(c.accent, t.tile) >= 2.4;
      const lineOk = contrast(c.accent, t.tile) >= 4;
      const btnVars = ';--hero-btn-bg:' + (solidOk ? c.accent : ink) + ';--hero-btn-fg:' + (solidOk ? c.onAccent : t.tile) + ';--hero-btn-line:' + (lineOk ? c.accent : ink);
      stage = '<div class="jst-hero-stage" style="--tile:' + t.tile + ';--tile-hi:' + t.hi + ';--ink:' + ink + btnVars + '">' +
        heroCopy(m, st, 'jst-kicker') +
        '<div class="jst-hero-art"><div class="jst-arch">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : artSVG(p.art, p.color)) + '</div>' + cap + '</div>' +
        '</div>';
    }
    return sectionOpen(s) + stage + '</section>';
  }

  function secCategories(m, s) {
    const title = s.settings.title;
    if (!m.categories.length) {
      return sectionOpen(s) + '<div class="jst-wrap">' + head(title) + empty('Vos catégories apparaîtront ici dès que vos produits en auront une.') + '</div></section>';
    }
    const items = m.categories.map((c, i) => {
      return '<a class="jst-cat" style="' + tileStyle(c.product.color) + '">' +
        media(c.product, 'jst-cat-media') +
        '<span class="jst-cat-body"><span class="jst-cat-num">' + pad2(i + 1) + '</span><span class="jst-h jst-cat-name">' + esc(c.name) + '</span>' +
        '<span class="jst-cat-count">' + plural(c.count, 'produit', 'produits') + '</span></span>' +
        '<span class="jst-cat-go">' + icon('arrow') + '</span></a>';
    }).join('');
    const n = m.categories.length;
    return sectionOpen(s) + '<div class="jst-wrap">' + head(title, '<span class="jst-head-count">' + plural(n, 'catégorie', 'catégories') + '</span>') +
      '<div class="jst-cats" data-count="' + Math.min(n, 4) + '">' + items + '</div></div></section>';
  }

  function productCard(m, p) {
    const name = p.name ? esc(p.name) : '<span class="jst-muted-inline">Produit sans nom</span>';
    return '<article class="jst-card" data-product-id="' + esc(p.id) + '"' + go('product', p.id) + '>' +
      media(p, 'jst-card-media', badge(p.badge, m.d) + (m.tpl === 'cocody' ? '<span class="jst-fav" aria-hidden="true">' + icon('heart') + '</span>' : '')) +
      '<div class="jst-card-body">' +
      (p.category ? '<p class="jst-card-cat">' + esc(p.category) + '</p>' : '') +
      '<h3 class="jst-card-name">' + name + '</h3>' +
      '<div class="jst-card-price">' + priceHTML(p.price) + '</div>' +
      btn('Commander', { size: 'sm', icon: 'chat', block: true, cls: 'jst-card-btn' }) +
      '</div></article>';
  }

  function secProducts(m, s) {
    const st = s.settings;
    const limit = clamp(Math.round(num(st.limit) || 8), 2, 24);
    const cols = [2, 3, 4].indexOf(Math.round(num(st.columns) || 3)) !== -1 ? Math.round(num(st.columns)) : 3;
    const list = m.products.slice(0, limit);
    const total = m.products.length;
    let aside;
    if (m.tpl === 'treichville') aside = '<span class="jst-count-block">' + pad2(total) + '</span>';
    else if (m.tpl === 'cocody') aside = '<a class="jst-link">Tout voir' + icon('arrow') + '</a>';
    else aside = '<span class="jst-head-count">' + plural(total, 'produit', 'produits') + '</span>';
    if (!list.length) {
      return sectionOpen(s) + '<div class="jst-wrap">' + head(st.title, aside) + empty('Vos produits apparaîtront ici. Ajoutez votre premier produit pour remplir la vitrine.') + '</div></section>';
    }
    let chips = '';
    if (m.tpl === 'cocody' && m.categories.length > 1) {
      chips = '<div class="jst-filter" aria-hidden="true"><span class="jst-filter-chip is-on">Tout</span>' +
        m.categories.slice(0, 5).map((c) => '<span class="jst-filter-chip">' + esc(c.name) + '</span>').join('') + '</div>';
    }
    return sectionOpen(s) + '<div class="jst-wrap">' + head(st.title, aside) + chips +
      '<div class="jst-grid" data-cols="' + cols + '">' + list.map((p) => productCard(m, p)).join('') + '</div></div></section>';
  }

  function aboutVisual(m, img) {
    if (img) return '<div class="jst-about-media has-img"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></div>';
    const a = m.lead, b = m.second;
    const t = tileColors(a.color);
    const art = (p, cls) => '<div class="jst-about-art ' + cls + '">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : artSVG(p.art, p.color)) + '</div>';
    return '<div class="jst-about-media" style="--tile:' + t.tile + ';--tile-hi:' + t.hi + ';--ink:' + inkOn(t.tile) + (b ? ';--tile-2:' + tileColors(b.color).tile : '') + '">' +
      '<span class="jst-about-deco" aria-hidden="true"></span>' +
      (b ? art(b, 'jst-about-art--b') : '') + art(a, 'jst-about-art--a') +
      (m.tpl === 'treichville' && m.city ? '<span class="jst-about-stamp">' + esc(m.city) + '</span>' : '') +
      '</div>';
  }

  function secAbout(m, s) {
    const st = s.settings;
    const title = str(st.title).trim();
    const text = paras(st.text);
    return sectionOpen(s) + '<div class="jst-wrap jst-about">' + aboutVisual(m, validImage(st.image)) +
      '<div class="jst-about-copy">' +
      (m.tpl === 'plateau' ? '<p class="jst-kicker">À propos</p>' : '') +
      (title ? '<h2 class="jst-h jst-about-title">' + line(title) + '</h2>' : '') +
      (text ? '<div class="jst-about-text">' + text + '</div>' : '<div class="jst-about-text"><p class="jst-muted-inline">Racontez ici l’histoire de votre boutique.</p></div>') +
      (m.tpl === 'plateau' && m.rawName ? '<p class="jst-sign">—' + NBSP + esc(m.rawName) + '</p>' : '') +
      '</div></div></section>';
  }

  function secReviews(m, s) {
    const st = s.settings;
    const items = (Array.isArray(st.items) ? st.items : []).filter(isObj);
    if (!items.length) {
      return sectionOpen(s) + '<div class="jst-wrap">' + head(st.title) + empty('Les avis de vos clients apparaîtront ici.') + '</div></section>';
    }
    const sum = items.reduce((a, it) => a + clamp(Math.round(num(it.rating) || 5), 1, 5), 0);
    const avg = sum / items.length;
    const summary = '<div class="jst-rating">' + '<span class="jst-rating-n">' + fmtRating(avg) + '</span>' +
      '<span class="jst-rating-side">' + stars(Math.round(avg)) + '<span class="jst-rating-count">sur 5 · ' + plural(items.length, 'avis', 'avis') + '</span></span></div>';
    const cards = items.map((it) => {
      const who = splitName(it.name);
      const initial = who.who ? who.who.charAt(0).toUpperCase() : '?';
      const text = str(it.text).trim();
      return '<figure class="jst-review">' +
        (m.tpl === 'treichville' ? '<span class="jst-quote" aria-hidden="true">“</span>' : '') +
        stars(it.rating) +
        '<blockquote class="jst-review-text">' + (text ? '«' + NBSP + line(text) + NBSP + '»' : '<span class="jst-muted-inline">Avis à compléter</span>') + '</blockquote>' +
        '<figcaption class="jst-review-by"><span class="jst-avatar" aria-hidden="true">' + esc(initial) + '</span>' +
        '<span class="jst-review-who"><b>' + esc(who.who || 'Client') + '</b>' + (who.where ? '<span>' + esc(who.where) + '</span>' : '') + '</span></figcaption>' +
        '</figure>';
    }).join('');
    return sectionOpen(s) + '<div class="jst-wrap">' + head(st.title, summary, 'jst-head--reviews') +
      '<div class="jst-reviews" data-count="' + Math.min(items.length, 3) + '">' + cards + '</div></div></section>';
  }

  function secDelivery(m, s) {
    const st = s.settings;
    const zones = (Array.isArray(st.zones) ? st.zones : []).filter(isObj);
    const text = paras(st.text);
    const list = zones.length
      ? '<ul class="jst-zones' + (zones.length > 6 ? ' is-many' : '') + '">' + zones.map((z) => {
        const fee = num(z.fee);
        const feeHTML = fee === 0 ? '<span class="jst-price jst-free">Offerte</span>' : priceHTML(fee === null ? null : Math.max(0, Math.round(fee)));
        return '<li class="jst-zone"><span class="jst-zone-name">' + (str(z.name).trim() ? esc(str(z.name).trim()) : '<span class="jst-muted-inline">Zone sans nom</span>') + '</span><span class="jst-zone-dots" aria-hidden="true"></span>' + feeHTML + '</li>';
      }).join('') + '</ul>'
      : empty('Ajoutez vos zones de livraison et leurs frais.');
    const notes = [];
    if (m.city) notes.push('<span>' + icon('pin') + 'Depuis ' + esc(m.city) + '</span>');
    if (m.cod) notes.push('<span>' + icon('check') + 'Paiement à la livraison</span>');
    return sectionOpen(s) + '<div class="jst-wrap jst-delivery"><div class="jst-delivery-intro">' +
      '<span class="jst-delivery-ico" aria-hidden="true">' + icon('truck') + '</span>' +
      (str(st.title).trim() ? '<h2 class="jst-h jst-delivery-title">' + line(st.title) + '</h2>' : '') +
      (text ? '<div class="jst-delivery-text">' + text + '</div>' : '') +
      (notes.length ? '<p class="jst-delivery-notes">' + notes.join('') + '</p>' : '') +
      '</div>' + list + '</div></section>';
  }

  function secWhatsapp(m, s) {
    const st = s.settings;
    const title = str(st.title).trim();
    const text = str(st.text).trim();
    return sectionOpen(s, 'jst-sec--band') + '<div class="jst-wrap"><div class="jst-wa jst-on-accent">' +
      '<span class="jst-wa-deco jst-wa-deco--a" aria-hidden="true"></span><span class="jst-wa-deco jst-wa-deco--b" aria-hidden="true"></span>' +
      '<span class="jst-wa-ico" aria-hidden="true">' + icon('chat') + '</span>' +
      '<div class="jst-wa-copy">' + (title ? '<h2 class="jst-h jst-wa-title">' + line(title) + '</h2>' : '') + (text ? '<p class="jst-wa-text">' + line(text) + '</p>' : '') + '</div>' +
      '<div class="jst-wa-cta">' + btn(st.button || 'Commander sur WhatsApp', { icon: 'chat', size: 'lg' }) +
      (m.whatsapp ? '<p class="jst-wa-num">' + esc(prettyPhone(m.whatsapp)) + '</p>' : '') + '</div>' +
      '</div></div></section>';
  }

  const SECTION_RENDERERS = {
    announcement: secAnnouncement, hero: secHero, categories: secCategories, products: secProducts,
    about: secAbout, reviews: secReviews, delivery: secDelivery, whatsapp: secWhatsapp
  };

  function renderSection(m, s) {
    try {
      return SECTION_RENDERERS[s.type](m, s);
    } catch (e) {
      return '<section class="jst-sec" data-section-id="' + esc(s.id) + '" data-section-type="' + esc(s.type) + '"><div class="jst-wrap">' +
        empty('Cette section n’a pas pu être affichée. Vérifiez ses réglages.') + '</div></section>';
    }
  }

  /* ------------------------------------------------------------------ journey helpers */

  const QTY_MIN = 1;
  const QTY_MAX = 20;
  const FLOW = { cart: true, checkout: true, confirmation: true };
  // Home sections that sit on the page background; in vivid stores every other one is tinted.
  const PLAIN = { categories: true, products: true, about: true, reviews: true, delivery: true };
  let UID = 0;

  const pname = (p) => (p.name ? esc(p.name) : '<span class="jst-muted-inline">Produit sans nom</span>');
  const feeText = (fee) => (fee === 0 ? 'offerte' : (fee === null ? 'à confirmer' : money(fee)));

  function backLink(label, page, productId) {
    return '<a class="jst-back"' + go(page, productId) + '>' + icon('back') + '<span>' + esc(label) + '</span></a>';
  }

  function crumbs(items) {
    return '<nav class="jst-crumbs" aria-label="Fil d’Ariane"><ol>' + items.map((it) => '<li>' +
      (it.page ? '<a' + go(it.page, it.product) + '>' + esc(it.label) + '</a>' : '<span aria-current="page">' + esc(it.label) + '</span>') +
      '</li>').join('') + '</ol></nav>';
  }

  function stepper(n, action, productId, label, size) {
    const a = (delta) => act(action, { product: productId, delta: delta });
    return '<div class="jst-stepper' + (size ? ' jst-stepper--' + size : '') + '" role="group" aria-label="' + esc(label) + '">' +
      '<button type="button" class="jst-step" tabindex="-1" aria-label="Diminuer la quantité"' + (n <= QTY_MIN ? ' disabled' : '') + a(-1) + '>' + icon('minus') + '</button>' +
      '<span class="jst-step-n" aria-live="polite">' + n + '</span>' +
      '<button type="button" class="jst-step" tabindex="-1" aria-label="Augmenter la quantité"' + (n >= QTY_MAX ? ' disabled' : '') + a(1) + '>' + icon('plus') + '</button></div>';
  }

  function payChips(m) {
    return m.payments.length
      ? '<ul class="jst-chips">' + m.payments.map((p) => '<li class="jst-chip">' + esc(p.label) + '</li>').join('') + '</ul>'
      : '<p class="jst-footer-muted">Aucun moyen de paiement activé pour l’instant.</p>';
  }

  // « Livraison dès 1 500 FCFA · Cocody, Marcory… »: the cheapest zones first.
  function deliveryLine(m) {
    const z = m.zones;
    if (!z.length) return m.city ? 'Livraison depuis ' + m.city : 'Livraison à convenir sur WhatsApp';
    const priced = z.filter((x) => typeof x.fee === 'number');
    const min = priced.length ? Math.min.apply(null, priced.map((x) => x.fee)) : null;
    const key = (x) => (x.fee === null ? 1e12 : x.fee);
    const names = z.map((x, i) => ({ x: x, i: i })).sort((a, b) => (key(a.x) - key(b.x)) || (a.i - b.i)).map((o) => o.x.name);
    const lead = min === null ? 'Livraison' : (min === 0 ? 'Livraison offerte' : 'Livraison dès ' + money(min));
    return lead + ' · ' + names.slice(0, 2).join(', ') + (names.length > 2 ? '…' : '');
  }

  function row(label, value, cls) {
    return '<div class="jst-row' + (cls ? ' ' + cls : '') + '"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function totals(j) {
    const z = j.zone;
    const fee = !z ? '—' : (z.fee === 0 ? '<span class="jst-price jst-free">Offerte</span>' : (z.fee === null ? '<span class="jst-price is-empty">À confirmer</span>' : priceHTML(z.fee)));
    return '<dl class="jst-rows">' +
      row('Sous-total', priceHTML(j.subtotal)) +
      row('Livraison' + (z ? '<span class="jst-row-sub">' + esc(z.name) + '</span>' : ''), fee) +
      row('Total', priceHTML(j.total), 'jst-row--total') + '</dl>';
  }

  function miniLine(l, withStepper) {
    const p = l.p;
    return '<li class="jst-mini">' +
      media(p, 'jst-mini-tile', withStepper ? '' : '<span class="jst-mini-q" aria-label="Quantité' + NBSP + ': ' + l.qty + '">' + l.qty + '</span>') +
      '<div class="jst-mini-body"><p class="jst-mini-name">' + pname(p) + '</p>' +
      (withStepper ? stepper(l.qty, 'qty', p.id, 'Quantité', 'sm') : '<p class="jst-mini-unit">' + (typeof p.price === 'number' ? l.qty + NBSP + '×' + NBSP + money(p.price) : 'Prix à venir') + '</p>') +
      '</div><p class="jst-mini-total">' + priceHTML(typeof p.price === 'number' ? l.total : null) + '</p></li>';
  }

  function steps(active) {
    const labels = ['Panier', 'Livraison et paiement', 'Confirmation'];
    return '<nav class="jst-steps-nav" aria-label="Étapes de la commande"><ol class="jst-steps">' + labels.map((label, i) => {
      const n = i + 1;
      const done = n < active || active === 3;
      const cls = 'jst-stp' + (done ? ' is-done' : '') + (n === active ? ' is-on' : '');
      const inner = '<span class="jst-stp-dot" aria-hidden="true">' + (done ? icon('check') : n) + '</span><span class="jst-stp-label">' + label + '</span>';
      return '<li class="' + cls + '"' + (n === active ? ' aria-current="step"' : '') + '>' +
        (n === 1 && active === 2 ? '<a class="jst-stp-link"' + go('cart') + '>' + inner + '</a>' : inner) + '</li>';
    }).join('') + '</ol></nav>';
  }

  /* ------------------------------------------------------------------ journey state
   * Everything a page of the journey needs, read from the element's demo state:
   * rootEl.__jstCart { id: qty }, rootEl.__jstForm (checkout fields), rootEl.__jstQty (product
   * page quantity). Unknown products are dropped; an empty cart is seeded on cart, checkout and
   * confirmation (with the product being looked at, else the first one), except right after the
   * shopper emptied it on the cart page.
   */
  function journey(m, rootEl, page, productId) {
    const byId = {};
    m.products.forEach((p) => { if (!byId[p.id]) byId[p.id] = p; });
    const pid = typeof productId === 'string' && own(byId, productId) ? productId : null;

    const raw = isObj(rootEl.__jstCart) ? rootEl.__jstCart : {};
    const cart = {};
    Object.keys(raw).forEach((id) => {
      if (!own(byId, id)) return;
      const q = Math.round(num(raw[id]) || 0);
      if (q >= QTY_MIN) cart[id] = clamp(q, QTY_MIN, QTY_MAX);
    });
    if (page !== 'cart') rootEl.__jstCartCleared = false;
    if (FLOW[page] && !Object.keys(cart).length && m.products.length && !(page === 'cart' && rootEl.__jstCartCleared)) {
      cart[pid || m.products[0].id] = 1;
    }
    rootEl.__jstCart = cart;

    const lines = Object.keys(cart).map((id) => {
      const p = byId[id];
      return { p: p, qty: cart[id], total: (typeof p.price === 'number' ? p.price : 0) * cart[id] };
    });
    const count = lines.reduce((a, l) => a + l.qty, 0);
    const subtotal = lines.reduce((a, l) => a + l.total, 0);

    const rf = isObj(rootEl.__jstForm) ? rootEl.__jstForm : {};
    const form = { first: str(rf.first).slice(0, 40), phone: str(rf.phone).slice(0, 20), commune: str(rf.commune), address: str(rf.address).slice(0, 240), pay: str(rf.pay) };
    rootEl.__jstForm = form;
    const zone = m.zones.find((z) => z.name === form.commune) || m.zones[0] || null;
    const fee = zone && typeof zone.fee === 'number' ? zone.fee : 0;
    const pay = m.payments.find((p) => p.key === form.pay) || m.payments[0] || null;

    let product = null;
    if (page === 'product') product = pid ? byId[pid] : (m.products[0] || null);
    const pq = isObj(rootEl.__jstQty) ? rootEl.__jstQty : null;
    const pdpQty = product && pq && pq.id === product.id ? clamp(Math.round(num(pq.n) || 1), QTY_MIN, QTY_MAX) : 1;

    if (!rootEl.__jstUid) rootEl.__jstUid = ++UID;
    return {
      page: page, product: product, productId: product ? product.id : pid, uid: rootEl.__jstUid,
      cart: cart, lines: lines, count: count, subtotal: subtotal,
      form: form, zone: zone, fee: fee, total: subtotal + fee, pay: pay, pdpQty: pdpQty
    };
  }

  /* ------------------------------------------------------------------ pages */

  function leadingAnnouncements(m) {
    const out = [];
    for (let i = 0; i < m.sections.length && m.sections[i].type === 'announcement'; i++) out.push(renderSection(m, m.sections[i]));
    return out;
  }

  function pageHome(m, j) {
    const out = leadingAnnouncements(m);
    // Announcements placed first sit above the header, like on any real store.
    let i = out.length;
    out.push(header(m, j));
    const body = [];
    let plain = 0;
    for (; i < m.sections.length; i++) {
      const s = m.sections[i];
      if (m.vivid && PLAIN[s.type]) { s.tint = plain % 2 === 0; plain++; }
      body.push(renderSection(m, s));
    }
    if (!body.length) {
      body.push('<div class="jst-wrap jst-page-empty">' + empty('Votre page est vide pour l’instant. Activez ou ajoutez une section pour la remplir.') + '</div>');
    }
    out.push('<main class="jst-main jst-main--home">' + body.join('') + '</main>');
    out.push(footer(m));
    return out.join('');
  }

  function pageProduct(m, j) {
    const p = j.product;
    if (!p) {
      return '<div class="jst-wrap jst-page-pad">' + backLink('Retour à la boutique', 'home') +
        empty('Ajoutez votre premier produit' + NBSP + ': sa fiche apparaîtra ici, avec le bouton Ajouter au panier.') + '</div>';
    }
    const nav = m.device === 'desktop'
      ? crumbs([{ label: 'Accueil', page: 'home' }].concat(p.category ? [{ label: p.category, page: 'home' }] : [], [{ label: p.name || 'Produit' }]))
      : backLink('Retour à la boutique', 'home');
    const rating = m.rating
      ? '<p class="jst-pdp-rating">' + stars(Math.round(m.rating.avg)) + '<span>' + fmtRating(m.rating.avg) + '/5 · ' + plural(m.rating.count, 'avis client', 'avis clients') + '</span></p>'
      : '';
    const desc = paras(p.description);
    const perks = ['<li>' + icon('truck') + '<span>' + esc(deliveryLine(m)) + '</span></li>'];
    if (m.cod) perks.push('<li>' + icon('cash') + '<span>Paiement à la livraison possible</span></li>');
    perks.push('<li>' + icon('chat') + '<span>Une question' + NBSP + '? Réponse rapide sur WhatsApp</span></li>');
    const others = m.products.filter((x) => x.id !== p.id).slice(0, 4);
    const related = others.length
      ? '<section class="jst-sec jst-related"><div class="jst-wrap">' + head('Vous aimerez aussi') +
        '<div class="jst-grid" data-cols="4">' + others.map((x) => productCard(m, x)).join('') + '</div></div></section>'
      : '';
    return '<div class="jst-wrap jst-pdp-nav">' + nav + '</div>' +
      '<section class="jst-pdp" data-product-id="' + esc(p.id) + '"><div class="jst-wrap jst-pdp-in">' +
      '<div class="jst-pdp-media">' + media(p, 'jst-pdp-tile', badge(p.badge, m.d)) + '</div>' +
      '<div class="jst-pdp-info">' +
      (p.category ? '<p class="jst-pdp-cat">' + esc(p.category) + '</p>' : '') +
      '<h1 class="jst-h jst-pdp-name">' + pname(p) + '</h1>' + rating +
      '<p class="jst-pdp-price">' + priceHTML(p.price) + '</p>' +
      (desc ? '<div class="jst-pdp-desc">' + desc + '</div>' : '') +
      '<div class="jst-pdp-buy">' +
      '<div class="jst-pdp-qty"><span class="jst-label">Quantité</span>' + stepper(j.pdpQty, 'pdp-qty', p.id, 'Quantité', 'lg') + '</div>' +
      btn('Ajouter au panier', { size: 'lg', block: true, icon: 'bag', cls: 'jst-add', attrs: act('add', { product: p.id }) }) +
      btn('Commander sur WhatsApp', { size: 'lg', block: true, icon: 'chat', cls: 'jst-btn--ghost', attrs: act('wa') }) +
      '</div>' +
      '<ul class="jst-perks">' + perks.join('') + '</ul>' +
      '<div class="jst-pdp-pay"><p class="jst-label">Moyens de paiement</p>' + payChips(m) + '</div>' +
      '</div></div></section>' + related;
  }

  function pageCart(m, j) {
    const top = '<div class="jst-page-head">' + backLink('Retour à la boutique', 'home') +
      '<h1 class="jst-h jst-page-title">Votre panier</h1>' +
      (j.lines.length ? '<p class="jst-page-sub">' + plural(j.count, 'article', 'articles') + '</p>' : '') + '</div>';
    if (!j.lines.length) {
      return '<div class="jst-wrap jst-cart">' + top + '<div class="jst-cart-empty">' +
        '<span class="jst-empty-ico" aria-hidden="true">' + icon('bag') + '</span>' +
        '<p class="jst-h jst-cart-empty-title">Votre panier est vide</p>' +
        '<p class="jst-cart-empty-text">' + (m.products.length
          ? 'Parcourez la boutique et ajoutez vos coups de cœur.'
          : 'Ajoutez vos produits dans l’éditeur' + NBSP + ': vos clients pourront les mettre au panier.') + '</p>' +
        btn('Continuer mes achats', { size: 'lg', arrow: true, attrs: go('home') }) + '</div></div>';
    }
    const lines = '<ul class="jst-lines">' + j.lines.map((l) => {
      const p = l.p;
      return '<li class="jst-line">' +
        '<a class="jst-line-media" aria-hidden="true" tabindex="-1"' + go('product', p.id) + '>' + media(p, 'jst-line-tile') + '</a>' +
        '<div class="jst-line-body">' +
        '<div class="jst-line-top"><div class="jst-line-info">' +
        (p.category ? '<p class="jst-line-cat">' + esc(p.category) + '</p>' : '') +
        '<a class="jst-line-name"' + go('product', p.id) + '>' + pname(p) + '</a>' +
        '<p class="jst-line-unit">' + (typeof p.price === 'number' ? money(p.price) + ' l’unité' : 'Prix à venir') + '</p></div>' +
        '<p class="jst-line-total">' + priceHTML(typeof p.price === 'number' ? l.total : null) + '</p></div>' +
        '<div class="jst-line-actions">' + stepper(l.qty, 'qty', p.id, 'Quantité', '') +
        '<button type="button" class="jst-remove" tabindex="-1"' + act('remove', { product: p.id }) + '>' + icon('close') + '<span>Retirer</span></button></div>' +
        '</div></li>';
    }).join('') + '</ul>';
    const summary = '<aside class="jst-summary jst-cart-summary">' +
      '<h2 class="jst-h jst-summary-title">Récapitulatif</h2>' +
      '<dl class="jst-rows">' + row('Sous-total<span class="jst-row-sub">' + plural(j.count, 'article', 'articles') + '</span>', priceHTML(j.subtotal), 'jst-row--total') + '</dl>' +
      '<p class="jst-note">' + icon('truck') + '<span>Frais de livraison calculés à l’étape suivante.</span></p>' +
      btn('Passer au paiement', { size: 'lg', block: true, icon: 'lock', cls: 'jst-next', attrs: go('checkout') }) +
      '<a class="jst-link jst-continue"' + go('home') + '>Continuer mes achats</a>' +
      '<div class="jst-summary-pay"><p class="jst-label">' + icon('shield') + '<span>Paiement sécurisé</span></p>' + payChips(m) + '</div>' +
      '</aside>';
    return '<div class="jst-wrap jst-cart">' + top + '<div class="jst-cart-grid">' + lines + summary + '</div></div>';
  }

  function pageCheckout(m, j) {
    const uid = 'jst' + j.uid + '-';
    const f = j.form;
    const top = steps(2) + '<h1 class="jst-h jst-page-title">Finaliser ma commande</h1>';
    if (!j.lines.length) {
      return '<div class="jst-wrap jst-co">' + top + empty('Votre panier est vide. Ajoutez un produit pour passer commande.') +
        '<div class="jst-co-alone">' + btn('Retour à la boutique', { size: 'lg', attrs: go('home') }) + '</div></div>';
    }
    const field = (id, label, control, help) => '<div class="jst-field jst-field--' + id + '"><label class="jst-label" for="' + uid + id + '">' + label + '</label>' + control +
      (help ? '<p class="jst-help">' + help + '</p>' : '') + '</div>';
    const block = (n, title, body) => '<section class="jst-co-block"><h2 class="jst-co-h"><span class="jst-co-n" aria-hidden="true"><span class="jst-co-n0">0</span>' + n + '</span><span>' + title + '</span></h2>' + body + '</section>';

    const contact = block(1, 'Vos coordonnées', '<div class="jst-fields">' +
      field('first', 'Prénom', '<input class="jst-input" id="' + uid + 'first" type="text" autocomplete="given-name" maxlength="40" placeholder="Ex.' + NBSP + ': Awa" tabindex="-1" data-jst-field="first" value="' + esc(f.first) + '">') +
      field('phone', 'Numéro WhatsApp', '<div class="jst-input-group"><span class="jst-prefix" aria-hidden="true">+225</span>' +
        '<input class="jst-input" id="' + uid + 'phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="07 07 12 34 56" tabindex="-1" data-jst-field="phone" value="' + esc(f.phone) + '"></div>',
      'Pour confirmer la commande et suivre la livraison.') +
      '</div>');

    const opts = m.zones.map((z) => '<option value="' + esc(z.name) + '"' + (j.zone && z.name === j.zone.name ? ' selected' : '') + '>' +
      esc(z.name) + ' — ' + feeText(z.fee) + '</option>').join('');
    const delivery = block(2, 'Livraison',
      (m.zones.length ? field('commune', 'Commune', '<div class="jst-select"><select class="jst-input" id="' + uid + 'commune" tabindex="-1" data-jst-field="commune">' + opts + '</select>' + icon('down') + '</div>') : '') +
      field('address', 'Adresse et repère', '<textarea class="jst-input jst-textarea" id="' + uid + 'address" rows="3" maxlength="240" placeholder="Quartier, repère' + NBSP + ': ex. près de la pharmacie" tabindex="-1" data-jst-field="address">' + esc(f.address) + '</textarea>') +
      '<p class="jst-eta">' + icon('clock') + '<span>Livraison estimée' + NBSP + ': <b>sous 24' + NBSP + 'h' + (j.zone ? ' à ' + esc(j.zone.name) : '') + '</b>, du lundi au samedi.</span></p>');

    const payBlock = block(3, 'Paiement', '<div class="jst-pay" role="radiogroup" aria-label="Moyen de paiement">' + m.payments.map((p) => {
      const on = !!j.pay && j.pay.key === p.key;
      return '<button type="button" class="jst-pay-opt' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="-1"' + act('pay', { pay: p.key }) + '>' +
        '<span class="jst-radio" aria-hidden="true"></span>' +
        '<span class="jst-pay-body"><span class="jst-pay-label">' + esc(p.label) + '</span>' + (p.hint ? '<span class="jst-pay-hint">' + esc(fr(p.hint)) + '</span>' : '') + '</span>' +
        '<span class="jst-pay-ico" aria-hidden="true">' + icon(p.icon) + '</span></button>';
    }).join('') + '</div>');

    const noPay = !m.payments.length;
    const main = noPay
      ? '<div class="jst-co-main"><div class="jst-co-none">' + '<span class="jst-empty-ico" aria-hidden="true">' + icon('lock') + '</span>' +
        '<p class="jst-h jst-co-none-title">Le paiement n’est pas encore activé</p>' +
        '<p>Activez au moins un moyen de paiement (Wave, Orange Money, paiement à la livraison…) dans Boutique › Moyens de paiement. En attendant, vos clients peuvent commander sur WhatsApp.</p></div></div>'
      : '<div class="jst-co-main">' + contact + delivery + payBlock + '</div>';

    const summary = '<aside class="jst-summary jst-co-summary">' +
      '<div class="jst-summary-head"><h2 class="jst-h jst-summary-title">Votre commande</h2><a class="jst-link"' + go('cart') + '>Modifier</a></div>' +
      '<ul class="jst-mini-lines">' + j.lines.map((l) => miniLine(l, true)).join('') + '</ul>' + totals(j) + '</aside>';

    const cod = !!j.pay && j.pay.key === 'cod';
    const actions = '<div class="jst-co-actions">' +
      (noPay ? '' :
        btn(cod ? 'Confirmer la commande' : 'Payer ' + money(j.total), { size: 'lg', block: true, icon: cod ? 'check' : 'lock', cls: 'jst-pay-btn', attrs: act('order') }) +
        '<p class="jst-pay-note">' + (cod
          ? 'Vous paierez ' + money(j.total) + ' au livreur, à la réception.'
          : (j.pay && j.pay.key === 'card'
            ? 'Vous saisirez votre carte sur la page sécurisée de notre partenaire.'
            : (j.pay ? 'Vous validerez ' + money(j.total) + ' avec ' + esc(j.pay.label) + ' sur votre téléphone.' : ''))) + '</p>' +
        '<p class="jst-or"><span>ou</span></p>') +
      btn('Commander sur WhatsApp', { size: 'lg', block: true, icon: 'chat', cls: 'jst-btn--ghost', attrs: act('wa') }) +
      '<p class="jst-trust">' + icon('shield') + '<span>Paiement traité par un partenaire agréé par la BCEAO. Jeere ne garde jamais votre argent.</span></p>' +
      '</div>';

    return '<div class="jst-wrap jst-co">' + top + '<div class="jst-co-grid' + (noPay ? ' is-nopay' : '') + '">' + main + summary + actions + '</div></div>';
  }

  function pageConfirmation(m, j) {
    const top = steps(3);
    if (!j.lines.length) {
      return '<div class="jst-wrap jst-ok">' + top + empty('Ajoutez un produit pour voir la page de confirmation.') + '</div>';
    }
    const first = j.form.first.trim();
    const phone = j.form.phone.trim();
    const address = j.form.address.trim();
    const pay = j.pay;
    let status;
    if (!pay) status = '<p class="jst-ok-status">' + icon('chat') + '<span>Paiement à convenir sur WhatsApp</span></p>';
    else if (pay.key === 'cod') status = '<p class="jst-ok-status is-cod">' + icon('cash') + '<span>' + esc(pay.status || 'À payer à la livraison') + ' · <b>' + money(j.total) + '</b></span></p>';
    else status = '<p class="jst-ok-status is-paid">' + icon('check') + '<span>' + esc(pay.status || (pay.key === 'card' ? 'Paiement par carte reçu' : 'Paiement ' + pay.label + ' reçu')) + ' · <b>' + money(j.total) + '</b></span></p>';
    const hero = '<div class="jst-ok-hero">' +
      '<span class="jst-ok-check" aria-hidden="true">' + icon('check') + '</span>' +
      '<h1 class="jst-h jst-ok-title">Merci' + (first ? ' ' + esc(first) : '') + NBSP + '!</h1>' +
      '<p class="jst-ok-num">Commande n°' + NBSP + ORDER_NO + ' confirmée</p>' + status +
      '<p class="jst-ok-eta">' + icon('truck') + '<span>Livraison prévue sous 24' + NBSP + 'h' + (j.zone ? ' à ' + esc(j.zone.name) : '') + '. Le livreur vous appelle avant de passer.</span></p>' +
      '<div class="jst-ok-actions">' + btn('Suivre ma commande sur WhatsApp', { size: 'lg', block: true, icon: 'chat', cls: 'jst-ok-wa', attrs: act('wa') }) +
      '<a class="jst-link jst-ok-back"' + act('done') + '>' + icon('back') + '<span>Retour à la boutique</span></a></div>' +
      '</div>';
    const details = [
      ['Livraison', (j.zone ? esc(j.zone.name) : 'À confirmer') + (address ? '<br>' + esc(address).replace(/\n/g, '<br>') : '')],
      ['Contact', (first ? esc(first) : 'Client') + (phone ? '<br>+225' + NBSP + esc(phone) : '')],
      ['Paiement', pay ? esc(pay.label) : 'À convenir sur WhatsApp']
    ];
    const recap = '<section class="jst-summary jst-ok-recap"><h2 class="jst-h jst-summary-title">Récapitulatif</h2>' +
      '<ul class="jst-mini-lines">' + j.lines.map((l) => miniLine(l, false)).join('') + '</ul>' + totals(j) + '</section>';
    const info = '<section class="jst-summary jst-ok-info"><h2 class="jst-h jst-summary-title">Détails de la commande</h2><dl class="jst-ok-dl">' +
      details.map((d) => '<div><dt>' + d[0] + '</dt><dd>' + d[1] + '</dd></div>').join('') + '</dl></section>';
    return '<div class="jst-wrap jst-ok">' + top + hero + '<div class="jst-ok-grid">' + recap + info + '</div></div>';
  }

  const PAGE_RENDERERS = { product: pageProduct, cart: pageCart, checkout: pageCheckout, confirmation: pageConfirmation };

  function renderPage(m, j) {
    if (j.page === 'home') return pageHome(m, j);
    let main;
    try {
      main = PAGE_RENDERERS[j.page](m, j);
    } catch (e) {
      main = '<div class="jst-wrap jst-page-empty">' + empty('Cette page n’a pas pu être affichée. Vérifiez la fiche boutique.') + '</div>';
    }
    const out = j.page === 'checkout' ? [headerCheckout(m)] : leadingAnnouncements(m).concat([header(m, j)]);
    out.push('<main class="jst-main jst-main--' + j.page + '">' + main + '</main>');
    out.push(footer(m));
    return out.join('');
  }

  /* ------------------------------------------------------------------ interactions
   * Delegated on the root, bound once per element. Store links never leave the preview.
   */

  function setVars(el, vars) {
    Object.keys(vars).forEach((k) => { try { el.style.setProperty(k, vars[k]); } catch (e) { /* ignore */ } });
  }

  function refresh(rootEl) {
    const v = rootEl.__jstView;
    if (!v) return;
    render(v.config, rootEl, { device: v.device, page: v.page, productId: v.productId });
  }

  // Brings the top of the store back into view inside its nearest scrolling box.
  function scrollToTop(rootEl) {
    try {
      const r = rootEl.getBoundingClientRect();
      let p = rootEl.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) {
          const pr = p.getBoundingClientRect();
          if (r.top < pr.top) p.scrollTop -= pr.top - r.top;
          return;
        }
        p = p.parentElement;
      }
      if (r.top < 0 && typeof window !== 'undefined') window.scrollBy(0, r.top);
    } catch (e) { /* scrolling is a nicety */ }
  }

  function navigate(rootEl, page, productId) {
    const v = rootEl.__jstView;
    if (!v) return;
    render(v.config, rootEl, { device: v.device, page: page, productId: productId || null });
    const nv = rootEl.__jstView || {};
    const detail = { page: nv.page || 'home', productId: nv.page === 'product' ? (nv.productId || null) : null };
    let ok = true;
    try {
      let ev;
      if (typeof CustomEvent === 'function') ev = new CustomEvent('jst:navigate', { bubbles: true, cancelable: true, detail: detail });
      else { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('jst:navigate', true, true, detail); }
      ok = rootEl.dispatchEvent(ev);
    } catch (e) { ok = true; }
    if (ok) scrollToTop(rootEl);
  }

  // A short note next to a button that only works in the real store (WhatsApp).
  function toast(rootEl, anchor, text) {
    try {
      let dock = null;
      for (let i = 0; i < rootEl.children.length; i++) if (rootEl.children[i].classList.contains('jst-toast-dock')) dock = rootEl.children[i];
      if (!dock) { dock = document.createElement('div'); dock.className = 'jst-toast-dock'; rootEl.appendChild(dock); }
      const rr = rootEl.getBoundingClientRect();
      const br = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
      const scale = rootEl.offsetWidth ? rr.width / rootEl.offsetWidth || 1 : 1;
      const top = br ? (br.bottom - rr.top) / scale + 10 : 16;
      dock.innerHTML = '<p class="jst-toast" role="status" style="top:' + Math.max(8, Math.round(top)) + 'px">' + icon('chat') + '<span>' + esc(text) + '</span></p>';
      clearTimeout(rootEl.__jstToastTimer);
      rootEl.__jstToastTimer = setTimeout(() => { try { dock.innerHTML = ''; } catch (e) { /* gone */ } }, 3200);
    } catch (e) { /* a note is a nicety */ }
  }

  function onClick(rootEl, e) {
    const t = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement) || null;
    if (!t) return;
    if (t.closest('a')) e.preventDefault();
    const a = t.closest('[data-jst-action]');
    if (!a || a.disabled) return;
    const action = a.getAttribute('data-jst-action');
    const id = a.getAttribute('data-product') || '';
    const delta = Math.round(Number(a.getAttribute('data-delta')) || 0);
    const cart = isObj(rootEl.__jstCart) ? rootEl.__jstCart : (rootEl.__jstCart = {});
    switch (action) {
      case 'go':
        navigate(rootEl, a.getAttribute('data-page') || 'home', id || null);
        break;
      case 'add': {
        const q = isObj(rootEl.__jstQty) && rootEl.__jstQty.id === id ? clamp(Math.round(num(rootEl.__jstQty.n) || 1), QTY_MIN, QTY_MAX) : 1;
        if (id) cart[id] = clamp((Math.round(num(cart[id]) || 0)) + q, QTY_MIN, QTY_MAX);
        rootEl.__jstQty = null;
        navigate(rootEl, 'cart', null);
        break;
      }
      case 'qty':
        if (id && own(cart, id)) { cart[id] = clamp((Math.round(num(cart[id]) || 1)) + delta, QTY_MIN, QTY_MAX); refresh(rootEl); }
        break;
      case 'pdp-qty': {
        const cur = isObj(rootEl.__jstQty) && rootEl.__jstQty.id === id ? Math.round(num(rootEl.__jstQty.n) || 1) : 1;
        rootEl.__jstQty = { id: id, n: clamp(cur + delta, QTY_MIN, QTY_MAX) };
        refresh(rootEl);
        break;
      }
      case 'remove':
        if (id) delete cart[id];
        if (!Object.keys(cart).length) rootEl.__jstCartCleared = true;
        refresh(rootEl);
        break;
      case 'pay': {
        const form = isObj(rootEl.__jstForm) ? rootEl.__jstForm : (rootEl.__jstForm = {});
        form.pay = a.getAttribute('data-pay') || '';
        refresh(rootEl);
        break;
      }
      case 'order':
        navigate(rootEl, 'confirmation', null);
        break;
      case 'done':
        rootEl.__jstCart = {};
        navigate(rootEl, 'home', null);
        break;
      case 'wa':
        toast(rootEl, a, 'Aperçu' + NBSP + ': dans votre boutique, ce bouton ouvre WhatsApp avec la commande prête à envoyer.');
        break;
      default:
        break;
    }
  }

  function onField(rootEl, e, committed) {
    const f = e.target;
    if (!f || !f.getAttribute) return;
    const key = f.getAttribute('data-jst-field');
    if (!key) return;
    const form = isObj(rootEl.__jstForm) ? rootEl.__jstForm : (rootEl.__jstForm = {});
    form[key] = String(f.value == null ? '' : f.value).slice(0, 240);
    // The commune changes the delivery fee, the total and the pay button: redraw the page.
    if (committed && key === 'commune') refresh(rootEl);
  }

  function bind(rootEl) {
    if (rootEl.__jstBound || typeof rootEl.addEventListener !== 'function') return;
    rootEl.__jstBound = true;
    rootEl.addEventListener('click', (e) => { try { onClick(rootEl, e); } catch (err) { /* never break the host page */ } });
    rootEl.addEventListener('input', (e) => { try { onField(rootEl, e, false); } catch (err) { /* ignore */ } });
    rootEl.addEventListener('change', (e) => { try { onField(rootEl, e, true); } catch (err) { /* ignore */ } });
    rootEl.addEventListener('submit', (e) => e.preventDefault());
    // Typing in the store's fields must not trigger the editor's shortcuts (undo, delete…).
    rootEl.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select')) e.stopPropagation();
    });
  }

  /* ------------------------------------------------------------------ render */

  function render(config, rootEl, options) {
    if (!rootEl || typeof rootEl !== 'object' || !('innerHTML' in rootEl)) return rootEl;
    const o = isObj(options) ? options : {};
    const device = o.device === 'desktop' ? 'desktop' : 'phone';
    let page = typeof o.page === 'string' && (o.page === 'home' || own(PAGE_RENDERERS, o.page)) ? o.page : 'home';
    const productId = typeof o.productId === 'string' && o.productId ? o.productId : null;
    let m = null;
    let j = null;
    let html;
    try {
      m = buildModel(config, device);
      VIVID = m.vivid;
      j = journey(m, rootEl, page, productId);
      html = renderPage(m, j);
    } catch (e) {
      m = null;
      page = 'home';
      const name = isObj(config) && isObj(config.store) ? str(config.store.name).trim() : '';
      html = '<header class="jst-header"><div class="jst-wrap jst-header-in"><span class="jst-logo">' + esc(name || 'Votre boutique') + '</span></div></header>' +
        '<main class="jst-main"><div class="jst-wrap jst-page-empty">' + empty('L’aperçu n’a pas pu être affiché. Vérifiez la fiche boutique.') + '</div></main>';
    } finally {
      VIVID = false;
    }
    try {
      rootEl.__jstView = { config: config, device: device, page: page, productId: j ? j.productId : productId };
      rootEl.className = 'jst';
      if (rootEl.dataset) {
        rootEl.dataset.tpl = m ? m.tpl : 'plateau';
        rootEl.dataset.device = device;
        rootEl.dataset.buttons = m ? m.buttons : 'solid';
        rootEl.dataset.tone = m && m.dark ? 'dark' : 'light';
        rootEl.dataset.intensity = m ? m.intensity : 'vivid';
        rootEl.dataset.page = page;
      }
      const c = m ? m.colors : FALLBACK_COLORS;
      const v = m ? m.v : vividColors(FALLBACK_COLORS, false);
      if (rootEl.style) {
        setVars(rootEl, {
          '--st-bg': c.bg,
          '--st-surface': c.surface,
          '--st-text': c.text,
          '--st-muted': c.muted,
          '--st-accent': c.accent,
          '--st-on-accent': c.onAccent,
          '--st-line': c.line,
          '--st-radius': (m ? m.radius : 0) + 'px',
          '--st-font-display': m ? m.fontDisplay : 'Georgia, serif',
          '--st-font-text': m ? m.fontText : 'system-ui, sans-serif',
          '--st-display-weight': String(m ? m.displayWeight : 600),
          '--st-accent-ink': m ? m.accentInk : c.text,
          '--st-accent-soft': m ? m.accentSoft : mix(c.bg, c.accent, 0.1),
          '--st-surface-2': mix(c.surface, c.accent, m && m.dark ? 0.035 : 0.05),
          '--st-text-soft': mix(c.bg, c.text, 0.82),
          // Buttons set over a photo: the accent when it stands out on a dark scrim, else white.
          '--st-photo-btn-bg': lum(c.accent) < 0.2 ? '#FFFFFF' : c.accent,
          '--st-photo-btn-fg': lum(c.accent) < 0.2 ? '#15120E' : c.onAccent,
          // Vivid set (see vividColors); soft stores use them only in forms and summaries.
          '--st-tint': v.tint,
          '--st-tint-strong': v.tintStrong,
          '--st-accent-text': v.accentText,
          '--st-muted-tint': v.mutedTint,
          '--st-muted-strong': v.mutedStrong,
          '--st-on-accent-soft': v.onAccentSoft,
          '--st-field-line': v.fieldLine
        });
      }
      rootEl.innerHTML = html;
    } catch (e) {
      try { rootEl.textContent = 'Aperçu indisponible.'; } catch (e2) { /* nothing more to do */ }
    }
    bind(rootEl);
    ensureFonts(config);
    return rootEl;
  }

  root.JeereRender = { render: render, ensureFonts: ensureFonts, artSVG: artSVG, pages: pagesList, PAGES: PAGES_FALLBACK };
})();
