/* L’ADRESSE — the page's few behaviours: the drawn rings of the hero, the properties and their filter, the enlarged
 * view of a property, and the two request forms (they open the visitor's own mail, addressed to the agency, with
 * everything she typed: nothing is stored anywhere). */
(function () {
  'use strict';
  var MAIL = 'contact@ladresse-premium.com';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // the hero's drawing: rings, like the grain of wood, inside the shape of a house
  var rings = $('#rings');
  if (rings) { var h = ''; for (var r = 10; r < 330; r += 9) h += '<circle cx="160" cy="250" r="' + r + '"/>'; rings.innerHTML = h; }

  // the properties
  var biens = Array.isArray(window.LADRESSE_BIENS) ? window.LADRESSE_BIENS : [];
  var grid = $('#grid'), none = $('#none'), filter = 'tous';
  var LABEL = { louer: 'À louer', vendre: 'À vendre' };
  function draw() {
    var list = biens.filter(function (b) { return filter === 'tous' || b.type === filter; });
    grid.innerHTML = list.map(function (b) {
      var i = biens.indexOf(b);
      return '<button class="bien" type="button" data-bien="' + i + '">' +
        '<span class="bien__pic">' + (b.photos && b.photos[0] ? '<img src="' + esc(b.photos[0]) + '" alt="" loading="lazy">' : '') + '<span class="bien__tag">' + esc(LABEL[b.type] || '') + '</span></span>' +
        '<span class="bien__b"><span class="bien__where">' + esc([b.district, b.city].filter(Boolean).join(' · ')) + '</span><h3>' + esc(b.name) + '</h3><span class="bien__desc">' + esc(b.desc) + '</span>' +
        '<span class="bien__foot"><span class="bien__price">' + esc(b.price) + '</span><span class="bien__go">Demander une visite</span></span></span></button>';
    }).join('');
    none.hidden = list.length > 0;
  }
  $$('[data-filter]').forEach(function (p) {
    p.addEventListener('click', function () {
      filter = p.getAttribute('data-filter');
      $$('[data-filter]').forEach(function (o) { o.setAttribute('aria-pressed', o === p ? 'true' : 'false'); });
      draw();
    });
  });
  if (grid) draw();

  // a property, enlarged: its pictures, its criteria, and the request for a visit
  var sheet = $('#sheet'), body = $('#sheet-body');
  function mailto(subject, lines) { return 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n')); }
  document.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('[data-bien]') : null;
    if (card && sheet) {
      var b = biens[+card.getAttribute('data-bien')];
      if (!b) return;
      var pics = b.photos && b.photos.length ? b.photos.map(function (u) { return '<img src="' + esc(u) + '" alt="">'; }).join('') : '<div></div>';
      body.innerHTML = '<div class="sheet__pics">' + pics + '</div><div class="sheet__b"><p class="bien__where">' + esc((LABEL[b.type] || '') + ' · ' + [b.district, b.city].filter(Boolean).join(' · ')) + '</p>' +
        '<h2 id="sheet-t">' + esc(b.name) + '</h2><p>' + esc(b.desc) + '</p><ul class="sheet__crit">' + (b.criteria || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
        '<p class="bien__price">' + esc(b.price) + '</p><p><a class="btn btn--dark" href="' + esc(mailto('Demande de visite : ' + b.name, ['Bonjour,', '', 'Je souhaite visiter le bien « ' + b.name + ' » (' + [b.district, b.city].filter(Boolean).join(', ') + ').', '', 'Mon nom : ', 'Mon téléphone : ', 'Mes disponibilités : '])) + '">Demander une visite</a></p></div>';
      if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
      return;
    }
    if (sheet && (e.target === sheet || (e.target.closest && e.target.closest('[data-close]')))) { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); }
  });

  // the two request forms
  $$('form[data-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('.err', f), lines = ['Bonjour,', ''], ok = true;
      $$('input, select, textarea', f).forEach(function (el) {
        var v = String(el.value || '').trim();
        if (el.required && !v) ok = false;
        if (v) lines.push(el.name + ' : ' + v);
      });
      if (err) err.hidden = ok;
      if (!ok) return;
      window.location.href = mailto(f.getAttribute('data-form') + ' : nouvelle demande', lines);
    });
  });
})();
