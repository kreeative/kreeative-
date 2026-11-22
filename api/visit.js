/*
 * Jehre — /api/visit: one visit to a store, for « En direct » in the dashboard (the globe of visitors).
 *
 * Called by the store pages themselves (b/b.js on a Jehre address, connect/jeere-connect.js on a custom site):
 *   POST { slug, path }   as text/plain (sendBeacon: no preflight)
 * The place comes from the host (Vercel's x-vercel-ip-* headers: country, city, a rough latitude and longitude).
 * No IP address is stored: the visitor is a one-way hash of the address, the browser and the day, so the same
 * person counts once a day per store and cannot be followed from one day, or one store, to the next.
 * Written through public.log_store_visit (a published store only, sane values, a brake), with the public key.
 */
const crypto = require('crypto');

const SB_URL = process.env.JEERE_SB_URL || 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SB_KEY = process.env.JEERE_SB_KEY || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|monitor|curl|wget|python|node-fetch|axios/i;

function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
const head = (req, k) => String((req.headers && req.headers[k]) || '').split(',')[0].trim();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const done = () => { res.statusCode = 204; res.end(); };
  try {
    const ua = head(req, 'user-agent');
    if (!ua || BOT.test(ua)) return done();
    const b = await body(req);
    const slug = String((b && b.slug) || '').toLowerCase();
    if (!SLUG.test(slug)) return done();
    const ip = head(req, 'x-real-ip') || head(req, 'x-forwarded-for') || '';
    const day = new Date().toISOString().slice(0, 10);
    const visitor = crypto.createHash('sha256').update([ip, ua, day, slug].join('|')).digest('hex').slice(0, 24);
    let city = head(req, 'x-vercel-ip-city');
    try { city = decodeURIComponent(city); } catch (e) { /* as it came */ }
    await fetch(SB_URL + '/rest/v1/rpc/log_store_visit', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_slug: slug, p_visitor: visitor, p_country: head(req, 'x-vercel-ip-country') || null, p_city: city || null,
        p_lat: num(head(req, 'x-vercel-ip-latitude')), p_lon: num(head(req, 'x-vercel-ip-longitude')),
        // the page only: never what follows « ? » or « # » (a sign-in link carries its key there)
        p_path: String((b && b.path) || '').split('?')[0].split('#')[0].slice(0, 80) || null
      })
    }).catch(() => null);
  } catch (e) { /* a visit that is not counted never breaks a store */ }
  return done();
}

module.exports = handler;
module.exports.default = handler;
