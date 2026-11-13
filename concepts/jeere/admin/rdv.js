/*
 * Jeere — admin/rdv.js: the dashboard's « Rendez-vous » section (classic script, deferred, loaded before admin.js).
 * Global: window.JeereAdminRdv = { view(route) → HTML, pendingCount() }. admin.js calls view() for #rendez-vous[/…];
 * this file loads its own data from the `bookings` Edge Function and asks admin.js to redraw (JeereAdmin.ui.refresh).
 *
 * For service businesses (lashes, nails, hair…): what « Commandes » is to a shop. Nothing is kept in this browser:
 * the services, the hours, the rules and every appointment live on Supabase (booking_settings, appointments), so the
 * agenda is the same on her phone and her laptop, and a client's booking shows up at once.
 *
 *   #rendez-vous                the agenda: requests to confirm, the week, the day's appointments, the week's numbers
 *   #rendez-vous/prestations    her services and add-ons (name, category, duration, price, deposit)
 *   #rendez-vous/horaires       opening hours, breaks, dates with their own hours (« jours particuliers »), the team,
 *                               the booking rules (slot step, notice, buffer, open until a date or N weeks ahead)
 *   #rendez-vous/regles         online booking on/off, confirmation, deposit, payment means, address, policies
 *   #rendez-vous/clients        her clients, from the appointments
 *
 * Needs a store that is online (JeerePublish.local().storeId) and a signed-in seller (JeereAuth.session()).
 * Uses admin.css's classes, plus rdv.css for the week strip and the day list.
 */
