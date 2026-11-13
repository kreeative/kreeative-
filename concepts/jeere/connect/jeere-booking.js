/*
 * Jeere Rendez-vous — jeere-booking.js: a custom-designed site takes appointments with a Jeere store (classic script,
 * no library). The sister of jeere-connect.js, for service businesses: lashes, nails, hair, braids, make-up…
 *
 *   <script src="https://jeere.kreeative.xyz/connect/jeere-booking.js" data-store="<slug>" defer></script>
 *
 * The site keeps its own design. This script reads what the store offers from the `bookings` Edge Function (services,
 * add-ons, team, opening hours, policies: what she set in Jeere › Rendez-vous), fills the site's own markup, and
 * draws the booking steps where the site asks for them. Free times come from the server, in HER time zone; the
 * server checks every booking again and the database refuses a double booking.
 * If the function cannot be reached or she does not take bookings online, the page keeps its hard-coded content and
 * the booking area says so; nothing here ever throws into the site.
 *
 * Script attributes:
 *   data-store="regard"          the store's address on Jeere (required), or data-store-param="b" to read it from ?b=
 *   data-book-url="reserver/"    the page that holds [data-jeere-booking], when « Réserver » buttons live on other pages
 *   data-manage-url="rendez-vous/"  the page that holds [data-jeere-appointment] (default: the booking page itself)
 *   data-style="none"            do not load the default look (connect/jeere-booking.css): the site styles .jb-* itself
 *
 * Markup (any element, any classes; ids are hers: s1, s2… as in Jeere › Rendez-vous › Prestations):
 *   [data-jeere-booking]          the booking steps are drawn here (service, add-ons, person, day and time, details)
 *   [data-jeere-appointment]      « my appointment » (from the link of her e-mail, ?rdv=<token>): see, move, cancel.
 *                                 Without one, [data-jeere-booking] shows it when the address carries ?rdv=
 *   [data-jeere-service="s1"]     a service card of the site. Gets data-jeere-state="on" | "off" (off: she removed it)
 *     [data-jeere-name] [data-jeere-desc] [data-jeere-price] [data-jeere-duration]   text from her settings
 *     [data-jeere-book]           opens the booking with this service chosen
 *   [data-jeere-book="s1"]        the same, anywhere; [data-jeere-book] alone opens the booking at the first step
 *   [data-jeere-services]         filled with all her services, by category (for a site without its own cards);
 *                                 data-category="Sourcils" keeps one category
 *   [data-jeere-hours]            filled with her opening hours (a <dl>: « lundi » · « 9 h – 18 h »)
 *   [data-jeere-policy="deposit|late|cancel|payment|prep"]   the text of a policy; hidden when she wrote none
 *   [data-jeere-address] [data-jeere-intro]   her address, her introduction
 *
 * Events on document: 'jeere:booking-ready' { status, config } once read (status 'ok' | 'closed' | 'offline' |
 * 'notfound'), 'jeere:booked' { appointment, manageUrl } after a booking.
 * window.JeereBooking = { ready: Promise, status(), config(), open(serviceId), version }
 */
