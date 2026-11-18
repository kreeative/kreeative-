/*
 * Jehre — live.js: « En direct », the visitors of the store on a globe (#direct in the dashboard).
 * Global: window.JeereAdminLive = { view() → HTML }. admin.js calls view() for #direct.
 *
 * The data: public.store_visits, read through the function store_visits_live (her own store only), asked again
 * every 20 seconds while the page is open. The store pages write it (/api/visit): a city, never an address.
 * The globe is drawn here, on a canvas, with no library: the land is a grid of dots (LAND, 2° per dot, made from
 * the public world-atlas map), the visitors are the dots that pulse. She can turn it with a finger.
 */
(function () {
  'use strict';

  var SB = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var LAND = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAfAP8DAAAAAAAAAAAAAAAAAAAAAADo//z//wcAAAAAAAACAAAAAAAAAAAAhvvw//8PAPABAAAAwAMAAAAAAAAAwADkw////wEABAAAAABgAAAAAAAAAADAUT8A/v8PAAAAAAwA/j8AuAEAAAAAcBHtDcD/fwAAAAAwAPz/fwMAABCAAQD5w/wD8P8FAAAMAIL7DwCAAOx/AH8ggLFFDv8A4P//B/D/SAAAAAAAQIAPAAAAAODBB+D//x8AKAAEAAAAAAAAcwAAAABAB/7Af/j/YCgAAAAAAAAAAADw/////wEs4AEAAHz+////////////gL////8HeAAcAADg5///////////9ADgAf7/f4AnAAAAAH78////////H0QAAAiA//8f8AcAAIBB4////////38ADwAQAOD//5//AQAAHAT/////////A3AAAAAA/v//+T8AAGDz//////////8DAQAAAMD/////AwAAsP//////////LwAAAAAA6P///2IAAAD+//////////8CAAAAAAD///8/CAAA4P//////////JwAAAAAA8P///wYAAAD+/unz/////z8AAAAAAAD///8HAAAA/pgPPP//////MQAAAAAA8P//PwAAAMBD9v7n/////wcBAAAAAAD///8AAAAAPkD7f/7///8hEAAAAAAA4P//DwAAAIDhAv/n////f8YAAAAAAAD8//8AAAAA+AdE//////8jDwAAAAAAgP//AwAAAMD/APD/////PxgAAAAAAADw/x8AAAAA/n/v//////8HAAAAAAAAAPwDAgAAAOD////7////fwAAAAAAAACgHyAAAACA//9/f/7///8DAAAAAAAAAPQBAAAAAPj//+cv+P//PwAAAAAAAAAAHjAAAADA/////g/+//8EAAAAAAAAAOBhCAAAAP7//99/4D//AAAAAAAAAAAAPAMEAADA////+Qf84BcAAAAAAAAAAAA/AAAAAPz//58fgAf+QAAAAAAAAAAAAA8AAADg////ewA4gA8EAAAAAAAAAADAAAAAAPz//38BgAP4QQAAAAAAAAAAAAgPAADA////zwAwgAwQAAAAAAAAAAAA9Q8AAPj///8HAAVIAAAAAAAAAAAAAID/AQAA////fwBAAAAQAAAAAAAAAAAA+P8AAGDh//8DAAA0GAAAAAAAAAAAAID/HwAAAPj/HwAAgMIBAAAAAAAAAAAA/P8BAACA//8AAAAYXgAAAAAAAAAAAMD/fwAAAPz/BwAAAOOBAQAAAAAAAAAA/P8/AACA/z8AAABgbtQBAAAAAAAAAOD//w8AAPD/AwAAAAQIeAAAAAAAAAAA/P//AQAA/z8AAACAA4APAQAAAAAAAID//w8AAPD/AwAAAAARsEAAAAAAAAAA+P9/AAAA/j8AAAAAAAAAAAAAAAAAAAD//wcAAPD/QwAAAACAIwAAAAAAAAAA8P9/AAAA/z8EAAAAAD8GIAAAAAAAAAD8/wMAAPD/cQAAAAD4ZwAAAAAAAAAAgP8/AAAA/w8HAAAAgP8HAAAAAAAAAAD4/wMAAOD/MAAAAAD//wEBAAAAAAAAgP8PAAAA/g8DAAAA+P8fAAAAAAAAAAD4PwAAAOB/EAAAAID//wMAAAAAAAAAgP8DAAAA/AMAAAAA+P9/AAAAAAAAAAD8HwAAAMA/AAAAAID//wcAAAAAAAAAwP8BAAAA+AEAAAAA8P9/AAAAAAAAAAD8DwAAAIAPAAAAAAAP/gMAAAAAAAAAwB8AAAAAAAAAAAAAEIAfAAEAAAAAAAD+AwAAAAAAAAAAAAAA8AEgAAAAAAAA4AcAAAAAAAAAAAAAAAAAAAYAAAAAAABeAAAAAAAAAAAAAAAAwAAwAAAAAAAAwAMAAAAAAAAAAAAAAAAIgAEAAAAAAAAeAAAAAAAAAAAAAAAAAAAMAAAAAAAA4AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAABAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAB4AEDwn/8HAAAAAAAAAAAwAAAAAACA/P/h/////w8AAAAAAAAAwAcAAAD4////z///////PwAAAAAAHALwAACA//////////////8HAADw/y///wMAAP7/////////////HwAA+P///38AAID///////////////8AAPL/////BwAO////////////////DwAA8P////8HEPD//////////////z8AAOD/////////////////////////HwDgPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  var W = 180, H = 90, RAD = Math.PI / 180;
  var NB = ' ';

  var L = { storeId: '', data: null, error: '', loading: false, at: 0, timer: null, raf: 0, lon: 5, lat: 14, drag: null, spin: true, t0: 0 };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n) { return '<svg class="a-ico" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
  function storeRec() { try { var r = window.JeerePublish && window.JeerePublish.local(); return r && r.storeId && r.published ? r : null; } catch (e) { return null; } }
  function ext() { try { return !!(window.JeereTishe && window.JeereTishe.on()); } catch (e) { return false; } }

  // the land, once: a unit vector per dot
  var DOTS = null;
  function dots() {
    if (DOTS) return DOTS;
    var bin = atob(LAND), out = [];
    for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
      var k = j * W + i;
      if (!((bin.charCodeAt(k >> 3) >> (k & 7)) & 1)) continue;
      out.push(vec(90 - (j + 0.5) * 2, -180 + (i + 0.5) * 2));
    }
    DOTS = out;
    return out;
  }
  function vec(lat, lon) { var a = lat * RAD, o = lon * RAD; return [Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o)]; }
  // turn the globe so that (L.lon, L.lat) faces her; z > 0 is the side she sees
  function rot(v, cl, sl, ca, sa) {
    var x = v[0] * cl - v[2] * sl, z = v[0] * sl + v[2] * cl;
    return [x, v[1] * ca - z * sa, v[1] * sa + z * ca];
  }

  // The Ivory Sukundu is not a Jehre store: its visits are kept under its name (public.visit_sites)
  var EXT_SITE = 'the-ivory-sukundu';
  function target() {
    if (ext()) return { key: 'site:' + EXT_SITE, fn: 'site_visits_live', body: { p_site: EXT_SITE } };
    var rec = storeRec();
    return rec ? { key: rec.storeId, fn: 'store_visits_live', body: { p_store: rec.storeId } } : null;
  }
  function load() {
    var tg = target();
    if (!tg || L.loading) return;
    var A = window.JeereAuth;
    L.loading = true;
    Promise.resolve(A && typeof A.session === 'function' ? A.session() : null).catch(function () { return null; }).then(function (s) {
      if (!s || !s.access_token) throw new Error('Connectez-vous à votre compte Jehre pour voir vos visiteurs.');
      return fetch(SB + '/rest/v1/rpc/' + tg.fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(tg.body) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.ok !== true) throw new Error('Vos visiteurs n’ont pas pu être chargés.');
      if (tg.key !== L.storeId) return;               // she changed store meanwhile
      L.data = j; L.error = ''; L.at = Date.now();
    }).catch(function (e) { L.error = (e && e.message) || 'Pas de connexion internet.'; })
      .then(function () { L.loading = false; paint(); });
  }

  var names = null;
  function country(code) {
    try { names = names || new Intl.DisplayNames(['fr'], { type: 'region' }); return names.of(code) || code; } catch (e) { return code; }
  }
  function ago(iso) {
    var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + NB + 'min';
    return 'il y a ' + Math.round(s / 3600) + NB + 'h';
  }

  // the numbers and the lists, written into the page without drawing it again (the globe keeps turning)
  function paint() {
    var d = L.data, $ = function (id) { return document.getElementById(id); };
    if (!$('lv-now')) return;
    $('lv-now').textContent = d ? String(d.now) : '–';
    $('lv-today').textContent = d ? String(d.today) : '–';
    $('lv-week').textContent = d ? String(d.week) : '–';
    $('lv-dot').className = 'lv-dot' + (d && d.now > 0 ? ' is-on' : '');
    var err = $('lv-err'); err.hidden = !L.error; err.textContent = L.error;
    var c = (d && d.countries) || [], max = c.length ? c[0].n : 1;
    $('lv-countries').innerHTML = c.length ? c.map(function (x) {
      return '<li><span class="lv-c__name">' + esc(country(x.country)) + '</span><span class="lv-c__bar"><i style="width:' + Math.max(6, Math.round(100 * x.n / max)) + '%"></i></span><span class="lv-c__n">' + x.n + '</span></li>';
    }).join('') : '<li class="lv-none">Pas encore de visite ces dernières 24' + NB + 'heures.</li>';
    var p = ((d && d.points) || []).slice(0, 6);
    $('lv-last').innerHTML = p.length ? p.map(function (x) {
      return '<li><span class="lv-dot' + (x.live ? ' is-on' : '') + '"></span><span class="lv-l__where">' + esc([x.city, x.country ? country(x.country) : ''].filter(Boolean).join(', ') || 'Lieu inconnu') + '</span><span class="lv-l__when">' + esc(ago(x.at)) + '</span></li>';
    }).join('') : '<li class="lv-none">Partagez le lien de votre boutique : vos visiteurs apparaîtront ici.</li>';
  }

  function draw(now) {
    var cv = document.getElementById('lv-globe');
    if (!cv) { stop(); return; }
    L.raf = requestAnimationFrame(draw);
    var box = cv.parentNode.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    var size = Math.max(240, Math.min(box.width, 620));
    if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px'; }
    var g = cv.getContext('2d'), R = size * 0.46, cx = size / 2, cy = size / 2;
    if (L.spin && !L.drag) L.lon += 0.06;
    var cl = Math.cos(-L.lon * RAD), sl = Math.sin(-L.lon * RAD), ca = Math.cos(L.lat * RAD), sa = Math.sin(L.lat * RAD);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    // the sphere
    var sh = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sh.addColorStop(0, '#FFFFFF'); sh.addColorStop(1, '#ECECE8');
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fillStyle = sh; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(17,17,17,.10)'; g.stroke();
    // the land
    var ds = dots(), r0 = Math.max(1, R / 150);
    g.fillStyle = '#111111';
    for (var i = 0; i < ds.length; i++) {
      var v = rot(ds[i], cl, sl, ca, sa);
      if (v[2] <= 0.02) continue;
      g.globalAlpha = 0.16 + 0.34 * v[2];
      g.beginPath(); g.arc(cx + v[0] * R, cy - v[1] * R, r0 * (0.55 + 0.6 * v[2]), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    // the visitors: the ones here now pulse
    var pts = (L.data && L.data.points) || [], t = (now || 0) / 1000;
    for (var k = pts.length - 1; k >= 0; k--) {
      var pt = pts[k], w = rot(vec(pt.lat, pt.lon), cl, sl, ca, sa);
      if (w[2] <= 0.05) continue;
      var x = cx + w[0] * R, y = cy - w[1] * R;
      if (pt.live) {
        var ph = (t * 0.8 + k * 0.37) % 1;
        g.beginPath(); g.arc(x, y, 5 + ph * 22, 0, 6.2832); g.strokeStyle = 'rgba(34,201,126,' + (0.7 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.fillStyle = 'rgb(34,201,126)'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      } else {
        g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.fillStyle = '#111'; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
      }
    }
  }
  function stop() {
    cancelAnimationFrame(L.raf); L.raf = 0;
    clearInterval(L.timer); L.timer = null;
  }
  function start() {
    if (!L.raf) L.raf = requestAnimationFrame(draw);
    if (!L.timer) L.timer = setInterval(function () { if (document.getElementById('lv-globe')) { if (!document.hidden) load(); } else stop(); }, 20000);
    paint();
    if (!L.data || Date.now() - L.at > 15000) load();
  }

  // turn it with a finger or the mouse
  document.addEventListener('pointerdown', function (e) {
    var cv = e.target && e.target.id === 'lv-globe' ? e.target : null;
    if (!cv) return;
    L.drag = { x: e.clientX, y: e.clientY, lon: L.lon, lat: L.lat };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  });
  document.addEventListener('pointermove', function (e) {
    if (!L.drag) return;
    L.lon = L.drag.lon - (e.clientX - L.drag.x) * 0.35;
    L.lat = Math.max(-70, Math.min(70, L.drag.lat + (e.clientY - L.drag.y) * 0.35));
  });
  ['pointerup', 'pointercancel'].forEach(function (n) { document.addEventListener(n, function () { L.drag = null; }); });

  function head(sub) {
    return '<header class="a-ph"><div class="a-ph__txt"><h1 class="a-h1" tabindex="-1">En direct</h1><p class="a-sub">' + sub + '</p></div></header>';
  }
  function note(icon, title, text) {
    return '<section class="a-card"><div class="a-empty"><span class="a-empty__ico">' + ico(icon) + '</span><p class="a-empty__title">' + title + '</p><p class="a-empty__text">' + text + '</p></div></section>';
  }

  function view() {
    var tg = target();
    if (!tg) return '<div class="a-page">' + head('Qui regarde votre boutique, et d’où.') + note('globe', 'Mettez d’abord votre boutique en ligne', 'Dès qu’elle est publiée, chaque visite apparaît ici, sur le globe.') + '</div>';
    if (tg.key !== L.storeId) { L.storeId = tg.key; L.data = null; L.error = ''; L.at = 0; }
    setTimeout(start, 0);
    return '<div class="a-page lv">' + head('Qui regarde votre boutique, et d’où. Mis à jour toutes les 20' + NB + 'secondes.') +
      '<p class="a-error" id="lv-err" hidden></p>' +
      '<div class="lv-grid">' +
        '<section class="a-card lv-stage"><div class="lv-globe"><canvas id="lv-globe" aria-label="Globe des visiteurs de votre boutique" role="img"></canvas></div>' +
          '<p class="lv-legend"><span><i class="lv-dot is-on"></i>En ce moment</span><span><i class="lv-dot"></i>Ces dernières 24' + NB + 'heures</span></p></section>' +
        '<div class="lv-side">' +
          '<section class="a-card lv-nums">' +
            '<div class="lv-num lv-num--big"><span class="lv-num__l"><i class="lv-dot" id="lv-dot"></i>En ce moment</span><strong id="lv-now">–</strong></div>' +
            '<div class="lv-num"><span class="lv-num__l">24' + NB + 'heures</span><strong id="lv-today">–</strong></div>' +
            '<div class="lv-num"><span class="lv-num__l">7' + NB + 'jours</span><strong id="lv-week">–</strong></div>' +
          '</section>' +
          '<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Par pays</h2></div><ul class="lv-countries" id="lv-countries"></ul></section>' +
          '<section class="a-card"><div class="a-card__head"><h2 class="a-card__title">Dernières visites</h2></div><ul class="lv-last" id="lv-last"></ul></section>' +
        '</div>' +
      '</div>' +
      '<p class="a-small lv-foot">' + ico('info') + 'Jehre garde la ville d’où vient une visite, jamais l’adresse de l’appareil. Les visites de plus de 30' + NB + 'jours sont effacées.</p>' +
    '</div>';
  }

  window.JeereAdminLive = { view: view, state: function () { return L; } };
})();
