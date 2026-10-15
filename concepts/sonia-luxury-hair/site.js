(function () {
  var root = document.documentElement;
  var M = window.Motion;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motion = !!(M && M.animate) && !reduce;
  var late = !root.classList.contains('motion-pending'); // the 3 s safety timeout already revealed the page
  var ease = [0.22, 1, 0.36, 1];
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  // Language: French by default, English on request. The choice is remembered on this device.
  var I18N = window.SLH_I18N || { fr: {}, en: {} };
  var lang = 'fr';
  var numbers = null;
  function t(key) { return (I18N[lang] && I18N[lang][key]) || (I18N.fr && I18N.fr[key]) || ''; }
  function fill(str, vars) { return str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }); }
  // Prices in CFA francs, written the same way in both languages: 45 000 F CFA / 45,000 F CFA
  function price(v) { return numbers.format(v) + ' F CFA'; }
  function storedLang() {
    var q = /[?&]lang=(fr|en)\b/.exec(location.search);
    if (q) return q[1];
    try { return localStorage.getItem('slh-lang'); } catch (e) { return null; }
  }
  function nameOf(p) { return t('n.' + p.getAttribute('data-id')); }

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    root.lang = lang === 'fr' ? 'fr-CI' : 'en';
    numbers = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 0 });
    $$('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (v) el.textContent = v; });
    $$('[data-i18n-html]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-html')); if (v) el.innerHTML = v; });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':'); var v = t(p[1].trim()); if (v) el.setAttribute(p[0].trim(), v);
      });
    });
    document.title = t('meta.title');
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));
    $$('[data-money]').forEach(function (el) { el.textContent = price(+el.getAttribute('data-money')); });
    $$('[data-product]').forEach(function (p) {
      $$('[data-add]', p).forEach(function (b) { b.setAttribute('aria-label', fill(t('add.aria'), { name: nameOf(p) })); });
    });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    renderWish();
    renderBag();
    renderLength(false);
    if (newsMsg && newsMsg.getAttribute('data-key')) newsMsg.textContent = t(newsMsg.getAttribute('data-key'));
    if (joinNote && joinNote.textContent) joinNote.textContent = t('circle.note');
    try { localStorage.setItem('slh-lang', lang); } catch (e) {}
  }

  // Hero: the name is set as wide as the hero, measured once the font has loaded
  var hero = $('.hero'), word = $('.hero__word'), wordName = $('.hero__name');
  function fitWord() {
    if (!hero || !word || !wordName) return;
    word.style.removeProperty('--w');
    var base = parseFloat(getComputedStyle(word).fontSize);
    var width = wordName.getBoundingClientRect().width;
    if (!width) return;
    var target = hero.clientWidth * (window.innerWidth <= 700 ? 0.94 : 0.9);
    word.style.setProperty('--w', Math.min(base * target / width, 520).toFixed(1) + 'px');
  }
  var fitQueued = false;
  window.addEventListener('resize', function () {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fitWord(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWord);
  fitWord();

  // Mobile menu
  var head = $('[data-head]');
  var toggle = $('.head__toggle');
  function closeMenu() { head.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = head.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.head__nav a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  }
  $$('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-lang') === lang) return;
      applyLang(b.getAttribute('data-lang'));
      if (head.classList.contains('is-open')) closeMenu();
      if (motion) M.animate('main', { opacity: [0.4, 1] }, { duration: 0.35, ease: 'easeOut' });
    });
  });

  // Favourites: in this concept they only live on the page
  var wished = {};
  function renderWish() {
    var n = Object.keys(wished).length;
    var count = $('[data-wish-count]');
    if (count) { count.textContent = n; count.hidden = n === 0; }
    var icon = $('.icon-btn--wish');
    if (icon) icon.classList.toggle('has-items', n > 0);
    $$('[data-wish]').forEach(function (b) {
      var p = b.closest('[data-product]');
      var on = !!wished[p.getAttribute('data-id')];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', fill(t(on ? 'wish.remove' : 'wish.add'), { name: nameOf(p) }));
    });
  }
  $$('[data-wish]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.closest('[data-product]').getAttribute('data-id');
      if (wished[id]) delete wished[id]; else wished[id] = true;
      renderWish();
      if (motion) M.animate($('svg', b), { scale: [0.6, 1.25, 1] }, { duration: 0.45, ease: 'easeOut' });
    });
  });

  // Bag: a drawer that adds up the pieces. Nothing is sent, stored or charged.
  var FREE_DELIVERY = 100000;
  var bag = [];
  var bagEl = $('#bag');
  var scrim = $('.scrim');
  var itemsEl = $('[data-bag-items]');
  var lastFocus = null;
  var live = $('[data-live]');

  function renderBag() {
    if (!itemsEl) return;
    var count = 0, total = 0;
    itemsEl.innerHTML = '';
    bag.forEach(function (item, i) {
      count += item.qty; total += item.qty * item.price;
      var name = t('n.' + item.id);
      var li = document.createElement('li');
      li.className = 'bag__item';
      li.innerHTML =
        '<div class="bag__thumb"><img alt="" width="400" height="500"></div>' +
        '<div><span class="bag__name"></span><span class="bag__type"></span>' +
        '<div class="qty" role="group"><button type="button" data-qty="-1">−</button><span></span><button type="button" data-qty="1">+</button></div></div>' +
        '<div><span class="bag__price"></span><button type="button" class="bag__remove"></button></div>';
      $('.bag__thumb img', li).src = item.photo;
      $('.bag__name', li).textContent = name;
      $('.bag__type', li).textContent = t('m.' + item.id);
      $('.qty', li).setAttribute('aria-label', t('bag.qty'));
      $('.qty span', li).textContent = item.qty;
      $('[data-qty="-1"]', li).setAttribute('aria-label', fill(t('bag.dec'), { name: name }));
      $('[data-qty="1"]', li).setAttribute('aria-label', fill(t('bag.inc'), { name: name }));
      $('.bag__price', li).textContent = price(item.qty * item.price);
      $('.bag__remove', li).textContent = t('bag.remove');
      $$('[data-qty]', li).forEach(function (b) {
        b.addEventListener('click', function () {
          var which = b.getAttribute('data-qty');
          item.qty += +which;
          if (item.qty < 1) bag.splice(i, 1);
          renderBag();
          refocus(i, '[data-qty="' + which + '"]');
        });
      });
      $('.bag__remove', li).addEventListener('click', function () { bag.splice(i, 1); renderBag(); refocus(i, '.bag__remove'); });
      itemsEl.appendChild(li);
    });
    var badge = $('[data-bag-count]');
    badge.textContent = count;
    badge.hidden = count === 0;
    $('[data-bag-n]').textContent = count ? '(' + count + ')' : '';
    $('[data-bag-empty]').hidden = count > 0;
    $('[data-bag-total]').textContent = price(total);
    var left = FREE_DELIVERY - total;
    $('[data-bag-ship]').textContent = left > 0 ? fill(t('bag.more'), { x: price(left) }) : t('bag.free');
    $('[data-bag-meter]').style.width = Math.min(100, total / FREE_DELIVERY * 100) + '%';
  }
  // After the list is redrawn, put focus back on the same control, or the nearest one left
  function refocus(i, sel) {
    var rows = itemsEl.children;
    var row = rows[Math.min(i, rows.length - 1)];
    var target = (row && $(sel, row)) || (row && $('button', row)) || $('.bag__head [data-bag-close]', bagEl);
    if (target) target.focus();
  }
  function openBag() {
    if (!bagEl.hidden) return;
    lastFocus = document.activeElement;
    bagEl.hidden = false; scrim.hidden = false;
    document.body.classList.add('no-scroll');
    if (motion) {
      M.animate(bagEl, { x: ['100%', '0%'] }, { duration: 0.5, ease: ease });
      M.animate(scrim, { opacity: [0, 1] }, { duration: 0.3 });
    }
    $('.bag__head [data-bag-close]').focus();
  }
  function closeBag() {
    if (bagEl.hidden) return;
    document.body.classList.remove('no-scroll');
    var done = function () { bagEl.hidden = true; scrim.hidden = true; bagEl.style.transform = ''; };
    if (motion) {
      M.animate(scrim, { opacity: [1, 0] }, { duration: 0.3 });
      M.animate(bagEl, { x: ['0%', '100%'] }, { duration: 0.35, ease: ease }).then(done);
    } else { done(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('[data-bag-open]').forEach(function (b) { b.addEventListener('click', openBag); });
  $$('[data-bag-close]').forEach(function (b) { b.addEventListener('click', closeBag); });
  document.addEventListener('keydown', function (e) {
    if (bagEl.hidden) return;
    if (e.key === 'Escape') { closeBag(); return; }
    if (e.key !== 'Tab') return;
    // Keep keyboard focus inside the open drawer
    var f = $$('button:not([disabled]), [href], input', bagEl).filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  $$('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.closest('[data-product]');
      var id = p.getAttribute('data-id');
      var found = bag.filter(function (x) { return x.id === id; })[0];
      if (found) found.qty += 1;
      else bag.push({ id: id, price: +p.getAttribute('data-price'), photo: p.getAttribute('data-photo'), qty: 1 });
      renderBag();
      if (live) live.textContent = fill(t('bag.added'), { name: nameOf(p) });
      openBag();
      if (motion) M.animate('[data-bag-count]', { scale: [0.4, 1.3, 1] }, { duration: 0.5, ease: 'easeOut' });
    });
  });

  // Length guide: the hair on the drawing grows to the chosen length
  var LENGTHS = [
    { inch: 12, y: 168, n: '2' }, { inch: 14, y: 192, n: '2' }, { inch: 16, y: 222, n: '3' }, { inch: 18, y: 252, n: '3' },
    { inch: 20, y: 282, n: '3' }, { inch: 22, y: 308, n: '3–4' }, { inch: 24, y: 330, n: '4' }, { inch: 26, y: 356, n: '4' },
    { inch: 28, y: 386, n: '4–5' }, { inch: 30, y: 416, n: '5' }
  ];
  var lenIdx = 3;
  var chipsEl = $('[data-len-chips]'), clip = $('[data-len-clip]'), line = $('[data-len-line]'), ticks = $('[data-len-ticks]');
  var currentY = LENGTHS[lenIdx].y, tween = 0;
  if (chipsEl) {
    LENGTHS.forEach(function (L, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = L.inch + '″';
      b.addEventListener('click', function () { lenIdx = i; renderLength(true); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        lenIdx = (lenIdx + d + LENGTHS.length) % LENGTHS.length;
        renderLength(true);
        chipsEl.children[lenIdx].focus();
      });
      chipsEl.appendChild(b);
    });
    var NS = 'http://www.w3.org/2000/svg';
    LENGTHS.forEach(function (L) {
      var g = document.createElementNS(NS, 'g');
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', 252); l.setAttribute('x2', 262); l.setAttribute('y1', L.y); l.setAttribute('y2', L.y);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', 268); tx.setAttribute('y', L.y + 3.5);
      tx.textContent = L.inch + '″';
      g.appendChild(l); g.appendChild(tx); ticks.appendChild(g);
    });
  }
  function setHair(y) {
    clip.setAttribute('height', y.toFixed(1));
    line.setAttribute('y1', y.toFixed(1)); line.setAttribute('y2', y.toFixed(1));
    currentY = y;
  }
  function renderLength(animate) {
    if (!chipsEl) return;
    var L = LENGTHS[lenIdx];
    $$('button', chipsEl).forEach(function (b, i) {
      b.setAttribute('aria-checked', i === lenIdx ? 'true' : 'false');
      b.tabIndex = i === lenIdx ? 0 : -1;
    });
    $$('g', ticks).forEach(function (g, i) { g.classList.toggle('on', i === lenIdx); });
    $('[data-len-in]').textContent = L.inch + '″';
    $('[data-len-cm]').textContent = Math.round(L.inch * 2.54) + ' cm';
    $('[data-len-copy]').textContent = t('len.' + L.inch);
    $('[data-len-bundles]').textContent = fill(t('len.bundles'), { n: L.n });
    cancelAnimationFrame(tween);
    if (!animate || reduce) { setHair(L.y); return; }
    var from = currentY, to = L.y, start = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - start) / 520);
      setHair(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) tween = requestAnimationFrame(step);
    })(start);
  }

  // The Circle: sign-ups are not open, the button says so
  var joinNote = $('[data-join-note]');
  var join = $('[data-join]');
  if (join) join.addEventListener('click', function () { joinNote.textContent = t('circle.note'); });

  // Newsletter: concept only, the address never leaves the page
  var news = document.getElementById('newsForm');
  var newsMsg = $('[data-news-msg]');
  if (news) {
    news.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = news.querySelector('input[type="email"]');
      var agree = $('[data-news-agree]', news);
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      var key = !valid ? 'news.bad' : (agree && !agree.checked ? 'news.need' : 'news.ok');
      newsMsg.setAttribute('data-key', key);
      newsMsg.textContent = t(key);
      if (key === 'news.ok') { input.value = ''; if (agree) agree.checked = false; }
    });
  }

  // The marquee loops seamlessly once its content is repeated past twice the screen width
  if (!reduce) {
    $$('.marquee').forEach(function (m) {
      var track = $('.marquee__track', m);
      var base = Array.prototype.slice.call(track.children);
      var copy = function () { base.forEach(function (c) { track.appendChild(c.cloneNode(true)); }); };
      while (track.scrollWidth < window.innerWidth * 2.4 && track.children.length < 80) copy();
      if ((track.children.length / base.length) % 2) copy();
      m.classList.add('is-looping');
    });
  }

  applyLang(storedLang() || 'fr');
  if (motion) initMotion();
  root.classList.remove('motion-pending');

  function initMotion() {
    var reveal = $$('[data-reveal]');
    var groups = $$('[data-stagger]');
    if (!late) $$('[data-hero], .hero__word').forEach(function (el) { el.style.opacity = '0'; });
    reveal.forEach(function (el) { el.style.opacity = '0'; });
    groups.forEach(function (g) { Array.prototype.slice.call(g.children).forEach(function (k) { k.style.opacity = '0'; }); });

    // Hero entrance: the name opens up, then the model rises in front of it
    if (!late) {
      M.animate('.hero__word', { opacity: [0, 1], letterSpacing: ['0.2em', '0.05em'] }, { duration: 1.4, ease: ease });
      M.animate('.hero__model', { opacity: [0, 1], y: [60, 0] }, { duration: 1.2, delay: 0.25, ease: ease });
      M.animate($$('.hero__eyebrow, .hero__lead, .hero__aside'), { opacity: [0, 1], y: [16, 0] }, { duration: 0.9, delay: M.stagger(0.1, { startDelay: 0.6 }), ease: ease });
    }
    M.inView(reveal, function (el) {
      M.animate(el, { opacity: [0, 1], y: [30, 0] }, { duration: 0.9, ease: ease }).then(function () { el.style.transform = ''; });
    }, { amount: 0.15 });
    groups.forEach(function (g) {
      var kids = Array.prototype.slice.call(g.children);
      M.inView(g, function () {
        // Clear the transform afterwards so hover effects work again
        M.animate(kids, { opacity: [0, 1], y: [36, 0] }, { duration: 0.85, delay: M.stagger(0.08), ease: ease })
          .then(function () { kids.forEach(function (k) { k.style.transform = ''; }); });
      }, { amount: 0.1 });
    });
    // The hang tags swing a little as they come into view
    var tags = $$('.htag');
    if (tags.length) {
      M.inView('.pack__scene', function () {
        tags.forEach(function (tag, i) {
          var r = i ? 3 : -4;
          M.animate(tag, { rotate: [r * 3, r] }, { duration: 1.4, delay: i * 0.12, ease: [0.34, 1.56, 0.64, 1] });
        });
      }, { amount: 0.3 });
    }
  }
})();
