/*
 * JEERE Studio — render.js
 * Turns a fiche boutique (store config v1) into a store page, with one of three tested templates:
 * Plateau (editorial), Cocody (soft) and Treichville (bold).
 *
 * Global: window.JeereRender = { render, ensureFonts, artSVG }
 *
 * Rules kept here:
 * - pure and defensive: reads only JEERE_DATA and the config, never throws, falls back to defaults;
 * - every user string is escaped (esc) before it reaches the markup;
 * - layout depends only on data-device ('phone' | 'desktop'), never on the viewport;
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

  const plural = (n, one, many) => n + NBSP + (n > 1 ? many : one);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  // Multi-line text (textarea): paragraphs on blank lines, <br> on single line breaks. Escaped.
  function paras(text) {
    const t = str(text).trim();
    if (!t) return '';
    return t.split(/\n\s*\n/).map((p) => '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
  }
  const line = (text) => esc(str(text).replace(/\s*\n\s*/g, ' ').trim());

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

  // The tile behind a product illustration: a lighter tint of the product colour, or a slightly
  // deeper one when the colour is already very light (a white sneaker on a pale grey card).
  const tileCache = new Map();
  function tileColors(hex) {
    const key = String(hex);
    if (tileCache.has(key)) return tileCache.get(key);
    const hsl = rgbToHsl(parseHex(hex) || [233, 216, 189]);
    const L = hsl[2];
    const tl = L > 0.8 ? L - 0.075 : L + (0.93 - L) * 0.62;
    const out = {
      tile: toHex(hslToRgb(hsl[0], hsl[1] * 0.72, tl)),
      hi: toHex(hslToRgb(hsl[0], hsl[1] * 0.6, Math.min(0.975, tl + 0.055)))
    };
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
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>'
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
      SH(100, 215, 62, 7) +
      '<path d="M74 62l16-7c3 10 6 14 10 14s7-4 10-14l16 7 38 23-14 30-16-8v96c0 3-2 5-5 5H71c-3 0-5-2-5-5v-96l-16 8-14-30z" fill="' + p.c + '"/>' +
      '<path d="M36 85l14 30 9-4.5-13.5-30z" fill="' + p.d1 + '" fill-opacity=".7"/>' +
      '<path d="M164 85l-14 30-9-4.5 13.5-30z" fill="' + p.d1 + '" fill-opacity=".7"/>' +
      '<path d="M116 98l18 9v96c0 3-2 5-5 5h-13z" fill="' + p.d1 + '" fill-opacity=".4"/>' +
      '<path d="M88 56c3 12 7 18 12 18s9-6 12-18" fill="none" stroke="' + p.d2 + '" stroke-width="6" stroke-linecap="round"/>' +
      '<rect x="106" y="94" width="18" height="20" rx="3" fill="' + p.d1 + '" fill-opacity=".65"/>' +
      '<path d="M78 92v100" stroke="#fff" stroke-opacity=".3" stroke-width="7" stroke-linecap="round"/>',

    shoe: (p) =>
      '<g transform="translate(-2 -14)">' + SH(104, 200, 80, 7) +
      '<path d="M24 170h156c5 0 7 4 5 9-3 8-9 12-17 12H38c-9 0-14-5-14-12z" fill="' + p.w + '"/>' +
      '<path d="M24 181h161c-3 7-9 10-17 10H38c-7 0-12-4-14-10z" fill="' + p.d1 + '" fill-opacity=".55"/>' +
      '<path d="M28 170l5-58c1-11 7-16 16-16h17c8 0 12 5 15 11 9 17 21 25 37 27l28 6c26 6 36 16 38 30z" fill="' + p.c + '"/>' +
      '<path d="M146 140c21 6 31 15 34 30h-31c-1-12-5-22-12-29z" fill="' + p.l1 + '"/>' +
      '<path d="M33 112c1-11 7-16 16-16h6l-4 74H28z" fill="' + p.d1 + '"/>' +
      '<path d="M80 107c9 17 21 25 37 27l5 22c-25 0-44-9-56-24z" fill="' + p.d1 + '" fill-opacity=".5"/>' +
      '<path d="M86 119l9-7M96 127l9-7M107 132l8-7" stroke="' + p.w + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M46 101c8-4 16-4 24 0" stroke="' + p.d3 + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<path d="M58 158h70" stroke="' + p.d2 + '" stroke-width="4" stroke-linecap="round" stroke-opacity=".5"/>' +
      '<path d="M40 126v34" stroke="#fff" stroke-opacity=".3" stroke-width="6" stroke-linecap="round"/></g>',

    cap: (p) =>
      SH(100, 206, 74, 7) +
      '<path d="M42 160c-2-46 22-74 58-74s60 28 58 74z" fill="' + p.c + '"/>' +
      '<path d="M100 86c-24 8-34 40-34 74h34z" fill="' + p.l1 + '"/>' +
      '<path d="M100 86c-3 22-3 50 0 74M100 86c-21 10-31 40-34 74M100 86c21 10 31 40 34 74" stroke="' + p.d1 + '" stroke-width="2.5" fill="none" stroke-opacity=".8"/>' +
      '<path d="M134 160c-2-30-12-56-34-74 30 4 56 30 58 74z" fill="' + p.d1 + '" fill-opacity=".45"/>' +
      '<ellipse cx="100" cy="87" rx="9" ry="4.5" fill="' + p.d2 + '"/>' +
      '<path d="M42 150c38 10 78 10 116 0l1 12c-39 11-79 11-118 0z" fill="' + p.d1 + '"/>' +
      '<path d="M40 160c40 13 80 13 120 0 16 6 18 18 8 25-44 15-92 15-136 0-10-7-8-19 8-25z" fill="' + p.d2 + '"/>' +
      '<path d="M54 170c30 8 62 8 92 0" stroke="#fff" stroke-opacity=".18" stroke-width="4" stroke-linecap="round" fill="none"/>' +
      '<path d="M66 118c4-12 10-20 18-25" stroke="#fff" stroke-opacity=".35" stroke-width="6" stroke-linecap="round" fill="none"/>',

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
      SH(100, 220, 56, 7) +
      '<path d="M68 200c6-8 18-12 32-12s26 4 32 12l4 14H64z" fill="#DCCBB9"/>' +
      '<path d="M86 160h28v34c-4 3-9 4-14 4s-10-1-14-4z" fill="#E6D7C7"/>' +
      '<path d="M100 48c-38 0-54 30-54 68l2 82c0 5 4 9 9 9h22c4-34 0-62-4-86 0-20 10-30 25-30s25 10 25 30c-4 24-8 52-4 86h22c5 0 9-4 9-9l2-82c0-38-16-68-54-68z" fill="' + p.c + '"/>' +
      '<ellipse cx="100" cy="132" rx="27" ry="35" fill="#F1E6DA"/>' +
      '<path d="M100 48c-34 0-50 26-52 60 14-18 34-28 58-28 18 0 32 8 44 24-2-34-18-56-50-56z" fill="' + p.c + '"/>' +
      '<path d="M54 106c12-16 30-25 52-26-14 8-22 20-26 36-8-6-17-10-26-10z" fill="' + p.d1 + '"/>' +
      '<path d="M60 124c-4 26-4 50-1 76M70 116c-3 30-2 58 2 86M140 124c4 26 4 50 1 76M130 116c3 30 2 58-2 86" stroke="' + p.d2 + '" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-opacity=".7"/>' +
      '<path d="M78 62c10-6 24-8 38-4" stroke="' + p.l2 + '" stroke-width="5" stroke-linecap="round" fill="none" stroke-opacity=".8"/>' +
      '<path d="M146 112c2 30 2 60 0 90" stroke="' + p.d1 + '" stroke-width="7" stroke-linecap="round" fill="none" stroke-opacity=".6"/>',

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

  const artCache = new Map();
  function artSVG(kind, color) {
    try {
      const k = own(ART, kind) ? kind : 'box';
      const c = validHex(color) || '#E9D8BD';
      const key = k + c;
      if (artCache.has(key)) return artCache.get(key);
      const svg = '<svg class="jst-art" viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + ART[k](artColors(c)) + '</svg>';
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

    const payments = [];
    const pay = isObj(cfg.payments) ? cfg.payments : {};
    (Array.isArray(d.PAYMENTS) ? d.PAYMENTS : []).forEach((p) => { if (pay[p.key] === true) payments.push(p); });

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
    const accentInk = contrast(colors.accent, colors.bg) >= 4.5 ? colors.accent : colors.text;
    const accentSoft = mix(colors.bg, colors.accent, dark ? 0.16 : 0.1);

    // Fallback visual when there is no product yet: the niche art, or a box in a soft accent tint.
    const leadFallback = {
      id: '', name: '', price: null, category: '', badge: null, description: '', image: null,
      art: niche && own(ART, niche.art) ? niche.art : 'box',
      color: validHex(niche && niche.color) || mix(colors.accent, '#FFFFFF', 0.72)
    };

    return {
      d: d, tpl: tpl, device: device, buttons: buttons, dark: dark,
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

  function btn(label, opts) {
    const o = opts || {};
    const text = str(label).trim();
    const cls = 'jst-btn' + (o.size ? ' jst-btn--' + o.size : '') + (o.block ? ' jst-btn--block' : '') + (o.cls ? ' ' + o.cls : '');
    const before = o.icon ? icon(o.icon) : '';
    const after = o.arrow ? icon('arrow', 'jst-btn-arrow') : '';
    return '<button type="button" class="' + cls + '" tabindex="-1">' + before + '<span class="jst-btn-label">' + (text ? esc(text) : 'Découvrir') + '</span>' + after + '</button>';
  }

  function tileStyle(color) {
    const t = tileColors(color);
    return '--tile:' + t.tile + ';--tile-hi:' + t.hi + ';--ink:' + inkOn(t.tile);
  }
  function inkOn(bg) { return lum(bg) > 0.4 ? '#15120E' : '#FFFFFF'; }

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
    return '<section class="jst-sec jst-sec--' + s.type + (extraCls ? ' ' + extraCls : '') + '" data-section-id="' + esc(s.id) + '" data-section-type="' + s.type + '">';
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

  function header(m) {
    const seen = {};
    const nav = [];
    m.sections.forEach((s) => {
      const label = NAV_LABELS[s.type];
      if (label && !seen[label] && nav.length < 4) { seen[label] = true; nav.push(label); }
    });
    if (!nav.length) nav.push('Boutique');
    return '<header class="jst-header"><div class="jst-wrap jst-header-in">' +
      '<button type="button" class="jst-icon-btn jst-menu" aria-label="Menu" tabindex="-1">' + icon('menu') + '</button>' +
      '<span class="jst-logo' + (m.rawName ? '' : ' is-placeholder') + '">' + esc(m.name) + '</span>' +
      '<nav class="jst-nav" aria-label="Menu de la boutique">' + nav.map((n) => '<a class="jst-nav-link">' + esc(n) + '</a>').join('') + '</nav>' +
      '<div class="jst-header-actions">' +
      '<button type="button" class="jst-icon-btn jst-search" aria-label="Rechercher" tabindex="-1">' + icon('search') + '</button>' +
      '<button type="button" class="jst-icon-btn jst-bag" aria-label="Panier" tabindex="-1">' + icon('bag') + '</button>' +
      '</div></div></header>';
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
      '<div class="jst-footer-bottom"><span>©' + NBSP + esc(m.name) + '</span><span class="jst-powered">Propulsé par <b>JEERE</b></span></div>' +
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
        ? '<div class="jst-float">' + media(m.products[0], 'jst-float-media') +
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
      stage = '<div class="jst-hero-stage" style="--tile:' + t.tile + ';--tile-hi:' + t.hi + ';--ink:' + inkOn(t.tile) + '">' +
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
    return '<article class="jst-card" data-product-id="' + esc(p.id) + '">' +
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

  function page(m) {
    const out = [];
    let i = 0;
    // Announcements placed first sit above the header, like on any real store.
    while (i < m.sections.length && m.sections[i].type === 'announcement') { out.push(renderSection(m, m.sections[i])); i++; }
    out.push(header(m));
    const body = [];
    for (; i < m.sections.length; i++) body.push(renderSection(m, m.sections[i]));
    if (!body.length) {
      body.push('<div class="jst-wrap jst-page-empty">' + empty('Votre page est vide pour l’instant. Activez ou ajoutez une section pour la remplir.') + '</div>');
    }
    out.push('<main class="jst-main">' + body.join('') + '</main>');
    out.push(footer(m));
    return out.join('');
  }

  /* ------------------------------------------------------------------ render */

  function setVars(el, vars) {
    Object.keys(vars).forEach((k) => { try { el.style.setProperty(k, vars[k]); } catch (e) { /* ignore */ } });
  }

  function render(config, rootEl, options) {
    if (!rootEl || typeof rootEl !== 'object' || !('innerHTML' in rootEl)) return rootEl;
    const device = options && options.device === 'desktop' ? 'desktop' : 'phone';
    let m = null;
    let html;
    try {
      m = buildModel(config, device);
      html = page(m);
    } catch (e) {
      m = null;
      const name = isObj(config) && isObj(config.store) ? str(config.store.name).trim() : '';
      html = '<header class="jst-header"><div class="jst-wrap jst-header-in"><span class="jst-logo">' + esc(name || 'Votre boutique') + '</span></div></header>' +
        '<main class="jst-main"><div class="jst-wrap jst-page-empty">' + empty('L’aperçu n’a pas pu être affiché. Vérifiez la fiche boutique.') + '</div></main>';
    }
    try {
      rootEl.className = 'jst';
      if (rootEl.dataset) {
        rootEl.dataset.tpl = m ? m.tpl : 'plateau';
        rootEl.dataset.device = device;
        rootEl.dataset.buttons = m ? m.buttons : 'solid';
        rootEl.dataset.tone = m && m.dark ? 'dark' : 'light';
      }
      const c = m ? m.colors : FALLBACK_COLORS;
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
          '--st-surface-2': mix(c.surface, c.accent, m && m.dark ? 0.08 : 0.05),
          '--st-text-soft': mix(c.bg, c.text, 0.82)
        });
      }
      rootEl.innerHTML = html;
    } catch (e) {
      try { rootEl.textContent = 'Aperçu indisponible.'; } catch (e2) { /* nothing more to do */ }
    }
    ensureFonts(config);
    return rootEl;
  }

  root.JeereRender = { render: render, ensureFonts: ensureFonts, artSVG: artSVG };
})();
