/*
 * Jeere — publish.js: publishing a store for real (classic script, deferred, no library).
 * Global: window.JeerePublish. Loaded after data.js by the editor (creer/), the Studio (../studio/),
 * the dashboard (../admin/) and the public store page (../b/). Styles: publish.css (scoped under .jp).
 *
 * A published store is a row of public.stores in the Supabase project « Jeere » (migration
 * create_jeere_stores): its address (slug), its fiche boutique (jsonb, 1 MB max), published, show_badge.
 * Anyone reads published rows with the publishable key; only the owner (auth.uid()) writes, so
 * publishing needs a signed-in Supabase user. The session is read, in this order, from
 *   1. window.JeereAuth.getSession()       → { access_token, user } (the account page's auth module)
 *   2. window.jeereSupabase.auth.getSession() (a supabase-js client, if a page made one)
 *   3. localStorage['sb-aezchxfvzfoqlvzchqyk-auth-token'] (where supabase-js keeps the session)
 * Without a session the dialog says the store is saved in this browser only, and still lets the
 * seller pick (and check) her address.
 *
 *   JeerePublish.checkSlug(s)           → { ok, code, message }   (the rules of JEERE_DATA.checkStoreSlug)
 *   JeerePublish.normalizeInput(s)      → what the address field shows as she types
 *   JeerePublish.available(slug)        → Promise { available, reason, message }   (rpc slug_available)
 *   JeerePublish.suggestions(cfg, n)    → Promise [slug]: free addresses made from the store's name and city
 *   JeerePublish.session()              → Promise { token, userId } | null
 *   JeerePublish.publish(cfg, slug)     → Promise { ok, store } | { ok: false, code, message }
 *   JeerePublish.unpublish()            → Promise { ok } | { ok: false, code, message }
 *   JeerePublish.history()              → Promise { ok, versions: [{ id, slug, published_at, bytes }] } (last 10)
 *   JeerePublish.restore(versionId)     → Promise { ok, fiche } : that version is live again (a new version too)
 *   JeerePublish.fetchPublished({ slug } | { host }) → Promise { ok, store } | { ok: false, code: 'notfound' | 'network' }
 *   JeerePublish.mount(el, { getConfig, theme, showScore, onClose, onRestore(fiche) }) → the panel (address,
 *        publish, live link, draft / live state, the published versions with « Restaurer »)
 *   JeerePublish.local()                → this browser's record, 'jeere-publish':
 *        { version: 1, slug, storeId, ownerId, published, publishedAt, hash }
 */
