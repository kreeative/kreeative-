/* Jeere — « Réserver un appel » (Sur mesure): the dialog, sent to the `appel` function, which saves the request and
 * tells the founder by e-mail. The source (?ref=tiktok …) goes with it. */
(function () {
  'use strict';
  var URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/appel';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  function $(id) { return document.getElementById(id); }
  function en() { return /^en/i.test(document.documentElement.getAttribute('lang') || ''); }
  function src() { try { var o = JSON.parse(localStorage.getItem('jeere-ref') || 'null'); return o && o.src ? o.src : ''; } catch (e) { return ''; } }
  function open() {
    var d = $('appel'); if (!d) return;
    $('appel-form').hidden = false; $('appel-done').hidden = true; $('appel-err').hidden = true;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    var f = d.querySelector('input[name="firstName"]'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function close() { var d = $('appel'); if (!d) return; if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
  function err(t) { var e = $('appel-err'); e.textContent = t; e.hidden = false; }
  function init() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest && t.closest('[data-appel]')) { e.preventDefault(); open(); }
      else if (t.closest && t.closest('[data-appel-close]')) { e.preventDefault(); close(); }
      else if (t.id === 'appel') close(); // a tap outside the card
    });
    var form = $('appel-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { firstName: form.firstName.value.trim(), whatsapp: form.whatsapp.value.trim(), link: form.link.value.trim(), need: form.need.value.trim(), source: src() };
      if (!v.firstName) { err(en() ? 'Your first name, please.' : 'Votre prénom, s’il vous plaît.'); form.firstName.focus(); return; }
      if (v.whatsapp.replace(/\D/g, '').length < 8) { err(en() ? 'A full WhatsApp number, with the country code.' : 'Un numéro WhatsApp complet, avec l’indicatif.'); form.whatsapp.focus(); return; }
      var btn = form.querySelector('.appel__go'); btn.disabled = true;
      fetch(URL, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (j) {
          btn.disabled = false;
          if (j && j.ok) { form.hidden = true; $('appel-done').hidden = false; form.reset(); return; }
          err((j && j.message) || (en() ? 'That didn’t go through. Try again.' : 'La demande n’est pas partie. Réessayez.'));
        }, function () { btn.disabled = false; err(en() ? 'No connection. Try again.' : 'Pas de connexion. Réessayez.'); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
