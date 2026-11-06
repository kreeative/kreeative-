/*
 * Jeere Studio — data.js
 * The contract shared by the editor, the renderer and the questionnaire.
 *
 * Everything a store is made of lives in one "fiche boutique" (store config JSON, version 1).
 * The AI never writes code: it fills this fiche, our tested templates render it, and the
 * editor edits the same fiche. This file holds the catalogue (templates, palettes, colour
 * intensities, font pairs and the 33 fonts, section types, niches, communes, payment methods, store pages, demo
 * photos), the example content in French (including the 4 default custom pages of each niche: À propos,
 * Livraison et retours, Contact, Conditions de vente), and the pure helpers (defaultConfig,
 * normalizeConfig, validate, formatPrice, slugify...).
 *
 * It also holds what the seller side shares (the account page, the dashboard): the plans, the
 * connectors catalogue, the dashboard's default settings, the order statuses, the localStorage
 * keys, and demoOrders() — example orders computed from a fiche, deterministic for a given date.
 *
 * Pure data and functions: no DOM access. The only side effect is window.JEERE_DATA, so the
 * file also loads in Node with `global.window = {}`.
 *
 * Collections (templates, palettes, fontPairs, sectionTypes, niches) are objects keyed by id
 * (palettes.karite) that also behave like read-only arrays (palettes.forEach, .map, .find,
 * .length, palettes[0], for...of), with those helpers non-enumerable so Object.keys() and
 * Object.values() return the ids and entries only.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  /* ------------------------------------------------------------------ helpers */

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function has(obj, key) { return isObj(obj) && Object.prototype.hasOwnProperty.call(obj, key); }
  // Membership in a collection: only the enumerable keys (the ids), never the array helpers.
  function inColl(coll, key) { return typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(coll, key); }

  function collection(list) {
    var obj = {};
    list.forEach(function (item) { obj[item.id] = item; });
    var hidden = {
      length: list.length,
      toArray: function () { return list.slice(); },
      ids: function () { return list.map(function (x) { return x.id; }); }
    };
    ['forEach', 'map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'slice', 'indexOf', 'includes'].forEach(function (m) {
      hidden[m] = function () { return Array.prototype[m].apply(list, arguments); };
    });
    Object.keys(hidden).forEach(function (k) {
      Object.defineProperty(obj, k, { value: hidden[k], enumerable: false, writable: false, configurable: false });
    });
    list.forEach(function (item, i) {
      Object.defineProperty(obj, String(i), { value: item, enumerable: false, writable: false, configurable: false });
    });
    if (typeof Symbol !== 'undefined' && Symbol.iterator) {
      Object.defineProperty(obj, Symbol.iterator, { value: function () { return list[Symbol.iterator](); }, enumerable: false });
    }
    return obj;
  }

  function clone(obj) {
    if (obj === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return null; }
  }

  function formatNumber(n) {
    var x = Number(n);
    if (!isFinite(x)) x = 0;
    x = Math.round(x);
    var sign = x < 0 ? '-' : '';
    return sign + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function formatPrice(n) { return formatNumber(n) + ' FCFA'; }

  function applyName(text, name) {
    return String(text == null ? '' : text).split('{name}').join(String(name == null ? '' : name));
  }

  // Same rule as the landing page: an international number stays as typed (digits only);
  // otherwise +225 is added and the leading 0 is kept (10-digit Ivorian numbers since 2021).
  function normalizeWhatsapp(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^(\+|00)/.test(s)) {
      var intl = s.replace(/^00/, '').replace(/\D/g, '');
      return intl ? '+' + intl : '';
    }
    var digits = s.replace(/\D/g, '');
    if (!digits) return '';
    if (/^225\d{10}$/.test(digits)) return '+' + digits;
    return '+225' + digits;
  }

  // « Livraison et retours » → 'livraison-et-retours'. Accents removed (also ɛ ɔ ŋ and œ æ),
  // lower case, every other run of characters becomes one hyphen, none at the ends, 60 characters
  // at most (cut at a hyphen when possible). '' when nothing is left.
  var SLUG_MAX = 60;
  function slugify(raw) {
    var s = String(raw == null ? '' : raw);
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    s = s.replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[œ]/g, 'oe').replace(/[æ]/g, 'ae').replace(/ß/g, 'ss')
      .replace(/[ɛ]/g, 'e').replace(/[ɔ]/g, 'o').replace(/[ŋ]/g, 'n').replace(/[ø]/g, 'o').replace(/[đ]/g, 'd').replace(/[ł]/g, 'l')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > SLUG_MAX) {
      var cut = s.slice(0, SLUG_MAX);
      var at = cut.lastIndexOf('-');
      s = (at >= SLUG_MAX / 2 ? cut.slice(0, at) : cut).replace(/-+$/g, '');
    }
    return s;
  }

  /* ------------------------------------------------------------------ constants */

  var ART_KINDS = ['jar', 'bottle', 'bag', 'dress', 'tshirt', 'shoe', 'cap', 'jewel', 'hair', 'plate', 'basket', 'box'];

  var ART_LABELS = {
    jar: 'Pot', bottle: 'Flacon', bag: 'Sac', dress: 'Robe', tshirt: 'Haut, t-shirt', shoe: 'Chaussure',
    cap: 'Casquette', jewel: 'Bijou', hair: 'Perruque, mèches', plate: 'Plat, assiette', basket: 'Panier', box: 'Boîte, coffret'
  };

  var BADGES = { new: 'Nouveau', best: 'Best-seller', promo: 'Promo' };

  // Payment methods, in the order of the checkout. Always plain text: never the operators' logos or
  // brand colours. kind: 'mobile' (mobile money), 'cod' (paid to the courier) or 'card'.
  // hint: the line under the method on the checkout page. status: the line on the confirmation page.
  // On the checkout, 'cod' turns the main button into « Confirmer la commande », the others into « Payer 14 500 FCFA ».
  var PAYMENTS = [
    { key: 'wave', label: 'Wave', kind: 'mobile', hint: 'Vous recevrez une demande de paiement sur votre numéro Wave.', status: 'Paiement Wave reçu' },
    { key: 'orange', label: 'Orange Money', kind: 'mobile', hint: 'Validez le paiement sur votre téléphone.', status: 'Paiement Orange Money reçu' },
    { key: 'mtn', label: 'MTN MoMo', kind: 'mobile', hint: 'Validez le paiement sur votre téléphone.', status: 'Paiement MTN MoMo reçu' },
    { key: 'moov', label: 'Moov Money', kind: 'mobile', hint: 'Validez le paiement sur votre téléphone.', status: 'Paiement Moov Money reçu' },
    { key: 'cod', label: 'Paiement à la livraison', kind: 'cod', hint: 'Vous payez le livreur en espèces ou par mobile money à la réception.', status: 'À payer à la livraison' },
    { key: 'card', label: 'Carte bancaire', kind: 'card', hint: 'Visa ou Mastercard, idéal depuis l’étranger.', status: 'Paiement par carte reçu' }
  ];

  // The pages of a store, in the order of the buying journey. JeereRender.render(config, root,
  // { page, productId }) draws one of them; nothing in the fiche is specific to a page.
  var PAGES = [
    { id: 'home', label: 'Accueil' },
    { id: 'product', label: 'Fiche produit' },
    { id: 'cart', label: 'Panier' },
    { id: 'checkout', label: 'Paiement' },
    { id: 'confirmation', label: 'Confirmation' }
  ];

  // Colour intensity (theme.intensity). 'vivid': the palette's accent carries the page (announcement bar,
  // hero, tinted section backgrounds, solid buttons). 'soft': light backgrounds, the colour in touches.
  // The renderer does it with CSS variables and [data-intensity] on the store root: palettes never change.
  // Vivid is the default everywhere; a fiche saved before intensity existed is read as vivid.
  var INTENSITY_OPTIONS = [
    { value: 'vivid', label: 'Vives', hint: 'Votre couleur habille toute la boutique.' },
    { value: 'soft', label: 'Douces', hint: 'Des fonds clairs, la couleur en touches.' }
  ];
  var DEFAULT_INTENSITY = 'vivid';

  function isIntensity(v) {
    return INTENSITY_OPTIONS.some(function (o) { return o.value === v; });
  }

  // 'vivid', 'soft', or a French label ('Vives', 'douces'); anything else gives the default.
  function normIntensity(v) {
    if (typeof v !== 'string') return DEFAULT_INTENSITY;
    var s = v.trim().toLowerCase();
    for (var i = 0; i < INTENSITY_OPTIONS.length; i++) {
      var o = INTENSITY_OPTIONS[i];
      if (s === o.value || s === o.label.toLowerCase()) return o.value;
    }
    return DEFAULT_INTENSITY;
  }

  var radii = { none: 0, soft: 10, round: 22 };
  var RADIUS_OPTIONS = [
    { value: 'none', label: 'Droit' },
    { value: 'soft', label: 'Doux' },
    { value: 'round', label: 'Rond' }
  ];
  var BUTTON_OPTIONS = [
    { value: 'solid', label: 'Plein' },
    { value: 'outline', label: 'Contour' }
  ];

  // 10 preset tile colours for products (soft, earthy, suit every art kind).
  var PRODUCT_COLORS = ['#E9D8BD', '#F2D59B', '#E7C7A2', '#D9A88C', '#E3A6B4', '#C7B8E0', '#A9C1D9', '#BFD7D6', '#BFD3A0', '#E8E6DF'];

  /* ------------------------------------------------------------------ templates */

  var templates = collection([
    {
      id: 'plateau',
      name: 'Plateau',
      style: 'Éditorial',
      description: 'Une mise en page de magazine : grandes images, titres élégants et beaucoup d’espace.',
      bestFor: 'Mode, bijoux, maison et marques haut de gamme',
      defaultNiche: 'fashion',
      imageRatio: '4:5',
      defaults: {
        palette: 'sable', fonts: 'editorial', radius: 'none', buttons: 'solid',
        sections: ['announcement', 'hero', 'categories', 'products', 'about', 'reviews', 'delivery', 'whatsapp']
      }
    },
    {
      id: 'cocody',
      name: 'Cocody',
      style: 'Doux',
      description: 'Des cartes arrondies, des couleurs tendres et des catégories faciles à parcourir.',
      bestFor: 'Beauté, perruques, artisanat et petits créateurs',
      defaultNiche: 'beauty',
      imageRatio: '1:1',
      defaults: {
        palette: 'hibiscus', fonts: 'doux', radius: 'round', buttons: 'solid',
        sections: ['announcement', 'hero', 'categories', 'products', 'reviews', 'about', 'delivery', 'whatsapp']
      }
    },
    {
      id: 'treichville',
      name: 'Treichville',
      style: 'Audacieux',
      description: 'De grands titres en capitales, des blocs de couleur et un contraste fort qui attire l’œil.',
      bestFor: 'Sneakers, streetwear, restauration et promotions',
      defaultNiche: 'shoes',
      imageRatio: '1:1',
      defaults: {
        palette: 'nuit', fonts: 'audacieux', radius: 'none', buttons: 'solid',
        sections: ['announcement', 'hero', 'products', 'whatsapp', 'categories', 'reviews', 'delivery', 'about']
      }
    }
  ]);

  /* ------------------------------------------------------------------ palettes
   * Pop colours: a light tint of the hue behind the page, a bright, saturated accent.
   * WCAG contrast (checked): text/bg >= 7, text/surface >= 7, muted/bg >= 4.5,
   * onAccent/accent >= 4.5 (dark text on the bright accents, white on pink and blue).
   * The accent is a fill (buttons, bars, blocks): where it would be text or a thin line on the
   * page, the renderer uses a deepened accent (accentText, accentInk) that reads at 4.5:1,
   * so a bright yellow or turquoise accent is fine. Only `line` may be rgba.
   */

  var palettes = collection([
    { id: 'sable', name: 'Sable', colors: { bg: '#F5F4F0', surface: '#FFFFFF', text: '#111111', muted: '#5B5A56', accent: '#111111', onAccent: '#FFFFFF', line: 'rgba(17,17,17,0.13)' } },
    { id: 'karite', name: 'Karité', colors: { bg: '#FFF1E7', surface: '#FFFFFF', text: '#2B1308', muted: '#77442B', accent: '#EE5A2A', onAccent: '#1F0B03', line: 'rgba(43,19,8,0.13)' } },
    { id: 'lagune', name: 'Lagune', colors: { bg: '#ECFBFB', surface: '#FFFFFF', text: '#052326', muted: '#2F5F63', accent: '#00BFCB', onAccent: '#04272B', line: 'rgba(5,35,38,0.13)' } },
    { id: 'hibiscus', name: 'Hibiscus', colors: { bg: '#FFEDF5', surface: '#FFFFFF', text: '#2E0618', muted: '#7D3556', accent: '#DE0F7B', onAccent: '#FFFFFF', line: 'rgba(46,6,24,0.12)' } },
    { id: 'indigo', name: 'Indigo', colors: { bg: '#EFF1FF', surface: '#FFFFFF', text: '#0C1342', muted: '#454E86', accent: '#3657FF', onAccent: '#FFFFFF', line: 'rgba(12,19,66,0.12)' } },
    { id: 'mangue', name: 'Mangue', colors: { bg: '#FFF7E1', surface: '#FFFFFF', text: '#261800', muted: '#6E5418', accent: '#FFB000', onAccent: '#261800', line: 'rgba(38,24,0,0.13)' } },
    { id: 'menthe', name: 'Menthe', colors: { bg: '#EAFBF1', surface: '#FFFFFF', text: '#05261A', muted: '#2F5E47', accent: '#14C46C', onAccent: '#05261A', line: 'rgba(5,38,26,0.13)' } },
    { id: 'nuit', name: 'Nuit', colors: { bg: '#0F100F', surface: '#1C1E1C', text: '#F4F5EF', muted: '#A6AB9F', accent: '#CCFF33', onAccent: '#0F100F', line: 'rgba(244,245,239,0.14)' } }
  ]);

  /* ------------------------------------------------------------------ custom colours
   * The 8 palettes are starting points. Two optional keys let a seller change any colour:
   *   theme.colors              partial overrides of the palette's six colours (bg, surface, text,
   *                             muted, accent, onAccent) and colours of four parts of the store
   *                             (announcementBg/Text, headerBg/Text, footerBg/Text, badgeBg/Text);
   *   sections[].settings.bg    'page' | 'surface' | 'accent' | '#RRGGBB' (absent: the template's
   *                             colour, which depends on vivid / soft), settings.fg its text colour
   *                             (absent: chosen for readability), and on the hero buttonBg / buttonText.
   * Nothing here is ever added to a fiche: without these keys a store renders byte for byte as
   * before. render.js reads the colours through themeColors() and sectionColors(), so what the
   * editor and validate() check is exactly what the store shows. Colours the seller did not pick
   * are derived so they read (text 4.5:1 on its ground); colours she picked are kept as they are,
   * and validate() reports the pairs that do not read, with the nearest readable shade as the fix.
   */

  var PALETTE_COLOR_KEYS = ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent'];
  // The parts of the store with colours of their own: [ground, text]
  var ELEMENT_ZONES = {
    announcement: ['announcementBg', 'announcementText'],
    header: ['headerBg', 'headerText'],
    footer: ['footerBg', 'footerText'],
    badge: ['badgeBg', 'badgeText']
  };
  var ELEMENT_COLOR_KEYS = ['announcementBg', 'announcementText', 'headerBg', 'headerText', 'footerBg', 'footerText', 'badgeBg', 'badgeText'];
  var COLOR_KEYS = PALETTE_COLOR_KEYS.concat(ELEMENT_COLOR_KEYS);
  // The editor's « Personnaliser les couleurs », in this order. kind 'bg': a ground; 'fg': text on it.
  var COLOR_GROUPS = [
    { id: 'page', label: 'La page', fields: [
      { key: 'bg', label: 'Fond de la page', kind: 'bg' },
      { key: 'surface', label: 'Fond des cartes et des blocs', kind: 'bg' },
      { key: 'text', label: 'Texte', kind: 'fg' },
      { key: 'muted', label: 'Texte secondaire', kind: 'fg' }
    ] },
    { id: 'accent', label: 'Couleur principale', hint: 'Boutons, liens et prix.', fields: [
      { key: 'accent', label: 'Couleur principale', kind: 'bg' },
      { key: 'onAccent', label: 'Texte des boutons', kind: 'fg' }
    ] },
    { id: 'announcement', label: 'Bandeau d’annonce', fields: [
      { key: 'announcementBg', label: 'Fond du bandeau', kind: 'bg' },
      { key: 'announcementText', label: 'Texte du bandeau', kind: 'fg' }
    ] },
    { id: 'header', label: 'En-tête', fields: [
      { key: 'headerBg', label: 'Fond de l’en-tête', kind: 'bg' },
      { key: 'headerText', label: 'Texte de l’en-tête', kind: 'fg' }
    ] },
    { id: 'footer', label: 'Pied de page', fields: [
      { key: 'footerBg', label: 'Fond du pied de page', kind: 'bg' },
      { key: 'footerText', label: 'Texte du pied de page', kind: 'fg' }
    ] },
    { id: 'badge', label: 'Badges et promos', hint: 'Nouveau, Best-seller, Promo sur les produits.', fields: [
      { key: 'badgeBg', label: 'Fond des badges', kind: 'bg' },
      { key: 'badgeText', label: 'Texte des badges', kind: 'fg' }
    ] }
  ];
  var COLOR_LABELS = {};
  COLOR_GROUPS.forEach(function (g) { g.fields.forEach(function (f) { COLOR_LABELS[f.key] = f.label; }); });

  // sections[].settings: bg and fg on every section, buttonBg and buttonText on the hero only
  var SECTION_COLOR_KEYS = ['bg', 'fg', 'buttonBg', 'buttonText'];
  var SECTION_BG_OPTIONS = [
    { value: 'auto', label: 'Automatique', hint: 'Comme le modèle : dépend de Vives ou Douces.' },
    { value: 'page', label: 'Couleur de la page' },
    { value: 'surface', label: 'Couleur des cartes' },
    { value: 'accent', label: 'Couleur principale' },
    { value: 'custom', label: 'Personnalisée' }
  ];
  // WCAG: text 4.5:1, large text (24 px, or 18.7 px bold) 3:1. Every coloured part carries normal text.
  // fill: what an accent fill (a button, the announcement bar, a badge) needs against the page and the
  // cards to be seen at all. The palettes go down to 1.7:1 (Mangue's yellow on cream), and yellow
  // buttons on white (1.3:1) still show; the same colour as the page (1:1), white on cream or lime
  // on white (1.1:1) do not.
  var CONTRAST_MIN = { text: 4.5, large: 3, fill: 1.25 };
  // Pop presets offered next to the palette's own colours in the colour pickers
  var POP_COLORS = ['#FFFFFF', '#111111', '#FFE03D', '#FFB000', '#FF7A1A', '#E63946', '#DE0F7B', '#FF8FC7', '#8E44EF', '#3657FF', '#00BFCB', '#14C46C', '#CCFF33', '#0C1342', '#5A2D0C', '#F5EBDD'];
  var INK_DARK = '#15120E';
  var INK_LIGHT = '#FFFFFF';

  function hexRgb(h) {
    var s = normColor(h, null);
    if (!s) return null;
    var n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(rgb) {
    return '#' + rgb.map(function (v) {
      var x = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return x.length < 2 ? '0' + x : x;
    }).join('').toUpperCase();
  }
  function mixHex(a, b, t) {
    var A = hexRgb(a) || [0, 0, 0];
    var B = hexRgb(b) || [255, 255, 255];
    return rgbHex(A.map(function (v, i) { return v + (B[i] - v) * t; }));
  }
  function toHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    var dd = max - min;
    var s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    var h;
    if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / dd + 2;
    else h = (r - g) / dd + 4;
    return [h / 6, s, l];
  }
  function fromHsl(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
  }
  function luminance(hex) {
    var c = hexRgb(hex) || [0, 0, 0];
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  // WCAG contrast ratio, 1 to 21
  function contrastRatio(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function isDarkColor(hex) { return luminance(hex) < 0.18; }
  // render.js's readable(): moves the lightness one way (deeper, or lighter on a dark ground) until
  // the colour reads at `min` on every ground
  function readableShade(fg, grounds, min, lighten) {
    var hsl = toHsl(hexRgb(fg) || [0, 0, 0]);
    var out = normColor(fg, '#000000');
    for (var i = 0; i < 48; i++) {
      if (grounds.every(function (b) { return contrastRatio(out, b) >= min; })) return out;
      hsl[2] = Math.max(0, Math.min(1, hsl[2] + (lighten ? 0.02 : -0.02)));
      out = rgbHex(fromHsl(hsl[0], hsl[1], hsl[2]));
    }
    return out;
  }
  // « Corriger »: the nearest shade of the same hue (lighter or deeper, whichever is closer) that
  // reads at `min` on every colour of `others`; null when no shade can (a pale and a dark ground).
  function nearestReadable(color, others, min) {
    var c = normColor(color, null);
    var list = (Array.isArray(others) ? others : [others]).map(function (o) { return normColor(o, null); }).filter(Boolean);
    var need = typeof min === 'number' ? min : CONTRAST_MIN.text;
    if (!c) return null;
    function ok(x) { return list.every(function (o) { return contrastRatio(x, o) >= need; }); }
    if (ok(c)) return c;
    var hsl = toHsl(hexRgb(c));
    for (var step = 1; step <= 100; step++) {
      var d = step / 100;
      var cands = [];
      if (hsl[2] - d >= 0) cands.push(rgbHex(fromHsl(hsl[0], hsl[1], hsl[2] - d)));
      if (hsl[2] + d <= 1) cands.push(rgbHex(fromHsl(hsl[0], hsl[1], hsl[2] + d)));
      for (var i = 0; i < cands.length; i++) if (ok(cands[i])) return cands[i];
    }
    // A narrow readable window (between a pale and a dark ground) can fall between two 1 % steps:
    // walk the lightness by 0.1 %, then the grey channels by one unit, before giving up
    for (var fine = 1; fine <= 1000; fine++) {
      var df = fine / 1000;
      var fc = [];
      if (hsl[2] - df >= 0) fc.push(rgbHex(fromHsl(hsl[0], hsl[1], hsl[2] - df)));
      if (hsl[2] + df <= 1) fc.push(rgbHex(fromHsl(hsl[0], hsl[1], hsl[2] + df)));
      for (var j = 0; j < fc.length; j++) if (ok(fc[j])) return fc[j];
    }
    var base3 = hexRgb(c);
    for (var u = 1; u <= 255; u++) {
      var dn = rgbHex(base3.map(function (v) { return v - u; }));
      var up = rgbHex(base3.map(function (v) { return v + u; }));
      if (ok(dn)) return dn;
      if (ok(up)) return up;
    }
    if (ok('#000000')) return '#000000';
    if (ok('#FFFFFF')) return '#FFFFFF';
    return null;
  }
  // Text for a ground nobody chose a text colour for: the best of the store's own text colours if it
  // reads, else near-black or white
  function autoText(ground, prefs) {
    var best = null, bestC = 0;
    (prefs || []).forEach(function (p) {
      var h = normColor(p, null);
      if (!h) return;
      var c = contrastRatio(h, ground);
      if (c > bestC) { best = h; bestC = c; }
    });
    if (best && bestC >= CONTRAST_MIN.text) return best;
    var ink = contrastRatio(INK_LIGHT, ground) > contrastRatio(INK_DARK, ground) ? INK_LIGHT : INK_DARK;
    if (contrastRatio(ink, ground) >= CONTRAST_MIN.text) return ink;
    // a mid-tone ground: pure black or white, one of them always reads (at least 4.58:1)
    return contrastRatio('#000000', ground) > contrastRatio(INK_LIGHT, ground) ? '#000000' : INK_LIGHT;
  }
  function lineOf(text, dark) {
    var c = hexRgb(text) || [17, 17, 17];
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (dark ? '0.14' : '0.13') + ')';
  }

  // theme.colors, cleaned: only the known keys, each as #RRGGBB; null when nothing is left
  function colorOverrides(v) {
    if (!isObj(v)) return null;
    var out = {};
    var n = 0;
    COLOR_KEYS.forEach(function (k) {
      var h = has(v, k) ? normColor(v[k], null) : null;
      if (h) { out[k] = h; n++; }
    });
    return n ? out : null;
  }
  // settings.bg: 'page', 'surface', 'accent' or #RRGGBB; anything else (or 'auto') is no choice
  function sectionBgValue(v) {
    if (v === 'page' || v === 'surface' || v === 'accent') return v;
    return normColor(v, null);
  }

  // The palette's six colours with the seller's on top. A ground she changed without choosing what
  // sits on it gets texts that read there (her palette's own text when it still reads).
  function mergeColors(pal, o) {
    var c = {};
    PALETTE_COLOR_KEYS.forEach(function (k) { c[k] = o[k] || normColor(pal[k], '#111111'); });
    var dark = isDarkColor(c.bg);
    if (o.bg && !o.surface && isDarkColor(pal.surface) !== dark) {
      // A raised card on a dark ground, a white one on a light ground; a mid-tone ground gets cards
      // a little deeper, so the text that reads on the ground still reads on them
      var ink = autoText(c.bg, [o.text || pal.text]);
      var up = dark ? mixHex(c.bg, INK_LIGHT, 0.07) : INK_LIGHT;
      c.surface = contrastRatio(ink, up) >= CONTRAST_MIN.text ? up : mixHex(c.bg, '#000000', 0.12);
    }
    if (!o.text && (o.bg || o.surface)) {
      if (!(contrastRatio(pal.text, c.bg) >= CONTRAST_MIN.text && contrastRatio(pal.text, c.surface) >= CONTRAST_MIN.text)) {
        // near-black, white, else pure black (a mid-tone ground next to white cards)
        var score = function (x) { return Math.min(contrastRatio(x, c.bg), contrastRatio(x, c.surface)); };
        var inks = [INK_DARK, INK_LIGHT, '#000000'];
        c.text = inks.filter(function (x) { return score(x) >= CONTRAST_MIN.text; })[0] || inks.sort(function (a, b) { return score(b) - score(a); })[0];
      }
    }
    // The palette's secondary text stays while it still reads (a text colour she changed does not discard it)
    if (!o.muted && (o.bg || o.surface || o.text)) {
      if (!(contrastRatio(c.muted, c.bg) >= CONTRAST_MIN.text && contrastRatio(c.muted, c.surface) >= CONTRAST_MIN.text)) {
        c.muted = readableShade(mixHex(c.text, c.bg, 0.36), [c.bg, c.surface], CONTRAST_MIN.text, dark);
      }
    }
    // A new page or card colour the palette's accent melts into (black buttons on a black page, lime on
    // white): an accent she did not pick moves until it stands out again, a grey one takes the text colour
    if (!o.accent && (o.bg || o.surface) && Math.min(contrastRatio(c.accent, c.bg), contrastRatio(c.accent, c.surface)) < CONTRAST_MIN.fill) {
      var own0 = Math.min(contrastRatio(pal.accent, pal.bg), contrastRatio(pal.accent, pal.surface));
      var want = Math.min(CONTRAST_MIN.large, Math.max(2, own0));
      var ahsl = toHsl(hexRgb(c.accent) || [0, 0, 0]);
      var fromText = ahsl[1] < 0.2 && Math.min(contrastRatio(c.text, c.bg), contrastRatio(c.text, c.surface)) >= want;
      c.accent = fromText ? c.text : (nearestReadable(c.accent, [c.bg, c.surface], want) || nearestReadable(c.accent, [c.bg, c.surface], CONTRAST_MIN.fill) || c.text);
      if (contrastRatio(c.onAccent, c.accent) < CONTRAST_MIN.text) c.onAccent = autoText(c.accent, [pal.onAccent, c.text, c.bg]);
    }
    if (o.accent && !o.onAccent && contrastRatio(c.onAccent, c.accent) < CONTRAST_MIN.text) c.onAccent = autoText(c.accent, [pal.onAccent, c.text]);
    c.line = (o.bg || o.text) ? lineOf(c.text, dark) : (typeof pal.line === 'string' ? pal.line : lineOf(c.text, dark));
    return c;
  }

  // The colours of a part of the store with its own ground: the text (the seller's, else one that
  // reads), a secondary text, two light tints, a line, the accent as text, and the accent fill (the
  // text colour when the accent would vanish on this ground, e.g. a section on the accent colour).
  function zoneColors(ground, fg, base) {
    var bg = normColor(ground, null) || base.bg;
    var dark = isDarkColor(bg);
    var own = normColor(fg, null);
    var text = own || autoText(bg, [base.text, base.onAccent]);
    // A shade of the ground towards the text (or away from it when that would make the text fade)
    var away = contrastRatio(INK_LIGHT, text) > contrastRatio(INK_DARK, text) ? INK_LIGHT : '#000000';
    function raise(t) {
      var a = mixHex(bg, text, t);
      if (own || contrastRatio(text, a) >= CONTRAST_MIN.text) return a;
      var b = mixHex(bg, away, t);
      return contrastRatio(text, b) >= CONTRAST_MIN.text ? b : bg;
    }
    var tint = raise(0.06);
    var tint2 = raise(0.12);
    // Cards inside keep the store's surface while the text still reads on it, else they are a raised
    // shade of this ground (white text on a purple band: purple cards, not white ones)
    var surface = contrastRatio(text, base.surface) >= CONTRAST_MIN.text ? base.surface : raise(0.1);
    var muted = (text === base.text && [bg, tint, tint2, surface].every(function (x) { return contrastRatio(base.muted, x) >= CONTRAST_MIN.text; }))
      ? base.muted
      : readableShade(mixHex(text, bg, 0.3), [bg, tint, tint2, surface], CONTRAST_MIN.text, dark);
    var visible = contrastRatio(base.accent, bg) >= 1.5;
    var acc = visible ? base.accent : text;
    var onAcc = visible ? base.onAccent : bg;
    var accSoft = mixHex(bg, acc, 0.14);
    // the accent as text (prices, links, the current menu link): on the ground, the cards, the tints
    var inkOn = [bg, surface, tint, tint2, accSoft];
    var ink = readableShade(base.accent, inkOn, CONTRAST_MIN.text, dark);
    if (inkOn.some(function (x) { return contrastRatio(ink, x) < CONTRAST_MIN.text; })) ink = text;
    // the accent's light tint (chips, the current menu link) under that text: the plain tint if it would fade
    if (contrastRatio(ink, accSoft) < CONTRAST_MIN.text + 0.05) accSoft = tint;
    var soft = mixHex(acc, onAcc, 0.84);
    return {
      bg: bg, fg: text, auto: !own, dark: dark, surface: surface, muted: muted, tint: tint, tint2: tint2,
      line: mixHex(bg, text, 0.18), soft: mixHex(bg, text, 0.82), ink: ink,
      acc: acc, onAcc: onAcc, onAccSoft: contrastRatio(soft, acc) >= CONTRAST_MIN.text ? soft : onAcc, accSoft: accSoft
    };
  }

  // render.js's vivid tints (vividColors), for the footer's own ground
  function tintsOf(c, dark) {
    var ahsl = toHsl(hexRgb(c.accent) || [0, 0, 0]);
    var neutral = ahsl[1] < 0.25 || ahsl[2] < 0.13 || ahsl[2] > 0.92;
    function shade(hex, dl, ds) {
      var hsl = toHsl(hexRgb(hex) || [200, 200, 200]);
      return rgbHex(fromHsl(hsl[0], Math.max(0, Math.min(1, hsl[1] + (ds || 0))), Math.max(0.07, Math.min(0.97, hsl[2] + dl))));
    }
    if (neutral) return { tint: shade(c.bg, dark ? 0.07 : -0.055, 0.1), tintStrong: shade(c.bg, dark ? 0.13 : -0.11, 0.16) };
    if (dark) return { tint: c.surface, tintStrong: mixHex(c.surface, c.text, 0.07) };
    return { tint: mixHex(c.bg, c.accent, 0.13), tintStrong: mixHex(c.bg, c.accent, 0.3) };
  }

  // Every colour the store uses, the seller's on top of her palette:
  // { palette, base: { bg, surface, text, muted, accent, onAccent, line }, set: her theme.colors (clean),
  //   custom: true when she changed at least one colour, dark, vivid, defaults: the template's ground and
  //   text of each part, zones: { announcement, header, footer, badge }: zoneColors() or null }
  function themeColors(config) {
    var cfg = isObj(config) ? config : {};
    var theme = isObj(cfg.theme) ? cfg.theme : {};
    var tpl = typeof cfg.template === 'string' && inColl(templates, cfg.template) ? cfg.template : 'plateau';
    var palId = typeof theme.palette === 'string' && inColl(palettes, theme.palette) ? theme.palette : templates[tpl].defaults.palette;
    var pal = palettes[palId].colors;
    var o = colorOverrides(theme.colors) || {};
    // One of the six palette colours set to the palette's own value changes nothing
    PALETTE_COLOR_KEYS.forEach(function (k) { if (o[k] && o[k] === normColor(pal[k], null)) delete o[k]; });
    var paletteSet = PALETTE_COLOR_KEYS.some(function (k) { return !!o[k]; });
    var base = mergeColors(pal, o);
    var dark = isDarkColor(base.bg);
    var vivid = theme.intensity !== 'soft';
    var t = tintsOf(base, dark);
    // render.js (custom path): a tint her text does not read on becomes a shade of the page that it reads on
    if (paletteSet) {
      var away = contrastRatio(INK_LIGHT, base.text) > contrastRatio('#000000', base.text) ? INK_LIGHT : '#000000';
      var shadeFor = function (x) {
        var a = mixHex(base.bg, base.text, x);
        if (contrastRatio(base.text, a) >= CONTRAST_MIN.text) return a;
        var bb = mixHex(base.bg, away, x);
        return contrastRatio(base.text, bb) >= CONTRAST_MIN.text ? bb : base.bg;
      };
      if (contrastRatio(base.text, t.tint) < CONTRAST_MIN.text) t.tint = shadeFor(0.08);
      if (contrastRatio(base.text, t.tintStrong) < CONTRAST_MIN.text) t.tintStrong = shadeFor(0.16);
    }
    var defaults = {
      announcement: { bg: base.accent, fg: base.onAccent },
      header: { bg: base.bg, fg: base.text },
      footer: { bg: vivid ? t.tintStrong : (tpl === 'plateau' ? base.bg : base.surface), fg: base.text },
      badge: { bg: base.accent, fg: base.onAccent }
    };
    var zones = {};
    Object.keys(ELEMENT_ZONES).forEach(function (z) {
      var keys = ELEMENT_ZONES[z];
      zones[z] = (o[keys[0]] || o[keys[1]]) ? zoneColors(o[keys[0]] || defaults[z].bg, o[keys[1]] || null, base) : null;
    });
    return { palette: palId, base: base, set: o, custom: Object.keys(o).length > 0, paletteSet: paletteSet, dark: dark, vivid: vivid, defaults: defaults, zones: zones };
  }

  // One section's own colours: { choice: 'page'|'surface'|'accent'|'custom'|null, zone: zoneColors() or
  // null, button: { bg, fg, auto } or null (the hero's button) }. base: themeColors(config).base.
  function sectionColors(section, base) {
    var st = isObj(section) && isObj(section.settings) ? section.settings : {};
    var b = isObj(base) ? base : palettes.sable.colors;
    var v = sectionBgValue(st.bg);
    var out = { choice: null, zone: null, button: null };
    if (v) {
      var ground = v === 'page' ? b.bg : (v === 'surface' ? b.surface : (v === 'accent' ? b.accent : v));
      out.choice = v.charAt(0) === '#' ? 'custom' : v;
      out.zone = zoneColors(ground, st.fg, b);
    }
    if (isObj(section) && section.type === 'hero') {
      var bb = normColor(st.buttonBg, null);
      var bt = normColor(st.buttonText, null);
      if (bb || bt) {
        var g = bb || b.accent;
        out.button = { bg: g, fg: bt || autoText(g, [b.onAccent, b.text]), auto: !bt };
      }
    }
    return out;
  }

  // The colour pairs the seller set (or changed the ground of) that do not read. Each one:
  // { id, label, fg, grounds, ratio, min, fgKey, groundKeys, fix, section? } where keys are
  // 'theme:<key>' or 'section:<id>:<key>' and fix the nearest readable shade of the text (null if none).
  function colorChecks(config) {
    var out = [];
    var cfg = isObj(config) ? config : {};
    var tc = themeColors(cfg);
    var o = tc.set;
    var b = tc.base;
    // severe: the main text, the buttons' text, under 3:1: the store cannot be read (Qualité holds back
    // « APPROUVÉ » until it is fixed). fill: a colour fill (not a text) that needs to be seen, at 1.5:1.
    function check(id, label, fg, grounds, fgKey, groundKeys, extra) {
      var ratio = Math.min.apply(null, grounds.map(function (g) { return contrastRatio(fg, g); }));
      var fill = !!(extra && extra.kind === 'fill');
      var min = fill ? CONTRAST_MIN.fill : CONTRAST_MIN.text;
      if (ratio >= min) return;
      var fix = fill ? (nearestReadable(fg, grounds, CONTRAST_MIN.large) || nearestReadable(fg, grounds, min)) : nearestReadable(fg, grounds, min);
      var item = { id: id, label: label, fg: fg, grounds: grounds, ratio: Math.round(ratio * 100) / 100, min: min, fgKey: fgKey, groundKeys: groundKeys, fix: fix,
        kind: fill ? 'fill' : 'text', severe: !fill && ratio < CONTRAST_MIN.large && (id === 'text' || id === 'onAccent' || id.indexOf('button-') === 0) };
      if (extra) Object.keys(extra).forEach(function (k) { if (k !== 'kind') item[k] = extra[k]; });
      out.push(item);
    }
    if (o.text || o.bg || o.surface) check('text', 'le texte sur le fond de la page et des cartes', b.text, [b.bg, b.surface], 'theme:text', ['theme:bg', 'theme:surface']);
    if (o.muted || o.bg || o.surface || o.text) check('muted', 'le texte secondaire sur le fond de la page et des cartes', b.muted, [b.bg, b.surface], 'theme:muted', ['theme:bg', 'theme:surface']);
    if (o.accent || o.onAccent) check('onAccent', 'le texte des boutons sur la couleur principale', b.onAccent, [b.accent], 'theme:onAccent', ['theme:accent']);
    // The accent as a fill (buttons, the announcement bar, badges) on the page and the cards: only when she
    // picked it (an accent she did not pick is moved by mergeColors)
    if (o.accent) check('accent', 'les boutons, le bandeau et les badges se confondent avec le fond de la page', b.accent, [b.bg, b.surface], 'theme:accent', ['theme:bg', 'theme:surface'], { kind: 'fill' });
    var zoneLabels = { announcement: 'le texte du bandeau d’annonce', header: 'le texte de l’en-tête', footer: 'le texte du pied de page', badge: 'le texte des badges' };
    Object.keys(ELEMENT_ZONES).forEach(function (z) {
      var zc = tc.zones[z];
      if (!zc) return;
      var keys = ELEMENT_ZONES[z];
      check(z, zoneLabels[z], zc.fg, [zc.bg], 'theme:' + keys[1], ['theme:' + keys[0]]);
    });
    (Array.isArray(cfg.sections) ? cfg.sections : []).forEach(function (s) {
      if (!isObj(s) || !inColl(sectionTypes, s.type) || s.enabled === false) return;
      var sc = sectionColors(s, b);
      var name = sectionTypes[s.type].name;
      if (sc.zone) check('section-' + s.id, 'le texte de la section ' + q(name), sc.zone.fg, [sc.zone.bg], 'section:' + s.id + ':fg', ['section:' + s.id + ':bg'], { section: s.id });
      if (sc.button) check('button-' + s.id, 'le texte du bouton de la section ' + q(name), sc.button.fg, [sc.button.bg], 'section:' + s.id + ':buttonText', ['section:' + s.id + ':buttonBg'], { section: s.id });
    });
    return out;
  }

  // Writes a colour key ('theme:text', 'section:s2:fg') into a fiche
  function setColorKey(config, key, value) {
    var parts = String(key).split(':');
    if (!isObj(config)) return false;
    if (parts[0] === 'theme' && COLOR_KEYS.indexOf(parts[1]) !== -1) {
      if (!isObj(config.theme)) config.theme = {};
      if (!isObj(config.theme.colors)) config.theme.colors = {};
      config.theme.colors[parts[1]] = value;
      return true;
    }
    if (parts[0] === 'section' && Array.isArray(config.sections)) {
      var s = config.sections.filter(function (x) { return isObj(x) && x.id === parts[1]; })[0];
      if (!s || SECTION_COLOR_KEYS.indexOf(parts[2]) === -1) return false;
      if (!isObj(s.settings)) s.settings = {};
      s.settings[parts[2]] = value;
      return true;
    }
    return false;
  }
  // « Corriger tout »: every text that does not read becomes the nearest readable shade of its colour.
  // Changes the fiche in place; returns the number of colours changed.
  function fixColors(config) {
    if (!isObj(config) || !isObj(config.theme)) return 0;
    var n = 0;
    for (var pass = 0; pass < 3; pass++) {
      var list = colorChecks(config).filter(function (c) { return c.fix; });
      if (!list.length) break;
      list.forEach(function (c) { if (setColorKey(config, c.fgKey, c.fix)) n++; });
    }
    return n;
  }
  function fmtRatio(r) { return (Math.floor(r * 10) / 10).toFixed(1).replace('.', ',') + ':1'; }

  /* ------------------------------------------------------------------ font pairs
   * All of these fonts include ɛ ɔ ŋ except Poppins, hence the Montserrat fallback in "simple".
   * theme.fonts names a pair: the Thème tab's « Suggestions ». The seller can then choose the heading font
   * and the text font apart (theme.typography, see FONTS below); a fiche without it renders the pair as before.
   */

  var INTER = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

  var fontPairs = collection([
    {
      id: 'editorial', name: 'Éditorial',
      display: { family: "'Playfair', 'Playfair Display', Georgia, 'Times New Roman', serif", weight: 600 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Playfair:ital,opsz,wght@0,5..1200,400..700;1,5..1200,400..700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'moderne', name: 'Moderne',
      display: { family: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 700 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'doux', name: 'Doux',
      display: { family: "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 600 },
      text: { family: "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap'
    },
    {
      id: 'audacieux', name: 'Audacieux',
      display: { family: "'Unbounded', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 600 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'classique', name: 'Classique',
      display: { family: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif", weight: 600 },
      text: { family: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=Fira+Sans:wght@400;500;600&display=swap'
    },
    {
      id: 'simple', name: 'Simple',
      display: { family: "'Poppins', 'Montserrat', sans-serif", weight: 600 },
      text: { family: "'Poppins', 'Montserrat', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Montserrat:wght@400;600&display=swap'
    }
  ]);
  // The fonts of each pair in the catalogue below (FONTS): the pairs are the « Suggestions » of the Thème tab
  var PAIR_FONTS = {
    editorial: ['playfair', 'inter'], moderne: ['montserrat', 'inter'], doux: ['onest', 'onest'],
    audacieux: ['unbounded', 'inter'], classique: ['eb-garamond', 'fira-sans'], simple: ['poppins', 'poppins']
  };
  fontPairs.forEach(function (p) { p.displayFont = PAIR_FONTS[p.id][0]; p.textFont = PAIR_FONTS[p.id][1]; });

  /* ------------------------------------------------------------------ fonts (theme.typography)
   * 33 Google Fonts in 5 styles: the heading font and the text font are chosen apart
   * (theme.typography.display / .text), the pairs above stay as « Suggestions ».
   *  - weights: the weights offered for the headings (all exist in the font); weight: the default one
   *  - text: true when the font reads well in paragraphs at 15 px (only those are offered for the texts)
   *  - glyphs: true when the font itself has ɛ ɔ ŋ Ɛ Ɔ Ŋ (Dioula, Baoulé, Bambara names). Checked on
   *    5 November 2026 with fontTools on the files Google serves (README « Fonts »): every font has the French
   *    accents and « » ’ œ; the ones with glyphs: false get these six letters from a tiny subset of Montserrat
   *    (sans, display, script) or Noto Serif (serif), exactly like the landing page's Poppins + Montserrat.
   *  - scale: how big the font looks next to the others at the same font-size (a script with a small
   *    x-height needs more room); headings and the text logo are multiplied by it (1 for the pairs' fonts)
   *  - opsz: the optical-size axis requested with the weights (the font then adapts its contrast to the size)
   *  - italic: the font has a real italic on Google Fonts (checked: ital,wght@1,400 answers 200). Plateau's
   *    signature (.jst-sign) is in italic: it is loaded for those fonts, the others write it upright (no fake slant)
   *  - text fonts need an x-height of at least 0.48 em (Inter 0.546), else paragraphs at 15 px read too small:
   *    EB Garamond (0.40) and Baloo 2 (0.46) are for titles only
   */
  var SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  var SERIF = "Georgia, 'Times New Roman', serif";
  var GLYPH_TEXT = 'ɛɔƐƆŋŊ'; // ɛ ɔ Ɛ Ɔ ŋ Ŋ
  var GLYPH_FALLBACKS = { sans: 'Montserrat', serif: 'Noto Serif' };
  var FONT_STYLES = [
    { id: 'elegant', label: 'Élégant', short: 'Élégant', hint: 'Avec empattements, raffiné : mode, bijoux, beauté haut de gamme.' },
    { id: 'moderne', label: 'Moderne', short: 'Moderne', hint: 'Net et lisible : tout type de boutique.' },
    { id: 'doux', label: 'Doux et arrondi', short: 'Arrondi', hint: 'Rond et tendre : beauté, enfants, douceurs.' },
    { id: 'audacieux', label: 'Audacieux', short: 'Audacieux', hint: 'Gros titres qui claquent : sneakers, street, food.' },
    { id: 'manuscrit', label: 'Manuscrit', short: 'Manuscrit', hint: 'Écrit à la main : artisanat, pâtisserie, cadeaux. Pour les titres seulement.' }
  ];
  function fontDef(id, name, style, o) {
    var kind = style === 'elegant' ? 'serif' : 'sans';
    var head = "'" + name + "', " + (o.glyphs ? '' : "'" + GLYPH_FALLBACKS[kind] + "', ");
    var tail = kind === 'serif' ? SERIF : SANS;
    var stack = o.stack || (head + tail);
    var scale = o.scale || 1;
    // A font drawn bigger or smaller (scale ≠ 1): until it arrives (or if it never does on slow data), the titles
    // use a local font resized by 1 / scale (@font-face size-adjust, see typography().faces), so they keep the
    // size the pairs' titles have instead of a system font blown up by the scale. Headings only (displayStack).
    var localFb = scale !== 1 && !o.stack ? 'jeere-fb-' + id : null;
    return {
      id: id, name: name, family: name, style: style, kind: kind, stack: stack,
      displayStack: localFb ? head + "'" + localFb + "', " + tail : stack, localFb: localFb,
      weights: o.weights, weight: o.weight || (o.weights.indexOf(600) !== -1 ? 600 : o.weights[o.weights.length - 1]),
      text: !!o.text, glyphs: !!o.glyphs, scale: scale, opsz: o.opsz || null, italic: !!o.italic,
      fallback: o.glyphs ? null : GLYPH_FALLBACKS[kind]
    };
  }
  var W_ALL = [300, 400, 500, 600, 700, 800, 900];
  var FONTS = collection([
    // Élégant (serif)
    fontDef('playfair', 'Playfair', 'elegant', { stack: "'Playfair', 'Playfair Display', " + SERIF, weights: [400, 500, 600, 700, 800, 900], weight: 600, glyphs: true, opsz: '5..1200', italic: true }),
    fontDef('cormorant-garamond', 'Cormorant Garamond', 'elegant', { weights: [300, 400, 500, 600, 700], weight: 600, scale: 1.14, italic: true }),
    fontDef('eb-garamond', 'EB Garamond', 'elegant', { stack: "'EB Garamond', Garamond, " + SERIF, weights: [400, 500, 600, 700, 800], weight: 600, glyphs: true, italic: true }),
    fontDef('bodoni-moda', 'Bodoni Moda', 'elegant', { weights: [400, 500, 600, 700, 800, 900], weight: 600, opsz: '6..96', italic: true }),
    fontDef('dm-serif-display', 'DM Serif Display', 'elegant', { weights: [400], weight: 400, italic: true }),
    fontDef('libre-baskerville', 'Libre Baskerville', 'elegant', { weights: [400, 500, 600, 700], weight: 600, glyphs: true, text: true, scale: 0.92, italic: true }),
    fontDef('lora', 'Lora', 'elegant', { weights: [400, 500, 600, 700], weight: 600, text: true, italic: true }),
    fontDef('fraunces', 'Fraunces', 'elegant', { weights: W_ALL, weight: 600, text: true, opsz: '9..144', italic: true }),
    fontDef('marcellus', 'Marcellus', 'elegant', { weights: [400], weight: 400 }),
    // Moderne (sans)
    fontDef('inter', 'Inter', 'moderne', { stack: INTER, weights: W_ALL, weight: 700, glyphs: true, text: true, italic: true }),
    fontDef('montserrat', 'Montserrat', 'moderne', { stack: "'Montserrat', " + SANS, weights: W_ALL, weight: 700, glyphs: true, text: true, italic: true }),
    fontDef('poppins', 'Poppins', 'moderne', { stack: "'Poppins', 'Montserrat', sans-serif", weights: W_ALL, weight: 600, text: true, italic: true }),
    fontDef('dm-sans', 'DM Sans', 'moderne', { weights: W_ALL, weight: 700, text: true, italic: true }),
    fontDef('manrope', 'Manrope', 'moderne', { weights: [300, 400, 500, 600, 700, 800], weight: 700, text: true }),
    fontDef('space-grotesk', 'Space Grotesk', 'moderne', { weights: [300, 400, 500, 600, 700], weight: 700, text: true }),
    fontDef('fira-sans', 'Fira Sans', 'moderne', { stack: "'Fira Sans', " + SANS, weights: W_ALL, weight: 600, glyphs: true, text: true, italic: true }),
    fontDef('onest', 'Onest', 'moderne', { stack: "'Onest', " + SANS, weights: W_ALL, weight: 600, glyphs: true, text: true }),
    // Doux et arrondi
    fontDef('nunito', 'Nunito', 'doux', { weights: W_ALL, weight: 700, text: true, italic: true }),
    fontDef('quicksand', 'Quicksand', 'doux', { weights: [300, 400, 500, 600, 700], weight: 700, text: true }),
    fontDef('comfortaa', 'Comfortaa', 'doux', { weights: [300, 400, 500, 600, 700], weight: 700, scale: 0.94 }),
    fontDef('baloo-2', 'Baloo 2', 'doux', { weights: [400, 500, 600, 700, 800], weight: 700 }),
    fontDef('fredoka', 'Fredoka', 'doux', { weights: [300, 400, 500, 600, 700], weight: 600 }),
    // Audacieux (display)
    fontDef('unbounded', 'Unbounded', 'audacieux', { stack: "'Unbounded', " + SANS, weights: W_ALL, weight: 600, glyphs: true }),
    fontDef('anton', 'Anton', 'audacieux', { weights: [400], weight: 400, glyphs: true, scale: 1.06 }),
    fontDef('bebas-neue', 'Bebas Neue', 'audacieux', { weights: [400], weight: 400, scale: 1.16 }),
    fontDef('archivo-black', 'Archivo Black', 'audacieux', { weights: [400], weight: 400, scale: 0.94 }),
    fontDef('oswald', 'Oswald', 'audacieux', { weights: [300, 400, 500, 600, 700], weight: 600, scale: 1.04 }),
    fontDef('bricolage-grotesque', 'Bricolage Grotesque', 'audacieux', { weights: [300, 400, 500, 600, 700, 800], weight: 700, text: true, opsz: '12..96' }),
    // Manuscrit (headings only)
    fontDef('pacifico', 'Pacifico', 'manuscrit', { weights: [400], weight: 400, scale: 0.94 }),
    fontDef('dancing-script', 'Dancing Script', 'manuscrit', { weights: [400, 500, 600, 700], weight: 700, scale: 1.14 }),
    fontDef('caveat', 'Caveat', 'manuscrit', { weights: [400, 500, 600, 700], weight: 700, scale: 1.24 }),
    fontDef('great-vibes', 'Great Vibes', 'manuscrit', { weights: [400], weight: 400, glyphs: true, scale: 1.28 }),
    fontDef('amatic-sc', 'Amatic SC', 'manuscrit', { weights: [400, 700], weight: 700, scale: 1.3 })
  ]);
  var TEXT_FONT_IDS = FONTS.filter(function (f) { return f.text; }).map(function (f) { return f.id; });
  // Weights the store's texts use (store.css: 400 body, 500 / 600 labels and buttons, 700 prices and bold)
  var TEXT_WEIGHTS = [400, 500, 600, 700];
  var WEIGHT_LABELS = { 100: 'Très fin', 200: 'Très fin', 300: 'Fin', 400: 'Normal', 500: 'Moyen', 600: 'Semi-gras', 700: 'Gras', 800: 'Très gras', 900: 'Noir' };
  // Heading size (« Taille des titres »): multiplies every title of the store (not the texts, not the header name)
  var HEADING_SIZES = { S: 0.86, M: 1, L: 1.16 };
  var HEADING_SIZE_OPTIONS = [{ value: 'S', label: 'Petits' }, { value: 'M', label: 'Moyens' }, { value: 'L', label: 'Grands' }];
  // Titles in capitals by default (Treichville writes its titles and its name in capitals)
  var HEADING_UPPER_DEFAULT = { plateau: false, cocody: false, treichville: true };
  var TYPO_KEYS = ['pair', 'display', 'text', 'size', 'weight', 'upper'];

  // A weight as she (or a tool) wrote it: a finite number from 1 to 1000, or a string of 3 digits ('650').
  // Anything else ('9e99', '700px', [700], -5) is NaN: not a weight.
  function weightNum(w) {
    var n = typeof w === 'number' ? w : (typeof w === 'string' && /^\s*\d{3}\s*$/.test(w) ? Number(w) : NaN);
    return isFinite(n) && n >= 1 && n <= 1000 ? n : NaN;
  }
  // Capitals by default: the template's choice (Treichville: capitals), except under a handwriting heading font,
  // which reads badly in capitals (all its titles, the name and, on Treichville, the checkout's step titles)
  function upperDefault(tpl, displayId) {
    var f = fontId(displayId) ? FONTS[fontId(displayId)] : null;
    if (f && f.style === 'manuscrit') return false;
    return !!HEADING_UPPER_DEFAULT[tpl];
  }
  function nearestWeight(w, list) {
    var n = weightNum(w);
    if (!isFinite(n) || !list || !list.length) return list && list.length ? list[0] : 400;
    var best = list[0];
    list.forEach(function (x) { if (Math.abs(x - n) < Math.abs(best - n) || (Math.abs(x - n) === Math.abs(best - n) && x > best)) best = x; });
    return best;
  }
  function fontId(v) { return typeof v === 'string' && inColl(FONTS, v.trim().toLowerCase()) ? v.trim().toLowerCase() : null; }

  // theme.typography, repaired (normalizeConfig). Never throws; null when nothing is left.
  // pair: the suggestion the fonts were chosen over. A tool that only knows theme.fonts (the Studio) changes the
  // pair: the old choices then no longer apply (render ignores them, normalizeConfig drops them).
  // customFonts: the fiche's theme.customFonts (normalized), so 'custom:<id>' is kept only when that font exists.
  // Not passed at all (an older caller): a well-formed 'custom:<id>' is kept as written.
  function normTypography(src, pairId, customFonts) {
    if (!isObj(src)) return null;
    var out = {};
    var pair = typeof src.pair === 'string' && inColl(fontPairs, src.pair) ? src.pair : null;
    var stale = pair !== null && pair !== pairId;
    var fams = customFonts === undefined ? null : customFamilies(customFonts);
    var own = {};
    function ref(v) {
      var id = fontId(v);
      if (id) return id;
      var m = typeof v === 'string' ? /^custom:(cf[1-9]\d*)$/.exec(v.trim()) : null;
      if (!m) return null;
      if (!fams) return 'custom:' + m[1];
      var f = customRef(v, fams);
      if (f) own['custom:' + m[1]] = f;
      return f ? 'custom:' + m[1] : null;
    }
    var display = ref(src.display);
    var text = ref(src.text);
    if (text && !own[text] && FONTS[text] && !FONTS[text].text) text = null;
    var hasWeight = isFinite(weightNum(src.weight));
    if (!stale && (display || text || hasWeight)) {
      out.pair = pairId;
      if (display) out.display = display;
      if (text) out.text = text;
      if (hasWeight) {
        var dfont = own[display] || FONTS[display] || (display ? null : FONTS[inColl(fontPairs, pairId) ? fontPairs[pairId].displayFont : 'playfair']);
        out.weight = dfont ? nearestWeight(src.weight, dfont.weights) : roundWeight(src.weight);
      }
    }
    var size = typeof src.size === 'string' ? src.size.trim().toUpperCase() : null;
    if (size === 'PETIT' || size === 'PETITS') size = 'S';
    if (size === 'GRAND' || size === 'GRANDS') size = 'L';
    if (size === 'MOYEN' || size === 'MOYENS') size = 'M';
    if (size && has(HEADING_SIZES, size)) out.size = size;
    if (has(src, 'upper') && src.upper !== null && src.upper !== undefined) out.upper = toBool(src.upper, false);
    return Object.keys(out).length ? out : null;
  }

  // The store's fonts as they render: the suggestion (theme.fonts) with the seller's choices over it.
  // { pair, custom, display, text (FONTS entries), weight, weights, size, scale, hs, hf, upper, upperSet,
  //   displayStack, textStack, links: [{ id, href }], families: ['Bodoni Moda', 'Inter'], fallbacks }
  // custom is false without theme.typography's fonts: render then uses the pair exactly as before.
  function typography(config) {
    var cfg = isObj(config) ? config : {};
    var theme = isObj(cfg.theme) ? cfg.theme : {};
    var tpl = typeof cfg.template === 'string' && inColl(templates, cfg.template) ? cfg.template : 'plateau';
    var pairId = typeof theme.fonts === 'string' && inColl(fontPairs, theme.fonts) ? theme.fonts : templates[tpl].defaults.fonts;
    var pair = fontPairs[pairId];
    var t = isObj(theme.typography) ? theme.typography : {};
    var stale = typeof t.pair === 'string' && t.pair !== pairId;
    // Her own fonts (theme.customFonts) are named 'custom:<id>'; any of them may be used for the texts
    var ownFams = Array.isArray(theme.customFonts) && (/^custom:/.test(t.display) || /^custom:/.test(t.text)) ? customFamilies(theme.customFonts) : [];
    var dOwn = stale ? null : customRef(t.display, ownFams);
    var tOwn = stale ? null : customRef(t.text, ownFams);
    var dId = dOwn ? dOwn.id : (!stale && fontId(t.display) ? fontId(t.display) : pair.displayFont);
    var tId = tOwn ? tOwn.id : (!stale && fontId(t.text) && FONTS[fontId(t.text)].text ? fontId(t.text) : pair.textFont);
    var display = dOwn || FONTS[dId];
    var text = tOwn || FONTS[tId];
    var wSet = !stale && isFinite(weightNum(t.weight));
    var weight = wSet ? nearestWeight(t.weight, display.weights) : (dId === pair.displayFont ? pair.display.weight : display.weight);
    var custom = dId !== pair.displayFont || tId !== pair.textFont || weight !== pair.display.weight;
    var size = typeof t.size === 'string' && has(HEADING_SIZES, t.size.toUpperCase()) ? t.size.toUpperCase() : 'M';
    var upperSet = typeof t.upper === 'boolean';
    var upperDef = upperDefault(tpl, dId);
    var upper = upperSet ? t.upper : upperDef;
    var scale = display.scale || 1;
    var out = {
      pair: pairId, custom: custom, display: display, text: text, weight: weight, weights: display.weights.slice(),
      size: size, scale: scale, hs: Math.round(HEADING_SIZES[size] * scale * 1000) / 1000, hf: scale,
      upper: upper, upperSet: upperSet, upperDefault: upperDef,
      // data-hcase on the store: 'upper' / 'none' when it differs from what the template writes, else null
      hcase: upperSet || upper !== !!HEADING_UPPER_DEFAULT[tpl] ? (upper ? 'upper' : 'none') : null,
      // A real italic for Plateau's signature (.jst-sign), else render writes it upright (data-hital="none")
      italic: custom ? display.italic : true,
      displayStack: custom ? display.displayStack : pair.display.family,
      textStack: custom ? text.stack : pair.text.family,
      links: [], families: [], fallbacks: [], faces: []
    };
    if (!custom) {
      out.links.push({ id: 'jst-font-' + pairId, href: pair.googleUrl });
      out.families = [display.family, text.family].filter(function (f, i, a) { return a.indexOf(f) === i; });
      return out;
    }
    // Only the weights used: the headings' weight (+ 400, the plateau quotes and signatures), the texts' 400–700
    var want = {};
    function need(font, ws) {
      var list = want[font.id] || (want[font.id] = []);
      ws.forEach(function (w) { var n = nearestWeight(w, font.weights); if (list.indexOf(n) === -1) list.push(n); });
    }
    need(display, [weight, 400]);
    need(text, TEXT_WEIGHTS);
    // Plateau's signature is in italic 400 in the heading font: its real italic, when it has one
    var ital = tpl === 'plateau' && display.italic ? [400] : null;
    var fams = [];
    var files = [];
    var fb = {};
    [display, text].forEach(function (f) {
      if (fams.indexOf(f) !== -1 || files.indexOf(f) !== -1) return;
      // her imported files are inline @font-face rules (faces), every other font comes from Google Fonts
      if (f.source === 'file') files.push(f); else fams.push(f);
      if (f.fallback) { fb[f.fallback] = fb[f.fallback] || []; want[f.id].forEach(function (w) { if (fb[f.fallback].indexOf(w) === -1) fb[f.fallback].push(w); }); }
    });
    // One stylesheet for the fonts of the list; a Google font she added by name gets its own, so a weight Google
    // no longer serves (the stylesheet then fails as a whole) never takes the other font down with it
    var listed = fams.filter(function (f) { return !f.custom; });
    [listed].concat(fams.filter(function (f) { return f.custom; }).map(function (f) { return [f]; })).forEach(function (group) {
      if (!group.length) return;
      var href = 'https://fonts.googleapis.com/css2?' + group.map(function (f) { return 'family=' + familyParam(f, want[f.id], f === display ? ital : null); }).join('&') + '&display=swap';
      out.links.push({ id: 'jst-font-c-' + hashStr(href), href: href });
    });
    out.families = fams.map(function (f) { return f.family; });
    // Her files: one @font-face per file of the family (font-display: swap), the names she reads in own
    if (files.length) {
      out.faces = out.faces.concat(customFontFaces(null, files));
      out.own = files.map(function (f) { return f.name; });
    }
    // A text font of hers with no bold of its own: the browser may thicken it (render: data-fsynth)
    if (text.custom && !text.weights.some(function (w) { return w >= 600; })) out.synth = true;
    // A family that already has the letters is loaded anyway (Montserrat as the text font): no subset of it
    var fbNames = Object.keys(fb).filter(function (n) { return out.families.indexOf(n) === -1; });
    if (fbNames.length) {
      var fhref = 'https://fonts.googleapis.com/css2?' + fbNames.map(function (n) {
        return 'family=' + n.replace(/ /g, '+') + ':wght@' + fb[n].sort(function (a, b) { return a - b; }).join(';');
      }).join('&') + '&text=' + encodeURIComponent(GLYPH_TEXT) + '&display=swap';
      out.links.push({ id: 'jst-font-fb-' + hashStr(fhref), href: fhref, fallback: true });
      out.fallbacks = fbNames;
    }
    // The local stand-in of a heading font drawn bigger or smaller (see fontDef): no download, a system font
    // resized by 1 / scale, so the titles keep their usual size until the web font arrives
    if (display.localFb) {
      var locals = display.kind === 'serif'
        ? ['Georgia', 'Times New Roman', 'Noto Serif', 'Liberation Serif', 'DejaVu Serif']
        : ['Arial', 'Helvetica', 'Roboto', 'Liberation Sans', 'DejaVu Sans'];
      out.faces.push({
        id: 'jst-font-l-' + display.id,
        css: "@font-face{font-family:'" + display.localFb + "';src:" + locals.map(function (n) { return "local('" + n + "')"; }).join(',') +
          ';size-adjust:' + (Math.round(10000 / display.scale) / 100) + '%}'
      });
    }
    return out;
  }
  // family=Name:wght@400;600, with the optical-size axis when the font has one, and the italic weights (ital)
  function familyParam(font, ws, ital) {
    var list = ws.slice().sort(function (a, b) { return a - b; });
    var fam = font.family.replace(/ /g, '+');
    var o = font.opsz ? font.opsz + ',' : '';
    var axes = (font.opsz ? 'opsz,' : '') + 'wght';
    if (ital && ital.length) {
      var it = ital.slice().sort(function (a, b) { return a - b; });
      return fam + ':ital,' + axes + '@' + list.map(function (w) { return '0,' + o + w; }).concat(it.map(function (w) { return '1,' + o + w; })).join(';');
    }
    return fam + ':' + axes + '@' + list.map(function (w) { return o + w; }).join(';');
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0; }
    return (h >>> 0).toString(36);
  }
  // The editor's picker shows each font in its own face: only the letters of its name (a few KB each)
  function fontSampleUrl(id, sample) {
    var f = FONTS[fontId(id) || 'inter'];
    var txt = String(sample == null ? f.name : sample);
    return 'https://fonts.googleapis.com/css2?family=' + f.family.replace(/ /g, '+') + ':wght@' + f.weight +
      '&text=' + encodeURIComponent(txt) + '&display=swap';
  }
  // Choosing a suggestion (a pair) in any tool: the pair's fonts and weight, the seller's size and capitals kept
  function setFontPair(config, pairId) {
    if (!isObj(config) || !inColl(fontPairs, pairId)) return false;
    if (!isObj(config.theme)) config.theme = {};
    config.theme.fonts = pairId;
    var t = config.theme.typography;
    if (isObj(t)) {
      delete t.display; delete t.text; delete t.weight; delete t.pair;
      if (!Object.keys(t).length) delete config.theme.typography;
    }
    return true;
  }

  /* ------------------------------------------------------------------ her own fonts (theme.customFonts)
   * « Mes polices »: font files she imports (WOFF2, WOFF, TTF, OTF; the editor reads their name, weight, style and
   * letters with fontfile.js) and Google Fonts she adds by name, beyond the 33. Optional, never added by
   * defaultConfig or normalizeConfig. theme.typography.display / .text name one with 'custom:<id>'.
   *  - a file: { id: 'cf1', name, weight, style: 'normal' | 'italic', format: 'woff2' | 'woff' | 'ttf' | 'otf',
   *    data: 'data:font/<format>;base64,…', size (bytes), weightRange?: [min, max] (a variable font),
   *    glyphs?: has ɛ ɔ ŋ Ɛ Ɔ Ŋ, accents?: has the French accents, kind?: 'serif' | 'sans' (the ɛ ɔ ŋ fallback) }
   *    Files with the same name are one family (a Regular and a Bold): one 'jeere-u-<hash>' @font-face family.
   *  - a Google font: { id, name: 'Josefin Sans', source: 'google', weights: [400, 700], italic?, glyphs?, kind? }
   */
  var CUSTOM_FONT_LIMITS = { files: 4, google: 4, bytes: 400 * 1024, heavy: 200 * 1024, name: 40, read: 4 * 1024 * 1024 };
  CUSTOM_FONT_LIMITS.chars = 'data:font/woff2;base64,'.length + Math.ceil(CUSTOM_FONT_LIMITS.bytes / 3) * 4;
  var FONT_FORMAT_CSS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
  var FONT_DATA_RE = /^data:(?:font\/(?:woff2|woff|ttf|otf|sfnt)|application\/(?:font-woff2?|x-font-woff2?|x-font-ttf|x-font-truetype|x-font-otf|x-font-opentype|font-sfnt|vnd\.ms-opentype|octet-stream));base64,([A-Za-z0-9+/]+={0,2})$/;
  var CUSTOM_ID_RE = /^cf[1-9]\d*$/;
  var B64_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // The format a font data URL really holds, from its first bytes (never from its mime type)
  function fontDataFormat(url) {
    if (typeof url !== 'string' || url.length > CUSTOM_FONT_LIMITS.chars + 64) return null;
    var i = url.indexOf(';base64,');
    if (i < 0 || i > 48) return null;
    var head = url.substr(i + 8, 8);
    if (head.length < 8) return null;
    var bytes = [];
    for (var k = 0; k < 8; k += 4) {
      var n = 0;
      for (var j = 0; j < 4; j++) { var v = B64_ALPHA.indexOf(head.charAt(k + j)); if (v < 0) return null; n = n * 64 + v; }
      bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    var tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (tag === 'wOF2') return 'woff2';
    if (tag === 'wOFF') return 'woff';
    if (tag === 'OTTO') return 'otf';
    if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return 'ttf';
    return null;
  }
  // { data (canonical 'data:font/<format>;base64,…'), format, size } or null (not a font, too heavy, broken)
  function normFontData(v) {
    if (typeof v !== 'string' || v.length > CUSTOM_FONT_LIMITS.chars + 64) return null;
    var m = FONT_DATA_RE.exec(v);
    if (!m) return null;
    var format = fontDataFormat(v);
    if (!format) return null;
    var b64 = m[1];
    if (b64.length % 4) return null;
    var size = b64.length / 4 * 3 - (b64.charAt(b64.length - 1) === '=' ? (b64.charAt(b64.length - 2) === '=' ? 2 : 1) : 0);
    if (size > CUSTOM_FONT_LIMITS.bytes || size < 12) return null;
    var prefix = 'data:font/' + format + ';base64,';
    return { data: v.lastIndexOf(prefix, 0) === 0 ? v : prefix + b64, format: format, size: size };
  }
  // A name as she reads it (« Ma police »): no control characters, no quotes or brackets, at most 40 characters
  function cleanFontName(v) {
    if (typeof v !== 'string') return '';
    var s = v.replace(/[\u0000-\u001F\u007F-\u009F"'`\\<>{};]/g, '').replace(/\s+/g, ' ').trim();
    return s.length > CUSTOM_FONT_LIMITS.name ? clip(s, CUSTOM_FONT_LIMITS.name).trim() : s;
  }
  // A Google Fonts family name as Google writes it (letters, digits, spaces): 'Josefin Sans', 'M PLUS 1p'
  function googleFamilyName(v) {
    if (typeof v !== 'string') return null;
    var s = v.replace(/\s+/g, ' ').trim();
    return /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(s) ? s : null;
  }
  // A weight on the 100 … 900 scale the store uses (350 → 400, a tie goes up), else null
  function roundWeight(w) {
    var n = weightNum(w);
    if (!isFinite(n)) return null;
    return Math.min(900, Math.max(100, Math.floor(n / 100 + 0.5) * 100));
  }
  // theme.customFonts, repaired (normalizeConfig). Never throws; null when nothing is left.
  function normCustomFonts(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    var files = 0, google = 0, seenG = {};
    list.forEach(function (e) {
      if (!isObj(e)) return;
      var item;
      if (e.source === 'google') {
        var gname = googleFamilyName(e.name);
        if (!gname || seenG[gname.toLowerCase()] || google >= CUSTOM_FONT_LIMITS.google) return;
        var ws = [];
        (Array.isArray(e.weights) ? e.weights : []).forEach(function (w) { var r = roundWeight(w); if (r && ws.indexOf(r) === -1) ws.push(r); });
        ws.sort(function (a, b) { return a - b; });
        item = { id: e.id, name: gname, source: 'google', weights: ws.length ? ws : [400] };
        if (e.italic === true) item.italic = true;
        google++;
        seenG[gname.toLowerCase()] = true;
      } else {
        if (files >= CUSTOM_FONT_LIMITS.files) return;
        var fd = normFontData(e.data);
        if (!fd) return;
        var w0 = roundWeight(e.weight) || 400;
        item = {
          id: e.id, name: cleanFontName(e.name) || 'Ma police', weight: w0,
          style: e.style === 'italic' || e.style === 'oblique' ? 'italic' : 'normal', format: fd.format, data: fd.data, size: fd.size
        };
        if (Array.isArray(e.weightRange) && e.weightRange.length === 2) {
          var lo = roundWeight(e.weightRange[0]), hi = roundWeight(e.weightRange[1]);
          if (lo && hi && lo < hi) { item.weightRange = [lo, hi]; item.weight = Math.min(hi, Math.max(lo, w0)); }
        }
        if (typeof e.accents === 'boolean') item.accents = e.accents;
        files++;
      }
      if (typeof e.glyphs === 'boolean') item.glyphs = e.glyphs;
      if (e.kind === 'serif' || e.kind === 'sans') item.kind = e.kind;
      out.push(item);
    });
    assignIds(out, 'cf');
    return out.length ? out : null;
  }
  function fontKey(name) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim(); }
  // Her fonts as families (font objects shaped like FONTS entries, style 'mine'): the files of one name together
  // (a Regular and a Bold of one font), each Google font alone. id: 'custom:<id of its first file>'; ids: all.
  function customFamilies(src) {
    var list = isObj(src) && isObj(src.theme) ? src.theme.customFonts : src;
    if (!Array.isArray(list)) return [];
    var fams = [];
    var byKey = {};
    list.forEach(function (e) {
      if (!isObj(e) || typeof e.id !== 'string' || !CUSTOM_ID_RE.test(e.id) || typeof e.name !== 'string' || !e.name.trim()) return;
      var google = e.source === 'google';
      if (google ? !googleFamilyName(e.name) : !normFontData(e.data)) return;
      var key = (google ? 'g:' : 'u:') + fontKey(e.name);
      var f = byKey[key];
      if (!f) { f = byKey[key] = { key: key, source: google ? 'google' : 'file', ids: [], entries: [] }; fams.push(f); }
      f.ids.push(e.id);
      f.entries.push(e);
    });
    return fams.map(customFontDef);
  }
  function customFontDef(f) {
    var google = f.source === 'google';
    var e0 = f.entries[0];
    var kind = f.entries.some(function (e) { return e.kind === 'serif'; }) ? 'serif' : 'sans';
    var glyphs = f.entries.every(function (e) { return e.glyphs === true; });
    var weights = [];
    var addW = function (w) { var r = roundWeight(w); if (r && weights.indexOf(r) === -1) weights.push(r); };
    if (google) (Array.isArray(e0.weights) ? e0.weights : [400]).forEach(addW);
    else {
      var upright = f.entries.filter(function (e) { return e.style !== 'italic'; });
      (upright.length ? upright : f.entries).forEach(function (e) {
        if (Array.isArray(e.weightRange)) W_ALL.forEach(function (w) { if (w >= e.weightRange[0] && w <= e.weightRange[1]) addW(w); });
        addW(e.weight);
      });
    }
    if (!weights.length) weights.push(400);
    weights.sort(function (a, b) { return a - b; });
    var family = google ? googleFamilyName(e0.name) : 'jeere-u-' + hashStr(f.key);
    var tail = kind === 'serif' ? SERIF : SANS;
    var stack = "'" + family + "', " + (glyphs ? '' : "'" + GLYPH_FALLBACKS[kind] + "', ") + tail;
    var size = 0;
    f.entries.forEach(function (e) { if (typeof e.size === 'number') size += e.size; });
    return {
      id: 'custom:' + f.ids[0], ids: f.ids.slice(), key: f.key, name: google ? family : cleanFontName(e0.name) || 'Ma police',
      family: family, style: 'mine', kind: kind, stack: stack, displayStack: stack, localFb: null,
      weights: weights, weight: nearestWeight(650, weights), text: true, glyphs: glyphs,
      accents: google ? true : f.entries.every(function (e) { return e.accents !== false; }),
      scale: 1, opsz: null, italic: google ? e0.italic === true : f.entries.some(function (e) { return e.style === 'italic'; }),
      fallback: glyphs ? null : GLYPH_FALLBACKS[kind], custom: true, source: f.source, entries: f.entries.slice(), size: size
    };
  }
  // 'custom:cf2' → its family, or null
  function customRef(v, fams) {
    var m = typeof v === 'string' ? /^custom:(cf[1-9]\d*)$/.exec(v.trim()) : null;
    if (!m) return null;
    for (var i = 0; i < fams.length; i++) if (fams[i].ids.indexOf(m[1]) !== -1) return fams[i];
    return null;
  }
  // A font of the store by id: one of the 33 ('bodoni-moda') or one of hers ('custom:cf1'); null when unknown
  function fontOf(config, v) {
    var id = fontId(v);
    if (id) return FONTS[id];
    return customRef(v, customFamilies(config));
  }
  // The @font-face rules of her imported files (one per file, font-display: swap). Only the families given
  // (font objects of customFamilies), else every file: the editor's « Mes polices » list shows them all.
  function customFontFaces(config, only) {
    var fams = only || customFamilies(config);
    var out = [];
    fams.forEach(function (f) {
      if (!f || f.source !== 'file') return;
      f.entries.forEach(function (e) {
        var fd = normFontData(e.data);
        if (!fd) return;
        var w = roundWeight(e.weight) || 400;
        var wr = Array.isArray(e.weightRange) && roundWeight(e.weightRange[0]) && roundWeight(e.weightRange[1]) ? roundWeight(e.weightRange[0]) + ' ' + roundWeight(e.weightRange[1]) : String(w);
        var style = e.style === 'italic' ? 'italic' : 'normal';
        // the id changes with the file: a sample of the data (hashing all of it on every render would cost)
        var d = fd.data;
        var sample = d.length + ':' + d.slice(-96);
        for (var k = 64; k < d.length; k += Math.max(1, Math.floor(d.length / 512))) sample += d.charAt(k);
        out.push({
          id: 'jst-font-u-' + hashStr(f.family + '|' + e.id + '|' + wr + '|' + style + '|' + sample),
          css: "@font-face{font-family:'" + f.family + "';src:url(" + d + ") format('" + FONT_FORMAT_CSS[fd.format] + "');font-weight:" + wr +
            ';font-style:' + style + ';font-display:swap}'
        });
      });
    });
    return out;
  }
  // The editor's picker shows a Google font she adds in its own face: only the letters of its name
  function googleSampleUrl(name, weight, sample) {
    var fam = googleFamilyName(name);
    if (!fam) return null;
    var w = roundWeight(weight) || 400;
    return 'https://fonts.googleapis.com/css2?family=' + fam.replace(/ /g, '+') + ':wght@' + w +
      (sample ? '&text=' + encodeURIComponent(String(sample)) : '') + '&display=swap';
  }

  /* ------------------------------------------------------------------ communes */

  var communes = [
    { name: 'Abobo', fee: 2500 },
    { name: 'Adjamé', fee: 2000 },
    { name: 'Attécoubé', fee: 2500 },
    { name: 'Cocody', fee: 1500 },
    { name: 'Koumassi', fee: 2000 },
    { name: 'Marcory', fee: 1500 },
    { name: 'Plateau', fee: 1500 },
    { name: 'Port-Bouët', fee: 2500 },
    { name: 'Treichville', fee: 1500 },
    { name: 'Yopougon', fee: 3000 },
    { name: 'Bingerville', fee: 3000 }
  ];

  /* ------------------------------------------------------------------ demo photos
   * Real photos for the example stores, hosted with the app in creer/img/demo/ (never loaded from
   * another site): 8 per niche (6 products, the hero, the about section), plus 5 for the mock-ups of
   * the landing page. Without this catalogue, every store shows its illustrations.
   *
   * DEMO_PHOTOS = { '<id>': entry }, the id in lower case words joined by hyphens
   * (^[a-z0-9]+(?:-[a-z0-9]+)*$): '<niche>-<file name>'. The entry:
   *   {
   *     file: 'beauty/savon-noir-karite.webp',    // path under creer/img/demo/
   *     focus: '50% 50%',                         // optional: CSS object-position of the crop
   *     alt: 'Pain de savon noir posé sur du marbre blanc…',   // French description of the photo
   *     credit: {
   *       name: 'Photographer Name', username: 'unsplash_username',
   *       photoUrl: 'https://unsplash.com/photos/<id>', profileUrl: 'https://unsplash.com/@username'
   *     }
   *   }
   * Ids and file names come from the photo search and were kept when a product was renamed to
   * match its photo (food-sauce-graine-riz is the « Sauce gombo et riz »): see creer/README.md.
   * The photos come from Unsplash (Unsplash License: free to use, commercial use included, no
   * permission needed). We credit each photographer anyway: in the editor under the photo, and in
   * creer/img/demo/CREDITS.md.
   *
   * A fiche names a photo by its id only: products[].photo, and settings.photo of the hero and
   * about sections (null when there is none). What shows: the seller's own image (image) first,
   * then the demo photo, then the illustration. normalizeConfig turns an id the catalogue does not
   * know into null. JeereRender.photoSrc(id) gives the URL.
   */
  var DEMO_PHOTOS = {
    // fashion
    'fashion-robe-portefeuille': {
      file: 'fashion/robe-portefeuille.webp', focus: '50% 5%',
      alt: 'Femme portant une robe portefeuille noire sans manches, à col à revers et ceinture à boucle, sur fond turquoise',
      credit: { name: 'McFollis', username: 'thisismcfollis', photoUrl: 'https://unsplash.com/photos/young-woman-in-black-dress-and-glasses-on-blue-background-4myUEOinXxs', profileUrl: 'https://unsplash.com/@thisismcfollis' }
    },
    'fashion-robe-chemise-lin': {
      file: 'fashion/robe-chemise-lin.webp', focus: '50% 30%',
      alt: 'Femme coiffée d’un chapeau de paille portant une robe chemise blanche froissée à col et taille froncée, sur une plage',
      credit: { name: 'INHB WORLDWIDE', username: 'inhb2014', photoUrl: 'https://unsplash.com/photos/a-woman-standing-on-a-beach-talking-on-a-cell-phone-hzUVGcC5bNM', profileUrl: 'https://unsplash.com/@inhb2014' }
    },
    'fashion-ensemble-pagne-tisse': {
      file: 'fashion/ensemble-pagne-tisse.webp', focus: '50% 75%',
      alt: 'Homme portant une tunique en pagne tissé à rayures bleues et blanches devant une palissade bleu clair',
      credit: { name: 'Oswald Elsaboath', username: 'ozzzyphotos', photoUrl: 'https://unsplash.com/photos/man-in-traditional-striped-clothing-stands-by-blue-fence-vezuIcFOPfU', profileUrl: 'https://unsplash.com/@ozzzyphotos' }
    },
    'fashion-ensemble-tunique-pantalon': {
      file: 'fashion/ensemble-tunique-pantalon.webp', focus: '50% 35%',
      alt: 'Femme en ensemble tunique et pantalon large en wax vert et orange, foulard assorti, devant une palissade en bambou',
      credit: { name: 'Delight Dzansi', username: 'alkebulanprints', photoUrl: 'https://unsplash.com/photos/a-person-in-a-colorful-dress-FiggxDNdkUs', profileUrl: 'https://unsplash.com/@alkebulanprints' }
    },
    'fashion-chemise-col-mao': {
      file: 'fashion/chemise-col-mao.webp', focus: '50% 50%',
      alt: 'Chemise homme bleu marine à col mao en lin, suspendue à un cintre en bois sur fond beige',
      credit: { name: 'tian dayong', username: 'tonnnyj', photoUrl: 'https://unsplash.com/photos/a-blue-shirt-hanging-on-a-clothes-line-8UsQoiJLNNQ', profileUrl: 'https://unsplash.com/@tonnnyj' }
    },
    'fashion-chemise-oversize': {
      file: 'fashion/chemise-oversize.webp', focus: '50% 10%',
      alt: 'Jeune femme portant une chemise oversize bleu ciel ouverte sur un débardeur blanc et un pantalon beige',
      credit: { name: 'Good Faces', username: 'goodfacesagency', photoUrl: 'https://unsplash.com/photos/a-woman-in-a-white-top-and-tan-pants-NVwweuXv2vg', profileUrl: 'https://unsplash.com/@goodfacesagency' }
    },
    'fashion-hero': {
      file: 'fashion/hero.webp', focus: '50% 40%',
      alt: 'Portrait éditorial d’une femme coiffée d’un gélé imprimé bleu et vêtue d’une veste bleu vif',
      credit: { name: 'Ben Iwara', username: '1hundredimages', photoUrl: 'https://unsplash.com/photos/woman-in-blue-headwrap-in-lagos-VFiTzNzaTeU', profileUrl: 'https://unsplash.com/@1hundredimages' }
    },
    'fashion-about': {
      file: 'fashion/about.webp', focus: '50% 45%',
      alt: 'Deux couturières en robes en wax penchées sur un tissu près d’une machine à coudre, dans un atelier tapissé de pagnes',
      credit: { name: 'Unavailable Photographer', username: 'unavailablephotographer', photoUrl: 'https://unsplash.com/photos/women-sewing-fabric-in-workshop-KK1SKkRfk1c', profileUrl: 'https://unsplash.com/@unavailablephotographer' }
    },
    // hair
    'hair-perruque-lisse-14': {
      file: 'hair/perruque-lisse-14.webp', focus: '50% 20%',
      alt: 'Femme noire souriante portant une perruque lisse noire aux longueurs soyeuses, fond beige',
      credit: { name: 'John Ekow', username: 'jaughnekow_', photoUrl: 'https://unsplash.com/photos/woman-with-long-black-hair-pJ5yzJNpfVg', profileUrl: 'https://unsplash.com/@jaughnekow_' }
    },
    'hair-perruque-bouclee-carre': {
      file: 'hair/perruque-bouclee-carre.webp', focus: '50% 55%',
      alt: 'Perruque bouclée mi-longue couleur miel cuivré posée sur une tête de mannequin, vue de dos',
      credit: { name: 'J Morgan', username: 'jerrold01', photoUrl: 'https://unsplash.com/photos/a-womans-hair-with-a-braid-fNFf_XBASTQ', profileUrl: 'https://unsplash.com/@jerrold01' }
    },
    'hair-perruque-bob-blond-miel': {
      file: 'hair/perruque-bob-blond-miel.webp', focus: '50% 25%',
      alt: 'Femme noire portant une perruque courte blond platine avec frange, main sur la joue, fond beige',
      credit: { name: 'David Banjo', username: 'davidbvnjo', photoUrl: 'https://unsplash.com/photos/person-with-blonde-hair-and-dark-jacket-touching-their-face-1kVvRKJ34Yk', profileUrl: 'https://unsplash.com/@davidbvnjo' }
    },
    'hair-meches-ondulees-lot-3': {
      file: 'hair/meches-ondulees-lot-3.webp', focus: '50% 30%',
      alt: 'Femme vue de dos avec de longues mèches noires ondulées, fond blanc',
      credit: { name: 'Sunber Hair', username: 'alisalucy', photoUrl: 'https://unsplash.com/photos/woman-poses-with-long-flowing-black-hair-S862PXCdSHk', profileUrl: 'https://unsplash.com/@alisalucy' }
    },
    'hair-meches-kinky-tresses': {
      file: 'hair/meches-kinky-tresses.webp', focus: '50% 10%',
      alt: 'Femme noire souriante coiffée de longues box braids relevées en chignon, haut à motifs géométriques, fond clair',
      credit: { name: 'Gustavo Spindula', username: 'gspindula', photoUrl: 'https://unsplash.com/photos/woman-wearing-multicolored-blouse-and-braided-hair-K2D7muBun1A', profileUrl: 'https://unsplash.com/@gspindula' }
    },
    'hair-huile-legere-perruque': {
      file: 'hair/huile-legere-perruque.webp', focus: '50% 55%',
      alt: 'Flacon compte-gouttes d’huile dorée aux pétales de fleurs séchées sur fond crème',
      credit: { name: 'sam limon', username: 'limone', photoUrl: 'https://unsplash.com/photos/yellow-and-white-plastic-bottle-g5oq-wH71OQ', profileUrl: 'https://unsplash.com/@limone' }
    },
    'hair-hero': {
      file: 'hair/hero.webp', focus: '50% 35%',
      alt: 'Femme noire souriante aux longs cheveux bouclés volumineux, fond doré flou',
      credit: { name: 'Jabari Timothy', username: 'jabarib', photoUrl: 'https://unsplash.com/photos/a-close-up-of-a-person-with-long-hair-bT3c6aMlbbE', profileUrl: 'https://unsplash.com/@jabarib' }
    },
    'hair-about': {
      file: 'hair/about.webp', focus: '50% 40%',
      alt: 'Mains d’une coiffeuse tressant des nattes collées pour une pose de mèches en salon',
      credit: { name: 'Mohamed B.', username: 'bangscreative', photoUrl: 'https://unsplash.com/photos/hands-braiding-hair-with-extensions-S6S4jH8KQjg', profileUrl: 'https://unsplash.com/@bangscreative' }
    },
    // beauty
    'beauty-beurre-karite-fouette': {
      file: 'beauty/beurre-karite-fouette.webp', focus: '50% 50%',
      alt: 'Bol de beurre de karité brut en morceaux sur un plan de travail en marbre blanc',
      credit: { name: 'Alex Bayev', username: 'alexbayev', photoUrl: 'https://unsplash.com/photos/a-bowl-of-food-that-is-on-a-table-dmusxNBR2hk', profileUrl: 'https://unsplash.com/@alexbayev' }
    },
    'beauty-savon-noir-karite': {
      file: 'beauty/savon-noir-karite.webp', focus: '50% 50%',
      alt: 'Pain de savon noir posé sur du marbre blanc, avec un brin de lavande et un linge en lin',
      credit: { name: 'Miguel Constantin Montes', username: 'createwithconstantin', photoUrl: 'https://unsplash.com/photos/a-gray-book-sitting-on-top-of-a-table-next-to-flowers-x4021J6aHfw', profileUrl: 'https://unsplash.com/@createwithconstantin' }
    },
    'beauty-huile-coco-vierge': {
      file: 'beauty/huile-coco-vierge.webp', focus: '50% 40%',
      alt: 'Petite bouteille d’huile de coco à côté d’un bocal de noix de coco râpée et d’une noix de coco ouverte',
      credit: { name: 'Tijana Drndarski', username: 'izgubljenausvemiru', photoUrl: 'https://unsplash.com/photos/white-powder-in-clear-glass-jar-beside-brown-wooden-spoon-Bb8_yBkb_6E', profileUrl: 'https://unsplash.com/@izgubljenausvemiru' }
    },
    'beauty-serum-eclat-baobab': {
      file: 'beauty/serum-eclat-baobab.webp', focus: '50% 40%',
      alt: 'Flacon compte-gouttes ambré de sérum posé sur un socle en bois, ombres de palmes sur un mur clair',
      credit: { name: 'Kadarius Seegars', username: 'kseegars', photoUrl: 'https://unsplash.com/photos/brown-glass-bottle-on-white-table-b9KAwJRBXgw', profileUrl: 'https://unsplash.com/@kseegars' }
    },
    'beauty-masque-argile': {
      file: 'beauty/masque-argile.webp', focus: '50% 50%',
      alt: 'Petit bol de masque à l’argile verte avec un pinceau d’application sur fond blanc',
      credit: { name: 'Towfiqu barbhuiya', username: 'towfiqu999999', photoUrl: 'https://unsplash.com/photos/green-ceramic-round-bowl-on-white-table-0BEqLfQwVzM', profileUrl: 'https://unsplash.com/@towfiqu999999' }
    },
    'beauty-coffret-decouverte': {
      file: 'beauty/coffret-decouverte.webp', focus: '50% 50%',
      alt: 'Coffret cadeau emballé dans du papier kraft à motifs végétaux, noué d’un ruban noir',
      credit: { name: 'Fiona Murray-deGraaff', username: 'fionamurrayphoto', photoUrl: 'https://unsplash.com/photos/a-wrapped-gift-box-with-a-black-ribbon-beJTnEGzbAM', profileUrl: 'https://unsplash.com/@fionamurrayphoto' }
    },
    'beauty-hero': {
      file: 'beauty/hero.webp', focus: '50% 35%',
      alt: 'Femme noire à la peau ébène lumineuse et hydratée, souriante, sur fond orange',
      credit: { name: 'Eze Joseph', username: 'justbeingblythe', photoUrl: 'https://unsplash.com/photos/a-black-woman-laughing-with-her-eyes-closed-7l5j_afULjk', profileUrl: 'https://unsplash.com/@justbeingblythe' }
    },
    'beauty-about': {
      file: 'beauty/about.webp', focus: '50% 35%',
      alt: 'Femmes en pagnes wax réunies dans la cour d’une coopérative de beurre de karité',
      credit: { name: 'Kai-Liis Lepik', username: 'fairtaleghana', photoUrl: 'https://unsplash.com/photos/3G86T9Zwc80', profileUrl: 'https://unsplash.com/@fairtaleghana' }
    },
    // jewellery
    'jewellery-collier-perles-verre': {
      file: 'jewellery/collier-perles-verre.webp', focus: '50% 45%',
      alt: 'Collier ras-du-cou en perles de verre noires avec pendentif brodé de perles multicolores, porté sur un haut noir',
      credit: { name: 'Divaris Shirichena', username: 'divaris', photoUrl: 'https://unsplash.com/photos/woman-wearing-a-colorful-beaded-necklace-and-earrings-vNM_8K6EILc', profileUrl: 'https://unsplash.com/@divaris' }
    },
    'jewellery-creoles-martelees': {
      file: 'jewellery/creoles-martelees.webp', focus: '50% 50%',
      alt: 'Paire de créoles dorées torsadées posées sur un galet blanc, ombres de lumière naturelle',
      credit: { name: 'Nataliya Melnychuk', username: 'natinati', photoUrl: 'https://unsplash.com/photos/gold-twisted-hoop-earrings-on-stones-5ngCICAXiH0', profileUrl: 'https://unsplash.com/@natinati' }
    },
    'jewellery-pendants-goutte-resine': {
      file: 'jewellery/pendants-goutte-resine.webp', focus: '50% 50%',
      alt: 'Boucles d’oreilles pendantes en forme de goutte en résine transparente avec fleurs violettes séchées',
      credit: { name: 'Samuel Charris', username: 'sammiel56', photoUrl: 'https://unsplash.com/photos/silver-and-purple-heart-pendant-R2Jq3QX_cGQ', profileUrl: 'https://unsplash.com/@sammiel56' }
    },
    'jewellery-bracelet-jonc-grave': {
      file: 'jewellery/bracelet-jonc-grave.webp', focus: '50% 50%',
      alt: 'Bracelet jonc doré aux motifs gravés posé sur un présentoir blanc et un drapé satiné',
      credit: { name: 'Imam Kurniawan', username: 'iklalu', photoUrl: 'https://unsplash.com/photos/a-gold-ring-on-a-white-surface-2EF7dcbdZAI', profileUrl: 'https://unsplash.com/@iklalu' }
    },
    'jewellery-bracelets-perles-lot-3': {
      file: 'jewellery/bracelets-perles-lot-3.webp', focus: '50% 45%',
      alt: 'Trois bracelets de perles empilés (pierre de lave noire, bois clair, verre fumé) sur un bois patiné',
      credit: { name: 'Alexey Demidov', username: 'alexeydemidov', photoUrl: 'https://unsplash.com/photos/a-couple-of-bracelets-sitting-on-top-of-a-wooden-table-md87xXz3le4', profileUrl: 'https://unsplash.com/@alexeydemidov' }
    },
    'jewellery-parure-collier-boucles': {
      file: 'jewellery/parure-collier-boucles.webp', focus: '50% 40%',
      alt: 'Femme portant une parure assortie : collier plastron de perles rouges et boucles d’oreilles fleur rouges',
      credit: { name: 'Divaris Shirichena', username: 'divaris', photoUrl: 'https://unsplash.com/photos/beautiful-woman-wearing-red-necklace-and-earrings-XIj_G608oto', profileUrl: 'https://unsplash.com/@divaris' }
    },
    'jewellery-hero': {
      file: 'jewellery/hero.webp', focus: '25% 50%',
      alt: 'Profil d’une femme coiffée d’un foulard, avec boucle d’oreille perlée et colliers rigides dorés et verts, sur fond noir',
      credit: { name: 'Timothy Barlin', username: 'timbar', photoUrl: 'https://unsplash.com/photos/woman-wearing-gold-and-green-necklace-k2TtwfkRvP0', profileUrl: 'https://unsplash.com/@timbar' }
    },
    'jewellery-about': {
      file: 'jewellery/about.webp', focus: '55% 50%',
      alt: 'Mains d’un artisan façonnant une petite pièce de bijou en métal avec un outil rotatif à l’établi',
      credit: { name: 'Tahlia Doyle', username: 'tahliaclaire', photoUrl: 'https://unsplash.com/photos/person-holding-silver-and-black-hand-tool-Mr9m0tGdTIE', profileUrl: 'https://unsplash.com/@tahliaclaire' }
    },
    // shoes
    'shoes-sneakers-basses-blanches': {
      file: 'shoes/sneakers-basses-blanches.webp', focus: '50% 50%',
      alt: 'Paire de sneakers basses en cuir blanc uni, sans logo, posées contre un sac noir sur fond clair',
      credit: { name: 'Ervan M Wirawan', username: 'ervan_me', photoUrl: 'https://unsplash.com/photos/a-pair-of-white-shoes-sitting-on-top-of-a-black-bag-aC8CeQy5S-I', profileUrl: 'https://unsplash.com/@ervan_me' }
    },
    'shoes-sneakers-montantes': {
      file: 'shoes/sneakers-montantes.webp', focus: '50% 50%',
      alt: 'Sneakers montantes en toile rouge bordeaux avec lacets blancs, posées au sol',
      credit: { name: 'Fatqurrohman Arrosyid', username: 'farros_', photoUrl: 'https://unsplash.com/photos/a-pair-of-red-sneakers-with-white-laces-7KgJMAfI3ZU', profileUrl: 'https://unsplash.com/@farros_' }
    },
    'shoes-baskets-course-legeres': {
      file: 'shoes/baskets-course-legeres.webp', focus: '50% 50%',
      alt: 'Basket de course légère en maille gris anthracite avec semelle blanche en mousse, sur fond gris clair',
      credit: { name: 'Rohit Sharma', username: 'rohitsharma1785', photoUrl: 'https://unsplash.com/photos/a-pair-of-black-and-white-sneakers-hanging-from-a-hook-VeW_kL0isfs', profileUrl: 'https://unsplash.com/@rohitsharma1785' }
    },
    'shoes-sandales-cuir-tresse': {
      file: 'shoes/sandales-cuir-tresse.webp', focus: '50% 50%',
      alt: 'Paire de sandales plates à bride en cuir tressé multicolore posées sur l’herbe',
      credit: { name: 'Amar Preet Singh', username: 'amarallahabadi', photoUrl: 'https://unsplash.com/photos/a-pair-of-colorful-woven-sandals-resting-on-green-grass-f9KaXFyb4AU', profileUrl: 'https://unsplash.com/@amarallahabadi' }
    },
    'shoes-claquettes-confort': {
      file: 'shoes/claquettes-confort.webp', focus: '50% 50%',
      alt: 'Pied d’un homme noir en chaussette blanche portant une claquette en mousse blanche sur un court de sport',
      credit: { name: 'Élison Bartolomeu', username: 'elisonbartolomeu', photoUrl: 'https://unsplash.com/photos/a-person-standing-on-a-tennis-court-holding-a-tennis-racquet-32-wbfzHGDM', profileUrl: 'https://unsplash.com/@elisonbartolomeu' }
    },
    'shoes-mocassins-daim': {
      file: 'shoes/mocassins-daim.webp', focus: '50% 50%',
      alt: 'Mocassin en daim ocre à franges et nœud, fait main, sur fond gris clair',
      credit: { name: 'Melvin Peter', username: 'viztapluz', photoUrl: 'https://unsplash.com/photos/a-brown-and-white-shoe-bvHLQVnh3A4', profileUrl: 'https://unsplash.com/@viztapluz' }
    },
    'shoes-hero': {
      file: 'shoes/hero.webp', focus: '55% 55%',
      alt: 'Jambes d’un homme en jean noir portant des sneakers blanches sans logo sur des pavés',
      credit: { name: 'Foto Bakirkoy', username: 'fotobakirkoy', photoUrl: 'https://unsplash.com/photos/a-close-up-of-a-person-wearing-white-sneakers-nB55k3TYJEA', profileUrl: 'https://unsplash.com/@fotobakirkoy' }
    },
    'shoes-about': {
      file: 'shoes/about.webp', focus: '50% 50%',
      alt: 'Étal de marché avec des piles de sandales et claquettes en cuir marron, noir et beige, étiquetées par pointure',
      credit: { name: 'JL Merilles', username: 'jl_merilles', photoUrl: 'https://unsplash.com/photos/a-bunch-of-shoes-that-are-stacked-on-top-of-each-other-99cBeQQg_gU', profileUrl: 'https://unsplash.com/@jl_merilles' }
    },
    // food
    'food-attieke-poisson-braise': {
      file: 'food/attieke-poisson-braise.webp', focus: '50% 50%',
      alt: 'Deux tilapias braisés garnis d’oignons et de piment sur une assiette à liseré bleu',
      credit: { name: 'Francisca Dzise', username: 'sisc12', photoUrl: 'https://unsplash.com/photos/two-fish-on-a-plate-with-onions-and-peppers-KlDjAojLfRk', profileUrl: 'https://unsplash.com/@sisc12' }
    },
    'food-sauce-graine-riz': {
      file: 'food/sauce-graine-riz.webp', focus: '50% 50%',
      alt: 'Assiette creuse de sauce gombo rouge à la viande, aux crevettes et au piment, avec un dôme de riz blanc',
      credit: { name: 'Keesha\'s Kitchen', username: 'keeshasskitchen', photoUrl: 'https://unsplash.com/photos/a-plate-of-food-N_544vYDfwM', profileUrl: 'https://unsplash.com/@keeshasskitchen' }
    },
    'food-alloco-poulet-braise': {
      file: 'food/alloco-poulet-braise.webp', focus: '50% 50%',
      alt: 'Assiette d’alloco servi en panier avec du poisson braisé sous les oignons, tomate, concombre et citron vert',
      credit: { name: 'Emmanuel M', username: 'e4xtream', photoUrl: 'https://unsplash.com/photos/grilled-fish-with-fried-plantains-red-onions-and-lime-a5MP_o7xy54', profileUrl: 'https://unsplash.com/@e4xtream' }
    },
    'food-plateau-traiteur-20-personnes': {
      file: 'food/plateau-traiteur-20-personnes.webp', focus: '50% 50%',
      alt: 'Bacs chauffe-plats en inox remplis de bananes plantain frites lors d’un buffet traiteur',
      credit: { name: 'Valdhy Mbemba', username: 'valdhy_mbemba', photoUrl: 'https://unsplash.com/photos/fried-plantain-slices-in-catering-dishes-qoxK2LBKmIs', profileUrl: 'https://unsplash.com/@valdhy_mbemba' }
    },
    'food-mini-beignets-boite-30': {
      file: 'food/mini-beignets-boite-30.webp', focus: '50% 50%',
      alt: 'Corbeille de beignets dorés (puff-puff) posée sur un tissu wax, avec des bananes',
      credit: { name: 'Keesha\'s Kitchen', username: 'keeshasskitchen', photoUrl: 'https://unsplash.com/photos/a-bowl-of-fruit-_y325luZNUs', profileUrl: 'https://unsplash.com/@keeshasskitchen' }
    },
    'food-jus-bissap-maison-1l': {
      file: 'food/jus-bissap-maison-1l.webp', focus: '50% 50%',
      alt: 'Verre de jus de bissap rouge glacé avec une rondelle de citron vert et une fleur d’hibiscus',
      credit: { name: 'Didi Paul', username: 'didipaul', photoUrl: 'https://unsplash.com/photos/a-red-drink-sitting-on-top-of-a-wooden-table--7oFAavr1Fw', profileUrl: 'https://unsplash.com/@didipaul' }
    },
    'food-hero': {
      file: 'food/hero.webp', focus: '50% 50%',
      alt: 'Vue du dessus de plats ouest-africains : alloco, frites d’igname, foutou en sauce, spaghetti à la tomate et sauce pimentée',
      credit: { name: 'Rejoice Denhere', username: 'triolette', photoUrl: 'https://unsplash.com/photos/assorted-dishes-with-yuca-and-rice-Z4u67tvjYEo', profileUrl: 'https://unsplash.com/@triolette' }
    },
    'food-about': {
      file: 'food/about.webp', focus: '50% 50%',
      alt: 'Vue plongeante sur les étals du marché de Treichville à Abidjan : tomates sur pagne, aubergines, piments et vendeuses',
      credit: { name: 'Ingeborg Korme', username: 'ingeborgkorme', photoUrl: 'https://unsplash.com/photos/a-group-of-people-standing-around-a-market-WWRgheXEAg0', profileUrl: 'https://unsplash.com/@ingeborgkorme' }
    },
    // home
    'home-bougie-citronnelle': {
      file: 'home/bougie-citronnelle.webp', focus: '50% 50%',
      alt: 'Bougies artisanales en pot de verre ornées de feuilles vertes, l’une allumée, sur une table blanche',
      credit: { name: 'Ozra Zamani', username: 'ozrazm', photoUrl: 'https://unsplash.com/photos/a-table-topped-with-candles-and-a-vase-filled-with-flowers-yzf65itmScs', profileUrl: 'https://unsplash.com/@ozrazm' }
    },
    'home-vase-terre-cuite': {
      file: 'home/vase-terre-cuite.webp', focus: '50% 50%',
      alt: 'Vase-cruche en terre cuite mate sur un fond orangé chaud',
      credit: { name: 'Allec Gomes', username: 'allecgomes', photoUrl: 'https://unsplash.com/photos/a-brown-vase-sitting-on-top-of-a-table-CDuhbnnvBFA', profileUrl: 'https://unsplash.com/@allecgomes' }
    },
    'home-panier-rangement-tresse': {
      file: 'home/panier-rangement-tresse.webp', focus: '50% 50%',
      alt: 'Grand panier rond tressé en rotin avec couvercle, posé sur un parquet clair',
      credit: { name: 'Rosemary Media', username: 'rosemarymedia', photoUrl: 'https://unsplash.com/photos/a-wooden-bowl-on-a-table-92_hR3igPiE', profileUrl: 'https://unsplash.com/@rosemarymedia' }
    },
    'home-service-6-assiettes': {
      file: 'home/service-6-assiettes.webp', focus: '50% 50%',
      alt: 'Pile d’assiettes en céramique à motifs floraux bleus sur une table en bois, cafetière et pot à lait en arrière-plan',
      credit: { name: 'Mathias Reding', username: 'matreding', photoUrl: 'https://unsplash.com/photos/a-stack-of-plates-sitting-on-top-of-a-wooden-table-iZYxNyVUWcA', profileUrl: 'https://unsplash.com/@matreding' }
    },
    'home-saladier-teck': {
      file: 'home/saladier-teck.webp', focus: '50% 50%',
      alt: 'Saladier en bois à veinures marquées, garni et entouré de cerneaux de noix, sur fond blanc',
      credit: { name: 'Mette van der Linden', username: 'mettevdl', photoUrl: 'https://unsplash.com/photos/brown-wooden-bowl-F35i2jcXYIE', profileUrl: 'https://unsplash.com/@mettevdl' }
    },
    'home-parure-lit-coton': {
      file: 'home/parure-lit-coton.webp', focus: '50% 50%',
      alt: 'Lit garni d’une parure en coton blanc, oreillers et couette baignés de soleil',
      credit: { name: 'Liz Vo', username: 'lvphotos', photoUrl: 'https://unsplash.com/photos/a-bed-with-white-sheets-and-white-pillows-pl3sj3DigxM', profileUrl: 'https://unsplash.com/@lvphotos' }
    },
    'home-hero': {
      file: 'home/hero.webp', focus: '50% 40%',
      alt: 'Chambre lumineuse aux suspensions en rotin, macramé mural, panier tressé et petite plante',
      credit: { name: 'Volodymyr Yarossvit', username: 'yarossvit_prod', photoUrl: 'https://unsplash.com/photos/a-bedroom-with-a-bed-lamps-and-a-basket-on-the-floor-TuPFc2iLnKs', profileUrl: 'https://unsplash.com/@yarossvit_prod' }
    },
    'home-about': {
      file: 'home/about.webp', focus: '50% 50%',
      alt: 'Atelier rustique aux étagères chargées de poteries en terre cuite, baigné de lumière par une fenêtre cintrée',
      credit: { name: 'Marcos Vinícius do Vale', username: 'marcosvc34', photoUrl: 'https://unsplash.com/photos/rustic-room-with-shelves-full-of-traditional-terracotta-pottery-Us4_fFvjtBQ', profileUrl: 'https://unsplash.com/@marcosvc34' }
    },
    // crafts
    'crafts-panier-rond-raffia': {
      file: 'crafts/panier-rond-raffia.webp', focus: '50% 50%',
      alt: 'Panier rond tressé en fibres naturelles à motifs colorés, accroché à un mur ocre',
      credit: { name: 'Alef Morais', username: 'alef_visuals', photoUrl: 'https://unsplash.com/photos/two-woven-decorative-plates-with-colorful-patterns-uX9AyUcg64Y', profileUrl: 'https://unsplash.com/@alef_visuals' }
    },
    'crafts-sac-cabas-tresse': {
      file: 'crafts/sac-cabas-tresse.webp', focus: '50% 50%',
      alt: 'Sac cabas en paille tressée à anses en cuir, garni d’eucalyptus, posé sur un parquet',
      credit: { name: 'Janita O’Hara', username: 'janitaohara', photoUrl: 'https://unsplash.com/photos/beige-and-brown-tote-bag-GlgERqX00r0', profileUrl: 'https://unsplash.com/@janitaohara' }
    },
    'crafts-jarre-terre-katiola': {
      file: 'crafts/jarre-terre-katiola.webp', focus: '50% 35%',
      alt: 'Jarre en terre cuite à deux anses posée sur un socle drapé de lin, lumière chaude',
      credit: { name: 'Mhmd Sedky', username: 'sedky', photoUrl: 'https://unsplash.com/photos/brown-ceramic-vase-on-white-table-cloth-7JqR7Vdv8aQ', profileUrl: 'https://unsplash.com/@sedky' }
    },
    'crafts-bol-terre-cuite': {
      file: 'crafts/bol-terre-cuite.webp', focus: '50% 50%',
      alt: 'Bol en terre cuite brute à l’intérieur émaillé blanc décoré de brins d’herbe, sur fond clair',
      credit: { name: 'Viviane Okubo', username: 'vivianeokubo', photoUrl: 'https://unsplash.com/photos/empty-bowl-BgIOYG835og', profileUrl: 'https://unsplash.com/@vivianeokubo' }
    },
    'crafts-pochette-toile-korhogo': {
      file: 'crafts/pochette-toile-korhogo.webp', focus: '50% 50%',
      alt: 'Pochette noire à rabat en pagne wax jaune et rose, avec chaînette dorée, sur fond blanc',
      credit: { name: 'Delight Dzansi', username: 'alkebulanprints', photoUrl: 'https://unsplash.com/photos/a-black-and-yellow-purse-yTqMkFhscrE', profileUrl: 'https://unsplash.com/@alkebulanprints' }
    },
    'crafts-corbeille-fruits-tressee': {
      file: 'crafts/corbeille-fruits-tressee.webp', focus: '50% 50%',
      alt: 'Corbeille en osier tressé remplie de citrons, au soleil sur un rebord blanc',
      credit: { name: 'olimpia campean', username: 'olimpiaborodiunsplash', photoUrl: 'https://unsplash.com/photos/a-basket-full-of-lemons-sitting-on-a-ledge-EPR7_yshCiM', profileUrl: 'https://unsplash.com/@olimpiaborodiunsplash' }
    },
    'crafts-hero': {
      file: 'crafts/hero.webp', focus: '55% 30%',
      alt: 'Artisane en pagne wax vert tressant un grand panier rond devant un mur en terre ocre',
      credit: { name: 'Nnaemeka Ugochukwu', username: 'iblaqprinz', photoUrl: 'https://unsplash.com/photos/woman-making-basket-M-MzUrjQjtY', profileUrl: 'https://unsplash.com/@iblaqprinz' }
    },
    'crafts-about': {
      file: 'crafts/about.webp', focus: '50% 50%',
      alt: 'Mains d’un potier façonnant un vase en argile sur un tour, lumière naturelle d’atelier',
      credit: { name: 'Random Institute', username: 'randominstitute', photoUrl: 'https://unsplash.com/photos/person-in-black-gloves-holding-brown-clay-pot-VIpyi3xNBJs', profileUrl: 'https://unsplash.com/@randominstitute' }
    },
    // landing page mock-ups (../index.html): credited and checked with the others
    'landing-casquette': {
      file: 'landing/casquette.webp', focus: '50% 45%',
      alt: 'Jeune homme de profil portant une casquette rouge unie et un t-shirt blanc sur fond de ciel',
      credit: { name: 'kofa boyah', username: 'kofaboyah', photoUrl: 'https://unsplash.com/photos/a-man-in-a-red-hat-looks-away-X038pJ3BBiI', profileUrl: 'https://unsplash.com/@kofaboyah' }
    },
    'landing-tshirt': {
      file: 'landing/tshirt.webp', focus: '50% 50%',
      alt: 'T-shirt blanc uni et ample suspendu à un cintre dans un sous-bois ensoleillé',
      credit: { name: 'tian dayong', username: 'tonnnyj', photoUrl: 'https://unsplash.com/photos/a-white-t-shirt-hanging-from-a-tree-in-the-woods-CfZ4Y5WIYxc', profileUrl: 'https://unsplash.com/@tonnnyj' }
    },
    'landing-sac-banane': {
      file: 'landing/sac-banane.webp', focus: '55% 50%',
      alt: 'Sac banane en cuir rouge à zip doré accroché au dossier d’une chaise grise',
      credit: { name: 'StartVisuals', username: 'startvisuals', photoUrl: 'https://unsplash.com/photos/a-pink-purse-sitting-on-top-of-a-white-bench-kYQ2uqYm0aY', profileUrl: 'https://unsplash.com/@startvisuals' }
    },
    'landing-baume-levres': {
      file: 'landing/baume-levres.webp', focus: '50% 50%',
      alt: 'Mains tenant une boîte ouverte de baume à lèvres teinté rouge',
      credit: { name: 'lo lindo', username: 'lolindo', photoUrl: 'https://unsplash.com/photos/person-holding-red-and-silver-round-container-tF4SaFELfAI', profileUrl: 'https://unsplash.com/@lolindo' }
    },
    'landing-livraison': {
      file: 'landing/livraison.webp', focus: '50% 40%',
      alt: 'Livreur portant une pile de colis en carton dans une rue ensoleillée',
      credit: { name: 'Luke Minnaar', username: 'lukeminnaar', photoUrl: 'https://unsplash.com/photos/a-man-with-a-box-on-a-city-street-xwbCZN4S9oA', profileUrl: 'https://unsplash.com/@lukeminnaar' }
    }
  };

  /* Which demo photos the example store of each niche uses: settings.photo of its hero and about
   * sections, and products[].photo in the order of the niche's products (null, or a short list,
   * leaves a product on its illustration). Applied to the niches below (niche.hero.photo,
   * niche.about.photo, niche.products[i].photo), which defaultConfig and sectionSettings copy into
   * new fiches. Every id must be in DEMO_PHOTOS. Every niche has its 8 photos; a niche left out
   * (or a null in products) keeps its illustrations.
   */
  var NICHE_PHOTOS = {
    fashion: {
      hero: 'fashion-hero', about: 'fashion-about',
      products: ['fashion-robe-portefeuille', 'fashion-robe-chemise-lin', 'fashion-ensemble-pagne-tisse', 'fashion-ensemble-tunique-pantalon', 'fashion-chemise-col-mao', 'fashion-chemise-oversize']
    },
    hair: {
      hero: 'hair-hero', about: 'hair-about',
      products: ['hair-perruque-lisse-14', 'hair-perruque-bouclee-carre', 'hair-perruque-bob-blond-miel', 'hair-meches-ondulees-lot-3', 'hair-meches-kinky-tresses', 'hair-huile-legere-perruque']
    },
    beauty: {
      hero: 'beauty-hero', about: 'beauty-about',
      products: ['beauty-beurre-karite-fouette', 'beauty-savon-noir-karite', 'beauty-huile-coco-vierge', 'beauty-serum-eclat-baobab', 'beauty-masque-argile', 'beauty-coffret-decouverte']
    },
    jewellery: {
      hero: 'jewellery-hero', about: 'jewellery-about',
      products: ['jewellery-collier-perles-verre', 'jewellery-creoles-martelees', 'jewellery-pendants-goutte-resine', 'jewellery-bracelet-jonc-grave', 'jewellery-bracelets-perles-lot-3', 'jewellery-parure-collier-boucles']
    },
    shoes: {
      hero: 'shoes-hero', about: 'shoes-about',
      products: ['shoes-sneakers-basses-blanches', 'shoes-sneakers-montantes', 'shoes-baskets-course-legeres', 'shoes-sandales-cuir-tresse', 'shoes-claquettes-confort', 'shoes-mocassins-daim']
    },
    food: {
      hero: 'food-hero', about: 'food-about',
      products: ['food-attieke-poisson-braise', 'food-sauce-graine-riz', 'food-alloco-poulet-braise', 'food-plateau-traiteur-20-personnes', 'food-mini-beignets-boite-30', 'food-jus-bissap-maison-1l']
    },
    home: {
      hero: 'home-hero', about: 'home-about',
      products: ['home-bougie-citronnelle', 'home-vase-terre-cuite', 'home-panier-rangement-tresse', 'home-service-6-assiettes', 'home-saladier-teck', 'home-parure-lit-coton']
    },
    crafts: {
      hero: 'crafts-hero', about: 'crafts-about',
      products: ['crafts-panier-rond-raffia', 'crafts-sac-cabas-tresse', 'crafts-jarre-terre-katiola', 'crafts-bol-terre-cuite', 'crafts-pochette-toile-korhogo', 'crafts-corbeille-fruits-tressee']
    }
  };

  var PHOTO_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var PHOTO_FILE_RE = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*\.(?:webp|jpe?g|png|avif)$/i;

  // The live catalogue: JEERE_DATA.DEMO_PHOTOS (it can be filled or replaced at runtime).
  function photoCatalogue() {
    var d = root.JEERE_DATA;
    return d && isObj(d.DEMO_PHOTOS) ? d.DEMO_PHOTOS : DEMO_PHOTOS;
  }
  // The catalogue entry of a photo id, or null (unknown id, entry without a valid file).
  function demoPhoto(id) {
    if (typeof id !== 'string' || !PHOTO_ID_RE.test(id)) return null;
    var cat = photoCatalogue();
    if (!Object.prototype.hasOwnProperty.call(cat, id)) return null;
    var e = cat[id];
    return isObj(e) && typeof e.file === 'string' && PHOTO_FILE_RE.test(e.file) ? e : null;
  }
  // A known photo id, else null: what the fiche keeps.
  function photoId(v) { return demoPhoto(v) ? v : null; }

  /* ------------------------------------------------------------------ section types
   * FieldDef: { key, label, type: 'text'|'textarea'|'number'|'select'|'image'|'photo'|'items',
   *   placeholder?, max? (characters for text/textarea, value for number), min?,
   *   options? [{ value, label }] (select: value has the type stored in the fiche),
   *   itemFields? [FieldDef], itemLabel?, itemDefaults? (new sub-item), maxItems? }
   * 'photo' is a demo photo id (DEMO_PHOTOS) or null, set by Jeere from the niche: it is not a form
   * field of its own, the section's 'image' field shows it while the seller has no image.
   */

  var GENERIC_REVIEWS = [
    { name: 'Aminata, Cocody', text: 'Commande reçue le lendemain, exactement comme sur la photo. Je recommande.', rating: 5 },
    { name: 'Koffi, Yopougon', text: 'Réponse rapide sur WhatsApp et paiement Wave en deux minutes. Très sérieux.', rating: 5 },
    { name: 'Awa, Marcory', text: 'Bon produit et livreur aimable. Un petit retard, mais j’ai été prévenue à temps.', rating: 4 }
  ];

  var DELIVERY_TEXT = 'Nous livrons du lundi au samedi. Commandez avant 14 h pour être livré le jour même dans la plupart des communes.';

  var sectionTypes = collection([
    {
      id: 'announcement', type: 'announcement',
      name: 'Bandeau d’annonce',
      description: 'Une phrase courte tout en haut : livraison, promo ou nouveauté.',
      fields: [
        { key: 'text', label: 'Message', type: 'text', max: 90, placeholder: 'Livraison offerte dès 20 000 FCFA à Cocody' }
      ],
      defaults: { text: 'Livraison rapide dans tout Abidjan · Paiement à la livraison' }
    },
    {
      id: 'hero', type: 'hero',
      name: 'Grande bannière',
      description: 'Le haut de votre page d’accueil : un titre fort, une image et un bouton.',
      fields: [
        { key: 'kicker', label: 'Petit titre', type: 'text', max: 40, placeholder: 'Nouvelle collection' },
        { key: 'title', label: 'Titre', type: 'text', max: 70, placeholder: 'Des pièces qui tombent juste' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 220, placeholder: 'Dites en une ou deux phrases ce que vous vendez et ce qui vous rend unique.' },
        { key: 'button', label: 'Texte du bouton', type: 'text', max: 24, placeholder: 'Découvrir' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'photo', label: 'Photo d’exemple', type: 'photo' }
      ],
      defaults: {
        kicker: 'Nouveautés',
        title: 'Bienvenue dans notre boutique',
        text: 'Découvrez nos produits et commandez en quelques secondes. Paiement par mobile money ou à la livraison.',
        button: 'Découvrir',
        image: null,
        photo: null
      }
    },
    {
      id: 'categories', type: 'categories',
      name: 'Catégories',
      description: 'Vos catégories en tuiles, créées automatiquement à partir de vos produits.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos catégories' }
      ],
      defaults: { title: 'Nos catégories' }
    },
    {
      id: 'products', type: 'products',
      name: 'Produits',
      description: 'La grille de vos produits, avec le prix et un bouton Commander.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos produits' },
        { key: 'limit', label: 'Nombre maximum de produits', type: 'number', min: 2, max: 24 },
        {
          key: 'columns', label: 'Colonnes sur ordinateur', type: 'select',
          options: [{ value: 2, label: '2 colonnes' }, { value: 3, label: '3 colonnes' }, { value: 4, label: '4 colonnes' }]
        }
      ],
      defaults: { title: 'Nos produits', limit: 8, columns: 3 }
    },
    {
      id: 'about', type: 'about',
      name: 'À propos',
      description: 'Votre histoire en quelques phrases, pour donner confiance.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Notre histoire' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 600, placeholder: 'Qui êtes-vous, que vendez-vous, et pourquoi vos clients peuvent-ils vous faire confiance ?' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'photo', label: 'Photo d’exemple', type: 'photo' }
      ],
      defaults: {
        title: 'Notre histoire',
        text: 'Racontez ici qui vous êtes, ce que vous vendez et pourquoi vos clients peuvent vous faire confiance. Deux ou trois phrases suffisent.',
        image: null,
        photo: null
      }
    },
    {
      id: 'reviews', type: 'reviews',
      name: 'Avis clients',
      description: 'Les avis de vos clients, avec leur note sur 5.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Ce que disent nos clients' },
        {
          key: 'items', label: 'Avis', type: 'items', itemLabel: 'Avis', maxItems: 12,
          itemFields: [
            { key: 'name', label: 'Prénom et commune', type: 'text', max: 40, placeholder: 'Mariam, Cocody' },
            { key: 'text', label: 'Avis', type: 'textarea', max: 240, placeholder: 'Ce que votre client a dit de votre produit ou de votre service.' },
            {
              key: 'rating', label: 'Note', type: 'select',
              options: [
                { value: 5, label: '5 étoiles' }, { value: 4, label: '4 étoiles' }, { value: 3, label: '3 étoiles' },
                { value: 2, label: '2 étoiles' }, { value: 1, label: '1 étoile' }
              ]
            }
          ],
          itemDefaults: { name: '', text: '', rating: 5 }
        }
      ],
      defaults: { title: 'Ce que disent nos clients', items: GENERIC_REVIEWS }
    },
    {
      id: 'delivery', type: 'delivery',
      name: 'Livraison',
      description: 'Vos zones de livraison et leurs frais, commune par commune.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos frais de livraison' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 240, placeholder: 'Jours de livraison, délais, conditions.' },
        {
          key: 'zones', label: 'Zones de livraison', type: 'items', itemLabel: 'Zone', maxItems: 30,
          itemFields: [
            { key: 'name', label: 'Commune ou zone', type: 'text', max: 40, placeholder: 'Cocody' },
            { key: 'fee', label: 'Frais (FCFA)', type: 'number', min: 0, max: 100000, placeholder: '1500' }
          ],
          itemDefaults: { name: '', fee: 1500 }
        }
      ],
      defaults: { title: 'Nos frais de livraison', text: DELIVERY_TEXT, zones: communes.slice(0, 6) }
    },
    {
      id: 'whatsapp', type: 'whatsapp',
      name: 'Commander sur WhatsApp',
      description: 'Un bloc qui invite à commander directement sur WhatsApp.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 60, placeholder: 'Commandez sur WhatsApp' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 200, placeholder: 'Expliquez comment commander et en combien de temps vous répondez.' },
        { key: 'button', label: 'Texte du bouton', type: 'text', max: 30, placeholder: 'Commander sur WhatsApp' }
      ],
      defaults: {
        title: 'Commandez sur WhatsApp',
        text: 'Écrivez-nous : nous confirmons votre commande, le prix de la livraison et l’heure de passage.',
        button: 'Commander sur WhatsApp'
      }
    }
  ]);

  /* ------------------------------------------------------------------ niches
   * Example content for each kind of store. hero.title may contain {name}.
   * Extra keys (beyond the spec): storeName, art, color, productsTitle, categoriesTitle.
   */

  var niches = collection([
    {
      id: 'fashion', label: 'Mode et vêtements', template: 'plateau', palette: 'sable',
      storeName: 'Maison Adjoa', art: 'dress', color: '#E6D5BC',
      tagline: 'Prêt-à-porter cousu à Abidjan',
      announcement: 'Livraison en 24 h dans tout Abidjan · Retouche offerte',
      hero: {
        kicker: 'Nouvelle collection',
        title: '{name} : des pièces qui tombent juste',
        text: 'Robes, ensembles et chemises coupés dans notre atelier de Treichville, en petites séries. Envoyez vos mesures, nous ajustons pour vous.',
        button: 'Voir la collection'
      },
      about: {
        title: 'Notre atelier',
        text: 'Tout a commencé dans un petit atelier de Treichville, avec deux machines et beaucoup d’exigence. Nous choisissons nos tissus au marché d’Adjamé et nous cousons chaque pièce en petite série. Si une taille ne vous va pas, nous la reprenons gratuitement.'
      },
      productsTitle: 'La collection',
      categoriesTitle: 'Trouver votre style',
      reviews: [
        { name: 'Mariam, Cocody', text: 'La robe chemise est encore plus belle en vrai. Livrée le lendemain, et la retouche était faite en deux jours.', rating: 5 },
        { name: 'Adjoa, Marcory', text: 'J’ai commandé l’ensemble pour la dot de ma sœur. Tissu de qualité, finitions propres. Je recommande.', rating: 5 },
        { name: 'Koffi, Yopougon', text: 'Chemise bien coupée, j’ai pris un L et c’est parfait. J’aurais aimé plus de couleurs.', rating: 4 }
      ],
      whatsapp: {
        title: 'Une question sur une taille ?',
        text: 'Envoyez-nous vos mesures ou une photo sur WhatsApp. Nous vous conseillons et nous réservons votre pièce.',
        button: 'Écrire sur WhatsApp'
      },
      products: [
        { name: 'Robe portefeuille noire', price: 18500, category: 'Robes', badge: 'new', art: 'dress', color: '#4A4A52', description: 'Coupe portefeuille sans manches, col à revers et ceinture à boucle. Au-dessus du genou, à porter seule ou sur un haut à manches.' },
        { name: 'Robe chemise en lin', price: 22000, category: 'Robes', badge: 'best', art: 'dress', color: '#E6D5BC', description: 'Lin lavé blanc, col chemise et taille froncée par un cordon. Elle se porte au bureau comme le week-end.' },
        { name: 'Ensemble homme en pagne tissé', price: 35000, category: 'Ensembles', badge: null, art: 'tshirt', color: '#BCCADB', description: 'Tunique ample en pagne tissé à la main, rayée bleu et blanc. Pantalon noir assorti en option. Une tenue pour les mariages et les dots.' },
        { name: 'Ensemble tunique et pantalon', price: 27500, category: 'Ensembles', badge: 'promo', art: 'tshirt', color: '#B8C4A8', description: 'Tunique ample, pantalon large et foulard assorti, en wax vert et orange. Confortable même par forte chaleur.' },
        { name: 'Chemise homme col mao', price: 15000, category: 'Chemises', badge: null, art: 'tshirt', color: '#4B5C78', description: 'Lin bleu marine, manches courtes et coupe droite. Disponible du S au XXL.' },
        { name: 'Chemise femme oversize', price: 14000, category: 'Chemises', badge: null, art: 'tshirt', color: '#CFE0F2', description: 'Coupe ample en popeline de coton bleu ciel. À porter ouverte sur un débardeur ou nouée à la taille.' }
      ]
    },
    {
      id: 'hair', label: 'Perruques et mèches', template: 'cocody', palette: 'hibiscus',
      storeName: 'Mariam Hair', art: 'hair', color: '#9C6B4E',
      tagline: 'Perruques et mèches, vérifiées une par une',
      announcement: 'Pose offerte au salon d’Angré pour toute perruque achetée',
      hero: {
        kicker: 'Nouveaux arrivages',
        title: '{name} : des perruques prêtes à porter',
        text: 'Perruques en cheveux naturels et mèches de qualité, lavées et coiffées avant l’envoi. Livraison discrète partout à Abidjan.',
        button: 'Choisir ma perruque'
      },
      about: {
        title: 'Notre salon',
        text: 'Nous coiffons à Cocody Angré depuis 2018. Chaque perruque est lavée, coiffée et essayée au salon avant de partir chez vous. Vous hésitez sur une longueur ou une couleur ? Envoyez-nous une photo, nous vous conseillons.'
      },
      productsTitle: 'Perruques et mèches',
      categoriesTitle: 'Choisir par type',
      reviews: [
        { name: 'Fatou, Angré', text: 'Ma perruque bouclée est arrivée coiffée et parfaitement ajustée. On me demande tous les jours où je l’ai achetée !', rating: 5 },
        { name: 'Awa, Koumassi', text: 'Livraison discrète, en moins de 24 h. Les mèches ne s’emmêlent pas, même après plusieurs lavages.', rating: 5 },
        { name: 'Aïcha, Bingerville', text: 'Très bon conseil pour la couleur. Le bob est beau, la lace est un peu fine à manipuler au début.', rating: 4 }
      ],
      whatsapp: {
        title: 'Pas sûre de la longueur ?',
        text: 'Envoyez-nous une photo sur WhatsApp : nous vous proposons la perruque qui vous va, avec les prix.',
        button: 'Demander conseil'
      },
      products: [
        { name: 'Perruque lisse 14 pouces', price: 65000, category: 'Perruques', badge: 'best', art: 'hair', color: '#7A5444', description: 'Cheveux naturels, lace frontale 13×4, densité 180 %. Se lave et se lisse comme vos propres cheveux.' },
        { name: 'Perruque bouclée mi-longue', price: 55000, category: 'Perruques', badge: 'new', art: 'hair', color: '#C98A45', description: 'Boucles souples couleur miel cuivré, longueur aux épaules. Légère et idéale quand il fait chaud.' },
        { name: 'Perruque courte blond platine', price: 48000, category: 'Perruques', badge: null, art: 'hair', color: '#E4D8B8', description: 'Coupe courte effilée blond platine avec frange, lace transparente. Prête à porter, sans colle.' },
        { name: 'Mèches ondulées, lot de 3', price: 35000, category: 'Mèches', badge: 'promo', art: 'hair', color: '#6E4A3A', description: 'Trois paquets de 100 g en cheveux naturels ondulés. Assez pour une pose complète.' },
        { name: 'Mèches pour tresses', price: 4500, category: 'Mèches', badge: null, art: 'hair', color: '#5A4038', description: 'Fibre légère qui ne glisse pas, pour des box braids bien nettes. Comptez 6 à 8 paquets pour des tresses longues.' },
        { name: 'Huile légère pour perruque', price: 6000, category: 'Soins', badge: null, art: 'bottle', color: '#E8C9A8', description: 'Redonne de la brillance sans alourdir. Quelques gouttes sur les pointes, deux fois par semaine.' }
      ]
    },
    {
      id: 'beauty', label: 'Beauté et soins', template: 'cocody', palette: 'karite',
      storeName: 'Awa Beauté', art: 'jar', color: '#E9D8BD',
      tagline: 'Soins naturels faits à Abidjan',
      announcement: 'Livraison offerte dès 20 000 FCFA à Cocody',
      hero: {
        kicker: 'Nouvelle collection',
        title: '{name} : des soins simples et naturels',
        text: 'Karité de Korhogo, huile de coco et savon noir, préparés en petites quantités pour garder toute leur fraîcheur.',
        button: 'Découvrir'
      },
      about: {
        title: 'Notre histoire',
        text: 'Tout a commencé dans notre cuisine à Cocody, avec la recette de beurre de karité de notre grand-mère. Aujourd’hui, nous achetons le karité directement aux coopératives de femmes de Korhogo et nous préparons chaque pot à la main. Pas de parfum ajouté, pas de promesse impossible : des soins qui font du bien.'
      },
      productsTitle: 'Nos soins',
      categoriesTitle: 'Par besoin',
      reviews: [
        { name: 'Mariam, Cocody', text: 'Le beurre de karité brut est devenu indispensable. Il pénètre vite et ne laisse pas la peau grasse.', rating: 5 },
        { name: 'Yao, Marcory', text: 'J’ai offert le coffret à ma femme, elle a adoré. Livré le jour même à Marcory.', rating: 5 },
        { name: 'Adjoa, Plateau', text: 'Le sérum est léger et sent bon naturellement. J’attends de voir les résultats sur quelques semaines.', rating: 4 }
      ],
      whatsapp: {
        title: 'Un conseil pour votre peau ?',
        text: 'Dites-nous votre type de peau sur WhatsApp : nous vous proposons la bonne routine et nous livrons chez vous.',
        button: 'Commander sur WhatsApp'
      },
      products: [
        { name: 'Beurre de karité brut', price: 6500, category: 'Corps', badge: 'best', art: 'jar', color: '#E9D8BD', description: 'Karité pur de Korhogo, non raffiné et non parfumé. Il fond au contact de la peau, pour le corps et les cheveux.' },
        { name: 'Savon noir au karité', price: 3000, category: 'Corps', badge: null, art: 'box', color: '#A88B70', description: 'Savon noir traditionnel enrichi au karité. Il nettoie en douceur, même les peaux sensibles.' },
        { name: 'Huile de coco vierge', price: 4500, category: 'Cheveux', badge: null, art: 'bottle', color: '#F1E6CF', description: 'Pressée à froid près de Grand-Bassam. Nourrit les cheveux secs et les pointes abîmées.' },
        { name: 'Sérum éclat au baobab', price: 9500, category: 'Visage', badge: 'new', art: 'bottle', color: '#E7C7A2', description: 'Huile de baobab et vitamine E pour un teint plus uniforme. Deux gouttes le soir suffisent.' },
        { name: 'Masque visage à l’argile', price: 5500, category: 'Visage', badge: null, art: 'jar', color: '#D9B9A0', description: 'Argile verte et miel pour nettoyer les pores en profondeur. À laisser poser 10 minutes, une fois par semaine.' },
        { name: 'Coffret découverte', price: 14000, category: 'Corps', badge: 'promo', art: 'basket', color: '#E3CBB0', description: 'Beurre de karité, savon noir et huile de coco en format voyage, emballés dans du papier kraft. Une belle idée de cadeau.' }
      ]
    },
    {
      id: 'jewellery', label: 'Bijoux et accessoires', template: 'plateau', palette: 'indigo',
      storeName: 'Fatou Bijoux', art: 'jewel', color: '#D8B56B',
      tagline: 'Bijoux dorés et perles, faits main à Abidjan',
      announcement: 'Emballage cadeau offert sur chaque commande',
      hero: {
        kicker: 'Faits main',
        title: '{name} : l’éclat qui vous ressemble',
        text: 'Colliers, boucles d’oreilles et bracelets en laiton doré et perles de verre. Chaque pièce est assemblée à la main, à la commande.',
        button: 'Voir les bijoux'
      },
      about: {
        title: 'Derrière chaque bijou',
        text: 'Nous travaillons le laiton et les perles de verre dans notre atelier de Marcory. Nos montures dorées sont plaquées or 18 carats, et tous nos bijoux sont sans nickel, pour être portés tous les jours. Un fermoir cassé ? Nous le réparons gratuitement pendant un an.'
      },
      productsTitle: 'Tous nos bijoux',
      categoriesTitle: 'Par type de bijou',
      reviews: [
        { name: 'Awa, Riviera', text: 'Les créoles sont légères et toujours aussi dorées après trois mois. Je les porte tous les jours.', rating: 5 },
        { name: 'Kouamé, Plateau', text: 'J’ai offert la parure à ma fiancée, l’écrin était magnifique. Livraison au bureau, très pratique.', rating: 5 },
        { name: 'Mariam, Yopougon', text: 'Très jolis bracelets. Un fermoir s’est abîmé, il a été réparé en deux jours sans frais.', rating: 4 }
      ],
      whatsapp: {
        title: 'Un bijou sur mesure ?',
        text: 'Choisissez vos couleurs de perles et votre longueur sur WhatsApp. Nous vous envoyons une photo avant l’envoi.',
        button: 'Écrire à l’atelier'
      },
      products: [
        { name: 'Collier en perles de verre', price: 12000, category: 'Colliers', badge: 'best', art: 'jewel', color: '#A8B8DC', description: 'Ras-du-cou en perles de verre noires et pendentif brodé de perles de couleur. Fermoir doré, longueur ajustable.' },
        { name: 'Créoles torsadées dorées', price: 9500, category: 'Boucles d’oreilles', badge: 'new', art: 'jewel', color: '#D8B56B', description: 'Laiton torsadé plaqué or 18 carats, légères et sans nickel. Diamètre 4 cm.' },
        { name: 'Pendants goutte en résine', price: 7500, category: 'Boucles d’oreilles', badge: null, art: 'jewel', color: '#C7B8E0', description: 'Résine transparente, fleurs séchées et monture argentée. Elles attrapent la lumière sans peser sur l’oreille.' },
        { name: 'Bracelet jonc gravé', price: 11000, category: 'Bracelets', badge: null, art: 'jewel', color: '#D2B270', description: 'Jonc en laiton doré, gravé de motifs géométriques. Il s’ouvre sur une charnière pour se mettre facilement.' },
        { name: 'Bracelets de perles, lot de 3', price: 6500, category: 'Bracelets', badge: 'promo', art: 'jewel', color: '#A9C4C9', description: 'Trois bracelets élastiques : pierre de lave, bois clair et verre fumé. À porter ensemble ou séparément.' },
        { name: 'Parure collier et boucles', price: 24000, category: 'Colliers', badge: null, art: 'box', color: '#E3D3B5', description: 'Un collier plastron en perles rouges et ses boucles fleurs assorties, livrés dans un écrin. Le cadeau parfait pour une fête.' }
      ]
    },
    {
      id: 'shoes', label: 'Chaussures et sneakers', template: 'treichville', palette: 'nuit',
      storeName: 'Pointure 225', art: 'shoe', color: '#E8E6DF',
      tagline: 'Sneakers et sandales, du 36 au 46',
      announcement: 'Échange de pointure gratuit sous 7 jours',
      hero: {
        kicker: 'Nouveaux arrivages',
        title: '{name} : les paires du moment',
        text: 'Sneakers, sandales en cuir et mocassins, vérifiés avant chaque envoi. Pas la bonne pointure ? Nous échangeons.',
        button: 'Voir les paires'
      },
      about: {
        title: 'Qui sommes-nous',
        text: 'Nous avons commencé par vendre quelques paires à nos amis d’Adjamé. Aujourd’hui, nous choisissons chaque modèle pour son confort et sa solidité, et nous vérifions chaque paire avant de la livrer. Nos sandales en cuir sont fabriquées par un cordonnier de Treichville.'
      },
      productsTitle: 'Toutes les paires',
      categoriesTitle: 'Par style',
      reviews: [
        { name: 'Koffi, Yopougon', text: 'Les sneakers blanches sont super confortables. Livrées en 3 heures à Yopougon, je ne m’y attendais pas.', rating: 5 },
        { name: 'Yao, Abobo', text: 'J’avais pris une pointure trop petite, l’échange a été fait sans discussion. Sérieux.', rating: 5 },
        { name: 'Fatou, Port-Bouët', text: 'Belles sandales en cuir, solides. Il faut quelques jours pour qu’elles se fassent au pied.', rating: 4 }
      ],
      whatsapp: {
        title: 'Pas sûr de votre pointure ?',
        text: 'Envoyez-nous la longueur de votre pied en centimètres sur WhatsApp. Nous vous disons quelle taille prendre.',
        button: 'Demander ma pointure'
      },
      products: [
        { name: 'Sneakers basses blanches', price: 25000, category: 'Sneakers', badge: 'best', art: 'shoe', color: '#E8E6DF', description: 'Cuir synthétique facile à nettoyer et semelle épaisse, confortable toute la journée. Du 36 au 45.' },
        { name: 'Sneakers montantes', price: 32000, category: 'Sneakers', badge: 'new', art: 'shoe', color: '#B35A66', description: 'Toile bordeaux, tige rembourrée et lacets blancs, pour un look streetwear. Semelle antidérapante.' },
        { name: 'Baskets de course légères', price: 28500, category: 'Sneakers', badge: 'promo', art: 'shoe', color: '#A9C1D9', description: 'Mesh respirant et semelle souple, pour marcher des heures sans fatigue.' },
        { name: 'Sandales en cuir tressé', price: 15000, category: 'Sandales', badge: null, art: 'shoe', color: '#C49A6C', description: 'Bride en cuir véritable tressé multicolore, faite à la main à Treichville. Semelle en caoutchouc qui ne glisse pas.' },
        { name: 'Claquettes confort', price: 7500, category: 'Sandales', badge: null, art: 'shoe', color: '#D9CFC2', description: 'Semelle moulée et légère, parfaite pour la maison ou la plage de Bassam.' },
        { name: 'Mocassins en daim', price: 27000, category: 'Ville', badge: null, art: 'shoe', color: '#D08A2E', description: 'Daim ocre souple, franges et semelle cousue, pour le bureau comme pour les cérémonies.' }
      ]
    },
    {
      id: 'food', label: 'Alimentation et traiteur', template: 'treichville', palette: 'mangue',
      storeName: 'Chez Aminata', art: 'plate', color: '#F2D59B',
      tagline: 'Plats maison et traiteur, livrés à Abidjan',
      announcement: 'Commandez avant 10 h, vous êtes livré pour le déjeuner',
      hero: {
        kicker: 'Cuisiné ce matin',
        title: '{name} : des plats maison, livrés à l’heure',
        text: 'Foutou sauce, alloco et poisson braisé, préparés chaque matin avec les produits du marché. Pour vous, votre bureau ou vos fêtes.',
        button: 'Voir le menu'
      },
      about: {
        title: 'Notre cuisine',
        text: 'Nous cuisinons à Marcory depuis dix ans, d’abord pour les voisins, puis pour les bureaux du Plateau. Les légumes et le poisson viennent du marché chaque matin, et rien n’est réchauffé de la veille. Pour vos baptêmes, anniversaires et réunions, nous préparons aussi des plateaux traiteur.'
      },
      productsTitle: 'Au menu',
      categoriesTitle: 'La carte',
      reviews: [
        { name: 'Kouamé, Plateau', text: 'Nous commandons pour toute l’équipe chaque vendredi. Toujours chaud, toujours à l’heure.', rating: 5 },
        { name: 'Adjoa, Cocody', text: 'Le plateau traiteur pour le baptême de ma fille a régalé tout le monde. Merci pour l’organisation.', rating: 5 },
        { name: 'Yao, Treichville', text: 'Le meilleur poisson braisé du quartier. Un peu plus de piment la prochaine fois, s’il vous plaît !', rating: 4 }
      ],
      whatsapp: {
        title: 'Une commande pour un groupe ?',
        text: 'Donnez-nous le nombre de personnes, la date et la commune sur WhatsApp. Nous vous envoyons un devis dans l’heure.',
        button: 'Commander sur WhatsApp'
      },
      products: [
        { name: 'Tilapias braisés pour deux', price: 6500, category: 'Plats du jour', badge: 'best', art: 'plate', color: '#F2D59B', description: 'Deux tilapias braisés au charbon, garnis d’oignons et de piment, avec de l’attiéké frais à part. Pour deux personnes.' },
        { name: 'Sauce gombo et riz', price: 3000, category: 'Plats du jour', badge: null, art: 'plate', color: '#E9B98A', description: 'Sauce gombo mijotée avec viande, crevettes et piment, servie avec du riz blanc et des gombos entiers.' },
        { name: 'Alloco et poisson braisé', price: 4000, category: 'Plats du jour', badge: 'new', art: 'plate', color: '#F4C27A', description: 'Banane plantain frite et poisson braisé sous les oignons, avec tomate, concombre et citron vert. Sauce pimentée offerte.' },
        { name: 'Plateau alloco, 20 personnes', price: 40000, category: 'Traiteur', badge: null, art: 'basket', color: '#EFD3A8', description: 'Alloco chaud pour 20 personnes, livré dans des bacs chauffe-plats. Poisson braisé et beignets en option. À commander 48 h à l’avance.' },
        { name: 'Beignets maison, la corbeille', price: 5000, category: 'Traiteur', badge: null, art: 'box', color: '#F1CC8F', description: 'Une corbeille de beignets dorés et moelleux, frits le matin même. Parfaits pour les réunions et les anniversaires.' },
        { name: 'Jus de bissap maison', price: 1500, category: 'Boissons', badge: 'promo', art: 'bottle', color: '#D98FA0', description: 'Fleurs d’hibiscus infusées avec du gingembre et un trait de citron vert. Peu sucré, servi glacé.' }
      ]
    },
    {
      id: 'home', label: 'Maison et déco', template: 'plateau', palette: 'lagune',
      storeName: 'Kouamé Déco', art: 'bottle', color: '#D7A98C',
      tagline: 'Déco et linge de maison, choisis avec soin',
      announcement: 'Livraison offerte dès 30 000 FCFA dans tout Abidjan',
      hero: {
        kicker: 'Nouvelle saison',
        title: '{name} : votre intérieur, en plus beau',
        text: 'Bougies, vases, vaisselle et linge de lit choisis chez de petits ateliers ivoiriens. Des pièces solides, faciles à vivre.',
        button: 'Découvrir la maison'
      },
      about: {
        title: 'Notre idée de la maison',
        text: 'Nous croyons qu’une belle maison n’a pas besoin d’être chère. Nous choisissons des pièces solides et faciles à entretenir, souvent fabriquées par de petits ateliers ivoiriens. Chaque commande est emballée avec soin et livrée par notre propre équipe.'
      },
      productsTitle: 'Pour la maison',
      categoriesTitle: 'Par pièce',
      reviews: [
        { name: 'Mariam, Riviera', text: 'Les assiettes sont encore plus belles qu’en photo. Emballage soigné, rien de cassé.', rating: 5 },
        { name: 'Koffi, Bingerville', text: 'Livré à Bingerville sans frais cachés. Le panier est solide, parfait pour la chambre des enfants.', rating: 5 },
        { name: 'Awa, Marcory', text: 'Jolie bougie, l’odeur est agréable. J’aurais aimé un format plus grand.', rating: 4 }
      ],
      whatsapp: {
        title: 'Besoin d’un avis déco ?',
        text: 'Envoyez une photo de votre pièce sur WhatsApp. Nous vous proposons des idées, avec les prix.',
        button: 'Demander conseil'
      },
      products: [
        { name: 'Bougie parfumée citronnelle', price: 6000, category: 'Salon', badge: 'new', art: 'jar', color: '#CFE3DF', description: 'Cire végétale et citronnelle, environ 40 heures de combustion. Elle éloigne aussi les moustiques.' },
        { name: 'Vase en terre cuite', price: 9000, category: 'Salon', badge: null, art: 'bottle', color: '#D7A98C', description: 'Façonné à la main et cuit au feu de bois. Chaque vase est unique, hauteur 30 cm.' },
        { name: 'Panier de rangement tressé', price: 8500, category: 'Salon', badge: 'best', art: 'basket', color: '#D9C29A', description: 'Rotin tressé, avec son couvercle. Pour les jouets, le linge ou les plaids.' },
        { name: 'Service de 6 assiettes', price: 18000, category: 'Cuisine', badge: null, art: 'plate', color: '#BFD7D6', description: 'Céramique blanche à fleurs bleues. Passe au micro-ondes et au lave-vaisselle.' },
        { name: 'Saladier en bois de teck', price: 11000, category: 'Cuisine', badge: 'promo', art: 'plate', color: '#C69C72', description: 'Taillé dans une seule pièce de bois et huilé à la main. Diamètre 28 cm.' },
        { name: 'Parure de lit en coton', price: 25000, category: 'Chambre', badge: null, art: 'box', color: '#E4ECE8', description: 'Housse de couette et deux taies en coton blanc, pour un lit deux places. Lavable à 40 °C.' }
      ]
    },
    {
      id: 'crafts', label: 'Artisanat', template: 'cocody', palette: 'menthe',
      storeName: 'Atelier Yao', art: 'basket', color: '#D8C59A',
      tagline: 'Artisanat ivoirien, fait main et durable',
      announcement: 'Chaque pièce est unique · Envoi partout en Côte d’Ivoire',
      hero: {
        kicker: 'Fait main',
        title: '{name} : l’artisanat d’ici, au quotidien',
        text: 'Paniers, sacs tressés, poteries et pochettes en pagne, fabriqués par des artisans de Korhogo, Katiola et Abidjan, payés au juste prix.',
        button: 'Voir les créations'
      },
      about: {
        title: 'Nos artisans',
        text: 'Nous travaillons avec une vingtaine d’artisans, que nous connaissons tous par leur prénom. Les potières de Katiola, les vanniers de Korhogo et les couturières d’Abidjan fixent eux-mêmes leurs prix. Quand vous achetez ici, vous faites vivre un savoir-faire.'
      },
      productsTitle: 'Nos créations',
      categoriesTitle: 'Par savoir-faire',
      reviews: [
        { name: 'Adjoa, Cocody', text: 'Le panier est magnifique et très solide. On sent le vrai travail à la main.', rating: 5 },
        { name: 'Kouamé, Bouaké', text: 'Commandé depuis Bouaké, reçu en trois jours et bien emballé. La jarre est superbe.', rating: 5 },
        { name: 'Fatou, Treichville', text: 'Belle pochette aux couleurs vives. La fermeture est un peu dure au début.', rating: 4 }
      ],
      whatsapp: {
        title: 'Une commande en quantité ?',
        text: 'Pour un cadeau d’entreprise ou une boutique, écrivez-nous sur WhatsApp. Nous préparons votre commande avec les artisans.',
        button: 'Écrire sur WhatsApp'
      },
      products: [
        { name: 'Panier rond en raphia', price: 9500, category: 'Vannerie', badge: 'best', art: 'basket', color: '#D8C59A', description: 'Tressé à la main, à motifs colorés. À accrocher au mur, ou pour servir le pain et les fruits.' },
        { name: 'Sac cabas tressé', price: 14500, category: 'Sacs', badge: 'new', art: 'bag', color: '#C8B37E', description: 'Raphia tressé, anses en cuir et doublure en coton. Assez grand pour le marché ou la plage.' },
        { name: 'Jarre en terre de Katiola', price: 16000, category: 'Poterie', badge: null, art: 'jar', color: '#C98F6B', description: 'Modelée à la main par les potières de Katiola. Elle garde l’eau fraîche naturellement.' },
        { name: 'Bol en terre cuite', price: 4500, category: 'Poterie', badge: null, art: 'plate', color: '#D5A688', description: 'Terre cuite brute, intérieur émaillé blanc peint à la main. Pour les sauces ou l’apéritif.' },
        { name: 'Pochette en pagne wax', price: 8000, category: 'Sacs', badge: 'promo', art: 'bag', color: '#E9C46A', description: 'Rabat en pagne wax, fermoir et chaînette dorés. Pour le téléphone et les papiers.' },
        { name: 'Corbeille à fruits tressée', price: 7000, category: 'Vannerie', badge: null, art: 'basket', color: '#D8BF8E', description: 'Osier tressé serré, très solide, avec une anse. Diamètre 30 cm.' }
      ]
    }
  ]);

  // The demo photos of each niche (NICHE_PHOTOS above) on its hero, about and products.
  niches.forEach(function (n) {
    var np = has(NICHE_PHOTOS, n.id) && isObj(NICHE_PHOTOS[n.id]) ? NICHE_PHOTOS[n.id] : null;
    if (!np) return;
    if (has(np, 'hero')) n.hero.photo = np.hero;
    if (has(np, 'about')) n.about.photo = np.about;
    if (Array.isArray(np.products)) n.products.forEach(function (p, i) { p.photo = np.products[i] === undefined ? null : np.products[i]; });
  });

  /* ------------------------------------------------------------------ custom store pages
   * config.pages = [{ id: 'pg1', title, slug, body, inMenu, inFooter }]: the store's own pages
   * (À propos, Livraison et retours, Contact, Conditions de vente...), rendered by
   * JeereRender.render(config, root, { page: 'page', pageId }). body is plain text: paragraphs
   * separated by a blank line. Ids 'pgN' and slugs are unique (normalizeConfig guarantees it).
   * Default bodies are written with {name} (the store name) and {city}: as long as the seller has
   * not edited a default page, normalizeConfig rewrites it with the current name and city (the
   * assistant renames the store after defaultConfig, the dashboard can change the city).
   */

  var PAGE_LIMITS = { title: 60, slug: SLUG_MAX, body: 4000, max: 20 };

  // The 4 default pages, in this order (ids pg1 to pg4). kind is what pageKind() returns.
  var PAGE_KINDS = [
    { kind: 'about', title: 'À propos', slug: 'a-propos', inMenu: true, inFooter: true },
    { kind: 'shipping', title: 'Livraison et retours', slug: 'livraison-et-retours', inMenu: false, inFooter: true },
    { kind: 'contact', title: 'Contact', slug: 'contact', inMenu: true, inFooter: true },
    { kind: 'terms', title: 'Conditions de vente', slug: 'conditions-de-vente', inMenu: false, inFooter: true }
  ];

  // Paragraphs that change with the niche ('_' when the store has no niche). about: who we are
  // (then the niche's own about.text, then values); delay: how fast it leaves; returns: the return
  // policy, consistent with the niche's example texts; visit: where to find us (Contact).
  // deliveryIntro and outside replace the generic paragraphs when given (outside: null = none).
  var PAGE_TEXT = {
    fashion: {
      about: '{name}, c’est du prêt-à-porter pensé pour notre climat : des robes, des ensembles et des chemises légers, à porter au bureau, aux cérémonies comme le week-end.',
      values: 'Chaque pièce est vérifiée avant l’envoi : coutures, boutons, ourlets. Vous ne connaissez pas votre taille ? Envoyez-nous vos mesures sur WhatsApp : nous vous conseillons, et nous ajustons la pièce si besoin.',
      delay: 'Les pièces disponibles partent sous 24 h. Une pièce cousue à vos mesures demande 5 à 7 jours : nous vous le confirmons avant de valider la commande.',
      returns: 'Une pièce ne vous va pas ? Écrivez-nous dans les 7 jours qui suivent la livraison. Nous la reprenons ou nous l’échangeons si elle n’a été ni portée ni lavée et qu’elle a encore son étiquette. Les retouches de longueur sont offertes.',
      visit: 'Notre atelier est à {city}. Vous pouvez venir essayer une pièce ou faire prendre vos mesures, sur rendez-vous.'
    },
    hair: {
      about: '{name}, ce sont des perruques et des mèches choisies pour leur qualité : cheveux naturels, lace solide, densité et couleur annoncées sans détour.',
      values: 'Sur chaque fiche produit, nous donnons la vraie longueur, la densité et le type de lace, pour que vous receviez exactement ce que vous avez choisi. Nos conseils d’entretien vous suivent après l’achat, pour que votre perruque dure longtemps.',
      delay: 'Les perruques partent lavées et coiffées, sous 24 à 48 h. Le colis est discret : aucun nom de produit n’apparaît dessus.',
      returns: 'Pour des raisons d’hygiène, une perruque ou des mèches ne sont ni reprises ni échangées une fois portées ou sorties de leur emballage. Vérifiez la longueur et la couleur à la livraison : si ce n’est pas ce que vous avez commandé, refusez le colis devant le livreur et nous vous l’échangeons.',
      visit: 'Notre salon est à {city}. Venez essayer une perruque ou faire poser la vôtre, sur rendez-vous.'
    },
    beauty: {
      about: '{name}, ce sont des soins simples pour le corps, le visage et les cheveux, préparés avec des ingrédients que nous connaissons bien.',
      values: 'Nous indiquons la composition de chaque produit et la façon de l’utiliser, et nous préparons de petites quantités pour vous livrer des soins frais. Une question sur votre type de peau ? Nous vous conseillons avant votre achat.',
      delay: 'Vos soins sont préparés en petites quantités et partent sous 24 h, bien protégés pour le transport.',
      returns: 'Pour des raisons d’hygiène, un soin ouvert n’est pas repris. Un produit abîmé pendant la livraison ou qui ne correspond pas à votre commande est échangé ou remboursé : écrivez-nous dans les 48 h avec une photo.',
      visit: 'Nous préparons nos soins à {city}. Nous n’avons pas encore de boutique : tout se commande ici ou sur WhatsApp, et nous livrons chez vous.'
    },
    jewellery: {
      about: '{name}, ce sont des colliers, des boucles d’oreilles et des bracelets faits main, à porter vous-même ou à offrir.',
      values: 'Chaque bijou est vérifié avant l’envoi et part dans un emballage soigné, prêt à offrir. Vous voulez d’autres couleurs de perles ou une autre longueur ? Demandez-nous : nous adaptons la pièce.',
      delay: 'Chaque bijou est assemblé à la commande et part sous 48 h, dans un emballage cadeau.',
      returns: 'Vous avez 7 jours après la livraison pour échanger un bijou qui n’a pas été porté, dans son emballage d’origine. Pour des raisons d’hygiène, les boucles d’oreilles ne sont ni reprises ni échangées. Un fermoir cassé ? Nous le réparons gratuitement pendant un an.',
      visit: 'Notre atelier est à {city}. Sur rendez-vous, vous pouvez voir les bijoux de près et choisir vos perles.'
    },
    shoes: {
      about: '{name}, ce sont des sneakers, des sandales et des chaussures de ville du 36 au 46, pour marcher toute la journée sans y penser.',
      values: 'Vous hésitez sur votre taille ? Envoyez-nous la longueur de votre pied en centimètres : nous vous disons quelle pointure prendre. Et si elle ne va pas, l’échange est simple.',
      delay: 'Chaque paire est vérifiée puis livrée dans sa boîte, souvent le jour même si vous commandez avant 14 h.',
      returns: 'Pas la bonne pointure ? L’échange est gratuit sous 7 jours, si la paire n’a pas été portée dehors et revient dans sa boîte. Écrivez-nous sur WhatsApp : le livreur reprend la paire et vous apporte la nouvelle.',
      visit: 'Nous sommes à {city}. Vous pouvez essayer les paires sur rendez-vous avant d’acheter.'
    },
    food: {
      about: '{name}, c’est une cuisine ivoirienne faite comme à la maison : poisson braisé, sauce gombo et alloco, pour votre déjeuner, votre bureau et vos fêtes.',
      values: 'Moins de piment, une allergie, un plat sans viande ? Dites-le-nous à la commande : nous adaptons le plat. Pour vos réunions, nous livrons des plats chauds et à l’heure, pour toute l’équipe.',
      deliveryIntro: 'Nous livrons à {city} du lundi au samedi, pour le déjeuner. Commandez avant 10 h : vous êtes livré entre 12 h et 14 h. Les frais dépendent de votre commune et s’affichent avant que vous payiez.',
      delay: 'Les plats voyagent dans des sacs isothermes pour arriver chauds. Les plateaux traiteur se commandent au moins 48 h à l’avance.',
      outside: null,
      returns: 'Nos plats sont préparés le jour même : ils ne sont ni repris ni échangés. Un plat arrive froid, abîmé ou incomplet ? Envoyez-nous une photo sur WhatsApp dans l’heure : nous le remplaçons ou nous vous remboursons. Une commande traiteur peut être annulée jusqu’à 24 h avant la livraison.',
      visit: 'Notre cuisine est à {city}. Pour un baptême, un anniversaire ou une réunion, écrivez-nous au moins 48 h à l’avance avec le nombre de personnes, la date et la commune : nous vous envoyons un devis.'
    },
    home: {
      about: '{name}, c’est une sélection d’objets de décoration, de vaisselle et de linge de maison pour toutes les pièces : le salon, la cuisine et la chambre.',
      values: 'Nous aimons les matières naturelles : terre cuite, bois, coton, fibres tressées. Sur chaque fiche produit, nous indiquons les dimensions et l’entretien, pour que vous sachiez exactement ce que vous recevez.',
      delay: 'Les objets fragiles sont emballés avec soin et livrés par notre propre équipe. Une grande pièce peut demander un jour de plus.',
      returns: 'Vous avez 7 jours après la livraison pour nous retourner un article qui ne vous plaît pas, dans son emballage d’origine et sans trace d’utilisation. Un article cassé à la livraison ? Refusez-le devant le livreur, ou envoyez-nous une photo dans les 24 h : nous le remplaçons.',
      visit: 'Nous sommes à {city}. Pour une liste de mariage ou une commande d’entreprise, écrivez-nous : nous préparons un devis.'
    },
    crafts: {
      about: '{name}, c’est de l’artisanat ivoirien fait main : paniers, sacs et poteries, achetés directement aux artisans.',
      values: 'Chaque pièce est unique : sa couleur et sa forme peuvent varier un peu de la photo, c’est la marque du fait main. Nous vous disons toujours qui l’a fabriquée et comment l’entretenir.',
      delay: 'Les pièces disponibles partent sous 48 h. Nous envoyons aussi partout en Côte d’Ivoire, par car ou par un service d’expédition : comptez 2 à 4 jours.',
      outside: null,
      returns: 'Une pièce arrive abîmée ? Envoyez-nous une photo dans les 48 h : nous la remplaçons, ou nous vous remboursons si elle était unique. Une pièce qui ne vous plaît pas peut être échangée sous 7 jours, dans son état d’origine.',
      visit: 'Nous sommes à {city}. Pour un cadeau d’entreprise ou une commande en quantité, écrivez-nous : nous préparons votre commande avec les artisans.'
    },
    _: {
      about: '{name} : peu de produits, mais de bons produits, choisis un par un.',
      story: 'Nous avons commencé petit, en vendant à nos proches et à nos voisins. Aujourd’hui, nos clients nous font confiance pour la qualité de nos produits et pour notre sérieux : chaque commande est confirmée, préparée avec soin et suivie jusqu’à la livraison.',
      values: 'Nous vous disons toujours la vérité sur ce que vous achetez : la matière, la taille, le délai. Et si quelque chose ne va pas, nous cherchons une solution avec vous.',
      delay: 'Votre commande est préparée et confiée au livreur sous 24 à 48 h. Nous vous prévenons sur WhatsApp quand elle part.',
      returns: 'Vous avez 7 jours après la livraison pour nous signaler un problème. Un article abîmé ou qui ne correspond pas à votre commande est échangé ou remboursé : écrivez-nous sur WhatsApp avec une photo.',
      visit: 'Nous sommes à {city}. Tout se commande ici ou sur WhatsApp, et nous livrons chez vous.'
    }
  };

  // Paragraphs shared by every niche.
  var PAGE_COMMON = {
    aboutEnd: 'Une question avant de commander ? Écrivez-nous sur WhatsApp : c’est nous qui vous répondons. Merci de votre confiance.',
    deliveryIntro: 'Nous livrons à {city} et dans les environs, du lundi au samedi. Les frais dépendent de votre commune : ils s’affichent au moment de commander, avant que vous payiez.',
    check: 'Le livreur vous appelle avant de passer. Vérifiez votre colis devant lui : s’il est abîmé ou s’il ne correspond pas à votre commande, refusez-le et écrivez-nous. Si vous payez à la livraison, préparez le montant, en espèces ou par mobile money.',
    outside: 'Vous habitez dans une autre ville ? Écrivez-nous sur WhatsApp : nous vous proposons un envoi par car ou par un service d’expédition, avec le prix avant de commander.',
    refunds: 'Un remboursement accepté est fait par mobile money, sur le numéro de votre choix, ou par le moyen de paiement utilisé pour la commande.',
    contactStart: 'Le plus simple pour nous joindre, c’est WhatsApp : écrivez-nous ou envoyez un message vocal. Nous répondons nous-mêmes, du lundi au samedi, de 8 h à 19 h.',
    contactOrder: 'Pour une commande déjà passée, envoyez-nous son numéro (par exemple n° 1042) : nous vous disons où elle en est.',
    contactEnd: 'Les frais de livraison et les retours sont expliqués sur la page « Livraison et retours ».',
    terms: [
      'À adapter : ce texte est un modèle général. Faites-le vérifier par un juriste avant d’ouvrir votre boutique, puis supprimez ce paragraphe.',
      'Vendeur : {name}, à {city}, en Côte d’Ivoire. Pour toute question, écrivez-nous sur WhatsApp (voir la page « Contact »).',
      'Commande : votre commande est ferme quand nous vous la confirmons, sur cette boutique ou sur WhatsApp. Si un produit n’est plus disponible, nous vous prévenons et nous vous proposons un autre produit ou le remboursement.',
      'Prix : les prix sont indiqués en francs CFA (FCFA), toutes taxes comprises. Les frais de livraison dépendent de votre commune et s’affichent avant le paiement. Le prix à payer est celui affiché au moment de la commande.',
      'Paiement : vous payez avec l’un des moyens proposés au moment de la commande, par mobile money, par carte ou à la livraison. Les paiements en ligne sont traités par un partenaire de paiement agréé. Nous ne vous demandons jamais votre code secret : ne le donnez à personne, pas même au livreur.',
      'Livraison : les délais et les frais sont indiqués sur la page « Livraison et retours ». Vérifiez votre colis à la réception, devant le livreur.',
      'Retours et remboursements : les conditions sont expliquées sur la page « Livraison et retours ». Un remboursement accepté est fait par mobile money ou par le moyen de paiement utilisé.',
      'Données personnelles : votre nom, votre numéro et votre adresse servent uniquement à traiter et à livrer votre commande. Ils ne sont ni vendus ni partagés, sauf avec le livreur et le partenaire de paiement. Pour les faire modifier ou supprimer, écrivez-nous.',
      'Litiges : en cas de désaccord, contactez-nous d’abord ; nous cherchons toujours une solution à l’amiable. Ces conditions sont soumises au droit ivoirien.'
    ]
  };

  // The body of a default page, with {name} and {city} still in it.
  function pageTemplate(kind, nicheId) {
    var nid = (typeof nicheId === 'string' && inColl(niches, nicheId)) ? nicheId : '_';
    var t = PAGE_TEXT[nid];
    var C = PAGE_COMMON;
    var parts;
    switch (kind) {
      case 'about':
        parts = [t.about, nid === '_' ? t.story : niches[nid].about.text, t.values, C.aboutEnd];
        break;
      case 'shipping':
        parts = [has(t, 'deliveryIntro') ? t.deliveryIntro : C.deliveryIntro, t.delay, C.check,
          has(t, 'outside') ? t.outside : C.outside, t.returns, C.refunds];
        break;
      case 'contact':
        parts = [C.contactStart, t.visit, C.contactOrder, C.contactEnd];
        break;
      case 'terms':
        parts = C.terms;
        break;
      default:
        return '';
    }
    return parts.filter(function (p) { return typeof p === 'string' && p; }).join('\n\n');
  }

  function pageName(name) { var s = String(name == null ? '' : name).replace(/\s+/g, ' ').trim(); return s || 'Notre boutique'; }
  function pageCity(city) { var s = String(city == null ? '' : city).replace(/\s+/g, ' ').trim(); return s || 'Abidjan'; }
  function fillPage(tpl, name, city) {
    return tpl.split('{name}').join(pageName(name)).split('{city}').join(pageCity(city));
  }

  // The 4 default pages of a store (ids pg1 to pg4), in French, adapted to the niche.
  // store: { name, city } (optional: 'Notre boutique' and 'Abidjan' otherwise).
  function defaultPages(nicheId, store) {
    var st = isObj(store) ? store : {};
    return PAGE_KINDS.map(function (k, i) {
      return {
        id: 'pg' + (i + 1), title: k.title, slug: k.slug,
        body: fillPage(pageTemplate(k.kind, nicheId), st.name, st.city),
        inMenu: k.inMenu, inFooter: k.inFooter
      };
    });
  }

  // 'about' | 'shipping' | 'contact' | 'terms' for the 4 default slugs, else null.
  // The renderer adds the WhatsApp contact block to the 'contact' page.
  function pageKind(page) {
    var slug = isObj(page) ? page.slug : page;
    for (var i = 0; i < PAGE_KINDS.length; i++) { if (PAGE_KINDS[i].slug === slug) return PAGE_KINDS[i].kind; }
    return null;
  }

  // An untouched default body (any niche, any store name and city) is recognised by turning its
  // template into an anchored pattern: {name} and {city} match any text on one line.
  var pageMatchers = null;
  function templateRegex(tpl) {
    var groups = {};
    var n = 0;
    var src = tpl.split(/(\{name\}|\{city\})/).map(function (part) {
      if (part === '{name}' || part === '{city}') {
        if (groups[part]) return '\\' + groups[part];
        groups[part] = ++n;
        return '([^\\n]{1,80}?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    }).join('');
    return new RegExp('^' + src + '$');
  }
  function defaultPageKind(body) {
    if (typeof body !== 'string' || body.length < 40) return null;
    if (!pageMatchers) {
      pageMatchers = [];
      niches.ids().concat(['_']).forEach(function (nid) {
        PAGE_KINDS.forEach(function (k) { pageMatchers.push({ kind: k.kind, re: templateRegex(pageTemplate(k.kind, nid)) }); });
      });
    }
    for (var i = 0; i < pageMatchers.length; i++) { if (pageMatchers[i].re.test(body)) return pageMatchers[i].kind; }
    return null;
  }

  // Adds -2, -3... until the slug is free. used: { slug: true }.
  function freeSlug(base, used) {
    var s = slugify(base) || 'page';
    if (!used[s]) return s;
    for (var k = 2; ; k++) {
      var tail = '-' + k;
      var c = s.slice(0, SLUG_MAX - tail.length).replace(/-+$/g, '') + tail;
      if (!used[c]) return c;
    }
  }

  // A free slug for a page title in this fiche (the dashboard's « Adresse » field). exceptId: the
  // page being edited, whose own slug does not count.
  function uniqueSlug(config, title, exceptId) {
    var used = {};
    var list = isObj(config) && Array.isArray(config.pages) ? config.pages : [];
    list.forEach(function (p) { if (isObj(p) && p.id !== exceptId && typeof p.slug === 'string') used[p.slug] = true; });
    return freeSlug(title, used);
  }

  /* ------------------------------------------------------------------ defaultConfig */

  function resolveNiche(id) { return (typeof id === 'string' && inColl(niches, id)) ? id : null; }
  function resolveTemplate(id) { return (typeof id === 'string' && inColl(templates, id)) ? id : null; }

  // Settings for one section type, filled from a niche when one is given.
  function sectionSettings(type, nicheId, storeName) {
    var def = inColl(sectionTypes, type) ? sectionTypes[type] : null;
    if (!def) return {};
    var s = clone(def.defaults);
    var n = resolveNiche(nicheId) ? niches[nicheId] : null;
    if (!n) return s;
    var name = (storeName == null || storeName === '') ? n.storeName : storeName;
    switch (type) {
      case 'announcement': s.text = n.announcement; break;
      case 'hero':
        s.kicker = n.hero.kicker; s.title = applyName(n.hero.title, name);
        s.text = n.hero.text; s.button = n.hero.button; s.image = null; s.photo = photoId(n.hero.photo);
        break;
      case 'categories': if (n.categoriesTitle) s.title = n.categoriesTitle; break;
      case 'products': if (n.productsTitle) s.title = n.productsTitle; break;
      case 'about': s.title = n.about.title; s.text = n.about.text; s.image = null; s.photo = photoId(n.about.photo); break;
      case 'reviews': s.items = clone(n.reviews); break;
      case 'delivery': s.zones = clone(communes.slice(0, 6)); break;
      case 'whatsapp': s.title = n.whatsapp.title; s.text = n.whatsapp.text; s.button = n.whatsapp.button; break;
    }
    return s;
  }

  function defaultConfig(templateId, nicheId) {
    var nicheGiven = resolveNiche(nicheId);
    var t = resolveTemplate(templateId) || (nicheGiven ? niches[nicheGiven].template : 'plateau');
    var tpl = templates[t];
    var n = nicheGiven || tpl.defaultNiche;
    var ni = niches[n];
    var name = ni.storeName;
    var store = { name: name, tagline: ni.tagline, whatsapp: '', city: 'Abidjan', niche: n };
    return {
      version: 1,
      template: t,
      store: store,
      theme: {
        palette: nicheGiven ? ni.palette : tpl.defaults.palette,
        fonts: tpl.defaults.fonts,
        radius: tpl.defaults.radius,
        buttons: tpl.defaults.buttons,
        intensity: DEFAULT_INTENSITY
      },
      payments: { wave: true, orange: true, mtn: true, moov: false, cod: true, card: false },
      sections: tpl.defaults.sections.map(function (type, i) {
        return { id: 's' + (i + 1), type: type, enabled: true, settings: sectionSettings(type, n, name) };
      }),
      products: ni.products.map(function (p, i) {
        return {
          id: 'p' + (i + 1), name: p.name, price: p.price, category: p.category, badge: p.badge,
          art: p.art, color: p.color, description: p.description, image: null, photo: photoId(p.photo)
        };
      }),
      pages: defaultPages(n, store)
    };
  }

  /* ------------------------------------------------------------------ normalizeConfig */

  var PAYMENT_KEYS = PAYMENTS.map(function (p) { return p.key; });
  var IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

  function isImage(v) { return typeof v === 'string' && v.length < 12000000 && IMAGE_RE.test(v); }

  function str(v, def) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return def;
  }

  function toBool(v, def) {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return def;
    if (v === null || v === 0 || v === '' || v === '0' || v === 'false' || v === 'non' || v === 'off') return false;
    return true;
  }

  /* ------------------------------------------------------------------ brand: the store's logo */

  // Optional keys of store (a fiche without them shows its name as text, as before):
  //   logo          null or a data URL image (PNG, JPEG or WebP; the editor makes it at most 600 px on the long side)
  //   logoSize      'S' | 'M' | 'L' (default 'M') or a height in px, 24 to 72 (desktop; phones show 80 % of it)
  //   logoPosition  'left' | 'center' | null (null: the template's place, LOGO_DEFAULT_POSITION)
  //   showName      true: the store name next to the logo (default false: the logo alone)
  //   icon          null or a square data URL image for the browser tab (else the logo, else the initial)
  var LOGO_SIZES = {
    S: { label: 'Petit', phone: 28, desktop: 34 },
    M: { label: 'Moyen', phone: 36, desktop: 46 },
    L: { label: 'Grand', phone: 46, desktop: 60 }
  };
  var LOGO_SIZE_OPTIONS = ['S', 'M', 'L'].map(function (k) { return { value: k, label: LOGO_SIZES[k].label }; });
  var LOGO_POSITIONS = [{ value: 'left', label: 'À gauche' }, { value: 'center', label: 'Au centre' }];
  var LOGO_DEFAULT_POSITION = { plateau: 'center', cocody: 'left', treichville: 'left' };
  // side: long side of an uploaded logo; icon: side of the tab icon; chars: longest data URL kept;
  // px: the range of a height in px; wide / small: when validate() warns about the logo's shape.
  var LOGO_LIMITS = { side: 600, icon: 192, chars: 2000000, px: { min: 24, max: 72 }, wide: 6, smallSide: 120, smallHeight: 40, tone: 1.6, faded: 0.15, iconWide: 1.5 };
  var BRAND_KEYS = ['logo', 'logoSize', 'logoPosition', 'showName', 'icon'];

  function isLogoImage(v) { return isImage(v) && v.length <= LOGO_LIMITS.chars; }

  function normLogoSize(v) {
    if (typeof v === 'string') {
      var s = v.trim().toUpperCase();
      if (has(LOGO_SIZES, s)) return s;
      if (!/^\d+(\s*px)?$/i.test(s)) return 'M';
      v = parseInt(s, 10);
    }
    if (typeof v !== 'number' || !isFinite(v)) return 'M';
    return Math.min(LOGO_LIMITS.px.max, Math.max(LOGO_LIMITS.px.min, Math.round(v)));
  }
  function normLogoPosition(v) { return v === 'left' || v === 'center' ? v : null; }

  function normBrand(key, v) {
    switch (key) {
      case 'logo':
      case 'icon': return isLogoImage(v) ? v.replace(/\s+/g, '') : null;
      case 'logoSize': return normLogoSize(v);
      case 'logoPosition': return normLogoPosition(v);
      case 'showName': return toBool(v, false);
    }
    return null;
  }

  // Height of the logo in px for a device ('phone' or 'desktop'), from store.logoSize.
  function logoHeight(size, device) {
    var s = normLogoSize(size === undefined || size === null ? 'M' : size);
    var phone = device !== 'desktop';
    if (typeof s === 'string') return LOGO_SIZES[s][phone ? 'phone' : 'desktop'];
    return phone ? Math.max(LOGO_LIMITS.px.min, Math.round(s * 0.8)) : s;
  }

  /* Width and height of a data URL image, read from its header (PNG, JPEG, WebP, GIF), without a
   * DOM: { width, height, type } or null. Results are kept for the last few images. */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64_INDEX = {};
  for (var bi = 0; bi < B64.length; bi++) B64_INDEX[B64.charAt(bi)] = bi;
  function b64Bytes(s, n) {
    var out = [];
    var buf = 0;
    var bits = 0;
    for (var i = 0; i < s.length && out.length < n; i++) {
      var v = B64_INDEX[s.charAt(i)];
      if (v === undefined) { if (s.charAt(i) === '=') break; continue; }
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }
  var sizeCache = [];
  function imageSize(url) {
    if (!isImage(url)) return null;
    for (var c = 0; c < sizeCache.length; c++) if (sizeCache[c].url === url) return sizeCache[c].size;
    var size = null;
    try { size = readImageSize(url); } catch (e) { size = null; }
    sizeCache.unshift({ url: url, size: size });
    if (sizeCache.length > 8) sizeCache.length = 8;
    return size;
  }
  function readImageSize(url) {
    var comma = url.indexOf(',');
    var type = url.slice(11, url.indexOf(';')).toLowerCase();
    var data = url.slice(comma + 1);
    var b;
    var u16 = function (i) { return (b[i] << 8) | b[i + 1]; };
    var u16le = function (i) { return b[i] | (b[i + 1] << 8); };
    var u24le = function (i) { return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); };
    var u32 = function (i) { return ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]); };
    var ok = function (w, h, t) { return w > 0 && h > 0 ? { width: w, height: h, type: t } : null; };
    if (type === 'png') {
      b = b64Bytes(data, 24);
      if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
      return ok(u32(16), u32(20), 'png');
    }
    if (type === 'gif') {
      b = b64Bytes(data, 10);
      return b.length < 10 ? null : ok(u16le(6), u16le(8), 'gif');
    }
    if (type === 'webp') {
      b = b64Bytes(data, 30);
      if (b.length < 30) return null;
      var fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (fmt === 'VP8 ') return ok(u16le(26) & 0x3FFF, u16le(28) & 0x3FFF, 'webp');
      if (fmt === 'VP8L') {
        var bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return ok((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, 'webp');
      }
      if (fmt === 'VP8X') return ok(u24le(24) + 1, u24le(27) + 1, 'webp');
      return null;
    }
    if (type === 'jpeg' || type === 'jpg') {
      // Walk the markers to the first SOF (frame header); EXIF can push it far, so read up to 256 KB
      b = b64Bytes(data, 262144);
      if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
      var i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        var mk = b[i + 1];
        if (mk === 0xFF) { i++; continue; }
        if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue; }
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return ok(u16(i + 7), u16(i + 5), 'jpeg');
        i += 2 + u16(i + 2);
      }
      return null;
    }
    return null;
  }

  /* The brand of a fiche, for the renderer, the editor and the dashboard (never throws):
   *   { name, initial, logo, size, position, positionSet, showName, icon, iconFrom: 'icon'|'logo'|'initial', logoBox }
   * logo is null when there is none (the name shows as text). logoBox(device, maxW) gives the
   * display size { width, height } of the logo in px, never stretched, or null when unknown. */
  function brand(config, tplId) {
    var cfg = isObj(config) ? config : {};
    var st = isObj(cfg.store) ? cfg.store : {};
    var tpl = typeof tplId === 'string' ? tplId : (typeof cfg.template === 'string' ? cfg.template : 'plateau');
    var name = (typeof st.name === 'string' ? st.name : '').trim();
    var logo = isLogoImage(st.logo) ? st.logo.replace(/\s+/g, '') : null;
    var icon = isLogoImage(st.icon) ? st.icon.replace(/\s+/g, '') : null;
    var pos = normLogoPosition(st.logoPosition);
    var initial = '';
    // The first letter or digit, any script (Œ, ɔ, ŋ…): Unicode classes where the engine has them
    var lead = /^[^0-9A-Za-zÀ-ÖØ-öø-ÿ]+/;
    try { lead = new RegExp('^[^\\p{L}\\p{N}]+', 'u'); } catch (e) { /* an engine without \p{…} */ }
    try { initial = Array.from(name.replace(lead, ''))[0] || ''; } catch (e) { initial = name.charAt(0); }
    var dims = logo ? imageSize(logo) : null;
    // A wide logo shrunk into a 16 px square cannot be read: the tab then shows the initial
    var squareish = !!(logo && (!dims || dims.width / dims.height <= LOGO_LIMITS.iconWide));
    return {
      name: name,
      initial: (initial || 'B').toLocaleUpperCase('fr'),
      logo: logo,
      dims: dims,
      size: has(st, 'logoSize') ? normLogoSize(st.logoSize) : 'M',
      position: pos || LOGO_DEFAULT_POSITION[tpl] || 'left',
      positionSet: !!pos,
      showName: !!logo && st.showName === true,
      icon: icon || (squareish ? logo : null),
      iconFrom: icon ? 'icon' : (squareish ? 'logo' : 'initial'),
      logoBox: function (device, maxW) {
        if (!dims) return null;
        var h = logoHeight(has(st, 'logoSize') ? st.logoSize : 'M', device);
        var w = h * dims.width / dims.height;
        if (maxW && w > maxW) { w = maxW; h = maxW * dims.height / dims.width; }
        return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
      }
    };
  }

  /* The logo's ink, to tell whether it can be seen on the grounds it sits on. logoTone(url) measures it
   * in a browser (a canvas; Node resolves null) and keeps it: { lum: the luminance of its average
   * opaque pixel, bins: how its opaque pixels spread over TONE_BINS luminance bins }, or null for an
   * opaque logo (it brings its own background). logoToneOf(url) is that value once measured (undefined
   * before). logoGrounds(config): the grounds the logo is drawn on, the header (every page, the
   * checkout too) and the footer. logoChecks(config): the grounds where 15 % of the logo or more
   * (LOGO_LIMITS.faded) reads under LOGO_LIMITS.tone (1.6:1): a dark word next to an orange mark
   * vanishes on a navy header even when the mark still shows. */
  var TONE_BINS = 64;
  var toneCache = [];
  function binLum(i) { var x = (i + 0.5) / TONE_BINS; return x * x; }
  function logoToneOf(url) {
    if (typeof url !== 'string') return undefined;
    for (var i = 0; i < toneCache.length; i++) if (toneCache[i].url === url) return toneCache[i].tone;
    return undefined;
  }
  function keepTone(url, tone) {
    toneCache = toneCache.filter(function (x) { return x.url !== url; });
    toneCache.unshift({ url: url, tone: tone });
    if (toneCache.length > 6) toneCache.length = 6;
    return tone;
  }
  function logoTone(url) {
    var known = logoToneOf(url);
    if (known !== undefined) return Promise.resolve(known);
    if (typeof document === 'undefined' || typeof Image === 'undefined' || !isImage(url)) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var tone = null;
        try {
          var k = Math.min(1, 160 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          var w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
          var d = x.getImageData(0, 0, w, h).data;
          var r = 0, g = 0, b = 0, n = 0, clear = 0;
          var bins = [];
          for (var z = 0; z < TONE_BINS; z++) bins.push(0);
          for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) { clear++; continue; }
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            var L = luminance(rgbHex([d[i], d[i + 1], d[i + 2]]));
            bins[Math.min(TONE_BINS - 1, Math.floor(Math.sqrt(L) * TONE_BINS))]++;
          }
          tone = (!n || clear / (d.length / 4) < 0.08) ? null : { lum: luminance(rgbHex([r / n, g / n, b / n])), bins: bins.map(function (v) { return v / n; }) };
        } catch (e) { tone = null; }
        resolve(keepTone(url, tone));
      };
      img.onerror = function () { resolve(keepTone(url, null)); };
      img.src = url;
    });
  }
  function logoGrounds(config) {
    var tc = themeColors(config);
    var zg = function (z) { return tc.zones[z] ? tc.zones[z].bg : tc.defaults[z].bg; };
    return [
      { id: 'header', label: 'de l’en-tête', bg: zg('header'), key: 'theme:headerBg' },
      { id: 'footer', label: 'du pied de page', bg: zg('footer'), key: 'theme:footerBg' }
    ];
  }
  function lumRatio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  // { faded: the share of the logo under 1.6:1 on this ground, light: those pixels are light (a light logo) }
  function toneOn(tone, groundLum) {
    var faded = 0, fl = 0;
    tone.bins.forEach(function (v, i) {
      if (!v) return;
      var L = binLum(i);
      if (lumRatio(L, groundLum) < LOGO_LIMITS.tone) { faded += v; fl += v * L; }
    });
    return { faded: faded, light: faded ? (fl / faded) > 0.18 : tone.lum > 0.18 };
  }
  function logoChecks(config) {
    var b = brand(config);
    if (!b.logo) return [];
    var tone = logoToneOf(b.logo);
    if (!tone || !Array.isArray(tone.bins)) return [];
    return logoGrounds(config).map(function (g) {
      var t = toneOn(tone, luminance(g.bg));
      return { id: g.id, label: g.label, bg: g.bg, key: g.key, faded: Math.round(t.faded * 100) / 100, light: t.light };
    }).filter(function (g) { return g.faded >= LOGO_LIMITS.faded; });
  }

  // Integer from a number or a string such as "12 500", "12 500 FCFA", "6500.4". Null if none.
  function toInt(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string') return null;
    var s = v.replace(/[\s  ]/g, '').replace(/fcfa|cfa|xof|f$/ig, '');
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    else s = s.replace(',', '.');
    if (!/^-?\d*\.?\d+$/.test(s)) return null;
    var n = Math.round(parseFloat(s));
    return isFinite(n) ? n : null;
  }

  function clampInt(v, min, max, def) {
    var n = toInt(v);
    if (n === null) return def;
    if (typeof min === 'number' && n < min) n = min;
    if (typeof max === 'number' && n > max) n = max;
    return n;
  }

  function normColor(v, def) {
    if (typeof v !== 'string') return def;
    var s = v.trim();
    var m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m3) return ('#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toUpperCase();
    var m6 = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m6) return ('#' + m6[1]).toUpperCase();
    return def;
  }

  function normBadge(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return null;
    var s = v.trim().toLowerCase();
    if (has(BADGES, s)) return s;
    for (var k in BADGES) { if (BADGES[k].toLowerCase() === s) return k; }
    if (s === 'bestseller' || s === 'best seller') return 'best';
    return null;
  }

  function normField(f, v, d) {
    switch (f.type) {
      case 'text':
      case 'textarea':
        return str(v, typeof d === 'string' ? d : '');
      case 'number':
        return clampInt(v, f.min, f.max, typeof d === 'number' ? d : (typeof f.min === 'number' ? f.min : 0));
      case 'select': {
        var opts = f.options || [];
        for (var i = 0; i < opts.length; i++) {
          if (v !== undefined && v !== null && String(opts[i].value) === String(v)) return opts[i].value;
        }
        return d !== undefined ? d : (opts[0] ? opts[0].value : null);
      }
      case 'image':
        return isImage(v) ? v : null;
      case 'photo':
        return photoId(v);
      case 'items': {
        var list = Array.isArray(v) ? v : (Array.isArray(d) ? d : []);
        var out = [];
        list.forEach(function (item) {
          if (!isObj(item)) return;
          out.push(normSettings(f.itemFields || [], item, f.itemDefaults || {}));
        });
        if (typeof f.maxItems === 'number' && out.length > f.maxItems) out = out.slice(0, f.maxItems);
        return out;
      }
    }
    return d;
  }

  function normSettings(fields, settings, defaults) {
    var src = isObj(settings) ? settings : {};
    var defs = isObj(defaults) ? defaults : {};
    var out = {};
    fields.forEach(function (f) {
      var v = has(src, f.key) ? src[f.key] : undefined;
      var d = clone(defs[f.key]);
      out[f.key] = (v === undefined) ? normField(f, d, d) : normField(f, v, d);
    });
    return out;
  }

  // A section's own colours (optional, never added): bg 'page' | 'surface' | 'accent' | #RRGGBB, fg
  // #RRGGBB (only with a bg), and on the hero buttonBg / buttonText. 'auto' or anything else: dropped.
  function normSectionColors(type, src, out) {
    var bg = has(src, 'bg') ? sectionBgValue(src.bg) : null;
    if (bg) {
      out.bg = bg;
      var fg = has(src, 'fg') ? normColor(src.fg, null) : null;
      if (fg) out.fg = fg;
    }
    if (type === 'hero') {
      ['buttonBg', 'buttonText'].forEach(function (k) {
        var h = has(src, k) ? normColor(src[k], null) : null;
        if (h) out[k] = h;
      });
    }
  }

  function assignIds(list, prefix) {
    var re = new RegExp('^' + prefix + '[1-9]\\d*$');
    var used = {};
    var pending = [];
    list.forEach(function (item) {
      if (typeof item.id === 'string' && re.test(item.id) && !used[item.id]) used[item.id] = true;
      else { item.id = null; pending.push(item); }
    });
    var i = 1;
    pending.forEach(function (item) {
      while (used[prefix + i]) i++;
      item.id = prefix + i;
      used[item.id] = true;
    });
    return list;
  }

  function normalizeInner(input) {
    var src = input;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
    if (!isObj(src)) return defaultConfig();

    var srcStore = isObj(src.store) ? src.store : {};
    var nicheKnown = resolveNiche(srcStore.niche);
    var tpl = resolveTemplate(src.template) || (nicheKnown ? niches[nicheKnown].template : 'plateau');
    var base = defaultConfig(tpl, nicheKnown || undefined);

    var store = {
      name: str(srcStore.name, base.store.name),
      tagline: str(srcStore.tagline, base.store.tagline),
      whatsapp: normalizeWhatsapp(str(srcStore.whatsapp, '')),
      city: str(srcStore.city, base.store.city),
      niche: has(srcStore, 'niche') ? nicheKnown : base.store.niche
    };
    // The brand keys are optional: kept (repaired) when the fiche has them, never added
    BRAND_KEYS.forEach(function (k) { if (has(srcStore, k)) store[k] = normBrand(k, srcStore[k]); });

    var srcTheme = isObj(src.theme) ? src.theme : {};
    var theme = {
      palette: (typeof srcTheme.palette === 'string' && inColl(palettes, srcTheme.palette)) ? srcTheme.palette : base.theme.palette,
      fonts: (typeof srcTheme.fonts === 'string' && inColl(fontPairs, srcTheme.fonts)) ? srcTheme.fonts : base.theme.fonts,
      radius: (typeof srcTheme.radius === 'string' && has(radii, srcTheme.radius)) ? srcTheme.radius : base.theme.radius,
      buttons: (srcTheme.buttons === 'solid' || srcTheme.buttons === 'outline') ? srcTheme.buttons : base.theme.buttons,
      // Missing (a fiche saved before intensity existed) or unknown: vivid.
      intensity: normIntensity(srcTheme.intensity)
    };
    // Custom colours are optional: kept (only known keys, #RRGGBB) when the fiche has them, never added
    if (has(srcTheme, 'colors')) {
      var ownColors = colorOverrides(srcTheme.colors);
      if (ownColors) theme.colors = ownColors;
    }
    // The seller's fonts are optional too: kept (repaired) when the fiche has them, never added. Her imported
    // fonts first (a 'custom:<id>' choice is kept only when that font is there), written after typography.
    var ownFonts = null;
    if (has(srcTheme, 'customFonts')) { try { ownFonts = normCustomFonts(srcTheme.customFonts); } catch (e) { ownFonts = null; } }
    if (has(srcTheme, 'typography')) {
      var ownType = normTypography(srcTheme.typography, theme.fonts, ownFonts);
      if (ownType) theme.typography = ownType;
    }
    if (ownFonts) theme.customFonts = ownFonts;

    var srcPay = isObj(src.payments) ? src.payments : {};
    var payments = {};
    PAYMENT_KEYS.forEach(function (k) { payments[k] = toBool(srcPay[k], base.payments[k]); });

    var sections = [];
    (Array.isArray(src.sections) ? src.sections : base.sections).forEach(function (s) {
      if (!isObj(s) || typeof s.type !== 'string' || !inColl(sectionTypes, s.type)) return;
      var def = sectionTypes[s.type];
      var settings = normSettings(def.fields, s.settings, def.defaults);
      if (isObj(s.settings)) normSectionColors(s.type, s.settings, settings);
      var sec = {
        id: s.id,
        type: s.type,
        enabled: toBool(s.enabled, true),
        settings: settings
      };
      // A section detached in the Studio (optional, never added): its DualEngine nodes, sanitised by
      // engine-sections.js; a page without that file keeps them as they are (never a silent loss)
      if (has(s, 'engine')) {
        var EN = root.JeereEngineSections;
        var eng = EN && typeof EN.sanitize === 'function' ? EN.sanitize(s.engine) : (isObj(s.engine) ? clone(s.engine) : null);
        if (eng) sec.engine = eng;
      }
      sections.push(sec);
    });
    assignIds(sections, 's');

    var products = [];
    (Array.isArray(src.products) ? src.products : base.products).forEach(function (p) {
      if (!isObj(p)) return;
      var price = toInt(p.price);
      products.push({
        id: p.id,
        name: str(p.name, '').trim(),
        price: price === null || price < 0 ? 0 : price,
        category: str(p.category, '').trim(),
        badge: normBadge(p.badge),
        art: (typeof p.art === 'string' && ART_KINDS.indexOf(p.art) !== -1) ? p.art : 'box',
        color: normColor(p.color, '#E9D8BD'),
        description: str(p.description, ''),
        image: isImage(p.image) ? p.image : null,
        photo: photoId(p.photo)
      });
    });
    assignIds(products, 'p');

    var outCfg = {
      version: 1, template: tpl, store: store, theme: theme, payments: payments, sections: sections, products: products,
      pages: normPages(src.pages, store)
    };
    // Element styles (the Studio's design inspector): optional, never added; sanitised by elstyles.js
    // (JeereElStyles.sanitize: whitelisted props, ranges, colours, images; entries of missing sections dropped)
    if (has(src, 'elementStyles')) {
      var ES = root.JeereElStyles;
      var es = ES && typeof ES.sanitize === 'function' ? ES.sanitize(src.elementStyles, { sections: sections }) : null;
      if (es) outCfg.elementStyles = es;
    }
    return outCfg;
  }

  // A fiche saved before pages existed (no array) gets the 4 default pages; an array is the
  // seller's list (even empty) and is only repaired: ids, slugs (from the title when missing or
  // taken), one-line title of 60 characters, body of 4 000 characters, booleans. An untouched
  // default body follows the current store name and city.
  // Cut at n characters without splitting an emoji (a surrogate pair).
  function clip(text, n) { return text.slice(0, n).replace(/[\uD800-\uDBFF]$/, ''); }

  function normPages(list, store) {
    if (!Array.isArray(list)) return defaultPages(store.niche, store);
    var out = [];
    list.forEach(function (pg) {
      if (!isObj(pg) || out.length >= PAGE_LIMITS.max) return;
      var title = str(pg.title, '').replace(/[\r\n\t]+/g, ' ');
      if (title.length > PAGE_LIMITS.title) title = clip(title, PAGE_LIMITS.title);
      var body = str(pg.body, '').replace(/\r\n?/g, '\n');
      if (body.length > PAGE_LIMITS.body) body = clip(body, PAGE_LIMITS.body);
      var kind = defaultPageKind(body);
      if (kind) body = fillPage(pageTemplate(kind, store.niche), store.name, store.city);
      out.push({
        id: pg.id, title: title, slug: pg.slug, body: body,
        inMenu: toBool(pg.inMenu, false), inFooter: toBool(pg.inFooter, true)
      });
    });
    assignIds(out, 'pg');
    var used = {};
    out.forEach(function (pg) {
      var own = typeof pg.slug === 'string' ? slugify(pg.slug) : '';
      pg.slug = freeSlug(own || pg.title, used);
      used[pg.slug] = true;
    });
    return out;
  }

  function normalizeConfig(input) {
    try { return normalizeInner(input); } catch (e) { return defaultConfig(); }
  }

  /* ------------------------------------------------------------------ validate */

  function q(text) { return '« ' + text + ' »'; }
  function shorten(text, n) { text = String(text); return text.length > n ? text.slice(0, n - 1).trim() + '…' : text; }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  function validateInner(config) {
    var issues = [];
    function add(level, message, kind, id) {
      var target = { kind: kind };
      if (id !== undefined && id !== null) target.id = String(id);
      issues.push({ level: level, message: message, target: target });
    }

    if (!isObj(config)) {
      add('error', 'La fiche boutique est illisible. Importez une fiche valide ou repartez d’un modèle.', 'store');
    } else {
      var store = isObj(config.store) ? config.store : {};
      var theme = isObj(config.theme) ? config.theme : {};
      var payments = isObj(config.payments) ? config.payments : {};
      var sections = Array.isArray(config.sections) ? config.sections.filter(isObj) : [];
      var products = Array.isArray(config.products) ? config.products.filter(isObj) : [];
      var enabled = sections.filter(function (s) { return s.enabled !== false && inColl(sectionTypes, s.type); });
      function settingsOf(s) { return isObj(s.settings) ? s.settings : {}; }
      function textOf(v) { return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : ''); }

      /* errors */
      var name = textOf(store.name).trim();
      if (!name) add('error', 'Donnez un nom à votre boutique.', 'store', 'name');

      // The logo: a tip when there is none (free: it costs no point, a name written in the store's
      // font is a fine start), a warning when its shape will not read in a header.
      var logo = isLogoImage(store.logo) ? store.logo : null;
      if (!logo) {
        add('tip', 'Ajoutez votre logo : il s’affiche en haut de chaque page. Pas de logo ? Le Studio en crée un simple avec le nom de votre boutique.', 'store', 'logo');
        issues[issues.length - 1].free = true;
      } else {
        var dim = imageSize(logo);
        if (dim && dim.width / dim.height > LOGO_LIMITS.wide) {
          add('warning', 'Votre logo est très allongé (' + dim.width + ' × ' + dim.height + ' px) : sur téléphone, il sera tout petit. Préférez une version plus compacte, ou affichez le nom à la place.', 'store', 'logo');
        } else if (dim && (Math.max(dim.width, dim.height) < LOGO_LIMITS.smallSide || dim.height < LOGO_LIMITS.smallHeight)) {
          add('warning', 'Votre logo est petit (' + dim.width + ' × ' + dim.height + ' px) : il risque d’être flou. Importez une image d’au moins 300 px de large.', 'store', 'logo');
        }
      }

      if (!enabled.length) add('error', 'Activez au moins une section pour que votre boutique ne soit pas vide.', 'section');

      var productsShown = false;
      var productSectionError = false;
      enabled.forEach(function (s) {
        if (s.type !== 'products') return;
        if (!products.length) {
          productSectionError = true;
          add('error', 'La section ' + q(textOf(settingsOf(s).title) || 'Produits') + ' est vide. Ajoutez au moins un produit.', 'product');
        } else productsShown = true;
      });

      products.forEach(function (p, i) {
        var pname = textOf(p.name).trim();
        if (!pname) add('error', 'Le produit n° ' + (i + 1) + ' n’a pas de nom. Donnez-lui un nom clair.', 'product', p.id);
        var price = p.price;
        if (typeof price !== 'number' || !isFinite(price) || price < 0 || Math.floor(price) !== price) {
          add('error', (pname ? q(shorten(pname, 40)) : 'Le produit n° ' + (i + 1)) + ' : indiquez un prix en FCFA, en nombre entier (par exemple 6500).', 'product', p.id);
        }
      });

      var anyPayment = PAYMENT_KEYS.some(function (k) { return payments[k] === true; });
      if (!anyPayment) add('error', 'Activez au moins un moyen de paiement : Wave, Orange Money, MTN MoMo, Moov Money ou paiement à la livraison.', 'payments');

      if (!(typeof config.template === 'string' && inColl(templates, config.template))) {
        add('error', 'Modèle inconnu. Choisissez Plateau, Cocody ou Treichville dans l’onglet Thème.', 'theme', 'template');
      }
      if (!(typeof theme.palette === 'string' && inColl(palettes, theme.palette))) {
        add('error', 'Palette de couleurs inconnue. Choisissez-en une dans l’onglet Thème.', 'theme', 'palette');
      }
      if (!(typeof theme.fonts === 'string' && inColl(fontPairs, theme.fonts))) {
        add('error', 'Polices inconnues. Choisissez une paire de polices dans l’onglet Thème.', 'theme', 'fonts');
      }
      // The seller's own fonts (theme.typography): known ids, and a text font that reads in paragraphs
      if (isObj(theme.typography)) {
        var ty = theme.typography;
        if (ty.display !== undefined && ty.display !== null && !fontOf(config, ty.display)) {
          add('error', 'Police des titres inconnue. Choisissez-en une dans Thème › Polices.', 'theme', 'fonts');
        }
        if (ty.text !== undefined && ty.text !== null && !(fontId(ty.text) ? FONTS[fontId(ty.text)].text : fontOf(config, ty.text))) {
          add('error', 'Police des textes inconnue, ou trop décorative pour des paragraphes. Choisissez-en une dans Thème › Polices.', 'theme', 'fonts');
        }
        var tyNow = null;
        try { tyNow = typography(config); } catch (e) { tyNow = null; }
        if (tyNow && tyNow.display.style === 'manuscrit' && tyNow.upper && tyNow.display.id !== 'amatic-sc') {
          add('warning', 'Une écriture manuscrite se lit mal en majuscules : décochez ' + q('Titres en majuscules') + ' dans Thème › Polices.', 'theme', 'fonts');
          issues[issues.length - 1].target.key = 'upper';
        }
      }
      // Her own fonts (theme.customFonts, « Mes polices »): heavy files, missing letters, a file she does not use
      if (theme.customFonts !== undefined) {
        if (!Array.isArray(theme.customFonts)) {
          add('error', 'Vos polices importées sont illisibles. Importez-les à nouveau dans Thème › Polices › Mes polices.', 'theme', 'fonts');
        } else {
          var ownFams = customFamilies(theme.customFonts);
          var tyUsed = null;
          try { tyUsed = typography(config); } catch (e) { tyUsed = null; }
          var usedIds = tyUsed && tyUsed.custom ? [tyUsed.display.id, tyUsed.text.id] : [];
          var storeText = null;
          var hasLetters = function () {
            if (storeText === null) {
              var parts = [textOf(store.name), textOf(store.tagline)];
              products.forEach(function (p) { parts.push(textOf(p.name), textOf(p.description), textOf(p.category)); });
              sections.forEach(function (s) { var st = settingsOf(s); Object.keys(st).forEach(function (k) { if (typeof st[k] === 'string') parts.push(st[k]); }); });
              (Array.isArray(config.pages) ? config.pages : []).forEach(function (pg) { if (isObj(pg)) parts.push(textOf(pg.title), textOf(pg.body)); });
              storeText = parts.join(' ');
            }
            return /[ɛɔŋƐƆŊ]/.test(storeText);
          };
          ownFams.forEach(function (f) {
            var used = usedIds.indexOf(f.id) !== -1;
            var role = used ? (tyUsed.display.id === f.id ? (tyUsed.text.id === f.id ? 'les titres et les textes' : 'les titres') : 'les textes') : '';
            var key = f.id;
            if (f.source === 'file' && used && f.size > CUSTOM_FONT_LIMITS.heavy) {
              add('warning', 'La police ' + q(f.name) + ' pèse ' + Math.round(f.size / 1024) + ' Ko : votre boutique s’ouvrira plus lentement sur un téléphone. ' +
                (f.entries.every(function (e) { return e.format === 'woff2'; }) ? 'Gardez moins d’épaisseurs, ou choisissez une police plus légère.' : 'Importez plutôt sa version WOFF2, bien plus légère.'), 'theme', 'fonts');
              issues[issues.length - 1].target.key = key;
            }
            if (used && f.source === 'file' && !f.accents) {
              add('warning', 'La police ' + q(f.name) + ' n’a pas tous les accents (é, è, à, ç…) : certaines lettres de ' + role + ' s’affichent dans une autre police. Choisissez une police plus complète.', 'theme', 'fonts');
              issues[issues.length - 1].target.key = key;
            }
            if (used && f.glyphs === false && (f.source === 'file' || f.entries[0].glyphs === false)) {
              // ɛ ɔ ŋ are drawn from a close font (Montserrat / Noto Serif), as for the 23 fonts of the list without
              // them: a warning when the store writes them, else a tip; free either way (it reads well)
              add(hasLetters() ? 'warning' : 'tip', 'La police ' + q(f.name) + ' n’a pas les lettres ɛ, ɔ et ŋ : dans ' + role + ', elles sont écrites dans une police proche.' +
                (hasLetters() ? ' Vos noms en dioula ou en baoulé restent lisibles, mais ces lettres ont un autre dessin.' : ''), 'theme', 'fonts');
              issues[issues.length - 1].target.key = key;
              issues[issues.length - 1].free = true;
            }
            if (!used && f.source === 'file') {
              add('tip', 'Votre police ' + q(f.name) + ' n’est utilisée ni pour les titres ni pour les textes. Retirez-la si vous n’en avez plus besoin : la fiche sera plus légère.', 'theme', 'fonts');
              issues[issues.length - 1].target.key = key;
              issues[issues.length - 1].free = true;
            }
          });
        }
      }
      // A missing intensity is read as vivid (normalizeConfig fills it); a value that is set must be known.
      if (theme.intensity !== undefined && !isIntensity(theme.intensity)) {
        add('error', 'Réglage des couleurs inconnu. Choisissez ' + q('Vives') + ' ou ' + q('Douces') + ' dans l’onglet Thème.', 'theme', 'intensity');
      }

      /* warnings */
      // Colours the seller chose that make a text hard to read (« Corriger » applies issue.fix)
      var checks = [];
      try { checks = colorChecks(config); } catch (e) { checks = []; }
      checks.forEach(function (c) {
        var parts = c.fgKey.split(':');
        var fill = c.kind === 'fill';
        add('warning', (fill ? 'Peu visible : ' + c.label : 'Peu lisible : vos clients auront du mal à lire ' + c.label) +
          ' (contraste ' + fmtRatio(c.ratio) + ', il faut au moins ' + fmtRatio(c.min) + ').' +
          (c.fix ? ' ' + q('Corriger') + ' choisit une teinte proche' + (fill ? ' qui ressort.' : ' qui se lit bien.') : ' Changez la couleur du fond.'),
          parts[0] === 'section' ? 'section' : 'theme', parts[0] === 'section' ? parts[1] : 'colors');
        var last = issues[issues.length - 1];
        last.target.key = parts[0] === 'section' ? parts[2] : parts[1];
        last.contrast = true;
        if (c.severe) last.severe = true;
        if (c.fix) last.fix = { key: c.fgKey, value: c.fix };
      });

      // A transparent logo that vanishes on the header's or the footer's ground (its ink measured by
      // logoTone(), in a browser; nothing is said before that, nor in Node)
      if (logo) {
        var lc = [];
        try { lc = logoChecks(config); } catch (e) { lc = []; }
        if (lc.length) {
          var where = lc.map(function (x) { return x.label; });
          var lightLogo = lc[0].light;
          add('warning', 'Votre logo se voit mal sur le fond ' + (where.length > 1 ? where.slice(0, -1).join(', ') + ' et ' + where[where.length - 1] : where[0]) +
            ' : importez une version ' + (lightLogo ? 'foncée' : 'claire') + ' de votre logo, ou changez la couleur ' + (where.length > 1 ? 'de ces fonds' : 'de ce fond') + ' dans Thème.', 'store', 'logo');
          issues[issues.length - 1].logoTone = lc.map(function (x) { return x.id; });
        }
      }

      var whatsapp = textOf(store.whatsapp).trim();
      var waSection = enabled.some(function (s) { return s.type === 'whatsapp'; });
      if (!whatsapp && (waSection || productsShown)) {
        add('warning', 'Ajoutez votre numéro WhatsApp pour recevoir les commandes.', 'store', 'whatsapp');
      } else if (whatsapp && !/^\+\d{8,15}$/.test(whatsapp)) {
        add('warning', 'Le numéro WhatsApp semble incorrect. Écrivez-le avec l’indicatif, par exemple +2250707123456.', 'store', 'whatsapp');
      }

      if (products.length < 3 && !productSectionError) {
        add('warning', products.length
          ? 'Votre boutique n’a que ' + plural(products.length, 'produit', 'produits') + '. Ajoutez-en au moins 3 pour inspirer confiance.'
          : 'Votre boutique n’a pas encore de produit. Ajoutez-en au moins 3 pour inspirer confiance.', 'product');
      }

      var seen = {};
      products.forEach(function (p) {
        var pname = textOf(p.name).trim();
        if (pname.length > 60) {
          add('warning', q(shorten(pname, 40)) + ' : nom trop long (' + pname.length + ' caractères). Visez 60 caractères au maximum.', 'product', p.id);
        }
        var key = pname.toLowerCase().replace(/\s+/g, ' ');
        if (!key) return;
        if (seen[key] === 1) {
          add('warning', 'Plusieurs produits s’appellent ' + q(shorten(pname, 40)) + '. Donnez-leur des noms différents.', 'product', p.id);
        }
        seen[key] = (seen[key] || 0) + 1;
      });

      enabled.forEach(function (s) {
        var st = settingsOf(s);
        if (s.type === 'hero') {
          var title = textOf(st.title);
          if (title.length > 70) add('warning', 'Le titre de la grande bannière est trop long (' + title.length + ' caractères). Visez 70 caractères au maximum pour qu’il reste lisible sur téléphone.', 'section', s.id);
        } else if (s.type === 'announcement') {
          var text = textOf(st.text);
          if (text.length > 90) add('warning', 'Le bandeau d’annonce est trop long (' + text.length + ' caractères). Visez 90 caractères au maximum.', 'section', s.id);
        } else if (s.type === 'delivery') {
          if (!(Array.isArray(st.zones) && st.zones.length)) add('warning', 'Ajoutez au moins une zone de livraison avec son prix, ou masquez la section Livraison.', 'section', s.id);
        } else if (s.type === 'reviews') {
          var n = Array.isArray(st.items) ? st.items.length : 0;
          if (n < 2) add('warning', 'Ajoutez au moins 2 avis clients, ou masquez la section Avis clients.', 'section', s.id);
        }
      });

      /* tips */
      // A demo photo is not the seller's photo yet: those products count too.
      var noPhoto = products.filter(function (p) { return !isImage(p.image); });
      if (noPhoto.length) {
        var demo = noPhoto.filter(function (p) { return demoPhoto(p.photo); }).length;
        var nb = noPhoto.length;
        var msg;
        if (!demo) msg = (nb === 1 ? '1 produit n’a' : nb + ' produits n’ont') + ' pas encore de vraie photo. Une photo prise à la lumière du jour fait souvent la différence.';
        else if (demo === nb && nb === 1) msg = '1 produit utilise encore une photo d’exemple. Remplacez-la par votre propre photo, prise à la lumière du jour.';
        else if (demo === nb) msg = nb + ' produits utilisent encore une photo d’exemple. Remplacez-les par vos propres photos, prises à la lumière du jour.';
        else msg = nb + ' produits n’ont pas encore de vraie photo, dont ' + demo + ' avec une photo d’exemple. Une photo prise à la lumière du jour fait souvent la différence.';
        add('tip', msg, 'product', noPhoto[0].id);
      }
      var noDesc = products.filter(function (p) { return !textOf(p.description).trim(); });
      if (noDesc.length) {
        add('tip', (noDesc.length === 1 ? '1 produit n’a' : noDesc.length + ' produits n’ont') + ' pas de description. Une ou deux phrases suffisent : matière, taille, usage.', 'product', noDesc[0].id);
      }
      enabled.forEach(function (s) {
        if (s.type !== 'about') return;
        if (textOf(settingsOf(s).text).trim().length < 80) {
          add('tip', 'Votre texte ' + q('À propos') + ' est très court. Racontez en deux ou trois phrases qui vous êtes et pourquoi vous faire confiance.', 'section', s.id);
        }
      });

      /* custom pages (a fiche without pages is an older fiche: normalizeConfig adds them) */
      var pages = Array.isArray(config.pages) ? config.pages.filter(isObj) : [];
      var slugOwner = {};
      pages.forEach(function (pg, i) {
        var ptitle = textOf(pg.title).trim();
        var which = ptitle ? q(shorten(ptitle, 40)) : 'n° ' + (i + 1); // « Contact » or n° 3
        if (!ptitle) {
          add('error', 'La page n° ' + (i + 1) + ' n’a pas de titre. Donnez-lui un titre court, par exemple ' + q('Livraison et retours') + '.', 'page', pg.id);
        } else if (ptitle.length > PAGE_LIMITS.title) {
          add('warning', which + ' : titre de page trop long (' + ptitle.length + ' caractères). Visez ' + PAGE_LIMITS.title + ' caractères au maximum.', 'page', pg.id);
        }
        var slug = textOf(pg.slug);
        if (slug && (slug.length > PAGE_LIMITS.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))) {
          add('warning', 'L’adresse de la page ' + which + ' ne peut contenir que des lettres sans accent, des chiffres et des tirets, par exemple ' + q('livraison-et-retours') + '.', 'page', pg.id);
        }
        if (slug && has(slugOwner, slug)) {
          add('warning', 'Les pages ' + slugOwner[slug] + ' et ' + which + ' ont la même adresse (' + q(slug) + '). Donnez une adresse différente à l’une d’elles.', 'page', pg.id);
        } else if (slug) slugOwner[slug] = which;
        var body = textOf(pg.body);
        if (body.length > PAGE_LIMITS.body) {
          add('warning', 'La page ' + which + ' est trop longue (' + formatNumber(body.length) + ' caractères). Visez ' + formatNumber(PAGE_LIMITS.body) + ' caractères au maximum.', 'page', pg.id);
        }
        if (!body.trim()) {
          add('tip', 'La page ' + which + ' est vide. Écrivez quelques lignes, ou retirez-la du menu et du pied de page.', 'page', pg.id);
        } else if (pg.inMenu !== true && pg.inFooter !== true) {
          add('tip', 'La page ' + which + ' n’apparaît ni dans le menu ni dans le pied de page : vos clients ne la trouveront pas.', 'page', pg.id);
        }
      });
    }

    var count = { error: 0, warning: 0, tip: 0 };
    issues.forEach(function (i) { if (!i.free) count[i.level]++; });
    var score = Math.max(0, 100 - 20 * count.error - 6 * count.warning - 2 * Math.min(count.tip, 5));
    var order = { error: 0, warning: 1, tip: 2 };
    issues.sort(function (a, b) { return order[a.level] - order[b.level]; });
    // A main text or a button text under 3:1 (issue.severe): the store cannot be read, so it is not
    // « APPROUVÉ » whatever the score; unreadable says why (the editor's verdict: « Presque prête »)
    var unreadable = issues.filter(function (i) { return i.severe; }).length;
    var out = { score: score, status: (count.error === 0 && score >= 80 && !unreadable) ? 'APPROUVÉ' : 'À CORRIGER', issues: issues };
    if (unreadable) out.unreadable = unreadable;
    return out;
  }

  function validate(config) {
    try { return validateInner(config); } catch (e) {
      return {
        score: 80, status: 'À CORRIGER',
        issues: [{ level: 'error', message: 'La fiche boutique n’a pas pu être vérifiée. Importez une fiche valide ou repartez d’un modèle.', target: { kind: 'store' } }]
      };
    }
  }

  /* ------------------------------------------------------------------ newId */

  // The first free id: newId(config, 's') for a section, 'p' for a product, 'pg' for a page.
  function newId(config, prefix) {
    var p = prefix === 'p' || prefix === 'pg' ? prefix : 's';
    var list = isObj(config) ? (p === 'p' ? config.products : (p === 'pg' ? config.pages : config.sections)) : null;
    var used = {};
    if (Array.isArray(list)) list.forEach(function (x) { if (isObj(x) && typeof x.id === 'string') used[x.id] = true; });
    var i = 1;
    while (used[p + i]) i++;
    return p + i;
  }

  /* ==================================================================
   * The seller side: account, dashboard, connectors, plans, demo orders.
   * Nothing here is part of the fiche boutique. The prototype keeps these in localStorage
   * (STORAGE_KEYS); the real product keeps them in Supabase.
   * ================================================================== */

  var STORAGE_KEYS = {
    config: 'jeere-studio-config', // the fiche boutique (the editor's; the dashboard writes it too, through normalizeConfig)
    account: 'jeere-account', // { version, firstName, phone, storeName, createdAt, plan, loggedIn, email?, userId?, method?, studio? } (studio: the Studio subscription, ../studio/plans.js; userId: a real Supabase account, ../compte/auth.js)
    admin: 'jeere-admin', // { version, orders, settings, connectors, stock? }
    open: 'jeere-studio-open', // one-shot { page, pageId?, productId? } read and deleted by the editor
    tour: 'jeere-tour' // { version: 1, seen: { editor: iso, admin: iso } }: the guided tours already shown (tour.js)
  };

  var DOMAIN_SUFFIX = '.jeere.shop';
  var DNS_TARGET = 'boutiques.jeere.shop';

  // 'Awa Beauté' → 'awa-beaute.jeere.shop' (the free address of every store).
  function subdomainFor(name) {
    return (slugify(name).slice(0, 40).replace(/-+$/g, '') || 'ma-boutique') + DOMAIN_SUFFIX;
  }

  /* ------------------------------------------------------------------ plans
   * Exactly the landing page's pricing (../index.html#tarifs). Prices in whole FCFA; orders per
   * month (null = unlimited); fee = Jeere's commission per online sale, in %. Every feature and
   * human support are in every plan: a seller moves up when she sells more, never to unlock a
   * feature. The payment partner's own fees come on top (PLAN_NOTE).
   */

  var PLAN_FEATURES = [
    'Toutes les fonctions : boutique, paiements, commandes WhatsApp, livraison par commune, codes promo, avis clients',
    'Une vraie personne qui vous répond sur WhatsApp, en français',
    'L’import de votre boutique existante et l’export de vos données',
    'Pause ou arrêt en un clic, rien n’est prélevé sans vous'
  ];
  var PLAN_NOTE = 'Tarifs prévus pour le lancement : ils peuvent encore changer. Les frais du partenaire de paiement s’ajoutent (par exemple 1,95 % pour le mobile money).';

  function plan(id, name, month, week, orders, fee, forWho, recommended) {
    return {
      id: id, name: name, label: name,
      priceMonth: month, priceWeek: week, price: month,
      priceLabel: month ? formatPrice(month) + ' / mois' : '0 FCFA',
      priceWeekLabel: week ? 'ou ' + formatPrice(week) + ' par semaine' : '',
      orders: orders, unlimited: orders === null,
      ordersLabel: orders === null ? 'Commandes illimitées' : 'Jusqu’à ' + formatNumber(orders) + ' commandes par mois',
      fee: fee, feeLabel: fee + ' % par vente en ligne',
      for: forWho, recommended: recommended === true,
      support: true, features: PLAN_FEATURES
    };
  }

  var PLANS = [
    plan('gratuit', 'Gratuit', 0, null, 20, 3, 'Pour démarrer'),
    plan('essentiel', 'Essentiel', 3000, 1000, 150, 1, 'Pour les vendeurs actifs sur les réseaux', true),
    plan('pro', 'Pro', 10000, null, 600, 0, 'Pour les marques qui grandissent'),
    plan('business', 'Business', 25000, null, null, 0, 'Pour les boutiques installées')
  ];

  /* ------------------------------------------------------------------ connectors
   * The catalogue of the dashboard's « Connecteurs » page, by category. A connector's state lives
   * in 'jeere-admin'.connectors[id] = { status: 'connected' | 'off', values: { [field.key]: string },
   * connectedAt }; toggles are stored as 'true' / 'false'. soon: true = not available yet
   * (« Bientôt »). payments: the fiche's payment keys this connector collects. icon: a neutral
   * pictogram name (the dashboard draws its own; never a company's logo or colours).
   * In the prototype nothing is connected: the dashboard says so.
   */

  var CONNECTOR_CATEGORIES = [
    { id: 'paiements', label: 'Paiements', hint: 'Recevez l’argent de vos ventes directement sur votre numéro.' },
    { id: 'messagerie', label: 'Messagerie', hint: 'Les commandes et le suivi, là où vos clients vous écrivent.' },
    { id: 'reseaux', label: 'Réseaux sociaux', hint: 'Vendez là où l’on vous découvre.' },
    { id: 'livraison', label: 'Livraison', hint: 'Vos coursiers, ou ceux de nos partenaires.' },
    { id: 'mesure', label: 'Mesure d’audience', hint: 'Sachez d’où viennent vos clients.' },
    { id: 'domaine', label: 'Nom de domaine', hint: 'Votre propre adresse sur internet.' },
    { id: 'ia', label: 'Intelligence artificielle', hint: 'Un assistant qui travaille avec vous.' }
  ];

  var OPERATOR_OPTIONS = [
    { value: 'wave', label: 'Wave' },
    { value: 'orange', label: 'Orange Money' },
    { value: 'mtn', label: 'MTN MoMo' },
    { value: 'moov', label: 'Moov Money' }
  ];
  var CONSENT_NOTE = 'Activé seulement après l’accord du visiteur, par le bandeau de consentement de votre boutique.';

  var CONNECTORS = [
    {
      id: 'mobile-money', category: 'paiements', name: 'Paiement mobile money', icon: 'phone',
      payments: ['wave', 'orange', 'mtn', 'moov'],
      description: 'Encaissez Wave, Orange Money, MTN MoMo et Moov Money par un partenaire de paiement agréé par la BCEAO : l’argent arrive sur votre numéro, jamais chez Jeere.',
      fields: [
        { key: 'payoutPhone', label: 'Numéro qui reçoit vos paiements', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'payoutOperator', label: 'Opérateur de ce numéro', type: 'select', options: OPERATOR_OPTIONS, default: 'wave' }
      ],
      note: 'Frais du partenaire de paiement : par exemple 1,95 % par paiement mobile money. Jeere ne garde jamais votre argent.'
    },
    {
      id: 'card', category: 'paiements', name: 'Carte bancaire et diaspora', icon: 'card',
      payments: ['card'],
      description: 'Acceptez Visa et Mastercard, pratique pour vos clients de la diaspora qui paient en euros ou en dollars : vous recevez des FCFA.',
      fields: [
        { key: 'payoutPhone', label: 'Numéro qui reçoit les paiements par carte', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'statementName', label: 'Nom affiché sur le relevé du client', type: 'text', placeholder: 'AWA BEAUTE' }
      ],
      note: 'Activation après vérification de votre identité par le partenaire de paiement. Ses frais sont plus élevés pour la carte que pour le mobile money.'
    },
    {
      id: 'whatsapp', category: 'messagerie', name: 'WhatsApp Business', icon: 'chat',
      description: 'Recevez chaque commande sur WhatsApp et envoyez automatiquement à vos clients la confirmation, le lien de paiement et le suivi de livraison.',
      fields: [
        { key: 'number', label: 'Numéro WhatsApp Business', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'autoMessages', label: 'Messages automatiques de commande', type: 'toggle', default: 'true' }
      ],
      note: 'C’est aussi le numéro affiché sur votre boutique.'
    },
    {
      id: 'sms', category: 'messagerie', name: 'SMS', icon: 'message',
      description: 'Envoyez la confirmation et le suivi de commande par SMS aux clients qui n’ont pas WhatsApp.',
      fields: [
        { key: 'sender', label: 'Nom de l’expéditeur (11 caractères au plus)', type: 'text', placeholder: 'AWABEAUTE' },
        { key: 'orderSms', label: 'SMS de confirmation de commande', type: 'toggle', default: 'true' }
      ],
      note: 'Les SMS sont facturés à l’envoi, au tarif du partenaire.'
    },
    {
      id: 'instagram', category: 'reseaux', name: 'Instagram', icon: 'camera',
      description: 'Importez vos publications comme produits et mettez le lien de votre boutique dans votre bio.',
      fields: [
        { key: 'account', label: 'Compte Instagram', type: 'text', placeholder: '@awabeaute' },
        { key: 'importProducts', label: 'Importer mes publications comme produits', type: 'toggle', default: 'true' },
        { key: 'linkInBio', label: 'Lien de la boutique dans ma bio', type: 'toggle', default: 'true' }
      ]
    },
    {
      id: 'tiktok', category: 'reseaux', name: 'TikTok', icon: 'video',
      description: 'Mettez le lien de votre boutique sur votre profil TikTok et voyez quelles vidéos vous apportent des commandes.',
      fields: [
        { key: 'account', label: 'Compte TikTok', type: 'text', placeholder: '@awabeaute' },
        { key: 'linkInBio', label: 'Lien de la boutique sur mon profil', type: 'toggle', default: 'true' }
      ]
    },
    {
      id: 'facebook', category: 'reseaux', name: 'Facebook', icon: 'people',
      description: 'Montrez vos produits sur votre page Facebook et retrouvez dans Jeere les commandes reçues sur Messenger.',
      fields: [
        { key: 'page', label: 'Page Facebook', type: 'text', placeholder: 'facebook.com/awabeaute' },
        { key: 'shop', label: 'Afficher mes produits sur ma page', type: 'toggle', default: 'true' }
      ]
    },
    {
      id: 'yango', category: 'livraison', name: 'Yango', icon: 'scooter',
      description: 'Commandez un coursier Yango depuis la commande, avec le prix de la course affiché avant de valider.',
      fields: [
        { key: 'phone', label: 'Numéro de votre compte Yango', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'pickup', label: 'Où le coursier récupère les colis', type: 'text', placeholder: 'Cocody Angré, près de la pharmacie' }
      ],
      note: 'La course est payée à Yango, à son tarif.'
    },
    {
      id: 'gozem', category: 'livraison', name: 'Gozem', icon: 'scooter',
      description: 'Envoyez vos colis avec un coursier Gozem et suivez la livraison jusqu’au client.',
      fields: [
        { key: 'phone', label: 'Numéro de votre compte Gozem', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'pickup', label: 'Où le coursier récupère les colis', type: 'text', placeholder: 'Cocody Angré, près de la pharmacie' }
      ],
      note: 'La course est payée à Gozem, à son tarif.'
    },
    {
      id: 'livreurs', category: 'livraison', name: 'Mes livreurs', icon: 'bike',
      description: 'Les noms et numéros de vos propres livreurs : Jeere leur envoie sur WhatsApp l’adresse du client et le montant à encaisser.',
      fields: [
        { key: 'courier1Name', label: 'Livreur 1 : prénom', type: 'text', placeholder: 'Ibrahim' },
        { key: 'courier1Phone', label: 'Livreur 1 : numéro', type: 'tel', placeholder: '07 07 12 34 56' },
        { key: 'courier2Name', label: 'Livreur 2 : prénom', type: 'text', placeholder: 'Serge' },
        { key: 'courier2Phone', label: 'Livreur 2 : numéro', type: 'tel', placeholder: '05 05 12 34 56' }
      ]
    },
    {
      id: 'google-analytics', category: 'mesure', name: 'Google Analytics', icon: 'chart',
      description: 'Suivez vos visites, d’où viennent vos clients et ce qu’ils achètent.',
      fields: [{ key: 'measurementId', label: 'ID de mesure', type: 'text', placeholder: 'G-XXXXXXXXXX' }],
      note: CONSENT_NOTE
    },
    {
      id: 'meta-pixel', category: 'mesure', name: 'Pixel Meta', icon: 'target',
      description: 'Mesurez les ventes apportées par vos publicités Facebook et Instagram.',
      fields: [{ key: 'pixelId', label: 'ID du pixel', type: 'text', placeholder: '123456789012345' }],
      note: CONSENT_NOTE
    },
    {
      id: 'tiktok-pixel', category: 'mesure', name: 'Pixel TikTok', icon: 'target',
      description: 'Mesurez les ventes apportées par vos publicités TikTok.',
      fields: [{ key: 'pixelId', label: 'ID du pixel', type: 'text', placeholder: 'CABC123DEF456GHI789J0' }],
      note: CONSENT_NOTE
    },
    {
      id: 'domain', category: 'domaine', name: 'Nom de domaine', icon: 'globe',
      description: 'Utilisez votre propre adresse, par exemple awabeaute.ci, à la place de votre adresse en .jeere.shop.',
      fields: [{ key: 'domain', label: 'Votre nom de domaine', type: 'text', placeholder: 'awabeaute.ci' }],
      note: 'Chez votre registraire, ajoutez un enregistrement CNAME pour www vers ' + DNS_TARGET + '. La vérification peut prendre jusqu’à 48 h.'
    },
    {
      id: 'assistant', category: 'ia', name: 'Assistant Jeere', icon: 'sparkle', soon: true,
      description: 'Il écrit vos descriptions de produits et répond à vos clients sur WhatsApp, avec vos prix, vos délais et vos frais de livraison.',
      fields: [],
      note: 'Bientôt : nous vous prévenons sur WhatsApp dès qu’il est prêt.'
    }
  ];

  /* ------------------------------------------------------------------ dashboard settings */

  var TEAM_ROLES = [
    { id: 'proprietaire', label: 'Propriétaire', hint: 'Tous les accès, y compris l’abonnement et les paiements.' },
    { id: 'gestion', label: 'Gestion', hint: 'Commandes, produits, clients et pages. Ni l’abonnement ni les paiements.' },
    { id: 'livraison', label: 'Livraison', hint: 'Les commandes à livrer : l’adresse, le numéro du client et le montant à encaisser.' }
  ];

  // 'jeere-admin'.settings by default. subdomain is '' here: fill it with subdomainFor(store name)
  // (adminDefaults does).
  var ADMIN_DEFAULTS = {
    language: 'fr',
    subdomain: '',
    customDomain: '',
    payoutPhone: '',
    payoutMethod: 'wave',
    notifications: { newOrderWhatsapp: true, newOrderSms: false, dailySummary: true, lowStock: false },
    team: [],
    billing: { cycle: 'mois', paused: false }
  };

  var ORDER_STATUSES = [
    { id: 'new', label: 'Nouvelle' },
    { id: 'paid', label: 'Payée' },
    { id: 'shipped', label: 'Expédiée' },
    { id: 'delivered', label: 'Livrée' },
    { id: 'cancelled', label: 'Annulée' }
  ];
  var ORDER_CHANNELS = [
    { id: 'boutique', label: 'Boutique en ligne' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'tiktok', label: 'TikTok' }
  ];
  function idIn(list, id) { return list.some(function (x) { return (x.id || x.key) === id; }); }

  function clampStr(v, max, def) {
    var s = str(v, def === undefined ? '' : def).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function isoOr(v, def) {
    if (typeof v !== 'string' && typeof v !== 'number' && !(v instanceof Date)) return def;
    var t = new Date(v).getTime();
    return isFinite(t) ? new Date(t).toISOString() : def;
  }

  // A complete 'jeere-account', or null when there is none. Phone normalised (+225...), e-mail in
  // lower case. Sign-in is by e-mail, SMS or WhatsApp (../compte/), so an account needs a usable
  // number (+ and 8 to 15 digits) or a usable e-mail: with neither it is no account, in the account
  // page, the dashboard and the editor alike. phone is '' for an e-mail account without a number.
  // Optional extras, kept only when present: email, userId (the Supabase user id, a real account),
  // method ('email' | 'sms' | 'whatsapp': how she receives her code) and studio (below).
  var ACCOUNT_EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
  var ACCOUNT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function normalizeAccount(input) {
    var src = input;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
    if (!isObj(src)) return null;
    var phone = normalizeWhatsapp(str(src.phone, ''));
    if (!/^\+\d{8,15}$/.test(phone)) phone = '';
    var email = str(src.email, '').trim().toLowerCase();
    if (email.length > 254 || !ACCOUNT_EMAIL_RE.test(email)) email = '';
    if (!phone && !email) return null;
    var out = {
      version: 1,
      firstName: clampStr(src.firstName, 40),
      phone: phone,
      storeName: clampStr(src.storeName, 40),
      createdAt: isoOr(src.createdAt, ''),
      plan: idIn(PLANS, src.plan) ? src.plan : 'gratuit',
      loggedIn: src.loggedIn === true
    };
    if (email) out.email = email;
    if (typeof src.userId === 'string' && ACCOUNT_UUID_RE.test(src.userId)) out.userId = src.userId.toLowerCase();
    if (src.method === 'email' || src.method === 'sms' || src.method === 'whatsapp') out.method = src.method;
    // The Studio subscription (« Abonnements Studio »): kept as it is, normalised by
    // ../studio/plans.js (JeerePlans.normalizeSub) wherever it is read. Only when there is one,
    // so an account without it keeps exactly the shape above.
    if (isObj(src.studio)) {
      var studio = clone(src.studio);
      var size = 0;
      try { size = JSON.stringify(studio).length; } catch (e) { size = Infinity; }
      if (studio && size < 60000) out.studio = studio;
    }
    return out;
  }

  function normSettings2(src, config) {
    var s = isObj(src) ? src : {};
    var d = ADMIN_DEFAULTS;
    var store = isObj(config) && isObj(config.store) ? config.store : {};
    var n = isObj(s.notifications) ? s.notifications : {};
    var b = isObj(s.billing) ? s.billing : {};
    var team = [];
    (Array.isArray(s.team) ? s.team : []).forEach(function (m) {
      if (!isObj(m) || team.length >= 20) return;
      var name = clampStr(m.name, 40);
      var phone = normalizeWhatsapp(str(m.phone, ''));
      if (!name && !phone) return;
      team.push({ name: name, phone: phone, role: idIn(TEAM_ROLES, m.role) ? m.role : 'gestion' });
    });
    var sub = slugify(str(s.subdomain, '').replace(/\.jeere\.shop$/i, ''));
    return {
      language: s.language === 'en' ? 'en' : 'fr',
      subdomain: sub ? sub + DOMAIN_SUFFIX : subdomainFor(store.name),
      customDomain: clampStr(s.customDomain, 120).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      payoutPhone: normalizeWhatsapp(str(s.payoutPhone, '')),
      payoutMethod: OPERATOR_OPTIONS.some(function (o) { return o.value === s.payoutMethod; }) ? s.payoutMethod : d.payoutMethod,
      notifications: {
        newOrderWhatsapp: toBool(n.newOrderWhatsapp, d.notifications.newOrderWhatsapp),
        newOrderSms: toBool(n.newOrderSms, d.notifications.newOrderSms),
        dailySummary: toBool(n.dailySummary, d.notifications.dailySummary),
        lowStock: toBool(n.lowStock, d.notifications.lowStock)
      },
      team: team,
      billing: { cycle: b.cycle === 'semaine' ? 'semaine' : 'mois', paused: b.paused === true }
    };
  }

  function normOrder(o) {
    if (!isObj(o) || typeof o.id !== 'string' || !o.id) return null;
    var out = clone(o) || {};
    out.date = isoOr(o.date, new Date(0).toISOString());
    out.customer = isObj(o.customer) ? out.customer : { name: '', phone: '', commune: '' };
    out.items = (Array.isArray(o.items) ? out.items : []).filter(isObj).map(function (it) {
      return { productId: str(it.productId, ''), name: str(it.name, ''), qty: clampInt(it.qty, 1, 999, 1), price: clampInt(it.price, 0, null, 0) };
    });
    out.subtotal = clampInt(o.subtotal, 0, null, out.items.reduce(function (t, it) { return t + it.qty * it.price; }, 0));
    out.delivery = clampInt(o.delivery, 0, null, 0);
    out.total = clampInt(o.total, 0, null, out.subtotal + out.delivery);
    out.payment = idIn(PAYMENTS, o.payment) ? o.payment : 'cod';
    out.status = idIn(ORDER_STATUSES, o.status) ? o.status : 'new';
    out.channel = idIn(ORDER_CHANNELS, o.channel) ? o.channel : 'boutique';
    return out;
  }

  // A complete 'jeere-admin' from whatever was saved (null, garbage, an older shape): known keys
  // are repaired, unknown top-level keys (stock...) are kept. No orders array: demoOrders(config).
  function normalizeAdmin(input, config, now) {
    var src = input;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
    if (!isObj(src)) src = {};
    var out = {};
    Object.keys(src).forEach(function (k) { if (k !== 'version' && k !== 'orders' && k !== 'settings' && k !== 'connectors') out[k] = clone(src[k]); });
    out.version = 1;
    out.orders = Array.isArray(src.orders) ? src.orders.map(normOrder).filter(Boolean) : demoOrders(config, 14, now);
    out.settings = normSettings2(src.settings, config);
    out.connectors = {};
    var cs = isObj(src.connectors) ? src.connectors : {};
    CONNECTORS.forEach(function (c) {
      var v = cs[c.id];
      if (!isObj(v)) return;
      var values = {};
      var srcValues = isObj(v.values) ? v.values : {};
      c.fields.forEach(function (f) { if (has(srcValues, f.key)) values[f.key] = clampStr(srcValues[f.key], 200); });
      out.connectors[c.id] = {
        status: v.status === 'connected' && !c.soon ? 'connected' : 'off',
        values: values,
        connectedAt: isoOr(v.connectedAt, '')
      };
    });
    if (isObj(src.stock)) {
      var stock = {};
      Object.keys(src.stock).forEach(function (pid) { var n = toInt(src.stock[pid]); if (n !== null && n >= 0) stock[pid] = n; });
      out.stock = stock;
    }
    return out;
  }

  // A fresh 'jeere-admin' for a fiche: default settings (free subdomain from the store name,
  // payout number = the store's WhatsApp, the owner in the team when an account is given),
  // no connector, and 14 demo orders.
  function adminDefaults(config, account, now) {
    var cfg = isObj(config) ? config : null;
    var acc = normalizeAccount(account);
    var settings = normSettings2(clone(ADMIN_DEFAULTS), cfg);
    var wa = cfg && isObj(cfg.store) ? normalizeWhatsapp(str(cfg.store.whatsapp, '')) : '';
    settings.payoutPhone = (acc && acc.phone) || wa;
    if (acc && (acc.firstName || acc.phone)) settings.team = [{ name: acc.firstName, phone: acc.phone, role: 'proprietaire' }];
    return { version: 1, orders: demoOrders(cfg, 14, now), settings: settings, connectors: {} };
  }

  /* ------------------------------------------------------------------ demo orders
   * demoOrders(config, n = 14, now = new Date()): example orders made from the fiche's products
   * and delivery zones, for the dashboard (labelled « Données d'exemple »). Deterministic: the same
   * fiche and the same `now` always give the same orders (a seeded generator, no Math.random).
   * Newest first; ids '#1042' (the oldest) upwards; dates spread over the last 10 days (Abidjan is
   * on UTC, so the ISO time is the local time); payments only among the fiche's enabled methods
   * ('cod' when none is enabled: the order came by WhatsApp); delivery fee = the customer's
   * zone. The customers are made up (customer.address is an extra: quartier and landmark).
   * Also accepts demoOrders(config, { n, now }) and demoOrders(config, now).
   */

  var DEMO_NAMES = ['Aminata K.', 'Koffi Y.', 'Adjoa B.', 'Mariam T.', 'Yao N.', 'Fatou D.', 'Kouamé A.', 'Awa S.', 'Aïcha C.', 'Ibrahim O.', 'Akissi M.', 'Konan E.'];
  var DEMO_QUARTIERS = {
    'abobo': ['Abobo-Baoulé', 'PK 18', 'Avocatier'],
    'adjame': ['220 Logements', 'Williamsville'],
    'attecoube': ['Locodjro', 'Santé'],
    'cocody': ['Riviera 2', 'Angré 8e tranche', 'Deux-Plateaux', 'Riviera Palmeraie'],
    'koumassi': ['Remblais', 'Sicogi'],
    'marcory': ['Zone 4', 'Biétry', 'Marcory Résidentiel'],
    'plateau': ['Avenue Chardy', 'Rue du Commerce'],
    'port-bouet': ['Vridi', 'Gonzagueville'],
    'treichville': ['Avenue 16', 'Arras'],
    'yopougon': ['Niangon', 'Maroc', 'Selmer'],
    'bingerville': ['Centre-ville']
  };
  var DEMO_LANDMARKS = ['près de la pharmacie', 'face au marché', 'derrière l’école primaire', 'à côté de la station-service', 'près de l’église', 'en face de la boulangerie', 'portail bleu', 'immeuble jaune, 2e étage'];
  var DEMO_NOTES = ['Appelez-moi avant de passer, s’il vous plaît.', 'Livrer après 17 h.', 'C’est un cadeau : merci de ne pas laisser le prix dans le colis.', 'Je suis au bureau jusqu’à 16 h.', 'Laissez le colis au gardien si je ne réponds pas.'];
  var DEMO_STATUS = ['new', 'paid', 'new', 'paid', 'shipped', 'new', 'shipped', 'delivered', 'delivered', 'cancelled', 'delivered', 'delivered', 'delivered', 'delivered'];
  var PAY_WEIGHT = { wave: 30, orange: 24, mtn: 14, moov: 8, cod: 30, card: 6 };
  var CHANNEL_WEIGHT = [['boutique', 45], ['whatsapp', 33], ['instagram', 13], ['tiktok', 9]];

  function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function seeded(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickWeighted(r, pairs) {
    var total = pairs.reduce(function (t, p) { return t + p[1]; }, 0);
    var x = r() * total;
    for (var i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x < 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }

  // The checkout's zones: the first enabled delivery section's, else a hidden one's, else the communes.
  function deliveryZones(config) {
    var secs = (isObj(config) && Array.isArray(config.sections) ? config.sections : []).filter(function (s) { return isObj(s) && s.type === 'delivery'; });
    var ordered = secs.filter(function (s) { return s.enabled !== false; }).concat(secs.filter(function (s) { return s.enabled === false; }));
    for (var i = 0; i < ordered.length; i++) {
      var st = isObj(ordered[i].settings) ? ordered[i].settings : {};
      var zones = (Array.isArray(st.zones) ? st.zones : []).filter(isObj).map(function (z) {
        return { name: str(z.name, '').replace(/\s+/g, ' ').trim(), fee: clampInt(z.fee, 0, 100000, 0) };
      }).filter(function (z) { return z.name; });
      if (zones.length) return zones;
    }
    return clone(communes);
  }

  function demoOrdersInner(config, n, now) {
    if ((isObj(n) && !(n instanceof Date))) { now = n.now; n = n.n !== undefined ? n.n : n.count; }
    else if (n instanceof Date || typeof n === 'string') { now = n; n = undefined; }
    var count = n === undefined || n === null ? 14 : clampInt(n, 0, 60, 14);
    var nowMs = now instanceof Date ? now.getTime() : (typeof now === 'number' || typeof now === 'string' ? new Date(now).getTime() : NaN);
    if (!isFinite(nowMs)) nowMs = Date.now();

    var cfg = normalizeConfig(config);
    var products = cfg.products.filter(function (p) { return p.name.trim(); });
    if (!products.length || !count) return [];
    var zones = deliveryZones(cfg);
    var payKeys = PAYMENT_KEYS.filter(function (k) { return cfg.payments[k] === true; });
    if (!payKeys.length) payKeys = ['cod'];
    var payPairs = payKeys.map(function (k) { return [k, PAY_WEIGHT[k]]; });

    var r = seeded(hash32([cfg.store.name, products.map(function (p) { return p.id + p.name + p.price; }).join(','),
      zones.map(function (z) { return z.name + z.fee; }).join(','), payKeys.join(',')].join('|')));

    // A small pool of customers, some of whom order more than once.
    var names = DEMO_NAMES.slice();
    for (var i = names.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var tmp = names[i]; names[i] = names[j]; names[j] = tmp; }
    var pool = names.slice(0, Math.min(names.length, Math.max(4, Math.ceil(count * 0.7)))).map(function (name) {
      var zone = zones[Math.floor(r() * zones.length)];
      var q = DEMO_QUARTIERS[slugify(zone.name)];
      var landmark = DEMO_LANDMARKS[Math.floor(r() * DEMO_LANDMARKS.length)];
      var digits = String(100000 + Math.floor(r() * 900000)).slice(-6);
      return {
        name: name,
        phone: '+225' + ['07', '05', '01'][Math.floor(r() * 3)] + '00' + digits,
        commune: zone.name,
        address: (q ? q[Math.floor(r() * q.length)] + ', ' : '') + landmark,
        fee: zone.fee
      };
    });

    var dayMs = 86400000;
    var startOfToday = Math.floor(nowMs / dayMs) * dayMs;
    var orders = [];
    for (var k = 0; k < count; k++) {
      var day = Math.floor(k * 10 / count);
      var t = day === 0
        ? nowMs - (25 + k * 110 + Math.floor(r() * 60)) * 60000
        : startOfToday - day * dayMs + (8 * 60 + Math.floor(r() * 13 * 60)) * 60000;
      var c = pool[Math.floor(Math.pow(r(), 1.6) * pool.length)];
      var nItems = Math.min(products.length, 1 + (r() < 0.35 ? 1 : 0) + (r() < 0.12 ? 1 : 0));
      var picked = [];
      var items = [];
      while (items.length < nItems) {
        var p = products[Math.floor(r() * products.length)];
        if (picked.indexOf(p.id) !== -1) continue;
        picked.push(p.id);
        var qty = r() < 0.72 ? 1 : (r() < 0.8 ? 2 : 3);
        items.push({ productId: p.id, name: p.name, qty: qty, price: p.price });
      }
      var subtotal = items.reduce(function (sum, it) { return sum + it.qty * it.price; }, 0);
      var order = {
        id: '', date: '', time: t,
        customer: { name: c.name, phone: c.phone, commune: c.commune, address: c.address },
        items: items,
        subtotal: subtotal,
        delivery: c.fee,
        total: subtotal + c.fee,
        payment: pickWeighted(r, payPairs),
        status: 'new',
        channel: pickWeighted(r, CHANNEL_WEIGHT)
      };
      if (r() < 0.3) order.note = DEMO_NOTES[Math.floor(r() * DEMO_NOTES.length)];
      orders.push(order);
    }
    orders.sort(function (a, b) { return b.time - a.time; });
    orders.forEach(function (o, rank) {
      o.id = '#' + (1042 + count - 1 - rank);
      o.date = new Date(o.time).toISOString();
      delete o.time;
      var st = DEMO_STATUS[rank] || (rank % 9 === 4 ? 'cancelled' : 'delivered');
      if (st === 'paid' && o.payment === 'cod') st = 'new'; // paid to the courier, on delivery
      o.status = st;
    });
    return orders;
  }

  function demoOrders(config, n, now) {
    try { return demoOrdersInner(config, n, now); } catch (e) { return []; }
  }

  /* ------------------------------------------------------------------ export */

  root.JEERE_DATA = {
    version: 1,
    ART_KINDS: ART_KINDS,
    ART_LABELS: ART_LABELS,
    BADGES: BADGES,
    PAYMENTS: PAYMENTS,
    PAGES: PAGES,
    PRODUCT_COLORS: PRODUCT_COLORS,
    RADIUS_OPTIONS: RADIUS_OPTIONS,
    BUTTON_OPTIONS: BUTTON_OPTIONS,
    INTENSITY_OPTIONS: INTENSITY_OPTIONS,
    DEFAULT_INTENSITY: DEFAULT_INTENSITY,
    // custom colours (optional theme.colors and sections[].settings.bg / fg / buttonBg / buttonText)
    PALETTE_COLOR_KEYS: PALETTE_COLOR_KEYS,
    ELEMENT_COLOR_KEYS: ELEMENT_COLOR_KEYS,
    ELEMENT_ZONES: ELEMENT_ZONES,
    COLOR_KEYS: COLOR_KEYS,
    COLOR_GROUPS: COLOR_GROUPS,
    COLOR_LABELS: COLOR_LABELS,
    SECTION_COLOR_KEYS: SECTION_COLOR_KEYS,
    SECTION_BG_OPTIONS: SECTION_BG_OPTIONS,
    CONTRAST_MIN: CONTRAST_MIN,
    POP_COLORS: POP_COLORS,
    themeColors: themeColors,
    sectionColors: sectionColors,
    zoneColors: zoneColors,
    colorOverrides: colorOverrides,
    colorChecks: colorChecks,
    logoTone: logoTone,
    logoToneOf: logoToneOf,
    logoGrounds: logoGrounds,
    logoChecks: logoChecks,
    fixColors: fixColors,
    setColorKey: setColorKey,
    nearestReadable: nearestReadable,
    contrastRatio: contrastRatio,
    mixColors: mixHex,
    templates: templates,
    palettes: palettes,
    fontPairs: fontPairs,
    // the seller's fonts (optional theme.typography): 33 Google Fonts in 5 styles, see the comment above FONTS
    FONTS: FONTS,
    FONT_STYLES: FONT_STYLES,
    TEXT_FONT_IDS: TEXT_FONT_IDS,
    TEXT_WEIGHTS: TEXT_WEIGHTS,
    WEIGHT_LABELS: WEIGHT_LABELS,
    HEADING_SIZES: HEADING_SIZES,
    HEADING_SIZE_OPTIONS: HEADING_SIZE_OPTIONS,
    HEADING_UPPER_DEFAULT: HEADING_UPPER_DEFAULT,
    upperDefault: upperDefault,
    TYPO_KEYS: TYPO_KEYS,
    GLYPH_TEXT: GLYPH_TEXT,
    GLYPH_FALLBACKS: GLYPH_FALLBACKS,
    typography: typography,
    normTypography: normTypography,
    nearestWeight: nearestWeight,
    fontSampleUrl: fontSampleUrl,
    setFontPair: setFontPair,
    // her own fonts (optional theme.customFonts, « Mes polices »): imported files and Google Fonts by name
    CUSTOM_FONT_LIMITS: CUSTOM_FONT_LIMITS,
    FONT_FORMAT_CSS: FONT_FORMAT_CSS,
    normCustomFonts: normCustomFonts,
    customFamilies: customFamilies,
    customFontFaces: customFontFaces,
    fontOf: fontOf,
    fontDataFormat: fontDataFormat,
    cleanFontName: cleanFontName,
    googleFamilyName: googleFamilyName,
    googleSampleUrl: googleSampleUrl,
    roundWeight: roundWeight,
    radii: radii,
    sectionTypes: sectionTypes,
    niches: niches,
    communes: communes,
    // demo photos (69 photos from Unsplash, credited in img/demo/CREDITS.md): see the comment above DEMO_PHOTOS
    DEMO_PHOTOS: DEMO_PHOTOS,
    NICHE_PHOTOS: NICHE_PHOTOS,
    PHOTO_DIR: 'img/demo/',
    demoPhoto: demoPhoto,
    photoId: photoId,
    defaultConfig: defaultConfig,
    sectionSettings: sectionSettings,
    validate: validate,
    normalizeConfig: normalizeConfig,
    normalizeWhatsapp: normalizeWhatsapp,
    formatPrice: formatPrice,
    formatNumber: formatNumber,
    applyName: applyName,
    clone: clone,
    newId: newId,
    // custom store pages (config.pages)
    PAGE_LIMITS: PAGE_LIMITS,
    PAGE_KINDS: PAGE_KINDS,
    slugify: slugify,
    uniqueSlug: uniqueSlug,
    defaultPages: defaultPages,
    pageKind: pageKind,
    // the store's logo (optional store keys logo, logoSize, logoPosition, showName, icon)
    LOGO_SIZES: LOGO_SIZES,
    LOGO_SIZE_OPTIONS: LOGO_SIZE_OPTIONS,
    LOGO_POSITIONS: LOGO_POSITIONS,
    LOGO_DEFAULT_POSITION: LOGO_DEFAULT_POSITION,
    LOGO_LIMITS: LOGO_LIMITS,
    BRAND_KEYS: BRAND_KEYS,
    logoHeight: logoHeight,
    imageSize: imageSize,
    brand: brand,
    // the seller side: account, dashboard, connectors, plans, demo orders
    STORAGE_KEYS: STORAGE_KEYS,
    DOMAIN_SUFFIX: DOMAIN_SUFFIX,
    DNS_TARGET: DNS_TARGET,
    subdomainFor: subdomainFor,
    PLANS: PLANS,
    PLAN_FEATURES: PLAN_FEATURES,
    PLAN_NOTE: PLAN_NOTE,
    CONNECTOR_CATEGORIES: CONNECTOR_CATEGORIES,
    CONNECTORS: CONNECTORS,
    OPERATOR_OPTIONS: OPERATOR_OPTIONS,
    TEAM_ROLES: TEAM_ROLES,
    ADMIN_DEFAULTS: ADMIN_DEFAULTS,
    ORDER_STATUSES: ORDER_STATUSES,
    ORDER_CHANNELS: ORDER_CHANNELS,
    adminDefaults: adminDefaults,
    normalizeAdmin: normalizeAdmin,
    normalizeAccount: normalizeAccount,
    deliveryZones: deliveryZones,
    demoOrders: demoOrders
  };
})();
