// Jehre — Edge Function `relances` (Supabase project « Jehre », ref aezchxfvzfoqlvzchqyk): ONE reminder e-mail to
// someone who started creating an account (code sent) and did not finish, 1 hour to 7 days later. The number of
// launch-offer spots left in the e-mail is the real one (public.launch_spots).
//
// Also ONE welcome e-mail to each new account, once its e-mail is confirmed (public.pending_welcomes, recorded in
// public.signup_welcomes): where the dashboard is, the first steps, how to log in again, how to get help.
//
// And the invitation e-mail of a partner or a client: { action: 'invite', id } sent by the trigger on public.store_invites.
//
//   Called every hour by pg_cron (job « jeere-relances ») with the header x-jeere-cron = public.jeere_cron.secret.
//   body: { action: 'run' } → { ok, sent }      { action: 'dry' } → { ok, pending, welcomes } (nothing sent)
// E-mails through Resend (RESEND_API_KEY, the same secret as `orders`). Deployed with verify_jwt = false.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'Jehre <bonjour@jehre.com>';
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jehre.com').replace(/\/$/, '');

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
    ? 'Les ' + spots + ' premières inscrites gagnent ' + months + ' mois de pack Essentiel offerts, soit plus de 10 000 FCFA : il reste ' + left + ' place' + (left > 1 ? 's' : '') + '. Pour toutes les autres, le 1er mois est offert.'
    : (trial ? 'Votre 1er mois sur le pack Essentiel (3 500 FCFA/mois) est offert.' : '');
  const lines = [
    hi,
    'Vous avez commencé à créer votre compte Jehre, mais il n’est pas encore terminé : il manque juste le code de connexion.',
    offer,
    'Pour finir, ouvrez ' + link + ', entrez votre adresse e-mail, puis tapez le code à 6 chiffres que vous recevez.',
    'Une question ? Répondez simplement à cet e-mail.',
    'Kelly, Jehre'
  ].filter(Boolean);
  const subject = active ? 'Finalisez votre inscription : il reste ' + left + ' place' + (left > 1 ? 's' : '') + ' à plus de 10 000 F offerts' : (trial ? 'Finalisez votre inscription : votre 1er mois est offert' : 'Finalisez votre inscription à Jehre');
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;">' +
    '<tr><td style="padding:26px 28px 6px 28px;font:700 20px/26px ' + font + ';color:#111111;">Jehre</td></tr>' +
    '<tr><td style="padding:12px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' +
    lines.slice(0, -2).map((l) => '<p style="margin:0 0 14px 0;">' + esc(l) + '</p>').join('') +
    '<p style="margin:6px 0 18px 0;"><a href="' + link + '" style="display:inline-block;background:#111111;color:#FFFFFF;text-decoration:none;font:600 15px ' + font + ';padding:12px 22px;border-radius:12px;">Finir mon inscription</a></p>' +
    lines.slice(-2).map((l) => '<p style="margin:0 0 14px 0;">' + esc(l) + '</p>').join('') +
    '</td></tr><tr><td style="padding:6px 28px 24px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">Vous recevez ce seul rappel parce que vous avez demandé un code de connexion sur jehre.com. Vous n’en recevrez pas d’autre.</td></tr>' +
    '</table></td></tr></table></body></html>';
  return { subject, html, text: lines.join('\n\n') };
}

// The invitation: « X vous invite à gérer la boutique Y ». One e-mail per row of public.store_invites (notified_at).
async function inviteMail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, code: 'id' }, 400);
  const inv = (await db('store_invites?select=id,email,mode,store_id,invited_by,notified_at,accepted_at&id=eq.' + id).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[])[0];
  if (!inv || inv.notified_at || inv.accepted_at) return json({ ok: true, sent: 0 });
  if (!RESEND_KEY) return json({ ok: false, code: 'no_resend' }, 503);
  const st = (await db('stores?select=slug,client_name,fiche->store->>name&id=eq.' + inv.store_id).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[])[0] ?? {};
  const shop = String(st.name || st.client_name || st.slug || 'une boutique').slice(0, 80);
  const who = inv.invited_by ? (await db('profiles?select=first_name&id=eq.' + inv.invited_by).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[])[0] : null;
  const by = String((who && who.first_name) || '').split(' ')[0].slice(0, 40);
  const to = String(inv.email);
  const link = SITE + '/compte/#connexion';
  const partner = inv.mode === 'editor';
  const subject = partner ? (by ? by + ' vous invite à gérer ' + shop + ' sur Jehre' : 'Vous êtes invité à gérer ' + shop + ' sur Jehre') : 'Votre boutique ' + shop + ' vous attend sur Jehre';
  const lines = [
    'Bonjour,',
    partner
      ? (by ? by + ' vous invite' : 'Vous êtes invité') + ' à gérer la boutique « ' + shop + ' » sur Jehre : les commandes, les produits, les rendez-vous, le site.'
      : 'La boutique « ' + shop + ' » a été préparée pour vous sur Jehre. Elle vous attend.',
    'Pour y accéder, connectez-vous à Jehre avec cette adresse e-mail (' + to + '). Pas de mot de passe : vous recevez un code à 6 chiffres. La boutique apparaît ensuite dans votre tableau de bord.',
    'Une question ? Répondez simplement à cet e-mail.',
    'Kelly, Jehre'
  ];
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const para = (t: string) => '<p style="margin:0 0 14px 0;">' + esc(t) + '</p>';
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;">' +
    '<tr><td style="padding:26px 28px 6px 28px;font:700 20px/26px ' + font + ';color:#111111;">Jehre</td></tr>' +
    '<tr><td style="padding:12px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' +
    lines.slice(0, 3).map(para).join('') +
    '<p style="margin:6px 0 18px 0;"><a href="' + link + '" style="display:inline-block;background:#111111;color:#FFFFFF;text-decoration:none;font:600 15px ' + font + ';padding:12px 22px;border-radius:12px;">Me connecter à Jehre</a></p>' +
    lines.slice(3).map(para).join('') +
    '</td></tr><tr><td style="padding:6px 28px 24px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">Vous recevez ce message parce qu’une personne vous a invité sur jehre.com. Si ce n’est pas attendu, ignorez-le.</td></tr>' +
    '</table></td></tr></table></body></html>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text: lines.slice(0, 3).concat([link], lines.slice(3)).join('\n\n'), reply_to: 'contact@jehre.com' })
  }).catch(() => null);
  const ok = !!(r && r.ok);
  if (ok) await db('store_invites?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  return json({ ok, sent: ok ? 1 : 0 });
}

