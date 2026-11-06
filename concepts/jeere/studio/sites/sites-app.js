/* Jeere Studio › Mes sites — the founder's own websites, opened, edited visually and published.
 *
 *   Home      a grid of every site of kreeative/kreeative- (sites.json, built from git by
 *             build-manifest.mjs): thumbnail, title, live link, last change, unpublished edits.
 *   Editor    each page in artboard iframes (390 / 768 / 1440), same-origin with the static server
 *             (or srcdoc + <base> for a page that has unpublished edits, a new page, or a site that
 *             lives only on another branch). Click to select, breadcrumb, structure tree, inline
 *             text, images (upload or the site's own), links, styles (inline style attribute),
 *             hide / duplicate / delete, undo / redo, the selection's exact source, pages (+ a copy
 *             of one), SEO (title, description, og:image).
 *   Model     the SOURCE TEXT of the page is the truth (sites-core.js): every edit is a surgical
 *             change of a few bytes of it, mirrored on the live artboards; nothing is re-serialised.
 *             Unpublished edits are kept on this device (IndexedDB) until she publishes.
 *   Publish   sites-publish.js (the dialog, the Edge Function, the .zip).
 *
 * Who sees it: only the editors of public.site_editors, checked by the `sites-publish` Edge Function
 * (whoami). Demo mode — local hosts only, ?demo=1 or localStorage 'jeere-sites-demo' = '1' — opens
 * everything without an account so the tests run; it never exists on kreeative.xyz.
 *
 * Inline style rather than a studio-overrides.css: an edit is one attribute of the one element she
 * touched (no generated selector that breaks when the page changes, no <link> to add to every page,
 * beats the site's class rules without !important, readable in a diff). The cost: a style applies
 * at every width; per-breakpoint changes stay a job for the site's own stylesheet.
 */
