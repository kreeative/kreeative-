(function () {
  var root = document.documentElement;
  var M = window.Motion;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motion = !!(M && M.animate) && !reduce;
  var late = !root.classList.contains('motion-pending'); // the 3 s safety timeout already revealed the page
  var ease = [0.22, 1, 0.36, 1];
  var pop = [0.34, 1.56, 0.64, 1];
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  // Language: French by default, English on request. The choice is remembered on this device.
  var I18N = window.JS_I18N || { fr: {}, en: {} };
  var lang = 'fr';
  var money = null;
  function t(key) { return (I18N[lang] && I18N[lang][key]) || (I18N.fr && I18N.fr[key]) || ''; }
  function fill(str, vars) { return str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }); }
  function price(v) { return money.format(v); }
  function storedLang() {
    var q = /[?&]lang=(fr|en)\b/.exec(location.search);
    if (q) return q[1];
    try { return localStorage.getItem('js-lang'); } catch (e) { return null; }
  }
  function nameOf(el) {
    var n = el.querySelector('.card__name');
    return n ? n.textContent.trim() : '';
  }

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    root.lang = lang === 'fr' ? 'fr-CA' : 'en-CA';
    money = new Intl.NumberFormat(root.lang, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
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
    var dates = new Intl.DateTimeFormat(root.lang, { day: 'numeric', month: 'long', year: 'numeric' });
    $$('time[data-date]').forEach(function (el) {
      var iso = el.getAttribute('data-date');
      el.setAttribute('datetime', iso);
      el.textContent = dates.format(new Date(iso + 'T12:00:00'));
    });
    // Labels that carry the product name
    $$('[data-product]').forEach(function (p) {
      var name = nameOf(p);
      $$('[data-add]', p).forEach(function (b) { b.setAttribute('aria-label', fill(t('add.aria'), { name: name })); });
    });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    renderWish();
    renderBag();
    renderReview(false);
    fitTitle();
    if (newsMsg && newsMsg.getAttribute('data-key')) newsMsg.textContent = t(newsMsg.getAttribute('data-key'));
    try { localStorage.setItem('js-lang', lang); } catch (e) {}
  }

  // Hero title: as large as the width allows, like the mockup. Measured once the font has loaded.
  var titleWrap = $('.hero__titlewrap'), titleEl = $('.hero__title');
  function fitTitle() {
    if (!titleWrap || !titleEl) return;
    titleWrap.style.removeProperty('--t');
    var base = parseFloat(getComputedStyle(titleEl).fontSize);
    var range = document.createRange();
    range.selectNodeContents(titleEl);
    var widest = 0;
    Array.prototype.forEach.call(range.getClientRects(), function (r) { widest = Math.max(widest, r.width); });
    if (!widest) return;
    var size = Math.min(base * titleWrap.clientWidth * 0.95 / widest, window.innerWidth <= 700 ? 132 : 250);
    titleWrap.style.setProperty('--t', size.toFixed(1) + 'px');
  }
  var fitQueued = false;
  window.addEventListener('resize', function () {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fitTitle(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);

  // Header: white type over the hero, a white bar once the hero has scrolled past it
  var head = $('[data-head]');
  var hero = $('.hero');
  function updateHead() {
    if (!head) return;
    head.classList.toggle('is-solid', !hero || hero.getBoundingClientRect().bottom <= head.offsetHeight + 1);
  }
  window.addEventListener('scroll', updateHead, { passive: true });
  window.addEventListener('resize', updateHead);
  updateHead();

  // Mobile menu
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
  var FREE_SHIPPING = 75;
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
      var li = document.createElement('li');
      li.className = 'bag__item';
      li.innerHTML =
        '<div class="bag__thumb"><img alt="" width="480" height="600"></div>' +
        '<div><span class="bag__name"></span><span class="bag__type"></span>' +
        '<div class="qty" role="group"><button type="button" data-qty="-1">−</button><span></span><button type="button" data-qty="1">+</button></div></div>' +
        '<div><span class="bag__price"></span><button type="button" class="bag__remove"></button></div>';
      $('.bag__thumb img', li).src = item.photo;
      $('.bag__name', li).textContent = t('n.' + item.id);
      $('.bag__type', li).textContent = t('p.' + item.id) + ' · ' + t('c.' + item.cw);
      $('.qty', li).setAttribute('aria-label', t('bag.qty'));
      $('.qty span', li).textContent = item.qty;
      $('[data-qty="-1"]', li).setAttribute('aria-label', fill(t('bag.dec'), { name: t('n.' + item.id) }));
      $('[data-qty="1"]', li).setAttribute('aria-label', fill(t('bag.inc'), { name: t('n.' + item.id) }));
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
    var left = FREE_SHIPPING - total;
    $('[data-bag-ship]').textContent = left > 0 ? fill(t('bag.more'), { x: price(left) }) : t('bag.free');
    $('[data-bag-meter]').style.width = Math.min(100, total / FREE_SHIPPING * 100) + '%';
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
      else bag.push({ id: id, cw: p.getAttribute('data-cw'), price: +p.getAttribute('data-price'), photo: p.getAttribute('data-photo'), qty: 1 });
      renderBag();
      if (live) live.textContent = fill(t('bag.added'), { name: nameOf(p) });
      openBag();
      if (motion) M.animate('[data-bag-count]', { scale: [0.4, 1.3, 1] }, { duration: 0.5, ease: 'easeOut' });
    });
  });

  // Best sellers: arrows scroll one card at a time
  var carousel = $('[data-carousel]');
  if (carousel) {
    var arrows = $$('[data-scroll]');
    var updateArrows = function () {
      var max = carousel.scrollWidth - carousel.clientWidth - 2;
      arrows.forEach(function (a) { a.disabled = +a.getAttribute('data-scroll') < 0 ? carousel.scrollLeft <= 2 : carousel.scrollLeft >= max; });
    };
    arrows.forEach(function (a) {
      a.addEventListener('click', function () {
        var card = carousel.firstElementChild;
        var step = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(carousel).columnGap || 0) : 300;
        carousel.scrollBy({ left: +a.getAttribute('data-scroll') * step, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    carousel.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    updateArrows();
  }

  // Reviews: samples written for the concept, one at a time
  var REVIEWS = [
    { key: 'rev.1', name: 'Maude L.', city: 'Québec' },
    { key: 'rev.2', name: 'Sarah B.', city: 'Montréal' },
    { key: 'rev.3', name: 'Élise R.', city: 'Gatineau' }
  ];
  var ri = 0;
  var quoteEl = $('[data-review-quote]'), nameEl = $('[data-review-name]'), cityEl = $('[data-review-city]');
  function renderReview(animate) {
    if (!quoteEl) return;
    var r = REVIEWS[ri];
    quoteEl.textContent = t(r.key);
    nameEl.textContent = r.name;
    cityEl.textContent = r.city;
    if (animate && motion) {
      M.animate([nameEl, cityEl, quoteEl], { opacity: [0, 1], y: [12, 0] }, { duration: 0.5, delay: M.stagger(0.05), ease: ease });
      M.animate('.review__heart', { scale: [0.86, 1] }, { duration: 0.5, ease: pop });
    }
  }
  $$('[data-review]').forEach(function (b) {
    b.addEventListener('click', function () {
      ri = (ri + +b.getAttribute('data-review') + REVIEWS.length) % REVIEWS.length;
      renderReview(true);
    });
  });

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

  // Ribbons loop seamlessly once their content is repeated past twice the screen width
  if (!reduce) {
    $$('.ribbon').forEach(function (r) {
      var track = $('.ribbon__track', r);
      var base = Array.prototype.slice.call(track.children);
      var copy = function () { base.forEach(function (c) { var k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); track.appendChild(k); }); };
      while (track.scrollWidth < window.innerWidth * 2.4 && track.children.length < 40) copy();
      // An even number of copies keeps the -50% loop seamless
      if ((track.children.length / base.length) % 2) copy();
      r.classList.add('is-looping');
    });
  }

  applyLang(storedLang() || 'fr');
  if (motion) initMotion();
  root.classList.remove('motion-pending');

  function initMotion() {
    var reveal = $$('[data-reveal]');
    var groups = $$('[data-stagger]');
    if (!late) $$('[data-hero], .ribbon--hero').forEach(function (el) { el.style.opacity = '0'; });
    reveal.forEach(function (el) { el.style.opacity = '0'; });
    groups.forEach(function (g) { Array.prototype.slice.call(g.children).forEach(function (k) { k.style.opacity = '0'; }); });

    // Hero entrance: the photo settles, the title rises, the ribbon unrolls across it
    if (!late) {
      M.animate('.hero__photo', { scale: [1.08, 1] }, { duration: 1.6, ease: ease });
      M.animate('.hero__title', { opacity: [0, 1], y: [40, 0] }, { duration: 1.1, delay: 0.15, ease: ease });
      M.animate('.ribbon--hero', { opacity: [0, 1], clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] }, { duration: 1.1, delay: 0.5, ease: ease });
      M.animate($$('.hero__labels, .hero__lead, .hero .pill'), { opacity: [0, 1], y: [20, 0] }, { duration: 0.9, delay: M.stagger(0.1, { startDelay: 0.7 }), ease: ease });
    }

    // Scroll reveals
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

    // About: the set settles into place, as if laid down on the page
    var setImg = $('.about__art img');
    if (setImg) {
      setImg.style.opacity = '0';
      M.inView(setImg, function () {
        M.animate(setImg, { opacity: [0, 1], rotate: [-6, 0], scale: [0.92, 1], y: [24, 0] }, { duration: 1.1, ease: ease })
          .then(function () { setImg.style.transform = ''; });
      }, { amount: 0.3 });
    }
  }
})();
