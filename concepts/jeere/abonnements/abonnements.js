/* Jeere — « Abonnements Studio »: the pricing page and its checkout (plan → period → payment →
 * confirmation). Everything comes from ../studio/plans.js (JeerePlans, JeereBilling): the plans,
 * the prices, the comparison table, the subscription saved in the account. The checkout goes
 * through JeereBilling.startCheckout, whose only working provider today is the demo one.
 *
 * Deep links: ?plan=pro&periode=an#paiement opens the checkout on the payment step (the Studio's
 * upgrade sheet uses it, with &retour=studio to offer « Retour au Studio » at the end);
 * #comparer goes to the table. window.JeereAbonnements is there for tests.
 */
(function () {
  'use strict';

  var P = window.JeerePlans, B = window.JeereBilling;
  var doc = document;
  var NB = ' ';
  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(name, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  if (!P || !B) return;

  var params = {};
  (function () {
    var q = '';
    try { q = window.location.search.slice(1); } catch (e) { q = ''; }
    q.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  })();
  var fromStudio = params.retour === 'studio';
  var period = params.periode === 'mois' ? 'mois' : 'an';
  var col = 'pro';

  /* ---------------------------------------------------------------- the cards */

  function priceBlock(p) {
    if (!p.paid) return '<p class="sp__price ab-price"><b>0</b> FCFA</p><p class="ab-alt">Gratuit, sur votre boutique</p><p class="ab-fxline">Pour toujours</p>';
    var pr = P.price(p.id, period);
    return '<p class="sp__price ab-price"><b>' + esc(P.fcfa(pr.perMonth).replace(/ FCFA$/, '')) + '</b> FCFA / mois</p>' +
      '<p class="ab-alt">' + esc(period === 'an' ? 'Facturé ' + P.fcfa(pr.total) + ' par an' : 'Sans engagement, payé chaque mois') + '</p>' +
      '<p class="ab-fxline">≈' + NB + esc(P.eur(pr.perMonth)) + ' · ≈' + NB + esc(P.usd(pr.perMonth)) + ' par mois</p>';
  }
  function ctaFor(p, s) {
    if (!p.paid) {
      if (s.unlocked) return '<a class="btn ab-btn ab-btn--ghost" href="../studio/">Ouvrir le Studio</a>';
      if (s.trialAvailable) return '<button class="btn ab-btn ab-btn--ghost" type="button" data-trial>Essayer 14 jours gratuitement</button>';
      if (!s.signedIn) return '<a class="btn ab-btn ab-btn--ghost" href="../compte/?suite=studio#' + (s.hasAccount ? 'connexion' : 'inscription') + '">Essayer 14 jours gratuitement</a>';
      return '<a class="btn ab-btn ab-btn--ghost" href="../studio/">Ouvrir le Studio</a>';
    }
    var cur = (s.status === 'active' || s.status === 'canceling' || s.status === 'due') && s.paidPlan.id === p.id;
    if (cur && s.period === period && s.status !== 'due') return '<span class="btn ab-btn ab-btn--cur" aria-disabled="true">' + ico('check') + 'Votre formule</span>';
    var label = cur && s.status === 'due' ? 'Renouveler ' + p.name : (P.isDowngrade(p.id, period) ? 'Passer à ' + p.name : 'Choisir ' + p.name);
    return '<button class="btn ab-btn ' + (p.recommended ? 'ab-btn--primary' : 'ab-btn--ghost') + '" type="button" data-choose="' + esc(p.id) + '">' + esc(label) + '</button>';
  }
  function renderPlans() {
    var s = P.state();
    var box = $('ab-plans');
    if (!box) return;
    box.innerHTML = P.PLANS.map(function (p) {
      return '<article class="ab-plan' + (p.recommended ? ' ab-plan--pick' : '') + '" data-plan="' + esc(p.id) + '" aria-labelledby="pl-' + esc(p.id) + '">' +
        (p.recommended ? '<p class="ab-plan__flag">Le plus choisi</p>' : '') +
        '<h2 class="ab-plan__name" id="pl-' + esc(p.id) + '">' + esc(p.name) + '</h2>' +
        '<p class="ab-plan__for">' + esc(p.for) + '</p>' + priceBlock(p) +
        '<ul class="ab-plan__list">' + p.points.map(function (t) { return '<li>' + ico('check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
        '<div class="ab-plan__cta">' + ctaFor(p, s) + '</div></article>';
    }).join('');
  }

  function renderStatus() {
    var el = $('ab-status');
    if (!el) return;
    var s = P.state();
    if (!s.signedIn) { el.hidden = true; el.innerHTML = ''; return; }
    var who = s.account && s.account.firstName ? s.account.firstName + ', ' : '';
    var txt;
    if (s.status === 'trial') txt = 'votre essai du Studio court encore ' + s.daysLeft + NB + 'jour' + (s.daysLeft > 1 ? 's' : '') + ', jusqu’au ' + P.date(s.endsAt) + '.';
    else if (s.status === 'active') txt = 'vous êtes en Studio ' + s.plan.name + ' ' + (s.period === 'an' ? 'annuel' : 'mensuel') + ', renouvellement le ' + P.date(s.periodEnd) + '.';
    else if (s.status === 'canceling') txt = 'Studio ' + s.plan.name + ' jusqu’au ' + P.date(s.periodEnd) + ', puis Découverte (annulé).';
    else if (s.status === 'due') txt = 'votre Studio ' + s.plan.name + ' est à renouveler avant le ' + P.date(s.endsAt) + '.';
    else txt = 'vous êtes en Découverte (gratuit)' + (s.trialAvailable ? ' : votre essai de 14 jours vous attend.' : '.');
    el.hidden = false;
    el.innerHTML = '<span>' + esc(who.charAt(0).toUpperCase() + who.slice(1) + (who ? txt : txt.charAt(0).toUpperCase() + txt.slice(1))) + '</span>' +
      '<a href="../admin/#parametres/studio">Gérer mon abonnement</a>' + (s.unlocked ? '<a href="../studio/">Ouvrir le Studio</a>' : '');
  }

  /* ---------------------------------------------------------------- the comparison table */

  function cell(v) {
    if (v === true) return ico('check', 'ab-yes') + '<span class="vh">Inclus</span>';
    if (v === false) return ico('dash', 'ab-no') + '<span class="vh">Non inclus</span>';
    return esc(v);
  }
  function renderTable() {
    var wrap = $('ab-table');
    if (!wrap) return;
    var ids = P.PLANS.map(function (p) { return p.id; });
    var h = '<table class="ab-table"><caption class="vh">Comparaison des formules du Studio</caption><thead><tr><th scope="col" class="ab-table__feat">Fonction</th>' +
      P.PLANS.map(function (p) {
        var pr = P.price(p.id, period);
        return '<th scope="col" data-col="' + esc(p.id) + '"' + (p.recommended ? ' class="is-pick"' : '') + '><span class="ab-th__name">' + esc(p.name) + '</span><span class="ab-th__price">' + (p.paid ? esc(P.fcfa(pr.perMonth)) + ' / mois' : '0' + NB + 'FCFA') + '</span></th>';
      }).join('') + '</tr></thead><tbody>';
    P.COMPARE.forEach(function (r) {
      if (!Array.isArray(r)) { h += '<tr class="ab-group"><th scope="colgroup" colspan="5">' + esc(r.group) + '</th></tr>'; return; }
      h += '<tr><th scope="row">' + esc(r[0]) + '</th>' + ids.map(function (id, i) { return '<td data-col="' + esc(id) + '">' + cell(r[i + 1]) + '</td>'; }).join('') + '</tr>';
    });
    h += '</tbody></table>';
    wrap.innerHTML = h;
    wrap.setAttribute('data-col', col);
    var cols = $('ab-cols');
    if (cols) {
      cols.innerHTML = P.PLANS.map(function (p) { return '<button type="button" data-col-btn="' + esc(p.id) + '" aria-pressed="' + (p.id === col) + '">' + esc(p.name) + '</button>'; }).join('');
    }
  }

  function setPeriod(per) {
    period = per === 'mois' ? 'mois' : 'an';
    Array.prototype.forEach.call(doc.querySelectorAll('.ab-toggle [data-period]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-period') === period)); });
    renderPlans();
    renderTable();
  }

  function renderAll() { renderStatus(); renderPlans(); renderTable(); }

  /* ---------------------------------------------------------------- the checkout */

  var ck = null; // { step, plan, period, extraSeats, method, phone, error, result }
  var STEPS = [['plan', 'Formule'], ['period', 'Période'], ['pay', 'Paiement'], ['done', 'Confirmation']];

  function dlg() { return $('ab-checkout'); }
  function openCheckout(planId, per, step) {
    var s = P.state();
    var plan = P.planById(planId);
    ck = {
      step: step || 'plan',
      plan: plan && plan.paid ? plan.id : 'pro',
      period: per === 'mois' ? 'mois' : 'an',
      extraSeats: s.planId === 'agence' ? s.sub.extraSeats : 0,
      method: s.sub.method || 'wave',
      phone: s.account ? fmtPhone(s.account.phone) : '',
      error: '', result: null
    };
    if (!s.signedIn) ck.step = 'account';
    renderCk();
    var d = dlg();
    if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
    doc.documentElement.classList.add('ab-locked');
    focusCk();
  }
  function closeCheckout() {
    var d = dlg();
    if (d.open) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }
  }
  function fmtPhone(e164) {
    var m = /^\+225(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164 || '');
    return m ? '+225' + NB + m.slice(1).join(NB) : (e164 || '');
  }
  function focusCk() {
    var card = $('ab-checkout-card');
    var f = card.querySelector('[data-autofocus]') || card.querySelector('h2');
    if (f) { try { f.focus(); } catch (e) { /* ignore */ } }
  }

  function stepsBar() {
    var idx = { plan: 0, period: 1, pay: 2, processing: 2, done: 3, scheduled: 3 }[ck.step];
    if (idx == null) return '';
    return '<ol class="ab-steps">' + STEPS.map(function (st, i) {
      return '<li class="' + (i < idx ? 'is-done' : '') + (i === idx ? ' is-on' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + esc(st[1]) + '</li>';
    }).join('') + '</ol>';
  }
  function head(title) {
    return '<div class="ab-dlg__head"><h2 id="ck-title" tabindex="-1">' + esc(title) + '</h2><button class="ab-x" type="button" data-ck="close" aria-label="Fermer">' + ico('x') + '</button></div>' +
      stepsBar() + '<p class="ab-ribbon">' + ico('info') + '<span><b>Mode démo</b> · aucun prélèvement réel, rien n’est envoyé à votre opérateur.</span></p>';
  }
  function summary(q) {
    return '<dl class="ab-sum"><div><dt>Formule</dt><dd>' + esc(q.label) + '</dd></div>' +
      '<div><dt>' + (q.period === 'an' ? 'Prix pour un an' : 'Prix pour un mois') + '</dt><dd>' + esc(P.fcfa(q.total)) + '</dd></div>' +
      (q.credit ? '<div><dt>Crédit de votre formule actuelle</dt><dd>−' + NB + esc(P.fcfa(q.credit)) + '</dd></div>' : '') +
      '<div class="ab-sum__due"><dt>À payer aujourd’hui</dt><dd>' + esc(P.fcfa(q.due)) + '</dd></div>' +
      '<div><dt>Prochaine échéance</dt><dd>' + esc(P.date(q.renewsAt)) + '</dd></div></dl>';
  }

  function renderCk() {
    var card = $('ab-checkout-card');
    var s = P.state();
    var h = '';
    var q = P.quote(ck.plan, ck.period, ck.extraSeats);
    var down = P.isDowngrade(ck.plan, ck.period);
    if (ck.step === 'account') {
      var back = encodeURIComponent('abonnements') + '&plan=' + ck.plan + '&periode=' + ck.period;
      h += '<div class="ab-dlg__head"><h2 id="ck-title" tabindex="-1">Votre compte Jeere d’abord</h2><button class="ab-x" type="button" data-ck="close" aria-label="Fermer">' + ico('x') + '</button></div>' +
        '<p class="ab-p">L’abonnement est lié à votre compte (gratuit, avec votre numéro WhatsApp). Votre formule et votre période sont gardées&nbsp;: il restera le paiement.</p>' +
        '<div class="ab-dlg__foot ab-dlg__foot--col">' + (s.hasAccount ? '' : '<a class="btn ab-btn ab-btn--primary" data-autofocus href="../compte/?suite=' + back + '#inscription">Créer mon compte</a>') +
        '<a class="btn ab-btn ' + (s.hasAccount ? 'ab-btn--primary" data-autofocus' : 'ab-btn--ghost"') + ' href="../compte/?suite=' + back + '#connexion">Se connecter</a></div>';
    } else if (ck.step === 'plan') {
      h += head('Choisissez votre formule');
      h += '<fieldset class="ab-radios"><legend class="vh">Formule</legend>' + P.PLANS.filter(function (p) { return p.paid; }).map(function (p) {
        var pr = P.price(p.id, ck.period);
        return '<label class="ab-radio"><input type="radio" name="ck-plan" value="' + esc(p.id) + '"' + (ck.plan === p.id ? ' checked' : '') + '>' +
          '<span class="ab-radio__main"><b>' + esc(p.name) + '</b><span>' + esc(p.for) + '</span></span><span class="ab-radio__price">' + esc(P.fcfa(pr.perMonth)) + '<small>/ mois</small></span></label>';
      }).join('') + '</fieldset>';
      if (ck.plan === 'agence') {
        var ag = P.planById('agence');
        h += '<div class="ab-seats"><span id="ck-seats-l"><b>Places en plus</b> · ' + ag.seats + ' incluses, ' + esc(P.fcfa(ck.period === 'an' ? ag.extraSeatYear : ag.extraSeat)) + ' par place et par mois</span>' +
          '<span class="ab-stepper" role="group" aria-labelledby="ck-seats-l"><button type="button" data-ck="seat-" aria-label="Une place de moins"' + (ck.extraSeats <= 0 ? ' disabled' : '') + '>−</button><output aria-live="polite">' + ck.extraSeats + '</output><button type="button" data-ck="seat+" aria-label="Une place de plus"' + (ck.extraSeats >= ag.seatsMax - ag.seats ? ' disabled' : '') + '>+</button></span></div>';
      }
      h += '<div class="ab-dlg__foot"><button class="btn ab-btn ab-btn--ghost" type="button" data-ck="close">Annuler</button><button class="btn ab-btn ab-btn--primary" type="button" data-ck="next" data-autofocus>Continuer</button></div>';
    } else if (ck.step === 'period') {
      h += head('Mensuel ou annuel ?');
      var pm = P.price(ck.plan, 'mois', ck.extraSeats), pa = P.price(ck.plan, 'an', ck.extraSeats);
      h += '<fieldset class="ab-radios"><legend class="vh">Période de facturation</legend>' +
        '<label class="ab-radio"><input type="radio" name="ck-per" value="mois"' + (ck.period === 'mois' ? ' checked' : '') + '><span class="ab-radio__main"><b>Mensuel</b><span>Sans engagement. Une demande de paiement à valider chaque mois.</span></span><span class="ab-radio__price">' + esc(P.fcfa(pm.perMonth)) + '<small>/ mois</small></span></label>' +
        '<label class="ab-radio"><input type="radio" name="ck-per" value="an"' + (ck.period === 'an' ? ' checked' : '') + '><span class="ab-radio__main"><b>Annuel <span class="ab-tag">−' + P.discount(ck.plan) + NB + '%</span></b><span>' + esc(P.fcfa(pa.total)) + ' en une fois : vous économisez ' + esc(P.fcfa(pa.saving)) + '.</span></span><span class="ab-radio__price">' + esc(P.fcfa(pa.perMonth)) + '<small>/ mois</small></span></label></fieldset>';
      h += '<div class="ab-dlg__foot"><button class="btn ab-btn ab-btn--ghost" type="button" data-ck="back">' + ico('back') + 'Retour</button><button class="btn ab-btn ab-btn--primary" type="button" data-ck="next" data-autofocus>Continuer</button></div>';
    } else if (ck.step === 'pay') {
      h += head(down ? 'Changer de formule' : 'Paiement');
      if (down) {
        h += '<p class="ab-p">Vous passez à <b>' + esc(P.planById(ck.plan).label) + '</b> (' + (ck.period === 'an' ? 'annuel' : 'mensuel') + ') le <b>' + esc(P.date(s.periodEnd)) + '</b>, à la fin de votre période payée. Rien à payer aujourd’hui&nbsp;: tout reste débloqué jusque-là.</p>';
        h += '<div class="ab-dlg__foot"><button class="btn ab-btn ab-btn--ghost" type="button" data-ck="back">' + ico('back') + 'Retour</button><button class="btn ab-btn ab-btn--primary" type="button" data-ck="schedule" data-autofocus>Programmer le changement</button></div>';
      } else {
        var m = B.methodById(ck.method) || B.METHODS[0];
        h += '<fieldset class="ab-methods"><legend class="ab-legend">Moyen de paiement</legend>' + B.METHODS.map(function (x) {
          return '<label class="ab-method"><input type="radio" name="ck-method" value="' + esc(x.id) + '"' + (ck.method === x.id ? ' checked' : '') + '>' + ico(x.kind === 'card' ? 'card' : 'phone') + '<span>' + esc(x.name) + '</span></label>';
        }).join('') + '</fieldset>';
        if (m.kind === 'mobile') {
          h += '<div class="ab-field"><label for="ck-phone">Numéro ' + esc(m.name) + ' qui paie</label><input id="ck-phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(ck.phone) + '" placeholder="07 07 12 34 56"' + (ck.error ? ' aria-invalid="true" aria-describedby="ck-err"' : ' aria-describedby="ck-hint"') + '><p class="ab-hint" id="ck-hint">' + esc(m.hint) + '</p></div>';
        } else {
          h += '<p class="ab-p ab-card">' + ico('card') + '<span>' + esc(m.hint) + ' Jeere ne voit jamais votre numéro de carte.</span></p>';
        }
        if (ck.error) h += '<p class="ab-err" id="ck-err" role="alert">' + esc(ck.error) + '</p>';
        h += summary(q);
        h += '<div class="ab-dlg__foot"><button class="btn ab-btn ab-btn--ghost" type="button" data-ck="back">' + ico('back') + 'Retour</button><button class="btn ab-btn ab-btn--primary" type="button" data-ck="pay" data-autofocus>' + (q.due ? 'Payer ' + esc(P.fcfa(q.due)) : 'Confirmer') + '</button></div>';
      }
    } else if (ck.step === 'processing') {
      var mm = B.methodById(ck.method);
      h += head('Paiement en cours…');
      h += '<div class="ab-wait" role="status"><span class="ab-spin" aria-hidden="true"></span><p>' + (mm && mm.kind === 'mobile'
        ? 'Demande de ' + esc(P.fcfa(q.due)) + ' envoyée sur le ' + esc(ck.phone) + ' (' + esc(mm.name) + '). Validez-la avec votre code secret, que vous ne donnez jamais à personne.'
        : 'Ouverture de la page sécurisée du partenaire de paiement…') + '</p><p class="ab-hint">Démo&nbsp;: validé automatiquement, rien n’est prélevé.</p></div>';
    } else if (ck.step === 'done') {
      var inv = ck.result.invoice;
      var ns = P.state();
      h += head('C’est fait !');
      h += '<div class="ab-done"><span class="ab-done__ico">' + ico('check') + '</span><p class="ab-p"><b>' + esc(P.planById(inv.plan).label) + '</b> est actif. Tout le Studio est débloqué, tout de suite.</p></div>';
      h += '<dl class="ab-sum"><div><dt>Facture</dt><dd>' + esc(inv.id) + '</dd></div><div><dt>Payé</dt><dd>' + esc(P.fcfa(inv.amount)) + ' · ' + esc((B.methodById(inv.method) || {}).name || '') + ' (démo)</dd></div><div><dt>Prochaine échéance</dt><dd>' + esc(P.date(ns.periodEnd)) + '</dd></div></dl>';
      h += '<div class="ab-dlg__foot"><a class="btn ab-btn ab-btn--ghost" href="../admin/#parametres/studio">Gérer mon abonnement</a><a class="btn ab-btn ab-btn--primary" href="../studio/" data-autofocus>' + (fromStudio ? 'Retour au Studio' : 'Ouvrir le Studio') + ico('arrow') + '</a></div>';
    } else if (ck.step === 'scheduled') {
      h += head('Changement programmé');
      h += '<div class="ab-done"><span class="ab-done__ico">' + ico('check') + '</span><p class="ab-p">Le <b>' + esc(P.date(P.state().periodEnd)) + '</b>, votre Studio passera à <b>' + esc(P.planById(ck.plan).label) + '</b>. D’ici là, rien ne change.</p></div>';
      h += '<div class="ab-dlg__foot"><a class="btn ab-btn ab-btn--ghost" href="../admin/#parametres/studio">Gérer mon abonnement</a><button class="btn ab-btn ab-btn--primary" type="button" data-ck="close" data-autofocus>Fermer</button></div>';
    }
    card.innerHTML = h;
    card.setAttribute('data-step', ck.step);
  }

  function readInputs() {
    var card = $('ab-checkout-card');
    var pl = card.querySelector('input[name="ck-plan"]:checked');
    if (pl) { if (pl.value !== ck.plan) ck.extraSeats = 0; ck.plan = pl.value; }
    var pe = card.querySelector('input[name="ck-per"]:checked');
    if (pe) ck.period = pe.value;
    var me = card.querySelector('input[name="ck-method"]:checked');
    if (me) ck.method = me.value;
    var ph = $('ck-phone');
    if (ph) ck.phone = ph.value;
  }

  function pay() {
    readInputs();
    var m = B.methodById(ck.method);
    if (m && m.kind === 'mobile') {
      var d = String(ck.phone || '').replace(/\D/g, '');
      if (d.length < 8 || d.length > 15) { ck.error = 'Indiquez le numéro qui paie, par exemple 07 07 12 34 56.'; renderCk(); var f = $('ck-phone'); if (f) f.focus(); return; }
    }
    ck.error = '';
    var planId = ck.plan, per = ck.period, seats = ck.extraSeats;
    ck.step = 'processing';
    renderCk();
    focusCk();
    B.startCheckout(planId, per, ck.method, { phone: ck.phone, extraSeats: seats }).then(function (res) {
      if (!ck) return;
      if (!res.ok) {
        ck.step = res.reason === 'account' || res.reason === 'login' ? 'account' : 'pay';
        ck.error = res.message || 'Le paiement n’a pas abouti. Rien n’a été prélevé.';
        renderCk();
        focusCk();
        return;
      }
      ck.result = res;
      ck.step = 'done';
      renderCk();
      focusCk();
      renderAll();
    });
  }

  function onCkClick(e) {
    var t = e.target.closest ? e.target.closest('[data-ck]') : null;
    var d = dlg();
    if (!t) { if (e.target === d) closeCheckout(); return; }
    var a = t.getAttribute('data-ck');
    if (a === 'close') { closeCheckout(); return; }
    readInputs();
    if (a === 'next') { ck.step = ck.step === 'plan' ? 'period' : 'pay'; ck.error = ''; renderCk(); focusCk(); return; }
    if (a === 'back') { ck.step = ck.step === 'pay' ? 'period' : 'plan'; ck.error = ''; renderCk(); focusCk(); return; }
    if (a === 'seat+' || a === 'seat-') {
      var ag = P.planById('agence');
      ck.extraSeats = Math.max(0, Math.min(ag.seatsMax - ag.seats, ck.extraSeats + (a === 'seat+' ? 1 : -1)));
      renderCk();
      var again = $('ab-checkout-card').querySelector('[data-ck="' + a + '"]:not([disabled])') || $('ab-checkout-card').querySelector('.ab-stepper button:not([disabled])');
      if (again) again.focus();
      return;
    }
    if (a === 'pay') { pay(); return; }
    if (a === 'schedule') {
      var r = P.scheduleChange(ck.plan, ck.period);
      if (r.ok) { ck.step = 'scheduled'; renderCk(); focusCk(); renderAll(); } else { ck.error = r.message || ''; renderCk(); }
    }
  }
  function onCkChange(e) {
    var n = e.target && e.target.name;
    if (n === 'ck-plan' || n === 'ck-method' || n === 'ck-per') {
      readInputs();
      ck.error = '';
      var keep = n;
      renderCk();
      var sel = $('ab-checkout-card').querySelector('input[name="' + keep + '"]:checked');
      if (sel) sel.focus();
    }
  }

  /* ---------------------------------------------------------------- wiring */

  function onPageClick(e) {
    var t = e.target.closest ? e.target.closest('[data-choose], [data-trial], [data-col-btn], .ab-toggle [data-period]') : null;
    if (!t) return;
    if (t.hasAttribute('data-choose')) { openCheckout(t.getAttribute('data-choose'), period, 'period'); return; }
    if (t.hasAttribute('data-trial')) {
      var r = P.startTrial();
      if (!r.ok && (r.reason === 'account' || r.reason === 'login')) { window.location.href = '../compte/?suite=studio#' + (r.reason === 'login' ? 'connexion' : 'inscription'); return; }
      renderAll();
      var st = $('ab-status');
      if (st) st.insertAdjacentHTML('afterbegin', r.ok ? '<b class="ab-ok">Essai démarré : tout le Studio est débloqué pendant 14 jours.</b> ' : '');
      var link = st && st.querySelector('a[href="../studio/"]');
      if (link) link.focus();
      return;
    }
    if (t.hasAttribute('data-col-btn')) {
      col = t.getAttribute('data-col-btn');
      renderTable();
      var b = doc.querySelector('[data-col-btn="' + col + '"]');
      if (b) b.focus();
      return;
    }
    if (t.hasAttribute('data-period')) { setPeriod(t.getAttribute('data-period')); var again = doc.querySelector('.ab-toggle [data-period="' + period + '"]'); if (again) again.focus(); }
  }

  function init() {
    setPeriod(period);
    renderStatus();
    doc.addEventListener('click', onPageClick);
    var d = dlg();
    d.addEventListener('click', onCkClick);
    d.addEventListener('change', onCkChange);
    d.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'ck-phone') { e.preventDefault(); pay(); } });
    d.addEventListener('close', function () { ck = null; doc.documentElement.classList.remove('ab-locked'); if (/#paiement$/.test(window.location.hash)) { try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ } } });
    P.onChange(function () { renderAll(); });
    var s = P.state();
    var acct = $('ab-account');
    if (acct && s.signedIn) acct.textContent = s.account.firstName ? s.account.firstName : 'Mon compte';
    if (window.location.hash === '#paiement') {
      var want = P.planById(params.plan);
      openCheckout(want && want.paid ? want.id : 'pro', period, want && want.paid ? 'pay' : 'plan');
    }
  }

  init();

  window.JeereAbonnements = { openCheckout: openCheckout, closeCheckout: closeCheckout, setPeriod: setPeriod, state: function () { return ck ? JSON.parse(JSON.stringify(ck)) : null; } };
})();
