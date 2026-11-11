/*
 * Jeere — tishe.js: The Ivory Sukundu (theivorysukundu.com) inside the Jeere dashboard.
 * Global: window.JeereTishe. Loaded before admin.js, which asks it for the views while that store is the one in view.
 *
 * The store keeps its own data (Stripe orders, products, codes, the announcement bar, shipping rates) and its own API,
 * https://www.theivorysukundu.com/api/admin ({ action, … }, a session token in Authorization). This file speaks to it
 * from here: nothing is copied into Jeere, every change is saved there, on the live shop.
 *
 * Sign-in: the store emails a link to its owner address (action link, to: 'jeere'); the link comes back to
 * ../admin/#tishe=<token>, which is swapped for a 30-day session (action redeem), kept in 'jeere-tishe-auth'.
 * 'jeere-ext' = 'tishe' while this store is the one in view (the store switcher sets and clears it).
 *
 *   JeereTishe.on() · enter() · leave() · view(route) → HTML · todo() · name · url · thumb
 */
(function () {
  'use strict';

  var API = 'https://www.theivorysukundu.com/api/admin';
  var SITE = 'https://www.theivorysukundu.com';
  var K_ON = 'jeere-ext', K_AUTH = 'jeere-tishe-auth';
  var OWNER = 'hello@theivorysukundu.com';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } }
  // the Jeere account signed in on this device (the TISHE session belongs to ONE account)
  function uid() { try { var a = JSON.parse(lsGet('jeere-account') || 'null'); return a && a.userId ? String(a.userId) : ''; } catch (e) { return ''; } }
  function auth() {
    try {
      var a = JSON.parse(lsGet(K_AUTH) || 'null');
      if (!a || !a.token || (a.expiresAt && a.expiresAt <= Date.now())) return null;
      if (a.userId !== uid()) { lsDel(K_AUTH); return null; } // another account (or none): not hers
      return a;
    } catch (e) { return null; }
  }

  var U = function () { return (window.JeereAdmin && window.JeereAdmin.ui) || null; };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function ico(n, cls) { return '<svg class="a-ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
  function toast(m) { var u = U(); if (u) u.toast(m); }
  function refresh() { var u = U(); if (u) u.refresh(); }
  function go(h) { var u = U(); if (u) u.go(h); }

  var CAD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
  var USD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD' });
  function cents(n, cur) { return (cur && cur.toUpperCase() === 'USD' ? USD : CAD).format((Number(n) || 0) / 100); }
  function dollars(n) { return CAD.format(Number(n) || 0); }
  function day(iso) { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function dayTime(iso) { try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function plural(n, a, b) { return n + ' ' + (n > 1 ? b : a); }

  var STATUS = {
    'new': ['À commander', 'warn'], ordered: ['Commandée au fournisseur', 'info'], shipped: ['Expédiée', 'ok'],
    delivered: ['Livrée', 'ok'], cancelled: ['Annulée', 'muted']
  };
  // the store's photos are on its own site (/media/…) or on Vercel Blob
  function src(u) { u = String(u || ''); return u.charAt(0) === '/' ? SITE + u : u; }
  function pill(s) { var t = STATUS[s] || [s, 'muted']; return '<span class="a-pill a-tone--' + t[1] + '">' + esc(t[0]) + '</span>'; }

  /* ------------------------------------------------------------------ the API */

  var T = { overview: null, store: null, customers: null, subscribers: null, orders: {}, busy: {}, error: null, linkSent: false };
  function call(action, body) {
    var a = auth();
    var headers = { 'Content-Type': 'application/json' };
    if (a) headers.Authorization = 'Bearer ' + a.token;
    return fetch(API, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) { lsDel(K_AUTH); reset(); throw new Error('Reconnectez-vous : la session a expiré.'); }
          if (!r.ok) throw new Error(fr(j.error) || 'La boutique n’a pas répondu. Réessayez.');
          return j;
        });
      }, function () { throw new Error('La boutique ne répond pas à ce tableau de bord pour le moment.'); });
  }
  // the store's own messages are in English: the common ones in French
  function fr(m) {
    var map = {
      'The product needs a name.': 'Le produit a besoin d’un nom.',
      'The product needs at least one option to buy.': 'Le produit a besoin d’au moins une option à acheter.',
      'Upload a JPEG photo.': 'Choisissez une photo JPEG.',
      'Check the sale end date.': 'Vérifiez la date de fin des soldes.',
      'Please sign in again.': 'Reconnectez-vous.',
      'This email no longer has access.': 'Cette adresse n’a plus accès au tableau de bord.'
    };
    return map[m] || m || '';
  }
  function reset() { T.overview = T.store = T.customers = T.subscribers = null; T.orders = {}; T.autoTried = false; }
  // loads what a view needs once, then draws the page again
  function need(key, action, pick) {
    if (T[key] || T.busy[key] || !auth()) return;
    T.busy[key] = true;
    call(action).then(function (j) { T[key] = pick ? pick(j) : j; T.error = null; }, function (e) { T.error = e.message; })
      .then(function () { T.busy[key] = false; refresh(); });
  }

  /* ------------------------------------------------------------------ sign-in */

  // the link from the email: ../admin/#tishe=<token>
  (function redeemFromLink() {
    // « Gérer la boutique » from Mes sites: ../admin/#boutique=tishe
    if (/[#&]boutique=tishe\b/.test(location.hash || '')) {
      lsSet(K_ON, 'tishe');
      try { history.replaceState(null, '', location.pathname + location.search + '#accueil'); } catch (e) { location.hash = '#accueil'; }
    }
    var m = /[#&]tishe=([A-Za-z0-9._-]+)/.exec(location.hash || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search + '#accueil'); } catch (e) { location.hash = '#accueil'; }
    lsSet(K_ON, 'tishe');
    T.redeeming = true;
    call('redeem', { token: m[1] }).then(function (j) {
      lsSet(K_AUTH, JSON.stringify({ token: j.token, expiresAt: j.expiresAt, email: j.email, userId: uid() }));
      toast('The Ivory Sukundu est connectée à votre tableau de bord.');
    }, function (e) { T.error = e.message; }).then(function () { T.redeeming = false; refresh(); });
  })();

  // Her Jeere account is enough: the store checks her Jeere session (Supabase) and opens a 30-day session,
  // no email (action « jeere », see the store's api/admin.ts). The email link stays as the way in without it.
  function autoConnect() {
    if (T.autoTried || auth()) return;
    T.autoTried = true;
    var A = window.JeereAuth;
    if (!A || typeof A.session !== 'function') return;
    T.redeeming = true;
    Promise.resolve(A.session()).then(function (s) {
      if (!s || !s.access_token) throw new Error('');
      return call('jeere', { accessToken: s.access_token });
    }).then(function (j) {
      lsSet(K_AUTH, JSON.stringify({ token: j.token, expiresAt: j.expiresAt, email: j.email, userId: uid() }));
      T.error = null;
    }, function () { /* not signed in to Jeere, or the store does not know this door yet: the email link */ T.error = null; T.autoTried = true; })
      .then(function () { T.redeeming = false; refresh(); });
  }
  function signInView() {
    autoConnect();
    if (T.redeeming) return page('The Ivory Sukundu', '', card('<p class="a-card__sub">Connexion à la boutique…</p>'));
    return page('Connecter The Ivory Sukundu', 'Ses commandes, ses produits, ses codes promo et son bandeau, ici même.',
      '<section class="a-card"><form data-txform="link" novalidate>' +
        '<p class="a-card__sub" style="margin-bottom:16px">' + (T.linkSent
          ? 'Le lien est parti. Ouvrez l’e-mail <strong>« Your dashboard sign-in link »</strong> sur cet appareil : le bouton vous ramène ici, connectée pour 30 jours.'
          : 'La boutique vous envoie un lien de connexion par e-mail, à l’adresse qui la gère. Il marche 24 heures.') + '</p>' +
        '<div class="a-field"><label class="a-label" for="tx-mail">Adresse e-mail de la boutique</label>' +
        '<input class="a-input" id="tx-mail" name="email" type="email" autocomplete="email" value="' + esc(OWNER) + '"></div>' +
        (T.error ? '<p class="a-error">' + ico('alert') + esc(T.error) + '</p>' : '') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('message') + (T.linkSent ? 'Renvoyer le lien' : 'Recevoir le lien de connexion') + '</button>' +
        '<a class="a-btn a-btn--ghost" href="' + SITE + '" target="_blank" rel="noopener">' + ico('external') + 'Voir la boutique</a></div>' +
      '</form></section>');
  }

  /* ------------------------------------------------------------------ small pieces */

  function page(title, sub, body, actions) {
    return '<div class="a-page"><header class="a-ph"><div class="a-ph__txt"><h1 class="a-h1" tabindex="-1">' + esc(title) + '</h1>' +
      (sub ? '<p class="a-sub">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="a-ph__actions">' + actions + '</div>' : '') + '</header>' + body + '</div>';
  }
  function card(inner, title) { return '<section class="a-card">' + (title ? '<div class="a-card__head"><h2 class="a-card__title">' + esc(title) + '</h2></div>' : '') + inner + '</section>'; }
  function loading(title) {
    return page(title, '', T.error ? card('<p class="a-error">' + ico('alert') + esc(T.error) + '</p><div class="a-btnrow"><button class="a-btn a-btn--ghost" type="button" data-tx="retry">' + ico('refresh') + 'Réessayer</button></div>')
      : card('<p class="a-card__sub">Chargement depuis theivorysukundu.com…</p>'));
  }
  function back(href, label) { return '<a class="a-btn a-btn--quiet a-btn--sm" href="' + href + '">' + ico('back') + esc(label) + '</a>'; }
  function field(id, label, input, hint) { return '<div class="a-field"><label class="a-label" for="' + id + '">' + esc(label) + '</label>' + input + (hint ? '<p class="a-hint">' + hint + '</p>' : '') + '</div>'; }
  function input(id, name, value, extra) { return '<input class="a-input" id="' + id + '" name="' + name + '" value="' + esc(value == null ? '' : value) + '"' + (extra || '') + '>'; }
  function check(name, on, label) { return '<label class="tx-check"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }

  /* ------------------------------------------------------------------ Accueil */

  // The orders of the old Shopify store (July–September 2026), before the site took its own payments:
  // numbers, dates and totals only (no names in this public file), as Shopify lists them
  var SHOPIFY = [
    { number: '1003', createdAt: '2026-09-21T11:15:00Z', total: 268.86, items: 3, id: '7178473734309' },
    { number: '1002', createdAt: '2026-08-09T18:21:44Z', total: 419, items: 1, id: '6841148833957' },
    { number: '1001', createdAt: '2026-07-29T16:34:51Z', total: 0, items: 1, id: '6821078991013' }
  ];
  var SHOPIFY_ADMIN = 'https://shop.theivorysukundu.com/admin/orders/';
  // once the shop serves them in full (action legacyOrders), the old orders open here, with their details
  function oldOrders() {
    need('legacy', 'legacyOrders', function (j) { return j.orders || []; });
    if (T.legacy && T.legacy.length) return T.legacy.map(function (o) {
      return { number: o.number, createdAt: o.createdAt, total: (o.total || 0) / 100, items: (o.items || []).reduce(function (n, i) { return n + (i.quantity || 1); }, 0) || 1, href: '#commandes/' + encodeURIComponent(o.id), out: false };
    });
    return SHOPIFY.map(function (o) { return Object.assign({ href: SHOPIFY_ADMIN + o.id, out: true }, o); });
  }
  function oldRow(x, who) {
    return '<li><a class="a-orow" href="' + x.href + '"' + (x.out ? ' target="_blank" rel="noopener"' : '') + '><span class="a-orow__top"><span class="a-orow__id">#' + esc(x.number) + (who ? ' <span class="a-orow__who">· ancienne boutique Shopify</span>' : '') + '</span><span class="a-pill a-tone--ok">Livrée</span></span>' +
      '<span class="a-orow__line"><span>' + esc(day(x.createdAt)) + ' · ' + esc(plural(x.items, 'article', 'articles')) + (x.out ? ' · voir dans Shopify' : '') + '</span><span class="a-orow__amount">' + esc(dollars(x.total)) + '</span></span></a></li>';
  }
  // every paid order, old store included: { at: Date, amount: CAD paid }
  function sales() {
    var live = ((T.overview && T.overview.orders) || []).filter(function (o) { return o.status !== 'cancelled' && !o.refunded; })
      .map(function (o) { return { at: new Date(o.createdAt), amount: (o.settled || o.total || 0) / 100 }; });
    // #1001 was a test at 0 $: it would only pull the average down
    return live.concat(oldOrders().filter(function (o) { return o.total > 0; }).map(function (o) { return { at: new Date(o.createdAt), amount: o.total }; }));
  }
  var PERIODS = [['mois', 'Ce mois-ci', 0], ['3m', '3 derniers mois', 3], ['6m', '6 derniers mois', 6], ['12m', '12 derniers mois', 12], ['tout', 'Depuis le début', -1]];
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // the buckets of a period: days for this month, months otherwise (the current one included)
  function buckets(key, all) {
    var now = new Date(), out = [], i;
    if (key === 'mois') {
      var days = now.getDate();
      for (i = 1; i <= days; i++) out.push({ from: new Date(now.getFullYear(), now.getMonth(), i), to: new Date(now.getFullYear(), now.getMonth(), i + 1), label: String(i), long: i + ' ' + MONTHS[now.getMonth()] });
      return out;
    }
    var n = (PERIODS.find(function (p) { return p[0] === key; }) || PERIODS[1])[2];
    if (n < 0) {
      var first = all.reduce(function (d, x) { return x.at < d ? x.at : d; }, now);
      n = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
    }
    for (i = n - 1; i >= 0; i--) {
      var a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ from: a, to: b, label: MONTHS[a.getMonth()], long: MONTHS[a.getMonth()] + ' ' + a.getFullYear() });
    }
    return out;
  }
  function chart(bk) {
    var max = bk.reduce(function (m, b) { return Math.max(m, b.sum); }, 0) || 1;
    var many = bk.length > 14;
    return '<div class="tx-chart" role="img" aria-label="Ventes par ' + (many ? 'jour' : 'mois') + '">' +
      '<div class="tx-chart__plot">' + bk.map(function (b, i) {
        var h = b.sum ? Math.max(3, Math.round((b.sum / max) * 100)) : 0;
        var tip = b.long + ' · ' + dollars(b.sum) + ' · ' + plural(b.n, 'commande', 'commandes');
        return '<span class="tx-chart__col" tabindex="0" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"><span class="tx-chart__bar" style="height:' + h + '%"></span></span>';
      }).join('') + '</div><div class="tx-chart__axis">' + bk.map(function (b, i) {
        return '<span>' + (!many || i === 0 || (i + 1) % 5 === 0 || i === bk.length - 1 ? esc(b.label) : '') + '</span>';
      }).join('') + '</div></div>';
  }
  function homeView(r) {
    need('overview', 'overview');
    var o = T.overview;
    if (!o) return loading('The Ivory Sukundu');
    var s = o.stats, setup = o.setup || {};
    var warn = [];
    if (!setup.stripe) warn.push('<strong>La boutique ne peut pas encore encaisser.</strong> La clé Stripe n’est pas branchée sur le site : une cliente qui veut payer est bloquée. À ajouter sur Vercel (projet « tishe »), dans Settings › Environment Variables : <code>STRIPE_SECRET_KEY</code>.');
    else if (setup.testMode) warn.push('Stripe est en mode test : les paiements ne sont pas réels.');
    if (setup.stripe && !setup.webhook) warn.push('Les commandes payées n’arrivent pas toutes seules. <button class="a-btn a-btn--sm a-btn--ghost" type="button" data-tx="setup">Réparer</button>');
    if (!setup.resend) warn.push('Les e-mails aux clientes ne partent pas (Resend n’est pas branché sur le site).');
    var key = (r && r.query && r.query.periode) || '6m';
    var all = sales(), bk = buckets(key, all);
    bk.forEach(function (b) { var xs = all.filter(function (x) { return x.at >= b.from && x.at < b.to; }); b.sum = xs.reduce(function (n, x) { return n + x.amount; }, 0); b.n = xs.length; });
    var tot = bk.reduce(function (n, b) { return n + b.sum; }, 0), cnt = bk.reduce(function (n, b) { return n + b.n; }, 0);
    var recent = (o.orders || []).slice(0, 5);
    var shop = oldOrders().map(function (x) { return oldRow(x, true); }).join('');
    return page('The Ivory Sukundu', 'Vos ventes, ancienne boutique Shopify comprise. Montants payés, en dollars canadiens.',
      (warn.length ? '<section class="a-card tx-warn">' + warn.map(function (w) { return '<p>' + w + '</p>'; }).join('') + '</section>' : '') +
      '<div class="a-filters tx-periods" role="group" aria-label="Période">' + PERIODS.map(function (p) {
        return '<a class="a-filter" href="#accueil?periode=' + p[0] + '" aria-pressed="' + (p[0] === key) + '">' + esc(p[1]) + '</a>';
      }).join('') + '</div>' +
      '<section class="a-card"><div class="tx-sum">' +
        '<div><span class="a-kpi__label">' + ico('wallet') + 'Ventes</span><span class="tx-sum__v">' + esc(dollars(tot)) + '</span></div>' +
        '<div><span class="a-kpi__label">' + ico('receipt') + 'Commandes</span><span class="tx-sum__v">' + cnt + '</span></div>' +
        '<div><span class="a-kpi__label">' + ico('bag') + 'Panier moyen</span><span class="tx-sum__v">' + esc(dollars(cnt ? tot / cnt : 0)) + '</span></div>' +
      '</div>' + chart(bk) + '</section>' +
      '<div class="a-kpis tx-kpis">' +
        kpi('clock', 'À commander chez le fournisseur', String(s.todo.toOrder), 'Commandes payées, pas encore passées', '#commandes?statut=new') +
        kpi('truck', 'En attente du suivi', String(s.todo.awaitingTracking), 'Commandées, sans numéro de suivi', '#commandes?statut=ordered') +
        kpi('chart', 'Depuis le début', dollars(all.reduce(function (n, x) { return n + x.amount; }, 0)), plural(all.length, 'commande', 'commandes') + ', Shopify compris') +
      '</div>' +
      card('<ul class="a-rows">' + recent.map(orderRow).join('') + shop + '</ul><div class="a-card__foot"><a class="a-btn a-btn--ghost" href="#commandes">Toutes les commandes</a></div>', 'Dernières commandes'),
      '<a class="a-btn a-btn--ghost" href="' + SITE + '" target="_blank" rel="noopener">' + ico('external') + 'Voir la boutique</a>');
  }
  function kpi(i, label, value, sub, href) {
    var tag = href ? 'a' : 'div';
    return '<' + tag + ' class="a-kpi"' + (href ? ' href="' + href + '"' : '') + '><span class="a-kpi__label">' + ico(i) + esc(label) + '</span><span class="a-kpi__value">' + esc(value) + '</span><span class="a-kpi__sub">' + esc(sub) + '</span></' + tag + '>';
  }

  /* ------------------------------------------------------------------ Commandes */

  function orderRow(o) {
    var where = o.shipping ? [o.shipping.city, o.shipping.country].filter(Boolean).join(', ') : (o.country || '');
    return '<li><a class="a-orow" href="#commandes/' + encodeURIComponent(o.id) + '">' +
      '<span class="a-orow__top"><span class="a-orow__id">#' + esc(o.number || '—') + ' <span class="a-orow__who">· ' + esc(o.name || o.email) + '</span></span>' + pill(o.status) + '</span>' +
      '<span class="a-orow__line"><span>' + esc(day(o.createdAt)) + (where ? ' · ' + esc(where) : '') + (o.refunded ? ' · Remboursée' : '') + '</span><span class="a-orow__amount">' + esc(cents(o.total, o.currency)) + '</span></span></a></li>';
  }
  function ordersView(r) {
    if (r.parts[0]) return orderView(decodeURIComponent(r.parts[0]));
    need('overview', 'overview');
    if (!T.overview) return loading('Commandes');
    var f = (r.query && r.query.statut) || 'all';
    var all = T.overview.orders || [];
    var list = f === 'all' ? all : all.filter(function (o) { return o.status === f; });
    var tabs = [['all', 'Toutes']].concat(Object.keys(STATUS).map(function (k) { return [k, STATUS[k][0]]; }));
    return page('Commandes', plural(all.length, 'commande payée', 'commandes payées') + ' sur theivorysukundu.com.',
      '<div class="a-filters" role="group" aria-label="Filtrer">' + tabs.map(function (t) {
        var n = t[0] === 'all' ? all.length : all.filter(function (o) { return o.status === t[0]; }).length;
        return '<a class="a-filter" href="#commandes' + (t[0] === 'all' ? '' : '?statut=' + t[0]) + '" aria-pressed="' + (f === t[0]) + '">' + esc(t[1]) + '<span class="a-filter__n">' + n + '</span></a>';
      }).join(' ') + '</div>' +
      (list.length ? '<div class="a-card a-card--flush"><ul class="a-rows">' + list.map(orderRow).join('') + '</ul></div>'
        : card('<p class="a-card__sub">Aucune commande ici.</p>')) +
      (f === 'all' || f === 'delivered' ? card('<ul class="a-rows">' + oldOrders().map(function (x) { return oldRow(x, false); }).join('') + '</ul>', 'Ancienne boutique Shopify') : ''),
      '<button class="a-btn a-btn--ghost" type="button" data-tx="reload">' + ico('refresh') + 'Actualiser</button>');
  }
  function orderView(id) {
    var d = T.orders[id];
    if (!d && !T.busy['o:' + id] && auth()) {
      T.busy['o:' + id] = true;
      call('order', { id: id }).then(function (j) { T.orders[id] = j; T.error = null; }, function (e) { T.error = e.message; })
        .then(function () { T.busy['o:' + id] = false; refresh(); });
    }
    if (!d) return loading('Commande');
    var o = d.order, a = o.shipping, cur = o.currency, ro = o.readOnly === true;
    var money = function (n) { return esc(cents(n, cur)); };
    var flash = function (k) { return T.flash === k ? ' tx-flash' : ''; };
    var items = (o.items || []).map(function (i) {
      return '<li class="a-row">' + (i.image ? '<span class="a-pthumb"><img alt="" src="' + esc(src(i.image)) + '"></span>' : '') +
        '<span class="a-row__main"><span class="a-row__title">' + esc(i.title) + '</span><span class="a-row__meta">' + esc([i.variant, i.unitAmount != null ? cents(i.unitAmount, cur) + ' × ' + i.quantity : '× ' + i.quantity].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="a-num">' + money(i.total) + '</span></li>';
    }).join('');
    var line = function (k, v) { return '<div class="tx-dl__row"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>'; };
    var left = Math.max(0, (Number(o.total) || 0) - (Number(o.refundedAmount) || 0));
    var paid = '<dl class="tx-dl">' + line('Sous-total', money(o.subtotal)) +
      (o.discount ? line('Réduction' + (o.code ? ' (' + o.code + ')' : ''), '−' + money(o.discount)) : '') +
      line('Livraison', money(o.shippingAmount)) + (o.tax ? line(o.taxLabel || 'Taxes', money(o.tax)) : '') +
      line('Total', '<strong>' + money(o.total) + '</strong>') +
      (o.payment ? line('Payé avec', esc(o.payment)) : '') +
      (o.refundedAmount ? line('Remboursé', '−' + money(o.refundedAmount)) : '') +
      (o.settled ? line('Reçu sur le compte', esc(cents(o.net, 'CAD')) + ' <span class="a-muted">(frais Stripe ' + esc(cents(o.fee, 'CAD')) + ')</span>') : '') + '</dl>';
    var addrOf = function (x) { return x ? [x.name, x.line1, x.line2, [x.city, x.state, x.postalCode].filter(Boolean).join(' '), x.country].filter(Boolean).map(esc).join('<br>') : ''; };
    var trk = (o.trackingNumbers || []).length ? '<p class="a-card__sub">' + esc(o.carrier || 'Suivi') + ' : ' + (o.trackingNumbers || []).map(esc).join(', ') +
      (/^https:\/\//.test(o.trackingUrl || '') ? ' · <a href="' + esc(o.trackingUrl) + '" target="_blank" rel="noopener">Suivre le colis</a>' : '') + '</p>' : '';
    // the history, oldest first, as Shopify draws it: a line, a dot and a date per step
    var tl = (o.timeline || []).filter(function (t) { return t && t.title; });
    var timeline = tl.length ? '<ol class="tx-tl">' + tl.map(function (t) {
      return '<li class="tx-tl__step"><span class="tx-tl__dot" aria-hidden="true"></span><div class="tx-tl__body"><p class="tx-tl__title">' + esc(t.title) + '</p>' +
        (t.detail ? '<p class="tx-tl__detail">' + esc(t.detail) + '</p>' : '') + '</div><time class="tx-tl__at" datetime="' + esc(t.at || '') + '">' + esc(t.at ? dayTime(t.at) : '') + '</time></li>';
    }).join('') + '</ol>' : '<p class="a-card__sub">Pas encore d’historique.</p>';
    var chips = pill(o.status) + (o.refunded ? ' <span class="a-pill a-tone--muted">Remboursée</span>' : (o.refundedAmount ? ' <span class="a-pill a-tone--muted">Remboursée en partie</span>' : '')) +
      (ro ? ' <span class="a-pill a-tone--muted">Ancienne boutique Shopify</span>' : '');
    var canRefund = !ro && o.paid !== false && !o.refunded && left > 0;
    var actions = (canRefund ? '<button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="refund-open" data-id="' + esc(o.id) + '">' + ico('refresh') + 'Rembourser</button>' : '') +
      (o.email ? '<button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="mail-open">' + ico('message') + 'Écrire à la cliente</button>' : '') +
      (!ro && o.status !== 'delivered' && o.status !== 'cancelled' ? '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="ostatus" data-id="' + esc(o.id) + '" data-v="delivered">' + ico('check') + 'Marquer livrée</button>' : '') +
      (!ro && o.status !== 'cancelled' && o.status !== 'delivered' ? '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="ostatus" data-id="' + esc(o.id) + '" data-v="cancelled">Annuler la commande</button>' : '') +
      (/^https:\/\//.test(o.stripeUrl || '') ? '<a class="a-btn a-btn--quiet a-btn--sm" href="' + esc(o.stripeUrl) + '" target="_blank" rel="noopener">' + ico('external') + 'Ouvrir dans Stripe</a>' : '');
    var refundCard = T.refundOpen === o.id && canRefund ? '<section class="a-card tx-flash"><div class="a-card__head"><h2 class="a-card__title">Rembourser</h2></div>' +
      '<form data-txform="refund" data-id="' + esc(o.id) + '" novalidate>' +
      field('tx-ra', 'Montant (' + esc(String(cur || 'CAD').toUpperCase()) + ')', input('tx-ra', 'amount', (left / 100).toFixed(2).replace('.', ','), ' inputmode="decimal"'), 'Au plus ' + money(left) + '. L’argent repart sur la carte de la cliente.') +
      check('notify', true, 'Prévenir la cliente par e-mail') +
      '<div class="a-btnrow"><button class="a-btn a-btn--ghost" type="button" data-tx="refund-close">Annuler</button><button class="a-btn a-btn--primary" type="submit">Rembourser</button></div></form></section>' : '';
    var mailCard = T.mailOpen === o.id ? '<section class="a-card tx-flash"><div class="a-card__head"><h2 class="a-card__title">Écrire à ' + esc(o.name || 'la cliente') + '</h2></div>' +
      '<form data-txform="email" novalidate>' + '<input type="hidden" name="to" value="' + esc(o.email) + '">' +
      field('tx-ms', 'Objet', input('tx-ms', 'subject', 'Votre commande #' + (o.number || ''))) + field('tx-mm', 'Message', '<textarea class="a-input" id="tx-mm" name="message" rows="6"></textarea>') +
      '<div class="a-btnrow"><button class="a-btn a-btn--ghost" type="button" data-tx="mail-close">Annuler</button><button class="a-btn a-btn--primary" type="submit">' + ico('message') + 'Envoyer depuis la boutique</button></div></form></section>' : '';
    var opts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + esc(STATUS[k][0]) + '</option>'; }).join('');
    var sup = (d.supplierMessages || []).map(function (m, i) {
      return '<div class="a-field"><label class="a-label" for="tx-sup' + i + '">Message pour ' + esc(m.name) + '</label><textarea class="a-input" id="tx-sup' + i + '" rows="7" readonly>' + esc(m.message) + '</textarea>' +
        '<div class="a-btnrow"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="copy" data-target="tx-sup' + i + '">' + ico('copy') + 'Copier le message</button></div></div>';
    }).join('');
    var edit = ro ? '' : card('<form data-txform="order" data-id="' + esc(o.id) + '" novalidate>' +
        field('tx-st', 'Statut', '<div class="a-selectwrap"><select class="a-input" id="tx-st" name="status">' + opts + '</select>' + ico('down') + '</div>') +
        field('tx-ref', 'Référence chez le fournisseur', input('tx-ref', 'supplierRef', o.supplierRef)) +
        '<div class="a-cols">' + field('tx-car', 'Transporteur', input('tx-car', 'carrier', o.carrier, ' placeholder="DHL, Canada Post…"')) +
        field('tx-trk', 'Numéros de suivi', input('tx-trk', 'tracking', (o.trackingNumbers && o.trackingNumbers.length ? o.trackingNumbers.join(', ') : o.tracking)), 'Plusieurs numéros : séparez-les par une virgule. Avec un numéro, la commande passe en « Expédiée ».') + '</div>' +
        field('tx-note', 'Note (pour vous seulement)', '<textarea class="a-input" id="tx-note" name="note" rows="3">' + esc(o.note) + '</textarea>') +
        check('notify', !o.shippedAt, 'Envoyer à la cliente l’e-mail avec son numéro de suivi') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer</button></div></form>', 'Suivi de la commande');
    var bill = o.billing === null ? '<p class="a-card__sub">Stripe n’a pris que le pays et le code postal de la carte.</p>' : (o.billing ? '<p class="a-card__sub">' + addrOf(o.billing) + '</p>' : '');
    return page('Commande #' + (o.number || '—'), esc(dayTime(o.createdAt)) + ' · ' + chips,
      '<div class="tx-actions">' + actions + '</div>' +
      (ro ? '<p class="a-note a-note--line">' + ico('info') + '<span>Commande de l’ancienne boutique Shopify : elle se consulte seulement, elle ne se modifie plus.</span></p>' : '') +
      refundCard + mailCard +
      '<div class="a-cols">' +
        '<div>' + '<section class="a-card' + flash('items') + '"><div class="a-card__head"><h2 class="a-card__title">Articles</h2></div><ul class="a-rows">' + items + '</ul>' + trk + '</section>' +
        '<section class="a-card' + flash('paid') + '"><div class="a-card__head"><h2 class="a-card__title">' + (o.refunded ? 'Remboursée' : 'Payée') + '</h2></div>' + paid + '</section>' +
        '<section class="a-card' + flash('timeline') + '"><div class="a-card__head"><h2 class="a-card__title">Chronologie</h2></div>' + timeline + '</section></div>' +
        '<div>' + card('<p><strong>' + esc(o.name) + '</strong><br><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' + (o.phone ? '<br>' + esc(o.phone) : '') + '</p>', 'Cliente') +
        card('<p class="a-card__sub">' + (a ? addrOf(a) : 'Adresse manquante') + '</p>', 'Adresse de livraison') +
        (bill ? card(bill, 'Adresse de facturation') : '') +
        (ro && o.note ? card('<p>' + esc(o.note) + '</p>', 'Note') : '') + '</div>' +
      '</div>' +
      edit + (!ro && sup ? card(sup, 'Commander chez le fournisseur') : ''),
      back('#commandes', 'Commandes'));
  }

  /* ------------------------------------------------------------------ Produits */

  function priceRange(p) {
    var v = (p.variants || []).map(function (x) { return Number(x.price && x.price.CAD) || 0; }).filter(Boolean);
    if (!v.length) return '';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    return lo === hi ? dollars(lo) : dollars(lo) + ' – ' + dollars(hi);
  }
  function productsView(r) {
    need('store', 'store');
    if (r.parts[0]) return productView(decodeURIComponent(r.parts[0]));
    if (!T.store) return loading('Produits');
    var list = T.store.doc.products || [];
    return page('Produits', plural(list.length, 'produit', 'produits') + '. Prix en dollars canadiens ; chaque produit a aussi son prix en dollars américains.',
      '<div class="a-card a-card--flush"><ul class="a-rows">' + list.map(function (p, i) {
        var img = p.featuredImage ? '<img alt="" src="' + esc(src(p.featuredImage.thumb || p.featuredImage.url)) + '">' : '';
        return '<li class="a-prow"><a class="a-row" href="#produits/' + encodeURIComponent(p.handle) + '"><span class="a-pthumb">' + img + '</span>' +
          '<span class="a-row__main"><span class="a-row__title"><span>' + esc(p.title) + '</span></span><span class="a-prow__price">' + esc(priceRange(p)) + '</span>' +
          '<span class="a-row__meta">' + esc(plural((p.variants || []).length, 'option', 'options')) + (p.hidden ? ' · <span class="a-chip">Masqué</span>' : '') + '</span></span></a>' +
          '<span class="tx-tight"><button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="move" data-id="' + esc(p.id) + '" data-dir="up"' + (i ? '' : ' disabled') + ' aria-label="Monter">' + ico('up') + '</button>' +
          '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="move" data-id="' + esc(p.id) + '" data-dir="down"' + (i < list.length - 1 ? '' : ' disabled') + ' aria-label="Descendre">' + ico('down') + '</button></span></li>';
      }).join('') + '</ul></div>',
      '<a class="a-btn a-btn--primary" href="#produits/nouveau">' + ico('plus') + 'Nouveau produit</a>');
  }
  var draftMedia = null, draftFor = null;
  function productView(id) {
    if (!T.store) return loading('Produit');
    var isNew = id === 'nouveau';
    var p = isNew ? { id: '', title: '', supplier: 'nine', descriptionHtml: '', media: [], options: [{ name: 'Length', values: [] }], variants: [] }
      : (T.store.doc.products || []).find(function (x) { return x.handle === id || x.id === id; });
    if (!p) return page('Produit introuvable', '', card('<a class="a-btn a-btn--primary" href="#produits">Produits</a>'));
    if (draftFor !== id) { draftFor = id; draftMedia = (p.media || []).slice(); }
    var names = (p.options || []).map(function (o) { return o.name; }).filter(function (n) { return n !== 'Title'; });
    var variants = (p.variants || []).length ? p.variants : [{ id: '', selectedOptions: [], price: { CAD: '', USD: '' }, compareAtPrice: null, availableForSale: true }];
    var vrow = function (v, i) {
      var val = (v.selectedOptions || []).filter(function (o) { return o.name !== 'Title'; }).map(function (o) { return o.value; }).join(' / ');
      return '<tr data-vrow="' + i + '"><td><input class="a-input" name="v-opt" value="' + esc(val) + '" aria-label="Option" placeholder="' + esc(names.join(' / ') || 'Option') + '"><input type="hidden" name="v-id" value="' + esc(v.id) + '"></td>' +
        '<td><input class="a-input" name="v-cad" inputmode="decimal" value="' + esc(v.price && v.price.CAD) + '" aria-label="Prix CAD"></td>' +
        '<td><input class="a-input" name="v-usd" inputmode="decimal" value="' + esc(v.price && v.price.USD) + '" aria-label="Prix USD"></td>' +
        '<td><input class="a-input" name="v-was" inputmode="decimal" value="' + esc(v.compareAtPrice ? v.compareAtPrice.CAD : '') + '" aria-label="Prix barré CAD"></td>' +
        '<td><input type="checkbox" name="v-on"' + (v.availableForSale !== false ? ' checked' : '') + ' aria-label="En vente"></td>' +
        '<td><button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="vdel" aria-label="Retirer cette option">' + ico('trash') + '</button></td></tr>';
    };
    var media = draftMedia.map(function (m, i) {
      return '<li class="tx-media"><img alt="" src="' + esc(src(m.previewUrl || m.url)) + '"><span class="tx-tight">' +
        '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="mmove" data-i="' + i + '" data-dir="-1"' + (i ? '' : ' disabled') + ' aria-label="Avant">' + ico('chev-left') + '</button>' +
        '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="mdel" data-i="' + i + '" aria-label="Retirer">' + ico('trash') + '</button></span></li>';
    }).join('');
    var desc = String(p.descriptionHtml || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/li>\s*<li>/g, '\n• ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    return page(isNew ? 'Nouveau produit' : p.title, isNew ? '' : '<a href="' + SITE + '/#/product/' + esc(p.handle) + '" target="_blank" rel="noopener">Voir sur la boutique</a>',
      '<form data-txform="product" data-id="' + esc(p.id) + '" novalidate>' +
        card(field('tx-pt', 'Nom', input('tx-pt', 'title', p.title, ' maxlength="120"')) +
          field('tx-pd', 'Description', '<textarea class="a-input" id="tx-pd" name="description" rows="8">' + esc(desc) + '</textarea>', 'Une ligne vide fait un nouveau paragraphe. Tant que vous ne touchez pas au texte, sa mise en forme d’origine est gardée.') +
          '<div class="a-cols">' + field('tx-ps', 'Fournisseur', '<div class="a-selectwrap"><select class="a-input" id="tx-ps" name="supplier"><option value="nine"' + (p.supplier === 'nine' ? ' selected' : '') + '>Nine ISEE (Inde)</option><option value="evelyn"' + (p.supplier === 'evelyn' ? ' selected' : '') + '>Evelyn Thanh An Hair (Vietnam)</option></select>' + ico('down') + '</div>') +
          field('tx-pn', 'Nom de l’option', input('tx-pn', 'optnames', names.join(' / ') || 'Length'), 'Par exemple « Length » ou « Length / Texture ».') + '</div>' +
          check('visible', !p.hidden, 'Visible sur la boutique'), 'Produit') +
        card('<ul class="tx-medias">' + media + '</ul><label class="a-btn a-btn--ghost">' + ico('camera') + 'Ajouter des photos<input type="file" accept="image/*" multiple data-tx-upload hidden></label><p class="a-hint" data-tx-upmsg></p>', 'Photos') +
        card('<div class="a-otable-wrap"><table class="a-otable tx-vtable"><thead><tr><th>Option</th><th>Prix CAD</th><th>Prix USD</th><th>Prix barré CAD</th><th>En vente</th><th></th></tr></thead><tbody>' + variants.map(vrow).join('') + '</tbody></table></div>' +
          '<div class="a-btnrow"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="vadd">' + ico('plus') + 'Ajouter une option</button></div>', 'Options et prix') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer sur la boutique</button>' +
        (isNew ? '' : '<button class="a-btn a-btn--quiet" type="button" data-tx="pdel" data-id="' + esc(p.id) + '">' + ico('trash') + 'Supprimer le produit</button>') + '</div></form>',
      back('#produits', 'Produits'));
  }
  function productFromForm(f) {
    var id = f.getAttribute('data-id');
    var names = f.elements.optnames.value.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!names.length) names = ['Title'];
    var variants = Array.prototype.map.call(f.querySelectorAll('[data-vrow]'), function (tr) {
      var q = function (n) { return tr.querySelector('[name="' + n + '"]'); };
      var vals = q('v-opt').value.split('/').map(function (s) { return s.trim(); });
      var cad = Number(String(q('v-cad').value).replace(',', '.')), usd = Number(String(q('v-usd').value).replace(',', '.'));
      var was = Number(String(q('v-was').value).replace(',', '.'));
      return {
        id: q('v-id').value, availableForSale: q('v-on').checked,
        price: { CAD: cad, USD: usd || Math.round(cad * 0.73 * 100) / 100 },
        compareAtPrice: was > 0 ? { CAD: was, USD: Math.round(was * (usd && cad ? usd / cad : 0.73) * 100) / 100 } : null,
        selectedOptions: names[0] === 'Title' ? [{ name: 'Title', value: 'Default Title' }] : names.map(function (n, i) { return { name: n, value: vals[i] || '' }; })
      };
    });
    var desc = f.elements.description.value.trim();
    var orig = id ? ((T.store.doc.products || []).find(function (x) { return x.id === id; }) || {}).descriptionHtml : '';
    var untouched = f.elements.description.defaultValue.trim() === desc;
    return {
      id: id, title: f.elements.title.value, supplier: f.elements.supplier.value, hidden: !f.elements.visible.checked,
      descriptionHtml: untouched && orig ? orig : desc ? desc.split(/\n{2,}/).map(function (para) { return '<p>' + esc(para).replace(/\n/g, '<br>') + '</p>'; }).join('') : '',
      media: draftMedia, variants: variants
    };
  }
  // a phone photo becomes a 1600 px copy and a 640 px one before it leaves (as the store's own dashboard does)
  function toJpeg(img, w, q) {
    var s = Math.min(1, w / img.width), c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  function upload(files, f) {
    var msg = f.querySelector('[data-tx-upmsg]'), handle = (f.elements.title.value || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var list = Array.prototype.slice.call(files || []);
    var next = function () {
      var file = list.shift();
      if (!file) { if (msg) msg.textContent = ''; return; }
      if (msg) msg.textContent = 'Envoi de la photo… (' + (list.length + 1) + ')';
      createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (img) {
        var full = toJpeg(img, 1600, 0.84), thumb = toJpeg(img, 640, 0.8);
        img.close();
        return call('upload', { handle: handle, full: full, thumb: thumb });
      }).then(function (j) { draftMedia.push({ type: 'image', url: j.url, previewUrl: j.thumb, altText: f.elements.title.value || null }); keepForm(f); }, function (e) { toast(e.message); }).then(next);
    };
    next();
  }

  /* ------------------------------------------------------------------ Codes promo */

  var KIND = { percent: 'Pourcentage', amount: 'Montant', free_shipping: 'Livraison offerte' };
  function codeDesc(c) {
    var bits = [c.kind === 'percent' ? '−' + c.percent + ' %' : c.kind === 'amount' ? '−' + dollars(c.amount && c.amount.CAD) : 'Livraison offerte'];
    if (c.minSubtotal && c.minSubtotal.CAD) bits.push('dès ' + dollars(c.minSubtotal.CAD));
    if (c.firstOrderOnly) bits.push('première commande');
    if (c.returningOnly) bits.push('clientes fidèles');
    if (c.oncePerCustomer) bits.push('une fois par cliente');
    if (c.endsAt) bits.push('jusqu’au ' + day(c.endsAt));
    return bits.join(' · ');
  }
  function promosView(r) {
    need('store', 'store');
    if (!T.store) return loading('Codes promo');
    if (r.parts[0]) return codeView(decodeURIComponent(r.parts[0]));
    var codes = T.store.doc.discounts || [], usage = T.store.usage || {};
    return page('Codes promo', 'Ils s’appliquent aux cheveux, jamais à la livraison ni aux taxes.',
      '<div class="a-card a-card--flush"><ul class="a-rows">' + codes.map(function (c) {
        return '<li><a class="a-row" href="#promos/' + encodeURIComponent(c.code) + '"><span class="a-row__main"><span class="a-row__title"><span>' + esc(c.code) + '</span>' +
          (c.active ? '' : ' <span class="a-pill a-tone--muted">Désactivé</span>') + '</span><span class="a-row__meta">' + esc(codeDesc(c)) + ' · ' + esc(plural(usage[c.code] || 0, 'utilisation', 'utilisations')) + '</span></span></a></li>';
      }).join('') + '</ul></div>',
      '<a class="a-btn a-btn--primary" href="#promos/nouveau">' + ico('plus') + 'Nouveau code</a>');
  }
  function codeView(code) {
    var isNew = code === 'nouveau';
    var c = isNew ? { code: '', kind: 'percent', percent: 10, active: true, label: '' } : (T.store.doc.discounts || []).find(function (x) { return x.code === code; });
    if (!c) return page('Code introuvable', '', card('<a class="a-btn a-btn--primary" href="#promos">Codes promo</a>'));
    var dt = function (iso) { return iso ? String(iso).slice(0, 10) : ''; };
    return page(isNew ? 'Nouveau code' : c.code, '',
      '<form data-txform="code" data-prev="' + esc(isNew ? '' : c.code) + '" novalidate>' + card(
        '<div class="a-cols">' + field('tx-cc', 'Code', input('tx-cc', 'code', c.code, ' maxlength="40" style="text-transform:uppercase"')) +
        field('tx-ck', 'Type', '<div class="a-selectwrap"><select class="a-input" id="tx-ck" name="kind">' + Object.keys(KIND).map(function (k) { return '<option value="' + k + '"' + (c.kind === k ? ' selected' : '') + '>' + KIND[k] + '</option>'; }).join('') + '</select>' + ico('down') + '</div>') + '</div>' +
        '<div class="a-cols">' + field('tx-cp', 'Pourcentage (si « Pourcentage »)', input('tx-cp', 'percent', c.percent, ' inputmode="numeric"')) +
        field('tx-ca', 'Montant en CAD (si « Montant »)', input('tx-ca', 'amountCAD', c.amount ? c.amount.CAD : '', ' inputmode="decimal"')) +
        field('tx-cu', 'Montant en USD', input('tx-cu', 'amountUSD', c.amount ? c.amount.USD : '', ' inputmode="decimal"')) + '</div>' +
        '<div class="a-cols">' + field('tx-cm', 'Panier minimum en CAD', input('tx-cm', 'minCAD', c.minSubtotal ? c.minSubtotal.CAD : '', ' inputmode="decimal"')) +
        field('tx-cmu', 'Panier minimum en USD', input('tx-cmu', 'minUSD', c.minSubtotal ? c.minSubtotal.USD : '', ' inputmode="decimal"')) + '</div>' +
        field('tx-cl', 'Texte affiché dans le panier', input('tx-cl', 'label', c.label, ' maxlength="80" placeholder="10% off"'), 'En anglais, comme la boutique.') +
        '<div class="a-cols">' + field('tx-cs', 'Début', '<input class="a-input" type="date" id="tx-cs" name="startsAt" value="' + esc(dt(c.startsAt)) + '">') +
        field('tx-ce', 'Fin', '<input class="a-input" type="date" id="tx-ce" name="endsAt" value="' + esc(dt(c.endsAt)) + '">') + '</div>' +
        check('active', c.active, 'Actif') + check('firstOrderOnly', c.firstOrderOnly, 'Première commande seulement') +
        check('returningOnly', c.returningOnly, 'Clientes qui ont déjà commandé') + check('oncePerCustomer', c.oncePerCustomer, 'Une fois par cliente')) +
      '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer</button>' +
      (isNew ? '' : '<button class="a-btn a-btn--quiet" type="button" data-tx="cdel" data-code="' + esc(c.code) + '">' + ico('trash') + 'Supprimer le code</button>') + '</div></form>',
      back('#promos', 'Codes promo'));
  }
  function codeFromForm(f) {
    var e = f.elements, n = function (v) { var x = Number(String(v).replace(',', '.')); return isFinite(x) && x > 0 ? x : 0; };
    var r = { code: e.code.value.trim().toUpperCase(), kind: e.kind.value, active: e.active.checked, label: e.label.value.trim(),
      firstOrderOnly: e.firstOrderOnly.checked || undefined, returningOnly: e.returningOnly.checked || undefined, oncePerCustomer: e.oncePerCustomer.checked || undefined };
    if (r.kind === 'percent') r.percent = n(e.percent.value);
    if (r.kind === 'amount') r.amount = { CAD: n(e.amountCAD.value), USD: n(e.amountUSD.value) || n(e.amountCAD.value) };
    if (n(e.minCAD.value)) r.minSubtotal = { CAD: n(e.minCAD.value), USD: n(e.minUSD.value) || n(e.minCAD.value) };
    if (e.startsAt.value) r.startsAt = new Date(e.startsAt.value + 'T00:00:00').toISOString();
    if (e.endsAt.value) r.endsAt = new Date(e.endsAt.value + 'T23:59:59').toISOString();
    return r;
  }

  /* ------------------------------------------------------------------ Boutique en ligne: the bar and the sale */

  function siteView() {
    need('store', 'store');
    if (!T.store) return loading('Boutique en ligne');
    var s = T.store.doc.site || {}, sale = s.sale, products = T.store.doc.products || [];
    var ann = (s.announcements || []).concat(['', '', '', '', '', '']).slice(0, 6);
    return page('Boutique en ligne', 'Cliquez un texte du site pour l’écrire sur place, une photo pour la remplacer. Les clientes ne voient rien avant « Enregistrer ».',
      editorHTML() +
      '<form data-txform="site" id="tx-siteform" novalidate>' +
        card(ann.map(function (a, i) { return field('tx-an' + i, 'Message ' + (i + 1), input('tx-an' + i, 'ann', a, ' maxlength="70"')); }).join('') +
          '<p class="a-hint">Les messages défilent l’un après l’autre. Laissez vide pour en retirer un.</p>', 'Bandeau d’annonces') +
        card(check('saleOn', !!sale, 'Des soldes en cours') +
          '<div class="a-cols">' + field('tx-sn', 'Nom des soldes', input('tx-sn', 'saleName', sale ? sale.name : 'Sale', ' maxlength="40"')) +
          field('tx-se', 'Fin des soldes', '<input class="a-input" type="datetime-local" id="tx-se" name="saleEnds" value="' + esc(sale && sale.endsAt ? sale.endsAt.slice(0, 16) : '') + '">') + '</div>' +
          field('tx-sb', 'Phrase dans le bandeau pendant les soldes', input('tx-sb', 'saleBanner', sale ? sale.banner : '', ' maxlength="60"')) +
          '<fieldset class="a-fieldset"><legend>Produits en solde</legend>' + products.map(function (p) {
            return check('saleHandle:' + p.handle, sale && (sale.handles || []).indexOf(p.handle) >= 0, p.title);
          }).join('') + '</fieldset><p class="a-hint">Le prix barré de chaque option se règle dans le produit.</p>', 'Soldes') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer sur la boutique</button>' +
        '<a class="a-btn a-btn--ghost" href="' + SITE + '" target="_blank" rel="noopener">' + ico('external') + 'Voir la boutique</a></div></form>');
  }

  /* ------------------------------------------------------------------ the site, edited in place (the shop's docs/jeere-editor.md) */

  var ORIGIN = 'https://www.theivorysukundu.com';
  var ED = { changes: {}, fields: [], pages: [], route: '/', imgKey: null, device: 'desktop', mode: '' };
  // « Simple »: the page's texts and photos as a form (the phone's default, like the Jeere editor); « Sur le site »:
  // click the text right on the site. The site stays loaded behind the form: it is what lists the fields.
  function edMode() { if (!ED.mode) ED.mode = (window.matchMedia && window.matchMedia('(max-width: 899px)').matches) ? 'simple' : 'site'; return ED.mode; }
  var LABELS = { hero: 'Accueil', campaign: 'Campagne', collection: 'Collection', reviews: 'Avis', lengths: 'Guide des longueurs', ourhair: 'Nos cheveux', circle: 'The Circle', contact: 'Contact', footer: 'Pied de page' };
  function keyLabel(k) {
    var parts = String(k).split('.'), sec = LABELS[parts[0]] || parts[0];
    var rest = parts.slice(1).join(' ').replace(/(\d)/, ' $1').replace(/eyebrow/, 'surtitre').replace(/title/, 'titre').replace(/body/, 'texte').replace(/cta/, 'bouton').replace(/logo/, 'logo').replace(/note/, 'note').replace(/tip/, 'conseil').replace(/closing/, 'conclusion').replace(/motto/, 'devise').replace(/about/, 'à propos').replace(/reason/, 'raison').replace(/step/, 'étape').replace(/quiz/, 'quiz');
    return sec + ' · ' + rest;
  }
  function editorHTML() {
    return '<section class="a-card tx-ed' + (edMode() === 'simple' ? ' is-simple' : '') + '" id="tx-ed">' +
      '<div class="tx-ed__bar">' +
        '<div class="tx-ed__seg tx-ed__view" role="group" aria-label="Façon de modifier"><button type="button" data-tx="edmode" data-mode="simple" aria-pressed="' + (edMode() === 'simple') + '">' + ico('edit') + 'Simple</button><button type="button" data-tx="edmode" data-mode="site" aria-pressed="' + (edMode() === 'site') + '">' + ico('eye') + 'Sur le site</button></div>' +
        '<div class="a-selectwrap tx-ed__pages"><select class="a-input" id="tx-pages" aria-label="Page du site"><option value="/">Accueil</option></select>' + ico('down') + '</div>' +
        '<div class="tx-ed__seg" role="group" aria-label="Appareil"><button type="button" data-tx="dev" data-dev="desktop" aria-pressed="' + (ED.device === 'desktop') + '">' + ico('desktop') + 'Ordinateur</button><button type="button" data-tx="dev" data-dev="phone" aria-pressed="' + (ED.device === 'phone') + '">' + ico('phone') + 'Téléphone</button></div>' +
        '<label class="tx-check tx-ed__mode"><input type="checkbox" id="tx-editmode" checked><span>Mode édition</span></label>' +
        '<span class="tx-ed__n" id="tx-n" aria-live="polite">Aucun changement</span>' +
        '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="cdiscard" id="tx-discard" disabled>' + ico('undo') + 'Annuler</button>' +
        '<button class="a-btn a-btn--primary a-btn--sm" type="button" data-tx="csave" id="tx-save" disabled>' + ico('check') + 'Enregistrer</button>' +
      '</div>' +
      '<div class="tx-ed__body">' +
        '<div class="tx-ed__stage"><div class="tx-ed__frame" data-dev="' + ED.device + '"><iframe id="tx-frame" src="' + ORIGIN + '/?jeere=edit#' + esc(ED.route || '/') + '" title="theivorysukundu.com, modifiable"></iframe></div></div>' +
        '<aside class="tx-ed__side"><p class="tx-ed__h">Sur cette page</p><div id="tx-fields"><p class="a-hint">Chargement du site…</p></div></aside>' +
      '</div><input type="file" accept="image/*" id="tx-imgpick" hidden></section>';
  }
  function frame() { var f = document.getElementById('tx-frame'); return f && f.contentWindow; }
  function toShop(msg) { var w = frame(); if (w) w.postMessage(Object.assign({ source: 'jeere' }, msg), ORIGIN); }
  function countChanges() {
    var n = Object.keys(ED.changes).length, el = document.getElementById('tx-n');
    if (el) el.textContent = n ? plural(n, 'changement pas encore enregistré', 'changements pas encore enregistrés') : 'Aucun changement';
    ['tx-save', 'tx-discard'].forEach(function (id) { var b = document.getElementById(id); if (b) b.disabled = !n; });
  }
  function drawFields() {
    var box = document.getElementById('tx-fields');
    if (!box) return;
    if (!ED.fields.length) { box.innerHTML = '<p class="a-hint">Rien à modifier sur cette page : les produits se règlent dans « Produits ».</p>'; return; }
    box.innerHTML = ED.fields.map(function (f) {
      var v = Object.prototype.hasOwnProperty.call(ED.changes, f.key) ? ED.changes[f.key] : f.value;
      var cur = v === '' ? f.original : v;
      var changed = Object.prototype.hasOwnProperty.call(ED.changes, f.key) || f.changed;
      var head = '<button type="button" class="tx-field__k" data-tx="fsel" data-key="' + esc(f.key) + '">' + esc(keyLabel(f.key)) + (changed ? ' <span class="tx-field__dot" aria-label="modifié"></span>' : '') + '</button>';
      if (f.kind === 'image') return '<div class="tx-field">' + head + '<div class="tx-field__img"><img alt="" src="' + esc(src(cur)) + '"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="fimg" data-key="' + esc(f.key) + '">' + ico('camera') + 'Remplacer</button></div></div>';
      return '<div class="tx-field">' + head + '<textarea class="a-input" rows="' + Math.min(6, Math.max(1, Math.ceil(String(cur || '').length / 34))) + '" data-tx-key="' + esc(f.key) + '">' + esc(cur) + '</textarea>' +
        (changed ? '<button class="tx-field__reset" type="button" data-tx="freset" data-key="' + esc(f.key) + '">Revenir au texte d’origine</button>' : '') + '</div>';
    }).join('');
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.source !== 'tishe' || !on()) return;
    var d = e.data;
    if (d.type === 'ready') {
      ED.pages = d.pages || [];
      var sel = document.getElementById('tx-pages');
      if (sel) sel.innerHTML = ED.pages.map(function (p) { return '<option value="' + esc(p.route) + '">' + esc(p.name) + '</option>'; }).join('');
    } else if (d.type === 'page') {
      ED.route = d.route || '/'; ED.fields = d.fields || []; ED.changes = d.changes || ED.changes;
      var s2 = document.getElementById('tx-pages'); if (s2) s2.value = ED.route;
      drawFields(); countChanges();
    } else if (d.type === 'change') {
      ED.changes = d.changes || ED.changes;
      var ta = document.querySelector('[data-tx-key="' + (window.CSS && CSS.escape ? CSS.escape(d.key) : d.key) + '"]');
      if (ta && document.activeElement !== ta) ta.value = d.value;
      countChanges();
    } else if (d.type === 'select') {
      if (d.kind === 'image') { ED.imgKey = d.key; var pick = document.getElementById('tx-imgpick'); if (pick) pick.click(); }
      var row = document.querySelector('[data-tx-key="' + d.key + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
    } else if (d.type === 'open') {
      if (d.what === 'product' && d.id) go('#produits/' + encodeURIComponent(d.id));
      else { var f = document.getElementById('tx-siteform'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });
  document.addEventListener('input', function (e) {
    var ta = e.target.closest && e.target.closest('#tx-fields [data-tx-key]');
    if (!ta || !on()) return;
    var k = ta.getAttribute('data-tx-key');
    ED.changes[k] = ta.value;
    toShop({ type: 'set', key: k, value: ta.value });
    countChanges();
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!on() || !t) return;
    if (t.id === 'tx-pages') toShop({ type: 'navigate', route: t.value });
    else if (t.id === 'tx-editmode') toShop({ type: 'edit', on: t.checked });
    else if (t.id === 'tx-imgpick' && t.files && t.files[0] && ED.imgKey) {
      var key = ED.imgKey, file = t.files[0];
      t.value = '';
      toast('Envoi de la photo…');
      createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (img) {
        var full = toJpeg(img, 1600, 0.84), thumb = toJpeg(img, 640, 0.8);
        img.close();
        return call('upload', { handle: 'site', full: full, thumb: thumb });
      }).then(function (j) {
        ED.changes[key] = j.url;
        toShop({ type: 'set', key: key, value: j.url });
        drawFields(); countChanges();
        toast('Photo prête : pensez à enregistrer.');
      }, function (x) { toast(x.message); });
    }
  });
  function saveContent(btn) {
    busy(btn, true);
    call('saveContent', { content: ED.changes }).then(function (j) {
      if (j.doc && T.store) T.store.doc = j.doc;
      toShop({ type: 'store', doc: j.doc });
      ED.changes = {};
      drawFields(); countChanges();
      toast('Enregistré : les clientes le voient d’ici une minute.');
    }, function (x) { toast(x.message); }).then(function () { busy(btn, false); countChanges(); });
  }

  /* ------------------------------------------------------------------ Livraison */

  function shippingView() {
    need('store', 'store');
    if (!T.store) return loading('Livraison');
    var sh = T.store.doc.shipping || { zones: [] };
    return page('Livraison', 'Le prix de la livraison par zone. ' + (sh.freeShippingCode ? 'Livraison offerte avec ' + esc(sh.freeShippingCode) + '.' : ''),
      '<form data-txform="shipping" novalidate>' + card((sh.zones || []).map(function (z) {
        return field('tx-z' + esc(z.id), z.label + ' (' + z.currency + ')', input('tx-z' + esc(z.id), 'zone:' + z.id, z.rate, ' inputmode="decimal"'), (z.countries || []).slice(0, 8).join(', ') + ((z.countries || []).length > 8 ? '…' : ''));
      }).join('')) + '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer</button></div></form>');
  }

  /* ------------------------------------------------------------------ Clientes */

  function clientsView() {
    need('customers', 'customers', function (j) { return j.customers || []; });
    need('subscribers', 'subscribers', function (j) { return j.subscribers || []; });
    if (!T.customers) return loading('Clientes');
    var subs = T.subscribers || [];
    return page('Clientes', plural(T.customers.length, 'cliente', 'clientes') + ' · ' + plural(subs.length, 'abonnée', 'abonnées') + ' au Circle.',
      card(T.customers.length ? '<div class="a-otable-wrap"><table class="a-otable"><thead><tr><th>Cliente</th><th>Pays</th><th class="a-num">Commandes</th><th class="a-num">Dépensé</th><th>Dernière</th></tr></thead><tbody>' +
        T.customers.map(function (c) { return '<tr><td>' + esc(c.name) + '<br><a class="a-small" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></td><td>' + esc(c.country) + '</td><td class="a-num">' + c.orders + '</td><td class="a-num">' + esc(dollars(c.spent)) + '</td><td>' + esc(day(c.last)) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="a-card__sub">Pas encore de cliente.</p>', 'Clientes') +
      card(subs.length ? '<ul class="a-rows">' + subs.slice(0, 200).map(function (s) {
        return '<li class="a-row"><span class="a-row__main"><span class="a-row__title">' + esc(s.email) + '</span><span class="a-row__meta">' + esc([s.firstName, s.createdAt ? day(s.createdAt) : '', s.unsubscribed ? 'désabonnée' : ''].filter(Boolean).join(' · ')) + '</span></span></li>';
      }).join('') + '</ul>' : '<p class="a-card__sub">Personne pour l’instant.</p>', 'Abonnées au Circle') +
      card('<form data-txform="email" novalidate>' + field('tx-mt', 'À', input('tx-mt', 'to', '', ' type="email" placeholder="cliente@exemple.com"')) +
        field('tx-ms', 'Objet', input('tx-ms', 'subject', '')) + field('tx-mm', 'Message', '<textarea class="a-input" id="tx-mm" name="message" rows="6"></textarea>') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('message') + 'Envoyer depuis la boutique</button></div></form>', 'Écrire à une cliente'));
  }

  /* ------------------------------------------------------------------ what the store manages elsewhere */

  function elsewhere(title) {
    var where = {
      paiements: ['Les paiements passent par Stripe, en dollars canadiens et américains.', 'https://dashboard.stripe.com', 'Ouvrir Stripe'],
      pages: ['Les pages de theivorysukundu.com sont écrites dans son code : elles ne se modifient pas encore ici.', SITE, 'Voir la boutique'],
      connecteurs: ['Stripe et Resend sont branchés directement sur la boutique.', SITE, 'Voir la boutique'],
      parametres: ['Le nom de domaine, Stripe et les e-mails se règlent sur Vercel, où la boutique est hébergée.', 'https://vercel.com/dashboard', 'Ouvrir Vercel']
    }[title] || ['', SITE, 'Voir la boutique'];
    var label = { paiements: 'Paiements', pages: 'Pages', connecteurs: 'Connecteurs', parametres: 'Paramètres' }[title] || 'The Ivory Sukundu';
    return page(label, '', card('<p class="a-card__sub">' + esc(where[0]) + '</p><div class="a-btnrow"><a class="a-btn a-btn--ghost" href="' + where[1] + '" target="_blank" rel="noopener">' + ico('external') + esc(where[2]) + '</a>' +
      '<button class="a-btn a-btn--quiet" type="button" data-tx="signout">' + ico('logout') + 'Déconnecter la boutique de ce navigateur</button></div>'));
  }

  // Motion: a short fade and slide when the section changes; an order slides in from the right, back reverses it
  function view(r) {
    var html = viewInner(r);
    var key = r.name + '/' + (r.parts && r.parts[0] ? r.parts[0] : '');
    var was = T.lastKey || '';
    T.lastKey = key;
    if (was === key) return html;
    var detail = function (k) { return /^commandes\/./.test(k); };
    var cls = detail(key) && /^commandes\/$/.test(was) ? 'tx-in-right' : (detail(was) && /^commandes\/$/.test(key) ? 'tx-in-left' : 'tx-in');
    return '<div class="tx-anim ' + cls + '">' + html + '</div>';
  }
  function viewInner(r) {
    if (!auth()) return signInView();
    switch (r.name) {
      case 'accueil': return homeView(r);
      case 'commandes': return ordersView(r);
      case 'produits': return productsView(r);
      case 'promos': return promosView(r);
      case 'boutique': return siteView();
      case 'livraison': return shippingView();
      case 'clients': return clientsView();
      default: return elsewhere(r.name);
    }
  }

  /* ------------------------------------------------------------------ events (inside #a-main, while this store is in view) */

  function busy(btn, on) { if (btn) { btn.disabled = on; btn.setAttribute('aria-busy', on ? 'true' : 'false'); } }
  function saveDoc(action, body, msg, after) {
    return call(action, body).then(function (j) {
      if (j.doc && T.store) T.store.doc = j.doc;
      toast(msg);
      if (after) after(j);
      if (frame() && j.doc) toShop({ type: 'store', doc: j.doc }); else refresh();
    }, function (e) { toast(e.message); });
  }
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('#a-main form[data-txform]');
    if (!f || !on()) return;
    e.preventDefault();
    var kind = f.getAttribute('data-txform'), btn = f.querySelector('[type="submit"]'), el = f.elements;
    busy(btn, true);
    var done = function () { busy(btn, false); };
    if (kind === 'link') {
      call('link', { email: el.email.value, to: 'jeere' }).then(function () { T.linkSent = true; T.error = null; }, function (x) { T.error = x.message; }).then(function () { done(); refresh(); });
    } else if (kind === 'order') {
      var id = f.getAttribute('data-id');
      call('update', { id: id, status: el.status.value, supplierRef: el.supplierRef.value, carrier: el.carrier.value, tracking: el.tracking.value, note: el.note.value, notify: el.notify.checked })
        .then(function (j) {
          T.orders[id] = { order: j.order, supplierMessages: j.supplierMessages };
          if (T.overview) T.overview.orders = T.overview.orders.map(function (o) { return o.id === id ? Object.assign({}, o, j.order) : o; });
          toast(j.notified ? 'Enregistré. La cliente a reçu son numéro de suivi.' : 'Commande enregistrée.');
          refresh();
        }, function (x) { toast(x.message); }).then(done);
    } else if (kind === 'product') {
      var p = productFromForm(f);
      saveDoc('saveProduct', { product: p }, 'Produit enregistré sur la boutique.', function (j) {
        draftFor = null;
        if (!p.id) { var made = j.doc.products[j.doc.products.length - 1]; if (made) go('#produits/' + encodeURIComponent(made.handle)); }
      }).then(done);
    } else if (kind === 'code') {
      saveDoc('saveCode', { rule: codeFromForm(f), previousCode: f.getAttribute('data-prev') }, 'Code enregistré.', function () { go('#promos'); }).then(done);
    } else if (kind === 'site') {
      var handles = Array.prototype.filter.call(f.querySelectorAll('input[type="checkbox"]'), function (c) { return c.name.indexOf('saleHandle:') === 0 && c.checked; }).map(function (c) { return c.name.slice(11); });
      var ends = el.saleEnds.value;
      saveDoc('saveSite', {
        announcements: Array.prototype.map.call(f.querySelectorAll('[name="ann"]'), function (i) { return i.value; }).filter(function (v) { return v.trim(); }),
        sale: el.saleOn.checked && ends ? { name: el.saleName.value, banner: el.saleBanner.value, endsAt: new Date(ends).toISOString(), handles: handles } : null
      }, 'Bandeau et soldes enregistrés sur la boutique.').then(done);
    } else if (kind === 'shipping') {
      var rates = {};
      Array.prototype.forEach.call(f.querySelectorAll('[name^="zone:"]'), function (i) { rates[i.name.slice(5)] = Number(String(i.value).replace(',', '.')); });
      saveDoc('saveShipping', { rates: rates }, 'Tarifs de livraison enregistrés.').then(done);
    } else if (kind === 'refund') {
      var rid = f.getAttribute('data-id');
      var amt = Math.round(Number(String(el.amount.value).replace(/\s/g, '').replace(',', '.')) * 100);
      var od = T.orders[rid] && T.orders[rid].order;
      var max = od ? Math.max(0, (Number(od.total) || 0) - (Number(od.refundedAmount) || 0)) : 0;
      if (!(amt > 0) || amt > max) { toast('Montant invalide : entre 0 et ' + (od ? cents(max, od.currency) : '') + '.'); done(); return; }
      var u = U(), txt = 'Rembourser ' + (od ? cents(amt, od.currency) : '') + ' à ' + ((od && od.name) || 'la cliente') + ' ? L’argent quitte votre compte Stripe.';
      (u ? u.confirmBox({ title: 'Confirmer le remboursement', text: txt, ok: 'Rembourser' }) : Promise.resolve(confirm(txt))).then(function (ok) {
        if (!ok) { done(); return; }
        var body = { id: rid, notify: el.notify.checked };
        if (amt < max) body.amount = amt;
        call('refund', body).then(function (j) {
          T.orders[rid] = { order: j.order, supplierMessages: j.supplierMessages || (T.orders[rid] && T.orders[rid].supplierMessages) };
          if (T.overview) T.overview.orders = T.overview.orders.map(function (x) { return x.id === rid ? Object.assign({}, x, j.order) : x; });
          T.refundOpen = null; T.flash = 'paid';
          toast(j.notified ? 'Remboursement fait. La cliente est prévenue.' : 'Remboursement fait.');
          refresh(); setTimeout(function () { T.flash = null; }, 1200);
        }, function (x) { toast(x.message); }).then(done);
      });
    } else if (kind === 'email') {
      call('email', { to: el.to.value, subject: el.subject.value, message: el.message.value }).then(function () {
        toast('E-mail envoyé.'); f.reset();
        if (T.mailOpen) { var mo = T.mailOpen; T.mailOpen = null; delete T.orders[mo]; T.flash = 'timeline'; refresh(); setTimeout(function () { T.flash = null; }, 1200); }
      }, function (x) { toast(x.message); }).then(done);
    } else done();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#a-main [data-tx]');
    if (!b || !on()) return;
    var a = b.getAttribute('data-tx');
    if (a === 'refund-open') { T.refundOpen = b.getAttribute('data-id'); T.mailOpen = null; refresh(); return; }
    if (a === 'refund-close') { T.refundOpen = null; refresh(); return; }
    if (a === 'mail-open') { var mm = /^#commandes\/([^/?#]+)/.exec(location.hash); T.mailOpen = mm ? decodeURIComponent(mm[1]) : null; T.refundOpen = null; refresh(); return; }
    if (a === 'mail-close') { T.mailOpen = null; refresh(); return; }
    if (a === 'ostatus') {
      var oid = b.getAttribute('data-id'), v = b.getAttribute('data-v');
      var go2 = function () {
        busy(b, true);
        call('update', { id: oid, status: v }).then(function (j) {
          T.orders[oid] = { order: j.order, supplierMessages: j.supplierMessages };
          if (T.overview) T.overview.orders = T.overview.orders.map(function (x) { return x.id === oid ? Object.assign({}, x, j.order) : x; });
          T.flash = 'timeline'; toast(v === 'delivered' ? 'Commande marquée livrée.' : 'Commande annulée.');
          refresh(); setTimeout(function () { T.flash = null; }, 1200);
        }, function (x) { toast(x.message); busy(b, false); });
      };
      if (v === 'cancelled') { var uu = U(); (uu ? uu.confirmBox({ title: 'Annuler cette commande ?', text: 'Elle passe en « Annulée ». Pour rendre l’argent, utilisez aussi « Rembourser ».', ok: 'Annuler la commande' }) : Promise.resolve(confirm('Annuler cette commande ?'))).then(function (ok) { if (ok) go2(); }); }
      else go2();
      return;
    }
    if (a === 'csave') { saveContent(b); return; }
    if (a === 'cdiscard') { toShop({ type: 'discard' }); ED.changes = {}; drawFields(); countChanges(); return; }
    if (a === 'fsel') { toShop({ type: 'select', key: b.getAttribute('data-key') }); return; }
    if (a === 'fimg') { ED.imgKey = b.getAttribute('data-key'); var pk = document.getElementById('tx-imgpick'); if (pk) pk.click(); return; }
    if (a === 'freset') { var rk = b.getAttribute('data-key'); ED.changes[rk] = ''; toShop({ type: 'set', key: rk, value: '' }); drawFields(); countChanges(); return; }
    if (a === 'edmode') { ED.mode = b.getAttribute('data-mode'); var ed0 = document.getElementById('tx-ed'); if (ed0) ed0.classList.toggle('is-simple', ED.mode === 'simple'); document.querySelectorAll('[data-tx="edmode"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); return; }
    if (a === 'dev') { ED.device = b.getAttribute('data-dev'); var fr0 = document.querySelector('.tx-ed__frame'); if (fr0) fr0.setAttribute('data-dev', ED.device); document.querySelectorAll('[data-tx="dev"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); return; }
    if (a === 'retry') { T.error = null; refresh(); }
    else if (a === 'reload') { T.overview = null; refresh(); }
    else if (a === 'setup') { busy(b, true); call('setup').then(function (j) { toast(j.webhook ? 'Les commandes payées arrivent maintenant toutes seules.' : 'La réparation n’a pas marché.'); T.overview = null; refresh(); }, function (x) { toast(x.message); busy(b, false); }); }
    else if (a === 'copy') { var t = document.getElementById(b.getAttribute('data-target')); if (t) { t.select(); try { navigator.clipboard.writeText(t.value); } catch (x) { document.execCommand('copy'); } toast('Message copié.'); } }
    else if (a === 'move') { busy(b, true); saveDoc('moveProduct', { id: b.getAttribute('data-id'), direction: b.getAttribute('data-dir') }, 'Ordre enregistré.'); }
    else if (a === 'pdel' || a === 'cdel') {
      var u = U(), what = a === 'pdel' ? 'ce produit' : 'ce code';
      (u ? u.confirmBox({ title: 'Supprimer ' + what + ' ?', text: 'Il disparaît de theivorysukundu.com.', ok: 'Supprimer' }) : Promise.resolve(confirm('Supprimer ' + what + ' ?'))).then(function (ok) {
        if (!ok) return;
        if (a === 'pdel') saveDoc('deleteProduct', { id: b.getAttribute('data-id') }, 'Produit supprimé.', function () { go('#produits'); });
        else saveDoc('deleteCode', { code: b.getAttribute('data-code') }, 'Code supprimé.', function () { go('#promos'); });
      });
    }
    else if (a === 'vadd') { var tb = b.closest('form').querySelector('.tx-vtable tbody'), last = tb.lastElementChild, row = last.cloneNode(true); row.querySelectorAll('input').forEach(function (i) { if (i.type === 'checkbox') i.checked = true; else i.value = ''; }); tb.appendChild(row); row.querySelector('input').focus(); }
    else if (a === 'vdel') { var tr = b.closest('tr'); if (tr.parentNode.children.length > 1) tr.remove(); else toast('Un produit garde au moins une option.'); }
    else if (a === 'mdel') { draftMedia.splice(+b.getAttribute('data-i'), 1); keepForm(b); }
    else if (a === 'mmove') { var i = +b.getAttribute('data-i'), m = draftMedia.splice(i, 1)[0]; draftMedia.splice(i - 1, 0, m); keepForm(b); }
    else if (a === 'signout') { lsDel(K_AUTH); reset(); toast('Boutique déconnectée de ce navigateur.'); go('#accueil'); }
  });
  // photos are redrawn without losing what was typed: the media list only
  function keepForm(b) {
    var form = b.tagName === 'FORM' ? b : b.closest('form');
    var ul = form && form.querySelector('.tx-medias');
    if (!ul) return;
    ul.innerHTML = draftMedia.map(function (m, i) {
      return '<li class="tx-media"><img alt="" src="' + esc(src(m.previewUrl || m.url)) + '"><span class="tx-tight">' +
        '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="mmove" data-i="' + i + '" data-dir="-1"' + (i ? '' : ' disabled') + ' aria-label="Avant">' + ico('chev-left') + '</button>' +
        '<button class="a-btn a-btn--quiet a-btn--sm" type="button" data-tx="mdel" data-i="' + i + '" aria-label="Retirer">' + ico('trash') + '</button></span></li>';
    }).join('');
  }
  document.addEventListener('change', function (e) {
    var inp = e.target.closest && e.target.closest('#a-main [data-tx-upload]');
    if (!inp || !on()) return;
    upload(inp.files, inp.closest('form'));
    inp.value = '';
  });

  /* ------------------------------------------------------------------ the switch */

  function on() { return lsGet(K_ON) === 'tishe'; }
  function enter() { lsSet(K_ON, 'tishe'); T.error = null; }
  function leave() { lsDel(K_ON); }
  function todo() { var st = T.overview && T.overview.stats; return st && st.todo ? Number(st.todo.toOrder) || 0 : 0; }

  window.JeereTishe = {
    on: on, enter: enter, leave: leave, view: view, todo: todo, signedIn: function () { return !!auth(); },
    name: 'The Ivory Sukundu', url: 'theivorysukundu.com', site: SITE,
    thumb: '../studio/sites/thumbs/live--the-ivory-sukundu.webp'
  };
})();
