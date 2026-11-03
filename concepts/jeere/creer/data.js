/*
 * JEERE Studio — data.js
 * The contract shared by the editor, the renderer and the questionnaire.
 *
 * Everything a store is made of lives in one "fiche boutique" (store config JSON, version 1).
 * The AI never writes code: it fills this fiche, our tested templates render it, and the
 * editor edits the same fiche. This file holds the catalogue (templates, palettes, font
 * pairs, section types, niches, communes), the example content in French, and the pure
 * helpers (defaultConfig, normalizeConfig, validate, formatPrice...).
 *
 * Pure data and functions: no DOM access. The only side effect is window.JEERE_DATA, so the
 * file also loads in Node with `global.window = {}`.
 *
 * Collections (templates, palettes, fontPairs, sectionTypes, niches) are objects keyed by id
 * (palettes.karite) that also behave like read-only arrays (palettes.forEach, .map, .find,
 * .length, palettes[0], for...of), with those helpers non-enumerable so Object.keys() and
 * Object.values() return the ids and entries only.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  /* ------------------------------------------------------------------ helpers */

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function has(obj, key) { return isObj(obj) && Object.prototype.hasOwnProperty.call(obj, key); }
  // Membership in a collection: only the enumerable keys (the ids), never the array helpers.
  function inColl(coll, key) { return typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(coll, key); }

  function collection(list) {
    var obj = {};
    list.forEach(function (item) { obj[item.id] = item; });
    var hidden = {
      length: list.length,
      toArray: function () { return list.slice(); },
      ids: function () { return list.map(function (x) { return x.id; }); }
    };
    ['forEach', 'map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'slice', 'indexOf', 'includes'].forEach(function (m) {
      hidden[m] = function () { return Array.prototype[m].apply(list, arguments); };
    });
    Object.keys(hidden).forEach(function (k) {
      Object.defineProperty(obj, k, { value: hidden[k], enumerable: false, writable: false, configurable: false });
    });
    list.forEach(function (item, i) {
      Object.defineProperty(obj, String(i), { value: item, enumerable: false, writable: false, configurable: false });
    });
    if (typeof Symbol !== 'undefined' && Symbol.iterator) {
      Object.defineProperty(obj, Symbol.iterator, { value: function () { return list[Symbol.iterator](); }, enumerable: false });
    }
    return obj;
  }

  function clone(obj) {
    if (obj === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return null; }
  }

  function formatNumber(n) {
    var x = Number(n);
    if (!isFinite(x)) x = 0;
    x = Math.round(x);
    var sign = x < 0 ? '-' : '';
    return sign + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function formatPrice(n) { return formatNumber(n) + ' FCFA'; }

  function applyName(text, name) {
    return String(text == null ? '' : text).split('{name}').join(String(name == null ? '' : name));
  }

  // Same rule as the landing page: an international number stays as typed (digits only);
  // otherwise +225 is added and the leading 0 is kept (10-digit Ivorian numbers since 2021).
  function normalizeWhatsapp(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^(\+|00)/.test(s)) {
      var intl = s.replace(/^00/, '').replace(/\D/g, '');
      return intl ? '+' + intl : '';
    }
    var digits = s.replace(/\D/g, '');
    if (!digits) return '';
    if (/^225\d{10}$/.test(digits)) return '+' + digits;
    return '+225' + digits;
  }

  /* ------------------------------------------------------------------ constants */

  var ART_KINDS = ['jar', 'bottle', 'bag', 'dress', 'tshirt', 'shoe', 'cap', 'jewel', 'hair', 'plate', 'basket', 'box'];

  var ART_LABELS = {
    jar: 'Pot', bottle: 'Flacon', bag: 'Sac', dress: 'Robe', tshirt: 'Haut, t-shirt', shoe: 'Chaussure',
    cap: 'Casquette', jewel: 'Bijou', hair: 'Perruque, mèches', plate: 'Plat, assiette', basket: 'Panier', box: 'Boîte, coffret'
  };

  var BADGES = { new: 'Nouveau', best: 'Best-seller', promo: 'Promo' };

  var PAYMENTS = [
    { key: 'wave', label: 'Wave' },
    { key: 'orange', label: 'Orange Money' },
    { key: 'mtn', label: 'MTN MoMo' },
    { key: 'moov', label: 'Moov Money' },
    { key: 'cod', label: 'Paiement à la livraison' },
    { key: 'card', label: 'Carte bancaire' }
  ];

  var radii = { none: 0, soft: 10, round: 22 };
  var RADIUS_OPTIONS = [
    { value: 'none', label: 'Droit' },
    { value: 'soft', label: 'Doux' },
    { value: 'round', label: 'Rond' }
  ];
  var BUTTON_OPTIONS = [
    { value: 'solid', label: 'Plein' },
    { value: 'outline', label: 'Contour' }
  ];

  // 10 preset tile colours for products (soft, earthy, suit every art kind).
  var PRODUCT_COLORS = ['#E9D8BD', '#F2D59B', '#E7C7A2', '#D9A88C', '#E3A6B4', '#C7B8E0', '#A9C1D9', '#BFD7D6', '#BFD3A0', '#E8E6DF'];

  /* ------------------------------------------------------------------ templates */

  var templates = collection([
    {
      id: 'plateau',
      name: 'Plateau',
      style: 'Éditorial',
      description: 'Une mise en page de magazine : grandes images, titres élégants et beaucoup d’espace.',
      bestFor: 'Mode, bijoux, maison et marques haut de gamme',
      defaultNiche: 'fashion',
      imageRatio: '4:5',
      defaults: {
        palette: 'sable', fonts: 'editorial', radius: 'none', buttons: 'solid',
        sections: ['announcement', 'hero', 'categories', 'products', 'about', 'reviews', 'delivery', 'whatsapp']
      }
    },
    {
      id: 'cocody',
      name: 'Cocody',
      style: 'Doux',
      description: 'Des cartes arrondies, des couleurs tendres et des catégories faciles à parcourir.',
      bestFor: 'Beauté, perruques, artisanat et petits créateurs',
      defaultNiche: 'beauty',
      imageRatio: '1:1',
      defaults: {
        palette: 'hibiscus', fonts: 'doux', radius: 'round', buttons: 'solid',
        sections: ['announcement', 'hero', 'categories', 'products', 'reviews', 'about', 'delivery', 'whatsapp']
      }
    },
    {
      id: 'treichville',
      name: 'Treichville',
      style: 'Audacieux',
      description: 'De grands titres en capitales, des blocs de couleur et un contraste fort qui attire l’œil.',
      bestFor: 'Sneakers, streetwear, restauration et promotions',
      defaultNiche: 'shoes',
      imageRatio: '1:1',
      defaults: {
        palette: 'nuit', fonts: 'audacieux', radius: 'none', buttons: 'solid',
        sections: ['announcement', 'hero', 'products', 'whatsapp', 'categories', 'reviews', 'delivery', 'about']
      }
    }
  ]);

  /* ------------------------------------------------------------------ palettes
   * WCAG contrast (checked): text/bg >= 7, text/surface >= 7, muted/bg >= 4.5,
   * onAccent/accent >= 4.5, accent/bg >= 3. Only `line` may be rgba.
   */

  var palettes = collection([
    { id: 'sable', name: 'Sable', colors: { bg: '#F6F2EA', surface: '#FFFFFF', text: '#1B1814', muted: '#655C52', accent: '#1F1B16', onAccent: '#FFFFFF', line: 'rgba(27,24,20,0.14)' } },
    { id: 'karite', name: 'Karité', colors: { bg: '#FBF4E8', surface: '#F2E6D3', text: '#2B1D12', muted: '#6A5543', accent: '#8B5A2B', onAccent: '#FFFFFF', line: 'rgba(43,29,18,0.14)' } },
    { id: 'lagune', name: 'Lagune', colors: { bg: '#FFFFFF', surface: '#EAF4F3', text: '#0E2023', muted: '#4C6064', accent: '#0B5D64', onAccent: '#FFFFFF', line: 'rgba(14,32,35,0.13)' } },
    { id: 'hibiscus', name: 'Hibiscus', colors: { bg: '#FCEFF2', surface: '#FFFFFF', text: '#2B1119', muted: '#714D58', accent: '#A3164B', onAccent: '#FFFFFF', line: 'rgba(43,17,25,0.12)' } },
    { id: 'indigo', name: 'Indigo', colors: { bg: '#F1F2F6', surface: '#FFFFFF', text: '#15172C', muted: '#525672', accent: '#3A3EA6', onAccent: '#FFFFFF', line: 'rgba(21,23,44,0.12)' } },
    { id: 'mangue', name: 'Mangue', colors: { bg: '#FFF5E6', surface: '#FFFFFF', text: '#24170A', muted: '#6B5236', accent: '#D66D0A', onAccent: '#1F1306', line: 'rgba(36,23,10,0.13)' } },
    { id: 'menthe', name: 'Menthe', colors: { bg: '#EDF6F0', surface: '#FFFFFF', text: '#0F2419', muted: '#4A6254', accent: '#1D6A45', onAccent: '#FFFFFF', line: 'rgba(15,36,25,0.13)' } },
    { id: 'nuit', name: 'Nuit', colors: { bg: '#111311', surface: '#1D201D', text: '#F3F4EE', muted: '#A4A99F', accent: '#C8F135', onAccent: '#111311', line: 'rgba(243,244,238,0.14)' } }
  ]);

  /* ------------------------------------------------------------------ font pairs
   * All of these fonts include ɛ ɔ ŋ except Poppins, hence the Montserrat fallback in "simple".
   */

  var INTER = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

  var fontPairs = collection([
    {
      id: 'editorial', name: 'Éditorial',
      display: { family: "'Playfair', 'Playfair Display', Georgia, 'Times New Roman', serif", weight: 600 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Playfair:ital,opsz,wght@0,5..1200,400..700;1,5..1200,400..700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'moderne', name: 'Moderne',
      display: { family: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 700 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'doux', name: 'Doux',
      display: { family: "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 600 },
      text: { family: "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap'
    },
    {
      id: 'audacieux', name: 'Audacieux',
      display: { family: "'Unbounded', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 600 },
      text: { family: INTER },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'
    },
    {
      id: 'classique', name: 'Classique',
      display: { family: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif", weight: 600 },
      text: { family: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=Fira+Sans:wght@400;500;600&display=swap'
    },
    {
      id: 'simple', name: 'Simple',
      display: { family: "'Poppins', 'Montserrat', sans-serif", weight: 600 },
      text: { family: "'Poppins', 'Montserrat', sans-serif" },
      googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Montserrat:wght@400;600&display=swap'
    }
  ]);

  /* ------------------------------------------------------------------ communes */

  var communes = [
    { name: 'Abobo', fee: 2500 },
    { name: 'Adjamé', fee: 2000 },
    { name: 'Attécoubé', fee: 2500 },
    { name: 'Cocody', fee: 1500 },
    { name: 'Koumassi', fee: 2000 },
    { name: 'Marcory', fee: 1500 },
    { name: 'Plateau', fee: 1500 },
    { name: 'Port-Bouët', fee: 2500 },
    { name: 'Treichville', fee: 1500 },
    { name: 'Yopougon', fee: 3000 },
    { name: 'Bingerville', fee: 3000 }
  ];

  /* ------------------------------------------------------------------ section types
   * FieldDef: { key, label, type: 'text'|'textarea'|'number'|'select'|'image'|'items',
   *   placeholder?, max? (characters for text/textarea, value for number), min?,
   *   options? [{ value, label }] (select: value has the type stored in the fiche),
   *   itemFields? [FieldDef], itemLabel?, itemDefaults? (new sub-item), maxItems? }
   */

  var GENERIC_REVIEWS = [
    { name: 'Aminata, Cocody', text: 'Commande reçue le lendemain, exactement comme sur la photo. Je recommande.', rating: 5 },
    { name: 'Koffi, Yopougon', text: 'Réponse rapide sur WhatsApp et paiement Wave en deux minutes. Très sérieux.', rating: 5 },
    { name: 'Awa, Marcory', text: 'Bon produit et livreur aimable. Un petit retard, mais j’ai été prévenue à temps.', rating: 4 }
  ];

  var DELIVERY_TEXT = 'Nous livrons du lundi au samedi. Commandez avant 14 h pour être livré le jour même dans la plupart des communes.';

  var sectionTypes = collection([
    {
      id: 'announcement', type: 'announcement',
      name: 'Bandeau d’annonce',
      description: 'Une phrase courte tout en haut : livraison, promo ou nouveauté.',
      fields: [
        { key: 'text', label: 'Message', type: 'text', max: 90, placeholder: 'Livraison offerte dès 20 000 FCFA à Cocody' }
      ],
      defaults: { text: 'Livraison rapide dans tout Abidjan · Paiement à la livraison' }
    },
    {
      id: 'hero', type: 'hero',
      name: 'Grande bannière',
      description: 'Le haut de votre page d’accueil : un titre fort, une image et un bouton.',
      fields: [
        { key: 'kicker', label: 'Petit titre', type: 'text', max: 40, placeholder: 'Nouvelle collection' },
        { key: 'title', label: 'Titre', type: 'text', max: 70, placeholder: 'Des pièces qui tombent juste' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 220, placeholder: 'Dites en une ou deux phrases ce que vous vendez et ce qui vous rend unique.' },
        { key: 'button', label: 'Texte du bouton', type: 'text', max: 24, placeholder: 'Découvrir' },
        { key: 'image', label: 'Image', type: 'image' }
      ],
      defaults: {
        kicker: 'Nouveautés',
        title: 'Bienvenue dans notre boutique',
        text: 'Découvrez nos produits et commandez en quelques secondes. Paiement par mobile money ou à la livraison.',
        button: 'Découvrir',
        image: null
      }
    },
    {
      id: 'categories', type: 'categories',
      name: 'Catégories',
      description: 'Vos catégories en tuiles, créées automatiquement à partir de vos produits.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos catégories' }
      ],
      defaults: { title: 'Nos catégories' }
    },
    {
      id: 'products', type: 'products',
      name: 'Produits',
      description: 'La grille de vos produits, avec le prix et un bouton Commander.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos produits' },
        { key: 'limit', label: 'Nombre maximum de produits', type: 'number', min: 2, max: 24 },
        {
          key: 'columns', label: 'Colonnes sur ordinateur', type: 'select',
          options: [{ value: 2, label: '2 colonnes' }, { value: 3, label: '3 colonnes' }, { value: 4, label: '4 colonnes' }]
        }
      ],
      defaults: { title: 'Nos produits', limit: 8, columns: 3 }
    },
    {
      id: 'about', type: 'about',
      name: 'À propos',
      description: 'Votre histoire en quelques phrases, pour donner confiance.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Notre histoire' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 600, placeholder: 'Qui êtes-vous, que vendez-vous, et pourquoi vos clients peuvent-ils vous faire confiance ?' },
        { key: 'image', label: 'Image', type: 'image' }
      ],
      defaults: {
        title: 'Notre histoire',
        text: 'Racontez ici qui vous êtes, ce que vous vendez et pourquoi vos clients peuvent vous faire confiance. Deux ou trois phrases suffisent.',
        image: null
      }
    },
    {
      id: 'reviews', type: 'reviews',
      name: 'Avis clients',
      description: 'Les avis de vos clients, avec leur note sur 5.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Ce que disent nos clients' },
        {
          key: 'items', label: 'Avis', type: 'items', itemLabel: 'Avis', maxItems: 12,
          itemFields: [
            { key: 'name', label: 'Prénom et commune', type: 'text', max: 40, placeholder: 'Mariam, Cocody' },
            { key: 'text', label: 'Avis', type: 'textarea', max: 240, placeholder: 'Ce que votre client a dit de votre produit ou de votre service.' },
            {
              key: 'rating', label: 'Note', type: 'select',
              options: [
                { value: 5, label: '5 étoiles' }, { value: 4, label: '4 étoiles' }, { value: 3, label: '3 étoiles' },
                { value: 2, label: '2 étoiles' }, { value: 1, label: '1 étoile' }
              ]
            }
          ],
          itemDefaults: { name: '', text: '', rating: 5 }
        }
      ],
      defaults: { title: 'Ce que disent nos clients', items: GENERIC_REVIEWS }
    },
    {
      id: 'delivery', type: 'delivery',
      name: 'Livraison',
      description: 'Vos zones de livraison et leurs frais, commune par commune.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 50, placeholder: 'Nos frais de livraison' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 240, placeholder: 'Jours de livraison, délais, conditions.' },
        {
          key: 'zones', label: 'Zones de livraison', type: 'items', itemLabel: 'Zone', maxItems: 30,
          itemFields: [
            { key: 'name', label: 'Commune ou zone', type: 'text', max: 40, placeholder: 'Cocody' },
            { key: 'fee', label: 'Frais (FCFA)', type: 'number', min: 0, max: 100000, placeholder: '1500' }
          ],
          itemDefaults: { name: '', fee: 1500 }
        }
      ],
      defaults: { title: 'Nos frais de livraison', text: DELIVERY_TEXT, zones: communes.slice(0, 6) }
    },
    {
      id: 'whatsapp', type: 'whatsapp',
      name: 'Commander sur WhatsApp',
      description: 'Un bloc qui invite à commander directement sur WhatsApp.',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', max: 60, placeholder: 'Commandez sur WhatsApp' },
        { key: 'text', label: 'Texte', type: 'textarea', max: 200, placeholder: 'Expliquez comment commander et en combien de temps vous répondez.' },
        { key: 'button', label: 'Texte du bouton', type: 'text', max: 30, placeholder: 'Commander sur WhatsApp' }
      ],
      defaults: {
        title: 'Commandez sur WhatsApp',
        text: 'Écrivez-nous : nous confirmons votre commande, le prix de la livraison et l’heure de passage.',
        button: 'Commander sur WhatsApp'
      }
    }
  ]);

  /* ------------------------------------------------------------------ niches
   * Example content for each kind of store. hero.title may contain {name}.
   * Extra keys (beyond the spec): storeName, art, color, productsTitle, categoriesTitle.
   */

  var niches = collection([
    {
      id: 'fashion', label: 'Mode et vêtements', template: 'plateau', palette: 'sable',
      storeName: 'Maison Adjoa', art: 'dress', color: '#E6D5BC',
      tagline: 'Prêt-à-porter cousu à Abidjan',
      announcement: 'Livraison en 24 h dans tout Abidjan · Retouche offerte',
      hero: {
        kicker: 'Nouvelle collection',
        title: '{name} : des pièces qui tombent juste',
        text: 'Robes, ensembles et chemises coupés dans notre atelier de Treichville, en petites séries. Envoyez vos mesures, nous ajustons pour vous.',
        button: 'Voir la collection'
      },
      about: {
        title: 'Notre atelier',
        text: 'Tout a commencé dans un petit atelier de Treichville, avec deux machines et beaucoup d’exigence. Nous choisissons nos tissus au marché d’Adjamé et nous cousons chaque pièce en petite série. Si une taille ne vous va pas, nous la reprenons gratuitement.'
      },
      productsTitle: 'La collection',
      categoriesTitle: 'Trouver votre style',
      reviews: [
        { name: 'Mariam, Cocody', text: 'La robe chemise est encore plus belle en vrai. Livrée le lendemain, et la retouche était faite en deux jours.', rating: 5 },
        { name: 'Adjoa, Marcory', text: 'J’ai commandé l’ensemble pour la dot de ma sœur. Tissu de qualité, finitions propres. Je recommande.', rating: 5 },
        { name: 'Koffi, Yopougon', text: 'Chemise bien coupée, j’ai pris un L et c’est parfait. J’aurais aimé plus de couleurs.', rating: 4 }
      ],
      whatsapp: {
        title: 'Une question sur une taille ?',
        text: 'Envoyez-nous vos mesures ou une photo sur WhatsApp. Nous vous conseillons et nous réservons votre pièce.',
        button: 'Écrire sur WhatsApp'
      },
      products: [
        { name: 'Robe portefeuille Lagune', price: 18500, category: 'Robes', badge: 'new', art: 'dress', color: '#C9D6E3', description: 'Coupe portefeuille qui s’ajuste à toutes les silhouettes, en coton léger. Longueur midi, manches trois-quarts.' },
        { name: 'Robe chemise en lin', price: 22000, category: 'Robes', badge: 'best', art: 'dress', color: '#E6D5BC', description: 'Lin lavé, poches côté et ceinture à nouer. Elle se porte au bureau comme le week-end.' },
        { name: 'Ensemble en pagne tissé', price: 35000, category: 'Ensembles', badge: null, art: 'dress', color: '#D8B4A0', description: 'Haut court et jupe droite en pagne tissé à la main, doublés. Une tenue pour les mariages et les dots.' },
        { name: 'Ensemble tunique et pantalon', price: 27500, category: 'Ensembles', badge: 'promo', art: 'tshirt', color: '#B8C4A8', description: 'Tunique ample et pantalon fluide en viscose, confortables même par forte chaleur.' },
        { name: 'Chemise homme col mao', price: 15000, category: 'Chemises', badge: null, art: 'tshirt', color: '#DCE3EA', description: 'Coton respirant, coupe droite et boutons nacrés. Disponible du S au XXL.' },
        { name: 'Chemise femme oversize', price: 14000, category: 'Chemises', badge: null, art: 'tshirt', color: '#F0E3CF', description: 'Coupe ample en popeline de coton. À porter ouverte sur un débardeur ou nouée à la taille.' }
      ]
    },
    {
      id: 'hair', label: 'Perruques et mèches', template: 'cocody', palette: 'hibiscus',
      storeName: 'Mariam Hair', art: 'hair', color: '#9C6B4E',
      tagline: 'Perruques et mèches, vérifiées une par une',
      announcement: 'Pose offerte au salon d’Angré pour toute perruque achetée',
      hero: {
        kicker: 'Nouveaux arrivages',
        title: '{name} : des perruques prêtes à porter',
        text: 'Perruques en cheveux naturels et mèches de qualité, lavées et coiffées avant l’envoi. Livraison discrète partout à Abidjan.',
        button: 'Choisir ma perruque'
      },
      about: {
        title: 'Notre salon',
        text: 'Nous coiffons à Cocody Angré depuis 2018. Chaque perruque est lavée, coiffée et essayée au salon avant de partir chez vous. Vous hésitez sur une longueur ou une couleur ? Envoyez-nous une photo, nous vous conseillons.'
      },
      productsTitle: 'Perruques et mèches',
      categoriesTitle: 'Choisir par type',
      reviews: [
        { name: 'Fatou, Angré', text: 'Ma perruque bouclée est arrivée coiffée et parfaitement ajustée. On me demande tous les jours où je l’ai achetée !', rating: 5 },
        { name: 'Awa, Koumassi', text: 'Livraison discrète, en moins de 24 h. Les mèches ne s’emmêlent pas, même après plusieurs lavages.', rating: 5 },
        { name: 'Aïcha, Bingerville', text: 'Très bon conseil pour la couleur. Le bob est beau, la lace est un peu fine à manipuler au début.', rating: 4 }
      ],
      whatsapp: {
        title: 'Pas sûre de la longueur ?',
        text: 'Envoyez-nous une photo sur WhatsApp : nous vous proposons la perruque qui vous va, avec les prix.',
        button: 'Demander conseil'
      },
      products: [
        { name: 'Perruque lisse 14 pouces', price: 65000, category: 'Perruques', badge: 'best', art: 'hair', color: '#7A5444', description: 'Cheveux naturels, lace frontale 13×4, densité 180 %. Se lave et se lisse comme vos propres cheveux.' },
        { name: 'Perruque bouclée coupe carré', price: 55000, category: 'Perruques', badge: 'new', art: 'hair', color: '#9C6B4E', description: 'Boucles souples, longueur à la mâchoire. Légère et idéale quand il fait chaud.' },
        { name: 'Perruque bob blond miel', price: 48000, category: 'Perruques', badge: null, art: 'hair', color: '#C9A27E', description: 'Bob lisse couleur miel, lace transparente. Prête à porter, sans colle.' },
        { name: 'Mèches ondulées, lot de 3', price: 35000, category: 'Mèches', badge: 'promo', art: 'hair', color: '#6E4A3A', description: 'Trois paquets de 100 g en cheveux naturels ondulés. Assez pour une pose complète.' },
        { name: 'Mèches kinky pour tresses', price: 4500, category: 'Mèches', badge: null, art: 'hair', color: '#5A4038', description: 'Texture proche des cheveux crépus, elles ne glissent pas. Comptez 4 à 6 paquets pour des tresses mi-longues.' },
        { name: 'Huile légère pour perruque', price: 6000, category: 'Soins', badge: null, art: 'bottle', color: '#E8C9A8', description: 'Redonne de la brillance sans alourdir. Quelques gouttes sur les pointes, deux fois par semaine.' }
      ]
    },
    {
      id: 'beauty', label: 'Beauté et soins', template: 'cocody', palette: 'karite',
      storeName: 'Awa Beauté', art: 'jar', color: '#E9D8BD',
      tagline: 'Soins naturels faits à Abidjan',
      announcement: 'Livraison offerte dès 20 000 FCFA à Cocody',
      hero: {
        kicker: 'Nouvelle collection',
        title: '{name} : des soins simples et naturels',
        text: 'Karité de Korhogo, huile de coco et savon noir, préparés en petites quantités pour garder toute leur fraîcheur.',
        button: 'Découvrir'
      },
      about: {
        title: 'Notre histoire',
        text: 'Tout a commencé dans notre cuisine à Cocody, avec la recette de beurre de karité de notre grand-mère. Aujourd’hui, nous achetons le karité directement aux coopératives de femmes de Korhogo et nous préparons chaque pot à la main. Pas de parfum ajouté, pas de promesse impossible : des soins qui font du bien.'
      },
      productsTitle: 'Nos soins',
      categoriesTitle: 'Par besoin',
      reviews: [
        { name: 'Mariam, Cocody', text: 'Le beurre de karité fouetté est devenu indispensable. Il pénètre vite et ne laisse pas la peau grasse.', rating: 5 },
        { name: 'Yao, Marcory', text: 'J’ai offert le coffret à ma femme, elle a adoré. Livré le jour même à Marcory.', rating: 5 },
        { name: 'Adjoa, Plateau', text: 'Le sérum est léger et sent bon naturellement. J’attends de voir les résultats sur quelques semaines.', rating: 4 }
      ],
      whatsapp: {
        title: 'Un conseil pour votre peau ?',
        text: 'Dites-nous votre type de peau sur WhatsApp : nous vous proposons la bonne routine et nous livrons chez vous.',
        button: 'Commander sur WhatsApp'
      },
      products: [
        { name: 'Beurre de karité fouetté', price: 6500, category: 'Corps', badge: 'best', art: 'jar', color: '#E9D8BD', description: 'Karité pur de Korhogo, fouetté pour fondre vite sur la peau. Non parfumé, pour le corps et les cheveux.' },
        { name: 'Savon noir au karité', price: 3000, category: 'Corps', badge: null, art: 'box', color: '#A88B70', description: 'Savon noir traditionnel enrichi au karité. Il nettoie en douceur, même les peaux sensibles.' },
        { name: 'Huile de coco vierge', price: 4500, category: 'Cheveux', badge: null, art: 'bottle', color: '#F1E6CF', description: 'Pressée à froid près de Grand-Bassam. Nourrit les cheveux secs et les pointes abîmées.' },
        { name: 'Sérum éclat au baobab', price: 9500, category: 'Visage', badge: 'new', art: 'bottle', color: '#E7C7A2', description: 'Huile de baobab et vitamine E pour un teint plus uniforme. Deux gouttes le soir suffisent.' },
        { name: 'Masque visage à l’argile', price: 5500, category: 'Visage', badge: null, art: 'jar', color: '#D9B9A0', description: 'Argile douce et miel pour nettoyer les pores en profondeur. À laisser poser 10 minutes, une fois par semaine.' },
        { name: 'Coffret découverte', price: 14000, category: 'Corps', badge: 'promo', art: 'basket', color: '#E3CBB0', description: 'Beurre de karité, savon noir et huile de coco en format voyage. Une belle idée de cadeau.' }
      ]
    },
    {
      id: 'jewellery', label: 'Bijoux et accessoires', template: 'plateau', palette: 'indigo',
      storeName: 'Fatou Bijoux', art: 'jewel', color: '#D8B56B',
      tagline: 'Bijoux dorés et perles, faits main à Abidjan',
      announcement: 'Emballage cadeau offert sur chaque commande',
      hero: {
        kicker: 'Faits main',
        title: '{name} : l’éclat qui vous ressemble',
        text: 'Colliers, boucles d’oreilles et bracelets en laiton doré et perles de verre. Chaque pièce est assemblée à la main, à la commande.',
        button: 'Voir les bijoux'
      },
      about: {
        title: 'Derrière chaque bijou',
        text: 'Nous travaillons le laiton et les perles de verre dans notre atelier de Marcory. Nos bijoux sont plaqués or 18 carats et sans nickel, pour être portés tous les jours. Un fermoir cassé ? Nous le réparons gratuitement pendant un an.'
      },
      productsTitle: 'Tous nos bijoux',
      categoriesTitle: 'Par type de bijou',
      reviews: [
        { name: 'Awa, Riviera', text: 'Les créoles sont légères et toujours aussi dorées après trois mois. Je les porte tous les jours.', rating: 5 },
        { name: 'Kouamé, Plateau', text: 'J’ai offert la parure à ma fiancée, l’écrin était magnifique. Livraison au bureau, très pratique.', rating: 5 },
        { name: 'Mariam, Yopougon', text: 'Très jolis bracelets. Un fermoir s’est abîmé, il a été réparé en deux jours sans frais.', rating: 4 }
      ],
      whatsapp: {
        title: 'Un bijou sur mesure ?',
        text: 'Choisissez vos couleurs de perles et votre longueur sur WhatsApp. Nous vous envoyons une photo avant l’envoi.',
        button: 'Écrire à l’atelier'
      },
      products: [
        { name: 'Collier en perles de verre', price: 12000, category: 'Colliers', badge: 'best', art: 'jewel', color: '#A8B8DC', description: 'Perles de verre recyclé, soufflées à la main, et fermoir doré. Longueur 45 cm, ajustable.' },
        { name: 'Créoles martelées dorées', price: 9500, category: 'Boucles d’oreilles', badge: 'new', art: 'jewel', color: '#D8B56B', description: 'Laiton martelé plaqué or 18 carats, légères et sans nickel. Diamètre 4 cm.' },
        { name: 'Pendants goutte en résine', price: 7500, category: 'Boucles d’oreilles', badge: null, art: 'jewel', color: '#C7B8E0', description: 'Résine teintée et monture dorée. Elles attrapent la lumière sans peser sur l’oreille.' },
        { name: 'Bracelet jonc gravé', price: 11000, category: 'Bracelets', badge: null, art: 'jewel', color: '#D2B270', description: 'Jonc ouvert en laiton doré, gravé de motifs géométriques. Il s’ajuste à tous les poignets.' },
        { name: 'Bracelets de perles, lot de 3', price: 6500, category: 'Bracelets', badge: 'promo', art: 'jewel', color: '#A9C4C9', description: 'Trois bracelets élastiques en perles de verre, à porter ensemble ou séparément.' },
        { name: 'Parure collier et boucles', price: 24000, category: 'Colliers', badge: null, art: 'box', color: '#E3D3B5', description: 'Un collier ras-du-cou et ses boucles assorties, livrés dans un écrin. Le cadeau parfait pour une fête.' }
      ]
    },
    {
      id: 'shoes', label: 'Chaussures et sneakers', template: 'treichville', palette: 'nuit',
      storeName: 'Pointure 225', art: 'shoe', color: '#E8E6DF',
      tagline: 'Sneakers et sandales, du 36 au 46',
      announcement: 'Échange de pointure gratuit sous 7 jours',
      hero: {
        kicker: 'Nouveaux arrivages',
        title: '{name} : les paires du moment',
        text: 'Sneakers, sandales en cuir et mocassins, vérifiés avant chaque envoi. Pas la bonne pointure ? Nous échangeons.',
        button: 'Voir les paires'
      },
      about: {
        title: 'Qui sommes-nous',
        text: 'Nous avons commencé par vendre quelques paires à nos amis d’Adjamé. Aujourd’hui, nous choisissons chaque modèle pour son confort et sa solidité, et nous vérifions chaque paire avant de la livrer. Nos sandales en cuir sont fabriquées par un cordonnier de Treichville.'
      },
      productsTitle: 'Toutes les paires',
      categoriesTitle: 'Par style',
      reviews: [
        { name: 'Koffi, Yopougon', text: 'Les sneakers blanches sont super confortables. Livrées en 3 heures à Yopougon, je ne m’y attendais pas.', rating: 5 },
        { name: 'Yao, Abobo', text: 'J’avais pris une pointure trop petite, l’échange a été fait sans discussion. Sérieux.', rating: 5 },
        { name: 'Fatou, Port-Bouët', text: 'Belles sandales en cuir, solides. Il faut quelques jours pour qu’elles se fassent au pied.', rating: 4 }
      ],
      whatsapp: {
        title: 'Pas sûr de votre pointure ?',
        text: 'Envoyez-nous la longueur de votre pied en centimètres sur WhatsApp. Nous vous disons quelle taille prendre.',
        button: 'Demander ma pointure'
      },
      products: [
        { name: 'Sneakers basses blanches', price: 25000, category: 'Sneakers', badge: 'best', art: 'shoe', color: '#E8E6DF', description: 'Cuir synthétique facile à nettoyer et semelle épaisse, confortable toute la journée. Du 36 au 45.' },
        { name: 'Sneakers montantes', price: 32000, category: 'Sneakers', badge: 'new', art: 'shoe', color: '#BFD3A0', description: 'Tige rembourrée et lacets plats, pour un look streetwear. Semelle antidérapante.' },
        { name: 'Baskets de course légères', price: 28500, category: 'Sneakers', badge: 'promo', art: 'shoe', color: '#A9C1D9', description: 'Mesh respirant et semelle souple, pour marcher des heures sans fatigue.' },
        { name: 'Sandales en cuir tressé', price: 15000, category: 'Sandales', badge: null, art: 'shoe', color: '#C49A6C', description: 'Cuir véritable tressé à la main à Treichville. Semelle en caoutchouc qui ne glisse pas.' },
        { name: 'Claquettes confort', price: 7500, category: 'Sandales', badge: null, art: 'shoe', color: '#D9CFC2', description: 'Semelle moulée et légère, parfaite pour la maison ou la plage de Bassam.' },
        { name: 'Mocassins en daim', price: 27000, category: 'Ville', badge: null, art: 'shoe', color: '#9A7B5F', description: 'Daim souple et semelle cousue, pour le bureau comme pour les cérémonies.' }
      ]
    },
    {
      id: 'food', label: 'Alimentation et traiteur', template: 'treichville', palette: 'mangue',
      storeName: 'Chez Aminata', art: 'plate', color: '#F2D59B',
      tagline: 'Plats maison et traiteur, livrés à Abidjan',
      announcement: 'Commandez avant 10 h, vous êtes livré pour le déjeuner',
      hero: {
        kicker: 'Cuisiné ce matin',
        title: '{name} : des plats maison, livrés à l’heure',
        text: 'Attiéké poisson, sauce graine et alloco, préparés chaque matin avec les produits du marché. Pour vous, votre bureau ou vos fêtes.',
        button: 'Voir le menu'
      },
      about: {
        title: 'Notre cuisine',
        text: 'Nous cuisinons à Marcory depuis dix ans, d’abord pour les voisins, puis pour les bureaux du Plateau. Les légumes et le poisson viennent du marché chaque matin, et rien n’est réchauffé de la veille. Pour vos baptêmes, anniversaires et réunions, nous préparons aussi des plateaux traiteur.'
      },
      productsTitle: 'Au menu',
      categoriesTitle: 'La carte',
      reviews: [
        { name: 'Kouamé, Plateau', text: 'Nous commandons pour toute l’équipe chaque vendredi. Toujours chaud, toujours à l’heure.', rating: 5 },
        { name: 'Adjoa, Cocody', text: 'Le plateau traiteur pour le baptême de ma fille a régalé tout le monde. Merci pour l’organisation.', rating: 5 },
        { name: 'Yao, Treichville', text: 'Le meilleur attiéké poisson du quartier. Un peu plus de piment la prochaine fois, s’il vous plaît !', rating: 4 }
      ],
      whatsapp: {
        title: 'Une commande pour un groupe ?',
        text: 'Donnez-nous le nombre de personnes, la date et la commune sur WhatsApp. Nous vous envoyons un devis dans l’heure.',
        button: 'Commander sur WhatsApp'
      },
      products: [
        { name: 'Attiéké poisson braisé', price: 3500, category: 'Plats du jour', badge: 'best', art: 'plate', color: '#F2D59B', description: 'Attiéké frais, poisson braisé, oignons et piment à part. Une portion généreuse pour une personne.' },
        { name: 'Sauce graine et riz', price: 3000, category: 'Plats du jour', badge: null, art: 'plate', color: '#E9B98A', description: 'Sauce graine mijotée avec bœuf et poisson fumé, servie avec du riz blanc.' },
        { name: 'Alloco et poulet braisé', price: 4000, category: 'Plats du jour', badge: 'new', art: 'plate', color: '#F4C27A', description: 'Banane plantain frite et demi-poulet braisé, mariné aux épices. Sauce tomate pimentée offerte.' },
        { name: 'Plateau traiteur 20 personnes', price: 60000, category: 'Traiteur', badge: null, art: 'basket', color: '#EFD3A8', description: 'Brochettes, alloco, attiéké et beignets, livrés prêts à servir. À commander 48 h à l’avance.' },
        { name: 'Mini-beignets, boîte de 30', price: 5000, category: 'Traiteur', badge: null, art: 'box', color: '#F1CC8F', description: 'Beignets moelleux, saupoudrés de sucre. Parfaits pour les réunions et les anniversaires.' },
        { name: 'Jus de bissap maison, 1 L', price: 1500, category: 'Boissons', badge: 'promo', art: 'bottle', color: '#D98FA0', description: 'Fleurs d’hibiscus infusées avec de la menthe fraîche et du gingembre. Peu sucré, servi bien frais.' }
      ]
    },
    {
      id: 'home', label: 'Maison et déco', template: 'plateau', palette: 'lagune',
      storeName: 'Kouamé Déco', art: 'bottle', color: '#D7A98C',
      tagline: 'Déco et linge de maison, choisis avec soin',
      announcement: 'Livraison offerte dès 30 000 FCFA dans tout Abidjan',
      hero: {
        kicker: 'Nouvelle saison',
        title: '{name} : votre intérieur, en plus beau',
        text: 'Bougies, vases, vaisselle et linge de lit choisis chez de petits ateliers ivoiriens. Des pièces solides, faciles à vivre.',
        button: 'Découvrir la maison'
      },
      about: {
        title: 'Notre idée de la maison',
        text: 'Nous croyons qu’une belle maison n’a pas besoin d’être chère. Nous choisissons des pièces solides et faciles à entretenir, souvent fabriquées par de petits ateliers ivoiriens. Chaque commande est emballée avec soin et livrée par notre propre équipe.'
      },
      productsTitle: 'Pour la maison',
      categoriesTitle: 'Par pièce',
      reviews: [
        { name: 'Mariam, Riviera', text: 'Les assiettes sont encore plus belles qu’en photo. Emballage soigné, rien de cassé.', rating: 5 },
        { name: 'Koffi, Bingerville', text: 'Livré à Bingerville sans frais cachés. Le panier est solide, parfait pour la chambre des enfants.', rating: 5 },
        { name: 'Awa, Marcory', text: 'Jolie bougie, l’odeur est agréable. J’aurais aimé un format plus grand.', rating: 4 }
      ],
      whatsapp: {
        title: 'Besoin d’un avis déco ?',
        text: 'Envoyez une photo de votre pièce sur WhatsApp. Nous vous proposons des idées, avec les prix.',
        button: 'Demander conseil'
      },
      products: [
        { name: 'Bougie parfumée citronnelle', price: 6000, category: 'Salon', badge: 'new', art: 'jar', color: '#CFE3DF', description: 'Cire végétale et citronnelle, environ 40 heures de combustion. Elle éloigne aussi les moustiques.' },
        { name: 'Vase en terre cuite', price: 9000, category: 'Salon', badge: null, art: 'bottle', color: '#D7A98C', description: 'Façonné à la main et cuit au feu de bois. Chaque vase est unique, hauteur 30 cm.' },
        { name: 'Panier de rangement tressé', price: 8500, category: 'Salon', badge: 'best', art: 'basket', color: '#D9C29A', description: 'Fibres naturelles tressées et deux anses. Pour les jouets, le linge ou les plaids.' },
        { name: 'Service de 6 assiettes', price: 18000, category: 'Cuisine', badge: null, art: 'plate', color: '#BFD7D6', description: 'Grès émaillé bleu lagune. Passe au micro-ondes et au lave-vaisselle.' },
        { name: 'Saladier en bois de teck', price: 11000, category: 'Cuisine', badge: 'promo', art: 'plate', color: '#C69C72', description: 'Taillé dans une seule pièce de bois et huilé à la main. Diamètre 28 cm.' },
        { name: 'Parure de lit en coton', price: 25000, category: 'Chambre', badge: null, art: 'box', color: '#E4ECE8', description: 'Housse de couette et deux taies en coton doux, pour un lit deux places. Lavable à 40 °C.' }
      ]
    },
    {
      id: 'crafts', label: 'Artisanat', template: 'cocody', palette: 'menthe',
      storeName: 'Atelier Yao', art: 'basket', color: '#D8C59A',
      tagline: 'Artisanat ivoirien, fait main et durable',
      announcement: 'Chaque pièce est unique · Envoi partout en Côte d’Ivoire',
      hero: {
        kicker: 'Fait main',
        title: '{name} : l’artisanat d’ici, au quotidien',
        text: 'Paniers, sacs en raphia, poteries et toiles peintes, fabriqués par des artisans de Korhogo, Katiola et Abidjan, payés au juste prix.',
        button: 'Voir les créations'
      },
      about: {
        title: 'Nos artisans',
        text: 'Nous travaillons avec une vingtaine d’artisans, que nous connaissons tous par leur prénom. Les potières de Katiola, les peintres de toiles de Korhogo et les vanniers d’Abidjan fixent eux-mêmes leurs prix. Quand vous achetez ici, vous faites vivre un savoir-faire.'
      },
      productsTitle: 'Nos créations',
      categoriesTitle: 'Par savoir-faire',
      reviews: [
        { name: 'Adjoa, Cocody', text: 'Le panier est magnifique et très solide. On sent le vrai travail à la main.', rating: 5 },
        { name: 'Kouamé, Bouaké', text: 'Commandé depuis Bouaké, reçu en trois jours et bien emballé. La jarre est superbe.', rating: 5 },
        { name: 'Fatou, Treichville', text: 'Belle pochette aux couleurs vives. La fermeture est un peu dure au début.', rating: 4 }
      ],
      whatsapp: {
        title: 'Une commande en quantité ?',
        text: 'Pour un cadeau d’entreprise ou une boutique, écrivez-nous sur WhatsApp. Nous préparons votre commande avec les artisans.',
        button: 'Écrire sur WhatsApp'
      },
      products: [
        { name: 'Panier rond en raphia', price: 9500, category: 'Vannerie', badge: 'best', art: 'basket', color: '#D8C59A', description: 'Tressé à la main, avec couvercle. Pour le pain, les fruits ou le rangement.' },
        { name: 'Sac cabas tressé', price: 14500, category: 'Sacs', badge: 'new', art: 'bag', color: '#C8B37E', description: 'Raphia tressé, anses en cuir et doublure en coton. Assez grand pour le marché ou la plage.' },
        { name: 'Jarre en terre de Katiola', price: 16000, category: 'Poterie', badge: null, art: 'jar', color: '#C98F6B', description: 'Modelée à la main par les potières de Katiola. Elle garde l’eau fraîche naturellement.' },
        { name: 'Bol en terre cuite', price: 4500, category: 'Poterie', badge: null, art: 'plate', color: '#D5A688', description: 'Petit bol cuit au four traditionnel, pour les sauces ou l’apéritif.' },
        { name: 'Pochette en toile de Korhogo', price: 8000, category: 'Sacs', badge: 'promo', art: 'bag', color: '#E2D6BC', description: 'Toile peinte à la main, fermeture éclair et doublure. Pour le téléphone et les papiers.' },
        { name: 'Corbeille à fruits tressée', price: 7000, category: 'Vannerie', badge: null, art: 'basket', color: '#BFD1B4', description: 'Fibres teintes au naturel et tressage serré, très solide. Diamètre 30 cm.' }
      ]
    }
  ]);

  /* ------------------------------------------------------------------ defaultConfig */

  function resolveNiche(id) { return (typeof id === 'string' && inColl(niches, id)) ? id : null; }
  function resolveTemplate(id) { return (typeof id === 'string' && inColl(templates, id)) ? id : null; }

  // Settings for one section type, filled from a niche when one is given.
  function sectionSettings(type, nicheId, storeName) {
    var def = inColl(sectionTypes, type) ? sectionTypes[type] : null;
    if (!def) return {};
    var s = clone(def.defaults);
    var n = resolveNiche(nicheId) ? niches[nicheId] : null;
    if (!n) return s;
    var name = (storeName == null || storeName === '') ? n.storeName : storeName;
    switch (type) {
      case 'announcement': s.text = n.announcement; break;
      case 'hero':
        s.kicker = n.hero.kicker; s.title = applyName(n.hero.title, name);
        s.text = n.hero.text; s.button = n.hero.button; s.image = null;
        break;
      case 'categories': if (n.categoriesTitle) s.title = n.categoriesTitle; break;
      case 'products': if (n.productsTitle) s.title = n.productsTitle; break;
      case 'about': s.title = n.about.title; s.text = n.about.text; s.image = null; break;
      case 'reviews': s.items = clone(n.reviews); break;
      case 'delivery': s.zones = clone(communes.slice(0, 6)); break;
      case 'whatsapp': s.title = n.whatsapp.title; s.text = n.whatsapp.text; s.button = n.whatsapp.button; break;
    }
    return s;
  }

  function defaultConfig(templateId, nicheId) {
    var nicheGiven = resolveNiche(nicheId);
    var t = resolveTemplate(templateId) || (nicheGiven ? niches[nicheGiven].template : 'plateau');
    var tpl = templates[t];
    var n = nicheGiven || tpl.defaultNiche;
    var ni = niches[n];
    var name = ni.storeName;
    return {
      version: 1,
      template: t,
      store: { name: name, tagline: ni.tagline, whatsapp: '', city: 'Abidjan', niche: n },
      theme: {
        palette: nicheGiven ? ni.palette : tpl.defaults.palette,
        fonts: tpl.defaults.fonts,
        radius: tpl.defaults.radius,
        buttons: tpl.defaults.buttons
      },
      payments: { wave: true, orange: true, mtn: true, moov: false, cod: true, card: false },
      sections: tpl.defaults.sections.map(function (type, i) {
        return { id: 's' + (i + 1), type: type, enabled: true, settings: sectionSettings(type, n, name) };
      }),
      products: ni.products.map(function (p, i) {
        return {
          id: 'p' + (i + 1), name: p.name, price: p.price, category: p.category, badge: p.badge,
          art: p.art, color: p.color, description: p.description, image: null
        };
      })
    };
  }

  /* ------------------------------------------------------------------ normalizeConfig */

  var PAYMENT_KEYS = PAYMENTS.map(function (p) { return p.key; });
  var IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

  function isImage(v) { return typeof v === 'string' && v.length < 12000000 && IMAGE_RE.test(v); }

  function str(v, def) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return def;
  }

  function toBool(v, def) {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return def;
    if (v === null || v === 0 || v === '' || v === '0' || v === 'false' || v === 'non' || v === 'off') return false;
    return true;
  }

  // Integer from a number or a string such as "12 500", "12 500 FCFA", "6500.4". Null if none.
  function toInt(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string') return null;
    var s = v.replace(/[\s  ]/g, '').replace(/fcfa|cfa|xof|f$/ig, '');
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    else s = s.replace(',', '.');
    if (!/^-?\d*\.?\d+$/.test(s)) return null;
    var n = Math.round(parseFloat(s));
    return isFinite(n) ? n : null;
  }

  function clampInt(v, min, max, def) {
    var n = toInt(v);
    if (n === null) return def;
    if (typeof min === 'number' && n < min) n = min;
    if (typeof max === 'number' && n > max) n = max;
    return n;
  }

  function normColor(v, def) {
    if (typeof v !== 'string') return def;
    var s = v.trim();
    var m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m3) return ('#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toUpperCase();
    var m6 = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m6) return ('#' + m6[1]).toUpperCase();
    return def;
  }

  function normBadge(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return null;
    var s = v.trim().toLowerCase();
    if (has(BADGES, s)) return s;
    for (var k in BADGES) { if (BADGES[k].toLowerCase() === s) return k; }
    if (s === 'bestseller' || s === 'best seller') return 'best';
    return null;
  }

  function normField(f, v, d) {
    switch (f.type) {
      case 'text':
      case 'textarea':
        return str(v, typeof d === 'string' ? d : '');
      case 'number':
        return clampInt(v, f.min, f.max, typeof d === 'number' ? d : (typeof f.min === 'number' ? f.min : 0));
      case 'select': {
        var opts = f.options || [];
        for (var i = 0; i < opts.length; i++) {
          if (v !== undefined && v !== null && String(opts[i].value) === String(v)) return opts[i].value;
        }
        return d !== undefined ? d : (opts[0] ? opts[0].value : null);
      }
      case 'image':
        return isImage(v) ? v : null;
      case 'items': {
        var list = Array.isArray(v) ? v : (Array.isArray(d) ? d : []);
        var out = [];
        list.forEach(function (item) {
          if (!isObj(item)) return;
          out.push(normSettings(f.itemFields || [], item, f.itemDefaults || {}));
        });
        if (typeof f.maxItems === 'number' && out.length > f.maxItems) out = out.slice(0, f.maxItems);
        return out;
      }
    }
    return d;
  }

  function normSettings(fields, settings, defaults) {
    var src = isObj(settings) ? settings : {};
    var defs = isObj(defaults) ? defaults : {};
    var out = {};
    fields.forEach(function (f) {
      var v = has(src, f.key) ? src[f.key] : undefined;
      var d = clone(defs[f.key]);
      out[f.key] = (v === undefined) ? normField(f, d, d) : normField(f, v, d);
    });
    return out;
  }

  function assignIds(list, prefix) {
    var re = new RegExp('^' + prefix + '[1-9]\\d*$');
    var used = {};
    var pending = [];
    list.forEach(function (item) {
      if (typeof item.id === 'string' && re.test(item.id) && !used[item.id]) used[item.id] = true;
      else { item.id = null; pending.push(item); }
    });
    var i = 1;
    pending.forEach(function (item) {
      while (used[prefix + i]) i++;
      item.id = prefix + i;
      used[item.id] = true;
    });
    return list;
  }

  function normalizeInner(input) {
    var src = input;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
    if (!isObj(src)) return defaultConfig();

    var srcStore = isObj(src.store) ? src.store : {};
    var nicheKnown = resolveNiche(srcStore.niche);
    var tpl = resolveTemplate(src.template) || (nicheKnown ? niches[nicheKnown].template : 'plateau');
    var base = defaultConfig(tpl, nicheKnown || undefined);

    var store = {
      name: str(srcStore.name, base.store.name),
      tagline: str(srcStore.tagline, base.store.tagline),
      whatsapp: normalizeWhatsapp(str(srcStore.whatsapp, '')),
      city: str(srcStore.city, base.store.city),
      niche: has(srcStore, 'niche') ? nicheKnown : base.store.niche
    };

    var srcTheme = isObj(src.theme) ? src.theme : {};
    var theme = {
      palette: (typeof srcTheme.palette === 'string' && inColl(palettes, srcTheme.palette)) ? srcTheme.palette : base.theme.palette,
      fonts: (typeof srcTheme.fonts === 'string' && inColl(fontPairs, srcTheme.fonts)) ? srcTheme.fonts : base.theme.fonts,
      radius: (typeof srcTheme.radius === 'string' && has(radii, srcTheme.radius)) ? srcTheme.radius : base.theme.radius,
      buttons: (srcTheme.buttons === 'solid' || srcTheme.buttons === 'outline') ? srcTheme.buttons : base.theme.buttons
    };

    var srcPay = isObj(src.payments) ? src.payments : {};
    var payments = {};
    PAYMENT_KEYS.forEach(function (k) { payments[k] = toBool(srcPay[k], base.payments[k]); });

    var sections = [];
    (Array.isArray(src.sections) ? src.sections : base.sections).forEach(function (s) {
      if (!isObj(s) || typeof s.type !== 'string' || !inColl(sectionTypes, s.type)) return;
      var def = sectionTypes[s.type];
      sections.push({
        id: s.id,
        type: s.type,
        enabled: toBool(s.enabled, true),
        settings: normSettings(def.fields, s.settings, def.defaults)
      });
    });
    assignIds(sections, 's');

    var products = [];
    (Array.isArray(src.products) ? src.products : base.products).forEach(function (p) {
      if (!isObj(p)) return;
      var price = toInt(p.price);
      products.push({
        id: p.id,
        name: str(p.name, '').trim(),
        price: price === null || price < 0 ? 0 : price,
        category: str(p.category, '').trim(),
        badge: normBadge(p.badge),
        art: (typeof p.art === 'string' && ART_KINDS.indexOf(p.art) !== -1) ? p.art : 'box',
        color: normColor(p.color, '#E9D8BD'),
        description: str(p.description, ''),
        image: isImage(p.image) ? p.image : null
      });
    });
    assignIds(products, 'p');

    return { version: 1, template: tpl, store: store, theme: theme, payments: payments, sections: sections, products: products };
  }

  function normalizeConfig(input) {
    try { return normalizeInner(input); } catch (e) { return defaultConfig(); }
  }

  /* ------------------------------------------------------------------ validate */

  function q(text) { return '« ' + text + ' »'; }
  function shorten(text, n) { text = String(text); return text.length > n ? text.slice(0, n - 1).trim() + '…' : text; }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  function validateInner(config) {
    var issues = [];
    function add(level, message, kind, id) {
      var target = { kind: kind };
      if (id !== undefined && id !== null) target.id = String(id);
      issues.push({ level: level, message: message, target: target });
    }

    if (!isObj(config)) {
      add('error', 'La fiche boutique est illisible. Importez une fiche valide ou repartez d’un modèle.', 'store');
    } else {
      var store = isObj(config.store) ? config.store : {};
      var theme = isObj(config.theme) ? config.theme : {};
      var payments = isObj(config.payments) ? config.payments : {};
      var sections = Array.isArray(config.sections) ? config.sections.filter(isObj) : [];
      var products = Array.isArray(config.products) ? config.products.filter(isObj) : [];
      var enabled = sections.filter(function (s) { return s.enabled !== false && inColl(sectionTypes, s.type); });
      function settingsOf(s) { return isObj(s.settings) ? s.settings : {}; }
      function textOf(v) { return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : ''); }

      /* errors */
      var name = textOf(store.name).trim();
      if (!name) add('error', 'Donnez un nom à votre boutique.', 'store', 'name');

      if (!enabled.length) add('error', 'Activez au moins une section pour que votre boutique ne soit pas vide.', 'section');

      var productsShown = false;
      var productSectionError = false;
      enabled.forEach(function (s) {
        if (s.type !== 'products') return;
        if (!products.length) {
          productSectionError = true;
          add('error', 'La section ' + q(textOf(settingsOf(s).title) || 'Produits') + ' est vide. Ajoutez au moins un produit.', 'product');
        } else productsShown = true;
      });

      products.forEach(function (p, i) {
        var pname = textOf(p.name).trim();
        if (!pname) add('error', 'Le produit n° ' + (i + 1) + ' n’a pas de nom. Donnez-lui un nom clair.', 'product', p.id);
        var price = p.price;
        if (typeof price !== 'number' || !isFinite(price) || price < 0 || Math.floor(price) !== price) {
          add('error', (pname ? q(shorten(pname, 40)) : 'Le produit n° ' + (i + 1)) + ' : indiquez un prix en FCFA, en nombre entier (par exemple 6500).', 'product', p.id);
        }
      });

      var anyPayment = PAYMENT_KEYS.some(function (k) { return payments[k] === true; });
      if (!anyPayment) add('error', 'Activez au moins un moyen de paiement : Wave, Orange Money, MTN MoMo, Moov Money ou paiement à la livraison.', 'payments');

      if (!(typeof config.template === 'string' && inColl(templates, config.template))) {
        add('error', 'Modèle inconnu. Choisissez Plateau, Cocody ou Treichville dans l’onglet Thème.', 'theme', 'template');
      }
      if (!(typeof theme.palette === 'string' && inColl(palettes, theme.palette))) {
        add('error', 'Palette de couleurs inconnue. Choisissez-en une dans l’onglet Thème.', 'theme', 'palette');
      }
      if (!(typeof theme.fonts === 'string' && inColl(fontPairs, theme.fonts))) {
        add('error', 'Polices inconnues. Choisissez une paire de polices dans l’onglet Thème.', 'theme', 'fonts');
      }

      /* warnings */
      var whatsapp = textOf(store.whatsapp).trim();
      var waSection = enabled.some(function (s) { return s.type === 'whatsapp'; });
      if (!whatsapp && (waSection || productsShown)) {
        add('warning', 'Ajoutez votre numéro WhatsApp pour recevoir les commandes.', 'store', 'whatsapp');
      } else if (whatsapp && !/^\+\d{8,15}$/.test(whatsapp)) {
        add('warning', 'Le numéro WhatsApp semble incorrect. Écrivez-le avec l’indicatif, par exemple +2250707123456.', 'store', 'whatsapp');
      }

      if (products.length < 3 && !productSectionError) {
        add('warning', products.length
          ? 'Votre boutique n’a que ' + plural(products.length, 'produit', 'produits') + '. Ajoutez-en au moins 3 pour inspirer confiance.'
          : 'Votre boutique n’a pas encore de produit. Ajoutez-en au moins 3 pour inspirer confiance.', 'product');
      }

      var seen = {};
      products.forEach(function (p) {
        var pname = textOf(p.name).trim();
        if (pname.length > 60) {
          add('warning', q(shorten(pname, 40)) + ' : nom trop long (' + pname.length + ' caractères). Visez 60 caractères au maximum.', 'product', p.id);
        }
        var key = pname.toLowerCase().replace(/\s+/g, ' ');
        if (!key) return;
        if (seen[key] === 1) {
          add('warning', 'Plusieurs produits s’appellent ' + q(shorten(pname, 40)) + '. Donnez-leur des noms différents.', 'product', p.id);
        }
        seen[key] = (seen[key] || 0) + 1;
      });

      enabled.forEach(function (s) {
        var st = settingsOf(s);
        if (s.type === 'hero') {
          var title = textOf(st.title);
          if (title.length > 70) add('warning', 'Le titre de la grande bannière est trop long (' + title.length + ' caractères). Visez 70 caractères au maximum pour qu’il reste lisible sur téléphone.', 'section', s.id);
        } else if (s.type === 'announcement') {
          var text = textOf(st.text);
          if (text.length > 90) add('warning', 'Le bandeau d’annonce est trop long (' + text.length + ' caractères). Visez 90 caractères au maximum.', 'section', s.id);
        } else if (s.type === 'delivery') {
          if (!(Array.isArray(st.zones) && st.zones.length)) add('warning', 'Ajoutez au moins une zone de livraison avec son prix, ou masquez la section Livraison.', 'section', s.id);
        } else if (s.type === 'reviews') {
          var n = Array.isArray(st.items) ? st.items.length : 0;
          if (n < 2) add('warning', 'Ajoutez au moins 2 avis clients, ou masquez la section Avis clients.', 'section', s.id);
        }
      });

      /* tips */
      var noPhoto = products.filter(function (p) { return !isImage(p.image); });
      if (noPhoto.length) {
        add('tip', (noPhoto.length === 1 ? '1 produit n’a' : noPhoto.length + ' produits n’ont') + ' pas encore de vraie photo. Une photo prise à la lumière du jour fait souvent la différence.', 'product', noPhoto[0].id);
      }
      var noDesc = products.filter(function (p) { return !textOf(p.description).trim(); });
      if (noDesc.length) {
        add('tip', (noDesc.length === 1 ? '1 produit n’a' : noDesc.length + ' produits n’ont') + ' pas de description. Une ou deux phrases suffisent : matière, taille, usage.', 'product', noDesc[0].id);
      }
      enabled.forEach(function (s) {
        if (s.type !== 'about') return;
        if (textOf(settingsOf(s).text).trim().length < 80) {
          add('tip', 'Votre texte ' + q('À propos') + ' est très court. Racontez en deux ou trois phrases qui vous êtes et pourquoi vous faire confiance.', 'section', s.id);
        }
      });
    }

    var count = { error: 0, warning: 0, tip: 0 };
    issues.forEach(function (i) { count[i.level]++; });
    var score = Math.max(0, 100 - 20 * count.error - 6 * count.warning - 2 * Math.min(count.tip, 5));
    var order = { error: 0, warning: 1, tip: 2 };
    issues.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return { score: score, status: (count.error === 0 && score >= 80) ? 'APPROUVÉ' : 'À CORRIGER', issues: issues };
  }

  function validate(config) {
    try { return validateInner(config); } catch (e) {
      return {
        score: 80, status: 'À CORRIGER',
        issues: [{ level: 'error', message: 'La fiche boutique n’a pas pu être vérifiée. Importez une fiche valide ou repartez d’un modèle.', target: { kind: 'store' } }]
      };
    }
  }

  /* ------------------------------------------------------------------ newId */

  function newId(config, prefix) {
    var p = prefix === 'p' ? 'p' : 's';
    var list = isObj(config) ? (p === 'p' ? config.products : config.sections) : null;
    var used = {};
    if (Array.isArray(list)) list.forEach(function (x) { if (isObj(x) && typeof x.id === 'string') used[x.id] = true; });
    var i = 1;
    while (used[p + i]) i++;
    return p + i;
  }

  /* ------------------------------------------------------------------ export */

  root.JEERE_DATA = {
    version: 1,
    ART_KINDS: ART_KINDS,
    ART_LABELS: ART_LABELS,
    BADGES: BADGES,
    PAYMENTS: PAYMENTS,
    PRODUCT_COLORS: PRODUCT_COLORS,
    RADIUS_OPTIONS: RADIUS_OPTIONS,
    BUTTON_OPTIONS: BUTTON_OPTIONS,
    templates: templates,
    palettes: palettes,
    fontPairs: fontPairs,
    radii: radii,
    sectionTypes: sectionTypes,
    niches: niches,
    communes: communes,
    defaultConfig: defaultConfig,
    sectionSettings: sectionSettings,
    validate: validate,
    normalizeConfig: normalizeConfig,
    normalizeWhatsapp: normalizeWhatsapp,
    formatPrice: formatPrice,
    formatNumber: formatNumber,
    applyName: applyName,
    clone: clone,
    newId: newId
  };
})();
