/* Jeere Studio › « Tous mes sites » — every site she has made, in the dashboard's look (../../admin/admin.css).
 *
 * One grid, two kinds of card, told apart by the small icon in the corner of each:
 *   - « Boutique en ligne » (storefront): her Jeere boutiques — the one of this browser (the fiche the Studio
 *     edits, localStorage) and, with a real session, every row of public.stores she owns (rpc my_stores) —
 *     and the websites that sell through Jeere (sites.json « commerce », set by build-manifest.mjs from the
 *     pages: jeere-connect.js / data-store);
 *   - « Site web » (globe): the other websites of kreeative/kreeative- (sites.json), only for an editor of
 *     public.site_editors (the `sites-publish` Edge Function, whoami — the same door as ../sites/entry.js)
 *     or in demo mode on a local host (?demo=1).
 * A boutique opens in the Studio (../), a website in the website editor (../sites/#/site/<id>): one app,
 * one chrome. Opening another boutique than this browser's replaces its fiche: said first, and the
 * previous one is kept aside ('jeere-studio-config-previous').
 * Filters: Tous / Boutiques en ligne / Sites web, and a search. Nothing here writes to a site. */
(function () {
  'use strict';

  var doc = document;
  function $(id) { return doc.getElementById(id); }
  var NB = ' ';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + NB + (n > 1 ? many : one); }
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fmtDate(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.getDate() + NB + MONTHS[d.getMonth()] + NB + d.getFullYear() : ''; }
  function ico(n) { return '<svg class="a-ico" aria-hidden="true"><use href="#' + n + '"/></svg>'; }

  var D = window.JEERE_DATA || {};
  var A = window.JeereAuth;
  var CFG = (A && A.CONFIG) || { url: 'https://aezchxfvzfoqlvzchqyk.supabase.co', key: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', storageKey: 'sb-aezchxfvzfoqlvzchqyk-auth-token' };
  var HOST = location.hostname;
  var LOCAL = location.protocol === 'file:' || HOST === 'localhost' || HOST === '127.0.0.1' || HOST === '[::1]';
  var DEMO = LOCAL && (/[?&](demo=1|sites=demo)\b/.test(location.search) || (function () { try { return localStorage.getItem('jeere-sites-demo') === '1'; } catch (e) { return false; } })());
  var Q = DEMO ? '?demo=1' : '';
  var CONFIG_KEY = (D.STORAGE_KEYS && D.STORAGE_KEYS.config) || 'jeere-studio-config';

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function address(slug) { return D.storeAddress ? D.storeAddress(slug) : 'jeere.kreeative.xyz/b/' + slug; }

  /* ---------------------------------------------------------------- small UI: toasts, the dialog */
  function toast(msg) {
    var box = $('ms-toasts'), t = doc.createElement('div');
    t.className = 'a-toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function confirmBox(title, html, okLabel) {
    var dlg = $('ms-dialog');
    dlg.innerHTML = '<div class="a-dialog__card" role="alertdialog" aria-labelledby="ms-dialog-t">' +
      '<div class="a-dialog__head"><h2 class="a-dialog__title" id="ms-dialog-t">' + esc(title) + '</h2><button class="a-ibtn" type="button" data-close aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<div class="a-dialog__body"><p class="a-text">' + html + '</p></div>' +
      '<div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="button" data-ok>' + esc(okLabel) + '</button></div></div>';
    return new Promise(function (res) {
      function done(v) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } res(v); }
      dlg.onclick = function (e) { if (e.target === dlg || e.target.closest('[data-close]')) done(false); else if (e.target.closest('[data-ok]')) done(true); };
      dlg.oncancel = function (e) { e.preventDefault(); done(false); };
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      var ok = dlg.querySelector('[data-ok]'); if (ok) ok.focus();
    });
  }

  /* ---------------------------------------------------------------- the account */
  function session() {
    if (A && typeof A.session === 'function') {
      return Promise.resolve(A.session()).then(function (s) { return s && s.access_token ? s : null; }, function () { return null; });
    }
    var raw = readJSON(CFG.storageKey);
    var t = raw && (raw.access_token || (raw.currentSession && raw.currentSession.access_token));
    return Promise.resolve(t ? { access_token: t, user: raw.user || null } : null);
  }
  function rest(path, token, opts) {
    opts = opts || {};
    var h = { apikey: CFG.key, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch(CFG.url + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
  }
  function showAccount(s) {
    var u = s && s.user, name = (u && ((u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || u.email)) || '';
    var acct = readJSON('jeere-account');
    if (!name && acct) name = acct.name || acct.firstName || '';
    if (name) { $('ms-acct-name').textContent = name; $('ms-acct-initial').textContent = name.trim().charAt(0).toUpperCase(); }
  }

  /* ---------------------------------------------------------------- may she see the websites? */
  function isEditor(s) {
    if (DEMO) return Promise.resolve(true);
    var cached = null;
    try { cached = sessionStorage.getItem('jeere-sites-editor'); } catch (e) { /* ok */ }
    if (cached === '1') return Promise.resolve(true);
    if (cached === '0' || !s) return Promise.resolve(false);
    return fetch(CFG.url + '/functions/v1/sites-publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify({ action: 'whoami' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      try { sessionStorage.setItem('jeere-sites-editor', j && j.editor ? '1' : '0'); } catch (e) { /* ok */ }
      return !!(j && j.editor);
    }, function () { return false; });
  }

  /* ---------------------------------------------------------------- her websites (../sites/sites.json) */
  function pendingBySite() {
    return new Promise(function (res) {
      var out = new Map();
      if (!window.indexedDB) { res(out); return; }
      var r;
      try { r = indexedDB.open('jeere-sites', 1); } catch (e) { res(out); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore('pending', { keyPath: 'key' }); };
      r.onerror = function () { res(out); };
      r.onsuccess = function () {
        try {
          var q = r.result.transaction('pending', 'readonly').objectStore('pending').getAll();
          q.onsuccess = function () { (q.result || []).forEach(function (x) { if (x.kind === 'page') out.set(x.siteId, (out.get(x.siteId) || 0) + 1); }); res(out); };
          q.onerror = function () { res(out); };
        } catch (e) { res(out); }
      };
    });
  }
  var LIVE = [
    { id: 'the-ivory-sukundu', kind: 'shop', title: 'The Ivory Sukundu', label: 'Boutique en ligne · theivorysukundu.com', live: 'https://www.theivorysukundu.com/',
      manage: '../../admin/#boutique=tishe', manageLabel: 'Gérer la boutique' },
    { id: 'rich-and-friends', kind: 'site', title: 'Rich & Friends', label: 'En ligne · richandfriends.xyz', live: 'https://richandfriends.xyz/' },
    { id: 'keewal-meere', kind: 'site', title: 'Keewal Meere', label: 'En ligne · keewaomeere.vercel.app', live: 'https://keewaomeere.vercel.app/' },
    { id: 'the-bakery', kind: 'site', title: 'The Bakery', label: 'En ligne · the-bakery-concept.vercel.app', live: 'https://the-bakery-concept.vercel.app/' },
    { id: 'cameleon', kind: 'site', title: 'Caméléon', label: 'En ligne · cameleon-concept.vercel.app', live: 'https://cameleon-concept.vercel.app/' },
    { id: 'guillemot', kind: 'site', title: 'Guillemot', label: 'En ligne · guillemot.vercel.app', live: 'https://guillemot.vercel.app/' },
    { id: 'tabouret', kind: 'site', title: 'Tabouret', label: 'En ligne · tabouret.vercel.app', live: 'https://tabouret.vercel.app/' }
  ];
  function siteCards() {
    return Promise.all([fetch('../sites/sites.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }), pendingBySite()]).then(function (res) {
      var M = res[0], pend = res[1], list = M.sites || [];
      var main = list.find(function (x) { return x.kind === 'kreeative'; });
      // kreeative.xyz and the folders it serves are ONE site (its pages in sections): one card counts them all.
      // Only a site of its own (sites.json « ownSite »: Jessica's Secrets, Joshua Cooker, Aïssa Kee…) has a card
      var members = main ? list.filter(function (x) { return x !== main && x.path && !x.ownSite && ((!x.onlyOnBranch && x.branch === main.branch) || /^(websites|concepts|portfolio)\//.test(x.path)); }) : [];
      var cards = [];
      function card(s, extra) {
        var com = !!s.commerce;
        return Object.assign({
          id: s.id, kind: com ? 'shop' : 'site', title: s.title.replace(/\s+·\s+.*$/, ''), label: s.kindLabel || '',
          thumb: '../sites/' + s.thumbnail, href: '../sites/' + Q + '#/site/' + s.id,
          live: s.liveUrl || null, external: s.externalUrl && s.externalUrl !== s.liveUrl ? s.externalUrl : null,
          pages: s.pages.length, updated: s.updated && s.updated.date, pending: pend.get(s.id) || 0,
          branch: s.onlyOnBranch ? s.branch : null, hay: s.title + ' ' + s.path + ' ' + (s.kindLabel || '')
        }, extra || {});
      }
      if (main) {
        var all = [main].concat(members), pg = all.reduce(function (n, x) { return n + x.pages.length; }, 0);
        var upd = all.reduce(function (d, x) { return x.updated && x.updated.date && (!d || x.updated.date > d) ? x.updated.date : d; }, null);
        cards.push(card(main, { title: 'Kreeative', label: 'Studio de design · kreeative.xyz', pages: pg, updated: upd, sub: members.length,
          pending: all.reduce(function (n, x) { return n + (pend.get(x.id) || 0); }, 0) }));
      }
      list.forEach(function (s) {
        if (s === main || members.indexOf(s) >= 0) return; // pages of kreeative.xyz (Websites I built, case studies, mini-audits), not sites
        cards.push(card(s));
      });
      // her sites already online, each in its own project (not in this repository): a card each, The Ivory Sukundu first
      var live = LIVE.map(function (x) {
        return Object.assign({ thumb: '../sites/thumbs/live--' + x.id + '.webp', href: x.manage || x.live, ext: !x.manage || /^https?:/.test(x.manage), hay: x.live + ' ' + (x.label || '') }, x, { id: 'live--' + x.id });
      });
      return { cards: live.concat(cards), generated: M.generated };
    });
  }

  /* ---------------------------------------------------------------- her boutiques */
  function shopCards(s) {
    var cfg = readJSON(CONFIG_KEY), pub = (window.JeerePublish && window.JeerePublish.local && window.JeerePublish.local()) || readJSON('jeere-publish') || {};
    var cards = [];
    var here = cfg && cfg.store ? {
      id: 'local', kind: 'shop', title: cfg.store.name || 'Ma boutique', label: 'Boutique Jeere · ce navigateur',
      logo: cfg.store.logo || null, href: '../', here: true,
      live: pub.published && pub.slug ? 'https://' + address(pub.slug) : null, addr: pub.slug ? address(pub.slug) : '',
      pages: (cfg.pages || []).length, storeId: pub.storeId || '', hay: (cfg.store.name || '') + ' ' + (pub.slug || '')
    } : null;
    if (here) cards.push(here);
    if (!s) return Promise.resolve(cards);
    return rest('/rest/v1/rpc/my_stores', s.access_token, { method: 'POST', body: {} }).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      var others = rows.filter(function (r) { return !here || r.id !== here.storeId; });
      if (here) { var mine = rows.find(function (r) { return r.id === here.storeId; }); if (mine) { here.updated = mine.updated_at; if (mine.published) here.live = 'https://' + address(mine.slug); } }
      if (!others.length) return cards;
      return rest('/rest/v1/stores?select=id,name:fiche->store->>name&id=in.(' + others.map(function (r) { return r.id; }).join(',') + ')', s.access_token).then(function (names) {
        var byId = new Map((names || []).map(function (n) { return [n.id, n.name]; }));
        others.forEach(function (r) {
          cards.push({ id: r.id, kind: 'shop', title: byId.get(r.id) || r.slug, label: 'Boutique Jeere', addr: address(r.slug),
            live: r.published ? 'https://' + address(r.slug) : null, updated: r.updated_at, href: '../', row: r, hay: (byId.get(r.id) || '') + ' ' + r.slug });
        });
        return cards;
      });
    });
  }
  // another boutique of hers into the Studio: the fiche of this browser makes way (kept aside, said first)
  function openShop(c) {
    var cfg = readJSON(CONFIG_KEY), cur = cfg && cfg.store && cfg.store.name;
    confirmBox('Ouvrir « ' + c.title + ' » dans le Studio', 'Le Studio de ce navigateur modifie une boutique à la fois' + (cur ? ' (en ce moment : <strong>' + esc(cur) + '</strong>, mise de côté sur cet appareil)' : '') + '. La version en ligne de « ' + esc(c.title) + ' » s’ouvre à sa place.', 'Ouvrir dans le Studio').then(function (ok) {
      if (!ok) return;
      session().then(function (s) {
        if (!s) { toast('Connectez-vous pour ouvrir cette boutique.'); return null; }
        return rest('/rest/v1/stores?select=id,slug,fiche,published,published_at&id=eq.' + encodeURIComponent(c.id) + '&limit=1', s.access_token).then(function (rows) {
          var row = rows && rows[0];
          if (!row || !row.fiche) { toast('Cette boutique n’a pas pu être lue. Réessayez.'); return; }
          try {
            if (cfg) localStorage.setItem(CONFIG_KEY + '-previous', JSON.stringify(cfg));
            localStorage.setItem(CONFIG_KEY, JSON.stringify(row.fiche));
            var u = s.user && s.user.id;
            localStorage.setItem('jeere-publish', JSON.stringify({ version: 1, slug: row.slug, storeId: row.id, ownerId: u || '', published: !!row.published, publishedAt: row.published_at || '', hash: '' }));
          } catch (e) { toast('Ce navigateur n’a pas pu garder la boutique (stockage plein ?).'); return; }
          location.href = '../';
        });
      });
    });
  }

  /* ---------------------------------------------------------------- the grid */
  var items = [], filter = 'all', query = '', generated = null, editor = false;
  function matches(c) {
    if (filter !== 'all' && c.kind !== filter) return false;
    return !query || (c.title + ' ' + (c.hay || '')).toLowerCase().indexOf(query.toLowerCase()) >= 0;
  }
  function cardHTML(c) {
    var shop = c.kind === 'shop';
    var type = shop ? 'Boutique en ligne' : 'Site web';
    var shot = c.thumb ? '<img loading="lazy" alt="" src="' + esc(c.thumb) + '" onerror="this.remove()">'
      : '<span class="ms-card__mono">' + (c.logo ? '<img alt="" src="' + esc(c.logo) + '">' : esc((c.title || '?').trim().charAt(0).toUpperCase())) + '</span>';
    var meta = [c.label];
    if (c.pages) meta.push(plural(c.pages, 'page', 'pages'));
    if (c.updated) meta.push('Modifié le ' + fmtDate(c.updated));
    var chips = '';
    if (c.pending) chips += '<span class="a-chip a-tone--warn">' + plural(c.pending, 'page modifiée', 'pages modifiées') + '</span>';
    if (c.branch) chips += '<span class="a-chip a-tone--info">Version de travail</span>';
    if (c.here) chips += '<span class="a-chip a-chip--line">Dans le Studio</span>';
    var links = c.live ? '<a class="a-link ms-card__live" href="' + esc(c.live) + '" target="_blank" rel="noopener">Voir en ligne' + ico('i-external') + '</a>'
      : '<span class="a-small a-muted">Pas encore en ligne</span>';
    if (c.manage) { var out = /^https?:/.test(c.manage); links = '<a class="a-link ms-card__live" href="' + esc(c.manage) + '"' + (out ? ' target="_blank" rel="noopener"' : '') + '>' + esc(c.manageLabel || 'Gérer') + (out ? ico('i-external') : '') + '</a>' + links; }
    if (c.external) links += '<a class="a-link ms-card__live" href="' + esc(c.external) + '" target="_blank" rel="noopener" title="Le site déployé à part (son propre projet)">Site du client' + ico('i-external') + '</a>';
    return '<li class="a-card a-card--flush ms-card" data-kind="' + c.kind + '" data-id="' + esc(c.id) + '">' +
      '<a class="ms-card__open" href="' + esc(c.href) + '" data-open="' + esc(c.id) + '"' + (c.ext ? ' target="_blank" rel="noopener"' : '') + ' aria-label="' + (c.manage ? 'Gérer ' + esc(c.title) + ' (tableau de bord)' : c.ext ? 'Ouvrir ' + esc(c.title) + ' en ligne' : 'Ouvrir ' + esc(c.title) + ' dans le Studio (' + type + ')') + '">' +
        '<span class="ms-card__shot">' + shot + '</span>' +
        '<span class="ms-card__body"><span class="a-card__title ms-card__title">' + esc(c.title) + '</span>' +
        '<span class="a-card__sub ms-card__meta">' + esc(meta.filter(Boolean).join(' · ')) + '</span>' +
        (c.sub ? '<span class="a-small a-muted">dont ' + plural(c.sub, 'page de projet (site réalisé, étude de cas, mini-audit)', 'pages de projets : sites réalisés, études de cas, mini-audits') + '</span>' : '') +
        (c.addr && !c.live ? '<span class="a-small a-muted">' + esc(c.addr) + '</span>' : '') +
        '</span></a>' +
      '<span class="ms-card__type ms-card__type--' + c.kind + '" role="img" aria-label="' + type + '" title="' + type + '" data-tip="' + type + '">' + ico(shop ? 'i-store' : 'i-globe') + '</span>' +
      (chips ? '<span class="ms-card__chips">' + chips + '</span>' : '') +
      '<span class="ms-card__foot">' + links + '</span>' +
      '</li>';
  }
  function render() {
    var list = items.filter(matches), g = $('ms-grid');
    g.innerHTML = list.map(cardHTML).join('');
    g.setAttribute('aria-busy', 'false');
    ['all', 'shop', 'site'].forEach(function (k) {
      var n = items.filter(function (c) { return k === 'all' || c.kind === k; }).length, el = doc.querySelector('[data-n="' + k + '"]');
      if (el) el.textContent = n;
    });
    var empty = $('ms-empty');
    empty.hidden = !!list.length;
    if (!list.length) {
      empty.innerHTML = '<span class="a-empty__ico">' + ico(filter === 'shop' ? 'i-store' : 'i-globe') + '</span>' +
        '<p class="a-empty__title">' + (items.length ? 'Aucun site ne correspond' : 'Pas encore de site') + '</p>' +
        '<p class="a-empty__text">' + (items.length ? 'Essayez un autre mot, ou « Tous ».' : 'Créez votre boutique&nbsp;: elle apparaîtra ici, prête à ouvrir dans le Studio.') + '</p>' +
        (items.length ? '' : '<div class="a-btnrow"><a class="a-btn a-btn--primary" href="../../creer/">Créer ma boutique</a><a class="a-btn a-btn--ghost" href="../../compte/#connexion">Se connecter</a></div>');
    }
    var nShop = items.filter(function (c) { return c.kind === 'shop'; }).length, nSite = items.length - nShop;
    $('ms-foot').textContent = items.length ? plural(nShop, 'boutique en ligne', 'boutiques en ligne') + ' · ' + plural(nSite, 'site web', 'sites web') +
      (generated ? ' · liste des sites du ' + fmtDate(generated) : '') : '';
  }
  $('ms-filters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.getAttribute('data-f');
    this.querySelectorAll('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    render();
  });
  // the search: in the top bar on a computer (as the dashboard's), above the grid on a phone
  doc.querySelectorAll('[data-q]').forEach(function (inp) {
    inp.addEventListener('input', function () {
      query = this.value.trim();
      doc.querySelectorAll('[data-q]').forEach(function (o) { if (o !== inp) o.value = inp.value; });
      render();
    });
  });
  function searchBox() { return innerWidth >= 960 ? $('ms-q-top') : $('ms-q'); }
  $('ms-grid').addEventListener('click', function (e) {
    var a = e.target.closest('[data-open]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    var c = items.find(function (x) { return x.id === a.getAttribute('data-open'); });
    if (c && c.row) { e.preventDefault(); openShop(c); }
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(doc.activeElement.tagName)) { e.preventDefault(); searchBox().focus(); }
  });

  /* ---------------------------------------------------------------- boot */
  function boot() {
    if (DEMO) {
      $('ms-demo').hidden = false;
      $('ms-demo-note').hidden = false;
      $('ms-demo').addEventListener('click', function () { toast('Mode démo : la liste des sites de ce dépôt, sans compte. Rien n’est envoyé.'); });
    }
    var cfg = readJSON(CONFIG_KEY);
    if (cfg && cfg.store) {
      $('ms-storecard').hidden = false;
      $('ms-store-name').textContent = cfg.store.name || 'Ma boutique';
      $('ms-store-av').textContent = (cfg.store.name || 'M').trim().charAt(0).toUpperCase();
      var pub = readJSON('jeere-publish');
      $('ms-store-url').textContent = pub && pub.slug ? address(pub.slug) : 'Pas encore en ligne';
    }
    session().then(function (s) {
      showAccount(s);
      return Promise.all([isEditor(s), shopCards(s).catch(function () { return []; })]).then(function (r) {
        editor = r[0];
        var shops = r[1];
        if (!editor) return { shops: shops, sites: { cards: [] } };
        return siteCards().then(function (x) { return { shops: shops, sites: x }; }, function () { return { shops: shops, sites: { cards: [] } }; });
      });
    }).then(function (res) {
      generated = res.sites.generated || null;
      // her own work first: the sites, then the boutiques (the e-commerce sites are among them, by their icon)
      // her designs that sell through a Jeere store: one card, the site's, with « Gérer la boutique » (its Jeere
      // store in the dashboard); the store's own card would only say the same thing twice
      var LINKED = { 'concepts--joshua-cooker': 'joshua-cooker', 'concepts--sonia-luxury-hair': 'sonia-luxury-hair', 'websites--the-ivory-sukundu': 'tishe' };
      var norm = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); };
      var linkedNames = {}, linkedSlugs = {};
      res.sites.cards.forEach(function (c) {
        var slug = LINKED[c.id];
        if (!slug) return;
        if (!c.manage) { c.manage = '../../admin/#boutique=' + slug; c.manageLabel = 'Gérer la boutique'; }
        c.kind = 'shop';
        linkedNames[norm(c.title)] = 1; linkedSlugs[slug] = 1;
      });
      var shops = res.shops.filter(function (c) {
        var slug = (c.row && c.row.slug) || (c.addr || '').split('/').pop();
        return !linkedSlugs[slug] && !linkedNames[norm(c.title)];
      });
      // The Ivory Sukundu has its live card (live--…): its case-study copy in the repository does not need one more
      var cards = res.sites.cards.filter(function (c) { return c.id !== 'websites--the-ivory-sukundu'; });
      items = cards.concat(shops);
      $('ms-sub').innerHTML = editor
        ? 'Les sites que vous avez faits et vos boutiques Jeere. Ouvrez-en un&nbsp;: il s’ouvre dans le Studio, prêt à modifier.'
        : 'Vos boutiques Jeere. Ouvrez-en une&nbsp;: elle s’ouvre dans le Studio, prête à modifier.';
      render();
    });
  }
  window.JeereMesSites = { items: function () { return items.slice(); }, setFilter: function (f) { var b = doc.querySelector('#ms-filters [data-f="' + f + '"]'); if (b) b.click(); } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
