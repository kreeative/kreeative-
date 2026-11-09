/* ANSE — concept by Kreeative: reveal on scroll and the cart drawer.
   Products, prices and the cart itself come from Jeere Connect (data-store="anse"). */
(function () {
  'use strict';

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
