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
