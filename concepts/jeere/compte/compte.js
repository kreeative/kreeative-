/* Jeere — the seller account (../compte/): sign-up and login by phone number, no e-mail, no password.
 *
 *   #inscription  prénom + numéro WhatsApp ─► code à 6 chiffres ─► nom de la boutique ─► « Comment voulez-vous commencer ? »
 *   #connexion    numéro ─► code ─► ../admin/   (a number that is not the saved account's: offer to create one)
 *   (no hash)     #inscription when there is no account, #connexion when it is logged out, « Bonjour Awa » when it is open
 *
 * DEMO: no SMS or WhatsApp message is sent and any 6-digit code is accepted (the screen says so).
 * The account is saved in localStorage as 'jeere-account' = { version: 1, firstName, phone, storeName, createdAt,
 * plan, loggedIn }, through JEERE_DATA.normalizeAccount when data.js has it. When a fiche boutique exists
 * ('jeere-studio-config'), sign-up fills its store.name and store.whatsapp only if they are empty, through
 * JEERE_DATA.normalizeConfig. The step in progress (number, first name, when the code was asked) is kept in
 * sessionStorage ('jeere-compte-flow') so a reload, or Android closing the tab while she reads the code, does not
 * start everything again. Every storage access is in try/catch: blocked storage still works for this page.
 *
 * Steps are history entries (history.state.jc), so the phone's Back button goes back one step.
 * Exposes window.JeereCompte = { parsePhone, formatPhone, maskPhone } (pure helpers, for tests).
 */
