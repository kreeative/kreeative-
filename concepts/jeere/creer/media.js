/*
 * Jeere — media.js: the seller's photos in Supabase Storage (classic script, deferred, no library).
 * Wave 2 of the Studio audit, item 9. Loaded after data.js and publish.js by the editor (creer/) and the
 * Studio (../studio/). Global: window.JeereMedia.
 *
 * Before: every photo she imported was shrunk to 800 px, JPEG, and kept as a base64 data URL inside the
 * fiche (0,9 Mo per store at most: 4 to 10 photos, blurry on a computer or a Retina screen).
 * Now, with a real Supabase session (JeerePublish.session()):
 *   - a photo is uploaded at once, in up to three WebP widths (640, 1280, 2048 px, never above her
 *     original), to the public bucket `store-media` under her own folder:
 *       store-media/<her user id>/<sha-256 of the largest file, 20 hex>-<width>.webp
 *     (row level security: she writes only under <auth.uid()>/; migration jeere_wave2);
 *   - the fiche keeps the URL of the largest width; render.js writes the srcset from the name;
 *   - at publication, every photo still inline (imported offline, before signing in, in demo mode) is
 *     uploaded and replaced by its URL in what is published (migrate). Already-sent photos are
 *     remembered ('jeere-media-map'), so a second publication uploads nothing again.
 * Without a session (the demo, offline work) photos stay data URLs, 1280 px at most (localStorage).
 *
 *   JeereMedia.importFile(file) → Promise { src, hosted: boolean, width, height } | Promise.reject(Error)
 *   JeereMedia.migrate(fiche)   → Promise { fiche, uploaded, failed }   (a copy; the input is not changed)
 *   JeereMedia.isHosted(src), JeereMedia.WIDTHS, JeereMedia.BUCKET
 */
