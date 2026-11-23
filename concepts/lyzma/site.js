/* Reveals on scroll (with a safety net), nothing else: bookings are jeere-booking.js. */
(function () {
  'use strict';
  var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  function show(el) { el.classList.add('is-in'); }
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(show); return; }
  var io = new IntersectionObserver(function (list) { list.forEach(function (x) { if (x.isIntersecting) { show(x.target); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (el) { io.observe(el); });
  setTimeout(function () { els.forEach(show); }, 3000);
})();
