/*
 * Jeere Studio — editor.js
 * The start screen and the store editor. Exposes one global: window.JeereBuilder
 *   openEditor(config, opts)  normalises the fiche boutique and shows the editor; opts (optional):
 *                             { page, pageId, productId } the page to open the preview on
 *   getConfig()               deep copy of the fiche being edited (null before the editor opens)
 *   showStart()               back to the start screen « Créez votre boutique »
 *   showPage(page, id)        shows one page of the store in the preview (see JEERE_DATA.PAGES): id is the
 *                             productId of 'product', the pageId of 'page' (the seller's own pages, config.pages)
 *   getPage()                 { page, productId, pageId } shown in the preview
 *   startTour()               replays the guided tour (tour.js, window.JeereTour), as « ? Aide » does; it also
 *                             starts by itself once per browser ('jeere-tour') when the editor first opens
 *                             from the start screen
 *
 * The seller side (round 3): the start screen header reads 'jeere-account' (« Bonjour Awa » and
 * « Tableau de bord », or « Se connecter » and « Créer un compte »); the top bar links to the
 * dashboard (../admin/); the page selector lists the seller's own pages (« Vos pages ») with
 * « Gérer les pages » (../admin/#pages). On load, a one-shot 'jeere-studio-open' { page, pageId?,
 * productId?, view? } left by the dashboard opens the editor straight on that page (on a phone, on
 * the preview unless the page is home or view is 'edit'), then is deleted. A change made to the
 * fiche by the dashboard in another tab (or before a Back) is taken in; a fiche deleted there is not
 * written back. A template chosen by a signed-in seller carries her store name and WhatsApp number.
 *
 * The editor edits one "fiche boutique" (store config v1, see data.js). Every change re-renders the
 * live preview with JeereRender, goes into an undo history and is autosaved in localStorage.
 * Section forms are generated from JEERE_DATA.sectionTypes[type].fields (FieldDefs): nothing is
 * written per section here, so a new section type in data.js gets its form for free.
 *
 * Demo photos (JEERE_DATA.DEMO_PHOTOS, products[].photo, settings.photo of hero and about): while the
 * seller has no image of her own, the image fields and the thumbnails show the demo photo, with
 * « Photo d’exemple · photographer / Unsplash » under it. Her upload replaces it (photo set to
 * null); « Retirer la photo » clears it, so the illustration shows. A demo photo whose file does
 * not load gives way to the illustration too.
 *
 * The preview shows one of the store's 5 pages (Accueil, Fiche produit, Panier, Paiement,
 * Confirmation), chosen with « Page : … ▾ ». The customer journey works inside it: render.js
 * handles the store's own buttons and tells us with the 'jst:navigate' event, so the selector
 * follows. Clicking anywhere else in a section or a product opens it in the panel.
 */
