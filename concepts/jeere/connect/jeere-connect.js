/*
 * Jehre Connect — jeere-connect.js: a custom-designed site sells with a Jehre store (classic script, no library).
 *
 *   <script src="https://jehre.com/connect/jeere-connect.js" data-store="<slug>" defer></script>
 *
 * The site keeps its own design. This script reads the store's PUBLISHED fiche from Supabase (REST, the
 * publishable key: row level security only shows published rows, never the owner), puts the store's names,
 * prices, descriptions and photos into the site's own markup, keeps a cart in localStorage (one per store)
 * and sends the buyer to the store's Jehre cart: https://jehre.com/b/<slug>/panier?panier=p1:2,p3:1
 * (b/b.js fills the cart from that parameter; the order then leaves on WhatsApp, as on any Jehre store).
 * If Supabase cannot be reached or the store is not published, the page keeps its hard-coded content and
 * its cart still works (prices read from the page); nothing here ever throws into the site.
 *
 * Markup (any element, any classes; ids are the fiche's product ids: p1, p2… as in the Jehre editor):
 *   [data-jeere-product="p1"]            a product card. Gets data-jeere-state="on" | "off" (off: missing from
 *                                        the fiche or out of stock; its add buttons are disabled, « Épuisé »)
 *     [data-jeere-name] [data-jeere-desc] text from the fiche (only where the page is in French: the fiche is)
 *     [data-jeere-price]                 « 7 000 FCFA » (also data-jeere-amount="7000")
 *     [data-jeere-photo]                 an <img>: src from the fiche's https image (the page's own if it fails)
 *     [data-jeere-add]                   adds 1 (data-jeere-soldout="…": the label when sold out, default « Épuisé »)
 *   Outside a card, the same attributes take the id as their value: <span data-jeere-price="p1">.
 *   [data-jeere-inc="p1"] [data-jeere-dec="p1"] [data-jeere-remove="p1"]   +1, −1 (0 removes), remove
 *   [data-jeere-count]  the number of items      [data-jeere-total]  the total, « 16 000 FCFA »
 *   [data-jeere-lines]  filled with one line per item: from its <template data-jeere-line> if it has one
 *                       ([data-jeere-name], [data-jeere-qty], [data-jeere-price], [data-jeere-line-total],
 *                       [data-jeere-photo], [data-jeere-inc], [data-jeere-dec], [data-jeere-remove]; « {name} »
 *                       in an attribute is replaced), and its <template data-jeere-empty> when the cart is empty
 *   [data-jeere-social]  filled with the seller's networks (Instagram, TikTok, Facebook, set in Jehre > Parametres >
 *                        Boutique): one round icon link each, in the site's own colour; hidden when she has none
 * In the Jehre editor (the site framed as its preview) the fiche being edited is received by postMessage
 * ({ jeerePreview: <slug>, fiche }, from jehre.com only) and shown in place of the published one.
 *   [data-jeere-checkout]  goes to the Jehre cart (same tab); disabled (aria-disabled on a link) when empty
 * Script attributes: data-store (required), data-default-cart="p1:1,p2:1" (the cart of a first visit only).
 *
 * 'jeere:update' { status, products } each time the editor's preview sends a new fiche.
 * Events on document: 'jeere:ready' { status, products } once the fiche is read (or not: status 'offline' |
 * 'notfound'), 'jeere:cart' { store, lines, count, total, url } after every change (and on ready).
 * window.JeereConnect = { ready: Promise, status(), products(), product(id), cart(), add(id, q), set(id, q),
 *   clear(), checkoutUrl(), refresh(), formatPrice: null }   (a site may set formatPrice(n) to its own format)
 */
