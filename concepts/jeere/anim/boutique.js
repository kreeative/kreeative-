/* Jeere — « De l’idée à la boutique ».
   On black, brush strokes in the logo's hand draw a real boutique: every line is a bundle of 2 to 5 opaque,
   equal strands about two widths apart that drift and sometimes cross, with a comb of loose strands ending in
   round drops where the brush lifts (like the cloud and the « jeere » wordmark). Then the drawing becomes the
   photo: the strands turn into windows onto it, the seller and then the rest of the room are painted in with
   wide bristly strokes, and the black lifts off the photo. « jeere » is written in the copy as the drawing ends.
   No library: this script builds the strokes (seeded, so they are the same on every visit) in idle time before
   the section arrives, and switches classes; the CSS transitions in style.css (« Idea to store ») do the motion.
   Without JS, or with reduced motion, nothing here runs and the section simply shows the photo. */
(function () {
  'use strict';

  var sec = document.querySelector('[data-bt]');
  if (!sec || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var stage = sec.querySelector('[data-bt-stage]');
  var frame = sec.querySelector('[data-bt-frame]');
  var img = stage.querySelector('img');
  var replay = sec.querySelector('[data-bt-replay]');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 1920, H = 1080;          // the drawing lives in the photo's own pixels
  var FACE = [935, 420];           // the photo is painted in from her face outwards

  /* ---------- The boutique, traced on the photo (img/boutique.webp, 1920×1080) ----------
     p: points of one line (x, y, x, y…), smoothed into curves. e: an ellipse (cx, cy, rx, ry), drawn as loose
     loops. row: a row of products standing on a shelf edge (x0, y0, x1, y1, min height, max height).
     t: start (s), d: duration (s), w: weight (how many strands), n: strands, lin: straight segments,
     fill: a solid drop (her eyes, like the cloud's; not part of the reveal).
     Order = the order a hand would draw it. */
  var LINES = [
    // 1. The room: ceiling line, the uprights, the counter
    { p: [790, 268, 1080, 262, 1400, 262, 1700, 266], t: 0, d: .8, w: 1.25, n: 4 },
    { p: [455, 68, 600, 166, 712, 246, 790, 268], t: .12, d: .55, w: 1.1, n: 3 },
    { p: [1700, 266, 1762, 226, 1836, 180], t: .45, d: .4, w: 1, n: 3 },
    { p: [421, 0, 419, 340, 417, 700], t: .05, d: .7, w: 1.35, n: 4 },
    { p: [446, 0, 445, 350, 443, 705], t: .15, d: .7, w: .9, n: 2 },
    { p: [1834, 186, 1838, 440, 1841, 700], t: .2, d: .65, w: 1.2, n: 4 },
    { p: [1880, 196, 1884, 450, 1887, 706], t: .32, d: .6, w: .9, n: 2 },
    { p: [520, 942, 900, 946, 1300, 938, 1920, 946], t: .3, d: .95, w: 1.6, n: 5 },
    { p: [1118, 948, 1114, 1080], t: 1, d: .3, w: .8, n: 2 },

    // 2. Shelves: the back wall grid, the left wall, the right wall
    { p: [1040, 360, 1350, 359, 1662, 362], t: .6, d: .6, w: 1.2, n: 3 },
    { p: [1044, 498, 1350, 497, 1660, 501], t: .75, d: .6, w: 1, n: 3 },
    { p: [1240, 644, 1450, 645, 1660, 649], t: .9, d: .5, w: 1, n: 3 },
    { p: [1250, 780, 1500, 782], t: 1.02, d: .35, w: .9, n: 2 },
    { p: [1075, 362, 1076, 540], t: .85, d: .3, w: .9, n: 2 },
    { p: [1213, 362, 1214, 600, 1215, 790], t: .9, d: .4, w: 1, n: 3 },
    { p: [1363, 362, 1364, 600, 1365, 792], t: .96, d: .4, w: 1, n: 3 },
    { p: [1508, 362, 1509, 600, 1510, 792], t: 1.02, d: .4, w: 1, n: 3 },
    { p: [1656, 362, 1657, 520, 1657, 662], t: 1.08, d: .35, w: .9, n: 2 },
    { p: [1656, 358, 1730, 325, 1806, 292], t: 1.15, d: .3, w: .9, n: 2 },
    { p: [1656, 506, 1730, 494, 1806, 482], t: 1.2, d: .3, w: .9, n: 2 },
    { p: [1656, 650, 1806, 652], t: 1.25, d: .3, w: .9, n: 2 },
    { p: [1806, 292, 1808, 480, 1810, 680], t: 1.1, d: .4, w: 1, n: 3 },
    { p: [200, 64, 330, 106, 440, 150], t: .5, d: .4, w: .9, n: 2 },
    { p: [0, 150, 210, 205, 420, 262], t: .55, d: .5, w: 1.1, n: 3 },
    { p: [18, 322, 220, 362, 420, 402], t: .68, d: .5, w: 1.1, n: 3 },
    { p: [18, 452, 220, 476, 420, 498], t: .8, d: .5, w: 1.1, n: 3 },
    { p: [0, 594, 210, 606, 420, 616], t: .92, d: .5, w: 1.1, n: 3 },
    { p: [572, 196, 571, 420, 570, 626], t: .8, d: .45, w: .9, n: 2 },
    { p: [712, 250, 711, 450, 710, 662], t: .9, d: .45, w: .9, n: 2 },
    { p: [450, 382, 575, 402, 710, 428], t: 1, d: .4, w: .9, n: 2 },
    { p: [448, 620, 575, 617, 708, 614], t: 1.1, d: .4, w: .9, n: 2 },

    // 3. The seller: hair and head, jaw, eyes (two solid drops, nothing else on her face), earrings, braids,
    //    T-shirt, arms on the counter
    { p: [846, 430, 842, 360, 872, 306, 938, 284, 1000, 296, 1030, 336, 1036, 400, 1032, 448], t: 1.4, d: .7, w: 1.3, n: 4 },
    { p: [860, 392, 860, 462, 884, 512, 930, 532, 978, 520, 1010, 478, 1018, 410], t: 1.6, d: .6, w: 1.05, n: 3 },
    { e: [891, 403, 8, 10], fill: 1, t: 1.95, d: .2 },
    { e: [971, 403, 8, 10], fill: 1, t: 2, d: .2 },
    { e: [840, 505, 30, 40], t: 1.85, d: .35, w: .8, n: 2 },
    { e: [1024, 505, 19, 38], t: 1.9, d: .35, w: .8, n: 2 },
    { p: [852, 450, 842, 560, 815, 662, 792, 760], t: 1.95, d: .5, w: .9, n: 3 },
    { p: [872, 480, 868, 580, 852, 680, 830, 752], t: 2, d: .5, w: .8, n: 2 },
    { p: [1030, 452, 1036, 560, 1030, 650, 1010, 716], t: 2, d: .45, w: .9, n: 3 },
    { p: [1012, 482, 1012, 580, 1002, 690], t: 2.05, d: .4, w: .8, n: 2 },
    { p: [884, 548, 930, 598, 986, 560], t: 2.1, d: .35, w: .9, n: 2 },
    { p: [880, 544, 800, 548, 736, 562, 700, 600, 675, 660, 658, 712, 710, 736, 768, 752], t: 2.1, d: .6, w: 1.2, n: 3 },
    { p: [988, 544, 1080, 550, 1140, 576, 1186, 630, 1215, 682, 1236, 728, 1186, 756, 1132, 770], t: 2.15, d: .6, w: 1.2, n: 3 },
    { p: [768, 752, 774, 810, 780, 862], t: 2.5, d: .3, w: .9, n: 2 },
    { p: [1236, 728, 1255, 800, 1262, 860, 1255, 916, 1150, 944, 1000, 948, 900, 940], t: 2.4, d: .6, w: 1.2, n: 3 },
    { p: [1132, 770, 1140, 820, 1060, 850, 950, 858, 876, 862], t: 2.5, d: .45, w: 1, n: 2 },
    { p: [876, 862, 800, 880, 720, 905, 640, 935, 602, 955, 622, 968, 700, 962, 800, 955, 880, 945], t: 2.65, d: .55, w: 1, n: 3 },
    { e: [866, 872, 10, 44], t: 2.9, d: .3, w: .8, n: 2 },
    { p: [662, 716, 620, 782, 576, 860, 540, 910, 470, 975, 380, 1030, 250, 1062], t: 2.4, d: .6, w: 1.2, n: 3 },
    { p: [772, 772, 752, 848, 692, 905, 604, 965, 556, 1030, 536, 1080], t: 2.5, d: .5, w: 1, n: 2 },

    // 4. Details: jerrycans, the lamp, the hanging opener, products, the phone, the foreground
    { p: [1244, 356, 1240, 300, 1262, 288, 1290, 296, 1292, 356], t: 2.6, d: .3, w: .8, n: 2 },
    { p: [1310, 356, 1308, 300, 1330, 288, 1356, 296, 1360, 356], t: 2.68, d: .3, w: .8, n: 2 },
    { p: [1390, 356, 1388, 296, 1415, 286, 1440, 292, 1442, 356], t: 2.76, d: .3, w: .8, n: 2 },
    { p: [1460, 356, 1462, 296, 1488, 286, 1512, 294, 1515, 356], t: 2.84, d: .3, w: .8, n: 2 },
    { p: [1536, 356, 1535, 300, 1560, 292, 1585, 298, 1588, 356], t: 2.92, d: .3, w: .8, n: 2 },
    { p: [1005, 356, 1006, 306, 1030, 298, 1050, 306, 1052, 356], t: 2.54, d: .28, w: .7, n: 2 },
    { p: [1062, 356, 1062, 306, 1085, 298, 1105, 306, 1106, 356], t: 2.6, d: .28, w: .7, n: 2 },
    { e: [1219, 236, 18, 16], t: 2.3, d: .3, w: 1, n: 3 },
    { p: [801, 0, 799, 80, 804, 156], t: 2.2, d: .3, w: .8, n: 2 },
    { e: [812, 190, 32, 34], t: 2.45, d: .3, w: 1, n: 3 },
    { p: [806, 222, 786, 265, 764, 306, 756, 322, 772, 326, 792, 290, 816, 226], t: 2.65, d: .35, w: .9, n: 2 },
    { row: [1082, 432, 1650, 434, 34, 58], t: 2.9, d: .7 },
    { row: [1082, 496, 1650, 498, 40, 62], t: 3, d: .7 },
    { row: [1242, 642, 1650, 646, 80, 120], t: 3.1, d: .6 },
    { row: [22, 452, 412, 496, 70, 100], t: 2.85, d: .6 },
    { row: [20, 594, 412, 614, 60, 95], t: 2.95, d: .6 },
    { row: [140, 206, 412, 260, 50, 75], t: 3.05, d: .5 },
    { p: [842, 962, 975, 972, 940, 1062, 800, 1052, 842, 962], t: 3, d: .4, w: .9, n: 2, lin: 1 },
    { p: [684, 1006, 668, 1080], t: 3.15, d: .2, w: .8, n: 2 },
    { p: [0, 792, 120, 870, 552, 832], t: 3.1, d: .45, w: 1, n: 3 },
    { p: [120, 870, 124, 1010], t: 3.25, d: .25, w: .9, n: 2 },
    { p: [168, 900, 172, 800, 262, 760, 400, 730, 520, 760, 568, 802, 546, 880], t: 3.2, d: .45, w: .9, n: 2 },
    { p: [0, 612, 186, 612, 186, 690, 0, 700], t: 3.3, d: .35, w: .8, n: 2, lin: 1 },
    { p: [1760, 975, 1756, 792, 1772, 760, 1776, 742, 1796, 742, 1800, 760, 1815, 792, 1815, 975], t: 3.25, d: .4, w: .9, n: 2 },
    { p: [1818, 975, 1816, 800, 1832, 768, 1836, 752, 1856, 752, 1860, 768, 1872, 800, 1872, 975], t: 3.32, d: .4, w: .9, n: 2 },
    { p: [1506, 750, 1710, 748, 1700, 860, 1520, 862, 1506, 750], t: 3.3, d: .4, w: .9, n: 2, lin: 1 },
    { p: [1512, 792, 1706, 790], t: 3.45, d: .2, w: .7, n: 2 },
    { p: [996, 24, 1060, 60, 1150, 70, 1226, 40], t: 3.2, d: .35, w: .8, n: 2 },
    { p: [1226, 0, 1240, 90, 1262, 182, 1300, 132, 1380, 92, 1470, 56, 1492, 18], t: 3.28, d: .45, w: .8, n: 2 }
  ];
  // Her head and shoulders, filled: painted in first, as one patch, so her face never shows through on its own
  var SILHOUETTE = { head: [938, 405, 112, 150], body: [702, 548, 1180, 548, 1250, 740, 1266, 952, 600, 962, 650, 700] };

  var PACE = .72;    // one knob for the whole drawing's speed (the drawing takes about 3 s)
  var HOLD = .7;     // the finished drawing, and « jeere » written in the copy, stay this long before the photo
  var REVEAL = 1300; // ms, the drawing turning into the photo

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
  function centroid(pts) { var x = 0, y = 0; pts.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / pts.length, y / pts.length]; }

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
  var cover, inks, eyes, reveals, winD, bands;

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
    winD = [];
    bands = [0, 1, 2].map(function () { return { core: [[], [], []], fringe: [[], []] }; });   // wide strands by width, fine hairs by width
    // her eyes on a layer of their own: they leave first when her real face comes in
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
    var base, outline, lin = L0.lin || L0.row;

    if (L0.fill) {   // a solid drop, like the cloud's eyes
      var drop = el('path', { d: smooth(ellipse(L0.e, 0, 1.02, rr(0, 6), .03)) + 'Z', class: 'bt__dot' }, eyes);
      timing(drop, t0);
      drawEnd = Math.max(drawEnd, t0 + .15);
      return;
    }
    if (L0.e) {
      outline = ellipse(L0.e, 0, 1, 0, 0);
      for (var k = 0; k < n; k++) {
        var lp = ellipse(L0.e, (k - (n - 1) / 2) * sw * rr(1.4, 1.9) + gauss(sw * .3), rr(1.04, 1.2), rr(0, 6.28), .035);
        addStrand(ink, smooth(lp), sw * rr(.85, 1.15), t0 + k * rr(.03, .06), d0 * rr(.9, 1.1), lp);
      }
    } else {
      base = L0.row ? row(L0.row) : subdivide(pairs(L0.p), 60, lin ? .6 : 1.4);
      outline = base;
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
        addStrand(ink, lin ? poly(pts) : smooth(pts), sw * rr(.82, 1.18), t0 + k * rr(.03, .07), d0 * rr(.88, 1.12), pts);
      }
      // a couple of loose hairs out of the end of the bundle on the strongest lines
      if (heavy && w >= 1.2 && !LITE) {
        for (var h = 0; h < 2; h++) {
          var hp = trim(strand(base, nrm, cum, gauss(sp * .9), drift * .5, lam, rr(0, 6.28), .5), rr(.82, .9), 1);
          var htip = extend(hp, true, rr(14, 34) * U, gauss(.12));
          addStrand(ink, smooth(hp), sw * .75, t0 + d0 * .8, d0 * .35, null);
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

    // The reveal: the same line, wide and bristly, in one of three bands by its distance from her face
    {
      var c = L0.e ? [L0.e[0], L0.e[1]] : centroid(outline), dist = Math.hypot(c[0] - FACE[0], c[1] - FACE[1]);
      var b = bands[dist < 430 ? 0 : dist < 860 ? 1 : 2];
      // a big brush made of wide strands side by side: solid in the middle, combed and broken at the edges
      var half = L0.e ? 60 : rr(85, 130), m = LITE ? 4 : 6, mk = lin ? poly : smooth;
      var mo = L0.e ? null : subdivide(outline, 120, 0), onr = mo && normals(mo), ocum = mo && cumul(mo);
      for (var j = 0; j < m + (LITE ? 2 : 3); j++) {
        var edge = j >= m, side = j % 2 ? 1 : -1;
        var o = edge ? side * half * rr(1, 1.3) : (j / (m - 1) * 2 - 1) * half * .82 + gauss(10);
        var cl = edge ? (rnd() < .5 ? 0 : 1) : Math.floor(rnd() * 3);
        var md = L0.e ? smooth(ellipse(L0.e, o * .5, 1.05, rr(0, 6.28), .02))
          : mk(trim(strand(mo, onr, ocum, o, rr(6, 18), rr(200, 500), rr(0, 6.28), 1.5), edge ? rr(0, .25) : rr(0, .08), edge ? rr(.75, 1) : rr(.92, 1)));
        (edge ? b.fringe : b.core)[cl].push(md);
      }
    }
  }
  function addStrand(ink, d, swU, t, dur, win) {
    var p = el('path', { d: d, pathLength: 1, class: 'bt__s', 'stroke-width': f(swU * 10) / 10 }, ink);
    timing(p, t, dur);
    if (win) winD.push(d);   // the same strand, later, is a window onto the photo
  }

  function end() {
    // The photo layers of the reveal, built last: each is static, painted once during the hold, then only faded
    function photoLayer(cls, id, fill) {
      var svg = svgLayer('bt__svg--photo ' + cls);
      var mask = el('mask', { id: id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H, style: 'mask-type: alpha' }, el('defs', {}, svg));
      el('image', { width: W, height: H, preserveAspectRatio: 'xMidYMid slice', mask: 'url(#' + id + ')' }, svg);
      fill(el('g', { fill: 'none', stroke: '#fff', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask));
      return svg;
    }
    reveals = [];
    // 1. windows: the strands themselves turn into photo
    reveals.push(photoLayer('bt__svg--win', 'bt-win', function (g) {
      el('path', { d: winD.join(''), 'stroke-width': f(Math.max(3.4 * U, 4)) }, g);
    }));
    // 2. three bands of wide strokes with combed, bristly edges, from her face outwards; the first one also
    //    paints her head and shoulders in as one patch
    bands.forEach(function (b, i) {
      reveals.push(photoLayer('bt__svg--band bt__svg--b' + i, 'bt-band' + i, function (g) {
        if (i === 0) {
          var s = SILHOUETTE;
          el('ellipse', { cx: s.head[0], cy: s.head[1], rx: s.head[2], ry: s.head[3], fill: '#fff', stroke: 'none' }, g);
          el('path', { d: poly(pairs(s.body)) + 'Z', fill: '#fff', 'stroke-width': 60 }, g);
        }
        b.core.forEach(function (ds, k) { if (ds.length) el('path', { d: ds.join(''), 'stroke-width': [30, 44, 62][k] }, g); });
        b.fringe.forEach(function (ds, k) { if (ds.length) el('path', { d: ds.join(''), 'stroke-width': [8, 15][k] }, g); });
      }));
    });
    reveals.slice().reverse().forEach(function (svg) { frame.insertBefore(svg, cover.nextSibling); });
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
  // If anything goes wrong, give the section back its photo
  function disarm() {
    timers.forEach(clearTimeout); timers = [];
    queue = []; built = true;
    stage.classList.remove('is-armed', 'is-draw', 'is-sign', 'is-prep', 'is-reveal', 'is-lift');
    stage.classList.add('is-done');
    if (cover) cover.remove();
  }
  var idle = window.requestIdleCallback ? function (fn) { window.requestIdleCallback(fn, { timeout: 400 }); } : function (fn) { setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 16); };
  function prepare() { if (!built && !building) { begin(); idle(step); } }
  function buildNow() { if (!built) { if (!building) begin(); step(null); } }
  function rebuild() {
    Array.prototype.forEach.call(frame.querySelectorAll('.bt__svg'), function (e) { e.remove(); });
    built = building = false;
    buildNow();
  }

  /* ---------- Play ---------- */
  var played = false;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function photoReady() {
    if (img.complete && img.naturalWidth) return Promise.resolve(true);
    return new Promise(function (res) {
      img.addEventListener('load', function () { res(true); }, { once: true });
      img.addEventListener('error', function () { res(false); }, { once: true });
      setTimeout(function () { res(img.complete && img.naturalWidth > 0); }, 6000);
    });
  }
  function play() {
    played = true;
    buildNow();
    if (!stage.classList.contains('is-armed')) return;   // disarmed after an error
    if (img.loading === 'lazy') img.loading = 'eager';   // the photo must be here before the drawing ends
    void frame.getBoundingClientRect();                  // the strokes take their start state before they move
    stage.classList.add('is-draw');
    watchSpeed();
    // « jeere » is written in the copy as the last strokes land
    later(function () { stage.classList.add('is-sign'); }, Math.max(0, drawEnd - .8) * 1000);
    // The hold: the photo layers get their image and are painted (nearly transparent) while the drawing rests
    later(function () {
      photoReady().then(function (ok) {
        if (!ok) { stage.classList.add('is-done', 'no-photo'); finish(); return; }
        // The reveal paints the small photo (960 px): it is soft for a second, under moving strokes, and being
        // smaller than the page's <img> it never replaces it as the page's largest paint. The real photo is
        // uncovered under it, and the reveal layers lift off it to finish.
        // One layer per step through the hold, so their first paint is spread out.
        var href = frame.getAttribute('data-bt-reveal') || img.currentSrc || img.src;
        reveals.forEach(function (svg, i) {
          later(function () {
            svg.querySelector('image').setAttribute('href', href);
            svg.classList.add('is-ready');
            if (i === reveals.length - 1) stage.classList.add('is-prep');
          }, i * HOLD * 1000 / (reveals.length + .5));
        });
      });
    }, drawEnd * 1000);
    later(function reveal() {
      if (stage.classList.contains('is-done')) return;
      if (!stage.classList.contains('is-prep')) { later(reveal, 100); return; }   // the photo is still loading
      stage.classList.add('is-reveal');
      later(function () { stage.classList.add('is-lift'); }, REVEAL - 380);
      later(function () { stage.classList.add('is-done'); finish(); }, REVEAL);
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
      if (d[d.length >> 1] > 21) stage.classList.add('is-slow');   // the median: one slow frame (a scroll, a decode) does not count
    }
    requestAnimationFrame(tick);
  }
  function finish() {
    stage.setAttribute('data-bt-state', 'done');
    if (replay) replay.hidden = false;
  }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    stage.classList.add('is-reset');
    stage.classList.remove('is-draw', 'is-sign', 'is-prep', 'is-reveal', 'is-lift', 'is-done', 'no-photo');
    if (reveals) reveals.forEach(function (svg) { svg.classList.remove('is-ready'); });
    stage.removeAttribute('data-bt-state');
    void stage.offsetWidth;
    stage.classList.remove('is-reset');
  }

  // Black over the photo until the drawing turns into it. The photo itself stays painted under it (so it counts
  // for the page's largest paint right away) and is only uncovered at the end.
  cover = document.createElement('div');
  cover.className = 'bt__cover';
  img.parentNode.parentNode.insertBefore(cover, img.parentNode.nextSibling);
  stage.classList.add('is-armed');
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
    replay.hidden = true;
    if (Math.abs(frame.getBoundingClientRect().width - builtW) > builtW * .25) rebuild();   // the window was resized a lot
    requestAnimationFrame(function () { requestAnimationFrame(play); });
  });
  // Printing: show the photo
  window.addEventListener('beforeprint', function () { stage.classList.add('is-done'); });
})();
