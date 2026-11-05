/* DualEngine — resolve.js
 * Cascade resolution (§1.5 breakpoints, §4.3 states), token references (§4.4) with modes and
 * cycle detection, and media-query bounds (the .98 convention).
 *
 *   value = state override (per breakpoint chain, then base state)
 *         > breakpoint override (narrowest → widest, 'base' excluded)
 *         > node base value
 *
 * Object-valued overridable properties (geometry, layoutChild, layoutParent, corners, text) are
 * merged key by key along the chain (an override on `geometry.w` on mobile does not freeze `x`);
 * array-valued ones (fills, strokes, effects) and scalars are replaced whole.
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js') } : global.DualEngine;
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).resolve = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model;
  var OVERRIDABLE = model.OVERRIDABLE;
  var MERGED = { geometry: true, layoutChild: true, layoutParent: true, corners: true, text: true };
  var MAX_ALIAS_DEPTH = 32;
  var REF_KEYS = ['fills', 'strokes', 'effects', 'corners', 'geometry', 'layoutChild', 'layoutParent', 'style', 'opacity', 'visible'];

  /* ------------------------------------------------------------------ breakpoints */

  /** Breakpoint ids from `bp` up to (but excluding) 'base', e.g. phone → ['phone','tablet']. */
  function breakpointsFrom(doc, bp) {
    var bps = doc.breakpoints, out = [];
    if (!bp || bp === 'base') return out;
    var i = -1;
    for (var k = 0; k < bps.length; k++) if (bps[k].id === bp) { i = k; break; }
    if (i < 0) throw new Error('unknown breakpoint ' + bp);
    for (var j = i; j >= 1; j--) out.push(bps[j].id);
    return out;
  }
  /** Full chain including 'base' at the end. */
  function chainOf(doc, bp) { return breakpointsFrom(doc, bp).concat('base'); }
  function getBreakpoint(doc, id) { for (var i = 0; i < doc.breakpoints.length; i++) if (doc.breakpoints[i].id === id) return doc.breakpoints[i]; return null; }

  /**
   * Media-query bounds (§1.5): a breakpoint applies for viewport < width of the next larger
   * breakpoint: tablet ⇒ max-width: 1439.98px, phone ⇒ max-width: 833.98px.
   * @returns {Array<{id:string,width:number,maxWidth:number|null,minWidth:number|null}>}
   */
  function mediaBounds(doc) {
    var bps = doc.breakpoints, out = [];
    for (var i = 0; i < bps.length; i++) {
      var larger = i > 0 ? bps[i - 1] : null, smaller = i + 1 < bps.length ? bps[i + 1] : null;
      out.push({
        id: bps[i].id, width: bps[i].width,
        maxWidth: larger ? round2(larger.width - 0.02) : null,
        minWidth: smaller ? smaller.width : null
      });
    }
    return out;
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  /** Breakpoint active for a viewport width (narrowest whose max-width bound matches). */
  function activeBreakpoint(doc, viewportWidth) {
    var b = mediaBounds(doc), active = 'base';
    for (var i = 1; i < b.length; i++) if (viewportWidth <= b[i].maxWidth) active = b[i].id;
    return active;
  }
  /** The `@media` prelude of a non-base breakpoint. */
  function mediaQuery(doc, bp) {
    var b = mediaBounds(doc);
    for (var i = 0; i < b.length; i++) if (b[i].id === bp) return b[i].maxWidth === null ? null : '(max-width: ' + fmt(b[i].maxWidth) + 'px)';
    return null;
  }
  function fmt(n) { return String(round2(n)); }

  /* ------------------------------------------------------------------ cascade */

  function merge(base, over) {
    if (over === undefined) return base;
    if (base && over && typeof base === 'object' && typeof over === 'object' && !Array.isArray(base) && !Array.isArray(over)) {
      var out = Object.assign({}, base);
      Object.keys(over).forEach(function (k) {
        var b = base[k], o = over[k];
        out[k] = (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o)) ? Object.assign({}, b, o) : o;
      });
      return out;
    }
    return over;
  }

  /**
   * Resolve one overridable property of a node for a breakpoint and an optional state.
   * @param {Object} doc
   * @param {Object} node
   * @param {string} prop   one of model.OVERRIDABLE ('text' = TextStyle partial over node.style)
   * @param {string} [bp]   breakpoint id (default 'base')
   * @param {string} [state] state name (hover, pressed, …)
   */
  function resolve(doc, node, prop, bp, state) {
    var chain = breakpointsFrom(doc, bp || 'base');   // narrowest first
    var isMerged = !!MERGED[prop];
    var baseValue = prop === 'text' ? node.style : node[prop];
    var value = baseValue;
    if (isMerged) {
      // widest → narrowest so that narrower keys win
      for (var i = chain.length - 1; i >= 0; i--) {
        var ov = node.overrides && node.overrides[chain[i]];
        if (ov && ov[prop] !== undefined) value = merge(value, ov[prop]);
      }
    } else {
      for (var j = 0; j < chain.length; j++) {
        var o = node.overrides && node.overrides[chain[j]];
        if (o && o[prop] !== undefined) { value = o[prop]; break; }
      }
    }
    if (state) {
      var sv;
      // base state value
      if (node.states && node.states[state] && node.states[state][prop] !== undefined) sv = node.states[state][prop];
      // state overridden per breakpoint (overrides[bp].states[state][prop]), widest → narrowest
      for (var k = chain.length - 1; k >= 0; k--) {
        var so = node.overrides && node.overrides[chain[k]] && node.overrides[chain[k]].states && node.overrides[chain[k]].states[state];
        if (so && so[prop] !== undefined) sv = isMerged && sv !== undefined ? merge(sv, so[prop]) : so[prop];
      }
      if (sv !== undefined) value = isMerged ? merge(value, sv) : sv;
    }
    return value;
  }

  /** True when a property has an explicit override at exactly this breakpoint (the blue lock). */
  function hasOverride(node, prop, bp) { return !!(bp && bp !== 'base' && node.overrides && node.overrides[bp] && node.overrides[bp][prop] !== undefined); }

  /** Breakpoint in the chain that defines `prop` for `bp` ('base' when no override). */
  function definingBreakpoint(doc, node, prop, bp) {
    var chain = breakpointsFrom(doc, bp || 'base');
    for (var i = 0; i < chain.length; i++) if (node.overrides && node.overrides[chain[i]] && node.overrides[chain[i]][prop] !== undefined) return chain[i];
    return 'base';
  }

  /**
   * Shallow copy of the node with every overridable property resolved for (bp, state) and token
   * references replaced by their values (`resolved.style` for text).
   */
  function resolveNode(doc, node, bp, state, opts) {
    var out = Object.assign({}, node);
    // fast path: no override, no state → only token references need resolving (copy-on-write)
    var ov = node.overrides, hasOv = false;
    if (ov) for (var bk in ov) { if (ov[bk] && bk !== 'base') { hasOv = true; break; } }
    if (!hasOv && !(state && node.states && node.states[state])) {
      if (!(opts && opts.keepRefs)) for (var f = 0; f < REF_KEYS.length; f++) { var kk = REF_KEYS[f]; if (out[kk] !== undefined) out[kk] = resolveRefs(doc, out[kk], opts && opts.mode); }
      return out;
    }
    for (var i = 0; i < OVERRIDABLE.length; i++) {
      var p = OVERRIDABLE[i];
      if (p === 'text') { if (node.type === 'text') out.style = resolve(doc, node, 'text', bp, state); continue; }
      if (node[p] !== undefined) out[p] = resolve(doc, node, p, bp, state);
    }
    if (!(opts && opts.keepRefs)) {
      REF_KEYS.forEach(function (k) {
        if (out[k] !== undefined) out[k] = resolveRefs(doc, out[k], opts && opts.mode);
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ tokens */

  function findToken(doc, name) {
    var sets = (doc.tokens && doc.tokens.sets) || [];
    for (var i = 0; i < sets.length; i++) if (sets[i].tokens && sets[i].tokens[name]) return { set: sets[i], token: sets[i].tokens[name] };
    return null;
  }
  function isRef(v) { return !!(v && typeof v === 'object' && typeof v.ref === 'string' && Object.keys(v).length <= 2); }
  function aliasName(v) { return v && typeof v === 'object' && typeof v.alias === 'string' ? v.alias.replace(/^\{|\}$/g, '') : null; }

  /**
   * Resolve a token reference ('color.brand.500' or '{color.brand.500}') to its value in a mode.
   * Mode: explicit `mode` > doc.tokens.activeMode[setId] > first mode > the only value.
   * Throws on unknown token or alias cycle (depth 32).
   */
  function resolveToken(doc, ref, mode, _depth, _seen) {
    var name = String(ref).replace(/^\{|\}$/g, '');
    _depth = _depth || 0; _seen = _seen || {};
    if (_depth > MAX_ALIAS_DEPTH) throw new Error('token alias depth exceeded at ' + name);
    if (_seen[name]) throw new Error('token alias cycle: ' + Object.keys(_seen).concat(name).join(' \u2192 '));
    _seen[name] = true;
    var found = findToken(doc, name);
    if (!found) throw new Error('unknown token ' + name);
    var tok = found.token, vbm = tok.valueByMode || {};
    var m = mode || (doc.tokens.activeMode && doc.tokens.activeMode[found.set.id]) || (doc.tokens.modes && doc.tokens.modes[0] && doc.tokens.modes[0].id);
    var value = vbm[m];
    if (value === undefined) { var keys = Object.keys(vbm); if (keys.length) value = vbm[keys[0]]; }
    if (value === undefined && tok.value !== undefined) value = tok.value;
    if (value === undefined) throw new Error('token ' + name + ' has no value for mode ' + m);
    var alias = aliasName(value);
    if (alias) return resolveToken(doc, alias, mode, _depth + 1, _seen);
    return value;
  }

  /** Value used when a token reference cannot be resolved (unknown token, alias cycle, depth). */
  function fallbackFor(doc, ref) {
    if (ref.fallback !== undefined) return ref.fallback;
    var found = null;
    try { found = findToken(doc, String(ref.ref).replace(/^\{|\}$/g, '')); } catch (e) { found = null; }
    var type = found && found.token.type;
    if (type === 'color') return { r: 0, g: 0, b: 0, a: 0 };
    if (type === 'string' || type === 'fontFamily') return '';
    if (type === 'boolean') return true;
    return 0;
  }
  /** Unresolvable references met while resolving a document: doc → { message: true }. */
  var tokenIssues = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function noteIssue(doc, msg) {
    if (!tokenIssues || !doc || typeof doc !== 'object') return;
    var m = tokenIssues.get(doc); if (!m) { m = {}; tokenIssues.set(doc, m); }
    m[msg] = true;
  }
  /** Messages of the unresolvable token references met so far for `doc` (and forget them). */
  function takeTokenIssues(doc) {
    if (!tokenIssues) return [];
    var m = tokenIssues.get(doc); tokenIssues.delete(doc);
    return m ? Object.keys(m) : [];
  }

  /**
   * Deep-walk a value replacing every `{ ref }` object by the token value. Copy-on-write: a value
   * without references is returned as is (no allocation). An unresolvable reference (unknown token,
   * alias cycle, depth > 32) never throws here: it resolves to `ref.fallback` or a neutral value of
   * the token's type (transparent / 0 / '') and is reported through takeTokenIssues(doc).
   */
  function resolveRefs(doc, value, mode) {
    if (value === null || typeof value !== 'object') return value;
    if (isRef(value)) {
      var v;
      try { v = resolveToken(doc, value.ref, mode); }
      catch (e) { noteIssue(doc, e.message); return fallbackFor(doc, value); }
      if (v && typeof v === 'object' && typeof v.value === 'number' && (v.unit === undefined || v.unit === 'px' || v.unit === 'ms')) return v.value; // DTCG dimension/duration
      if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) return model.hex(v);  // colour tokens stored as hex strings
      return typeof v === 'object' ? resolveRefs(doc, v, mode) : v;
    }
    var out = null, i, r;
    if (Array.isArray(value)) {
      for (i = 0; i < value.length; i++) {
        r = resolveRefs(doc, value[i], mode);
        if (r !== value[i]) { if (!out) out = value.slice(); out[i] = r; }
      }
      return out || value;
    }
    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      r = resolveRefs(doc, value[k], mode);
      if (r !== value[k]) { if (!out) out = Object.assign({}, value); out[k] = r; }
    }
    return out || value;
  }

  /** True when a value contains at least one `{ ref }` (no allocation). */
  function hasRefs(value) {
    if (value === null || typeof value !== 'object') return false;
    if (isRef(value)) return true;
    if (Array.isArray(value)) { for (var i = 0; i < value.length; i++) if (hasRefs(value[i])) return true; return false; }
    for (var k in value) if (Object.prototype.hasOwnProperty.call(value, k) && hasRefs(value[k])) return true;
    return false;
  }
  /** True when a node (any overridable property, its overrides or states) references a token. */
  function nodeHasRefs(node) {
    for (var i = 0; i < REF_KEYS.length; i++) if (hasRefs(node[REF_KEYS[i]])) return true;
    return hasRefs(node.overrides) || hasRefs(node.states);
  }

  /** CSS custom property name of a token: color.brand.500 → --color-brand-500 */
  function cssVarName(name) { return '--' + String(name).replace(/^\{|\}$/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-'); }

  /** All tokens flattened: [{ name, type, set, valueByMode }] */
  function listTokens(doc) {
    var out = [];
    ((doc.tokens && doc.tokens.sets) || []).forEach(function (set) {
      Object.keys(set.tokens || {}).forEach(function (name) { out.push({ name: name, type: set.tokens[name].type, set: set.id, valueByMode: set.tokens[name].valueByMode || {} }); });
    });
    return out;
  }

  /** Detect alias cycles in the whole store → array of error strings. */
  function checkTokens(doc) {
    var errs = [];
    listTokens(doc).forEach(function (t) {
      Object.keys(t.valueByMode).forEach(function (m) {
        try { resolveToken(doc, t.name, m); } catch (e) { errs.push(t.name + '@' + m + ': ' + e.message); }
      });
    });
    return errs;
  }

  return {
    breakpointsFrom: breakpointsFrom, chainOf: chainOf, getBreakpoint: getBreakpoint, mediaBounds: mediaBounds, activeBreakpoint: activeBreakpoint, mediaQuery: mediaQuery,
    resolve: resolve, resolveNode: resolveNode, hasOverride: hasOverride, definingBreakpoint: definingBreakpoint, merge: merge,
    resolveToken: resolveToken, resolveRefs: resolveRefs, hasRefs: hasRefs, nodeHasRefs: nodeHasRefs, takeTokenIssues: takeTokenIssues, fallbackFor: fallbackFor, isRef: isRef, cssVarName: cssVarName, listTokens: listTokens, checkTokens: checkTokens, findToken: findToken,
    MAX_ALIAS_DEPTH: MAX_ALIAS_DEPTH
  };
});