(function () {
  'use strict';

  var FN = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/bookings';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var NB = ' ';
  var DAY = 86400000;
  var R = fresh();
  function fresh() {
    return { storeId: '', loading: false, loaded: false, error: '', settings: null, store: null, bookingUrl: '', pays: [], configured: false,
      day: '', from: 0, to: 0, appts: [], blocks: [], pending: [], today: '', listLoading: false, listError: '', clients: null, clientsLoading: false, saving: false };
  }

  /* ---------------------------------------------------------------- helpers */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function fr(s) { return esc(s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function ico(n) { return '<svg class="a-ico" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
  function ui() { return (window.JeereAdmin && window.JeereAdmin.ui) || {}; }
  function toast(m) { if (ui().toast) ui().toast(m); }
  function redraw() { if (ui().refresh) ui().refresh(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function storeRec() { try { var r = window.JeerePublish && window.JeerePublish.local(); return r && r.storeId && r.published ? r : null; } catch (e) { return null; } }
  function call(body) {
    var A = window.JeereAuth;
    return Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).catch(function () { return null; }).then(function (s) {
      if (!s || !s.access_token) return { ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere pour voir vos rendez-vous.' };
      return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); }, function () { return { ok: false, code: 'offline', message: 'Pas de connexion internet.' }; });
    });
  }
  var CUR = { XOF: ['FCFA', 1], CAD: ['$' + NB + 'CA', 100], USD: ['$' + NB + 'US', 100], EUR: ['€', 100] };
  function money(n) {
    var c = CUR[(R.store && R.store.currency) || 'XOF'] || CUR.XOF, x = Math.round((Number(n) || 0) * c[1]) / c[1];
    var whole = Math.floor(Math.abs(x)), cents = Math.round((Math.abs(x) - whole) * 100);
    return (x < 0 ? '-' : '') + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (cents ? ',' + pad(cents) : '') + NB + c[0];
  }
  function duration(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + NB + 'h' + (m ? NB + pad(m) : '') : m + NB + 'min'; }
  function hhmm(t) { var h = Number(t.slice(0, 2)), m = t.slice(3, 5); return h + NB + 'h' + (m === '00' ? '' : NB + m); }
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // her time zone: every day and hour of the agenda is HERS, wherever this browser is
  function tz() { return (R.settings && R.settings.timezone) || 'Africa/Abidjan'; }
  function zoneParts(ms) {
    var p = {};
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = Number(x.value); });
    } catch (e) { var d = new Date(ms); p = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: 0 }; }
    return p;
  }
  function localDate(iso) { var p = zoneParts(Date.parse(iso)); return p.year + '-' + pad(p.month) + '-' + pad(p.day); }
  function localTime(iso) { var p = zoneParts(Date.parse(iso)); return pad(p.hour) + ':' + pad(p.minute); }
  function toUtc(date, time) {
    var y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10)), min = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    var guess = Date.UTC(y, m - 1, d, 0, min);
    var off = function (ms) { var p = zoneParts(ms); return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms) / 60000); };
    var o1 = off(guess), t = guess - o1 * 60000, o2 = off(t);
    if (o2 !== o1) t = guess - o2 * 60000;
    return new Date(t).toISOString();
  }
  function ymd(y, m, d) { var t = new Date(Date.UTC(y, m, d)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function addDays(date, n) { return ymd(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n); }
  function dow(date) { return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay(); }
  function monday(date) { return addDays(date, -((dow(date) + 6) % 7)); }
  function dayLabel(date, short) { var d = Number(date.slice(8, 10)); return (short ? DAYS_SHORT : DAYS)[dow(date)] + ' ' + d + (d === 1 ? 'er' : '') + ' ' + MONTHS[Number(date.slice(5, 7)) - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function todayStr() { return R.today || localDate(new Date().toISOString()); }
  // the hours of one date: its own (« jour particulier ») when she set some, else the week's
  function specialOf(date) { return ((R.settings && R.settings.special) || []).filter(function (x) { return x.date === date; })[0] || null; }
  function hoursOf(date) { var sp = specialOf(date); return sp ? { open: sp.open, from: sp.from, to: sp.to, special: true } : (R.settings.hours[dow(date)] || {}); }
  function staffName(id) { var s = (R.settings.staff || []).filter(function (x) { return x.id === id; })[0]; return s ? s.name : ''; }
  function manyStaff() { return (R.settings.staff || []).filter(function (x) { return x.active !== false; }).length > 1; }
  function waLink(phone, text) { var n = String(phone || '').replace(/\D/g, ''); if (n.length === 10 && n.charAt(0) === '0') n = '225' + n; return n.length >= 8 ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : ''; }

  var STATUS = { en_attente: ['À confirmer', 'warn', 'clock'], confirme: ['Confirmé', 'ok', 'check'], termine: ['Terminé', 'info', 'check'], absent: ['Absente', 'err', 'x'], annule: ['Annulé', 'err', 'x'] };
  function pill(st) { var s = STATUS[st] || STATUS.confirme; return '<span class="a-pill a-pill--check a-tone--' + s[1] + '">' + ico(s[2]) + s[0] + '</span>'; }
  function depositChip(a) {
    if (!a.deposit) return '';
    var m = { en_attente: ['Acompte à recevoir', 'warn'], recu: ['Acompte reçu', 'ok'], rembourse: ['Acompte remboursé', 'info'], garde: ['Acompte conservé', 'info'] }[a.deposit_status];
    return m ? '<span class="a-chip a-chip--line a-tone--' + m[1] + '">' + m[0] + ' · ' + money(a.deposit) + '</span>' : '';
  }

  /* ---------------------------------------------------------------- loading */
  function loadSettings() {
    R.loading = true; R.error = '';
    return call({ action: 'settings', storeId: R.storeId }).then(function (j) {
      R.loading = false;
      if (!j.ok) { R.error = j.message || 'Vos rendez-vous n’ont pas pu être chargés.'; redraw(); return; }
      R.loaded = true; R.settings = j.settings; R.store = j.store; R.bookingUrl = j.bookingUrl; R.pays = j.payments || []; R.configured = !!j.configured;
      redraw();
    });
  }
  function loadList(day) {
    var from = Date.parse(toUtc(addDays(monday(day), -7), '00:00')), to = from + 49 * DAY;
    R.listLoading = true; R.listError = '';
    return call({ action: 'list', storeId: R.storeId, from: new Date(from).toISOString(), to: new Date(to).toISOString() }).then(function (j) {
      R.listLoading = false;
      if (!j.ok) { R.listError = j.message || 'L’agenda n’a pas pu être chargé.'; redraw(); return; }
      R.from = from; R.to = to; R.appts = j.appointments || []; R.blocks = j.blocks || []; R.pending = j.pending || []; R.today = j.today;
      if (!R.day) R.day = j.today;
      redraw(); if (ui().shell) ui().shell();
    });
  }
  function ensureList() {
    var day = R.day || R.today || localDate(new Date().toISOString());
    var t = Date.parse(toUtc(day, '12:00'));
    if (R.listLoading) return;
    if (!R.from || t < R.from + DAY || t > R.to - 8 * DAY) loadList(day);
  }
  function reloadList() { return loadList(R.day || R.today); }
  function saveSettings(msg) {
    if (R.saving) return Promise.resolve(false);
    R.saving = true;
    return call({ action: 'save', storeId: R.storeId, settings: R.settings }).then(function (j) {
      R.saving = false;
      if (!j.ok) { toast(j.message || 'Vos réglages n’ont pas pu être enregistrés.'); return false; }
      R.settings = j.settings; R.configured = true;
      toast(msg || 'Enregistré.');
      redraw();
      return true;
    });
  }

  /* ---------------------------------------------------------------- shell */
  var TABS = [['', 'Agenda'], ['prestations', 'Prestations'], ['horaires', 'Horaires et équipe'], ['regles', 'Réservation en ligne'], ['clients', 'Clientes']];
  function tabs(cur) {
    return '<nav class="a-stripe-tabs r-tabs" aria-label="Rubriques des rendez-vous">' + TABS.map(function (t) {
      return '<a class="a-btn a-btn--ghost a-btn--sm" href="#rendez-vous' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</nav>';
  }
  function head(title, sub, actions) {
    return '<header class="a-ph"><div class="a-ph__txt"><h1 class="a-h1" tabindex="-1">' + fr(title) + '</h1>' + (sub ? '<p class="a-sub">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="a-ph__actions">' + actions + '</div>' : '') + '</header>';
  }
  function card(html, cls) { return '<section class="a-card' + (cls ? ' ' + cls : '') + '">' + html + '</section>'; }
  function empty(icon, title, text, extra) {
    return '<div class="a-empty"><span class="a-empty__ico">' + ico(icon) + '</span><p class="a-empty__title">' + fr(title) + '</p><p class="a-empty__text">' + fr(text) + '</p>' + (extra ? '<div class="a-btnrow">' + extra + '</div>' : '') + '</div>';
  }

  function view(r) {
    var rec = storeRec();
    if (!rec) {
      return '<div class="a-page">' + head('Rendez-vous', 'Prenez des réservations en ligne : cils, ongles, coiffure, soins…') +
        card(empty('clock', 'Mettez d’abord votre boutique en ligne', 'Les rendez-vous se prennent sur votre adresse Jeere ou sur votre site. Publiez votre boutique, puis revenez ici pour ajouter vos prestations et vos horaires.', '<a class="a-btn a-btn--primary" href="#boutique">Publier ma boutique</a>')) + '</div>';
    }
    if (rec.storeId !== R.storeId) { R = fresh(); R.storeId = rec.storeId; }
    if (!R.loaded) {
      if (!R.loading && !R.error) loadSettings();
      return '<div class="a-page">' + head('Rendez-vous', '') + card(R.error ? empty('alert', 'Impossible de charger vos rendez-vous', R.error, '<button class="a-btn a-btn--primary" type="button" data-rdv="retry">Réessayer</button>') : '<p class="a-small">Chargement…</p>') + '</div>';
    }
    var sub = (r.parts && r.parts[0]) || '';
    if (sub === 'prestations') return viewServices();
    if (sub === 'horaires') return viewHours();
    if (sub === 'regles') return viewRules();
    if (sub === 'clients') return viewClients();
    return viewAgenda();
  }

  /* ---------------------------------------------------------------- 1. the agenda */
  var PRESETS = {
    cils: { label: 'Cils et sourcils', icon: 'eye', services: [['Pose cil à cil', 'Extensions', 120, 25000], ['Pose volume russe', 'Extensions', 150, 35000], ['Remplissage', 'Extensions', 60, 12000], ['Dépose', 'Extensions', 30, 5000], ['Rehaussement de cils', 'Rehaussement', 60, 15000], ['Restructuration des sourcils', 'Sourcils', 30, 5000]], addons: [['Cils du bas', 20, 5000]] },
    ongles: { label: 'Ongles', icon: 'sparkle', services: [['Manucure', 'Mains', 45, 6000], ['Vernis semi-permanent', 'Mains', 45, 8000], ['Pose gel sur capsules', 'Mains', 120, 20000], ['Remplissage', 'Mains', 90, 15000], ['Dépose', 'Mains', 30, 4000], ['Pédicure', 'Pieds', 60, 10000]], addons: [['French', 15, 3000], ['Nail art, 2 ongles', 15, 2000]] },
    coiffure: { label: 'Coiffure et tresses', icon: 'user', services: [['Pose de perruque', 'Perruques', 90, 15000], ['Tissage', 'Tissages', 150, 20000], ['Knotless braids', 'Tresses', 300, 30000], ['Nattes collées', 'Tresses', 90, 10000], ['Brushing', 'Soins', 45, 7000]], addons: [['Lavage', 20, 3000]] },
    maquillage: { label: 'Maquillage', icon: 'palette', services: [['Maquillage jour', 'Maquillage', 60, 15000], ['Maquillage soirée', 'Maquillage', 75, 25000], ['Maquillage mariée', 'Maquillage', 120, 60000], ['Essai mariée', 'Maquillage', 90, 20000]], addons: [['Faux cils', 10, 3000]] },
    autre: { label: 'Autre métier', icon: 'plus', services: [], addons: [] }
  };
  function onboarding() {
    return card('<div class="a-card__head"><div><h2 class="a-card__title">Quel est votre métier ?</h2><p class="a-card__sub">' + fr('On prépare une carte de prestations d’exemple : vous changez les noms, les durées et les prix ensuite.') + '</p></div></div>' +
      '<div class="r-presets">' + Object.keys(PRESETS).map(function (k) { return '<button class="r-preset" type="button" data-rdv="preset" data-id="' + k + '">' + ico(PRESETS[k].icon) + '<span>' + PRESETS[k].label + '</span></button>'; }).join('') + '</div>');
  }
  function apptRow(a) {
    var svc = a.service || {}, c = a.customer || {};
    var adds = (svc.addons || []).map(function (x) { return x.name; });
    return '<li><button class="r-row' + (a.status === 'annule' ? ' is-off' : '') + '" type="button" data-rdv="open" data-id="' + esc(a.id) + '">' +
      '<span class="r-row__time"><b>' + hhmm(localTime(a.starts_at)) + '</b><small>' + hhmm(localTime(a.ends_at)) + '</small></span>' +
      '<span class="r-row__main"><span class="r-row__who">' + esc(c.name || 'Cliente') + '</span><span class="r-row__what">' + esc(svc.name || '') + (adds.length ? ' + ' + esc(adds.join(', ')) : '') + ' · ' + duration(svc.duration || 0) + '</span>' +
      '<span class="r-row__tags">' + pill(a.status) + (manyStaff() ? '<span class="a-chip a-chip--line">' + esc(staffName(a.staff_id)) + '</span>' : '') + depositChip(a) + '</span></span>' +
      '<span class="r-row__price">' + money(a.total) + '</span></button></li>';
  }
  function blockRow(b) {
    var full = localTime(b.starts_at) === '00:00' && (Date.parse(b.ends_at) - Date.parse(b.starts_at)) >= DAY - 60000;
    return '<li><div class="r-row r-row--block"><span class="r-row__time"><b>' + (full ? 'Journée' : hhmm(localTime(b.starts_at))) + '</b>' + (full ? '' : '<small>' + hhmm(localTime(b.ends_at)) + '</small>') + '</span>' +
      '<span class="r-row__main"><span class="r-row__who">Créneau bloqué</span><span class="r-row__what">' + esc(b.reason || 'Indisponible') + (b.staff_id && manyStaff() ? ' · ' + esc(staffName(b.staff_id)) : '') + '</span></span>' +
      '<button class="a-ibtn" type="button" data-rdv="unblock" data-id="' + esc(b.id) + '" aria-label="Rouvrir ce créneau">' + ico('trash') + '</button></div></li>';
  }
  function viewAgenda() {
    ensureList();
    var S = R.settings, day = R.day || R.today || '';
    var hasServices = (S.services || []).length > 0;
    var actions = (hasServices ? '<button class="a-btn a-btn--primary" type="button" data-rdv="new">' + ico('plus') + 'Nouveau rendez-vous</button>' : '') +
      '<button class="a-btn a-btn--ghost" type="button" data-rdv="block">' + ico('lock') + 'Bloquer un créneau</button>' +
      '<button class="a-ibtn a-ibtn--line" type="button" data-rdv="share" aria-label="Partager mon lien de réservation">' + ico('share') + '</button>';
    var html = '<div class="a-page">' + head('Rendez-vous', hasServices ? (S.enabled ? 'Réservation en ligne ouverte' + (S.openUntil ? ' jusqu’au ' + esc(dayLabel(S.openUntil)) : '') : '<span class="a-tone--warn">Réservation en ligne fermée</span> · <a class="a-link" href="#rendez-vous/regles">Ouvrir</a>') : '', actions) + tabs('');
    if (!hasServices) return html + onboarding() + '</div>';
    if (R.listError) return html + card(empty('alert', 'L’agenda n’a pas pu être chargé', R.listError, '<button class="a-btn a-btn--primary" type="button" data-rdv="reload">Réessayer</button>')) + '</div>';
    if (!day) return html + card('<p class="a-small">Chargement de l’agenda…</p>') + '</div>';
    // to confirm
    if (R.pending.length) {
      html += card('<div class="a-card__head"><div><h2 class="a-card__title">À confirmer <span class="a-chip">' + R.pending.length + '</span></h2><p class="a-card__sub">' + fr('La cliente reçoit un e-mail dès que vous confirmez.') + '</p></div></div><ul class="a-rows r-list">' +
        R.pending.map(function (a) {
          return '<li><div class="r-row r-row--ask"><span class="r-row__time"><b>' + esc(cap(dayLabel(localDate(a.starts_at), true))) + '</b><small>' + hhmm(localTime(a.starts_at)) + '</small></span>' +
            '<span class="r-row__main"><span class="r-row__who">' + esc((a.customer || {}).name) + '</span><span class="r-row__what">' + esc((a.service || {}).name) + ' · ' + money(a.total) + '</span></span>' +
            '<span class="r-row__btns"><button class="a-btn a-btn--primary a-btn--sm" type="button" data-rdv="status" data-id="' + esc(a.id) + '" data-status="confirme">Confirmer</button><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-rdv="open" data-id="' + esc(a.id) + '">Voir</button></span></div></li>';
        }).join('') + '</ul>', 'a-card--flush r-pending');
    }
    // the week
    var mon = monday(day), week = [];
    for (var i = 0; i < 7; i++) week.push(addDays(mon, i));
    var live = function (a) { return a.status !== 'annule'; };
    var byDay = function (d) { return R.appts.filter(function (a) { return localDate(a.starts_at) === d; }); };
    html += '<div class="r-week"><button class="a-ibtn a-ibtn--line" type="button" data-rdv="week" data-dir="-1" aria-label="Semaine précédente">' + ico('chev-left') + '</button><div class="r-week__days" role="tablist" aria-label="Jours de la semaine">' +
      week.map(function (d) {
        var n = byDay(d).filter(live).length;
        return '<button class="r-day' + (d === day ? ' is-on' : '') + (d === R.today ? ' is-today' : '') + '" type="button" role="tab" aria-selected="' + (d === day) + '" data-rdv="day" data-date="' + d + '"><span class="r-day__dow">' + DAYS_SHORT[dow(d)] + '</span><span class="r-day__num">' + Number(d.slice(8, 10)) + '</span><span class="r-day__n">' + (n ? n + NB + 'rdv' : '·') + '</span></button>';
      }).join('') + '</div><button class="a-ibtn a-ibtn--line" type="button" data-rdv="week" data-dir="1" aria-label="Semaine suivante">' + ico('chev') + '</button></div>';
    // the day
    var list = byDay(day).sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); });
    var dayStart = Date.parse(toUtc(day, '00:00')), dayEnd = dayStart + DAY;
    var blocks = R.blocks.filter(function (b) { return Date.parse(b.starts_at) < dayEnd && Date.parse(b.ends_at) > dayStart; });
    var h = hoursOf(day);
    // one list in the order of the day: blocked time and appointments together
    var rows = blocks.map(function (b) { return { t: Math.max(Date.parse(b.starts_at), dayStart), html: blockRow(b) }; })
      .concat(list.map(function (a) { return { t: Date.parse(a.starts_at), html: apptRow(a) }; }))
      .sort(function (x, y) { return x.t - y.t; }).map(function (x) { return x.html; }).join('');
    html += card('<div class="a-card__head r-dayhead"><div><h2 class="a-card__title">' + esc(cap(dayLabel(day))) + (day === R.today ? ' <span class="a-chip">Aujourd’hui</span>' : '') + '</h2><p class="a-card__sub">' + (h.open ? 'Ouvert de ' + hhmm(h.from) + ' à ' + hhmm(h.to) : (h.special ? 'Fermé ce jour-là' : 'Jour de fermeture')) + (h.special ? ' · horaires particuliers' : '') + (R.listLoading ? ' · mise à jour…' : '') + '</p></div>' +
      (day !== R.today ? '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-rdv="day" data-date="' + esc(R.today) + '">Aujourd’hui</button>' : '') + '</div>' +
      (rows ? '<ul class="a-rows r-list">' + rows + '</ul>' : empty('clock', 'Aucun rendez-vous ce jour-là', h.open ? 'Les réservations de vos clientes s’affichent ici dès qu’elles arrivent.' : 'Vous êtes fermée ce jour-là.', '<button class="a-btn a-btn--ghost" type="button" data-rdv="new">' + ico('plus') + 'Ajouter un rendez-vous</button>')), 'a-card--flush');
    // the week's numbers
    var wk = R.appts.filter(function (a) { var d = localDate(a.starts_at); return d >= week[0] && d <= week[6]; });
    var done = wk.filter(function (a) { return a.status === 'confirme' || a.status === 'termine'; });
    var sum = function (l, k) { return l.reduce(function (n, a) { return n + (Number(a[k]) || 0); }, 0); };
    var owed = wk.filter(function (a) { return live(a) && a.deposit_status === 'en_attente'; });
    html += '<div class="a-kpis r-kpis"><div class="a-kpi"><span class="a-kpi__label">Rendez-vous de la semaine</span><b class="a-kpi__value">' + done.length + '</b></div>' +
      '<div class="a-kpi"><span class="a-kpi__label">Chiffre prévu</span><b class="a-kpi__value">' + money(sum(done, 'total')) + '</b></div>' +
      '<div class="a-kpi"><span class="a-kpi__label">Acomptes à recevoir</span><b class="a-kpi__value">' + money(sum(owed, 'deposit')) + '</b></div></div>';
    return html + '</div>';
  }

  /* ---------------------------------------------------------------- dialogs of the agenda */
  function dlgHead(id, title) { return '<div class="a-dialog__head"><h2 class="a-dialog__title" id="' + id + '">' + fr(title) + '</h2><button class="a-ibtn" type="button" data-close aria-label="Fermer">' + ico('x') + '</button></div>'; }
  function field(label, inner, hint) { return '<div class="a-field"><label class="a-label">' + label + '</label>' + inner + (hint ? '<p class="a-hint">' + fr(hint) + '</p>' : '') + '</div>'; }
  function select(name, opts, val, attrs) { return '<div class="a-selectwrap"><select class="a-input" name="' + name + '"' + (attrs || '') + '>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + ico('down') + '</div>'; }
  function input(name, val, attrs) { return '<input class="a-input" name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || 'type="text"') + '>'; }
  function openDlg(html, id) { if (ui().openDialog) ui().openDialog(html, { labelledby: id }); }
  function closeDlg() { if (ui().closeDialog) ui().closeDialog(); }
  function activeStaff() { var s = (R.settings.staff || []).filter(function (x) { return x.active !== false; }); return s.length ? s : [{ id: 'e1', name: (R.store && R.store.name) || 'Moi' }]; }

  function openNew() {
    var S = R.settings, svcs = S.services.filter(function (s) { return s.active !== false; });
    if (!svcs.length) { toast('Ajoutez d’abord une prestation.'); return; }
    var staff = activeStaff();
    openDlg('<form class="a-dialog__card" data-rdv-form="new" novalidate>' + dlgHead('rn-t', 'Nouveau rendez-vous') + '<div class="a-dialog__body">' +
      '<p class="a-dialog__lead">' + fr('Pour une réservation prise par téléphone, WhatsApp ou sur place. Le créneau est bloqué sur votre site.') + '</p>' +
      field('Prestation', select('serviceId', svcs.map(function (s) { return [s.id, s.name + ' · ' + duration(s.duration) + ' · ' + money(s.price)]; }), svcs[0].id)) +
      (S.addons.length ? '<div class="a-field"><span class="a-label">Options</span><div class="r-checks">' + S.addons.filter(function (a) { return a.active !== false; }).map(function (a) { return '<label class="r-check"><input type="checkbox" name="addon" value="' + esc(a.id) + '"><span>' + esc(a.name) + ' <small>+ ' + money(a.price) + '</small></span></label>'; }).join('') + '</div></div>' : '') +
      (staff.length > 1 ? field('Avec', select('staffId', staff.map(function (s) { return [s.id, s.name]; }), staff[0].id)) : '') +
      '<div class="a-grid2 r-grid2">' + field('Jour', input('date', R.day || R.today, 'type="date" required')) + field('Heure', input('time', '10:00', 'type="time" step="300" required')) + '</div>' +
      field('Cliente', input('name', '', 'type="text" maxlength="80" autocomplete="off" placeholder="Prénom et nom" required')) +
      '<div class="a-grid2 r-grid2">' + field('Téléphone', input('phone', '', 'type="tel" inputmode="tel" maxlength="30" placeholder="07 07 00 00 00"')) + field('E-mail <small>(facultatif)</small>', input('email', '', 'type="email" maxlength="120" placeholder="Pour la confirmation et le rappel"')) + '</div>' +
      field('Note pour vous <small>(facultatif)</small>', '<textarea class="a-input" name="note" rows="2" maxlength="1000"></textarea>') +
      '<label class="r-check r-check--solo"><input type="checkbox" name="deposit"><span>Demander l’acompte prévu pour cette prestation</span></label>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div>' +
      '<div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Enregistrer le rendez-vous</button></div></form>', 'rn-t');
  }
  function openBlock() {
    var staff = activeStaff(), d = R.day || R.today;
    openDlg('<form class="a-dialog__card" data-rdv-form="block" novalidate>' + dlgHead('rb-t', 'Bloquer un créneau') + '<div class="a-dialog__body">' +
      '<p class="a-dialog__lead">' + fr('Un jour de repos, un rendez-vous personnel, des congés : personne ne peut réserver pendant ce temps.') + '</p>' +
      '<label class="r-check r-check--solo"><input type="checkbox" name="allday" checked data-rdv-change="allday"><span>Toute la journée</span></label>' +
      '<div class="a-grid2 r-grid2">' + field('Du', input('from', d, 'type="date" required')) + field('Au', input('to', d, 'type="date" required')) + '</div>' +
      '<div class="a-grid2 r-grid2" data-rdv-hours hidden>' + field('De', input('t1', '12:00', 'type="time" step="300"')) + field('À', input('t2', '14:00', 'type="time" step="300"')) + '</div>' +
      (staff.length > 1 ? field('Pour', select('staffId', [['', 'Tout le monde']].concat(staff.map(function (s) { return [s.id, s.name]; })), '')) : '') +
      field('Motif <small>(facultatif, pour vous)</small>', input('reason', '', 'type="text" maxlength="120" placeholder="Congés, formation…"')) +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div>' +
      '<div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Bloquer</button></div></form>', 'rb-t');
  }
  function find(id) { return R.appts.concat(R.pending).filter(function (a) { return a.id === id; })[0] || null; }
  function openAppt(id) {
    var a = find(id); if (!a) return;
    var svc = a.service || {}, c = a.customer || {};
    var adds = (svc.addons || []).map(function (x) { return x.name; });
    var when = cap(dayLabel(localDate(a.starts_at))) + ' à ' + hhmm(localTime(a.starts_at));
    var live = a.status === 'en_attente' || a.status === 'confirme';
    var wa = waLink(c.phone, 'Bonjour ' + String(c.name || '').split(' ')[0] + ', c’est ' + ((R.store && R.store.name) || 'votre studio') + '. Votre rendez-vous « ' + (svc.name || '') + ' » : ' + when.replace(new RegExp(NB, 'g'), ' ') + '.' +
      (a.deposit && a.deposit_status === 'en_attente' ? ' Acompte à régler : ' + money(a.deposit).replace(new RegExp(NB, 'g'), ' ') + '.' : ''));
    var rows = [['Prestation', esc(svc.name || '') + (adds.length ? ' + ' + esc(adds.join(', ')) : '')], ['Quand', esc(when) + ' <small>(' + duration(svc.duration || 0) + ')</small>']];
    if (manyStaff()) rows.push(['Avec', esc(staffName(a.staff_id))]);
    rows.push(['Prix', (svc.from ? 'dès' + NB : '') + money(a.total)]);
    rows.push(['Cliente', esc(c.name || '') + (c.phone ? '<br><a class="a-link" href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a>' : '') + (c.email ? '<br>' + esc(c.email) : '')]);
    if (a.note) rows.push(['Son message', fr(a.note)]);
    rows.push(['Pris', { site: 'sur votre site', jeere: 'sur votre page Jeere', manuel: 'par vous' }[a.source] || 'en ligne']);
    var dep = '';
    if (a.deposit) {
      dep = '<div class="r-dep"><p><b>Acompte : ' + money(a.deposit) + '</b>' + (a.payment ? ' · ' + esc(a.payment) : '') + '</p><div class="a-btnrow">' +
        [['en_attente', 'À recevoir'], ['recu', 'Reçu'], ['garde', 'Conservé'], ['rembourse', 'Remboursé']].map(function (o) { return '<button class="a-filter" type="button" data-rdv="deposit" data-id="' + esc(a.id) + '" data-status="' + o[0] + '" aria-pressed="' + (a.deposit_status === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    }
    var acts = '';
    if (a.status === 'en_attente') acts += '<button class="a-btn a-btn--primary" type="button" data-rdv="status" data-id="' + esc(a.id) + '" data-status="confirme">' + ico('check') + 'Confirmer</button>';
    if (a.status === 'confirme') acts += '<button class="a-btn a-btn--primary" type="button" data-rdv="status" data-id="' + esc(a.id) + '" data-status="termine">' + ico('check') + 'Terminé</button><button class="a-btn a-btn--ghost" type="button" data-rdv="status" data-id="' + esc(a.id) + '" data-status="absent">Elle n’est pas venue</button>';
    if (live) acts += '<button class="a-btn a-btn--ghost" type="button" data-rdv="move" data-id="' + esc(a.id) + '">' + ico('clock') + 'Déplacer</button><button class="a-btn a-btn--ghost" type="button" data-rdv="cancel" data-id="' + esc(a.id) + '">' + ico('x') + 'Annuler</button>';
    if (a.status === 'annule' || a.status === 'absent' || a.status === 'termine') acts += '<button class="a-btn a-btn--ghost" type="button" data-rdv="status" data-id="' + esc(a.id) + '" data-status="confirme">' + ico('undo') + 'Remettre « confirmé »</button>';
    openDlg('<div class="a-dialog__card">' + dlgHead('ra-t', 'Rendez-vous n° ' + a.number) + '<div class="a-dialog__body">' +
      '<p style="margin:0 0 12px">' + pill(a.status) + '</p><dl class="r-facts">' + rows.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>' + dep +
      '<div class="a-btnrow r-acts">' + acts + '</div>' +
      '<div class="a-btnrow">' + (wa ? '<a class="a-btn a-btn--quiet a-btn--sm" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ico('chat') + 'Lui écrire sur WhatsApp</a>' : '') +
      (a.manage_url ? '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-rdv="copy" data-text="' + esc(a.manage_url) + '">' + ico('link') + 'Copier son lien de rendez-vous</button>' : '') + '</div>' +
      '<form data-rdv-form="memo" data-id="' + esc(a.id) + '">' + field('Votre note <small>(vue par vous seule)</small>', '<textarea class="a-input" name="memo" rows="2" maxlength="2000">' + esc(a.memo || '') + '</textarea>') +
      '<div class="a-btnrow" style="margin-top:8px"><button class="a-btn a-btn--ghost a-btn--sm" type="submit">Enregistrer la note</button></div></form>' +
      '</div></div>', 'ra-t');
  }
  function openMove(id) {
    var a = find(id); if (!a) return;
    var staff = activeStaff();
    openDlg('<form class="a-dialog__card" data-rdv-form="move" data-id="' + esc(a.id) + '" novalidate>' + dlgHead('rm-t', 'Déplacer le rendez-vous') + '<div class="a-dialog__body">' +
      '<p class="a-dialog__lead">' + esc((a.customer || {}).name) + ' · ' + esc((a.service || {}).name) + '</p>' +
      '<div class="a-grid2 r-grid2">' + field('Jour', input('date', localDate(a.starts_at), 'type="date" required')) + field('Heure', input('time', localTime(a.starts_at), 'type="time" step="300" required')) + '</div>' +
      (staff.length > 1 ? field('Avec', select('staffId', staff.map(function (s) { return [s.id, s.name]; }), a.staff_id)) : '') +
      '<label class="r-check r-check--solo"><input type="checkbox" name="tell" checked><span>Prévenir la cliente par e-mail</span></label>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div>' +
      '<div class="a-dialog__foot"><button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Déplacer</button></div></form>', 'rm-t');
  }
  function replace(a) {
    R.appts = R.appts.map(function (x) { return x.id === a.id ? a : x; });
    R.pending = R.pending.filter(function (x) { return x.id !== a.id; }).concat(a.status === 'en_attente' ? [a] : []);
  }
  function formError(form, msg) { var p = $('[data-rdv-error]', form); if (p) { p.textContent = msg; p.hidden = !msg; } }
  function busy(form, on) { var b = $('button[type="submit"]', form); if (b) b.disabled = !!on; }

  /* ---------------------------------------------------------------- 2. services */
  var DURS = [15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 480];
  function viewServices() {
    var S = R.settings, cats = [];
    S.services.forEach(function (s) { if (cats.indexOf(s.category) < 0) cats.push(s.category); });
    var html = '<div class="a-page">' + head('Prestations', 'Ce que vos clientes peuvent réserver, avec la durée et le prix.', '<button class="a-btn a-btn--primary" type="button" data-rdv="svc" data-id="">' + ico('plus') + 'Ajouter une prestation</button>') + tabs('prestations');
    if (!S.services.length) html += onboarding();
    html += cats.map(function (cat) {
      return card('<div class="a-card__head"><h2 class="a-card__title">' + esc(cat || 'Sans catégorie') + '</h2></div><ul class="a-rows r-list">' + S.services.filter(function (s) { return s.category === cat; }).map(function (s) {
        return '<li><button class="r-row r-row--svc' + (s.active === false ? ' is-off' : '') + '" type="button" data-rdv="svc" data-id="' + esc(s.id) + '"><span class="r-row__main"><span class="r-row__who">' + esc(s.name) + (s.active === false ? ' <span class="a-chip">Masquée</span>' : '') + '</span><span class="r-row__what">' + duration(s.duration) + (s.desc ? ' · ' + esc(s.desc) : '') + '</span></span>' +
          '<span class="r-row__price">' + (s.from ? 'dès' + NB : '') + money(s.price) + '</span>' + ico('chev') + '</button></li>';
      }).join('') + '</ul>', 'a-card--flush');
    }).join('');
    html += card('<div class="a-card__head"><div><h2 class="a-card__title">Options</h2><p class="a-card__sub">' + fr('Ce qu’on ajoute à une prestation : French, cils du bas, dépose… Elles allongent le rendez-vous et le prix.') + '</p></div><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-rdv="addon" data-id="">' + ico('plus') + 'Ajouter</button></div>' +
      (S.addons.length ? '<ul class="a-rows r-list">' + S.addons.map(function (a) { return '<li><button class="r-row r-row--svc' + (a.active === false ? ' is-off' : '') + '" type="button" data-rdv="addon" data-id="' + esc(a.id) + '"><span class="r-row__main"><span class="r-row__who">' + esc(a.name) + '</span><span class="r-row__what">' + (a.duration ? '+ ' + duration(a.duration) : 'Sans temps en plus') + '</span></span><span class="r-row__price">+ ' + money(a.price) + '</span>' + ico('chev') + '</button></li>'; }).join('') + '</ul>' : '<p class="a-small">Aucune option pour l’instant.</p>'), S.addons.length ? 'a-card--flush r-padhead' : '');
    return html + '</div>';
  }
  function openService(id) {
    var S = R.settings, s = S.services.filter(function (x) { return x.id === id; })[0] || { id: '', name: '', category: (S.services[0] || {}).category || '', duration: 60, price: '', from: false, deposit: null, desc: '', active: true, staff: [] };
    var cats = []; S.services.forEach(function (x) { if (x.category && cats.indexOf(x.category) < 0) cats.push(x.category); });
    var staff = (S.staff || []).filter(function (x) { return x.active !== false; });
    var durs = DURS.indexOf(s.duration) < 0 ? DURS.concat([s.duration]).sort(function (a, b) { return a - b; }) : DURS;
    openDlg('<form class="a-dialog__card" data-rdv-form="svc" data-id="' + esc(s.id) + '" novalidate>' + dlgHead('rs-t', s.id ? 'Modifier la prestation' : 'Nouvelle prestation') + '<div class="a-dialog__body">' +
      field('Nom', input('name', s.name, 'type="text" maxlength="80" placeholder="Pose volume russe" required')) +
      field('Catégorie', input('category', s.category, 'type="text" maxlength="40" list="r-cats" placeholder="Extensions"') + '<datalist id="r-cats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>', 'Les prestations d’une même catégorie sont regroupées.') +
      '<div class="a-grid2 r-grid2">' + field('Durée', select('duration', durs.map(function (d) { return [d, duration(d).replace(new RegExp(NB, 'g'), ' ')]; }), s.duration)) + field('Prix', input('price', s.price, 'type="number" inputmode="decimal" min="0" step="any" placeholder="25000" required')) + '</div>' +
      '<label class="r-check r-check--solo"><input type="checkbox" name="from"' + (s.from ? ' checked' : '') + '><span>Prix « à partir de » (le prix final dépend du travail)</span></label>' +
      field('Acompte pour cette prestation <small>(facultatif)</small>', input('deposit', s.deposit == null ? '' : s.deposit, 'type="number" inputmode="decimal" min="0" step="any" placeholder="Règle générale"'), 'Vide : la règle générale de « Réservation en ligne ». 0 : pas d’acompte pour celle-ci.') +
      field('Description <small>(facultatif)</small>', '<textarea class="a-input" name="desc" rows="2" maxlength="400">' + esc(s.desc || '') + '</textarea>') +
      (staff.length > 1 ? '<div class="a-field"><span class="a-label">Qui la fait ?</span><div class="r-checks">' + staff.map(function (p) { return '<label class="r-check"><input type="checkbox" name="staff" value="' + esc(p.id) + '"' + (!s.staff || !s.staff.length || s.staff.indexOf(p.id) >= 0 ? ' checked' : '') + '><span>' + esc(p.name) + '</span></label>'; }).join('') + '</div></div>' : '') +
      '<label class="r-check r-check--solo"><input type="checkbox" name="active"' + (s.active !== false ? ' checked' : '') + '><span>Visible et réservable en ligne</span></label>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div>' +
      '<div class="a-dialog__foot">' + (s.id ? '<button class="a-btn a-btn--quiet" type="button" data-rdv="svc-del" data-id="' + esc(s.id) + '">' + ico('trash') + 'Supprimer</button>' : '') + '<button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form>', 'rs-t');
  }
  function openAddon(id) {
    var a = R.settings.addons.filter(function (x) { return x.id === id; })[0] || { id: '', name: '', duration: 15, price: '', active: true };
    var durs = [0, 5, 10, 15, 20, 30, 45, 60, 90];
    if (durs.indexOf(a.duration) < 0) durs = durs.concat([a.duration]).sort(function (x, y) { return x - y; });
    openDlg('<form class="a-dialog__card" data-rdv-form="addon" data-id="' + esc(a.id) + '" novalidate>' + dlgHead('ro-t', a.id ? 'Modifier l’option' : 'Nouvelle option') + '<div class="a-dialog__body">' +
      field('Nom', input('name', a.name, 'type="text" maxlength="80" placeholder="French" required')) +
      '<div class="a-grid2 r-grid2">' + field('Temps en plus', select('duration', durs.map(function (d) { return [d, d ? duration(d).replace(new RegExp(NB, 'g'), ' ') : 'Aucun']; }), a.duration)) + field('Prix en plus', input('price', a.price, 'type="number" inputmode="decimal" min="0" step="any" placeholder="3000" required')) + '</div>' +
      '<label class="r-check r-check--solo"><input type="checkbox" name="active"' + (a.active !== false ? ' checked' : '') + '><span>Proposée en ligne</span></label>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div>' +
      '<div class="a-dialog__foot">' + (a.id ? '<button class="a-btn a-btn--quiet" type="button" data-rdv="addon-del" data-id="' + esc(a.id) + '">' + ico('trash') + 'Supprimer</button>' : '') + '<button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form>', 'ro-t');
  }
  function newId(list, p) { for (var i = 1; ; i++) { var id = p + i; if (!list.some(function (x) { return x.id === id; })) return id; } }

  /* ---------------------------------------------------------------- 3. hours, team, rules */
  var ZONES = [['Africa/Abidjan', 'Abidjan, Dakar, Bamako (GMT)'], ['Africa/Lagos', 'Cotonou, Lagos, Douala'], ['Europe/Paris', 'Paris, Bruxelles'], ['Europe/London', 'Londres'], ['America/Toronto', 'Montréal, Toronto'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago, Houston'], ['America/Los_Angeles', 'Los Angeles']];
  function viewHours() {
    var S = R.settings, order = [1, 2, 3, 4, 5, 6, 0];
    var zones = ZONES.some(function (z) { return z[0] === S.timezone; }) ? ZONES : ZONES.concat([[S.timezone, S.timezone]]);
    var rows = order.map(function (d) {
      var h = S.hours[d], b = (h.breaks && h.breaks[0]) || { from: '', to: '' };
      return '<div class="r-hrow" data-day="' + d + '"><label class="r-hrow__day"><span class="a-switch"><input type="checkbox" role="switch" name="open' + d + '"' + (h.open ? ' checked' : '') + ' data-rdv-change="dayopen"><span class="a-switch__track"></span></span><span>' + cap(DAYS[d]) + '</span></label>' +
        '<div class="r-hrow__times"' + (h.open ? '' : ' hidden') + '><input class="a-input" type="time" step="300" name="from' + d + '" value="' + esc(h.from) + '" aria-label="Ouverture le ' + DAYS[d] + '"><span>à</span><input class="a-input" type="time" step="300" name="to' + d + '" value="' + esc(h.to) + '" aria-label="Fermeture le ' + DAYS[d] + '">' +
        '<span class="r-hrow__pause">Pause</span><input class="a-input" type="time" step="300" name="bfrom' + d + '" value="' + esc(b.from) + '" aria-label="Début de la pause le ' + DAYS[d] + '"><span>à</span><input class="a-input" type="time" step="300" name="bto' + d + '" value="' + esc(b.to) + '" aria-label="Fin de la pause le ' + DAYS[d] + '"></div>' +
        '<p class="r-hrow__closed"' + (h.open ? ' hidden' : '') + '>Fermé</p></div>';
    }).join('');
    var staff = S.staff || [];
    return '<div class="a-page">' + head('Horaires et équipe', 'Quand vos clientes peuvent réserver, et avec qui.') + tabs('horaires') +
      '<form data-rdv-form="hours" novalidate>' +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Horaires d’ouverture</h2><p class="a-card__sub">' + fr('La pause est facultative : laissez-la vide si vous n’en prenez pas.') + '</p></div></div><div class="r-hours">' + rows + '</div>') +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Règles de réservation</h2></div></div><div class="a-grid2 r-grid2">' +
        field('Un créneau toutes les', select('step', [[15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 heure']], S.step), 'Les heures proposées : 9 h, 9 h 30, 10 h…') +
        field('Pause entre deux clientes', select('buffer', [[0, 'Aucune'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes']], S.buffer), 'Le temps de ranger et de préparer.') +
        field('Réserver au plus tard', select('lead', [[0, 'Jusqu’à la dernière minute'], [60, '1 heure avant'], [120, '2 heures avant'], [180, '3 heures avant'], [720, '12 heures avant'], [1440, 'La veille (24 h)'], [2880, '2 jours avant']], S.lead)) +
        field('Réserver jusqu’à', select('horizon', [[14, '2 semaines à l’avance'], [30, '1 mois à l’avance'], [45, '6 semaines à l’avance'], [60, '2 mois à l’avance'], [90, '3 mois à l’avance'], ['date', 'Une date précise (j’ouvre mon agenda)']], S.openUntil ? 'date' : S.horizon, ' data-rdv-change="horizon"')) +
        '<div class="a-field" data-rdv-until' + (S.openUntil ? '' : ' hidden') + '><label class="a-label">Réservations ouvertes jusqu’au</label>' + input('openUntil', S.openUntil || '', 'type="date" min="' + esc(todayStr()) + '"') + '<p class="a-hint">' + fr('Vos clientes ne peuvent pas réserver après cette date. Changez-la quand vous ouvrez le mois suivant.') + '</p></div>' +
        field('Fuseau horaire', select('timezone', zones, S.timezone), 'Les heures de votre agenda sont celles de cette ville.') + '</div>') +
      '<div class="a-savebar r-save"><button class="a-btn a-btn--primary" type="submit">Enregistrer les horaires</button></div></form>' +
      specialCard() +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Équipe</h2><p class="a-card__sub">' + fr('Seule ? Laissez vide. À plusieurs, chaque personne a son agenda et la cliente choisit avec qui.') + '</p></div><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-rdv="staff" data-id="">' + ico('plus') + 'Ajouter</button></div>' +
        (staff.length ? '<ul class="a-rows r-list">' + staff.map(function (p) { return '<li><button class="r-row r-row--svc' + (p.active === false ? ' is-off' : '') + '" type="button" data-rdv="staff" data-id="' + esc(p.id) + '"><span class="r-row__main"><span class="r-row__who">' + esc(p.name) + '</span><span class="r-row__what">' + esc(p.role || '') + '</span></span>' + ico('chev') + '</button></li>'; }).join('') + '</ul>' : ''), staff.length ? 'a-card--flush r-padhead' : '') + '</div>';
  }
  function specialCard() {
    var list = ((R.settings.special) || []).filter(function (x) { return x.date >= todayStr(); });
    return card('<div class="a-card__head"><div><h2 class="a-card__title">Jours particuliers</h2><p class="a-card__sub">' + fr('Un dimanche ouvert exceptionnellement, une veille de fête plus courte, un jour férié : ce jour-là, ces horaires remplacent ceux de la semaine.') + '</p></div><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-rdv="special" data-id="">' + ico('plus') + 'Ajouter</button></div>' +
      (list.length ? '<ul class="a-rows r-list">' + list.map(function (x) { return '<li><button class="r-row r-row--svc" type="button" data-rdv="special" data-id="' + esc(x.date) + '"><span class="r-row__main"><span class="r-row__who">' + esc(cap(dayLabel(x.date))) + '</span><span class="r-row__what">' + (x.open ? 'Ouvert de ' + hhmm(x.from) + ' à ' + hhmm(x.to) : 'Fermé') + '</span></span>' + ico('chev') + '</button></li>'; }).join('') + '</ul>' : ''), list.length ? 'a-card--flush r-padhead' : '');
  }
  function openSpecial(date) {
    var x = specialOf(date) || { date: '', open: true, from: '10:00', to: '16:00' };
    openDlg('<form class="a-dialog__card" data-rdv-form="special" data-id="' + esc(x.date) + '" novalidate>' + dlgHead('rj-t', x.date ? 'Modifier ce jour' : 'Un jour particulier') + '<div class="a-dialog__body">' +
      '<p class="a-dialog__lead">' + fr('Ce jour-là, vos clientes voient ces horaires à la place de ceux de la semaine. Pour fermer quelques heures seulement, utilisez plutôt « Bloquer un créneau ».') + '</p>' +
      field('Date', input('date', x.date, 'type="date" min="' + esc(todayStr()) + '" required')) +
      '<label class="r-check r-check--solo"><input type="checkbox" name="open"' + (x.open ? ' checked' : '') + ' data-rdv-change="spopen"><span>Ouvert ce jour-là</span></label>' +
      '<div class="a-grid2 r-grid2" data-rdv-sptimes' + (x.open ? '' : ' hidden') + '>' + field('De', input('from', x.from, 'type="time" step="300"')) + field('À', input('to', x.to, 'type="time" step="300"')) + '</div>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div><div class="a-dialog__foot">' + (x.date ? '<button class="a-btn a-btn--quiet" type="button" data-rdv="special-del" data-id="' + esc(x.date) + '">' + ico('trash') + 'Retirer</button>' : '') +
      '<button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form>', 'rj-t');
  }
  function openStaff(id) {
    var p = (R.settings.staff || []).filter(function (x) { return x.id === id; })[0] || { id: '', name: '', role: '', active: true };
    openDlg('<form class="a-dialog__card" data-rdv-form="staff" data-id="' + esc(p.id) + '" novalidate>' + dlgHead('rp-t', p.id ? 'Modifier' : 'Ajouter une personne') + '<div class="a-dialog__body">' +
      field('Prénom', input('name', p.name, 'type="text" maxlength="40" required')) + field('Spécialité <small>(facultatif)</small>', input('role', p.role, 'type="text" maxlength="60" placeholder="Sourcils et rehaussement"')) +
      '<label class="r-check r-check--solo"><input type="checkbox" name="active"' + (p.active !== false ? ' checked' : '') + '><span>Prend des rendez-vous</span></label>' +
      '<p class="a-error" data-rdv-error hidden role="alert"></p></div><div class="a-dialog__foot">' + (p.id ? '<button class="a-btn a-btn--quiet" type="button" data-rdv="staff-del" data-id="' + esc(p.id) + '">' + ico('trash') + 'Retirer</button>' : '') +
      '<button class="a-btn a-btn--ghost" type="button" data-close>Annuler</button><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form>', 'rp-t');
  }

  /* ---------------------------------------------------------------- 4. online booking: deposit, policies */
  function viewRules() {
    var S = R.settings, pol = S.policies || {}, dep = S.deposit || { mode: 'none', value: 0 };
    var sw = function (name, label, hint, on) { return '<label class="a-switchrow"><span class="a-switchrow__txt"><span class="a-switchrow__label">' + fr(label) + '</span><span class="a-switchrow__hint">' + fr(hint) + '</span></span><span class="a-switch"><input type="checkbox" role="switch" name="' + name + '"' + (on ? ' checked' : '') + '><span class="a-switch__track"></span></span></label>'; };
    var ta = function (name, label, val, ph) { return field(label, '<textarea class="a-input" name="' + name + '" rows="2" maxlength="600" placeholder="' + esc(ph) + '">' + esc(val || '') + '</textarea>'); };
    return '<div class="a-page">' + head('Réservation en ligne', 'Comment vos clientes réservent, et ce qu’elles lisent avant.') + tabs('regles') +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Votre lien de réservation</h2><p class="a-card__sub">' + fr('À mettre dans votre bio Instagram, TikTok et WhatsApp.') + '</p></div></div><div class="a-domain">' + ico('link') + '<span class="a-domain__name">' + esc(String(R.bookingUrl).replace(/^https:\/\//, '')) + '</span></div>' +
        '<div class="a-btnrow" style="margin-top:12px"><button class="a-btn a-btn--primary" type="button" data-rdv="copy" data-text="' + esc(R.bookingUrl) + '">' + ico('copy') + 'Copier le lien</button><a class="a-btn a-btn--ghost" href="' + esc(R.bookingUrl) + '" target="_blank" rel="noopener">' + ico('external') + 'Voir la page</a></div>') +
      '<form data-rdv-form="rules" novalidate>' +
      card(sw('enabled', 'Prendre des rendez-vous en ligne', 'Fermé : vos clientes voient vos prestations, mais ne peuvent pas réserver.', S.enabled) +
        sw('autoConfirm', 'Confirmer automatiquement', 'Oui : le créneau est réservé tout de suite. Non : vous recevez une demande, et vous confirmez.', S.autoConfirm) +
        field('La cliente peut déplacer ou annuler seule', select('cancelWindow', [[0, 'Jusqu’au dernier moment'], [2, 'Jusqu’à 2 h avant'], [12, 'Jusqu’à 12 h avant'], [24, 'Jusqu’à 24 h avant'], [48, 'Jusqu’à 48 h avant'], [72, 'Jusqu’à 3 jours avant']], S.cancelWindow), 'Après ce délai, elle doit vous contacter.')) +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Acompte</h2><p class="a-card__sub">' + fr('Pour limiter les rendez-vous manqués. Vous envoyez la demande de paiement, puis vous marquez l’acompte « reçu ».') + '</p></div></div>' +
        '<div class="a-grid2 r-grid2">' + field('Demander', select('depMode', [['none', 'Aucun acompte'], ['fixed', 'Un montant fixe'], ['percent', 'Un pourcentage du prix']], dep.mode, ' data-rdv-change="depmode"')) +
        '<div class="a-field" data-rdv-dep' + (dep.mode === 'none' ? ' hidden' : '') + '><label class="a-label" data-rdv-deplabel>' + (dep.mode === 'percent' ? 'Pourcentage (%)' : 'Montant') + '</label>' + input('depValue', dep.value || '', 'type="number" inputmode="decimal" min="0" step="any"') + '</div></div>' +
        '<div class="a-field"><span class="a-label">Moyens de paiement proposés</span><div class="r-checks">' + R.pays.map(function (p) { return '<label class="r-check"><input type="checkbox" name="pay" value="' + esc(p) + '"' + (S.payments.indexOf(p) >= 0 ? ' checked' : '') + '><span>' + esc(p) + '</span></label>'; }).join('') + '</div></div>') +
      card('<div class="a-card__head"><div><h2 class="a-card__title">Ce que vos clientes lisent</h2><p class="a-card__sub">' + fr('Affiché sur votre site et avant la réservation. Laissez vide ce qui ne vous concerne pas.') + '</p></div></div>' +
        field('Adresse du studio', input('address', S.address, 'type="text" maxlength="200" placeholder="Cocody Riviera 2, Abidjan"')) +
        ta('intro', 'Présentation courte', S.intro, 'Extensions de cils sur mesure, à Cocody.') +
        ta('p_deposit', 'Acompte', pol.deposit, 'L’acompte bloque votre créneau. Il est déduit du prix et n’est pas remboursable.') +
        ta('p_cancel', 'Report et annulation', pol.cancel, 'Report sans frais jusqu’à 24 h avant.') +
        ta('p_late', 'Retard', pol.late, 'Au-delà de 15 minutes de retard, le rendez-vous peut être reporté.') +
        ta('p_payment', 'Paiement', pol.payment, 'Le solde se règle sur place : espèces, Wave ou Orange Money.') +
        ta('p_prep', 'Avant de venir', pol.prep, 'Venez sans maquillage sur les yeux.')) +
      '<div class="a-savebar r-save"><button class="a-btn a-btn--primary" type="submit">Enregistrer</button></div></form></div>';
  }

  /* ---------------------------------------------------------------- 5. clients */
  function viewClients() {
    if (!R.clients && !R.clientsLoading) {
      R.clientsLoading = true;
      call({ action: 'clients', storeId: R.storeId }).then(function (j) { R.clientsLoading = false; R.clients = j.ok ? j.clients : []; redraw(); });
    }
    var html = '<div class="a-page">' + head('Clientes', 'Celles qui ont pris rendez-vous, et leur fidélité.') + tabs('clients');
    if (!R.clients) return html + card('<p class="a-small">Chargement…</p>') + '</div>';
    if (!R.clients.length) return html + card(empty('users', 'Pas encore de cliente', 'Elles apparaissent ici dès leur premier rendez-vous.')) + '</div>';
    var list = R.clients.slice().sort(function (a, b) { return (b.visits + b.upcoming) - (a.visits + a.upcoming); });
    return html + card('<ul class="a-rows r-list">' + list.map(function (c) {
      var wa = waLink(c.phone, 'Bonjour ' + String(c.name || '').split(' ')[0] + ', ');
      var bits = [c.visits + NB + (c.visits > 1 ? 'visites' : 'visite')];
      if (c.upcoming) bits.push(c.upcoming + NB + 'à venir');
      if (c.noShows) bits.push(c.noShows + NB + (c.noShows > 1 ? 'absences' : 'absence'));
      if (c.last) bits.push('dernière : ' + dayLabel(localDate(c.last), true) + (c.lastService ? ' (' + c.lastService + ')' : ''));
      return '<li><div class="r-row r-row--svc"><span class="r-row__main"><span class="r-row__who">' + esc(c.name || 'Cliente') + (c.noShows >= 2 ? ' <span class="a-chip a-chip--line a-tone--err">Absences</span>' : (c.visits >= 3 ? ' <span class="a-chip a-chip--line a-tone--ok">Fidèle</span>' : '')) + '</span><span class="r-row__what">' + esc(bits.join(' · ')) + '</span><span class="r-row__what">' + esc(c.phone || '') + (c.email ? ' · ' + esc(c.email) : '') + '</span></span>' +
        '<span class="r-row__price">' + money(c.spent) + '</span>' + (wa ? '<a class="a-ibtn" href="' + esc(wa) + '" target="_blank" rel="noopener" aria-label="Écrire à ' + esc(c.name) + ' sur WhatsApp">' + ico('chat') + '</a>' : '') + '</div></li>';
    }).join('') + '</ul>', 'a-card--flush') + '</div>';
  }

  /* ---------------------------------------------------------------- events */
  function act(b, e) {
    var a = b.getAttribute('data-rdv'), id = b.getAttribute('data-id') || '';
    if (a === 'retry') { R.error = ''; loadSettings(); redraw(); }
    else if (a === 'reload') reloadList();
    else if (a === 'day') { R.day = b.getAttribute('data-date'); redraw(); }
    else if (a === 'week') { R.day = addDays(R.day || R.today, 7 * Number(b.getAttribute('data-dir'))); redraw(); }
    else if (a === 'new') openNew();
    else if (a === 'block') openBlock();
    else if (a === 'open') openAppt(id);
    else if (a === 'move') openMove(id);
    else if (a === 'share' || a === 'copy') {
      var text = b.getAttribute('data-text') || R.bookingUrl;
      var done = function () { toast(a === 'share' ? 'Lien de réservation copié : collez-le dans votre bio.' : 'Lien copié.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copiez ce lien :', text); }); else window.prompt('Copiez ce lien :', text);
    }
    else if (a === 'status') {
      b.disabled = true;
      call({ action: 'status', id: id, status: b.getAttribute('data-status') }).then(function (j) {
        if (!j.ok) { b.disabled = false; toast(j.message || 'Le rendez-vous n’a pas pu être mis à jour.'); return; }
        replace(j.appointment); closeDlg(); toast({ confirme: 'Rendez-vous confirmé.', termine: 'Rendez-vous terminé.', absent: 'Absence notée.', annule: 'Rendez-vous annulé.' }[j.appointment.status] || 'Mis à jour.'); redraw(); if (ui().shell) ui().shell();
      });
    }
    else if (a === 'cancel') {
      var ap = find(id);
      (ui().confirmBox ? ui().confirmBox({ title: 'Annuler ce rendez-vous ?', text: 'Le créneau redevient libre' + (ap && ap.customer && ap.customer.email ? ', et la cliente reçoit un e-mail' : '') + '.', ok: 'Annuler le rendez-vous', cancel: 'Le garder', danger: true }) : Promise.resolve(true)).then(function (yes) {
        if (!yes) return;
        call({ action: 'status', id: id, status: 'annule' }).then(function (j) { if (!j.ok) { toast(j.message || 'Le rendez-vous n’a pas pu être annulé.'); return; } replace(j.appointment); toast('Rendez-vous annulé.'); redraw(); if (ui().shell) ui().shell(); });
      });
    }
    else if (a === 'deposit') {
      call({ action: 'deposit', id: id, depositStatus: b.getAttribute('data-status') }).then(function (j) { if (!j.ok) { toast('L’acompte n’a pas pu être mis à jour.'); return; } replace(j.appointment); redraw(); openAppt(id); });
    }
    else if (a === 'unblock') call({ action: 'unblock', id: id }).then(function () { R.blocks = R.blocks.filter(function (x) { return x.id !== id; }); toast('Créneau rouvert.'); redraw(); });
    else if (a === 'preset') {
      var p = PRESETS[id]; if (!p) return;
      R.settings.services = p.services.map(function (s, i) { return { id: 's' + (i + 1), name: s[0], category: s[1], duration: s[2], price: s[3], from: false, deposit: null, desc: '', active: true, staff: [] }; });
      R.settings.addons = p.addons.map(function (s, i) { return { id: 'a' + (i + 1), name: s[0], duration: s[1], price: s[2], active: true }; });
      R.settings.enabled = true;
      if (!p.services.length) { R.configured = true; if (ui().go) ui().go('rendez-vous/prestations'); openService(''); return; }
      saveSettings('Votre carte est prête : ajustez les prix et les durées.').then(function (ok) { if (ok && ui().go) ui().go('rendez-vous/prestations'); });
    }
    else if (a === 'svc') openService(id);
    else if (a === 'addon') openAddon(id);
    else if (a === 'staff') openStaff(id);
    else if (a === 'special') openSpecial(id);
    else if (a === 'special-del') { R.settings.special = (R.settings.special || []).filter(function (x) { return x.date !== id; }); closeDlg(); saveSettings('Jour retiré : vos horaires habituels s’appliquent.'); }
    else if (a === 'svc-del' || a === 'addon-del' || a === 'staff-del') {
      var key = a === 'svc-del' ? 'services' : (a === 'addon-del' ? 'addons' : 'staff');
      R.settings[key] = R.settings[key].filter(function (x) { return x.id !== id; });
      if (key === 'staff') R.settings.services.forEach(function (s) { s.staff = (s.staff || []).filter(function (x) { return x !== id; }); });
      closeDlg(); saveSettings('Supprimé.');
    }
    if (e) e.preventDefault();
  }
  function val(form, name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  function checked(form, name) { var el = form.elements[name]; return !!(el && el.checked); }
  function values(form, name) { return $$('input[name="' + name + '"]:checked', form).map(function (x) { return x.value; }); }
  function num(v) { var n = Number(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) && n >= 0 ? n : NaN; }
  var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  function submit(form) {
    var kind = form.getAttribute('data-rdv-form'), id = form.getAttribute('data-id') || '', S = R.settings;
    formError(form, '');
    if (kind === 'new') {
      var date = val(form, 'date'), time = val(form, 'time');
      if (!val(form, 'name')) return formError(form, 'Indiquez le nom de la cliente.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !HHMM.test(time)) return formError(form, 'Choisissez un jour et une heure.');
      busy(form, true);
      call({ action: 'create', storeId: R.storeId, serviceId: val(form, 'serviceId'), addons: values(form, 'addon'), staffId: val(form, 'staffId'), start: toUtc(date, time),
        customer: { name: val(form, 'name'), phone: val(form, 'phone'), email: val(form, 'email') }, note: val(form, 'note'), deposit: checked(form, 'deposit') }).then(function (j) {
        busy(form, false);
        if (!j.ok) return formError(form, j.message || 'Le rendez-vous n’a pas pu être enregistré.');
        R.day = date; closeDlg(); toast('Rendez-vous enregistré.'); reloadList();
      });
    } else if (kind === 'block') {
      var all = checked(form, 'allday'), d1 = val(form, 'from'), d2 = val(form, 'to') || d1;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || d2 < d1) return formError(form, 'Vérifiez les dates.');
      var from = toUtc(d1, all ? '00:00' : val(form, 't1')), to = all ? toUtc(addDays(d2, 1), '00:00') : toUtc(d2, val(form, 't2'));
      if (Date.parse(to) <= Date.parse(from)) return formError(form, 'La fin doit être après le début.');
      busy(form, true);
      call({ action: 'block', storeId: R.storeId, staffId: val(form, 'staffId'), from: from, to: to, reason: val(form, 'reason') }).then(function (j) {
        busy(form, false);
        if (!j.ok) return formError(form, j.message || 'Le créneau n’a pas pu être bloqué.');
        closeDlg(); toast('Créneau bloqué.'); R.day = d1; reloadList();
      });
    } else if (kind === 'move') {
      var md = val(form, 'date'), mt = val(form, 'time');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(md) || !HHMM.test(mt)) return formError(form, 'Choisissez un jour et une heure.');
      busy(form, true);
      call({ action: 'move', id: id, start: toUtc(md, mt), staffId: val(form, 'staffId'), silent: !checked(form, 'tell') }).then(function (j) {
        busy(form, false);
        if (!j.ok) return formError(form, j.message || 'Le rendez-vous n’a pas pu être déplacé.');
        R.day = md; closeDlg(); toast('Rendez-vous déplacé.'); reloadList();
      });
    } else if (kind === 'memo') {
      call({ action: 'memo', id: id, memo: val(form, 'memo') }).then(function (j) { if (j.ok) { replace(j.appointment); toast('Note enregistrée.'); } else toast('La note n’a pas pu être enregistrée.'); });
    } else if (kind === 'svc') {
      var price = num(val(form, 'price'));
      if (!val(form, 'name')) return formError(form, 'Donnez un nom à la prestation.');
      if (isNaN(price)) return formError(form, 'Indiquez un prix (0 si c’est gratuit).');
      var depRaw = val(form, 'deposit'), depN = depRaw === '' ? null : num(depRaw);
      if (depN !== null && isNaN(depN)) return formError(form, 'L’acompte doit être un nombre.');
      var picked = values(form, 'staff'), allStaff = (S.staff || []).filter(function (x) { return x.active !== false; });
      var s = { id: id || newId(S.services, 's'), name: val(form, 'name'), category: val(form, 'category'), duration: Number(val(form, 'duration')) || 60, price: price, from: checked(form, 'from'), deposit: depN, desc: val(form, 'desc'), active: checked(form, 'active'),
        staff: allStaff.length > 1 && picked.length < allStaff.length ? picked : [] };
      if (id) S.services = S.services.map(function (x) { return x.id === id ? s : x; }); else S.services.push(s);
      if (!R.configured) S.enabled = true;
      closeDlg(); saveSettings('Prestation enregistrée.');
    } else if (kind === 'addon') {
      var ap = num(val(form, 'price'));
      if (!val(form, 'name')) return formError(form, 'Donnez un nom à l’option.');
      if (isNaN(ap)) return formError(form, 'Indiquez un prix.');
      var ad = { id: id || newId(S.addons, 'a'), name: val(form, 'name'), duration: Number(val(form, 'duration')) || 0, price: ap, active: checked(form, 'active') };
      if (id) S.addons = S.addons.map(function (x) { return x.id === id ? ad : x; }); else S.addons.push(ad);
      closeDlg(); saveSettings('Option enregistrée.');
    } else if (kind === 'staff') {
      if (!val(form, 'name')) return formError(form, 'Indiquez un prénom.');
      S.staff = S.staff || [];
      var p = { id: id || newId(S.staff, 'e'), name: val(form, 'name'), role: val(form, 'role'), active: checked(form, 'active'), photo: '', hours: null };
      if (id) S.staff = S.staff.map(function (x) { return x.id === id ? Object.assign({}, x, p, { photo: x.photo, hours: x.hours }) : x; }); else S.staff.push(p);
      closeDlg(); saveSettings('Équipe mise à jour.');
    } else if (kind === 'special') {
      var sd = val(form, 'date'), so = checked(form, 'open'), sf = val(form, 'from'), st2 = val(form, 'to');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return formError(form, 'Choisissez une date.');
      if (sd < todayStr()) return formError(form, 'Cette date est passée.');
      if (so && (!HHMM.test(sf) || !HHMM.test(st2) || st2 <= sf)) return formError(form, 'L’heure de fermeture doit être après l’ouverture.');
      S.special = (S.special || []).filter(function (x) { return x.date !== sd && x.date !== id && x.date >= todayStr(); });
      S.special.push({ date: sd, open: so, from: HHMM.test(sf) ? sf : '09:00', to: HHMM.test(st2) ? st2 : '18:00' });
      closeDlg(); saveSettings(so ? 'Jour enregistré : ouvert de ' + hhmm(sf) + ' à ' + hhmm(st2) + '.' : 'Jour enregistré : fermé.');
    } else if (kind === 'hours') {
      var bad = '';
      var hours = [0, 1, 2, 3, 4, 5, 6].map(function (d) {
        var open = checked(form, 'open' + d), f = val(form, 'from' + d), t = val(form, 'to' + d), bf = val(form, 'bfrom' + d), bt = val(form, 'bto' + d);
        if (open && (!HHMM.test(f) || !HHMM.test(t) || t <= f)) bad = cap(DAYS[d]) + ' : l’heure de fermeture doit être après l’ouverture.';
        var br = HHMM.test(bf) && HHMM.test(bt) && bt > bf ? [{ from: bf, to: bt }] : [];
        return { open: open, from: HHMM.test(f) ? f : '09:00', to: HHMM.test(t) ? t : '18:00', breaks: br };
      });
      if (bad) { toast(bad); return; }
      var hz = val(form, 'horizon'), until = val(form, 'openUntil');
      if (hz === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < todayStr())) { toast('Choisissez la date jusqu’à laquelle vos réservations sont ouvertes.'); return; }
      S.hours = hours; S.step = Number(val(form, 'step')); S.buffer = Number(val(form, 'buffer')); S.lead = Number(val(form, 'lead')); S.timezone = val(form, 'timezone');
      if (hz === 'date') S.openUntil = until; else { S.openUntil = ''; S.horizon = Number(hz); }
      saveSettings('Horaires enregistrés.');
    } else if (kind === 'rules') {
      var mode = val(form, 'depMode'), dv = num(val(form, 'depValue'));
      if (mode !== 'none' && (isNaN(dv) || dv <= 0)) { toast('Indiquez le montant de l’acompte.'); return; }
      if (mode === 'percent' && dv > 100) { toast('Le pourcentage ne peut pas dépasser 100.'); return; }
      S.enabled = checked(form, 'enabled'); S.autoConfirm = checked(form, 'autoConfirm'); S.cancelWindow = Number(val(form, 'cancelWindow'));
      S.deposit = { mode: mode, value: mode === 'none' ? 0 : dv };
      S.payments = values(form, 'pay'); S.address = val(form, 'address'); S.intro = val(form, 'intro');
      S.policies = { deposit: val(form, 'p_deposit'), cancel: val(form, 'p_cancel'), late: val(form, 'p_late'), payment: val(form, 'p_payment'), prep: val(form, 'p_prep') };
      saveSettings(S.enabled && !S.services.some(function (x) { return x.active !== false; }) ? 'Enregistré. Ajoutez une prestation pour ouvrir la réservation.' : 'Enregistré.');
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-rdv]') : null;
    if (b && !b.disabled) act(b, e);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.getAttribute && f.getAttribute('data-rdv-form')) { e.preventDefault(); try { submit(f); } catch (err) { toast('Cela n’a pas pu être enregistré. Réessayez.'); } }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, k = t && t.getAttribute ? t.getAttribute('data-rdv-change') : '';
    if (k === 'allday') { var h = $('[data-rdv-hours]', t.form); if (h) h.hidden = t.checked; }
    else if (k === 'dayopen') { var row = t.closest('.r-hrow'); if (row) { $('.r-hrow__times', row).hidden = !t.checked; $('.r-hrow__closed', row).hidden = t.checked; } }
    else if (k === 'horizon') { var u = $('[data-rdv-until]', t.form); if (u) u.hidden = t.value !== 'date'; }
    else if (k === 'spopen') { var tm = $('[data-rdv-sptimes]', t.form); if (tm) tm.hidden = !t.checked; }
    else if (k === 'depmode') { var box = $('[data-rdv-dep]', t.form), lab = $('[data-rdv-deplabel]', t.form); if (box) box.hidden = t.value === 'none'; if (lab) lab.textContent = t.value === 'percent' ? 'Pourcentage (%)' : 'Montant'; }
  });

  window.JeereAdminRdv = {
    view: view,
    // requests waiting for her answer: the badge of the menu
    pendingCount: function () { var rec = storeRec(); return rec && rec.storeId === R.storeId ? R.pending.length : 0; },
    state: function () { return R; }
  };
})();
