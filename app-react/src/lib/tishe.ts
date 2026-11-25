'use client';

import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

/* The Ivory Sukundu (theivorysukundu.com) inside the Jehre dashboard. The store keeps its own data (Stripe orders,
   products, codes, the announcement bar, shipping rates) and its own API: nothing is copied into Jehre, every
   change is saved there, on the live shop. Same keys as the classic dashboard (../admin/tishe.js), so a session
   opened in one is open in the other:
     'jeere-tishe-auth' = { token, expiresAt, email, userId }  (30 days, for ONE Jehre account)
     'jeere-ext' = 'tishe' while this store is the one in view.
   Who sees it: the founder (sites-publish « whoami ») and the partners listed in public.ext_store_access. */

export const TISHE = {
  name: 'The Ivory Sukundu',
  url: 'theivorysukundu.com',
  site: 'https://www.theivorysukundu.com',
  thumb: 'https://jehre.com/studio/sites/thumbs/live--the-ivory-sukundu.webp',
  owner: 'hello@theivorysukundu.com',
};
const API = 'https://www.theivorysukundu.com/api/admin';
const K_ON = 'jeere-ext', K_AUTH = 'jeere-tishe-auth';

export interface TisheAuth { token: string; expiresAt?: number; email?: string; userId: string }

const ls = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* not kept */ } },
  del: (k: string) => { try { window.localStorage.removeItem(k); } catch { /* nothing kept */ } },
};

export const tisheOn = (): boolean => ls.get(K_ON) === 'tishe';
export const tisheEnter = (): void => ls.set(K_ON, 'tishe');
export const tisheLeave = (): void => ls.del(K_ON);

/** The session of this Jehre account with the store, if any (another account's is forgotten). */
export function tisheAuth(userId: string): TisheAuth | null {
  try {
    const a = JSON.parse(ls.get(K_AUTH) ?? 'null') as TisheAuth | null;
    if (!a || !a.token || (a.expiresAt && a.expiresAt <= Date.now())) return null;
    if (a.userId !== userId) { ls.del(K_AUTH); return null; }
    return a;
  } catch { return null; }
}
const keep = (j: { token: string; expiresAt?: number; email?: string }, userId: string) => ls.set(K_AUTH, JSON.stringify({ token: j.token, expiresAt: j.expiresAt, email: j.email, userId }));
export const tisheForget = (): void => ls.del(K_AUTH);

// the store's own messages are in English: the common ones in French
const FR: Record<string, string> = {
  'The product needs a name.': 'Le produit a besoin d’un nom.',
  'The product needs at least one option to buy.': 'Le produit a besoin d’au moins une option à acheter.',
  'Upload a JPEG photo.': 'Choisissez une photo JPEG.',
  'Check the sale end date.': 'Vérifiez la date de fin des soldes.',
  'Please sign in again.': 'Reconnectez-vous.',
  'This email no longer has access.': 'Cette adresse n’a plus accès au tableau de bord.',
};

export class TisheError extends Error { constructor(message: string, readonly expired = false) { super(message); } }

/** One call to the store's API. A 401 forgets the session (she signs in again). */
export async function tisheCall<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}, userId = ''): Promise<T> {
  const a = userId ? tisheAuth(userId) : null;
  let r: Response;
  try {
    r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(a ? { Authorization: `Bearer ${a.token}` } : {}) }, body: JSON.stringify({ action, ...body }) });
  } catch { throw new TisheError('La boutique ne répond pas pour le moment. Réessayez dans un instant.'); }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (r.status === 401) { tisheForget(); throw new TisheError('Reconnectez-vous : la session a expiré.', true); }
  if (!r.ok) throw new TisheError(FR[j.error ?? ''] || j.error || 'La boutique n’a pas répondu. Réessayez.');
  return j;
}

/** Her Jehre account is enough: the store checks her Jehre session and opens a 30-day session (action « jeere »). */
export async function tisheConnect(userId: string): Promise<boolean> {
  if (tisheAuth(userId)) return true;
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try { keep(await tisheCall<{ token: string; expiresAt?: number; email?: string }>('jeere', { accessToken: token }), userId); return true; } catch { return false; }
}
/** The link of the e-mail (/admin/#tishe=<token>) swapped for a 30-day session. */
export async function tisheRedeem(token: string, userId: string): Promise<void> {
  keep(await tisheCall<{ token: string; expiresAt?: number; email?: string }>('redeem', { token }), userId);
}
/** The store e-mails a sign-in link to the address that manages it (it works 24 hours). */
export async function tisheLink(email: string): Promise<void> { await tisheCall('link', { email, to: 'jeere' }); }

/** Does this account see The Ivory Sukundu? The founder (her account) and the partners the store lists. Asked once
 *  per tab and kept (the same keys as the classic dashboard). */
