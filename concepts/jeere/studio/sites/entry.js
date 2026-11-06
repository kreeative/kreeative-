/* Jeere Studio — the door to « Mes sites » (../mes-sites/: every site she has made, her websites and her
 * boutiques), for the founder only.
 *
 * Loaded by the boutique editor (studio/index.html) and by the dashboard (admin/index.html), one script tag.
 *   - In the Studio: a « Tous mes sites » link (#sitesBtn), that studio-rail.js moves into the logo menu
 *     (Tous mes sites / Tableau de bord / Mon compte, the same menu as in the website editor), and a
 *     command in the palette (Ctrl K).
 *   - In the dashboard: a « Mes sites » entry in the sidebar (group « Studio ») and in the « Plus » sheet.
 * Shown when, and only when:
 *   - a real Supabase session is open AND the `sites-publish` Edge Function says this account is on
 *     public.site_editors (asked once per tab, the answer kept in sessionStorage); or
 *   - demo mode on a local host (localhost / 127.0.0.1 / file:, with ?sites=demo or localStorage
 *     'jeere-sites-demo' = '1'), so the tests can open it without an account.
 * An ordinary seller never sees anything: no session → nothing is asked; a session that is not on the
 * list → the function answers « not an editor » and nothing is shown.
 */
(function () {
  'use strict';
  var KEY = 'jeere-sites-editor';
  var host = location.hostname;
  var local = location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  function demo() {
    if (!local) return false;
    if (/[?&]sites=demo\b/.test(location.search)) { try { localStorage.setItem('jeere-sites-demo', '1'); } catch (e) { /* ok */ } return true; }
    try { return localStorage.getItem('jeere-sites-demo') === '1'; } catch (e) { return false; }
  }
  // the home, next to this file's folder (studio/mes-sites/), whatever page loaded it
  var me = document.currentScript && document.currentScript.src;
  var base = me ? new URL('../mes-sites/', me).href : 'mes-sites/';
  var href = base + (demo() ? '?demo=1' : '');

  var GLOBE = '<svg class="a-ico" aria-hidden="true" viewBox="0 0 256 256"><g fill="currentColor" stroke="none"><path d="M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/></g></svg>';

  function showStudio() {
    if (document.getElementById('sitesBtn')) return;
    var right = document.querySelector('.st-top__right');
    if (right) {
      var a = document.createElement('a');
      a.id = 'sitesBtn';
      a.className = 'st-ghostbtn';
      a.href = href;
      a.textContent = 'Tous mes sites';
      a.setAttribute('data-tip', 'Tous mes sites');
      a.setAttribute('data-sub', 'Mes sites web et mes boutiques');
      right.insertBefore(a, right.firstChild);
    }
    // the command palette (studio-power.js reads window.JeereStudioExtraCommands when it opens)
    var list = window.JeereStudioExtraCommands = window.JeereStudioExtraCommands || [];
    if (!list.__sites) {
      list.push(function (add) { add('sites:open', 'Aller à', 'Tous mes sites — mes sites web et mes boutiques', '', function () { location.href = href; }); });
      list.__sites = true;
    }
  }
  function showDashboard() {
    if (document.getElementById('a-nav-sites')) return;
    var nav = document.querySelector('.a-side .a-nav');
    var groups = nav && nav.querySelectorAll('.a-nav__group');
    var before = groups && groups[groups.length - 1]; // « Réglages »: « Studio » comes just before it
    if (nav && before) {
      var p = document.createElement('p');
      p.className = 'a-nav__group';
      p.textContent = 'Studio';
      var ul = document.createElement('ul');
      ul.className = 'a-nav__list';
      ul.innerHTML = '<li><a class="a-nav__link" id="a-nav-sites" href="' + href + '">' + GLOBE + '<span>Mes sites</span></a></li>';
      nav.insertBefore(p, before);
      nav.insertBefore(ul, before);
    }
    var more = document.querySelector('.a-morelist');
    if (more && !document.getElementById('a-more-sites')) {
      var li = document.createElement('li');
      li.innerHTML = '<a id="a-more-sites" href="' + href + '">' + GLOBE + '<span>Mes sites</span></a>';
      more.insertBefore(li, more.lastElementChild);
    }
  }
  function show() {
    if (document.querySelector('.st-top__right')) showStudio();
    if (document.querySelector('.a-side')) showDashboard();
  }

  function check() {
    if (demo()) { show(); return; }
    var cached = null;
    try { cached = sessionStorage.getItem(KEY); } catch (e) { /* ok */ }
    if (cached === '1') { show(); return; }
    if (cached === '0') return;
    var A = window.JeereAuth;
    var key = (A && A.CONFIG && A.CONFIG.storageKey) || 'sb-aezchxfvzfoqlvzchqyk-auth-token';
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { /* ok */ }
    if (!raw || !A || !A.session) return; // no real session: nothing to ask
    A.session().then(function (s) {
      if (!s || !s.access_token) return null;
      return fetch(A.CONFIG.url + '/functions/v1/sites-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: A.CONFIG.key, Authorization: 'Bearer ' + s.access_token },
        body: JSON.stringify({ action: 'whoami' })
      }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j) return;
      try { sessionStorage.setItem(KEY, j.editor ? '1' : '0'); } catch (e) { /* ok */ }
      if (j.editor) show();
    }, function () { /* offline: try again on the next visit */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();
