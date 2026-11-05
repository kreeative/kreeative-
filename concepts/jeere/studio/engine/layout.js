/* DualEngine — layout.js
 * Deterministic layout solver (§2): absolute mode with constraints (§2.5), Flexbox (CSS Flexible
 * Box Level 1 §9: single line + wrap, gap / 'auto' = space-between, negative spacing as margins,
 * padding, justify / align incl. baseline (with synthesized baselines), flex-basis 0% for fill,
 * min/max, grow factors < 1, hug = fit-content, min-width: 0, border-box floor), Grid (track
 * sizing subset: px / fr / auto / minmax, gaps, spans, implicit tracks, CSS auto-placement order,
 * justify/align-self), absolute children in stacks (§2.4), text resize modes (§2.7), rotation
 * bbox (§1.4), aspect-ratio lock on leaves (§3.1).
 *
 * Blink fidelity: every specified length (fixed sizes, padding, gaps, borders, min/max, px tracks,
 * left/top offsets) is quantised like Blink's LayoutUnit — the exported value (≤ 2 decimals,
 * §3.7) truncated to 1/64 px and clamped to ±33 554 431 px — so that sums of fractional lengths
 * agree with the browser to the bit (opts.layoutUnit = false disables it).
 *
 * Incremental layout (§2.3): per-node caches (layout entries, intrinsic widths, measured text,
 * resolved nodes) are invalidated for the touched node and its ancestors only. A cache entry
 * records the writes of its own call (child boxes, text, nested entries); results persist per
 * breakpoint and an entry that already owns its subtree in the persisted maps is not replayed, so
 * an untouched sibling costs one map lookup. World boxes / matrices are recomputed only for the
 * subtrees whose box (or transform) changed. Paint-only patches (fills, effects, opacity, name…)
 * do not touch the layout at all. The cache key of a container includes the reference (wider
 * breakpoint) sizes its constraints read (§2.5), so incremental == full layout.
 *
 * Output per breakpoint: boxes (Map nodeId → {x,y,w,h} in parent border-box coords, unrotated),
 * world (Map nodeId → axis-aligned bbox in page coords, rotation applied — what
 * getBoundingClientRect returns), matrices (2D affine [a,b,c,d,e,f]), text (measured text).
 * A breakpoint's result object is persistent: it is updated in place by later layouts.
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js'), resolve: require('./resolve.js'), text: require('./text.js') } : global.DualEngine;
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).layout = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model, R = DE.resolve, T = DE.text;
  var INF = Infinity;

  /** CSS order: max-* is applied first, then min-* wins (CSS 2.1 §10.4). */
  function clamp(v, lo, hi) { if (hi !== undefined && hi !== null && v > hi) v = hi; if (lo !== undefined && lo !== null && v < lo) v = lo; return v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /* ------------------------------------------------------------------ Blink LayoutUnit */

  var LU_MAX = 33554431.984375; // (2³¹ − 1) / 64
  /** A specified length as Blink uses it: exported value (2 decimals) truncated to 1/64 px. */
  function luSnap(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    var r = Math.round(v * 100) / 100;
    var t = Math.trunc(Math.round(r * 6400) / 100) / 64; // r·64, guarded against 0.29·64 = 18.559999…
    if (t > LU_MAX) t = LU_MAX; else if (t < -LU_MAX) t = -LU_MAX;
    return t === 0 ? 0 : t;
  }
  function luClamp(v) { return v > LU_MAX ? LU_MAX : v < -LU_MAX ? -LU_MAX : v; }

  /* ------------------------------------------------------------------ matrices */

  function mul(m, n) { // m · n, both [a,b,c,d,e,f] (x' = a x + c y + e ; y' = b x + d y + f)
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function translate(x, y) { return [1, 0, 0, 1, x, y]; }
  function apply(m, x, y) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; }
  /** rotate(θ) scaleX(sx) scaleY(sy) about the box centre (§3.1 order), in the box's own coords. */
  function localTransform(w, h, rotation, flipH, flipV) {
    if (!rotation && !flipH && !flipV) return [1, 0, 0, 1, 0, 0];
    var cx = w / 2, cy = h / 2, t = (rotation || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    var rot = [c, s, -s, c, 0, 0], sc = [flipH ? -1 : 1, 0, 0, flipV ? -1 : 1, 0, 0];
    return mul(translate(cx, cy), mul(rot, mul(sc, translate(-cx, -cy))));
  }
  function bboxOf(m, w, h) {
    if (m[1] === 0 && m[2] === 0) { // axis-aligned (no rotation / skew)
      var xa = m[4], xb = m[4] + m[0] * w, ya = m[5], yb = m[5] + m[3] * h;
      return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
    }
    var pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
    var x0 = INF, y0 = INF, x1 = -INF, y1 = -INF;
    for (var i = 0; i < 4; i++) { var p = pts[i]; if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function sameBox(a, b) { return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h; }
  function sameMatrix(a, b) { if (!a || !b) return false; for (var i = 0; i < 6; i++) if (a[i] !== b[i]) return false; return true; }

  /* ------------------------------------------------------------------ recording contexts */

  /**
   * Write recorder of one layoutNode call. items: flat triples (kind, id, value) with kind
   * 0 = child box, 1 = measured text, 2 = nested entry (its own records are applied recursively).
   * Only the last nested entry of a node is kept (a later call overrides an earlier one, exactly
   * like the writes it stands for).
   */
  function Rec() { this.items = []; this.local = null; this.subAt = null; }
  Rec.prototype.box = function (id, b) { this.items.push(0, id, b); (this.local || (this.local = new Map())).set(id, b); };
  Rec.prototype.getBox = function (id) { return this.local ? this.local.get(id) : undefined; };
  Rec.prototype.text = function (id, tm) { this.items.push(1, id, tm); };
  Rec.prototype.sub = function (entry) {
    var at = this.subAt || (this.subAt = new Map());
    var prev = at.get(entry.id);
    if (prev !== undefined) this.items[prev + 2] = null;
    at.set(entry.id, this.items.length);
    this.items.push(2, entry.id, entry);
  };
  /** context of a nested call whose writes belong to the caller (final layout of a child) */
  function ctxOf(parent, cbW, cbH) { return { rec: parent.rec, result: parent.result, cbW: cbW, cbH: cbH }; }
  /** context of a measuring call: its writes are discarded (its entry stays cached) */
  function scratchOf(parent, cbW, cbH) { return { rec: new Rec(), result: parent.result, cbW: cbW, cbH: cbH }; }

  /* ------------------------------------------------------------------ helpers on resolved nodes */

  function isRow(lp) { return lp.direction === 'horizontal'; }
  /** Effective sizing modes of a node (text resize modes map onto hug/fixed/fill). */
  function modes(rn) {
    var lc = rn.layoutChild || {};
    var wm = lc.widthMode || 'fixed', hm = lc.heightMode || 'fixed';
    if (rn.type === 'text') {
      if (rn.resize === 'autoWidth') { wm = 'hug'; hm = 'hug'; }
      else if (rn.resize === 'autoHeight') { wm = wm === 'fill' ? 'fill' : 'fixed'; hm = 'hug'; }
      else { wm = wm === 'fill' ? 'fill' : 'fixed'; hm = hm === 'fill' ? 'fill' : 'fixed'; }
    } else if (rn.type === 'rect' || rn.type === 'ellipse' || rn.type === 'line' || rn.type === 'vector') {
      if (wm === 'hug') wm = 'fixed'; if (hm === 'hug') hm = 'fixed';
    }
    return { w: wm, h: hm };
  }
  /** Leaves whose aspect ratio is locked derive the non-fill axis from the fill one (§3.1). */
  function aspectAxis(rn) {
    if (!rn.aspectLocked || rn.children || rn.type === 'text' || rn.type === 'line') return null;
    var g = rn.geometry, m = modes(rn);
    if (!(g.w > 0 && g.h > 0)) return null;
    if (m.w === 'fill' && m.h === 'fixed') return 'h';
    if (m.h === 'fill' && m.w === 'fixed') return 'w';
    return null;
  }

  /* ------------------------------------------------------------------ engine */

  /**
   * @param {Object} doc
   * @param {Object} [opts]
   * @param {Object} [opts.measurer]  text measurer (text.js); default: table measurer
   * @param {{width:number,height:number}} [opts.viewport]  default: breakpoint width × 900
   * @param {'flow'|'canvas'} [opts.rootPlacement]  'flow' (export: roots stacked at x=0) or 'canvas' (geometry.x/y)
   * @param {string} [opts.state]
   * @param {boolean} [opts.layoutUnit]  quantise specified lengths like Blink (default true)
   */
  function LayoutEngine(doc, opts) {
    this.doc = doc;
    opts = opts || {};
    this.measurer = opts.measurer || T.createTableMeasurer();
    this.viewport = opts.viewport || null;
    this.rootPlacement = opts.rootPlacement || 'flow';
    this.state = opts.state || undefined;
    this.snap = opts.layoutUnit === false ? function (v) { return v; } : luSnap;
    /* per-node caches, one slot per node id:
     *   layout [entry]  layout calls (breakpoint, forced, available, containing block, reference sizes)
     *   iw     Map      intrinsic widths            text  Map  measured text
     *   res    Map      resolved views              flow  Map  resolved flow children
     *   inv    boolean  the subtree lays out the same at every breakpoint (no override, no vw/vh,
     *                   no constraint reading a reference size): its entries are shared by all */
    this.slots = new Map();
    this.results = new Map();    // bp|page → LayoutResult (persistent)
    this.stats = { layouts: 0, cacheHits: 0, replays: 0, worldUpdates: 0 };
  }

  /* ---- invalidation */

  /**
   * Invalidate a node: its layout depends on itself and its subtree, and its ancestors' layouts
   * depend on it. `kind`: 'layout' (default), 'paint' (resolved values only), 'structure'
   * (children / visibility changed: persisted results are rebuilt).
   */
  LayoutEngine.prototype.slot = function (id) {
    var s = this.slots.get(id);
    if (!s) { s = { layout: null, iw: null, text: null, res: null, flow: null, inv: undefined }; this.slots.set(id, s); }
    return s;
  };
  LayoutEngine.prototype.invalidate = function (nodeId, kind) {
    kind = kind || 'layout';
    var self = this, nn = this.doc.nodes[nodeId], sl = this.slots.get(nodeId);
    if (sl) { sl.res = null; sl.flow = null; }
    if (nn && nn.parent && this.slots.get(nn.parent)) this.slots.get(nn.parent).flow = null; // its list holds this node's resolved view
    if (kind === 'paint') return;
    this.results.forEach(function (r) { r.worldDirty.add(nodeId); });
    if (sl) { sl.layout = null; sl.iw = null; sl.text = null; sl.inv = undefined; }
    if (nn) model.ancestors(this.doc, nodeId).forEach(function (a) { var as = self.slots.get(a.id); if (as) { as.layout = null; as.iw = null; as.inv = undefined; } });
    this.results.forEach(function (r) { r.stale = true; if (kind === 'structure') r.rebuild = true; });
  };

  /** True when the node's subtree lays out identically at every breakpoint (see slots). */
  LayoutEngine.prototype.invariant = function (node) {
    var sl = this.slot(node.id);
    if (sl.inv !== undefined) return sl.inv;
    var inv = !hasOverrides(node) && !(node.states && this.state);
    var lc = node.layoutChild || {};
    if (inv && (lc.widthUnit === 'vw' || lc.heightUnit === 'vh' || lc.position === 'absolute')) inv = false;
    if (inv && node.children && node.layoutParent && node.layoutParent.mode === 'absolute' && node.children.length) inv = false;
    if (inv && node.children) for (var i = 0; i < node.children.length; i++) { var c = this.doc.nodes[node.children[i]]; if (c && !this.invariant(c)) { inv = false; break; } }
    sl.inv = inv;
    return inv;
  };

  /* Paths under /nodes/<id>/ that never change a box (§2.3: skip layout for paint-only patches). */
  var PAINT_ONLY = { name: 1, locked: 1, opacity: 1, blendMode: 1, isolate: 1, fills: 1, effects: 1, corners: 1, semantic: 1, meta: 1, animation: 1, aspectLockedHint: 1 };
  var STRUCTURAL = { children: 1, visible: 1, parent: 1 };

  /** Invalidate from a JSON patch (path /nodes/<id>/…). */
  LayoutEngine.prototype.invalidateFromPatch = function (patch) {
    var self = this;
    function one(path, op) {
      var m = /^\/nodes\/([^/]+)(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?/.exec(path || '');
      if (!m) { self.invalidateAll(); return; }
      var id = m[1].replace(/~1/g, '/').replace(/~0/g, '~'), prop = m[2];
      if (!prop) {
        // the whole node was added / removed / replaced: its parent's children changed too
        var n = self.doc.nodes[id];
        self.invalidate(id, 'structure');
        if (n && n.parent) self.invalidate(n.parent, 'structure');
        if (op === 'remove' || op === 'move' || op === 'replace') self.invalidateAll();
        return;
      }
      if (prop === 'overrides') {
        var p2 = m[4]; // /overrides/<bp>/<prop>
        if (p2 === 'states' && !self.state) { self.invalidate(id, 'paint'); return; }
        if (p2 && PAINT_ONLY[p2]) { self.invalidate(id, 'paint'); return; }
        self.invalidate(id, p2 === 'visible' || !p2 ? 'structure' : 'layout');
        return;
      }
      if (prop === 'states') { self.invalidate(id, self.state ? 'layout' : 'paint'); return; }
      if (PAINT_ONLY[prop]) { self.invalidate(id, 'paint'); return; }
      if (prop === 'style' && m[3] === 'fills') { self.invalidate(id, 'paint'); return; }
      self.invalidate(id, STRUCTURAL[prop] ? 'structure' : 'layout');
    }
    one(patch.path, patch.op);
    if (patch.from) one(patch.from, 'move');
  };
  LayoutEngine.prototype.invalidateAll = function () {
    this.slots.clear(); this.results.clear();
  };

  /* ---- resolved node view for a breakpoint */

  function hasOverrides(node) { var ov = node.overrides; if (ov) for (var k in ov) if (ov[k] && k !== 'base') return true; return false; }
  LayoutEngine.prototype.resolved = function (node, bp) {
    var sl = this.slot(node.id), m = sl.res;
    if (!m) { m = sl.res = new Map(); }
    // a node without overrides resolves identically at every breakpoint: one object for all
    var key = this.state ? bp + '|' + this.state : (hasOverrides(node) ? bp : '*');
    var hit = m.get(key);
    if (hit) return hit;
    var rn = R.resolveNode(this.doc, node, bp, this.state);
    m.set(key, rn);
    return rn;
  };

  /* ---- specified lengths (LayoutUnit-quantised) */

  LayoutEngine.prototype.pad = function (lp) {
    var p = (lp && lp.padding) || {}, s = this.snap;
    return { top: s(num(p.top, 0)), right: s(num(p.right, 0)), bottom: s(num(p.bottom, 0)), left: s(num(p.left, 0)) };
  };
  /** padding + real borders (strokes rendered as CSS borders, §3.4); memoised per resolved node */
  var insetMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  LayoutEngine.prototype.insets = function (rn) {
    var memo = insetMemo && insetMemo.get(rn);
    if (memo && memo.snap === this.snap) return memo.v;
    var v = this.insetsOf(rn);
    if (insetMemo) insetMemo.set(rn, { snap: this.snap, v: v });
    return v;
  };
  LayoutEngine.prototype.insetsOf = function (rn) {
    var p = rn.layoutParent ? this.pad(rn.layoutParent) : { top: 0, right: 0, bottom: 0, left: 0 };
    var b0 = model.borderInsets(rn.strokes), s = this.snap;
    var b = { top: s(b0.top), right: s(b0.right), bottom: s(b0.bottom), left: s(b0.left) };
    return { top: p.top + b.top, right: p.right + b.right, bottom: p.bottom + b.bottom, left: p.left + b.left, border: b };
  };
  /** Stack gaps: negative spacing becomes margins (CSS has no negative gap), negative rowGap → 0. */
  LayoutEngine.prototype.stackGaps = function (lp) {
    var auto = lp.gap === 'auto', g = auto ? 0 : this.snap(num(lp.gap, 0));
    var rg = lp.wrap ? this.snap(num(lp.rowGap, g < 0 ? 0 : g)) : 0;
    return { auto: auto, gap: Math.max(0, g), margin: Math.min(0, g), rowGap: Math.max(0, rg) };
  };

  /**
   * Fixed size along an axis: px (quantised), vw / vh (viewport), % of the containing block.
   * A percentage against an indefinite containing block is cyclic: it behaves as auto (NaN).
   */
  LayoutEngine.prototype.fixedSize = function (rn, axis, containerSize) {
    var g = rn.geometry, lc = rn.layoutChild || {};
    var v = axis === 'w' ? g.w : g.h, unit = axis === 'w' ? lc.widthUnit : lc.heightUnit;
    var q = this.snap === luSnap ? function (x) { return luClamp(Math.trunc(x * 64) / 64); } : function (x) { return x; };
    var v2 = Math.round(v * 100) / 100; // exported with ≤ 2 decimals (§3.7)
    if (unit === 'vw') return q(this.viewport.width * v2 / 100);
    if (unit === 'vh') return q(this.viewport.height * v2 / 100);
    if (unit === '%') return typeof containerSize === 'number' && isFinite(containerSize) ? q(containerSize * v2 / 100) : NaN;
    return this.snap(v);
  };
  /** min / max of an axis, the min floored at padding + border (border-box sizing). */
  LayoutEngine.prototype.minMax = function (rn, axis) {
    var lc = rn.layoutChild || {}, s = this.snap;
    var mn = axis === 'w' ? lc.minW : lc.minH, mx = axis === 'w' ? lc.maxW : lc.maxH;
    mn = typeof mn === 'number' ? s(mn) : undefined; mx = typeof mx === 'number' ? s(mx) : undefined;
    var ins = this.insets(rn), floor = axis === 'w' ? ins.left + ins.right : ins.top + ins.bottom;
    if (floor > 0) mn = mn === undefined ? floor : Math.max(mn, floor);
    return { min: mn, max: mx };
  };
  LayoutEngine.prototype.clampAxis = function (rn, axis, v) { var mm = this.minMax(rn, axis); return clamp(v, mm.min, mm.max); };

  /* ---- text */

  var sigMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  LayoutEngine.prototype.measureTextNode = function (rn, availW, bp) {
    var mode = rn.resize || 'autoWidth';
    var w = mode === 'autoWidth' ? INF : Math.max(0, availW);
    var sl = this.slot(rn.id), m = sl.text;
    if (!m) { m = sl.text = new Map(); }
    var key = (this.state || hasOverrides(this.doc.nodes[rn.id] || rn) ? bp + '|' + (this.state || '') + '|' : '') + mode + '|' + w;
    var hit = m.get(key);
    if (hit) return hit;
    // content signature, kept with this node's cache (dropped on invalidation)
    var sg = sigMemo ? sigMemo.get(rn) : undefined;   // rn objects are replaced on invalidation
    if (sg === undefined) { sg = JSON.stringify([rn.text, rn.style]); if (sigMemo) sigMemo.set(rn, sg); }
    var res = this.measurer.measureText(rn.text, rn.style, w, { mode: mode, truncateLines: rn.truncate && rn.truncate.lines, height: rn.geometry.h, contentKey: sg });
    m.set(key, res);
    return res;
  };

  /* ---- intrinsic widths (min-content / max-content contributions), cached per node */

  LayoutEngine.prototype.intrinsicWidth = function (rn, bp, which) {
    var sl = this.slot(rn.id), m = sl.iw;
    var key = (this.invariant(this.doc.nodes[rn.id] || rn) ? '*' : bp + '|' + (this.state || '')) + '|' + which;
    if (m) { var hit = m.get(key); if (hit !== undefined) return hit; }
    else { m = sl.iw = new Map(); }
    var v = this.intrinsicWidthUncached(rn, bp, which);
    m.set(key, v);
    return v;
  };
  LayoutEngine.prototype.intrinsicWidthUncached = function (rn, bp, which) {
    var md = modes(rn), self = this;
    if (md.w === 'fixed') { var f = this.fixedSize(rn, 'w', undefined); if (!isNaN(f)) return this.clampAxis(rn, 'w', f); }
    if (md.w === 'fill') return 0;
    if (rn.type === 'text') return this.clampAxis(rn, 'w', this.measureTextNode(rn, INF, bp).maxContentWidth);
    if (rn.type === 'image') { var a = this.doc.assets[rn.asset]; return this.clampAxis(rn, 'w', a && a.width ? a.width : (md.w === 'hug' ? this.snap(rn.geometry.w) : 0)); }
    var ins = this.insets(rn);
    if (!rn.children) return this.clampAxis(rn, 'w', md.w === 'fixed' ? ins.left + ins.right : this.snap(rn.geometry.w)); // cyclic % on a leaf: auto = empty
    var lp = rn.layoutParent, kids = this.flowChildren(rn, bp);
    var v = 0;
    if (lp.mode === 'stack' && isRow(lp)) {
      var gp = this.stackGaps(lp), step = gp.gap + gp.margin;
      if (which === 'min' && lp.wrap) kids.forEach(function (k, i) { v = Math.max(v, self.intrinsicWidth(k, bp, which) + (i ? gp.margin : 0)); });
      else kids.forEach(function (k, i) { v += self.intrinsicWidth(k, bp, which) + (i ? step : 0); });
    } else if (lp.mode === 'grid') {
      var cols = (lp.columns && lp.columns.length ? lp.columns : [{ kind: 'fr', value: 1 }]).slice(), cg = Math.max(0, this.snap(num(lp.columnGap, num(lp.gap, 0))));
      kids.forEach(function (k) { var ga = k.layoutChild.gridArea; var end = ga ? (ga.col ? ga.col - 1 : 0) + (ga.colSpan || 1) : 1; while (cols.length < end) cols.push({ kind: 'auto' }); });
      var colW = cols.map(function (t) { return t.kind === 'px' ? self.snap(t.value) : 0; });
      var cursor = 0;
      kids.forEach(function (k) {
        var ga = k.layoutChild.gridArea, span = (ga && ga.colSpan) || 1, ci;
        if (ga && ga.col) ci = ga.col - 1; else { if (cursor + span > cols.length) cursor = 0; ci = cursor; cursor += span; }
        if (span <= 1 && ci < cols.length && cols[ci].kind !== 'px') colW[ci] = Math.max(colW[ci], self.intrinsicWidth(k, bp, which));
      });
      v = colW.reduce(function (a, b) { return a + b; }, 0) + Math.max(0, cols.length - 1) * cg;
    } else if (lp.mode === 'absolute') {
      kids.forEach(function (k) { v = Math.max(v, self.snap(k.geometry.x) + self.intrinsicWidth(k, bp, which)); });
    } else {
      kids.forEach(function (k) { v = Math.max(v, self.intrinsicWidth(k, bp, which)); });
    }
    return this.clampAxis(rn, 'w', v + ins.left + ins.right);
  };

  LayoutEngine.prototype.flowChildren = function (rn, bp) {
    var sl = this.slot(rn.id), fm = sl.flow, fk = bp + '|' + (this.state || '');
    if (fm) { var fh = fm.get(fk); if (fh) return fh; } else { fm = sl.flow = new Map(); }
    var r = this.flowChildrenUncached(rn, bp);
    fm.set(fk, r);
    return r;
  };
  LayoutEngine.prototype.flowChildrenUncached = function (rn, bp) {
    var doc = this.doc, self = this, out = [];
    var ch = rn.children || [];
    for (var i = 0; i < ch.length; i++) {
      var c = doc.nodes[ch[i]]; if (!c) continue;
      var rc = self.resolved(c, bp);
      if (rc.visible === false) continue;
      if (rn.layoutParent.mode !== 'absolute' && rc.layoutChild.position === 'absolute') continue;
      out.push(rc);
    }
    if (rn.layoutParent.mode === 'absolute') return out;
    var ordered = false;
    for (var j = 0; j < out.length; j++) if (out[j].layoutChild.order) { ordered = true; break; }
    if (!ordered) return out;
    return out.map(function (c, i) { return { c: c, i: i, o: num(c.layoutChild.order, 0) }; }).sort(function (a, b) { return a.o - b.o || a.i - b.i; }).map(function (x) { return x.c; });
  };
  LayoutEngine.prototype.absoluteChildren = function (rn, bp) {
    var doc = this.doc, out = [];
    if (rn.layoutParent.mode === 'absolute') return out;
    var ch = rn.children || [];
    for (var i = 0; i < ch.length; i++) {
      var c = doc.nodes[ch[i]]; if (!c) continue;
      var rc = this.resolved(c, bp);
      if (rc.visible !== false && rc.layoutChild.position === 'absolute') out.push(rc);
    }
    return out;
  };

  /* ------------------------------------------------------------------ core: size a node (and lay out its children) */

  /** Reference sizes (wider breakpoints) a container's constrained children may read (§2.5). */
  function refKey(rn, ctx) {
    var ref = ctx.result && ctx.result.reference; if (!ref) return '';
    var s = '';
    for (var b in ref) { var r = ref[b], box = r && r.boxes.get(rn.id); s += '|' + b + ':' + (box ? box.w + 'x' + box.h : '-'); }
    return s;
  }

  /**
   * @param {Object} rn        resolved node
   * @param {{w?:number,h?:number}} forced   definite sizes imposed by the parent
   * @param {{w:number,h:number}} avail      available space (Infinity allowed)
   * @param {string} bp
   * @param {Object} ctx       { rec, result, cbW, cbH (containing block for % / constraints) }
   * @returns {{w:number,h:number,baseline:number}}
   */
  LayoutEngine.prototype.layoutNode = function (rn, forced, avail, bp, ctx) {
    // cache: per node, a short list of entries compared field by field (no key string)
    var fw = forced.w, fh = forced.h, aw = avail.w, ah = avail.h, cw = ctx.cbW, chh = ctx.cbH;
    var sl = this.slot(rn.id), inv = this.invariant(this.doc.nodes[rn.id] || rn);
    var ebp = inv ? '*' : bp;
    var ref = !inv && rn.children && rn.layoutParent && bp !== 'base' ? refKey(rn, ctx) : '';
    var c = sl.layout, hit = null;
    if (c) for (var i = 0; i < c.length; i++) {
      var e = c[i];
      if (e.bp === ebp && e.fw === fw && e.fh === fh && e.aw === aw && e.ah === ah && e.cw === cw && e.ch === chh && e.ref === ref) { hit = e; break; }
    }
    if (hit) { this.stats.cacheHits++; ctx.rec.sub(hit); return hit.res; }
    this.stats.layouts++;
    var ctx2 = { rec: new Rec(), result: ctx.result, cbW: ctx.cbW, cbH: ctx.cbH };
    var res;
    if (rn.children && rn.layoutParent) {
      if (rn.layoutParent.mode === 'stack') res = this.layoutStack(rn, forced, avail, bp, ctx2);
      else if (rn.layoutParent.mode === 'grid') res = this.layoutGrid(rn, forced, avail, bp, ctx2);
      else res = this.layoutAbsolute(rn, forced, avail, bp, ctx2);
      this.placeAbsoluteChildren(rn, res, bp, ctx2);
    } else res = this.layoutLeaf(rn, forced, avail, bp, ctx2);
    var entry = { id: rn.id, res: res, items: ctx2.rec.items, bp: ebp, fw: fw, fh: fh, aw: aw, ah: ah, cw: cw, ch: chh, ref: ref };
    if (!c) { c = sl.layout = []; }
    if (c.length >= 24) c.shift();
    c.push(entry);
    ctx.rec.sub(entry);
    return res;
  };

  LayoutEngine.prototype.layoutLeaf = function (rn, forced, avail, bp, ctx) {
    var m = modes(rn), w, h, baseline = null;
    if (rn.type === 'text') {
      if (forced.w !== undefined) w = forced.w;
      else if (m.w === 'fixed') { w = this.fixedSize(rn, 'w', ctx.cbW); if (isNaN(w)) w = this.measureTextNode(rn, INF, bp).maxContentWidth; }
      else if (m.w === 'fill') w = isFinite(avail.w) ? avail.w : 0;
      else w = this.measureTextNode(rn, INF, bp).maxContentWidth;   // autoWidth: max-content, white-space: pre
      w = this.clampAxis(rn, 'w', w);
      var tm = this.measureTextNode(rn, w, bp);
      if (forced.h !== undefined) h = forced.h;
      else if (m.h === 'fixed') { h = this.fixedSize(rn, 'h', ctx.cbH); if (isNaN(h)) h = tm.height; }
      else if (m.h === 'fill') h = isFinite(avail.h) ? avail.h : tm.height;
      else h = tm.height;
      h = this.clampAxis(rn, 'h', h);
      // vertical alignment inside a fixed box shifts the baseline
      var off = 0;
      if (rn.resize === 'fixed' && rn.style.verticalAlign === 'middle') off = (h - tm.contentHeight) / 2;
      else if (rn.resize === 'fixed' && rn.style.verticalAlign === 'bottom') off = h - tm.contentHeight;
      baseline = tm.firstBaseline + off;
      ctx.rec.text(rn.id, tm);
    } else {
      var asset = rn.type === 'image' && this.doc.assets[rn.asset];
      var iw = asset && asset.width, ih = asset && asset.height;
      var ar = aspectAxis(rn), g = rn.geometry;
      if (forced.w !== undefined) w = forced.w;
      else if (m.w === 'fill') w = isFinite(avail.w) ? avail.w : (iw || 0);
      else if (m.w === 'hug' && iw) w = iw;
      else { w = this.fixedSize(rn, 'w', ctx.cbW); if (isNaN(w)) w = 0; }
      if (forced.h !== undefined) h = forced.h;
      else if (m.h === 'fill') h = isFinite(avail.h) ? avail.h : (ih ? (iw ? ih * (w / iw) : ih) : 0);
      else if (m.h === 'hug' && ih) h = iw ? ih * (w / iw) : ih;
      else if (ar === 'h') h = w * g.h / g.w;           // aspect-ratio: w / h, height auto
      else { h = this.fixedSize(rn, 'h', ctx.cbH); if (isNaN(h)) h = 0; }
      if (ar === 'w' && forced.w === undefined) w = h * g.w / g.h;
      w = this.clampAxis(rn, 'w', w);
      h = this.clampAxis(rn, 'h', h);
    }
    return { w: w, h: h, baseline: baseline };
  };

  /* ---- absolute-mode frame: size from modes, children by constraints */

  LayoutEngine.prototype.layoutAbsolute = function (rn, forced, avail, bp, ctx) {
    var m = modes(rn), ins = this.insets(rn), self = this, w, h;
    var kids = this.flowChildren(rn, bp);
    if (forced.w !== undefined) w = forced.w;
    else if (m.w === 'fixed' && !isNaN(this.fixedSize(rn, 'w', ctx.cbW))) w = this.fixedSize(rn, 'w', ctx.cbW);
    else if (m.w === 'fill' && isFinite(avail.w)) w = avail.w;
    else { // hug (or fill in an indefinite context): bounding extent of children at their stored geometry
      var maxX = 0;
      kids.forEach(function (k) { maxX = Math.max(maxX, self.snap(k.geometry.x) + self.intrinsicWidth(k, bp, 'max')); });
      w = maxX + ins.left + ins.right;
    }
    w = this.clampAxis(rn, 'w', w);
    if (forced.h !== undefined) h = forced.h;
    else if (m.h === 'fixed' && !isNaN(this.fixedSize(rn, 'h', ctx.cbH))) h = this.fixedSize(rn, 'h', ctx.cbH);
    else if (m.h === 'fill' && isFinite(avail.h)) h = avail.h;
    else {
      var maxY = 0;
      kids.forEach(function (k) {
        var r = self.layoutNode(k, {}, { w: INF, h: INF }, bp, scratchOf(ctx, undefined, undefined));
        maxY = Math.max(maxY, self.snap(k.geometry.y) + r.h);
      });
      h = maxY + ins.top + ins.bottom;
    }
    h = this.clampAxis(rn, 'h', h);
    var res = { w: w, h: h, baseline: null };
    this.placeByConstraints(rn, kids, res, bp, ctx);
    return res;
  };

  /** Reference (definition-breakpoint) border-box size of a container, for constraints (§2.5). */
  LayoutEngine.prototype.referenceSize = function (rn, child, bp, ctx) {
    var defBp = R.definingBreakpoint(this.doc, this.doc.nodes[child.id], 'geometry', bp);
    if (defBp === bp) return null; // current layout is the definition: W0 = W
    var ref = ctx.result && ctx.result.reference && ctx.result.reference[defBp];
    if (!ref || !ref.boxes.get(rn.id)) return null;
    var b = ref.boxes.get(rn.id);
    return { w: b.w, h: b.h };
  };

  LayoutEngine.prototype.placeByConstraints = function (rn, kids, res, bp, ctx) {
    var ins = this.insets(rn), self = this, s = this.snap;
    var bl = ins.border.left, bt = ins.border.top, bx = bl + ins.border.right, by = bt + ins.border.bottom;
    var W = res.w - bx, H = res.h - by; // padding box
    kids.forEach(function (k) {
      // reference = the parent's border box at the defining breakpoint (or now), minus its borders
      var ref = self.referenceSize(rn, k, bp, ctx) || { w: res.w, h: res.h };
      var W0 = ref.w - bx, H0 = ref.h - by;
      var cons = (k.layoutChild.constraints) || { h: 'left', v: 'top' };
      var g = k.geometry, m = modes(k);
      // stored x,y are relative to the parent's border box; constraints resolve in the padding box (§2.4)
      var gx = s(g.x - bl), gy = s(g.y - bt);
      var x = gx, y = gy;
      var fw, fh;
      // horizontal
      var w0 = m.w === 'fixed' ? self.fixedSize(k, 'w', W0) : (m.w === 'fill' ? W : undefined);
      if (w0 !== undefined && isNaN(w0)) w0 = undefined;
      var cw = w0 === undefined ? self.intrinsicWidth(k, bp, 'max') : w0;
      var right = s(W0 - gx - cw);
      switch (cons.h) {
        case 'right': x = W - right - cw; break;
        case 'leftRight': fw = W - gx - right; break;
        case 'center': x = W / 2 - (W0 / 2 - gx); break;
        case 'scale': x = gx * W / W0; fw = cw * W / W0; break;
        default: break;
      }
      if (fw === undefined && w0 !== undefined) fw = w0;
      // vertical
      var h0 = m.h === 'fixed' ? self.fixedSize(k, 'h', H0) : (m.h === 'fill' ? H : undefined);
      if (h0 !== undefined && isNaN(h0)) h0 = undefined;
      var ch0 = h0 === undefined ? s(g.h) : h0;
      var bottom = s(H0 - gy - ch0);
      switch (cons.v) {
        case 'bottom': y = H - bottom - ch0; break;
        case 'topBottom': fh = H - gy - bottom; break;
        case 'center': y = H / 2 - (H0 / 2 - gy); break;
        case 'scale': y = gy * H / H0; fh = ch0 * H / H0; break;
        default: break;
      }
      if (fh === undefined && h0 !== undefined) fh = h0;
      var forced = {}; if (fw !== undefined) forced.w = Math.max(0, self.clampAxis(k, 'w', fw)); if (fh !== undefined) forced.h = Math.max(0, self.clampAxis(k, 'h', fh));
      var r = self.layoutNode(k, forced, { w: Math.max(0, W - x), h: Math.max(0, H - y) }, bp, ctxOf(ctx, W, H));
      ctx.rec.box(k.id, { x: x + bl, y: y + bt, w: r.w, h: r.h });
    });
  };

  LayoutEngine.prototype.placeAbsoluteChildren = function (rn, res, bp, ctx) {
    var abs = this.absoluteChildren(rn, bp);
    if (abs.length) this.placeByConstraints(rn, abs, res, bp, ctx);
  };

  /* ---- flexbox */

  LayoutEngine.prototype.layoutStack = function (rn, forced, avail, bp, ctx) {
    var self = this, lp = rn.layoutParent, row = isRow(lp), ins = this.insets(rn), m = modes(rn);
    var MAIN = row ? 'w' : 'h', CROSS = row ? 'h' : 'w';
    var padMain = row ? ins.left + ins.right : ins.top + ins.bottom, padCross = row ? ins.top + ins.bottom : ins.left + ins.right;
    var gp = this.stackGaps(lp), gapAuto = gp.auto, gap = gp.gap, mg = gp.margin, rowGap = gp.rowGap;
    var items = this.flowChildren(rn, bp);

    // 1. container main size (definite or indefinite)
    var mainSize; // outer
    var fm = forced[MAIN];
    if (fm !== undefined) mainSize = fm;
    else if (m[MAIN] === 'fixed') { mainSize = this.fixedSize(rn, MAIN, row ? ctx.cbW : ctx.cbH); if (isNaN(mainSize)) mainSize = undefined; }
    else if (m[MAIN] === 'fill') mainSize = isFinite(avail[MAIN]) ? avail[MAIN] : undefined; // indefinite → content
    else mainSize = undefined; // hug
    var crossSize;
    var fc = forced[CROSS];
    if (fc !== undefined) crossSize = fc;
    else if (m[CROSS] === 'fixed') { crossSize = this.fixedSize(rn, CROSS, row ? ctx.cbH : ctx.cbW); if (isNaN(crossSize)) crossSize = undefined; }
    else if (m[CROSS] === 'fill') crossSize = isFinite(avail[CROSS]) ? avail[CROSS] : undefined;
    else crossSize = undefined;
    if (mainSize !== undefined) mainSize = this.clampAxis(rn, MAIN, mainSize);
    if (crossSize !== undefined) crossSize = this.clampAxis(rn, CROSS, crossSize);
    var availMain = mainSize !== undefined ? mainSize - padMain : (isFinite(avail[MAIN]) ? Math.max(0, avail[MAIN] - padMain) : INF);
    var innerCrossAvail = crossSize !== undefined ? crossSize - padCross : (isFinite(avail[CROSS]) ? Math.max(0, avail[CROSS] - padCross) : INF);
    var cbW = row ? (mainSize !== undefined ? mainSize - ins.left - ins.right : undefined) : (crossSize !== undefined ? crossSize - ins.left - ins.right : undefined);
    var cbH = row ? (crossSize !== undefined ? crossSize - ins.top - ins.bottom : undefined) : (mainSize !== undefined ? mainSize - ins.top - ins.bottom : undefined);
    var ctxFor = function () { return ctxOf(ctx, cbW, cbH); };

    // 2. flex base sizes / hypothetical main sizes (+ margins standing for negative spacing)
    var fi = items.map(function (k, idx) {
      var km = modes(k), base, grow = 0, shrink = 0, pctItem = false;
      var mm = self.minMax(k, MAIN);
      if (km[MAIN] === 'fill') {
        grow = num(k.layoutChild.grow, 1); shrink = 1;
        base = mainSize !== undefined ? 0 : self.intrinsicWidthAxis(k, MAIN, bp, 'max', innerCrossAvail, ctx);
      } else if (km[MAIN] === 'fixed' && !(aspectAxis(k) === MAIN)) {
        base = self.fixedSize(k, MAIN, row ? cbW : cbH);
        if (isNaN(base)) { pctItem = true; base = self.intrinsicWidthAxis(k, MAIN, bp, 'max', innerCrossAvail, ctx); }
      } else if (aspectAxis(k) === MAIN) {
        base = self.layoutNode(k, {}, { w: row ? INF : innerCrossAvail, h: row ? innerCrossAvail : INF }, bp, scratchOf(ctx, cbW, cbH))[MAIN];
      } else { // hug: fit-content against the available main space
        var maxC = self.intrinsicWidthAxis(k, MAIN, bp, 'max', innerCrossAvail, ctx), minC = self.intrinsicWidthAxis(k, MAIN, bp, 'min', innerCrossAvail, ctx);
        base = isFinite(availMain) ? Math.min(maxC, Math.max(minC, availMain)) : maxC;
      }
      var hypo = clamp(base, mm.min, mm.max);
      return { node: k, base: base, hypo: hypo, grow: grow, shrink: shrink, min: mm.min, max: mm.max, main: hypo, frozen: false, margin: idx ? mg : 0, pct: pctItem };
    });

    // container main size when hug: fit-content = min(max-content, max(min-content, available))
    var sumOf = function (line) { return line.reduce(function (a, it) { return a + it.hypo + it.margin; }, 0) + Math.max(0, line.length - 1) * gap; };
    var innerMain;
    if (mainSize !== undefined) innerMain = mainSize - padMain;
    else {
      var maxC = sumOf(fi), minC = lp.wrap ? fi.reduce(function (a, it) { return Math.max(a, it.hypo + it.margin); }, 0) : maxC;
      innerMain = isFinite(availMain) ? Math.min(maxC, Math.max(minC, availMain)) : maxC;
      mainSize = this.clampAxis(rn, MAIN, innerMain + padMain);
      innerMain = mainSize - padMain;
      availMain = innerMain;
      if (row) cbW = innerMain; else cbH = innerMain;
      // cyclic percentages contributed auto to the container's size; now they resolve against it
      fi.forEach(function (it) {
        if (!it.pct) return;
        var v = self.fixedSize(it.node, MAIN, innerMain);
        if (!isNaN(v)) { it.base = v; it.hypo = clamp(v, it.min, it.max); it.main = it.hypo; }
      });
    }

    // 3. lines (outer sizes include the margins)
    var lines = [];
    if (lp.wrap && isFinite(availMain)) {
      var cur = [], used = 0;
      fi.forEach(function (it) {
        var add = it.hypo + it.margin + (cur.length ? gap : 0);
        if (cur.length && used + add > availMain + 1 / 64) { lines.push(cur); cur = []; used = 0; add = it.hypo + it.margin; }
        cur.push(it); used += add;
      });
      if (cur.length || !lines.length) lines.push(cur);
    } else lines.push(fi);

    // 4. resolve flexible lengths per line (§9.7)
    lines.forEach(function (line) {
      var margins = line.reduce(function (a, it) { return a + it.margin; }, 0) + Math.max(0, line.length - 1) * gap;
      var growing = innerMain - sumOf(line) > 0;
      line.forEach(function (it) { it.main = it.hypo; it.frozen = growing ? it.grow === 0 : it.shrink === 0; });
      // items already at their clamp are frozen too
      line.forEach(function (it) { if (!it.frozen) { if (growing && it.max !== undefined && it.base >= it.max) it.frozen = true; if (!growing && it.min !== undefined && it.base <= it.min) it.frozen = true; } });
      var initialFree = innerMain - margins - line.reduce(function (a, it) { return a + (it.frozen ? it.main : it.base); }, 0);
      var guard = 0;
      while (guard++ < 50) {
        var unfrozen = line.filter(function (it) { return !it.frozen; });
        if (!unfrozen.length) break;
        var rem = innerMain - margins - line.reduce(function (a, it) { return a + (it.frozen ? it.main : it.base); }, 0);
        // §9.7 4b: a sum of flex factors < 1 only distributes that fraction of the initial free space
        var sumF = unfrozen.reduce(function (a, it) { return a + (growing ? it.grow : it.shrink); }, 0);
        if (sumF < 1) { var scaled = initialFree * sumF; if (Math.abs(scaled) < Math.abs(rem)) rem = scaled; }
        if (Math.abs(rem) < 1e-9) { unfrozen.forEach(function (it) { it.main = it.base; }); break; }
        var totalViolation = 0;
        if (growing) {
          var sumGrow = unfrozen.reduce(function (a, it) { return a + it.grow; }, 0);
          unfrozen.forEach(function (it) { it.target = it.base + (sumGrow > 0 ? rem * it.grow / sumGrow : 0); });
        } else {
          var sumScaled = unfrozen.reduce(function (a, it) { return a + it.shrink * it.base; }, 0);
          unfrozen.forEach(function (it) { it.target = it.base + (sumScaled > 0 ? rem * (it.shrink * it.base) / sumScaled : 0); });
        }
        unfrozen.forEach(function (it) {
          var clamped = clamp(it.target, it.min, it.max);
          it.violation = clamped - it.target; it.main = clamped; totalViolation += it.violation;
        });
        if (Math.abs(totalViolation) < 1e-9) { unfrozen.forEach(function (it) { it.frozen = true; }); break; }
        unfrozen.forEach(function (it) {
          if (totalViolation > 0 && it.violation > 0) it.frozen = true;    // min violations
          else if (totalViolation < 0 && it.violation < 0) it.frozen = true; // max violations
        });
      }
    });

    // 5. hypothetical cross sizes (lay out each item at its main size)
    var alignCross = lp.alignCross || 'start';
    lines.forEach(function (line) {
      line.forEach(function (it) {
        var k = it.node, km = modes(k);
        var f = {}; f[MAIN] = it.main;
        var av = {}; av[MAIN] = it.main; av[CROSS] = innerCrossAvail;
        var selfAlign = k.layoutChild.alignSelf && k.layoutChild.alignSelf !== 'auto' ? k.layoutChild.alignSelf : alignCross;
        it.stretch = km[CROSS] === 'fill';
        it.align = it.stretch ? 'stretch' : (selfAlign === 'stretch' ? 'start' : selfAlign);
        if (it.stretch && lines.length > 1) {
          // multi-line: a stretched item's hypothetical cross size is its content size (CSS §9.4 step 7:
          // layout "treating auto as fit-content"); lines are stretched afterwards by align-content.
          if (k.type === 'text' && CROSS === 'w') {
            var tmx = self.measureTextNode(k, INF, bp);
            var minT = self.measurer.minContentWidth ? self.measurer.minContentWidth(k.text, k.style) : 0;
            f[CROSS] = self.clampAxis(k, CROSS, isFinite(innerCrossAvail) ? Math.min(tmx.maxContentWidth, Math.max(minT, innerCrossAvail)) : tmx.maxContentWidth);
          } else av[CROSS] = INF;
        }
        var r = self.layoutNode(k, f, av, bp, ctxFor());
        it.cross = r[CROSS]; it.r = r;
        it.baseline = r.baseline !== null && r.baseline !== undefined ? r.baseline : (row ? r.h : null);
      });
    });

    // 6. line cross sizes
    var lineCross = lines.map(function (line) {
      var maxAbove = 0, maxBelow = 0, maxCross = 0, hasBaseline = false;
      line.forEach(function (it) {
        if (it.align === 'baseline' && row) { hasBaseline = true; var b = it.baseline === null ? it.cross : it.baseline; maxAbove = Math.max(maxAbove, b); maxBelow = Math.max(maxBelow, it.cross - b); }
        else maxCross = Math.max(maxCross, it.cross);
      });
      var lc = Math.max(maxCross, hasBaseline ? maxAbove + maxBelow : 0);
      return { size: lc, above: maxAbove, hasBaseline: hasBaseline };
    });
    var sumLines = lineCross.reduce(function (a, l) { return a + l.size; }, 0) + Math.max(0, lines.length - 1) * rowGap;
    if (crossSize === undefined) { crossSize = this.clampAxis(rn, CROSS, sumLines + padCross); }
    var innerCross = Math.max(0, crossSize - padCross);
    if (lines.length === 1 && lineCross[0]) {
      // single-line: the line cross size is the container's inner cross size
      lineCross[0].size = innerCross;
    } else if (lines.length > 1) {
      // align-content: stretch (default) only when alignCross is 'stretch'; otherwise pack per alignCross
      var extraC = innerCross - sumLines;
      if (alignCross === 'stretch' && extraC > 0) lineCross.forEach(function (l) { l.size += extraC / lines.length; });
    }

    // 7. positions
    var mainStart = row ? ins.left : ins.top, crossStart = row ? ins.top : ins.left;
    var lineOffset = crossStart, firstLineOffset = crossStart;
    if (lines.length > 1 && alignCross !== 'stretch') {
      var extraL = innerCross - sumLines;
      if (alignCross === 'center') lineOffset += extraL / 2; else if (alignCross === 'end') lineOffset += extraL;
    }
    lines.forEach(function (line, li) {
      if (li === 0) firstLineOffset = lineOffset;
      var used = line.reduce(function (a, it) { return a + it.main + it.margin; }, 0) + Math.max(0, line.length - 1) * gap;
      var free = innerMain - used;
      var pos = mainStart, between = gap;
      var alignMain = gapAuto ? 'spaceBetween' : (lp.alignMain || 'start');
      if (alignMain === 'center') pos += free / 2;
      else if (alignMain === 'end') pos += free;
      else if (alignMain === 'spaceBetween') { if (line.length > 1 && free > 0) between = gap + free / (line.length - 1); }
      var lc = lineCross[li];
      line.forEach(function (it, ii) {
        var k = it.node, crossPos = lineOffset, size = it.cross;
        pos += it.margin;
        if (it.align === 'stretch') { size = self.clampAxis(k, CROSS, lc.size); if (size !== it.cross) { var f2 = {}; f2[MAIN] = it.main; f2[CROSS] = size; var av2 = {}; av2[MAIN] = it.main; av2[CROSS] = size; self.layoutNode(k, f2, av2, bp, ctxFor()); it.cross = size; } }
        else if (it.align === 'center') crossPos += (lc.size - size) / 2;
        else if (it.align === 'end') crossPos += lc.size - size;
        else if (it.align === 'baseline' && row) { var b = it.baseline === null ? size : it.baseline; crossPos += lc.above - b; }
        var box = row ? { x: pos, y: crossPos, w: it.main, h: size } : { x: crossPos, y: pos, w: size, h: it.main };
        ctx.rec.box(k.id, box);
        it.box = box;
        pos += it.main + (ii < line.length - 1 ? between : 0);
      });
      lineOffset += lc.size + rowGap;
    });

    // container's own baseline (Flexbox §8.5): the shared baseline of the first line's
    // baseline-aligned items, else the startmost item's baseline — synthesized from its border box
    // (bottom edge) when it has none.
    var baseline = null;
    if (lines[0] && lines[0].length) {
      if (row && lineCross[0].hasBaseline) baseline = firstLineOffset + lineCross[0].above;
      else {
        var first = lines[0][0], fb = first.box;
        baseline = first.r && first.r.baseline !== null && first.r.baseline !== undefined ? fb.y + first.r.baseline : fb.y + fb.h;
      }
    }
    var out = {}; out[MAIN] = mainSize; out[CROSS] = crossSize; out.baseline = baseline;
    return out;
  };

  /** intrinsic size along an axis ('w' → width; 'h' → height given a cross width). */
  LayoutEngine.prototype.intrinsicWidthAxis = function (rn, axis, bp, which, crossAvail, ctx) {
    if (axis === 'w') return this.intrinsicWidth(rn, bp, which);
    // height: lay out at the available width with no forced size (results are not kept)
    var scratch = { rec: new Rec(), result: ctx ? ctx.result : null, cbW: isFinite(crossAvail) ? crossAvail : undefined, cbH: undefined };
    var r = this.layoutNode(rn, {}, { w: crossAvail, h: INF }, bp, scratch);
    return r.h;
  };

  /* ---- grid (CSS Grid Level 1 §11, subset) */

  function trackMin(t, s) { return t.kind === 'px' ? s(t.value) : t.kind === 'minmax' ? (t.min.kind === 'px' ? s(t.min.value) : 0) : 0; }
  function trackMaxIsFr(t) { return t.kind === 'fr' || (t.kind === 'minmax' && t.max.kind === 'fr'); }
  function trackFr(t) { return t.kind === 'fr' ? t.value : (t.kind === 'minmax' && t.max.kind === 'fr' ? t.max.value : 0); }
  function trackMaxFixed(t, s) { return t.kind === 'px' ? s(t.value) : (t.kind === 'minmax' && t.max.kind === 'px' ? s(t.max.value) : INF); }
  function trackIsIntrinsic(t) { return t.kind === 'auto' || (t.kind === 'minmax' && (t.min.kind === 'auto' || t.max.kind === 'auto')) || t.kind === 'fr'; }

  LayoutEngine.prototype.sizeTracks = function (tracks, items, spanOf, contribution, available, gap) {
    // items: placed items; spanOf(item) → {start, span}; contribution(item, which) → px
    var s = this.snap;
    var base = tracks.map(function (t) { return trackMin(t, s); }), limit = tracks.map(function (t) { return trackIsIntrinsic(t) ? INF : trackMaxFixed(t, s); });
    tracks.forEach(function (t, i) { if (t.kind === 'px') { base[i] = s(t.value); limit[i] = s(t.value); } });
    // intrinsic contributions (single-span first, then spanning items)
    var bySpan = items.map(function (it) { return { it: it, s: spanOf(it) }; }).sort(function (a, b) { return a.s.span - b.s.span; });
    bySpan.forEach(function (x) {
      var sp = x.s, idx = [];
      for (var i = sp.start; i < sp.start + sp.span && i < tracks.length; i++) idx.push(i);
      var flexible = idx.filter(function (i) { return trackMaxIsFr(tracks[i]); });
      // items spanning a flexible track are only sized by the flexible step (§11.5)
      if (flexible.length && sp.span > 1) return;
      var intrinsic = idx.filter(function (i) { return trackIsIntrinsic(tracks[i]) && !trackMaxIsFr(tracks[i]); });
      var minC = contribution(x.it, 'min'), maxC = contribution(x.it, 'max');
      var spannedGap = Math.max(0, idx.length - 1) * gap;
      var targets = intrinsic.length ? intrinsic : (flexible.length && sp.span === 1 ? flexible : []);
      if (!targets.length) return;
      // base sizes: distribute min contribution
      var cur = idx.reduce(function (a, i) { return a + base[i]; }, 0) + spannedGap;
      var need = minC - cur;
      if (need > 0) { var share = need / targets.length; targets.forEach(function (i) { base[i] += share; }); }
      // growth limits: distribute max contribution (not for fr tracks)
      if (!flexible.length || intrinsic.length) {
        var curL = idx.reduce(function (a, i) { return a + (limit[i] === INF ? base[i] : limit[i]); }, 0) + spannedGap;
        var needL = maxC - curL;
        targets.forEach(function (i) { if (limit[i] === INF) limit[i] = base[i]; });
        if (needL > 0) { var shareL = needL / targets.length; targets.forEach(function (i) { limit[i] += shareL; }); }
      }
    });
    tracks.forEach(function (t, i) { if (limit[i] === INF) limit[i] = base[i]; if (limit[i] < base[i]) limit[i] = base[i]; });
    var gaps = Math.max(0, tracks.length - 1) * gap;
    if (isFinite(available)) {
      // maximize tracks (non-flexible)
      var free = available - gaps - base.reduce(function (a, b) { return a + b; }, 0);
      if (free > 0) {
        var growable = tracks.map(function (t, i) { return i; }).filter(function (i) { return !trackMaxIsFr(tracks[i]) && limit[i] > base[i]; });
        var guard = 0;
        while (free > 1e-9 && growable.length && guard++ < 100) {
          var share = free / growable.length, next = [];
          growable.forEach(function (i) { var room = limit[i] - base[i]; var add = Math.min(room, share); base[i] += add; free -= add; if (limit[i] - base[i] > 1e-9) next.push(i); });
          growable = next;
        }
      }
      // expand flexible tracks
      var frIdx = tracks.map(function (t, i) { return i; }).filter(function (i) { return trackMaxIsFr(tracks[i]); });
      if (frIdx.length && free > 0) {
        var active = frIdx.slice(), hyp;
        var guard2 = 0;
        while (guard2++ < 50) {
          var leftover = available - gaps - tracks.reduce(function (a, t, i) { return a + (active.indexOf(i) >= 0 ? 0 : base[i]); }, 0);
          var sumFr = active.reduce(function (a, i) { return a + trackFr(tracks[i]); }, 0);
          hyp = sumFr > 0 ? leftover / Math.max(sumFr, 1) : 0;
          var changed = false;
          active = active.filter(function (i) { if (hyp * trackFr(tracks[i]) < base[i]) { changed = true; return false; } return true; });
          if (!changed) break;
        }
        active.forEach(function (i) { base[i] = Math.max(base[i], hyp * trackFr(tracks[i])); });
      }
      // stretch auto tracks with remaining space
      var free2 = available - gaps - base.reduce(function (a, b) { return a + b; }, 0);
      var autoIdx = tracks.map(function (t, i) { return i; }).filter(function (i) { return tracks[i].kind === 'auto' || (tracks[i].kind === 'minmax' && tracks[i].max.kind === 'auto'); });
      if (free2 > 1e-9 && autoIdx.length && !frIdx.length) autoIdx.forEach(function (i) { base[i] += free2 / autoIdx.length; });
    } else {
      // indefinite: fr tracks get max(content / fr) * fr
      var frIdx2 = tracks.map(function (t, i) { return i; }).filter(function (i) { return trackMaxIsFr(tracks[i]); });
      if (frIdx2.length) {
        var unit = 0;
        frIdx2.forEach(function (i) { unit = Math.max(unit, trackFr(tracks[i]) > 0 ? limit[i] / trackFr(tracks[i]) : 0); });
        frIdx2.forEach(function (i) { base[i] = Math.max(base[i], unit * trackFr(tracks[i])); });
      }
      tracks.forEach(function (t, i) { if (!trackMaxIsFr(t)) base[i] = Math.min(limit[i], Math.max(base[i], limit[i])); });
    }
    return base;
  };

  /**
   * Grid item placement (CSS Grid §8.5): items with a definite row and column first, then items
   * locked to a row, then the implicit column count is fixed (explicit columns, the largest span,
   * the largest explicit column end) and the remaining items are auto-placed row-major (sparse),
   * items with a definite column keeping it.
   */
  function placeGridItems(items, nCols) {
    var occupied = {}, placed = new Array(items.length);
    function free(c, r, cs, rs) { for (var a = 0; a < cs; a++) for (var b = 0; b < rs; b++) if (occupied[(c + a) + ',' + (r + b)]) return false; return true; }
    function take(i, p) { for (var a = 0; a < p.cs; a++) for (var b = 0; b < p.rs; b++) occupied[(p.c + a) + ',' + (p.r + b)] = true; placed[i] = p; }
    var spans = items.map(function (k) { var ga = k.layoutChild.gridArea || {}; return { col: ga.col || 0, row: ga.row || 0, cs: Math.max(1, ga.colSpan || 1), rs: Math.max(1, ga.rowSpan || 1) }; });
    var cols = nCols;
    spans.forEach(function (s) { cols = Math.max(cols, s.col ? s.col - 1 + s.cs : s.cs); });
    // 1. fully explicit
    spans.forEach(function (s, i) { if (s.col && s.row) take(i, { c: s.col - 1, r: s.row - 1, cs: s.cs, rs: s.rs }); });
    // 2. locked to a row (sparse: after the items previously placed in that row by this step)
    var rowCursor = {};
    spans.forEach(function (s, i) {
      if (!(s.row && !s.col)) return;
      var r = s.row - 1, c = rowCursor[r] || 0, guard = 0;
      while (!free(c, r, s.cs, s.rs) && guard++ < 10000) c++;
      take(i, { c: c, r: r, cs: s.cs, rs: s.rs }); rowCursor[r] = c + s.cs;
      cols = Math.max(cols, c + s.cs);
    });
    // 3. auto placement
    var cur = { c: 0, r: 0 };
    spans.forEach(function (s, i) {
      if (placed[i]) return;
      var guard = 0;
      if (s.col) {
        var c0 = s.col - 1;
        if (c0 < cur.c) cur.r++;
        cur.c = c0;
        while (!free(c0, cur.r, s.cs, s.rs) && guard++ < 10000) cur.r++;
        take(i, { c: c0, r: cur.r, cs: s.cs, rs: s.rs });
        return;
      }
      while (guard++ < 100000) {
        if (cur.c + s.cs > cols) { cur.c = 0; cur.r++; }
        if (free(cur.c, cur.r, s.cs, s.rs)) break;
        cur.c++;
      }
      take(i, { c: cur.c, r: cur.r, cs: s.cs, rs: s.rs });
      cur.c += s.cs;
    });
    return { placed: placed, cols: cols };
  }

  LayoutEngine.prototype.layoutGrid = function (rn, forced, avail, bp, ctx) {
    var self = this, lp = rn.layoutParent, ins = this.insets(rn), m = modes(rn), s = this.snap;
    var cols = (lp.columns && lp.columns.length ? lp.columns : [{ kind: 'fr', value: 1 }]).slice();
    var rows = (lp.rows || []).slice();
    var cg = Math.max(0, s(num(lp.columnGap, num(lp.gap, 0)))), rg = Math.max(0, s(num(lp.rowGap, num(lp.gap, 0))));
    var items = this.flowChildren(rn, bp);
    var pl = placeGridItems(items, cols.length);
    while (cols.length < pl.cols) cols.push({ kind: 'auto' });   // implicit columns
    var placed = items.map(function (k, i) { var p = pl.placed[i]; return { node: k, c: p.c, r: p.r, cs: p.cs, rs: p.rs }; });
    var nRows = rows.length;
    placed.forEach(function (p) { nRows = Math.max(nRows, p.r + p.rs); });
    while (rows.length < nRows) rows.push({ kind: 'auto' });

    // container width
    var W, H;
    if (forced.w !== undefined) W = forced.w;
    else if (m.w === 'fixed') { W = this.fixedSize(rn, 'w', ctx.cbW); if (isNaN(W)) W = undefined; }
    else if (m.w === 'fill') W = isFinite(avail.w) ? avail.w : undefined;
    if (W !== undefined) W = this.clampAxis(rn, 'w', W);
    var innerW = W !== undefined ? Math.max(0, W - ins.left - ins.right) : INF;
    var colSizes = this.sizeTracks(cols, placed, function (p) { return { start: p.c, span: p.cs }; }, function (p, which) { return self.intrinsicWidth(p.node, bp, which); }, innerW, cg);
    if (W === undefined) { W = this.clampAxis(rn, 'w', colSizes.reduce(function (a, b) { return a + b; }, 0) + Math.max(0, cols.length - 1) * cg + ins.left + ins.right); innerW = W - ins.left - ins.right; }
    var colPos = [], x = 0; cols.forEach(function (t, i) { colPos.push(x); x += colSizes[i] + cg; });
    function cellW(p) { var w = 0; for (var i = p.c; i < p.c + p.cs; i++) w += colSizes[i] || 0; return w + (p.cs - 1) * cg; }

    // row sizing: contributions are the items' heights at their cell width
    if (forced.h !== undefined) H = forced.h;
    else if (m.h === 'fixed') { H = this.fixedSize(rn, 'h', ctx.cbH); if (isNaN(H)) H = undefined; }
    else if (m.h === 'fill') H = isFinite(avail.h) ? avail.h : undefined;
    if (H !== undefined) H = this.clampAxis(rn, 'h', H);
    var innerH = H !== undefined ? Math.max(0, H - ins.top - ins.bottom) : INF;
    var rowSizes = this.sizeTracks(rows, placed, function (p) { return { start: p.r, span: p.rs }; }, function (p, which) {
      var km = modes(p.node), cw = cellW(p);
      var f = {}; if (km.w === 'fill') f.w = cw;
      var r = self.layoutNode(p.node, f, { w: cw, h: INF }, bp, scratchOf(ctx, innerW, undefined));
      return r.h;
    }, innerH, rg);
    if (H === undefined) { H = this.clampAxis(rn, 'h', rowSizes.reduce(function (a, b) { return a + b; }, 0) + Math.max(0, rows.length - 1) * rg + ins.top + ins.bottom); innerH = H - ins.top - ins.bottom; }
    var rowPos = [], y = 0; rows.forEach(function (t, i) { rowPos.push(y); y += rowSizes[i] + rg; });
    function cellH(p) { var h = 0; for (var i = p.r; i < p.r + p.rs; i++) h += rowSizes[i] || 0; return h + (p.rs - 1) * rg; }

    // place items
    placed.forEach(function (p) {
      var k = p.node, km = modes(k), cw = cellW(p), ch = cellH(p);
      var jus = km.w === 'fill' ? 'stretch' : (k.layoutChild.justifySelf || 'start');
      var ali = km.h === 'fill' ? 'stretch' : (k.layoutChild.alignSelf && k.layoutChild.alignSelf !== 'auto' ? k.layoutChild.alignSelf : 'start');
      var f = {}; if (jus === 'stretch') f.w = self.clampAxis(k, 'w', cw); if (ali === 'stretch') f.h = self.clampAxis(k, 'h', ch);
      var r = self.layoutNode(k, f, { w: cw, h: ch }, bp, ctxOf(ctx, innerW, innerH));
      var cx = ins.left + colPos[p.c], cy = ins.top + rowPos[p.r];
      if (jus === 'center') cx += (cw - r.w) / 2; else if (jus === 'end') cx += cw - r.w;
      if (ali === 'center') cy += (ch - r.h) / 2; else if (ali === 'end') cy += ch - r.h;
      ctx.rec.box(k.id, { x: cx, y: cy, w: r.w, h: r.h });
    });
    return { w: W, h: H, baseline: null, tracks: { columns: colSizes, rows: rowSizes } };
  };

  /* ------------------------------------------------------------------ document level */

  /** Apply an entry's records to a persistent result (skipping subtrees it already owns). */
  LayoutEngine.prototype.applyEntry = function (result, entry, changed) {
    if (result.owners.get(entry.id) === entry) return;
    this.stats.replays++;
    var it = entry.items, boxes = result.boxes;
    for (var i = 0; i < it.length; i += 3) {
      var kind = it[i];
      if (kind === 0) {
        if (changed === null) boxes.set(it[i + 1], it[i + 2]); // fresh result: everything is new
        else { var prev = boxes.get(it[i + 1]); if (!sameBox(prev, it[i + 2])) { boxes.set(it[i + 1], it[i + 2]); changed.add(it[i + 1]); } }
      }
      else if (kind === 1) result.text.set(it[i + 1], it[i + 2]);
      else if (kind === 2 && it[i + 2]) this.applyEntry(result, it[i + 2], changed);
    }
    result.owners.set(entry.id, entry);
  };

  /**
   * world / matrices are views: each node keeps its transform relative to its root frame (rootOf),
   * and the root's page offset is added on read — so moving a whole root (a section above grew)
   * costs nothing, and only subtrees whose local geometry changed are recomputed.
   */
  function View(result, matrix) { this.r = result; this.matrix = matrix; }
  View.prototype.get = function (id) {
    var r = this.r, l = this.matrix ? r.localMatrices.get(id) : r.localWorld.get(id);
    if (!l) return undefined;
    var rb = r.boxes.get(r.rootOf.get(id)), ox = rb ? rb.x : 0, oy = rb ? rb.y : 0;
    if (this.matrix) return [l[0], l[1], l[2], l[3], l[4] + ox, l[5] + oy];
    var x = l.x + ox, y = l.y + oy;
    if (r.clampLU) { x = luClamp(x); y = luClamp(y); } // Blink saturates offsets
    return { x: x, y: y, w: l.w, h: l.h };
  };
  View.prototype.has = function (id) { return (this.matrix ? this.r.localMatrices : this.r.localWorld).has(id); };
  View.prototype.keys = function () { return (this.matrix ? this.r.localMatrices : this.r.localWorld).keys(); };
  View.prototype.forEach = function (fn) { var self = this; (this.matrix ? this.r.localMatrices : this.r.localWorld).forEach(function (v, k) { fn(self.get(k), k, self); }); };
  View.prototype.entries = function () { var out = []; this.forEach(function (v, k) { out.push([k, v]); }); return out[Symbol.iterator](); };
  if (typeof Symbol !== 'undefined') View.prototype[Symbol.iterator] = function () { return this.entries(); };
  Object.defineProperty(View.prototype, 'size', { get: function () { return (this.matrix ? this.r.localMatrices : this.r.localWorld).size; } });

  function freshResult(bp, viewport) {
    var r = { breakpoint: bp, viewport: viewport, boxes: new Map(), text: new Map(), reference: {}, roots: [], owners: new Map(), worldDirty: new Set(), stale: false, rebuild: false,
      localWorld: new Map(), localMatrices: new Map(), rootOf: new Map(), clampLU: false };
    r.world = new View(r, false); r.matrices = new View(r, true);
    return r;
  }

  /**
   * Lay out one breakpoint. Wider breakpoints are laid out first when constraints need a
   * reference size (§2.5). The result is persistent and updated in place on later calls.
   * @returns {LayoutResult}
   */
  LayoutEngine.prototype.layout = function (bp, page) {
    bp = bp || 'base';
    var cacheKey = bp + '|' + (page ? page.id : '');
    var prev = this.results.get(cacheKey);
    if (prev && !prev.stale) return prev;
    var doc = this.doc, self = this;
    var bpDef = R.getBreakpoint(doc, bp) || doc.breakpoints[0];
    var viewport = { width: bpDef.width, height: 900 };
    if (this.viewport) viewport = this.viewport;
    // reference layouts for wider breakpoints (definition breakpoints of overrides)
    var reference = {};
    var chain = R.chainOf(doc, bp);
    for (var i = 1; i < chain.length; i++) reference[chain[i]] = this.layout(chain[i], page);
    var savedViewport = this.viewport; this.viewport = viewport;
    var result = prev && !prev.rebuild ? prev : freshResult(bp, viewport);
    result.viewport = viewport; result.reference = reference; result.stale = false; result.rebuild = false;
    var fresh = result.boxes.size === 0;
    var changed = fresh ? null : new Set();   // a fresh result skips change tracking: full world pass
    var pg = page || doc.pages[0];
    var yFlow = 0, roots = [];
    (pg.children || []).forEach(function (rid) {
      var root = doc.nodes[rid]; if (!root) return;
      var rr = self.resolved(root, bp);
      if (rr.visible === false) return;
      var m = modes(rr), forced = {};
      if (m.w === 'fill') forced.w = viewport.width;
      if (m.h === 'fill') forced.h = viewport.height;
      var rootCtx = { rec: new Rec(), result: result, cbW: viewport.width, cbH: viewport.height };
      var r = self.layoutNode(rr, forced, { w: viewport.width, h: viewport.height }, bp, rootCtx);
      var it = rootCtx.rec.items;
      for (var k = 0; k < it.length; k += 3) if (it[k] === 2 && it[k + 2]) self.applyEntry(result, it[k + 2], changed);
      var x = 0, y = yFlow;
      if (self.rootPlacement === 'canvas') { x = rr.geometry.x; y = rr.geometry.y; }
      var box = { x: x, y: y, w: r.w, h: r.h };
      if (!sameBox(result.boxes.get(rid), box)) { result.boxes.set(rid, box); if (changed) changed.add(rid); }
      roots.push(rid);
      yFlow += r.h;
    });
    result.roots = roots;
    result.clampLU = this.snap === luSnap;
    this.updateWorld(result, changed, bp);
    this.viewport = savedViewport;
    this.results.set(cacheKey, result);
    return result;
  };

  /** Recompute world boxes / matrices of the subtrees whose box (or transform) changed. */
  LayoutEngine.prototype.updateWorld = function (result, changed, bp) {
    var doc = this.doc, self = this, onPath = new Set();
    if (changed === null) { // fresh result: full pass, every node is "changed"
      result.worldDirty.clear();
      changed = { has: function () { return true; } };
    } else {
      result.worldDirty.forEach(function (id) { changed.add(id); });
      result.worldDirty.clear();
      if (!changed.size) return;
      changed.forEach(function (id) {
        var n = doc.nodes[id], guard = 0;
        while (n && n.parent && guard++ < 10000) { if (onPath.has(n.parent)) break; onPath.add(n.parent); n = doc.nodes[n.parent]; }
      });
    }
    function visit(id, parentM, force, rootId) {
      var node = doc.nodes[id]; if (!node) return;
      var box = result.boxes.get(id); if (!box) return;
      var isRoot = id === rootId;
      var M, recompute = force || changed.has(id);
      if (recompute || !result.localMatrices.has(id)) {
        var rn = self.resolved(node, bp), g = rn.geometry;
        var bx = isRoot ? 0 : box.x, by = isRoot ? 0 : box.y; // a root's page offset is added on read
        if (!g.rotation && !g.flipH && !g.flipV) M = [parentM[0], parentM[1], parentM[2], parentM[3], parentM[0] * bx + parentM[2] * by + parentM[4], parentM[1] * bx + parentM[3] * by + parentM[5]];
        else M = mul(parentM, mul(translate(bx, by), localTransform(box.w, box.h, g.rotation, g.flipH, g.flipV)));
        var old = result.localMatrices.get(id);
        result.localMatrices.set(id, M);
        result.localWorld.set(id, bboxOf(M, box.w, box.h));
        result.rootOf.set(id, rootId);
        self.stats.worldUpdates++;
        force = !sameMatrix(M, old);
      } else { M = result.localMatrices.get(id); force = false; }
      var ch = node.children; if (!ch) return;
      for (var i = 0; i < ch.length; i++) {
        var cid = ch[i];
        if (force || changed.has(cid) || onPath.has(cid)) visit(cid, M, force, rootId);
      }
    }
    result.roots.forEach(function (rid) { if (changed.has(rid) || onPath.has(rid)) visit(rid, [1, 0, 0, 1, 0, 0], false, rid); });
  };

  /** Lay out every breakpoint: { [bpId]: LayoutResult } */
  LayoutEngine.prototype.layoutAll = function (page) {
    var out = {}, self = this;
    this.doc.breakpoints.forEach(function (b) { out[b.id] = self.layout(b.id, page); });
    return out;
  };

  /* convenience */
  function layoutDocument(doc, opts) {
    opts = opts || {};
    var eng = new LayoutEngine(doc, opts);
    return eng.layout(opts.breakpoint || 'base', opts.page);
  }
  function layoutAll(doc, opts) { return new LayoutEngine(doc, opts || {}).layoutAll(opts && opts.page); }

  /** padding + borders of a resolved node, without quantisation (css.js / raster.js) */
  function insets(rn) {
    var p = (rn.layoutParent && rn.layoutParent.padding) || {}, b = model.borderInsets(rn.strokes);
    return { top: num(p.top, 0) + b.top, right: num(p.right, 0) + b.right, bottom: num(p.bottom, 0) + b.bottom, left: num(p.left, 0) + b.left, border: b };
  }

  return {
    LayoutEngine: LayoutEngine, layoutDocument: layoutDocument, layoutAll: layoutAll,
    modes: modes, insets: insets, aspectAxis: aspectAxis, localTransform: localTransform, mul: mul, apply: apply, bboxOf: bboxOf, translate: translate,
    luSnap: luSnap, LU_MAX: LU_MAX
  };
});
