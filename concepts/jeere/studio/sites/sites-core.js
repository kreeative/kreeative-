/* Jeere Studio › Mes sites — the core, without any UI: read a hand-written HTML page as SOURCE TEXT,
 * map every element of the live page (the artboard iframe) to its exact place in that text, and
 * change only the bytes an edit touches. Nothing is ever re-serialised: the doctype, the head, the
 * scripts, the comments and the formatting of everything she did not edit stay byte-identical.
 *
 *   parse(text)              → a tree of the source: elements (start, openEnd, closeStart, end, attrs
 *                              with their value ranges), text nodes and comments, all as offsets.
 *                              Follows the HTML parsing rules hand-written sites rely on (void and
 *                              raw-text elements, implied </p> </li> </td> …, SVG self-closing tags).
 *   align(tree, document)    → the live element ↔ source element maps (LCS on each child list, by tag
 *                              and id, so elements added by the page's own scripts are simply skipped).
 *   edits: setAttr, setStyle, replaceInner, replaceOuter, remove, duplicate, textEdits/applyText
 *                              (a changed text node is patched character-exactly: common prefix and
 *                              suffix kept, entities of untouched text kept), setTitle, setMeta.
 *   gitBlobSha(bytes)        → the git blob id (sha-1 of "blob <n>\0" + bytes), the version check.
 *   zip(files)               → a .zip in the « stored » format (no compression), built by hand.
 *
 * Classic script, no dependency: window.JeereSitesCore (and module.exports for Node tests).
 */
