// Aïssa Kee portfolio: work filters, copy buttons, share.
(function () {
  var chips = document.querySelectorAll('[data-filter]');
  var items = document.querySelectorAll('[data-cat]');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      items.forEach(function (el) { el.hidden = !(f === 'all' || el.getAttribute('data-cat').split(' ').indexOf(f) > -1); });
    });
  });

  function flash(btn, text) {
    var old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1800);
  }
  function selectText(el) {
    var r = document.createRange(); r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function copy(text, btn, fallbackEl) {
    var done = function () { flash(btn, 'Copied'); };
    var fail = function () { if (fallbackEl) { selectText(fallbackEl); flash(btn, 'Selected, copy it'); } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (e) { fail(); }
  }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () { copy(btn.getAttribute('data-copy'), btn, document.getElementById('mail-addr')); });
  });
  document.querySelectorAll('[data-share]').forEach(function (btn) {
    btn.addEventListener('click', function () { copy(btn.getAttribute('data-share'), btn, null); });
  });
})();