(function () {
  'use strict';

  var D = window.JEERE_DATA || {};
  var SB_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var SB_STORAGE = 'sb-aezchxfvzfoqlvzchqyk-auth-token';
  var LOCAL_KEY = 'jeere-publish';
  var MAX_BYTES = 960000; // the table allows 1 MiB of jsonb text: keep a margin for its spacing
  var NB = ' ';
  var PUBLIC_COLS = 'id,slug,fiche,show_badge,published,published_at,custom_domain,domain_status,updated_at';

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return str(v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function fr(s) { return str(s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function readLS(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function writeLS(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  /* ------------------------------------------------------------------ addresses */

  function address(slug) { return D.storeAddress ? D.storeAddress(slug) : 'jeere.kreeative.xyz/b/' + slug; }
  function url(slug) { return 'https://' + address(slug); }
  var PREFIX = (D.STORE_PREFIX != null ? D.STORE_PREFIX : 'jeere.kreeative.xyz/b/');

  var SLUG_MESSAGES = {
    empty: 'Choisissez une adresse, par exemple awa-beaute.',
    short: 'Trois caractères au moins.',
    long: '40 caractères au plus.',
    chars: 'Lettres sans accent (a à z), chiffres et tirets seulement.',
    hyphen: 'Pas de tiret au début, à la fin, ni deux à la suite.',
    reserved: 'Cette adresse est réservée à Jeere : choisissez-en une autre.',
    taken: 'Déjà prise par une autre boutique.',
    yours: 'C’est déjà l’adresse de votre boutique.',
    ok: 'Libre : elle est à vous si vous publiez maintenant.',
    format: 'Cette adresse ne suit pas les règles : lettres, chiffres et tirets, 3 à 40 caractères.',
    offline: 'Impossible de vérifier pour l’instant : vérifiez votre connexion.'
  };
  function checkSlug(s) {
    var code = D.checkStoreSlug ? D.checkStoreSlug(s) : (/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(str(s)) && str(s).indexOf('--') === -1 ? '' : 'chars');
    return { ok: !code, code: code || 'ok', message: fr(SLUG_MESSAGES[code || 'ok']) };
  }
  // As she types: lower case, no accents, spaces and underscores become hyphens, nothing else kept
  function normalizeInput(v) {
    var s = str(v);
    if (s.normalize) s = s.normalize('NFD');
    return s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+/, '').slice(0, 40);
  }

  /* ------------------------------------------------------------------ Supabase REST (no library) */

  function headers(token, extra) {
    var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function request(path, opts) {
    var o = opts || {};
    return fetch(SB_URL + path, { method: o.method || 'GET', headers: headers(o.token, o.headers), body: o.body == null ? undefined : JSON.stringify(o.body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var b = null;
          try { b = t ? JSON.parse(t) : null; } catch (e) { b = t; }
          return { ok: r.ok, status: r.status, body: b };
        });
      }, function () { return { ok: false, status: 0, body: null }; });
  }

  function session() {
    var tries = [];
    try {
      if (window.JeereAuth && typeof window.JeereAuth.getSession === 'function') tries.push(function () { return Promise.resolve(window.JeereAuth.getSession()); });
    } catch (e) { /* ignore */ }
    try {
      var c = window.jeereSupabase || window.JeereSupabase;
      if (c && c.auth && typeof c.auth.getSession === 'function') tries.push(function () { return c.auth.getSession().then(function (r) { return r && r.data ? r.data.session : null; }); });
    } catch (e) { /* ignore */ }
    tries.push(function () {
      var raw = readLS(SB_STORAGE);
      var s = null;
      try { s = JSON.parse(raw); } catch (e) { s = null; }
      if (s && isObj(s.currentSession)) s = s.currentSession; // older supabase-js shape
      return Promise.resolve(s);
    });
    var i = 0;
    function next() {
      if (i >= tries.length) return Promise.resolve(null);
      var f = tries[i++];
      return f().then(function (s) {
        var token = s && (s.access_token || (s.session && s.session.access_token));
        var user = s && (s.user || (s.session && s.session.user));
        var exp = s && Number(s.expires_at || (s.session && s.session.expires_at));
        if (token && (!exp || exp * 1000 > Date.now() + 30000)) return { token: token, userId: user && user.id ? String(user.id) : '' };
        return next();
      }, next);
    }
    return next();
  }

  function local() {
    var o = null;
    try { o = JSON.parse(readLS(LOCAL_KEY)); } catch (e) { o = null; }
    if (!isObj(o)) return null;
    var slug = str(o.slug);
    return {
      version: 1,
      slug: checkSlug(slug).ok ? slug : '',
      storeId: /^[0-9a-f-]{36}$/i.test(str(o.storeId)) ? o.storeId : '',
      ownerId: str(o.ownerId),
      published: o.published === true,
      publishedAt: str(o.publishedAt),
      hash: str(o.hash)
    };
  }
  function saveLocal(rec) {
    var cur = local() || {};
    var next = { version: 1 };
    ['slug', 'storeId', 'ownerId', 'published', 'publishedAt', 'hash'].forEach(function (k) { next[k] = rec[k] !== undefined ? rec[k] : cur[k]; });
    writeLS(LOCAL_KEY, JSON.stringify(next));
    // The dashboard's address follows the published one (its « Domaine » page, the editor's frame)
    if (next.slug) {
      try {
        var adm = JSON.parse(readLS((D.STORAGE_KEYS && D.STORAGE_KEYS.admin) || 'jeere-admin'));
        if (isObj(adm) && isObj(adm.settings)) {
          adm.settings.subdomain = address(next.slug);
          adm.subdomainChosen = true;
          writeLS((D.STORAGE_KEYS && D.STORAGE_KEYS.admin) || 'jeere-admin', JSON.stringify(adm));
        }
      } catch (e) { /* no dashboard data yet */ }
    }
    try { window.dispatchEvent(new CustomEvent('jeere:published', { detail: next })); } catch (e) { /* old browser */ }
    return next;
  }

  // A short fingerprint of a fiche, to tell « your last changes are not online yet »
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36) + '.' + text.length.toString(36);
  }
  function ficheOf(cfg) {
    var c = cfg;
    try { if (D.normalizeConfig) c = D.normalizeConfig(cfg); } catch (e) { c = cfg; }
    return c;
  }
  function bytes(text) {
    try { return new Blob([text]).size; } catch (e) { return text.length; }
  }
  function badgeShown() {
    try { if (window.JeerePlans && typeof window.JeerePlans.badgeShown === 'function') return window.JeerePlans.badgeShown(); } catch (e) { /* default */ }
    return true;
  }

  function available(slug) {
    var c = checkSlug(slug);
    if (!c.ok) return Promise.resolve({ available: false, reason: c.code, message: c.message });
    return session().then(function (s) {
      return request('/rest/v1/rpc/slug_available', { method: 'POST', token: s && s.token, body: { p_slug: slug } });
    }).then(function (r) {
      if (!r.ok || !isObj(r.body)) return { available: null, reason: 'offline', message: fr(SLUG_MESSAGES.offline) };
      var reason = str(r.body.reason) || (r.body.available ? 'ok' : 'taken');
      var rec = local();
      // Her own published store (this browser) keeps its address even before she signs in again
      if (reason === 'taken' && rec && rec.slug === slug && rec.storeId) reason = 'yours';
      return { available: reason === 'ok' || reason === 'yours', reason: reason, message: fr(SLUG_MESSAGES[reason] || SLUG_MESSAGES.taken) };
    });
  }

  function suggestions(cfg, n) {
    var name = cfg && cfg.store ? cfg.store.name : '';
    var city = cfg && cfg.store ? cfg.store.city : '';
    var base = D.storeSlugFor ? D.storeSlugFor(name) : normalizeInput(name) || 'ma-boutique';
    var c = normalizeInput(city || 'abidjan');
    var cand = [base, base + '-ci', c && c !== base ? base + '-' + c : '', base + '-boutique', base + '-shop', base + '-' + String(new Date().getFullYear()).slice(2)]
      .map(function (s) { return s.slice(0, 40).replace(/-+$/, ''); })
      .filter(function (s, i, a) { return s && a.indexOf(s) === i && checkSlug(s).ok; });
    return Promise.all(cand.map(function (s) { return available(s).then(function (r) { return r.available ? s : ''; }); }))
      .then(function (list) { return list.filter(Boolean).slice(0, n || 3); });
  }

  function errorFrom(r) {
    var b = isObj(r.body) ? r.body : {};
    var code = str(b.code);
    if (r.status === 0) return { ok: false, code: 'network', message: 'Pas de connexion : votre boutique n’a pas été publiée. Réessayez.' };
    if (r.status === 401 || code === 'PGRST301' || code === 'PGRST302') return { ok: false, code: 'login', message: 'Votre session a expiré : reconnectez-vous, puis publiez.' };
    if (code === '23505') return { ok: false, code: 'taken', message: fr(SLUG_MESSAGES.taken) + ' Choisissez-en une autre.' };
    if (code === '23514' && /size/.test(str(b.message))) return { ok: false, code: 'too_big', message: fr('Votre boutique est trop lourde (1 Mo au plus) : allégez les photos.') };
    if (code === '23514') return { ok: false, code: 'format', message: fr(SLUG_MESSAGES.format) };
    if (code === 'P0001') return { ok: false, code: 'limit', message: str(b.message) || 'Vous avez déjà 10 boutiques.' };
    if (r.status === 413) return { ok: false, code: 'too_big', message: 'Votre boutique est trop lourde (1 Mo au plus) : allégez les photos.' };
    return { ok: false, code: 'server', message: 'La publication n’a pas marché (' + (r.status || 'réseau') + '). Réessayez dans un instant.' };
  }

  function myStores(token) {
    return request('/rest/v1/rpc/my_stores', { method: 'POST', token: token, body: {} }).then(function (r) { return r.ok && Array.isArray(r.body) ? r.body : []; });
  }

  // Publish (or update) the fiche at this address. Needs a session.
  function publish(cfg, slug) {
    var c = checkSlug(slug);
    if (!c.ok) return Promise.resolve({ ok: false, code: c.code, message: c.message });
    var fiche = ficheOf(cfg);
    var text = '';
    try { text = JSON.stringify(fiche); } catch (e) { return Promise.resolve({ ok: false, code: 'format', message: 'Cette fiche ne peut pas être lue.' }); }
    var badge = badgeShown();
    var M = window.JeereMedia;
    var media = { uploaded: 0, failed: 0 };
    return session().then(function (s) {
      if (!s) {
        var sz = bytes(text);
        if (sz > MAX_BYTES && !M) return { ok: false, code: 'too_big', size: sz, message: fr('Votre boutique pèse ' + (sz / 1e6).toFixed(1).replace('.', ',') + ' Mo, surtout à cause des photos : 0,9 Mo au plus. Retirez quelques photos, puis publiez.') };
        return { ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere pour publier : votre boutique est pour l’instant enregistrée dans ce navigateur seulement.' };
      }
      // Her photos still inline go to Storage first (media.js, wave 2): the published fiche holds URLs, so
      // the 1 MB of the table is text, not pictures. `text` stays the local fiche's (« not online yet »).
      var migrated = M && typeof M.migrate === 'function' ? M.migrate(fiche).then(function (r) { media = r; return r.fiche; }, function () { return fiche; }) : Promise.resolve(fiche);
      return migrated.then(function (pubFiche) {
        var out = '';
        try { out = JSON.stringify(pubFiche); } catch (e) { out = text; }
        var size = bytes(out);
        if (size > MAX_BYTES) {
          return { ok: false, code: 'too_big', size: size, message: fr('Votre boutique pèse ' + (size / 1e6).toFixed(1).replace('.', ',') + ' Mo, surtout à cause des photos' + (media.failed ? ' (' + media.failed + ' n’ont pas pu être envoyées : vérifiez votre connexion et réessayez)' : '') + ' : 0,9 Mo au plus. Retirez quelques photos, puis publiez.') };
        }
        return write(s, pubFiche);
      });
    });
    function write(s, pubFiche) {
      var rec = local();
      var body = { slug: slug, fiche: pubFiche, published: true, show_badge: badge };
      var sel = '?select=id,slug,published,published_at,show_badge,updated_at';
      var pickId = rec && rec.storeId && (!rec.ownerId || !s.userId || rec.ownerId === s.userId) ? Promise.resolve(rec.storeId)
        : myStores(s.token).then(function (rows) { var m = rows.filter(function (x) { return x.slug === slug; })[0] || rows[0]; return m ? m.id : ''; });
      return pickId.then(function (id) {
        var write = id
          ? request('/rest/v1/stores' + sel + '&id=eq.' + id, { method: 'PATCH', token: s.token, body: body, headers: { Prefer: 'return=representation' } })
          : Promise.resolve({ ok: true, status: 200, body: [] });
        return write.then(function (r) {
          if (r.ok && Array.isArray(r.body) && r.body[0]) return r;
          if (!r.ok) return r;
          return request('/rest/v1/stores' + sel, { method: 'POST', token: s.token, body: body, headers: { Prefer: 'return=representation' } });
        });
      }).then(function (r) {
        if (!r.ok || !Array.isArray(r.body) || !r.body[0]) return errorFrom(r);
        var row = r.body[0];
        saveLocal({ slug: row.slug, storeId: row.id, ownerId: s.userId, published: true, publishedAt: row.published_at || new Date().toISOString(), hash: hash(text) });
        return { ok: true, store: row, url: url(row.slug), media: media };
      });
    }
  }

  function unpublish() {
    var rec = local();
    if (!rec || !rec.storeId) return Promise.resolve({ ok: false, code: 'none', message: 'Cette boutique n’est pas en ligne.' });
    return session().then(function (s) {
      if (!s) return { ok: false, code: 'login', message: 'Connectez-vous pour retirer votre boutique de la ligne.' };
      return request('/rest/v1/stores?id=eq.' + rec.storeId + '&select=id,published', { method: 'PATCH', token: s.token, body: { published: false }, headers: { Prefer: 'return=representation' } })
        .then(function (r) {
          if (!r.ok) return errorFrom(r);
          saveLocal({ published: false });
          return { ok: true };
        });
    });
  }

  /* Publish history (wave 2 of the Studio audit, table store_versions, migration jeere_wave2): the last 10
   * published fiches of her store, newest first, and « Restaurer » = publish that version again. */
  function history() {
    var rec = local();
    if (!rec || !rec.storeId) return Promise.resolve({ ok: false, code: 'none', versions: [] });
    return session().then(function (s) {
      if (!s) return { ok: false, code: 'login', versions: [] };
      return request('/rest/v1/rpc/store_history', { method: 'POST', token: s.token, body: { p_store: rec.storeId } }).then(function (r) {
        if (!r.ok || !Array.isArray(r.body)) return { ok: false, code: r.status === 404 ? 'unavailable' : 'server', versions: [] };
        return { ok: true, versions: r.body };
      });
    });
  }
  function restore(versionId) {
    var rec = local();
    if (!rec || !rec.storeId) return Promise.resolve({ ok: false, code: 'none', message: 'Cette boutique n’est pas en ligne.' });
    return session().then(function (s) {
      if (!s) return { ok: false, code: 'login', message: 'Connectez-vous pour restaurer une version.' };
      return request('/rest/v1/store_versions?select=fiche,published_at&id=eq.' + encodeURIComponent(versionId) + '&limit=1', { token: s.token }).then(function (r) {
        if (!r.ok || !Array.isArray(r.body) || !r.body[0]) return errorFrom(r.ok ? { status: 404, body: null } : r);
        var fiche = r.body[0].fiche;
        return request('/rest/v1/stores?id=eq.' + rec.storeId + '&select=id,slug,published,published_at,updated_at', { method: 'PATCH', token: s.token, body: { fiche: fiche, published: true }, headers: { Prefer: 'return=representation' } }).then(function (w) {
          if (!w.ok || !Array.isArray(w.body) || !w.body[0]) return errorFrom(w);
          var text = '';
          try { text = JSON.stringify(ficheOf(fiche)); } catch (e) { text = ''; }
          saveLocal({ published: true, publishedAt: w.body[0].published_at || new Date().toISOString(), hash: text ? hash(text) : '' });
          return { ok: true, fiche: fiche, from: r.body[0].published_at };
        });
      });
    });
  }

  // The public read (the store page): by address or by her own domain
  function fetchPublished(q) {
    var o = q || {};
    var path;
    if (o.host) {
      var h = str(o.host).toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
      if (!/^[a-z0-9.-]{4,253}$/.test(h)) return Promise.resolve({ ok: false, code: 'notfound' });
      var alt = /^www\./.test(h) ? h.slice(4) : 'www.' + h; // the twin redirects, but be kind if DNS points both here
      path = '/rest/v1/stores?select=' + PUBLIC_COLS + '&published=is.true&custom_domain=in.(' + encodeURIComponent('"' + h + '","' + alt + '"') + ')&limit=2';
    } else {
      var s = str(o.slug).toLowerCase();
      if (!checkSlug(s).ok) return Promise.resolve({ ok: false, code: 'notfound' });
      path = '/rest/v1/stores?select=' + PUBLIC_COLS + '&published=is.true&slug=eq.' + encodeURIComponent(s) + '&limit=1';
    }
    // `badge`: the owner's plan decides, on the server (migration jeere_wave2); before it, show_badge alone
    return request(path.replace('select=' + PUBLIC_COLS, 'select=' + PUBLIC_COLS + ',badge')).then(function (r) {
      return r.status === 400 ? request(path) : r;
    }).then(function (r) {
      if (r.status === 0 || r.status >= 500) return { ok: false, code: 'network' };
      if (!r.ok || !Array.isArray(r.body) || !r.body.length) return { ok: false, code: 'notfound' };
      var row = r.body[0];
      if (o.host && r.body.length > 1) row = r.body.filter(function (x) { return x.custom_domain === str(o.host).toLowerCase(); })[0] || row;
      return { ok: true, store: row };
    });
  }

  /* ------------------------------------------------------------------ the panel */

  var ICONS = {
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.7z"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function icon(n) { return '<svg class="jp-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || '') + '</svg>'; }

  var uid = 0;
  function mount(el, opts) {
    if (!el) return null;
    var o = opts || {};
    var id = 'jp' + (++uid);
    var getConfig = typeof o.getConfig === 'function' ? o.getConfig : function () { return null; };
    var st = { signedIn: null, userId: '', rec: local(), slug: '', check: null, busy: false, error: '', info: '', edit: false, sugg: [], confirmOff: false, versions: null, histOpen: false, restoring: '' };
    var timer = null, seq = 0;

    function cfg() { var c = null; try { c = getConfig(); } catch (e) { c = null; } return c; }
    function initialSlug() {
      if (st.rec && st.rec.slug) return st.rec.slug;
      try {
        var adm = JSON.parse(readLS((D.STORAGE_KEYS && D.STORAGE_KEYS.admin) || 'jeere-admin'));
        if (isObj(adm) && adm.subdomainChosen === true && adm.settings && D.storeSlug) { var s = D.storeSlug(adm.settings.subdomain); if (checkSlug(s).ok) return s; }
      } catch (e) { /* none */ }
      var c = cfg();
      return D.storeSlugFor ? D.storeSlugFor(c && c.store ? c.store.name : '') : 'ma-boutique';
    }
    function currentHash() { try { return hash(JSON.stringify(ficheOf(cfg()))); } catch (e) { return ''; } }
    function online() { return !!(st.rec && st.rec.published && st.rec.storeId); }

    function scoreHtml() {
      if (o.showScore === false || !D.validate) return '';
      var v = null;
      try { v = D.validate(ficheOf(cfg())); } catch (e) { v = null; }
      if (!v) return '';
      var good = v.status === 'APPROUVÉ';
      return '<p class="jp-score"><span class="jp-pill jp-pill--' + (good ? 'ok' : (v.score < 60 ? 'err' : 'warn')) + '">' + icon(good ? 'check' : 'alert') + esc(v.status) + '</span> ' +
        esc(fr('Score qualité : ' + v.score + '/100.' + (good ? '' : ' Il reste des points à revoir dans Qualité.'))) + '</p>';
    }
    function checkLine() {
      var c = st.check;
      if (!c) return '<p class="jp-hint" id="' + id + '-msg" aria-live="polite">' + esc(fr('Lettres sans accent, chiffres et tirets.')) + '</p>';
      if (c.pending) return '<p class="jp-hint" id="' + id + '-msg" aria-live="polite"><span class="jp-spin" aria-hidden="true"></span>Vérification…</p>';
      var tone = c.available ? 'ok' : (c.reason === 'offline' ? 'warn' : 'err');
      return '<p class="jp-check jp-check--' + tone + '" id="' + id + '-msg" aria-live="polite">' + icon(c.available ? 'check' : (tone === 'warn' ? 'alert' : 'x')) + '<span>' + esc(c.message) + '</span></p>';
    }
    function chooser() {
      var bad = st.check && !st.check.pending && st.check.available === false;
      return '<div class="jp-field"><label class="jp-label" for="' + id + '-slug">Adresse de votre boutique</label>' +
        '<div class="jp-affix' + (bad ? ' is-bad' : '') + '"><span class="jp-affix__pre" aria-hidden="true">' + icon('lock') + esc(PREFIX ? 'https://' + PREFIX : 'https://') + '</span>' +
        '<input class="jp-input" id="' + id + '-slug" value="' + esc(st.slug) + '" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url" aria-describedby="' + id + '-msg"' + (bad ? ' aria-invalid="true"' : '') + '>' +
        (PREFIX ? '' : '<span class="jp-affix__pre">' + esc(D.DOMAIN_SUFFIX || '') + '</span>') + '</div>' + checkLine() +
        (st.sugg.length ? '<div class="jp-sugg"><span class="jp-sugg__l">Libres :</span>' + st.sugg.map(function (s) { return '<button type="button" class="jp-chip" data-jp="sugg" data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' : '') +
        '</div>';
    }
    function liveBox(slug) {
      var link = url(slug);
      var name = (cfg() && cfg().store && cfg().store.name) || 'ma boutique';
      var wa = 'https://wa.me/?text=' + encodeURIComponent(fr('Découvrez ' + name + ', ma boutique en ligne : ') + link);
      return '<div class="jp-live"><p class="jp-label">Votre lien</p><p class="jp-link"><a href="' + esc(link) + '" target="_blank" rel="noopener" id="' + id + '-link">' + esc(link.replace(/^https:\/\//, '')) + '</a></p>' +
        '<div class="jp-row"><button type="button" class="jp-btn jp-btn--ghost" data-jp="copy">' + icon('copy') + 'Copier le lien</button>' +
        '<a class="jp-btn jp-btn--ghost" href="' + esc(wa) + '" target="_blank" rel="noopener" data-jp="wa">' + icon('chat') + 'Partager sur WhatsApp</a>' +
        '<a class="jp-btn jp-btn--quiet" href="' + esc(link) + '" target="_blank" rel="noopener">' + icon('open') + 'Ouvrir</a></div></div>';
    }
    function historyBox() {
      if (!st.signedIn) return '';
      var v = st.versions;
      var head = '<button type="button" class="jp-btn jp-btn--quiet jp-hist__t" data-jp="hist" aria-expanded="' + (st.histOpen ? 'true' : 'false') + '">' + icon('globe') + 'Versions publiées' + (v && v.length ? ' (' + v.length + ')' : '') + '</button>';
      if (!st.histOpen) return '<div class="jp-hist">' + head + '</div>';
      var body;
      if (v === null) body = '<p class="jp-hint"><span class="jp-spin" aria-hidden="true"></span>Chargement…</p>';
      else if (v === false) body = '<p class="jp-hint">' + esc(fr('L’historique n’est pas encore disponible : réessayez dans un instant.')) + '</p>';
      else if (!v.length) body = '<p class="jp-hint">' + esc(fr('Les 10 dernières publications apparaîtront ici.')) + '</p>';
      else body = '<ol class="jp-hist__l">' + v.map(function (x, i) {
        var d = new Date(x.published_at);
        var when = isFinite(d.getTime()) ? dateFr(x.published_at) + ' à ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) : '';
        return '<li><span>' + esc(when) + (i === 0 ? ' <b class="jp-pill jp-pill--ok">en ligne</b>' : '') + '</span>' +
          (i === 0 ? '' : '<button type="button" class="jp-btn jp-btn--ghost" data-jp="restore" data-v="' + esc(x.id) + '"' + (st.restoring ? ' disabled' : '') + '>' + (st.restoring === String(x.id) ? '<span class="jp-spin" aria-hidden="true"></span>' : '') + 'Restaurer</button>') + '</li>';
      }).join('') + '</ol>';
      return '<div class="jp-hist">' + head + body + '</div>';
    }
    function loadHistory() {
      st.versions = null; render();
      history().then(function (r) { st.versions = r.ok ? r.versions : false; render(); });
    }
    function doRestore(vid) {
      if (st.restoring) return;
      st.restoring = String(vid); st.error = ''; st.info = ''; render();
      restore(vid).then(function (r) {
        st.restoring = '';
        if (!r.ok) { st.error = r.message; render(); return; }
        st.rec = local();
        var loaded = false;
        if (typeof o.onRestore === 'function') { try { loaded = o.onRestore(r.fiche) !== false; } catch (e) { loaded = false; } }
        st.info = fr('Cette version est de nouveau en ligne' + (loaded ? ', et le brouillon la reprend (Annuler la défait).' : '.'));
        loadHistory();
      });
    }
    function render() {
      var h = '';
      var on = online();
      h += scoreHtml();
      if (on) {
        var stale = st.rec.hash && st.rec.hash !== currentHash();
        // Draft and live, said apart (wave 2): what she edits here is the draft, the link shows the live version
        h += '<p class="jp-state"><span class="jp-pill jp-pill--ok">' + icon('check') + 'En ligne</span>' +
          (st.rec.publishedAt ? '<span class="jp-muted">' + esc(fr('version publiée le ' + dateFr(st.rec.publishedAt))) + '</span>' : '') +
          '<span class="jp-pill ' + (stale ? 'jp-pill--warn' : 'jp-pill--ok') + '" data-jp-draft="' + (stale ? 'changed' : 'same') + '">' + icon(stale ? 'alert' : 'check') + (stale ? 'Brouillon modifié' : 'Brouillon = en ligne') + '</span></p>';
        if (stale) h += '<p class="jp-note jp-note--warn">' + icon('alert') + '<span>' + esc(fr('Vos dernières modifications sont dans le brouillon, pas encore en ligne : « Mettre à jour » les publie.')) + '</span></p>';
        h += liveBox(st.rec.slug);
        h += historyBox();
        if (st.edit) h += chooser();
      } else {
        if (st.signedIn === false) {
          h += '<p class="jp-state"><span class="jp-pill jp-pill--warn">' + icon('alert') + 'Pas encore en ligne</span></p>' +
            '<p class="jp-lead">' + esc(fr('Votre boutique est enregistrée dans ce navigateur seulement : personne d’autre ne la voit. Pour la mettre en ligne à son adresse, connectez-vous à votre compte Jeere (gratuit).')) + '</p>';
        } else if (st.signedIn) {
          h += '<p class="jp-lead">' + esc(fr('Choisissez son adresse : vos clients la tapent ou la reçoivent sur WhatsApp. Vous pourrez la changer.')) + '</p>';
        } else {
          h += '<p class="jp-lead"><span class="jp-spin" aria-hidden="true"></span>' + esc('Un instant…') + '</p>';
        }
        h += chooser();
      }
      if (st.error) h += '<p class="jp-note jp-note--err" role="alert">' + icon('x') + '<span>' + esc(st.error) + '</span></p>';
      if (st.info) h += '<p class="jp-note jp-note--ok" role="status">' + icon('check') + '<span>' + esc(st.info) + '</span></p>';
      // actions
      h += '<div class="jp-actions">';
      if (on) {
        if (st.confirmOff) {
          h += '<p class="jp-confirm">' + esc(fr('Retirer la boutique de la ligne ? Son lien affichera « boutique introuvable » jusqu’à ce que vous la republiiez.')) + '</p>' +
            '<button type="button" class="jp-btn jp-btn--danger" data-jp="off-yes"' + (st.busy ? ' disabled' : '') + '>Oui, la retirer</button><button type="button" class="jp-btn jp-btn--ghost" data-jp="off-no">Annuler</button>';
        } else {
          h += '<button type="button" class="jp-btn jp-btn--primary" data-jp="publish"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? '<span class="jp-spin" aria-hidden="true"></span>Publication…' : (st.edit ? 'Publier à cette adresse' : 'Mettre à jour la boutique')) + '</button>' +
            (st.edit ? '<button type="button" class="jp-btn jp-btn--ghost" data-jp="edit-no">Garder l’adresse</button>' : '<button type="button" class="jp-btn jp-btn--ghost" data-jp="edit">Changer l’adresse</button>') +
            '<button type="button" class="jp-btn jp-btn--quiet" data-jp="off">Retirer de la ligne</button>';
        }
      } else if (st.signedIn === false) {
        // The account page signs her in for real (a local or demo account too: wave 2), keeps this
        // browser's store, then brings her back here with the publish dialog open (#publier)
        var back = encodeURIComponent(location.pathname.indexOf('/studio/') !== -1 ? 'studio-publier' : 'publier');
        h += '<a class="jp-btn jp-btn--primary" href="' + esc(compteUrl()) + '?suite=' + back + '#connexion">Se connecter pour publier</a>' +
          '<a class="jp-btn jp-btn--quiet" href="' + esc(compteUrl()) + '?suite=' + back + '#inscription">Créer mon compte</a>';
      } else {
        h += '<button type="button" class="jp-btn jp-btn--primary" data-jp="publish"' + (st.busy || st.signedIn !== true ? ' disabled' : '') + '>' + (st.busy ? '<span class="jp-spin" aria-hidden="true"></span>Publication…' : 'Publier ma boutique') + '</button>';
      }
      h += '</div>';
      h += '<p class="jp-foot">' + icon('globe') + '<span>' + esc(fr('Votre propre nom de domaine (awabeaute.com…) : Tableau de bord › Paramètres › Domaine.')) + ' <a href="' + esc(adminUrl()) + '#parametres/domaine">Y aller</a></span></p>';
      var focusId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : '';
      var focusJp = document.activeElement && el.contains(document.activeElement) && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-jp') : '';
      var caret = focusId === id + '-slug' ? document.activeElement.selectionStart : null;
      el.innerHTML = '<div class="jp' + (o.theme === 'dark' ? ' jp--dark' : '') + '">' + h + '</div>';
      var again = focusId ? document.getElementById(focusId) : (focusJp ? el.querySelector('[data-jp="' + focusJp + '"]') : null);
      if (again) { try { again.focus(); if (caret != null && again.setSelectionRange) again.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
    }
    function dateFr(iso) {
      var d = new Date(iso);
      if (!isFinite(d.getTime())) return '';
      var M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      return d.getUTCDate() + (d.getUTCDate() === 1 ? 'er' : '') + NB + M[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    }
    function base() { return /\/concepts\/jeere\//.test(location.pathname) ? location.pathname.replace(/(\/concepts\/jeere\/).*$/, '$1') : '/'; }
    function compteUrl() { return base() + 'compte/'; }
    function adminUrl() { return base() + 'admin/'; }

    function runCheck(immediate) {
      clearTimeout(timer);
      var s = st.slug;
      var local1 = checkSlug(s);
      if (!local1.ok) { st.check = { available: false, reason: local1.code, message: local1.message }; render(); suggest(); return; }
      if (online() && !st.edit && s === st.rec.slug) { st.check = { available: true, reason: 'yours', message: fr(SLUG_MESSAGES.yours) }; render(); return; }
      st.check = { pending: true };
      render();
      var my = ++seq;
      timer = setTimeout(function () {
        available(s).then(function (r) {
          if (my !== seq) return;
          st.check = r;
          render();
          if (!r.available) suggest();
        });
      }, immediate ? 0 : 350);
    }
    function suggest() {
      suggestions(cfg(), 3).then(function (list) { st.sugg = list.filter(function (x) { return x !== st.slug; }); render(); });
    }

    function doPublish() {
      if (st.busy) return;
      var s = online() && !st.edit ? st.rec.slug : st.slug;
      var c = checkSlug(s);
      if (!c.ok) { st.check = { available: false, reason: c.code, message: c.message }; render(); var f = document.getElementById(id + '-slug'); if (f) f.focus(); return; }
      st.busy = true; st.error = ''; st.info = '';
      render();
      publish(cfg(), s).then(function (r) {
        st.busy = false;
        if (!r.ok) {
          st.error = r.message;
          if (r.code === 'login') st.signedIn = false;
          if (r.code === 'taken') { st.check = { available: false, reason: 'taken', message: fr(SLUG_MESSAGES.taken) }; suggest(); }
          render();
          return;
        }
        st.rec = local();
        st.edit = false;
        st.info = online() ? fr('C’est en ligne ! Partagez votre lien : vos clients peuvent commander dès maintenant.') : '';
        if (r.media && r.media.uploaded) st.info += ' ' + fr(r.media.uploaded + ' photo' + (r.media.uploaded > 1 ? 's' : '') + ' en haute définition.');
        if (st.histOpen) loadHistory(); else render();
        var link = document.getElementById(id + '-link');
        if (link) link.focus();
        if (typeof o.onPublished === 'function') { try { o.onPublished(r); } catch (e) { /* host error */ } }
      });
    }
    function doUnpublish() {
      st.busy = true; st.error = ''; st.info = '';
      render();
      unpublish().then(function (r) {
        st.busy = false; st.confirmOff = false;
        if (!r.ok) { st.error = r.message; if (r.code === 'login') st.signedIn = false; render(); return; }
        st.rec = local();
        st.slug = st.rec ? st.rec.slug : st.slug;
        st.info = fr('Votre boutique n’est plus en ligne. « Publier ma boutique » la remet à la même adresse.');
        render();
      });
    }
    function copyLink() {
      var link = url(st.rec.slug);
      var done = function () { st.info = 'Lien copié.'; st.error = ''; render(); };
      var fail = function () {
        var a = document.getElementById(id + '-link');
        if (a && window.getSelection) { var r = document.createRange(); r.selectNodeContents(a); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
        st.info = 'Sélectionnez le lien puis copiez-le.'; render();
      };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fail); else fail(); } catch (e) { fail(); }
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-jp]') : null;
      if (!t || !el.contains(t)) return;
      var a = t.getAttribute('data-jp');
      if (a === 'publish') doPublish();
      else if (a === 'copy') copyLink();
      else if (a === 'sugg') { st.slug = t.getAttribute('data-v'); st.sugg = []; runCheck(true); var f = document.getElementById(id + '-slug'); if (f) f.focus(); }
      else if (a === 'edit') { st.edit = true; st.slug = st.rec.slug; st.check = null; st.info = ''; render(); var g = document.getElementById(id + '-slug'); if (g) g.focus(); }
      else if (a === 'edit-no') { st.edit = false; st.check = null; render(); }
      else if (a === 'off') { st.confirmOff = true; render(); var y = el.querySelector('[data-jp="off-no"]'); if (y) y.focus(); }
      else if (a === 'off-no') { st.confirmOff = false; render(); }
      else if (a === 'off-yes') doUnpublish();
      else if (a === 'hist') { st.histOpen = !st.histOpen; if (st.histOpen) loadHistory(); else render(); }
      else if (a === 'restore') doRestore(t.getAttribute('data-v'));
    });
    el.addEventListener('input', function (e) {
      if (e.target && e.target.id === id + '-slug') {
        var v = normalizeInput(e.target.value);
        if (v !== e.target.value) { var p = e.target.selectionStart - (e.target.value.length - v.length); e.target.value = v; try { e.target.setSelectionRange(p, p); } catch (x) { /* ignore */ } }
        st.slug = v; // a trailing hyphen while typing is fine: the check says so
        st.info = ''; st.error = '';
        runCheck(false);
      }
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === id + '-slug') { e.preventDefault(); if (st.signedIn) doPublish(); }
    });

    st.slug = initialSlug();
    render();
    session().then(function (s) {
      st.signedIn = !!s;
      st.userId = s ? s.userId : '';
      if (s && st.rec && st.rec.ownerId && s.userId && st.rec.ownerId !== s.userId) { st.rec = null; st.slug = initialSlug(); }
      render();
      if (s && !online()) {
        // Another device may have published it: her stores tell
        myStores(s.token).then(function (rows) {
          var row = rows[0];
          if (row && row.published) { st.rec = saveLocal({ slug: row.slug, storeId: row.id, ownerId: s.userId, published: true, publishedAt: row.published_at, hash: '' }); render(); }
          else runCheck(true);
        });
      } else if (!online()) runCheck(true);
    });
    return { refresh: function () { st.rec = local(); render(); }, state: function () { return JSON.parse(JSON.stringify(st)); } };
  }

  window.JeerePublish = {
    SB_URL: SB_URL, SB_KEY: SB_KEY, LOCAL_KEY: LOCAL_KEY, MAX_BYTES: MAX_BYTES, PREFIX: PREFIX, SLUG_MESSAGES: SLUG_MESSAGES,
    address: address, url: url, checkSlug: checkSlug, normalizeInput: normalizeInput,
    available: available, suggestions: suggestions, session: session, local: local,
    publish: publish, unpublish: unpublish, fetchPublished: fetchPublished, mount: mount, badgeShown: badgeShown, hash: hash,
    history: history, restore: restore
  };
})();
