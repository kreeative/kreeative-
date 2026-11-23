import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

/* Subscriptions and domain names. Every payment goes through Stripe, opened by the `billing` function (the only
   place that knows the prices and the Stripe key); a domain is connected by the `domains` function (the only place
   that can add a name to Jehre's hosting). The browser never sees a key and never sets a price. */

export interface Plan { id: string; name: string; month: number; week: number | null; orders: number | null; fee: number; forWho: string; recommended?: boolean }
/** The store plans, as on the current site (creer/data.js). The server charges its own copy of these prices. */
export const PLANS: Plan[] = [
  { id: 'gratuit', name: 'Gratuit', month: 0, week: null, orders: 20, fee: 2, forWho: 'Pour démarrer' },
  { id: 'essentiel', name: 'Essentiel', month: 3500, week: 1000, orders: 150, fee: 1, forWho: 'Pour les vendeurs actifs sur les réseaux', recommended: true },
  { id: 'pro', name: 'Pro', month: 10000, week: null, orders: 600, fee: 0, forWho: 'Pour les marques qui grandissent' },
  { id: 'business', name: 'Business', month: 25000, week: null, orders: null, fee: 0, forWho: 'Pour les boutiques installées' },
];
export const PLAN_FEATURES = [
  'Toutes les fonctions : boutique, paiements, commandes WhatsApp, livraison, codes promo, avis clients',
  'Une vraie personne qui vous répond sur WhatsApp, en français',
  'Pause ou arrêt en un clic, rien n’est prélevé sans vous',
];
export const planOf = (id: string | null | undefined): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0]!;

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
  const r = await call<{ url: string }>('billing', { action: 'subscribe', kind: 'boutique', plan, period, storeId, returnUrl: here() });
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
  const r = await call<{ url: string }>('billing', { action: 'domain', domain, storeId, returnUrl: here() });
  if (r.ok) window.location.assign(r.url);
  return r;
}

/* ---------------------------------------------------------------- domain names */
export interface DomainOffer { domain: string; available: boolean; purchaseFcfa: number | null; renewalFcfa: number | null }
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