(() => {
  'use strict';

  const D = window.JEERE_DATA;
  const STORE_KEY = 'jeere-studio-config';
  const ACCOUNT_KEY = 'jeere-account'; // { version, firstName, phone, storeName, createdAt, plan, loggedIn } (compte/)
  const OPEN_KEY = 'jeere-studio-open'; // one-shot { page, pageId?, productId? } left by the dashboard
  const ADMIN_KEY = 'jeere-admin'; // the dashboard's data: read only here, for the address the seller chose
  const ADMIN_URL = '../admin/';
  const PAGES_URL = '../admin/#pages';
  const HISTORY_MAX = 60;
  const PREVIEW_DELAY = 80;
  const COMMIT_DELAY = 400;
  const SAVE_DELAY = 450;
  const NB = ' ';
  const SVGNS = 'http://www.w3.org/2000/svg';

  const media = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const mqMobile = media('(max-width: 899.98px)');
  const mqReduced = media('(prefers-reduced-motion: reduce)');
  const mqHover = media('(hover: hover) and (pointer: fine)');
  const isMobile = () => mqMobile.matches;
  const scrollBehavior = () => (mqReduced.matches ? 'auto' : 'smooth');

  const guil = (t) => `«${NB}${t}${NB}»`;
  const inColl = (coll, id) => typeof id === 'string' && !!coll && Object.prototype.propertyIsEnumerable.call(coll, id);

  const TABS = ['sections', 'produits', 'theme', 'boutique', 'qualite'];
  // JEERE_DATA.PAGES and INTENSITY_OPTIONS are the contract; these are their fallbacks (older data.js)
  const PAGES_FALLBACK = [
    { id: 'home', label: 'Accueil' }, { id: 'product', label: 'Fiche produit' }, { id: 'cart', label: 'Panier' },
    { id: 'checkout', label: 'Paiement' }, { id: 'confirmation', label: 'Confirmation' }
  ];
  const INTENSITY_FALLBACK = [
    { value: 'vivid', label: 'Vives', hint: 'Votre couleur habille toute la boutique.' },
    { value: 'soft', label: 'Douces', hint: 'Des fonds clairs, la couleur en touches.' }
  ];
  // What the preview hint says on each page (desktop, then phones and tablets)
  const PAGE_HINTS = {
    home: ['Aperçu en direct. Cliquez sur une section pour la modifier, sur un produit pour ouvrir sa fiche.', 'Touchez une section pour la modifier.'],
    product: [`La fiche produit. Cliquez sur la photo pour modifier le produit, sur ${guil('Ajouter au panier')} pour continuer.`, 'Touchez la photo pour modifier le produit.'],
    cart: [`Le panier, avec un produit d’exemple. Changez les quantités, puis ${guil('Passer au paiement')}.`, 'Un panier d’exemple, comme le verront vos clients.'],
    checkout: [`La page de paiement. Remplissez-la comme un client${NB}: rien n’est envoyé, personne n’est débité.`, `Remplissez-la comme un client${NB}: rien n’est envoyé.`],
    confirmation: ['La confirmation de commande, telle que vos clients la verront.', 'Ce que voit le client après sa commande.'],
    page: [`Une de vos pages, telle que vos clients la verront. Son texte se modifie dans le tableau de bord${NB}:`, 'Son texte se modifie dans le tableau de bord.']
  };
  // Sections whose settings also show on other pages (the delivery zones feed the checkout's communes)
  const SECTION_PAGES = { delivery: ['product', 'checkout', 'confirmation'] };
  const SECTION_ICONS = {
    announcement: 'i-megaphone', hero: 'i-image', categories: 'i-grid', products: 'i-bag',
    about: 'i-info', reviews: 'i-star', delivery: 'i-truck', whatsapp: 'i-chat'
  };
  const COLOR_NAMES = {
    '#E9D8BD': 'Sable', '#F2D59B': 'Miel', '#E7C7A2': 'Abricot', '#D9A88C': 'Terre cuite', '#E3A6B4': 'Rose',
    '#C7B8E0': 'Lavande', '#A9C1D9': 'Bleu ciel', '#BFD7D6': 'Eau', '#BFD3A0': 'Vert tendre', '#E8E6DF': 'Gris clair'
  };
  const PAY_NOTES = {
    wave: 'Mobile money', orange: 'Mobile money', mtn: 'Mobile money', moov: 'Mobile money',
    cod: 'Le client paie le livreur, en espèces', card: 'Paiement par carte, en ligne'
  };
  const ISSUE_GROUPS = [
    { level: 'error', title: 'À corriger', icon: 'i-alert' },
    { level: 'warning', title: 'À améliorer', icon: 'i-warn' },
    { level: 'tip', title: 'Conseils', icon: 'i-bulb' }
  ];
  // To fix = red (problem), to improve = orange (attention), tips = blue (help)
  const ISSUE_TONE = { error: 'err', warning: 'warn', tip: 'info' };
  // Schematic thumbnails of the three templates (builder chrome: black and white only)
  const SCHEMATICS = {
    plateau: '<svg viewBox="0 0 120 80" aria-hidden="true" focusable="false"><rect width="120" height="80" fill="#F5F5F3"/><rect x="8" y="7" width="104" height="38" fill="#DCDCD8"/><rect x="15" y="24" width="52" height="6" fill="#111"/><rect x="15" y="34" width="32" height="3" fill="#5E5E5E"/><path d="M8 51.5h104" stroke="#111" stroke-width=".7"/><rect x="8" y="56" width="22" height="18" fill="#E3E3DF"/><rect x="35" y="56" width="22" height="18" fill="#E3E3DF"/><rect x="62" y="56" width="22" height="18" fill="#E3E3DF"/><rect x="89" y="56" width="23" height="18" fill="#E3E3DF"/></svg>',
    cocody: '<svg viewBox="0 0 120 80" aria-hidden="true" focusable="false"><rect width="120" height="80" fill="#F5F5F3"/><rect x="8" y="7" width="104" height="32" rx="10" fill="#E3E3DF"/><circle cx="96" cy="20" r="13" fill="#fff"/><circle cx="81" cy="32" r="6" fill="#fff"/><rect x="16" y="15" width="44" height="6" rx="3" fill="#111"/><rect x="16" y="26" width="24" height="7" rx="3.5" fill="#111"/><rect x="8" y="44" width="24" height="7" rx="3.5" fill="#fff" stroke="#CFCFCB" stroke-width=".7"/><rect x="35" y="44" width="24" height="7" rx="3.5" fill="#fff" stroke="#CFCFCB" stroke-width=".7"/><rect x="62" y="44" width="24" height="7" rx="3.5" fill="#fff" stroke="#CFCFCB" stroke-width=".7"/><rect x="8" y="55" width="32" height="20" rx="6" fill="#fff"/><rect x="44" y="55" width="32" height="20" rx="6" fill="#fff"/><rect x="80" y="55" width="32" height="20" rx="6" fill="#fff"/></svg>',
    treichville: '<svg viewBox="0 0 120 80" aria-hidden="true" focusable="false"><rect width="120" height="80" fill="#111"/><rect x="8" y="8" width="88" height="11" fill="#fff"/><rect x="8" y="22" width="64" height="11" fill="#fff"/><rect x="8" y="38" width="30" height="9" fill="#EBEBE8"/><rect y="53" width="120" height="27" fill="#EBEBE8"/><rect x="8" y="57" width="20" height="20" fill="#fff"/><rect x="31" y="57" width="20" height="20" fill="#fff"/><rect x="54" y="57" width="20" height="20" fill="#fff"/><rect x="77" y="57" width="20" height="20" fill="#fff"/><rect x="100" y="57" width="20" height="20" fill="#fff"/></svg>'
  };

  /* ------------------------------------------------------------------ state */

  const S = {
    inited: false,
    config: null,
    history: [], index: 0, pending: false,
    open: false,
    tab: 'sections', device: 'phone', view: 'edit', page: 'home', productId: null, pageId: null, pagesSig: null,
    lastSaved: null, // the exact JSON last read from or written to localStorage: anything else there was written elsewhere
    site: null, // the address chosen in the dashboard ('jeere-admin'), or null: derived from the store's name
    openSection: null, openProduct: null, openItem: {}, reorder: { sections: false, produits: false },
    openColor: null, // the colour row whose picker is open ('theme:text', 'section:s2:bg')
    // « Mes polices »: a font read but not added yet, a family being renamed, the Google Fonts search, the last error
    fontPending: null, fontRename: null, fontSearch: { text: '', busy: false, error: '', info: '' }, fontError: '',
    scale: 1, previewDirty: true, pendingReveal: null, hoverNode: null, pick: null,
    scrollY: { edit: 0, preview: 0 },
    saveState: 'ok', warned: {},
    timers: {},
    modals: [],
    startBuilt: false
  };
  const els = {};

  /* ------------------------------------------------------------------ small helpers */

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'value') n.value = v;
        else if (k === 'style') n.style.cssText = v;
        else if (k === 'on') { for (const ev of Object.keys(v)) n.addEventListener(ev, v[ev]); }
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(n, kids);
    return n;
  }
  function append(n, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(n, k);
      else n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }
  function icon(name, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'b-ico' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + name);
    s.appendChild(u);
    return s;
  }
  function iconBtn(name, label, onClick, opts = {}) {
    return el('button', {
      type: 'button', class: 'b-ibtn' + (opts.cls ? ' ' + opts.cls : ''), 'aria-label': label, title: opts.title || label,
      disabled: !!opts.disabled, 'data-fk': opts.fk || null, 'aria-pressed': opts.pressed === undefined ? null : String(!!opts.pressed),
      on: { click: onClick }
    }, icon(name));
  }
  // Deep copy that keeps sharing the (immutable) strings: the undo history holds up to 60 states,
  // and photos are long data URLs, so they must not be duplicated in memory.
  function copy(v) {
    if (Array.isArray(v)) return v.map(copy);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = copy(v[k]);
      return o;
    }
    return v;
  }
  function shorten(text, n) { const s = String(text == null ? '' : text).trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function plural(word, n) { return n > 1 && !/[sxz]$/i.test(word) ? word + 's' : word; }
  function count(n, word) { return n + ' ' + plural(word, n); }
  function withArticle(label) {
    const w = String(label || 'élément').toLowerCase();
    const feminine = /^(zone|question|photo|image|étape|catégorie|adresse|commune|ligne)$/.test(w) || (/e$/.test(w) && !/(é|ée|age|isme|ème|ste)$/.test(w));
    return (feminine ? 'une ' : 'un ') + w;
  }
  // The store's address part: the shared rule (data.js slugify, also ɛ ɔ ŋ œ), 40 characters, no trailing hyphen
  function slug(s) {
    let out = '';
    try { out = typeof D.slugify === 'function' ? D.slugify(s) : ''; } catch (e) { out = ''; }
    if (!out) out = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out.slice(0, 40).replace(/-+$/g, '') || 'ma-boutique';
  }
  function prettyPhone(w) {
    const m = /^\+225(\d{10})$/.exec(w || '');
    return m ? '+225 ' + m[1].replace(/(\d{2})(?=\d)/g, '$1 ') : (w || '');
  }
  function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? String(c).toUpperCase() : '#E9D8BD'; }
  function safeArt(a) { return D.ART_KINDS.indexOf(a) !== -1 ? a : 'box'; }
  function famName(stack) { return String(stack || '').split(',')[0].replace(/['"]/g, '').trim(); }
  function isTextField(n) {
    if (!n || !n.tagName) return false;
    if (n.isContentEditable || n.tagName === 'TEXTAREA') return true;
    return n.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|color|range|image)$/i.test(n.type || 'text');
  }
  function focusEl(n) { if (n && typeof n.focus === 'function') { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } } }
  function pulse(n) {
    if (!n) return;
    n.classList.remove('is-pulse');
    void n.offsetWidth;
    n.classList.add('is-pulse');
    setTimeout(() => n.classList.remove('is-pulse'), 1700);
  }
  function later(name, fn, ms) { clearTimeout(S.timers[name]); S.timers[name] = setTimeout(fn, ms); }

  const findSection = (id) => (S.config && S.config.sections.find((s) => s.id === id)) || null;
  const findProduct = (id) => (S.config && S.config.products.find((p) => p.id === id)) || null;
  const typeDef = (type) => (inColl(D.sectionTypes, type) ? D.sectionTypes[type] : null);
  const templateOf = (id) => (inColl(D.templates, id) ? D.templates[id] : D.templates.plateau);
  const storeName = () => (S.config && String(S.config.store.name || '').trim()) || 'Ma boutique';
  function pagesList() {
    const list = D && Array.isArray(D.PAGES) && D.PAGES.length ? D.PAGES : PAGES_FALLBACK;
    const out = list.filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, label: String(p.label || p.id) }));
    return out.length ? out : PAGES_FALLBACK;
  }
  const isPage = (id) => pagesList().some((p) => p.id === id);
  // The seller's own pages (config.pages: À propos, Livraison et retours, Contact…), drawn by render.js as page 'page'
  function customPages() {
    const list = S.config && Array.isArray(S.config.pages) ? S.config.pages : [];
    return list.filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.id);
  }
  const findCustomPage = (id) => (typeof id === 'string' && customPages().find((p) => p.id === id)) || null;
  const pageTitle = (p) => String((p && p.title) || '').trim() || 'Page sans titre';
  const isView = (id) => id === 'page' || isPage(id);
  // The value of the page selector: 'home'…'confirmation', or 'page:pg2' for one of the seller's pages
  const pickValue = () => (S.page === 'page' && S.pageId ? 'page:' + S.pageId : S.page);
  function parsePick(v) {
    const m = /^page:(.+)$/.exec(String(v || ''));
    return m ? { page: 'page', id: m[1] } : { page: String(v || 'home'), id: null };
  }
  function pagesSig() { return customPages().map((p) => p.id + '\u0001' + pageTitle(p)).join('\u0002'); }
  function intensityOptions() {
    const list = D && Array.isArray(D.INTENSITY_OPTIONS) && D.INTENSITY_OPTIONS.length ? D.INTENSITY_OPTIONS : INTENSITY_FALLBACK;
    return list.filter((o) => o && typeof o.value === 'string').map((o) => {
      const fb = INTENSITY_FALLBACK.find((f) => f.value === o.value);
      return { value: o.value, label: String(o.label || (fb && fb.label) || o.value), hint: String(o.hint || (fb && fb.hint) || '') };
    });
  }
  // Pages need a renderer that knows them (render.js round 2): with an older one the selector is hidden
  function rendererHasPages() {
    const R = window.JeereRender;
    return !!(R && (Array.isArray(R.PAGES) || typeof R.pages === 'function'));
  }

  function artMarkup(kind, color) {
    const R = window.JeereRender;
    if (!R || typeof R.artSVG !== 'function') return '';
    try { return String(R.artSVG(safeArt(kind), safeColor(color)) || ''); } catch (e) { return ''; }
  }
  // A demo photo of JEERE_DATA.DEMO_PHOTOS ({ src, alt, focus, credit }), or null (unknown id, older renderer)
  function demoPhoto(id) {
    const R = window.JeereRender;
    if (!id || !R || typeof R.photoInfo !== 'function') return null;
    try { return R.photoInfo(id) || null; } catch (e) { return null; }
  }
  // The picture of a product: the seller's photo, else its demo photo, else its illustration
  // (also when the demo photo's file does not load)
  function thumb(p, cls) {
    const t = el('span', { class: 'b-thumb' + (cls ? ' ' + cls : ''), 'data-thumb': p.id, style: `background:${safeColor(p.color)}` });
    const ph = p.image ? null : demoPhoto(p.photo);
    if (p.image) t.append(el('img', { src: p.image, alt: '', loading: 'lazy', decoding: 'async' }));
    else if (ph) t.append(el('img', { src: ph.src, alt: '', loading: 'lazy', decoding: 'async', style: ph.focus ? `object-position:${ph.focus}` : null, on: { error: () => { t.innerHTML = artMarkup(p.art, p.color); } } }));
    else t.innerHTML = artMarkup(p.art, p.color); // renderer markup, built from a fixed art kind and a hex colour
    return t;
  }
  // « Photo d’exemple · Prénom Nom / Unsplash »: the photographer links to their profile
  function photoCredit(ph) {
    const c = ph.credit || {};
    const link = (url, text) => (url ? el('a', { href: url, target: '_blank', rel: 'noopener', text }) : text);
    return el('p', { class: 'b-img__credit' }, 'Photo d’exemple · ',
      c.name ? [link(c.profileUrl, c.name), ' / '] : null, link(c.photoUrl, 'Unsplash'));
  }

  /* ------------------------------------------------------------------ storage */

  function readRaw(key) {
    try { const v = window.localStorage.getItem(key); return typeof v === 'string' ? v : null; } catch (e) { return null; }
  }
  function parseConfig(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      return D.normalizeConfig(obj);
    } catch (e) { return null; }
  }
  function readSaved() {
    const raw = readRaw(STORE_KEY);
    const cfg = parseConfig(raw);
    if (cfg && !S.open) S.lastSaved = raw;
    return cfg;
  }

  /* ---------- the seller's account and the dashboard's one-shot instruction ---------- */

  function clip(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  // 'jeere-account' as { firstName, phone, storeName, loggedIn }, or null (none, unreadable, blocked storage)
  function readAccount() {
    const raw = readRaw(ACCOUNT_KEY);
    if (!raw) return null;
    let obj = null;
    try { obj = typeof D.normalizeAccount === 'function' ? D.normalizeAccount(raw) : JSON.parse(raw); } catch (e) { obj = null; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    let phone = '';
    try { phone = typeof obj.phone === 'string' ? D.normalizeWhatsapp(obj.phone) : ''; } catch (e) { phone = ''; }
    return { firstName: clip(obj.firstName, 40), phone, storeName: clip(obj.storeName, 40), loggedIn: obj.loggedIn === true };
  }
  // Read and delete 'jeere-studio-open': { page, pageId?, productId? } or null
  function takeOpen() {
    const raw = readRaw(OPEN_KEY);
    if (raw === null) return null;
    try { window.localStorage.removeItem(OPEN_KEY); } catch (e) { /* blocked storage: nothing to delete */ }
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const id = (v) => (typeof v === 'string' && v.length < 64 ? v : null);
    // view (optional, not in the contract): 'preview' or 'edit', what a phone shows first
    const view = o.view === 'preview' || o.view === 'edit' ? o.view : null;
    // focus (optional): 'logo' opens Boutique › « Logo et icône » (the dashboard's « Ajoutez votre logo »)
    const focus = o.focus === 'logo' ? 'logo' : null;
    return { page: typeof o.page === 'string' ? o.page : 'home', pageId: id(o.pageId), productId: id(o.productId), view, focus };
  }
  // A template chosen by a signed-in seller carries her store name and WhatsApp number from sign-up
  function personalize(cfg) {
    const acc = readAccount();
    if (!cfg || !cfg.store || !acc || !acc.loggedIn) return cfg;
    const name = acc.storeName;
    const old = String(cfg.store.name || '');
    if (name && name !== old) {
      const hero = D.sectionTypes && D.sectionTypes.hero;
      const tf = hero && Array.isArray(hero.fields) ? hero.fields.find((f) => f.key === 'title') : null;
      const max = tf && typeof tf.max === 'number' ? tf.max : 70;
      (cfg.sections || []).forEach((s) => {
        if (s.type !== 'hero' || !s.settings || typeof s.settings.title !== 'string' || !old || s.settings.title.indexOf(old) === -1) return;
        const t = s.settings.title.split(old).join(name);
        s.settings.title = t.length <= max ? t : name;
      });
      cfg.store.name = name;
    }
    if (!cfg.store.whatsapp && acc.phone) cfg.store.whatsapp = acc.phone;
    return cfg;
  }
  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  }
  function stripImages(cfg) {
    const c = copy(cfg);
    c.sections.forEach((s) => { if (s.settings && Object.prototype.hasOwnProperty.call(s.settings, 'image')) s.settings.image = null; });
    c.products.forEach((p) => { p.image = null; });
    return c;
  }
  function scheduleSave() { later('save', saveNow, SAVE_DELAY); }
  function saveNow() {
    clearTimeout(S.timers.save);
    if (!S.config) return;
    let json;
    try { json = JSON.stringify(S.config); } catch (e) { return; }
    try {
      window.localStorage.setItem(STORE_KEY, json);
      S.lastSaved = json;
      setSaved('ok');
      return;
    } catch (e) {
      if (isQuota(e)) {
        // Her imported fonts are the heaviest thing a fiche holds: when one makes the memory overflow, the newest
        // goes (with a toast), so the store itself is always saved, and what she sees is what is saved
        if (S.saveState !== 'partial' && saveWithoutFonts(false)) return;
        try {
          const lite = JSON.stringify(stripImages(S.config));
          window.localStorage.setItem(STORE_KEY, lite);
          S.lastSaved = lite;
          if (S.saveState !== 'partial') toast(`La mémoire du navigateur est pleine à cause des photos. Le reste est enregistré${NB}: téléchargez la fiche boutique pour garder aussi les photos.`, 6000, 'warn');
          setSaved('partial');
          return;
        } catch (e2) { /* still full */ }
        if (saveWithoutFonts(true)) return;
        if (S.saveState !== 'fail') toast(`La mémoire du navigateur est pleine${NB}: vos changements ne sont plus enregistrés. Téléchargez la fiche boutique pour les garder.`, 6000);
        setSaved('fail');
      } else {
        if (S.saveState !== 'blocked') toast(`Votre navigateur bloque l’enregistrement. Téléchargez la fiche boutique pour la garder.`, 6000);
        setSaved('blocked');
      }
    }
  }
  // Saves without her newest imported font files, one more at a time (lite: without the photos too). On success
  // the fonts are taken out of the fiche she edits as well (and of the current undo step), with a toast.
  function saveWithoutFonts(lite) {
    const files = (S.config.theme && Array.isArray(S.config.theme.customFonts) ? S.config.theme.customFonts : []).filter((e) => e && e.source !== 'google');
    for (let k = 1; k <= files.length; k++) {
      const gone = files.slice(files.length - k);
      const cfg = withoutFonts(copy(S.config), gone.map((e) => e.id));
      let json;
      try { json = JSON.stringify(lite ? stripImages(cfg) : cfg); window.localStorage.setItem(STORE_KEY, json); } catch (e) { if (isQuota(e)) continue; return false; }
      S.config = cfg;
      if (S.history[S.index]) S.history[S.index] = copy(cfg);
      S.lastSaved = json;
      setSaved(lite ? 'partial' : 'ok');
      const names = gone.map((e) => `«${NB}${e.name}${NB}»`).filter((n, i, a) => a.indexOf(n) === i);
      toast(`La mémoire du navigateur est pleine${NB}: ${names.length > 1 ? 'les polices ' + names.join(' et ') + ' n’ont' : 'la police ' + names[0] + ' n’a'} pas pu être gardée${names.length > 1 ? 's' : ''}. ` +
        `Votre boutique est bien enregistrée${lite ? ', sans les photos' : ''}. Téléchargez la fiche boutique pour tout garder, ou retirez des photos.`, 9000, 'warn');
      renderPreviewNow();
      renderTab();
      refreshMeta();
      return true;
    }
    return false;
  }
  // The fiche without these imported fonts: her font choices that named them go back to the suggestion's
  function withoutFonts(cfg, ids) {
    const th = cfg.theme;
    if (!th || !Array.isArray(th.customFonts)) return cfg;
    const before = D.fontOf ? { display: D.fontOf(cfg, th.typography && th.typography.display), text: D.fontOf(cfg, th.typography && th.typography.text) } : {};
    th.customFonts = th.customFonts.filter((e) => ids.indexOf(e && e.id) === -1);
    const t = th.typography;
    if (t && typeof t === 'object') {
      ['display', 'text'].forEach((k) => {
        if (typeof t[k] !== 'string' || !/^custom:/.test(t[k]) || (D.fontOf && D.fontOf(cfg, t[k]))) return;
        // another file of the same family is still there (the Bold went, the Regular stays): it takes over
        const rest = before[k] && before[k].ids ? before[k].ids.filter((id) => ids.indexOf(id) === -1) : [];
        if (rest.length) t[k] = 'custom:' + rest[0];
        else { delete t[k]; if (k === 'display') delete t.weight; }
      });
      if (!t.display && !t.text && t.weight === undefined) delete t.pair;
      if (!Object.keys(t).length) delete th.typography;
    }
    if (!th.customFonts.length) delete th.customFonts;
    return cfg;
  }
  function setSaved(state) {
    S.saveState = state;
    if (!els.saved) return;
    els.saved.textContent = {
      ok: 'Enregistré dans ce navigateur',
      partial: 'Enregistré, sans les photos',
      fail: 'Non enregistré',
      blocked: 'Non enregistré'
    }[state] || '';
    // Colour codes (README « Couleurs d’état »): green dot saved, orange partly saved, red not saved
    els.saved.classList.toggle('is-ok', state === 'ok');
    els.saved.classList.toggle('is-warn', state === 'partial');
    els.saved.classList.toggle('is-err', state === 'fail' || state === 'blocked');
  }

  /* ------------------------------------------------------------------ history (undo / redo) */

  function resetHistory() {
    clearTimeout(S.timers.commit);
    S.history = [copy(S.config)];
    S.index = 0;
    S.pending = false;
    updateUndo();
  }
  function commit() {
    clearTimeout(S.timers.commit);
    if (!S.pending || !S.config) return;
    S.pending = false;
    // A change that ends where it started (retyped the same text, toggled twice) is not an undo step
    try { if (JSON.stringify(S.config) === JSON.stringify(S.history[S.index])) { updateUndo(); return; } } catch (e) { /* keep the step */ }
    S.history.length = S.index + 1;
    S.history.push(copy(S.config));
    if (S.history.length > HISTORY_MAX) S.history.shift();
    S.index = S.history.length - 1;
    updateUndo();
  }
  function canUndo() { return S.pending || S.index > 0; }
  function canRedo() { return !S.pending && S.index < S.history.length - 1; }
  function undo() {
    if (!S.open) return;
    commit();
    if (S.index <= 0) return;
    S.index--;
    restore('Modification annulée');
  }
  function redo() {
    if (!S.open) return;
    commit();
    if (S.index >= S.history.length - 1) return;
    S.index++;
    restore('Modification rétablie');
  }
  function restore(msg) {
    S.config = copy(S.history[S.index]);
    if (S.openSection && !findSection(S.openSection)) S.openSection = null;
    if (S.openProduct && !findProduct(S.openProduct)) S.openProduct = null;
    renderPreviewNow();
    renderTab();
    refreshMeta();
    scheduleSave();
    updateUndo();
    if (msg) toast(msg, 1600);
  }
  function updateUndo() {
    if (!els.undo) return;
    els.undo.disabled = !canUndo();
    els.redo.disabled = !canRedo();
  }

  // Every edit goes through here. opts.now: a discrete action (toggle, move, add…), committed at once.
  function change(opts = {}) {
    if (!S.config) return;
    S.pending = true;
    if (opts.now) {
      commit();
      renderPreviewNow();
    } else {
      later('commit', commit, COMMIT_DELAY);
      schedulePreview();
    }
    scheduleSave();
    refreshMeta();
    updateUndo();
  }

  /* ------------------------------------------------------------------ preview */

  function previewVisible() { return !isMobile() || S.view === 'preview'; }
  function schedulePreview() {
    S.previewDirty = true;
    if (!previewVisible()) return;
    later('preview', renderPreviewNow, PREVIEW_DELAY);
  }
  function renderPreviewNow() {
    clearTimeout(S.timers.preview);
    S.timers.preview = 0;
    if (!S.config || !els.store) return;
    if (!previewVisible()) { S.previewDirty = true; return; }
    S.previewDirty = false;
    if (S.page === 'product' && !findProduct(S.productId)) S.productId = S.config.products[0] ? S.config.products[0].id : null;
    // The page shown was deleted (undo, import, the dashboard): the first of the seller's pages, else home
    if (S.page === 'page' && !findCustomPage(S.pageId)) {
      const first = customPages()[0];
      if (first) S.pageId = first.id; else { S.page = 'home'; S.pageId = null; }
    }
    renderStoreInto(els.store, S.config, S.device, els.screen, S.page, S.productId, S.pageId);
    readView();
    hideHover();
    fit();
    // The page was rebuilt: move a running outline onto the new element, or drop it
    if (S.flash && els.hlFlash.classList.contains('is-on')) {
      const node = findPreviewNode(S.flash);
      if (node) placeHl(els.hlFlash, node, labelFor(S.flash)); else els.hlFlash.classList.remove('is-on');
    }
  }
  function renderStoreInto(root, config, device, screen, page, productId, pageId) {
    const R = window.JeereRender;
    let ok = false;
    if (R && typeof R.render === 'function') {
      const p = page || 'home';
      try { R.render(config, root, { device, page: p, productId: productId || null, pageId: p === 'page' ? (pageId || null) : null }); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) {
      root.className = 'b-noprev';
      root.textContent = R ? 'L’aperçu n’a pas pu s’afficher.' : 'L’aperçu n’est pas encore disponible.';
    }
    tameStore(root, screen);
  }
  // The preview is a picture of the store: keep its links and buttons out of the keyboard order (the page
  // selector reaches every page), and paint the frame in the store's background colour
  function tameStore(root, screen) {
    root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]').forEach((n) => { if (n.getAttribute('tabindex') !== '-1') n.setAttribute('tabindex', '-1'); });
    if (screen) {
      let bg = '';
      try { bg = root.style.getPropertyValue('--st-bg').trim(); } catch (e) { bg = ''; }
      screen.style.background = bg || '#FFFFFF';
    }
  }

  /* ---------- pages of the preview ---------- */

  // The renderer may resolve the page (unknown product, older renderer): follow what it drew
  function readView() {
    const v = els.store && els.store.__jstView;
    if (!rendererHasPages() || !v || typeof v !== 'object') { S.page = 'home'; syncPagePicks(); return; }
    S.page = isView(v.page) ? v.page : 'home';
    if (S.page === 'product' && typeof v.productId === 'string' && findProduct(v.productId)) S.productId = v.productId;
    if (S.page === 'page') {
      if (typeof v.pageId === 'string' && findCustomPage(v.pageId)) S.pageId = v.pageId;
      else if (!findCustomPage(S.pageId)) { S.page = 'home'; S.pageId = null; }
    }
    syncPagePicks();
  }
  function syncPagePicks() {
    const on = rendererHasPages();
    if (S.config && S.pagesSig !== pagesSig()) buildPagePicks();
    const val = pickValue();
    (els.pageSels || []).forEach((wrap) => { wrap.hidden = !on; wrap.classList.toggle('is-other', S.page !== 'home'); });
    (els.pagePicks || []).forEach((sel) => { if (sel.value !== val) sel.value = val; });
    updatePageRows();
    updateUrl();
    updateHint();
  }
  // The 5 pages of the buying journey, then the seller's own pages (« Vos pages »)
  function buildPagePicks() {
    const list = pagesList();
    const own = customPages();
    S.pagesSig = pagesSig();
    els.pagePicks.forEach((sel) => {
      sel.textContent = '';
      const sys = list.map((p) => el('option', { value: p.id, text: p.label }));
      if (own.length) {
        sel.append(el('optgroup', { label: 'Parcours d’achat' }, sys));
        sel.append(el('optgroup', { label: 'Vos pages' }, own.map((p) => el('option', { value: 'page:' + p.id, text: shorten(pageTitle(p), 26) }))));
      } else append(sel, sys);
      sel.value = pickValue();
    });
  }
  // The address chosen in the dashboard (Paramètres › Domaine): her own domain, or the free address she
  // confirmed. null until then: the address follows the store's name, as in the dashboard.
  function readSite() {
    let a = null;
    try { a = JSON.parse(readRaw(ADMIN_KEY) || 'null'); } catch (e) { a = null; }
    const st = a && typeof a === 'object' && a.settings && typeof a.settings === 'object' ? a.settings : null;
    const host = (v) => (typeof v === 'string' && /^[a-z0-9.-]{3,120}(\/[a-z0-9/-]{1,60})?$/i.test(v.trim()) ? v.trim().toLowerCase() : '');
    S.site = st ? (host(st.customDomain) || (a.subdomainChosen === true ? host(st.subdomain) : '')) || null : null;
  }
  // The store's address in the desktop frame, with the path of the seller's page shown
  function updateUrl() {
    if (!els.url || !S.config) return;
    let path = '';
    if (S.page === 'page') {
      const pg = findCustomPage(S.pageId);
      if (pg && typeof pg.slug === 'string' && pg.slug) path = '/pages/' + pg.slug;
    }
    els.url.textContent = (S.site || (typeof D.subdomainFor === 'function' ? D.subdomainFor(storeName()) : 'jeere.kreeative.xyz/b/' + slug(storeName()))) + path;
    updateFav();
  }
  // The tab icon in the address bar: the seller's icon, else her logo, else her initial on her colour
  function updateFav() {
    const n = els.fav;
    const R = window.JeereRender;
    if (!n || !R || typeof R.brand !== 'function') return;
    const b = R.brand(S.config);
    const key = [b.icon ? b.icon.length + b.icon.slice(-24) : '', b.initial, b.accent, b.onAccent].join('|');
    if (n.__key === key) return;
    n.__key = key;
    n.hidden = false;
    n.style.cssText = b.icon ? '' : `--fa:${b.accent};--fo:${b.onAccent}`;
    n.replaceChildren(b.icon ? el('img', { src: b.icon, alt: '' }) : document.createTextNode(b.initial));
  }
  // « Vos pages » in the Boutique tab: mark the page shown in the preview
  function updatePageRows() {
    if (!els.tp || !els.tp.boutique || S.tab !== 'boutique') return;
    els.tp.boutique.querySelectorAll('[data-pgid]').forEach((b) => {
      const on = S.page === 'page' && b.getAttribute('data-pgid') === S.pageId;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  function scrollPreviewTop() {
    if (isMobile()) { if (S.view === 'preview' && window.scrollY > 0) window.scrollTo(0, 0); }
    else if (els.stage) els.stage.scrollTop = 0;
  }
  // Show a page of the store (from the selector, the Produits tab, the Qualité tab…). id: the product of
  // 'product', the seller's page of 'page'
  function showPage(page, id, opts = {}) {
    if (!S.config) return;
    if (page === 'page') {
      const pg = findCustomPage(id) || findCustomPage(S.pageId) || customPages()[0] || null;
      if (pg && rendererHasPages()) S.pageId = pg.id; else page = 'home';
    } else if (!isPage(page) || !rendererHasPages()) page = 'home';
    S.page = page;
    if (page === 'product') {
      const want = [id, S.openProduct, S.productId].find((x) => typeof x === 'string' && findProduct(x));
      S.productId = want || (S.config.products[0] ? S.config.products[0].id : null);
    }
    hidePick();
    dropFlash();
    syncPagePicks();
    S.previewDirty = true;
    if (!previewVisible()) return;
    renderPreviewNow();
    if (opts.scroll !== false) scrollPreviewTop();
  }
  function dropFlash() {
    S.flash = null;
    clearTimeout(S.timers.flash);
    if (els.hlFlash) els.hlFlash.classList.remove('is-on');
  }
  // render.js moved inside the preview (product card, « Ajouter au panier », « Payer »…)
  function onStoreNavigate(e) {
    const d = (e && e.detail) || {};
    if (e && typeof e.preventDefault === 'function') e.preventDefault(); // we scroll our own stage
    S.page = isView(d.page) ? d.page : 'home';
    if (S.page === 'page') {
      const v = els.store && els.store.__jstView;
      const want = [d.pageId, v && v.pageId].find((x) => typeof x === 'string' && findCustomPage(x));
      if (want) S.pageId = want; else if (!findCustomPage(S.pageId)) { S.page = 'home'; S.pageId = null; }
    }
    if (S.page === 'product' && typeof d.productId === 'string' && findProduct(d.productId)) {
      S.productId = d.productId;
      // Keep the Produits tab on the product being looked at, if a product is open there
      if (!isMobile() && S.tab === 'produits' && S.openProduct && S.openProduct !== d.productId) {
        S.openProduct = d.productId;
        renderTab();
        scrollRowIntoView(`[data-pid="${CSS.escape(d.productId)}"]`);
      }
    }
    hideHover();
    hidePick();
    dropFlash();
    syncPagePicks();
    tameStore(els.store, els.screen);
    scrollPreviewTop();
    fit();
  }
  // Which page shows a section or a product, when the current one does not
  function pageFor(t) {
    if (!rendererHasPages() || S.page === 'home') return null;
    if (t.kind === 'product') {
      const v = els.store && els.store.__jstView;
      const shown = v && v.page === 'product' && !S.previewDirty ? v.productId : S.productId;
      return S.page === 'product' && shown === t.id ? null : { page: 'product', productId: t.id };
    }
    const sec = findSection(t.id);
    if (sec && (SECTION_PAGES[sec.type] || []).indexOf(S.page) !== -1) return null;
    if (!S.previewDirty && findPreviewNode(t)) return null; // drawn here too (the announcement bar)
    return { page: 'home' };
  }
  function fit() {
    if (!els.device || !previewVisible() || els.ed.hidden) return;
    const inner = els.stageInner;
    const cs = getComputedStyle(inner);
    const avail = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const W = els.device.offsetWidth;
    const H = els.device.offsetHeight;
    if (!W || avail <= 0) return;
    const s = Math.min(1, Math.max(0.12, avail / W));
    S.scale = s;
    els.device.style.transform = s === 1 ? '' : `scale(${s})`;
    els.device.style.setProperty('--inv', String(1 / s));
    els.dwrap.style.width = Math.floor(W * s) + 'px';
    els.dwrap.style.height = Math.ceil(H * s) + 'px';
  }
  function setDevice(d) {
    if (d !== 'phone' && d !== 'desktop') return;
    S.device = d;
    document.querySelectorAll('[data-device-toggle] [data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === d)));
    els.device.className = 'b-device b-device--' + d;
    renderPreviewNow();
    if (!isMobile()) els.stage.scrollTop = 0;
  }

  function findPreviewNode(t) {
    if (!t || !els.store) return null;
    if (t.kind === 'brand') return els.store.querySelector('.jst-header');
    if (t.kind === 'product') {
      return els.store.querySelector(`[data-product-id="${CSS.escape(t.id)}"]`);
    }
    return els.store.querySelector(`[data-section-id="${CSS.escape(t.id)}"]`);
  }
  function labelFor(t) {
    if (!t) return '';
    if (t.kind === 'brand') return 'En-tête · Logo';
    if (t.kind === 'product') { const p = findProduct(t.id); return 'Produit · ' + shorten(p ? p.name : '', 30); }
    const s = findSection(t.id);
    const def = s && typeDef(s.type);
    return def ? def.name : 'Section';
  }
  // The logo (or the name) in the header of the home page: a click there edits it
  function logoOnHome(n) {
    return !!n && !!els.store && els.store.contains(n) && S.page === 'home' && !!n.closest('.jst-header a.jst-logo');
  }
  // A button, link or field of the store itself (render.js handles it): not a click to edit
  function storeControl(n) {
    if (!n || !els.store || !els.store.contains(n)) return false;
    return !!n.closest('[data-jst-action], input, select, textarea, label, option');
  }
  function targetOf(node) {
    if (!node) return null;
    if (node.classList && node.classList.contains('jst-header')) return { kind: 'brand' };
    if (node.hasAttribute('data-product-id')) return { kind: 'product', id: node.getAttribute('data-product-id') };
    return { kind: 'section', id: node.getAttribute('data-section-id') };
  }
  function placeHl(hl, node, label) {
    const sr = els.screen.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const s = S.scale || 1;
    hl.style.top = (r.top - sr.top) / s + 'px';
    hl.style.left = (r.left - sr.left) / s + 'px';
    hl.style.width = r.width / s + 'px';
    hl.style.height = r.height / s + 'px';
    hl.querySelector('.b-hl__tag').textContent = label;
    hl.classList.toggle('is-inside', r.top - sr.top < 24 * s);
  }
  function hideHover() { S.hoverNode = null; if (els.hlHover) els.hlHover.classList.remove('is-on'); }
  function flashNode(node, label) {
    if (!node) return;
    S.flash = targetOf(node);
    const hl = els.hlFlash;
    placeHl(hl, node, label);
    hl.classList.remove('is-on');
    void hl.offsetWidth;
    hl.classList.add('is-on');
    later('flash', () => hl.classList.remove('is-on'), 1700);
  }
  function scrollPreviewTo(node) {
    const r = node.getBoundingClientRect();
    if (isMobile()) {
      const off = els.top.offsetHeight + els.stageBar.offsetHeight + 12;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - off), behavior: scrollBehavior() });
    } else {
      const sr = els.stage.getBoundingClientRect();
      els.stage.scrollTo({ top: Math.max(0, els.stage.scrollTop + r.top - sr.top - 24), behavior: scrollBehavior() });
    }
  }
  // Scroll the preview to a section or product and outline it briefly
  function revealInPreview(t, opts = {}) {
    if (!t || !(t.kind === 'product' ? findProduct(t.id) : findSection(t.id))) return;
    const move = pageFor(t);
    if (t.kind === 'product') S.productId = t.id;
    if (move) {
      S.page = move.page;
      if (move.productId) S.productId = move.productId;
      dropFlash();
      syncPagePicks();
      S.previewDirty = true;
    }
    if (!previewVisible()) { S.pendingReveal = t; return; }
    if (S.previewDirty) renderPreviewNow();
    let node = findPreviewNode(t);
    if (!node && t.kind === 'product') {
      // A product beyond the section's limit is not drawn: show the products section instead
      const sec = S.config.sections.find((s) => s.type === 'products' && s.enabled);
      node = sec ? findPreviewNode({ kind: 'section', id: sec.id }) : null;
    }
    if (!node) return;
    if (opts.scroll !== false) scrollPreviewTo(node);
    flashNode(node, labelFor(t));
  }

  /* ------------------------------------------------------------------ panel */

  function getPanelScroll() { return isMobile() ? window.scrollY : els.panelScroll.scrollTop; }
  function setPanelScroll(y) { if (isMobile()) window.scrollTo(0, y); else els.panelScroll.scrollTop = y; }

  // « Voir la boutique » on a computer: the storefront alone (no panel, no click-to-edit), with « Modifier
  // la boutique » to bring the panel back. A phone already shows the preview alone (setView).
  function setStoreView(on) {
    const v = !!on && !isMobile();
    if (!!S.storeView === v) return;
    S.storeView = v;
    if (els.ed) els.ed.classList.toggle('is-store', v);
    if (els.storeEdit) els.storeEdit.hidden = !v;
    hideHover();
    updateHint();
    requestAnimationFrame(fit);
  }
  function setTab(tab, opts = {}) {
    if (S.storeView) setStoreView(false);
    if (TABS.indexOf(tab) === -1) tab = 'sections';
    const changed = tab !== S.tab;
    S.tab = tab;
    els.tabBtns.forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    TABS.forEach((t) => { els.tp[t].hidden = t !== tab; });
    renderTab({ top: changed || opts.top, focus: opts.focus });
  }

  // Rebuild the active tab, keeping its scroll position and the focused control (data-fk)
  function renderTab(opts = {}) {
    if (!S.config) return;
    const tp = els.tp[S.tab];
    const y = getPanelScroll();
    const active = document.activeElement;
    let fk = opts.focus || (active && tp.contains(active) ? active.getAttribute('data-fk') : null);
    let sel = null;
    if (!opts.focus && fk && isTextField(active)) { try { sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; } }
    tp.textContent = '';
    RENDER[S.tab](tp);
    watchLogoTone();
    if (opts.top) {
      if (isMobile()) { if (window.scrollY > 0) window.scrollTo(0, 0); } else els.panelScroll.scrollTop = 0;
    } else setPanelScroll(y);
    if (fk) {
      let n = tp.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (n && n.disabled) n = null;
      if (n) {
        focusEl(n);
        if (opts.reveal) n.scrollIntoView({ block: 'nearest' });
        if (sel && typeof n.setSelectionRange === 'function') { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } }
      }
    }
  }

  function tabHead(title, text, action) {
    return el('div', { class: 'b-tp__head' },
      el('div', { class: 'b-tp__headrow' }, el('h2', { class: 'b-tp__title', text: title }), action || null),
      text ? el('p', { class: 'b-tp__text', text }) : null);
  }
  // « Réorganiser »: rows show up/down arrows instead of opening their settings
  function reorderToggle(tab, count) {
    const on = !!S.reorder[tab];
    if (count < 2 && !on) return null;
    return el('button', {
      type: 'button', class: 'b-btn b-btn--sm ' + (on ? 'b-btn--primary' : 'b-btn--ghost'), 'aria-pressed': String(on), 'data-fk': 'reorder-' + tab,
      on: {
        click: () => {
          S.reorder[tab] = !on;
          if (!on) { if (tab === 'sections') S.openSection = null; else S.openProduct = null; }
          renderTab({ focus: 'reorder-' + tab });
        }
      }
    }, icon(on ? 'i-check' : 'i-sort'), on ? 'Terminé' : 'Réorganiser');
  }
  function moveBtns(i, n, labelUp, labelDown, onMove, fkUp, fkDown, withText) {
    const mk = (ic, txt, label, dir, disabled, fk) => withText
      ? el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'aria-label': label, disabled, 'data-fk': fk, on: { click: () => onMove(dir) } }, icon(ic), txt)
      : iconBtn(ic, label, () => onMove(dir), { disabled, fk, title: txt });
    return [
      mk('i-up', 'Monter', labelUp, -1, i === 0, fkUp),
      mk('i-down', 'Descendre', labelDown, 1, i === n - 1, fkDown)
    ];
  }
  function group(id, title, hint, ...content) {
    return el('section', { class: 'b-group', id, 'aria-labelledby': id + '-t', tabindex: '-1' },
      el('h3', { class: 'b-group__title', id: id + '-t', text: title }),
      hint ? el('p', { class: 'b-group__hint', text: hint }) : null,
      content);
  }
  function scrollRowIntoView(sel) {
    const n = els.tp[S.tab].querySelector(sel);
    if (n) n.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }

  /* ---------- generated fields (FieldDefs) ---------- */

  function buildField(f, acc, id, opts) {
    switch (f.type) {
      case 'text':
      case 'textarea': return textField(f, acc, id, opts);
      case 'number': return numberField(f, acc, id, opts);
      case 'select': return selectField(f, acc, id, opts);
      case 'image': return imageField(f, acc, id, opts);
      case 'items': return itemsField(f, acc, id, opts);
      case 'photo': return null; // the demo photo has no field of its own: the image field shows it
      default: return null;
    }
  }

  function textField(f, acc, id, opts = {}) {
    const multi = f.type === 'textarea';
    const v = acc.get();
    const hintId = opts.hint ? id + '-h' : null;
    const maxId = f.max ? id + '-max' : null;
    const input = el(multi ? 'textarea' : 'input', {
      class: 'b-input' + (multi ? ' b-input--area' : ''), id, type: multi ? null : (opts.inputType || 'text'),
      rows: multi ? 3 : null, maxlength: f.max || null, placeholder: f.placeholder || null, autocomplete: opts.autocomplete || 'off',
      inputmode: opts.inputmode || null, list: opts.list || null, 'data-fk': id,
      'aria-describedby': [hintId, maxId].filter(Boolean).join(' ') || null
    });
    input.value = v === null || v === undefined ? '' : String(v);
    const counter = f.max ? el('span', { class: 'b-count', 'aria-hidden': 'true' }) : null;
    const update = () => {
      if (!counter) return;
      const n = input.value.length;
      counter.textContent = `${n}/${f.max}`;
      counter.classList.toggle('is-near', n >= Math.floor(f.max * 0.9));
      counter.classList.toggle('is-over', n > f.max);
    };
    update();
    input.addEventListener('input', () => {
      acc.set(input.value);
      update();
      if (opts.onInput) opts.onInput(input);
    });
    if (opts.onChange) input.addEventListener('change', () => opts.onChange(input));
    return el('div', { class: 'b-field' },
      el('div', { class: 'b-label-row' }, el('label', { class: 'b-label', for: id, text: f.label }), counter),
      input,
      opts.hint ? el('p', { class: 'b-hint', id: hintId, text: opts.hint }) : null,
      maxId ? el('span', { class: 'b-sr', id: maxId, text: `${f.max} caractères au maximum.` }) : null,
      opts.extra || null);
  }

  function numberField(f, acc, id, opts = {}) {
    const min = typeof f.min === 'number' ? f.min : 0;
    const max = typeof f.max === 'number' ? f.max : 100000000;
    const stepper = typeof f.min === 'number' && typeof f.max === 'number' && f.max - f.min <= 50;
    const clamp = (n) => Math.min(max, Math.max(min, n));
    const cur = acc.get();
    // an amount in the store's currency: cents allowed in dollars and euros (« 24,99 »)
    const money = !!(f.money || opts.money);
    const cents = money && !!(D.currencyInfo && D.currencyInfo().decimals);
    const show = (n) => (cents ? String(n).replace('.', ',') : String(n));
    const input = el('input', {
      class: 'b-input b-input--num', id, type: 'text', inputmode: cents ? 'decimal' : 'numeric', pattern: cents ? null : '[0-9]*', autocomplete: 'off',
      placeholder: cents && f.placeholder ? (f.key === 'price' ? '24,99' : '5') : (f.placeholder || null), 'data-fk': id, value: typeof cur === 'number' ? show(cur) : '',
      'aria-describedby': id + '-h'
    });
    const fmt = opts.format ? el('p', { class: 'b-hint', 'aria-live': 'off' }) : null;
    const showFmt = () => { if (fmt) { const v = acc.get(); fmt.textContent = typeof v === 'number' ? opts.format(v) : ''; } };
    showFmt();
    const parse = () => {
      if (money && D.toMoney) { const m = D.toMoney(input.value); return m === null || m < 0 ? null : m; }
      const d = input.value.replace(/\D/g, ''); return d ? parseInt(d, 10) : null;
    };
    input.addEventListener('input', () => {
      const n = parse();
      if (n === null) return;
      acc.set(Math.min(max, Math.max(stepper ? min : 0, n)));
      showFmt();
    });
    input.addEventListener('change', () => {
      let n = parse();
      if (n === null) n = typeof acc.get() === 'number' ? acc.get() : min;
      n = clamp(n);
      input.value = show(n);
      acc.set(n);
      showFmt();
    });
    if (opts.selectOnFocus) input.addEventListener('focus', () => input.select());
    let control = input;
    if (stepper) {
      const step = (d) => {
        const base = parse();
        const n = clamp((base === null ? min : base) + d);
        input.value = String(n);
        acc.set(n, { now: true });
        showFmt();
      };
      control = el('div', { class: 'b-stepper' },
        iconBtn('i-minus', 'Moins', () => step(-1), { cls: 'b-stepper__btn b-stepper__btn--minus', fk: id + '-minus' }),
        input,
        iconBtn('i-plus', 'Plus', () => step(1), { cls: 'b-stepper__btn', fk: id + '-plus' }));
    }
    return el('div', { class: 'b-field' },
      el('div', { class: 'b-label-row' }, el('label', { class: 'b-label', for: id, text: f.label })),
      control,
      fmt,
      el('span', { class: 'b-sr', id: id + '-h', text: `Un nombre entier, de ${D.formatNumber(min)} à ${D.formatNumber(max)}.` }));
  }

  function selectField(f, acc, id) {
    const sel = el('select', { class: 'b-input b-select', id, 'data-fk': id });
    (f.options || []).forEach((o) => sel.append(el('option', { value: String(o.value), text: o.label })));
    const v = acc.get();
    sel.value = v === null || v === undefined ? '' : String(v);
    sel.addEventListener('change', () => {
      const o = (f.options || []).find((x) => String(x.value) === sel.value);
      acc.set(o ? o.value : sel.value, { now: true });
    });
    return el('div', { class: 'b-field' },
      el('div', { class: 'b-label-row' }, el('label', { class: 'b-label', for: id, text: f.label })),
      el('div', { class: 'b-select-wrap' }, sel, icon('i-down', 'b-select-chev')));
  }

  // opts.photo: accessor of the demo photo id (products[].photo, settings.photo), shown with its credit
  // while the seller has no image of her own. Her upload replaces it (photo cleared). « Retirer » on
  // her image brings the demo photo back if the fiche still has one; « Retirer la photo » on the demo
  // photo clears it, so the illustration shows. Each is one undo step.
  function imageField(f, acc, id, opts = {}) {
    const v = acc.get();
    const ph = !v && opts.photo ? demoPhoto(opts.photo.get()) : null;
    const pic = el('div', { class: 'b-img__pic' + (v || ph ? '' : ' is-empty') });
    const credit = ph ? photoCredit(ph) : null;
    // A demo photo whose file does not load: the empty frame, without its credit
    const lost = () => { pic.classList.add('is-empty'); pic.replaceChildren(icon('i-image')); if (credit) credit.remove(); };
    if (v) pic.append(el('img', { src: v, alt: opts.alt || 'Image choisie' }));
    else if (ph) pic.append(el('img', { src: ph.src, alt: ph.alt || 'Photo d’exemple', style: ph.focus ? `object-position:${ph.focus}` : null, on: { error: lost } }));
    else pic.append(icon('i-image'));
    const idle = v ? (opts.replaceLabel || 'Changer l’image') : (ph ? (opts.ownLabel || 'Mettre mon image') : (opts.addLabel || 'Ajouter une image'));
    const file = el('input', { class: 'b-sr', type: 'file', accept: 'image/*', id, 'data-fk': id });
    const pickLabel = el('span', { text: idle });
    const pickBtn = el('label', { class: 'b-btn b-btn--ghost b-btn--sm b-filebtn' }, icon('i-upload'), pickLabel, file);
    // The demo photo goes in the same undo step: pending first, committed with the image
    const dropPhoto = () => { if (opts.photo && opts.photo.get()) opts.photo.set(null); };
    file.addEventListener('change', () => {
      const fl = file.files && file.files[0];
      if (!fl) return;
      pickBtn.classList.add('is-busy');
      pickLabel.textContent = 'Préparation…';
      readImage(fl).then((url) => {
        dropPhoto();
        acc.set(url, { now: true });
        renderTab({ focus: id });
        toast(opts.addedMsg || 'Image ajoutée');
      }).catch(() => {
        pickBtn.classList.remove('is-busy');
        pickLabel.textContent = idle;
        toast('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.');
      }).then(() => { file.value = ''; });
    });
    const remove = v || ph ? el('button', {
      type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': id + '-rm',
      // her image only (a demo photo still set shows again), else the demo photo
      on: { click: () => { if (!v) dropPhoto(); acc.set(null, { now: true }); renderTab({ focus: id }); toast(opts.removedMsg || 'Image retirée'); } }
    }, icon('i-trash'), ph ? 'Retirer la photo' : 'Retirer') : null;
    return el('div', { class: 'b-field', role: 'group', 'aria-labelledby': id + '-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: id + '-l', text: f.label })),
      el('div', { class: 'b-img' }, pic, el('div', { class: 'b-img__actions' }, pickBtn, remove)),
      credit,
      el('p', { class: 'b-hint', text: opts.hint || 'Sans image, le modèle compose un visuel avec vos produits et vos couleurs.' }));
  }

  function itemSummary(f, item) {
    const parts = [];
    (f.itemFields || []).forEach((sf) => {
      const v = item ? item[sf.key] : undefined;
      if (sf.type === 'text') { if (String(v || '').trim()) parts.push(shorten(v, 34)); }
      else if (sf.type === 'number') { if (typeof v === 'number') parts.push(sf.money || /fcfa/i.test(sf.label) ? D.formatPrice(v) : D.formatNumber(v)); }
      else if (sf.type === 'select') {
        const o = (sf.options || []).find((x) => String(x.value) === String(v));
        if (o) parts.push(o.label);
      }
    });
    return parts.join(' · ') || 'À compléter';
  }

  function itemsField(f, acc, id) {
    const list = Array.isArray(acc.get()) ? acc.get() : [];
    const max = typeof f.maxItems === 'number' ? f.maxItems : 50;
    const itemLabel = f.itemLabel || 'Élément';
    const ol = el('ol', { class: 'b-subs' });
    list.forEach((item, i) => {
      const open = S.openItem[id] === i;
      const bodyId = `${id}-b${i}`;
      const sum = el('span', { class: 'b-sub__sum', text: itemSummary(f, item) });
      const name = `${itemLabel} ${i + 1}`;
      const main = el('button', {
        type: 'button', class: 'b-sub__main', 'aria-expanded': String(open), 'aria-controls': open ? bodyId : null, 'data-fk': `${id}-m${i}`,
        on: { click: () => { S.openItem[id] = open ? null : i; renderTab({ focus: `${id}-m${i}` }); } }
      }, el('span', { class: 'b-sub__n', text: name }), sum, icon('i-down', 'b-chev'));
      const row = el('div', { class: 'b-sub__row' }, main,
        iconBtn('i-trash', `Supprimer${NB}: ${name}`, () => removeItem(acc, id, i, name), { fk: `${id}-x${i}` }));
      const li = el('li', { class: 'b-sub' + (open ? ' is-open' : '') }, row);
      if (open) {
        const body = el('div', { class: 'b-sub__body', id: bodyId });
        (f.itemFields || []).forEach((sf) => {
          body.append(buildField(sf, subAcc(acc, i, sf.key, () => { sum.textContent = itemSummary(f, (acc.get() || [])[i]); }), `${id}-${i}-${sf.key}`));
        });
        if (list.length > 1) {
          body.append(el('div', { class: 'b-sub__foot' }, moveBtns(i, list.length, `Monter${NB}: ${name}`, `Descendre${NB}: ${name}`,
            (d) => moveItem(acc, id, i, d), `${id}-u${i}`, `${id}-d${i}`, true)));
        }
        li.append(body);
      }
      ol.append(li);
    });
    const full = list.length >= max;
    return el('div', { class: 'b-field b-items', role: 'group', 'aria-labelledby': id + '-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: id + '-l', text: f.label }), el('span', { class: 'b-count', text: `${list.length}/${max}` })),
      list.length ? ol : el('p', { class: 'b-empty', text: `Aucun élément pour l’instant.` }),
      el('button', {
        type: 'button', class: 'b-btn b-btn--ghost b-btn--sm b-items__add', disabled: full, 'data-fk': `${id}-add`,
        on: { click: () => addItem(f, acc, id) }
      }, icon('i-plus'), full ? `${max} au maximum` : `Ajouter ${withArticle(itemLabel)}`));
  }
  function subAcc(acc, i, key, after) {
    return {
      get: () => { const a = acc.get(); return a && a[i] ? a[i][key] : undefined; },
      set: (v, o) => {
        const a = acc.get();
        if (!a || !a[i]) return;
        a[i][key] = v;
        acc.touch(o);
        if (after) after();
      }
    };
  }
  function moveItem(acc, id, i, dir) {
    const a = acc.get();
    const j = i + dir;
    if (!Array.isArray(a) || j < 0 || j >= a.length) return;
    const t = a[i]; a[i] = a[j]; a[j] = t;
    if (S.openItem[id] === i) S.openItem[id] = j; else if (S.openItem[id] === j) S.openItem[id] = i;
    acc.touch({ now: true });
    const edge = (dir < 0 && j === 0) || (dir > 0 && j === a.length - 1);
    renderTab({ focus: `${id}-${edge ? (dir < 0 ? 'd' : 'u') : (dir < 0 ? 'u' : 'd')}${j}`, reveal: true });
  }
  function removeItem(acc, id, i, name) {
    const a = acc.get();
    if (!Array.isArray(a) || !a[i]) return;
    a.splice(i, 1);
    if (S.openItem[id] === i) S.openItem[id] = null; else if (S.openItem[id] > i) S.openItem[id]--;
    acc.touch({ now: true });
    renderTab({ focus: a.length ? `${id}-m${Math.min(i, a.length - 1)}` : `${id}-add` });
    toast(`Supprimé${NB}: ${name}`, 1800);
  }
  function addItem(f, acc, id) {
    let a = acc.get();
    if (!Array.isArray(a)) { acc.set([]); a = acc.get(); }
    if (typeof f.maxItems === 'number' && a.length >= f.maxItems) return;
    a.push(copy(f.itemDefaults || {}));
    S.openItem[id] = a.length - 1;
    acc.touch({ now: true });
    const first = (f.itemFields || [])[0];
    renderTab({ focus: first ? `${id}-${a.length - 1}-${first.key}` : `${id}-add` });
  }

  /* ---------- Sections tab ---------- */

  function sectionAcc(sid, key) {
    return {
      get: () => { const s = findSection(sid); return s && s.settings ? s.settings[key] : undefined; },
      set: (v, o) => { const s = findSection(sid); if (!s) return; if (!s.settings) s.settings = {}; s.settings[key] = v; change(o); updateSectionRow(sid); },
      touch: (o) => { change(o); updateSectionRow(sid); }
    };
  }
  function distinctCategories() {
    const seen = [];
    S.config.products.forEach((p) => { const c = String(p.category || '').trim(); if (c && seen.indexOf(c) === -1) seen.push(c); });
    return seen;
  }
  function productLimit() {
    let lim = 0;
    S.config.sections.forEach((s) => { if (s.type === 'products' && s.enabled) lim = Math.max(lim, Number(s.settings && s.settings.limit) || 8); });
    return lim;
  }
  function sectionSummary(sec) {
    const def = typeDef(sec.type);
    if (!def) return '';
    if (sec.engine) return 'Composée dans le Studio Pro';
    const st = sec.settings || {};
    const parts = [];
    const tf = def.fields.find((f) => (f.type === 'text' || f.type === 'textarea') && String(st[f.key] || '').trim());
    if (tf) parts.push(shorten(st[tf.key], 60));
    def.fields.forEach((f) => {
      if (f.type === 'items') { const n = Array.isArray(st[f.key]) ? st[f.key].length : 0; parts.push(count(n, String(f.itemLabel || 'élément').toLowerCase())); }
    });
    if (sec.type === 'categories') parts.push(count(distinctCategories().length, 'catégorie'));
    if (sec.type === 'products') parts.push(`${Math.min(Number(st.limit) || 8, S.config.products.length)} affichés`);
    return parts.join(' · ') || def.description || '';
  }
  function updateSectionRow(sid) {
    const s = findSection(sid);
    const n = els.tp.sections.querySelector(`[data-sid="${CSS.escape(sid)}"] .b-item__sum`);
    if (s && n) n.textContent = sectionSummary(s);
  }
  function fixedRow(ic, name, text) {
    return el('div', { class: 'b-fixed' },
      el('span', { class: 'b-item__ico' }, icon(ic)),
      el('span', { class: 'b-item__txt' }, el('span', { class: 'b-item__name', text: name }), el('span', { class: 'b-item__sum', text })),
      el('span', { class: 'b-fixed__lock', title: 'Toujours affiché' }, icon('i-lock'), el('span', { class: 'b-sr', text: 'Toujours affiché' })));
  }

  function renderSections(tp) {
    const list = S.config.sections;
    const sorting = S.reorder.sections && list.length > 1;
    if (!sorting) S.reorder.sections = false;
    tp.append(tabHead('Sections', sorting
      ? 'Changez l’ordre avec les flèches, puis touchez Terminé.'
      : 'L’ordre de votre page d’accueil. Touchez une section pour la modifier, l’œil pour la masquer.', reorderToggle('sections', list.length)));
    tp.append(fixedRow('i-header', 'En-tête', 'Nom de la boutique, menu et panier'));
    if (list.length) {
      const ol = el('ol', { class: 'b-list', 'aria-label': 'Sections de la page' });
      list.forEach((sec, i) => ol.append(sectionItem(sec, i, list.length)));
      tp.append(ol);
    } else {
      tp.append(el('p', { class: 'b-empty b-empty--box', text: 'Votre page n’a plus aucune section. Ajoutez-en une pour commencer.' }));
    }
    if (!sorting) {
      tp.append(el('button', { type: 'button', class: 'b-btn b-btn--dashed b-btn--block', 'data-fk': 'sec-add', id: 'b-sec-add', on: { click: openAddSection } },
        icon('i-plus'), 'Ajouter une section'));
    }
    tp.append(fixedRow('i-footer', 'Pied de page', 'Paiements acceptés, ville, WhatsApp'));
  }

  function sectionItem(sec, i, n) {
    const def = typeDef(sec.type) || { name: sec.type, fields: [] };
    const open = S.openSection === sec.id;
    const bodyId = 'b-sf-' + sec.id;
    const sorting = S.reorder.sections;
    const li = el('li', { class: 'b-item' + (open && !sorting ? ' is-open' : '') + (sec.enabled ? '' : ' is-off') + (sorting ? ' is-sorting' : ''), 'data-sid': sec.id });
    const inner = [
      el('span', { class: 'b-item__ico' }, icon(SECTION_ICONS[sec.type] || 'i-layers')),
      el('span', { class: 'b-item__txt' },
        el('span', { class: 'b-item__name' }, el('span', { class: 'b-item__name-t', text: def.name }), sec.engine ? el('span', { class: 'b-tag b-tag--studio', text: 'Studio Pro' }) : null, sec.enabled ? null : el('span', { class: 'b-tag', text: 'Masquée' })),
        el('span', { class: 'b-item__sum', text: sectionSummary(sec) }))
    ];
    const up = `Monter la section ${guil(def.name)}`;
    const down = `Descendre la section ${guil(def.name)}`;
    if (sorting) {
      li.append(el('div', { class: 'b-item__row' }, el('div', { class: 'b-item__main b-item__main--static' }, inner),
        moveBtns(i, n, up, down, (d) => moveSection(sec.id, d, 's'), 'su-' + sec.id, 'sd-' + sec.id)));
      return li;
    }
    const main = el('button', {
      type: 'button', class: 'b-item__main', 'aria-expanded': String(open), 'aria-controls': open ? bodyId : null, 'data-fk': 'sm-' + sec.id,
      on: { click: () => toggleSection(sec.id) }
    }, inner, icon('i-down', 'b-chev'));
    li.append(el('div', { class: 'b-item__row' }, main,
      iconBtn(sec.enabled ? 'i-eye' : 'i-eye-off', `Afficher la section ${guil(def.name)}`, () => toggleEnabled(sec.id),
        { pressed: sec.enabled, fk: 'se-' + sec.id, cls: 'b-eye', title: sec.enabled ? 'Masquer la section' : 'Afficher la section' })));
    if (open) li.append(sectionForm(sec, bodyId, def, i, n));
    return li;
  }

  // A section detached in the Studio Pro (sections[].engine, a DualEngine composition): its look and its
  // words live in the Studio now, so the simple form would edit nothing visible. Say so, and offer the two
  // ways out (wave 2 of the Studio audit): open it in the Studio, or re-attach it to the template.
  function detachedForm(sec, bodyId, def, i, n) {
    const body = el('div', { class: 'b-item__body', id: bodyId, 'data-detached': '' });
    body.append(el('div', { class: 'b-note-box b-note-box--studio', role: 'note', 'data-fk': 'sdn-' + sec.id }, icon('i-pro'),
      el('span', {},
        el('b', { text: 'Section modifiée dans le Studio Pro' }),
        el('span', { class: 'b-note-box__p', text: `Elle a été détachée du modèle${NB}: son design et ses textes se règlent dans le Studio. Ici, vous pouvez la déplacer, la masquer ou la supprimer.` }))));
    const studio = el('a', { class: 'b-btn b-btn--primary b-btn--sm', href: '../studio/#section=' + encodeURIComponent(sec.id), 'data-leave': '', 'data-fk': 'sds-' + sec.id,
      on: { click: () => { flush(); } } }, icon('i-pro'), 'Ouvrir dans le Studio');
    const attach = el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--sm', 'data-fk': 'sda-' + sec.id, on: { click: () => reattachSection(sec.id) } },
      icon('i-layers'), 'Rattacher');
    attach.title = 'Revenir au modèle de la boutique : la section reprend les réglages de ce formulaire (Annuler la défait)';
    body.append(el('div', { class: 'b-item__acts' }, studio, attach));
    body.append(el('div', { class: 'b-item__foot' },
      el('div', { class: 'b-item__moves' }, moveBtns(i, n, `Monter la section ${guil(def.name)}`, `Descendre la section ${guil(def.name)}`,
        (d) => moveSection(sec.id, d, 'sf'), 'sfu-' + sec.id, 'sfd-' + sec.id, true)),
      el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'sx-' + sec.id, on: { click: () => deleteSection(sec.id) } },
        icon('i-trash'), 'Supprimer')));
    return body;
  }
  function reattachSection(id) {
    const s = findSection(id);
    if (!s || !s.engine) return;
    delete s.engine;
    change({ now: true });
    renderTab({ focus: 'sm-' + id });
    toast(`Section rattachée${NB}: elle suit de nouveau le modèle. Annuler la détache à nouveau.`, 3200);
    revealInPreview({ kind: 'section', id });
  }

  function sectionForm(sec, bodyId, def, i, n) {
    if (sec.engine) return detachedForm(sec, bodyId, def, i, n);
    const body = el('div', { class: 'b-item__body', id: bodyId });
    if (def.description) body.append(el('p', { class: 'b-item__desc', text: def.description }));
    if (sec.type === 'categories') {
      const cats = distinctCategories();
      body.append(el('p', { class: 'b-note-box' }, icon('i-info'),
        el('span', { text: cats.length ? `Tuiles affichées${NB}: ${cats.join(', ')}. Changez les catégories dans l’onglet Produits.` : `Aucune catégorie pour l’instant${NB}: ajoutez-en dans l’onglet Produits.` })));
    }
    const photoDef = def.fields.find((f) => f.type === 'photo');
    def.fields.forEach((f) => {
      const opts = f.type === 'image' && photoDef ? { photo: sectionAcc(sec.id, photoDef.key) } : undefined;
      const node = buildField(f, sectionAcc(sec.id, f.key), `b-f-${sec.id}-${f.key}`, opts);
      if (node) body.append(node);
    });
    if (D.SECTION_BG_OPTIONS) body.append(sectionColorsField(sec));
    body.append(el('div', { class: 'b-item__foot' },
      el('div', { class: 'b-item__moves' }, moveBtns(i, n, `Monter la section ${guil(def.name)}`, `Descendre la section ${guil(def.name)}`,
        (d) => moveSection(sec.id, d, 'sf'), 'sfu-' + sec.id, 'sfd-' + sec.id, true)),
      el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'sx-' + sec.id, on: { click: () => deleteSection(sec.id) } },
        icon('i-trash'), 'Supprimer')));
    return body;
  }

  function toggleSection(id) {
    S.openSection = S.openSection === id ? null : id;
    renderTab({ focus: 'sm-' + id });
    if (S.openSection) {
      scrollRowIntoView(`[data-sid="${CSS.escape(id)}"]`);
      const sec = findSection(id);
      if (sec && !sec.enabled) toast(`Cette section est masquée${NB}: touchez l’œil pour l’afficher dans la boutique.`);
      else revealInPreview({ kind: 'section', id });
    }
  }
  function moveSection(id, dir, p = 's') {
    const list = S.config.sections;
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    change({ now: true });
    const edge = (dir < 0 && j === 0) || (dir > 0 && j === list.length - 1);
    const same = dir < 0 ? 'u-' : 'd-';
    const other = dir < 0 ? 'd-' : 'u-';
    renderTab({ focus: p + (edge ? other : same) + id, reveal: true });
    revealInPreview({ kind: 'section', id });
  }
  function toggleEnabled(id) {
    const s = findSection(id);
    if (!s) return;
    s.enabled = !s.enabled;
    change({ now: true });
    renderTab({ focus: 'se-' + id });
    const def = typeDef(s.type);
    toast(s.enabled ? `Section ${guil(def.name)} affichée` : `Section ${guil(def.name)} masquée`, 1800);
    if (s.enabled) revealInPreview({ kind: 'section', id });
  }
  async function deleteSection(id) {
    const s = findSection(id);
    if (!s) return;
    const def = typeDef(s.type) || { name: s.type };
    const ok = await confirmDialog({
      title: `Supprimer la section ${guil(def.name)}${NB}?`,
      text: 'Ses réglages seront perdus. Pour la cacher sans la perdre, utilisez plutôt l’œil. Vous pourrez aussi revenir en arrière avec Annuler.',
      yes: 'Supprimer'
    });
    if (!ok) return;
    const list = S.config.sections;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    if (S.openSection === id) S.openSection = null;
    change({ now: true });
    renderTab({ focus: list.length ? 'sm-' + list[Math.min(i, list.length - 1)].id : 'sec-add' });
    toast(`Section ${guil(def.name)} supprimée`);
  }

  function openAddSection() {
    const after = S.openSection && findSection(S.openSection);
    const afterDef = after && typeDef(after.type);
    els.addWhere.textContent = afterDef
      ? `Elle sera ajoutée après la section ${guil(afterDef.name)}.`
      : 'Elle sera ajoutée à la fin de la page, avant le pied de page.';
    els.addList.textContent = '';
    D.sectionTypes.forEach((def) => {
      const type = def.type || def.id;
      els.addList.append(el('li', null, el('button', { type: 'button', class: 'b-addopt', on: { click: () => addSection(type) } },
        el('span', { class: 'b-item__ico' }, icon(SECTION_ICONS[type] || 'i-layers')),
        el('span', { class: 'b-item__txt' }, el('span', { class: 'b-item__name', text: def.name }), el('span', { class: 'b-item__sum b-item__sum--wrap', text: def.description || '' })),
        icon('i-plus', 'b-addopt__plus'))));
    });
    openModal('m-add');
  }
  function addSection(type) {
    const def = typeDef(type);
    if (!def) return;
    S.reorder.sections = false;
    const list = S.config.sections;
    const id = D.newId(S.config, 's');
    const sec = { id, type, enabled: true, settings: D.sectionSettings(type, S.config.store.niche, S.config.store.name) };
    const at = S.openSection ? list.findIndex((s) => s.id === S.openSection) + 1 : list.length;
    list.splice(at > 0 ? at : list.length, 0, sec);
    S.openSection = id;
    closeModal();
    change({ now: true });
    if (S.tab !== 'sections') setTab('sections'); else renderTab();
    const row = els.tp.sections.querySelector(`[data-sid="${CSS.escape(id)}"]`);
    if (row) { row.scrollIntoView({ block: 'start', behavior: scrollBehavior() }); focusEl(row.querySelector('.b-item__main')); }
    revealInPreview({ kind: 'section', id });
    toast(`Section ${guil(def.name)} ajoutée`);
  }

  /* ---------- Produits tab ---------- */

  function productAcc(pid, key, after) {
    return {
      get: () => { const p = findProduct(pid); return p ? p[key] : undefined; },
      set: (v, o) => { const p = findProduct(pid); if (!p) return; p[key] = v; change(o); updateProductRow(pid, key); if (after) after(); }
    };
  }
  function productMeta(p) {
    const parts = [D.formatPrice(p.price)];
    if (String(p.category || '').trim()) parts.push(String(p.category).trim());
    return parts.join(' · ');
  }
  function updateProductRow(pid, key) {
    const p = findProduct(pid);
    const li = els.tp.produits.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (!p || !li) return;
    const name = li.querySelector('.b-item__name-t');
    if (name) name.textContent = String(p.name || '').trim() || 'Sans nom';
    const meta = li.querySelector('.b-item__sum');
    if (meta) meta.textContent = productMeta(p);
    const badge = li.querySelector('.b-tag--badge');
    if (badge) { badge.textContent = p.badge ? D.BADGES[p.badge] : ''; badge.hidden = !p.badge; }
    if (key === 'color' || key === 'art' || key === 'image' || key === 'photo') {
      li.querySelectorAll('[data-thumb]').forEach((t) => t.replaceWith(thumb(p, t.className.replace(/\bb-thumb\b/, '').trim())));
    }
  }

  function renderProducts(tp) {
    const ps = S.config.products;
    const lim = productLimit();
    const sorting = S.reorder.produits && ps.length > 1;
    if (!sorting) S.reorder.produits = false;
    tp.append(tabHead('Produits', sorting
      ? 'Changez l’ordre avec les flèches, puis touchez Terminé.'
      : `${count(ps.length, 'produit')}. L’ordre de cette liste est celui de votre boutique.`, reorderToggle('produits', ps.length)));
    if (!sorting) {
      tp.append(el('button', { type: 'button', class: 'b-btn b-btn--primary b-btn--block', id: 'b-p-add', 'data-fk': 'p-add', on: { click: addProduct } },
        icon('i-plus'), 'Ajouter un produit'));
    }
    if (!lim && ps.length) {
      tp.append(el('p', { class: 'b-note-box' }, icon('i-eye-off'), el('span', { text: `La section Produits est masquée ou absente${NB}: vos produits ne sont pas visibles sur la page d’accueil.` })));
    } else if (lim && ps.length > lim) {
      tp.append(el('p', { class: 'b-note-box' }, icon('i-info'), el('span', { text: `La section Produits affiche les ${lim} premiers. Changez ce nombre dans l’onglet Sections.` })));
    }
    if (!ps.length) {
      tp.append(el('p', { class: 'b-empty b-empty--box', text: `Aucun produit pour l’instant. Ajoutez votre premier produit${NB}: un nom et un prix suffisent.` }));
      return;
    }
    const ol = el('ol', { class: 'b-list', 'aria-label': 'Produits' });
    ps.forEach((p, i) => ol.append(productItem(p, i, ps.length, lim)));
    tp.append(ol);
  }

  function productItem(p, i, n, lim) {
    const open = S.openProduct === p.id;
    const bodyId = 'b-pf-' + p.id;
    const name = String(p.name || '').trim() || 'Sans nom';
    const sorting = S.reorder.produits;
    const hiddenHere = lim && i >= lim;
    const li = el('li', { class: 'b-item b-item--product' + (open && !sorting ? ' is-open' : '') + (hiddenHere ? ' is-off' : '') + (sorting ? ' is-sorting' : ''), 'data-pid': p.id });
    const inner = [
      thumb(p, 'b-item__thumb'),
      el('span', { class: 'b-item__txt' },
        el('span', { class: 'b-item__name' }, el('span', { class: 'b-item__name-t', text: name }),
          el('span', { class: 'b-tag b-tag--badge', text: p.badge ? D.BADGES[p.badge] : '', hidden: !p.badge })),
        el('span', { class: 'b-item__sum', text: productMeta(p) + (hiddenHere ? ' · non affiché' : '') }))
    ];
    const up = `Monter ${guil(shorten(name, 30))}`;
    const down = `Descendre ${guil(shorten(name, 30))}`;
    if (sorting) {
      li.append(el('div', { class: 'b-item__row' }, el('div', { class: 'b-item__main b-item__main--static' }, inner),
        moveBtns(i, n, up, down, (d) => moveProduct(p.id, d, 'p'), 'pu-' + p.id, 'pd-' + p.id)));
      return li;
    }
    const main = el('button', {
      type: 'button', class: 'b-item__main', 'aria-expanded': String(open), 'aria-controls': open ? bodyId : null, 'data-fk': 'pm-' + p.id,
      on: { click: () => toggleProduct(p.id) }
    }, inner, icon('i-down', 'b-chev'));
    li.append(el('div', { class: 'b-item__row' }, main));
    if (open) li.append(productForm(p, bodyId, i, n));
    return li;
  }

  function productForm(p, bodyId, i, n) {
    const pid = p.id;
    const A = (key, after) => productAcc(pid, key, after);
    const fid = (k) => `b-p-${pid}-${k}`;
    const body = el('div', { class: 'b-item__body', id: bodyId });

    body.append(textField({ key: 'name', label: 'Nom du produit', type: 'text', max: 60, placeholder: 'Beurre de karité brut' }, A('name'), fid('name')));

    const badgeOpts = [{ value: '', label: 'Aucun' }].concat(Object.keys(D.BADGES).map((k) => ({ value: k, label: D.BADGES[k] })));
    body.append(el('div', { class: 'b-grid2' },
      numberField({ key: 'price', label: 'Prix (' + (D.currencyInfo ? D.currencyInfo().short : 'FCFA') + ')', type: 'number', money: true, placeholder: '6500' }, A('price'), fid('price'),
        { format: (v) => `Affiché${NB}: ${D.formatPrice(v)}`, selectOnFocus: true }),
      selectField({ key: 'badge', label: 'Badge', type: 'select', options: badgeOpts },
        { get: () => { const x = findProduct(pid); return x && x.badge ? x.badge : ''; }, set: (v, o) => A('badge').set(v === '' ? null : v, o) }, fid('badge'))));

    body.append(imageField({ key: 'image', label: 'Photo' }, A('image'), fid('image'), {
      hint: 'Une photo nette, à la lumière du jour. Nous la réduisons à 800 px de large pour qu’elle charge vite.',
      alt: 'Photo du produit', addLabel: 'Ajouter une photo', replaceLabel: 'Changer la photo', ownLabel: 'Mettre ma photo',
      addedMsg: 'Photo ajoutée', removedMsg: 'Photo retirée', photo: A('photo')
    }));

    const cats = distinctCategories();
    const dl = el('datalist', { id: fid('cats') }, cats.map((c) => el('option', { value: c })));
    body.append(textField({ key: 'category', label: 'Catégorie', type: 'text', max: 40, placeholder: cats[0] || 'Robes' }, A('category'), fid('category'),
      { list: fid('cats'), hint: cats.length ? `Déjà utilisées${NB}: ${cats.join(', ')}.` : 'Elle crée une tuile dans la section Catégories.', extra: dl }));

    body.append(textField({ key: 'description', label: 'Description', type: 'textarea', placeholder: `Matière, taille, usage${NB}: une ou deux phrases suffisent.` }, A('description'), fid('desc')));

    // Illustration used when there is no photo
    const artOpts = D.ART_KINDS.map((k) => ({ value: k, label: (D.ART_LABELS && D.ART_LABELS[k]) || k }));
    const visual = el('div', { class: 'b-visual' },
      thumb(p, 'b-visual__prev'),
      el('div', { class: 'b-visual__fields' },
        selectField({ key: 'art', label: 'Dessin', type: 'select', options: artOpts }, A('art'), fid('art')),
        colorField(pid, fid('color'))));
    body.append(el('fieldset', { class: 'b-fieldset' },
      el('legend', { class: 'b-label', text: p.image ? 'Illustration (remplacée par la photo)' : (demoPhoto(p.photo) ? 'Illustration (remplacée par la photo d’exemple)' : 'Illustration (sans photo)') }),
      visual));

    const nm = guil(shorten(String(p.name || '').trim() || 'Sans nom', 30));
    body.append(el('div', { class: 'b-item__foot' },
      el('div', { class: 'b-item__moves' }, moveBtns(i, n, `Monter ${nm}`, `Descendre ${nm}`, (d) => moveProduct(pid, d, 'pf'), 'pfu-' + pid, 'pfd-' + pid, true)),
      el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'px-' + pid, 'aria-label': `Supprimer ${nm}`, on: { click: () => deleteProduct(pid) } },
        icon('i-trash'), 'Supprimer')));
    return body;
  }

  function colorField(pid, id) {
    const p = findProduct(pid);
    const cur = safeColor(p.color);
    const sw = el('div', { class: 'b-swatches' });
    const setColor = (c, o) => productAcc(pid, 'color').set(safeColor(c), o);
    D.PRODUCT_COLORS.forEach((c) => {
      const hex = safeColor(c);
      sw.append(el('button', {
        type: 'button', class: 'b-swatch', style: `--c:${hex}`, 'aria-pressed': String(hex === cur),
        'aria-label': COLOR_NAMES[hex] || hex, title: COLOR_NAMES[hex] || hex, 'data-fk': `${id}-${hex.slice(1)}`,
        on: { click: () => { setColor(hex, { now: true }); renderTab({ focus: `${id}-${hex.slice(1)}` }); } }
      }));
    });
    const custom = el('input', { type: 'color', class: 'b-swatch-input', id: id + '-custom', value: cur.toLowerCase(), 'aria-label': 'Autre couleur', title: 'Autre couleur', 'data-fk': id + '-custom' });
    custom.addEventListener('input', () => {
      setColor(custom.value);
      sw.querySelectorAll('.b-swatch[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    });
    custom.addEventListener('change', () => { setColor(custom.value, { now: true }); });
    sw.append(el('label', { class: 'b-swatch-custom', title: 'Autre couleur' }, custom, el('span', { class: 'b-sr', text: 'Autre couleur' })));
    return el('div', { class: 'b-field', role: 'group', 'aria-labelledby': id + '-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: id + '-l', text: 'Couleur du fond' })), sw);
  }

  function toggleProduct(id) {
    S.openProduct = S.openProduct === id ? null : id;
    renderTab({ focus: 'pm-' + id });
    if (S.openProduct) {
      scrollRowIntoView(`[data-pid="${CSS.escape(id)}"]`);
      revealInPreview({ kind: 'product', id }); // on another page than the home page: its product page
    }
  }
  function moveProduct(id, dir, p = 'p') {
    const list = S.config.products;
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    change({ now: true });
    const edge = (dir < 0 && j === 0) || (dir > 0 && j === list.length - 1);
    const same = dir < 0 ? 'u-' : 'd-';
    const other = dir < 0 ? 'd-' : 'u-';
    renderTab({ focus: p + (edge ? other : same) + id, reveal: true });
    revealInPreview({ kind: 'product', id });
  }
  function addProduct() {
    S.reorder.produits = false;
    const ps = S.config.products;
    const niche = inColl(D.niches, S.config.store.niche) ? D.niches[S.config.store.niche] : null;
    const ref = ps[0];
    const p = {
      id: D.newId(S.config, 'p'),
      name: 'Nouveau produit',
      price: ref && typeof ref.price === 'number' ? ref.price : 5000,
      category: ref ? String(ref.category || '') : '',
      badge: 'new',
      art: ref ? safeArt(ref.art) : (niche ? safeArt(niche.art) : 'box'),
      color: safeColor(D.PRODUCT_COLORS[ps.length % D.PRODUCT_COLORS.length]),
      description: '',
      image: null,
      photo: null
    };
    ps.unshift(p);
    S.openProduct = p.id;
    change({ now: true });
    if (S.tab !== 'produits') setTab('produits'); else renderTab();
    const input = document.getElementById(`b-p-${p.id}-name`);
    const row = els.tp.produits.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
    if (row) row.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (input) { focusEl(input); input.select(); }
    revealInPreview({ kind: 'product', id: p.id });
    toast(`Produit ajouté en tête de liste. Donnez-lui un nom et un prix.`);
  }
  async function deleteProduct(id) {
    const p = findProduct(id);
    if (!p) return;
    const name = String(p.name || '').trim() || 'ce produit';
    const ok = await confirmDialog({
      title: `Supprimer ${guil(shorten(name, 40))}${NB}?`,
      text: 'Le produit disparaît de votre boutique. Vous pourrez revenir en arrière avec Annuler.',
      yes: 'Supprimer'
    });
    if (!ok) return;
    const list = S.config.products;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    if (S.openProduct === id) S.openProduct = null;
    change({ now: true });
    renderTab({ focus: list.length ? 'pm-' + list[Math.min(i, list.length - 1)].id : 'p-add' });
    toast('Produit supprimé');
  }

  /* ---------- Thème tab ---------- */

  function ensureFontLink(fp) {
    if (!fp || !fp.googleUrl) return;
    const id = 'jst-font-' + fp.id;
    const had = document.getElementById(id);
    if (had) return had;
    const link = el('link', { rel: 'stylesheet', id, href: fp.googleUrl });
    document.head.append(link);
    return link;
  }
  /* ---------- Thème › « Polices »: suggestions (the pairs), the heading font and the text font apart ----------
   * theme.typography holds only what differs from the suggestion (theme.fonts): display, text, weight (with pair,
   * the suggestion they were chosen over), size ('S' / 'L'), upper (when it differs from the template's). A choice
   * equal to the suggestion's is deleted, and so is an empty typography: the fiche is then exactly the pair's. */
  const FONT_SAMPLE = 'Aa';
  function typoNow() {
    try { if (D.typography) return D.typography(S.config); } catch (e) { /* older data.js */ }
    return null;
  }
  // Each name in the picker is drawn in its own face, from a subset of just its letters. The subset is a static
  // instance (no optical size, one weight): it is loaded under a private family name (jeere-s-<id>) so it never
  // joins the store's own family and never replaces those letters in the preview. The picker's stacks name the
  // private family first, then the real one (shown as soon as the store loads it, or if the sample fails).
  // Her Google fonts (« Mes polices », f.custom) get the same treatment under 'jeere-s-g-<name>'; her imported
  // files are drawn from their own @font-face (ensureOwnFaces), already private ('jeere-u-<hash>').
  const sampleFamily = (f) => (f.custom ? 'jeere-s-g-' + String(f.family).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'jeere-s-' + f.id);
  const sampleStack = (f) => (f.custom && f.source === 'file' ? `'${f.family}', ${f.kind === 'serif' ? 'serif' : 'sans-serif'}`
    : `'${sampleFamily(f)}', '${f.family}', ${f.kind === 'serif' ? 'serif' : 'sans-serif'}`);
  function fontSampleLink(f) {
    if (!f) return;
    if (f.custom && f.source === 'file') { ensureOwnFaces(); return; }
    const url = f.custom ? (D.googleSampleUrl ? D.googleSampleUrl(f.family, f.weight, f.name + FONT_SAMPLE) : null)
      : (D.fontSampleUrl && /^[\w-]+$/.test(f.id) ? D.fontSampleUrl(f.id, f.name + FONT_SAMPLE) : null);
    if (!url) return;
    const id = 'jst-font-s-' + (f.custom ? sampleFamily(f) : f.id);
    if (document.getElementById(id)) return;
    const st = el('style', { id });
    document.head.append(st);
    if (typeof fetch !== 'function') return;
    // A fetch that fails is tried once more after a moment (patchy mobile data); failing again takes the
    // element away, so the next time the list is drawn tries again
    const load = (tries) => fetch(url).then((r) => (r.ok ? r.text() : '')).then((css) => {
      // Only Google's @font-face rules, renamed: the family, nothing else, changes
      if (!/^[\s\S]*@font-face/.test(css) || /[<]|@import|expression\(/i.test(css)) throw new Error('no @font-face');
      st.textContent = css.replace(/font-family:\s*'[^']*'/g, `font-family: '${sampleFamily(f)}'`);
    }).catch(() => {
      if (tries > 0 && st.isConnected) setTimeout(() => load(tries - 1), 1200);
      else st.remove(); /* offline: the real family, or the system font, until the next try */
    });
    load(1);
  }
  // The current heading font with all its weights (the « Épaisseur » chips are drawn in it)
  function fontWeightsLink(f) {
    if (!f || (f.custom && f.source === 'file')) return;
    const id = 'jst-font-w-' + String(f.id).replace(/[^\w-]/g, '-');
    if (document.getElementById(id)) return;
    const ws = f.weights.join(';');
    const fam = f.family.replace(/ /g, '+');
    const q = f.opsz ? `${fam}:opsz,wght@${f.weights.map((w) => f.opsz + ',' + w).join(';')}` : `${fam}:wght@${ws}`;
    document.head.append(el('link', { rel: 'stylesheet', id, href: `https://fonts.googleapis.com/css2?family=${q}&display=swap` }));
  }
  // A font by id: one of the 33 or one of hers ('custom:cf1')
  function fontById(id) {
    try { if (D.fontOf) return D.fontOf(S.config, id); } catch (e) { /* older data.js */ }
    return D.FONTS && D.FONTS[id] ? D.FONTS[id] : null;
  }
  function cleanTypo() {
    const th = S.config.theme;
    const t = th.typography;
    if (!t || typeof t !== 'object') { delete th.typography; return; }
    const pair = D.fontPairs[th.fonts] || D.fontPairs[0];
    if (t.display === pair.displayFont) delete t.display;
    if (t.text === pair.textFont) delete t.text;
    // a choice of hers that no longer exists (a font she removed) goes back to the suggestion's
    if (t.display && !fontById(t.display)) { delete t.display; delete t.weight; }
    if (t.text && !fontById(t.text)) delete t.text;
    if (t.weight !== undefined) {
      const f = fontById(t.display || pair.displayFont);
      const def = (t.display || pair.displayFont) === pair.displayFont ? pair.display.weight : (f ? f.weight : t.weight);
      if (t.weight === def) delete t.weight;
    }
    if (t.size === 'M') delete t.size;
    // Capitals: kept only when they differ from the default (the template's, and never for a handwriting)
    const upDef = D.upperDefault ? D.upperDefault(S.config.template, t.display || pair.displayFont) : !!(D.HEADING_UPPER_DEFAULT || {})[S.config.template];
    if (t.upper !== undefined && t.upper === upDef) delete t.upper;
    if (t.display || t.text || t.weight !== undefined) t.pair = th.fonts; else delete t.pair;
    if (!Object.keys(t).length) delete th.typography;
  }
  function setTypo(key, value, msg, fk) {
    const th = S.config.theme;
    const before = JSON.stringify(th.typography || null);
    const t = th.typography && typeof th.typography === 'object' ? th.typography : (th.typography = {});
    if (value === null || value === undefined) delete t[key]; else t[key] = value;
    // A new heading font brings its own default weight; a handwriting comes without capitals (her earlier
    // capitals choice was made for another font: she can turn them back on, Qualité then warns)
    if (key === 'display') {
      delete t.weight;
      if (D.FONTS && D.FONTS[value] && D.FONTS[value].style === 'manuscrit') delete t.upper;
    }
    cleanTypo();
    if (JSON.stringify(th.typography || null) === before) { renderTab({ focus: fk }); return; }
    change({ now: true });
    renderTab({ focus: fk });
    if (msg) toast(msg, 1600);
  }
  function setPairFonts(fp) {
    const t = S.config.theme.typography;
    const had = !!(t && (t.display || t.text || t.weight !== undefined));
    if (S.config.theme.fonts === fp.id && !had) return;
    if (D.setFontPair) D.setFontPair(S.config, fp.id); else S.config.theme.fonts = fp.id;
    cleanTypo();
    S.fontPick = null;
    change({ now: true });
    renderTab({ focus: 'font-' + fp.id });
    if (had) toast(`Polices ${fp.name}${NB}: vos polices choisies sont remplacées.`, 7000, 'info', { label: 'Annuler', run: () => { if (canUndo()) undo(); } });
    else toast(`Polices ${fp.name}`, 1600);
  }
  function fontsGroup() {
    const th = S.config.theme;
    const ty = typoNow();
    const t = th.typography && typeof th.typography === 'object' ? th.typography : {};
    const custom = !!(ty && ty.custom);
    const kids = [];
    if (ty) {
      // Live preview: the store's name and a line of text in the store's colours and fonts
      fontSampleLink(ty.display);
      fontSampleLink(ty.text);
      try { if (window.JeereRender && window.JeereRender.ensureFonts) window.JeereRender.ensureFonts(S.config); } catch (e) { /* ignore */ }
      const c = themeCols().base || {};
      const name = String(S.config.store.name || '').trim() || 'Votre boutique';
      kids.push(el('div', {
        class: 'b-typo', 'aria-label': `Aperçu${NB}: titres en ${ty.display.name}, textes en ${ty.text.name}`, role: 'img',
        style: `--tb:${c.bg || '#FFFFFF'};--tt:${c.text || '#111111'};--tm:${c.muted || '#555555'}`
      },
        el('span', {
          class: 'b-typo__h', 'aria-hidden': 'true', text: name,
          style: `font-family:${ty.displayStack};font-weight:${ty.weight};font-size:${Math.round(26 * ty.hs * 10) / 10}px;text-transform:${ty.upper ? 'uppercase' : 'none'}`
        }),
        el('span', { class: 'b-typo__p', 'aria-hidden': 'true', style: `font-family:${ty.textStack}`, text: 'Livraison à Cocody en 24 h. Payez par Wave, Orange Money ou à la livraison.' })));
    }

    // Suggestions: the 6 pairs
    const pairs = el('div', { class: 'b-fonts' });
    D.fontPairs.forEach((fp) => {
      ensureFontLink(fp);
      pairs.append(el('button', {
        type: 'button', class: 'b-font', 'aria-pressed': String(th.fonts === fp.id && !custom), 'data-fk': 'font-' + fp.id, 'aria-label': `Polices ${fp.name}`,
        on: { click: () => setPairFonts(fp) }
      },
        el('span', { class: 'b-font__aa', style: `font-family:${fp.display.family};font-weight:${fp.display.weight}`, text: 'Aa' }),
        el('span', { class: 'b-font__name', text: fp.name }),
        el('span', { class: 'b-font__pair', text: `${famName(fp.display.family)} · ${famName(fp.text.family)}` })));
    });
    kids.push(el('h4', { class: 'b-subhead', text: 'Suggestions' }), pairs);
    if (!ty || !D.FONTS) return group('b-g-theme-fonts', 'Polices', 'Une police pour les titres, une pour les textes.', kids);

    // Titles: font, size, weight, capitals
    kids.push(el('h4', { class: 'b-subhead', text: 'Titres' }));
    kids.push(fontPicker('display', ty.display));
    const sizes = D.HEADING_SIZE_OPTIONS || [];
    kids.push(el('div', { class: 'b-field b-field--tight' }, el('span', { class: 'b-label', id: 'b-hsize-l', text: 'Taille des titres' }),
      el('div', { class: 'b-segopts', role: 'group', 'aria-labelledby': 'b-hsize-l' }, sizes.map((o) => el('button', {
        type: 'button', class: 'b-segopt', 'aria-pressed': String(ty.size === o.value), 'data-fk': 'hsize-' + o.value,
        on: { click: () => setTypo('size', o.value, `Titres${NB}: ${o.label.toLowerCase()}`, 'hsize-' + o.value) }
      }, el('span', { class: 'b-sizeprev b-sizeprev--' + o.value, 'aria-hidden': 'true', text: 'A' }), el('span', { text: o.label }))))));
    fontWeightsLink(ty.display);
    const wl = D.WEIGHT_LABELS || {};
    kids.push(el('div', { class: 'b-field b-field--tight' }, el('span', { class: 'b-label', id: 'b-hweight-l', text: 'Épaisseur des titres' }),
      ty.weights.length > 1
        ? el('div', { class: 'b-wchips', role: 'group', 'aria-labelledby': 'b-hweight-l' }, ty.weights.map((w) => el('button', {
          type: 'button', class: 'b-wchip', 'aria-pressed': String(ty.weight === w), 'data-fk': 'hweight-' + w, 'aria-label': `${wl[w] || w} (${w})`,
          style: `font-family:${ty.displayStack};font-weight:${w}`,
          on: { click: () => setTypo('weight', w, `Épaisseur${NB}: ${(wl[w] || String(w)).toLowerCase()}`, 'hweight-' + w) }
        }, wl[w] || String(w))))
        : el('p', { class: 'b-note', text: `${ty.display.name} n’existe qu’en une épaisseur.` })));
    kids.push(el('div', { class: 'b-switches' }, el('button', {
      type: 'button', class: 'b-switch', 'aria-pressed': String(!!ty.upper), 'data-fk': 'hupper',
      on: { click: () => setTypo('upper', !ty.upper, ty.upper ? 'Titres en minuscules' : 'Titres en majuscules', 'hupper') }
    }, el('span', { class: 'b-switch__txt' }, el('span', { class: 'b-switch__lbl', text: 'Titres en majuscules' }),
      el('span', { class: 'b-switch__note', text: 'Les titres, et le nom de la boutique quand il n’y a pas de logo.' })),
    el('span', { class: 'b-switch__ui', 'aria-hidden': 'true' }))));

    // Texts
    kids.push(el('h4', { class: 'b-subhead', text: 'Textes' }));
    kids.push(fontPicker('text', ty.text));
    if (!ty.display.glyphs || !ty.text.glyphs) {
      kids.push(el('p', { class: 'b-note' }, icon('i-info'), `Toutes ces polices ont les accents. ɛ, ɔ et ŋ${NB}: quand une police ne les a pas, ils sont écrits dans une police proche, pour que les noms en dioula ou en baoulé s’affichent bien.`));
    }
    return group('b-g-theme-fonts', 'Polices', 'Une suggestion règle les deux d’un coup. Vous pouvez ensuite choisir la police des titres et celle des textes à part.', kids);
  }
  // A field that shows the current font in its own face; it opens the list of fonts by style
  function fontPicker(which, cur) {
    const open = S.fontPick && S.fontPick.which === which;
    const label = which === 'display' ? 'Police des titres' : 'Police des textes';
    fontSampleLink(cur);
    const styleOf = (id) => (id === 'mine' ? MINE_STYLE.label : (D.FONT_STYLES.find((x) => x.id === id) || {}).label || '');
    const btn = el('button', {
      type: 'button', class: 'b-fontpick', 'aria-expanded': String(!!open), 'aria-controls': 'b-fl-' + which, 'data-fk': 'fontpick-' + which,
      'aria-label': `${label}${NB}: ${cur.name}, ${styleOf(cur.style).toLowerCase()}. ${open ? 'Fermer la liste' : 'Changer'}`,
      on: { click: () => { S.fontPick = open ? null : { which, style: cur.style }; renderTab({ focus: 'fontpick-' + which }); } }
    },
      el('span', { class: 'b-fontpick__k', text: label }),
      el('span', { class: 'b-fontpick__v', style: `font-family:${sampleStack(cur)};font-weight:${cur.weight}`, text: cur.name }),
      el('span', { class: 'b-fontpick__s', text: styleOf(cur.style) }),
      icon(open ? 'i-up' : 'i-down', 'b-fontpick__chev'));
    if (!open) return el('div', { class: 'b-field b-field--tight' }, btn);
    const list = D.FONTS.filter((f) => which === 'display' || f.text);
    // the styles of the list, then « Mes polices »: her imported files and the Google fonts she added by name
    const styles = D.FONT_STYLES.filter((st) => list.some((f) => f.style === st.id)).concat(D.customFamilies ? [MINE_STYLE] : []);
    const style = styles.some((st) => st.id === S.fontPick.style) ? S.fontPick.style : styles[0].id;
    const st = styles.find((x) => x.id === style);
    const tabs = el('div', { class: 'b-fstyles', role: 'group', 'aria-label': 'Styles de police' }, styles.map((x) => el('button', {
      type: 'button', class: 'b-fstyle', 'aria-pressed': String(x.id === style), 'data-fk': `fstyle-${which}-${x.id}`,
      'aria-label': x.label,
      on: { click: () => { S.fontPick = { which, style: x.id }; renderTab({ focus: `fstyle-${which}-${x.id}` }); } }
    }, x.short || x.label)));
    if (style === 'mine') {
      return el('div', { class: 'b-field b-field--tight' }, btn,
        el('div', { class: 'b-fontlist', id: 'b-fl-' + which }, tabs, el('p', { class: 'b-fontlist__hint', text: st.hint }), ownFontsPanel(which, cur)));
    }
    const opts = el('div', { class: 'b-fontopts', role: 'group', 'aria-label': `Polices ${st.label.toLowerCase()}` }, list.filter((f) => f.style === style).map((f) => {
      fontSampleLink(f);
      const fk = (which === 'display' ? 'fd-' : 'ft-') + f.id;
      return el('button', {
        type: 'button', class: 'b-fontopt', 'aria-pressed': String(f.id === cur.id), 'data-fk': fk,
        'aria-label': `${f.name}${f.text && which === 'display' ? ', aussi pour les textes' : ''}`,
        on: { click: () => setTypo(which, f.id, `${which === 'display' ? 'Titres' : 'Textes'} en ${f.name}`, fk) }
      },
        el('span', { class: 'b-fontopt__v', style: `font-family:${sampleStack(f)};font-weight:${f.weight}`, text: f.name }));
    }));
    return el('div', { class: 'b-field b-field--tight' }, btn,
      el('div', { class: 'b-fontlist', id: 'b-fl-' + which }, tabs, el('p', { class: 'b-fontlist__hint', text: st.hint }), opts));
  }

  /* ---------- Thème › Polices › « Mes polices » (theme.customFonts) ----------
   * Her own fonts: a file from the phone or the computer (WOFF2, WOFF, TTF, OTF; fontfile.js reads its name,
   * weight, style and letters; a TTF / OTF is packed as WOFF), or a Google font added by its exact name. A font
   * is read first (S.fontPending: a card with its name, which she can change, what it has, the licence
   * reminder), then added in one undo step, for the titles and / or the texts. README « Fonts ». */
  const MINE_STYLE = { id: 'mine', label: 'Mes polices', short: 'Mes polices', hint: 'Vos propres polices : un fichier de votre téléphone ou de votre ordinateur, ou une police Google Fonts ajoutée par son nom.' };
  // The file types offered by the picker. Not on an iPhone or an iPad: their Files app greys out the types it does not
  // know (WOFF2), so every file is offered there and the first bytes say whether it is a font.
  const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1));
  const FONT_ACCEPT = IOS ? null : '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf,font/sfnt,application/font-woff,application/x-font-ttf,application/x-font-otf,application/vnd.ms-opentype';
  const CFL = () => D.CUSTOM_FONT_LIMITS || { files: 4, google: 4, bytes: 409600, read: 4194304, name: 40 };
  const ko = (n) => Math.max(1, Math.round(n / 1024)).toLocaleString('fr-FR');
  function ownFamilies() {
    try { return D.customFamilies ? D.customFamilies(S.config) : []; } catch (e) { return []; }
  }
  function ownList() { return S.config.theme && Array.isArray(S.config.theme.customFonts) ? S.config.theme.customFonts : []; }
  // Every imported file as an @font-face of its private family, so the list shows each font in its own face
  // (the same ids as the store's: render.js never adds them twice)
  function ensureOwnFaces() {
    if (!D.customFontFaces) return;
    try {
      D.customFontFaces(S.config).forEach((f) => { if (!document.getElementById(f.id)) document.head.append(el('style', { id: f.id, text: f.css })); });
    } catch (e) { /* a face is a nicety */ }
  }
  function fontErr(code, extra) { const e = new Error(code); e.code = code; Object.assign(e, extra || {}); return e; }
  // bytes through the browser's own zlib (WOFF tables)
  function streamBytes(bytes, Stream) {
    const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate'));
    return new Response(s).arrayBuffer().then((b) => new Uint8Array(b));
  }
  const inflate = (b) => streamBytes(b, DecompressionStream);
  const deflate = (b) => streamBytes(b, CompressionStream);
  // Brotli's static dictionary (RFC 7932, 122 784 bytes): fetched once, only for a WOFF2 that uses it
  let brotliDict = null;
  function loadBrotliDict() {
    if (!brotliDict) {
      brotliDict = fetch('brotli-dict.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('dict'))))
        .then((b) => new Uint8Array(b)).catch(() => { brotliDict = null; throw fontErr('offline'); });
    }
    return brotliDict;
  }
  function bytesToDataUrl(bytes, format) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^;,]*;base64,/, `data:font/${format};base64,`));
      r.onerror = () => reject(fontErr('broken'));
      r.readAsDataURL(new Blob([bytes]));
    });
  }
  // « Josefin_Sans-Bold.woff2 » → « Josefin Sans » (only when the file has no readable name)
  function nameFromFile(fn) {
    return String(fn || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_](thin|extralight|light|regular|medium|semibold|bold|extrabold|black|italic|variable|vf)+$/i, '')
      .replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  }
  // A font file → the pending font: { source: 'file', name, weight, style, weightRange, format, data, size, glyphs,
  // accents, kind, fileFormat, fileSize, missing }. Errors: fontErr('heavy' | 'type' | 'collection' | 'broken' |
  // 'latin' | 'offline' | 'old')
  async function readFontFile(file) {
    const F = window.JeereFontFile;
    const L = CFL();
    if (!F || typeof FileReader !== 'function') throw fontErr('old');
    if (file.size > L.read) throw fontErr('heavy', { size: file.size, format: null });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fmt = F.sniff(bytes);
    if (fmt === 'collection') throw fontErr('collection');
    if (!fmt) throw fontErr('type');
    const canInflate = typeof DecompressionStream === 'function';
    let info;
    try { info = await F.read(bytes, { inflate: canInflate ? inflate : null }); } catch (e) {
      if (e && e.code === 'brotli-dict') info = await F.read(bytes, { dict: await loadBrotliDict() });
      else if (e && e.code === 'inflate') throw fontErr('old');
      else throw fontErr(e && e.code === 'collection' ? 'collection' : 'broken');
    }
    if (info.latin === false) throw fontErr('latin');
    // A TTF or an OTF travels as WOFF: the same font, usually 40 % lighter (each table zlib-compressed)
    let packed = bytes;
    let format = fmt;
    if ((fmt === 'ttf' || fmt === 'otf') && typeof CompressionStream === 'function') {
      try { const w = await F.toWoff(bytes, deflate); if (w.length < bytes.length) { packed = w; format = 'woff'; } } catch (e) { /* keep the file as it is */ }
    }
    if (packed.length > L.bytes) throw fontErr('heavy', { size: packed.length, format: fmt, packed: packed !== bytes });
    // The browser must be able to draw it (its sanitizer refuses a broken or hostile file)
    if (typeof FontFace === 'function') {
      try { await new FontFace('jeere-check', packed.slice().buffer).load(); } catch (e) { throw fontErr('broken'); }
    }
    const data = await bytesToDataUrl(packed, format);
    const rw = (w) => (D.roundWeight ? D.roundWeight(w) : w) || 400;
    const out = {
      source: 'file', name: (D.cleanFontName ? D.cleanFontName(info.family || nameFromFile(file.name)) : info.family) || 'Ma police',
      weight: rw(info.weight), style: info.style === 'italic' ? 'italic' : 'normal', format, data, size: packed.length,
      glyphs: info.glyphs === true, accents: info.accents !== false, kind: info.kind === 'serif' ? 'serif' : 'sans',
      fileFormat: fmt, fileSize: bytes.length, missing: info.missing || [], nameFromFile: !info.family
    };
    if (info.weightRange) { const lo = rw(info.weightRange[0]), hi = rw(info.weightRange[1]); if (lo < hi) { out.weightRange = [lo, hi]; out.weight = Math.min(hi, Math.max(lo, out.weight)); } }
    return out;
  }
  function fontErrMessage(e) {
    const c = e && e.code;
    const L = CFL();
    if (c === 'heavy') {
      const max = ko(L.bytes);
      if (!e.format) return `Ce fichier pèse ${ko(e.size)}${NB}Ko${NB}: c’est bien trop lourd pour une police (${max}${NB}Ko au plus). Importez la version WOFF2 de la police, bien plus légère.`;
      return `Cette police pèse ${ko(e.size)}${NB}Ko${e.packed ? ', même compressée' : ''}${NB}: c’est trop lourd pour une boutique qui s’ouvre sur un téléphone (${max}${NB}Ko au plus). ` +
        (e.format === 'woff2' ? 'Choisissez une seule épaisseur, ou une police plus légère.' : 'Importez plutôt sa version WOFF2, bien plus légère.');
    }
    if (c === 'type') return 'Ce fichier n’est pas une police. Choisissez un fichier WOFF2, WOFF, TTF ou OTF.';
    if (c === 'collection') return 'Ce fichier regroupe plusieurs polices (.ttc). Importez-les une par une, en WOFF2, WOFF, TTF ou OTF.';
    if (c === 'latin') return `Cette police n’a pas les lettres de l’alphabet latin${NB}: elle ne peut pas écrire vos textes.`;
    if (c === 'offline') return 'Ce fichier WOFF2 n’a pas pu être lu sans connexion. Réessayez une fois connectée, ou importez la version TTF de la police.';
    if (c === 'old') return 'Ce navigateur ne sait pas lire les fichiers de police. Mettez-le à jour, ou importez la police depuis un autre appareil.';
    if (c === 'full') return `Vous avez déjà ${L.files} polices importées${NB}: retirez-en une pour en ajouter une autre.`;
    return `Ce fichier de police est abîmé ou incomplet${NB}: il n’a pas pu être lu. Téléchargez-le à nouveau, ou essayez une autre version (WOFF2, TTF).`;
  }
  async function onFontFile(file, which) {
    S.fontError = '';
    if (ownList().filter((e) => e && e.source !== 'google').length >= CFL().files) throw fontErr('full');
    const p = await readFontFile(file);
    p.forDisplay = which !== 'text';
    p.forText = which === 'text';
    S.fontPending = p;
    S.fontRename = null;
    S.fontPick = { which, style: 'mine' };
    renderTab({ focus: 'cf-pend-name' });
  }
  function onFontError(e) {
    S.fontError = fontErrMessage(e);
    renderTab({ focus: 'cf-err' });
    toast(S.fontError, 6000, 'err');
  }

  // Google Fonts by name: the css2 API answers only for a family it has, with each weight it serves
  const GF = 'https://fonts.googleapis.com/css2?family=';
  function gfAnswers(url) {
    return fetch(url).then((r) => (r.ok ? r.text() : '')).then((css) => /@font-face/.test(css), () => false);
  }
  // 'space mono' → 'Space Mono'; words written in capitals stay ('IBM plex sans' → 'IBM Plex Sans')
  function titleCase(s) { return s.split(' ').map((w) => (/^[A-Z0-9]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' '); }
  // Does the font have ɛ ɔ ŋ Ɛ Ɔ Ŋ? Google's subset of just those letters, drawn on a canvas over two different
  // fallbacks: a letter the font has is as wide over both.
  async function gfGlyphs(name, w) {
    try {
      const css = await fetch(`${GF}${name.replace(/ /g, '+')}:wght@${w}&text=${encodeURIComponent('ɛɔƐƆŋŊ')}&display=swap`).then((r) => (r.ok ? r.text() : ''));
      if (!/@font-face/.test(css) || /[<]|@import/.test(css)) return false;
      const fam = 'jeere-gl-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!document.getElementById('jst-font-' + fam)) document.head.append(el('style', { id: 'jst-font-' + fam, text: css.replace(/font-family:\s*'[^']*'/g, `font-family: '${fam}'`) }));
      await Promise.race([document.fonts.load(`${w} 40px '${fam}'`, 'ɛɔƐƆŋŊ'), new Promise((r) => setTimeout(r, 4000))]);
      const ctx = document.createElement('canvas').getContext('2d');
      return [...'ɛɔƐƆŋŊ'].every((ch) => {
        ctx.font = `${w} 40px '${fam}', monospace`; const a = ctx.measureText(ch).width;
        ctx.font = `${w} 40px '${fam}', serif`; const b = ctx.measureText(ch).width;
        return Math.abs(a - b) < 0.01;
      });
    } catch (e) { return false; }
  }
  async function findGoogleFont(raw) {
    const typed = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!typed) throw fontErr('gf-empty');
    if (!D.googleFamilyName(typed)) throw fontErr('gf-chars');
    const lower = typed.toLowerCase();
    const listed = D.FONTS.find((f) => f.family.toLowerCase() === lower || f.name.toLowerCase() === lower);
    if (listed) throw fontErr('gf-listed', { font: listed });
    const mine = ownFamilies().find((f) => f.source === 'google' && f.name.toLowerCase() === lower);
    if (mine) throw fontErr('gf-mine', { font: mine });
    if (ownList().filter((e) => e && e.source === 'google').length >= CFL().google) throw fontErr('gf-full');
    const cands = [typed, titleCase(typed)].filter((c, i, a) => a.indexOf(c) === i);
    for (const name of cands) {
      const fam = name.replace(/ /g, '+');
      const ws = [100, 200, 300, 400, 500, 600, 700, 800, 900];
      const ok = await Promise.all(ws.map((w) => gfAnswers(`${GF}${fam}:wght@${w}&text=Aa&display=swap`)));
      const weights = ws.filter((w, i) => ok[i]);
      if (!weights.length) continue;
      const w0 = D.nearestWeight(400, weights);
      const [italic, glyphs] = await Promise.all([gfAnswers(`${GF}${fam}:ital,wght@1,${w0}&text=Aa&display=swap`), gfGlyphs(name, w0)]);
      const kind = /serif|garamond|baskerville|bodoni|didot|caslon|slab/i.test(name) && !/sans/i.test(name) ? 'serif' : 'sans';
      return { source: 'google', name, weights, italic, glyphs, kind, weight: D.nearestWeight(650, weights) };
    }
    // Nothing answered: no such font, or no connection at all?
    const online = await gfAnswers(`${GF}Inter:wght@400&text=a&display=swap`);
    throw fontErr(online ? 'gf-none' : 'gf-offline', { name: typed });
  }
  function gfMessage(e) {
    const c = e && e.code;
    if (c === 'gf-empty') return `Écrivez le nom d’une police Google Fonts, par exemple Josefin Sans.`;
    if (c === 'gf-chars') return `Un nom de police Google Fonts ne contient que des lettres, des chiffres et des espaces, par exemple Space Mono.`;
    if (c === 'gf-listed') return `${e.font.name} est déjà dans nos polices${NB}: choisissez-la dans l’onglet ${(D.FONT_STYLES.find((x) => x.id === e.font.style) || {}).short || ''}.`;
    if (c === 'gf-mine') return `${e.font.name} est déjà dans vos polices.`;
    if (c === 'gf-full') return `Vous avez déjà ${CFL().google} polices Google Fonts${NB}: retirez-en une pour en ajouter une autre.`;
    if (c === 'gf-offline') return 'Pas de connexion pour le moment. Réessayez dans un instant.';
    return `Aucune police Google Fonts ne s’appelle «${NB}${e && e.name ? e.name : ''}${NB}». Vérifiez l’orthographe sur fonts.google.com (par exemple Josefin Sans, Space Mono).`;
  }
  function searchGoogleFont(which) {
    const q = S.fontSearch.text;
    S.fontSearch = { text: q, busy: true, error: '', info: '' };
    renderTab({ focus: 'cf-g-input' });
    findGoogleFont(q).then((p) => {
      p.forDisplay = which !== 'text';
      p.forText = which === 'text';
      S.fontPending = p;
      S.fontRename = null;
      S.fontSearch = { text: '', busy: false, error: '', info: '' };
      renderTab({ focus: 'cf-pend-add' });
    }, (e) => {
      S.fontSearch = { text: q, busy: false, error: gfMessage(e), info: '' };
      if (e && e.code === 'gf-listed') S.fontSearch.listed = e.font.id;
      renderTab({ focus: 'cf-g-input' });
    });
  }

  // The pending font, drawn in its own face before it is added (a private family, never the store's)
  function pendingFace(p) {
    if (p.source === 'file') {
      const css = `@font-face{font-family:'jeere-pend';src:url(${p.data}) format('${(D.FONT_FORMAT_CSS || {})[p.format] || p.format}');font-weight:${p.weightRange ? p.weightRange.join(' ') : p.weight};font-style:${p.style};font-display:swap}`;
      let st = document.getElementById('jst-font-pend');
      if (!st) { st = el('style', { id: 'jst-font-pend' }); document.head.append(st); }
      if (st.textContent !== css) st.textContent = css;
      // ɛ ɔ ŋ from the same close font as in the store (Montserrat, Noto Serif), when the file has none
      const fb = p.glyphs ? '' : `'${(D.GLYPH_FALLBACKS || {})[p.kind === 'serif' ? 'serif' : 'sans'] || 'Montserrat'}', `;
      return `'jeere-pend', ${fb}${p.kind === 'serif' ? 'serif' : 'sans-serif'}`;
    }
    const f = { custom: true, source: 'google', id: 'pend', family: p.name, name: p.name, weight: p.weight, kind: p.kind };
    fontSampleLink(f);
    return sampleStack(f);
  }
  const weightLabel = (w) => `${(D.WEIGHT_LABELS || {})[w] || w} (${w})`;
  function pendingCard(which) {
    const p = S.fontPending;
    const file = p.source === 'file';
    const stack = pendingFace(p);
    const fam = file ? ownFamilies().find((f) => f.source === 'file' && f.name.toLowerCase() === String(p.name).trim().toLowerCase()) : null;
    const meta = file
      ? [p.weightRange ? `Épaisseurs ${p.weightRange[0]} à ${p.weightRange[1]}` : weightLabel(p.weight), p.style === 'italic' ? 'italique' : null,
        `${(window.JeereFontFile && window.JeereFontFile.FORMATS[p.fileFormat] || {}).label || p.fileFormat}, ${ko(p.fileSize)}${NB}Ko` + (p.format !== p.fileFormat ? ` → WOFF, ${ko(p.size)}${NB}Ko` : '')].filter(Boolean).join(' · ')
      : `Google Fonts · ${p.weights.length > 1 ? p.weights.length + ' épaisseurs' : '1 épaisseur'}${p.italic ? ' · italique' : ''}`;
    const sw = (key, label) => el('button', {
      type: 'button', class: 'b-switch', 'aria-pressed': String(!!p[key]), 'data-fk': 'cf-pend-' + key,
      on: { click: () => { p[key] = !p[key]; renderTab({ focus: 'cf-pend-' + key }); } }
    }, el('span', { class: 'b-switch__txt' }, el('span', { class: 'b-switch__lbl', text: label })), el('span', { class: 'b-switch__ui', 'aria-hidden': 'true' }));
    return el('div', { class: 'b-cfpend', role: 'group', 'aria-labelledby': 'b-cfpend-t' },
      el('p', { class: 'b-cfpend__t', id: 'b-cfpend-t', text: file ? 'Police lue dans votre fichier' : 'Police trouvée sur Google Fonts' }),
      el('div', { class: 'b-cfpend__prev', 'aria-hidden': 'true', style: `font-family:${stack};font-weight:${p.weight};font-style:${p.style || 'normal'}` },
        el('span', { class: 'b-cfpend__name', text: String(p.name || 'Ma police') }),
        el('span', { class: 'b-cfpend__sample', text: 'Àà Éé Çç ɛ ɔ ŋ 0123' })),
      el('p', { class: 'b-cfpend__meta', text: meta }),
      file ? el('div', { class: 'b-field b-field--tight' },
        el('label', { class: 'b-label', for: 'b-cf-pend-name', text: 'Nom de la police' }),
        el('input', {
          class: 'b-input', id: 'b-cf-pend-name', type: 'text', 'data-fk': 'cf-pend-name', value: p.name, maxlength: String(CFL().name), autocomplete: 'off',
          on: { input: (e) => { p.name = e.target.value; } }
        }),
        p.nameFromFile ? el('p', { class: 'b-hint', text: 'Ce fichier ne donne pas son nom : il vient du nom du fichier. Vérifiez-le.' }) : null,
        fam ? el('p', { class: 'b-hint', text: `Même nom que votre police ${fam.name}${NB}: ce fichier s’y ajoute (${fam.weights.concat(p.weight).filter((w, i, a) => a.indexOf(w) === i).length} épaisseurs).` }) : null) : null,
      !p.accents ? el('p', { class: 'b-note b-tone--warn' }, icon('i-warn'), `Cette police n’a pas tous les accents (${(p.missing || []).filter((c) => 'ɛɔƐƆŋŊ'.indexOf(c) === -1).slice(0, 6).join(' ')})${NB}: ces lettres s’afficheront dans une autre police.`) : null,
      !p.glyphs ? el('p', { class: 'b-note' }, icon('i-info'), `Cette police n’a pas les lettres ɛ, ɔ et ŋ${NB}: elles seront écrites dans une police proche, pour que les noms en dioula ou en baoulé s’affichent bien.`) : null,
      el('p', { class: 'b-note b-cfpend__lic', 'data-fk': 'cf-licence' }, icon('i-info'), file
        ? `Vérifiez que vous avez le droit d’utiliser cette police sur le web${NB}: sa licence doit le permettre (c’est le cas des polices Google Fonts et des polices sous licence OFL).`
        : 'Les polices Google Fonts sont libres : vous pouvez les utiliser sur votre boutique.'),
      el('div', { class: 'b-switches' }, sw('forDisplay', 'Pour les titres'), sw('forText', 'Pour les textes')),
      el('div', { class: 'b-cfpend__acts' },
        el('button', { type: 'button', class: 'b-btn b-btn--primary b-btn--sm', 'data-fk': 'cf-pend-add', on: { click: () => addPending(which) } }, icon('i-check'), 'Ajouter cette police'),
        el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--sm', 'data-fk': 'cf-pend-cancel', on: { click: () => { S.fontPending = null; renderTab({ focus: 'fontpick-' + which }); } } }, 'Annuler')));
  }
  function nextFontId() {
    const used = {};
    ownList().forEach((e) => { if (e && typeof e.id === 'string') used[e.id] = true; });
    let i = 1;
    while (used['cf' + i]) i++;
    return 'cf' + i;
  }
  function addPending(which) {
    const p = S.fontPending;
    if (!p) return;
    const th = S.config.theme;
    const list = Array.isArray(th.customFonts) ? th.customFonts : (th.customFonts = []);
    const id = nextFontId();
    let entry;
    if (p.source === 'file') {
      entry = { id, name: (D.cleanFontName ? D.cleanFontName(p.name) : String(p.name).trim()) || 'Ma police', weight: p.weight, style: p.style, format: p.format, data: p.data, size: p.size };
      if (p.weightRange) entry.weightRange = p.weightRange.slice();
      entry.glyphs = !!p.glyphs;
      entry.accents = p.accents !== false;
      entry.kind = p.kind;
    } else {
      entry = { id, name: p.name, source: 'google', weights: p.weights.slice() };
      if (p.italic) entry.italic = true;
      entry.glyphs = !!p.glyphs;
      entry.kind = p.kind;
    }
    list.push(entry);
    // the family it belongs to (a Bold next to her Regular of the same name): that family is the one chosen
    const fam = ownFamilies().find((f) => f.ids.indexOf(id) !== -1);
    const ref = fam ? fam.id : 'custom:' + id;
    const t = th.typography && typeof th.typography === 'object' ? th.typography : (th.typography = {});
    if (p.forDisplay) { t.display = ref; delete t.weight; delete t.upper; }
    if (p.forText) t.text = ref;
    cleanTypo();
    S.fontPending = null;
    S.fontError = '';
    const pend = document.getElementById('jst-font-pend');
    if (pend) pend.remove();
    change({ now: true });
    saveNow();
    // the save may have had to drop it (a full memory): saveWithoutFonts said so
    if (!ownList().some((e) => e && e.id === id)) return;
    renderTab({ focus: 'cf-opt-' + which + '-' + ref.replace(/^custom:/, '') });
    const where = [p.forDisplay ? 'les titres' : null, p.forText ? 'les textes' : null].filter(Boolean).join(' et ');
    toast(`Police ${entry.name} ajoutée${where ? ' pour ' + where : ''}`, 2400, 'ok');
  }
  function removeOwnFont(f) {
    const ids = f.ids;
    const before = JSON.stringify(S.config.theme);
    withoutFonts(S.config, ids);
    cleanTypo();
    if (S.fontRename === f.key) S.fontRename = null;
    if (JSON.stringify(S.config.theme) === before) return;
    change({ now: true });
    renderTab({ focus: 'cf-import' });
    toast(`Police ${f.name} retirée`, 7000, 'info', { label: 'Annuler', run: () => { if (canUndo()) undo(); } });
  }
  function renameOwnFont(f, value) {
    const name = D.cleanFontName ? D.cleanFontName(value) : String(value || '').trim();
    S.fontRename = null;
    if (!name || name === f.name) { renderTab({ focus: 'cf-ren-' + f.ids[0] }); return; }
    ownList().forEach((e) => { if (e && f.ids.indexOf(e.id) !== -1) e.name = name; });
    change({ now: true });
    renderTab({ focus: 'cf-ren-' + f.ids[0] });
    toast(`Police renommée${NB}: ${name}`, 2400, 'ok');
  }
  // What a family is: « Fichier WOFF2 · Gras (700) · 23 Ko », « Google Fonts · 3 épaisseurs »
  function ownMeta(f) {
    if (f.source === 'google') return `Google Fonts · ${f.weights.length > 1 ? f.weights.length + ' épaisseurs' : '1 épaisseur'}`;
    const fmts = f.entries.map((e) => String(e.format).toUpperCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ');
    return `${f.entries.length > 1 ? f.entries.length + ' fichiers' : 'Fichier'} ${fmts} · ${f.weights.length > 1 ? f.weights.length + ' épaisseurs' : weightLabel(f.weights[0])} · ${ko(f.size)}${NB}Ko`;
  }
  function ownFontsPanel(which, cur) {
    const fams = ownFamilies();
    ensureOwnFaces();
    const ty = typoNow();
    const kids = [];
    // her fonts, each in its own face: a click chooses it for this slot
    if (fams.length) {
      kids.push(el('div', { class: 'b-fontopts', role: 'group', 'aria-label': 'Mes polices' }, fams.map((f) => {
        fontSampleLink(f);
        const fk = 'cf-opt-' + which + '-' + f.ids[0];
        return el('button', {
          type: 'button', class: 'b-fontopt b-fontopt--mine', 'aria-pressed': String(!!(cur.custom && cur.key === f.key)), 'data-fk': fk,
          'aria-label': `${f.name}, ${ownMeta(f)}`,
          on: { click: () => setTypo(which, f.id, `${which === 'display' ? 'Titres' : 'Textes'} en ${f.name}`, fk) }
        }, el('span', { class: 'b-fontopt__v', style: `font-family:${sampleStack(f)};font-weight:${f.weight}`, text: f.name }),
        el('span', { class: 'b-fontopt__s', text: f.source === 'google' ? 'Google Fonts' : 'Votre fichier' }));
      })));
    } else if (!S.fontPending) kids.push(el('p', { class: 'b-empty', text: 'Vous n’avez pas encore de police à vous.' }));
    if (S.fontPending) kids.push(pendingCard(which));
    if (S.fontError) kids.push(el('p', { class: 'b-note b-tone--err b-cferr', role: 'alert', tabindex: '-1', 'data-fk': 'cf-err' }, icon('i-alert'), S.fontError));
    // import a file
    const files = ownList().filter((e) => e && e.source !== 'google').length;
    kids.push(el('h4', { class: 'b-cfhead', text: 'Importer un fichier' }));
    if (files < CFL().files) {
      kids.push(el('div', { class: 'b-cfimport' },
        fileBtn('cf-import', 'Importer une police', FONT_ACCEPT, (file) => onFontFile(file, which), 'b-btn--ghost', onFontError),
        el('p', { class: 'b-hint', text: `WOFF2, WOFF, TTF ou OTF, ${ko(CFL().bytes)}${NB}Ko au plus (une TTF est allégée en WOFF). ${CFL().files - files} sur ${CFL().files} encore possible${CFL().files - files > 1 ? 's' : ''}.` })));
    } else kids.push(el('p', { class: 'b-note' }, icon('i-info'), fontErrMessage({ code: 'full' })));
    // add a Google font by its name
    const fs = S.fontSearch;
    const gid = 'b-cf-g-' + which;
    kids.push(el('h4', { class: 'b-cfhead', text: 'Ajouter une police Google Fonts' }),
      el('form', { class: 'b-cfsearch', role: 'search', on: { submit: (e) => { e.preventDefault(); if (!S.fontSearch.busy) searchGoogleFont(which); } } },
        el('label', { class: 'b-sr', for: gid, text: 'Nom exact de la police Google Fonts' }),
        el('input', {
          class: 'b-input', id: gid, type: 'text', 'data-fk': 'cf-g-input', value: fs.text, placeholder: 'Ex. : Josefin Sans', autocomplete: 'off',
          autocapitalize: 'words', spellcheck: 'false', maxlength: '60', 'aria-describedby': gid + '-st',
          on: { input: (e) => { S.fontSearch.text = e.target.value; } }
        }),
        el('button', { type: 'submit', class: 'b-btn b-btn--primary b-btn--sm', 'data-fk': 'cf-g-go', disabled: fs.busy }, fs.busy ? 'Recherche…' : 'Chercher')),
      el('p', { class: 'b-hint' + (fs.error ? ' b-cferr' : ''), id: gid + '-st', role: 'status', 'aria-live': 'polite', 'data-fk': 'cf-g-status' },
        fs.busy ? 'Recherche sur Google Fonts…' : (fs.error || 'Le nom exact, comme sur fonts.google.com. Elle se charge depuis Google Fonts, comme nos polices.')),
      fs.listed && D.FONTS[fs.listed] ? el('button', {
        type: 'button', class: 'b-btn b-btn--ghost b-btn--sm', 'data-fk': 'cf-g-listed',
        on: { click: () => { const f = D.FONTS[fs.listed]; S.fontSearch = { text: '', busy: false, error: '', info: '' }; S.fontPick = { which, style: f.style }; if (which === 'display' || f.text) setTypo(which, f.id, `${which === 'display' ? 'Titres' : 'Textes'} en ${f.name}`, 'fontpick-' + which); else renderTab({ focus: 'fontpick-' + which }); } }
      }, `Choisir ${D.FONTS[fs.listed].name}`) : null);
    // manage: rename (her files), remove
    if (fams.length) {
      kids.push(el('h4', { class: 'b-cfhead', text: 'Gérer mes polices' }));
      kids.push(el('ul', { class: 'b-cflist' }, fams.map((f) => {
        const uses = ty && ty.custom ? [ty.display.id === f.id ? 'Titres' : null, ty.text.id === f.id ? 'Textes' : null].filter(Boolean) : [];
        const renaming = S.fontRename === f.key;
        const rid = 'b-cf-ren-' + f.ids[0];
        return el('li', { class: 'b-cfrow' },
          renaming
            ? el('form', { class: 'b-cfren', on: { submit: (e) => { e.preventDefault(); renameOwnFont(f, e.target.querySelector('input').value); } } },
              el('label', { class: 'b-sr', for: rid, text: `Nouveau nom pour ${f.name}` }),
              el('input', { class: 'b-input', id: rid, type: 'text', value: f.name, maxlength: String(CFL().name), 'data-fk': 'cf-ren-in-' + f.ids[0], autocomplete: 'off' }),
              el('button', { type: 'submit', class: 'b-btn b-btn--primary b-btn--sm', 'data-fk': 'cf-ren-ok-' + f.ids[0] }, 'Renommer'),
              el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--sm', on: { click: () => { S.fontRename = null; renderTab({ focus: 'cf-ren-' + f.ids[0] }); } } }, 'Annuler'))
            : el('div', { class: 'b-cfrow__main' },
              el('span', { class: 'b-cfrow__name', style: `font-family:${sampleStack(f)};font-weight:${f.weight}`, text: f.name }),
              el('span', { class: 'b-cfrow__meta', text: ownMeta(f) + (uses.length ? ' · ' + uses.join(' et ') : '') })),
          renaming ? null : el('div', { class: 'b-cfrow__acts' },
            f.source === 'file' ? el('button', {
              type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'cf-ren-' + f.ids[0], 'aria-label': `Renommer ${f.name}`,
              on: { click: () => { S.fontRename = f.key; renderTab({ focus: 'cf-ren-in-' + f.ids[0] }); } }
            }, icon('i-edit'), 'Renommer') : null,
            el('button', {
              type: 'button', class: 'b-btn b-btn--quiet b-btn--sm b-btn--danger', 'data-fk': 'cf-del-' + f.ids[0], 'aria-label': `Retirer ${f.name}`,
              on: { click: () => removeOwnFont(f) }
            }, icon('i-trash'), 'Retirer')));
      })));
    }
    return el('div', { class: 'b-cfpanel' }, kids);
  }

  function setTheme(key, value, msg) {
    if (S.config.theme[key] === value) return;
    S.config.theme[key] = value;
    change({ now: true });
    renderTab();
    if (msg) toast(msg, 1600);
  }
  function applyTemplate(id) {
    if (!inColl(D.templates, id) || S.config.template === id) return;
    const t = D.templates[id];
    S.config.template = id;
    S.config.theme.palette = t.defaults.palette;
    S.config.theme.fonts = t.defaults.fonts;
    S.config.theme.radius = t.defaults.radius;
    S.config.theme.buttons = t.defaults.buttons;
    // The seller's own colours (theme.colors) stay: a template changes the layout, the palette under
    // them, the fonts and the corners, never the colours she picked herself. Her own fonts (theme.typography)
    // stay too, over the template's suggestion; her capitals choice is kept only when it differs from the new template's.
    const hadColors = !!(S.config.theme.colors && Object.keys(S.config.theme.colors).length);
    const ty = S.config.theme.typography;
    const hadFonts = !!(ty && typeof ty === 'object' && (ty.display || ty.text || ty.weight !== undefined));
    if (ty && typeof ty === 'object') { if (hadFonts) ty.pair = t.defaults.fonts; cleanTypo(); }
    change({ now: true });
    renderTab();
    const kept = [hadColors ? 'couleurs personnalisées' : null, hadFonts ? 'polices' : null].filter(Boolean);
    toast(kept.length ? `Modèle ${t.name} appliqué. Vos ${kept.join(' et vos ')} sont gardées.` : `Modèle ${t.name} appliqué`, kept.length ? 3600 : 2800);
  }
  // A palette sets every colour at once: the seller's own colours (theme.colors) give way, Annuler brings them back.
  // Section colours stay: Page / Cartes / Principale follow the new palette, a custom colour is kept.
  function setPalette(id, name) {
    const had = !!(S.config.theme.colors && Object.keys(S.config.theme.colors).length);
    if (S.config.theme.palette === id && !had) return;
    S.config.theme.palette = id;
    delete S.config.theme.colors;
    S.openColor = null;
    change({ now: true });
    renderTab();
    if (had) toast(`Couleurs ${name}${NB}: vos couleurs personnalisées sont remplacées.`, 7000, 'info', { label: 'Annuler', run: () => { if (canUndo()) undo(); } });
    else toast(`Couleurs ${name}`, 1600);
  }
  function segmented(options, current, onPick, fk, visual) {
    return el('div', { class: 'b-segopts', role: 'group' }, options.map((o) => el('button', {
      type: 'button', class: 'b-segopt', 'aria-pressed': String(o.value === current), 'data-fk': `${fk}-${o.value}`,
      on: { click: () => onPick(o.value, o.label) }
    }, visual ? visual(o) : null, el('span', { text: o.label }))));
  }

  function renderTheme(tp) {
    const th = S.config.theme;
    tp.append(tabHead('Thème', 'Le modèle, les couleurs et les polices. Vos sections et vos produits ne bougent pas.'));
    // The logo lives in Boutique: a row here leads to it (the logo and the colours go together)
    const lb = brandNow();
    tp.append(el('button', {
      type: 'button', class: 'b-logorow', 'data-fk': 'theme-logo',
      on: { click: () => { setTab('boutique', { top: true }); requestAnimationFrame(() => focusBrand()); } }
    },
      el('span', { class: 'b-logorow__pic' + (lb.logo ? '' : ' is-empty'), 'aria-hidden': 'true' }, lb.logo ? el('img', { src: lb.logo, alt: '' }) : el('span', { text: lb.initial })),
      el('span', { class: 'b-logorow__txt' },
        el('span', { class: 'b-logorow__t', text: lb.logo ? 'Votre logo' : 'Ajouter votre logo' }),
        el('span', { class: 'b-logorow__s', text: 'Dans Boutique › Logo et icône' })),
      icon('i-arrow', 'b-logorow__go')));

    const tpls = el('div', { class: 'b-tplopts' });
    D.templates.forEach((t) => {
      const sch = el('span', { class: 'b-tplopt__shot' });
      sch.innerHTML = SCHEMATICS[t.id] || '';
      tpls.append(el('button', {
        type: 'button', class: 'b-tplopt', 'aria-pressed': String(S.config.template === t.id), 'data-fk': 'tpl-' + t.id,
        'aria-label': `Modèle ${t.name}, style ${t.style}`, on: { click: () => applyTemplate(t.id) }
      }, sch, el('span', { class: 'b-tplopt__name', text: t.name }), el('span', { class: 'b-tplopt__style', text: t.style })));
    });
    tp.append(group('b-g-theme-template', 'Modèle', 'Changer de modèle applique aussi ses couleurs, ses polices et ses arrondis.', tpls));

    const pals = el('div', { class: 'b-pals' });
    D.palettes.forEach((p) => {
      const c = p.colors;
      pals.append(el('button', {
        type: 'button', class: 'b-pal', 'aria-pressed': String(th.palette === p.id), 'data-fk': 'pal-' + p.id, 'aria-label': `Couleurs ${p.name}`,
        on: { click: () => setPalette(p.id, p.name) }
      },
        // The strong colour fills the chip (« Aa » in its text colour), the page background below
        el('span', { class: 'b-pal__sw', style: `--pa:${c.accent};--po:${c.onAccent};--pb:${c.bg}` },
          el('span', { class: 'b-pal__aa', text: 'Aa' })),
        el('span', { class: 'b-pal__name', text: p.name })));
    });
    tp.append(group('b-g-theme-palette', 'Choisir une palette', 'Elle règle toutes les couleurs d’un coup. Vous pourrez ensuite changer chaque couleur.', pals,
      el('button', {
        type: 'button', class: 'b-btn b-btn--ghost b-btn--sm b-jump', 'data-fk': 'jump-colors',
        on: { click: () => focusGroup('b-g-theme-colors') }
      }, icon('i-down'), 'Personnaliser les couleurs')));

    // « Couleurs : Vives / Douces » (theme.intensity), drawn with the current palette
    const pal = themeCols().base || {};
    const opts = intensityOptions();
    const cur = opts.some((o) => o.value === th.intensity) ? th.intensity : (D.DEFAULT_INTENSITY || 'vivid');
    const ints = el('div', { class: 'b-intopts', role: 'group', 'aria-label': 'Intensité des couleurs' });
    opts.forEach((o) => {
      ints.append(el('button', {
        type: 'button', class: 'b-intopt', 'aria-pressed': String(o.value === cur), 'data-fk': 'int-' + o.value,
        'aria-label': `Couleurs ${o.label.toLowerCase()}${o.hint ? `${NB}: ${o.hint}` : ''}`,
        on: { click: () => setTheme('intensity', o.value, `Couleurs${NB}: ${o.label.toLowerCase()}`) }
      },
        el('span', {
          class: 'b-intprev b-intprev--' + (o.value === 'soft' ? 'soft' : 'vivid'), 'aria-hidden': 'true',
          style: `--a:${pal.accent || '#111111'};--oa:${pal.onAccent || '#FFFFFF'};--bg:${pal.bg || '#FFFFFF'};--sf:${pal.surface || '#FFFFFF'};--tx:${pal.text || '#111111'}`
        },
          el('i', { class: 'b-intprev__bar' }), el('i', { class: 'b-intprev__hero' }),
          el('i', { class: 'b-intprev__tiles' }, el('b'), el('b'), el('b'))),
        el('span', { class: 'b-intopt__name', text: o.label })));
    });
    tp.append(group('b-g-theme-intensity', 'Intensité des couleurs', `Vives${NB}: votre couleur principale habille toute la boutique. Douces${NB}: des fonds clairs, la couleur en touches.`, ints));
    tp.append(colorsGroup());

    tp.append(fontsGroup());

    tp.append(group('b-g-theme-radius', 'Arrondis', 'Pour les cartes, les images et les boutons.',
      segmented(D.RADIUS_OPTIONS, th.radius, (v, l) => setTheme('radius', v, `Arrondis${NB}: ${l}`), 'rad',
        (o) => el('span', { class: 'b-radprev', style: `border-top-left-radius:${Math.min(D.radii[o.value] || 0, 14)}px`, 'aria-hidden': 'true' }))));

    tp.append(group('b-g-theme-buttons', 'Boutons', null,
      segmented(D.BUTTON_OPTIONS, th.buttons, (v, l) => setTheme('buttons', v, `Boutons${NB}: ${l}`), 'btn',
        (o) => el('span', { class: 'b-btnprev b-btnprev--' + o.value, 'aria-hidden': 'true' }))));
  }

  /* ---------- Custom colours: Thème › « Personnaliser les couleurs » and each section's « Couleurs » ----------
   * A colour key is 'theme:<key>' (theme.colors) or 'section:<id>:<key>' (sections[].settings). Unset keys
   * show the colour the store uses now (the palette's, or one derived to read well). « Réinitialiser » (or
   * « Automatique ») deletes the key, and an empty theme.colors is deleted too: the fiche is then exactly the
   * palette's again. Under each picker, « Peu lisible » (text under 4.5:1) with « Corriger »: the nearest
   * readable shade of the same hue. Every change is one undo step (dragging the native picker is one). */

  function hexOf(v) {
    const s = String(v == null ? '' : v).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) return ('#' + s.split('').map((c) => c + c).join('')).toUpperCase();
    return /^[0-9a-f]{6}$/i.test(s) ? ('#' + s).toUpperCase() : null;
  }
  function themeCols() {
    try { if (D.themeColors) return D.themeColors(S.config); } catch (e) { /* older data.js */ }
    const c = pal();
    return { base: c, set: {}, custom: false, zones: {}, defaults: {} };
  }
  function checksNow() { try { return D.colorChecks ? D.colorChecks(S.config) : []; } catch (e) { return []; } }
  function ratioText(r) { return (Math.floor(r * 10) / 10).toFixed(1).replace('.', ',') + ':1'; }
  function contrastOf(a, b) { return D.contrastRatio ? D.contrastRatio(a, b) : 21; }
  function zoneOfKey(k) {
    const z = D.ELEMENT_ZONES || {};
    return Object.keys(z).find((n) => z[n].indexOf(k) !== -1) || null;
  }
  function sectionOfKey(key) { const p = String(key).split(':'); return p[0] === 'section' ? findSection(p[1]) : null; }
  // What the key holds in the fiche (null when unset)
  function colorKeyGet(key) {
    const p = String(key).split(':');
    if (p[0] === 'theme') { const c = S.config.theme.colors; return c && typeof c === 'object' && c[p[1]] != null ? c[p[1]] : null; }
    const s = sectionOfKey(key);
    return s && s.settings && s.settings[p[2]] != null ? s.settings[p[2]] : null;
  }
  // The colour the store shows for the key now
  function colorKeyShown(key) {
    const p = String(key).split(':');
    const tc = themeCols();
    if (p[0] === 'theme') {
      if (tc.base[p[1]]) return tc.base[p[1]];
      const z = zoneOfKey(p[1]);
      if (!z) return '#111111';
      const i = D.ELEMENT_ZONES[z].indexOf(p[1]);
      const zc = tc.zones && tc.zones[z];
      if (zc) return i === 0 ? zc.bg : zc.fg;
      const df = tc.defaults && tc.defaults[z];
      return df ? (i === 0 ? df.bg : df.fg) : '#111111';
    }
    const s = sectionOfKey(key);
    if (!s || !D.sectionColors) return tc.base.bg;
    const sc = D.sectionColors(s, tc.base);
    if (p[2] === 'bg') return sc.zone ? sc.zone.bg : tc.base.bg;
    if (p[2] === 'fg') return sc.zone ? sc.zone.fg : tc.base.text;
    if (p[2] === 'buttonBg') return sc.button ? sc.button.bg : tc.base.accent;
    if (p[2] === 'buttonText') return sc.button ? sc.button.fg : tc.base.onAccent;
    return tc.base.bg;
  }
  function colorKeySet(key, value, o) {
    const hex = hexOf(value);
    if (!hex && !/^(page|surface|accent)$/.test(String(value))) return;
    const p = String(key).split(':');
    if (p[0] === 'theme') {
      // One of the six palette colours set back to the palette's own: no colour of hers, the row says « Palette »
      const raw = rawPalette();
      if ((D.PALETTE_COLOR_KEYS || []).indexOf(p[1]) !== -1 && hexOf(raw[p[1]]) === hex) {
        const c = S.config.theme.colors;
        if (c && typeof c === 'object' && p[1] in c) {
          delete c[p[1]];
          if (!Object.keys(c).length) delete S.config.theme.colors;
          change(o);
        } else if (o && o.now) change(o);
        return;
      }
      if (!S.config.theme.colors || typeof S.config.theme.colors !== 'object') S.config.theme.colors = {};
      // the same value again (Enter after typing it): no edit, but the typing becomes its own undo step
      if (S.config.theme.colors[p[1]] === hex) { if (o && o.now) change(o); return; }
      S.config.theme.colors[p[1]] = hex;
    } else {
      const s = sectionOfKey(key);
      if (!s) return;
      if (!s.settings) s.settings = {};
      const v = hex || value;
      if (s.settings[p[2]] === v) { if (o && o.now) change(o); return; }
      s.settings[p[2]] = v;
    }
    change(o);
  }
  // Back to the palette (theme) or to automatic (section); the bg of a section takes its text colour along
  function colorKeyClear(key, o) {
    const p = String(key).split(':');
    if (p[0] === 'theme') {
      const c = S.config.theme.colors;
      if (!c || typeof c !== 'object' || !(p[1] in c)) return false;
      delete c[p[1]];
      if (!Object.keys(c).length) delete S.config.theme.colors;
    } else {
      const s = sectionOfKey(key);
      if (!s || !s.settings) return false;
      const keys = p[2] === 'bg' ? ['bg', 'fg'] : [p[2]];
      if (!keys.some((k) => k in s.settings)) return false;
      keys.forEach((k) => { delete s.settings[k]; });
    }
    change(o);
    return true;
  }
  // The checks a key takes part in, as the text (fg) or as one of its grounds
  function problemsOf(key, list) {
    return (list || checksNow()).filter((c) => c.fgKey === key || (c.groundKeys || []).indexOf(key) !== -1);
  }
  // « Corriger » under a picker: the text gets the nearest readable shade; a ground, the nearest shade on
  // which all its texts read
  function fixFor(key, probs) {
    if (!probs.length) return null;
    const own = probs.find((c) => c.fgKey === key);
    if (own) return own.fix;
    const texts = probs.filter((c) => c.kind !== 'fill');
    if (!texts.length) return null;
    const fgs = texts.map((c) => c.fg);
    return D.nearestReadable ? D.nearestReadable(colorKeyShown(key), fgs, D.CONTRAST_MIN ? D.CONTRAST_MIN.text : 4.5) : null;
  }
  function rawPalette() { return (inColl(D.palettes, S.config.theme.palette) ? D.palettes[S.config.theme.palette].colors : null) || {}; }
  function swatchList() {
    const b = themeCols().base;
    const keys = ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent'];
    const uniq = (l) => { const seen = {}; return l.filter((h) => { if (!h || seen[h]) return false; seen[h] = true; return true; }); };
    const mine = uniq(keys.map((k) => hexOf(b[k])));
    const orig = uniq(keys.map((k) => hexOf(rawPalette()[k])));
    const pop = uniq((D.POP_COLORS || []).map(hexOf));
    // « Couleurs de la palette »: only when she changed some (else it is the row above)
    return { mine, orig: orig.join() === mine.join() ? [] : orig, pop };
  }

  // « Peu lisible » + « Corriger »: filled from the current fiche, updated live while a picker moves
  function readNote(key) {
    const n = el('div', { class: 'b-readnote b-tone--warn', 'data-read-key': key, 'aria-live': 'polite' });
    fillReadNote(n, key);
    return n;
  }
  function fillReadNote(n, key) {
    const probs = problemsOf(key);
    n.replaceChildren();
    n.hidden = !probs.length;
    if (!probs.length) return;
    const worst = probs.reduce((a, c) => (c.ratio < a.ratio ? c : a), probs[0]);
    const fix = fixFor(key, probs);
    const fill = worst.kind === 'fill';
    n.append(icon('i-alert'), el('span', { class: 'b-readnote__txt' },
      el('strong', { text: fill ? 'Peu visible' : 'Peu lisible' }),
      fill ? `${NB}: ${worst.label}.` : `${NB}: vos clients auront du mal à lire ${worst.label}.`,
      el('small', { class: 'b-readnote__ratio', text: ` Contraste ${ratioText(worst.ratio)}, il faut au moins ${ratioText(worst.min || 4.5)}.` })));
    if (fix) {
      n.append(el('button', {
        type: 'button', class: 'b-btn b-btn--sm b-readnote__fix', 'data-fk': 'fix-' + key,
        on: { click: () => { colorKeySet(key, fix, { now: true }); renderTab({ focus: 'fix-' + key }); toast(`Couleur corrigée${NB}: ${fix}`, 1800, 'ok'); afterFixFocus(key); } }
      }, icon('i-check'), 'Corriger'));
    }
  }
  function afterFixFocus(key) {
    const n = els.tp[S.tab].querySelector(`[data-fk="${CSS.escape('cr-' + key)}"]`) || els.tp[S.tab].querySelector(`[data-fk="${CSS.escape('hex-' + key)}"]`);
    if (n) focusEl(n);
  }
  function refreshReadNotes() {
    const list = checksNow();
    els.tp[S.tab].querySelectorAll('[data-logo-note]').forEach((n) => { const k = n.getAttribute('data-logo-note'); const f = logoGroundNote(k); if (f) n.replaceWith(f); });
    els.tp[S.tab].querySelectorAll('[data-read-key]').forEach((n) => fillReadNote(n, n.getAttribute('data-read-key')));
    els.tp[S.tab].querySelectorAll('[data-row-key]').forEach((r) => {
      const k = r.getAttribute('data-row-key');
      const bad = problemsOf(k, list).length > 0;
      const t = r.querySelector('.b-crow__warn');
      if (t) t.hidden = !bad;
      const chip = r.querySelector('.b-crow__chip');
      if (chip) chip.style.setProperty('--c', colorKeyShown(k));
      const hx = r.querySelector('.b-crow__hex');
      if (hx) hx.textContent = colorKeyShown(k);
    });
  }

  // The picker: native colour input + hex field + swatches (the palette's colours, then pop colours)
  function colorPicker(key, label, opts = {}) {
    const shown = colorKeyShown(key);
    const id = 'b-cp-' + key.replace(/[^a-z0-9]+/gi, '-');
    const native = el('input', { type: 'color', class: 'b-cpick__native', id: id + '-n', value: shown.toLowerCase(), 'aria-label': `${label}${NB}: choisir une couleur`, 'data-fk': 'nat-' + key });
    const hex = el('input', {
      class: 'b-input b-cpick__hex', id: id + '-h', type: 'text', value: shown, maxlength: 7, autocomplete: 'off', spellcheck: 'false',
      'aria-label': `${label}${NB}: code couleur`, 'data-fk': 'hex-' + key, inputmode: 'text'
    });
    const live = (v) => { refreshReadNotes(); if (opts.onLive) opts.onLive(v); };
    native.addEventListener('input', () => { const v = hexOf(native.value); if (!v) return; hex.value = v; colorKeySet(key, v); live(v); });
    native.addEventListener('change', () => { const v = hexOf(native.value); if (!v) return; colorKeySet(key, v, { now: true }); renderTab({ focus: 'nat-' + key }); });
    hex.addEventListener('input', () => { const v = hexOf(hex.value); hex.classList.toggle('is-bad', !v && hex.value.trim().length >= 4); if (!v || hex.value.replace('#', '').length < 6) return; native.value = v.toLowerCase(); colorKeySet(key, v); live(v); });
    // Enter confirms the code at once (one undo step), like leaving the field
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hex.dispatchEvent(new Event('change')); } });
    hex.addEventListener('change', () => { const v = hexOf(hex.value); if (!v) { hex.value = colorKeyShown(key); hex.classList.remove('is-bad'); return; } colorKeySet(key, v, { now: true }); renderTab({ focus: 'hex-' + key }); });
    const sw = swatchList();
    const cur = hexOf(colorKeyGet(key));
    const swBtn = (h) => el('button', {
      type: 'button', class: 'b-swatch b-swatch--sm', style: `--c:${h}`, 'aria-pressed': String(cur === h), 'aria-label': h, title: h, 'data-fk': `sw-${key}-${h.slice(1)}`,
      on: { click: () => { colorKeySet(key, h, { now: true }); renderTab({ focus: `sw-${key}-${h.slice(1)}` }); } }
    });
    const palName = inColl(D.palettes, S.config.theme.palette) ? D.palettes[S.config.theme.palette].name : '';
    return el('div', { class: 'b-cpick', id },
      el('div', { class: 'b-cpick__top' },
        el('span', { class: 'b-cpick__wellbox' },
          el('label', { class: 'b-cpick__well', title: 'Plus de couleurs' }, native),
          el('span', { class: 'b-cpick__more', 'aria-hidden': 'true', text: 'Plus de couleurs' })),
        hex,
        opts.reset || null),
      opts.note || null,
      el('p', { class: 'b-cpick__cap', text: 'Vos couleurs' }),
      el('div', { class: 'b-swatches b-swatches--sm' }, sw.mine.map(swBtn)),
      sw.orig.length ? el('p', { class: 'b-cpick__cap', text: `Couleurs de la palette ${palName}` }) : null,
      sw.orig.length ? el('div', { class: 'b-swatches b-swatches--sm' }, sw.orig.map(swBtn)) : null,
      el('p', { class: 'b-cpick__cap', text: 'Couleurs pop' }),
      el('div', { class: 'b-swatches b-swatches--sm' }, sw.pop.map(swBtn)),
      readNote(key));
  }

  // One colour as a row that opens its picker. opts: { hint, resetLabel, auto (text shown while unset) }
  function colorRow(key, label, opts = {}) {
    const set = colorKeyGet(key) != null;
    const open = S.openColor === key;
    const shown = colorKeyShown(key);
    const bodyId = 'b-crow-' + key.replace(/[^a-z0-9]+/gi, '-');
    const bad = problemsOf(key).length > 0;
    const row = el('div', { class: 'b-crow' + (open ? ' is-open' : '') + (set ? ' is-set' : ''), 'data-row-key': key });
    row.append(el('button', {
      type: 'button', class: 'b-crow__main', 'aria-expanded': String(open), 'aria-controls': open ? bodyId : null, 'data-fk': 'cr-' + key,
      on: { click: () => { S.openColor = open ? null : key; renderTab({ focus: 'cr-' + key }); } }
    },
      el('span', { class: 'b-crow__chip', style: `--c:${shown}`, 'aria-hidden': 'true' }),
      el('span', { class: 'b-crow__txt' },
        el('span', { class: 'b-crow__label', text: label }),
        el('span', { class: 'b-crow__meta' },
          el('span', { class: 'b-crow__hex', text: shown }),
          el('span', { class: 'b-crow__state', text: set ? 'Modifiée' : (opts.auto || 'Palette') }),
          el('span', { class: 'b-crow__warn b-tone--warn', hidden: bad ? null : '' }, icon('i-alert'), 'Peu lisible'))),
      icon('i-down', 'b-chev')));
    if (open) {
      const reset = set ? el('button', {
        type: 'button', class: 'b-btn b-btn--quiet b-btn--sm b-cpick__reset', 'data-fk': 'rs-' + key,
        on: { click: () => { colorKeyClear(key, { now: true }); renderTab({ focus: 'cr-' + key }); toast(opts.resetMsg || 'Couleur de la palette remise', 1600); } }
      }, icon('i-refresh'), opts.resetLabel || 'Réinitialiser') : null;
      row.append(el('div', { class: 'b-crow__body', id: bodyId },
        opts.hint ? el('p', { class: 'b-hint', text: opts.hint }) : null,
        colorPicker(key, label, { reset, note: logoGroundNote(key) })));
    }
    return row;
  }

  // Thème: the six palette colours and the four parts, in groups
  // What a colour key shows on the untouched palette (no theme.colors): the reference for « Palette » / « Auto »
  function paletteShown(key) {
    const k = String(key).split(':')[1];
    const raw = rawPalette();
    if (raw[k]) return hexOf(raw[k]);
    const z = zoneOfKey(k);
    if (!z || !D.themeColors) return null;
    try {
      const plain = D.clone(S.config);
      delete plain.theme.colors;
      const df = D.themeColors(plain).defaults[z];
      return hexOf(D.ELEMENT_ZONES[z].indexOf(k) === 0 ? df.bg : df.fg);
    } catch (e) { return null; }
  }
  function colorsGroup() {
    const groups = D.COLOR_GROUPS || [];
    const any = !!(S.config.theme.colors && Object.keys(S.config.theme.colors).length);
    const wrap = el('div', { class: 'b-colors' });
    groups.forEach((g) => {
      wrap.append(el('div', { class: 'b-cgroup', 'data-cgroup': g.id },
        el('p', { class: 'b-cgroup__t', text: g.label }),
        g.hint ? el('p', { class: 'b-hint', text: g.hint }) : null,
        // « Auto »: a colour the seller did not pick that moved to go with one she picked (a part that follows
        // her accent or her text, a text that turned light on her dark page)
        g.fields.map((f) => {
          const k = 'theme:' + f.key;
          const ref = paletteShown(k);
          return colorRow(k, f.label, { auto: ref && ref !== hexOf(colorKeyShown(k)) ? 'Auto' : 'Palette' });
        })));
    });
    if (any) {
      wrap.append(el('button', {
        type: 'button', class: 'b-btn b-btn--ghost b-btn--sm b-colors__reset', 'data-fk': 'colors-reset',
        on: {
          click: () => {
            delete S.config.theme.colors;
            S.openColor = null;
            change({ now: true });
            renderTab({ focus: 'colors-reset' });
            toast('Toutes les couleurs de la palette sont revenues', 2000);
          }
        }
      }, icon('i-refresh'), 'Réinitialiser toutes les couleurs'));
    }
    return group('b-g-theme-colors', 'Personnaliser les couleurs',
      `Changez la couleur de chaque partie de la boutique. ${guil('Réinitialiser')} remet celle de la palette.`, wrap);
  }

  // A section's « Couleurs »: its ground (Automatique / page / cartes / principale / personnalisée), its text,
  // and on the hero its button
  function sectionColorsField(sec) {
    const sid = sec.id;
    const st = sec.settings || {};
    const tc = themeCols();
    const b = tc.base;
    const v = st.bg == null ? 'auto' : (/^(page|surface|accent)$/.test(st.bg) ? st.bg : 'custom');
    const opts = D.SECTION_BG_OPTIONS || [];
    const sample = { page: b.bg, surface: b.surface, accent: b.accent };
    const pick = (val) => {
      if (val === v && val !== 'custom') return;
      if (val === 'auto') colorKeyClear(`section:${sid}:bg`, { now: true });
      else if (val === 'custom') {
        if (v !== 'custom') colorKeySet(`section:${sid}:bg`, colorKeyShown(`section:${sid}:bg`) === b.bg ? (D.mixColors ? D.mixColors(b.bg, b.accent, 0.35) : b.accent) : colorKeyShown(`section:${sid}:bg`), { now: true });
        S.openColor = `section:${sid}:bg`;
      } else colorKeySet(`section:${sid}:bg`, val, { now: true });
      if (val !== 'custom' && S.openColor === `section:${sid}:bg`) S.openColor = null;
      renderTab({ focus: `scb-${sid}-${val}` });
      updateSectionRow(sid);
    };
    const chips = el('div', { class: 'b-bgopts', role: 'group', 'aria-label': 'Couleur de fond' }, opts.map((o) => el('button', {
      type: 'button', class: 'b-bgopt', 'aria-pressed': String(o.value === v), 'data-fk': `scb-${sid}-${o.value}`,
      on: { click: () => pick(o.value) }
    },
      el('span', { class: 'b-bgopt__sw b-bgopt__sw--' + o.value, style: sample[o.value] ? `--c:${sample[o.value]}` : (o.value === 'custom' && v === 'custom' ? `--c:${hexOf(st.bg)}` : null), 'aria-hidden': 'true' }),
      el('span', { text: o.label }))));
    const out = el('div', { class: 'b-field b-scolors', role: 'group', 'aria-labelledby': `b-scl-${sid}` },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: `b-scl-${sid}`, text: 'Couleur de fond' })),
      chips,
      el('p', { class: 'b-hint', text: v === 'auto' ? `Automatique${NB}: comme le modèle (avec ${guil('Vives')}, une section sur deux est teintée).` : 'Le texte prend une couleur qui se lit bien sur ce fond. Vous pouvez la changer.' }));
    if (v === 'custom') out.append(el('div', { class: 'b-scolors__pick' }, colorPicker(`section:${sid}:bg`, 'Couleur de fond')));
    if (v !== 'auto') out.append(colorRow(`section:${sid}:fg`, 'Couleur du texte', { auto: 'Automatique', resetLabel: 'Automatique', resetMsg: 'Couleur du texte automatique' }));
    else out.append(readNote(`section:${sid}:bg`));
    if (sec.type === 'hero') {
      out.append(el('div', { class: 'b-label-row b-scolors__h' }, el('span', { class: 'b-label', text: 'Couleurs du bouton' })),
        el('p', { class: 'b-hint', text: 'Un bouton à vos couleurs est toujours plein, même avec des boutons à contour.' }),
        colorRow(`section:${sid}:buttonBg`, 'Fond du bouton', { auto: 'Automatique', resetLabel: 'Automatique', resetMsg: 'Bouton aux couleurs du modèle' }),
        colorRow(`section:${sid}:buttonText`, 'Texte du bouton', { auto: 'Automatique', resetLabel: 'Automatique', resetMsg: 'Texte du bouton automatique' }));
    }
    return out;
  }

  // Qualité › « Corriger tout »: every text that does not read takes the nearest readable shade
  function fixAllColors() {
    const n = D.fixColors ? D.fixColors(S.config) : 0;
    if (!n) return;
    change({ now: true });
    renderTab({ focus: 'fix-all' });
    toast(n > 1 ? `${n} couleurs corrigées` : '1 couleur corrigée', 2000, 'ok');
  }
  // Opens the colour of a Qualité issue (target { kind: 'theme', id: 'colors', key } or { kind: 'section', id, key })
  function openColor(key) {
    S.openColor = key;
    renderTab();
    const n = els.tp[S.tab].querySelector(`[data-fk="${CSS.escape('cr-' + key)}"]`) || els.tp[S.tab].querySelector(`[data-fk="${CSS.escape('hex-' + key)}"]`) ||
      els.tp[S.tab].querySelector(`[data-read-key="${CSS.escape(key)}"]`);
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    focusEl(n);
    pulse(n.closest('.b-crow, .b-cpick, .b-field') || n);
  }

  /* ---------- Logo (Boutique tab): store.logo, logoSize, logoPosition, showName, icon ---------- */

  const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,.svg';
  const LOGO_LIM = () => D.LOGO_LIMITS || { side: 600, icon: 192, chars: 2000000 };
  function brandNow() { return D.brand ? D.brand(S.config) : { name: S.config.store.name || '', initial: 'B', logo: null, icon: null, iconFrom: 'initial', size: 'M', position: 'left', positionSet: false, showName: false }; }
  function storeSet(key, value, msg) {
    const st = S.config.store;
    if (value === undefined) { if (!Object.prototype.hasOwnProperty.call(st, key)) return; delete st[key]; }
    else if (st[key] === value) return;
    else st[key] = value;
    change({ now: true });
    renderTab({ focus: S.brandFocus || null });
    S.brandFocus = null;
    if (msg) toast(msg, 1800);
  }

  // An SVG file gets a size of 600 px on its long side before it is drawn (a file with only a viewBox has none)
  function svgWithSize(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('svg');
    const num = (v) => { const s = String(v || '').trim(); const n = parseFloat(s); return isFinite(n) && n > 0 && !/%$/.test(s) ? n : 0; };
    let w = num(svg.getAttribute('width'));
    let h = num(svg.getAttribute('height'));
    const vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const vw = vb.length === 4 && vb[2] > 0 ? vb[2] : 0;
    const vh = vb.length === 4 && vb[3] > 0 ? vb[3] : 0;
    if (!w || !h) {
      const r = vw && vh ? vw / vh : (w && h ? w / h : 1);
      if (w) h = w / r; else if (h) w = h * r; else { w = vw || 300; h = vh || w / r; }
    }
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const s = LOGO_LIM().side / Math.max(w, h);
    svg.setAttribute('width', String(Math.max(1, Math.round(w * s))));
    svg.setAttribute('height', String(Math.max(1, Math.round(h * s))));
    return new XMLSerializer().serializeToString(svg);
  }
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('size')));
      img.onerror = () => reject(new Error('decode'));
      img.src = src;
    });
  }
  // The box around what is drawn: transparent margins, or a plain background (the four corners alike) trimmed
  function trimBox(ctx, w, h) {
    let d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    const near = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t && Math.abs(a[3] - b[3]) <= t;
    const bg = corners.every((c) => near(c, corners[0], 10)) ? corners[0] : null;
    const empty = bg && bg[3] < 8
      ? (i) => d[i + 3] < 8
      : bg ? (i) => Math.abs(d[i] - bg[0]) <= 14 && Math.abs(d[i + 1] - bg[1]) <= 14 && Math.abs(d[i + 2] - bg[2]) <= 14 && Math.abs(d[i + 3] - bg[3]) <= 14
        : null;
    if (!empty) return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (empty((y * w + x) * 4)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null; // nothing drawn at all: keep the image as it is
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // Draw an image at most `side` px on its long side, trimmed; opaque: a JPEG source stays a JPEG
  function drawLogo(img, side, opaque) {
    const s0 = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    let w = Math.max(1, Math.round(img.naturalWidth * s0));
    let h = Math.max(1, Math.round(img.naturalHeight * s0));
    let c = document.createElement('canvas');
    c.width = w; c.height = h;
    let ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const box = trimBox(ctx, w, h);
    if (box) {
      // Draw again from the source, trimmed, so the logo keeps its 600 px of detail
      // never above the source's own pixels: a small mark stays its real size (and Qualité can say it is small)
      const sw = box.w / s0, sh = box.h / s0;
      const k = Math.min(side / Math.max(sw, sh), 1);
      w = Math.max(1, Math.round(sw * k)); h = Math.max(1, Math.round(sh * k));
      c = document.createElement('canvas');
      c.width = w; c.height = h;
      ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, box.x / s0, box.y / s0, sw, sh, 0, 0, w, h);
    }
    if (opaque) {
      const o = document.createElement('canvas');
      o.width = w; o.height = h;
      const octx = o.getContext('2d');
      octx.fillStyle = '#FFFFFF';
      octx.fillRect(0, 0, w, h);
      octx.drawImage(c, 0, 0);
      return o.toDataURL('image/jpeg', 0.9);
    }
    let url = c.toDataURL('image/png');
    // A heavy PNG (a photo-like logo): WebP keeps the transparency at a fraction of the weight
    if (url.length > 700000) {
      const webp = c.toDataURL('image/webp', 0.9);
      if (/^data:image\/webp/.test(webp) && webp.length < url.length) url = webp;
    }
    return url;
  }
  async function fileSource(file) {
    const isSvg = /svg/i.test(file.type || '') || /\.svg$/i.test(file.name || '');
    if (isSvg) {
      const text = await file.text();
      return { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgWithSize(text)), opaque: false, revoke: null };
    }
    if (file.type && !/^image\//.test(file.type)) throw new Error('type');
    const url = URL.createObjectURL(file);
    return { src: url, opaque: /jpe?g/i.test(file.type || ''), revoke: url };
  }
  // A logo file → a data URL (PNG with its transparency, or JPEG): see the contract in README « Le logo de la boutique »
  async function readLogo(file) {
    if (!file) throw new Error('none');
    const src = await fileSource(file);
    try {
      const img = await loadImg(src.src);
      let url = drawLogo(img, LOGO_LIM().side, src.opaque);
      if (url.length > LOGO_LIM().chars) url = drawLogo(img, 360, src.opaque);
      if (url.length > LOGO_LIM().chars) throw new Error('heavy');
      return url;
    } finally { if (src.revoke) URL.revokeObjectURL(src.revoke); }
  }
  // A square tab icon (192 px, PNG): the image trimmed and centred, transparent around it
  // opts.crop: a logo wider than LOGO_LIMITS.iconWide (1.5:1) gives the square on its left (most wordmarks
  // start with their mark or their first letter), trimmed again; a square-ish one is shrunk whole
  async function squareIcon(source, opts = {}) {
    const img = await loadImg(source);
    const side = LOGO_LIM().icon || 192;
    let trimmed = await loadImg(drawLogo(img, 600, false));
    const wide = (LOGO_LIM().iconWide || 1.5);
    if (opts.crop && trimmed.naturalWidth / trimmed.naturalHeight > wide) {
      const hh = trimmed.naturalHeight;
      const cc = document.createElement('canvas');
      cc.width = hh; cc.height = hh;
      cc.getContext('2d').drawImage(trimmed, 0, 0, hh, hh, 0, 0, hh, hh);
      trimmed = await loadImg(drawLogo(await loadImg(cc.toDataURL('image/png')), 600, false));
    }
    const c = document.createElement('canvas');
    c.width = side; c.height = side;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // a little room around it, so it does not touch the edges of the square
    const k = side * 0.9 / Math.max(trimmed.naturalWidth, trimmed.naturalHeight);
    const w = trimmed.naturalWidth * k, h = trimmed.naturalHeight * k;
    ctx.drawImage(trimmed, (side - w) / 2, (side - h) / 2, w, h);
    return c.toDataURL('image/png');
  }
  async function readIcon(file) {
    const src = await fileSource(file);
    try { return await squareIcon(src.src); } finally { if (src.revoke) URL.revokeObjectURL(src.revoke); }
  }

  // « Pas de logo ? Créez-en un simple »: the store name written in one of the store fonts and a colour, drawn to a PNG
  function makerColors() {
    const pal = themeCols().base || {};
    const list = [
      { id: 'accent', label: 'Principale', hex: pal.accent || '#111111' },
      { id: 'text', label: 'Texte', hex: pal.text || '#111111' },
      { id: 'black', label: 'Noir', hex: '#111111' },
      { id: 'white', label: 'Blanc', hex: '#FFFFFF' }
    ];
    // The palette's text and black can be the same: keep one
    return list.filter((c, i) => list.findIndex((x) => x.hex.toUpperCase() === c.hex.toUpperCase()) === i);
  }
  function fontReady(fp, text) {
    const link = ensureFontLink(fp);
    const css = `${fp.display.weight} 120px ${fp.display.family}`;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const loaded = link && !link.sheet ? new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); }) : Promise.resolve();
    return Promise.race([loaded.then(() => (document.fonts && document.fonts.load ? document.fonts.load(css, text) : null)).catch(() => null), wait(2500)]);
  }
  async function textLogo(o) {
    const fp = (inColl(D.fontPairs, o.font) ? D.fontPairs[o.font] : D.fontPairs[0]);
    const text = (o.upper ? o.text.toLocaleUpperCase('fr') : o.text).trim();
    if (!text) throw new Error('empty');
    await fontReady(fp, text);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    let size = 120;
    const font = (px) => `${fp.display.weight} ${px}px ${fp.display.family}`;
    ctx.font = font(size);
    const room = LOGO_LIM().side - 24;
    // One line while the logo stays under 4.5:1 (Qualité flags 6:1), else two lines split at the space
    // nearest the middle (« Les Délices / de Mariam »), centred
    const oneW = ctx.measureText(text).width;
    let lines = [text];
    const words = text.split(/\s+/);
    if (words.length > 1 && oneW / (size * 1.15) > 4.5) {
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || w < best.w) best = { w, l: [a, b] };
      }
      lines = best.l;
    }
    const widest = () => Math.max.apply(null, lines.map((l) => ctx.measureText(l).width));
    if (widest() > room) { size = Math.max(24, Math.floor(size * room / widest())); ctx.font = font(size); }
    const ms = lines.map((l) => ctx.measureText(l));
    const asc = Math.max.apply(null, ms.map((m) => m.actualBoundingBoxAscent || size * 0.8));
    const desc = Math.max.apply(null, ms.map((m) => m.actualBoundingBoxDescent || size * 0.25));
    const gap = Math.round(size * 0.08);
    const lineH = asc + desc;
    const pad = Math.round(size * 0.12);
    const textW = Math.max.apply(null, ms.map((m) => m.width));
    c.width = Math.ceil(Math.min(LOGO_LIM().side, textW + pad * 2));
    c.height = Math.ceil(lineH * lines.length + gap * (lines.length - 1) + pad * 2);
    // a single word too long for 6:1 (« Kouassibijouterie »): a little more room above and below
    const maxRatio = (D.LOGO_LIMITS && D.LOGO_LIMITS.wide) || 6;
    let top = pad;
    if (c.width / c.height > maxRatio - 0.5) { const hh = Math.ceil(c.width / (maxRatio - 0.5)); top += Math.floor((hh - c.height) / 2); c.height = hh; }
    const ctx2 = c.getContext('2d');
    ctx2.font = font(size);
    ctx2.fillStyle = o.color;
    ctx2.textBaseline = 'alphabetic';
    ctx2.textAlign = lines.length > 1 ? 'center' : 'left';
    lines.forEach((l, i) => ctx2.fillText(l, lines.length > 1 ? c.width / 2 : pad, top + asc + i * (lineH + gap)));
    return c.toDataURL('image/png');
  }

  // One file button (a <label> around a hidden input, so the phone offers the camera and the gallery)
  // onError(e): what to say when the file cannot be used (default: the logo's message)
  function fileBtn(id, label, accept, onFile, cls, onError) {
    const file = el('input', { class: 'b-sr', type: 'file', accept, id, 'data-fk': id });
    const txt = el('span', { text: label });
    const btn = el('label', { class: 'b-btn b-btn--sm b-filebtn ' + (cls || 'b-btn--ghost') }, icon('i-upload'), txt, file);
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      btn.classList.add('is-busy');
      txt.textContent = 'Préparation…';
      Promise.resolve().then(() => onFile(f)).then(() => {
        btn.classList.remove('is-busy');
        txt.textContent = label;
      }, (e) => {
        btn.classList.remove('is-busy');
        txt.textContent = label;
        if (onError) { onError(e); return; }
        toast(e && e.message === 'heavy' ? 'Ce logo est trop lourd, même réduit. Essayez une image plus simple (PNG ou JPEG).' : 'Cette image n’a pas pu être lue. Essayez un fichier PNG, JPEG, WebP ou SVG.', 4200, 'err');
      }).then(() => { file.value = ''; });
    });
    return btn;
  }
  // The logo (or the name in the store's font) on a light and on a dark chip: does it read on both?
  function logoChips(b) {
    const fp = inColl(D.fontPairs, S.config.theme.fonts) ? D.fontPairs[S.config.theme.fonts] : null;
    // Without a logo the name is written in the store's heading font (the seller's own, theme.typography, included)
    const tyl = S.config.theme.typography ? typoNow() : null;
    const chip = (tone, label) => el('span', { class: 'b-logochip b-logochip--' + tone },
      b.logo ? el('img', { src: b.logo, alt: '' })
        : el('span', { class: 'b-logochip__name', style: tyl ? `font-family:${tyl.displayStack};font-weight:${tyl.weight};text-transform:${tyl.upper ? 'uppercase' : 'none'}` : (fp ? `font-family:${fp.display.family};font-weight:${fp.display.weight}` : null), text: b.name || 'Votre boutique' }),
      el('span', { class: 'b-logochip__tag', text: label }));
    return el('div', { class: 'b-logochipsbox' },
      el('div', { class: 'b-logochips', role: 'img', 'aria-label': b.logo ? 'Votre logo sur un fond clair et sur un fond foncé' : 'Sans logo, le nom de votre boutique est écrit avec la police du thème' },
        chip('light', 'Fond clair'), chip('dark', 'Fond foncé')),
      b.logo ? el('p', { class: 'b-hint b-logochips__cap', text: 'Si votre logo disparaît sur l’un de ces fonds, il se verra mal sur un fond de cette couleur.' }) : null);
  }
  function logoMaker() {
    const st = S.config.store;
    const mk = S.logoMaker || (S.logoMaker = { open: false, text: '', font: S.config.theme.fonts, color: null, upper: false });
    if (!mk.text) mk.text = String(st.name || '').trim().slice(0, 40);
    const colors = makerColors();
    // Until she picks one: the first colour that shows on the header and the footer of her store (3:1),
    // else the one that shows best (an accent text on Treichville's accent-tinted footer would fade)
    if (!colors.some((c) => c.id === mk.color)) {
      let grounds = [];
      try { grounds = D.logoGrounds ? D.logoGrounds(S.config).map((g) => g.bg) : []; } catch (e) { grounds = []; }
      const score = (hex) => (grounds.length ? Math.min.apply(null, grounds.map((g) => contrastOf(hex, g))) : 21);
      const good = colors.find((c) => score(c.hex) >= 3);
      mk.color = (good || colors.slice().sort((a, b) => score(b.hex) - score(a.hex))[0]).id;
    }
    const prev = el('div', { class: 'b-maker__prev' + (mk.color === 'white' ? ' is-dark' : ''), 'aria-live': 'polite' });
    const draw = () => {
      const hex = (colors.find((c) => c.id === mk.color) || colors[0]).hex;
      prev.classList.toggle('is-dark', mk.color === 'white');
      const token = (S.makerToken = (S.makerToken || 0) + 1);
      textLogo({ text: mk.text || 'Ma boutique', font: mk.font, color: hex, upper: mk.upper }).then((url) => {
        if (token !== S.makerToken) return;
        prev.replaceChildren(el('img', { src: url, alt: `Aperçu${NB}: ${mk.text || 'Ma boutique'}` }));
        mk.url = url;
      }).catch(() => { prev.replaceChildren(el('span', { class: 'b-hint', text: 'Écrivez le nom à afficher.' })); mk.url = null; });
    };
    const input = el('input', { class: 'b-input', id: 'b-f-maker-text', type: 'text', maxlength: 40, value: mk.text, autocomplete: 'off', 'data-fk': 'b-f-maker-text' });
    input.addEventListener('input', () => { mk.text = input.value; later('maker', draw, 180); });
    const fonts = el('div', { class: 'b-maker__fonts', role: 'group', 'aria-label': 'Police' }, D.fontPairs.map((fp) => {
      ensureFontLink(fp);
      return el('button', {
        type: 'button', class: 'b-maker__font', 'aria-pressed': String(mk.font === fp.id), 'data-fk': 'maker-font-' + fp.id, 'aria-label': `Police ${fp.name}`,
        style: `font-family:${fp.display.family};font-weight:${fp.display.weight}`,
        on: { click: (e) => { mk.font = fp.id; fonts.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget))); draw(); } }
      }, 'Aa');
    }));
    const cols = el('div', { class: 'b-maker__cols', role: 'group', 'aria-label': 'Couleur' }, colors.map((c) => el('button', {
      type: 'button', class: 'b-maker__col', 'aria-pressed': String(mk.color === c.id), 'data-fk': 'maker-col-' + c.id, title: c.label,
      on: { click: (e) => { mk.color = c.id; cols.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget))); draw(); } }
    }, el('span', { class: 'b-maker__sw', style: `background:${c.hex}`, 'aria-hidden': 'true' }), el('span', { text: c.label }))));
    const upper = el('button', {
      type: 'button', class: 'b-switch b-switch--flat', 'aria-pressed': String(!!mk.upper), 'data-fk': 'maker-upper',
      on: { click: (e) => { mk.upper = !mk.upper; e.currentTarget.setAttribute('aria-pressed', String(mk.upper)); draw(); } }
    }, el('span', { class: 'b-switch__txt' }, el('span', { class: 'b-switch__lbl', text: 'En majuscules' })), el('span', { class: 'b-switch__ui', 'aria-hidden': 'true' }));
    const use = el('button', {
      type: 'button', class: 'b-btn b-btn--primary b-btn--sm', 'data-fk': 'maker-use',
      on: { click: () => {
        if (!mk.url) { toast('Écrivez d’abord le nom à afficher.', 2400, 'warn'); return; }
        S.config.store.logo = mk.url;
        // A text logo already says the name: the logo alone
        S.config.store.showName = false;
        mk.open = false;
        change({ now: true });
        renderTab({ focus: 'b-f-logo' });
        toast('Logo créé et ajouté');
      } }
    }, icon('i-check'), 'Utiliser ce logo');
    const det = el('details', { class: 'b-maker', id: 'b-maker', open: mk.open ? '' : null },
      el('summary', { class: 'b-maker__sum', 'data-fk': 'maker-open' }, icon('i-sparkle'), el('span', { text: 'Pas de logo' + NB + '? Créez-en un simple' }), icon('i-down', 'b-maker__chev')),
      el('div', { class: 'b-maker__body' },
        el('div', { class: 'b-field' }, el('div', { class: 'b-label-row' }, el('label', { class: 'b-label', for: 'b-f-maker-text', text: 'Texte du logo' })), input),
        el('div', { class: 'b-field' }, el('span', { class: 'b-label', text: 'Police' }), fonts),
        el('div', { class: 'b-field' }, el('span', { class: 'b-label', text: 'Couleur' }), cols),
        upper, prev, use));
    det.addEventListener('toggle', () => { mk.open = det.open; if (det.open && !mk.url) draw(); });
    if (mk.open) draw();
    return det;
  }
  function iconField(b) {
    const st = S.config.store;
    const own = !!(D.brand && st.icon && b.iconFrom === 'icon');
    const pic = (px) => el('span', { class: 'b-fav b-fav--' + px, style: b.iconFrom === 'initial' ? `--fa:${pal().accent || '#111111'};--fo:${pal().onAccent || '#FFFFFF'}` : null },
      b.icon ? el('img', { src: b.icon, alt: '' }) : el('span', { text: b.initial }));
    const from = { icon: 'votre icône.', logo: 'votre logo, réduit dans un carré.', initial: b.logo ? `l’initiale de votre boutique, dans votre couleur principale (votre logo est trop large pour un si petit carré${NB}: ${guil('Créer depuis le logo')} en garde le début).` : 'l’initiale de votre boutique, dans votre couleur principale.' }[b.iconFrom];
    return el('div', { class: 'b-field', role: 'group', 'aria-labelledby': 'b-f-icon-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: 'b-f-icon-l', text: 'Icône de l’onglet' })),
      el('div', { class: 'b-favrow' },
        el('span', { class: 'b-favtab', 'aria-hidden': 'true' }, pic(16), el('span', { class: 'b-favtab__name', text: b.name || 'Ma boutique' })),
        pic(48)),
      el('div', { class: 'b-img__actions b-img__actions--row' },
        fileBtn('b-f-icon', own ? 'Changer l’icône' : 'Importer une icône', LOGO_ACCEPT, (f) => readIcon(f).then((url) => { S.brandFocus = 'b-f-icon'; storeSet('icon', url, 'Icône ajoutée'); })),
        !own && b.logo ? el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'b-f-icon-make',
          on: { click: () => squareIcon(b.logo, { crop: true }).then((url) => { S.brandFocus = 'b-f-icon-rm'; storeSet('icon', url, 'Icône créée depuis le logo'); }).catch(() => toast('L’icône n’a pas pu être créée.', 3000, 'err')) } }, icon('i-sparkle'), 'Créer depuis le logo') : null,
        own ? el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'b-f-icon-rm', on: { click: () => { S.brandFocus = 'b-f-icon'; storeSet('icon', null, 'Icône retirée'); } } }, icon('i-trash'), 'Retirer') : null),
      el('p', { class: 'b-hint', text: `Le petit carré dans l’onglet du navigateur et sur l’écran d’accueil du téléphone. Maintenant${NB}: ${from}` }));
  }
  // Does a transparent logo show on the grounds it is drawn on (the header, every page and the checkout;
  // the footer)? JEERE_DATA.logoTone measures its ink once (async, cached); logoChecks lists the grounds
  // under 1.6:1. The note shows under the logo chips, inside the En-tête / Pied de page pickers, and
  // Qualité has the same warning (validate reads the measured tone).
  function pal() {
    try { if (D.themeColors) return D.themeColors(S.config).base; } catch (e) { /* older data.js */ }
    return ((inColl(D.palettes, S.config.theme.palette) ? D.palettes[S.config.theme.palette] : D.palettes[0]) || {}).colors || {};
  }
  function logoProblems() { try { return D.logoChecks ? D.logoChecks(S.config) : []; } catch (e) { return []; } }
  // Measures the logo once; when the answer comes, the open tab is drawn again (notes, Qualité)
  function watchLogoTone() {
    const b = brandNow();
    if (!b.logo || !D.logoTone || (D.logoToneOf && D.logoToneOf(b.logo) !== undefined)) return;
    D.logoTone(b.logo).then(() => {
      // nothing to say (the usual case): nothing is drawn again
      if (!S.open || brandNow().logo !== b.logo || !logoProblems().length) return;
      if (S.tab !== 'qualite') renderTab();
      refreshMeta();
    });
  }
  function toneText(list) {
    const where = list.map((x) => x.label);
    const light = list[0].light;
    return `Votre logo se voit mal sur le fond ${where.length > 1 ? where.join(' et ') : where[0]}. Importez une version ${light ? 'foncée' : 'claire'} de votre logo, ou changez ${where.length > 1 ? 'ces couleurs' : 'cette couleur'} dans Thème.`;
  }
  // « Votre logo se voit mal… »: under the chips, empty until the logo has been measured
  function toneNote() {
    const n = el('div', { class: 'b-lognote b-tone--warn', id: 'b-logo-tone', hidden: '' });
    const list = logoProblems();
    if (list.length) {
      n.append(icon('i-alert'), el('span', { text: toneText(list) }));
      const keys = list.map((x) => x.key);
      n.append(el('span', { class: 'b-lognote__acts' }, keys.map((k) => el('button', {
        type: 'button', class: 'b-btn b-btn--sm b-btn--ghost', 'data-fk': 'logo-ground-' + k.split(':')[1],
        on: { click: () => { setTab('theme', { top: true }); requestAnimationFrame(() => openColor(k)); } }
      }, k === 'theme:headerBg' ? 'Couleur de l’en-tête' : 'Couleur du pied de page'))));
      n.hidden = false;
    }
    return n;
  }
  // Inside the En-tête / Pied de page ground pickers: the same warning for that ground
  function logoGroundNote(key) {
    if (key !== 'theme:headerBg' && key !== 'theme:footerBg') return null;
    const hit = logoProblems().filter((x) => x.key === key);
    const n = el('p', { class: 'b-lognote b-tone--warn', 'data-logo-note': key, hidden: hit.length ? null : '' });
    if (hit.length) n.append(icon('i-alert'), el('span', { text: `Votre logo se voit mal sur ce fond. Choisissez une couleur ${hit[0].light ? 'plus foncée' : 'plus claire'}, ou importez une version ${hit[0].light ? 'foncée' : 'claire'} de votre logo.` }));
    return n;
  }
  function brandGroup() {
    const b = brandNow();
    const st = S.config.store;
    const has = !!b.logo;
    const dims = has && D.imageSize ? D.imageSize(b.logo) : null;
    const logoField = el('div', { class: 'b-field', role: 'group', 'aria-labelledby': 'b-f-logo-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: 'b-f-logo-l', text: 'Logo' }),
        dims ? el('span', { class: 'b-count', text: `${dims.width} × ${dims.height} px` }) : null),
      logoChips(b),
      el('div', { class: 'b-img__actions b-img__actions--row' },
        fileBtn('b-f-logo', has ? 'Changer le logo' : 'Importer mon logo', LOGO_ACCEPT, (f) => readLogo(f).then((url) => {
          const first = !st.logo;
          S.brandFocus = 'b-f-logo';
          st.logo = url;
          // A first logo shows alone (most logos already say the name)
          if (first && !Object.prototype.hasOwnProperty.call(st, 'showName')) st.showName = false;
          change({ now: true });
          renderTab({ focus: 'b-f-logo' });
          toast('Logo ajouté');
        }), has ? 'b-btn--ghost' : 'b-btn--primary'),
        has ? el('button', { type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': 'b-f-logo-rm', on: { click: () => { S.brandFocus = 'b-f-logo'; storeSet('logo', null, 'Logo retiré : le nom de la boutique est affiché'); } } }, icon('i-trash'), 'Retirer') : null),
      has ? toneNote() : null,
      el('p', { class: 'b-hint', text: has
        ? 'Il remplace le nom en haut de chaque page, au paiement et en bas de la boutique.'
        : `Une image de votre logo, idéalement sur fond transparent${NB}: nous la réduisons et retirons les bords vides.` }));

    const posCur = b.position;
    const parts = [logoField];
    if (!has) parts.push(logoMaker());
    if (has) {
      const sizes = D.LOGO_SIZE_OPTIONS || [{ value: 'S', label: 'Petit' }, { value: 'M', label: 'Moyen' }, { value: 'L', label: 'Grand' }];
      parts.push(el('div', { class: 'b-field' }, el('span', { class: 'b-label', id: 'b-f-logo-size-l', text: 'Taille' }),
        el('div', { 'aria-labelledby': 'b-f-logo-size-l', role: 'group' },
          segmented(sizes, typeof b.size === 'string' ? b.size : null, (v, l) => storeSet('logoSize', v, `Logo${NB}: ${l.toLowerCase()}`), 'logo-size'))));
    }
    const positions = D.LOGO_POSITIONS || [{ value: 'left', label: 'À gauche' }, { value: 'center', label: 'Au centre' }];
    parts.push(el('div', { class: 'b-field' }, el('span', { class: 'b-label', id: 'b-f-logo-pos-l', text: has ? 'Place du logo' : 'Place du nom' }),
      el('div', { 'aria-labelledby': 'b-f-logo-pos-l', role: 'group' },
        segmented(positions, posCur, (v, l) => {
          const def = D.LOGO_DEFAULT_POSITION && D.LOGO_DEFAULT_POSITION[S.config.template];
          // The template's own place is no choice to keep: a later template change brings its own
          storeSet('logoPosition', v === def ? undefined : v, `${has ? 'Logo' : 'Nom'}${NB}: ${l.toLowerCase()}`);
        }, 'logo-pos')),
      el('p', { class: 'b-hint', text: 'Dans l’en-tête de votre boutique, sur téléphone et sur ordinateur.' })));
    if (has) {
      parts.push(el('div', { class: 'b-switches' }, el('button', {
        type: 'button', class: 'b-switch', 'aria-pressed': String(!!b.showName), 'data-fk': 'logo-name',
        on: { click: () => storeSet('showName', !b.showName, b.showName ? 'Le logo seul' : 'Le nom à côté du logo') }
      }, el('span', { class: 'b-switch__txt' }, el('span', { class: 'b-switch__lbl', text: 'Afficher le nom à côté du logo' }),
        el('span', { class: 'b-switch__note', text: 'Si votre logo est un dessin, sans le nom écrit dedans.' })),
      el('span', { class: 'b-switch__ui', 'aria-hidden': 'true' }))));
    }
    parts.push(iconField(b));
    return group('b-g-brand', 'Logo et icône', null, parts);
  }

  /* ---------- Boutique tab ---------- */

  function storeAcc(key) {
    return {
      get: () => S.config.store[key],
      set: (v, o) => { S.config.store[key] = v; change(o); }
    };
  }
  function renderBoutique(tp) {
    const st = S.config.store;
    tp.append(tabHead('Boutique', 'Les informations de votre boutique et les paiements que vous acceptez.'));

    const waId = 'b-f-store-whatsapp';
    const waHint = el('p', { class: 'b-hint', id: waId + '-h' });
    const updWa = () => {
      const w = S.config.store.whatsapp;
      waHint.textContent = w
        ? `Vos clients vous écriront au ${prettyPhone(w)}.`
        : 'Le numéro sur lequel vous recevez les commandes. Nous ajoutons l’indicatif +225 si vous l’oubliez.';
    };
    updWa();
    const wa = el('input', {
      class: 'b-input', id: waId, type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '07 07 12 34 56',
      'data-fk': waId, value: st.whatsapp || '', 'aria-describedby': waId + '-h'
    });
    wa.addEventListener('input', () => { S.config.store.whatsapp = D.normalizeWhatsapp(wa.value); change(); updWa(); });
    wa.addEventListener('change', () => { wa.value = S.config.store.whatsapp; });

    tp.append(group('b-g-store', 'Informations', null,
      textField({ key: 'name', label: 'Nom de la boutique', type: 'text', max: 40, placeholder: 'Awa Beauté' }, storeAcc('name'), 'b-f-store-name', { autocomplete: 'organization' }),
      textField({ key: 'tagline', label: 'Slogan', type: 'text', max: 80, placeholder: 'Soins naturels faits à Abidjan' }, storeAcc('tagline'), 'b-f-store-tagline',
        { hint: 'Une phrase courte, affichée en bas de votre boutique.' }),
      el('div', { class: 'b-field' },
        el('div', { class: 'b-label-row' }, el('label', { class: 'b-label', for: waId, text: 'Numéro WhatsApp' })),
        wa, waHint),
      textField({ key: 'city', label: 'Ville', type: 'text', max: 40, placeholder: 'Abidjan' }, storeAcc('city'), 'b-f-store-city')));

    tp.append(brandGroup());

    const pays = el('div', { class: 'b-switches' });
    D.PAYMENTS.forEach((pm) => {
      pays.append(el('button', {
        type: 'button', class: 'b-switch', 'aria-pressed': String(!!S.config.payments[pm.key]), 'data-fk': 'pay-' + pm.key,
        on: {
          click: (e) => {
            const b = e.currentTarget;
            const on = !S.config.payments[pm.key];
            S.config.payments[pm.key] = on;
            b.setAttribute('aria-pressed', String(on));
            change({ now: true });
          }
        }
      },
        el('span', { class: 'b-switch__txt' }, el('span', { class: 'b-switch__lbl', text: pm.label }), PAY_NOTES[pm.key] ? el('span', { class: 'b-switch__note', text: PAY_NOTES[pm.key] }) : null),
        el('span', { class: 'b-switch__ui', 'aria-hidden': 'true' })));
    });
    tp.append(group('b-g-payments', 'Moyens de paiement', 'Proposés à vos clients sur la page Paiement, et écrits en bas de votre boutique. Activez au moins un moyen.', pays));

    tp.append(pagesGroup());

    tp.append(group('b-g-restart', 'Changer de point de départ', `Votre boutique reste enregistrée dans ce navigateur${NB}: vous pourrez la reprendre.`,
      el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--block', 'data-fk': 'restart', on: { click: () => showStart() } },
        icon('i-back'), 'Revenir à l’écran de départ')));
  }

  // « Vos pages »: the seller's own pages, shown in the preview from here; they are written in the dashboard
  function pagesGroup() {
    const own = customPages();
    let content;
    if (own.length) {
      content = el('ul', { class: 'b-pglist' });
      own.forEach((pg) => {
        const where = pg.inMenu && pg.inFooter ? ['Menu', 'pied de page'] : [pg.inMenu ? 'Menu' : null, pg.inFooter ? 'Pied de page' : null].filter(Boolean);
        const shown = S.page === 'page' && S.pageId === pg.id;
        const hasTitle = !!String(pg.title || '').trim();
        content.append(el('li', null, el('button', {
          type: 'button', class: 'b-pgrow', id: 'b-pg-' + pg.id, 'data-pgid': pg.id, 'data-fk': 'pg-' + pg.id, 'aria-current': shown ? 'page' : null,
          on: { click: () => viewCustomPage(pg.id) }
        },
          el('span', { class: 'b-item__ico', 'aria-hidden': 'true' }, icon('i-pages')),
          el('span', { class: 'b-pgrow__txt' },
            el('span', { class: 'b-pgrow__name' + (hasTitle ? '' : ' is-empty'), text: pageTitle(pg) }),
            el('span', { class: 'b-pgrow__meta' },
              el('span', { class: 'b-pgrow__where', text: where.length ? where.join(' et ') : 'Ni menu ni pied de page' }),
              el('span', { class: 'b-pgrow__slug', text: '/pages/' + (pg.slug || '') }))),
          el('span', { class: 'b-pgrow__go' }, icon('i-eye'), el('span', { text: 'Voir' })))));
      });
    } else {
      content = el('p', { class: 'b-empty b-empty--box', text: `Aucune page pour l’instant. Ajoutez ${guil('À propos')} ou ${guil('Contact')} dans le tableau de bord.` });
    }
    return group('b-g-pages', 'Vos pages', `Les pages de votre menu et de votre pied de page. Choisissez-en une pour la voir dans l’aperçu${NB}: son texte se modifie dans le tableau de bord.`,
      content,
      el('a', { class: 'b-btn b-btn--ghost b-btn--block b-pgmanage', href: PAGES_URL, 'data-leave': true, 'data-fk': 'pg-manage' },
        icon('i-pages'), 'Gérer les pages', icon('i-arrow')));
  }
  function viewCustomPage(id) {
    if (!findCustomPage(id)) return;
    if (isMobile()) {
      showPage('page', id);
      setView('preview');
      scrollPreviewTop();
    } else showPage('page', id);
  }

  /* ---------- Qualité tab ---------- */

  // The meaning of a quality result: green approved, red if something must be fixed, orange otherwise
  const scoreTone = (v) => (v.status === 'APPROUVÉ' ? 'ok' : ((v.issues || []).some((i) => i.level === 'error') ? 'err' : 'warn'));
  function renderQuality(tp) {
    const v = D.validate(S.config);
    const ok = v.status === 'APPROUVÉ';
    const tone = scoreTone(v);
    tp.append(tabHead('Qualité', 'Nous relisons votre fiche boutique avant publication, comme le fera Jeere.'));
    tp.append(el('div', { class: 'b-score b-tone--' + tone + (ok ? ' is-ok' : '') },
      el('div', { class: 'b-score__top' },
        el('p', { class: 'b-score__num' }, el('strong', { text: String(v.score) }), el('span', { text: '/100' })),
        el('span', { class: 'b-status b-tone--' + tone + (ok ? ' b-status--ok' : '') }, icon(ok ? 'i-check' : (tone === 'err' ? 'i-x' : 'i-alert'), 'b-status__ico'), v.status)),
      el('div', { class: 'b-meter', role: 'img', 'aria-label': `Score${NB}: ${v.score} sur 100` }, el('i', { style: `width:${v.score}%` })),
      el('p', { class: 'b-score__text', text: ok ? `Votre fiche est prête${NB}: elle pourrait être publiée telle quelle.`
        : (v.unreadable && !(v.issues || []).some((i) => i.level === 'error')
          ? `Presque prête${NB}: ${v.unreadable > 1 ? 'des couleurs se lisent' : 'une couleur se lit'} très mal. Vos clients ne pourraient pas lire votre boutique${NB}: ${guil('Corriger')} choisit une teinte proche qui se lit bien.`
          : 'Corrigez les points ci-dessous avant de publier.') })));

    if (!v.issues.length) {
      tp.append(el('p', { class: 'b-empty b-empty--box', text: 'Rien à signaler. Votre boutique est prête.' }));
    }
    let k = 0;
    ISSUE_GROUPS.forEach((g) => {
      const items = v.issues.filter((i) => i.level === g.level);
      if (!items.length) return;
      const ul = el('ul', { class: 'b-issues' });
      items.forEach((iss) => {
        const fk = 'iss-' + (k++);
        const fix = iss.fix && iss.fix.key ? el('button', {
          type: 'button', class: 'b-btn b-btn--sm b-issue__fix', 'data-fk': fk + '-fix', 'aria-label': `Corriger${NB}: ${iss.message}`,
          on: { click: () => { colorKeySet(iss.fix.key, iss.fix.value, { now: true }); renderTab({ focus: 'fix-all' }); toast(`Couleur corrigée${NB}: ${iss.fix.value}`, 1800, 'ok'); } }
        }, icon('i-check'), 'Corriger') : null;
        ul.append(el('li', { class: fix ? 'has-fix' : null }, el('button', { type: 'button', class: 'b-issue b-issue--' + g.level, 'data-fk': fk, on: { click: () => jumpTo(iss.target) } },
          icon(g.icon, 'b-issue__ico'), el('span', { class: 'b-issue__msg', text: iss.message }), icon('i-arrow', 'b-issue__go')), fix));
      });
      const fixes = items.filter((i) => i.fix && i.fix.key).length;
      tp.append(el('section', { class: 'b-issgroup', 'aria-label': g.title },
        el('h3', { class: 'b-group__title' }, g.title, el('span', { class: 'b-issgroup__n b-tone--' + ISSUE_TONE[g.level], text: String(items.length) })),
        fixes ? el('div', { class: 'b-fixall' },
          el('p', { class: 'b-hint', text: fixes > 1 ? `${fixes} couleurs se lisent mal.` : 'Une couleur se lit mal.' }),
          el('button', { type: 'button', class: 'b-btn b-btn--primary b-btn--sm', 'data-fk': 'fix-all', on: { click: fixAllColors } }, icon('i-check'), fixes > 1 ? 'Corriger tout' : 'Corriger')) : null,
        ul));
    });
    tp.append(el('p', { class: 'b-foot-note' }, icon('i-info'), el('span', { text: `Cette relecture est faite par du code simple, sans IA${NB}: elle est instantanée et ne coûte rien.` })));
  }

  function focusField(id) {
    const n = document.getElementById(id);
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    focusEl(n);
    pulse(n);
  }
  function focusGroup(id) {
    const g = document.getElementById(id);
    if (!g) return;
    g.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    focusEl(g.querySelector('[aria-pressed="true"]') || g.querySelector('button, input, select') || g);
    pulse(g);
  }
  // « Logo et icône »: the group in view, the focus on its file button
  function focusBrand() {
    const g = document.getElementById('b-g-brand');
    if (!g) return;
    g.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    focusEl(document.getElementById('b-f-logo') || g);
    pulse(g);
  }
  function jumpTo(target) {
    const t = target || { kind: 'store' };
    switch (t.kind) {
      case 'store':
        setTab('boutique');
        if (t.id === 'logo') focusBrand();
        else focusField(t.id === 'whatsapp' ? 'b-f-store-whatsapp' : 'b-f-store-name');
        break;
      case 'payments':
        setTab('boutique');
        focusGroup('b-g-payments');
        break;
      case 'theme':
        setTab('theme');
        if (t.id === 'colors' && t.key) { openColor('theme:' + t.key); break; }
        // one of her own fonts (« Mes polices »): the list of the slot it is used in, else the titles'
        if (t.id === 'fonts' && t.key && /^custom:/.test(t.key)) {
          const ty = typoNow();
          S.fontPick = { which: ty && ty.custom && ty.text.id === t.key && ty.display.id !== t.key ? 'text' : 'display', style: 'mine' };
          renderTab();
        }
        focusGroup(t.id && document.getElementById('b-g-theme-' + t.id) ? 'b-g-theme-' + t.id : 'b-g-theme-template');
        break;
      case 'section':
        if (t.id && findSection(t.id)) {
          selectTarget({ kind: 'section', id: t.id }, { reveal: true });
          if (t.key) openColor(t.key === 'buttonText' || t.key === 'buttonBg' || t.key === 'fg' ? `section:${t.id}:${t.key}` : `section:${t.id}:bg`);
        } else { setTab('sections'); focusEl(document.getElementById('b-sec-add')); }
        break;
      case 'product':
        if (t.id && findProduct(t.id)) selectTarget({ kind: 'product', id: t.id }, { reveal: true });
        else { setTab('produits'); const b = document.getElementById('b-p-add'); focusEl(b); pulse(b); }
        break;
      case 'page':
        // The seller's pages are written in the dashboard: show the page here, and the way there
        if (t.id && findCustomPage(t.id)) showPage('page', t.id);
        setTab('boutique');
        if (t.id && document.getElementById('b-pg-' + t.id)) focusField('b-pg-' + t.id);
        else focusGroup('b-g-pages');
        break;
      default:
        setTab('boutique');
    }
  }

  // Open a section or a product in the panel (from the preview, the quality tab or the mobile chip)
  function selectTarget(t, opts = {}) {
    if (!t) return;
    S.reorder.sections = false;
    S.reorder.produits = false;
    if (t.kind === 'brand') {
      setTab('boutique');
      focusBrand();
      return;
    }
    if (t.kind === 'product') {
      if (!findProduct(t.id)) return;
      S.openProduct = t.id;
      setTab('produits', { focus: 'pm-' + t.id });
      scrollRowIntoView(`[data-pid="${CSS.escape(t.id)}"]`);
    } else {
      if (!findSection(t.id)) return;
      S.openSection = t.id;
      setTab('sections', { focus: 'sm-' + t.id });
      scrollRowIntoView(`[data-sid="${CSS.escape(t.id)}"]`);
    }
    if (opts.reveal) revealInPreview(t);
  }

  const RENDER = { sections: renderSections, produits: renderProducts, theme: renderTheme, boutique: renderBoutique, qualite: renderQuality };

  /* ------------------------------------------------------------------ meta (top bar, title, score) */

  function refreshMeta() {
    if (!S.config) return;
    const name = storeName();
    els.topName.textContent = name;
    // The seller's pages were renamed, added or removed (undo, import, the dashboard): rebuild the selector
    if (S.pagesSig !== pagesSig()) syncPagePicks(); else updateUrl();
    if (S.open) document.title = `${name} · Jeere Studio`;
    const v = D.validate(S.config);
    els.tabScore.textContent = String(v.score);
    els.tabScore.classList.toggle('is-ok', v.status === 'APPROUVÉ');
    const tt = scoreTone(v);
    ['ok', 'warn', 'err'].forEach((x) => els.tabScore.classList.toggle('b-tone--' + x, x === tt));
    els.tabBtns[4].setAttribute('aria-label', `Qualité, score ${v.score} sur 100, ${v.status === 'APPROUVÉ' ? 'approuvé' : 'à corriger'}`);
    if (S.tab === 'qualite' && S.open) renderTab();
  }

  /* ------------------------------------------------------------------ mobile views */

  function setView(v) {
    if (v !== 'edit' && v !== 'preview') return;
    if (S.view === v) return;
    if (isMobile()) S.scrollY[S.view] = window.scrollY;
    S.view = v;
    els.ed.dataset.view = v;
    updateViewButtons();
    hidePick();
    if (v === 'preview') {
      if (S.previewDirty) renderPreviewNow(); else fit();
    }
    if (isMobile()) window.scrollTo(0, S.scrollY[v] || 0);
    if (v === 'preview' && S.pendingReveal) {
      const t = S.pendingReveal;
      S.pendingReveal = null;
      requestAnimationFrame(() => revealInPreview(t));
    } else if (v === 'preview' && S.openColor && (S.tab === 'theme' || S.tab === 'sections')) {
      // « Aperçu » with a colour open: the part it colours, in view and outlined (the footer is screens away)
      const key = S.openColor;
      requestAnimationFrame(() => revealColorPart(key));
    }
  }
  // The part of the store a colour key paints: { node, label } in the preview, or null (the page itself)
  function colorPart(key) {
    if (!els.store) return null;
    const p = String(key).split(':');
    if (p[0] === 'section') { const n = findPreviewNode({ kind: 'section', id: p[1] }); return n ? { node: n, label: labelFor({ kind: 'section', id: p[1] }) } : null; }
    const k = p[1];
    const q = (sel) => els.store.querySelector(sel);
    const z = zoneOfKey(k);
    if (z === 'announcement') { const n = q('.jst-sec--announcement'); return n ? { node: n, label: 'Bandeau d’annonce' } : null; }
    if (z === 'header') { const n = q('.jst-header'); return n ? { node: n, label: 'En-tête' } : null; }
    if (z === 'footer') { const n = q('.jst-footer'); return n ? { node: n, label: 'Pied de page' } : null; }
    if (z === 'badge') { const b = q('.jst-badge'); const n = b && (b.closest('[data-product-id]') || b); return n ? { node: n, label: 'Badges et promos' } : null; }
    if (k === 'accent' || k === 'onAccent') { const b = q('.jst-main .jst-btn, .jst-sec .jst-btn, .jst-btn'); const n = b && (b.closest('[data-section-id]') || b); return n ? { node: n, label: 'Couleur principale' } : null; }
    return null;
  }
  function revealColorPart(key) {
    if (!previewVisible()) return;
    if (S.previewDirty) renderPreviewNow();
    // a part that is on the home page only (the bar, the badges of the product grid): show the home page
    let part = colorPart(key);
    if (!part && S.page !== 'home') { showPage('home'); part = colorPart(key); }
    if (!part) return;
    scrollPreviewTo(part.node);
    flashNode(part.node, part.label);
  }
  function updateViewButtons() {
    els.viewBtns.forEach((b) => {
      const on = b.dataset.view === S.view;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }
  function showPick(t) {
    S.pick = t;
    let label;
    if (t.kind === 'brand') label = 'Modifier le logo';
    else if (t.kind === 'product') {
      const p = findProduct(t.id);
      label = `Modifier ${guil(shorten(p ? p.name : 'le produit', 26))}`;
    } else {
      const s = findSection(t.id);
      const def = s && typeDef(s.type);
      label = `Modifier ${guil(def ? def.name : 'la section')}`;
    }
    els.pickLabel.textContent = label;
    els.pick.hidden = false;
    document.documentElement.classList.add('b-has-pick');
    flashNode(findPreviewNode(t), labelFor(t));
  }
  function hidePick() { S.pick = null; if (els.pick) els.pick.hidden = true; document.documentElement.classList.remove('b-has-pick'); }

  /* ------------------------------------------------------------------ images */

  function readImage(file) {
    // Signed in: hosted in Supabase Storage (640 / 1280 / 2048 px WebP, srcset); else a data URL kept here
    // and sent at publication (media.js, wave 2 of the Studio audit)
    if (window.JeereMedia && typeof window.JeereMedia.importFile === 'function') return window.JeereMedia.importFile(file).then((r) => r.src);
    return new Promise((resolve, reject) => {
      if (!file || (file.type && !/^image\//.test(file.type))) { reject(new Error('type')); return; }
      let url;
      try { url = URL.createObjectURL(file); } catch (e) { reject(e); return; }
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (!w || !h) throw new Error('size');
          const s = Math.min(1, 800 / w, 1200 / h);
          w = Math.max(1, Math.round(w * s));
          h = Math.max(1, Math.round(h * s));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; // JPEG has no transparency
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          const data = c.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          resolve(data);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ modals */

  function focusables(root) {
    return Array.from(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((n) => !n.closest('[hidden]') && n.getClientRects().length > 0);
  }
  function openModal(id, opts = {}) {
    const m = document.getElementById(id);
    if (!m) return;
    S.modals.push({ m, prev: document.activeElement, onClose: opts.onClose || null });
    m.hidden = false;
    els.root.inert = true;
    document.documentElement.classList.add('b-modal-open');
    requestAnimationFrame(() => m.classList.add('is-open'));
    const first = opts.initial || focusables(m)[0];
    focusEl(first || m);
  }
  function closeModal(result) {
    const top = S.modals.pop();
    if (!top) return;
    top.m.classList.remove('is-open');
    top.m.hidden = true;
    if (!S.modals.length) {
      els.root.inert = false;
      document.documentElement.classList.remove('b-modal-open');
    }
    if (top.prev && document.contains(top.prev)) focusEl(top.prev);
    if (top.onClose) top.onClose(result);
  }
  function confirmDialog({ title, text, yes = 'Confirmer', no = 'Annuler' }) {
    return new Promise((resolve) => {
      els.cTitle.textContent = title;
      els.cText.textContent = text;
      els.cYes.textContent = yes;
      els.cNo.textContent = no;
      openModal('m-confirm', { initial: els.cNo, onClose: (r) => resolve(r === true) });
    });
  }

  function highlightJSON(json) {
    const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon) => {
      let cls = 'n';
      if (str) cls = colon ? 'k' : (m === '"[photo]"' ? 'p' : 's');
      else if (m === 'true' || m === 'false') cls = 'b';
      else if (m === 'null') cls = 'z';
      return `<span class="b-j-${cls}">${m}</span>`;
    });
  }
  function ficheJSON() { return JSON.stringify(S.config, null, 2); }
  function openFiche() {
    commit();
    const disp = JSON.stringify(S.config, (k, v) => (typeof v === 'string' && v.indexOf('data:image') === 0 ? '[photo]' : v), 2);
    els.ficheCode.innerHTML = highlightJSON(disp);
    els.ficheCode.scrollTop = 0;
    const photos = S.config.products.filter((p) => p.image).length + S.config.sections.filter((s) => s.settings && s.settings.image).length;
    const size = Math.max(1, Math.round(JSON.stringify(S.config).length / 1024));
    els.ficheMeta.textContent = `${count(S.config.sections.length, 'section')} · ${count(S.config.products.length, 'produit')} · ${count(customPages().length, 'page')} · ${count(photos, 'photo')} · ${size} Ko`;
    showImport(false);
    openModal('m-fiche', { initial: els.ficheCopy });
  }
  function showImport(on) {
    els.ficheImport.hidden = !on;
    els.ficheImportBtn.setAttribute('aria-expanded', String(on));
    els.ficheError.hidden = true;
    if (on) { els.fichePaste.value = ''; focusEl(els.fichePaste); }
  }
  function copyFiche() {
    const text = ficheJSON();
    const fallback = () => {
      const ta = el('textarea', { class: 'b-sr', 'aria-hidden': 'true' });
      ta.value = text;
      els.ficheModal.querySelector('.b-modal__card').append(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      focusEl(els.ficheCopy);
      toast(ok ? 'Fiche boutique copiée' : 'La copie a échoué. Utilisez Télécharger.');
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => toast('Fiche boutique copiée'), fallback);
    } else fallback();
  }
  function downloadFiche() {
    try {
      const blob = new Blob([ficheJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `fiche-boutique-${slug(storeName())}.json`, class: 'b-sr' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Fiche boutique téléchargée');
    } catch (e) { toast('Le téléchargement a échoué.'); }
  }
  function importError(msg) {
    els.ficheError.textContent = msg;
    els.ficheError.hidden = false;
  }
  function importText(text) {
    let obj;
    try { obj = JSON.parse(String(text || '').trim()); } catch (e) {
      importError(`Ce texte n’est pas une fiche boutique valide. Vérifiez qu’il commence par { et se termine par }.`);
      return;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !['version', 'template', 'store', 'theme', 'sections', 'products', 'payments', 'pages'].some((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
      importError('Cette fiche ne contient ni boutique, ni sections, ni produits.');
      return;
    }
    const cfg = D.normalizeConfig(obj);
    closeModal();
    S.config = cfg;
    S.openSection = null; S.openProduct = null; S.openItem = {};
    change({ now: true });
    renderTab({ top: true });
    toast(`Fiche importée${NB}: ${storeName()}. Annuler permet de revenir en arrière.`);
  }
  function openPublish() {
    commit();
    const v = D.validate(S.config);
    const ok = v.status === 'APPROUVÉ';
    els.pubScore.textContent = '';
    append(els.pubScore, [
      el('span', { class: 'b-status b-tone--' + scoreTone(v) + (ok ? ' b-status--ok' : '') }, icon(ok ? 'i-check' : (scoreTone(v) === 'err' ? 'i-x' : 'i-alert'), 'b-status__ico'), v.status),
      el('span', { text: ok ? ` Score qualité${NB}: ${v.score}/100. Votre fiche est prête.` : ` Score qualité${NB}: ${v.score}/100. Il reste des points à corriger dans l’onglet Qualité.` })
    ]);
    // The address, the real publication and the live link (publish.js); the score stays above it
    const panel = document.getElementById('m-publish-panel');
    if (panel && window.JeerePublish) {
      const fresh = panel.cloneNode(false);
      panel.replaceWith(fresh);
      window.JeerePublish.mount(fresh, { getConfig: () => S.config, showScore: false, onPublished: () => toast(`Boutique en ligne${NB}!`, 3000, 'ok'),
        // « Restaurer » a published version: it is live again and the draft takes it (Annuler undoes it, wave 2)
        onRestore: (fiche) => {
          let cfg;
          try { cfg = D.normalizeConfig(fiche); } catch (e) { return false; }
          S.config = cfg;
          S.openSection = null; S.openProduct = null; S.openItem = {};
          change({ now: true });
          renderTab({ top: true });
          return true;
        } });
    }
    openModal('m-publish');
  }

  /* ------------------------------------------------------------------ toast */

  // A small status icon before the message, guessed from its wording (or given): ok, warn, err or info
  function toastTone(msg) {
    const m = String(msg || '');
    if (/pas pu|a échoué|bloque|pleine|ne sont plus/i.test(m)) return 'err';
    if (/masquée|pas encore créée|Réessayez|arrive dans un instant/i.test(m)) return 'warn';
    if (/modifiée|supprimée depuis|Annuler permet/i.test(m)) return 'info';
    if (/ajouté|appliqué|copiée|téléchargée|affichée|retirée|Supprimé|supprimée|à votre nom|enregistr/i.test(m)) return 'ok';
    return '';
  }
  // action: { label, run } adds a button to the toast (« Annuler » after a palette replaced her colours)
  function toast(msg, ms = 2800, tone, action) {
    const t = els.toast;
    if (!t) return;
    const tn = ['ok', 'warn', 'err', 'info'].indexOf(tone) >= 0 ? tone : toastTone(msg);
    if (tn) t.setAttribute('data-tone', tn); else t.removeAttribute('data-tone');
    clearTimeout(S.timers.toast);
    clearTimeout(S.timers.toastClear);
    t.classList.remove('is-on', 'has-action');
    t.textContent = '';
    requestAnimationFrame(() => {
      t.textContent = msg;
      if (action && action.label && typeof action.run === 'function') {
        t.classList.add('has-action');
        t.append(el('button', {
          type: 'button', class: 'b-toast__act', 'data-fk': 'toast-act',
          on: { click: () => { clearTimeout(S.timers.toast); t.classList.remove('is-on', 'has-action'); action.run(); } }
        }, action.label));
      }
      t.classList.add('is-on');
      S.timers.toast = setTimeout(() => {
        t.classList.remove('is-on');
        S.timers.toastClear = setTimeout(() => { t.textContent = ''; }, 400);
      }, ms);
    });
  }

  /* ------------------------------------------------------------------ start screen */

  function isPristine(cfg) {
    try {
      const a = JSON.stringify(cfg);
      const niche = cfg.store && cfg.store.niche;
      return [D.defaultConfig(cfg.template), D.defaultConfig(cfg.template, niche)].some((d) =>
        a === JSON.stringify(D.normalizeConfig(d)) || a === JSON.stringify(D.normalizeConfig(personalize(D.clone(d)))));
    } catch (e) { return false; }
  }
  // The start screen header: « Bonjour Awa » and « Tableau de bord » for a signed-in seller, else
  // « Se connecter » and « Créer un compte » (the account pages are in ../compte/)
  function renderAccount() {
    if (!els.acctIn || !els.acctOut) return;
    const acc = readAccount();
    const signed = !!(acc && acc.loggedIn);
    els.acctIn.hidden = !signed;
    els.acctOut.hidden = signed;
    if (els.shead) {
      els.shead.classList.toggle('b-shead--in', signed);
      els.shead.classList.toggle('b-shead--out', !signed);
    }
    if (!signed) return;
    const first = acc.firstName;
    els.acctName.textContent = first;
    els.acctName.hidden = !first;
    els.acctAv.textContent = '';
    if (first) els.acctAv.textContent = first.charAt(0).toLocaleUpperCase('fr');
    else els.acctAv.append(icon('i-user'));
  }
  function renderStart() {
    renderAccount();
    const saved = readSaved();
    if (saved) {
      const n = saved.products.length;
      const on = saved.sections.filter((s) => s.enabled).length;
      els.resumeName.textContent = String(saved.store.name || '').trim() || 'Ma boutique';
      const np = Array.isArray(saved.pages) ? saved.pages.length : 0;
      els.resumeMeta.textContent = `Modèle ${templateOf(saved.template).name} · ${count(n, 'produit')} · ${count(on, 'section')}` + (np ? ` · ${count(np, 'page')}` : '');
      els.resume.hidden = false;
    } else els.resume.hidden = true;
    if (!S.startBuilt) buildTemplateCards();
  }
  // The start screen offers the custom-designed models (the demo shops in concepts/, each sold through
  // a Jeere store). The engine templates (Plateau, Cocody, Treichville) are no longer shown here; the
  // assistant still uses them. « Choisir ce modèle » opens the model's store in the dashboard.
  const CUSTOM_MODELS = [
    { slug: 'seve', name: 'SÈVE', kind: 'Soins et cosmétiques', desc: 'Flacons sur fond crème, titres serif, filtres par catégorie.' },
    { slug: 'soyeuse', name: 'SOYEUSE', kind: 'Perruques et tissages', desc: 'Rose bonbon, logo à lettres ornées, mannequin en pied.' },
    { slug: 'michou', name: 'MICHOU', kind: 'Streetwear', desc: 'Police machine à écrire, grandes photos, choix de taille sur la carte.' },
    { slug: 'anse', name: 'ANSE', kind: 'Maroquinerie', desc: 'Chaque sac dans son cadre pastel, les anses qui s’en échappent.' },
    { slug: 'regard', name: 'REGARD', kind: 'Cils et sourcils · rendez-vous', desc: 'Vos clientes réservent en ligne : prestation, jour, heure, acompte.' },
    { slug: 'vernie', name: 'VERNIE', kind: 'Ongles · rendez-vous', desc: 'Carte des prestations, demandes à confirmer, rappel la veille.' },
    { slug: 'minuit', name: 'MINUIT', kind: 'Cils et ongles · rendez-vous', desc: 'Noir et champagne, tarifs, conditions, offre du mois.' },
  ];
  // what a designer model costs, once, on top of the monthly plan (shown on the cards; the same on the home page)
  const MODEL_PRICE = `50${NB}000${NB}FCFA`;
  function buildTemplateCards() {
    S.startBuilt = true;
    const box = els.tpls;
    box.textContent = '';
    box.classList.add('b-tpls--custom');
    CUSTOM_MODELS.forEach((m) => {
      const demo = `https://kreeative.xyz/concepts/${m.slug}/`;
      const img = el('img', { src: `../studio/sites/thumbs/concepts--${m.slug}.webp`, width: '640', height: '400', alt: '', loading: 'lazy', decoding: 'async' });
      box.append(el('article', { class: 'b-tcard b-tcard--custom', 'data-model': m.slug },
        el('div', { class: 'b-tcard__shot b-tcard__shot--img', 'aria-hidden': 'true' }, img),
        el('div', { class: 'b-tcard__body' },
          el('div', { class: 'b-tcard__head' }, el('h3', { class: 'b-tcard__name', text: m.name }), el('span', { class: 'b-chip', text: m.kind })),
          el('p', { class: 'b-tcard__desc', text: m.desc }),
          el('p', { class: 'b-tcard__price' }, el('b', { text: MODEL_PRICE }), el('span', { text: 'payé une seule fois' })),
          el('a', { class: 'b-btn b-btn--ghost b-btn--sm b-tcard__btn', href: `../admin/#boutique=${m.slug}`, 'aria-label': `Choisir le modèle ${m.name}` },
            el('span', { class: 'b-lbl-long', text: 'Choisir ce modèle' }), el('span', { class: 'b-lbl-short', text: 'Choisir' }), icon('i-arrow')),
          el('a', { class: 'b-tcard__demo', href: demo, target: '_blank', rel: 'noopener', text: 'Voir la démo' }))));
    });
  }
  async function chooseTemplate(id) {
    const saved = readSaved();
    if (saved && !isPristine(saved)) {
      const ok = await confirmDialog({
        title: `Commencer une nouvelle boutique${NB}?`,
        text: `Votre boutique ${guil(String(saved.store.name || '').trim() || 'Ma boutique')}, enregistrée dans ce navigateur, sera remplacée. Pour la garder, reprenez-la et téléchargez sa fiche boutique.`,
        yes: 'Remplacer', no: 'Annuler'
      });
      if (!ok) return;
    }
    const cfg = D.defaultConfig(id);
    const example = cfg.store.name;
    personalize(cfg);
    openEditor(cfg);
    if (cfg.store.name !== example) toast(`Modèle ${templateOf(id).name}, à votre nom${NB}: ${cfg.store.name}.`);
  }
  function openAssistant() {
    const W = window.JeereWizard;
    if (W && typeof W.open === 'function') {
      try { W.open(); } catch (e) { toast('L’assistant n’a pas pu s’ouvrir. Partez d’un modèle en attendant.'); }
    } else toast('L’assistant arrive dans un instant. Réessayez, ou partez d’un modèle.');
  }

  /* ------------------------------------------------------------------ open / close */

  // opts: { page, pageId, productId } the page of the store to land on (the dashboard's « Voir dans la
  // boutique », « Personnaliser »…); view: 'preview' | 'edit', what a phone shows first (default: the
  // preview for any page but home); replace: the editor takes the place of the start screen in the
  // history (Back returns to where the seller came from)
  function openEditor(config, opts) {
    if (!D) return;
    init();
    const o = opts && typeof opts === 'object' ? opts : {};
    S.config = D.normalizeConfig(config);
    resetHistory();
    S.openSection = null; S.openProduct = null; S.openItem = {};
    S.reorder = { sections: false, produits: false };
    S.pendingReveal = null;
    S.scrollY = { edit: 0, preview: 0 };
    S.view = 'edit';
    S.page = 'home';
    S.productId = null;
    S.pageId = null;
    // A new store starts with an empty demo cart (render.js keeps it on the preview element)
    ['__jstCart', '__jstForm', '__jstQty', '__jstCartCleared', '__jstPeek', '__jstErr', '__jstMenu'].forEach((k) => { try { delete els.store[k]; } catch (e) { /* ignore */ } });
    // Where to land: a page of the journey, a product, one of the seller's pages
    let tab = 'sections';
    let focus = null;
    const want = typeof o.page === 'string' && isView(o.page) && rendererHasPages() ? o.page : 'home';
    if (want === 'product') {
      const pid = [o.productId, o.pageId].find((x) => typeof x === 'string' && findProduct(x)) || (S.config.products[0] ? S.config.products[0].id : null);
      if (pid) { S.page = 'product'; S.productId = pid; S.openProduct = pid; tab = 'produits'; focus = 'pm-' + pid; }
    } else if (want === 'page') {
      const pg = findCustomPage(o.pageId) || customPages()[0] || null;
      if (pg) { S.page = 'page'; S.pageId = pg.id; tab = 'boutique'; focus = 'pg-' + pg.id; }
    } else S.page = want;
    if (o.focus === 'logo') tab = 'boutique';
    S.pagesSig = null;
    syncPagePicks();
    S.previewDirty = true;
    els.ed.dataset.view = 'edit';
    updateViewButtons();
    hidePick();
    els.start.hidden = true;
    els.ed.hidden = false;
    document.documentElement.classList.add('b-editing');
    S.open = true;
    try {
      if (!(history.state && history.state.jeere === 'editor')) history[o.replace ? 'replaceState' : 'pushState']({ jeere: 'editor' }, '', '#editeur');
    } catch (e) { /* file:// or sandbox */ }
    S.tab = '';
    setTab(tab, { top: true, focus: isMobile() ? null : focus });
    refreshMeta();
    window.scrollTo(0, 0);
    renderPreviewNow();
    els.stage.scrollTop = 0;
    saveNow();
    // On a phone, « Voir » means the preview (opts.view can say otherwise); on a computer the panel opens what is shown,
    // except for « Voir la boutique » (view 'preview'): the storefront alone
    setStoreView(!isMobile() && o.view === 'preview');
    if (S.storeView) focusEl(els.storeEdit);
    else if (o.focus === 'logo') focusBrand();
    else if (isMobile() && (o.view === 'preview' || (o.view !== 'edit' && S.page !== 'home'))) { setView('preview'); window.scrollTo(0, 0); focusEl(els.viewBtns[1]); }
    else if (focus && document.querySelector(`[data-fk="${CSS.escape(focus)}"]`)) {
      const n = document.querySelector(`[data-fk="${CSS.escape(focus)}"]`);
      n.scrollIntoView({ block: 'center' });
    } else focusEl(els.tabBtns[TABS.indexOf(tab)] || els.tabBtns[0]);
    // The tour starts on a first use (a template, the assistant, « Reprendre », « Personnaliser » in the dashboard),
    // not when the dashboard sent her to a precise place (a product, one of her pages, « Voir la boutique »)
    const deep = (typeof o.page === 'string' && o.page !== 'home') || o.productId || o.pageId || o.view || o.focus;
    const restored = o.replace && o.page === undefined; // back to the editor with the Back button: not a first use
    if (!deep && !restored) maybeAutoTour();
  }
  function doShowStart() {
    clearTimeout(S.timers.tour);
    if (window.JeereTour && window.JeereTour.isOpen()) window.JeereTour.stop('outside');
    setStoreView(false);
    if (S.open) { commit(); saveNow(); }
    S.open = false;
    hidePick();
    while (S.modals.length) closeModal(false);
    els.ed.hidden = true;
    els.start.hidden = false;
    document.documentElement.classList.remove('b-editing');
    document.title = 'Créez votre boutique · Jeere Studio';
    renderStart();
    window.scrollTo(0, 0);
    focusEl(els.startTitle);
  }
  function showStart() {
    init();
    doShowStart();
    try { if (history.state && history.state.jeere === 'editor') history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  function getConfig() { return S.config ? D.clone(S.config) : null; }

  /* ------------------------------------------------------------------ guided tour (tour.js) */

  // Eight steps, each on one area of the editor. On a phone, each step switches to the view that shows its
  // area (Modifier / Aperçu), as the seller would. It starts once per browser, a moment after the editor first
  // opens (a template, the assistant…), unless she is already busy; « ? Aide » replays it. A click anywhere
  // outside the bubble closes it and goes on to what was clicked (tour.js): the editor is never blocked.
  const TOUR_ID = 'editor';
  const visibleOf = (sels) => sels.map((q) => Array.from(document.querySelectorAll(q)).find((n) => n.getClientRects().length > 0)).find(Boolean) || null;
  function tourView(v) { if (isMobile()) setView(v); else if (S.storeView) setStoreView(false); }
  function tourTab(tab) { tourView('edit'); hidePick(); if (S.tab !== tab) setTab(tab, { top: true }); }
  function tourPreviewNode() {
    const secs = S.config ? S.config.sections.filter((x) => x.enabled) : [];
    const sec = secs.find((x) => x.type === 'hero') || secs[0];
    const n = sec ? findPreviewNode({ kind: 'section', id: sec.id }) : null;
    return n || els.store.querySelector('[data-section-id]') || els.device;
  }
  function tourSteps() {
    const phone = isMobile();
    return [
      { target: '#b-g-theme-template', title: 'Votre modèle',
        text: `Il donne l’allure de votre boutique. Changez-en quand vous voulez, dans Thème${NB}: vos textes et vos produits restent.`,
        prepare: () => tourTab('theme') },
      { target: '#b-g-theme-palette', title: 'Vos couleurs',
        text: `Choisissez une palette${NB}: un fond et une couleur principale pour les boutons. L’aperçu change tout de suite.`,
        prepare: () => tourTab('theme') },
      { target: '#b-g-theme-intensity', title: 'Vives ou Douces',
        text: `Vives${NB}: votre couleur habille toute la boutique. Douces${NB}: des fonds clairs, la couleur en touches.`,
        prepare: () => tourTab('theme') },
      { target: tourPreviewNode, title: 'Modifier une section',
        text: phone
          ? `Dans l’Aperçu, touchez une section (le grand titre, les produits…), puis ${guil('Modifier')}${NB}: ses réglages s’ouvrent.`
          : `Cliquez sur une section de l’aperçu (le grand titre, les produits…)${NB}: ses réglages s’ouvrent à gauche.`,
        prepare: () => { hidePick(); if (S.page !== 'home') showPage('home'); tourView('preview'); scrollPreviewTop(); } },
      { target: '#b-p-add', title: 'Ajouter un produit',
        text: `Un nom, un prix et une photo prise avec votre téléphone, à la lumière du jour${NB}: c’est tout.`,
        prepare: () => tourTab('produits') },
      { target: () => visibleOf(['.b-top__device', '.b-stage__device']), title: 'Téléphone ou ordinateur',
        text: `Voyez votre boutique comme vos clients la verront. La plupart l’ouvriront sur leur téléphone.`,
        prepare: () => { hidePick(); tourView('preview'); } },
      { target: () => [document.getElementById('b-tab-qualite'), els.tp.qualite.querySelector('.b-score')], title: 'La relecture Qualité',
        text: phone
          ? `Un score sur 100 et ce qu’il reste à corriger avant de publier. La liste des points est juste en dessous.`
          : `Un score sur 100 et ce qu’il reste à corriger avant de publier. Cliquez sur un point pour y aller.`,
        prepare: () => tourTab('qualite') },
      { target: ['#b-help-btn', '#b-publish-btn'], title: 'Publier, et revoir la visite',
        text: `Quand le score vous convient, ${phone ? 'touchez' : 'cliquez sur'} ${guil('Publier')}. Pour revoir cette visite, ${phone ? 'touchez' : 'cliquez sur'} ${guil('? Aide')}.`,
        prepare: () => { hidePick(); tourView('edit'); } }
    ];
  }
  function tourInsets() {
    if (!isMobile()) return { top: 0, bottom: 0 };
    const bar = S.view === 'preview' ? els.stageBar : els.tablist;
    const b = (n) => (n && n.getClientRects().length ? n.getBoundingClientRect().bottom : 0);
    return { top: Math.max(b(els.top), b(bar)), bottom: els.mnav && els.mnav.getClientRects().length ? els.mnav.offsetHeight : 0 };
  }
  function startTour() {
    const T = window.JeereTour;
    if (!T || !S.open) return false;
    while (S.modals.length) closeModal(false);
    const from = { tab: S.tab, view: S.view };
    T.start({
      id: TOUR_ID, label: 'Visite guidée du Studio', steps: tourSteps(), insets: tourInsets, doneLabel: 'C’est parti',
      returnFocus: () => els.helpBtn,
      onEnd: (why) => {
        // Closed by a click elsewhere: leave the editor as it is, the click goes on. Otherwise back to where she was.
        if (why === 'outside' || !S.open) return;
        hidePick();
        if (S.tab !== from.tab) setTab(from.tab, { top: true });
        tourView(from.view);
      }
    });
    return true;
  }
  // Once per browser, a moment after the editor opens; not when she is already typing or clicking
  function maybeAutoTour() {
    const T = window.JeereTour;
    if (!T || T.seen(TOUR_ID) || S.storeView) return;
    let busy = false;
    const mark = () => { busy = true; };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
    later('tour', () => {
      window.removeEventListener('pointerdown', mark, true);
      window.removeEventListener('keydown', mark, true);
      if (busy || !S.open || S.modals.length || S.storeView || T.seen(TOUR_ID) || T.isOpen()) return;
      startTour();
    }, 1000);
  }

  /* ------------------------------------------------------------------ init and events */

  function grab() {
    const $ = (id) => document.getElementById(id);
    Object.assign(els, {
      root: $('b-root'), start: $('b-start'), startTitle: $('b-start-title'), tpls: $('b-tpls'),
      resume: $('b-resume'), resumeName: $('b-resume-name'), resumeMeta: $('b-resume-meta'), resumeBtn: $('b-resume-btn'), aiBtn: $('b-ai-btn'),
      shead: $('b-shead'), acctIn: $('b-acct-in'), acctOut: $('b-acct-out'), acctName: $('b-acct-name'), acctAv: $('b-acct-av'),
      ed: $('b-ed'), top: document.querySelector('.b-top'), topStore: $('b-top-store'), topName: $('b-top-name'), saved: $('b-saved'),
      undo: $('b-undo'), redo: $('b-redo'), ficheBtn: $('b-fiche-btn'), publishBtn: $('b-publish-btn'), helpBtn: $('b-help-btn'), storeEdit: $('b-store-edit'),
      panelScroll: $('b-panel-scroll'), tablist: document.querySelector('.b-tabs'),
      tabBtns: Array.from(document.querySelectorAll('.b-tab')), tabScore: $('b-tab-score'),
      stage: $('b-stage'), stageBar: document.querySelector('.b-stage__bar'), stageHint: $('b-stage-hint'), stageInner: $('b-stage-inner'),
      dwrap: $('b-dwrap'), device: $('b-device'), screen: $('b-screen'), store: $('b-store'), url: $('b-device-url'), fav: $('b-device-fav'),
      hlHover: $('b-hl-hover'), hlFlash: $('b-hl-flash'),
      pick: $('b-pick'), pickBtn: $('b-pick-btn'), pickLabel: $('b-pick-label'), pickClose: $('b-pick-close'),
      mnav: document.querySelector('.b-mnav'), viewBtns: Array.from(document.querySelectorAll('.b-mnav__btn')),
      pageSels: Array.from(document.querySelectorAll('[data-page-select]')), pagePicks: Array.from(document.querySelectorAll('[data-page-pick]')),
      toast: $('b-toast'),
      ficheModal: $('m-fiche'), ficheCode: $('fiche-code'), ficheMeta: $('fiche-meta'), ficheImport: $('fiche-import'),
      fichePaste: $('fiche-paste'), ficheError: $('fiche-error'), ficheFile: $('fiche-file'), ficheApply: $('fiche-apply'),
      ficheCopy: $('fiche-copy'), ficheDownload: $('fiche-download'), ficheImportBtn: $('fiche-import-btn'),
      pubScore: $('m-publish-score'), addWhere: $('m-add-where'), addList: $('m-add-list'),
      cTitle: $('m-confirm-t'), cText: $('m-confirm-d'), cYes: $('m-confirm-yes'), cNo: $('m-confirm-no')
    });
    els.tp = {};
    TABS.forEach((t) => { els.tp[t] = $('b-tp-' + t); });
  }

  function bind() {
    els.resumeBtn.addEventListener('click', () => { const saved = readSaved(); if (saved) openEditor(saved); else renderStart(); });
    els.aiBtn.addEventListener('click', openAssistant);

    els.topStore.addEventListener('click', () => { setTab('boutique'); focusField('b-f-store-name'); if (isMobile()) setView('edit'); });
    document.querySelectorAll('[data-device-toggle] [data-device]').forEach((b) => b.addEventListener('click', () => setDevice(b.dataset.device)));
    els.undo.addEventListener('click', undo);
    els.redo.addEventListener('click', redo);
    buildPagePicks();
    els.pagePicks.forEach((sel) => sel.addEventListener('change', () => { const v = parsePick(sel.value); showPage(v.page, v.id); }));
    els.store.addEventListener('jst:navigate', onStoreNavigate);
    // render.js redraws the preview by itself (quantities, payment choice, commune): keep it tamed
    if (window.MutationObserver) {
      new MutationObserver(() => { tameStore(els.store, els.screen); if (S.hoverNode && !S.hoverNode.isConnected) hideHover(); }).observe(els.store, { childList: true });
    }
    els.ficheBtn.addEventListener('click', openFiche);
    els.publishBtn.addEventListener('click', openPublish);
    if (els.helpBtn) els.helpBtn.addEventListener('click', () => { if (!startTour()) toast('La visite guidée n’a pas pu se charger. Rechargez la page.'); });
    if (els.storeEdit) els.storeEdit.addEventListener('click', () => { setStoreView(false); focusEl(els.tabBtns[TABS.indexOf(S.tab)] || els.tabBtns[0]); });

    els.tabBtns.forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); if (isMobile() && S.view !== 'edit') setView('edit'); }));
    els.tablist.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(S.tab);
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = TABS.length - 1;
      if (j === null) return;
      e.preventDefault();
      setTab(TABS[j]);
      focusEl(els.tabBtns[j]);
    });

    els.viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    els.mnav.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const v = S.view === 'edit' ? 'preview' : 'edit';
      setView(v);
      focusEl(els.viewBtns[v === 'edit' ? 0 : 1]);
    });
    els.pickBtn.addEventListener('click', () => { const t = S.pick; hidePick(); setView('edit'); selectTarget(t); });
    els.pickClose.addEventListener('click', hidePick);

    // The preview: the store's own buttons and fields work (render.js moves through the pages); a click
    // anywhere else in a section or a product opens it in the panel. Links never leave the preview.
    els.screen.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      // The store's logo leads home; on the home page itself a click on it edits the logo instead
      if (logoOnHome(e.target) && !(S.storeView && !isMobile())) {
        e.preventDefault();
        e.stopPropagation();
        const hd = e.target.closest('.jst-header');
        if (isMobile()) { showPick({ kind: 'brand' }); return; }
        flashNode(hd, labelFor({ kind: 'brand' }));
        selectTarget({ kind: 'brand' });
        return;
      }
      if (storeControl(e.target) && !(window.JeereQuickStyle && window.JeereQuickStyle.wants(e.target))) return;
      if (e.target.closest('a, button, form, summary')) e.preventDefault();
      if (S.storeView && !isMobile()) return;
      // Quick style (quickstyle.js): a tap on a button, a title, a text, an image or an icon opens its style sheet
      if (window.JeereQuickStyle && window.JeereQuickStyle.tap(e)) { e.stopPropagation(); return; }
      const node = e.target.closest('[data-product-id], [data-section-id], .jst-header');
      const t = targetOf(node);
      if (!t) return;
      if (isMobile()) { showPick(t); return; }
      flashNode(node, labelFor(t));
      selectTarget(t);
    }, true);
    els.screen.addEventListener('submit', (e) => e.preventDefault(), true);
    els.screen.addEventListener('mousemove', (e) => {
      if (!mqHover.matches || isMobile() || S.storeView || !(e.target instanceof Element)) return;
      // The outline shows what a click edits: none over the store's own buttons and fields
      const node = logoOnHome(e.target) ? e.target.closest('.jst-header') : (storeControl(e.target) ? null : e.target.closest('[data-product-id], [data-section-id], .jst-header'));
      if (node === S.hoverNode) return;
      S.hoverNode = node;
      if (!node) { els.hlHover.classList.remove('is-on'); return; }
      placeHl(els.hlHover, node, labelFor(targetOf(node)));
      els.hlHover.classList.add('is-on');
    });
    els.screen.addEventListener('mouseleave', hideHover);
    els.stage.addEventListener('scroll', () => { if (S.hoverNode) hideHover(); }, { passive: true });

    // Modals
    document.querySelectorAll('.b-modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) closeModal(false); });
      m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(false)));
    });
    els.cYes.addEventListener('click', () => closeModal(true));
    els.cNo.addEventListener('click', () => closeModal(false));
    els.ficheCopy.addEventListener('click', copyFiche);
    els.ficheDownload.addEventListener('click', downloadFiche);
    els.ficheImportBtn.addEventListener('click', () => showImport(els.ficheImport.hidden));
    els.ficheApply.addEventListener('click', () => importText(els.fichePaste.value));
    els.ficheFile.addEventListener('change', () => {
      const f = els.ficheFile.files && els.ficheFile.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { els.ficheFile.value = ''; importText(r.result); };
      r.onerror = () => { els.ficheFile.value = ''; importError('Ce fichier n’a pas pu être lu.'); };
      r.readAsText(f);
    });

    document.addEventListener('keydown', onKey);

    // Hide the bottom tab bar while the on-screen keyboard is open (more room to type). Detected from the
    // viewport height, not from focus alone: on Android the back key closes the keyboard but keeps the focus.
    const vv = window.visualViewport;
    const viewH = () => (vv ? vv.height : window.innerHeight);
    let baseH = viewH();
    const updateTyping = () => {
      const a = document.activeElement;
      const typing = S.open && isMobile() && isTextField(a) && els.ed.contains(a) && viewH() < baseH - 120;
      els.ed.classList.toggle('is-typing', typing);
    };
    (vv || window).addEventListener('resize', () => {
      if (!isTextField(document.activeElement)) baseH = viewH();
      updateTyping();
    });
    document.addEventListener('focusin', () => later('typing', updateTyping, 60));
    document.addEventListener('focusout', () => later('typing', updateTyping, 120));

    const relayout = () => { if (S.open) { updateHint(); if (!isMobile() && S.previewDirty) renderPreviewNow(); else fit(); } };
    window.addEventListener('resize', () => later('resize', relayout, 60));
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', () => { hideHover(); hidePick(); relayout(); });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { if (S.open) requestAnimationFrame(fit); });
      ro.observe(els.device);
      ro.observe(els.stageInner);
    }

    window.addEventListener('popstate', (e) => {
      const st = e.state;
      // Forward to the editor: the saved fiche (the dashboard may have changed it meanwhile), else the one in hand
      if (st && st.jeere === 'editor') { if (!S.open) { const cfg = readSaved() || S.config; if (cfg) openEditor(cfg); } }
      else if (S.open) doShowStart();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    // Links to the dashboard and the account pages: save first (the dashboard reads the same fiche)
    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[data-leave]') : null;
      if (a) flush();
    }, true);

    // The dashboard (or the account page) changed the shared state in another tab…
    window.addEventListener('storage', (e) => {
      const k = e.key;
      if (k === null || k === ACCOUNT_KEY) renderAccount();
      if (k === null || k === ADMIN_KEY) { readSite(); updateUrl(); }
      if (k === null || k === STORE_KEY) syncStored(k === null ? readRaw(STORE_KEY) : e.newValue, 'dans un autre onglet');
    });
    // …or in this tab, before Back brought this page back from the browser's cache
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      renderAccount();
      readSite();
      updateUrl();
      const ins = takeOpen();
      syncStored(readRaw(STORE_KEY), 'dans le tableau de bord');
      if (ins) openAt(ins);
    });
  }

  function flush() { if (S.open) { commit(); saveNow(); } }

  // The fiche in localStorage is not the one this page last read or wrote: the dashboard changed it
  // (products, pages, payments, delivery…) or deleted it (« Supprimer mon compte »). Take it in.
  function syncStored(raw, where) {
    if (raw === S.lastSaved) return;
    if (raw === null || raw === '') {
      // Deleted elsewhere: never write it back (not even with Forward to the editor). Back to the start screen.
      S.lastSaved = null;
      if (!S.open) { S.config = null; renderStart(); return; }
      S.open = false;
      clearTimeout(S.timers.save);
      clearTimeout(S.timers.commit);
      S.pending = false;
      S.config = null;
      doShowStart();
      try { if (history.state && history.state.jeere === 'editor') history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      toast(`Votre boutique a été supprimée depuis le tableau de bord.`, 4000, 'warn');
      return;
    }
    const cfg = parseConfig(raw);
    if (!cfg) return;
    S.lastSaved = raw;
    if (!S.open) { renderStart(); return; }
    commit();
    clearTimeout(S.timers.save);
    let same = false;
    try { same = JSON.stringify(cfg) === JSON.stringify(S.config); } catch (e) { same = false; }
    if (same) return;
    // A new step in the history: Annuler brings back what this page had
    S.config = cfg;
    S.history.length = S.index + 1;
    S.history.push(copy(cfg));
    if (S.history.length > HISTORY_MAX) S.history.shift();
    S.index = S.history.length - 1;
    if (S.openSection && !findSection(S.openSection)) S.openSection = null;
    if (S.openProduct && !findProduct(S.openProduct)) S.openProduct = null;
    renderPreviewNow();
    renderTab();
    refreshMeta();
    updateUndo();
    toast(`Votre boutique a été modifiée ${where || 'ailleurs'}${NB}: l’aperçu est à jour.`, 3200);
  }

  // Apply a 'jeere-studio-open' instruction to the fiche in hand
  function openAt(ins) {
    if (!ins) return false;
    const cfg = S.open && S.config ? S.config : readSaved();
    if (!cfg) return false;
    openEditor(cfg, { page: ins.page, pageId: ins.pageId, productId: ins.productId, view: ins.view, focus: ins.focus, replace: true });
    return true;
  }

  function onKey(e) {
    const top = S.modals[S.modals.length - 1];
    if (top) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(false); return; }
      if (e.key === 'Tab') {
        const f = focusables(top.m);
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !top.m.contains(document.activeElement))) { e.preventDefault(); focusEl(last); }
        else if (!e.shiftKey && (document.activeElement === last || !top.m.contains(document.activeElement))) { e.preventDefault(); focusEl(first); }
      }
      return;
    }
    if (!S.open) return;
    // Ctrl/⌘ + Alt + P: the same fiche in the Studio Pro (laptop and iPad); e.code, so it works on AZERTY too
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyP') {
      const pro = document.getElementById('b-pro-link');
      if (pro && getComputedStyle(pro).display !== 'none') { e.preventDefault(); flush(); window.location.href = pro.href; }
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = String(e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    if (isTextField(e.target)) return; // let the field undo its own typing
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  }

  // The checkout speaks to shoppers; what the seller has to do goes here
  const NOPAY_HINT = [`Aucun moyen de paiement activé${NB}: vos clients ne peuvent commander que sur WhatsApp. Activez-en un dans Boutique › Moyens de paiement.`, `Activez un moyen de paiement dans Boutique.`];
  function updateHint() {
    if (!els.stageHint) return;
    const page = rendererHasPages() ? S.page : 'home';
    const noPay = page === 'checkout' && S.config && S.config.payments && !Object.keys(S.config.payments).some((k) => S.config.payments[k] === true);
    const h = noPay ? NOPAY_HINT : (PAGE_HINTS[page] || PAGE_HINTS.home);
    const text = S.storeView && !isMobile() ? `Votre boutique telle que vos clients la voient. ${guil('Modifier la boutique')} ouvre les réglages.` : (isMobile() ? h[1] : h[0]);
    if (els.stageHint.__text === text) return;
    els.stageHint.__text = text;
    els.stageHint.textContent = text;
    if (page === 'page' && !isMobile()) els.stageHint.append(' ', el('a', { href: PAGES_URL, 'data-leave': true, text: 'Gérer les pages' }));
  }

  function init() {
    if (S.inited) return;
    S.inited = true;
    grab();
    if (!D || !els.root) {
      if (els.tpls) els.tpls.textContent = 'Le Studio n’a pas pu se charger. Rechargez la page.';
      return;
    }
    bind();
    updateHint();
    readSite();
    // A reload while editing lands on the start screen, with « Reprendre ma boutique ». Coming back with the
    // Back button (from the dashboard…) to the editor's history entry reopens the editor instead.
    let wasEditing = false;
    let back = false;
    try { wasEditing = /^#editeur$/.test(location.hash) || !!(history.state && history.state.jeere === 'editor'); } catch (e) { wasEditing = false; }
    try { const nav = performance.getEntriesByType('navigation')[0]; back = !!nav && nav.type === 'back_forward'; } catch (e) { back = false; }
    const ins0 = readRaw(OPEN_KEY);
    if (wasEditing && back && ins0 === null) {
      const saved = readSaved();
      if (saved) {
        try { if (!(history.state && history.state.jeere === 'editor')) history.replaceState({ jeere: 'editor' }, '', '#editeur'); } catch (e) { /* ignore */ }
        openEditor(saved, { replace: true });
        return;
      }
    }
    try { if (wasEditing) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    // The dashboard sent the seller here to see or customise a page (« Personnaliser », « Voir dans la
    // boutique »…): open the editor straight on it. The instruction is used once (deleted when read);
    // a link to …/creer/#assistant is for the assistant (wizard.js) instead.
    // Back from the account page after « Se connecter pour publier » (compte/?suite=publier): the store,
    // then its publish dialog, now with the real session (wave 2 of the Studio audit)
    let wantPublish = false;
    try { wantPublish = location.hash === '#publier'; } catch (e) { wantPublish = false; }
    if (wantPublish) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      const saved = readSaved();
      if (saved) { openEditor(saved, { replace: true }); setTimeout(openPublish, 60); return; }
    }
    const ins = takeOpen();
    let assistant = false;
    try { assistant = location.hash === '#assistant'; } catch (e) { assistant = false; }
    if (ins && !assistant) {
      if (openAt(ins)) return;
      renderStart();
      toast(`Votre boutique n’est pas encore créée${NB}: choisissez un point de départ.`, 4200);
      return;
    }
    renderStart();
  }

  function getPage() {
    return { page: S.page, productId: S.page === 'product' ? S.productId : null, pageId: S.page === 'page' ? S.pageId : null };
  }

  window.JeereBuilder = { openEditor, getConfig, showStart, showPage: (page, id) => { if (S.open) showPage(page, id); }, getPage, startTour };
  // The bridge for quickstyle.js (element styles from the phone preview): the live fiche, the one change path
  window.JeereBuilder.quick = {
    config: () => S.config, open: () => !!S.open, store: () => els.store, screen: () => els.screen, isMobile,
    change: (opts) => change(opts || {}), applyStyles: () => { if (window.JeereElStyles && els.store && S.config) window.JeereElStyles.apply(S.config, els.store); },
    editTarget: (t) => { if (isMobile()) { setView('edit'); } selectTarget(t); }, toast: (m) => toast(m)
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