(function () {
  'use strict';

  var D = window.JEERE_DATA || {};
  var SB_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var BUCKET = 'store-media';
  var WIDTHS = [640, 1280, 2048];
  var LOCAL_MAX = 1280;          // a data URL kept in this browser: 1280 px on the long side at most
  var QUALITY = 0.82;            // WebP quality of the hosted files
  var MAP_KEY = 'jeere-media-map';
  var MIN_INLINE = 1500;         // smaller data URLs (icons, a 1-px gif) stay inline
  var DATA_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

  function isHosted(v) { return typeof D.isMediaUrl === 'function' ? D.isMediaUrl(v) : /\/storage\/v1\/object\/public\/store-media\//.test(String(v || '')); }
  function session() {
    var P = window.JeerePublish;
    if (!P || typeof P.session !== 'function') return Promise.resolve(null);
    return P.session().then(function (s) { return s && s.token && /^[0-9a-f-]{36}$/i.test(s.userId || '') ? s : null; }, function () { return null; });
  }

  /* ------------------------------------------------------------------ images */

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('decode')); };
      img.src = src;
    });
  }
  function canvasOf(img, maxSide, fill) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('size');
    var s = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    var ctx = c.getContext('2d');
    if (fill) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function toBlob(c, type, q) {
    return new Promise(function (resolve, reject) {
      if (c.toBlob) c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('encode')); }, type, q);
      else reject(new Error('encode'));
    });
  }
  function sha(blob) {
    return blob.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 20);
    });
  }
  // The widths to make for an image of this long side: 640 / 1280 / 2048 under it, plus its own size when smaller
  function widthsFor(side) {
    var out = WIDTHS.filter(function (w) { return w < side; });
    var top = Math.min(side, WIDTHS[WIDTHS.length - 1]);
    if (out.indexOf(top) === -1) out.push(top);
    return out;
  }
  function publicUrl(path) { return SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path; }
  function put(path, blob, token) {
    return fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
      body: blob
    }).then(function (r) { if (!r.ok) throw new Error('upload ' + r.status); return true; });
  }

  // An image (loaded) → its WebP widths in Storage → the URL of the largest
  function uploadImage(img, sess) {
    var side = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    var ws = widthsFor(side);
    var top = ws[ws.length - 1];
    var canvases = ws.map(function (w) { return { w: w, c: canvasOf(img, w, false) }; });
    return Promise.all(canvases.map(function (x) { return toBlob(x.c, 'image/webp', QUALITY).then(function (b) { return { w: x.w, b: b }; }); })).then(function (blobs) {
      if (!blobs.length || blobs[0].b.type !== 'image/webp') throw new Error('webp');
      var big = blobs[blobs.length - 1];
      return sha(big.b).then(function (h) {
        var base = sess.userId.toLowerCase() + '/' + h;
        return Promise.all(blobs.map(function (x) { return put(base + '-' + x.w + '.webp', x.b, sess.token); })).then(function () {
          return { src: publicUrl(base + '-' + top + '.webp'), width: big.w };
        });
      });
    });
  }

  function readMap() { try { var o = JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function writeMap(m) {
    var keys = Object.keys(m);
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete m[k]; });
    try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch (e) { /* full: no memory, uploads again next time */ }
  }
  // A short fingerprint of a data URL (its length and samples), for the map — not a security hash
  function keyOf(dataUrl) {
    var s = String(dataUrl), h = 2166136261;
    for (var i = 0; i < s.length; i += Math.max(1, Math.floor(s.length / 4096))) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return s.length.toString(36) + '.' + h.toString(36);
  }

  /* ------------------------------------------------------------------ import */

  // A file she picked → hosted at once when signed in, else a data URL (1280 px, JPEG, as the demo did)
  function importFile(file) {
    if (!file || (file.type && !/^image\//.test(file.type))) return Promise.reject(new Error('type'));
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { return Promise.reject(e); }
    return loadImage(url).then(function (img) {
      return session().then(function (sess) {
        var local = function () {
          var c = canvasOf(img, LOCAL_MAX, true);
          return { src: c.toDataURL('image/jpeg', 0.85), hosted: false, width: c.width, height: c.height };
        };
        if (!sess) return local();
        return uploadImage(img, sess).then(function (r) {
          return { src: r.src, hosted: true, width: img.naturalWidth, height: img.naturalHeight };
        }, local); // Storage refused (bucket not ready, offline): kept in this browser, sent at publication
      });
    }).then(function (r) { URL.revokeObjectURL(url); return r; }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  /* ------------------------------------------------------------------ publication */

  // Every inline photo of the fiche (any key: section images, products, logo, element styles, detached
  // sections' assets) uploaded and replaced by its URL, in a copy. Without a session: the copy unchanged.
  function migrate(fiche) {
    var copy;
    try { copy = JSON.parse(JSON.stringify(fiche)); } catch (e) { return Promise.resolve({ fiche: fiche, uploaded: 0, failed: 0 }); }
    var spots = [];
    (function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (typeof v === 'string') {
          // the tab icon stays inline (a few kB, needed before anything loads)
          if (v.length >= MIN_INLINE && DATA_IMG.test(v) && !(path === 'store' && k === 'icon')) spots.push({ o: o, k: k, v: v });
        } else if (v && typeof v === 'object') walk(v, path ? path + '.' + k : k);
      });
    })(copy, '');
    if (!spots.length) return Promise.resolve({ fiche: copy, uploaded: 0, failed: 0 });
    return session().then(function (sess) {
      if (!sess) return { fiche: copy, uploaded: 0, failed: 0, offline: true };
      var map = readMap();
      var done = {}, uploaded = 0, failed = 0;
      var chain = Promise.resolve();
      spots.forEach(function (sp) {
        chain = chain.then(function () {
          var key = keyOf(sp.v);
          var known = map[key] || done[key];
          if (known && isHosted(known) && known.indexOf('/' + sess.userId.toLowerCase() + '/') !== -1) { sp.o[sp.k] = known; return null; }
          return loadImage(sp.v).then(function (img) { return uploadImage(img, sess); }).then(function (r) {
            sp.o[sp.k] = r.src; done[key] = map[key] = r.src; uploaded++;
          }, function () { failed++; });
        });
      });
      return chain.then(function () { writeMap(map); return { fiche: copy, uploaded: uploaded, failed: failed }; });
    });
  }

  window.JeereMedia = { importFile: importFile, migrate: migrate, isHosted: isHosted, WIDTHS: WIDTHS, BUCKET: BUCKET, LOCAL_MAX: LOCAL_MAX, _widthsFor: widthsFor };
})();
