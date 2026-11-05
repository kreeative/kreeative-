/* Conformance — in-page helpers (injected by harness.js into the raster page after the engine):
 *   DualEngineConformance.renderEngine(doc, bp, width, height, kBlurRef) → { dataUrl, masks, boxes }
 *   DualEngineConformance.compare(dataUrlA, dataUrlB, masks) → { mean, max, pctOver5, count, diffDataUrl }
 * ΔE00 (CIEDE2000) between sRGB pixels; masked rectangles (text) are excluded.
 */
(function (global) {
  'use strict';
  var DE = global.DualEngine;

  function srgbToLab(r, g, b) {
    function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var R = lin(r), G = lin(g), B = lin(b);
    var X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    var Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.0;
    var Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE00(lab1, lab2) {
    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2], L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    var kL = 1, kC = 1, kH = 1;
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2), Cb = (C1 + C2) / 2;
    var G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
    function hp(a, b) { if (a === 0 && b === 0) return 0; var h = Math.atan2(b, a) * 180 / Math.PI; return h < 0 ? h + 360 : h; }
    var h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    var dLp = L2 - L1, dCp = C2p - C1p, dhp;
    if (C1p * C2p === 0) dhp = 0; else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p; else if (h2p - h1p > 180) dhp = h2p - h1p - 360; else dhp = h2p - h1p + 360;
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * Math.PI / 180);
    var Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p; else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2; else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2; else hbp = (h1p + h2p - 360) / 2;
    var T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180) + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
    var dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    var RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    var SL = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    var SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    var RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
    return Math.sqrt(Math.pow(dLp / (kL * SL), 2) + Math.pow(dCp / (kC * SC), 2) + Math.pow(dHp / (kH * SH), 2) + RT * (dCp / (kC * SC)) * (dHp / (kH * SH)));
  }

  function loadImage(dataUrl) {
    return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = dataUrl; });
  }

  /** Lay out + rasterise a fixture document with the engine (table measurer, like Node). */
  function renderEngine(doc, bp, width, height) {
    var eng = new DE.layout.LayoutEngine(doc, { measurer: DE.text.createTableMeasurer(), rootPlacement: 'flow' });
    var lay = eng.layout(bp || 'base');
    var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    var ctx = canvas.getContext('2d');
    DE.raster.render(doc, lay, ctx, { background: '#ffffff' });
    var masks = [];
    Object.keys(doc.nodes).forEach(function (id) {
      var n = doc.nodes[id]; var w = lay.world.get(id);
      if (n.type === 'text' && w) masks.push({ x: w.x - 3, y: w.y - 3, w: w.w + 6, h: w.h + 6 });
      if ((n.type === 'image' || n.type === 'vector') && w) masks.push({ x: w.x - 1, y: w.y - 1, w: w.w + 2, h: w.h + 2 });
    });
    var boxes = {};
    lay.world.forEach(function (b, id) { boxes[id] = b; });
    return { dataUrl: canvas.toDataURL('image/png'), masks: masks, boxes: boxes };
  }

  async function compare(dataUrlA, dataUrlB, masks, opts) {
    opts = opts || {};
    var a = await loadImage(dataUrlA), b = await loadImage(dataUrlB);
    var w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    var ca = document.createElement('canvas'); ca.width = w; ca.height = h; var xa = ca.getContext('2d'); xa.drawImage(a, 0, 0);
    var cb = document.createElement('canvas'); cb.width = w; cb.height = h; var xb = cb.getContext('2d'); xb.drawImage(b, 0, 0);
    var da = xa.getImageData(0, 0, w, h).data, db = xb.getImageData(0, 0, w, h).data;
    var mask = new Uint8Array(w * h);
    (masks || []).forEach(function (m) {
      var x0 = Math.max(0, Math.floor(m.x)), y0 = Math.max(0, Math.floor(m.y)), x1 = Math.min(w, Math.ceil(m.x + m.w)), y1 = Math.min(h, Math.ceil(m.y + m.h));
      for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) mask[y * w + x] = 1;
    });
    var sum = 0, max = 0, over5 = 0, count = 0;
    var diff = opts.diff ? document.createElement('canvas') : null, dctx = null, dimg = null;
    if (diff) { diff.width = w; diff.height = h; dctx = diff.getContext('2d'); dimg = dctx.createImageData(w, h); }
    var cache = {};
    for (var i = 0; i < w * h; i++) {
      if (mask[i]) { if (dimg) { dimg.data[i * 4] = 40; dimg.data[i * 4 + 1] = 40; dimg.data[i * 4 + 2] = 40; dimg.data[i * 4 + 3] = 255; } continue; }
      var o = i * 4;
      // composite over white (screenshots are opaque; engine canvas too)
      var ka = (da[o] << 16) | (da[o + 1] << 8) | da[o + 2], kb = (db[o] << 16) | (db[o + 1] << 8) | db[o + 2];
      var e;
      if (ka === kb) e = 0;
      else {
        var la = cache[ka] || (cache[ka] = srgbToLab(da[o], da[o + 1], da[o + 2]));
        var lb = cache[kb] || (cache[kb] = srgbToLab(db[o], db[o + 1], db[o + 2]));
        e = deltaE00(la, lb);
      }
      sum += e; count++; if (e > max) max = e; if (e > 5) over5++;
      if (dimg) { var v = Math.min(255, Math.round(e * 25)); dimg.data[o] = v; dimg.data[o + 1] = e > 5 ? 0 : v; dimg.data[o + 2] = e > 5 ? 0 : v; dimg.data[o + 3] = 255; }
    }
    var out = { mean: count ? sum / count : 0, max: max, pctOver5: count ? over5 / count * 100 : 0, count: count, width: w, height: h };
    if (dimg) { dctx.putImageData(dimg, 0, 0); out.diffDataUrl = diff.toDataURL('image/png'); }
    return out;
  }

  global.DualEngineConformance = { renderEngine: renderEngine, compare: compare, deltaE00: deltaE00, srgbToLab: srgbToLab };
})(window);
