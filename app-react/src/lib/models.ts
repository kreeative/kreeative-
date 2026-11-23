import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
import type { Fiche } from './stores';

/* The designer models: a site drawn for one trade, paid once. Same list, same prices and same words as the
   current site (creer/models.js); the server checks every price again (the `billing` function). */

export interface Model {
  slug: string; name: string; kind: string; desc: string; price: number;
  /** the price before the launch offer, shown struck through */
  was?: number;
  /** the installation by the team, when it is not the usual price */
  install?: number;
  /** the installation is part of the price */
  installIncluded?: boolean;
  /** a booking site (appointments), not a shop */
  rdv?: boolean;
}

export const INSTALL_PRICE = 50000;
export const CUSTOM_FROM = 300000;

export const MODELS: Model[] = [
  { slug: 'seve', name: 'SÈVE', kind: 'Soins et cosmétiques', desc: 'Flacons sur fond crème, titres serif, filtres par catégorie.', price: 25000, was: 50000 },
  { slug: 'soyeuse', name: 'SOYEUSE', kind: 'Perruques et tissages', desc: 'Rose bonbon, logo à lettres ornées, mannequin en pied.', price: 25000, was: 50000 },
  { slug: 'michou', name: 'MICHOU', kind: 'Streetwear', desc: 'Police machine à écrire, grandes photos, choix de taille sur la carte.', price: 50000, was: 100000, install: 100000 },
  { slug: 'anse', name: 'ANSE', kind: 'Maroquinerie', desc: 'Chaque sac dans son cadre pastel, les anses qui s’en échappent.', price: 300000, installIncluded: true },
  { slug: 'regard', name: 'REGARD', kind: 'Cils et sourcils · rendez-vous', desc: 'Vos clientes réservent en ligne : prestation, jour, heure, acompte.', price: 25000, was: 50000, rdv: true },
  { slug: 'vernie', name: 'VERNIE', kind: 'Ongles · rendez-vous', desc: 'Carte des prestations, demandes à confirmer, rappel la veille.', price: 25000, was: 50000, rdv: true },
  { slug: 'minuit', name: 'MINUIT', kind: 'Cils et ongles · rendez-vous', desc: 'Noir et champagne, tarifs, conditions, offre du mois.', price: 25000, was: 50000, rdv: true },
];

export const modelBySlug = (slug: string): Model | undefined => MODELS.find((m) => m.slug === slug);
export const installPrice = (m: Model): number => m.install ?? INSTALL_PRICE;
/** The picture of a model (640 × 400) and its real demo, both served by the live site. */
export const modelThumb = (slug: string): string => `https://jehre.com/studio/sites/thumbs/concepts--${slug}.webp`;
export const modelDemo = (slug: string): string => `https://jehre.com/modeles/${slug}/`;

/** The models she already paid for, the latest first (public.my_models). */
export async function myModels(): Promise<string[]> {
  const { data, error } = await supabase().rpc('my_models');
  if (error || !Array.isArray(data)) return [];
  return (data as { model?: unknown }[]).map((x) => String(x.model ?? '')).filter(Boolean);
}

/** The model in use: the one chosen for this store if she bought it, else the latest she bought. */
export function currentModel(fiche: Fiche | undefined, owned: string[]): string {
  const want = typeof fiche?.store?.model === 'string' ? fiche.store.model : '';
  return owned.includes(want) ? want : owned[0] ?? '';
}

/** The same store in another model she owns. What she wrote for each model is kept aside (`siteBy`) and comes
 *  back when she returns to it, exactly as the current dashboard does. */
export function withModel(fiche: Fiche, slug: string, from: string): Fiche {
  const st: Record<string, unknown> = { ...(fiche.store ?? {}) };
  const by: Record<string, unknown> = { ...((st.siteBy as Record<string, unknown> | undefined) ?? {}) };
  if (from && st.site) by[from] = st.site;
  if (from && !st.site) delete by[from];
  if (by[slug]) { st.site = by[slug]; delete by[slug]; } else delete st.site;
  if (Object.keys(by).length) st.siteBy = by; else delete st.siteBy;
  st.model = slug;
  return { ...fiche, store: st };
}

export type Outcome = { ok: true } | { ok: false; message: string };

/** The card payment of a model: Stripe opens in this tab and brings her back to the models page. */
export async function buyModel(slug: string, o: { storeId?: string; shopName?: string; sells?: string }): Promise<Outcome> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, message: 'Connectez-vous à votre compte Jehre pour payer.' };
    const r = await fetch(`${SUPABASE_URL}/functions/v1/billing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'model', model: slug, install: false, storeId: o.storeId ?? '', shopName: o.shopName ?? '', sells: o.sells ?? '', returnUrl: window.location.origin + window.location.pathname }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; message?: string } | null;
    if (j?.ok && j.url) { window.location.assign(j.url); return { ok: true }; }
    return { ok: false, message: j?.message || 'Le paiement n’a pas pu s’ouvrir. Rien n’a été prélevé : réessayez.' };
  } catch { return { ok: false, message: 'La connexion a été coupée. Rien n’a été prélevé : réessayez.' }; }
}

/** A quote for the installation, or a call for a made-to-measure site: nothing is paid, the team writes on WhatsApp. */
export async function askTeam(o: { firstName: string; whatsapp: string; link: string; need: string; source: 'devis-installation' | 'tableau-de-bord' }): Promise<Outcome> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/appel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ ...o, need: o.need.slice(0, 800) }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    return j?.ok ? { ok: true } : { ok: false, message: j?.message || 'La demande n’est pas partie. Réessayez.' };
  } catch { return { ok: false, message: 'La demande n’est pas partie. Réessayez.' }; }
}
