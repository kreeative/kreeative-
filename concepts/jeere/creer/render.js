/*
 * Jeere Studio — render.js
 * Turns a fiche boutique (store config v1) into a store page, with one of three tested templates:
 * Plateau (editorial), Cocody (soft) and Treichville (bold).
 *
 * Global: window.JeereRender = { render, ensureFonts, fontLinks, artSVG, pages, PAGES, photoSrc, photoInfo, PHOTO_BASE }
 *
 * photoSrc(id) / photoInfo(id): the URL (or the catalogue entry with its src) of a demo photo of
 *   JEERE_DATA.DEMO_PHOTOS, null for an unknown id. Demo photos live in img/demo/ next to this
 *   file (PHOTO_BASE, read from this script's address). Every picture follows the same order: the
 *   seller's own image, else the demo photo (products[].photo, settings.photo of hero and about),
 *   else the illustration. A demo photo whose file does not load is dropped for the rest of the
 *   page's life (photoInfo then answers null) and the store is drawn again without it.
 *
 * render(config, rootEl, { device: 'phone' | 'desktop', page: 'home' | 'product' | 'cart' |
 *   'checkout' | 'confirmation' | 'page', productId, pageId })
 *   Draws one page of the store. The whole customer journey works inside the preview: a product
 *   card opens its page, « Ajouter au panier » opens the cart, then the checkout and the
 *   confirmation. Each such move re-renders the same rootEl and dispatches a bubbling, cancelable
 *   CustomEvent 'jst:navigate' on rootEl with detail { page, productId, pageId } (productId is null
 *   except on the product page, pageId null except on a custom page). Cancel it to stop the default
 *   scroll back to the top of the store.
 *   page 'page' draws one of the seller's own pages (config.pages: À propos, Livraison et retours,
 *   Contact, Conditions de vente…), picked by pageId (the first page when it is missing or
 *   unknown). Pages with inMenu are in the header (desktop nav, phone menu), pages with inFooter
 *   in a footer column. Every page ends with « Propulsé par Jeere ».
 *   The demo cart lives on the element: rootEl.__jstCart = { [productId]: qty } (1 to 20). The
 *   checkout form lives in rootEl.__jstForm, the open phone menu in rootEl.__jstMenu. Nothing is
 *   sent anywhere: no location, no history, no network request.
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

  // A seller's page text (plain text, at most 4 000 characters in the fiche): paragraphs on blank
  // lines; a block whose lines start with « - », « • » or « 1. » becomes a list (an intro line
  // ending with « : » may lead it); a short single line followed by more text, starting with a
  // capital and not ending with punctuation, becomes a sub-heading. Escaped.
  const LIST_RE = /^\s*(?:[-•*–]|\d{1,2}[.)])\s+/;
  // « Prix : les prix sont… » — a short label (4 words at most, no comma) before « : » is set in bold.
  const LABEL_RE = /^([A-ZÀ-ÖØ-Þ][^:,.;!?()\n]{0,34}?)\u00A0:\s/;
  function textBlocks(text, pages) {
    const refs = (Array.isArray(pages) ? pages : []).filter((p) => p.title).map((p) => ({ id: p.id, t: esc(fr(p.title)) }));
    // A page named between « » (« Livraison et retours ») becomes a link to it, inside the preview.
    const link = (h) => refs.reduce((out, r) => out.split('«' + NBSP + r.t + NBSP + '»').join('«' + NBSP + '<a class="jst-cp-ref"' + goPage(r.id) + '>' + r.t + '</a>' + NBSP + '»'), h);
    const inline = (raw) => {
      let h = esc(fr(raw));
      const lm = LABEL_RE.exec(h);
      if (lm && lm[1].trim().split(/\s+/).length <= 4) h = '<b class="jst-cp-label">' + lm[1] + '</b>' + h.slice(lm[1].length);
      return link(h);
    };
    const t = str(text).replace(/\r\n?/g, '\n').slice(0, 6000).trim();
    if (!t) return '';
    const blocks = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const list = (lines) => {
      const ordered = lines.every((l) => /^\s*\d{1,2}[.)]\s+/.test(l));
      const tag = ordered ? 'ol' : 'ul';
      return '<' + tag + ' class="jst-cp-list' + (ordered ? ' is-ordered' : '') + '">' +
        lines.map((l) => '<li>' + inline(l.replace(LIST_RE, '').trim()) + '</li>').join('') + '</' + tag + '>';
    };
    return blocks.map((b, i) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((l) => LIST_RE.test(l))) return list(lines);
      if (lines.length > 2 && /:$/.test(lines[0]) && lines.slice(1).every((l) => LIST_RE.test(l))) {
        return '<p>' + inline(lines[0]) + '</p>' + list(lines.slice(1));
      }
      if (lines.length === 1 && i < blocks.length - 1 && b.length <= 60 && /^[A-ZÀ-ÖØ-Þ]/.test(b) && !/[.!?;:,…»)"]$/.test(b)) {
        return '<h2 class="jst-h jst-cp-h2">' + esc(fr(b)) + '</h2>';
      }
      return '<p>' + inline(lines.join('\n')).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  // Same rules as JEERE_DATA.slugify (accents removed, lowercase, hyphens); used when data.js is older.
  function slugify(s) {
    const d = DATA();
    try { if (d && typeof d.slugify === 'function') { const r = d.slugify(s); if (typeof r === 'string') return r; } } catch (e) { /* fall back */ }
    let t = str(s);
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engine */ }
    return t.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
  const validImage = (v) => (typeof v === 'string' && v.length < 16000000 && IMAGE_RE.test(v) ? v.replace(/\s+/g, '') : null);

  /* Demo photos (JEERE_DATA.DEMO_PHOTOS): real photos hosted in img/demo/ next to this file. The
   * folder comes from this script's own address, read once while it loads, so the same id gives
   * the same file from creer/, admin/ and compte/. The fiche only holds ids (products[].photo,
   * settings.photo of hero and about); the seller's own image always wins. */
  const PHOTO_BASE = (() => {
    try {
      const src = typeof document !== 'undefined' && document.currentScript ? str(document.currentScript.src) : '';
      if (src) return src.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'img/demo/';
    } catch (e) { /* not in a browser */ }
    return 'img/demo/';
  })();
  const PHOTO_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const PHOTO_FILE_RE = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*\.(?:webp|jpe?g|png|avif)$/i;
  const FOCUS_PART = '(?:-?\\d{1,3}(?:\\.\\d+)?%|left|center|right|top|bottom)';
  const FOCUS_RE = new RegExp('^' + FOCUS_PART + '(?:\\s+' + FOCUS_PART + ')?$', 'i');
  const httpsUrl = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>\\]+$/i.test(v) ? v : '');
  // Demo photos whose file did not load on this page (missing, misspelt, offline): from then on they
  // count as unknown, so the store draws what it drew before (the illustration, the composition).
  const MISSING = Object.create(null);

  // A demo photo: { id, file, src, alt, focus, credit: { name, username, photoUrl, profileUrl } },
  // or null (unknown id, entry without a valid file, file that did not load, older data.js without a catalogue).
  function photoInfo(id) {
    try {
      const d = DATA();
      const cat = d && isObj(d.DEMO_PHOTOS) ? d.DEMO_PHOTOS : null;
      if (!cat || typeof id !== 'string' || !PHOTO_ID_RE.test(id) || MISSING[id] === true || !own(cat, id)) return null;
      const e = cat[id];
      if (!isObj(e) || typeof e.file !== 'string' || !PHOTO_FILE_RE.test(e.file)) return null;
      const c = isObj(e.credit) ? e.credit : {};
      const focus = str(e.focus).trim().replace(/\s+/g, ' ');
      return {
        id: id, file: e.file, src: PHOTO_BASE + e.file, alt: str(e.alt).trim(), focus: FOCUS_RE.test(focus) ? focus : '',
        credit: { name: str(c.name).trim(), username: str(c.username).trim(), photoUrl: httpsUrl(c.photoUrl), profileUrl: httpsUrl(c.profileUrl) }
      };
    } catch (e) { return null; }
  }
  function photoSrc(id) { const p = photoInfo(id); return p ? p.src : null; }

  // A hero or about image: the seller's (settings.image), else the section's demo photo (settings.photo).
  function sectionImage(st) {
    const mine = validImage(st.image);
    if (mine) return { src: mine, id: '', focus: '' };
    return photoInfo(st.photo);
  }
  // The marks of a demo photo's <img> (ph: photoInfo): its id, so a file that does not load is dropped
  // (onPhotoError), and its crop. Nothing for the seller's photos (centred, as before).
  const photoAttrs = (ph) => (ph && ph.id ? ' data-demo-photo="' + esc(ph.id) + '"' + (ph.focus ? ' style="object-position:' + esc(ph.focus) + '"' : '') : '');

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

  // The stylesheets of the store's fonts: the pair's (theme.fonts) as before, or, with the seller's own fonts
  // (theme.typography), at most 2 families with only the weights used, plus a tiny subset for ɛ ɔ ŋ when a font
  // lacks them (JEERE_DATA.typography builds the links). Each link is added once per page (by id).
  function fontLinks(config) {
    const d = DATA();
    if (!d) return [];
    if (typeof d.typography === 'function') {
      const ty = safe(() => d.typography(config));
      if (ty && Array.isArray(ty.links)) return ty.links.filter((l) => isObj(l) && typeof l.href === 'string' && /^https:\/\/fonts\.googleapis\.com\//.test(l.href));
    }
    const id = fontPairId(config);
    const pair = id ? d.fontPairs[id] : null;
    return pair && typeof pair.googleUrl === 'string' ? [{ id: 'jst-font-' + id, href: pair.googleUrl }] : [];
  }

  // The local stand-in of a heading font drawn bigger or smaller (JEERE_DATA.typography().faces): a system font
  // resized by 1 / scale, used until the web font arrives. Only @font-face rules with local() sources pass.
  function fontFaces(config) {
    const d = DATA();
    if (!d || typeof d.typography !== 'function') return [];
    const ty = safe(() => d.typography(config));
    return ty && Array.isArray(ty.faces) ? ty.faces.filter((f) => isObj(f) && typeof f.id === 'string' && typeof f.css === 'string' &&
      /^@font-face\{font-family:'[\w-]+';src:(local\('[\w ]+'\),?)+;size-adjust:[\d.]+%\}$/.test(f.css)) : [];
  }

  function ensureFonts(config) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      const links = fontLinks(config);
      if (!links.length) return;
      const head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      fontFaces(config).forEach((f) => {
        const fid = f.id.replace(/[^\w-]/g, '');
        if (!fid || document.getElementById(fid)) return;
        const st = document.createElement('style');
        st.id = fid;
        st.textContent = f.css;
        head.appendChild(st);
      });
      if (!document.getElementById('jst-font-preconnect')) {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = 'https://fonts.gstatic.com';
        pre.crossOrigin = 'anonymous';
        pre.id = 'jst-font-preconnect';
        head.appendChild(pre);
      }
      links.forEach((l) => {
        const lid = String(l.id || '').replace(/[^\w-]/g, '');
        if (!lid || document.getElementById(lid)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.id = lid;
        link.href = l.href;
        head.appendChild(link);
      });
    } catch (e) { /* fonts are a nicety, never a failure */ }
  }

  /* ------------------------------------------------------------------ model
   * Everything the templates need, read defensively from the config.
   */

  const SECTION_COLOR_KEYS = ['bg', 'fg', 'buttonBg', 'buttonText'];
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

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

  // What a custom page is about, from its slug or title: the Contact page gets a WhatsApp block,
  // the delivery page the store's fees by commune. Anything else is plain text.
  function pageKind(slug, title) {
    const d = DATA();
    try {
      const k = d && typeof d.pageKind === 'function' ? d.pageKind({ slug: slug, title: title }) : null;
      if (k === 'contact') return 'contact';
      if (k === 'shipping' || k === 'delivery') return 'delivery';
    } catch (e) { /* fall back on the slug */ }
    const keys = [slug, slugify(title)];
    const any = (re) => keys.some((k) => re.test(k));
    if (any(/^(contact|contactez-nous|nous-contacter|nous-ecrire)(-|$)/)) return 'contact';
    if (any(/^(livraison|livraisons|expedition|delais-de-livraison)(-|$)/)) return 'delivery';
    return 'text';
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

  // image is what the store shows: the seller's photo, else the demo photo's URL (photo, focus), else
  // null (the illustration). ownImage tells the seller's photo apart.
  function normProduct(p, i, d) {
    const kinds = Array.isArray(d.ART_KINDS) ? d.ART_KINDS : Object.keys(ART);
    const price = num(p.price);
    const mine = validImage(p.image);
    const photo = mine ? null : photoInfo(p.photo);
    return {
      id: str(p.id) || 'p' + (i + 1),
      name: str(p.name).trim(),
      price: price === null ? null : Math.max(0, Math.round(price)),
      category: str(p.category).trim(),
      badge: typeof p.badge === 'string' && own(d.BADGES, p.badge) ? p.badge : null,
      art: kinds.indexOf(p.art) !== -1 && own(ART, p.art) ? p.art : 'box',
      color: validHex(p.color) || '#E9D8BD',
      description: str(p.description),
      image: mine || (photo ? photo.src : null),
      ownImage: !!mine,
      photo: photo,
      focus: photo ? photo.focus : ''
    };
  }

  /* The vivid colour set, derived from the palette so every pair keeps its contrast:
   *   tint / tintStrong   bg mixed with the accent (≈13 % / ≈30 %), or a deeper shade of the
   *                       background when the accent is a neutral (black, white, grey); dark
   *                       stores keep neutral raised surfaces (a bright accent mixed into
   *                       near-black turns olive or brown) and show the accent as solid blocks;
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
    } else if (dark) {
      tint = c.surface;                          // Nuit #1D201D
      tintStrong = mix(c.surface, c.text, 0.07); // Nuit ≈ #2C2F2C
    } else {
      tint = mix(c.bg, c.accent, 0.13);
      tintStrong = mix(c.bg, c.accent, 0.3);
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
    // Custom colours (optional theme.colors): the seller's colours over the palette, read through
    // JEERE_DATA.themeColors so the editor's checks see the very colours the store shows. Every
    // derived colour below (tints, readable accent, muted on tints…) then comes from the merged set.
    // Without the key: the palette, exactly as before.
    const tc = paletteId && isObj(theme.colors) && typeof d.themeColors === 'function' ? safe(() => d.themeColors(cfg)) : null;
    const custom = !!(tc && tc.custom && isObj(tc.base));
    // Only a page, card, text or accent colour changes the store as a whole (the readability fallbacks
    // below, data-colors="custom"); a header, footer, bar or badge colour stays in its own part.
    const paletteCustom = custom && (tc.paletteSet === undefined ? true : !!tc.paletteSet);
    if (paletteCustom) {
      ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent'].forEach((k) => { colors[k] = validHex(tc.base[k]) || colors[k]; });
      if (typeof tc.base.line === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(tc.base.line.trim())) colors.line = tc.base.line.trim();
    }

    const pair = d.fontPairs[fontsId] || {};
    const fontStack = (f, fb) => (isObj(f) && typeof f.family === 'string' && !/[;{}<>]/.test(f.family) ? f.family : fb);
    // The seller's fonts (optional theme.typography), read through JEERE_DATA.typography: the heading and the
    // text font apart, the headings' weight, size and capitals. Without the key: the pair, exactly as before.
    const ty = isObj(theme.typography) && typeof d.typography === 'function' ? safe(() => d.typography(cfg)) : null;
    const tyFonts = !!(ty && ty.custom);
    const cleanStack = (v) => (typeof v === 'string' && !/[;{}<>]/.test(v) ? v : null);

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
      const sec = { id: id, type: s.type, settings: mergeSettings(d.sectionTypes[s.type].defaults, s.settings) };
      if (isObj(s.settings) && SECTION_COLOR_KEYS.some((k) => s.settings[k] != null) && typeof d.sectionColors === 'function') {
        const sc = safe(() => d.sectionColors(s, colors));
        if (sc && sc.zone) sec.zone = sc.zone;
        if (sc && sc.button) sec.button = sc.button;
      }
      // The announcement colours of theme.colors, for the bars without colours of their own
      if (!sec.zone && s.type === 'announcement' && custom && tc.zones && tc.zones.announcement) sec.zone = tc.zones.announcement;
      sections.push(sec);
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

    // Distinct categories, in order of first appearance; empty ones are skipped. A tile shows the
    // category's last product: the product grid opens with the first ones, so a small store does not
    // show the same pictures twice in a row.
    const catMap = new Map();
    products.forEach((p) => {
      if (!p.category) return;
      const key = p.category.toLowerCase();
      if (!catMap.has(key)) catMap.set(key, { name: p.category, count: 0, product: p });
      const c = catMap.get(key);
      c.count++;
      c.product = p;
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

    // The seller's own pages (config.pages). normalizeConfig fixes ids and slugs; here they only
    // have to be safe to draw: the first page with an id wins, booleans are strict.
    const pages = [];
    const usedPg = {};
    (Array.isArray(cfg.pages) ? cfg.pages : []).forEach((p, i) => {
      if (!isObj(p)) return;
      const id = str(p.id).trim() || 'pg' + (i + 1);
      if (usedPg[id]) return;
      usedPg[id] = true;
      const title = str(p.title).replace(/\s+/g, ' ').trim().slice(0, 120);
      const slug = slugify(str(p.slug).trim() || title);
      pages.push({ id: id, title: title, slug: slug, body: str(p.body), inMenu: p.inMenu === true, inFooter: p.inFooter === true, kind: pageKind(slug, title) });
    });

    const dark = lum(colors.bg) < 0.18;
    const intensity = theme.intensity === 'soft' ? 'soft' : 'vivid';
    const vivid = intensity === 'vivid';
    const v = vividColors(colors, dark);
    // Soft keeps the palette's accent for text only where it reads on the background; vivid uses
    // the accent everywhere, deepened just enough to stay readable.
    // Tint for chips, avatars and icon discs. They sit on cards, so it is mixed from the surface.
    let accentSoft = mix(colors.surface, colors.accent, dark ? 0.2 : 0.14);
    let accentInk = vivid
      ? readable(v.accentText, [accentSoft], 4.5, dark)
      : (contrast(colors.accent, colors.bg) >= 4.5 ? readable(colors.accent, [colors.bg, colors.surface, accentSoft], 4.5, dark) : colors.text);
    // The palettes are contrast-checked; the seller's colours may not leave room (a mid-tone page next
    // to white cards): whatever no longer reads falls back on a shade that does, or on the text colour.
    let errorInk = dark ? '#FF8A80' : '#B3261E';
    let textSoft = mix(colors.bg, colors.text, 0.82);
    if (paletteCustom) {
      const reads = (fg, bgs) => bgs.every((b) => contrast(fg, b) >= 4.5);
      const away = contrast('#FFFFFF', colors.text) > contrast('#000000', colors.text) ? '#FFFFFF' : '#000000';
      const shadeFor = (t) => {
        const a = mix(colors.bg, colors.text, t);
        if (contrast(colors.text, a) >= 4.5) return a;
        const b = mix(colors.bg, away, t);
        return contrast(colors.text, b) >= 4.5 ? b : colors.bg;
      };
      if (!reads(colors.text, [v.tint])) v.tint = shadeFor(0.08);
      if (!reads(colors.text, [v.tintStrong])) v.tintStrong = shadeFor(0.16);
      const grounds = [colors.bg, colors.surface, v.tint, v.tintStrong];
      if (!reads(v.accentText, grounds)) v.accentText = colors.text;
      if (!reads(v.mutedTint, [v.tint, colors.surface, colors.bg])) v.mutedTint = reads(colors.muted, [v.tint, colors.surface, colors.bg]) ? colors.muted : colors.text;
      if (!reads(v.mutedStrong, [v.tintStrong])) v.mutedStrong = colors.text;
      if (!reads(v.onAccentSoft, [colors.accent])) v.onAccentSoft = colors.onAccent;
      // secondary text also sits on the tints (a selected payment option), text on the accent's light tint
      // (a colour she chose herself is left alone: the editor and Qualité tell her when it does not read)
      const mGrounds = [colors.bg, colors.surface, v.tint, mix(colors.surface, colors.accent, dark ? 0.035 : 0.05)];
      if (!tc.set.muted && !reads(colors.muted, mGrounds)) { const mu = readable(colors.muted, mGrounds, 4.5, dark); colors.muted = reads(mu, mGrounds) ? mu : colors.text; }
      if (!reads(colors.text, [accentSoft])) accentSoft = v.tint;
      if (!reads(textSoft, [colors.bg, colors.surface, v.tint])) textSoft = colors.text;
      if (!reads(accentInk, [colors.bg, colors.surface, accentSoft])) accentInk = colors.text;
      if (!reads(errorInk, grounds)) {
        const e = readable(errorInk, grounds, 4.5, dark);
        errorInk = reads(e, grounds) ? e : colors.text;
      }
    }

    // Fallback visual when there is no product yet: the niche art, or a box in a soft accent tint.
    const leadFallback = {
      id: '', name: '', price: null, category: '', badge: null, description: '', image: null,
      art: niche && own(ART, niche.art) ? niche.art : 'box',
      color: validHex(niche && niche.color) || mix(colors.accent, '#FFFFFF', 0.72)
    };

    return {
      d: d, tpl: tpl, device: device, buttons: buttons, dark: dark,
      intensity: intensity, vivid: vivid, v: v, zones: zones,
      colorZones: custom && isObj(tc.zones) ? tc.zones : null,
      paletteCustom: paletteCustom,
      colors: colors, accentInk: accentInk, accentSoft: accentSoft, errorInk: errorInk, textSoft: textSoft,
      radius: clamp(num(radii[radiusId]) || 0, 0, 40),
      fontDisplay: (tyFonts && cleanStack(ty.displayStack)) || fontStack(pair.display, "Georgia, 'Times New Roman', serif"),
      fontText: (tyFonts && cleanStack(ty.textStack)) || fontStack(pair.text, "system-ui, -apple-system, 'Segoe UI', sans-serif"),
      displayWeight: clamp(Math.round(num(tyFonts ? ty.weight : (isObj(pair.display) ? pair.display.weight : 600)) || 600), 100, 900),
      // Heading scale (size × the font's own scale) and the text logo's scale; 1 = as before (no variable set)
      headingScale: ty && num(ty.hs) > 0 ? clamp(num(ty.hs), 0.5, 2) : 1,
      logoScale: ty && num(ty.hf) > 0 ? clamp(num(ty.hf), 0.5, 2) : 1,
      // Capitals: 'upper' or 'none' when they differ from the template's own (her choice, theme.typography.upper,
      // or a handwriting heading font, never in capitals unless she asks), else null: the template's own
      headingCase: ty ? (ty.hcase !== undefined ? ty.hcase : (ty.upperSet ? (ty.upper ? 'upper' : 'none') : null)) : null,
      // Her own fonts: a handwriting heading font is for titles only (store.css writes the prices and figures the
      // templates draw in the heading font in the text font); no fake italic, no fake bold
      headingStyle: tyFonts && ty.display && ty.display.style === 'manuscrit' ? 'manuscrit' : null,
      headingItalic: !(tyFonts && ty.italic === false),
      glyphFallback: !!(tyFonts && ty.fallbacks && ty.fallbacks.length),
      fontsCustom: tyFonts,
      rawName: str(store.name).trim(),
      brand: brandOf(cfg, tpl),
      name: str(store.name).trim() || 'Votre boutique',
      tagline: str(store.tagline).trim(),
      city: str(store.city).trim(),
      whatsapp: waOk ? wa : '',
      niche: niche,
      products: products,
      sections: sections,
      pages: pages,
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
  const go = (page, productId, pageId) => act('go', { page: page, product: productId || null, 'page-id': pageId || null });
  const goPage = (pageId) => go('page', null, pageId);

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

  // A product visual: the seller's photo if there is one, else its demo photo, else the illustration
  // on a tile of its colour. Cards, tiles, cart lines and summaries show the name next to the picture,
  // so their picture is decorative (alt=""); the product page (named) gives it the product's name.
  function media(p, cls, extra, named) {
    const inner = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + (named ? esc(p.name || (p.photo ? p.photo.alt : '')) : '') + '"' + photoAttrs(p.photo) + ' loading="lazy" decoding="async">'
      : artSVG(p.art, p.color);
    return '<div class="jst-tile' + (p.image ? ' has-photo' : '') + (cls ? ' ' + cls : '') + '" style="' + tileStyle(p.color) + '">' + inner + (extra || '') + '</div>';
  }

  // The first products inside a hero or about composition: decorative (the name is next to it).
  const leadPic = (p) => (p.image ? '<img src="' + esc(p.image) + '" alt=""' + photoAttrs(p.photo) + '>' : artSVG(p.art, p.color));

  function badge(b, d) {
    if (!b || !own(d.BADGES, b)) return '';
    return '<span class="jst-badge jst-badge--' + esc(b) + '">' + esc(d.BADGES[b]) + '</span>';
  }

  // A part of the store with colours of its own (theme.colors, sections[].settings.bg): its colours as
  // --sc-* variables on the element; store.css « CUSTOM COLOURS » puts them in place of the store's.
  const ZONE_VARS = [['bg', 'bg'], ['fg', 'fg'], ['surface', 'surface'], ['muted', 'muted'], ['tint', 'tint'], ['tint2', 'tint2'], ['line', 'line'], ['soft', 'soft'],
    ['ink', 'ink'], ['acc', 'acc'], ['onacc', 'onAcc'], ['onacc-soft', 'onAccSoft'], ['accsoft', 'accSoft']];
  function zoneVars(z) {
    if (!isObj(z) || !validHex(z.bg) || !validHex(z.fg)) return '';
    return ZONE_VARS.map((p) => '--sc-' + p[0] + ':' + (validHex(z[p[1]]) || validHex(z.fg))).join(';');
  }
  function sectionOpen(s, extraCls) {
    const zv = s.zone ? zoneVars(s.zone) : '';
    const bt = s.button && validHex(s.button.bg) && validHex(s.button.fg) ? '--sc-hbtn-bg:' + validHex(s.button.bg) + ';--sc-hbtn-fg:' + validHex(s.button.fg) : '';
    if (!zv && !bt) {
      return '<section class="jst-sec jst-sec--' + s.type + (s.tint ? ' jst-sec--tint' : '') + (extraCls ? ' ' + extraCls : '') + '" data-section-id="' + esc(s.id) + '" data-section-type="' + s.type + '">';
    }
    return '<section class="jst-sec jst-sec--' + s.type + (s.tint ? ' jst-sec--tint' : '') + (extraCls ? ' ' + extraCls : '') +
      (zv ? ' jst-sec--cbg jst-cz' + (s.zone.dark ? ' jst-cz--dark' : '') : '') + (bt ? ' jst-sec--cbtn' : '') +
      '" data-section-id="' + esc(s.id) + '" data-section-type="' + s.type + '" style="' + [zv, bt].filter(Boolean).join(';') + '">';
  }
  // The header's and the footer's own colours: ' jst-cz" style="…' to close their class attribute
  function zoneCls(m, which) {
    const z = m.colorZones ? m.colorZones[which] : null;
    const zv = z ? zoneVars(z) : '';
    return zv ? ' jst-cz' + (z.dark ? ' jst-cz--dark' : '') + '" style="' + zv : '';
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

  /* ------------------------------------------------------------------ the store's logo (store.logo…) */

  // The brand of the fiche (JEERE_DATA.brand), or null when it has neither a logo nor a place of its
  // own for it: the header, the footer and the checkout then draw the name exactly as before.
  function brandOf(cfg, tpl) {
    const d = DATA();
    if (!d || typeof d.brand !== 'function') return null;
    try {
      const b = d.brand(cfg, tpl);
      return b && (b.logo || b.positionSet) ? b : null;
    } catch (e) { return null; }
  }
  // The widest and tallest logo, by place and device (px): it never pushes the menu or the bag out.
  const LOGO_MAX_W = {
    header: { phone: 200, desktop: 360 }, headerName: { phone: 120, desktop: 220 },
    checkout: { phone: 150, desktop: 260 }, footer: { phone: 220, desktop: 260 }
  };
  const LOGO_MAX_H = { checkout: { phone: 36, desktop: 48 }, footer: { phone: 48, desktop: 56 } };
  // The logo's <img>, at its size for the place, never stretched. alt: the store name, unless it is written next to it.
  function logoImg(m, where, withName) {
    const b = m.brand;
    const dev = m.device === 'desktop' ? 'desktop' : 'phone';
    const maxW = LOGO_MAX_W[withName && where === 'header' ? 'headerName' : where][dev];
    const capH = LOGO_MAX_H[where] ? LOGO_MAX_H[where][dev] : 0;
    let box = typeof b.logoBox === 'function' ? b.logoBox(dev, maxW) : null;
    if (box && capH && box.height > capH) box = { width: Math.max(1, Math.round(box.width * capH / box.height)), height: capH };
    const d = DATA();
    const h = Math.min(capH || 999, d && typeof d.logoHeight === 'function' ? d.logoHeight(b.size, dev) : 40);
    const style = box ? 'width:' + box.width + 'px;height:' + box.height + 'px' : 'height:' + h + 'px;max-width:' + maxW + 'px';
    return '<img class="jst-logo-img" src="' + esc(b.logo) + '" alt="' + (withName ? '' : esc(m.name)) + '"' +
      (box ? ' width="' + box.width + '" height="' + box.height + '"' : '') + ' style="' + style + '" decoding="async">';
  }
  // What the logo link holds: the name (as before), or the logo, with the name next to it when asked.
  function logoInner(m, where) {
    const b = m.brand;
    if (!b || !b.logo) return esc(m.name);
    return logoImg(m, where, b.showName) + (b.showName ? '<span class="jst-logo-name">' + esc(m.name) + '</span>' : '');
  }
  function logoCls(m) {
    const b = m.brand;
    if (b && b.logo) return ' has-img' + (b.showName ? ' has-name' : '');
    return m.rawName ? '' : ' is-placeholder';
  }
  // A place chosen by the seller that differs from the template's: a class on the header
  function posCls(m) {
    const b = m.brand;
    if (!b || !b.positionSet) return '';
    const d = DATA();
    const def = d && d.LOGO_DEFAULT_POSITION ? d.LOGO_DEFAULT_POSITION[m.tpl] : null;
    return b.position !== def ? ' jst-header--logo-' + b.position : '';
  }

  /* ------------------------------------------------------------------ header and footer */

  const NAV_LABELS = { products: 'Boutique', categories: 'Catégories', reviews: 'Avis', about: 'À propos', delivery: 'Livraison', whatsapp: 'Contact' };

  const NAV_MAX = 5;
  const ptitle = (p) => (p.title ? esc(fr(p.title)) : '<span class="jst-muted-inline">Page sans titre</span>');
  const isCurPage = (j, p) => !!j && j.page === 'page' && j.pageId === p.id;

  // Desktop nav: the section links (to the home page), then the pages the seller put in the menu,
  // 5 links at most. A page wins over a section link with the same name (« À propos », « Contact »);
  // the first section link (the way back to the shop) always stays.
  function navItems(m) {
    const pages = m.pages.filter((p) => p.inMenu);
    const taken = {};
    pages.forEach((p) => { if (p.slug) taken[p.slug] = true; });
    const secs = [];
    const seen = {};
    m.sections.forEach((s) => {
      const label = NAV_LABELS[s.type];
      if (label && !seen[label] && !taken[slugify(label)] && secs.length < 4) { seen[label] = true; secs.push(label); }
    });
    if (!secs.length) secs.push('Boutique');
    const shownPages = pages.slice(0, NAV_MAX - 1);
    return secs.slice(0, NAV_MAX - shownPages.length).map((label) => ({ label: label })).concat(shownPages.map((p) => ({ page: p })));
  }

  function header(m, j) {
    const items = navItems(m);
    const count = j ? j.count : 0;
    const bagLabel = count ? 'Panier, ' + plural(count, 'article', 'articles') : 'Panier';
    const phone = m.device === 'phone';
    const open = phone && !!j && j.menu;
    const menuId = 'jst' + (j ? j.uid : 0) + '-menu';
    const nav = phone ? '' : '<nav class="jst-nav" aria-label="Menu de la boutique" data-count="' + items.length + '">' + items.map((it, i) => {
      if (it.page) {
        const cur = isCurPage(j, it.page);
        return '<a class="jst-nav-link jst-nav-link--page' + (cur ? ' is-current" aria-current="page' : '') + '"' + goPage(it.page.id) + '><span class="jst-nav-txt">' + ptitle(it.page) + '</span></a>';
      }
      const cur = i === 0 && !!j && j.page === 'home';
      return '<a class="jst-nav-link' + (cur ? ' is-current" aria-current="page' : '') + '"' + go('home') + '>' + esc(it.label) + '</a>';
    }).join('') + '</nav>';
    const menuBtn = phone
      ? '<button type="button" class="jst-icon-btn jst-menu' + (open ? ' is-open' : '') + '" aria-label="' + (open ? 'Fermer le menu' : 'Menu') + '" aria-expanded="' + open + '" aria-controls="' + menuId + '" tabindex="-1"' + act('menu') + '>' + icon(open ? 'close' : 'menu') + '</button>'
      : '<button type="button" class="jst-icon-btn jst-menu" aria-label="Menu" tabindex="-1">' + icon('menu') + '</button>';
    return '<header class="jst-header' + posCls(m) + (open ? ' is-menu-open' : '') + zoneCls(m, 'header') + '"><div class="jst-wrap jst-header-in">' + menuBtn +
      '<a class="jst-logo' + logoCls(m) + '"' + go('home') + '>' + logoInner(m, 'header') + '</a>' + nav +
      '<div class="jst-header-actions">' +
      '<button type="button" class="jst-icon-btn jst-search" aria-label="Rechercher" tabindex="-1">' + icon('search') + '</button>' +
      '<button type="button" class="jst-icon-btn jst-bag' + (j && j.page === 'cart' ? ' is-current' : '') + '" aria-label="' + esc(bagLabel) + '" tabindex="-1"' + go('cart', j && j.page === 'product' ? j.productId : null) + '>' + icon('bag') +
      (count ? '<span class="jst-bag-n" aria-hidden="true">' + (count > 99 ? '99+' : count) + '</span>' : '') + '</button>' +
      '</div></div>' + (open ? drawer(m, j, menuId) : '') + '</header>';
  }

  // Phone: the menu icon opens a small menu inside the preview, under the header: home, the pages
  // the seller put in the menu, the cart, and the WhatsApp number when there is one.
  function drawer(m, j, menuId) {
    const link = (label, attrs, cur, extra) => '<li><a class="jst-drawer-link' + (cur ? ' is-current" aria-current="page' : '') + '"' + attrs + '>' +
      '<span class="jst-drawer-label">' + label + '</span>' + (extra || '') + icon('chevron', 'jst-drawer-chev') + '</a></li>';
    const items = [link('Accueil', go('home'), j.page === 'home')];
    m.pages.filter((p) => p.inMenu).forEach((p) => items.push(link(ptitle(p), goPage(p.id), isCurPage(j, p))));
    items.push(link('Panier', go('cart'), j.page === 'cart', j.count ? '<span class="jst-drawer-n" aria-label="' + esc(plural(j.count, 'article', 'articles')) + '">' + (j.count > 99 ? '99+' : j.count) + '</span>' : ''));
    const wa = m.whatsapp
      ? '<a class="jst-drawer-wa"' + act('wa') + '>' + icon('chat') + '<span>Une question' + NBSP + '? <b>' + esc(prettyPhone(m.whatsapp)) + '</b></span></a>'
      : '';
    return '<div class="jst-drawer" id="' + menuId + '"><nav class="jst-wrap jst-drawer-in" aria-label="Menu de la boutique">' +
      '<ul class="jst-drawer-list">' + items.join('') + '</ul>' + wa + '</nav></div>' +
      '<button type="button" class="jst-drawer-scrim" aria-label="Fermer le menu" tabindex="-1"' + act('menu') + '></button>';
  }

  // Checkout: logo, « Paiement sécurisé » and a way back to the cart, nothing to wander off to.
  function headerCheckout(m) {
    return '<header class="jst-header jst-header--co' + zoneCls(m, 'header') + '"><div class="jst-wrap jst-co-head">' +
      '<a class="jst-co-back"' + go('cart') + ' aria-label="Retour au panier">' + icon('back') + '<span>Panier</span></a>' +
      '<a class="jst-logo' + logoCls(m) + '"' + go('home') + '>' + logoInner(m, 'checkout') + '</a>' +
      '<span class="jst-secure">' + icon('lock') + '<span>Paiement sécurisé</span></span>' +
      '</div></header>';
  }

  // « Propulsé par Jeere »: the Jeere cloud, a simplified trace of the hand-drawn mark (it is drawn 12 px tall, ~2.7KB)
  // inline in currentColor, so the store never depends on the builder's SVG symbols.
  const JEERE_MARK = '<svg class="jst-powered-mark" viewBox="0 0 600 446" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path fill-rule="evenodd" d="M159 439C124 431 112 426 80 402C67 393 54 386 51 387C44 388 24 363 21 349C19 342 17 338 15 338C13 338 0 279 0 269C0 268 2 267 5 268C9 270 11 266 13 257C16 241 49 204 68 195C77 191 81 187 81 180C82 158 83 153 100 131C117 108 144 90 163 90C169 90 174 84 182 67C212 4 276 -15 332 22C345 30 351 31 375 32C413 32 423 39 435 72C438 81 439 82 452 78C492 67 526 96 525 140C525 163 525 163 542 168C616 188 617 343 543 407C509 435 443 447 411 430C400 425 397 425 373 431C346 438 290 434 280 424C274 418 267 419 255 428C232 445 202 448 159 439ZM339 392C358 388 362 382 354 365C346 348 350 340 369 339C377 338 386 337 388 336C396 333 410 347 418 363C426 381 436 385 459 378C539 357 583 280 542 235C530 222 518 219 523 230C524 233 523 237 521 240C519 244 518 243 518 235C518 230 516 225 514 225C512 225 510 230 510 236C510 246 505 251 495 251C493 251 487 247 481 241C475 235 468 231 466 232C463 232 461 230 461 227C461 224 458 221 454 221C447 221 440 206 444 199C446 197 445 195 443 195C441 195 439 193 439 191C439 189 441 188 445 189C450 191 465 184 465 179C465 174 444 176 439 181C434 185 434 185 438 179C441 175 450 172 462 172C492 170 499 134 472 124C457 119 441 119 444 124C446 126 445 128 443 128C434 128 427 140 430 152C432 166 429 181 424 178C422 177 421 174 422 171C424 167 423 165 420 165C418 165 416 168 416 171C416 174 413 178 409 181C405 183 401 189 401 193C401 200 400 200 396 195C394 191 390 189 387 190C385 191 382 189 382 186C382 183 380 180 376 180C370 180 370 180 376 175C380 172 382 167 382 164C382 154 372 157 368 168C366 175 364 176 364 171C364 168 368 160 374 155C384 145 392 129 396 110C399 100 381 82 370 83C357 85 354 104 364 115C372 124 369 128 361 119C355 113 355 121 360 131C366 142 346 155 341 145C339 142 335 139 332 139C329 139 326 137 326 134C326 130 326 130 323 134C317 145 304 119 304 94C304 66 300 58 283 55C237 48 205 86 223 129C230 146 230 161 223 164C221 165 217 169 216 173C210 196 191 185 175 149C170 137 167 136 151 146C133 157 129 195 145 201C153 203 171 236 165 236C163 236 161 235 161 232C161 230 159 229 157 229C155 229 154 232 155 236C159 247 149 256 135 255C95 252 96 252 87 270C59 324 110 379 188 379C220 379 221 378 218 372C215 366 215 364 221 362C226 360 229 355 231 344C238 302 281 310 281 354C281 376 292 390 309 391C314 392 317 393 316 395C315 397 316 398 320 396C323 395 332 393 339 392ZM416 368C416 367 413 361 409 354C401 342 398 350 405 364C409 371 416 374 416 368ZM556 318C562 306 566 293 565 288C564 281 563 283 559 296C556 306 550 318 545 325C535 338 534 343 541 340C544 339 550 329 556 318ZM253 292C244 283 241 246 247 227C264 178 305 213 292 265C284 298 268 309 253 292ZM347 288C326 263 338 199 363 199C385 199 398 234 388 271C380 302 364 308 347 288Z"/></svg>';
  const powered = () => '<span class="jst-powered"><span class="jst-powered-by">Propulsé par</span>' + JEERE_MARK + '<b>Jeere</b></span>';

  function footer(m, j) {
    const fpages = m.pages.filter((p) => p.inFooter);
    const pagesCol = fpages.length
      ? '<div class="jst-footer-col jst-footer-pages"><h3 class="jst-footer-h">Informations</h3><ul class="jst-footer-links">' +
        fpages.map((p) => '<li><a class="jst-footer-link' + (isCurPage(j, p) ? ' is-current" aria-current="page' : '') + '"' + goPage(p.id) + '>' + ptitle(p) + '</a></li>').join('') +
        '</ul></div>'
      : '';
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
    return '<footer class="jst-footer' + zoneCls(m, 'footer') + '"><div class="jst-wrap">' +
      '<div class="jst-footer-top" data-cols="' + (pagesCol ? 4 : 3) + '">' +
      '<div class="jst-footer-brand">' + (m.brand && m.brand.logo
        ? '<p class="jst-footer-logo">' + logoImg(m, 'footer', m.brand.showName) + '</p>' + (m.brand.showName ? '<p class="jst-h jst-footer-name">' + esc(m.name) + '</p>' : '')
        : '<p class="jst-h jst-footer-name">' + esc(m.name) + '</p>') +
      (m.tagline ? '<p class="jst-footer-tag">' + line(m.tagline) + '</p>' : '') + '</div>' +
      pagesCol +
      '<div class="jst-footer-col"><h3 class="jst-footer-h">Moyens de paiement</h3>' + chips + '</div>' +
      '<div class="jst-footer-col"><h3 class="jst-footer-h">Nous trouver</h3>' + contact.join('') + '</div>' +
      '</div>' +
      '<div class="jst-footer-bottom"><span>©' + NBSP + esc(m.name) + '</span>' + powered() + '</div>' +
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
    const pic = sectionImage(st);
    const img = pic ? pic.src : null;
    const p = m.lead;
    const imgTag = img ? '<img class="jst-hero-img" src="' + esc(img) + '" alt=""' + photoAttrs(pic) + ' decoding="async">' : '';

    if (m.tpl === 'cocody') {
      const visual = img
        ? '<div class="jst-hero-photo">' + imgTag + '</div>'
        : '<div class="jst-hero-circle" style="' + tileStyle(p.color) + '">' + leadPic(p) + '</div>';
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
        : '<div class="jst-hero-block" style="' + tileStyle(p.color) + '">' + leadPic(p) + '</div>';
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

    // Plateau: a large stage. With a photo, the text sits on a dark ground beside it (desktop) or under it
    // (phone), never on the photo (store.css); without, the arch composition with the text over its tile.
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
        '<div class="jst-hero-art"><div class="jst-arch">' + leadPic(p) + '</div>' + cap + '</div>' +
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
      // Quick add (× 1) feeds the cart journey; the rest of the card opens the product page.
      btn('Ajouter', { size: 'sm', icon: 'bag', block: true, cls: 'jst-card-btn', attrs: act('add', { product: p.id, quick: 1 }) + ' aria-label="' + esc('Ajouter ' + (p.name || 'ce produit') + ' au panier') + '"' }) +
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

  // pic: the section's image or demo photo ({ src, focus }), else a composition of the first products.
  function aboutVisual(m, pic) {
    if (pic) return '<div class="jst-about-media has-img"><img src="' + esc(pic.src) + '" alt=""' + photoAttrs(pic) + ' loading="lazy" decoding="async"></div>';
    const a = m.lead, b = m.second;
    const t = tileColors(a.color);
    const art = (p, cls) => '<div class="jst-about-art ' + cls + '">' + leadPic(p) + '</div>';
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
    return sectionOpen(s) + '<div class="jst-wrap jst-about">' + aboutVisual(m, sectionImage(st)) +
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

  // Sub-total, delivery (the chosen commune's fee) and total. No commune yet: « À choisir » on the
  // checkout, « À confirmer » elsewhere (a store without delivery zones settles it on WhatsApp).
  function totals(j) {
    const z = j.zone;
    const fee = !z
      ? '<span class="jst-price is-empty">' + (j.needZone ? 'À choisir' : 'À confirmer') + '</span>'
      : (z.fee === 0 ? '<span class="jst-price jst-free">Offerte</span>' : (z.fee === null ? '<span class="jst-price is-empty">À confirmer</span>' : priceHTML(z.fee)));
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
  function journey(m, rootEl, page, productId, pageId) {
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
    // The commune is the shopper's choice: never preselected (its fee would sit in the total
    // unseen), except when the store delivers to a single zone. The confirmation page, opened
    // straight from the editor, shows the first zone as an example.
    const zone = m.zones.find((z) => z.name === form.commune) ||
      ((m.zones.length === 1 || page === 'confirmation') ? m.zones[0] || null : null);
    const fee = zone && typeof zone.fee === 'number' ? zone.fee : 0;
    const pay = m.payments.find((p) => p.key === form.pay) || m.payments[0] || null;

    let product = null;
    if (page === 'product') product = pid ? byId[pid] : (m.products[0] || null);
    const pq = isObj(rootEl.__jstQty) ? rootEl.__jstQty : null;
    const pdpQty = product && pq && pq.id === product.id ? clamp(Math.round(num(pq.n) || 1), QTY_MIN, QTY_MAX) : 1;

    // A custom page: the one asked for, else the first one (like the product page).
    let customPage = null;
    if (page === 'page') customPage = m.pages.find((p) => p.id === pageId) || m.pages[0] || null;

    if (!rootEl.__jstUid) rootEl.__jstUid = ++UID;
    if (page !== 'checkout' || zone) rootEl.__jstErr = null;
    return {
      page: page, product: product, productId: product ? product.id : pid, uid: rootEl.__jstUid,
      customPage: customPage, pageId: customPage ? customPage.id : null,
      menu: m.device === 'phone' && rootEl.__jstMenu === true,
      cart: cart, lines: lines, count: count, subtotal: subtotal,
      form: form, zone: zone, fee: fee, total: subtotal + fee, pay: pay, pdpQty: pdpQty,
      needZone: page === 'checkout' && !zone && m.zones.length > 0 && m.payments.length > 0,
      err: isObj(rootEl.__jstErr) ? rootEl.__jstErr : {},
      peek: !!rootEl.__jstPeek
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
    let endTint = false;
    for (; i < m.sections.length; i++) {
      const s = m.sections[i];
      if (m.vivid && PLAIN[s.type]) { s.tint = !s.zone && plain % 2 === 0; plain++; }
      body.push(renderSection(m, s));
      endTint = !!s.tint;
    }
    if (!body.length) {
      body.push('<div class="jst-wrap jst-page-empty">' + empty('Votre page est vide pour l’instant. Activez ou ajoutez une section pour la remplir.') + '</div>');
    }
    out.push('<main class="jst-main jst-main--home' + (endTint ? ' jst-main--end-tint' : '') + '">' + body.join('') + '</main>');
    out.push(footer(m, j));
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
      '<div class="jst-pdp-media">' + media(p, 'jst-pdp-tile', badge(p.badge, m.d), true) + '</div>' +
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
    const title = '<h1 class="jst-h jst-page-title">Finaliser ma commande</h1>';
    if (!j.lines.length) {
      return '<div class="jst-wrap jst-co">' + steps(2) + title + empty('Votre panier est vide. Ajoutez un produit pour passer commande.') +
        '<div class="jst-co-alone">' + btn('Retour à la boutique', { size: 'lg', attrs: go('home') }) + '</div></div>';
    }
    const noPay = !m.payments.length;
    const recap = '<ul class="jst-mini-lines">' + j.lines.map((l) => miniLine(l, false)).join('') + '</ul>' + totals(j);
    // Phone: what am I paying, before anything else (folded, like real mobile checkouts).
    const peek = m.device === 'phone' && !noPay
      ? '<details class="jst-co-peek"' + (j.peek ? ' open' : '') + '><summary class="jst-co-peek-bar"' + act('peek') + '>' +
        '<span class="jst-co-peek-bag">' + icon('bag') + '<span class="jst-co-peek-n" aria-hidden="true">' + (j.count > 99 ? '99+' : j.count) + '</span></span>' +
        '<span class="jst-co-peek-label"><span class="jst-co-peek-show">Voir ma commande</span><span class="jst-co-peek-hide">Masquer ma commande</span>' +
        '<span class="jst-vh"> (' + plural(j.count, 'article', 'articles') + ')</span></span>' +
        priceHTML(j.total) + icon('down', 'jst-co-peek-chev') + '</summary>' +
        '<div class="jst-co-peek-body">' + recap + '</div></details>'
      : '';
    const field = (id, label, control, help) => '<div class="jst-field jst-field--' + id + '"><label class="jst-label" for="' + uid + id + '">' + label + '</label>' + control +
      (help ? '<p class="jst-help">' + help + '</p>' : '') + '</div>';
    const block = (n, heading, body) => '<section class="jst-co-block"><h2 class="jst-co-h"><span class="jst-co-n" aria-hidden="true"><span class="jst-co-n0">0</span>' + n + '</span><span>' + heading + '</span></h2>' + body + '</section>';

    const contact = block(1, 'Vos coordonnées', '<div class="jst-fields">' +
      field('first', 'Prénom', '<input class="jst-input" id="' + uid + 'first" type="text" autocomplete="given-name" maxlength="40" placeholder="Ex.' + NBSP + ': Awa" tabindex="-1" data-jst-field="first" value="' + esc(f.first) + '">') +
      field('phone', 'Numéro WhatsApp', '<div class="jst-input-group"><span class="jst-prefix" aria-hidden="true">+225</span>' +
        '<input class="jst-input" id="' + uid + 'phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="07 07 12 34 56" tabindex="-1" data-jst-field="phone" value="' + esc(f.phone) + '"></div>',
      'Pour confirmer la commande et suivre la livraison.') +
      '</div>');

    const zoneErr = j.needZone && !!j.err.commune;
    const opts = (j.zone ? '' : '<option value="" selected disabled>Choisissez votre commune</option>') +
      m.zones.map((z) => '<option value="' + esc(z.name) + '"' + (j.zone && z.name === j.zone.name ? ' selected' : '') + '>' +
        esc(z.name) + ' — ' + feeText(z.fee) + '</option>').join('');
    const commune = m.zones.length
      ? field('commune', 'Commune', '<div class="jst-select' + (j.zone ? '' : ' is-empty') + (zoneErr ? ' is-invalid' : '') + '"><select class="jst-input" id="' + uid + 'commune" tabindex="-1" data-jst-field="commune"' +
          (zoneErr ? ' aria-invalid="true" aria-describedby="' + uid + 'commune-err"' : '') + '>' + opts + '</select>' + icon('down') + '</div>' +
          (zoneErr ? '<p class="jst-error" id="' + uid + 'commune-err">' + icon('pin') + '<span>Choisissez votre commune' + NBSP + ': elle fixe les frais de livraison.</span></p>' : ''))
      : '';
    const eta = j.needZone
      ? '<p class="jst-eta is-empty">' + icon('clock') + '<span>Choisissez votre commune pour voir les frais et le délai.</span></p>'
      : '<p class="jst-eta">' + icon('clock') + '<span>Livraison estimée' + NBSP + ': <b>sous 24' + NBSP + 'h' + (j.zone ? ' à ' + esc(j.zone.name) : '') + '</b>, du lundi au samedi.</span></p>';
    const delivery = block(2, 'Livraison', commune +
      field('address', 'Adresse et repère', '<textarea class="jst-input jst-textarea" id="' + uid + 'address" rows="3" maxlength="240" placeholder="Quartier, repère' + NBSP + ': ex. près de la pharmacie" tabindex="-1" data-jst-field="address">' + esc(f.address) + '</textarea>') +
      eta);

    const payBlock = block(3, 'Paiement', '<div class="jst-pay" role="radiogroup" aria-label="Moyen de paiement">' + m.payments.map((p) => {
      const on = !!j.pay && j.pay.key === p.key;
      return '<button type="button" class="jst-pay-opt' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="-1"' + act('pay', { pay: p.key }) + '>' +
        '<span class="jst-radio" aria-hidden="true"></span>' +
        '<span class="jst-pay-body"><span class="jst-pay-label">' + esc(p.label) + '</span>' + (p.hint ? '<span class="jst-pay-hint">' + esc(fr(p.hint)) + '</span>' : '') + '</span>' +
        '<span class="jst-pay-ico" aria-hidden="true">' + icon(p.icon) + '</span></button>';
    }).join('') + '</div>');

    // No method enabled: the page speaks to the shopper (the editor tells the seller what to do).
    const main = noPay
      ? '<div class="jst-co-main"><div class="jst-co-none">' + '<span class="jst-empty-ico" aria-hidden="true">' + icon('chat') + '</span>' +
        '<p class="jst-h jst-co-none-title">Le paiement en ligne arrive bientôt</p>' +
        '<p>Passez votre commande sur WhatsApp' + NBSP + ': ' + esc(m.name) + ' vous répond et vous indique comment payer.</p></div></div>'
      : '<div class="jst-co-main">' + contact + delivery + payBlock + '</div>';

    const summary = '<aside class="jst-summary jst-co-summary">' +
      '<div class="jst-summary-head"><h2 class="jst-h jst-summary-title">Votre commande</h2><a class="jst-link"' + go('cart') + '>Modifier</a></div>' +
      recap + '</aside>';

    const cod = !!j.pay && j.pay.key === 'cod';
    const label = cod ? 'Confirmer la commande' : 'Payer ' + money(j.needZone ? j.subtotal : j.total) + (j.needZone ? ' + livraison' : '');
    let note = '';
    if (cod) note = j.needZone ? 'Vous paierez le livreur à la réception, livraison comprise.' : 'Vous paierez ' + money(j.total) + ' au livreur, à la réception.';
    else if (j.pay && j.pay.key === 'card') note = 'Vous saisirez votre carte sur la page sécurisée de notre partenaire.';
    else if (j.pay) {
      note = 'Vous recevrez une demande ' + (j.needZone ? 'de paiement' : 'de ' + money(j.total)) + ' sur votre téléphone (' + esc(j.pay.label) + '). ' +
        'Validez-la avec votre code secret' + NBSP + ': ne le donnez jamais, ni au vendeur ni au livreur.';
    }
    const actions = '<div class="jst-co-actions">' +
      (noPay ? '' :
        btn(label, { size: 'lg', block: true, icon: cod ? 'check' : 'lock', cls: 'jst-pay-btn', attrs: act('order') }) +
        '<p class="jst-pay-note">' + note + '</p>' +
        '<p class="jst-or"><span>ou</span></p>') +
      btn('Commander sur WhatsApp', { size: 'lg', block: true, icon: 'chat', cls: noPay ? '' : 'jst-btn--ghost', attrs: act('wa') }) +
      (noPay ? '' : '<p class="jst-trust">' + icon('shield') + '<span>Paiement traité par un partenaire agréé par la BCEAO. Jeere ne garde jamais votre argent.</span></p>') +
      '</div>';

    return '<div class="jst-wrap jst-co">' + steps(2) + peek + title + '<div class="jst-co-grid' + (noPay ? ' is-nopay' : '') + '">' + main +
      '<div class="jst-co-side">' + summary + actions + '</div></div></div>';
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
      '<p class="jst-ok-eta">' + icon('truck') + '<span>Livraison prévue sous 24' + NBSP + 'h' + (j.zone ? ' à ' + esc(j.zone.name) : '') + '. Le livreur vous appelle avant de passer.' +
      (phone ? ' Le récapitulatif vous est envoyé sur WhatsApp au +225' + NBSP + esc(phone) + '.' : '') + '</span></p>' +
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

  /* ------------------------------------------------------------------ custom pages
   * À propos, Livraison et retours, Contact, Conditions de vente… : the seller's title and text in
   * the template's style. The Contact page adds a WhatsApp block, the delivery page the fees by
   * commune (the same zones as the checkout). On desktop, a side list leads to the other pages.
   */

  function pageContact(m, j) {
    const tid = 'jst' + j.uid + '-cpwa';
    if (!m.whatsapp) {
      return '<section class="jst-cp-extra jst-cp-wa is-empty">' +
        empty('Ajoutez votre numéro WhatsApp' + NBSP + ': vos clients pourront vous écrire en un clic depuis cette page.') + '</section>';
    }
    return '<section class="jst-cp-extra jst-cp-wa jst-on-accent" aria-labelledby="' + tid + '">' +
      '<span class="jst-cp-wa-deco jst-cp-wa-deco--a" aria-hidden="true"></span><span class="jst-cp-wa-deco jst-cp-wa-deco--b" aria-hidden="true"></span>' +
      '<span class="jst-cp-wa-ico" aria-hidden="true">' + icon('chat') + '</span>' +
      '<div class="jst-cp-wa-copy">' +
      '<h2 class="jst-h jst-cp-wa-title" id="' + tid + '">Écrivez-nous sur WhatsApp</h2>' +
      '<p class="jst-cp-wa-text">Une question sur un produit, une commande ou une livraison' + NBSP + '? ' + esc(m.name) + ' vous répond directement.</p>' +
      '</div>' +
      '<div class="jst-cp-wa-cta">' + btn('Écrire sur WhatsApp', { icon: 'chat', size: 'lg', cls: 'jst-cp-wa-btn', attrs: act('wa') }) +
      '<p class="jst-cp-wa-num">' + esc(prettyPhone(m.whatsapp)) + '</p></div>' +
      (m.city ? '<p class="jst-cp-wa-city">' + icon('pin') + '<span>' + esc(m.city) + '</span></p>' : '') +
      '</section>';
  }

  function pageZones(m) {
    if (!m.zones.length) return '';
    const list = '<ul class="jst-zones' + (m.zones.length > 6 ? ' is-many' : '') + '">' + m.zones.map((z) => {
      const fee = z.fee === 0 ? '<span class="jst-price jst-free">Offerte</span>' : priceHTML(z.fee);
      return '<li class="jst-zone"><span class="jst-zone-name">' + esc(z.name) + '</span><span class="jst-zone-dots" aria-hidden="true"></span>' + fee + '</li>';
    }).join('') + '</ul>';
    const notes = ['<span>' + icon('clock') + 'Livraison sous 24' + NBSP + 'h, du lundi au samedi</span>'];
    if (m.cod) notes.push('<span>' + icon('cash') + 'Paiement à la livraison possible</span>');
    return '<section class="jst-cp-extra jst-cp-zones"><h2 class="jst-h jst-cp-h2">Frais de livraison par commune</h2>' + list +
      '<p class="jst-delivery-notes">' + notes.join('') + '</p></section>';
  }

  function pageCustom(m, j) {
    const pg = j.customPage;
    if (!pg) {
      return '<div class="jst-wrap jst-page-pad">' + backLink('Retour à la boutique', 'home') +
        empty('Créez une page (À propos, Livraison, Contact…) dans le tableau de bord' + NBSP + ': elle apparaîtra ici, dans le menu ou en bas de la boutique.') + '</div>';
    }
    const desktop = m.device === 'desktop';
    const nav = desktop
      ? crumbs([{ label: 'Accueil', page: 'home' }, { label: pg.title || 'Page sans titre' }])
      : backLink('Retour à la boutique', 'home');
    const kickerCls = m.tpl === 'cocody' ? 'jst-pill' : (m.tpl === 'treichville' ? 'jst-tag' : 'jst-kicker');
    const body = textBlocks(pg.body, m.pages.filter((p) => p.id !== pg.id));
    const extra = pg.kind === 'contact' ? pageContact(m, j) : (pg.kind === 'delivery' ? pageZones(m) : '');
    const bodyHTML = body
      ? '<div class="jst-cp-body">' + body + '</div>'
      : '<div class="jst-cp-body is-empty">' + empty('Cette page est vide pour l’instant. Écrivez son texte dans le tableau de bord, rubrique Pages.') + '</div>';
    // Desktop: the store's other pages beside the text, like a help centre.
    const others = m.pages.filter((p) => p.inMenu || p.inFooter || p.id === pg.id);
    const side = desktop && others.length > 1
      ? '<aside class="jst-cp-side"><nav aria-label="Informations"><p class="jst-cp-side-h">Informations</p><ul class="jst-cp-side-list">' +
        others.map((p) => '<li><a class="jst-cp-side-link' + (p.id === pg.id ? ' is-current" aria-current="page' : '') + '"' + goPage(p.id) + '>' + ptitle(p) + '</a></li>').join('') +
        '</ul></nav></aside>'
      : '';
    return '<div class="jst-wrap jst-cp-nav">' + nav + '</div>' +
      '<article class="jst-cp jst-cp--' + pg.kind + (side ? ' has-side' : '') + '" data-page-id="' + esc(pg.id) + '">' +
      '<header class="jst-cp-head"><div class="jst-wrap jst-cp-head-in">' +
      '<span class="jst-blob jst-blob--a" aria-hidden="true"></span><span class="jst-blob jst-blob--b" aria-hidden="true"></span>' +
      '<p class="' + kickerCls + ' jst-cp-kicker">' + esc(m.name) + '</p>' +
      '<h1 class="jst-h jst-cp-title" data-len="' + titleLen(pg.title) + '">' + ptitle(pg) + '</h1></div></header>' +
      '<div class="jst-wrap jst-cp-in">' + side +
      '<div class="jst-cp-content">' + bodyHTML + extra +
      '<p class="jst-cp-more"><a class="jst-link"' + go('home') + '>Voir la boutique' + icon('arrow') + '</a></p></div>' +
      '</div></article>';
  }

  const PAGE_RENDERERS = { product: pageProduct, cart: pageCart, checkout: pageCheckout, confirmation: pageConfirmation, page: pageCustom };

  function renderPage(m, j) {
    if (j.page === 'home') return pageHome(m, j);
    let main;
    try {
      main = PAGE_RENDERERS[j.page](m, j);
    } catch (e) {
      main = '<div class="jst-wrap jst-page-empty">' + empty('Cette page n’a pas pu être affichée. Vérifiez la fiche boutique.') + '</div>';
    }
    // On the confirmation the order is placed: the bag shows empty (the cart itself is cleared by « Retour à la boutique »).
    const out = j.page === 'checkout' ? [headerCheckout(m)] : leadingAnnouncements(m).concat([header(m, j.page === 'confirmation' ? Object.assign({}, j, { count: 0 }) : j)]);
    out.push('<main class="jst-main jst-main--' + j.page + '">' + main + '</main>');
    out.push(footer(m, j));
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
    render(v.config, rootEl, { device: v.device, page: v.page, productId: v.productId, pageId: v.pageId });
  }

  // Desktop nav: when the links do not fit beside the logo (a long store name), the templates hide
  // the overflow; the seller's pages must stay, so section links give way first (never the first).
  function fitNav(rootEl) {
    try {
      const nav = rootEl.querySelector('.jst-header .jst-nav');
      if (!nav || !nav.offsetWidth || !nav.querySelector('.jst-nav-link--page')) return;
      const head = rootEl.querySelector('.jst-header-in');
      const pagesOut = () => {
        const links = Array.prototype.slice.call(nav.children);
        const top = links.length ? links[0].offsetTop : 0;
        const nr = nav.getBoundingClientRect();
        const crowded = head && head.scrollWidth > head.clientWidth + 1;
        return crowded || links.some((l) => {
          if (!l.classList.contains('jst-nav-link--page')) return false;
          const r = l.getBoundingClientRect();
          return l.offsetTop !== top || r.right > nr.right + 1 || r.left < nr.left - 1;
        });
      };
      // 1. section links give way, from the last one; 2. tighter links; 3. the first section link too.
      for (let step = 0; step < 8 && pagesOut(); step++) {
        const secs = Array.prototype.filter.call(nav.children, (l) => !l.classList.contains('jst-nav-link--page'));
        if (secs.length > 1) secs[secs.length - 1].remove();
        else if (!nav.classList.contains('is-tight')) { nav.classList.add('is-tight'); if (head) head.classList.add('is-tight'); }
        else if (secs.length === 1) secs[0].remove();
        else break;
        nav.setAttribute('data-count', String(nav.children.length));
      }
    } catch (e) { /* the nav is a nicety */ }
  }

  // Phone menu: open or close it, keeping the menu button focused (Escape closes it again).
  function setMenu(rootEl, open) {
    rootEl.__jstMenu = !!open;
    refresh(rootEl);
    try {
      const b = rootEl.querySelector('.jst-header .jst-menu');
      if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
    } catch (e) { /* focus is a nicety */ }
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

  // Brings a node of the store into view (an invalid field), below the host's sticky bars.
  function scrollToNode(rootEl, node) {
    try {
      const r = node.getBoundingClientRect();
      let p = rootEl.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) {
          const pr = p.getBoundingClientRect();
          if (r.top < pr.top + 24 || r.bottom > pr.bottom - 24) p.scrollTop += r.top - pr.top - Math.max(24, (pr.height - r.height) / 3);
          return;
        }
        p = p.parentElement;
      }
      if (typeof window !== 'undefined' && (r.top < 140 || r.bottom > window.innerHeight - 24)) window.scrollBy(0, r.top - Math.max(140, (window.innerHeight - r.height) / 3));
    } catch (e) { /* scrolling is a nicety */ }
  }

  function navigate(rootEl, page, productId, pageId) {
    const v = rootEl.__jstView;
    if (!v) return;
    rootEl.__jstMenu = false;
    render(v.config, rootEl, { device: v.device, page: page, productId: productId || null, pageId: pageId || null });
    const nv = rootEl.__jstView || {};
    const detail = {
      page: nv.page || 'home',
      productId: nv.page === 'product' ? (nv.productId || null) : null,
      pageId: nv.page === 'page' ? (nv.pageId || null) : null
    };
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
        navigate(rootEl, a.getAttribute('data-page') || 'home', id || null, a.getAttribute('data-page-id') || null);
        break;
      case 'menu':
        setMenu(rootEl, !rootEl.__jstMenu);
        break;
      case 'add': {
        const quick = a.hasAttribute('data-quick');
        const q = !quick && isObj(rootEl.__jstQty) && rootEl.__jstQty.id === id ? clamp(Math.round(num(rootEl.__jstQty.n) || 1), QTY_MIN, QTY_MAX) : 1;
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
      case 'order': {
        // Like a real checkout, the commune is required: its fee is part of what the shopper pays.
        const sel = rootEl.querySelector('select[data-jst-field="commune"]');
        if (sel && !sel.value) {
          rootEl.__jstErr = { commune: true };
          refresh(rootEl);
          const ns = rootEl.querySelector('select[data-jst-field="commune"]');
          if (ns) {
            scrollToNode(rootEl, ns.closest('.jst-field') || ns);
            try { ns.focus({ preventScroll: true }); } catch (err) { /* focus is a nicety */ }
          }
          break;
        }
        rootEl.__jstErr = null;
        navigate(rootEl, 'confirmation', null);
        break;
      }
      case 'peek': {
        // <details> toggles itself; remember it so a live update (commune, payment) keeps it open.
        const d = a.closest('details');
        rootEl.__jstPeek = d ? !d.open : false;
        break;
      }
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
    if (committed && key === 'commune') { rootEl.__jstErr = null; refresh(rootEl); }
  }

  // A demo photo whose file does not load: forget it on this page and draw the store again, as if the
  // fiche had no photo there (once per photo: the new markup no longer asks for that file).
  function onPhotoError(rootEl, t) {
    const id = t && t.tagName === 'IMG' && typeof t.getAttribute === 'function' ? t.getAttribute('data-demo-photo') : null;
    if (!id) return;
    MISSING[id] = true;
    clearTimeout(rootEl.__jstPhotoTimer);
    rootEl.__jstPhotoTimer = setTimeout(() => { try { refresh(rootEl); } catch (e) { /* ignore */ } }, 0);
  }

  function bind(rootEl) {
    if (rootEl.__jstBound || typeof rootEl.addEventListener !== 'function') return;
    rootEl.__jstBound = true;
    rootEl.addEventListener('click', (e) => { try { onClick(rootEl, e); } catch (err) { /* never break the host page */ } });
    // load errors do not bubble: listen while they go down to the <img>
    rootEl.addEventListener('error', (e) => { try { onPhotoError(rootEl, e.target); } catch (err) { /* ignore */ } }, true);
    rootEl.addEventListener('input', (e) => { try { onField(rootEl, e, false); } catch (err) { /* ignore */ } });
    rootEl.addEventListener('change', (e) => { try { onField(rootEl, e, true); } catch (err) { /* ignore */ } });
    rootEl.addEventListener('submit', (e) => e.preventDefault());
    // Typing in the store's fields must not trigger the editor's shortcuts (undo, delete…).
    rootEl.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select')) e.stopPropagation();
      // Escape closes the phone menu (and only that: the host keeps its own Escape otherwise).
      if (e.key === 'Escape' && rootEl.__jstMenu) {
        e.stopPropagation();
        try { setMenu(rootEl, false); } catch (err) { /* ignore */ }
      }
    });
  }

  /* ------------------------------------------------------------------ render */

  function render(config, rootEl, options) {
    if (!rootEl || typeof rootEl !== 'object' || !('innerHTML' in rootEl)) return rootEl;
    const o = isObj(options) ? options : {};
    const device = o.device === 'desktop' ? 'desktop' : 'phone';
    let page = typeof o.page === 'string' && (o.page === 'home' || own(PAGE_RENDERERS, o.page)) ? o.page : 'home';
    const productId = typeof o.productId === 'string' && o.productId ? o.productId : null;
    const pageId = typeof o.pageId === 'string' && o.pageId ? o.pageId : null;
    // The phone menu stays open across live edits, not when the host shows another page or device.
    const prev = rootEl.__jstView;
    if (rootEl.__jstMenu && (device !== 'phone' || !prev || prev.page !== page || (page === 'page' && pageId && prev.pageId !== pageId))) rootEl.__jstMenu = false;
    let m = null;
    let j = null;
    let html;
    try {
      m = buildModel(config, device);
      VIVID = m.vivid;
      j = journey(m, rootEl, page, productId, pageId);
      html = renderPage(m, j);
    } catch (e) {
      m = null;
      page = 'home';
      const name = isObj(config) && isObj(config.store) ? str(config.store.name).trim() : '';
      html = '<header class="jst-header"><div class="jst-wrap jst-header-in"><span class="jst-logo">' + esc(name || 'Votre boutique') + '</span></div></header>' +
        '<main class="jst-main"><div class="jst-wrap jst-page-empty">' + empty('L’aperçu n’a pas pu être affiché. Vérifiez la fiche boutique.') + '</div></main>' +
        '<footer class="jst-footer"><div class="jst-wrap"><div class="jst-footer-bottom"><span>©' + NBSP + esc(name || 'Votre boutique') + '</span>' + powered() + '</div></div></footer>';
    } finally {
      VIVID = false;
    }
    try {
      rootEl.__jstView = { config: config, device: device, page: page, productId: j ? j.productId : productId, pageId: j ? j.pageId : (page === 'page' ? pageId : null) };
      rootEl.className = 'jst';
      if (rootEl.dataset) {
        rootEl.dataset.tpl = m ? m.tpl : 'plateau';
        rootEl.dataset.device = device;
        rootEl.dataset.buttons = m ? m.buttons : 'solid';
        rootEl.dataset.tone = m && m.dark ? 'dark' : 'light';
        rootEl.dataset.intensity = m ? m.intensity : 'vivid';
        rootEl.dataset.page = page;
        // The seller's own colours (theme.colors): store.css drops the text's see-through effects
        if (m && m.paletteCustom) rootEl.dataset.colors = 'custom'; else delete rootEl.dataset.colors;
        // Badges and promos with their own colours (theme.colors.badgeBg / badgeText)
        if (m && m.colorZones && m.colorZones.badge) rootEl.dataset.cBadge = ''; else delete rootEl.dataset.cBadge;
        // Titles in capitals or not (theme.typography.upper); absent: the template's choice
        if (m && m.headingCase) rootEl.dataset.hcase = m.headingCase; else delete rootEl.dataset.hcase;
        // Her own fonts (theme.typography): every weight used is loaded, so no fake bold (font-synthesis-weight);
        // a heading font without italic writes Plateau's signature upright; a handwriting is for titles only
        if (m && m.fontsCustom) rootEl.dataset.fonts = 'custom'; else delete rootEl.dataset.fonts;
        if (m && m.fontsCustom && !m.headingItalic) rootEl.dataset.hital = 'none'; else delete rootEl.dataset.hital;
        if (m && m.headingStyle) rootEl.dataset.hstyle = m.headingStyle; else delete rootEl.dataset.hstyle;
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
          '--st-text-soft': m ? m.textSoft : mix(c.bg, c.text, 0.82),
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
          '--st-field-line': v.fieldLine,
          // Form errors: a red that reads at 4.5:1 on the store's light (or dark) surfaces
          '--st-error': m ? m.errorInk : '#B3261E'
        });
      }
      if (rootEl.style) {
        const bz = m && m.colorZones ? m.colorZones.badge : null;
        if (bz && validHex(bz.bg) && validHex(bz.fg)) setVars(rootEl, { '--st-badge-bg': validHex(bz.bg), '--st-badge-fg': validHex(bz.fg) });
        else ['--st-badge-bg', '--st-badge-fg'].forEach((k) => { try { rootEl.style.removeProperty(k); } catch (e) { /* ignore */ } });
        // Heading size (theme.typography.size and the font's scale): store.css multiplies the titles by --st-hs
        // and the name in the header by --st-hf. Not set at 1, so a fiche without them is unchanged.
        const hs = m ? m.headingScale : 1;
        const hf = m ? m.logoScale : 1;
        if (hs !== 1) setVars(rootEl, { '--st-hs': String(hs) }); else { try { rootEl.style.removeProperty('--st-hs'); } catch (e) { /* ignore */ } }
        if (hf !== 1) setVars(rootEl, { '--st-hf': String(hf) }); else { try { rootEl.style.removeProperty('--st-hf'); } catch (e) { /* ignore */ } }
        // ɛ ɔ ŋ drawn from the fallback (a font without them): sized to the font's own x-height (font-size-adjust)
        if (m && m.glyphFallback) setVars(rootEl, { '--st-fsa': 'from-font' }); else { try { rootEl.style.removeProperty('--st-fsa'); } catch (e) { /* ignore */ } }
      }
      rootEl.innerHTML = html;
      if (device === 'desktop') {
        fitNav(rootEl);
        // Web fonts change the widths: check again once they are in (same element, same render).
        const stamp = rootEl.__jstNavStamp = (rootEl.__jstNavStamp || 0) + 1;
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
          document.fonts.ready.then(() => { if (rootEl.__jstNavStamp === stamp) fitNav(rootEl); }, () => {});
        }
      }
    } catch (e) {
      try { rootEl.textContent = 'Aperçu indisponible.'; } catch (e2) { /* nothing more to do */ }
    }
    bind(rootEl);
    ensureFonts(config);
    return rootEl;
  }

  // For the host page (the editor's address bar, the dashboard, a published store's <link rel="icon">):
  // the tab icon (the seller's icon, else her logo) or her initial on the accent colour. Never throws.
  function brandInfo(config) {
    try {
      const d = DATA();
      const b = d && typeof d.brand === 'function' ? d.brand(config) : null;
      const m = buildModel(config, 'phone');
      return {
        name: m.name, logo: b ? b.logo : null, icon: b ? b.icon : null, iconFrom: b ? b.iconFrom : 'initial',
        initial: b ? b.initial : (m.name.charAt(0) || 'B').toUpperCase(), accent: m.colors.accent, onAccent: m.colors.onAccent
      };
    } catch (e) { return { name: '', logo: null, icon: null, iconFrom: 'initial', initial: 'B', accent: '#111111', onAccent: '#FFFFFF' }; }
  }

  root.JeereRender = {
    render: render, ensureFonts: ensureFonts, fontLinks: fontLinks, artSVG: artSVG, pages: pagesList, PAGES: PAGES_FALLBACK,
    photoSrc: photoSrc, photoInfo: photoInfo, PHOTO_BASE: PHOTO_BASE, brand: brandInfo
  };
})();
