/* Jeere Studio — the door to « Mes sites » (sites/), for the founder only.
 *
 * Loaded by ../index.html (one script tag). Shows a « Mes sites » button in the top bar and a command
 * in the palette (Ctrl K) when, and only when:
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
  var href = 'sites/' + (demo() ? '?demo=1' : '');

  function show() {
    if (document.getElementById('sitesBtn')) return;
    var right = document.querySelector('.st-top__right');
    var before = document.getElementById('openSimple');
    if (right) {
      var a = document.createElement('a');
      a.id = 'sitesBtn';
      a.className = 'st-ghostbtn';
      a.href = href;
      a.textContent = 'Mes sites';
      a.setAttribute('data-tip', 'Mes sites web');
      a.setAttribute('data-sub', 'Modifier et publier les sites de kreeative');
      right.insertBefore(a, before || right.firstChild);
    }
    // the command palette (studio-power.js reads window.JeereStudioExtraCommands when it opens)
    var list = window.JeereStudioExtraCommands = window.JeereStudioExtraCommands || [];
    if (!list.__sites) {
      list.push(function (add) { add('sites:open', 'Mes sites', 'Mes sites — modifier et publier mes sites web', '', function () { location.href = href; }); });
      list.__sites = true;
    }
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
