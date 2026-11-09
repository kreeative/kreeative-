/* Jeere — the seller account (../compte/): sign-up and login with a one-time code, no password.
 *
 *   #inscription  prénom + « Recevoir mon code par » e-mail (default) / SMS / WhatsApp ─► code reçu (6 à 10 chiffres)
 *                 ─► nom de la boutique ─► « Comment voulez-vous commencer ? »
 *   #connexion    e-mail or number ─► code ─► ../admin/   (an address with no account: offer to create one)
 *   (no hash)     #inscription when there is no account, #connexion when it is logged out, « Bonjour Awa » when it is open
 *
 * Real accounts go through ./auth.js (window.JeereAuth): Supabase Auth sends the code (e-mail OTP
 * today; SMS and WhatsApp once an SMS provider is configured in the Supabase dashboard), the
 * profile lives in public.profiles, and the account is mirrored to localStorage 'jeere-account'
 * so the editor, the dashboard, the Studio and the plans work unchanged.
 * DEMO (« Mode démo » on the screen: ?demo=1, localhost, or Supabase unreachable): nothing is sent
 * and any code of 6 digits or more is accepted.
 *
 * 'jeere-account' = { version: 1, firstName, phone, storeName, createdAt, plan, loggedIn, email?, userId?,
 * method?, studio? }, through JEERE_DATA.normalizeAccount (a usable number or e-mail is required; phone is ''
 * when she gave none). When a fiche boutique exists ('jeere-studio-config'), sign-up fills its store.name and
 * store.whatsapp only if they are empty, through JEERE_DATA.normalizeConfig. The step in progress (method,
 * address or number, first name, when the code was asked) is kept in sessionStorage ('jeere-compte-flow') so a
 * reload, or Android closing the tab while she reads the code, does not start everything again. Every storage
 * access is in try/catch: blocked storage still works for this page.
 *
 * Steps are history entries (history.state.jc), so the phone's Back button goes back one step.
 * Exposes window.JeereCompte = { parsePhone, formatPhone, maskPhone, maskEmail, normEmail } (pure helpers, for tests).
 */
