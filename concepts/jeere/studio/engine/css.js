/* DualEngine — css.js
 * CSS generator (§3.7) and property mappings (§3.1 geometry, §3.2 corners incl. squircle
 * clip-path, §3.3 fills / gradients / blend modes, §3.4 strokes, §3.5 effects, §3.6 typography,
 * §1.5 media blocks, §4.3 state selectors, §4.4 tokens → :root variables).
 *
 *   generate(doc, opts) → { css, rules, warnings, kBlur }
 *   nodeDeclarations(doc, node, bp, state, ctx) → { main: [[prop, value]…], inner: […]|null }
 *
 * Declarations are emitted in a fixed order (layout → box → background → border → effects →
 * text → transform); numbers are integers or ≤ 2 decimals, `0` without unit; colours are
 * minimised (#rgb / #rrggbb / rgba(r,g,b,.a)). Properties equal to their CSS initial value are
 * not emitted except the fidelity guarantees (box-sizing, position: relative on containers,
 * min-width: 0 on fill items, explicit display / font properties).
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js'), resolve: require('./resolve.js'), layout: require('./layout.js'), motion: require('./motion.js') } : global.DualEngine;
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).css = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model, R = DE.resolve, L = DE.layout, M = DE.motion;

  /**
   * Layer blur: `filter: blur(K_BLUR · radius)` (§3.5). Figma's layer blur radius ≈ 2σ.
   * Calibrated by conformance/harness.js --calibrate on blurred-disc fixtures (engine raster with a
   * true Gaussian of σ = radius / 2 vs Chromium `filter: blur()`), candidates 0.30..0.70 step 0.02.
   * CALIBRATION: K_BLUR = 0.52 (mean ΔE00 0.0238 over r=4, r=8, r=16, r=24, r=40, Chromium 153.0.8010.12)
   *   candidates: 0.30→0.262 0.32→0.243 0.34→0.219 0.36→0.201 0.38→0.173 0.40→0.144 0.42→0.121 0.44→0.102 0.46→0.075 0.48→0.052 0.50→0.027 0.52→0.024 0.54→0.033 0.56→0.050 0.58→0.078 0.60→0.101 0.62→0.128 0.64→0.151 0.66→0.184 0.68→0.193 0.70→0.226
   */
  var K_BLUR = 0.52;

  var BLEND_CSS = {
    passThrough: null, normal: 'normal', darken: 'darken', multiply: 'multiply', colorBurn: 'color-burn', linearBurn: 'multiply',
    lighten: 'lighten', screen: 'screen', colorDodge: 'color-dodge', linearDodge: 'plus-lighter', overlay: 'overlay', softLight: 'soft-light',
    hardLight: 'hard-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity'
  };
  /** §4.3 state → selector suffixes (several suffixes = a selector list). */
  var STATE_SELECTOR = { hover: [':hover'], pressed: [':active'], focused: [':focus-visible'], disabled: ['[disabled]', '[aria-disabled="true"]'], checked: ['[aria-checked="true"]'] };
  var INLINE_TAGS = { span: 1, a: 1, button: 1, img: 1, input: 1, label: 1 };
  /** Initial values used to "reset" a declaration that disappears at a narrower breakpoint. */
  var INITIAL = {
    width: 'auto', height: 'auto', 'min-width': 'auto', 'max-width': 'none', 'min-height': 'auto', 'max-height': 'none',
    left: 'auto', top: 'auto', right: 'auto', bottom: 'auto', 'z-index': 'auto', flex: '0 1 auto', 'align-self': 'auto', 'justify-self': 'auto', order: '0',
    padding: '0', gap: 'normal', 'column-gap': 'normal', 'row-gap': 'normal', 'justify-content': 'normal', 'align-items': 'normal', 'align-content': 'normal',
    'flex-direction': 'row', 'flex-wrap': 'nowrap', overflow: 'visible', 'background-color': 'transparent', 'background-image': 'none', 'background-size': 'auto',
    'background-position': '0% 0%', 'background-repeat': 'repeat', 'background-blend-mode': 'normal', 'mix-blend-mode': 'normal', isolation: 'auto', opacity: '1',
    border: 'none', 'border-top': 'none', 'border-right': 'none', 'border-bottom': 'none', 'border-left': 'none', outline: 'none', 'outline-offset': '0',
    'border-radius': '0', 'clip-path': 'none', 'box-shadow': 'none', filter: 'none', 'backdrop-filter': 'none', '-webkit-backdrop-filter': 'none',
    transform: 'none', 'transform-origin': '50% 50% 0', 'letter-spacing': 'normal', 'text-transform': 'none', 'text-decoration': 'none', 'text-indent': '0',
    'text-align': 'start', 'font-style': 'normal', 'white-space': 'normal', 'overflow-wrap': 'normal', '-webkit-line-clamp': 'none', 'object-fit': 'fill',
    'grid-column': 'auto', 'grid-row': 'auto', 'grid-template-columns': 'none', 'grid-template-rows': 'none', 'font-variation-settings': 'normal', 'font-feature-settings': 'normal',
    '-webkit-background-clip': 'border-box', 'background-clip': 'border-box', background: 'none', 'transition': 'none', 'pointer-events': 'auto',
    'aspect-ratio': 'auto', 'object-position': '50% 50%', 'margin-left': '0', 'margin-top': '0', position: 'static', inset: 'auto', content: 'none',
    stroke: 'none', 'stroke-width': '1px', 'stroke-linecap': 'butt', 'stroke-dasharray': 'none'
  };

  /* ------------------------------------------------------------------ formatting */

  /** ≤ 2 decimals, no superfluous zero (`.5`, `-.25`, §3.5 / §3.7). */
  function num(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    var r = Math.round(n * 100) / 100;
    if (Object.is(r, -0)) r = 0;
    return String(r).replace(/^(-?)0\./, '$1.');
  }
  function px(n) { if (R.isRef(n)) return varRef(n); var s = num(n); return s === '0' ? '0' : s + 'px'; }
  function pct(n) { var s = num(n); return s === '0' ? '0%' : s + '%'; }
  function varRef(ref) { return 'var(' + R.cssVarName(ref.ref) + ')'; }
  function alpha(a) { var s = String(Math.round(a * 1000) / 1000); return s.replace(/^0\./, '.'); }
  function hex2(v) { var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return h.length < 2 ? '0' + h : h; }
  /** Colour → minimised CSS (#rgb, #rrggbb, rgba(), color(display-p3 …)). */
  function cssColor(c, opacityMul) {
    if (R.isRef(c)) return varRef(c);
    if (typeof c === 'string') return c;
    if (!c) return 'transparent';
    var a = (c.a === undefined ? 1 : c.a) * (opacityMul === undefined ? 1 : opacityMul);
    if (c.space === 'display-p3') return 'color(display-p3 ' + num(c.r) + ' ' + num(c.g) + ' ' + num(c.b) + (a < 1 ? ' / ' + alpha(a) : '') + ')';
    if (a >= 1) {
      var h = '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
      if (h[1] === h[2] && h[3] === h[4] && h[5] === h[6]) return '#' + h[1] + h[3] + h[5];
      return h;
    }
    if (a <= 0) return 'transparent';
    return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + alpha(a) + ')';
  }
  function sides(p) {
    var t = px(p.top), r = px(p.right), b = px(p.bottom), l = px(p.left);
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return t + ' ' + r;
    return t + ' ' + r + ' ' + b + ' ' + l;
  }
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
  /**
   * `font-family` of a text style (§3.6): one family → `"X", sans-serif` (unchanged); a fallback
   * list "X, Y, serif" (a detached store text keeps its stack) → each name quoted, generic keywords
   * bare, `sans-serif` added only when the list has no generic family.
   */
  var GENERIC_FAMILIES = { serif: 1, 'sans-serif': 1, monospace: 1, cursive: 1, fantasy: 1, 'system-ui': 1, 'ui-serif': 1, 'ui-sans-serif': 1, 'ui-monospace': 1, 'ui-rounded': 1, emoji: 1, math: 1, fangsong: 1 };
  function familyCSS(f) {
    var s = String(f == null ? '' : f);
    if (s.indexOf(',') === -1) return '"' + esc(s) + '", sans-serif';
    var names = s.split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    var generic = false;
    var out = names.map(function (x) { if (GENERIC_FAMILIES[x]) { generic = true; return x; } return '"' + esc(x) + '"'; });
    if (!generic) out.push('sans-serif');
    return out.join(', ');
  }

  /* ------------------------------------------------------------------ §3.2 corners */

  /**
   * Effective radii (§3.2): CSS §5.5 proportional reduction f = min(1, L / (r1 + r2)) over every
   * side, then each radius ≤ min(w, h) / 2 (Figma clamps a lone corner to half the shorter side).
   */
  function effectiveRadii(corners, w, h) {
    var r = { tl: Math.max(0, corners.tl || 0), tr: Math.max(0, corners.tr || 0), br: Math.max(0, corners.br || 0), bl: Math.max(0, corners.bl || 0) };
    var f = 1;
    [[r.tl + r.tr, w], [r.bl + r.br, w], [r.tl + r.bl, h], [r.tr + r.br, h]].forEach(function (sd) { if (sd[0] > 0) f = Math.min(f, sd[1] / sd[0]); });
    var cap = Math.max(0, Math.min(w, h) / 2);
    r.tl = Math.min(r.tl * f, cap); r.tr = Math.min(r.tr * f, cap); r.br = Math.min(r.br * f, cap); r.bl = Math.min(r.bl * f, cap);
    return r;
  }

  /**
   * One corner of the smoothed rectangle (figma-squircle construction). When the corner does not
   * have room for the full smoothing (L/2 < (1 + ξ)·R), ξ is reduced to p / R − 1 so that the curve
   * still ends exactly at p — the behaviour of the reference implementation (figma-squircle) that
   * §3.2 cites; with room to spare the §3.2 formulas apply unchanged.
   */
  function cornerParams(radius, smoothing, budget) {
    radius = Math.max(0, Math.min(radius, budget));
    var p = Math.min((1 + smoothing) * radius, budget);
    if (radius > 0 && p < (1 + smoothing) * radius) smoothing = Math.max(0, p / radius - 1);
    var theta = 90 * (1 - smoothing);
    var arc = Math.sin(theta / 2 * Math.PI / 180) * radius * Math.SQRT2;
    var alphaDeg = (90 - theta) / 2;
    var d34 = radius * Math.tan(alphaDeg / 2 * Math.PI / 180);
    var beta = 45 * smoothing;
    var c = d34 * Math.cos(beta * Math.PI / 180);
    var d = c * Math.tan(beta * Math.PI / 180);
    var b = (p - arc - c - d) / 3, a = 2 * b;
    return { a: a, b: b, c: c, d: d, p: p, arc: arc, r: radius };
  }
  function n(v) { return num(v); }
  /**
   * Squircle path (figma-squircle construction, §3.2) for a w×h box, in ABSOLUTE coordinates
   * (px, relative to the box's top-left, translated by ox, oy) so that 2-decimal rounding never
   * accumulates. Each corner is the §3.2 top-right construction (origin at the corner)
   *   M(−p,0) C(−p+a,0 −p+a+b,0 −p+a+b+c,d) A(R,R 0 0 1 −d,p−a−b−c) C(0,p−a−b 0,p−a 0,p)
   * rotated onto the corner (clockwise order TR, BR, BL, TL). Usable in clip-path: path('…').
   */
  function squirclePath(w, h, corners, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    var rad = effectiveRadii(corners, w, h), xi = Math.max(0, Math.min(1, corners.smoothing || 0));
    var budget = Math.min(w, h) / 2;
    var maps = [
      ['tr', function (u, v) { return [w + u, v]; }],
      ['br', function (u, v) { return [w - v, h + u]; }],
      ['bl', function (u, v) { return [-u, h - v]; }],
      ['tl', function (u, v) { return [v, -u]; }]
    ];
    function pt(m, u, v) { var q = m(u, v); return n(q[0] + ox) + ' ' + n(q[1] + oy); }
    var out = [];
    maps.forEach(function (mc, i) {
      var k = cornerParams(rad[mc[0]], xi, budget), m = mc[1], cmd = i === 0 ? 'M' : 'L';
      if (!(k.r > 0)) { out.push(cmd + pt(m, 0, 0)); return; }
      var a = k.a, b = k.b, c = k.c, d = k.d, p = k.p;
      out.push(cmd + pt(m, -p, 0));
      if (b > 1e-9 || c > 1e-9 || d > 1e-9) out.push('C' + pt(m, -p + a, 0) + ' ' + pt(m, -p + a + b, 0) + ' ' + pt(m, -p + a + b + c, d));
      out.push('A' + n(k.r) + ' ' + n(k.r) + ' 0 0 1 ' + pt(m, -d, p - a - b - c));
      if (b > 1e-9 || c > 1e-9 || d > 1e-9) out.push('C' + pt(m, 0, p - a - b) + ' ' + pt(m, 0, p - a) + ' ' + pt(m, 0, p));
    });
    return out.join(' ') + ' Z';
  }
  function hasSquircle(corners) { return !!(corners && corners.smoothing > 0 && (corners.tl > 0 || corners.tr > 0 || corners.br > 0 || corners.bl > 0)); }

  /* ------------------------------------------------------------------ §3.3 gradients */

  function stopsOf(paint) { return (paint.stops || []).slice().sort(function (a, b) { return a.position - b.position; }); }

  /**
   * Gradient geometry in the box's normalised space [0,1]² (§3.3). A paint carries either Figma's
   * `transform` (Mat3 / 2×3 gradientTransform: box space → gradient space, rows [[a,b,c],[d,e,f]])
   * or explicit handles (start, end, radius). In gradient space a linear gradient runs from
   * (0, .5) to (1, .5); radial / angular / diamond gradients are centred on (.5, .5) with unit
   * axes reaching (1, .5) and (.5, 1).
   * @returns {{start:{x,y}, end:{x,y}, center:{x,y}, axisU:{x,y}, axisV:{x,y}}}  (axes = handle points)
   */
  function gradientGeometry(paint) {
    var T = paint.transform;
    if (T && T.length >= 2 && T[0] && T[0].length >= 3) {
      var a = T[0][0], b = T[0][1], c = T[0][2], d = T[1][0], e = T[1][1], f = T[1][2];
      var det = a * e - b * d;
      if (Math.abs(det) > 1e-12) {
        var inv = function (gx, gy) { var x = gx - c, y = gy - f; return { x: (e * x - b * y) / det, y: (-d * x + a * y) / det }; };
        return { start: inv(0, 0.5), end: inv(1, 0.5), center: inv(0.5, 0.5), axisU: inv(1, 0.5), axisV: inv(0.5, 1) };
      }
    }
    var st = paint.start, en = paint.end;
    if (paint.type === 'linear') { st = st || { x: 0, y: 0.5 }; en = en || { x: 1, y: 0.5 }; return { start: st, end: en, center: { x: (st.x + en.x) / 2, y: (st.y + en.y) / 2 }, axisU: en, axisV: st }; }
    var ctr = st || { x: 0.5, y: 0.5 }, r = paint.radius || { x: 0.5, y: 0.5 };
    var u = paint.type === 'angular' && en ? en : { x: ctr.x + r.x, y: ctr.y };
    return { start: ctr, end: en || u, center: ctr, axisU: u, axisV: { x: ctr.x, y: ctr.y + r.y } };
  }

  /** Exact Figma handles → CSS linear-gradient (angle + remapped stop positions). */
  function linearGradient(paint, w, h) {
    var gg = gradientGeometry(paint), P0 = gg.start, P1 = gg.end;
    var dx = (P1.x - P0.x) * w, dy = (P1.y - P0.y) * h;
    var theta = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    var t = theta * Math.PI / 180, sin = Math.sin(t), cos = Math.cos(t);
    var Lcss = Math.abs(w * sin) + Math.abs(h * cos);
    var C = { x: w / 2, y: h / 2 }, u = { x: sin, y: -cos };
    function s(tt) {
      var p = { x: (P0.x + tt * (P1.x - P0.x)) * w, y: (P0.y + tt * (P1.y - P0.y)) * h };
      return Lcss > 0 ? ((p.x - C.x) * u.x + (p.y - C.y) * u.y) / Lcss + 0.5 : 0.5;
    }
    var stops = stopsOf(paint).map(function (st) { return cssColor(st.color, paint.opacity) + ' ' + pct(s(st.position) * 100); });
    return { css: 'linear-gradient(' + num(theta) + 'deg, ' + stops.join(', ') + ')', angle: theta, Lcss: Lcss, remap: s };
  }
  /** Pixel-space ellipse frame of a radial / angular / diamond gradient: centre + the two axes. */
  function ellipseFrame(paint, w, h) {
    var gg = gradientGeometry(paint);
    var c = { x: gg.center.x * w, y: gg.center.y * h };
    return { c: c, u: { x: gg.axisU.x * w - c.x, y: gg.axisU.y * h - c.y }, v: { x: gg.axisV.x * w - c.x, y: gg.axisV.y * h - c.y } };
  }
  function svgColorStops(paint) {
    return stopsOf(paint).map(function (st) {
      var col = st.color || { r: 0, g: 0, b: 0, a: 1 }, a = (col.a === undefined ? 1 : col.a) * (paint.opacity === undefined ? 1 : paint.opacity);
      return '<stop offset="' + Math.max(0, Math.min(1, st.position)) + '" stop-color="' + cssColor({ r: col.r, g: col.g, b: col.b, a: 1 }) + '"' + (a < 1 ? ' stop-opacity="' + alpha(a) + '"' : '') + '/>';
    }).join('');
  }
  function svgDataUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  function svgMatrix(F) { return 'matrix(' + [F.u.x, F.u.y, F.v.x, F.v.y, F.c.x, F.c.y].map(function (v) { return String(Math.round(v * 1e4) / 1e4); }).join(' ') + ')'; }

  /**
   * Radial gradient. Axis-aligned ellipses → radial-gradient(Rx Ry at Cx Cy) (exact); a rotated or
   * skewed ellipse (Mat3 transform) has no CSS form → SVG background with the same transform.
   * @returns {{css:string, svg:boolean}}
   */
  function radialGradientLayer(paint, w, h) {
    var F = ellipseFrame(paint, w, h), eps = 1e-6;
    var stops = stopsOf(paint).map(function (st) { return cssColor(st.color, paint.opacity) + ' ' + pct(st.position * 100); });
    if (Math.abs(F.u.y) < eps && Math.abs(F.v.x) < eps) return { css: 'radial-gradient(' + px(Math.abs(F.u.x)) + ' ' + px(Math.abs(F.v.y)) + ' at ' + px(F.c.x) + ' ' + px(F.c.y) + ', ' + stops.join(', ') + ')', svg: false };
    if (Math.abs(F.u.x) < eps && Math.abs(F.v.y) < eps) return { css: 'radial-gradient(' + px(Math.abs(F.v.x)) + ' ' + px(Math.abs(F.u.y)) + ' at ' + px(F.c.x) + ' ' + px(F.c.y) + ', ' + stops.join(', ') + ')', svg: false };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(w) + '" height="' + num(h) + '" viewBox="0 0 ' + num(w) + ' ' + num(h) + '" preserveAspectRatio="none"><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="' + svgMatrix(F) + '">' + svgColorStops(paint) + '</radialGradient><rect width="100%" height="100%" fill="url(#g)"/></svg>';
    return { css: svgDataUrl(svg), svg: true };
  }
  function radialGradient(paint, w, h) { return radialGradientLayer(paint, w, h).css; }
  function conicGradient(paint, w, h) {
    var F = ellipseFrame(paint, w, h);
    var theta = (Math.atan2(F.u.x, -F.u.y) * 180 / Math.PI + 360) % 360;
    var stops = stopsOf(paint).map(function (st) { return cssColor(st.color, paint.opacity) + ' ' + pct(st.position * 100); });
    return 'conic-gradient(from ' + num(theta) + 'deg at ' + px(F.c.x) + ' ' + px(F.c.y) + ', ' + stops.join(', ') + ')';
  }
  /**
   * Diamond gradient: t = |u| + |v| in the gradient's axis frame. No CSS equivalent (§3.3) → an SVG
   * background built from four quadrant rectangles, each filled with the linear gradient
   * t = ±u ± v (exact, vector: it stays sharp at every zoom). The canvas renderer draws the same.
   */
  function diamondGradient(paint, w, h) {
    var F = ellipseFrame(paint, w, h), K = 1e4, e = 1e-3, stops = svgColorStops(paint);
    var q = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(function (sg, i) {
      var x = sg[0] > 0 ? -e : -K, y = sg[1] > 0 ? -e : -K;
      return '<linearGradient id="d' + i + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + (sg[0] * 0.5) + '" y2="' + (sg[1] * 0.5) + '">' + stops + '</linearGradient><rect x="' + x + '" y="' + y + '" width="' + (K + e) + '" height="' + (K + e) + '" fill="url(#d' + i + ')"/>';
    }).join('');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(w) + '" height="' + num(h) + '" viewBox="0 0 ' + num(w) + ' ' + num(h) + '" preserveAspectRatio="none"><g transform="' + svgMatrix(F) + '">' + q + '</g></svg>';
    return svgDataUrl(svg);
  }
  function assetUrl(doc, id) { var a = doc.assets && doc.assets[id]; return a ? (a.url || a.src || a.data || '') : id; }

  /** One fill → { image, size, position, repeat, blend } (image layer) or { color } for a lone solid. */
  function paintLayer(doc, paint, w, h, warn) {
    var blend = BLEND_CSS[paint.blend || 'normal'] || 'normal';
    if (paint.blend === 'linearBurn') warn('blend-fallback', 'Linear burn has no CSS equivalent \u2192 multiply');
    switch (paint.type) {
      case 'solid': { var c = cssColor(paint.color, paint.opacity); return { color: c, image: 'linear-gradient(' + c + ', ' + c + ')', blend: blend }; }
      case 'linear': return { image: linearGradient(paint, w, h).css, blend: blend };
      case 'radial': { var rg = radialGradientLayer(paint, w, h); if (rg.svg) warn('rasterised', 'Rotated radial gradient has no CSS form \u2192 SVG background'); return rg.svg ? { image: rg.css, blend: blend, size: '100% 100%', repeat: 'no-repeat', position: '0 0' } : { image: rg.css, blend: blend }; }
      case 'angular': return { image: conicGradient(paint, w, h), blend: blend };
      case 'diamond': warn('rasterised', 'Diamond gradient has no CSS equivalent \u2192 SVG background'); return { image: diamondGradient(paint, w, h), blend: blend, size: '100% 100%', repeat: 'no-repeat', position: '0 0' };
      case 'image': {
        var layer = { image: 'url("' + esc(assetUrl(doc, paint.asset)) + '")', blend: blend, repeat: 'no-repeat', position: 'center' };
        var fit = paint.fit || 'fill';
        if (fit === 'fill') layer.size = 'cover';
        else if (fit === 'fit') layer.size = 'contain';
        else if (fit === 'tile') { layer.repeat = 'repeat'; layer.size = pct((paint.scale || 1) * 100) + ' auto'; layer.position = '0 0'; }
        else if (fit === 'crop' && paint.crop) {
          var cr = paint.crop; layer.size = pct(100 / (cr.w || 1)) + ' ' + pct(100 / (cr.h || 1));
          layer.position = pct(cr.w < 1 ? cr.x / (1 - cr.w) * 100 : 0) + ' ' + pct(cr.h < 1 ? cr.y / (1 - cr.h) * 100 : 0);
        } else layer.size = 'cover';
        return layer;
      }
      default: return null;
    }
  }

  /* ------------------------------------------------------------------ declarations */

  function Decls() { this.list = []; this.map = {}; }
  Decls.prototype.set = function (p, v) { if (v === undefined || v === null) return; if (this.map[p] !== undefined) { for (var i = 0; i < this.list.length; i++) if (this.list[i][0] === p) { this.list[i][1] = v; break; } } else this.list.push([p, v]); this.map[p] = v; };
  Decls.prototype.get = function (p) { return this.map[p]; };

  function keyOf(prop) { return prop; }

  /**
   * Full declaration set of a node at (bp, state).
   * @returns {{main: Array, inner: Array|null, wrapper: boolean}}
   */
  function nodeDeclarations(doc, node, bp, state, ctx) {
    ctx = ctx || {};
    var kBlur = ctx.kBlur !== undefined ? ctx.kBlur : K_BLUR;
    var warnings = ctx.warnings || [];
    function warn(code, msg) { warnings.push({ node: node.id, code: code, message: msg, breakpoint: bp, state: state || null }); }
    var rn = resolvedOf(doc, node, bp, state, false, ctx);            // numeric (refs resolved)
    var rk = resolvedOf(doc, node, bp, state, true, ctx);
    var parent = model.parentOf(doc, node.id);
    var prn = parent ? resolvedOf(doc, parent, bp, undefined, false, ctx) : null;
    var layouts = ctx.layouts || {};
    var lay = layouts[bp];
    var box = lay && lay.boxes.get(node.id);
    var W = box ? box.w : rn.geometry.w, H = box ? box.h : rn.geometry.h;
    var m = L.modes(rn);
    var main = new Decls(), inner = null;
    var isText = rn.type === 'text', isImage = rn.type === 'image', isContainer = !!(rn.children && rn.layoutParent);
    var squircle = hasSquircle(rn.corners) && rn.type !== 'ellipse';
    var shadows = (rn.effects || []).filter(function (e) { return e.visible !== false && (e.type === 'dropShadow' || e.type === 'innerShadow'); });
    var squircleStrokes = squircle ? (rn.strokes || []).filter(function (st) { return st.visible !== false && model.strokeMode(st) === 'shadow' && typeof st.width === 'number' && st.width > 0; }) : [];
    // clip-path clips the element's own box-shadow / outline: a squircle with drop shadows or
    // strokes is split into an unclipped wrapper (shadows as drop-shadow(), strokes as an SVG ring
    // in ::after) and a clipped inner box (fills, content) — §3.2
    var needsWrapper = (squircle && (shadows.some(function (e) { return e.type === 'dropShadow'; }) || squircleStrokes.length > 0)) || !!(ctx.forceWrap && ctx.forceWrap.has(node.id));
    var after = null;
    if (needsWrapper) inner = new Decls();
    var vis = inner || main; // where visual (background/border/effects) declarations go

    /* ---- display / visibility */
    if (rn.visible === false) { main.set('display', 'none'); return { main: main.list, inner: inner ? inner.list : null, after: null, svg: null, wrapper: needsWrapper, warnings: warnings }; }
    var tag = rn.semantic && rn.semantic.tag || 'div';
    var display = 'block';
    if (isContainer) display = rn.layoutParent.mode === 'stack' ? 'flex' : rn.layoutParent.mode === 'grid' ? 'grid' : 'block';
    if (isText && rn.truncate && rn.truncate.lines > 0) display = '-webkit-box';
    else if (isText && rn.resize === 'fixed' && (rn.style.verticalAlign === 'middle' || rn.style.verticalAlign === 'bottom')) display = 'flex';
    if (needsWrapper) { main.set('display', 'block'); inner.set('display', display); }
    else main.set('display', display);
    if (needsWrapper) { inner.set('width', '100%'); inner.set('height', '100%'); }

    /* ---- §3.1 / §2 layout in parent */
    var parentMode = prn ? prn.layoutParent.mode : 'root';
    var isAbs = prn ? (parentMode === 'absolute' || rn.layoutChild.position === 'absolute') : false;
    var pIns = prn ? L.insets(prn) : null;
    var geomUnitW = rn.layoutChild.widthUnit, geomUnitH = rn.layoutChild.heightUnit;
    function fixedW() { var g = rk.geometry; return geomUnitW === 'vw' ? num(rn.geometry.w) + 'vw' : geomUnitW === '%' ? pct(rn.geometry.w) : px(g.w); }
    function fixedH() { var g = rk.geometry; return geomUnitH === 'vh' ? num(rn.geometry.h) + 'vh' : geomUnitH === '%' ? pct(rn.geometry.h) : px(g.h); }
    var widthDecl = null, heightDecl = null;
    var textAutoWidth = isText && rn.resize === 'autoWidth';
    if (!prn) {
      (isContainer ? main : main).set('position', 'relative');
      widthDecl = m.w === 'fill' ? '100%' : m.w === 'hug' ? (textAutoWidth ? 'max-content' : 'fit-content') : fixedW();
      heightDecl = m.h === 'fill' ? '100vh' : m.h === 'hug' ? (isText ? null : 'fit-content') : fixedH();
    } else if (isAbs) {
      main.set('position', 'absolute');
      var cons = rn.layoutChild.constraints || { h: 'left', v: 'top' };
      var defBp = R.definingBreakpoint(doc, node, 'geometry', bp);
      var refLay = layouts[defBp] || lay;
      var pBox = refLay && refLay.boxes.get(parent.id);
      var W0 = pBox ? pBox.w - pIns.border.left - pIns.border.right : prn.geometry.w;
      var H0 = pBox ? pBox.h - pIns.border.top - pIns.border.bottom : prn.geometry.h;
      var g = rn.geometry, gw = m.w === 'fixed' ? rn.geometry.w : (box ? box.w : g.w), gh = m.h === 'fixed' ? rn.geometry.h : (box ? box.h : g.h);
      var x = g.x - pIns.border.left, y = g.y - pIns.border.top;
      function calc50(off) { return off === 0 ? '50%' : 'calc(50% ' + (off < 0 ? '- ' : '+ ') + num(Math.abs(off)) + 'px)'; }
      switch (cons.h) {
        case 'right': main.set('right', px(W0 - x - gw)); break;
        case 'leftRight': main.set('left', px(x)); main.set('right', px(W0 - x - gw)); break;
        case 'center': main.set('left', calc50(x - W0 / 2)); break;
        case 'scale': main.set('left', pct(100 * x / W0)); break;
        default: main.set('left', px(x));
      }
      switch (cons.v) {
        case 'bottom': main.set('bottom', px(H0 - y - gh)); break;
        case 'topBottom': main.set('top', px(y)); main.set('bottom', px(H0 - y - gh)); break;
        case 'center': main.set('top', calc50(y - H0 / 2)); break;
        case 'scale': main.set('top', pct(100 * y / H0)); break;
        default: main.set('top', px(y));
      }
      if (cons.h === 'scale') widthDecl = pct(100 * gw / W0);
      else if (cons.h !== 'leftRight') widthDecl = m.w === 'fill' ? '100%' : m.w === 'hug' ? (textAutoWidth ? 'max-content' : 'fit-content') : fixedW();
      if (cons.v === 'scale') heightDecl = pct(100 * gh / H0);
      else if (cons.v !== 'topBottom') heightDecl = m.h === 'fill' ? '100%' : m.h === 'hug' ? (isText ? null : 'fit-content') : fixedH();
      if (parentMode !== 'absolute') main.set('z-index', '1');
      if (isContainer && !needsWrapper) { /* position absolute already establishes the containing block */ }
    } else if (parentMode === 'stack') {
      var row = prn.layoutParent.direction === 'horizontal';
      var mainMode = row ? m.w : m.h, crossMode = row ? m.h : m.w;
      // main axis
      if (mainMode === 'fill') { main.set('flex', num(rn.layoutChild.grow === undefined ? 1 : rn.layoutChild.grow) + ' 1 0%'); main.set(row ? 'min-width' : 'min-height', '0'); }
      else {
        main.set('flex', '0 0 auto');
        if (row) widthDecl = mainMode === 'hug' ? (textAutoWidth ? 'max-content' : 'fit-content') : fixedW();
        else heightDecl = mainMode === 'hug' ? (isText ? null : 'fit-content') : fixedH();
      }
      // cross axis
      if (crossMode === 'fill') main.set('align-self', 'stretch');
      else {
        if (row) heightDecl = crossMode === 'hug' ? (isText ? null : 'fit-content') : fixedH();
        else widthDecl = crossMode === 'hug' ? (textAutoWidth ? 'max-content' : 'fit-content') : fixedW();
        var as = rn.layoutChild.alignSelf;
        if (as && as !== 'auto') main.set('align-self', as === 'start' ? 'flex-start' : as === 'end' ? 'flex-end' : as);
      }
      if (rn.layoutChild.order) main.set('order', String(rn.layoutChild.order));
    } else if (parentMode === 'grid') {
      var ga = rn.layoutChild.gridArea;
      if (ga && ga.col) main.set('grid-column', ga.col + (ga.colSpan > 1 ? ' / span ' + ga.colSpan : ''));
      else if (ga && ga.colSpan > 1) main.set('grid-column', 'span ' + ga.colSpan);
      if (ga && ga.row) main.set('grid-row', ga.row + (ga.rowSpan > 1 ? ' / span ' + ga.rowSpan : ''));
      else if (ga && ga.rowSpan > 1) main.set('grid-row', 'span ' + ga.rowSpan);
      if (m.w === 'fill') main.set('justify-self', 'stretch');
      else { widthDecl = m.w === 'hug' ? (textAutoWidth ? 'max-content' : 'fit-content') : fixedW(); var js = rn.layoutChild.justifySelf || 'start'; main.set('justify-self', js); }
      if (m.h === 'fill') main.set('align-self', 'stretch');
      else { heightDecl = m.h === 'hug' ? (isText ? null : 'fit-content') : fixedH(); var as2 = rn.layoutChild.alignSelf && rn.layoutChild.alignSelf !== 'auto' ? rn.layoutChild.alignSelf : 'start'; main.set('align-self', as2); }
      if (rn.layoutChild.order) main.set('order', String(rn.layoutChild.order));
    }
    if (rn.type === 'line') heightDecl = '0';
    // hug on an absolute-mode frame: its children are out of flow, so fit-content would collapse to
    // the padding; the engine's extent of the children is emitted (per breakpoint)
    if (isContainer && rn.layoutParent.mode === 'absolute') {
      if (m.w === 'hug' && widthDecl === 'fit-content') widthDecl = px(W);
      if (m.h === 'hug' && heightDecl === 'fit-content') heightDecl = px(H);
    }
    // aspect lock (§3.1): the non-fill axis follows the fill one → aspect-ratio + auto size
    var aAxis = L.aspectAxis(rn);
    if (aAxis) {
      main.set('aspect-ratio', num(rn.geometry.w) + ' / ' + num(rn.geometry.h));
      if (aAxis === 'h') heightDecl = null; else widthDecl = null;
      if (prn && parentMode === 'stack' && (prn.layoutParent.alignCross === 'stretch') && !main.get('align-self')) main.set('align-self', 'flex-start');
    }
    if (widthDecl !== null && widthDecl !== undefined) main.set('width', widthDecl);
    if (heightDecl !== null && heightDecl !== undefined) main.set('height', heightDecl);
    var lc = rk.layoutChild || {};
    if (lc.minW !== undefined) main.set('min-width', px(lc.minW));
    if (lc.maxW !== undefined) main.set('max-width', px(lc.maxW));
    if (lc.minH !== undefined) main.set('min-height', px(lc.minH));
    if (lc.maxH !== undefined) main.set('max-height', px(lc.maxH));
    // reverseZ: decreasing z-index among siblings
    // reverseZ (§2.2): decreasing z-index; absolute children stay above every flow sibling (§2.4)
    if (prn && prn.layoutParent.reverseZ) {
      var idx = parent.children.indexOf(node.id), nCh = parent.children.length;
      main.set('z-index', String(isAbs && parentMode !== 'absolute' ? 2 * nCh - idx : nCh - idx));
    }
    // negative spacing (§2.2): CSS has no negative gap → margin on every flow child but the first
    if (prn && parentMode === 'stack' && !isAbs && prn.layoutParent.gap !== 'auto') {
      var pg = R.resolve(doc, parent, 'layoutParent', bp).gap;
      var pgv = typeof pg === 'number' ? pg : (R.isRef(pg) ? R.resolveRefs(doc, pg) : 0);
      if (pgv < 0) {
        if (firstFlowChild(doc, parent, bp, ctx) !== node.id) main.set(prn.layoutParent.direction === 'horizontal' ? 'margin-left' : 'margin-top', px(pgv));
        if (!isContainer && !main.get('position')) main.set('position', 'relative'); // paint overlaps in tree order (Figma)
      }
    }

    /* ---- container box */
    var cont = inner || main;
    if (isContainer) {
      if (!isAbs || needsWrapper) cont.set('position', 'relative');
      var lp = rn.layoutParent, lpk = rk.layoutParent || lp;
      if (lp.mode === 'stack') {
        if (lp.direction !== 'horizontal') cont.set('flex-direction', 'column');
        if (lp.wrap) cont.set('flex-wrap', 'wrap');
        if (lp.gap === 'auto') { cont.set('justify-content', 'space-between'); if (lp.wrap && lpk.rowGap && !(lp.rowGap < 0)) cont.set('row-gap', px(lpk.rowGap)); }
        else {
          var gapV = lpk.gap, rowGapV = lp.wrap && lpk.rowGap !== undefined ? lpk.rowGap : undefined;
          var gapN = typeof lp.gap === 'number' ? lp.gap : 0, rowN = typeof lp.rowGap === 'number' ? lp.rowGap : gapN;
          if (gapN < 0) { gapV = 0; if (rowGapV === undefined) rowGapV = undefined; }         // children carry margins
          if (rowGapV !== undefined && rowN < 0) { rowGapV = 0; warn('negative-gap', 'Negative row gap is not expressible in CSS: treated as 0'); }
          if (rowGapV !== undefined && px(rowGapV) !== px(gapV)) { if (px(gapV) !== '0') cont.set('column-gap', px(gapV)); if (px(rowGapV) !== '0') cont.set('row-gap', px(rowGapV)); }
          else if (gapV && px(gapV) !== '0') cont.set('gap', px(gapV));
          var am = lp.alignMain || 'start';
          if (am !== 'start') cont.set('justify-content', am === 'spaceBetween' ? 'space-between' : am === 'end' ? 'flex-end' : 'center');
        }
        var ac = lp.alignCross || 'start';
        cont.set('align-items', ac === 'start' ? 'flex-start' : ac === 'end' ? 'flex-end' : ac);
        if (lp.wrap) cont.set('align-content', ac === 'start' || ac === 'baseline' ? 'flex-start' : ac === 'end' ? 'flex-end' : ac);
      } else if (lp.mode === 'grid') {
        cont.set('grid-template-columns', (lp.columns || []).map(trackCSS).join(' ') || 'none');
        if (lp.rows && lp.rows.length) cont.set('grid-template-rows', lp.rows.map(trackCSS).join(' '));
        var cgv = lpk.columnGap !== undefined ? lpk.columnGap : lpk.gap, rgv = lpk.rowGap !== undefined ? lpk.rowGap : lpk.gap;
        if (typeof cgv === 'number' && cgv < 0) { cgv = 0; warn('negative-gap', 'Negative grid gap is not expressible in CSS: treated as 0'); }
        if (typeof rgv === 'number' && rgv < 0) { rgv = 0; warn('negative-gap', 'Negative grid gap is not expressible in CSS: treated as 0'); }
        if (cgv !== undefined && rgv !== undefined && px(cgv) === px(rgv)) { if (px(cgv) !== '0') cont.set('gap', px(cgv)); }
        else { if (cgv !== undefined && px(cgv) !== '0') cont.set('column-gap', px(cgv)); if (rgv !== undefined && px(rgv) !== '0') cont.set('row-gap', px(rgv)); }
      }
      if (lpk.padding) { var sp = sides(lpk.padding); if (sp !== '0') cont.set('padding', sp); }
      if (lp.clip || rn.clipsContent) cont.set('overflow', 'hidden');
    }

    /* ---- §3.3 fills */
    var fills = (rn.fills || []).filter(function (f) { return f.visible !== false; });
    var fillsK = (rk.fills || []).filter(function (f) { return f.visible !== false; });
    var gradientStroke = (rn.strokes || []).filter(function (s) { return s.visible !== false && model.strokeMode(s) === 'border' && s.paint.type !== 'solid'; })[0];
    if (isText) { /* text colour handled below */ }
    else if (gradientStroke) {
      // border: W solid transparent; background: <fills> padding-box, <gradient> border-box
      var layersG = fills.slice().reverse().map(function (f) { var l = paintLayer(doc, f, W, H, warn); return l ? l.image + ' padding-box' : null; }).filter(Boolean);
      var gl = paintLayer(doc, gradientStroke.paint, W, H, warn);
      layersG.push(gl.image + ' border-box');
      vis.set('background', layersG.join(', '));
    } else if (fills.length === 1 && fills[0].type === 'solid') {
      vis.set('background-color', R.isRef(fillsK[0].color) && fills[0].opacity === 1 ? varRef(fillsK[0].color) : cssColor(fills[0].color, fills[0].opacity));
    } else if (fills.length) {
      var layers = fills.slice().reverse().map(function (f) { return paintLayer(doc, f, W, H, warn); }).filter(Boolean);
      vis.set('background-image', layers.map(function (l) { return l.image; }).join(', '));
      if (layers.some(function (l) { return l.size; })) vis.set('background-size', layers.map(function (l) { return l.size || 'auto'; }).join(', '));
      if (layers.some(function (l) { return l.position; })) vis.set('background-position', layers.map(function (l) { return l.position || '0 0'; }).join(', '));
      if (layers.some(function (l) { return l.repeat; })) vis.set('background-repeat', layers.map(function (l) { return l.repeat || 'no-repeat'; }).join(', '));
      if (layers.some(function (l) { return l.blend && l.blend !== 'normal'; })) vis.set('background-blend-mode', layers.map(function (l) { return l.blend || 'normal'; }).join(', '));
    }
    if (isImage) {
      var fitMap = { fill: 'cover', fit: 'contain', crop: 'cover', tile: 'none' };
      (inner || main).set('object-fit', rn.fit && rn.fit !== 'fill' ? fitMap[rn.fit] || 'cover' : 'cover');
      if (rn.fit === 'crop' && rn.crop) { // §3.3: visible part of the image → object-position (cover keeps the scale)
        var ic = rn.crop;
        (inner || main).set('object-position', pct(ic.w < 1 ? ic.x / (1 - ic.w) * 100 : 50) + ' ' + pct(ic.h < 1 ? ic.y / (1 - ic.h) * 100 : 50));
      }
    }
    var bm = BLEND_CSS[rn.blendMode];
    if (bm && bm !== 'normal') main.set('mix-blend-mode', bm);
    if (rn.blendMode === 'linearBurn') warn('blend-fallback', 'Linear burn \u2192 multiply');
    // §3.3: a Normal group is isolated (isolate = false ⇔ Pass through, §0.3); other blend modes
    // isolate already through mix-blend-mode
    if (isContainer && (rn.blendMode === 'normal' || (rn.isolate === true && (!rn.blendMode || rn.blendMode === 'passThrough')))) main.set('isolation', 'isolate');
    if (rn.opacity !== undefined && rn.opacity < 1) main.set('opacity', num(rn.opacity));

    /* ---- §3.4 strokes + §3.5 shadows */
    var shadowList = [];
    (rn.strokes || []).forEach(function (s, i) {
      if (s.visible === false) return;
      var mode = model.strokeMode(s), sk = rk.strokes && rk.strokes[i] || s;
      var col = s.paint.type === 'solid' ? cssColor(R.isRef(sk.paint.color) && (s.paint.opacity === undefined || s.paint.opacity === 1) ? sk.paint.color : s.paint.color, s.paint.opacity) : 'transparent';
      if (rn.type === 'line') return; // inline SVG <line> (§3.4), see svgDecls below
      if (mode === 'shadow' && squircle) return; // SVG ring in ::after (below)
      if (mode === 'shadow') {
        if (rn.type === 'ellipse' && Math.abs(W - H) > 0.5 && s.align !== 'center') warn('ellipse-stroke', 'Inside/outside stroke on a non-circular ellipse: box-shadow offsets the ellipse radii (approximation of the true offset curve)');
        if (s.align === 'inside') shadowList.push('inset 0 0 0 ' + px(s.width) + ' ' + col);
        else if (s.align === 'outside') shadowList.push('0 0 0 ' + px(s.width) + ' ' + col);
        else { shadowList.push('inset 0 0 0 ' + px(s.width / 2) + ' ' + col); shadowList.push('0 0 0 ' + px(s.width / 2) + ' ' + col); }
      } else if (mode === 'border') {
        if (typeof s.width === 'object') {
          ['top', 'right', 'bottom', 'left'].forEach(function (side) { if (s.width[side]) vis.set('border-' + side, px(s.width[side]) + ' ' + (s.dash ? 'dashed' : 'solid') + ' ' + col); });
        } else if (s.paint.type !== 'solid') vis.set('border', px(s.width) + ' solid transparent');
        else { vis.set('border', px(s.width) + ' dashed ' + col); warn('dash-approx', 'CSS dashed pattern is not parametrable; dash ' + s.dash.join('/') + ' approximated'); }
        if (s.align !== 'inside') warn('border-align', 'Real CSS border is always inside; ' + s.align + ' alignment approximated');
      } else if (mode === 'outline') {
        vis.set('outline', px(s.width) + ' dashed ' + col);
        vis.set('outline-offset', s.align === 'outside' ? '0' : px(-s.width / 2));
        warn('dash-approx', 'CSS dashed pattern is not parametrable; dash approximated with outline');
      }
    });
    // squircle strokes: SVG ring (inside: 2W clipped to the shape, center: W, outside: 2W clipped
    // outside) painted by ::after on the unclipped wrapper, the squircle recomputed per breakpoint
    if (squircleStrokes.length) {
      var ext = 0;
      squircleStrokes.forEach(function (st) { ext = Math.max(ext, st.align === 'outside' ? st.width : st.align === 'center' ? st.width / 2 : 0); });
      ext = Math.ceil(ext + 1);
      var SW = W + 2 * ext, SH = H + 2 * ext, P = squirclePath(W, H, rn.corners, ext, ext);
      var body = squircleStrokes.slice().reverse().map(function (st) {
        var colS = st.paint.type === 'solid' ? cssColor(st.paint.color, st.paint.opacity) : '#000';
        var sw = st.align === 'center' ? st.width : 2 * st.width;
        var clip = st.align === 'inside' ? ' clip-path="url(#i)"' : st.align === 'outside' ? ' clip-path="url(#o)"' : '';
        return '<path d="' + P + '" fill="none" stroke="' + colS + '" stroke-width="' + num(sw) + '"' + clip + '/>';
      }).join('');
      var svgS = '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(SW) + '" height="' + num(SH) + '" viewBox="0 0 ' + num(SW) + ' ' + num(SH) + '"><clipPath id="i"><path d="' + P + '"/></clipPath><clipPath id="o"><path clip-rule="evenodd" d="M0 0H' + num(SW) + 'V' + num(SH) + 'H0Z ' + P + '"/></clipPath>' + body + '</svg>';
      after = new Decls();
      after.set('content', '""'); after.set('position', 'absolute'); after.set('inset', px(-ext));
      after.set('background-image', svgDataUrl(svgS)); after.set('background-size', '100% 100%'); after.set('background-repeat', 'no-repeat');
      after.set('pointer-events', 'none');
      if (!main.get('position')) main.set('position', 'relative');
    }
    var dropFilter = null;
    (rn.effects || []).forEach(function (e, i) {
      if (e.visible === false) return;
      var ek = rk.effects && rk.effects[i] || e;
      if (e.type === 'dropShadow') {
        var col = cssColor(R.isRef(ek.color) ? ek.color : e.color);
        // drop-shadow() follows the alpha of the element (clip-path, transparent PNG): used on a
        // squircle wrapper and when the shadow must not show behind transparent parts (§3.5)
        if (needsWrapper || e.showBehindTransparent === false) {
          dropFilter = (dropFilter ? dropFilter + ' ' : '') + 'drop-shadow(' + px(e.x) + ' ' + px(e.y) + ' ' + px(e.blur) + ' ' + col + ')';
          if (e.spread) warn('shadow-approx', 'drop-shadow() has no spread: ' + e.spread + 'px approximated');
        } else shadowList.push(px(e.x) + ' ' + px(e.y) + ' ' + px(e.blur) + ' ' + px(e.spread || 0) + ' ' + col);
      } else if (e.type === 'innerShadow') {
        shadowList.push('inset ' + px(e.x) + ' ' + px(e.y) + ' ' + px(e.blur) + ' ' + px(e.spread || 0) + ' ' + cssColor(R.isRef(ek.color) ? ek.color : e.color));
        if (squircle) warn('squircle-shadow', 'Inner shadow follows border-radius, not the squircle');
      }
    });
    /* ---- §3.2 corners */
    var ck = rk.corners || rn.corners, cr = rn.corners || { tl: 0, tr: 0, br: 0, bl: 0 };
    if (rn.type === 'ellipse') vis.set('border-radius', '50%');
    else if (cr.tl || cr.tr || cr.br || cr.bl) {
      // CSS applies the §5.5 factor itself; the extra min(w, h) / 2 cap of §3.2 is emitted explicitly
      var er = effectiveRadii(cr, W, H), fCss = 1, c0 = { tl: Math.max(0, cr.tl || 0), tr: Math.max(0, cr.tr || 0), br: Math.max(0, cr.br || 0), bl: Math.max(0, cr.bl || 0) };
      [[c0.tl + c0.tr, W], [c0.bl + c0.br, W], [c0.tl + c0.bl, H], [c0.tr + c0.br, H]].forEach(function (sd) { if (sd[0] > 0) fCss = Math.min(fCss, sd[1] / sd[0]); });
      var clamped = ['tl', 'tr', 'br', 'bl'].some(function (k) { return er[k] < c0[k] * fCss - 1e-9; });
      var rs = clamped ? [er.tl, er.tr, er.br, er.bl].map(px) : [ck.tl, ck.tr, ck.br, ck.bl].map(px);
      vis.set('border-radius', rs[0] === rs[1] && rs[1] === rs[2] && rs[2] === rs[3] ? rs[0] : rs.join(' '));
      if (squircle) vis.set('clip-path', "path('" + squirclePath(W, H, cr) + "')");
    }
    if (shadowList.length) vis.set('box-shadow', shadowList.join(', '));
    var filters = [];
    if (dropFilter) main.set('filter', dropFilter);
    (rn.effects || []).forEach(function (e) {
      if (e.visible === false) return;
      if (e.type === 'layerBlur') filters.push('blur(' + px(kBlur * e.radius) + ')');
      if (e.type === 'backgroundBlur') {
        var bf = 'blur(' + px(kBlur * e.radius) + ')';
        vis.set('backdrop-filter', bf); // unprefixed only: Chromium rejects -webkit-backdrop-filter (CSS.supports), Safari ≥ 18 is unprefixed
        var last = fills[fills.length - 1];
        if (last && last.type === 'solid' && (last.color.a === undefined || last.color.a >= 1) && (last.opacity === undefined || last.opacity >= 1)) warn('backdrop-opaque', 'Background blur behind an opaque fill is invisible');
      }
    });
    if (filters.length) { var f0 = main.get('filter'); main.set('filter', (f0 ? f0 + ' ' : '') + filters.join(' ')); }

    /* ---- §3.6 typography */
    if (isText) {
      var st = rn.style, stk = rk.style || st;
      main.set('font-family', R.isRef(stk.family) ? varRef(stk.family) + ', sans-serif' : familyCSS(st.family));
      main.set('font-weight', R.isRef(stk.weight) ? varRef(stk.weight) : String(st.weight || 400));
      if (st.italic) main.set('font-style', 'italic');
      main.set('font-size', R.isRef(stk.size) ? varRef(stk.size) : px(st.size));
      var LH = st.lineHeight || { unit: 'auto' };
      main.set('line-height', LH.unit === 'px' ? px(LH.value) : LH.unit === '%' ? num(LH.value / 100) : 'normal');
      var LS = st.letterSpacing;
      if (LS && LS.value) main.set('letter-spacing', LS.unit === '%' ? num(LS.value / 100) + 'em' : px(LS.value));
      if (st.axes) main.set('font-variation-settings', Object.keys(st.axes).map(function (k) { return '"' + k + '" ' + num(st.axes[k]); }).join(', '));
      if (st.features) main.set('font-feature-settings', Object.keys(st.features).map(function (k) { return '"' + k + '" ' + (st.features[k] ? 1 : 0); }).join(', '));
      if (st.align && st.align !== 'left') main.set('text-align', st.align);
      if (st.case && st.case !== 'none') main.set('text-transform', st.case === 'upper' ? 'uppercase' : st.case === 'lower' ? 'lowercase' : 'capitalize');
      if (st.decoration && st.decoration !== 'none') main.set('text-decoration', st.decoration === 'strike' ? 'line-through' : 'underline');
      if (st.paragraphIndent) main.set('text-indent', px(st.paragraphIndent));
      var tf = (st.fills || []).filter(function (f) { return f.visible !== false; });
      var tfk = (stk.fills || []).filter(function (f) { return f.visible !== false; });
      if (tf.length === 1 && tf[0].type === 'solid') main.set('color', R.isRef(tfk[0].color) ? varRef(tfk[0].color) : cssColor(tf[0].color, tf[0].opacity));
      else if (tf.length) {
        main.set('background-image', tf.slice().reverse().map(function (f) { return paintLayer(doc, f, W, H, warn).image; }).join(', '));
        main.set('-webkit-background-clip', 'text'); main.set('background-clip', 'text'); main.set('color', 'transparent');
      } else main.set('color', 'transparent');
      if (rn.resize === 'autoWidth') main.set('white-space', 'pre');
      else { main.set('white-space', 'pre-wrap'); main.set('overflow-wrap', 'anywhere'); }
      if (rn.resize === 'fixed') main.set('overflow', 'hidden');
      if (rn.truncate && rn.truncate.lines > 0) { main.set('-webkit-line-clamp', String(rn.truncate.lines)); main.set('-webkit-box-orient', 'vertical'); main.set('overflow', 'hidden'); }
      else if (display === 'flex') { main.set('flex-direction', 'column'); main.set('justify-content', st.verticalAlign === 'middle' ? 'center' : 'flex-end'); }
    }

    /* ---- transform (rotate · scaleX · scaleY, origin 50% 50%) */
    var g2 = rn.geometry, tr = [];
    if (g2.rotation) tr.push('rotate(' + num(g2.rotation) + 'deg)');
    if (g2.flipH) tr.push('scaleX(-1)');
    if (g2.flipV) tr.push('scaleY(-1)');
    if (rn.transform && rn.transform.scale !== undefined && rn.transform.scale !== 1) tr.push('scale(' + num(rn.transform.scale) + ')');
    if (tr.length) { main.set('transform', tr.join(' ')); main.set('transform-origin', '50% 50%'); }

    var svgDecls = null;
    if (rn.type === 'line') {
      svgDecls = new Decls();
      var ls = (rn.strokes || []).filter(function (st) { return st.visible !== false && typeof st.width === 'number' && st.width > 0; })[0];
      if (ls) {
        var lsk = rk.strokes && rk.strokes[(rn.strokes || []).indexOf(ls)] || ls;
        svgDecls.set('stroke', ls.paint.type === 'solid' ? cssColor(R.isRef(lsk.paint.color) ? lsk.paint.color : ls.paint.color, ls.paint.opacity) : '#000');
        svgDecls.set('stroke-width', px(ls.width));
        if (ls.cap && ls.cap !== 'butt') svgDecls.set('stroke-linecap', ls.cap);
        if (ls.dash && ls.dash[0] > 0) svgDecls.set('stroke-dasharray', num(ls.dash[0]) + ' ' + num(ls.dash[1] || ls.dash[0]));
      } else svgDecls.set('stroke', 'none');
    }
    return { main: main.list, inner: inner ? inner.list : null, after: after ? after.list : null, svg: svgDecls ? svgDecls.list : null, wrapper: needsWrapper, warnings: warnings };
  }

  /** Memoised resolveNode for one generator run (ctx.rcache). */
  function resolvedOf(doc, node, bp, state, keepRefs, ctx) {
    var c = ctx && ctx.rcache;
    if (!c) return R.resolveNode(doc, node, bp, state, keepRefs ? { keepRefs: true } : undefined);
    // without token references the two views are the same object
    if (keepRefs) {
      var hr = ctx.hasRefs || (ctx.hasRefs = new Map()), h = hr.get(node.id);
      if (h === undefined) { h = R.nodeHasRefs(node); hr.set(node.id, h); }
      if (!h) return resolvedOf(doc, node, bp, state, false, ctx);
    }
    // the layout engine of the export already holds the resolved views (no state)
    if (!state && !keepRefs && ctx.engine && !ctx.engine.state) return ctx.engine.resolved(node, bp);
    var key = node.id + '|' + bp + '|' + (state || '') + (keepRefs ? '|k' : '');
    var hit = c.get(key);
    if (!hit) { hit = R.resolveNode(doc, node, bp, state, keepRefs ? { keepRefs: true } : undefined); c.set(key, hit); }
    return hit;
  }
  /** First visible flow child of a stack at a breakpoint, in `order`-modified document order. */
  function firstFlowChild(doc, parent, bp, ctx) {
    var memo = ctx && (ctx.firstFlow || (ctx.firstFlow = new Map())), key = parent.id + '|' + bp;
    if (memo && memo.has(key)) return memo.get(key);
    var best = null, bestOrder = Infinity;
    (parent.children || []).forEach(function (cid) {
      var c = doc.nodes[cid]; if (!c) return;
      var rc = resolvedOf(doc, c, bp, undefined, false, ctx);
      if (rc.visible === false || rc.layoutChild.position === 'absolute') return;
      var o = rc.layoutChild.order || 0;
      if (o < bestOrder) { best = cid; bestOrder = o; }
    });
    if (memo) memo.set(key, best);
    return best;
  }

  /** Declarations of a rich-text run's partial style (§3.6: runs → spans with derived classes). */
  function runDeclarations(doc, style, warnings) {
    var s = R.resolveRefs(doc, style), out = [];
    if (s.family) out.push(['font-family', familyCSS(s.family)]);
    if (s.weight) out.push(['font-weight', String(s.weight)]);
    if (s.italic !== undefined) out.push(['font-style', s.italic ? 'italic' : 'normal']);
    if (s.size) out.push(['font-size', px(s.size)]);
    if (s.letterSpacing) out.push(['letter-spacing', s.letterSpacing.unit === '%' ? num(s.letterSpacing.value / 100) + 'em' : px(s.letterSpacing.value)]);
    if (s.case) out.push(['text-transform', s.case === 'upper' ? 'uppercase' : s.case === 'lower' ? 'lowercase' : s.case === 'title' ? 'capitalize' : 'none']);
    if (s.decoration) out.push(['text-decoration', s.decoration === 'strike' ? 'line-through' : s.decoration === 'underline' ? 'underline' : 'none']);
    if (s.fills && s.fills.length && s.fills[0].type === 'solid') out.push(['color', cssColor(s.fills[0].color, s.fills[0].opacity)]);
    return out;
  }

  function trackCSS(t) {
    if (!t) return 'auto';
    if (t.kind === 'px') return px(t.value);
    if (t.kind === 'fr') return num(t.value) + 'fr';
    if (t.kind === 'auto') return 'auto';
    if (t.kind === 'minmax') return 'minmax(' + trackCSS(t.min) + ', ' + trackCSS(t.max) + ')';
    return 'auto';
  }

  /* ------------------------------------------------------------------ diffing between cascade levels */

  function toMap(list) { var m = {}; (list || []).forEach(function (d) { m[d[0]] = d[1]; }); return m; }
  /** declarations of `next` that differ from `prev` (+ resets for the ones that disappeared). */
  function diffDecls(prevList, nextList) {
    var prev = toMap(prevList), next = toMap(nextList), out = [];
    (nextList || []).forEach(function (d) { if (prev[d[0]] !== d[1]) out.push([d[0], d[1]]); });
    (prevList || []).forEach(function (d) { if (next[d[0]] === undefined) out.push([d[0], INITIAL[d[0]] !== undefined ? INITIAL[d[0]] : 'unset']); });
    return out;
  }

  /* ------------------------------------------------------------------ tokens → :root */

  function tokenValueCSS(type, v) {
    if (v === null || v === undefined) return null;
    if (v && typeof v === 'object' && typeof v.alias === 'string') return 'var(' + R.cssVarName(v.alias) + ')';
    switch (type) {
      case 'color': return typeof v === 'string' ? cssColor(model.hex(v)) : cssColor(v);
      case 'dimension': return typeof v === 'number' ? px(v) : (v.unit ? num(v.value) + v.unit : px(v.value));
      case 'duration': return typeof v === 'number' ? num(v) + 'ms' : num(v.value) + (v.unit || 'ms');
      case 'fontFamily': return '"' + esc(Array.isArray(v) ? v[0] : v) + '"';
      case 'fontWeight': case 'number': return String(v);
      case 'cubicBezier': return 'cubic-bezier(' + v.map(num).join(', ') + ')';
      case 'shadow': { var s = Array.isArray(v) ? v : [v]; return s.map(function (sh) { return [sh.inset ? 'inset' : '', dim(sh.offsetX), dim(sh.offsetY), dim(sh.blur), dim(sh.spread), typeof sh.color === 'string' ? cssColor(model.hex(sh.color)) : cssColor(sh.color)].filter(Boolean).join(' '); }).join(', '); }
      default: return typeof v === 'string' ? v : JSON.stringify(v);
    }
    function dim(d) { return d === undefined ? '0' : (typeof d === 'number' ? px(d) : num(d.value) + (d.unit || 'px')); }
  }
  /**
   * :root (first mode) and [data-theme="<mode>"] blocks of custom properties (§4.4). Aliases stay
   * live (var(--alias)); a token whose alias chain is broken (cycle, depth > 32, unknown token) is
   * emitted as its neutral fallback instead — mutually recursive custom properties would silently
   * make every property that uses them invalid — and reported in `warnings`.
   */
  function tokenRules(doc, warnings) {
    var rules = [], sets = (doc.tokens && doc.tokens.sets) || [], modes = (doc.tokens && doc.tokens.modes) || [];
    if (!sets.length) return rules;
    var modeIds = modes.length ? modes.map(function (m) { return m.id; }) : [null];
    modeIds.forEach(function (mid, mi) {
      var decls = [];
      sets.forEach(function (set) {
        var active = (doc.tokens.activeMode && doc.tokens.activeMode[set.id]) || modeIds[0];
        Object.keys(set.tokens || {}).forEach(function (name) {
          var t = set.tokens[name], vbm = t.valueByMode || {};
          var key = mid === null ? Object.keys(vbm)[0] : (vbm[mid] !== undefined ? mid : (mi === 0 ? active : null));
          if (key === null || key === undefined) return;
          var v = vbm[key]; if (v === undefined && t.value !== undefined) v = t.value;
          if (v && typeof v === 'object' && typeof v.alias === 'string') {
            try { R.resolveToken(doc, name, key); }
            catch (e) {
              if (warnings) warnings.push({ node: null, code: 'token', message: e.message + ' \u2192 --' + name + ' emitted as a neutral fallback', breakpoint: null, state: null });
              v = R.fallbackFor(doc, { ref: name });
              if (t.type === 'color') v = cssColor(v) === 'transparent' ? 'transparent' : v;
            }
          }
          var css = v === 'transparent' ? 'transparent' : tokenValueCSS(t.type, v);
          if (css !== null) decls.push([R.cssVarName(name), css]);
        });
      });
      if (decls.length) rules.push({ selector: mi === 0 ? ':root' : '[data-theme="' + mid + '"]', media: null, declarations: decls });
    });
    return rules;
  }

  /* ------------------------------------------------------------------ @font-face */

  function fontFaceRules(doc) {
    var out = [];
    Object.keys(doc.assets || {}).forEach(function (id) {
      var a = doc.assets[id];
      if (!a || a.type !== 'font') return;
      var d = [['font-family', '"' + esc(a.family) + '"'], ['src', 'url("' + esc(a.url || a.src || a.data) + '") format("' + (a.format || 'woff2') + '")'], ['font-weight', String(a.weight || 400)], ['font-style', a.style || 'normal'], ['font-display', a.display || 'swap']];
      if (a.unicodeRange) d.push(['unicode-range', a.unicodeRange]);
      out.push({ selector: '@font-face', media: null, declarations: d });
    });
    return out;
  }

  /* ------------------------------------------------------------------ generator */

  var PRELUDE = [
    { selector: 'html, body', media: null, declarations: [['margin', '0'], ['padding', '0']] },
    { selector: '[class*="de-"]', media: null, declarations: [['box-sizing', 'border-box'], ['margin', '0'], ['padding', '0'], ['border', '0 none'], ['font', 'inherit'], ['color', 'inherit'], ['text-decoration', 'none'], ['list-style', 'none'], ['background', 'none'], ['appearance', 'none']] },
    { selector: '.de-para', media: null, declarations: [['display', 'block']] },
    { selector: '.de-svg', media: null, declarations: [['display', 'block'], ['overflow', 'visible']] }
  ];

  /** `.cls:hover`, `.cls[disabled], .cls[aria-disabled="true"]` …; `tail` is appended to every part. */
  function stateSelector(cls, state, tail) {
    var suffixes = STATE_SELECTOR[state] || ['[data-state="' + state + '"]'];
    return suffixes.map(function (sfx) { return '.' + cls + sfx + (tail || ''); }).join(', ');
  }

  var WEBKIT_BACKDROP = '(-webkit-backdrop-filter: none) and (not (backdrop-filter: none))';
  /** props / values of a declaration list as a map */
  function norm(map, p) { var v = map[p]; return v === undefined ? (INITIAL[p] !== undefined ? INITIAL[p] : 'unset') : v; }

  /**
   * @param {Object} doc
   * @param {Object} [opts] { layouts, measurer, kBlur, page, prelude: true, tokens: true, fonts: true, reducedMotion: true }
   * @returns {{css:string, rules:Array, warnings:Array, kBlur:number, layouts:Object, wrappers:Object}}
   */
  function generate(doc, opts) {
    opts = opts || {};
    var layouts = opts.layouts || L.layoutAll(doc, { measurer: opts.measurer, rootPlacement: 'flow' });
    var warnings = [];
    var ctx = { layouts: layouts, kBlur: opts.kBlur !== undefined ? opts.kBlur : K_BLUR, warnings: warnings, rcache: new Map(), forceWrap: new Set(), engine: opts.engine || null };
    var rules = [];
    if (opts.prelude !== false) rules = rules.concat(PRELUDE);
    if (opts.fonts !== false) rules = rules.concat(fontFaceRules(doc));
    if (opts.tokens !== false) rules = rules.concat(tokenRules(doc, warnings));
    var bps = doc.breakpoints.map(function (b) { return b.id; });
    var page = opts.page || doc.pages[0];
    var order = [];
    (function walk(ids) { ids.forEach(function (id) { var nd = doc.nodes[id]; if (!nd) return; order.push(nd); if (nd.children) walk(nd.children); }); })(page.children);
    var mediaRules = {}; bps.slice(1).forEach(function (b) { mediaRules[b] = []; });
    var reduced = [], wrappers = {};
    var PARTS = ['main', 'inner', 'after', 'svg'];
    function push(list, rule) {
      list.push(rule);
      var bf = null; rule.declarations.forEach(function (d) { if (d[0] === 'backdrop-filter') bf = d[1]; });
      if (bf !== null) list.push({ selector: rule.selector, media: rule.media, supports: WEBKIT_BACKDROP, declarations: [['-webkit-backdrop-filter', bf]], node: rule.node, state: rule.state, part: rule.part });
    }
    order.forEach(function (node) {
      var cls = model.classOf(node.id);
      var states = Object.keys(node.states || {});
      var perBp = {}, perState = {};
      function compute() {
        bps.forEach(function (bp) { perBp[bp] = nodeDeclarations(doc, node, bp, undefined, ctx); perState[bp] = {}; states.forEach(function (st) { perState[bp][st] = nodeDeclarations(doc, node, bp, st, ctx); }); });
      }
      var w0 = warnings.length;
      compute();
      // the markup is the same at every breakpoint / state: one wrapper decision for all of them
      var anyWrap = false, allWrap = true;
      bps.forEach(function (bp) { [perBp[bp]].concat(states.map(function (st) { return perState[bp][st]; })).forEach(function (d) { if (d.wrapper) anyWrap = true; else allWrap = false; }); });
      if (anyWrap && !allWrap) { warnings.length = w0; ctx.forceWrap.add(node.id); compute(); }
      if (anyWrap) wrappers[node.id] = true;
      function sel(part, st) {
        var tail = part === 'inner' ? ' > .' + cls + '-in' : part === 'after' ? '::after' : part === 'svg' ? ' .' + cls + '-s' : '';
        return st ? stateSelector(cls, st, tail) : '.' + cls + tail;
      }
      var base = perBp.base;
      var baseDecls = base.main.slice();
      // transitions (§4.3 / §5.2)
      if (node.animation && states.length) {
        var changed = {};
        states.forEach(function (st) { diffDecls(base.main, perState.base[st].main).forEach(function (d) { changed[d[0]] = true; }); });
        var props = Object.keys(changed);
        if (props.length) {
          var e = M.easingToCSS(node.animation.easing, node.animation.duration || 200, { distance: node.animation.distance });
          (e.warnings || []).forEach(function (wm) { warnings.push({ node: node.id, code: 'easing', message: wm, breakpoint: 'base', state: null }); });
          var dur = node.animation.easing && node.animation.easing.kind === 'spring' ? e.durationMs : (node.animation.duration || 200);
          baseDecls.push(['transition', props.map(function (pp) { return pp + ' ' + num(dur) + 'ms ' + e.css + (node.animation.delay ? ' ' + num(node.animation.delay) + 'ms' : ''); }).join(', ')]);
          reduced.push({ selector: '.' + cls, media: '(prefers-reduced-motion: reduce)', declarations: [['transition', props.indexOf('opacity') >= 0 || props.indexOf('background-color') >= 0 ? props.filter(function (pp) { return pp === 'opacity' || pp === 'background-color' || pp === 'color'; }).map(function (pp) { return pp + ' ' + num(dur) + 'ms linear'; }).join(', ') || 'none' : 'none']] });
        }
      }
      PARTS.forEach(function (part) {
        var list = part === 'main' ? baseDecls : base[part];
        if (list && (list.length || part === 'main')) push(rules, { selector: sel(part), media: null, declarations: list, node: node.id, part: part === 'main' ? undefined : part });
      });
      if (node.type === 'text') {
        var paras = (node.text && node.text.paragraphs) || [];
        var ps = node.style && node.style.paragraphSpacing;
        if (paras.length > 1 && ps) rules.push({ selector: '.' + cls + ' > .de-para:not(:last-child)', media: null, declarations: [['margin-bottom', px(ps)]], node: node.id });
        paras.forEach(function (pa, pi) {
          (pa.runs || []).forEach(function (r, ri) {
            if (!r.style) return;
            var rd = runDeclarations(doc, r.style, warnings);
            if (rd.length) rules.push({ selector: '.' + cls + '-r' + pi + '-' + ri, media: null, declarations: rd, node: node.id });
          });
        });
      }
      /*
       * States × breakpoints (§1.5 / §4.3). `.x:hover` outranks `.x` whatever the media block, so the
       * value in effect on hover at a breakpoint is the last :hover declaration of the property (base
       * or wider media blocks), else the plain value. For every (breakpoint, state) the generator
       * emits the real state value of each property whose effective hover value would otherwise
       * differ — never a reset while the state still defines the property.
       */
      PARTS.forEach(function (part) {
        states.forEach(function (st) {
          var hoverMap = {};
          bps.forEach(function (bp, bi) {
            var plain = toMap(perBp[bp][part]), desiredList = perState[bp][st][part] || [], desired = toMap(desiredList);
            var keys = desiredList.map(function (d) { return d[0]; });
            Object.keys(plain).concat(Object.keys(hoverMap)).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
            var out = [];
            keys.forEach(function (k) {
              var eff = hoverMap[k] !== undefined ? hoverMap[k] : norm(plain, k), want = norm(desired, k);
              if (eff !== want) { out.push([k, want]); hoverMap[k] = want; }
            });
            if (!out.length) return;
            var rule = { selector: sel(part, st), media: bi === 0 ? null : R.mediaQuery(doc, bp), declarations: out, node: node.id, state: st, part: part === 'main' ? undefined : part };
            push(bi === 0 ? rules : mediaRules[bp], rule);
          });
        });
      });
      // narrower breakpoints: diff against the next wider one
      for (var i = 1; i < bps.length; i++) {
        var bp = bps[i], wider = bps[i - 1];
        PARTS.forEach(function (part) {
          if (!perBp[bp][part] && !perBp[wider][part]) return;
          var d2 = diffDecls(perBp[wider][part], perBp[bp][part]);
          if (d2.length) push(mediaRules[bp], { selector: sel(part), media: R.mediaQuery(doc, bp), declarations: d2, node: node.id, part: part === 'main' ? undefined : part });
        });
      }
    });
    // media blocks last, widest → narrowest (each node's base and state rules precede them)
    bps.slice(1).forEach(function (b) { rules = rules.concat(mediaRules[b]); });
    if (opts.reducedMotion !== false) rules = rules.concat(reduced);
    R.takeTokenIssues(doc).forEach(function (msg) { warnings.push({ node: null, code: 'token', message: msg + ' (resolved to a neutral fallback)', breakpoint: null, state: null }); });
    return { css: rulesToCSS(rules), rules: rules, warnings: warnings, kBlur: ctx.kBlur, layouts: layouts, wrappers: wrappers };
  }

  function rulesToCSS(rules) {
    var out = [], curMedia = null, buf = [];
    function flush() { if (curMedia !== null) { out.push('@media ' + curMedia + ' {\n' + buf.map(function (l) { return '  ' + l; }).join('\n') + '\n}'); } else out = out.concat(buf); buf = []; }
    rules.forEach(function (r) {
      var media = r.media || null;
      if (media !== curMedia) { flush(); curMedia = media; }
      var body = r.declarations.map(function (d) { return d[0] + ': ' + d[1] + ';'; }).join(' ');
      var line = r.selector + ' { ' + body + ' }';
      buf.push(r.supports ? '@supports ' + r.supports + ' { ' + line + ' }' : line);
    });
    flush();
    return out.join('\n') + '\n';
  }

  /** Inspector helper: the declarations produced for one node at (bp, state), as CSS text. */
  function nodeCSS(doc, node, bp, state, ctx) {
    var d = nodeDeclarations(doc, node, bp, state, ctx);
    var cls = model.classOf(node.id);
    var s = '.' + cls + ' {\n' + d.main.map(function (x) { return '  ' + x[0] + ': ' + x[1] + ';'; }).join('\n') + '\n}';
    if (d.inner) s += '\n.' + cls + '-in {\n' + d.inner.map(function (x) { return '  ' + x[0] + ': ' + x[1] + ';'; }).join('\n') + '\n}';
    return s;
  }

  return {
    K_BLUR: K_BLUR, BLEND_CSS: BLEND_CSS, STATE_SELECTOR: STATE_SELECTOR, INITIAL: INITIAL,
    num: num, px: px, pct: pct, cssColor: cssColor, sides: sides,
    effectiveRadii: effectiveRadii, squirclePath: squirclePath, cornerParams: cornerParams, hasSquircle: hasSquircle,
    linearGradient: linearGradient, radialGradient: radialGradient, conicGradient: conicGradient, diamondGradient: diamondGradient, gradientGeometry: gradientGeometry, ellipseFrame: ellipseFrame, paintLayer: paintLayer, svgDataUrl: svgDataUrl,
    nodeDeclarations: nodeDeclarations, diffDecls: diffDecls, tokenRules: tokenRules, tokenValueCSS: tokenValueCSS, fontFaceRules: fontFaceRules,
    generate: generate, rulesToCSS: rulesToCSS, nodeCSS: nodeCSS, trackCSS: trackCSS
  };
});
