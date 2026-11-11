/* SOYEUSE — the checkout, on the site itself.
 *
 * The cart is Jeere Connect's (localStorage, data-store="soyeuse"). This page reads the store's published fiche
 * (delivery zones, payment methods), then places the order with Jeere's `orders` function, which recomputes
 * prices and delivery fees from the fiche, records the order in the dashboard (Gérer › Commandes) and sends
 * the e-mails. For « Carte bancaire », the `payments` function then opens Stripe Checkout and Stripe sends the
 * buyer back here with ?paiement=ok|annule&commande=<n>.
 */
(function () {
  'use strict';

  var SLUG = 'soyeuse';
  var SB = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var NB = ' ';
  var LAST = 'soyeuse:derniere-commande';
  var PAY_LABELS = { wave: 'Wave', orange: 'Orange Money', mtn: 'MTN MoMo', moov: 'Moov Money', cod: 'Paiement à la livraison', card: 'Carte bancaire' };

  var root = document.querySelector('[data-checkout]');
  var form = document.querySelector('[data-checkout-form]');
  if (!root || !form) return;
  var alertBox = form.querySelector('[data-checkout-alert]');
  var submit = form.querySelector('[data-checkout-submit]');
  var communes = form.querySelector('[data-communes]');
  var fiche = null;
  var cardOk = false;

  function price(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + 'FCFA'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fn(name, body) {
    return fetch(SB + '/functions/v1/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function jc() { return window.JeereConnect || null; }
  function cart() { var c = jc(); return c ? c.cart() : { lines: [], count: 0, total: 0 }; }

  /* ------------------------------------------------------------ messages */
  function showAlert(text) {
    alertBox.textContent = text;
    alertBox.hidden = !text;
    if (text) alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------------------ the fiche: zones and payment methods */
  function loadFiche() {
    var url = SB + '/rest/v1/stores?slug=eq.' + SLUG + '&published=is.true&select=fiche';
    return fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { fiche = rows && rows[0] && rows[0].fiche ? rows[0].fiche : null; applyFiche(); })
      .catch(function () { fiche = null; });
  }
  function zonesOf(f) {
    var out = null;
    (Array.isArray(f.sections) ? f.sections : []).forEach(function (s) {
      if (!out && s && s.type === 'delivery' && s.settings && Array.isArray(s.settings.zones)) out = s.settings.zones;
    });
    return out;
  }
  function applyFiche() {
    if (!fiche) return;
    // the delivery zones of the fiche replace the page's list (the server charges from them)
    var zones = zonesOf(fiche);
    if (zones && zones.length) {
      var keep = communes.value;
      var html = '<option value="">Choisissez votre commune</option>';
      zones.forEach(function (z) {
        if (!z || !z.name) return;
        html += '<option value="' + esc(z.name) + '" data-fee="' + (Math.round(Number(z.fee)) || 0) + '">' + esc(z.name) + ' — ' + price(z.fee) + '</option>';
      });
      communes.innerHTML = html;
      communes.value = keep;
    }
    // the payment methods the store takes
    var p = fiche.payments || {};
    Object.keys(PAY_LABELS).forEach(function (k) {
      var el = form.querySelector('[data-pay="' + k + '"]');
      if (!el) return;
      if (k === 'card') { el.hidden = !(p.card === true && cardOk); return; }
      el.hidden = p[k] === false || (k === 'moov' && p.moov !== true);
    });
    var checked = form.querySelector('input[name="pay"]:checked');
    if (!checked || checked.closest('[hidden]')) {
      var first = form.querySelector('[data-pay]:not([hidden]) input');
      if (first) first.checked = true;
    }
    if (p.card === true && !cardOk) {
      fn('payments', { action: 'available', slug: SLUG }).then(function (j) {
        cardOk = !!(j && j.card);
        var el = form.querySelector('[data-pay="card"]');
        if (el) el.hidden = !cardOk;
      }, function () { /* no card */ });
    }
    markPay();
    refreshTotals();
  }

  // the chosen payment method's box
  function markPay() {
    form.querySelectorAll('.paiement').forEach(function (l) {
      var i = l.querySelector('input');
      l.classList.toggle('is-on', !!(i && i.checked));
    });
  }
  form.addEventListener('change', function (e) { if (e.target && e.target.name === 'pay') markPay(); });

  /* ------------------------------------------------------------ totals */
  function fee() {
    var o = communes.options[communes.selectedIndex];
    return o && o.value ? Math.round(Number(o.getAttribute('data-fee')) || 0) : null;
  }
  function refreshTotals() {
    var c = cart();
    var f = fee();
    var feeEl = document.querySelector('[data-recap-fee]');
    var totEl = document.querySelector('[data-recap-total]');
    if (feeEl) feeEl.textContent = f === null ? 'Choisissez une commune' : (f ? price(f) : 'Offerte');
    if (totEl) totEl.textContent = price(c.total + (f || 0));
    submit.disabled = !c.count;
  }
  document.addEventListener('jeere:cart', refreshTotals);
  document.addEventListener('jeere:ready', refreshTotals);
  communes.addEventListener('change', refreshTotals);

  /* ------------------------------------------------------------ validation */
  function field(name) { return form.elements[name]; }
  function setErr(name, bad) {
    var el = field(name);
    var msg = form.querySelector('[data-err="' + name + '"]');
    if (el) { if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    if (msg) msg.classList.toggle('is-on', !!bad);
    return !bad;
  }
  function validate() {
    var ok = true;
    ok = setErr('name', !field('name').value.trim()) && ok;
    ok = setErr('phone', field('phone').value.replace(/\D/g, '').length < 8) && ok;
    var em = field('email').value.trim();
    ok = setErr('email', !!em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) && ok;
    ok = setErr('commune', !communes.value) && ok;
    ok = setErr('address', !field('address').value.trim()) && ok;
    if (!ok) {
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
    }
    return ok;
  }
  ['name', 'phone', 'email', 'address'].forEach(function (n) {
    field(n).addEventListener('input', function () { if (field(n).getAttribute('aria-invalid')) validate(); });
  });
  communes.addEventListener('change', function () { if (communes.getAttribute('aria-invalid')) setErr('commune', !communes.value); });

  /* ------------------------------------------------------------ the order */
  function busy(on) {
    submit.disabled = on;
    submit.setAttribute('aria-busy', on ? 'true' : 'false');
    submit.textContent = on ? 'Envoi de la commande…' : 'Confirmer la commande';
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showAlert('');
    var c = cart();
    if (!c.count) { showAlert('Votre panier est vide : ajoutez un article avant de commander.'); return; }
    if (!validate()) return;
    var payEl = form.querySelector('input[name="pay"]:checked');
    var pay = payEl ? payEl.value : 'cod';
    var items = {};
    c.lines.forEach(function (l) { items[l.id] = l.qty; });
    var customer = {
      name: field('name').value.trim(),
      phone: field('phone').value.trim(),
      email: field('email').value.trim(),
      commune: communes.value,
      address: field('address').value.trim()
    };
    busy(true);
    fn('orders', { action: 'place', slug: SLUG, cart: items, customer: customer, payment: PAY_LABELS[pay] || '', note: field('note').value.trim(), source: 'site' })
      .then(function (o) {
        if (!o || !o.ok) throw new Error((o && o.message) || 'La commande n’a pas pu être enregistrée.');
        var last = { number: o.number, total: o.total, subtotal: o.subtotal, fee: o.fee, lines: o.lines || [], pay: pay, phone: customer.phone, email: customer.email, emails: !!o.emailsReady };
        try { sessionStorage.setItem(LAST, JSON.stringify(last)); } catch (x) { /* private mode */ }
        if (jc()) jc().clear();
        if (pay !== 'card') { busy(false); thanks(last, 'ok'); return; }
        return fn('payments', { action: 'checkout', orderId: o.orderId, returnUrl: location.origin + location.pathname }).then(function (p) {
          if (!p || !p.ok || !p.url) {
            busy(false);
            thanks(last, 'card-failed', (p && p.message) || '');
            return;
          }
          location.assign(p.url);
        });
      })
      .catch(function (err) {
        busy(false);
        showAlert((err && err.message ? err.message + ' ' : '') + 'Vérifiez votre connexion et réessayez dans un instant.');
      });
  });

  /* ------------------------------------------------------------ the confirmation */
  function thanks(o, state, detail) {
    var box = document.querySelector('[data-merci]');
    if (!box) return;
    root.hidden = true;
    box.hidden = false;
    var num = o && o.number ? 'Commande n°' + NB + o.number : '';
    box.querySelector('[data-merci-num]').textContent = num;
    var eyebrow = box.querySelector('[data-merci-eyebrow]');
    var text = box.querySelector('[data-merci-text]');
    var actions = box.querySelector('[data-merci-actions]');
    actions.innerHTML = '';
    var mail = o && o.email ? ' Un récapitulatif part à ' + o.email + '.' : '';
    var phone = o && o.phone ? ' au ' + o.phone : '';
    if (state === 'paid') {
      eyebrow.textContent = 'Paiement reçu';
      text.textContent = 'Votre commande est payée. La boutique vous appelle' + phone + ' pour la livraison.' + mail;
    } else if (state === 'cancelled') {
      eyebrow.textContent = 'Paiement annulé';
      text.textContent = 'Votre commande est enregistrée mais pas encore payée. La boutique vous contacte' + phone + ' pour le paiement, ou vous pouvez repasser commande.';
    } else if (state === 'card-failed') {
      eyebrow.textContent = 'Commande enregistrée';
      text.textContent = 'Le paiement par carte n’a pas pu s’ouvrir' + (detail ? ' (' + detail + ')' : '') + '. Votre commande est bien reçue : la boutique vous contacte' + phone + ' pour le paiement.';
    } else {
      eyebrow.textContent = 'Commande enregistrée';
      var how = o && o.pay && o.pay !== 'cod'
        ? 'La boutique vous contacte' + phone + ' pour le paiement par ' + PAY_LABELS[o.pay] + ', puis pour la livraison.'
        : 'La boutique vous appelle' + phone + ' pour confirmer la livraison. Vous payez à la réception.';
      text.textContent = 'Merci, la boutique a bien reçu votre commande. ' + how + mail;
    }
    var recap = box.querySelector('[data-merci-recap]');
    if (o && o.lines && o.lines.length) {
      var h = '<ul>';
      o.lines.forEach(function (l) { h += '<li><span>' + esc(l.qty) + ' × ' + esc(l.name) + '</span><span>' + price(l.amount) + '</span></li>'; });
      if (o.fee) h += '<li><span>Livraison</span><span>' + price(o.fee) + '</span></li>';
      h += '<li class="merci__total"><span>Total</span><span>' + price(o.total) + '</span></li></ul>';
      recap.innerHTML = h;
    } else {
      recap.innerHTML = '';
    }
    window.scrollTo(0, 0);
    var t = box.querySelector('.merci__title');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
  }

  // Back from Stripe: ?paiement=ok|annule&commande=<n>
  var back = /[?&]paiement=(ok|annule)(?:&commande=(\d+))?/.exec(location.search);
  if (back) {
    var last = null;
    try { last = JSON.parse(sessionStorage.getItem(LAST) || 'null'); } catch (x) { last = null; }
    if (!last || (back[2] && String(last.number) !== back[2])) last = { number: back[2] ? Number(back[2]) : 0, lines: [] };
    try { history.replaceState(null, '', location.pathname); } catch (x) { /* keep */ }
    thanks(last, back[1] === 'ok' ? 'paid' : 'cancelled');
  }

  loadFiche();
  markPay();
  refreshTotals();
})();
