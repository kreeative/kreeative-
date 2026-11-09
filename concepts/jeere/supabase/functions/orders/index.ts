// Jeere — Edge Function `orders` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk).
//
// Places the orders of Jeere stores and sends their e-mails (like Shopify's notifications), with the
// templates each store edits in its dashboard (stores.notifications).
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/orders
//   headers: apikey: <publishable key>[, Authorization: Bearer <session> for the store's managers]
//   body: { action: 'place', slug, cart: { <productId>: qty }, customer: { name, phone, email, commune, address },
//           payment, note, source }                         → { ok, number, total, ... }       anyone (a buyer)
//         { action: 'status', orderId, status }             → updates it, sends « expédiée / livrée / annulée »  managers
//         { action: 'test', storeId, kind }                 → the template sent to the manager's own address    managers
//         { action: 'render', storeId, kind, template? }    → { subject, html } of a template, for the preview   managers
//         { action: 'defaults' }                            → the default templates                              anyone
//
// Prices, lines and delivery fees are recomputed here from the store's published fiche: what the browser
// sends is only which products and how many. E-mails go through Resend (secret RESEND_API_KEY) from
// « <store name> <commandes@kreeative.xyz> » with the shop's address as reply-to; without the secret the
// order is still recorded and the answer says the e-mails are waiting.
// Deployed with verify_jwt = false (the publishable key is not a JWT): sessions are checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS = Deno.env.get('ORDERS_FROM') ?? 'commandes@kreeative.xyz';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const int = (v: unknown, min: number, max: number, d = 0) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';

/* ------------------------------------------------------------------ the default templates */
export const KINDS = ['confirmation', 'nouvelle', 'expediee', 'livree', 'annulee'] as const;
type Kind = typeof KINDS[number];
const DEFAULTS: Record<Kind, { on: boolean; to: 'client' | 'boutique'; label: string; subject: string; body: string }> = {
  confirmation: {
    on: true, to: 'client', label: 'Confirmation de commande (au client)',
    subject: 'Votre commande {{commande.numero}} chez {{boutique.nom}}',
    body: 'Bonjour {{client.prenom}},\n\nMerci pour votre commande ! Nous l’avons bien reçue et nous la préparons.\n\n{{commande.articles}}\n\nLivraison : {{livraison.commune}}\nTotal : {{commande.total}}\nPaiement : {{paiement}}\n\nUne question ? Répondez simplement à cet e-mail.\n\n{{boutique.nom}}'
  },
  nouvelle: {
    on: true, to: 'boutique', label: 'Nouvelle commande (à la boutique)',
    subject: 'Nouvelle commande {{commande.numero}} · {{commande.total}}',
    body: 'Nouvelle commande {{commande.numero}} de {{client.nom}} ({{client.telephone}}).\n\n{{commande.articles}}\n\nLivraison : {{livraison.commune}}, {{livraison.adresse}}\nTotal : {{commande.total}}\nPaiement : {{paiement}}\nNote : {{commande.note}}\n\nRetrouvez-la dans votre tableau de bord Jeere.'
  },
  expediee: {
    on: true, to: 'client', label: 'Commande en route (au client)',
    subject: 'Votre commande {{commande.numero}} est en route',
    body: 'Bonjour {{client.prenom}},\n\nBonne nouvelle : votre commande {{commande.numero}} est partie. Le livreur vous appellera au {{client.telephone}}.\n\n{{boutique.nom}}'
  },
  livree: {
    on: false, to: 'client', label: 'Commande livrée (au client)',
    subject: 'Votre commande {{commande.numero}} est livrée',
    body: 'Bonjour {{client.prenom}},\n\nVotre commande {{commande.numero}} est livrée. Merci de votre confiance, à bientôt !\n\n{{boutique.nom}}'
  },
  annulee: {
    on: true, to: 'client', label: 'Commande annulée (au client)',
    subject: 'Votre commande {{commande.numero}} est annulée',
    body: 'Bonjour {{client.prenom}},\n\nVotre commande {{commande.numero}} a été annulée. Si c’est une erreur, répondez à cet e-mail.\n\n{{boutique.nom}}'
  }
};
function template(store: Obj, kind: Kind) {
  const all = isObj(store.notifications) ? store.notifications : {};
  const t = isObj(all[kind]) ? all[kind] as Obj : {};
  const d = DEFAULTS[kind];
  return {
    on: typeof t.on === 'boolean' ? t.on : d.on,
    subject: str(t.subject, 200) || d.subject,
    body: (typeof t.body === 'string' && t.body.trim() ? t.body.slice(0, 8000) : d.body)
  };
}

