/* Jeere Studio — the subscription and entitlements module (« Abonnements Studio »).
 *
 * One small classic script, no DOM, no library: loaded by the Studio, the dashboard (../admin/),
 * the account page (../compte/) and the pricing page (../abonnements/), after ../creer/data.js
 * when the page has it (it works without it too, and in Node).
 *
 *   window.JeerePlans    the Studio plans, their limits, the current subscription, what it unlocks
 *   window.JeereBilling  the checkout, behind a provider adapter (only the demo provider works today)
 *
 * Storage: no key of its own. The subscription is the `studio` object of the seller's account,
 * localStorage['jeere-account'] (JEERE_DATA.STORAGE_KEYS.account), kept by
 * JEERE_DATA.normalizeAccount; this module normalises it on every read. No account, or a
 * logged-out one: the Studio runs on Découverte (free) and a trial or a checkout asks for an
 * account first.
 *
 *   account.studio = {
 *     version: 1,
 *     plan: 'decouverte' | 'solo' | 'pro' | 'agence',   the plan paid for (decouverte = none)
 *     period: 'mois' | 'an',
 *     status: 'free' | 'trial' | 'active',              as written; the live status is computed (state())
 *     startedAt, periodEnd,                             ISO dates of the current paid period
 *     cancelAtPeriodEnd: boolean,                       « Annuler » : stays active until periodEnd
 *     pending: { plan, period } | null,                 a downgrade, applied at the next renewal
 *     trialUsed: boolean, trialEndsAt: ISO | '',        one 14-day trial per account
 *     extraSeats: integer,                              Agence only, on top of the 5 included
 *     members: [{ id, name, phone, at }],               people given a Studio seat (owner not listed)
 *     invoices: [{ id, date, label, plan, period, amount, credit, method, status, provider, ref }],
 *     method: 'wave' | 'orange' | 'mtn' | 'moov' | 'card' | '',
 *     hideBadge: boolean                                « Fait avec Jeere » removed (paid plans)
 *   }
 *
 * The server's copy is the reference (wave 2): public.profiles.studio, written only by the `studio-plan`
 * Edge Function (browsers cannot write the column). compte/auth.js sends what this module writes there —
 * kept only while billing is in demo mode — and writes the server's answer back here. In live mode only the
 * payment provider's webhook changes it (see studio/README.md, « Abonnements Studio »).
 */
