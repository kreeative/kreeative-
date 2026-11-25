import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
import { payCurrency } from './zone';

/* Subscriptions and domain names. Every payment goes through Stripe, opened by the `billing` function (the only
   place that knows the prices and the Stripe key); a domain is connected by the `domains` function (the only place
   that can add a name to Jehre's hosting). The browser never sees a key and never sets a price. */

export interface Plan { id: string; name: string; month: number; /** outside the franc CFA zones, Canadian dollar cents (billing's CAD_PLAN) */ cad: number; week: number | null; orders: number | null; fee: number; forWho: string; recommended?: boolean; live?: boolean }
/** The store plans (the grid of 24 Nov 2026), per month. The server (`billing`) charges its own copy of these prices.
 *  « En direct » comes from the 3rd plan up (Pro). There is no free plan any more. */
export const PLANS: Plan[] = [
  { id: 'essentiel', name: 'Essentiel', month: 3500, cad: 900, week: null, orders: 10, fee: 1, forWho: 'Pour vos premières ventes' },
  { id: 'croissance', name: 'Croissance', month: 7500, cad: 1900, week: null, orders: 30, fee: 0, forWho: 'Pour les vendeurs actifs sur les réseaux', recommended: true },
  { id: 'pro', name: 'Pro', month: 15000, cad: 3900, week: null, orders: 80, fee: 0, forWho: 'Pour les marques qui grandissent', live: true },
  { id: 'business', name: 'Business', month: 30000, cad: 7500, week: null, orders: 200, fee: 0, forWho: 'Pour les boutiques installées', live: true },
  { id: 'entreprise', name: 'Entreprise', month: 60000, cad: 14900, week: null, orders: null, fee: 0, forWho: 'Pour les grandes boutiques', live: true },
];
/** A store with no plan yet (the old free plan, 'gratuit' in the base): she must choose one. */
export const NO_PLAN: Plan = { id: 'gratuit', name: 'Aucune formule', month: 0, cad: 0, week: null, orders: 0, fee: 0, forWho: '' };
export const PLAN_FEATURES = [
  'Toutes les fonctions : boutique, paiements, commandes WhatsApp, livraison, codes promo, avis clients',
  'Une vraie personne qui vous répond sur WhatsApp, en français',
  'Pause ou arrêt en un clic, rien n’est prélevé sans vous',
];
export const planOf = (id: string | null | undefined): Plan => PLANS.find((p) => p.id === id) ?? NO_PLAN;
export const hasPlan = (id: string | null | undefined): boolean => PLANS.some((p) => p.id === id);

/** The orders of the month count against the plan: EVERY order the store received this calendar month (WhatsApp,
 *  on delivery, Wave or card), as the dashboard shows them. Nothing is blocked; she is told when to move up. */
export async function monthOrders(storeId: string): Promise<number | null> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase().from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId).gte('created_at', start.toISOString());
  return error ? null : count ?? 0;
}
/** Where she stands: the limit of her plan, and the smallest plan that holds this many orders. */
export function usage(planId: string | null | undefined, n: number): { limit: number | null; level: 'ok' | 'near' | 'over'; next: Plan | null } {
  const p = PLANS.find((x) => x.id === planId);
  const limit = p ? p.orders : null;
  const level = limit === null ? 'ok' : n > limit ? 'over' : n >= Math.ceil(limit * 0.8) ? 'near' : 'ok';
  const next = PLANS.find((x) => x.orders === null || x.orders >= Math.max(n, (limit ?? 0) + 1)) ?? null;
  return { limit, level, next };
}

export type Answer<T> = ({ ok: true } & T) | { ok: false; message: string; code?: string };

