/*
 * Jeere — projects.js: client projects, the project switcher's data (classic script, deferred, no library).
 * Global: window.JeereProjects. Loaded after data.js and publish.js by the dashboard (../admin/), the editor
 * (creer/) and the Studio (../studio/).
 *
 * An agency (Studio Agence) builds stores for her clients under her own account: each store is a project.
 * The CURRENT project is the one in the shared keys every page already reads — the fiche
 * ('jeere-studio-config'), the dashboard's data ('jeere-admin'), the published record ('jeere-publish') and
 * the Studio's versions ('jeere-studio-versions', '…-saves'). Switching project puts those keys aside in
 * 'jeere-project:<id>' and puts the other project's in their place, so the dashboard, the editor, the
 * Studio and « Publier » work on the selected store without knowing about projects.
 *
 *   'jeere-projects' = { version: 1, current: id, userId, list: [entry] }
 *   entry = { id, slug, storeName, clientName, role: 'owner' | 'agency' | 'editor', status: '' | 'proposition' |
 *             'en_cours' | 'livre', handoff: '' | 'entretien' | 'remis', published, token, agency, owner,
 *             invites: [{ id, email, mode, created_at }], remote: boolean, updatedAt }
 *   id: the store's uuid (public.stores) when it is on Supabase (remote), else 'local-…' (this browser only).
 *
 * With a Supabase session (and the migration jeere_client_projects): the list is public.my_projects(); a new
 * project is a row of public.stores owned by her (published false, project_status 'en_cours'); invites are
 * rows of public.store_invites, accepted at the client's next log-in (compte/auth.js, accept_store_invites()).
 * Without one (demo, or the migration not applied yet): the same list in localStorage, nothing sent.
 *
 *   JeereProjects.list() / current() / get(id) / hasRemote()
 *   JeereProjects.refresh()                      → Promise { ok, remote, list, lost? }
 *   JeereProjects.switchTo(id)                   → Promise { ok, entry } | { ok: false, message }
 *   JeereProjects.create({ clientName, template }) → Promise { ok, entry, remote }
 *   JeereProjects.invite(id, email, mode)        → Promise { ok, remote } | { ok: false, message }   mode: entretien | remis | editor
 *   JeereProjects.cancelInvite(id, inviteId)     → Promise { ok }
 *   JeereProjects.removeAgency(id)               → Promise { ok }
 *   JeereProjects.setStatus(id, status)          → Promise { ok }
 *   JeereProjects.previewUrl(entry)              → '…/b/<slug>?apercu=<token>' | ''
 *   JeereProjects.isClientProject()              → the store in view is a client's, seen by the agency (member, or
 *                                                  her client project not handed over): her own number is not used
 *   JeereProjects.takeNotice()                   → the « Vous avez maintenant accès à … » left by auth.js, once
 * Event: window 'jeere:project' { detail: { id, entry } } after a switch, a creation or a refresh that changed the list.
 */