/* ------------------------------------------------------------------ rendering */
type Order = { number: number; customer: Obj; lines: { name: string; qty: number; amount: number }[]; subtotal: number; delivery_fee: number; total: number; payment: string; note: string };
function vars(store: Obj, o: Order) {
  const f = isObj(store.fiche) ? store.fiche : {};
  const st = isObj(f.store) ? f.store : {};
  const c = o.customer;
  const name = str(c.name, 80);
  return {
    'boutique.nom': str(st.name, 80) || str(store.slug, 40),
    'boutique.whatsapp': str(st.whatsapp, 30),
    'boutique.lien': 'https://jeere.kreeative.xyz/b/' + str(store.slug, 40),
    'client.nom': name, 'client.prenom': name.split(' ')[0] || name,
    'client.telephone': str(c.phone, 30), 'client.email': str(c.email, 120),
    'livraison.commune': str(c.commune, 60) || '—', 'livraison.adresse': str(c.address, 200) || '—',
    'commande.numero': '#' + o.number,
    'commande.total': money(o.total), 'commande.sous_total': money(o.subtotal), 'commande.livraison': money(o.delivery_fee),
    'commande.articles': o.lines.map((l) => '• ' + l.qty + ' × ' + l.name + ' — ' + money(l.amount)).join('\n'),
    'commande.note': o.note || '—',
    'paiement': o.payment || 'à la livraison'
  } as Record<string, string>;
}
const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m));
function accentOf(store: Obj) {
  const f = isObj(store.fiche) ? store.fiche : {};
  const th = isObj(f.theme) ? f.theme : {};
  const a = str((th as Obj).accent, 9) || str(((th as Obj).colors as Obj | undefined)?.accent, 9);
  return /^#[0-9a-f]{6}$/i.test(a) ? a : '#111111';
}
function html(store: Obj, subject: string, body: string) {
  const v = isObj(store.fiche) && isObj((store.fiche as Obj).store) ? (store.fiche as Obj).store as Obj : {};
  const name = esc(str(v.name, 80) || str(store.slug, 40));
  const logo = str(v.logo, 400);
  const accent = accentOf(store);
  const paras = esc(body).split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px 0;">' + p.replace(/\n/g, '<br>') + '</p>').join('');
  const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F4F2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:28px 14px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;">' +
    '<tr><td style="padding:26px 28px 8px 28px;border-bottom:3px solid ' + accent + ';">' +
    (/^https:\/\//.test(logo) ? '<img src="' + esc(logo) + '" alt="' + name + '" height="40" style="display:block;height:40px;width:auto;border:0;">' : '<div style="font:700 20px/26px ' + font + ';color:#111111;">' + name + '</div>') +
    '</td></tr><tr><td style="padding:22px 28px 6px 28px;font:400 15px/1.55 ' + font + ';color:#111111;">' + paras + '</td></tr>' +
    '<tr><td style="padding:10px 28px 26px 28px;font:400 12px/1.5 ' + font + ';color:#6E6E6E;">' + name + ' · boutique propulsée par Jeere</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function render(store: Obj, kind: Kind, o: Order, override?: Obj) {
  const t = override && isObj(override) ? { ...template(store, kind), subject: str(override.subject, 200) || template(store, kind).subject, body: typeof override.body === 'string' ? override.body.slice(0, 8000) : template(store, kind).body } : template(store, kind);
  const v = vars(store, o);
  const subject = fill(t.subject, v);
  const body = fill(t.body, v);
  return { on: t.on, subject, text: body, html: html(store, subject, body) };
}

/* ------------------------------------------------------------------ data */
const admin = (path: string, init: RequestInit = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
  ...init, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) }
});
async function rows(path: string) { const r = await admin(path); return r.ok ? await r.json() as Obj[] : []; }
async function userOf(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth) || auth.includes(PUBLISHABLE)) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && typeof u.id === 'string' ? { id: u.id, email: String(u.email ?? '') } : null;
}
async function canManage(store: Obj, userId: string) {
  if (store.owner === userId) return true;
  const m = await rows('store_members?select=user_id&store_id=eq.' + store.id + '&user_id=eq.' + userId);
  return m.length > 0;
}
async function ownerEmail(store: Obj) {
  if (typeof store.contact_email === 'string' && store.contact_email) return store.contact_email;
  if (typeof store.owner !== 'string') return '';
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + store.owner, { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } });
  if (!r.ok) return '';
  const u = await r.json();
  return String(u.email ?? '');
}
async function send(store: Obj, to: string, m: { subject: string; text: string; html: string }, replyTo: string) {
  if (!RESEND_KEY) return { ok: false, reason: 'no_key' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, reason: 'no_address' };
  const v = isObj(store.fiche) && isObj((store.fiche as Obj).store) ? (store.fiche as Obj).store as Obj : {};
  const name = (str(v.name, 60) || 'Boutique').replace(/[<>"]/g, '');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: name + ' <' + FROM_ADDRESS + '>', to: [to], subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  return { ok: r.ok, reason: r.ok ? '' : 'resend_' + r.status };
}

/* ------------------------------------------------------------------ the order, recomputed from the fiche */
function compute(fiche: Obj, cart: Obj, commune: string) {
  const prods = Array.isArray(fiche.products) ? fiche.products as Obj[] : [];
  const lines: { id: string; name: string; qty: number; price: number; amount: number }[] = [];
  Object.keys(cart).slice(0, 60).forEach((id) => {
    const p = prods.find((x) => x && x.id === id);
    if (!p || p.stock === 0 || p.available === false) return;
    const qty = int(cart[id], 1, 20, 1);
    const price = int(p.price, 0, 1e9, 0);
    lines.push({ id, name: str(p.name, 120) || 'Produit', qty, price, amount: price * qty });
  });
  let fee = 0, hasZones = false, zoneFound = false;
  const secs = Array.isArray(fiche.sections) ? fiche.sections as Obj[] : [];
  secs.forEach((s) => {
    if (!s || s.type !== 'delivery' || s.enabled === false || !isObj(s.settings) || !Array.isArray((s.settings as Obj).zones)) return;
    const zones = ((s.settings as Obj).zones as Obj[]).filter((x) => x && typeof x.name === 'string' && x.name);
    if (zones.length) hasZones = true;
    const z = zones.find((x) => x.name === commune);
    if (z) { fee = int(z.fee, 0, 1e7, 0); zoneFound = true; }
  });
  const subtotal = lines.reduce((n, l) => n + l.amount, 0);
  // a store with delivery zones: the commune must be one of them (no free delivery by typing another name)
  return { lines, subtotal, fee, total: subtotal + fee, zoneMissing: hasZones && !zoneFound };
}

/* ------------------------------------------------------------------ the handler */
const STATUSES = ['nouvelle', 'confirmee', 'preparee', 'expediee', 'livree', 'annulee'];
const SAMPLE: Order = { number: 1001, customer: { name: 'Awa Koné', phone: '+225 07 07 12 34 56', email: 'awa@example.com', commune: 'Cocody', address: 'Riviera 2, près de la pharmacie' }, lines: [{ name: 'Beurre de karité brut', qty: 2, amount: 13000 }, { name: 'Savon noir', qty: 1, amount: 3000 }], subtotal: 16000, delivery_fee: 1500, total: 17500, payment: 'Wave', note: '' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  let b: Obj = {};
  try { const x = await req.json(); if (isObj(x)) b = x; } catch { /* empty */ }
  const action = String(b.action ?? '');

  if (action === 'defaults') return json({ ok: true, kinds: KINDS, defaults: DEFAULTS, variables: Object.keys(vars({ slug: 'boutique', fiche: {} }, SAMPLE)), emails: !!RESEND_KEY });

  if (action === 'place') {
    const slug = str(b.slug, 40).toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return json({ ok: false, code: 'slug', message: 'Boutique introuvable.' }, 400);
    const st = (await rows('stores?select=id,slug,owner,fiche,notifications,contact_email,published&published=is.true&slug=eq.' + slug))[0];
    if (!st) return json({ ok: false, code: 'store', message: 'Boutique introuvable ou pas encore en ligne.' }, 404);
    const c = isObj(b.customer) ? b.customer : {};
    const customer = { name: str(c.name, 80), phone: str(c.phone, 30), email: str(c.email, 120).toLowerCase(), commune: str(c.commune, 60), address: str(c.address, 200) };
    if (!customer.name || customer.phone.replace(/\D/g, '').length < 8) return json({ ok: false, code: 'customer', message: 'Votre nom et un numéro de téléphone sont nécessaires.' }, 400);
    const fiche = isObj(st.fiche) ? st.fiche : {};
    const o = compute(fiche, isObj(b.cart) ? b.cart : {}, customer.commune);
    if (!o.lines.length) return json({ ok: false, code: 'empty', message: 'Le panier est vide.' }, 400);
    if (o.zoneMissing) return json({ ok: false, code: 'commune', message: 'Choisissez votre commune de livraison dans la liste.' }, 400);
    // a little brake on robots: 3 orders per number per store in 10 minutes, 30 per store
    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const recent = await rows('orders?select=customer&store_id=eq.' + st.id + '&created_at=gte.' + encodeURIComponent(since) + '&limit=40');
    const digitsOf = (x: unknown) => String(x ?? '').replace(/\D/g, '').slice(-8);
    if (recent.length >= 30 || recent.filter((r) => isObj(r.customer) && digitsOf((r.customer as Obj).phone) === digitsOf(customer.phone)).length >= 3) {
      return json({ ok: false, code: 'rate', message: 'Trop de commandes en peu de temps. Réessayez dans quelques minutes, ou écrivez à la boutique.' }, 429);
    }
    const numR = await admin('rpc/jeere_next_order_number', { method: 'POST', body: JSON.stringify({ p_store: st.id }) });
    const number = numR.ok ? Number(await numR.json()) : NaN;
    if (!isFinite(number)) return json({ ok: false, code: 'server', message: 'La commande n’a pas pu être enregistrée.' }, 500);
    // the payment and the source are chosen from lists (a free text could read « Payé » to the seller)
    const PAYS = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Paiement à la livraison', 'Carte bancaire'];
    const pay = str(b.payment, 40);
    const order: Order & Obj = { number, customer, lines: o.lines, subtotal: o.subtotal, delivery_fee: o.fee, total: o.total, payment: PAYS.includes(pay) ? pay : '', note: str(b.note, 1000) };
    const ins = await admin('orders', { method: 'POST', body: JSON.stringify({ store_id: st.id, ...order, source: b.source === 'site' ? 'site' : 'boutique' }) });
    if (!ins.ok) return json({ ok: false, code: 'server', message: 'La commande n’a pas pu être enregistrée.' }, 500);
    const saved = (await ins.json())[0] as Obj;
    // the e-mails: the client (if an address was given) and the shop
    const shop = await ownerEmail(st);
    const sent: Obj[] = [];
    const rc = render(st, 'confirmation', order);
    // the buyer may answer the shop's PUBLIC contact address only, never its private log-in address
    const publicReply = typeof st.contact_email === 'string' ? st.contact_email : '';
    if (rc.on && customer.email) sent.push({ kind: 'confirmation', to: customer.email, at: new Date().toISOString(), ...(await send(st, customer.email, rc, publicReply)) });
    const rn = render(st, 'nouvelle', order);
    if (rn.on && shop) sent.push({ kind: 'nouvelle', to: shop, at: new Date().toISOString(), ...(await send(st, shop, rn, customer.email)) });
    if (sent.length) await admin('orders?id=eq.' + saved.id, { method: 'PATCH', body: JSON.stringify({ emails: sent }) });
    return json({ ok: true, number, orderId: saved.id, total: o.total, subtotal: o.subtotal, fee: o.fee, lines: o.lines, emails: sent.map((x) => ({ kind: x.kind, ok: x.ok })), emailsReady: !!RESEND_KEY });
  }

  // everything else: the store's managers
  const user = await userOf(req);
  if (!user) return json({ ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere.' }, 401);

  if (action === 'status') {
    const oid = str(b.orderId, 40);
    if (!/^[0-9a-f-]{36}$/i.test(oid)) return json({ ok: false, code: 'order', message: 'Commande introuvable.' }, 404);
    const o = (await rows('orders?select=*&id=eq.' + oid))[0];
    const status = str(b.status, 20);
    if (!o || !STATUSES.includes(status)) return json({ ok: false, code: 'order', message: 'Commande introuvable.' }, 404);
    const st = (await rows('stores?select=id,slug,owner,fiche,notifications,contact_email&id=eq.' + o.store_id))[0];
    if (!st || !(await canManage(st, user.id))) return json({ ok: false, code: 'forbidden', message: 'Cette commande n’est pas à vous.' }, 403);
    const upd = await admin('orders?id=eq.' + o.id, { method: 'PATCH', body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    if (!upd.ok) return json({ ok: false, code: 'server' }, 500);
    const sent: Obj[] = Array.isArray(o.emails) ? o.emails as Obj[] : [];
    const c = isObj(o.customer) ? o.customer : {};
    if ((status === 'expediee' || status === 'livree' || status === 'annulee') && typeof c.email === 'string' && c.email && !sent.some((x) => x.kind === status)) {
      const m = render(st, status as Kind, o as unknown as Order);
      if (m.on) {
        sent.push({ kind: status, to: c.email, at: new Date().toISOString(), ...(await send(st, c.email as string, m, typeof st.contact_email === 'string' ? st.contact_email : '')) });
        await admin('orders?id=eq.' + o.id, { method: 'PATCH', body: JSON.stringify({ emails: sent }) });
      }
    }
    return json({ ok: true, status, emails: sent });
  }

  if (action === 'test' || action === 'render') {
    const sid = str(b.storeId, 40);
    if (!/^[0-9a-f-]{36}$/i.test(sid)) return json({ ok: false, code: 'forbidden', message: 'Boutique introuvable.' }, 403);
    const st = (await rows('stores?select=id,slug,owner,fiche,notifications,contact_email&id=eq.' + sid))[0];
    if (!st || !(await canManage(st, user.id))) return json({ ok: false, code: 'forbidden', message: 'Boutique introuvable.' }, 403);
    const kind = (KINDS as readonly string[]).includes(String(b.kind)) ? b.kind as Kind : 'confirmation';
    const m = render(st, kind, SAMPLE, isObj(b.template) ? b.template : undefined);
    if (action === 'render') return json({ ok: true, subject: m.subject, html: m.html, text: m.text });
    const r = await send(st, user.email, { ...m, subject: '[Test] ' + m.subject }, '');
    return json({ ok: r.ok, to: user.email, reason: r.reason, message: r.ok ? 'E-mail de test envoyé à ' + user.email + '.' : (r.reason === 'no_key' ? 'L’envoi des e-mails n’est pas encore branché (clé Resend).' : 'L’e-mail n’a pas pu partir.') });
  }

  return json({ ok: false, code: 'action' }, 400);
});
