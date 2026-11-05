/* DualEngine — html.js
 * HTML emission (§3.7): one element per node (semantic tag, class de-xxxxxxxx + user classes,
 * attributes), nesting, <img src alt>, text paragraphs / runs → spans, squircle+shadow wrapper,
 * inline SVG for vector nodes, full document with the generated CSS (the
 * prefers-reduced-motion block is part of the CSS, css.js).
 *
 * The markup is emitted without whitespace between elements: whitespace would create anonymous
 * inline boxes inside block containers and break the pixel contract.
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js'), resolve: require('./resolve.js'), css: require('./css.js') } : global.DualEngine;
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).html = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model, R = DE.resolve, C = DE.css;

  function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  var VOID = { img: 1, input: 1, br: 1, hr: 1 };

  function assetUrl(doc, id) { var a = doc.assets && doc.assets[id]; return a ? (a.url || a.src || a.data || '') : (id || ''); }

  function attrs(node, cls, extra) {
    var sem = node.semantic || { tag: 'div', attrs: {} };
    var a = Object.assign({}, sem.attrs || {}, extra || {});
    var classes = [cls].concat(sem.className ? String(sem.className).split(/\s+/).filter(Boolean) : []);
    var out = ' class="' + escAttr(classes.join(' ')) + '"';
    Object.keys(a).forEach(function (k) { if (k !== 'class' && a[k] !== undefined && a[k] !== null) out += ' ' + k + '="' + escAttr(a[k]) + '"'; });
    return out;
  }

  function runSpan(cls, p, i, run, hasStyle) {
    var txt = escText(run.text);
    if (!hasStyle) return txt;
    return '<span class="' + cls + '-r' + p + '-' + i + '">' + txt + '</span>';
  }

  /**
   * Paragraphs → spans. An empty paragraph (blank line, trailing newline, empty text) holds a <br>
   * so that it keeps its line box, as in the engine (and in Figma) — an empty block collapses.
   */
  function textContent(node, cls) {
    var rt = node.text, paras = (rt && rt.paragraphs) || [];
    if (!paras.length) paras = [{ runs: [] }];
    var multi = paras.length > 1;
    return paras.map(function (p, pi) {
      var inner = (p.runs || []).map(function (r, ri) { return runSpan(cls, pi, ri, r, !!r.style); }).join('');
      var empty = !(p.runs || []).some(function (r) { return r.text && r.text.length; });
      if (empty) inner += '<br>';
      return multi ? '<span class="de-para">' + inner + '</span>' : inner;
    }).join('');
  }

  function vectorSVG(node) {
    var g = node.geometry, net = node.network || {};
    var paths = (net.paths || []).map(function (p) {
      return '<path d="' + escAttr(p.d) + '" fill="' + escAttr(p.fill || 'none') + '"' + (p.stroke ? ' stroke="' + escAttr(p.stroke) + '" stroke-width="' + (p.strokeWidth || 1) + '" vector-effect="non-scaling-stroke"' : '') + ' fill-rule="' + (node.fillRule || 'nonzero') + '"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + C.num(g.w) + ' ' + C.num(g.h) + '" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">' + paths + '</svg>';
  }

  /** Markup of one node (recursive). */
  function emitNode(doc, node, opts) {
    var cls = model.classOf(node.id);
    var tag = (node.semantic && node.semantic.tag) || 'div';
    var wrapper = opts.wrappers ? !!opts.wrappers[node.id] : C.nodeDeclarations(doc, node, 'base', undefined, { layouts: opts.layouts, warnings: [] }).wrapper;
    var extra = {};
    if (opts.debugIds) extra['data-de'] = node.id;
    var children = '';
    if (node.type === 'text') { if (tag === 'img') tag = 'p'; children = textContent(node, cls); }
    else if (node.type === 'image') {
      if (tag !== 'img') tag = 'img';
      extra.src = assetUrl(doc, node.asset); extra.alt = node.alt || '';
      var a = doc.assets && doc.assets[node.asset];
      if (a && a.width && a.height) { extra.width = String(a.width); extra.height = String(a.height); }
    } else if (node.type === 'vector') children = vectorSVG(node);
    else if (node.type === 'line') // §3.4: lines are SVG strokes (caps, dashes); stroke props come from the CSS (.cls-s)
      // (height 1, not 0: a zero-sized <svg> is not rendered; the line box itself stays 0 high)
      children = '<svg class="de-svg" width="100%" height="1" aria-hidden="true"><line class="' + cls + '-s" x1="0" y1="0" x2="100%" y2="0"/></svg>';
    else if (node.children) children = node.children.map(function (cid) { var c = doc.nodes[cid]; return c ? emitNode(doc, c, opts) : ''; }).join('');
    if (tag === 'img' && node.type !== 'image') tag = 'div';
    if (node.type === 'image' && wrapper) {
      // <img> is void: a squircle photo with a drop shadow is an unclipped <div> (the shadow) holding
      // the clipped <img class="…-in"> (§3.2 wrapper)
      var imgAttrs = ' class="' + cls + '-in" src="' + escAttr(extra.src) + '" alt="' + escAttr(extra.alt) + '"' + (extra.width ? ' width="' + escAttr(extra.width) + '" height="' + escAttr(extra.height) + '"' : '');
      delete extra.src; delete extra.alt; delete extra.width; delete extra.height;
      var semAttrs = Object.assign({}, node.semantic.attrs || {}); delete semAttrs.alt;
      return '<div' + attrs({ semantic: { tag: 'div', attrs: semAttrs, className: node.semantic.className } }, cls, extra) + '><img' + imgAttrs + '></div>';
    }
    if (tag === 'a' && !(extra.href || (node.semantic.attrs && node.semantic.attrs.href))) extra.href = '#';
    if (tag === 'button') extra.type = extra.type || (node.semantic.attrs && node.semantic.attrs.type) || 'button';
    var open = '<' + tag + attrs(node, cls, extra) + '>';
    if (VOID[tag]) return open;
    if (wrapper) children = '<div class="' + cls + '-in">' + children + '</div>';
    return open + children + '</' + tag + '>';
  }

  /**
   * @param {Object} doc
   * @param {Object} [opts] { page, css (string; generated when absent), layouts, lang, title, debugIds, bodyOnly }
   * @returns {{html:string, body:string, css:string, warnings:Array}}
   */
  function emit(doc, opts) {
    opts = opts || {};
    var page = opts.page || doc.pages[0];
    var gen = opts.css === undefined ? C.generate(doc, { layouts: opts.layouts, measurer: opts.measurer, kBlur: opts.kBlur, page: page }) : null;
    var css = gen ? gen.css : opts.css;
    var layouts = opts.layouts || (gen && gen.layouts);
    var wrappers = opts.wrappers || (gen && gen.wrappers) || null;
    var body = page.children.map(function (id) { var n = doc.nodes[id]; return n ? emitNode(doc, n, { layouts: layouts, debugIds: opts.debugIds, wrappers: wrappers }) : ''; }).join('');
    var html = '<!DOCTYPE html><html lang="' + escAttr(opts.lang || 'fr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escText(opts.title || doc.name || 'DualEngine') + '</title><style>\n' + css + '</style></head><body>' + body + '</body></html>';
    return { html: html, body: body, css: css, warnings: gen ? gen.warnings : [] };
  }

  return { emit: emit, emitNode: emitNode, escText: escText, escAttr: escAttr, textContent: textContent };
});
