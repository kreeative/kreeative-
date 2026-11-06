// Jeere — Edge Function `store-sitemap` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// https://jeere.kreeative.xyz/b/sitemap.xml (vercel.json proxies that address here): every published
// store, its pages and its products, in the sitemaps.org format, for Google and the other engines.
//   GET https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/store-sitemap   → application/xml
// A store on her own verified domain is listed at that domain. Pages or stores marked « noindex » in the
// Studio's référencement are left out, and so are the cart and the checkout.
// Reads public.store_sitemap() (migration jeere_wave2) with the service role; before that migration,
// it falls back to the published rows' addresses alone (publishable key: anyone reads published rows).
// Deployed with verify_jwt = false: a search engine sends no key. Cached 15 minutes at the edge.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const PUBLIC_HOST = 'jeere.kreeative.xyz';

type Row = { slug: string; updated_at: string; custom_domain: string | null; domain_status: string | null; pages?: string[]; products?: string[]; noindex?: boolean };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rows(): Promise<Row[]> {
  if (SECRET) {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/store_sitemap', {
        method: 'POST',
        headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (r.ok) { const b = await r.json(); if (Array.isArray(b)) return b as Row[]; }
    } catch { /* fall back */ }
  }
  const r = await fetch(SUPABASE_URL + '/rest/v1/stores?select=slug,updated_at,custom_domain,domain_status&published=is.true&order=updated_at.desc&limit=5000', {
    headers: { apikey: PUBLISHABLE }
  });
  if (!r.ok) throw new Error('stores ' + r.status);
  return await r.json() as Row[];
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  let list: Row[] = [];
  try { list = await rows(); } catch {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n', {
      status: 503, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' }
    });
  }
  const out: string[] = [];
  for (const s of list) {
    if (!s || !/^[a-z0-9-]{3,40}$/.test(s.slug) || s.noindex) continue;
    const base = s.custom_domain && s.domain_status === 'verified' ? 'https://' + s.custom_domain : 'https://' + PUBLIC_HOST + '/b/' + s.slug;
    const last = s.updated_at ? new Date(s.updated_at).toISOString().slice(0, 10) : '';
    const url = (u: string, prio: string) => out.push('  <url><loc>' + esc(u) + '</loc>' + (last ? '<lastmod>' + last + '</lastmod>' : '') + '<priority>' + prio + '</priority></url>');
    url(base + (s.custom_domain && s.domain_status === 'verified' ? '/' : ''), '1.0');
    for (const p of s.pages || []) if (/^[a-z0-9-]{1,60}$/.test(p)) url(base + '/pages/' + p, '0.5');
    for (const id of s.products || []) if (/^[A-Za-z0-9_-]{1,40}$/.test(id)) url(base + '/produits/' + encodeURIComponent(id), '0.8');
    if (out.length > 49000) break;
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + out.join('\n') + (out.length ? '\n' : '') + '</urlset>\n';
  return new Response(req.method === 'HEAD' ? null : xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=900' }
  });
});
