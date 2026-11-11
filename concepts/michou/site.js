/* MICHOU — concept by Kreeative: header over the hero, size pickers (cards and product page), sizes kept
   with the cart, cart drawer, shop filters, reveal on scroll. Products, prices and the cart come from
   Jeere Connect (data-store="michou"); the checkout is commande/ (commande.js), which sends the sizes in
   the order's note. */
(function () {
  'use strict';

  var me = document.currentScript;
  var BASE = me ? me.src.replace(/site\.js(\?.*)?$/, '') : '';
  var SIZES_KEY = 'michou:tailles';

  // The photo of each product, for the cart lines (the store's fiche has no photos)
  var PHOTOS = {
    p1: 'img/tshirt-levres.webp', p2: 'img/tshirt-masque.webp', p3: 'img/tshirt-console.webp', p4: 'img/tshirt-racing.webp',
    p5: 'img/tshirt-croix.webp', p6: 'img/jort-noir.webp', p7: 'img/jort-brun.webp', p8: 'img/casquette-etoile.webp'
  };

  function jc() { return window.JeereConnect || null; }

  /* ---------------------------------------------------------- sizes, kept next to the cart */
  function readSizes() {
    try { var s = JSON.parse(localStorage.getItem(SIZES_KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; }
  }
  function writeSizes(s) { try { localStorage.setItem(SIZES_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  window.MichouSizes = { read: readSizes };

  // Keep one size per item: drop what left the cart, repeat the last size when « + » adds one in the drawer
  function syncSizes(lines) {
    var s = readSizes(), out = {};
    (lines || []).forEach(function (l) {
      var list = Array.isArray(s[l.id]) ? s[l.id].slice(0, l.qty) : [];
      while (list.length && list.length < l.qty) list.push(list[list.length - 1]);
      if (list.length) out[l.id] = list;
    });
    writeSizes(out);
    return out;
  }
  function sizeLabel(list) {
    if (!list || !list.length) return 'taille à préciser';
    var count = {};
    list.forEach(function (t) { count[t] = (count[t] || 0) + 1; });
    return 'taille ' + Object.keys(count).map(function (t) { return count[t] > 1 ? t + ' ×' + count[t] : t; }).join(', ');
  }

  function addWithSize(id, size) {
    var c = jc();
    if (!c || !c.add(id, 1)) return false;
    var s = readSizes();
    s[id] = (Array.isArray(s[id]) ? s[id] : []).concat(size);
    writeSizes(s);
    decorate();
    return true;
  }

  /* ---------------------------------------------------------- cart lines: photo and size */
  function decorate() {
    var sizes = readSizes();
    document.querySelectorAll('.ligne').forEach(function (line) {
      var b = line.querySelector('[data-jeere-inc]');
      var id = b ? b.getAttribute('data-jeere-inc') : '';
      var img = line.querySelector('img');
      if (img && id && PHOTOS[id] && !img.getAttribute('src')) img.src = BASE + PHOTOS[id];
      var t = line.querySelector('[data-michou-size]');
      if (t && id) t.textContent = sizeLabel(sizes[id]);
    });
  }
  function syncCheckout(count) {
    document.querySelectorAll('[data-michou-checkout]').forEach(function (a) {
      if (count) a.removeAttribute('aria-disabled'); else a.setAttribute('aria-disabled', 'true');
    });
  }
  document.addEventListener('jeere:cart', function (e) {
    var d = e.detail || {};
    syncSizes(d.lines);
    decorate();
    syncCheckout(d.count || 0);
  });
  document.addEventListener('jeere:ready', function () {
    var c = jc() && jc().cart();
    if (c) { syncSizes(c.lines); syncCheckout(c.count); }
    decorate();
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-michou-checkout]');
    if (a && a.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });

  /* ---------------------------------------------------------- header over the hero */
  var head = document.querySelector('.head--over');
  if (head) {
    var hero = document.querySelector('.hero');
    var onScroll = function () {
      var limit = hero ? hero.offsetHeight - 70 : 40;
      head.classList.toggle('is-solid', window.scrollY > limit);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------------- size picker on the cards */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var plus = e.target.closest('.card__plus');
    if (plus) {
      e.preventDefault();
      var card = plus.closest('.card');
      document.querySelectorAll('.card.is-sizing').forEach(function (c) { if (c !== card) c.classList.remove('is-sizing'); });
      card.classList.toggle('is-sizing');
      plus.setAttribute('aria-expanded', card.classList.contains('is-sizing') ? 'true' : 'false');
      return;
    }
    var size = e.target.closest('.sizes-pop .size');
    if (size) {
      e.preventDefault();
      var c = size.closest('.card');
      if (addWithSize(c.getAttribute('data-jeere-product'), size.textContent.trim())) {
        c.classList.remove('is-sizing');
        openCart();
      }
    }
  });

  /* ---------------------------------------------------------- size picker on the product page */
  var pdp = document.querySelector('.pdp');
  if (pdp) {
    var id = pdp.getAttribute('data-jeere-product');
    var btn = pdp.querySelector('.pdp__add');
    var msg = pdp.querySelector('.pdp__msg');
    var chosen = '';
    pdp.querySelectorAll('.pdp__sizes .size').forEach(function (b) {
      b.addEventListener('click', function () {
        chosen = b.textContent.trim();
        pdp.querySelectorAll('.pdp__sizes .size').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        btn.classList.add('is-ready');
        btn.querySelector('span').textContent = 'ajouter au panier — ' + chosen;
        if (msg) msg.textContent = '';
      });
    });
    btn.addEventListener('click', function () {
      if (!chosen) { if (msg) msg.textContent = 'choisissez une taille.'; return; }
      if (addWithSize(id, chosen)) { if (msg) msg.textContent = 'ajouté : taille ' + chosen + '.'; openCart(); }
      else if (msg) msg.textContent = 'cet article n’est plus disponible.';
    });
  }

  /* ---------------------------------------------------------- shop filters */
  var grid = document.querySelector('[data-catalog]');
  if (grid) {
    var filters = document.querySelectorAll('[data-filter]');
    var cards = grid.querySelectorAll('.card');
    filters.forEach(function (f) {
      f.addEventListener('click', function () {
        var cat = f.getAttribute('data-filter');
        filters.forEach(function (o) { o.setAttribute('aria-pressed', o === f ? 'true' : 'false'); });
        cards.forEach(function (c) { c.hidden = cat !== 'tout' && c.getAttribute('data-cat') !== cat; });
        try { history.replaceState(null, '', cat === 'tout' ? location.pathname : '#' + cat); } catch (x) { /* ok */ }
      });
    });
    var start = location.hash.slice(1).replace(/[^a-z-]/g, '');
    var pre = start && document.querySelector('[data-filter="' + start + '"]');
    if (pre) pre.click();
  }

  /* ---------------------------------------------------------- reveal on scroll */
  var rev = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    rev.forEach(function (el) { io.observe(el); });
  } else {
    document.documentElement.classList.add('revealed');
  }

  /* ---------------------------------------------------------- cart drawer */
  var panier = document.getElementById('panier');
  var opener = null;
  function openCart() {
    if (!panier) return;
    opener = document.activeElement;
    panier.classList.add('is-open');
    panier.setAttribute('aria-hidden', 'false');
    decorate();
    var c = panier.querySelector('[data-cart-close]');
    if (c) c.focus();
  }
  function closeCart() {
    if (!panier) return;
    panier.classList.remove('is-open');
    panier.setAttribute('aria-hidden', 'true');
    if (opener && opener.focus) opener.focus();
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); openCart(); }
    else if (e.target.closest('[data-cart-close]')) { e.preventDefault(); closeCart(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (panier && panier.classList.contains('is-open')) closeCart();
    document.querySelectorAll('.card.is-sizing').forEach(function (c) { c.classList.remove('is-sizing'); });
  });
})();