(function () {
  'use strict';

  /* A model's demo is seen inside Jehre, by a seller who has an account (jehre.com/modeles/<modèle>/). Opened on
     its own — at its address on kreeative.xyz, or at the address Jehre's frame loads — it goes to that page,
     which asks for the account. Only the seven demos, and only as the top page: inside Jehre's frame, in the
     dashboard, in the editors, and on a seller's own store (another address) nothing changes. */
  try {
    var jmHost = location.hostname, jmSlug = null;
    var jmA = /^\/concepts\/(anse|seve|soyeuse|michou|regard|vernie|minuit)(?:\/|$)/.exec(location.pathname);
    var jmB = /^\/modeles\/voir\/(anse|seve|soyeuse|michou|regard|vernie|minuit)(?:\/|$)/.exec(location.pathname);
    if (jmA && /^(www\.)?kreeative\.xyz$/.test(jmHost)) jmSlug = jmA[1];
    else if (jmB && /^(jehre\.com|jeere\.kreeative\.xyz)$/.test(jmHost)) jmSlug = jmB[1];
    if (jmSlug && window.top === window.self) {
      document.documentElement.style.visibility = 'hidden';
      location.replace('https://jehre.com/modeles/' + jmSlug + '/');
      return;
    }
  } catch (e) { /* a frame we may not look out of: we are inside one, nothing to do */ }

  if (window.JeereConnect && window.JeereConnect.version) return; // the script twice on one page

  var SB_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var STORE_ORIGIN = 'https://jehre.com';
  var NB = '\u00a0';
  var QMAX = 20;
  var TIMEOUT = 6000;
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  var me = document.currentScript || document.querySelector('script[data-store][src*="jeere-connect"]');
  var slug = String((me && me.getAttribute('data-store')) || '').trim().toLowerCase();
  var slugOk = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && slug.indexOf('--') === -1;
  var KEY = 'jeere-connect:' + slug;

  var S = { status: 'loading', products: null, cart: {} };
  var api;

  /* ---------------------------------------------------------------- helpers */

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v) ? String(v) : ''); }
  // A price: whole FCFA, cents in dollars and euros
  function toPrice(v) {
    if (typeof v === 'number') return isFinite(v) ? money(v) : null;
    if (typeof v === 'string' && /\d/.test(v)) { var n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.')); return isFinite(n) ? money(n) : null; }
    return null;
  }
  function toInt(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v === 'string' && /\d/.test(v)) { var n = Number(v.replace(/[^\d.-]/g, '')); return isFinite(n) ? Math.round(n) : null; }
    return null;
  }
  function clampQ(q) { return Math.max(0, Math.min(QMAX, Math.round(Number(q) || 0))); }
  function $$(sel, ctx) { try { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function attrSel(name, id) { return '[' + name + '="' + String(id).replace(/["\\]/g, '') + '"]'; }
  var preview = false; // shown inside the Jehre editor, with the fiche being edited (see init)
  function httpsImg(v) {
    if (preview && typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+\/=]+$/.test(v)) return v; // a photo she just chose, not yet online
    return typeof v === 'string' && v.length < 600 && /^https:\/\/[^\s"'<>\\]+$/i.test(v) ? v : '';
  }
  // « 7 000 FCFA », never broken across lines (the money format of creer/render.js)
  // The store's currency (fiche: store.currency): « 7 000 FCFA », « 24,99 $ CA », « 25 € »
  var CUR = { XOF: ['FCFA', 1], CAD: ['$' + NB + 'CA', 100], USD: ['$' + NB + 'US', 100], EUR: ['€', 100] };
  var cur = 'XOF';
  function money(n) { var k = CUR[cur][1]; return Math.round((Number(n) || 0) * k) / k; }
  function jeerePrice(n) {
    var x = money(n), k = CUR[cur][1], neg = x < 0 ? '-' : '', a = Math.abs(x), whole = Math.floor(a), c = Math.round((a - whole) * k);
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (k > 1 && c ? ',' + (c < 10 ? '0' : '') + c : '');
    return neg + s + NB + CUR[cur][0];
  }
  function fmt(n) {
    if (api && typeof api.formatPrice === 'function') { try { var s = api.formatPrice(n); if (typeof s === 'string' && s) return s; } catch (e) { /* the default */ } }
    return jeerePrice(n);
  }
  function french(el) {
    var l = el && el.closest ? el.closest('[lang]') : null;
    var lang = (l ? l.getAttribute('lang') : document.documentElement.getAttribute('lang')) || 'fr';
    return /^fr\b/i.test(lang);
  }
  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* very old browser */ }
  }

  /* ---------------------------------------------------------------- the catalogue */

  // The fiche's products (creer/data.js: { id, name, price, description, image, … }) by id
  function readFiche(f) {
    var map = {};
    var c = isObj(f.store) && typeof f.store.currency === 'string' ? f.store.currency.toUpperCase() : 'XOF';
    cur = CUR[c] ? c : 'XOF';
    var stock = isObj(f.stock) ? f.stock : null;
    (Array.isArray(f.products) ? f.products : []).forEach(function (p) {
      if (!isObj(p) || typeof p.id !== 'string' || !ID_RE.test(p.id) || map[p.id]) return;
      var price = toPrice(p.price);
      var off = p.available === false || p.soldOut === true || p.hidden === true || toInt(p.stock) === 0 ||
        (stock && toInt(stock[p.id]) === 0);
      map[p.id] = {
        id: p.id, name: str(p.name).trim(), price: price === null || price < 0 ? null : price,
        category: str(p.category).trim(), description: str(p.description).trim(), image: httpsImg(p.image) || (Array.isArray(p.images) ? httpsImg(p.images[0]) : ''), images: (Array.isArray(p.images) ? p.images : [p.image]).map(httpsImg).filter(Boolean).slice(0, 8), available: !off, badge: str(p.badge)
      };
    });
    return map;
  }
  function card(id) { return document.querySelector(attrSel('data-jeere-product', id)); }
  // What the page itself says about a product (before the fiche, or without it)
  function fromPage(id) {
    var c = card(id);
    if (!c) return null;
    var n = c.querySelector('[data-jeere-name]');
    var pr = c.querySelector('[data-jeere-price]');
    var price = toInt(c.getAttribute('data-price'));
    if (price === null && pr) price = toInt(pr.getAttribute('data-jeere-amount')) !== null ? toInt(pr.getAttribute('data-jeere-amount')) : toInt(pr.textContent);
    var ph = c.querySelector('img[data-jeere-photo]');
    return { id: id, name: n ? n.textContent.trim() : id, price: price === null ? 0 : price, description: '', image: ph ? ph.currentSrc || ph.src : '', available: true };
  }
  function product(id) {
    if (S.products) {
      var p = S.products[id];
      if (!p) return null;
      var page = fromPage(id);
      return { id: id, name: p.name || (page ? page.name : id), price: p.price !== null ? p.price : (page ? page.price : 0), description: p.description, image: p.image || (page ? page.image : ''), available: p.available };
    }
    return fromPage(id);
  }
  function sellable(id) {
    if (!ID_RE.test(String(id || ''))) return false;
    if (S.products) { var p = S.products[id]; return !!(p && p.available); }
    return true; // before the fiche (or without it): the page decides
  }

  /* ---------------------------------------------------------------- the cart */

  function parseCart(text) {
    var out = {};
    String(text || '').split(',').forEach(function (kv) {
      var i = kv.lastIndexOf(':');
      var id = (i > 0 ? kv.slice(0, i) : kv).trim();
      var q = i > 0 ? parseInt(kv.slice(i + 1), 10) : 1;
      if (ID_RE.test(id) && q > 0) out[id] = clampQ((out[id] || 0) + q);
    });
    return out;
  }
  function loadCart() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var saved = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
    var items = saved && isObj(saved.items) ? saved.items : (raw === null && me ? parseCart(me.getAttribute('data-default-cart')) : {});
    var cart = {};
    Object.keys(items).forEach(function (id) { var q = clampQ(items[id]); if (ID_RE.test(id) && q > 0) cart[id] = q; });
    S.cart = cart;
    // back from the store's checkout with the order placed (?jeere=commande): the cart is empty again
    if (/[?&]jeere=commande\b/.test(location.search)) {
      S.cart = {};
      try { window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: {}, at: Date.now() })); } catch (e) { /* ok */ }
      var q = location.search.replace(/([?&])jeere=commande&?/, '$1').replace(/[?&]$/, '');
      try { history.replaceState(history.state, '', location.pathname + q + location.hash); } catch (e) { /* keep it */ }
    }
  }
  function saveCart() {
    try { window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: S.cart, at: Date.now() })); } catch (e) { /* private mode: the cart lives on the page */ }
  }
  // Ids the store does not sell (any more) leave the cart once the fiche is known
  function prune() {
    if (!S.products) return false;
    var changed = false;
    Object.keys(S.cart).forEach(function (id) { if (!sellable(id)) { delete S.cart[id]; changed = true; } });
    return changed;
  }
  function cartDetail() {
    var lines = [], count = 0, total = 0;
    Object.keys(S.cart).forEach(function (id) {
      var q = S.cart[id];
      var p = product(id) || { id: id, name: id, price: 0, image: '' };
      var t = money((p.price || 0) * q);
      count += q; total = money(total + t);
      lines.push({ id: id, name: p.name, price: p.price || 0, qty: q, total: t, image: p.image || '' });
    });
    return { store: slug, status: S.status, lines: lines, count: count, total: total, url: checkoutUrl() };
  }
  function checkoutUrl() {
    var ids = Object.keys(S.cart);
    var base = STORE_ORIGIN + '/b/' + encodeURIComponent(slug) + '/panier';
    // ?retour=: « Retour à la boutique » on the checkout comes back to this page of her site
    var back = location.protocol === 'https:' ? '&retour=' + encodeURIComponent(location.origin + location.pathname) : '';
    return ids.length ? base + '?panier=' + ids.map(function (id) { return encodeURIComponent(id) + ':' + S.cart[id]; }).join(',') + back : base;
  }
  function changed() { saveCart(); render(); emit('jeere:cart', cartDetail()); }
  function set(id, q) {
    id = String(id || '');
    if (!ID_RE.test(id)) return false;
    q = clampQ(q);
    if (q > 0 && !sellable(id)) return false;
    if (q > 0) S.cart[id] = q; else delete S.cart[id];
    changed();
    return true;
  }
  function add(id, q) { return set(id, (S.cart[String(id || '')] || 0) + (q === undefined ? 1 : Math.round(Number(q) || 0))); }

  /* ---------------------------------------------------------------- the page */

  var originals = typeof WeakMap === 'function' ? new WeakMap() : null;
  function remember(el) {
    if (!originals || originals.has(el)) return;
    originals.set(el, { text: el.innerHTML, label: el.getAttribute('aria-label'), disabled: el.disabled === true });
  }
  function idOf(el, attr) {
    var v = el.getAttribute(attr);
    if (v) return v;
    var c = el.closest ? el.closest('[data-jeere-product]') : null;
    return c ? c.getAttribute('data-jeere-product') : '';
  }
  function outsideLines(el) { return !(el.closest && el.closest('[data-jeere-lines]')); }

  // Her model site, like a theme: each product case of the page (its own number, kept in data-jeere-slot-…) shows
  // the product she chose for it in the editor (store.slots), or is hidden ('-'). Done before bind(), and again each
  // time the editor sends a new fiche, so everything after works with the real product id (the cart too).
  var SLOT_ATTRS = ['product', 'name', 'desc', 'price', 'photo', 'add', 'inc', 'dec', 'remove'];
  function plainName(t) { return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function keepModelNames() {
    $$('[data-jeere-product]').forEach(function (c) {
      if (c.hasAttribute('data-jeere-model-name')) return;
      var n = c.querySelector('[data-jeere-name]');
      c.setAttribute('data-jeere-model-name', n ? plainName(n.textContent) : '');
    });
  }
  function remapSlots(fiche) {
    try { keepModelNames(); } catch (e) { /* the cases keep their model's words */ }
    var map = fiche && isObj(fiche.store) && isObj(fiche.store.slots) ? fiche.store.slots : {};
    try {
      var q = isObj(fiche.store) && isObj(fiche.store.site) && isObj(fiche.store.site.q) ? fiche.store.site.q : {}, base = pagePath(), own = {};
      Object.keys(map).forEach(function (k) { own[k] = map[k]; });
      sections().forEach(function (sec, n) {
        var cat = isObj(q[base + '|h|' + n]) ? str(q[base + '|h|' + n].cat).trim() : '';
        if (!cat) return;
        var prods = (Array.isArray(fiche.products) ? fiche.products : []).filter(function (p) { return p && p.id && String(p.category || '').trim() === cat; });
        $$('[data-jeere-product]', sec).filter(outsideLines).forEach(function (el, i) {
          var slot = el.getAttribute('data-jeere-slot-product') || el.getAttribute('data-jeere-product');
          if (slot && ID_RE.test(slot)) own[slot] = prods[i] ? prods[i].id : '-';
        });
      });
      map = own;
    } catch (e) { /* the cases keep her own choice */ }
    SLOT_ATTRS.forEach(function (n) {
      var a = 'data-jeere-' + n, keep = 'data-jeere-slot-' + n;
      $$('[' + a + ']').filter(outsideLines).forEach(function (el) {
        var slot = el.getAttribute(keep);
        if (slot === null) { slot = el.getAttribute(a); if (!slot || !ID_RE.test(slot)) return; el.setAttribute(keep, slot); }
        var to = typeof map[slot] === 'string' ? map[slot] : slot;
        if (n === 'product') {
          if (to === '-') { if (!el.hasAttribute('data-jeere-hid')) { el.setAttribute('data-jeere-hid', el.style.display || ''); el.style.display = 'none'; } }
          else if (el.hasAttribute('data-jeere-hid')) { el.style.display = el.getAttribute('data-jeere-hid'); el.removeAttribute('data-jeere-hid'); }
        }
        el.setAttribute(a, to === '-' ? slot : to);
      });
    });
  }

  // A product CARD (one of several side by side), not the page of one product
  function isCard(c) { return !!(c && c.parentElement && c.parentElement.querySelectorAll(':scope > [data-jeere-product]').length > 1); }
  // On a seller's own store (not the model's demo), what a card says of the DEMO product goes: the old price, the
  // « -19 % », « noir délavé · xs à xl ». Its label (Nouveau…) follows her product's own.
  var DEMO_STORES = { michou: 1, seve: 1, soyeuse: 1, anse: 1 };
  var BADGE_FR = { 'new': 'Nouveau', best: 'Best-seller', promo: 'Promo' };
  function cleanCards() {
    if (DEMO_STORES[slug] && !inEditor) return;
    $$('[data-jeere-product]').filter(isCard).forEach(function (c) {
      var p = S.products && S.products[c.getAttribute('data-jeere-product')];
      Array.prototype.forEach.call(c.querySelectorAll('s, del, [class*="promo"], [class*="meta"]'), function (el) {
        if (el.hasAttribute('data-jeere-price') || el.hasAttribute('data-jeere-name') || el.querySelector('[data-jeere-price],[data-jeere-name],[data-jeere-photo]')) return;
        el.style.display = 'none';
      });
      Array.prototype.forEach.call(c.querySelectorAll('[class*="tag"], [class*="badge"]'), function (el) {
        if (el.children.length || el.hasAttribute('data-jeere-price') || el.hasAttribute('data-jeere-name')) return;
        var t = p && BADGE_FR[p.badge];
        if (t) { el.textContent = t; el.style.display = ''; } else el.style.display = 'none';
      });
    });
  }
  var inEditor = false;

  // Names, prices, descriptions, photos and states from the fiche (once it is read)
  function bind() {
    if (!S.products) return;
    try { cleanCards(); } catch (e) { /* the card keeps what it had */ }
    $$('[data-jeere-product]').forEach(function (c) {
      var id = c.getAttribute('data-jeere-product');
      c.setAttribute('data-jeere-state', sellable(id) ? 'on' : 'off');
    });
    $$('[data-jeere-name],[data-jeere-desc],[data-jeere-price],[data-jeere-photo]').filter(outsideLines).forEach(function (el) {
      var id = el.hasAttribute('data-jeere-name') ? idOf(el, 'data-jeere-name') : el.hasAttribute('data-jeere-desc') ? idOf(el, 'data-jeere-desc') :
        el.hasAttribute('data-jeere-price') ? idOf(el, 'data-jeere-price') : idOf(el, 'data-jeere-photo');
      var p = id && S.products[id];
      if (!p) return;
      if (el.hasAttribute('data-jeere-name') && p.name && french(el)) { if (el.textContent !== p.name) el.textContent = p.name; }
      else if (el.hasAttribute('data-jeere-desc') && p.description && french(el)) { if (el.textContent !== p.description) el.textContent = p.description; }
      else if (el.hasAttribute('data-jeere-price') && p.price !== null) { el.textContent = fmt(p.price); el.setAttribute('data-jeere-amount', String(p.price)); }
      else if (el.hasAttribute('data-jeere-photo') && el.tagName === 'IMG' && p.image && el.getAttribute('src') !== p.image && el.src !== p.image) {
        var was = el.getAttribute('src'), wasSet = el.getAttribute('srcset'), wasSizes = el.getAttribute('sizes');
        el.addEventListener('error', function back() {
          el.removeEventListener('error', back);
          if (wasSet) el.setAttribute('srcset', wasSet);
          if (wasSizes) el.setAttribute('sizes', wasSizes);
          if (was) el.setAttribute('src', was);
        });
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
        el.setAttribute('src', p.image);
      }
    });
    try { cards(); } catch (e) { /* the cards keep the model's words */ }
    try { galleries(); } catch (e) { /* the page keeps its one photo */ }
    $$('[data-jeere-add]').filter(outsideLines).forEach(function (b) {
      var id = idOf(b, 'data-jeere-add');
      if (!id) return;
      remember(b);
      var o = originals ? originals.get(b) : null;
      var p = product(id);
      if (sellable(id)) {
        if (b.getAttribute('data-jeere-off') === '1') {
          b.removeAttribute('data-jeere-off');
          if (o) { b.innerHTML = o.text; if (o.label === null) b.removeAttribute('aria-label'); else b.setAttribute('aria-label', o.label); }
          if ('disabled' in b) b.disabled = o ? o.disabled : false;
          b.removeAttribute('aria-disabled');
        }
      } else {
        var label = b.hasAttribute('data-jeere-soldout') ? b.getAttribute('data-jeere-soldout') : 'Épuisé';
        b.setAttribute('data-jeere-off', '1');
        if (b.textContent !== label) b.textContent = label;
        b.setAttribute('aria-label', 'Épuisé' + (p && p.name ? ' : ' + p.name : ''));
        if ('disabled' in b) b.disabled = true;
        b.setAttribute('aria-disabled', 'true');
      }
    });
  }

  function fillLine(node, l) {
    var all = [node].concat($$('*', node));
    all.forEach(function (el) {
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (a.value.indexOf('{name}') !== -1 || a.value.indexOf('{qty}') !== -1) el.setAttribute(a.name, a.value.split('{name}').join(l.name).split('{qty}').join(String(l.qty)));
      }
      if (el.hasAttribute('data-jeere-name')) el.textContent = l.name;
      if (el.hasAttribute('data-jeere-qty')) el.textContent = String(l.qty);
      if (el.hasAttribute('data-jeere-price')) el.textContent = fmt(l.price);
      if (el.hasAttribute('data-jeere-line-total')) el.textContent = fmt(l.total);
      if (el.hasAttribute('data-jeere-photo') && el.tagName === 'IMG' && l.image) el.setAttribute('src', l.image);
      ['data-jeere-inc', 'data-jeere-dec', 'data-jeere-remove'].forEach(function (k) { if (el.hasAttribute(k)) el.setAttribute(k, l.id); });
      if (el.hasAttribute('data-jeere-inc') && l.qty >= QMAX && 'disabled' in el) el.disabled = true;
    });
    if (node.setAttribute) node.setAttribute('data-jeere-line', l.id);
  }
  function defaultLine() {
    var d = document.createElement('div');
    d.className = 'jeere-line';
    d.innerHTML = '<span data-jeere-name></span> <button type="button" data-jeere-dec aria-label="Retirer un {name}">−</button> ' +
      '<span data-jeere-qty></span> <button type="button" data-jeere-inc aria-label="Ajouter un {name}">+</button> <span data-jeere-line-total></span>';
    return d;
  }
  function renderLines(box, detail) {
    // Keep the focus on the same control across the redraw (the − / + of a line)
    var act = document.activeElement, keep = null;
    if (act && box.contains(act)) {
      ['data-jeere-inc', 'data-jeere-dec', 'data-jeere-remove'].forEach(function (k) { if (!keep && act.hasAttribute(k)) keep = { k: k, id: act.getAttribute(k) }; });
    }
    var tpl = box.querySelector('template[data-jeere-line]');
    var empty = box.querySelector('template[data-jeere-empty]');
    Array.prototype.slice.call(box.childNodes).forEach(function (n) { if (!(n.nodeType === 1 && n.tagName === 'TEMPLATE')) box.removeChild(n); });
    var frag = document.createDocumentFragment();
    if (!detail.lines.length) {
      if (empty && empty.content) frag.appendChild(empty.content.cloneNode(true));
    } else {
      detail.lines.forEach(function (l) {
        var part = tpl && tpl.content ? tpl.content.cloneNode(true) : defaultLine();
        var roots = part.nodeType === 11 ? Array.prototype.slice.call(part.children || part.childNodes).filter(function (n) { return n.nodeType === 1; }) : [part];
        roots.forEach(function (r) { fillLine(r, l); });
        frag.appendChild(part);
      });
    }
    box.appendChild(frag);
    if (keep) {
      var again = box.querySelector(attrSel(keep.k, keep.id)) || box.querySelector('[data-jeere-inc],[data-jeere-dec],[data-jeere-remove]');
      if (again && !again.disabled) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
    }
  }
  // Her networks (fiche.store.social: handles, cleaned by the Jehre app), in every [data-jeere-social]
  var SOCIAL = {
    instagram: { label: 'Instagram', re: /^[A-Za-z0-9._]{1,30}$/, url: function (h) { return 'https://www.instagram.com/' + h + '/'; },
      svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>' },
    tiktok: { label: 'TikTok', re: /^[A-Za-z0-9._]{2,24}$/, url: function (h) { return 'https://www.tiktok.com/@' + h; },
      svg: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.6 2.2 4.4 5 4.6"/>' },
    facebook: { label: 'Facebook', re: /^[A-Za-z0-9.\-]{2,80}$/, url: function (h) { return 'https://www.facebook.com/' + h; },
      svg: '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.6V4.3a21 21 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.2H8.6v3h2.7V21"/>' }
  };
  /* Her shop's extras (never in the editor's preview): the round WhatsApp button (Paramètres, on unless she turns it
     off) and her trackers, Meta Pixel and Google Analytics 4 (Paramètres), with « add to cart ». */
  function shopExtras(fiche) {
    if (inEditor || preview || !isObj(fiche) || !isObj(fiche.store)) return;
    var st = fiche.store, wa = String(st.whatsapp || '').replace(/\D/g, '');
    if (wa.length >= 8 && st.waButton !== false && !document.getElementById('jeere-wa')) {
      var a = document.createElement('a');
      a.id = 'jeere-wa'; a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Bonjour ' + String(st.name || '') + ', j’ai une question :');
      a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Écrire sur WhatsApp');
      a.setAttribute('style', 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483000;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;box-shadow:0 10px 24px -8px rgba(0,0,0,.45);text-decoration:none');
      a.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';
      document.body.appendChild(a);
    }
    var t = isObj(st.tracking) ? st.tracking : {}, px = String(t.metaPixel || '').replace(/\D/g, ''), ga = String(t.ga4 || '').trim().toUpperCase();
    if (window.__jeereTracking) return;
    window.__jeereTracking = true;
    if (/^\d{8,20}$/.test(px)) {
      /* eslint-disable */
      !function (f, b, e, v, n, a2, s2) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; a2 = b.createElement(e); a2.async = !0; a2.src = v; s2 = b.getElementsByTagName(e)[0]; s2.parentNode.insertBefore(a2, s2); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', px); window.fbq('track', 'PageView');
    }
    if (/^G-[A-Z0-9]{4,15}$/.test(ga)) {
      var g = document.createElement('script'); g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga); document.head.appendChild(g);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', ga);
    }
  }
  function shopTrack(ev) {
    try { if (window.fbq) window.fbq('track', ev); } catch (e) { /* ignore */ }
    try { if (window.gtag && ev === 'AddToCart') window.gtag('event', 'add_to_cart'); } catch (e) { /* ignore */ }
  }
  function drawSocial(fiche) {
    var boxes = $$('[data-jeere-social]');
    if (!boxes.length) return;
    var soc = isObj(fiche) && isObj(fiche.store) && isObj(fiche.store.social) ? fiche.store.social : {};
    var nets = ['instagram', 'tiktok', 'facebook'].filter(function (k) { return typeof soc[k] === 'string' && SOCIAL[k].re.test(soc[k]); });
    if (!document.getElementById('jeere-social-css')) {
      var st = document.createElement('style'); st.id = 'jeere-social-css';
      st.textContent = '[data-jeere-social]{display:flex;flex-wrap:wrap;gap:10px}[data-jeere-social][hidden],[data-jeere-social-fallback][hidden]{display:none!important}' +
        '.jeere-social{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;border:1px solid currentColor;color:inherit;opacity:.85;text-decoration:none;transition:opacity .15s,transform .15s}' +
        '.jeere-social:hover{opacity:1;transform:translateY(-1px)}.jeere-social svg{width:19px;height:19px}';
      document.head.appendChild(st);
    }
    boxes.forEach(function (box) {
      box.innerHTML = '';
      nets.forEach(function (k) {
        var a = document.createElement('a');
        a.className = 'jeere-social'; a.href = SOCIAL[k].url(soc[k]); a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', SOCIAL[k].label + ' · ' + (k === 'facebook' ? soc[k] : '@' + soc[k]));
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + SOCIAL[k].svg + '</svg>';
        box.appendChild(a);
      });
      box.hidden = !nets.length;
    });
    // the site's own placeholder (« instagram · tiktok » in words) gives way to her real links
    $$('[data-jeere-social-fallback]').forEach(function (el) { el.hidden = !!nets.length; });
  }

  /* A product page (the product is the page itself, not a card in a list) whose product has several photos: under
   * the big photo, a row of small ones; touching one shows it big. Drawn with plain elements, in the page's own
   * look (no colour of ours), and removed when the product has one photo again. */
  /* A card that shows ANOTHER product than the model's (she chose it for this case): what the card says about the
   * model's product goes with it. Its label (« Best-seller », « Nouveau ») becomes her product's, or goes; its small
   * line (« Gels douche », « 3 paquets · 18 pouces ») becomes her category, or goes; an old price or a « -19 % » goes.
   * Its photo: her product's; else the model's photo of that product when it has a card on the page; else a plain
   * light square (never the photo of another product). A card back on the model's product gets back all of it. */
  var NO_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#F2F2EF"/><g fill="none" stroke="#C9C9C2" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><rect x="250" y="330" width="140" height="120" rx="22"/><circle cx="290" cy="372" r="12"/><path d="M262 440l42-42 30 30 18-18 36 36"/></g></svg>');
  /* « Plain »: on a seller's store, a photo of the model she has not replaced is a clean light frame of the same size
     (in the editor it says where to put her photo); a product card with no product of hers is hidden on her shop.
     The model's own demo (its gallery, the team's demo stores) keeps its photos. */
  var PLAIN = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice"><rect width="1200" height="1200" fill="#D9D9D3"/></svg>');
  var PLAIN_EDIT = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice"><rect width="1200" height="1200" fill="#E4E4DF"/><g transform="translate(600 560)"><circle r="54" fill="#FFFFFF" stroke="#D6D6D0" stroke-width="3"/><path d="M0 -20v40M-20 0h40" stroke="#6F6F68" stroke-width="5" stroke-linecap="round"/></g><text x="600" y="660" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="30" font-weight="500" fill="#6F6F68">Ajoutez votre photo</text></svg>');
  function plainOn() { return !DEMO_STORES[inEditor ? (viewing || slug) : slug]; }
  function plainSrc() { return inEditor ? PLAIN_EDIT : PLAIN; }
  // a photo of the page that is a decoration of the model (a logo, an icon, an avatar) keeps its picture
  function plainable(img) {
    if (img.closest && img.closest('header, footer, [class*="logo"], [class*="avatar"], [class*="icon"]')) return false;
    var r = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
    var w = (r && r.width) || img.naturalWidth || 0, h = (r && r.height) || img.naturalHeight || 0;
    return !(w && w < 72) && !(h && h < 72);
  }
  function setPlain(img) {
    var to = plainSrc();
    if (img.getAttribute('src') !== to) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.setAttribute('src', to); }
    img.setAttribute('data-jeere-plain', '');
    if (!img.style.objectFit) img.style.objectFit = 'cover';
  }
  var LABELS = { best: 'Best-seller', new: 'Nouveau', promo: 'Promo' };
  function keepOrig(el) {
    if (!el.hasAttribute('data-jeere-o-text')) { el.setAttribute('data-jeere-o-text', el.textContent); el.setAttribute('data-jeere-o-display', el.style.display || ''); }
  }
  function backOrig(el) {
    if (!el.hasAttribute('data-jeere-o-text')) return;
    el.textContent = el.getAttribute('data-jeere-o-text'); el.style.display = el.getAttribute('data-jeere-o-display');
  }
  function cards() {
    $$('[data-jeere-product]').filter(outsideLines).forEach(function (c) {
      var id = c.getAttribute('data-jeere-product'), slot = c.getAttribute('data-jeere-slot-product') || id;
      var p = S.products && S.products[id], was = c.getAttribute('data-jeere-model-name') || '';
      var moved = slot !== id || !!(p && p.name && was && plainName(p.name) !== was);
      // on a product page, the words around the name in its title (« Michou … Noir délavé ») are the model's
      var nm = c.querySelector('[data-jeere-name]'), title = nm && nm.parentElement && /^H[1-3]$/.test(nm.parentElement.tagName) && nm.parentElement.children.length === 1 ? nm.parentElement : null;
      if (title) Array.prototype.forEach.call(title.childNodes, function (t) {
        if (t.nodeType !== 3) return;
        if (!t.hasOwnProperty('jeereWas')) t.jeereWas = t.nodeValue;
        t.nodeValue = moved && p ? '' : t.jeereWas;
      });
      var img = c.querySelector('img[data-jeere-photo]') || c.querySelector('img');
      if (img && !img.hasAttribute('data-jeere-model-src')) img.setAttribute('data-jeere-model-src', img.getAttribute('src') || '');
      var badges = $$('[class*="badge"], [class*="__tag"]', c).filter(function (e) { return !e.children.length; });
      var lines = $$('[class*="__cat"], [class*="__detail"], [class*="__matiere"], [class*="__meta"]', c).filter(function (e) { return !e.querySelector('[data-jeere-price], [data-jeere-name]'); });
      var olds = $$('[class*="__promo"], s', c);
      badges.concat(lines, olds).forEach(keepOrig);
      // on her store, a case showing the model's demo product (none of hers in it): hidden on her shop, a plain
      // frame in the editor (she chooses a product for it)
      var demo = !p && plainOn() && !!S.products;
      if (isCard(c)) {
        if (demo && !inEditor) { if (!c.hasAttribute('data-jeere-plain-hid')) { c.setAttribute('data-jeere-plain-hid', c.style.display || ''); c.style.display = 'none'; } }
        else if (c.hasAttribute('data-jeere-plain-hid')) { c.style.display = c.getAttribute('data-jeere-plain-hid'); c.removeAttribute('data-jeere-plain-hid'); }
      }
      if (demo && img) { setPlain(img); badges.concat(lines, olds).forEach(function (e) { e.style.display = 'none'; }); return; }
      if (img && img.hasAttribute('data-jeere-plain')) img.removeAttribute('data-jeere-plain');
      if (!p || !moved) {
        badges.concat(lines, olds).forEach(backOrig);
        // the model's own product (or hers with no photo of its own): the model's photo, whatever was shown before
        img && img.removeAttribute('data-jeere-no-photo');
        if (img && p && !p.image && plainOn()) { setPlain(img); return; }
        if (img && (!p || !p.image) && img.getAttribute('data-jeere-model-src') && img.getAttribute('src') !== img.getAttribute('data-jeere-model-src')) { img.removeAttribute('srcset'); img.setAttribute('src', img.getAttribute('data-jeere-model-src')); }
        return;
      }
      var label = LABELS[p.badge] || '';
      badges.forEach(function (e) {
        if (!label) { e.style.display = 'none'; return; }
        e.textContent = label; e.style.display = e.getAttribute('data-jeere-o-display');
        e.className = e.className.replace(/(badge--)(best|new|promo)\b/, '$1' + p.badge);
      });
      if (c.hasAttribute('data-tags')) c.setAttribute('data-tags', p.badge || '');
      lines.forEach(function (e) { if (p.category) { e.textContent = p.category; e.style.display = e.getAttribute('data-jeere-o-display'); } else e.style.display = 'none'; });
      olds.forEach(function (e) { e.style.display = 'none'; });
      if (img && p.image) img.removeAttribute('data-jeere-no-photo');
      if (img && !p.image) {
        var own = document.querySelector(attrSel('data-jeere-slot-product', id) + ' img[data-jeere-model-src]');
        var src = plainOn() ? plainSrc() : own && own !== img ? own.getAttribute('data-jeere-model-src') : NO_PHOTO;
        if (img.getAttribute('src') !== src) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.setAttribute('src', src); }
        img.setAttribute('data-jeere-no-photo', src === NO_PHOTO ? '1' : '');
      }
    });
  }
  function galleries() {
    $$('[data-jeere-gallery]').forEach(function (g) { g.parentNode && g.parentNode.removeChild(g); });
    // the product of a product page: the page itself (MICHOU's <main>), or the first product of a page under /produits/
    var pages = $$('main[data-jeere-product], [data-jeere-product][data-jeere-page]');
    if (!pages.length && /\/produits?\/[^/]+\/?$/.test(location.pathname)) { var first = document.querySelector('[data-jeere-product]'); if (first) pages = [first]; }
    pages.forEach(function (page) {
      var p = S.products && S.products[page.getAttribute('data-jeere-product')];
      var big = page.querySelector('img[data-jeere-photo]');
      if (!p || !big || !p.images || p.images.length < 2) return;
      var row = document.createElement('div');
      row.setAttribute('data-jeere-gallery', '');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Photos du produit');
      row.setAttribute('style', 'display:flex;gap:8px;margin:12px 0 0;padding:2px 16px 4px;overflow-x:auto;scrollbar-width:none');
      p.images.forEach(function (src, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Photo ' + (i + 1) + ' sur ' + p.images.length);
        b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
        b.setAttribute('style', 'flex:none;width:64px;height:64px;padding:0;border:0;border-radius:10px;overflow:hidden;background:transparent;cursor:pointer;opacity:' + (i === 0 ? '1' : '.6') + ';outline:' + (i === 0 ? '1.5px solid currentColor' : '0') + ';outline-offset:2px');
        var im = document.createElement('img');
        im.src = src; im.alt = ''; im.loading = 'lazy';
        im.setAttribute('style', 'display:block;width:100%;height:100%;object-fit:cover');
        b.appendChild(im);
        b.addEventListener('click', function () {
          big.removeAttribute('srcset'); big.removeAttribute('sizes'); big.setAttribute('src', src);
          Array.prototype.forEach.call(row.children, function (o) { var on = o === b; o.setAttribute('aria-pressed', on ? 'true' : 'false'); o.style.opacity = on ? '1' : '.6'; o.style.outline = on ? '1.5px solid currentColor' : '0'; });
        });
        row.appendChild(b);
      });
      var holder = big.parentElement && big.parentElement !== page ? big.parentElement : big;
      holder.parentNode.insertBefore(row, holder.nextSibling);
    });
  }
  function render() {
    var d = cartDetail();
    $$('[data-jeere-count]').forEach(function (el) { el.textContent = String(d.count); });
    $$('[data-jeere-total]').forEach(function (el) { el.textContent = fmt(d.total); el.setAttribute('data-jeere-amount', String(d.total)); });
    $$('[data-jeere-lines]').forEach(function (box) { renderLines(box, d); });
    $$('[data-jeere-checkout]').forEach(function (el) {
      var off = !d.count;
      if (el.tagName === 'A') {
        if (off) { el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true'); } else { el.setAttribute('href', d.url); el.removeAttribute('aria-disabled'); }
      } else if ('disabled' in el) el.disabled = off;
    });
  }

  function onClick(e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var el = t.closest('[data-jeere-add],[data-jeere-inc],[data-jeere-dec],[data-jeere-remove],[data-jeere-checkout]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') {
      if (el && el.tagName === 'A') e.preventDefault();
      return;
    }
    if (el.hasAttribute('data-jeere-checkout')) {
      e.preventDefault();
      if (!Object.keys(S.cart).length) return;
      try { window.location.assign(checkoutUrl()); } catch (x) { window.location.href = checkoutUrl(); }
      return;
    }
    var id;
    if (el.hasAttribute('data-jeere-add')) {
      id = idOf(el, 'data-jeere-add');
      if (id) {
        e.preventDefault();
        if (add(id, 1)) {
          shopTrack('AddToCart');
          if (el.hasAttribute('data-jeere-go') && !inEditor) { try { window.location.assign(checkoutUrl()); } catch (x) { window.location.href = checkoutUrl(); } }
        }
      }
      return;
    }
    if (el.hasAttribute('data-jeere-inc')) { id = idOf(el, 'data-jeere-inc'); if (id) { e.preventDefault(); add(id, 1); } return; }
    if (el.hasAttribute('data-jeere-dec')) { id = idOf(el, 'data-jeere-dec'); if (id) { e.preventDefault(); set(id, (S.cart[id] || 0) - 1); } return; }
    if (el.hasAttribute('data-jeere-remove')) { id = idOf(el, 'data-jeere-remove'); if (id) { e.preventDefault(); set(id, 0); } }
  }

  /* ---------------------------------------------------------------- the store */

  function fetchStore() {
    if (!slugOk || typeof fetch !== 'function') return Promise.resolve({ ok: false, code: 'notfound' });
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : 0;
    var url = SB_URL + '/rest/v1/stores?slug=eq.' + encodeURIComponent(slug) + '&published=is.true&select=slug,fiche';
    return fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) return { ok: false, code: 'offline' };
        return r.json().then(function (rows) {
          var row = Array.isArray(rows) ? rows[0] : null;
          return row && isObj(row.fiche) ? { ok: true, fiche: row.fiche } : { ok: false, code: 'notfound' };
        });
      })
      .catch(function () { clearTimeout(timer); return { ok: false, code: 'offline' }; });
  }

  /* ---------------------------------------------------------------- her changes to the page
   * The texts and pictures of a designer model, numbered in page order (the demo band left out), changed in the
   * Jehre editor and kept in her fiche (store.site.t / store.site.i). Inside the editor, a click picks one. */
  var MODEL_NAMES = { seve: 'SÈVE', soyeuse: 'SOYEUSE', michou: 'MICHOU', anse: 'ANSE', regard: 'REGARD', vernie: 'VERNIE', minuit: 'MINUIT' };
  var TEXT_SEL = 'h1,h2,h3,h4,h5,p,li,blockquote,figcaption,dt,dd,small,a,button,span,strong,em,b,label';
  var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, BR: 1, SMALL: 1, U: 1, SPAN: 1 };
  var original = {}, editing = false, parentOrigin = '';
  function pagePath() { var p = location.pathname.replace(/^\/concepts\/[a-z0-9-]+/, '').replace(/index\.html$/, ''); return p ? (p.charAt(p.length - 1) === '/' ? p : p + '/') : '/'; }
  function skip(el) { return !!(el.closest && el.closest('[data-jeere-added], [data-jeere-note], [data-jeere-gallery], label.paiement, [data-pay], .concept, .concept-bar, .avis__note-exemple, script, style, noscript, [data-jeere-lines], [data-jeere-price], [data-jeere-name], [data-jeere-count], [data-jeere-total], [data-jeere-services], [data-jeere-social], .jb, [hidden]')); }
  function editTexts() {
    return $$(TEXT_SEL).filter(function (el) {
      if (skip(el)) return false;
      if (el.parentElement && el.parentElement.closest && el.parentElement.closest(TEXT_SEL) && editableText(el.parentElement.closest(TEXT_SEL))) return false;
      return editableText(el);
    });
  }
  function editableText(el) {
    var t = (el.textContent || '').trim();
    if (!t || t.length > 800) return false;
    // a child with a class of its own is a piece of the design (a logo's name and its line): edited apart
    for (var i = 0; i < el.children.length; i++) if (!INLINE[el.children[i].tagName] || el.children[i].children.length || (el.children[i].tagName !== 'BR' && el.children[i].className)) return false;
    return true;
  }
  function ownNodes(el) { return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.replace(/\s+/g, '').length > 0; }); }
  function ownWords(el) { return plain(ownNodes(el).map(function (n) { return n.nodeValue; }).join(' ')).replace(/\s+/g, ' ').trim(); }
  function ownTexts() {
    var whole = editTexts();
    return $$('h1,h2,h3,h4,h5,h6,p,a,button,li,dt,dd,blockquote,figcaption,label,small,span,strong,em').filter(function (el) {
      if (skip(el) || editableText(el) || !ownNodes(el).length) return false;
      if (ownWords(el).length < 2 || (el.textContent || '').length > 800) return false;
      if (credit(el) || (el.closest && el.closest(MARQ))) return false;
      if (isCard(el.closest('[data-jeere-product]'))) return false;
      if (el.closest && el.closest('label.paiement, [data-pay], form label')) return false;
      for (var i = 0; i < whole.length; i++) if (whole[i].contains(el)) return false;
      return true;
    });
  }
  function setOwn(el, text) {
    var ns = ownNodes(el);
    if (!el.hasAttribute('data-jeere-own')) el.setAttribute('data-jeere-own', JSON.stringify(ns.map(function (n) { return n.nodeValue; })));
    var was = []; try { was = JSON.parse(el.getAttribute('data-jeere-own')) || []; } catch (e) { was = []; }
    if (typeof text === 'string') { ns.forEach(function (n, i) { n.nodeValue = i === 0 ? text + (/\s$/.test(was[0] || '') ? ' ' : '') : ''; }); }
    else ns.forEach(function (n, i) { if (typeof was[i] === 'string') n.nodeValue = was[i]; });
  }
  /* A text with a line of its own inside (« Hauts » and, below, « t-shirts lourds et délavés » in a <small> shown as a
   * block): two texts for her. The outer one keeps its number and edits only its own words; the inner lines are
   * numbered apart (|w|), so no other text of the page changes number. */
  function stacked(el) {
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.tagName === 'BR' || !(c.textContent || '').trim()) continue;
      var d = ''; try { var cs = window.getComputedStyle(c); d = cs.display; if (cs.position === 'absolute' || cs.position === 'fixed') return true; } catch (e) { d = ''; }
      if (d && d !== 'inline' && d !== 'inline-block' && d !== 'contents' && d !== 'none') return true;
    }
    return false;
  }
  function stackedLines(whole) {
    var out = [];
    whole.forEach(function (el) {
      if (!ownNodes(el).length || !stacked(el)) return;
      for (var i = 0; i < el.children.length; i++) { var c = el.children[i]; if (c.tagName !== 'BR' && (c.textContent || '').trim()) out.push(c); }
    });
    return out;
  }
  function editImgs() { return $$('img').filter(function (el) { return !skip(el) && !(el.closest && el.closest('[data-jeere-logo-img]')); }); }
  // what she can change on this page, numbered in page order: texts (t), pictures (i), the category of a
  // service card (c); and what comes from elsewhere: a product card (p), the list of her services (s)
  // a photo that is a link of the page (a campaign tile « Hauts », « Bas »…), not a product card's
  function photoLink(img) {
    var a = img.closest ? img.closest('a[href]') : null;
    return a && !a.closest('[data-jeere-product]') && !a.closest('header') ? a : null;
  }
  // « Hauts & T-shirts » → « hauts-t-shirts »: the name of a category in the page's own filters (letters and dashes)
  function catSlug(t) {
    var s = String(t || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* old browser */ }
    return s.replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
  }
  // On a seller's own store, the shop's filters are HER categories: each card takes its product's category, the
  // filter buttons take her category names (the model's own are for its demo products).
  function applyCats(fiche) {
    if (DEMO_STORES[slug] && !inEditor) return;
    var prods = Array.isArray(fiche.products) ? fiche.products : [], cat = {};
    prods.forEach(function (p) { if (p && p.id) cat[p.id] = String(p.category || '').trim(); });
    var shown = [];
    $$('[data-jeere-product][data-cat]').forEach(function (c) {
      if (c.hasAttribute('data-jeere-hid')) return;
      var name = cat[c.getAttribute('data-jeere-product')] || '';
      c.setAttribute('data-cat', catSlug(name) || 'autres');
      if (name && shown.indexOf(name) === -1) shown.push(name);
    });
    var pills = $$('[data-filter]').filter(function (b) { return b.getAttribute('data-filter') !== 'tout' && !b.hasAttribute('data-jeere-pill'); });
    if (!pills.length) return;
    $$('[data-jeere-pill]').forEach(function (b) { b.parentNode.removeChild(b); });
    pills.forEach(function (b, i) {
      if (i < shown.length) { b.hidden = false; b.style.display = ''; b.textContent = shown[i].toLowerCase(); b.setAttribute('data-filter', catSlug(shown[i])); }
      else { b.hidden = true; b.style.display = 'none'; }
    });
    // more categories than the model has buttons: the extra ones, working the same way
    var last = pills[pills.length - 1];
    shown.slice(pills.length).forEach(function (name) {
      var b = last.cloneNode(true);
      b.hidden = false; b.style.display = ''; b.textContent = name.toLowerCase(); b.setAttribute('data-filter', catSlug(name)); b.setAttribute('data-jeere-pill', ''); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var want = b.getAttribute('data-filter');
        $$('[data-filter]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        $$('[data-jeere-product][data-cat]').forEach(function (c) { c.hidden = c.getAttribute('data-cat') !== want; });
      });
      last.parentNode.appendChild(b);
    });
  }
  function credit(el) {
    var sel = 'a[href*="kreeative.xyz"]';
    return !!((el.closest && el.closest(sel)) || (el.querySelector && el.querySelector(sel) && (el.textContent || '').length < 400));
  }
  function cardOf(el) { return el.closest ? el.closest('a[data-jeere-book]:not([data-jeere-book=""]), [data-jeere-service]') : null; }
  /* The scrolling bands of a model (« ruban »): a track of short messages that runs in a loop. */
  var MARQ = '.ruban, .marquee, [data-jeere-marquee]';
  function marquees() { return $$(MARQ).filter(function (el) { return !skip(el) && !(el.parentElement && el.parentElement.closest(MARQ)); }); }
  function bandTrack(el) { return el.querySelector('.ruban__track, .marquee__track, [data-jeere-track]') || el.firstElementChild || el; }
  function bandCount(el) {
    if (!el.hasAttribute('data-jeere-mn')) el.setAttribute('data-jeere-mn', String(editTexts().filter(function (t) { return el.contains(t); }).length));
    return parseInt(el.getAttribute('data-jeere-mn'), 10) || 0;
  }
  function bandWords(html) {
    var box = document.createElement('div'), seen = []; box.innerHTML = html;
    Array.prototype.forEach.call(box.children.length ? box.children : [box], function (c) { var t = plain(c.textContent || '').replace(/\s+/g, ' ').trim(); if (t && seen.indexOf(t) === -1) seen.push(t); });
    return seen.join(' • ');
  }
  /* Her band (store.site.m[<key>] = { text, bg, color, speed, hide }): ONE text, its messages separated by « • ».
   * It is written once and runs in a loop without a seam: the messages are repeated until they are wider than
   * the screen, that group is laid twice side by side, and the track slides by exactly one group. */
  function applyBands(all, base) {
    marquees().forEach(function (el, n) {
      var o = isObj(all[base + '|m|' + n]) ? all[base + '|m|' + n] : null, tr = bandTrack(el);
      bandCount(el);
      if (!el.hasAttribute('data-jeere-m')) el.setAttribute('data-jeere-m', JSON.stringify([tr.innerHTML, tr.style.animation || '', el.style.background || '', el.style.color || '', el.style.display || '']));
      var was = []; try { was = JSON.parse(el.getAttribute('data-jeere-m')) || []; } catch (e) { was = []; }
      var own = bandWords(was[0] || '');
      o = o || {};
      var text = typeof o.text === 'string' ? o.text.slice(0, 600).replace(/\s+/g, ' ').trim() : '';
      el.setAttribute('data-jeere-mt', text || own);
      el.style.background = hexColor(o.bg) ? o.bg : (was[2] || '');
      el.style.color = hexColor(o.color) ? o.color : (was[3] || '');
      el.style.display = o.hide === true ? 'none' : (was[4] || '');
      var speed = o.speed === 'slow' || o.speed === 'fast' ? o.speed : '';
      var state = text + '|' + speed;
      if (el.getAttribute('data-jeere-ms') === state) return;
      el.setAttribute('data-jeere-ms', state);
      if (!text && !speed) { tr.innerHTML = was[0] || ''; tr.style.animation = was[1] || ''; return; }
      var msgs = (text || own).split('•').map(function (m) { return m.trim(); }).filter(Boolean).slice(0, 20);
      if (!msgs.length) { tr.innerHTML = was[0] || ''; tr.style.animation = was[1] || ''; return; }
      var group = [], chars = 0;
      do { msgs.forEach(function (m) { group.push(m); chars += m.length + 4; }); } while (chars < 170 && group.length < 80);
      tr.innerHTML = '';
      [0, 1].forEach(function () { group.forEach(function (m) { tr.appendChild(mk('span', '', m)); }); });
      tr.style.width = 'max-content'; tr.style.whiteSpace = 'nowrap';
      if (!document.getElementById('jeere-band-css')) { var st = document.createElement('style'); st.id = 'jeere-band-css'; st.textContent = '@keyframes jeere-band{from{transform:translateX(0)}to{transform:translateX(var(--jeere-band,-50%))}}'; document.head.appendChild(st); }
      var shift = tr.children.length > group.length ? tr.children[group.length].offsetLeft - tr.children[0].offsetLeft : 0;
      tr.style.setProperty('--jeere-band', shift > 0 ? '-' + shift + 'px' : '-50%');
      var still = false; try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { still = false; }
      var pace = speed === 'slow' ? 28 : speed === 'fast' ? 95 : 52;
      tr.style.animation = still ? 'none' : 'jeere-band ' + Math.max(6, Math.round((shift || 1200) / pace)) + 's linear infinite';
    });
  }
  function keyed() {
    var base = pagePath(), out = [], nt = 0, nc = 0, seenBands = [];
    editTexts().forEach(function (el) {
      var card = cardOf(el), cat = card && /pill|cat|tag|badge/.test(String(el.className || ''));
      if (cat) out.push({ el: el, kind: 'c', key: base + '|c|' + (nc++), ref: card.getAttribute('data-jeere-book') || card.getAttribute('data-jeere-service') || '' });
      // « Modèle par Kreeative »: the designer's signature stays as it is (it keeps its number, so the other texts keep theirs)
      else if (credit(el)) nt++;
      // a scrolling band is ONE thing to edit: its moving pieces are not offered. They keep the numbers the model
      // gave them (counted once, as the model wrote them), so the texts after the band keep theirs whatever she writes
      else if (el.closest && el.closest(MARQ)) { var band = el.closest(MARQ); if (seenBands.indexOf(band) === -1) { seenBands.push(band); nt += bandCount(band); } }
      // what a product card says comes from the product (the dashboard), not from here; numbers kept
      else if (isCard(el.closest('[data-jeere-product]'))) nt++;
      else out.push({ el: el, kind: 't', key: base + '|t|' + (nt++), own: ownNodes(el).length > 0 && stacked(el) });
    });
    editImgs().forEach(function (el, n) { out.push({ el: el, kind: 'i', key: base + '|i|' + n }); });
    $$('[data-jeere-product]').forEach(function (el) { var slot = el.getAttribute('data-jeere-slot-product') || el.getAttribute('data-jeere-product'); if (!skip(el.parentElement || el)) out.push({ el: el, kind: 'p', key: base + '|p|' + slot, ref: slot }); });
    $$('[data-jeere-services]').forEach(function (el, n) { out.push({ el: el, kind: 's', key: base + '|s|' + n }); });
    marquees().forEach(function (el, n) { out.push({ el: el, kind: 'm', key: base + '|m|' + n }); });
    ownTexts().forEach(function (el, n) { out.push({ el: el, kind: 't', key: base + '|o|' + n, own: true }); });
    stackedLines(editTexts()).forEach(function (el, n) { out.push({ el: el, kind: 't', key: base + '|w|' + n }); });
    return out;
  }
  // the sections of the page, in order: the header, each <section>, the footer (as in the simple editor's list)
  var SEC_SEL = 'header, footer, section, .strip';
  function sections() { return $$(SEC_SEL).filter(function (el) { return !skip(el) && !(el.parentElement && el.parentElement.closest(SEC_SEL)); }); }
  function secName(el, n, all) {
    var tag = el.tagName;
    if (tag === 'HEADER') return ['En-tête', 'header'];
    if (tag === 'FOOTER') return ['Pied de page', 'footer'];
    if (el.classList.contains('strip')) return ['Bandeau du haut', 'megaphone'];
    var firstSection = all.filter(function (x) { return x.tagName === 'SECTION'; })[0] === el;
    if (firstSection || /hero/.test(el.className)) return ['Grande bannière', 'image'];
    var h = el.querySelector('h2, h3'), lab = el.getAttribute('aria-label') || '';
    var t = ((h && h.textContent) || lab || '').replace(/\s+/g, ' ').trim();
    if (el.querySelector('[data-jeere-services]')) return [t || 'La carte', 'grid'];
    if (el.querySelector('[data-jeere-product]')) return [t || 'Produits', 'bag'];
    return [t ? (t.length > 34 ? t.slice(0, 32) + '…' : t) : 'Section ' + (n + 1), /gal/.test(el.className) ? 'image' : /avis|review/.test(el.className) ? 'star' : 'info'];
  }
  // the store this page shows: her store in the editor (sent by the editor), else the one of the page
  var viewing = '';
  function demoSec(el) {
    var who = viewing || slug;
    if (MODEL_NAMES[who]) return false;                      // the model's own store keeps its example reviews
    return !!(el.matches && (el.matches('.avis, .avis-band, .reviews, .temoignages') || el.querySelector('.avis__note-exemple, .avis__grid')));
  }
  function secHidden(v, el) { return v === 'show' ? false : typeof v === 'string' ? true : demoSec(el); }
  function secOf(el, all) { for (var i = 0; i < all.length; i++) if (all[i].contains(el)) return i; return -1; }
  function role(x) {
    if (x.kind === 'i') return 'Photo';
    if (x.kind === 'c') return 'Catégorie';
    var t = x.el.tagName;
    if (/^H[1-5]$/.test(t)) return 'Titre';
    if (t === 'A' || t === 'BUTTON') return 'Bouton ou lien';
    if (t === 'LI' || t === 'DT' || t === 'DD') return 'Ligne';
    return (x.el.textContent || '').length > 70 ? 'Texte' : 'Sous-texte';
  }
  /* A model may draw its name with ornamental letters of its font (private characters: SOYEUSE's logo). The
   * editor must show plain letters: such a word that has the shape of the model's name IS the model's name;
   * elsewhere the ornamental characters are left out. What she types is always plain letters. */
  var PUA = /[\uE000-\uF8FF]/;
  function plain(t) {
    t = String(t || '');
    if (!PUA.test(t)) return t;
    var model = MODEL_NAMES[slug] || '';
    return t.replace(/[A-Za-zÀ-ÿ\uE000-\uF8FF]+/g, function (w) {
      if (!PUA.test(w)) return w;
      if (w.length === model.length) {
        var same = true;
        for (var i = 0; i < w.length; i++) if (!PUA.test(w.charAt(i)) && w.charAt(i).toUpperCase() !== model.charAt(i).toUpperCase()) same = false;
        if (same) return model;
      }
      return w.replace(/[\uE000-\uF8FF]/g, '');
    });
  }
  function words(el) {
    var c = el.cloneNode(true), br = c.querySelectorAll ? c.querySelectorAll('br') : [], i;
    for (i = 0; i < br.length; i++) br[i].parentNode.replaceChild(document.createTextNode(' '), br[i]);
    return plain(c.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function label(x) {
    if (x.kind === 'i') return x.el.getAttribute('alt') || '';
    var t = plain(x.el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 88) + '…' : t;
  }
  // the editor's left panel lists all of it, before any click
  // a button as drawn now: filled (its background is not see-through) and rounded (corners of 14 px or more)
  function btnLook(el) {
    if (!el || (el.tagName !== 'A' && el.tagName !== 'BUTTON')) return { fill: false, round: false };
    var cs; try { cs = window.getComputedStyle(el); } catch (e) { return { fill: false, round: false }; }
    var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || ''), p = m ? m[1].split(',') : [];
    var fill = !!m && (p.length < 4 || parseFloat(p[3]) > 0.1) || (cs.backgroundImage && cs.backgroundImage !== 'none');
    return { fill: !!fill, round: (parseFloat(cs.borderTopLeftRadius) || 0) >= 14 };
  }
  function sendMap() {
    if (!editing || !parentOrigin) return;
    var all = sections(), base = pagePath();
    var items = keyed().map(function (x) {
      return { key: x.key, kind: x.kind, ref: x.ref || '', link: x.kind === 'i' && !!photoLink(x.el), label: x.kind === 'm' ? (x.el.getAttribute('data-jeere-mt') || '') : label(x), text: x.kind === 'm' ? (x.el.getAttribute('data-jeere-mt') || '') : x.own ? ownWords(x.el) : x.kind === 't' || x.kind === 'c' ? words(x.el) : '', role: x.kind === 'm' ? 'Bandeau défilant' : role(x), sec: secOf(x.el, all), src: x.kind === 'i' ? (x.el.currentSrc || x.el.src || '') : '',
        tag: x.el.tagName.toLowerCase(), href: x.el.tagName === 'A' ? (x.el.getAttribute('data-jeere-k') || x.el.getAttribute('href') || '') : x.kind === 'i' && photoLink(x.el) ? (photoLink(x.el).getAttribute('data-jeere-href') || photoLink(x.el).getAttribute('href') || '') : '', size: x.kind === 't' || x.kind === 'c' ? Math.round(parseFloat(window.getComputedStyle(x.el).fontSize) || 0) : 0, fill: btnLook(x.el).fill, round: btnLook(x.el).round, long: x.kind === 't' && (x.el.textContent || '').length > 70 };
    });
    var secs = all.map(function (el, n) { var nm = secName(el, n, all); return { n: n, key: base + '|h|' + n, name: nm[0], icon: nm[1], fixed: el.tagName === 'HEADER' || el.tagName === 'FOOTER', demo: demoSec(el) }; });
    try { if (editing) { markAll(); payNote(); } } catch (e) { /* marked at the next change */ }
    try { window.parent.postMessage({ jeereMap: { page: base, title: document.title, items: items, sections: secs } }, parentOrigin); } catch (e) { /* not in the editor */ }
  }
  // her logo in place of the model's name, in the header and the footer
  function applyLogo(fiche) {
    var logo = isObj(fiche.store) ? httpsImg(fiche.store.logo) || (/^data:image\//.test(str(fiche.store.logo)) ? str(fiche.store.logo) : '') : '';
    var name = isObj(fiche.store) ? str(fiche.store.name).trim() : '';
    // « Votre nom » chosen in the editor (store.brand = 'text'): her logo is kept aside, the name shows
    if (isObj(fiche.store) && fiche.store.brand === 'text') logo = '';
    // The model's name is never taken out of the page: it is only hidden, and her logo is drawn in a copy of its box
    // just before it (same classes, same link). So the texts and the pictures of the page keep their numbers, and
    // what she changed stays on the right text and the right picture, logo or not.
    $$('.logo__mark:not([data-jeere-logo-img]), a.logo:not(:has(.logo__mark)):not([data-jeere-logo-img]), .brand:not([data-jeere-logo-img])').forEach(function (el) {
      var box = el.previousElementSibling && el.previousElementSibling.hasAttribute('data-jeere-logo-img') ? el.previousElementSibling : null;
      if (!logo) {
        if (box) box.parentNode.removeChild(box);
        if (el.hasAttribute('data-jeere-logo-was')) { el.style.display = el.getAttribute('data-jeere-logo-was'); el.removeAttribute('data-jeere-logo-was'); }
        return;
      }
      if (!box) {
        box = document.createElement(el.tagName === 'A' ? 'a' : 'span');
        box.setAttribute('data-jeere-logo-img', '');
        if (el.className) box.className = el.className;
        if (el.tagName === 'A' && el.getAttribute('href') !== null) box.setAttribute('href', el.getAttribute('href'));
        if (el.getAttribute('aria-label')) box.setAttribute('aria-label', el.getAttribute('aria-label'));
        box.appendChild(document.createElement('img'));
        el.parentNode.insertBefore(box, el);
      }
      var im = box.querySelector('img');
      if (im.getAttribute('src') !== logo) im.src = logo;
      im.alt = name;
      im.setAttribute('style', 'display:block;height:42px;width:auto;max-width:220px;object-fit:contain');
      if (!el.hasAttribute('data-jeere-logo-was')) el.setAttribute('data-jeere-logo-was', el.style.display || '');
      el.style.display = 'none';
    });
  }
  function brand(fiche) {
    var name = isObj(fiche.store) ? str(fiche.store.name).trim() : '', model = MODEL_NAMES[slug];
    if (!name || !model) return;
    $$('.concept, .concept-bar').forEach(function (n) { n.remove(); });
    var re = new RegExp('(^|[^\\wÀ-ÿ])' + model + '(?![\\wÀ-ÿ])', 'g');
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node;
    while ((node = w.nextNode())) {
      // the name drawn in ornamental letters (a logo) is the model's name too: it becomes her store's name
      if (name !== model && PUA.test(node.nodeValue) && plain(node.nodeValue).indexOf(model) !== -1) node.nodeValue = plain(node.nodeValue);
      if (node.nodeValue.indexOf(model) !== -1) node.nodeValue = node.nodeValue.replace(re, '$1' + name);
    }
    if (document.title.indexOf(model) !== -1) document.title = document.title.replace(re, '$1' + name);
  }
  /* Her order of the sections of a page (store.site.o[<page>] = their numbers, in the order she wants). The page
   * itself is not moved: the order is drawn with CSS, so every text and picture keeps its number and her changes
   * stay on the right ones. The header and the footer never move. A list that does not match the page (a model
   * that changed since) is ignored: the model's own order shows. */
  function orderSections(want) {
    var all = sections(), mov = [], i;
    for (i = 0; i < all.length; i++) if (all[i].tagName !== 'HEADER' && all[i].tagName !== 'FOOTER') mov.push(i);
    var P = mov.length ? all[mov[0]].parentElement : null;
    if (!P) return;
    mov = mov.filter(function (n) { return all[n].parentElement === P; });
    var kids = Array.prototype.slice.call(P.children);
    var num = function (a, b) { return a - b; };
    var ok = !!want && want.length === mov.length && want.slice().sort(num).join() === mov.slice().sort(num).join() && want.join() !== mov.join();
    if (!ok) {
      if (P.hasAttribute('data-jeere-order')) {
        P.style.display = P.getAttribute('data-jeere-order'); P.style.flexDirection = '';
        P.removeAttribute('data-jeere-order');
        kids.forEach(function (k) { k.style.order = ''; });
      }
      return;
    }
    if (!P.hasAttribute('data-jeere-order')) P.setAttribute('data-jeere-order', P.style.display || '');
    P.style.display = 'flex'; P.style.flexDirection = 'column';
    var slots = mov.map(function (n) { return kids.indexOf(all[n]); });
    kids.forEach(function (k, idx) { k.style.order = String(idx); });
    want.forEach(function (n, pos) { all[n].style.order = String(slots[pos]); });
  }
  /* Her look for a section (store.site.s[<page>|h|<n>] = { pt, pb, align, bg, line, radius }): the space above and
   * under it, the alignment of its texts, its background, a thin line on top, the corners of its pictures. Written
   * as inline styles over the model's own, which come back as soon as she removes a value. Only safe values pass
   * (numbers within bounds, three alignments, a #hex colour): nothing she types can reach the page as code. */
  function styleSections(all, base) {
    var num = function (v, max) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null; };
    sections().forEach(function (el, n) {
      var o = isObj(all[base + '|h|' + n]) ? all[base + '|h|' + n] : null;
      if (!o && !el.hasAttribute('data-jeere-look')) return;
      if (!el.hasAttribute('data-jeere-look')) el.setAttribute('data-jeere-look', JSON.stringify([el.style.paddingTop, el.style.paddingBottom, el.style.textAlign, el.style.backgroundColor, el.style.borderTop]));
      var was = []; try { was = JSON.parse(el.getAttribute('data-jeere-look')) || []; } catch (e) { was = []; }
      o = o || {};
      var pt = num(o.pt, 400), pb = num(o.pb, 400), rad = num(o.radius, 200);
      el.style.paddingTop = pt === null ? (was[0] || '') : pt + 'px';
      el.style.paddingBottom = pb === null ? (was[1] || '') : pb + 'px';
      el.style.textAlign = o.align === 'left' || o.align === 'center' || o.align === 'right' ? o.align : (was[2] || '');
      el.style.backgroundColor = typeof o.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.bg) ? o.bg : (was[3] || '');
      el.style.borderTop = o.line === true ? '1px solid rgba(17, 17, 17, .14)' : (was[4] || '');
      var imgs = el.querySelectorAll('img'), i;
      for (i = 0; i < imgs.length; i++) {
        if (rad === null) { if (imgs[i].hasAttribute('data-jeere-radius')) { imgs[i].style.borderRadius = imgs[i].getAttribute('data-jeere-radius'); imgs[i].removeAttribute('data-jeere-radius'); } }
        else { if (!imgs[i].hasAttribute('data-jeere-radius')) imgs[i].setAttribute('data-jeere-radius', imgs[i].style.borderRadius || ''); imgs[i].style.borderRadius = rad + 'px'; }
      }
    });
  }
  /* Her look for ONE text (store.site.x[<key>] = { size, color, bold, align, font, hide }), the framing of ONE
   * picture (store.site.f[<key>] = { fit, x, y, hide }) and where ONE link goes (store.site.k[<key>]). Inline
   * styles over the model's own, which come back when she removes a value. Only safe values pass: bounded
   * numbers, a #hex colour, names from short lists, an https / mailto / tel address. */
  var FONTS = { serif: 'Georgia, "Times New Roman", serif', sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', mono: 'ui-monospace, Menlo, Consolas, monospace' };
  function kept(el, attr, props) {
    if (!el.hasAttribute(attr)) el.setAttribute(attr, JSON.stringify(props.map(function (k) { return el.style[k] || ''; })));
    try { return JSON.parse(el.getAttribute(attr)) || []; } catch (e) { return []; }
  }
  function hexColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
  // hidden means gone, in the editor as on the live site (the editor lists what is hidden, to bring it back)
  function hideEl(el, off, opacity, display) { el.style.opacity = opacity; el.style.display = off ? 'none' : display; }
  /* A text often sits in a small row with a mark beside it (a ticked box, a bullet, an icon): hidden, the whole
   * row goes, not the words alone. The row is the closest box that holds nothing else to read and no picture. */
  function rowOf(el) {
    var norm = function (n) { return (n.textContent || '').replace(/\s+/g, ' ').trim(); };
    var t = norm(el), cur = el;
    for (var i = 0; i < 3; i++) {
      var p = cur.parentElement;
      if (!p || p === document.body || /^(SECTION|HEADER|FOOTER|MAIN|NAV|UL|OL|FORM)$/.test(p.tagName)) break;
      if (norm(p) !== t || p.querySelector('img, video, iframe, input, select, textarea')) break;
      cur = p;
      if (p.tagName === 'LI') break;
    }
    return cur;
  }
  function lookText(el, o) {
    if (!isObj(o) && !el.hasAttribute('data-jeere-x')) return;
    var was = kept(el, 'data-jeere-x', ['fontSize', 'color', 'fontWeight', 'textAlign', 'fontFamily', 'opacity', 'display', 'borderRadius', 'background', 'border', 'padding']);
    o = isObj(o) ? o : {};
    var size = typeof o.size === 'number' && isFinite(o.size) && o.size >= 8 && o.size <= 320 ? Math.round(o.size) : null;
    el.style.fontSize = size === null ? was[0] : size + 'px';
    el.style.color = hexColor(o.color) ? o.color : was[1];
    el.style.fontWeight = o.bold === true ? '700' : was[2];
    el.style.textAlign = o.align === 'left' || o.align === 'center' || o.align === 'right' ? o.align : was[3];
    el.style.fontFamily = typeof o.font === 'string' && FONTS.hasOwnProperty(o.font) ? FONTS[o.font] : was[4];
    hideEl(el, o.hide === true, was[5], was[6]);
    var row = rowOf(el);
    if (row !== el) {
      if (o.hide === true) { if (!row.hasAttribute('data-jeere-row')) row.setAttribute('data-jeere-row', row.style.display || ''); row.style.display = 'none'; }
      else if (row.hasAttribute('data-jeere-row')) { row.style.display = row.getAttribute('data-jeere-row'); row.removeAttribute('data-jeere-row'); }
    }
    if (el.tagName === 'A' || el.tagName === 'BUTTON') {
      var bare = false; try { bare = parseFloat(window.getComputedStyle(el).paddingLeft) < 6; } catch (e) { bare = false; }
      var fill = hexColor(o.fill) ? o.fill : '#111111', dark = parseInt(fill.slice(1, 3), 16) * 0.299 + parseInt(fill.slice(3, 5), 16) * 0.587 + parseInt(fill.slice(5, 7), 16) * 0.114 < 150;
      el.style.borderRadius = o.round === true ? '999px' : o.round === false ? '0px' : was[7];
      el.style.background = o.btn === 'fill' ? fill : o.btn === 'outline' ? 'transparent' : was[8];
      el.style.border = o.btn === 'fill' ? '1.5px solid ' + fill : o.btn === 'outline' ? '1.5px solid currentColor' : was[9];
      if (o.btn === 'fill' && !hexColor(o.color)) el.style.color = dark ? '#FFFFFF' : '#111111';
      el.style.padding = (o.btn === 'fill' || o.btn === 'outline') && (bare || el.getAttribute('data-jeere-pad')) ? '12px 22px' : was[10];
      if ((o.btn === 'fill' || o.btn === 'outline') && bare) el.setAttribute('data-jeere-pad', '1');
    }
  }
  // the font chosen for the whole site (store.site.g.font) applies to every text that has none of its own
  function withFont(o, font) {
    if (!font || (isObj(o) && typeof o.font === 'string')) return o;
    var out = { font: font }, k;
    if (isObj(o)) for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }
  function frameImg(el, o) {
    if (!isObj(o) && !el.hasAttribute('data-jeere-f')) return;
    var was = kept(el, 'data-jeere-f', ['objectFit', 'objectPosition', 'opacity', 'display']);
    o = isObj(o) ? o : {};
    var pc = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null; };
    var x = pc(o.x), y = pc(o.y);
    el.style.objectFit = o.fit === 'cover' || o.fit === 'contain' ? o.fit : was[0];
    el.style.objectPosition = x === null && y === null ? was[1] : (x === null ? 50 : x) + '% ' + (y === null ? 50 : y) + '%';
    hideEl(el, o.hide === true, was[2], was[3]);
  }
  // her products' categories (from the fiche shown), to find a product that has no card on this page
  var prodCat = {};
  function shopHref() {
    var a = $$('a[href]').filter(function (x) { var h = x.getAttribute('data-jeere-href') || x.getAttribute('data-jeere-k') || x.getAttribute('href') || ''; return /(^|\/)(boutique|shop|catalogue)\/?(#|$)/.test(h); })[0];
    return a ? (a.getAttribute('data-jeere-href') || a.getAttribute('data-jeere-k') || a.getAttribute('href')).replace(/#.*$/, '') : siteBase() + 'boutique/';
  }
  /** a product of hers: the page of its card on this page; otherwise the shop, on its category (her products listed) */
  function productHref(id) {
    var pa = document.querySelector(attrSel('data-jeere-product', id) + ' a[href]:not([href^="#"])');
    if (pa) return pa.getAttribute('href');
    var c = prodCat[id];
    return shopHref() + (c ? '#' + catSlug(c) : '');
  }
  function siteBase() { var m = /^\/concepts\/[a-z0-9-]+\//.exec(location.pathname); return m ? m[0] : '/'; }
  /* Where a link goes: « page:<path>[#part] » (a page of this site), « p:<id> » (one of her products), or an
   * https / mailto / tel address. Anything else gives '' (the model's own link stays). */
  function resolveLink(to) {
    if (typeof to !== 'string') return '';
    if (/^(https:\/\/[^\s"'<>]{3,500}|mailto:[^\s"'<>]{3,200}|tel:\+?[0-9 ]{4,20})$/.test(to)) return to;
    if (/^page:[a-z0-9\-\/]{0,80}(#[a-z0-9\-]{1,80})?$/.test(to)) return siteBase() + to.slice(5);
    if (/^p:[A-Za-z0-9_\-]{1,64}$/.test(to)) return productHref(to.slice(2));
    return '';
  }
  function linkTo(el, to) {
    if (el.tagName !== 'A') return;
    var href = resolveLink(to);
    if (!href && !el.hasAttribute('data-jeere-k')) return;
    if (!el.hasAttribute('data-jeere-k')) el.setAttribute('data-jeere-k', el.getAttribute('href') || '');
    el.setAttribute('href', href || el.getAttribute('data-jeere-k'));
  }
  /* The sections SHE adds to a page (store.site.a[<page>] = [{ id, type, after, title, body, img, cta, href,
   * items }]): a text, a text beside a picture, a banner, her products, reviews, questions. Drawn here with plain
   * elements (never her text as code), placed after the model's section number `after`, in the model's own
   * fonts. They are not the model's: they take no number, so every text of the model keeps its own. */
  var addedKey = '';
  function mk(tag, style, text) { var e = document.createElement(tag); if (style) e.setAttribute('style', style); if (text !== undefined && text !== null) e.textContent = String(text); return e; }
  function buildAdded(a) {
    var t = str(a.type), title = str(a.title).slice(0, 200), body = str(a.body).slice(0, 1200), img = httpsImg(a.img), items = Array.isArray(a.items) ? a.items.slice(0, 8) : [];
    var sec = mk('section', 'box-sizing:border-box;width:100%;padding:72px 24px');
    var wrap = mk('div', 'box-sizing:border-box;max-width:1080px;margin:0 auto');
    sec.appendChild(wrap);
    var h = function (center) { return title ? mk('h2', 'margin:0 0 16px;' + (center ? 'text-align:center' : ''), title) : null; };
    var put = function (parent, node) { if (node) parent.appendChild(node); };
    if (t === 'text') {
      wrap.style.maxWidth = '720px'; wrap.style.textAlign = 'center';
      put(wrap, h(true)); if (body) wrap.appendChild(mk('p', 'margin:0;white-space:pre-line;line-height:1.6', body));
    } else if (t === 'image') {
      var grid = mk('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:40px;align-items:center');
      var pic = mk('div', 'aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:rgba(17,17,17,.06)');
      if (img) { var im = mk('img', 'display:block;width:100%;height:100%;object-fit:cover'); im.src = img; im.alt = ''; pic.appendChild(im); }
      var side = mk('div', ''); put(side, h(false)); if (body) side.appendChild(mk('p', 'margin:0;white-space:pre-line;line-height:1.6', body));
      grid.appendChild(pic); grid.appendChild(side); wrap.appendChild(grid);
    } else if (t === 'banner') {
      var box = mk('div', 'position:relative;display:grid;place-items:center;min-height:380px;padding:48px 24px;box-sizing:border-box;border-radius:18px;overflow:hidden;background:#111111;color:#FFFFFF;text-align:center');
      if (img) { var bg = mk('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.72'); bg.src = img; bg.alt = ''; box.appendChild(bg); }
      var on = mk('div', 'position:relative;max-width:640px');
      if (title) on.appendChild(mk('h2', 'margin:0 0 12px;color:#FFFFFF', title));
      if (body) on.appendChild(mk('p', 'margin:0 0 20px;white-space:pre-line;line-height:1.6;color:#FFFFFF', body));
      if (str(a.cta)) { var b = mk('a', 'display:inline-block;padding:12px 24px;border-radius:999px;background:#FFFFFF;color:#111111;text-decoration:none;font-weight:600', str(a.cta).slice(0, 60)); b.setAttribute('href', resolveLink(a.href) || '#'); on.appendChild(b); }
      box.appendChild(on); wrap.appendChild(box);
    } else if (t === 'products') {
      put(wrap, h(false));
      var pg = mk('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px');
      list().slice(0, 8).forEach(function (p) {
        if (!p) return;
        var c = mk('div', ''), ph = mk('div', 'aspect-ratio:1;border-radius:12px;overflow:hidden;background:rgba(17,17,17,.06);margin-bottom:10px');
        var src = httpsImg(p.image); if (src) { var pi = mk('img', 'display:block;width:100%;height:100%;object-fit:cover'); pi.src = src; pi.alt = ''; pi.loading = 'lazy'; ph.appendChild(pi); }
        c.appendChild(ph); c.appendChild(mk('div', 'font-weight:600;line-height:1.3', p.name)); c.appendChild(mk('div', 'opacity:.7;margin-top:2px', fmt(p.price)));
        if (str(p.id)) {   // her buyer orders it in one tap: into the cart, then the checkout
          var go = mk('button', 'margin-top:10px;padding:9px 18px;border:0;border-radius:999px;background:#111111;color:#FFFFFF;cursor:pointer;font:inherit;font-weight:600', 'Commander');
          go.type = 'button'; go.setAttribute('data-jeere-add', str(p.id)); go.setAttribute('data-jeere-go', '');
          c.appendChild(go);
        }
        pg.appendChild(c);
      });
      wrap.appendChild(pg);
    } else if (t === 'reviews') {
      put(wrap, h(true));
      var rg = mk('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px');
      items.forEach(function (it) {
        if (!isObj(it) || !str(it.b)) return;
        var card = mk('blockquote', 'margin:0;padding:22px;border-radius:14px;border:1px solid rgba(17,17,17,.12);box-sizing:border-box');
        card.appendChild(mk('p', 'margin:0 0 12px;white-space:pre-line;line-height:1.55', str(it.b).slice(0, 400)));
        if (str(it.a)) card.appendChild(mk('b', '', str(it.a).slice(0, 60)));
        rg.appendChild(card);
      });
      wrap.appendChild(rg);
    } else if (t === 'faq') {
      wrap.style.maxWidth = '760px'; put(wrap, h(false));
      items.forEach(function (it) {
        if (!isObj(it) || !str(it.a)) return;
        var d = mk('details', 'padding:16px 0;border-top:1px solid rgba(17,17,17,.14)');
        d.appendChild(mk('summary', 'cursor:pointer;font-weight:600', str(it.a).slice(0, 160)));
        d.appendChild(mk('p', 'margin:10px 0 0;white-space:pre-line;line-height:1.6', str(it.b).slice(0, 800)));
        wrap.appendChild(d);
      });
    } else return null;
    return sec;
  }
  function drawAdded(listA, fiche) {
    var key = JSON.stringify(listA || null) + '|' + JSON.stringify(Array.isArray(fiche.products) ? fiche.products : null) + '|' + cur;
    if (key === addedKey) return;
    addedKey = key;
    var keepSel = selEl && selEl.getAttribute ? selEl.getAttribute('data-jeere-added') : null;
    $$('[data-jeere-added]').forEach(function (n) { n.parentNode.removeChild(n); });
    if (!Array.isArray(listA)) return;
    var all = sections(), tail = {};
    var lastBody = null; all.forEach(function (el) { if (el.tagName !== 'FOOTER') lastBody = el; });
    listA.slice(0, 12).forEach(function (a) {
      if (!isObj(a) || !/^[a-z0-9]{4,16}$/.test(str(a.id))) return;
      var n = typeof a.after === 'number' && all[a.after] && all[a.after].tagName !== 'FOOTER' ? a.after : -1;
      var anchor = tail[n] || (n >= 0 ? all[n] : lastBody);
      var node = null; try { node = buildAdded(a); } catch (e) { node = null; }
      if (!anchor || !anchor.parentNode || !node) return;
      node.setAttribute('data-jeere-added', a.id);
      anchor.parentNode.insertBefore(node, anchor.nextSibling);
      tail[n] = node;
      if (keepSel === a.id) selEl = node;
    });
  }
  /* What she is working on stays framed in blue, with four small handles, until she picks something else. The
   * frame is drawn over the page (it takes no room and catches no touch) and follows the page as it changes. */
  var selEl = null, selBox = null;
  function opaque(n) {
    var cs; try { cs = window.getComputedStyle(n); } catch (e) { return false; }
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || ''); if (!m) return false;
    var p = m[1].split(','); return p.length < 4 || parseFloat(p[3]) > 0.5;
  }
  function drawSel() {
    if (!selBox) return;
    if (!selEl || !document.documentElement.contains(selEl)) { selBox.style.display = 'none'; return; }
    var r0 = selEl.getBoundingClientRect(), r = { left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom };
    // what one SEES of it: a picture bigger than the box that crops it is framed where it is cropped
    for (var par = selEl.parentElement; par && par !== document.body && par !== document.documentElement; par = par.parentElement) {
      var ov = ''; try { ov = window.getComputedStyle(par).overflow; } catch (e) { ov = ''; }
      if (ov && ov !== 'visible') { var q = par.getBoundingClientRect(); r.left = Math.max(r.left, q.left); r.right = Math.min(r.right, q.right); r.top = Math.max(r.top, q.top); r.bottom = Math.min(r.bottom, q.bottom); }
    }
    // a header fixed on top of the page covers what passes under it: the frame stops below it
    $$('header, nav, .nav, .topbar').forEach(function (h) {
      if (h.contains(selEl) || selEl.contains(h)) return;
      var pos = ''; try { pos = window.getComputedStyle(h).position; } catch (e) { pos = ''; }
      if (pos !== 'fixed' && pos !== 'sticky') return;
      if (!opaque(h) && !(h.firstElementChild && opaque(h.firstElementChild))) return;   // a see-through header hides nothing
      var hb = h.getBoundingClientRect();
      if (hb.top <= 1 && hb.bottom > r.top && hb.bottom < r.bottom) r.top = hb.bottom;
    });
    // the screen itself: what has been scrolled away is not framed
    r.top = Math.max(r.top, 0); r.bottom = Math.min(r.bottom, window.innerHeight || document.documentElement.clientHeight);
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    var whole = Math.max(1, r0.width * r0.height);
    // mostly out of view (a card scrolled away in a carousel): no frame left alone on the edge
    if (r.width <= 0 || r.height <= 0 || (r.width * r.height) / whole < 0.35) { selBox.style.display = 'none'; return; }
    selBox.style.display = 'block';
    // the frame follows the element exactly (its own rounded corners too) and never leaves the page on the sides
    var full = document.documentElement.clientWidth || window.innerWidth;
    var left = Math.max(1, r.left), right = Math.min(full - 1, r.right);
    selBox.style.left = Math.round(left + window.pageXOffset) + 'px';
    selBox.style.top = Math.round(r.top + window.pageYOffset) + 'px';
    selBox.style.width = Math.max(0, Math.round(right - left)) + 'px';
    selBox.style.height = Math.round(r.height) + 'px';
    var rad = ''; try { rad = window.getComputedStyle(selEl).borderRadius; } catch (e) { rad = ''; }
    selBox.style.borderRadius = rad && rad !== '0px' ? rad : '3px';
  }
  function select(el) {
    selEl = el || null;
    if (!selBox) {
      selBox = document.createElement('div');
      selBox.setAttribute('data-jeere-sel', '');
      selBox.setAttribute('style', 'position:absolute;z-index:2147480000;box-sizing:border-box;border:1.5px solid #3657FF;border-radius:4px;pointer-events:none;display:none');
      [['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']].forEach(function (c) {
        var h = document.createElement('i');
        h.setAttribute('style', 'position:absolute;width:6px;height:6px;box-sizing:border-box;border:1.5px solid #3657FF;border-radius:2px;background:#fff;' + c[0] + ':-3.5px;' + c[1] + ':-3.5px');
        selBox.appendChild(h);
      });
      document.body.appendChild(selBox);
      window.addEventListener('resize', drawSel);
      var queued = 0;
      document.addEventListener('scroll', function () { if (!queued) queued = requestAnimationFrame(function () { queued = 0; drawSel(); }); }, true);
      window.addEventListener('load', drawSel);
      setInterval(drawSel, 400);      // pictures that arrive, a section that opens: the frame stays on its element
    }
    drawSel();
  }
  /* The 33 fonts she may give her whole site in Branding (store.site.b.headFont / textFont), the same list as the
   * dashboard's (app-react/src/lib/fonts.ts): [Google Fonts name, fallback kind, weights, reads well in paragraphs].
   * Only these ids are used: nothing she saves can reach the page as a font address or as CSS. */
  var FONT_CAT = {'playfair':['Playfair','serif','400;500;600;700;800;900',0],'cormorant-garamond':['Cormorant Garamond','serif','300;400;500;600;700',0],'eb-garamond':['EB Garamond','serif','400;500;600;700;800',0],'bodoni-moda':['Bodoni Moda','serif','400;500;600;700;800;900',0],'dm-serif-display':['DM Serif Display','serif','400',0],'libre-baskerville':['Libre Baskerville','serif','400;500;600;700',1],'lora':['Lora','serif','400;500;600;700',1],'fraunces':['Fraunces','serif','300;400;500;600;700;800;900',1],'marcellus':['Marcellus','serif','400',0],'inter':['Inter','sans-serif','300;400;500;600;700;800;900',1],'montserrat':['Montserrat','sans-serif','300;400;500;600;700;800;900',1],'poppins':['Poppins','sans-serif','300;400;500;600;700;800;900',1],'dm-sans':['DM Sans','sans-serif','300;400;500;600;700;800;900',1],'manrope':['Manrope','sans-serif','300;400;500;600;700;800',1],'space-grotesk':['Space Grotesk','sans-serif','300;400;500;600;700',1],'fira-sans':['Fira Sans','sans-serif','300;400;500;600;700;800;900',1],'onest':['Onest','sans-serif','300;400;500;600;700;800;900',1],'nunito':['Nunito','sans-serif','300;400;500;600;700;800;900',1],'quicksand':['Quicksand','sans-serif','300;400;500;600;700',1],'comfortaa':['Comfortaa','sans-serif','300;400;500;600;700',0],'baloo-2':['Baloo 2','sans-serif','400;500;600;700;800',0],'fredoka':['Fredoka','sans-serif','300;400;500;600;700',0],'unbounded':['Unbounded','sans-serif','300;400;500;600;700;800;900',0],'anton':['Anton','sans-serif','400',0],'bebas-neue':['Bebas Neue','sans-serif','400',0],'archivo-black':['Archivo Black','sans-serif','400',0],'oswald':['Oswald','sans-serif','300;400;500;600;700',0],'bricolage-grotesque':['Bricolage Grotesque','sans-serif','300;400;500;600;700;800',1],'pacifico':['Pacifico','cursive','400',0],'dancing-script':['Dancing Script','cursive','400;500;600;700',0],'caveat':['Caveat','cursive','400;500;600;700',0],'great-vibes':['Great Vibes','cursive','400',0],'amatic-sc':['Amatic SC','cursive','400;700',0]};
  /* Four fonts: titles (h1, h2, her name), sub-titles (h3–h6 and the small words over a title), the texts of the
   * interface (menu, links, buttons, fields) and the paragraphs (only fonts that read well at 15 px). */
  function brandFonts(b) {
    var pickF = function (k, para) { var id = isObj(b) && typeof b[k] === 'string' && FONT_CAT.hasOwnProperty(b[k]) ? b[k] : ''; return id && (!para || FONT_CAT[id][3]) ? FONT_CAT[id] : null; };
    var head = pickF('headFont'), sub = pickF('subFont'), text = pickF('textFont'), para = pickF('paraFont', true);
    var link = document.getElementById('jeere-brand-fonts');
    var fams = [head, sub, text, para].filter(Boolean).filter(function (f, i, l) { return l.indexOf(f) === i; });
    if (!fams.length) { if (link) link.parentNode.removeChild(link); return ''; }
    var url = 'https://fonts.googleapis.com/css2?' + fams.map(function (f) { return 'family=' + f[0].replace(/ /g, '+') + ':wght@' + f[2]; }).join('&') + '&display=swap';
    if (!link) { link = document.createElement('link'); link.id = 'jeere-brand-fonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
    var stack = function (f) { return "'" + f[0] + "', " + f[1]; };
    var css = '';
    // the most general first, the titles last (a title's own words keep the title's font); a name drawn in the
    // model's ornamental letters (.logo__mark) keeps its own
    if (para) css += 'body,p,li,dd,dt,blockquote,figcaption,td,th,small{font-family:' + stack(para) + '!important}';
    if (text) css += 'a,button,input,select,textarea,label,nav,nav *,.btn,.pill,.button,[class*="btn--"]{font-family:' + stack(text) + '!important}';
    if (sub) css += 'h3,h4,h5,h6,h3 *,h4 *,h5 *,h6 *,[class*="eyebrow"],[class*="kicker"],[class*="overline"],[class*="surtitle"]{font-family:' + stack(sub) + '!important}';
    if (head) css += 'h1,h2,h1 *,h2 *,a.logo:not(:has(.logo__mark)),.brand{font-family:' + stack(head) + '!important}';
    return css;
  }
  function applyBrand(b) {
    var st = document.getElementById('jeere-brand');
    if (!isObj(b) || !Object.keys(b).length) { if (st) st.parentNode.removeChild(st); brandFonts(null); return; }
    if (!st) { st = document.createElement('style'); st.id = 'jeere-brand'; document.head.appendChild(st); }
    var c = function (v) { return hexColor(v) ? v : ''; }, css = '';
    var BTN = '.btn,.pill,.button,[class*="btn--"],[data-jeere-add],[data-jeere-checkout],[data-jeere-book],button[type="submit"]';
    if (c(b.bg)) css += 'html,body{background:' + b.bg + '!important}';
    if (c(b.text)) css += 'body,h1,h2,h3,h4,h5,h6{color:' + b.text + '!important}';
    if (c(b.muted)) css += 'p,small,figcaption,li,dd{color:' + b.muted + '!important}';
    if (c(b.accent)) css += 'a:not(' + BTN + '){color:' + b.accent + '!important}::selection{background:' + b.accent + ';color:#fff}';
    var rad = b.shape === 'square' ? '0px' : b.shape === 'round' ? '10px' : b.shape === 'pill' ? '9999px' : '';
    var rule = '';
    if (rad) rule += 'border-radius:' + rad + '!important;';
    if (b.btnStyle === 'outline') rule += 'background:transparent!important;border:1.5px solid ' + (c(b.btnBg) || 'currentColor') + '!important;color:' + (c(b.btnBg) || 'inherit') + '!important;';
    else { if (c(b.btnBg)) rule += 'background:' + b.btnBg + '!important;border-color:' + b.btnBg + '!important;'; if (c(b.btnText)) rule += 'color:' + b.btnText + '!important;'; }
    if (rule) css += BTN.split(',').map(function (x) { return x + ':not([data-jeere-x])'; }).join(',') + '{' + rule + '}';
    var lh = typeof b.logoH === 'number' && b.logoH >= 16 && b.logoH <= 120 ? Math.round(b.logoH) : 0;
    if (lh) css += '.logo__mark img,.brand img,a.logo img{height:' + lh + 'px!important}';
    try { css += brandFonts(b); } catch (e) { /* the model's own fonts stay */ }
    st.textContent = css;
  }
  function applySite(fiche) {
    prodCat = {};
    (Array.isArray(fiche.products) ? fiche.products : []).forEach(function (p) { if (isObj(p) && typeof p.id === 'string' && typeof p.category === 'string' && p.category.trim()) prodCat[p.id] = p.category.trim(); });
    var site = isObj(fiche.store) && isObj(fiche.store.site) ? fiche.store.site : {};
    var t = isObj(site.t) ? site.t : {}, im = isObj(site.i) ? site.i : {}, cc = isObj(site.c) ? site.c : {}, ll = isObj(site.l) ? site.l : {};
    try { applyBrand(site.b); } catch (e) { /* the model's own look stays */ }
    var xx = isObj(site.x) ? site.x : {}, ff = isObj(site.f) ? site.f : {}, kk = isObj(site.k) ? site.k : {};
    var gfont = isObj(site.g) && typeof site.g.font === 'string' && FONTS.hasOwnProperty(site.g.font) ? site.g.font : '';
    try { drawAdded(isObj(site.a) ? site.a[pagePath()] : null, fiche); } catch (e) { /* the page keeps the model's sections */ }
    try { applyCats(fiche); } catch (e) { /* the model's filters stay */ }
    try { applyLogo(fiche); } catch (e) { /* the model's name stays */ }
    // the sections she hides (in the editor they stay, greyed, so she can bring them back)
    var hh = isObj(site.h) ? site.h : {}, base0 = pagePath();
    try { orderSections(isObj(site.o) && Array.isArray(site.o[base0]) ? site.o[base0] : null); } catch (e) { /* the model's own order stays */ }
    try { styleSections(isObj(site.s) ? site.s : {}, base0); } catch (e) { /* the model's own look stays */ }
    try { keyed(); applyBands(isObj(site.m) ? site.m : {}, base0); } catch (e) { /* the model's own band stays */ }
    sections().forEach(function (el, n) {
      var off = secHidden(hh[base0 + '|h|' + n], el);
      el.style.opacity = ''; el.style.display = off ? 'none' : '';
    });
    keyed().forEach(function (x) {
      if (x.kind === 'p' || x.kind === 's' || x.kind === 'm') return;
      if (x.kind === 'c') {
        if (!original[x.key]) original[x.key] = x.el.innerHTML;
        if (typeof cc[x.key] === 'string') x.el.textContent = cc[x.key]; else if (preview) x.el.innerHTML = original[x.key];
        try { lookText(x.el, withFont(xx[x.key], gfont)); } catch (e) { /* the model's own look stays */ }
        return;
      }
      if (x.own) { setOwn(x.el, typeof t[x.key] === 'string' ? t[x.key] : null); try { lookText(x.el, withFont(xx[x.key], gfont)); linkTo(x.el, kk[x.key]); } catch (e) { /* the model's own look stays */ } return; }
      if (!original[x.key]) original[x.key] = x.kind === 't' ? x.el.innerHTML : { src: x.el.getAttribute('src'), srcset: x.el.getAttribute('srcset') };
      if (x.kind === 't') {
        if (typeof t[x.key] === 'string') x.el.textContent = t[x.key];
        else if (preview) x.el.innerHTML = original[x.key];
        try { lookText(x.el, withFont(xx[x.key], gfont)); linkTo(x.el, kk[x.key]); } catch (e) { /* the model's own look stays */ }
      } else {
        var lk = photoLink(x.el), to = typeof ll[x.key.replace('|i|', '|l|')] === 'string' ? ll[x.key.replace('|i|', '|l|')] : '';
        if (lk) {
          if (!lk.hasAttribute('data-jeere-href')) lk.setAttribute('data-jeere-href', lk.getAttribute('href'));
          var was = lk.getAttribute('data-jeere-href'), href = was;
          if (to.indexOf('c:') === 0) href = was.replace(/#.*$/, '') + '#' + catSlug(to.slice(2));
          else if (to.indexOf('p:') === 0) href = productHref(to.slice(2));
          lk.setAttribute('href', href);
        }
        var v = typeof im[x.key] === 'string' ? im[x.key] : '';
        var inCard = x.el.hasAttribute('data-jeere-photo') && x.el.closest && x.el.closest('[data-jeere-product]');
        if (v) { x.el.removeAttribute('srcset'); x.el.src = v; x.el.removeAttribute('data-jeere-plain'); }
        else if (!inCard && plainOn() && plainable(x.el)) setPlain(x.el);
        // a product's photo comes from her product (render): the model's own picture is not put back over it
        else if (preview && original[x.key].src && !(x.el.hasAttribute('data-jeere-photo') && x.el.closest && x.el.closest('[data-jeere-product]'))) { x.el.src = original[x.key].src; if (original[x.key].srcset) x.el.setAttribute('srcset', original[x.key].srcset); }
        try { frameImg(x.el, ff[x.key]); } catch (e) { /* the model's own framing stays */ }
      }
    });
  }
  function payNote() {
    var first = document.querySelector('label.paiement, [data-pay]');
    if (!editing || !first || document.querySelector('[data-jeere-note]')) return;
    var box = mk('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:12px 14px;border-radius:12px;background:#FFFFFF;box-shadow:0 0 0 1px rgba(17,17,17,.12);color:#555;font:400 13px/1.4 Poppins,system-ui,sans-serif;text-align:left;letter-spacing:0;text-transform:none');
    box.setAttribute('data-jeere-note', '');
    box.appendChild(mk('span', '', 'Ces modes de paiement viennent de vos réglages : ils se changent dans Paiements, pas ici.'));
    var go = mk('button', 'flex:none;height:32px;padding:0 12px;border:0;border-radius:8px;background:#111;color:#fff;font:500 12px/1 Poppins,system-ui,sans-serif;cursor:pointer', 'Paiements');
    go.type = 'button';
    go.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); try { window.parent.postMessage({ jeereGo: 'paiements' }, parentOrigin || '*'); } catch (err) { /* not in the editor */ } }, true);
    box.appendChild(go);
    first.parentNode.insertBefore(box, first);
  }
  function markAll() { keyed().forEach(function (x) { x.el.setAttribute('data-jeere-pickable', x.kind); }); }
  function pickOn() {
    drawSel();
    if (editing) return;
    editing = true;
    var st = document.createElement('style');
    st.textContent = '[data-jeere-pickable]{cursor:pointer!important}.jeere-hl{outline:1.5px solid #3657FF!important;outline-offset:-1.5px!important}';
    document.head.appendChild(st);
    var mark = markAll;
    mark();
    // what is under the pointer, even under a decorative layer (a gradient, a title over a photo)
    var under = function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-jeere-pickable]') : null;
      var card = el && el.tagName === 'IMG' && el.closest ? el.closest('[data-jeere-product]') : null;
      if (card && card.hasAttribute('data-jeere-pickable')) return card;
      if (!el && e.target && e.target.closest) { card = e.target.closest('[data-jeere-product]'); if (card && card.hasAttribute('data-jeere-pickable')) return card; }
      if (el) return el;
      var all = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      for (var i = 0; i < all.length; i++) { var c = all[i].closest ? all[i].closest('[data-jeere-pickable]') : null; if (c) return c; }
      return null;
    };
    var hl = null;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;          // a finger does not hover: only what is chosen is framed
      var el = under(e);
      if (el === hl) return;
      if (hl) hl.classList.remove('jeere-hl');
      hl = el; if (hl) hl.classList.add('jeere-hl');
    }, true);
    document.addEventListener('click', function (e) {
      var mine = e.target && e.target.closest ? e.target.closest('[data-jeere-added]') : null;
      if (mine) {
        e.preventDefault(); e.stopPropagation(); select(mine);
        try { window.parent.postMessage({ jeereAdded: mine.getAttribute('data-jeere-added') }, parentOrigin || '*'); } catch (err) { /* not in the editor */ }
        return;
      }
      var el = under(e);
      if (!el) {
        var a = e.target && e.target.closest ? e.target.closest('a') : null; if (a) e.preventDefault();
        select(null);
        try { window.parent.postMessage({ jeereNone: true }, parentOrigin || '*'); } catch (err) { /* not in the editor */ }
        return;
      }
      e.preventDefault(); e.stopPropagation();
      var x = keyed().filter(function (k) { return k.el === el; })[0];
      if (!x) return;
      select(x.el);
      var big = x.el.getBoundingClientRect();
      try {
        window.parent.postMessage({ jeerePick: { key: x.key, kind: x.kind, ref: x.ref || '', sec: secOf(x.el, sections()), value: x.kind === 'i' ? (x.el.currentSrc || x.el.src) : x.own ? ownWords(x.el) : plain(x.el.textContent || '').trim(),
          tag: x.el.tagName.toLowerCase(), long: x.kind === 't' && ((x.el.textContent || '').length > 70 || big.height > 60) } }, parentOrigin || '*');
      } catch (err) { /* not in the editor */ }
    }, true);
  }

  var resolveReady;
  var ready = new Promise(function (res) { resolveReady = res; });

  function list() {
    if (S.products) return Object.keys(S.products).map(function (id) { return product(id); });
    return $$('[data-jeere-product]').map(function (c) { return fromPage(c.getAttribute('data-jeere-product')); }).filter(Boolean);
  }

  function init() {
    // Shown inside Jehre (the model viewer, the editor): the demo band « Boutique de démonstration » is not shown.
    // The page keeps it for whoever reads its source and its legal page; a direct visit is sent to Jehre anyway.
    if (window.top !== window.self) {
      try { var hide = document.createElement('style'); hide.textContent = '.concept,.concept-bar,.avis__note-exemple{display:none!important}'; document.head.appendChild(hide); } catch (e) { /* the band stays */ }
      try { var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), tn; while ((tn = tw.nextNode())) if (/[Bb]outique de démonstration par/.test(tn.nodeValue)) tn.nodeValue = tn.nodeValue.replace(/[Bb]outique de démonstration par/g, 'Modèle par'); } catch (e) { /* the words stay */ }
    }
    loadCart();
    document.addEventListener('click', onClick);
    // Another tab of the same site changed the cart
    window.addEventListener('storage', function (e) { if (e.key === KEY) { loadCart(); prune(); render(); emit('jeere:cart', cartDetail()); } });
    render();
    // Inside the Jehre editor (« éditeur simple »): the site is its preview. The editor sends the fiche being
    // edited, not yet published; it replaces the published one on this page only, for her alone.
    if (window.parent !== window) {
      window.addEventListener('message', function (e) {
        if (!/^https:\/\/(jehre\.com|jeere\.kreeative\.xyz|jehre-app\.vercel\.app)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return;
        // the panel asks to show one: scrolled into view, outlined a moment
        if (isObj(e.data) && typeof e.data.jeereSection === 'number') {
          var se = sections()[e.data.jeereSection];
          if (se) { try { se.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (er) { se.scrollIntoView(); } se.classList.add('jeere-hl'); setTimeout(function () { se.classList.remove('jeere-hl'); }, 1400); }
          return;
        }
        if (isObj(e.data) && typeof e.data.jeereSelect === 'string') {
          var want = e.data.jeereSelect, hit = null;
          if (want) {
            var one = keyed().filter(function (k) { return k.key === want; })[0];
            if (one) hit = one.el;
            else if (want.indexOf('a:') === 0) hit = document.querySelector(attrSel('data-jeere-added', want.slice(2)));
            else { var base1 = pagePath(); sections().forEach(function (el, n) { if (base1 + '|h|' + n === want) hit = el; }); }
          }
          if (hit && hit !== selEl && e.data.show) { try { hit.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (er) { hit.scrollIntoView(); } }
          select(hit);
          return;
        }
        if (isObj(e.data) && typeof e.data.jeereFocus === 'string') {
          var f = keyed().filter(function (k) { return k.key === e.data.jeereFocus; })[0];
          if (f) { try { f.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (er) { f.el.scrollIntoView(); } f.el.classList.add('jeere-hl'); setTimeout(function () { f.el.classList.remove('jeere-hl'); }, 1600); }
          return;
        }
        if (!isObj(e.data) || e.data.jeerePreview !== slug || !isObj(e.data.fiche)) return;
        preview = true;
        if (typeof e.data.store === 'string' && /^[a-z0-9-]{2,40}$/.test(e.data.store)) viewing = e.data.store;
        parentOrigin = e.origin;
        inEditor = true;
        try { S.products = readFiche(e.data.fiche); S.status = 'ready'; remapSlots(e.data.fiche); drawSocial(e.data.fiche); if (prune()) saveCart(); bind(); render(); } catch (err) { /* the page keeps what it had */ }
        try { brand(e.data.fiche); applySite(e.data.fiche); if (e.data.edit) pickOn(); sendMap(); drawSel(); } catch (err) { /* the page keeps what it had */ }
        emit('jeere:update', { status: S.status, products: list() });
      });
      try { window.parent.postMessage({ jeereConnect: 'ready', store: slug }, '*'); } catch (e) { /* not framed by the editor */ }
    }
    fetchStore().then(function (r) {
      if (preview) r = { ok: false, code: S.status }; // the editor's fiche stays
      // « En direct » in her dashboard: one signal per page opened, never from the editor's preview (/api/visit)
      if (r.ok && window.parent === window) {
        try {
          var vu = STORE_ORIGIN + '/api/visit', vd = JSON.stringify({ slug: slug, path: location.pathname });
          var ping = function () { if (!(navigator.sendBeacon && navigator.sendBeacon(vu, vd))) fetch(vu, { method: 'POST', body: vd, keepalive: true, mode: 'no-cors' }).catch(function () {}); };
          ping();
          setInterval(function () { if (!document.hidden) { try { ping(); } catch (e) { /* next minute */ } } }, 60000);
        } catch (e) { /* a visit that is not counted never breaks the site */ }
      }
      if (r.ok) {
        try { S.products = readFiche(r.fiche); S.status = 'ready'; remapSlots(r.fiche); } catch (e) { S.products = null; S.status = 'offline'; }
        try { drawSocial(r.fiche); } catch (e) { /* the page keeps its own */ }
        try { shopExtras(r.fiche); } catch (e) { /* the page keeps its own */ }
        try { brand(r.fiche); } catch (e) { /* the model's name stays */ }
        try { applySite(r.fiche); } catch (e) { /* the page keeps its own */ }
      } else S.status = r.code;
      try {
        if (prune()) saveCart();
        bind();
        render();
      } catch (e) { /* the page keeps what it had */ }
      var info = { status: S.status, products: list() };
      emit('jeere:ready', info);
      emit('jeere:cart', cartDetail());
      resolveReady(info);
    });
  }

  api = window.JeereConnect = {
    version: '1',
    store: slug,
    ready: ready,
    formatPrice: null,
    status: function () { return S.status; },
    products: list,
    product: function (id) { var p = product(String(id || '')); return p ? { id: p.id, name: p.name, price: p.price, description: p.description, image: p.image, available: sellable(p.id) } : null; },
    cart: cartDetail,
    add: add,
    set: set,
    clear: function () { S.cart = {}; changed(); },
    checkoutUrl: checkoutUrl,
    refresh: function () { try { bind(); render(); } catch (e) { /* never break the site */ } }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
