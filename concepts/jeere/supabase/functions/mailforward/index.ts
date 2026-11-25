// Jehre — Edge Function `mailforward` (Supabase project ref aezchxfvzfoqlvzchqyk): the mail that arrives on
// @jehre.com is received by Resend, which has no mailbox to read. This function passes each message on to the
// team's real mailbox.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/mailforward
//   called by a Resend webhook on the event `email.received`. The body only names a message: its content is read
//   back from Resend with our own key, so a forged call can at most re-send a message that really arrived — and
//   the table public.jeere_mail_forwarded lets each message through once.
// Secrets: RESEND_API_KEY (already set, sends), RESEND_FULL_KEY (a Resend key with full access, reads the
// received message), optionally MAIL_FORWARD_TO.
// Other domains received by the same Resend account (theivorysukundu.com…) go where public.mail_routes says,
// one row per domain (domain → forward_to); a domain without a row is left alone.
// Deployed with verify_jwt = false.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
// reading a received message needs a key with full access; the key used to send is often « sending only »
const READ_KEY = Deno.env.get('RESEND_FULL_KEY') || RESEND_KEY;
const FORWARD_TO = Deno.env.get('MAIL_FORWARD_TO') || 'jehre.inc@gmail.com';
const DOMAIN = 'jehre.com';
const FALLBACK_FROM = 'bonjour@' + DOMAIN;

type Obj = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const resend = (path: string, init: RequestInit = {}) => fetch('https://api.resend.com' + path, {
  ...init, headers: { Authorization: 'Bearer ' + READ_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});
const str = (v: unknown) => (typeof v === 'string' ? v : '');
// « Awa <awa@mail.com> » → { name: 'Awa', email: 'awa@mail.com' }
function who(v: unknown): { name: string; email: string } {
  const s = str(v).trim();
  const m = s.match(/^(.*)<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (m) return { name: m[1].replace(/["\\]/g, '').trim(), email: m[2].toLowerCase() };
  return { name: '', email: /^[^\s<>]+@[^\s<>]+$/.test(s) ? s.toLowerCase() : '' };
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// each message goes through once: the insert fails on a message already passed on
async function first(id: string): Promise<boolean> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/jeere_mail_forwarded', {
    method: 'POST', headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ id })
  });
  return r.ok;
}
const forget = (id: string) => fetch(SUPABASE_URL + '/rest/v1/jeere_mail_forwarded?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } }).catch(() => null);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET || !RESEND_KEY) return json({ ok: false, code: 'config' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (x && typeof x === 'object') b = x as Obj; } catch { /* empty */ }
  if (b.type !== 'email.received') return json({ ok: true, skipped: 'type' });
  const data = (b.data && typeof b.data === 'object' ? b.data : {}) as Obj;
  const id = str(data.email_id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, code: 'id' }, 400);

  const r = await resend('/emails/receiving/' + id);
  if (!r.ok) return json({ ok: false, code: 'read', status: r.status }, r.status === 404 ? 404 : 502);
  const mail = await r.json() as Obj;
  const all = (Array.isArray(mail.to) ? mail.to : []).map((t) => who(t).email).filter(Boolean);
  let to = all.filter((e) => e.endsWith('@' + DOMAIN));
  let dest = FORWARD_TO;
  if (!to.length) {
    // another domain of the account: its own mailbox (public.mail_routes)
    const doms = [...new Set(all.map((e) => e.split('@')[1] ?? ''))].filter((d) => /^[a-z0-9.-]+$/.test(d));
    const routes = doms.length ? await fetch(SUPABASE_URL + '/rest/v1/mail_routes?select=domain,forward_to&domain=in.(' + doms.join(',') + ')', { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } })
      .then((x) => (x.ok ? x.json() : [])).catch(() => []) as { domain: string; forward_to: string }[] : [];
    const route = routes.find((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.forward_to));
    if (!route) return json({ ok: true, skipped: 'recipient' });
    to = all.filter((e) => e.endsWith('@' + route.domain));
    dest = route.forward_to;
  }
  if (!(await first(id))) return json({ ok: true, skipped: 'done' });

  const from = who(mail.from);
  const subject = str(mail.subject) || '(sans objet)';
  const head = 'De : ' + (from.name ? from.name + ' ' : '') + '<' + from.email + '>\nÀ : ' + to.join(', ');
  const text = head + '\n\n' + (str(mail.text) || '(message sans texte)');
  const html = str(mail.html)
    ? '<p style="font:13px/1.5 sans-serif;color:#5E5E5E;margin:0 0 16px">' + esc(head).replace('\n', '<br>') + '</p>' + str(mail.html)
    : undefined;
  // attachments: Resend fetches each one from its own download link
  let attachments: { filename: string; path: string }[] = [];
  try {
    const a = await resend('/emails/receiving/' + id + '/attachments');
    if (a.ok) {
      const j = await a.json() as { data?: Obj[] };
      attachments = (j.data ?? []).map((x) => ({ filename: str(x.filename) || 'piece-jointe', path: str(x.download_url) })).filter((x) => x.path).slice(0, 10);
    }
  } catch { /* the message goes without them */ }

  const send = (withFiles: boolean) => resend('/emails', {
    method: 'POST',
    body: JSON.stringify({
      from: '"' + (from.name || from.email || 'Message').replace(/[<>"\\\r\n]/g, '').slice(0, 70) + (dest === FORWARD_TO ? ' (via Jehre)' : '') + '" <' + (to[0] || FALLBACK_FROM) + '>',
      to: [dest], reply_to: from.email || undefined, subject, text, html,
      attachments: withFiles && attachments.length ? attachments : undefined
    })
  });
  let s = await send(true);
  if (!s.ok && attachments.length) s = await send(false);
  if (!s.ok) { await forget(id); return json({ ok: false, code: 'send', status: s.status, why: (await s.text().catch(() => '')).slice(0, 300) }, 502); }
  return json({ ok: true, forwarded: id, to: to[0], files: attachments.length });
});
