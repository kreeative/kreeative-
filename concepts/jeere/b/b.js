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
 * drawn by creer/render.js + store.css: home, product, cart, checkout, the seller's pages.
 * The page in view is in the address (wave 2 of the Studio audit), one format end to end — render.js
 * writes the links, this file reads them and pushes them (history.pushState), so Back works and a
 * product or page link can be shared, opened in a new tab or indexed:
 *   jeere.kreeative.xyz/b/<slug>/produits/<id> · /pages/<slug> · /panier · /paiement   (linkBase '/b/<slug>')
 *   <her domain>/produits/<id> …                                                     (linkBase '')
 *   …/b/?s=<slug>#/produits/<id> …   (any other host: fragments; linkBase '<path>?s=<slug>#')
 * Older links still open the right view: #/produits/<id>, #/pages/<slug>, #produit/<id>, #page/<slug>,
 * #panier, #paiement. vercel.json sends those paths to api/store.js, which serves this page with the
 * store's own title, description and image already in the HTML (for WhatsApp and Facebook, which do not
 * run JavaScript) and the store row inline (#jb-data): then no second request is made here.
 * Breakpoints: JEERE_DATA.BREAKPOINTS, the Studio's — under 768 px the phone layout, from 768 px the
 * computer layout (the Studio's 768 artboard), with the element styles' tablet values under 1200 px.
 * Detached Studio sections load the DualEngine on demand (creer/engine-sections.js).
 *
 * Ordering: the store's checkout has no real payment yet, so « Payer » / « Confirmer la commande »
 * prepares the order as a WhatsApp message to the shop (its number from the fiche) and says so; the
 * preview's demo confirmation (« Commande n° 1042 ») is never shown to a real customer.
 * A seller's own site (Jeere Connect, ../connect/jeere-connect.js) sends its cart as …/panier?panier=p1:2,p3:1:
 * the cart is filled with the store's products in it (1 to 20 each) and the parameter leaves the address.
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
    // Her own domain: every path is her store, the links are paths from the root
    if (!JEERE_HOST.test(host)) return { host: host, base: '', rest: location.pathname };
    // « Aperçu privé » (client projects): ?apercu=<token> shows the store even before it is published
    var ap = /^[A-Za-z0-9_-]{24,64}$/.test(q.apercu || '') ? q.apercu : '';
    var s = q.s || '';
    if (s) return { slug: String(s).toLowerCase(), base: null, apercu: ap };
    var m = /\/b\/([A-Za-z0-9-]+)(\/.*)?$/.exec(location.pathname);
    if (m) {
      var i = location.pathname.indexOf('/b/' + m[1]);
      return { slug: m[1].toLowerCase(), base: location.pathname.slice(0, i) + '/b/' + m[1], rest: m[2] || '', apercu: ap };
    }
    if (q.domaine) return { host: String(q.domaine).toLowerCase(), base: null };
    return { slug: '' };
  }
  // The links' root for render.js (options.linkBase): a path, or this address + '#' (fragments)
  function linkBase() {
    var t = S.target || {};
    if (typeof t.base === 'string') return t.base;
    return location.pathname + location.search + '#';
  }

  /* ---------------------------------------------------------------- the page in view (hash) */

  // '/produits/p1', 'produits/p1', 'produit/p1', '/pages/a-propos', 'page/a-propos', '/panier', 'paiement' → the view
  function viewOf(route) {
    var cfg = S.config || {};
    var h = String(route || '').replace(/^#/, '').replace(/^\/+|\/+$/g, '');
    try { h = decodeURIComponent(h); } catch (e) { /* keep it raw */ }
    var m = /^(?:produits?)\/(.+)$/.exec(h);
    if (m) { var id = m[1]; if ((cfg.products || []).some(function (p) { return p.id === id; })) return { page: 'product', productId: id, pageId: null }; }
    if (h === 'panier') return { page: 'cart', productId: null, pageId: null };
    if (h === 'paiement') return { page: 'checkout', productId: null, pageId: null };
    m = /^(?:pages?)\/(.+)$/.exec(h);
    if (m) {
      var slug = m[1];
      var pg = (cfg.pages || []).filter(function (x) { return x.slug === slug || x.id === slug; })[0];
      if (pg) return { page: 'page', productId: null, pageId: pg.id };
    }
    return { page: 'home', productId: null, pageId: null };
  }
  // The view from the address: the path after the store's root (Jeere's host, her domain), else the hash
  function fromLocation() {
    var t = S.target || {};
    if (typeof t.base === 'string') {
      var p = location.pathname;
      var rest = t.base && p.indexOf(t.base) === 0 ? p.slice(t.base.length) : (t.base ? '' : p);
      if (rest && rest !== '/') return viewOf(rest);
    }
    return viewOf(location.hash);
  }
  // The view → the route part of its address ('/produits/p1', '' for the home)
  function routeFor(v) {
    var enc = function (x) { return encodeURIComponent(String(x)); };
    if (v.page === 'product' && v.productId) return '/produits/' + enc(v.productId);
    if (v.page === 'cart') return '/panier';
    if (v.page === 'checkout') return '/paiement';
    if (v.page === 'page' && v.pageId) {
      var pg = ((S.config && S.config.pages) || []).filter(function (x) { return x.id === v.pageId; })[0];
      return '/pages/' + enc(pg && pg.slug ? pg.slug : v.pageId);
    }
    return '';
  }
  // The view → the full address to push (same format as render.js's hrefs)
  function urlFor(v) {
    var t = S.target || {};
    var r = routeFor(v);
    if (typeof t.base === 'string') return (t.base || '') + (r || (t.base ? '' : '/')) + location.search;
    return location.pathname + location.search + (r ? '#' + r : '');
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

  // The Studio's breakpoints (JEERE_DATA.BREAKPOINTS): phone layout under 768 px, computer from 768 px
  function deviceFor() {
    var w = window.innerWidth;
    if (D && typeof D.layoutForWidth === 'function') return D.layoutForWidth(w);
    return w >= 768 ? 'desktop' : 'phone';
  }
  function draw(scrollTop) {
    if (!S.root || !S.config) return;
    try { R.render(S.config, S.root, { device: S.device, page: S.view.page, productId: S.view.productId, pageId: S.view.pageId, linkBase: linkBase() }); } catch (e) { /* render never throws, but stay safe */ }
    orderBar();
    viewMeta();
    if (scrollTop) try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  function abs(u) { try { return new URL(u, document.baseURI).href; } catch (e) { return ''; } }
  function linkTag(rel, href) {
    var l = document.head.querySelector('link[rel="' + rel + '"]');
    if (!href) { if (l) l.remove(); return; }
    if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
    l.href = href;
  }
  function metaFor(cfg, view) {
    if (R && typeof R.storeMeta === 'function') return R.storeMeta(cfg, view, { abs: abs });
    var st = cfg.store || {};
    return { title: (st.name || 'Boutique') + ' · Boutique en ligne', description: st.tagline || '', image: '', noindex: false, type: 'website', name: st.name || 'Boutique' };
  }
  function canonical() {
    var t = S.target || {};
    if (typeof t.base !== 'string') return location.href.replace(/#.*$/, '');
    return location.origin + urlFor(S.view).replace(/\?.*$/, '');
  }
  function viewMeta() {
    if (!S.config) return;
    var m = metaFor(S.config, S.view);
    setTitle(m.title);
    meta('description', m.description);
    meta('og:type', m.type, true);
    meta('og:site_name', m.name, true);
    meta('og:title', m.title, true);
    meta('og:description', m.description, true);
    meta('og:url', canonical(), true);
    meta('og:image', m.image || 'https://jeere.kreeative.xyz/img/og.jpg', true);
    meta('twitter:title', m.title);
    meta('twitter:description', m.description);
    meta('robots', m.noindex || (S.store && S.store.preview === true) ? 'noindex' : 'index, follow');
    linkTag('canonical', canonical());
  }
  function headMeta(cfg, store) {
    viewMeta();
    var color = (S.root && S.root.style.getPropertyValue('--st-bg').trim()) || '#FFFFFF';
    meta('theme-color', color);
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

  // ?panier=p1:2,p3:1 (Jeere Connect: the seller's own site sends her buyer to this cart): the store's own
  // products only, 1 to 20 each; the parameter then leaves the address, so a reload or a shared link does not
  // fill the cart again. null without the parameter.
  function cartFromUrl(cfg) {
    var m = /[?&]panier=([^&#]*)/.exec(location.search);
    if (!m) return null;
    var raw = '';
    try { raw = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { raw = ''; }
    var ids = Object.create(null), cart = {};
    (cfg.products || []).forEach(function (p) { if (p && typeof p.id === 'string') ids[p.id] = true; });
    raw.split(',').forEach(function (kv) {
      var i = kv.lastIndexOf(':');
      var id = (i > 0 ? kv.slice(0, i) : kv).trim();
      var q = i > 0 ? parseInt(kv.slice(i + 1), 10) : 1;
      if (ids[id] === true && q > 0) cart[id] = Math.min(20, (cart[id] || 0) + q);
    });
    var search = location.search.replace(/([?&])panier=[^&#]*&?/, '$1').replace(/[?&]$/, '');
    try { history.replaceState(history.state, '', location.pathname + search + location.hash); } catch (e) { /* keep it */ }
    return cart;
  }

  function show(store) {
    var cfg;
    try { cfg = D.normalizeConfig(store.fiche); } catch (e) { cfg = null; }
    if (!cfg) { stateView('notfound'); return; }
    S.store = store;
    S.config = cfg;
    S.status = 'ready';
    S.device = deviceFor();
    var fromSite = cartFromUrl(cfg);
    S.view = fromLocation();
    // On an address with fragments (…/b/?s=<slug>&panier=…) the cart opens too
    if (fromSite && S.view.page === 'home') {
      S.view = { page: 'cart', productId: null, pageId: null };
      try { history.replaceState(null, '', urlFor(S.view)); } catch (e) { /* keep it */ }
    }
    main.innerHTML = '';
    main.setAttribute('aria-busy', 'false');
    var root = document.createElement('div');
    root.id = 'jb-store';
    main.appendChild(root);
    S.root = root;
    // The cart the site sent (none of its products here: an empty cart, not render.js's sample line)
    if (fromSite) { root.__jstCart = fromSite; root.__jstCartCleared = !Object.keys(fromSite).length; }
    root.addEventListener('click', intercept, true);
    root.addEventListener('jst:navigate', function (e) {
      var d = e.detail || {};
      S.view = { page: d.page || 'home', productId: d.productId || null, pageId: d.pageId || null };
      var u = urlFor(S.view);
      var now = location.pathname + location.search + location.hash;
      if (u !== now && !(u === location.pathname + location.search && !location.hash)) {
        try { history.pushState(null, '', u); } catch (x) { var r = routeFor(S.view); location.hash = r ? '#' + r : ''; }
      }
      orderBar();
      viewMeta();
    });
    draw(false);
    // An older link (#produit/p2, #page/a-propos) on a path address: shown, and the address cleaned up
    if (typeof S.target.base === 'string' && location.hash && S.view.page !== 'home') {
      try { history.replaceState(null, '', urlFor(S.view)); } catch (x) { /* keep it */ }
    }
    root.classList.add('jb-store');
    headMeta(cfg, store);
    if (store.preview === true) previewBar(store);
    // The badge: decided by the server from the owner's plan (stores.badge), else the row's show_badge
    var badgeOn = typeof store.badge === 'boolean' ? store.badge : store.show_badge !== false;
    if (!badgeOn) document.body.classList.add('jb-nobadge'); else document.body.classList.remove('jb-nobadge');
    badgeRow(badgeOn);
  }

  // « Aperçu privé »: a quiet bar on top, the page kept out of search engines
  function previewBar(store) {
    meta('robots', 'noindex, nofollow');
    if (document.getElementById('jb-preview')) return;
    var bar = document.createElement('p');
    bar.id = 'jb-preview';
    bar.className = 'jb-preview';
    bar.setAttribute('role', 'note');
    bar.textContent = fr(store.published ? 'Aperçu privé : ce lien montre la boutique telle qu’elle est maintenant.' : 'Aperçu privé : cette boutique n’est pas encore en ligne. Seules les personnes qui ont ce lien la voient.');
    main.insertBefore(bar, main.firstChild);
  }

  // The store row api/store.js put in the page (<script type="application/json" id="jb-data">), if it is this one
  function preloaded() {
    var el = document.getElementById('jb-data');
    if (!el) return null;
    var row = null;
    try { row = JSON.parse(el.textContent || 'null'); } catch (e) { row = null; }
    el.remove();
    var t = S.target || {};
    if (!row || typeof row !== 'object' || !row.fiche || (row.published === false && !(t.apercu && row.preview === true))) return null;
    if (t.slug && String(row.slug || '').toLowerCase() === t.slug) return row;
    if (t.host) { var d = String(row.custom_domain || '').toLowerCase(), h = t.host.replace(/^www\./, ''); if (d && d.replace(/^www\./, '') === h) return row; }
    return null;
  }

  function load() {
    S.target = target();
    main.setAttribute('aria-busy', 'true');
    if (!D || !R || !P) { stateView('network'); return; }
    if (!S.target.host && !S.target.slug) { stateView('notfound'); return; }
    // Served by api/store.js: the row is already in the page (no second request)
    var pre = preloaded();
    if (pre) { show(pre); return; }
    var loading = document.getElementById('jb-loading');
    if (!loading) main.innerHTML = '<div class="jb-state jb-state--load" id="jb-loading" role="status"><span class="jb-spin" aria-hidden="true"></span><p>Chargement de la boutique…</p></div>';
    var fetchRow = S.target.apercu && S.target.slug && P.fetchPreview ? P.fetchPreview(S.target.slug, S.target.apercu) : P.fetchPublished(S.target);
    fetchRow.then(function (r) {
      if (r.ok) show(r.store);
      else stateView(r.code === 'network' ? 'network' : 'notfound');
    }, function () { stateView('network'); });
  }

  window.addEventListener('popstate', function () { if (S.status === 'ready') { S.view = fromLocation(); draw(true); } });
  window.addEventListener('hashchange', function () { if (S.status === 'ready') { var v = fromLocation(); if (v.page !== S.view.page || v.productId !== S.view.productId || v.pageId !== S.view.pageId) { S.view = v; draw(true); } } });
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (S.status === 'ready' && deviceFor() !== S.device) { S.device = deviceFor(); draw(false); } }, 150);
  });

  window.JeereStorePage = { state: function () { return { status: S.status, target: S.target, view: S.view, device: S.device, slug: S.store && S.store.slug, badge: S.store && (typeof S.store.badge === 'boolean' ? S.store.badge : S.store.show_badge) }; }, reload: load };
  load();
})();
