/* ANSE — concept by Kreeative: reveal on scroll, the cart drawer, cart thumbnails, the checkout link.
   Products, prices and the cart itself come from Jeere Connect (data-store="anse"). */
(function () {
  'use strict';

  // The site's folder (index, produits/<x>/, commande/ all load this same file)
  var me = document.currentScript;
  var BASE = me ? me.src.replace(/site\.js(\?.*)?$/, '') : '';

  // The cut-out photo of each product, for the cart lines (the store's fiche has no photos)
  var PHOTOS = {
    p1: 'img/sac-citrine.webp', p2: 'img/sac-dragee.webp', p3: 'img/sac-brume.webp', p4: 'img/sac-ruban.webp',
    p5: 'img/sac-olivier.webp', p6: 'img/sac-anneau.webp', p7: 'img/sac-cacao.webp', p8: 'img/sac-menthe.webp'
  };
  function fillThumbs() {
    document.querySelectorAll('.ligne').forEach(function (line) {
      var img = line.querySelector('img');
      var b = line.querySelector('[data-jeere-inc]');
      var id = b ? b.getAttribute('data-jeere-inc') : '';
      if (img && id && PHOTOS[id] && !img.getAttribute('src')) img.src = BASE + PHOTOS[id];
    });
  }

  // « Commander »: the site's own checkout, switched off while the cart is empty
  function syncCheckout(count) {
    document.querySelectorAll('[data-anse-checkout]').forEach(function (a) {
      if (count) a.removeAttribute('aria-disabled'); else a.setAttribute('aria-disabled', 'true');
    });
  }
  document.addEventListener('jeere:cart', function (e) {
    fillThumbs();
    syncCheckout(e.detail ? e.detail.count : 0);
  });
  document.addEventListener('jeere:ready', function () {
    fillThumbs();
    var c = window.JeereConnect && window.JeereConnect.cart();
    syncCheckout(c ? c.count : 0);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var a = e.target.closest('[data-anse-checkout]');
    if (a && a.getAttribute('aria-disabled') === 'true') e.preventDefault();
    // « Commander maintenant »: this bag in the cart (once), then the checkout
    var buy = e.target.closest('[data-anse-buy]');
    if (buy && window.JeereConnect) {
      var id = buy.getAttribute('data-anse-buy');
      var inCart = window.JeereConnect.cart().lines.some(function (l) { return l.id === id; });
      if (!inCart && !window.JeereConnect.add(id, 1)) { e.preventDefault(); }
    }
  });

  // Reveal on scroll
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    document.documentElement.classList.add('revealed');
  }

  // Cart drawer
  var panier = document.getElementById('panier');
  if (!panier) return;
  var opener = null;
  function open() {
    opener = document.activeElement;
    panier.classList.add('is-open');
    panier.setAttribute('aria-hidden', 'false');
    fillThumbs();
    var close = panier.querySelector('[data-cart-close]');
    if (close) close.focus();
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panier.classList.contains('is-open')) close();
  });
})();
