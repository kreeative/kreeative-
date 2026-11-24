/*
 * Jehre — api/store.js: a published store's page, with its own <head> and its HTML already in it
 * (Vercel serverless function, Node.js, no dependency). Wave 2 of the Studio audit, item 2.
 *
 * Why: WhatsApp, Facebook, X and most link previews do not run JavaScript. The static page b/index.html
 * only carries Jehre's generic card, so a shared store link showed « Boutique en ligne · Jehre ». This
 * function serves the SAME page (b/index.html, read from the deployment) with, filled in on the server:
 *   - <title>, description, og:title / og:description / og:image / og:url, twitter:*, canonical, robots
 *     (JeereRender.storeMeta: the Studio's référencement first, then the store's name and tagline),
 *   - JSON-LD (Store; Product on a product page),
 *   - the store drawn by creer/render.js (phone layout), inside <main>, for readers without JavaScript,
 *   - the store row inline (<script type="application/json" id="jb-data">), so b.js shows it at once
 *     without a second request, then redraws it at the screen's width (the human page is unchanged).
 * Anything that fails (Supabase unreachable, a fiche that does not render) gives the static page as it
 * is: b.js then loads the store itself, as before.
 *
 * « Aperçu privé »: …/b/<slug>?apercu=<token> serves the store even unpublished (rpc store_preview), noindex
 * and never cached (client projects, migration jeere_client_projects).
 * Routes (vercel.json):
 *   jehre.com/b/<slug>[/produits/<id> | /pages/<slug> | /panier | /paiement]
 *        → /api/store?slug=<slug>&path=<rest>
 *   <her own domain>/<any path without a dot> → /api/store?path=<path>   (the host header says which store)
 * Vercel serves api/*.js for a project without a framework (« Other »); the files it reads are listed in
 * vercel.json › functions › includeFiles.
 *
 * Environment (optional): JEERE_SB_URL, JEERE_SB_KEY (default: the project « Jehre » and its publishable
 * key, which only reads published rows — RLS), JEERE_ROOT (where concepts/jeere/ is, for local tests).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SB_URL = process.env.JEERE_SB_URL || 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SB_KEY = process.env.JEERE_SB_KEY || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const PUBLIC_HOST = 'jehre.com';
const COLS = 'id,slug,fiche,show_badge,published,published_at,custom_domain,domain_status,updated_at';
// a store's own free address: <slug>.store.jehre.com (the wildcard domain of the project)
const SHOP_HOST = /^([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\.store\.jehre\.com$/;
const JEERE_HOST = /^(jehre\.com|jeere\.kreeative\.xyz|kreeative\.xyz|localhost|127\.0\.0\.1)$|\.kreeative\.xyz$|\.vercel\.app$/;

function rootDir() {
  const cands = [process.env.JEERE_ROOT, path.join(__dirname, '..'), process.cwd()].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(path.join(c, 'concepts/jeere/b/index.html'))) return c; } catch (e) { /* next */ } }
  return path.join(__dirname, '..');
}
const ROOT = rootDir();
const file = (rel) => path.join(ROOT, 'concepts/jeere', rel);

let TEMPLATE = null;
function template() {
  if (TEMPLATE === null) TEMPLATE = fs.readFileSync(file('b/index.html'), 'utf8');
  return TEMPLATE;
}