async function call<T>(fn: 'billing' | 'domains', body: Record<string, unknown>, needsLogin = true): Promise<Answer<T>> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token && needsLogin) return { ok: false, message: 'Connectez-vous à votre compte Jehre.' };
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as ({ ok?: boolean; message?: string; code?: string } & T) | null;
    if (j?.ok) return { ...j, ok: true };
    return { ok: false, message: j?.message || 'Cela n’a pas fonctionné. Réessayez.', code: j?.code };
  } catch { return { ok: false, message: 'La connexion a été coupée. Rien n’a été prélevé : réessayez.' }; }
}
const here = () => window.location.origin + window.location.pathname;

/** Opens Stripe for a plan of ONE store (or her payment space, when that store already has a subscription). */
export async function subscribe(storeId: string, plan: string, period: 'mois' | 'semaine'): Promise<Answer<{ url: string }>> {
  const r = await call<{ url: string }>('billing', { action: 'subscribe', kind: 'boutique', plan, period, storeId, currency: payCurrency(), returnUrl: here() });
  if (r.ok) window.location.assign(r.url);
  return r;
}
/** Her payment space at Stripe: change of plan, card, invoices, cancellation. */
export async function openPortal(): Promise<Answer<{ url: string }>> {
  const r = await call<{ url: string }>('billing', { action: 'portal', returnUrl: here() });
  if (r.ok) window.location.assign(r.url);
  return r;
}
/** Back from Stripe: her subscriptions are read straight from Stripe and applied, without waiting for the webhook. */
export const syncPlans = () => call<{ applied: number }>('billing', { action: 'sync' });
/** Opens Stripe to buy a domain name for one year; once paid, the server buys it and connects it to the store. */
export async function buyDomain(domain: string, storeId: string): Promise<Answer<{ url: string }>> {
  const r = await call<{ url: string }>('billing', { action: 'domain', domain, storeId, currency: payCurrency(), returnUrl: here() });
  if (r.ok) window.location.assign(r.url);
  return r;
}

/* ---------------------------------------------------------------- domain names */
export interface DomainOffer { domain: string; available: boolean; purchaseFcfa: number | null; renewalFcfa: number | null; purchaseUsd?: number | null; renewalUsd?: number | null; purchaseCad?: number | null; renewalCad?: number | null }
/** A domain in Canadian dollar cents, ending in ,99: the server's figure, else the same formula from Vercel's price in $ US. */
export const domainCad = (cad: number | null | undefined, usd: number | null | undefined): number => (cad && cad > 0 ? cad : usd && usd > 0 ? Math.ceil(usd * 1.4 * 1.4 + 5) * 100 - 1 : 0);
export interface DnsRecord { type: string; name: string; value: string; host: string }
export interface DomainState { domain: string; status: string; records: DnsRecord[]; configured: boolean; message?: string }
export const DOMAIN_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'err' | 'info' }> = {
  verified: { label: 'Actif', tone: 'ok' }, attached: { label: 'En attente de vos réglages DNS', tone: 'warn' },
  waiting_team: { label: 'En cours de vérification par l’équipe', tone: 'info' }, error: { label: 'Refusé', tone: 'err' },
};

export const searchDomains = (name: string) => call<{ configured: boolean; results?: DomainOffer[]; message?: string }>('domains', { action: 'search', name }, false);
/** A domain she already owns (bought anywhere): saved on the store and added to Jehre's hosting. */
export const attachDomain = (storeId: string, domain: string) => call<DomainState>('domains', { action: 'attach', storeId, domain });
export const verifyDomain = (storeId: string) => call<DomainState>('domains', { action: 'verify', storeId });
export const detachDomain = (storeId: string) => call<{ configured: boolean }>('domains', { action: 'detach', storeId });
/** The two lines to write at the company that sold her the domain. */
export function dnsRecords(domain: string): DnsRecord[] {
  const parts = domain.split('.'), apex = parts.slice(-2).join('.');
  const out: DnsRecord[] = [{ type: 'A', name: '@', value: '76.76.21.21', host: apex }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', host: `www.${apex}` }];
  if (domain !== apex && domain !== `www.${apex}`) out.push({ type: 'CNAME', name: domain.slice(0, -apex.length - 1), value: 'cname.vercel-dns.com', host: domain });
  return out;
}