(function () {
  'use strict';

  var root = window;
  var doc = document;
  var D = root.JEERE_DATA || {};
  var A = root.JeereAuth || null;
  var NB = ' ';

  var KEYS = (D.STORAGE_KEYS && typeof D.STORAGE_KEYS === 'object') ? D.STORAGE_KEYS : {};
  var CONFIG_KEY = KEYS.config || 'jeere-studio-config';
  var ACCOUNT_KEY = KEYS.account || 'jeere-account';
  var FLOW_KEY = 'jeere-compte-flow';
  var RESEND_S = 60;
  var DASHBOARD = '../admin/';
  var METHODS = ['email', 'sms', 'whatsapp'];
  // « ?suite=studio » (the Studio's trial sheet) or « ?suite=abonnements&plan=pro&periode=an » (the
  // pricing page's checkout): where she goes once her account is ready. Only these two targets.
  var SUITE = (function () {
    var q = '';
    try { q = root.location.search || ''; } catch (e) { q = ''; }
    var m = /[?&]suite=(studio-publier|publier|studio|abonnements)(?:&|$)/.exec(q);
    if (!m) return null;
    // « Se connecter pour publier » (creer/publish.js): back to the editor or the Studio, the publish dialog open
    if (m[1] === 'publier') return { id: 'publier', publish: true, url: '../creer/#publier', title: 'Publier ma boutique', text: 'Retour à l’éditeur, la publication est ouverte.', cta: 'Publier ma boutique' };
    if (m[1] === 'studio-publier') return { id: 'studio-publier', publish: true, url: '../studio/#publier', title: 'Publier ma boutique', text: 'Retour au Studio, la publication est ouverte.', cta: 'Publier ma boutique' };
    if (m[1] === 'studio') return { id: 'studio', url: '../studio/?essai=1', title: 'Démarrer mon essai du Studio', text: '14 jours de Studio complet, gratuits. Aucun moyen de paiement demandé.', cta: 'Démarrer mon essai du Studio' };
    var plan = /[?&]plan=(solo|pro|agence)(?:&|$)/.exec(q);
    var per = /[?&]periode=(mois|an)(?:&|$)/.exec(q);
    var url = '../abonnements/?' + (plan ? 'plan=' + plan[1] + '&' : '') + 'periode=' + (per ? per[1] : 'an') + '#paiement';
    return { id: 'abonnements', url: url, title: 'Reprendre mon abonnement Studio', text: 'Votre formule et votre période sont gardées : il reste le paiement.', cta: 'Reprendre mon abonnement Studio' };
  })();
  // An e-mail link (the template sends a link as well as, or instead of, the code) lands here with
  // #access_token=… or #error=…: remembered before anything rewrites the URL
  var LINK = (function () {
    var h = '';
    try { h = root.location.hash || ''; } catch (e) { h = ''; }
    if (/access_token=/.test(h)) return { ok: true };
    if (/error(_code|_description)?=/.test(h)) return { ok: false, expired: /otp_expired|expired/i.test(decodeURIComponent(h)) };
    return null;
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
  function demo() { return !A || A.isDemo(); }

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

  /* ---------- e-mail addresses ---------- */

  var EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
  function normEmail(raw) { return String(raw == null ? '' : raw).replace(/\s+/g, '').toLowerCase().slice(0, 254); }
  function emailError(v) {
    if (!v) return 'Écrivez votre adresse e-mail.';
    if (!EMAIL_RE.test(v)) return 'Cette adresse e-mail semble incomplète. Exemple' + NB + ': awa@gmail.com';
    return '';
  }
  // 'awa.kone@gmail.com' → 'a•••e@gmail.com'
  function maskEmail(email) {
    if (A && A.maskEmail) return A.maskEmail(email);
    var m = /^([^@]+)@(.+)$/.exec(String(email || ''));
    if (!m) return '';
    return (m[1].length <= 2 ? m[1].charAt(0) + '•' : m[1].charAt(0) + '•••' + m[1].charAt(m[1].length - 1)) + '@' + m[2];
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
  function phoneError(p, what) {
    if (!p.national) return 'Écrivez votre ' + (what || 'numéro') + '.';
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
        var ph = normWa(typeof src.phone === 'string' ? src.phone : '');
        var em = normEmail(src.email);
        a = {
          version: 1, firstName: clip(src.firstName, 40), phone: /^\+\d{8,15}$/.test(ph) ? ph : '',
          storeName: clip(src.storeName, 40), createdAt: isFinite(t) ? new Date(t).toISOString() : '', plan: plan,
          loggedIn: src.loggedIn === true
        };
        if (EMAIL_RE.test(em)) a.email = em;
        if (typeof src.userId === 'string') a.userId = src.userId;
        if (METHODS.indexOf(src.method) !== -1) a.method = src.method;
        if (src.studio && typeof src.studio === 'object') a.studio = src.studio;
      }
    }
    if (!a || typeof a !== 'object' || (!/^\+\d{8,15}$/.test(a.phone || '') && !a.email)) return null; // no number nor e-mail: no account
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
  // How she identifies herself: the e-mail for an e-mail account, else the number
  function accMethod(acc) { return acc && METHODS.indexOf(acc.method) !== -1 ? acc.method : (acc && acc.email ? 'email' : 'sms'); }
  function accLabel(acc) {
    var m = accMethod(acc);
    if (m === 'email' && acc.email) return maskEmail(acc.email);
    return acc.phone ? maskPhone(acc.phone) : maskEmail(acc.email);
  }
  function sameIdentity(acc, f) {
    if (!acc) return false;
    if (f.method === 'email') return !!(acc.email && f.email && acc.email === f.email);
    return !!(acc.phone && f.phone && acc.phone === f.phone);
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

  // flow = { mode, method, firstName, email, phone (where the code goes, SMS/WhatsApp), profilePhone (her
  // WhatsApp number for orders), cc, national, sentAt, real (the code was sent for real), verified, created,
  // saved, storeName }
  var flow = loadFlow();
  function loadFlow() {
    var raw = sessGet(FLOW_KEY);
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    var okPhone = function (v) { return typeof v === 'string' && /^\+\d{8,15}$/.test(v) ? v : ''; };
    var out = {
      mode: o.mode === 'signup' || o.mode === 'login' ? o.mode : '',
      method: METHODS.indexOf(o.method) !== -1 ? o.method : (okPhone(o.phone) && !o.email ? 'sms' : 'email'),
      firstName: clip(o.firstName, 40),
      email: typeof o.email === 'string' && EMAIL_RE.test(o.email) ? o.email : '',
      phone: okPhone(o.phone),
      profilePhone: okPhone(o.profilePhone),
      cc: typeof o.cc === 'string' ? o.cc : '',
      national: typeof o.national === 'string' ? o.national.replace(/\D/g, '').slice(0, 15) : '',
      sentAt: typeof o.sentAt === 'number' && isFinite(o.sentAt) ? o.sentAt : 0,
      real: o.real === true,
      verified: o.verified === true,
      created: o.created === true,
      saved: o.saved !== false,
      storeName: clip(o.storeName, 40)
    };
    if (o.prefill && typeof o.prefill === 'object') out.prefill = o.prefill;
    return out;
  }
  function saveFlow() { sessSet(FLOW_KEY, JSON.stringify(flow)); }
  function flowDest(f) { return f.method === 'email' ? f.email : f.phone; }

  /* ------------------------------------------------------------------ elements */

  var el = {
    progress: $('c-progress'), bar: $('c-progress-bar'), ptxt: $('c-progress-txt'),
    live: $('c-live'), alert: $('c-alert'),
    modebar: $('c-modebar'), modeTxt: $('c-modebar-txt'), modeRetry: $('c-modebar-retry'),
    realTxt: $('c-real-txt'), footTxt: $('c-foot-txt'),
    // sign-up
    exists: $('c-exists'), existsTxt: $('c-exists-txt'), formSignup: $('c-form-signup'),
    first: $('c-first'), email: $('c-email'), emailField: $('c-email-field'), emailUseSms: $('c-email-use-sms'),
    cc: $('c-cc'), phone: $('c-phone'), phoneField: $('c-phone-field'), phoneLabel: $('c-phone-label'), phoneHint: $('c-phone-hint'),
    same: $('c-same'), sameBtn: $('c-same-login'), signupBtn: $('c-signup-btn'),
    off: $('c-off'), offT: $('c-off-t'), offEmail: $('c-off-email'), methodHint: $('c-method-hint'),
    fail: $('c-signup-fail'), failT: $('c-signup-fail-t'), failDemo: $('c-signup-demo'),
    // login
    loginNote: $('c-login-note'), loginNoteT: $('c-login-note-t'),
    known: $('c-known'), knownAv: $('c-known-av'), knownName: $('c-known-name'), knownNum: $('c-known-num'), knownOr: $('c-known-or'),
    formLogin: $('c-form-login'), lemail: $('c-lemail'), lemailField: $('c-lemail-field'),
    lcc: $('c-lcc'), lphone: $('c-lphone'), lphoneField: $('c-lphone-field'), lphoneLabel: $('c-lphone-label'), loginBtn: $('c-login-btn'),
    loff: $('c-l-off'), loffT: $('c-l-off-t'), loffEmail: $('c-l-off-email'), lmethodHint: $('c-l-method-hint'),
    lfail: $('c-login-fail'), lfailT: $('c-login-fail-t'), lfailDemo: $('c-login-demo'),
    nomatch: $('c-nomatch'), nomatchT: $('c-nomatch-t'), nomatchD: $('c-nomatch-d'), nomatchCreate: $('c-nomatch-create'), nomatchRetry: $('c-nomatch-retry'), nomatchDemo: $('c-nomatch-demo'),
    // code
    codeBack: $('c-code-back'), codeBackT: $('c-code-back-t'), codeLead: $('c-code-lead'), codeHint: $('c-code-hint'), demoBox: $('c-demo'), formCode: $('c-form-code'),
    otp: $('c-otp'), code: $('c-code'), codeBtn: $('c-code-btn'),
    resendWait: $('c-resend-wait'), resendPre: $('c-resend-pre'), resendTime: $('c-resend-time'), resendActs: $('c-resend-acts'),
    resend: $('c-resend'), other: $('c-other'), resendMsg: $('c-resend-msg'),
    // store name
    nameLead: $('c-name-lead'), formName: $('c-form-name'), store: $('c-store'), storeHint: $('c-store-hint'), addr: $('c-addr-v'), nameBtn: $('c-name-btn'),
    // start
    startLead: $('c-start-lead'), startFiche: $('c-start-fiche'), saveWarn: $('c-save-warn'),
    // session
    meAv: $('c-me-av'), meSub: $('c-me-sub'), sessionT: $('c-session-t'), sumStore: $('c-sum-store'), sumPhone: $('c-sum-phone'), sumPlan: $('c-sum-plan'),
    sumEmail: $('c-sum-email'), sumEmailRow: $('c-sum-email-row'), logout: $('c-logout'),
    waitLead: $('c-wait-lead')
  };
  if (!el.formSignup || !el.formCode) return; // not this page
  /* The code is 6 to 10 digits: Supabase's « Email OTP Length » decides (6 by default, 8 on some projects). The page
   * follows whatever arrives: the boxes grow with the digits, a pasted code is checked at once, a typed one after a
   * short pause once it has at least 6 digits. */
  var CODE_MIN = 6, CODE_MAX = 10;
  var cells = el.otp ? Array.prototype.slice.call(el.otp.querySelectorAll('.c-otp__cell')) : [];
  function layoutCells(n) {
    var wrap = el.otp && el.otp.querySelector('.c-otp__cells');
    if (!wrap || cells.length === n) return;
    var half = n % 2 === 0 ? n / 2 : -1, html = '', cols = [];
    for (var i = 0; i < n; i++) {
      if (i === half) { html += '<span class="c-otp__sep"></span>'; cols.push('12px'); }
      html += '<span class="c-otp__cell"></span>'; cols.push('minmax(0, 1fr)');
    }
    wrap.innerHTML = html;
    wrap.style.gridTemplateColumns = cols.join(' ');
    wrap.style.gap = n > 6 ? '5px' : '';
    cells = Array.prototype.slice.call(wrap.querySelectorAll('.c-otp__cell'));
  }
  var sections = Array.prototype.slice.call(doc.querySelectorAll('.c-step[data-step]'));

  var TITLES = {
    signup: 'Créer un compte', login: 'Se connecter', code: 'Entrez le code', name: 'Le nom de votre boutique',
    start: 'Bienvenue', session: 'Votre compte', wait: 'Connexion'
  };
  var FLOWS = { inscription: ['signup', 'code', 'name', 'start'], connexion: ['login', 'code'] };
  // SMS and WhatsApp count as off until the project's settings say its phone provider is on (probe())
  var providers = { email: true, sms: false, whatsapp: false };

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
  // busyStart(btn, label) → end(): a spinner and a label while something is on its way
  function busyStart(btn, label) {
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
    return function () {
      busy = false;
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-disabled');
      if (spin.parentNode) spin.parentNode.removeChild(spin);
      if (txt) txt.textContent = before;
    };
  }
  function busyButton(btn, label, ms, done) {
    var end = busyStart(btn, label);
    setTimeout(function () { end(); done(); }, ms);
  }

  /* ------------------------------------------------------------------ the mode (real / demo) */

  function drawMode() {
    var d = demo();
    var why = A ? A.why() : 'nojs';
    if (el.modebar) {
      el.modebar.hidden = !d;
      if (el.modeTxt) {
        el.modeTxt.textContent = why === 'offline'
          ? 'Jeere est injoignable pour l’instant (pas de connexion ?). Vous pouvez essayer quand même' + NB + ': rien n’est envoyé, le compte reste dans ce navigateur.'
          : why === 'local'
            ? 'Version locale' + NB + ': aucun code n’est envoyé, votre compte reste dans ce navigateur.'
            : 'Aucun code n’est envoyé' + NB + ': votre compte reste dans ce navigateur.';
      }
      if (el.modeRetry) el.modeRetry.hidden = why !== 'offline';
    }
    if (el.nomatchDemo) el.nomatchDemo.hidden = !d;
    if (el.realTxt) {
      el.realTxt.textContent = d
        ? 'Mode démo' + NB + ': dans le vrai Jeere, vous entrez avec un code à usage unique, reçu ' + channelsText() + '. Pas de mot de passe.'
        : 'Pas de mot de passe à retenir' + NB + ': vous entrez avec un code à usage unique, reçu ' + channelsText() + '.';
    }
    if (el.footTxt) {
      el.footTxt.textContent = d
        ? 'Mode démo Jeere' + NB + ': votre compte reste dans ce navigateur, rien n’est envoyé. Un concept Kreeative.'
        : 'Votre compte Jeere est enregistré de façon sécurisée. Un concept Kreeative.';
    }
    drawProviders();
    drawMethod('signup');
    drawMethod('login');
  }
  // A method that is not switched on is not shown at all (real mode): no « bientôt ». SMS and WhatsApp appear by
  // themselves once a phone provider is on in Supabase (probed at load). With e-mail alone, the choice itself goes:
  // the hint under it says the code comes by e-mail. The demo (local only) keeps every method, it sends nothing.
  // « par e-mail », or « par e-mail, par SMS ou sur WhatsApp »: only the ways that are switched on
  function channelsText() {
    var on = ['par e-mail'];
    if (demo() || providers.sms) on.push('par SMS');
    if (demo() || providers.whatsapp) on.push('sur WhatsApp');
    return on.length === 1 ? on[0] : on.slice(0, -1).join(', ') + ' ou ' + on[on.length - 1];
  }
  function drawChannelTexts() {
    var one = !demo() && !providers.sms && !providers.whatsapp;
    var lead = doc.getElementById('c-signup-lead');
    if (lead) lead.innerHTML = one ? 'Votre prénom et votre adresse e-mail&nbsp;: vous recevez un code de connexion. Pas de mot de passe à retenir.'
      : 'Votre prénom, puis où recevoir votre code de connexion. Pas de mot de passe à retenir.';
    // with e-mail alone, the line under the (hidden) choice repeats the e-mail field's hint: hidden too
    ['c-method-hint', 'c-l-method-hint'].forEach(function (id) { var h = doc.getElementById(id); if (h) h.hidden = one; });
  }
  function drawProviders() {
    drawChannelTexts();
    ['method', 'lmethod'].forEach(function (name) {
      var list = radios(name);
      var shown = 0;
      list.forEach(function (r) {
        var off = r.value !== 'email' && !demo() && !providers[r.value];
        var lab = r.closest ? r.closest('label') : null;
        r.disabled = off;
        if (lab) lab.hidden = off;
        if (off && r.checked) { r.checked = false; list.forEach(function (x) { if (x.value === 'email') x.checked = true; }); }
        if (!off) shown++;
      });
      var fs = list[0] && list[0].closest ? list[0].closest('fieldset') : null;
      if (fs) fs.hidden = shown < 2;   // e-mail alone: no choice to make
    });
  }

  /* ------------------------------------------------------------------ « Recevoir mon code par » */

  function radios(name) { return Array.prototype.slice.call(doc.querySelectorAll('input[name="' + name + '"]')); }
  function methodOf(scope) {
    var r = radios(scope === 'login' ? 'lmethod' : 'method').filter(function (x) { return x.checked; })[0];
    return r && METHODS.indexOf(r.value) !== -1 ? r.value : 'email';
  }
  function setMethod(scope, m) {
    radios(scope === 'login' ? 'lmethod' : 'method').forEach(function (x) { x.checked = x.value === m; });
    drawMethod(scope);
  }
  var HINTS = {
    email: 'Un code gratuit, dans votre boîte e-mail.',
    sms: 'Un code par SMS, même sans Internet.',
    whatsapp: 'Si vous utilisez déjà WhatsApp sur ce numéro. L’e-mail reste le plus simple.'
  };
  function offText(m) {
    if (A && A.describeError) return A.describeError({ code: 'phone_provider_disabled' }, m).text;
    return 'Les codes ' + (m === 'whatsapp' ? 'sur WhatsApp' : 'par SMS') + ' ne sont pas encore activés sur Jeere. Recevez votre code par e-mail pour l’instant.';
  }
  function drawMethod(scope) {
    var m = methodOf(scope);
    var login = scope === 'login';
    var hint = login ? el.lmethodHint : el.methodHint;
    if (hint) hint.textContent = HINTS[m];
    // Real mode and the project has no SMS provider yet: say so as soon as she picks it
    var off = login ? el.loff : el.off;
    var offT = login ? el.loffT : el.offT;
    if (off) {
      var unavailable = m !== 'email' && !demo() && !providers[m];
      off.hidden = !unavailable;
      if (unavailable) offT.textContent = offText(m);
    }
    var btn = login ? el.loginBtn : el.signupBtn;
    var bt = btn && btn.querySelector('.c-btn__txt');
    if (bt && !btn.classList.contains('is-busy')) bt.textContent = m === 'email' ? 'Recevoir mon code par e-mail' : m === 'sms' ? 'Recevoir mon code par SMS' : 'Recevoir mon code sur WhatsApp';
    if (login) {
      el.lemailField.hidden = m !== 'email';
      el.lphoneField.hidden = m === 'email';
      el.lphoneLabel.textContent = m === 'whatsapp' ? 'Numéro WhatsApp' : 'Numéro de téléphone';
      if (m === 'email') clearError(el.lphone, 'c-lphone-err'); else clearError(el.lemail, 'c-lemail-err');
      if (el.nomatch && !el.nomatch.hidden) { el.nomatch.hidden = true; el.loginBtn.hidden = false; }
      if (el.lfail) el.lfail.hidden = true;
      return;
    }
    el.emailField.hidden = m !== 'email';
    if (m !== 'email') { clearError(el.email, 'c-email-err'); el.emailUseSms.hidden = true; }
    // One number field: optional in e-mail mode (her WhatsApp number for orders), where the code goes otherwise
    el.phoneLabel.innerHTML = '';
    if (m === 'email') {
      el.phoneLabel.appendChild(doc.createTextNode('Numéro WhatsApp '));
      var o = doc.createElement('span');
      o.className = 'c-opt';
      o.textContent = '(facultatif)';
      el.phoneLabel.appendChild(o);
      el.phoneHint.textContent = 'Celui où vous recevez vos commandes. Vous pourrez l’ajouter plus tard.';
    } else {
      el.phoneLabel.textContent = m === 'whatsapp' ? 'Numéro WhatsApp' : 'Numéro de téléphone';
      el.phoneHint.textContent = m === 'whatsapp' ? 'Le code arrive dans WhatsApp. Ce numéro sert aussi pour vos commandes.' : 'Le code arrive par SMS. Ce numéro sert aussi pour vos commandes.';
    }
    el.phone.setAttribute('enterkeyhint', 'send');
    if (el.fail) el.fail.hidden = true;
  }

  /* ------------------------------------------------------------------ routing */

  var current = { route: '', step: '' };
  var pushed = false; // a step entry was pushed by this page (so « Changer d'adresse » can go Back)

  function hashRoute() {
    var h = '';
    try { h = (root.location.hash || '').replace(/^#/, ''); } catch (e) { h = ''; }
    return h === 'inscription' || h === 'connexion' ? h : '';
  }
  function stateStep() {
    try { var s = root.history.state; return s && typeof s.jc === 'string' ? s.jc : ''; } catch (e) { return ''; }
  }
  // A local or demo account (no Supabase user) while the real Jeere answers: it cannot publish, so
  // « connexion » is a real sign-in for it, not « Bonjour Test » (wave 2 of the Studio audit)
  function localOnly(acc) { return !!(acc && acc.loggedIn && !acc.userId && !demo()); }
  function resolve() {
    var acc = readAccount();
    var r = hashRoute();
    if (!r) r = acc ? (acc.loggedIn && !(localOnly(acc) && SUITE && SUITE.publish) ? 'session' : 'connexion') : 'inscription';
    if (r === 'connexion' && acc && acc.loggedIn && !localOnly(acc)) r = 'session';
    var want = stateStep();
    var step;
    if (r === 'inscription') {
      if (want === 'code' && flow.mode === 'signup' && flowDest(flow) && !flow.verified) step = 'code';
      else if (want === 'name' && flow.mode === 'signup' && flow.verified && (flowDest(flow) || flow.real)) step = 'name';
      else if (want === 'start' && flow.created && acc && acc.loggedIn) step = 'start';
      else step = 'signup';
    } else if (r === 'connexion') {
      step = (want === 'code' && flow.mode === 'login' && flowDest(flow) && (flow.real || sameIdentity(acc, flow))) ? 'code' : 'login';
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
    if (current.step === 'wait') return; // an e-mail link is being finished
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

  /* ------------------------------------------------------------------ sending a code (real or demo) */

  // Real mode: ask Supabase; demo: a short pause. cb(error|null, { real })
  function requestCode(f, create, cb) {
    if (demo()) { setTimeout(function () { cb(null, { real: false }); }, 450); return; }
    A.probe().then(function (info) {
      providers = info.providers || providers;
      if (info.demo) { drawMode(); cb(null, { real: false }); return; } // Supabase unreachable: demo, said on screen
      var data = { first_name: f.firstName || undefined };
      if (f.profilePhone) data.phone = f.profilePhone;
      A.sendCode({ method: f.method, email: f.email, phone: f.phone, create: create, data: data }).then(function (r) {
        if (r.ok) cb(null, { real: true }); else cb(r.error, null);
      });
    });
  }
  // Show what went wrong while asking for a code, in the right place. scope: 'signup' | 'login'
  function showSendError(scope, err, method) {
    var login = scope === 'login';
    if (err.kind === 'provider') {
      var off = login ? el.loff : el.off;
      (login ? el.loffT : el.offT).textContent = err.text;
      off.hidden = false;
      reveal(off);
      announce(err.text, true);
      return;
    }
    if (err.kind === 'invalid') {
      if (method === 'email') {
        var ei = login ? el.lemail : el.email;
        setError(ei, login ? 'c-lemail-err' : 'c-email-err', err.text);
        return reportAt(ei, err.text);
      }
      var pi = login ? el.lphone : el.phone;
      setError(pi, login ? 'c-lphone-err' : 'c-phone-err', err.text);
      return reportAt(pi, err.text);
    }
    var box = login ? el.lfail : el.fail;
    (login ? el.lfailT : el.failT).textContent = err.text;
    (login ? el.lfailDemo : el.failDemo).hidden = err.kind !== 'network';
    box.hidden = false;
    reveal(box);
    announce(err.text, true);
  }

  /* ------------------------------------------------------------------ the steps */

  var SETUP = {};

  // 1. Sign-up: first name, method, e-mail or number
  SETUP.signup = function () {
    var acc = readAccount();
    el.same.hidden = true;
    el.fail.hidden = true;
    el.emailUseSms.hidden = true;
    clearError(el.first, 'c-first-err');
    clearError(el.email, 'c-email-err');
    clearError(el.phone, 'c-phone-err');
    if (acc) {
      el.existsTxt.textContent = acc.loggedIn
        ? 'Le compte de ' + (acc.firstName || 'ce vendeur') + ' (' + accLabel(acc) + ') est ouvert sur cet appareil. En créer un nouveau le remplacera.'
        : 'Un compte Jeere existe déjà sur cet appareil (' + (acc.firstName ? acc.firstName + ', ' : '') + accLabel(acc) + '). En créer un nouveau le remplacera.';
      var link = el.exists.querySelector('a');
      if (link) link.textContent = acc.loggedIn ? 'Voir mon compte' : 'Se connecter plutôt';
      el.exists.hidden = false;
    } else el.exists.hidden = true;
    if (flow.prefill) {
      // « Créer un compte » from the login screen: the address or number she typed there
      var pf = flow.prefill;
      if (METHODS.indexOf(pf.method) !== -1) setMethod('signup', pf.method);
      if (pf.email) el.email.value = pf.email;
      if (pf.cc) el.cc.value = pf.cc;
      if (pf.national) el.phone.value = nationalDisplay(el.cc.value, pf.national || '');
      delete flow.prefill;
      saveFlow();
    } else if (flow.mode === 'signup' && !flow.created && (flow.email || flow.phone || flow.profilePhone) && !el.email.value && !el.phone.value && !el.first.value) {
      // after a reload: what she had typed
      el.first.value = flow.firstName;
      setMethod('signup', flow.method);
      el.email.value = flow.email;
      if (flow.cc) el.cc.value = flow.cc;
      el.phone.value = nationalDisplay(el.cc.value, flow.national);
    }
    drawMethod('signup');
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
    el.fail.hidden = true;
    el.emailUseSms.hidden = true;
    var method = methodOf('signup');
    var first = clip(el.first.value, 40);
    el.first.value = first;
    var email = normEmail(el.email.value);
    el.email.value = email;
    var hasNum = !!el.phone.value.trim();
    var p = hasNum || method !== 'email' ? readPhoneField(el.cc, el.phone) : null;
    var err1 = first ? '' : 'Écrivez votre prénom.';
    var errE = method === 'email' ? emailError(email) : '';
    var errP = p ? phoneError(p, method === 'whatsapp' ? 'numéro WhatsApp' : 'numéro') : '';
    if (err1) setError(el.first, 'c-first-err', err1); else clearError(el.first, 'c-first-err');
    if (errE) setError(el.email, 'c-email-err', errE); else clearError(el.email, 'c-email-err');
    if (errP) setError(el.phone, 'c-phone-err', errP); else clearError(el.phone, 'c-phone-err');
    // No e-mail but a good number: offer the SMS in one tap
    if (method === 'email' && !email && p && !errP) el.emailUseSms.hidden = false;
    if (err1) return reportAt(el.first, err1);
    if (errE) return reportAt(el.email, errE);
    if (errP) return reportAt(el.phone, errP);
    // her consent, required before the account exists (date kept with the account)
    var agree = document.getElementById('c-agree');
    if (agree && !agree.checked) { setError(agree, 'c-agree-err', 'Cochez la case pour accepter la politique de confidentialité et les conditions d’utilisation.'); return reportAt(agree, 'Acceptez les conditions pour créer votre compte.'); }
    if (agree) { clearError(agree, 'c-agree-err'); try { localStorage.setItem('jeere-consent', JSON.stringify({ at: new Date().toISOString(), version: '2026-11' })); } catch (x) { /* ok */ } }
    var phone = p ? normWa(p.e164) : '';
    var f = {
      mode: 'signup', method: method, firstName: first, email: method === 'email' ? email : '',
      phone: method === 'email' ? '' : phone, profilePhone: phone,
      cc: p ? p.cc || '' : el.cc.value, national: p ? p.national : '', sentAt: 0, real: false,
      verified: false, created: false, saved: true, storeName: ''
    };
    var acc = readAccount();
    if (demo() && sameIdentity(acc, f)) {
      // this address already has the account of this device: log in instead
      var t = el.same.querySelector('p');
      var what = method === 'email' ? 'Cette adresse' : 'Ce numéro';
      if (t) t.innerHTML = acc.loggedIn
        ? '<strong>' + what + ' a déjà un compte, ouvert sur cet appareil.</strong> Retrouvez votre boutique et vos réglages.'
        : '<strong>' + what + ' a déjà un compte sur cet appareil.</strong> Connectez-vous plutôt' + NB + ': votre boutique et vos réglages sont gardés.';
      el.sameBtn.textContent = acc.loggedIn ? 'Ouvrir mon compte' : 'Me connecter';
      el.same.hidden = false;
      reveal(el.same);
      announce(what + ' a déjà un compte sur cet appareil.', true);
      return;
    }
    flow = f;
    saveFlow();
    var end = busyStart(el.signupBtn, 'Envoi du code…');
    requestCode(f, true, function (err, r) {
      end();
      drawMethod('signup');
      if (err) return showSendError('signup', err, method);
      flow.real = r.real;
      flow.sentAt = Date.now();
      saveFlow();
      go('inscription', 'code');
    });
  }

  function useSameNumber() {
    var acc = readAccount();
    if (!acc) return;
    if (acc.loggedIn) { go('', 'session', { focus: 'title' }); return; }
    startLoginWith(acc, el.sameBtn);
  }

  // 1. Login: e-mail or number
  SETUP.login = function () {
    var acc = readAccount();
    el.nomatch.hidden = true;
    el.loginBtn.hidden = false;
    el.lfail.hidden = true;
    clearError(el.lphone, 'c-lphone-err');
    clearError(el.lemail, 'c-lemail-err');
    // The device's account (in real mode only a real one: a demo account cannot receive a code)
    if (acc && !acc.loggedIn && (demo() || acc.userId)) {
      el.knownAv.textContent = initial(acc.firstName || acc.storeName);
      el.knownName.textContent = [acc.firstName, acc.storeName].filter(Boolean).join(' · ') || 'Votre compte';
      el.knownNum.textContent = accLabel(acc);
      el.known.setAttribute('aria-label', 'Continuer avec le compte de ' + (acc.firstName || 'cet appareil') + ', ' + (accMethod(acc) === 'email' && acc.email ? 'adresse ' + maskEmail(acc.email).replace(/•+/g, '…') : 'numéro se terminant par ' + String(acc.phone).slice(-4).replace(/(\d\d)(\d\d)/, '$1 $2')));
      el.known.hidden = false;
      el.knownOr.hidden = false;
      setMethod('login', accMethod(acc));
    } else {
      el.known.hidden = true;
      el.knownOr.hidden = true;
    }
    // Her local account: its address or number is ready, and she is told her store stays (wave 2)
    if (localOnly(acc)) {
      if (acc.email) { setMethod('login', 'email'); if (!el.lemail.value) el.lemail.value = acc.email; }
      else if (acc.phone && (providers.sms || providers.whatsapp)) setMethod('login', providers.whatsapp ? 'whatsapp' : 'sms');
      loginNote('Votre compte de démonstration reste dans ce navigateur, avec votre boutique. Connectez-vous à votre compte Jeere (ou créez-le, c’est gratuit)' + NB + ': la boutique y sera reliée et vous pourrez la publier.');
    }
    drawMethod('login');
  };

  var pendingNew = null; // the address typed on the login screen that has no account
  function noMatch(f, real) {
    pendingNew = f;
    var isMail = f.method === 'email';
    el.nomatchT.textContent = isMail ? 'Aucun compte avec cette adresse' : 'Aucun compte avec ce numéro';
    el.nomatchD.innerHTML = '';
    el.nomatchD.appendChild(doc.createTextNode(isMail ? 'L’adresse ' : 'Le '));
    var b = doc.createElement('strong');
    b.className = 'c-nowrap';
    b.textContent = isMail ? f.email : formatPhone(f.phone);
    el.nomatchD.appendChild(b);
    el.nomatchD.appendChild(doc.createTextNode(real
      ? ' n’a pas encore de compte Jeere. Vérifiez-la, ou créez un compte en une minute.'.replace('Vérifiez-la', isMail ? 'Vérifiez-la' : 'Vérifiez-le')
      : ' n’est liée à aucun compte Jeere sur cet appareil. Vérifiez-la, ou créez un compte en une minute.'.replace('liée', isMail ? 'liée' : 'lié').replace('Vérifiez-la', isMail ? 'Vérifiez-la' : 'Vérifiez-le')));
    el.nomatchRetry.textContent = isMail ? 'Essayer une autre adresse' : 'Essayer un autre numéro';
    el.nomatch.hidden = false;
    el.loginBtn.hidden = true;
    try { el.nomatchT.focus({ preventScroll: true }); } catch (x) { el.nomatchT.focus(); }
    reveal(el.nomatch);
    announce(el.nomatchT.textContent + '.', true);
  }
  function submitLogin(e) {
    if (e) e.preventDefault();
    if (busy) return;
    el.lfail.hidden = true;
    var method = methodOf('login');
    var f = { mode: 'login', method: method, firstName: '', email: '', phone: '', profilePhone: '', cc: '', national: '', sentAt: 0, real: false, verified: false, created: false, saved: true, storeName: '' };
    if (method === 'email') {
      var email = normEmail(el.lemail.value);
      el.lemail.value = email;
      var errE = emailError(email);
      if (errE) { setError(el.lemail, 'c-lemail-err', errE); el.nomatch.hidden = true; el.loginBtn.hidden = false; return reportAt(el.lemail, errE); }
      clearError(el.lemail, 'c-lemail-err');
      f.email = email;
    } else {
      var p = readPhoneField(el.lcc, el.lphone);
      var err = phoneError(p);
      if (err) { setError(el.lphone, 'c-lphone-err', err); el.nomatch.hidden = true; el.loginBtn.hidden = false; return reportAt(el.lphone, err); }
      clearError(el.lphone, 'c-lphone-err');
      f.phone = normWa(p.e164);
      f.cc = p.cc || '';
      f.national = p.national;
    }
    var acc = readAccount();
    if (demo() && !sameIdentity(acc, f)) { noMatch(f, false); return; }
    if (acc && sameIdentity(acc, f)) f.firstName = acc.firstName;
    flow = f;
    saveFlow();
    var end = busyStart(el.loginBtn, 'Envoi du code…');
    requestCode(f, false, function (err2, r) {
      end();
      drawMethod('login');
      if (err2) {
        if (err2.kind === 'nouser') return noMatch(f, true);
        return showSendError('login', err2, method);
      }
      // Supabase was unreachable: the demo only knows this device's account
      if (!r.real && !sameIdentity(readAccount(), f)) return noMatch(f, false);
      flow.real = r.real;
      flow.sentAt = Date.now();
      saveFlow();
      go('connexion', 'code');
    });
  }
  function startLoginWith(acc, btn) {
    var m = accMethod(acc);
    var f = { mode: 'login', method: m, firstName: acc.firstName, email: m === 'email' ? acc.email || '' : '', phone: m === 'email' ? '' : acc.phone, profilePhone: acc.phone || '', cc: '', national: '', sentAt: 0, real: false, verified: false, created: false, saved: true, storeName: '' };
    if (!flowDest(f)) { f.method = acc.email ? 'email' : 'sms'; f.email = acc.email || ''; f.phone = acc.email ? '' : acc.phone; }
    flow = f;
    saveFlow();
    if (demo()) { flow.sentAt = Date.now(); saveFlow(); go('connexion', 'code'); return; }
    var end = busyStart(btn || el.loginBtn, 'Envoi du code…');
    requestCode(f, false, function (err, r) {
      end();
      if (err) return showSendError('login', err, f.method);
      flow.real = r.real;
      flow.sentAt = Date.now();
      saveFlow();
      go('connexion', 'code');
    });
  }
  function useKnown() {
    var acc = readAccount();
    if (!acc || busy) return;
    startLoginWith(acc, el.loginBtn);
  }
  function nomatchCreate() {
    var p = pendingNew || {};
    flow = { mode: '', prefill: { method: p.method || 'email', email: p.email || '', cc: p.cc || el.lcc.value, national: p.national || '' } };
    saveFlow();
    go('inscription', 'signup', { focus: el.first });
  }
  function nomatchRetry() {
    el.nomatch.hidden = true;
    el.loginBtn.hidden = false;
    var isMail = methodOf('login') === 'email';
    var input = isMail ? el.lemail : el.lphone;
    input.value = '';
    try { input.focus(); } catch (e) { /* ignore */ }
  }

  // 2. The code (both flows)
  var timer = 0;
  var verifying = false;
  var autoT = 0;
  function channelWords(m) { return m === 'email' ? 'par e-mail' : m === 'sms' ? 'par SMS' : 'sur WhatsApp'; }
  SETUP.code = function () {
    var isMail = flow.method === 'email';
    el.codeBackT.textContent = isMail ? 'Changer d’adresse' : 'Changer de numéro';
    // « Nous avons envoyé un code par e-mail à awa@gmail.com. »
    el.codeLead.innerHTML = '';
    el.codeLead.appendChild(doc.createTextNode((flow.real ? 'Nous avons envoyé un code ' : 'Dans le vrai Jeere, le code part ') + channelWords(flow.method) + ' ' + (isMail ? 'à ' : 'au ')));
    var b = doc.createElement('strong');
    b.className = 'c-nowrap';
    b.id = 'c-code-num';
    b.textContent = isMail ? flow.email : formatPhone(flow.phone);
    el.codeLead.appendChild(b);
    el.codeLead.appendChild(doc.createTextNode('.'));
    el.demoBox.hidden = !!flow.real;
    el.codeHint.textContent = 'La vérification se lance dès le sixième chiffre. Vous pouvez aussi coller le code.' +
      (isMail && flow.real ? ' Pas dans la boîte de réception' + NB + '? Regardez dans les courriers indésirables (spam).' : '');
    el.code.value = '';
    el.code.readOnly = false;
    el.code.setAttribute('aria-describedby', (flow.real ? '' : 'c-demo ') + 'c-code-hint');
    verifying = false;
    el.otp.classList.remove('is-ok', 'is-bad');
    clearError(el.code, 'c-code-err');
    el.resendMsg.hidden = true;
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    if (txt) txt.textContent = 'Valider';
    el.resendPre.textContent = 'Pas reçu' + NB + '? Renvoyer le code dans';
    if (!flow.sentAt) { flow.sentAt = Date.now(); saveFlow(); }
    drawCells();
    startTimer();
  };

  function drawCells() {
    var v = el.code.value;
    layoutCells(Math.max(CODE_MIN, Math.min(CODE_MAX, v.length)));
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
  var pasted = false;
  function onCodeInput() {
    var v = el.code.value.replace(/\D/g, '').slice(0, CODE_MAX);
    if (v !== el.code.value) el.code.value = v;
    caretEnd();
    el.otp.classList.remove('is-bad');
    clearError(el.code, 'c-code-err');
    drawCells();
    clearTimeout(autoT);
    // pasted (or autofilled whole): at once; typed: a pause, the code may have more than 6 digits
    if (v.length >= CODE_MIN) autoT = setTimeout(verify, pasted ? 220 : 1100);
    pasted = false;
  }
  function onCodePaste(e) {
    var text = '';
    try { text = (e.clipboardData || root.clipboardData).getData('text'); } catch (x) { text = ''; }
    var d = String(text || '').replace(/\D/g, '');
    e.preventDefault();
    if (verifying) return;
    if (!d) { codeError('Ce texte ne contient pas de code. Collez les chiffres reçus.'); return; }
    el.code.value = d.slice(0, CODE_MAX);
    pasted = d.length >= CODE_MIN;
    onCodeInput();
    if (d.length < CODE_MIN) announce('Code collé' + NB + ': il manque des chiffres.');
  }
  function codeError(msg) {
    el.otp.classList.add('is-bad');
    setError(el.code, 'c-code-err', msg);
    reportAt(el.code, msg);
  }
  function codeBusy(on, label) {
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    if (txt) txt.textContent = on ? (label || 'Vérification…') : 'Valider';
    el.codeBtn.classList.toggle('is-busy', on);
    if (on) el.codeBtn.setAttribute('aria-disabled', 'true'); else el.codeBtn.removeAttribute('aria-disabled');
  }
  function verify() {
    if (verifying) return;
    clearTimeout(autoT);
    var v = el.code.value.replace(/\D/g, '');
    if (v.length < CODE_MIN) {
      codeError(v.length ? 'Le code est incomplet. Tapez tous les chiffres reçus.' : 'Tapez le code reçu.');
      return;
    }
    verifying = true;
    el.code.readOnly = true;
    codeBusy(true);
    announce('Vérification du code…');
    if (!flow.real) {
      setTimeout(function () {
        el.otp.classList.add('is-ok');
        setTimeout(function () { verified(null); }, 380);
      }, 520);
      return;
    }
    A.verifyCode({ method: flow.method, email: flow.email, phone: flow.phone, token: v }).then(function (r) {
      if (!r.ok) {
        verifying = false;
        el.code.readOnly = false;
        codeBusy(false);
        if (r.error.kind === 'code') { el.code.value = ''; drawCells(); }
        codeError(r.error.text);
        return;
      }
      el.otp.classList.add('is-ok');
      codeBusy(true, 'Ouverture de votre compte…');
      var extra = { method: flow.method };
      if (flow.mode === 'signup') { extra.firstName = flow.firstName; if (flow.profilePhone) extra.phone = flow.profilePhone; }
      A.completeLogin(r.user, extra).then(function (acc) { verified(acc); }, function () { verified(null); });
    });
  }
  function redirectNext() {
    var next = SUITE ? SUITE.url : DASHBOARD;
    setTimeout(function () { try { root.location.assign(next); } catch (e) { root.location.href = next; } }, 650);
  }
  function verified(realAcc) {
    codeBusy(false);
    stopTimer();
    if (flow.mode === 'signup') {
      verifying = false;
      el.code.readOnly = false;
      flow.verified = true;
      if (realAcc && realAcc.storeName && !flow.storeName) flow.storeName = realAcc.storeName;
      saveFlow();
      announce('Code accepté.');
      // replace the code entry: Back from the store name goes to step 1, not to a used code
      go('inscription', 'name', { replace: true });
      return;
    }
    var acc = readAccount();
    if (!flow.real) {
      // a real account (userId) is never reopened by a demo code: only a real log-in opens it
      if (!acc || !sameIdentity(acc, flow) || acc.userId) { verifying = false; el.code.readOnly = false; go('connexion', 'login', { replace: true, focus: 'title' }); return; }
      acc.loggedIn = true;
      saveAccount(acc);
    }
    acc = readAccount() || realAcc || {};
    var txt = el.codeBtn.querySelector('.c-btn__txt');
    var hello = 'Bonjour' + (acc.firstName ? ' ' + acc.firstName : '') + NB + '! Ouverture du tableau de bord…';
    if (txt) txt.textContent = hello;
    announce(hello);
    flow = {};
    saveFlow();
    redirectNext();
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
    el.resendTime.textContent = Math.floor(left / 60) + ':' + pad2(left % 60);
    el.resendWait.hidden = left === 0;
    el.resendActs.hidden = left !== 0;
    if (left === 0) stopTimer();
  }
  function resend() {
    if (verifying || busy) return;
    var refocus = doc.activeElement === el.resend;
    el.resendMsg.hidden = true;
    busy = true;
    requestCode(flow, flow.mode === 'signup', function (err, r) {
      busy = false;
      if (err) {
        el.resendMsg.textContent = err.text;
        el.resendMsg.hidden = false;
        announce(err.text, true);
        return;
      }
      flow.real = r.real;
      flow.sentAt = Date.now();
      saveFlow();
      el.code.value = '';
      el.otp.classList.remove('is-bad');
      clearError(el.code, 'c-code-err');
      drawCells();
      el.demoBox.hidden = !!flow.real;
      el.resendPre.textContent = (flow.real ? 'Nouveau code envoyé ' + channelWords(flow.method) + '.' : 'Nouveau code demandé (démo).') + ' Renvoi possible dans';
      startTimer();
      announce(flow.real
        ? 'Nouveau code envoyé ' + channelWords(flow.method) + '.'
        : 'Nouveau code demandé. Mode démo' + NB + ': rien n’est envoyé, tapez n’importe quel code de 6' + NB + 'chiffres ou plus.');
      if (refocus) { try { el.code.focus(); } catch (e) { /* ignore */ } }
    });
  }
  function codeBack() {
    if (pushed && stateStep() === 'code') { try { root.history.back(); return; } catch (e) { /* fall through */ } }
    go(current.route, current.route === 'connexion' ? 'login' : 'signup', { replace: true, focus: 'title' });
  }
  // « Autre méthode »: back to step 1, on the method choice
  function otherMethod() {
    var scope = current.route === 'connexion' ? 'login' : 'signup';
    codeBack();
    setTimeout(function () {
      var r = radios(scope === 'login' ? 'lmethod' : 'method').filter(function (x) { return x.checked; })[0];
      if (r) { try { r.focus(); } catch (e) { /* ignore */ } }
    }, 60);
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
    if (flow.mode !== 'signup' || !flow.verified) { go('inscription', 'signup', { replace: true, focus: 'title' }); return; }
    var prev = readAccount();
    var acc;
    if (flow.real) {
      // Real account: written by JeereAuth.completeLogin; the store name goes to public.profiles too
      if (!prev || !prev.userId) { go('inscription', 'signup', { replace: true, focus: 'title' }); return; }
      acc = prev;
      acc.storeName = name;
      acc.loggedIn = true;
      if (!acc.phone && flow.profilePhone) acc.phone = flow.profilePhone;
    } else {
      if (!flowDest(flow)) { go('inscription', 'signup', { replace: true, focus: 'title' }); return; }
      var same = prev && sameIdentity(prev, flow);
      acc = {
        version: 1,
        firstName: flow.firstName,
        phone: flow.profilePhone || '',
        storeName: name,
        createdAt: (same && prev.createdAt) || new Date().toISOString(),
        plan: (same && prev.plan) || 'gratuit',
        loggedIn: true,
        method: flow.method
      };
      if (flow.email) acc.email = flow.email;
      if (same && prev.studio) acc.studio = prev.studio; // her Studio subscription stays with her account
    }
    var ok = saveAccount(acc);
    if (flow.real && A) A.syncNow();
    fillFiche(name, acc.phone, true);
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
    if (el.meSub) el.meSub.textContent = acc.userId ? 'Votre compte Jeere est ouvert sur cet appareil.' : 'Compte de démonstration' + NB + ': il reste dans ce navigateur.';
    // A local or demo account: the way to a real sign-in that keeps this browser's store (wave 2)
    var real = $('c-real'), realBtn = $('c-real-login');
    if (real && realBtn) {
      real.hidden = realBtn.hidden = !!acc.userId;
      if (!acc.userId) {
        var keep = SUITE ? '?suite=' + SUITE.id : '';
        // in demo mode (local version, ?demo=1) the real Jeere is one parameter away
        realBtn.setAttribute('href', demo() ? (keep ? keep + '&' : '?') + 'demo=0#connexion' : keep + '#connexion');
      }
    }
    el.sumStore.textContent = acc.storeName || ficheName() || 'Pas encore de nom';
    if (el.sumEmailRow) { el.sumEmailRow.hidden = !acc.email; el.sumEmail.textContent = acc.email || ''; }
    el.sumPhone.textContent = acc.phone ? formatPhone(acc.phone) : 'Pas encore ajouté';
    el.sumPlan.textContent = planName(acc.plan);
    var sd = $('c-sum-studio');
    if (sd) sd.textContent = studioSummary();
    var nx = $('c-studio-next');
    if (nx) { nx.hidden = !SUITE; if (SUITE) { nx.setAttribute('href', SUITE.url); $('c-studio-next-t').textContent = SUITE.cta; } }
  };
  function logout() {
    var acc = readAccount();
    var real = !!(acc && acc.userId);
    if (acc) { acc.loggedIn = false; saveAccount(acc); }
    flow = {};
    saveFlow();
    if (real && A) A.signOut();
    announce('Déconnexion réussie.');
    go('connexion', 'login', { replace: true, focus: 'title' });
  }

  // An e-mail link: finishing the login
  SETUP.wait = function () {};

  /* ------------------------------------------------------------------ the real session at start */

  function loginNote(text) {
    if (!el.loginNote) return;
    el.loginNoteT.textContent = text;
    el.loginNote.hidden = !text;
  }
  // Real mode: the providers, then the session saved on this device (or brought by an e-mail link)
  function startReal() {
    if (!A || A.isDemo()) { drawMode(); return; }
    A.probe().then(function (info) {
      providers = info.providers || providers;
      drawMode();
      if (info.demo) {
        if (LINK) { go('connexion', 'login', { replace: true, focus: 'title' }); loginNote('Pas de connexion avec Jeere pour finir la connexion. Réessayez quand vous aurez du réseau.'); }
        return;
      }
      if (LINK && !LINK.ok) {
        go('connexion', 'login', { replace: true, focus: 'title' });
        loginNote(LINK.expired ? 'Ce lien de connexion a expiré ou a déjà servi. Demandez un nouveau code ci-dessous.' : 'Ce lien de connexion ne marche pas. Demandez un nouveau code ci-dessous.');
        return;
      }
      return A.session(!!LINK).then(function (sess) {
        var acc = readAccount();
        if (!sess) {
          // The session ended (expired, revoked, logged out elsewhere): the device's real account is logged out too
          if (acc && acc.userId && acc.loggedIn) { acc.loggedIn = false; saveAccount(acc); refreshFromStorage(); }
          if (LINK) { go('connexion', 'login', { replace: true, focus: 'title' }); loginNote('Ce lien de connexion a expiré ou a déjà servi. Demandez un nouveau code ci-dessous.'); }
          return;
        }
        var user = sess.user;
        if (!LINK && acc && acc.userId === user.id && !acc.loggedIn) { A.signOut(); return; } // logged out in the dashboard
        if (!LINK && current.step === 'code') return; // a login in progress in this tab
        var mine = acc && acc.userId === user.id;
        // Changes made on this device and not sent yet (offline) go up first, then the server is the reference
        return A.syncNow().then(function () {
          return A.completeLogin(user, { method: mine ? accMethod(acc) : (user.email ? 'email' : 'sms') });
        }).then(function (acc2) {
          if (!LINK) { refreshFromStorage(); return; }
          // Opened from the e-mail: a new account still needs its store name
          if (!acc2.storeName) {
            flow = { mode: 'signup', method: 'email', firstName: acc2.firstName, email: acc2.email || '', phone: '', profilePhone: acc2.phone || '', cc: '', national: '', sentAt: Date.now(), real: true, verified: true, created: false, saved: true, storeName: '' };
            saveFlow();
            go('inscription', 'name', { replace: true });
            return;
          }
          flow = {};
          saveFlow();
          go('', 'session', { replace: true, focus: 'title' });
          announce('Bonjour' + (acc2.firstName ? ' ' + acc2.firstName : '') + NB + '! Vous êtes connectée.');
        });
      });
    }).catch(function (e) { if (root.console) root.console.error(e); });
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
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!el.first.value.trim()) return submitSignup();
        (methodOf('signup') === 'email' ? el.email : el.phone).focus();
      }
    });
    radios('method').forEach(function (r) { r.addEventListener('change', function () { drawMethod('signup'); }); });
    radios('lmethod').forEach(function (r) { r.addEventListener('change', function () { drawMethod('login'); }); });
    el.email.addEventListener('input', function () { clearError(el.email, 'c-email-err'); el.emailUseSms.hidden = true; el.same.hidden = true; el.fail.hidden = true; });
    el.email.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (el.email.value.trim() && !el.phone.value.trim()) submitSignup(); else el.phone.focus(); } });
    el.emailUseSms.addEventListener('click', function () { setMethod('signup', 'sms'); submitSignup(); });
    el.offEmail.addEventListener('click', function () { setMethod('signup', 'email'); try { el.email.focus(); } catch (e) { /* ignore */ } });
    el.loffEmail.addEventListener('click', function () { setMethod('login', 'email'); try { el.lemail.focus(); } catch (e) { /* ignore */ } });
    el.failDemo.addEventListener('click', function () { if (A) A.forceDemo('offline'); drawMode(); submitSignup(); });
    el.lfailDemo.addEventListener('click', function () { if (A) A.forceDemo('offline'); drawMode(); submitLogin(); });
    if (el.modeRetry) el.modeRetry.addEventListener('click', function () { try { root.location.reload(); } catch (e) { /* ignore */ } });
    el.phone.addEventListener('input', function () { clearError(el.phone, 'c-phone-err'); el.same.hidden = true; el.fail.hidden = true; });
    el.cc.addEventListener('change', function () { clearError(el.phone, 'c-phone-err'); el.same.hidden = true; });
    el.phone.addEventListener('blur', function () {
      if (!el.phone.value.trim()) return;
      var p = parsePhone(el.cc.value, el.phone.value);
      if (p.cc && !p.intl && p.national) { if (p.cc !== el.cc.value) el.cc.value = p.cc; el.phone.value = nationalDisplay(p.cc, p.national); }
    });
    el.sameBtn.addEventListener('click', useSameNumber);

    el.formLogin.addEventListener('submit', submitLogin);
    var lclear = function () {
      clearError(el.lphone, 'c-lphone-err');
      clearError(el.lemail, 'c-lemail-err');
      el.lfail.hidden = true;
      if (!el.nomatch.hidden) { el.nomatch.hidden = true; el.loginBtn.hidden = false; }
    };
    el.lemail.addEventListener('input', lclear);
    el.lphone.addEventListener('input', lclear);
    el.lcc.addEventListener('change', lclear);
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
    el.resend.addEventListener('click', resend);
    el.other.addEventListener('click', otherMethod);

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
    if (current.step === 'wait') return;
    var v = resolve();
    // Never interrupt a sign-up or login in progress (its steps do not depend on the saved account)
    if ((current.step === 'code' || current.step === 'name') && v.step === current.step) return;
    if (v.route === current.route && v.step === current.step && v.step !== 'session') return;
    show(v, { focus: 'none' });
  }

  function init() {
    bind();
    drawMode();
    if (LINK && LINK.ok && A && !A.isDemo()) {
      // supabase-js reads the tokens from the URL: wait for it on a neutral screen
      show({ route: '', step: 'wait' }, { focus: 'none' });
    } else {
      var v = resolve();
      // the first entry carries its step too, so Back inside the page always knows where it is
      try { root.history.replaceState({ jc: v.step }, '', LINK ? urlFor(v.route) : root.location.href); } catch (e) { /* ignore */ }
      show(v, { focus: 'none' });
    }
    drawProviders();
    startReal();
  }

  root.JeereCompte = { parsePhone: parsePhone, formatPhone: formatPhone, maskPhone: maskPhone, maskEmail: maskEmail, normEmail: normEmail };

  try { init(); } catch (e) {
    // never leave an empty card: show the sign-up form, which works without the rest
    sections.forEach(function (sec) { sec.hidden = sec.getAttribute('data-step') !== 'signup'; });
    if (root.console && root.console.error) root.console.error(e);
  }
})();
