/* JEERE — landing page behaviour: language, header, delivery demo, template preview, waitlist form.
   No library. French lives in the HTML; English comes from i18n.js (window.JEERE_EN). */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var EN = window.JEERE_EN || {};

  // Waitlist storage: Supabase project "Kreeative Teach", table public.jeere_waitlist.
  // The publishable key can only insert rows (row level security); nobody can read them with it.
  var SB_URL = 'https://frhhbxawqungjjnrljhy.supabase.co';
  var SB_KEY = 'sb_publishable_1cUmug1Bsk1WOw_oTe-lwA_3ksOJapg';
  var PAGE_URL = 'https://kreeative.xyz/concepts/jeere/';

  // Strings that the script writes itself, in both languages
  var STR = {
    fr: {
      today: 'Livré aujourd’hui', todayOrTomorrow: 'Livré aujourd’hui ou demain', tomorrow: 'Livré demain',
      errName: 'Écrivez votre prénom.',
      errPhone: 'Ce numéro ne semble pas complet. Vérifiez-le, avec l’indicatif du pays.',
      errConsent: 'Cochez la case pour que nous puissions vous écrire sur WhatsApp.',
      errNetwork: 'L’envoi n’a pas marché. Vérifiez votre connexion, puis réessayez.',
      sending: 'Envoi…',
      doneTitle: 'C’est noté, {name} !',
      doneText: 'Nous vous écrirons sur WhatsApp dès que votre place est prête.',
      dupTitle: 'Vous êtes déjà sur la liste !',
      dupText: 'Ce numéro est déjà inscrit. Nous vous écrirons sur WhatsApp très bientôt.',
      share: 'Je viens de rejoindre la liste d’attente de JEERE, la boutique en ligne de ceux qui vendent sur WhatsApp : '
    },
    en: {
      today: 'Delivered today', todayOrTomorrow: 'Delivered today or tomorrow', tomorrow: 'Delivered tomorrow',
      errName: 'Please write your first name.',
      errPhone: 'This number looks incomplete. Check it, including the country code.',
      errConsent: 'Tick the box so we can message you on WhatsApp.',
      errNetwork: 'That didn’t go through. Check your connection and try again.',
      sending: 'Sending…',
      doneTitle: 'You’re on the list, {name}!',
      doneText: 'We’ll message you on WhatsApp as soon as your spot is ready.',
      dupTitle: 'You’re already on the list!',
      dupText: 'This number is already signed up. We’ll message you on WhatsApp very soon.',
      share: 'I just joined the JEERE waitlist, the online store for people who sell on WhatsApp: '
    }
  };

  var lang = 'fr';
  var fmt;
  function s(key) { return STR[lang][key]; }
  // Prices in CFA francs, the French way (12 500 FCFA) or the English way (12,500 FCFA)
  function money(n) { return fmt.format(n).replace(/[   ]/g, ' ') + ' FCFA'; }

  /* ---------- Language ---------- */
  var cache = [];
  $$('[data-i18n]').forEach(function (el) { cache.push({ el: el, type: 'text', key: el.getAttribute('data-i18n'), fr: el.textContent }); });
  $$('[data-i18n-html]').forEach(function (el) { cache.push({ el: el, type: 'html', key: el.getAttribute('data-i18n-html'), fr: el.innerHTML }); });
  $$('[data-i18n-attr]').forEach(function (el) {
    el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
      var p = pair.split(':');
      cache.push({ el: el, type: 'attr', attr: p[0], key: p[1], fr: el.getAttribute(p[0]) });
    });
  });
  var frTitle = document.title;
  var frDesc = $('meta[name="description"]').getAttribute('content');

  function pickLang() {
    var q = /[?&]lang=(fr|en)\b/.exec(location.search);
    if (q) return q[1];
    try { var saved = localStorage.getItem('jeere-lang'); if (saved) return saved; } catch (e) {}
    return 'fr';
  }

  function applyLang(next, save) {
    lang = next === 'en' ? 'en' : 'fr';
    root.lang = lang === 'fr' ? 'fr-CI' : 'en';
    fmt = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 0 });
    cache.forEach(function (c) {
      var v = lang === 'en' && EN[c.key] !== undefined ? EN[c.key] : c.fr;
      if (c.type === 'text') c.el.textContent = v;
      else if (c.type === 'html') c.el.innerHTML = v;
      else c.el.setAttribute(c.attr, v);
    });
    document.title = lang === 'en' ? (EN['meta.title'] || frTitle) : frTitle;
    $('meta[name="description"]').setAttribute('content', lang === 'en' ? (EN['meta.description'] || frDesc) : frDesc);
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    if (save) { try { localStorage.setItem('jeere-lang', lang); } catch (e) {} }
    updateReceipt(false);
    setRole(currentRole());
    if (lastDone) showDone(lastDone.dup, lastDone.name, true);
  }

  $$('.lang button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.getAttribute('data-lang') !== lang) applyLang(b.getAttribute('data-lang'), true); });
  });

  /* ---------- Header border once the page scrolls ---------- */
  var head = $('[data-head]');
  function onScroll() { head.classList.toggle('is-stuck', window.scrollY > 4); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Delivery fee by commune ---------- */
  var SUBTOTAL = 13000;
  var feeOut = $('[data-fee-out]'), totalOut = $('[data-total-out]'), etaOut = $('[data-eta-out]'), communeOut = $('[data-commune]');
  function updateReceipt(animate) {
    var picked = $('input[name="commune"]:checked');
    if (!picked) return;
    var fee = +picked.getAttribute('data-fee');
    communeOut.textContent = picked.value;
    feeOut.textContent = money(fee);
    totalOut.textContent = money(SUBTOTAL + fee);
    $('[data-money]').textContent = money(SUBTOTAL);
    etaOut.textContent = fee <= 1500 ? s('today') : fee <= 2000 ? s('todayOrTomorrow') : s('tomorrow');
    if (animate) { totalOut.classList.remove('is-bump'); void totalOut.offsetWidth; totalOut.classList.add('is-bump'); }
  }
  $$('input[name="commune"]').forEach(function (r) { r.addEventListener('change', function () { updateReceipt(true); }); });

  /* ---------- Template preview tabs ---------- */
  var tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    var name = tab.getAttribute('aria-controls').replace('tpl-', '');
    $$('[data-tpl-desc]').forEach(function (p) { p.hidden = p.getAttribute('data-tpl-desc') !== name; });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0], true); }
      else if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1], true); }
      else if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- Waitlist form ---------- */
  var form = $('#waitlist');
  var errBox = $('[data-form-error]');
  var submit = $('[data-submit]');
  var done = $('[data-done]');
  var city = $('#f-city');

  function currentRole() { var r = $('input[name="role"]:checked', form); return r ? r.value : 'seller'; }
  function setRole(role) {
    $$('[data-for]', form).forEach(function (el) { el.hidden = el.getAttribute('data-for') !== role; });
    city.placeholder = city.getAttribute(role === 'buyer' ? 'data-ph-buyer' : 'data-ph-seller');
  }
  $$('input[name="role"]', form).forEach(function (r) { r.addEventListener('change', function () { setRole(currentRole()); }); });

  // Build an international number: +225 keeps its leading 0 (10-digit numbers since 2021);
  // elsewhere the national leading 0 is dropped (06… in France becomes +336…).
  function fullNumber() {
    var raw = form.phone.value.trim();
    var cc = form.cc.value;
    if (/^(\+|00)/.test(raw)) return '+' + raw.replace(/^00/, '').replace(/\D/g, '');
    var digits = raw.replace(/\D/g, '');
    if (cc !== '225') digits = digits.replace(/^0/, '');
    return '+' + cc + digits;
  }

  function source() {
    var q = new URLSearchParams(location.search);
    var parts = ['utm_source', 'utm_medium', 'utm_campaign'].map(function (k) { return q.get(k); }).filter(Boolean);
    if (!parts.length && document.referrer) { try { parts.push(new URL(document.referrer).hostname); } catch (e) {} }
    return parts.join(' / ').slice(0, 200) || null;
  }

  function showError(msg, field) {
    errBox.textContent = msg;
    errBox.hidden = false;
    $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  }

  var lastDone = null;
  function showDone(dup, name, quiet) {
    lastDone = { dup: dup, name: name };
    $('[data-done-title]').textContent = dup ? s('dupTitle') : s('doneTitle').replace('{name}', name);
    $('[data-done-text]').textContent = dup ? s('dupText') : s('doneText');
    $('[data-share]').href = 'https://wa.me/?text=' + encodeURIComponent(s('share') + PAGE_URL);
    form.hidden = true;
    done.hidden = false;
    if (!quiet) done.focus();
  }

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    errBox.hidden = true;
    if (form.website.value) { showDone(false, form.first_name.value.trim()); return; } // bot

    var name = form.first_name.value.trim();
    var number = fullNumber();
    if (!name) return showError(s('errName'), form.first_name);
    if (!/^\+[0-9]{8,15}$/.test(number)) return showError(s('errPhone'), form.phone);
    if (!form.consent.checked) return showError(s('errConsent'), form.consent);

    var role = currentRole();
    var seller = role === 'seller';
    var row = {
      role: role,
      first_name: name.slice(0, 80),
      whatsapp: number,
      city: form.city.value.trim().slice(0, 80) || null,
      lang: lang,
      source: source(),
      consent: true,
      pilot: seller && form.pilot.checked,
      shop_name: seller ? (form.shop_name.value.trim().slice(0, 120) || null) : null,
      category: seller ? (form.category.value || null) : null,
      channels: seller ? $$('input[name="channels"]:checked', form).map(function (c) { return c.value; }) : [],
      handle: seller ? (form.handle.value.trim().replace(/^@+/, '').slice(0, 80) || null) : null,
      budget: seller ? (form.budget.value || null) : null
    };

    busy = true;
    submit.disabled = true;
    var label = submit.querySelector('span');
    var before = label.textContent;
    label.textContent = s('sending');

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(SB_URL + '/rest/v1/jeere_waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SB_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (res.status === 201) return showDone(false, name);
      if (res.status === 409) return showDone(true, name);
      throw new Error('HTTP ' + res.status);
    }).catch(function () {
      showError(s('errNetwork'));
    }).then(function () {
      clearTimeout(timer);
      busy = false;
      submit.disabled = false;
      label.textContent = before;
    });
  });

  /* ---------- Gentle scroll-in for section headings and cards ---------- */
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var items = $$('.section__head, .compare__col, .promises li, .step, .plan, .receipt, .dia__card, .join__card');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { el.setAttribute('data-reveal', ''); io.observe(el); });
    // Show everything when printing
    window.addEventListener('beforeprint', function () { items.forEach(function (el) { el.classList.add('is-in'); }); });
  }

  applyLang(pickLang(), false);
})();