(function (root) {
  'use strict';

  function set(list) { var o = Object.create(null); list.split(' ').forEach(function (k) { o[k] = true; }); return o; }
  var VOID = set('area base br col embed hr img input link meta param source track wbr keygen');
  var RAW = set('script style textarea title xmp noscript noembed noframes iframe');
  var CLOSES_P = set('address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul');
  var SCOPE = set('html table td th caption marquee object applet template button');
  var HEADINGS = set('h1 h2 h3 h4 h5 h6');
  var INLINE = set('a abbr b bdi bdo br cite code data dfn em i kbd mark q s samp small span strong sub sup time u var wbr del ins font');

  function isLetter(ch) { return !!ch && /[A-Za-z]/.test(ch); }

  /* ================================================================ entities */

  var ENT = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
    rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
    mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•', deg: '°', times: '×', divide: '÷', minus: '−', plusmn: '±',
    euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', dagger: '†', Dagger: '‡', prime: '′', Prime: '″',
    larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', hearts: '♥', star: '☆',
    thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '‍', zwnj: '‌', shy: '­', nbhy: '‑',
    agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
    egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
    ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', oelig: 'œ',
    ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
    Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
    Icirc: 'Î', Iuml: 'Ï', Ocirc: 'Ô', Ouml: 'Ö', OElig: 'Œ', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
    iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾', micro: 'µ',
    hyphen: '‐', dash: '‐', lowast: '∗', infin: '∞', ne: '≠', le: '≤', ge: '≥', asymp: '≈', sum: '∑', radic: '√'
  };
  var LEGACY = set('amp lt gt quot nbsp copy reg'); // also understood without the « ; »
  var extDecode = null; // the browser's own decoder for the rare named entity not in the table
  function decodeEntity(name) {
    if (Object.prototype.hasOwnProperty.call(ENT, name)) return ENT[name];
    if (extDecode) { var v = extDecode('&' + name + ';'); if (v && v !== '&' + name + ';') return v; }
    return null;
  }

  // Decode raw text (a text node, an attribute value) and keep, for every output character, the raw
  // offset it came from: map[i] = start of the raw run of output char i; map[out.length] = raw end.
  function decodeMap(raw) {
    var out = '', map = [], i = 0, n = raw.length;
    while (i < n) {
      var ch = raw.charAt(i);
      if (ch === '&') {
        var m = /^&(#[xX][0-9a-fA-F]{1,6};?|#[0-9]{1,7};?|[A-Za-z][A-Za-z0-9]{0,31};?)/.exec(raw.slice(i, i + 40));
        if (m) {
          var body = m[1], val = null;
          if (body.charAt(0) === '#') {
            var num = body.charAt(1) === 'x' || body.charAt(1) === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            if (num > 0 && num < 0x110000) { try { val = String.fromCodePoint(num); } catch (e) { val = null; } }
          } else if (body.charAt(body.length - 1) === ';') {
            val = decodeEntity(body.slice(0, -1));
          } else if (LEGACY[body]) {
            val = ENT[body];
          }
          if (val !== null) {
            for (var k = 0; k < val.length; k++) { map.push(i); }
            out += val; i += m[0].length; continue;
          }
        }
      }
      map.push(i); out += ch; i++;
    }
    map.push(n);
    return { str: out, map: map };
  }
  function decode(raw) { return decodeMap(raw).str; }

  function escText(s, nbspEntity) {
    s = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return nbspEntity ? s.replace(/ /g, '&nbsp;') : s;
  }
  function escAttr(s, quote) {
    s = String(s).replace(/&/g, '&amp;');
    return quote === "'" ? s.replace(/'/g, '&#39;') : s.replace(/"/g, '&quot;');
  }

  /* ================================================================ the tokenizer + tree */

  function readStartTag(text, lt) {
    var n = text.length, p = lt + 1;
    var m = /^[^\s\/>]+/.exec(text.slice(p, p + 200));
    var name = m[0];
    p += name.length;
    var attrs = [], selfClosing = false;
    for (;;) {
      while (p < n && /\s/.test(text.charAt(p))) p++;
      if (p >= n) break;
      var ch = text.charAt(p);
      if (ch === '>') { p++; break; }
      if (ch === '/') {
        if (text.charAt(p + 1) === '>') { selfClosing = true; p += 2; break; }
        p++; continue;
      }
      var a = { start: p };
      var nm = /^[^\s"'>\/=]+|^[^\s>\/]/.exec(text.slice(p, p + 300));
      a.raw = nm[0]; a.name = a.raw.toLowerCase();
      p += a.raw.length; a.nameEnd = p;
      var q = p;
      while (q < n && /\s/.test(text.charAt(q))) q++;
      if (text.charAt(q) === '=') {
        q++;
        while (q < n && /\s/.test(text.charAt(q))) q++;
        var qc = text.charAt(q);
        if (qc === '"' || qc === "'") {
          var close = text.indexOf(qc, q + 1);
          if (close < 0) close = n;
          a.quote = qc; a.valStart = q + 1; a.valEnd = close; p = Math.min(n, close + 1);
        } else {
          var um = /^[^\s>]*/.exec(text.slice(q, q + 2000));
          a.quote = ''; a.valStart = q; a.valEnd = q + um[0].length; p = a.valEnd;
        }
        a.hasValue = true;
      } else {
        a.hasValue = false; a.valStart = a.valEnd = a.nameEnd; a.quote = null;
      }
      a.end = p;
      attrs.push(a);
    }
    return { name: name, attrs: attrs, selfClosing: selfClosing, end: p };
  }

  function parse(text) {
    text = String(text);
    var n = text.length;
    var doc = { type: 'root', tag: '#root', children: [], start: 0, end: n, openEnd: 0, closeStart: n, parent: null, text: text };
    var stack = [doc];
    var all = [];
    var ts = 0; // start of the pending text run

    function top() { return stack[stack.length - 1]; }
    function flushText(upto) {
      if (upto > ts) top().children.push({ type: 'text', start: ts, end: upto, parent: top() });
      ts = upto;
    }
    function inForeign() {
      for (var k = stack.length - 1; k > 0; k--) { var t = stack[k].tag; if (t === 'svg' || t === 'math') return true; if (t === 'foreignobject') return false; }
      return false;
    }
    function popTo(idx, at) { // implied close of every element above idx (and idx itself)
      while (stack.length - 1 >= idx) { var el = stack.pop(); if (el.end == null) { el.end = at; el.closeStart = null; el.implied = true; } }
    }
    function findOpen(tags, stops) {
      for (var k = stack.length - 1; k > 0; k--) {
        var t = stack[k].tag;
        if (tags[t]) return k;
        if (stops && stops[t]) return -1;
      }
      return -1;
    }
    function implyEnds(lname, at) {
      var k;
      if (CLOSES_P[lname]) { k = findOpen({ p: 1 }, SCOPE); if (k > 0) popTo(k, at); }
      if (HEADINGS[lname] && HEADINGS[top().tag]) popTo(stack.length - 1, at);
      if (lname === 'li') { k = findOpen({ li: 1 }, set('ul ol menu table td th')); if (k > 0) popTo(k, at); }
      if (lname === 'dt' || lname === 'dd') { k = findOpen({ dt: 1, dd: 1 }, set('dl table')); if (k > 0) popTo(k, at); }
      if (lname === 'option' || lname === 'optgroup') { if (top().tag === 'option') popTo(stack.length - 1, at); if (lname === 'optgroup' && top().tag === 'optgroup') popTo(stack.length - 1, at); }
      if (lname === 'tr') { k = findOpen({ tr: 1 }, set('table thead tbody tfoot')); if (k > 0) popTo(k, at); }
      if (lname === 'td' || lname === 'th') { k = findOpen({ td: 1, th: 1 }, set('tr table')); if (k > 0) popTo(k, at); }
      if (lname === 'thead' || lname === 'tbody' || lname === 'tfoot') { k = findOpen({ thead: 1, tbody: 1, tfoot: 1 }, set('table')); if (k > 0) popTo(k, at); }
    }

    var i = 0;
    while (i < n) {
      var lt = text.indexOf('<', i);
      if (lt < 0) break;
      var c1 = text.charAt(lt + 1);
      if (text.substr(lt, 4) === '<!--') {
        flushText(lt);
        var ce = text.indexOf('-->', lt + 4);
        ce = ce < 0 ? n : ce + 3;
        top().children.push({ type: 'comment', start: lt, end: ce, parent: top() });
        i = ts = ce; continue;
      }
      if (c1 === '!' || c1 === '?') {
        flushText(lt);
        var de = text.indexOf('>', lt);
        de = de < 0 ? n : de + 1;
        top().children.push({ type: 'doctype', start: lt, end: de, parent: top() });
        i = ts = de; continue;
      }
      if (c1 === '/' && isLetter(text.charAt(lt + 2))) {
        var em = /^<\/([^\s\/>]+)[^>]*>?/.exec(text.slice(lt, lt + 400));
        var ename = em[1].toLowerCase();
        var eend = lt + em[0].length;
        flushText(lt);
        var k = -1;
        for (var s = stack.length - 1; s > 0; s--) { if (stack[s].tag === ename) { k = s; break; } }
        if (k > 0) {
          popTo(k + 1, lt);
          var el = stack.pop();
          el.closeStart = lt; el.end = eend;
        }
        i = ts = eend; continue;
      }
      if (isLetter(c1)) {
        flushText(lt);
        var st = readStartTag(text, lt);
        var lname = st.name.toLowerCase();
        var foreign = inForeign() || lname === 'svg' || lname === 'math';
        if (!foreign) implyEnds(lname, lt);
        var node = {
          type: 'el', tag: lname, name: st.name, start: lt, openEnd: st.end, attrs: st.attrs, selfClosing: st.selfClosing,
          children: [], parent: top(), end: null, closeStart: null, foreign: foreign
        };
        top().children.push(node);
        all.push(node);
        if ((VOID[lname] && !foreign) || (foreign && st.selfClosing)) {
          node.end = st.end; node.closeStart = null; node.isVoid = true;
          i = ts = st.end; continue;
        }
        if (RAW[lname] && !foreign) {
          var re = new RegExp('</' + lname + '(?=[\\s/>])', 'ig');
          re.lastIndex = st.end;
          var rm = re.exec(text);
          var cs = rm ? rm.index : n;
          if (cs > st.end) node.children.push({ type: 'text', start: st.end, end: cs, parent: node, raw: true });
          var gt = rm ? text.indexOf('>', cs) : -1;
          node.closeStart = rm ? cs : null; node.end = rm ? (gt < 0 ? n : gt + 1) : n;
          node.isRaw = true;
          i = ts = node.end; continue;
        }
        stack.push(node);
        i = ts = st.end; continue;
      }
      i = lt + 1; // a lone « < »: part of the text
    }
    flushText(n);
    popTo(1, n);
    doc.elements = all;
    return doc;
  }

  /* ================================================================ reading the tree */

  function attr(el, name) {
    if (!el || !el.attrs) return null;
    for (var k = 0; k < el.attrs.length; k++) if (el.attrs[k].name === name) return el.attrs[k];
    return null;
  }
  function attrValue(text, el, name) {
    var a = attr(el, name);
    return a ? decode(text.slice(a.valStart, a.valEnd)) : null;
  }
  function innerEnd(el) { return el.closeStart != null ? el.closeStart : el.end; }
  function elChildren(el) { return el.children.filter(function (c) { return c.type === 'el'; }); }
  function find(tree, pred) { for (var k = 0; k < tree.elements.length; k++) if (pred(tree.elements[k])) return tree.elements[k]; return null; }
  function headOf(tree) { return find(tree, function (e) { return e.tag === 'head'; }); }
  function outer(text, el) { return text.slice(el.start, el.end); }

  /* ================================================================ live ↔ source alignment */

  function srcSig(text, el) { var id = attrValue(text, el, 'id'); return el.tag + (id ? '#' + id : ''); }
  function liveSig(el) { var id = el.getAttribute && el.getAttribute('id'); return String(el.localName || el.nodeName).toLowerCase() + (id ? '#' + id : ''); }
  function injected(el) { return !!(el.hasAttribute && el.hasAttribute('data-sk-inject')); }

  // Longest common subsequence of two signature lists → [[i, j], …]. Common prefix and suffix first,
  // the quadratic table only on the middle (child lists are short).
  function lcs(a, b) {
    var pairs = [], i0 = 0, a1 = a.length, b1 = b.length;
    while (i0 < a1 && i0 < b1 && a[i0] === b[i0]) { pairs.push([i0, i0]); i0++; }
    var tail = [];
    while (a1 > i0 && b1 > i0 && a[a1 - 1] === b[b1 - 1]) { a1--; b1--; tail.unshift([a1, b1]); }
    var m = a1 - i0, n = b1 - i0;
    if (m && n) {
      if (m * n > 250000) { // greedy, in order
        var j = i0;
        for (var x = i0; x < a1; x++) { for (var y = j; y < b1; y++) { if (a[x] === b[y]) { pairs.push([x, y]); j = y + 1; break; } } }
      } else {
        var L = [];
        for (var p = 0; p <= m; p++) { L.push(new Int32Array(n + 1)); }
        for (p = m - 1; p >= 0; p--) for (var q = n - 1; q >= 0; q--) {
          L[p][q] = a[i0 + p] === b[i0 + q] ? L[p + 1][q + 1] + 1 : Math.max(L[p + 1][q], L[p][q + 1]);
        }
        p = 0; q = 0;
        while (p < m && q < n) {
          if (a[i0 + p] === b[i0 + q]) { pairs.push([i0 + p, i0 + q]); p++; q++; }
          else if (L[p + 1][q] >= L[p][q + 1]) p++; else q++;
        }
      }
    }
    return pairs.concat(tail);
  }

  function align(tree, doc) {
    var text = tree.text;
    var s2l = new Map(), l2s = new WeakMap();
    function pair(s, l) {
      s2l.set(s, l); l2s.set(l, s);
      if (s.isRaw || s.isVoid) return;
      var sk = elChildren(s);
      var lk = [];
      var kids = l.children || [];
      var hasBody = s.tag === 'table' && sk.some(function (e) { return e.tag === 'tbody'; });
      for (var k = 0; k < kids.length; k++) {
        if (injected(kids[k])) continue;
        // <tr> written straight in a <table>: the browser wraps the rows in a <tbody> of its own
        if (s.tag === 'table' && !hasBody && String(kids[k].localName) === 'tbody') { Array.prototype.forEach.call(kids[k].children, function (x) { lk.push(x); }); continue; }
        lk.push(kids[k]);
      }
      if (!sk.length || !lk.length) return;
      var pairs = lcs(sk.map(function (e) { return srcSig(text, e); }), lk.map(liveSig));
      pairs.forEach(function (pq) { pair(sk[pq[0]], lk[pq[1]]); });
    }
    var html = find(tree, function (e) { return e.tag === 'html'; });
    if (html && doc.documentElement) pair(html, doc.documentElement);
    else if (doc.documentElement) { // no <html> written: its head and body are implied
      var tops = elChildren(tree);
      var head = doc.head, body = doc.body;
      var hs = tops.filter(function (e) { return /^(meta|title|link|style|script|base)$/.test(e.tag); });
      var bs = tops.filter(function (e) { return hs.indexOf(e) < 0; });
      [[hs, head], [bs, body]].forEach(function (g) {
        if (!g[1]) return;
        var lk = Array.prototype.filter.call(g[1].children, function (x) { return !injected(x); });
        lcs(g[0].map(function (e) { return srcSig(text, e); }), lk.map(liveSig)).forEach(function (pq) { pair(g[0][pq[0]], lk[pq[1]]); });
      });
    }
    return { s2l: s2l, l2s: l2s, tree: tree };
  }

  /* ================================================================ edits (each returns the new text) */

  function splice(text, s, e, str) { return text.slice(0, s) + str + text.slice(e); }
  function lineStart(text, at) { var k = text.lastIndexOf('\n', at - 1); return k + 1; }
  function lineEnd(text, at) { var k = text.indexOf('\n', at); return k < 0 ? text.length : k; }
  function blank(s) { return /^[ \t]*$/.test(s); }

  // Set (value string) or remove (value null) one attribute of an element's start tag.
  function setAttr(text, el, name, value) {
    var a = attr(el, name);
    if (value === null || value === undefined) {
      if (!a) return text;
      var s = a.start;
      while (s > 0 && /[ \t]/.test(text.charAt(s - 1))) s--;
      if (s > 0 && /[\r\n]/.test(text.charAt(s - 1)) && blank(text.slice(a.end, lineEnd(text, a.end)))) { /* attribute alone on its line */ s = lineStart(text, a.start) - 1; }
      return splice(text, s, a.end, '');
    }
    value = String(value);
    if (a && a.hasValue && a.quote) return splice(text, a.valStart, a.valEnd, escAttr(value, a.quote));
    if (a) return splice(text, a.start, a.end, a.raw + '="' + escAttr(value, '"') + '"');
    var last = el.attrs.length ? el.attrs[el.attrs.length - 1].end : el.start + 1 + el.name.length;
    return splice(text, last, last, ' ' + name + '="' + escAttr(value, '"') + '"');
  }

  // Inline style declarations, kept as written: [{ prop, value, important, start, end }] over the decoded value.
  function styleDecls(css) {
    var out = [], depth = 0, quote = '', s = 0;
    function push(e) {
      var chunk = css.slice(s, e);
      var m = /^(\s*)([-a-zA-Z0-9_]+)\s*:([\s\S]*)$/.exec(chunk);
      if (m) {
        var v = m[3], imp = /!\s*important\s*$/i.test(v);
        out.push({ prop: m[2].toLowerCase(), value: v.replace(/!\s*important\s*$/i, '').trim(), important: imp, start: s + m[1].length, end: e });
      }
    }
    for (var k = 0; k < css.length; k++) {
      var ch = css.charAt(k);
      if (quote) { if (ch === quote && css.charAt(k - 1) !== '\\') quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && !depth) { push(k); s = k + 1; }
    }
    if (s < css.length) push(css.length);
    return out;
  }
  function styleValue(css, prop) {
    var d = styleDecls(css || '').filter(function (x) { return x.prop === prop; });
    return d.length ? d[d.length - 1].value : '';
  }
  // The new style string with one property set (value) or removed (''), the rest untouched.
  function editStyle(css, prop, value, important) {
    css = css || '';
    var decls = styleDecls(css).filter(function (x) { return x.prop === prop; });
    var decl = decls[decls.length - 1];
    var v = value == null ? '' : String(value).trim();
    if (decl) {
      if (!v) {
        var s = decl.start, e = decl.end, n = css.length;
        if (css.charAt(e) === ';') {
          e++;
          while (e < n && /[ \t]/.test(css.charAt(e))) e++;
          if (e >= n) while (s > 0 && /\s/.test(css.charAt(s - 1))) s--;      // it was the last one: no space left behind
        } else {
          var k = s;
          while (k > 0 && /\s/.test(css.charAt(k - 1))) k--;
          s = k > 0 && css.charAt(k - 1) === ';' ? k - 1 : k;                     // last one without « ; »: take the one before
        }
        return css.slice(0, s) + css.slice(e);
      }
      var raw = css.slice(decl.start, decl.end);
      var colon = raw.indexOf(':');
      var lead = /^\s*/.exec(raw.slice(colon + 1))[0];
      var trail = /\s*$/.exec(raw)[0];
      return css.slice(0, decl.start) + raw.slice(0, colon + 1) + (lead || ' ') + v + (important ? ' !important' : '') + trail + css.slice(decl.end);
    }
    if (!v) return css;
    var add = prop + ': ' + v + (important ? ' !important' : '');
    var t = css.replace(/\s+$/, '');
    if (!t) return add;
    return t + (t.charAt(t.length - 1) === ';' ? ' ' : '; ') + add + (t.charAt(t.length - 1) === ';' ? ';' : '');
  }
  function setStyle(text, el, prop, value, important) {
    var cur = attrValue(text, el, 'style');
    var next = editStyle(cur || '', prop, value, important);
    if ((cur || '') === next) return text;
    return setAttr(text, el, 'style', next === '' ? null : next);
  }

  function replaceInner(text, el, html) { return splice(text, el.openEnd, innerEnd(el), html); }
  function replaceOuter(text, el, html) { return splice(text, el.start, el.end, html); }

  // Remove an element; when it sits alone on its line(s), the line goes too.
  function remove(text, el) {
    var ls = lineStart(text, el.start), le = lineEnd(text, el.end);
    if (blank(text.slice(ls, el.start)) && blank(text.slice(el.end, le))) {
      return { text: splice(text, ls, Math.min(text.length, le + 1), ''), at: ls };
    }
    return { text: splice(text, el.start, el.end, ''), at: el.start };
  }

  // Insert a copy right after the element, on its own line with the same indentation when it has one.
  // The copy's own id (if any) gets « -2 » (« -3 »…) so anchors stay unique.
  function duplicate(text, el) {
    var copy = text.slice(el.start, el.end);
    var id = attrValue(text, el, 'id');
    if (id) {
      var k = 2;
      while (text.indexOf('id="' + id + '-' + k + '"') >= 0) k++;
      var a = attr(el, 'id'), nid = id + '-' + k;
      if (a.quote) copy = copy.slice(0, a.valStart - el.start) + escAttr(nid, a.quote) + copy.slice(a.valEnd - el.start);
      else copy = copy.slice(0, a.start - el.start) + 'id="' + escAttr(nid, '"') + '"' + copy.slice(a.end - el.start);
    }
    var ls = lineStart(text, el.start), le = lineEnd(text, el.end);
    var indent = text.slice(ls, el.start);
    if (blank(indent) && blank(text.slice(el.end, le))) {
      var ins = '\n' + indent + copy;
      return { text: splice(text, el.end, el.end, ins), at: el.end + 1 + indent.length };
    }
    return { text: splice(text, el.end, el.end, copy), at: el.end };
  }

  /* ---------------------------------------------------------------- text, character-exact */

  // The smallest change of one raw text run (a text node, a title) so that it decodes to `next`.
  function patchRaw(text, s, e, next, opts) {
    var raw = text.slice(s, e);
    var d = decodeMap(raw);
    var cur = d.str;
    if (cur === next) return text;
    var p = 0, mx = Math.min(cur.length, next.length);
    while (p < mx && cur.charCodeAt(p) === next.charCodeAt(p)) p++;
    var q = 0;
    while (q < mx - p && cur.charCodeAt(cur.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++;
    // never cut a decoded entity in half: widen to whole raw runs
    while (p > 0 && d.map[p - 1] === d.map[p]) p--;
    while (q > 0 && d.map[cur.length - q] === d.map[cur.length - q - 1]) q--;
    var rs = d.map[p], re = d.map[cur.length - q];
    var mid = next.slice(p, next.length - q);
    var nb = opts && opts.nbspEntity != null ? opts.nbspEntity : /&nbsp;/.test(raw) || !/ /.test(raw);
    return splice(text, s + rs, s + re, escText(mid, nb));
  }

  // Compare a source element with its live twin (after inline editing) → the edits, innermost first:
  // { text: srcTextNode, value } when only words changed, { inner: srcEl, html } when the structure did.
  function textEdits(text, src, live, cleanHTML) {
    var out = [];
    function walk(s, l) {
      var sk = s.children.filter(function (c) { return c.type !== 'doctype'; });
      var lk = Array.prototype.filter.call(l.childNodes, function (c) { return (c.nodeType === 1 && !injected(c)) || c.nodeType === 3 || c.nodeType === 8; });
      var same = sk.length === lk.length && sk.every(function (c, k) {
        var x = lk[k];
        if (c.type === 'text') return x.nodeType === 3;
        if (c.type === 'comment') return x.nodeType === 8;
        return x.nodeType === 1 && String(x.localName).toLowerCase() === c.tag;
      });
      if (!same) {
        var html = cleanHTML ? cleanHTML(l) : l.innerHTML;
        if (html !== text.slice(s.openEnd, innerEnd(s))) out.push({ inner: s, html: html });
        return;
      }
      sk.forEach(function (c, k) {
        var x = lk[k];
        if (c.type === 'text') { if (decode(text.slice(c.start, c.end)) !== x.data) out.push({ text: c, value: x.data }); }
        else if (c.type === 'el' && !c.isRaw && !c.isVoid) walk(c, x);
      });
    }
    walk(src, live);
    return out;
  }
  // Apply textEdits from the end of the file backwards (offsets stay valid).
  function applyText(text, edits) {
    var list = edits.slice().sort(function (a, b) { return (b.text || b.inner).start - (a.text || a.inner).start; });
    list.forEach(function (ed) {
      if (ed.text) text = patchRaw(text, ed.text.start, ed.text.end, ed.value);
      else text = replaceInner(text, ed.inner, ed.html);
    });
    return text;
  }

  /* ---------------------------------------------------------------- the head: SEO */

  function titleEl(tree) { return find(tree, function (e) { return e.tag === 'title'; }); }
  function metaEl(tree, key) {
    var text = tree.text;
    return find(tree, function (e) {
      if (e.tag !== 'meta') return false;
      var nm = (attrValue(text, e, 'name') || attrValue(text, e, 'property') || '').toLowerCase();
      return nm === key;
    });
  }
  function readSEO(tree) {
    var text = tree.text, t = titleEl(tree);
    var d = metaEl(tree, 'description'), og = metaEl(tree, 'og:image');
    return {
      title: t ? decode(text.slice(t.openEnd, innerEnd(t))) : '',
      description: d ? (attrValue(text, d, 'content') || '') : '',
      ogImage: og ? (attrValue(text, og, 'content') || '') : ''
    };
  }
  function setTitle(text, tree, value) {
    var t = titleEl(tree);
    if (t) return patchRaw(text, t.openEnd, innerEnd(t), value);
    var h = headOf(tree);
    if (!h) return text;
    return insertInHead(text, tree, '<title>' + escText(value, true) + '</title>');
  }
  function insertInHead(text, tree, tag) {
    var h = headOf(tree);
    var anchor = titleEl(tree) || null;
    var metas = tree.elements.filter(function (e) { return e.tag === 'meta' && h && e.start > h.start && e.end <= h.end; });
    if (!anchor && metas.length) anchor = metas[metas.length - 1];
    if (anchor) {
      var ls = lineStart(text, anchor.start);
      var indent = text.slice(ls, anchor.start);
      if (!blank(indent)) indent = '';
      return splice(text, anchor.end, anchor.end, '\n' + indent + tag);
    }
    if (h && h.closeStart != null) {
      var l2 = lineStart(text, h.closeStart);
      var ind = blank(text.slice(l2, h.closeStart)) ? text.slice(l2, h.closeStart) + '  ' : '';
      return splice(text, l2, l2, ind + tag + '\n');
    }
    return text;
  }
  function setMeta(text, tree, key, value) {
    var m = metaEl(tree, key);
    if (m) return setAttr(text, m, 'content', value);
    if (!value) return text;
    var xhtml = /<meta\b[^>]*\/>/i.test(text);
    var keyAttr = /^og:|^twitter:/.test(key) && key.indexOf('twitter:') !== 0 ? 'property' : 'name';
    return insertInHead(text, tree, '<meta ' + keyAttr + '="' + escAttr(key, '"') + '" content="' + escAttr(value, '"') + '"' + (xhtml ? ' />' : '>'));
  }

  /* ================================================================ paths */

  function dirOf(p) { var k = p.lastIndexOf('/'); return k < 0 ? '' : p.slice(0, k + 1); }
  function relPath(fromFile, toFile) {
    var a = dirOf(fromFile).split('/').filter(Boolean), b = toFile.split('/');
    var k = 0;
    while (k < a.length && k < b.length - 1 && a[k] === b[k]) k++;
    var up = a.length - k;
    var parts = [];
    for (var u = 0; u < up; u++) parts.push('..');
    return parts.concat(b.slice(k)).join('/');
  }
  // A URL written in a page (relative, root-relative or on kreeative.xyz) → its repository path, or null.
  function repoPathOf(fromFile, url, liveOrigin) {
    url = String(url || '').trim();
    if (!url || /^(data|blob|mailto|tel|javascript):/i.test(url)) return null;
    var p;
    var m = /^https?:\/\/([^/]+)(\/[^?#]*)?/i.exec(url);
    if (m) { if (!liveOrigin || m[1].toLowerCase() !== liveOrigin) return null; p = (m[2] || '/').slice(1); }
    else if (url.charAt(0) === '/') p = url.slice(1);
    else p = dirOf(fromFile) + url;
    p = p.replace(/[?#].*$/, '');
    var out = [];
    p.split('/').forEach(function (s) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); });
    try { return decodeURIComponent(out.join('/')); } catch (e) { return out.join('/'); }
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  /* ================================================================ bytes: utf-8, base64, sha-1, crc-32, zip */

  function utf8(s) { return new TextEncoder().encode(s); }
  function fromUtf8(b) { return new TextDecoder('utf-8').decode(b); }
  function toBase64(bytes) {
    var s = '';
    for (var k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  }
  function fromBase64(b64) {
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var out = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function gitBlobSha(bytes) {
    if (typeof bytes === 'string') bytes = utf8(bytes);
    var head = utf8('blob ' + bytes.length + '\0');
    var all = new Uint8Array(head.length + bytes.length);
    all.set(head, 0); all.set(bytes, head.length);
    var subtle = (root.crypto && root.crypto.subtle) || (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle);
    return subtle.digest('SHA-1', all).then(hex);
  }

  var CRC = null;
  function crc32(bytes) {
    if (!CRC) {
      CRC = new Int32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
    }
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }
  // A .zip in the « stored » method (0): local headers + data, the central directory, the end record.
  // Names in UTF-8 (general-purpose flag bit 11). files: [{ path, bytes }].
  function zip(files, when) {
    var d = when || new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.path), data = f.bytes, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 10, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 10, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0o100644 << 16 >>> 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true); e.setUint16(20, 0, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]);
    var total = all.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(total), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  // A line diff summary (for the « Modifications » list): how many lines changed, added, removed.
  function lineStats(a, b) {
    if (a === b) return { added: 0, removed: 0 };
    var x = a.split('\n'), y = b.split('\n');
    var p = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    var q = 0;
    while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
    return { added: y.length - p - q, removed: x.length - p - q, from: p + 1 };
  }

  var API = {
    parse: parse, attr: attr, attrValue: attrValue, innerEnd: innerEnd, elChildren: elChildren, find: find, outer: outer,
    decode: decode, decodeMap: decodeMap, escText: escText, escAttr: escAttr, setDecoder: function (f) { extDecode = f; },
    align: align, lcs: lcs,
    setAttr: setAttr, styleDecls: styleDecls, styleValue: styleValue, editStyle: editStyle, setStyle: setStyle,
    replaceInner: replaceInner, replaceOuter: replaceOuter, remove: remove, duplicate: duplicate,
    patchRaw: patchRaw, textEdits: textEdits, applyText: applyText,
    readSEO: readSEO, setTitle: setTitle, setMeta: setMeta,
    relPath: relPath, repoPathOf: repoPathOf, dirOf: dirOf, slugify: slugify,
    utf8: utf8, fromUtf8: fromUtf8, toBase64: toBase64, fromBase64: fromBase64, gitBlobSha: gitBlobSha, crc32: crc32, zip: zip,
    lineStats: lineStats, INLINE: INLINE, VOID: VOID
  };
  root.JeereSitesCore = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
