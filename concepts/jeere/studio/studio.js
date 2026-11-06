/* Jeere Studio — the advanced editor (Figma / Framer / Webflow-like) over the same fiche
 * boutique as ../creer/. One classic script, one global: window.JeereStudio.
 *
 * It loads ../creer/data.js (JEERE_DATA) and ../creer/render.js (JeereRender) and codes
 * defensively against that contract: every access is feature-detected, every render is caught,
 * the fiche goes through normalizeConfig on load and on save, and the inspector forms are built
 * from JEERE_DATA.sectionTypes[].fields — a new field added to the contract appears here on its
 * own. The fiche lives in localStorage 'jeere-studio-config' (STORAGE_KEYS.config), shared with
 * the simple editor and the dashboard. Studio-only UI state (pro flag, locks, device focus)
 * lives in its own key 'jeere-studio-ui' and never touches the fiche.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ guards + helpers */

  var D = window.JEERE_DATA;
  var R = window.JeereRender;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ce(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  if (!D || !R || typeof D.normalizeConfig !== 'function' || typeof R.render !== 'function' ||
      !D.sectionTypes || !D.palettes || !D.templates) {
    document.addEventListener('DOMContentLoaded', function () {
      var st = $('studio');
      if (st) st.innerHTML = '<div style="padding:60px;text-align:center;font-family:Poppins,sans-serif;color:#E8E8E8">' +
        '<h1 style="font-size:19px">Le Studio n’a pas pu démarrer</h1>' +
        '<p style="color:#9E9E9E">Les fichiers de l’éditeur (../creer/data.js, ../creer/render.js) n’ont pas chargé. Rechargez la page, ou ouvrez <a href="../creer/" style="color:#CFE0FF">l’éditeur simple</a>.</p></div>';
    });
    return;
  }

  var clone = typeof D.clone === 'function' ? D.clone : function (o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } };
  var CONFIG_KEY = (D.STORAGE_KEYS && D.STORAGE_KEYS.config) || 'jeere-studio-config';
  var UI_KEY = 'jeere-studio-ui';
  var PAGES = Array.isArray(D.PAGES) && D.PAGES.length ? D.PAGES : [
    { id: 'home', label: 'Accueil' }, { id: 'product', label: 'Fiche produit' }, { id: 'cart', label: 'Panier' },
    { id: 'checkout', label: 'Paiement' }, { id: 'confirmation', label: 'Confirmation' }
  ];

  function sectionDef(type) { return (D.sectionTypes && D.sectionTypes[type]) || null; }
  function defFields(type) { var d = sectionDef(type); return (d && Array.isArray(d.fields)) ? d.fields : []; }
  function hasField(type, key) { return defFields(type).some(function (f) { return f && f.key === key; }); }

  /* ------------------------------------------------------------------ state */

  var ui = loadUI();
  var state = {
    config: loadConfig(),
    page: 'home', pageId: null, productId: null,
    sel: null,                      // {kind:'section'|'product'|'page', id, field?}
    tool: 'select',                 // 'select' | 'hand' | 'text' | 'comment'
    zoom: 1, panX: 60, panY: 80,
    deviceFocus: 'both',            // 'both' | 'phone' | 'desktop'
    activeAb: null                  // the artboard last clicked (zoom, export, contextual bar)
  };
  var clipboard = null;             // in-app clipboard: {kind:'jeere-section', data}
  var undoStack = [];
  var redoStack = [];
  var coalesceKey = null, coalesceAt = 0;

  function loadConfig() {
    var raw = null;
    try { raw = localStorage.getItem(CONFIG_KEY); } catch (e) { /* blocked */ }
    if (raw) {
      try { return D.normalizeConfig(raw); } catch (e) { /* fall through */ }
    }
    try { return D.normalizeConfig(D.defaultConfig('plateau', 'beauty')); }
    catch (e) { return D.defaultConfig('plateau', 'beauty'); }
  }

  function loadUI() {
    try {
      var u = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      return (u && typeof u === 'object') ? u : {};
    } catch (e) { return {}; }
  }
  function saveUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* conveniences only */ }
  }
  if (!ui.locked || typeof ui.locked !== 'object') ui.locked = {};

  function isLocked(id) { return !!ui.locked[id]; }

  /* ------------------------------------------------------------------ device presets (artboards) */

  /* The five artboard presets. 'phone' (390) and 'desktop' (1200) keep their historic keys and
   * element ids (rootPhone / rootDesktop); render.js only knows 'phone' | 'desktop' layouts. */
  var DEVICE_PRESETS = [
    { key: '360', width: 360, device: 'phone', name: 'Petit téléphone' },
    { key: 'phone', width: 390, device: 'phone', name: 'Téléphone' },
    { key: '768', width: 768, device: 'desktop', name: 'Tablette' },
    { key: 'desktop', width: 1200, device: 'desktop', name: 'Ordinateur' },
    { key: '1440', width: 1440, device: 'desktop', name: 'Grand écran' }
  ];
  function presetByKey(k) { return DEVICE_PRESETS.filter(function (p) { return p.key === k; })[0] || null; }
  if (!Array.isArray(ui.artboards)) ui.artboards = [];
  ui.artboards = ui.artboards.filter(function (k) { return !!presetByKey(k); });
  if (!ui.artboards.length) ui.artboards = ['phone', 'desktop'];
  function activePresets() {
    return DEVICE_PRESETS.filter(function (p) { return ui.artboards.indexOf(p.key) !== -1; });
  }
  function abKeys() { return activePresets().map(function (p) { return p.key; }); }

  /* the extension modules (studio-power.js) plug in here; every hook is optional */
  var hooks = {};

  function sections() { return Array.isArray(state.config.sections) ? state.config.sections : []; }
  function products() { return Array.isArray(state.config.products) ? state.config.products : []; }
  function customPages() { return Array.isArray(state.config.pages) ? state.config.pages : []; }
  function sectionById(id) { return sections().filter(function (s) { return s && s.id === id; })[0] || null; }
  function sectionType(id) { var s = sectionById(id); return (s && s.type) || ''; }
  function productById(id) { return products().filter(function (p) { return p && p.id === id; })[0] || null; }
  function pageById(id) { return customPages().filter(function (p) { return p && p.id === id; })[0] || null; }

  function sectionName(s) {
    if (!s) return '';
    var def = sectionDef(s.type);
    var base = def && def.name ? def.name : s.type;
    var t = s.settings && typeof s.settings.title === 'string' && s.settings.title.trim() ? s.settings.title.trim() : '';
    if (s.type === 'hero' && s.settings && typeof s.settings.title === 'string' && s.settings.title.trim()) t = s.settings.title.trim();
    return t || base;
  }

  /* multi-selection ({ kind: 'multi', ids: [...] }): always section ids, in fiche order */
  function isMulti(sel) { return !!(sel && sel.kind === 'multi' && Array.isArray(sel.ids)); }
  function selectedSectionIds() {
    var sel = state.sel;
    if (isMulti(sel)) return sel.ids.slice();
    if (sel && sel.kind === 'section') return [sel.id];
    return [];
  }
  function orderIds(ids) {
    var set = {};
    ids.forEach(function (id) { set[id] = true; });
    return sections().map(function (s) { return s.id; }).filter(function (id) { return set[id]; });
  }

  function toggleMulti(id) {
    if (isLocked(id) || !sectionById(id)) return;
    var ids = selectedSectionIds();
    var at = ids.indexOf(id);
    if (at === -1) ids.push(id); else ids.splice(at, 1);
    ids = orderIds(ids);
    if (!ids.length) select(null);
    else if (ids.length === 1) select({ kind: 'section', id: ids[0] });
    else select({ kind: 'multi', ids: ids });
  }

  function selectAllSections() {
    var ids = sections().map(function (s) { return s.id; }).filter(function (id) { return !isLocked(id); });
    if (!ids.length) { toast('Aucune section à sélectionner.'); return; }
    if (state.page !== 'home') showPage('home');
    if (ids.length === 1) select({ kind: 'section', id: ids[0] });
    else select({ kind: 'multi', ids: ids });
    toast(ids.length + ' sections sélectionnées.', 'info');
  }

  /* ------------------------------------------------------------------ history */

  function snapshot() { return clone(state.config); }

  function commit(label, mutate, opts) {
    opts = opts || {};
    var now = Date.now();
    /* a burst (typing, scrubbing a value at 60 fps) keeps the first 'before': no snapshot to take */
    var coalescing = !!(opts.coalesce && coalesceKey === opts.coalesce && now - coalesceAt < 1200 && undoStack.length);
    var before = coalescing ? null : snapshot();
    try { mutate(state.config); } catch (e) { toast('La modification n’a pas pu être appliquée.', 'err'); return; }
    if (coalescing) {
      undoStack[undoStack.length - 1].label = label; // keep the first 'before' of the burst
    } else {
      undoStack.push({ label: label, before: before });
      if (undoStack.length > 120) undoStack.shift();
    }
    coalesceKey = opts.coalesce || null;
    coalesceAt = now;
    redoStack.length = 0;
    afterChange(opts);
  }

  /* an entry that undoes itself (the DualEngine sections: RFC 6902 patches, studio-engine.js) */
  function pushEntry(entry) {
    undoStack.push(entry);
    if (undoStack.length > 120) undoStack.shift();
    coalesceKey = null;
    redoStack.length = 0;
  }
  function runEntry(entry, dir, from, to) {
    try { entry[dir](); } catch (e) { from.push(entry); toast('La modification n’a pas pu être ' + (dir === 'undo' ? 'annulée.' : 'rétablie.'), 'err'); return; }
    to.push(entry);
    coalesceKey = null;
    validateSelection();
    afterChange({ structure: true, engineEntry: true });
    toast((dir === 'undo' ? 'Annulé : ' : 'Rétabli : ') + entry.label.toLowerCase(), 'info');
  }

  function undo() {
    if (!undoStack.length) { toast('Rien à annuler.'); return; }
    var entry = undoStack.pop();
    if (typeof entry.undo === 'function') { runEntry(entry, 'undo', undoStack, redoStack); return; }
    redoStack.push({ label: entry.label, before: snapshot() });
    state.config = entry.before;
    coalesceKey = null;
    validateSelection();
    afterChange({ structure: true });
    toast('Annulé : ' + entry.label.toLowerCase(), 'info');
  }

  function redo() {
    if (!redoStack.length) { toast('Rien à rétablir.'); return; }
    var entry = redoStack.pop();
    if (typeof entry.redo === 'function') { runEntry(entry, 'redo', redoStack, undoStack); return; }
    undoStack.push({ label: entry.label, before: snapshot() });
    state.config = entry.before;
    coalesceKey = null;
    validateSelection();
    afterChange({ structure: true });
    toast('Rétabli : ' + entry.label.toLowerCase(), 'info');
  }

  function validateSelection() {
    var sel = state.sel;
    if (!sel) return;
    if (isMulti(sel)) {
      var ids = sel.ids.filter(function (id) { return !!sectionById(id); });
      state.sel = !ids.length ? null : (ids.length === 1 ? { kind: 'section', id: ids[0] } : { kind: 'multi', ids: ids });
      sel = state.sel;
      if (!sel) return;
    }
    if (sel.kind === 'section' && !sectionById(sel.id)) state.sel = null;
    if (sel.kind === 'product' && !productById(sel.id)) state.sel = null;
    if (sel.kind === 'page' && !pageById(sel.id)) state.sel = null;
    if (state.page === 'page' && state.pageId && !pageById(state.pageId)) { state.page = 'home'; state.pageId = null; }
    if (state.sel && hooks.validateSelection) { try { state.sel = hooks.validateSelection(state.sel); } catch (e) { /* module error */ } }
  }

  /* ------------------------------------------------------------------ save (autosave + Ctrl+S) */

  var saveTimer = null;
  var saveStateEl, saveLabelEl;

  function setSaveState(s, label) {
    if (!saveStateEl) return;
    saveStateEl.dataset.state = s;
    saveLabelEl.textContent = label || (s === 'saved' ? 'Enregistré' : s === 'saving' ? 'Enregistrement…' : 'Non enregistré');
    /* the label collapses to the dot on narrow top bars: the state stays in the tooltip */
    saveStateEl.title = saveLabelEl.textContent;
    saveStateEl.setAttribute('aria-label', saveLabelEl.textContent);
  }

  function scheduleSave() {
    setSaveState('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var out;
    try { out = D.normalizeConfig(state.config); } catch (e) { out = state.config; }
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(out));
      setSaveState('saved');
      if (hooks.afterSave) { try { hooks.afterSave(out); } catch (e2) { /* a module failed, not the save */ } }
      return true;
    } catch (e) {
      setSaveState('error', 'Non enregistré');
      toast('Ce navigateur bloque l’enregistrement : vos changements seront perdus en fermant la page.', 'err');
      return false;
    }
  }

  /* ------------------------------------------------------------------ change pipeline */

  var renderQueued = false;

  function afterChange(opts) {
    opts = opts || {};
    /* element styles (the Design tab): only the scoped <style> of each artboard changes — no
     * re-render, no tree rebuild — so a value scrubbed at 60 fps stays live in every artboard */
    if (opts.styleOnly) {
      applyElStyles();
      scheduleSave();
      syncTopBar();
      if (hooks.afterChange) { try { hooks.afterChange(opts); } catch (e) { /* module error, not ours */ } }
      return;
    }
    if (opts.structure) prevCache = {}; // the insert previews render in the current style: drop them when it moves
    scheduleRender();
    scheduleSave();
    buildTree();
    if (opts.structure) buildInspector();
    syncTopBar();
    if (hooks.afterChange) { try { hooks.afterChange(opts); } catch (e) { /* module error, not ours */ } }
  }

  /* the element styles of the fiche on every artboard (elstyles.js); hooks.elStyleOptions lets the
   * Design tab show a state being edited (force) and switch transitions off while scrubbing */
  var styleQueued = false;
  function applyElStyles(sync) {
    if (!sync) {
      if (styleQueued) return;
      styleQueued = true;
      requestAnimationFrame(function () { styleQueued = false; applyElStyles(true); });
      return;
    }
    var ES = window.JeereElStyles;
    if (!ES || typeof ES.apply !== 'function') return;
    var o = null;
    if (hooks.elStyleOptions) { try { o = hooks.elStyleOptions(); } catch (e) { o = null; } }
    activePresets().forEach(function (p) {
      var rootEl = roots[p.key];
      if (rootEl) { try { ES.apply(state.config, rootEl, o || undefined); } catch (e) { /* a layer, never a failure */ } }
    });
    positionTags();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () { renderQueued = false; renderArtboards(); });
  }

  /* ------------------------------------------------------------------ artboards */

  var stage, world, roots = {}, abEls = {};

  /* The artboards are built from ui.artboards (the device-preset chips): any combination of the
   * five presets, laid out left to right by width. 390 and 1200 keep their historic ids so the
   * outside world (tests, muscle memory) still finds #rootPhone / #rootDesktop. */
  function abElId(key) { return key === 'phone' ? 'abPhone' : key === 'desktop' ? 'abDesktop' : 'ab' + key; }
  function abRootId(key) { return key === 'phone' ? 'rootPhone' : key === 'desktop' ? 'rootDesktop' : 'root' + key; }

  function rebuildArtboards() {
    if (!world) return;
    var list = activePresets();
    Object.keys(abEls).forEach(function (k) {
      if (list.some(function (p) { return p.key === k; })) return;
      if (abEls[k] && abEls[k].remove) abEls[k].remove();
      delete abEls[k];
      delete roots[k];
    });
    var x = 0;
    list.forEach(function (p) {
      var ab = abEls[p.key];
      if (!ab) {
        ab = ce('section', 'st-ab');
        ab.id = abElId(p.key);
        ab.setAttribute('data-ab', p.key);
        var nm = ce('div', 'st-ab__name', esc(p.name) + ' <span>' + p.width + '</span>');
        var frame = ce('div', 'st-ab__frame');
        frame.style.width = p.width + 'px';
        var rootEl = ce('div', 'st-ab__root');
        rootEl.id = abRootId(p.key);
        frame.appendChild(rootEl);
        ab.appendChild(nm);
        ab.appendChild(frame);
        world.appendChild(ab);
        roots[p.key] = rootEl;
        abEls[p.key] = ab;
        rootEl.addEventListener('jst:navigate', onNavigate);
        observeRoot(rootEl);
      }
      ab.style.left = x + 'px';
      ab.style.top = '0px';
      x += p.width + 80;
    });
    applyDeviceFocusClasses();
    syncAbChips();
  }

  /* photos load after the render and push the sections down: the selection boxes follow */
  var decorQueued = false;
  var rootObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(function () {
    if (decorQueued) return;
    decorQueued = true;
    requestAnimationFrame(function () { decorQueued = false; positionTags(); });
  }) : null;
  function observeRoot(rootEl) { if (rootObserver) { try { rootObserver.observe(rootEl); } catch (e) { /* old engine */ } } }

  function syncAbChips() {
    var box = $('abChips');
    if (!box) return;
    box.querySelectorAll('button[data-ab]').forEach(function (b) {
      var on = ui.artboards.indexOf(b.getAttribute('data-ab')) !== -1;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function toggleArtboard(key) {
    var p = presetByKey(key);
    if (!p) return;
    var at = ui.artboards.indexOf(key);
    if (at !== -1 && ui.artboards.length <= 1) { toast('Gardez au moins un artboard.', 'warn'); return; }
    if (at !== -1) ui.artboards.splice(at, 1);
    else ui.artboards = DEVICE_PRESETS.map(function (x) { return x.key; }).filter(function (k) {
      return k === key || ui.artboards.indexOf(k) !== -1;
    });
    saveUI();
    rebuildArtboards();
    renderArtboards();
    /* removing the last artboard of the focused device must not leave an empty canvas:
     * fall back to « les deux aperçus » so something stays visible */
    if (!visiblePresets().length) setDeviceFocus('both');
    requestAnimationFrame(fit);
    toast(at !== -1 ? 'Artboard « ' + p.name + ' ' + p.width + ' » retiré.' : 'Artboard « ' + p.name + ' ' + p.width + ' » ajouté.', 'info');
  }

  function renderArtboards() {
    activePresets().forEach(function (p) {
      var rootEl = roots[p.key];
      if (!rootEl) return;
      try {
        R.render(state.config, rootEl, { device: p.device, page: state.page, productId: state.productId, pageId: state.pageId });
      } catch (e) {
        try {
          rootEl.className = '';
          rootEl.innerHTML = '<div class="st-ab__err">L’aperçu n’a pas pu être affiché.<small>La fiche boutique est peut-être abîmée. Annulez la dernière action (Ctrl Z), ou importez une fiche valide.</small></div>';
        } catch (e2) { /* nothing more */ }
      }
    });
    /* render() applied the element styles; the Design tab may want a state shown on top */
    if (hooks.elStyleOptions) applyElStyles(true);
    applyDecor();
    if (hooks.afterRender) { try { hooks.afterRender(); } catch (e) { /* module error */ } }
  }

  /* The selection and hover outlines live on the rendered store nodes, re-applied after every
   * render (render replaces innerHTML). */

  function fieldSelectors(type, field) {
    var m = {
      title: ['.jst-hero-title', '.jst-about-title', '.jst-h', 'h1', 'h2', 'h3'],
      text: ['.jst-hero-text', '.jst-ann-item', 'p'],
      kicker: ['.jst-kicker', '.jst-tag'],
      button: ['.jst-btn', 'button', 'a[class*="btn"]']
    };
    return m[field] || null;
  }

  function findFieldEl(secEl, type, field) {
    var sels = fieldSelectors(type, field);
    if (!sels) return null;
    for (var i = 0; i < sels.length; i++) {
      var n = null;
      try { n = secEl.querySelector(sels[i]); } catch (e) { n = null; }
      if (n) return n;
    }
    return null;
  }

  /* design sub-elements (the elstyles.js registry): a selection may carry sel.el, the element key
   * ('image', 'copy', 'price'…) with or without a fiche field; the header and the footer are the
   * « chrome » selection { kind: 'chrome', id: '@header' | '@footer', el? } */
  function esElements(type) {
    var ES = window.JeereElStyles;
    try { return ES && ES.elementsFor ? ES.elementsFor(type) : []; } catch (e) { return []; }
  }
  function chromeEl(rootEl, id) { return rootEl ? rootEl.querySelector(id === '@footer' ? '.jst-footer' : '.jst-header') : null; }
  function chromeName(id) { return id === '@footer' ? 'Pied de page' : 'En-tête'; }
  function isSubSel(sel) {
    return !!(sel && (sel.kind === 'section' || sel.kind === 'chrome') && (sel.field || sel.el));
  }
  function subElOf(scopeEl, sel) {
    if (!scopeEl || !sel) return null;
    if (sel.el) {
      var type = sel.kind === 'chrome' ? sel.id : (scopeEl.getAttribute('data-section-type') || '');
      var def = esElements(type).filter(function (d) { return d.key === sel.el; })[0];
      if (def) {
        if (!def.sel) return scopeEl;
        try { return scopeEl.querySelector(def.sel); } catch (e) { return null; }
      }
    }
    if (sel.field) return findFieldEl(scopeEl, sel.fieldType || '', sel.field);
    return null;
  }
  /* the deepest design element under the pointer, inside a section (or the header / footer) */
  function designElAt(scopeEl, type, target) {
    var best = null, bestNode = null;
    esElements(type).forEach(function (d) {
      if (!d.sel) return;
      var n = null;
      try { n = target.closest ? target.closest(d.sel) : null; } catch (e) { n = null; }
      if (!n || !scopeEl.contains(n) || n === scopeEl) return;
      if (!bestNode || bestNode.contains(n)) { best = d; bestNode = n; }
    });
    if (!best && lastPt && lastPt.target === target) best = imageUnder(scopeEl, type, lastPt.x, lastPt.y);
    return best;
  }
  /* a photo under a decorative layer (the hero's scrim, a veil): what is under the pointer, top first; the first
   * layer that belongs to a design element decides, so a title or a button over the photo still wins */
  var lastPt = null;
  function imageUnder(scopeEl, type, x, y) {
    if (!document.elementsFromPoint || x == null) return null;
    var stack = document.elementsFromPoint(x, y), defs = esElements(type).filter(function (d) { return !!d.sel; });
    for (var i = 0; i < stack.length; i++) {
      var n = stack[i];
      if (n === scopeEl || !scopeEl.contains(n)) return null;
      var hit = null, hitNode = null;
      defs.forEach(function (d) {
        var m = null;
        try { m = n.closest(d.sel); } catch (e) { m = null; }
        if (!m || m === scopeEl || !scopeEl.contains(m)) return;
        if (!hitNode || hitNode.contains(m)) { hit = d; hitNode = m; }
      });
      if (hit) return hit.kind === 'image' ? hit : null;
      // something readable on top (a title, a price…): not a photo click. Only empty decorative layers are seen through
      if (n.tagName !== 'IMG' && (n.textContent || '').trim()) return null;
    }
    return null;
  }
  function hitChrome(t) { return t && t.closest ? t.closest('.jst-header, .jst-footer') : null; }

  function applyDecor() {
    if (hovEl && !document.contains(hovEl)) { hovEl = null; drawHoverBox(null); }
    abKeys().forEach(function (dev) {
      var rootEl = roots[dev];
      if (!rootEl) return;
      rootEl.querySelectorAll('.st-sel, .st-sel--sub, .st-hov, .st-lockhint').forEach(function (n) {
        n.classList.remove('st-sel', 'st-sel--sub', 'st-hov', 'st-lockhint');
        if (n.hasAttribute('data-st-name')) n.removeAttribute('data-st-name');
      });
      var sel = state.sel;
      if (!sel) return;
      if (isMulti(sel)) {
        sel.ids.forEach(function (id) {
          var el = rootEl.querySelector('[data-section-id="' + cssEsc(id) + '"]');
          if (el) el.classList.add('st-sel');
        });
      } else if (sel.kind === 'section') {
        var secEl = rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
        if (!secEl) return;
        secEl.classList.add('st-sel');
        secEl.setAttribute('data-st-name', sectionName(sectionById(sel.id)));
        if (isSubSel(sel)) {
          var f = subElOf(secEl, sel);
          if (f) f.classList.add('st-sel--sub');
        }
      } else if (sel.kind === 'chrome') {
        var chEl = chromeEl(rootEl, sel.id);
        if (chEl) {
          chEl.classList.add('st-sel');
          var cf = sel.el ? subElOf(chEl, sel) : null;
          if (cf && cf !== chEl) cf.classList.add('st-sel--sub');
        }
      } else if (sel.kind === 'product') {
        var cards = rootEl.querySelectorAll('[data-product-id="' + cssEsc(sel.id) + '"]');
        if (cards.length) {
          var p = productById(sel.id);
          cards[0].setAttribute('data-st-name', p && p.name ? p.name : 'Produit');
        }
        cards.forEach(function (c) { c.classList.add('st-sel'); });
      }
    });
    positionTags();
  }

  /* The Figma-style name tag is a studio-owned element in the artboard layer (a sibling of the
   * frame), never inside the rendered store: .jst clips its overflow, which used to swallow the
   * tag of the first section and paint it over the section above for the others. */
  /* The selection is drawn by the studio, in the artboard layer, ABOVE the rendered store: an
   * outline painted on the store node itself vanished under positioned children (the desktop
   * hero showed no outline at all) and blended into a #3657FF accent. Boxes are world-space
   * (they follow pan and zoom for free); their stroke is divided by the zoom, so it stays 2 px. */
  function frameScale(frame) {
    var w = frame.offsetWidth || 1;
    var r = frame.getBoundingClientRect();
    return r.width / w || state.zoom || 1;
  }
  function rectInFrame(el, frame) {
    var fr = frame.getBoundingClientRect();
    var tr = el.getBoundingClientRect();
    var k = frameScale(frame);
    return { x: (tr.left - fr.left) / k, y: (tr.top - fr.top) / k, w: tr.width / k, h: tr.height / k };
  }
  function selectionTargets(rootEl) {
    var sel = state.sel, out = [];
    if (!sel || !rootEl) return out;
    if (isMulti(sel)) {
      sel.ids.forEach(function (id) {
        var el = rootEl.querySelector('[data-section-id="' + cssEsc(id) + '"]');
        if (el) out.push({ el: el, sub: false });
      });
    } else if (sel.kind === 'section') {
      var secEl = rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
      if (secEl) {
        var sub = isSubSel(sel) ? subElOf(secEl, sel) : null;
        out.push({ el: secEl, sub: false, dim: !!(sub && sub !== secEl) });
        if (sub && sub !== secEl) out.push({ el: sub, sub: true });
      }
    } else if (sel.kind === 'chrome') {
      var chEl = chromeEl(rootEl, sel.id);
      if (chEl) {
        var csub = sel.el ? subElOf(chEl, sel) : null;
        out.push({ el: chEl, sub: false, dim: !!(csub && csub !== chEl) });
        if (csub && csub !== chEl) out.push({ el: csub, sub: true });
      }
    } else if (sel.kind === 'product') {
      rootEl.querySelectorAll('[data-product-id="' + cssEsc(sel.id) + '"]').forEach(function (c) { out.push({ el: c, sub: false }); });
    }
    return out;
  }
  function drawSelBoxes() {
    abKeys().forEach(function (dev) {
      var ab = abEls[dev], rootEl = roots[dev];
      if (!ab || !rootEl) return;
      var frame = ab.querySelector('.st-ab__frame');
      var layer = ab.querySelector('.st-ab__sel');
      if (!layer) { layer = ce('div', 'st-ab__sel'); ab.appendChild(layer); }
      layer.innerHTML = '';
      if (!frame || ab.classList.contains('is-hidden')) return;
      selectionTargets(rootEl).forEach(function (t) {
        var r = rectInFrame(t.el, frame);
        if (!r.w || !r.h) return;
        var b = ce('div', 'st-selbox' + (t.sub ? ' st-selbox--sub' : '') + (t.dim ? ' st-selbox--dim' : ''));
        b.style.left = r.x + 'px';
        b.style.top = r.y + 'px';
        b.style.width = r.w + 'px';
        b.style.height = r.h + 'px';
        layer.appendChild(b);
      });
    });
  }
  /* the hover box: one, on the artboard under the pointer */
  function drawHoverBox(secEl) {
    abKeys().forEach(function (dev) {
      var ab = abEls[dev];
      var hb = ab && ab.querySelector('.st-hovbox');
      if (hb && (!secEl || !ab.contains(secEl))) hb.hidden = true;
    });
    if (!secEl) return;
    var ab = secEl.closest('.st-ab');
    var frame = ab && ab.querySelector('.st-ab__frame');
    if (!ab || !frame) return;
    var hb = ab.querySelector('.st-hovbox');
    if (!hb) { hb = ce('div', 'st-hovbox'); ab.appendChild(hb); }
    var r = rectInFrame(secEl, frame);
    hb.classList.toggle('is-locked', secEl.classList.contains('st-lockhint'));
    hb.style.left = r.x + 'px';
    hb.style.top = r.y + 'px';
    hb.style.width = r.w + 'px';
    hb.style.height = r.h + 'px';
    hb.hidden = false;
  }

  function positionTags() {
    drawSelBoxes();
    /* like Figma: ONE name label, on the active artboard (the one last clicked) — with five
     * artboards at fit zoom, five copies of the label overlapped everything. The contextual
     * bar (studio-toolbar.js) carries the name when it is shown; the tag is the fallback. */
    var primary = primaryKey();
    abKeys().forEach(function (dev) {
      var ab = abEls[dev], rootEl = roots[dev];
      if (!ab || !rootEl) return;
      var tag = ab.querySelector('.st-ab__tag');
      if (dev !== primary) { if (tag) tag.hidden = true; return; }
      var sel = state.sel, target = null, text = '';
      if (sel && isMulti(sel)) {
        /* the Figma-style count badge: « 3 sections », pinned on the first selected section */
        target = rootEl.querySelector('[data-section-id="' + cssEsc(sel.ids[0]) + '"]');
        text = sel.ids.length + ' sections';
      } else if (sel && sel.kind === 'section') {
        target = rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
        text = sectionName(sectionById(sel.id));
      } else if (sel && sel.kind === 'product') {
        target = rootEl.querySelector('[data-product-id="' + cssEsc(sel.id) + '"]');
        var p = productById(sel.id);
        text = p && p.name ? p.name : 'Produit';
      } else if (sel && sel.kind === 'chrome') {
        target = chromeEl(rootEl, sel.id);
        text = chromeName(sel.id);
      }
      if (!target) { if (tag) tag.hidden = true; return; }
      if (!tag) { tag = ce('div', 'st-ab__tag'); ab.appendChild(tag); }
      tag.hidden = false;
      text = String(text || '');
      tag.textContent = text.length > 28 ? text.slice(0, 27) + '…' : text;
      var frame = ab.querySelector('.st-ab__frame');
      var r = frame ? rectInFrame(target, frame) : { x: 0, y: 0 };
      tag.style.left = r.x + 'px';
      /* never above the artboard's own name: a section at the very top gets its tag inside */
      tag.classList.toggle('is-inside', r.y < 22);
      tag.style.top = (r.y < 22 ? r.y + 4 : r.y) + 'px';
      if (frame) tag.style.maxWidth = frame.getBoundingClientRect().width + 'px';
    });
    if (hooks.afterDecor) { try { hooks.afterDecor(); } catch (e) { /* module error */ } }
  }

  function cssEsc(s) {
    s = String(s == null ? '' : s);
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /* ------------------------------------------------------------------ viewport: zoom + pan */

  /* 10 % to 25 600 % (SPEC-DUALENGINE §1.1) */
  var ZOOM_MIN = 0.1, ZOOM_MAX = 256;

  function applyTransform() {
    world.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
    world.style.setProperty('--inv', String(1 / state.zoom));
    stage.style.backgroundPosition = state.panX + 'px ' + state.panY + 'px';
    var d = clamp(24 * state.zoom, 8, 96);
    stage.style.backgroundSize = d + 'px ' + d + 'px';
    var zb = $('zoomLabel') || $('zoomBtn');
    if (zb) zb.childNodes[0].nodeValue = Math.round(state.zoom * 100) + ' % ';
    if (hooks.viewChanged) { try { hooks.viewChanged(); } catch (e) { /* module error */ } }
  }

  /* camera moves the seller asked for (fit, zoom to selection, follow the selection, zoom menu)
   * glide for 200 ms; the state is final at once, only the picture eases. Wheel, pinch and
   * drags stay direct. */
  var camTimer = null;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function camera(fn) {
    if (!world || reducedMotion) { fn(); return; }
    world.classList.add('is-cam');
    stage.classList.add('is-cam');
    fn();
    if (camTimer) clearTimeout(camTimer);
    camTimer = setTimeout(function () {
      camTimer = null;
      world.classList.remove('is-cam');
      stage.classList.remove('is-cam');
      if (hooks.viewChanged) { try { hooks.viewChanged(); } catch (e) { /* module error */ } }
    }, 220);
  }

  function setZoom(z, cx, cy) {
    z = clamp(z, ZOOM_MIN, ZOOM_MAX);
    var r = stage.getBoundingClientRect();
    var px = (cx == null ? r.width / 2 : cx - r.left);
    var py = (cy == null ? r.height / 2 : cy - r.top);
    var wx = (px - state.panX) / state.zoom;
    var wy = (py - state.panY) / state.zoom;
    state.zoom = z;
    state.panX = px - wx * z;
    state.panY = py - wy * z;
    applyTransform();
  }

  function visiblePresets() {
    return activePresets().filter(function (p) {
      if (state.deviceFocus === 'phone') return p.device === 'phone';
      if (state.deviceFocus === 'desktop') return p.device === 'desktop';
      return true;
    });
  }
  function visibleABs() {
    return visiblePresets().map(function (p) { return abEls[p.key]; }).filter(Boolean);
  }
  /* the artboard that stands for the selection (zoom/pan/measure/export/contextual bar): the one
   * the seller last clicked, when it is still shown — else the first visible one */
  function primaryKey() {
    var vis = visiblePresets();
    if (state.activeAb && vis.some(function (p) { return p.key === state.activeAb; })) return state.activeAb;
    return vis.length ? vis[0].key : (abKeys()[0] || null);
  }
  function setActiveAbFrom(target) {
    var ab = target && target.closest ? target.closest('.st-ab') : null;
    var k = ab ? ab.getAttribute('data-ab') : null;
    if (k && k !== state.activeAb) state.activeAb = k;
  }

  /* « Ajuster à l'écran » matches the opening framing: the artboard widths fit, the view starts
   * at the top of the pages. Fitting the FULL page heights (~6000px) landed at an unreadable
   * 13 % where the two artboards were slivers — nothing like what Ctrl+0 means in Figma. */
  function fit() { fitWidthTop(); }

  /* Shift+2, like Figma: zoom on the selection (falls back to fit without one). */
  function zoomToSelection() {
    var sel = state.sel;
    if (!sel) { fit(); return; }
    var dev = primaryKey();
    var rootEl = roots[dev];
    if (rootEl && isMulti(sel)) sel = { kind: 'section', id: sel.ids[0] };
    var n = null;
    if (rootEl && sel.kind === 'section') n = rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
    if (rootEl && sel.kind === 'product') n = rootEl.querySelector('[data-product-id="' + cssEsc(sel.id) + '"]');
    if (!n) { fit(); return; }
    var nr = n.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    var wx = (nr.left - sr.left - state.panX) / state.zoom;
    var wy = (nr.top - sr.top - state.panY) / state.zoom;
    var ww = Math.max(1, nr.width / state.zoom), wh = Math.max(1, nr.height / state.zoom);
    var z = clamp(Math.min((sr.width - 160) / ww, (sr.height - 140) / wh), ZOOM_MIN, 2);
    state.zoom = z;
    state.panX = (sr.width - ww * z) / 2 - wx * z;
    state.panY = (sr.height - wh * z) / 2 - wy * z;
    applyTransform();
  }

  function fitWidthTop() {
    // The opening view: both artboards fit in width, aligned near the top (a Figma-like landing).
    var abs = visibleABs();
    if (!abs.length) return;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    abs.forEach(function (ab) {
      x0 = Math.min(x0, ab.offsetLeft);
      y0 = Math.min(y0, ab.offsetTop);
      x1 = Math.max(x1, ab.offsetLeft + ab.offsetWidth);
    });
    var r = stage.getBoundingClientRect();
    var z = clamp((r.width - 120) / Math.max(1, x1 - x0), ZOOM_MIN, 1);
    state.zoom = z;
    state.panX = (r.width - (x1 - x0) * z) / 2 - x0 * z;
    state.panY = 56 - y0 * z;
    applyTransform();
  }

  function panToSelection() {
    var sel = state.sel;
    if (!sel) return;
    var dev = primaryKey();
    var rootEl = roots[dev];
    if (!rootEl) return;
    if (isMulti(sel)) sel = { kind: 'section', id: sel.ids[0] };
    var n = null;
    if (sel.kind === 'section') n = rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
    if (sel.kind === 'product') n = rootEl.querySelector('[data-product-id="' + cssEsc(sel.id) + '"]');
    if (!n) return;
    var nr = n.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    /* like Figma: the view only moves when the selection is (nearly) out of sight, and then just
     * enough to bring it in — no recentring that parks the other artboard off-screen */
    var visH = Math.min(nr.bottom, sr.bottom - 64) - Math.max(nr.top, sr.top + 8);
    var visW = Math.min(nr.right, sr.right) - Math.max(nr.left, sr.left);
    var needY = visH < Math.min(80, nr.height * 0.5);
    var needX = visW < Math.min(80, nr.width * 0.5);
    if (!needY && !needX) return;
    var dx = 0, dy = 0;
    if (needY) dy = (sr.top + 72) - nr.top;
    if (needX) dx = (nr.left < sr.left || nr.width > sr.width - 80) ? (sr.left + 40) - nr.left : (sr.right - 40) - nr.right;
    camera(function () {
      state.panX += dx;
      state.panY += dy;
      applyTransform();
    });
  }

  /* wheel: Ctrl/Cmd (and trackpad pinch) zooms towards the cursor; plain wheel pans */
  function onWheel(e) {
    e.preventDefault();
    if (onStageUI(e.target) && !(e.ctrlKey || e.metaKey) && e.target.closest('.st-pop, .st-pinlayer')) return;
    closeCtx();
    if (e.ctrlKey || e.metaKey) {
      var factor = Math.exp(-e.deltaY * 0.0022);
      setZoom(state.zoom * factor, e.clientX, e.clientY);
    } else {
      state.panX -= e.shiftKey ? e.deltaY : e.deltaX;
      state.panY -= e.shiftKey ? 0 : e.deltaY;
      applyTransform();
    }
  }

  /* pan: space+drag, middle-drag, or the hand tool */
  var pan = null;
  var spaceHeld = false;
  var suppressClick = false;

  /* the studio's own floating UI inside the stage (tool bar, popovers, contextual bar…) is
   * chrome, not canvas: no pan, no drag, no selection from there */
  var STAGE_UI = '.st-ftb, .st-pop, .st-selbar, .st-pinlayer, .st-coach, .st-pin, .dz-qbar, .dz-cropbar, .dz-crop, .dz-ov__rad';
  function onStageUI(t) { return !!(t && t.closest && t.closest(STAGE_UI)); }

  function onStagePointerDown(e) {
    if (onStageUI(e.target)) return;
    if (insideFrame(e.target)) setActiveAbFrom(e.target);
    if (e.button === 1 || spaceHeld || state.tool === 'hand') {
      pan = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY, moved: false };
      stage.classList.add('is-panning');
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && state.tool === 'select') maybeStartCanvasDrag(e);
  }

  /* ------------------------------------------------------------------ drag a section on the canvas
   * Sections are the unit of layout (they stay correct on every phone), so the canvas drag moves
   * a whole section, with the same blue drop line as the insert drag. Grabbing a sub-element
   * that is selected explains the model instead of doing nothing. */

  var canvasDrag = null;
  var hintAt = {};
  function hintOnce(key, msg, every) {
    var now = Date.now();
    if (hintAt[key] && now - hintAt[key] < (every || 8000)) return;
    hintAt[key] = now;
    toast(msg, 'info');
  }

  function dropAt(frame, clientY, skipId) {
    var secEls = Array.prototype.slice.call(frame.querySelectorAll('[data-section-id]'));
    var y = null, beforeId = null; // null = at the end
    for (var i = 0; i < secEls.length; i++) {
      var r = secEls[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) { beforeId = secEls[i].getAttribute('data-section-id'); y = r.top; break; }
    }
    var fr = frame.getBoundingClientRect();
    if (y === null) y = secEls.length ? secEls[secEls.length - 1].getBoundingClientRect().bottom : fr.top + 40;
    return { beforeId: beforeId, y: y, fr: fr };
  }
  function showDropline(d) {
    var dropline = $('dropline');
    var sr = stage.getBoundingClientRect();
    dropline.style.left = (d.fr.left - sr.left) + 'px';
    dropline.style.width = d.fr.width + 'px';
    dropline.style.top = (d.y - sr.top - 1) + 'px';
    dropline.hidden = false;
  }

  function maybeStartCanvasDrag(e) {
    var frame = insideFrame(e.target);
    if (!frame || state.page !== 'home') return;
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    var secEl = hitSection(e.target);
    if (!secEl) return;
    var id = secEl.getAttribute('data-section-id');
    if (isLocked(id)) return;
    var selected = state.sel && state.sel.kind === 'section' && state.sel.id === id;
    if (e.pointerType === 'touch' && (!selected || touchCount() > 0)) return; // a finger drags the selected section only
    var subEl = selected && isSubSel(state.sel) ? secEl.querySelector('.st-sel--sub') : null;
    canvasDrag = { id: id, x: e.clientX, y: e.clientY, moved: false, pid: e.pointerId, frame: frame,
      sub: !!(subEl && subEl.contains(e.target)), drop: null };
    window.addEventListener('pointermove', onCanvasDragMove);
    window.addEventListener('pointerup', onCanvasDragUp);
    window.addEventListener('pointercancel', cancelCanvasDrag);
  }
  function endCanvasDragListeners() {
    window.removeEventListener('pointermove', onCanvasDragMove);
    window.removeEventListener('pointerup', onCanvasDragUp);
    window.removeEventListener('pointercancel', cancelCanvasDrag);
  }
  function cancelCanvasDrag() {
    endCanvasDragListeners();
    var d = canvasDrag;
    canvasDrag = null;
    if (d && d.moved) {
      hideGhost();
      $('dropline').hidden = true;
      stage.classList.remove('is-dragging');
      document.querySelectorAll('.st-dragsrc').forEach(function (n) { n.classList.remove('st-dragsrc'); });
      if (hooks.viewChanged) { try { hooks.viewChanged(); } catch (err) { /* module error */ } }
    }
  }
  function onCanvasDragMove(ev) {
    var d = canvasDrag;
    if (!d || ev.pointerId !== d.pid) return;
    if (!d.moved) {
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) < 6) return;
      d.moved = true;
      if (d.sub) {
        hintOnce('sub-drag', 'Les éléments suivent leur section : glissez la section entière, ou changez la mise en page avec Boutique › Modèle. C’est ce qui garde la boutique juste sur chaque téléphone.', 6000);
        return;
      }
      clearHover();
      stage.classList.add('is-dragging');
      showGhost('↕ ' + sectionName(sectionById(d.id)), ev.clientX, ev.clientY);
      abKeys().forEach(function (k) {
        var n = roots[k] && roots[k].querySelector('[data-section-id="' + cssEsc(d.id) + '"]');
        if (n) n.classList.add('st-dragsrc');
      });
      if (hooks.viewChanged) { try { hooks.viewChanged(); } catch (err) { /* module error */ } }
    }
    if (d.sub) return;
    moveGhost(ev.clientX, ev.clientY);
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    var frame = (el && insideFrame(el)) || d.frame;
    d.drop = dropAt(frame, ev.clientY);
    showDropline(d.drop);
  }
  function onCanvasDragUp(ev) {
    var d = canvasDrag;
    if (!d || ev.pointerId !== d.pid) return;
    var moved = d.moved, drop = d.drop, sub = d.sub;
    cancelCanvasDrag();
    if (!moved) return;
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 0);
    if (sub || !drop) return;
    var list = sections();
    var from = -1, to = list.length;
    list.forEach(function (s, i) { if (s.id === d.id) from = i; if (drop.beforeId && s.id === drop.beforeId) to = i; });
    if (from === -1) return;
    if (to > from) to--;
    if (to === from) { select({ kind: 'section', id: d.id }); return; }
    commit('Déplacement de section', function (c) {
      var arr = c.sections || [];
      var it = arr.splice(from, 1)[0];
      arr.splice(clamp(to, 0, arr.length), 0, it);
    }, { structure: true });
    select({ kind: 'section', id: d.id });
    toast('Section déplacée. Ctrl Z pour annuler.', 'ok');
  }
  function onStagePointerMove(e) {
    if (!pan) return;
    var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    state.panX = pan.px + dx;
    state.panY = pan.py + dy;
    applyTransform();
  }
  function onStagePointerUp(e) {
    if (!pan) return;
    if (pan.moved) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    pan = null;
    stage.classList.remove('is-panning');
  }

  /* ------------------------------------------------------------------ touch (iPad)
   * One finger taps to select (the browser's click) and double-taps to edit the text in place;
   * two fingers scroll the view and pinch to zoom towards their midpoint; a long press opens the
   * context menu. The stage is touch-action: none, so nothing fights the browser. */

  var touchPts = {};
  var pinchRef = null;
  var lpTimer = null;
  var lastTap = null;

  function touchCount() { return Object.keys(touchPts).length; }
  function touchPair() {
    var keys = Object.keys(touchPts);
    return [touchPts[keys[0]], touchPts[keys[1]]];
  }

  function onTouchDown(e) {
    if (e.pointerType !== 'touch' || onStageUI(e.target)) return;
    touchPts[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false };
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    if (touchCount() === 2) {
      if (canvasDrag) cancelCanvasDrag();
      var pts = touchPair();
      pinchRef = {
        dist: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        midX: (pts[0].x + pts[1].x) / 2, midY: (pts[0].y + pts[1].y) / 2,
        zoom: state.zoom, panX: state.panX, panY: state.panY
      };
      lastTap = null;
    } else if (touchCount() === 1) {
      var pid = e.pointerId, x = e.clientX, y = e.clientY;
      lpTimer = setTimeout(function () {
        lpTimer = null;
        var pt = touchPts[pid];
        if (!pt || pt.moved || touchCount() !== 1 || state.tool !== 'select') return;
        var t = document.elementFromPoint(x, y);
        if (!t) return;
        onStageContextMenu({ target: t, clientX: x, clientY: y, preventDefault: function () {} });
      }, 550);
    }
  }

  function onTouchMove(e) {
    if (e.pointerType !== 'touch') return;
    var pt = touchPts[e.pointerId];
    if (!pt) return;
    if (Math.abs(e.clientX - pt.x) + Math.abs(e.clientY - pt.y) > 9) pt.moved = true;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (pt.moved && lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    if (pinchRef && touchCount() === 2) {
      var pts = touchPair();
      var dist = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      var midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      var z = clamp(pinchRef.zoom * dist / pinchRef.dist, ZOOM_MIN, ZOOM_MAX);
      var r = stage.getBoundingClientRect();
      /* the world point under the starting midpoint stays glued to the moving midpoint:
       * same distance = two-finger pan, spreading fingers = zoom to the midpoint */
      var wx = (pinchRef.midX - r.left - pinchRef.panX) / pinchRef.zoom;
      var wy = (pinchRef.midY - r.top - pinchRef.panY) / pinchRef.zoom;
      state.zoom = z;
      state.panX = (midX - r.left) - wx * z;
      state.panY = (midY - r.top) - wy * z;
      applyTransform();
      suppressClick = true;
    }
  }

  function onTouchUp(e) {
    if (e.pointerType !== 'touch') return;
    var pt = touchPts[e.pointerId];
    delete touchPts[e.pointerId];
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    if (pinchRef) {
      if (touchCount() < 2) pinchRef = null;
      setTimeout(function () { suppressClick = false; }, 0);
      return;
    }
    if (pt && !pt.moved && !ctxEl && state.tool === 'select') {
      var now = Date.now();
      if (lastTap && now - lastTap.t < 400 && Math.abs(e.clientX - lastTap.x) + Math.abs(e.clientY - lastTap.y) < 40) {
        lastTap = null;
        var t = document.elementFromPoint(e.clientX, e.clientY);
        if (t) onStageDblClick({ target: t, preventDefault: function () {}, stopPropagation: function () {} });
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }

  /* ------------------------------------------------------------------ canvas selection */

  function hitSection(t) {
    if (!t || !t.closest) return null;
    return t.closest('[data-section-id]');
  }
  function insideFrame(t) {
    return t && t.closest ? t.closest('.st-ab__frame') : null;
  }

  function onStageClickCapture(e) {
    lastPt = { x: e.clientX, y: e.clientY, target: e.target };
    if (onStageUI(e.target)) return;
    if (suppressClick || pan) { e.stopPropagation(); e.preventDefault(); return; }
    if (insideFrame(e.target)) setActiveAbFrom(e.target);
    if (state.tool === 'text') { onTextToolClick(e); return; }
    if (state.tool === 'comment') {
      if (insideFrame(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        if (hooks.commentAt) { try { hooks.commentAt(e); } catch (err) { /* module error */ } }
      }
      return;
    }
    if (state.tool !== 'select') return; // hand tool: the store preview stays interactive
    var frame = insideFrame(e.target);
    if (!frame) {
      // the stage background or an artboard name: deselect
      if (e.target === stage || e.target.closest('.st-ab__name') || e.target.closest('.st-world')) select(null);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    var secEl = hitSection(e.target);
    if (!secEl) {
      /* the header and the footer are not sections: selectable for their design (Design tab) */
      var ch = !e.shiftKey ? hitChrome(e.target) : null;
      if (ch) { clickChrome(ch, e.target); return; }
      select(null);
      return;
    }
    var id = secEl.getAttribute('data-section-id');
    if (isLocked(id)) { if (!e.shiftKey) select(null); return; }
    if (e.shiftKey) { toggleMulti(id); return; }
    var sel = state.sel;
    if (isMulti(sel)) { select({ kind: 'section', id: id }); return; }
    if (sel && sel.kind === 'section' && sel.id === id && !isSubSel(sel)) {
      drillInto(secEl, e.target);
    } else if (sel && ((sel.kind === 'section' && sel.id === id && isSubSel(sel)) || sel.kind === 'product')) {
      // a click inside while a sub-element is selected: try a new sub-element, else keep the section
      drillInto(secEl, e.target) || select({ kind: 'section', id: id });
    } else {
      /* a button, an icon or a photo is selected on the first click, like Framer: its style (or its crop) is what
       * she wants; a double-click on a photo then crops it */
      var direct = designElAt(secEl, secEl.getAttribute('data-section-type') || '', e.target);
      if (direct && (direct.kind === 'button' || direct.kind === 'icon' || direct.kind === 'image')) {
        var dsel = { kind: 'section', id: id, el: direct.key };
        var dtype = secEl.getAttribute('data-section-type') || '';
        if (direct.field && hasField(dtype, direct.field)) { dsel.field = direct.field; dsel.fieldType = dtype; }
        select(dsel);
        return;
      }
      select({ kind: 'section', id: id });
    }
  }

  function clickChrome(chEl, target) {
    var id = chEl.classList.contains('jst-footer') ? '@footer' : '@header';
    var sel = state.sel;
    if (sel && sel.kind === 'chrome' && sel.id === id) {
      var d = designElAt(chEl, id, target);
      if (d) { if (d.key !== sel.el) select({ kind: 'chrome', id: id, el: d.key }); return; }
      if (sel.el) select({ kind: 'chrome', id: id });
      return;
    }
    var dch = designElAt(chEl, id, target);
    if (dch && (dch.kind === 'icon' || dch.kind === 'button')) { select({ kind: 'chrome', id: id, el: dch.key }); return; }
    select({ kind: 'chrome', id: id });
  }

  /* the Texte tool (T): the next click on a text edits it in place, then the tool hands back to
   * Déplacer, like Figma after a text */
  function onTextToolClick(e) {
    var frame = insideFrame(e.target);
    if (!frame) return;
    e.stopPropagation();
    e.preventDefault();
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    var secEl = hitSection(e.target);
    var spec = secEl && !isLocked(secEl.getAttribute('data-section-id')) ? inlineSpecFor(e.target, secEl) : null;
    if (!spec) {
      hintOnce('text-miss', 'Outil Texte : cliquez sur un titre, un paragraphe, un bouton, ou le nom ou le prix d’un produit.', 4000);
      return;
    }
    clearHover();
    setTool('select');
    startInlineEdit(spec);
  }

  function drillInto(secEl, target) {
    var id = secEl.getAttribute('data-section-id');
    var type = secEl.getAttribute('data-section-type') || '';
    var dB = designElAt(secEl, type, target);
    if (dB && (dB.kind === 'button' || dB.kind === 'icon')) {
      var bsel0 = { kind: 'section', id: id, el: dB.key };
      if (dB.field && hasField(type, dB.field)) { bsel0.field = dB.field; bsel0.fieldType = type; }
      select(bsel0);
      return true;
    }
    var card = target.closest ? target.closest('[data-product-id]') : null;
    if (card && secEl.contains(card)) {
      var pid = card.getAttribute('data-product-id');
      /* a click inside the selected card: its name, price, photo, badge, button (Design) */
      if (state.sel && state.sel.kind === 'product' && state.sel.id === pid) {
        var inCard = designElAt(card, type, target);
        if (inCard && inCard.key !== 'card') { select({ kind: 'section', id: id, el: inCard.key }); return true; }
        return true;
      }
      if (productById(pid)) { select({ kind: 'product', id: pid }); return true; }
    }
    var dEl = designElAt(secEl, type, target);
    /* a button or an icon: straight to it (even inside a product card) */
    if (dEl && (dEl.kind === 'button' || dEl.kind === 'icon')) {
      var bsel = { kind: 'section', id: id, el: dEl.key };
      if (dEl.field && hasField(type, dEl.field)) { bsel.field = dEl.field; bsel.fieldType = type; }
      select(bsel);
      return true;
    }
    var pairs = [
      ['.jst-hero-title', 'title'], ['.jst-about-title', 'title'],
      ['.jst-hero-text', 'text'], ['.jst-ann-item', 'text'],
      ['.jst-kicker', 'kicker'], ['.jst-tag', 'kicker'],
      ['.jst-btn', 'button']
    ];
    for (var i = 0; i < pairs.length; i++) {
      var n = target.closest ? target.closest(pairs[i][0]) : null;
      if (n && secEl.contains(n) && hasField(type, pairs[i][1])) {
        var fsel = { kind: 'section', id: id, field: pairs[i][1], fieldType: type };
        if (dEl && dEl.field === pairs[i][1]) fsel.el = dEl.key;
        select(fsel);
        return true;
      }
    }
    if (dEl) {
      var esel = { kind: 'section', id: id, el: dEl.key };
      if (dEl.field && hasField(type, dEl.field)) { esel.field = dEl.field; esel.fieldType = type; }
      select(esel);
      return true;
    }
    var h = target.closest ? target.closest('h1,h2,h3') : null;
    if (h && secEl.contains(h) && hasField(type, 'title')) { select({ kind: 'section', id: id, field: 'title', fieldType: type }); return true; }
    var p = target.closest ? target.closest('p') : null;
    if (p && secEl.contains(p) && hasField(type, 'text')) { select({ kind: 'section', id: id, field: 'text', fieldType: type }); return true; }
    return false;
  }

  var hovEl = null, textHovEl = null;
  function onStageOverCapture(e) {
    if (pan || canvasDrag) return;
    var frame = insideFrame(e.target);
    var secEl = frame ? hitSection(e.target) : null;
    if (state.tool === 'text') {
      /* the Texte tool: the text under the pointer lights up, a click edits it */
      var spec = secEl && !isLocked(secEl.getAttribute('data-section-id')) ? inlineSpecFor(e.target, secEl) : null;
      var n = spec ? spec.el : null;
      if (textHovEl && textHovEl !== n) { textHovEl.classList.remove('st-texthov'); textHovEl = null; }
      if (n && !n.isContentEditable) { n.classList.add('st-texthov'); textHovEl = n; }
      return;
    }
    if (state.tool !== 'select') return;
    if (hovEl && hovEl !== secEl) { hovEl.classList.remove('st-hov', 'st-lockhint'); hovEl = null; drawHoverBox(null); }
    if (!secEl || secEl.classList.contains('st-sel')) { if (!secEl) drawHoverBox(null); return; }
    hovEl = secEl;
    secEl.classList.add(isLocked(secEl.getAttribute('data-section-id')) ? 'st-lockhint' : 'st-hov');
    drawHoverBox(secEl);
  }
  function clearHover() {
    if (hovEl) { hovEl.classList.remove('st-hov', 'st-lockhint'); hovEl = null; }
    if (textHovEl) { textHovEl.classList.remove('st-texthov'); textHovEl = null; }
    drawHoverBox(null);
  }

  var lastSelKey = '';
  function selKey(sel) {
    if (!sel) return '';
    if (isMulti(sel)) return 'm:' + sel.ids.join(',');
    return sel.kind + ':' + sel.id + ':' + (sel.field || '') + ':' + (sel.el || '');
  }

  function select(sel, opts) {
    opts = opts || {};
    state.sel = sel;
    if (sel && isMulti(sel) && state.page !== 'home') showPage('home');
    if (sel && sel.kind === 'section' && state.page !== 'home') {
      var s = sectionById(sel.id);
      if (!s || s.type !== 'delivery') showPage('home');
    }
    if (sel && sel.kind === 'product') {
      state.productId = sel.id;
      if (state.page === 'product') scheduleRender();
    }
    var prevKey = lastSelKey;
    lastSelKey = selKey(sel);
    if (hovEl && sel) { clearHover(); }
    applyDecor();
    /* a selection change only re-marks the rows: rebuilding the tree here replaced the row
     * between the two clicks of a double-click, and « renommer » never opened */
    if (!syncTree()) buildTree();
    buildInspector();
    /* a new selection opens its inspector at the top, never mid-panel */
    if (prevKey !== lastSelKey && $('inspector')) $('inspector').scrollTop = 0;
    if (opts.pan) requestAnimationFrame(panToSelection);
    if (!opts.fromTree) {
      var row = $('layersPanel') && $('layersPanel').querySelector('.st-row.is-sel');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
  }

  function escapeSelection() {
    var sel = state.sel;
    if (!sel) return;
    if (isMulti(sel)) select(null);
    else if (isSubSel(sel)) select({ kind: sel.kind, id: sel.id });
    else if (sel.kind === 'product') {
      // the parent of a product: its products section (the first one)
      var sec = sections().filter(function (s) { return s.type === 'products'; })[0];
      select(sec ? { kind: 'section', id: sec.id } : null);
    } else select(null);
  }

  /* ------------------------------------------------------------------ inline text editing
   * Double-click on a text that maps to a fiche field: contenteditable IN the artboard (subtle
   * focus ring), Enter/blur commits through the same history (coalesced), Échap cancels, the
   * contract's maxlength is enforced, pasted text is stripped to plain text. */

  var inlineEdit = null; // { el, orig, spec }

  function fieldMax(type, key) {
    var m = null;
    defFields(type).forEach(function (f) { if (f && f.key === key && typeof f.max === 'number') m = f.max; });
    return m;
  }

  var INLINE_PAIRS = [
    ['.jst-hero-title', 'title'], ['.jst-about-title', 'title'], ['.jst-wa-title', 'title'],
    ['.jst-hero-text', 'text'], ['.jst-wa-text', 'text'], ['.jst-ann-item', 'text'],
    ['.jst-kicker', 'kicker'], ['.jst-tag', 'kicker'], ['.jst-btn', 'button'],
    ['h1,h2,h3', 'title'], ['.jst-about-text p', 'text'], ['p', 'text']
  ];

  function inlineSpecFor(target, secEl) {
    if (!target || !target.closest) return null;
    var card = target.closest('[data-product-id]');
    if (card && (!secEl || secEl.contains(card))) {
      var pid = card.getAttribute('data-product-id');
      var p = productById(pid);
      if (p) {
        function pSet(key) {
          return function (c, v) {
            var t = (c.products || []).filter(function (x) { return x.id === pid; })[0];
            if (t) t[key] = v;
          };
        }
        var pSel = { kind: 'product', id: pid };
        var nameEl = target.closest('.jst-card-name, .jst-pdp-name');
        if (nameEl) return { el: nameEl, label: 'Texte modifié (nom du produit)', max: 60, select: pSel, co: 'p:' + pid + ':name', get: function () { return p.name || ''; }, set: pSet('name') };
        var catEl = target.closest('.jst-card-cat');
        if (catEl) return { el: catEl, label: 'Texte modifié (catégorie)', max: 40, select: pSel, co: 'p:' + pid + ':cat', get: function () { return p.category || ''; }, set: pSet('category') };
        var priceEl = target.closest('.jst-card-price, .jst-pdp-price');
        if (priceEl) return { el: priceEl, label: 'Prix modifié', numeric: true, min: 0, maxNum: 100000000, select: pSel, co: 'p:' + pid + ':price', get: function () { return p.price == null ? '' : String(p.price); }, set: pSet('price') };
      }
    }
    if (!secEl) return null;
    var id = secEl.getAttribute('data-section-id');
    var type = secEl.getAttribute('data-section-type') || '';
    var s = sectionById(id);
    if (!s) return null;
    var el = null, field = null;
    for (var i = 0; i < INLINE_PAIRS.length; i++) {
      var n = target.closest(INLINE_PAIRS[i][0]);
      if (n && secEl.contains(n) && hasField(type, INLINE_PAIRS[i][1])) { el = n; field = INLINE_PAIRS[i][1]; break; }
    }
    if (!el) return null;
    var labels = { title: 'titre', text: 'texte', kicker: 'petit titre', button: 'bouton' };
    return {
      el: el,
      label: 'Texte modifié (' + (labels[field] || field) + ')',
      max: fieldMax(type, field),
      select: { kind: 'section', id: id, field: field, fieldType: type },
      co: 'sec:' + id + ':' + field,
      get: function () { return s.settings && s.settings[field] != null ? String(s.settings[field]) : ''; },
      set: function (c, v) {
        var t = (c.sections || []).filter(function (x) { return x.id === id; })[0];
        if (t) { t.settings = t.settings || {}; t.settings[field] = v; }
      }
    };
  }

  function placeCaretEnd(el) {
    try {
      var r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      var sl = window.getSelection();
      sl.removeAllRanges();
      sl.addRange(r);
    } catch (e) { /* caret stays where it is */ }
  }

  function startInlineEdit(spec) {
    /* a double-tap can arrive twice (our synthetic dblclick + the browser's): keep the session */
    if (inlineEdit && inlineEdit.spec && inlineEdit.spec.co === spec.co) return;
    finishInlineEdit(true);
    if (spec.select) select(spec.select);
    var el = spec.el;
    /* a button edits its label span, never the <button> itself: Space on a focused button is a
     * click, and « Voir la collection » came out « VOIRLACOLLECTION » */
    var lbl = el.matches && el.matches('button, a') ? el.querySelector('.jst-btn-label') : null;
    if (lbl) { el = lbl; spec.el = lbl; }
    inlineEdit = { el: el, orig: el.innerHTML, spec: spec };
    el.textContent = spec.get();
    try { el.contentEditable = 'plaintext-only'; } catch (e) { /* older engine */ }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.classList.add('st-inline');
    el.spellcheck = false;
    el.addEventListener('keydown', onInlineKey);
    el.addEventListener('keyup', onInlineKeyUp);
    el.addEventListener('blur', onInlineBlur);
    el.addEventListener('input', onInlineInput);
    el.addEventListener('paste', onInlinePaste);
    el.focus();
    showInlineCount();
    try {
      var r = document.createRange();
      r.selectNodeContents(el);
      var sl = window.getSelection();
      sl.removeAllRanges();
      sl.addRange(r);
    } catch (e) { /* no selection, still editable */ }
  }

  function onInlineKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishInlineEdit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishInlineEdit(false); }
    else if (e.key === ' ' && inlineEdit && inlineEdit.el.closest && inlineEdit.el.closest('button, a')) {
      /* inside a button, the browser turns Space into a click: insert the space ourselves */
      e.preventDefault();
      try { document.execCommand('insertText', false, ' '); } catch (err) { /* no space then */ }
    }
  }
  function onInlineKeyUp(e) {
    e.stopPropagation();
    if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); // no button activation on keyup
  }
  function onInlineBlur() { finishInlineEdit(true); }
  function onInlineInput() {
    var ed = inlineEdit;
    if (!ed || typeof ed.spec.max !== 'number') { positionInlineCount(); return; }
    var t = ed.el.textContent;
    var hit = false;
    if (t.length > ed.spec.max) {
      ed.el.textContent = t.slice(0, ed.spec.max);
      placeCaretEnd(ed.el);
      hit = true;
    }
    updateInlineCount(hit);
  }

  /* the live counter while typing in place: « 38 / 40 », amber with a small shake at the limit */
  var inlineCountEl = null;
  function showInlineCount() {
    var ed = inlineEdit;
    if (!ed || typeof ed.spec.max !== 'number') return;
    if (!inlineCountEl) { inlineCountEl = ce('div', 'st-inlinecount'); stage.appendChild(inlineCountEl); }
    inlineCountEl.hidden = false;
    updateInlineCount(false);
  }
  function updateInlineCount(hit) {
    var ed = inlineEdit;
    if (!inlineCountEl || !ed || typeof ed.spec.max !== 'number') return;
    var n = ed.el.textContent.length, max = ed.spec.max;
    inlineCountEl.textContent = n + ' / ' + max + (n >= max ? ' · maximum' : '');
    inlineCountEl.classList.toggle('is-near', n >= max * 0.85 && n < max);
    inlineCountEl.classList.toggle('is-max', n >= max);
    if (hit) {
      inlineCountEl.classList.remove('is-shake');
      void inlineCountEl.offsetWidth;
      inlineCountEl.classList.add('is-shake');
    }
    positionInlineCount();
  }
  function positionInlineCount() {
    var ed = inlineEdit;
    if (!inlineCountEl || inlineCountEl.hidden || !ed) return;
    var r = ed.el.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    inlineCountEl.style.left = clamp(r.left - sr.left, 6, sr.width - 140) + 'px';
    inlineCountEl.style.top = clamp(r.bottom - sr.top + 8, 6, sr.height - 30) + 'px';
  }
  function hideInlineCount() { if (inlineCountEl) inlineCountEl.hidden = true; }
  function onInlinePaste(e) {
    e.preventDefault();
    var txt = '';
    try { txt = (e.clipboardData || window.clipboardData).getData('text/plain'); } catch (err) { /* nothing pasted */ }
    txt = String(txt || '').replace(/\s*[\r\n]+\s*/g, ' ');
    try { document.execCommand('insertText', false, txt); } catch (err) { /* paste dropped */ }
  }

  function finishInlineEdit(apply) {
    var ed = inlineEdit;
    if (!ed) return;
    inlineEdit = null;
    var el = ed.el, spec = ed.spec;
    el.removeEventListener('keydown', onInlineKey);
    el.removeEventListener('keyup', onInlineKeyUp);
    hideInlineCount();
    el.removeEventListener('blur', onInlineBlur);
    el.removeEventListener('input', onInlineInput);
    el.removeEventListener('paste', onInlinePaste);
    var raw = el.textContent;
    el.removeAttribute('contenteditable');
    el.classList.remove('st-inline');
    try { el.blur(); } catch (e) { /* already blurred */ }
    var v;
    if (spec.numeric) {
      var n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
      if (!isFinite(n)) apply = false;
      else v = clamp(n, spec.min == null ? 0 : spec.min, spec.maxNum == null ? 1e15 : spec.maxNum);
    } else {
      v = String(raw).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      if (typeof spec.max === 'number') v = v.slice(0, spec.max);
    }
    if (apply && String(v) !== String(spec.get())) {
      commit(spec.label, function (c) { spec.set(c, spec.numeric ? v : v); }, { coalesce: spec.co });
      /* the inspector mirrors the fiche: rebuild it, or its stale field would silently
       * revert this inline edit at the first keystroke typed there */
      buildInspector();
    } else {
      el.innerHTML = ed.orig;
      scheduleRender();
    }
  }

  /* double-click on text in the canvas: edit it right there (contenteditable); texts without a
   * fiche field fall back to the old reflex — drill in and focus the inspector field */
  function onStageDblClick(e) {
    lastPt = { x: e.clientX, y: e.clientY, target: e.target };
    if ((state.tool !== 'select' && state.tool !== 'text') || pan) return;
    var frame = insideFrame(e.target);
    if (!frame) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    var secEl = hitSection(e.target);
    if (!secEl) return;
    var id = secEl.getAttribute('data-section-id');
    if (isLocked(id)) return;
    var spec = inlineSpecFor(e.target, secEl);
    if (spec) { startInlineEdit(spec); return; }
    if (!(state.sel && ((state.sel.kind === 'section' && state.sel.id === id) || state.sel.kind === 'product'))) {
      select({ kind: 'section', id: id });
    }
    drillInto(secEl, e.target);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var box = $('inspector');
      if (!box) return;
      var n = box.querySelector('.st-field--focus input, .st-field--focus textarea');
      if (!n && state.sel && state.sel.kind === 'product') n = box.querySelector('input[type="text"]');
      if (n) {
        n.focus();
        if (n.select) { try { n.select(); } catch (err) { /* nothing */ } }
      }
    }); });
  }

  /* right-click: the design-tool context menu (reusing the zoom menu's styling) */
  var ctxEl = null;
  function closeCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }

  function openCtx(x, y, items) {
    closeCtx();
    ctxEl = ce('div', 'st-menu st-ctx');
    items.forEach(function (it) {
      if (!it) { ctxEl.appendChild(document.createElement('hr')); return; }
      var b = ce('button', '', '<span>' + esc(it[0]) + '</span>' + (it[1] ? '<kbd>' + esc(it[1]) + '</kbd>' : ''));
      b.type = 'button';
      b.addEventListener('click', function () { closeCtx(); it[2](); });
      ctxEl.appendChild(b);
    });
    document.body.appendChild(ctxEl);
    ctxEl.style.left = clamp(x, 8, window.innerWidth - ctxEl.offsetWidth - 8) + 'px';
    ctxEl.style.top = clamp(y, 8, window.innerHeight - ctxEl.offsetHeight - 8) + 'px';
  }

  function toggleHideSelected() {
    var sel = state.sel;
    if (isMulti(sel)) {
      var ids = sel.ids.slice();
      var all = ids.map(sectionById).filter(Boolean);
      var hide = all.some(function (s) { return s.enabled !== false; }); // mixed: hide everything
      commit((hide ? 'Masquage de ' : 'Affichage de ') + ids.length + ' sections', function (c) {
        (c.sections || []).forEach(function (t) { if (ids.indexOf(t.id) !== -1) t.enabled = !hide; });
      }, { structure: true });
      return;
    }
    if (!sel || sel.kind !== 'section') return;
    var s = sectionById(sel.id);
    if (!s) return;
    commit(s.enabled === false ? 'Affichage de la section' : 'Masquage de la section', function (c) {
      var t = (c.sections || []).filter(function (x) { return x.id === sel.id; })[0];
      if (t) t.enabled = t.enabled === false;
    }, { structure: true });
  }

  function onStageContextMenu(e) {
    if (onStageUI(e.target)) { if (e.preventDefault) e.preventDefault(); return; }
    if (state.tool !== 'select') return; // hand tool: leave the browser menu alone
    var frame = insideFrame(e.target);
    if (!frame) { closeCtx(); return; }
    e.preventDefault();
    var secEl = hitSection(e.target);
    if (!secEl) { closeCtx(); return; }
    var id = secEl.getAttribute('data-section-id');
    if (isLocked(id)) { closeCtx(); return; }
    var card = e.target.closest ? e.target.closest('[data-product-id]') : null;
    if (card && secEl.contains(card) && productById(card.getAttribute('data-product-id'))) {
      select({ kind: 'product', id: card.getAttribute('data-product-id') });
      openCtx(e.clientX, e.clientY, [
        ['Dupliquer le produit', 'Ctrl D', duplicateSelection],
        ['Supprimer le produit', 'Suppr', deleteSelection]
      ]);
      return;
    }
    /* a right-click on a member of a multi-selection keeps it and offers the bulk actions */
    if (isMulti(state.sel) && state.sel.ids.indexOf(id) !== -1) {
      var n = state.sel.ids.length;
      openCtx(e.clientX, e.clientY, [
        ['Dupliquer les ' + n + ' sections', 'Ctrl D', duplicateSelection],
        ['Masquer les ' + n + ' sections', '', toggleHideSelected],
        null,
        ['Supprimer les ' + n + ' sections', 'Suppr', deleteSelection]
      ]);
      return;
    }
    if (!(state.sel && state.sel.kind === 'section' && state.sel.id === id && !isSubSel(state.sel))) select({ kind: 'section', id: id });
    openCtx(e.clientX, e.clientY, sectionMenuItems(id));
  }

  /* the « ⋯ » of the contextual bar opens the same menu as a right-click, for the selection */
  function openSelectionMenu(x, y) {
    var sel = state.sel;
    if (!sel) return;
    if (sel.kind === 'product') {
      openCtx(x, y, [['Dupliquer le produit', 'Ctrl D', duplicateSelection], ['Supprimer le produit', 'Suppr', deleteSelection]]);
    } else if (isMulti(sel)) {
      var n = sel.ids.length;
      openCtx(x, y, [
        ['Dupliquer les ' + n + ' sections', 'Ctrl D', duplicateSelection],
        ['Masquer les ' + n + ' sections', 'Ctrl ⇧ H', toggleHideSelected],
        null,
        ['Supprimer les ' + n + ' sections', 'Suppr', deleteSelection]
      ]);
    } else if (sel.kind === 'section') {
      openCtx(x, y, sectionMenuItems(sel.id));
    }
  }

  function lockSection(id) {
    /* reachable without hover (touch long-press): the tree's padlock unlocks */
    ui.locked[id] = true;
    saveUI();
    if (state.sel && state.sel.kind === 'section' && state.sel.id === id) select(null);
    buildTree();
    toast('Section verrouillée — le cadenas des calques la déverrouille.');
  }

  function sectionMenuItems(id) {
    var s = sectionById(id);
    var items = [
      ['Copier', 'Ctrl C', copySelection],
      ['Coller', 'Ctrl V', pasteClipboard],
      ['Dupliquer', 'Ctrl D', duplicateSelection],
      null,
      [s && s.enabled === false ? 'Afficher la section' : 'Masquer la section', 'Ctrl ⇧ H', toggleHideSelected],
      ['Verrouiller la section', 'Ctrl ⇧ L', function () { lockSection(id); }],
      ['Renommer', 'F2', renameSelection],
      ['Supprimer', 'Suppr', deleteSelection]
    ];
    if (hooks.sectionCtxItems) {
      try { items = hooks.sectionCtxItems(items, s) || items; } catch (err) { /* module error */ }
    }
    return items;
  }

  /* ------------------------------------------------------------------ pages */

  function showPage(page, pageId, productId) {
    state.page = page;
    state.pageId = page === 'page' ? (pageId || null) : null;
    if (productId) state.productId = productId;
    if (page === 'product' && !state.productId && products().length) state.productId = products()[0].id;
    scheduleRender();
    if (!syncTree()) buildTree();
  }

  function onNavigate(e) {
    // a click inside the store (hand tool): follow it on both artboards and in the tree
    if (!e || !e.detail) return;
    e.preventDefault(); // no scroll jump: the artboards stay where they are
    var d = e.detail;
    state.page = typeof d.page === 'string' ? d.page : 'home';
    state.productId = d.productId || state.productId;
    state.pageId = d.pageId || null;
    scheduleRender(); // re-renders both (the source root is re-rendered identically)
    if (!syncTree()) buildTree();
  }

  /* ------------------------------------------------------------------ layers tree */

  var treeDrag = null;

  var ICONS = {
    page: '<svg viewBox="0 0 16 16"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    announcement: '<svg viewBox="0 0 16 16"><rect x="1.5" y="5" width="13" height="3.4" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    hero: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 10.5l2.6-3 2.4 2.2 1.6-1.6 1.4 2.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    categories: '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    products: '<svg viewBox="0 0 16 16"><path d="M3 5.5l5-3 5 3v5l-5 3-5-3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 5.5l5 3 5-3M8 8.5v5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    about: '<svg viewBox="0 0 16 16"><circle cx="8" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 13.5c.7-2.6 2.4-4 4.5-4s3.8 1.4 4.5 4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    reviews: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    delivery: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="8" height="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 6h3l2 2.4v2.1h-5z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12" r="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12" r="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    whatsapp: '<svg viewBox="0 0 16 16"><path d="M8 2.2a5.8 5.8 0 00-5 8.7L2.2 14l3.2-.8A5.8 5.8 0 108 2.2z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    product: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 13.5V9.8h5v3.7" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1.8 8S4 3.9 8 3.9 14.2 8 14.2 8 12 12.1 8 12.1 1.8 8 1.8 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    eyeOff: '<svg viewBox="0 0 16 16"><path d="M3 13L13 3M5.8 11.4A6.7 6.7 0 001.8 8S4 3.9 8 3.9c.8 0 1.5.2 2.2.4M12 5.7A11 11 0 0114.2 8S12 12.1 8 12.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7V5.4a2.5 2.5 0 015 0V7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    unlock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7V5.4a2.5 2.5 0 015-.8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
  };
  function icon(name) { return ICONS[name] || ICONS.page; }

  function buildTree() {
    var panel = $('layersPanel');
    if (!panel || panel.querySelector('.st-row__name input')) return; // a rename is in progress

    /* the tree is rebuilt on every change: keep the keyboard user's focus on « their » row */
    var focusKey = null;
    var ae = document.activeElement;
    if (ae && panel.contains(ae) && ae.classList && ae.classList.contains('st-row')) {
      ['data-page', 'data-page-id', 'data-section-row', 'data-product-row'].forEach(function (a) {
        if (!focusKey && ae.hasAttribute(a)) focusKey = [a, ae.getAttribute(a)];
      });
    }
    panel.innerHTML = '';

    /* pages of the buying journey */
    var g1 = ce('div', 'st-group');
    g1.appendChild(ce('div', 'st-group__title', 'Parcours d’achat'));
    PAGES.forEach(function (pg) {
      var row = ce('div', 'st-row is-page' + (state.page === pg.id ? ' is-on' : ''));
      row.setAttribute('data-page', pg.id);
      row.appendChild(ce('span', 'st-row__icon', icon('page')));
      row.appendChild(ce('span', 'st-row__name', esc(pg.label)));
      row.addEventListener('click', function () { showPage(pg.id); });
      g1.appendChild(row);
      if (pg.id === 'home') {
        sections().forEach(function (s) {
          g1.appendChild(sectionRow(s));
          if (hooks.treeSection) { try { hooks.treeSection(s, g1); } catch (e) { /* module error */ } }
        });
        if (!sections().length) g1.appendChild(ce('div', 'st-tree__empty', 'Aucune section. Ajoutez-en depuis l’onglet « Ajouter ».'));
      }
    });
    panel.appendChild(g1);

    /* the store's own pages */
    var g2 = ce('div', 'st-group');
    g2.appendChild(ce('div', 'st-group__title', 'Vos pages'));
    customPages().forEach(function (pg) {
      var row = ce('div', 'st-row is-page' + (state.page === 'page' && state.pageId === pg.id ? ' is-on' : '') +
        (state.sel && state.sel.kind === 'page' && state.sel.id === pg.id ? ' is-sel' : ''));
      row.setAttribute('data-page-id', pg.id);
      row.appendChild(ce('span', 'st-row__icon', icon('page')));
      var name = ce('span', 'st-row__name', esc(pg.title || 'Page'));
      row.appendChild(name);
      row.addEventListener('click', function () {
        state.sel = { kind: 'page', id: pg.id };
        showPage('page', pg.id);
        buildInspector();
      });
      name.addEventListener('dblclick', function (e) { e.stopPropagation(); startRename(name, pg.title || '', 60, function (v) {
        commit('Renommage de la page', function (c) {
          var target = (c.pages || []).filter(function (x) { return x.id === pg.id; })[0];
          if (target) {
            target.title = v;
            if (D.slugify) {
              var slug = D.uniqueSlug ? D.uniqueSlug(c, v, pg.id) : D.slugify(v);
              if (slug) target.slug = slug;
            }
          }
        }, { structure: true });
      }); });
      g2.appendChild(row);
    });
    var addPg = ce('button', 'st-addbtn', '+ Ajouter une page');
    addPg.type = 'button';
    addPg.addEventListener('click', addCustomPage);
    g2.appendChild(addPg);
    panel.appendChild(g2);

    /* keyboard access: every row is a focusable treeitem, one of them holds the tab stop */
    var rows = Array.prototype.slice.call(panel.querySelectorAll('.st-row'));
    var active = null;
    rows.forEach(function (r) {
      r.setAttribute('role', 'treeitem');
      r.tabIndex = -1;
      r.setAttribute('aria-selected', String(r.classList.contains('is-sel') || r.classList.contains('is-on')));
      if (!active && r.classList.contains('is-sel')) active = r;
    });
    if (!active) active = rows.filter(function (r) { return r.classList.contains('is-on'); })[0] || rows[0];
    if (active) active.tabIndex = 0;
    if (focusKey) {
      var nf = panel.querySelector('[' + focusKey[0] + '="' + cssEsc(focusKey[1]) + '"]');
      if (nf) { nf.tabIndex = 0; nf.focus(); }
    }
  }

  /* the light path: re-mark the existing rows (selection, active page) without replacing them.
   * Returns false when there is nothing to re-mark (first build): the caller builds. */
  function syncTree() {
    var panel = $('layersPanel');
    if (!panel) return true;
    if (panel.querySelector('.st-row__name input')) return true; // a rename is in progress
    var rows = Array.prototype.slice.call(panel.querySelectorAll('.st-row'));
    if (!rows.length) return false;
    var sel = state.sel;
    var multi = isMulti(sel) ? sel.ids : null;
    rows.forEach(function (r) {
      var on = false, isSel = false;
      if (r.hasAttribute('data-page')) on = state.page === r.getAttribute('data-page');
      else if (r.hasAttribute('data-page-id')) {
        var pid = r.getAttribute('data-page-id');
        on = state.page === 'page' && state.pageId === pid;
        isSel = !!(sel && sel.kind === 'page' && sel.id === pid);
      } else if (r.hasAttribute('data-section-row')) {
        var sid = r.getAttribute('data-section-row');
        isSel = multi ? multi.indexOf(sid) !== -1 : !!(sel && sel.kind === 'section' && sel.id === sid);
      } else if (r.hasAttribute('data-product-row')) {
        isSel = !!(sel && sel.kind === 'product' && sel.id === r.getAttribute('data-product-row'));
      } else if (hooks.treeRowSelected) {
        try { isSel = !!hooks.treeRowSelected(r, sel); } catch (e) { isSel = false; }
      }
      if (r.classList.contains('is-page')) r.classList.toggle('is-on', on);
      r.classList.toggle('is-sel', isSel);
      r.setAttribute('aria-selected', String(isSel || on));
    });
    var active = rows.filter(function (r) { return r.classList.contains('is-sel'); })[0] ||
      rows.filter(function (r) { return r.classList.contains('is-on'); })[0] || rows[0];
    if (panel.contains(document.activeElement)) return true; // keep the keyboard user's roving stop
    rows.forEach(function (r) { r.tabIndex = r === active ? 0 : -1; });
    return true;
  }

  function sectionRow(s) {
    var selOn = state.sel && ((state.sel.kind === 'section' && state.sel.id === s.id) ||
      (state.sel.kind === 'product' && s.type === 'products'));
    var inMulti = isMulti(state.sel) && state.sel.ids.indexOf(s.id) !== -1;
    var row = ce('div', 'st-row st-row--child st-row--section' + ((selOn && state.sel.kind === 'section') || inMulti ? ' is-sel' : '') + (s.enabled === false ? ' is-off' : ''));
    row.setAttribute('data-section-row', s.id);
    row.appendChild(ce('span', 'st-row__icon', icon(s.type)));
    var name = ce('span', 'st-row__name', esc(sectionName(s)));
    row.appendChild(name);

    var lockBtn = ce('button', 'st-row__btn' + (isLocked(s.id) ? ' is-active' : ''), icon(isLocked(s.id) ? 'lock' : 'unlock'));
    lockBtn.type = 'button';
    lockBtn.title = isLocked(s.id) ? 'Déverrouiller' : 'Verrouiller (plus sélectionnable sur le plan de travail)';
    lockBtn.setAttribute('data-lock', s.id);
    lockBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      ui.locked[s.id] = !ui.locked[s.id];
      if (!ui.locked[s.id]) delete ui.locked[s.id];
      saveUI();
      buildTree();
      toast(ui.locked[s.id] ? 'Section verrouillée.' : 'Section déverrouillée.');
    });
    row.appendChild(lockBtn);

    var eyeBtn = ce('button', 'st-row__btn' + (s.enabled === false ? ' is-active' : ''), icon(s.enabled === false ? 'eyeOff' : 'eye'));
    eyeBtn.type = 'button';
    eyeBtn.title = s.enabled === false ? 'Afficher la section' : 'Masquer la section';
    eyeBtn.setAttribute('data-eye', s.id);
    eyeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      commit(s.enabled === false ? 'Affichage de la section' : 'Masquage de la section', function (c) {
        var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
        if (t) t.enabled = t.enabled === false;
      }, { structure: true });
    });
    row.appendChild(eyeBtn);

    row.addEventListener('click', function (e) {
      if (treeDrag && treeDrag.moved) return;
      if (e.shiftKey) { toggleMulti(s.id); return; }
      select({ kind: 'section', id: s.id }, { fromTree: true, pan: true });
    });
    var canRename = hasField(s.type, 'title');
    name.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      if (!canRename) { toast('Cette section n’a pas de titre dans la fiche.', 'info'); return; }
      var cur = (s.settings && typeof s.settings.title === 'string') ? s.settings.title : '';
      var max = 50;
      defFields(s.type).forEach(function (f) { if (f.key === 'title' && typeof f.max === 'number') max = f.max; });
      startRename(name, cur, max, function (v) {
        commit('Renommage de la section', function (c) {
          var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
          if (t) { t.settings = t.settings || {}; t.settings.title = v; }
        }, { structure: true });
      });
    });

    row.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.st-row__btn')) return;
      startTreeDrag(e, s.id, row);
    });

    /* products as children of the first products section */
    var frag = document.createDocumentFragment();
    frag.appendChild(row);
    var firstProducts = sections().filter(function (x) { return x.type === 'products'; })[0];
    if (s.type === 'products' && firstProducts && firstProducts.id === s.id) {
      products().forEach(function (p) {
        var pr = ce('div', 'st-row st-row--child st-row--prod' + (state.sel && state.sel.kind === 'product' && state.sel.id === p.id ? ' is-sel' : ''));
        pr.style.marginLeft = '40px';
        pr.setAttribute('data-product-row', p.id);
        var dot = ce('span', 'st-row__dot');
        dot.style.background = p.color || '#E9D8BD';
        pr.appendChild(dot);
        var pn = ce('span', 'st-row__name', esc(p.name || 'Produit'));
        pr.appendChild(pn);
        pr.addEventListener('click', function (e) {
          e.stopPropagation();
          select({ kind: 'product', id: p.id }, { fromTree: true, pan: true });
        });
        pn.addEventListener('dblclick', function (e) {
          e.stopPropagation();
          startRename(pn, p.name || '', 60, function (v) {
            commit('Renommage du produit', function (c) {
              var t = (c.products || []).filter(function (x) { return x.id === p.id; })[0];
              if (t) t.name = v;
            }, { structure: true });
          });
        });
        frag.appendChild(pr);
      });
    }
    return frag;
  }

  function startRename(nameEl, current, max, done) {
    var input = document.createElement('input');
    input.value = current;
    input.maxLength = max || 60;
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();
    var finished = false;
    function finish(apply) {
      if (finished) return;
      finished = true;
      var v = input.value;
      input.remove();
      nameEl.textContent = v || current;
      if (apply && v !== current) done(v);
      else buildTreeForce();
    }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', function () { finish(true); });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
  }
  function buildTreeForce() {
    var panel = $('layersPanel');
    var inp = panel && panel.querySelector('.st-row__name input');
    if (inp) inp.remove();
    buildTree();
  }

  /* tree drag to reorder (pointer-based, with a drop indicator) */
  function startTreeDrag(e, id, row) {
    var startX = e.clientX, startY = e.clientY;
    treeDrag = { id: id, row: row, moved: false, index: -1 };
    var panel = $('layersPanel');
    var line = null;

    function rows() { return Array.prototype.slice.call(panel.querySelectorAll('[data-section-row]')); }

    function onMove(ev) {
      if (!treeDrag) return;
      if (!treeDrag.moved && Math.abs(ev.clientY - startY) + Math.abs(ev.clientX - startX) < 5) return;
      if (!treeDrag.moved) {
        treeDrag.moved = true;
        row.classList.add('is-dragging');
        line = ce('div', 'st-tree__dropline');
        panel.appendChild(line);
        showGhost(sectionName(sectionById(id)), ev.clientX, ev.clientY);
      }
      moveGhost(ev.clientX, ev.clientY);
      var rs = rows();
      var idx = rs.length;
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { idx = i; break; }
      }
      treeDrag.index = idx;
      var pr = panel.getBoundingClientRect();
      var y;
      if (idx < rs.length) y = rs[idx].getBoundingClientRect().top - pr.top + panel.scrollTop;
      else if (rs.length) y = rs[rs.length - 1].getBoundingClientRect().bottom - pr.top + panel.scrollTop;
      else y = 0;
      line.style.top = y + 'px';
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideGhost();
      if (line) line.remove();
      row.classList.remove('is-dragging');
      var drag = treeDrag;
      setTimeout(function () { treeDrag = null; }, 0);
      if (!drag || !drag.moved || drag.index < 0) return;
      var list = sections();
      var from = -1;
      list.forEach(function (s, i) { if (s.id === drag.id) from = i; });
      if (from === -1) return;
      var to = drag.index;
      if (to > from) to--;
      if (to === from) return;
      commit('Déplacement de section', function (c) {
        var arr = c.sections || [];
        var it = arr.splice(from, 1)[0];
        arr.splice(clamp(to, 0, arr.length), 0, it);
      }, { structure: true });
      select({ kind: 'section', id: drag.id }, { fromTree: true });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /* ------------------------------------------------------------------ ghost chip (shared by drags) */

  var ghostEl;
  function showGhost(text, x, y) { ghostEl.textContent = text; ghostEl.hidden = false; moveGhost(x, y); }
  function moveGhost(x, y) { ghostEl.style.left = x + 'px'; ghostEl.style.top = y + 'px'; }
  function hideGhost() { ghostEl.hidden = true; }

  /* ------------------------------------------------------------------ insert panel */

  var TYPE_GLYPHS = {
    announcement: '<svg viewBox="0 0 44 32"><rect x="2" y="12" width="40" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    hero: '<svg viewBox="0 0 44 32"><rect x="2" y="2" width="40" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 22l7-8 6 6 4-4 5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 8h12" stroke="currentColor" stroke-width="2.2"/></svg>',
    categories: '<svg viewBox="0 0 44 32"><rect x="3" y="3" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="24" y="3" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="18" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="24" y="18" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    products: '<svg viewBox="0 0 44 32"><rect x="3" y="4" width="11" height="14" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="17" y="4" width="11" height="14" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="31" y="4" width="11" height="14" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 24h8M17 24h8M31 24h8" stroke="currentColor" stroke-width="2"/></svg>',
    about: '<svg viewBox="0 0 44 32"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 28c1.6-5 4.4-7 8-7s6.4 2 8 7M26 8h14M26 14h14M26 20h9" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    reviews: '<svg viewBox="0 0 44 32"><path d="M10 4l2.4 5 5.3.7-3.9 3.8.9 5.2L10 16.2l-4.7 2.5.9-5.2L2.3 9.7 7.6 9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M24 8h16M24 14h16M24 20h10" stroke="currentColor" stroke-width="1.6"/></svg>',
    delivery: '<svg viewBox="0 0 44 32"><rect x="3" y="7" width="22" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M25 11h9l6 6v4H25z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="33" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    whatsapp: '<svg viewBox="0 0 44 32"><path d="M22 3a12.5 12.5 0 00-10.8 18.8L9 29l7.5-2A12.5 12.5 0 1022 3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
  };

  var prevCache = {};

  function buildInsertPanel() {
    var panel = $('insertPanel');
    panel.innerHTML = '';
    panel.appendChild(ce('div', 'st-insert__hint', '<b>Des sections, pas des pixels.</b> Chaque section s’adapte toute seule de 360 à 1440 px. Glissez-en une sur un aperçu pour l’insérer à cet endroit (ligne bleue), ou cliquez pour l’insérer après la sélection. Raccourci : <kbd>S</kbd>.'));
    var grid = ce('div', 'st-insert__grid');
    var list = [];
    try { D.sectionTypes.forEach(function (t) { list.push(t); }); } catch (e) { /* collection helper missing */ }
    if (!list.length && D.sectionTypes) { Object.keys(D.sectionTypes).forEach(function (k) { list.push(D.sectionTypes[k]); }); }
    list.forEach(function (t) {
      if (!t || !t.id) return;
      var card = ce('div', 'st-typecard');
      card.setAttribute('data-type', t.id);
      card.innerHTML = (TYPE_GLYPHS[t.id] || TYPE_GLYPHS.about) + '<b>' + esc(t.name || t.id) + '</b>';
      card.title = t.description || '';
      card.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        startInsertDrag(e, t);
      });
      card.addEventListener('mouseenter', function () { showTypePreview(card, t); });
      card.addEventListener('mouseleave', hideTypePreview);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    if (hooks.insertPanelBuilt) { try { hooks.insertPanelBuilt(panel); } catch (e) { /* module error */ } }
  }

  function showTypePreview(card, t, pos) {
    var prev = $('hoverPrev');
    var r = card.getBoundingClientRect();
    prev.innerHTML = '';
    var shot = ce('div', 'st-prevcard__shot');
    /* the cache key carries every style input (template, fonts, radius, buttons…), and
     * afterChange({structure}) empties the cache besides: no stale previews after a restyle.
     * A saved block (t.settings) carries its own content: keyed by the block, not the type. */
    var th = state.config.theme || {};
    var key = [t.blockId ? 'blk:' + t.blockId : t.id, state.config.template, th.palette, th.intensity, th.fonts, th.radius, th.buttons,
      state.config.store ? state.config.store.niche : ''].join('|');
    var root = prevCache[key];
    if (!root) {
      root = document.createElement('div');
      try {
        var cfg = clone(state.config);
        cfg.sections = [{ id: 's1', type: t.id, enabled: true, settings: t.settings ? clone(t.settings) : newSectionSettings(t.id) }];
        R.render(cfg, root, { device: 'phone', page: 'home' });
        prevCache[key] = root;
      } catch (e) { root = null; }
    }
    if (root) shot.appendChild(root);
    prev.appendChild(shot);
    prev.appendChild(ce('p', '', esc(t.description || '')));
    prev.hidden = false;
    /* anchored past the panel's right edge, over the canvas: it never covers the
     * neighbouring type cards you are comparing */
    if (pos && typeof pos.left === 'number') {
      /* from the toolbar's insert popover: above it, beside the hovered card */
      prev.style.left = clamp(pos.left, 8, window.innerWidth - 240) + 'px';
      prev.style.top = clamp(pos.top - prev.offsetHeight - 10, 8, window.innerHeight - 240) + 'px';
      return;
    }
    var aside = document.querySelector('.st-left');
    var ar = aside ? aside.getBoundingClientRect() : r;
    var top = clamp(r.top, 8, window.innerHeight - 240);
    prev.style.left = (ar.right + 12) + 'px';
    prev.style.top = top + 'px';
  }
  function hideTypePreview() { $('hoverPrev').hidden = true; }

  function newSectionSettings(type) {
    var niche = state.config.store ? state.config.store.niche : null;
    var name = state.config.store ? state.config.store.name : '';
    if (typeof D.sectionSettings === 'function') {
      try { return D.sectionSettings(type, niche, name); } catch (e) { /* fall back */ }
    }
    var def = sectionDef(type);
    return def && def.defaults ? clone(def.defaults) : {};
  }

  function insertSection(type, beforeId, presetSettings, labelName) {
    var def = sectionDef(type);
    if (!def) return;
    var sec = {
      id: typeof D.newId === 'function' ? D.newId(state.config, 's') : 's' + (sections().length + 101),
      type: type, enabled: true, settings: presetSettings ? clone(presetSettings) : newSectionSettings(type)
    };
    commit('Ajout de la section « ' + (labelName || def.name || type) + ' »', function (c) {
      var arr = c.sections || (c.sections = []);
      var at = arr.length;
      if (beforeId) arr.forEach(function (s, i) { if (s.id === beforeId) at = i; });
      else if (state.sel && state.sel.kind === 'section') {
        arr.forEach(function (s, i) { if (s.id === state.sel.id) at = i + 1; });
      }
      arr.splice(at, 0, sec);
    }, { structure: true });
    select({ kind: 'section', id: sec.id }, { pan: true });
    toast('Section « ' + (labelName || def.name || type) + ' » ajoutée.', 'ok');
    return sec.id;
  }

  /* drag a section type from the panel onto an artboard */
  function startInsertDrag(e, t) {
    var startX = e.clientX, startY = e.clientY, moved = false, beforeId, overFrame = null;
    var dropline = $('dropline');
    hideTypePreview();

    function frameUnder(x, y) {
      var el = document.elementFromPoint(x, y);
      return el ? insideFrame(el) : null;
    }

    function onMove(ev) {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
      if (!moved) {
        moved = true;
        if (state.page !== 'home') showPage('home');
        showGhost('+ ' + (t.name || t.id), ev.clientX, ev.clientY);
        document.body.style.cursor = 'copy';
      }
      moveGhost(ev.clientX, ev.clientY);
      var frame = frameUnder(ev.clientX, ev.clientY);
      overFrame = frame;
      beforeId = undefined;
      if (!frame) { dropline.hidden = true; return; }
      var d = dropAt(frame, ev.clientY);
      beforeId = d.beforeId;
      showDropline(d);
    }

    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideGhost();
      dropline.hidden = true;
      document.body.style.cursor = '';
      if (!moved) { insertSection(t.id); return; } // a simple click adds after the selection
      if (overFrame) insertSection(t.id, beforeId === null ? undefined : beforeId);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }

  /* ------------------------------------------------------------------ inspector */

  function buildInspector() {
    var insp = $('inspector');
    var title = $('inspTitle');
    var sub = $('inspSub');
    if (!insp) return;
    insp.innerHTML = '';
    var sel = state.sel;
    if (sel && hooks.customInspector && hooks.customInspector(sel, insp, title, sub)) {
      /* a module drew it (a detached section and its DualEngine nodes: studio-inspector.js) */
    } else if (sel && isMulti(sel)) {
      title.textContent = sel.ids.length + ' sections sélectionnées';
      sub.textContent = '';
      insp.appendChild(multiInspector(sel.ids));
    } else if (sel && sel.kind === 'section') {
      var s = sectionById(sel.id);
      if (!s) { state.sel = null; return buildInspector(); }
      var def = sectionDef(s.type);
      /* one display name everywhere (tag, tree, toasts, here): the title, with the type as the
       * dim suffix when they differ — never the raw s1/s2 ids */
      var nm = sectionName(s);
      var typeName = def && def.name ? def.name : s.type;
      title.textContent = nm;
      sub.textContent = nm === typeName ? '' : typeName;
      insp.appendChild(sectionInspector(s, def, sel.field));
    } else if (sel && sel.kind === 'product') {
      var p = productById(sel.id);
      if (!p) { state.sel = null; return buildInspector(); }
      title.textContent = p.name || 'Produit';
      sub.textContent = p.name ? 'Produit' : '';
      insp.appendChild(productInspector(p));
    } else if (sel && sel.kind === 'chrome') {
      title.textContent = chromeName(sel.id);
      var cdef = sel.el ? esElements(sel.id).filter(function (d) { return d.key === sel.el; })[0] : null;
      sub.textContent = cdef && cdef.sel ? cdef.label : 'toutes les pages';
      insp.appendChild(chromeInspector(sel));
    } else if (sel && sel.kind === 'page') {
      var pg = pageById(sel.id);
      if (!pg) { state.sel = null; return buildInspector(); }
      title.textContent = pg.title || 'Page';
      sub.textContent = pg.title ? 'Page' : '';
      insp.appendChild(pageInspector(pg));
    } else {
      title.textContent = 'Boutique';
      sub.textContent = 'rien n’est sélectionné';
      insp.appendChild(styleInspector());
    }
    if (hooks.inspectorBuilt) { try { hooks.inspectorBuilt(sel); } catch (e) { /* module error */ } }
  }

  /* --- header / footer: their content comes from the store; their look is in the Design tab --- */
  function chromeInspector(sel) {
    var frag = document.createDocumentFragment();
    var g = group('Contenu');
    var footer = sel.id === '@footer';
    g.body.appendChild(fieldText(footer ? 'Slogan (sous le nom)' : 'Nom de la boutique', footer ? state.config.store.tagline : state.config.store.name,
      footer ? 120 : 40, function (v) {
        commit(footer ? 'Slogan modifié' : 'Nom de la boutique modifié', function (c) {
          if (!c.store) c.store = {};
          if (footer) c.store.tagline = v; else c.store.name = v;
        }, { coalesce: footer ? 'store:tagline' : 'store:name' });
      }));
    g.body.appendChild(ce('p', 'st-insp__empty', (footer
      ? 'Le pied de page reprend le nom, le slogan, vos pages et vos moyens de paiement.'
      : 'L’en-tête reprend le nom (ou le logo), vos pages « dans le menu » et le panier.') +
      ' Son apparence (fond, typographie, espacements, bordures…) se règle dans l’onglet Design.'));
    if (hooks.openDesign) {
      var b = ce('button', 'st-secbtn', 'Régler le design de ' + (footer ? 'ce pied de page' : 'cet en-tête'));
      b.type = 'button';
      b.addEventListener('click', function () { hooks.openDesign(); });
      g.body.appendChild(b);
    }
    frag.appendChild(g);
    return frag;
  }

  /* --- multi-selection inspector: the bulk actions --- */

  function multiInspector(ids) {
    var frag = document.createDocumentFragment();
    var g = group(ids.length + ' sections sélectionnées');
    var list = ce('div', 'st-multilist');
    ids.forEach(function (id) {
      var s = sectionById(id);
      if (s) list.appendChild(ce('div', 'st-multilist__row', '<span class="st-row__icon">' + icon(s.type) + '</span><span>' + esc(sectionName(s)) + '</span>'));
    });
    g.body.appendChild(list);
    var anyVisible = ids.map(sectionById).filter(Boolean).some(function (s) { return s.enabled !== false; });
    var hide = ce('button', 'st-secbtn', (anyVisible ? 'Masquer les ' + ids.length + ' sections' : 'Afficher les ' + ids.length + ' sections') + ' <kbd>Ctrl ⇧ H</kbd>');
    hide.type = 'button';
    hide.addEventListener('click', toggleHideSelected);
    g.body.appendChild(hide);
    var dup = ce('button', 'st-secbtn', 'Dupliquer les ' + ids.length + ' sections <kbd>Ctrl D</kbd>');
    dup.type = 'button';
    dup.addEventListener('click', duplicateSelection);
    g.body.appendChild(dup);
    var del = ce('button', 'st-danger', 'Supprimer les ' + ids.length + ' sections <kbd>Suppr</kbd>');
    del.type = 'button';
    del.addEventListener('click', deleteSelection);
    g.body.appendChild(del);
    g.body.appendChild(ce('p', 'st-insp__empty', '↑ / ↓ déplace les sections ensemble. Maj + clic ajoute ou retire une section.'));
    frag.appendChild(g);
    return frag;
  }

  function group(titleText, open) {
    var g = ce('div', 'st-insp__group' + (open === false ? ' is-closed' : ''));
    var head = ce('button', 'st-insp__head');
    head.type = 'button';
    head.innerHTML = '<span>' + esc(titleText) + '</span><svg viewBox="0 0 24 24" class="st-caret" width="12" height="12"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var body = ce('div', 'st-insp__body');
    head.addEventListener('click', function () { g.classList.toggle('is-closed'); });
    g.appendChild(head);
    g.appendChild(body);
    g.body = body;
    return g;
  }

  function fieldWrap(labelText, countEl) {
    var w = ce('div', 'st-field');
    var l = ce('label', '', '<span>' + esc(labelText) + '</span>');
    if (countEl) l.appendChild(countEl);
    w.appendChild(l);
    return w;
  }

  function fieldText(labelText, value, max, onInput, multiline) {
    var count = max ? ce('span', 'st-count') : null;
    var w = fieldWrap(labelText, count);
    var input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value == null ? '' : String(value);
    if (max) input.maxLength = max;
    function updCount() {
      if (!count) return;
      count.textContent = input.value.length + ' / ' + max;
      count.classList.toggle('is-over', input.value.length >= max);
    }
    updCount();
    input.addEventListener('input', function () { updCount(); onInput(input.value); });
    w.appendChild(input);
    return w;
  }

  function fieldNumber(labelText, value, min, max, onChange, coKey) {
    var w = fieldWrap(labelText);
    var box = ce('div', 'st-num');
    var drag = ce('div', 'st-num__drag', '<svg viewBox="0 0 16 16"><path d="M5 4L1.5 8 5 12M11 4l3.5 4L11 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    drag.title = 'Glissez horizontalement pour changer la valeur';
    var input = document.createElement('input');
    input.type = 'number';
    if (typeof min === 'number') input.min = min;
    if (typeof max === 'number') input.max = max;
    input.value = value == null ? '' : String(value);
    var lastV = value == null ? null : value; // the last committed value, mirrored back on blur
    function push(v) {
      v = Math.round(v);
      if (typeof min === 'number') v = Math.max(min, v);
      if (typeof max === 'number') v = Math.min(max, v);
      input.value = String(v);
      lastV = v;
      onChange(v);
    }
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (!isFinite(v)) return;
      var cv = clamp(Math.round(v), typeof min === 'number' ? min : -1e15, typeof max === 'number' ? max : 1e15);
      lastV = cv;
      onChange(cv);
    });
    /* on blur/Enter the field shows what was really committed: typing 999 in a 2–24 field
     * commits 24, and the input says 24 too (writing back on each keystroke would fight typing) */
    input.addEventListener('change', function () {
      var v = parseFloat(input.value);
      if (isFinite(v)) push(v);
      else input.value = lastV == null ? '' : String(lastV);
    });
    /* the Figma-style horizontal scrub */
    drag.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      var startX = e.clientX;
      var startV = parseFloat(input.value);
      if (!isFinite(startV)) startV = typeof min === 'number' ? min : 0;
      var range = (typeof max === 'number' && typeof min === 'number') ? max - min : 200;
      var step = Math.max(1, Math.round(range / 200));
      function mv(ev) { push(startV + Math.round((ev.clientX - startX) / 2) * step); }
      function up() { drag.removeEventListener('pointermove', mv); drag.removeEventListener('pointerup', up); }
      drag.addEventListener('pointermove', mv);
      drag.addEventListener('pointerup', up);
    });
    box.appendChild(drag);
    box.appendChild(input);
    w.appendChild(box);
    return w;
  }

  function fieldSelect(labelText, value, options, onChange) {
    var w = fieldWrap(labelText);
    var wrap = ce('div', 'st-selectwrap');
    var sel = document.createElement('select');
    (options || []).forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = o.label;
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var raw = sel.value;
      var found = (options || []).filter(function (o) { return String(o.value) === raw; })[0];
      onChange(found ? found.value : raw);
    });
    wrap.appendChild(sel);
    w.appendChild(wrap);
    return w;
  }

  function fieldCheck(labelText, value, onChange) {
    var l = ce('label', 'st-check');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', function () { onChange(input.checked); });
    l.appendChild(input);
    l.appendChild(ce('span', '', esc(labelText)));
    return l;
  }

  function readFileAsImage(file, done) {
    if (!file || !/^image\//.test(file.type)) { toast('Choisissez une image (JPEG, PNG, WebP).', 'warn'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var maxW = 800;
          var scale = Math.min(1, maxW / img.width);
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          done(cv.toDataURL('image/jpeg', 0.85));
        } catch (e) { toast('L’image n’a pas pu être lue.', 'err'); }
      };
      img.onerror = function () { toast('L’image n’a pas pu être lue.', 'err'); };
      img.src = reader.result;
    };
    reader.onerror = function () { toast('L’image n’a pas pu être lue.', 'err'); };
    reader.readAsDataURL(file);
  }

  // The combined image control: the seller's image first, else the demo photo (credited), else nothing.
  function fieldImage(labelText, getObj, setLabel, hasPhotoField) {
    var w = ce('div', 'st-imgfield');
    w.appendChild(ce('label', '', '<span style="font-size:11px;color:var(--st-ink-dim)">' + esc(labelText) + '</span>'));
    var obj = getObj(state.config);
    var image = obj ? obj.image : null;
    var photo = obj && hasPhotoField ? obj.photo : null;
    var info = photo && R.photoInfo ? (function () { try { return R.photoInfo(photo); } catch (e) { return null; } })() : null;
    var prev = ce('div', 'st-imgfield__prev');
    if (image) prev.innerHTML = '<img alt="" src="' + esc(image) + '">';
    else if (info && info.src) prev.innerHTML = '<img alt="' + esc(info.alt || '') + '" src="' + esc(info.src) + '">';
    else prev.innerHTML = '<span>Aucune image</span>';
    w.appendChild(prev);
    if (!image && info && info.credit) {
      w.appendChild(ce('div', 'st-credit', 'Photo d’exemple · <a href="' + esc(info.credit.profileUrl || '#') + '" target="_blank" rel="noopener">' +
        esc(info.credit.name || 'photographe') + '</a> / <a href="' + esc(info.credit.photoUrl || '#') + '" target="_blank" rel="noopener">Unsplash</a>'));
    }
    var row = ce('div', 'st-imgfield__row');
    row.className = 'st-imgfield__row';
    var up = ce('button', 'st-ghostbtn', 'Mettre ma photo');
    up.type = 'button';
    up.addEventListener('click', function () {
      var fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'image/*';
      fi.addEventListener('change', function () {
        readFileAsImage(fi.files && fi.files[0], function (dataUrl) {
          commit(setLabel, function (c) {
            var o = getObj(c);
            if (o) { o.image = dataUrl; if (hasPhotoField) o.photo = null; }
          }, { structure: true });
        });
      });
      fi.click();
    });
    row.appendChild(up);
    if (hooks.pickAsset) {
      var pick = ce('button', 'st-ghostbtn', 'Choisir dans Images');
      pick.type = 'button';
      pick.addEventListener('click', function () {
        hooks.pickAsset({ label: labelText, set: imageSetter(getObj, setLabel, hasPhotoField) });
      });
      row.appendChild(pick);
    }
    if (image || (info && info.src)) {
      var rm = ce('button', 'st-ghostbtn', image ? 'Retirer' : 'Retirer la photo');
      rm.type = 'button';
      rm.addEventListener('click', function () {
        commit('Retrait de l’image', function (c) {
          var o = getObj(c);
          if (!o) return;
          if (o.image) o.image = null;
          else if (hasPhotoField) o.photo = null;
        }, { structure: true });
      });
      row.appendChild(rm);
    }
    w.appendChild(row);
    /* crop and zoom: the section's photo, straight into the crop mode on the canvas (Design › Image et recadrage) */
    var cs = state.sel;
    var cdef = cs && cs.kind === 'section' && !cs.el ? esElements(sectionType(cs.id)).filter(function (d) { return d.kind === 'image'; })[0] : null;
    if (cdef && (image || (info && info.src)) && hooks.cropImage) {
      var cb = ce('button', 'st-ghostbtn st-imgfield__crop', '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 1.5v10h10M1.5 4.5h10v10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span>Recadrer et zoomer</span>');
      cb.type = 'button';
      cb.title = 'Recadrer et zoomer la photo (double-clic sur la photo)';
      cb.addEventListener('click', function () {
        var nsel = { kind: 'section', id: cs.id, el: cdef.key };
        if (cdef.field && hasField(sectionType(cs.id), cdef.field)) { nsel.field = cdef.field; nsel.fieldType = sectionType(cs.id); }
        select(nsel);
        requestAnimationFrame(function () { requestAnimationFrame(function () { hooks.cropImage(); }); });
      });
      w.appendChild(cb);
    }
    return w;
  }

  /* --- section inspector: the form is built from the contract's field definitions --- */

  function sectionInspector(s, def, focusField) {
    var frag = document.createDocumentFragment();
    var gc = group('Contenu');
    var fields = def && Array.isArray(def.fields) ? def.fields : [];
    fields.forEach(function (f) {
      if (!f || !f.key || !f.type) return;
      var node = sectionField(s, f);
      if (!node) return;
      if (focusField && f.key === focusField) node.classList && node.classList.add('st-field--focus');
      gc.body.appendChild(node);
    });
    if (!fields.length) gc.body.appendChild(ce('div', 'st-insp__empty', 'Cette section n’a pas de réglages.'));
    frag.appendChild(gc);

    /* Disposition: what a section CAN do, said plainly. The layout comes from the store's model
     * (Boutique › Modèle) so it stays correct from 360 to 1440 — the promise, not a missing panel. */
    var gl = group('Disposition');
    var idx = -1, all = sections();
    all.forEach(function (x, i) { if (x.id === s.id) idx = i; });
    var posRow = ce('div', 'st-insp__row');
    posRow.appendChild(ce('span', 'st-insp__label', 'Position ' + (idx + 1) + ' sur ' + all.length));
    var upB = ce('button', 'st-iconbtn st-iconbtn--sq', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    upB.type = 'button'; upB.setAttribute('data-tip', 'Monter la section'); upB.setAttribute('data-kbd', '↑'); upB.setAttribute('aria-label', 'Monter la section');
    upB.disabled = idx <= 0;
    upB.addEventListener('click', function () { moveSelection(-1, true); buildInspector(); });
    var dnB = ce('button', 'st-iconbtn st-iconbtn--sq', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M4.5 9L8 12.5 11.5 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    dnB.type = 'button'; dnB.setAttribute('data-tip', 'Descendre la section'); dnB.setAttribute('data-kbd', '↓'); dnB.setAttribute('aria-label', 'Descendre la section');
    dnB.disabled = idx === -1 || idx >= all.length - 1;
    dnB.addEventListener('click', function () { moveSelection(1, true); buildInspector(); });
    posRow.appendChild(upB);
    posRow.appendChild(dnB);
    gl.body.appendChild(posRow);
    gl.body.appendChild(fieldCheck('Visible sur la page d’accueil', s.enabled !== false, function (v) {
      commit(v ? 'Affichage de la section' : 'Masquage de la section', function (c) {
        var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
        if (t) t.enabled = v;
      }, { structure: true });
    }));
    var tplName = '';
    try { D.templates.forEach(function (t) { if (t.id === state.config.template) tplName = t.name; }); } catch (e) { /* no templates */ }
    var promise = ce('div', 'st-promise',
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="8.5" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="11" y="5" width="3.5" height="7.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>' +
      '<div><b>Responsive, de 360 à 1440 px</b><span>La mise en page de cette section suit le modèle' + (tplName ? ' « ' + esc(tplName) + ' »' : '') +
      ' : impossible de casser l’affichage sur téléphone. Pour la changer, choisissez un autre modèle.</span></div>');
    var tplLink = ce('button', 'st-linkbtn', 'Changer de modèle…');
    tplLink.type = 'button';
    tplLink.addEventListener('click', function () { select(null); requestAnimationFrame(function () { var g = $('inspector').querySelector('.st-tplcards'); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start' }); }); });
    promise.lastChild.appendChild(tplLink);
    gl.body.appendChild(promise);
    frag.appendChild(gl);

    var gs = group('Actions');
    var actRow = ce('div', 'st-btnrow');
    var dup = ce('button', 'st-secbtn', 'Dupliquer <kbd>Ctrl D</kbd>');
    dup.type = 'button';
    dup.addEventListener('click', function () { duplicateSelection(); });
    actRow.appendChild(dup);
    var del = ce('button', 'st-danger', 'Supprimer <kbd>Suppr</kbd>');
    del.type = 'button';
    del.addEventListener('click', function () { deleteSelection(); });
    actRow.appendChild(del);
    gs.body.appendChild(actRow);
    frag.appendChild(gs);

    if (focusField) {
      requestAnimationFrame(function () {
        var n = $('inspector').querySelector('.st-field--focus');
        if (n) {
          n.scrollIntoView({ block: 'center' });
          n.style.outline = '1.5px solid var(--st-blue)';
          n.style.outlineOffset = '4px';
          n.style.borderRadius = '6px';
          setTimeout(function () { n.style.outline = ''; }, 1200);
        }
      });
    }
    return frag;
  }

  function sectionField(s, f) {
    function setVal(label, co) {
      return function (v) {
        commit(label, function (c) {
          var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
          if (t) { t.settings = t.settings || {}; t.settings[f.key] = v; }
        }, { coalesce: co });
      };
    }
    var val = s.settings ? s.settings[f.key] : undefined;
    var label = f.label || f.key;
    var co = 'sec:' + s.id + ':' + f.key;
    switch (f.type) {
      case 'text':
        return fieldText(label, val, f.max, setVal('Texte modifié (' + label.toLowerCase() + ')', co), false);
      case 'textarea':
        return fieldText(label, val, f.max, setVal('Texte modifié (' + label.toLowerCase() + ')', co), true);
      case 'number':
        return fieldNumber(label, val, f.min, f.max, setVal('Réglage « ' + label + ' »', co), co);
      case 'select':
        return fieldSelect(label, val, f.options || [], setVal('Réglage « ' + label + ' »'));
      case 'image':
        return fieldImage(label, function (c) {
          return (c.sections || []).filter(function (x) { return x.id === s.id; }).map(function (x) { return x.settings; })[0] || null;
        }, 'Image de la section', hasField(s.type, 'photo'));
      case 'photo':
        return null; // shown inside the image control, with its credit
      case 'items':
        return fieldItems(s, f);
      default:
        return null; // a field type this studio does not know yet (contract moving): skip, never crash
    }
  }

  function fieldItems(s, f) {
    var wrap = ce('div', 'st-items');
    var list = (s.settings && Array.isArray(s.settings[f.key])) ? s.settings[f.key] : [];
    var itemLabel = f.itemLabel || 'Élément';
    list.forEach(function (item, idx) {
      var card = ce('div', 'st-item');
      var head = ce('div', 'st-item__head', '<span>' + esc(itemLabel) + ' ' + (idx + 1) + '</span>');
      var del = ce('button', 'st-item__del', '×');
      del.type = 'button';
      del.title = 'Supprimer';
      del.addEventListener('click', function () {
        commit('Suppression d’un ' + itemLabel.toLowerCase(), function (c) {
          var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
          if (t && t.settings && Array.isArray(t.settings[f.key])) t.settings[f.key].splice(idx, 1);
        }, { structure: true });
      });
      head.appendChild(del);
      card.appendChild(head);
      (f.itemFields || []).forEach(function (sf) {
        if (!sf || !sf.key) return;
        var co = 'sec:' + s.id + ':' + f.key + ':' + idx + ':' + sf.key;
        function set(v) {
          commit('Texte modifié (' + (sf.label || sf.key).toLowerCase() + ')', function (c) {
            var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
            if (t && t.settings && Array.isArray(t.settings[f.key]) && t.settings[f.key][idx]) t.settings[f.key][idx][sf.key] = v;
          }, { coalesce: co });
        }
        var v = item ? item[sf.key] : undefined;
        if (sf.type === 'text') card.appendChild(fieldText(sf.label || sf.key, v, sf.max, set, false));
        else if (sf.type === 'textarea') card.appendChild(fieldText(sf.label || sf.key, v, sf.max, set, true));
        else if (sf.type === 'number') card.appendChild(fieldNumber(sf.label || sf.key, v, sf.min, sf.max, set, co));
        else if (sf.type === 'select') card.appendChild(fieldSelect(sf.label || sf.key, v, sf.options || [], set));
      });
      wrap.appendChild(card);
    });
    var add = ce('button', 'st-addbtn', '+ Ajouter un ' + itemLabel.toLowerCase());
    add.type = 'button';
    if (typeof f.maxItems === 'number' && list.length >= f.maxItems) add.disabled = true;
    add.addEventListener('click', function () {
      commit('Ajout d’un ' + itemLabel.toLowerCase(), function (c) {
        var t = (c.sections || []).filter(function (x) { return x.id === s.id; })[0];
        if (!t) return;
        t.settings = t.settings || {};
        if (!Array.isArray(t.settings[f.key])) t.settings[f.key] = [];
        if (typeof f.maxItems === 'number' && t.settings[f.key].length >= f.maxItems) return;
        t.settings[f.key].push(clone(f.itemDefaults || {}));
      }, { structure: true });
    });
    wrap.appendChild(add);
    return wrap;
  }

  /* --- product inspector --- */

  function productInspector(p) {
    function set(label, key, co) {
      return function (v) {
        commit(label, function (c) {
          var t = (c.products || []).filter(function (x) { return x.id === p.id; })[0];
          if (t) t[key] = v;
        }, co ? { coalesce: co } : { structure: label.indexOf('Texte') === -1 });
      };
    }
    var frag = document.createDocumentFragment();
    var gc = group('Produit');
    var setName = set('Texte modifié (nom du produit)', 'name', 'p:' + p.id + ':name');
    gc.body.appendChild(fieldText('Nom', p.name, 60, function (v) {
      setName(v);
      var t = $('inspTitle');
      if (t) t.textContent = v || 'Produit';
    }, false));
    gc.body.appendChild(fieldNumber('Prix (FCFA)', p.price, 0, 100000000, set('Prix modifié', 'price', 'p:' + p.id + ':price'), 'p:' + p.id + ':price'));
    gc.body.appendChild(fieldText('Catégorie', p.category, 40, set('Texte modifié (catégorie)', 'category', 'p:' + p.id + ':cat'), false));
    var badgeOpts = [{ value: '', label: 'Aucun' }];
    Object.keys(D.BADGES || {}).forEach(function (k) { badgeOpts.push({ value: k, label: D.BADGES[k] }); });
    gc.body.appendChild(fieldSelect('Badge', p.badge == null ? '' : p.badge, badgeOpts, function (v) {
      commit('Badge modifié', function (c) {
        var t = (c.products || []).filter(function (x) { return x.id === p.id; })[0];
        if (t) t.badge = v === '' ? null : v;
      });
    }));
    gc.body.appendChild(fieldText('Description', p.description, 300, set('Texte modifié (description)', 'description', 'p:' + p.id + ':desc'), true));
    frag.appendChild(gc);

    var gv = group('Visuel');
    gv.body.appendChild(fieldImage('Photo du produit', function (c) {
      return (c.products || []).filter(function (x) { return x.id === p.id; })[0] || null;
    }, 'Photo du produit', true));
    var sw = fieldWrap('Couleur de la tuile');
    var swatches = ce('div', 'st-swatches');
    (D.PRODUCT_COLORS || []).forEach(function (col) {
      var b = ce('button', 'st-swatch' + (String(p.color).toUpperCase() === String(col).toUpperCase() ? ' is-on' : ''));
      b.type = 'button';
      b.style.background = col;
      b.title = col;
      b.addEventListener('click', function () {
        commit('Couleur du produit', function (c) {
          var t = (c.products || []).filter(function (x) { return x.id === p.id; })[0];
          if (t) t.color = col;
        }, { structure: true });
      });
      swatches.appendChild(b);
    });
    sw.appendChild(swatches);
    gv.body.appendChild(sw);
    var artOpts = (D.ART_KINDS || []).map(function (k) { return { value: k, label: (D.ART_LABELS && D.ART_LABELS[k]) || k }; });
    if (artOpts.length) gv.body.appendChild(fieldSelect('Illustration (sans photo)', p.art, artOpts, function (v) {
      commit('Illustration du produit', function (c) {
        var t = (c.products || []).filter(function (x) { return x.id === p.id; })[0];
        if (t) t.art = v;
      });
    }));
    frag.appendChild(gv);

    var ga = group('Actions');
    var actRow = ce('div', 'st-btnrow');
    var dup = ce('button', 'st-secbtn', 'Dupliquer <kbd>Ctrl D</kbd>');
    dup.type = 'button';
    dup.addEventListener('click', duplicateSelection);
    actRow.appendChild(dup);
    var del = ce('button', 'st-danger', 'Supprimer <kbd>Suppr</kbd>');
    del.type = 'button';
    del.addEventListener('click', deleteSelection);
    actRow.appendChild(del);
    ga.body.appendChild(actRow);
    frag.appendChild(ga);
    return frag;
  }

  /* --- custom page inspector --- */

  function pageInspector(pg) {
    var frag = document.createDocumentFragment();
    var g = group('Page');
    g.body.appendChild(fieldText('Titre', pg.title, (D.PAGE_LIMITS && D.PAGE_LIMITS.title) || 60, function (v) {
      commit('Texte modifié (titre de la page)', function (c) {
        var t = (c.pages || []).filter(function (x) { return x.id === pg.id; })[0];
        if (t) t.title = v;
      }, { coalesce: 'pg:' + pg.id + ':title' });
    }, false));
    var sub = (typeof D.subdomainFor === 'function' && state.config.store) ? D.subdomainFor(state.config.store.name) : 'ma-boutique.jeere.shop';
    g.body.appendChild(ce('div', 'st-credit', 'Adresse : <code>' + esc(sub + '/pages/' + (pg.slug || '')) + '</code>'));
    g.body.appendChild(fieldText('Texte de la page', pg.body, (D.PAGE_LIMITS && D.PAGE_LIMITS.body) || 4000, function (v) {
      commit('Texte modifié (page)', function (c) {
        var t = (c.pages || []).filter(function (x) { return x.id === pg.id; })[0];
        if (t) t.body = v;
      }, { coalesce: 'pg:' + pg.id + ':body' });
    }, true));
    g.body.appendChild(fieldCheck('Dans le menu', pg.inMenu, function (v) {
      commit('Navigation de la page', function (c) {
        var t = (c.pages || []).filter(function (x) { return x.id === pg.id; })[0];
        if (t) t.inMenu = v;
      }, { structure: true });
    }));
    g.body.appendChild(fieldCheck('Dans le pied de page', pg.inFooter, function (v) {
      commit('Navigation de la page', function (c) {
        var t = (c.pages || []).filter(function (x) { return x.id === pg.id; })[0];
        if (t) t.inFooter = v;
      }, { structure: true });
    }));
    var del = ce('button', 'st-danger', 'Supprimer la page');
    del.type = 'button';
    del.addEventListener('click', deleteSelection);
    g.body.appendChild(del);
    frag.appendChild(g);
    return frag;
  }

  function addCustomPage() {
    var limits = D.PAGE_LIMITS || { max: 20 };
    if (customPages().length >= (limits.max || 20)) { toast('20 pages au maximum.', 'warn'); return; }
    var id = typeof D.newId === 'function' ? D.newId(state.config, 'pg') : 'pg' + (customPages().length + 101);
    commit('Ajout d’une page', function (c) {
      if (!Array.isArray(c.pages)) c.pages = [];
      var title = 'Nouvelle page';
      var slug = (typeof D.uniqueSlug === 'function') ? D.uniqueSlug(c, title) : (D.slugify ? D.slugify(title) : 'nouvelle-page');
      c.pages.push({ id: id, title: title, slug: slug || 'nouvelle-page', body: '', inMenu: false, inFooter: true });
    }, { structure: true });
    state.sel = { kind: 'page', id: id };
    showPage('page', id);
    buildInspector();
  }

  /* --- store style inspector (nothing selected) --- */

  function styleInspector() {
    var cfg = state.config;
    var theme = cfg.theme || {};
    var frag = document.createDocumentFragment();

    var gt = group('Modèle');
    var cards = ce('div', 'st-tplcards');
    try {
      D.templates.forEach(function (t) {
        var b = ce('button', 'st-tplcard' + (cfg.template === t.id ? ' is-on' : ''), '<b>' + esc(t.name) + ' · ' + esc(t.style || '') + '</b><span>' + esc(t.bestFor || '') + '</span>');
        b.type = 'button';
        b.addEventListener('click', function () {
          commit('Changement de modèle', function (c) { c.template = t.id; }, { structure: true });
        });
        cards.appendChild(b);
      });
    } catch (e) { /* templates missing */ }
    gt.body.appendChild(cards);
    frag.appendChild(gt);

    var gp = group('Couleurs');
    var sw = ce('div', 'st-swatches');
    try {
      D.palettes.forEach(function (pal) {
        var b = ce('button', 'st-swatch' + (theme.palette === pal.id ? ' is-on' : ''));
        b.type = 'button';
        b.title = pal.name;
        var c = pal.colors || {};
        b.style.background = 'linear-gradient(135deg, ' + (c.bg || '#eee') + ' 48%, ' + (c.accent || '#333') + ' 52%)';
        b.addEventListener('click', function () {
          commit('Changement de palette', function (cc) { cc.theme = cc.theme || {}; cc.theme.palette = pal.id; }, { structure: true });
        });
        sw.appendChild(b);
      });
    } catch (e) { /* palettes missing */ }
    gp.body.appendChild(sw);
    var intens = ce('div', 'st-seg');
    (D.INTENSITY_OPTIONS || [{ value: 'vivid', label: 'Vives' }, { value: 'soft', label: 'Douces' }]).forEach(function (o) {
      var b = ce('button', theme.intensity === o.value ? 'is-on' : '', esc(o.label));
      b.type = 'button';
      b.title = o.hint || '';
      b.addEventListener('click', function () {
        commit('Intensité des couleurs', function (c) { c.theme = c.theme || {}; c.theme.intensity = o.value; }, { structure: true });
      });
      intens.appendChild(b);
    });
    var iw = fieldWrap('Intensité');
    iw.appendChild(intens);
    gp.body.appendChild(iw);
    frag.appendChild(gp);

    var gs = group('Style');
    var fontOpts = [];
    try { D.fontPairs.forEach(function (f) { fontOpts.push({ value: f.id, label: f.name }); }); } catch (e) { /* ignore */ }
    if (fontOpts.length) gs.body.appendChild(fieldSelect('Polices', theme.fonts, fontOpts, function (v) {
      commit('Changement de polices', function (c) { c.theme = c.theme || {}; c.theme.fonts = v; }, { structure: true });
    }));
    var rseg = ce('div', 'st-seg');
    (D.RADIUS_OPTIONS || []).forEach(function (o) {
      var b = ce('button', theme.radius === o.value ? 'is-on' : '', esc(o.label));
      b.type = 'button';
      b.addEventListener('click', function () {
        commit('Angles modifiés', function (c) { c.theme = c.theme || {}; c.theme.radius = o.value; }, { structure: true });
      });
      rseg.appendChild(b);
    });
    var rw = fieldWrap('Angles');
    rw.appendChild(rseg);
    gs.body.appendChild(rw);
    var bseg = ce('div', 'st-seg');
    (D.BUTTON_OPTIONS || []).forEach(function (o) {
      var b = ce('button', theme.buttons === o.value ? 'is-on' : '', esc(o.label));
      b.type = 'button';
      b.addEventListener('click', function () {
        commit('Boutons modifiés', function (c) { c.theme = c.theme || {}; c.theme.buttons = o.value; }, { structure: true });
      });
      bseg.appendChild(b);
    });
    var bw = fieldWrap('Boutons');
    bw.appendChild(bseg);
    gs.body.appendChild(bw);
    frag.appendChild(gs);

    var gb = group('Boutique');
    var store = cfg.store || {};
    var nicheOpts = nicheList().map(function (n) { return { value: n.id, label: n.label }; });
    if (nicheOpts.length) {
      var nf = fieldSelect('Métier (textes et photos d’exemple)', store.niche || '', nicheOpts, function (v) { changeNiche(v); });
      nf.appendChild(ce('div', 'st-credit', 'Remplace les textes, catégories, produits et photos d’exemple par ceux du métier choisi. Vos couleurs, polices, modèle et pages restent. Ctrl Z annule.'));
      gb.body.appendChild(nf);
    }
    gb.body.appendChild(fieldText('Nom', store.name, 40, function (v) {
      commit('Texte modifié (nom de la boutique)', function (c) { c.store = c.store || {}; c.store.name = v; }, { coalesce: 'store:name' });
      syncTopBar();
    }, false));
    gb.body.appendChild(fieldText('Slogan', store.tagline, 90, function (v) {
      commit('Texte modifié (slogan)', function (c) { c.store = c.store || {}; c.store.tagline = v; }, { coalesce: 'store:tagline' });
    }, false));
    gb.body.appendChild(fieldText('Numéro WhatsApp', store.whatsapp, 20, function (v) {
      commit('Numéro WhatsApp modifié', function (c) { c.store = c.store || {}; c.store.whatsapp = v; }, { coalesce: 'store:wa' });
    }, false));
    gb.body.appendChild(fieldText('Ville', store.city, 40, function (v) {
      commit('Texte modifié (ville)', function (c) { c.store = c.store || {}; c.store.city = v; }, { coalesce: 'store:city' });
    }, false));
    frag.appendChild(gb);

    var gpay = group('Paiements', false);
    (D.PAYMENTS || []).forEach(function (pm) {
      gpay.body.appendChild(fieldCheck(pm.label, cfg.payments && cfg.payments[pm.key], function (v) {
        commit('Moyens de paiement', function (c) { c.payments = c.payments || {}; c.payments[pm.key] = v; }, { structure: true });
      }));
    });
    frag.appendChild(gpay);

    var gf = group('Fiche boutique', false);
    var exp = ce('button', 'st-addbtn', 'Exporter le JSON — Ctrl E');
    exp.type = 'button';
    exp.addEventListener('click', exportJSON);
    gf.body.appendChild(exp);
    var imp = ce('button', 'st-addbtn', 'Importer un JSON');
    imp.type = 'button';
    imp.addEventListener('click', function () { $('importFile').click(); });
    gf.body.appendChild(imp);
    var open = ce('a', 'st-addbtn', 'Ouvrir dans l’éditeur simple');
    open.href = '../creer/';
    open.style.textAlign = 'center';
    open.style.display = 'block';
    gf.body.appendChild(open);
    frag.appendChild(gf);

    return frag;
  }

  /* ------------------------------------------------------------------ edit actions */

  /* a duplicated section keeps its design: its element styles follow under the new id */
  function copyElStyles(c, fromId, toId) {
    var es = c && c.elementStyles;
    if (!fromId || !toId || !es || typeof es !== 'object') return;
    Object.keys(es).forEach(function (k) {
      if (k.indexOf(fromId + '/') === 0) es[toId + '/' + k.slice(fromId.length + 1)] = clone(es[k]);
    });
  }

  function duplicateSelection() {
    var sel = state.sel;
    if (!sel) { toast('Sélectionnez une section ou un produit à dupliquer.'); return; }
    if (isMulti(sel)) {
      var ids = orderIds(sel.ids);
      var copies = [];
      ids.forEach(function (id) {
        var s = sectionById(id);
        if (!s) return;
        var cp = clone(s);
        cp.id = typeof D.newId === 'function' ? D.newId({ sections: sections().concat(copies) }, 's') : 'sx' + Date.now() + copies.length;
        copies.push(cp);
      });
      if (!copies.length) return;
      commit('Duplication de ' + copies.length + ' sections', function (c) {
        var arr = c.sections || (c.sections = []);
        var at = -1;
        arr.forEach(function (x, i) { if (ids.indexOf(x.id) !== -1) at = i; });
        arr.splice.apply(arr, [at + 1, 0].concat(copies));
        copies.forEach(function (cp, k) { copyElStyles(c, ids.filter(function (id) { return !!sectionById(id); })[k], cp.id); });
      }, { structure: true });
      select({ kind: 'multi', ids: copies.map(function (x) { return x.id; }) });
      toast(copies.length + ' sections dupliquées.', 'ok');
      return;
    }
    if (sel.kind === 'section') {
      var s = sectionById(sel.id);
      if (!s) return;
      var copy = clone(s);
      copy.id = typeof D.newId === 'function' ? D.newId(state.config, 's') : 'sx' + Date.now();
      commit('Duplication de la section', function (c) {
        var arr = c.sections || [];
        var at = arr.length;
        arr.forEach(function (x, i) { if (x.id === sel.id) at = i + 1; });
        arr.splice(at, 0, copy);
        copyElStyles(c, sel.id, copy.id);
      }, { structure: true });
      select({ kind: 'section', id: copy.id });
      toast('Section dupliquée.', 'ok');
    } else if (sel.kind === 'product') {
      var p = productById(sel.id);
      if (!p) return;
      var pc = clone(p);
      pc.id = typeof D.newId === 'function' ? D.newId(state.config, 'p') : 'px' + Date.now();
      if (pc.name) pc.name = (pc.name + ' (copie)').slice(0, 60);
      commit('Duplication du produit', function (c) {
        var arr = c.products || [];
        var at = arr.length;
        arr.forEach(function (x, i) { if (x.id === sel.id) at = i + 1; });
        arr.splice(at, 0, pc);
      }, { structure: true });
      select({ kind: 'product', id: pc.id });
      toast('Produit dupliqué.', 'ok');
    }
  }

  function deleteSelection() {
    var sel = state.sel;
    if (!sel) return;
    if (isMulti(sel)) {
      var ids = sel.ids.slice();
      commit('Suppression de ' + ids.length + ' sections', function (c) {
        c.sections = (c.sections || []).filter(function (x) { return ids.indexOf(x.id) === -1; });
      }, { structure: true });
      state.sel = null;
      buildInspector();
      toast(ids.length + ' sections supprimées. Ctrl Z pour annuler.', 'info');
      return;
    }
    if (sel.kind === 'section') {
      var s = sectionById(sel.id);
      if (!s) return;
      var nm = sectionName(s);
      commit('Suppression de la section', function (c) {
        c.sections = (c.sections || []).filter(function (x) { return x.id !== sel.id; });
      }, { structure: true });
      state.sel = null;
      buildInspector();
      toast('Section « ' + nm + ' » supprimée. Ctrl Z pour annuler.', 'info');
    } else if (sel.kind === 'product') {
      if (products().length <= 1) {
        toast('Gardez au moins un produit : la boutique ne peut pas être vide.', 'warn');
        return;
      }
      commit('Suppression du produit', function (c) {
        c.products = (c.products || []).filter(function (x) { return x.id !== sel.id; });
      }, { structure: true });
      state.sel = null;
      buildInspector();
      toast('Produit supprimé. Ctrl Z pour annuler.', 'info');
    } else if (sel.kind === 'page') {
      commit('Suppression de la page', function (c) {
        c.pages = (c.pages || []).filter(function (x) { return x.id !== sel.id; });
      }, { structure: true });
      state.sel = null;
      if (state.page === 'page') showPage('home');
      buildInspector();
      toast('Page supprimée. Ctrl Z pour annuler.', 'info');
    }
  }

  function copySelection() {
    var sel = state.sel;
    if (!sel || sel.kind !== 'section') { toast('Sélectionnez une section à copier.'); return; }
    var s = sectionById(sel.id);
    if (!s) return;
    clipboard = { kind: 'jeere-section', data: clone(s) };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(clipboard)).catch(function () {});
    } catch (e) { /* in-app clipboard is enough */ }
    toast('Section « ' + sectionName(s) + ' » copiée.', 'ok');
  }

  function pasteClipboard() {
    if (!clipboard || clipboard.kind !== 'jeere-section' || !clipboard.data) { toast('Rien à coller : copiez d’abord une section (Ctrl C).'); return; }
    var copy = clone(clipboard.data);
    if (!sectionDef(copy.type)) { toast('Cette section n’existe plus dans le contrat.', 'warn'); return; }
    copy.id = typeof D.newId === 'function' ? D.newId(state.config, 's') : 'sx' + Date.now();
    commit('Collage de la section', function (c) {
      var arr = c.sections || (c.sections = []);
      var at = arr.length;
      if (state.sel && state.sel.kind === 'section') arr.forEach(function (x, i) { if (x.id === state.sel.id) at = i + 1; });
      arr.splice(at, 0, copy);
    }, { structure: true });
    select({ kind: 'section', id: copy.id });
    toast('Section collée.', 'ok');
  }

  function moveSelection(delta, alt) {
    var sel = state.sel;
    if (isMulti(sel)) {
      /* the selected sections move together, keeping their relative order */
      var ids = orderIds(sel.ids);
      var list = sections();
      var idx = list.map(function (s, i) { return ids.indexOf(s.id) !== -1 ? i : -1; }).filter(function (i) { return i !== -1; });
      if (!idx.length) return;
      if (delta < 0 && idx[0] === 0) return;
      if (delta > 0 && idx[idx.length - 1] === list.length - 1) return;
      commit('Déplacement de ' + ids.length + ' sections', function (c) {
        var arr = c.sections || [];
        var picked = arr.filter(function (s) { return ids.indexOf(s.id) !== -1; });
        var rest = arr.filter(function (s) { return ids.indexOf(s.id) === -1; });
        var first = -1;
        arr.forEach(function (s, i) { if (first === -1 && ids.indexOf(s.id) !== -1) first = i; });
        var at = clamp(first + delta, 0, rest.length);
        rest.splice.apply(rest, [at, 0].concat(picked));
        c.sections = rest;
      }, { coalesce: 'move:' + ids.join(',') });
      buildTree();
      if (!alt) panToSelection();
      return;
    }
    if (!sel || sel.kind !== 'section') return;
    var list = sections();
    var from = -1;
    list.forEach(function (s, i) { if (s.id === sel.id) from = i; });
    if (from === -1) return;
    var to = clamp(from + delta, 0, list.length - 1);
    if (to === from) return;
    commit('Déplacement de section', function (c) {
      var arr = c.sections || [];
      var it = arr.splice(from, 1)[0];
      arr.splice(to, 0, it);
    }, { coalesce: 'move:' + sel.id });
    buildTree();
    if (!alt) {
      var row = $('layersPanel').querySelector('.st-row.is-sel');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      panToSelection();
    }
  }

  /* --- « Changer de métier »: the demo content of another niche, without touching the style --- */

  function nicheList() {
    var out = [];
    try { D.niches.forEach(function (n) { if (n && n.id) out.push({ id: n.id, label: n.label || n.id }); }); }
    catch (e) { if (D.niches) Object.keys(D.niches).forEach(function (k) { var n = D.niches[k]; if (n && n.id) out.push({ id: n.id, label: n.label || n.id }); }); }
    return out;
  }

  function changeNiche(nicheId) {
    var known = nicheList().filter(function (n) { return n.id === nicheId; })[0];
    if (!known || typeof D.defaultConfig !== 'function') return;
    var cur = state.config;
    if (cur.store && cur.store.niche === nicheId) return;
    var demo;
    try { demo = D.defaultConfig(cur.template, nicheId); } catch (e) { toast('Ce métier n’a pas pu être chargé.', 'err'); return; }
    var name = (cur.store && cur.store.name) || '';
    commit('Métier « ' + known.label + ' »', function (c) {
      c.store = c.store || {};
      c.store.niche = nicheId;
      if (demo.store && demo.store.tagline) c.store.tagline = demo.store.tagline;
      (c.sections || []).forEach(function (sec) {
        var fresh = null;
        try { fresh = D.sectionSettings(sec.type, nicheId, name); } catch (e) { fresh = null; }
        if (!fresh) return;
        /* content changes, the seller's layout choices (numbers, selects) stay */
        defFields(sec.type).forEach(function (f) {
          if (f && (f.type === 'number' || f.type === 'select') && sec.settings && sec.settings[f.key] != null) fresh[f.key] = sec.settings[f.key];
        });
        sec.settings = fresh;
      });
      if (Array.isArray(demo.products) && demo.products.length) c.products = clone(demo.products);
    }, { structure: true });
    state.productId = null;
    validateSelection();
    buildInspector();
    toast('Contenu d’exemple « ' + known.label + ' » posé. Ctrl Z pour revenir.', 'ok');
  }

  /* --- Figma muscle memory: rename, cut, lock, siblings, children, panels --- */

  function renameSelection() {
    var sel = state.sel;
    if (!sel || isMulti(sel)) { toast('Sélectionnez une section, un produit ou une page à renommer.'); return; }
    switchLeftTab('layers');
    var panel = $('layersPanel');
    var attr = sel.kind === 'section' ? 'data-section-row' : sel.kind === 'product' ? 'data-product-row' : sel.kind === 'page' ? 'data-page-id' : null;
    var row = attr && panel ? panel.querySelector('[' + attr + '="' + cssEsc(sel.id) + '"]') : null;
    var name = row && row.querySelector('.st-row__name');
    if (!name) return;
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }

  function cutSelection() {
    var sel = state.sel;
    if (!sel || sel.kind !== 'section') { toast('Sélectionnez une section à couper.'); return; }
    copySelection();
    deleteSelection();
  }

  function toggleLockSelected() {
    var ids = selectedSectionIds();
    if (!ids.length) { toast('Sélectionnez une section à verrouiller.'); return; }
    ids.forEach(function (id) { ui.locked[id] = true; });
    saveUI();
    select(null);
    buildTree();
    toast(ids.length > 1 ? ids.length + ' sections verrouillées — le cadenas des calques les déverrouille.' : 'Section verrouillée — le cadenas des calques la déverrouille.');
  }

  /* Tab / Maj+Tab : section suivante / précédente (sans compter les verrouillées) */
  function selectSibling(delta) {
    var list = sections().filter(function (s) { return !isLocked(s.id); });
    if (!list.length) return;
    var ids = selectedSectionIds();
    var cur = ids.length ? ids[delta > 0 ? ids.length - 1 : 0] : null;
    var i = -1;
    list.forEach(function (s, j) { if (s.id === cur) i = j; });
    var j = i === -1 ? (delta > 0 ? 0 : list.length - 1) : (i + delta + list.length) % list.length;
    select({ kind: 'section', id: list[j].id }, { pan: true });
  }

  /* Entrée : dans la section (premier texte), puis édition de ce texte ; Maj+Entrée : le parent */
  var CHILD_ORDER = ['kicker', 'title', 'text', 'button'];
  function enterSelection() {
    var sel = state.sel;
    if (!sel || isMulti(sel)) return;
    var dev = primaryKey();
    var rootEl = roots[dev];
    if (sel.kind === 'section' && !isSubSel(sel)) {
      var secEl = rootEl && rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
      var type = secEl ? secEl.getAttribute('data-section-type') || '' : '';
      for (var i = 0; i < CHILD_ORDER.length; i++) {
        if (hasField(type, CHILD_ORDER[i]) && secEl && findFieldEl(secEl, type, CHILD_ORDER[i])) {
          select({ kind: 'section', id: sel.id, field: CHILD_ORDER[i], fieldType: type });
          return;
        }
      }
      var card = secEl && secEl.querySelector('[data-product-id]');
      if (card && productById(card.getAttribute('data-product-id'))) { select({ kind: 'product', id: card.getAttribute('data-product-id') }); return; }
      hintOnce('enter-none', 'Cette section n’a pas de texte à modifier ici : ses réglages sont dans l’inspecteur.', 4000);
      return;
    }
    if (sel.kind === 'section' && isSubSel(sel)) {
      var sEl = rootEl && rootEl.querySelector('[data-section-id="' + cssEsc(sel.id) + '"]');
      var f = sEl ? subElOf(sEl, sel) : null;
      var spec = f ? inlineSpecFor(f, sEl) : null;
      if (spec) startInlineEdit(spec);
      return;
    }
    if (sel.kind === 'product') {
      var pc = rootEl && rootEl.querySelector('[data-product-id="' + cssEsc(sel.id) + '"] .jst-card-name');
      var ps = pc ? inlineSpecFor(pc, pc.closest('[data-section-id]')) : null;
      if (ps) startInlineEdit(ps);
    }
  }
  function parentSelection() {
    var sel = state.sel;
    if (!sel || isMulti(sel)) return;
    if (isSubSel(sel) || sel.kind === 'product') escapeSelection();
  }

  /* Ctrl+\ : masquer / afficher les panneaux (le plan de travail en grand) */
  function toggleChrome(force) {
    var on = typeof force === 'boolean' ? force : !document.body.classList.contains('st-chrome-off');
    document.body.classList.toggle('st-chrome-off', on);
    toast(on ? 'Panneaux masqués — Ctrl \\ pour les rétablir.' : 'Panneaux affichés.', 'info');
    if (hooks.viewChanged) { try { hooks.viewChanged(); } catch (e) { /* module error */ } }
  }

  /* --- the image slot of the selection (the Image tool, I) --- */
  function imageSlotForSelection() {
    var sel = state.sel;
    if (!sel || isMulti(sel)) return null;
    if (sel.kind === 'product' && productById(sel.id)) {
      var pid = sel.id;
      return { label: 'Photo du produit', setLabel: 'Photo du produit', hasPhoto: true,
        getObj: function (c) { return (c.products || []).filter(function (x) { return x.id === pid; })[0] || null; } };
    }
    if (sel.kind === 'section') {
      var s = sectionById(sel.id);
      if (!s || !defFields(s.type).some(function (f) { return f && f.type === 'image'; })) return null;
      var sid = s.id;
      return { label: 'Image de la section', setLabel: 'Image de la section', hasPhoto: hasField(s.type, 'photo'),
        getObj: function (c) { return (c.sections || []).filter(function (x) { return x.id === sid; }).map(function (x) { return x.settings; })[0] || null; } };
    }
    return null;
  }
  function imageSetter(getObj, setLabel, hasPhotoField) {
    return function (v) {
      // v: { image: dataUrl } (the seller's file) or { photo: id } (a demo photo)
      commit(setLabel, function (c) {
        var o = getObj(c);
        if (!o) return;
        if (v && v.image) { o.image = v.image; if (hasPhotoField) o.photo = null; }
        else if (v && v.photo && hasPhotoField) { o.photo = v.photo; o.image = null; }
        else if (v && v.photo) { o.image = v.src || null; }
      }, { structure: true });
    };
  }
  function pickImageForSelection() {
    var slot = imageSlotForSelection();
    if (!slot || !hooks.pickAsset) {
      switchLeftTab('assets');
      hintOnce('img-none', 'Images : sélectionnez une section avec photo (ou un produit), puis choisissez une photo. Vous pouvez aussi glisser une photo sur un aperçu.', 4000);
      return false;
    }
    hooks.pickAsset({ label: slot.label, set: imageSetter(slot.getObj, slot.setLabel, slot.hasPhoto) });
    return true;
  }

  /* ------------------------------------------------------------------ export / import */

  function exportJSON() {
    var out;
    try { out = D.normalizeConfig(state.config); } catch (e) { out = state.config; }
    var json = JSON.stringify(out, null, 2);
    var name = 'fiche-boutique';
    try { if (D.slugify && out.store && out.store.name) name = 'fiche-' + (D.slugify(out.store.name) || 'boutique'); } catch (e) { /* default name */ }
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Fiche boutique exportée (' + name + '.json).', 'ok');
    } catch (e) { toast('L’export n’a pas pu démarrer.', 'err'); }
  }

  function importJSONFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { toast('Ce fichier n’est pas un JSON valide.', 'err'); return; }
      var normalized;
      try { normalized = D.normalizeConfig(parsed); } catch (e) { toast('Cette fiche n’a pas pu être lue.', 'err'); return; }
      commit('Import de la fiche', function (c) {
        Object.keys(c).forEach(function (k) { delete c[k]; });
        Object.keys(normalized).forEach(function (k) { c[k] = normalized[k]; });
      }, { structure: true });
      state.sel = null;
      showPage('home');
      buildInspector();
      toast('Fiche importée et réparée (normalizeConfig).', 'ok');
    };
    reader.onerror = function () { toast('Le fichier n’a pas pu être lu.', 'err'); };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ share / publish dialog */

  /* Two different dialogs behind the two triggers (they used to open the same thing):
   *   Partager — the fiche as a file: address + export / copy / import.
   *   Publier  — the validation story: score, issues, what publishing will mean.
   * Each has exactly ONE primary action. */
  function openShare(publish) {
    var body = $('shareBody');
    var titleEl = $('shareTitle');
    if (titleEl) titleEl.textContent = publish ? 'Publier la boutique' : 'Partager la fiche';
    var v = null;
    try { v = D.validate(D.normalizeConfig(state.config)); } catch (e) { v = null; }
    var sub = 'ma-boutique.jeere.shop';
    try { if (D.subdomainFor && state.config.store) sub = D.subdomainFor(state.config.store.name); } catch (e) { /* default */ }
    var html = '';
    if (publish) {
      html += '<p>' + (v && v.status === 'APPROUVÉ'
        ? 'Votre boutique est prête. La mise en ligne arrive avec le backend Jeere : en attendant, rien n’est publié — ce prototype garde tout dans ce navigateur.'
        : 'Quelques points sont à corriger avant la mise en ligne. La publication réelle arrive avec le backend Jeere : rien n’est publié pour l’instant.') + '</p>';
      if (v) {
        html += '<div class="st-share__score"><span class="st-pill ' + (v.status === 'APPROUVÉ' ? 'st-pill--ok' : 'st-pill--err') + '">' + esc(v.status || '') + '</span>' +
          '<span>Qualité : <b>' + esc(String(v.score != null ? v.score : '—')) + ' / 100</b></span></div>';
        var worst = (v.issues || []).filter(function (i) { return i.level === 'error'; }).concat(
          (v.issues || []).filter(function (i) { return i.level === 'warn' || i.level === 'warning'; })).slice(0, 5);
        if (worst.length) {
          html += '<ul class="st-share__issues">';
          worst.forEach(function (i) { html += '<li>' + esc(i.message || '') + '</li>'; });
          html += '</ul>';
        }
      }
    } else {
      html += '<p>La fiche boutique est un simple fichier JSON : exportez-la, partagez-la, ou ouvrez-la dans l’éditeur simple — c’est la même fiche, dans les deux sens.</p>';
    }
    html += '<div class="st-share__addr"><code>' + esc(sub) + '</code><span style="color:var(--st-ink-dim);font-size:11px">votre adresse Jeere</span></div>';
    html += '<p class="st-modal__note">Prototype : l’enregistrement est local à ce navigateur. La publication en un clic, le domaine et les connecteurs s’activent à l’ouverture du backend.</p>';
    body.innerHTML = html;
    var row = ce('div', 'st-share__row');
    var dl = ce('button', 'st-primary', 'Télécharger le JSON');
    dl.type = 'button';
    dl.addEventListener('click', exportJSON);
    row.appendChild(dl);
    if (hooks.exportPNG) {
      var png = ce('button', 'st-ghostbtn', 'Exporter en image (PNG)');
      png.type = 'button';
      png.addEventListener('click', function () { hooks.exportPNG(); });
      row.appendChild(png);
    }
    var cp = ce('button', 'st-ghostbtn', 'Copier le JSON');
    cp.type = 'button';
    cp.addEventListener('click', function () {
      var json = '';
      try { json = JSON.stringify(D.normalizeConfig(state.config), null, 2); } catch (e) { json = JSON.stringify(state.config); }
      var done = function () { toast('Fiche copiée dans le presse-papiers.', 'ok'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(done, function () { toast('La copie a été bloquée par le navigateur.', 'warn'); });
        else throw new Error('no clipboard');
      } catch (e) { toast('La copie a été bloquée par le navigateur.', 'warn'); }
    });
    row.appendChild(cp);
    if (!publish) {
      var im = ce('button', 'st-ghostbtn', 'Importer un JSON');
      im.type = 'button';
      im.addEventListener('click', function () { closeModal($('shareModal')); $('importFile').click(); });
      row.appendChild(im);
      var op = ce('a', 'st-ghostbtn', 'Ouvrir dans l’éditeur simple');
      op.href = '../creer/';
      row.appendChild(op);
    }
    body.appendChild(row);
    openModal($('shareModal'));
  }

  function openModal(m) { m.hidden = false; }
  function closeModal(m) { m.hidden = true; }
  /* the modules (command palette, Jetons, Historique…) register their overlays here, so the
   * « a dialog blocks the canvas shortcuts » rule covers them too */
  var MODAL_IDS = ['proModal', 'shareModal', 'helpOverlay'];
  function registerOverlay(id) { if (MODAL_IDS.indexOf(id) === -1) MODAL_IDS.push(id); }
  function anyModalOpen() {
    return MODAL_IDS.some(function (id) { var m = $(id); return m && !m.hidden; });
  }
  function closeModals() {
    MODAL_IDS.forEach(function (id) { var m = $(id); if (m) m.hidden = true; });
    if (hooks.overlaysClosed) { try { hooks.overlaysClosed(); } catch (e) { /* module error */ } }
  }

  /* ------------------------------------------------------------------ help overlay */

  var SHORTCUTS = [
    ['Outils (barre du bas)', [
      [['V'], 'Déplacer : sélectionner, glisser une section pour la déplacer'],
      [['H'], 'Main : déplacer la vue'],
      [['S'], 'Section : insérer une section (après la sélection)'],
      [['T'], 'Texte : le prochain clic sur un texte le modifie sur place'],
      [['I'], 'Image : changer la photo de la sélection'],
      [['C'], 'Commentaire : poser une note sur un aperçu'],
      [['Échap'], 'Revenir à l’outil Déplacer']
    ]],
    ['Essentiels', [
      [['Ctrl', 'K'], 'Palette de commandes (toutes les actions) — aussi Ctrl /'],
      [['Ctrl', 'Z'], 'Annuler'],
      [['Ctrl', '⇧', 'Z'], 'Rétablir (aussi Ctrl Y)'],
      [['Ctrl', 'S'], 'Enregistrer maintenant'],
      [['Ctrl', 'E'], 'Exporter la fiche (JSON)'],
      [['?'], 'Ce panneau'],
      [['Échap'], 'Élément parent, puis tout désélectionner']
    ]],
    ['Édition', [
      [['2 × clic'], 'Modifier le texte directement dans l’aperçu (Entrée valide, Échap annule)'],
      [['Glisser'], 'Déplacer une section sur l’aperçu (ligne bleue = point de dépose)'],
      [['Ctrl', 'C'], 'Copier la section (Ctrl X : couper)'],
      [['Ctrl', 'V'], 'Coller après la sélection'],
      [['Ctrl', 'D'], 'Dupliquer la sélection (sections, produit)'],
      [['Suppr'], 'Supprimer la sélection'],
      [['↑', '↓'], 'Déplacer la ou les sections (aussi Ctrl ] et Ctrl [)'],
      [['Alt', '↑/↓'], 'Déplacer sans faire défiler'],
      [['F2'], 'Renommer (aussi Ctrl R, ou double-clic dans les calques)'],
      [['Ctrl', '⇧', 'H'], 'Masquer / afficher la section'],
      [['Ctrl', '⇧', 'L'], 'Verrouiller la section'],
      [['Clic droit'], 'Copier · coller · dupliquer · masquer · supprimer · Mes blocs']
    ]],
    ['Sélection', [
      [['Tab'], 'Section suivante (Maj Tab : précédente)'],
      [['Entrée'], 'Entrer dans la section (premier texte), puis le modifier'],
      [['Maj', 'Entrée'], 'Revenir à la section parente'],
      [['Maj', 'clic'], 'Ajouter / retirer une section (canevas et calques)'],
      [['Ctrl', 'A'], 'Sélectionner toutes les sections de la page']
    ]],
    ['Superpositions', [
      [['Alt', 'survol'], 'Mesures entre la section sélectionnée et la survolée (et sa hauteur)'],
      [['Ctrl', '⇧', 'C'], 'Vérification des contrastes (texte illisible encadré en rouge)']
    ]],
    ['Affichage', [
      [['Ctrl', 'molette'], 'Zoomer vers le curseur (ou pincez le pavé tactile)'],
      [['+', '−'], 'Zoomer, dézoomer (avec ou sans Ctrl)'],
      [['⇧', '0'], 'Zoom 100 % (aussi Ctrl 1)'],
      [['⇧', '1'], 'Ajuster à l’écran (aussi Ctrl 0)'],
      [['⇧', '2'], 'Zoomer sur la sélection (sur l’aperçu cliqué)'],
      [['Espace', 'glisser'], 'Déplacer la vue (ou clic molette)'],
      [['Ctrl', '\\'], 'Masquer / afficher les panneaux'],
      [['D'], 'Téléphone seul · les deux · ordinateur seul'],
      [['1', '…', '5'], 'Accueil · Fiche produit · Panier · Paiement · Confirmation']
    ]]
  ];

  function buildHelp() {
    var body = $('helpBody');
    body.innerHTML = '';
    SHORTCUTS.forEach(function (grp) {
      var col = ce('div', 'st-help__group', '<h3>' + esc(grp[0]) + '</h3>');
      grp[1].forEach(function (row) {
        var keys = row[0].map(function (k) { return '<kbd>' + esc(k) + '</kbd>'; }).join('');
        col.appendChild(ce('div', 'st-help__row', '<span>' + esc(row[1]) + '</span><span class="st-help__keys">' + keys + '</span>'));
      });
      body.appendChild(col);
    });
  }

  /* ------------------------------------------------------------------ toasts */

  function toast(msg, tone) {
    var box = $('toasts');
    if (!box) return;
    /* one toast at a time, bottom-left of the canvas: the newest replaces the last (they used
     * to stack three high over the artboards) */
    box.innerHTML = '';
    var t = ce('div', 'st-toast', '<span>' + esc(msg) + '</span>');
    if (tone) t.dataset.tone = tone;
    box.appendChild(t);
    var life = Math.min(6000, 2400 + String(msg).length * 28);
    setTimeout(function () { t.classList.add('is-out'); }, life);
    setTimeout(function () { t.remove(); }, life + 260);
  }

  /* ------------------------------------------------------------------ keyboard */

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  /* Figma drawing keys that have no meaning here: say why, once in a while, instead of silence */
  var FREE_DRAW_KEYS = { f: 'cadre', r: 'rectangle', o: 'ellipse', p: 'plume', l: 'ligne', k: 'échelle' };

  function onKeyDown(e) {
    var k = typeof e.key === 'string' ? e.key : '';
    var low = k.toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    var typing = isTyping(e.target);

    /* these work even while typing (and with a dialog open) */
    if (mod && low === 's') { e.preventDefault(); saveNow(); toast('Enregistré dans ce navigateur.', 'ok'); return; }
    if (mod && low === 'e') { e.preventDefault(); exportJSON(); return; }
    if (mod && (low === 'k' || k === '/' || e.code === 'Slash')) { e.preventDefault(); if (hooks.commandPalette) hooks.commandPalette(); return; }
    if (k === 'Escape') {
      if (ctxEl) { closeCtx(); return; }
      if (hooks.escapeOverlay) { try { if (hooks.escapeOverlay()) return; } catch (err) { /* module error */ } }
      if (anyModalOpen()) { closeModals(); return; }
      if (typing) { e.target.blur(); return; }
      if (state.tool === 'text' || state.tool === 'comment') { setTool('select'); return; }
      escapeSelection();
      return;
    }

    /* a dialog claiming aria-modal really blocks the canvas: no Delete/paste/arrows behind it */
    if (anyModalOpen()) {
      if (k === '?' && !typing) { e.preventDefault(); toggleHelp(); }
      return;
    }
    if (typing) return;

    /* keyboard focus on a control of the chrome (button, tab, row): Space / Enter / Tab belong
     * to that control, never to the canvas */
    var onControl = !!(e.target && e.target.closest && e.target.closest('button, a, input, select, textarea, [role="button"], [role="tab"], [role="treeitem"], summary, [tabindex]:not(.st-stage)'));

    if (k === ' ') {
      if (onControl) return;
      spaceHeld = true; stage.classList.add('is-hand'); e.preventDefault(); return;
    }

    if (mod && low === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && low === 'y') { e.preventDefault(); redo(); return; }
    if (mod && low === 'a') { e.preventDefault(); selectAllSections(); return; }
    if (mod && e.shiftKey && low === 'c') { e.preventDefault(); if (hooks.toggleContrast) hooks.toggleContrast(); return; }
    if (mod && e.shiftKey && low === 'h') { e.preventDefault(); toggleHideSelected(); return; }
    if (mod && e.shiftKey && low === 'l') { e.preventDefault(); toggleLockSelected(); return; }
    if (mod && !e.shiftKey && low === 'r') { e.preventDefault(); renameSelection(); return; }
    if (mod && low === 'x') { e.preventDefault(); cutSelection(); return; }
    if (mod && low === 'c') { copySelection(); return; }
    if (mod && low === 'v') { pasteClipboard(); return; }
    if (mod && low === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (mod && low === 'g') { e.preventDefault(); hintOnce('group', 'Pas de groupes dans le Studio : chaque section est déjà un bloc qui s’adapte à chaque écran. Sélection multiple : Maj + clic.'); return; }
    if (mod && (k === ']' || e.code === 'BracketRight')) { e.preventDefault(); moveSelection(1, false); return; }
    if (mod && (k === '[' || e.code === 'BracketLeft')) { e.preventDefault(); moveSelection(-1, false); return; }
    if (mod && (k === '\\' || k === '.' || e.code === 'Backslash' || e.code === 'IntlBackslash')) { e.preventDefault(); toggleChrome(); return; }
    if (mod && (k === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) { e.preventDefault(); camera(fit); return; }
    if (mod && (k === '1' || e.code === 'Digit1' || e.code === 'Numpad1')) { e.preventDefault(); camera(function () { setZoom(1); }); return; }
    /* Ctrl + / Ctrl − : the browser's page zoom reflex, captured as canvas zoom (Figma parity) */
    if (mod && (k === '+' || k === '=' || e.code === 'Equal' || e.code === 'NumpadAdd')) { e.preventDefault(); setZoom(state.zoom * 1.25); return; }
    if (mod && (k === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract')) { e.preventDefault(); setZoom(state.zoom / 1.25); return; }
    if (mod) return;

    if (k === 'F2') { e.preventDefault(); renameSelection(); return; }
    if (k === 'Tab' && !onControl) { e.preventDefault(); selectSibling(e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' && !onControl) { e.preventDefault(); if (e.shiftKey) parentSelection(); else enterSelection(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 'ArrowUp') { e.preventDefault(); moveSelection(-1, e.altKey); return; }
    if (k === 'ArrowDown') { e.preventDefault(); moveSelection(1, e.altKey); return; }
    if (!e.shiftKey && !e.altKey) {
      if (low === 'v') { setTool('select'); return; }
      if (low === 'h') { setTool('hand'); return; }
      if (low === 't') { setTool(state.tool === 'text' ? 'select' : 'text'); return; }
      if (low === 'c') { setTool(state.tool === 'comment' ? 'select' : 'comment'); return; }
      if (low === 's') { e.preventDefault(); if (hooks.sectionPopover) hooks.sectionPopover(); else switchLeftTab('insert'); return; }
      if (low === 'i') { e.preventDefault(); pickImageForSelection(); return; }
      if (low === 'a') { switchLeftTab('insert'); return; }
      if (low === 'd') { cycleDevice(); return; }
      if (FREE_DRAW_KEYS[low]) {
        hintOnce('freedraw', 'Pas de dessin libre (' + FREE_DRAW_KEYS[low] + ') : le Studio assemble des sections qui restent justes sur chaque téléphone. S pour insérer une section, T pour modifier un texte.');
        return;
      }
    }
    if (k === '?') { toggleHelp(); return; }
    if (k === '+' || k === '=') { setZoom(state.zoom * 1.25); return; }
    if (k === '-') { setZoom(state.zoom / 1.25); return; }

    /* Shift+0 / Shift+1 / Shift+2 : 100 %, fit and zoom-to-selection, like Figma (by physical
     * position, so the reflex works on QWERTY and the AZERTY shifted digits stop teleporting
     * between pages) */
    if (e.shiftKey && (e.code === 'Digit0' || e.code === 'Numpad0')) { e.preventDefault(); camera(function () { setZoom(1); }); return; }
    if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Numpad1')) { e.preventDefault(); camera(fit); return; }
    if (e.shiftKey && (e.code === 'Digit2' || e.code === 'Numpad2')) { e.preventDefault(); camera(zoomToSelection); return; }
    if (e.shiftKey) return;

    /* pages 1..5 — by key when the layout gives a digit, by physical position otherwise (AZERTY);
     * never shifted: Shift+digits belong to the zoom vocabulary above. No toast: the tree's
     * active-page marker and the artboards already say where you are. */
    var digit = /^[1-5]$/.test(k) ? parseInt(k, 10)
      : (/^Digit[1-5]$/.test(e.code || '') ? parseInt(e.code.slice(5), 10) : 0);
    if (digit && !e.altKey) {
      var pg = PAGES[digit - 1];
      if (pg) showPage(pg.id);
    }
  }

  function onKeyUp(e) {
    if (e.key === ' ') { spaceHeld = false; if (state.tool !== 'hand') stage.classList.remove('is-hand'); }
  }

  var TOOLS = ['select', 'hand', 'text', 'comment', 'frame', 'rect', 'ellipse', 'image'];
  function setTool(t) {
    if (TOOLS.indexOf(t) === -1) t = 'select';
    var prev = state.tool;
    state.tool = t;
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      var on = b.getAttribute('data-tool') === t;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    stage.classList.toggle('is-hand', t === 'hand');
    stage.classList.toggle('is-text', t === 'text');
    stage.classList.toggle('is-comment', t === 'comment');
    if (t !== 'select') clearHover();
    if (prev === 'text' && t !== 'text') clearHover();
    if (t === 'text' && prev !== 'text') hintOnce('tool-text', 'Texte : cliquez sur un texte de l’aperçu pour le modifier sur place. Échap pour revenir.', 20000);
    if (hooks.toolChanged) { try { hooks.toolChanged(t, prev); } catch (e) { /* module error */ } }
  }

  function applyDeviceFocusClasses() {
    var dev = state.deviceFocus;
    activePresets().forEach(function (p) {
      var ab = abEls[p.key];
      if (!ab) return;
      ab.classList.toggle('is-hidden', (dev === 'desktop' && p.device === 'phone') || (dev === 'phone' && p.device === 'desktop'));
    });
  }

  function setDeviceFocus(dev) {
    state.deviceFocus = dev;
    applyDeviceFocusClasses();
    document.querySelectorAll('.st-devices button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-dev') === dev);
    });
    fit();
  }

  function cycleDevice() {
    var order = ['both', 'phone', 'desktop'];
    var next = order[(order.indexOf(state.deviceFocus) + 1) % order.length];
    setDeviceFocus(next);
    toast(next === 'both' ? 'Les deux aperçus' : next === 'phone' ? 'Téléphone seul' : 'Ordinateur seul', 'info');
  }

  function toggleHelp() {
    var m = $('helpOverlay');
    if (m.hidden) { closeModals(); openModal(m); } else closeModal(m);
  }

  /* ------------------------------------------------------------------ top bar sync */

  function syncTopBar() {
    var input = $('ficheName');
    if (input && document.activeElement !== input) {
      input.value = (state.config.store && state.config.store.name) || '';
    }
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    stage = $('stage');
    world = $('world');
    ghostEl = $('dragGhost');
    saveStateEl = $('saveState');
    saveLabelEl = $('saveLabel');

    rebuildArtboards();
    buildHelp();
    buildInsertPanel();
    buildTree();
    buildInspector();
    syncTopBar();
    renderArtboards();

    /* viewport */
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onStagePointerDown);
    stage.addEventListener('pointermove', onStagePointerMove);
    stage.addEventListener('pointerup', onStagePointerUp);
    stage.addEventListener('pointercancel', onStagePointerUp);
    stage.addEventListener('pointerdown', onTouchDown);
    stage.addEventListener('pointermove', onTouchMove);
    stage.addEventListener('pointerup', onTouchUp);
    stage.addEventListener('pointercancel', onTouchUp);
    stage.addEventListener('click', onStageClickCapture, true);
    stage.addEventListener('dblclick', onStageDblClick, true);
    stage.addEventListener('contextmenu', onStageContextMenu);
    stage.addEventListener('pointerover', onStageOverCapture, true);
    stage.addEventListener('pointerleave', function () { if (!canvasDrag) clearHover(); });
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); });
    document.addEventListener('pointerdown', function (e) {
      if (ctxEl && !ctxEl.contains(e.target)) closeCtx();
    }, true);

    /* layers tree: roving focus — ↑/↓ move between rows, Enter or Space selects */
    $('layersPanel').addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('st-row')) return;
      var rows = Array.prototype.slice.call($('layersPanel').querySelectorAll('.st-row'));
      var i = rows.indexOf(t);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        var j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1);
        if (rows[j] && rows[j] !== t) { t.tabIndex = -1; rows[j].tabIndex = 0; rows[j].focus(); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        t.click();
      }
    });

    /* jst:navigate is wired per artboard root inside rebuildArtboards() */

    var chips = $('abChips');
    if (chips) chips.querySelectorAll('button[data-ab]').forEach(function (b) {
      b.addEventListener('click', function () { toggleArtboard(b.getAttribute('data-ab')); });
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', function () { /* keep the view; Ctrl+0 refits */ });

    /* top bar */
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tool');
        setTool(state.tool === t && t !== 'select' ? 'select' : t);
      });
    });
    document.querySelectorAll('[data-zoomstep]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-zoomstep') === 'in' ? 1.25 : 0.8;
        camera(function () { setZoom(state.zoom * f); });
      });
    });
    $('ficheName').addEventListener('input', function () {
      var v = $('ficheName').value;
      commit('Texte modifié (nom de la boutique)', function (c) { c.store = c.store || {}; c.store.name = v; }, { coalesce: 'store:name' });
    });
    document.querySelectorAll('.st-devices button').forEach(function (b) {
      b.addEventListener('click', function () { setDeviceFocus(b.getAttribute('data-dev')); });
    });
    var zoomBtn = $('zoomBtn'), zoomMenu = $('zoomMenu');
    zoomBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      zoomMenu.hidden = !zoomMenu.hidden;
      zoomBtn.setAttribute('aria-expanded', String(!zoomMenu.hidden));
    });
    document.addEventListener('click', function (e) {
      if (!zoomMenu.hidden && !e.target.closest('.st-zoomwrap')) zoomMenu.hidden = true;
    });
    zoomMenu.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var z = b.getAttribute('data-zoom');
        camera(function () {
          if (z === 'in') setZoom(state.zoom * 1.25);
          else if (z === 'out') setZoom(state.zoom / 1.25);
          else if (z === 'fit') fit();
          else if (z === 'sel') zoomToSelection();
          else if (z === '100') setZoom(1);
          else setZoom(parseFloat(z));
        });
        zoomMenu.hidden = true;
        zoomBtn.setAttribute('aria-expanded', 'false');
      });
    });
    $('shareBtn').addEventListener('click', function () { openShare(false); });
    $('publishBtn').addEventListener('click', function () { openShare(true); });
    $('helpBtn').addEventListener('click', toggleHelp);
    $('tabLayers').addEventListener('click', function () { switchLeftTab('layers'); });
    $('tabInsert').addEventListener('click', function () { switchLeftTab('insert'); });
    if ($('tabAssets')) $('tabAssets').addEventListener('click', function () { switchLeftTab('assets'); });
    $('importFile').addEventListener('change', function () {
      importJSONFile($('importFile').files && $('importFile').files[0]);
      $('importFile').value = '';
    });

    /* modals */
    document.querySelectorAll('.st-modal [data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(b.closest('.st-modal')); });
    });
    document.querySelectorAll('.st-modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) closeModal(m); });
    });
    $('proTry').addEventListener('click', function () {
      ui.proSeen = true;
      saveUI();
      closeModal($('proModal'));
      if (hooks.onboarding) { try { hooks.onboarding(); } catch (e) { /* module error */ } }
      else toast('Bienvenue dans le Studio. Appuyez sur ? pour les raccourcis.', 'ok');
    });
    if (!ui.proSeen) openModal($('proModal'));

    /* the opening view: both artboards in sight, like opening a Figma file */
    requestAnimationFrame(function () { requestAnimationFrame(fitWidthTop); });
    setSaveState('saved');
  }

  function switchLeftTab(tab) {
    var tabs = [['layers', 'tabLayers', 'layersPanel'], ['insert', 'tabInsert', 'insertPanel'], ['assets', 'tabAssets', 'assetsPanel']];
    tabs.forEach(function (t) {
      var btn = $(t[1]), panel = $(t[2]);
      if (!btn || !panel) return;
      var on = tab === t[0];
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', String(on));
      panel.hidden = !on;
    });
    hideTypePreview();
    if (tab === 'assets' && hooks.assetsShown) { try { hooks.assetsShown(); } catch (e) { /* module error */ } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ------------------------------------------------------------------ public (and testable) API */

  window.JeereStudio = {
    getConfig: function () { return clone(state.config); },
    getState: function () {
      return {
        page: state.page, pageId: state.pageId, productId: state.productId,
        sel: state.sel ? clone(state.sel) : null, tool: state.tool,
        zoom: state.zoom, panX: state.panX, panY: state.panY,
        deviceFocus: state.deviceFocus, undoDepth: undoStack.length, redoDepth: redoStack.length,
        artboards: ui.artboards.slice(), activeAb: primaryKey(), inlineEditing: !!inlineEdit
      };
    },
    select: function (sel) { select(sel || null); },
    showPage: showPage,
    undo: undo,
    redo: redo,
    fit: fit,
    setZoom: setZoom,
    save: saveNow,
    exportJSON: exportJSON,
    toggleArtboard: toggleArtboard,
    setTool: function (t) { setTool(t); },
    changeNiche: function (n) { changeNiche(n); },
    SHORTCUTS: SHORTCUTS
  };

  /* The bridge the extension modules build on (studio-power.js, loaded after this script).
   * Everything here is the studio's own machinery; the modules add their hooks into `hooks`. */
  window.JeereStudio._internals = {
    D: D, R: R, hooks: hooks,
    state: function () { return state; },
    ui: function () { return ui; },
    saveUI: saveUI,
    stage: function () { return stage; },
    world: function () { return world; },
    roots: function () { return roots; },
    abEls: function () { return abEls; },
    presets: DEVICE_PRESETS,
    activePresets: activePresets,
    visiblePresets: visiblePresets,
    primaryKey: primaryKey,
    toggleArtboard: toggleArtboard,
    PAGES: PAGES,
    SHORTCUTS: SHORTCUTS,
    clone: clone,
    esc: esc,
    ce: ce,
    clamp: clamp,
    cssEsc: cssEsc,
    toast: toast,
    commit: commit,
    pushEntry: pushEntry,
    afterChange: afterChange,
    undo: undo,
    redo: redo,
    select: select,
    selectAllSections: selectAllSections,
    toggleMulti: toggleMulti,
    isMulti: isMulti,
    selectedSectionIds: selectedSectionIds,
    sections: sections,
    products: products,
    customPages: customPages,
    sectionById: sectionById,
    productById: productById,
    pageById: pageById,
    sectionName: sectionName,
    sectionDef: sectionDef,
    defFields: defFields,
    hasField: hasField,
    newSectionSettings: newSectionSettings,
    insertSection: insertSection,
    duplicateSelection: duplicateSelection,
    deleteSelection: deleteSelection,
    copySelection: copySelection,
    pasteClipboard: pasteClipboard,
    moveSelection: moveSelection,
    toggleHideSelected: toggleHideSelected,
    isLocked: isLocked,
    showPage: showPage,
    setDeviceFocus: setDeviceFocus,
    cycleDevice: cycleDevice,
    setTool: setTool,
    fit: fit,
    setZoom: setZoom,
    zoomToSelection: zoomToSelection,
    applyTransform: applyTransform,
    openCtx: openCtx,
    closeCtx: closeCtx,
    openModal: openModal,
    closeModal: closeModal,
    closeModals: closeModals,
    anyModalOpen: anyModalOpen,
    registerOverlay: registerOverlay,
    openShare: openShare,
    toggleHelp: toggleHelp,
    buildTree: buildTree,
    buildInspector: buildInspector,
    buildInsertPanel: buildInsertPanel,
    buildHelp: buildHelp,
    switchLeftTab: switchLeftTab,
    applyDecor: applyDecor,
    scheduleRender: scheduleRender,
    renderArtboards: renderArtboards,
    saveNow: saveNow,
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    readFileAsImage: readFileAsImage,
    showTypePreview: showTypePreview,
    hideTypePreview: hideTypePreview,
    startInlineEdit: startInlineEdit,
    inlineSpecFor: inlineSpecFor,
    showGhost: showGhost,
    moveGhost: moveGhost,
    hideGhost: hideGhost,
    icon: icon,
    group: group,
    fieldWrap: fieldWrap,
    TYPE_GLYPHS: TYPE_GLYPHS,
    startInsertDrag: startInsertDrag,
    openSelectionMenu: openSelectionMenu,
    renameSelection: renameSelection,
    cutSelection: cutSelection,
    toggleLockSelected: toggleLockSelected,
    enterSelection: enterSelection,
    selectSibling: selectSibling,
    pickImageForSelection: pickImageForSelection,
    imageSlotForSelection: imageSlotForSelection,
    camera: camera,
    nicheList: nicheList,
    changeNiche: changeNiche,
    selectionTargets: selectionTargets,
    rectInFrame: rectInFrame,
    toggleChrome: toggleChrome,
    hintOnce: hintOnce,
    positionTags: positionTags,
    applyElStyles: applyElStyles,
    esElements: esElements,
    subElOf: subElOf,
    chromeEl: chromeEl,
    chromeName: chromeName,
    isSubSel: isSubSel,
    findFieldEl: findFieldEl,
    frameScale: frameScale,
    isDragging: function () { return !!(canvasDrag && canvasDrag.moved) || !!pan; },
    zoomRange: function () { return { min: ZOOM_MIN, max: ZOOM_MAX }; },
    isSpaceHeld: function () { return spaceHeld; },
    isInlineEditing: function () { return !!inlineEdit; }
  };
})();

/* Ctrl/⌘ + Alt + P: back to the simple editor on the same fiche (the shortcut that opens the Studio from it).
   The Studio saves the fiche as it goes; e.code, so it works on AZERTY too. */
(function () {
  'use strict';
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey || e.code !== 'KeyP') return;
    e.preventDefault();
    window.location.href = '../creer/';
  });
})();
