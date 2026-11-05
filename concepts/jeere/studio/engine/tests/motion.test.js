'use strict';
const DE = require('../index.js');
const Mo = DE.motion;

module.exports = function (t) {
  const { assert, near } = t;

  t.test('cubic-bezier: endpoints, linear identity, symmetry, CSS reference values', () => {
    const lin = Mo.cubicBezier(0, 0, 1, 1);
    for (let x = 0; x <= 1; x += 0.05) near(lin(x), x, 1e-6);
    const ease = Mo.cubicBezier(0.25, 0.1, 0.25, 1);
    assert.strictEqual(ease(0), 0); assert.strictEqual(ease(1), 1);
    near(ease(0.5), 0.8024033877399112, 1e-5, 'ease(0.5)');           // WebKit UnitBezier reference
    near(ease(0.25), 0.4085, 2e-4, 'ease(0.25)');
    const io = Mo.cubicBezier(0.42, 0, 0.58, 1);
    near(io(0.5), 0.5, 1e-6);
    for (let x = 0.05; x < 1; x += 0.05) near(io(x) + io(1 - x), 1, 1e-5, 'ease-in-out symmetric at ' + x);
    assert.strictEqual(Mo.cubicBezier(0.2, 0.8, 0.2, 1).toCSS(), 'cubic-bezier(0.2, 0.8, 0.2, 1)');
  });

  t.test('cubic-bezier: monotone for monotone curves and handles overshoot (p1y > 1)', () => {
    const f = Mo.cubicBezier(0.34, 1.56, 0.64, 1);
    let prev = -Infinity, max = 0;
    for (let x = 0; x <= 1.0001; x += 0.001) { const y = f(Math.min(1, x)); max = Math.max(max, y); prev = y; }
    assert.ok(max > 1.05, 'back-out overshoots');
    const g = Mo.cubicBezier(0.42, 0, 1, 1); prev = -1;
    for (let x = 0; x <= 1; x += 0.001) { const y = g(x); assert.ok(y >= prev - 1e-9); prev = y; }
  });

  /** check m x'' + c x' + k x ≈ 0 and v = x' numerically */
  function checkOde(cfg, x0, v0) {
    const s = Mo.springSolver(cfg, x0, v0), h = 1e-5;
    near(s.x(0), x0, 1e-12, 'x(0)'); near(s.v(0), v0, 1e-9, 'v(0)');
    for (const tt of [0.01, 0.05, 0.1, 0.3, 0.7, 1.5]) {
      const d1 = (s.x(tt + h) - s.x(tt - h)) / (2 * h), d2 = (s.x(tt + h) - 2 * s.x(tt) + s.x(tt - h)) / (h * h);
      near(d1, s.v(tt), 1e-4 * Math.max(1, Math.abs(d1)), 'v = dx/dt at ' + tt);
      const m = cfg.mass, k = cfg.stiffness, c = cfg.damping;
      near(m * d2 + c * d1 + k * s.x(tt), 0, 2e-2 * Math.max(1, k * Math.abs(s.x(tt))), 'ODE residual at ' + tt);
    }
    return s;
  }

  t.test('spring closed forms satisfy the ODE: under-damped, critical, over-damped, with v0', () => {
    const under = checkOde({ mass: 1, stiffness: 100, damping: 10 }, 1, 0);
    near(under.zeta, 0.5, 1e-12); near(under.omega0, 10, 1e-12);
    checkOde({ mass: 1, stiffness: 100, damping: 10 }, 1, -4);
    const crit = checkOde({ mass: 1, stiffness: 100, damping: 20 }, 1, 2);
    near(crit.zeta, 1, 1e-12);
    const over = checkOde({ mass: 2, stiffness: 50, damping: 40 }, 1, 3);
    assert.ok(over.zeta > 1);
  });

  t.test('spring is continuous across ζ = 1', () => {
    const a = Mo.springSolver({ mass: 1, stiffness: 100, damping: 20 - 1e-6 }, 1, 0);
    const b = Mo.springSolver({ mass: 1, stiffness: 100, damping: 20 }, 1, 0);
    const c = Mo.springSolver({ mass: 1, stiffness: 100, damping: 20 + 1e-6 }, 1, 0);
    for (const tt of [0.05, 0.2, 0.5]) { near(a.x(tt), b.x(tt), 1e-5); near(c.x(tt), b.x(tt), 1e-5); }
  });

  t.test('rest time: first t with |x| < restDelta and |v| < restSpeed (1 ms step + bisection)', () => {
    const cfg = { mass: 1, stiffness: 100, damping: 10 };
    const T = Mo.springRestTime(cfg, 1, 0), s = Mo.springSolver(cfg, 1, 0);
    const rest = tt => Math.abs(s.x(tt)) < 0.001 && Math.abs(s.v(tt)) < 0.001;
    assert.ok(rest(T), 'at rest at T');
    assert.ok(!rest(T - 0.0005), 'not at rest just before T');
    for (let tt = 0; tt < T - 0.001; tt += 0.001) assert.ok(!rest(tt), 'no earlier rest step at ' + tt);
    assert.ok(T > 1 && T < 2, 'Framer default spring rests in ~1.4 s, got ' + T);
    const loose = Mo.springRestTime(Object.assign({ restDelta: 0.01, restSpeed: 0.01 }, cfg), 1, 0);
    assert.ok(loose < T);
  });

  t.test('rest time is capped at 10 s (undamped spring)', () => {
    assert.strictEqual(Mo.REST_CAP_S, 10);
    assert.strictEqual(Mo.springRestTime({ mass: 1, stiffness: 100, damping: 0 }, 1, 0), 10);
  });

  t.test('linear(): N = clamp(round(T / 8 ms), 24, 240) and samples follow value(t)', () => {
    // N counts points (§5.2): point i sits at t = i / (N − 1) · T
    assert.strictEqual(Mo.sampleLinear(x => x, 100).length, 24);
    assert.strictEqual(Mo.sampleLinear(x => x, 1000).length, 125);
    assert.strictEqual(Mo.sampleLinear(x => x, 5000).length, 240);
    const cfg = { mass: 1, stiffness: 100, damping: 10 };
    const l = Mo.springToLinear(cfg);
    const N = Math.max(24, Math.min(240, Math.round(l.durationMs / 8)));
    assert.strictEqual(l.samples.length, N);
    assert.strictEqual(N, 180, 'default spring: T = 1438 ms → 180 points');
    assert.strictEqual(l.samples[0], 0); assert.strictEqual(l.samples[N - 1], 1);
    assert.ok(Math.max.apply(null, l.samples) > 1.1, 'under-damped spring overshoots (> 1 is legal in linear())');
    const p = Mo.springProgress(cfg);
    for (let i = 1; i < N - 1; i += 17) near(l.samples[i], p(i / (N - 1) * l.durationMs / 1000), 1e-12);
    assert.match(l.css, /^linear\(0, [0-9.]+, .*, 1\)$/);
    assert.ok(!/e-/.test(l.css), 'no exponent notation in CSS');
  });

  t.test('initial velocity (C¹ continuity): progress slope at 0 equals v0', () => {
    const p = Mo.springProgress({ mass: 1, stiffness: 100, damping: 10, velocity: 3 });
    near((p(1e-6) - p(0)) / 1e-6, 3, 1e-3);
    near(p(0), 0, 1e-12);
    // velocity is in px/s (§5.2): with the animated distance it is normalised (400 px/s over 200 px = 2 /s)
    const q = Mo.springProgress({ mass: 1, stiffness: 100, damping: 10, velocity: 400 }, 200);
    near((q(1e-6) - q(0)) / 1e-6, 2, 1e-3);
    const l1 = Mo.springToLinear({ mass: 1, stiffness: 100, damping: 10, velocity: 400 }, { distance: 200 });
    const l2 = Mo.springToLinear({ mass: 1, stiffness: 100, damping: 10, velocity: 2 });
    assert.strictEqual(l1.css, l2.css);
  });

  t.test('strongly over-damped springs stay finite (stable two-exponential form)', () => {
    for (const damping of [150, 200, 1000]) {
      const s = Mo.springSolver({ mass: 1, stiffness: 100, damping }, 1, 0);
      const zeta = s.zeta, w0 = s.omega0, wd = w0 * Math.sqrt(zeta * zeta - 1), B = zeta * w0 / wd;
      for (const t of [0, 0.01, 0.5, 3, 9.9]) {
        const ref = Math.exp(-zeta * w0 * t) * (Math.cosh(wd * t) + B * Math.sinh(wd * t));
        assert.ok(isFinite(s.x(t)) && isFinite(s.v(t)));
        if (isFinite(ref)) near(s.x(t), ref, 1e-9);
      }
      const l = Mo.springToLinear({ mass: 1, stiffness: 100, damping });
      assert.ok(!/NaN/.test(l.css) && l.samples.every(isFinite));
    }
  });

  t.test('cubic-bezier control values are sanitised (x in [0, 1], finite)', () => {
    const b = Mo.cubicBezier(1.5, 0, 0.5, 1);
    assert.strictEqual(b.toCSS(), 'cubic-bezier(1, 0, 0.5, 1)'); assert.strictEqual(b.warnings.length, 1);
    const c = Mo.cubicBezier(0.5, NaN, 0.5, 1);
    assert.strictEqual(c.toCSS(), 'cubic-bezier(0.5, 0, 0.5, 1)'); assert.ok(isFinite(c(0.3)));
    assert.strictEqual(Mo.easingToCSS({ kind: 'bezier', p1x: -1, p1y: 0, p2x: 1, p2y: 1 }, 100).warnings.length, 1);
  });

  t.test('easingToCSS + WAAPI fallback keyframes', () => {
    assert.deepStrictEqual(Mo.easingToCSS({ kind: 'linear' }, 200), { css: 'linear', durationMs: 200, warnings: [] });
    assert.strictEqual(Mo.easingToCSS({ kind: 'bezier', p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 }, 300).css, 'cubic-bezier(0.42, 0, 0.58, 1)');
    const sp = Mo.easingToCSS({ kind: 'spring', mass: 1, stiffness: 100, damping: 10 });
    assert.ok(sp.css.startsWith('linear(') && sp.durationMs > 1000);
    const fb = Mo.waapiFallback({ kind: 'spring', mass: 1, stiffness: 100, damping: 10 }, undefined, { opacity: { from: 0, to: 1, interpolate: (a, b, q) => a + (b - a) * q } });
    assert.strictEqual(fb.keyframes.length, sp.samples.length);
    assert.strictEqual(fb.keyframes[0].offset, 0); assert.strictEqual(fb.keyframes[fb.keyframes.length - 1].offset, 1);
    assert.strictEqual(fb.keyframes[fb.keyframes.length - 1].opacity, 1);
    assert.deepStrictEqual(fb.options, { duration: sp.durationMs, easing: 'linear', fill: 'both' });
    assert.throws(() => Mo.easingToCSS({ kind: 'wobble' }));
  });
};
