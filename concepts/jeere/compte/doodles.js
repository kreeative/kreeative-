/* Jeere — the black panel of compte/ (desktop): small products drawn with the brush, all over the black.
   The same hand as the landing's stall (anim/boutique.js): every line is a bundle of 2 or 3 thin strands that
   drift and sometimes cross, landing and lifting a little apart, with a round drop now and then where the
   brush lifts. Bags, baskets, jars, sandals, pagnes, jewels, shea butter… scattered on a loose grid, turned a
   little: a half-drop pattern, like a printed wax, faint white on black; under the text the pattern goes on, dimmer. Seeded: the same drawing on every visit.
   They draw themselves in once; with reduced motion they are simply there. No library. */
(function () {
  'use strict';

  var aside = document.querySelector('.c-aside');
  if (!aside) return;
  var NS = 'http://www.w3.org/2000/svg';
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- The products, each in a 100×100 box ----------
     p: a line (x, y, x, y…), smoothed; lin: straight segments; e: an ellipse (cx, cy, rx, ry); fill: a solid drop. */
  var PRODUCTS = [
    // handbag
    [{ p: [16, 42, 84, 42, 90, 90, 10, 90, 16, 42], lin: 1 }, { p: [32, 42, 34, 20, 50, 13, 66, 20, 68, 42] }, { p: [44, 58, 56, 58], lin: 1 }],
    // woven basket
    [{ e: [50, 34, 38, 9] }, { p: [12, 34, 20, 88, 80, 88, 88, 34] }, { p: [16, 56, 84, 56] }, { p: [18, 72, 82, 72] }],
    // clay jar
    [{ p: [38, 10, 62, 10, 60, 20, 80, 40, 84, 62, 72, 86, 50, 92, 28, 86, 16, 62, 20, 40, 40, 20, 38, 10] }, { p: [22, 52, 36, 46, 50, 52, 64, 46, 78, 52] }],
    // bottle of oil or perfume
    [{ p: [42, 6, 58, 6, 58, 24, 70, 36, 70, 92, 30, 92, 30, 36, 42, 24, 42, 6] }, { p: [30, 56, 70, 56], lin: 1 }, { p: [30, 74, 70, 74], lin: 1 }],
    // sneaker
    [{ p: [8, 70, 10, 48, 30, 44, 46, 30, 58, 34, 64, 50, 92, 60, 94, 78, 8, 78, 8, 70] }, { p: [9, 70, 93, 70] }, { p: [40, 40, 48, 47], lin: 1 }, { p: [47, 35, 55, 42], lin: 1 }],
    // dress
    [{ p: [38, 6, 44, 22, 56, 22, 62, 6, 70, 13, 62, 38, 82, 94, 18, 94, 38, 38, 30, 13, 38, 6] }, { p: [36, 40, 64, 40] }],
    // t-shirt
    [{ p: [30, 12, 42, 19, 58, 19, 70, 12, 92, 30, 82, 44, 74, 38, 74, 90, 26, 90, 26, 38, 18, 44, 8, 30, 30, 12], lin: 1 }],
    // beaded bracelet
    [{ e: [50, 50, 36, 30] }, { e: [24, 42, 4, 4], fill: 1 }, { e: [50, 20, 4, 4], fill: 1 }, { e: [77, 40, 4, 4], fill: 1 }, { e: [70, 74, 4, 4], fill: 1 }, { e: [32, 74, 4, 4], fill: 1 }],
    // necklace with a pendant
    [{ p: [14, 10, 20, 46, 50, 72, 80, 46, 86, 10] }, { e: [50, 84, 7, 9], fill: 1 }],
    // sandal
    [{ e: [50, 54, 22, 40] }, { p: [30, 36, 50, 28, 70, 36] }, { p: [29, 58, 71, 58] }],
    // straw hat
    [{ e: [50, 72, 46, 12] }, { p: [24, 70, 28, 40, 50, 30, 72, 40, 76, 70] }, { p: [27, 60, 73, 60] }],
    // earrings
    [{ p: [30, 8, 30, 30] }, { e: [30, 46, 10, 14] }, { p: [70, 8, 70, 30] }, { e: [70, 46, 10, 14] }],
    // phone
    [{ p: [28, 6, 72, 6, 72, 94, 28, 94, 28, 6], lin: 1 }, { p: [44, 84, 56, 84], lin: 1 }],
    // pot of shea butter
    [{ e: [50, 30, 32, 9] }, { p: [18, 30, 22, 84, 78, 84, 82, 30] }, { p: [19, 46, 81, 46] }],
    // roll of pagne
    [{ e: [20, 50, 11, 30] }, { p: [20, 20, 88, 20], lin: 1 }, { p: [20, 80, 88, 80], lin: 1 }, { p: [88, 20, 88, 80], lin: 1 }, { p: [38, 32, 46, 44, 54, 32, 62, 44, 70, 32], lin: 1 }, { p: [38, 58, 46, 70, 54, 58, 62, 70, 70, 58], lin: 1 }],
    // calabash bowl
    [{ e: [50, 40, 42, 9] }, { p: [8, 40, 20, 74, 50, 86, 80, 74, 92, 40] }],
    // sunglasses
    [{ e: [28, 52, 17, 13] }, { e: [72, 52, 17, 13] }, { p: [45, 50, 55, 50] }, { p: [11, 46, 4, 38] }, { p: [89, 46, 96, 38] }],
    // tote bag
    [{ p: [18, 32, 82, 32, 88, 92, 12, 92, 18, 32], lin: 1 }, { p: [34, 32, 36, 12, 50, 7, 64, 12, 66, 32] }]
  ];

  /* ---------- Seeded randomness and geometry (as in anim/boutique.js) ---------- */
  var seed = 11;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function gauss(s) { return (rnd() + rnd() + rnd() - 1.5) * s * 1.15; }
  function len(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function pairs(a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }
  function subdivide(pts, step, wob) {
    var o = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = len(a, b), k = Math.floor(L / step);
      var nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      for (var j = 1; j <= k; j++) { var fr = j / (k + 1), g = gauss(wob); o.push([a[0] + (b[0] - a[0]) * fr + nx * g, a[1] + (b[1] - a[1]) * fr + ny * g]); }
      o.push(b);
    }
    return o;
  }
  function cumul(pts) { var c = [0]; for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + len(pts[i - 1], pts[i])); return c; }
  function normals(pts) {
    return pts.map(function (q, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = len(a, b) || 1;
      return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    });
  }
  function trim(pts, f0, f1) {
    var cum = cumul(pts), T = cum[cum.length - 1], a = T * f0, b = T * f1, o = [];
    function at(s) { for (var i = 1; i < pts.length; i++) if (cum[i] >= s) { var fr = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * fr, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * fr]; } return pts[pts.length - 1]; }
    o.push(at(a));
    for (var i = 1; i < pts.length - 1; i++) if (cum[i] > a && cum[i] < b) o.push(pts[i]);
    o.push(at(b));
    return o;
  }
  function ellipse(e, dr, turns, a0, jit) {
    var o = [], step = Math.PI / 10;
    for (var a = 0; a <= turns * Math.PI * 2; a += step) { var j = 1 + gauss(jit); o.push([e[0] + Math.cos(a0 + a) * (e[2] + dr) * j, e[1] + Math.sin(a0 + a) * (e[3] + dr) * j]); }
    return o;
  }
  function f(v) { return Math.round(v * 10) / 10; }
  function smooth(pts) {
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    if (pts.length === 2) return d + 'L' + f(pts[1][0]) + ' ' + f(pts[1][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  }
  function poly(pts) { return 'M' + pts.map(function (q) { return f(q[0]) + ' ' + f(q[1]); }).join('L'); }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- Build ---------- */
  var svg = null, builtFor = '';

  function build(animate) {
    var box = aside.getBoundingClientRect();
    var W = Math.round(box.width), H = Math.round(box.height);
    if (!W || !H) return;
    var key = W + 'x' + H;
    if (key === builtFor) return;
    builtFor = key;
    seed = 11;
    if (svg) svg.remove();
    svg = el('svg', { class: 'c-aside__ink', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
    var g = el('g', { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    aside.insertBefore(svg, aside.firstChild);

    // Where the text is (each line measured by its own ink): the products under it are kept, but dimmed, so the
    // pattern runs on unbroken and the words stay first
    var keep = [];
    Array.prototype.forEach.call(aside.querySelectorAll('.c-aside__top > *, .c-perks li'), function (n0) {
      var rg = document.createRange(); rg.selectNodeContents(n0);
      Array.prototype.forEach.call(rg.getClientRects(), function (r0) {
        if (r0.width && r0.height) keep.push([r0.left - box.left - 10, r0.top - box.top - 8, r0.right - box.left + 10, r0.bottom - box.top + 8]);
      });
    });
    function underText(x, y, half) {
      return keep.some(function (k) { return !(x + half < k[0] || x - half > k[2] || y + half < k[1] || y - half > k[3]); });
    }

    // The pattern: a half-drop repeat, like a printed wax. Same size everywhere, every other row shifted by half a
    // step, the products in a fixed order that slides along each row (so no two neighbours are the same), and a
    // tilt that alternates left / right like a check.
    var step = Math.max(104, Math.min(136, W / 4.6)), rowH = step * .9, size = step * .6;
    var cols = Math.ceil(W / step) + 2, rows = Math.ceil(H / rowH) + 2;
    var x0 = (W - (cols - 1) * step) / 2, y0 = (H - (rows - 1) * rowH) / 2, delay = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cx = x0 + c * step + (r % 2 ? step / 2 : 0), cy = y0 + r * rowH;
        if (cx < -size * .4 || cx > W + size * .4 || cy < -size * .4 || cy > H + size * .4) continue;
        var item = PRODUCTS[(c * 2 + r * 5) % PRODUCTS.length];
        var rot = ((r + c) % 2 ? 1 : -1) * .16 + gauss(.03), k = size / 100;
        var dim = underText(cx, cy, size * .5);
        drawProduct(item, cx, cy, k, rot, dim, delay);
        delay += dim ? .02 : .05;
      }
    }

    function drawProduct(item, cx, cy, k, rot, dim, t0) {
      var cs = Math.cos(rot), sn = Math.sin(rot);
      function tf(q) { var x = (q[0] - 50) * k, y = (q[1] - 50) * k; return [cx + x * cs - y * sn, cy + x * sn + y * cs]; }
      var pg = el('g', { class: dim ? 'c-ink__p is-dim' : 'c-ink__p' }, g);
      item.forEach(function (L, li) {
        var t = t0 + li * .12;
        if (L.fill) {
          var dp = el('path', { d: smooth(ellipse(L.e, .6, 1.02, rr(0, 6), .04).map(tf)) + 'Z', class: 'c-ink__dot', fill: 'currentColor', stroke: 'none' }, pg);
          dp.style.transitionDelay = Math.round((t + .3) * 1000) + 'ms';
          return;
        }
        // bold like the logo: 3 or 4 strands, close enough to touch, a little heavier than a pen
        var nStr = rnd() < .45 ? 4 : 3, sw = rr(1.9, 2.4), sp = sw * rr(1.15, 1.35);
        var base = L.e ? ellipse(L.e, 0, rr(1.05, 1.15), rr(0, 6.28), .03).map(tf) : subdivide(pairs(L.p).map(tf), 14, L.lin ? .3 : .55);
        var nrm = normals(base), cum = cumul(base), lam = rr(60, 140), drift = sp * rr(.35, .6);
        for (var s2 = 0; s2 < nStr; s2++) {
          var off = (s2 - (nStr - 1) / 2) * sp + gauss(sp * .25), ph = rr(0, 6.28), dr = drift * rr(.6, 1.2);
          var pts = base.map(function (q, i) { var o = off + dr * Math.sin(cum[i] / lam * 6.283 + ph); return [q[0] + nrm[i][0] * o + gauss(.3), q[1] + nrm[i][1] * o + gauss(.3)]; });
          if (!L.e) pts = trim(pts, Math.max(0, rr(-.02, .06)), Math.min(1, rr(.94, 1.02)));
          var path = el('path', { d: L.lin ? poly(pts) : smooth(pts), pathLength: 1, class: 'c-ink__s', 'stroke-width': f(sw * rr(.85, 1.15)) }, pg);
          path.style.transitionDelay = Math.round((t + s2 * .04) * 1000) + 'ms';
          path.style.transitionDuration = Math.round(rr(.45, .7) * 1000) + 'ms';
          // a drop where the brush lifts, as on the logo
          if (!L.e && rnd() < .4) {
            var tip = pts[pts.length - 1];
            var dot = el('path', { d: 'M' + f(tip[0]) + ' ' + f(tip[1]) + 'h.1', class: 'c-ink__dot', 'stroke-width': f(sw * rr(1.7, 2.2)) }, pg);
            dot.style.transitionDelay = Math.round((t + .55) * 1000) + 'ms';
          }
        }
      });
    }

    if (!animate) { svg.classList.add('is-drawn'); return; }
    // let the browser lay out the hidden strokes, then draw them in
    requestAnimationFrame(function () { requestAnimationFrame(function () { svg.classList.add('is-drawn'); }); });
  }

  var mq = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
  var first = true;
  function go() {
    if (getComputedStyle(aside).display === 'none') return;   // phones: no panel
    build(first && !still);
    first = false;
  }
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(go, 200); });
  if (mq && mq.addEventListener) mq.addEventListener('change', go);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
