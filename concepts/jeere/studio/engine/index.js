/* DualEngine — index.js
 * Assembles the engine. Load order (classic scripts, browser):
 *   model.js, history.js, resolve.js, text-metrics.js, text.js, layout.js, motion.js, css.js,
 *   html.js, raster.js, index.js          → window.DualEngine
 * Node: require('./index.js') → the same object (module.exports).
 */
(function (global) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var DE;
  if (isNode) {
    DE = {
      model: require('./model.js'), history: require('./history.js'), resolve: require('./resolve.js'),
      textMetrics: require('./text-metrics.js'), text: require('./text.js'), layout: require('./layout.js'),
      motion: require('./motion.js'), css: require('./css.js'), html: require('./html.js'), raster: require('./raster.js')
    };
  } else DE = global.DualEngine = global.DualEngine || {};

  DE.version = '1.1.0-phaseA';
  DE.SCRIPTS = ['model.js', 'history.js', 'resolve.js', 'text-metrics.js', 'text.js', 'layout.js', 'motion.js', 'css.js', 'html.js', 'raster.js', 'index.js'];

  /**
   * Full export: layouts for every breakpoint + CSS + HTML.
   * @param {Object} doc
   * @param {Object} [opts] { measurer, kBlur, page, debugIds, rootPlacement }
   */
  DE.exportDocument = function (doc, opts) {
    opts = opts || {};
    var issues = DE.model.validateDocument(doc), errors = issues.filter(function (e) { return e.level === 'error'; });
    if (errors.length) throw new Error('invalid document: ' + errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
    var measurer = opts.measurer || DE.text.defaultMeasurer();
    var engine = new DE.layout.LayoutEngine(doc, { measurer: measurer, rootPlacement: 'flow' });
    var layouts = engine.layoutAll(opts.page);
    var gen = DE.css.generate(doc, { layouts: layouts, kBlur: opts.kBlur, page: opts.page, engine: engine });
    var out = DE.html.emit(doc, { css: gen.css, layouts: layouts, page: opts.page, debugIds: opts.debugIds, wrappers: gen.wrappers });
    // validation warnings (token alias cycles, negative gaps, coordinates beyond Blink's range…)
    var warnings = issues.filter(function (e) { return e.level === 'warning'; })
      .map(function (e) { return { node: null, code: 'validate', message: e.path + ' ' + e.message, breakpoint: null, state: null }; });
    return { html: out.html, body: out.body, css: gen.css, rules: gen.rules, layouts: layouts, warnings: warnings.concat(gen.warnings), engine: engine };
  };

  /** Convenience: a layout engine bound to a document with the environment's default measurer. */
  DE.createEngine = function (doc, opts) {
    opts = opts || {};
    return new DE.layout.LayoutEngine(doc, Object.assign({ measurer: DE.text.defaultMeasurer() }, opts));
  };

  if (isNode) module.exports = DE;
})(typeof window !== 'undefined' ? window : globalThis);
