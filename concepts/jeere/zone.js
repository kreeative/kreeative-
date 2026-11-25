/* Jehre — Jehre's own prices in the visitor's money (/api/geo).
 * In the franc CFA zones: FCFA, as written in the page. In Canada: the Canadian dollar prices. In the United States and
 * the euro zone: about the same amount in dollars or euros (« ≈ »), since Stripe converts at checkout and the buyer pays
 * the conversion. Anywhere else: the Canadian dollar prices. Kept in step with billing (CAD_PLAN, CAD_MODEL). */
(function () {
  'use strict';
  var NB = ' ';
  var PLAN = { essentiel: [3500, 9], croissance: [7500, 19], pro: [15000, 39], business: [30000, 75], entreprise: [60000, 149] };
  // [FCFA, $ CA, FCFA before, $ CA before]
  var MODEL = {
    seve: [25000, 59.99, 50000, 119.99], soyeuse: [25000, 59.99, 50000, 119.99], michou: [50000, 119.99, 100000, 239.99], anse: [300000, 729.99],
    regard: [25000, 59.99, 50000, 119.99], vernie: [25000, 59.99, 50000, 119.99], minuit: [25000, 59.99, 50000, 119.99]
  };
  var z = null;
  function en() { return /^en/i.test(document.documentElement.getAttribute('lang') || ''); }
  function num(n, d) {
    return new Intl.NumberFormat(en() ? 'en-US' : 'fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n).replace(/[ \s]/g, NB);
  }
  // an amount: [the figure, the money after it]
  function parts(xof, cad) {
    if (!z || z.show === 'XOF') return [num(xof, 0), 'FCFA'];
    if (z.show === 'CAD') return [num(cad, cad % 1 ? 2 : 0), '$' + NB + 'CA'];
    var v = Math.round(cad * z.rate);
    return ['≈' + NB + num(v, 0), z.show === 'USD' ? '$' + NB + 'US' : '€'];
  }
  function draw() {
    var month = en() ? 'month' : 'mois';
    document.querySelectorAll('[data-plan]').forEach(function (p) {
      var x = PLAN[p.getAttribute('data-plan')];
      if (!x) return;
      var a = parts(x[0], x[1]);
      p.querySelector('b').textContent = a[0];
      p.querySelector('[data-unit]').textContent = a[1] + ' / ' + month;
    });
    document.querySelectorAll('[data-model]').forEach(function (p) {
      var x = MODEL[p.getAttribute('data-model')];
      if (!x) return;
      var a = parts(x[0], x[1]);
      p.querySelector('b').textContent = a[0] + NB + a[1];
      var s = p.querySelector('s');
      if (s && x[2]) {
        var w = parts(x[2], x[3]);
        var t = s.lastChild && s.lastChild.nodeType === 3 ? s.lastChild : s.appendChild(document.createTextNode(''));
        t.textContent = w[0] + NB + w[1];
      }
    });
    var note = document.querySelector('[data-zone-note]');
    if (note) {
      var other = z && (z.show === 'USD' || z.show === 'EUR');
      note.hidden = !other;
      note.textContent = other ? (en() ? 'Approximate amounts: the exact price in your money shows at checkout.' : 'Montants approximatifs : le prix exact dans votre monnaie s’affiche au paiement.') : '';
    }
  }
  document.addEventListener('jehre-lang', draw);
  fetch('/api/geo', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !/^(XOF|CAD|USD|EUR)$/.test(j.show)) return;
    z = { show: j.show, rate: Number(j.rate) || 1 };
    if (z.show !== 'XOF') draw();
  }).catch(function () { /* the page keeps its FCFA prices */ });
})();
