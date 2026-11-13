// Jeere — Edge Function `relances` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk): ONE reminder e-mail to
// someone who started creating an account (code sent) and did not finish, 1 hour to 7 days later. The number of
// launch-offer spots left in the e-mail is the real one (public.launch_spots).
//
//   Called every hour by pg_cron (job « jeere-relances ») with the header x-jeere-cron = public.jeere_cron.secret.
//   body: { action: 'run' } → { ok, sent }      { action: 'dry' } → { ok, pending } (nothing sent)
// E-mails through Resend (RESEND_API_KEY, the same secret as `orders`). Deployed with verify_jwt = false.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'Jeere <bonjour@kreeative.xyz>';
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jeere.kreeative.xyz').replace(/\/$/, '');

type Obj = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const db = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});
async function rpc(name: string, body: Obj = {}) { const r = await db('rpc/' + name, { method: 'POST', body: JSON.stringify(body) }); return r.ok ? await r.json() : null; }

function mail(firstName: string, left: number, months: number, active: boolean, spots: number, trial: boolean) {
  const hi = firstName ? 'Bonjour ' + firstName + ',' : 'Bonjour,';
  const link = SITE + '/compte/#connexion';
  // everyone: the 1st month of Essentiel free; the first `spots`: `months` months (while spots are left)
  const offer = active
    ? 'Votre 1er mois sur le pack Essentiel (3 000 FCFA/mois) est offert. Les ' + spots + ' premières inscrites ont ' + months + ' mois offerts : il reste ' + left + ' place' + (left > 1 ? 's' : '') + '.'
    : (trial ? 'Votre 1er mois sur le pack Essentiel (3 000 FCFA/mois) est offert.' : '');
  const lines = [
    hi,
    'Vous avez commencé à créer votre compte Jeere, mais il n’est pas encore terminé : il manque juste le code de connexion.',
    offer,
    'Pour finir, ouvrez ' + link + ', entrez votre adresse e-mail, puis tapez le code à 6 chiffres que vous recevez.',
    'Une question ? Répondez simplement à cet e-mail.',
    'Kelly, Jeere'
  ].filter(Boolean);
  const subject = active ? 'Finalisez votre inscription : il reste ' + left + ' place' + (left > 1 ? 's' : '') + ' à 3 mois offerts' : (trial ? 'Finalisez votre inscription : votre 1er mois est offert' : 'Finalisez votre inscription à Jeere');
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;">' +
    '<tr><td style="padding:26px 28px 6px 28px;font:700 20px/26px ' + font + ';color:#111111;">Jeere</td></tr>' +
    '<tr><td style="padding:12px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' +
    lines.slice(0, -2).map((l) => '<p style="margin:0 0 14px 0;">' + esc(l) + '</p>').join('') +
    '<p style="margin:6px 0 18px 0;"><a href="' + link + '" style="display:inline-block;background:#111111;color:#FFFFFF;text-decoration:none;font:600 15px ' + font + ';padding:12px 22px;border-radius:12px;">Finir mon inscription</a></p>' +
    lines.slice(-2).map((l) => '<p style="margin:0 0 14px 0;">' + esc(l) + '</p>').join('') +
    '</td></tr><tr><td style="padding:6px 28px 24px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">Vous recevez ce seul rappel parce que vous avez demandé un code de connexion sur jeere.kreeative.xyz. Vous n’en recevrez pas d’autre.</td></tr>' +
    '</table></td></tr></table></body></html>';
  return { subject, html, text: lines.join('\n\n') };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config' }, 500);
  const cfg = await db('jeere_cron?select=secret&id=eq.1').then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[];
  const want = cfg[0] && typeof cfg[0].secret === 'string' ? cfg[0].secret : '';
  if (!want || req.headers.get('x-jeere-cron') !== want) return json({ ok: false, code: 'forbidden' }, 403);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }

  const pending = (await rpc('pending_signups')) as { id: string; email: string; first_name: string }[] | null;
  if (!Array.isArray(pending)) return json({ ok: false, code: 'db' }, 500);
  if (b.action === 'dry') return json({ ok: true, pending: pending.length });
  if (!RESEND_KEY) return json({ ok: false, code: 'no_resend', pending: pending.length }, 503);

  const spots = (await rpc('launch_spots')) as Obj | null;
  const active = !!(spots && spots.active), left = Number(spots?.left ?? 0), months = Number(spots?.months ?? 3);
  let sent = 0;
  for (const p of pending) {
    const m = mail(String(p.first_name || '').split(' ')[0].slice(0, 40), left, months, active, Number(spots?.spots ?? 10), !!(spots && spots.trial));
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [p.email], subject: m.subject, html: m.html, text: m.text, reply_to: 'contact.jeere@kreeative.xyz' })
    }).catch(() => null);
    const ok = !!(r && r.ok);
    // recorded either way: never two reminders to the same person
    await db('signup_reminders', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: p.id, ok }) });
    if (ok) sent++;
  }
  return json({ ok: true, sent, pending: pending.length });
});
