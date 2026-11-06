/*
 * Jeere — admin/domaines.js: the dashboard's « Paramètres › Domaine » page (classic script, deferred).
 * Global: window.JeereAdminDomains = { html(ctx), mount(ctx), state() }. admin.js calls html() from
 * setDomaine() and mount() once the page is in the DOM; this file then redraws its own part (#a-dm).
 *
 * ctx (from admin.js): { config(), admin(), save(), toast(msg, opts), storeName(), address(), openPublish() }
 * Uses ../creer/domains.js (JeereDomains) and ../creer/publish.js (JeerePublish), and admin.css's classes.
 *
 * Three cards:
 *   1. Votre adresse Jeere: jeere.kreeative.xyz/b/<slug>, online or not, « Publier ».
 *   2. Votre propre nom de domaine (bought elsewhere): the exact records to add, a guide per registrar,
 *      « Vérifier » (DNS-over-HTTPS from the browser, each record ✓ / ✗), then the `domains` Edge Function
 *      attaches it to the Vercel project (or answers « pas encore configuré »: the team does it).
 *   3. Acheter un nom de domaine: search, availability, price in FCFA, « Acheter » → the demo checkout
 *      (../abonnements/?domaine=…#domaine). The real purchase is a team-only server call (README « Domaines »).
 * Saved in 'jeere-admin': settings.customDomain, connectors.domain (as before) and domain = { status,
 * checkedAt, records: { a, www, sub }, message }; domainOrders = [...] is written by the checkout.
 */
