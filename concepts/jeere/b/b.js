/*
 * Jeere — b.js: the public store page (classic script, deferred, no library).
 *
 * Which store:
 *   https://jeere.kreeative.xyz/b/<slug>       (vercel.json routes /b/<slug> on that host to this page)
 *   …/concepts/jeere/b/?s=<slug>                (any host: kreeative.xyz, previews, a local server)
 *   https://<her own domain>/…                  (any host that is not Jeere's: the store whose
 *                                                stores.custom_domain is location.host)
 *   …/concepts/jeere/b/?domaine=<domain>        (on a Jeere host: what her domain will show)
 * The published fiche comes from Supabase (REST, publishable key, JeerePublish.fetchPublished) and is
 * drawn by creer/render.js + store.css: home, product, cart, checkout, the seller's pages. The page in
 * view is in the hash (#produit/p2, #panier, #paiement, #page/a-propos), so Back works and a product
 * link can be shared. Detached Studio sections load the DualEngine on demand (creer/engine-sections.js).
 *
 * Ordering: the store's checkout has no real payment yet, so « Payer » / « Confirmer la commande »
 * prepares the order as a WhatsApp message to the shop (its number from the fiche) and says so; the
 * preview's demo confirmation (« Commande n° 1042 ») is never shown to a real customer.
 * Global: window.JeereStorePage (for tests): { state, reload }.
 */
