import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

/* Card payments with Stripe Connect, through the `payments` function (the same one as the current site): her own
   Stripe account, made and checked INSIDE Jehre, tied to ONE store. The function checks the store is hers. */

export const STRIPE_COUNTRIES: [string, string][] = [['CA', 'Canada'], ['US', 'États-Unis'], ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['GB', 'Royaume-Uni'], ['DE', 'Allemagne'], ['ES', 'Espagne'], ['IT', 'Italie'], ['NL', 'Pays-Bas'], ['PT', 'Portugal'], ['IE', 'Irlande'], ['LU', 'Luxembourg']];

export interface CardStatus { ok: boolean; configured?: boolean; connected?: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; country?: string; message?: string; code?: string }
export type CardState = 'loading' | 'soon' | 'off' | 'pending' | 'on';
/** what to show: « bientôt » (Jehre's key not set), « à configurer », « à terminer » (Stripe still asks), « connecté » */
export const cardState = (s: CardStatus | null): CardState => !s ? 'loading' : !s.ok || !s.configured ? 'soon' : s.chargesEnabled ? 'on' : s.connected ? 'pending' : 'off';
export const CARD_LABEL: Record<CardState, string> = { loading: '…', soon: 'Bientôt', off: 'À configurer', pending: 'À terminer', on: 'Connecté' };

export async function cardCall<T extends object = CardStatus>(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string; code?: string } & Partial<T>> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, code: 'login', message: 'Connectez-vous à votre compte Jehre.' } as unknown as { ok: boolean } & Partial<T>;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return ((await r.json().catch(() => null)) ?? { ok: false, message: 'Stripe n’a pas répondu.' }) as unknown as { ok: boolean } & Partial<T>;
  } catch { return { ok: false, message: 'Pas de connexion internet.' } as unknown as { ok: boolean } & Partial<T>; }
}
export const cardStatus = (storeId: string) => cardCall<CardStatus>({ action: 'status', storeId }) as Promise<CardStatus>;

/* Stripe's own forms, inside Jehre, in Jehre's look (Connect embedded components) */
interface ConnectInstance { create: (name: string) => HTMLElement & { setOnExit?: (f: () => void) => void } }
interface ConnectJs { init: (o: Record<string, unknown>) => ConnectInstance }
declare global { interface Window { StripeConnect?: ConnectJs } }
export function loadConnectJs(): Promise<ConnectJs> {
  if (window.StripeConnect?.init) return Promise.resolve(window.StripeConnect);
  return new Promise((res, rej) => {
    let sc = document.querySelector<HTMLScriptElement>('script[data-stripe-connect]');
    if (!sc) { sc = document.createElement('script'); sc.src = 'https://connect-js.stripe.com/v1.0/connect.js'; sc.async = true; sc.setAttribute('data-stripe-connect', ''); document.head.appendChild(sc); }
    let n = 0;
    const t = window.setInterval(() => { if (window.StripeConnect?.init) { window.clearInterval(t); res(window.StripeConnect); } else if (++n > 100) { window.clearInterval(t); rej(new Error('connect.js')); } }, 100);
    sc.addEventListener('error', () => { window.clearInterval(t); rej(new Error('connect.js')); });
  });
}
export async function connectInstance(storeId: string, country: string): Promise<ConnectInstance> {
  const j = await cardCall<{ clientSecret: string; publishableKey: string }>({ action: 'session', storeId, country });
  if (!j.ok || !j.clientSecret || !j.publishableKey) throw new Error(j.message || j.code || 'Stripe n’a pas pu s’ouvrir.');
  const SC = await loadConnectJs();
  let secret = j.clientSecret;
  return SC.init({
    publishableKey: j.publishableKey,
    fetchClientSecret: async () => { if (secret) { const s0 = secret; secret = ''; return s0; } const k = await cardCall<{ clientSecret: string }>({ action: 'session', storeId }); return k.clientSecret ?? ''; },
    locale: 'fr-FR',
    appearance: { overlays: 'drawer', variables: { fontFamily: 'Poppins, system-ui, sans-serif', colorPrimary: '#111111', colorText: '#111111', colorBackground: '#FFFFFF', buttonPrimaryColorBackground: '#111111', buttonPrimaryColorText: '#FFFFFF', borderRadius: '12px', spacingUnit: '10px' } },
    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap' }],
  });
}
