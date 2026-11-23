import type { Fiche } from './stores';

/* The store engine.
   A store is ONE format (the fiche) drawn by ONE renderer with the same eight sections for every model:
   a model only chooses the layout, the palette, the fonts and the corners it starts with. That renderer is the
   current site's (creer/data.js + creer/render.js + creer/store.css): the new front end uses it AS IT IS, so a
   store looks exactly the same in the dashboard, in the editor and in public, before and after the migration. */

/** Where the engine's files are served from (today: the live site). */
export const ENGINE_BASE = process.env.NEXT_PUBLIC_ENGINE_BASE ?? 'https://jehre.com/creer/';

export const SECTION_TYPES: { type: string; name: string; description: string }[] = [
  { type: 'announcement', name: 'Bandeau d’annonce', description: 'Une phrase courte tout en haut : livraison, promo ou nouveauté.' },
  { type: 'hero', name: 'Grande bannière', description: 'Le haut de la page d’accueil : un titre fort, une image et un bouton.' },
  { type: 'categories', name: 'Catégories', description: 'Les catégories en tuiles, créées à partir des produits.' },
  { type: 'products', name: 'Produits', description: 'La grille des produits, avec le prix et un bouton Commander.' },
  { type: 'about', name: 'À propos', description: 'L’histoire de la boutique en quelques phrases.' },
  { type: 'reviews', name: 'Avis clients', description: 'Les avis des clientes, avec leur note sur 5.' },
  { type: 'delivery', name: 'Livraison', description: 'Les zones de livraison et leurs frais.' },
  { type: 'whatsapp', name: 'Commander sur WhatsApp', description: 'Un bloc qui invite à commander sur WhatsApp.' },
];

export interface Template {
  id: string; name: string; style: string; description: string; bestFor: string;
  defaults: { palette: string; fonts: string; radius: string; buttons: string };
}
/** The three models, as the engine defines them (creer/data.js). */
export const TEMPLATES: Template[] = [
  { id: 'plateau', name: 'Plateau', style: 'Éditorial', description: 'Une mise en page de magazine : grandes images, titres élégants et beaucoup d’espace.', bestFor: 'Mode, bijoux, maison et marques haut de gamme', defaults: { palette: 'sable', fonts: 'editorial', radius: 'none', buttons: 'solid' } },
  { id: 'cocody', name: 'Cocody', style: 'Doux', description: 'Des cartes arrondies, des couleurs tendres et des catégories faciles à parcourir.', bestFor: 'Beauté, perruques, artisanat et petits créateurs', defaults: { palette: 'hibiscus', fonts: 'doux', radius: 'round', buttons: 'solid' } },
  { id: 'treichville', name: 'Treichville', style: 'Audacieux', description: 'De grands titres en capitales, des blocs de couleur et un contraste fort qui attire l’œil.', bestFor: 'Sneakers, streetwear, restauration et promotions', defaults: { palette: 'nuit', fonts: 'audacieux', radius: 'none', buttons: 'solid' } },
];

/** The same store in another model: the layout, the palette under it, the fonts and the corners change. Her
 *  products, her sections, her texts and the colours and fonts she picked herself stay (as in the current editor). */
export function withTemplate(fiche: Fiche, id: string): Fiche {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return fiche;
  const theme = { ...((fiche.theme as Record<string, unknown> | undefined) ?? {}) };
  Object.assign(theme, t.defaults);
  const ty = theme.typography;
  if (ty && typeof ty === 'object') theme.typography = { ...(ty as Record<string, unknown>), pair: t.defaults.fonts };
  return { ...fiche, template: id, theme };
}
