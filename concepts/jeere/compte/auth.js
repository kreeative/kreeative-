/* Jeere — real seller accounts on Supabase Auth, and the bridge to localStorage 'jeere-account'.
 *
 * Loaded (classic script, deferred) by ../compte/ and by every page that reads the account
 * (../creer/, ../admin/, ../studio/, ../abonnements/). No build, no import: supabase-js is loaded
 * on demand from a pinned jsDelivr build with Subresource Integrity, only when it is needed (the
 * account page in real mode, or another page while a real session is open). Demo visitors and
 * the offline prototype never download it.
 *
 * Modes
 *   real   the code goes out for real: e-mail (Supabase's mailer), SMS or WhatsApp (when an SMS
 *          provider is configured in the Supabase dashboard). The account lives in public.profiles.
 *   demo   nothing leaves the browser, any code of 6+ digits works (« Mode démo » on the screen).
 *          Forced with ?demo=1; the default on localhost / 127.0.0.1 / file: (tests, offline work;
 *          add ?demo=0 to use Supabase locally); and the fallback when Supabase cannot be reached.
 *
 * The bridge: after a real login the profile row is written to 'jeere-account' in the same shape
 * as before ({ version: 1, firstName, phone, storeName, createdAt, plan, loggedIn, studio? }) plus
 * email, userId and method, so the editor, the dashboard, the Studio and the plans keep working
 * unchanged. Every change those pages make to the account (store name, number, log-out) is sent back
 * to public.profiles (first_name, phone, store_name): a snapshot of what the server has
 * ('jeere-auth-sync') says what changed. The plan and the Studio subscription are the server's (wave 2):
 * the `studio-plan` Edge Function reads them, starts the trial and, in demo billing only, keeps what the
 * demo checkout made (syncPlan); its answer overwrites the local copy. A log-out or a removed
 * account ends the Supabase session too.
 *
 * window.JeereAuth = { isDemo, why, forceDemo, probe, sendCode, verifyCode, session, completeLogin,
 *   saveProfile, syncNow, signOut, describeError, maskEmail, CONFIG }.
 */