(function (root) {
  'use strict';

  var D = root.JEERE_DATA || null;
  var ACCOUNT_KEY = (D && D.STORAGE_KEYS && D.STORAGE_KEYS.account) || 'jeere-account';
  var DAY = 86400000;
  var TRIAL_DAYS = 14;
  var GRACE_DAYS = 7; // mobile money is never debited automatically: a week to renew, still unlocked
  var NB = ' ';

  /* ------------------------------------------------------------------ the plans
   * Prices in whole FCFA (XOF). month = billed monthly; year = the price per month billed yearly
   * (about 30 % less, like Framer). Set just under Framer, Webflow and Figma (README, « Abonnements Studio »).
   * EUR at the fixed CFA peg; USD indicative (README). Every paid plan (and the
   * trial) unlocks the whole Studio: the plans differ only by how many stores and seats, and the
   * support — the same rule as Jeere's store plans, where you move up because you grow.
   */
  var FX = { EUR: 655.957, USD: 575 };

  var PLANS = [
    {
      id: 'decouverte', name: 'Découverte', label: 'Studio Découverte', paid: false,
      for: 'Pour découvrir le Studio sur votre boutique',
      month: 0, year: 0, sites: 1, seats: 1, seatsMax: 1, extraSeat: 0, extraSeatYear: 0,
      limits: { blocks: 3, versions: 3 },
      support: 'Aide humaine sur WhatsApp',
      points: ['Le Studio complet sur 1 boutique : calques, sections, Design, aperçus de 360 à 1440 px', '3 blocs et 3 versions enregistrés', 'Badge « Fait avec Jeere » sur la boutique']
    },
    {
      id: 'solo', name: 'Studio Solo', label: 'Studio Solo', paid: true,
      for: 'Pour une vendeuse ou un designer indépendant',
      month: 7900, year: 5400, sites: 1, seats: 1, seatsMax: 1, extraSeat: 0, extraSeatYear: 0,
      limits: { blocks: 20, versions: 15 },
      support: 'Aide humaine sur WhatsApp',
      points: ['Tout le Studio débloqué, sur 1 boutique', 'Export du code et des images, commentaires', 'Sans le badge « Fait avec Jeere »']
    },
    {
      id: 'pro', name: 'Studio Pro', label: 'Studio Pro', paid: true, recommended: true,
      for: 'Pour les marques qui soignent chaque détail',
      month: 24900, year: 16900, sites: 3, seats: 2, seatsMax: 2, extraSeat: 0, extraSeatYear: 0,
      limits: { blocks: 20, versions: 15 },
      support: 'Support prioritaire : réponse en moins de 2 h ouvrées',
      points: ['Tout le Studio débloqué, sur 3 boutiques', '2 places : vous et une personne de votre équipe', 'Support prioritaire sur WhatsApp']
    },
    {
      id: 'agence', name: 'Studio Agence', label: 'Studio Agence', paid: true,
      for: 'Pour les agences qui créent les boutiques de leurs clients',
      month: 79900, year: 54900, sites: 10, seats: 5, seatsMax: 25, extraSeat: 10900, extraSeatYear: 9900,
      limits: { blocks: 20, versions: 15 },
      support: 'Un interlocuteur dédié sur WhatsApp',
      points: ['Tout le Studio débloqué, sur 10 boutiques clientes', '5 places incluses, puis dès 9 900 FCFA par place et par mois', 'Un interlocuteur dédié']
    }
  ];

  /* What Découverte keeps locked (visible, with a lock, never hidden). `limit`: a count instead of
   * a yes/no. The trial and every paid plan unlock all of them. */
  var FEATURES = [
    { id: 'code', name: 'Export du code', text: 'L’onglet Code : le CSS et le JSON exacts de la sélection, à copier dans vos outils.' },
    { id: 'png', name: 'Export en image', text: 'Chaque aperçu en PNG haute définition, pour vos réseaux, vos devis et vos clients.' },
    { id: 'blocks', name: 'Mes blocs', limit: 'blocks', text: 'Vos sections enregistrées comme blocs réutilisables : 3 en Découverte, 20 avec un abonnement.' },
    { id: 'versions', name: 'Historique des versions', limit: 'versions', text: 'Vos versions nommées (« avant la promo Tabaski ») : 3 en Découverte, 15 avec un abonnement.' },
    { id: 'comments', name: 'Commentaires', text: 'Des notes épinglées sur les aperçus, pour travailler à plusieurs ou avec votre cliente.' },
    { id: 'fonts', name: 'Polices par élément', text: 'Les 33 polices du catalogue, élément par élément, en plus des polices de votre modèle.' },
    { id: 'badge', name: 'Sans badge « Fait avec Jeere »', text: 'Votre boutique sans le petit badge « Fait avec Jeere » en bas de page.' }
  ];

  /* The comparison table of the pricing page, row by row: [label, decouverte, solo, pro, agence].
   * true = included, false = not included, a string = the value. */
  var COMPARE = [
    { group: 'Le Studio' },
    ['Éditeur avancé : plan de travail, calques, sections, raccourcis Figma', true, true, true, true],
    ['Onglet Design élément par élément, états, aperçus de 360 à 1440 px', true, true, true, true],
    ['Boutiques dans le Studio', '1', '1', '3', '10'],
    ['Mes blocs', '3', '20', '20', '20'],
    ['Versions nommées', '3', '15', '15', '15'],
    ['Polices du catalogue par élément', false, true, true, true],
    ['Export du code (CSS, JSON)', false, true, true, true],
    ['Export en image (PNG)', false, true, true, true],
    { group: 'Équipe' },
    ['Places incluses', '1', '1', '2', '5'],
    ['Places en plus', false, false, false, 'dès 9 900 FCFA / mois'],
    ['Commentaires épinglés', false, true, true, true],
    { group: 'Votre boutique en ligne' },
    ['Badge « Fait avec Jeere »', 'Affiché', 'Retiré', 'Retiré', 'Retiré'],
    ['Domaine personnalisé', 'Inclus', 'Inclus', 'Inclus', 'Inclus'],
    ['Export de la fiche boutique (JSON)', true, true, true, true],
    { group: 'Aide' },
    ['Une vraie personne sur WhatsApp', true, true, true, true],
    ['Support prioritaire', false, false, 'Moins de 2 h', 'Interlocuteur dédié']
  ];

  var PERIODS = [{ id: 'mois', label: 'Mensuel' }, { id: 'an', label: 'Annuel' }];

  /* ------------------------------------------------------------------ helpers */

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n || 200) : ''; }
  function iso(v) { if (!v) return ''; var t = new Date(v).getTime(); return isFinite(t) ? new Date(t).toISOString() : ''; }
  function int(v, min, max, def) { var n = Math.round(Number(v)); if (!isFinite(n)) return def; return Math.max(min, Math.min(max, n)); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
  function planById(id) { for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i]; return null; }
  function rid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  var nowFn = function () { return Date.now(); };
  function now() { return nowFn(); }

  function group3(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function fcfa(n) { return group3(n) + NB + 'FCFA'; }
  function eur(n) { return (n / FX.EUR).toFixed(2).replace('.', ',') + NB + '€'; }
  function usd(n) { return (n / FX.USD).toFixed(2).replace('.', ',') + NB + '$'; }
  function date(isoStr) {
    var t = new Date(isoStr);
    if (!isFinite(t.getTime())) return '';
    var M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return t.getUTCDate() + (t.getUTCDate() === 1 ? 'er' : '') + NB + M[t.getUTCMonth()] + NB + t.getUTCFullYear();
  }
  function addPeriod(t, period) {
    var d = new Date(t);
    if (period === 'an') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }

  /* ------------------------------------------------------------------ prices */

  // The price per month for a plan and a period, and what one payment costs (a month, or a year).
  function price(planId, period, extraSeats) {
    var p = planById(planId) || PLANS[0];
    var yearly = period === 'an';
    var perMonth = yearly ? p.year : p.month;
    var seat = yearly ? p.extraSeatYear : p.extraSeat;
    var extra = p.id === 'agence' ? int(extraSeats, 0, p.seatsMax - p.seats, 0) : 0;
    perMonth += extra * seat;
    return {
      perMonth: perMonth,
      total: yearly ? perMonth * 12 : perMonth,
      saving: yearly ? (p.month - p.year + extra * (p.extraSeat - p.extraSeatYear)) * 12 : 0,
      extraSeats: extra,
      period: yearly ? 'an' : 'mois'
    };
  }
  // Annual vs monthly discount of a plan, in whole percent (31 to 32 % for the paid plans: 5 400 / 7 900, 16 900 / 24 900, 54 900 / 79 900)
  function discount(planId) {
    var p = planById(planId);
    return p && p.month ? Math.round((1 - p.year / p.month) * 100) : 0;
  }

  /* ------------------------------------------------------------------ storage */

  function readRaw() { try { return root.localStorage.getItem(ACCOUNT_KEY); } catch (e) { return null; } }
  function writeRaw(v) { try { root.localStorage.setItem(ACCOUNT_KEY, v); return true; } catch (e) { return false; } }

  // The account as saved (data.js normalises it: a number is required); null when there is none
  function readAccountObj() {
    var raw = readRaw();
    if (!raw) return null;
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { return null; }
    if (!isObj(obj)) return null;
    var dd = root.JEERE_DATA;
    if (dd && typeof dd.normalizeAccount === 'function') {
      var n = null;
      try { n = dd.normalizeAccount(obj); } catch (e) { n = null; }
      if (!n) return null;
      if (isObj(obj.studio)) n.studio = obj.studio;
      return n;
    }
    if (!/^\+\d{8,15}$/.test(String(obj.phone || '').replace(/[\s.\-()]/g, ''))) return null;
    return obj;
  }

  function normalizeSub(input) {
    var s = isObj(input) ? input : {};
    var plan = planById(s.plan) ? s.plan : 'decouverte';
    var status = s.status === 'trial' || s.status === 'active' ? s.status : 'free';
    if (status === 'active' && !planById(plan).paid) status = 'free';
    var members = [];
    (Array.isArray(s.members) ? s.members : []).forEach(function (m) {
      if (!isObj(m) || members.length >= 30) return;
      var name = str(m.name, 40), phone = str(m.phone, 20);
      if (!name && !phone) return;
      members.push({ id: str(m.id, 24) || rid('m'), name: name, phone: phone, at: iso(m.at) });
    });
    var invoices = [];
    (Array.isArray(s.invoices) ? s.invoices : []).forEach(function (v) {
      if (!isObj(v) || invoices.length >= 60) return;
      invoices.push({
        id: str(v.id, 24), date: iso(v.date), label: str(v.label, 80), plan: planById(v.plan) ? v.plan : 'solo',
        period: v.period === 'an' ? 'an' : 'mois', amount: int(v.amount, 0, 1e9, 0), credit: int(v.credit, 0, 1e9, 0),
        method: methodById(v.method) ? v.method : '', status: str(v.status, 20) || 'payée',
        provider: str(v.provider, 20) || 'demo', ref: str(v.ref, 60)
      });
    });
    var pending = isObj(s.pending) && planById(s.pending.plan) ? { plan: s.pending.plan, period: s.pending.period === 'an' ? 'an' : 'mois' } : null;
    return {
      version: 1,
      plan: plan,
      period: s.period === 'an' ? 'an' : 'mois',
      status: status,
      startedAt: iso(s.startedAt),
      periodEnd: iso(s.periodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
      pending: pending,
      trialUsed: s.trialUsed === true || status === 'trial',
      trialEndsAt: iso(s.trialEndsAt),
      extraSeats: plan === 'agence' ? int(s.extraSeats, 0, 20, 0) : 0,
      members: members,
      invoices: invoices,
      method: methodById(s.method) ? s.method : '',
      hideBadge: s.hideBadge !== false,
      lifetime: s.lifetime === true           // given for life by the team (never renewed, never charged)
    };
  }

  // Write the subscription back into the account, keeping everything else as it is
  function writeSub(sub) {
    var raw = readRaw();
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { obj = null; }
    if (!isObj(obj)) return false;
    obj.studio = normalizeSub(sub);
    var ok = writeRaw(JSON.stringify(obj));
    emit();
    return ok;
  }

  /* ------------------------------------------------------------------ the live state */

  // Everything the apps need to show and gate, computed at `now`.
  function state() {
    var acc = readAccountObj();
    var signedIn = !!(acc && acc.loggedIn === true);
    var sub = normalizeSub(acc && acc.studio);
    var t = now();
    var st = 'free';
    var effective = 'decouverte';
    var endsAt = '';
    var daysLeft = 0;
    var trialEnded = false, expired = false;
    if (signedIn) {
      if (sub.status === 'trial') {
        var te = Date.parse(sub.trialEndsAt);
        if (isFinite(te) && t < te) { st = 'trial'; effective = 'pro'; endsAt = sub.trialEndsAt; daysLeft = Math.max(1, Math.ceil((te - t) / DAY)); }
        else trialEnded = true;
      } else if (sub.status === 'active') {
        var pe = Date.parse(sub.periodEnd);
        if (isFinite(pe) && t < pe) { st = sub.cancelAtPeriodEnd ? 'canceling' : 'active'; effective = sub.plan; endsAt = sub.periodEnd; daysLeft = Math.ceil((pe - t) / DAY); }
        else if (isFinite(pe) && !sub.cancelAtPeriodEnd && t < pe + GRACE_DAYS * DAY) { st = 'due'; effective = sub.plan; endsAt = new Date(pe + GRACE_DAYS * DAY).toISOString(); daysLeft = Math.ceil((pe + GRACE_DAYS * DAY - t) / DAY); }
        else expired = true;
      }
    }
    var plan = planById(effective);
    var paidPlan = planById(sub.plan);
    var unlocked = st === 'trial' || st === 'active' || st === 'canceling' || st === 'due';
    var seats = plan.seats + (effective === 'agence' ? sub.extraSeats : 0);
    return {
      signedIn: signedIn,
      hasAccount: !!acc,
      account: acc ? { firstName: acc.firstName || '', phone: acc.phone || '', storeName: acc.storeName || '' } : null,
      status: st,                 // 'free' | 'trial' | 'active' | 'canceling' | 'due'
      unlocked: unlocked,
      plan: plan,                 // the plan in force (the trial counts as Pro)
      planId: plan.id,
      paidPlan: paidPlan,         // the plan paid for (decouverte when none)
      period: sub.period,
      endsAt: endsAt,             // end of the trial, of the paid period, or of the grace week
      periodEnd: sub.periodEnd,
      lifetime: sub.lifetime === true && unlocked,   // « À vie » instead of a renewal date
      daysLeft: daysLeft,
      trialAvailable: signedIn && !sub.trialUsed && !unlocked,
      trialEnded: trialEnded,
      expired: expired,
      seats: seats,
      seatsUsed: 1 + Math.min(sub.members.length, Math.max(0, seats - 1)),
      pending: sub.pending,
      sub: sub,
      label: labelFor(st, plan, daysLeft),
      price: unlocked && st !== 'trial' ? price(sub.plan, sub.period, sub.extraSeats) : null
    };
  }
  function labelFor(st, plan, daysLeft) {
    if (st === 'trial') return 'Essai · ' + daysLeft + NB + 'j';
    if (st === 'due') return plan.name + ' · à renouveler';
    if (st === 'free') return 'Découverte';
    return plan.name;
  }

  // Is this feature available now? (every paid plan and the trial: yes; Découverte: no)
  function can(feature) {
    var s = state();
    if (s.unlocked) return true;
    var f = featureById(feature);
    return !f; // an unknown feature is not gated
  }
  // A count limit for the plan in force: blocks, versions
  function limit(name) {
    var s = state();
    var l = s.plan.limits && s.plan.limits[name];
    return typeof l === 'number' ? l : Infinity;
  }
  function featureById(id) { for (var i = 0; i < FEATURES.length; i++) if (FEATURES[i].id === id) return FEATURES[i]; return null; }

  /* ------------------------------------------------------------------ changes */

  function needAccount() {
    var s = state();
    if (!s.hasAccount) return { ok: false, reason: 'account', message: 'Créez votre compte Jeere (gratuit) pour continuer.' };
    if (!s.signedIn) return { ok: false, reason: 'login', message: 'Connectez-vous à votre compte Jeere pour continuer.' };
    return null;
  }

  // One 14-day trial per account, of the whole Studio (Pro). No payment method asked: at the end
  // the Studio goes back to Découverte by itself, nothing is lost.
  function startTrial() {
    var n = needAccount();
    if (n) return n;
    var s = state();
    if (s.unlocked) return { ok: false, reason: 'active', message: 'Votre Studio est déjà débloqué.' };
    if (s.sub.trialUsed) return { ok: false, reason: 'used', message: 'Votre essai gratuit a déjà été utilisé : choisissez une formule pour continuer.' };
    var sub = s.sub;
    sub.status = 'trial';
    sub.plan = 'decouverte';
    sub.trialUsed = true;
    sub.trialEndsAt = new Date(now() + TRIAL_DAYS * DAY).toISOString();
    if (!writeSub(sub)) return { ok: false, reason: 'storage', message: 'La mémoire de ce navigateur est pleine ou bloquée.' };
    // A real account: the server starts it too (the `studio-plan` Edge Function, one trial per account,
    // in every billing mode); its answer replaces this copy (wave 2 of the Studio audit)
    try { if (root.JeereAuth && typeof root.JeereAuth.startTrial === 'function') root.JeereAuth.startTrial().then(function () { emit(); }, function () { /* offline: kept here */ }); } catch (e) { /* no auth module */ }
    return { ok: true, state: state() };
  }

  // What a checkout for this plan and period costs now: a credit for what is left of the current
  // paid period when she moves up (the new period starts today).
  function quote(planId, period, extraSeats) {
    var p = planById(planId);
    if (!p || !p.paid) return null;
    var pr = price(planId, period, extraSeats);
    var s = state();
    var credit = 0;
    if ((s.status === 'active' || s.status === 'canceling') && s.sub.periodEnd && s.sub.startedAt) {
      var start = Date.parse(s.sub.startedAt), end = Date.parse(s.sub.periodEnd), t = now();
      var paidNow = price(s.sub.plan, s.sub.period, s.sub.extraSeats).total;
      if (end > start && t < end) credit = Math.floor(paidNow * (end - t) / (end - start) / 5) * 5;
    }
    credit = Math.min(credit, pr.total);
    return {
      plan: p, period: pr.period, perMonth: pr.perMonth, total: pr.total, saving: pr.saving,
      extraSeats: pr.extraSeats, credit: credit, due: pr.total - credit,
      label: p.label + ' · ' + (pr.period === 'an' ? 'annuel' : 'mensuel') + (pr.extraSeats ? ' · ' + pr.extraSeats + ' place' + (pr.extraSeats > 1 ? 's' : '') + ' en plus' : ''),
      renewsAt: new Date(addPeriod(now(), pr.period)).toISOString()
    };
  }

  // Is this change a move down (applied at the end of the paid period, no charge now)?
  function isDowngrade(planId, period) {
    var s = state();
    if (!(s.status === 'active' || s.status === 'canceling')) return false;
    var cur = planById(s.sub.plan), next = planById(planId);
    if (!cur || !next) return false;
    var ci = PLANS.indexOf(cur), ni = PLANS.indexOf(next);
    if (ni < ci) return true;
    if (ni === ci && s.sub.period === 'an' && period === 'mois') return true;
    return false;
  }

  // Called by JeereBilling once the provider confirms the payment: the plan starts now.
  function activate(q, method, payment) {
    var s = state();
    var sub = s.sub;
    var t = now();
    var inv = {
      id: invoiceNumber(sub.invoices.length + 1),
      date: new Date(t).toISOString(),
      label: q.label,
      plan: q.plan.id,
      period: q.period,
      amount: q.due,
      credit: q.credit,
      method: method,
      status: 'payée',
      provider: payment.provider,
      ref: payment.reference
    };
    sub.plan = q.plan.id;
    sub.period = q.period;
    sub.status = 'active';
    sub.startedAt = new Date(t).toISOString();
    sub.periodEnd = new Date(addPeriod(t, q.period)).toISOString();
    sub.cancelAtPeriodEnd = false;
    sub.pending = null;
    sub.trialUsed = true;
    sub.extraSeats = q.extraSeats;
    sub.method = method;
    sub.invoices = [inv].concat(sub.invoices).slice(0, 60);
    var seats = q.plan.seats + q.extraSeats;
    if (sub.members.length > seats - 1) sub.members = sub.members.slice(0, Math.max(0, seats - 1));
    if (!writeSub(sub)) return null;
    return inv;
  }
  function invoiceNumber(n) {
    var y = new Date(now()).getUTCFullYear();
    return 'JS-' + y + '-' + ('000' + n).slice(-4);
  }

  // A move down (Pro → Solo, annual → monthly) waits for the end of the paid period.
  function scheduleChange(planId, period) {
    var n = needAccount();
    if (n) return n;
    if (realBilling() && !(state().sub && state().sub.lifetime)) { billingCall({ action: 'portal', returnUrl: here() }); return { ok: false, reason: 'portal', message: 'Ouverture de votre espace de paiement Stripe : changez ou résiliez votre abonnement là-bas.' }; }
    if (!isDowngrade(planId, period)) return { ok: false, reason: 'upgrade', message: 'Ce changement passe par le paiement.' };
    var s = state();
    var sub = s.sub;
    if (planId === 'decouverte') { sub.cancelAtPeriodEnd = true; sub.pending = null; }
    else { sub.pending = { plan: planId, period: period === 'an' ? 'an' : 'mois' }; sub.cancelAtPeriodEnd = false; }
    writeSub(sub);
    return { ok: true, at: sub.periodEnd, state: state() };
  }

  // « Annuler l'abonnement »: nothing more is asked; the Studio stays unlocked until periodEnd.
  // During the trial: the trial simply ends at its date (it never turns into a payment).
  function cancel() {
    var n = needAccount();
    if (n) return n;
    if (realBilling() && !(state().sub && state().sub.lifetime)) { billingCall({ action: 'portal', returnUrl: here() }); return { ok: false, reason: 'portal', message: 'Ouverture de votre espace de paiement Stripe : changez ou résiliez votre abonnement là-bas.' }; }
    var s = state();
    var sub = s.sub;
    if (s.status === 'trial') { return { ok: true, at: sub.trialEndsAt, trial: true, state: s }; }
    if (!(s.status === 'active' || s.status === 'due')) return { ok: false, reason: 'none', message: 'Aucun abonnement à annuler.' };
    if (s.status === 'due') { sub.status = 'free'; sub.plan = 'decouverte'; sub.pending = null; writeSub(sub); return { ok: true, at: new Date(now()).toISOString(), state: state() }; }
    sub.cancelAtPeriodEnd = true;
    sub.pending = null;
    writeSub(sub);
    return { ok: true, at: sub.periodEnd, state: state() };
  }
  function resume() {
    var n = needAccount();
    if (n) return n;
    if (realBilling() && !(state().sub && state().sub.lifetime)) { billingCall({ action: 'portal', returnUrl: here() }); return { ok: false, reason: 'portal', message: 'Ouverture de votre espace de paiement Stripe : changez ou résiliez votre abonnement là-bas.' }; }
    var s = state();
    if (s.status !== 'canceling' && !s.pending) return { ok: false, reason: 'none' };
    s.sub.cancelAtPeriodEnd = false;
    s.sub.pending = null;
    writeSub(s.sub);
    return { ok: true, state: state() };
  }

  // Agence: places on top of the 5 included (billed from the next renewal in this demo)
  function setExtraSeats(n) {
    if (realBilling()) { billingCall({ action: 'portal', returnUrl: here() }); return { ok: false, reason: 'portal', message: 'Ouverture de votre espace de paiement Stripe.' }; }
    var s = state();
    if (s.planId !== 'agence' || !(s.status === 'active' || s.status === 'canceling')) return { ok: false, reason: 'plan' };
    var p = planById('agence');
    s.sub.extraSeats = int(n, 0, p.seatsMax - p.seats, 0);
    var seats = p.seats + s.sub.extraSeats;
    if (s.sub.members.length > seats - 1) return { ok: false, reason: 'members', message: 'Retirez d’abord une personne : toutes les places sont prises.' };
    writeSub(s.sub);
    return { ok: true, state: state() };
  }
  function addMember(name, phone) {
    var s = state();
    if (!s.unlocked) return { ok: false, reason: 'plan', message: 'Les places d’équipe viennent avec Studio Pro et Agence.' };
    name = str(name, 40); phone = str(phone, 20);
    if (!name) return { ok: false, reason: 'name', message: 'Indiquez le prénom de la personne.' };
    var digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return { ok: false, reason: 'phone', message: 'Indiquez son numéro WhatsApp, par exemple 07 07 12 34 56.' };
    if (s.sub.members.length >= s.seats - 1) return { ok: false, reason: 'full', message: s.seats > 1 ? 'Toutes vos places sont prises.' : 'Votre formule a une seule place : la vôtre.' };
    s.sub.members.push({ id: rid('m'), name: name, phone: phone, at: new Date(now()).toISOString() });
    writeSub(s.sub);
    return { ok: true, state: state() };
  }
  function removeMember(id) {
    var s = state();
    var before = s.sub.members.length;
    s.sub.members = s.sub.members.filter(function (m) { return m.id !== id; });
    if (s.sub.members.length === before) return { ok: false };
    writeSub(s.sub);
    return { ok: true, state: state() };
  }
  function setHideBadge(on) {
    var s = state();
    if (!s.unlocked && on) return { ok: false, reason: 'plan' };
    s.sub.hideBadge = !!on;
    writeSub(s.sub);
    return { ok: true };
  }
  // Is the « Fait avec Jeere » badge shown on the store?
  function badgeShown() { var s = state(); return !s.unlocked || !s.sub.hideBadge; }

  /* ------------------------------------------------------------------ change events */

  var listeners = [];
  function emit() { var s = null; listeners.slice().forEach(function (fn) { try { fn(s || (s = state())); } catch (e) { /* listener error */ } }); }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  if (root.addEventListener) {
    root.addEventListener('storage', function (e) { if (!e.key || e.key === ACCOUNT_KEY) emit(); });
    root.addEventListener('pageshow', function (e) { if (e.persisted) emit(); });
  }

  /* ================================================================== JeereBilling
   * The checkout, behind a provider adapter. Jeere is paid for its own software here (a SaaS
   * subscription): that is not the store's buyers' money, which Jeere never holds (BCEAO).
   *
   *   JeereBilling.startCheckout(planId, period, method, { phone, extraSeats }) → Promise of
   *     { ok: true, invoice, state } | { ok: false, reason, message }
   *
   * Only the demo provider works today; it says so on screen and charges nobody.
   */

  var METHODS = [
    { id: 'wave', name: 'Wave', kind: 'mobile', hint: 'Une demande arrive dans votre application Wave : validez-la.' },
    { id: 'orange', name: 'Orange Money', kind: 'mobile', hint: 'Validez la demande avec votre code secret Orange Money.' },
    { id: 'mtn', name: 'MTN MoMo', kind: 'mobile', hint: 'Validez la demande avec votre code secret MoMo.' },
    { id: 'moov', name: 'Moov Money', kind: 'mobile', hint: 'Validez la demande avec votre code secret Moov Money.' },
    { id: 'card', name: 'Carte bancaire', kind: 'card', hint: 'Visa ou Mastercard, sur la page sécurisée du partenaire de paiement. Pratique depuis la diaspora.' }
  ];
  function methodById(id) { for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === id) return METHODS[i]; return null; }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* A provider: { id, name, demo, charge(intent) → Promise of { ok, reference, provider } }.
   * intent = { amount, currency: 'XOF', method, phone, reference, description, customer, metadata } */
  var providers = {
    demo: {
      id: 'demo', name: 'Mode démo', demo: true,
      delay: 900,
      charge: function (intent) {
        return wait(this.delay).then(function () {
          return { ok: true, provider: 'demo', reference: 'demo_' + intent.method + '_' + Date.now().toString(36) };
        });
      }
    },
    /* Paystack (cards, and mobile money in Côte d'Ivoire): the server creates the transaction
     * (POST https://api.paystack.co/transaction/initialize with the secret key, amount in the
     * smallest unit, currency XOF, channels ['card', 'mobile_money'], metadata { account, plan,
     * period }), the browser opens authorization_url (or Paystack Inline), and only the server's
     * webhook (charge.success, signature checked) activates the plan. Not connected yet. */
    paystack: {
      id: 'paystack', name: 'Paystack', demo: false,
      charge: function () { return Promise.resolve({ ok: false, reason: 'provider', message: 'Le paiement par Paystack n’est pas encore connecté.' }); }
    },
    /* Wave Checkout: the server calls POST https://api.wave.com/v1/checkout/sessions (amount,
     * currency XOF, success_url, error_url, client_reference = the subscription id), the browser
     * goes to wave_launch_url, and the checkout.session.completed webhook activates the plan.
     * Not connected yet. */
    wave: {
      id: 'wave', name: 'Wave Checkout', demo: false,
      charge: function () { return Promise.resolve({ ok: false, reason: 'provider', message: 'Wave Checkout n’est pas encore connecté.' }); }
    }
  };
  // Which provider takes which method once real: Wave Checkout for Wave, Paystack for the rest.
  var ROUTES = { wave: 'wave', orange: 'paystack', mtn: 'paystack', moov: 'paystack', card: 'paystack' };
  var activeProvider = 'demo';

  /* Real billing (the `billing` Edge Function, Stripe): on Jeere with a real account (JeereAuth not in demo).
   * The card only for now — mobile money comes with CinetPay. The browser never activates a plan: Stripe's
   * webhook writes it on the server, and the page reads it back (JeereAuth.syncPlan) on return. */
  var BILLING_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/billing';
  var BILLING_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  function realBilling() {
    var A = root.JeereAuth;
    try { return !!(A && typeof A.isDemo === 'function' && !A.isDemo()); } catch (e) { return false; }
  }
  function billingCall(body) {
    var A = root.JeereAuth;
    return Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).then(function (s) {
      if (!s || !s.access_token) return { ok: false, reason: 'login', message: 'Connectez-vous à votre compte Jeere pour payer.' };
      return fetch(BILLING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BILLING_KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
    }).then(function (j) {
      if (j && j.ok && j.url) { try { root.location.assign(j.url); } catch (e) { root.location.href = j.url; } return { ok: true, redirect: true, url: j.url, message: j.message || '' }; }
      return { ok: false, reason: (j && (j.reason || j.code)) || 'declined', message: (j && j.message) || 'Le paiement n’a pas pu s’ouvrir. Rien n’a été prélevé : réessayez.' };
    }, function () { return { ok: false, reason: 'network', message: 'La connexion a été coupée. Rien n’a été prélevé : réessayez.' }; });
  }
  function here() { try { return root.location.origin + root.location.pathname; } catch (e) { return ''; } }

  function providerFor(method) { return activeProvider === 'demo' ? providers.demo : providers[ROUTES[method]] || providers.demo; }

  function startCheckout(planId, period, method, opts) {
    var o = opts || {};
    var n = needAccount();
    if (n) return Promise.resolve(n);
    var p = planById(planId);
    if (!p || !p.paid) return Promise.resolve({ ok: false, reason: 'plan', message: 'Choisissez une formule payante.' });
    if (realBilling()) method = 'card';
    var m = methodById(method);
    if (!m) return Promise.resolve({ ok: false, reason: 'method', message: 'Choisissez un moyen de paiement.' });
    var phone = str(o.phone, 24);
    if (m.kind === 'mobile') {
      var d = phone.replace(/\D/g, '');
      if (d.length < 8 || d.length > 15) return Promise.resolve({ ok: false, reason: 'phone', message: 'Indiquez le numéro qui paie, par exemple 07 07 12 34 56.' });
    }
    if (isDowngrade(planId, period)) return Promise.resolve({ ok: false, reason: 'downgrade', message: 'Pour descendre de formule, le changement se fait à la fin de votre période : rien à payer.' });
    var q = quote(planId, period, o.extraSeats);
    if (realBilling()) return billingCall({ action: 'subscribe', kind: 'studio', plan: q.plan.id, period: q.period, returnUrl: here() });
    var s = state();
    var intent = {
      amount: q.due, currency: 'XOF', method: m.id, phone: phone,
      reference: rid('jsub_'), description: 'Jeere ' + q.label,
      customer: { name: s.account && s.account.firstName, phone: s.account && s.account.phone },
      metadata: { plan: q.plan.id, period: q.period, extraSeats: q.extraSeats }
    };
    var prov = providerFor(m.id);
    return Promise.resolve(prov.charge(intent)).then(function (res) {
      if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'declined', message: (res && res.message) || 'Le paiement n’a pas abouti. Rien n’a été prélevé.' };
      var inv = activate(q, m.id, res);
      if (!inv) return { ok: false, reason: 'storage', message: 'Le paiement est passé mais ce navigateur n’a pas pu l’enregistrer.' };
      return { ok: true, invoice: inv, quote: q, demo: !!prov.demo, state: state() };
    }, function () {
      return { ok: false, reason: 'network', message: 'La connexion a été coupée. Rien n’a été prélevé : réessayez.' };
    });
  }

  /* Another product than a Studio plan, through the same provider adapter: today a domain name
   * (../creer/domains.js, README « Domaines »). product = { type: 'domain', label, amount (FCFA), metadata }.
   * → Promise { ok, reference, provider, demo, amount } | { ok: false, reason, message }. It only takes the
   * payment: what was bought is recorded by the caller (the domain checkout writes 'jeere-admin'.domainOrders),
   * and the real domain purchase is a server call made after a real payment, never from here. */
  var PRODUCT_TYPES = ['domain'];
  function startProductCheckout(product, method, opts) {
    var o = opts || {};
    var n = needAccount();
    if (n) return Promise.resolve(n);
    var pr = product && typeof product === 'object' ? product : {};
    if (PRODUCT_TYPES.indexOf(pr.type) === -1) return Promise.resolve({ ok: false, reason: 'product', message: 'Produit inconnu.' });
    var amount = int(pr.amount, 0, 1e8, 0);
    if (!amount) return Promise.resolve({ ok: false, reason: 'amount', message: 'Montant invalide.' });
    if (realBilling() && pr.type === 'domain') return billingCall({ action: 'domain', domain: pr.metadata && pr.metadata.domain, storeId: o.storeId || '', returnUrl: here() });
    var m = methodById(method);
    if (!m) return Promise.resolve({ ok: false, reason: 'method', message: 'Choisissez un moyen de paiement.' });
    var phone = str(o.phone, 24);
    if (m.kind === 'mobile') {
      var d = phone.replace(/\D/g, '');
      if (d.length < 8 || d.length > 15) return Promise.resolve({ ok: false, reason: 'phone', message: 'Indiquez le numéro qui paie, par exemple 07 07 12 34 56.' });
    }
    var s = state();
    var intent = {
      amount: amount, currency: 'XOF', method: m.id, phone: phone, reference: rid('j' + pr.type.slice(0, 3) + '_'),
      description: 'Jeere ' + str(pr.label, 80), customer: { name: s.account && s.account.firstName, phone: s.account && s.account.phone },
      metadata: pr.metadata || {}
    };
    var prov = providerFor(m.id);
    return Promise.resolve(prov.charge(intent)).then(function (res) {
      if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'declined', message: (res && res.message) || 'Le paiement n’a pas abouti. Rien n’a été prélevé.' };
      return { ok: true, reference: res.reference || intent.reference, provider: res.provider || prov.id, demo: !!prov.demo, amount: amount, method: m.id };
    }, function () {
      return { ok: false, reason: 'network', message: 'La connexion a été coupée. Rien n’a été prélevé : réessayez.' };
    });
  }

  root.JeerePlans = {
    PLANS: PLANS, FEATURES: FEATURES, COMPARE: COMPARE, PERIODS: PERIODS, FX: FX,
    TRIAL_DAYS: TRIAL_DAYS, GRACE_DAYS: GRACE_DAYS, ACCOUNT_KEY: ACCOUNT_KEY,
    planById: planById, featureById: featureById,
    price: price, discount: discount, quote: quote, isDowngrade: isDowngrade,
    state: state, can: can, limit: limit, badgeShown: badgeShown,
    startTrial: startTrial, scheduleChange: scheduleChange, cancel: cancel, resume: resume,
    setExtraSeats: setExtraSeats, addMember: addMember, removeMember: removeMember, setHideBadge: setHideBadge,
    normalizeSub: normalizeSub, onChange: onChange, refresh: emit,
    fcfa: fcfa, eur: eur, usd: usd, date: date,
    // tests only: move the clock (a function returning ms)
    _setNow: function (fn) { nowFn = typeof fn === 'function' ? fn : function () { return Date.now(); }; }
  };
  root.JeereBilling = {
    METHODS: METHODS, methodById: methodById, providers: providers, ROUTES: ROUTES,
    provider: function () { return activeProvider; },
    isDemo: function () { return !realBilling() && activeProvider === 'demo'; },
    isReal: realBilling,
    portal: function () { return billingCall({ action: 'portal', returnUrl: here() }); },
    // her subscriptions read from Stripe now (not only by the webhook), then the entitlements read back
    sync: function () {
      if (!realBilling()) return Promise.resolve(null);
      var A = root.JeereAuth;
      return Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).then(function (s) {
        if (!s || !s.access_token) return null;
        return fetch(BILLING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BILLING_KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ action: 'sync' }) })
          .then(function (r) { return r.json().catch(function () { return null; }); });
      }).then(function (j) {
        return Promise.resolve(A && typeof A.syncPlan === 'function' ? A.syncPlan() : null).then(function () { emit(); return j; });
      }, function () { return null; });
    },
    // one subscription = one store: storeId is the store being subscribed
    subscribeBoutique: function (plan, period, storeId) { return billingCall({ action: 'subscribe', kind: 'boutique', plan: plan, period: period, storeId: storeId || '', returnUrl: here() }); },
    methods: function () { return realBilling() ? METHODS.filter(function (x) { return x.kind === 'card'; }) : METHODS; },
    useProvider: function (id) { if (id === 'demo' || providers[id]) activeProvider = id; return activeProvider; },
    startCheckout: startCheckout,
    PRODUCT_TYPES: PRODUCT_TYPES,
    startProductCheckout: startProductCheckout
  };
})(typeof window !== 'undefined' ? window : globalThis);
