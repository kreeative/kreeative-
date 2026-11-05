/* DualEngine — raster.js
 * Simple Canvas2D rasteriser (Phase A reference renderer; the GPU renderer is Phase B).
 * Draws a laid-out document: rectangles with (clamped) radii or squircle paths, ellipses, solid /
 * linear / radial / conic fills, strokes (inside / center / outside), drop & inner shadows
 * (σ = blur / 2, the same convention as CSS), layer blur as a TRUE Gaussian with σ = radius / 2
 * (Figma semantics — this is the reference the K_BLUR calibration compares Chromium against),
 * opacity, blend modes, clipping, rotation. Text is drawn with fillText (excluded from the pixel
 * comparison). Images are drawn when an HTMLImageElement is supplied in opts.images[assetId].
 *
 *   DualEngine.raster.render(doc, layoutResult, ctx, { createCanvas, images, background })
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var deps = isNode ? { model: require('./model.js'), resolve: require('./resolve.js'), layout: require('./layout.js'), css: require('./css.js') } : global.DualEngine;
  var api = factory(deps);
  if (isNode) module.exports = api; else (global.DualEngine = global.DualEngine || {}).raster = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DE) {
  'use strict';
  var model = DE.model, R = DE.resolve, L = DE.layout, C = DE.css;

  var BLEND_OP = {
    normal: 'source-over', passThrough: 'source-over', darken: 'darken', multiply: 'multiply', colorBurn: 'color-burn', linearBurn: 'multiply',
    lighten: 'lighten', screen: 'screen', colorDodge: 'color-dodge', linearDodge: 'lighter', overlay: 'overlay', softLight: 'soft-light', hardLight: 'hard-light',
    difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity'
  };

  function rgba(c, mul) { var a = (c.a === undefined ? 1 : c.a) * (mul === undefined ? 1 : mul); return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')'; }

  /* ------------------------------------------------------------------ shapes */

  /** Border-box path of a node in its own coordinates, optionally inset/outset by `d` px. */
  function shapePath(rn, w, h, d, P2D) {
    d = d || 0;
    var p = new P2D();
    var x = -d, y = -d, W = w + 2 * d, H = h + 2 * d;
    if (W <= 0 || H <= 0) return p;
    if (rn.type === 'ellipse') { p.ellipse(w / 2, h / 2, W / 2, H / 2, 0, 0, Math.PI * 2); return p; }
    var cr = rn.corners || { tl: 0, tr: 0, br: 0, bl: 0 };
    if (C.hasSquircle(cr) && d === 0) return new P2D(C.squirclePath(w, h, cr));
    var r = C.effectiveRadii(cr, w, h);
    // outset radii grow by d (CSS: outer shadow / outside stroke corners are r + d), inset shrink
    var tl = Math.max(0, r.tl + d), tr = Math.max(0, r.tr + d), br = Math.max(0, r.br + d), bl = Math.max(0, r.bl + d);
    if (r.tl === 0) tl = Math.max(0, d); if (r.tr === 0) tr = Math.max(0, d); if (r.br === 0) br = Math.max(0, d); if (r.bl === 0) bl = Math.max(0, d);
    if (d < 0) { tl = r.tl > 0 ? Math.max(0, r.tl + d) : 0; tr = r.tr > 0 ? Math.max(0, r.tr + d) : 0; br = r.br > 0 ? Math.max(0, r.br + d) : 0; bl = r.bl > 0 ? Math.max(0, r.bl + d) : 0; }
    p.moveTo(x + tl, y);
    p.lineTo(x + W - tr, y); if (tr) p.arcTo(x + W, y, x + W, y + tr, tr);
    p.lineTo(x + W, y + H - br); if (br) p.arcTo(x + W, y + H, x + W - br, y + H, br);
    p.lineTo(x + bl, y + H); if (bl) p.arcTo(x, y + H, x, y + H - bl, bl);
    p.lineTo(x, y + tl); if (tl) p.arcTo(x, y, x + tl, y, tl);
    p.closePath();
    return p;
  }

  function fillStyleFor(ctx, paint, w, h) {
    if (paint.type === 'solid') return rgba(paint.color, paint.opacity);
    var stops = (paint.stops || []).slice().sort(function (a, b) { return a.position - b.position; });
    var grad;
    if (paint.type === 'linear') {
      var gg = C.gradientGeometry(paint), s = gg.start, e = gg.end;
      grad = ctx.createLinearGradient(s.x * w, s.y * h, e.x * w, e.y * h);
    } else if (paint.type === 'radial') {
      // elliptical (possibly rotated / skewed) radial: a unit-circle gradient mapped by the
      // gradient's pixel frame (centre + axes) at fill time
      grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad._frame = C.ellipseFrame(paint, w, h);
    } else if (paint.type === 'diamond') {
      grad = { _diamond: C.ellipseFrame(paint, w, h), stops: stops, opacity: paint.opacity };
      return grad;
    } else if (paint.type === 'angular') {
      var F = C.ellipseFrame(paint, w, h);
      var theta = Math.atan2(F.u.x, -F.u.y); // CSS: 0 = up, clockwise ; canvas conic: 0 = +x axis
      grad = ctx.createConicGradient(theta - Math.PI / 2, F.c.x, F.c.y);
    } else return 'rgba(0,0,0,0)';
    stops.forEach(function (st) { grad.addColorStop(Math.max(0, Math.min(1, st.position)), rgba(st.color, paint.opacity)); });
    return grad;
  }

  /** Clip to the shape, then paint in the gradient's pixel frame (centre c, axes u, v). */
  function fillInFrame(ctx, path, F, w, h, paint) {
    ctx.clip(path);
    var det = F.u.x * F.v.y - F.v.x * F.u.y;
    if (Math.abs(det) < 1e-9) return;
    ctx.transform(F.u.x, F.u.y, F.v.x, F.v.y, F.c.x, F.c.y);
    paint();
  }

  /* Shadow trick: draw the casting shape SHIFT device px to the left (off the visible area) and
   * offset its shadow by +SHIFT, so only the shadow is painted. Canvas shadow offsets are in device
   * space, so the user-space translation is M⁻¹·(−SHIFT, 0) (works for rotated/flipped nodes). */
  var SHIFT = 1e4;
  function shiftAway(ctx, M) {
    var a = M[0], b = M[1], c = M[2], d = M[3], det = a * d - b * c;
    if (Math.abs(det) < 1e-12) { ctx.translate(-SHIFT, 0); return; }
    ctx.translate(-SHIFT * d / det, SHIFT * b / det);
  }

  /* ------------------------------------------------------------------ gaussian blur (true kernel, σ = radius / 2) */

  function gaussianBlur(imageData, sigma) {
    if (sigma <= 0) return imageData;
    var w = imageData.width, h = imageData.height, src = imageData.data;
    var radius = Math.ceil(sigma * 3), size = radius * 2 + 1, kernel = new Float32Array(size), sum = 0;
    for (var i = 0; i < size; i++) { var x = i - radius; kernel[i] = Math.exp(-x * x / (2 * sigma * sigma)); sum += kernel[i]; }
    for (var j = 0; j < size; j++) kernel[j] /= sum;
    // premultiply
    var pm = new Float32Array(w * h * 4);
    for (var p = 0; p < w * h; p++) { var a = src[p * 4 + 3] / 255; pm[p * 4] = src[p * 4] * a; pm[p * 4 + 1] = src[p * 4 + 1] * a; pm[p * 4 + 2] = src[p * 4 + 2] * a; pm[p * 4 + 3] = a; }
    var tmp = new Float32Array(w * h * 4);
    // horizontal
    for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) {
      var r = 0, g = 0, b = 0, al = 0;
      for (var k = -radius; k <= radius; k++) { var sx = xx + k; if (sx < 0 || sx >= w) continue; var wgt = kernel[k + radius], idx = (y * w + sx) * 4; r += pm[idx] * wgt; g += pm[idx + 1] * wgt; b += pm[idx + 2] * wgt; al += pm[idx + 3] * wgt; }
      var o = (y * w + xx) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = al;
    }
    // vertical
    for (var x2 = 0; x2 < w; x2++) for (var y2 = 0; y2 < h; y2++) {
      var r2 = 0, g2 = 0, b2 = 0, a2 = 0;
      for (var k2 = -radius; k2 <= radius; k2++) { var sy = y2 + k2; if (sy < 0 || sy >= h) continue; var w2 = kernel[k2 + radius], id2 = (sy * w + x2) * 4; r2 += tmp[id2] * w2; g2 += tmp[id2 + 1] * w2; b2 += tmp[id2 + 2] * w2; a2 += tmp[id2 + 3] * w2; }
      var o2 = (y2 * w + x2) * 4;
      if (a2 > 1e-6) { src[o2] = Math.round(r2 / a2); src[o2 + 1] = Math.round(g2 / a2); src[o2 + 2] = Math.round(b2 / a2); } else { src[o2] = 0; src[o2 + 1] = 0; src[o2 + 2] = 0; }
      src[o2 + 3] = Math.round(Math.min(1, a2) * 255);
    }
    return imageData;
  }

  /* ------------------------------------------------------------------ renderer */

  function Renderer(doc, layout, opts) {
    this.doc = doc; this.layout = layout; this.opts = opts || {};
    this.createCanvas = this.opts.createCanvas || function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.P2D = this.opts.Path2D || (typeof Path2D !== 'undefined' ? Path2D : null);
    this.images = this.opts.images || {};
    this.bp = layout.breakpoint;
    this.origin = { x: 0, y: 0 };   // page coordinates of the current target canvas' origin
  }

  Renderer.prototype.resolved = function (node) { return R.resolveNode(this.doc, node, this.bp, this.opts.state); };

  /** Draw the whole page into ctx (page coordinates = canvas coordinates, origin top-left). */
  Renderer.prototype.render = function (ctx) {
    var self = this;
    if (this.opts.background) { ctx.save(); ctx.fillStyle = this.opts.background; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
    this.layout.roots.forEach(function (rid) { self.drawNode(ctx, self.doc.nodes[rid], [1, 0, 0, 1, 0, 0]); });
  };

  Renderer.prototype.drawNode = function (ctx, node, parentM) {
    var rn = this.resolved(node);
    if (rn.visible === false) return;
    var box = this.layout.boxes.get(node.id); if (!box) return;
    var M = L.mul(parentM, L.mul(L.translate(box.x, box.y), L.localTransform(box.w, box.h, rn.geometry.rotation, rn.geometry.flipH, rn.geometry.flipV)));
    var blur = (rn.effects || []).filter(function (e) { return e.visible !== false && e.type === 'layerBlur' && e.radius > 0; })[0];
    // a Normal (non pass-through) group is isolated (§3.3): its blending children composite inside
    // the group's own layer, never with what lies behind the group
    var isolated = node.children && node.children.length && (rn.blendMode === 'normal' || rn.isolate === true) && this.hasBlendingDescendant(node);
    var needsLayer = (rn.opacity !== undefined && rn.opacity < 1) || (rn.blendMode && rn.blendMode !== 'normal' && rn.blendMode !== 'passThrough') || blur || isolated;
    if (!needsLayer) { this.paintNode(ctx, rn, node, box, M); return; }
    // offscreen layer in page space, padded for the blur
    var world = this.layout.world.get(node.id) || { x: 0, y: 0, w: box.w, h: box.h };
    var padPx = 0;
    (rn.effects || []).forEach(function (e) { if (e.visible === false) return; if (e.type === 'dropShadow') padPx = Math.max(padPx, Math.abs(e.x) + Math.abs(e.y) + e.blur * 1.5 + (e.spread || 0)); });
    (rn.strokes || []).forEach(function (s) { if (s.visible !== false && typeof s.width === 'number') padPx = Math.max(padPx, s.width); });
    var sigma = blur ? blur.radius / 2 : 0;
    padPx += Math.ceil(sigma * 3) + 2;
    var ox = Math.floor(world.x - padPx), oy = Math.floor(world.y - padPx);
    var ow = Math.ceil(world.w + 2 * padPx) + 1, oh = Math.ceil(world.h + 2 * padPx) + 1;
    if (ow <= 0 || oh <= 0 || ow > 8192 || oh > 8192) { this.paintNode(ctx, rn, node, box, M); return; }
    var off = this.createCanvas(ow, oh), octx = off.getContext('2d');
    // M is expressed in the current canvas' space, whose origin is this.origin (page coords);
    // the layer canvas' origin is (ox, oy) in page coords.
    var parentOrigin = this.origin;
    var Mlayer = L.mul(L.translate(parentOrigin.x - ox, parentOrigin.y - oy), M);
    this.origin = { x: ox, y: oy };
    this.paintNode(octx, rn, node, box, Mlayer);
    this.origin = parentOrigin;
    if (sigma > 0) { var img = octx.getImageData(0, 0, ow, oh); gaussianBlur(img, sigma); octx.putImageData(img, 0, 0); }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = rn.opacity === undefined ? 1 : rn.opacity;
    ctx.globalCompositeOperation = BLEND_OP[rn.blendMode] || 'source-over';
    ctx.drawImage(off, ox - parentOrigin.x, oy - parentOrigin.y);
    ctx.restore();
  };

  Renderer.prototype.hasBlendingDescendant = function (node) {
    var self = this;
    return (node.children || []).some(function (cid) {
      var c = self.doc.nodes[cid]; if (!c) return false;
      var rc = self.resolved(c);
      if (rc.visible === false) return false;
      if (rc.blendMode && rc.blendMode !== 'normal' && rc.blendMode !== 'passThrough') return true;
      return rc.blendMode === 'passThrough' && self.hasBlendingDescendant(c);
    });
  };

  /**
   * Paint order of a container's children, as the exported CSS stacks them: flow children in tree
   * order, then absolute children of a stack / grid (z-index: 1); with reverseZ, decreasing z-index
   * (absolute children still on top, §2.4).
   */
  Renderer.prototype.paintOrder = function (node, rn) {
    var self = this, n = node.children.length, mode = rn.layoutParent && rn.layoutParent.mode;
    var rev = !!(rn.layoutParent && rn.layoutParent.reverseZ);
    return node.children.map(function (cid, idx) {
      var c = self.doc.nodes[cid], abs = !!(c && mode !== 'absolute' && self.resolved(c).layoutChild.position === 'absolute');
      var z = rev ? (abs ? 2 * n - idx : n - idx) : (abs ? n + idx : idx);
      return { id: cid, z: z, idx: idx };
    }).sort(function (a, b) { return a.z - b.z || a.idx - b.idx; }).map(function (x) { return x.id; });
  };

  Renderer.prototype.paintNode = function (ctx, rn, node, box, M) {
    var self = this, w = box.w, h = box.h, P2D = this.P2D;
    ctx.save();
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    var path = shapePath(rn, w, h, 0, P2D);
    var isText = rn.type === 'text';
    // ---- drop shadows (outside the border box), top effect first → draw in reverse order so the first is on top
    var effects = (rn.effects || []).filter(function (e) { return e.visible !== false; });
    var drops = effects.filter(function (e) { return e.type === 'dropShadow'; }).reverse();
    if (!isText) drops.forEach(function (e) {
      ctx.save();
      // clip out the box itself (CSS does not paint an outer shadow under the border box)
      var hole = new P2D(); hole.rect(-1e5, -1e5, 2e5, 2e5); hole.addPath(shapePath(rn, w, h, 0, P2D));
      ctx.clip(hole, 'evenodd');
      ctx.shadowColor = rgba(e.color); ctx.shadowBlur = e.blur; ctx.shadowOffsetX = e.x + SHIFT; ctx.shadowOffsetY = e.y;
      shiftAway(ctx, M);
      ctx.fillStyle = '#000';
      ctx.fill(shapePath(rn, w, h, e.spread || 0, P2D));
      ctx.restore();
    });
    // ---- outside / center strokes (the outer halves) are drawn under the fill? CSS box-shadow spread draws
    // under the element's background only where the background is transparent; the box itself is painted on top.
    var strokes = (rn.strokes || []).filter(function (s) { return s.visible !== false && s.paint && s.paint.type === 'solid'; });
    var sq = C.hasSquircle(rn.corners) && rn.type !== 'ellipse';
    if (!isText && rn.type !== 'line' && !sq) strokes.slice().reverse().forEach(function (s) {
      var wd = typeof s.width === 'number' ? s.width : 0; if (!wd) return;
      var outer = s.align === 'outside' ? wd : s.align === 'center' ? wd / 2 : 0;
      if (outer > 0) {
        ctx.save();
        var ring = new P2D(); ring.addPath(shapePath(rn, w, h, outer, P2D)); ring.addPath(path);
        ctx.fillStyle = rgba(s.paint.color, s.paint.opacity); ctx.fill(ring, 'evenodd');
        ctx.restore();
      }
    });
    // ---- fills (bottom first)
    if (!isText && rn.type !== 'line') (rn.fills || []).forEach(function (f) {
      if (f.visible === false) return;
      ctx.save();
      ctx.globalCompositeOperation = BLEND_OP[f.blend] || 'source-over';
      if (f.type === 'image') {
        var img = self.images[f.asset];
        ctx.clip(path);
        if (img) { ctx.drawImage(img, 0, 0, w, h); } else { ctx.fillStyle = '#ccc'; ctx.fill(path); }
      } else {
        var fs = fillStyleFor(ctx, f, w, h);
        if (fs && fs._frame) fillInFrame(ctx, path, fs._frame, w, h, function () { ctx.fillStyle = fs; ctx.fillRect(-1e4, -1e4, 2e4, 2e4); });
        else if (fs && fs._diamond) {
          // t = |u| + |v|: four quadrants, each the linear gradient ±u ± v (same as the SVG export)
          fillInFrame(ctx, path, fs._diamond, w, h, function () {
            [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (sg) {
              var g = ctx.createLinearGradient(0, 0, sg[0] * 0.5, sg[1] * 0.5);
              fs.stops.forEach(function (st) { g.addColorStop(Math.max(0, Math.min(1, st.position)), rgba(st.color, fs.opacity)); });
              ctx.fillStyle = g;
              ctx.fillRect(sg[0] > 0 ? -1e-3 : -1e4, sg[1] > 0 ? -1e-3 : -1e4, 1e4 + 1e-3, 1e4 + 1e-3);
            });
          });
        }
        else { ctx.fillStyle = fs; ctx.fill(path); }
      }
      ctx.restore();
    });
    // ---- inside strokes (and inner halves of centre strokes)
    if (!isText && rn.type !== 'line' && !sq) strokes.slice().reverse().forEach(function (s) {
      var wd = typeof s.width === 'number' ? s.width : 0; if (!wd) return;
      var inner = s.align === 'inside' ? wd : s.align === 'center' ? wd / 2 : 0;
      if (inner > 0) {
        ctx.save();
        var ring = new P2D(); ring.addPath(path); ring.addPath(shapePath(rn, w, h, -inner, P2D));
        ctx.fillStyle = rgba(s.paint.color, s.paint.opacity); ctx.fill(ring, 'evenodd');
        ctx.restore();
      }
    });
    // lines: an SVG <line> in the export (caps: butt / round / square)
    if (rn.type === 'line') strokes.slice(0, 1).forEach(function (s) {
      var wd = typeof s.width === 'number' ? s.width : 0; if (!wd) return;
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
      ctx.lineWidth = wd; ctx.lineCap = s.cap || 'butt'; ctx.strokeStyle = rgba(s.paint.color, s.paint.opacity);
      if (s.dash && s.dash[0] > 0) ctx.setLineDash([s.dash[0], s.dash[1] || s.dash[0]]);
      ctx.stroke(); ctx.restore();
    });
    // squircle strokes: the exported SVG ring (inside 2W clipped in, center W, outside 2W clipped out)
    if (!isText && sq) strokes.slice().reverse().forEach(function (s) {
      var wd = typeof s.width === 'number' ? s.width : 0; if (!wd || model.strokeMode(s) !== 'shadow') return;
      ctx.save();
      if (s.align === 'inside') ctx.clip(path);
      else if (s.align === 'outside') { var out = new P2D(); out.rect(-1e5, -1e5, 2e5, 2e5); out.addPath(path); ctx.clip(out, 'evenodd'); }
      ctx.lineWidth = s.align === 'center' ? wd : 2 * wd; ctx.strokeStyle = rgba(s.paint.color, s.paint.opacity);
      ctx.stroke(path); ctx.restore();
    });
    // ---- inner shadows
    var inners = effects.filter(function (e) { return e.type === 'innerShadow'; }).reverse();
    if (!isText) inners.forEach(function (e) {
      ctx.save();
      ctx.clip(path);
      // a frame around the (spread-inset) shape, wide enough for the blur and the offset but much
      // narrower than SHIFT, so that once moved away only its shadow lands inside the clip
      var reach = Math.abs(e.x) + Math.abs(e.y) + 3 * e.blur + Math.abs(e.spread || 0) + 4;
      var plate = new P2D(); plate.rect(-reach, -reach, w + 2 * reach, h + 2 * reach); plate.addPath(shapePath(rn, w, h, -(e.spread || 0), P2D));
      ctx.shadowColor = rgba(e.color); ctx.shadowBlur = e.blur; ctx.shadowOffsetX = e.x + SHIFT; ctx.shadowOffsetY = e.y;
      shiftAway(ctx, M);
      ctx.fillStyle = '#000'; ctx.fill(plate, 'evenodd');
      ctx.restore();
    });
    // ---- text
    if (isText) this.drawText(ctx, rn, node, box);
    // ---- children (clipped when the container clips)
    if (node.children && node.children.length) {
      if (rn.layoutParent && (rn.layoutParent.clip || rn.clipsContent)) ctx.clip(path);
      this.paintOrder(node, rn).forEach(function (cid) { var c = self.doc.nodes[cid]; if (c) self.drawNode(ctx, c, M); });
    }
    ctx.restore();
  };

  Renderer.prototype.drawText = function (ctx, rn, node, box) {
    var tm = this.layout.text.get(node.id); if (!tm) return;
    var st = rn.style, fill = (st.fills || [])[0];
    ctx.fillStyle = fill && fill.type === 'solid' ? rgba(fill.color, fill.opacity) : '#000';
    ctx.font = (st.italic ? 'italic ' : '') + (st.weight || 400) + ' ' + st.size + 'px "' + st.family + '", sans-serif';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = DE.text ? DE.text.letterSpacingPx(st) + 'px' : '0px';
    var off = 0;
    if (rn.resize === 'fixed' && st.verticalAlign === 'middle') off = (box.h - tm.contentHeight) / 2; else if (rn.resize === 'fixed' && st.verticalAlign === 'bottom') off = box.h - tm.contentHeight;
    tm.lines.forEach(function (l) {
      var x = 0;
      if (st.align === 'center') x = (box.w - l.width) / 2; else if (st.align === 'right') x = box.w - l.width;
      ctx.fillText(DE.text ? DE.text.applyCase(l.text, st.case) : l.text, x, l.baseline + off);
    });
  };

  /**
   * @param {Object} doc
   * @param {Object} layoutResult  from layout.js (rootPlacement 'flow')
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} [opts] { createCanvas, images, background, Path2D, state }
   */
  function render(doc, layoutResult, ctx, opts) { new Renderer(doc, layoutResult, opts).render(ctx); }

  return { render: render, Renderer: Renderer, shapePath: shapePath, gaussianBlur: gaussianBlur, fillStyleFor: fillStyleFor, BLEND_OP: BLEND_OP };
});
