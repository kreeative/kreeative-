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

  var GLOBE = '<svg class="a-ico" aria-hidden="true" viewBox="0 0 24 24"><g style="opacity:calc(1 - var(--ic-b,0))"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="stroke-width:calc(var(--ic-sw,1.5)*1px)"><circle cx="12" cy="12" r="9"/><path d="M3.5 12h17"/><path d="M12 3c2.5 2.5 3.6 5.6 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.6-3.6-9S9.5 5.5 12 3Z"/></g></g><g style="opacity:var(--ic-b,0)"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.5 12a9.5 9.5 0 1 0 19.0 0a9.5 9.5 0 1 0 -19.0 0ZM12 4.2c-1.9 2.2-2.8 4.6-2.9 7.1h5.8c-.1-2.5-1-4.9-2.9-7.1ZM9.1 12.7c.1 2.5 1 4.9 2.9 7.1 1.9-2.2 2.8-4.6 2.9-7.1Z" fill="currentColor" stroke="none" fill-rule="evenodd"/></g></g></svg>';

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