(function () {
  'use strict';

  var C = window.JeereSitesCore;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  function ce(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
  var NB = ' ';

  /* ================================================================ environment */

  var HOST = location.hostname;
  var LOCAL = location.protocol === 'file:' || HOST === 'localhost' || HOST === '127.0.0.1' || HOST === '[::1]' || /\.local$/.test(HOST);
  function qs(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; }
  var DEMO = LOCAL && (qs('demo') === '1' || (function () { try { return localStorage.getItem('jeere-sites-demo') === '1'; } catch (e) { return false; } })());
  var AUTH_CFG = (window.JeereAuth && window.JeereAuth.CONFIG) || { url: 'https://aezchxfvzfoqlvzchqyk.supabase.co', key: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', storageKey: 'sb-aezchxfvzfoqlvzchqyk-auth-token' };
  var CFG = window.JeereSitesConfig = Object.assign({
    functionUrl: AUTH_CFG.url + '/functions/v1/sites-publish',
    apikey: AUTH_CFG.key,
    repo: 'kreeative/kreeative-',
    liveOrigin: 'kreeative.xyz',
    author: { name: 'Anne-Kelly Kouyate', email: 'annklyy@gmail.com' }
  }, window.JeereSitesConfig || {});
  // The repository root on this server: the Studio lives at <root>concepts/jeere/studio/sites/
  var ROOT = (function () {
    var p = location.pathname, k = p.indexOf('/concepts/jeere/');
    return k >= 0 ? location.origin + p.slice(0, k + 1) : null;
  })();

  if (C && C.setDecoder) {
    var dec = doc.createElement('textarea');
    C.setDecoder(function (s) { dec.innerHTML = s; return dec.value; });
  }

  /* ================================================================ small UI helpers */

  function toast(msg, tone, action) {
    var box = $('skToasts');
    var t = ce('div', 'sk-toast');
    t.setAttribute('data-tone', tone || 'info');
    t.appendChild(ce('span', null, esc(msg)));
    if (action) { var b = ce('button', null, esc(action.label)); b.type = 'button'; b.addEventListener('click', function () { action.run(); t.remove(); }); t.appendChild(b); }
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, action ? 7000 : 3600);
  }
  var tipTimer = null;
  doc.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    var tip = $('skTip');
    clearTimeout(tipTimer);
    if (!el || e.pointerType === 'touch') { tip.hidden = true; return; }
    tipTimer = setTimeout(function () {
      tip.innerHTML = esc(el.getAttribute('data-tip')) + (el.getAttribute('data-kbd') ? '<kbd>' + esc(el.getAttribute('data-kbd')) + '</kbd>' : '');
      tip.hidden = false;
      var r = el.getBoundingClientRect();
      var w = tip.offsetWidth;
      tip.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
      tip.style.top = (r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
    }, 420);
  });
  doc.addEventListener('pointerdown', function () { clearTimeout(tipTimer); $('skTip').hidden = true; }, true);

  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + NB + MONTHS[d.getMonth()] + NB + d.getFullYear();
  }
  function plural(n, one, many) { return n + NB + (n > 1 ? many : one); }

  function openModal(title, body, opts) {
    var m = $('skModal');
    $('skModalTitle').textContent = title;
    var b = $('skModalBody');
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    $('skModalCard').style.width = opts && opts.width ? opts.width : '';
    m.hidden = false;
    m._onClose = opts && opts.onClose;
    var f = b.querySelector('[autofocus], input, textarea, button.sk-primary');
    if (f) setTimeout(function () { f.focus(); }, 30);
    return b;
  }
  function closeModal() {
    var m = $('skModal');
    if (m.hidden) return;
    m.hidden = true;
    if (m._onClose) { var f = m._onClose; m._onClose = null; f(); }
  }
  $('skModal').addEventListener('click', function (e) { if (e.target === this || e.target.closest('[data-close]')) closeModal(); });

  /* ================================================================ IndexedDB: unpublished edits on this device */

  var DB = (function () {
    var p = null;
    function open() {
      if (p) return p;
      p = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('no idb')); return; }
        var r = indexedDB.open('jeere-sites', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('pending', { keyPath: 'key' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return p;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('pending', mode), st = t.objectStore('pending'), out;
          out = fn(st);
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
    var mem = new Map(); // fallback when IndexedDB is blocked (private mode)
    return {
      put: function (rec) { mem.set(rec.key, rec); return tx('readwrite', function (s) { s.put(rec); }).catch(function () { }); },
      del: function (key) { mem.delete(key); return tx('readwrite', function (s) { s.delete(key); }).catch(function () { }); },
      all: function () {
        return tx('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }, function () { return Array.from(mem.values()); });
      }
    };
  })();

  /* ================================================================ state */

  var M = null;              // the manifest
  var site = null;           // the open site
  var docs = new Map();      // path → page document (source text, tree, history)
  var uploads = new Map();   // repo path → { bytes, mime, url (blob:) }
  var cur = null;            // the open page document
  var frames = [];           // artboards of the open page
  var sel = null;            // { el, frame } — a live element of one artboard
  var hover = null;          // { el, frame }
  var editing = null;        // inline text editing: { el, frame, src, before: Map(frame → html) }
  var mode = 'edit';         // 'edit' | 'nav'
  var zoom = null;           // null = fit
  var tab = 'content';
  var treeOpen = new Set();  // source keys (start offsets are not stable: tag paths) of expanded rows
  var who = null;            // { email, github } from whoami
  var WIDTHS = [
    { w: 390, h: 844, name: 'Téléphone' },
    { w: 768, h: 1024, name: 'Tablette' },
    { w: 1440, h: 900, name: 'Ordinateur' }
  ];
  var shown = (function () {
    try { var v = JSON.parse(localStorage.getItem('jeere-sites-widths')); if (Array.isArray(v) && v.length) return v; } catch (e) { /* default */ }
    return [390, 1440];
  })();

  function setView(v) { $('sk').setAttribute('data-view', v); $('skHome').hidden = v !== 'home'; $('skEditor').hidden = v !== 'edit'; $('skGate').hidden = v !== 'gate'; }

  /* ================================================================ access */

  function sessionToken() {
    var A = window.JeereAuth;
    var fromStore = function () {
      try {
        var o = JSON.parse(localStorage.getItem(AUTH_CFG.storageKey) || 'null');
        var t = o && (o.access_token || (o.currentSession && o.currentSession.access_token));
        return t || null;
      } catch (e) { return null; }
    };
    if (A && A.session) return A.session().then(function (s) { return (s && s.access_token) || fromStore(); }, fromStore);
    return Promise.resolve(fromStore());
  }
  function callFn(body, token) {
    var h = { 'Content-Type': 'application/json', apikey: CFG.apikey };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch(CFG.functionUrl, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.httpStatus = r.status; return j; });
    });
  }
  function gate(title, text, actions) {
    setView('gate');
    $('skGateTitle').textContent = title;
    $('skGateText').innerHTML = text;
    var a = $('skGateActions');
    a.innerHTML = '';
    (actions || []).forEach(function (x) { a.appendChild(x); });
  }
  function link(cls, href, label) { var a = ce('a', cls + ' sk-btnlink', esc(label)); a.href = href; return a; }
  function checkAccess() {
    if (DEMO) { who = { email: 'démo', github: false, demo: true }; return Promise.resolve(true); }
    return sessionToken().then(function (tok) {
      if (!tok) {
        gate('Mes sites', 'Connectez-vous avec votre compte Jeere (celui de la fondatrice) pour ouvrir vos sites.', [
          link('sk-primary', '../../compte/?suite=studio#connexion', 'Me connecter'), link('sk-ghost', '../', 'Retour au Studio')
        ]);
        return false;
      }
      return callFn({ action: 'whoami' }, tok).then(function (r) {
        if (r && r.editor) {
          who = { email: r.email, github: !!r.github };
          try { sessionStorage.setItem('jeere-sites-editor', '1'); } catch (e) { /* ok */ }
          return true;
        }
        try { sessionStorage.setItem('jeere-sites-editor', '0'); } catch (e) { /* ok */ }
        gate('Accès réservé', '« Mes sites » est l’espace de la fondatrice de Jeere pour ses propres sites web. Il n’est pas ouvert sur ce compte.', [link('sk-primary', '../', 'Retour au Studio')]);
        return false;
      }, function () {
        gate('Connexion impossible', 'Le serveur de Jeere ne répond pas : vérifiez la connexion, puis réessayez.', [link('sk-primary', location.href, 'Réessayer')]);
        return false;
      });
    });
  }

  /* ================================================================ boot and routing */

  function boot() {
    if (!C) return;
    setView('loading');
    var mf = fetch('sites.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    Promise.all([mf, checkAccess()]).then(function (res) {
      M = res[0];
      if (!res[1]) return;
      $('skWho').hidden = false;
      $('skWho').textContent = DEMO ? 'Mode démo' : who.email;
      route();
      window.addEventListener('hashchange', route);
    }, function () {
      gate('Mes sites', 'La liste des sites (sites.json) n’a pas pu être lue.', []);
    });
  }
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    var m = /^site\/([^/]+)(?:\/(.*))?$/.exec(h);
    if (m) {
      var s = M.sites.find(function (x) { return x.id === m[1]; });
      if (s) { openSite(s, m[2] || null); return; }
    }
    showHome();
  }

  /* ================================================================ home */

  var filter = 'all', query = '';
  var pendingBySite = new Map();
  function showHome() {
    leaveEditor();
    setView('home');
    $('skCrumbs').innerHTML = '<span>Mes sites</span>';
    DB.all().then(function (recs) {
      pendingBySite = new Map();
      recs.forEach(function (r) { if (r.kind === 'page') pendingBySite.set(r.siteId, (pendingBySite.get(r.siteId) || 0) + 1); });
      renderGrid();
    });
    renderGrid();
  }
  function siteMatches(s) {
    if (filter !== 'all' && s.kind !== filter && !(filter === 'client' && s.kind === 'personal')) return false;
    if (!query) return true;
    var q = query.toLowerCase();
    return (s.title + ' ' + s.path + ' ' + s.kindLabel).toLowerCase().indexOf(q) >= 0;
  }
  function pageLiveUrl(s, p) {
    var u = p.path.replace(/(^|\/)index\.html$/, '$1');
    if (s.branch === M.defaultBranch) return 'https://' + CFG.liveOrigin + '/' + u;
    return s.previewBase ? s.previewBase + u : null;
  }
  function renderGrid() {
    if (!M) return;
    var g = $('skGrid');
    g.innerHTML = '';
    var list = M.sites.filter(siteMatches);
    list.forEach(function (s) {
      var card = ce('div', 'sk-card');
      card.setAttribute('role', 'listitem');
      card.tabIndex = 0;
      card.setAttribute('data-site', s.id);
      card.setAttribute('aria-label', 'Ouvrir ' + s.title);
      var pend = pendingBySite.get(s.id) || 0;
      var badges = '';
      if (pend) badges += '<span class="sk-badge sk-badge--warn">' + plural(pend, 'page modifiée', 'pages modifiées') + '</span>';
      if (s.onlyOnBranch) badges += '<span class="sk-badge sk-badge--info" title="' + esc(s.branch) + '">Branche ' + esc(s.branch.replace(/^claude\//, '').replace(/-[a-z0-9]{6}$/, '')) + '</span>';
      card.innerHTML =
        '<div class="sk-card__shot"><img loading="lazy" alt="" src="' + esc(s.thumbnail) + '" onerror="var p=this.parentNode;this.remove();p.classList.add(\'sk-card__shot--none\');p.insertAdjacentText(\'afterbegin\',\'Pas encore d’aperçu\')">' +
        '<div class="sk-card__badges">' + badges + '</div></div>' +
        '<div class="sk-card__body">' +
        '<div class="sk-card__title">' + esc(s.title) + '</div>' +
        '<div class="sk-card__meta"><span>' + esc(s.kindLabel) + '</span><span>' + plural(s.pages.length, 'page', 'pages') + '</span>' +
        (s.updated && s.updated.date ? '<span>Modifié le ' + esc(fmtDate(s.updated.date)) + '</span>' : '') + '</div>' +
        '<div class="sk-card__links">' +
        (s.liveUrl ? '<a href="' + esc(s.liveUrl) + '" target="_blank" rel="noopener" data-live>Voir en ligne ↗</a>' : '<span class="sk-note">Pas encore en ligne</span>') +
        (s.externalUrl && s.externalUrl !== s.liveUrl ? '<a href="' + esc(s.externalUrl) + '" target="_blank" rel="noopener" title="Le site déployé à part (son propre projet)">Site du client ↗</a>' : '') +
        '</div></div>';
      card.addEventListener('click', function (e) { if (e.target.closest('a')) return; location.hash = '#/site/' + s.id; });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = '#/site/' + s.id; } });
      g.appendChild(card);
    });
    $('skHomeFoot').textContent = list.length + ' sur ' + M.sites.length + ' sites · liste du ' + fmtDate(M.generated) + ' · dépôt ' + M.repo + ' (branche principale ' + M.defaultBranch + ')';
  }
  $('skFilter').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]');
    if (!b) return;
    filter = b.getAttribute('data-f');
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    renderGrid();
  });
  $('skSearch').addEventListener('input', function () { query = this.value.trim(); renderGrid(); });

  /* ================================================================ opening a site and its pages */

  function pageByPath(p) { return site && site.pages.find(function (x) { return x.path === p; }); }
  function docKey(s, p) { return s.id + '|' + p; }

  function openSite(s, pagePath) {
    var same = site && site.id === s.id;
    if (!same) {
      leaveEditor();
      site = JSON.parse(JSON.stringify(s));
      docs = new Map();
      uploads.forEach(function (u) { try { URL.revokeObjectURL(u.url); } catch (e) { /* ok */ } });
      uploads = new Map();
    }
    setView('edit');
    var load = same ? Promise.resolve() : DB.all().then(function (recs) {
      recs.filter(function (r) { return r.siteId === site.id; }).forEach(function (r) {
        if (r.kind === 'page') {
          if (r.isNew && !pageByPath(r.path)) site.pages.push({ path: r.path, title: r.title || r.path, url: '', sha: null, isNew: true, local: false, from: r.from });
          docs.set(r.path, { path: r.path, original: r.original, text: r.text, baseSha: r.baseSha, isNew: !!r.isNew, from: r.from, undo: [], redo: [], restored: true });
        } else if (r.kind === 'image') {
          var blob = new Blob([r.bytes], { type: r.mime });
          uploads.set(r.path, { bytes: new Uint8Array(r.bytes), mime: r.mime, url: URL.createObjectURL(blob) });
        }
      });
    });
    load.then(function () {
      renderPages();
      var p = pagePath && pageByPath(pagePath) ? pagePath : (site.pages.find(function (x) { return /(^|\/)index\.html$/.test(x.path) && x.path.split('/').length === (site.path ? site.path.split('/').length + 1 : 1); }) || site.pages[0]).path;
      openPage(p);
    });
  }
  function leaveEditor() {
    endEdit(true);
    sel = null; hover = null;
    frames.forEach(function (f) { f.el.remove(); });
    frames = [];
    cur = null;
  }

  function sourceUrl(p) {
    if (site.onlyOnBranch || !ROOT || !p.local) {
      return 'https://raw.githubusercontent.com/' + M.repo + '/' + (site.headSha || 'refs/heads/' + site.branch) + '/' + p.path;
    }
    return ROOT + p.path;
  }
  function assetBase(p) { // where the page's relative URLs resolve
    if (!site.onlyOnBranch && ROOT && (p.local || p.isNew)) return ROOT + C.dirOf(p.from || p.path);
    if (site.previewBase) return site.previewBase + C.dirOf(p.from || p.path);
    // not served here (the jeere.kreeative.xyz host, or a branch without a preview): the live site's own files
    return 'https://' + CFG.liveOrigin + '/' + C.dirOf(p.from || p.path);
  }
  function readText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); } catch (e) { return null; }
  }
  function loadDoc(p) {
    var d = docs.get(p.path);
    if (d && d.tree) return Promise.resolve(d);
    if (d && d.text != null) { d.tree = C.parse(d.text); return Promise.resolve(d); }
    return fetch(sourceUrl(p), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var text = readText(buf);
      if (text == null) throw new Error('not utf-8');
      return C.gitBlobSha(new Uint8Array(buf)).then(function (sha) {
        var nd = { path: p.path, original: text, text: text, baseSha: sha, isNew: false, undo: [], redo: [], stale: !!(p.sha && sha !== p.sha) };
        nd.tree = C.parse(text);
        docs.set(p.path, nd);
        return nd;
      });
    });
  }

  function renderCrumbs() {
    var c = $('skCrumbs');
    c.innerHTML = '';
    var h = ce('a', 'sk-crumbs__home', 'Mes sites'); h.href = '#/'; c.appendChild(h);
    c.appendChild(ce('i', null, '›'));
    var s = ce('span', null, esc(site.title)); c.appendChild(s);
  }
  function renderPages() {
    renderCrumbs();
    var box = $('skPages');
    box.innerHTML = '';
    site.pages.forEach(function (p) {
      var b = ce('button', 'sk-page');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('data-path', p.path);
      b.setAttribute('aria-selected', String(!!cur && cur.path === p.path));
      var d = docs.get(p.path);
      var dirty = d && (d.isNew || d.text !== d.original);
      var rel = site.path ? p.path.slice(site.path.length + 1) : p.path;
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h4.8l2.2 2.2v8.8h-7z"/><path d="M9 2.5v2.5h2.5"/></svg>' +
        '<span class="sk-page__t"><b>' + esc(shortTitle(p.title) || rel) + '</b><small>' + esc(rel) + (p.isNew ? ' · nouvelle' : '') + '</small></span>' +
        (dirty ? '<span class="sk-page__dot" title="Modifications non publiées"></span>' : '');
      b.addEventListener('click', function () { location.hash = '#/site/' + site.id + '/' + p.path; closeDrawers(); });
      box.appendChild(b);
    });
  }
  function shortTitle(t) { return String(t || '').replace(/\s+[—|·-]\s+(Kreeative|kreeative)\s*$/, '').trim(); }

  function openPage(path) {
    var p = pageByPath(path);
    if (!p) return;
    endEdit(false);
    sel = null; hover = null;
    var label = $('skBanner');
    label.hidden = true;
    loadDoc(p).then(function (d) {
      cur = d;
      cur.page = p;
      renderPages();
      buildFrames();
      refreshAll();
      if (d.stale) banner('Cette copie de la page diffère de la version de la branche ' + site.branch + ' enregistrée dans la liste : la publication vérifiera qu’elle n’a pas changé entre-temps.', 'warn');
      else if (site.onlyOnBranch) banner('Ce site n’existe que sur la branche ' + site.branch + ' : il s’affiche depuis GitHub, et la publication va sur cette branche.', 'info');
    }, function (e) {
      banner('La page « ' + path + ' » n’a pas pu être lue (' + (e && e.message) + ').', 'warn');
    });
  }
  function banner(text, tone) {
    var b = $('skBanner');
    b.className = 'sk-banner' + (tone === 'warn' ? ' sk-banner--warn' : '');
    b.innerHTML = '<span>' + esc(text) + '</span><button class="sk-linkbtn" type="button">OK</button>';
    b.hidden = false;
    b.querySelector('button').onclick = function () { b.hidden = true; };
  }

  /* ================================================================ artboards */

  function buildFrames() {
    frames.forEach(function (f) { f.el.remove(); });
    frames = [];
    var world = $('skWorld');
    WIDTHS.filter(function (w) { return shown.indexOf(w.w) >= 0; }).forEach(function (w) {
      var ab = ce('div', 'sk-ab is-loading');
      ab.setAttribute('data-w', w.w);
      ab.innerHTML = '<div class="sk-ab__label"><b>' + w.name + '</b><span>' + w.w + NB + 'px</span></div>' +
        '<div class="sk-ab__frame" style="width:' + w.w + 'px;height:' + w.h + 'px"><iframe title="Aperçu ' + w.name + '" width="' + w.w + '" height="' + w.h + '" style="width:' + w.w + 'px;height:' + w.h + 'px"></iframe><div class="sk-ov"><div class="sk-box sk-box--hover" hidden></div><div class="sk-box sk-box--sel" hidden><span class="sk-box__tag"></span></div></div></div>';
      world.appendChild(ab);
      var f = { key: String(w.w), w: w.w, h: w.h, el: ab, iframe: ab.querySelector('iframe'), ov: ab.querySelector('.sk-ov'), hbox: ab.querySelector('.sk-box--hover'), sbox: ab.querySelector('.sk-box--sel'), map: null, ready: false };
      frames.push(f);
      f.iframe.addEventListener('load', function () { frameLoaded(f); });
      loadFrame(f);
    });
    $('skWidths').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(shown.indexOf(+b.getAttribute('data-w')) >= 0)); });
    layout();
  }
  function withBase(text, base, extra) {
    var tag = '<base href="' + C.escAttr(base, '"') + '" data-sk-inject>' + (extra || '');
    var t = C.parse(text);
    var head = C.find(t, function (e) { return e.tag === 'head'; });
    if (head) return text.slice(0, head.openEnd) + tag + text.slice(head.openEnd);
    var html = C.find(t, function (e) { return e.tag === 'html'; });
    if (html) return text.slice(0, html.openEnd) + tag + text.slice(html.openEnd);
    return tag + text;
  }
  function loadFrame(f) {
    f.ready = false;
    f.el.classList.add('is-loading');
    var d = cur, p = d.page;
    var ifr = f.iframe;
    if (d.noScripts) ifr.setAttribute('sandbox', 'allow-same-origin'); else ifr.removeAttribute('sandbox');
    var direct = !d.noScripts && !d.isNew && d.text === d.original && !site.onlyOnBranch && ROOT && p.local;
    f.direct = direct;
    if (direct) { ifr.removeAttribute('srcdoc'); f.expect = ROOT + p.path; ifr.src = ROOT + p.path; }
    else { ifr.removeAttribute('src'); f.expect = null; ifr.srcdoc = withBase(d.text, assetBase(p)); }
  }
  function frameLoaded(f) {
    var w, fd;
    try { w = f.iframe.contentWindow; fd = f.iframe.contentDocument; } catch (e) { w = null; }
    if (!w || !fd || !cur) return;
    // a page that sends the visitor elsewhere (a log-in wall…): shown without its scripts instead
    if (f.direct) {
      var here = w.location.href.replace(/[?#].*$/, ''), want = f.expect.replace(/index\.html$/, '');
      if (here.replace(/index\.html$/, '') !== want) {
        cur.noScripts = true;
        banner('Cette page s’est redirigée ailleurs dès son ouverture : elle s’affiche ici sans ses scripts, pour pouvoir la modifier.', 'warn');
        frames.forEach(loadFrame);
        return;
      }
    }
    f.win = w; f.doc = fd;
    f.map = C.align(cur.tree, fd);
    patchUploadsLive(f);
    installFrame(f);
    f.ready = true;
    f.el.classList.remove('is-loading');
    if (sel && sel.frame === f) sel = null;
    paintBoxes();
    if (frames.every(function (x) { return x.ready; })) { refreshTree(); refreshPanel(); }
  }
  function patchUploadsLive(f) {
    if (!uploads.size || !f.doc) return;
    f.doc.querySelectorAll('img[src], source[srcset]').forEach(function (el) {
      var raw = el.getAttribute('src') || el.getAttribute('srcset');
      var rp = C.repoPathOf(cur.path, raw, null);
      var u = rp && uploads.get(rp);
      if (u) { if (el.hasAttribute('src')) el.src = u.url; else el.srcset = u.url; }
    });
  }

  function layout() {
    var stage = $('skStage'), world = $('skWorld'), sizer = $('skSizer');
    if (!frames.length) return;
    // the world's size from the artboards themselves (scaled labels and boxes must not feed back into it)
    var cs = getComputedStyle(world), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var gap = parseFloat(cs.columnGap) || 48;
    var ww = padX + frames.reduce(function (n, f) { return n + f.w; }, 0) + gap * (frames.length - 1);
    var wh = padY + 24 + Math.max.apply(null, frames.map(function (f) { return f.h; }));
    var z = zoom;
    if (z == null) z = clamp(Math.min((stage.clientWidth - 16) / ww, (stage.clientHeight - 16) / wh), 0.1, 1);
    world.style.transform = 'scale(' + z + ')';
    world.style.setProperty('--inv', String(1 / z));
    sizer.style.width = Math.ceil(ww * z) + 'px';
    sizer.style.height = Math.ceil(wh * z) + 'px';
    world._z = z;
    $('skZoom').textContent = Math.round(z * 100) + NB + '%';
    paintBoxes();
  }
  window.addEventListener('resize', function () { if (cur) layout(); });
  $('skWidths').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-w]');
    if (!b) return;
    var w = +b.getAttribute('data-w'), k = shown.indexOf(w);
    if (k >= 0) { if (shown.length === 1) { toast('Gardez au moins un aperçu.', 'info'); return; } shown.splice(k, 1); }
    else shown.push(w);
    shown.sort(function (a, b2) { return a - b2; });
    try { localStorage.setItem('jeere-sites-widths', JSON.stringify(shown)); } catch (er) { /* ok */ }
    endEdit(false);
    sel = null; hover = null;
    buildFrames();
    refreshPanel();
  });
  doc.querySelector('.sk-zoom').addEventListener('click', function (e) {
    var b = e.target.closest('[data-zoom]');
    if (!b) return;
    var z = $('skWorld')._z || 1, a = b.getAttribute('data-zoom');
    var steps = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
    if (a === 'fit') zoom = zoom == null ? 1 : null;
    else if (a === 'in') zoom = steps.find(function (s) { return s > z + 0.001; }) || 2;
    else zoom = steps.slice().reverse().find(function (s) { return s < z - 0.001; }) || 0.1;
    layout();
  });

  /* ---------------------------------------------------------------- events inside an artboard */

  function pickable(f, t) {
    var el = t && t.nodeType === 3 ? t.parentElement : t;
    if (!el || el.nodeType !== 1) return null;
    if (el === f.doc.documentElement) el = f.doc.body;
    var svg = el.closest && el.closest('svg');
    if (svg && svg !== el && !svg.parentElement.closest('svg')) el = svg;
    return el;
  }
  function installFrame(f) {
    var w = f.win;
    var block = function (e) {
      if (mode !== 'edit') return;
      if (editing && editing.frame === f && editing.el.contains(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    ['click', 'auxclick', 'mouseup', 'submit', 'contextmenu', 'touchend'].forEach(function (t) { w.addEventListener(t, block, true); });
    w.addEventListener('mousedown', function (e) {
      if (mode !== 'edit') return;
      if (editing && editing.frame === f && editing.el.contains(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    w.addEventListener('pointerdown', function (e) {
      if (mode !== 'edit') return;
      if (editing && editing.frame === f && editing.el.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (editing) endEdit(false);
      var el = pickable(f, e.target);
      if (el) select(el, f);
    }, true);
    w.addEventListener('dblclick', function (e) {
      if (mode !== 'edit') return;
      e.preventDefault(); e.stopImmediatePropagation();
      var el = pickable(f, e.target);
      if (el) { select(el, f); startEdit(el, f, e.clientX, e.clientY); }
    }, true);
    w.addEventListener('pointermove', function (e) {
      if (mode !== 'edit' || e.pointerType === 'touch') return;
      var el = pickable(f, e.target);
      hover = el ? { el: el, frame: f } : null;
      paintBoxes();
    }, true);
    f.doc.addEventListener('pointerleave', function () { hover = null; paintBoxes(); });
    w.addEventListener('scroll', function () { paintBoxes(); }, true);
    w.addEventListener('keydown', function (e) { onKey(e, f); }, true);
    w.addEventListener('resize', paintBoxes);
  }

  /* ---------------------------------------------------------------- selection boxes */

  function counterpart(f, src) { return f.map && src ? f.map.s2l.get(src) || null : null; }
  function srcOf(s) { s = s || sel; return s && s.frame && s.frame.map ? s.frame.map.l2s.get(s.el) || null : null; }
  function describe(el) {
    if (!el) return '';
    var n = String(el.localName);
    var id = el.getAttribute('id');
    var cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    return n + (id ? '#' + id : cls ? '.' + cls : '');
  }
  function placeBox(box, f, el) {
    if (!el || !el.isConnected || !f.ready) { box.hidden = true; return; }
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.hidden = true; return; }
    box.hidden = false;
    box.style.transform = 'translate(' + Math.round(r.left) + 'px,' + Math.round(r.top) + 'px)';
    box.style.width = Math.round(r.width) + 'px';
    box.style.height = Math.round(r.height) + 'px';
    var tag = box.querySelector('.sk-box__tag');
    if (tag) { tag.classList.toggle('sk-box__tag--below', r.top < 28); }
  }
  var paintQueued = false;
  function paintBoxes() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(function () {
      paintQueued = false;
      var src = srcOf();
      frames.forEach(function (f) {
        var h = hover && hover.frame === f ? hover.el : (hover ? counterpart(f, srcOf(hover)) : null);
        if (sel && h && (h === sel.el || h === counterpart(f, src))) h = null;
        placeBox(f.hbox, f, h);
        var s = sel ? (sel.frame === f ? sel.el : counterpart(f, src)) : null;
        placeBox(f.sbox, f, s);
        f.sbox.classList.toggle('sk-box--editing', !!editing && editing.frame === f);
        var tag = f.sbox.querySelector('.sk-box__tag');
        if (tag && s) tag.textContent = describe(s);
      });
      placeSelbar();
    });
  }
  setInterval(function () { if (sel && cur && mode === 'edit' && doc.visibilityState === 'visible') paintBoxes(); }, 250); // pages that animate

  function select(el, f, keepTab) {
    if (editing && editing.el !== el) endEdit(false);
    sel = el ? { el: el, frame: f } : null;
    var src = srcOf();
    if (sel) {
      frames.forEach(function (o) {
        if (o === f) return;
        var c = counterpart(o, src);
        if (c && o.win) { try { var r = c.getBoundingClientRect(); if (r.top < 0 || r.bottom > o.h) c.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* ok */ } }
      });
      if (!keepTab && tab === 'code') { /* keep */ }
      if (innerWidth < 900) $('sk').classList.add('is-right-open');
    }
    paintBoxes();
    refreshPanel(true);
    refreshTree(true);
  }

  /* ---------------------------------------------------------------- the floating actions of the selection */

  var ICON = {
    text: '<svg viewBox="0 0 16 16"><path d="M3.5 4.5v-1h9v1M8 3.5v9M6 12.5h4"/></svg>',
    img: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M3 11.5l3-3 2.5 2 1.8-1.6 2.7 2.4"/></svg>',
    link: '<svg viewBox="0 0 16 16"><path d="M7 9a2.6 2.6 0 003.7 0l2-2A2.6 2.6 0 009 3.3l-.8.8M9 7a2.6 2.6 0 00-3.7 0l-2 2A2.6 2.6 0 007 12.7l.8-.8"/></svg>',
    dup: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3.5 10.5h-.5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5h7a.5.5 0 01.5.5v.5"/></svg>',
    hide: '<svg viewBox="0 0 16 16"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/></svg>',
    del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
    up: '<svg viewBox="0 0 16 16"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg>'
  };
  function placeSelbar() {
    var bar = $('skSelbar');
    var src = srcOf();
    if (!sel || !src || editing || mode !== 'edit') { bar.hidden = true; return; }
    var f = sel.frame;
    var r = sel.el.getBoundingClientRect();
    var z = $('skWorld')._z || 1;
    var fr = f.iframe.getBoundingClientRect(), st = $('skStage').getBoundingClientRect();
    var x = fr.left - st.left + r.left * z, y = fr.top - st.top + r.top * z;
    if (!bar._for || bar._for !== sel.el) { buildSelbar(src); bar._for = sel.el; }
    bar.hidden = false;
    var bw = bar.offsetWidth, bh = bar.offsetHeight;
    var top = y - bh - 8;
    if (top < 8) top = y + Math.min(r.height * z, st.height - 120) + 8;
    bar.style.left = clamp(x, 8, st.width - bw - 8) + 'px';
    bar.style.top = clamp(top, 8, st.height - bh - 64) + 'px';
  }
  function buildSelbar(src) {
    var bar = $('skSelbar');
    bar.innerHTML = '';
    function btn(ic, label, run, tip) {
      var b = ce('button', null, ICON[ic] + '<span>' + esc(label) + '</span>');
      b.type = 'button';
      if (tip) b.setAttribute('data-tip', tip);
      b.addEventListener('click', function (e) { e.stopPropagation(); run(); });
      bar.appendChild(b);
    }
    var el = sel.el;
    if (src.parent && src.parent.type === 'el' && src.parent.tag !== 'html') btn('up', 'Parent', function () { selectParent(); }, 'Échap');
    if (isTextual(src)) btn('text', 'Texte', function () { startEdit(sel.el, sel.frame); }, 'Double-clic ou Entrée');
    if (imgOf(el)) btn('img', 'Image', function () { setTab('content'); $('skFile').click(); });
    bar.appendChild(ce('span', 'sk-selbar__sep'));
    btn('dup', 'Dupliquer', function () { opDuplicate(); }, 'Ctrl D');
    btn('hide', isHidden(src) ? 'Afficher' : 'Masquer', function () { opHide(); }, 'Ctrl ⇧ H');
    btn('del', 'Supprimer', function () { opDelete(); }, 'Suppr');
  }

  /* ================================================================ history */

  function setText(d, text) {
    d.text = text;
    d.tree = C.parse(text);
    frames.forEach(function (f) { if (f.doc && d === cur) f.map = C.align(d.tree, f.doc); });
  }
  // One change: the new source text and its mirror on the artboards (apply now and on redo, revert on undo).
  function commit(label, newText, apply, revert, opts) {
    var d = cur;
    if (!d) return false;
    if (newText === d.text && !(opts && opts.force)) return false;
    var before = d.text;
    var last = d.undo[d.undo.length - 1];
    if (opts && opts.coalesce && last && last.coalesce === opts.coalesce && Date.now() - last.at < 1200) {
      if (apply) apply();
      last.after = newText; last.at = Date.now();
      if (opts.redo) last.apply = opts.redo;
      setText(d, newText);
    } else {
      if (apply) apply();
      d.undo.push({ label: label, before: before, after: newText, apply: (opts && opts.redo) || apply, revert: revert, at: Date.now(), coalesce: opts && opts.coalesce });
      if (d.undo.length > 200) d.undo.shift();
      d.redo = [];
      setText(d, newText);
    }
    changed();
    return true;
  }
  function undo() {
    endEdit(false);
    var d = cur;
    if (!d || !d.undo.length) return;
    var e = d.undo.pop();
    if (e.revert) e.revert();
    setText(d, e.before);
    d.redo.push(e);
    changed();
    toast('Annulé : ' + e.label, 'info');
  }
  function redo() {
    endEdit(false);
    var d = cur;
    if (!d || !d.redo.length) return;
    var e = d.redo.pop();
    if (e.apply) e.apply();
    setText(d, e.after);
    d.undo.push(e);
    changed();
  }
  var saveTimer = null;
  function changed() {
    if (sel && !sel.el.isConnected) sel = null;
    refreshAll();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }
  function persist() {
    if (!site) return Promise.resolve();
    var all = [];
    docs.forEach(function (d) {
      var key = docKey(site, d.path);
      if (d.isNew || d.text !== d.original) {
        all.push(DB.put({ key: key, kind: 'page', siteId: site.id, path: d.path, text: d.text, original: d.original, baseSha: d.baseSha, isNew: d.isNew, from: d.from || null, title: (d.page && d.page.title) || '', at: Date.now() }));
      } else all.push(DB.del(key));
    });
    var refd = referencedUploads();
    uploads.forEach(function (u, p) {
      var key = site.id + '|img|' + p;
      if (refd.has(p)) all.push(DB.put({ key: key, kind: 'image', siteId: site.id, path: p, bytes: u.bytes.buffer.slice(u.bytes.byteOffset, u.bytes.byteOffset + u.bytes.byteLength), mime: u.mime, at: Date.now() }));
      else all.push(DB.del(key));
    });
    return Promise.all(all).then(function () { saveState(true); });
  }
  function referencedUploads() {
    var out = new Set();
    uploads.forEach(function (u, p) {
      var name = p.split('/').pop();
      docs.forEach(function (d) { if (d.text.indexOf(name) >= 0) out.add(p); });
    });
    return out;
  }
  function dirtyCount() {
    var n = 0;
    docs.forEach(function (d) { if (d.isNew || d.text !== d.original) n++; });
    return n + referencedUploads().size;
  }
  function saveState(saved) {
    var n = dirtyCount();
    var s = $('skSave');
    s.setAttribute('data-state', n ? (saved ? 'saved' : 'dirty') : 'clean');
    $('skSaveLabel').textContent = n ? plural(n, 'fichier modifié', 'fichiers modifiés') + (saved ? ' · gardé sur cet appareil' : '') : 'Aucune modification';
    $('skUndo').disabled = !cur || !cur.undo.length;
    $('skRedo').disabled = !cur || !cur.redo.length;
    $('skPublish').disabled = false;
  }
  function refreshAll() {
    saveState(false);
    renderPages();
    refreshTree();
    refreshPanel();
    $('skSelbar')._for = null;
    paintBoxes();
  }

  /* ================================================================ edits */

  function isTextual(src) {
    if (!src || src.isVoid || src.isRaw || src.type !== 'el') return false;
    if (/^(html|head|body|svg|picture|video|audio|iframe|select|table|tbody|thead|tr|ul|ol|dl)$/.test(src.tag)) return false;
    var t = cur.text;
    var hasText = false, ok = true;
    (function walk(n) {
      n.children.forEach(function (c) {
        if (c.type === 'text') { if (/\S/.test(C.decode(t.slice(c.start, c.end)))) hasText = true; }
        else if (c.type === 'el') { if (!C.INLINE[c.tag] && c.tag !== 'img') ok = false; else walk(c); }
      });
    })(src);
    return hasText && ok;
  }
  function isHidden(src) { return /^none$/i.test(C.styleValue(C.attrValue(cur.text, src, 'style') || '', 'display')); }
  function imgOf(el) {
    if (!el) return null;
    if (el.localName === 'img') return el;
    if (el.localName === 'picture') return el.querySelector('img');
    return null;
  }
  function eachLive(src, fn) { frames.forEach(function (f) { var l = counterpart(f, src); if (l) fn(l, f); }); }

  // attributes: [{ src, name, value (null = remove), live (value for the artboards, default value) }]
  function opAttrs(list, label) {
    var text = cur.text;
    // from the end of the file backwards, attribute by attribute: every offset stays valid
    var at = function (x) { var a = C.attr(x.src, x.name); return a ? a.start : x.src.openEnd; };
    list.slice().sort(function (a, b) { return at(b) - at(a); }).forEach(function (x) { text = C.setAttr(text, x.src, x.name, x.value); });
    var undoes = [], redoes = [];
    list.forEach(function (x) {
      eachLive(x.src, function (l) {
        var old = l.getAttribute(x.name), nv = x.live !== undefined ? x.live : x.value;
        var set = function (v) { if (v == null) l.removeAttribute(x.name); else l.setAttribute(x.name, v); };
        redoes.push(function () { set(nv); });
        undoes.push(function () { set(old); });
      });
    });
    var apply = function () { redoes.forEach(function (f) { f(); }); };
    var revert = function () { undoes.forEach(function (f) { f(); }); };
    return commit(label, text, apply, revert);
  }
  function opStyle(src, prop, value, label) {
    var text = C.setStyle(cur.text, src, prop, value, false);
    var olds = [], lives = [];
    eachLive(src, function (l) { lives.push(l); olds.push([l, l.style.getPropertyValue(prop), l.style.getPropertyPriority(prop)]); });
    var apply = function () { lives.forEach(function (l) { if (value) l.style.setProperty(prop, value); else l.style.removeProperty(prop); }); };
    var revert = function () { olds.forEach(function (o) { if (o[1]) o[0].style.setProperty(prop, o[1], o[2]); else o[0].style.removeProperty(prop); }); };
    return commit(label || 'Style : ' + prop, text, apply, revert, { coalesce: 'style:' + prop + ':' + src.start + ':' + cur.path, redo: apply });
  }
  function opRawStyle(src, css) {
    var text = C.setAttr(cur.text, src, 'style', css ? css : null);
    var olds = [];
    eachLive(src, function (l) { olds.push([l, l.getAttribute('style')]); });
    var apply = function () { olds.forEach(function (o) { if (css) o[0].setAttribute('style', css); else o[0].removeAttribute('style'); }); };
    var revert = function () { olds.forEach(function (o) { if (o[1] == null) o[0].removeAttribute('style'); else o[0].setAttribute('style', o[1]); }); };
    return commit('Style en ligne', text, apply, revert);
  }
  function opHide() {
    var src = srcOf();
    if (!src) return;
    var hid = isHidden(src);
    opStyle(src, 'display', hid ? '' : 'none', hid ? 'Afficher' : 'Masquer');
    cur.undo[cur.undo.length - 1].coalesce = null;
    toast(hid ? 'Élément affiché.' : 'Élément masqué (display: none). Retrouvez-le dans « Structure ».', 'info');
  }
  function opDuplicate() {
    var src = srcOf();
    if (!src || src.tag === 'body' || src.tag === 'html' || src.tag === 'head') return;
    var r = C.duplicate(cur.text, src);
    var newId = null;
    var idv = C.attrValue(cur.text, src, 'id');
    if (idv) { var m = /id="([^"]+)"/.exec(r.text.slice(r.at, r.at + (src.openEnd - src.start) + 40)); newId = m ? C.decode(m[1]) : null; }
    var clones = [];
    eachLive(src, function (l) {
      var c = l.cloneNode(true);
      if (newId) c.setAttribute('id', newId);
      clones.push([l, c]);
    });
    var apply = function () { clones.forEach(function (p) { p[0].after(p[1]); }); };
    var revert = function () { clones.forEach(function (p) { p[1].remove(); }); };
    var f = sel.frame, mine = clones.find(function (p) { return p[0] === sel.el; });
    if (commit('Dupliquer', r.text, apply, revert) && mine) select(mine[1], f);
    toast('Élément dupliqué.', 'ok');
  }
  function opDelete() {
    var src = srcOf();
    if (!src || src.tag === 'body' || src.tag === 'html' || src.tag === 'head') return;
    var r = C.remove(cur.text, src);
    var spots = [];
    eachLive(src, function (l) { spots.push([l, l.parentNode, l.nextSibling]); });
    var apply = function () { spots.forEach(function (s) { s[0].remove(); }); };
    var revert = function () { spots.forEach(function (s) { s[1].insertBefore(s[0], s[2] && s[2].parentNode === s[1] ? s[2] : null); }); };
    var parent = sel.el.parentElement, f = sel.frame;
    if (commit('Supprimer', r.text, apply, revert)) {
      select(parent && parent !== f.doc.documentElement ? parent : null, f);
      toast('Élément supprimé.', 'info', { label: 'Annuler', run: undo });
    }
  }
  function opOuter(src, html) {
    var text = C.replaceOuter(cur.text, src, html);
    var swaps = [];
    eachLive(src, function (l, f) {
      var t = f.doc.createElement('template');
      t.innerHTML = html;
      swaps.push([l, Array.prototype.slice.call(t.content.childNodes)]);
    });
    var apply = function () { swaps.forEach(function (s) { var p = s[0].parentNode; if (!p) return; s[1].forEach(function (n) { p.insertBefore(n, s[0]); }); s[0].remove(); }); };
    var revert = function () { swaps.forEach(function (s) { var first = s[1][0]; if (!first || !first.parentNode) return; first.parentNode.insertBefore(s[0], first); s[1].forEach(function (n) { n.remove(); }); }); };
    var f = sel && sel.frame, was = sel && sel.el;
    if (commit('Code de l’élément', text, apply, revert)) {
      var mine = f && swaps.find(function (s) { return s[0] === was; });
      var first = mine && mine[1].find(function (n) { return n.nodeType === 1; });
      select(first || null, f);
      toast('Code appliqué.', 'ok');
    }
  }

  /* ---------------------------------------------------------------- inline text */

  function cleanHTML(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('[data-sk-inject]').forEach(function (n) { n.remove(); });
    return c.innerHTML;
  }
  function startEdit(el, f, x, y) {
    var src = f.map && f.map.l2s.get(el);
    if (!src) { toast('Cet élément est créé par un script de la page : modifiez-le dans l’onglet Code de son parent.', 'info'); return; }
    if (!isTextual(src)) { toast('Ce bloc contient d’autres blocs : choisissez le texte lui-même (double-clic dessus).', 'info'); return; }
    endEdit(false);
    var before = new Map();
    frames.forEach(function (o) { var l = counterpart(o, src); if (l) before.set(o, l.innerHTML); });
    editing = { el: el, frame: f, src: src, before: before };
    try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = true;
    el.focus({ preventScroll: true });
    var range = null;
    try {
      if (x != null && f.doc.caretRangeFromPoint) range = f.doc.caretRangeFromPoint(x, y);
    } catch (e) { range = null; }
    var s = f.win.getSelection();
    if (s) {
      if (!range || !el.contains(range.startContainer)) { range = f.doc.createRange(); range.selectNodeContents(el); range.collapse(false); }
      s.removeAllRanges(); s.addRange(range);
    }
    el.addEventListener('keydown', editKeys, true);
    el.addEventListener('paste', editPaste, true);
    el.addEventListener('blur', editBlur);
    paintBoxes();
    refreshPanel();
  }
  function editKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEdit(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); endEdit(false); return; }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      var f = editing.frame, s = f.win.getSelection();
      if (!s || !s.rangeCount) return;
      var r = s.getRangeAt(0);
      r.deleteContents();
      var br = f.doc.createElement('br');
      r.insertNode(br);
      r.setStartAfter(br); r.collapse(true);
      s.removeAllRanges(); s.addRange(r);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) { e.preventDefault(); } // no stray <b> from the browser
    e.stopPropagation();
  }
  function editPaste(e) {
    e.preventDefault();
    var t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    var f = editing && editing.frame;
    if (f) f.doc.execCommand('insertText', false, t.replace(/\s*\n\s*/g, ' '));
  }
  function editBlur() { setTimeout(function () { if (editing && editing.frame.doc.activeElement !== editing.el) endEdit(false); }, 0); }
  function endEdit(cancel) {
    if (!editing) return;
    var ed = editing;
    editing = null;
    var el = ed.el;
    el.removeEventListener('keydown', editKeys, true);
    el.removeEventListener('paste', editPaste, true);
    el.removeEventListener('blur', editBlur);
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    try { ed.frame.win.getSelection().removeAllRanges(); } catch (e) { /* ok */ }
    if (cancel || !cur) { el.innerHTML = ed.before.get(ed.frame); return; }
    // a lone <br> the browser leaves in an emptied element
    if (el.childNodes.length === 1 && el.firstChild.nodeName === 'BR' && !/<br/i.test(ed.before.get(ed.frame))) el.innerHTML = '';
    var edits = C.textEdits(cur.text, ed.src, el, cleanHTML);
    if (!edits.length) { paintBoxes(); refreshPanel(); return; }
    var text = C.applyText(cur.text, edits);
    var after = cleanHTML(el);
    var befores = ed.before;
    var apply = function () { befores.forEach(function (h, f) { var l = counterpart(f, ed.src); if (l && f !== ed.frame) l.innerHTML = after; }); };
    var targets = [];
    befores.forEach(function (h, f) { var l = counterpart(f, ed.src); if (l) targets.push([l, h]); });
    apply();
    var redoAll = function () { targets.forEach(function (t) { t[0].innerHTML = after; }); };
    var revert = function () { targets.forEach(function (t) { t[0].innerHTML = t[1]; }); };
    commit('Texte', text, null, revert, { redo: redoAll });
  }

  /* ---------------------------------------------------------------- images */

  var MAX_UPLOAD = 4 * 1024 * 1024;
  $('skFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file || !sel) return;
    var target = { el: sel.el, frame: sel.frame, src: srcOf(), bg: $('skFile')._bg };
    $('skFile')._bg = false;
    prepareImage(file).then(function (img) {
      return C.gitBlobSha(img.bytes).then(function (sha) {
        var base = C.slugify(file.name.replace(/\.[a-z0-9]+$/i, '')) || 'image';
        var path = site.uploads + base + '-' + sha.slice(0, 8) + img.ext;
        if (!uploads.has(path)) uploads.set(path, { bytes: img.bytes, mime: img.mime, url: URL.createObjectURL(new Blob([img.bytes], { type: img.mime })) });
        var rel = C.relPath(cur.path, path);
        if (target.bg) setBackground(target.src, rel, uploads.get(path).url);
        else setImage(target.src, target.el, rel, uploads.get(path).url);
        toast('Image ajoutée : ' + path + ' (' + Math.round(img.bytes.length / 1024) + NB + 'ko). Elle partira avec la publication.', 'ok');
      });
    }, function (e) { toast(e.message || 'Image illisible.', 'err'); });
  });
  function prepareImage(file) {
    var mime = file.type || 'application/octet-stream';
    var extOf = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' };
    if (!extOf[mime]) return Promise.reject(new Error('Format non pris en charge : JPG, PNG, WebP, GIF, SVG ou AVIF.'));
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      if (mime === 'image/svg+xml' || mime === 'image/gif' || bytes.length <= 1.5 * 1024 * 1024) {
        if (bytes.length > MAX_UPLOAD) throw new Error('Image trop lourde (au plus 4 Mo).');
        return { bytes: bytes, mime: mime, ext: extOf[mime] };
      }
      // big photo: at most 2400 px wide, re-encoded (WebP when the browser can, else JPEG)
      return createImageBitmap(file).then(function (bmp) {
        var s = Math.min(1, 2400 / bmp.width);
        var cv = doc.createElement('canvas');
        cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        var out = mime === 'image/png' ? 'image/png' : 'image/webp';
        return new Promise(function (res) { cv.toBlob(res, out, 0.86); }).then(function (blob) {
          if (!blob || blob.type !== out) return new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.86); });
          return blob;
        }).then(function (blob) {
          return blob.arrayBuffer().then(function (b2) {
            var by = new Uint8Array(b2);
            if (by.length > MAX_UPLOAD) throw new Error('Image trop lourde même réduite (au plus 4 Mo).');
            return { bytes: by, mime: blob.type, ext: extOf[blob.type] || '.jpg' };
          });
        });
      });
    });
  }
  function setImage(src, el, rel, liveUrl) {
    if (!src) return;
    var img = src.tag === 'img' ? src : C.find({ elements: cur.tree.elements.filter(function (e) { return e.start > src.start && e.end <= src.end; }) }, function (e) { return e.tag === 'img'; });
    if (!img) return;
    var list = [{ src: img, name: 'src', value: rel, live: liveUrl || rel }];
    if (C.attr(img, 'srcset')) list.push({ src: img, name: 'srcset', value: null });
    if (C.attr(img, 'sizes')) list.push({ src: img, name: 'sizes', value: null });
    var pic = img.parent && img.parent.tag === 'picture' ? img.parent : null;
    if (pic) pic.children.forEach(function (c) { if (c.type === 'el' && c.tag === 'source' && C.attr(c, 'srcset')) list.push({ src: c, name: 'srcset', value: rel, live: liveUrl || rel }); });
    opAttrs(list, 'Image');
  }
  function setBackground(src, rel, liveUrl) {
    if (!src) return;
    var v = 'url("' + rel + '")';
    var text = C.setStyle(cur.text, src, 'background-image', v, false);
    var olds = [];
    eachLive(src, function (l) { olds.push([l, l.style.getPropertyValue('background-image')]); });
    var lv = 'url("' + (liveUrl || rel) + '")';
    var apply = function () { olds.forEach(function (o) { o[0].style.setProperty('background-image', lv); }); };
    var revert = function () { olds.forEach(function (o) { if (o[1]) o[0].style.setProperty('background-image', o[1]); else o[0].style.removeProperty('background-image'); }); };
    commit('Image de fond', text, apply, revert);
  }
  function siteImages() {
    var seen = new Set(), out = [];
    function add(abs, rel) { if (!abs || seen.has(abs)) return; seen.add(abs); out.push({ abs: abs, rel: rel }); }
    var f = frames.find(function (x) { return x.ready; });
    uploads.forEach(function (u, p) { add(u.url, C.relPath(cur.path, p)); });
    if (f) {
      f.doc.querySelectorAll('img[src]').forEach(function (im) {
        var raw = im.getAttribute('src');
        if (!raw || /^data:/.test(raw)) return;
        add(im.currentSrc || im.src, raw);
      });
    }
    (site.images || []).forEach(function (p) { add((ROOT && !site.onlyOnBranch ? ROOT : assetBase({ path: '' })) + p, C.relPath(cur.path, p)); });
    return out;
  }
  function pickImage(onPick) {
    var imgs = siteImages();
    var box = ce('div');
    box.innerHTML = '<p>Les images de la page et du dossier du site (' + imgs.length + ').</p>';
    var grid = ce('div', 'sk-pick');
    grid.style.maxHeight = '420px';
    imgs.forEach(function (im) {
      var b = ce('button');
      b.type = 'button';
      b.title = im.rel;
      b.innerHTML = '<img loading="lazy" alt="" src="' + esc(im.abs) + '">';
      b.addEventListener('click', function () { closeModal(); onPick(im.rel, im.abs); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    openModal('Choisir une image du site', box, { width: '720px' });
  }

  /* ---------------------------------------------------------------- SEO */

  function opSEO(field, value) {
    var t = cur.tree, text = cur.text, old = C.readSEO(t);
    var label = { title: 'Titre de la page', description: 'Description', ogImage: 'Image de partage' }[field];
    // the matching Open Graph / Twitter tags follow when they repeated the old value
    function follow(txt, key, oldV) {
      var tr = C.parse(txt);
      var m = tr.elements.find(function (e) { if (e.tag !== 'meta') return false; var k = (C.attrValue(txt, e, 'property') || C.attrValue(txt, e, 'name') || '').toLowerCase(); return k === key; });
      if (m && (C.attrValue(txt, m, 'content') || '') === oldV) return C.setAttr(txt, m, 'content', value);
      return txt;
    }
    if (field === 'title') {
      text = C.setTitle(text, t, value);
      ['og:title', 'twitter:title'].forEach(function (k) { text = follow(text, k, old.title); });
    } else if (field === 'description') {
      text = C.setMeta(text, t, 'description', value);
      ['og:description', 'twitter:description'].forEach(function (k) { text = follow(text, k, old.description); });
    } else {
      text = C.setMeta(text, t, 'og:image', value);
      text = follow(text, 'twitter:image', old.ogImage);
    }
    var oldTitles = frames.map(function (f) { return f.doc ? f.doc.title : ''; });
    var apply = field === 'title' ? function () { frames.forEach(function (f) { if (f.doc) f.doc.title = value; }); } : null;
    var revert = field === 'title' ? function () { frames.forEach(function (f, k) { if (f.doc) f.doc.title = oldTitles[k]; }); } : null;
    var ok = commit(label, text, apply, revert, { coalesce: 'seo:' + field + ':' + cur.path, redo: apply });
    if (ok && field === 'title' && cur.page) cur.page.title = value;
    return ok;
  }

  /* ---------------------------------------------------------------- pages: a copy of one */

  function addPage() {
    if (!cur) return;
    var box = ce('div');
    box.innerHTML = '<p>La nouvelle page est une copie exacte de « ' + esc(shortTitle(cur.page.title) || cur.path) + ' », à côté d’elle (mêmes images, mêmes styles). Elle partira avec la prochaine publication.</p>' +
      '<label class="sk-field"><span>Titre de la nouvelle page</span><input class="sk-input" id="skNewTitle" autocomplete="off"></label>' +
      '<p class="sk-note" id="skNewPath" style="margin-top:8px"></p>' +
      '<div class="sk-actions"><button class="sk-ghost" type="button" data-close>Annuler</button><button class="sk-primary" type="button" id="skNewGo">Créer la page</button></div>';
    openModal('Dupliquer la page', box);
    var inp = $('skNewTitle'), out = $('skNewPath');
    function pathFor(t) { var sl = C.slugify(t) || 'nouvelle-page'; return C.dirOf(cur.path) + sl + '.html'; }
    function upd() {
      var p = pathFor(inp.value);
      var taken = !!pageByPath(p);
      out.textContent = (taken ? 'Déjà pris : ' : 'Fichier : ') + p + (site.branch === M.defaultBranch ? ' · en ligne : https://' + CFG.liveOrigin + '/' + p : '');
      out.classList.toggle('sk-note--warn', taken);
      $('skNewGo').disabled = taken || !inp.value.trim();
    }
    inp.addEventListener('input', upd);
    upd();
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('skNewGo').disabled) $('skNewGo').click(); });
    $('skNewGo').addEventListener('click', function () {
      var title = inp.value.trim(), path = pathFor(title);
      var text = C.setTitle(cur.text, cur.tree, title);
      var oldUrl = pageLiveUrl(site, cur.page), newUrl = pageLiveUrl(site, { path: path });
      if (oldUrl && newUrl) {
        var tr = C.parse(text);
        var hits = tr.elements.filter(function (e) {
          return (e.tag === 'link' && (C.attrValue(text, e, 'rel') || '').toLowerCase() === 'canonical' && C.attrValue(text, e, 'href') === oldUrl) ||
            (e.tag === 'meta' && /^(og:url)$/i.test(C.attrValue(text, e, 'property') || '') && C.attrValue(text, e, 'content') === oldUrl);
        }).sort(function (a, b) { return b.start - a.start; });
        hits.forEach(function (e) { text = C.setAttr(text, e, e.tag === 'link' ? 'href' : 'content', newUrl); });
      }
      var from = cur.page.from || cur.path;
      site.pages.push({ path: path, title: title, url: '', sha: null, isNew: true, local: false, from: from });
      docs.set(path, { path: path, original: '', text: text, tree: C.parse(text), baseSha: null, isNew: true, from: from, undo: [], redo: [] });
      closeModal();
      persist();
      location.hash = '#/site/' + site.id + '/' + path;
      toast('Page créée : ' + path, 'ok');
    });
  }
  $('skAddPage').addEventListener('click', addPage);

  /* ================================================================ the structure tree */

  function treeKey(src) { // a tag path, stable while the elements before it do not change
    var parts = [];
    for (var n = src; n && n.type === 'el'; n = n.parent) {
      var sib = n.parent ? n.parent.children.filter(function (c) { return c.type === 'el'; }) : [n];
      parts.unshift(n.tag + sib.indexOf(n));
    }
    return parts.join('/');
  }
  var treeQueued = false;
  function refreshTree(reveal) {
    if (treeQueued) return;
    treeQueued = true;
    requestAnimationFrame(function () { treeQueued = false; renderTree(reveal); });
  }
  function renderTree(reveal) {
    var box = $('skTree');
    if (!cur || !cur.tree) { box.innerHTML = ''; return; }
    var body = C.find(cur.tree, function (e) { return e.tag === 'body'; });
    if (!body) { box.innerHTML = '<div class="sk-empty">Pas de &lt;body&gt; dans cette page.</div>'; return; }
    var selSrc = srcOf();
    if (reveal && selSrc) for (var p = selSrc.parent; p && p.type === 'el'; p = p.parent) treeOpen.add(treeKey(p));
    treeOpen.add(treeKey(body));
    var text = cur.text, frag = doc.createDocumentFragment(), count = 0;
    var primary = frames.find(function (f) { return f.ready; });
    function label(e) {
      var id = C.attrValue(text, e, 'id'), cls = (C.attrValue(text, e, 'class') || '').split(/\s+/).filter(Boolean)[0];
      var name = e.tag + (id ? '#' + id : cls ? '.' + cls : '');
      var t = '';
      if (isTextual(e)) {
        t = '';
        (function walk(n) { n.children.forEach(function (c) { if (c.type === 'text') t += C.decode(text.slice(c.start, c.end)); else if (c.type === 'el') walk(c); }); })(e);
        t = t.replace(/\s+/g, ' ').trim().slice(0, 40);
      } else if (e.tag === 'img') t = (C.attrValue(text, e, 'alt') || C.attrValue(text, e, 'src') || '').slice(0, 40);
      return esc(name) + (t ? ' <em>' + esc(t) + '</em>' : '');
    }
    function row(e, depth) {
      if (count > 1500) return;
      count++;
      var kids = e.children.filter(function (c) { return c.type === 'el' && !c.isRaw && c.tag !== 'br'; });
      var key = treeKey(e), open = treeOpen.has(key);
      var r = ce('div', 'sk-row' + (isHidden(e) ? ' is-hidden' : ''));
      r.setAttribute('role', 'treeitem');
      r.setAttribute('aria-selected', String(e === selSrc));
      r.style.paddingLeft = (4 + depth * 12) + 'px';
      r.innerHTML = '<button type="button" class="sk-row__tw' + (kids.length ? '' : ' sk-row__tw--none') + '" aria-expanded="' + open + '" aria-label="Déplier"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>' +
        '<span class="sk-row__name">' + label(e) + '</span>' +
        (e.tag !== 'body' ? '<button type="button" class="sk-row__eye" aria-label="' + (isHidden(e) ? 'Afficher' : 'Masquer') + '">' + (isHidden(e) ? '<svg viewBox="0 0 16 16"><path d="M2.5 2.5l11 11M6.4 4.2A6.4 6.4 0 018 4c3.8 0 6 4 6 4a10.4 10.4 0 01-1.6 2.1M10.4 11.4A6 6 0 018 12c-3.8 0-6-4-6-4a10.6 10.6 0 012.8-3"/></svg>' : ICON.hide.replace('<svg ', '<svg ')) + '</button>' : '');
      if (e === selSrc) r.id = 'skTreeSel';
      r.querySelector('.sk-row__tw').addEventListener('click', function (ev) { ev.stopPropagation(); if (open) treeOpen.delete(key); else treeOpen.add(key); renderTree(); });
      var eye = r.querySelector('.sk-row__eye');
      if (eye) eye.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var f = primary, l = f && counterpart(f, e);
        if (l) { sel = { el: l, frame: f }; opHide(); }
      });
      r.addEventListener('click', function () {
        var f = (sel && sel.frame && sel.frame.ready) ? sel.frame : primary;
        var l = f && counterpart(f, e);
        if (l) { select(l, f); try { if (!isHidden(e)) l.scrollIntoView({ block: 'center' }); } catch (er) { /* ok */ } }
        else toast('Cet élément n’apparaît pas dans l’aperçu (retiré par un script de la page).', 'info');
      });
      frag.appendChild(r);
      if (open) kids.forEach(function (k) { row(k, depth + 1); });
    }
    row(body, 0);
    box.innerHTML = '';
    box.appendChild(frag);
    $('skTreeHint').textContent = cur.tree.elements.length + ' éléments';
    var s = $('skTreeSel');
    if (reveal && s) { var br = s.getBoundingClientRect(), bb = box.getBoundingClientRect(); if (br.top < bb.top || br.bottom > bb.bottom) s.scrollIntoView({ block: 'center' }); }
  }

  /* ================================================================ the right panel */

  function setTab(t) {
    tab = t;
    doc.querySelectorAll('.sk-tabs button').forEach(function (b) { var on = b.getAttribute('data-tab') === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    refreshPanel(true);
  }
  doc.querySelector('.sk-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); });

  function renderPath() {
    var box = $('skPath');
    box.innerHTML = '';
    var src = srcOf();
    if (!cur) return;
    if (!sel || !src) {
      box.appendChild(ce('span', 'sk-path__page', esc(shortTitle(cur.page && cur.page.title) || cur.path)));
      return;
    }
    var chain = [];
    for (var n = src; n && n.type === 'el' && n.tag !== 'html'; n = n.parent) chain.unshift(n);
    var text = cur.text;
    chain.forEach(function (n, k) {
      if (k) box.appendChild(ce('span', 'sk-path__sep', '›'));
      var id = C.attrValue(text, n, 'id'), cls = (C.attrValue(text, n, 'class') || '').split(/\s+/).filter(Boolean)[0];
      var b = ce('button', n === src ? 'is-cur' : '', esc(n.tag + (id ? '#' + id : cls ? '.' + cls : '')));
      b.type = 'button';
      b.title = n.tag + (id ? '#' + id : '') + (cls ? '.' + (C.attrValue(text, n, 'class') || '').trim().split(/\s+/).join('.') : '');
      b.addEventListener('click', function () { var l = counterpart(sel.frame, n); if (l) select(l, sel.frame); });
      box.appendChild(b);
    });
  }

  // The panel is rebuilt after every change, except while she is typing in one of its text fields
  // (then on blur). A new selection or tab always rebuilds it. Its handlers never keep a source node:
  // they read the current one (srcOf, linkNow, imgNow) when they run.
  var panelQueued = false, panelForce = false, panelBusy = false;
  function refreshPanel(force) {
    if (force) panelForce = true;
    if (panelQueued) return;
    panelQueued = true;
    requestAnimationFrame(function () { panelQueued = false; var f = panelForce; panelForce = false; renderPanel(f); });
  }
  function renderPanel(force) {
    renderPath();
    var p = $('skPanel');
    var keepScroll = p.scrollTop;
    var a = doc.activeElement;
    var field = a && p.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')) ? a : null;
    var typing = field && field.value !== field._last; // a value not committed yet
    if (typing && !force) return;
    var refocus = field && !force ? field.getAttribute('data-k') : null;
    panelBusy = true;
    if (field) field.blur();
    panelBusy = false;
    p.innerHTML = '';
    if (refocus) requestAnimationFrame(function () { var n = p.querySelector('[data-k="' + refocus + '"]'); if (n) { n.focus(); try { n.select(); } catch (e) { /* ok */ } } });
    if (!cur) return;
    var src = srcOf();
    if (sel && !src) {
      p.innerHTML = '<div class="sk-empty">Cet élément est ajouté par un script de la page : il n’existe pas dans le fichier. Choisissez son parent (Échap) pour le modifier.</div>';
      return;
    }
    if (!sel) { if (tab === 'code') codePanel(p, null); else seoPanel(p); return; }
    if (tab === 'style') stylePanel(p, src);
    else if (tab === 'code') codePanel(p, src);
    else contentPanel(p, src);
    p.scrollTop = keepScroll;
  }
  function section(p, title, sub) {
    var s = ce('div', 'sk-sec');
    s.appendChild(ce('div', 'sk-sec__t', esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '')));
    p.appendChild(s);
    return s;
  }
  function field(parent, label, input, extra) {
    var l = ce('label', 'sk-field');
    l.appendChild(ce('span', null, esc(label) + (extra || '')));
    l.appendChild(input);
    parent.appendChild(l);
    return l;
  }
  function input(value, k, ph) {
    var i = ce('input', 'sk-input');
    i.value = value || '';
    i.setAttribute('data-k', k);
    if (ph) i.placeholder = ph;
    i.spellcheck = false;
    i.autocomplete = 'off';
    return i;
  }
  // commit on change (Enter / blur); while typing, nothing is rebuilt
  function onCommit(el, fn) {
    var done = function () { if (el.value !== el._last) { el._last = el.value; fn(el.value); } };
    el._last = el.value;
    el.addEventListener('change', done);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') { e.preventDefault(); done(); } e.stopPropagation(); });
    el.addEventListener('blur', function () { if (!panelBusy) setTimeout(refreshPanel, 0); });
  }

  // the current source node of the selection's link / image (live elements are stable, source nodes are not)
  function linkNow() { if (!sel) return null; var a = sel.el.closest && sel.el.closest('a'); return a ? sel.frame.map.l2s.get(a) || null : null; }
  function imgNow() { if (!sel) return null; var i = imgOf(sel.el); return i ? sel.frame.map.l2s.get(i) || null : null; }
  function contentPanel(p, src) {
    var text = cur.text, el = sel.el;
    // text
    if (isTextual(src)) {
      var s = section(p, 'Texte', '<' + src.tag + '>');
      var plain = el.textContent.replace(/\s+/g, ' ').trim();
      s.appendChild(ce('p', 'sk-note', esc(plain.slice(0, 160)) + (plain.length > 160 ? '…' : '')));
      var b = ce('button', 'sk-ghost', 'Modifier le texte sur la page');
      b.type = 'button';
      b.addEventListener('click', function () { startEdit(sel.el, sel.frame); });
      var bs = ce('div', 'sk-btns'); bs.appendChild(b); s.appendChild(bs);
      s.appendChild(ce('p', 'sk-note', 'Ou double-cliquez le texte. Entrée valide, Maj + Entrée passe à la ligne, Échap termine.'));
    }
    // image
    var img = imgOf(el);
    var imgSrc = img && frames.length && sel.frame.map.l2s.get(img);
    if (img && imgSrc) {
      var si = section(p, 'Image', C.attrValue(text, imgSrc, 'src') ? '' : 'sans src');
      var pv = ce('div', 'sk-img', '<img alt="" src="' + esc(img.currentSrc || img.src) + '">');
      si.appendChild(pv);
      si.appendChild(ce('p', 'sk-note', '<code>' + esc(C.attrValue(text, imgSrc, 'src') || '') + '</code>'));
      var bs2 = ce('div', 'sk-btns');
      var up = ce('button', 'sk-primary', 'Remplacer…'); up.type = 'button';
      up.addEventListener('click', function () { $('skFile')._bg = false; $('skFile').click(); });
      var pk = ce('button', 'sk-ghost', 'Choisir une image du site'); pk.type = 'button';
      pk.addEventListener('click', function () { pickImage(function (rel, abs) { setImage(imgNow(), img, rel, abs.indexOf('blob:') === 0 ? abs : rel); }); });
      bs2.appendChild(up); bs2.appendChild(pk);
      si.appendChild(bs2);
      var alt = input(C.attrValue(text, imgSrc, 'alt') || '', 'alt', 'Ce que montre l’image');
      field(si, 'Texte alternatif (alt)', alt);
      onCommit(alt, function (v) { opAttrs([{ src: imgNow(), name: 'alt', value: v }], 'Texte alternatif'); });
      if (C.attr(imgSrc, 'srcset')) si.appendChild(ce('p', 'sk-note', 'Cette image a plusieurs tailles (srcset) : en la remplaçant, une seule taille est gardée.'));
    } else {
      var bgi = sel.frame.win.getComputedStyle(el).backgroundImage;
      if (bgi && /url\(/.test(bgi)) {
        var sb = section(p, 'Image de fond');
        var m = /url\(["']?([^"')]+)/.exec(bgi);
        sb.appendChild(ce('div', 'sk-img', '<img alt="" src="' + esc(m ? m[1] : '') + '">'));
        var bs3 = ce('div', 'sk-btns');
        var up2 = ce('button', 'sk-primary', 'Remplacer…'); up2.type = 'button';
        up2.addEventListener('click', function () { $('skFile')._bg = true; $('skFile').click(); });
        var pk2 = ce('button', 'sk-ghost', 'Choisir du site'); pk2.type = 'button';
        pk2.addEventListener('click', function () { pickImage(function (rel, abs) { setBackground(srcOf(), rel, abs); }); });
        bs3.appendChild(up2); bs3.appendChild(pk2);
        sb.appendChild(bs3);
        sb.appendChild(ce('p', 'sk-note', 'La nouvelle image s’écrit dans le style de l’élément (background-image).'));
      }
    }
    // link
    var a = src.tag === 'a' ? src : null;
    for (var n = src.parent; !a && n && n.type === 'el'; n = n.parent) if (n.tag === 'a') a = n;
    if (a) {
      var sl = section(p, 'Lien', a === src ? '' : 'du parent <a>');
      var href = input(C.attrValue(text, a, 'href') || '', 'href', 'https://… ou page.html ou #section');
      field(sl, 'Adresse (href)', href);
      onCommit(href, function (v) { opAttrs([{ src: linkNow(), name: 'href', value: v.trim() }], 'Lien'); });
      var tg = ce('select', 'sk-select');
      tg.setAttribute('data-k', 'target');
      var curT = C.attrValue(text, a, 'target') || '';
      [['', 'Même onglet'], ['_blank', 'Nouvel onglet']].forEach(function (o) { var op = ce('option', null, o[1]); op.value = o[0]; if (o[0] === curT) op.selected = true; tg.appendChild(op); });
      if (curT && curT !== '_blank') { var op2 = ce('option', null, esc(curT)); op2.value = curT; op2.selected = true; tg.appendChild(op2); }
      field(sl, 'Ouvrir dans', tg);
      tg.addEventListener('change', function () {
        var an = linkNow();
        var list = [{ src: an, name: 'target', value: tg.value || null }];
        if (tg.value === '_blank' && !C.attr(an, 'rel')) list.push({ src: an, name: 'rel', value: 'noopener' });
        opAttrs(list, 'Cible du lien');
      });
      var go = ce('div', 'sk-btns');
      var test = ce('a', 'sk-ghost', 'Ouvrir le lien ↗');
      try { test.href = new URL(C.attrValue(text, a, 'href') || '#', pageLiveUrl(site, cur.page) || location.href).href; } catch (e) { test.href = '#'; }
      test.target = '_blank'; test.rel = 'noopener';
      go.appendChild(test);
      sl.appendChild(go);
    }
    // element actions
    var sa = section(p, 'Élément', '<' + src.tag + '>');
    var row = ce('div', 'sk-btns');
    [['Dupliquer', opDuplicate, 'sk-ghost'], [isHidden(src) ? 'Afficher' : 'Masquer', opHide, 'sk-ghost'], ['Supprimer', opDelete, 'sk-danger']].forEach(function (x) {
      var b2 = ce('button', x[2], x[0]); b2.type = 'button'; b2.addEventListener('click', x[1]); row.appendChild(b2);
    });
    sa.appendChild(row);
    if (/^(body|html|head)$/.test(src.tag)) row.querySelectorAll('button').forEach(function (b3, k) { if (k !== 1) b3.disabled = true; });
    var idv = input(C.attrValue(text, src, 'id') || '', 'id', 'aucun');
    field(sa, 'Identifiant (id, pour les liens #)', idv);
    onCommit(idv, function (v) { opAttrs([{ src: srcOf(), name: 'id', value: v.trim() || null }], 'Identifiant'); });
  }

  /* ---------------------------------------------------------------- style: the Studio's controls */

  var STYLE_GROUPS = [
    { t: 'Typographie', rows: [
      ['font-size', 'Taille', 'num', 'px'], ['font-weight', 'Graisse', 'select', ['', '300', '400', '500', '600', '700', '800', '900']],
      ['line-height', 'Interligne', 'num', ''], ['letter-spacing', 'Lettres', 'num', 'px'],
      ['text-align', 'Alignement', 'seg', [['left', 'G'], ['center', 'C'], ['right', 'D'], ['justify', 'J']]],
      ['color', 'Couleur', 'color'], ['text-transform', 'Casse', 'select', ['', 'none', 'uppercase', 'lowercase', 'capitalize']],
      ['font-family', 'Police', 'font']
    ] },
    { t: 'Remplissage', rows: [['background-color', 'Fond', 'color']] },
    { t: 'Espacements', rows: [['margin', 'Marge', 'quad'], ['padding', 'Retrait', 'quad'], ['gap', 'Écart', 'num', 'px']] },
    { t: 'Dimensions', rows: [['width', 'Largeur', 'num', 'px'], ['max-width', 'Larg. max', 'num', 'px'], ['height', 'Hauteur', 'num', 'px']] },
    { t: 'Bordure', rows: [['border-radius', 'Rayon', 'num', 'px'], ['border-width', 'Épaisseur', 'num', 'px'], ['border-style', 'Trait', 'select', ['', 'none', 'solid', 'dashed', 'dotted']], ['border-color', 'Couleur', 'color']] },
    { t: 'Effets', rows: [['opacity', 'Opacité', 'num', ''], ['box-shadow', 'Ombre', 'select', ['', 'none', '0 1px 2px rgba(0,0,0,.12)', '0 4px 12px rgba(0,0,0,.15)', '0 12px 32px rgba(0,0,0,.2)']]] }
  ];
  var groupClosed = (function () { try { return JSON.parse(localStorage.getItem('jeere-sites-groups')) || {}; } catch (e) { return {}; } })();
  function toHex(c) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
    if (!m) return /^#/.test(c || '') ? c.toUpperCase() : '';
    function h(n) { var s = (+n).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
    var a = m[4] == null ? 1 : +m[4];
    return '#' + h(m[1]) + h(m[2]) + h(m[3]) + (a < 1 ? h(Math.round(a * 255)) : '');
  }
  function stylePanel(p, src) {
    var el = sel.el, cs = sel.frame.win.getComputedStyle(el);
    var css = C.attrValue(cur.text, src, 'style') || '';
    var head = section(p, 'Style de l’élément', '<' + src.tag + '>');
    head.appendChild(ce('p', 'sk-note', 'Écrit dans l’attribut style de cet élément seulement, à toutes les largeurs. Les valeurs grises sont celles de la feuille de style du site.'));
    STYLE_GROUPS.forEach(function (g) {
      var box = ce('div', 'dz-g' + (groupClosed[g.t] ? ' is-closed' : ''));
      var has = g.rows.some(function (r) { return r[2] === 'quad' ? ['', '-top', '-right', '-bottom', '-left'].some(function (s2) { return C.styleValue(css, r[0] + s2); }) : C.styleValue(css, r[0]); });
      if (has) box.classList.add('has-val');
      box.innerHTML = '<div class="dz-gh"><button type="button" class="dz-gh__t"><span class="dz-gh__c"><svg viewBox="0 0 16 16"><path d="M4.5 6.5L8 10l3.5-3.5"/></svg></span><span>' + esc(g.t) + '</span></button></div><div class="dz-gb"><div class="dz-gb__in"></div></div>';
      box.querySelector('.dz-gh__t').addEventListener('click', function () { box.classList.toggle('is-closed'); groupClosed[g.t] = box.classList.contains('is-closed'); try { localStorage.setItem('jeere-sites-groups', JSON.stringify(groupClosed)); } catch (e) { /* ok */ } });
      var inner = box.querySelector('.dz-gb__in');
      g.rows.forEach(function (r) { inner.appendChild(styleRow(src, el, cs, css, r)); });
      p.appendChild(box);
    });
    var sc = section(p, 'CSS en ligne', 'style=""');
    var ta = ce('textarea', 'sk-textarea sk-code');
    ta.style.minHeight = '72px';
    ta.value = css;
    ta.setAttribute('data-k', 'rawcss');
    ta.spellcheck = false;
    sc.appendChild(ta);
    var bs = ce('div', 'sk-btns');
    var ap = ce('button', 'sk-ghost', 'Appliquer'); ap.type = 'button';
    ap.addEventListener('click', function () { opRawStyle(srcOf(), ta.value.trim()); });
    var rs = ce('button', 'sk-ghost', 'Tout effacer'); rs.type = 'button';
    rs.disabled = !css;
    rs.addEventListener('click', function () { opRawStyle(srcOf(), ''); });
    bs.appendChild(ap); bs.appendChild(rs);
    sc.appendChild(bs);
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ap.click(); });
    ta.addEventListener('blur', function () { if (!panelBusy) setTimeout(refreshPanel, 0); });
  }
  function styleRow(src, el, cs, css, r) {
    var prop = r[0], kind = r[2];
    var row = ce('div', 'dz-row');
    row.appendChild(ce('span', 'dz-lab', esc(r[1])));
    var ctl = ce('div', 'dz-ctl');
    row.appendChild(ctl);
    var own = C.styleValue(css, prop);
    var dot = ce('button', 'dz-dot' + (own ? ' is-base' : ' dz-dot--none'));
    dot.type = 'button';
    if (own) { dot.setAttribute('aria-label', 'Revenir à la valeur du site'); dot.setAttribute('data-tip', 'Revenir à la valeur du site'); dot.addEventListener('click', function () { opStyle(srcOf(), prop, ''); }); }
    var set = function (v) { var s = srcOf(); if (s) opStyle(s, prop, v); };
    if (kind === 'num') ctl.appendChild(numField(prop, own, cs.getPropertyValue(prop), r[3], set));
    else if (kind === 'select') {
      var s = ce('select', 'dz-select' + (own ? ' is-set' : ''));
      s.setAttribute('data-k', prop);
      r[3].forEach(function (v) { var o = ce('option', null, v ? esc(v) : esc('Site (' + (cs.getPropertyValue(prop) || '—').slice(0, 24) + ')')); o.value = v; if (v === own) o.selected = true; s.appendChild(o); });
      if (own && r[3].indexOf(own) < 0) { var o2 = ce('option', null, esc(own)); o2.value = own; o2.selected = true; s.appendChild(o2); }
      s.addEventListener('change', function () { set(s.value); });
      ctl.appendChild(s);
    } else if (kind === 'seg') {
      var sg = ce('div', 'dz-seg dz-seg--txt dz-seg--fill');
      var eff = own || cs.getPropertyValue(prop);
      r[3].forEach(function (o) {
        var b = ce('button', (o[0] === own ? 'is-on' : ''), esc(o[1]));
        b.type = 'button';
        b.title = o[0];
        if (!own && o[0] === eff) b.style.color = 'var(--dz-fg-2)';
        b.addEventListener('click', function () { set(o[0] === own ? '' : o[0]); });
        sg.appendChild(b);
      });
      ctl.appendChild(sg);
    } else if (kind === 'color') ctl.appendChild(colorField(prop, own, cs.getPropertyValue(prop), set));
    else if (kind === 'font') {
      var fi = ce('input', 'sk-input');
      fi.style.minHeight = '24px'; fi.style.height = '24px'; fi.style.fontSize = '11px';
      fi.value = own; fi.placeholder = (cs.getPropertyValue(prop) || '').split(',')[0].replace(/["']/g, '');
      fi.setAttribute('data-k', prop);
      fi.setAttribute('list', 'skFonts');
      onCommit(fi, function (v) { set(v.trim()); });
      ctl.appendChild(fi);
      fontList(el);
    } else if (kind === 'quad') {
      var q = ce('div', 'sk-quad4');
      ['top', 'right', 'bottom', 'left'].forEach(function (side, k) {
        var pp = prop + '-' + side;
        var ov = C.styleValue(css, pp);
        q.appendChild(numField(pp, ov, cs.getPropertyValue(pp), 'px', function (v) { var s = srcOf(); if (s) opStyle(s, pp, v); }, ['H', 'D', 'B', 'G'][k]));
      });
      ctl.appendChild(q);
      dot.className = 'dz-dot dz-dot--none';
    }
    row.appendChild(dot);
    return row;
  }
  function fontList(el) {
    if ($('skFonts')) return;
    var dl = ce('datalist');
    dl.id = 'skFonts';
    var seen = new Set();
    try {
      el.ownerDocument.querySelectorAll('body, body *').forEach(function (n, k) {
        if (k > 600) return;
        var f = el.ownerDocument.defaultView.getComputedStyle(n).fontFamily;
        if (f && !seen.has(f)) { seen.add(f); var o = ce('option'); o.value = f; dl.appendChild(o); }
      });
    } catch (e) { /* ok */ }
    doc.body.appendChild(dl);
  }
  // A Studio number field: scrub the label (Maj ×10, Alt ×0.1), ↑ ↓, expressions (« 24*2 »), Entrée.
  function numField(prop, own, computed, unit, set, letter) {
    var box = ce('div', 'dz-num' + (own ? ' is-set' : ''));
    var lab = ce('span', 'dz-num__l dz-scrub' + (letter ? '' : ' is-empty'), letter ? esc(letter) : '');
    var inp = ce('input');
    inp.setAttribute('data-k', prop);
    inp.value = own;
    var ph = String(computed || '').trim();
    inp.placeholder = ph.length > 14 ? ph.slice(0, 14) + '…' : ph;
    inp.inputMode = 'decimal';
    inp.spellcheck = false;
    box.appendChild(lab); box.appendChild(inp);
    if (unit) box.appendChild(ce('span', 'dz-num__u', esc(unit)));
    function norm(v) {
      v = String(v).trim();
      if (!v) return '';
      if (/^[-+*/().\d\s]+$/.test(v) && /[-+*/]/.test(v.replace(/^-/, ''))) { try { var n = Function('"use strict";return (' + v + ')')(); if (isFinite(n)) v = String(Math.round(n * 100) / 100); } catch (e) { /* keep */ } }
      if (/^-?\d+(\.\d+)?$/.test(v) && unit) v += unit;
      return v;
    }
    function num() { var m = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(inp.value || inp.placeholder); return m ? { n: +m[1], u: m[2] || unit } : null; }
    onCommit(inp, function (v) { set(norm(v)); });
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      var x = num() || { n: 0, u: unit };
      var step = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
      var n = Math.round((x.n + (e.key === 'ArrowUp' ? step : -step)) * 100) / 100;
      inp.value = n + (x.u || '');
      inp._last = inp.value;
      set(inp.value);
    });
    lab.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var x0 = e.clientX, start = num() || { n: 0, u: unit }, moved = false;
      doc.body.classList.add('dz-scrubbing');
      function mv(ev) {
        var dx = ev.clientX - x0;
        if (Math.abs(dx) < 2 && !moved) return;
        moved = true;
        var k = ev.shiftKey ? 10 : (ev.altKey ? 0.1 : 1);
        var n = Math.round((start.n + Math.round(dx / 2) * k) * 100) / 100;
        if (prop === 'opacity') n = clamp(n, 0, 1);
        inp.value = n + (start.u || '');
        set(inp.value);
      }
      function up() { doc.removeEventListener('pointermove', mv); doc.removeEventListener('pointerup', up); doc.body.classList.remove('dz-scrubbing'); refreshPanel(); }
      doc.addEventListener('pointermove', mv);
      doc.addEventListener('pointerup', up);
    });
    return box;
  }
  function colorField(prop, own, computed, set) {
    var box = ce('div', 'dz-color');
    var sw = ce('button', 'dz-sw' + (own ? '' : ' is-ph'));
    sw.type = 'button';
    sw.setAttribute('aria-label', 'Choisir la couleur');
    var shownC = own || computed;
    sw.style.background = 'linear-gradient(' + shownC + ',' + shownC + '), var(--dz-checker)';
    var hex = ce('input', 'dz-hex');
    hex.setAttribute('data-k', prop);
    hex.value = own ? (toHex(own) || own) : '';
    hex.placeholder = toHex(computed) || computed;
    hex.spellcheck = false;
    box.appendChild(sw); box.appendChild(hex);
    onCommit(hex, function (v) { v = v.trim(); if (/^[0-9a-f]{3,8}$/i.test(v)) v = '#' + v; set(v); });
    sw.addEventListener('click', function () {
      if (!window.JeereColor) return;
      var palette = pageColors().map(function (c) { return { v: c, label: c }; });
      window.JeereColor.open({
        anchor: sw, theme: 'dark', title: prop === 'color' ? 'Couleur du texte' : 'Couleur', value: toHex(own || computed) || '#000000',
        palette: palette, recents: [],
        place: function (el2, anchor) { var r = anchor.getBoundingClientRect(); el2.style.left = clamp(r.left - 260, 8, innerWidth - 256) + 'px'; el2.style.top = clamp(r.top - 40, 8, innerHeight - el2.offsetHeight - 8) + 'px'; },
        onChange: function (v) { if (/^#/.test(v)) set(v); }
      });
    });
    return box;
  }
  function pageColors() {
    var f = sel && sel.frame, out = [], seen = new Set();
    if (!f) return out;
    try {
      f.doc.querySelectorAll('body, body *').forEach(function (n, k) {
        if (k > 400 || out.length >= 12) return;
        var cs = f.win.getComputedStyle(n);
        [cs.color, cs.backgroundColor].forEach(function (c) { var h = toHex(c); if (h && h.length === 7 && !seen.has(h)) { seen.add(h); out.push(h); } });
      });
    } catch (e) { /* ok */ }
    return out;
  }

  /* ---------------------------------------------------------------- code */

  function codePanel(p, src) {
    var text = cur.text;
    if (!src) {
      var s0 = section(p, 'Code de la page', cur.path);
      s0.appendChild(ce('p', 'sk-note', 'Choisissez un élément pour voir et modifier son code exact. Le fichier entier fait ' + text.length + ' caractères.'));
      return;
    }
    var s = section(p, 'Code de l’élément', 'octets ' + src.start + '–' + src.end);
    var ta = ce('textarea', 'sk-textarea sk-code');
    ta.value = text.slice(src.start, src.end);
    ta.setAttribute('data-k', 'code');
    ta.spellcheck = false;
    ta.style.minHeight = Math.min(520, 120 + ta.value.split('\n').length * 16) + 'px';
    s.appendChild(ta);
    var bs = ce('div', 'sk-btns');
    var ap = ce('button', 'sk-primary', 'Appliquer'); ap.type = 'button';
    ap.addEventListener('click', function () {
      var v = ta.value, s = srcOf();
      if (!s) return;
      if (v === cur.text.slice(s.start, s.end)) { toast('Rien n’a changé.', 'info'); return; }
      opOuter(s, v);
    });
    var cp = ce('button', 'sk-ghost', 'Copier'); cp.type = 'button';
    cp.addEventListener('click', function () { try { navigator.clipboard.writeText(ta.value); toast('Code copié.', 'ok'); } catch (e) { ta.select(); } });
    bs.appendChild(ap); bs.appendChild(cp);
    s.appendChild(bs);
    s.appendChild(ce('p', 'sk-note', 'C’est le texte exact du fichier pour cet élément : le reste de la page ne bouge pas. Ctrl Entrée applique.'));
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ap.click(); } });
    ta.addEventListener('blur', function () { if (!panelBusy) setTimeout(refreshPanel, 0); });
  }

  /* ---------------------------------------------------------------- the page: SEO */

  function seoPanel(p) {
    var seo = C.readSEO(cur.tree);
    var s = section(p, 'Référencement de la page', cur.path);
    var live = pageLiveUrl(site, cur.page) || '';
    var prev = ce('div', 'sk-seo-prev');
    function paint() { prev.innerHTML = '<small>' + esc(live.replace(/^https?:\/\//, '')) + '</small><b>' + esc(t.value || 'Sans titre') + '</b><p>' + esc((d.value || '').slice(0, 170)) + '</p>'; }
    var t = input(seo.title, 'seo-title', 'Le titre dans Google et l’onglet');
    var tc = ce('span', 'sk-count');
    field(s, 'Titre (title)', t).querySelector('span').appendChild(tc);
    var d = ce('textarea', 'sk-textarea');
    d.value = seo.description;
    d.setAttribute('data-k', 'seo-desc');
    d.rows = 3;
    var dc = ce('span', 'sk-count');
    field(s, 'Description (meta description)', d).querySelector('span').appendChild(dc);
    function counts() {
      tc.textContent = t.value.length + ' / 60'; tc.classList.toggle('is-long', t.value.length > 60);
      dc.textContent = d.value.length + ' / 160'; dc.classList.toggle('is-long', d.value.length > 160);
      paint();
    }
    t.addEventListener('input', counts); d.addEventListener('input', counts);
    s.appendChild(prev);
    counts();
    onCommit(t, function (v) { opSEO('title', v); });
    onCommit(d, function (v) { opSEO('description', v); });
    var so = section(p, 'Image de partage (og:image)', '1200 × 630 conseillé');
    var og = input(seo.ogImage, 'seo-og', 'https://kreeative.xyz/assets/img/og/…');
    var ogPrev = ce('div', 'sk-img', seo.ogImage ? '<img alt="" src="' + esc(seo.ogImage) + '" onerror="this.remove()">' : '');
    so.appendChild(ogPrev);
    field(so, 'Adresse de l’image', og);
    onCommit(og, function (v) { opSEO('ogImage', v.trim()); });
    var bs = ce('div', 'sk-btns');
    var pk = ce('button', 'sk-ghost', 'Choisir une image du site'); pk.type = 'button';
    pk.addEventListener('click', function () {
      pickImage(function (rel) {
        var rp = C.repoPathOf(cur.path, rel, null);
        var abs = site.branch === M.defaultBranch ? 'https://' + CFG.liveOrigin + '/' + rp : (site.previewBase ? site.previewBase + rp : rel);
        opSEO('ogImage', abs);
      });
    });
    bs.appendChild(pk);
    so.appendChild(bs);
    so.appendChild(ce('p', 'sk-note', 'Les balises og:title, og:description, twitter:… qui répétaient l’ancienne valeur suivent la nouvelle.'));
    var sp = section(p, 'La page');
    sp.appendChild(ce('p', 'sk-note', (cur.isNew ? 'Nouvelle page (copie de ' + esc(cur.from) + ').' : 'Fichier ' + esc(cur.path) + ' · ' + cur.text.length + ' caractères · ' + cur.tree.elements.length + ' éléments.') + (live ? ' <a class="sk-linkbtn" href="' + esc(live) + '" target="_blank" rel="noopener">Voir en ligne ↗</a>' : '')));
    if (cur.noScripts) sp.appendChild(ce('p', 'sk-note sk-note--warn', 'Affichée sans ses scripts (elle redirige ailleurs à l’ouverture).'));
    var tg = ce('button', 'sk-ghost', cur.noScripts ? 'Réactiver les scripts' : 'Afficher sans les scripts'); tg.type = 'button';
    tg.addEventListener('click', function () { cur.noScripts = !cur.noScripts; sel = null; frames.forEach(loadFrame); refreshPanel(); });
    var bs2 = ce('div', 'sk-btns'); bs2.appendChild(tg); sp.appendChild(bs2);
  }

  /* ================================================================ keyboard */

  function selectParent() {
    var src = srcOf();
    if (!src) { if (sel) select(sel.el.parentElement, sel.frame); return; }
    var p = src.parent;
    if (p && p.type === 'el' && p.tag !== 'html') { var l = counterpart(sel.frame, p); if (l) { select(l, sel.frame); return; } }
    select(null);
  }
  function onKey(e, f) {
    if (editing) return;
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && !(f && t.ownerDocument === f.doc && mode === 'edit');
    if (!$('skModal').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } return; }
    var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); showChanges(); return; }
    if (typing) return;
    if (!cur || $('sk').getAttribute('data-view') !== 'edit') return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); opDuplicate(); return; }
    if (mod && e.shiftKey && k === 'h') { e.preventDefault(); opHide(); return; }
    if (mod) return;
    if (k === 'escape') { e.preventDefault(); if (sel) selectParent(); return; }
    if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); opDelete(); return; }
    if (k === 'enter' && sel) { e.preventDefault(); startEdit(sel.el, sel.frame); return; }
    if (k === 'v') { setMode('edit'); return; }
    if (k === 'p') { setMode('nav'); return; }
  }
  doc.addEventListener('keydown', function (e) { onKey(e, null); });
  function setMode(m) {
    mode = m;
    endEdit(false);
    $('skModeEdit').classList.toggle('is-on', m === 'edit'); $('skModeEdit').setAttribute('aria-pressed', String(m === 'edit'));
    $('skModeNav').classList.toggle('is-on', m === 'nav'); $('skModeNav').setAttribute('aria-pressed', String(m === 'nav'));
    if (m === 'nav') { hover = null; }
    paintBoxes();
    if (m === 'nav') toast('Mode Naviguer : le site réagit comme en ligne. V pour revenir à Modifier.', 'info');
  }
  $('skModeEdit').addEventListener('click', function () { setMode('edit'); });
  $('skModeNav').addEventListener('click', function () { setMode('nav'); });
  $('skUndo').addEventListener('click', undo);
  $('skRedo').addEventListener('click', redo);
  $('skPagesBtn').addEventListener('click', function () { var o = $('sk').classList.toggle('is-left-open'); this.setAttribute('aria-expanded', String(o)); });
  $('skRightBtn') && $('skRightBtn').addEventListener('click', function () { var o = $('sk').classList.toggle('is-right-open'); this.setAttribute('aria-expanded', String(o)); });
  function closeDrawers() { $('sk').classList.remove('is-left-open'); $('skPagesBtn').setAttribute('aria-expanded', 'false'); }
  $('skStage').addEventListener('pointerdown', function (e) { if (e.target === $('skScroll') || e.target === $('skSizer') || e.target === $('skWorld')) { endEdit(false); select(null); } closeDrawers(); });

  /* ================================================================ changes: what « Enregistrer » and « Publier » send */

  function changes() {
    var out = [];
    if (!site) return out;
    site.pages.forEach(function (p) {
      var d = docs.get(p.path);
      if (!d) return;
      if (!d.isNew && d.text === d.original) return;
      out.push({ path: d.path, kind: d.isNew ? 'added' : 'modified', encoding: 'utf-8', text: d.text, original: d.original, baseSha: d.isNew ? null : d.baseSha, bytes: C.utf8(d.text), stats: C.lineStats(d.original || '', d.text) });
    });
    var refd = referencedUploads();
    uploads.forEach(function (u, p) { if (refd.has(p)) out.push({ path: p, kind: 'image', encoding: 'base64', bytes: u.bytes, mime: u.mime, baseSha: null }); });
    return out;
  }
  function diffText(a, b) {
    var x = (a || '').split('\n'), y = b.split('\n');
    var p = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    var q = 0;
    while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
    var out = [];
    for (var i = Math.max(0, p - 3); i < p; i++) out.push('<span class="c">  ' + esc(x[i]) + '</span>');
    for (i = p; i < x.length - q; i++) out.push('<span class="d">− ' + esc(x[i]) + '</span>');
    for (i = p; i < y.length - q; i++) out.push('<span class="a">+ ' + esc(y[i]) + '</span>');
    for (i = x.length - q; i < Math.min(x.length, x.length - q + 3); i++) out.push('<span class="c">  ' + esc(x[i]) + '</span>');
    return out.join('');
  }
  function fileRows(list, withChecks) {
    var box = ce('div', 'sk-files');
    list.forEach(function (c, k) {
      var r = ce('div', 'sk-file');
      r.innerHTML = (withChecks ? '<input type="checkbox" checked data-file="' + k + '" aria-label="Publier ' + esc(c.path) + '">' : '') +
        '<code title="' + esc(c.path) + '">' + esc(c.path) + '</code>' +
        (c.kind === 'image' ? '<small>image · ' + Math.round(c.bytes.length / 1024) + NB + 'ko</small>' :
          '<small>' + (c.kind === 'added' ? 'nouvelle · ' : '') + '<span class="sk-add">+' + c.stats.added + '</span> <span class="sk-del">−' + c.stats.removed + '</span></small>') +
        (c.kind !== 'image' ? '<button class="sk-linkbtn" type="button" data-diff="' + k + '">Voir</button>' : '');
      box.appendChild(r);
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-diff]');
      if (!b) return;
      var c = list[+b.getAttribute('data-diff')];
      var pre = b.parentNode.nextSibling && b.parentNode.nextSibling.classList && b.parentNode.nextSibling.classList.contains('sk-diff') ? b.parentNode.nextSibling : null;
      if (pre) { pre.remove(); return; }
      pre = ce('pre', 'sk-diff', diffText(c.original, c.text));
      b.parentNode.after(pre);
    });
    return box;
  }
  function showChanges() {
    if (!site) return;
    endEdit(false);
    persist().then(function () {
      var list = changes();
      var box = ce('div');
      if (!list.length) {
        box.innerHTML = '<p>Aucune modification sur ce site pour l’instant.</p>';
      } else {
        box.innerHTML = '<p>Vos modifications sont gardées sur cet appareil. Voici les fichiers qui partiront à la publication (tout le reste du site reste identique, octet pour octet) :</p>';
        box.appendChild(fileRows(list, false));
        var act = ce('div', 'sk-actions');
        var dis = ce('button', 'sk-ghost', 'Abandonner ces modifications'); dis.type = 'button';
        dis.addEventListener('click', function () { if (confirm('Abandonner toutes les modifications non publiées de ce site ?')) discardAll(); });
        var pub = ce('button', 'sk-primary', 'Publier…'); pub.type = 'button';
        pub.addEventListener('click', function () { closeModal(); openPublish(); });
        act.appendChild(dis); act.appendChild(pub);
        box.appendChild(act);
      }
      openModal('Enregistré · ' + plural(list.length, 'fichier modifié', 'fichiers modifiés'), box);
    });
  }
  $('skChanges').addEventListener('click', showChanges);
  function discardAll() {
    docs.forEach(function (d) { DB.del(docKey(site, d.path)); });
    uploads.forEach(function (u, p) { DB.del(site.id + '|img|' + p); });
    closeModal();
    var id = site.id, p = cur && !cur.isNew ? cur.path : null;
    site = null;
    openSite(M.sites.find(function (s) { return s.id === id; }), p);
    toast('Modifications abandonnées.', 'info');
  }
  function openPublish() {
    endEdit(false);
    if (!window.JeereSitesPublish) { toast('Le module de publication ne s’est pas chargé.', 'err'); return; }
    persist().then(function () { window.JeereSitesPublish.open(); });
  }
  $('skPublish').addEventListener('click', openPublish);

  // after a publish: what was sent is now the branch's version
  function markPublished(files, target) {
    var shas = new Map((files || []).map(function (f) { return [f.path, f.sha]; }));
    if (target !== 'live') return Promise.resolve();
    docs.forEach(function (d) {
      if (!shas.has(d.path)) return;
      d.original = d.text;
      d.baseSha = shas.get(d.path) || d.baseSha;
      if (d.isNew) { d.isNew = false; var pg = pageByPath(d.path); if (pg) { pg.isNew = false; pg.sha = d.baseSha; } }
    });
    shas.forEach(function (s, p) { if (uploads.has(p)) { DB.del(site.id + '|img|' + p); uploads.delete(p); } });
    return persist().then(function () { refreshAll(); });
  }

  /* ================================================================ public API (publish module + tests) */

  window.JeereSites = {
    demo: DEMO, local: LOCAL, root: ROOT,
    config: CFG,
    manifest: function () { return M; },
    site: function () { return site; },
    page: function () { return cur && { path: cur.path, text: cur.text, original: cur.original, baseSha: cur.baseSha, isNew: cur.isNew, undo: cur.undo.length, redo: cur.redo.length }; },
    doc: function (p) { var d = docs.get(p); return d && { path: d.path, text: d.text, original: d.original, baseSha: d.baseSha, isNew: d.isNew }; },
    frames: function () { return frames.map(function (f) { return { key: f.key, ready: f.ready, direct: f.direct }; }); },
    frameDoc: function (k) { var f = frames.find(function (x) { return x.key === String(k); }); return f && f.doc; },
    ready: function () { return !!cur && frames.length > 0 && frames.every(function (f) { return f.ready; }); },
    selectLive: function (k, el) { var f = frames.find(function (x) { return x.key === String(k); }); if (f && el) select(el, f); return !!sel; },
    selection: function () { var s = srcOf(); return s ? { tag: s.tag, start: s.start, end: s.end, html: cur.text.slice(s.start, s.end), frame: sel.frame.key } : null; },
    startEdit: function () { if (sel) startEdit(sel.el, sel.frame); return !!editing; },
    endEdit: function () { endEdit(false); },
    isEditing: function () { return !!editing; },
    setTab: setTab,
    style: function (prop, value) { var s = srcOf(); return s ? opStyle(s, prop, value) : false; },
    setLink: function (href, target) { var s = srcOf(); if (!s) return false; var list = [{ src: s, name: 'href', value: href }]; if (target !== undefined) list.push({ src: s, name: 'target', value: target }); return opAttrs(list, 'Lien'); },
    setImageFromSite: function (rel) { var s = srcOf(); if (!s) return false; setImage(s, sel.el, rel, rel); return true; },
    hide: opHide, duplicate: opDuplicate, remove: opDelete, applyCode: function (html) { var s = srcOf(); if (s) opOuter(s, html); },
    seo: function (field, value) { return opSEO(field, value); },
    readSEO: function () { return cur ? C.readSEO(cur.tree) : null; },
    undo: undo, redo: redo,
    changes: changes, persist: persist, showChanges: showChanges, openPublish: openPublish,
    markPublished: markPublished, pageLiveUrl: function (p) { return pageLiveUrl(site, p || cur.page); },
    addPage: addPage, openPage: function (p) { location.hash = '#/site/' + site.id + '/' + p; },
    who: function () { return who; }, callFn: callFn, sessionToken: sessionToken,
    toast: toast, openModal: openModal, closeModal: closeModal, fileRows: fileRows, esc: esc, ce: ce, plural: plural,
    setMode: setMode, uploads: function () { return Array.from(uploads.keys()); }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
