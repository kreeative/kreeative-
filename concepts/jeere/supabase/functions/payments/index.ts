// Jeere — Edge Function `payments` (Supabase project « Jeere », ref aezchxfvzfoqlvzchqyk): card payments with
// Stripe Connect. Each store connects its own Stripe account (Accounts v2, « full » dashboard: her own Stripe); the
// customer pays by card on Stripe's page, in FCFA (Stripe converts for a card from anywhere: Canada, France,
// the United States…), and the money is paid out by Stripe to the store's account, never to Jeere.
//
//   POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/payments
//   headers: apikey: <publishable key>[, Authorization: Bearer <session> for the store's managers]
//   body: { action: 'status', storeId }                 → { ok, configured, connected, chargesEnabled, ... }   managers
//         { action: 'connect', storeId, country }       → { ok, url }  Stripe's onboarding page (create, or finish)  managers
//         { action: 'dashboard', storeId }              → { ok, url }  the seller's own Stripe dashboard        managers
//         { action: 'disconnect', storeId }             → { ok }  forgets the account here (Stripe keeps it)       managers
//         { action: 'available', slug }                 → { ok, card }  does this store take cards?                anyone
//         { action: 'checkout', orderId, returnUrl }    → { ok, url }  Stripe Checkout for an order of the `orders`
//                                                         function (prices from the order, never from the browser) anyone
//   Stripe's webhook (Connect events) POSTs here with a Stripe-Signature header: checkout.session.completed /
//   async_payment_succeeded mark the order paid (orders.payment_status 'payee'), …expired / async_payment_failed
//   'echouee'; account.updated refreshes store_payments.
//
// Secrets (Supabase › Edge Functions › Secrets): STRIPE_SECRET_KEY (Jeere's platform key, sk_test_… to try it),
// STRIPE_WEBHOOK_SECRET (the Connect webhook endpoint's whsec_…). Optional: JEERE_CARD_FEE_PCT (Jeere's
// commission on card sales, 0 by default), JEERE_SITE (https://jeere.kreeative.xyz).
// Deployed with verify_jwt = false (the publishable key is not a JWT; Stripe sends no JWT): checked here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aezchxfvzfoqlvzchqyk.supabase.co';
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w';
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { return ''; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const FEE_PCT = Math.max(0, Math.min(20, Number(Deno.env.get('JEERE_CARD_FEE_PCT') ?? '0') || 0));
const SITE = (Deno.env.get('JEERE_SITE') ?? 'https://jeere.kreeative.xyz').replace(/\/$/, '');
// Countries where a store's Stripe account can be opened (Stripe Connect Express)
const COUNTRIES = ['CA', 'US', 'FR', 'BE', 'CH', 'GB', 'DE', 'ES', 'IT', 'NL', 'PT', 'IE', 'LU'];

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_CONFIGURED = 'Le paiement par carte n’est pas encore activé sur Jeere : réessayez bientôt.';

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
async function payRow(storeId: string) { return (await rows('store_payments?select=*&store_id=eq.' + storeId))[0] ?? null; }
// A Stripe account (Accounts v2: configuration.merchant.capabilities, identity.country) or a v1 one
function cardStatus(acct: Obj): { charges: boolean; payouts: boolean; country: string } {
  const conf = isObj(acct.configuration) ? acct.configuration as Obj : null;
  const merchant = conf && isObj(conf.merchant) ? conf.merchant as Obj : null;
  const caps = merchant && isObj(merchant.capabilities) ? merchant.capabilities as Obj : null;
  const st = (k: string) => (caps && isObj(caps[k]) ? String((caps[k] as Obj).status ?? '') : '');
  const identity = isObj(acct.identity) ? acct.identity as Obj : {};
  if (caps) {
    const sb = isObj(caps.stripe_balance) ? caps.stripe_balance as Obj : null;
    const payouts = sb && isObj(sb.payouts) ? String((sb.payouts as Obj).status ?? '') === 'active' : false;
    return { charges: st('card_payments') === 'active', payouts, country: str(identity.country, 2).toUpperCase() };
  }
  return { charges: acct.charges_enabled === true, payouts: acct.payouts_enabled === true, country: str(acct.country, 2).toUpperCase() };
}
async function savePayRow(storeId: string, acct: Obj) {
  const cs = cardStatus(acct);
  const row = {
    store_id: storeId, provider: 'stripe', account_id: String(acct.id), country: cs.country,
    charges_enabled: cs.charges, payouts_enabled: cs.payouts,
    details_submitted: cs.charges, updated_at: new Date().toISOString()
  };
  await admin('store_payments?on_conflict=store_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return row;
}

/* ------------------------------------------------------------------ Stripe (its REST API, form-encoded) */
function form(o: Obj, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + '[' + k + ']' : k;
    if (Array.isArray(v)) v.forEach((x, i) => { if (isObj(x)) out.push(...form(x, key + '[' + i + ']')); else out.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(String(x))); });
    else if (isObj(v)) out.push(...form(v, key));
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out;
}
async function stripe(method: string, path: string, body?: Obj, account?: string): Promise<{ ok: boolean; status: number; data: Obj }> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + STRIPE_KEY, 'Stripe-Version': '2024-06-20' };
  if (account) headers['Stripe-Account'] = account;
  let url = 'https://api.stripe.com/v1/' + path;
  let payload: string | undefined;
  if (body && method === 'GET') url += '?' + form(body).join('&');
  else if (body) { payload = form(body).join('&'); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const r = await fetch(url, { method, headers, body: payload });
  let data: Obj = {};
  try { data = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, data };
}
// Accounts v2 (JSON): the store's account and its onboarding links
const V2 = '2026-10-28.endive';
async function stripeV2(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Obj }> {
  const r = await fetch('https://api.stripe.com/v2/' + path, { method, headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Stripe-Version': V2, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data: Obj = {};
  try { data = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, data };
}
const getAccount = (id: string) => stripeV2('GET', 'core/accounts/' + id + '?include[0]=configuration.merchant&include[1]=identity');
const stripeError = (d: Obj) => (isObj(d.error) ? str(d.error.message, 300) : '') || 'Stripe a refusé la demande.';

// Stripe-Signature: t=<time>,v1=<hex hmac of "t.payload">
async function verify(payload: string, header: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && s.split('').reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

/* ------------------------------------------------------------------ the webhook */
async function webhook(req: Request) {
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('Stripe-Signature') ?? ''))) return json({ ok: false, code: 'signature' }, 400);
  let ev: Obj = {};
  try { ev = JSON.parse(payload); } catch { return json({ ok: false }, 400); }
  const type = String(ev.type ?? '');
  const obj = isObj(ev.data) && isObj((ev.data as Obj).object) ? (ev.data as Obj).object as Obj : {};
  if (type === 'account.updated' && typeof obj.id === 'string') {
    const r = (await rows('store_payments?select=store_id&account_id=eq.' + encodeURIComponent(obj.id)))[0];
    if (r) await savePayRow(String(r.store_id), obj);
    return json({ ok: true });
  }
  if (type.startsWith('checkout.session.')) {
    const md = isObj(obj.metadata) ? obj.metadata : {};
    const orderId = str(md.order_id, 40);
    if (!UUID.test(orderId)) return json({ ok: true });
    let status = '';
    if ((type === 'checkout.session.completed' && obj.payment_status === 'paid') || type === 'checkout.session.async_payment_succeeded') status = 'payee';
    else if (type === 'checkout.session.async_payment_failed' || type === 'checkout.session.expired') status = 'echouee';
    if (!status) return json({ ok: true });
    const o = (await rows('orders?select=id,payment_status,status&id=eq.' + orderId))[0];
    if (!o || o.payment_status === 'payee') return json({ ok: true });
    const patch: Obj = { payment_status: status, payment_ref: str(obj.id, 120), updated_at: new Date().toISOString() };
    if (status === 'payee') { patch.paid_at = new Date().toISOString(); if (o.status === 'nouvelle') patch.status = 'confirmee'; }
    await admin('orders?id=eq.' + orderId, { method: 'PATCH', body: JSON.stringify(patch) });
    return json({ ok: true });
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------------ the handler */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if (!SECRET) return json({ ok: false, code: 'config', message: 'Clé serveur absente.' }, 500);
  if (req.headers.get('Stripe-Signature')) return webhook(req);
  let b: Obj = {};
  try { const x = await req.json(); if (isObj(x)) b = x; } catch { /* empty */ }
  const action = String(b.action ?? '');

  // does this store take cards? (the checkout asks before offering the card)
  if (action === 'available') {
    const slug = str(b.slug, 40).toLowerCase();
    const st = (await rows('stores?select=id&published=is.true&slug=eq.' + encodeURIComponent(slug)))[0];
    let p = st ? await payRow(String(st.id)) : null;
    if (STRIPE_KEY && p && !p.charges_enabled && Date.now() - Date.parse(String(p.updated_at)) > 60000) {
      const r = await getAccount(String(p.account_id));
      if (r.ok) p = await savePayRow(String(st.id), r.data);
    }
    return json({ ok: true, card: !!(STRIPE_KEY && p && p.charges_enabled) });
  }

  // a buyer pays an order placed by the `orders` function
  if (action === 'checkout') {
    if (!STRIPE_KEY) return json({ ok: false, code: 'config', message: NOT_CONFIGURED }, 503);
    const orderId = str(b.orderId, 40);
    if (!UUID.test(orderId)) return json({ ok: false, code: 'order', message: 'Commande introuvable.' }, 400);
    const o = (await rows('orders?select=*&id=eq.' + orderId))[0];
    if (!o) return json({ ok: false, code: 'order', message: 'Commande introuvable.' }, 404);
    if (o.payment_status === 'payee') return json({ ok: false, code: 'paid', message: 'Cette commande est déjà payée.' }, 409);
    const st = (await rows('stores?select=id,slug,fiche&id=eq.' + o.store_id))[0];
    const p = st ? await payRow(String(st.id)) : null;
    if (!st || !p || !p.charges_enabled) return json({ ok: false, code: 'not_connected', message: 'Cette boutique ne prend pas encore les cartes.' }, 409);
    const fiche = isObj(st.fiche) ? st.fiche : {};
    const storeName = str(isObj(fiche.store) ? (fiche.store as Obj).name : '', 60) || 'Boutique Jeere';
    const lines = (Array.isArray(o.lines) ? o.lines as Obj[] : []).filter(isObj);
    const items: Obj[] = lines.map((l) => ({
      quantity: Math.max(1, Math.round(Number(l.qty) || 1)),
      price_data: { currency: 'xof', unit_amount: Math.max(0, Math.round(Number(l.price ?? (Number(l.amount) / Math.max(1, Number(l.qty) || 1))) || 0)), product_data: { name: str(l.name, 120) || 'Produit' } }
    }));
    const fee = Math.round(Number(o.delivery_fee) || 0);
    if (fee > 0) items.push({ quantity: 1, price_data: { currency: 'xof', unit_amount: fee, product_data: { name: 'Livraison' } } });
    const total = Math.round(Number(o.total) || 0);
    if (!items.length || total <= 0) return json({ ok: false, code: 'empty', message: 'Le panier est vide.' }, 400);
    // back to the store: its own page (or the seller's site, when the order came from it)
    const back = /^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(str(b.returnUrl, 300)) ? str(b.returnUrl, 300) : SITE + '/b/' + st.slug + '/';
    const sep = back.includes('?') ? '&' : '?';
    const customer = isObj(o.customer) ? o.customer : {};
    const session: Obj = {
      mode: 'payment',
      line_items: items,
      success_url: back + sep + 'paiement=ok&commande=' + o.number,
      cancel_url: back + sep + 'paiement=annule&commande=' + o.number,
      metadata: { order_id: orderId, store_id: String(st.id), number: String(o.number) },
      payment_intent_data: {
        description: storeName + ' · commande n° ' + o.number,
        metadata: { order_id: orderId, number: String(o.number) },
        ...(FEE_PCT > 0 ? { application_fee_amount: Math.round(total * FEE_PCT / 100) } : {})
      },
      locale: 'fr'
    };
    if (typeof customer.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) session.customer_email = customer.email;
    const r = await stripe('POST', 'checkout/sessions', session, String(p.account_id));
    if (!r.ok) return json({ ok: false, code: 'stripe', message: stripeError(r.data) }, 502);
    await admin('orders?id=eq.' + orderId, { method: 'PATCH', body: JSON.stringify({ payment_status: 'en_attente', payment_ref: str(r.data.id, 120), payment: 'Carte bancaire', updated_at: new Date().toISOString() }) });
    return json({ ok: true, url: r.data.url });
  }

  // everything else: the store's managers
  const user = await userOf(req);
  if (!user) return json({ ok: false, code: 'login', message: 'Connectez-vous à votre compte Jeere.' }, 401);
  const storeId = str(b.storeId, 40);
  if (!UUID.test(storeId)) return json({ ok: false, code: 'store', message: 'Boutique introuvable.' }, 400);
  const st = (await rows('stores?select=id,slug,owner,fiche,contact_email&id=eq.' + storeId))[0];
  if (!st || !(await canManage(st, user.id))) return json({ ok: false, code: 'forbidden', message: 'Cette boutique n’est pas à vous.' }, 403);
  let p = await payRow(storeId);

  if (action === 'status') {
    if (STRIPE_KEY && p) {
      const r = await getAccount(String(p.account_id));
      if (r.ok) p = await savePayRow(storeId, r.data);
    }
    return json({ ok: true, configured: !!STRIPE_KEY, countries: COUNTRIES, connected: !!p, accountId: p ? p.account_id : '', country: p ? p.country : '',
      chargesEnabled: !!(p && p.charges_enabled), payoutsEnabled: !!(p && p.payouts_enabled), detailsSubmitted: !!(p && p.details_submitted) });
  }

  if (!STRIPE_KEY) return json({ ok: false, code: 'config', message: NOT_CONFIGURED }, 503);

  if (action === 'connect') {
    if (!p) {
      const country = str(b.country, 2).toUpperCase();
      if (!COUNTRIES.includes(country)) return json({ ok: false, code: 'country', message: 'Choisissez le pays où votre activité est enregistrée.' }, 400);
      const fiche = isObj(st.fiche) ? st.fiche : {};
      const name = str(isObj(fiche.store) ? (fiche.store as Obj).name : '', 60) || 'Boutique Jeere';
      // The seller's own Stripe account (her full Stripe dashboard): Stripe collects its fees and covers the
      // losses with her, as with a standard Stripe account; she onboards on Stripe's page
      const r = await stripeV2('POST', 'core/accounts', {
        contact_email: user.email || undefined, display_name: name,
        identity: { country: country.toLowerCase() },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
        dashboard: 'full', metadata: { store_id: storeId, slug: String(st.slug) },
        include: ['configuration.merchant', 'identity']
      });
      if (!r.ok) return json({ ok: false, code: 'stripe', message: stripeError(r.data) }, 502);
      p = await savePayRow(storeId, r.data);
    }
    const back = SITE + '/admin/#paiements';
    const link = await stripeV2('POST', 'core/account_links', { account: p.account_id, use_case: { type: 'account_onboarding', account_onboarding: { return_url: back + '?stripe=retour', refresh_url: back + '?stripe=relancer' } } });
    if (!link.ok) return json({ ok: false, code: 'stripe', message: stripeError(link.data) }, 502);
    return json({ ok: true, url: link.data.url });
  }

  if (action === 'dashboard') {
    // a « full » account: the seller signs in to her own Stripe dashboard
    if (!p) return json({ ok: false, code: 'not_connected', message: 'Connectez d’abord Stripe.' }, 409);
    return json({ ok: true, url: 'https://dashboard.stripe.com/' });
  }

  if (action === 'disconnect') {
    await admin('store_payments?store_id=eq.' + storeId, { method: 'DELETE' });
    return json({ ok: true });
  }

  return json({ ok: false, code: 'action', message: 'Action inconnue.' }, 400);
});
