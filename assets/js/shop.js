/* Kreeative — shop: the free guide moved to Teach, so old links to it are sent there */
(function () {
  function check() { if (location.hash === '#free-guide') location.replace('../teach/#free-guide'); }
  check();
  window.addEventListener('hashchange', check);
})();
