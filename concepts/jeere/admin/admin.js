/*
 * Jeere — admin.js: the seller dashboard (front-end prototype, no backend).
 * Global: window.JeereAdmin = { go, state, reload, startTour } (for tests and the console; startTour replays the
 * guided tour of ../creer/tour.js, as « ? Aide » › « Revoir la visite guidée » does).
 *
 * Shares four localStorage keys with the editor (../creer/) and the account page (../compte/):
 *  - 'jeere-studio-config': the fiche boutique. Read and always written through JEERE_DATA.normalizeConfig.
 *  - 'jeere-account': { version, firstName, phone, storeName, createdAt, plan, loggedIn } (JEERE_DATA.normalizeAccount).
 *  - 'jeere-admin': { version, orders, settings, connectors, stock?, … } (JEERE_DATA.normalizeAdmin), created lazily
 *    from JEERE_DATA.adminDefaults (ADMIN_DEFAULTS + demoOrders(config)). Extra top-level keys kept here:
 *    demoSeeded, subdomainChosen, prefs { productView }, notify { [connectorId]: true }.
 *  - 'jeere-studio-open': one-shot { page, pageId?, productId?, view? } set before opening the editor.
 *  - 'jeere-tour': { version, seen: { editor, admin } }, the guided tours already shown (read and written by tour.js).
 *    'jeere-admin'.onboarding = { checklistHidden?, sharedAt? } belongs to « Premiers pas ».
 * Every read and write is in try/catch: a missing, corrupted or blocked storage falls back to the defaults.
 *
 * Hash routes (the Back button works): #accueil, #commandes[/1055][?statut=a-preparer], #produits[/p3|/nouveau],
 * #clients, #boutique, #pages[/pg2|/nouvelle], #paiements, #livraison, #connecteurs, #parametres[/boutique|domaine|
 * equipe|abonnement|studio|notifications|pages-legales|donnees].
 */
(function () {
  'use strict';

  const D = window.JEERE_DATA || null;
  const NB = ' ';
  const KEYS = (D && D.STORAGE_KEYS) || { config: 'jeere-studio-config', account: 'jeere-account', admin: 'jeere-admin', open: 'jeere-studio-open', tour: 'jeere-tour' };
  const EDITOR_URL = '../creer/';
  const COMPTE_URL = '../compte/';
  const ROUTES = ['accueil', 'commandes', 'produits', 'clients', 'boutique', 'pages', 'promos', 'paiements', 'livraison', 'connecteurs', 'parametres'];
  const TITLES = {
    accueil: 'Accueil', commandes: 'Commandes', produits: 'Produits', clients: 'Clients', boutique: 'Boutique en ligne',
    pages: 'Pages', promos: 'Codes promo', paiements: 'Paiements', livraison: 'Livraison', connecteurs: 'Connecteurs', parametres: 'Paramètres'
  };
  // The phone's bottom bar: the rest of the sections are under « Plus »
  const TABS = { accueil: 'accueil', commandes: 'commandes', produits: 'produits', boutique: 'boutique' };

  /* ------------------------------------------------------------------ small helpers */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v) ? String(v) : ''));
  // Collapse ASCII whitespace only: the non-breaking spaces of French typography stay as written
  const clip = (v, n) => str(v).replace(/[\t\n\v\f\r ]+/g, ' ').replace(/^ | $/g, '').slice(0, n);
  const copy = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const fold = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const digits = (s) => str(s).replace(/\D/g, '');
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(str(c)) ? c : '#E8E6DF');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // French typography for the dashboard's own copy: a non-breaking space before : ; ! ? » and after «
  function fr(s) { return String(s == null ? '' : s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  // H`…`: an HTML template. Its static parts get French typography; values are inserted as given
  // (strings from the seller always go through esc()).
  const frCache = new WeakMap();
  function H(strs) {
    let parts = frCache.get(strs);
    if (!parts) { parts = strs.map(fr); frCache.set(strs, parts); }
    let out = parts[0];
    for (let i = 1; i < arguments.length; i++) {
      const v = arguments[i];
      out += (v == null || v === false) ? '' : (Array.isArray(v) ? v.join('') : String(v));
      out += parts[i];
    }
    return out;
  }
  const ico = (name, cls) => '<svg class="a-ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';

  const price = (n) => (D && D.formatPrice ? D.formatPrice(n) : Math.round(Number(n) || 0) + NB + 'FCFA');
  const number = (n) => (D && D.formatNumber ? D.formatNumber(n) : String(Math.round(Number(n) || 0)));
  const plural = (n, one, many) => number(n) + NB + (Math.abs(n) >= 2 ? many : one);

  // Abidjan is on UTC all year: dates are shown in UTC, so everyone sees the store's local time.
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const DAYS_MINI = ['di', 'lu', 'ma', 'me', 'je', 've', 'sa'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAY_MS = 86400000;
  function toDate(v) { const d = new Date(v); return isFinite(d.getTime()) ? d : null; }
  const dayNum = (d) => d.getUTCDate() + (d.getUTCDate() === 1 ? 'er' : '');
  const hm = (d) => d.getUTCHours() + NB + 'h' + NB + String(d.getUTCMinutes()).padStart(2, '0');
  const dayKey = (d) => Math.floor(d.getTime() / DAY_MS);
  const dateLong = (d) => DAYS[d.getUTCDay()] + ' ' + dayNum(d) + NB + MONTHS[d.getUTCMonth()];
  const dateShort = (d) => dayNum(d) + NB + MONTHS_SHORT[d.getUTCMonth()];
  const dateFull = (d) => dayNum(d) + NB + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' à ' + hm(d);
  function when(v) {
    const d = toDate(v);
    if (!d) return '';
    const mins = (S.now - d) / 60000;
    if (mins < 1) return 'à l’instant';
    if (mins < 60) return 'il y a ' + Math.round(mins) + NB + 'min';
    const days = dayKey(S.now) - dayKey(d);
    if (days === 0) return 'aujourd’hui, ' + hm(d);
    if (days === 1) return 'hier, ' + hm(d);
    if (days < 7 && days > 0) return DAYS_SHORT[d.getUTCDay()] + ' ' + dateShort(d) + ', ' + hm(d);
    return dateShort(d) + (d.getUTCFullYear() !== S.now.getUTCFullYear() ? ' ' + d.getUTCFullYear() : '') + ', ' + hm(d);
  }

  // '+2250707123456' → '+225 07 07 12 34 56' (non-breaking spaces: a number never wraps)
  function phoneFmt(p) {
    const s = str(p);
    const m = /^\+225(\d{10})$/.exec(s);
    if (m) return '+225' + NB + m[1].match(/\d{2}/g).join(NB);
    return s;
  }
  function normPhone(v) { try { return D.normalizeWhatsapp(str(v)); } catch (e) { return digits(v) ? '+' + digits(v) : ''; } }
  // What is wrong with a normalised number, or '' (same rule as the account page: an Ivorian number has 10 digits)
  function phoneProblem(e164) {
    const p = str(e164);
    if (/^\+225/.test(p) && digits(p).length !== 13) return 'Un numéro ivoirien a 10 chiffres, par exemple 07 07 12 34 56.';
    if (!/^\+\d{8,15}$/.test(p)) return 'Ce numéro semble incomplet ou trop long : vérifiez-le, avec l’indicatif du pays.';
    return '';
  }
  const phoneOk = (e164) => !phoneProblem(e164);
  const waLink = (phone, text) => 'https://wa.me/' + digits(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
  const initials = (name) => {
    const w = str(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase();
  };

  /* ------------------------------------------------------------------ storage */

  function lsGet(k) { try { const v = window.localStorage.getItem(k); return typeof v === 'string' ? v : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return null; } catch (e) { return e || new Error('storage'); } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* blocked storage: nothing to delete */ } }
  const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

  const S = {
    now: new Date(),
    config: null, account: null, admin: null,
    raw: { config: null, account: null, admin: null }, // the JSON last read or written: anything else was written elsewhere
    route: null, hash: null,
    dirty: null, drafts: {},
    orderFilter: null, orderQuery: '', productQuery: '', customerQuery: '', productNoPhoto: false, checkOpen: false,
    blockedSaid: false, inApp: false, mounts: []
  };

  function readConfig() {
    const raw = lsGet(KEYS.config);
    S.raw.config = raw;
    if (!raw) return null;
    try { const o = JSON.parse(raw); return isObj(o) ? D.normalizeConfig(o) : null; } catch (e) { return null; }
  }
  function readAccount() {
    const raw = lsGet(KEYS.account);
    S.raw.account = raw;
    if (!raw) return null;
    try {
      if (typeof D.normalizeAccount === 'function') return D.normalizeAccount(raw);
      const o = JSON.parse(raw);
      if (!isObj(o)) return null;
      return { version: 1, firstName: clip(o.firstName, 40), phone: normPhone(o.phone), storeName: clip(o.storeName, 40), createdAt: str(o.createdAt), plan: ['gratuit', 'essentiel', 'pro', 'business'].indexOf(o.plan) >= 0 ? o.plan : 'gratuit', loggedIn: o.loggedIn === true };
    } catch (e) { return null; }
  }
  // Which fiche the example orders were made for: another template or niche brings other products
  const demoSig = () => (S.config ? str(S.config.template) + '/' + str(S.config.store.niche) : '');
  function freshAdmin() {
    let a = null;
    try { if (typeof D.adminDefaults === 'function') a = D.adminDefaults(S.config, S.forClient ? null : S.account, S.now); } catch (e) { a = null; }
    if (!isObj(a)) {
      const d = copy(D.ADMIN_DEFAULTS) || {};
      a = { version: 1, orders: S.config && D.demoOrders ? D.demoOrders(S.config, 14, S.now) : [], settings: d, connectors: {} };
    }
    if (S.config) a.demoFor = demoSig();
    if (S.account && S.account.phone) a.ownerPhone = S.account.phone;
    return a;
  }
  function readAdmin() {
    const raw = lsGet(KEYS.admin);
    S.raw.admin = raw;
    let a = null;
    let changed = false;
    if (raw) { try { a = D.normalizeAdmin(raw, S.config, S.now); } catch (e) { a = null; } }
    if (!isObj(a) || !isObj(a.settings)) { a = freshAdmin(); changed = true; }
    if (!Array.isArray(a.orders)) a.orders = [];
    // No store yet: no example orders either (they are made from the store's own products, below)
    if (!S.config && a.demoSeeded !== true && a.orders.length) { a.orders = []; changed = true; }
    if (!isObj(a.connectors)) a.connectors = {};
    // An admin created before the store existed has no orders: make the example orders once there are products
    const sig = demoSig();
    if (!a.orders.length && !a.demoSeeded && S.config && S.config.products.length) {
      try { a.orders = D.demoOrders(S.config, 14, S.now); } catch (e) { a.orders = []; }
      a.demoFor = sig;
      changed = true;
    }
    if (a.orders.length && a.demoSeeded !== true) { a.demoSeeded = true; changed = true; }
    // The example orders are made from the store's products: another template or niche in the Studio (a new
    // set of products) makes them again, as long as the seller has not touched them. Her own orders stay.
    if (S.config && S.config.products.length && a.orders.length && a.demoFor !== sig) {
      const mine = a.orders.filter((o) => o.manual === true);
      const demo = a.orders.filter((o) => o.manual !== true);
      const touched = demo.some((o) => arr(o.history).length || o.courier || o.confirmedAt || o.deposit);
      const names = {};
      S.config.products.forEach((p) => { names[p.name] = true; });
      // An admin saved before demoFor existed: only orders that match none of the products are stale
      const stale = a.demoFor !== undefined || (demo.length && !demo.some((o) => arr(o.items).some((it) => names[it.name])));
      if (!touched && stale && demo.length) {
        let fresh = [];
        try { fresh = D.demoOrders(S.config, 14, S.now); } catch (e) { fresh = []; }
        if (fresh.length) a.orders = mine.concat(fresh);
      }
      a.demoFor = sig;
      changed = true;
    }
    if (!isObj(a.prefs)) a.prefs = {};
    if (!isObj(a.notify)) a.notify = {};
    if (!isObj(a.stock)) a.stock = {};
    // Another seller signed in on this device (a new account after the demo): the dashboard becomes hers.
    // The previous owner leaves the team, and money is no longer paid out to her number.
    const acc = S.account;
    if (acc && acc.phone && a.ownerPhone !== acc.phone) {
      const old = str(a.ownerPhone);
      if (old) {
        a.settings.team = a.settings.team.filter((m) => !(m.phone === old && m.role === 'proprietaire'));
        if (a.settings.payoutPhone === old) a.settings.payoutPhone = acc.phone;
        ['mobile-money', 'card'].forEach((id) => {
          const c = a.connectors[id];
          if (c && isObj(c.values) && c.values.payoutPhone === old) { c.values.payoutPhone = acc.phone; c.status = 'off'; }
        });
      }
      a.ownerPhone = acc.phone;
      changed = true;
    }
    // « Mes livreurs » used to keep two couriers in the connector: they are team members (role livraison) now
    const lv = a.connectors.livreurs;
    if (lv && isObj(lv.values) && (lv.values.courier1Phone || lv.values.courier2Phone)) {
      [1, 2].forEach((n) => {
        const ph = normPhone(lv.values['courier' + n + 'Phone']);
        const nm = clip(lv.values['courier' + n + 'Name'], 40);
        if (ph && phoneOk(ph) && !a.settings.team.some((m) => m.phone === ph) && a.settings.team.length < 20) a.settings.team.push({ name: nm || 'Livreur', phone: ph, role: 'livraison' });
      });
      lv.values = {};
      changed = true;
    }
    a.promos = arr(a.promos).filter((x) => isObj(x) && str(x.code)).slice(0, 50).map((x) => ({
      code: clip(x.code, 20).toUpperCase(), kind: x.kind === 'fcfa' ? 'fcfa' : 'pct',
      value: Math.max(0, Math.min(x.kind === 'fcfa' ? 1000000 : 90, Math.round(Number(x.value) || 0))), active: x.active !== false, uses: Math.max(0, Math.round(Number(x.uses) || 0))
    }));
    // The signed-in seller is the owner of the store (not of a client's store she builds: projects.js)
    if (acc && acc.phone && !S.forClient && !a.settings.team.some((m) => m.phone === acc.phone)) {
      a.settings.team.unshift({ name: acc.firstName, phone: acc.phone, role: 'proprietaire' });
      changed = true;
    }
    if (!a.settings.payoutPhone && acc && acc.phone && !S.forClient) { a.settings.payoutPhone = acc.phone; changed = true; }
    // Until the seller chooses her address, it follows the store's name, wherever it was renamed (here or in the Studio)
    if (S.config && a.subdomainChosen !== true && !a.settings.customDomain && D.subdomainFor) {
      const sub = D.subdomainFor(S.config.store.name);
      if (sub && sub !== a.settings.subdomain) { a.settings.subdomain = sub; changed = true; }
    }
    return { admin: a, changed };
  }
  function loadAll() {
    S.now = new Date();
    // A client's store, seen by the agency (projects.js): her own number is never its owner nor its payout
    try { S.forClient = !!(window.JeereProjects && window.JeereProjects.isClientProject()); } catch (e) { S.forClient = false; }
    S.account = readAccount();
    S.config = readConfig();
    const r = readAdmin();
    S.admin = r.admin;
    if (r.changed && isIn()) saveAdmin(true);
    // The account keeps the store's current name, also when it was renamed in the Studio
    const nm = S.config && str(S.config.store.name).trim();
    if (isIn() && nm && S.account.storeName !== nm && !S.forClient) { S.account.storeName = nm; saveAccount(); }
  }
  const isIn = () => !!(S.account && S.account.loggedIn);

  function blocked() {
    if (S.blockedSaid) return;
    S.blockedSaid = true;
    toast('Votre navigateur bloque l’enregistrement : vos changements restent valables jusqu’à ce que vous fermiez la page.', { ms: 6000 });
  }
  // Write the fiche (always normalised). false when it could not be saved (storage full): the caller keeps its form.
  function saveConfig(cfg) {
    let norm = cfg;
    try { norm = D.normalizeConfig(cfg); } catch (e) { norm = cfg; }
    let json;
    try { json = JSON.stringify(norm); } catch (e) { return false; }
    const err = lsSet(KEYS.config, json);
    if (err) {
      if (isQuota(err)) {
        toast('La mémoire de ce navigateur est pleine, surtout à cause des photos. Retirez une photo ou téléchargez la fiche boutique (Paramètres › Données).', { ms: 7000 });
        return false;
      }
      blocked();
    } else S.raw.config = json;
    S.config = norm;
    return true;
  }
  function saveAdmin(quiet) {
    let json;
    try { json = JSON.stringify(S.admin); } catch (e) { return false; }
    const err = lsSet(KEYS.admin, json);
    if (err) { if (!quiet) { if (isQuota(err)) toast('La mémoire de ce navigateur est pleine : ce changement n’a pas pu être enregistré.', { ms: 6000 }); else blocked(); } return !isQuota(err); }
    S.raw.admin = json;
    return true;
  }
  function saveAccount() {
    let json;
    try { json = JSON.stringify(S.account); } catch (e) { return false; }
    const err = lsSet(KEYS.account, json);
    if (err) { blocked(); return false; }
    S.raw.account = json;
    return true;
  }
  // Change the fiche with fn(cfg); returns false (and changes nothing) when it could not be saved
  function editConfig(fn) {
    if (!S.config) return false;
    const cfg = copy(S.config);
    if (!cfg) return false;
    try { fn(cfg); } catch (e) { return false; }
    return saveConfig(cfg);
  }

  /* ------------------------------------------------------------------ data shortcuts */

  const PLANS = () => arr(D && D.PLANS);
  const plan = () => PLANS().find((p) => p.id === (S.account && S.account.plan)) || PLANS()[0] || { id: 'gratuit', name: 'Gratuit', fee: 3, orders: 20, priceMonth: 0, priceLabel: '0 FCFA', feeLabel: '3 % par vente en ligne', ordersLabel: '' };
  const CONNECTORS = () => arr(D && D.CONNECTORS);
  const connector = (id) => CONNECTORS().find((c) => c.id === id) || null;
  function conn(id) {
    const c = S.admin && S.admin.connectors[id];
    return isObj(c) ? c : { status: 'off', values: {}, connectedAt: '' };
  }
  // « Mes livreurs » is connected as soon as there is a courier in the team (role livraison)
  const isOn = (id) => (id === 'livreurs' ? couriers().length > 0 : (id === 'card' && S.stripe && S.stripe.chargesEnabled) || conn(id).status === 'connected');
  const PAYMENTS = () => arr(D && D.PAYMENTS);
  const payLabel = (k) => { const p = PAYMENTS().find((x) => x.key === k); return p ? p.label : str(k); };
  const STATUSES = () => (D && arr(D.ORDER_STATUSES).length ? D.ORDER_STATUSES : [{ id: 'new', label: 'Nouvelle' }, { id: 'paid', label: 'Payée' }, { id: 'shipped', label: 'Expédiée' }, { id: 'delivered', label: 'Livrée' }, { id: 'cancelled', label: 'Annulée' }]);
  const statusLabel = (id) => { const s = STATUSES().find((x) => x.id === id); return s ? s.label : id; };
  const channelLabel = (id) => { const c = arr(D && D.ORDER_CHANNELS).find((x) => x.id === id); return c ? c.label : str(id); };
  // a store of hers that keeps its own site and data (The Ivory Sukundu, ./tishe.js): its views replace these while in view
  // her own designs that sell through a Jeere store (../connect/jeere-connect.js, data-store): the dashboard shows
  // that site, « Personnaliser » opens it in the website editor; the Jeere store holds the products and orders
  const CUSTOM = {
    'anse': { site: 'concepts--anse', live: 'https://kreeative.xyz/concepts/anse/' },
    'joshua-cooker': { site: 'concepts--joshua-cooker', live: 'https://kreeative.xyz/concepts/joshua-cooker/' },
    'sonia-luxury-hair': { site: 'concepts--sonia-luxury-hair', live: 'https://kreeative.xyz/concepts/sonia-luxury-hair/' }
  };
  function customSite() {
    if (EXT()) return null;
    let slug = '';
    try { slug = (JSON.parse(localStorage.getItem('jeere-publish') || '{}') || {}).slug || ''; } catch (e) { slug = ''; }
    return CUSTOM[slug] || null;
  }
  // The founder's own boutiques (MY_SHOPS, The Ivory Sukundu) are shown to HER account only: the `sites-publish`
  // function says who she is (public.site_editors), the answer kept per account for this tab.
  const founder = () => {
    const uid = S.account && S.account.userId ? String(S.account.userId) : '';
    if (!uid) return false;
    try { return sessionStorage.getItem('jeere-sites-editor') === '1:' + uid; } catch (e) { return false; }
  };
  let founderAsked = '';
  function checkFounder() {
    const uid = S.account && S.account.userId ? String(S.account.userId) : '';
    let cached = null;
    try { cached = sessionStorage.getItem('jeere-sites-editor'); } catch (e) { cached = null; }
    if (!uid || founderAsked === uid || cached === '1:' + uid || cached === '0:' + uid) return;
    founderAsked = uid;
    const A = window.JeereAuth;
    Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).then((s) => {
      if (!s || !s.access_token) return null;
      return fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/sites-publish', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ action: 'whoami' }) }).then((r) => r.json());
    }).then((j) => {
      if (!j) return;
      try { sessionStorage.setItem('jeere-sites-editor', (j.editor ? '1:' : '0:') + uid); } catch (e) { /* ok */ }
      if (j.editor) refresh();
    }, () => {});
  }
  const EXT = () => (founder() && window.JeereTishe && window.JeereTishe.on() ? window.JeereTishe : null);
  const storeName = () => (EXT() ? EXT().name : (S.config && S.config.store.name) || (S.account && S.account.storeName) || 'Ma boutique');
  const subdomain = () => EXT() ? EXT().url : (S.admin && S.admin.settings.subdomain) || (D && D.subdomainFor ? D.subdomainFor(storeName()) : 'jeere.kreeative.xyz/b/ma-boutique');
  const findOrder = (id) => S.admin.orders.find((o) => o.id === id) || null;
  const findProduct = (id) => (S.config ? S.config.products.find((p) => p.id === id) : null) || null;
  const findPage = (id) => (S.config ? arr(S.config.pages).find((p) => p.id === id) : null) || null;
  // The product of an order line, only while it is still that product (an id can be given to another one)
  const itemProduct = (it) => { const p = findProduct(it && it.productId); return p && p.name === it.name ? p : null; };
  // A new product id that no product, no order line and no stock entry uses (an old order keeps its own line)
  function freshProductId(cfg) {
    const used = new Set(arr(cfg && cfg.products).map((x) => x.id));
    arr(S.admin && S.admin.orders).forEach((o) => arr(o.items).forEach((i) => used.add(i.productId)));
    Object.keys((S.admin && S.admin.stock) || {}).forEach((k) => used.add(k));
    let n = 1;
    while (used.has('p' + n)) n++;
    return 'p' + n;
  }
  // The logo's ink is measured once in the browser (JEERE_DATA.logoTone): validate then says, as in the
  // Studio, when the logo vanishes on the header or the footer; the screen is drawn again once it is known
  function warmLogoTone() {
    const logo = S.config && isObj(S.config.store) ? S.config.store.logo : null;
    if (!logo || !D.logoTone || !D.logoToneOf || D.logoToneOf(logo) !== undefined) return;
    D.logoTone(logo).then((tone) => { if (typeof tone === 'number' && S.config && S.config.store && S.config.store.logo === logo) refresh(); });
  }
  function validateFiche() { try { warmLogoTone(); return D.validate(S.config); } catch (e) { return { score: 0, status: '', issues: [] }; } }
  // The zones the seller set (a delivery section), or [] when the checkout falls back to the default communes
  function ownZones() {
    const secs = arr(S.config && S.config.sections).filter((s) => s.type === 'delivery');
    const sec = secs.find((s) => s.enabled !== false) || secs[0];
    return sec && isObj(sec.settings) ? arr(sec.settings.zones).filter((z) => isObj(z) && str(z.name).trim()) : [];
  }
  function deliverySection(cfg) {
    const secs = arr(cfg.sections).filter((s) => s.type === 'delivery');
    return secs.find((s) => s.enabled !== false) || secs[0] || null;
  }

  /* ---------- money, couriers and orders: the rules every view shares ---------- */

  const isCod = (o) => !!o && o.payment === 'cod';
  // Couriers are the team members with the « Livraison » role: « Mes livreurs » and Paramètres › Équipe show one list
  function couriers() { return arr(S.admin && S.admin.settings && S.admin.settings.team).filter((m) => m.role === 'livraison' && phoneOk(m.phone)); }
  // Yango and Gozem, when connected: a courier ordered from the order
  function serviceCouriers() { return ['yango', 'gozem'].filter((id) => conn(id).status === 'connected').map((id) => ({ service: id, name: (connector(id) || {}).name || cap(id) })); }
  const courierName = (c) => (c ? (c.service ? ((connector(c.service) || {}).name || c.service) : str(c.name)) : '');
  const paidDeposit = (o) => (o.deposit && o.deposit.paid ? Math.min(o.total || 0, Math.max(0, o.deposit.amount || 0)) : 0);
  // What the courier collects at the door: cash on delivery, less a deposit already paid
  const dueAtDoor = (o) => (isCod(o) && o.status !== 'cancelled' && o.status !== 'delivered' ? Math.max(0, (o.total || 0) - paidDeposit(o)) : 0);
  // Collected (online payments, delivered cash, deposits), due at the door (and the part already with a courier), pending online
  function moneyOf(orders) {
    const m = { collected: 0, due: 0, dueN: 0, withCouriers: 0, pending: 0 };
    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      if (isCod(o)) {
        if (o.status === 'delivered') { m.collected += o.total || 0; return; }
        const d = dueAtDoor(o);
        m.due += d; m.dueN += 1; m.collected += paidDeposit(o);
        if (o.status === 'shipped') m.withCouriers += d;
      } else if (o.status === 'new') m.pending += o.total || 0;
      else m.collected += o.total || 0;
    });
    return m;
  }
  const recentOrders = () => S.admin.orders.filter((o) => { const d = toDate(o.date); return d && S.now - d <= 10 * DAY_MS; });
  const hasDemoOrders = () => S.admin.orders.some((o) => o.manual !== true);
  // Opens WhatsApp (a wa.me link) from a button, in a new tab
  function openWa(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* blocked pop-up: nothing to do */ } }
  const storeUrl = () => 'https://' + subdomain();
  const productUrl = (p) => storeUrl() + '/produits/' + (slugify(p.name) || p.id);

  /* ------------------------------------------------------------------ toasts */

  // Colour codes with a meaning (see ../creer/README.md, « Couleurs d’état »): green done, orange attention,
  // red problem, blue info. A toast gets its small icon from opts.tone, or from its wording when no tone is given.
  const TOAST_TONES = ['ok', 'warn', 'err', 'info'];
  const TOAST_ICO = { ok: 'check', warn: 'alert', err: 'x', info: 'info' };
  function toastTone(msg) {
    const m = String(msg || '');
    if (/pas pu|n’a pas été|n’ont pas été|bloque|pleine|n’est pas disponible|impossible|échoué|annulée/i.test(m)) return 'err';
    if (/à relivrer/i.test(m)) return 'warn';
    if (/d’abord|au plus|Enregistrez ou ignorez|modifiée ailleurs|non enregistrées|Pensez à enregistrer|Sélectionnez le lien/i.test(m)) return 'warn';
    if (/^Démo|bientôt|C’est noté/i.test(m)) return 'info';
    if (/enregistr|ajouté|copié|connecté|téléchargé|activé|créé|confirmée|reçu|rétabli|choisie|supprimé|retiré|prête|effacés|Bienvenue|Statut|Commande #|Code |livrera|Préférences|Numéro|Couleurs|Paiement à la|Abonnement|Vous êtes|fait partie|reconnecté|désactivé|en pause|actif|Domaine|Livraison enregistrée|communes? ajoutée|Modifications ignorées|sont de retour|Texte d’exemple|Déconnexion|Boutique /i.test(m)) return 'ok';
    return '';
  }
  function toast(msg, opts) {
    const o = opts || {};
    const box = $('#a-toasts');
    if (!box) return;
    while (box.children.length >= 2) box.firstChild.remove();
    const t = document.createElement('div');
    const tone = TOAST_TONES.indexOf(o.tone) >= 0 ? o.tone : toastTone(msg);
    t.className = 'a-toast' + (tone ? ' a-toast--' + tone : '');
    if (tone) {
      const i = document.createElement('span');
      i.className = 'a-toast__ico';
      i.setAttribute('aria-hidden', 'true');
      i.innerHTML = ico(TOAST_ICO[tone]);
      t.appendChild(i);
    }
    const m = document.createElement('span');
    m.className = 'a-toast__msg';
    m.textContent = fr(msg);
    t.appendChild(m);
    let timer = null;
    const close = () => { clearTimeout(timer); t.classList.add('is-out'); setTimeout(() => t.remove(), 220); };
    if (o.action && typeof o.onAction === 'function') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'a-toast__btn';
      b.textContent = o.action;
      b.addEventListener('click', () => { close(); try { o.onAction(); } catch (e) { /* ignore */ } });
      t.appendChild(b);
    }
    box.appendChild(t);
    timer = setTimeout(close, o.ms || (o.action ? 6500 : 3200));
  }

  // A polite announcement for screen readers (reordering, live counts)
  function announce(msg) {
    const l = $('#a-live');
    if (!l) return;
    l.textContent = '';
    setTimeout(() => { l.textContent = fr(msg); }, 40);
  }

  /* ------------------------------------------------------------------ dialogs (native <dialog>) */

  let dlgReturn = null;
  let dlgOnClose = null;
  function dialogEl() { return $('#a-dialog'); }
  function openDialog(html, opts) {
    const o = opts || {};
    const dlg = dialogEl();
    if (!dlg) return null;
    if (dlg.open) closeDialog(true);
    dlgReturn = document.activeElement;
    dlgOnClose = typeof o.onClose === 'function' ? o.onClose : null;
    dlg.className = 'a-dialog' + (o.wide ? ' a-dialog--wide' : '') + (o.sheet ? ' a-dialog--sheet' : '');
    dlg.innerHTML = html;
    if (o.labelledby) dlg.setAttribute('aria-labelledby', o.labelledby);
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    document.documentElement.classList.add('a-locked');
    const first = $(o.focus || '[data-autofocus]', dlg) || $('input:not([type=hidden]), select, textarea, button:not([data-close])', dlg);
    if (first) { try { first.focus(); } catch (e) { /* ignore */ } }
    return dlg;
  }
  // silent: closing to open another one, or after a navigation: do not move the focus
  function closeDialog(silent) {
    const dlg = dialogEl();
    if (!dlg) return;
    const cb = dlgOnClose;
    dlgOnClose = null;
    if (dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } }
    afterDialogClose(silent);
    if (cb) { try { cb(); } catch (e) { /* ignore */ } }
  }
  function afterDialogClose(silent) {
    if (!$('dialog[open]')) document.documentElement.classList.remove('a-locked');
    const back = dlgReturn;
    dlgReturn = null;
    if (silent) return;
    if (back && document.contains(back) && back.getClientRects().length) { try { back.focus(); } catch (e) { /* ignore */ } }
    else focusMain();
  }
  function dlgHead(id, title) {
    return H`<div class="a-dialog__head"><h2 class="a-dialog__title" id="${id}">${esc(fr(title))}</h2><button class="a-ibtn" type="button" data-close aria-label="Fermer">${ico('x')}</button></div>`;
  }
  // Confirm: resolves true (ok) or false
  function confirmBox(o) {
    return new Promise((resolve) => {
      let answered = false;
      const html = H`<div class="a-dialog__card" role="alertdialog" aria-labelledby="dc-t" aria-describedby="dc-d">
        ${dlgHead('dc-t', o.title)}
        <div class="a-dialog__body"><p class="a-dialog__lead" id="dc-d">${o.html || esc(fr(o.text || ''))}</p></div>
        <div class="a-dialog__foot">
          <button class="a-btn a-btn--ghost" type="button" data-close>${esc(o.cancel || 'Annuler')}</button>
          <button class="a-btn a-btn--primary" type="button" data-confirm data-autofocus>${o.danger ? ico('trash') : ''}${esc(o.ok || 'Confirmer')}</button>
        </div></div>`;
      const dlg = openDialog(html, { onClose: () => { if (!answered) resolve(false); } });
      if (!dlg) { resolve(false); return; }
      const yes = $('[data-confirm]', dlg);
      // Destructive: focus the safe choice first
      if (o.danger) { const no = $('[data-close]:not(.a-ibtn)', dlg); if (no) no.focus(); }
      yes.addEventListener('click', () => { answered = true; closeDialog(true); resolve(true); });
    });
  }
  function actionSheet(title, items) {
    const html = H`<div class="a-dialog__card">${dlgHead('as-t', title)}<ul class="a-actions">${items.map((it) => it.href
      ? H`<li><a class="a-action" href="${esc(it.href)}" data-close-nav>${ico(it.icon)}${esc(it.label)}</a></li>`
      : H`<li><button class="a-action${it.danger ? ' a-action--danger' : ''}" type="button" data-sheet="${esc(it.id)}">${ico(it.icon)}${esc(it.label)}</button></li>`)}</ul></div>`;
    const dlg = openDialog(html, { sheet: true, labelledby: 'as-t' });
    if (!dlg) return;
    items.forEach((it) => {
      if (!it.run) return;
      const b = $('[data-sheet="' + it.id + '"]', dlg);
      if (b) b.addEventListener('click', () => { closeDialog(true); it.run(); });
    });
  }

  /* ------------------------------------------------------------------ the editor link */

  // Open the editor on a page: one-shot instruction read (and deleted) by ../creer/
  function openEditor(ins) {
    if (S.dirty) { nudgeSave(); return; }
    const o = { page: ins.page || 'home' };
    if (ins.pageId) o.pageId = ins.pageId;
    if (ins.productId) o.productId = ins.productId;
    if (ins.view) o.view = ins.view;
    if (ins.focus === 'logo') o.focus = 'logo';
    lsSet(KEYS.open, JSON.stringify(o));
    window.location.href = EDITOR_URL;
  }

  /* ------------------------------------------------------------------ dirty forms and drafts */

  function setDirty(form) {
    if (!form) return;
    S.dirty = { form: form.getAttribute('data-form') };
    const bar = $('#a-savebar');
    const txt = $('#a-savebar-txt');
    if (txt) txt.textContent = form.getAttribute('data-dirty-label') || 'Modifications non enregistrées';
    if (bar) bar.hidden = false;
    document.documentElement.classList.add('has-savebar');
  }
  function clearDirty() {
    S.dirty = null;
    const bar = $('#a-savebar');
    if (bar) bar.hidden = true;
    document.documentElement.classList.remove('has-savebar');
  }
  function nudgeSave() {
    const bar = $('#a-savebar');
    if (!bar || bar.hidden) return;
    bar.classList.remove('is-shake');
    void bar.offsetWidth;
    bar.classList.add('is-shake');
    toast('Enregistrez ou ignorez d’abord vos modifications.');
  }
  function dirtyForm() { return S.dirty ? $('#a-main form[data-form="' + S.dirty.form + '"]') : null; }
  // A form's values: { name: value } (checkboxes: booleans; repeated names: arrays)
  function serialize(form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if (el.type === 'checkbox') { out[el.name] = el.checked; return; }
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; return; }
      if (Object.prototype.hasOwnProperty.call(out, el.name)) out[el.name] = [].concat(out[el.name], el.value);
      else out[el.name] = el.value;
    });
    return out;
  }
  // Leaving a form with changes (Back button, a link): keep them as a draft for this address
  // leaving: true when the seller goes to another address (a toast offers to come back); false for a
  // re-render of the same address (an edit elsewhere on the page): the form comes back as it was.
  function stashDraft(leaving) {
    const f = dirtyForm();
    if (!f || S.hash == null) { clearDirty(); return; }
    S.drafts[S.hash] = { form: f.getAttribute('data-form'), values: serialize(f) };
    const back = S.hash;
    clearDirty();
    if (leaving) toast('Modifications non enregistrées gardées en brouillon.', { action: 'Y revenir', onAction: () => go(back) });
  }
  function takeDraft(form) {
    const d = S.drafts[S.hash];
    if (!d || d.form !== form) return null;
    delete S.drafts[S.hash];
    S.restored = form;
    return d.values;
  }
  // value from the draft when there is one
  const pick = (draft, key, def) => (draft && Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : def);

  /* ------------------------------------------------------------------ router */

  function parseHash() {
    let h = '';
    try { h = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '')); } catch (e) { h = (window.location.hash || '').slice(1); }
    const query = {};
    const qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) query[kv.slice(0, i)] = kv.slice(i + 1); });
      h = h.slice(0, qi);
    }
    const parts = h.split('/').filter(Boolean);
    const name = ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : 'accueil';
    return { name, parts: name === parts[0] ? parts.slice(1) : [], query, hash: name === parts[0] ? h : 'accueil' };
  }
  function go(hash) {
    const h = '#' + String(hash).replace(/^#/, '');
    if (window.location.hash === h) render(parseHash(), true);
    else window.location.hash = h;
  }
  const visible = (el) => !!el && el.getClientRects().length > 0;
  function focusMain() {
    const t = $$('#a-main [data-autofocus]').find(visible) || $$('#a-main h1').find(visible) || $('#a-main h1');
    if (t) { try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  function render(r, focus) {
    if (!S.inApp) return;
    // The dashboard tour is on the home page: going elsewhere ends it
    if (r.name !== 'accueil' && window.JeereTour && window.JeereTour.isOpen() && (window.JeereTour.current() || {}).id === 'admin') window.JeereTour.stop('outside');
    S.now = new Date();
    closeAcct();
    closeSearch();
    if ($('#a-more') && $('#a-more').open) { try { $('#a-more').close(); } catch (e) { /* ignore */ } }
    if (dialogEl() && dialogEl().open) closeDialog(true);
    const main = $('#a-main');
    // The field being typed in fires « change » when it leaves: blur it now, while its form is still the
    // dirty one, so that event cannot mark the next page dirty (the phone's Back button while typing)
    const ae = document.activeElement;
    if (ae && ae !== document.body && main && main.contains(ae)) { try { ae.blur(); } catch (e) { /* ignore */ } }
    if (S.dirty) stashDraft(S.hash !== r.hash);
    S.route = r;
    S.hash = r.hash;
    S.mounts = [];
    S.restored = null;
    let html;
    try { html = EXT() ? EXT().view(r) : VIEWS[r.name](r); } catch (e) { html = errorView(); }
    S.rendering = true;
    try { main.innerHTML = html; } finally { S.rendering = false; }
    S.mounts.forEach((fn) => { try { fn(); } catch (e) { /* a view's extra never breaks the page */ } });
    // A restored draft is still unsaved
    if (S.restored) { const f = $('#a-main form[data-form="' + S.restored + '"]'); if (f) setDirty(f); }
    updateShell();
    const h1 = $$('#a-main h1').find(visible) || $('#a-main h1');
    document.title = (h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : TITLES[r.name]) + ' · Jeere';
    if (focus !== false) {
      try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
      if (focus) focusMain();
    }
  }
  // Re-render the current route in place (after an edit): keeps the scroll, focuses sel when given
  function refresh(sel) {
    if (!S.route) return;
    const y = window.scrollY;
    render(S.route, false);
    try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
    if (sel) { const el = $(sel, $('#a-main')); if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }
  function errorView() {
    return H`<div class="a-page"><div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('alert')}</span>
      <h1 class="a-empty__title" tabindex="-1">Cette page n’a pas pu s’afficher</h1>
      <p class="a-empty__text">Vos données sont intactes. Revenez à l’accueil ou rechargez la page.</p>
      <div class="a-btnrow"><a class="a-btn a-btn--primary" href="#accueil">Retour à l’accueil</a></div></div></div></div>`;
  }
  function notFound(title, href, label) {
    return H`<div class="a-page"><div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('search')}</span>
      <h1 class="a-empty__title" tabindex="-1">${esc(title)}</h1>
      <p class="a-empty__text">Elle a peut-être été supprimée, ou modifiée dans un autre onglet.</p>
      <div class="a-btnrow"><a class="a-btn a-btn--primary" href="${href}">${esc(label)}</a></div></div></div></div>`;
  }
  // Routes that need a store
  function needStore(title) {
    return H`<div class="a-page"><header class="a-ph"><div class="a-ph__txt"><h1 class="a-h1" tabindex="-1">${esc(title)}</h1></div></header>${noStoreCard()}</div>`;
  }
  function noStoreCard() {
    return H`<section class="a-card"><div class="a-empty">
      <span class="a-empty__ico">${ico('store')}</span>
      <h2 class="a-empty__title">Créez d’abord votre boutique</h2>
      <p class="a-empty__text">Choisissez un modèle ou décrivez votre boutique à l’assistant : vos produits, vos pages et vos réglages apparaîtront ici.</p>
      <div class="a-btnrow">
        <a class="a-btn a-btn--primary" href="${EDITOR_URL}">${ico('grid')}Choisir un modèle</a>
        <a class="a-btn a-btn--ghost" href="${EDITOR_URL}#assistant">${ico('sparkle')}Discuter avec l’assistant</a>
        <button class="a-btn a-btn--quiet" type="button" data-act="start-example">Utiliser la boutique d’exemple</button>
      </div></div></section>`;
  }

  /* ------------------------------------------------------------------ shell */

  function storeLogo() {
    if (EXT()) return EXT().thumb;
    try { const b = D && typeof D.brand === 'function' && S.config ? D.brand(S.config) : null; return b && b.logo ? b.logo : null; } catch (e) { return null; }
  }
  function todoCount() { if (EXT()) return EXT().todo(); return S.admin ? S.admin.orders.filter((o) => o.status === 'new' || o.status === 'paid').length : 0; }
  function updateShell() {
    const name = storeName();
    $$('[data-bind="store-name"]').forEach((n) => { n.textContent = name; });
    // The store's avatar: her logo (store.logo) when she has one, else the initial of the store name
    const logo = storeLogo();
    $$('[data-bind="store-initial"]').forEach((n) => {
      n.classList.toggle('has-img', !!logo);
      if (logo) {
        const img = n.querySelector('img');
        if (img && img.getAttribute('src') === logo) return;
        n.textContent = '';
        const i = document.createElement('img');
        i.src = logo; i.alt = '';
        n.append(i);
      } else n.textContent = initials(name).charAt(0) || 'J';
    });
    $$('[data-bind="store-url"]').forEach((n) => { n.textContent = subdomain(); });
    updateProjShell();
    document.body.classList.toggle('is-ext', !!EXT());
    const acc = S.account || {};
    $$('[data-bind="user-name"]').forEach((n) => { n.textContent = acc.firstName || 'Mon compte'; });
    $$('[data-bind="user-initial"]').forEach((n) => { n.textContent = initials(acc.firstName || name).charAt(0) || 'J'; });
    const todo = todoCount();
    $$('[data-bind="todo-count"]').forEach((n) => { n.hidden = !todo; n.textContent = String(todo); n.setAttribute('aria-label', plural(todo, 'commande à préparer', 'commandes à préparer')); });
    $$('[data-bind="todo-dot"]').forEach((n) => { n.hidden = !todo; });
    const cur = S.route ? S.route.name : 'accueil';
    $$('[data-nav]').forEach((a) => { if (a.getAttribute('data-nav') === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('[data-tab]').forEach((a) => {
      const t = a.getAttribute('data-tab');
      const on = t === 'plus' ? !TABS[cur] : t === cur;
      if (t === 'plus') a.classList.toggle('is-current', on);
      else if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('[data-more]').forEach((a) => { if (a.getAttribute('data-more') === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  // Account menu
  function closeAcct() {
    const m = $('#a-acct-menu');
    const b = $('#a-acct-btn');
    if (m && !m.hidden) { m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  }
  function toggleAcct() {
    const m = $('#a-acct-menu');
    const b = $('#a-acct-btn');
    if (!m || !b) return;
    if (!m.hidden) { closeAcct(); return; }
    const acc = S.account || {};
    const p = plan();
    m.innerHTML = H`<div class="a-acct__head"><span class="a-avatar">${esc(initials(acc.firstName || storeName()).charAt(0))}</span>
        <span class="a-acct__who"><strong>${esc(acc.firstName || 'Mon compte')}</strong><span>${esc(phoneFmt(acc.phone) || 'Numéro non renseigné')}</span></span></div>
      <div class="a-acct__plan"><span>Formule <strong>${esc(p.name)}</strong>${S.admin && S.admin.settings.billing.paused ? ' · en pause' : ''}</span><a class="a-link" href="#parametres/abonnement">Changer</a></div>
      <a class="a-menu-item" href="#parametres">${ico('gear')}Paramètres</a>
      <button class="a-menu-item" type="button" data-act="view-store">${ico('eye')}Voir la boutique</button>
      <button class="a-menu-item" type="button" data-act="share-store">${ico('share')}Partager ma boutique</button>
      <button class="a-menu-item" type="button" data-act="help">${ico('help')}Aide · une vraie personne sur WhatsApp</button>
      <a class="a-menu-item" href="${EDITOR_URL}">${ico('palette')}Ouvrir le Studio</a>
      <a class="a-menu-item" href="#parametres/studio">${ico('sparkle')}Studio avancé · ${esc(studioHint())}</a>
      <a class="a-menu-item" href="../">${ico('home')}Retour à Jeere</a>
      <div class="a-menu-sep" role="separator"></div>
      <button class="a-menu-item" type="button" data-act="logout">${ico('logout')}Se déconnecter</button>`;
    m.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    const first = $('.a-menu-item, a', m);
    if (first) first.focus();
  }

  /* ---------- client projects: the switcher (../creer/projects.js) ---------- */

  const PJ = () => window.JeereProjects || null;
  const ROLE_LABEL = { owner: 'Propriétaire', agency: 'Agence', editor: 'Éditeur' };
  const STATUS_LABEL = { proposition: 'Proposition', en_cours: 'En cours', livre: 'Livré' };
  const MODE_LABEL = { entretien: 'Avec pack entretien', remis: 'Remise complète', editor: 'Modification seule' };
  const projName = (e) => (e && (e.clientName || e.storeName || e.slug)) || 'Ma boutique';
  function projCurrent() { try { return PJ() ? PJ().current() : null; } catch (e) { return null; } }
  function projList() { try { return PJ() ? PJ().list() : []; } catch (e) { return []; } }
  function projMeta(e) {
    const bits = [ROLE_LABEL[e.role] || 'Propriétaire'];
    // the status is a client project's (her own shop has none to show)
    if (e.status && (e.role !== 'owner' || (e.clientName && !e.handoff))) bits.push(STATUS_LABEL[e.status]);
    if (!e.remote) bits.push('dans ce navigateur');
    return bits.join(' · ');
  }
  const MY_SHOPS = [
    { name: 'The Ivory Sukundu', meta: 'theivorysukundu.com · commandes, produits, codes', ext: true, thumb: '../studio/sites/thumbs/live--the-ivory-sukundu.webp' },
    { name: 'Sonia Luxury Hair', slug: 'sonia-luxury-hair', meta: 'Son site · kreeative.xyz/concepts/sonia-luxury-hair', thumb: '../studio/sites/thumbs/concepts--sonia-luxury-hair.webp' },
    { name: 'Joshua Cooker', slug: 'joshua-cooker', meta: 'Son site · kreeative.xyz/concepts/joshua-cooker', thumb: '../studio/sites/thumbs/concepts--joshua-cooker.webp' },
    { name: 'ANSE', slug: 'anse', meta: 'Boutique de démonstration · kreeative.xyz/concepts/anse', thumb: '../studio/sites/thumbs/concepts--anse.webp' }
  ];
  // a boutique of hers not yet in the list: its project is made once (her name on it), then it is a project like the others
  function openShopProject(el) {
    if (S.dirty) { closeProj(); closeDialog(true); nudgeSave(); return; }
    const name = el.getAttribute('data-name'), slug = el.getAttribute('data-slug');
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!PJ()) { toast('Les projets ne sont pas disponibles sur cette page.'); return; }
    if (window.JeereTishe) window.JeereTishe.leave();
    closeProj(); closeDialog(true);
    const fetchStore = () => !slug ? Promise.resolve(null) : fetch('https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/stores?select=id,slug,fiche,published,published_at&slug=eq.' + encodeURIComponent(slug) + '&limit=1',
      { headers: { apikey: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w' } }).then((r) => (r.ok ? r.json() : [])).then((rows) => (rows && rows[0]) || null, () => null);
    const found = projList().find((e) => norm(projName(e)) === norm(name));
    const open = found ? PJ().switchTo(found.id) : PJ().create({ clientName: name });
    Promise.all([open, fetchStore()]).then(([r, row]) => {
      if (!r.ok) { toast(r.message || 'Cette boutique n’a pas pu s’ouvrir.'); return; }
      // the store in this project is her real one: its fiche (products, prices, texts) and its address
      if (row && row.fiche) {
        try {
          localStorage.setItem(KEYS.config, JSON.stringify(row.fiche));
          const pub = JSON.parse(localStorage.getItem('jeere-publish') || '{}') || {};
          localStorage.setItem('jeere-publish', JSON.stringify(Object.assign(pub, { version: 1, slug: row.slug, storeId: row.id, published: !!row.published, publishedAt: row.published_at || '' })));
        } catch (e) { /* storage full: the project keeps what it had */ }
      } else if (slug) toast('La boutique en ligne n’a pas pu être lue : réessayez avec une connexion.');
      afterProjectChange('Boutique ouverte : ' + name + '.');
    });
  }
  function projListHTML() {
    const cur = projCurrent();
    const items = projList();
    // her boutiques: always in the list. The Ivory Sukundu has its own dashboard (its own site); the others open here
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const have = new Set(items.map((e) => norm(projName(e))));
    checkFounder();
    const mine = founder() ? MY_SHOPS : [];
    const shops = mine.filter((x) => x.ext || x.slug || !have.has(norm(x.name)));
    const shopNames = new Set(mine.map((x) => norm(x.name)));
    return H`${shops.length ? H`<p class="a-proj__title" id="pj-sh">Mes boutiques</p>` : ''}
      <ul class="a-proj__list" aria-labelledby="pj-sh"${shops.length ? '' : ' hidden'}>${shops.map((x) => x.ext
        ? H`<li><button class="a-proj__item" type="button" data-act="proj-ext"${EXT() ? ' aria-current="true"' : ''}>
          <span class="a-proj__av a-proj__av--img" aria-hidden="true"><img alt="" src="${esc(x.thumb)}"></span>
          <span class="a-proj__txt"><span class="a-proj__name">${esc(x.name)}</span><span class="a-proj__meta">${esc(x.meta)}</span></span>
          ${EXT() ? ico('check', 'a-proj__check') : ''}</button></li>`
        : H`<li><button class="a-proj__item" type="button" data-act="proj-shop" data-name="${esc(x.name)}" data-slug="${esc(x.slug || '')}">
          <span class="a-proj__av a-proj__av--img" aria-hidden="true"><img alt="" src="${esc(x.thumb)}"></span>
          <span class="a-proj__txt"><span class="a-proj__name">${esc(x.name)}</span><span class="a-proj__meta">${esc(x.meta)}</span></span></button></li>`)}</ul>
      <div class="a-menu-sep" role="separator"></div>
      <p class="a-proj__title" id="pj-t">Projets</p>
      ${items.filter((e) => !shopNames.has(norm(projName(e)))).length ? H`<ul class="a-proj__list" aria-labelledby="pj-t">${items.filter((e) => !shopNames.has(norm(projName(e)))).map((e) => {
        const on = !EXT() && cur && cur.id === e.id;
        return H`<li><button class="a-proj__item" type="button" data-act="proj-switch" data-id="${esc(e.id)}"${on ? ' aria-current="true"' : ''}>
          <span class="a-proj__av" aria-hidden="true">${esc(initials(projName(e)).charAt(0) || 'J')}</span>
          <span class="a-proj__txt"><span class="a-proj__name">${esc(projName(e))}</span><span class="a-proj__meta">${esc(fr(projMeta(e)))}</span></span>
          ${on ? ico('check', 'a-proj__check') : ''}</button></li>`;
      })}</ul>` : H`<p class="a-small" style="padding:4px 10px 8px">Aucun projet pour l’instant.</p>`}
      <div class="a-menu-sep" role="separator"></div>
      ${cur ? H`<button class="a-menu-item" type="button" data-act="proj-manage">${ico('gear')}Gérer ce projet</button>` : ''}
      <button class="a-menu-item" type="button" data-act="proj-new">${ico('plus')}Nouveau projet client</button>`;
  }
  function closeProj() {
    const m = $('#a-proj-menu');
    const b = $('#a-proj-btn');
    if (m && !m.hidden) { m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  }
  function openProjects(el) {
    // The left menu (computer): a list under the button. The phone's top bar: a sheet.
    if (el && el.id === 'a-proj-btn') {
      const m = $('#a-proj-menu');
      if (!m) return;
      if (!m.hidden) { closeProj(); return; }
      closeAcct();
      m.innerHTML = projListHTML();
      m.hidden = false;
      el.setAttribute('aria-expanded', 'true');
      const first = $('[aria-current="true"], .a-proj__item, .a-menu-item', m);
      if (first) first.focus();
      return;
    }
    openDialog(H`<div class="a-dialog__card a-proj--sheet">${dlgHead('pjs-t', 'Changer de projet')}<div class="a-dialog__body">${projListHTML()}</div></div>`, { sheet: true, labelledby: 'pjs-t' });
  }
  // After a switch (here, or a refresh that changed the store in view): everything is read again
  function afterProjectChange(msg) {
    closeProj();
    clearDirty();
    S.drafts = {};
    loadAll();
    if (!S.inApp) return;
    if (window.location.hash !== '#accueil') go('#accueil'); else render(parseHash(), true);
    if (msg) toast(msg);
  }
  function switchProject(id) {
    if (S.dirty) { closeProj(); closeDialog(true); nudgeSave(); return; }
    const cur = projCurrent();
    if (EXT()) { window.JeereTishe.leave(); if (cur && cur.id === id) { afterProjectChange('Projet ouvert : ' + projName(cur) + '.'); return; } }
    if (cur && cur.id === id) { closeProj(); closeDialog(true); return; }
    closeDialog(true);
    PJ().switchTo(id).then((r) => {
      if (!r.ok) { toast(r.message || 'Ce projet n’a pas pu s’ouvrir.'); return; }
      afterProjectChange('Projet ouvert : ' + projName(r.entry) + '.');
    });
  }

  // « Nouveau projet client »: the client's name and a template; the store is created under her account
  function openNewProject() {
    if (S.dirty) { closeProj(); nudgeSave(); return; }
    closeProj();
    const tpls = D.templates || {};
    const ids = Object.keys(tpls).filter((k) => tpls[k] && tpls[k].name);
    const html = H`<form class="a-dialog__card" data-dform="newproject" novalidate>${dlgHead('np-t', 'Nouveau projet client')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Le site est créé sous votre compte. Vous le montrez au client avec un lien d’aperçu privé, puis vous lui donnez l’accès.</p>
        <div class="a-field"><label class="a-label" for="np-name">Nom du client</label><input class="a-input" id="np-name" name="client" maxlength="80" autocomplete="off" placeholder="Ex. : Sonia Luxury Hair" data-autofocus></div>
        <fieldset class="a-fieldset"><legend>Modèle</legend><div class="a-radios">${ids.map((k, i) => H`<label class="a-radio"><input type="radio" name="template" value="${esc(k)}"${i === 0 ? ' checked' : ''}><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">${esc(tpls[k].name)}${tpls[k].style ? ' · ' + esc(tpls[k].style) : ''}</span><span class="a-radio__hint">${esc(fr(tpls[k].bestFor || tpls[k].description || ''))}</span></span></label>`)}</div></fieldset>
      </div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">${ico('plus')}Créer le projet</button></div></form>`;
    openDialog(html, { labelledby: 'np-t', focus: '#np-name' });
  }
  function saveNewProject(form) {
    clearErrors(form);
    const v = serialize(form);
    const name = clip(v.client, 80);
    if (!name) { invalid(form.elements.client, 'Écrivez le nom du client.'); focusFirstError(form); return; }
    const btn = $('button[type="submit"]', form);
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    PJ().create({ clientName: name, template: v.template }).then((r) => {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      if (!r.ok) { invalid(form.elements.client, r.message || 'Le projet n’a pas pu être créé.'); focusFirstError(form); return; }
      closeDialog(true);
      afterProjectChange('Projet créé : ' + name + '. Vous travaillez maintenant dessus.' + (r.remote ? '' : ' (Enregistré dans ce navigateur.)'));
    });
  }

  // « Gérer ce projet »: status, private preview, invite the client, the agency's access
  function openProject() {
    closeProj();
    const e = projCurrent();
    if (!e) { openNewProject(); return; }
    const url = PJ().previewUrl(e);
    // the project's status is the agency's business (her project, or her access); a client's own store has none
    const canManage = e.role === 'agency' || (e.role === 'owner' && !!e.clientName && !e.handoff);
    const invites = e.invites || [];
    const html = H`<div class="a-dialog__card">${dlgHead('pm-t', projName(e))}
      <div class="a-dialog__body a-pm">
        <p class="a-pm__role"><span class="a-chip a-chip--ink">${esc(ROLE_LABEL[e.role] || 'Propriétaire')}</span>${e.handoff === 'entretien' ? H` <span class="a-chip a-chip--line">Pack entretien</span>` : ''}${e.handoff === 'remis' ? H` <span class="a-chip a-chip--line">Remis au client</span>` : ''}</p>
        ${e.role === 'agency' ? H`<p class="a-note">${ico('info')}<span>Le client est propriétaire de la boutique : ses ventes vont sur son compte. Vous gardez un accès Agence pour la modifier. Il peut le retirer.${e.owner ? ' Propriétaire : ' + esc(e.owner) + '.' : ''}</span></p>` : ''}
        ${e.role === 'editor' ? H`<p class="a-note">${ico('info')}<span>Vous pouvez modifier et publier cette boutique. Elle appartient à ${esc(e.owner || 'sa propriétaire')}.</span></p>` : ''}
        ${canManage ? H`<div class="a-field"><label class="a-label" for="pm-status">Statut du projet</label><div class="a-selectwrap"><select class="a-input" id="pm-status" data-projstatus>${['proposition', 'en_cours', 'livre'].map((s) => H`<option value="${s}"${(e.status || 'en_cours') === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`)}</select>${ico('down')}</div></div>` : ''}
        <section class="a-pm__sec" aria-labelledby="pm-prev"><h3 class="a-pm__h" id="pm-prev">${ico('eye')}Aperçu privé</h3>
          ${url ? H`<p class="a-small">Un lien pour montrer le site au client, même s’il n’est pas encore en ligne. Seules les personnes qui ont ce lien le voient.</p>
            <div class="a-copy"><label class="a-sr" for="pm-url">Lien d’aperçu privé</label><input class="a-input" id="pm-url" value="${esc(url)}" readonly>
              <button class="a-btn a-btn--primary" type="button" data-act="proj-copy">${ico('copy')}Copier le lien</button></div>
            <p class="a-small"><a class="a-link" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir l’aperçu ${ico('external')}</a></p>`
            : H`<p class="a-small">${e.remote ? 'Le lien arrive dans un instant : rouvrez cette fenêtre.' : 'Connectez-vous à votre compte Jeere : le projet est alors enregistré sur Jeere et reçoit son lien d’aperçu.'}</p>`}
        </section>
        ${e.role === 'owner' ? H`<section class="a-pm__sec" aria-labelledby="pm-inv"><h3 class="a-pm__h" id="pm-inv">${ico('user')}Accès du client</h3>
          ${invites.length ? H`<ul class="a-pm__invites">${invites.map((i) => H`<li><span><strong>${esc(i.email)}</strong><span class="a-small"> · ${esc(MODE_LABEL[i.mode] || '')} · en attente</span></span>
            <button class="a-btn a-btn--quiet a-btn--sm" type="button" data-act="proj-cancel-invite" data-invite="${esc(i.id)}">Annuler</button></li>`)}</ul>
            <p class="a-small">Le client se connecte à Jeere avec cette adresse e-mail : le projet s’ouvre chez lui.</p>` : ''}
          ${!e.agency ? H`<button class="a-btn a-btn--primary" type="button" data-act="proj-invite">${ico('share')}Inviter le client</button>` : ''}
          ${e.agency ? H`<p class="a-small"><strong>${esc(e.agency)}</strong> a un accès Agence : cette personne peut encore modifier votre boutique (pack entretien). Vos ventes vont toujours sur votre compte.</p>
            <button class="a-btn a-btn--ghost" type="button" data-act="proj-remove-agency">${ico('lock')}Retirer l’accès Agence</button>` : ''}
        </section>` : ''}
      </div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Fermer</button></div></div>`;
    openDialog(html, { labelledby: 'pm-t', wide: true });
  }
  function copyPreview() {
    const i = $('#pm-url');
    if (!i) return;
    const fallback = () => { i.focus(); i.select(); toast('Sélectionnez le lien puis copiez-le.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(i.value).then(() => toast('Lien d’aperçu copié.'), fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function setProjStatus(sel) {
    const e = projCurrent();
    if (!e) return;
    PJ().setStatus(e.id, sel.value).then((r) => toast(r.ok ? 'Statut du projet : ' + STATUS_LABEL[sel.value] + '.' : (r.message || 'Le statut n’a pas pu être changé.')));
  }

  // « Inviter le client »: an e-mail and how the site is handed over
  function openInvite() {
    const e = projCurrent();
    if (!e) return;
    const html = H`<form class="a-dialog__card" data-dform="projinvite" novalidate>${dlgHead('pi-t', 'Inviter le client')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Le client reçoit l’accès en se connectant à Jeere avec cette adresse e-mail. Ses ventes vont toujours sur son propre compte (mobile money, carte), jamais sur le vôtre.</p>
        <div class="a-field"><label class="a-label" for="pi-email">E-mail du client</label><input class="a-input" id="pi-email" name="email" type="email" inputmode="email" autocomplete="off" maxlength="254" placeholder="client@exemple.com" data-autofocus></div>
        <fieldset class="a-fieldset"><legend>Comment remettre le site</legend><div class="a-radios">
          <label class="a-radio"><input type="radio" name="mode" value="entretien" checked><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">Avec pack entretien</span><span class="a-radio__hint">${esc(fr('Le client devient propriétaire : son tableau de bord, ses paiements. Vous gardez un accès Agence pour continuer à modifier le site. Il peut le retirer quand il veut.'))}</span></span></label>
          <label class="a-radio"><input type="radio" name="mode" value="remis"><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">Remise complète</span><span class="a-radio__hint">${esc(fr('Le client a tout. Votre accès est retiré : vous ne voyez plus ce projet.'))}</span></span></label>
        </div></fieldset>
        ${e.remote ? '' : H`<p class="a-small" style="margin-top:12px">Démo : l’invitation reste dans ce navigateur. Connectez-vous pour l’envoyer pour de vrai.</p>`}
      </div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Inviter</button></div></form>`;
    openDialog(html, { labelledby: 'pi-t', focus: '#pi-email' });
  }
  function refillInvite(email, mode, msg) {
    if (!$('form[data-dform="projinvite"]')) openInvite();
    const f = $('form[data-dform="projinvite"]');
    if (!f) return;
    f.elements.email.value = email;
    const m = $('input[value="' + mode + '"]', f);
    if (m) m.checked = true;
    if (msg) { invalid(f.elements.email, msg); focusFirstError(f); }
  }
  async function saveProjInvite(form) {
    clearErrors(form);
    const e = projCurrent();
    if (!e) return;
    const v = serialize(form);
    const email = str(v.email).trim().toLowerCase();
    const mode = v.mode === 'remis' ? 'remis' : 'entretien';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { invalid(form.elements.email, 'Écrivez l’adresse e-mail du client, par exemple sonia@exemple.com.'); focusFirstError(form); return; }
    if (S.account && S.account.email && S.account.email === email) { invalid(form.elements.email, 'C’est votre propre adresse : écrivez celle du client.'); focusFirstError(form); return; }
    if (mode === 'remis') {
      const ok = await confirmBox({ title: 'Remise complète ?', text: 'Quand ' + projName(e) + ' acceptera l’invitation, vous perdrez l’accès à ce projet : vous ne pourrez plus le voir ni le modifier.', ok: 'Oui, tout remettre', cancel: 'Retour' });
      if (!ok) { refillInvite(email, mode); return; }
    }
    const r = await PJ().invite(e.id, email, mode);
    if (!r.ok) { refillInvite(email, mode, r.message || 'L’invitation n’a pas pu être enregistrée.'); return; }
    closeDialog(true);
    openProject();
    toast(r.remote ? 'Invitation enregistrée pour ' + email + '. Prévenez votre client : il se connecte à Jeere avec cette adresse.' : 'Démo : invitation enregistrée dans ce navigateur pour ' + email + '.', { ms: 6500, tone: 'ok' });
  }
  function cancelProjInvite(el) {
    const e = projCurrent();
    if (!e) return;
    PJ().cancelInvite(e.id, el.getAttribute('data-invite')).then((r) => { if (r.ok) { openProject(); toast('Invitation annulée.', { tone: 'ok' }); } else toast(r.message || 'L’invitation n’a pas pu être annulée.'); });
  }
  async function removeAgencyAccess() {
    const e = projCurrent();
    if (!e || !e.agency) return;
    const ok = await confirmBox({ title: 'Retirer l’accès Agence ?', text: e.agency + ' ne pourra plus voir ni modifier votre boutique. Votre boutique, vos commandes et vos paiements ne changent pas.', ok: 'Retirer l’accès', danger: true });
    if (!ok) { openProject(); return; }
    const r = await PJ().removeAgency(e.id);
    if (!r.ok) { toast(r.message || 'L’accès n’a pas pu être retiré.'); return; }
    openProject();
    toast('Accès Agence retiré.');
  }
  function updateProjShell() {
    const e = projCurrent();
    $$('[data-bind="proj-role"]').forEach((n) => {
      const show = !!e && !customSite() && (e.role !== 'owner' || (!!e.clientName && !e.handoff));
      n.hidden = !show;
      n.textContent = show ? (e.role === 'owner' ? (STATUS_LABEL[e.status] || 'Client') : ROLE_LABEL[e.role]) : '';
    });
  }

  /* ---------- search: orders, products, customers ---------- */

  function searchResults(q) {
    const f = fold(q).trim();
    if (!f) return null;
    const d = digits(q);
    const res = { orders: [], products: [], customers: [] };
    S.admin.orders.forEach((o) => {
      const c = o.customer || {};
      const hay = fold([o.id, c.name, c.commune, arr(o.items).map((i) => i.name).join(' ')].join(' '));
      if (hay.indexOf(f) >= 0 || (d.length >= 3 && (digits(o.id).indexOf(d) >= 0 || digits(c.phone).indexOf(d) >= 0))) res.orders.push(o);
    });
    if (S.config) S.config.products.forEach((p) => { if (fold(p.name + ' ' + p.category).indexOf(f) >= 0) res.products.push(p); });
    customers().forEach((c) => { if (fold(c.name + ' ' + c.commune).indexOf(f) >= 0 || (d.length >= 3 && digits(c.phone).indexOf(d) >= 0)) res.customers.push(c); });
    return res;
  }
  function renderSearch() {
    const input = $('#a-search-input');
    const panel = $('#a-search-results');
    const status = $('#a-search-status');
    if (!input || !panel) return;
    const r = S.inApp ? searchResults(input.value) : null;
    if (!r) { panel.hidden = true; panel.innerHTML = ''; if (status) status.textContent = ''; return; }
    const n = r.orders.length + r.products.length + r.customers.length;
    let html = '';
    if (r.orders.length) {
      html += H`<div class="a-sres__group"><p class="a-sres__label">Commandes</p>${r.orders.slice(0, 5).map((o) => H`<a class="a-sres__item" href="#commandes/${esc(o.id.replace('#', ''))}"><span class="a-sres__ico">${ico('receipt')}</span><span class="a-sres__main"><span class="a-sres__title">${esc(o.id)} · ${esc(o.customer.name)}</span><span class="a-sres__meta">${esc(when(o.date))} · ${esc(price(o.total))}</span></span>${pill(o.status)}</a>`)}</div>`;
    }
    if (r.products.length) {
      html += H`<div class="a-sres__group"><p class="a-sres__label">Produits</p>${r.products.slice(0, 5).map((p) => H`<a class="a-sres__item" href="#produits/${esc(p.id)}"><span class="a-sres__ico" style="background:${safeColor(p.color)}">${visual(p)}</span><span class="a-sres__main"><span class="a-sres__title">${esc(p.name || 'Sans nom')}</span><span class="a-sres__meta">${esc(price(p.price))}${p.category ? ' · ' + esc(p.category) : ''}</span></span></a>`)}</div>`;
    }
    if (r.customers.length) {
      html += H`<div class="a-sres__group"><p class="a-sres__label">Clients</p>${r.customers.slice(0, 5).map((c) => H`<a class="a-sres__item" href="#clients?c=${esc(encodeURIComponent(c.key))}"><span class="a-sres__ico">${esc(initials(c.name))}</span><span class="a-sres__main"><span class="a-sres__title">${esc(c.name)}</span><span class="a-sres__meta">${esc(c.commune)} · ${esc(plural(c.orders.length, 'commande', 'commandes'))}</span></span></a>`)}</div>`;
    }
    if (!n) html = H`<p class="a-sres__empty">Aucun résultat pour « ${esc(input.value.trim())} ».</p>`;
    panel.innerHTML = html;
    panel.hidden = false;
    if (status) status.textContent = n ? plural(n, 'résultat', 'résultats') : 'Aucun résultat';
  }
  function openSearch() {
    const s = $('#a-search');
    if (!s) return;
    s.classList.add('is-open');
    document.documentElement.classList.add('a-locked', 'a-searching');
    const i = $('#a-search-input');
    if (i) { i.focus(); renderSearch(); }
  }
  function closeSearch(keepText) {
    const s = $('#a-search');
    const i = $('#a-search-input');
    const p = $('#a-search-results');
    const wasOpen = s && s.classList.contains('is-open');
    if (s) s.classList.remove('is-open');
    document.documentElement.classList.remove('a-searching');
    if (wasOpen && !$('dialog[open]')) document.documentElement.classList.remove('a-locked');
    if (!keepText && i) i.value = '';
    if (p) { p.hidden = true; if (!keepText) p.innerHTML = ''; }
    return wasOpen;
  }

  /* ------------------------------------------------------------------ shared bits of views */

  const STATUS_ICO = { new: '<span class="a-pill__dot" aria-hidden="true"></span>', paid: ico('check'), shipped: ico('truck'), delivered: ico('check'), cancelled: ico('x') };
  // Which meaning each order status carries: blue = to handle / on its way, green = done, red = problem
  const STATUS_TONE = { new: 'info', paid: 'ok', shipped: 'info', delivered: 'ok', cancelled: 'err' };
  function pill(status) {
    return '<span class="a-pill a-pill--' + esc(status) + (STATUS_TONE[status] ? ' a-tone--' + STATUS_TONE[status] : '') + '">' + (STATUS_ICO[status] || '') + esc(statusLabel(status)) + '</span>';
  }
  // 185 500 FCFA for a big figure: the number never breaks, « FCFA » smaller
  const money = (n) => '<span class="a-nowrap">' + esc(number(n)) + '</span><small>' + NB + 'FCFA</small>';
  const sampleChip = () => H`<span class="a-chip a-chip--sample">Données d’exemple</span>`;
  // The demo photo of a product without a photo of its own ({ src, alt, focus, credit }), or null.
  // The renderer resolves it; without one, the file is found from this page (../creer/img/demo/).
  function demoPhoto(p) {
    if (!p || !p.photo || (typeof p.image === 'string' && /^data:image\//.test(p.image))) return null;
    try {
      const R = window.JeereRender;
      if (R && typeof R.photoInfo === 'function') return R.photoInfo(p.photo);
      const e = D && typeof D.demoPhoto === 'function' ? D.demoPhoto(p.photo) : null;
      return e ? { src: '../creer/' + (D.PHOTO_DIR || 'img/demo/') + e.file, alt: str(e.alt), focus: '', credit: {} } : null;
    } catch (e) { return null; }
  }
  // A product's picture: its photo, else its demo photo, else its illustration (drawn by the renderer, on its colour)
  function visual(p) {
    if (p && typeof p.image === 'string' && /^data:image\//.test(p.image)) return '<img src="' + esc(p.image) + '" alt="">';
    const ph = demoPhoto(p);
    // data-art / data-color: the illustration that replaces a demo photo whose file does not load (onImgError)
    if (ph) return '<img src="' + esc(ph.src) + '" alt="" data-art="' + esc(str(p.art)) + '" data-color="' + esc(str(p.color)) + '"' + (ph.focus ? ' style="object-position:' + esc(ph.focus) + '"' : '') + '>';
    try { const R = window.JeereRender; return R && R.artSVG ? R.artSVG(p && p.art, p && p.color) : ''; } catch (e) { return ''; }
  }
  function onImgError(e) {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.hasAttribute('data-art') || !t.parentNode) return;
    try { const R = window.JeereRender; t.outerHTML = R && R.artSVG ? R.artSVG(t.getAttribute('data-art'), t.getAttribute('data-color')) : ''; } catch (err) { /* ignore */ }
  }
  function thumb(p, cls) {
    return '<span class="a-thumb' + (cls ? ' ' + cls : '') + '" style="background:' + safeColor(p && p.color) + '">' + visual(p) + '</span>';
  }
  function pageHead(title, sub, actions, back) {
    return H`<header class="a-ph"><div class="a-ph__txt">${back ? H`<a class="a-backlink" href="${back.href}">${ico('chev-left')}${esc(back.label)}</a>` : ''}
      <h1 class="a-h1" tabindex="-1">${fr(title)}</h1>${sub ? H`<p class="a-sub">${fr(sub)}</p>` : ''}</div>${actions ? H`<div class="a-ph__actions">${actions}</div>` : ''}</header>`;
  }
  function switchRow(o) {
    // o: { label, hint, checked, attrs, id, extra, disabled }
    const id = o.id || ('sw-' + Math.random().toString(36).slice(2, 8));
    return H`<label class="a-switchrow" for="${id}"><span class="a-switchrow__txt"><span class="a-switchrow__label">${fr(o.label)}${o.extra || ''}</span>${o.hint ? H`<span class="a-switchrow__hint">${fr(o.hint)}</span>` : ''}</span>
      <span class="a-switch"><input type="checkbox" role="switch" id="${id}" ${o.attrs || ''}${o.checked ? ' checked' : ''}${o.disabled ? ' disabled' : ''}><span class="a-switch__track"></span></span></label>`;
  }
  function counter(len, max) {
    const cls = len > max ? ' is-over' : (len > max * 0.9 ? ' is-near' : '');
    return '<span class="a-count' + cls + '" data-count-for>' + number(len) + NB + '/' + NB + number(max) + '</span>';
  }
  function fieldError(id, msg) { return H`<p class="a-error" id="${id}" role="alert">${ico('alert')}<span>${esc(fr(msg))}</span></p>`; }
  // Show an error under a field; returns false
  function invalid(input, msg) {
    if (!input) return false;
    const box = input.closest('.a-field') || input.parentNode;
    const id = (input.id || 'f') + '-err';
    const old = document.getElementById(id);
    if (old) old.remove();
    box.insertAdjacentHTML('beforeend', fieldError(id, msg));
    input.setAttribute('aria-invalid', 'true');
    const prev = (input.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== id);
    input.setAttribute('aria-describedby', prev.concat(id).join(' '));
    return false;
  }
  function clearErrors(form) {
    $$('.a-error[id$="-err"]', form).forEach((e) => e.remove());
    $$('[aria-invalid="true"]', form).forEach((i) => {
      i.removeAttribute('aria-invalid');
      const d = (i.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && !/-err$/.test(x)).join(' ');
      if (d) i.setAttribute('aria-describedby', d); else i.removeAttribute('aria-describedby');
    });
  }
  function focusFirstError(form) { const f = $('[aria-invalid="true"]', form); if (f) { f.focus(); try { f.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } } }

  // A small live preview of the store in a phone frame (JeereRender, scaled)
  function mountMini(stage, cfg, opts) {
    if (!stage) return;
    const o = opts || {};
    const frame = $('.a-mini', stage);
    const screen = $('.a-mini__screen', stage);
    const R = window.JeereRender;
    if (!frame || !screen) return;
    const cs = customSite();
    if (cs) {
      // her own design, live: the page itself in the phone
      screen.innerHTML = '';
      const f = document.createElement('iframe');
      f.src = cs.live; f.title = 'Aperçu du site'; f.loading = 'lazy'; f.tabIndex = -1;
      f.setAttribute('style', 'width:390px;height:820px;border:0;display:block;background:#fff');
      screen.appendChild(f);
    } else if (!R || !cfg) return;
    else {
    // draw into a box of its own: the renderer renames the element it draws into, the screen keeps its frame
    let host = screen.firstElementChild;
    if (!host) { host = document.createElement('div'); screen.appendChild(host); }
    try { R.render(cfg, host, { device: 'phone', page: o.page || 'home', pageId: o.pageId, productId: o.productId }); } catch (e) { return; }
    }
    const fit = () => {
      const w = stage.clientWidth || 300;
      const s = Math.max(0.3, Math.min(o.max || 0.62, (w - 24) / 406));
      frame.style.setProperty('--s', String(s));
    };
    fit();
    if (window.ResizeObserver) { try { new ResizeObserver(fit).observe(stage); } catch (e) { /* ignore */ } }
  }
  function miniStage(label) {
    return H`<div class="a-ministage" aria-hidden="true" inert data-mini><div class="a-mini"><div class="a-mini__screen"></div></div></div>${label ? H`<span class="a-sr">${esc(label)}</span>` : ''}`;
  }

  /* ------------------------------------------------------------------ ACCUEIL */

  function stats(orders) {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const sales = valid.reduce((t, o) => t + (o.total || 0), 0);
    return {
      sales, count: orders.length, valid: valid.length,
      avg: valid.length ? Math.round(sales / valid.length) : 0,
      todo: orders.filter((o) => o.status === 'new' || o.status === 'paid').length,
      cancelled: orders.length - valid.length,
      failed: orders.filter((o) => o.status === 'cancelled' && o.cancelReason).length
    };
  }
  function pagesState() {
    const pages = arr(S.config && S.config.pages);
    if (!pages.length) return { ok: false, hint: 'Ajoutez au moins « À propos », « Contact » et « Conditions de vente ».' };
    const empty = pages.find((p) => !str(p.title).trim() || !str(p.body).trim());
    if (empty) return { ok: false, hint: str(empty.title).trim() ? 'La page « ' + empty.title + ' » est vide.' : 'Une page n’a pas de titre.' };
    const v = validateFiche();
    const bad = arr(v.issues).find((i) => i.target && i.target.kind === 'page' && (i.level === 'error' || i.level === 'warning'));
    if (bad) return { ok: false, hint: bad.message };
    const terms = pages.find((p) => D.pageKind && D.pageKind(p) === 'terms');
    if (terms && /À adapter/.test(terms.body)) return { ok: false, hint: '« ' + terms.title + ' » est encore le modèle : faites-le relire, puis retirez le paragraphe « À adapter ».', pageId: terms.id };
    return { ok: true, hint: '' };
  }
  // The store no longer looks like its template: another theme, or sections changed in the Studio. The template
  // is compared as the editor made it (the hero title carries the seller's store name: see personalize in editor.js).
  function customised(cfg) {
    try {
      const d = D.normalizeConfig(D.defaultConfig(cfg.template, cfg.store.niche));
      if (['palette', 'fonts', 'radius', 'buttons', 'intensity'].some((k) => cfg.theme[k] !== d.theme[k])) return true;
      // her own colours (theme.colors), on top of the palette
      if (D.colorOverrides ? D.colorOverrides(cfg.theme.colors) : (isObj(cfg.theme.colors) && Object.keys(cfg.theme.colors).length)) return true;
      // her own fonts (theme.typography), on top of the suggestion
      if (D.normTypography ? D.normTypography(cfg.theme.typography, cfg.theme.fonts) : isObj(cfg.theme.typography)) return true;
      const old = str(d.store.name);
      const name = str(cfg.store.name);
      const sig = (c, mine) => JSON.stringify(arr(c.sections).map((x) => {
        const st = copy(x.settings) || {};
        // the example name in the hero title becomes the seller's: not a change she made
        if (!mine && x.type === 'hero' && old && name && name !== old && typeof st.title === 'string') st.title = st.title.split(old).join(name);
        return [x.type, x.enabled !== false, st];
      }));
      return sig(cfg, true) !== sig(d, false);
    } catch (e) { return false; }
  }
  const onboarding = () => (isObj(S.admin.onboarding) ? S.admin.onboarding : (S.admin.onboarding = {}));
  // « Premiers pas »: every step ticks itself from what is really set (nothing to tick by hand). The first ones
  // are the founder's five (products, Wave, delivery communes, the Studio, sharing on WhatsApp), with the
  // WhatsApp number between them; the last ones lead to the launch. Each step opens the screen where it is done.
  function checklist() {
    const cfg = S.config;
    const ad = S.admin;
    const photos = cfg.products.filter((p) => p.image).length;
    const v = validateFiche();
    const ps = pagesState();
    const shared = !!onboarding().sharedAt;
    return [
      { id: 'products', done: photos >= 3, title: 'Ajoutez 3 produits avec une vraie photo', hint: photos ? photos + ' sur 3 pour l’instant. Une photo nette, à la lumière du jour, vend mieux qu’un dessin.' : 'Une photo nette, à la lumière du jour, vend mieux qu’un dessin.', href: '#produits' },
      { id: 'wave', done: isOn('mobile-money'), title: 'Connectez Wave et le mobile money', hint: 'Votre numéro Wave, Orange Money, MTN MoMo ou Moov Money : vos clients paient, l’argent arrive directement chez vous.', href: '#paiements' },
      { id: 'whatsapp', done: phoneOk(cfg.store.whatsapp), title: 'Ajoutez votre numéro WhatsApp', hint: 'Vos clients vous écrivent et vous recevez les commandes.', href: '#parametres/boutique',
        quick: S.account && !S.forClient && phoneOk(S.account.phone) ? { act: 'use-my-wa', icon: 'chat', label: 'Utiliser mon numéro ' + phoneFmt(S.account.phone) } : null },
      { id: 'delivery', done: ownZones().length > 0, title: 'Choisissez vos communes de livraison', hint: 'Les communes où vous livrez, avec leurs frais.', href: '#livraison' },
      { id: 'studio', done: customised(cfg), title: 'Personnalisez votre boutique', hint: 'Vos couleurs, votre grand titre, vos textes : dans le Studio, avec l’aperçu sous les yeux.', act: 'open-editor' },
      { id: 'logo', done: !!storeLogo(), title: 'Ajoutez votre logo', hint: 'En haut de chaque page de votre boutique. Pas encore de logo ? Le Studio en crée un simple avec votre nom.', act: 'open-editor', focus: 'logo' },
      { id: 'share', done: shared, title: 'Partagez le lien sur WhatsApp', hint: 'Sur votre statut et à vos clients : c’est comme ça qu’arrivent les premières commandes.', act: 'share-store', button: true },
      { id: 'pages', done: ps.ok, title: 'Relisez vos pages', hint: ps.hint, href: ps.pageId ? '#pages/' + ps.pageId : '#pages' },
      { id: 'score', done: v.score >= 80, title: 'Atteignez un score qualité de 80', hint: 'Score actuel : ' + v.score + ' sur 100. Le Studio vous dit quoi corriger.', act: 'open-editor' },
      { id: 'address', done: !!ad.settings.customDomain || ad.subdomainChosen === true, title: 'Choisissez l’adresse de votre boutique', hint: subdomain() + ' est gratuite. Vous pouvez aussi prendre votre propre nom de domaine.', href: '#parametres/domaine' }
    ];
  }
  function stepItem(s, hidden) {
    const inner = H`<span class="a-step__ring">${s.done ? ico('check') : ''}</span><span class="a-step__txt"><span class="a-sr">${s.done ? 'Fait' + NB + ': ' : 'À faire' + NB + ': '}</span><span class="a-step__title">${esc(fr(s.title))}</span><span class="a-step__hint">${esc(fr(s.hint))}</span></span>${ico('chev', 'a-step__go')}`;
    const cls = 'a-step' + (s.done ? ' is-done' : '');
    const data = H` data-step="${esc(s.id || '')}"`;
    const link = s.button
      ? H`<button class="${cls}" type="button" data-act="${s.act}"${data}>${inner}</button>`
      : s.act
        ? H`<a class="${cls}" href="${EDITOR_URL}" data-act="${s.act}" data-page="home"${s.focus ? H` data-focus="${esc(s.focus)}"` : ''}${data}>${inner}</a>`
        : H`<a class="${cls}" href="${s.href}"${data}>${inner}</a>`;
    // A one-tap action under the step (« Utiliser mon numéro »): done without leaving the home page
    const quick = s.quick && !s.done ? H`<div class="a-step__quick"><button class="a-btn a-btn--soft a-btn--sm" type="button" data-act="${s.quick.act}">${ico(s.quick.icon || 'check')}${esc(fr(s.quick.label))}</button></div>` : '';
    return H`<li${hidden ? ' hidden' : ''}>${link}${quick}</li>`;
  }
  // Sales per day, stacked by sales channel: each channel keeps one chart colour (--chart-1 … --chart-5, never the
  // status green / orange / red). The legend names every colour with its total, so the colour is never alone.
  const CHART_CHANNELS = () => {
    const list = arr(D && D.ORDER_CHANNELS).length ? D.ORDER_CHANNELS : [{ id: 'boutique', label: 'Boutique en ligne' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }];
    return list.slice(0, 5).map((c, i) => ({ id: c.id, label: c.label, n: i + 1 }));
  };
  function chart(orders) {
    if (!orders.length) return '';
    const chans = CHART_CHANNELS();
    const chanOf = (o) => (chans.some((c) => c.id === o.channel) ? o.channel : chans[0].id);
    const last = orders.reduce((m, o) => { const d = toDate(o.date); return d && d > m ? d : m; }, new Date(0));
    const end = dayKey(last);
    const days = [];
    for (let i = 9; i >= 0; i--) days.push({ key: end - i, total: 0, n: 0, by: {} });
    const sums = {};
    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const d = toDate(o.date);
      if (!d) return;
      const slot = days.find((x) => x.key === dayKey(d));
      if (!slot) return;
      const ch = chanOf(o);
      slot.total += o.total || 0; slot.n += 1;
      slot.by[ch] = (slot.by[ch] || 0) + (o.total || 0);
      sums[ch] = (sums[ch] || 0) + (o.total || 0);
    });
    const used = chans.filter((c) => sums[c.id]);
    const max = Math.max.apply(null, days.map((x) => x.total)) || 1;
    const today = dayKey(S.now);
    const best = days.reduce((m, x) => (x.total > m.total ? x : m), days[0]);
    const bestD = new Date(best.key * DAY_MS);
    const parts = (x) => used.filter((c) => x.by[c.id]).map((c) => c.label + ' ' + price(x.by[c.id])).join(', ');
    const label = (x) => { const d = new Date(x.key * DAY_MS); return fr(DAYS_SHORT[d.getUTCDay()] + ' ' + dateShort(d) + ' : ' + (x.total ? price(x.total) + ' (' + plural(x.n, 'commande', 'commandes') + (used.length > 1 ? ' ; ' + parts(x) : '') + ')' : 'aucune vente')); };
    const aria = fr('Ventes par jour et par canal, du ' + dateShort(new Date(days[0].key * DAY_MS)) + ' au ' + dateShort(new Date(end * DAY_MS)) + '. ' + days.map(label).join(' ; ') + '.');
    const cols = days.map((x) => {
      const d = new Date(x.key * DAY_MS);
      const h = x.total ? Math.max(4, Math.round((x.total / max) * 100)) : 0;
      // Segments from the bottom: channel 1 first; a 2 px white gap keeps two neighbours apart
      const segs = x.total ? used.filter((c) => x.by[c.id]).map((c) => '<span class="a-chart__seg" style="flex-grow:' + x.by[c.id] + ';background:var(--chart-' + c.n + ')"></span>').join('') : '';
      return '<div class="a-chart__col' + (x.key === today ? ' is-today' : '') + (x === best && best.total ? ' is-best' : '') + '" title="' + esc(label(x)) + '">' +
        '<span class="a-chart__track"><span class="a-chart__bar' + (x.total ? '' : ' is-zero') + '" style="height:' + (x.total ? h + '%' : '3px') + '">' + segs + '</span></span>' +
        '<span class="a-chart__d">' + DAYS_MINI[d.getUTCDay()] + '</span><span class="a-chart__n">' + d.getUTCDate() + '</span></div>';
    }).join('');
    const legend = used.length ? '<ul class="a-chart__keys" aria-label="Légende, de bas en haut">' + (used.length > 1 ? '<li class="a-chart__lead" aria-hidden="true">De bas en haut' + NB + ':</li>' : '') + used.map((c) => '<li><span class="a-chart__key" style="background:var(--chart-' + c.n + ')" aria-hidden="true"></span>' + esc(c.label) + ' <span class="a-tnum a-muted">' + esc(price(sums[c.id])) + '</span></li>').join('') + '</ul>' : '';
    return '<div class="a-chart"><div class="a-chart__cols" role="img" aria-label="' + esc(aria) + '">' + cols + '</div>' + legend +
      '<p class="a-chart__legend">' + esc(fr('Meilleur jour : ' + DAYS[bestD.getUTCDay()] + ' ' + dateShort(bestD) + ', ' + price(best.total) + '.')) + '</p></div>';
  }
  // How an order is paid, at a glance: what the courier must collect, what is already paid, what waits
  function payChip(o, short) {
    if (o.status === 'cancelled') return '';
    if (isCod(o)) {
      if (o.status === 'delivered') return H`<span class="a-chip a-chip--soft a-tone--ok">${ico('check')}Encaissée</span>`;
      return H`<span class="a-chip a-chip--line a-chip--due a-tone--warn">${ico('wallet')}À encaisser${paidDeposit(o) ? ' ' + esc(price(dueAtDoor(o))) : ''}</span>`;
    }
    if (o.status === 'new') return H`<span class="a-chip a-chip--line a-tone--warn">${ico('clock')}Paiement en attente</span>`;
    return H`<span class="a-chip a-chip--soft a-tone--ok">${ico('check')}Payée${short ? '' : ' · ' + esc(payLabel(o.payment))}</span>`;
  }
  function orderRow(o) {
    const c = o.customer || {};
    const tags = payChip(o) +
      (o.status === 'new' && o.confirmedAt ? H`<span class="a-chip a-chip--line a-tone--ok">${ico('check')}Confirmée</span>` : '') +
      (o.status === 'shipped' && o.courier ? H`<span class="a-chip a-chip--line">${ico('bike')}${esc(courierName(o.courier))}</span>` : '');
    return H`<li><a class="a-orow" href="#commandes/${esc(o.id.replace('#', ''))}">
      <span class="a-orow__top"><span class="a-orow__id">${esc(o.id)} <span class="a-orow__who">· ${esc(c.name)}</span></span>${pill(o.status)}</span>
      <span class="a-orow__line"><span>${esc(when(o.date))} · ${esc(c.commune)}</span><span class="a-orow__amount">${esc(price(o.total))}</span></span>
      ${tags ? H`<span class="a-orow__tags">${tags}</span>` : ''}</a></li>`;
  }
  function monthOrders() {
    const y = S.now.getUTCFullYear();
    const m = S.now.getUTCMonth();
    return S.admin.orders.filter((o) => { const d = toDate(o.date); return d && d.getUTCFullYear() === y && d.getUTCMonth() === m && o.status !== 'cancelled'; }).length;
  }
  // The plan's order limit: a warning from 80 %, and what happens past it
  function planLimit() {
    const p = plan();
    const used = monthOrders();
    if (!p.orders) return { p, used, near: false, left: null, policy: '' };
    const warnAt = Math.ceil(p.orders * 0.8);
    const list = PLANS();
    const next = list[list.findIndex((x) => x.id === p.id) + 1] || null;
    const nextPrice = next ? (next.priceWeek ? price(next.priceWeek) + ' par semaine' : price(next.priceMonth) + ' par mois') : '';
    return {
      p, used, near: used >= warnAt, left: Math.max(0, p.orders - used),
      policy: 'Nous vous prévenons sur WhatsApp à ' + warnAt + ' commandes' + (next ? ' ; au-delà de ' + p.orders + ', passez à ' + next.name + ' pour ' + nextPrice + '.' : '.')
    };
  }
  function planCard(cls) {
    const L = planLimit();
    const p = L.p;
    const used = L.used;
    const pct = p.orders ? Math.min(100, Math.round((used / p.orders) * 100)) : 0;
    const paused = S.admin.settings.billing.paused;
    return H`<section class="a-card ${L.near ? 'a-card--warn ' : ''}${cls || ''}" aria-labelledby="h-plan">
      <div class="a-card__head"><div><h2 class="a-card__title" id="h-plan">Formule ${esc(p.name)}${paused ? H` <span class="a-chip a-chip--line">${ico('pause')}En pause</span>` : ''}</h2>
        <p class="a-card__sub">${esc(p.priceMonth ? p.priceLabel : '0' + NB + 'FCFA')} · ${esc(fr(p.feeLabel))}</p></div>
        <a class="a-more-link" href="#parametres/abonnement">Gérer${ico('chev')}</a></div>
      <div class="a-meter"><div class="a-meter__row"><span>Commandes ce mois-ci</span><strong>${p.orders ? esc(number(used) + ' sur ' + number(p.orders)) : esc(number(used)) + ' · illimitées'}</strong></div>
        ${p.orders ? H`<div class="a-progress__bar" aria-hidden="true"><div class="a-progress__fill${pct >= 80 ? ' is-high' : ''}" style="width:${pct}%"></div></div>` : ''}</div>
      ${L.near ? H`<p class="a-planwarn">${ico('alert')}<span><strong>${esc(fr(L.left ? 'Plus que ' + plural(L.left, 'commande', 'commandes') + ' ce mois-ci.' : 'Vous avez atteint ' + p.orders + ' commandes ce mois-ci.'))}</strong> ${esc(fr(L.policy))}</span></p>` : ''}
      <p class="a-small" style="margin-top:10px">Toutes les fonctions et l’aide d’une vraie personne sont dans chaque formule.${hasDemoOrders() ? ' Commandes : données d’exemple.' : ''}</p>
    </section>`;
  }
  function viewHome() {
    const acc = S.account || {};
    const cfg = S.config;
    const hello = acc.firstName ? 'Bonjour ' + acc.firstName : 'Bonjour';
    let html = H`<div class="a-page">
      <header class="a-ph"><div class="a-ph__txt"><p class="a-eyebrow">${esc(cap(dateLong(S.now)))}</p>
        <h1 class="a-h1" tabindex="-1">${esc(hello)}</h1>
        <p class="a-sub">${cfg ? H`Voici où en est ${esc(cfg.store.name || 'votre boutique')}.` : 'Votre boutique vous attend.'}</p></div></header>`;
    if (!cfg) return html + H`<div class="a-stack">${noStoreCard()}${planCard()}</div></div>`;
    const orders = S.admin.orders;
    const rec = recentOrders();
    const st = stats(rec);
    const m = moneyOf(rec);
    const todo = stats(orders).todo;
    const dueAll = moneyOf(orders);
    const steps = checklist();
    const done = steps.filter((s) => s.done).length;
    const recent = orders.slice().sort((a, b) => str(b.date).localeCompare(str(a.date))).slice(0, 5);
    const allDone = done === steps.length;
    // The next 3 steps to do; the others (and the done ones) on demand
    const next = steps.filter((s) => !s.done).slice(0, 3);
    const open = S.checkOpen === true;
    const checkHidden = onboarding().checklistHidden === true;
    const sample = hasDemoOrders() ? sampleChip() : '';
    const todayTxt = (todo ? plural(todo, 'commande à préparer', 'commandes à préparer') : 'Rien à préparer') + (dueAll.dueN ? ' · ' + number(dueAll.dueN) + ' à encaisser' : '');
    html += H`<div class="a-home">
      <section class="a-today a-home__today" aria-labelledby="h-today">
        <a class="a-today__main" href="#commandes?statut=a-preparer"><span class="a-today__k" id="h-today">Aujourd’hui</span><span class="a-today__v">${esc(fr(todayTxt))}</span>${ico('chev', 'a-today__go')}</a>
        <button class="a-btn a-btn--inv a-today__btn" type="button" data-act="order-new">${ico('plus')}Nouvelle commande</button>
      </section>
      ${checkHidden ? '' : H`<section class="a-card a-home__check${allDone ? ' is-ready' : ''}" aria-labelledby="h-check">
        <div class="a-card__head" style="margin-bottom:0"><div><h2 class="a-card__title" id="h-check">${allDone ? 'Votre boutique est prête' : 'Premiers pas'}</h2>
          <p class="a-card__sub">${allDone ? 'Les ' + steps.length + ' étapes sont faites. Il ne reste plus qu’à la mettre en ligne.' : 'Les étapes qui comptent avant d’ouvrir. Elles se cochent toutes seules.'}</p></div>
          <button class="a-btn a-btn--quiet a-btn--sm a-home__hide" type="button" data-act="checklist-hide" aria-label="Masquer les premiers pas">${ico('x')}<span class="a-home__hidelbl">Masquer</span></button></div>
        <div class="a-progress"><div class="a-progress__bar" role="progressbar" aria-label="Étapes faites" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><div class="a-progress__fill" style="width:${Math.round((done / steps.length) * 100)}%"></div></div><span class="a-progress__txt">${done} sur ${steps.length}</span></div>
        ${allDone ? H`<div class="a-card__foot"><button class="a-btn a-btn--primary a-btn--lg" type="button" data-act="publish">${ico('rocket')}Publier ma boutique</button></div>` : ''}
        <ul class="a-steps" id="a-steps">${steps.map((s) => stepItem(s, !open && next.indexOf(s) < 0))}</ul>
        <div class="a-steps__more"><button class="a-btn a-btn--quiet a-btn--sm" type="button" data-act="check-all" aria-expanded="${open ? 'true' : 'false'}" aria-controls="a-steps">${ico(open ? 'up' : 'down')}${esc(open ? 'Voir moins' : 'Voir les ' + steps.length + ' étapes (' + plural(done, 'faite', 'faites') + ')')}</button></div>
      </section>`}
      <section class="a-home__kpi" aria-labelledby="h-kpi">
        <div class="a-sechead"><h2 class="a-sechead__title" id="h-kpi">Vos ventes</h2>${sample}</div>
        <div class="a-kpis">
          <div class="a-kpi a-kpi--sales"><span class="a-kpi__label">${ico('wallet')}Ventes · 10 derniers jours</span><span class="a-kpi__value">${money(m.collected + m.due + m.pending)}</span>
            <span class="a-kpi__split">
              <span class="a-kpi__part"><span class="a-kpi__k"><span class="a-dot a-tone--ok" aria-hidden="true"></span>Encaissé</span><strong>${esc(price(m.collected))}</strong><span class="a-kpi__sub">Mobile money, carte et livraisons payées</span></span>
              <a class="a-kpi__part" href="#commandes?statut=a-encaisser"><span class="a-kpi__k"><span class="a-dot a-tone--warn" aria-hidden="true"></span>À encaisser</span><strong>${esc(price(m.due))}</strong><span class="a-kpi__sub">${m.withCouriers ? esc(fr('dont ' + price(m.withCouriers) + ' chez vos livreurs')) : 'Paiement à la livraison'}</span></a>
              ${m.pending ? H`<span class="a-kpi__part"><span class="a-kpi__k"><span class="a-dot a-tone--warn" aria-hidden="true"></span>En attente</span><strong>${esc(price(m.pending))}</strong><span class="a-kpi__sub">Paiements mobile money pas encore validés</span></span>` : ''}
            </span></div>
          <a class="a-kpi" href="#commandes"><span class="a-kpi__label">${ico('receipt')}Commandes</span><span class="a-kpi__value">${esc(number(st.count))}</span><span class="a-kpi__sub">${st.cancelled ? esc(plural(st.cancelled, 'annulée', 'annulées') + (st.failed ? ', dont ' + plural(st.failed, 'livraison échouée', 'livraisons échouées') : '')) : 'Aucune annulée'}</span></a>
          <div class="a-kpi"><span class="a-kpi__label">${ico('bag')}Panier moyen</span><span class="a-kpi__value">${money(st.avg)}</span><span class="a-kpi__sub">Livraison comprise</span></div>
          <a class="a-kpi" href="#commandes?statut=a-preparer"><span class="a-kpi__label">${ico('clock')}Commandes à préparer</span><span class="a-kpi__value">${esc(number(todo))}</span><span class="a-kpi__sub">Nouvelles et payées</span></a>
        </div>
        <div class="a-card" style="margin-top:10px"><div class="a-card__head" style="margin-bottom:0"><div><h3 class="a-card__title">Ventes par jour et par canal</h3><p class="a-card__sub">${hasDemoOrders() ? 'Les 10 derniers jours, avec des commandes d’exemple' : 'Les 10 derniers jours'}</p></div></div>${chart(orders)}</div>
      </section>
      <section class="a-card a-card--flush a-home__orders" aria-labelledby="h-recent">
        <div class="a-card__head"><div><h2 class="a-card__title" id="h-recent">Dernières commandes</h2><p class="a-card__sub">${hasDemoOrders() ? 'Données d’exemple, faites à partir de vos produits' : 'Les vôtres, de la boutique et de WhatsApp'}</p></div></div>
        ${recent.length ? H`<ul class="a-rows" style="margin-top:8px">${recent.map(orderRow)}</ul>` : H`<div class="a-empty"><span class="a-empty__ico">${ico('receipt')}</span><p class="a-empty__title">Pas encore de commande</p><p class="a-empty__text">Partagez votre boutique : vos commandes apparaîtront ici. Une commande reçue sur WhatsApp ? Ajoutez-la.</p>
          <div class="a-btnrow"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="share-store">${ico('share')}Partager ma boutique</button></div></div>`}
        <div class="a-card__foot"><a class="a-more-link" href="#commandes">Voir toutes les commandes${ico('chev')}</a></div>
      </section>
      <div class="a-home__side">
        <section class="a-card a-preview a-home__preview" aria-labelledby="h-prev">
          <div class="a-card__head" style="margin-bottom:0"><div style="min-width:0"><h2 class="a-card__title" id="h-prev">Votre boutique</h2><p class="a-preview__url">${ico('globe')}<span>${esc(subdomain())}</span></p></div>${isPublished() || customSite() ? H`<span class="a-chip a-tone--ok">En ligne</span>` : H`<button class="a-chip a-chip--sample a-chip--btn" type="button" data-act="publish" aria-label="Pas en ligne : publier ma boutique">Pas en ligne</button>`}</div>
          ${miniStage('Aperçu de la page d’accueil de votre boutique')}
          <div class="a-card__foot a-preview__foot"><button class="a-btn a-btn--primary" type="button" data-act="open-editor" data-page="home">${ico('edit')}Personnaliser</button><button class="a-btn a-btn--ghost" type="button" data-act="view-store">${ico('eye')}Voir</button><button class="a-btn a-btn--ghost" type="button" data-act="share-store">${ico('share')}Partager</button></div>
        </section>
        ${planCard('a-home__plan')}
      </div>
    </div></div>`;
    S.mounts.push(() => mountMini($('#a-main [data-mini]'), S.config, { max: 0.62 }));
    return html;
  }

  /* ------------------------------------------------------------------ COMMANDES */

  const FILTERS = [
    { id: 'all', label: 'Toutes', test: () => true },
    { id: 'a-preparer', label: 'À préparer', test: (o) => o.status === 'new' || o.status === 'paid' },
    { id: 'a-encaisser', label: 'À encaisser', tone: 'warn', test: (o) => isCod(o) && (o.status === 'new' || o.status === 'shipped') },
    { id: 'new', label: 'Nouvelles', tone: 'info', test: (o) => o.status === 'new' },
    { id: 'paid', label: 'Payées', tone: 'ok', test: (o) => o.status === 'paid' },
    { id: 'shipped', label: 'Expédiées', tone: 'info', test: (o) => o.status === 'shipped' },
    { id: 'delivered', label: 'Livrées', tone: 'ok', test: (o) => o.status === 'delivered' },
    { id: 'cancelled', label: 'Annulées', tone: 'err', test: (o) => o.status === 'cancelled' }
  ];
  function filteredOrders() {
    const f = FILTERS.find((x) => x.id === S.orderFilter) || FILTERS[0];
    const q = fold(S.orderQuery).trim();
    const d = digits(S.orderQuery);
    return S.admin.orders
      .filter(f.test)
      .filter((o) => {
        if (!q) return true;
        const c = o.customer || {};
        const hay = fold([o.id, c.name, c.commune, c.address, payLabel(o.payment), channelLabel(o.channel), arr(o.items).map((i) => i.name).join(' ')].join(' '));
        return hay.indexOf(q) >= 0 || (d.length >= 3 && (digits(o.id).indexOf(d) >= 0 || digits(c.phone).indexOf(d) >= 0));
      })
      .sort((a, b) => str(b.date).localeCompare(str(a.date)));
  }
  const canAddOrder = () => !!(S.config && S.config.products.length);
  // No order at all: what to do to get the first one
  function noOrdersCard() {
    return H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('receipt')}</span>
      <p class="a-empty__title">Pas encore de commande</p>
      <p class="a-empty__text">Les commandes de votre boutique arrivent ici. Une commande reçue sur WhatsApp ou par téléphone ? Ajoutez-la : elle se suit comme les autres.</p>
      <div class="a-btnrow">${canAddOrder()
        ? H`<button class="a-btn a-btn--primary" type="button" data-act="order-new">${ico('plus')}Ajouter une commande reçue sur WhatsApp</button><button class="a-btn a-btn--ghost" type="button" data-act="share-store">${ico('share')}Partager ma boutique sur WhatsApp</button>`
        : H`<a class="a-btn a-btn--primary" href="${S.config ? '#produits/nouveau' : EDITOR_URL}">${ico('plus')}${S.config ? 'Ajouter un produit' : 'Créer ma boutique'}</a>`}</div></div></div>`;
  }
  function ordersListHTML() {
    const list = filteredOrders();
    if (!list.length) {
      if (!S.admin.orders.length) return noOrdersCard();
      return H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('receipt')}</span>
        <p class="a-empty__title">Aucune commande ici</p><p class="a-empty__text">Changez de filtre ou de recherche.</p></div></div>`;
    }
    const rows = list.map((o) => {
      const c = o.customer || {};
      const href = '#commandes/' + esc(o.id.replace('#', ''));
      return H`<tr data-href="${href}"><td><a href="${href}">${esc(o.id)}</a></td><td class="a-nowrap">${esc(when(o.date))}</td>
        <td><span class="a-otable__cust">${esc(c.name)}<span>${esc(c.commune)}</span></span></td><td>${esc(channelLabel(o.channel))}</td>
        <td><span class="a-otable__pay">${esc(isCod(o) ? 'À la livraison' : payLabel(o.payment))}${payChip(o, true)}</span></td><td class="a-num">${esc(price(o.total))}</td><td>${pill(o.status)}</td></tr>`;
    }).join('');
    return H`<div class="a-card a-card--flush">
      <div class="a-otable-wrap"><table class="a-otable"><caption class="a-sr">Commandes</caption><thead><tr><th scope="col">Commande</th><th scope="col">Date</th><th scope="col">Client</th><th scope="col">Canal</th><th scope="col">Paiement</th><th scope="col" class="a-num">Total</th><th scope="col">Statut</th></tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="a-rows a-olist">${list.map(orderRow)}</ul></div>`;
  }
  function filtersHTML() {
    return FILTERS.map((f) => {
      const n = S.admin.orders.filter(f.test).length;
      return H`<button class="a-filter" type="button" data-act="order-filter" data-f="${f.id}" aria-pressed="${S.orderFilter === f.id ? 'true' : 'false'}">${f.tone ? H`<span class="a-dot a-tone--${f.tone}" aria-hidden="true"></span>` : ''}${esc(f.label)}<span class="a-filter__n">${n}</span></button>`;
    }).join('');
  }
  function updateOrdersList() {
    const box = $('#a-olist');
    if (box) box.innerHTML = ordersListHTML();
    const fl = $('#a-ofilters');
    if (fl) $$('[data-f]', fl).forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-f') === S.orderFilter ? 'true' : 'false'));
    const n = filteredOrders().length;
    const st = $('#a-ostatus');
    if (st) st.textContent = plural(n, 'commande affichée', 'commandes affichées');
  }

  function viewOrders(r) {
    if (r.parts[0]) return viewOrder(r.parts[0]);
    if (r.query.statut && FILTERS.some((f) => f.id === r.query.statut)) S.orderFilter = r.query.statut;
    // First visit: open on what is to prepare, when there is something
    else if (!S.orderFilter) S.orderFilter = todoCount() ? 'a-preparer' : 'all';
    const n = S.admin.orders.length;
    const actions = H`<button class="a-btn a-btn--primary" type="button" data-act="order-new"${canAddOrder() ? '' : ' disabled'}>${ico('plus')}Nouvelle commande</button>${n ? H`<button class="a-btn a-btn--ghost a-desk-only" type="button" data-act="export-csv">${ico('download')}Exporter</button>` : ''}<button class="a-ibtn a-ibtn--line a-phone-only" type="button" data-act="orders-more" aria-label="Plus d’actions sur les commandes">${ico('more')}</button>`;
    if (!n) return H`<div class="a-page">${pageHead('Commandes', 'Les commandes de votre boutique, de WhatsApp, d’Instagram et de TikTok.', actions)}${noOrdersCard()}</div>`;
    return H`<div class="a-page">
      ${pageHead('Commandes', H`${esc(plural(n, 'commande', 'commandes'))}${hasDemoOrders() ? H` · ${sampleChip()}` : ''}`, actions)}
      <div class="a-filters" id="a-ofilters" role="group" aria-label="Filtrer par statut">${filtersHTML()}</div>
      <div class="a-toolbar"><div class="a-toolbar__search">${ico('search')}<label class="a-sr" for="a-oq">Rechercher dans les commandes</label>
        <input class="a-input" id="a-oq" type="search" data-search="orders" placeholder="N°, client, commune…" value="${esc(S.orderQuery)}" autocomplete="off" enterkeyhint="search"></div></div>
      <p class="a-sr" id="a-ostatus" aria-live="polite"></p>
      <div id="a-olist">${ordersListHTML()}</div>
      ${hasDemoOrders() && S.admin.orders.some((o) => o.manual === true) ? H`<p class="a-small" style="margin-top:12px">Vos commandes et les commandes d’exemple sont mélangées. <button class="a-link" type="button" data-act="demo-clear">Retirer les commandes d’exemple</button></p>` : ''}
    </div>`;
  }
  function ordersMore() {
    const items = [];
    if (S.admin.orders.length) items.push({ id: 'csv', icon: 'download', label: 'Exporter les commandes (CSV)', run: exportCSV });
    if (hasDemoOrders()) items.push({ id: 'demo', icon: 'trash', label: 'Retirer les commandes d’exemple', run: clearDemoOrders });
    items.push({ id: 'share', icon: 'share', label: 'Partager ma boutique', run: shareStore });
    actionSheet('Commandes', items);
  }
  async function clearDemoOrders() {
    const mine = S.admin.orders.filter((o) => o.manual === true);
    const ok = await confirmBox({ title: 'Retirer les commandes d’exemple ?', text: mine.length ? 'Vos ' + plural(mine.length, 'commande', 'commandes') + ' restent. Les exemples ne reviendront pas.' : 'La liste sera vide jusqu’à votre première commande. Les exemples ne reviendront pas.', ok: 'Retirer les exemples' });
    if (!ok) { focusMain(); return; }
    S.admin.orders = mine;
    S.admin.demoSeeded = true;
    S.admin.demoFor = demoSig();
    saveAdmin();
    refresh();
    focusMain();
    toast('Commandes d’exemple retirées.');
  }

  /* ---------- one order ---------- */

  const NEXT = { paid: 'Marquer comme payée', shipped: 'Marquer comme expédiée', delivered: 'Marquer comme livrée' };
  function nextStatus(o) {
    if (o.status === 'new') return isCod(o) ? 'shipped' : 'paid';
    if (o.status === 'paid') return 'shipped';
    if (o.status === 'shipped') return 'delivered';
    return null;
  }
  // The main button of an order, by state. Cash on delivery: the customer confirms on WhatsApp, the
  // order goes to a courier, the courier brings the money back.
  function mainAction(o) {
    if (o.status === 'cancelled') {
      const back = ['new', 'paid', 'shipped'].indexOf(o.cancelledFrom) >= 0 ? o.cancelledFrom : 'new';
      return { act: 'order-status', status: back, icon: 'refresh', label: 'Rétablir la commande' };
    }
    if (o.status === 'new' && isCod(o) && !o.confirmedAt) return { act: 'order-confirm-ask', icon: 'chat', label: 'Demander la confirmation' };
    const n = nextStatus(o);
    if (n === 'shipped') return couriers().length || serviceCouriers().length ? { act: 'order-handoff', icon: 'bike', label: 'Confier au livreur' } : { act: 'order-status', status: 'shipped', icon: 'truck', label: NEXT.shipped };
    if (n === 'delivered' && isCod(o)) return { act: 'order-cash', icon: 'wallet', label: 'Livrée, argent reçu' };
    if (n) return { act: 'order-status', status: n, icon: 'check', label: NEXT[n] };
    return null;
  }
  function firstName(o) { return str(o.customer && o.customer.name).split(' ')[0] || ''; }
  const itemsLine = (o) => arr(o.items).map((i) => i.qty + ' × ' + i.name).join(', ');
  function waMessage(o) {
    const n = firstName(o);
    const num = o.id.replace('#', '');
    const shop = storeName();
    const hi = 'Bonjour' + (n ? ' ' + n : '') + ', ';
    const t = price(o.total);
    let m;
    if (o.status === 'new') m = hi + 'merci pour votre commande n° ' + num + ' chez ' + shop + ' ! Nous la préparons. Total : ' + t + ', livraison à ' + o.customer.commune + '.';
    else if (o.status === 'paid') m = hi + 'nous avons bien reçu votre paiement de ' + t + ' pour la commande n° ' + num + ' chez ' + shop + '. Nous la préparons, et nous vous écrivons dès qu’elle part.';
    else if (o.status === 'shipped') m = hi + 'votre commande n° ' + num + ' chez ' + shop + ' est en route vers ' + o.customer.commune + '. Le livreur vous appelle avant de passer.' + (isCod(o) ? ' Montant à régler à la livraison : ' + price(dueAtDoor(o)) + '.' : '');
    else if (o.status === 'delivered') m = hi + 'votre commande n° ' + num + ' a bien été livrée. Merci, et à bientôt chez ' + shop + ' !';
    else m = hi + 'je vous écris au sujet de votre commande n° ' + num + ' chez ' + shop + '.';
    return fr(m);
  }
  function confirmMessage(o) {
    const n = firstName(o);
    return fr('Bonjour' + (n ? ' ' + n : '') + ', pouvez-vous confirmer votre commande n° ' + o.id.replace('#', '') + ' de ' + price(dueAtDoor(o) || o.total) + ' chez ' + storeName() + ', livrée à ' + str(o.customer && o.customer.commune) + ' ? Répondez OUI.');
  }
  // What the courier needs, in one WhatsApp message
  function courierMessage(o) {
    const c = o.customer || {};
    const due = dueAtDoor(o);
    return fr(['Livraison ' + o.id + ' · ' + storeName(),
      'Client : ' + str(c.name) + ', ' + phoneFmt(c.phone),
      'Adresse : ' + str(c.commune) + (c.address ? ', ' + c.address : ''),
      'Articles : ' + itemsLine(o),
      isCod(o) ? 'À encaisser : ' + price(due) + (paidDeposit(o) ? ' (acompte de ' + price(paidDeposit(o)) + ' déjà payé)' : '') : 'Déjà payée : rien à encaisser',
      o.note ? 'Note : ' + o.note : ''].filter(Boolean).join('\n'));
  }
  function recapMessage(o) {
    const n = firstName(o);
    return fr(['Bonjour' + (n ? ' ' + n : '') + ', merci pour votre commande chez ' + storeName() + ' !',
      'Commande n° ' + o.id.replace('#', '') + ' : ' + arr(o.items).map((i) => i.qty + ' × ' + i.name + ' (' + price(i.qty * i.price) + ')').join(', '),
      'Livraison à ' + str(o.customer && o.customer.commune) + ' : ' + price(o.delivery),
      'Total : ' + price(o.total) + (isCod(o) ? ', à régler à la livraison.' : ', par ' + payLabel(o.payment) + '.')].join('\n'));
  }
  function payState(o) {
    const lbl = payLabel(o.payment);
    if (o.status === 'cancelled') return { icon: 'x', title: o.cancelReason ? 'Livraison échouée : ' + o.cancelReason.toLowerCase() : 'Commande annulée', sub: isCod(o) ? (paidDeposit(o) ? 'Seul l’acompte de ' + price(paidDeposit(o)) + ' a été encaissé.' : 'Rien n’a été encaissé.') : 'Si le client a payé, remboursez-le par mobile money.' };
    if (isCod(o)) return o.status === 'delivered'
      ? { icon: 'check', title: 'Encaissée à la livraison', sub: price(o.total - paidDeposit(o)) + ' payés au livreur' + (paidDeposit(o) ? ', plus l’acompte de ' + price(paidDeposit(o)) + '.' : '.') }
      : { icon: 'wallet', title: 'À encaisser à la livraison : ' + price(dueAtDoor(o)), sub: paidDeposit(o) ? 'Acompte de ' + price(paidDeposit(o)) + ' déjà reçu. Le livreur encaisse le reste.' : 'Le livreur encaisse ' + price(o.total) + ', en espèces ou par mobile money.' };
    if (o.status === 'new') return { icon: 'clock', title: 'Paiement ' + lbl + ' en attente', sub: 'Le client valide la demande sur son téléphone. Ne livrez pas avant.' };
    return { icon: 'check', title: 'Payée par ' + lbl, sub: price(o.total) + ' versés sur votre numéro par le partenaire de paiement.' };
  }
  function timelineHTML(o) {
    const hist = arr(o.history);
    const at = (s) => { const h = hist.filter((x) => x && x.status === s).pop(); return h ? h.date : null; };
    const rank = { new: 0, paid: 1, shipped: 2, delivered: 3 };
    const cur = rank[o.status] === undefined ? 0 : rank[o.status];
    const steps = [{ title: 'Commande reçue', when: o.date, sub: channelLabel(o.channel) + (o.manual ? ' · ajoutée par vous' : ''), done: true }];
    if (o.status === 'cancelled') {
      steps.push({ title: o.cancelReason ? 'Livraison échouée' : 'Commande annulée', sub: o.cancelReason || '', when: at('cancelled'), cancel: true });
    } else {
      if (isCod(o)) steps.push({ title: 'Confirmée par le client', sub: o.confirmedAt ? 'sur WhatsApp' : '', when: o.confirmedAt, done: !!o.confirmedAt || cur >= 2 });
      else steps.push({ title: 'Paiement reçu', sub: payLabel(o.payment), when: at('paid'), done: cur >= 1 });
      steps.push({ title: 'Expédiée', sub: o.courier ? 'avec ' + courierName(o.courier) : '', when: at('shipped'), done: cur >= 2 });
      steps.push({ title: isCod(o) ? 'Livrée et encaissée' : 'Livrée', when: at('delivered'), done: cur >= 3 });
    }
    return H`<ol class="a-timeline">${steps.map((st) => {
      const done = st.cancel || st.done;
      const d = st.when ? toDate(st.when) : null;
      return H`<li class="a-tl${done ? ' is-done' : ''}${st.cancel ? ' is-cancel' : ''}"><span class="a-tl__dot">${st.cancel ? ico('x') : (done ? ico('check') : '')}</span>
        <span class="a-tl__txt"><span class="a-tl__title">${esc(st.title)}</span><span class="a-tl__when">${esc([st.sub, d ? fr(dateFull(d)) : (done ? '' : 'À venir')].filter(Boolean).join(' · '))}</span></span></li>`;
    })}</ol>`;
  }
  // Who delivers: her couriers (the team's « Livraison » role) or a Yango / Gozem courier, and what to collect
  function deliveryCard(o) {
    const c = o.customer || {};
    const open = o.status === 'new' || o.status === 'paid' || o.status === 'shipped';
    const list = couriers();
    const svc = serviceCouriers();
    const cur = o.courier || null;
    const key = cur ? (cur.service ? 'svc:' + cur.service : 'tel:' + cur.phone) : '';
    const cod = isCod(o);
    let collect = '';
    if (o.status !== 'cancelled') {
      if (cod) collect = H`<div><dt>${o.status === 'delivered' ? 'Encaissé à la livraison' : 'À encaisser par le livreur'}</dt><dd class="a-dl__big">${esc(price(o.status === 'delivered' ? o.total - paidDeposit(o) : dueAtDoor(o)))}</dd></div>`;
      else collect = H`<div><dt>À encaisser</dt><dd>${o.status === 'new' ? esc(fr('Rien, une fois le paiement ' + payLabel(o.payment) + ' validé : vérifiez-le avant de livrer.')) : 'Rien : déjà payée'}</dd></div>`;
    }
    let who = '';
    if (open) {
      if (list.length || svc.length) {
        who = H`<div class="a-field"><label class="a-label" for="o-courier">Livreur</label><div class="a-selectwrap"><select class="a-input" id="o-courier" data-courier="${esc(o.id)}">
          <option value=""${key ? '' : ' selected'}>Choisir un livreur</option>
          ${list.length ? H`<optgroup label="Mes livreurs">${list.map((m) => H`<option value="tel:${esc(m.phone)}"${key === 'tel:' + m.phone ? ' selected' : ''}>${esc(m.name + ' · ' + phoneFmt(m.phone))}</option>`)}</optgroup>` : ''}
          ${svc.length ? H`<optgroup label="Commander une course">${svc.map((x) => H`<option value="svc:${esc(x.service)}"${key === 'svc:' + x.service ? ' selected' : ''}>${esc(x.name + ' : commander une course')}</option>`)}</optgroup>` : ''}
          </select>${ico('down')}</div></div>
          ${cur && cur.phone ? H`<div class="a-btnrow" style="margin-top:10px"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="courier-send" data-id="${esc(o.id)}">${ico('chat')}Envoyer au livreur sur WhatsApp</button><a class="a-link a-small" href="#" data-act="couriers">Gérer mes livreurs</a></div>` : ''}
          ${cur && cur.service ? H`<p class="a-small" style="margin-top:8px">Démo : la course n’est pas commandée. Dans Jeere, ${esc(courierName(cur))} reçoit l’adresse et le numéro du client.</p>` : ''}
          ${!cur ? H`<p class="a-hint" style="margin-top:6px">Il reçoit sur WhatsApp l’adresse, le numéro du client et le montant à encaisser.</p>` : ''}`;
      } else {
        who = H`<div class="a-note" style="margin-top:12px">${ico('bike')}<p>Ajoutez vos livreurs : depuis la commande, ils reçoivent sur WhatsApp l’adresse, le numéro du client et le montant à encaisser.</p></div>
          <div class="a-btnrow" style="margin-top:10px"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="couriers">${ico('plus')}Ajouter mes livreurs</button></div>`;
      }
    } else if (cur) who = H`<p class="a-small" style="margin-top:10px">${esc(fr((o.status === 'delivered' ? 'Livrée par ' : 'Confiée à ') + courierName(cur)))}</p>`;
    let dep = '';
    if (cod && o.status !== 'cancelled' && o.status !== 'delivered') {
      if (o.deposit && o.deposit.amount) {
        dep = o.deposit.paid
          ? H`<p class="a-paystate a-paystate--line a-tone--ok" style="margin-top:12px">${ico('check')}<span><strong>${esc(fr('Acompte reçu : ' + price(o.deposit.amount)))}</strong><span>${esc(fr('Par ' + (opLabel(o.deposit.op) || 'mobile money') + '. Démo : rien n’a été encaissé.'))}</span></span></p>`
          : H`<div class="a-paystate a-paystate--line a-tone--warn" style="margin-top:12px">${ico('clock')}<span><strong>${esc(fr('Acompte demandé : ' + price(o.deposit.amount)))}</strong><span>${esc(fr('Par ' + (opLabel(o.deposit.op) || 'mobile money') + ', sur le ' + phoneFmt(c.phone) + '.'))}</span></span><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="deposit-paid" data-id="${esc(o.id)}">Acompte reçu</button></div>`;
      } else if (o.status === 'new' && o.total >= 20000) {
        dep = H`<div class="a-deposit"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="deposit-ask" data-id="${esc(o.id)}">${ico('phone')}Demander un acompte</button><span class="a-hint">Par mobile money, avant que le livreur parte : utile pour une grosse commande.</span></div>`;
      }
    }
    return H`<section class="a-card a-od-deliv" aria-labelledby="h-deliv">
      <div class="a-card__head"><h2 class="a-card__title" id="h-deliv">Livraison</h2></div>
      <dl class="a-dl"><div><dt>Livrer à</dt><dd>${esc(c.commune)}${c.address ? ' · ' + esc(c.address) : ''}</dd></div>${collect}</dl>
      ${o.failNote ? H`<div class="a-note ${o.status === 'cancelled' ? 'a-note--err' : 'a-note--strong'}" style="margin-top:12px">${ico('alert')}<p>${esc(fr(o.failNote))}</p></div>` : ''}
      ${who}${dep}
    </section>`;
  }
  const opLabel = (v) => { const o = arr(D && D.OPERATOR_OPTIONS).find((x) => x.value === v); return o ? o.label : ''; };
  function viewOrder(raw) {
    const o = findOrder('#' + String(raw).replace(/^#/, ''));
    if (!o) return notFound('Commande introuvable', '#commandes', 'Retour aux commandes');
    const c = o.customer || {};
    const d = toDate(o.date);
    const ps = payState(o);
    const items = arr(o.items);
    const count = items.reduce((t, i) => t + (i.qty || 0), 0);
    const main = mainAction(o);
    let actions = '';
    if (main) actions += H`<button class="a-btn a-btn--primary a-odetail__main" type="button" data-act="${main.act}" data-id="${esc(o.id)}"${main.status ? H` data-status="${esc(main.status)}"` : ''} data-primary>${ico(main.icon)}${esc(main.label)}</button>`;
    actions += H`<a class="a-btn a-btn--ghost a-btn--wa" href="${esc(waLink(c.phone, waMessage(o)))}" target="_blank" rel="noopener" aria-label="Écrire au client sur WhatsApp">${ico('chat')}<span class="a-wide-txt">Écrire sur WhatsApp</span><span class="a-narrow-txt">WhatsApp</span></a>`;
    actions += H`<a class="a-btn a-btn--ghost a-odetail__call" href="tel:${esc(c.phone)}">${ico('call')}<span>Appeler</span></a>`;
    if (o.status === 'new' && isCod(o) && !o.confirmedAt) actions += H`<button class="a-btn a-btn--soft a-odetail__wide" type="button" data-act="order-confirmed" data-id="${esc(o.id)}">${ico('check')}Le client a confirmé</button>`;
    actions += H`<button class="a-btn a-btn--quiet a-odetail__more" type="button" data-act="order-more" data-id="${esc(o.id)}" aria-haspopup="dialog">${ico('more')}Plus d’actions</button>`;
    return H`<div class="a-page">
      ${pageHead(H`Commande ${esc(o.id)} ${pill(o.status)}`, H`${d ? esc(fr(cap(dateFull(d)))) : ''} · ${esc(channelLabel(o.channel))}${o.manual ? '' : H` · ${sampleChip()}`}`, '', { href: '#commandes', label: 'Commandes' })}
      <div class="a-odetail__actions">${actions}</div>
      <div class="a-cols a-odetail">
        <div class="a-stack">
          <section class="a-card a-od-items" aria-labelledby="h-items">
            <div class="a-card__head" style="margin-bottom:4px"><h2 class="a-card__title" id="h-items">Articles <span class="a-chip">${esc(plural(count, 'article', 'articles'))}</span></h2></div>
            <ul class="a-items">${items.map((it) => {
              const p = itemProduct(it);
              return H`<li class="a-item"><span class="a-itemthumb">${p ? thumb(p) : H`<span class="a-thumb">${ico('bag')}</span>`}<span class="a-qtybadge" aria-hidden="true">${it.qty}</span></span>
                <span class="a-item__main"><span class="a-item__name">${esc(it.name)}</span><span class="a-item__qty">${esc(it.qty + ' × ' + price(it.price))}</span></span><span class="a-item__total">${esc(price(it.qty * it.price))}</span></li>`;
            })}</ul>
            <dl class="a-totals"><div><dt>Sous-total</dt><dd>${esc(price(o.subtotal))}</dd></div><div><dt>Livraison (${esc(c.commune)})</dt><dd>${esc(price(o.delivery))}</dd></div><div class="is-total"><dt>Total</dt><dd>${esc(price(o.total))}</dd></div></dl>
            <div class="a-paystate a-tone--${({ x: 'err', check: 'ok', wallet: 'warn', clock: 'warn' })[ps.icon] || 'info'}" style="margin-top:12px">${ico(ps.icon)}<span><strong>${esc(fr(ps.title))}</strong><span>${esc(fr(ps.sub))}</span></span></div>
          </section>
          <section class="a-card a-od-tl" aria-labelledby="h-tl"><div class="a-card__head"><h2 class="a-card__title" id="h-tl">Suivi</h2></div>${timelineHTML(o)}</section>
        </div>
        <div class="a-stack">
          ${deliveryCard(o)}
          <section class="a-card" aria-labelledby="h-cust">
            <div class="a-card__head"><h2 class="a-card__title" id="h-cust">Client</h2></div>
            <dl class="a-dl"><div><dt>Nom</dt><dd>${esc(c.name)}</dd></div>
              <div><dt>Téléphone</dt><dd><a class="a-tel" href="tel:${esc(c.phone)}">${esc(phoneFmt(c.phone))}</a></dd></div>
              <div><dt>Commune</dt><dd>${esc(c.commune)}</dd></div>
              ${c.address ? H`<div><dt>Adresse, repère</dt><dd>${esc(c.address)}</dd></div>` : ''}</dl>
            ${o.manual ? '' : H`<p class="a-small" style="margin-top:12px">Client d’exemple : ce numéro n’existe pas.</p>`}
          </section>
          <section class="a-card" aria-labelledby="h-pay">
            <div class="a-card__head"><h2 class="a-card__title" id="h-pay">Paiement et canal</h2></div>
            <dl class="a-dl"><div><dt>Moyen de paiement</dt><dd>${esc(isCod(o) ? 'À la livraison' : payLabel(o.payment))}</dd></div><div><dt>Canal</dt><dd>${esc(channelLabel(o.channel))}</dd></div></dl>
          </section>
          ${o.note ? H`<section class="a-card a-od-note" aria-labelledby="h-note"><div class="a-card__head"><h2 class="a-card__title" id="h-note">Note</h2></div><p class="a-text">${esc(o.note)}</p></section>` : ''}
        </div>
      </div></div>`;
  }

  function setOrderStatus(id, status, opts) {
    const o = findOrder(id);
    if (!o || o.status === status) return;
    const x = opts || {};
    const before = { status: o.status, history: copy(arr(o.history)), cancelledFrom: o.cancelledFrom, courier: copy(o.courier), cashIn: o.cashIn, cancelReason: o.cancelReason, failNote: o.failNote };
    if (status === 'cancelled') o.cancelledFrom = o.status;
    if (x.courier !== undefined) o.courier = x.courier;
    if (x.cashIn) o.cashIn = x.cashIn;
    if (x.cancelReason !== undefined) o.cancelReason = x.cancelReason;
    if (x.failNote !== undefined) o.failNote = x.failNote;
    if (status !== 'cancelled' && x.cancelReason === undefined) delete o.cancelReason;
    o.status = status;
    o.history = arr(o.history).concat([{ status, date: new Date().toISOString() }]);
    saveAdmin();
    refresh('[data-primary]');
    if (!$('#a-main [data-primary]')) focusMain();
    toast(x.toast || ('Commande ' + id + ' : ' + statusLabel(status) + '.'), {
      tone: x.tone || STATUS_TONE[status] || 'ok',
      action: 'Annuler',
      onAction: () => {
        const y = findOrder(id);
        if (!y) return;
        ['status', 'history', 'cancelledFrom', 'courier', 'cashIn', 'cancelReason', 'failNote'].forEach((k) => { if (before[k] === undefined || before[k] === null) delete y[k]; else y[k] = before[k]; });
        saveAdmin(); refresh(); toast('Statut rétabli.');
      }
    });
  }
  async function cancelOrder(id) {
    const o = findOrder(id);
    if (!o) return;
    const ok = await confirmBox({
      title: 'Annuler la commande ' + id + ' ?',
      text: 'Elle reste dans la liste, marquée « Annulée ». Le client n’est pas prévenu automatiquement : écrivez-lui sur WhatsApp.',
      ok: 'Annuler la commande', cancel: 'Garder la commande', danger: true
    });
    if (ok) setOrderStatus(id, 'cancelled');
    else focusMain();
  }
  // « Plus d’actions » of an order
  function orderMore(id) {
    const o = findOrder(id);
    if (!o) return;
    const open = o.status !== 'cancelled' && o.status !== 'delivered';
    const items = [{ id: 'print', icon: 'print', label: 'Imprimer le bon', run: () => printOrder(id) },
      { id: 'slip', icon: 'chat', label: o.courier && o.courier.phone ? 'Envoyer le bon à ' + courierName(o.courier) : 'Envoyer le bon sur WhatsApp', run: () => openWa(o.courier && o.courier.phone ? waLink(o.courier.phone, courierMessage(o)) : 'https://wa.me/?text=' + encodeURIComponent(courierMessage(o))) }];
    if (o.status === 'shipped') items.push({ id: 'fail', icon: 'alert', label: 'Livraison échouée', run: () => openFail(id) });
    if (o.status === 'new' && isCod(o) && !o.deposit && o.total >= 20000) items.push({ id: 'dep', icon: 'phone', label: 'Demander un acompte', run: () => openDeposit(id) });
    if (o.status === 'shipped' && !isCod(o)) items.push({ id: 'done', icon: 'check', label: 'Marquer comme livrée', run: () => setOrderStatus(id, 'delivered') });
    if (open) items.push({ id: 'cancel', icon: 'x', label: 'Annuler la commande', danger: true, run: () => cancelOrder(id) });
    actionSheet('Commande ' + id, items);
  }
  // « Demander la confirmation »: the WhatsApp message, then « Le client a confirmé »
  function askConfirm(id) {
    const o = findOrder(id);
    if (!o) return;
    openWa(waLink(o.customer.phone, confirmMessage(o)));
    toast('Message prêt dans WhatsApp. Quand le client répond OUI, touchez « Le client a confirmé ».', { ms: 6000 });
    const b = $('#a-main [data-act="order-confirmed"]');
    if (b) b.focus();
  }
  function markConfirmed(id) {
    const o = findOrder(id);
    if (!o || o.confirmedAt) return;
    o.confirmedAt = new Date().toISOString();
    o.history = arr(o.history).concat([{ event: 'confirmed', date: o.confirmedAt }]);
    saveAdmin();
    refresh('[data-primary]');
    toast('Commande ' + id + ' confirmée par le client.', { action: 'Annuler', onAction: () => { const y = findOrder(id); if (!y) return; delete y.confirmedAt; y.history = arr(y.history).filter((h) => h.event !== 'confirmed'); saveAdmin(); refresh(); } });
  }
  function setCourier(select) {
    const o = findOrder(select.getAttribute('data-courier'));
    if (!o) return;
    const v = select.value;
    if (!v) delete o.courier;
    else if (v.indexOf('svc:') === 0) { const id = v.slice(4); o.courier = { service: id, name: courierName({ service: id }) }; }
    else { const m = couriers().find((x) => x.phone === v.slice(4)); if (m) o.courier = { name: m.name, phone: m.phone }; }
    saveAdmin();
    refresh('#o-courier');
    if (o.courier) toast(courierName(o.courier) + ' livrera la commande ' + o.id + '.');
  }
  // « Confier au livreur »: the message to the courier (WhatsApp) and the order goes « Expédiée »
  function handoff(id) {
    const o = findOrder(id);
    if (!o) return;
    let c = o.courier;
    if (!c) {
      const list = couriers();
      const svc = serviceCouriers();
      if (list.length === 1 && !svc.length) c = { name: list[0].name, phone: list[0].phone };
      else {
        const sel = $('#o-courier');
        toast('Choisissez d’abord le livreur.');
        if (sel) { sel.focus(); try { sel.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } }
        return;
      }
    }
    if (c.phone) openWa(waLink(c.phone, courierMessage(o)));
    setOrderStatus(id, 'shipped', { courier: c, toast: c.phone ? 'Commande ' + id + ' confiée à ' + courierName(c) + ' : le message est prêt dans WhatsApp.' : 'Commande ' + id + ' confiée à ' + courierName(c) + ' (démo : aucune course commandée).' });
  }
  function sendToCourier(id) {
    const o = findOrder(id);
    if (o && o.courier && o.courier.phone) openWa(waLink(o.courier.phone, courierMessage(o)));
  }
  // Back from the courier with the money: delivered and collected
  function cashIn(id) {
    const o = findOrder(id);
    if (!o) return;
    const due = dueAtDoor(o);
    setOrderStatus(id, 'delivered', { cashIn: new Date().toISOString(), toast: 'Commande ' + id + ' livrée : ' + price(due) + ' reçus du livreur.' });
  }
  const FAIL_REASONS = [
    { id: 'absent', label: 'Client absent', hint: 'Personne à l’adresse.' },
    { id: 'injoignable', label: 'Injoignable', hint: 'Le client ne répond pas au téléphone.' },
    { id: 'refus', label: 'A refusé', hint: 'Le client a refusé le colis.' },
    { id: 'relivrer', label: 'À relivrer', hint: 'Un autre jour : la commande revient à préparer.' }
  ];
  function openFail(id) {
    const o = findOrder(id);
    if (!o) return;
    const html = H`<form class="a-dialog__card" data-dform="fail" data-id="${esc(id)}" novalidate>${dlgHead('fl-t', 'Livraison échouée')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Commande ${esc(id)}, ${esc(str(o.customer.name))} à ${esc(str(o.customer.commune))}. Que s’est-il passé ?</p>
        <fieldset class="a-fieldset"><legend class="a-sr">Raison</legend><div class="a-radios">${FAIL_REASONS.map((r, i) => H`<label class="a-radio"><input type="radio" name="reason" value="${r.id}"${i === 0 ? ' checked' : ''}><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">${esc(r.label)}</span><span class="a-radio__hint">${esc(fr(r.hint))}</span></span></label>`)}</div></fieldset>
        <p class="a-small" style="margin-top:12px">${isCod(o) ? 'Rien n’a été encaissé. Le colis revient chez vous avec le livreur.' : 'La commande est payée : proposez une autre livraison ou remboursez le client.'}</p></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Retour</button><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form>`;
    openDialog(html, { labelledby: 'fl-t' });
  }
  function saveFailForm(form) {
    const id = form.getAttribute('data-id');
    const r = FAIL_REASONS.find((x) => x.id === (serialize(form).reason || 'absent')) || FAIL_REASONS[0];
    closeDialog(true);
    const day = fr(dateShort(S.now));
    if (r.id === 'relivrer') setOrderStatus(id, 'new', { failNote: 'Livraison du ' + day + ' échouée : à relivrer. Prévenez le client, puis confiez-la de nouveau au livreur.', toast: 'Commande ' + id + ' : à relivrer.', tone: 'warn' });
    else setOrderStatus(id, 'cancelled', { cancelReason: r.label, failNote: 'Livraison du ' + day + ' échouée : ' + r.label.toLowerCase() + '.', toast: 'Commande ' + id + ' : livraison échouée (' + r.label.toLowerCase() + ').', tone: 'err' });
  }
  // A deposit by mobile money for a big cash-on-delivery order (demo: nothing is sent)
  function openDeposit(id) {
    const o = findOrder(id);
    if (!o) return;
    const suggest = Math.min(o.total, Math.max(1000, Math.ceil((o.total * 0.3) / 500) * 500));
    const ops = arr(D.OPERATOR_OPTIONS);
    const html = H`<form class="a-dialog__card" data-dform="deposit" data-id="${esc(id)}" novalidate>${dlgHead('dp-t', 'Demander un acompte')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Pour une grosse commande payée à la livraison, un acompte évite de faire partir le livreur pour rien. Le client le paie par mobile money ; le livreur encaisse le reste.</p>
        <div class="a-grid2" style="margin-top:14px"><div class="a-field"><label class="a-label" for="dp-amount">Montant</label><div class="a-affix"><input class="a-input a-input--num" id="dp-amount" name="amount" inputmode="numeric" value="${esc(number(suggest))}" autocomplete="off"><span class="a-affix__txt">FCFA</span></div><p class="a-hint">Sur ${esc(price(o.total))} au total.</p></div>
          <div class="a-field"><label class="a-label" for="dp-op">Par</label><div class="a-selectwrap"><select class="a-input" id="dp-op" name="op">${ops.map((x) => H`<option value="${esc(x.value)}">${esc(x.label)}</option>`)}</select>${ico('down')}</div></div></div>
        <p class="a-small" style="margin-top:10px">${esc(fr('La demande part sur le ' + phoneFmt(o.customer.phone) + '. Le client valide avec son code secret.'))}</p>
        <div class="a-note a-note--line" style="margin-top:12px">${ico('info')}<p>Démo : aucune demande de paiement n’est envoyée.</p></div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Envoyer la demande</button></div></form>`;
    openDialog(html, { labelledby: 'dp-t' });
  }
  function saveDepositForm(form) {
    clearErrors(form);
    const id = form.getAttribute('data-id');
    const o = findOrder(id);
    if (!o) return;
    const amount = parseAmount(form.elements.amount.value);
    if (!amount || amount >= o.total) { invalid(form.elements.amount, 'Un montant en FCFA, plus petit que le total de ' + price(o.total) + '.'); focusFirstError(form); return; }
    o.deposit = { amount, op: form.elements.op.value, paid: false, date: new Date().toISOString() };
    saveAdmin();
    closeDialog(true);
    refresh('[data-act="deposit-paid"]');
    toast('Demande d’acompte de ' + price(amount) + ' prête (démo). Touchez « Acompte reçu » quand le client a payé.', { ms: 6000 });
  }
  function depositPaid(id) {
    const o = findOrder(id);
    if (!o || !o.deposit) return;
    o.deposit.paid = true;
    o.deposit.paidAt = new Date().toISOString();
    saveAdmin();
    refresh('[data-primary]');
    toast('Acompte de ' + price(o.deposit.amount) + ' reçu. Le livreur encaisse ' + price(dueAtDoor(o)) + '.');
  }

  /* ---------- a new order, received on WhatsApp or by phone ---------- */

  // The communes of the checkout: the seller's zones, else the default ones
  function orderZones() {
    const own = ownZones();
    if (own.length) return own;
    try { const z = D.deliveryZones ? D.deliveryZones(S.config) : null; if (arr(z).length) return z; } catch (e) { /* fall through */ }
    return arr(D.communes);
  }
  function orderPayments() {
    const pay = (S.config && S.config.payments) || {};
    return ['cod'].concat(PAYMENTS().map((m) => m.key).filter((k) => k !== 'cod' && pay[k] === true));
  }
  function openNewOrder() {
    if (!canAddOrder()) { toast('Ajoutez d’abord un produit à votre boutique.'); return; }
    const zones = orderZones();
    const pays = orderPayments();
    const z0 = zones[0] || { name: '', fee: 0 };
    const chans = arr(D.ORDER_CHANNELS).length ? D.ORDER_CHANNELS : [{ id: 'whatsapp', label: 'WhatsApp' }];
    const order = ['whatsapp', 'instagram', 'tiktok', 'boutique'];
    const chs = chans.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const html = H`<form class="a-dialog__card" data-dform="neworder" novalidate>${dlgHead('no-t', 'Nouvelle commande')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Une commande reçue sur WhatsApp, par téléphone ou en message : notez-la ici pour la suivre comme les autres.</p>
        <fieldset class="a-fieldset"><legend>Client</legend>
          <div class="a-grid2"><div class="a-field"><label class="a-label" for="no-name">Nom</label><input class="a-input" id="no-name" name="name" maxlength="40" autocomplete="off" placeholder="Koffi Y." data-autofocus></div>
            <div class="a-field"><label class="a-label" for="no-phone">Numéro WhatsApp</label><input class="a-input" id="no-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ex. : 05 44 12 34 56"></div></div>
          <div class="a-grid2" style="margin-top:16px"><div class="a-field"><label class="a-label" for="no-commune">Commune</label><div class="a-selectwrap"><select class="a-input" id="no-commune" name="commune">${zones.map((z) => H`<option value="${esc(z.name)}" data-fee="${Number(z.fee) || 0}">${esc(z.name + ' · ' + price(z.fee))}</option>`)}</select>${ico('down')}</div></div>
            <div class="a-field"><label class="a-label" for="no-fee">Frais de livraison</label><div class="a-affix"><input class="a-input a-input--num" id="no-fee" name="fee" inputmode="numeric" value="${esc(number(z0.fee || 0))}" autocomplete="off"><span class="a-affix__txt">FCFA</span></div></div></div>
          <div class="a-field"><label class="a-label" for="no-addr">Adresse ou repère <span class="a-opt">(facultatif)</span></label><input class="a-input" id="no-addr" name="address" maxlength="120" autocomplete="off" placeholder="Riviera 2, près de la pharmacie"></div>
        </fieldset>
        <fieldset class="a-fieldset"><legend>Articles</legend><ul class="a-picklist" id="no-items">${S.config.products.map((p) => H`<li class="a-pickrow" data-pid="${esc(p.id)}">${thumb(p, 'a-thumb--sm')}
            <span class="a-pickrow__main"><span class="a-pickrow__name">${esc(p.name || 'Sans nom')}</span><span class="a-pickrow__price">${esc(price(p.price))}</span></span>
            <span class="a-stepper"><button class="a-ibtn a-ibtn--line" type="button" data-act="no-qty" data-d="-1" aria-label="${esc('Retirer un ' + (p.name || 'article'))}" disabled>${ico('minus')}</button>
              <input class="a-stepper__n" name="q-${esc(p.id)}" value="0" inputmode="numeric" aria-label="${esc('Quantité de ' + (p.name || 'cet article'))}" autocomplete="off">
              <button class="a-ibtn a-ibtn--line" type="button" data-act="no-qty" data-d="1" aria-label="${esc('Ajouter un ' + (p.name || 'article'))}">${ico('plus')}</button></span></li>`)}</ul></fieldset>
        <div class="a-grid2" style="margin-top:16px"><div class="a-field"><label class="a-label" for="no-pay">Paiement</label><div class="a-selectwrap"><select class="a-input" id="no-pay" name="payment">${pays.map((k) => H`<option value="${esc(k)}">${esc(k === 'cod' ? 'À la livraison' : payLabel(k))}</option>`)}</select>${ico('down')}</div></div>
          <div class="a-field"><label class="a-label" for="no-channel">Reçue par</label><div class="a-selectwrap"><select class="a-input" id="no-channel" name="channel">${chs.map((c) => H`<option value="${esc(c.id)}"${c.id === 'whatsapp' ? ' selected' : ''}>${esc(c.label)}</option>`)}</select>${ico('down')}</div></div></div>
        <div class="a-field"><label class="a-label" for="no-note">Note <span class="a-opt">(facultatif)</span></label><textarea class="a-input a-input--area" id="no-note" name="note" rows="2" maxlength="300" placeholder="Taille, couleur, heure de livraison…"></textarea></div>
        <dl class="a-totals" id="no-totals" aria-live="polite"></dl></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">${ico('check')}Enregistrer la commande</button></div></form>`;
    const dlg = openDialog(html, { labelledby: 'no-t', wide: true, sheet: true });
    if (dlg) newOrderTotals($('form', dlg) || dlg);
  }
  function newOrderLines(form) {
    return S.config.products.map((p) => {
      const input = form.elements['q-' + p.id];
      const q = input ? Math.max(0, Math.min(99, parseInt(digits(input.value) || '0', 10))) : 0;
      return { p, q };
    }).filter((x) => x.q > 0);
  }
  function newOrderTotals(form) {
    const box = $('#no-totals', form);
    const lines = newOrderLines(form);
    const sub = lines.reduce((t, x) => t + x.q * (x.p.price || 0), 0);
    const fee = parseAmount(form.elements.fee.value) || 0;
    $$('.a-pickrow', form).forEach((row) => {
      const input = $('.a-stepper__n', row);
      const n = parseInt(digits(input.value) || '0', 10);
      row.classList.toggle('is-on', n > 0);
      const minus = $('[data-d="-1"]', row);
      if (minus) minus.disabled = n <= 0;
    });
    if (box) box.innerHTML = H`<div><dt>Sous-total (${esc(plural(lines.reduce((t, x) => t + x.q, 0), 'article', 'articles'))})</dt><dd>${esc(price(sub))}</dd></div><div><dt>Livraison</dt><dd>${esc(price(fee))}</dd></div><div class="is-total"><dt>Total</dt><dd>${esc(price(sub + fee))}</dd></div>`;
  }
  function stepQty(btn) {
    const row = btn.closest('.a-pickrow');
    const form = btn.closest('form');
    if (!row || !form) return;
    const input = $('.a-stepper__n', row);
    const n = Math.max(0, Math.min(99, (parseInt(digits(input.value) || '0', 10)) + (parseInt(btn.getAttribute('data-d'), 10) || 0)));
    input.value = String(n);
    newOrderTotals(form);
    const err = $('#no-items-err', form);
    if (err && n > 0) err.remove();
    if (btn.disabled) { const other = $('[data-d="1"]', row); if (other) other.focus(); }
  }
  function saveNewOrderForm(form) {
    clearErrors(form);
    const old = $('#no-items-err', form);
    if (old) old.remove();
    const v = serialize(form);
    const name = clip(v.name, 40);
    const phone = normPhone(v.phone);
    const lines = newOrderLines(form);
    const fee = parseAmount(v.fee);
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Indiquez le nom du client.');
    if (!digits(phone)) ok = invalid(form.elements.phone, 'Indiquez son numéro WhatsApp : c’est lui que le livreur appelle.') && ok;
    else if (phoneProblem(phone)) ok = invalid(form.elements.phone, phoneProblem(phone)) && ok;
    if (fee === null || fee > 100000) ok = invalid(form.elements.fee, 'Des chiffres seulement, 0 si la livraison est offerte.') && ok;
    if (!lines.length) {
      const list = $('#no-items', form);
      if (list) list.insertAdjacentHTML('afterend', fieldError('no-items-err', 'Ajoutez au moins un article avec le bouton +.'));
      if (ok) { const b = $('#no-items [data-d="1"]', form); if (b) b.focus(); }
      ok = false;
    }
    if (!ok) { focusFirstError(form); return; }
    const items = lines.map((x) => ({ productId: x.p.id, name: x.p.name, qty: x.q, price: x.p.price || 0 }));
    const subtotal = items.reduce((t, i) => t + i.qty * i.price, 0);
    const max = S.admin.orders.reduce((m, o) => Math.max(m, parseInt(digits(o.id) || '0', 10)), 1041);
    const now = new Date().toISOString();
    const pay = orderPayments().indexOf(v.payment) >= 0 ? v.payment : 'cod';
    const chan = arr(D.ORDER_CHANNELS).some((c) => c.id === v.channel) ? v.channel : 'whatsapp';
    const o = {
      id: '#' + (max + 1), date: now,
      customer: { name, phone, commune: clip(v.commune, 40), address: clip(v.address, 120) },
      items, subtotal, delivery: fee, total: subtotal + fee,
      payment: pay, status: 'new', channel: chan, history: [{ status: 'new', date: now }], manual: true
    };
    const note = str(v.note).trim().slice(0, 300);
    if (note) o.note = note;
    S.admin.orders.unshift(o);
    S.admin.demoSeeded = true;
    if (!saveAdmin()) { S.admin.orders.shift(); return; }
    closeDialog(true);
    go('#commandes/' + o.id.replace('#', ''));
    toast('Commande ' + o.id + ' ajoutée.', { action: 'Envoyer le récapitulatif', ms: 8000, onAction: () => openWa(waLink(o.customer.phone, recapMessage(o))) });
  }

  /* ---------- « Mes livreurs »: the team members with the Livraison role ---------- */

  function couriersHTML() {
    const list = couriers();
    return H`<div class="a-dialog__card">${dlgHead('cr-t', 'Mes livreurs')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Vos propres livreurs, à moto ou à pied. Depuis une commande, vous leur envoyez sur WhatsApp l’adresse, le numéro du client et le montant à encaisser.</p>
        ${list.length ? H`<div class="a-couriers">${list.map((m) => H`<div class="a-member"><span class="a-avatar">${esc(initials(m.name || '?'))}</span><span class="a-member__main"><span class="a-member__name">${esc(m.name || 'Livreur')}</span><span class="a-member__meta">${esc(phoneFmt(m.phone))}</span></span>
          <button class="a-ibtn" type="button" data-act="courier-del" data-phone="${esc(m.phone)}" aria-label="${esc('Retirer ' + (m.name || 'ce livreur'))}">${ico('trash')}</button></div>`)}</div>` : H`<p class="a-small" style="margin-top:12px">Aucun livreur pour l’instant.</p>`}
        <form class="a-form a-couriers__add" data-dform="courier" novalidate>
          <p class="a-label" style="margin-top:16px">Ajouter un livreur</p>
          <div class="a-grid2" style="margin-top:8px"><div class="a-field"><label class="a-label" for="cr-name">Prénom</label><input class="a-input" id="cr-name" name="name" maxlength="40" autocomplete="off" placeholder="Ibrahim"></div>
            <div class="a-field"><label class="a-label" for="cr-phone">Numéro WhatsApp</label><input class="a-input" id="cr-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ex. : 05 44 12 34 56"></div></div>
          <div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">${ico('plus')}Ajouter ce livreur</button></div>
        </form>
        <p class="a-small" style="margin-top:10px">Ils font partie de votre équipe, avec le rôle Livraison (Paramètres › Équipe). Démo : aucun message n’est envoyé.</p></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Fermer</button></div></div>`;
  }
  function syncCourierConnector() {
    const n = couriers().length;
    const was = conn('livreurs');
    S.admin.connectors.livreurs = { status: n ? 'connected' : 'off', values: {}, connectedAt: n ? (was.connectedAt || new Date().toISOString()) : '' };
  }
  function openCouriers() {
    const dlg = openDialog(couriersHTML(), { labelledby: 'cr-t', focus: couriers().length ? '[data-close]:not(.a-ibtn)' : '#cr-name', onClose: () => { if (S.inApp) refresh(); } });
    return dlg;
  }
  function redrawCouriers(focusSel) {
    const card = $('.a-dialog__card', dialogEl());
    if (!card) return;
    card.outerHTML = couriersHTML();
    const f = $(focusSel || '#cr-name', dialogEl());
    if (f) f.focus();
  }
  function saveCourierForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const name = clip(v.name, 40);
    const phone = normPhone(v.phone);
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Indiquez son prénom.');
    if (!digits(phone)) ok = invalid(form.elements.phone, 'Indiquez son numéro WhatsApp.') && ok;
    else if (phoneProblem(phone)) ok = invalid(form.elements.phone, phoneProblem(phone)) && ok;
    else if (S.admin.settings.team.some((m) => m.phone === phone)) ok = invalid(form.elements.phone, 'Ce numéro fait déjà partie de votre équipe.') && ok;
    if (S.admin.settings.team.length >= 20) { toast('20 personnes au plus dans l’équipe.'); ok = false; }
    if (!ok) { focusFirstError(form); return; }
    S.admin.settings.team.push({ name, phone, role: 'livraison' });
    syncCourierConnector();
    saveAdmin();
    redrawCouriers('#cr-name');
    announce(name + ' fait partie de vos livreurs.');
    toast(name + ' ajouté à vos livreurs.');
  }
  function removeCourier(phone) {
    const i = S.admin.settings.team.findIndex((m) => m.phone === phone && m.role === 'livraison');
    if (i < 0) return;
    const m = S.admin.settings.team.splice(i, 1)[0];
    syncCourierConnector();
    saveAdmin();
    redrawCouriers('#cr-name');
    toast((m.name || 'Le livreur') + ' retiré de vos livreurs.', { action: 'Annuler', onAction: () => { S.admin.settings.team.splice(i, 0, m); syncCourierConnector(); saveAdmin(); if (dialogEl() && dialogEl().open && $('#cr-name')) redrawCouriers(); else refresh(); } });
  }

  /* ---------- sharing the store ---------- */

  function shareSheet(title, text, url) {
    const msg = fr(text) + ' ' + url;
    const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const html = H`<div class="a-dialog__card">${dlgHead('sh-t', title)}
      <div class="a-dialog__body"><p class="a-dialog__lead">Sur votre statut WhatsApp, dans la bio Instagram ou TikTok : c’est comme ça qu’arrivent les premières commandes.</p>
        <div class="a-field" style="margin-top:14px"><label class="a-label" for="sh-url">Le lien</label><input class="a-input" id="sh-url" value="${esc(url)}" readonly></div>
        <div class="a-sharebtns">
          <a class="a-btn a-btn--primary" href="${esc('https://wa.me/?text=' + encodeURIComponent(msg))}" target="_blank" rel="noopener" data-share-wa>${ico('chat')}Envoyer sur WhatsApp</a>
          <button class="a-btn a-btn--ghost" type="button" data-act="share-copy" data-url="${esc(url)}">${ico('copy')}Copier le lien</button>
          ${canNative ? H`<button class="a-btn a-btn--quiet" type="button" data-act="share-native" data-url="${esc(url)}" data-text="${esc(fr(text))}" data-title="${esc(title)}">${ico('share')}Autres applications</button>` : ''}
        </div>
        <p class="a-small" style="margin-top:12px">Démo : cette adresse n’est pas encore en ligne. Dans Jeere, elle ouvre votre boutique.</p></div></div>`;
    openDialog(html, { sheet: true, labelledby: 'sh-t' });
  }
  function shareStore() { shareSheet('Partager ma boutique', 'Découvrez ' + storeName() + ', ma boutique en ligne :', storeUrl()); }
  function shareProduct(id) {
    const p = findProduct(id);
    if (!p) return;
    shareSheet('Partager ce produit', (p.name || 'Mon produit') + ', ' + price(p.price) + ', chez ' + storeName() + ' :', productUrl(p));
  }
  function copyLink(url) {
    const done = () => { toast('Lien copié.'); markShared(); };
    const fallback = () => { const i = $('#sh-url'); if (i) { i.focus(); i.select(); } toast('Sélectionnez le lien puis copiez-le.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function nativeShare(el) {
    try {
      navigator.share({ title: el.getAttribute('data-title') || storeName(), text: el.getAttribute('data-text') || '', url: el.getAttribute('data-url') || storeUrl() }).then(markShared, () => { /* cancelled */ });
    } catch (e) { /* not available */ }
  }
  // « Publier »: the address, the real publication and the live link (../creer/publish.js)
  function openPublish() {
    const v = validateFiche();
    const live = !!window.JeerePublish;
    const dlg = openDialog(H`<div class="a-dialog__card">${dlgHead('pb-t', 'Publier votre boutique')}
      <div class="a-dialog__body"><p class="a-dialog__lead"><strong>Score qualité : ${esc(String(v.score))} sur 100.</strong></p>
        <div id="a-publish-panel" style="margin-top:10px">${live ? '' : H`<p class="a-dialog__lead">Votre boutique est enregistrée dans ce navigateur seulement.</p>`}</div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Fermer</button></div></div>`, { labelledby: 'pb-t', onClose: () => { if (S.route && (S.route.name === 'parametres' || S.route.name === 'boutique' || S.route.name === 'accueil')) refresh(); } });
    const panel = dlg ? $('#a-publish-panel', dlg) : null;
    if (panel && live) window.JeerePublish.mount(panel, { getConfig: () => S.config, showScore: false });
  }
  function isPublished() { try { const r = window.JeerePublish && window.JeerePublish.local(); return !!(r && r.published && r.storeId); } catch (e) { return false; } }
  // « ? Aide » (top bar, sidebar, « Plus »): the guided tour again, « Premiers pas » back on the home page, a real person
  function openHelp() {
    const hidden = S.config && onboarding().checklistHidden === true;
    const tourOk = !!window.JeereTour && !!S.config;
    openDialog(H`<div class="a-dialog__card">${dlgHead('hp-t', 'Aide')}
      <div class="a-dialog__body">
        ${tourOk || hidden ? H`<div class="a-help__acts">
          ${tourOk ? H`<button class="a-btn a-btn--primary a-btn--block" type="button" data-act="tour-replay" data-autofocus>${ico('flag')}Revoir la visite guidée</button>` : ''}
          ${hidden ? H`<button class="a-btn a-btn--ghost a-btn--block" type="button" data-act="checklist-show">${ico('check')}Afficher les premiers pas</button>` : ''}
        </div>` : ''}
        <div class="a-dialog__done"><span class="a-empty__ico">${ico('help')}</span>
        <p class="a-dialog__lead"><strong>Une vraie personne vous répond.</strong> Dans Jeere, vous écrivez à notre équipe sur WhatsApp, en français : une question sur une commande, un paiement, votre boutique. C’est dans toutes les formules, même Gratuit.</p></div>
        <div class="a-note a-note--line" style="margin-top:8px">${ico('info')}<p>Démo : aucun message n’est envoyé.</p></div></div>
      <div class="a-dialog__foot"><button class="a-btn ${tourOk || hidden ? 'a-btn--ghost' : 'a-btn--primary'}" type="button" data-close${tourOk ? '' : ' data-autofocus'}>J’ai compris</button></div></div>`, { labelledby: 'hp-t' });
  }
  function markShared() {
    if (!S.admin || onboarding().sharedAt) return;
    onboarding().sharedAt = new Date().toISOString();
    saveAdmin();
    // The share sheet stays open (the seller may copy the link too): the home page is redrawn when it closes
    const again = () => { if (S.route && S.route.name === 'accueil') refresh(); };
    if (dialogEl() && dialogEl().open) { const prev = dlgOnClose; dlgOnClose = () => { if (prev) prev(); again(); }; } else again();
  }
  function setChecklistHidden(on) {
    onboarding().checklistHidden = on;
    saveAdmin();
    if (on) {
      toast('Premiers pas masqués. Retrouvez-les dans « ? Aide ».');
      refresh();
      const b = $('#a-help-btn');
      if (b && b.getClientRects().length) b.focus(); else focusMain();
    } else {
      closeDialog(true);
      if (S.route && S.route.name === 'accueil') refresh('.a-home__check .a-step, [data-act="checklist-hide"]'); else go('accueil');
    }
  }

  /* ---------- the guided tour of the dashboard (../creer/tour.js, shared with the Studio) ---------- */

  // Six steps on the home page: « Premiers pas », orders, payments, products, the share link, « ? Aide ». It
  // starts once per browser, a moment after the first visit (signed in or « Voir la démo »), unless the seller
  // is already busy. « ? Aide » › « Revoir la visite guidée » replays it. A click outside the bubble closes it.
  const TOUR_ID = 'admin';
  const isDesk = () => window.innerWidth >= 960;
  function tourSteps() {
    const nav = (id) => () => (isDesk() ? $('.a-nav__link[data-nav="' + id + '"]') : $('.a-tab[data-tab="' + id + '"]'));
    const desk = isDesk();
    const tap = desk ? 'cliquez' : 'touchez';
    return [
      { target: '.a-home__check', title: fr('Vos premiers pas'),
        text: fr('Les étapes pour ouvrir votre boutique. Elles se cochent toutes seules quand c’est fait ; ' + (desk ? 'cliquez sur l’une d’elles' : 'touchez-en une') + ' pour y aller.') },
      { target: nav('commandes'), title: fr('Vos commandes'),
        text: fr('Celles de votre boutique, de WhatsApp, d’Instagram et de TikTok, au même endroit. ' + (desk ? 'Le chiffre vous dit combien sont à préparer.' : 'Le point vous dit qu’il y en a à préparer.')) },
      { target: '.a-kpi--sales', title: fr('Vos paiements'),
        text: fr('Ce que vous avez encaissé, et ce que vos livreurs doivent encore encaisser. Connectez Wave dans Paiements : l’argent arrive sur votre numéro.') },
      { target: nav('produits'), title: fr('Vos produits'),
        text: fr('Ajoutez-les avec une photo prise au téléphone, un prix et le stock. Ils sont aussitôt dans votre boutique.') },
      { target: '.a-home__preview [data-act="share-store"]', title: fr('Partagez votre lien'),
        text: fr('Envoyez le lien de votre boutique sur WhatsApp, à vos clients et sur votre statut : les premières commandes arrivent comme ça.') },
      { target: '#a-help-btn', title: fr('Besoin d’aide ?'),
        text: fr('Revoyez cette visite, retrouvez les premiers pas ou écrivez à une vraie personne : ' + tap + (desk ? ' sur' : '') + ' « ? Aide ».') }
    ];
  }
  function tourInsets() {
    const top = $('.a-top');
    const bar = $('.a-tabbar');
    return {
      top: top && top.getClientRects().length ? top.getBoundingClientRect().bottom : 0,
      bottom: bar && bar.getClientRects().length ? bar.offsetHeight : 0
    };
  }
  function startTour() {
    const T = window.JeereTour;
    if (!T || !S.inApp || !S.config) return false;
    // A toast (« Bienvenue dans la démo »…) would show through the spotlight: it goes first
    const box = $('#a-toasts');
    if (box) box.innerHTML = '';
    T.start({ id: TOUR_ID, label: 'Visite guidée du tableau de bord', steps: tourSteps(), insets: tourInsets, doneLabel: 'C’est parti', returnFocus: () => $('#a-help-btn') });
    return true;
  }
  let tourTimer = 0;
  function maybeAutoTour() {
    const T = window.JeereTour;
    if (!T || T.seen(TOUR_ID) || !S.config || !S.route || S.route.name !== 'accueil') return;
    let busy = false;
    const mark = () => { busy = true; };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
    clearTimeout(tourTimer);
    tourTimer = setTimeout(() => {
      window.removeEventListener('pointerdown', mark, true);
      window.removeEventListener('keydown', mark, true);
      // (the hash may have changed a moment ago, before its hashchange: read it from the address)
      if (busy || !S.inApp || $('dialog[open]') || T.seen(TOUR_ID) || T.isOpen() || parseHash().name !== 'accueil') return;
      startTour();
    }, 1000);
  }

  /* ---------- the printed slip (« Imprimer le bon ») ---------- */

  function slipHTML(o) {
    const c = o.customer || {};
    const d = toDate(o.date);
    const cfg = S.config || { store: {} };
    let cash;
    if (o.status === 'cancelled') cash = (o.cancelReason ? 'Livraison échouée (' + o.cancelReason.toLowerCase() + ')' : 'Commande annulée') + ' : ne pas livrer.';
    else if (o.payment === 'cod' && o.status !== 'delivered') cash = 'À encaisser à la livraison : ' + price(dueAtDoor(o)) + (paidDeposit(o) ? ' (acompte de ' + price(paidDeposit(o)) + ' déjà payé)' : '');
    else if (o.payment !== 'cod' && o.status === 'new') cash = 'Paiement ' + payLabel(o.payment) + ' en attente : vérifier avant de livrer.';
    else cash = 'Déjà payée (' + payLabel(o.payment) + ') : rien à encaisser.';
    return H`<div class="a-slip">
      <div class="a-slip__head"><div><div class="a-slip__store">${esc(storeName())}</div><div class="a-slip__muted">${esc(subdomain())}${cfg.store.whatsapp ? ' · WhatsApp ' + esc(phoneFmt(cfg.store.whatsapp)) : ''}</div></div>
        <div><div class="a-slip__id">Bon de livraison ${esc(o.id)}</div><div class="a-slip__muted" style="text-align:right">${d ? esc(fr(dateFull(d))) : ''}</div></div></div>
      <div class="a-slip__grid">
        <div><div class="a-slip__label">Client</div><div><strong>${esc(c.name)}</strong></div><div>${esc(phoneFmt(c.phone))}</div><div>${esc(c.commune)}${c.address ? ' : ' + esc(c.address) : ''}</div></div>
        <div><div class="a-slip__label">Paiement</div><div>${esc(isCod(o) ? 'À la livraison' : payLabel(o.payment))} · ${esc(statusLabel(o.status))}</div><div class="a-slip__label" style="margin-top:6pt">Canal</div><div>${esc(channelLabel(o.channel))}</div>${o.courier ? H`<div class="a-slip__label" style="margin-top:6pt">Livreur</div><div>${esc(courierName(o.courier))}${o.courier.phone ? ' · ' + esc(phoneFmt(o.courier.phone)) : ''}</div>` : ''}</div>
      </div>
      <table><thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Prix</th><th class="r">Total</th></tr></thead>
        <tbody>${arr(o.items).map((it) => H`<tr><td>${esc(it.name)}</td><td class="r">${it.qty}</td><td class="r">${esc(price(it.price))}</td><td class="r">${esc(price(it.qty * it.price))}</td></tr>`)}</tbody>
        <tfoot class="a-slip__tot"><tr><td colspan="3">Sous-total</td><td class="r">${esc(price(o.subtotal))}</td></tr><tr><td colspan="3">Livraison (${esc(c.commune)})</td><td class="r">${esc(price(o.delivery))}</td></tr><tr class="big"><td colspan="3">Total</td><td class="r">${esc(price(o.total))}</td></tr></tfoot></table>
      <div class="a-slip__cash">${esc(fr(cash))}</div>
      ${o.note ? H`<div class="a-slip__note"><strong>Note du client :</strong> ${esc(o.note)}</div>` : ''}
      <div class="a-slip__sign"><div>Signature du livreur</div><div>Signature du client, à la réception</div></div>
      <p class="a-slip__foot">Bon imprimé depuis Jeere${o.manual ? '' : ' · Démo : commande d’exemple'}</p></div>`;
  }
  // The slip is printed alone only while html.a-printing is set: « Imprimer le bon », or the browser's own
  // Print on an order's page (beforeprint). Any other print shows the page in view, without the menus.
  function fillSlip(id) {
    const o = findOrder(id);
    const box = $('#a-print');
    if (!o || !box) return false;
    box.innerHTML = slipHTML(o);
    document.documentElement.classList.add('a-printing');
    return true;
  }
  function clearSlip() {
    document.documentElement.classList.remove('a-printing');
    const box = $('#a-print');
    if (box) box.innerHTML = '';
  }
  function printOrder(id) {
    if (!fillSlip(id)) return;
    try { window.print(); } catch (e) { clearSlip(); toast('L’impression n’est pas disponible sur cet appareil.'); }
  }
  function onBeforePrint() {
    if (document.documentElement.classList.contains('a-printing')) return;
    const r = S.inApp && S.route;
    if (r && r.name === 'commandes' && r.parts[0]) fillSlip('#' + String(r.parts[0]).replace(/^#/, ''));
  }

  /* ------------------------------------------------------------------ PRODUITS */

  const BADGES = () => (D && isObj(D.BADGES) ? D.BADGES : { new: 'Nouveau', best: 'Best-seller', promo: 'Promo' });
  const ART_LABELS = () => (D && isObj(D.ART_LABELS) ? D.ART_LABELS : { box: 'Boîte' });
  const ART_KINDS = () => (D && arr(D.ART_KINDS).length ? D.ART_KINDS : Object.keys(ART_LABELS()));
  const COLORS = () => (D && arr(D.PRODUCT_COLORS).length ? D.PRODUCT_COLORS : ['#E9D8BD', '#E8E6DF']);
  const stockOf = (id) => { const n = S.admin.stock && S.admin.stock[id]; return typeof n === 'number' && isFinite(n) ? n : null; };
  function stockText(id) {
    const n = stockOf(id);
    if (n === null) return '';
    if (n === 0) return 'Épuisé';
    return (n < LOW_STOCK ? 'Stock faible : ' : '') + plural(n, 'en stock', 'en stock');
  }
  const LOW_STOCK = 3;
  const stockTone = (id) => { const n = stockOf(id); return n === null ? '' : (n === 0 ? 'err' : (n < LOW_STOCK ? 'warn' : '')); };
  function productMeta(p) {
    const bits = [];
    if (p.category) bits.push(esc(p.category));
    if (p.badge && BADGES()[p.badge]) bits.push(esc(BADGES()[p.badge]));
    const st = stockText(p.id);
    const tone = stockTone(p.id);
    if (st) bits.push('<span class="a-stock' + (stockOf(p.id) === 0 ? ' is-out' : '') + (tone ? ' a-tone--' + tone : '') + '">' + (tone ? '<span class="a-dot" aria-hidden="true"></span>' : '') + esc(st) + '</span>');
    return bits.join(' · ');
  }
  const hasPhoto = (p) => typeof p.image === 'string' && /^data:image\//.test(p.image);
  // A demo photo is not the seller's photo yet: those products stay « sans vraie photo »
  const noPhotoChip = (p) => (demoPhoto(p)
    ? H`<span class="a-chip a-chip--line a-chip--nophoto">${ico('camera')}Photo d’exemple</span>`
    : H`<span class="a-chip a-chip--line a-chip--nophoto">${ico('camera')}Sans photo</span>`);
  // A thumbnail, with a small camera badge while the product has no real photo
  function pthumb(p) { return '<span class="a-pthumb">' + thumb(p) + (hasPhoto(p) ? '' : '<span class="a-pthumb__badge" aria-hidden="true">' + ico('camera') + '</span>') + '</span>'; }
  function productsListHTML() {
    const q = fold(S.productQuery).trim();
    const list = S.config.products.filter((p) => (!q || fold(p.name + ' ' + p.category + ' ' + p.description).indexOf(q) >= 0) && (!S.productNoPhoto || !hasPhoto(p)));
    if (!S.config.products.length) {
      return H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('tag')}</span><p class="a-empty__title">Aucun produit pour l’instant</p>
        <p class="a-empty__text">Ajoutez votre premier produit : une photo, un nom, un prix. Il apparaît tout de suite dans votre boutique.</p>
        <div class="a-btnrow"><a class="a-btn a-btn--primary" href="#produits/nouveau">${ico('plus')}Ajouter un produit</a></div></div></div>`;
    }
    if (!list.length) return S.productNoPhoto && !q
      ? H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('check')}</span><p class="a-empty__title">Tous vos produits ont une photo</p><p class="a-empty__text">Bravo : une vraie photo vend mieux qu’un dessin.</p></div></div>`
      : H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('search')}</span><p class="a-empty__title">Aucun produit trouvé</p><p class="a-empty__text">Essayez un autre mot.</p></div></div>`;
    const grid = S.admin.prefs.productView === 'grid';
    if (grid) {
      return H`<ul class="a-pgrid">${list.map((p) => H`<li><article class="a-pcard">
        <a class="a-pcard__link" href="#produits/${esc(p.id)}"><span class="a-pcard__img" style="background:${safeColor(p.color)}">${visual(p)}${p.badge && BADGES()[p.badge] ? H`<span class="a-chip a-chip--ink a-pcard__badge">${esc(BADGES()[p.badge])}</span>` : ''}${hasPhoto(p) ? '' : H`<span class="a-pcard__nophoto">${noPhotoChip(p)}</span>`}</span>
          <span class="a-pcard__body"><span class="a-pcard__name">${esc(p.name || 'Sans nom')}</span><span class="a-pcard__price">${esc(price(p.price))}</span><span class="a-pcard__meta">${productMeta(p) || '&nbsp;'}</span></span></a>
        <button class="a-ibtn a-pcard__more" type="button" data-act="product-more" data-id="${esc(p.id)}" aria-label="${esc('Actions pour ' + (p.name || 'ce produit'))}">${ico('more')}</button></article></li>`)}</ul>`;
    }
    return H`<div class="a-card a-card--flush"><ul class="a-rows">${list.map((p) => H`<li class="a-prow">
      <a class="a-row" href="#produits/${esc(p.id)}">${pthumb(p)}<span class="a-row__main"><span class="a-row__title"><span>${esc(p.name || 'Sans nom')}</span></span><span class="a-prow__price">${esc(price(p.price))}</span>${productMeta(p) ? H`<span class="a-row__meta">${productMeta(p)}</span>` : ''}${hasPhoto(p) ? '' : H`<span class="a-row__tags">${noPhotoChip(p)}</span>`}</span>
        <span class="a-row__end"><span class="a-row__amount">${esc(price(p.price))}</span></span></a>
      <button class="a-ibtn" type="button" data-act="product-more" data-id="${esc(p.id)}" aria-label="${esc('Actions pour ' + (p.name || 'ce produit'))}">${ico('more')}</button></li>`)}</ul></div>`;
  }
  function viewProducts(r) {
    if (!S.config) return needStore('Produits');
    if (r.parts[0]) return viewProduct(r.parts[0]);
    const n = S.config.products.length;
    const photos = S.config.products.filter((p) => p.image).length;
    const grid = S.admin.prefs.productView === 'grid';
    const without = n - photos;
    return H`<div class="a-page">
      ${pageHead('Produits', esc(plural(n, 'produit', 'produits') + (n ? ' · ' + plural(photos, 'avec photo', 'avec photo') : '')), H`<a class="a-btn a-btn--primary" href="#produits/nouveau">${ico('plus')}Ajouter un produit</a>`)}
      ${n ? H`<div class="a-toolbar"><div class="a-toolbar__search">${ico('search')}<label class="a-sr" for="a-pq">Rechercher un produit</label>
          <input class="a-input" id="a-pq" type="search" data-search="products" placeholder="Nom, catégorie" value="${esc(S.productQuery)}" autocomplete="off" enterkeyhint="search"></div>
        <div class="a-toolbar__end">${without || S.productNoPhoto ? H`<button class="a-filter" type="button" data-act="product-nophoto" aria-pressed="${S.productNoPhoto ? 'true' : 'false'}">${ico('camera')}${S.config.products.some((p) => demoPhoto(p)) ? 'Sans vraie photo' : 'Sans photo'}<span class="a-filter__n">${without}</span></button>` : ''}
        <div class="a-seg" role="group" aria-label="Affichage"><button class="a-seg__btn" type="button" data-act="product-view" data-mode="list" aria-pressed="${grid ? 'false' : 'true'}">${ico('list')}<span>Liste</span></button><button class="a-seg__btn" type="button" data-act="product-view" data-mode="grid" aria-pressed="${grid ? 'true' : 'false'}">${ico('grid')}<span>Grille</span></button></div></div></div>` : ''}
      <div id="a-plist">${productsListHTML()}</div>
      ${n ? H`<p class="a-small" style="margin-top:12px">Ces produits sont ceux de votre fiche boutique : le Studio et votre boutique montrent les mêmes.</p>` : ''}
    </div>`;
  }

  function productActions(id) {
    const p = findProduct(id);
    if (!p) return;
    actionSheet(p.name || 'Produit', [
      { id: 'edit', icon: 'edit', label: 'Modifier', href: '#produits/' + p.id },
      { id: 'dup', icon: 'copy', label: 'Dupliquer', run: () => duplicateProduct(p.id) },
      { id: 'view', icon: 'eye', label: 'Voir dans la boutique', run: () => openEditor({ page: 'product', productId: p.id, view: 'preview' }) },
      { id: 'share', icon: 'chat', label: 'Partager sur WhatsApp', run: () => shareProduct(p.id) },
      { id: 'del', icon: 'trash', label: 'Supprimer', danger: true, run: () => deleteProduct(p.id) }
    ]);
  }
  function duplicateProduct(id) {
    const p = findProduct(id);
    if (!p) return;
    let newId = null;
    const ok = editConfig((cfg) => {
      const i = cfg.products.findIndex((x) => x.id === id);
      const c = copy(cfg.products[i]);
      c.id = freshProductId(cfg);
      c.name = clip(c.name + ' (copie)', 60);
      newId = c.id;
      cfg.products.splice(i + 1, 0, c);
    });
    if (!ok) return;
    if (stockOf(id) !== null) { S.admin.stock[newId] = stockOf(id); saveAdmin(); }
    if (S.route && S.route.parts[0]) go('#produits/' + newId); else refresh();
    toast('Copie créée : ' + clip(p.name, 40) + ' (copie).', { action: 'Modifier', onAction: () => go('#produits/' + newId) });
  }
  async function deleteProduct(id) {
    const p = findProduct(id);
    if (!p) return;
    const ok = await confirmBox({ title: 'Supprimer « ' + (p.name || 'ce produit') + ' » ?', text: 'Il disparaît de votre boutique. Les commandes passées le gardent.', ok: 'Supprimer', danger: true });
    if (!ok) { focusMain(); return; }
    let idx = -1;
    let removed = null;
    const okSave = editConfig((cfg) => { idx = cfg.products.findIndex((x) => x.id === id); removed = cfg.products.splice(idx, 1)[0]; });
    if (!okSave) return;
    const st = stockOf(id);
    if (st !== null) { delete S.admin.stock[id]; saveAdmin(); }
    clearDirty();
    if (S.route && S.route.parts[0]) go('#produits'); else refresh();
    toast('Produit supprimé.', {
      action: 'Annuler',
      onAction: () => {
        if (!removed) return;
        let back = false;
        const okBack = editConfig((cfg) => { if (!cfg.products.some((x) => x.id === removed.id)) { cfg.products.splice(Math.max(0, idx), 0, removed); back = true; } });
        if (okBack && back) {
          if (st !== null) { S.admin.stock[id] = st; saveAdmin(); }
          if (S.route && S.route.name === 'produits') refresh();
          toast('Produit rétabli.');
        } else if (okBack) toast('Le produit n’a pas pu être rétabli : un autre produit a pris sa place.');
      }
    });
  }

  function artsHTML(sel, color) {
    const L = ART_LABELS();
    const R = window.JeereRender;
    return ART_KINDS().map((k) => H`<label class="a-art"><input type="radio" name="art" value="${esc(k)}"${k === sel ? ' checked' : ''}>
      <span class="a-art__pic" style="background:${safeColor(color)}">${R && R.artSVG ? R.artSVG(k, color) : ''}</span><span class="a-art__lbl">${esc(L[k] || k)}</span></label>`).join('');
  }
  // « Prendre une photo » opens the phone's camera (capture); « Choisir dans la galerie » the pictures already taken
  // A demo photo (p.photo) shows while there is no photo of her own, with its credit; her photo
  // replaces it. « Retirer » on her photo brings back a demo photo still set; « Retirer la photo »
  // on the demo photo leaves the illustration.
  function photoHTML(p) {
    const has = typeof p.image === 'string' && /^data:image\//.test(p.image);
    const ph = has ? null : demoPhoto(p);
    const c = ph && ph.credit ? ph.credit : {};
    const link = (url, text) => (url ? H`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
    const credit = ph ? H`<p class="a-photo__credit">Photo : ${c.name ? link(c.profileUrl, c.name) + ' / ' : ''}${link(c.photoUrl, 'Unsplash')}</p>` : '';
    return H`<div class="a-photo__pic" style="background:${safeColor(p.color)}">${visual(p)}${has ? '' : H`<span class="a-chip a-chip--line a-photo__tag">${ph ? 'Photo d’exemple' : 'Illustration'}</span>`}</div>${credit}
      <div class="a-photo__btns"><label class="a-btn a-btn--primary a-btn--lg a-filebtn a-filebtn--cam">${ico('camera')}<span>${has ? 'Reprendre une photo' : 'Prendre une photo'}</span><input type="file" accept="image/*" capture="environment" data-photo aria-label="${has ? 'Reprendre une photo avec l’appareil photo' : 'Prendre une photo avec l’appareil photo'}"></label>
      <label class="a-btn a-btn--ghost a-filebtn a-filebtn--pick">${ico('image')}<span class="a-filebtn__touch">Choisir dans la galerie</span><span class="a-filebtn__mouse">${has ? 'Changer la photo' : 'Choisir une photo'}</span><input type="file" accept="image/*" data-photo aria-label="${has ? 'Changer la photo' : 'Choisir une photo'}"></label>
      ${has || ph ? H`<button class="a-btn a-btn--quiet" type="button" data-act="photo-remove">${ico('trash')}${ph ? 'Retirer la photo' : 'Retirer'}</button>` : ''}</div>`;
  }
  function viewProduct(pid) {
    const isNew = pid === 'nouveau';
    const niche = D.niches && S.config.store.niche && D.niches[S.config.store.niche];
    const p0 = isNew
      ? { id: '', name: '', price: '', category: '', badge: null, art: (niche && niche.art) || 'box', color: (niche && niche.color) || COLORS()[0], description: '', image: null, photo: null }
      : findProduct(pid);
    if (!p0) return notFound('Produit introuvable', '#produits', 'Retour aux produits');
    const dr = takeDraft('product');
    const p = {
      id: p0.id,
      name: pick(dr, 'name', p0.name), price: pick(dr, 'price', p0.price === '' ? '' : number(p0.price)), category: pick(dr, 'category', p0.category),
      badge: pick(dr, 'badge', p0.badge || ''), art: pick(dr, 'art', p0.art), color: pick(dr, 'color', p0.color), description: pick(dr, 'description', p0.description),
      image: pick(dr, 'image', p0.image || '') || null, photo: pick(dr, 'photo', p0.photo || '') || null,
      stock: pick(dr, 'stock', isNew ? '' : (stockOf(p0.id) === null ? '' : String(stockOf(p0.id))))
    };
    const cats = Array.from(new Set(S.config.products.map((x) => x.category).filter(Boolean)));
    const B = BADGES();
    const title = isNew ? 'Nouveau produit' : esc(p0.name || 'Produit sans nom');
    return H`<div class="a-page">
      ${pageHead(title, isNew ? 'Il apparaît dans votre boutique dès que vous l’enregistrez.' : 'Modifiez-le ici ou dans le Studio : c’est le même produit.', '', { href: '#produits', label: 'Produits' })}
      <form class="a-form" data-form="product" data-id="${esc(p0.id)}" data-dirty-label="${isNew ? 'Nouveau produit non enregistré' : 'Modifications non enregistrées'}" novalidate>
        <input type="hidden" name="image" value="${esc(p.image || '')}"><input type="hidden" name="photo" value="${esc(p.photo || '')}">
        <div class="a-cols">
          <div class="a-stack">
            <section class="a-card" aria-labelledby="h-pphoto"><div class="a-card__head"><div><h2 class="a-card__title" id="h-pphoto">Photo</h2><p class="a-card__sub">Une photo nette, à la lumière du jour. Nous la réduisons à 800 px de large pour qu’elle charge vite.</p></div></div>
              <div class="a-photo" id="p-photo">${photoHTML(p)}</div></section>
            <section class="a-card" aria-labelledby="h-pinfo"><div class="a-card__head"><h2 class="a-card__title" id="h-pinfo">Informations</h2></div>
              <div class="a-field"><div class="a-label-row"><label class="a-label" for="p-name">Nom</label>${counter(str(p.name).length, 60)}</div>
                <input class="a-input" id="p-name" name="name" maxlength="60" value="${esc(p.name)}" placeholder="Beurre de karité brut" autocomplete="off" data-count="60" required></div>
              <div class="a-grid2" style="margin-top:16px">
                <div class="a-field"><label class="a-label" for="p-price">Prix</label><div class="a-affix"><input class="a-input a-input--num" id="p-price" name="price" inputmode="numeric" value="${esc(p.price)}" placeholder="6 500" autocomplete="off"><span class="a-affix__txt">FCFA</span></div></div>
                <div class="a-field"><label class="a-label" for="p-cat">Catégorie <span class="a-opt">(facultatif)</span></label><input class="a-input" id="p-cat" name="category" maxlength="40" value="${esc(p.category)}" list="p-cats" placeholder="${esc(cats[0] || 'Robes')}" autocomplete="off">
                  <datalist id="p-cats">${cats.map((c) => H`<option value="${esc(c)}">`)}</datalist></div>
              </div>
              <div class="a-field"><label class="a-label" for="p-desc">Description</label><textarea class="a-input a-input--area" id="p-desc" name="description" rows="4" placeholder="Matière, taille, usage : une ou deux phrases suffisent.">${esc(p.description)}</textarea></div>
              <div class="a-field"><label class="a-label" for="p-badge">Étiquette</label><div class="a-selectwrap"><select class="a-input" id="p-badge" name="badge">
                <option value=""${!p.badge ? ' selected' : ''}>Aucune</option>${Object.keys(B).map((k) => H`<option value="${esc(k)}"${p.badge === k ? ' selected' : ''}>${esc(B[k])}</option>`)}</select>${ico('down')}</div>
                <p class="a-hint">Affichée sur la photo du produit, dans votre boutique.</p></div>
            </section>
            <section class="a-card" aria-labelledby="h-pstock"><div class="a-card__head"><div><h2 class="a-card__title" id="h-pstock">Stock <span class="a-chip a-chip--line">Facultatif</span></h2>
              <p class="a-card__sub">Pour vous seulement : gardé dans votre tableau de bord. Votre boutique n’affiche pas encore « épuisé ».</p></div></div>
              <div class="a-field"><label class="a-label" for="p-stock">Quantité disponible</label><input class="a-input a-input--num" id="p-stock" name="stock" inputmode="numeric" value="${esc(p.stock)}" placeholder="Non suivi" autocomplete="off" style="max-width:280px" aria-describedby="p-stock-h"><p class="a-hint" id="p-stock-h">Laissez vide pour ne pas suivre le stock de ce produit.</p></div>
            </section>
          </div>
          <div class="a-stack">
            <section class="a-card" aria-labelledby="h-part"><div class="a-card__head"><div><h2 class="a-card__title" id="h-part">Illustration</h2><p class="a-card__sub">Affichée tant qu’il n’y a pas de photo.</p></div></div>
              <fieldset class="a-fieldset" style="margin-top:0"><legend>Couleur du fond</legend><div class="a-swatches">${COLORS().map((c, i) => H`<label class="a-swatch"><input type="radio" name="color" value="${esc(c)}"${String(c).toLowerCase() === String(p.color).toLowerCase() ? ' checked' : ''} aria-label="${esc('Couleur ' + (i + 1))}"><span style="background:${safeColor(c)}"></span></label>`)}</div></fieldset>
              <fieldset class="a-fieldset"><legend>Dessin</legend><div class="a-arts" id="p-arts">${artsHTML(p.art, p.color)}</div></fieldset>
            </section>
            ${isNew ? '' : H`<section class="a-card" aria-labelledby="h-pmore"><div class="a-card__head"><h2 class="a-card__title" id="h-pmore">Plus d’actions</h2></div>
              <div class="a-danger-zone"><button class="a-btn a-btn--ghost" type="button" data-act="product-view-store" data-id="${esc(p0.id)}">${ico('eye')}Voir dans la boutique</button>
              <button class="a-btn a-btn--ghost" type="button" data-act="share-product" data-id="${esc(p0.id)}">${ico('chat')}Partager sur WhatsApp</button>
              <button class="a-btn a-btn--ghost" type="button" data-act="product-dup" data-id="${esc(p0.id)}">${ico('copy')}Dupliquer</button>
              <button class="a-btn a-btn--danger" type="button" data-act="product-del" data-id="${esc(p0.id)}">${ico('trash')}Supprimer</button></div></section>`}
          </div>
        </div>
        <div class="a-formfoot"><a class="a-btn a-btn--ghost" href="#produits">Annuler</a><button class="a-btn a-btn--primary" type="submit">${ico('check')}${isNew ? 'Ajouter le produit' : 'Enregistrer'}</button></div>
      </form></div>`;
  }
  // Live bits of the product form: the photo preview and the illustrations follow the colour
  function productFormLive(form) {
    const v = serialize(form);
    const p = { image: v.image || null, photo: v.photo || null, art: v.art, color: v.color };
    const ph = $('#p-photo', form);
    if (ph) ph.innerHTML = photoHTML(p);
    const arts = $('#p-arts', form);
    if (arts && arts.__color !== v.color) { arts.__color = v.color; arts.innerHTML = artsHTML(v.art, v.color); }
  }
  // Same rules as the editor: at most 800 px wide (and 1200 px high), JPEG at 0.8
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || (file.type && !/^image\//.test(file.type))) { reject(new Error('type')); return; }
      let url;
      try { url = URL.createObjectURL(file); } catch (e) { reject(e); return; }
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (!w || !h) throw new Error('size');
          const s = Math.min(1, 800 / w, 1200 / h);
          w = Math.max(1, Math.round(w * s));
          h = Math.max(1, Math.round(h * s));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          const data = c.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          resolve(data);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function onPhoto(input) {
    const form = input.closest('form');
    const file = input.files && input.files[0];
    if (!form || !file) return;
    const btn = input.closest('.a-filebtn');
    if (btn) btn.classList.add('is-busy');
    readImage(file).then((data) => {
      form.elements.image.value = data;
      if (form.elements.photo) form.elements.photo.value = ''; // her photo replaces the demo photo
      productFormLive(form);
      setDirty(form);
      toast('Photo ajoutée. Pensez à enregistrer.');
      const b = $$('.a-filebtn input', form).find((x) => visible(x.closest('.a-filebtn')));
      if (b) b.focus();
    }, () => {
      if (btn) btn.classList.remove('is-busy');
      toast('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.');
    });
  }
  function parseAmount(v) {
    const s = str(v).replace(/[\s  .]/g, '').replace(/fcfa$/i, '');
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return isFinite(n) && n <= 100000000 ? n : null;
  }
  function saveProductForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const id = form.getAttribute('data-id');
    const name = clip(v.name, 60);
    const pr = parseAmount(v.price);
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Donnez un nom au produit.');
    if (pr === null) ok = invalid(form.elements.price, str(v.price).trim() ? 'Le prix s’écrit en chiffres, en FCFA : par exemple 6 500.' : 'Indiquez le prix en FCFA.') && ok;
    let stock = null;
    if (str(v.stock).trim()) { stock = parseAmount(v.stock); if (stock === null) ok = invalid(form.elements.stock, 'Le stock s’écrit en chiffres, ou laissez la case vide.') && ok; }
    if (!ok) { focusFirstError(form); return; }
    const prod = {
      name, price: pr, category: clip(v.category, 40), badge: BADGES()[v.badge] ? v.badge : null,
      art: ART_KINDS().indexOf(v.art) >= 0 ? v.art : 'box', color: safeColor(v.color),
      description: str(v.description).trim().slice(0, 600), image: /^data:image\//.test(str(v.image)) ? v.image : null,
      photo: D && typeof D.photoId === 'function' ? D.photoId(str(v.photo)) : null
    };
    let savedId = id;
    const saved = editConfig((cfg) => {
      if (id) {
        const i = cfg.products.findIndex((x) => x.id === id);
        if (i < 0) throw new Error('gone');
        cfg.products[i] = Object.assign({}, cfg.products[i], prod);
      } else {
        savedId = freshProductId(cfg);
        cfg.products.push(Object.assign({ id: savedId }, prod));
      }
    });
    if (!saved) { toast('Le produit n’a pas été enregistré.', { tone: 'err' }); return; }
    if (stock === null) delete S.admin.stock[savedId]; else S.admin.stock[savedId] = stock;
    saveAdmin();
    clearDirty();
    if (!id) {
      window.location.replace('#produits/' + savedId);
      toast('Produit ajouté à votre boutique.', { action: 'Voir dans la boutique', onAction: () => openEditor({ page: 'product', productId: savedId, view: 'preview' }) });
    } else {
      refresh();
      focusMain();
      toast('Produit enregistré.', { action: 'Voir dans la boutique', onAction: () => openEditor({ page: 'product', productId: savedId, view: 'preview' }) });
    }
  }

  /* ------------------------------------------------------------------ CLIENTS */

  function customers() {
    const map = new Map();
    arr(S.admin && S.admin.orders).forEach((o) => {
      const c = o.customer || {};
      const key = digits(c.phone) || fold(c.name);
      if (!key) return;
      let x = map.get(key);
      if (!x) { x = { key, name: c.name, phone: c.phone, commune: c.commune, address: c.address, orders: [], spent: 0, last: '' }; map.set(key, x); }
      x.orders.push(o);
      if (o.status !== 'cancelled') x.spent += o.total || 0;
      if (str(o.date) > x.last) { x.last = str(o.date); x.commune = c.commune; x.address = c.address; x.name = c.name || x.name; }
    });
    return Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last));
  }
  function customersListHTML(openKey) {
    const q = fold(S.customerQuery).trim();
    const d = digits(S.customerQuery);
    const list = customers().filter((c) => !q || fold(c.name + ' ' + c.commune).indexOf(q) >= 0 || (d.length >= 3 && digits(c.phone).indexOf(d) >= 0));
    if (!list.length) {
      if (S.admin.orders.length) return H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('users')}</span><p class="a-empty__title">Aucun client trouvé</p><p class="a-empty__text">Essayez un autre nom ou numéro.</p></div></div>`;
      return H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('users')}</span><p class="a-empty__title">Pas encore de client</p><p class="a-empty__text">Vos clients apparaissent ici dès leur première commande. Partagez votre boutique pour les faire venir.</p>
        ${S.config ? H`<div class="a-btnrow"><button class="a-btn a-btn--primary" type="button" data-act="share-store">${ico('share')}Partager ma boutique sur WhatsApp</button></div>` : ''}</div></div>`;
    }
    return H`<div class="a-card a-card--flush"><ul class="a-rows">${list.map((c) => {
      const first = str(c.name).split(' ')[0];
      const hello = fr('Bonjour ' + first + ', c’est ' + storeName() + '. ');
      const last = toDate(c.last);
      const n = c.orders.length;
      return H`<li class="a-custli"><details class="a-cust"${c.key === openKey ? ' open' : ''}>
        <summary class="a-row a-cust__sum"><span class="a-avatar">${esc(initials(c.name))}</span><span class="a-row__main">
          <span class="a-row__title"><span>${esc(c.name)}</span>${n > 1 ? H`<span class="a-chip a-chip--xs">Fidèle</span>` : ''}</span>
          <span class="a-cust__line"><span class="a-cust__info">${esc(c.commune)} · ${esc(number(n) + NB + 'cmd')}${last ? ' · ' + esc(dateShort(last)) : ''}</span><span class="a-row__amount">${esc(price(c.spent))}</span></span></span>
          ${ico('chev', 'a-row__chev')}</summary>
        <div class="a-cust__body">
          <p class="a-small">${esc(phoneFmt(c.phone))}${c.address ? ' · ' + esc(c.address) : ''}${last ? ' · dernière commande ' + esc(when(c.last)) : ''}</p>
          <div class="a-btnrow"><a class="a-btn a-btn--primary a-btn--sm" href="${esc(waLink(c.phone, hello))}" target="_blank" rel="noopener">${ico('chat')}Écrire sur WhatsApp</a><a class="a-btn a-btn--ghost a-btn--sm" href="tel:${esc(c.phone)}">${ico('call')}Appeler</a></div>
          <ul class="a-cust__orders">${c.orders.map((o) => H`<li><a href="#commandes/${esc(o.id.replace('#', ''))}"><span>${esc(o.id)} · ${esc(when(o.date))}</span><span class="a-nowrap">${esc(price(o.total))} ${pill(o.status)}</span></a></li>`)}</ul>
        </div></details>
        <a class="a-ibtn a-ibtn--line a-cust__wa" href="${esc(waLink(c.phone, hello))}" target="_blank" rel="noopener" aria-label="${esc('Écrire à ' + (c.name || 'ce client') + ' sur WhatsApp')}">${ico('chat')}</a></li>`;
    })}</ul></div>`;
  }
  function viewClients(r) {
    const all = customers();
    const loyal = all.filter((c) => c.orders.length > 1).length;
    const openKey = r.query.c ? decodeURIComponent(r.query.c) : '';
    return H`<div class="a-page">
      ${pageHead('Clients', H`${esc(plural(all.length, 'client', 'clients'))}${loyal ? esc(' · ' + plural(loyal, 'a commandé plusieurs fois', 'ont commandé plusieurs fois')) : ''}${hasDemoOrders() ? H` · ${sampleChip()}` : ''}`)}
      <div class="a-toolbar"><div class="a-toolbar__search">${ico('search')}<label class="a-sr" for="a-cq">Rechercher un client</label>
        <input class="a-input" id="a-cq" type="search" data-search="customers" placeholder="Nom, commune, numéro" value="${esc(S.customerQuery)}" autocomplete="off" enterkeyhint="search"></div></div>
      <div id="a-clist">${customersListHTML(openKey)}</div>
      <p class="a-small" style="margin-top:12px">Les clients viennent de vos commandes.${hasDemoOrders() ? ' Ici ce sont surtout des exemples : leurs numéros n’existent pas.' : ''}</p>
    </div>`;
  }

  /* ------------------------------------------------------------------ BOUTIQUE EN LIGNE */

  function prefsForm(dr) {
    const st = S.config.store;
    const v = { name: pick(dr, 'name', st.name), tagline: pick(dr, 'tagline', st.tagline), city: pick(dr, 'city', st.city), whatsapp: pick(dr, 'whatsapp', phoneFmt(st.whatsapp)) };
    return H`<form class="a-form" data-form="prefs" novalidate>
      <div class="a-field"><div class="a-label-row"><label class="a-label" for="s-name">Nom de la boutique</label>${counter(str(v.name).length, 40)}</div><input class="a-input" id="s-name" name="name" maxlength="40" value="${esc(v.name)}" data-count="40" autocomplete="organization"></div>
      <div class="a-field"><div class="a-label-row"><label class="a-label" for="s-tag">Slogan</label>${counter(str(v.tagline).length, 80)}</div><input class="a-input" id="s-tag" name="tagline" maxlength="80" value="${esc(v.tagline)}" data-count="80" placeholder="Soins naturels faits à Abidjan"><p class="a-hint">Affiché en bas de chaque page de votre boutique.</p></div>
      <div class="a-grid2" style="margin-top:16px">
        <div class="a-field"><label class="a-label" for="s-city">Ville</label><input class="a-input" id="s-city" name="city" maxlength="40" value="${esc(v.city)}" placeholder="Abidjan" autocomplete="address-level2"></div>
        <div class="a-field"><label class="a-label" for="s-wa">Numéro WhatsApp</label><input class="a-input" id="s-wa" name="whatsapp" type="tel" inputmode="tel" value="${esc(v.whatsapp)}" placeholder="Ex. : 05 44 12 34 56" autocomplete="tel"><p class="a-hint">Vos clients vous écrivent sur ce numéro. +225 est ajouté pour vous.</p>
          ${!str(v.whatsapp).trim() && S.account && !S.forClient && phoneOk(S.account.phone) ? H`<div><button class="a-btn a-btn--soft a-btn--sm" type="button" data-act="use-my-wa">${ico('chat')}${esc(fr('Utiliser mon numéro ' + phoneFmt(S.account.phone)))}</button></div>` : ''}</div>
      </div>
      <div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">${ico('check')}Enregistrer</button></div>
    </form>`;
  }
  function savePrefsForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const name = clip(v.name, 40);
    const wa = str(v.whatsapp).trim();
    const waN = wa ? normPhone(wa) : '';
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Donnez un nom à votre boutique.');
    if (wa && phoneProblem(waN)) ok = invalid(form.elements.whatsapp, phoneProblem(waN)) && ok;
    if (!ok) { focusFirstError(form); return; }
    const old = S.config.store.name;
    const saved = editConfig((cfg) => {
      // Like the editor: the hero title that carried the old name follows the new one
      if (old && name !== old) {
        cfg.sections.forEach((s) => {
          if (s.type === 'hero' && s.settings && typeof s.settings.title === 'string' && s.settings.title.indexOf(old) >= 0) {
            const t = s.settings.title.split(old).join(name);
            s.settings.title = t.length <= 70 ? t : name;
          }
        });
      }
      cfg.store.name = name;
      cfg.store.tagline = clip(v.tagline, 80);
      cfg.store.city = clip(v.city, 40);
      cfg.store.whatsapp = waN;
    });
    if (!saved) return;
    if (S.account && !S.forClient) { S.account.storeName = name; saveAccount(); }
    if (!S.admin.subdomainChosen && !S.admin.settings.customDomain && D.subdomainFor) S.admin.settings.subdomain = D.subdomainFor(name);
    if (isOn('whatsapp') && waN) S.admin.connectors.whatsapp.values.number = waN;
    saveAdmin();
    clearDirty();
    refresh();
    toast('Préférences enregistrées.');
  }

  // « Utiliser mon numéro »: the account's number becomes the store's WhatsApp, in one tap
  function useMyWhatsapp() {
    const ph = S.account && S.account.phone;
    if (!S.config || !phoneOk(ph)) return;
    const f = $('#a-main form[data-form="prefs"]');
    if (f && S.dirty && S.dirty.form === 'prefs') { f.elements.whatsapp.value = phoneFmt(ph); setDirty(f); f.elements.whatsapp.focus(); toast('Numéro ajouté. Pensez à enregistrer.'); return; }
    if (!editConfig((cfg) => { cfg.store.whatsapp = ph; })) return;
    if (isOn('whatsapp')) S.admin.connectors.whatsapp.values.number = ph;
    saveAdmin();
    refresh();
    focusMain();
    toast(fr('Numéro WhatsApp de la boutique : ' + phoneFmt(ph) + '.'));
  }
  function viewBoutique() {
    if (!S.config) return needStore('Boutique en ligne');
    const cfg = S.config;
    const tpl = D.templates && D.templates[cfg.template];
    const pal = D.palettes && D.palettes[cfg.theme.palette];
    // The colours the store shows: the palette's, with the seller's own on top (theme.colors)
    let tcol = null;
    try { tcol = D.themeColors ? D.themeColors(cfg) : null; } catch (e) { tcol = null; }
    const shown = tcol && tcol.base ? tcol.base : (pal ? pal.colors : null);
    const ownColors = !!(tcol && tcol.custom);
    const fonts = D.fontPairs && D.fontPairs[cfg.theme.fonts];
    // Her own fonts (theme.typography): « Bodoni Moda · Manrope » instead of the suggestion's name
    let ty = null;
    try { ty = D.typography && isObj(cfg.theme.typography) ? D.typography(cfg) : null; } catch (e) { ty = null; }
    const fontsName = ty && ty.custom ? ty.display.name + ' · ' + ty.text.name : (fonts ? fonts.name : cfg.theme.fonts);
    const intens = arr(D.INTENSITY_OPTIONS).length ? D.INTENSITY_OPTIONS : [{ value: 'vivid', label: 'Vives' }, { value: 'soft', label: 'Douces' }];
    const pages = arr(cfg.pages);
    const v = validateFiche();
    const st = cfg.store;
    const sw = (c) => H`<span style="background:${safeColor(c)}"></span>`;
    S.mounts.push(() => mountMini($('#a-main .a-theme [data-mini]'), S.config, { max: 0.6 }));
    return H`<div class="a-page">
      ${pageHead('Boutique en ligne', H`${esc(subdomain())} · ${isPublished() ? 'En ligne' : 'Pas encore en ligne'}`, H`<button class="a-btn a-btn--ghost" type="button" data-act="view-store">${ico('eye')}Voir</button><button class="a-btn a-btn--ghost" type="button" data-act="share-store">${ico('share')}Partager</button><button class="a-btn a-btn--primary" type="button" data-act="open-editor" data-page="home">${ico('palette')}Personnaliser</button>`)}
      <div class="a-cols">
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-theme"><div class="a-card__head"><div><h2 class="a-card__title" id="h-theme">Thème</h2><p class="a-card__sub">Le modèle, les couleurs et les polices de votre boutique.</p></div></div>
            <div class="a-theme">${miniStage('Aperçu de votre boutique')}
              <div><dl class="a-dl">
                <div><dt>Modèle</dt><dd>${esc(tpl ? tpl.name + ' · ' + tpl.style : cfg.template)}</dd></div>
                <div><dt>Palette</dt><dd>${shown ? H`<span class="a-pal" aria-hidden="true">${sw(shown.bg)}${sw(shown.surface)}${sw(shown.accent)}${sw(shown.text)}</span> ` : ''}${esc(pal ? pal.name : cfg.theme.palette)}${ownColors ? ', avec vos couleurs' : ''}</dd></div>
                <div><dt>Polices</dt><dd>${esc(fontsName)}</dd></div>
                <div><dt>Logo</dt><dd>${storeLogo() ? H`<span class="a-logothumb"><img src="${esc(storeLogo())}" alt="${esc(fr('Logo de ' + (st.name || 'la boutique')))}"></span> ` : 'Le nom, écrit avec la police du thème · '}<a class="a-link" href="${EDITOR_URL}" data-act="open-editor" data-page="home" data-focus="logo">${storeLogo() ? 'Modifier' : 'Ajouter un logo'}</a></dd></div></dl>
                <div class="a-field"><span class="a-label" id="l-int">Couleurs</span><div class="a-seg" role="group" aria-labelledby="l-int">${intens.map((o) => H`<button class="a-seg__btn" type="button" data-act="intensity" data-v="${esc(o.value)}" aria-pressed="${cfg.theme.intensity === o.value ? 'true' : 'false'}">${esc(o.label)}</button>`)}</div>
                  <p class="a-hint">${esc(fr((intens.find((o) => o.value === cfg.theme.intensity) || intens[0]).hint || ''))}</p></div>
                <div class="a-card__foot"><button class="a-btn a-btn--primary" type="button" data-act="open-editor" data-page="home">${ico('palette')}Personnaliser le thème</button></div></div></div>
          </section>
          <section class="a-card" aria-labelledby="h-nav"><div class="a-card__head"><div><h2 class="a-card__title" id="h-nav">Navigation</h2><p class="a-card__sub">Les pages affichées dans le menu et en bas de votre boutique. Sur ordinateur, le menu montre 5 liens au plus.</p></div></div>
            ${pages.length ? H`<table class="a-navtable"><thead><tr><th scope="col">Page</th><th scope="col">Menu</th><th scope="col">Bas de page</th></tr></thead><tbody>${pages.map((p) => H`<tr><td>${esc(p.title || 'Sans titre')}</td>
              <td><span class="a-switch"><input type="checkbox" role="switch" data-navpage="${esc(p.id)}" data-which="inMenu"${p.inMenu ? ' checked' : ''} aria-label="${esc(fr('« ' + (p.title || 'Sans titre') + ' » dans le menu'))}"><span class="a-switch__track"></span></span></td>
              <td><span class="a-switch"><input type="checkbox" role="switch" data-navpage="${esc(p.id)}" data-which="inFooter"${p.inFooter ? ' checked' : ''} aria-label="${esc(fr('« ' + (p.title || 'Sans titre') + ' » en bas de page'))}"><span class="a-switch__track"></span></span></td></tr>`)}</tbody></table>` : H`<p class="a-small">Aucune page. <a class="a-link" href="#pages/nouvelle">Ajouter une page</a></p>`}
          </section>
          <section class="a-card a-card--flush" aria-labelledby="h-prefs"><div class="a-card__head"><div><h2 class="a-card__title" id="h-prefs">Préférences</h2><p class="a-card__sub">Nom, slogan, ville et numéro WhatsApp, dans Paramètres.</p></div></div>
            <ul class="a-rows" style="margin-top:8px"><li><a class="a-row" href="#parametres/boutique"><span class="a-subnav__ico">${ico('store')}</span><span class="a-row__main"><span class="a-row__title"><span>${esc(st.name || 'Sans nom')}</span></span>
              <span class="a-row__meta">${esc([st.city || 'Ville non renseignée', phoneOk(st.whatsapp) ? 'WhatsApp ' + phoneFmt(st.whatsapp) : 'WhatsApp non renseigné'].join(' · '))}</span></span><span class="a-row__go">Modifier</span>${ico('chev', 'a-row__chev')}</a></li></ul></section>
        </div>
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-bpages"><div class="a-card__head"><div><h2 class="a-card__title" id="h-bpages">Pages</h2><p class="a-card__sub">${esc(plural(pages.length, 'page', 'pages'))} en plus de l’accueil, des produits et du paiement.</p></div></div>
            <ul class="a-rows" style="margin:0 -16px">${pages.slice(0, 6).map((p) => H`<li><a class="a-row" href="#pages/${esc(p.id)}">${ico('pages')}<span class="a-row__main"><span class="a-row__title"><span>${esc(p.title || 'Sans titre')}</span></span></span>${ico('chev', 'a-row__chev')}</a></li>`)}</ul>
            <div class="a-card__foot"><a class="a-btn a-btn--ghost a-btn--block" href="#pages">Gérer les pages</a></div></section>
          <section class="a-card" aria-labelledby="h-q"><div class="a-card__head"><div><h2 class="a-card__title" id="h-q">Qualité</h2><p class="a-card__sub">Le score de votre fiche, calculé par Jeere.</p></div></div>
            <p class="a-summary"><span class="a-big">${v.score}<small class="a-muted" style="font-size:15px"> / 100</small></span><span class="a-chip ${v.score >= 80 ? 'a-chip--ink' : 'a-chip--line'}">${esc(v.status || '')}</span></p>
            ${arr(v.issues).slice(0, 3).map((i) => H`<p class="a-small" style="margin-top:8px">${esc(fr(i.message))}</p>`)}
            <div class="a-card__foot"><button class="a-btn a-btn--ghost a-btn--block" type="button" data-act="open-editor" data-page="home">Améliorer dans le Studio</button></div></section>
        </div>
      </div></div>`;
  }
  function setIntensity(val) {
    if (!S.config || S.config.theme.intensity === val) return;
    if (editConfig((cfg) => { cfg.theme.intensity = val; })) { refresh('[data-act="intensity"][data-v="' + val + '"]'); toast(val === 'soft' ? 'Couleurs douces.' : 'Couleurs vives.'); }
  }
  function toggleNav(input) {
    const id = input.getAttribute('data-navpage');
    const which = input.getAttribute('data-which') === 'inFooter' ? 'inFooter' : 'inMenu';
    const on = input.checked;
    const p = findPage(id);
    if (!p) return;
    if (!editConfig((cfg) => { const x = cfg.pages.find((q) => q.id === id); if (x) x[which] = on; })) { input.checked = !on; return; }
    toast('« ' + (p.title || 'Sans titre') + ' » ' + (on ? (which === 'inMenu' ? 'ajoutée au menu.' : 'ajoutée en bas de page.') : (which === 'inMenu' ? 'retirée du menu.' : 'retirée du bas de page.')));
  }

  /* ------------------------------------------------------------------ PAGES */

  const PAGE_MAX = () => (D && D.PAGE_LIMITS ? D.PAGE_LIMITS : { title: 60, slug: 60, body: 4000, max: 20 });
  const slugify = (s) => { try { return D.slugify(s); } catch (e) { return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); } };
  function pageIssues() {
    const out = {};
    arr(validateFiche().issues).forEach((i) => { if (i.target && i.target.kind === 'page') (out[i.target.id] = out[i.target.id] || []).push(i); });
    return out;
  }
  function excerpt(body, n) { const s = str(body).replace(/[\t\n\v\f\r ]+/g, ' ').replace(/^ | $/g, ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function viewPages(r) {
    if (!S.config) return needStore('Pages');
    if (r.parts[0]) return viewPage(r.parts[0]);
    const pages = arr(S.config.pages);
    const L = PAGE_MAX();
    const issues = pageIssues();
    const full = pages.length >= L.max;
    const terms = pages.find((p) => D.pageKind && D.pageKind(p) === 'terms' && /À adapter/.test(p.body));
    return H`<div class="a-page a-page--narrow">
      ${pageHead('Pages', 'Les pages de votre boutique en plus de l’accueil et des produits : à propos, livraison, contact, conditions…', full ? H`<button class="a-btn a-btn--primary" type="button" disabled>${ico('plus')}Ajouter une page</button>` : H`<a class="a-btn a-btn--primary" href="#pages/nouvelle">${ico('plus')}Ajouter une page</a>`)}
      ${terms ? H`<div class="a-note a-note--strong" style="margin-bottom:12px">${ico('alert')}<p>« ${esc(terms.title)} » est un modèle général : faites-le relire par un juriste avant d’ouvrir, puis retirez le paragraphe « À adapter ». <a class="a-link" href="#pages/${esc(terms.id)}">Ouvrir la page</a></p></div>` : ''}
      ${pages.length ? H`<div class="a-card a-card--flush"><ul class="a-rows">${pages.map((p, i) => {
        const iss = issues[p.id] || [];
        const worst = iss.find((x) => x.level === 'error') || iss.find((x) => x.level === 'warning');
        return H`<li class="a-pgrow" data-pg="${esc(p.id)}">
          <a class="a-row" href="#pages/${esc(p.id)}"><span class="a-row__main"><span class="a-row__title"><span>${esc(p.title || 'Sans titre')}</span></span>
            <span class="a-row__meta">/${esc(p.slug)} · ${esc(excerpt(p.body, 70) || 'Page vide')}</span>
            <span class="a-pgrow__chips">${p.inMenu ? H`<span class="a-chip">Menu</span>` : ''}${p.inFooter ? H`<span class="a-chip">Bas de page</span>` : ''}${!p.inMenu && !p.inFooter ? H`<span class="a-chip a-chip--line">Sans lien</span>` : ''}${worst ? H`<span class="a-chip a-chip--line">${ico('alert')}${esc(worst.level === 'error' ? 'À corriger' : 'À vérifier')}</span>` : ''}</span></span></a>
          <span class="a-pgrow__order"><button class="a-ibtn" type="button" data-act="page-move" data-id="${esc(p.id)}" data-dir="-1" aria-label="${esc(fr('Monter « ' + (p.title || 'Sans titre') + ' »'))}"${i === 0 ? ' disabled' : ''}>${ico('up')}</button>
            <button class="a-ibtn" type="button" data-act="page-move" data-id="${esc(p.id)}" data-dir="1" aria-label="${esc(fr('Descendre « ' + (p.title || 'Sans titre') + ' »'))}"${i === pages.length - 1 ? ' disabled' : ''}>${ico('down')}</button></span>
          <button class="a-ibtn" type="button" data-act="page-more" data-id="${esc(p.id)}" aria-label="${esc(fr('Actions pour « ' + (p.title || 'Sans titre') + ' »'))}">${ico('more')}</button></li>`;
      })}</ul></div>` : H`<div class="a-card"><div class="a-empty"><span class="a-empty__ico">${ico('pages')}</span><p class="a-empty__title">Aucune page</p><p class="a-empty__text">Ajoutez au moins « À propos », « Contact » et « Conditions de vente » : vos clients les cherchent avant d’acheter.</p>
        <div class="a-btnrow"><a class="a-btn a-btn--primary" href="#pages/nouvelle">${ico('plus')}Ajouter une page</a><button class="a-btn a-btn--ghost" type="button" data-act="pages-defaults">Remettre les 4 pages d’exemple</button></div></div></div>`}
      <p class="a-small" style="margin-top:12px">${full ? esc(fr('Vous avez atteint ' + L.max + ' pages, le maximum.')) + ' ' : ''}L’ordre est celui du menu et du bas de page de votre boutique.</p>
    </div>`;
  }
  function viewPage(pid) {
    const isNew = pid === 'nouvelle';
    const L = PAGE_MAX();
    if (isNew && arr(S.config.pages).length >= L.max) return notFound('Vous avez atteint ' + L.max + ' pages', '#pages', 'Retour aux pages');
    const p0 = isNew ? { id: '', title: '', slug: '', body: '', inMenu: false, inFooter: true } : findPage(pid);
    if (!p0) return notFound('Page introuvable', '#pages', 'Retour aux pages');
    const dr = takeDraft('page');
    const v = {
      title: pick(dr, 'title', p0.title), slug: pick(dr, 'slug', p0.slug), body: pick(dr, 'body', p0.body),
      inMenu: pick(dr, 'inMenu', p0.inMenu), inFooter: pick(dr, 'inFooter', p0.inFooter), slugTouched: pick(dr, 'slugTouched', isNew ? '' : '1')
    };
    const kind = !isNew && D.pageKind ? D.pageKind(p0) : null;
    return H`<div class="a-page a-page--narrow">
      ${pageHead(isNew ? 'Nouvelle page' : esc(p0.title || 'Page sans titre'), isNew ? 'Par exemple « Guide des tailles » ou « Nos engagements ».' : 'Texte simple : votre boutique s’occupe de la mise en page.', '', { href: '#pages', label: 'Pages' })}
      <form class="a-form" data-form="page" data-id="${esc(p0.id)}" data-dirty-label="${isNew ? 'Nouvelle page non enregistrée' : 'Modifications non enregistrées'}" novalidate>
        <input type="hidden" name="slugTouched" value="${esc(v.slugTouched)}">
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-pgc"><h2 class="a-sr" id="h-pgc">Contenu</h2>
            <div class="a-field"><div class="a-label-row"><label class="a-label" for="pg-title">Titre</label>${counter(str(v.title).length, L.title)}</div>
              <input class="a-input" id="pg-title" name="title" maxlength="${L.title}" value="${esc(v.title)}" placeholder="À propos" data-count="${L.title}" autocomplete="off"></div>
            <div class="a-field"><label class="a-label" for="pg-slug">Adresse de la page</label>
              <div class="a-affix"><span class="a-affix__txt">/pages/</span><input class="a-input" id="pg-slug" name="slug" maxlength="${L.slug}" value="${esc(v.slug)}" placeholder="a-propos" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="pg-url"></div>
              <p class="a-hint a-urlline" id="pg-url" aria-live="polite"></p></div>
            <div class="a-field"><div class="a-label-row"><label class="a-label" for="pg-body">Texte</label>${counter(str(v.body).length, L.body)}</div>
              <textarea class="a-input a-input--area a-input--tall" id="pg-body" name="body" maxlength="${L.body}" data-count="${L.body}" aria-describedby="pg-body-h" placeholder="Qui êtes-vous, ce que vous vendez, comment vous travaillez…">${esc(v.body)}</textarea>
              <p class="a-hint" id="pg-body-h">Texte simple, sans mise en forme. Laissez une ligne vide entre deux paragraphes.${kind === 'contact' ? ' Votre boutique ajoute dessous un bouton WhatsApp avec votre numéro.' : ''}${kind === 'shipping' ? ' Votre boutique ajoute dessous vos frais par commune.' : ''}</p></div>
          </section>
          <section class="a-card" aria-labelledby="h-pgv"><div class="a-card__head" style="margin-bottom:4px"><h2 class="a-card__title" id="h-pgv">Où la montrer</h2></div>
            ${switchRow({ id: 'pg-menu', label: 'Dans le menu', hint: 'En haut de la boutique (5 liens au plus sur ordinateur) et dans le menu du téléphone.', checked: v.inMenu, attrs: 'name="inMenu"' })}
            ${switchRow({ id: 'pg-foot', label: 'En bas de page', hint: 'Dans la colonne de liens en bas de chaque page.', checked: v.inFooter, attrs: 'name="inFooter"' })}
          </section>
          ${kind ? H`<section class="a-card" aria-labelledby="h-pgx"><div class="a-card__head"><div><h2 class="a-card__title" id="h-pgx">Texte d’exemple</h2><p class="a-card__sub">Jeere a écrit un premier texte pour votre type de boutique. Vous pouvez le remettre à tout moment.</p></div></div>
            <button class="a-btn a-btn--ghost" type="button" data-act="page-reset" data-id="${esc(p0.id)}">${ico('refresh')}Remettre le texte d’exemple</button>
            ${kind === 'terms' ? H`<p class="a-small" style="margin-top:10px">Ce modèle n’est pas un conseil juridique : faites-le vérifier avant d’ouvrir votre boutique.</p>` : ''}</section>` : ''}
          ${isNew ? '' : H`<section class="a-card" aria-labelledby="h-pgm"><div class="a-card__head"><h2 class="a-card__title" id="h-pgm">Plus d’actions</h2></div>
            <div class="a-danger-zone"><button class="a-btn a-btn--ghost" type="button" data-act="page-view" data-id="${esc(p0.id)}">${ico('eye')}Voir dans la boutique</button>
            <button class="a-btn a-btn--danger" type="button" data-act="page-del" data-id="${esc(p0.id)}">${ico('trash')}Supprimer la page</button></div></section>`}
        </div>
        <div class="a-formfoot"><a class="a-btn a-btn--ghost" href="#pages">Annuler</a><button class="a-btn a-btn--primary" type="submit">${ico('check')}${isNew ? 'Ajouter la page' : 'Enregistrer'}</button></div>
      </form></div>`;
  }
  // The address line under the slug field, and the slug that follows the title until it is edited
  function pageFormLive(form, from) {
    const t = form.elements.title;
    const s = form.elements.slug;
    const touched = form.elements.slugTouched;
    if (from === 'title' && touched && touched.value !== '1') s.value = slugify(t.value).slice(0, PAGE_MAX().slug);
    if (from === 'slug' && touched) touched.value = '1';
    const id = form.getAttribute('data-id');
    const want = slugify(s.value || t.value) || 'page';
    const taken = arr(S.config.pages).find((p) => p.id !== id && p.slug === want);
    let final = want;
    try { final = D.uniqueSlug(S.config, want, id) || want; } catch (e) { final = want; }
    const line = $('#pg-url', form);
    if (line) line.innerHTML = taken
      ? H`Adresse déjà prise par « ${esc(taken.title)} » : la page sera <strong>/pages/${esc(final)}</strong>`
      : H`${esc(subdomain())}/pages/<strong>${esc(want)}</strong>`;
  }
  function savePageForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const L = PAGE_MAX();
    const id = form.getAttribute('data-id');
    const title = clip(v.title, L.title);
    if (!title) { invalid(form.elements.title, 'Donnez un titre à la page : c’est aussi le texte du lien.'); focusFirstError(form); return; }
    const body = str(v.body).replace(/\r\n?/g, '\n').trim().slice(0, L.body);
    let savedId = id;
    const saved = editConfig((cfg) => {
      let slug = slugify(v.slug || title) || 'page';
      try { slug = D.uniqueSlug(cfg, slug, id) || slug; } catch (e) { /* normalizeConfig makes it unique */ }
      const pg = { title, slug, body, inMenu: v.inMenu === true, inFooter: v.inFooter === true };
      if (id) {
        const i = cfg.pages.findIndex((x) => x.id === id);
        if (i < 0) throw new Error('gone');
        cfg.pages[i] = Object.assign({}, cfg.pages[i], pg);
      } else {
        savedId = D.newId(cfg, 'pg');
        cfg.pages.push(Object.assign({ id: savedId }, pg));
      }
    });
    if (!saved) { toast('La page n’a pas été enregistrée.', { tone: 'err' }); return; }
    clearDirty();
    if (!id) { window.location.replace('#pages/' + savedId); toast('Page ajoutée à votre boutique.', { action: 'Voir', onAction: () => openEditor({ page: 'page', pageId: savedId, view: 'preview' }) }); }
    else { refresh(); focusMain(); toast('Page enregistrée.', { action: 'Voir', onAction: () => openEditor({ page: 'page', pageId: savedId, view: 'preview' }) }); }
  }
  function movePage(id, dir, fromSheet) {
    let ok = false;
    editConfig((cfg) => {
      const i = cfg.pages.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cfg.pages.length) throw new Error('edge');
      const t = cfg.pages[i]; cfg.pages[i] = cfg.pages[j]; cfg.pages[j] = t;
      ok = true;
    });
    if (!ok) return;
    const p = findPage(id);
    // Keep the focus on the moved page's same button (or the other one at the edge); from the sheet, its « ⋯ »
    refresh(fromSheet ? '[data-pg="' + id + '"] [data-act="page-more"]' : '[data-pg="' + id + '"] [data-dir="' + dir + '"]:not([disabled])');
    const a = document.activeElement;
    if (!a || !a.closest || !a.closest('[data-pg="' + id + '"]')) { const o = $$('#a-main [data-pg="' + id + '"] [data-act="page-move"]:not([disabled]), #a-main [data-pg="' + id + '"] [data-act="page-more"]').find(visible); if (o) o.focus(); }
    const pos = arr(S.config.pages).findIndex((x) => x.id === id) + 1;
    announce('« ' + (p ? p.title : '') + ' » en position ' + pos + ' sur ' + arr(S.config.pages).length + '.');
  }
  function pageActions(id) {
    const p = findPage(id);
    if (!p) return;
    const pages = arr(S.config.pages);
    const i = pages.findIndex((x) => x.id === id);
    const items = [
      { id: 'edit', icon: 'edit', label: 'Modifier', href: '#pages/' + p.id },
      { id: 'view', icon: 'eye', label: 'Voir dans la boutique', run: () => openEditor({ page: 'page', pageId: p.id, view: 'preview' }) }
    ];
    // On the phone the order buttons live here (the rows keep only the title and « ⋯ »)
    if (i > 0) items.push({ id: 'up', icon: 'up', label: 'Monter', run: () => movePage(p.id, -1, true) });
    if (i >= 0 && i < pages.length - 1) items.push({ id: 'down', icon: 'down', label: 'Descendre', run: () => movePage(p.id, 1, true) });
    items.push({ id: 'del', icon: 'trash', label: 'Supprimer', danger: true, run: () => deletePage(p.id) });
    actionSheet(p.title || 'Page', items);
  }
  async function deletePage(id) {
    const p = findPage(id);
    if (!p) return;
    const ok = await confirmBox({ title: 'Supprimer la page « ' + (p.title || 'Sans titre') + ' » ?', text: 'Elle disparaît du menu et du bas de page de votre boutique. Son texte est perdu.', ok: 'Supprimer la page', danger: true });
    if (!ok) { focusMain(); return; }
    let idx = -1;
    let removed = null;
    if (!editConfig((cfg) => { idx = cfg.pages.findIndex((x) => x.id === id); removed = cfg.pages.splice(idx, 1)[0]; })) return;
    clearDirty();
    if (S.route && S.route.parts[0]) go('#pages'); else refresh();
    toast('Page supprimée.', { action: 'Annuler', onAction: () => {
      if (removed && editConfig((cfg) => { if (!cfg.pages.some((x) => x.id === removed.id)) cfg.pages.splice(Math.max(0, idx), 0, removed); })) { if (S.route && S.route.name === 'pages') refresh(); toast('Page rétablie.'); }
    } });
  }
  async function resetPageBody(id) {
    const p = findPage(id);
    if (!p || !D.defaultPages) return;
    const kind = D.pageKind(p);
    const def = D.defaultPages(S.config.store.niche, { name: S.config.store.name, city: S.config.store.city }).find((x) => D.pageKind(x) === kind);
    if (!def) return;
    const ok = await confirmBox({ title: 'Remettre le texte d’exemple ?', text: 'Le texte actuel de « ' + p.title + ' » sera remplacé par celui de Jeere, adapté à votre boutique.', ok: 'Remettre le texte' });
    if (!ok) { focusMain(); return; }
    const form = $('#a-main form[data-form="page"]');
    if (form) { form.elements.body.value = def.body; updateCount(form.elements.body); setDirty(form); form.elements.body.focus(); toast('Texte d’exemple remis. Enregistrez pour le garder.'); }
  }
  function restoreDefaultPages() {
    if (!D.defaultPages) return;
    if (editConfig((cfg) => { cfg.pages = D.defaultPages(cfg.store.niche, { name: cfg.store.name, city: cfg.store.city }); })) { refresh(); toast('Les 4 pages d’exemple sont de retour.'); }
  }
  function updateCount(input) {
    const max = parseInt(input.getAttribute('data-count'), 10);
    const field = input.closest('.a-field');
    const c = field && $('[data-count-for]', field);
    if (!c || !max) return;
    const n = input.value.length;
    c.textContent = number(n) + NB + '/' + NB + number(max);
    c.className = 'a-count' + (n > max ? ' is-over' : (n > max * 0.9 ? ' is-near' : ''));
  }

  /* ------------------------------------------------------------------ CODES PROMO */

  const promoLabel = (x) => (x.kind === 'fcfa' ? '−' + NB + price(x.value) : '−' + NB + x.value + NB + '%');
  function viewPromos() {
    if (!S.config) return needStore('Codes promo');
    const list = S.admin.promos;
    return H`<div class="a-page a-page--narrow">
      ${pageHead('Codes promo', 'Une réduction pour vos clients fidèles, à partager sur WhatsApp ou dans votre statut.')}
      <div class="a-note a-note--line" style="margin-bottom:12px">${ico('info')}<p><strong>Démo :</strong> les codes restent dans ce navigateur ; le paiement de votre boutique ne les applique pas encore. Dans Jeere, le client tape le code au moment de payer.</p></div>
      <section class="a-card a-card--flush" aria-labelledby="h-promos"><div class="a-card__head"><div><h2 class="a-card__title" id="h-promos">Vos codes</h2><p class="a-card__sub">${list.length ? esc(plural(list.filter((x) => x.active).length, 'code actif', 'codes actifs')) : 'Aucun code pour l’instant.'}</p></div></div>
        ${list.length ? H`<ul class="a-rows" style="margin-top:8px">${list.map((x, i) => H`<li class="a-promo"><span class="a-promo__code">${esc(x.code)}</span>
          <span class="a-promo__main"><span class="a-promo__val">${esc(promoLabel(x))}</span><span class="a-row__meta">${x.active ? 'Actif' : 'En pause'}</span></span>
          <span class="a-switch"><input type="checkbox" role="switch" data-promo="${i}"${x.active ? ' checked' : ''} aria-label="${esc(fr('Code ' + x.code + ' actif'))}"><span class="a-switch__track"></span></span>
          <button class="a-ibtn" type="button" data-act="promo-share" data-i="${i}" aria-label="${esc('Partager le code ' + x.code + ' sur WhatsApp')}">${ico('chat')}</button>
          <button class="a-ibtn" type="button" data-act="promo-del" data-i="${i}" aria-label="${esc('Supprimer le code ' + x.code)}">${ico('trash')}</button></li>`)}</ul>` : H`<div class="a-empty"><span class="a-empty__ico">${ico('percent')}</span><p class="a-empty__title">Pas encore de code</p><p class="a-empty__text">Par exemple BIENVENUE10 : 10 % pour une première commande.</p></div>`}
      </section>
      <section class="a-card" aria-labelledby="h-newpromo" style="margin-top:12px"><div class="a-card__head"><h2 class="a-card__title" id="h-newpromo">Créer un code</h2></div>
        <form class="a-form" data-form="promo" data-light novalidate>
          <div class="a-grid2"><div class="a-field"><label class="a-label" for="pr-code">Code</label><input class="a-input a-input--code" id="pr-code" name="code" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="BIENVENUE10"><p class="a-hint">Lettres, chiffres et tirets, sans espace.</p></div>
            <div class="a-field"><label class="a-label" for="pr-val">Réduction</label><div class="a-promo__inputs"><input class="a-input a-input--num" id="pr-val" name="value" inputmode="numeric" autocomplete="off" placeholder="10"><div class="a-selectwrap"><select class="a-input" id="pr-kind" name="kind" aria-label="Type de réduction"><option value="pct">%</option><option value="fcfa">FCFA</option></select>${ico('down')}</div></div></div></div>
          <div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">${ico('plus')}Créer le code</button></div>
        </form></section>
    </div>`;
  }
  function savePromoForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const code = str(v.code).toUpperCase().replace(/\s+/g, '');
    const kind = v.kind === 'fcfa' ? 'fcfa' : 'pct';
    const val = parseAmount(v.value);
    let ok = true;
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) ok = invalid(form.elements.code, 'De 3 à 20 lettres, chiffres ou tirets, par exemple BIENVENUE10.');
    else if (S.admin.promos.some((x) => x.code === code)) ok = invalid(form.elements.code, 'Ce code existe déjà.');
    if (val === null || (kind === 'pct' ? val < 1 || val > 90 : val < 100 || val > 1000000)) ok = invalid(form.elements.value, kind === 'pct' ? 'Entre 1 et 90 %.' : 'Entre 100 et 1 000 000 FCFA.') && ok;
    if (S.admin.promos.length >= 50) { toast('50 codes au plus.'); ok = false; }
    if (!ok) { focusFirstError(form); return; }
    S.admin.promos.unshift({ code, kind, value: val, active: true, uses: 0 });
    saveAdmin();
    refresh('#pr-code');
    toast('Code ' + code + ' créé (démo).');
  }
  function sharePromo(i) {
    const x = S.admin.promos[i];
    if (!x) return;
    openWa('https://wa.me/?text=' + encodeURIComponent(fr('Code promo ' + x.code + ' : ' + promoLabel(x) + ' chez ' + storeName() + ', sur ' + storeUrl())));
  }
  async function deletePromo(i) {
    const x = S.admin.promos[i];
    if (!x) return;
    const ok = await confirmBox({ title: 'Supprimer le code ' + x.code + ' ?', text: 'Vos clients ne pourront plus l’utiliser.', ok: 'Supprimer', danger: true });
    if (!ok) { focusMain(); return; }
    S.admin.promos.splice(i, 1);
    saveAdmin();
    refresh('#pr-code');
    toast('Code ' + x.code + ' supprimé.', { action: 'Annuler', onAction: () => { S.admin.promos.splice(i, 0, x); saveAdmin(); refresh(); } });
  }

  /* ------------------------------------------------------------------ PAIEMENTS */

  const PAY_HINTS = {
    wave: 'Mobile money, par le partenaire de paiement agréé.',
    orange: 'Mobile money, par le partenaire de paiement agréé.',
    mtn: 'Mobile money, par le partenaire de paiement agréé.',
    moov: 'Mobile money, par le partenaire de paiement agréé.',
    cod: 'Le livreur encaisse à la réception, en espèces ou par mobile money.',
    card: 'Visa, Mastercard et Djamo, aussi pour vos clients au Canada, aux États-Unis ou en Europe.'
  };
  const PAY_CONN = { wave: 'mobile-money', orange: 'mobile-money', mtn: 'mobile-money', moov: 'mobile-money', card: 'card' };
  function connValueLine(id) {
    const c = conn(id);
    const v = c.values || {};
    const opt = (key, val) => { const f = arr(connector(id) && connector(id).fields).find((x) => x.key === key); const o = f && arr(f.options).find((x) => x.value === val); return o ? o.label : val; };
    switch (id) {
      case 'mobile-money': return [phoneFmt(v.payoutPhone), opt('payoutOperator', v.payoutOperator)].filter(Boolean).join(' · ');
      case 'card': return [opt('payoutOperator', v.payoutOperator), phoneFmt(v.payoutPhone), v.statementName].filter(Boolean).join(' · ');
      case 'whatsapp': return phoneFmt(v.number);
      case 'sms': return v.sender ? 'Expéditeur : ' + v.sender : '';
      case 'yango': case 'gozem': return [phoneFmt(v.phone), v.pickup].filter(Boolean).join(' · ');
      case 'livreurs': return couriers().map((m) => m.name).join(', ');
      case 'domain': return v.domain || '';
      default: { const f = arr(connector(id) && connector(id).fields).find((x) => x.type === 'text' || x.type === 'tel'); return f ? str(v[f.key]) : ''; }
    }
  }
  function connPill(c) {
    if (c.soon) return H`<span class="a-pill a-pill--soon">Bientôt</span>`;
    if (c.id === 'livreurs') { const n = couriers().length; return n ? H`<span class="a-pill a-pill--on a-tone--ok">${ico('check')}${esc(plural(n, 'livreur', 'livreurs'))}</span>` : H`<span class="a-pill a-pill--off">Aucun livreur</span>`; }
    return isOn(c.id) ? H`<span class="a-pill a-pill--on a-tone--ok">${ico('check')}Connecté</span>` : H`<span class="a-pill a-pill--off">Non connecté</span>`;
  }
  function connRow(id, quiet) {
    const c = connector(id);
    if (!c) return '';
    const on = isOn(id) || !!quiet;
    const line = on ? connValueLine(id) : c.description;
    return H`<div class="a-connrow"><span class="a-conn__ico">${ico(CONN_ICONS[c.icon] || 'plug')}</span>
      <span class="a-connrow__main"><span class="a-connrow__name">${esc(c.name)} ${connPill(c)}</span><span class="a-connrow__meta">${esc(fr(isOn(id) ? line : c.description))}</span></span>
      ${c.soon ? '' : H`<button class="a-btn ${on || STARTERS.indexOf(id) < 0 ? 'a-btn--ghost' : 'a-btn--primary'} a-btn--sm" type="button" data-act="connector-open" data-id="${esc(id)}"${id === 'livreurs' ? '' : H` aria-label="${esc((isOn(id) ? 'Gérer ' : 'Connecter ') + c.name)}"`}>${esc(connVerb(c, isOn(id)))}</button>`}</div>`;
  }
  // Online sales paid out by the partner, after the fees (example orders: an illustration)
  function payoutsCard() {
    const p = plan();
    const fee = p.fee || 0;
    const on = isOn('mobile-money');
    const to = (conn('mobile-money').values || {}).payoutPhone || S.admin.settings.payoutPhone;
    const paid = S.admin.orders.filter((o) => !isCod(o) && (o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered'))
      .sort((a, b) => str(b.date).localeCompare(str(a.date)));
    const rows = paid.slice(0, 6).map((o) => {
      const j = Math.round((o.total || 0) * fee / 100);
      const pt = Math.round((o.total || 0) * 0.0195);
      const d = toDate(o.date);
      return H`<li class="a-payout"><span class="a-payout__main"><span class="a-payout__t">${d ? esc(dateShort(d)) : ''} · ${esc(payLabel(o.payment))} · <a class="a-link" href="#commandes/${esc(o.id.replace('#', ''))}">${esc(o.id)}</a></span>
        <span class="a-payout__fees">${esc(fr('Jeere ' + price(j) + ' · partenaire ' + price(pt)))}</span></span>
        <span class="a-payout__amt"><span class="a-payout__from">${esc(price(o.total))}</span><strong>${esc(price(o.total - j - pt))}</strong></span></li>`;
    });
    const sum = paid.reduce((t, o) => t + (o.total || 0) - Math.round((o.total || 0) * fee / 100) - Math.round((o.total || 0) * 0.0195), 0);
    return H`<section class="a-card a-card--flush" aria-labelledby="h-payouts"><div class="a-card__head"><div><h2 class="a-card__title" id="h-payouts">Versements ${hasDemoOrders() ? sampleChip() : ''}</h2>
        <p class="a-card__sub">${on && to ? esc(fr('Versés sur le ' + phoneFmt(to) + ', après les frais.')) : 'Connectez le paiement mobile money : ces montants seraient versés sur votre numéro.'}</p></div></div>
      ${rows.length ? H`<ul class="a-rows a-payouts">${rows}</ul><div class="a-card__foot a-payouts__foot"><span>${esc(plural(paid.length, 'vente en ligne', 'ventes en ligne'))}</span><strong>${esc(fr((on ? 'Versé : ' : 'À verser : ') + price(sum)))}</strong></div>`
        : H`<p class="a-small" style="padding:0 16px 16px">Aucune vente payée en ligne pour l’instant.</p>`}
    </section>`;
  }
  // Cash-on-delivery orders on the road: the courier brings the money back
  function courierCashCard() {
    const out = S.admin.orders.filter((o) => isCod(o) && o.status === 'shipped').sort((a, b) => str(b.date).localeCompare(str(a.date)));
    const total = out.reduce((t, o) => t + dueAtDoor(o), 0);
    return H`<section class="a-card a-card--flush" aria-labelledby="h-cash"><div class="a-card__head"><div><h2 class="a-card__title" id="h-cash">Argent chez les livreurs</h2>
        <p class="a-big a-big--sm" style="margin-top:4px">${money(total)}</p>
        <p class="a-card__sub">Les commandes en route, payées à la livraison : le livreur vous remet l’argent à son retour.</p></div></div>
      ${out.length ? H`<ul class="a-rows" style="margin-top:8px">${out.map((o) => H`<li class="a-cashrow"><a class="a-cashrow__main" href="#commandes/${esc(o.id.replace('#', ''))}"><span class="a-row__title"><span>${esc(o.id)} · ${esc(str(o.customer.name))}</span></span>
          <span class="a-row__meta">${esc(str(o.customer.commune))}${o.courier ? ' · avec ' + esc(courierName(o.courier)) : ''} · ${esc(price(dueAtDoor(o)))}</span></a>
          <button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="order-cash" data-id="${esc(o.id)}" aria-label="${esc(fr('Reçu du livreur : ' + price(dueAtDoor(o)) + ' pour la commande ' + o.id))}">${ico('check')}Reçu du livreur</button></li>`)}</ul>`
        : H`<p class="a-small" style="padding:0 16px 16px">Aucun argent en route pour l’instant.</p>`}
    </section>`;
  }
  function viewPaiements() {
    if (!S.config) return needStore('Paiements');
    const pay = S.config.payments;
    const p = plan();
    const any = Object.keys(pay).some((k) => pay[k] === true);
    const ex = 10000;
    const jeere = Math.round(ex * (p.fee || 0) / 100);
    const partner = Math.round(ex * 0.0195);
    const mm = ['wave', 'orange', 'mtn', 'moov'].filter((k) => pay[k] === true);
    const blocked = mm.length && !isOn('mobile-money');
    return H`<div class="a-page">
      ${pageHead('Paiements', 'Comment vos clients vous paient, et ce que vous recevez.')}
      <div class="a-cols">
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-partners"><div class="a-card__head" style="margin-bottom:0"><div><h2 class="a-card__title" id="h-partners">Encaissement</h2><p class="a-card__sub">Le partenaire de paiement agréé par la BCEAO verse l’argent sur votre numéro.</p></div></div>
            ${blocked ? H`<div class="a-note a-note--strong" style="margin-top:12px">${ico('alert')}<div><p>${esc(fr('Vos clients voient ' + listFr(mm.map(payLabel)) + ', mais vous ne pouvez pas encore encaisser.'))}</p>
              <div class="a-btnrow" style="margin-top:10px"><button class="a-btn a-btn--primary" type="button" data-act="connector-open" data-id="mobile-money">${ico('phone')}Connecter le paiement mobile money</button></div></div></div>` : ''}
            ${connRow('mobile-money', blocked)}${connRow('card')}${stripeLine()}
            <p class="a-small" style="margin-top:6px">Démo : aucune connexion réelle n’est faite.</p>
          </section>
          <section class="a-card" aria-labelledby="h-methods"><div class="a-card__head" style="margin-bottom:4px"><div><h2 class="a-card__title" id="h-methods">Moyens de paiement</h2><p class="a-card__sub">Ceux que vos clients voient au moment de payer, dans cet ordre.</p></div></div>
            ${!any ? H`<div class="a-note a-note--strong" style="margin:8px 0">${ico('alert')}<p>Aucun moyen de paiement : vos clients ne peuvent commander que sur WhatsApp.</p></div>` : ''}
            ${PAYMENTS().map((m) => {
              const need = PAY_CONN[m.key];
              const warn = pay[m.key] && need && !isOn(need);
              return H`<div class="a-payrow">${switchRow({ id: 'pay-' + m.key, label: esc(m.label), hint: esc(fr(PAY_HINTS[m.key] || '')), checked: pay[m.key] === true, attrs: 'data-pay="' + esc(m.key) + '"' })}
                ${warn ? H`<button class="a-chip a-chip--line a-chip--btn a-payrow__warn" type="button" data-act="connector-open" data-id="${esc(need)}" aria-label="${esc(fr(m.label + ' : à connecter'))}">${ico('alert')}À connecter${ico('chev')}</button>` : ''}</div>`;
            })}
          </section>
          ${courierCashCard()}
        </div>
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-fees"><div class="a-card__head"><div><h2 class="a-card__title" id="h-fees">Frais</h2><p class="a-card__sub">Formule ${esc(p.name)} : ${esc(fr(p.feeLabel))}.</p></div><a class="a-more-link" href="#parametres/abonnement">Formule${ico('chev')}</a></div>
            <p class="a-small" style="margin-bottom:10px">Exemple pour une vente de ${esc(price(ex))} payée en mobile money :</p>
            <div class="a-fee">
              <div class="a-fee__row"><span>Votre vente</span><span>${esc(price(ex))}</span></div>
              <div class="a-fee__row"><span>Jeere (${esc(fr(p.fee + ' %'))})</span><span>${esc(jeere ? '−' + NB + price(jeere) : price(0))}</span></div>
              <div class="a-fee__row"><span>Partenaire de paiement (environ 1,95 %)</span><span>−${NB}${esc(price(partner))}</span></div>
              <div class="a-fee__row is-total"><span>Vous recevez environ</span><span>${esc(price(ex - jeere - partner))}</span></div>
            </div>
            <ul class="a-checks a-checks--sm" style="margin-top:14px">
              <li>${ico('check')}<span><strong>Mobile money et carte :</strong> les frais de Jeere et du partenaire sont retenus par le partenaire au moment du versement. Vous recevez le reste, sans rien avancer.</span></li>
              <li>${ico('check')}<span><strong>Paiement à la livraison :</strong> Jeere ne prend rien. Le livreur encaisse et vous remet l’argent.</span></li>
            </ul>
            <p class="a-small" style="margin-top:10px">Les frais du partenaire s’ajoutent : par exemple 1,95 % pour le mobile money. Tarifs prévus pour le lancement.</p>
          </section>
          ${payoutsCard()}
          <section class="a-card a-card--ink" aria-labelledby="h-trust"><h2 class="a-card__title" id="h-trust">${ico('shield')}Jeere ne garde jamais votre argent</h2>
            <p style="margin-top:8px;font-size:14px;line-height:1.55;color:rgba(255,255,255,.82)">Chaque paiement passe par un partenaire agréé par la BCEAO et arrive directement sur votre numéro. Vos clients valident avec leur code secret, qu’ils ne donnent jamais, ni à vous ni au livreur.</p></section>
        </div>
      </div></div>`;
  }
  // « Wave, Orange Money et MTN MoMo »
  function listFr(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]; }
  function togglePayment(input) {
    const k = input.getAttribute('data-pay');
    const on = input.checked;
    if (!editConfig((cfg) => { cfg.payments[k] = on; })) { input.checked = !on; return; }
    refresh('#pay-' + k);
    toast(payLabel(k) + (on ? ' activé.' : ' désactivé.'));
  }

  /* ------------------------------------------------------------------ LIVRAISON */

  function zoneRow(z, i) {
    const name = str(z.name);
    return H`<li class="a-zone">
      <div class="a-field"><label class="a-label" for="z-n-${i}">Commune ou zone</label><input class="a-input" id="z-n-${i}" name="zname" maxlength="40" list="a-communes" value="${esc(name)}" placeholder="Cocody" autocomplete="off"></div>
      <div class="a-field"><label class="a-label" for="z-f-${i}">Frais<span class="a-zone__unit"> (FCFA)</span></label><div class="a-affix"><input class="a-input a-input--num" id="z-f-${i}" name="zfee" inputmode="numeric" value="${esc(z.fee === '' || z.fee == null ? '' : (typeof z.fee === 'number' ? number(z.fee) : str(z.fee)))}" placeholder="1 500" autocomplete="off"><span class="a-affix__txt">FCFA</span></div></div>
      <button class="a-ibtn a-zone__del" type="button" data-act="zone-del" aria-label="${esc('Retirer ' + (name || 'cette zone'))}">${ico('trash')}</button></li>`;
  }
  function viewLivraison() {
    if (!S.config) return needStore('Livraison');
    const sec = deliverySection(S.config);
    const dr = takeDraft('zones');
    const st = sec && isObj(sec.settings) ? sec.settings : {};
    let zones = arr(st.zones).map((z) => ({ name: z.name, fee: z.fee }));
    if (dr) { const n = [].concat(pick(dr, 'zname', [])); const f = [].concat(pick(dr, 'zfee', [])); zones = n.map((x, i) => ({ name: x, fee: f[i] })); }
    const text = pick(dr, 'text', str(st.text || ''));
    const shown = pick(dr, 'shown', sec ? sec.enabled !== false : true);
    const fees = ownZones().map((z) => z.fee);
    const min = fees.length ? Math.min.apply(null, fees) : null;
    const communes = arr(D.communes);
    return H`<div class="a-page">
      ${pageHead('Livraison', min !== null ? esc(fr('Livraison dès ' + price(min) + ' · ' + plural(fees.length, 'zone', 'zones'))) : 'Indiquez où vous livrez et à quel prix.')}
      <div class="a-cols">
        <form class="a-form a-stack" data-form="zones" novalidate>
          <section class="a-card" aria-labelledby="h-zones"><div class="a-card__head"><div><h2 class="a-card__title" id="h-zones">Zones et frais</h2><p class="a-card__sub">Vos clients choisissent leur commune au moment de payer : les frais s’ajoutent au total.</p></div></div>
            ${sec ? '' : H`<div class="a-note" style="margin-bottom:12px">${ico('info')}<p>Votre boutique utilise pour l’instant les communes d’Abidjan par défaut. Enregistrez vos zones pour choisir vos prix.</p></div>`}
            <ul class="a-zones" id="a-zones">${(zones.length ? zones : (sec ? [] : communes.slice(0, 6))).map(zoneRow)}</ul>
            <datalist id="a-communes">${communes.map((c) => H`<option value="${esc(c.name)}">`)}</datalist>
            <div class="a-btnrow" style="margin-top:12px"><button class="a-btn a-btn--ghost" type="button" data-act="zone-add">${ico('plus')}Ajouter une zone</button>
              <button class="a-btn a-btn--quiet" type="button" data-act="zones-fill">Ajouter les communes d’Abidjan</button></div>
          </section>
          <section class="a-card" aria-labelledby="h-delay"><div class="a-card__head" style="margin-bottom:8px"><div><h2 class="a-card__title" id="h-delay">Délais et conditions</h2><p class="a-card__sub">Affichés sous vos frais de livraison, dans votre boutique.</p></div></div>
            <div class="a-field"><div class="a-label-row"><label class="a-label" for="z-text">Texte</label>${counter(str(text).length, 240)}</div><textarea class="a-input a-input--area" id="z-text" name="text" maxlength="240" data-count="240" placeholder="Nous livrons du lundi au samedi. Commandez avant 14 h pour être livré le jour même.">${esc(text)}</textarea></div>
            <div style="margin-top:8px">${switchRow({ id: 'z-shown', label: 'Montrer les frais sur la page d’accueil', hint: 'Masqués, ils restent utilisés au moment de payer.', checked: shown, attrs: 'name="shown"' })}</div>
          </section>
          <div class="a-formfoot" style="margin-top:0"><button class="a-btn a-btn--primary" type="submit">${ico('check')}Enregistrer la livraison</button></div>
        </form>
        <div class="a-stack">
          <section class="a-card" aria-labelledby="h-couriers"><div class="a-card__head" style="margin-bottom:0"><div><h2 class="a-card__title" id="h-couriers">Livreurs</h2><p class="a-card__sub">Vos propres livreurs, ou un coursier commandé depuis la commande.</p></div></div>
            ${connRow('livreurs')}${connRow('yango')}${connRow('gozem')}
            <p class="a-small" style="margin-top:6px">Démo : aucune connexion réelle n’est faite.</p></section>
          <div class="a-note">${ico('truck')}<p>Conseil : faites vérifier le colis devant le livreur, et donnez au client un repère précis (« près de la pharmacie ») pour livrer du premier coup.</p></div>
        </div>
      </div></div>`;
  }
  function addZone(name, fee) {
    const list = $('#a-zones');
    if (!list) return null;
    const i = Date.now().toString(36) + list.children.length;
    list.insertAdjacentHTML('beforeend', zoneRow({ name: name || '', fee: fee == null ? '' : fee }, i));
    return list.lastElementChild;
  }
  function saveZonesForm(form) {
    clearErrors(form);
    const rows = $$('.a-zone', form);
    const zones = [];
    const seen = {};
    let ok = true;
    rows.forEach((row) => {
      const ni = $('[name="zname"]', row);
      const fi = $('[name="zfee"]', row);
      const name = clip(ni.value, 40);
      const rawFee = str(fi.value).trim();
      if (!name && !rawFee) return;
      if (!name) { ok = invalid(ni, 'Indiquez la commune ou la zone.') && ok; return; }
      const fee = parseAmount(rawFee);
      if (fee === null || fee > 100000) { ok = invalid(fi, rawFee ? 'Des chiffres seulement, 100 000 FCFA au plus.' : 'Indiquez les frais, 0 si la livraison est offerte.') && ok; return; }
      const key = fold(name);
      if (seen[key]) { ok = invalid(ni, '« ' + name + ' » apparaît deux fois.') && ok; return; }
      seen[key] = true;
      zones.push({ name, fee });
    });
    if (zones.length > 30) { toast('30 zones au plus.'); ok = false; }
    if (!ok) { focusFirstError(form); return; }
    const v = serialize(form);
    const saved = editConfig((cfg) => {
      let sec = deliverySection(cfg);
      if (!sec) {
        const settings = D.sectionSettings ? D.sectionSettings('delivery', cfg.store.niche, cfg.store.name) : { title: 'Nos frais de livraison', text: '', zones: [] };
        sec = { id: D.newId(cfg, 's'), type: 'delivery', enabled: true, settings };
        const wa = cfg.sections.findIndex((s) => s.type === 'whatsapp');
        if (wa >= 0) cfg.sections.splice(wa, 0, sec); else cfg.sections.push(sec);
      }
      sec.settings = Object.assign({}, sec.settings, { zones, text: str(v.text).trim().slice(0, 240) });
      sec.enabled = v.shown === true;
    });
    if (!saved) return;
    clearDirty();
    refresh();
    focusMain();
    toast(zones.length ? 'Livraison enregistrée : ' + plural(zones.length, 'zone', 'zones') + '.' : 'Livraison enregistrée. Sans zone, la boutique propose les communes d’Abidjan par défaut.');
  }

  /* ------------------------------------------------------------------ CONNECTEURS */

  const CONN_ICONS = { phone: 'phone', card: 'card', chat: 'chat', message: 'message', camera: 'camera', video: 'video', people: 'people', scooter: 'scooter', bike: 'bike', chart: 'chart', target: 'target', globe: 'globe', sparkle: 'sparkle' };
  // The three that matter first: get paid, get the orders, deliver
  const STARTERS = ['mobile-money', 'whatsapp', 'livreurs'];
  const connVerb = (c, on) => (c.id === 'livreurs' ? (on ? 'Gérer mes livreurs' : 'Ajouter mes livreurs') : (on ? 'Gérer' : 'Connecter'));
  function connCard(c, big) {
    const on = isOn(c.id);
    const val = on ? connValueLine(c.id) : '';
    const asked = S.admin.notify[c.id] === true;
    let foot;
    if (c.soon) foot = H`<button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="connector-notify" data-id="${esc(c.id)}"${asked ? ' disabled' : ''}>${ico('bell')}${asked ? 'Demande notée' : 'Me prévenir'}</button>`;
    else if (c.id === 'livreurs') foot = H`<button class="a-btn ${big && !on ? 'a-btn--primary' : 'a-btn--ghost'} a-btn--sm" type="button" data-act="connector-open" data-id="livreurs">${esc(connVerb(c, on))}</button>`;
    else if (on) foot = H`<button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="connector-open" data-id="${esc(c.id)}" aria-label="${esc('Gérer ' + c.name)}">Gérer</button><button class="a-btn a-btn--quiet a-btn--sm a-conn__off" type="button" data-act="connector-off" data-id="${esc(c.id)}" aria-label="${esc('Déconnecter ' + c.name)}">Déconnecter</button>`;
    else foot = H`<button class="a-btn ${big ? 'a-btn--primary' : 'a-btn--ghost'} a-btn--sm" type="button" data-act="connector-open" data-id="${esc(c.id)}" aria-label="${esc('Connecter ' + c.name)}">Connecter</button>`;
    return H`<li><article class="a-conn${on ? ' is-on' : ''}${big ? ' a-conn--big' : ' a-conn--lite'}" aria-labelledby="cn-${esc(c.id)}">
      <div class="a-conn__head"><span class="a-conn__ico">${ico(CONN_ICONS[c.icon] || 'plug')}</span><span class="a-conn__titles"><h3 class="a-conn__name" id="cn-${esc(c.id)}">${esc(c.name)}</h3>${val ? H`<span class="a-conn__val">${esc(fr(val))}</span>` : ''}</span>${connPill(c)}</div>
      <p class="a-conn__desc">${esc(fr(c.description))}</p>
      <div class="a-conn__foot">${foot}</div>
    </article></li>`;
  }
  function viewConnecteurs() {
    const cats = arr(D.CONNECTOR_CATEGORIES);
    const all = CONNECTORS();
    const real = all.filter((c) => !c.soon);
    const on = real.filter((c) => isOn(c.id)).length;
    const starters = STARTERS.map(connector).filter(Boolean);
    const startLeft = starters.filter((c) => !isOn(c.id)).length;
    const groups = cats.map((cat) => ({ cat, list: all.filter((c) => c.category === cat.id && STARTERS.indexOf(c.id) < 0) })).filter((g) => g.list.length);
    return H`<div class="a-page">
      ${pageHead('Connecteurs', 'Les services qui travaillent avec votre boutique : paiements, messagerie, réseaux sociaux, livraison…')}
      <div class="a-card a-card--soft" style="margin-bottom:14px"><p class="a-summary">${startLeft
        ? H`<span class="a-big a-big--sm">Commencez par ces 3</span><span class="a-text">${esc(fr('Encaisser, recevoir les commandes, livrer : le reste peut attendre. ' + (3 - startLeft) + ' sur 3 fait' + (3 - startLeft > 1 ? 's' : '') + '.'))}</span>`
        : H`<span class="a-big">${on}<small class="a-muted" style="font-size:15px"> sur ${real.length}</small></span><span class="a-text">connectés</span>`}</p>
        ${remoteStoreId() ? H`<div class="a-note a-note--line" style="margin-top:12px">${ico('info')}<p><strong>Mobile money, WhatsApp, carte bancaire et nom de domaine</strong> marchent pour de vrai sur votre boutique en ligne. Les connecteurs marqués « Bientôt » arrivent : touchez « Me prévenir ».</p></div>` : H`<div class="a-note a-note--line" style="margin-top:12px">${ico('info')}<p><strong>Votre boutique n’est pas encore publiée :</strong> vos réglages restent dans ce navigateur. Publiez-la pour que vos connecteurs marchent pour vos clients.</p></div>`}</div>
      <nav class="a-catnav" aria-label="Catégories de connecteurs"><button class="a-filter" type="button" data-act="conn-jump" data-cat="demarrer">Pour bien démarrer</button>${groups.map((g) => H`<button class="a-filter" type="button" data-act="conn-jump" data-cat="${esc(g.cat.id)}">${esc(g.cat.label)}</button>`)}</nav>
      <div class="a-conncats">
        <section aria-labelledby="cc-demarrer"><div class="a-conncat__head"><h2 class="a-conncat__title" id="cc-demarrer" tabindex="-1">Pour bien démarrer</h2><p class="a-conncat__hint">Le paiement mobile money, WhatsApp et vos livreurs.</p></div>
          <ul class="a-conngrid a-conngrid--big">${starters.map((c) => connCard(c, true))}</ul></section>
        ${groups.map((g) => H`<section aria-labelledby="cc-${esc(g.cat.id)}"><div class="a-conncat__head"><h2 class="a-conncat__title" id="cc-${esc(g.cat.id)}" tabindex="-1">${esc(g.cat.label)}</h2>${g.cat.hint ? H`<p class="a-conncat__hint">${esc(fr(g.cat.hint))}</p>` : ''}</div>
          <ul class="a-conngrid a-conngrid--lite">${g.list.map((c) => connCard(c, false))}</ul></section>`)}
      </div></div>`;
  }
  function jumpTo(cat) {
    const h = $('#cc-' + cat);
    if (!h) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { h.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { h.scrollIntoView(); }
    try { h.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // Prefill a connector field from what the dashboard already knows
  function connDefault(c, f) {
    const st = S.config ? S.config.store : {};
    const set = S.admin.settings;
    const acc = S.account || {};
    const ascii = (s) => fold(s).replace(/[^a-z0-9 ]/g, '').toUpperCase();
    if (c.id === 'mobile-money' && f.key === 'payoutPhone') return set.payoutPhone || st.whatsapp || acc.phone || '';
    if (c.id === 'mobile-money' && f.key === 'payoutOperator') return set.payoutMethod || f.default || '';
    if (c.id === 'card' && f.key === 'payoutPhone') return set.payoutPhone || st.whatsapp || acc.phone || '';
    if (c.id === 'card' && f.key === 'statementName') return ascii(st.name || '').slice(0, 22);
    if (c.id === 'whatsapp' && f.key === 'number') return st.whatsapp || acc.phone || '';
    if (c.id === 'sms' && f.key === 'sender') return ascii(st.name || '').replace(/ /g, '').slice(0, 11);
    if (c.id === 'domain' && f.key === 'domain') return set.customDomain || '';
    return f.default !== undefined ? String(f.default) : '';
  }
  function connField(c, f, val) {
    const id = 'cf-' + c.id + '-' + f.key;
    if (f.type === 'toggle') return switchRow({ id, label: esc(f.label), checked: val === 'true' || val === true, attrs: 'name="' + esc(f.key) + '"' });
    if (f.type === 'select') {
      return H`<div class="a-field"><label class="a-label" for="${id}">${esc(f.label)}</label><div class="a-selectwrap"><select class="a-input" id="${id}" name="${esc(f.key)}">${arr(f.options).map((o) => H`<option value="${esc(o.value)}"${String(o.value) === String(val) ? ' selected' : ''}>${esc(o.label)}</option>`)}</select>${ico('down')}</div></div>`;
    }
    const tel = f.type === 'tel';
    return H`<div class="a-field"><label class="a-label" for="${id}">${esc(f.label)}</label><input class="a-input" id="${id}" name="${esc(f.key)}" type="${tel ? 'tel' : (f.type === 'email' ? 'email' : (f.type === 'url' ? 'url' : 'text'))}"${tel ? ' inputmode="tel" autocomplete="tel"' : ' autocomplete="off"'} value="${esc(tel ? phoneFmt(val) : val)}" placeholder="${esc(f.placeholder || '')}"${f.key === 'sender' ? ' maxlength="11"' : ' maxlength="200"'}${f.key === 'domain' || f.type === 'url' ? ' autocapitalize="off" spellcheck="false"' : ''}>${f.help ? H`<p class="a-small" style="margin-top:6px">${esc(fr(f.help))}</p>` : ''}</div>`;
  }
  /* ---------- card payments: the store's own Stripe account (the `payments` function) ---------- */
  // A real store (published, on Supabase) with a signed-in seller: « Carte bancaire » opens Stripe's onboarding.
  // Elsewhere (demo, a store of this browser only) the connector stays the prototype's form.
  const PAY_FN = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/payments';
  const STRIPE_COUNTRIES = [['CA', 'Canada'], ['US', 'États-Unis'], ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['GB', 'Royaume-Uni'], ['DE', 'Allemagne'], ['ES', 'Espagne'], ['IT', 'Italie'], ['NL', 'Pays-Bas'], ['PT', 'Portugal'], ['IE', 'Irlande'], ['LU', 'Luxembourg']];
  function remoteStoreId() { try { const r = window.JeerePublish && window.JeerePublish.local(); return r && r.storeId ? r.storeId : ''; } catch (e) { return ''; } }
  async function payCall(body) {
    const A = window.JeereAuth;
    const s = A && typeof A.session === 'function' ? await Promise.resolve(A.session()).catch(() => null) : null;
    if (!s || !s.access_token) return { ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere pour connecter Stripe.' };
    const r = await fetch(PAY_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) }).catch(() => null);
    return r ? r.json().catch(() => ({ ok: false })) : { ok: false, message: 'Pas de connexion internet.' };
  }
  function stripeLine() {
    const sid = remoteStoreId();
    if (!sid) return '';
    const st = S.stripe && S.stripe.storeId === sid ? S.stripe : null;
    if (!st) {
      S.stripe = { storeId: sid, loading: true };
      payCall({ action: 'status', storeId: sid }).then((j) => { S.stripe = Object.assign({ storeId: sid }, j); if (S.route && S.route.name === 'paiements') refresh(); });
      return '';
    }
    if (st.loading || !st.ok) return '';
    let txt, tone;
    if (!st.configured) { txt = 'Le paiement par carte sera bientôt activé sur Jeere.'; tone = 'muted'; }
    else if (st.chargesEnabled) { txt = 'Stripe est connecté : vos clients paient par carte, depuis n’importe quel pays. L’argent arrive sur votre compte Stripe.'; tone = 'ok'; }
    else if (st.connected) { txt = 'Stripe est connecté, mais votre inscription n’est pas terminée : Stripe demande encore des informations.'; tone = 'warn'; }
    else return '';
    return H`<div class="a-note${tone === 'warn' ? ' a-note--strong' : ''}" style="margin:6px 0 10px">${ico(tone === 'ok' ? 'check' : 'info')}<div><p>${esc(fr(txt))}</p>
      ${st.connected ? H`<div class="a-btnrow" style="margin-top:8px">${st.chargesEnabled ? '' : H`<button class="a-btn a-btn--primary a-btn--sm" type="button" data-act="stripe-connect">Terminer l’activation</button>`}<button class="a-btn a-btn--ghost a-btn--sm" type="button" data-act="stripe-dashboard">${ico('card')}Gérer mes paiements</button></div>` : ''}</div></div>`;
  }
  function openStripe() {
    const st = S.stripe || {};
    if (st.connected) { stripeConnect(); return; }
    openDialog(H`<form class="a-dialog__card" data-dform="stripe" novalidate>${dlgHead('sp-t', 'Accepter les cartes avec Stripe')}
      <div class="a-dialog__body"><p class="a-dialog__lead">${esc(fr('Vos clients paient par carte (Visa, Mastercard…) depuis n’importe quel pays : France, Canada, États-Unis… Stripe verse l’argent sur votre compte bancaire. Jeere ne touche jamais votre argent.'))}</p>
        <div class="a-field"><label class="a-label" for="sp-country">Pays où votre activité est enregistrée</label><div class="a-selectwrap"><select class="a-input" id="sp-country" name="country">${STRIPE_COUNTRIES.map(([v, l]) => H`<option value="${v}">${esc(l)}</option>`)}</select>${ico('down')}</div>
          <p class="a-hint">${esc(fr('Stripe vous demande ensuite votre identité et le compte bancaire qui reçoit l’argent. Pour une activité en Côte d’Ivoire, le paiement par carte passera par un partenaire local (bientôt).'))}</p></div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="button" data-act="stripe-connect">Continuer</button></div></form>`, { labelledby: 'sp-t' });
  }
  // Stripe's onboarding INSIDE Jeere (Connect embedded components), in Jeere's look; Stripe's own page as a fallback
  function loadConnectJs() {
    if (window.StripeConnect && window.StripeConnect.init) return Promise.resolve(window.StripeConnect);
    return new Promise((res, rej) => {
      let sc = document.querySelector('script[data-stripe-connect]');
      if (!sc) { sc = document.createElement('script'); sc.src = 'https://connect-js.stripe.com/v1.0/connect.js'; sc.async = true; sc.setAttribute('data-stripe-connect', ''); document.head.appendChild(sc); }
      let n = 0;
      const t = setInterval(() => { if (window.StripeConnect && window.StripeConnect.init) { clearInterval(t); res(window.StripeConnect); } else if (++n > 100) { clearInterval(t); rej(new Error('connect.js')); } }, 100);
      sc.addEventListener('error', () => { clearInterval(t); rej(new Error('connect.js')); });
    });
  }
  async function stripeEmbedded(country) {
    const sid = remoteStoreId();
    const j = await payCall({ action: 'session', storeId: sid, country: country || '' });
    if (!j || !j.ok || !j.clientSecret || !j.publishableKey) return j || { ok: false };
    const SC = await loadConnectJs();
    openDialog(H`<div class="a-dialog__card a-dialog__card--wide">${dlgHead('se-t', 'Activer les paiements par carte')}
      <div class="a-dialog__body"><p class="a-dialog__lead">${esc(fr('Stripe vérifie votre identité et le compte bancaire qui reçoit l’argent. Vos informations vont directement à Stripe : Jeere ne les voit pas.'))}</p>
      <div id="a-stripe-embed" class="a-stripe-embed"><p class="a-small">Chargement du formulaire sécurisé…</p></div></div></div>`, { labelledby: 'se-t' });
    let secret = j.clientSecret;
    const inst = SC.init({
      publishableKey: j.publishableKey,
      fetchClientSecret: async () => {
        if (secret) { const s0 = secret; secret = ''; return s0; }
        const k = await payCall({ action: 'session', storeId: sid });
        return k && k.clientSecret ? k.clientSecret : '';
      },
      locale: 'fr-FR',
      appearance: {
        overlays: 'dialog',
        variables: {
          fontFamily: 'Outfit, system-ui, sans-serif', colorPrimary: '#141414', colorText: '#141414', colorBackground: '#FFFFFF',
          buttonPrimaryColorBackground: '#141414', buttonPrimaryColorText: '#FFFFFF', borderRadius: '12px', spacingUnit: '10px'
        }
      },
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap' }]
    });
    const box = $('#a-stripe-embed');
    const ob = inst.create('account-onboarding');
    ob.setOnExit(() => { S.stripe = null; closeDialog(true); refresh(); toast('Merci ! Stripe vérifie vos informations : la carte s’active dès que c’est bon.'); });
    if (box) { box.innerHTML = ''; box.appendChild(ob); }
    return { ok: true, embedded: true };
  }
  async function stripeConnect(el) {
    const sid = remoteStoreId();
    const sel = $('#sp-country');
    const country = sel ? sel.value : '';
    if (el) { el.disabled = true; el.setAttribute('aria-busy', 'true'); }
    let e = null;
    try { e = await stripeEmbedded(country); } catch (x) { e = null; }
    if (e && e.embedded) return;
    // Stripe's own page (no publishable key on the server yet, or connect.js blocked)
    const j = await payCall({ action: 'connect', storeId: sid, country });
    if (j && j.ok && j.url) { window.location.href = j.url; return; }
    if (el) { el.disabled = false; el.removeAttribute('aria-busy'); }
    toast((j && j.message) || (e && e.message) || 'Stripe n’a pas pu s’ouvrir. Réessayez.');
  }
  // Her Stripe account managed INSIDE Jeere: payments (refunds, disputes), payouts (bank, schedule), the account itself
  async function stripeDashboard(tab) {
    const sid = remoteStoreId();
    const j = await payCall({ action: 'session', storeId: sid });
    if (!j || !j.ok || !j.clientSecret || !j.publishableKey) {
      const d = await payCall({ action: 'dashboard', storeId: sid });
      if (d && d.ok && d.url) window.open(d.url, '_blank', 'noopener'); else toast((j && j.message) || (d && d.message) || 'Le compte Stripe n’a pas pu s’ouvrir.');
      return;
    }
    let SC;
    try { SC = await loadConnectJs(); } catch (e) { toast('Le module de paiement n’a pas pu se charger. Vérifiez votre connexion.'); return; }
    const TABS = [['payments', 'Paiements'], ['payouts', 'Versements'], ['account-management', 'Mon compte']];
    const cur = TABS.some((t) => t[0] === tab) ? tab : 'payments';
    openDialog(H`<div class="a-dialog__card a-dialog__card--wide">${dlgHead('sd-t', 'Paiements par carte')}
      <div class="a-dialog__body"><div class="a-stripe-tabs" role="tablist" aria-label="Rubriques">${TABS.map(([k, l]) => H`<button class="a-btn a-btn--ghost a-btn--sm" type="button" role="tab" data-act="stripe-tab" data-v="${k}" aria-selected="${k === cur ? 'true' : 'false'}">${esc(l)}</button>`)}</div>
      <div id="a-stripe-banner"></div><div id="a-stripe-embed" class="a-stripe-embed"><p class="a-small">Chargement…</p></div></div></div>`, { labelledby: 'sd-t' });
    let secret = j.clientSecret;
    S.stripeInst = SC.init({
      publishableKey: j.publishableKey,
      fetchClientSecret: async () => { if (secret) { const s0 = secret; secret = ''; return s0; } const k = await payCall({ action: 'session', storeId: sid }); return k && k.clientSecret ? k.clientSecret : ''; },
      locale: 'fr-FR',
      appearance: { overlays: 'dialog', variables: { fontFamily: 'Outfit, system-ui, sans-serif', colorPrimary: '#141414', colorText: '#141414', colorBackground: '#FFFFFF', buttonPrimaryColorBackground: '#141414', buttonPrimaryColorText: '#FFFFFF', borderRadius: '12px', spacingUnit: '10px' } },
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap' }]
    });
    const ban = $('#a-stripe-banner');
    if (ban) ban.appendChild(S.stripeInst.create('notification-banner'));
    stripeTab(cur);
  }
  function stripeTab(k) {
    const box = $('#a-stripe-embed');
    if (!box || !S.stripeInst) return;
    $$('[data-act="stripe-tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-v') === k)));
    box.innerHTML = '';
    box.appendChild(S.stripeInst.create(k));
  }

  function openConnector(id) {
    if (id === 'livreurs') { openCouriers(); return; }
    if (id === 'card' && remoteStoreId()) { openStripe(); return; }
    const c = connector(id);
    if (!c || c.soon) return;
    const cur = conn(id);
    const on = cur.status === 'connected';
    const vals = {};
    c.fields.forEach((f) => { vals[f.key] = Object.prototype.hasOwnProperty.call(cur.values || {}, f.key) ? cur.values[f.key] : connDefault(c, f); });
    const html = H`<form class="a-dialog__card" data-dform="connector" data-id="${esc(id)}" novalidate>
      ${dlgHead('cd-t', (on ? 'Gérer ' : 'Connecter ') + c.name)}
      <div class="a-dialog__body"><p class="a-dialog__lead">${esc(fr(c.description))}</p>
        <div style="margin-top:14px">${c.fields.map((f) => connField(c, f, vals[f.key]))}</div>
        ${c.note ? H`<p class="a-small" style="margin-top:14px">${esc(fr(c.note))}</p>` : ''}
        ${id === 'domain' ? H`<table class="a-dns"><thead><tr><th>Type</th><th>Nom</th><th>Valeur</th></tr></thead><tbody><tr><td>A</td><td>@</td><td>${esc(D.DNS_APEX_A || '76.76.21.21')}</td></tr><tr><td>CNAME</td><td>www</td><td>${esc(D.DNS_TARGET || 'cname.vercel-dns.com')}</td></tr></tbody></table><p class="a-small" style="margin-top:8px"><a class="a-link" href="#parametres/domaine" data-close>Le pas à pas et la vérification : Paramètres › Domaine</a></p>` : ''}
        ${REAL_CONN.indexOf(id) >= 0 && remoteStoreId() ? H`<div class="a-note a-note--line" style="margin-top:14px">${ico('info')}<p>Enregistré sur votre boutique en ligne dès que vous touchez « ${on ? 'Enregistrer' : 'Connecter'} ».</p></div>` : H`<div class="a-note a-note--line" style="margin-top:14px">${ico('info')}<p>Cette boutique n’est pas encore publiée : ces réglages restent dans ce navigateur jusqu’à sa publication.</p></div>`}</div>
      <div class="a-dialog__foot">${on ? H`<button class="a-btn a-btn--quiet a-btn--left" type="button" data-act="connector-off" data-id="${esc(id)}">Déconnecter</button>` : ''}
        <button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">${on ? 'Enregistrer' : 'Connecter'}</button></div></form>`;
    openDialog(html, { labelledby: 'cd-t' });
  }
  // connectors that act on the published store (the rest are « Bientôt »)
  const REAL_CONN = ['mobile-money', 'whatsapp', 'card', 'domain'];
  function saveConnectorForm(form) {
    const id = form.getAttribute('data-id');
    const c = connector(id);
    if (!c) return;
    clearErrors(form);
    const v = serialize(form);
    const values = {};
    let ok = true;
    const firstReq = id === 'mobile-money' ? null : c.fields.find((f) => f.type !== 'toggle' && f.type !== 'select');
    c.fields.forEach((f) => {
      const input = form.elements[f.key];
      if (f.type === 'toggle') { values[f.key] = v[f.key] === true ? 'true' : 'false'; return; }
      let val = clip(v[f.key], 200);
      if (f.type === 'tel' && val) {
        val = normPhone(val);
        if (phoneProblem(val)) { ok = invalid(input, phoneProblem(val)) && ok; return; }
      }
      if (f.key === 'domain' && val) {
        val = val.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(val)) { ok = invalid(input, 'Écrivez le domaine sans espace, par exemple awabeaute.ci.') && ok; return; }
      }
      if (f.type === 'url' && val && !/^https:\/\/pay\.wave\.com\/\S{3,}$/i.test(val)) { ok = invalid(input, 'Collez le lien Wave complet : il commence par https://pay.wave.com/') && ok; return; }
      if (f.type === 'email' && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { ok = invalid(input, 'Écrivez une adresse e-mail complète, par exemple vous@exemple.com.') && ok; return; }
      if (f.key === 'sender') val = val.replace(/\s/g, '').slice(0, 11);
      if (f === firstReq && !val) { ok = invalid(input, 'Ce champ est nécessaire pour connecter ' + c.name + '.') && ok; return; }
      values[f.key] = val;
    });
    if (ok && id === 'mobile-money' && !['wave', 'wavePhone', 'orange', 'mtn', 'moov'].some((k) => values[k])) ok = invalid(form.elements.wave, 'Remplissez au moins un moyen : votre lien Wave ou un numéro.') && ok;
    if (!ok) { focusFirstError(form); return; }
    const was = conn(id);
    S.admin.connectors[id] = { status: 'connected', values, connectedAt: was.status === 'connected' && was.connectedAt ? was.connectedAt : new Date().toISOString() };
    if (id === 'mobile-money') { S.admin.settings.payoutPhone = values.payoutPhone || S.admin.settings.payoutPhone; if (values.payoutOperator) S.admin.settings.payoutMethod = values.payoutOperator; }
    if (id === 'domain') S.admin.settings.customDomain = values.domain || '';
    saveAdmin();
    if (id === 'whatsapp' && values.number && S.config && S.config.store.whatsapp !== values.number) editConfig((cfg) => { cfg.store.whatsapp = values.number; });
    if (id === 'mobile-money' && S.config) {
      const digits = (x) => String(x || '').replace(/[^\d+]/g, '');
      editConfig((cfg) => {
        const pay = {};
        if (values.wave) pay.wave = values.wave;
        ['wavePhone', 'orange', 'mtn', 'moov'].forEach((k) => { if (values[k]) pay[k] = digits(values[k]); });
        cfg.store.pay = pay;
        cfg.payments = Object.assign({}, cfg.payments, { wave: !!(pay.wave || pay.wavePhone), orange: !!pay.orange, mtn: !!pay.mtn, moov: !!pay.moov });
      });
    }
    closeDialog(true);
    refresh('[data-act="connector-open"][data-id="' + id + '"]');
    if (document.activeElement === document.body) focusMain();
    const live = REAL_CONN.indexOf(id) >= 0 && remoteStoreId();
    if (live && (id === 'mobile-money' || id === 'whatsapp')) {
      toast(c.name + (was.status === 'connected' ? ' : réglages enregistrés.' : ' connecté.') + ' Publiez pour que vos clients le voient.', { ms: 9000, action: 'Publier maintenant', onAction: publishNow });
    } else toast(c.name + (was.status === 'connected' ? ' : réglages enregistrés' : ' connecté') + (live ? '.' : ' (dans ce navigateur).'));
  }
  function publishNow() {
    const P = window.JeerePublish;
    const r = P && P.local ? P.local() : null;
    if (!P || !r || !r.slug) { toast('Ouvrez « Publier » pour mettre votre boutique en ligne.'); return; }
    toast('Publication…');
    P.publish(S.config, r.slug).then((x) => toast(x && x.ok ? 'C’est en ligne : vos clients voient vos nouveaux réglages.' : ((x && x.message) || 'La publication n’a pas abouti. Réessayez.'), { ms: 6000 }), () => toast('La publication n’a pas abouti. Vérifiez votre connexion.'));
  }
  function disconnect(id) {
    const c = connector(id);
    const cur = conn(id);
    if (!c || cur.status !== 'connected' || id === 'livreurs') return;
    const before = copy(cur);
    const dom = S.admin.settings.customDomain;
    S.admin.connectors[id] = Object.assign({}, cur, { status: 'off' });
    if (id === 'domain') S.admin.settings.customDomain = '';
    saveAdmin();
    closeDialog(true);
    refresh('[data-act="connector-open"][data-id="' + id + '"]');
    if (document.activeElement === document.body) focusMain();
    toast(c.name + ' déconnecté.', { action: 'Annuler', onAction: () => { S.admin.connectors[id] = before; if (id === 'domain') S.admin.settings.customDomain = dom; saveAdmin(); refresh(); toast(c.name + ' reconnecté.'); } });
  }

  /* ------------------------------------------------------------------ PARAMÈTRES */

  // The settings hub: the selling settings (their own pages) first, then the sub-pages of Paramètres
  function payHint() {
    const pay = (S.config && S.config.payments) || {};
    const on = PAYMENTS().filter((m) => pay[m.key] === true).map((m) => m.label);
    const lead = on.length ? (on.length > 2 ? on.slice(0, 2).join(', ') + '…' : on.join(', ')) : 'Aucun moyen de paiement';
    return (isOn('mobile-money') ? 'Paiement mobile connecté' : 'Paiement mobile non connecté') + ' · ' + lead;
  }
  function deliveryHint() {
    const z = ownZones();
    if (!z.length) return 'Communes d’Abidjan par défaut';
    return plural(z.length, 'commune', 'communes') + ' · dès ' + price(Math.min.apply(null, z.map((x) => Number(x.fee) || 0)));
  }
  const LINKS = [
    { id: 'paiements', href: '#paiements', label: 'Paiements', icon: 'wallet', hint: payHint },
    { id: 'livraison', href: '#livraison', label: 'Livraison', icon: 'truck', hint: deliveryHint },
    { id: 'connecteurs', href: '#connecteurs', label: 'Connecteurs', icon: 'plug', hint: () => { const real = CONNECTORS().filter((c) => !c.soon); return real.filter((c) => isOn(c.id)).length + ' sur ' + real.length + ' connectés'; } }
  ];
  const SUBS = [
    { id: 'boutique', label: 'Boutique', icon: 'store', hint: () => 'Nom, slogan, ville, WhatsApp, langue' },
    { id: 'domaine', label: 'Domaine', icon: 'globe', hint: () => S.admin.settings.customDomain || subdomain() },
    { id: 'equipe', label: 'Équipe', icon: 'users', hint: () => plural(S.admin.settings.team.length, 'personne', 'personnes') + (couriers().length ? ', dont ' + plural(couriers().length, 'livreur', 'livreurs') : '') },
    { id: 'abonnement', label: 'Abonnement', icon: 'card', hint: () => 'Formule ' + plan().name + (S.admin.settings.billing.paused ? ', en pause' : '') },
    { id: 'studio', label: 'Studio avancé', icon: 'sparkle', hint: () => studioHint() },
    { id: 'notifications', label: 'Notifications', icon: 'bell', hint: () => 'Commandes, résumé du jour, stock' },
    { id: 'pages-legales', label: 'Pages légales', icon: 'shield', hint: () => 'Conditions de vente, livraison et retours' },
    { id: 'donnees', label: 'Données', icon: 'data', hint: () => 'Exporter, supprimer mon compte' }
  ];
  function viewParametres(r) {
    const sub = SUBS.some((s) => s.id === r.parts[0]) ? r.parts[0] : '';
    const shown = sub || 'boutique';
    const content = { boutique: setBoutique, domaine: setDomaine, equipe: setEquipe, abonnement: setAbonnement, studio: setStudio, notifications: setNotifications, 'pages-legales': setLegal, donnees: setDonnees }[shown]();
    const s = SUBS.find((x) => x.id === shown);
    const navItem = (x, href, cur) => H`<li><a href="${href}"${cur ? ' aria-current="page"' : ''}>
          <span class="a-subnav__ico">${ico(x.icon)}</span><span class="a-subnav__txt"><span class="a-subnav__title">${esc(x.label)}</span><span class="a-subnav__hint">${esc(fr(x.hint()))}</span></span>${ico('chev', 'a-row__chev')}</a></li>`;
    // On the phone a sub-page is a page of its own: back to Paramètres, its name as the title
    const head = sub
      ? H`<div class="a-mobile-only">${pageHead(s.label, '', '', { href: '#parametres', label: 'Paramètres' })}</div><div class="a-desk-only">${pageHead('Paramètres', '')}</div>`
      : pageHead('Paramètres', 'Votre boutique, vos paiements, votre adresse, votre équipe et votre formule.');
    return H`<div class="a-page">
      ${head}
      <div class="a-settings" data-sub="${sub}">
        <nav class="a-settings__nav" aria-label="Rubriques des paramètres">
          <p class="a-subnav__group">Vente</p>
          <ul class="a-card a-card--flush a-subnav">${LINKS.map((x) => navItem(x, x.href, false))}</ul>
          <p class="a-subnav__group">Boutique et compte</p>
          <ul class="a-card a-card--flush a-subnav">${SUBS.map((x) => navItem(x, '#parametres/' + x.id, x.id === shown))}</ul></nav>
        <div class="a-settings__content a-stack">
          <h2 class="a-sechead__title a-desk-only" style="font-size:19px">${esc(s.label)}</h2>
          ${content}
        </div>
      </div></div>`;
  }

  function setBoutique() {
    const lang = S.admin.settings.language;
    return H`${S.config ? H`<section class="a-card" aria-labelledby="h-sb"><div class="a-card__head"><div><h3 class="a-card__title" id="h-sb">Votre boutique</h3><p class="a-card__sub">Écrit dans votre fiche boutique : le Studio et la boutique le montrent aussi.</p></div></div>${prefsForm(takeDraft('prefs'))}</section>` : noStoreCard()}
      <section class="a-card" aria-labelledby="h-sl"><div class="a-card__head"><div><h3 class="a-card__title" id="h-sl">Langue et devise</h3></div></div>
        <fieldset class="a-fieldset" style="margin-top:0"><legend>Langue de la boutique</legend><div class="a-radios a-radios--2">
          <label class="a-radio"><input type="radio" name="lang" value="fr" data-lang${lang === 'fr' ? ' checked' : ''}><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">Français</span><span class="a-radio__hint">La langue de vos clients en Côte d’Ivoire.</span></span></label>
          <label class="a-radio"><input type="radio" name="lang" value="en" data-lang${lang === 'en' ? ' checked' : ''}><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">English</span><span class="a-radio__hint">Pour vos clients anglophones : bientôt traduite.</span></span></label>
        </div></fieldset>
        <div class="a-field"><label class="a-label" for="s-cur">Devise</label><div class="a-affix"><input class="a-input" id="s-cur" value="Franc CFA (FCFA)" readonly aria-describedby="s-cur-h"><span class="a-affix__txt">${ico('lock')}</span></div>
          <p class="a-hint" id="s-cur-h">Fixe : les prix de toutes les boutiques Jeere sont en FCFA, sans centimes.</p></div>
      </section>`;
  }

  // « Domaine »: the free address, her own domain (DNS records, check, attach) and buying one: admin/domaines.js
  function setDomaine() {
    const M = window.JeereAdminDomains;
    if (!M) return H`<section class="a-card"><p class="a-dialog__lead">Cette page n’a pas pu se charger : rechargez.</p></section>`;
    const ctx = {
      admin: () => S.admin, config: () => S.config, save: () => saveAdmin(), toast: (m, o) => toast(m, o),
      storeName: () => storeName(), address: () => subdomain(), openPublish: () => openPublish(), confirm: (o) => confirmBox(o)
    };
    S.mounts.push(() => M.mount(ctx));
    return M.html(ctx);
  }
  function saveSubdomainForm(form) {
    clearErrors(form);
    // (The address is now chosen in the « Publier » dialog, which checks it is free; kept for older drafts.)
    const s = slugify(form.elements.sub.value).slice(0, 40).replace(/-+$/, '');
    if (!s || s.length < 3) { invalid(form.elements.sub, 'Trois caractères au moins, par exemple awa-beaute.'); focusFirstError(form); return; }
    const addr = D && D.storeAddress ? D.storeAddress(s) : 'jeere.kreeative.xyz/b/' + s;
    S.admin.settings.subdomain = addr;
    S.admin.subdomainChosen = true;
    saveAdmin();
    clearDirty();
    refresh();
    focusMain();
    toast('Adresse choisie : ' + addr + '.');
  }
  function saveDomainForm(form) {
    clearErrors(form);
    const val = str(form.elements.domain.value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(val)) { invalid(form.elements.domain, 'Écrivez le domaine sans espace, par exemple awabeaute.ci.'); focusFirstError(form); return; }
    S.admin.settings.customDomain = val;
    const was = conn('domain');
    S.admin.connectors.domain = { status: 'connected', values: { domain: val }, connectedAt: was.connectedAt || new Date().toISOString() };
    saveAdmin();
    clearDirty();
    refresh('[data-act="domain-verify"]');
    toast('Domaine ajouté. Faites le réglage DNS, puis vérifiez.');
  }

  function setEquipe() {
    const team = S.admin.settings.team;
    const roles = arr(D.TEAM_ROLES).length ? D.TEAM_ROLES : [{ id: 'proprietaire', label: 'Propriétaire' }, { id: 'gestion', label: 'Gestion' }, { id: 'livraison', label: 'Livraison' }];
    const owners = team.filter((m) => m.role === 'proprietaire').length;
    const roleLabel = (id) => (roles.find((r) => r.id === id) || {}).label || id;
    return H`<section class="a-card" aria-labelledby="h-team"><div class="a-card__head" style="margin-bottom:0"><div><h3 class="a-card__title" id="h-team">Qui gère la boutique</h3><p class="a-card__sub">Chacun se connecte avec son propre numéro.</p></div></div>
        ${team.length ? team.map((m, i) => H`<div class="a-member"><span class="a-avatar">${esc(initials(m.name || '?'))}</span><span class="a-member__main"><span class="a-member__name">${esc(m.name || 'Sans nom')}${S.account && m.phone === S.account.phone ? H` <span class="a-chip">Vous</span>` : ''}</span><span class="a-member__meta">${esc(phoneFmt(m.phone))} · ${esc(roleLabel(m.role))}</span></span>
          ${canRemove(m, owners) ? H`<button class="a-ibtn" type="button" data-act="team-remove" data-i="${i}" aria-label="${esc('Retirer ' + (m.name || 'cette personne'))}">${ico('trash')}</button>` : ''}</div>`) : H`<p class="a-small" style="margin-top:10px">Personne pour l’instant.</p>`}
        <p class="a-small" style="margin-top:10px">Les personnes au rôle Livraison sont vos livreurs : vous leur confiez les commandes depuis la commande. <button class="a-link" type="button" data-act="couriers">Gérer mes livreurs</button></p>
      </section>
      <section class="a-card" aria-labelledby="h-invite"><div class="a-card__head"><div><h3 class="a-card__title" id="h-invite">Inviter quelqu’un</h3><p class="a-card__sub">Une sœur qui répond aux clients, un livreur qui voit les adresses…</p></div></div>
        <form class="a-form" data-form="invite" data-light novalidate>
          <div class="a-grid2"><div class="a-field"><label class="a-label" for="t-name">Prénom</label><input class="a-input" id="t-name" name="name" maxlength="40" autocomplete="off" placeholder="Mariam"></div>
            <div class="a-field"><label class="a-label" for="t-phone">Numéro WhatsApp</label><input class="a-input" id="t-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ex. : 05 44 12 34 56"></div></div>
          <fieldset class="a-fieldset"><legend>Rôle</legend><div class="a-radios a-radios--3">${roles.map((r, i) => H`<label class="a-radio"><input type="radio" name="role" value="${esc(r.id)}"${i === 1 ? ' checked' : ''}><span class="a-radio__dot"></span><span class="a-radio__txt"><span class="a-radio__label">${esc(r.label)}</span>${r.hint ? H`<span class="a-radio__hint">${esc(fr(r.hint))}</span>` : ''}</span></label>`)}</div></fieldset>
          <div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">${ico('plus')}Inviter</button></div>
          <p class="a-small" style="margin-top:8px">Démo : aucune invitation n’est envoyée. Dans Jeere, la personne reçoit un lien sur WhatsApp.</p>
        </form></section>`;
  }
  function saveInviteForm(form) {
    clearErrors(form);
    const v = serialize(form);
    const name = clip(v.name, 40);
    const phone = normPhone(v.phone);
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Indiquez le prénom.');
    if (!digits(phone)) ok = invalid(form.elements.phone, 'Indiquez son numéro WhatsApp, par exemple 07 07 12 34 56.') && ok;
    else if (phoneProblem(phone)) ok = invalid(form.elements.phone, phoneProblem(phone)) && ok;
    else if (S.admin.settings.team.some((m) => m.phone === phone)) ok = invalid(form.elements.phone, 'Ce numéro fait déjà partie de l’équipe.') && ok;
    if (S.admin.settings.team.length >= 20) { toast('20 personnes au plus.'); ok = false; }
    if (!ok) { focusFirstError(form); return; }
    S.admin.settings.team.push({ name, phone, role: ['proprietaire', 'gestion', 'livraison'].indexOf(v.role) >= 0 ? v.role : 'gestion' });
    syncCourierConnector();
    saveAdmin();
    clearDirty();
    refresh('#t-name');
    toast(name + ' fait partie de l’équipe (démo : aucune invitation envoyée).');
  }
  // The last owner and the signed-in seller herself cannot be removed (she would come back as the owner)
  const canRemove = (m, owners) => !((m.role === 'proprietaire' && owners <= 1) || (S.account && m.phone === S.account.phone));
  async function removeMember(i) {
    const m = S.admin.settings.team[i];
    if (!m || !canRemove(m, S.admin.settings.team.filter((x) => x.role === 'proprietaire').length)) return;
    const ok = await confirmBox({ title: 'Retirer ' + (m.name || 'cette personne') + ' ?', text: 'Elle ne pourra plus gérer la boutique.', ok: 'Retirer', danger: true });
    if (!ok) { focusMain(); return; }
    S.admin.settings.team.splice(i, 1);
    syncCourierConnector();
    saveAdmin();
    refresh('#t-name');
    toast((m.name || 'La personne') + ' a été retirée de l’équipe.', { action: 'Annuler', onAction: () => { S.admin.settings.team.splice(i, 0, m); syncCourierConnector(); saveAdmin(); refresh(); } });
  }

  function setAbonnement() {
    const cur = plan();
    const b = S.admin.settings.billing;
    const weekOk = !!cur.priceWeek;
    const used = monthOrders();
    const due = cur.priceMonth ? (b.cycle === 'semaine' && weekOk ? price(cur.priceWeek) + ' par semaine' : price(cur.priceMonth) + ' par mois') : '';
    return H`<section class="a-card" aria-labelledby="h-cur"><div class="a-card__head"><div><h3 class="a-card__title" id="h-cur">Formule ${esc(cur.name)} ${b.paused ? H`<span class="a-chip a-chip--line">${ico('pause')}En pause</span>` : H`<span class="a-chip a-chip--ink">Active</span>`}</h3>
          <p class="a-card__sub">${esc(fr(cur.ordersLabel))} · ${esc(fr(cur.feeLabel))}</p></div></div>
        <p class="a-big">${esc(cur.priceMonth ? (b.cycle === 'semaine' && weekOk ? price(cur.priceWeek) : price(cur.priceMonth)) : '0' + NB + 'FCFA')}<small class="a-muted" style="font-size:14px;font-weight:500">${cur.priceMonth ? (b.cycle === 'semaine' && weekOk ? ' / semaine' : ' / mois') : ''}</small></p>
        <div class="a-meter"><div class="a-meter__row"><span>Commandes ce mois-ci${hasDemoOrders() ? ' (exemple)' : ''}</span><strong>${cur.orders ? esc(number(used) + ' sur ' + number(cur.orders)) : esc(number(used)) + ' · illimitées'}</strong></div>
          ${cur.orders ? H`<div class="a-progress__bar" aria-hidden="true"><div class="a-progress__fill${used / cur.orders >= .8 ? ' is-high' : ''}" style="width:${Math.min(100, Math.round((used / cur.orders) * 100))}%"></div></div>` : ''}
          ${cur.orders ? H`<p class="a-hint" style="margin-top:8px">${esc(fr(planLimit().policy))}</p>` : ''}</div>
        ${cur.priceMonth ? H`<div class="a-field"><span class="a-label" id="l-cycle">Paiement</span><div class="a-seg" role="group" aria-labelledby="l-cycle">
          <button class="a-seg__btn" type="button" data-act="cycle" data-v="mois" aria-pressed="${b.cycle !== 'semaine' || !weekOk ? 'true' : 'false'}">Par mois</button>
          <button class="a-seg__btn" type="button" data-act="cycle" data-v="semaine" aria-pressed="${b.cycle === 'semaine' && weekOk ? 'true' : 'false'}"${weekOk ? '' : ' disabled aria-describedby="h-week"'}>Par semaine</button></div>
          ${weekOk ? '' : H`<p class="a-hint" id="h-week">Le paiement à la semaine existe pour la formule Essentiel : 1 000 FCFA par semaine.</p>`}</div>` : ''}
        <div class="a-card__foot">
          ${cur.priceMonth ? (realBilling() ? H`<button class="a-btn a-btn--primary" type="button" data-act="billing-portal">${ico('card')}Mon espace de paiement</button>` : H`<button class="a-btn a-btn--primary" type="button" data-act="pay-mm">${ico('phone')}Payer par mobile money</button>`) : H`<p class="a-small">Rien à payer avec la formule Gratuit : Jeere prend ${esc(fr(cur.fee + ' %'))} par vente en ligne.</p>`}
          ${cur.priceMonth && !realBilling() ? H`<button class="a-btn a-btn--ghost" type="button" data-act="pause">${ico(b.paused ? 'refresh' : 'pause')}${b.paused ? 'Reprendre l’abonnement' : 'Mettre en pause'}</button>` : ''}
        </div>
        ${cur.priceMonth ? H`<p class="a-small" style="margin-top:8px">${b.paused ? 'En pause : rien n’est prélevé. Reprenez quand vous voulez.' : esc(fr('Prochain paiement : ' + due + '. Rien n’est prélevé sans vous.'))}</p>` : ''}
      </section>
      <section aria-labelledby="h-plans"><div class="a-sechead"><h3 class="a-sechead__title" id="h-plans">Changer de formule</h3></div>
        <ul class="a-plans">${PLANS().map((p) => {
          const isCur = p.id === cur.id;
          return H`<li><article class="a-plan${isCur ? ' is-current' : ''}" aria-labelledby="pl-${esc(p.id)}">
            <div class="a-plan__top"><h4 class="a-plan__name" id="pl-${esc(p.id)}">${esc(p.name)}</h4>${isCur ? H`<span class="a-chip a-chip--ink">Votre formule</span>` : (p.recommended ? H`<span class="a-chip">Recommandée</span>` : '')}</div>
            <p class="a-plan__for">${esc(p.for || '')}</p>
            <p class="a-plan__price">${esc(p.priceMonth ? price(p.priceMonth) : '0' + NB + 'FCFA')}<small>${p.priceMonth ? NB + '/' + NB + 'mois' : ''}</small></p>
            <p class="a-plan__week">${esc(fr(p.priceWeekLabel || ''))}</p>
            <ul class="a-plan__list"><li>${ico('check')}<span>${esc(fr(p.ordersLabel))}</span></li><li>${ico('check')}<span>${esc(fr(p.feeLabel))}</span></li><li>${ico('check')}<span>Toutes les fonctions et l’aide humaine</span></li></ul>
            ${isCur ? H`<button class="a-btn a-btn--ghost a-btn--block" type="button" disabled>Formule actuelle</button>` : H`<button class="a-btn ${p.recommended ? 'a-btn--primary' : 'a-btn--ghost'} a-btn--block" type="button" data-act="plan" data-v="${esc(p.id)}">Choisir ${esc(p.name)}</button>`}
          </article></li>`;
        })}</ul></section>
      <section class="a-card" aria-labelledby="h-incl"><div class="a-card__head"><h3 class="a-card__title" id="h-incl">Dans toutes les formules</h3></div>
        <ul class="a-checks">${arr(D.PLAN_FEATURES).map((f) => H`<li>${ico('check')}<span>${esc(fr(f))}</span></li>`)}</ul>
        ${D.PLAN_NOTE ? H`<p class="a-small" style="margin-top:12px">${esc(fr(D.PLAN_NOTE))}</p>` : ''}</section>`;
  }
  /* ---------- Paramètres › Studio avancé: the Studio subscription (../studio/plans.js, kept in
   * 'jeere-account'.studio). Only the trial, cancel / resume, a move down, seats and members are
   * changed here; anything that is paid goes through the checkout of ../abonnements/. ---------- */
  const SP = () => window.JeerePlans || null;
  function studioHint() {
    const P = SP();
    if (!P) return 'Découverte';
    const s = P.state();
    if (s.status === 'trial') return 'Essai, encore ' + plural(s.daysLeft, 'jour', 'jours');
    if (s.status === 'canceling') return s.plan.name + ', annulé';
    if (s.status === 'due') return s.plan.name + ', à renouveler';
    if (s.unlocked) return s.plan.name + (s.period === 'an' ? ' annuel' : ' mensuel');
    return 'Découverte, gratuit';
  }
  const ckUrl = (planId, period) => '../abonnements/?plan=' + encodeURIComponent(planId) + '&periode=' + (period === 'mois' ? 'mois' : 'an') + '#paiement';
  function setStudio() {
    const P = SP();
    if (!P) return H`<section class="a-card"><p class="a-small">Les abonnements du Studio n’ont pas pu se charger. Rechargez la page.</p></section>`;
    const B = window.JeereBilling;
    const s = P.state();
    const sub = s.sub;
    const chip = { trial: H`<span class="a-chip a-chip--ink">Essai</span>`, active: H`<span class="a-chip a-chip--ink">Actif</span>`, canceling: H`<span class="a-chip a-chip--line">Annulé</span>`, due: H`<span class="a-chip a-chip--due">À renouveler</span>`, free: H`<span class="a-chip a-chip--soft">Gratuit</span>` }[s.status];
    const paidNow = s.unlocked && s.status !== 'trial';
    const pr = paidNow ? P.price(sub.plan, sub.period, sub.extraSeats) : null;
    const method = B && B.methodById(sub.method);
    let rows = '';
    if (s.status === 'trial') rows += H`<div><dt>Fin de l’essai</dt><dd>${esc(P.date(s.endsAt))}</dd></div><div><dt>Ensuite</dt><dd>Découverte, sauf si vous choisissez une formule. Rien n’est prélevé.</dd></div>`;
    if (paidNow) {
      rows += H`<div><dt>Facturation</dt><dd>${sub.period === 'an' ? esc('Annuelle : ' + P.fcfa(pr.total) + ' par an') : esc('Mensuelle : ' + P.fcfa(pr.total) + ' par mois')}</dd></div>`;
      rows += H`<div><dt>${s.status === 'canceling' ? 'Fin de l’abonnement' : (s.status === 'due' ? 'À renouveler avant le' : 'Prochain renouvellement')}</dt><dd>${esc(P.date(s.status === 'due' ? s.endsAt : s.periodEnd))}</dd></div>`;
      if (method) rows += H`<div><dt>Moyen de paiement</dt><dd>${esc(method.name)}</dd></div>`;
    }
    rows += H`<div><dt>Boutiques dans le Studio</dt><dd>${esc(String(s.plan.sites))}</dd></div><div><dt>Places</dt><dd>${esc(s.seatsUsed + ' sur ' + s.seats)}</dd></div>`;
    const pend = s.pending ? H`<p class="a-note a-note--line" style="margin-top:12px">${ico('info')}<span>${esc('Le ' + P.date(sub.periodEnd) + ', passage à ' + P.planById(s.pending.plan).label + ' ' + (s.pending.period === 'an' ? 'annuel' : 'mensuel') + '.')} <button class="a-link" type="button" data-act="studio-resume">Garder ma formule</button></span></p>` : '';
    let acts = '';
    if (s.status === 'free') acts = H`${s.trialAvailable ? H`<button class="a-btn a-btn--primary" type="button" data-act="studio-trial">${ico('sparkle')}Essayer 14 jours gratuitement</button>` : ''}<a class="a-btn ${s.trialAvailable ? 'a-btn--ghost' : 'a-btn--primary'}" href="../abonnements/">Voir les abonnements</a><a class="a-btn a-btn--quiet" href="../studio/">Ouvrir le Studio</a>`;
    else if (s.status === 'trial') acts = H`<a class="a-btn a-btn--primary" href="../abonnements/">Choisir une formule</a><a class="a-btn a-btn--ghost" href="../studio/">Ouvrir le Studio</a>`;
    else if (s.status === 'canceling') acts = H`<button class="a-btn a-btn--primary" type="button" data-act="studio-resume">${ico('refresh')}Reprendre l’abonnement</button><a class="a-btn a-btn--ghost" href="../studio/">Ouvrir le Studio</a>`;
    else if (s.status === 'due') acts = H`<a class="a-btn a-btn--primary" href="${ckUrl(s.pending ? s.pending.plan : sub.plan, s.pending ? s.pending.period : sub.period)}">Renouveler · ${esc(P.fcfa(s.pending ? P.price(s.pending.plan, s.pending.period).total : pr.total))}</a><button class="a-btn a-btn--quiet" type="button" data-act="studio-cancel">Arrêter</button>`;
    else acts = H`<a class="a-btn a-btn--primary" href="../studio/">${ico('sparkle')}Ouvrir le Studio</a><a class="a-btn a-btn--ghost" href="../abonnements/">Changer de formule</a>
        ${sub.period === 'mois' ? H`<a class="a-btn a-btn--ghost" href="${ckUrl(sub.plan, 'an')}">Passer à l’annuel (−${P.discount(sub.plan)} %)</a>` : (s.pending ? '' : H`<button class="a-btn a-btn--ghost" type="button" data-act="studio-monthly">Passer au mensuel</button>`)}
        <button class="a-btn a-btn--quiet" type="button" data-act="studio-cancel">Annuler l’abonnement</button>`;
    const cur = H`<section class="a-card" aria-labelledby="h-st"><div class="a-card__head"><div><h3 class="a-card__title" id="h-st">${esc(s.unlocked ? 'Studio ' + s.plan.name : 'Studio Découverte')} ${chip}</h3>
          <p class="a-card__sub">${esc(s.status === 'trial' ? 'Essai de tout le Studio, comme Studio Pro' : s.plan.for)}</p></div></div>
        <p class="a-big">${esc(paidNow ? P.fcfa(pr.perMonth) : '0' + NB + 'FCFA')}<small class="a-muted" style="font-size:14px;font-weight:500">${paidNow ? ' / mois' : (s.status === 'trial' ? ' pendant l’essai' : '')}</small></p>
        <dl class="a-dl" style="margin-top:14px">${rows}</dl>${pend}
        <div class="a-card__foot a-btnrow">${acts}</div>
        <p class="a-small" style="margin-top:10px">${realBilling() ? H`Paiement par carte sur Stripe, renouvelé automatiquement. Factures, carte et résiliation : <button class="a-link" type="button" data-act="billing-portal">mon espace de paiement</button>.` : H`Mode démo : rien n’est prélevé. Dans Jeere, le mobile money n’est jamais débité tout seul : une demande à valider arrive à chaque échéance, avec ${P.GRACE_DAYS} jours pour renouveler.`}</p></section>`;

    // seats (Pro: 2, Agence: 5 and more)
    const owner = S.account || {};
    let seats;
    if (s.seats > 1) {
      const ag = P.planById('agence');
      const full = s.seatsUsed >= s.seats;
      seats = H`<section class="a-card" aria-labelledby="h-seats"><div class="a-card__head" style="margin-bottom:0"><div><h3 class="a-card__title" id="h-seats">Places du Studio</h3><p class="a-card__sub">${esc(s.seatsUsed + ' sur ' + s.seats + ' places utilisées. Chacun ouvre le Studio avec son propre numéro.')}</p></div></div>
        <div class="a-member"><span class="a-avatar">${esc(initials(owner.firstName || '?'))}</span><span class="a-member__main"><span class="a-member__name">${esc(owner.firstName || 'Vous')} <span class="a-chip">Vous</span></span><span class="a-member__meta">${esc(phoneFmt(owner.phone))} · Propriétaire</span></span></div>
        ${sub.members.map((m) => H`<div class="a-member"><span class="a-avatar">${esc(initials(m.name || '?'))}</span><span class="a-member__main"><span class="a-member__name">${esc(m.name)}</span><span class="a-member__meta">${esc(phoneFmt(m.phone) || m.phone)} · Studio</span></span>
          <button class="a-ibtn" type="button" data-act="studio-member-del" data-id="${esc(m.id)}" aria-label="${esc('Retirer ' + (m.name || 'cette personne') + ' du Studio')}">${ico('trash')}</button></div>`)}
        ${s.planId === 'agence' && paidNow ? H`<div class="a-field" style="margin-top:14px"><span class="a-label" id="l-xseat">Places en plus · ${esc(P.fcfa(sub.period === 'an' ? ag.extraSeatYear : ag.extraSeat))} par place et par mois</span>
          <div class="a-btnrow" role="group" aria-labelledby="l-xseat"><button class="a-ibtn a-ibtn--line" type="button" data-act="studio-seat" data-d="-1" aria-label="Une place de moins"${sub.extraSeats <= 0 ? ' disabled' : ''}>${ico('minus')}</button><strong aria-live="polite" id="studio-xseats">${sub.extraSeats}</strong><button class="a-ibtn a-ibtn--line" type="button" data-act="studio-seat" data-d="1" aria-label="Une place de plus"${sub.extraSeats >= ag.seatsMax - ag.seats ? ' disabled' : ''}>${ico('plus')}</button></div>
          <p class="a-hint">Facturées à partir de la prochaine échéance (démo).</p></div>` : ''}
        ${full ? H`<p class="a-small" style="margin-top:12px">Toutes les places sont prises.${s.planId === 'agence' ? ' Ajoutez une place pour inviter quelqu’un.' : ' Studio Agence : 5 places et plus.'}</p>` : H`<form class="a-form" data-form="studiomember" data-light novalidate style="margin-top:14px">
          <div class="a-grid2"><div class="a-field"><label class="a-label" for="sm-name">Prénom</label><input class="a-input" id="sm-name" name="name" maxlength="40" autocomplete="off" placeholder="Koffi"></div>
            <div class="a-field"><label class="a-label" for="sm-phone">Numéro WhatsApp</label><input class="a-input" id="sm-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ex. : 05 44 12 34 56"></div></div>
          <div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">${ico('plus')}Donner une place</button></div>
          <p class="a-small" style="margin-top:8px">Démo : aucune invitation n’est envoyée.</p></form>`}</section>`;
    } else {
      seats = H`<section class="a-card" aria-labelledby="h-seats"><div class="a-card__head" style="margin-bottom:0"><div><h3 class="a-card__title" id="h-seats">Places du Studio</h3><p class="a-card__sub">Votre formule a une place : la vôtre. Studio Pro en a 2, Studio Agence 5 et plus.</p></div></div>
        <div class="a-btnrow" style="margin-top:12px"><a class="a-btn a-btn--ghost a-btn--sm" href="../abonnements/#comparer">Comparer les formules</a></div></section>`;
    }

    // invoices (demo)
    const inv = sub.invoices;
    const invoices = H`<section class="a-card" aria-labelledby="h-inv"><div class="a-card__head" style="margin-bottom:0"><div><h3 class="a-card__title" id="h-inv">Factures</h3><p class="a-card__sub">Démo : des reçus d’exemple, aucun paiement réel.</p></div></div>
      ${inv.length ? H`<ul class="a-invoices">${inv.map((v) => H`<li class="a-invoice"><span class="a-invoice__main"><span class="a-invoice__t">${esc(v.label)}</span><span class="a-invoice__m">${esc(v.id + ' · ' + P.date(v.date) + ' · ' + ((B && B.methodById(v.method) || {}).name || ''))}</span></span>
        <span class="a-invoice__end"><strong>${esc(P.fcfa(v.amount))}</strong><span class="a-chip a-chip--soft">${v.provider === 'stripe' ? 'Payée' : 'Payée (démo)'}</span></span></li>`)}</ul>` : H`<p class="a-small" style="margin-top:10px">Aucune facture pour l’instant.</p>`}</section>`;

    const feats = H`<section class="a-card" aria-labelledby="h-sf"><div class="a-card__head"><h3 class="a-card__title" id="h-sf">${s.unlocked ? 'Débloqué dans votre Studio' : 'Ce que débloque un abonnement'}</h3></div>
      <ul class="a-checks">${P.FEATURES.map((f) => H`<li>${ico(s.unlocked ? 'check' : 'lock')}<span><strong>${esc(f.name)}</strong> · ${esc(f.text)}</span></li>`)}</ul></section>`;
    return cur + seats + invoices + feats;
  }
  function afterStudio(msg, sel) {
    S.account = readAccount();
    refresh(sel);
    if (msg) toast(msg);
  }
  function studioTrial() {
    const P = SP();
    if (!P) return;
    const r = P.startTrial();
    afterStudio(r.ok ? 'Essai démarré : tout le Studio est débloqué pendant 14 jours.' : r.message, '#h-st');
  }
  async function studioCancel() {
    const P = SP();
    if (!P) return;
    const s = P.state();
    const ok = await confirmBox({
      title: 'Annuler l’abonnement Studio ?',
      text: s.status === 'due' ? 'Le Studio repasse en Découverte tout de suite. Rien n’est effacé.' : 'Tout reste débloqué jusqu’au ' + P.date(s.periodEnd) + ', puis le Studio repasse en Découverte. Rien n’est effacé, et vous pouvez reprendre d’ici là.',
      ok: 'Annuler l’abonnement', cancel: 'Garder mon abonnement'
    });
    if (!ok) { focusMain(); return; }
    const r = P.cancel();
    afterStudio(r.ok ? (s.status === 'due' ? 'Abonnement arrêté : retour en Découverte.' : 'Abonnement annulé : actif jusqu’au ' + P.date(r.at) + '.') : r.message, '[data-act="studio-resume"]');
  }
  function studioResume() {
    const P = SP();
    if (!P) return;
    const r = P.resume();
    afterStudio(r.ok ? 'Abonnement repris : rien ne change.' : '', '#h-st');
  }
  async function studioMonthly() {
    const P = SP();
    if (!P) return;
    const s = P.state();
    const ok = await confirmBox({ title: 'Passer au mensuel ?', text: 'Le changement se fait le ' + P.date(s.periodEnd) + ', à la fin de votre année payée : ' + P.fcfa(P.price(s.sub.plan, 'mois').perMonth) + ' par mois ensuite.', ok: 'Passer au mensuel' });
    if (!ok) { focusMain(); return; }
    const r = P.scheduleChange(s.sub.plan, 'mois');
    afterStudio(r.ok ? 'Passage au mensuel programmé le ' + P.date(r.at) + '.' : r.message, '#h-st');
  }
  function studioSeat(el) {
    const P = SP();
    if (!P) return;
    const d = Number(el.getAttribute('data-d')) || 0;
    const r = P.setExtraSeats(P.state().sub.extraSeats + d);
    afterStudio(r.ok ? (d > 0 ? 'Une place ajoutée (démo).' : 'Une place retirée.') : r.message, '[data-act="studio-seat"][data-d="' + d + '"]:not([disabled])');
  }
  function studioMemberDel(el) {
    const P = SP();
    if (!P) return;
    const r = P.removeMember(el.getAttribute('data-id'));
    afterStudio(r.ok ? 'Place libérée.' : '', '#sm-name');
  }
  function saveStudioMember(form) {
    const P = SP();
    if (!P) return;
    clearErrors(form);
    const v = serialize(form);
    const name = clip(v.name, 40);
    const phone = normPhone(v.phone);
    let ok = true;
    if (!name) ok = invalid(form.elements.name, 'Indiquez le prénom.');
    if (!digits(phone)) ok = invalid(form.elements.phone, 'Indiquez son numéro WhatsApp, par exemple 07 07 12 34 56.') && ok;
    else if (phoneProblem(phone)) ok = invalid(form.elements.phone, phoneProblem(phone)) && ok;
    else if ((S.account && S.account.phone === phone) || P.state().sub.members.some((m) => m.phone === phone)) ok = invalid(form.elements.phone, 'Ce numéro a déjà une place.') && ok;
    if (!ok) { focusFirstError(form); return; }
    const r = P.addMember(name, phone);
    if (!r.ok) { toast(r.message || 'Impossible d’ajouter cette personne.'); return; }
    clearDirty();
    afterStudio(name + ' a une place dans le Studio (démo : aucune invitation envoyée).', '#sm-name');
  }
  // Real billing (the `billing` function, Stripe): Jeere with a real account. The plan itself is written by the
  // server once Stripe confirms the payment; the page reads it back (JeereAuth.syncPlan).
  const realBilling = () => !!(window.JeereBilling && typeof window.JeereBilling.isReal === 'function' && window.JeereBilling.isReal());
  async function choosePlan(id) {
    const p = PLANS().find((x) => x.id === id);
    if (!p || !S.account) return;
    if (realBilling()) {
      const B = window.JeereBilling;
      if (!p.priceMonth) {
        const ok = await confirmBox({ title: 'Revenir à la formule Gratuite ?', text: 'Vous résiliez votre abonnement dans votre espace de paiement Stripe. Il reste actif jusqu’à la fin de la période payée.', ok: 'Ouvrir mon espace de paiement' });
        if (!ok) { focusMain(); return; }
        const r = await B.portal();
        if (r && !r.ok) toast(r.message || 'Votre espace de paiement n’a pas pu s’ouvrir.');
        return;
      }
      const week = S.admin.settings.billing.cycle === 'semaine' && p.priceWeek;
      const ok = await confirmBox({
        title: 'Passer à la formule ' + p.name + ' ?',
        html: H`<strong>${esc(week ? price(p.priceWeek) + ' par semaine' : price(p.priceMonth) + ' par mois')}</strong> · ${esc(fr(p.ordersLabel))} · ${esc(fr(p.feeLabel))}.<br><br>Vous payez par carte (Visa, Mastercard) sur la page sécurisée de Stripe. Résiliable à tout moment. Le mobile money arrive bientôt.`,
        ok: 'Payer par carte'
      });
      if (!ok) { focusMain(); return; }
      toast('Ouverture de la page de paiement…');
      const r = await B.subscribeBoutique(p.id, week ? 'semaine' : 'mois');
      if (r && !r.ok) toast(r.message || 'Le paiement n’a pas pu s’ouvrir.', { ms: 6000 });
      return;
    }
    const ok = await confirmBox({
      title: 'Passer à la formule ' + p.name + ' ?',
      html: H`<strong>${esc(p.priceMonth ? price(p.priceMonth) + ' par mois' : 'Gratuite')}</strong>${p.priceWeek ? esc(fr(' (ou ' + price(p.priceWeek) + ' par semaine)')) : ''} · ${esc(fr(p.ordersLabel))} · ${esc(fr(p.feeLabel))}.<br><br>Démo : rien n’est prélevé, la formule change seulement dans ce navigateur.`,
      ok: 'Passer à ' + p.name
    });
    if (!ok) { focusMain(); return; }
    S.account.plan = p.id;
    saveAccount();
    if (!p.priceWeek) S.admin.settings.billing.cycle = 'mois';
    if (!p.priceMonth) S.admin.settings.billing.paused = false;
    saveAdmin();
    refresh();
    focusMain();
    toast('Vous êtes maintenant en formule ' + p.name + ' (démo).');
  }
  function payMobileMoney() {
    if (realBilling()) { const r = window.JeereBilling.portal(); Promise.resolve(r).then((x) => { if (x && !x.ok) toast(x.message || 'Votre espace de paiement n’a pas pu s’ouvrir.'); }); return; }
    const cur = plan();
    const b = S.admin.settings.billing;
    const amount = b.cycle === 'semaine' && cur.priceWeek ? cur.priceWeek : cur.priceMonth;
    const ops = arr(D.OPERATOR_OPTIONS);
    const phone = S.admin.settings.payoutPhone || (S.account && S.account.phone) || '';
    const html = H`<form class="a-dialog__card" data-dform="paymm" novalidate>${dlgHead('pm-t', 'Payer par mobile money')}
      <div class="a-dialog__body"><p class="a-dialog__lead">Formule ${esc(cur.name)} : <strong>${esc(price(amount))}</strong> ${b.cycle === 'semaine' && cur.priceWeek ? 'pour une semaine' : 'pour un mois'}.</p>
        <div class="a-field" style="margin-top:14px"><label class="a-label" for="pm-op">Opérateur</label><div class="a-selectwrap"><select class="a-input" id="pm-op" name="op">${ops.map((o) => H`<option value="${esc(o.value)}"${o.value === S.admin.settings.payoutMethod ? ' selected' : ''}>${esc(o.label)}</option>`)}</select>${ico('down')}</div></div>
        <div class="a-field"><label class="a-label" for="pm-phone">Numéro qui paie</label><input class="a-input" id="pm-phone" name="phone" type="tel" inputmode="tel" value="${esc(phoneFmt(phone))}" placeholder="07 07 12 34 56" autocomplete="tel"></div>
        <div class="a-note a-note--line" style="margin-top:14px">${ico('info')}<p>Démo : aucune demande de paiement n’est envoyée et personne n’est débité.</p></div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Envoyer la demande de ${esc(price(amount))}</button></div></form>`;
    openDialog(html, { labelledby: 'pm-t' });
  }
  function savePayForm(form) {
    clearErrors(form);
    const phone = normPhone(form.elements.phone.value);
    if (!digits(phone) || phoneProblem(phone)) { invalid(form.elements.phone, digits(phone) ? phoneProblem(phone) : 'Indiquez le numéro qui paie, par exemple 07 07 12 34 56.'); focusFirstError(form); return; }
    const op = arr(D.OPERATOR_OPTIONS).find((o) => o.value === form.elements.op.value);
    const cur = plan();
    const b = S.admin.settings.billing;
    const amount = b.cycle === 'semaine' && cur.priceWeek ? cur.priceWeek : cur.priceMonth;
    const card = $('.a-dialog__card', dialogEl());
    if (!card) return;
    card.outerHTML = H`<div class="a-dialog__card">${dlgHead('pm-t', 'Demande prête')}
      <div class="a-dialog__body"><div class="a-dialog__done"><span class="a-empty__ico">${ico('check')}</span>
        <p class="a-dialog__lead">Dans Jeere, vous recevriez maintenant une demande de <strong>${esc(price(amount))}</strong> sur le ${esc(phoneFmt(phone))} (${esc(op ? op.label : '')}). Validez-la avec votre code secret, que vous ne donnez jamais à personne.</p>
        <p class="a-small">Démo : aucune demande n’a été envoyée.</p></div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--primary" type="button" data-close data-autofocus>Fermer</button></div></div>`;
    const btn = $('[data-autofocus]', dialogEl());
    if (btn) btn.focus();
  }

  function setNotifications() {
    const n = S.admin.settings.notifications;
    const row = (key, label, hint) => switchRow({ id: 'n-' + key, label, hint, checked: n[key] === true, attrs: 'data-notif="' + key + '"' });
    return H`<section class="a-card" aria-labelledby="h-notif"><div class="a-card__head" style="margin-bottom:4px"><div><h3 class="a-card__title" id="h-notif">Prévenez-moi</h3><p class="a-card__sub">Sur le numéro ${esc(phoneFmt((S.account && S.account.phone) || S.admin.settings.payoutPhone) || 'de votre compte')}.</p></div></div>
      ${row('newOrderWhatsapp', 'Nouvelle commande sur WhatsApp', 'Un message dès qu’une commande arrive, avec le détail.')}
      ${row('newOrderSms', 'Nouvelle commande par SMS', 'Utile quand vous n’avez pas internet.')}
      ${row('dailySummary', 'Résumé du jour', 'Chaque soir : les ventes, les commandes à préparer, l’argent reçu.')}
      ${row('lowStock', 'Stock bas', 'Quand un produit suivi passe sous 3 pièces.')}
      <p class="a-small" style="margin-top:8px">Démo : aucun message n’est envoyé.</p></section>`;
  }
  function toggleNotif(input) {
    const key = input.getAttribute('data-notif');
    if (!Object.prototype.hasOwnProperty.call(S.admin.settings.notifications, key)) return;
    S.admin.settings.notifications[key] = input.checked;
    saveAdmin();
    toast(input.checked ? 'Notification activée.' : 'Notification désactivée.');
  }

  function setLegal() {
    if (!S.config) return noStoreCard();
    const pages = arr(S.config.pages);
    const legal = pages.filter((p) => { const k = D.pageKind ? D.pageKind(p) : null; return k === 'terms' || k === 'shipping'; });
    return H`<section class="a-card a-card--flush" aria-labelledby="h-legal"><div class="a-card__head"><div><h3 class="a-card__title" id="h-legal">Vos pages légales</h3><p class="a-card__sub">Ce que vos clients lisent avant d’acheter : vente, livraison, retours, données personnelles.</p></div></div>
        ${legal.length ? H`<ul class="a-rows" style="margin-top:8px">${legal.map((p) => {
          const draft = /À adapter/.test(p.body);
          return H`<li><a class="a-row" href="#pages/${esc(p.id)}">${ico('shield')}<span class="a-row__main"><span class="a-row__title"><span>${esc(p.title)}</span></span><span class="a-row__meta">${draft ? 'Modèle à faire relire' : (p.body.trim() ? 'Rédigée' : 'Vide')}</span></span>${draft ? H`<span class="a-chip a-chip--line a-tone--warn">${ico('alert')}À relire</span>` : H`<span class="a-pill a-pill--check a-tone--ok">${ico('check')}Prête</span>`}${ico('chev', 'a-row__chev')}</a></li>`;
        })}</ul>` : H`<p class="a-small" style="padding:0 16px 16px">Aucune page légale pour l’instant.</p>`}
        <div class="a-card__foot"><a class="a-btn a-btn--ghost" href="#pages">Gérer toutes les pages</a></div></section>
      <div class="a-note">${ico('info')}<p>Les textes de Jeere sont des modèles, pas des conseils juridiques : faites-les vérifier avant d’ouvrir votre boutique.</p></div>`;
  }

  function setDonnees() {
    return H`<section class="a-card" aria-labelledby="h-exp"><div class="a-card__head"><div><h3 class="a-card__title" id="h-exp">Exporter</h3><p class="a-card__sub">Vos données vous appartiennent : téléchargez-les quand vous voulez.</p></div></div>
        <div class="a-btnrow"><button class="a-btn a-btn--ghost" type="button" data-act="export-fiche"${S.config ? '' : ' disabled'}>${ico('download')}Fiche boutique (JSON)</button><button class="a-btn a-btn--ghost" type="button" data-act="export-csv"${S.admin.orders.length ? '' : ' disabled'}>${ico('download')}Commandes (CSV)</button></div>
        <p class="a-small" style="margin-top:10px">La fiche boutique contient tout votre site, photos comprises. Le fichier des commandes s’ouvre dans Excel ou Google Sheets.</p></section>
      <section class="a-card" aria-labelledby="h-del"><div class="a-card__head"><div><h3 class="a-card__title" id="h-del">Supprimer mon compte</h3><p class="a-card__sub">Efface de ce navigateur votre compte, votre boutique, vos commandes et vos réglages. C’est définitif.</p></div></div>
        <button class="a-btn a-btn--danger" type="button" data-act="delete-account">${ico('trash')}Supprimer mon compte</button></section>`;
  }
  function download(name, mime, text) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    } catch (e) { toast('Le téléchargement n’a pas pu démarrer.'); return false; }
  }
  const fileSlug = () => slugify(storeName()) || 'boutique';
  function exportFiche() {
    if (!S.config) return;
    if (download('fiche-boutique-' + fileSlug() + '.json', 'application/json', JSON.stringify(S.config, null, 2))) toast('Fiche boutique téléchargée.');
  }
  function exportCSV() {
    const q = (v) => { const s = str(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['Commande', 'Date', 'Client', 'Téléphone', 'Commune', 'Adresse', 'Articles', 'Sous-total (FCFA)', 'Livraison (FCFA)', 'Total (FCFA)', 'Paiement', 'Statut', 'Canal', 'Note'];
    const rows = S.admin.orders.slice().sort((a, b) => str(a.date).localeCompare(str(b.date))).map((o) => {
      const c = o.customer || {};
      const d = toDate(o.date);
      const date = d ? d.toISOString().slice(0, 16).replace('T', ' ') : '';
      return [o.id, date, c.name, c.phone, c.commune, c.address, arr(o.items).map((i) => i.qty + ' × ' + i.name).join(' + '), o.subtotal, o.delivery, o.total, payLabel(o.payment), statusLabel(o.status), channelLabel(o.channel), o.note || ''].map(q).join(';');
    });
    // BOM + semicolons: opens cleanly in Excel with French settings
    if (download('commandes-' + fileSlug() + '.csv', 'text/csv;charset=utf-8', '﻿' + [head.join(';')].concat(rows).join('\r\n'))) toast('Commandes téléchargées (données d’exemple).');
  }
  function deleteAccount() {
    const html = H`<form class="a-dialog__card" data-dform="delete" role="alertdialog" aria-labelledby="del-t" aria-describedby="del-d" novalidate>${dlgHead('del-t', 'Supprimer votre compte ?')}
      <div class="a-dialog__body"><p class="a-dialog__lead" id="del-d">Votre compte, votre boutique ${esc(storeName())}, vos produits, vos pages, vos commandes et vos réglages seront effacés de ce navigateur. <strong>C’est définitif.</strong> Pensez à télécharger votre fiche boutique avant.</p>
        <div class="a-field" style="margin-top:16px"><label class="a-label" for="del-in">Pour confirmer, tapez SUPPRIMER</label><input class="a-input" id="del-in" name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" data-autofocus></div></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Garder mon compte</button><button class="a-btn a-btn--primary" type="submit" id="del-go" disabled>${ico('trash')}Supprimer définitivement</button></div></form>`;
    openDialog(html, { labelledby: 'del-t', focus: '#del-in' });
  }
  function doDeleteAccount(form) {
    if (fold(form.elements.confirm.value).trim() !== 'supprimer') { invalid(form.elements.confirm, 'Tapez SUPPRIMER pour confirmer.'); return; }
    [KEYS.config, KEYS.account, KEYS.admin, KEYS.open, KEYS.tour || 'jeere-tour'].forEach(lsDel);
    // the client projects of this browser (projects.js: the list and the projects put aside) go too
    try { Object.keys(window.localStorage).filter((k) => k === 'jeere-projects' || k.indexOf('jeere-project:') === 0).forEach(lsDel); } catch (e) { /* blocked storage */ }
    S.drafts = {};
    clearDirty();
    closeDialog(true);
    loadAll();
    showGate();
    toast('Votre compte et votre boutique ont été effacés de ce navigateur.', { ms: 5000 });
  }

  /* ------------------------------------------------------------------ views registry */

  const VIEWS = {
    accueil: viewHome, commandes: viewOrders, produits: viewProducts, clients: viewClients, boutique: viewBoutique,
    pages: viewPages, promos: viewPromos, paiements: viewPaiements, livraison: viewLivraison, connecteurs: viewConnecteurs, parametres: viewParametres
  };

  /* ------------------------------------------------------------------ GATE */

  function showGate() {
    S.inApp = false;
    S.route = null;
    S.hash = null;
    clearDirty();
    closeAcct();
    closeSearch();
    const app = $('#a-app');
    const gate = $('#a-gate');
    if (app) app.hidden = true;
    if (gate) gate.hidden = false;
    document.body.classList.add('is-gate');
    document.title = 'Connectez-vous · Jeere';
    const acc = S.account;
    const t = $('#a-gate-title');
    const lead = $('#a-gate-lead');
    const p1 = $('#a-gate-primary');
    const p2 = $('#a-gate-secondary');
    const eb = $('#a-gate-eyebrow');
    if (acc && (acc.firstName || acc.phone)) {
      if (eb) eb.textContent = 'Tableau de bord';
      if (t) t.textContent = acc.firstName ? fr('Bon retour, ' + acc.firstName) : 'Bon retour';
      if (lead) lead.textContent = fr('Connectez-vous avec votre numéro' + (acc.phone ? ' ' + phoneFmt(acc.phone) : '') + ' pour gérer ' + ((S.config && S.config.store.name) || acc.storeName || 'votre boutique') + '.');
      if (p1) { p1.textContent = 'Se connecter'; p1.setAttribute('href', COMPTE_URL + '#connexion'); }
      if (p2) { p2.textContent = 'Créer un autre compte'; p2.setAttribute('href', COMPTE_URL + '#inscription'); }
    } else {
      if (t) t.textContent = 'Connectez-vous pour gérer votre boutique';
      if (lead) lead.textContent = fr('Commandes, produits, paiements, livraison : tout votre commerce au même endroit, depuis votre téléphone.');
      if (p1) { p1.textContent = 'Créer un compte'; p1.setAttribute('href', COMPTE_URL + '#inscription'); }
      if (p2) { p2.textContent = 'Se connecter'; p2.setAttribute('href', COMPTE_URL + '#connexion'); }
    }
    // the cover: The Bakery (a picture in index.html); a live store is drawn only if that picture is gone
    let mini = null;
    if (!$('#a-gate-mini .a-mini__shot')) { try { mini = S.config || D.defaultConfig('cocody', 'beauty'); } catch (e) { mini = null; } }
    if (!mini) { const st = $('#a-gate .a-gate__visual'); if (st) st.setAttribute('inert', ''); }
    if (mini && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) {
      const stage = $('#a-gate .a-gate__visual');
      const screen = $('#a-gate-mini .a-mini__screen');
      // the renderer takes over the element it draws into (its class becomes « jst »): it gets its own box,
      // so the screen keeps its size and its rounded corners and the store stays inside the phone
      let host = screen && screen.firstElementChild;
      if (screen && !host) { host = document.createElement('div'); screen.appendChild(host); }
      try { if (host && window.JeereRender) window.JeereRender.render(mini, host, { device: 'phone', page: 'home' }); } catch (e) { /* the visual is a bonus */ }
      if (stage) stage.setAttribute('inert', '');
    }
  }
  async function startDemo() {
    const acc = S.account;
    if (acc && acc.phone && acc.firstName && acc.firstName !== 'Awa') {
      const ok = await confirmBox({ title: 'Ouvrir la démo ?', text: 'Le compte de ' + acc.firstName + ' sur cet appareil sera remplacé par le compte de démo d’Awa. La boutique enregistrée est gardée.', ok: 'Ouvrir la démo' });
      if (!ok) return;
    }
    if (!S.config) {
      let cfg = null;
      try { cfg = D.defaultConfig('cocody', 'beauty'); } catch (e) { cfg = null; }
      if (cfg) saveConfig(cfg);
    }
    S.account = { version: 1, firstName: 'Awa', phone: '+2250707123456', storeName: (S.config && S.config.store.name) || 'Awa Beauté', createdAt: new Date().toISOString(), plan: 'gratuit', loggedIn: true };
    saveAccount();
    // Keep what is in memory (storage may be blocked): only the dashboard's own data is (re)built
    S.now = new Date();
    S.admin = readAdmin().admin;
    saveAdmin(true);
    showApp(true);
    toast('Bienvenue dans la démo. Tout reste dans ce navigateur.');
  }
  function showApp(focus) {
    const app = $('#a-app');
    const gate = $('#a-gate');
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    document.body.classList.remove('is-gate');
    S.inApp = true;
    if (!window.location.hash || window.location.hash === '#') { try { history.replaceState(null, '', '#accueil'); } catch (e) { /* ignore */ } }
    render(parseHash(), !!focus);
    maybeAutoTour();
  }
  function logout() {
    if (S.dirty) { nudgeSave(); return; }
    if (window.JeereTour && window.JeereTour.isOpen()) window.JeereTour.stop('outside');
    if (S.account) { S.account.loggedIn = false; saveAccount(); }
    const more = $('#a-more');
    if (more && more.open) { try { more.close(); } catch (e) { /* ignore */ } }
    document.documentElement.classList.remove('a-locked');
    showGate();
    const t = $('#a-gate-title');
    if (t) t.focus();
    toast('Déconnexion faite sur ce navigateur. À bientôt !');
  }
  async function startExample() {
    if (S.config) return;
    let cfg = null;
    try { cfg = D.defaultConfig('cocody', 'beauty'); } catch (e) { cfg = null; }
    if (!cfg) return;
    const name = S.account && S.account.storeName;
    if (name) {
      const old = cfg.store.name;
      cfg.sections.forEach((s) => { if (s.type === 'hero' && s.settings && typeof s.settings.title === 'string') { const t = s.settings.title.split(old).join(name); s.settings.title = t.length <= 70 ? t : name; } });
      cfg.store.name = name;
    }
    if (S.account && S.account.phone) cfg.store.whatsapp = S.account.phone;
    if (!saveConfig(cfg)) return;
    const r = readAdmin();
    S.admin = r.admin;
    if (!S.admin.orders.length) { try { S.admin.orders = D.demoOrders(S.config, 14, new Date()); S.admin.demoSeeded = true; S.admin.demoFor = demoSig(); } catch (e) { /* ignore */ } }
    if (!S.admin.subdomainChosen && D.subdomainFor) S.admin.settings.subdomain = D.subdomainFor(S.config.store.name);
    saveAdmin();
    refresh();
    focusMain();
    toast('Boutique d’exemple créée : changez-la à votre goût.');
  }

  /* ------------------------------------------------------------------ events */

  const ACTIONS = {
    'skip': (el, e) => { e.preventDefault(); focusMain(); },
    'search-open': () => openSearch(),
    'search-close': () => { closeSearch(); const b = $('.a-top__searchbtn'); if (b) b.focus(); },
    'demo-info': () => openDialog(H`<div class="a-dialog__card">${dlgHead('di-t', 'Ceci est une démo')}<div class="a-dialog__body">
        <p class="a-dialog__lead">Le tableau de bord de Jeere, en prototype. Rien n’est envoyé sur internet : votre compte, votre boutique et vos réglages restent dans ce navigateur.</p>
        <ul class="a-checks" style="margin-top:14px"><li>${ico('check')}<span>Les produits, les pages, les paiements acceptés et la livraison que vous changez ici sont vraiment écrits dans votre boutique : le Studio les montre.</span></li>
          <li>${ico('check')}<span>Les commandes, les clients et les chiffres sont des exemples fabriqués à partir de vos produits.</span></li>
          <li>${ico('check')}<span>Les connecteurs, le domaine, l’équipe et l’abonnement ne connectent, ne vérifient et ne prélèvent rien.</span></li></ul></div>
      <div class="a-dialog__foot"><button class="a-btn a-btn--primary" type="button" data-close data-autofocus>J’ai compris</button></div></div>`, { labelledby: 'di-t' }),
    'more': () => { const m = $('#a-more'); if (!m) return; dlgReturn = document.activeElement; try { m.showModal(); } catch (e) { m.setAttribute('open', ''); } document.documentElement.classList.add('a-locked'); },
    'logout': () => logout(),
    'view-store': () => (EXT() ? window.open(EXT().site, '_blank', 'noopener') : customSite() ? window.open(customSite().live, '_blank', 'noopener') : openEditor({ page: 'home', view: 'preview' })),
    'open-editor': (el, e) => { e.preventDefault(); if (customSite()) { window.location.href = '../studio/sites/#/site/' + customSite().site; return; } openEditor({ page: el.getAttribute('data-page') || 'home', pageId: el.getAttribute('data-page-id'), productId: el.getAttribute('data-product-id'), focus: el.getAttribute('data-focus') }); },
    'discard': () => { const h = S.hash; clearDirty(); if (S.drafts[h]) delete S.drafts[h]; refresh(); focusMain(); toast('Modifications ignorées.'); },
    'save': () => { const f = dirtyForm(); if (f) { if (typeof f.requestSubmit === 'function') f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); } },
    'start-example': () => startExample(),
    'help': () => openHelp(),
    'publish': () => openPublish(),
    'check-all': () => { S.checkOpen = !S.checkOpen; refresh('[data-act="check-all"]'); },
    'checklist-hide': () => setChecklistHidden(true),
    'checklist-show': () => setChecklistHidden(false),
    'tour-replay': () => {
      closeDialog(true);
      const later = !S.route || S.route.name !== 'accueil';
      if (later) go('accueil');
      setTimeout(() => { if (!startTour()) toast('La visite guidée n’a pas pu se charger. Rechargez la page.'); }, later ? 150 : 0);
    },
    'use-my-wa': () => useMyWhatsapp(),
    'share-store': () => shareStore(),
    'projects': (el) => openProjects(el),
    'proj-switch': (el) => switchProject(el.getAttribute('data-id')),
    'proj-shop': (el) => openShopProject(el),
    'stripe-connect': (el) => stripeConnect(el),
    'stripe-dashboard': () => stripeDashboard(),
    'proj-ext': () => { if (S.dirty) { closeProj(); nudgeSave(); return; } closeProj(); closeDialog(true); window.JeereTishe.enter(); go('#accueil'); updateShell(); render(parseHash(), true); },
    'proj-new': () => openNewProject(),
    'proj-manage': () => openProject(),
    'proj-copy': () => copyPreview(),
    'proj-invite': () => openInvite(),
    'proj-cancel-invite': (el) => cancelProjInvite(el),
    'proj-remove-agency': () => removeAgencyAccess(),
    'share-product': (el) => shareProduct(el.getAttribute('data-id')),
    'share-copy': (el) => copyLink(el.getAttribute('data-url')),
    'share-native': (el) => nativeShare(el),
    'order-new': () => openNewOrder(),
    'orders-more': () => ordersMore(),
    'demo-clear': () => clearDemoOrders(),
    'no-qty': (el) => stepQty(el),
    'order-more': (el) => orderMore(el.getAttribute('data-id')),
    'order-confirm-ask': (el) => askConfirm(el.getAttribute('data-id')),
    'order-confirmed': (el) => markConfirmed(el.getAttribute('data-id')),
    'order-handoff': (el) => handoff(el.getAttribute('data-id')),
    'order-cash': (el) => cashIn(el.getAttribute('data-id')),
    'courier-send': (el) => sendToCourier(el.getAttribute('data-id')),
    'couriers': (el, e) => { if (e) e.preventDefault(); openCouriers(); },
    'courier-del': (el) => removeCourier(el.getAttribute('data-phone')),
    'deposit-ask': (el) => openDeposit(el.getAttribute('data-id')),
    'deposit-paid': (el) => depositPaid(el.getAttribute('data-id')),
    'product-nophoto': () => { S.productNoPhoto = !S.productNoPhoto; refresh('[data-act="product-nophoto"]'); },
    'conn-jump': (el) => jumpTo(el.getAttribute('data-cat')),
    'promo-del': (el) => deletePromo(parseInt(el.getAttribute('data-i'), 10)),
    'promo-share': (el) => sharePromo(parseInt(el.getAttribute('data-i'), 10)),
    'order-filter': (el) => { S.orderFilter = el.getAttribute('data-f'); updateOrdersList(); },
    'order-status': (el) => setOrderStatus(el.getAttribute('data-id'), el.getAttribute('data-status')),
    'order-cancel': (el) => cancelOrder(el.getAttribute('data-id')),
    'order-print': (el) => printOrder(el.getAttribute('data-id')),
    'export-csv': () => exportCSV(),
    'export-fiche': () => exportFiche(),
    'product-view': (el) => { S.admin.prefs.productView = el.getAttribute('data-mode') === 'grid' ? 'grid' : 'list'; saveAdmin(true); refresh('[data-act="product-view"][data-mode="' + S.admin.prefs.productView + '"]'); },
    'product-more': (el) => productActions(el.getAttribute('data-id')),
    'product-dup': (el) => { if (S.dirty) { nudgeSave(); return; } duplicateProduct(el.getAttribute('data-id')); },
    'product-del': (el) => deleteProduct(el.getAttribute('data-id')),
    'product-view-store': (el) => openEditor({ page: 'product', productId: el.getAttribute('data-id'), view: 'preview' }),
    // her photo first (a demo photo still set shows again), else the demo photo
    'photo-remove': (el) => { const f = el.closest('form'); if (!f) return; if (f.elements.image.value) f.elements.image.value = ''; else if (f.elements.photo) f.elements.photo.value = ''; productFormLive(f); setDirty(f); const b = $$('.a-filebtn input', f).find((x) => visible(x.closest('.a-filebtn'))); if (b) b.focus(); },
    'intensity': (el) => setIntensity(el.getAttribute('data-v')),
    'page-move': (el) => movePage(el.getAttribute('data-id'), parseInt(el.getAttribute('data-dir'), 10) || 1),
    'page-more': (el) => pageActions(el.getAttribute('data-id')),
    'page-del': (el) => deletePage(el.getAttribute('data-id')),
    'page-view': (el) => openEditor({ page: 'page', pageId: el.getAttribute('data-id'), view: 'preview' }),
    'page-reset': (el) => resetPageBody(el.getAttribute('data-id')),
    'pages-defaults': () => restoreDefaultPages(),
    'zone-add': () => { const row = addZone(); const f = $('#a-main form[data-form="zones"]'); if (f) setDirty(f); if (row) $('input', row).focus(); },
    'zone-del': (el) => {
      const row = el.closest('.a-zone');
      const f = el.closest('form');
      if (!row) return;
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      if (f) setDirty(f);
      const t = next ? $('[data-act="zone-del"]', next) : $('[data-act="zone-add"]');
      if (t) t.focus();
    },
    'zones-fill': () => {
      const f = $('#a-main form[data-form="zones"]');
      if (!f) return;
      const have = {};
      $$('[name="zname"]', f).forEach((i) => { have[fold(i.value.trim())] = true; });
      let n = 0;
      arr(D.communes).forEach((c) => { if (!have[fold(c.name)]) { addZone(c.name, c.fee); n++; } });
      // Drop empty rows left behind
      $$('.a-zone', f).forEach((row) => { if (!$('[name="zname"]', row).value.trim() && !$('[name="zfee"]', row).value.trim()) row.remove(); });
      if (n) { setDirty(f); toast(plural(n, 'commune ajoutée', 'communes ajoutées') + ', avec les frais habituels. Ajustez-les puis enregistrez.'); } else toast('Toutes les communes d’Abidjan sont déjà là.');
    },
    'connector-open': (el) => openConnector(el.getAttribute('data-id')),
    'connector-off': (el) => disconnect(el.getAttribute('data-id')),
    'connector-notify': (el) => { S.admin.notify[el.getAttribute('data-id')] = true; saveAdmin(); refresh('[data-act="connector-notify"][data-id="' + el.getAttribute('data-id') + '"]'); toast('C’est noté : nous vous prévenons sur WhatsApp dès qu’il est prêt (démo).'); },
    'domain-verify': () => toast('Démo : la vérification du domaine n’est pas faite dans ce prototype. Dans Jeere, elle se fait toute seule.', { ms: 5000 }),
    'domain-remove': async () => {
      const d = S.admin.settings.customDomain;
      const ok = await confirmBox({ title: 'Retirer ' + d + ' ?', text: 'Votre boutique reste sur ' + subdomain() + '.', ok: 'Retirer le domaine' });
      if (!ok) { focusMain(); return; }
      S.admin.settings.customDomain = '';
      if (isOn('domain')) S.admin.connectors.domain.status = 'off';
      saveAdmin(); refresh('#d-cust'); toast('Domaine retiré.');
    },
    'team-remove': (el) => removeMember(parseInt(el.getAttribute('data-i'), 10)),
    'plan': (el) => choosePlan(el.getAttribute('data-v')),
    'billing-portal': () => { Promise.resolve(window.JeereBilling && window.JeereBilling.portal()).then((x) => { if (x && !x.ok) toast(x.message || 'Votre espace de paiement n’a pas pu s’ouvrir.'); }); },
    'cycle': (el) => { const v = el.getAttribute('data-v') === 'semaine' ? 'semaine' : 'mois'; if (S.admin.settings.billing.cycle === v) return; S.admin.settings.billing.cycle = v; saveAdmin(); refresh('[data-act="cycle"][data-v="' + v + '"]'); toast(v === 'semaine' ? 'Paiement à la semaine choisi' + (realBilling() ? ' : il s’applique à votre prochain abonnement.' : ' (démo).') : 'Paiement au mois choisi' + (realBilling() ? ' : il s’applique à votre prochain abonnement.' : ' (démo).')); },
    'pause': async () => {
      const b = S.admin.settings.billing;
      if (!b.paused) {
        const ok = await confirmBox({ title: 'Mettre l’abonnement en pause ?', text: 'Rien n’est prélevé pendant la pause. Vous reprenez quand vous voulez, en un clic.', ok: 'Mettre en pause' });
        if (!ok) { focusMain(); return; }
      }
      b.paused = !b.paused; saveAdmin(); refresh('[data-act="pause"]'); toast(b.paused ? 'Abonnement en pause (démo).' : 'Abonnement repris (démo).');
    },
    'stripe-tab': (el) => stripeTab(el.getAttribute('data-v')),
    'pay-mm': () => payMobileMoney(),
    'studio-trial': () => studioTrial(),
    'studio-cancel': () => studioCancel(),
    'studio-resume': () => studioResume(),
    'studio-monthly': () => studioMonthly(),
    'studio-seat': (el) => studioSeat(el),
    'studio-member-del': (el) => studioMemberDel(el),
    'delete-account': () => deleteAccount()
  };

  const FORMS = { product: saveProductForm, prefs: savePrefsForm, page: savePageForm, zones: saveZonesForm, subdomain: saveSubdomainForm, domain: saveDomainForm, invite: saveInviteForm, promo: savePromoForm, studiomember: saveStudioMember };
  const DFORMS = { newproject: saveNewProject, projinvite: saveProjInvite, connector: saveConnectorForm, paymm: savePayForm, delete: doDeleteAccount, neworder: saveNewOrderForm, courier: saveCourierForm, fail: saveFailForm, deposit: saveDepositForm };

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    // « Envoyer sur WhatsApp » in the share sheet: the « Premiers pas » step is done (the link opens WhatsApp)
    if (t.closest('[data-share-wa]')) markShared();
    // Account menu: outside click closes it
    const acctBtn = t.closest('#a-acct-btn');
    if (acctBtn) { toggleAcct(); return; }
    if (!t.closest('#a-acct-menu')) closeAcct();
    if (!t.closest('#a-proj-menu') && !t.closest('#a-proj-btn')) closeProj();
    // Desktop search: a click elsewhere closes the results
    if (!t.closest('#a-search') && !t.closest('[data-act="search-open"]')) { const p = $('#a-search-results'); if (p && !$('#a-search').classList.contains('is-open')) p.hidden = true; }
    // Dialog close buttons
    const close = t.closest('[data-close]');
    if (close) {
      const dlg = close.closest('dialog');
      if (dlg && dlg.id === 'a-more') { try { dlg.close(); } catch (err) { dlg.removeAttribute('open'); } return; }
      closeDialog(); return;
    }
    const a = t.closest('[data-act]');
    if (a && ACTIONS[a.getAttribute('data-act')]) {
      if (a.disabled) return;
      if (a.closest('#a-more')) { dlgReturn = null; try { $('#a-more').close(); } catch (err) { /* ignore */ } }
      ACTIONS[a.getAttribute('data-act')](a, e);
      return;
    }
    // Links inside the « Plus » sheet, the search results and action sheets: close what is open
    const link = t.closest('a[href^="#"]');
    if (link) {
      const more = link.closest('#a-more');
      if (more) { dlgReturn = null; try { more.close(); } catch (err) { more.removeAttribute('open'); } }
      if (link.closest('#a-dialog')) closeDialog(true);
      if (link.closest('#a-search')) closeSearch();
      if (link.closest('#a-acct-menu')) closeAcct();
      // Same address: render again (e.g. the search result of the page in view)
      if (link.getAttribute('href') === window.location.hash && S.inApp) { e.preventDefault(); render(parseHash(), true); }
      return;
    }
    // Order table rows: the whole row opens the order
    const tr = t.closest('tr[data-href]');
    if (tr && !t.closest('a, button')) go(tr.getAttribute('data-href'));
  }
  function onSubmit(e) {
    const f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    e.preventDefault();
    const key = f.getAttribute('data-form');
    const dk = f.getAttribute('data-dform');
    try {
      if (key && FORMS[key]) FORMS[key](f);
      else if (dk && DFORMS[dk]) DFORMS[dk](f);
    } catch (err) { toast('Cela n’a pas pu être enregistré. Réessayez.'); }
  }
  function onInput(e) {
    const t = e.target;
    if (!t || !t.closest || S.rendering) return;
    if (t.id === 'a-search-input') { renderSearch(); return; }
    const s = t.getAttribute('data-search');
    if (s === 'orders') { S.orderQuery = t.value; updateOrdersList(); return; }
    if (s === 'products') { S.productQuery = t.value; const b = $('#a-plist'); if (b) b.innerHTML = productsListHTML(); return; }
    if (s === 'customers') { S.customerQuery = t.value; const b = $('#a-clist'); if (b) b.innerHTML = customersListHTML(''); return; }
    if (t.hasAttribute('data-count')) updateCount(t);
    const dlgForm = t.closest('form[data-dform="delete"]');
    if (dlgForm) { const go2 = $('#del-go'); if (go2) go2.disabled = fold(t.value).trim() !== 'supprimer'; return; }
    const nf = t.closest('form[data-dform="neworder"]');
    if (nf) { if (t.getAttribute('aria-invalid') === 'true') { t.removeAttribute('aria-invalid'); const err = document.getElementById(t.id + '-err'); if (err) err.remove(); } if (t.name === 'fee' || /^q-/.test(t.name)) newOrderTotals(nf); return; }
    const form = t.closest('#a-main form[data-form]');
    if (!form) return;
    if (t.getAttribute('aria-invalid') === 'true') { t.removeAttribute('aria-invalid'); const err = document.getElementById(t.id + '-err'); if (err) err.remove(); }
    if (form.hasAttribute('data-light')) return;
    if (form.getAttribute('data-form') === 'page') pageFormLive(form, t.name === 'title' ? 'title' : (t.name === 'slug' ? 'slug' : ''));
    setDirty(form);
  }
  function onChange(e) {
    const t = e.target;
    if (!t || !t.closest || S.rendering) return;
    if (t.hasAttribute('data-photo')) { onPhoto(t); return; }
    if (t.hasAttribute('data-pay')) { togglePayment(t); return; }
    if (t.hasAttribute('data-navpage')) { toggleNav(t); return; }
    if (t.hasAttribute('data-notif')) { toggleNotif(t); return; }
    if (t.hasAttribute('data-projstatus')) { setProjStatus(t); return; }
    if (t.hasAttribute('data-courier')) { setCourier(t); return; }
    if (t.hasAttribute('data-promo')) { const x = S.admin.promos[parseInt(t.getAttribute('data-promo'), 10)]; if (x) { x.active = t.checked; saveAdmin(); refresh('[data-promo="' + t.getAttribute('data-promo') + '"]'); toast('Code ' + x.code + (x.active ? ' actif.' : ' en pause.')); } return; }
    if (t.id === 'no-commune') { const f = t.closest('form'); const o = t.options[t.selectedIndex]; if (f && o) { f.elements.fee.value = number(Number(o.getAttribute('data-fee')) || 0); newOrderTotals(f); } return; }
    if (t.hasAttribute('data-lang')) { S.admin.settings.language = t.value === 'en' ? 'en' : 'fr'; saveAdmin(); toast(t.value === 'en' ? 'Boutique en anglais : bientôt. Le tableau de bord reste en français dans ce prototype.' : 'Boutique en français.', { ms: 4500 }); return; }
    const form = t.closest('#a-main form[data-form]');
    if (!form || form.hasAttribute('data-light')) return;
    if (form.getAttribute('data-form') === 'product' && (t.name === 'color' || t.name === 'art')) productFormLive(form);
    if (form.getAttribute('data-form') === 'page' && t.name === 'slug') { t.value = slugify(t.value); pageFormLive(form, 'slug'); }
    setDirty(form);
  }
  function onKeydown(e) {
    const t = e.target;
    if (e.key === 'Escape') {
      if (closeSearch(false)) { const b = $('.a-top__searchbtn'); if (b && b.getClientRects().length) b.focus(); else { const i = $('#a-search-input'); if (i) i.blur(); } e.preventDefault(); return; }
      const m = $('#a-acct-menu');
      if (m && !m.hidden) { closeAcct(); const b = $('#a-acct-btn'); if (b) b.focus(); return; }
      const pm = $('#a-proj-menu');
      if (pm && !pm.hidden) { closeProj(); const b = $('#a-proj-btn'); if (b) b.focus(); return; }
      if (t && t.id === 'a-search-input') { closeSearch(); t.blur(); }
      return;
    }
    // Search: arrows move through the results
    const inSearch = t && t.closest && t.closest('#a-search');
    if (inSearch && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = $$('#a-search-results .a-sres__item');
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(t);
      const n = e.key === 'ArrowDown' ? (i < 0 ? 0 : Math.min(items.length - 1, i + 1)) : (i <= 0 ? -1 : i - 1);
      if (n < 0) $('#a-search-input').focus(); else items[n].focus();
      return;
    }
    if (t && t.id === 'a-search-input' && e.key === 'Enter') {
      const first = $('#a-search-results .a-sres__item');
      if (first) { e.preventDefault(); first.click(); }
      return;
    }
    // « / » focuses the search on desktop
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && S.inApp && !(t && t.closest && t.closest('input, textarea, select, [contenteditable]')) && !$('dialog[open]')) {
      const i = $('#a-search-input');
      if (i && i.getClientRects().length) { e.preventDefault(); i.focus(); }
      return;
    }
    // Ctrl/Cmd + S saves the form in view
    if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 's' && S.dirty) { e.preventDefault(); ACTIONS.save(); }
    // Account menu: arrows between items
    const menu = t && t.closest && t.closest('#a-acct-menu');
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = $$('.a-menu-item, .a-acct__plan a', menu);
      const i = items.indexOf(t);
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }

  // Changes made in another tab (the editor, the account page) or after coming back from the editor
  function syncFromStorage() {
    const raws = { config: lsGet(KEYS.config), account: lsGet(KEYS.account), admin: lsGet(KEYS.admin) };
    if (raws.config === S.raw.config && raws.account === S.raw.account && raws.admin === S.raw.admin) return;
    loadAll();
    if (!isIn()) { if (S.inApp) showGate(); else showGate(); return; }
    if (!S.inApp) { showApp(false); return; }
    if (S.dirty) { toast('Votre boutique a été modifiée ailleurs. Enregistrez ou ignorez vos modifications pour voir la dernière version.', { ms: 5000 }); updateShell(); return; }
    refresh();
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    const boot = $('#a-boot');
    if (!D || typeof D.normalizeConfig !== 'function') {
      if (boot) boot.hidden = true;
      const gate = $('#a-gate');
      if (gate) { gate.hidden = false; const t = $('#a-gate-title'); if (t) t.textContent = 'Le tableau de bord n’a pas pu se charger'; const l = $('#a-gate-lead'); if (l) l.textContent = 'Rechargez la page. Si cela continue, revenez plus tard.'; }
      return;
    }
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('error', onImgError, true); // load errors do not bubble
    window.addEventListener('hashchange', () => { if (S.inApp) render(parseHash(), true); });
    window.addEventListener('storage', (e) => { if (!e.key || e.key === KEYS.config || e.key === KEYS.account || e.key === KEYS.admin) syncFromStorage(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) syncFromStorage(); });
    // The Studio subscription lives in the account: keep the copy in memory equal to what was saved
    if (window.JeerePlans) window.JeerePlans.onChange(() => { if (S.account) { const a = readAccount(); if (a) S.account = a; } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncFromStorage(); });
    window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('jeere:published', (e) => {
      const d = e && e.detail;
      if (!S.admin || !d || !d.slug || !D.storeAddress) return;
      S.admin.settings.subdomain = D.storeAddress(d.slug);
      S.admin.subdomainChosen = true;
      saveAdmin();
    });
    window.addEventListener('afterprint', clearSlip);
    const gd = $('#a-gate-demo');
    if (gd) gd.addEventListener('click', startDemo);
    // Back from Stripe (the `billing` function): ?abonnement=ok|annule, ?domaine=ok|annule. The plan comes from the server.
    const back = /[?&](abonnement|domaine)=(ok|annule)/.exec(window.location.search);
    if (back) {
      try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) { /* keep */ }
      const ok = back[2] === 'ok';
      setTimeout(() => toast(back[1] === 'abonnement'
        ? (ok ? 'Paiement reçu, merci ! Votre nouvelle formule s’active dans quelques secondes.' : 'Paiement annulé : rien n’a été prélevé.')
        : (ok ? 'Paiement reçu ! Jeere achète votre domaine et le relie à votre boutique : comptez quelques minutes.' : 'Paiement annulé : aucun domaine n’a été acheté.'), { ms: 8000 }), 600);
      if (ok) [500, 4000, 10000].forEach((ms) => setTimeout(() => { Promise.resolve(window.JeereBilling && window.JeereBilling.sync ? window.JeereBilling.sync() : null).then(() => { try { S.account = readAccount(); } catch (e) { /* keep */ } refresh(); }, () => {}); }, ms));
    } else if (window.JeereBilling && window.JeereBilling.sync) {
      // a payment the webhook has not brought yet
      Promise.resolve(window.JeereBilling.sync()).then((j) => { if (j && j.applied) { try { S.account = readAccount(); } catch (e) { /* keep */ } refresh(); } }, () => {});
    }
    // « Gérer la boutique » from Mes sites on one of her own designs: #boutique=<slug> opens its Jeere store here
    const bm = /[#&]boutique=([a-z0-9-]+)/.exec(window.location.hash || '');
    if (bm && CUSTOM[bm[1]]) {
      const shop = founder() ? MY_SHOPS.find((x) => x.slug === bm[1]) : null;
      try { history.replaceState(null, '', window.location.pathname + window.location.search + '#accueil'); } catch (e) { /* ignore */ }
      if (shop) setTimeout(() => openShopProject({ getAttribute: (k) => (k === 'data-name' ? shop.name : k === 'data-slug' ? shop.slug : null) }), 0);
    }
    // Dialogs: Esc and the backdrop close them
    [dialogEl(), $('#a-more')].forEach((dlg) => {
      if (!dlg) return;
      dlg.addEventListener('click', (e) => { if (e.target === dlg) { if (dlg.id === 'a-more') { try { dlg.close(); } catch (err) { /* ignore */ } } else closeDialog(); } });
      dlg.addEventListener('close', () => {
        // The close event comes a moment later: ignore it when another dialog has opened since
        if (dlg.open) return;
        if (dlg.id === 'a-more') afterDialogClose(false);
        else if (dlgOnClose || dlgReturn) { const cb = dlgOnClose; dlgOnClose = null; afterDialogClose(false); if (cb) { try { cb(); } catch (err) { /* ignore */ } } }
      });
    });
    // On the phone, hide the bottom bar while the keyboard is open (more room to type)
    const vv = window.visualViewport;
    const viewH = () => (vv ? vv.height : window.innerHeight);
    let baseH = viewH();
    const typing = () => {
      const a = document.activeElement;
      const field = a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select');
      document.documentElement.classList.toggle('is-typing', !!field && window.innerWidth < 960 && viewH() < baseH - 120);
    };
    (vv || window).addEventListener('resize', () => { if (!document.activeElement || document.activeElement === document.body) baseH = Math.max(baseH, viewH()); typing(); });
    window.addEventListener('orientationchange', () => { setTimeout(() => { baseH = viewH(); typing(); }, 400); });
    document.addEventListener('focusin', typing);
    document.addEventListener('focusout', () => setTimeout(typing, 50));

    // Client projects (../creer/projects.js): a refresh that changed the store in view (her access was
    // removed, a new device) reads everything again; another tab's switch arrives with the shared keys
    window.addEventListener('jeere:project', () => {
      if (!S.inApp) return;
      const raw = lsGet(KEYS.config);
      if (raw !== S.raw.config) afterProjectChange(''); else updateShell();
    });
    window.addEventListener('storage', (e) => { if (e.key === 'jeere-projects' && S.inApp) updateShell(); });

    if (PJ()) PJ().ensure();
    loadAll();
    if (boot) boot.hidden = true;
    if (isIn()) showApp(false); else showGate();
    if (PJ() && isIn()) {
      const n = PJ().takeNotice();
      if (n) toast('Vous avez maintenant accès à ' + listFr(n.names) + '.', { ms: 7000, tone: 'ok' });
      PJ().refresh().then((r) => {
        if (r && r.lost) toast('Vous n’avez plus accès à ' + projName(r.lost) + '.', { ms: 6000, tone: 'info' });
        // A store just handed over to her opens at once
        const id = n && Array.isArray(n.ids) ? n.ids[0] : '';
        const cur = projCurrent();
        if (id && PJ().get(id) && (!cur || cur.id !== id) && !S.dirty) {
          PJ().switchTo(id).then((sw) => { if (sw.ok) afterProjectChange(''); });
          return;
        }
        if (S.inApp) updateShell();
      }, () => { /* offline: the list on this device */ });
    }
  }

  window.JeereAdmin = {
    go,
    ui: { toast: (m) => toast(m), confirmBox: (o) => confirmBox(o), refresh: () => { if (S.inApp) { updateShell(); refresh(); } }, go: (h) => go(h) },
    state: () => S,
    startTour,
    reload: () => { loadAll(); if (isIn()) showApp(false); else showGate(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
