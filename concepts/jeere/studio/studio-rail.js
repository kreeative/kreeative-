/* Jeere Studio — studio-rail.js: the rail on the far left, like Figma's.
 *
 *  - the Jeere logo at the top opens a small menu: « Tous mes sites » (only for the founder: the link
 *    sites/entry.js adds to the top bar is moved here), « Tableau de bord » (../admin/), « Éditeur
 *    simple » (../creer/#editeur, saved first like Ctrl Alt P), « Mon compte » (../compte/), and the
 *    « Thème : clair / sombre » switch;
 *  - under it, the tabs of the left panel (Calques / Insérer / Images: studio.js, railTab) — no
 *    behaviour of their own here;
 *  - at the bottom, the theme button. The theme itself is index.html's JeereStudioTheme (light by
 *    default, localStorage 'jeere-studio-theme'); this file only shows it and switches it.
 * Keyboard: the menu is a WAI-ARIA menu (Enter / Space / ↓ open it, ↑ ↓ Home End move, Escape closes
 * and gives the focus back to the logo, Tab leaves it). Nothing here touches the fiche. */
(function () {
  'use strict';

  var T = window.JeereStudioTheme;

  function $(id) { return document.getElementById(id); }
  function internals() { return (window.JeereStudio && window.JeereStudio._internals) || null; }
  function toast(msg, tone) { var S = internals(); if (S && S.toast) S.toast(msg, tone || 'info'); }

  /* ------------------------------------------------------------------ the theme */

  function showTheme() {
    var dark = !!T && T.get() === 'dark';
    var lbl = $('themeItemLabel');
    if (lbl) lbl.textContent = dark ? 'sombre' : 'clair';
    var item = $('themeItem');
    if (item) item.setAttribute('aria-label', 'Thème : ' + (dark ? 'sombre' : 'clair') + ' — passer au thème ' + (dark ? 'clair' : 'sombre'));
    var b = $('railTheme');
    if (b) {
      b.setAttribute('aria-pressed', String(dark));
      // the button says what it does next; its pressed state says the dark theme is on
      b.setAttribute('aria-label', 'Thème sombre');
      b.setAttribute('data-tip', dark ? 'Thème clair' : 'Thème sombre');
    }
  }
  function toggleTheme() {
    if (!T) return;
    var t = T.toggle();
    showTheme();
    toast(t === 'dark' ? 'Thème sombre.' : 'Thème clair.', 'info');
  }

  /* ------------------------------------------------------------------ the logo menu */

  var logo, menu;
  function items() {
    return Array.prototype.filter.call(menu.querySelectorAll('[role="menuitem"]'), function (el) { return !el.hidden && el.offsetParent !== null; });
  }
  function openMenu(focusLast) {
    if (!menu.hidden) return;
    menu.hidden = false;
    logo.setAttribute('aria-expanded', 'true');
    var list = items();
    var el = focusLast ? list[list.length - 1] : list[0];
    if (el) el.focus();
    document.addEventListener('pointerdown', outside, true);
  }
  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    logo.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) logo.focus();
  }
  function outside(e) {
    if (menu.contains(e.target) || logo.contains(e.target)) return;
    closeMenu(false);
  }
  function move(delta) {
    var list = items();
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    i = delta === 'first' ? 0 : delta === 'last' ? list.length - 1 : (i + delta + list.length) % list.length;
    list[i].focus();
  }

  /* « Mes sites » (sites/entry.js) lands in the top bar for the founder: it belongs to the logo menu */
  function adoptSites(a) {
    if (!a || a.parentNode === $('logoMenuSites')) return;
    var slot = $('logoMenuSites');
    if (!slot) return;
    a.className = 'st-logomenu__item';
    a.setAttribute('role', 'menuitem');
    a.removeAttribute('data-tip');
    a.removeAttribute('data-sub');
    a.innerHTML = (window.PHI ? window.PHI('squares-four', ' class="st-mi"') : '') + '<span>Tous mes sites</span>';
    slot.appendChild(a);
    slot.classList.add('has-sites');
  }
  function watchSites() {
    adoptSites($('sitesBtn'));
    var right = document.querySelector('.st-top__right');
    if (!right || typeof MutationObserver !== 'function') return;
    new MutationObserver(function () { adoptSites($('sitesBtn')); }).observe(right, { childList: true });
  }

  function init() {
    logo = $('railLogo');
    menu = $('logoMenu');
    if (!logo || !menu) return;
    watchSites();
    showTheme();

    logo.addEventListener('click', function () { if (menu.hidden) openMenu(false); else closeMenu(true); });
    logo.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); openMenu(false); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); openMenu(true); }
    });
    // the menu keeps its keys: the canvas shortcuts (arrows, Escape, letters) stay out of it
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { closeMenu(false); return; }
      e.stopPropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); move('first'); }
      else if (e.key === 'End') { e.preventDefault(); move('last'); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === ' ' && e.target.tagName === 'A') { e.preventDefault(); e.target.click(); }
    });
    // the simple editor: through studio.js (commits and saves first, like Ctrl Alt P)
    var simple = $('railSimple');
    if (simple) simple.addEventListener('click', function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // a new tab: the link as is
      var S = internals();
      if (S && S.goSimple) { e.preventDefault(); closeMenu(false); S.goSimple(); }
    });
    var item = $('themeItem');
    if (item) item.addEventListener('click', function () { toggleTheme(); closeMenu(true); });
    var rb = $('railTheme');
    if (rb) rb.addEventListener('click', toggleTheme);
    window.addEventListener('jeere-studio-theme', showTheme);

    // the command palette (studio-power.js reads window.JeereStudioExtraCommands when it opens)
    var list = window.JeereStudioExtraCommands = window.JeereStudioExtraCommands || [];
    if (!list.__theme) {
      list.push(function (add) {
        add('view:theme', 'Affichage', 'Thème : passer au ' + (T && T.get() === 'dark' ? 'clair' : 'sombre'), '', toggleTheme);
        add('nav:dashboard', 'Aller à', 'Tableau de bord', '', function () { location.href = '../admin/'; });
        add('nav:account', 'Aller à', 'Mon compte', '', function () { location.href = '../compte/'; });
      });
      list.__theme = true;
    }
  }

  window.JeereStudioRail = {
    open: function () { if (menu) openMenu(false); },
    close: function () { if (menu) closeMenu(false); },
    isOpen: function () { return !!menu && !menu.hidden; },
    toggleTheme: toggleTheme
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
