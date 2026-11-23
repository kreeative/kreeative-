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
/** A model seen inside Jehre, by a seller who is logged in (as a theme is previewed inside Shopify or Framer). */
export const modelPreview = (slug: string): string => `/admin/modeles/apercu/?m=${slug}`;

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

/* ---------------------------------------------------------------- the editor
   A model is a real site drawn by the designer. The editor frames that site and speaks with it (the script
   connect/jeere-connect.js every model carries): the editor sends the store being edited, the site answers with
   the list of what can be changed on the page (its sections, their texts and pictures, the product cases) and
   tells which one was clicked. Her changes are kept in her store: `store.site` (t: texts, i: pictures,
   c: categories, h: hidden sections) and `store.slots` (which product goes in which case). */

/** Where each model's site lives. */
export const modelSite = (slug: string): string => `https://kreeative.xyz/concepts/${slug}/`;

/** The pages of each model, as tabs of the editor. */
export const MODEL_PAGES: Record<string, { path: string; name: string }[]> = {
  seve: [{ path: '', name: 'Accueil' }, { path: 'catalogue/', name: 'Catalogue' }, { path: 'commande/', name: 'Commande' }, { path: 'mentions-legales/', name: 'Mentions légales' }],
  soyeuse: [{ path: '', name: 'Accueil' }, { path: 'boutique/', name: 'Boutique' }, { path: 'commande/', name: 'Commande' }, { path: 'mentions-legales/', name: 'Mentions légales' }],
  michou: [{ path: '', name: 'Accueil' }, { path: 'boutique/', name: 'Boutique' }, { path: 'commande/', name: 'Commande' }, { path: 'mentions-legales/', name: 'Mentions légales' }],
  anse: [{ path: '', name: 'Accueil' }, { path: 'commande/', name: 'Commande' }, { path: 'mentions-legales/', name: 'Mentions légales' }],
  regard: [{ path: '', name: 'Accueil' }],
  vernie: [{ path: '', name: 'Accueil' }],
  minuit: [{ path: '', name: 'Accueil' }],
};

/** One thing of the page: a text (t), a picture (i), a category (c), a product case (p), the list of services (s). */
export interface SiteItem { key: string; kind: 't' | 'i' | 'c' | 'p' | 's'; ref: string; label: string; text: string; role: string; sec: number; src: string; long: boolean }
export interface SiteSection { n: number; key: string; name: string; fixed: boolean }
export interface SiteMap { page: string; items: SiteItem[]; sections: SiteSection[] }
export type SiteKind = 't' | 'i' | 'c' | 'h';

type Bag = Record<string, unknown>;
const bag = (v: unknown): Bag => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Bag) } : {});

/** Her value for one thing of the model, or undefined when it still shows the model's own. */
export function siteValue(fiche: Fiche, kind: SiteKind, key: string): string | undefined {
  const v = bag(bag(bag(fiche.store).site)[kind])[key];
  return typeof v === 'string' ? v : undefined;
}

/** The store with her change to a text, a picture, a category or a hidden section; `null` gives back the model's own. */
export function withSiteEdit(fiche: Fiche, kind: SiteKind, key: string, value: string | null): Fiche {
  const st = bag(fiche.store), site = bag(st.site), part = bag(site[kind]);
  if (value === null || value === '') delete part[key]; else part[key] = value;
  if (Object.keys(part).length) site[kind] = part; else delete site[kind];
  if (Object.keys(site).length) st.site = site; else delete st.site;
  return { ...fiche, store: st };
}

/** The store with another product in a case of the model ('-' hides the case; the case's own product: no entry). */
export function withSlot(fiche: Fiche, slot: string, value: string): Fiche {
  const st = bag(fiche.store), slots = bag(st.slots);
  if (!value || value === slot) delete slots[slot]; else slots[slot] = value;
  if (Object.keys(slots).length) st.slots = slots; else delete st.slots;
  return { ...fiche, store: st };
}

/** What the model's page says about itself, checked before it is trusted (it comes from another window). */
export function readSiteMap(data: unknown): SiteMap | null {
  const m = bag(bag(data).jeereMap);
  if (!Array.isArray(m.items) || !Array.isArray(m.sections)) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    page: s(m.page),
    items: (m.items as unknown[]).map((x) => bag(x)).filter((x) => typeof x.key === 'string' && /^[ticps]$/.test(s(x.kind)))
      .map((x) => ({ key: s(x.key), kind: s(x.kind) as SiteItem['kind'], ref: s(x.ref), label: s(x.label), text: s(x.text), role: s(x.role), sec: typeof x.sec === 'number' ? x.sec : -1, src: s(x.src), long: x.long === true })),
    sections: (m.sections as unknown[]).map((x) => bag(x)).filter((x) => typeof x.key === 'string' && typeof x.n === 'number')
      .map((x) => ({ n: x.n as number, key: s(x.key), name: s(x.name) || 'Section', fixed: x.fixed === true })),
  };
}

/** Sites drawn for one client (not a model on sale): edited the same way, found by the store's own address. */
export const CLIENT_SITES: Record<string, { name: string; url: string }> = {
  'joshua-cooker': { name: 'Joshua Cooker', url: 'https://kreeative.xyz/concepts/joshua-cooker/' },
  'sonia-luxury-hair': { name: 'Sonia Luxury Hair', url: 'https://kreeative.xyz/concepts/sonia-luxury-hair/' },
};

/** What the editor opens for a store: the client's own site, else the model in use; null when she has neither.
 *  `key` is the name the site answers to in the conversation with the editor. */
export function editorSite(storeSlug: string, model: string): { key: string; name: string; url: string; pages: { path: string; name: string }[] } | null {
  const own = CLIENT_SITES[storeSlug];
  if (own) return { key: storeSlug, name: own.name, url: own.url, pages: [{ path: '', name: 'Accueil' }] };
  const m = modelBySlug(model);
  return m ? { key: m.slug, name: `Modèle ${m.name}`, url: modelSite(m.slug), pages: MODEL_PAGES[m.slug] ?? [{ path: '', name: 'Accueil' }] } : null;
}

/** The order she gave to the sections of one page of the model (their numbers); null: the model's own order. */
export function sectionOrder(fiche: Fiche, page: string): number[] | null {
  const o = bag(bag(bag(fiche.store).site).o)[page];
  return Array.isArray(o) && o.every((n) => typeof n === 'number') ? (o as number[]) : null;
}
/** The store with another order for the sections of a page (`null` gives back the model's own order). */
export function withSectionOrder(fiche: Fiche, page: string, order: number[] | null): Fiche {
  const st = bag(fiche.store), site = bag(st.site), o = bag(site.o);
  if (order) o[page] = order; else delete o[page];
  if (Object.keys(o).length) site.o = o; else delete site.o;
  if (Object.keys(site).length) st.site = site; else delete st.site;
  return { ...fiche, store: st };
}