(function () {
  'use strict';

  var D = window.JEERE_DATA || {};
  var SB_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var SK = D.STORAGE_KEYS || {};
  // The keys that belong to the current project (moved together on a switch)
  var KEYS = [SK.config || 'jeere-studio-config', SK.admin || 'jeere-admin', 'jeere-publish', 'jeere-studio-versions', 'jeere-studio-versions-saves'];
  var K_CONFIG = KEYS[0], K_ADMIN = KEYS[1], K_PUBLISH = KEYS[2];
  var REG = 'jeere-projects';
  var SLOT = 'jeere-project:';
  var NOTICE = 'jeere-projects-notice';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ROLES = ['owner', 'agency', 'editor'];
  var STATUSES = ['proposition', 'en_cours', 'livre'];
  var MODES = ['entretien', 'remis', 'editor'];
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* blocked */ } }
  function parse(raw) { try { var o = JSON.parse(raw); return isObj(o) ? o : null; } catch (e) { return null; } }
  function clip(v, n) { return str(v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function rand(n) {
    var a = new Uint8Array(n);
    try { window.crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function emit(id) {
    try { window.dispatchEvent(new CustomEvent('jeere:project', { detail: { id: id, entry: get(id) } })); } catch (e) { /* old browser */ }
  }

  /* ------------------------------------------------------------------ the registry */

  function normEntry(e) {
    if (!isObj(e) || !str(e.id)) return null;
    return {
      id: str(e.id).slice(0, 64),
      slug: str(e.slug).slice(0, 40),
      storeName: clip(e.storeName, 60),
      clientName: clip(e.clientName, 80),
      role: ROLES.indexOf(e.role) >= 0 ? e.role : 'owner',
      status: STATUSES.indexOf(e.status) >= 0 ? e.status : '',
      handoff: e.handoff === 'entretien' || e.handoff === 'remis' ? e.handoff : '',
      published: e.published === true,
      token: str(e.token).slice(0, 64),
      agency: str(e.agency).slice(0, 254),
      owner: str(e.owner).slice(0, 254),
      invites: (Array.isArray(e.invites) ? e.invites : []).filter(isObj).slice(0, 20).map(function (i) {
        return { id: str(i.id), email: str(i.email).toLowerCase(), mode: MODES.indexOf(i.mode) >= 0 ? i.mode : 'editor', created_at: str(i.created_at) };
      }),
      remote: e.remote === true && UUID.test(str(e.id)),
      updatedAt: str(e.updatedAt)
    };
  }
  function readReg() {
    var o = parse(lsGet(REG));
    if (!o) return null;
    var list = (Array.isArray(o.list) ? o.list : []).map(normEntry).filter(Boolean);
    var cur = str(o.current);
    return { version: 1, current: list.some(function (e) { return e.id === cur; }) ? cur : '', userId: str(o.userId), list: list };
  }
  function writeReg(reg) { return lsSet(REG, JSON.stringify(reg)); }
  function configName(raw) { var c = parse(raw); return c && isObj(c.store) ? clip(c.store.name, 60) : ''; }
  function publishRec() { var p = parse(lsGet(K_PUBLISH)); return p || {}; }

  // The registry, made from the store already on this device the first time, and kept in step with it:
  // the current entry's name follows the fiche; a local project published since then takes its store's id.
  function ensure() {
    var reg = readReg();
    var cfgRaw = lsGet(K_CONFIG);
    var pub = publishRec();
    var changed = false;
    if (!reg) {
      reg = { version: 1, current: '', userId: '', list: [] };
      changed = true;
    }
    if (!reg.current && (cfgRaw || pub.storeId)) {
      var id = UUID.test(str(pub.storeId)) ? pub.storeId : 'local-' + rand(6);
      var have = get(id, reg);
      if (!have) reg.list.unshift(normEntry({ id: id, slug: pub.slug, storeName: configName(cfgRaw), role: 'owner', published: pub.published === true, remote: UUID.test(id) }));
      reg.current = id;
      changed = true;
    }
    var cur = get(reg.current, reg);
    if (cur) {
      var nm = configName(cfgRaw);
      if (nm && nm !== cur.storeName) { cur.storeName = nm; changed = true; }
      // published from this project since: the local project becomes the store
      if (!cur.remote && UUID.test(str(pub.storeId))) {
        var other = get(pub.storeId, reg);
        if (other && other !== cur) {
          reg.list = reg.list.filter(function (e) { return e !== other; });
          cur.token = cur.token || other.token; cur.role = other.role; cur.status = cur.status || other.status;
        }
        lsDel(SLOT + pub.storeId);
        cur.id = pub.storeId; cur.remote = true;
        reg.current = cur.id;
        changed = true;
      }
      if (cur.remote && cur.id === pub.storeId) {
        if (pub.slug && pub.slug !== cur.slug) { cur.slug = pub.slug; changed = true; }
        if (typeof pub.published === 'boolean' && pub.published !== cur.published) { cur.published = pub.published; changed = true; }
      }
    }
    if (changed) writeReg(reg);
    return reg;
  }
  function get(id, reg) {
    var r = reg || readReg();
    if (!r) return null;
    for (var i = 0; i < r.list.length; i++) if (r.list[i].id === id) return r.list[i];
    return null;
  }
  function list() { return ensure().list.slice(); }
  function current() { var r = ensure(); return get(r.current, r); }
  function hasRemote() { var r = readReg(); return !!(r && r.list.some(function (e) { return e.remote; })); }
  // The store in view is a client's, seen by the agency: a member access, or a client project she still owns
  // (not handed over yet). Her own shop, and a client's own store once handed over to her, are not.
  function isClientProject() { var c = current(); return !!(c && (c.role !== 'owner' || (c.clientName && !c.handoff))); }

  /* ------------------------------------------------------------------ the slots (the projects put aside) */

  function readSlot(id) { return parse(lsGet(SLOT + id)); }
  // The current project's keys → its slot. false when the browser refused (storage full).
  function stash(id) {
    if (!id) return true;
    var s = {};
    KEYS.forEach(function (k) { s[k] = lsGet(k); });
    return lsSet(SLOT + id, JSON.stringify(s));
  }
  function apply(slot) {
    KEYS.forEach(function (k) {
      var v = slot && typeof slot[k] === 'string' ? slot[k] : null;
      if (v === null) lsDel(k); else lsSet(k, v);
    });
  }
  // A Supabase row (id, slug, fiche, published, published_at) → the keys of a project on this device
  function slotFromRow(row) {
    var cfg = row.fiche;
    try { if (D.normalizeConfig) cfg = D.normalizeConfig(row.fiche || {}); } catch (e) { cfg = row.fiche; }
    var text = JSON.stringify(cfg);
    var P = window.JeerePublish;
    var s = {};
    s[K_CONFIG] = text;
    s[K_PUBLISH] = JSON.stringify({ version: 1, slug: str(row.slug), storeId: str(row.id), ownerId: '', published: row.published === true, publishedAt: str(row.published_at), hash: row.published && P && P.hash ? P.hash(text) : '' });
    s[K_ADMIN] = JSON.stringify({ version: 1, subdomainChosen: true, settings: { subdomain: D.storeAddress ? D.storeAddress(row.slug) : 'jeere.kreeative.xyz/b/' + row.slug } });
    return s;
  }

  /* ------------------------------------------------------------------ Supabase (no library) */

  function session() {
    var P = window.JeerePublish;
    if (P && typeof P.session === 'function') return P.session();
    var t = parse(lsGet('sb-aezchxfvzfoqlvzchqyk-auth-token'));
    if (t && isObj(t.currentSession)) t = t.currentSession;
    return Promise.resolve(t && t.access_token ? { token: t.access_token, userId: t.user && t.user.id ? String(t.user.id) : '' } : null);
  }
  function request(path, o) {
    o = o || {};
    var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (o.token) h.Authorization = 'Bearer ' + o.token;
    if (o.prefer) h.Prefer = o.prefer;
    return fetch(SB_URL + path, { method: o.method || 'GET', headers: h, body: o.body == null ? undefined : JSON.stringify(o.body) }).then(function (r) {
      return r.text().then(function (t) { var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) { b = t; } return { ok: r.ok, status: r.status, body: b }; });
    }, function () { return { ok: false, status: 0, body: null }; });
  }
  // The migration jeere_client_projects is not applied yet (unknown function or column)
  function missing(r) {
    var c = isObj(r.body) ? str(r.body.code) : '';
    return r.status === 404 || c === 'PGRST202' || c === 'PGRST204' || c === '42883' || c === '42703' || c === '42P01';
  }
  function errorText(r, fallback) {
    var b = isObj(r.body) ? r.body : {};
    var c = str(b.code);
    if (r.status === 0) return 'Pas de connexion. Réessayez.';
    if (r.status === 401 || c === 'PGRST301') return 'Votre session a expiré : reconnectez-vous.';
    if (c === '23505') return 'Une invitation attend déjà cette adresse.';
    if (c === 'P0001' && b.message) return str(b.message);
    if (c === '42501' || r.status === 403) return str(b.message) && /[àéèêç]/.test(str(b.message)) ? str(b.message) : 'Vous n’avez pas les droits pour faire cela.';
    return fallback || 'Cela n’a pas marché. Réessayez dans un instant.';
  }

  function fromRow(r) {
    return normEntry({
      id: r.id, slug: r.slug, storeName: r.store_name, clientName: r.client_name, role: r.role, status: r.project_status,
      handoff: r.handoff, published: r.published, token: r.preview_token, agency: r.agency_email, owner: r.owner_email,
      invites: r.invites, remote: true, updatedAt: r.updated_at
    });
  }

  // The list from the server (my_projects), merged with this browser's local projects
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = session().then(function (s) {
      var reg = ensure();
      if (!s) return { ok: true, remote: false, list: reg.list.slice() };
      return request('/rest/v1/rpc/my_projects', { method: 'POST', token: s.token, body: {} }).then(function (r) {
        if (!r.ok || !Array.isArray(r.body)) return { ok: !missing(r) ? false : true, remote: false, unavailable: missing(r), list: ensure().list.slice() };
        return merge(r.body.map(fromRow).filter(Boolean), s.userId);
      });
    });
    var done = function () { refreshing = null; };
    refreshing.then(done, done);
    return refreshing;
  }
  function merge(rows, userId) {
    var reg = ensure();
    var before = JSON.stringify(reg.list);
    // another account on this device: its server projects are not hers
    if (reg.userId && userId && reg.userId !== userId) {
      reg.list = reg.list.filter(function (e) { if (e.remote && e.id !== reg.current) lsDel(SLOT + e.id); return !e.remote || e.id === reg.current; });
    }
    if (userId) reg.userId = userId;
    var ids = {};
    rows.forEach(function (row) {
      ids[row.id] = true;
      var e = get(row.id, reg);
      if (!e) { reg.list.push(row); return; }
      var keep = e.id === reg.current ? { storeName: e.storeName || row.storeName } : {};
      Object.keys(row).forEach(function (k) { e[k] = row[k]; });
      if (keep.storeName) e.storeName = keep.storeName;
    });
    var lost = null;
    reg.list = reg.list.filter(function (e) {
      if (!e.remote || ids[e.id]) return true;
      if (e.id === reg.current) { lost = e; return false; }
      lsDel(SLOT + e.id);
      return false;
    });
    // newest first, the local projects (this browser only) after
    reg.list.sort(function (a, b) { return (b.remote - a.remote) || str(b.updatedAt).localeCompare(str(a.updatedAt)); });
    writeReg(reg);
    var chain = Promise.resolve();
    if (lost) {
      // her access to the project in view was removed: its keys go, the next project comes in
      reg.current = '';
      KEYS.forEach(lsDel);
      writeReg(reg);
      if (reg.list.length) chain = switchTo(reg.list[0].id, { noStash: true });
    } else if (!reg.current && reg.list.length && !lsGet(K_CONFIG)) {
      // a new device: open her most recent project
      chain = switchTo(reg.list[0].id, { noStash: true });
    }
    return chain.then(function () {
      var now = ensure();
      if (JSON.stringify(now.list) !== before || lost) emit(now.current);
      return { ok: true, remote: true, list: now.list.slice(), lost: lost };
    });
  }

  /* ------------------------------------------------------------------ switching */

  function switchTo(id, opts) {
    var o = opts || {};
    var reg = ensure();
    var target = get(id, reg);
    if (!target) return Promise.resolve({ ok: false, message: 'Ce projet n’existe plus.' });
    if (reg.current === id && !o.force) return Promise.resolve({ ok: true, entry: target });
    var slot = readSlot(id);
    var load = slot ? Promise.resolve(slot) : (target.remote ? session().then(function (s) {
      if (!s) return null;
      return request('/rest/v1/stores?select=id,slug,fiche,published,published_at&id=eq.' + encodeURIComponent(id) + '&limit=1', { token: s.token }).then(function (r) {
        return r.ok && Array.isArray(r.body) && r.body[0] ? slotFromRow(r.body[0]) : null;
      });
    }) : Promise.resolve(null));
    return load.then(function (sl) {
      if (!sl) return { ok: false, message: target.remote ? 'Impossible d’ouvrir ce projet : vérifiez votre connexion, ou reconnectez-vous.' : 'Ce projet n’est plus dans ce navigateur.' };
      var r2 = ensure();
      if (!o.noStash && r2.current && !stash(r2.current)) return { ok: false, message: 'La mémoire de ce navigateur est pleine : impossible de changer de projet.' };
      apply(sl);
      lsDel(SLOT + id);
      r2 = readReg() || r2;
      r2.current = id;
      writeReg(r2);
      ensure();
      emit(id);
      return { ok: true, entry: get(id) };
    });
  }

  /* ------------------------------------------------------------------ a new project */

  // The template's fiche with the client's name (the hero title too, like the editor's personalize)
  function freshConfig(clientName, template) {
    var cfg = D.defaultConfig(template);
    var old = str(cfg.store.name);
    var name = clip(clientName, 40);
    (cfg.sections || []).forEach(function (s) {
      if (s.type === 'hero' && s.settings && typeof s.settings.title === 'string' && old && s.settings.title.indexOf(old) !== -1) {
        var t = s.settings.title.split(old).join(name);
        s.settings.title = t.length <= 70 ? t : name;
      }
    });
    cfg.store.name = name;
    try { if (D.normalizeConfig) cfg = D.normalizeConfig(cfg); } catch (e) { /* keep */ }
    return cfg;
  }
  // A free address made from the client's name: name, name-2, name-3…
  function freeSlug(name) {
    var P = window.JeerePublish;
    var base = D.storeSlugFor ? D.storeSlugFor(name) : 'ma-boutique';
    var taken = {};
    (readReg() || { list: [] }).list.forEach(function (e) { if (e.slug) taken[e.slug] = true; });
    var i = 0;
    function next() {
      i++;
      var s = i === 1 ? base : (base.slice(0, 36).replace(/-+$/, '') + '-' + i);
      if (i > 8) return Promise.resolve(base.slice(0, 32).replace(/-+$/, '') + '-' + rand(3));
      if (taken[s]) return next();
      if (!P || typeof P.available !== 'function') return Promise.resolve(s);
      return P.available(s).then(function (r) { return r.available === false && r.reason !== 'yours' ? next() : s; });
    }
    return next();
  }
  function create(o) {
    var clientName = clip(o && o.clientName, 80);
    if (!clientName) return Promise.resolve({ ok: false, message: 'Écrivez le nom du client.' });
    var template = o && D.templates && D.templates[o.template] ? o.template : 'plateau';
    var cfg = freshConfig(clientName, template);
    return session().then(function (s) {
      if (!s) return local();
      return freeSlug(clientName).then(function (slug) {
        var body = { slug: slug, fiche: cfg, published: false, client_name: clientName, project_status: 'en_cours' };
        return request('/rest/v1/stores?select=id,slug,published,published_at,updated_at', { method: 'POST', token: s.token, body: body, prefer: 'return=representation' }).then(function (r) {
          if (missing(r)) return local();
          if (!r.ok || !Array.isArray(r.body) || !r.body[0]) return { ok: false, message: errorText(r, 'Le projet n’a pas pu être créé. Réessayez.') };
          var row = r.body[0];
          var reg = ensure();
          reg.list.unshift(normEntry({ id: row.id, slug: row.slug, storeName: cfg.store.name, clientName: clientName, role: 'owner', status: 'en_cours', published: false, remote: true, updatedAt: row.updated_at }));
          writeReg(reg);
          var sl = slotFromRow({ id: row.id, slug: row.slug, fiche: cfg, published: false });
          lsSet(SLOT + row.id, JSON.stringify(sl));
          return switchTo(row.id).then(function (sw) {
            if (!sw.ok) return sw;
            // the preview token and the rest come from the server
            return refresh().then(function () { return { ok: true, remote: true, entry: get(row.id) }; }, function () { return { ok: true, remote: true, entry: get(row.id) }; });
          });
        });
      });
    });
    function local() {
      var id = 'local-' + rand(6);
      var reg = ensure();
      reg.list.unshift(normEntry({ id: id, storeName: cfg.store.name, clientName: clientName, role: 'owner', status: 'en_cours', token: rand(16), remote: false, updatedAt: new Date().toISOString() }));
      writeReg(reg);
      var sl = {};
      sl[K_CONFIG] = JSON.stringify(cfg);
      lsSet(SLOT + id, JSON.stringify(sl));
      return switchTo(id).then(function (sw) { return sw.ok ? { ok: true, remote: false, entry: get(id) } : sw; });
    }
  }

  /* ------------------------------------------------------------------ invites, access, status */

  function update(id, fn) {
    var reg = ensure();
    var e = get(id, reg);
    if (!e) return null;
    fn(e);
    writeReg(reg);
    emit(reg.current);
    return e;
  }
  function invite(id, email, mode) {
    var e = get(id);
    var m = str(email).trim().toLowerCase();
    if (!e) return Promise.resolve({ ok: false, message: 'Ce projet n’existe plus.' });
    if (!EMAIL.test(m) || m.length > 254) return Promise.resolve({ ok: false, field: 'email', message: 'Vérifiez l’adresse e-mail.' });
    if (MODES.indexOf(mode) < 0) return Promise.resolve({ ok: false, message: 'Choisissez comment remettre le site.' });
    if (e.role !== 'owner') return Promise.resolve({ ok: false, message: 'Seule la propriétaire de la boutique peut inviter.' });
    if (e.invites.some(function (i) { return i.email === m; })) return Promise.resolve({ ok: false, field: 'email', message: 'Une invitation attend déjà cette adresse.' });
    var add = function (iid) { update(id, function (x) { x.invites.push({ id: iid, email: m, mode: mode, created_at: new Date().toISOString() }); }); };
    if (!e.remote) { add('local-' + rand(4)); return Promise.resolve({ ok: true, remote: false }); }
    return session().then(function (s) {
      if (!s) return { ok: false, message: 'Connectez-vous pour inviter votre client.' };
      return request('/rest/v1/store_invites?select=id', { method: 'POST', token: s.token, body: { store_id: id, email: m, mode: mode }, prefer: 'return=representation' }).then(function (r) {
        if (!r.ok) return { ok: false, message: errorText(r, 'L’invitation n’a pas pu être envoyée. Réessayez.') };
        add(Array.isArray(r.body) && r.body[0] ? str(r.body[0].id) : '');
        return { ok: true, remote: true };
      });
    });
  }
  function cancelInvite(id, inviteId) {
    var e = get(id);
    if (!e) return Promise.resolve({ ok: false });
    var drop = function () { update(id, function (x) { x.invites = x.invites.filter(function (i) { return i.id !== inviteId; }); }); return { ok: true }; };
    if (!e.remote || !UUID.test(str(inviteId))) return Promise.resolve(drop());
    return session().then(function (s) {
      if (!s) return { ok: false, message: 'Connectez-vous pour annuler l’invitation.' };
      return request('/rest/v1/store_invites?id=eq.' + encodeURIComponent(inviteId), { method: 'DELETE', token: s.token }).then(function (r) { return r.ok ? drop() : { ok: false, message: errorText(r) }; });
    });
  }
  function removeAgency(id) {
    var e = get(id);
    if (!e) return Promise.resolve({ ok: false });
    var done = function () { update(id, function (x) { x.agency = ''; if (x.handoff === 'entretien') x.handoff = 'remis'; }); return { ok: true }; };
    if (!e.remote) return Promise.resolve(done());
    return session().then(function (s) {
      if (!s) return { ok: false, message: 'Connectez-vous pour retirer cet accès.' };
      return request('/rest/v1/rpc/remove_agency_access', { method: 'POST', token: s.token, body: { p_store: id } }).then(function (r) { return r.ok ? done() : { ok: false, message: errorText(r, 'L’accès n’a pas pu être retiré. Réessayez.') }; });
    });
  }
  function setStatus(id, status) {
    var e = get(id);
    if (!e || STATUSES.indexOf(status) < 0) return Promise.resolve({ ok: false });
    var done = function () { update(id, function (x) { x.status = status; }); return { ok: true }; };
    if (!e.remote) return Promise.resolve(done());
    return session().then(function (s) {
      if (!s) return { ok: false, message: 'Connectez-vous pour changer le statut.' };
      return request('/rest/v1/stores?id=eq.' + encodeURIComponent(id), { method: 'PATCH', token: s.token, body: { project_status: status } }).then(function (r) { return r.ok ? done() : { ok: false, message: errorText(r) }; });
    });
  }

  // The private preview: on Jeere's own host the public address, elsewhere (a local server, a preview
  // deployment) the store page of this site with ?s=
  function previewUrl(e) {
    if (!e || !e.slug || !e.token) return '';
    var q = 'apercu=' + encodeURIComponent(e.token);
    var host = '';
    try { host = window.location.hostname; } catch (err) { host = ''; }
    if (host === (D.PUBLIC_HOST || 'jeere.kreeative.xyz') || !/^(localhost|127\.0\.0\.1|\[::1\])$|\.vercel\.app$|kreeative\.xyz$/.test(host)) {
      return 'https://' + (D.storeAddress ? D.storeAddress(e.slug) : 'jeere.kreeative.xyz/b/' + e.slug) + '?' + q;
    }
    try { return new URL('../b/?s=' + encodeURIComponent(e.slug) + '&' + q, document.baseURI).href; } catch (err) { return ''; }
  }

  // Left by compte/auth.js after accept_store_invites(): { at, names: [] }
  function takeNotice() {
    var n = parse(lsGet(NOTICE));
    lsDel(NOTICE);
    if (!n || !Array.isArray(n.names) || !n.names.length) return null;
    if (Date.now() - Date.parse(str(n.at)) > 10 * 60e3) return null;
    return n;
  }

  /* ------------------------------------------------------------------ the guard (editor, Studio) */

  // The project was switched in another tab: this page holds another store. It is frozen (its writes to the
  // project's keys are dropped, so it cannot overwrite the new project) and offers to reload.
  function guard() {
    if (document.getElementById('a-app')) return; // the dashboard re-reads everything itself
    var mine = ensure().current;
    var frozen = false;
    try {
      var P = window.Storage && window.Storage.prototype;
      if (P && !P.__jeereProjects) {
        var set = P.setItem;
        P.setItem = function (k) {
          if (frozen && KEYS.indexOf(String(k)) !== -1) return undefined;
          return set.apply(this, arguments);
        };
        P.__jeereProjects = true;
      }
    } catch (e) { /* the banner still says it */ }
    window.addEventListener('storage', function (e) {
      if (e.key !== REG || frozen) return;
      var now = parse(e.newValue);
      if (!now || str(now.current) === mine) return;
      frozen = true;
      var name = (function () { var x = get(str(now.current)); return x ? (x.clientName || x.storeName) : ''; })();
      var bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.className = 'jproj-stale';
      bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;background:#111;color:#fff;padding:12px 14px 12px 18px;border-radius:14px;font:500 15px/1.4 Poppins,system-ui,sans-serif;display:flex;gap:14px;align-items:center;max-width:calc(100vw - 24px);box-shadow:0 8px 30px rgba(0,0,0,.25)';
      var t = document.createElement('span');
      t.textContent = 'Vous avez ouvert ' + (name || 'un autre projet') + ' dans un autre onglet. Rechargez pour le modifier ici.';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Recharger';
      b.style.cssText = 'min-height:44px;padding:0 16px;border-radius:999px;border:0;background:#fff;color:#111;font:600 15px Poppins,system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', function () { window.location.reload(); });
      bar.appendChild(t); bar.appendChild(b);
      document.body.appendChild(bar);
    });
  }

  window.JeereProjects = {
    KEYS: KEYS, REG: REG, NOTICE: NOTICE, STATUSES: STATUSES, MODES: MODES,
    list: list, current: current, get: function (id) { return get(id); }, hasRemote: hasRemote, isClientProject: isClientProject,
    refresh: refresh, switchTo: switchTo, create: create, invite: invite, cancelInvite: cancelInvite,
    removeAgency: removeAgency, setStatus: setStatus, previewUrl: previewUrl, takeNotice: takeNotice, ensure: ensure
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guard); else guard();
})();
