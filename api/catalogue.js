/*
 * Jehre — /api/catalogue: a store's products as a data feed for Meta (Facebook and Instagram shop, catalogue ads).
 *
 *   https://<slug>.store.jehre.com/catalogue.csv   or   https://jehre.com/b/<slug>/catalogue.csv
 * The seller pastes this address in Meta Commerce Manager › Catalogue › Sources de données › Flux programmé.
 * Read from the PUBLISHED store only (publishable key): what the shop already shows, nothing more. Meta needs a
 * photo for each product: a product without one of her photos is left out.
 */
const SB_URL = process.env.JEERE_SB_URL || 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SB_KEY = process.env.JEERE_SB_KEY || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const CUR = { XOF: 'XOF', CAD: 'CAD', USD: 'USD', EUR: 'EUR' };

const cell = (v) => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

module.exports = async function handler(req, res) {
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const fromHost = (/^([a-z0-9-]+)\.store\.jehre\.com$/.exec(host) || [])[1] || '';
  const slug = String(q.slug || fromHost || '').toLowerCase();
  if (!SLUG.test(slug)) { res.statusCode = 404; res.end('Boutique introuvable'); return; }
  let row = null;
  try {
    const r = await fetch(SB_URL + '/rest/v1/stores?slug=eq.' + encodeURIComponent(slug) + '&published=is.true&select=slug,fiche,custom_domain', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    row = r.ok ? (await r.json())[0] : null;
  } catch (e) { row = null; }
  if (!row) { res.statusCode = 404; res.end('Boutique introuvable ou pas encore en ligne'); return; }
  const f = row.fiche && typeof row.fiche === 'object' ? row.fiche : {};
  const st = f.store && typeof f.store === 'object' ? f.store : {};
  const cur = CUR[String(st.currency || '').toUpperCase()] || 'XOF';
  const base = row.custom_domain ? 'https://' + String(row.custom_domain).replace(/^www\./, '') + '/' : 'https://' + slug + '.store.jehre.com/';
  const brand = String(st.name || slug).slice(0, 100);
  const lines = [['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'product_type'].join(',')];
  (Array.isArray(f.products) ? f.products : []).forEach((p) => {
    if (!p || typeof p !== 'object' || !p.id || !p.name) return;
    const imgs = (Array.isArray(p.images) ? p.images : []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
    const img = typeof p.image === 'string' && /^https:\/\//.test(p.image) ? p.image : imgs[0];
    if (!img) return;
    const price = Math.max(0, Number(p.price) || 0);
    const off = p.stock === 0 || p.available === false;
    lines.push([p.id, String(p.name).slice(0, 150), String(p.description || p.name).slice(0, 5000), off ? 'out of stock' : 'in stock', 'new',
      (cur === 'XOF' ? Math.round(price) : price.toFixed(2)) + ' ' + cur, base + '?produit=' + encodeURIComponent(p.id), img, imgs.filter((u) => u !== img).slice(0, 9).join(','), brand, String(p.category || '')].map(cell).join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.end(lines.join('\n') + '\n');
};