// creer/data.js + creer/render.js in a sandbox (they only need a `window`): once per instance
let LIB = null;
function lib() {
  if (LIB) return LIB;
  const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, URL, Intl, Date, Math, JSON };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  // render.js reads its own address once, for the demo photos' folder: give it the public one
  ctx.document = { currentScript: { src: 'https://' + PUBLIC_HOST + '/creer/render.js' } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file('creer/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  vm.runInContext(fs.readFileSync(file('creer/render.js'), 'utf8'), ctx, { filename: 'render.js' });
  delete ctx.document;
  LIB = { D: ctx.JEERE_DATA, R: ctx.JeereRender };
  return LIB;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
// JSON inside <script>: nothing can close the tag
const jsonScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// '/produits/p1' | '/pages/a-propos' | '/panier' | '/paiement' → the view (same rules as b.js viewOf)
function viewOf(cfg, rest) {
  let h = String(rest || '').replace(/^\/+|\/+$/g, '');
  try { h = decodeURIComponent(h); } catch (e) { /* raw */ }
  let m = /^produits?\/(.+)$/.exec(h);
  if (m && (cfg.products || []).some((p) => p.id === m[1])) return { page: 'product', productId: m[1], pageId: null, route: '/produits/' + encodeURIComponent(m[1]) };
  if (h === 'panier') return { page: 'cart', productId: null, pageId: null, route: '/panier' };
  if (h === 'paiement') return { page: 'checkout', productId: null, pageId: null, route: '/paiement' };
  m = /^pages?\/(.+)$/.exec(h);
  if (m) {
    const pg = (cfg.pages || []).filter((x) => x.slug === m[1] || x.id === m[1])[0];
    if (pg) return { page: 'page', productId: null, pageId: pg.id, route: '/pages/' + encodeURIComponent(pg.slug || pg.id) };
  }
  return { page: 'home', productId: null, pageId: null, route: '' };
}

// « Aperçu privé » (client projects, migration jeere_client_projects): the store published or not, for
// whoever has its token (rpc store_preview). Same row shape, plus preview: true.
async function fetchPreview(slug, token) {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) return { ok: false, code: 'notfound' };
  try {
    const r = await fetch(SB_URL + '/rest/v1/rpc/store_preview', {
      method: 'POST',
      headers: { apikey: SB_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_token: token }),
      signal: AbortSignal.timeout(3500)
    });
    if (r.status >= 500) return { ok: false, code: 'network' };
    const row = r.ok ? await r.json() : null;
    if (!row || typeof row !== 'object' || !row.fiche) return { ok: false, code: 'notfound' };
    row.preview = true;
    return { ok: true, row };
  } catch (e) {
    return { ok: false, code: 'network' };
  }
}

async function fetchRow(q) {
  let qs;
  if (q.slug) {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(q.slug)) return { ok: false, code: 'notfound' };
    qs = 'slug=eq.' + encodeURIComponent(q.slug) + '&limit=1';
  } else {
    const h = q.host;
    if (!/^[a-z0-9.-]{4,253}$/.test(h)) return { ok: false, code: 'notfound' };
    const alt = /^www\./.test(h) ? h.slice(4) : 'www.' + h;
    qs = 'custom_domain=in.(' + encodeURIComponent('"' + h + '","' + alt + '"') + ')&limit=2';
  }
  try {
    const get = (cols) => fetch(SB_URL + '/rest/v1/stores?select=' + cols + '&published=is.true&' + qs, {
      headers: { apikey: SB_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(3500)
    });
    // no computed `badge` column in the database: asking for it failed on every visit, then asked again without
    const r = await get(COLS);
    if (r.status >= 500) return { ok: false, code: 'network' };
    const rows = r.ok ? await r.json() : null;
    if (!Array.isArray(rows) || !rows.length) return { ok: false, code: r.ok ? 'notfound' : 'network' };
    const row = q.host && rows.length > 1 ? (rows.filter((x) => x.custom_domain === q.host)[0] || rows[0]) : rows[0];
    return { ok: true, row };
  } catch (e) {
    return { ok: false, code: 'network' };
  }
}