// The welcome: short, the few things a new seller needs to know.
function welcome(firstName: string, trial: boolean) {
  const hi = firstName ? 'Bonjour ' + firstName + ',' : 'Bonjour,';
  const link = SITE + '/admin/';
  const subject = 'Bienvenue sur Jehre : vos premiers pas';
  const intro = 'Bienvenue sur Jehre. Votre compte est créé. Voici l’essentiel pour bien démarrer.';
  const steps = [
    ['Remplissez votre boutique', 'Ajoutez vos produits ou vos prestations, avec les prix et de belles photos.'],
    ['Mettez vos contacts', 'Votre numéro WhatsApp et vos moyens de paiement (Wave, Orange Money, carte).'],
    ['Publiez', 'Un bouton, et votre boutique a sa propre adresse à partager à vos clients.']
  ];
  const notes = [
    ['Pour vous reconnecter', 'Pas de mot de passe. Entrez votre e-mail sur jehre.com, vous recevez un code à 6 chiffres.'],
    trial ? ['Votre 1er mois est offert', 'Le pack Essentiel est gratuit le premier mois. Ensuite 3 500 FCFA par mois, sans engagement.'] : null,
    ['Besoin d’aide ?', 'Répondez simplement à cet e-mail. Une vraie personne vous répond.']
  ].filter(Boolean) as string[][];
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const IMG = SITE + '/img/email/';
  // the logo's colours, in order: the full rainbow
  const RB = ['#E8467C', '#F08A3C', '#F0C414', '#22C97E', '#1E9BE0', '#6A4CFF', '#C13CE0'];
  const para = (t: string) => '<p style="margin:0 0 14px 0;">' + esc(t) + '</p>';
  const step = (n: number, c: string, x: string[]) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;"><tr>' +
    '<td width="46" valign="top"><div style="width:34px;height:34px;border-radius:17px;background:' + c + ';color:#FFFFFF;font:700 16px/34px ' + font + ';text-align:center;">' + n + '</div></td>' +
    '<td valign="top" style="font:400 15px/1.5 ' + font + ';color:#111111;"><b>' + esc(x[0]) + '</b><br><span style="color:#444444;">' + esc(x[1]) + '</span></td></tr></table>';
  const note = (c: string, x: string[]) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;"><tr>' +
    '<td width="18" valign="top"><div style="width:8px;height:8px;border-radius:4px;background:' + c + ';margin-top:7px;"></div></td>' +
    '<td valign="top" style="font:400 14.5px/1.5 ' + font + ';color:#111111;"><b>' + esc(x[0]) + '</b><br><span style="color:#444444;">' + esc(x[1]) + '</span></td></tr></table>';
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;overflow:hidden;">' +
    '<tr><td style="padding:0;line-height:0;"><a href="' + SITE + '/"><img src="' + IMG + 'entete.png" width="520" alt="Jehre" style="display:block;width:100%;height:auto;border:0;border-radius:18px 18px 0 0;"></a></td></tr>' +
    '<tr><td style="padding:6px 28px 4px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' +
    '<p style="margin:0 0 10px 0;font:700 26px/1.2 ' + font + ';letter-spacing:-.01em;">' + esc(firstName ? 'Bienvenue, ' + firstName + '.' : 'Bienvenue.') + '</p>' +
    para('Votre compte Jehre est créé. Voici l’essentiel pour mettre votre boutique en ligne.') +
    '<p style="margin:22px 0 14px 0;font:700 17px/1.3 ' + font + ';">Vos 3 premiers pas</p>' +
    steps.map((x, i) => step(i + 1, [RB[0], RB[1], RB[3]][i], x)).join('') +
    '<p style="margin:10px 0 26px 0;"><a href="' + link + '" style="display:inline-block;background:#111111;color:#FFFFFF;text-decoration:none;font:600 15px ' + font + ';padding:13px 24px;border-radius:999px;">Ouvrir mon tableau de bord</a></p>' +
    '</td></tr>' +
    '<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #ECEAE6;border-radius:16px;"><tr><td style="padding:20px 20px 0 20px;font:400 14.5px/1.5 ' + font + ';color:#111111;">' +
    '<p style="margin:0 0 4px 0;font:700 17px/1.3 ' + font + ';">Un site déjà dessiné pour votre métier</p>' +
    '<p style="margin:0 0 6px 0;color:#444444;">Mode, perruques, cils, ongles, soins, sacs : choisissez un modèle de designer dans « Boutique en ligne ». Payé une seule fois.</p></td></tr>' +
    '<tr><td style="padding:0;line-height:0;"><a href="' + link + '#boutique"><img src="' + IMG + 'modeles.jpg" width="464" alt="Trois modèles de designer Jehre sur téléphone" style="display:block;width:100%;height:auto;border:0;border-radius:0 0 16px 16px;"></a></td></tr></table></td></tr>' +
    '<tr><td style="padding:26px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' +
    '<p style="margin:0 0 14px 0;font:700 17px/1.3 ' + font + ';">Bon à savoir</p>' +
    notes.map((x, i) => note([RB[4], RB[5], RB[6], RB[0]][i % 4], x)).join('') +
    '<p style="margin:20px 0 4px 0;">À très vite,</p><p style="margin:0 0 18px 0;font-weight:700;">Kelly, Jehre</p>' +
    '</td></tr>' +
    '<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + RB.map((c) => '<td height="4" style="background:' + c + ';font-size:0;line-height:0;">&nbsp;</td>').join('') + '</tr></table></td></tr>' +
    '<tr><td style="padding:14px 28px 24px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">Vous recevez ce message parce que vous venez de créer un compte sur jehre.com.<br>© 2026 Jehre™. Tous droits réservés.</td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = [hi, intro, 'Vos 3 premiers pas',
    ...steps.map((x, i) => (i + 1) + '. ' + x[0] + '. ' + x[1]),
    'Votre tableau de bord : ' + link, 'Les modèles de designer : des sites déjà dessinés pour votre métier, dans « Boutique en ligne ». Payés une seule fois.', 'Bon à savoir',
    ...notes.map((x) => x[0] + (/[?!]$/.test(x[0]) ? ' ' : '. ') + x[1]), 'À très vite,', 'Kelly, Jehre'].join('\n\n');
  return { subject, html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config' }, 500);
  const cfg = await db('jeere_cron?select=secret&id=eq.1').then((r) => (r.ok ? r.json() : [])).catch(() => []) as Obj[];
  const want = cfg[0] && typeof cfg[0].secret === 'string' ? cfg[0].secret : '';
  if (!want || req.headers.get('x-jeere-cron') !== want) return json({ ok: false, code: 'forbidden' }, 403);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }

  if (b.action === 'invite') return inviteMail(String(b.id ?? ''));

  const pending = (await rpc('pending_signups')) as { id: string; email: string; first_name: string }[] | null;
  if (!Array.isArray(pending)) return json({ ok: false, code: 'db' }, 500);
  const fresh = ((await rpc('pending_welcomes')) as { id: string; email: string; first_name: string }[] | null) ?? [];
  if (b.action === 'dry') return json({ ok: true, pending: pending.length, welcomes: fresh.length });
  if (!RESEND_KEY) return json({ ok: false, code: 'no_resend', pending: pending.length }, 503);

  const spots = (await rpc('launch_spots')) as Obj | null;
  const active = !!(spots && spots.active), left = Number(spots?.left ?? 0), months = Number(spots?.months ?? 3);
  let sent = 0;
  for (const p of pending) {
    const m = mail(String(p.first_name || '').split(' ')[0].slice(0, 40), left, months, active, Number(spots?.spots ?? 10), !!(spots && spots.trial));
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [p.email], subject: m.subject, html: m.html, text: m.text, reply_to: 'contact@jehre.com' })
    }).catch(() => null);
    const ok = !!(r && r.ok);
    // recorded either way: never two reminders to the same person
    await db('signup_reminders', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: p.id, ok }) });
    if (ok) sent++;
  }
  let welcomed = 0;
  for (const p of fresh) {
    const m = welcome(String(p.first_name || '').split(' ')[0].slice(0, 40), !!(spots && spots.trial));
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [p.email], subject: m.subject, html: m.html, text: m.text, reply_to: 'contact@jehre.com' })
    }).catch(() => null);
    const ok = !!(r && r.ok);
    // recorded either way: never two welcomes to the same person
    await db('signup_welcomes', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: p.id, ok }) });
    if (ok) welcomed++;
  }
  return json({ ok: true, sent, pending: pending.length, welcomed, welcomes: fresh.length });
});