export async function tisheAllowed(userId: string): Promise<boolean> {
  const cached = (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } };
  const remember = (k: string, yes: boolean) => { try { window.sessionStorage.setItem(k, `${yes ? 1 : 0}:${userId}`); } catch { /* asked again next time */ } };
  if (cached('jeere-sites-editor') === `1:${userId}` || cached('jeere-ext-stores') === `1:${userId}`) return true;
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  const [editor, partner] = await Promise.all([
    cached('jeere-sites-editor') === `0:${userId}` ? Promise.resolve(false)
      : fetch(`${SUPABASE_URL}/functions/v1/sites-publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'whoami' }) })
        .then((r) => r.json()).then((j: { editor?: boolean }) => { remember('jeere-sites-editor', !!j?.editor); return !!j?.editor; }).catch(() => false),
    cached('jeere-ext-stores') === `0:${userId}` ? Promise.resolve(false)
      : Promise.resolve(supabase().rpc('my_ext_stores')).then(({ data: list }) => { const yes = Array.isArray(list) && list.includes('tishe'); remember('jeere-ext-stores', yes); return yes; }, () => false),
  ]);
  return editor || partner;
}

/* ------------------------------------------------------------------ what the store sends */

export type TisheStatus = 'new' | 'ordered' | 'shipped' | 'delivered' | 'cancelled';
export const TISHE_STATUS: Record<TisheStatus, [string, 'warn' | 'info' | 'ok' | 'muted']> = {
  new: ['À commander', 'warn'], ordered: ['Commandée au fournisseur', 'info'], shipped: ['Expédiée', 'ok'], delivered: ['Livrée', 'ok'], cancelled: ['Annulée', 'muted'],
};
export interface TisheAddress { name?: string; line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }
export interface TisheOrderRow {
  id: string; number?: string | number; name?: string; email?: string; status: TisheStatus; total: number; currency?: string; createdAt: string;
  shipping?: TisheAddress | null; country?: string; refunded?: boolean; settled?: number;
}
export interface TisheOverview {
  stats: { todo: { toOrder: number; awaitingTracking: number } };
  setup?: { stripe?: boolean; testMode?: boolean; webhook?: boolean; resend?: boolean };
  orders: TisheOrderRow[];
}
export interface TisheOrder extends TisheOrderRow {
  items?: { title: string; variant?: string; quantity: number; unitAmount?: number; total: number; image?: string }[];
  subtotal?: number; discount?: number; code?: string; shippingAmount?: number; tax?: number; taxLabel?: string; payment?: string;
  refundedAmount?: number; net?: number; fee?: number; paid?: boolean; readOnly?: boolean; phone?: string; billing?: TisheAddress | null;
  supplierRef?: string; carrier?: string; tracking?: string; trackingNumbers?: string[]; trackingUrl?: string; note?: string; shippedAt?: string;
  stripeUrl?: string; timeline?: { title: string; detail?: string; at?: string }[];
}
export interface TisheOrderDetail { order: TisheOrder; supplierMessages?: { name: string; message: string }[] }
export interface TisheLegacy { number: string; createdAt: string; total: number; items: number; href: string; out: boolean }

// The orders of the old Shopify store (July–September 2026), before the site took its own payments: numbers, dates
// and totals only (no names in this public file). Once the shop serves them in full (legacyOrders), those are used.
const SHOPIFY_ADMIN = 'https://shop.theivorysukundu.com/admin/orders/';
export const SHOPIFY_ORDERS: TisheLegacy[] = [
  { number: '1003', createdAt: '2026-09-21T11:15:00Z', total: 268.86, items: 3, href: SHOPIFY_ADMIN + '7178473734309', out: true },
  { number: '1002', createdAt: '2026-08-09T18:21:44Z', total: 419, items: 1, href: SHOPIFY_ADMIN + '6841148833957', out: true },
  { number: '1001', createdAt: '2026-07-29T16:34:51Z', total: 0, items: 1, href: SHOPIFY_ADMIN + '6821078991013', out: true },
];

const CAD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
const USD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD' });
/** cents → « 268,86 $ » (USD when the order was paid in US dollars) */
export const cents = (n: number | undefined, cur?: string): string => (cur && cur.toUpperCase() === 'USD' ? USD : CAD).format((Number(n) || 0) / 100);
export const dollars = (n: number): string => CAD.format(Number(n) || 0);
export const tisheImg = (u: string | undefined): string => { const s = String(u || ''); return s.startsWith('/') ? TISHE.site + s : s; };

/** The founder (sites-publish « whoami »: her e-mail is an editor of the sites): her websites and the Studio's
 *  « Mes sites » are hers. Asked once per tab, with the same key as tisheAllowed. */
export async function sitesEditor(userId: string): Promise<boolean> {
  if (!userId) return false;
  try { const c = window.sessionStorage.getItem('jeere-sites-editor'); if (c === `1:${userId}`) return true; if (c === `0:${userId}`) return false; } catch { /* asked below */ }
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/sites-publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'whoami' }) });
    const yes = !!((await r.json()) as { editor?: boolean })?.editor;
    try { window.sessionStorage.setItem('jeere-sites-editor', `${yes ? 1 : 0}:${userId}`); } catch { /* asked again next time */ }
    return yes;
  } catch { return false; }
}
