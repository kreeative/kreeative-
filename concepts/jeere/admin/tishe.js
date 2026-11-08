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
  function auth() { try { var a = JSON.parse(lsGet(K_AUTH) || 'null'); return a && a.token && (!a.expiresAt || a.expiresAt > Date.now()) ? a : null; } catch (e) { return null; } }

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
      lsSet(K_AUTH, JSON.stringify({ token: j.token, expiresAt: j.expiresAt, email: j.email }));
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
      lsSet(K_AUTH, JSON.stringify({ token: j.token, expiresAt: j.expiresAt, email: j.email }));
      T.error = null;
    }, function () { /* not signed in to Jeere, or the store does not know this door yet: the email link */ T.error = null; })
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
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('mail') + (T.linkSent ? 'Renvoyer le lien' : 'Recevoir le lien de connexion') + '</button>' +
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

  function homeView() {
    need('overview', 'overview');
    var o = T.overview;
    if (!o) return loading('The Ivory Sukundu');
    var s = o.stats, setup = o.setup || {};
    var warn = [];
    if (!setup.stripe) warn.push('Stripe n’est pas encore branché : aucune commande ne peut être payée.');
    else if (setup.testMode) warn.push('Stripe est en mode test : les paiements ne sont pas réels.');
    if (setup.stripe && !setup.webhook) warn.push('Les commandes payées n’arrivent pas toutes seules. <button class="a-btn a-btn--sm a-btn--ghost" type="button" data-tx="setup">Réparer</button>');
    if (!setup.resend) warn.push('Les e-mails aux clientes ne partent pas (Resend n’est pas branché).');
    var recent = (o.orders || []).slice(0, 6);
    return page('The Ivory Sukundu', 'Vos ventes et vos commandes, en dollars canadiens, avant taxes.',
      (warn.length ? '<section class="a-card a-tone--warn">' + warn.map(function (w) { return '<p class="a-card__sub">' + w + '</p>'; }).join('') + '</section>' : '') +
      '<div class="a-kpis">' +
        kpi('wallet', 'Ventes ce mois-ci', dollars(s.thisMonth.sales), plural(s.thisMonth.orders, 'commande', 'commandes')) +
        kpi('chart', 'Mois dernier', dollars(s.lastMonth.sales), plural(s.lastMonth.orders, 'commande', 'commandes')) +
        kpi('bag', 'Panier moyen', dollars(s.allTime.average), plural(s.allTime.orders, 'commande', 'commandes') + ' en tout', '') +
        kpi('clock', 'À commander chez le fournisseur', String(s.todo.toOrder), 'Commandes payées, pas encore passées', '#commandes?statut=new') +
        kpi('truck', 'En attente du suivi', String(s.todo.awaitingTracking), 'Commandées, sans numéro de suivi', '#commandes?statut=ordered') +
      '</div>' +
      card(recent.length ? '<ul class="a-rows">' + recent.map(orderRow).join('') + '</ul><div class="a-card__foot"><a class="a-btn a-btn--ghost" href="#commandes">Toutes les commandes</a></div>'
        : '<p class="a-card__sub">Aucune commande pour l’instant.</p>', 'Dernières commandes'),
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
        : card('<p class="a-card__sub">Aucune commande ici.</p>')),
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
    var o = d.order, a = o.shipping;
    var items = (o.items || []).map(function (i) {
      return '<li class="a-row">' + (i.image ? '<span class="a-pthumb"><img alt="" src="' + esc(src(i.image)) + '"></span>' : '') +
        '<span class="a-row__main"><span class="a-row__title">' + esc(i.title) + '</span><span class="a-row__meta">' + esc([i.variant, '× ' + i.quantity].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="a-num">' + esc(cents(i.total, o.currency)) + '</span></li>';
    }).join('');
    var line = function (k, v) { return '<div class="tx-dl__row"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>'; };
    var totals = '<dl class="tx-dl">' + line('Sous-total', esc(cents(o.subtotal, o.currency))) +
      (o.discount ? line('Réduction' + (o.code ? ' (' + o.code + ')' : ''), '−' + esc(cents(o.discount, o.currency))) : '') +
      line('Livraison', esc(cents(o.shippingAmount, o.currency))) + (o.tax ? line(o.taxLabel || 'Taxes', esc(cents(o.tax, o.currency))) : '') +
      line('Total', '<strong>' + esc(cents(o.total, o.currency)) + '</strong>') +
      (o.settled ? line('Reçu sur le compte', esc(cents(o.net, 'CAD')) + ' <span class="a-muted">(frais Stripe ' + esc(cents(o.fee, 'CAD')) + ')</span>') : '') + '</dl>';
    var addr = a ? [a.name, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(' '), a.country].filter(Boolean).map(esc).join('<br>') : 'Adresse manquante';
    var opts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + esc(STATUS[k][0]) + '</option>'; }).join('');
    var sup = (d.supplierMessages || []).map(function (m, i) {
      return '<div class="a-field"><label class="a-label" for="tx-sup' + i + '">Message pour ' + esc(m.name) + '</label><textarea class="a-input" id="tx-sup' + i + '" rows="7" readonly>' + esc(m.message) + '</textarea>' +
        '<div class="a-btnrow"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-tx="copy" data-target="tx-sup' + i + '">' + ico('copy') + 'Copier le message</button></div></div>';
    }).join('');
    return page('Commande #' + (o.number || '—'), esc(dayTime(o.createdAt)) + ' · ' + pill(o.status) + (o.refunded ? ' <span class="a-pill a-tone--muted">Remboursée</span>' : ''),
      '<div class="a-cols">' +
        card('<ul class="a-rows">' + items + '</ul>' + totals, 'Articles') +
        card('<p><strong>' + esc(o.name) + '</strong><br><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' + (o.phone ? '<br>' + esc(o.phone) : '') + '</p><p class="a-card__sub">' + addr + '</p>' +
          (o.stripeUrl ? '<a class="a-btn a-btn--ghost a-btn--sm" href="' + esc(o.stripeUrl) + '" target="_blank" rel="noopener">' + ico('external') + 'Voir le paiement dans Stripe</a>' : ''), 'Cliente') +
      '</div>' +
      card('<form data-txform="order" data-id="' + esc(o.id) + '" novalidate>' +
        field('tx-st', 'Statut', '<div class="a-selectwrap"><select class="a-input" id="tx-st" name="status">' + opts + '</select>' + ico('down') + '</div>') +
        field('tx-ref', 'Référence chez le fournisseur', input('tx-ref', 'supplierRef', o.supplierRef)) +
        '<div class="a-cols">' + field('tx-car', 'Transporteur', input('tx-car', 'carrier', o.carrier, ' placeholder="DHL, Canada Post…"')) +
        field('tx-trk', 'Numéro de suivi', input('tx-trk', 'tracking', o.tracking), o.trackingUrl ? '<a href="' + esc(o.trackingUrl) + '" target="_blank" rel="noopener">Suivre le colis</a>' : 'Avec un numéro, la commande passe en « Expédiée ».') + '</div>' +
        field('tx-note', 'Note (pour vous seulement)', '<textarea class="a-input" id="tx-note" name="note" rows="3">' + esc(o.note) + '</textarea>') +
        check('notify', !o.shippedAt, 'Envoyer à la cliente l’e-mail avec son numéro de suivi') +
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('check') + 'Enregistrer</button></div></form>', 'Suivi de la commande') +
      (sup ? card(sup, 'Commander chez le fournisseur') : ''),
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
    return page('Boutique en ligne', 'Le bandeau en haut de theivorysukundu.com et les soldes.',
      '<form data-txform="site" novalidate>' +
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
        '<div class="a-btnrow"><button class="a-btn a-btn--primary" type="submit">' + ico('mail') + 'Envoyer depuis la boutique</button></div></form>', 'Écrire à une cliente'));
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

  function view(r) {
    if (!auth()) return signInView();
    switch (r.name) {
      case 'accueil': return homeView();
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
    return call(action, body).then(function (j) { if (j.doc && T.store) T.store.doc = j.doc; toast(msg); if (after) after(j); refresh(); }, function (e) { toast(e.message); });
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
    } else if (kind === 'email') {
      call('email', { to: el.to.value, subject: el.subject.value, message: el.message.value }).then(function () { toast('E-mail envoyé.'); f.reset(); }, function (x) { toast(x.message); }).then(done);
    } else done();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#a-main [data-tx]');
    if (!b || !on()) return;
    var a = b.getAttribute('data-tx');
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
  function todo() { return T.overview ? T.overview.stats.todo.toOrder : 0; }

  window.JeereTishe = {
    on: on, enter: enter, leave: leave, view: view, todo: todo, signedIn: function () { return !!auth(); },
    name: 'The Ivory Sukundu', url: 'theivorysukundu.com', site: SITE,
    thumb: '../studio/sites/thumbs/live--the-ivory-sukundu.webp'
  };
})();