// The store drawn by render.js on a stand-in element (phone layout; b.js redraws it at the real width)
function drawStore(R, cfg, view, linkBase) {
  const vars = {};
  const el = {
    innerHTML: '', textContent: '', className: '', dataset: {}, ownerDocument: null, children: [],
    style: { setProperty(k, v) { vars[k] = String(v); }, removeProperty(k) { delete vars[k]; }, getPropertyValue(k) { return vars[k] || ''; } },
    getAttribute() { return null; }, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
  R.render(cfg, el, { device: 'phone', page: view.page, productId: view.productId, pageId: view.pageId, linkBase });
  if (!el.innerHTML || /jst-page-empty/.test(el.innerHTML) && view.page === 'home') return '';
  const data = Object.keys(el.dataset).map((k) => ' data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '="' + esc(el.dataset[k]) + '"').join('');
  const style = Object.keys(vars).map((k) => k + ':' + vars[k]).join(';');
  return '<div id="jb-store" class="jst jb-store jb-ssr"' + data + ' style="' + esc(style) + '">' + el.innerHTML + '</div>';
}

function jsonLd(meta, url, cfg, row) {
  const st = cfg.store || {};
  const store = { '@context': 'https://schema.org', '@type': 'Store', name: meta.name, url: url.split('/produits/')[0].split('/pages/')[0] };
  if (st.tagline) store.description = String(st.tagline).slice(0, 300);
  if (meta.image) store.image = meta.image;
  if (st.city) store.address = { '@type': 'PostalAddress', addressLocality: String(st.city).slice(0, 80), addressCountry: 'CI' };
  const wa = String(st.whatsapp || '').replace(/\D/g, '');
  if (wa.length >= 8) store.telephone = '+' + wa;
  const out = [store];
  if (meta.product) {
    const p = { '@context': 'https://schema.org', '@type': 'Product', name: meta.product.name, url };
    if (meta.product.description) p.description = meta.product.description;
    if (meta.product.image) p.image = meta.product.image;
    p.offers = { '@type': 'Offer', price: String(meta.product.price), priceCurrency: 'XOF', availability: 'https://schema.org/InStock', url, seller: { '@type': 'Organization', name: meta.name } };
    out.push(p);
  }
  return out.map((o) => '<script type="application/ld+json">' + jsonScript(o) + '</script>').join('\n  ');
}

function headHtml(meta, url, ld, fonts, base) {
  const img = meta.image || 'https://' + PUBLIC_HOST + '/img/og.jpg';
  const tags = [
    '<title>' + esc(meta.title) + '</title>',
    '<meta name="description" content="' + esc(meta.description) + '">',
    '<meta name="robots" content="' + (meta.noindex ? 'noindex' : 'index, follow') + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<meta property="og:type" content="' + esc(meta.type) + '">',
    '<meta property="og:site_name" content="' + esc(meta.name) + '">',
    '<meta property="og:title" content="' + esc(meta.title) + '">',
    '<meta property="og:description" content="' + esc(meta.description) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta property="og:image" content="' + esc(img) + '">',
    '<meta property="og:locale" content="fr_CI">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(meta.title) + '">',
    '<meta name="twitter:description" content="' + esc(meta.description) + '">',
    '<meta name="twitter:image" content="' + esc(img) + '">'
  ];
  fonts.forEach((f) => tags.push('<link rel="stylesheet" href="' + esc(f.href) + '">'));
  // without JavaScript the head script does not add the store's styles: these do
  tags.push('<noscript><link rel="stylesheet" href="' + esc(base) + 'creer/store.css"><link rel="stylesheet" href="' + esc(base) + 'b/b.css"></noscript>');
  if (ld) tags.push(ld);
  return '  ' + tags.join('\n  ') + '\n';
}

function between(html, tag, inner) {
  const a = html.indexOf('<!-- ' + tag), b = html.indexOf('<!-- /' + tag + ' -->');
  if (a === -1 || b === -1) return html;
  return html.slice(0, a) + inner + html.slice(b + ('<!-- /' + tag + ' -->').length);
}

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(html);
}

/* ------------------------------------------------------------------ a designer model she bought
 * Her address (<slug>.store.jehre.com, or her own domain) shows the model her account paid for (public.store_model):
 * the model's page, read from the Kreeative site, with her store in it. Its scripts read HER store (data-store),
 * its pictures and styles stay on the Kreeative site, its page links stay on her address. The demo band goes,
 * the model's name and city become hers. Any failure: her simple store, as before. */
const MODEL_ORIGIN = 'https://kreeative.xyz/concepts/';
const MODEL_NAMES = { seve: 'SÈVE', soyeuse: 'SOYEUSE', michou: 'MICHOU', anse: 'ANSE', regard: 'REGARD', vernie: 'VERNIE', minuit: 'MINUIT' };
const ASSET = /\.(?:css|js|mjs|webp|avif|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|mp4|webm|json)(?:[?#].*)?$/i;
async function storeModel(slug) {
  try {
    const r = await fetch(SB_URL + '/rest/v1/rpc/store_model', {
      method: 'POST', headers: { apikey: SB_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }), signal: AbortSignal.timeout(2500)
    });
    const m = r.ok ? await r.json() : null;
    return typeof m === 'string' && MODEL_NAMES[m] ? m : null;
  } catch (e) { return null; }
}
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function textEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
async function modelPage(model, rest, row, cfg, canonical) {
  const clean = String(rest || '').replace(/^\/+/, '').replace(/\.\.+/g, '');
  if (clean && !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i.test(clean)) return null;
  const pageUrl = MODEL_ORIGIN + model + '/' + (clean && !clean.endsWith('/') ? clean + '/' : clean);
  let r;
  try { r = await fetch(pageUrl, { signal: AbortSignal.timeout(4000), headers: { Accept: 'text/html' } }); } catch (e) { return null; }
  if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) return null;
  let html = await r.text();
  const abs = (v) => { try { return new URL(v, pageUrl).href; } catch (e) { return v; } };
  // pictures, styles and scripts from the Kreeative site; page links stay relative (her address)
  html = html.replace(/\b(src|href|poster)=("|')([^"']+)\2/g, (all, a, q, v) => (/^(?:[a-z]+:|\/\/|#|data:)/i.test(v) || !ASSET.test(v) ? all : a + '=' + q + abs(v) + q));
  html = html.replace(/\bsrcset=("|')([^"']+)\1/g, (all, q, v) => 'srcset=' + q + v.split(',').map((part) => { const t = part.trim().split(/\s+/); return /^(?:[a-z]+:|\/\/|data:)/i.test(t[0]) ? part : [abs(t[0])].concat(t.slice(1)).join(' '); }).join(', ') + q);
  // every page of her site reads her store (the booking pages of a model do not carry the script)
  if (!/jeere-connect\.js/.test(html)) html = html.replace('</head>', '<script src="https://jehre.com/connect/jeere-connect.js" data-store="' + row.slug + '" defer></script>\n</head>');
  // her store, not the model's
  html = html.replace(/data-store="[a-z0-9-]+"/g, 'data-store="' + row.slug + '"');
  // the demo band and the demo words
  html = html.replace(/<p class="concept">[\s\S]*?<\/p>/g, '').replace(/<div class="concept-bar"[\s\S]*?<\/div>/g, '');
  html = html.replace(/\s*(?:—|-)\s*(?:boutique|site) de démonstration\.?/gi, '').replace(/<p class="avis__note-exemple">[\s\S]*?<\/p>/g, '');
  html = html.replace(/,? ?(?:studio|boutique|site) de démonstration ?:?/gi, ' :').replace(/ : :/g, ' :');
  // the address search engines keep: her own domain once verified, else her free address
  if (canonical && !/rel="canonical"/.test(html)) {
    const u = canonical + (clean ? '/' + clean.replace(/\/?$/, '/') : '/');
    html = html.replace('</head>', '<link rel="canonical" href="' + textEsc(u) + '">\n<meta property="og:url" content="' + textEsc(u) + '">\n<meta property="og:type" content="website">\n</head>');
  }
  html = html.replace(/<meta name="robots" content="noindex, nofollow">/, '<meta name="robots" content="index, follow">');
  // her name and city in place of the model's
  const name = String((cfg.store && cfg.store.name) || '').trim().slice(0, 40);
  const city = String((cfg.store && cfg.store.city) || '').split(',')[0].trim().slice(0, 40);
  if (name) {
    const n = MODEL_NAMES[model];
    html = html.replace(new RegExp('(?<![\\p{L}])' + escRe(n) + '(?![\\p{L}])', 'gu'), textEsc(name));
  }
  if (city && city !== 'Abidjan') html = html.replace(/(?<![\p{L}-])Abidjan(?![\p{L}])/gu, textEsc(city));
  return html;
}

async function handler(req, res) {
  let tpl;
  try { tpl = template(); } catch (e) { res.statusCode = 500; res.end('Store page missing'); return; }
  const u = new URL(req.url || '/', 'http://x');
  const q = req.query && typeof req.query === 'object' ? req.query : Object.fromEntries(u.searchParams);
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const slug = String(q.slug || '').toLowerCase();
  const rest = String(q.path || '');
  const onJeere = !!slug;
  if (!onJeere && (!rawHost || JEERE_HOST.test(rawHost))) { send(res, 200, tpl, 'no-store'); return; }

  const apercu = onJeere ? String(q.apercu || '') : '';
  const got = apercu ? await fetchPreview(slug, apercu) : await fetchRow(onJeere ? { slug } : (SHOP_HOST.test(rawHost) ? { slug: SHOP_HOST.exec(rawHost)[1] } : { host: rawHost }));
  if (!got.ok && apercu) { send(res, 200, tpl.replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n  <meta name="theme-color"'), 'private, no-store'); return; }
  if (!got.ok) {
    // Not found (yet): the page itself, kept out of the index; b.js asks again and says « Boutique
    // introuvable », or shows a store published a second ago (200, so a fresh store is never a dead end)
    if (got.code === 'notfound') send(res, 200, tpl.replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n  <meta name="theme-color"'), 'public, max-age=0, s-maxage=10');
    else send(res, 200, tpl, 'no-store');
    return;
  }
  // her own address (not jehre.com/b/…, which keeps the cart and the payment): the model she bought
  if (!onJeere && !got.row.preview && !/^\/?(?:panier|paiement|confirmation|produits\/|pages\/)/.test(rest)) {
    // the model bought by her account; the founder's own model stores (their address IS the model's name: seve,
    // soyeuse…) carry their model without a purchase, exactly as the editor shows them
    const model = (await storeModel(got.row.slug)) || (MODEL_NAMES[got.row.slug] ? got.row.slug : null);
    if (model) {
      let page = null;
      try {
        const own = got.row.custom_domain && got.row.domain_status === 'verified' ? got.row.custom_domain : '';
        const { D } = lib();
        page = await modelPage(model, rest, got.row, D.normalizeConfig(got.row.fiche), 'https://' + (own || got.row.slug + '.store.jehre.com'));
      } catch (e) { page = null; }
      if (page) { send(res, 200, page, 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'); return; }
    }
  }
  try {
    const { D, R } = lib();
    const row = got.row;
    const cfg = D.normalizeConfig(row.fiche);
    const view = viewOf(cfg, rest);
    const proto = 'https://';
    const own = row.custom_domain && row.domain_status === 'verified' ? row.custom_domain : '';
    const origin = onJeere ? proto + PUBLIC_HOST + '/b/' + row.slug : proto + rawHost;
    // the address search engines keep: her own domain, else her free address <slug>.store.jehre.com
    const shopHost = onJeere || SHOP_HOST.test(rawHost);
    const canonicalOrigin = own ? proto + own : (shopHost ? proto + row.slug + '.store.jehre.com' : proto + rawHost);
    const url = canonicalOrigin + (view.route || '/');
    const meta = R.storeMeta(cfg, view, { abs: (s) => { try { return new URL(s, 'https://' + PUBLIC_HOST + '/').href; } catch (e) { return ''; } } });
    if (row.preview) meta.noindex = true; // a private preview is never indexed
    const linkBase = onJeere ? '/b/' + row.slug : '';
    const base = onJeere ? '/' : '/concepts/jeere/';
    let body = '';
    try { body = drawStore(R, cfg, view, linkBase); } catch (e) { body = ''; }
    let fonts = [];
    try { fonts = (R.fontLinks(cfg) || []).slice(0, 4); } catch (e) { fonts = []; }
    let html = between(tpl, 'jb:meta', headHtml(meta, url, jsonLd(meta, url, cfg, row), fonts, base).replace(/^ {2}/, ''));
    const data = '<script type="application/json" id="jb-data">' + jsonScript(row) + '</script>';
    if (body) html = between(html, 'jb:body', body + '\n    ' + data + '\n');
    else html = html.replace('</main>', '  ' + data + '\n  </main>');
    // the private preview is not cached by Vercel (the token is in the query, and a store not online must not linger)
    send(res, 200, html, row.preview ? 'private, no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400');
  } catch (e) {
    send(res, 200, tpl, 'no-store');
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports._internals = { viewOf, lib, drawStore, fetchRow, fetchPreview };
