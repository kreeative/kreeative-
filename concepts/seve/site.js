/* SÈVE — concept by Kreeative: carousel, tabs, catalogue filters and sort, cart drawer, cart thumbnails,
   « Commander maintenant », reveal on scroll. Products, prices and the cart come from Jeere Connect
   (data-store="seve"); the checkout is commande/ (commande.js). */
(function () {
  'use strict';

  var me = document.currentScript;
  var BASE = me ? me.src.replace(/site\.js(\?.*)?$/, '') : '';

  // The photo of each product, for the cart lines (the store's fiche has no photos)
  var PHOTOS = {
    p1: 'img/gel-vanille.webp', p2: 'img/gel-santal.webp', p3: 'img/gel-musc.webp', p4: 'img/gel-bergamote.webp',
    p5: 'img/creme-corps-santal.webp', p6: 'img/creme-corps-bergamote.webp', p7: 'img/creme-mains.webp',
    p8: 'img/deodorant.webp', p9: 'img/huile-parfum-santal.webp'
  };
  function fillThumbs() {
    document.querySelectorAll('.ligne').forEach(function (line) {
      var img = line.querySelector('img');
      var b = line.querySelector('[data-jeere-inc]');
      var id = b ? b.getAttribute('data-jeere-inc') : '';
      if (img && id && PHOTOS[id] && !img.getAttribute('src')) img.src = BASE + PHOTOS[id];
    });
  }
  function syncCart(count) {
    document.querySelectorAll('[data-seve-checkout]').forEach(function (a) {
      if (count) a.removeAttribute('aria-disabled'); else a.setAttribute('aria-disabled', 'true');
    });
    document.querySelectorAll('.head__cart .count').forEach(function (c) {
      if (count) c.removeAttribute('data-zero'); else c.setAttribute('data-zero', '');
    });
  }
  document.addEventListener('jeere:cart', function (e) { fillThumbs(); syncCart(e.detail ? e.detail.count : 0); });
  document.addEventListener('jeere:ready', function () {
    fillThumbs();
    var c = window.JeereConnect && window.JeereConnect.cart();
    syncCart(c ? c.count : 0);
  });
  syncCart(0);

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var a = e.target.closest('[data-seve-checkout]');
    if (a && a.getAttribute('aria-disabled') === 'true') e.preventDefault();
    // « Commander maintenant »: this product in the cart (once), then the checkout
    var buy = e.target.closest('[data-seve-buy]');
    if (buy && window.JeereConnect) {
      var id = buy.getAttribute('data-seve-buy');
      var inCart = window.JeereConnect.cart().lines.some(function (l) { return l.id === id; });
      if (!inCart && !window.JeereConnect.add(id, 1)) e.preventDefault();
    }
  });

  /* ---------------------------------------------------------- carousel */
  document.querySelectorAll('[data-rail]').forEach(function (wrap) {
    var rail = wrap.querySelector('.rail');
    var bar = wrap.querySelector('.progress span');
    var prev = wrap.querySelector('[data-rail-prev]');
    var next = wrap.querySelector('[data-rail-next]');
    if (!rail) return;
    function step() {
      var card = rail.querySelector('.card:not([hidden])');
      return card ? card.getBoundingClientRect().width + 10 : rail.clientWidth * 0.8;
    }
    function update() {
      var max = rail.scrollWidth - rail.clientWidth;
      var vis = rail.scrollWidth ? rail.clientWidth / rail.scrollWidth : 1;
      if (bar) {
        bar.style.width = Math.min(100, vis * 100) + '%';
        bar.style.left = (max > 0 ? (rail.scrollLeft / max) * (100 - vis * 100) : 0) + '%';
      }
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft >= max - 2;
    }
    if (prev) prev.addEventListener('click', function () { rail.scrollBy({ left: -step(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { rail.scrollBy({ left: step(), behavior: 'smooth' }); });
    rail.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // tabs: Best-sellers / Nouveautés / Tout
    var tabs = wrap.querySelectorAll('[data-tab]');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var key = t.getAttribute('data-tab');
        tabs.forEach(function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
        rail.querySelectorAll('.card').forEach(function (c) {
          var tags = (c.getAttribute('data-tags') || '').split(' ');
          c.hidden = key !== 'tout' && tags.indexOf(key) === -1;
        });
        rail.scrollLeft = 0;
        update();
      });
    });
    update();
  });

  /* ---------------------------------------------------------- catalogue: filters and sort */
  var grid = document.querySelector('[data-catalog]');
  if (grid) {
    var filters = document.querySelectorAll('[data-filter]');
    var items = Array.prototype.slice.call(grid.querySelectorAll('.item'));
    var order = items.slice();
    filters.forEach(function (f) {
      f.addEventListener('click', function () {
        var cat = f.getAttribute('data-filter');
        filters.forEach(function (o) { o.setAttribute('aria-pressed', o === f ? 'true' : 'false'); });
        items.forEach(function (it) { it.hidden = cat !== 'tout' && it.getAttribute('data-cat') !== cat; });
        try { history.replaceState(null, '', cat === 'tout' ? location.pathname : '#' + cat); } catch (x) { /* ok */ }
      });
    });
    var sort = document.querySelector('[data-sort]');
    var modes = [['', 'Trier'], ['asc', 'Prix croissant'], ['desc', 'Prix décroissant']];
    var mode = 0;
    if (sort) sort.addEventListener('click', function () {
      mode = (mode + 1) % modes.length;
      sort.querySelector('span').textContent = modes[mode][1];
      var list = order.slice();
      var price = function (el) { return Number(el.getAttribute('data-price')) || 0; };
      if (modes[mode][0] === 'asc') list.sort(function (a, b) { return price(a) - price(b); });
      if (modes[mode][0] === 'desc') list.sort(function (a, b) { return price(b) - price(a); });
      list.forEach(function (el) { grid.appendChild(el); });
    });
    var start = location.hash.slice(1);
    var pre = start && document.querySelector('[data-filter="' + start.replace(/[^a-z-]/g, '') + '"]');
    if (pre) pre.click();
  }

  /* ---------------------------------------------------------- reveal on scroll */
  var rev = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    rev.forEach(function (el) { io.observe(el); });
  } else {
    document.documentElement.classList.add('revealed');
  }

  /* ---------------------------------------------------------- cart drawer */
  var panier = document.getElementById('panier');
  if (!panier) return;
  var opener = null;
  function open() {
    opener = document.activeElement;
    panier.classList.add('is-open');
    panier.setAttribute('aria-hidden', 'false');
    fillThumbs();
    var c = panier.querySelector('[data-cart-close]');
    if (c) c.focus();
  }
  function close() {
    panier.classList.remove('is-open');
    panier.setAttribute('aria-hidden', 'true');
    if (opener && opener.focus) opener.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest('[data-cart-open]')) { e.preventDefault(); open(); }
    else if (t.closest('[data-cart-close]')) { e.preventDefault(); close(); }
    else if (t.closest('[data-jeere-add]') && !t.closest('[data-jeere-add]').disabled) { setTimeout(open, 120); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panier.classList.contains('is-open')) close(); });
})();
