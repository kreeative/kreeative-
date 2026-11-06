/*
 * Jeere — api/sitemap.js: https://jeere.kreeative.xyz/b/sitemap.xml (vercel.json routes it here).
 * The list itself is made by the Supabase Edge Function `store-sitemap` (every published store, its pages
 * and its products). Supabase serves every GET response of an Edge Function as text/plain, which a search
 * engine may not read as XML: this function fetches it and serves it again as application/xml, cached
 * at Vercel's edge for 15 minutes. Environment (optional): JEERE_SITEMAP_URL.
 */
'use strict';

const SOURCE = process.env.JEERE_SITEMAP_URL || 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/store-sitemap';
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';

async function handler(req, res) {
  let xml = '', ok = false;
  try {
    const r = await fetch(SOURCE, { signal: AbortSignal.timeout(8000) });
    xml = await r.text();
    ok = r.ok && /^<\?xml[\s\S]*<urlset[\s\S]*<\/urlset>\s*$/.test(xml);
  } catch (e) { ok = false; }
  res.statusCode = ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', ok ? 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600' : 'no-store');
  if (!ok) res.setHeader('Retry-After', '600');
  res.end(ok ? xml : EMPTY);
}

module.exports = handler;
