/* DualEngine — motion.js
 * Physics (§5.2): cubic-bezier solver (Newton-Raphson 8 iterations ε 1e-6, then bisection — like
 * WebKit), damped spring closed forms for ζ < 1, ζ = 1, ζ > 1 with initial velocity, rest
 * detection (restDelta / restSpeed, 1 ms steps then bisection, 10 s hard cap), CSS `linear()`
 * sampler (N = clamp(round(T / 8 ms), 24, 240) points) and WAAPI keyframes fallback data.
 * Spring velocity (Easing.velocity, px/s) is normalised by the animated distance (opts.distance).
 */
(function (global, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.DualEngine = global.DualEngine || {}).motion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /**
   * @typedef {{kind:'linear'}|{kind:'bezier',p1x:number,p1y:number,p2x:number,p2y:number}
   *   |{kind:'spring',mass:number,stiffness:number,damping:number,velocity?:number,restDelta?:number,restSpeed?:number}} Easing
   */

  var PRESETS = {
    ease: { kind: 'bezier', p1x: 0.25, p1y: 0.1, p2x: 0.25, p2y: 1 },
    easeIn: { kind: 'bezier', p1x: 0.42, p1y: 0, p2x: 1, p2y: 1 },
    easeOut: { kind: 'bezier', p1x: 0, p1y: 0, p2x: 0.58, p2y: 1 },
    easeInOut: { kind: 'bezier', p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 },
    linear: { kind: 'linear' },
    spring: { kind: 'spring', mass: 1, stiffness: 100, damping: 10 }
  };

  /* ------------------------------------------------------------------ cubic bezier */

  var NEWTON_ITERATIONS = 8, NEWTON_EPSILON = 1e-6, BISECTION_EPSILON = 1e-7, BISECTION_MAX = 64;

  /**
   * Returns y(x) for cubic-bezier(p1x, p1y, p2x, p2y), x in [0, 1].
   */
  function cubicBezier(p1x, p1y, p2x, p2y) {
    // CSS Easing §2.2: x control values must lie in [0, 1] and every value must be finite
    // (otherwise the declaration is invalid). Out-of-range / non-finite inputs are sanitised and
    // reported on fn.warnings so that the generator never emits an invalid timing function.
    var warnings = [];
    function fin(v, d, name) { if (typeof v === 'number' && isFinite(v)) return v; warnings.push(name + ' is not a finite number (' + v + ') \u2192 ' + d); return d; }
    p1x = fin(p1x, 0, 'p1x'); p1y = fin(p1y, 0, 'p1y'); p2x = fin(p2x, 1, 'p2x'); p2y = fin(p2y, 1, 'p2y');
    if (p1x < 0 || p1x > 1) { warnings.push('p1x ' + p1x + ' outside [0, 1] \u2192 clamped'); p1x = Math.max(0, Math.min(1, p1x)); }
    if (p2x < 0 || p2x > 1) { warnings.push('p2x ' + p2x + ' outside [0, 1] \u2192 clamped'); p2x = Math.max(0, Math.min(1, p2x)); }
    var cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    var cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
    function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
    function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    function solveT(x) {
      var t = x, i;
      for (i = 0; i < NEWTON_ITERATIONS; i++) {
        var dx = sampleX(t) - x;
        if (Math.abs(dx) < NEWTON_EPSILON) return t;
        var d = sampleDX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= dx / d;
      }
      var t0 = 0, t1 = 1; t = x;
      for (i = 0; i < BISECTION_MAX; i++) {
        var x2 = sampleX(t);
        if (Math.abs(x2 - x) < BISECTION_EPSILON) return t;
        if (x > x2) t0 = t; else t1 = t;
        t = (t0 + t1) / 2;
      }
      return t;
    }
    var fn = function (x) {
      if (x <= 0) return x === 0 ? 0 : (p1x > 0 ? (p1y / p1x) * x : 0); // CSS: linear extrapolation for x < 0
      if (x >= 1) return 1;
      return sampleY(solveT(x));
    };
    fn.toCSS = function () { return 'cubic-bezier(' + [p1x, p1y, p2x, p2y].map(fmt).join(', ') + ')'; };
    fn.warnings = warnings;
    return fn;
  }

  /* ------------------------------------------------------------------ spring */

  /**
   * Damped harmonic oscillator around the target (x = distance to target, x(0) = x0, v(0) = v0).
   * Returns { x(t), v(t), zeta, omega0 } with t in seconds.
   */
  function springSolver(cfg, x0, v0) {
    function def(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
    var m = def(cfg.mass, 1) > 0 ? def(cfg.mass, 1) : 1, k = def(cfg.stiffness, 100) > 0 ? def(cfg.stiffness, 100) : 100, c = Math.max(0, def(cfg.damping, 10));
    x0 = x0 === undefined ? 1 : x0; v0 = v0 || 0;
    var w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m));
    var x, v;
    if (zeta < 1 - 1e-9) {
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      var B = (v0 + zeta * w0 * x0) / wd;
      x = function (t) { return Math.exp(-zeta * w0 * t) * (x0 * Math.cos(wd * t) + B * Math.sin(wd * t)); };
      v = function (t) {
        var e = Math.exp(-zeta * w0 * t);
        return e * ((-zeta * w0) * (x0 * Math.cos(wd * t) + B * Math.sin(wd * t)) + (-x0 * wd * Math.sin(wd * t) + B * wd * Math.cos(wd * t)));
      };
    } else if (Math.abs(zeta - 1) <= 1e-9) {
      var C = v0 + w0 * x0;
      x = function (t) { return Math.exp(-w0 * t) * (x0 + C * t); };
      v = function (t) { return Math.exp(-w0 * t) * (C - w0 * (x0 + C * t)); };
    } else {
      // Over-damped. The textbook form e^(−ζω₀t)·(x₀·cosh(ωd·t) + B·sinh(ωd·t)) overflows to 0·∞ = NaN
      // for strongly damped springs (ζ ≳ 7); the algebraically identical sum of two decaying
      // exponentials is stable:  x(t) = ½·[(x₀ + B)·e^(r₁t) + (x₀ − B)·e^(r₂t)],  r₁,₂ = −ζω₀ ± ωd.
      var wd2 = w0 * Math.sqrt(zeta * zeta - 1);
      var B2 = (v0 + zeta * w0 * x0) / wd2;
      var r1 = -zeta * w0 + wd2, r2 = -zeta * w0 - wd2, A1 = (x0 + B2) / 2, A2 = (x0 - B2) / 2;
      x = function (t) { return A1 * Math.exp(r1 * t) + A2 * Math.exp(r2 * t); };
      v = function (t) { return A1 * r1 * Math.exp(r1 * t) + A2 * r2 * Math.exp(r2 * t); };
    }
    return { x: x, v: v, zeta: zeta, omega0: w0 };
  }

  var REST_CAP_S = 10;

  /**
   * First t (seconds) with |x(t)| < restDelta and |x'(t)| < restSpeed: 1 ms steps, refined by
   * bisection; hard cap 10 s.
   */
  function springRestTime(cfg, x0, v0) {
    var s = springSolver(cfg, x0, v0);
    var rd = cfg.restDelta > 0 ? cfg.restDelta : 0.001, rs = cfg.restSpeed > 0 ? cfg.restSpeed : 0.001;
    var at = function (t) { return Math.abs(s.x(t)) < rd && Math.abs(s.v(t)) < rs; };
    var t = 0, step = 0.001;
    while (t < REST_CAP_S && !at(t)) t += step;
    if (t >= REST_CAP_S) return REST_CAP_S;
    if (t === 0) return 0;
    var lo = t - step, hi = t;
    for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (at(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  /**
   * Normalised initial velocity x'(0) of a spring (fraction of the distance per second).
   * Easing.velocity is in px/s (§5.2): it is divided by the animated distance in px. Without a
   * distance (or distance ≤ 0) the velocity is taken as already normalised (fraction/s).
   * The displacement x decreases when the value moves towards the target, hence the minus sign.
   */
  function normalisedV0(cfg, distance) {
    var vel = typeof cfg.velocity === 'number' && isFinite(cfg.velocity) ? cfg.velocity : 0;
    var d = typeof distance === 'number' && isFinite(distance) && Math.abs(distance) > 0 ? Math.abs(distance) : 1;
    return -vel / d;
  }

  /** value(t) = target − x(t), normalised on [0,1]: returns progress p(t) = 1 − x(t) with x0 = 1. */
  function springProgress(cfg, distance) {
    var s = springSolver(cfg, 1, normalisedV0(cfg, distance));
    return function (tSeconds) { return 1 - s.x(tSeconds); };
  }

  /* ------------------------------------------------------------------ linear() */

  function fmt(n) { var r = Math.round(n * 10000) / 10000; return String(r); }

  /**
   * N = clamp(round(T / 8 ms), 24, 240) points (§5.2) of a progress function over [0, T]:
   * point i is at t = i / (N − 1) · T, the first one at 0 and the last one (forced to 1) at T.
   */
  function sampleLinear(progress, durationMs) {
    var N = Math.max(24, Math.min(240, Math.round(durationMs / 8)));
    var out = [];
    for (var i = 0; i < N; i++) {
      var v = progress(i / (N - 1) * durationMs / 1000);
      if (!isFinite(v)) throw new Error('non-finite easing sample at point ' + i);
      out.push(v);
    }
    out[N - 1] = 1;
    return out;
  }

  /**
   * Spring → { durationMs, samples, css: 'linear(…)' }
   * @param {Object} cfg       spring easing
   * @param {Object} [opts]    { distance: px } — the animated distance, to normalise velocity (px/s)
   */
  function springToLinear(cfg, opts) {
    var distance = opts && opts.distance;
    var T = springRestTime(cfg, 1, normalisedV0(cfg, distance));
    var durationMs = Math.max(1, Math.round(T * 1000));
    var samples = sampleLinear(springProgress(cfg, distance), durationMs);
    return { durationMs: durationMs, samples: samples, css: 'linear(' + samples.map(fmt).join(', ') + ')', restTime: T };
  }

  /**
   * Any easing → { css: timing-function, durationMs, warnings } (duration for springs = rest time).
   * @param {Object} [opts] { distance: px } for springs with a px/s velocity
   */
  function easingToCSS(easing, durationMs, opts) {
    if (!easing || easing.kind === 'linear') return { css: 'linear', durationMs: durationMs || 0, warnings: [] };
    if (easing.kind === 'bezier') { var b = cubicBezier(easing.p1x, easing.p1y, easing.p2x, easing.p2y); return { css: b.toCSS(), durationMs: durationMs || 0, warnings: b.warnings }; }
    if (easing.kind === 'spring') { var l = springToLinear(easing, opts); return { css: l.css, durationMs: l.durationMs, samples: l.samples, warnings: [] }; }
    throw new Error('unknown easing ' + easing.kind);
  }

  /** Progress function p(tSeconds) for any easing with a duration in ms (bezier/linear). */
  function progressFn(easing, durationMs, opts) {
    if (!easing || easing.kind === 'linear') return function (t) { return Math.max(0, Math.min(1, t * 1000 / durationMs)); };
    if (easing.kind === 'bezier') { var b = cubicBezier(easing.p1x, easing.p1y, easing.p2x, easing.p2y); return function (t) { return b(Math.max(0, Math.min(1, t * 1000 / durationMs))); }; }
    return springProgress(easing, opts && opts.distance);
  }

  /**
   * WAAPI fallback data for browsers without linear(): keyframes with the same samples.
   *   element.animate(data.keyframes(from, to), data.options)
   * `interpolate(from, to, p)` is supplied by the caller for each property.
   */
  function waapiFallback(easing, durationMs, props, opts) {
    var e = easingToCSS(easing, durationMs, opts);
    var samples = e.samples || sampleLinear(progressFn(easing, durationMs, opts), durationMs);
    var keyframes = samples.map(function (p, i) {
      var kf = { offset: i / (samples.length - 1) };
      Object.keys(props || {}).forEach(function (name) { var pr = props[name]; kf[name] = pr.interpolate(pr.from, pr.to, p); });
      return kf;
    });
    return { keyframes: keyframes, options: { duration: e.durationMs, easing: 'linear', fill: 'both' }, samples: samples };
  }

  /** Whether the engine should use linear(): CSS.supports when available (always true in Node). */
  function supportsLinear() {
    if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('transition-timing-function', 'linear(0, 1)');
    return true;
  }

  return {
    PRESETS: PRESETS, cubicBezier: cubicBezier, springSolver: springSolver, springRestTime: springRestTime, springProgress: springProgress, normalisedV0: normalisedV0,
    sampleLinear: sampleLinear, springToLinear: springToLinear, easingToCSS: easingToCSS, progressFn: progressFn, waapiFallback: waapiFallback, supportsLinear: supportsLinear,
    REST_CAP_S: REST_CAP_S
  };
});