(function () {
  'use strict';

  var root = window;
  var doc = document;

  var CONFIG = {
    url: 'https://aezchxfvzfoqlvzchqyk.supabase.co',
    key: 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w', // publishable: safe in the browser, RLS does the rest
    sdk: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
    sri: 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o',
    storageKey: 'sb-aezchxfvzfoqlvzchqyk-auth-token', // where supabase-js keeps the session
    timeoutMs: 9000
  };
  var D = root.JEERE_DATA || {};
  var ACCOUNT_KEY = (D.STORAGE_KEYS && D.STORAGE_KEYS.account) || 'jeere-account';
  var SYNC_KEY = 'jeere-auth-sync'; // { userId, data: { first_name, phone, store_name, plan, studio } } = what the server has
  var SETTINGS_KEY = 'jeere-auth-settings'; // sessionStorage: the providers this project offers (GET /auth/v1/settings)
  var PLANS = ['gratuit', 'essentiel', 'pro', 'business'];
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var NB = ' ';

  /* ------------------------------------------------------------------ small helpers */

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { root.localStorage.removeItem(k); } catch (e) { /* blocked */ } }
  function ssGet(k) { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { root.sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  function parse(raw) { if (!raw) return null; try { var o = JSON.parse(raw); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
  function clip(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function query(name) {
    var q = '';
    try { q = root.location.search || ''; } catch (e) { q = ''; }
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(q);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function withTimeout(p, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { var e = new Error((label || 'request') + ' timed out'); e.name = 'TimeoutError'; reject(e); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function normAccount(raw) {
    if (typeof D.normalizeAccount === 'function') { try { return D.normalizeAccount(raw); } catch (e) { return null; } }
    return parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
  }
  function readAccount() { var raw = lsGet(ACCOUNT_KEY); return raw ? normAccount(raw) : null; }
  function writeAccount(acc) {
    var clean = normAccount(acc) || acc;
    return lsSet(ACCOUNT_KEY, JSON.stringify(clean)) ? clean : null;
  }

  /* ------------------------------------------------------------------ the mode */

  function isLocalHost() {
    var h = '', p = '';
    try { h = root.location.hostname || ''; p = root.location.protocol || ''; } catch (e) { return true; }
    return p === 'file:' || !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || /\.local$/.test(h);
  }
  var state = (function () {
    var flag = query('demo');
    if (flag === '1' || flag === 'oui') return { demo: true, why: 'flag' };
    if (flag === '0' || flag === 'non') return { demo: false, why: '' };
    if (isLocalHost()) return { demo: true, why: 'local' };
    return { demo: false, why: '' };
  })();
  state.providers = { email: true, sms: true, whatsapp: true };

  function isDemo() { return state.demo; }
  function why() { return state.why; }
  function forceDemo(reason) { state.demo = true; state.why = reason || 'offline'; }

  /* ------------------------------------------------------------------ supabase-js, on demand */

  var sdkP = null;
  function loadSdk() {
    if (root.supabase && typeof root.supabase.createClient === 'function') return Promise.resolve(root.supabase);
    if (sdkP) return sdkP;
    sdkP = withTimeout(new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = CONFIG.sdk;
      s.integrity = CONFIG.sri;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.async = true;
      s.onload = function () { root.supabase && root.supabase.createClient ? resolve(root.supabase) : reject(new Error('supabase-js did not load')); };
      s.onerror = function () { reject(new Error('supabase-js could not be downloaded')); };
      (doc.head || doc.documentElement).appendChild(s);
    }), CONFIG.timeoutMs, 'supabase-js');
    sdkP.catch(function () { sdkP = null; });
    return sdkP;
  }
  var clientP = null;
  function client() {
    if (clientP) return clientP;
    clientP = loadSdk().then(function (sb) {
      return sb.createClient(CONFIG.url, CONFIG.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: CONFIG.storageKey }
      });
    });
    clientP.catch(function () { clientP = null; });
    return clientP;
  }

  // Which ways of sending a code this project offers, from the public settings endpoint
  // ({ external: { email, phone }, sms_provider }): WhatsApp needs Twilio or Twilio Verify.
  function fetchSettings() {
    var cached = parse(ssGet(SETTINGS_KEY));
    if (cached && cached.at && Date.now() - cached.at < 10 * 60e3) return Promise.resolve(cached.p);
    return withTimeout(fetch(CONFIG.url + '/auth/v1/settings', { headers: { apikey: CONFIG.key } }), 6000, 'settings')
      .then(function (r) { if (!r.ok) throw new Error('settings ' + r.status); return r.json(); })
      .then(function (s) {
        var ext = isObj(s.external) ? s.external : {};
        var phone = ext.phone === true;
        var p = {
          email: ext.email !== false,
          sms: phone,
          whatsapp: phone && /^twilio(_verify)?$/.test(String(s.sms_provider || '')),
          signup: s.disable_signup !== true
        };
        ssSet(SETTINGS_KEY, JSON.stringify({ at: Date.now(), p: p }));
        return p;
      });
  }

  // Real mode only: load the library and read the settings. Unreachable → demo (« Mode démo », why = offline).
  var probeP = null;
  function probe() {
    if (state.demo) return Promise.resolve(info());
    if (probeP) return probeP;
    var offline = false;
    try { offline = root.navigator && root.navigator.onLine === false; } catch (e) { offline = false; }
    if (offline) { forceDemo('offline'); return Promise.resolve(info()); }
    probeP = Promise.all([client(), fetchSettings()]).then(function (r) {
      state.providers = r[1];
      return info();
    }, function () {
      forceDemo('offline');
      return info();
    });
    probeP.then(function () { probeP = null; });
    return probeP;
  }
  function info() { return { demo: state.demo, why: state.why, providers: state.providers }; }

  /* ------------------------------------------------------------------ errors, in plain French */

  // { kind, text } for an error from supabase-js (AuthApiError: status, code, message) or fetch.
  // kind: 'provider' (SMS / WhatsApp not configured), 'network', 'rate', 'invalid' (address or
  // number refused), 'nouser' (login with an address that has no account), 'code' (wrong or
  // expired code), 'closed' (sign-ups disabled), 'mail' (the mailer refuses this address), 'other'.
  function describeError(err, method) {
    var code = String((err && (err.code || err.error_code)) || '');
    var msg = String((err && (err.message || err.msg)) || '');
    var status = Number(err && err.status) || 0;
    var by = method === 'whatsapp' ? 'WhatsApp' : 'SMS';
    var byPhrase = method === 'whatsapp' ? 'sur WhatsApp' : 'par SMS';
    if (code === 'phone_provider_disabled' || code === 'sms_send_failed' || /unsupported phone provider|phone.*(disabled|not enabled)|sms provider|twilio|messagebird|vonage|textlocal|whatsapp/i.test(msg)) {
      return { kind: 'provider', text: 'Les codes ' + byPhrase + ' ne sont pas encore activés sur Jeere. Recevez votre code par e-mail pour l’instant' + NB + ': c’est gratuit et ça marche tout de suite.', by: by };
    }
    if (err && (err.name === 'TimeoutError' || err.name === 'AuthRetryableFetchError' || /failed to fetch|fetch failed|networkerror|load failed|network request failed|timed out|could not be downloaded|did not load/i.test(msg))) {
      return { kind: 'network', text: 'Pas de connexion avec Jeere. Vérifiez votre connexion Internet, puis réessayez.' };
    }
    if (status === 429 || /rate.?limit|over_.*rate|too many/i.test(code + ' ' + msg)) {
      if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg)) {
        return { kind: 'rate', text: 'Trop d’e-mails envoyés en peu de temps. Patientez quelques minutes avant de redemander un code.' };
      }
      if (/(\d+)\s*seconds?/i.test(msg)) {
        var s = /(\d+)\s*seconds?/i.exec(msg)[1];
        return { kind: 'rate', text: 'Un code vient d’être envoyé. Vous pourrez en demander un autre dans ' + s + NB + 'secondes.' };
      }
      return { kind: 'rate', text: 'Trop de demandes. Patientez une minute avant de redemander un code.' };
    }
    if (code === 'otp_expired' || /token has expired|invalid.*(token|otp)|otp.*(invalid|expired)/i.test(msg) || (status === 403 && /token|otp/i.test(msg))) {
      return { kind: 'code', text: 'Ce code est incorrect ou a expiré. Vérifiez les chiffres, ou demandez un nouveau code.' };
    }
    if (code === 'otp_disabled' || /signups not allowed for otp|user not found/i.test(msg)) {
      return { kind: 'nouser', text: 'Aucun compte Jeere avec cette adresse.' };
    }
    if (code === 'signup_disabled' || /signups? (are )?disabled|signups not allowed/i.test(msg)) {
      return { kind: 'closed', text: 'Les inscriptions sont fermées pour le moment. Réessayez bientôt.' };
    }
    if (code === 'email_address_not_authorized') {
      return { kind: 'mail', text: 'Jeere ne peut pas encore envoyer d’e-mail à cette adresse (envoi en cours de configuration). Réessayez plus tard ou utilisez une autre méthode.' };
    }
    if (code === 'email_address_invalid' || /email address .* is invalid|invalid email|unable to validate email/i.test(msg)) {
      return { kind: 'invalid', text: 'Cette adresse e-mail n’est pas acceptée. Vérifiez-la, ou utilisez-en une autre.' };
    }
    if (code === 'validation_failed' && /phone/i.test(msg) || /invalid phone|phone number/i.test(msg)) {
      return { kind: 'invalid', text: 'Ce numéro n’est pas accepté. Vérifiez-le, avec l’indicatif du pays.' };
    }
    return { kind: 'other', text: 'Un problème est survenu chez Jeere. Réessayez dans un instant.' };
  }

  /* ------------------------------------------------------------------ the code */

  function e164(phone) { return String(phone || '').replace(/[^\d+]/g, ''); }
  function redirectUrl() {
    try { return root.location.origin + root.location.pathname; } catch (e) { return undefined; }
  }

  // sendCode({ method: 'email' | 'sms' | 'whatsapp', email, phone, create, data }) → { ok } or { ok: false, error }
  function sendCode(o) {
    return client().then(function (sb) {
      var opts = { shouldCreateUser: o.create !== false };
      if (o.create !== false && isObj(o.data)) opts.data = o.data;
      var req;
      if (o.method === 'email') {
        opts.emailRedirectTo = redirectUrl();
        req = sb.auth.signInWithOtp({ email: String(o.email || '').trim().toLowerCase(), options: opts });
      } else {
        opts.channel = o.method === 'whatsapp' ? 'whatsapp' : 'sms';
        req = sb.auth.signInWithOtp({ phone: e164(o.phone), options: opts });
      }
      return withTimeout(req, CONFIG.timeoutMs + 6000, 'otp');
    }).then(function (r) {
      if (r && r.error) return { ok: false, error: describeError(r.error, o.method), raw: r.error };
      return { ok: true };
    }, function (e) { return { ok: false, error: describeError(e, o.method), raw: e }; });
  }

  // verifyCode({ method, email, phone, token }) → { ok, user, session } or { ok: false, error }
  function verifyCode(o) {
    return client().then(function (sb) {
      var p = o.method === 'email'
        ? { email: String(o.email || '').trim().toLowerCase(), token: String(o.token), type: 'email' }
        : { phone: e164(o.phone), token: String(o.token), type: 'sms' }; // WhatsApp codes verify as 'sms'
      return withTimeout(sb.auth.verifyOtp(p), CONFIG.timeoutMs + 6000, 'verify');
    }).then(function (r) {
      if (r && r.error) return { ok: false, error: describeError(r.error, o.method), raw: r.error };
      var d = (r && r.data) || {};
      if (!d.user) return { ok: false, error: describeError({ message: 'invalid token' }, o.method) };
      return { ok: true, user: d.user, session: d.session };
    }, function (e) { return { ok: false, error: describeError(e, o.method), raw: e }; });
  }

  // The open session, or null (reads storage; refreshes the token when it expired). force: also when
  // nothing is saved yet (an e-mail link whose tokens supabase-js is reading from the URL)
  function session(force) {
    if (!force && !lsGet(CONFIG.storageKey) && !/access_token=/.test(String(root.location.hash || ''))) {
      // Nothing saved and no link in the URL: no need to download the library to know
      return Promise.resolve(null);
    }
    return client().then(function (sb) {
      return withTimeout(sb.auth.getSession(), CONFIG.timeoutMs, 'session');
    }).then(function (r) { return (r && r.data && r.data.session) || null; }, function () { return null; });
  }

  /* ------------------------------------------------------------------ the profile and the bridge */

  // The profile columns a browser writes (first_name, phone, store_name). plan and studio are not among
  // them any more (wave 2 of the Studio audit): the `studio-plan` Edge Function writes them (planOf, syncPlan).
  function fromAccount(acc) {
    return {
      first_name: clip(acc.firstName, 40),
      phone: /^\+\d{8,15}$/.test(acc.phone || '') ? acc.phone : null,
      store_name: clip(acc.storeName, 40)
    };
  }
  function planOf(acc) {
    return { plan: PLANS.indexOf(acc && acc.plan) !== -1 ? acc.plan : 'gratuit', studio: acc && isObj(acc.studio) ? acc.studio : null };
  }
  function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
  function readSync() { var o = parse(lsGet(SYNC_KEY)); return o && typeof o.userId === 'string' && isObj(o.data) ? o : null; }
  function writeSync(userId, data) { lsSet(SYNC_KEY, JSON.stringify({ userId: userId, data: data, at: new Date().toISOString() })); }

  function loadProfile(sb, user) {
    return withTimeout(sb.from('profiles').select('id, first_name, phone, store_name, plan, studio, created_at').eq('id', user.id).maybeSingle(), CONFIG.timeoutMs, 'profile')
      .then(function (r) { return r && !r.error && r.data ? r.data : null; }, function () { return null; });
  }

  function savePatch(sb, userId, patch) {
    if (!Object.keys(patch).length) return Promise.resolve(true);
    return withTimeout(sb.from('profiles').update(patch).eq('id', userId), CONFIG.timeoutMs, 'update')
      .then(function (r) { return !(r && r.error); }, function () { return false; });
  }

  // After verifyOtp (or a link): the profile row → 'jeere-account'. The server wins; what the
  // server does not have yet (a store name, a number, a Studio subscription saved on this device
  // by the same seller) comes from the local account and is sent up. extra: { method, firstName,
  // phone } typed during sign-up, which win. Resolves to the account written.
  function completeLogin(user, extra) {
    extra = extra || {};
    return client().then(function (sb) {
      return loadProfile(sb, user).then(function (p) {
        p = p || {};
        var meta = isObj(user.user_metadata) ? user.user_metadata : {};
        var authPhone = user.phone ? '+' + String(user.phone).replace(/\D/g, '') : '';
        var acc = {
          version: 1,
          firstName: clip(p.first_name || meta.first_name || '', 40),
          phone: p.phone || '',
          storeName: clip(p.store_name || '', 40),
          createdAt: p.created_at || user.created_at || new Date().toISOString(),
          plan: PLANS.indexOf(p.plan) !== -1 ? p.plan : 'gratuit',
          loggedIn: true,
          userId: user.id,
          method: extra.method || (user.email ? 'email' : 'sms')
        };
        if (user.email) acc.email = String(user.email).toLowerCase();
        if (isObj(p.studio)) acc.studio = p.studio;
        var server = Object.assign(fromAccount(acc), planOf(acc));
        // The same seller's local account (same user id, or the same address or number before the first real login)
        var local = readAccount();
        var mine = local && (local.userId === user.id || (!local.userId && ((local.email && local.email === acc.email) || (local.phone && (local.phone === acc.phone || local.phone === authPhone)))));
        if (mine) {
          if (!acc.firstName && local.firstName) acc.firstName = local.firstName;
          if (!acc.phone && local.phone) acc.phone = local.phone;
          if (!acc.storeName && local.storeName) acc.storeName = local.storeName;
          if (acc.plan === 'gratuit' && local.plan && local.plan !== 'gratuit') acc.plan = local.plan;
          if (!acc.studio && isObj(local.studio)) acc.studio = local.studio;
          if (local.createdAt && (!p.created_at)) acc.createdAt = local.createdAt;
        }
        if (extra.firstName) acc.firstName = clip(extra.firstName, 40);
        if (extra.phone && /^\+\d{8,15}$/.test(extra.phone)) acc.phone = extra.phone;
        if (!acc.phone && authPhone) acc.phone = authPhone;
        writeSync(user.id, server);
        var written = writeAccount(acc) || acc;
        // her profile first, then the entitlements: the server's word (a demo subscription of this browser
        // goes up only in demo billing mode, see syncPlan)
        return syncNow().then(syncPlan).then(function () { return readAccount() || written; });
      });
    });
  }

  // Send the local account's changes (since the last snapshot) to public.profiles
  var syncing = null;
  function syncNow() {
    if (syncing) return syncing.then(syncNow);
    var acc = readAccount();
    var snap = readSync();
    if (!acc || !acc.userId || !acc.loggedIn || !snap || snap.userId !== acc.userId) return Promise.resolve(false);
    var now = fromAccount(acc);
    var patch = {};
    Object.keys(now).forEach(function (k) { if (snap.data[k] === undefined && now[k] === null) return; if (!same(now[k], snap.data[k])) patch[k] = now[k]; });
    if (!Object.keys(patch).length) return Promise.resolve(true);
    syncing = client().then(function (sb) {
      return savePatch(sb, acc.userId, patch).then(function (ok) {
        if (ok) { var d = Object.assign({}, snap.data, patch); writeSync(acc.userId, d); }
        return ok;
      });
    }, function () { return false; });
    syncing.then(function () { syncing = null; }, function () { syncing = null; });
    return syncing;
  }
  /* The entitlements (wave 2): profiles.plan and profiles.studio belong to the server. The Edge Function
   * `studio-plan` answers what they are ('get'), starts the one trial ('trial'), and — only while billing is
   * in demo mode (no real payment yet) — keeps the subscription the demo checkout made ('sync', demo: true).
   * Its answer is written back to 'jeere-account': a subscription typed into localStorage by hand does not
   * survive the next sync, and the badge on her stores is decided by the database from the server's copy. */
  var FN_PLAN = CONFIG.url + '/functions/v1/studio-plan';
  function accessToken() {
    var t = parse(lsGet(CONFIG.storageKey));
    if (t && isObj(t.currentSession)) t = t.currentSession;
    return t && typeof t.access_token === 'string' ? t.access_token : '';
  }
  function callPlan(body) {
    var tok = accessToken();
    if (!tok) return Promise.resolve(null);
    return withTimeout(fetch(FN_PLAN, { method: 'POST', headers: { apikey: CONFIG.key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), CONFIG.timeoutMs, 'plan')
      .then(function (r) { return r.json().catch(function () { return null; }); }, function () { return null; });
  }
  function applyPlan(userId, r) {
    if (!isObj(r) || !('studio' in r)) return false;
    var acc = readAccount();
    if (!acc || acc.userId !== userId) return false;
    if (PLANS.indexOf(r.plan) !== -1) acc.plan = r.plan;
    if (isObj(r.studio)) acc.studio = r.studio; else delete acc.studio;
    var snap = readSync();
    if (snap && snap.userId === userId) writeSync(userId, Object.assign({}, snap.data, planOf(acc)));
    if (!same(planOf(readAccount()), planOf(acc))) writeAccount(acc);
    return true;
  }
  var planSyncing = null;
  function syncPlan() {
    if (planSyncing) return planSyncing;
    var acc = readAccount();
    var snap = readSync();
    if (!acc || !acc.userId || !acc.loggedIn || !snap || snap.userId !== acc.userId) return Promise.resolve(false);
    var want = planOf(acc);
    var had = { plan: snap.data.plan, studio: snap.data.studio === undefined ? null : snap.data.studio };
    var demoBilling = true;
    try { if (root.JeereBilling && typeof root.JeereBilling.isDemo === 'function') demoBilling = root.JeereBilling.isDemo(); } catch (e) { demoBilling = true; }
    var body = same(want, had) ? { action: 'get' } : { action: 'sync', demo: demoBilling, plan: want.plan, studio: want.studio };
    planSyncing = callPlan(body).then(function (r) { return applyPlan(acc.userId, r); });
    planSyncing.then(function () { planSyncing = null; }, function () { planSyncing = null; });
    return planSyncing;
  }
  // The one 14-day trial, started by the server (any billing mode) → Promise { ok, studio } | null (offline)
  function startTrial() {
    var acc = readAccount();
    if (!acc || !acc.userId) return Promise.resolve(null);
    return callPlan({ action: 'trial' }).then(function (r) { if (r) applyPlan(acc.userId, r); return r; });
  }

  // The same, for one field set at once from the account page (the store name after sign-up)
  function saveProfile(fields) {
    var acc = readAccount();
    if (!acc || !acc.userId) return Promise.resolve(false);
    if (fields.storeName !== undefined) acc.storeName = clip(fields.storeName, 40);
    if (fields.firstName !== undefined) acc.firstName = clip(fields.firstName, 40);
    if (fields.phone !== undefined) acc.phone = fields.phone;
    writeAccount(acc);
    return syncNow();
  }

  // End the Supabase session on this device. The saved token goes at once (synchronously, so a
  // page being closed still forgets it); the server is told best-effort.
  function forgetSession() {
    var tok = parse(lsGet(CONFIG.storageKey));
    lsDel(CONFIG.storageKey);
    lsDel(SYNC_KEY);
    var at = tok && (tok.access_token || (tok.currentSession && tok.currentSession.access_token));
    if (at) {
      try {
        fetch(CONFIG.url + '/auth/v1/logout?scope=local', { method: 'POST', keepalive: true, headers: { apikey: CONFIG.key, Authorization: 'Bearer ' + at } }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
  }
  function signOut() {
    if (!clientP) { forgetSession(); return Promise.resolve(true); }
    return clientP.then(function (sb) {
      return withTimeout(sb.auth.signOut({ scope: 'local' }), 5000, 'signout');
    }).then(function () { lsDel(CONFIG.storageKey); lsDel(SYNC_KEY); return true; }, function () { forgetSession(); return true; });
  }

  function maskEmail(email) {
    var m = /^([^@]+)@(.+)$/.exec(String(email || ''));
    if (!m) return '';
    var u = m[1];
    var shown = u.length <= 2 ? u.charAt(0) + '•' : u.charAt(0) + '•••' + u.charAt(u.length - 1);
    return shown + '@' + m[2];
  }

  /* ------------------------------------------------------------------ the watcher (other pages) */

  // On the editor, the dashboard, the Studio and the pricing page: while a real session is open,
  // send the account's changes to the profile, and end the session when she logs out (loggedIn:
  // false) or deletes her account there. Nothing at all happens without a saved real session.
  var watching = false;
  function check() {
    if (!lsGet(CONFIG.storageKey)) return;
    var acc = readAccount();
    if (!acc || !acc.userId || !acc.loggedIn) { signOut(); return; }
    syncNow();
    var snap = readSync();
    if (snap && snap.userId === acc.userId && !same(planOf(acc), { plan: snap.data.plan, studio: snap.data.studio === undefined ? null : snap.data.studio })) syncPlan();
  }
  function watch() {
    if (watching) return;
    if (!lsGet(CONFIG.storageKey)) return;
    var acc = readAccount();
    if (!acc || !acc.userId || !acc.loggedIn) { forgetSession(); return; }
    watching = true;
    client().then(function (sb) {
      // keep the token fresh; a session revoked elsewhere logs her out here too
      sb.auth.onAuthStateChange(function (ev) {
        if (ev === 'SIGNED_OUT') {
          var a = readAccount();
          if (a && a.userId && a.loggedIn) { a.loggedIn = false; writeAccount(a); }
        }
      });
      check();
      syncPlan(); // the server's entitlements, once per page
    }, function () { /* offline: the snapshot keeps the changes for later */ });
    // Changes made by the page itself do not fire 'storage': look when it writes the account
    try {
      var P = root.Storage && root.Storage.prototype;
      if (P && !P.__jeereAuth) {
        var set = P.setItem, del = P.removeItem, clr = P.clear;
        var later = function (k) { if (k === undefined || k === ACCOUNT_KEY) setTimeout(check, 300); };
        P.setItem = function (k, v) { var r = set.apply(this, arguments); if (this === safeLS()) later(String(k)); return r; };
        P.removeItem = function (k) { var r = del.apply(this, arguments); if (this === safeLS()) later(String(k)); return r; };
        P.clear = function () { var r = clr.apply(this, arguments); if (this === safeLS()) later(); return r; };
        P.__jeereAuth = true;
      }
    } catch (e) { /* the timer below still catches up */ }
    root.addEventListener('storage', function (e) { if (!e.key || e.key === ACCOUNT_KEY) check(); });
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') check(); });
    setInterval(check, 15000);
  }
  function safeLS() { try { return root.localStorage; } catch (e) { return null; } }

  root.JeereAuth = {
    CONFIG: CONFIG,
    isDemo: isDemo, why: why, forceDemo: forceDemo, probe: probe,
    sendCode: sendCode, verifyCode: verifyCode, session: session, completeLogin: completeLogin,
    saveProfile: saveProfile, syncNow: syncNow, syncPlan: syncPlan, startTrial: startTrial, signOut: signOut, forgetSession: forgetSession,
    describeError: describeError, maskEmail: maskEmail, watch: watch,
    _fromAccount: fromAccount
  };

  // Every page but the account page (which drives the session itself) watches
  var onCompte = !!doc.getElementById('c-form-signup');
  if (!onCompte) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch); else watch();
  }
})();
