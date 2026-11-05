/* DualEngine — text.js
 * Pluggable text measurer (§2.7, §3.6).
 *
 *   measurer.measureText(text, style, availableWidth, opts) → {
 *     width, height, lines: [{ text, width, y, baseline }], lineHeight, firstBaseline,
 *     ascent, descent, contentHeight, paragraphs
 *   }
 *
 * The line breaker is shared (UAX #14 simplified: break after spaces and hyphens, CJK per
 * character, `overflow-wrap: anywhere` fallback inside over-long words; trailing spaces hang).
 * Two primitives back it:
 *   - createTableMeasurer(tables)   Node fallback: advances + kerning pairs from text-metrics.js
 *   - createCanvasMeasurer(ctx)     browser: canvas measureText (same shaper as the page)
 * `line-height: normal` reproduces Blink: round(ascent) + round(descent) + round(lineGap) at the
 * font size, metrics from hhea (ascender/descender/lineGap per units-per-em); explicit metrics can
 * be passed per family through `opts.fonts`.
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js'), textMetrics: safeRequire('./text-metrics.js') } : global.DualEngine;
  function safeRequire(p) { try { return require(p); } catch (e) { return null; } }
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).text = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model;
  var TABLES = DE.textMetrics ? DE.textMetrics.fonts : {};

  /* Fallback vertical metrics when a family is unknown (Inter-like proportions). */
  var GENERIC_METRICS = { upm: 1000, ascender: 969, descender: -241, lineGap: 0 };

  /* Font used by Blink (fontconfig) for CJK glyphs missing from the primary family (the fixture
   * fonts have none): WenQuanYi Zen Hei (hhea read with fontTools). It widens the line box when
   * `line-height: normal` and supplies the advances (kanji/punctuation 1024/1024 em, kana 1048). */
  var CJK_FALLBACK = { family: 'WenQuanYi Zen Hei', upm: 1024, ascender: 986, descender: -304, lineGap: 92 };
  var KANA = /[\u3041-\u30ff]/;
  function cjkAdvanceEm(ch) { return KANA.test(ch) ? 1048 / 1024 : 1; }

  function fontMetricsFor(family, fonts) {
    var f = (fonts && fonts[family]) || TABLES[family];
    if (f) return { upm: f.upm, ascender: f.ascender, descender: f.descender, lineGap: f.lineGap || 0 };
    return GENERIC_METRICS;
  }

  /** Blink's integer ascent/descent and `line-height: normal` for a style. */
  function verticalMetrics(style, fonts) {
    var m = fontMetricsFor(style.family, fonts), s = style.size;
    var asc = Math.round(m.ascender * s / m.upm);
    var desc = Math.round(-m.descender * s / m.upm);
    var gap = Math.round((m.lineGap || 0) * s / m.upm);
    var normal = asc + desc + gap;
    var lh = normal;
    var LH = style.lineHeight || { unit: 'auto' };
    if (LH.unit === 'px') lh = LH.value;
    else if (LH.unit === '%') lh = s * LH.value / 100;
    return { ascent: asc, descent: desc, lineGap: gap, normal: normal, lineHeight: lh, baseline: (lh - (asc + desc)) / 2 + asc };
  }

  /**
   * Line box of a line that contains fallback (CJK) glyphs with `line-height: normal`: each font's
   * inline box is ascent + half-leading above and descent + half-leading below the baseline; the
   * line box is the union (CSS 2.1 §10.8). Returns null when the line needs no fallback.
   */
  function fallbackLineMetrics(str, style, vm, fonts) {
    var LH = style.lineHeight || { unit: 'auto' };
    if (LH.unit !== 'auto' || !CJK.test(str)) return null;
    var f = (fonts && fonts.cjkFallback) || CJK_FALLBACK, s = style.size;
    var fa = Math.round(f.ascender * s / f.upm), fd = Math.round(-f.descender * s / f.upm), fg = Math.round((f.lineGap || 0) * s / f.upm);
    var above = Math.max(vm.ascent + vm.lineGap / 2, fa + fg / 2), below = Math.max(vm.descent + vm.lineGap / 2, fd + fg / 2);
    var h = Math.round(above + below);
    if (h <= vm.lineHeight) return null;
    return { lineHeight: h, baseline: Math.round(above) };
  }

  function applyCase(str, mode) {
    if (mode === 'upper') return str.toUpperCase();
    if (mode === 'lower') return str.toLowerCase();
    if (mode === 'title') return str.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    return str;
  }
  function letterSpacingPx(style) {
    var ls = style.letterSpacing; if (!ls || !ls.value) return 0;
    return ls.unit === '%' ? style.size * ls.value / 100 : ls.value;
  }

  /* ------------------------------------------------------------------ segmentation */

  var CJK = /[\u1100-\u11ff\u2e80-\u2fff\u3000-\u303f\u3040-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

  /**
   * Split a paragraph into chunks { word, spaces } where `spaces` are the trailing hangable spaces.
   * Break opportunities: after spaces, after '-' (kept on the line), between CJK characters.
   */
  function segment(text) {
    var chunks = [], word = '', spaces = '', breakAfter = false;
    function flush() { if (word.length || spaces.length) chunks.push({ word: word, spaces: spaces }); word = ''; spaces = ''; breakAfter = false; }
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ' ' || ch === '\t') { spaces += ch; continue; }       // trailing spaces hang on the chunk
      if (spaces.length || breakAfter) flush();
      if (CJK.test(ch)) { if (word.length) flush(); word = ch; breakAfter = true; continue; }
      word += ch;
      if (ch === '-' || ch === '\u2010' || ch === '\u2013') breakAfter = true;
    }
    flush();
    return chunks;
  }

  /* ------------------------------------------------------------------ shared line breaker */

  /**
   * @param {{measureString:function(string,Object):number, fonts?:Object}} prim
   */
  function createMeasurer(prim) {
    var measureString = prim.measureString;
    var fonts = prim.fonts;

    /**
     * Width of a line prefix. Tabs (white-space: pre / pre-wrap) advance to the next tab stop:
     * tab-size 8 × (space advance + letter-spacing), measured from the line start; a stop closer
     * than half a space is skipped (Blink's minimum tab width).
     */
    function measure(str, style) {
      if (!str.length) return 0;
      if (str.indexOf('\t') < 0) return measureString(str, style);
      var sp = measureString(' ', style), T = 8 * sp, parts = str.split('\t'), x = 0;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].length) x += measureString(parts[i], style);
        if (i < parts.length - 1 && T > 0) { var d = T - (x % T); if (d < Math.max(sp / 2, 0.5)) d += T; x += d; }
      }
      return x;
    }

    /** Break one paragraph (plain string, single style) into lines for an available width. */
    function breakParagraph(text, style, avail, wrap, anywhere) {
      if (!wrap || !isFinite(avail)) return [text];
      var chunks = segment(text), lines = [], line = '', lineTrail = '';
      var EPS = 1 / 64;
      function pushLine() { lines.push(line); line = ''; lineTrail = ''; }
      for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        var candidate = line + lineTrail + c.word;
        var w = measure(candidate, style);
        if (w <= avail + EPS || (line.length === 0 && lineTrail.length === 0)) {
          if (w > avail + EPS && anywhere && c.word.length > 1) {
            // over-long word on an empty line: break anywhere
            var part = '';
            for (var k = 0; k < c.word.length; k++) {
              var t = part + c.word.charAt(k);
              if (measure(t, style) > avail + EPS && part.length) { lines.push(part); part = c.word.charAt(k); }
              else part = t;
            }
            line = part; lineTrail = c.spaces;
          } else { line = candidate; lineTrail = c.spaces; }
        } else if (line.length === 0 && lineTrail.length) {
          // only spaces so far (hanging) then a word that does not fit alone
          line = candidate; lineTrail = c.spaces;
        } else {
          pushLine();
          i--; // retry the chunk on a fresh line
        }
      }
      if (line.length || !lines.length) lines.push(line);
      return lines;
    }

    /**
     * @param {Object|string} text  RichText or plain string
     * @param {Object} style        TextStyle (base)
     * @param {number} availableWidth px (Infinity when not wrapping)
     * @param {Object} [opts] { mode: 'autoWidth'|'autoHeight'|'fixed', truncateLines, height }
     */
    /*
     * Results are memoised by content (text, style, width, mode): identical texts — repeated
     * component instances, the same node at several breakpoints — are measured once. The returned
     * object is shared and must be treated as immutable. `opts.contentKey` (a signature of text +
     * style the caller keeps up to date, e.g. per layout invalidation) avoids re-serialising them.
     */
    var memo = new Map(), MEMO_MAX = 20000;
    function measureText(text, style, availableWidth, opts) {
      opts = opts || {};
      var key;
      try { key = (opts.contentKey || JSON.stringify([text, style])) + '\u0001' + availableWidth + '|' + (opts.mode || 'autoWidth') + '|' + (opts.truncateLines || 0) + '|' + (opts.mode === 'fixed' ? opts.height : 0); } catch (e) { key = null; }
      if (key !== null) {
        var hit = memo.get(key);
        if (hit) return hit;
        var res = measureTextUncached(text, style, availableWidth, opts);
        if (memo.size >= MEMO_MAX) memo.clear();
        memo.set(key, res);
        return res;
      }
      return measureTextUncached(text, style, availableWidth, opts);
    }
    function measureTextUncached(text, style, availableWidth, opts) {
      var mode = opts.mode || 'autoWidth';
      var wrap = mode !== 'autoWidth';
      var vm = verticalMetrics(style, fonts);
      var paragraphs = typeof text === 'string' ? text.split('\n').map(function (p) { return { runs: [{ text: p }] }; }) : (text && text.paragraphs) || [];
      var lines = [], width = 0, y = 0, pSpacing = style.paragraphSpacing || 0;
      var outParagraphs = [];
      for (var p = 0; p < paragraphs.length; p++) {
        // runs: concatenated with the base style (run style differences are measured per run only
        // when the paragraph is a single run — multi-style lines use the base style for breaking)
        var runs = paragraphs[p].runs || [];
        var pStyle = runs.length === 1 && runs[0].style ? Object.assign({}, style, runs[0].style) : style;
        var pText = applyCase(runs.map(function (r) { return r.text; }).join(''), pStyle.case);
        var pvm = pStyle === style ? vm : verticalMetrics(pStyle, fonts);
        var indent = (pStyle.paragraphIndent || 0);
        var pLines = breakParagraph(pText, pStyle, wrap ? availableWidth - indent : Infinity, wrap, mode !== 'autoWidth');
        var startLine = lines.length;
        // multi-run single-line paragraph: sum of the runs measured with their own style
        var multiRunWidth = null;
        if (runs.length > 1 && pLines.length === 1) {
          multiRunWidth = 0;
          runs.forEach(function (r) { var rs = r.style ? Object.assign({}, style, r.style) : style; multiRunWidth += measure(applyCase(r.text, rs.case), rs); });
        }
        for (var i = 0; i < pLines.length; i++) {
          var lw = (multiRunWidth !== null ? multiRunWidth : measure(pLines[i], pStyle)) + (i === 0 ? indent : 0);
          var fb = fallbackLineMetrics(pLines[i], pStyle, pvm, fonts);
          var lh = fb ? fb.lineHeight : pvm.lineHeight;
          lines.push({ text: pLines[i], width: lw, y: y, baseline: y + (fb ? fb.baseline : pvm.baseline), lineHeight: lh, paragraph: p });
          width = Math.max(width, lw);
          y += lh;
        }
        outParagraphs.push({ lines: lines.length - startLine, lineHeight: pvm.lineHeight });
        if (p < paragraphs.length - 1) y += pSpacing;
      }
      var contentHeight = y;
      var height = contentHeight;
      if (opts.truncateLines && lines.length > opts.truncateLines) height = lines.slice(0, opts.truncateLines).reduce(function (a, l) { return a + l.lineHeight; }, 0);
      if (mode === 'fixed' && opts.height !== undefined) height = opts.height;
      return {
        width: mode === 'autoWidth' ? width : (isFinite(availableWidth) ? availableWidth : width),
        maxContentWidth: width,
        height: height, contentHeight: contentHeight,
        lines: lines, lineHeight: vm.lineHeight, ascent: vm.ascent, descent: vm.descent,
        firstBaseline: lines.length ? lines[0].baseline : vm.baseline,
        paragraphs: outParagraphs
      };
    }

    return { measureText: measureText, measureString: measureString, verticalMetrics: function (s) { return verticalMetrics(s, fonts); }, kind: prim.kind || 'custom' };
  }

  /* ------------------------------------------------------------------ Node fallback: metric tables */

  function nearestWeight(weights, w) {
    var keys = Object.keys(weights).map(Number).sort(function (a, b) { return a - b; });
    var best = keys[0];
    for (var i = 0; i < keys.length; i++) if (Math.abs(keys[i] - w) < Math.abs(best - w)) best = keys[i];
    return best;
  }
  function createTableMeasurer(tables, extraFonts) {
    tables = tables || TABLES;
    var cache = {};
    function tableFor(style) {
      var fam = tables[style.family] || tables.Inter || tables[Object.keys(tables)[0]];
      if (!fam) return null;
      var key = style.family + '/' + style.weight;
      if (cache[key]) return cache[key];
      var t = fam.weights[nearestWeight(fam.weights, style.weight || 400)];
      cache[key] = t;
      return t;
    }
    function measureString(str, style) {
      var t = tableFor(style);
      var size = style.size, ls = letterSpacingPx(style);
      if (!t) return str.length * size * 0.5 + ls * str.length;
      var w = 0, prev = null, avgAdv = t.adv['n'] || 540;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '\u00a0') ch = ' '; // NBSP: the space glyph (it only differs for line breaking)
        var a = t.adv[ch]; if (a === undefined) a = CJK.test(ch) ? cjkAdvanceEm(ch) * 1000 : avgAdv;
        w += a;
        if (prev !== null) { var k = t.kern[prev + ch]; if (k) w += k; }  // Blink keeps kerning with letter-spacing (only ligatures are disabled)
        prev = ch;
      }
      return w * size / 1000 + ls * str.length;
    }
    return createMeasurer({ measureString: measureString, fonts: extraFonts, kind: 'table' });
  }

  /* ------------------------------------------------------------------ browser: canvas measureText */

  function createCanvasMeasurer(ctx, extraFonts) {
    if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    function fontString(style) {
      return (style.italic ? 'italic ' : '') + (style.weight || 400) + ' ' + style.size + 'px ' + JSON.stringify(style.family) + ', sans-serif';
    }
    function measureString(str, style) {
      ctx.font = fontString(style);
      var ls = letterSpacingPx(style);
      if ('letterSpacing' in ctx) { ctx.letterSpacing = ls + 'px'; return ctx.measureText(str).width; }
      return ctx.measureText(str).width + ls * str.length;
    }
    return createMeasurer({ measureString: measureString, fonts: extraFonts, kind: 'canvas' });
  }

  /** Default measurer for the current environment. */
  function defaultMeasurer() {
    if (typeof document !== 'undefined' && document.createElement) { try { return createCanvasMeasurer(); } catch (e) { /* fall through */ } }
    return createTableMeasurer();
  }

  return {
    createMeasurer: createMeasurer, createTableMeasurer: createTableMeasurer, createCanvasMeasurer: createCanvasMeasurer, defaultMeasurer: defaultMeasurer,
    verticalMetrics: verticalMetrics, fallbackLineMetrics: fallbackLineMetrics, CJK_FALLBACK: CJK_FALLBACK, segment: segment, applyCase: applyCase, letterSpacingPx: letterSpacingPx, fontMetricsFor: fontMetricsFor,
    tables: TABLES
  };
});
