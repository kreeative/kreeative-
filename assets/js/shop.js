/* Kreeative — shop: search box + category filter for the product grid */
(function () {
  var input = document.getElementById('sh-search');
  if (!input) return;
  var chips = document.querySelectorAll('.sh-chip');
  var tiles = document.querySelectorAll('.sh-grid .tile');
  var groups = document.querySelectorAll('.sh-group');
  var empty = document.querySelector('.sh-empty');
  var filter = 'all';

  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    tiles.forEach(function (t) {
      var ok = (filter === 'all' || t.dataset.cat === filter) && (!q || t.dataset.search.indexOf(q) !== -1);
      t.hidden = !ok;
      if (ok) shown++;
    });
    groups.forEach(function (g) {
      g.hidden = !g.querySelector('.tile:not([hidden])');
    });
    empty.hidden = shown > 0;
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      filter = c.dataset.filter;
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      apply();
    });
  });
  input.addEventListener('input', apply);
})();
