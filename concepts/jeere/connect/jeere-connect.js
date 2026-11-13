/*
 * Jeere Connect — jeere-connect.js: a custom-designed site sells with a Jeere store (classic script, no library).
 *
 *   <script src="https://jeere.kreeative.xyz/connect/jeere-connect.js" data-store="<slug>" defer></script>
 *
 * The site keeps its own design. This script reads the store's PUBLISHED fiche from Supabase (REST, the
 * publishable key: row level security only shows published rows, never the owner), puts the store's names,
 * prices, descriptions and photos into the site's own markup, keeps a cart in localStorage (one per store)
 * and sends the buyer to the store's Jeere cart: https://jeere.kreeative.xyz/b/<slug>/panier?panier=p1:2,p3:1
 * (b/b.js fills the cart from that parameter; the order then leaves on WhatsApp, as on any Jeere store).
 * If Supabase cannot be reached or the store is not published, the page keeps its hard-coded content and
 * its cart still works (prices read from the page); nothing here ever throws into the site.
 *
 * Markup (any element, any classes; ids are the fiche's product ids: p1, p2… as in the Jeere editor):
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
 *   [data-jeere-social]  filled with the seller's networks (Instagram, TikTok, Facebook, set in Jeere > Parametres >
 *                        Boutique): one round icon link each, in the site's own colour; hidden when she has none
 *   [data-jeere-checkout]  goes to the Jeere cart (same tab); disabled (aria-disabled on a link) when empty
 * Script attributes: data-store (required), data-default-cart="p1:1,p2:1" (the cart of a first visit only).
 *
 * Events on document: 'jeere:ready' { status, products } once the fiche is read (or not: status 'offline' |
 * 'notfound'), 'jeere:cart' { store, lines, count, total, url } after every change (and on ready).
 * window.JeereConnect = { ready: Promise, status(), products(), product(id), cart(), add(id, q), set(id, q),
 *   clear(), checkoutUrl(), refresh(), formatPrice: null }   (a site may set formatPrice(n) to its own format)
 */
(function () {
  'use strict';

  if (window.JeereConnect && window.JeereConnect.version) return; // the script twice on one page

  var SB_URL = 'https://aezchxfvzfoqlvzchqyk.supabase.co';
  var SB_KEY = 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
  var STORE_ORIGIN = 'https://jeere.kreeative.xyz';
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
  function httpsImg(v) { return typeof v === 'string' && v.length < 600 && /^https:\/\/[^\s"'<>\\]+$/i.test(v) ? v : ''; }
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
        description: str(p.description).trim(), image: httpsImg(p.image), available: !off
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

  // Names, prices, descriptions, photos and states from the fiche (once it is read)
  function bind() {
    if (!S.products) return;
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
  // Her networks (fiche.store.social: handles, cleaned by the Jeere app), in every [data-jeere-social]
  var SOCIAL = {
    instagram: { label: 'Instagram', re: /^[A-Za-z0-9._]{1,30}$/, url: function (h) { return 'https://www.instagram.com/' + h + '/'; },
      svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>' },
    tiktok: { label: 'TikTok', re: /^[A-Za-z0-9._]{2,24}$/, url: function (h) { return 'https://www.tiktok.com/@' + h; },
      svg: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.6 2.2 4.4 5 4.6"/>' },
    facebook: { label: 'Facebook', re: /^[A-Za-z0-9.\-]{2,80}$/, url: function (h) { return 'https://www.facebook.com/' + h; },
      svg: '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.6V4.3a21 21 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.2H8.6v3h2.7V21"/>' }
  };
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
    if (el.hasAttribute('data-jeere-add')) { id = idOf(el, 'data-jeere-add'); if (id) { e.preventDefault(); add(id, 1); } return; }
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

  var resolveReady;
  var ready = new Promise(function (res) { resolveReady = res; });

  function list() {
    if (S.products) return Object.keys(S.products).map(function (id) { return product(id); });
    return $$('[data-jeere-product]').map(function (c) { return fromPage(c.getAttribute('data-jeere-product')); }).filter(Boolean);
  }

  function init() {
    loadCart();
    document.addEventListener('click', onClick);
    // Another tab of the same site changed the cart
    window.addEventListener('storage', function (e) { if (e.key === KEY) { loadCart(); prune(); render(); emit('jeere:cart', cartDetail()); } });
    render();
    fetchStore().then(function (r) {
      if (r.ok) {
        try { S.products = readFiche(r.fiche); S.status = 'ready'; } catch (e) { S.products = null; S.status = 'offline'; }
        try { drawSocial(r.fiche); } catch (e) { /* the page keeps its own */ }
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