(function () {
  'use strict';

  var J = window.JeereDomains, P = window.JeerePublish;
  var NB = ' ';
  var ctx = null;
  var st = { checking: false, check: null, attaching: false, server: null, q: '', searching: false, found: null, error: '', formError: '', guide: '' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fr(s) { return String(s == null ? '' : s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function ico(n) { return '<svg class="a-ico" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
  function money(n) { return J ? J.money(n).replace(/ /g, NB) : n + NB + 'FCFA'; }
  function adm() { return ctx ? ctx.admin() : null; }
  function dom() {
    var a = adm();
    if (!a) return { status: 'none' };
    if (!a.domain || typeof a.domain !== 'object') a.domain = { status: a.settings.customDomain ? 'pending' : 'none' };
    return a.domain;
  }
  var STATUS = {
    none: null,
    pending: { tone: 'warn', icon: 'clock', label: 'À configurer' },
    dns_ok: { tone: 'info', icon: 'check', label: 'DNS correct' },
    waiting_team: { tone: 'info', icon: 'clock', label: 'Relié par l’équipe sous 24 h' },
    attached: { tone: 'info', icon: 'clock', label: 'En cours de vérification' },
    verified: { tone: 'ok', icon: 'check', label: 'En ligne' },
    error: { tone: 'err', icon: 'alert', label: 'À corriger' }
  };
  function pill(s) { var x = STATUS[s]; return x ? '<span class="a-pill a-pill--check a-tone--' + x.tone + '">' + ico(x.icon) + esc(fr(x.label)) + '</span>' : ''; }

  /* ---------------------------------------------------------------- 1. the free address */

  function freeCard() {
    var rec = P ? P.local() : null;
    var on = !!(rec && rec.published && rec.storeId);
    var addr = on ? P.address(rec.slug) : (ctx.address() || '');
    return '<section class="a-card" aria-labelledby="h-dfree"><div class="a-card__head"><div><h3 class="a-card__title" id="h-dfree">Votre adresse Jeere <span class="a-chip">Gratuite</span></h3>' +
      '<p class="a-card__sub">' + esc(fr('Incluse dans toutes les formules, avec le cadenas de sécurité (https).')) + '</p></div></div>' +
      '<div class="a-domain">' + ico('globe') + '<span class="a-domain__name">' + esc(addr) + '</span>' +
      (on ? '<span class="a-pill a-pill--check a-tone--ok">' + ico('check') + 'En ligne</span>' : '<span class="a-pill a-pill--check a-tone--warn">' + ico('clock') + 'Pas encore en ligne</span>') + '</div>' +
      '<div class="a-btnrow" style="margin-top:12px">' +
      '<button class="a-btn ' + (on ? 'a-btn--ghost' : 'a-btn--primary') + '" type="button" data-dm="publish">' + ico('rocket') + (on ? 'Gérer la publication' : 'Choisir l’adresse et publier') + '</button>' +
      (on ? '<a class="a-btn a-btn--quiet" href="' + esc(P.url(rec.slug)) + '" target="_blank" rel="noopener">' + ico('external') + 'Ouvrir</a>' : '') + '</div>' +
      (on ? '' : '<p class="a-small" style="margin-top:10px">' + esc(fr('Tant qu’elle n’est pas publiée, votre boutique est enregistrée dans ce navigateur seulement.')) + '</p>') +
      '</section>';
  }

  /* ---------------------------------------------------------------- 2. her own domain */

  function recordRows(list, results) {
    var byId = {};
    (results || []).forEach(function (r) { byId[r.id] = r; });
    return '<ul class="dm-recs">' + list.map(function (r) {
      var res = byId[r.id];
      var verdict = res ? (res.ok
        ? '<span class="dm-ok">' + ico('check') + 'Trouvé</span>'
        : '<span class="dm-ko">' + ico('x') + (res.found && res.found.length ? esc(fr('Pas encore : trouvé ' + res.found.slice(0, 2).join(', '))) : 'Pas encore trouvé') + '</span>') : '';
      return '<li class="dm-rec" data-rec="' + esc(r.id) + '"><div class="dm-rec__grid">' +
        '<div><span class="dm-k">Type</span><span class="dm-v">' + esc(r.type) + '</span></div>' +
        '<div><span class="dm-k">Nom (hôte)</span><span class="dm-v">' + esc(r.name) + '</span></div>' +
        '<div class="dm-rec__val"><span class="dm-k">Valeur</span><span class="dm-v">' + esc(r.value) + '</span></div>' +
        '<button class="a-btn a-btn--ghost a-btn--sm dm-copy" type="button" data-dm="copy" data-v="' + esc(r.value) + '" aria-label="' + esc('Copier ' + r.value) + '">' + ico('copy') + 'Copier</button>' +
        '</div><p class="dm-rec__foot"><span class="a-small">' + esc(r.required ? 'Obligatoire' : 'Conseillé : ' + (r.id === 'www' ? 'pour que www mène aussi à votre boutique' : 'pour que l’adresse sans www marche aussi')) + '</span>' + verdict + '</p></li>';
    }).join('') + '</ul>';
  }
  function guides() {
    return '<div class="dm-guides"><p class="a-label" style="margin-top:16px">Pas à pas chez votre registraire</p>' +
      J.REGISTRARS.map(function (g) {
        return '<details class="dm-guide"' + (st.guide === g.id ? ' open' : '') + ' data-guide="' + esc(g.id) + '"><summary>' + esc(g.name) + ico('down') + '</summary><ol>' +
          g.steps.map(function (s) { return '<li>' + esc(fr(s)) + '</li>'; }).join('') + '</ol></details>';
      }).join('') +
      '<p class="a-small" style="margin-top:8px">' + esc(fr('Un autre registraire ? C’est le même réglage, dans sa page « DNS » ou « Zone DNS ». Les changements prennent de quelques minutes à 48 h.')) + '</p></div>';
  }
  function serverNote() {
    var s = st.server;
    if (st.attaching) return '<div class="a-note a-note--line" role="status">' + ico('clock') + '<p>' + esc('Connexion au serveur Jeere…') + '</p></div>';
    if (!s) return '';
    if (s.ok && s.configured === false) {
      return '<div class="a-note a-note--line" role="status">' + ico('info') + '<p><strong>' + esc(fr('Domaine enregistré pour votre boutique.')) + '</strong> ' +
        esc(fr('La liaison automatique avec notre hébergeur n’est pas encore configurée : l’équipe Jeere relie votre domaine à la main, en général sous 24 h. Vous n’avez rien d’autre à faire que le réglage DNS ci-dessus.')) + '</p></div>';
    }
    if (s.ok) {
      var v = (s.verification || []).filter(function (x) { return x && x.value; });
      return '<div class="a-note a-note--line" role="status">' + ico(s.status === 'verified' ? 'check' : 'info') + '<p>' +
        esc(fr(s.status === 'verified' ? 'Votre domaine est relié : votre boutique est en ligne à cette adresse, avec le cadenas https.' : 'Votre domaine est relié à Jeere. Dès que le DNS est bon, le cadenas https se crée tout seul (quelques minutes).')) + '</p>' +
        (v.length ? '<p>' + esc(fr('Ce domaine est déjà utilisé ailleurs : ajoutez aussi cet enregistrement de vérification : ')) + v.map(function (x) { return '<span class="dm-code">' + esc(x.type + ' ' + x.name + ' ' + x.value) + '</span>'; }).join(' ') + '</p>' : '') + '</div>';
    }
    if (s.code === 'unpublished' || s.code === 'login') return '<div class="a-note a-note--strong" role="status">' + ico('alert') + '<p>' + esc(fr(s.message)) + '</p>' + (s.code === 'unpublished' ? '<p style="margin-top:8px"><button class="a-btn a-btn--ghost a-btn--sm" type="button" data-dm="publish">Publier ma boutique</button></p>' : '') + '</div>';
    return '<div class="a-note a-note--err" role="alert">' + ico('alert') + '<p>' + esc(fr(s.message || 'Le serveur Jeere n’a pas pu relier le domaine.')) + '</p></div>';
  }
  function ownCard() {
    var a = adm();
    var d = a ? a.settings.customDomain : '';
    var head = '<div class="a-card__head"><div><h3 class="a-card__title" id="h-dcust">Votre propre nom de domaine</h3><p class="a-card__sub">' +
      esc(fr('Acheté chez GoDaddy, Namecheap, Hostinger, OVHcloud, Cloudflare… : votre boutique à votre adresse, par exemple awabeaute.com.')) + '</p></div></div>';
    if (!d) {
      return '<section class="a-card" aria-labelledby="h-dcust">' + head +
        '<form class="a-form" data-form="dm-add" data-light novalidate><div class="a-field"><label class="a-label" for="dm-domain">Votre nom de domaine</label>' +
        '<input class="a-input" id="dm-domain" name="domain" maxlength="253" placeholder="awabeaute.com" autocapitalize="off" spellcheck="false" autocomplete="off" inputmode="url"' + (st.formError ? ' aria-invalid="true" aria-describedby="dm-domain-err"' : ' aria-describedby="dm-domain-h"') + '>' +
        (st.formError ? '<p class="a-error" id="dm-domain-err">' + esc(st.formError) + '</p>' : '<p class="a-hint" id="dm-domain-h">' + esc(fr('Sans « https:// » : awabeaute.com, www.awabeaute.com ou boutique.awabeaute.ci.')) + '</p>') + '</div>' +
        '<div class="a-formfoot"><button class="a-btn a-btn--primary" type="submit">' + ico('link') + 'Continuer</button></div></form>' +
        '<p class="a-small" style="margin-top:12px">' + esc(fr('Pas encore de domaine ? Achetez-le avec Jeere, plus bas : nous faisons le réglage pour vous.')) + '</p></section>';
    }
    var info = dom();
    var list = J.records(d);
    var c = st.check;
    var verdict = '';
    if (c) {
      verdict = c.ok
        ? '<div class="a-note a-note--line" role="status">' + ico('check') + '<p><strong>' + esc(fr('Le réglage DNS est bon.')) + '</strong> ' + esc(fr(c.all ? 'Toutes les adresses mènent à Jeere.' : 'L’enregistrement conseillé manque encore, mais votre domaine fonctionne.')) + '</p></div>'
        : '<div class="a-note a-note--strong" role="status">' + ico('alert') + '<p><strong>' + esc(fr('Pas encore bon.')) + '</strong> ' + esc(fr(c.error ? 'La vérification n’a pas pu se faire (pas de connexion) : réessayez.' : 'Ajoutez les enregistrements marqués ✗ chez votre registraire, puis revérifiez. Un changement peut mettre jusqu’à 48 h à se voir.')) + '</p></div>';
    }
    return '<section class="a-card" aria-labelledby="h-dcust">' + head +
      '<div class="a-domain">' + ico('link') + '<span class="a-domain__name">' + esc(d) + '</span>' + pill(info.status) + '</div>' +
      '<ol class="dm-steps">' +
      '<li><p class="a-label">' + esc(fr('Ajoutez ' + (list.length > 1 ? 'ces enregistrements' : 'cet enregistrement') + ' dans la zone DNS de votre domaine')) + '</p>' + recordRows(list, c ? c.records : null) + guides() + '</li>' +
      '<li><p class="a-label">Vérifiez</p><p class="a-small">' + esc(fr('Nous regardons votre DNS depuis Internet (Google Public DNS), comme vos clients.')) + '</p>' +
      '<div class="a-btnrow" style="margin-top:10px"><button class="a-btn a-btn--primary" type="button" data-dm="verify"' + (st.checking ? ' disabled' : '') + '>' + ico('refresh') + (st.checking ? 'Vérification…' : 'Vérifier') + '</button>' +
      (info.checkedAt ? '<span class="a-small">' + esc(fr('Dernière vérification : ' + when(info.checkedAt))) + '</span>' : '') + '</div>' + verdict + serverNote() + '</li></ol>' +
      '<div class="a-btnrow" style="margin-top:16px"><button class="a-btn a-btn--quiet a-btn--sm" type="button" data-dm="remove">' + ico('trash') + 'Retirer ce domaine</button></div></section>';
  }
  function when(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + NB + 'min';
    return d.getUTCDate() + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + ' à ' + d.getUTCHours() + NB + 'h' + NB + String(d.getUTCMinutes()).padStart(2, '0');
  }

  /* ---------------------------------------------------------------- 3. buying a domain */

  var FOUND = {
    free: { tone: 'ok', icon: 'check', label: 'Disponible' },
    likely: { tone: 'info', icon: 'info', label: 'Probablement libre' },
    taken: { tone: 'err', icon: 'x', label: 'Déjà pris' },
    unknown: { tone: 'warn', icon: 'alert', label: 'À vérifier' },
    request: { tone: 'info', icon: 'clock', label: 'Sur demande' }
  };
  function buyCard() {
    var r = st.found;
    var rows = '';
    if (r && r.ok) {
      rows = '<ul class="dm-results" aria-live="polite">' + r.results.map(function (x) {
        var f = FOUND[x.status] || FOUND.unknown;
        var promo = x.renew && x.buy && x.renew !== x.buy;
        var canBuy = x.status === 'free' || x.status === 'likely';
        return '<li class="dm-res"><div class="dm-res__main"><span class="dm-res__name">' + esc(x.domain) + '</span>' +
          '<span class="a-pill a-pill--check a-tone--' + f.tone + '">' + ico(f.icon) + esc(f.label) + '</span></div>' +
          '<div class="dm-res__price">' + (x.buy ? '<b>' + esc(money(x.buy)) + '</b><span class="a-small">' + esc(x.status === 'request' ? 'par an, environ' : (promo ? 'la 1re année, puis ' + money(x.renew) + ' par an' : 'par an')) + '</span>' : '') + '</div>' +
          (canBuy ? '<a class="a-btn a-btn--primary a-btn--sm" href="../abonnements/?domaine=' + encodeURIComponent(x.domain) + '#domaine" aria-label="' + esc('Acheter ' + x.domain) + '">' + ico('bag') + 'Acheter</a>'
            : (x.status === 'request' ? '<span class="a-small dm-res__note">' + esc(fr(x.note)) + '</span>' : '')) + '</li>';
      }).join('') + '</ul>' +
      (r.configured ? '' : '<p class="a-small" style="margin-top:8px">' + ico('info') + ' ' + esc(fr('« Probablement libre » : nous regardons si le nom existe sur Internet. Vérification finale par l’équipe avant l’achat ; si le nom est pris, vous êtes remboursée.')) + '</p>');
    } else if (r && !r.ok) {
      rows = '<p class="a-error" role="alert">' + esc(fr(r.message)) + '</p>';
    }
    var orders = (adm() && Array.isArray(adm().domainOrders)) ? adm().domainOrders : [];
    return '<section class="a-card" aria-labelledby="h-dbuy"><div class="a-card__head"><div><h3 class="a-card__title" id="h-dbuy">Acheter un nom de domaine avec Jeere</h3>' +
      '<p class="a-card__sub">' + esc(fr('Nous l’achetons à votre nom, nous le relions à votre boutique et nous le renouvelons avec vous. Paiement par mobile money.')) + '</p></div></div>' +
      '<form class="a-form" data-form="dm-search" data-light novalidate role="search"><div class="a-field"><label class="a-label" for="dm-q">Le nom que vous voulez</label>' +
      '<div class="dm-search"><input class="a-input" id="dm-q" name="q" maxlength="63" placeholder="awabeaute" value="' + esc(st.q) + '" autocapitalize="off" spellcheck="false" autocomplete="off">' +
      '<button class="a-btn a-btn--primary" type="submit"' + (st.searching ? ' disabled' : '') + '>' + ico('search') + (st.searching ? 'Recherche…' : 'Rechercher') + '</button></div></div></form>' + rows +
      '<details class="dm-guide dm-why"><summary>Prix, renouvellement : comment ça marche ?' + ico('down') + '</summary><ul>' +
      '<li>' + esc(fr('Le prix affiché comprend le domaine pour un an, sa liaison à votre boutique et le cadenas https.')) + '</li>' +
      '<li>' + esc(fr('Certaines extensions (.shop, .store, .online, .site) sont moins chères la première année : le prix de renouvellement est indiqué à côté. Le .com garde le même prix chaque année.')) + '</li>' +
      '<li>' + esc(fr('Le domaine est à vous : il est enregistré à votre nom. Vous pouvez le transférer ailleurs quand vous voulez (après 60 jours, la règle de l’ICANN).')) + '</li>' +
      '<li>' + esc(fr('Nous vous prévenons sur WhatsApp 30 jours avant l’échéance. Sans paiement, le domaine n’est pas renouvelé ; votre adresse Jeere gratuite, elle, reste.')) + '</li>' +
      '<li>' + esc(fr('Le .ci passe par un bureau d’enregistrement ivoirien agréé par l’ARTCI : sur demande.')) + '</li></ul></details>' +
      (orders.length ? '<div class="dm-orders"><p class="a-label" style="margin-top:16px">Vos commandes de domaines</p><ul>' + orders.map(function (o) {
        return '<li><span class="dm-res__name">' + esc(o.domain) + '</span><span class="a-small">' + esc(money(o.amount) + ' · ' + (o.demo ? 'démo : rien n’a été prélevé ni acheté' : (o.status || ''))) + '</span></li>';
      }).join('') + '</ul></div>' : '') +
      '<div class="a-note a-note--line" style="margin-top:14px">' + ico('info') + '<p>' + esc(fr('Démo : le paiement est simulé et aucun domaine n’est acheté. Dans Jeere, l’achat réel est fait par notre serveur après votre paiement.')) + '</p></div></section>';
  }

  /* ---------------------------------------------------------------- render + events */

  function html(c) {
    ctx = c || ctx;
    if (!J || !ctx || !adm()) return '<section class="a-card"><p>' + esc('Cette page n’a pas pu se charger : rechargez.') + '</p></section>';
    return '<div id="a-dm" class="a-stack">' + freeCard() + ownCard() + buyCard() + '</div>';
  }
  function redraw(focusSel) {
    var root = document.getElementById('a-dm');
    if (!root) return;
    var y = window.scrollY;
    var openGuides = Array.prototype.map.call(root.querySelectorAll('details[open][data-guide]'), function (d) { return d.getAttribute('data-guide'); });
    st.guide = openGuides[0] || st.guide;
    root.outerHTML = html(ctx);
    try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
    if (focusSel) { var f = document.querySelector(focusSel); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }

  function saveDomain(domain) {
    var a = adm();
    a.settings.customDomain = domain;
    var was = a.connectors && a.connectors.domain;
    a.connectors = a.connectors || {};
    a.connectors.domain = { status: domain ? 'connected' : 'off', values: { domain: domain }, connectedAt: (was && was.connectedAt) || new Date().toISOString() };
    a.domain = { status: domain ? 'pending' : 'none' };
    ctx.save();
  }

  // Ask the server to attach it (only possible once the store is published by a signed-in seller)
  function attach(action) {
    var rec = P ? P.local() : null;
    var a = adm();
    if (!rec || !rec.storeId) {
      st.server = { ok: false, code: 'unpublished', message: 'Pour que Jeere relie ce domaine à votre boutique, publiez-la d’abord (avec votre compte). Le réglage DNS, lui, peut se faire dès maintenant.' };
      redraw();
      return Promise.resolve();
    }
    st.attaching = true;
    redraw();
    return J.fn(action, { storeId: rec.storeId, domain: a.settings.customDomain }).then(function (r) {
      st.attaching = false;
      st.server = r;
      if (r && r.ok && r.status) { dom().status = r.status === 'waiting_team' && dom().status === 'dns_ok' ? 'waiting_team' : r.status; ctx.save(); }
      redraw();
    });
  }

  function onAdd(form) {
    var v = J.validate(form.elements.domain.value);
    if (!v.ok) { st.formError = v.message; redraw('#dm-domain'); return; }
    st.formError = ''; st.check = null; st.server = null;
    saveDomain(v.domain);
    ctx.toast('Domaine ajouté. Faites le réglage DNS, puis « Vérifier ».');
    redraw('[data-dm="copy"]');
    attach('attach');
  }
  function onVerify() {
    var d = adm().settings.customDomain;
    if (!d || st.checking) return;
    st.checking = true;
    redraw('[data-dm="verify"]');
    J.check(d).then(function (c) {
      st.checking = false;
      st.check = c;
      var info = dom();
      info.checkedAt = new Date().toISOString();
      info.records = {};
      c.records.forEach(function (r) { info.records[r.id] = r.ok; });
      if (c.ok && (info.status === 'pending' || info.status === 'error' || info.status === 'none')) info.status = 'dns_ok';
      if (!c.ok && info.status === 'dns_ok') info.status = 'pending';
      ctx.save();
      redraw('[data-dm="verify"]');
      if (c.ok) attach(info.status === 'attached' || info.status === 'verified' ? 'verify' : 'attach');
    });
  }
  function onRemove() {
    var d = adm().settings.customDomain;
    var ask = ctx.confirm ? ctx.confirm({ title: 'Retirer ' + d + ' ?', text: 'Votre boutique reste sur ' + (ctx.address() || 'son adresse Jeere') + '.', ok: 'Retirer le domaine' })
      : Promise.resolve(window.confirm(fr('Retirer ' + d + ' ?')));
    ask.then(function (yes) {
      if (!yes) return;
      var rec = P ? P.local() : null;
      if (rec && rec.storeId) J.fn('detach', { storeId: rec.storeId });
      saveDomain('');
      st.check = null; st.server = null;
      ctx.toast('Domaine retiré.');
      redraw('#dm-domain');
    });
  }
  function onSearch(form) {
    var q = String(form.elements.q.value || '').trim();
    st.q = q;
    if (!q) { st.found = { ok: false, message: 'Écrivez le nom que vous voulez, par exemple awabeaute.' }; redraw('#dm-q'); return; }
    st.searching = true;
    redraw('#dm-q');
    J.search(q).then(function (r) { st.searching = false; st.found = r; redraw('.dm-results'); });
  }
  function copy(v, btn) {
    var done = function () { ctx.toast('Copié : ' + v); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { ctx.toast('Sélectionnez la valeur puis copiez-la.'); });
      else ctx.toast('Sélectionnez la valeur puis copiez-la.');
    } catch (e) { ctx.toast('Sélectionnez la valeur puis copiez-la.'); }
    if (btn) btn.setAttribute('data-copied', '1');
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-dm]') : null;
    if (!t || !document.getElementById('a-dm') || !document.getElementById('a-dm').contains(t)) return;
    var a = t.getAttribute('data-dm');
    if (a === 'copy') copy(t.getAttribute('data-v'), t);
    else if (a === 'verify') onVerify();
    else if (a === 'remove') onRemove();
    else if (a === 'publish') ctx.openPublish();
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.getAttribute || !document.getElementById('a-dm') || !document.getElementById('a-dm').contains(f)) return;
    var k = f.getAttribute('data-form');
    if (k === 'dm-add') { e.preventDefault(); onAdd(f); }
    else if (k === 'dm-search') { e.preventDefault(); onSearch(f); }
  });
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.getAttribute && d.getAttribute('data-guide') && d.open) st.guide = d.getAttribute('data-guide');
  }, true);

  function mount(c) {
    ctx = c || ctx;
    // Pick up a published store (another tab, the editor) and a status the server already knows
    if (P && P.local() && P.local().storeId && adm() && adm().settings.customDomain && !st.server && !st.attaching) {
      var info = dom();
      if (info.status === 'dns_ok' || info.status === 'waiting_team') st.server = null;
    }
  }

  window.JeereAdminDomains = { html: html, mount: mount, state: function () { return JSON.parse(JSON.stringify(st)); } };
})();