(function () {
  'use strict';

  var D = window.JEERE_DATA, R = window.JeereRender, P = window.JeerePublish;
  var NB = ' ';
  var main = document.getElementById('jb-main');
  var JEERE_HOST = /^(jeere\.kreeative\.xyz|kreeative\.xyz|localhost|127\.0\.0\.1|\[::1\])$|\.kreeative\.xyz$|\.vercel\.app$/;
  // The hand-drawn cloud (the same simplified trace as render.js's « Propulsé par Jeere »)
  var CLOUD = '<svg class="jb-cloud" viewBox="0 0 600 446" aria-hidden="true" focusable="false" fill="currentColor"><path fill-rule="evenodd" d="M159 439C124 431 112 426 80 402C67 393 54 386 51 387C44 388 24 363 21 349C19 342 17 338 15 338C13 338 0 279 0 269C0 268 2 267 5 268C9 270 11 266 13 257C16 241 49 204 68 195C77 191 81 187 81 180C82 158 83 153 100 131C117 108 144 90 163 90C169 90 174 84 182 67C212 4 276 -15 332 22C345 30 351 31 375 32C413 32 423 39 435 72C438 81 439 82 452 78C492 67 526 96 525 140C525 163 525 163 542 168C616 188 617 343 543 407C509 435 443 447 411 430C400 425 397 425 373 431C346 438 290 434 280 424C274 418 267 419 255 428C232 445 202 448 159 439ZM339 392C358 388 362 382 354 365C346 348 350 340 369 339C377 338 386 337 388 336C396 333 410 347 418 363C426 381 436 385 459 378C539 357 583 280 542 235C530 222 518 219 523 230C524 233 523 237 521 240C519 244 518 243 518 235C518 230 516 225 514 225C512 225 510 230 510 236C510 246 505 251 495 251C493 251 487 247 481 241C475 235 468 231 466 232C463 232 461 230 461 227C461 224 458 221 454 221C447 221 440 206 444 199C446 197 445 195 443 195C441 195 439 193 439 191C439 189 441 188 445 189C450 191 465 184 465 179C465 174 444 176 439 181C434 185 434 185 438 179C441 175 450 172 462 172C492 170 499 134 472 124C457 119 441 119 444 124C446 126 445 128 443 128C434 128 427 140 430 152C432 166 429 181 424 178C422 177 421 174 422 171C424 167 423 165 420 165C418 165 416 168 416 171C416 174 413 178 409 181C405 183 401 189 401 193C401 200 400 200 396 195C394 191 390 189 387 190C385 191 382 189 382 186C382 183 380 180 376 180C370 180 370 180 376 175C380 172 382 167 382 164C382 154 372 157 368 168C366 175 364 176 364 171C364 168 368 160 374 155C384 145 392 129 396 110C399 100 381 82 370 83C357 85 354 104 364 115C372 124 369 128 361 119C355 113 355 121 360 131C366 142 346 155 341 145C339 142 335 139 332 139C329 139 326 137 326 134C326 130 326 130 323 134C317 145 304 119 304 94C304 66 300 58 283 55C237 48 205 86 223 129C230 146 230 161 223 164C221 165 217 169 216 173C210 196 191 185 175 149C170 137 167 136 151 146C133 157 129 195 145 201C153 203 171 236 165 236C163 236 161 235 161 232C161 230 159 229 157 229C155 229 154 232 155 236C159 247 149 256 135 255C95 252 96 252 87 270C59 324 110 379 188 379C220 379 221 378 218 372C215 366 215 364 221 362C226 360 229 355 231 344C238 302 281 310 281 354C281 376 292 390 309 391C314 392 317 393 316 395C315 397 316 398 320 396C323 395 332 393 339 392ZM416 368C416 367 413 361 409 354C401 342 398 350 405 364C409 371 416 374 416 368ZM556 318C562 306 566 293 565 288C564 281 563 283 559 296C556 306 550 318 545 325C535 338 534 343 541 340C544 339 550 329 556 318ZM253 292C244 283 241 246 247 227C264 178 305 213 292 265C284 298 268 309 253 292ZM347 288C326 263 338 199 363 199C385 199 398 234 388 271C380 302 364 308 347 288Z"/></svg>';
  var WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.7z"/></svg>';
  var S = { target: null, store: null, config: null, root: null, device: 'phone', view: { page: 'home', productId: null, pageId: null }, status: 'loading' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fr(s) { return String(s).replace(/ ([:;!?»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function price(n) { try { return D.formatPrice(n).replace(/\s/g, NB); } catch (e) { return Math.round(n) + NB + 'FCFA'; } }
  function landing() { return JEERE_HOST.test(location.hostname) ? document.baseURI.replace(/b\/?$/, '') : 'https://jeere.kreeative.xyz/'; }

  /* ---------------------------------------------------------------- which store */

  function target() {
    var q = {};
    location.search.slice(1).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* bad escape */ } } });
    var host = location.hostname.toLowerCase();
    if (!JEERE_HOST.test(host)) return { host: host };
    var s = q.s || '';
    if (!s) { var m = /\/b\/([A-Za-z0-9-]+)\/?$/.exec(location.pathname); if (m) s = m[1]; }
    if (!s && q.domaine) return { host: String(q.domaine).toLowerCase() };
    return { slug: String(s).toLowerCase() };
  }

  /* ---------------------------------------------------------------- the page in view (hash) */

  function fromHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    var cfg = S.config || {};
    if (/^produit\//.test(h)) { var id = h.slice(8); if ((cfg.products || []).some(function (p) { return p.id === id; })) return { page: 'product', productId: id, pageId: null }; }
    if (h === 'panier') return { page: 'cart', productId: null, pageId: null };
    if (h === 'paiement') return { page: 'checkout', productId: null, pageId: null };
    if (/^page\//.test(h)) {
      var slug = h.slice(5);
      var pg = (cfg.pages || []).filter(function (x) { return x.slug === slug || x.id === slug; })[0];
      if (pg) return { page: 'page', productId: null, pageId: pg.id };
    }
    return { page: 'home', productId: null, pageId: null };
  }
  function hashFor(v) {
    if (v.page === 'product' && v.productId) return '#produit/' + v.productId;
    if (v.page === 'cart') return '#panier';
    if (v.page === 'checkout') return '#paiement';
    if (v.page === 'page' && v.pageId) {
      var pg = ((S.config && S.config.pages) || []).filter(function (x) { return x.id === v.pageId; })[0];
      return '#page/' + (pg && pg.slug ? pg.slug : v.pageId);
    }
    return '';
  }

  /* ---------------------------------------------------------------- states */

  function setTitle(t) { document.title = t; }
  function meta(name, content, prop) {
    var sel = prop ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var m = document.head.querySelector(sel);
    if (!m) { m = document.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', name); document.head.appendChild(m); }
    m.setAttribute('content', content);
  }
  function stateView(kind) {
    S.status = kind;
    main.setAttribute('aria-busy', 'false');
    var t = S.target || {};
    var asked = t.host ? t.host : (t.slug ? (D && D.storeAddress ? D.storeAddress(t.slug) : t.slug) : '');
    var h;
    if (kind === 'network') {
      setTitle('Connexion impossible · Jeere');
      h = '<div class="jb-state" role="alert">' + CLOUD + '<h1 class="jb-title">Connexion impossible</h1>' +
        '<p>' + esc(fr('Nous n’avons pas pu charger la boutique. Vérifiez votre connexion internet, puis réessayez.')) + '</p>' +
        '<div class="jb-actions"><button class="jb-btn jb-btn--primary" type="button" id="jb-retry">Réessayer</button></div></div>';
    } else {
      setTitle('Boutique introuvable · Jeere');
      meta('robots', 'noindex');
      h = '<div class="jb-state">' + CLOUD + '<h1 class="jb-title">Boutique introuvable</h1>' +
        '<p>' + (asked ? esc(fr('Aucune boutique en ligne à l’adresse ')) + '<span class="jb-code">' + esc(asked) + '</span>. ' : '') +
        esc(fr('Vérifiez l’adresse, ou demandez le bon lien à la boutique : elle n’est peut-être pas encore publiée.')) + '</p>' +
        '<div class="jb-actions"><a class="jb-btn jb-btn--primary" href="' + esc(landing()) + '">Créer ma boutique avec Jeere</a></div></div>';
    }
    main.innerHTML = h;
    var r = document.getElementById('jb-retry');
    if (r) r.addEventListener('click', load);
    var t1 = main.querySelector('h1');
    if (t1) { t1.setAttribute('tabindex', '-1'); }
  }

  /* ---------------------------------------------------------------- the store */

  function deviceFor() { return window.innerWidth >= 900 ? 'desktop' : 'phone'; }
  function draw(scrollTop) {
    if (!S.root || !S.config) return;
    try { R.render(S.config, S.root, { device: S.device, page: S.view.page, productId: S.view.productId, pageId: S.view.pageId }); } catch (e) { /* render never throws, but stay safe */ }
    orderBar();
    if (scrollTop) try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  function headMeta(cfg, store) {
    var st = cfg.store || {};
    var name = st.name || 'Boutique';
    var desc = st.tagline || (cfg.sections || []).map(function (s) { return s && s.settings && (s.settings.subtitle || s.settings.text); }).filter(Boolean)[0] || ('Boutique en ligne' + (st.city ? ' à ' + st.city : '') + ' : commandez sur WhatsApp, payez par mobile money ou à la livraison.');
    desc = String(desc).replace(/\s+/g, ' ').slice(0, 160);
    setTitle(name + (st.city ? ' · ' + st.city : '') + ' · Boutique en ligne');
    meta('description', desc);
    meta('og:title', name, true);
    meta('og:description', desc, true);
    meta('og:url', location.href.replace(/#.*$/, ''), true);
    // A share image must be a public URL: a demo photo of the store, else Jeere's
    var img = '';
    try {
      var hero = (cfg.sections || []).filter(function (s) { return s && s.type === 'hero'; })[0];
      var id = hero && hero.settings ? hero.settings.photo : '';
      var p0 = (cfg.products || []).filter(function (p) { return p && p.photo; })[0];
      var info = (id && R.photoInfo(id)) || (p0 && R.photoInfo(p0.photo));
      if (info && info.src) img = new URL(info.src, document.baseURI).href;
    } catch (e) { img = ''; }
    meta('og:image', img || 'https://jeere.kreeative.xyz/img/og.jpg', true);
    var color = (S.root && S.root.style.getPropertyValue('--st-bg').trim()) || '#FFFFFF';
    meta('theme-color', color);
    if (!store.show_badge) document.body.classList.add('jb-nobadge');
  }

  function badgeRow(show) {
    var old = document.getElementById('jb-badge-row');
    if (old) old.remove();
    if (!show) return;
    var row = document.createElement('div');
    row.className = 'jb-badge-row';
    row.id = 'jb-badge-row';
    row.innerHTML = '<a class="jb-badge" href="' + esc(landing()) + '?utm_source=badge" target="_blank" rel="noopener">' + CLOUD.replace('jb-cloud', 'jb-badge__m') + '<span>Fait avec Jeere</span></a>';
    main.appendChild(row);
  }

  /* ---------------------------------------------------------------- ordering on WhatsApp */

  function zones() {
    var cfg = S.config || {};
    var out = [];
    (cfg.sections || []).forEach(function (s) { if (!out.length && s && s.type === 'delivery' && s.settings && Array.isArray(s.settings.zones)) out = s.settings.zones; });
    if (!out.length && D && Array.isArray(D.communes)) out = D.communes;
    return out;
  }
  function orderLines() {
    var cart = (S.root && S.root.__jstCart) || {};
    var prods = (S.config && S.config.products) || [];
    var lines = [], total = 0;
    Object.keys(cart).forEach(function (id) {
      var p = prods.filter(function (x) { return x.id === id; })[0];
      var q = Math.max(1, Math.round(Number(cart[id]) || 1));
      if (!p) return;
      var pr = Math.max(0, Math.round(Number(p.price) || 0));
      total += pr * q;
      lines.push({ name: p.name || 'Produit', qty: q, amount: pr * q });
    });
    return { lines: lines, total: total };
  }
  function waNumber() {
    var w = S.config && S.config.store ? String(S.config.store.whatsapp || '') : '';
    var d = w.replace(/\D/g, '');
    return d.length >= 8 ? d : '';
  }
  function orderMessage() {
    var o = orderLines();
    var f = (S.root && S.root.__jstForm) || {};
    var z = zones().filter(function (x) { return x && x.name === f.commune; })[0];
    var fee = z && isFinite(Number(z.fee)) ? Math.round(Number(z.fee)) : 0;
    var pay = D && Array.isArray(D.PAYMENTS) ? (D.PAYMENTS.filter(function (x) { return x.key === f.pay; })[0] || {}).label : '';
    var name = (S.config.store && S.config.store.name) || 'la boutique';
    var t = 'Bonjour ' + name + ', je voudrais commander :\n';
    o.lines.forEach(function (l) { t += '• ' + l.qty + ' × ' + l.name + ' — ' + price(l.amount) + '\n'; });
    if (f.commune) t += 'Livraison : ' + f.commune + (fee ? ' (' + price(fee) + ')' : '') + '\n';
    if (o.lines.length) t += 'Total : ' + price(o.total + fee) + '\n';
    if (pay) t += 'Paiement : ' + pay + '\n';
    if (f.first) t += 'Nom : ' + f.first + '\n';
    if (f.phone) t += 'Téléphone : ' + f.phone + '\n';
    if (f.address) t += 'Adresse : ' + f.address + '\n';
    t += '(Commande depuis ' + location.host + location.pathname + ')';
    return { text: fr(t), lines: o.lines, total: o.total + fee, fee: fee, commune: f.commune || '' };
  }
  function waLink(text) { var n = waNumber(); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : ''; }

  function orderBar() {
    var old = document.getElementById('jb-order');
    if (old) old.remove();
    var p = S.view.page;
    if (p !== 'cart' && p !== 'checkout') return;
    var n = waNumber();
    var bar = document.createElement('div');
    bar.className = 'jb-order';
    bar.id = 'jb-order';
    bar.setAttribute('role', 'note');
    bar.innerHTML = '<p>' + esc(fr(n ? 'Le paiement en ligne arrive bientôt : votre commande part sur WhatsApp, et vous payez avec la boutique (mobile money ou à la livraison).' : 'Cette boutique ne prend pas encore les commandes en ligne : contactez-la directement.')) + '</p>' +
      (n ? '<a class="jb-btn" href="' + esc(waLink(orderMessage().text)) + '" target="_blank" rel="noopener" data-jb="wa-order">' + WA_ICON + 'Commander sur WhatsApp</a>' : '');
    S.root.insertAdjacentElement('afterend', bar);
  }

  function sentSheet(msg) {
    var old = document.getElementById('jb-sheet');
    if (old) old.remove();
    var link = waLink(msg.text);
    var sh = document.createElement('div');
    sh.className = 'jb-sheet';
    sh.id = 'jb-sheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    sh.setAttribute('aria-labelledby', 'jb-sheet-t');
    sh.innerHTML = '<div class="jb-sheet__card"><h2 id="jb-sheet-t" tabindex="-1">' + esc(link ? 'Envoyez votre commande sur WhatsApp' : 'Contactez la boutique') + '</h2>' +
      '<p>' + esc(fr(link ? 'WhatsApp s’ouvre avec votre commande déjà écrite : appuyez sur « Envoyer ». La boutique vous répond pour confirmer la livraison et le paiement. Rien n’a été payé ici.' : 'Cette boutique n’a pas encore de numéro WhatsApp : votre commande n’a pas été envoyée.')) + '</p>' +
      (msg.lines.length ? '<ul>' + msg.lines.map(function (l) { return '<li><span>' + esc(l.qty + ' × ' + l.name) + '</span><b>' + esc(price(l.amount)) + '</b></li>'; }).join('') +
        (msg.fee ? '<li><span>' + esc('Livraison' + (msg.commune ? ' · ' + msg.commune : '')) + '</span><b>' + esc(price(msg.fee)) + '</b></li>' : '') +
        '<li><span><b>Total</b></span><b>' + esc(price(msg.total)) + '</b></li></ul>' : '') +
      '<div class="jb-actions">' + (link ? '<a class="jb-btn jb-btn--wa" href="' + esc(link) + '" target="_blank" rel="noopener" data-jb="wa-send">' + WA_ICON + 'Ouvrir WhatsApp</a>' : '') +
      '<button class="jb-btn jb-btn--ghost" type="button" data-jb="sheet-close">Revenir à la boutique</button></div></div>';
    document.body.appendChild(sh);
    var t = document.getElementById('jb-sheet-t');
    if (t) t.focus();
    sh.addEventListener('click', function (e) {
      if (e.target === sh || (e.target.closest && e.target.closest('[data-jb="sheet-close"]'))) sh.remove();
    });
    sh.addEventListener('keydown', function (e) { if (e.key === 'Escape') sh.remove(); });
  }

  // Before render.js sees the click: real WhatsApp links, and the order instead of the demo payment
  function intercept(e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var a = t.closest('[data-jst-action]');
    var act = a ? a.getAttribute('data-jst-action') : '';
    if (act === 'order') {
      var sel = S.root.querySelector('select[data-jst-field="commune"]');
      if (sel && !sel.value) return; // render.js asks for the commune first
      e.preventDefault();
      e.stopPropagation();
      var msg = orderMessage();
      sentSheet(msg);
      var link = waLink(msg.text);
      if (link) { try { window.open(link, '_blank', 'noopener'); } catch (x) { /* the sheet's button opens it */ } }
      return;
    }
    if (act === 'wa') {
      var l2 = waLink(orderLines().lines.length ? orderMessage().text : fr('Bonjour ' + ((S.config.store && S.config.store.name) || '') + ', j’ai une question :'));
      if (l2) { e.preventDefault(); e.stopPropagation(); try { window.open(l2, '_blank', 'noopener'); } catch (x) { /* ignore */ } }
      return;
    }
    var link2 = t.closest('a[href^="https://wa.me/"], a[href^="tel:"], a[href^="mailto:"]');
    if (link2 && !link2.closest('[data-jst-action]')) {
      e.stopPropagation();
      if (link2.target === '_blank') { e.preventDefault(); try { window.open(link2.href, '_blank', 'noopener'); } catch (x) { /* ignore */ } }
    }
  }

  function show(store) {
    var cfg;
    try { cfg = D.normalizeConfig(store.fiche); } catch (e) { cfg = null; }
    if (!cfg) { stateView('notfound'); return; }
    S.store = store;
    S.config = cfg;
    S.status = 'ready';
    S.device = deviceFor();
    S.view = fromHash();
    main.innerHTML = '';
    main.setAttribute('aria-busy', 'false');
    var root = document.createElement('div');
    root.id = 'jb-store';
    main.appendChild(root);
    S.root = root;
    root.addEventListener('click', intercept, true);
    root.addEventListener('jst:navigate', function (e) {
      var d = e.detail || {};
      S.view = { page: d.page || 'home', productId: d.productId || null, pageId: d.pageId || null };
      var h = hashFor(S.view);
      if (h !== location.hash && !(h === '' && !location.hash)) {
        try { history.pushState(null, '', location.pathname + location.search + h); } catch (x) { location.hash = h; }
      }
      orderBar();
    });
    draw(false);
    root.classList.add('jb-store');
    headMeta(cfg, store);
    badgeRow(store.show_badge !== false);
  }

  function load() {
    S.target = target();
    main.setAttribute('aria-busy', 'true');
    if (!D || !R || !P) { stateView('network'); return; }
    if (!S.target.host && !S.target.slug) { stateView('notfound'); return; }
    var loading = document.getElementById('jb-loading');
    if (!loading) main.innerHTML = '<div class="jb-state jb-state--load" id="jb-loading" role="status"><span class="jb-spin" aria-hidden="true"></span><p>Chargement de la boutique…</p></div>';
    P.fetchPublished(S.target).then(function (r) {
      if (r.ok) show(r.store);
      else stateView(r.code === 'network' ? 'network' : 'notfound');
    }, function () { stateView('network'); });
  }

  window.addEventListener('popstate', function () { if (S.status === 'ready') { S.view = fromHash(); draw(true); } });
  window.addEventListener('hashchange', function () { if (S.status === 'ready') { var v = fromHash(); if (v.page !== S.view.page || v.productId !== S.view.productId || v.pageId !== S.view.pageId) { S.view = v; draw(true); } } });
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (S.status === 'ready' && deviceFor() !== S.device) { S.device = deviceFor(); draw(false); } }, 150);
  });

  window.JeereStorePage = { state: function () { return { status: S.status, target: S.target, view: S.view, device: S.device, slug: S.store && S.store.slug, badge: S.store && S.store.show_badge }; }, reload: load };
  load();
})();
