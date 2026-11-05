/*
 * Jeere Studio — fontfile.js
 * Reads a font file the seller imports (Thème › Polices › « Mes polices »): its real family name, weight and
 * style (the `name`, `OS/2`, `head`, `fvar` tables), whether it has the French accents and ɛ ɔ ŋ Ɛ Ɔ Ŋ (`cmap`),
 * and makes a TTF / OTF lighter by packing it as WOFF (zlib, CompressionStream). No library: a small sfnt parser,
 * a WOFF reader (zlib through DecompressionStream) and a WOFF2 reader with its own Brotli decoder (RFC 7932).
 *
 * WOFF2 packs all the tables in one Brotli stream, which browsers cannot open from JavaScript
 * (DecompressionStream has no 'brotli'). The decoder below follows RFC 7932; when a stream uses a word of
 * Brotli's static dictionary (RFC 7932 Appendix A, 122 784 bytes, MIT), the caller passes it in (the editor
 * fetches brotli-dict.bin once, only then). Pure functions, no DOM: it also runs in Node.
 *
 * Global: window.JeereFontFile = { sniff, read, readTables, info, toWoff, brotliDecode, FORMATS, ... }
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  function fail(code) { var e = new Error(code); e.code = code; return e; }

  /* ------------------------------------------------------------------ bytes */

  function u8(b, o) { if (o >= b.length) throw fail('broken'); return b[o]; }
  function u16(b, o) { if (o + 2 > b.length) throw fail('broken'); return (b[o] << 8) | b[o + 1]; }
  function i16(b, o) { var v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; }
  function u32(b, o) { if (o + 4 > b.length) throw fail('broken'); return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
  function fixed(b, o) { var v = u32(b, o); if (v & 0x80000000) v -= 0x100000000; return v / 65536; }
  function tagAt(b, o) { return String.fromCharCode(u8(b, o), u8(b, o + 1), u8(b, o + 2), u8(b, o + 3)); }
  function toBytes(v) {
    if (v instanceof Uint8Array) return v;
    if (v && typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer) return new Uint8Array(v);
    if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
    throw fail('type');
  }

  // The four formats: the first 4 bytes say which (never the file name, never the type the phone reports)
  var FORMATS = {
    woff2: { css: 'woff2', mime: 'font/woff2', label: 'WOFF2' },
    woff: { css: 'woff', mime: 'font/woff', label: 'WOFF' },
    ttf: { css: 'truetype', mime: 'font/ttf', label: 'TTF' },
    otf: { css: 'opentype', mime: 'font/otf', label: 'OTF' }
  };
  function sniff(bytes) {
    var b = toBytes(bytes);
    if (b.length < 12) return null;
    var t = tagAt(b, 0);
    if (t === 'wOF2') return 'woff2';
    if (t === 'wOFF') return 'woff';
    if (t === 'OTTO') return 'otf';
    if (t === '\u0000\u0001\u0000\u0000' || t === 'true') return 'ttf';
    if (t === 'ttcf') return 'collection';
    return null;
  }

  /* ------------------------------------------------------------------ Brotli (RFC 7932), decoding only */

  // Literal context lookup for the UTF8 mode (RFC 7932 section 7.1, the same table as libbrotli's): 256 values
  // for the last byte, then 256 for the one before, each a letter of this alphabet (A = 0 … / = 63)
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var UTF8_LUT = (function () {
    var s = 'AAAAAAAAAEEAAEAAAAAAAAAAAAAAAAAAIMQMMUMQYcMMgMkMssssssssssggYocMMw000w000w00000w00000w00000YMcMMM48884888488888488888488888YMcMA' +
      'ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCD' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBCCCCCCCCCCBBBBBBBCCCCCCCCCCCCCCCCCCCCCCCCCCBBBBBBDDDDDDDDDDDDDDDDDDDDDDDDDDBBBBA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    var t = new Uint8Array(512);
    for (var i = 0; i < 512; i++) t[i] = B64.indexOf(s.charAt(i));
    return t;
  })();
  function signedLut(v) { return v === 0 ? 0 : v < 16 ? 1 : v < 64 ? 2 : v < 128 ? 3 : v < 192 ? 4 : v < 240 ? 5 : v < 255 ? 6 : 7; }
  // The 121 transforms of the static dictionary's words (RFC 7932 Appendix B): prefix | type | suffix
  // (type 0 identity, 1–9 omit the last n, 10 first letter upper case, 11 all upper case, 12–20 omit the first n - 11)
  var TRANSFORMS = ('|0|#|0| # |0| #|12|#|10| #|0| the # |0|#s |0| #|0| of #|10|#|0| and #|13|#|1|#, |0| #|0|, # |10| #|0| in #|0| to #e |0| #|0|"#|0|.#|0|">#|0|\n#|3|#|0|]#|0| for #|14|#|2|#|0| a #|0| that # |10|#|0|. #.|0|# |0|, #|15|#|0| with #|0|\'#|0| from #|0| by #|16|#|17|# the |0|#|4|#|0|. The #|11|#|0| on #|0| as #|0| is #|7|#|1|ing #|0|\n\t#|0|:# |0|. #|0|ed #|20|#|18|#|6|#|0|(#|10|, #|8|#|0| at #|0|ly # the |0| of #|5|#|9|# |10|, #|10|"#.|0|(#|11| #|10|">#|0|="# |0|.#.com/|0|# the |0| of the #|10|\'#|0|. This #|0|,#.|0| #|10|(#|10|.#|0| not # |0|="#|0|er # |11| #|0|al # |11|#|0|=\'#|11|"#|10|. # |0|(#|0|ful # |10|. #|0|ive #|0|less #|11|\'#|0|est # |10|.#|11|"># |0|=\'#|10|,#|0|ize #|11|.#Â |0|# |0|,#|10|="#|11|="#|0|ous #|11|, #|10|=\'# |10|,# |11|="# |11|, #|11|,#|11|(#|11|. # |11|.#|11|=\'# |11|. # |10|="# |11|=\'# |10|=\'')
    .split('#').map(function (x) { var p = x.split('|'); return [strBytes(p[0]), +p[1], strBytes(p[2])]; });
  function strBytes(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
  // Dictionary words by length (4 to 24 letters): how many bits index a word, where the words of that length start
  var DICT_BITS = [0, 0, 0, 0, 10, 10, 11, 11, 10, 10, 10, 10, 10, 9, 9, 8, 7, 7, 8, 7, 7, 6, 6, 5, 5];
  var DICT_OFFSETS = [0, 0, 0, 0, 0, 4096, 9216, 21504, 35840, 44032, 53248, 63488, 74752, 87040, 93696, 100864, 104704, 106752, 108928, 113536, 115968, 118528, 119872, 121280, 122016];
  var DICT_SIZE = 122784;
  // Block counts (RFC 7932 section 6), insert and copy lengths (section 5): [base, extra bits]
  var BLOCK_LEN = [[1, 2], [5, 2], [9, 2], [13, 2], [17, 3], [25, 3], [33, 3], [41, 3], [49, 4], [65, 4], [81, 4], [97, 4], [113, 5], [145, 5], [177, 5], [209, 5], [241, 6], [305, 6], [369, 7], [497, 8], [753, 9], [1265, 10], [2289, 11], [4337, 12], [8433, 13], [16625, 24]];
  var INSERT_LEN = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 1], [8, 1], [10, 2], [14, 2], [18, 3], [26, 3], [34, 4], [50, 4], [66, 5], [98, 5], [130, 6], [194, 7], [322, 8], [578, 9], [1090, 10], [2114, 12], [6210, 14], [22594, 24]];
  var COPY_LEN = [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 1], [12, 1], [14, 2], [18, 2], [22, 3], [30, 3], [38, 4], [54, 4], [70, 5], [102, 5], [134, 6], [198, 7], [326, 8], [582, 9], [1094, 10], [2118, 24]];
  var CMD_INSERT = [0, 0, 0, 0, 8, 8, 0, 16, 8, 16, 16];
  var CMD_COPY = [0, 8, 0, 8, 0, 8, 16, 0, 16, 8, 16];
  var CL_ORDER = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  var CL_LEN = [2, 2, 2, 3, 2, 2, 2, 4, 2, 2, 2, 3, 2, 2, 2, 4];
  var CL_VAL = [0, 4, 3, 2, 0, 4, 3, 1, 0, 4, 3, 2, 0, 4, 3, 5];

  // brotliDecode(bytes, { dict, size }) → Uint8Array. dict: the static dictionary (Uint8Array, 122 784 bytes),
  // needed only by a stream that uses it (else Error('brotli-dict')); size: the expected output size, when known.
  function brotliDecode(input, opts) {
    var buf = toBytes(input);
    var o = opts || {};
    var dict = o.dict && o.dict.length === DICT_SIZE ? o.dict : null;
    var limit = typeof o.max === 'number' ? o.max : 64 * 1024 * 1024;
    var out = new Uint8Array(typeof o.size === 'number' && o.size > 0 ? o.size : Math.max(1024, buf.length * 4));
    var pos = 0;
    var acc = 0, nb = 0, bp = 0;
    function readBits(n) {
      if (n === 0) return 0;
      if (n > 24) throw fail('broken');
      while (nb < n) {
        if (bp > buf.length + 4) throw fail('broken');
        acc = (acc | ((bp < buf.length ? buf[bp] : 0) << nb)) >>> 0;
        bp++; nb += 8;
      }
      var v = acc & ((1 << n) - 1);
      acc >>>= n; nb -= n;
      return v;
    }
    function grow(n) {
      if (pos + n <= out.length) return;
      if (pos + n > limit) throw fail('broken');
      var m = new Uint8Array(Math.min(limit, Math.max(out.length * 2, pos + n)));
      m.set(out.subarray(0, pos));
      out = m;
    }
    // A prefix code: { one: symbol } (a code of one symbol takes no bit) or { counts, symbols } (canonical)
    function canonical(lengths, size) {
      var counts = new Uint16Array(16);
      var i;
      for (i = 0; i < size; i++) counts[lengths[i]]++;
      counts[0] = 0;
      var offs = new Uint16Array(16);
      for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + counts[i];
      var symbols = new Uint16Array(size);
      for (i = 0; i < size; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
      return { counts: counts, symbols: symbols };
    }
    function sym(code) {
      if (code.one !== undefined) return code.one;
      var c = 0, first = 0, index = 0;
      for (var len = 1; len < 16; len++) {
        c |= readBits(1);
        var count = code.counts[len];
        if (c - first < count) return code.symbols[index + c - first];
        index += count; first += count; first <<= 1; c <<= 1;
      }
      throw fail('broken');
    }
    function readCode(size) {
      var lengths = new Uint8Array(size);
      var hskip = readBits(2);
      var i;
      if (hskip === 1) {
        var bits = 0;
        while ((1 << bits) < size) bits++;
        var n = readBits(2) + 1;
        var syms = [];
        for (i = 0; i < n; i++) {
          var s = readBits(bits);
          if (s >= size || syms.indexOf(s) !== -1) throw fail('broken');
          syms.push(s);
        }
        if (n === 1) return { one: syms[0] };
        var lens = n === 2 ? [1, 1] : n === 3 ? [1, 2, 2] : (readBits(1) ? [1, 2, 3, 3] : [2, 2, 2, 2]);
        for (i = 0; i < n; i++) lengths[syms[i]] = lens[i];
        return canonical(lengths, size);
      }
      // Complex code: first the code lengths of the code-length alphabet, then the symbols' code lengths
      var cl = new Uint8Array(18);
      var space = 32, num = 0;
      for (i = hskip; i < 18; i++) {
        // the code-length code lengths have a fixed code of 2 to 4 bits: peek 4, then take what it used
        while (nb < 4) { acc = (acc | ((bp < buf.length ? buf[bp] : 0) << nb)) >>> 0; bp++; nb += 8; }
        var p = acc & 15;
        readBits(CL_LEN[p]);
        var v = CL_VAL[p];
        cl[CL_ORDER[i]] = v;
        if (v !== 0) { space -= 32 >> v; num++; if (space <= 0) break; }
      }
      if (num !== 1 && space !== 0) throw fail('broken');
      var clCode;
      if (num === 1) { for (i = 0; i < 18; i++) if (cl[i]) clCode = { one: i }; }
      else clCode = canonical(cl, 18);
      var symbol = 0, prev = 8, repeat = 0, repeatLen = 0;
      space = 32768;
      while (symbol < size && space > 0) {
        var c = sym(clCode);
        if (c < 16) {
          repeat = 0;
          lengths[symbol++] = c;
          if (c !== 0) { prev = c; space -= 32768 >> c; }
        } else {
          var extra = c === 16 ? 2 : 3;
          var newLen = c === 16 ? prev : 0;
          if (repeatLen !== newLen) { repeat = 0; repeatLen = newLen; }
          var old = repeat;
          if (repeat > 0) repeat = (repeat - 2) << extra;
          repeat += readBits(extra) + 3;
          var delta = repeat - old;
          if (symbol + delta > size) throw fail('broken');
          for (var d = 0; d < delta; d++) lengths[symbol++] = repeatLen;
          if (repeatLen !== 0) space -= delta << (15 - repeatLen);
        }
      }
      if (space !== 0) throw fail('broken');
      return canonical(lengths, size);
    }
    function varLen8() {
      if (!readBits(1)) return 0;
      var n = readBits(3);
      return n === 0 ? 1 : (1 << n) + readBits(n);
    }
    function blockLength(code) { var s = sym(code); return BLOCK_LEN[s][0] + readBits(BLOCK_LEN[s][1]); }
    function readContextMap(size, trees) {
      var map = new Uint8Array(size);
      if (trees < 2) return map;
      var rle = readBits(1) ? readBits(4) + 1 : 0;
      var code = readCode(trees + rle);
      for (var i = 0; i < size;) {
        var s = sym(code);
        if (s === 0) map[i++] = 0;
        else if (s <= rle) {
          var reps = (1 << s) + readBits(s);
          if (i + reps > size) throw fail('broken');
          while (reps--) map[i++] = 0;
        } else map[i++] = s - rle;
      }
      if (readBits(1)) {
        var mtf = [];
        for (var k = 0; k < 256; k++) mtf.push(k);
        for (var j = 0; j < size; j++) {
          var idx = map[j];
          var val = mtf[idx];
          map[j] = val;
          if (idx) { mtf.splice(idx, 1); mtf.unshift(val); }
        }
      }
      return map;
    }
    function toUpper(w, i, n) {
      if (w[i] < 0xC0) { if (w[i] >= 97 && w[i] <= 122) w[i] ^= 32; return 1; }
      if (w[i] < 0xE0) { if (i + 1 < n) w[i + 1] ^= 32; return 2; }
      if (i + 2 < n) w[i + 2] ^= 5;
      return 3;
    }

    // Stream header: the window size
    var wbits;
    if (!readBits(1)) wbits = 16;
    else {
      var n3 = readBits(3);
      if (n3) wbits = 17 + n3;
      else { n3 = readBits(3); if (n3 === 1) throw fail('broken'); wbits = n3 ? 8 + n3 : 17; }
    }
    var maxBackward = (1 << wbits) - 16;
    var ring = [16, 15, 11, 4]; // the last four distances, the last one at the end

    for (;;) {
      var isLast = readBits(1);
      if (isLast && readBits(1)) break; // ISLASTEMPTY
      var nibbles = readBits(2);
      var mlen;
      if (nibbles === 3) {
        // Metadata block: skipped
        if (readBits(1)) throw fail('broken');
        var skipBytes = readBits(2);
        var skip = 0;
        for (var sb = 0; sb < skipBytes; sb++) skip |= readBits(8) << (8 * sb);
        if (skipBytes) skip += 1;
        if (readBits(nb & 7)) throw fail('broken');
        for (var sk = 0; sk < skip; sk++) readBits(8);
        if (isLast) break;
        continue;
      }
      mlen = 0;
      for (var nn = 0; nn < nibbles + 4; nn++) mlen |= readBits(4) << (4 * nn);
      mlen += 1;
      grow(mlen);
      if (!isLast && readBits(1)) {
        // Uncompressed block
        if (readBits(nb & 7)) throw fail('broken');
        for (var ub = 0; ub < mlen; ub++) out[pos++] = readBits(8);
        continue;
      }
      // Block types and counts of the three categories: literals, insert-and-copy, distances
      var blocks = [];
      for (var cat = 0; cat < 3; cat++) {
        var b = { n: varLen8() + 1, last: 0, prev: 1, left: 1 << 28, typeCode: null, lenCode: null };
        if (b.n >= 2) { b.typeCode = readCode(b.n + 2); b.lenCode = readCode(26); b.left = blockLength(b.lenCode); }
        blocks.push(b);
      }
      var npostfix = readBits(2);
      var ndirect = readBits(4) << npostfix;
      var modes = [];
      for (var m = 0; m < blocks[0].n; m++) modes.push(readBits(2));
      var treesL = varLen8() + 1;
      var cmapL = readContextMap(64 * blocks[0].n, treesL);
      var treesD = varLen8() + 1;
      var cmapD = readContextMap(4 * blocks[2].n, treesD);
      var codesL = [], codesI = [], codesD = [];
      var t;
      for (t = 0; t < treesL; t++) codesL.push(readCode(256));
      for (t = 0; t < blocks[1].n; t++) codesI.push(readCode(704));
      var distSize = 16 + ndirect + (48 << npostfix);
      for (t = 0; t < treesD; t++) codesD.push(readCode(distSize));
      var switchBlock = function (bk) {
        var s = sym(bk.typeCode);
        var ty = s === 0 ? bk.prev : (s === 1 ? bk.last + 1 : s - 2);
        if (ty >= bk.n) ty -= bk.n;
        bk.prev = bk.last; bk.last = ty;
        bk.left = blockLength(bk.lenCode);
      };
      var postMask = (1 << npostfix) - 1;
      var end = pos + mlen;
      while (pos < end) {
        if (blocks[1].left === 0) switchBlock(blocks[1]);
        blocks[1].left--;
        var cmd = sym(codesI[blocks[1].last]);
        var cell = cmd >> 6;
        if (cell > 10) throw fail('broken');
        var ic = CMD_INSERT[cell] + ((cmd >> 3) & 7);
        var cc = CMD_COPY[cell] + (cmd & 7);
        var insert = INSERT_LEN[ic][0] + readBits(INSERT_LEN[ic][1]);
        var copy = COPY_LEN[cc][0] + readBits(COPY_LEN[cc][1]);
        if (pos + insert > end) throw fail('broken');
        for (var li = 0; li < insert; li++) {
          if (blocks[0].left === 0) switchBlock(blocks[0]);
          blocks[0].left--;
          var p1 = pos > 0 ? out[pos - 1] : 0;
          var p2 = pos > 1 ? out[pos - 2] : 0;
          var mode = modes[blocks[0].last];
          var ctx = mode === 0 ? p1 & 63 : mode === 1 ? p1 >> 2 : mode === 2 ? (UTF8_LUT[p1] | UTF8_LUT[256 + p2]) : ((signedLut(p1) << 3) | signedLut(p2));
          out[pos++] = sym(codesL[cmapL[blocks[0].last * 64 + ctx]]);
        }
        if (pos >= end) break;
        var dcode, dist;
        if (cmd < 128) dcode = 0;
        else {
          if (blocks[2].left === 0) switchBlock(blocks[2]);
          blocks[2].left--;
          dcode = sym(codesD[cmapD[blocks[2].last * 4 + (copy > 4 ? 3 : copy - 2)]]);
        }
        if (dcode < 16) {
          if (dcode < 4) dist = ring[3 - dcode];
          else {
            var base = dcode < 10 ? ring[3] : ring[2];
            var k = (dcode - (dcode < 10 ? 4 : 10));
            dist = base + [-1, 1, -2, 2, -3, 3][k];
          }
          if (dist <= 0) throw fail('broken');
        } else if (dcode - 16 < ndirect) dist = dcode - 15;
        else {
          var x = dcode - ndirect - 16;
          var ndist = 1 + (x >> (npostfix + 1));
          var hcode = x >> npostfix;
          var off = ((2 + (hcode & 1)) << ndist) - 4;
          dist = ((off + readBits(ndist)) << npostfix) + (x & postMask) + ndirect + 1;
        }
        var maxDist = Math.min(pos, maxBackward);
        if (dist > maxDist) {
          // A word of the static dictionary, with one of its 121 transforms (the distances stay as they are)
          if (copy < 4 || copy > 24) throw fail('broken');
          var word = dist - maxDist - 1;
          var nbits = DICT_BITS[copy];
          var wi = word & ((1 << nbits) - 1);
          var ti = word >> nbits;
          if (ti >= TRANSFORMS.length) throw fail('broken');
          if (!dict) throw fail('brotli-dict');
          var tr = TRANSFORMS[ti];
          var start = DICT_OFFSETS[copy] + wi * copy;
          var w = dict.subarray(start, start + copy);
          var type = tr[1];
          if (type >= 1 && type <= 9) w = w.subarray(0, Math.max(0, w.length - type));
          else if (type >= 12 && type <= 20) w = w.subarray(Math.min(w.length, type - 11));
          var wc = new Uint8Array(w);
          if (type === 10 && wc.length) toUpper(wc, 0, wc.length);
          if (type === 11) { for (var ui = 0; ui < wc.length;) ui += toUpper(wc, ui, wc.length); }
          var total = tr[0].length + wc.length + tr[2].length;
          if (pos + total > end) throw fail('broken');
          out.set(tr[0], pos); pos += tr[0].length;
          out.set(wc, pos); pos += wc.length;
          out.set(tr[2], pos); pos += tr[2].length;
        } else {
          if (dcode !== 0) { ring.shift(); ring.push(dist); }
          if (pos + copy > end) throw fail('broken');
          for (var ci = 0; ci < copy; ci++) { out[pos] = out[pos - dist]; pos++; }
        }
      }
      if (isLast) break;
    }
    return out.length === pos ? out : out.slice(0, pos);
  }

  /* ------------------------------------------------------------------ the three containers → tables */

  function sfntTables(b) {
    var n = u16(b, 4);
    if (n < 1 || n > 200) throw fail('broken');
    var tables = {};
    for (var i = 0; i < n; i++) {
      var r = 12 + i * 16;
      var off = u32(b, r + 8), len = u32(b, r + 12);
      if (off + len > b.length) throw fail('broken');
      tables[tagAt(b, r)] = { data: b.subarray(off, off + len), checksum: u32(b, r + 4) };
    }
    return tables;
  }
  // WOFF 1: each table on its own, zlib-compressed when it is smaller that way. inflate(bytes) → Promise<bytes>
  function woffTables(b, inflate, want) {
    var n = u16(b, 12);
    if (n < 1 || n > 200) return Promise.reject(fail('broken'));
    var jobs = [];
    var tables = {};
    for (var i = 0; i < n; i++) {
      var r = 44 + i * 20;
      var tag = tagAt(b, r), off = u32(b, r + 4), comp = u32(b, r + 8), orig = u32(b, r + 12);
      if (off + comp > b.length) return Promise.reject(fail('broken'));
      var raw = b.subarray(off, off + comp);
      if (want && want.indexOf(tag) === -1) continue;
      if (comp < orig) {
        if (typeof inflate !== 'function') return Promise.reject(fail('inflate'));
        jobs.push((function (t, data, size) {
          return Promise.resolve(inflate(data)).then(function (d) {
            d = toBytes(d);
            if (d.length !== size) throw fail('broken');
            tables[t] = { data: d };
          });
        })(tag, raw, orig));
      } else tables[tag] = { data: raw };
    }
    return Promise.all(jobs).then(function () { return tables; });
  }
  var WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
    'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
    'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar',
    'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
  // WOFF 2: one Brotli stream after the table directory. The tables this file reads are never transformed.
  function woff2Tables(b, dict) {
    var n = u16(b, 12);
    var compSize = u32(b, 20);
    if (n < 1 || n > 200) throw fail('broken');
    if (tagAt(b, 4) === 'ttcf') throw fail('collection');
    var p = 48;
    function base128() {
      var v = 0;
      for (var i = 0; i < 5; i++) {
        var c = u8(b, p++);
        if (i === 0 && c === 0x80) throw fail('broken');
        if (v & 0xFE000000) throw fail('broken');
        v = (v * 128) + (c & 0x7F);
        if (!(c & 0x80)) return v;
      }
      throw fail('broken');
    }
    var dir = [];
    var total = 0;
    for (var i = 0; i < n; i++) {
      var flags = u8(b, p++);
      var idx = flags & 63;
      var tag = idx === 63 ? tagAt(b, p) : WOFF2_TAGS[idx];
      if (idx === 63) p += 4;
      var version = flags >> 6;
      var orig = base128();
      var transformed = (tag === 'glyf' || tag === 'loca') ? version !== 3 : version !== 0;
      var length = transformed ? base128() : orig;
      dir.push({ tag: tag, length: length, transformed: transformed, offset: total });
      total += length;
    }
    if (p + compSize > b.length) throw fail('broken');
    var data = brotliDecode(b.subarray(p, p + compSize), { dict: dict, size: total, max: total + 16 });
    if (data.length < total) throw fail('broken');
    var tables = {};
    dir.forEach(function (d) { if (!d.transformed) tables[d.tag] = { data: data.subarray(d.offset, d.offset + d.length) }; });
    return tables;
  }
  // readTables(bytes, { inflate, dict }) → Promise<{ format, tables: { tag: { data } } }>
  function readTables(bytes, opts) {
    var o = opts || {};
    try {
      var b = toBytes(bytes);
      var format = sniff(b);
      if (format === 'collection') return Promise.reject(fail('collection'));
      if (!format) return Promise.reject(fail('type'));
      if (format === 'woff') return woffTables(b, o.inflate, ['name', 'OS/2', 'head', 'cmap', 'fvar', 'post']).then(function (t) { return { format: format, tables: t }; });
      if (format === 'woff2') return Promise.resolve({ format: format, tables: woff2Tables(b, o.dict) });
      return Promise.resolve({ format: format, tables: sfntTables(b) });
    } catch (e) { return Promise.reject(e); }
  }

  /* ------------------------------------------------------------------ what the tables say */

  var MAC_ROMAN_HI = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
  function nameStrings(t) {
    var b = t.data;
    var count = u16(b, 2), strOff = u16(b, 4);
    var best = {};
    for (var i = 0; i < count; i++) {
      var r = 6 + i * 12;
      var plat = u16(b, r), enc = u16(b, r + 2), lang = u16(b, r + 4), id = u16(b, r + 6), len = u16(b, r + 8), off = u16(b, r + 10);
      if ([1, 2, 4, 16, 17].indexOf(id) === -1) continue;
      var score = plat === 3 && (enc === 1 || enc === 10) ? (lang === 0x409 ? 5 : 4) : plat === 0 ? 3 : (plat === 1 && enc === 0 ? (lang === 0 ? 2 : 1) : 0);
      if (!score || (best[id] && best[id].score >= score)) continue;
      var s = '';
      var start = strOff + off;
      if (start + len > b.length) continue;
      if (plat === 1) {
        for (var k = 0; k < len; k++) { var c = b[start + k]; s += c < 128 ? String.fromCharCode(c) : MAC_ROMAN_HI.charAt(c - 128); }
      } else {
        for (var j = 0; j + 1 < len; j += 2) s += String.fromCharCode((b[start + j] << 8) | b[start + j + 1]);
      }
      best[id] = { score: score, value: s };
    }
    var out = {};
    Object.keys(best).forEach(function (k) { out[k] = best[k].value; });
    return out;
  }
  // The cmap's Unicode subtables (formats 4, 6, 12, 13) → has(codePoint)
  function cmapHas(t) {
    var b = t.data;
    var n = u16(b, 2);
    var subs = [];
    for (var i = 0; i < n; i++) {
      var plat = u16(b, 4 + i * 8), enc = u16(b, 6 + i * 8), off = u32(b, 8 + i * 8);
      if (plat === 0 || (plat === 3 && (enc === 1 || enc === 10))) subs.push(off);
    }
    var fns = [];
    subs.forEach(function (off) {
      if (off + 2 > b.length) return;
      var f = u16(b, off);
      if (f === 4) {
        var segX2 = u16(b, off + 6);
        var ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
        fns.push(function (c) {
          if (c > 0xFFFF) return false;
          for (var s = 0; s < segX2; s += 2) {
            if (u16(b, ends + s) < c) continue;
            var st = u16(b, starts + s);
            if (st > c) return false;
            var ro = u16(b, ranges + s), dl = u16(b, deltas + s);
            if (!ro) return ((c + dl) & 0xFFFF) !== 0;
            var at = ranges + s + ro + 2 * (c - st);
            if (at + 2 > b.length) return false;
            var g = u16(b, at);
            return g !== 0 && ((g + dl) & 0xFFFF) !== 0;
          }
          return false;
        });
      } else if (f === 6) {
        var first = u16(b, off + 6), cnt = u16(b, off + 8);
        fns.push(function (c) { return c >= first && c < first + cnt && u16(b, off + 10 + 2 * (c - first)) !== 0; });
      } else if (f === 12 || f === 13) {
        var groups = u32(b, off + 12);
        fns.push(function (c) {
          for (var g = 0; g < groups; g++) {
            var r = off + 16 + g * 12;
            if (r + 12 > b.length) return false;
            var s0 = u32(b, r), e0 = u32(b, r + 4);
            if (c >= s0 && c <= e0) return f === 13 ? u32(b, r + 8) !== 0 : (u32(b, r + 8) + c - s0) !== 0;
          }
          return false;
        });
      }
    });
    return function (c) { for (var i = 0; i < fns.length; i++) { try { if (fns[i](c)) return true; } catch (e) { /* a broken subtable */ } } return false; };
  }
  var GLYPH_CHARS = 'ɛɔƐƆŋŊ';
  var ACCENT_CHARS = 'éèêëàâçôûùîïœÉÈÀÇ«»’';
  var LATIN_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function cps(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
  // info(tables) → { family, subfamily, fullName, weight, style, weightRange, kind, glyphs, accents, latin, missing }
  function info(tables) {
    var names = tables.name ? nameStrings(tables.name) : {};
    var out = {
      family: clean(names[16] || names[1] || ''), subfamily: clean(names[17] || names[2] || ''), fullName: clean(names[4] || ''),
      weight: 400, style: 'normal', weightRange: null, kind: null, glyphs: null, accents: null, latin: null, missing: []
    };
    var os2 = tables['OS/2'] && tables['OS/2'].data;
    if (os2 && os2.length >= 64) {
      var w = u16(os2, 4);
      if (w >= 1 && w <= 9) w *= 100; // a few old fonts count 1 to 9
      if (w >= 1 && w <= 1000) out.weight = w;
      var sel = u16(os2, 62);
      if (sel & 1 || sel & 512) out.style = 'italic';
      var fam = os2[32], serif = os2[33];
      if (fam === 2) out.kind = serif >= 11 && serif <= 15 ? 'sans' : (serif >= 2 && serif <= 10 ? 'serif' : null);
    } else if (tables.head && tables.head.data.length >= 46 && (u16(tables.head.data, 44) & 2)) out.style = 'italic';
    if (out.style === 'normal' && /italic|oblique/i.test(out.subfamily)) out.style = 'italic';
    if (!os2 && /bold/i.test(out.subfamily)) out.weight = 700;
    if (tables.fvar) {
      var fv = tables.fvar.data;
      try {
        var axOff = u16(fv, 4), axCount = u16(fv, 8), axSize = u16(fv, 10);
        for (var a = 0; a < axCount; a++) {
          var r = axOff + a * axSize;
          if (tagAt(fv, r) !== 'wght') continue;
          var mn = Math.round(fixed(fv, r + 4)), df = Math.round(fixed(fv, r + 8)), mx = Math.round(fixed(fv, r + 12));
          if (mn >= 1 && mx <= 1000 && mn < mx) { out.weightRange = [mn, mx]; if (df >= mn && df <= mx) out.weight = df; }
        }
      } catch (e) { /* no usable axis */ }
    }
    // Without a typographic family (name 16), some files carry their default instance's weight in the family name
    // (Google's static cuts of a variable font: « Josefin Sans Thin », style « Bold », weight 700): that word goes
    // when the style names another weight that matches the file's, or when a light word (Thin, Light) contradicts
    // a « Regular » file. « Archivo Black », style « Regular », weight 400, stays: display families are often
    // named after a heavy weight, rarely after a light one.
    if (!names[16]) {
      var mw = out.family.match(/^(.*\S)\s+(thin|hairline|extra ?light|ultra ?light|light|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy)$/i);
      var sw = weightWord(out.subfamily);
      var fw = mw ? weightWord(mw[2]) : null;
      var regular = /^(regular|normal|italic|oblique)$/i.test(out.subfamily);
      if (mw && fw !== out.weight && ((sw && sw === out.weight) || (regular && fw < 400 && out.weight >= 400))) out.family = mw[1];
    }
    if (!out.kind) out.kind = /serif|garamond|baskerville|bodoni|didot|caslon|times|antiqua|slab|roman/i.test(out.family) && !/sans/i.test(out.family) ? 'serif' : 'sans';
    if (tables.cmap) {
      try {
        var has = cmapHas(tables.cmap);
        var miss = function (s) { return cps(s).filter(function (c) { return !has(c); }).map(function (c) { return String.fromCharCode(c); }); };
        var mg = miss(GLYPH_CHARS), ma = miss(ACCENT_CHARS), ml = miss(LATIN_CHARS);
        out.glyphs = mg.length === 0;
        out.accents = ma.length === 0;
        out.latin = ml.length === 0;
        out.missing = ma.concat(mg);
      } catch (e) { /* unreadable cmap: unknown */ }
    }
    return out;
  }
  var WEIGHT_WORDS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
  function weightWord(s) {
    var k = String(s || '').toLowerCase().replace(/\s*italic$|\s*oblique$/, '').replace(/[\s-]/g, '');
    return WEIGHT_WORDS[k] || null;
  }
  // Names as they are shown: no control characters, no quotes or brackets, spaces collapsed
  function clean(s) {
    return String(s || '').replace(/[\u0000-\u001F\u007F-\u009F"'`\\<>{};]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  // read(bytes, { inflate, dict }) → Promise<{ format, size, family, subfamily, weight, style, weightRange, kind,
  // glyphs, accents, latin, missing }>. Errors: Error.code 'type' (not a font), 'collection' (.ttc), 'broken',
  // 'brotli-dict' (a WOFF2 that needs the static dictionary: call again with opts.dict), 'inflate'.
  function read(bytes, opts) {
    var b;
    try { b = toBytes(bytes); } catch (e) { return Promise.reject(e); }
    return readTables(b, opts).then(function (r) {
      var i = info(r.tables);
      i.format = r.format;
      i.size = b.length;
      return i;
    });
  }

  /* ------------------------------------------------------------------ TTF / OTF → WOFF (lighter, same font) */

  // toWoff(bytes, deflate) → Promise<Uint8Array>: every table zlib-compressed (deflate(bytes) → Promise<bytes>,
  // zlib format, e.g. CompressionStream('deflate')), kept as it is when that is not smaller. A WOFF is read by
  // every browser since 2012 and is usually 40 % lighter than the TTF.
  function toWoff(bytes, deflate) {
    try {
      var b = toBytes(bytes);
      var format = sniff(b);
      if (format !== 'ttf' && format !== 'otf') return Promise.reject(fail('type'));
      var tables = sfntTables(b);
      var tags = Object.keys(tables).sort();
      return Promise.all(tags.map(function (tag) {
        var raw = tables[tag].data;
        return Promise.resolve(deflate(raw)).then(function (z) { z = toBytes(z); return z.length < raw.length ? z : raw; }, function () { return raw; });
      })).then(function (packed) {
        var n = tags.length;
        var size = 44 + 20 * n;
        var sfnt = 12 + 16 * n;
        tags.forEach(function (tag, i) { size += (packed[i].length + 3) & ~3; sfnt += (tables[tag].data.length + 3) & ~3; });
        var out = new Uint8Array(size);
        var dv = new DataView(out.buffer);
        dv.setUint32(0, 0x774F4646);
        dv.setUint32(4, u32(b, 0));
        dv.setUint32(8, size);
        dv.setUint16(12, n);
        dv.setUint32(16, sfnt);
        dv.setUint16(20, 1);
        var off = 44 + 20 * n;
        tags.forEach(function (tag, i) {
          var r = 44 + i * 20;
          for (var k = 0; k < 4; k++) out[r + k] = tag.charCodeAt(k);
          dv.setUint32(r + 4, off);
          dv.setUint32(r + 8, packed[i].length);
          dv.setUint32(r + 12, tables[tag].data.length);
          dv.setUint32(r + 16, tables[tag].checksum >>> 0);
          out.set(packed[i], off);
          off += (packed[i].length + 3) & ~3;
        });
        return out;
      });
    } catch (e) { return Promise.reject(e); }
  }

  root.JeereFontFile = {
    FORMATS: FORMATS, GLYPH_CHARS: GLYPH_CHARS, ACCENT_CHARS: ACCENT_CHARS, DICT_SIZE: DICT_SIZE,
    sniff: sniff, read: read, readTables: readTables, info: info, toWoff: toWoff, brotliDecode: brotliDecode, clean: clean
  };
})();
