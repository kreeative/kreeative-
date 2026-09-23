/* Kreeative — site behaviour (no dependencies)
   - scroll-in "appear" animations           [data-appear]
   - hero headline letter split + blur-in    [data-split]
   - animated pixel strips                   [data-pixels]
   - phone navigation toggle                 .nav__toggle
   - projects grid column toggle             [data-columns]
   - meteors randomisation                   .meteor
*/
(function () {
  'use strict';
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- appear animations ---------------------------------------------- */
  function initAppear() {
    var els = document.querySelectorAll('[data-appear]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = parseFloat(el.getAttribute('data-appear-delay') || '0');
          if (delay) el.style.transitionDelay = delay + 'ms';
          el.classList.add('is-visible');
          io.unobserve(el);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- hero headline: split into words/letters ------------------------- */
  function initSplit() {
    document.querySelectorAll('[data-split]').forEach(function (el) {
      var index = 0;
      var nodes = Array.prototype.slice.call(el.childNodes);
      el.textContent = '';
      nodes.forEach(function (node) {
        if (node.nodeType === 3) {
          node.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
            var word = document.createElement('span');
            word.className = 'split-word';
            Array.prototype.forEach.call(part, function (ch) {
              var s = document.createElement('span');
              s.className = 'split-char';
              s.style.setProperty('--i', index++);
              s.textContent = ch;
              word.appendChild(s);
            });
            el.appendChild(word);
          });
        } else {
          el.appendChild(node);
        }
      });
      requestAnimationFrame(function () { el.classList.add('split-ready'); });
    });
  }

  /* ---- pixel canvas ----------------------------------------------------- */
  function initPixels() {
    document.querySelectorAll('[data-pixels]').forEach(function (wrap) {
      var canvas = wrap.querySelector('canvas') || wrap.appendChild(document.createElement('canvas'));
      var ctx = canvas.getContext('2d');
      var primary = wrap.getAttribute('data-primary') || 'rgb(255, 0, 144)';
      var secondary = wrap.getAttribute('data-secondary') || 'rgb(245, 245, 245)';
      var size = 4, gap = 2, step = size + gap, probability = 0.04, speed = 90;
      var cols, rows, cells = [], dpr = Math.min(window.devicePixelRatio || 1, 2), running = true;

      function build() {
        var w = wrap.clientWidth, h = wrap.clientHeight;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.ceil(w / step); rows = Math.ceil(h / step);
        cells = [];
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            var r = Math.random();
            cells.push({ x: x * step, y: y * step, on: r < probability * 1.6, primary: r < probability, phase: Math.random() * Math.PI * 2, rate: 0.4 + Math.random() * 1.2 });
          }
        }
      }
      function draw(t) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var time = t / 1000 * (speed / 60);
        for (var i = 0; i < cells.length; i++) {
          var c = cells[i];
          if (!c.on) continue;
          var a = 0.5 + 0.5 * Math.sin(time * c.rate + c.phase);
          if (a < 0.12) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = c.primary ? primary : secondary;
          ctx.fillRect(c.x, c.y, size, size);
        }
        ctx.globalAlpha = 1;
      }
      function loop(t) { if (!running) return; draw(t); requestAnimationFrame(loop); }
      build();
      if (reduceMotion) { draw(0); return; }
      requestAnimationFrame(loop);
      var ro = 'ResizeObserver' in window ? new ResizeObserver(function () { build(); }) : null;
      if (ro) ro.observe(wrap); else window.addEventListener('resize', build);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { var was = running; running = e.isIntersecting; if (running && !was) requestAnimationFrame(loop); });
        }).observe(wrap);
      }
    });
  }

  /* ---- meteors: random timing so they don't move in lockstep ---------- */
  function initMeteors() {
    document.querySelectorAll('.meteor').forEach(function (m, i) {
      m.style.setProperty('--meteor-duration', (4 + Math.random() * 5).toFixed(2) + 's');
      m.style.setProperty('--meteor-delay', (-Math.random() * 8).toFixed(2) + 's');
      m.style.setProperty('--meteor-travel', Math.round(700 + Math.random() * 700) + 'px');
    });
  }

  /* ---- phone navigation ------------------------------------------------- */
  function initNav() {
    var nav = document.querySelector('.nav');
    var toggle = nav && nav.querySelector('.nav__toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.nav__link').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
  }

  /* ---- projects grid: 2 columns / 1 column toggle ----------------------- */
  function initColumns() {
    var grid = document.querySelector('[data-columns]');
    if (!grid) return;
    var buttons = document.querySelectorAll('[data-columns-set]');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-columns-set');
        grid.setAttribute('data-columns', n);
        buttons.forEach(function (x) { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      });
    });
  }

  /* ---- boot ------------------------------------------------------------- */
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    initSplit();
    initAppear();
    initMeteors();
    initNav();
    initColumns();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(initPixels); } else { initPixels(); }
  });
})();
