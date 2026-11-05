/* DualEngine — history.js
 * JSON Patch (RFC 6902) apply / invert, transactions with coalescing (§0.5), undo/redo stack
 * (1 000 entries) and a tiny event emitter for change notifications.
 *
 * Every mutation of a document goes through `History.commit(doc, patches, opts)`: the patches are
 * applied in place, their inverse is computed at application time, and the transaction is pushed
 * on the linear history. Node ids never change, so selections survive undo.
 */
(function (global, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.DualEngine = global.DualEngine || {}).history = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /**
   * @typedef {{op:'add'|'remove'|'replace'|'move'|'copy'|'test', path:string, value?:*, from?:string}} JsonPatch
   * @typedef {{id:string,label:string,patches:JsonPatch[],inverse:JsonPatch[],at:number,coalesceKey?:string}} Transaction
   */

  var MAX_HISTORY = 1000;
  var COALESCE_WINDOW_MS = 500;

  /* ------------------------------------------------------------------ JSON pointer */

  function unescape(tok) { return tok.replace(/~1/g, '/').replace(/~0/g, '~'); }
  function escape(tok) { return String(tok).replace(/~/g, '~0').replace(/\//g, '~1'); }
  /** Tokens that would reach Object.prototype through a patch (prototype pollution): refused. */
  function forbidden(t) { return t === '__proto__' || t === 'constructor' || t === 'prototype'; }
  function parsePointer(path) {
    if (typeof path !== 'string') throw new Error('invalid JSON pointer: ' + path);
    if (path === '') return [];
    if (path.charAt(0) !== '/') throw new Error('invalid JSON pointer: ' + path);
    var toks = path.split('/').slice(1).map(unescape);
    for (var i = 0; i < toks.length; i++) if (forbidden(toks[i])) throw new Error('forbidden token "' + toks[i] + '" in ' + path);
    return toks;
  }
  var hasOwn = Object.prototype.hasOwnProperty;
  function isObj(v) { return v !== null && typeof v === 'object'; }
  /** Own-property / in-range existence test (never walks the prototype chain). */
  function has(cur, t) { return Array.isArray(cur) ? (typeof t === 'number' && t >= 0 && t < cur.length) : hasOwn.call(cur, t); }
  function joinPointer(tokens) { return tokens.length ? '/' + tokens.map(escape).join('/') : ''; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /** Walk to the parent of the pointed value. Returns { parent, key, value } (key is the last token). */
  function locate(root, path, mustExist) {
    var toks = parsePointer(path);
    if (!toks.length) return { parent: null, key: null, value: root };
    var cur = root;
    for (var i = 0; i < toks.length - 1; i++) {
      var t = toks[i];
      if (!isObj(cur)) throw new Error('path not found: ' + path);
      if (Array.isArray(cur)) { if (!/^(0|[1-9][0-9]*)$/.test(t)) throw new Error('path not found: ' + path); t = parseInt(t, 10); }
      if (!has(cur, t)) throw new Error('path not found: ' + path);
      cur = cur[t];
    }
    if (!isObj(cur)) throw new Error('path not found: ' + path);
    var key = toks[toks.length - 1];
    if (Array.isArray(cur)) {
      if (key === '-') key = cur.length;
      else if (/^(0|[1-9][0-9]*)$/.test(key)) key = parseInt(key, 10);
      else throw new Error('bad array index in ' + path);
      if (key > cur.length || (mustExist && key >= cur.length)) throw new Error(mustExist ? 'path not found: ' + path : 'bad array index in ' + path);
    } else if (mustExist && !has(cur, key)) throw new Error('path not found: ' + path);
    return { parent: cur, key: key, value: has(cur, key) ? cur[key] : undefined };
  }

  function getAt(root, path) { return locate(root, path, true).value; }
  function hasPath(root, path) { try { locate(root, path, true); return true; } catch (e) { return false; } }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (!deepEqual(a[ka[i]], b[ka[i]])) return false;
    return true;
  }

  /* ------------------------------------------------------------------ apply one op, return its inverse ops */

  function applyOp(root, op) {
    var loc, inv = [];
    switch (op.op) {
      case 'add': {
        if (!hasOwn.call(op, 'value')) throw new Error("'add' needs a value at " + op.path);
        loc = locate(root, op.path, false);
        if (loc.parent === null) throw new Error('cannot replace the document root');
        if (Array.isArray(loc.parent)) { loc.parent.splice(loc.key, 0, clone(op.value)); inv.push({ op: 'remove', path: joinPointer(parsePointer(op.path).slice(0, -1).concat(String(loc.key))) }); }
        else {
          var existed = hasOwn.call(loc.parent, loc.key);
          var old = existed ? clone(loc.parent[loc.key]) : undefined;
          loc.parent[loc.key] = clone(op.value);
          inv.push(existed ? { op: 'replace', path: op.path, value: old } : { op: 'remove', path: op.path });
        }
        break;
      }
      case 'remove': {
        loc = locate(root, op.path, true);
        if (loc.parent === null) throw new Error('cannot remove the document root');
        var removed = clone(loc.value);
        if (Array.isArray(loc.parent)) loc.parent.splice(loc.key, 1); else delete loc.parent[loc.key];
        inv.push({ op: 'add', path: op.path, value: removed });
        break;
      }
      case 'replace': {
        if (!hasOwn.call(op, 'value')) throw new Error("'replace' needs a value at " + op.path);
        loc = locate(root, op.path, true);
        var prev = clone(loc.value);
        if (loc.parent === null) throw new Error('cannot replace the document root');
        loc.parent[loc.key] = clone(op.value);
        inv.push({ op: 'replace', path: op.path, value: prev });
        break;
      }
      case 'move': {
        // RFC 6902 §4.4: remove `from`, then add at `path`. The inverse is built from the inverses
        // of those two internal operations (a concrete index instead of '-', and the restoration
        // of any value the add overwrote), applied in reverse order. Atomic: when the add fails,
        // the remove is undone before rethrowing.
        if (op.path === op.from) { getAt(root, op.from); break; }
        if (op.path.indexOf(op.from + '/') === 0) throw new Error('cannot move into own child');
        var val = clone(getAt(root, op.from));
        var invRemove = applyOp(root, { op: 'remove', path: op.from });
        var invAdd;
        try { invAdd = applyOp(root, { op: 'add', path: op.path, value: val }); }
        catch (e) { applyOps(root, invRemove); throw e; }
        inv = invAdd.concat(invRemove);
        break;
      }
      case 'copy': {
        var cv = clone(getAt(root, op.from));
        var ci = applyOp(root, { op: 'add', path: op.path, value: cv });
        inv = ci;
        break;
      }
      case 'test': {
        if (!deepEqual(getAt(root, op.path), op.value)) throw new Error('test failed at ' + op.path);
        inv.push({ op: 'test', path: op.path, value: clone(op.value) });
        break;
      }
      default: throw new Error('unknown op ' + op.op);
    }
    return inv;
  }

  /**
   * Apply a patch list in place. Returns the inverse patch list (already in reverse order, i.e.
   * applying it restores the original document). On failure the ops already applied are rolled back.
   * @param {Object} root
   * @param {JsonPatch[]} patches
   * @returns {JsonPatch[]}
   */
  function applyOps(root, ops) { for (var i = 0; i < ops.length; i++) applyOp(root, ops[i]); }

  function applyPatch(root, patches) {
    if (!Array.isArray(patches)) throw new Error('patch must be an array');
    var inverse = [];
    for (var i = 0; i < patches.length; i++) {
      var inv;
      try {
        if (!patches[i] || typeof patches[i] !== 'object') throw new Error('invalid operation at index ' + i);
        inv = applyOp(root, patches[i]);
      } catch (e) {
        // roll back every op already applied (each inverse is exact, so this cannot fail on a
        // consistent document; a failure here is reported rather than masking the original error)
        try { applyOps(root, inverse); }
        catch (e2) { e.message += ' (rollback failed: ' + e2.message + ')'; }
        throw e;
      }
      inverse = inv.concat(inverse);
    }
    return inverse;
  }

  /** Inverse of a patch list against a document WITHOUT applying it (applies on a clone). */
  function invertPatch(root, patches) { return applyPatch(clone(root), patches); }

  /* ------------------------------------------------------------------ emitter */

  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); var self = this; return function () { self.off(ev, fn); }; };
  Emitter.prototype.off = function (ev, fn) { var l = this._h[ev]; if (!l) return; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  Emitter.prototype.emit = function (ev, payload) { var l = (this._h[ev] || []).slice(); for (var i = 0; i < l.length; i++) l[i](payload); };

  /* ------------------------------------------------------------------ history */

  /**
   * @param {Object} [opts]
   * @param {number} [opts.max]            max transactions (default 1000)
   * @param {number} [opts.coalesceWindow] ms (default 500)
   * @param {function():number} [opts.now] clock (for tests)
   */
  function History(opts) {
    opts = opts || {};
    this.max = opts.max || MAX_HISTORY;
    this.coalesceWindow = opts.coalesceWindow === undefined ? COALESCE_WINDOW_MS : opts.coalesceWindow;
    this.now = opts.now || function () { return Date.now(); };
    this.undoStack = [];
    this.redoStack = [];
    this.events = new Emitter();
    this._seq = 0;
  }
  History.prototype.on = function (ev, fn) { return this.events.on(ev, fn); };

  /**
   * Apply `patches` to `doc` and record the transaction. Consecutive commits sharing a
   * `coalesceKey` within the coalescing window are merged into one transaction.
   * @returns {Transaction}
   */
  History.prototype.commit = function (doc, patches, opts) {
    opts = opts || {};
    var inverse = applyPatch(doc, patches);
    var at = this.now();
    var last = this.undoStack[this.undoStack.length - 1];
    var tx;
    if (opts.coalesceKey && last && last.coalesceKey === opts.coalesceKey && at - last.at <= this.coalesceWindow) {
      last.patches = last.patches.concat(patches);
      last.inverse = inverse.concat(last.inverse);
      last.at = at;
      if (opts.label) last.label = opts.label;
      tx = last;
    } else {
      tx = { id: 'tx' + (++this._seq), label: opts.label || '', patches: patches.slice(), inverse: inverse, at: at, coalesceKey: opts.coalesceKey };
      this.undoStack.push(tx);
      if (this.undoStack.length > this.max) this.undoStack.splice(0, this.undoStack.length - this.max);
    }
    this.redoStack.length = 0;
    this.events.emit('change', { type: 'commit', transaction: tx, patches: patches, doc: doc });
    return tx;
  };
  History.prototype.canUndo = function () { return this.undoStack.length > 0; };
  History.prototype.canRedo = function () { return this.redoStack.length > 0; };
  History.prototype.undo = function (doc) {
    var tx = this.undoStack.pop(); if (!tx) return null;
    try { applyPatch(doc, tx.inverse); }
    catch (e) { this.undoStack.push(tx); throw e; }   // applyPatch rolled back: history unchanged
    this.redoStack.push(tx);
    this.seal();   // the transaction now on top must not absorb the next coalescing commit
    this.events.emit('change', { type: 'undo', transaction: tx, patches: tx.inverse, doc: doc });
    return tx;
  };
  History.prototype.redo = function (doc) {
    var tx = this.redoStack.pop(); if (!tx) return null;
    try { applyPatch(doc, tx.patches); }
    catch (e) { this.redoStack.push(tx); throw e; }
    this.undoStack.push(tx);
    this.seal();
    this.events.emit('change', { type: 'redo', transaction: tx, patches: tx.patches, doc: doc });
    return tx;
  };
  /** Break coalescing: the next commit always starts a new transaction. */
  History.prototype.seal = function () { var last = this.undoStack[this.undoStack.length - 1]; if (last) last.coalesceKey = undefined; };
  History.prototype.clear = function () { this.undoStack.length = 0; this.redoStack.length = 0; };

  /* ------------------------------------------------------------------ patch builders (convenience) */

  function nodePath(id, prop) { return '/nodes/' + escape(id) + (prop ? '/' + prop.split('.').map(escape).join('/') : ''); }
  /** replace (or add if missing) a property of a node: setNodeProp(doc, id, 'geometry.x', 10) → patch */
  function setProp(doc, id, prop, value) {
    var path = nodePath(id, prop);
    return { op: hasPath(doc, path) ? 'replace' : 'add', path: path, value: value };
  }

  return {
    MAX_HISTORY: MAX_HISTORY, COALESCE_WINDOW_MS: COALESCE_WINDOW_MS,
    applyPatch: applyPatch, invertPatch: invertPatch, applyOp: applyOp, getAt: getAt, hasPath: hasPath, deepEqual: deepEqual,
    parsePointer: parsePointer, joinPointer: joinPointer, escapePointer: escape,
    Emitter: Emitter, History: History, nodePath: nodePath, setProp: setProp
  };
});