(function () {
  'use strict';

  if (window.JeereBooking && window.JeereBooking.version) return;

  var FN = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/bookings';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var NB = ' ';
  var TIMEOUT = 12000;

  var me = document.currentScript || document.querySelector('script[src*="jeere-booking"]');
  function attr(n) { return String((me && me.getAttribute(n)) || '').trim(); }
  function param(n) { try { return new URLSearchParams(window.location.search).get(n) || ''; } catch (e) { return ''; } }
  var slug = (attr('data-store') || (attr('data-store-param') ? param(attr('data-store-param')) : '')).toLowerCase();
  var slugOk = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);
  var TOKEN = /^[0-9a-f]{64}$/.test(param('rdv')) ? param('rdv') : '';

  var S = {
    status: 'loading', cfg: null,
    step: 'service', serviceId: '', addons: [], staffId: 'any', month: '', date: '', slot: null,
    slots: {}, loadingSlots: false, slotError: '',
    form: { name: '', phone: '', email: '', note: '', payment: '', agree: false }, sending: false, error: '',
    done: null,                                   // { appointment, manageUrl }
    appt: null, apptError: '', apptMode: 'view'    // « my appointment »
  };

  /* ---------------------------------------------------------------- helpers */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  // French typography: no line break before « : ; ! ? » nor inside « … »
  function fr(s) { return esc(s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function $$(sel, ctx) { try { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function emit(name, detail) { try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* old browser */ } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function call(body) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) { clearTimeout(t); return j && typeof j === 'object' ? j : { ok: false }; },
        function () { clearTimeout(t); return { ok: false, code: 'offline', message: 'Pas de connexion. Vérifiez votre réseau et réessayez.' }; });
  }

  var CUR = { XOF: ['FCFA', 1], CAD: ['$' + NB + 'CA', 100], USD: ['$' + NB + 'US', 100], EUR: ['€', 100] };
  function cur() { var c = S.cfg && S.cfg.store && S.cfg.store.currency; return CUR[c] ? c : 'XOF'; }
  function money(n) {
    var c = CUR[cur()], x = Math.round((Number(n) || 0) * c[1]) / c[1];
    var whole = Math.floor(Math.abs(x)), cents = Math.round((Math.abs(x) - whole) * 100);
    return (x < 0 ? '-' : '') + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (cents ? ',' + pad(cents) : '') + NB + c[0];
  }
  function duration(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + NB + 'h' + (m ? NB + pad(m) : '') : m + NB + 'min'; }
  function tz() { return (S.cfg && S.cfg.timezone) || (S.appt && S.appt.timezone) || 'Africa/Abidjan'; }
  function fmt(iso, opts) {
    try { opts.timeZone = tz(); return new Intl.DateTimeFormat('fr-FR', opts).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 16).replace('T', ' '); }
  }
  function longDate(iso) { return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }); }
  function hhmm(t) { var h = Number(t.slice(0, 2)), m = t.slice(3, 5); return h + NB + 'h' + (m === '00' ? '' : NB + m); }
  function clock(iso) { var s = fmt(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return /^\d{2}:\d{2}$/.test(s) ? hhmm(s) : s; }
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // plain calendar dates (« 2026-11-20 »): her zone's days, no clock involved
  function ymd(y, m, d) { var t = new Date(Date.UTC(y, m, d)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function parts(date) { return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1, d: Number(date.slice(8, 10)) }; }
  function dateLabel(date) { var p = parts(date), t = new Date(Date.UTC(p.y, p.m, p.d)); return DAYS[t.getUTCDay()] + ' ' + p.d + (p.d === 1 ? 'er' : '') + ' ' + MONTHS[p.m]; }

  function service(id) { var a = (S.cfg && S.cfg.services) || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function addon(id) { var a = (S.cfg && S.cfg.addons) || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function staffOf(svc) {
    var team = (S.cfg && S.cfg.staff) || [];
    var who = svc && svc.staff && svc.staff.length ? team.filter(function (t) { return svc.staff.indexOf(t.id) >= 0; }) : team;
    return who.length ? who : team;
  }
  function totals() {
    var svc = service(S.serviceId);
    if (!svc) return { duration: 0, total: 0, deposit: 0 };
    var d = svc.duration, t = svc.price;
    S.addons.forEach(function (id) { var a = addon(id); if (a) { d += a.duration; t += a.price; } });
    var dep = 0, rule = S.cfg.deposit || {};
    if (svc.deposit !== null && svc.deposit !== undefined) dep = svc.deposit;
    else if (rule.mode === 'fixed') dep = rule.value;
    else if (rule.mode === 'percent') dep = Math.round(t * rule.value) / 100;
    if (cur() === 'XOF') dep = Math.round(dep);
    return { duration: d, total: t, deposit: Math.max(0, Math.min(dep, t)) };
  }
  // the last day she takes bookings for: the date she opened them until, else today + her horizon
  function lastBookDay() { var c = S.cfg, t = parts(c.today); return /^\d{4}-\d{2}-\d{2}$/.test(c.until || '') ? c.until : ymd(t.y, t.m, t.d + (c.horizon || 60)); }
  function slotKey() { return S.serviceId + '|' + S.addons.slice().sort().join(',') + '|' + S.staffId + '|' + S.month; }
  function absUrl(u) { try { return new URL(u || '.', window.location.href).href; } catch (e) { return window.location.href; } }
  function manageBase() { return absUrl(attr('data-manage-url') || window.location.pathname).replace(/[?#].*$/, ''); }
  function wa(text) {
    var n = String((S.cfg && S.cfg.store.whatsapp) || (S.appt && S.appt.store && S.appt.store.whatsapp) || '').replace(/\D/g, '');
    return n.length >= 8 ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : '';
  }

  /* ---------------------------------------------------------------- the site's own markup */
  function fillSite() {
    var c = S.cfg;
    $$('[data-jeere-service]').forEach(function (card) {
      var svc = c ? service(card.getAttribute('data-jeere-service')) : null;
      card.setAttribute('data-jeere-state', svc ? 'on' : (c ? 'off' : 'on'));
      if (!svc) return;
      $$('[data-jeere-name]', card).forEach(function (el) { el.textContent = svc.name; });
      $$('[data-jeere-desc]', card).forEach(function (el) { if (svc.desc) el.textContent = svc.desc; });
      $$('[data-jeere-price]', card).forEach(function (el) { el.textContent = (svc.from ? 'dès' + NB : '') + money(svc.price); });
      $$('[data-jeere-duration]', card).forEach(function (el) { el.textContent = duration(svc.duration); });
    });
    if (!c) return;
    $$('[data-jeere-services]').forEach(function (box) {
      var only = box.getAttribute('data-category') || '';
      var list = c.services.filter(function (s) { return !only || s.category === only; });
      var cats = [];
      list.forEach(function (s) { if (cats.indexOf(s.category) < 0) cats.push(s.category); });
      box.innerHTML = cats.map(function (cat) {
        return '<div class="jb-menu__group">' + (cat && !only ? '<h3 class="jb-menu__cat">' + esc(cat) + '</h3>' : '') + '<ul class="jb-menu__list">' +
          list.filter(function (s) { return s.category === cat; }).map(function (s) {
            return '<li class="jb-menu__item"><div class="jb-menu__txt"><p class="jb-menu__name">' + esc(s.name) + '</p>' + (s.desc ? '<p class="jb-menu__desc">' + fr(s.desc) + '</p>' : '') +
              '<p class="jb-menu__meta">' + duration(s.duration) + '</p></div><div class="jb-menu__side"><p class="jb-menu__price">' + (s.from ? 'dès' + NB : '') + money(s.price) + '</p>' +
              '<button type="button" class="jb-menu__book" data-jeere-book="' + esc(s.id) + '">Réserver</button></div></li>';
          }).join('') + '</ul></div>';
      }).join('');
    });
    $$('[data-jeere-hours]').forEach(function (box) {
      var order = [1, 2, 3, 4, 5, 6, 0];
      box.innerHTML = '<dl class="jb-hours">' + order.map(function (d) {
        var h = c.hours[d] || {};
        var txt = h.open ? hhmm(h.from) + ' – ' + hhmm(h.to) : 'Fermé';
        return '<div class="jb-hours__row' + (h.open ? '' : ' is-closed') + '"><dt>' + DAYS[d] + '</dt><dd>' + txt + '</dd></div>';
      }).join('') + '</dl>';
    });
    $$('[data-jeere-policy]').forEach(function (el) {
      var t = (c.policies || {})[el.getAttribute('data-jeere-policy')] || '';
      if (t) { el.textContent = t; el.hidden = false; } else { var wrap = el.closest('[data-jeere-policy-wrap]') || el; wrap.hidden = true; }
    });
    $$('[data-jeere-address]').forEach(function (el) { if (c.address) el.textContent = c.address; });
    $$('[data-jeere-intro]').forEach(function (el) { if (c.intro) el.textContent = c.intro; });
  }

  /* ---------------------------------------------------------------- the booking steps */
  function mounts() { return $$('[data-jeere-booking]'); }
  function stepsList() {
    var svc = service(S.serviceId);
    var many = svc ? staffOf(svc).length > 1 : ((S.cfg && S.cfg.staff) || []).length > 1;
    return ['service'].concat(many ? ['staff'] : []).concat(['time', 'details']);
  }
  var STEP_LABEL = { service: 'Prestation', staff: 'Avec qui', time: 'Date et heure', details: 'Vos coordonnées' };

  function head() {
    var list = stepsList(), i = list.indexOf(S.step);
    return '<ol class="jb-steps" aria-label="Étapes">' + list.map(function (s, n) {
      return '<li class="jb-steps__item' + (n === i ? ' is-current' : (n < i ? ' is-done' : '')) + '"' + (n === i ? ' aria-current="step"' : '') + '><span class="jb-steps__n">' + (n + 1) + '</span><span class="jb-steps__l">' + STEP_LABEL[s] + '</span></li>';
    }).join('') + '</ol>';
  }
  function recap() {
    var svc = service(S.serviceId);
    if (!svc) return '';
    var t = totals();
    var who = S.slot && S.slot.staff && S.slot.staff.length === 1 ? S.slot.staff[0] : (S.staffId !== 'any' ? S.staffId : '');
    var person = who ? (S.cfg.staff.filter(function (x) { return x.id === who; })[0] || {}).name : '';
    var many = staffOf(svc).length > 1;
    return '<aside class="jb-recap" aria-label="Votre rendez-vous"><p class="jb-recap__title">Votre rendez-vous</p><ul class="jb-recap__list">' +
      '<li><span>' + esc(svc.name) + '</span><b>' + (svc.from ? 'dès' + NB : '') + money(svc.price) + '</b></li>' +
      S.addons.map(function (id) { var a = addon(id); return a ? '<li class="jb-recap__add"><span>+ ' + esc(a.name) + '</span><b>' + money(a.price) + '</b></li>' : ''; }).join('') +
      '</ul><dl class="jb-recap__facts">' +
      '<div><dt>Durée</dt><dd>' + duration(t.duration) + '</dd></div>' +
      (many && person ? '<div><dt>Avec</dt><dd>' + esc(person) + '</dd></div>' : '') +
      (S.slot ? '<div><dt>Quand</dt><dd>' + esc(dateLabel(S.date)) + ' à ' + hhmm(S.slot.t) + '</dd></div>' : '') +
      '<div class="jb-recap__total"><dt>Total</dt><dd>' + (svc.from ? 'dès' + NB : '') + money(t.total) + '</dd></div>' +
      (t.deposit > 0 ? '<div><dt>Acompte à régler</dt><dd>' + money(t.deposit) + '</dd></div>' : '') +
      '</dl></aside>';
  }
  function navRow(next, label, disabled) {
    var first = stepsList().indexOf(S.step) === 0;
    return '<div class="jb-nav">' + (first ? '<span></span>' : '<button type="button" class="jb-btn jb-btn--ghost" data-jb="back">Retour</button>') +
      (next ? '<button type="button" class="jb-btn jb-btn--primary" data-jb="' + next + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>' : '') + '</div>';
  }

  // The services as an accordion: a tap opens one, and everything about it is inside (how long, how much, what to pay
  // now, the add-ons, « Continuer »). Open = chosen; a second tap closes it again.
  function viewService() {
    var c = S.cfg, cats = [];
    c.services.forEach(function (s) { if (cats.indexOf(s.category) < 0) cats.push(s.category); });
    var html = '<h2 class="jb-title" tabindex="-1">Choisissez votre prestation</h2>' +
      (S.serviceId ? '' : '<p class="jb-hint jb-hint--top">' + fr('Touchez une prestation pour voir sa durée, son prix et ses options.') + '</p>');
    html += cats.map(function (cat) {
      return '<section class="jb-group">' + (cat ? '<h3 class="jb-group__title">' + esc(cat) + '</h3>' : '') + '<div class="jb-options">' +
        c.services.filter(function (s) { return s.category === cat; }).map(function (s) {
          var on = s.id === S.serviceId, pid = 'jb-acc-' + esc(s.id);
          return '<div class="jb-acc' + (on ? ' is-open' : '') + (on && S.fresh ? ' is-fresh' : '') + '">' +
            '<button type="button" class="jb-option jb-acc__head' + (on ? ' is-on' : '') + '" aria-expanded="' + on + '"' + (on ? ' aria-controls="' + pid + '"' : '') + ' data-jb="service" data-id="' + esc(s.id) + '">' +
            '<span class="jb-option__main"><span class="jb-option__name">' + esc(s.name) + '</span>' + (s.desc ? '<span class="jb-option__desc">' + fr(s.desc) + '</span>' : '') + '</span>' +
            '<span class="jb-option__side"><span class="jb-option__price">' + (s.from ? 'dès' + NB : '') + money(s.price) + '</span><span class="jb-option__meta">' + duration(s.duration) + '</span></span>' +
            '<span class="jb-acc__chev" aria-hidden="true"></span></button>' +
            (on ? '<div class="jb-acc__panel" id="' + pid + '" role="region" aria-label="' + esc(s.name) + '"><div class="jb-acc__in">' + servicePanel(s) + '</div></div>' : '') +
            '</div>';
        }).join('') + '</div></section>';
    }).join('');
    return html;
  }
  function servicePanel(svc) {
    var c = S.cfg, t = totals(), from = svc.from ? 'dès' + NB : '';
    return '<dl class="jb-acc__facts">' +
      '<div><dt>Durée</dt><dd>' + duration(t.duration) + '</dd></div>' +
      '<div><dt>Total</dt><dd>' + from + money(t.total) + '</dd></div>' +
      (t.deposit > 0 ? '<div><dt>Acompte à régler</dt><dd>' + money(t.deposit) + '</dd></div>' : '') +
      '</dl>' +
      (c.addons.length ? '<p class="jb-acc__label">Ajouter une option <small>facultatif</small></p><div class="jb-options jb-acc__addons">' +
        c.addons.map(function (a) {
          var on = S.addons.indexOf(a.id) >= 0;
          return '<button type="button" class="jb-option jb-option--check' + (on ? ' is-on' : '') + '" role="checkbox" aria-checked="' + on + '" data-jb="addon" data-id="' + esc(a.id) + '">' +
            '<span class="jb-option__box" aria-hidden="true"></span>' +
            '<span class="jb-option__main"><span class="jb-option__name">' + esc(a.name) + '</span></span>' +
            '<span class="jb-option__side"><span class="jb-option__price">+ ' + money(a.price) + '</span>' + (a.duration ? '<span class="jb-option__meta">+ ' + duration(a.duration) + '</span>' : '') + '</span></button>';
        }).join('') + '</div>' : '') +
      '<div class="jb-acc__go"><button type="button" class="jb-btn jb-btn--primary" data-jb="next">Continuer</button></div>';
  }
  function viewStaff() {
    var who = staffOf(service(S.serviceId));
    var opt = function (id, name, role, photo) {
      var on = S.staffId === id;
      return '<button type="button" class="jb-option jb-option--person' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-jb="staff" data-id="' + esc(id) + '">' +
        (photo ? '<img class="jb-option__photo" src="' + esc(photo) + '" alt="" loading="lazy">' : '<span class="jb-option__photo jb-option__photo--initial" aria-hidden="true">' + esc(name.charAt(0)) + '</span>') +
        '<span class="jb-option__main"><span class="jb-option__name">' + esc(name) + '</span>' + (role ? '<span class="jb-option__desc">' + esc(role) + '</span>' : '') + '</span></button>';
    };
    return '<h2 class="jb-title" tabindex="-1">Avec qui ?</h2><div class="jb-options" role="radiogroup" aria-label="Avec qui">' +
      opt('any', 'Peu importe', 'La première personne disponible', '') + who.map(function (p) { return opt(p.id, p.name, p.role, p.photo); }).join('') + '</div>' + navRow('next', 'Continuer', false);
  }
  function calendar(reschedule) {
    var c = S.cfg, today = c.today, p = parts(S.month + '-01');
    var first = new Date(Date.UTC(p.y, p.m, 1)), lead = (first.getUTCDay() + 6) % 7, n = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate();
    var key = slotKey(), data = S.slots[key];
    var lastDay = lastBookDay();
    var prevOk = S.month > today.slice(0, 7), nextOk = ymd(p.y, p.m + 1, 1) <= lastDay;
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<span class="jb-cal__pad"></span>';
    for (var d = 1; d <= n; d++) {
      var date = ymd(p.y, p.m, d), free = !!(data && data[date] && data[date].length), on = date === S.date;
      cells += '<button type="button" class="jb-cal__day' + (on ? ' is-on' : '') + (date === today ? ' is-today' : '') + '" data-jb="day" data-date="' + date + '"' + (free ? '' : ' disabled') +
        ' aria-pressed="' + on + '" aria-label="' + esc(dateLabel(date)) + (free ? '' : ', complet ou fermé') + '">' + d + '</button>';
    }
    var html = '<h2 class="jb-title" tabindex="-1">' + (reschedule ? 'Choisissez un nouveau créneau' : 'Choisissez le jour et l’heure') + '</h2>' +
      '<div class="jb-cal"><div class="jb-cal__head"><button type="button" class="jb-cal__nav" data-jb="month" data-dir="-1" aria-label="Mois précédent"' + (prevOk ? '' : ' disabled') + '>‹</button>' +
      '<p class="jb-cal__month" aria-live="polite">' + MONTHS[p.m] + ' ' + p.y + '</p>' +
      '<button type="button" class="jb-cal__nav" data-jb="month" data-dir="1" aria-label="Mois suivant"' + (nextOk ? '' : ' disabled') + '>›</button></div>' +
      '<div class="jb-cal__dow" aria-hidden="true"><span>lun</span><span>mar</span><span>mer</span><span>jeu</span><span>ven</span><span>sam</span><span>dim</span></div>' +
      '<div class="jb-cal__grid' + (S.loadingSlots ? ' is-loading' : '') + '">' + cells + '</div></div>';
    if (S.slotError) html += '<p class="jb-alert" role="alert">' + fr(S.slotError) + '</p>';
    else if (S.loadingSlots) html += '<p class="jb-hint" role="status">Recherche des créneaux libres…</p>';
    else if (data && !Object.keys(data).length) html += '<p class="jb-hint">Aucun créneau libre ce mois-ci. Essayez le mois suivant.</p>';
    if (S.date && data && data[S.date]) {
      var groups = [['Matin', 0, 12], ['Après-midi', 12, 17], ['Soir', 17, 24]];
      html += '<div class="jb-times"><p class="jb-times__day">' + esc(dateLabel(S.date)) + '</p>' + groups.map(function (g) {
        var list = data[S.date].filter(function (s) { var h = Number(s.t.slice(0, 2)); return h >= g[1] && h < g[2]; });
        return list.length ? '<div class="jb-times__group"><p class="jb-times__label">' + g[0] + '</p><div class="jb-times__list">' + list.map(function (s) {
          var on = S.slot && S.slot.start === s.start;
          return '<button type="button" class="jb-time' + (on ? ' is-on' : '') + '" data-jb="time" data-start="' + esc(s.start) + '" aria-pressed="' + !!on + '">' + hhmm(s.t) + '</button>';
        }).join('') + '</div></div>' : '';
      }).join('') + '</div>';
      try {
        var mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (mine && mine !== c.timezone) html += '<p class="jb-hint">Heures de ' + esc(c.timezone.split('/').pop().replace(/_/g, ' ')) + '.</p>';
      } catch (e) { /* no Intl */ }
    }
    return html;
  }
  function viewTime() { return calendar(false) + navRow('next', 'Continuer', !S.slot); }
  function field(id, label, type, value, extra, hint) {
    return '<div class="jb-field"><label class="jb-label" for="jb-' + id + '">' + label + '</label>' +
      (type === 'textarea' ? '<textarea class="jb-input" id="jb-' + id + '" name="' + id + '" rows="3" maxlength="1000" ' + (extra || '') + '>' + esc(value) + '</textarea>'
        : '<input class="jb-input" id="jb-' + id + '" name="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (extra || '') + '>') +
      (hint ? '<p class="jb-field__hint">' + fr(hint) + '</p>' : '') + '</div>';
  }
  function viewDetails() {
    var c = S.cfg, t = totals(), f = S.form, pol = c.policies || {};
    var rules = [['Acompte', pol.deposit], ['Annulation', pol.cancel], ['Retard', pol.late], ['Paiement', pol.payment]].filter(function (x) { return x[1]; });
    var html = '<h2 class="jb-title" tabindex="-1">Vos coordonnées</h2><form class="jb-form" data-jb-form novalidate>' +
      field('name', 'Prénom et nom', 'text', f.name, 'autocomplete="name" maxlength="80" required') +
      field('phone', 'Téléphone (WhatsApp de préférence)', 'tel', f.phone, 'autocomplete="tel" inputmode="tel" maxlength="30" required') +
      field('email', 'E-mail <small>facultatif</small>', 'email', f.email, 'autocomplete="email" maxlength="120"', 'Pour recevoir la confirmation, le rappel la veille, et le lien pour déplacer votre rendez-vous.') +
      field('note', 'Un mot pour nous <small>facultatif</small>', 'textarea', f.note, '', '');
    if (t.deposit > 0 && c.payments.length) {
      html += '<fieldset class="jb-field jb-pay"><legend class="jb-label">Régler l’acompte de ' + money(t.deposit) + ' par</legend><div class="jb-pay__list">' + c.payments.map(function (p, i) {
        var on = f.payment ? f.payment === p : i === 0;
        return '<label class="jb-pay__opt"><input type="radio" name="payment" value="' + esc(p) + '"' + (on ? ' checked' : '') + '><span>' + esc(p) + '</span></label>';
      }).join('') + '</div><p class="jb-field__hint">' + fr('Nous vous envoyons la demande de paiement après votre réservation. Rien n’est débité ici.') + '</p></fieldset>';
    }
    if (rules.length) {
      html += '<div class="jb-rules"><p class="jb-rules__title">À savoir avant de réserver</p><dl>' + rules.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + fr(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '<label class="jb-agree"><input type="checkbox" name="agree"' + (f.agree ? ' checked' : '') + '><span>J’ai lu et j’accepte ces conditions.</span></label></div>';
    }
    if (S.error) html += '<p class="jb-alert" role="alert">' + fr(S.error) + '</p>';
    html += '<div class="jb-nav"><button type="button" class="jb-btn jb-btn--ghost" data-jb="back">Retour</button>' +
      '<button type="submit" class="jb-btn jb-btn--primary"' + (S.sending ? ' disabled' : '') + '>' + (S.sending ? 'Un instant…' : (c.autoConfirm ? 'Confirmer le rendez-vous' : 'Envoyer ma demande')) + '</button></div></form>';
    return html;
  }
  function ics(a, name) {
    var z = function (iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jeere//Rendez-vous//FR', 'BEGIN:VEVENT', 'UID:jeere-' + a.number + '-' + z(a.start) + '@jeere', 'DTSTAMP:' + z(new Date().toISOString()),
      'DTSTART:' + z(a.start), 'DTEND:' + z(a.end), 'SUMMARY:' + (a.service.name + ' · ' + name).replace(/[,;\\]/g, ' '),
      a.store && a.store.address ? 'LOCATION:' + a.store.address.replace(/[,;\\]/g, ' ') : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
  }
  function apptCard(a) {
    var adds = (a.service.addons || []).map(function (x) { return x.name; });
    return '<dl class="jb-card"><div><dt>Prestation</dt><dd>' + esc(a.service.name) + (adds.length ? ' + ' + esc(adds.join(', ')) : '') + '</dd></div>' +
      '<div><dt>Quand</dt><dd>' + esc(longDate(a.start)) + ' à ' + clock(a.start) + ' <small>(' + duration(a.service.duration) + ')</small></dd></div>' +
      (a.staffName && S.cfg && S.cfg.staff.length > 1 ? '<div><dt>Avec</dt><dd>' + esc(a.staffName) + '</dd></div>' : '') +
      (a.store && a.store.address ? '<div><dt>Où</dt><dd>' + esc(a.store.address) + '</dd></div>' : '') +
      '<div><dt>Prix</dt><dd>' + (a.service.from ? 'dès' + NB : '') + money(a.total) + '</dd></div>' +
      (a.deposit > 0 ? '<div><dt>Acompte</dt><dd>' + money(a.deposit) + ' <small>' + ({ recu: 'reçu', rembourse: 'remboursé', garde: 'conservé' }[a.depositStatus] || ('à régler' + (a.payment ? ' par ' + esc(a.payment) : ''))) + '</small></dd></div>' : '') + '</dl>';
  }
  function viewDone() {
    var a = S.done.appointment, name = (S.cfg && S.cfg.store.name) || '';
    var pending = a.status === 'en_attente';
    var msg = wa('Bonjour, je viens de réserver « ' + a.service.name + ' » le ' + longDate(a.start) + ' à ' + clock(a.start).replace(new RegExp(NB, 'g'), ' ') + ' (rendez-vous n° ' + a.number + ').');
    return '<div class="jb-done"><p class="jb-done__badge">' + (pending ? 'Demande envoyée' : 'Rendez-vous confirmé') + '</p>' +
      '<h2 class="jb-title" tabindex="-1">' + (pending ? 'Merci ' + esc(a.firstName) + ', nous vous confirmons très vite.' : 'C’est noté, ' + esc(a.firstName) + ' !') + '</h2>' +
      '<p class="jb-done__num">Rendez-vous n° ' + esc(a.number) + '</p>' + apptCard(a) +
      (a.deposit > 0 ? '<p class="jb-hint">' + fr('Acompte de ' + money(a.deposit) + ' : nous vous envoyons la demande de paiement' + (a.payment ? ' ' + a.payment : '') + ' sur votre téléphone. Votre créneau est bloqué dès réception.') + '</p>' : '') +
      (S.cfg && S.cfg.policies && S.cfg.policies.prep ? '<p class="jb-hint"><b>Avant de venir :</b> ' + fr(S.cfg.policies.prep) + '</p>' : '') +
      '<div class="jb-done__actions"><a class="jb-btn jb-btn--primary" href="' + esc(ics(a, name)) + '" download="rendez-vous-' + esc(a.number) + '.ics">Ajouter à mon agenda</a>' +
      '<a class="jb-btn jb-btn--ghost" href="' + esc(S.done.manageUrl) + '">Gérer mon rendez-vous</a>' +
      (msg ? '<a class="jb-btn jb-btn--ghost" href="' + esc(msg) + '" target="_blank" rel="noopener">Écrire sur WhatsApp</a>' : '') + '</div>' +
      '<p class="jb-hint">' + fr('Gardez le lien « Gérer mon rendez-vous » : il sert à le déplacer ou à l’annuler.') + '</p></div>';
  }
  function unavailable() {
    var why = S.status === 'closed' ? 'La prise de rendez-vous en ligne n’est pas ouverte pour le moment.' : (S.status === 'notfound' ? 'Ce studio n’est pas encore en ligne.' : 'La réservation en ligne est momentanément indisponible.');
    return '<div class="jb-off"><p>' + fr(why) + '</p>' + (S.status === 'offline' ? '<button type="button" class="jb-btn jb-btn--ghost" data-jb="retry">Réessayer</button>' : '') + '</div>';
  }
  function bookingHTML() {
    if (S.status === 'loading') return '<p class="jb-hint" role="status">Chargement…</p>';
    if (S.status !== 'ok') return unavailable();
    if (S.done) return viewDone();
    var body = S.step === 'service' ? viewService() : (S.step === 'staff' ? viewStaff() : (S.step === 'time' ? viewTime() : viewDetails()));
    var solo = S.step === 'service';
    return head() + '<div class="jb-body' + (solo ? ' jb-body--solo' : '') + '"><div class="jb-main">' + body + '</div>' + (solo ? '' : recap()) + '</div>';
  }

  /* ---------------------------------------------------------------- « my appointment » */
  var STATUS = { en_attente: 'En attente de confirmation', confirme: 'Confirmé', termine: 'Terminé', absent: 'Absence', annule: 'Annulé' };
  function apptHTML() {
    if (S.apptError) return '<div class="jb-off"><p>' + fr(S.apptError) + '</p></div>';
    var a = S.appt;
    if (!a) return '<p class="jb-hint" role="status">Chargement de votre rendez-vous…</p>';
    if (S.apptMode === 'move') {
      return '<div class="jb-body"><div class="jb-main">' + calendar(true) + (S.error ? '<p class="jb-alert" role="alert">' + fr(S.error) + '</p>' : '') +
        '<div class="jb-nav"><button type="button" class="jb-btn jb-btn--ghost" data-jb="appt-view">Retour</button><button type="button" class="jb-btn jb-btn--primary" data-jb="appt-move"' + (S.slot && !S.sending ? '' : ' disabled') + '>' + (S.sending ? 'Un instant…' : 'Déplacer mon rendez-vous') + '</button></div></div></div>';
    }
    var live = a.status === 'en_attente' || a.status === 'confirme';
    var msg = wa('Bonjour, c’est au sujet de mon rendez-vous n° ' + a.number + ' du ' + longDate(a.start) + '.');
    return '<div class="jb-appt"><p class="jb-done__badge jb-status--' + esc(a.status) + '">' + STATUS[a.status] + '</p>' +
      '<h2 class="jb-title" tabindex="-1">Bonjour ' + esc(a.firstName) + ', voici votre rendez-vous</h2><p class="jb-done__num">n° ' + esc(a.number) + ' · ' + esc(a.store.name) + '</p>' + apptCard(a) +
      (S.error ? '<p class="jb-alert" role="alert">' + fr(S.error) + '</p>' : '') +
      (a.canChange ? '<div class="jb-done__actions"><button type="button" class="jb-btn jb-btn--primary" data-jb="appt-pick">Déplacer</button>' +
        (S.apptMode === 'cancel' ? '<button type="button" class="jb-btn jb-btn--danger" data-jb="appt-cancel"' + (S.sending ? ' disabled' : '') + '>Oui, annuler ce rendez-vous</button><button type="button" class="jb-btn jb-btn--ghost" data-jb="appt-view">Non, le garder</button>'
          : '<button type="button" class="jb-btn jb-btn--ghost" data-jb="appt-ask-cancel">Annuler</button>') + '</div>'
        : (live ? '<p class="jb-hint">' + fr('Il reste moins de ' + a.cancelWindow + ' h : pour déplacer ou annuler, contactez-nous directement.') + '</p>' : '')) +
      (live ? '<div class="jb-done__actions"><a class="jb-btn jb-btn--ghost" href="' + esc(ics(a, a.store.name)) + '" download="rendez-vous-' + esc(a.number) + '.ics">Ajouter à mon agenda</a>' +
        (msg ? '<a class="jb-btn jb-btn--ghost" href="' + esc(msg) + '" target="_blank" rel="noopener">Écrire sur WhatsApp</a>' : '') + '</div>' : '') +
      (a.policies && a.policies.cancel && live ? '<p class="jb-hint">' + fr(a.policies.cancel) + '</p>' : '') + '</div>';
  }

  /* ---------------------------------------------------------------- drawing */
  function apptMounts() {
    var own = $$('[data-jeere-appointment]');
    return own.length ? own : (TOKEN ? mounts() : []);
  }
  function draw(focus) {
    var showAppt = !!TOKEN, am = apptMounts();
    mounts().forEach(function (m) {
      if (showAppt && am.indexOf(m) >= 0) return;
      m.classList.add('jb');
      m.innerHTML = bookingHTML();
    });
    if (showAppt) am.forEach(function (m) { m.classList.add('jb'); m.innerHTML = apptHTML(); });
    if (focus) {
      var box = (showAppt ? am : mounts())[0];
      var h = box && box.querySelector('.jb-title');
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      if (box && box.getBoundingClientRect().top < 0) { try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { box.scrollIntoView(); } }
    }
  }

  /* ---------------------------------------------------------------- slots */
  function loadSlots(serviceId, addons, staffId) {
    var key = slotKey();
    if (S.slots[key] || S.loadingSlots) return Promise.resolve();
    var c = S.cfg, p = parts(S.month + '-01');
    var from = ymd(p.y, p.m, 1);
    if (from < c.today) from = c.today;
    var days = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate() - parts(from).d + 1;
    S.loadingSlots = true; S.slotError = '';
    draw();
    return call({ action: 'slots', slug: slug, serviceId: serviceId, addons: addons, staffId: staffId, from: from, days: days }).then(function (j) {
      S.loadingSlots = false;
      if (j.ok) S.slots[key] = j.days || {}; else S.slotError = j.message || 'Les créneaux n’ont pas pu être chargés.';
      // the first month with nothing free: look at the next one by itself, once
      if (j.ok && !Object.keys(S.slots[key]).length && !S.autoNext) {
        var next = ymd(p.y, p.m + 1, 1), last = lastBookDay();
        if (next <= last) { S.autoNext = true; S.month = next.slice(0, 7); return loadSlots(serviceId, addons, staffId); }
      }
      draw();
    });
  }
  function enterTime() {
    S.month = S.month || S.cfg.today.slice(0, 7);
    S.autoNext = false;
    if (S.appt && S.apptMode === 'move') return loadSlots(S.appt.service.id, (S.appt.service.addons || []).map(function (x) { return x.id; }), 'any');
    return loadSlots(S.serviceId, S.addons, S.staffId);
  }
  function reloadSlots() { delete S.slots[slotKey()]; S.slot = null; return enterTime(); }

  /* ---------------------------------------------------------------- actions */
  function go(step, focus) { S.step = step; S.error = ''; draw(focus !== false); if (step === 'time') enterTime(); }
  function next() {
    var list = stepsList(), i = list.indexOf(S.step);
    if (S.step === 'service' && !S.serviceId) return;
    if (S.step === 'time' && !S.slot) return;
    if (i < list.length - 1) go(list[i + 1]);
  }
  function back() { var list = stepsList(), i = list.indexOf(S.step); if (i > 0) go(list[i - 1]); }
  function readForm(form) {
    var f = S.form;
    ['name', 'phone', 'email', 'note'].forEach(function (k) { var el = form.elements[k]; if (el) f[k] = String(el.value || '').trim(); });
    var pay = form.querySelector('input[name="payment"]:checked'); f.payment = pay ? pay.value : '';
    var ag = form.elements.agree; f.agree = ag ? !!ag.checked : true;
  }
  function submit(form) {
    if (S.sending) return;
    readForm(form);
    var f = S.form;
    if (!f.name) S.error = 'Indiquez votre prénom et votre nom.';
    else if (f.phone.replace(/\D/g, '').length < 8) S.error = 'Indiquez un numéro de téléphone complet.';
    else if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) S.error = 'Cette adresse e-mail n’est pas valide.';
    else if (!f.agree) S.error = 'Cochez la case pour accepter les conditions.';
    else S.error = '';
    if (S.error) { draw(); var al = document.querySelector('.jb .jb-alert'); if (al) { try { al.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } } return; }
    S.sending = true; draw();
    call({ action: 'book', slug: slug, serviceId: S.serviceId, addons: S.addons, staffId: S.staffId, start: S.slot.start,
      customer: { name: f.name, phone: f.phone, email: f.email }, note: f.note, payment: f.payment, site: manageBase(), source: attr('data-source') === 'jeere' ? 'jeere' : 'site' }).then(function (j) {
      S.sending = false;
      if (j.ok) {
        S.done = { appointment: j.appointment, manageUrl: j.manageUrl };
        S.slots = {};
        draw(true);
        emit('jeere:booked', S.done);
      } else {
        S.error = j.message || 'Le rendez-vous n’a pas pu être enregistré. Réessayez.';
        if (j.code === 'taken') { S.step = 'time'; reloadSlots().then(function () { S.slotError = j.message; draw(true); }); return; }
        draw();
      }
    });
  }
  function open(serviceId) {
    var here = mounts().length > 0;
    if (!here) {
      var url = attr('data-book-url');
      if (url) window.location.href = absUrl(url) + (serviceId ? '?prestation=' + encodeURIComponent(serviceId) : '');
      return;
    }
    if (S.status === 'ok') {
      S.done = null;
      if (serviceId && service(serviceId)) { S.serviceId = serviceId; S.addons = []; S.staffId = 'any'; S.slot = null; S.date = ''; }
      S.step = 'service';
    }
    draw(true);
    var m = mounts()[0];
    if (m) { try { m.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { m.scrollIntoView(); } }
  }
  function loadAppt() {
    return call({ action: 'get', token: TOKEN }).then(function (j) {
      if (j.ok) { S.appt = j.appointment; if (!slugOk && j.slug) slug = j.slug; } else S.apptError = j.code === 'offline' ? j.message : 'Ce rendez-vous est introuvable. Vérifiez le lien reçu par e-mail.';
      draw();
    });
  }
  function apptAction(body, after) {
    S.sending = true; S.error = ''; draw();
    call(body).then(function (j) {
      S.sending = false;
      if (j.ok) { S.appt = j.appointment; S.apptMode = 'view'; S.slot = null; S.slots = {}; if (after) after(); }
      else { S.error = j.message || 'L’action n’a pas abouti. Réessayez.'; if (j.code === 'taken') { reloadSlots(); return; } }
      draw(true);
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var bookBtn = t.closest('[data-jeere-book]');
    if (bookBtn) {
      e.preventDefault();
      var id = bookBtn.getAttribute('data-jeere-book') || '';
      if (!id) { var card = bookBtn.closest('[data-jeere-service]'); if (card) id = card.getAttribute('data-jeere-service') || ''; }
      open(id);
      return;
    }
    var b = t.closest('.jb [data-jb]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-jb'), id2 = b.getAttribute('data-id') || '';
    if (act === 'service') {
      var was = b.getBoundingClientRect().top;
      S.serviceId = S.serviceId === id2 ? '' : id2; S.staffId = 'any'; S.slot = null; S.date = ''; S.fresh = !!S.serviceId;
      draw(); S.fresh = false;
      var keep = document.querySelector('.jb [data-jb="service"][data-id="' + id2 + '"]');
      if (keep) {
        try { keep.focus({ preventScroll: true }); } catch (er0) { keep.focus(); }
        var moved = keep.getBoundingClientRect().top - was;
        if (Math.abs(moved) > 1) window.scrollBy(0, moved);
      }
    }
    else if (act === 'addon') { var i = S.addons.indexOf(id2); if (i >= 0) S.addons.splice(i, 1); else S.addons.push(id2); S.slot = null; S.date = ''; draw(); var k2 = document.querySelector('.jb [data-jb="addon"][data-id="' + id2 + '"]'); if (k2) k2.focus(); }
    else if (act === 'staff') { S.staffId = id2; S.slot = null; S.date = ''; draw(); var k3 = document.querySelector('.jb [data-jb="staff"][data-id="' + id2 + '"]'); if (k3) k3.focus(); }
    else if (act === 'next') next();
    else if (act === 'back') back();
    else if (act === 'retry') { S.status = 'loading'; draw(); start(); }
    else if (act === 'month') {
      var p = parts(S.month + '-01'); S.month = ymd(p.y, p.m + Number(b.getAttribute('data-dir')), 1).slice(0, 7); S.date = ''; S.slot = null; S.autoNext = true;
      draw(); enterTime();
    }
    else if (act === 'day') { S.date = b.getAttribute('data-date'); S.slot = null; draw(); var tm = document.querySelector('.jb .jb-times'); if (tm) { try { tm.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (er) { /* ignore */ } } }
    else if (act === 'time') {
      var list = (S.slots[slotKey()] || {})[S.date] || [], st = b.getAttribute('data-start');
      S.slot = list.filter(function (s) { return s.start === st; })[0] || null; draw();
      var on = document.querySelector('.jb .jb-time.is-on'); if (on) on.focus();
    }
    else if (act === 'appt-pick') { S.apptMode = 'move'; S.slot = null; S.date = ''; S.month = ''; S.error = ''; draw(true); if (S.cfg) enterTime(); }
    else if (act === 'appt-view') { S.apptMode = 'view'; S.error = ''; draw(true); }
    else if (act === 'appt-ask-cancel') { S.apptMode = 'cancel'; draw(); }
    else if (act === 'appt-cancel') apptAction({ action: 'cancel', token: TOKEN });
    else if (act === 'appt-move' && S.slot) apptAction({ action: 'reschedule', token: TOKEN, start: S.slot.start });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target && e.target.matches && e.target.matches('.jb [data-jb-form]') ? e.target : null;
    if (!f) return;
    e.preventDefault();
    submit(f);
  });
  document.addEventListener('input', function (e) { var f = e.target && e.target.closest ? e.target.closest('.jb [data-jb-form]') : null; if (f) readForm(f); });

  /* ---------------------------------------------------------------- start */
  function loadStyle() {
    if (attr('data-style') === 'none' || document.querySelector('link[data-jeere-booking-css]')) return;
    var src = me && me.src ? me.src.replace(/jeere-booking\.js(\?.*)?$/, 'jeere-booking.css?v=2') : '';
    if (!src) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = src; l.setAttribute('data-jeere-booking-css', '');
    document.head.appendChild(l);
  }
  var resolveReady;
  var ready = new Promise(function (res) { resolveReady = res; });
  function start() {
    var go1 = function () {
      if (!slugOk && !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) { S.status = 'notfound'; draw(); fillSite(); resolveReady(S.status); emit('jeere:booking-ready', { status: S.status, config: null }); return; }
      call({ action: 'config', slug: slug }).then(function (j) {
        if (j.ok) {
          S.cfg = j; S.status = j.enabled ? 'ok' : 'closed';
          var want = param('prestation');
          if (want && service(want)) S.serviceId = want;
          if (S.appt && S.apptMode === 'move') enterTime();
        } else S.status = j.code === 'store' ? 'notfound' : 'offline';
        fillSite(); draw();
        resolveReady(S.status);
        emit('jeere:booking-ready', { status: S.status, config: S.cfg });
      });
    };
    if (TOKEN) loadAppt().then(go1); else go1();
  }
  function init() { loadStyle(); draw(); start(); }

  window.JeereBooking = {
    version: 1, ready: ready,
    status: function () { return S.status; },
    config: function () { return S.cfg; },
    open: open
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
