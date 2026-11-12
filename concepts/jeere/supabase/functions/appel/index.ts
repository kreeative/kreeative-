// Jeere — Edge Function `appel` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk): « Réserver un appel avec
// notre designer » for a fully custom website. Saves the request (public.design_requests) and e-mails the founder
// (the addresses of public.site_editors), who calls back on WhatsApp.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/appel
//   body: { firstName, whatsapp, link?, need?, source? } → { ok }                                   anyone
// Brakes: 3 requests per WhatsApp number and 3 per connection (a hash of the IP, never the IP) per day, 300 a day in
// all; the founder gets at most 20 e-mails a day (the rest wait in the table). Deployed with verify_jwt = false.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
type Obj = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const db = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});
async function rows(path: string) { const r = await db(path); return r.ok ? await r.json() as Obj[] : []; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }

  const firstName = str(b.firstName, 60);
  const whatsapp = str(b.whatsapp, 30).replace(/[^\d+ ]/g, '');
  const link = str(b.link, 300);
  const need = str(b.need, 800);
  const source = str(b.source, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!firstName) return json({ ok: false, code: 'name', message: 'Votre prénom, s’il vous plaît.' }, 400);
  if (whatsapp.replace(/\D/g, '').length < 8) return json({ ok: false, code: 'phone', message: 'Un numéro WhatsApp complet, avec l’indicatif.' }, 400);

  // the connection, hashed (the IP itself is never kept)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  const ipHash = ip ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('jeere-appel:' + ip)))).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32) : '';
  const since = new Date(Date.now() - 86400000).toISOString();
  const today = await rows('design_requests?select=whatsapp,ip_hash&created_at=gte.' + encodeURIComponent(since) + '&limit=400');
  const digits = (x: unknown) => String(x ?? '').replace(/\D/g, '').slice(-8);
  if (today.filter((r) => digits(r.whatsapp) === digits(whatsapp)).length >= 3 || (ipHash && today.filter((r) => r.ip_hash === ipHash).length >= 3)) {
    return json({ ok: false, code: 'rate', message: 'Votre demande est déjà arrivée : nous vous écrivons très vite.' }, 429);
  }
  if (today.length >= 300) return json({ ok: false, code: 'busy', message: 'Beaucoup de demandes aujourd’hui : réessayez demain, ou écrivez-nous sur WhatsApp.' }, 429);
  const ins = await db('design_requests', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ first_name: firstName, whatsapp, link: link || null, need: need || null, source: source || null, ip_hash: ipHash || null }) });
  if (!ins.ok) return json({ ok: false, code: 'server', message: 'La demande n’est pas partie. Réessayez.' }, 500);

  // the founder is told at once
  if (RESEND_KEY && today.length < 20) {
    const to = (await rows('site_editors?select=email')).map((r) => String(r.email ?? '')).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (to.length) {
      const wa = 'https://wa.me/' + whatsapp.replace(/\D/g, '');
      const lines = ['Nouvelle demande d’appel : site sur mesure', 'Prénom : ' + firstName, 'WhatsApp : ' + whatsapp + ' (' + wa + ')', 'Lien : ' + (link || '—'), 'Besoin : ' + (need || '—'), 'Source : ' + (source || 'direct')];
      await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Jeere <bonjour@kreeative.xyz>', to, subject: 'Appel designer : ' + firstName,
          text: lines.join('\n'), html: '<div style="font:15px/1.6 Helvetica,Arial,sans-serif;color:#111">' + lines.map((l) => '<p style="margin:0 0 8px">' + esc(l) + '</p>').join('') + '<p><a href="' + wa + '">Écrire sur WhatsApp</a></p></div>' })
      }).catch(() => null);
    }
  }
  return json({ ok: true });
});
