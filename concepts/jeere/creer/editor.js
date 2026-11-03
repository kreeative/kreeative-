/*
 * Jeere Studio — editor.js
 * The start screen and the store editor. Exposes one global: window.JeereBuilder
 *   openEditor(config)        normalises the fiche boutique and shows the editor
 *   getConfig()               deep copy of the fiche being edited (null before the editor opens)
 *   showStart()               back to the start screen « Créez votre boutique »
 *   showPage(page, productId) shows one page of the store in the preview (see JEERE_DATA.PAGES)
 *   getPage()                 { page, productId } shown in the preview
 *
 * The editor edits one "fiche boutique" (store config v1, see data.js). Every change re-renders the
 * live preview with JeereRender, goes into an undo history and is autosaved in localStorage.
 * Section forms are generated from JEERE_DATA.sectionTypes[type].fields (FieldDefs): nothing is
 * written per section here, so a new section type in data.js gets its form for free.
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
    confirmation: ['La confirmation de commande, telle que vos clients la verront.', 'Ce que voit le client après sa commande.']
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
    tab: 'sections', device: 'phone', view: 'edit', page: 'home', productId: null,
    openSection: null, openProduct: null, openItem: {}, reorder: { sections: false, produits: false },
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
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ma-boutique';
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
  function thumb(p, cls) {
    const t = el('span', { class: 'b-thumb' + (cls ? ' ' + cls : ''), 'data-thumb': p.id, style: `background:${safeColor(p.color)}` });
    if (p.image) t.append(el('img', { src: p.image, alt: '', loading: 'lazy', decoding: 'async' }));
    else t.innerHTML = artMarkup(p.art, p.color); // renderer markup, built from a fixed art kind and a hex colour
    return t;
  }

  /* ------------------------------------------------------------------ storage */

  function readSaved() {
    let raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      return D.normalizeConfig(obj);
    } catch (e) { return null; }
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
      setSaved('ok');
      return;
    } catch (e) {
      if (isQuota(e)) {
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(stripImages(S.config)));
          if (S.saveState !== 'partial') toast(`La mémoire du navigateur est pleine à cause des photos. Le reste est enregistré${NB}: téléchargez la fiche boutique pour garder aussi les photos.`, 6000);
          setSaved('partial');
          return;
        } catch (e2) { /* still full */ }
        if (S.saveState !== 'fail') toast(`La mémoire du navigateur est pleine${NB}: vos changements ne sont plus enregistrés. Téléchargez la fiche boutique pour les garder.`, 6000);
        setSaved('fail');
      } else {
        if (S.saveState !== 'blocked') toast(`Votre navigateur bloque l’enregistrement. Téléchargez la fiche boutique pour la garder.`, 6000);
        setSaved('blocked');
      }
    }
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
    els.saved.classList.toggle('is-warn', state !== 'ok');
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
    renderStoreInto(els.store, S.config, S.device, els.screen, S.page, S.productId);
    readView();
    hideHover();
    fit();
    // The page was rebuilt: move a running outline onto the new element, or drop it
    if (S.flash && els.hlFlash.classList.contains('is-on')) {
      const node = findPreviewNode(S.flash);
      if (node) placeHl(els.hlFlash, node, labelFor(S.flash)); else els.hlFlash.classList.remove('is-on');
    }
  }
  function renderStoreInto(root, config, device, screen, page, productId) {
    const R = window.JeereRender;
    let ok = false;
    if (R && typeof R.render === 'function') {
      try { R.render(config, root, { device, page: page || 'home', productId: productId || null }); ok = true; } catch (e) { ok = false; }
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
    S.page = isPage(v.page) ? v.page : 'home';
    if (S.page === 'product' && typeof v.productId === 'string' && findProduct(v.productId)) S.productId = v.productId;
    syncPagePicks();
  }
  function syncPagePicks() {
    const on = rendererHasPages();
    (els.pageSels || []).forEach((wrap) => { wrap.hidden = !on; wrap.classList.toggle('is-other', S.page !== 'home'); });
    (els.pagePicks || []).forEach((sel) => { if (sel.value !== S.page) sel.value = S.page; });
    updateHint();
  }
  function buildPagePicks() {
    const list = pagesList();
    els.pagePicks.forEach((sel) => {
      sel.textContent = '';
      list.forEach((p) => sel.append(el('option', { value: p.id, text: p.label })));
      sel.value = S.page;
    });
  }
  function scrollPreviewTop() {
    if (isMobile()) { if (S.view === 'preview' && window.scrollY > 0) window.scrollTo(0, 0); }
    else if (els.stage) els.stage.scrollTop = 0;
  }
  // Show a page of the store (from the selector, the Produits tab, the Qualité tab…)
  function showPage(page, productId, opts = {}) {
    if (!S.config) return;
    if (!isPage(page) || !rendererHasPages()) page = 'home';
    S.page = page;
    if (page === 'product') {
      const want = [productId, S.openProduct, S.productId].find((id) => typeof id === 'string' && findProduct(id));
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
    S.page = isPage(d.page) ? d.page : 'home';
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
    if (t.kind === 'product') {
      return els.store.querySelector(`[data-product-id="${CSS.escape(t.id)}"]`);
    }
    return els.store.querySelector(`[data-section-id="${CSS.escape(t.id)}"]`);
  }
  function labelFor(t) {
    if (!t) return '';
    if (t.kind === 'product') { const p = findProduct(t.id); return 'Produit · ' + shorten(p ? p.name : '', 30); }
    const s = findSection(t.id);
    const def = s && typeDef(s.type);
    return def ? def.name : 'Section';
  }
  // A button, link or field of the store itself (render.js handles it): not a click to edit
  function storeControl(n) {
    if (!n || !els.store || !els.store.contains(n)) return false;
    return !!n.closest('[data-jst-action], input, select, textarea, label, option');
  }
  function targetOf(node) {
    if (!node) return null;
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

  function setTab(tab, opts = {}) {
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
    const input = el('input', {
      class: 'b-input b-input--num', id, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
      placeholder: f.placeholder || null, 'data-fk': id, value: typeof cur === 'number' ? String(cur) : '',
      'aria-describedby': id + '-h'
    });
    const fmt = opts.format ? el('p', { class: 'b-hint', 'aria-live': 'off' }) : null;
    const showFmt = () => { if (fmt) { const v = acc.get(); fmt.textContent = typeof v === 'number' ? opts.format(v) : ''; } };
    showFmt();
    const parse = () => { const d = input.value.replace(/\D/g, ''); return d ? parseInt(d, 10) : null; };
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
      input.value = String(n);
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

  function imageField(f, acc, id, opts = {}) {
    const v = acc.get();
    const pic = el('div', { class: 'b-img__pic' + (v ? '' : ' is-empty') });
    if (v) pic.append(el('img', { src: v, alt: opts.alt || 'Image choisie' }));
    else pic.append(icon('i-image'));
    const file = el('input', { class: 'b-sr', type: 'file', accept: 'image/*', id, 'data-fk': id });
    const pickLabel = el('span', { text: v ? (opts.replaceLabel || 'Changer l’image') : (opts.addLabel || 'Ajouter une image') });
    const pickBtn = el('label', { class: 'b-btn b-btn--ghost b-btn--sm b-filebtn' }, icon('i-upload'), pickLabel, file);
    file.addEventListener('change', () => {
      const fl = file.files && file.files[0];
      if (!fl) return;
      pickBtn.classList.add('is-busy');
      pickLabel.textContent = 'Préparation…';
      readImage(fl).then((url) => {
        acc.set(url, { now: true });
        renderTab({ focus: id });
        toast(opts.addedMsg || 'Image ajoutée');
      }).catch(() => {
        pickBtn.classList.remove('is-busy');
        pickLabel.textContent = v ? (opts.replaceLabel || 'Changer l’image') : (opts.addLabel || 'Ajouter une image');
        toast('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.');
      }).then(() => { file.value = ''; });
    });
    const remove = v ? el('button', {
      type: 'button', class: 'b-btn b-btn--quiet b-btn--sm', 'data-fk': id + '-rm',
      on: { click: () => { acc.set(null, { now: true }); renderTab({ focus: id }); toast(opts.removedMsg || 'Image retirée'); } }
    }, icon('i-trash'), 'Retirer') : null;
    return el('div', { class: 'b-field', role: 'group', 'aria-labelledby': id + '-l' },
      el('div', { class: 'b-label-row' }, el('span', { class: 'b-label', id: id + '-l', text: f.label })),
      el('div', { class: 'b-img' }, pic, el('div', { class: 'b-img__actions' }, pickBtn, remove)),
      el('p', { class: 'b-hint', text: opts.hint || 'Sans image, le modèle compose un visuel avec vos produits et vos couleurs.' }));
  }

  function itemSummary(f, item) {
    const parts = [];
    (f.itemFields || []).forEach((sf) => {
      const v = item ? item[sf.key] : undefined;
      if (sf.type === 'text') { if (String(v || '').trim()) parts.push(shorten(v, 34)); }
      else if (sf.type === 'number') { if (typeof v === 'number') parts.push(/fcfa/i.test(sf.label) ? D.formatPrice(v) : D.formatNumber(v)); }
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
        el('span', { class: 'b-item__name' }, el('span', { class: 'b-item__name-t', text: def.name }), sec.enabled ? null : el('span', { class: 'b-tag', text: 'Masquée' })),
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

  function sectionForm(sec, bodyId, def, i, n) {
    const body = el('div', { class: 'b-item__body', id: bodyId });
    if (def.description) body.append(el('p', { class: 'b-item__desc', text: def.description }));
    if (sec.type === 'categories') {
      const cats = distinctCategories();
      body.append(el('p', { class: 'b-note-box' }, icon('i-info'),
        el('span', { text: cats.length ? `Tuiles affichées${NB}: ${cats.join(', ')}. Changez les catégories dans l’onglet Produits.` : `Aucune catégorie pour l’instant${NB}: ajoutez-en dans l’onglet Produits.` })));
    }
    def.fields.forEach((f) => {
      const node = buildField(f, sectionAcc(sec.id, f.key), `b-f-${sec.id}-${f.key}`);
      if (node) body.append(node);
    });
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
    if (key === 'color' || key === 'art' || key === 'image') {
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

    body.append(textField({ key: 'name', label: 'Nom du produit', type: 'text', max: 60, placeholder: 'Beurre de karité fouetté' }, A('name'), fid('name')));

    const badgeOpts = [{ value: '', label: 'Aucun' }].concat(Object.keys(D.BADGES).map((k) => ({ value: k, label: D.BADGES[k] })));
    body.append(el('div', { class: 'b-grid2' },
      numberField({ key: 'price', label: 'Prix (FCFA)', type: 'number', placeholder: '6500' }, A('price'), fid('price'),
        { format: (v) => `Affiché${NB}: ${D.formatPrice(v)}`, selectOnFocus: true }),
      selectField({ key: 'badge', label: 'Badge', type: 'select', options: badgeOpts },
        { get: () => { const x = findProduct(pid); return x && x.badge ? x.badge : ''; }, set: (v, o) => A('badge').set(v === '' ? null : v, o) }, fid('badge'))));

    body.append(imageField({ key: 'image', label: 'Photo' }, A('image'), fid('image'), {
      hint: 'Une photo nette, à la lumière du jour. Nous la réduisons à 800 px de large pour qu’elle charge vite.',
      alt: 'Photo du produit', addLabel: 'Ajouter une photo', replaceLabel: 'Changer la photo', addedMsg: 'Photo ajoutée', removedMsg: 'Photo retirée'
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
      el('legend', { class: 'b-label', text: p.image ? 'Illustration (remplacée par la photo)' : 'Illustration (sans photo)' }),
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
      image: null
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
    if (document.getElementById(id)) return;
    document.head.append(el('link', { rel: 'stylesheet', id, href: fp.googleUrl }));
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
    change({ now: true });
    renderTab();
    toast(`Modèle ${t.name} appliqué`);
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
        on: { click: () => setTheme('palette', p.id, `Couleurs ${p.name}`) }
      },
        el('span', { class: 'b-pal__sw', style: `background:${c.bg};color:${c.text}` },
          el('span', { class: 'b-pal__aa', text: 'Aa' }),
          el('span', { class: 'b-pal__dots' },
            el('i', { style: `background:${c.accent}` }),
            el('i', { style: `background:${c.surface}` }))),
        el('span', { class: 'b-pal__name', text: p.name })));
    });
    tp.append(group('b-g-theme-palette', 'Palette', 'Une couleur de fond, une couleur forte pour les boutons et les blocs.', pals));

    // « Couleurs : Vives / Douces » (theme.intensity), drawn with the current palette
    const pal = (inColl(D.palettes, th.palette) ? D.palettes[th.palette] : D.palettes[0] || D.palettes.sable || { colors: {} }).colors || {};
    const opts = intensityOptions();
    const cur = opts.some((o) => o.value === th.intensity) ? th.intensity : (D.DEFAULT_INTENSITY || 'vivid');
    const ints = el('div', { class: 'b-intopts', role: 'group', 'aria-label': 'Couleurs' });
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
    tp.append(group('b-g-theme-intensity', 'Couleurs', `Vives${NB}: votre couleur habille toute la boutique. Douces${NB}: des fonds clairs, la couleur en touches.`, ints));

    const fonts = el('div', { class: 'b-fonts' });
    D.fontPairs.forEach((fp) => {
      ensureFontLink(fp);
      fonts.append(el('button', {
        type: 'button', class: 'b-font', 'aria-pressed': String(th.fonts === fp.id), 'data-fk': 'font-' + fp.id, 'aria-label': `Polices ${fp.name}`,
        on: { click: () => setTheme('fonts', fp.id, `Polices ${fp.name}`) }
      },
        el('span', { class: 'b-font__aa', style: `font-family:${fp.display.family};font-weight:${fp.display.weight}`, text: 'Aa' }),
        el('span', { class: 'b-font__name', text: fp.name }),
        el('span', { class: 'b-font__pair', text: `${famName(fp.display.family)} · ${famName(fp.text.family)}` })));
    });
    tp.append(group('b-g-theme-fonts', 'Polices', 'Une police pour les titres, une pour les textes.', fonts));

    tp.append(group('b-g-theme-radius', 'Arrondis', 'Pour les cartes, les images et les boutons.',
      segmented(D.RADIUS_OPTIONS, th.radius, (v, l) => setTheme('radius', v, `Arrondis${NB}: ${l}`), 'rad',
        (o) => el('span', { class: 'b-radprev', style: `border-top-left-radius:${Math.min(D.radii[o.value] || 0, 14)}px`, 'aria-hidden': 'true' }))));

    tp.append(group('b-g-theme-buttons', 'Boutons', null,
      segmented(D.BUTTON_OPTIONS, th.buttons, (v, l) => setTheme('buttons', v, `Boutons${NB}: ${l}`), 'btn',
        (o) => el('span', { class: 'b-btnprev b-btnprev--' + o.value, 'aria-hidden': 'true' }))));
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

    tp.append(group('b-g-restart', 'Changer de point de départ', `Votre boutique reste enregistrée dans ce navigateur${NB}: vous pourrez la reprendre.`,
      el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--block', 'data-fk': 'restart', on: { click: () => showStart() } },
        icon('i-back'), 'Revenir à l’écran de départ')));
  }

  /* ---------- Qualité tab ---------- */

  function renderQuality(tp) {
    const v = D.validate(S.config);
    const ok = v.status === 'APPROUVÉ';
    tp.append(tabHead('Qualité', 'Nous relisons votre fiche boutique avant publication, comme le fera Jeere.'));
    tp.append(el('div', { class: 'b-score' + (ok ? ' is-ok' : '') },
      el('div', { class: 'b-score__top' },
        el('p', { class: 'b-score__num' }, el('strong', { text: String(v.score) }), el('span', { text: '/100' })),
        el('span', { class: 'b-status' + (ok ? ' b-status--ok' : ''), text: v.status })),
      el('div', { class: 'b-meter', role: 'img', 'aria-label': `Score${NB}: ${v.score} sur 100` }, el('i', { style: `width:${v.score}%` })),
      el('p', { class: 'b-score__text', text: ok ? `Votre fiche est prête${NB}: elle pourrait être publiée telle quelle.` : 'Corrigez les points ci-dessous avant de publier.' })));

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
        ul.append(el('li', null, el('button', { type: 'button', class: 'b-issue b-issue--' + g.level, 'data-fk': fk, on: { click: () => jumpTo(iss.target) } },
          icon(g.icon, 'b-issue__ico'), el('span', { class: 'b-issue__msg', text: iss.message }), icon('i-arrow', 'b-issue__go'))));
      });
      tp.append(el('section', { class: 'b-issgroup', 'aria-label': g.title },
        el('h3', { class: 'b-group__title' }, g.title, el('span', { class: 'b-issgroup__n', text: String(items.length) })), ul));
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
  function jumpTo(target) {
    const t = target || { kind: 'store' };
    switch (t.kind) {
      case 'store':
        setTab('boutique');
        focusField(t.id === 'whatsapp' ? 'b-f-store-whatsapp' : 'b-f-store-name');
        break;
      case 'payments':
        setTab('boutique');
        focusGroup('b-g-payments');
        break;
      case 'theme':
        setTab('theme');
        focusGroup(t.id && document.getElementById('b-g-theme-' + t.id) ? 'b-g-theme-' + t.id : 'b-g-theme-template');
        break;
      case 'section':
        if (t.id && findSection(t.id)) selectTarget({ kind: 'section', id: t.id }, { reveal: true });
        else { setTab('sections'); focusEl(document.getElementById('b-sec-add')); }
        break;
      case 'product':
        if (t.id && findProduct(t.id)) selectTarget({ kind: 'product', id: t.id }, { reveal: true });
        else { setTab('produits'); const b = document.getElementById('b-p-add'); focusEl(b); pulse(b); }
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
    els.url.textContent = slug(name) + '.jeere.shop';
    if (S.open) document.title = `${name} · Jeere Studio`;
    const v = D.validate(S.config);
    els.tabScore.textContent = String(v.score);
    els.tabScore.classList.toggle('is-ok', v.status === 'APPROUVÉ');
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
    }
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
    if (t.kind === 'product') {
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
    els.ficheMeta.textContent = `${count(S.config.sections.length, 'section')} · ${count(S.config.products.length, 'produit')} · ${count(photos, 'photo')} · ${size} Ko`;
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
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !['version', 'template', 'store', 'theme', 'sections', 'products', 'payments'].some((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
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
      el('span', { class: 'b-status' + (ok ? ' b-status--ok' : ''), text: v.status }),
      el('span', { text: ok ? ` Score qualité${NB}: ${v.score}/100. Votre fiche est prête.` : ` Score qualité${NB}: ${v.score}/100. Il reste des points à corriger dans l’onglet Qualité.` })
    ]);
    openModal('m-publish');
  }

  /* ------------------------------------------------------------------ toast */

  function toast(msg, ms = 2800) {
    const t = els.toast;
    if (!t) return;
    clearTimeout(S.timers.toast);
    clearTimeout(S.timers.toastClear);
    t.classList.remove('is-on');
    t.textContent = '';
    requestAnimationFrame(() => {
      t.textContent = msg;
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
      return a === JSON.stringify(D.normalizeConfig(D.defaultConfig(cfg.template))) ||
        a === JSON.stringify(D.normalizeConfig(D.defaultConfig(cfg.template, cfg.store && cfg.store.niche)));
    } catch (e) { return false; }
  }
  function renderStart() {
    const saved = readSaved();
    if (saved) {
      const n = saved.products.length;
      const on = saved.sections.filter((s) => s.enabled).length;
      els.resumeName.textContent = String(saved.store.name || '').trim() || 'Ma boutique';
      els.resumeMeta.textContent = `Modèle ${templateOf(saved.template).name} · ${count(n, 'produit')} · ${count(on, 'section')}`;
      els.resume.hidden = false;
    } else els.resume.hidden = true;
    if (!S.startBuilt) buildTemplateCards();
  }
  function buildTemplateCards() {
    S.startBuilt = true;
    const box = els.tpls;
    box.textContent = '';
    const jobs = [];
    const shots = [];
    D.templates.forEach((t) => {
      const root = el('div');
      const screen = el('div', { class: 'b-mini__screen' }, root);
      const shot = el('div', { class: 'b-tcard__shot', 'aria-hidden': 'true', inert: true }, el('div', { class: 'b-mini' }, screen));
      const fallback = el('span', { class: 'b-tcard__schem' });
      fallback.innerHTML = SCHEMATICS[t.id] || '';
      const card = el('article', { class: 'b-tcard', 'data-template': t.id },
        shot,
        el('div', { class: 'b-tcard__body' },
          el('div', { class: 'b-tcard__head' }, el('h3', { class: 'b-tcard__name', text: t.name }), el('span', { class: 'b-chip', text: t.style })),
          el('p', { class: 'b-tcard__desc', text: t.description }),
          el('p', { class: 'b-tcard__best' }, el('span', { text: `Idéal pour${NB}: ` }), t.bestFor),
          el('button', { type: 'button', class: 'b-btn b-btn--ghost b-btn--sm b-tcard__btn', 'aria-label': `Choisir le modèle ${t.name}`, on: { click: () => chooseTemplate(t.id) } },
            el('span', { class: 'b-lbl-long', text: 'Choisir ce modèle' }), el('span', { class: 'b-lbl-short', text: 'Choisir' }), icon('i-arrow'))));
      box.append(card);
      shots.push(shot);
      jobs.push(() => {
        if (window.JeereRender && typeof window.JeereRender.render === 'function') {
          renderStoreInto(root, D.defaultConfig(t.id), 'phone', screen);
          if (root.className === 'b-noprev') { shot.textContent = ''; shot.append(fallback); shot.classList.add('is-schem'); }
        } else { shot.textContent = ''; shot.append(fallback); shot.classList.add('is-schem'); }
      });
    });
    // The mini phone (406 px wide) is scaled to the width of its card
    const scaleShots = () => shots.forEach((shot) => {
      const w = shot.clientWidth;
      if (w) shot.style.setProperty('--mini-s', String(Math.min(0.62, Math.max(0.2, (w - 20) / 406))));
    });
    scaleShots();
    if (window.ResizeObserver) { const ro = new ResizeObserver(scaleShots); shots.forEach((s) => ro.observe(s)); }
    else window.addEventListener('resize', scaleShots);
    // Render the previews one per frame so the start screen paints at once on slow phones
    const next = () => { const job = jobs.shift(); if (job) { job(); requestAnimationFrame(next); } };
    requestAnimationFrame(next);
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
    openEditor(D.defaultConfig(id));
  }
  function openAssistant() {
    const W = window.JeereWizard;
    if (W && typeof W.open === 'function') {
      try { W.open(); } catch (e) { toast('L’assistant n’a pas pu s’ouvrir. Partez d’un modèle en attendant.'); }
    } else toast('L’assistant arrive dans un instant. Réessayez, ou partez d’un modèle.');
  }

  /* ------------------------------------------------------------------ open / close */

  function openEditor(config) {
    if (!D) return;
    init();
    S.config = D.normalizeConfig(config);
    resetHistory();
    S.openSection = null; S.openProduct = null; S.openItem = {};
    S.pendingReveal = null;
    S.scrollY = { edit: 0, preview: 0 };
    S.view = 'edit';
    S.page = 'home';
    S.productId = null;
    // A new store starts with an empty demo cart (render.js keeps it on the preview element)
    ['__jstCart', '__jstForm', '__jstQty', '__jstCartCleared'].forEach((k) => { try { delete els.store[k]; } catch (e) { /* ignore */ } });
    syncPagePicks();
    S.previewDirty = true;
    els.ed.dataset.view = 'edit';
    updateViewButtons();
    hidePick();
    els.start.hidden = true;
    els.ed.hidden = false;
    document.documentElement.classList.add('b-editing');
    S.open = true;
    try { if (!(history.state && history.state.jeere === 'editor')) history.pushState({ jeere: 'editor' }, '', '#editeur'); } catch (e) { /* file:// or sandbox */ }
    S.tab = '';
    setTab('sections', { top: true });
    refreshMeta();
    window.scrollTo(0, 0);
    renderPreviewNow();
    els.stage.scrollTop = 0;
    saveNow();
    focusEl(els.tabBtns[0]);
  }
  function doShowStart() {
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

  /* ------------------------------------------------------------------ init and events */

  function grab() {
    const $ = (id) => document.getElementById(id);
    Object.assign(els, {
      root: $('b-root'), start: $('b-start'), startTitle: $('b-start-title'), tpls: $('b-tpls'),
      resume: $('b-resume'), resumeName: $('b-resume-name'), resumeMeta: $('b-resume-meta'), resumeBtn: $('b-resume-btn'), aiBtn: $('b-ai-btn'),
      ed: $('b-ed'), top: document.querySelector('.b-top'), topStore: $('b-top-store'), topName: $('b-top-name'), saved: $('b-saved'),
      undo: $('b-undo'), redo: $('b-redo'), ficheBtn: $('b-fiche-btn'), publishBtn: $('b-publish-btn'),
      panelScroll: $('b-panel-scroll'), tablist: document.querySelector('.b-tabs'),
      tabBtns: Array.from(document.querySelectorAll('.b-tab')), tabScore: $('b-tab-score'),
      stage: $('b-stage'), stageBar: document.querySelector('.b-stage__bar'), stageHint: $('b-stage-hint'), stageInner: $('b-stage-inner'),
      dwrap: $('b-dwrap'), device: $('b-device'), screen: $('b-screen'), store: $('b-store'), url: $('b-device-url'),
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
    els.pagePicks.forEach((sel) => sel.addEventListener('change', () => showPage(sel.value)));
    els.store.addEventListener('jst:navigate', onStoreNavigate);
    // render.js redraws the preview by itself (quantities, payment choice, commune): keep it tamed
    if (window.MutationObserver) {
      new MutationObserver(() => { tameStore(els.store, els.screen); if (S.hoverNode && !S.hoverNode.isConnected) hideHover(); }).observe(els.store, { childList: true });
    }
    els.ficheBtn.addEventListener('click', openFiche);
    els.publishBtn.addEventListener('click', openPublish);

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
      if (storeControl(e.target)) return;
      if (e.target.closest('a, button, form, summary')) e.preventDefault();
      const node = e.target.closest('[data-product-id], [data-section-id]');
      const t = targetOf(node);
      if (!t) return;
      if (isMobile()) { showPick(t); return; }
      flashNode(node, labelFor(t));
      selectTarget(t);
    }, true);
    els.screen.addEventListener('submit', (e) => e.preventDefault(), true);
    els.screen.addEventListener('mousemove', (e) => {
      if (!mqHover.matches || isMobile() || !(e.target instanceof Element)) return;
      // The outline shows what a click edits: none over the store's own buttons and fields
      const node = storeControl(e.target) ? null : e.target.closest('[data-product-id], [data-section-id]');
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
      if (st && st.jeere === 'editor') { if (!S.open && S.config) openEditor(S.config); }
      else if (S.open) doShowStart();
    });
    const flush = () => { if (S.open) { commit(); saveNow(); } };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
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
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = String(e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    if (isTextField(e.target)) return; // let the field undo its own typing
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  }

  function updateHint() {
    if (!els.stageHint) return;
    const h = PAGE_HINTS[rendererHasPages() ? S.page : 'home'] || PAGE_HINTS.home;
    els.stageHint.textContent = isMobile() ? h[1] : h[0];
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
    // A reload while editing lands on the start screen, with « Reprendre ma boutique »
    try { if (/^#editeur$/.test(location.hash) || (history.state && history.state.jeere === 'editor')) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    renderStart();
  }

  function getPage() { return { page: S.page, productId: S.page === 'product' ? S.productId : null }; }

  window.JeereBuilder = { openEditor, getConfig, showStart, showPage: (page, productId) => { if (S.open) showPage(page, productId); }, getPage };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
