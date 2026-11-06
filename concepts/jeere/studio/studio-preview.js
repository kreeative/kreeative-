/*
 * Jeere Studio — studio-preview.js: the Preview mode (wave 2 of the Studio audit, item 11).
 * Loaded after studio.js. Builds on window.JeereStudio._internals; no library, French UI.
 *
 * « Aperçu » (the ▶ button of the top bar, or P) opens the store full-screen, as a customer sees it,
 * at the chosen width — Téléphone 390, Tablette 768, Ordinateur 1200, Large 1440, or the window's own —
 * and fully interactive: the menu, the pages, the product pages, the cart and the checkout work (render.js
 * handles them), with the element styles, the states (hover, pressed) and the detached sections. Nothing
 * can be edited there, and nothing in it changes the fiche. Échap or P closes it, back where she was.
 * Same breakpoints as the live store (JEERE_DATA.BREAKPOINTS): the phone layout under 768 px.
 *
 * Global: window.JeereStudioPreview = { open(width?), close(), isOpen() }.
 */
(function () {
  'use strict';

  var S0 = window.JeereStudio;
  var S = S0 && S0._internals;
  if (!S) return;
  var D = S.D, R = S.R;

  var WIDTHS = [
    { w: 390, label: 'Téléphone', short: '390' },
    { w: 768, label: 'Tablette', short: '768' },
    { w: 1200, label: 'Ordinateur', short: '1200' },
    { w: 1440, label: 'Large', short: '1440' },
    { w: 0, label: 'Fenêtre', short: 'Plein écran' }
  ];
  var KEY = 'jeere-studio-preview'; // sessionStorage: the last width chosen
  var ov = null, frame = null, root = null, width = 1200, lastFocus = null, info = null;

  function ce(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function layoutFor(w) { return D && typeof D.layoutForWidth === 'function' ? D.layoutForWidth(w) : (w >= 768 ? 'desktop' : 'phone'); }

  function build() {
    ov = ce('div', 'st-preview');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Aperçu de la boutique');
    ov.tabIndex = -1;
    var bar = ce('div', 'st-preview__bar');
    bar.appendChild(ce('span', 'st-preview__t', '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5v15l12-7.5z"/></svg>Aperçu'));
    var seg = ce('div', 'st-preview__seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Largeur de l’aperçu');
    WIDTHS.forEach(function (o) {
      var b = ce('button', 'st-preview__w', '<b>' + o.label + '</b><small>' + o.short + (o.w ? ' px' : '') + '</small>');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-w', String(o.w));
      b.addEventListener('click', function () { setWidth(o.w); });
      seg.appendChild(b);
    });
    bar.appendChild(seg);
    info = ce('span', 'st-preview__info');
    info.setAttribute('aria-live', 'polite');
    bar.appendChild(info);
    var close = ce('button', 'st-preview__close', 'Fermer <kbd>Échap</kbd>');
    close.type = 'button';
    close.setAttribute('data-preview-close', '');
    close.addEventListener('click', closePreview);
    bar.appendChild(close);
    ov.appendChild(bar);
    var stage = ce('div', 'st-preview__stage');
    frame = ce('div', 'st-preview__frame');
    frame.setAttribute('data-jst-cq', ''); // vw / vh = the chosen width (elstyles.js)
    root = ce('div');
    root.setAttribute('data-preview-root', '');
    frame.appendChild(root);
    stage.appendChild(frame);
    ov.appendChild(stage);
    // keys typed in the store (its fields) stay in the store: the Studio's shortcuts never see them
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePreview(); }
      e.stopPropagation();
    });
    window.addEventListener('resize', function () { if (isOpen()) fit(); });
    document.body.appendChild(ov);
  }

  function fit() {
    var avail = Math.max(320, (ov.clientWidth || window.innerWidth) - 32);
    var w = width || (ov.clientWidth || window.innerWidth);
    var k = width && w > avail ? avail / w : 1;
    frame.style.width = w + 'px';
    frame.style.zoom = k === 1 ? '' : String(Math.round(k * 1000) / 1000);
    frame.classList.toggle('is-full', !width);
    var dev = layoutFor(w);
    var bp = D && typeof D.bpForWidth === 'function' ? D.bpForWidth(w) : '';
    info.textContent = (width ? w + ' px' : 'Fenêtre, ' + w + ' px') + ' · ' + (dev === 'phone' ? 'mise en page téléphone' : (bp === 'tablet' ? 'mise en page ordinateur, réglages tablette' : 'mise en page ordinateur')) + (k !== 1 ? ' · affiché à ' + Math.round(k * 100) + ' %' : '');
    return dev;
  }

  function draw() {
    var st = S.state();
    var v = root.__jstView;
    var dev = fit();
    var opts = { device: dev, page: v ? v.page : (st.page || 'home'), productId: v ? v.productId : (st.productId || null), pageId: v ? v.pageId : (st.pageId || null) };
    try { R.render(S.state().config, root, opts); } catch (e) { root.textContent = 'L’aperçu n’a pas pu être affiché.'; }
  }

  function setWidth(w) {
    width = w;
    try { sessionStorage.setItem(KEY, String(w)); } catch (e) { /* private mode */ }
    Array.prototype.forEach.call(ov.querySelectorAll('.st-preview__w'), function (b) {
      var on = Number(b.getAttribute('data-w')) === w;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('is-on', on);
    });
    draw();
  }

  function isOpen() { return !!(ov && !ov.hidden && ov.parentNode); }
  function openPreview(w) {
    if (!ov) build();
    lastFocus = document.activeElement;
    try { if (S.hooks && typeof S.hooks.flushPending === 'function') S.hooks.flushPending(); } catch (e) { /* nothing pending */ }
    root.__jstView = null;
    root.__jstCart = {};
    ov.hidden = false;
    document.documentElement.classList.add('st-previewing');
    var saved = NaN;
    try { var raw = sessionStorage.getItem(KEY); saved = raw === null ? NaN : Number(raw); } catch (e) { saved = NaN; }
    var pk = S.primaryKey && S.primaryKey();
    var abW = (S.presets || []).filter(function (p) { return p.key === pk; }).map(function (p) { return p.width; })[0];
    setWidth(typeof w === 'number' ? w : (isFinite(saved) && WIDTHS.some(function (o) { return o.w === saved; }) ? saved : (abW >= 1200 ? 1200 : abW >= 768 ? 768 : 390)));
    btn && btn.setAttribute('aria-pressed', 'true');
    try { ov.querySelector('[data-preview-close]').focus(); } catch (e) { /* ignore */ }
    window.addEventListener('keydown', guard, true);
  }
  function closePreview() {
    if (!isOpen()) return;
    ov.hidden = true;
    document.documentElement.classList.remove('st-previewing');
    btn && btn.setAttribute('aria-pressed', 'false');
    window.removeEventListener('keydown', guard, true);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) { /* gone */ }
  }
  // While open: the Studio's shortcuts are off; Échap and P (outside a field) close the preview
  function guard(e) {
    if (!isOpen()) return;
    var t = e.target;
    var inField = t && t.closest && t.closest('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape' || (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'p' || e.key === 'P'))) {
      e.preventDefault(); e.stopImmediatePropagation(); closePreview(); return;
    }
    if (!ov.contains(t)) { e.stopImmediatePropagation(); }
  }

  function isTyping(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .st-inline');
  }
  // P anywhere in the Studio (not in a field, no modifier, no dialog open): open
  window.addEventListener('keydown', function (e) {
    if (isOpen() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key !== 'p' && e.key !== 'P') return;
    if (isTyping(e.target)) return;
    try { if (S.anyModalOpen && S.anyModalOpen()) return; } catch (er) { /* none */ }
    try { if (S.state().inlineEditing || document.querySelector('.st-inline[contenteditable]')) return; } catch (er) { /* none */ }
    e.preventDefault();
    openPreview();
  });

  // The ▶ « Aperçu » button, before « Partager » (made here, so the top bar's markup is unchanged)
  var btn = null;
  (function addButton() {
    var share = document.getElementById('shareBtn');
    if (!share || document.getElementById('previewBtn')) return;
    btn = ce('button', 'st-ghostbtn st-previewbtn', '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5v15l12-7.5z"/></svg><span>Aperçu</span>');
    btn.type = 'button';
    btn.id = 'previewBtn';
    btn.setAttribute('data-tip', 'Aperçu interactif');
    btn.setAttribute('data-kbd', 'P');
    btn.setAttribute('aria-keyshortcuts', 'P');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () { if (isOpen()) closePreview(); else openPreview(); });
    share.parentNode.insertBefore(btn, share);
  })();

  // In the command palette and the shortcuts list, when they read SHORTCUTS
  try {
    var g = Array.isArray(S.SHORTCUTS) ? S.SHORTCUTS.filter(function (x) { return Array.isArray(x) && Array.isArray(x[1]); })[0] : null;
    if (g) g[1].push([['P'], 'Aperçu interactif de la boutique, à la largeur choisie (Échap pour revenir)']);
  } catch (e) { /* read-only */ }

  window.JeereStudioPreview = { open: openPreview, close: closePreview, isOpen: isOpen, WIDTHS: WIDTHS };
})();