(function () {
  'use strict';

  var root = window;
  var doc = document;
  var D = root.JEERE_DATA || {};
  var NB = ' ';

  var KEYS = (D.STORAGE_KEYS && typeof D.STORAGE_KEYS === 'object') ? D.STORAGE_KEYS : {};
  var CONFIG_KEY = KEYS.config || 'jeere-studio-config';
  var ACCOUNT_KEY = KEYS.account || 'jeere-account';
  var FLOW_KEY = 'jeere-compte-flow';
  var RESEND_S = 30;
  var DASHBOARD = '../admin/';
  // « ?suite=studio » (the Studio's trial sheet) or « ?suite=abonnements&plan=pro&periode=an » (the
  // pricing page's checkout): where she goes once her account is ready. Only these two targets.
  var SUITE = (function () {
    var q = '';
    try { q = root.location.search || ''; } catch (e) { q = ''; }
    var m = /[?&]suite=(studio|abonnements)(?:&|$)/.exec(q);
    if (!m) return null;
    if (m[1] === 'studio') return { id: 'studio', url: '../studio/?essai=1', title: 'Démarrer mon essai du Studio', text: '14 jours de Studio complet, gratuits. Aucun moyen de paiement demandé.', cta: 'Démarrer mon essai du Studio' };
    var plan = /[?&]plan=(solo|pro|agence)(?:&|$)/.exec(q);
    var per = /[?&]periode=(mois|an)(?:&|$)/.exec(q);
    var url = '../abonnements/?' + (plan ? 'plan=' + plan[1] + '&' : '') + 'periode=' + (per ? per[1] : 'an') + '#paiement';
    return { id: 'abonnements', url: url, title: 'Reprendre mon abonnement Studio', text: 'Votre formule et votre période sont gardées : il reste le paiement.', cta: 'Reprendre mon abonnement Studio' };
  })();

  // The landing page's country list (../index.html, the waitlist form), +225 first
  var COUNTRIES = [
    ['225', '🇨🇮', 'Côte d’Ivoire'], ['221', '🇸🇳', 'Sénégal'], ['223', '🇲🇱', 'Mali'], ['226', '🇧🇫', 'Burkina Faso'],
    ['228', '🇹🇬', 'Togo'], ['229', '🇧🇯', 'Bénin'], ['227', '🇳🇪', 'Niger'], ['224', '🇬🇳', 'Guinée'],
    ['237', '🇨🇲', 'Cameroun'], ['1', '🇨🇦', 'Canada'], ['33', '🇫🇷', 'France'], ['32', '🇧🇪', 'Belgique'],
    ['41', '🇨🇭', 'Suisse'], ['44', '🇬🇧', 'Royaume-Uni']
  ];
  var CODES = COUNTRIES.map(function (c) { return c[0]; }).sort(function (a, b) { return b.length - a.length; });

  /* ------------------------------------------------------------------ helpers */

  function $(id) { return doc.getElementById(id); }
  function clip(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function initial(name) { var s = clip(name, 40); return s ? s.charAt(0).toLocaleUpperCase('fr') : 'J'; }
  function q(s) { return '«' + NB + s + NB + '»'; }

  function readRaw(key) { try { return root.localStorage.getItem(key); } catch (e) { return null; } }
  function writeRaw(key, value) { try { root.localStorage.setItem(key, value); return true; } catch (e) { return false; } }
  function sessGet(key) { try { return root.sessionStorage.getItem(key); } catch (e) { return null; } }
  function sessSet(key, value) { try { root.sessionStorage.setItem(key, value); } catch (e) { /* blocked: memory only */ } }

  // Same rule as data.js and the landing page: +/00 kept as typed (digits only), else +225 is added
  function normWa(raw) {
    if (typeof D.normalizeWhatsapp === 'function') { try { return D.normalizeWhatsapp(raw); } catch (e) { /* fall through */ } }
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^(\+|00)/.test(s)) { var intl = s.replace(/^00/, '').replace(/\D/g, ''); return intl ? '+' + intl : ''; }
    var digits = s.replace(/\D/g, '');
    if (!digits) return '';
    if (/^225\d{10}$/.test(digits)) return '+' + digits;
    return '+225' + digits;
  }
  function slugify(raw) {
    if (typeof D.slugify === 'function') { try { return D.slugify(raw); } catch (e) { /* fall through */ } }
    var s = String(raw == null ? '' : raw);
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    return s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
  function subdomainFor(name) {
    if (typeof D.subdomainFor === 'function') { try { return D.subdomainFor(name); } catch (e) { /* fall through */ } }
    return 'jeere.kreeative.xyz/b/' + (slugify(name).slice(0, 40).replace(/-+$/g, '') || 'ma-boutique');
  }
  function planName(id) {
    var list = Array.isArray(D.PLANS) ? D.PLANS : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i].name || list[i].label || id;
    var names = { gratuit: 'Gratuit', essentiel: 'Essentiel', pro: 'Pro', business: 'Business' };
    return names[id] || 'Gratuit';
  }

  /* ---------- phone numbers ---------- */

  // What she typed, with the country select, as { cc, national, e164, intl }. A number typed in full
  // (+225…, 00225…) wins over the select; a known code typed in front moves to the select.
  function parsePhone(ccValue, raw) {
    var s = String(raw == null ? '' : raw).trim();
    var cc = CODES.indexOf(String(ccValue)) !== -1 ? String(ccValue) : '225';
    var digits;
    if (/^(\+|00)/.test(s)) {
      digits = s.replace(/^00/, '').replace(/\D/g, '');
      var known = CODES.filter(function (c) { return digits.indexOf(c) === 0; })[0];
      if (!known) return { cc: null, national: digits, e164: digits ? '+' + digits : '', intl: true };
      cc = known;
      digits = digits.slice(known.length);
    } else {
      digits = s.replace(/\D/g, '');
      if (cc === '225' && /^225\d{10}$/.test(digits)) digits = digits.slice(3); // « 2250707… » without the +
    }
    if (cc !== '225') digits = digits.replace(/^0/, ''); // 06… in France is +33 6…; Ivorian numbers keep their 0
    return { cc: cc, national: digits, e164: digits ? '+' + cc + digits : '', intl: false };
  }
  function phoneError(p) {
    if (!p.national) return 'Écrivez votre numéro WhatsApp.';
    if (p.cc === '225' && p.national.length !== 10) {
      return 'Un numéro ivoirien a 10' + NB + 'chiffres, par exemple 07' + NB + '07' + NB + '12' + NB + '34' + NB + '56.';
    }
    if (!/^\+\d{8,15}$/.test(p.e164) || p.national.length < 6) return 'Ce numéro semble incomplet. Vérifiez-le, avec le bon indicatif du pays.';
    return '';
  }
  function groups(cc, n) {
    if (cc === '1' && n.length === 10) return [n.slice(0, 3), n.slice(3, 6), n.slice(6)];
    var out = [];
    for (var i = n.length; i > 0; i -= 2) out.unshift(n.slice(Math.max(0, i - 2), i));
    return out;
  }
  function splitE164(e164) {
    var d = String(e164 == null ? '' : e164).replace(/\D/g, '');
    var cc = CODES.filter(function (c) { return d.indexOf(c) === 0; })[0] || '';
    return { cc: cc, national: d.slice(cc.length), digits: d };
  }
  // '+2250707123456' → '+225 07 07 12 34 56' (non-breaking spaces)
  function formatPhone(e164) {
    var p = splitE164(e164);
    if (!p.digits) return '';
    if (!p.cc) return '+' + p.digits;
    return '+' + p.cc + NB + groups(p.cc, p.national).join(NB);
  }
  // '+2250707123456' → '+225 •• •• •• 34 56'
  function maskPhone(e164) {
    var p = splitE164(e164);
    if (!p.digits) return '';
    if (!p.cc) return '+' + p.digits.slice(0, 3) + NB + '••' + NB + p.digits.slice(-4);
    var g = groups(p.cc, p.national);
    return '+' + p.cc + NB + g.map(function (x, i) { return i < g.length - 2 ? x.replace(/\d/g, '•') : x; }).join(NB);
  }
  function nationalDisplay(cc, national) {
    return (cc === '225' && /^\d{10}$/.test(national)) ? groups(cc, national).join(' ') : national;
  }

  /* ---------- the account, the fiche and the flow in progress ---------- */

  function normAccount(input) {
    var a = null;
    if (typeof D.normalizeAccount === 'function') {
      try { a = D.normalizeAccount(input); } catch (e) { a = null; }
    } else {
      var src = input;
      if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        var plan = ['gratuit', 'essentiel', 'pro', 'business'].indexOf(src.plan) !== -1 ? src.plan : 'gratuit';
        var t = new Date(src.createdAt).getTime();
        a = {
          version: 1, firstName: clip(src.firstName, 40), phone: normWa(typeof src.phone === 'string' ? src.phone : ''),
          storeName: clip(src.storeName, 40), createdAt: isFinite(t) ? new Date(t).toISOString() : '', plan: plan,
          loggedIn: src.loggedIn === true
        };
      }
    }
    if (!a || typeof a !== 'object' || !/^\+\d{8,15}$/.test(a.phone || '')) return null; // no usable number: no account
    return a;
  }
  // The account always comes from storage, so a change made in another tab (a log-out, « Supprimer
  // mon compte » in the dashboard) is seen here. The copy in memory is used only while storage
  // writes fail (a blocked or full storage), so the session still works.
  var memAccount = null;
  var memOnly = false;
  function readAccount() {
    if (memOnly && memAccount) return memAccount;
    var raw = readRaw(ACCOUNT_KEY);
    return raw ? normAccount(raw) : null;
  }
  function saveAccount(acc) {
    var clean = normAccount(acc) || acc;
    memAccount = clean;
    var ok = writeRaw(ACCOUNT_KEY, JSON.stringify(clean));
    memOnly = !ok;
    return ok;
  }

  // The fiche boutique saved by the editor or the dashboard, normalised, or null
  function readFiche() {
    var raw = readRaw(CONFIG_KEY);
    if (!raw || typeof D.normalizeConfig !== 'function') return null;
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return null; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    try { return D.normalizeConfig(obj); } catch (e) { return null; }
  }
  function ficheName() {
    var f = readFiche();
    return f && f.store && typeof f.store.name === 'string' ? clip(f.store.name, 40) : '';
  }
  // Sign-up gives the saved fiche her store name (an empty name is filled; with rename, the name she
  // typed over the prefilled one replaces it, and the hero titles that carried the old name follow,
  // as in the dashboard's Préférences) and her WhatsApp number, only where it is empty.
  function fillFiche(name, phone, rename) {
    var f = readFiche();
    if (!f || !f.store) return false;
    var changed = false;
    var cur = String(f.store.name || '').trim();
    if (!cur && name) { f.store.name = name; changed = true; }
    else if (rename && name && cur && name !== cur) {
      (Array.isArray(f.sections) ? f.sections : []).forEach(function (s) {
        if (s && s.type === 'hero' && s.settings && typeof s.settings.title === 'string' && s.settings.title.indexOf(cur) !== -1) {
          var t = s.settings.title.split(cur).join(name);
          s.settings.title = t.length <= 70 ? t : name;
        }
      });
      f.store.name = name;
      changed = true;
    }
    if (!String(f.store.whatsapp || '').trim() && phone) { f.store.whatsapp = phone; changed = true; }
    if (!changed) return false;
    var out;
    try { out = D.normalizeConfig(f); } catch (e) { return false; }
    return writeRaw(CONFIG_KEY, JSON.stringify(out));
  }

  var flow = loadFlow();
  function loadFlow() {
    var raw = sessGet(FLOW_KEY);
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return {
      mode: o.mode === 'signup' || o.mode === 'login' ? o.mode : '',
      firstName: clip(o.firstName, 40),
      phone: typeof o.phone === 'string' && /^\+\d{8,15}$/.test(o.phone) ? o.phone : '',
      cc: typeof o.cc === 'string' ? o.cc : '',
      national: typeof o.national === 'string' ? o.national.replace(/\D/g, '').slice(0, 15) : '',
      sentAt: typeof o.sentAt === 'number' && isFinite(o.sentAt) ? o.sentAt : 0,
      channel: o.channel === 'sms' ? 'sms' : 'whatsapp',
      verified: o.verified === true,
      created: o.created === true,
      saved: o.saved !== false,
      storeName: clip(o.storeName, 40)
    };
  }
  function saveFlow() { sessSet(FLOW_KEY, JSON.stringify(flow)); }

  /* ------------------------------------------------------------------ elements */

  var el = {
    progress: $('c-progress'), bar: $('c-progress-bar'), ptxt: $('c-progress-txt'),
    live: $('c-live'), alert: $('c-alert'),
    // sign-up
    exists: $('c-exists'), existsTxt: $('c-exists-txt'), formSignup: $('c-form-signup'),
    first: $('c-first'), cc: $('c-cc'), phone: $('c-phone'), same: $('c-same'), sameBtn: $('c-same-login'), signupBtn: $('c-signup-btn'),
    // login
    known: $('c-known'), knownAv: $('c-known-av'), knownName: $('c-known-name'), knownNum: $('c-known-num'), knownOr: $('c-known-or'),
    formLogin: $('c-form-login'), lcc: $('c-lcc'), lphone: $('c-lphone'), loginBtn: $('c-login-btn'),
    nomatch: $('c-nomatch'), nomatchT: $('c-nomatch-t'), nomatchD: $('c-nomatch-d'), nomatchCreate: $('c-nomatch-create'), nomatchRetry: $('c-nomatch-retry'),
    // code
    codeBack: $('c-code-back'), codeNum: $('c-code-num'), codeCh: $('c-code-ch'), formCode: $('c-form-code'),
    otp: $('c-otp'), code: $('c-code'), codeBtn: $('c-code-btn'),
    resendWait: $('c-resend-wait'), resendPre: $('c-resend-pre'), resendTime: $('c-resend-time'), resendActs: $('c-resend-acts'),
    resend: $('c-resend'), resendSms: $('c-resend-sms'),
    // store name
    nameLead: $('c-name-lead'), formName: $('c-form-name'), store: $('c-store'), storeHint: $('c-store-hint'), addr: $('c-addr-v'), nameBtn: $('c-name-btn'),
    // start
    startLead: $('c-start-lead'), startFiche: $('c-start-fiche'), saveWarn: $('c-save-warn'),
    // session
    meAv: $('c-me-av'), sessionT: $('c-session-t'), sumStore: $('c-sum-store'), sumPhone: $('c-sum-phone'), sumPlan: $('c-sum-plan'), logout: $('c-logout')
  };
  if (!el.formSignup || !el.formCode) return; // not this page
  var cells = el.otp ? Array.prototype.slice.call(el.otp.querySelectorAll('.c-otp__cell')) : [];
  var sections = Array.prototype.slice.call(doc.querySelectorAll('.c-step[data-step]'));

  var TITLES = {
    signup: 'Créer un compte', login: 'Se connecter', code: 'Entrez le code', name: 'Le nom de votre boutique',
    start: 'Bienvenue', session: 'Votre compte'
  };
  var FLOWS = { inscription: ['signup', 'code', 'name', 'start'], connexion: ['login', 'code'] };

  /* ------------------------------------------------------------------ messages and errors */

  var liveT = 0;
  function announce(msg, urgent) {
    var region = urgent ? el.alert : el.live;
    if (!region) return;
    region.textContent = '';
    clearTimeout(liveT);
    liveT = setTimeout(function () { region.textContent = msg; }, 40);
  }
  function describe(input, id, on) {
    var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(function (x) { return x !== id; });
    if (on) ids.push(id);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' ')); else input.removeAttribute('aria-describedby');
  }
  function setError(input, errId, msg) {
    var p = $(errId);
    if (p) { p.textContent = msg; p.hidden = false; }
    input.setAttribute('aria-invalid', 'true');
    describe(input, errId, true);
  }
  function clearError(input, errId) {
    var p = $(errId);
    if (p && !p.hidden) { p.hidden = true; p.textContent = ''; }
    input.removeAttribute('aria-invalid');
    describe(input, errId, false);
  }
  // Move to the field in error (its label and its error are read); if she is already in it, say the error
  function reportAt(input, msg) {
    if (doc.activeElement === input) announce(msg, true);
    else { try { input.focus(); } catch (e) { /* ignore */ } }
  }

  // Bring a message that just appeared fully into view (short screens, keyboard open)
  function reveal(node) {
    var smooth = true;
    try { smooth = !root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { smooth = false; }
    try { node.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { /* ignore */ }
  }

  var busy = false;
  function busyButton(btn, label, ms, done) {
    busy = true;
    var txt = btn.querySelector('.c-btn__txt');
    var before = txt ? txt.textContent : '';
    var spin = doc.createElement('span');
    spin.className = 'c-spin';
    spin.setAttribute('aria-hidden', 'true');
    btn.classList.add('is-busy');
    btn.setAttribute('aria-disabled', 'true');
    btn.insertBefore(spin, btn.firstChild);
    if (txt) txt.textContent = label;
    announce(label);
    setTimeout(function () {
      busy = false;
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-disabled');
      if (spin.parentNode) spin.parentNode.removeChild(spin);
      if (txt) txt.textContent = before;
      done();
    }, ms);
  }

  /* ------------------------------------------------------------------ routing */

  var current = { route: '', step: '' };
  var pushed = false; // a step entry was pushed by this page (so « Modifier le numéro » can go Back)

  function hashRoute() {
    var h = '';
    try { h = (root.location.hash || '').replace(/^#/, ''); } catch (e) { h = ''; }
    return h === 'inscription' || h === 'connexion' ? h : '';
  }
  function stateStep() {
    try { var s = root.history.state; return s && typeof s.jc === 'string' ? s.jc : ''; } catch (e) { return ''; }
  }
  function resolve() {
    var acc = readAccount();
    var r = hashRoute();
    if (!r) r = acc ? (acc.loggedIn ? 'session' : 'connexion') : 'inscription';
    if (r === 'connexion' && acc && acc.loggedIn) r = 'session';
    var want = stateStep();
    var step;
    if (r === 'inscription') {
      if (want === 'code' && flow.mode === 'signup' && flow.phone && !flow.verified) step = 'code';
      else if (want === 'name' && flow.mode === 'signup' && flow.verified && flow.phone) step = 'name';
      else if (want === 'start' && flow.created && acc && acc.loggedIn) step = 'start';
      else step = 'signup';
    } else if (r === 'connexion') {
      step = (want === 'code' && flow.mode === 'login' && flow.phone && acc && acc.phone === flow.phone) ? 'code' : 'login';
    } else step = 'session';
    return { route: r, step: step };
  }
  function urlFor(route) {
    var base = '';
    try { base = root.location.pathname + root.location.search; } catch (e) { base = ''; }
    return base + (route === 'inscription' || route === 'connexion' ? '#' + route : '');
  }
  function go(route, step, opts) {
    opts = opts || {};
    try {
      if (opts.replace) root.history.replaceState({ jc: step }, '', urlFor(route));
      else { root.history.pushState({ jc: step }, '', urlFor(route)); pushed = true; }
    } catch (e) { /* sandboxed history: the screen still changes */ }
    show({ route: route, step: step }, { focus: opts.focus || 'auto' });
  }
  function onNav() {
    var v = resolve();
    if (v.route === current.route && v.step === current.step) return;
    show(v, { focus: 'title' });
  }

  function show(v, opts) {
    var leaving = current.step;
    current = v;
    if (leaving === 'code' && v.step !== 'code') stopTimer();
    sections.forEach(function (sec) { sec.hidden = sec.getAttribute('data-step') !== v.step; });
    doc.body.setAttribute('data-step', v.step);
    var setup = SETUP[v.step];
    if (setup) setup(v);
    if (current !== v) return; // the step sent us elsewhere
    drawProgress(v);
    try { doc.title = (TITLES[v.step] || 'Votre compte') + ' · Jeere'; } catch (e) { /* ignore */ }
    try { root.scrollTo(0, 0); } catch (e) { /* ignore */ }
    var col = doc.querySelector('.c-col');
    if (col) col.scrollTop = 0;
    focusStep(v.step, opts && opts.focus);
  }
  function focusStep(step, how) {
    if (!how || how === 'none') return;
    var target = null;
    if (how === 'auto') {
      if (step === 'code') target = el.code;
      else if (step === 'name') target = el.store;
    } else if (how && typeof how === 'object' && how.focus) target = how;
    if (!target) {
      var sec = doc.querySelector('.c-step[data-step="' + step + '"]');
      target = sec ? sec.querySelector('.c-title') : null;
    }
    if (target) { try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (x) { /* ignore */ } } }
  }
  function drawProgress(v) {
    var list = FLOWS[v.route];
    var i = list ? list.indexOf(v.step) : -1;
    if (!list || i === -1) { el.progress.hidden = true; return; }
    el.progress.hidden = false;
    var html = '';
    for (var k = 0; k < list.length; k++) html += '<span' + (k <= i ? ' class="is-on"' : '') + '></span>';
    el.bar.innerHTML = html;
    el.ptxt.textContent = (v.route === 'inscription' ? 'Créer un compte' : 'Connexion') + ' · Étape ' + (i + 1) + ' sur ' + list.length;
  }

  /* ------------------------------------------------------------------ the steps */

  var SETUP = {};

  // 1. Sign-up: first name and number
  SETUP.signup = function () {
    var acc = readAccount();
    el.same.hidden = true;
    clearError(el.first, 'c-first-err');
    clearError(el.phone, 'c-phone-err');
    if (acc) {
      var who = (acc.firstName ? acc.firstName + ', ' : '') + maskPhone(acc.phone);
      el.existsTxt.textContent = acc.loggedIn
        ? 'Le compte de ' + (acc.firstName || 'ce vendeur') + ' (' + maskPhone(acc.phone) + ') est ouvert sur cet appareil. En créer un nouveau le remplacera.'
        : 'Un compte Jeere existe déjà sur cet appareil (' + who + '). En créer un nouveau le remplacera.';
      var link = el.exists.querySelector('a');
      if (link) link.textContent = acc.loggedIn ? 'Voir mon compte' : 'Se connecter plutôt';
      el.exists.hidden = false;
    } else el.exists.hidden = true;
    if (flow.prefill) {
      // « Créer un compte avec ce numéro » from the login screen
      if (flow.prefill.cc) el.cc.value = flow.prefill.cc;
      el.phone.value = nationalDisplay(el.cc.value, flow.prefill.national || '');
      delete flow.prefill;
      saveFlow();
    } else if (flow.mode === 'signup' && !flow.created && flow.phone && !el.phone.value && !el.first.value) {
      // after a reload: what she had typed
      el.first.value = flow.firstName;
      if (flow.cc) el.cc.value = flow.cc;
      el.phone.value = nationalDisplay(el.cc.value, flow.national);
    }
  };

  function readPhoneField(ccEl, input) {
    var p = parsePhone(ccEl.value, input.value);
    if (p.cc && p.cc !== ccEl.value) ccEl.value = p.cc;
    if (p.cc && !p.intl && p.national) input.value = nationalDisplay(p.cc, p.national);
    return p;
  }

  function submitSignup(e) {
    if (e) e.preventDefault();
    if (busy) return;
    el.same.hidden = true;
    var first = clip(el.first.value, 40);
    el.first.value = first;
    var p = readPhoneField(el.cc, el.phone);
    var err1 = first ? '' : 'Écrivez votre prénom.';
    var err2 = phoneError(p);
    if (err1) setError(el.first, 'c-first-err', err1); else clearError(el.first, 'c-first-err');
    if (err2) setError(el.phone, 'c-phone-err', err2); else clearError(el.phone, 'c-phone-err');
    if (err1) return reportAt(el.first, err1);
    if (err2) return reportAt(el.phone, err2);
    var phone = normWa(p.e164);
    var acc = readAccount();
    if (acc && acc.phone === phone) {
      // this number already has the account of this device: log in instead
      var t = el.same.querySelector('p');
      if (t) t.innerHTML = acc.loggedIn
        ? '<strong>Ce numéro a déjà un compte, ouvert sur cet appareil.</strong> Retrouvez votre boutique et vos réglages.'
        : '<strong>Ce numéro a déjà un compte sur cet appareil.</strong> Connectez-vous plutôt' + NB + ': votre boutique et vos réglages sont gardés.';
      el.sameBtn.textContent = acc.loggedIn ? 'Ouvrir mon compte' : 'Me connecter avec ce numéro';
      el.same.hidden = false;
      reveal(el.same);
      announce(acc.loggedIn ? 'Ce numéro a déjà un compte, ouvert sur cet appareil.' : 'Ce numéro a déjà un compte sur cet appareil. Connectez-vous plutôt.', true);
      return;
    }
    flow = { mode: 'signup', firstName: first, phone: phone, cc: p.cc || '', national: p.national, sentAt: Date.now(), channel: 'whatsapp', verified: false, created: false, saved: true, storeName: '' };
    saveFlow();
    busyButton(el.signupBtn, 'Envoi du code…', 450, function () { go('inscription', 'code'); });
  }

  function useSameNumber() {
    var acc = readAccount();
    if (!acc) return;
    if (acc.loggedIn) { go('', 'session', { focus: 'title' }); return; }
    flow = { mode: 'login', firstName: acc.firstName, phone: acc.phone, cc: '', national: '', sentAt: Date.now(), channel: 'whatsapp', verified: false, created: false, saved: true, storeName: '' };
    saveFlow();
    go('connexion', 'code');
  }

  // 1. Login: the number
  SETUP.login = function () {
    var acc = readAccount();
    el.nomatch.hidden = true;
    el.loginBtn.hidden = false;
    clearError(el.lphone, 'c-lphone-err');
    if (acc && !acc.loggedIn) {
      el.knownAv.textContent = initial(acc.firstName || acc.storeName);
      el.knownName.textContent = [acc.firstName, acc.storeName].filter(Boolean).join(' · ') || 'Votre compte';
      el.knownNum.textContent = maskPhone(acc.phone);
      el.known.setAttribute('aria-label', 'Continuer avec le compte de ' + (acc.firstName || 'cet appareil') + ', numéro se terminant par ' + acc.phone.slice(-4).replace(/(\d\d)(\d\d)/, '$1 $2'));
      el.known.hidden = false;
      el.knownOr.hidden = false;
    } else {
      el.known.hidden = true;
      el.knownOr.hidden = true;
    }
  };

  var pendingNew = null; // the number typed on the login screen that has no account
  function submitLogin(e) {
    if (e) e.preventDefault();
    if (busy) return;
    var p = readPhoneField(el.lcc, el.lphone);
    var err = phoneError(p);
    if (err) { setError(el.lphone, 'c-lphone-err', err); el.nomatch.hidden = true; el.loginBtn.hidden = false; return reportAt(el.lphone, err); }
    clearError(el.lphone, 'c-lphone-err');
    var phone = normWa(p.e164);
    var acc = readAccount();
    if (!acc || acc.phone !== phone) {
      pendingNew = { cc: p.cc || '', national: p.national, phone: phone };
      el.nomatchD.innerHTML = '';
      el.nomatchD.appendChild(doc.createTextNode('Le '));
      var b = doc.createElement('strong');
      b.className = 'c-nowrap';
      b.textContent = formatPhone(phone);
      el.nomatchD.appendChild(b);
      el.nomatchD.appendChild(doc.createTextNode(' n’est lié à aucun compte Jeere sur cet appareil. Vérifiez le numéro, ou créez un compte avec lui en une minute.'));
      el.nomatch.hidden = false;
      el.loginBtn.hidden = true;
      try { el.nomatchT.focus({ preventScroll: true }); } catch (x) { el.nomatchT.focus(); }
      reveal(el.nomatch);
      announce('Aucun compte avec ce numéro sur cet appareil.', true);
      return;
    }
    flow = { mode: 'login', firstName: acc.firstName, phone: phone, cc: p.cc || '', national: p.national, sentAt: Date.now(), channel: 'whatsapp', verified: false, created: false, saved: true, storeName: '' };
    saveFlow();
    busyButton(el.loginBtn, 'Envoi du code…', 450, function () { go('connexion', 'code'); });
  }
  function useKnown() {
    var acc = readAccount();
    if (!acc) return;
    flow = { mode: 'login', firstName: acc.firstName, phone: acc.phone, cc: '', national: '', sentAt: Date.now(), channel: 'whatsapp', verified: false, created: false, saved: true, storeName: '' };
    saveFlow();
    go('connexion', 'code');
  }
  function nomatchCreate() {
    var p = pendingNew || {};
    flow = { mode: '', prefill: { cc: p.cc || el.lcc.value, national: p.national || '' } };
    saveFlow();
    go('inscription', 'signup', { focus: el.first });
  }
  function nomatchRetry() {
    el.nomatch.hidden = true;
    el.loginBtn.hidden = false;
    el.lphone.value = '';
    try { el.lphone.focus(); } catch (e) { /* ignore */ }
  }

  // 2. The code (both flows)
  var timer = 0;
  var verifying = false;
  var autoT = 0;
  SETUP.code = function () {
    el.codeNum.textContent = formatPhone(flow.phone);
    el.codeCh.textContent = flow.channel === 'sms' ? 'par SMS' : 'sur WhatsApp';
    el.code.value = '';
    el.code.readOnly = false;
    verifying = false;
    el.otp.classList.remove('is-ok', 'is-bad');
    clearError(el.code, 'c-code-err');
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    if (txt) txt.textContent = 'Valider';
    el.resendPre.textContent = 'Pas reçu' + NB + '? Renvoyer le code dans';
    if (!flow.sentAt) { flow.sentAt = Date.now(); saveFlow(); }
    drawCells();
    startTimer();
  };

  function drawCells() {
    var v = el.code.value;
    cells.forEach(function (c, i) {
      c.textContent = v.charAt(i);
      c.classList.toggle('is-filled', i < v.length);
      c.classList.toggle('is-active', i === Math.min(v.length, cells.length - 1));
      c.style.setProperty('--i', String(i));
    });
  }
  function caretEnd() {
    try { var n = el.code.value.length; el.code.setSelectionRange(n, n); } catch (e) { /* ignore */ }
  }
  function onCodeInput() {
    var v = el.code.value.replace(/\D/g, '').slice(0, 6);
    if (v !== el.code.value) el.code.value = v;
    caretEnd();
    el.otp.classList.remove('is-bad');
    clearError(el.code, 'c-code-err');
    drawCells();
    clearTimeout(autoT);
    if (v.length === 6) autoT = setTimeout(verify, 220);
  }
  function onCodePaste(e) {
    var text = '';
    try { text = (e.clipboardData || root.clipboardData).getData('text'); } catch (x) { text = ''; }
    var d = String(text || '').replace(/\D/g, '');
    e.preventDefault();
    if (verifying) return;
    if (!d) { codeError('Ce texte ne contient pas de code. Collez les 6' + NB + 'chiffres reçus.'); return; }
    el.code.value = d.slice(0, 6);
    onCodeInput();
    if (d.length < 6) announce('Code collé' + NB + ': il manque ' + (6 - d.length) + ' chiffre' + (6 - d.length > 1 ? 's' : '') + '.');
  }
  function codeError(msg) {
    el.otp.classList.add('is-bad');
    setError(el.code, 'c-code-err', msg);
    reportAt(el.code, msg);
  }
  function verify() {
    if (verifying) return;
    clearTimeout(autoT);
    var v = el.code.value.replace(/\D/g, '');
    if (v.length !== 6) {
      var miss = 6 - v.length;
      codeError(v.length ? 'Il manque ' + miss + ' chiffre' + (miss > 1 ? 's' : '') + '. Tapez les 6' + NB + 'chiffres du code.' : 'Tapez les 6' + NB + 'chiffres du code.');
      return;
    }
    verifying = true;
    el.code.readOnly = true;
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    if (txt) txt.textContent = 'Vérification…';
    el.codeBtn.classList.add('is-busy');
    el.codeBtn.setAttribute('aria-disabled', 'true');
    announce('Vérification du code…');
    setTimeout(function () {
      el.otp.classList.add('is-ok');
      setTimeout(verified, 380);
    }, 520);
  }
  function verified() {
    el.codeBtn.classList.remove('is-busy');
    el.codeBtn.removeAttribute('aria-disabled');
    stopTimer();
    if (flow.mode === 'signup') {
      verifying = false;
      el.code.readOnly = false;
      flow.verified = true;
      saveFlow();
      announce('Code accepté.');
      // replace the code entry: Back from the store name goes to the number, not to a used code
      go('inscription', 'name', { replace: true });
      return;
    }
    var acc = readAccount();
    if (!acc || acc.phone !== flow.phone) { verifying = false; el.code.readOnly = false; go('connexion', 'login', { replace: true, focus: 'title' }); return; }
    acc.loggedIn = true;
    saveAccount(acc);
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    var hello = 'Bonjour' + (acc.firstName ? ' ' + acc.firstName : '') + NB + '! Ouverture du tableau de bord…';
    if (txt) txt.textContent = hello;
    announce(hello);
    flow = {};
    saveFlow();
    var next = SUITE ? SUITE.url : DASHBOARD;
    setTimeout(function () { try { root.location.assign(next); } catch (e) { root.location.href = next; } }, 650);
  }

  function startTimer() {
    stopTimer();
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  function tick() {
    var left = RESEND_S - Math.floor((Date.now() - (flow.sentAt || 0)) / 1000);
    left = Math.max(0, Math.min(RESEND_S, left));
    el.resendTime.textContent = '0:' + pad2(left);
    el.resendWait.hidden = left === 0;
    el.resendActs.hidden = left !== 0;
    if (left === 0) stopTimer();
  }
  function resend(channel) {
    if (verifying) return;
    var refocus = doc.activeElement === el.resend || doc.activeElement === el.resendSms;
    flow.sentAt = Date.now();
    flow.channel = channel;
    saveFlow();
    el.code.value = '';
    el.otp.classList.remove('is-bad');
    clearError(el.code, 'c-code-err');
    drawCells();
    el.codeCh.textContent = channel === 'sms' ? 'par SMS' : 'sur WhatsApp';
    el.resendPre.textContent = (channel === 'sms' ? 'Code demandé par SMS (démo).' : 'Nouveau code demandé (démo).') + ' Renvoi possible dans';
    startTimer();
    announce((channel === 'sms' ? 'Nouveau code demandé par SMS.' : 'Nouveau code demandé sur WhatsApp.') + ' Démo' + NB + ': rien n’est envoyé, tapez n’importe quel code à 6' + NB + 'chiffres.');
    if (refocus) { try { el.code.focus(); } catch (e) { /* ignore */ } }
  }
  function codeBack() {
    if (pushed && stateStep() === 'code') { try { root.history.back(); return; } catch (e) { /* fall through */ } }
    go(current.route, current.route === 'connexion' ? 'login' : 'signup', { replace: true, focus: 'title' });
  }

  // 3. The store name
  SETUP.name = function () {
    clearError(el.store, 'c-store-err');
    el.nameLead.textContent = (flow.firstName ? 'Merci, ' + flow.firstName + '. ' : '') + 'C’est le nom que vos clients verront. Vous pourrez le changer quand vous voulez.';
    var fromFiche = ficheName();
    if (!el.store.value) el.store.value = flow.storeName || fromFiche || '';
    drawAddress();
  };
  function drawAddress() {
    var v = clip(el.store.value, 40);
    el.addr.textContent = subdomainFor(v);
    var fromFiche = ficheName();
    // The store already saved on this device takes the name she types (dashboard and editor too)
    el.storeHint.hidden = !(fromFiche && v);
    el.storeHint.textContent = v === fromFiche
      ? 'Repris de la boutique enregistrée dans ce navigateur.'
      : 'La boutique enregistrée dans ce navigateur, ' + q(fromFiche) + ', prendra ce nouveau nom.';
  }
  function submitName(e) {
    if (e) e.preventDefault();
    if (busy) return;
    var name = clip(el.store.value, 40);
    el.store.value = name;
    if (!name) {
      var msg = 'Donnez un nom à votre boutique. Vous pourrez le changer plus tard.';
      setError(el.store, 'c-store-err', msg);
      return reportAt(el.store, msg);
    }
    clearError(el.store, 'c-store-err');
    if (flow.mode !== 'signup' || !flow.verified || !flow.phone) { go('inscription', 'signup', { replace: true, focus: 'title' }); return; }
    var prev = readAccount();
    var same = prev && prev.phone === flow.phone;
    var acc = {
      version: 1,
      firstName: flow.firstName,
      phone: flow.phone,
      storeName: name,
      createdAt: (same && prev.createdAt) || new Date().toISOString(),
      plan: (same && prev.plan) || 'gratuit',
      loggedIn: true
    };
    if (same && prev.studio) acc.studio = prev.studio; // her Studio subscription stays with her number
    var ok = saveAccount(acc);
    fillFiche(name, flow.phone, true);
    flow.created = true;
    flow.storeName = name;
    flow.saved = ok;
    saveFlow();
    busyButton(el.nameBtn, 'Création du compte…', 500, function () { go('inscription', 'start', { focus: 'title' }); });
  }

  // 4. How to start
  SETUP.start = function () {
    var acc = readAccount() || {};
    var first = acc.firstName || flow.firstName;
    var name = acc.storeName || flow.storeName;
    el.startLead.textContent = 'Bienvenue' + (first ? ', ' + first : '') + NB + '! Votre compte est prêt' +
      (name ? '. Il reste à donner vie à ' + q(name) + '.' : '.');
    var f = readFiche();
    if (f && f.store) {
      el.startFiche.textContent = 'Votre boutique ' + q(clip(f.store.name, 40) || name) + ' est déjà enregistrée dans ce navigateur' + NB + ': l’éditeur et le tableau de bord la reprennent.';
      el.startFiche.hidden = false;
    } else el.startFiche.hidden = true;
    el.saveWarn.hidden = flow.saved !== false;
    // Coming from the Studio or the pricing page: that comes first
    var li = $('c-go-studio-li');
    if (li) {
      li.hidden = !SUITE;
      if (SUITE) { $('c-go-studio').setAttribute('href', SUITE.url); $('c-go-studio-t').textContent = SUITE.title; $('c-go-studio-d').textContent = SUITE.text; }
    }
  };
  // The Studio subscription, in words (« Pro · annuel, jusqu'au 5 novembre 2027 »)
  function studioSummary() {
    var P = root.JeerePlans;
    if (!P) return 'Découverte (gratuit)';
    var s = P.state();
    if (s.status === 'trial') return 'Essai, encore ' + s.daysLeft + NB + 'jour' + (s.daysLeft > 1 ? 's' : '');
    if (s.status === 'active') return s.plan.name + ' · ' + (s.period === 'an' ? 'annuel' : 'mensuel') + ', renouvellement le ' + P.date(s.periodEnd);
    if (s.status === 'canceling') return s.plan.name + ', jusqu’au ' + P.date(s.periodEnd);
    if (s.status === 'due') return s.plan.name + ', à renouveler';
    return 'Découverte (gratuit)';
  }

  // Already signed in on this device
  SETUP.session = function () {
    var acc = readAccount();
    if (!acc) { go('inscription', 'signup', { replace: true, focus: 'none' }); return; }
    el.meAv.textContent = initial(acc.firstName || acc.storeName);
    el.sessionT.textContent = 'Bonjour' + (acc.firstName ? ' ' + acc.firstName : '');
    el.sumStore.textContent = acc.storeName || ficheName() || 'Pas encore de nom';
    el.sumPhone.textContent = formatPhone(acc.phone);
    el.sumPlan.textContent = planName(acc.plan);
    var sd = $('c-sum-studio');
    if (sd) sd.textContent = studioSummary();
    var nx = $('c-studio-next');
    if (nx) { nx.hidden = !SUITE; if (SUITE) { nx.setAttribute('href', SUITE.url); $('c-studio-next-t').textContent = SUITE.cta; } }
  };
  function logout() {
    var acc = readAccount();
    if (acc) { acc.loggedIn = false; saveAccount(acc); }
    flow = {};
    saveFlow();
    announce('Déconnexion réussie.');
    go('connexion', 'login', { replace: true, focus: 'title' });
  }

  /* ------------------------------------------------------------------ start */

  function fillCountries(select) {
    if (!select) return;
    select.innerHTML = '';
    COUNTRIES.forEach(function (c, i) {
      var o = doc.createElement('option');
      o.value = c[0];
      o.textContent = c[1] + ' +' + c[0];
      o.setAttribute('aria-label', c[2] + ' +' + c[0]);
      if (i === 0) o.selected = true;
      select.appendChild(o);
    });
  }

  function bind() {
    fillCountries(el.cc);
    fillCountries(el.lcc);

    el.formSignup.addEventListener('submit', submitSignup);
    el.first.addEventListener('input', function () { if (el.first.value.trim()) clearError(el.first, 'c-first-err'); });
    el.first.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (el.first.value.trim()) el.phone.focus(); else submitSignup(); }
    });
    el.phone.addEventListener('input', function () { clearError(el.phone, 'c-phone-err'); el.same.hidden = true; });
    el.cc.addEventListener('change', function () { clearError(el.phone, 'c-phone-err'); el.same.hidden = true; });
    el.phone.addEventListener('blur', function () {
      var p = parsePhone(el.cc.value, el.phone.value);
      if (p.cc && !p.intl && p.national) { if (p.cc !== el.cc.value) el.cc.value = p.cc; el.phone.value = nationalDisplay(p.cc, p.national); }
    });
    el.sameBtn.addEventListener('click', useSameNumber);

    el.formLogin.addEventListener('submit', submitLogin);
    el.lphone.addEventListener('input', function () {
      clearError(el.lphone, 'c-lphone-err');
      if (!el.nomatch.hidden) { el.nomatch.hidden = true; el.loginBtn.hidden = false; }
    });
    el.lcc.addEventListener('change', function () {
      clearError(el.lphone, 'c-lphone-err');
      if (!el.nomatch.hidden) { el.nomatch.hidden = true; el.loginBtn.hidden = false; }
    });
    el.lphone.addEventListener('blur', function () {
      var p = parsePhone(el.lcc.value, el.lphone.value);
      if (p.cc && !p.intl && p.national) { if (p.cc !== el.lcc.value) el.lcc.value = p.cc; el.lphone.value = nationalDisplay(p.cc, p.national); }
    });
    el.known.addEventListener('click', useKnown);
    el.nomatchCreate.addEventListener('click', nomatchCreate);
    el.nomatchRetry.addEventListener('click', nomatchRetry);

    el.formCode.addEventListener('submit', function (e) { e.preventDefault(); verify(); });
    el.code.addEventListener('input', onCodeInput);
    el.code.addEventListener('paste', onCodePaste);
    el.code.addEventListener('focus', function () { el.otp.classList.add('is-focus'); setTimeout(caretEnd, 0); });
    el.code.addEventListener('blur', function () { el.otp.classList.remove('is-focus'); });
    ['click', 'keyup', 'select'].forEach(function (ev) { el.code.addEventListener(ev, function () { setTimeout(caretEnd, 0); }); });
    el.codeBack.addEventListener('click', codeBack);
    el.resend.addEventListener('click', function () { resend('whatsapp'); });
    el.resendSms.addEventListener('click', function () { resend('sms'); });

    el.formName.addEventListener('submit', submitName);
    el.store.addEventListener('input', function () { clearError(el.store, 'c-store-err'); drawAddress(); });

    el.logout.addEventListener('click', logout);

    root.addEventListener('popstate', onNav);
    root.addEventListener('hashchange', onNav);
    // The account changed in another tab (log-out, deleted in the dashboard) or the page came back
    // from the browser cache: show the screen that matches it now
    root.addEventListener('storage', function (e) { if (!e.key || e.key === ACCOUNT_KEY) refreshFromStorage(); });
    root.addEventListener('pageshow', function (e) { if (e.persisted) refreshFromStorage(); });
  }
  function refreshFromStorage() {
    var v = resolve();
    // Never interrupt a sign-up or login in progress (its steps do not depend on the saved account)
    if ((current.step === 'code' || current.step === 'name') && v.step === current.step) return;
    if (v.route === current.route && v.step === current.step && v.step !== 'session') return;
    show(v, { focus: 'none' });
  }

  function init() {
    bind();
    var v = resolve();
    // the first entry carries its step too, so Back inside the page always knows where it is
    try { root.history.replaceState({ jc: v.step }, '', root.location.href); } catch (e) { /* ignore */ }
    show(v, { focus: 'none' });
  }

  root.JeereCompte = { parsePhone: parsePhone, formatPhone: formatPhone, maskPhone: maskPhone };

  try { init(); } catch (e) {
    // never leave an empty card: show the sign-up form, which works without the rest
    sections.forEach(function (sec) { sec.hidden = sec.getAttribute('data-step') !== 'signup'; });
    if (root.console && root.console.error) root.console.error(e);
  }
})();
