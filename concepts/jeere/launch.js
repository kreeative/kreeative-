/* Jeere — the launch offer, live (public.launch_spots): « Essentiel offered 3 months to the first 100 », with the
 * REAL number of spots left. Fills every [data-launch], hides [data-free-plan] while the free plan is set aside,
 * and marks [data-launch-plan] (the Essentiel card). Nothing shows if the offer is over or the count can't load. */
(function () {
  'use strict';
  var URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co/rest/v1/rpc/launch_spots';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var NB = ' ';
  var last = null;
  function en() { return /^en/i.test(document.documentElement.getAttribute('lang') || ''); }
  function draw() {
    var o = last;
    if (!o) return;
    var free = document.querySelectorAll('[data-free-plan]');
    for (var i = 0; i < free.length; i++) free[i].hidden = !!o.hideFree;
    var cards = document.querySelectorAll('[data-launch-plan]');
    for (var c = 0; c < cards.length; c++) {
      var tag = cards[c].querySelector('.launch-tag');
      if (o.active) {
        if (!tag) { tag = document.createElement('p'); tag.className = 'launch-tag'; cards[c].insertBefore(tag, cards[c].firstChild); }
        tag.textContent = en() ? 'Free for ' + o.months + ' months · first ' + o.spots : 'Offert ' + o.months + NB + 'mois aux ' + o.spots + ' premières';
      } else if (tag) tag.remove();
    }
    var boxes = document.querySelectorAll('[data-launch]');
    for (var b = 0; b < boxes.length; b++) {
      var box = boxes[b];
      if (!o.active) { box.hidden = true; continue; }
      var left = Number(o.left) || 0, spots = Number(o.spots) || 100, pct = Math.round(((spots - left) / spots) * 100);
      var t1 = en() ? 'Launch offer: the Essentiel plan is free for ' + o.months + ' months for the first ' + spots + ' sellers.'
        : 'Offre de lancement' + NB + ': le plan Essentiel offert ' + o.months + NB + 'mois aux ' + spots + ' premières inscrites.';
      var t2 = en() ? (left + ' of ' + spots + ' spots left') : ('Il reste ' + left + ' place' + (left > 1 ? 's' : '') + ' sur ' + spots);
      box.innerHTML = '<p class="launch__t"></p><div class="launch__row"><span class="launch__bar"><i style="width:' + Math.max(2, pct) + '%"></i></span><b class="launch__n"></b></div>';
      box.querySelector('.launch__t').textContent = t1;
      box.querySelector('.launch__n').textContent = t2;
      box.hidden = false;
    }
  }
  function load() {
    fetch(URL, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (o) { if (o && typeof o === 'object') { last = o; draw(); } })
      .catch(function () { /* no banner */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  // the language switch (FR/EN) redraws; the count refreshes every minute
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  setInterval(load, 60000);
})();
