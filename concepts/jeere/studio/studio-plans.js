/* Jeere Studio — « Abonnements Studio » in the editor: the plan chip of the top bar, the upgrade
 * sheet, the locks on what Découverte does not include, the 14-day trial, the « Fait avec Jeere »
 * badge of the publish dialog. Loaded last, built on window.JeereStudio._internals and on
 * window.JeerePlans (plans.js). Like the other modules it only chains the studio's hooks.
 *
 * It defines on the bridge:
 *   S.can(feature)          is it included in the plan in force?
 *   S.limit(name)           blocks / versions allowed (Infinity when unknown)
 *   S.gate(feature, {count}) true when allowed; otherwise opens the upgrade sheet and returns false
 * studio-power.js and studio-design.js call these (feature-detected: without this file nothing is
 * locked). Any paid plan, and the trial, unlock everything.
 */
(function () {
  'use strict';

  function boot() {
    var J = window.JeereStudio;
    var S = J && J._internals;
    var P = window.JeerePlans;
    if (!S || !P) return;
    var hooks = S.hooks, toast = S.toast, esc = S.esc, ce = S.ce;
    function $(id) { return document.getElementById(id); }

    var NB = ' ';
    var sheetPeriod = 'an';
    var sheetCtx = null;
    var sheetReturn = null;
    var last = P.state();

    var LOCK = '<svg class="st-lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
    var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* ---------------------------------------------------------------- the bridge */

    S.plans = P;
    S.can = function (f) { return P.can(f); };
    S.limit = function (n) { return P.limit(n); };
    S.gate = function (feature, opts) {
      var o = opts || {};
      var f = P.featureById(feature);
      if (!f) return true;
      if (P.state().unlocked) return true; // every paid plan and the trial: the module's own caps apply
      if (f.limit && (o.count == null || o.count < P.limit(f.limit))) return true;
      openSheet({ feature: feature, count: o.count });
      return false;
    };
    S.registerOverlay('planSheet');

    /* ---------------------------------------------------------------- the top chip */

    function paintChip() {
      var s = P.state();
      var b = $('planChip'), l = $('planChipLabel');
      if (!b || !l) return;
      l.textContent = s.label;
      b.setAttribute('data-state', s.status);
      var sub = s.status === 'trial' ? 'Essai de tout le Studio jusqu’au ' + P.date(s.endsAt)
        : s.lifetime ? 'Studio ' + s.plan.name + ' · offert à vie'
        : s.status === 'active' ? 'Studio ' + s.plan.name + ' · renouvellement le ' + P.date(s.periodEnd)
        : s.status === 'canceling' ? 'Studio ' + s.plan.name + ' jusqu’au ' + P.date(s.periodEnd) + ', puis Découverte'
        : s.status === 'due' ? 'À renouveler avant le ' + P.date(s.endsAt)
        : 'Gratuit · voir ce que débloque un abonnement';
      b.setAttribute('data-sub', sub);
      b.setAttribute('aria-label', 'Abonnement Studio : ' + s.label + '. ' + sub);
    }
    if ($('planChip')) $('planChip').addEventListener('click', function () { openSheet(null); });

    /* ---------------------------------------------------------------- locks on the chrome */

    function lockMark(el, locked, label) {
      if (!el) return;
      el.classList.toggle('is-locked', locked);
      var m = el.querySelector(':scope > .st-lock');
      if (locked && !m) el.insertAdjacentHTML('beforeend', LOCK);
      if (!locked && m) m.remove();
      if (label) el.setAttribute('aria-label', locked ? label + ' (avec un abonnement Studio)' : label);
    }
    function paintLocks() {
      lockMark($('inspTabCode'), !P.can('code'), 'Code');
      lockMark($('toolComment'), !P.can('comments'), 'Commentaire');
      decorateShare();
    }

    /* Code tab: visible, locked on Découverte. The click is caught before power's own handler, and
     * any other way in (palette…) is turned back by the tab hook. */
    if ($('inspTabCode')) $('inspTabCode').addEventListener('click', function (e) {
      if (P.can('code')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      S.gate('code');
    }, true);
    var prevTab = hooks.inspTabChanged;
    hooks.inspTabChanged = function (mode) {
      if (mode === 'code' && !P.can('code')) {
        if (S.switchInspTab) S.switchInspTab('settings');
        S.gate('code');
        return;
      }
      if (prevTab) prevTab.apply(this, arguments);
    };

    /* Comments: the tool is visible, locked on Découverte (C, the button, the palette) */
    var prevTool = hooks.toolChanged;
    hooks.toolChanged = function (t, prev) {
      if (t === 'comment' && !P.can('comments')) {
        S.setTool(prev && prev !== 'comment' ? prev : 'select');
        S.gate('comments');
        return;
      }
      if (prevTool) prevTool.apply(this, arguments);
    };

    /* The publish / share dialog: the « Fait avec Jeere » badge, and the PNG button's lock */
    function decorateShare() {
      var body = $('shareBody');
      if (!body) return;
      var s = P.state();
      Array.prototype.forEach.call(body.querySelectorAll('.st-share__row button'), function (b) {
        if (/PNG/.test(b.textContent)) lockMark(b, !P.can('png'));
      });
      var title = $('shareTitle');
      var publishing = title && /Publier/.test(title.textContent);
      var row = body.querySelector('.st-badgerow');
      if (!publishing) { if (row) row.remove(); return; }
      if (!row) {
        row = ce('div', 'st-badgerow');
        var actions = body.querySelector('.st-share__row');
        if (actions) body.insertBefore(row, actions); else body.appendChild(row);
      }
      var shown = P.badgeShown();
      row.innerHTML = '<div class="st-badgerow__txt"><b id="badgeLbl">Badge « Fait avec Jeere »</b><span>' +
        (s.unlocked ? (shown ? 'Affiché en bas de votre boutique.' : 'Retiré : votre boutique est à votre seul nom.') : 'Affiché en bas de votre boutique en Découverte. Un abonnement Studio le retire.') + '</span></div>';
      var sw = ce('button', 'st-switch' + (s.unlocked ? '' : ' is-locked'));
      sw.type = 'button';
      sw.id = 'badgeSwitch';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!shown));
      sw.setAttribute('aria-label', 'Retirer le badge « Fait avec Jeere »' + (s.unlocked ? '' : ' (avec un abonnement Studio)'));
      sw.innerHTML = '<span class="st-switch__knob" aria-hidden="true"></span>' + (s.unlocked ? '' : LOCK);
      sw.addEventListener('click', function () {
        if (!P.state().unlocked) { S.gate('badge'); return; }
        P.setHideBadge(P.badgeShown());
        decorateShare();
        toast(P.badgeShown() ? 'Le badge « Fait avec Jeere » sera affiché.' : 'Badge « Fait avec Jeere » retiré.', 'ok');
        var again = $('badgeSwitch');
        if (again) again.focus();
      });
      row.appendChild(sw);
    }
    if ($('shareBody') && window.MutationObserver) {
      new MutationObserver(function () { if (!$('shareBody').querySelector('.st-badgerow') || $('shareBody').querySelector('.st-share__row button:not(.is-locked)')) decorateShare(); })
        .observe($('shareBody'), { childList: true });
    }

    /* ---------------------------------------------------------------- the upgrade sheet */

    function priceLine(p) {
      var pr = P.price(p.id, sheetPeriod);
      return '<span class="st-plan__price"><b>' + esc(P.fcfa(pr.perMonth)) + '</b> / mois</span>' +
        '<span class="st-plan__sub">' + esc(sheetPeriod === 'an' ? 'facturé ' + P.fcfa(pr.total) + ' par an' : 'sans engagement') +
        ' · ≈' + NB + esc(P.eur(pr.perMonth)) + ' · ≈' + NB + esc(P.usd(pr.perMonth)) + '</span>';
    }
    function checkoutUrl(p) {
      return '../abonnements/?plan=' + encodeURIComponent(p.id) + '&periode=' + sheetPeriod + '&retour=studio#paiement';
    }

    function renderSheet() {
      var body = $('planSheetBody');
      if (!body) return;
      var s = P.state();
      var f = sheetCtx && sheetCtx.feature ? P.featureById(sheetCtx.feature) : null;
      var h = '';
      if (f) {
        var lim = f.limit ? P.limit(f.limit) : 0;
        h += '<p class="st-plansheet__eyebrow">' + LOCK + '<span>Avec un abonnement Studio</span></p>';
        h += '<h2 id="planTitle">' + esc(f.name) + '</h2>';
        h += '<p>' + esc(f.text) + '</p>';
        if (f.limit && isFinite(lim)) h += '<p class="st-plansheet__limit">Vous avez atteint ' + lim + ' ' + (f.id === 'blocks' ? 'blocs' : 'versions') + ', le maximum de Découverte. Rien n’est effacé&nbsp;: supprimez-en un, ou passez à un abonnement.</p>';
      } else {
        h += '<p class="st-plansheet__eyebrow"><span>Abonnement Studio</span></p>';
        h += '<h2 id="planTitle">' + esc(s.unlocked ? 'Studio ' + s.plan.name + (s.status === 'trial' ? ' · essai' : '') : 'Votre Studio : Découverte') + '</h2>';
        h += '<p>' + esc(statusText(s)) + '</p>';
      }
      if (s.unlocked) {
        h += '<div class="st-plansheet__ok">' + CHECK + '<span>Tout le Studio est débloqué : code, images, blocs, versions, commentaires, polices, sans badge.</span></div>';
      } else {
        h += '<ul class="st-plansheet__feats">' + P.FEATURES.map(function (x) {
          return '<li' + (f && x.id === f.id ? ' class="is-cur"' : '') + '>' + LOCK + '<span>' + esc(x.name) + '</span></li>';
        }).join('') + '</ul>';
      }
      // the trial (once per account), or the account it needs
      if (s.trialAvailable) {
        h += '<div class="st-plansheet__trial"><button class="st-primary" type="button" id="planTrial">Essayer 14 jours gratuitement</button><span>Tout le Studio, sans moyen de paiement. Ensuite, retour en Découverte si vous ne choisissez rien.</span></div>';
      } else if (!s.signedIn && !s.unlocked) {
        h += '<div class="st-plansheet__trial st-plansheet__trial--acct"><span>' + (s.hasAccount ? 'Connectez-vous pour démarrer votre essai de 14 jours ou vous abonner.' : 'L’essai de 14 jours et les abonnements sont liés à votre compte Jeere (gratuit, avec votre numéro WhatsApp).') + '</span>' +
          '<div class="st-plansheet__acts">' + (s.hasAccount ? '' : '<a class="st-primary st-btnlink" href="../compte/?suite=studio#inscription" id="planSignup">Créer mon compte</a>') +
          '<a class="' + (s.hasAccount ? 'st-primary st-btnlink' : 'st-ghostbtn') + '" href="../compte/?suite=studio#connexion" id="planLogin">Se connecter</a></div></div>';
      }
      // the plans, monthly or yearly
      h += '<div class="st-plansheet__bar"><span class="st-plansheet__lbl" id="planPerLbl">Facturation</span><span class="st-seg" role="group" aria-labelledby="planPerLbl">' +
        '<button type="button" data-per="mois" aria-pressed="' + (sheetPeriod === 'mois') + '"' + (sheetPeriod === 'mois' ? ' class="is-on"' : '') + '>Mensuel</button>' +
        '<button type="button" data-per="an" aria-pressed="' + (sheetPeriod === 'an') + '"' + (sheetPeriod === 'an' ? ' class="is-on"' : '') + '>Annuel · −' + P.discount('solo') + NB + '%</button></span></div>';
      h += '<ul class="st-plans">';
      P.PLANS.filter(function (p) { return p.paid; }).forEach(function (p) {
        var cur = s.unlocked && s.status !== 'trial' && s.paidPlan.id === p.id;
        h += '<li class="st-plan' + (p.recommended ? ' is-pick' : '') + (cur ? ' is-cur' : '') + '">' +
          '<div class="st-plan__head"><b class="st-plan__name">' + esc(p.name) + '</b>' + (cur ? '<span class="st-pill st-pill--ok">Votre formule</span>' : (p.recommended ? '<span class="st-pill">Le plus choisi</span>' : '')) + '</div>' +
          '<p class="st-plan__for">' + esc(p.for) + '</p>' + priceLine(p) +
          '<ul class="st-plan__pts">' + p.points.map(function (t) { return '<li>' + CHECK + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
          (cur ? '<a class="st-ghostbtn st-plan__cta" href="../admin/#parametres/studio">Gérer</a>'
            : '<a class="' + (p.recommended ? 'st-primary st-btnlink' : 'st-ghostbtn') + ' st-plan__cta" href="' + esc(checkoutUrl(p)) + '" data-plan="' + esc(p.id) + '">Choisir ' + esc(p.name) + '</a>') +
          '</li>';
      });
      h += '</ul>';
      h += '<div class="st-plansheet__foot"><a class="st-textlink" href="../abonnements/#comparer">Comparer toutes les formules</a>' +
        (s.signedIn ? '<a class="st-textlink" href="../admin/#parametres/studio">Gérer mon abonnement</a>' : '') +
        '<span class="st-demo">Mode démo · aucun paiement réel</span></div>';
      body.innerHTML = h;
      Array.prototype.forEach.call(body.querySelectorAll('[data-per]'), function (b) {
        b.addEventListener('click', function () {
          sheetPeriod = b.getAttribute('data-per');
          renderSheet();
          var again = body.querySelector('[data-per="' + sheetPeriod + '"]');
          if (again) again.focus();
        });
      });
      var tr = $('planTrial');
      if (tr) tr.addEventListener('click', function () { startTrial(); });
    }
    function statusText(s) {
      if (s.status === 'trial') return 'Essai de tout le Studio : encore ' + s.daysLeft + NB + 'jour' + (s.daysLeft > 1 ? 's' : '') + ', jusqu’au ' + P.date(s.endsAt) + '. Aucun moyen de paiement enregistré : rien ne sera prélevé.';
      if (s.lifetime) return 'Offert à vie : rien à payer, rien à renouveler.';
      if (s.status === 'active') return (s.period === 'an' ? 'Annuel' : 'Mensuel') + ', renouvellement le ' + P.date(s.periodEnd) + '.' + (s.pending ? ' Passage à ' + P.planById(s.pending.plan).name + ' à cette date.' : '');
      if (s.status === 'canceling') return 'Annulé : tout reste débloqué jusqu’au ' + P.date(s.periodEnd) + ', puis le Studio repasse en Découverte.';
      if (s.status === 'due') return 'Votre période est terminée : renouvelez avant le ' + P.date(s.endsAt) + ' pour garder tout le Studio.';
      return 'Le Studio est gratuit sur votre boutique, avec des limites. Un abonnement, ou l’essai de 14 jours, débloque tout.';
    }

    function openSheet(ctx) {
      sheetCtx = ctx || null;
      var m = $('planSheet');
      if (!m) return;
      if (m.hidden) sheetReturn = document.activeElement;
      renderSheet();
      m.hidden = false;
      var first = m.querySelector('#planTrial') || m.querySelector('.st-plan.is-pick .st-plan__cta') || m.querySelector('.st-plan__cta');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
    function closeSheet() {
      var m = $('planSheet');
      if (!m || m.hidden) return;
      m.hidden = true;
      var back = sheetReturn;
      sheetReturn = null;
      if (back && document.contains(back) && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    // studio.js wires [data-close] and the backdrop; return the focus there too
    if ($('planSheet')) new MutationObserver(function () { if ($('planSheet').hidden && sheetReturn) closeSheet(); }).observe($('planSheet'), { attributes: true, attributeFilter: ['hidden'] });

    /* ---------------------------------------------------------------- the trial */

    // close the welcome modal the way « Continuer » does (flag + the « trois gestes » card)
    function leaveWelcome() {
      var m = $('proModal');
      if (m && !m.hidden && $('proTry')) $('proTry').click();
    }
    function showAccountStep(on) {
      if ($('proActions')) $('proActions').hidden = !!on;
      if ($('proAccount')) $('proAccount').hidden = !on;
      var s = P.state();
      if (on && $('proAccountText')) $('proAccountText').textContent = s.hasAccount
        ? 'Connectez-vous à votre compte Jeere pour démarrer votre essai de 14 jours, puis revenez ici.'
        : 'Votre essai est lié à votre compte Jeere : créez-le en une minute avec votre numéro WhatsApp, puis revenez ici.';
      if (on && $('proSignup')) $('proSignup').hidden = s.hasAccount;
      var f = on ? ($('proSignup') && !$('proSignup').hidden ? $('proSignup') : $('proLogin')) : $('proTrial');
      if (f) f.focus();
    }
    function startTrial() {
      var r = P.startTrial();
      if (!r.ok) {
        if (r.reason === 'account' || r.reason === 'login') {
          closeSheet();
          var m = $('proModal');
          if (m) { S.openModal(m); showAccountStep(true); }
          return false;
        }
        if (r.reason === 'used') { openSheet(null); toast(r.message, 'warn'); return false; }
        toast(r.message || 'L’essai n’a pas pu démarrer.', r.reason === 'active' ? 'info' : 'err');
        return false;
      }
      closeSheet();
      leaveWelcome();
      // the change listener says it (« Essai démarré… »)
      return true;
    }
    if ($('proTrial')) $('proTrial').addEventListener('click', function () { startTrial(); });
    if ($('proBack')) $('proBack').addEventListener('click', function () { showAccountStep(false); });

    /* ---------------------------------------------------------------- live changes */

    function onChange() {
      var s = P.state();
      paintChip();
      paintLocks();
      if (S.buildInsertPanel) { try { S.buildInsertPanel(); } catch (e) { /* panel rebuilt later */ } }
      if ($('planSheet') && !$('planSheet').hidden) renderSheet();
      if (!last.unlocked && s.unlocked) {
        closeSheet();
        toast(s.status === 'trial'
          ? 'Essai démarré : tout le Studio est débloqué pendant ' + P.TRIAL_DAYS + ' jours.'
          : 'Studio ' + s.plan.name + ' actif : tout le Studio est débloqué.', 'ok');
      } else if (last.unlocked && !s.unlocked) {
        toast('Retour en Découverte : vos blocs, versions et commentaires restent là ; les fonctions avancées sont verrouillées.', 'info');
      } else if (last.unlocked && s.unlocked && last.planId !== s.planId) {
        toast('Studio ' + s.plan.name + ' actif.', 'ok');
      }
      last = s;
    }
    P.onChange(onChange);
    // the trial or the period can end while the Studio is open
    setInterval(function () { var s = P.state(); if (s.unlocked !== last.unlocked || s.status !== last.status) onChange(); }, 60000);

    /* ---------------------------------------------------------------- opening */

    paintChip();
    paintLocks();
    (function opening() {
      var s = P.state();
      var u = S.ui();
      if (s.trialEnded && u && !u.trialEndSeen) {
        u.trialEndSeen = true;
        S.saveUI();
        toast('Votre essai de 14 jours est terminé : le Studio repasse en Découverte. Rien n’est perdu.', 'info');
      }
      var q = '';
      try { q = window.location.search || ''; } catch (e) { q = ''; }
      if (!/[?&]essai=1(?:&|$)/.test(q)) return;
      /* a phone or a small tablet sees the « sur ordinateur » screen: the trial waits for a
       * computer (its 14 days would otherwise run while she cannot use it) */
      if (window.matchMedia && window.matchMedia('(max-width: 1023px)').matches) {
        var card = document.querySelector('.st-guard__card');
        if (card && !card.querySelector('.st-guard__trial')) {
          var note = ce('p', 'st-guard__trial', 'Votre essai de 14 jours démarrera quand vous ouvrirez le Studio sur un ordinateur ou un iPad. En attendant, voyez les formules : ');
          var a = ce('a', '', 'Abonnements Studio');
          a.href = '../abonnements/';
          note.appendChild(a);
          card.insertBefore(note, card.querySelector('.st-guard__btn'));
        }
        return;
      }
      try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash); } catch (e) { /* ignore */ }
      if (s.unlocked) { leaveWelcome(); toast('Votre Studio est déjà débloqué (' + s.label + ').', 'info'); return; }
      if (s.trialAvailable) { startTrial(); return; }
      if (!s.signedIn) { var m = $('proModal'); if (m) { S.openModal(m); showAccountStep(true); } return; }
      leaveWelcome();
      openSheet(null);
      toast('Votre essai gratuit a déjà été utilisé : choisissez une formule pour continuer.', 'warn');
    })();

    window.JeereStudioPlans = { openSheet: openSheet, closeSheet: closeSheet, state: P.state, gate: S.gate, startTrial: startTrial };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
