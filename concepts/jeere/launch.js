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
    // (no pill on the plan cards: the bar at the top says it)
    var old = document.querySelectorAll('[data-launch-plan] .launch-tag');
    for (var c = 0; c < old.length; c++) old[c].remove();
    // Everyone: the 1st month of Essentiel free (o.trial); the first o.spots: o.months months (o.active)
    var on = !!(o.active || o.trial);
    var tm = Number(o.trialMonths) || 1;
    var first = en() ? (tm > 1 ? tm + ' months free' : '1st month free') : (tm > 1 ? tm + NB + 'mois offerts' : '1er mois offert');
    var bars = document.querySelectorAll('[data-launch-bar]');
    for (var r = 0; r < bars.length; r++) {
      var bar = bars[r];
      if (!on) { bar.hidden = true; continue; }
      var ref = '';
      try { var sv = JSON.parse(localStorage.getItem('jeere-ref') || 'null'); ref = sv && sv.src ? sv.src : ''; } catch (e) { ref = ''; }
      bar.href = (bar.getAttribute('data-base') || 'compte/') + (ref ? '?ref=' + encodeURIComponent(ref) : '') + '#inscription';
      bar.innerHTML = '<span class="promo__t"></span><span class="promo__go"></span>';
      bar.querySelector('.promo__t').textContent = o.active
        ? (en() ? first + ' · ' + o.months + ' months for the first ' + o.spots : first + ' · ' + o.months + NB + 'mois pour les ' + o.spots + ' premières')
        : (en() ? first + ' on the Essentiel pack' : first + ' sur le pack Essentiel');
      bar.querySelector('.promo__go').textContent = en() ? 'Find out more →' : 'En savoir plus →';
      bar.hidden = false;
    }
    var boxes = document.querySelectorAll('[data-launch]');
    for (var b = 0; b < boxes.length; b++) {
      var box = boxes[b];
      if (!on) { box.hidden = true; continue; }
      var left = Number(o.left) || 0;
      var t1 = en() ? 'Get your ' + first.toLowerCase() + ' on the Essentiel pack.' : 'Obtiens ton ' + first.replace('1er mois offert', '1er mois offert') + ' sur le pack Essentiel.';
      if (!en() && tm > 1) t1 = 'Obtiens ' + first + ' sur le pack Essentiel.';
      var t0 = o.active ? (en() ? 'First ' + o.spots + ': ' + o.months + ' months.' : 'Les ' + o.spots + ' premières : ' + o.months + NB + 'mois.') : (en() ? 'Everything included.' : 'Tout est inclus.');
      var t2 = !o.active ? '' : (left <= 20 ? (en() ? 'Only ' + left + ' left' : 'Plus que ' + left + ' place' + (left > 1 ? 's' : '')) : (en() ? 'Sign up fast, before the spots run out' : 'Inscris-toi vite avant que les places finissent'));
      box.innerHTML = '<p class="launch__t"><b></b> <span></span></p>' + (t2 ? '<span class="launch__n"></span>' : '');
      box.querySelector('.launch__t b').textContent = t1;
      box.querySelector('.launch__t span').textContent = t0;
      if (t2) box.querySelector('.launch__n').textContent = t2;
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
