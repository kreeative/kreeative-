/* Jeere — « Votre boutique physique, maintenant en ligne ».
   The real boutique is there first (the photo). Brush strokes in the logo's hand trace it, line by line: every
   line is a bundle of 2 to 5 opaque, equal strands that drift and sometimes cross, with a comb of loose strands
   ending in round drops where the brush lifts (like the cloud and the « jeere » wordmark). As the drawing grows
   the photo sinks into black, until only the drawing is left. Then a burst, and the same boutique comes back
   online, in black and white: a store window whose products scroll, with pieces that break out of its frame.
   No library: this script builds the strokes (seeded, so they are the same on every visit) in idle time and
   switches classes; the CSS transitions in style.css (« Physical to online ») do the motion.
   Without JS the section shows the photo; with reduced motion it shows the store over the dimmed photo, still. */
(function () {
  'use strict';

  var sec = document.querySelector('[data-bt]');
  if (!sec) return;
  var stage = sec.querySelector('[data-bt-stage]');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stage.classList.add('is-static');   // the end of the story, without the motion
    return;
  }
  var frame = sec.querySelector('[data-bt-frame]');
  var img = stage.querySelector('img');
  var replay = sec.querySelector('[data-bt-replay]');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 1920, H = 1080;          // the drawing lives in the photo's own pixels

  /* ---------- The stall, traced on the photo (img/boutique.webp, 1920×1080) ----------
     A basket weaver at her stall: the big round basket on her knees, her, the raffia straws, the pots and the cloths.
     p: points of one line (x, y, x, y…), smoothed into curves. e: an ellipse (cx, cy, rx, ry), drawn as loose
     loops. t: start (s), d: duration (s), w: weight (how many strands), n: strands, lin: straight segments,
     fill: a solid drop (her eyes, like the cloud's).
     Order = the order a hand would draw it. */
  var LINES = [
    // 1. The basket on her knees: its rim and the coils of the weave
    { e: [1030, 900, 250, 220], t: 0, d: .9, w: 1.5, n: 4 },
    { e: [1030, 905, 172, 150], t: .35, d: .6, w: .9, n: 2 },
    { e: [1030, 910, 95, 82], t: .55, d: .45, w: .8, n: 2 },
    { e: [1030, 912, 32, 28], t: .7, d: .3, w: .7, n: 2 },

    // 2. Her: the headscarf and its tail down her back, the face, the dress, the arms, the hands
    { p: [1150, 300, 1158, 232, 1190, 172, 1250, 133, 1310, 160, 1366, 230, 1430, 300, 1500, 380, 1548, 480, 1570, 600, 1580, 720, 1592, 830], t: .3, d: .8, w: 1.4, n: 4 },
    { p: [1592, 830, 1572, 930, 1556, 1010, 1550, 1080], t: 1.05, d: .3, w: 1.1, n: 3 },
    { p: [1150, 300, 1250, 318, 1367, 342], t: .55, d: .35, w: 1, n: 3 },
    { p: [1152, 335, 1154, 400, 1174, 452, 1225, 492, 1276, 484, 1326, 442, 1352, 380, 1365, 345], t: .7, d: .55, w: 1.2, n: 3 },
    { e: [1182, 376, 9, 6], fill: 1, t: 1.15, d: .2 },
    { e: [1268, 372, 9, 6], fill: 1, t: 1.2, d: .2 },
    { p: [1207, 452, 1228, 462, 1250, 456], t: 1.25, d: .2, w: .7, n: 2 },
    { p: [1150, 494, 1100, 466, 1062, 476, 1033, 517, 1017, 567, 1010, 600], t: .9, d: .45, w: 1.1, n: 3 },
    { p: [1258, 500, 1300, 500, 1350, 474, 1400, 470], t: 1, d: .35, w: .9, n: 2 },
    { p: [1150, 683, 1220, 730, 1310, 800, 1410, 875, 1490, 930], t: 1.15, d: .45, w: 1.2, n: 3 },
    { p: [1158, 700, 1250, 790, 1350, 880, 1430, 930, 1500, 952], t: 1.2, d: .4, w: .9, n: 2 },
    { p: [1158, 658, 1215, 668, 1275, 683], t: 1.3, d: .25, w: .8, n: 2 },
    { p: [1475, 767, 1530, 790, 1592, 833], t: 1.3, d: .3, w: .9, n: 2 },
    { p: [1267, 850, 1300, 900, 1333, 935, 1380, 1000, 1420, 1080], t: 1.4, d: .35, w: 1, n: 2 },
    { p: [948, 616, 975, 640, 1000, 676, 1010, 700], t: 1.35, d: .3, w: .9, n: 2 },
    { p: [1008, 583, 1060, 596, 1108, 600, 1150, 633, 1140, 690], t: 1.4, d: .35, w: .9, n: 2 },
    { p: [1030, 640, 1060, 670, 1090, 700], t: 1.5, d: .2, w: .7, n: 2 },

    // 3. The raffia: the loop she is weaving, the straw across, the long strands to the left
    { p: [983, 667, 975, 600, 962, 492, 950, 430, 958, 414, 975, 418, 1025, 458, 1067, 517, 1079, 583], t: 1.55, d: .45, w: .9, n: 2 },
    { p: [1200, 525, 1150, 562, 1100, 600], t: 1.65, d: .25, w: .8, n: 2 },
    { p: [990, 666, 800, 646, 640, 632, 478, 626], t: 1.7, d: .45, w: .9, n: 2 },
    { p: [992, 684, 780, 686, 600, 692, 452, 702], t: 1.78, d: .45, w: .9, n: 2 },
    { p: [960, 650, 860, 620, 760, 598, 712, 582], t: 1.85, d: .35, w: .7, n: 2 },
    { p: [510, 690, 460, 722, 400, 760], t: 2, d: .25, w: .7, n: 2 },

    // 4. Her stall: the gourd, the black basin, the clay jar, the blue pot and bowl, the cloths on the wall
    { p: [105, 505, 128, 425, 200, 372, 290, 356, 380, 370, 440, 410, 460, 470, 456, 505], t: 1.6, d: .5, w: 1.2, n: 3 },
    { e: [312, 518, 172, 17], t: 1.8, d: .4, w: 1.1, n: 3 },
    { p: [140, 528, 160, 600, 178, 652, 192, 686], t: 1.9, d: .3, w: 1, n: 2 },
    { p: [484, 522, 476, 600, 468, 666], t: 1.95, d: .3, w: 1, n: 2 },
    { p: [192, 686, 330, 678, 468, 668], t: 2.05, d: .3, w: .9, n: 2 },
    { p: [180, 690, 166, 760, 166, 850, 186, 930, 240, 990, 320, 1014, 400, 1002, 470, 952, 508, 862, 514, 762, 498, 696], t: 2.1, d: .6, w: 1.4, n: 4 },
    { p: [0, 668, 60, 652, 150, 656, 186, 676], t: 2.2, d: .3, w: 1, n: 3 },
    { p: [194, 700, 200, 790, 205, 870, 210, 982], t: 2.3, d: .35, w: 1, n: 2 },
    { p: [0, 790, 100, 792, 200, 790], t: 2.4, d: .25, w: .8, n: 2 },
    { p: [0, 850, 100, 852, 204, 850], t: 2.45, d: .25, w: .8, n: 2 },
    { p: [0, 978, 60, 974, 76, 1004, 70, 1080], t: 2.5, d: .25, w: .9, n: 2 },
    { p: [0, 300, 40, 282, 92, 290, 122, 312, 136, 382, 130, 500, 110, 560, 90, 640, 40, 680, 0, 690], t: 2.3, d: .5, w: 1, n: 3 },
    { p: [546, 0, 540, 120, 556, 222, 600, 232, 606, 120, 600, 0], t: 2.45, d: .4, w: 1, n: 2 },
    { p: [606, 0, 612, 150, 640, 258, 690, 300, 702, 250, 734, 120, 742, 20], t: 2.55, d: .4, w: 1, n: 2 },
    { p: [452, 975, 520, 888, 620, 848, 700, 790, 742, 778, 772, 840, 790, 960, 784, 1078], t: 2.7, d: .45, w: .9, n: 2 },

    // 5. The wall: a few cracks in the earth plaster, and the ground
    { p: [60, 60, 120, 92, 200, 128], t: 2.9, d: .3, w: .7, n: 2 },
    { p: [850, 300, 900, 318, 952, 330], t: 2.95, d: .25, w: .7, n: 2 },
    { p: [1640, 160, 1668, 210, 1700, 262, 1690, 330], t: 3, d: .3, w: .7, n: 2 },
    { p: [1760, 520, 1800, 560, 1860, 580], t: 3.05, d: .25, w: .7, n: 2 },
    { p: [1700, 860, 1760, 900, 1840, 920, 1920, 912], t: 3.1, d: .3, w: .8, n: 2 },
    { p: [515, 1012, 470, 1040, 380, 1060, 260, 1072], t: 3.1, d: .3, w: .8, n: 2 }
  ];

  var LEAD = .6;     // s, the real stall alone, before the first stroke
  var PACE = .95;    // one knob for the whole drawing's speed (the drawing takes about 3.2 s)
  var HOLD = .35;    // the finished drawing, alone on black, rests this long before the burst
  var BOOM = 1100;   // ms, from the burst to the store standing still (its products keep scrolling)

  /* ---------- Seeded randomness ---------- */
  var seed = 7;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function gauss(s) { return (rnd() + rnd() + rnd() - 1.5) * s * 1.15; }

  /* ---------- Geometry ---------- */
  function pairs(a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }
  function len(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  // A hand never draws a long line straight: add points along it, each a little off
  function subdivide(pts, step, wob) {
    var o = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = len(a, b), k = Math.floor(L / step);
      var nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      for (var j = 1; j <= k; j++) {
        var fr = j / (k + 1), g = gauss(wob);
        o.push([a[0] + (b[0] - a[0]) * fr + nx * g, a[1] + (b[1] - a[1]) * fr + ny * g]);
      }
      o.push(b);
    }
    return o;
  }
  function cumul(pts) { var c = [0]; for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + len(pts[i - 1], pts[i])); return c; }
  function trim(pts, f0, f1) {
    var cum = cumul(pts), T = cum[cum.length - 1], a = T * f0, b = T * f1, o = [];
    function at(s) { for (var i = 1; i < pts.length; i++) if (cum[i] >= s) { var fr = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * fr, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * fr]; } return pts[pts.length - 1]; }
    o.push(at(a));
    for (var i = 1; i < pts.length - 1; i++) if (cum[i] > a && cum[i] < b) o.push(pts[i]);
    o.push(at(b));
    return o;
  }
  function normals(pts) {
    return pts.map(function (q, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = len(a, b) || 1;
      return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    });
  }
  // One strand of the bundle: the line moved sideways by `off`, drifting slowly so neighbours sometimes cross
  function strand(pts, nrm, cum, off, drift, lam, ph, jit) {
    return pts.map(function (q, i) {
      var o = off + drift * Math.sin(cum[i] / lam * 6.283 + ph);
      return [q[0] + nrm[i][0] * o + gauss(jit), q[1] + nrm[i][1] * o + gauss(jit)];
    });
  }
  function extend(pts, atEnd, by, turn) {
    var n = pts.length, a = atEnd ? pts[n - 1] : pts[0], b = atEnd ? pts[n - 2] : pts[1], L = len(a, b) || 1;
    var ux = (a[0] - b[0]) / L, uy = (a[1] - b[1]) / L, c = Math.cos(turn), s = Math.sin(turn);
    var dx = ux * c - uy * s, dy = ux * s + uy * c;
    var m = [a[0] + dx * by * .5, a[1] + dy * by * .5], z = [a[0] + dx * by + gauss(by * .06), a[1] + dy * by + gauss(by * .06)];
    if (atEnd) pts.push(m, z); else pts.unshift(z, m);
    return z;
  }
  function ellipse(e, dr, turns, a0, jit) {
    var o = [], step = Math.PI / 9;
    for (var a = 0; a <= turns * Math.PI * 2; a += step) {
      var j = 1 + gauss(jit);
      o.push([e[0] + Math.cos(a0 + a) * (e[2] + dr) * j, e[1] + Math.sin(a0 + a) * (e[3] + dr) * j]);
    }
    return o;
  }
  // Products on a shelf, drawn as one running outline: up, a rounded cap, down, the next one
  function row(r) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], o = [], x = x0;
    o.push([x0, y0]);
    while (x < x1 - 18) {
      var w = rr(16, 30), h = rr(r[4], r[5]), gap = rr(2, 8), y = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      o.push([x, y - h * .1], [x, y - h]);
      if (rnd() < .5) o.push([x + w * .3, y - h - 4], [x + w * .35, y - h - 12], [x + w * .65, y - h - 12], [x + w * .7, y - h - 4]);
      else o.push([x + w * .5, y - h - 5]);
      o.push([x + w, y - h], [x + w, y - h * .1]);
      x += w + gap;
    }
    o.push([x1, y1]);
    return o;
  }
  function smooth(pts) {
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    if (pts.length === 2) return d + 'L' + f(pts[1][0]) + ' ' + f(pts[1][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  }
  function poly(pts) { return 'M' + pts.map(function (q) { return f(q[0]) + ' ' + f(q[1]); }).join('L'); }
  function f(v) { return Math.round(v * 10) / 10; }

  /* ---------- SVG ---------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgLayer(cls) {
    return el('svg', { class: 'bt__svg ' + cls, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
  }
  function timing(e, t, dur) {
    e.style.transitionDelay = Math.round(t * 1000) + 'ms';
    if (dur) e.style.transitionDuration = Math.round(dur * 1000) + 'ms';
  }

  /* ---------- Build: in idle slices, before the section arrives ---------- */
  var U = 1, LITE = false, built = false, building = false, queue = [], drawEnd = 0, builtW = 0, timers = [];
  var cover, inks, eyes, burst;

  function begin() {
    building = true;
    seed = 7; drawEnd = 0;
    var box = frame.getBoundingClientRect();
    builtW = box.width;
    var scale = Math.max(box.width / W, box.height / H) || 1;   // the drawing is cropped like the photo (cover)
    U = 1 / scale;                                             // one screen pixel, in drawing units
    LITE = box.width < 700 || (navigator.hardwareConcurrency || 8) < 4;   // phones: one strand fewer, fewer drops

    // Three ink layers (room and shelves, the seller, the details): once a layer is drawn the browser stops repainting it
    inks = [svgLayer('bt__svg--ink'), svgLayer('bt__svg--ink'), svgLayer('bt__svg--ink')].map(function (svg) {
      return el('g', { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    });
    // her eyes: two solid drops, on a layer of their own
    eyes = el('g', { fill: 'currentColor', stroke: 'none' }, svgLayer('bt__svg--ink bt__svg--eyes'));
    inks.concat(eyes).forEach(function (g) { frame.appendChild(g.parentNode); });
    queue = LINES.slice();
  }
  function inkFor(t0) { return inks[t0 < 1.35 ? 0 : t0 < 2.35 ? 1 : 2]; }

  function buildLine(L0) {
    var t0 = L0.t * PACE, d0 = L0.d * PACE, ink = inkFor(L0.t);
    var w = L0.w || .7, small = w < .85;
    var n = L0.row ? 2 : (L0.n || 2) + (L0.w >= 1.2 ? 1 : 0);   // the main contours get 4 or 5 strands
    if (LITE && n > 2) n--;
    var sw = (small ? rr(1.8, 2.4) : rr(2.2, 3)) * (LITE ? .9 : 1) * U;    // all strands about the same weight
    var heavy = !L0.row && !L0.e && w >= 1;
    var base, lin = L0.lin || L0.row;

    if (L0.fill) {   // a solid drop, like the cloud's eyes
      var drop = el('path', { d: smooth(ellipse(L0.e, 0, 1.02, rr(0, 6), .03)) + 'Z', class: 'bt__dot' }, eyes);
      timing(drop, t0);
      drawEnd = Math.max(drawEnd, t0 + .15);
      return;
    }
    if (L0.e) {
      for (var k = 0; k < n; k++) {
        var lp = ellipse(L0.e, (k - (n - 1) / 2) * sw * rr(1.4, 1.9) + gauss(sw * .3), rr(1.04, 1.2), rr(0, 6.28), .035);
        addStrand(ink, smooth(lp), sw * rr(.85, 1.15), t0 + k * rr(.03, .06), d0 * rr(.9, 1.1));
      }
    } else {
      base = L0.row ? row(L0.row) : subdivide(pairs(L0.p), 60, lin ? .6 : 1.4);
      var nrm = normals(base), cum = cumul(base), T = cum[cum.length - 1];
      var sp = sw * rr(1.45, 1.9);                          // centre to centre: the strands stay apart…
      var lam = rr(240, 560), drift = sp * rr(.45, .8);     // …but drift, so neighbours touch and cross now and then
      var dots = [];
      for (k = 0; k < n; k++) {
        var off = (k - (n - 1) / 2) * sp + gauss(sp * .3);
        var pts = strand(base, nrm, cum, off, drift * rr(.6, 1.2), lam * rr(.8, 1.25), rr(0, 6.28), lin ? .35 : .8);
        // each strand lands and lifts a little apart from the others
        if (n > 1) pts = trim(pts, Math.max(0, rr(-.03, .07)), Math.min(1, rr(.93, 1.03)));
        if (heavy) {
          // the comb: where the brush lifts, the strands run on a little, fan out and end in a drop
          var by = rr(8, 30) * U * (T > 300 ? 1 : .6), turn = (n > 1 ? (k - (n - 1) / 2) / n : 0) * rr(.1, .3) + gauss(.04);
          var tip = extend(pts, true, by, turn);
          if (rnd() < .65) dots.push([tip, sw * rr(1.35, 1.75)]);
          if (rnd() < .35) { var tip0 = extend(pts, false, by * .5, -turn); if (rnd() < .5) dots.push([tip0, sw * rr(1.3, 1.6), true]); }
        }
        addStrand(ink, lin ? poly(pts) : smooth(pts), sw * rr(.82, 1.18), t0 + k * rr(.03, .07), d0 * rr(.88, 1.12));
      }
      // a couple of loose hairs out of the end of the bundle on the strongest lines
      if (heavy && w >= 1.2 && !LITE) {
        for (var h = 0; h < 2; h++) {
          var hp = trim(strand(base, nrm, cum, gauss(sp * .9), drift * .5, lam, rr(0, 6.28), .5), rr(.82, .9), 1);
          var htip = extend(hp, true, rr(14, 34) * U, gauss(.12));
          addStrand(ink, smooth(hp), sw * .75, t0 + d0 * .8, d0 * .35);
          if (rnd() < .7) dots.push([htip, sw * 1.3]);
        }
      }
      if (dots.length) {
        // all the drops of one line in one path (a dot is a zero-length segment with a round cap)
        var byW = {};
        dots.forEach(function (q) { var key = f(q[1] / U * 2) / 2; (byW[key] = byW[key] || []).push(q); });
        Object.keys(byW).forEach(function (key) {
          var dd = byW[key].map(function (q) { return 'M' + f(q[0][0]) + ' ' + f(q[0][1]) + 'h.1'; }).join('');
          var dot = el('path', { d: dd, class: 'bt__dot', 'stroke-width': f(+key * U * 10) / 10 }, ink);
          timing(dot, t0 + d0 * .95);
        });
      }
    }
    drawEnd = Math.max(drawEnd, t0 + d0 * 1.12 + n * .07);
  }
  function addStrand(ink, d, swU, t, dur) {
    var p = el('path', { d: d, pathLength: 1, class: 'bt__s', 'stroke-width': f(swU * 10) / 10 }, ink);
    timing(p, t, dur);
  }

  function end() {
    // The burst: brush streaks and drops flung out from the middle of the store window, and a flash
    burst = document.createElement('div');
    burst.className = 'bt__burst';
    burst.setAttribute('aria-hidden', 'true');
    // in the ink's cream, white and grey, like the drawing
    var html = '<b class="bt__flash"></b>', N = LITE ? 22 : 34, COL = ['#F3EEE4', '#FFFFFF', '#BDBDBD'];
    for (var i = 0; i < N; i++) {
      var a = i / N * 360 + rr(-6, 6), drop = rnd() < .38, r0 = rr(10, 40), r1 = rr(150, 420) * (drop ? 1.15 : 1);
      var w = drop ? rr(7, 15) : rr(50, 150), h = drop ? w : rr(4, 10);
      html += '<i class="' + (drop ? 'd' : 's') + '" style="--a:' + f(a) + 'deg;--r0:' + f(r0) + 'px;--r1:' + f(r1) +
        'px;--w:' + f(w) + 'px;--h:' + f(h) + 'px;--t:' + Math.round(rr(0, 90)) + 'ms;--c:' + COL[Math.floor(rnd() * COL.length)] + '"></i>';
    }
    burst.innerHTML = html;
    var shop = stage.querySelector('.bt__shop');
    stage.insertBefore(burst, shop ? shop.nextSibling : null);   // over the window as it pops in
    stage.classList.add('is-built');
    built = true; building = false;
  }
  function step(deadline) {
    try {
      while (queue.length && (!deadline || deadline.timeRemaining() > 3)) buildLine(queue.shift());
      if (queue.length) idle(step);
      else if (!built) end();
    } catch (err) { disarm(); }
  }
  // If anything goes wrong, show the end of the story, still
  function disarm() {
    timers.forEach(clearTimeout); timers = [];
    queue = []; built = true;
    stage.classList.remove('is-armed', 'is-real', 'is-draw', 'is-sign', 'is-boom', 'is-shop', 'is-done');
    stage.classList.add('is-static');
    Array.prototype.forEach.call(stage.querySelectorAll('.bt__svg, .bt__burst'), function (e) { e.remove(); });
    if (cover) cover.remove();
  }
  var idle = window.requestIdleCallback ? function (fn) { window.requestIdleCallback(fn, { timeout: 400 }); } : function (fn) { setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 16); };
  function prepare() { if (!built && !building) { begin(); idle(step); } }
  function buildNow() { if (!built) { if (!building) begin(); step(null); } }
  function rebuild() {
    Array.prototype.forEach.call(stage.querySelectorAll('.bt__svg, .bt__burst'), function (e) { e.remove(); });
    built = building = false;
    buildNow();
  }

  /* ---------- Play ---------- */
  var played = false;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function play() {
    played = true;
    buildNow();
    if (!stage.classList.contains('is-armed')) return;   // disarmed after an error
    void frame.getBoundingClientRect();                  // the strokes take their start state before they move
    // The photo sinks into black at the pace of the drawing: slowly at first, all black as the last line lands
    cover.style.animationDuration = Math.round(drawEnd * 1000) + 'ms';
    stage.classList.add('is-real');                      // the copy's first half, with the photo
    watchSpeed();
    later(draw, LEAD * 1000);
  }
  function draw() {
    stage.classList.add('is-draw');
    // « jeere » is written in the copy as the last strokes land
    later(function () { stage.classList.add('is-sign'); }, Math.max(0, drawEnd - .8) * 1000);
    // Paf: the drawing bursts, and the boutique is back, online
    later(function () {
      stage.classList.add('is-boom');
      later(function () { stage.classList.add('is-shop'); }, 170);
      later(function () { stage.classList.add('is-done'); finish(); }, BOOM);
    }, (drawEnd + HOLD) * 1000);
  }
  // A slow machine (a median frame over 21 ms, measured after the first 10 frames so the start-up is not
  // counted): the reveal becomes a plain crossfade from the drawing to the photo.
  function watchSpeed() {
    if (stage.classList.contains('is-slow')) return;
    var d = [], last = 0, skip = 10;
    function tick(t) {
      if (last && skip-- <= 0) d.push(t - last);
      last = t;
      if (d.length < 40) { requestAnimationFrame(tick); return; }
      d.sort(function (a, b) { return a - b; });
      if (d[d.length >> 1] > 21) stage.classList.add('is-slow');   // the median: one slow frame (a scroll, a decode) does not count; a slow machine gets a plain fade instead of the burst
    }
    requestAnimationFrame(tick);
  }
  function finish() {
    stage.setAttribute('data-bt-state', 'done');
    if (replay) { replay.classList.remove('is-off'); replay.removeAttribute('tabindex'); }
  }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    stage.classList.add('is-reset');
    stage.classList.remove('is-real', 'is-draw', 'is-sign', 'is-boom', 'is-shop', 'is-done');
    stage.removeAttribute('data-bt-state');
    void stage.offsetWidth;
    stage.classList.remove('is-reset');
  }

  // The products scroll in a loop: each row is written twice, side by side, and slides by one copy's width
  Array.prototype.forEach.call(stage.querySelectorAll('.bt__track'), function (t) {
    Array.prototype.slice.call(t.children).forEach(function (c) { t.appendChild(c.cloneNode(true)); });
  });
  // Only the objects go over the window's edges: a copy of the row on top, wider than the window, shows just them
  Array.prototype.forEach.call(stage.querySelectorAll('.bt__row'), function (row) {
    var rail = row.querySelector('.bt__rail');
    if (!rail) return;
    var ov = rail.cloneNode(true);
    ov.classList.add('bt__rail--objects');
    row.appendChild(ov);
    row.classList.add('has-objects');
  });
  // The black that rises over the photo while the drawing grows (transparent until then)
  cover = document.createElement('div');
  cover.className = 'bt__cover';
  img.parentNode.parentNode.insertBefore(cover, img.parentNode.nextSibling);
  stage.classList.add('is-armed');
  // « Revoir » keeps its place while it waits (the global [hidden] would take it out of the flow and the copy would jump)
  if (replay) { replay.hidden = false; replay.classList.add('is-off'); replay.setAttribute('tabindex', '-1'); }
  // Keyboard: tabbing to the button shows the text at once, even mid-drawing
  sec.addEventListener('focusin', function () { sec.classList.add('is-focus'); });
  // Build well before the section arrives (a screen away), in idle time
  var near = new IntersectionObserver(function (entries) {
    if (entries.some(function (en) { return en.isIntersecting; })) { near.disconnect(); prepare(); }
  }, { rootMargin: '100% 0px 100% 0px' });
  near.observe(stage);
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!played && en.isIntersecting && en.intersectionRatio >= .4) {
        played = true; io.disconnect();
        requestAnimationFrame(function () { requestAnimationFrame(play); });
      }
    });
  }, { threshold: [.4] });
  io.observe(stage);

  if (replay) replay.addEventListener('click', function () {
    reset();
    replay.classList.add('is-off'); replay.setAttribute('tabindex', '-1');
    if (Math.abs(frame.getBoundingClientRect().width - builtW) > builtW * .25) rebuild();   // the window was resized a lot
    requestAnimationFrame(function () { requestAnimationFrame(play); });
  });
  // Printing: the store, still
  window.addEventListener('beforeprint', function () { stage.classList.add('is-static'); });
})();
