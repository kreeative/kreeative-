/*
 * Jeere — elstyles.js: element styles, the design layer of the Studio's inspector.
 *
 * Global: window.JeereElStyles. Loaded right after render.js on every page that renders a store
 * (creer/, admin/, studio/). No library, no build, never throws.
 *
 * The contract (an optional top-level key of the fiche, kept and sanitised by normalizeConfig):
 *
 *   elementStyles: {
 *     "<sectionId>/<elementKey>": {            // "s2/button", "s4/card", "s4/card~p3", "@header/logo"
 *       base:    { ...props },                   // every screen (« Toutes »)
 *       desktop: { ...props },                   // computer only (>= 1024 px, desktop layout)
 *       tablet:  { ...props },                   // tablet AND phone (cascade: the phone inherits it)
 *       phone:   { ...props },                   // phone only (the phone layout)
 *       hover:   { ...props },                   // :hover (under @media (hover: hover))
 *       pressed: { ...props },                   // :active
 *       focus:   { ...props }                    // :focus-visible
 *     }
 *   }
 *
 *   sectionId: a section id of the fiche ('s1'…), or '@header' / '@footer' (always rendered).
 *   elementKey: a key of REGISTRY[sectionType] ('section' is the section itself); 'card~<productId>'
 *   styles one product card. Every layer is optional; props are whitelisted (PROPS), numbers are
 *   clamped to their range, colours are #RRGGBB / #RRGGBBAA or a palette token ('@accent',
 *   '@accent/40' = 40 % of it), images are a demo photo ('demo:<id>') or a base64 data: image —
 *   never raw CSS, never url(), never an expression. Unknown keys, layers and values are dropped.
 *
 * Cascade (SPEC-DUALENGINE §1.5 and §4.3): base → desktop; base → tablet → phone; a state wins over
 * the breakpoint it is shown on. Overrides are per property, exact values (never deltas).
 *
 * Application: apply(config, rootEl) puts ONE <style data-jst-es> at the end of the store root,
 * scoped by an attribute on the root (data-jst-es="<n>"), with the breakpoint on the root
 * (data-jst-bp = 'desktop' | 'tablet' | 'tablet phone', from the layout and the root's width,
 * kept fresh by a ResizeObserver) — the store's layout depends on data-device and on the root's
 * width, never on the window, so the artboards of the Studio and the real store agree. Every
 * declaration is !important: the designer's choice beats the template, its states and inline
 * styles. A fiche without elementStyles is not touched at all (byte-identical render).
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  function DATA() { return root.JEERE_DATA || null; }
  function RENDER() { return root.JeereRender || null; }

  var hasOwn = Object.prototype.hasOwnProperty;
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function own(o, k) { return isObj(o) && hasOwn.call(o, k); }
  function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
  function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }

  /* ================================================================== registry
   * The stylable elements of each section type: key, label (French, shown in the inspector),
   * selector inside [data-section-id] ('' = the section itself), kind (which property groups
   * apply), field (the fiche field it shows, for the Studio's content inspector), media (the
   * <img> inside a box, for fit / focal point / filters). */

  var KINDS = {
    section:   { groups: ['layout', 'radius', 'fill', 'border', 'shadow', 'effects', 'text'], states: ['hover'] },
    container: { groups: ['layout', 'radius', 'fill', 'border', 'shadow', 'effects'], states: ['hover', 'pressed'] },
    text:      { groups: ['layout', 'typography', 'fill', 'radius', 'border', 'shadow', 'effects'], states: ['hover', 'pressed'] },
    button:    { groups: ['layout', 'radius', 'fill', 'border', 'shadow', 'typography', 'effects'], states: ['hover', 'pressed', 'focus'] },
    image:     { groups: ['layout', 'image', 'radius', 'border', 'shadow', 'effects'], states: ['hover'] },
    badge:     { groups: ['layout', 'typography', 'radius', 'fill', 'border', 'shadow', 'effects'], states: ['hover'] },
    icon:      { groups: ['icon', 'iconBox', 'layout', 'border', 'shadow', 'effects'], states: ['hover', 'pressed'] },
    card:      { groups: ['cardFields', 'layout', 'radius', 'fill', 'border', 'shadow', 'effects'], states: ['hover', 'pressed'] },
    page:      { groups: [], states: [] }
  };

  var KICKER = ':is(.jst-kicker, .jst-pill, .jst-tag)';
  var SECTION = { key: 'section', label: 'Section', sel: '', kind: 'section' };
  function headTitle() { return { key: 'title', label: 'Titre', sel: '.jst-head-title', kind: 'text', field: 'title' }; }

  var REGISTRY = {
    hero: [
      SECTION,
      { key: 'copy', label: 'Bloc texte', sel: '.jst-hero-copy', kind: 'container' },
      { key: 'kicker', label: 'Petit titre', sel: KICKER, kind: 'text', field: 'kicker' },
      { key: 'title', label: 'Titre', sel: '.jst-hero-title', kind: 'text', field: 'title' },
      { key: 'text', label: 'Texte', sel: '.jst-hero-text', kind: 'text', field: 'text' },
      { key: 'actions', label: 'Zone du bouton', sel: '.jst-hero-actions', kind: 'container' },
      { key: 'button', label: 'Bouton', sel: '.jst-hero-actions .jst-btn', kind: 'button', field: 'button' },
      { key: 'image', label: 'Image', sel: '.jst-hero-img', kind: 'image' }
    ],
    announcement: [
      SECTION,
      { key: 'text', label: 'Texte', sel: '.jst-ann-item', kind: 'text', field: 'text' }
    ],
    categories: [
      SECTION, headTitle(),
      { key: 'card', label: 'Carte catégorie', sel: '.jst-cat', kind: 'container' },
      { key: 'cardImage', label: 'Image de catégorie', sel: '.jst-cat-media', kind: 'image', media: 'img' },
      { key: 'cardName', label: 'Nom de catégorie', sel: '.jst-cat-name', kind: 'text' },
      { key: 'arrow', label: 'Flèche', sel: '.jst-cat-go', kind: 'icon' }
    ],
    products: [
      SECTION, headTitle(),
      { key: 'grid', label: 'Grille', sel: '.jst-grid', kind: 'container' },
      { key: 'card', label: 'Carte produit', sel: '.jst-card', kind: 'card' },
      { key: 'cardImage', label: 'Image produit', sel: '.jst-card-media', kind: 'image', media: 'img' },
      { key: 'badge', label: 'Badge', sel: '.jst-badge', kind: 'badge' },
      { key: 'fav', label: 'Cœur (favori)', sel: '.jst-fav', kind: 'icon' },
      { key: 'category', label: 'Catégorie', sel: '.jst-card-cat', kind: 'text' },
      { key: 'name', label: 'Nom du produit', sel: '.jst-card-name', kind: 'text' },
      { key: 'price', label: 'Prix', sel: '.jst-card-price', kind: 'text' },
      { key: 'cardButton', label: 'Bouton « Ajouter »', sel: '.jst-card-btn', kind: 'button' }
    ],
    about: [
      SECTION,
      { key: 'image', label: 'Image', sel: '.jst-about-media', kind: 'image', media: 'img' },
      { key: 'kicker', label: 'Petit titre', sel: '.jst-about-copy .jst-kicker', kind: 'text' },
      { key: 'title', label: 'Titre', sel: '.jst-about-title', kind: 'text', field: 'title' },
      { key: 'text', label: 'Texte', sel: '.jst-about-text', kind: 'text', field: 'text' },
      { key: 'sign', label: 'Signature', sel: '.jst-sign', kind: 'text' }
    ],
    reviews: [
      SECTION, headTitle(),
      { key: 'rating', label: 'Note moyenne', sel: '.jst-rating', kind: 'container' },
      { key: 'card', label: 'Carte avis', sel: '.jst-review', kind: 'container' },
      { key: 'stars', label: 'Étoiles', sel: '.jst-review .jst-stars', kind: 'icon' },
      { key: 'quote', label: 'Texte de l’avis', sel: '.jst-review-text', kind: 'text' },
      { key: 'author', label: 'Auteur', sel: '.jst-review-who', kind: 'text' }
    ],
    delivery: [
      SECTION,
      { key: 'icon', label: 'Pictogramme', sel: '.jst-delivery-ico', kind: 'icon' },
      { key: 'title', label: 'Titre', sel: '.jst-delivery-title', kind: 'text', field: 'title' },
      { key: 'text', label: 'Texte', sel: '.jst-delivery-text', kind: 'text', field: 'text' },
      { key: 'zones', label: 'Liste des zones', sel: '.jst-zones', kind: 'container' },
      { key: 'zone', label: 'Zone', sel: '.jst-zone', kind: 'container' },
      { key: 'price', label: 'Frais', sel: '.jst-zone .jst-price', kind: 'text' }
    ],
    whatsapp: [
      SECTION,
      { key: 'panel', label: 'Bandeau', sel: '.jst-wa', kind: 'container' },
      { key: 'icon', label: 'Pictogramme', sel: '.jst-wa-ico', kind: 'icon' },
      { key: 'title', label: 'Titre', sel: '.jst-wa-title', kind: 'text', field: 'title' },
      { key: 'text', label: 'Texte', sel: '.jst-wa-text', kind: 'text', field: 'text' },
      { key: 'button', label: 'Bouton', sel: '.jst-wa-cta .jst-btn', kind: 'button', field: 'button' }
    ],
    '@header': [
      { key: 'header', label: 'En-tête', sel: '', kind: 'section' },
      { key: 'logo', label: 'Nom / logo', sel: '.jst-logo', kind: 'text' },
      { key: 'nav', label: 'Liens du menu', sel: '.jst-nav-link', kind: 'text' },
      { key: 'menu', label: 'Menu', sel: '.jst-menu', kind: 'icon' },
      { key: 'search', label: 'Recherche', sel: '.jst-search', kind: 'icon' },
      { key: 'bag', label: 'Panier', sel: '.jst-bag', kind: 'icon' }
    ],
    '@page': [
      { key: 'page', label: 'Page', sel: '', kind: 'page' }
    ],
    '@footer': [
      { key: 'footer', label: 'Pied de page', sel: '', kind: 'section' },
      { key: 'name', label: 'Nom de la boutique', sel: '.jst-footer-name', kind: 'text' },
      { key: 'heading', label: 'Titres de colonnes', sel: '.jst-footer-h', kind: 'text' },
      { key: 'link', label: 'Liens', sel: '.jst-footer-link', kind: 'text' },
      { key: 'bottom', label: 'Bas de page', sel: '.jst-footer-bottom', kind: 'container' }
    ]
  };
  var CHROME = { '@header': { sel: '.jst-header', label: 'En-tête' }, '@footer': { sel: '.jst-footer', label: 'Pied de page' }, '@page': { sel: '', label: 'Page' } };

  function elementsFor(type) { return REGISTRY[type] ? REGISTRY[type].slice() : (type ? [SECTION] : []); }
  function elementDef(type, key) {
    var base = String(key || '').split('~')[0];
    var list = REGISTRY[type] || [SECTION];
    for (var i = 0; i < list.length; i++) if (list[i].key === base) return list[i];
    return null;
  }

  var SID_RE = /^(s[1-9]\d{0,5}|@header|@footer|@page)$/;
  var EKEY_RE = /^([a-z][A-Za-z0-9]{0,23})(?:~([A-Za-z0-9_-]{1,40}))?$/;
  function parseKey(k) {
    if (typeof k !== 'string' || k.length > 90) return null;
    var at = k.indexOf('/');
    if (at < 1) return null;
    var sid = k.slice(0, at), ek = k.slice(at + 1);
    var m = EKEY_RE.exec(ek);
    if (!SID_RE.test(sid) || !m) return null;
    if (m[2] && m[1] !== 'card') return null; // only product cards take a per-item suffix
    return { sid: sid, el: m[1], item: m[2] || null, key: k };
  }
  function keyOf(sid, el, item) { return sid + '/' + el + (item ? '~' + item : ''); }

  function attrEsc(s) { return String(s).replace(/["\\]/g, ''); }
  // The element's selector inside the store, without the scope: '[data-section-id="s2"] .jst-btn'
  function selectorFor(sid, def, item) {
    var base = CHROME[sid] ? CHROME[sid].sel : '[data-section-id="' + attrEsc(sid) + '"]';
    var sel = def && def.sel ? def.sel : '';
    if (item) sel = (sel || '') + '[data-product-id="' + attrEsc(item) + '"]';
    return sel ? (base ? base + ' ' + sel : sel) : base;
  }

  /* ================================================================== icons
   * The icons an element can take (Design › Icône, button icons): 24 × 24 strokes, drawn by a CSS
   * mask in the element's colour — the store's markup never changes. Same drawing rules as render.js. */
  var ICONS = {
    bag: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    cart: '<path d="M3 4h2.2l2.2 11h10.4l2-7.6H6.4"/><circle cx="9" cy="19.2" r="1.4"/><circle cx="16.6" cy="19.2" r="1.4"/>',
    basket: '<path d="M3.5 10h17l-1.8 9.5H5.3z"/><path d="M8 10l3-5.5M16 10l-3-5.5M9.5 14v2.5M14.5 14v2.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    menu2: '<path d="M4 8h16M4 16h16"/>',
    search: '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.3-4.3"/>',
    chat: '<path d="M20 11.6a7.9 7.9 0 0 1-11.6 7l-4.4 1.2 1.2-4.2A7.9 7.9 0 1 1 20 11.6z"/><path d="M8.6 10.4h6.8M8.6 13.4h4.2"/>',
    whatsapp: '<path d="M4 20l1.3-4.2A8.3 8.3 0 1 1 8.4 19z"/><path d="M9 8.6c0 3.4 2.9 6.4 6.4 6.4l1.2-1.7-2-1-1 .9c-1-.4-2.2-1.6-2.6-2.6l.9-1-1-2z"/>',
    arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    arrowUpRight: '<path d="M7 17L17 7M8.5 7H17v8.5"/>',
    chevron: '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    check: '<path d="M5 12.5l4.3 4.3L19 7.2"/>',
    heart: '<path d="M12 19.6s-7.4-4.5-7.4-9.9A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.4 2.4c0 5.4-7.4 9.9-7.4 9.9z"/>',
    star: '<path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
    sparkle: '<path d="M12 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/>',
    truck: '<path d="M2.8 6.5h11v9.5h-11z"/><path d="M13.8 9.5h3.7l3.7 3.6V16h-7.4"/><circle cx="6.8" cy="17.6" r="1.9"/><circle cx="17.2" cy="17.6" r="1.9"/>',
    pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6.2L20.5 7"/>',
    user: '<circle cx="12" cy="8.4" r="3.8"/><path d="M4.8 20c.8-3.8 3.6-6 7.2-6s6.4 2.2 7.2 6"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5C10.5 5 7 5 7 7s3 1.5 5 1.5zM12 8.5c1.5-3.5 5-3.5 5-1.5s-3 1.5-5 1.5z"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/>',
    shield: '<path d="M12 3.2l7 2.6v5.6c0 4.5-3 8-7 9.4-4-1.4-7-4.9-7-9.4V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14.5-14-0.5 9.5-6 14.5-14 14z"/><path d="M5 19l7.5-7.5"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/>',
    cash: '<rect x="2.8" y="6.5" width="18.4" height="11" rx="1.8"/><circle cx="12" cy="12" r="2.6"/><path d="M6.2 9.6v4.8M17.8 9.6v4.8"/>',
    card: '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path d="M2.8 9.8h18.4M6.5 15h4"/>',
    close: '<path d="M7 7l10 10M17 7L7 17"/>'
  };
  var ICON_LABELS = { bag: 'Sac', cart: 'Chariot', basket: 'Panier', menu: 'Menu', menu2: 'Menu (2 traits)', search: 'Loupe', chat: 'Bulle', whatsapp: 'WhatsApp',
    arrow: 'Flèche', arrowUpRight: 'Flèche oblique', chevron: 'Chevron', plus: 'Plus', check: 'Coche', heart: 'Cœur', star: 'Étoile', spark: 'Éclat',
    sparkle: 'Étincelles', truck: 'Livraison', pin: 'Lieu', phone: 'Téléphone', mail: 'E-mail', user: 'Compte', home: 'Maison', gift: 'Cadeau', tag: 'Étiquette',
    clock: 'Horloge', shield: 'Garantie', lock: 'Cadenas', leaf: 'Feuille', camera: 'Photo', cash: 'Espèces', card: 'Carte bancaire', close: 'Fermer' };
  var ICON_IDS = Object.keys(ICONS);
  function iconSvg(id, sw, color) {
    var w = typeof sw === 'number' && isFinite(sw) ? clamp(sw, 0.5, 4) : 1.7;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#000') + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[id] || '') + '</svg>';
  }
  function iconMask(id, sw) { return 'url("data:image/svg+xml,' + encodeURIComponent(iconSvg(id, sw)).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29') + '")'; }

  /* ================================================================== properties
   * The whitelist. t: num (min, max, int), enum (v), bool, color, font, image, stops, shadows. */

  var BLEND = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
    'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter'];
  var EASES = ['ease', 'ease-out', 'ease-in-out', 'expo', 'linear', 'spring', 'bounce'];

  function N(min, max, int) { return { t: 'num', min: min, max: max, int: !!int }; }
  function E(v) { return { t: 'enum', v: v }; }
  var PROPS = {
    // layout
    wMode: E(['hug', 'fill', 'fixed']), w: N(0, 4000), wUnit: E(['px', '%', 'vw']),
    hMode: E(['hug', 'fill', 'fixed']), h: N(0, 4000), hUnit: E(['px', '%', 'vh']),
    minW: N(0, 4000), maxW: N(0, 4000), minH: N(0, 4000), maxH: N(0, 4000),
    pt: N(0, 600), pr: N(0, 600), pb: N(0, 600), pl: N(0, 600),
    mt: N(-600, 600), mr: N(-600, 600), mb: N(-600, 600), ml: N(-600, 600),
    gap: N(0, 400), stack: E(['col', 'row']), alignX: E(['start', 'center', 'end', 'stretch']),
    alignY: E(['start', 'center', 'end', 'between']), wrap: { t: 'bool' },
    textAlign: E(['left', 'center', 'right', 'justify']), contentW: N(240, 2400),
    pos: E(['relative', 'absolute']), top: N(-2000, 2000), right: N(-2000, 2000), bottom: N(-2000, 2000), left: N(-2000, 2000),
    z: N(-10, 100, true), overflow: E(['visible', 'hidden']),
    // radius
    rTL: N(0, 999), rTR: N(0, 999), rBR: N(0, 999), rBL: N(0, 999), smooth: N(0, 100),
    // fill
    fillType: E(['solid', 'linear', 'radial', 'image', 'none']), fill: { t: 'color' },
    gradAngle: N(0, 360), gradStops: { t: 'stops' }, gradShape: E(['circle', 'ellipse']), gradX: N(0, 100), gradY: N(0, 100),
    bgImage: { t: 'image' }, bgFit: E(['cover', 'contain', 'fill', 'tile']), bgPosX: N(0, 100), bgPosY: N(0, 100), bgTint: { t: 'color' },
    opacity: N(0, 100), blend: E(BLEND),
    // border
    bW: N(0, 64), bWT: N(0, 64), bWR: N(0, 64), bWB: N(0, 64), bWL: N(0, 64),
    bStyle: E(['solid', 'dashed', 'dotted']), bColor: { t: 'color' }, bAlign: E(['inside', 'center', 'outside']),
    // shadow
    shadows: { t: 'shadows' },
    // effects
    blur: N(0, 100), bblur: N(0, 100), rotate: N(-360, 360), scale: N(10, 400), skewX: N(-80, 80), skewY: N(-80, 80),
    tx: N(-2000, 2000), ty: N(-2000, 2000),
    // typography
    font: { t: 'font' }, fontSize: N(6, 240), fontWeight: N(100, 900, true), italic: { t: 'bool' }, lh: N(0.5, 4),
    ls: N(-20, 100), textCase: E(['none', 'upper', 'lower', 'capitalize']), deco: E(['none', 'underline', 'line-through']),
    color: { t: 'color' },
    // image
    fit: E(['cover', 'contain', 'fill', 'none']), focusX: N(0, 100), focusY: N(0, 100),
    zoom: N(100, 400), ratio: N(0.2, 5),
    brightness: N(0, 200), contrast: N(0, 200), saturate: N(0, 200), grayscale: N(0, 100), sepia: N(0, 100), hue: N(-180, 180),
    // visibility (per breakpoint, never cascaded: each screen says itself)
    hide: { t: 'bool' },
    // icons: another drawing, its size and stroke, its container's shape; a button's icon
    icon: E(ICON_IDS), iconSize: N(8, 160), iconStroke: N(0.5, 4), shape: E(['none', 'circle', 'rounded', 'square']),
    btnIcon: E(['none'].concat(ICON_IDS)), btnIconPos: E(['left', 'right']),
    // product cards: which fields show, the photo's ratio
    hidePrice: { t: 'bool' }, hideBadge: { t: 'bool' }, hideButton: { t: 'bool' }, hideCat: { t: 'bool' }, mediaRatio: N(0.2, 5),
    // the page: the store's two fonts, everywhere
    fontDisplay: { t: 'font' }, fontText: { t: 'font' },
    // transition (base only)
    tDur: N(0, 3000, true), tEase: E(EASES)
  };
  var BASE_ONLY = { tDur: 1, tEase: 1 };
  var LAYERS = ['base', 'desktop', 'tablet', 'phone', 'hover', 'pressed', 'focus'];
  var BPS = ['base', 'desktop', 'tablet', 'phone'];
  var STATES = ['hover', 'pressed', 'focus'];

  /* ------------------------------------------------------------------ colours */

  var TOKENS = { accent: '--st-accent', bg: '--st-bg', surface: '--st-surface', text: '--st-text', muted: '--st-muted', line: '--st-line', onAccent: '--st-on-accent' };
  var TOKEN_RE = /^@(accent|bg|surface|text|muted|line|onAccent)(?:\/(\d{1,3}))?$/;
  function hex2(n) { var s = clamp(Math.round(n), 0, 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    if (!s) return [l * 255, l * 255, l * 255];
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  // Any CSS-ish colour → { r, g, b, a } (0–255, alpha 0–1), or null
  function parseColor(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (s.length > 60) return null;
    var m;
    if (/^transparent$/i.test(s)) return { r: 0, g: 0, b: 0, a: 0 };
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (c) { return c + c; }).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    var num = '\\s*(-?\\d*\\.?\\d+)(%?)\\s*';
    m = new RegExp('^rgba?\\(' + num + '[,\\s]' + num + '[,\\s]' + num + '(?:[,/]' + num + ')?\\)$', 'i').exec(s);
    if (m) {
      var ch = function (x, pct) { return pct ? Number(x) * 2.55 : Number(x); };
      var a = m[7] == null ? 1 : (m[8] ? Number(m[7]) / 100 : Number(m[7]));
      var out = { r: ch(m[1], m[2]), g: ch(m[3], m[4]), b: ch(m[5], m[6]), a: a };
      if ([out.r, out.g, out.b, out.a].some(function (x) { return !isFinite(x); })) return null;
      return { r: clamp(out.r, 0, 255), g: clamp(out.g, 0, 255), b: clamp(out.b, 0, 255), a: clamp(out.a, 0, 1) };
    }
    m = new RegExp('^hsla?\\(\\s*(-?\\d*\\.?\\d+)(?:deg)?\\s*[,\\s]' + num + '[,\\s]' + num + '(?:[,/]' + num + ')?\\)$', 'i').exec(s);
    if (m) {
      var rgb = hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[4]) / 100);
      var al = m[6] == null ? 1 : (m[7] ? Number(m[6]) / 100 : Number(m[6]));
      if (!isFinite(al) || rgb.some(function (x) { return !isFinite(x); })) return null;
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: clamp(al, 0, 1) };
    }
    return null;
  }
  function formatHex(c) {
    if (!c) return null;
    var a = clamp(c.a == null ? 1 : c.a, 0, 1);
    return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b) + (a >= 0.999 ? '' : hex2(a * 255));
  }
  // The stored form: '#RRGGBB', '#RRGGBBAA' or a token, else null
  function normColor(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    var t = TOKEN_RE.exec(s);
    if (t) {
      if (t[2] == null) return '@' + t[1];
      var pct = clamp(parseInt(t[2], 10), 0, 100);
      return pct >= 100 ? '@' + t[1] : '@' + t[1] + '/' + pct;
    }
    return formatHex(parseColor(s));
  }
  // The CSS of a stored colour
  function colorCss(v) {
    if (typeof v !== 'string') return null;
    var t = TOKEN_RE.exec(v);
    if (t) {
      var vr = 'var(' + TOKENS[t[1]] + ')';
      return t[2] == null ? vr : 'color-mix(in srgb, ' + vr + ' ' + clamp(parseInt(t[2], 10), 0, 100) + '%, transparent)';
    }
    var c = parseColor(v);
    if (!c) return null;
    if (c.a >= 0.999) return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
    return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ', ' + round(c.a, 3) + ')';
  }

  /* ------------------------------------------------------------------ fonts and images */

  function fontsColl() { var d = DATA(); return d && d.FONTS ? d.FONTS : null; }
  function fontInfo(id) {
    var F = fontsColl();
    if (!F || typeof id !== 'string' || !Object.prototype.propertyIsEnumerable.call(F, id)) return null;
    return F[id];
  }
  function normFont(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim().toLowerCase();
    if (s === '@display' || s === '@text') return s;
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s)) return null;
    if (fontsColl()) return fontInfo(s) ? s : null;
    return s;
  }
  var DATA_IMG_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  var MAX_IMG = 1600 * 1024;
  function normImage(v) {
    if (typeof v !== 'string') return null;
    if (v.indexOf('demo:') === 0) {
      var id = v.slice(5);
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) return null;
      var d = DATA();
      if (d && d.DEMO_PHOTOS && !Object.prototype.propertyIsEnumerable.call(d.DEMO_PHOTOS, id)) return null;
      return 'demo:' + id;
    }
    if (v.length > MAX_IMG || v.indexOf('data:image/') !== 0) return null;
    return DATA_IMG_RE.test(v) ? v : null;
  }
  var SAFE_URL_RE = /^[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+$/;
  function imageUrl(v) {
    if (typeof v !== 'string') return null;
    if (v.indexOf('demo:') === 0) {
      var R = RENDER();
      var src = null;
      try { src = R && typeof R.photoSrc === 'function' ? R.photoSrc(v.slice(5)) : null; } catch (e) { src = null; }
      return typeof src === 'string' && SAFE_URL_RE.test(src) ? src : null;
    }
    return DATA_IMG_RE.test(v) ? v : null;
  }

  /* ------------------------------------------------------------------ sanitiser */

  function normNum(v, spec) {
    var n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
    if (!isFinite(n)) return null;
    n = clamp(n, spec.min, spec.max);
    return spec.int ? Math.round(n) : round(n, 2);
  }
  function normStops(v) {
    if (!Array.isArray(v)) return null;
    var out = [];
    v.slice(0, 8).forEach(function (s) {
      if (!isObj(s)) return;
      var c = normColor(s.c), p = normNum(s.p, { min: 0, max: 100 });
      if (c && p !== null) out.push({ c: c, p: p });
    });
    if (out.length < 2) return null;
    out.sort(function (a, b) { return a.p - b.p; });
    return out;
  }
  function normShadows(v) {
    if (!Array.isArray(v)) return null;
    var out = [];
    v.slice(0, 6).forEach(function (s) {
      if (!isObj(s)) return;
      var c = normColor(s.c);
      if (!c) return;
      out.push({
        x: normNum(s.x, { min: -200, max: 200 }) || 0, y: normNum(s.y, { min: -200, max: 200 }) || 0,
        blur: normNum(s.blur, { min: 0, max: 400 }) || 0, spread: normNum(s.spread, { min: -200, max: 200 }) || 0,
        c: c, inset: s.inset === true
      });
    });
    return out; // [] is meaningful: « Aucune ombre » (box-shadow: none)
  }
  function normProp(k, v) {
    var spec = PROPS[k];
    if (!spec || v === null || v === undefined) return null;
    switch (spec.t) {
      case 'num': return normNum(v, spec);
      case 'enum': return typeof v === 'string' && spec.v.indexOf(v) !== -1 ? v : null;
      case 'bool': return typeof v === 'boolean' ? v : null;
      case 'color': return normColor(v);
      case 'font': return normFont(v);
      case 'image': return normImage(v);
      case 'stops': return normStops(v);
      case 'shadows': return normShadows(v);
    }
    return null;
  }
  function sanitizeProps(src, layer) {
    if (!isObj(src)) return null;
    var out = {}, n = 0;
    Object.keys(src).forEach(function (k) {
      if (!hasOwn.call(PROPS, k)) return;
      if (BASE_ONLY[k] && layer && layer !== 'base') return;
      var v = normProp(k, src[k]);
      if (v === null) return;
      out[k] = v; n++;
    });
    return n ? out : null;
  }
  // ctx: { sections: [{ id, type }] } — entries for missing sections or unknown elements are dropped.
  function sanitize(input, ctx) {
    if (!isObj(input)) return null;
    var types = null;
    if (ctx && Array.isArray(ctx.sections)) {
      types = { '@header': '@header', '@footer': '@footer', '@page': '@page' };
      ctx.sections.forEach(function (s) { if (isObj(s) && typeof s.id === 'string') types[s.id] = s.type; });
    }
    var out = {}, count = 0;
    Object.keys(input).forEach(function (k) {
      if (count >= 400) return;
      var pk = parseKey(k);
      if (!pk) return;
      if (types) {
        if (!hasOwn.call(types, pk.sid)) return;
        var type = CHROME[pk.sid] ? pk.sid : types[pk.sid];
        if (!elementDef(type, pk.el)) return;
        if (pk.item && type !== 'products') return;
      }
      var e = input[k];
      if (!isObj(e)) return;
      var clean = {}, any = false;
      LAYERS.forEach(function (L) {
        var p = sanitizeProps(e[L], L);
        if (p) { clean[L] = p; any = true; }
      });
      if (any) { out[k] = clean; count++; }
    });
    return count ? out : null;
  }

  /* ================================================================== cascade */

  function chain(layer) {
    if (layer === 'desktop') return ['desktop', 'base'];
    if (layer === 'tablet') return ['tablet', 'base'];
    if (layer === 'phone') return ['phone', 'tablet', 'base'];
    return ['base'];
  }
  // The value of a prop for (breakpoint, state), with where it comes from
  function resolve(entry, prop, bp, state) {
    var list = (state ? [state] : []).concat(chain(bp || 'base'));
    for (var i = 0; i < list.length; i++) {
      var L = entry && entry[list[i]];
      if (L && hasOwn.call(L, prop)) return { value: L[prop], from: list[i] };
    }
    return { value: undefined, from: null };
  }
  function merged(entry, bp, state) {
    var out = {};
    var list = chain(bp || 'base').slice().reverse();
    if (state) list.push(state);
    list.forEach(function (L) { var o = entry && entry[L]; if (isObj(o)) Object.keys(o).forEach(function (k) { out[k] = o[k]; }); });
    return out;
  }

  /* ================================================================== CSS generator */

  var EASE_CSS = {
    'ease': 'ease', 'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)', 'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
    'expo': 'cubic-bezier(0.16, 1, 0.3, 1)', 'linear': 'linear',
    'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'bounce': 'cubic-bezier(0.34, 1.9, 0.64, 1)'
  };
  var EASE_SPRING = { spring: 0.55, bounce: 0.3 };
  // A damped spring (SPEC-DUALENGINE §5.2) settling within the duration, sampled as CSS linear()
  var springCache = {};
  function springLinear(zeta, ms) {
    var k = zeta + ':' + ms;
    if (springCache[k]) return springCache[k];
    var T = Math.max(ms, 50) / 1000;
    var w0 = Math.log(1000) / (zeta * T);
    var wd = w0 * Math.sqrt(1 - zeta * zeta);
    var n = clamp(Math.round(ms / 16), 24, 72);
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = (i / n) * T;
      var x = Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
      pts.push(i === 0 ? 0 : (i === n ? 1 : round(1 - x, 3)));
    }
    return (springCache[k] = 'linear(' + pts.join(', ') + ')');
  }

  function px(n) { return n === 0 ? '0' : round(n, 2) + 'px'; }
  function pct(n) { return round(n, 2) + '%'; }

  // A layer's props → { sub: { cssProp: value } } (sub '' = the element; ' img'; ' .jst-wrap'), in a fixed order
  function decls(P, def) {
    var out = { '': {} };
    function add(sub, prop, val) { if (val === null || val === undefined || val === '') return; (out[sub] || (out[sub] = {}))[prop] = String(val); }
    var kind = def ? def.kind : 'container';
    var mediaSub = def && def.media ? ' ' + def.media : '';
    // layout
    if (P.stack) {
      add('', 'display', 'flex');
      add('', 'flex-direction', P.stack === 'row' ? 'row' : 'column');
      if (P.wrap !== undefined) add('', 'flex-wrap', P.wrap ? 'wrap' : 'nowrap');
      var J = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', stretch: 'space-between' };
      var A = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', between: 'stretch' };
      var jc = P.stack === 'row' ? P.alignX : P.alignY, ai = P.stack === 'row' ? P.alignY : P.alignX;
      if (jc) add('', 'justify-content', J[jc]);
      if (ai) add('', 'align-items', A[ai]);
    }
    if (P.wMode === 'hug') add('', 'width', 'fit-content');
    else if (P.wMode === 'fill') { add('', 'width', '100%'); add('', 'align-self', 'stretch'); }
    else if (P.wMode === 'fixed' && P.w !== undefined) add('', 'width', P.wUnit === '%' ? pct(P.w) : P.wUnit === 'vw' ? round(P.w, 2) + 'vw' : px(P.w));
    if (P.hMode === 'hug') add('', 'height', 'auto');
    else if (P.hMode === 'fill') add('', 'height', '100%');
    else if (P.hMode === 'fixed' && P.h !== undefined) add('', 'height', P.hUnit === '%' ? pct(P.h) : P.hUnit === 'vh' ? round(P.h, 2) + 'vh' : px(P.h));
    if (P.minW !== undefined) add('', 'min-width', px(P.minW));
    if (P.maxW !== undefined) add('', 'max-width', px(P.maxW));
    if (P.minH !== undefined) add('', 'min-height', px(P.minH));
    if (P.maxH !== undefined) add('', 'max-height', px(P.maxH));
    if (P.contentW !== undefined) add(' .jst-wrap', 'max-width', px(P.contentW));
    [['pt', 'padding-top'], ['pr', 'padding-right'], ['pb', 'padding-bottom'], ['pl', 'padding-left'],
      ['mt', 'margin-top'], ['mr', 'margin-right'], ['mb', 'margin-bottom'], ['ml', 'margin-left']].forEach(function (p) {
      if (P[p[0]] !== undefined) add('', p[1], px(P[p[0]]));
    });
    if (P.gap !== undefined) add('', 'gap', px(P.gap));
    if (P.textAlign) add('', 'text-align', P.textAlign);
    if (P.pos) add('', 'position', P.pos);
    ['top', 'right', 'bottom', 'left'].forEach(function (k) { if (P[k] !== undefined) add('', k, px(P[k])); });
    if (P.z !== undefined) add('', 'z-index', String(P.z));
    if (P.overflow) add('', 'overflow', P.overflow === 'hidden' ? 'hidden' : 'visible');
    // radius
    var R = [P.rTL, P.rTR, P.rBR, P.rBL];
    if (R.every(function (r) { return r !== undefined; }) && R[0] === R[1] && R[1] === R[2] && R[2] === R[3]) add('', 'border-radius', px(R[0]));
    else {
      if (P.rTL !== undefined) add('', 'border-top-left-radius', px(P.rTL));
      if (P.rTR !== undefined) add('', 'border-top-right-radius', px(P.rTR));
      if (P.rBR !== undefined) add('', 'border-bottom-right-radius', px(P.rBR));
      if (P.rBL !== undefined) add('', 'border-bottom-left-radius', px(P.rBL));
    }
    if (P.smooth !== undefined) add('', 'corner-shape', P.smooth > 0 ? 'superellipse(' + round(1 + P.smooth / 100, 2) + ')' : 'round');
    if (kind === 'image' && mediaSub && (R.some(function (r) { return r !== undefined; }))) add(mediaSub, 'border-radius', 'inherit');
    // fill
    var ft = P.fillType;
    if (ft === 'solid' && P.fill) add('', 'background', colorCss(P.fill));
    else if (ft === 'none') add('', 'background', 'none');
    else if ((ft === 'linear' || ft === 'radial') && P.gradStops) {
      var stops = P.gradStops.map(function (s) { return colorCss(s.c) + ' ' + pct(s.p); }).join(', ');
      add('', 'background', ft === 'linear'
        ? 'linear-gradient(' + round(P.gradAngle === undefined ? 180 : P.gradAngle, 1) + 'deg, ' + stops + ')'
        : 'radial-gradient(' + (P.gradShape || 'circle') + ' at ' + pct(P.gradX === undefined ? 50 : P.gradX) + ' ' + pct(P.gradY === undefined ? 50 : P.gradY) + ', ' + stops + ')');
    } else if (ft === 'image' && P.bgImage) {
      var url = imageUrl(P.bgImage);
      if (url) {
        var tint = P.bgTint ? colorCss(P.bgTint) : null;
        add('', 'background-image', (tint ? 'linear-gradient(' + tint + ', ' + tint + '), ' : '') + 'url("' + url + '")');
        var fit = P.bgFit || 'cover';
        var size = fit === 'fill' ? '100% 100%' : fit === 'tile' ? 'auto' : fit;
        add('', 'background-size', tint ? 'auto, ' + size : size);
        add('', 'background-position', pct(P.bgPosX === undefined ? 50 : P.bgPosX) + ' ' + pct(P.bgPosY === undefined ? 50 : P.bgPosY));
        add('', 'background-repeat', fit === 'tile' ? 'repeat' : 'no-repeat');
        if (P.fill) add('', 'background-color', colorCss(P.fill));
      }
    }
    if (P.opacity !== undefined) add('', 'opacity', String(round(P.opacity / 100, 3)));
    if (P.blend) add('', 'mix-blend-mode', P.blend);
    // border (SPEC §3.4: a uniform solid stroke never moves the layout: box-shadow)
    var strokes = [];
    var sides = [P.bWT, P.bWR, P.bWB, P.bWL];
    var perSide = sides.some(function (x) { return x !== undefined; });
    if (P.bW !== undefined || perSide) {
      var bc = colorCss(P.bColor || '#000000') || '#000000';
      var w = P.bW || 0;
      var style = P.bStyle || 'solid';
      if (style === 'solid' && !perSide) {
        add('', 'border', '0 none');
        if (w > 0) {
          var al = P.bAlign || 'inside';
          if (al === 'inside') strokes.push('inset 0 0 0 ' + px(w) + ' ' + bc);
          else if (al === 'outside') strokes.push('0 0 0 ' + px(w) + ' ' + bc);
          else { strokes.push('inset 0 0 0 ' + px(w / 2) + ' ' + bc); strokes.push('0 0 0 ' + px(w / 2) + ' ' + bc); }
        }
      } else {
        add('', 'box-sizing', 'border-box');
        add('', 'border-style', style);
        add('', 'border-color', bc);
        var sw = sides.map(function (x) { return px(x === undefined ? w : x); });
        add('', 'border-width', sw[0] === sw[1] && sw[1] === sw[2] && sw[2] === sw[3] ? sw[0] : sw.join(' '));
      }
    }
    var sh = Array.isArray(P.shadows) ? P.shadows.map(function (s) {
      return (s.inset ? 'inset ' : '') + px(s.x) + ' ' + px(s.y) + ' ' + px(s.blur) + ' ' + px(s.spread) + ' ' + colorCss(s.c);
    }) : null;
    var list = strokes.concat(sh || []);
    if (list.length) add('', 'box-shadow', list.join(', '));
    else if (sh || P.bW !== undefined) add('', 'box-shadow', 'none');
    // effects
    var imgF = [];
    if (P.brightness !== undefined) imgF.push('brightness(' + round(P.brightness / 100, 3) + ')');
    if (P.contrast !== undefined) imgF.push('contrast(' + round(P.contrast / 100, 3) + ')');
    if (P.saturate !== undefined) imgF.push('saturate(' + round(P.saturate / 100, 3) + ')');
    if (P.grayscale !== undefined) imgF.push('grayscale(' + round(P.grayscale / 100, 3) + ')');
    if (P.sepia !== undefined) imgF.push('sepia(' + round(P.sepia / 100, 3) + ')');
    if (P.hue !== undefined) imgF.push('hue-rotate(' + round(P.hue, 1) + 'deg)');
    var elF = [];
    if (P.blur !== undefined) elF.push('blur(' + px(P.blur) + ')');
    if (mediaSub) {
      if (imgF.length) add(mediaSub, 'filter', imgF.join(' '));
      if (elF.length) add('', 'filter', elF.join(' '));
    } else if (imgF.length || elF.length) add('', 'filter', imgF.concat(elF).join(' ') || 'none');
    if (P.bblur !== undefined) { var bb = P.bblur > 0 ? 'blur(' + px(P.bblur) + ')' : 'none'; add('', '-webkit-backdrop-filter', bb); add('', 'backdrop-filter', bb); }
    // image crop (Studio crop mode, simple editor): zoom about the focal point, clipped back to the
    // frame by clip-path, so the layout never moves; ratio = the frame's aspect (1:1, 4:5, 16:9…)
    var zoomEl = null;
    if (P.zoom !== undefined && P.zoom > 100) {
      var z = P.zoom / 100, zk = 1 - 1 / z;
      var fx = P.focusX === undefined ? 50 : P.focusX, fy = P.focusY === undefined ? 50 : P.focusY;
      var zsub = mediaSub || '';
      var rr = [P.rTL, P.rTR, P.rBR, P.rBL].filter(function (r) { return r !== undefined; });
      add(zsub, 'transform-origin', pct(fx) + ' ' + pct(fy));
      add(zsub, 'clip-path', 'inset(' + [fy * zk, (100 - fx) * zk, (100 - fy) * zk, fx * zk].map(function (v) { return pct(round(v, 3)); }).join(' ') +
        (!zsub && rr.length ? ' round ' + px(round(Math.max.apply(null, rr) / z, 2)) : '') + ')');
      if (zsub) add(zsub, 'transform', 'scale(' + round(z, 3) + ')');
      else zoomEl = 'scale(' + round(z, 3) + ')';
      if (!P.fit) add(zsub, 'object-fit', 'cover');
    } else if (P.zoom !== undefined) {
      if (mediaSub) add(mediaSub, 'transform', 'none');
      add(mediaSub || '', 'clip-path', 'none');
    }
    if (P.ratio !== undefined) add('', 'aspect-ratio', round(P.ratio, 4) + ' / 1');
    var tf = [];
    if (P.tx !== undefined || P.ty !== undefined) tf.push('translate(' + px(P.tx || 0) + ', ' + px(P.ty || 0) + ')');
    if (P.rotate !== undefined) tf.push('rotate(' + round(P.rotate, 2) + 'deg)');
    if (P.scale !== undefined) tf.push('scale(' + round(P.scale / 100, 3) + ')');
    if (P.skewX !== undefined || P.skewY !== undefined) tf.push('skew(' + round(P.skewX || 0, 2) + 'deg, ' + round(P.skewY || 0, 2) + 'deg)');
    if (zoomEl) tf.push(zoomEl);
    if (tf.length) {
      var ident = tf.every(function (t) { return /^translate\(0, 0\)$|^rotate\(0deg\)$|^scale\(1\)$|^skew\(0deg, 0deg\)$/.test(t); });
      add('', 'transform', ident ? 'none' : tf.join(' '));
    }
    // icon: another drawing (a mask in the element's colour), its size, its stroke, its container
    if (P.icon) {
      add(' svg', 'display', 'none');
      add('::before', 'content', "''");
      add('::before', 'display', 'block');
      add('::before', 'flex', 'none');
      add('::before', 'width', P.iconSize !== undefined ? px(P.iconSize) : '20px');
      add('::before', 'height', P.iconSize !== undefined ? px(P.iconSize) : '20px');
      add('::before', 'background-color', 'currentColor');
      add('::before', '-webkit-mask', iconMask(P.icon, P.iconStroke) + ' center / contain no-repeat');
      add('::before', 'mask', iconMask(P.icon, P.iconStroke) + ' center / contain no-repeat');
    } else {
      if (P.iconSize !== undefined) { add(' svg', 'width', px(P.iconSize)); add(' svg', 'height', px(P.iconSize)); }
      if (P.iconStroke !== undefined) add(' svg', 'stroke-width', String(round(P.iconStroke, 2)));
    }
    if (P.shape) add('', 'border-radius', P.shape === 'circle' ? '50%' : P.shape === 'rounded' ? '28%' : '0');
    if (P.shape && kind === 'icon') { add('', 'display', 'inline-flex'); add('', 'align-items', 'center'); add('', 'justify-content', 'center'); }
    if (P.btnIcon) {
      add(' .jst-ico', 'display', 'none');
      if (P.btnIcon !== 'none') {
        var bp = P.btnIconPos === 'left' ? '::before' : '::after';
        add(bp, 'content', "''");
        add(bp, 'flex', 'none');
        add(bp, 'width', P.iconSize !== undefined ? px(P.iconSize) : '1.15em');
        add(bp, 'height', P.iconSize !== undefined ? px(P.iconSize) : '1.15em');
        add(bp, 'background-color', 'currentColor');
        add(bp, '-webkit-mask', iconMask(P.btnIcon, P.iconStroke) + ' center / contain no-repeat');
        add(bp, 'mask', iconMask(P.btnIcon, P.iconStroke) + ' center / contain no-repeat');
      }
    }
    // product card fields
    if (P.hidePrice) add(' .jst-card-price', 'display', 'none');
    if (P.hideBadge) add(' .jst-badge', 'display', 'none');
    if (P.hideButton) add(' .jst-card-btn', 'display', 'none');
    if (P.hideCat) add(' .jst-card-cat', 'display', 'none');
    if (P.mediaRatio !== undefined) add(' .jst-card-media', 'aspect-ratio', round(P.mediaRatio, 4) + ' / 1');
    // the page's two fonts
    [['fontDisplay', '--st-font-display'], ['fontText', '--st-font-text']].forEach(function (fp) {
      if (!P[fp[0]]) return;
      var fi = P[fp[0]].charAt(0) === '@' ? null : fontInfo(P[fp[0]]);
      if (fi) add('', fp[1], fi.stack || "'" + fi.family + "', sans-serif");
    });
    // typography
    if (P.font) {
      var stack = P.font === '@display' ? 'var(--st-font-display)' : P.font === '@text' ? 'var(--st-font-text)' : null;
      if (!stack) { var f = fontInfo(P.font); stack = f && f.stack ? f.stack : (f ? "'" + f.family + "', sans-serif" : null); }
      if (stack) add('', 'font-family', stack);
    }
    if (P.fontSize !== undefined) add('', 'font-size', px(P.fontSize));
    if (P.fontWeight !== undefined) add('', 'font-weight', String(P.fontWeight));
    if (P.italic !== undefined) add('', 'font-style', P.italic ? 'italic' : 'normal');
    if (P.lh !== undefined) add('', 'line-height', String(round(P.lh, 3)));
    if (P.ls !== undefined) add('', 'letter-spacing', P.ls === 0 ? '0' : round(P.ls / 100, 4) + 'em');
    if (P.textCase) add('', 'text-transform', P.textCase === 'upper' ? 'uppercase' : P.textCase === 'lower' ? 'lowercase' : P.textCase);
    if (P.deco) add('', 'text-decoration-line', P.deco);
    if (P.color) {
      add('', 'color', colorCss(P.color));
      if (kind === 'text' || kind === 'button' || kind === 'badge') add('', '-webkit-text-fill-color', 'currentColor');
      // a section's texts read the store's text colour (and a coloured section's own ink): both follow
      if (kind === 'section' || kind === 'page') { add('', '--st-text', colorCss(P.color)); add('', '--sc-fg', colorCss(P.color)); add('', '--sc-ink', colorCss(P.color)); }
    }
    // image
    var isub = mediaSub || '';
    if (P.fit) add(isub, 'object-fit', P.fit);
    if (P.focusX !== undefined || P.focusY !== undefined) add(isub, 'object-position', pct(P.focusX === undefined ? 50 : P.focusX) + ' ' + pct(P.focusY === undefined ? 50 : P.focusY));
    return out;
  }

  // A reset for a declaration a narrower layer must take away (rare: a stroke turned dashed…)
  var RESET = { 'box-shadow': 'none', 'border': '0 none', 'border-style': 'none', 'filter': 'none', 'transform': 'none', 'background': 'none',
    'background-image': 'none', 'backdrop-filter': 'none', '-webkit-backdrop-filter': 'none', 'display': 'revert', 'width': 'auto', 'height': 'auto' };

  function flat(d) { var o = {}; Object.keys(d).forEach(function (s) { Object.keys(d[s]).forEach(function (p) { o[s + '\u0001' + p] = d[s][p]; }); }); return o; }
  function diff(child, parent) {
    var c = flat(child), p = flat(parent), out = {};
    Object.keys(c).forEach(function (k) { if (c[k] !== p[k]) out[k] = c[k]; });
    Object.keys(p).forEach(function (k) { if (!hasOwn.call(c, k)) { var prop = k.split('\u0001')[1]; out[k] = hasOwn.call(RESET, prop) ? RESET[prop] : 'unset'; } });
    return out;
  }
  function unflat(f) {
    var o = {};
    Object.keys(f).forEach(function (k) { var a = k.split('\u0001'); (o[a[0]] || (o[a[0]] = {}))[a[1]] = f[k]; });
    return o;
  }

  var BP_ATTR = { desktop: '[data-jst-bp~="desktop"]', tablet: '[data-jst-bp~="tablet"]', phone: '[data-jst-bp~="phone"]' };
  var BP_NOTE = { desktop: 'Ordinateur seulement', tablet: 'Tablette et téléphone', phone: 'Téléphone' };
  var STATE_PSEUDO = { hover: ':hover', pressed: ':active', focus: ':focus-visible' };
  var STATE_NOTE = { hover: 'Survol', pressed: 'Pressé', focus: 'Focus' };

  function ruleText(selector, d, indent, important) {
    var subs = Object.keys(d).filter(function (s) { return Object.keys(d[s]).length; });
    if (!subs.length) return '';
    var imp = important ? ' !important' : '';
    return subs.map(function (s) {
      var body = Object.keys(d[s]).map(function (p) { return indent + '  ' + p.replace('\u0002', '') + ': ' + d[s][p] + imp + ';'; }).join('\n');
      var sels = typeof selector === 'function' ? selector(s) : selector + s;
      return indent + sels + ' {\n' + body + '\n' + indent + '}';
    }).join('\n');
  }

  // CSS of one entry. o: { scope, label, force: state, important, noTransition }
  function entryCss(key, entry, def, o) {
    var pk = parseKey(key);
    if (!pk || !def) return '';
    var S = selectorFor(pk.sid, def, pk.item);
    var scope = o.scope || '.jst';
    var imp = o.important !== false;
    var R = {};
    R.base = merged(entry, 'base');
    R.desktop = merged(entry, 'desktop');
    R.tablet = merged(entry, 'tablet');
    R.phone = merged(entry, 'phone');
    var Dd = {};
    BPS.forEach(function (b) { Dd[b] = decls(R[b], def); });
    var parts = [];
    var head = o.label ? '/* ' + o.label + ' */' : '';
    // transitions: every property a state changes, on the element itself
    var stateRules = {};
    var transProps = {};
    STATES.forEach(function (st) {
      if (!isObj(entry[st])) return;
      stateRules[st] = {};
      BPS.forEach(function (b) {
        var full = flat(decls(merged(entry, b, st), def));
        stateRules[st][b] = full;
        Object.keys(diff(unflat(full), Dd[b])).forEach(function (k) { var a = k.split('\u0001'); if (!a[0]) transProps[a[1]] = 1; });
      });
    });
    var base = { '': {} };
    Object.keys(Dd.base).forEach(function (s) { base[s] = {}; Object.keys(Dd.base[s]).forEach(function (p) { base[s][p] = Dd.base[s][p]; }); });
    var tp = Object.keys(transProps).filter(function (p) { return p.indexOf('-webkit-') !== 0; });
    if (!o.noTransition && (tp.length || R.base.tDur !== undefined)) {
      var dur = R.base.tDur === undefined ? 200 : R.base.tDur;
      var ease = R.base.tEase || 'ease-out';
      base['']['transition-property'] = tp.length ? tp.join(', ') : 'all';
      base['']['transition-duration'] = dur + 'ms';
      base['']['transition-timing-function'] = EASE_CSS[ease] || EASE_CSS['ease-out'];
      if (EASE_SPRING[ease]) base['']['transition-timing-function\u0002'] = springLinear(EASE_SPRING[ease], dur);
    }
    var b0 = ruleText(function (s) { return scope + ' ' + S + s; }, base, '', imp);
    if (b0) parts.push(b0);
    ['desktop', 'tablet', 'phone'].forEach(function (b) {
      var d = unflat(diff(Dd[b], b === 'phone' ? Dd.tablet : Dd.base));
      var t = ruleText(function (s) { return scope + BP_ATTR[b] + ' ' + S + s; }, d, '', imp);
      if (t) parts.push('/* ' + BP_NOTE[b] + ' */\n' + t);
    });
    // visibility per screen: each breakpoint says itself (no cascade, so « hidden on tablet, shown on phone » works)
    var hidden = [];
    [['desktop', '[data-jst-bp="desktop"]', 'Ordinateur'], ['tablet', '[data-jst-bp="tablet"]', 'Tablette'], ['phone', '[data-jst-bp~="phone"]', 'Téléphone']].forEach(function (h) {
      var L = entry[h[0]];
      var v = L && Object.prototype.hasOwnProperty.call(L, 'hide') ? L.hide : (entry.base && entry.base.hide);
      if (v === true) hidden.push(scope + h[1] + ' ' + S);
    });
    if (hidden.length) parts.push('/* Masqué sur cet écran */\n' + hidden.join(',\n') + ' {\n  display: none' + (imp ? ' !important' : '') + ';\n}');
    STATES.forEach(function (st) {
      if (!stateRules[st]) return;
      var baseRule = diff(unflat(stateRules[st].base), Dd.base);
      var blocks = [];
      var t0 = ruleText(function (s) { return scope + ' ' + S + STATE_PSEUDO[st] + s; }, unflat(baseRule), '', imp);
      if (t0) blocks.push(t0);
      ['desktop', 'tablet', 'phone'].forEach(function (b) {
        var full = stateRules[st][b];
        var cand = diff(unflat(full), Dd[b]);
        var outB = {};
        Object.keys(cand).concat(Object.keys(baseRule)).forEach(function (k) {
          var v = hasOwn.call(cand, k) ? cand[k] : full[k];
          if (v === undefined) return;
          if (baseRule[k] !== v) outB[k] = v;
        });
        var tb = ruleText(function (s) { return scope + BP_ATTR[b] + ' ' + S + STATE_PSEUDO[st] + s; }, unflat(outB), '', imp);
        if (tb) blocks.push(tb);
      });
      if (!blocks.length) return;
      var txt = '/* ' + STATE_NOTE[st] + ' */\n' + blocks.join('\n');
      if (st === 'hover') txt = '/* ' + STATE_NOTE[st] + ' */\n@media (hover: hover) {\n' + blocks.map(function (b) { return b.replace(/^/gm, '  '); }).join('\n') + '\n}';
      parts.push(txt);
      // the Studio shows a state while it is being edited: the same rules, without the pseudo-class
      if (o.force === st) {
        var forced = [];
        var f0 = ruleText(function (s) { return scope + scope + ' ' + S + s; }, unflat(baseRule), '', imp);
        if (f0) forced.push(f0);
        ['desktop', 'tablet', 'phone'].forEach(function (b) {
          var cand = diff(unflat(stateRules[st][b]), Dd[b]);
          var tb = ruleText(function (s) { return scope + scope + BP_ATTR[b] + ' ' + S + s; }, unflat(cand), '', imp);
          if (tb) forced.push(tb);
        });
        if (forced.length) parts.push('/* aperçu de l’état (Studio) */\n' + forced.join('\n'));
      }
    });
    if (!parts.length) return '';
    return (head ? head + '\n' : '') + parts.join('\n');
  }

  function typesOf(config) {
    var t = { '@header': '@header', '@footer': '@footer', '@page': '@page' };
    if (isObj(config) && Array.isArray(config.sections)) config.sections.forEach(function (s) { if (isObj(s) && typeof s.id === 'string') t[s.id] = s.type; });
    return t;
  }
  function labelOf(pk, type, def, config) {
    var sec = CHROME[pk.sid] ? CHROME[pk.sid].label : null;
    if (!sec) {
      var d = DATA();
      var st = d && d.sectionTypes && d.sectionTypes[type];
      sec = (st && st.name) || type;
    }
    return sec + ' › ' + (def ? def.label : pk.el) + (pk.item ? ' (' + pk.item + ')' : '');
  }

  // The CSS of a whole fiche (or of one key). o: { scope: '.jst', only: key, force: { key, state }, important, noTransition }
  function css(config, o) {
    o = o || {};
    var es = isObj(config) ? config.elementStyles : null;
    if (!isObj(es)) return '';
    var types = typesOf(config);
    var clean = o.trusted ? es : sanitize(es, { sections: (config.sections || []) });
    if (!clean) return '';
    var keys = Object.keys(clean);
    // generic rules first, one product card after (more specific, wins)
    keys.sort(function (a, b) { return (a.indexOf('~') !== -1) - (b.indexOf('~') !== -1); });
    var out = [];
    keys.forEach(function (k) {
      if (o.only && k !== o.only) return;
      var pk = parseKey(k);
      if (!pk) return;
      var type = CHROME[pk.sid] ? pk.sid : types[pk.sid];
      var def = elementDef(type, pk.el);
      var t = entryCss(k, clean[k], def, {
        scope: o.scope, label: o.labels === false ? '' : labelOf(pk, type, def, config), important: o.important,
        noTransition: o.noTransition, force: o.force && o.force.key === k ? o.force.state : null
      });
      if (t) out.push(t);
    });
    return out.join('\n\n');
  }

  /* ================================================================== apply (the store root) */

  var seq = 0;
  var observer = null;
  var watched = typeof WeakSet === 'function' ? new WeakSet() : null;
  function bpOf(rootEl) {
    var dev = rootEl && rootEl.getAttribute ? rootEl.getAttribute('data-device') : null;
    if (dev === 'phone') return 'tablet phone';
    var w = rootEl ? (rootEl.clientWidth || 0) : 0;
    return w && w < 1024 ? 'tablet' : 'desktop';
  }
  function setBp(rootEl) {
    var bp = bpOf(rootEl);
    if (rootEl.getAttribute('data-jst-bp') !== bp) rootEl.setAttribute('data-jst-bp', bp);
  }
  function watch(rootEl) {
    if (typeof ResizeObserver !== 'function') return;
    if (!observer) observer = new ResizeObserver(function (list) {
      list.forEach(function (en) { var el = en.target; if (el.hasAttribute('data-jst-es')) setBp(el); });
    });
    if (watched && watched.has(rootEl)) return;
    try { observer.observe(rootEl); if (watched) watched.add(rootEl); } catch (e) { /* old engine */ }
  }
  var fontLoaded = {};
  function loadFonts(styles) {
    if (typeof document === 'undefined' || !document.head) return;
    var want = {};
    Object.keys(styles).forEach(function (k) {
      LAYERS.forEach(function (L) {
        var p = styles[k][L];
        if (!p) return;
        ['font', 'fontDisplay', 'fontText'].forEach(function (f) { if (p[f] && p[f].charAt(0) !== '@') want[p[f]] = 1; });
      });
    });
    Object.keys(want).forEach(function (id) {
      if (fontLoaded[id]) return;
      var f = fontInfo(id);
      if (!f) return;
      fontLoaded[id] = 1;
      var lid = 'jst-font-es-' + id;
      if (document.getElementById(lid)) return;
      var ws = (f.weights || [400]).slice().sort(function (a, b) { return a - b; });
      var fam = String(f.family).replace(/ /g, '+');
      var spec = f.italic ? 'ital,wght@' + ws.map(function (w) { return '0,' + w; }).concat(ws.map(function (w) { return '1,' + w; })).join(';') : 'wght@' + ws.join(';');
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = lid;
      link.href = 'https://fonts.googleapis.com/css2?family=' + fam + ':' + spec + '&display=swap';
      document.head.appendChild(link);
    });
  }

  // o: { force: { key, state }, noTransition }. Returns the CSS applied ('' when none).
  function apply(config, rootEl, o) {
    try {
      if (!rootEl || !rootEl.setAttribute || typeof document === 'undefined') return '';
      o = o || {};
      var styleEl = null;
      for (var c = rootEl.lastElementChild; c; c = c.previousElementSibling) { if (c.tagName === 'STYLE' && c.hasAttribute('data-jst-es')) { styleEl = c; break; } }
      var es = isObj(config) ? config.elementStyles : null;
      var clean = isObj(es) ? sanitize(es, { sections: config.sections || [] }) : null;
      if (!clean) {
        if (styleEl) styleEl.remove();
        if (rootEl.hasAttribute('data-jst-es')) { rootEl.removeAttribute('data-jst-es'); rootEl.removeAttribute('data-jst-bp'); }
        return '';
      }
      if (!rootEl.__jstEsId) rootEl.__jstEsId = ++seq;
      var id = String(rootEl.__jstEsId);
      if (rootEl.getAttribute('data-jst-es') !== id) rootEl.setAttribute('data-jst-es', id);
      setBp(rootEl);
      watch(rootEl);
      var text = css({ elementStyles: clean, sections: config.sections }, {
        scope: '[data-jst-es="' + id + '"]', trusted: true, labels: false, force: o.force, noTransition: o.noTransition
      });
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.setAttribute('data-jst-es', '');
        rootEl.appendChild(styleEl);
      } else if (styleEl !== rootEl.lastElementChild) rootEl.appendChild(styleEl);
      if (styleEl.textContent !== text) styleEl.textContent = text;
      loadFonts(clean);
      return text;
    } catch (e) { return ''; }
  }

  /* ================================================================== presets (for the inspector) */

  var SHADOW_PRESETS = [
    { id: 'none', label: 'Aucune', shadows: [] },
    { id: 'soft', label: 'Douce', shadows: [{ x: 0, y: 1, blur: 2, spread: 0, c: '#0000000F', inset: false }, { x: 0, y: 6, blur: 16, spread: -4, c: '#0000001F', inset: false }] },
    { id: 'medium', label: 'Moyenne', shadows: [{ x: 0, y: 2, blur: 4, spread: 0, c: '#00000012', inset: false }, { x: 0, y: 12, blur: 28, spread: -6, c: '#0000002E', inset: false }] },
    { id: 'drop', label: 'Portée', shadows: [{ x: 0, y: 4, blur: 8, spread: -2, c: '#0000001A', inset: false }, { x: 0, y: 28, blur: 56, spread: -12, c: '#00000047', inset: false }] },
    { id: 'glow', label: 'Lueur', shadows: [{ x: 0, y: 0, blur: 0, spread: 1, c: '@accent/35', inset: false }, { x: 0, y: 8, blur: 32, spread: 0, c: '@accent/45', inset: false }] }
  ];
  var EASE_LABELS = { 'ease': 'Standard', 'ease-out': 'Douce', 'ease-in-out': 'Symétrique', 'expo': 'Rapide (expo)', 'linear': 'Linéaire', 'spring': 'Ressort', 'bounce': 'Rebond' };

  root.JeereElStyles = {
    version: 1,
    REGISTRY: REGISTRY, KINDS: KINDS, CHROME: CHROME, PROPS: PROPS, LAYERS: LAYERS, BPS: BPS, STATES: STATES,
    TOKENS: TOKENS, EASES: EASES, EASE_LABELS: EASE_LABELS, EASE_CSS: EASE_CSS, BLEND: BLEND, SHADOW_PRESETS: SHADOW_PRESETS,
    elementsFor: elementsFor, elementDef: elementDef, parseKey: parseKey, keyOf: keyOf, selectorFor: selectorFor,
    sanitize: sanitize, sanitizeProps: sanitizeProps, normProp: normProp,
    resolve: resolve, merged: merged, chain: chain,
    css: css, decls: decls, apply: apply, bpOf: bpOf, springLinear: springLinear,
    color: { parse: parseColor, norm: normColor, css: colorCss, hex: formatHex, hslToRgb: hslToRgb },
    imageUrl: imageUrl, fontInfo: fontInfo, ICONS: ICONS, ICON_IDS: ICON_IDS, ICON_LABELS: ICON_LABELS, iconSvg: iconSvg
  };
})();
