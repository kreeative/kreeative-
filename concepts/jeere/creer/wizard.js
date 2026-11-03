/*
 * Jeere Studio — wizard.js
 * « l’assistant Jeere » : the « Décrire ma boutique » flow, as a chat. Its avatar is the blue Jeere J mark
 * of the Jeere logo on a black circle.
 *
 * Global: window.JeereWizard = {
 *   open()                  full-screen chat above the start screen (a conversation in progress is resumed)
 *   close()                 closes it; the conversation is kept until « Recommencer » or until the editor opens
 *   reset()                 forgets the conversation
 *   understand(text, step, ctx?) -> { step, intent, value, values, confidence, explicit, strong, info }   (pure)
 *   generate(answers)       -> a complete fiche boutique, config v1, always in vivid colours              (pure)
 *   STEPS                   ['name', 'niche', 'template', 'palette', 'needs', 'contact']
 * }
 *
 * There is no AI in this prototype. The assistant reads keywords (accents and case ignored), negations
 * (« pas d’avis »), corrections at any moment (« non, plutôt audacieux »), answers given ahead of time
 * (« Awa Beauté, je vends du karité ») and phone numbers, then fills the same fiche boutique that the
 * editor edits. In Jeere, one AI will answer in its place and fill the same fiche.
 * Replies are chosen deterministically from the answers (no Math.random), so the demo is stable.
 *
 * Pure parts (understand, generate) never touch the DOM: the file loads in Node with global.window = {}.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const D = () => root.JEERE_DATA;
  const NB = ' ';
  const STEPS = ['name', 'niche', 'template', 'palette', 'needs', 'contact'];
  const NEED_KEYS = ['whatsapp', 'delivery', 'cod', 'reviews', 'categories', 'announcement'];
  const PROVISIONAL_NAME = 'Ma boutique';
  const STORE_KEY = 'jeere-studio-config';
  const ACCOUNT_KEY = 'jeere-account'; // read only: the store name she gave at sign-up (../compte/)
  const PHONE_W = 390; // the rendered store is a 390 px phone

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function idsOf(coll) { try { return Object.keys(coll || {}); } catch (e) { return []; } }
  function known(coll, id) { return typeof id === 'string' && idsOf(coll).indexOf(id) !== -1; }
  function allNeeds(v) { const o = {}; NEED_KEYS.forEach((k) => { o[k] = v; }); return o; }

  /* ================================================================== copy */

  const STYLE = {
    plateau: { label: 'Élégant', low: 'élégant', sub: 'Plateau · façon magazine, raffiné', fonts: 'editorial',
      help: 'grandes images, titres raffinés et beaucoup d’espace, comme un magazine.' },
    cocody: { label: 'Doux', low: 'doux', sub: 'Cocody · arrondi et tendre', fonts: 'doux',
      help: 'cartes arrondies, couleurs tendres et catégories faciles à parcourir.' },
    treichville: { label: 'Audacieux', low: 'audacieux', sub: 'Treichville · grands titres, contrasté', fonts: 'audacieux',
      help: 'grands titres en capitales, blocs de couleur et contraste fort.' }
  };
  const PALETTE_DESC = {
    sable: 'blanc cassé et noir',
    karite: 'pêche clair et terracotta vif',
    lagune: 'blanc bleuté et turquoise vif',
    hibiscus: 'rose clair et rose fuchsia',
    indigo: 'bleu très clair et bleu électrique',
    mangue: 'crème et jaune mangue',
    menthe: 'vert d’eau et vert vif',
    nuit: 'fond noir et vert fluo'
  };
  const NICHE_COPY = {
    fashion: { shop: 'une boutique de mode', short: 'la mode', alt: 'vêtements' },
    hair: { shop: 'une boutique de perruques et de mèches', short: 'les perruques et les mèches', alt: 'perruques et mèches' },
    beauty: { shop: 'une boutique de beauté et de soins', short: 'les soins de beauté', alt: 'produits de beauté' },
    jewellery: { shop: 'une boutique de bijoux et d’accessoires', short: 'les bijoux', alt: 'bijoux et accessoires' },
    shoes: { shop: 'une boutique de chaussures', short: 'les chaussures', alt: 'chaussures' },
    food: { shop: 'une boutique traiteur', short: 'la cuisine', alt: 'plats' },
    home: { shop: 'une boutique de déco et de maison', short: 'la déco', alt: 'articles pour la maison' },
    crafts: { shop: 'une boutique d’artisanat', short: 'l’artisanat', alt: 'créations artisanales' }
  };
  const NEED_COPY = {
    whatsapp: { chip: 'Commande sur WhatsApp', low: 'commande sur WhatsApp' },
    delivery: { chip: 'Livraison par commune', low: 'livraison par commune' },
    cod: { chip: 'Paiement à la livraison', low: 'paiement à la livraison' },
    reviews: { chip: 'Avis clients', low: 'avis clients' },
    categories: { chip: 'Catégories de produits', low: 'catégories de produits' },
    announcement: { chip: 'Bandeau d’annonce', low: 'bandeau d’annonce' }
  };
  const FIELD_LABEL = { name: 'Le nom', niche: 'Ce que je vends', template: 'Le style', palette: 'Les couleurs', needs: 'Les options', contact: 'La ville et le numéro' };
  const CITY_CHIPS = ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro'];

  /* ================================================================== text helpers */

  // French typography: no-break space before : ; ? ! and inside « »
  function fr(s) { return String(s).replace(/ ([:;?!»])/g, NB + '$1').replace(/« /g, '«' + NB); }
  function q(s) { return '« ' + s + ' »'; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function joinList(list, last) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' ' + last + ' ' + list[list.length - 1];
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // One char in, one char out: lower case, no accents, straight apostrophes (indexes stay aligned)
  function foldChar(ch) {
    if (ch === '’' || ch === '‘' || ch === 'ʼ' || ch === '`' || ch === '´') return "'";
    const lo = ch.toLowerCase();
    if (lo.length !== 1) return ch;
    return lo.normalize ? lo.normalize('NFD').charAt(0) : lo;
  }
  function fold(s) {
    s = String(s == null ? '' : s);
    let out = '';
    for (let i = 0; i < s.length; i++) out += foldChar(s[i]);
    return out;
  }
  // Normalised text for keyword search: words, digits and clause punctuation as separate tokens
  function norm(s) {
    return fold(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/([,;.!?])+/g, ' $1 ')
      .replace(/[^a-z0-9'+\-,;.!?]+/g, ' ')
      .replace(/(^|\s)['\-]+/g, '$1').replace(/['\-]+(?=\s|$)/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ================================================================== lexicons */

  function lex(groups) {
    const out = [];
    groups.forEach((g) => {
      const key = g[0]; const w = g[1]; const extra = g[3] || {};
      g[2].forEach((p) => out.push(Object.assign({ key: key, w: w, src: p, re: new RegExp('(^|[^a-z0-9])(?:' + p + ')(?![a-z0-9])', 'g') }, extra)));
    });
    out.sort((a, b) => b.src.length - a.src.length); // longest phrases first: « bleu canard » before « bleu »
    return out;
  }

  // Clause boundaries for negation scope: « pas de rose, plutôt du vert »
  const BOUND_RE = /[,;.!?]|(?:^|\s)(?:mais|plutot|et|ou|prefere|veux|voudrais|aime|par contre|sinon|alors)(?=\s|$)/g;
  const NEG_RE = /(?:^|\s)(?:pas|sans|ni|jamais|aucune?|sauf|non|evite[rz]?|eviter|deteste|horreur)(?=\s|$)/;
  function clauseBefore(s, idx, max) {
    const w = s.slice(Math.max(0, idx - (max || 36)), idx);
    let cut = 0;
    let m;
    BOUND_RE.lastIndex = 0;
    while ((m = BOUND_RE.exec(w)) !== null) { cut = m.index + m[0].length; if (!m[0].length) BOUND_RE.lastIndex++; }
    return w.slice(cut);
  }
  function negatedAt(s, idx) { return NEG_RE.test(' ' + clauseBefore(s, idx, 36)); }

  // Find every entry in t, longest first; a matched span is blanked so shorter words do not match it again
  function scan(t, entries) {
    const orig = ' ' + t + ' ';
    let s = orig;
    const hits = [];
    entries.forEach((e) => {
      e.re.lastIndex = 0;
      let m;
      while ((m = e.re.exec(s)) !== null) {
        const start = m.index + m[1].length;
        const end = m.index + m[0].length;
        if (end <= start) { e.re.lastIndex = m.index + 1; continue; }
        hits.push({ key: e.key, w: e.w, strong: !!e.strong, name: !!e.name, amb: !!e.amb, start: start, end: end, word: orig.slice(start, end), neg: negatedAt(orig, start) });
        s = s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);
        e.re.lastIndex = end;
      }
    });
    hits.sort((a, b) => a.start - b.start);
    return { hits: hits, rest: s, s: orig };
  }

  const NICHE_LEX = lex([
    [null, 0, ['a la maison', 'depuis la maison', 'de chez moi', 'orange money', 'mobile money', 'mode de (?:paiement|livraison)', 'paiements? a la livraison',
      'frais de livraison', 'en ligne', 'montrez?[ -]moi', 'ma boutique', 'mes produits', 'mes articles']],
    ['hair', 3, ['perruques?', 'meches?', 'tissages?', 'wigs?', 'lace ?wigs?', 'postiches?', 'lace frontales?', 'closures?', 'frontales?']],
    ['hair', 2, ['lace', 'cheveux', 'hair', 'extensions?', 'tresses?', 'kinky', 'bresiliennes?', 'greffes?', 'coiffures?', 'salon de coiffure', 'nattes?',
      'locks?', 'dreadlocks?', 'crochet braids?', 'braids?']],
    ['hair', 1, ['coiffeuses?', 'coiffeurs?', 'defrisants?', 'bob']],
    ['fashion', 3, ['robes?', 'pagnes?', 'wax', 'vetements?', 'habits?', 'boubous?', 'pret[ -]a[ -]porter', 'jupes?', 'pantalons?', 'chemises?', 'tee[ -]?shirts?',
      't[ -]shirts?', 'tshirts?', 'bazins?', 'abayas?', 'caftans?', 'kaftans?', 'dashikis?', 'friperies?', 'fripes?', 'yougou[ -]?yougou', 'lingerie', 'habillement',
      'tenues?', 'couture', 'couturieres?', 'couturiers?', 'stylistes?', 'kitas?', 'kente', 'costumes?', 'complets?', 'vestes?', 'jeans?', 'sweats?', 'hoodies?',
      'survetements?', 'maillots?', 'polos?', 'tailleurs?', 'tuniques?', 'blouses?', 'shorts?', 'leggings?', 'combinaisons?', 'pagnes? tisses?']],
    ['fashion', 2, ['mode', 'tissus?', 'fringues?', 'sapes?', 'streetwear']],
    ['fashion', 1, ['ensembles?', 'foulards?']],
    ['beauty', 3, ['karite', 'savons?', 'cremes?', 'cosmetiques?', 'parfums?', 'maquillage', 'make[ -]?up', 'rouges? a levres', 'serums?', 'lotions?', 'gommages?',
      'beurre de karite', 'savon noir', 'masques? (?:visage|pour le visage|du visage|a l\'argile|de beaute)', 'skin ?care', 'onglerie', 'vernis', 'faux cils', 'cils',
      'deodorants?', 'laits? (?:corporels?|de toilette|de corps)', 'gels? douche', 'shampo+ings?', 'soins? (?:du visage|du corps|de la peau|naturels?|capillaires?)',
      'huiles? (?:de coco|essentielles?|de beaute|pour le corps|de nigelle|d\'argan|de ricin)', 'beurres? (?:de cacao|corporels?)', 'esthetique', 'epilation',
      'manucure', 'pedicure', 'eaux? de (?:toilette|parfum)', 'gloss', 'fond de teint', 'mascara', 'eyeliner', 'cosmetics?']],
    ['beauty', 2, ['soins?', 'beaute', 'beurres?', 'ongles?', 'spa', 'hammam', 'peau']],
    ['beauty', 1, ['huiles?', 'bio']],
    ['jewellery', 3, ['bijoux?', 'bracelets?', 'colliers?', 'bagues?', 'montres', 'boucles? d\'oreilles?', 'creoles?', 'pendentifs?', 'gourmettes?', 'broches?',
      'chevilleres?', 'piercings?', 'joaillerie', 'bijouterie', 'parures? de bijoux', 'perles?', 'plaque or', 'sacs? a main', 'maroquinerie', 'lunettes?',
      'chaines? en or', 'alliances?']],
    ['jewellery', 2, ['accessoires?', 'sacs?', 'sacoches?', 'chaines?', 'chainettes?', 'portefeuilles?']],
    ['jewellery', 1, ['montre', 'pochettes?', 'ceintures?', 'porte[ -]?cles?']],
    ['shoes', 3, ['chaussures?', 'sneakers?', 'baskets?', 'sandales?', 'escarpins?', 'mocassins?', 'claquettes?', 'tapettes?', 'babouches?', 'bottes?', 'bottines?',
      'souliers?', 'nu[ -]pieds?', 'tongs?', 'spartiates?', 'ballerines?', 'mules?', 'derbies', 'cordonneries?', 'cordonniers?', 'talons? hauts?', 'chaussons?']],
    ['shoes', 2, ['talons?', 'pointures?', 'tennis', 'pompes?']],
    ['shoes', 1, ['chaussettes?']],
    ['food', 3, ['attieke', 'garba', 'allocos?', 'gateaux?', 'patisseries?', 'bissap', 'traiteurs?', 'foutou', 'placali', 'kedjenou', 'beignets?', 'croissants?',
      'yaourts?', 'degue', 'gnamank?oudji', 'restaurants?', 'resto', 'maquis', 'cupcakes?', 'brochettes?', 'choukouya', 'claclo', 'pizzas?', 'burgers?',
      'sandwich(?:s|es)?', 'pate d\'arachide', 'beurre d\'arachide', 'beurre de cacahuetes?', 'sauce (?:graine|arachide|claire|gombo|feuille)', 'kabato', 'foufou',
      'thieb(?:oudienne)?', 'tieb', 'mafe', 'yassa', '(?:poulet|poisson) braise', 'creme glacee', 'glaces?', 'cakes?', 'biscuits?', 'confitures?', 'repas',
      'nourriture', 'alimentation', 'aliments?', 'plats? (?:maison|cuisines?|du jour|ivoiriens?)', 'faite?s? maison', 'cuisine (?:ivoirienne|africaine|maison)',
      'jus', 'epiceries?', 'boulangerie', 'buffets?', 'dibi', 'riz gras', 'miel', 'chocolats?', 'bonbons?', 'viennoiseries?', 'crepes?', 'gaufres?',
      'fatayas?', 'samoussas?', 'nems?', 'poulets?', 'poissons?', 'viandes?', 'legumes?', 'fruits?', 'epices?', 'piments?', 'condiments?', 'boissons?',
      'cuisine (?:de|du) (?:maman|chez moi)']],
    ['food', 2, ['cuisine', 'cuisiner', 'cuisinier', 'cuisiniere', 'manger', 'plats?', 'riz', 'sauces?', 'pains?', 'bananes?', 'plantains?', 'ignames?', 'manioc',
      'gingembre', 'cafe']],
    ['food', 1, ['evenementiel']],
    ['home', 3, ['deco', 'decoration', 'decorations', 'coussins?', 'bougies?', 'vaisselle', 'linge de maison', 'draps?', 'rideaux?', 'meubles?', 'tapis', 'vases?',
      'assiettes?', 'ustensiles?', 'casseroles?', 'lampes?', 'luminaires?', 'plaids?', 'nappes?', 'literie', 'matelas', 'parures? de lit', 'linge de lit',
      'electromenager', 'cadres? photos?', 'miroirs?', 'diffuseurs?', 'art de la table', 'torchons?', 'mobilier', 'salle de bain',
      'articles? (?:de|pour la) (?:maison|cuisine)', 'ustensiles? de cuisine', 'deco(?:ration)? d\'interieur', 'interieur', 'senteurs?', 'encens',
      'serviettes? de bain', 'housses?', 'verres?', 'tasses?']],
    ['home', 2, ['linge', 'rangements?', 'serviettes?']],
    ['home', 1, ['maison']],
    ['crafts', 3, ['artisanat', 'artisan(?:e|s|es)?', 'artisanale?s?', 'artisanaux', 'sculptures?', 'sculpteurs?', 'paniers?', 'vannerie', 'poteries?', 'potiers?',
      'potieres?', 'raphia', 'rotin', 'bois sculptes?', 'batik', 'statuettes?', 'calebasses?', 'objets? d\'art', 'tisserands?', 'macrame', 'tricot', 'ceramiques?',
      'terre cuite', 'toiles? (?:de korhogo|peintes?)', 'tableaux?', 'peintures?', 'corbeilles?', 'jarres?', 'tam[ -]tams?', 'djembes?',
      'masques? (?:africains?|traditionnels?|en bois|baoule|dan|senoufo)', 'cuir artisanal']],
    ['crafts', 2, ['faite?s? (?:a la )?main', 'fait a la main', 'toiles?', 'masques?', 'crochet', 'bois', 'perlage']],
    ['crafts', 1, ['cuir']]
  ]);

  // Things people sell that the 8 example stores do not cover yet: said honestly
  const UNSUPPORTED_LEX = lex([
    ['une boutique de téléphones', 1, ['telephones?', 'portables?', 'smartphones?', 'iphones?', 'telephonie']],
    ['une boutique d’accessoires de téléphone', 1, ['ecouteurs?', 'chargeurs?', 'coques?', 'power ?banks?']],
    ['une boutique d’électronique', 1, ['electroniques?', 'televiseurs?', 'tele', 'consoles?', 'jeux videos?']],
    ['une boutique d’informatique', 1, ['ordinateurs?', 'informatique', 'pc']],
    ['une boutique de voitures et de pièces auto', 1, ['voitures?', 'pieces? (?:auto|detachees)', 'motos?', 'pneus?']],
    ['une librairie', 1, ['librairie', 'livres? scolaires?', 'fournitures?(?: scolaires?)?']],
    ['une boutique de jouets', 1, ['jouets?']],
    ['une pharmacie', 1, ['pharmacie', 'medicaments?']],
    ['une boutique de crédit téléphonique', 1, ['credits? (?:telephoniques?|de communication)', 'unites']],
    ['une boutique de gaz', 1, ['gaz', 'bouteilles? de gaz']],
    ['une agence immobilière', 1, ['immobilier', 'terrains?', 'appartements?']]
  ]);

  const STYLE_LEX = lex([
    ['plateau', 2, ['chics?', 'chiques?', 'luxe', 'luxueux', 'luxueuses?', 'elegante?s?', 'elegance', 'haut de gamme', 'haut[ -]gamme', 'premium', 'prestige',
      'raffinee?s?', 'glamour', 'magazine', 'editorial(?:e|es)?', 'classe', 'sobres?', 'sobriete', 'intemporel(?:le)?s?', 'distinguee?s?', 'bcbg', 'select',
      'serieux', 'classy'], { strong: true }],
    ['plateau', 1, ['classiques?', 'epuree?s?', 'professionnel(?:le)?s?', 'pro', 'noir et blanc']],
    ['cocody', 2, ['doux', 'douce', 'douceur', 'pastels?', 'minimal(?:e|es|iste|istes)?', 'tendres?', 'cosy', 'cocooning', 'mignon(?:ne)?s?', 'arrondie?s?', 'zen',
      'apaisante?s?', 'delicate?s?', 'romantiques?', 'girly', 'feminine?s?', 'tout en douceur'], { strong: true }],
    ['cocody', 1, ['naturel(?:le)?s?', 'nature', 'simples?', 'simplicite', 'calme', 'legere?s?', 'legers', 'clean', 'propre', 'soft', 'rond', 'bio', 'sympa']],
    ['treichville', 2, ['audacieux', 'audacieuses?', 'audace', 'street', 'streetwear', 'flashy', 'fluo', 'punchy', 'tape[ -]a[ -]l\'?o?e?il', 'qui claque', 'ca claque',
      'qui pete', 'ca pete', 'bling(?:[ -]bling)?', 'osee?s?', 'percutante?s?', 'gros titres', 'hype', 'swag', 'funky', 'pop', 'qui se voit',
      'qu\'on remarque', 'qui se remarque', 'attire(?:r)? l\'?o?e?il', 'attire(?:r)? le regard', 'energiques?'], { strong: true }],
    ['treichville', 1, ['colore(?:e|es|s)?', 'couleurs? vives?', 'fun', 'jeunes?', 'jeunesse', 'dynamiques?', 'fort', 'forte', 'vifs?', 'vives?', 'vivante?s?',
      'originale?s?', 'originaux', 'voyante?s?', 'urbain(?:e|s|es)?', 'cool', 'branchee?s?', 'energie', 'choc', 'modernes?', 'sport(?:if|ive|s)?', 'rock', 'impact']],
    ['plateau', 2, ['plateau'], { name: true }],
    ['cocody', 2, ['cocody'], { name: true }],
    ['treichville', 2, ['treichville', 'treich'], { name: true }]
  ]);

  // Plain colour words; AMB = colours that are also products (« du karité », « jus de mangue », « thé à la menthe »)
  const AMB = { amb: true };
  const PALETTE_LEX = lex([
    [null, 0, ['orange money', 'savon noir', 'rouges? a levres', 'beurre de karite', 'karite de korhogo', 'savon au karite', 'black friday', 'liste noire', 'marche noir',
      'cafe au lait de', 'jus d\'orange', 'eau de rose', 'the a la menthe', 'jus de mangue', 'bissap', 'creme glacee']],
    ['sable', 1, ['noir et blanc', 'blanc et noir', 'blanc casse', 'blancs?', 'blanches?', 'neutres?', 'gris', 'grises?', 'ecru', 'monochrome', 'white', 'grey', 'gray']],
    ['sable', 1, ['sable', 'ivoire'], AMB],
    ['karite', 1, ['marrons?', 'beiges?', 'bruns?', 'brunes?', 'terracotta', 'nude', 'camel', 'taupe', 'brown']],
    ['karite', 1, ['cafe au lait', 'terre cuite', 'cremes?', 'caramel', 'chocolat', 'cafe', 'terre', 'karite', 'noisette', 'cuivre', 'cognac'], AMB],
    ['lagune', 1, ['bleu canard', 'bleu petrole', 'bleu[ -]vert', 'vert d\'eau', 'bleu ciel', 'bleu clair', 'bleu turquoise', 'bleu lagon', 'turquoises?', 'sarcelle',
      'petrole', 'teal', 'cyan', 'aqua']],
    ['lagune', 1, ['lagune', 'lagon', 'ocean'], AMB],
    ['hibiscus', 1, ['rose poudre', 'vieux rose', 'rose bonbon', 'roses?', 'fuchsia', 'rouges?', 'bordeaux', 'magenta', 'corail', 'grenat', 'pink', 'red']],
    ['hibiscus', 1, ['framboise', 'hibiscus', 'cerise'], AMB],
    ['indigo', 1, ['bleu marine', 'bleu nuit', 'bleu roi', 'bleu fonce', 'bleu royal', 'bleu electrique', 'bleus?', 'bleues?', 'marine', 'violets?', 'violettes?',
      'mauves?', 'lilas', 'pourpre', 'blue', 'purple']],
    ['indigo', 1, ['indigo', 'lavande', 'prune'], AMB],
    ['mangue', 1, ['jaune moutarde', 'oranges?', 'jaunes?', 'moutarde', 'ocre', 'doree?s?', 'ambre', 'yellow']],
    ['mangue', 1, ['mangue', 'soleil', 'abricot', 'peche', 'or'], AMB],
    ['menthe', 1, ['vert fonce', 'vert bouteille', 'vert foret', 'vert sapin', 'vert emeraude', 'vert olive', 'verts?', 'vertes?', 'emeraude', 'kaki', 'green', 'jade']],
    ['menthe', 1, ['menthe', 'sapin', 'olive', 'sauge'], AMB],
    ['nuit', 1, ['vert fluo', 'vert citron', 'jaune fluo', 'vert anis', 'noirs?', 'noires?', 'sombres?', 'foncee?s?', 'dark', 'black', 'fluo']],
    ['nuit', 1, ['nuit', 'citron vert', 'lime'], AMB]
  ]);
  // Moods, read only when the question is about colours
  const MOOD_LEX = lex([
    ['light', 1, ['pastels?', 'claire?s?', 'clairs', 'doux', 'douces?', 'legere?s?', 'legers', 'tendres?', 'lumineuse?s?', 'lumineux', 'pales?', 'naturel(?:le)?s?']],
    ['vivid', 1, ['vifs?', 'vives?', 'coloree?s?', 'colores', 'chaude?s?', 'chauds', 'eclatante?s?', 'pop', 'gaie?s?', 'gais']],
    ['dark', 1, ['flashy', 'fonce', 'nocturne', 'mysterieux']],
    ['cool', 1, ['froide?s?', 'froids', 'calmes?']]
  ]);

  const NEEDS_LEX = lex([
    ['cod', 1, ['paiements? a la livraison', 'payer a la livraison', 'paye a la livraison', 'payement a la livraison', 'paiement livraison', 'cash a la livraison',
      'paiements? cash', 'cash', 'especes', 'en liquide', 'cod', 'contre[ -]remboursement', 'paiement a la reception', 'payer a la reception', 'a la livraison']],
    ['whatsapp', 1, ['commandes? (?:sur|par|via) whats ?app', 'whats ?app', 'watsa?pp?', 'whatsap', 'wa', 'wtsp']],
    ['delivery', 1, ['livraisons? par communes?', 'frais de livraison', 'zones? de livraison', 'livraisons?', 'livrer', 'livre', 'livrez', 'livrons', 'livreurs?',
      'zones?', 'communes?', 'expeditions?', 'expedier']],
    ['reviews', 1, ['avis clients?', 'avis', 'temoignages?', 'commentaires?', 'etoiles?', 'notes? clients?', 'retours? clients?']],
    ['categories', 1, ['categories? de produits', 'categories?', 'rayons?', 'familles? de produits']],
    ['announcement', 1, ['bandeaux? d\'annonces?', 'bandeaux?', 'annonces?', 'message (?:en haut|d\'accueil)', 'banniere d.annonce']]
  ]);

  // Places. Abidjan communes and neighbourhoods give « Yopougon, Abidjan » (so delivery covers the communes)
  const PLACES = [];
  function place(re, display, type) { PLACES.push([re, display, type]); }
  [['abobo', 'Abobo'], ['adjame', 'Adjamé'], ['attecoube', 'Attécoubé'], ['cocody', 'Cocody'], ['koumassi', 'Koumassi'], ['marcory', 'Marcory'], ['plateau', 'Plateau'],
    ['port[ -]?bouet', 'Port-Bouët'], ['treichville|treich', 'Treichville'], ['yopougon|yop(?: city)?', 'Yopougon'], ['bingerville', 'Bingerville'], ['anyama', 'Anyama'],
    ['songon', 'Songon'], ['riviera(?: [0-9]| palmeraie| golf| bonoumin)?', 'Riviera'], ['angre', 'Angré'], ['(?:2|deux|ii) plateaux', 'Deux-Plateaux'],
    ['palmeraie', 'Palmeraie'], ['faya', 'Faya'], ['zone 4', 'Zone 4'], ['bietry', 'Biétry'], ['williamsville', 'Williamsville'], ['niangon', 'Niangon'],
    ['sideci', 'Sideci'], ['vridi', 'Vridi'], ['gonzagueville', 'Gonzagueville'], ['blockhaus', 'Blockhaus'], ['mermoz', 'Mermoz'], ['danga', 'Danga'],
    ['saint[ -]jean', 'Saint-Jean'], ['anono', 'Anono'], ['abatta', 'Abatta'], ['dokui', 'Dokui'], ['avocatier', 'Avocatier'], ['koweit', 'Koweït'],
    ['selmer', 'Selmer'], ['toits rouges', 'Toits-Rouges'], ['remblais', 'Remblais'], ['anoumabo', 'Anoumabo'], ['belleville', 'Belleville']
  ].forEach((p) => place(p[0], p[1], 'abj'));
  place('abidjan|abj|babi', 'Abidjan', 'abidjan');
  [['bouake', 'Bouaké'], ['yamoussoukro|yakro', 'Yamoussoukro'], ['san[ -]?pedro', 'San-Pédro'], ['korhogo', 'Korhogo'], ['daloa', 'Daloa'], ['man', 'Man'],
    ['gagnoa', 'Gagnoa'], ['grand[ -]bassam|bassam', 'Grand-Bassam'], ['abengourou', 'Abengourou'], ['divo', 'Divo'], ['soubre', 'Soubré'], ['odienne', 'Odienné'],
    ['seguela', 'Séguéla'], ['bondoukou', 'Bondoukou'], ['ferkessedougou|ferke', 'Ferkessédougou'], ['katiola', 'Katiola'], ['dimbokro', 'Dimbokro'],
    ['sassandra', 'Sassandra'], ['aboisso', 'Aboisso'], ['adzope', 'Adzopé'], ['agboville', 'Agboville'], ['dabou', 'Dabou'], ['jacqueville', 'Jacqueville'],
    ['assinie', 'Assinie'], ['bonoua', 'Bonoua'], ['toumodi', 'Toumodi'], ['issia', 'Issia'], ['sinfra', 'Sinfra'], ['duekoue', 'Duékoué'], ['guiglo', 'Guiglo'],
    ['tiassale', 'Tiassalé'], ['oume', 'Oumé'], ['touba', 'Touba'], ['boundiali', 'Boundiali'], ['lakota', 'Lakota'], ['daoukro', 'Daoukro'], ['bouafle', 'Bouaflé'],
    ['tengrela', 'Tengréla'], ['grand[ -]lahou', 'Grand-Lahou'], ['dakar', 'Dakar'], ['bamako', 'Bamako'], ['ouagadougou|ouaga', 'Ouagadougou'], ['lome', 'Lomé'],
    ['cotonou', 'Cotonou'], ['accra', 'Accra'], ['conakry', 'Conakry'], ['douala', 'Douala'], ['yaounde', 'Yaoundé'], ['niamey', 'Niamey'], ['lagos', 'Lagos'],
    ['paris', 'Paris'], ['lyon', 'Lyon'], ['marseille', 'Marseille'], ['bruxelles', 'Bruxelles'], ['montreal', 'Montréal']
  ].forEach((p) => place(p[0], p[1], 'city'));
  const PLACE_TYPE = {};
  PLACES.forEach((p) => { PLACE_TYPE[p[1]] = p[2]; });
  const PLACE_LEX = lex([].concat(PLACES.map((p) => [p[1], 1, [p[0]]])));

  /* ================================================================== intents */

  const W = (body) => new RegExp('(?:^|\\s)(?:' + body + ')(?=\\s|$)');
  const CORRECTION_RE = W('non|plutot|en fait|finalement|change[rz]?|changement|mets?|mettez|mettre|remplace[rz]?|je prefere|prefere|je voulais dire|pardon|oups|oops|' +
    'erreur|modifie[rz]?|corrige[rz]?|correction|enleve[rz]?|retire[rz]?|ajoute[rz]?|remets?|remettez|passe[rz]? en|a la place|au lieu');
  const SALES_RE = W('je vends?|je vend|j\'vends|jvds?|jvends?|je vds?|jfais|on vend|nous vendons|je fais|on fait|nous faisons|je propose|on propose|nous proposons|je suis dans|on est dans|' +
    'specialisee?s? (?:en|dans)|mon (?:business|commerce|activite|truc|domaine) c\'est|moi c\'est|c\'est des|c\'est du|c\'est de la|je travaille dans|je cuisine|' +
    'je couds|je fabrique|je cree|je coiffe|je revends|je commercialise|vente de|vendeuse de|vendeur de|en fait je|ma boutique vend|on vendra|je vendrai|' +
    'je vendais|je vais vendre|je veux vendre|nous faisons');
  const STYLE_FIELD_RE = W('style|styles|look|ambiance|design|modele|modeles|template|genre|allure|theme|apparence|rendu|mise en page');
  const PALETTE_FIELD_RE = W('couleurs?|teintes?|palettes?|tons?|coloris|fond');
  const CONTACT_FIELD_RE = W('numero|num|whatsapp|tel|telephone|ville|commune|quartier|habite|j\'habite');
  const AUTO_RE = W('choisi[st]? pour moi|choisissez pour moi|choisis toi|choisissez vous|comme tu veux|comme vous voulez|comme tu le sens|peu importe|n\'importe|' +
    'n\'importe laquelle|n\'importe lequel|je (?:ne )?sais pas|j\'sais pas|je sais pas trop|chais pas|sais pas|aucune idee|a toi de voir|a vous de voir|' +
    'surprends?[ -]moi|surprenez[ -]moi|ca m\'est egal|egal|je te laisse(?: choisir)?|je vous laisse(?: choisir)?|propose|proposez|propose[rz]?[ -]moi|' +
    'decide[sz]?|tu decides|vous decidez|par defaut|ce que tu veux|ce que vous voulez|pas d\'idee|ce qui va le mieux|ce qui marche le mieux');
  const HELP_RE = W('aide|aidez[ -]moi|aide[ -]moi|help|explique[rz]?|expliquer|explication|c\'est quoi|ca veut dire|veut dire quoi|quelle difference|la difference|' +
    'difference|je (?:ne )?comprends? pas|comprends pas|comment ca|lequel|laquelle|tu conseilles|vous conseillez|conseill(?:e|es|ez|er)|conseils?|recommande[rz]?|' +
    'tu recommandes|que choisir|quoi choisir|j\'hesite|hesite|c\'est a dire');
  const RESTART_RE = W('recommencer|recommence|recommencons|on recommence|reprendre (?:depuis |du |au )?(?:le )?debut|repartir (?:de|a) zero|tout effacer|' +
    'efface tout|tout reprendre|reset|reinitialiser|tout recommencer');
  const OPEN_RE = W('ouvr(?:e|ez|ir|ons)|editeur|on y va|c\'est parti|go|lance[rz]?|on lance|valide[rz]?|je valide|termine[rz]?|fini|j\'ai fini|c\'est tout bon');
  const BACK_RE = W('retour|revenir|reviens|revenons|question precedente|question d\'avant|en arriere|etape precedente');
  const YES_RE = /^(?:oui|ouais|ouai|ouii+|ok+|okay|d'accord|dac|daccord|ca marche|parfait|exact|exactement|c'est ca|c'est bien ca|c'est bon|bien sur|yes|yep|vas[ -]y|allez|valide|ca me va|tout a fait|absolument|carrement|grave|voila|nickel|super|top|cool|bien|tres bien|go)(?:\s|$)/;
  const NO_RE = /^(?:non|nan|no|nope|pas du tout|pas ca|c'est pas ca|ce n'est pas ca|faux|c'est faux|erreur|mauvais|pas bon|pas vraiment)(?:\s|$)/;
  const GREET_RE = /^(?:bonjour|bonsoir|salut|hello|coucou|bjr|slt|cc|hey|yo|allo|hi|bonne journee|bonne soiree)(?: (?:a vous|a toi|toi|tout le monde|jeere|l'assistant|assistant|madame|monsieur))?(?: [!.,?])*$/;
  const THANKS_RE = /^(?:merci|thanks|thank you|merci beaucoup|merci bien|super merci|ok merci|merci a vous|merci a toi|mrc|mci|cool merci|top merci|parfait merci)(?: [!.,])*$/;
  const QUESTION_START_RE = /^(?:est[ -]ce que|est[ -]ce qu'|comment|combien|pourquoi|quand|quel|quelle|quels|quelles|je peux|on peut|peut[ -]on|puis[ -]je|ca coute|y a[ -]t[ -]il|il y a)(?:\s|$)/;
  const NONAME_RE = W('pas (?:encore )?de nom|aucun nom|sans nom|je n\'ai pas (?:encore )?de nom|j\'ai pas (?:encore )?de nom|pas encore trouve|aucune idee|' +
    'je (?:ne )?sais pas|j\'sais pas|chais pas|sais pas|trouve[rz]?(?:[ -]moi)? un nom|propose[rz]?(?:[ -]moi)? un nom|plus tard|je verrai|on verra|pas encore|' +
    'je n\'ai pas encore choisi|pas encore choisi|a trouver');
  const NOPHONE_RE = W('plus tard|pas maintenant|pas (?:de|d\'|encore de) (?:numero|whatsapp|tel|telephone)|sans (?:numero|whatsapp)|' +
    'je n\'ai pas (?:de |d\'|encore de )?(?:whatsapp|numero)|j\'ai pas (?:de |d\'|encore de )?(?:whatsapp|numero)|je (?:le )?donnerai|je prefere (?:pas|ne pas)|' +
    'prefere ne pas|pas pour l\'instant|pour l\'instant non|non merci|je l\'ajouterai|apres');
  const CITY_MARKER_RE = W('je suis (?:a|de|au|sur|base|basee|installee?)|on est (?:a|au|sur)|nous sommes (?:a|au)|basee? a|installee? a|j\'habite|je vis a|ma ville|' +
    'ville|commune|quartier|depuis');

  const FAQ = [
    { re: W('gratuit|gratuite|combien|prix|tarifs?|cout|coute|coutera|abonnement|payant|commission'),
      a: 'Ce prototype est gratuit, et Jeere n’est pas encore lancé. Pour connaître les prix dès qu’ils sont fixés, rejoignez la liste d’attente sur la page d’accueil.' },
    { re: /(?:modifier|changer|corriger|retoucher).*(?:apres|ensuite|plus tard)|(?:apres|ensuite|plus tard).*(?:modifier|changer|corriger)/,
      a: 'Oui : tout se change ensuite dans l’éditeur, les textes, les produits, les couleurs et les photos.' },
    { re: W('photos?|images?'), a: 'Vous ajouterez vos vraies photos dans l’éditeur. En attendant, je mets des illustrations de vos produits.' },
    { re: W('publier|publie|en ligne|lien|url|site|mettre en ligne|visible|clients? voir'),
      a: 'C’est un prototype : rien n’est publié, et vos réponses restent dans ce navigateur.' },
    { re: W('ia|intelligence artificielle|robot|bot|humain|chatgpt|vrai|une personne'),
      a: 'Je suis une démo : je comprends des mots-clés, sans IA. Dans Jeere, une seule IA répondra à ma place et remplira la même fiche boutique.' },
    { re: W('paiement|payer|wave|orange money|mtn|moov|mobile money|momo'),
      a: 'Vos clients pourront payer par Wave, Orange Money, MTN MoMo ou Moov Money, ou à la livraison. Vous cocherez vos moyens de paiement dans l’éditeur.' }
  ];

  /* ================================================================== detectors (pure) */

  function detectNiche(t) {
    const r = scan(t, NICHE_LEX);
    const score = {};
    const first = {};
    r.hits.forEach((h) => {
      if (!h.key || h.neg) return;
      score[h.key] = (score[h.key] || 0) + h.w;
      if (first[h.key] === undefined) first[h.key] = h.start;
    });
    const keys = Object.keys(score).sort((a, b) => (score[b] - score[a]) || (first[a] - first[b]));
    const out = { value: null, score: 0, alt: null, conf: 0, rest: r.rest, unsupported: null, hits: r.hits };
    if (keys.length) {
      out.value = keys[0];
      out.score = score[keys[0]];
      if (keys[1] && score[keys[1]] >= 2) out.alt = keys[1];
      out.conf = out.score >= 3 ? 0.95 : out.score >= 2 ? 0.8 : 0.55;
      if (keys[1] && score[keys[1]] === out.score) out.conf -= 0.2;
    } else {
      const u = scan(t, UNSUPPORTED_LEX).hits.filter((h) => !h.neg)[0];
      if (u) out.unsupported = u.key;
    }
    return out;
  }

  function detectStyle(t, lenientWords, lenientNames) {
    const r = scan(t, STYLE_LEX);
    const field = STYLE_FIELD_RE.test(t);
    const score = {};
    const first = {};
    const excluded = [];
    let strong = false;
    r.hits.forEach((h) => {
      if (!h.key) return;
      if (h.name && !(lenientNames || field)) return;
      if (!h.name && !h.strong && !lenientWords && !field) return;
      if (h.neg) { if (excluded.indexOf(h.key) < 0) excluded.push(h.key); return; }
      score[h.key] = (score[h.key] || 0) + h.w;
      if (first[h.key] === undefined) first[h.key] = h.start;
      if (h.strong || h.name) strong = true;
    });
    const keys = Object.keys(score).sort((a, b) => (score[b] - score[a]) || (first[a] - first[b]));
    const out = { value: keys[0] || null, strong: strong || field, excluded: excluded, inferred: false, conf: keys.length ? (score[keys[0]] >= 2 ? 0.9 : 0.65) : 0 };
    if (!out.value && excluded.length === 2) {
      // « ni trop chic ni trop flashy » -> the one left
      out.value = Object.keys(STYLE).filter((k) => excluded.indexOf(k) < 0)[0];
      out.inferred = true;
      out.conf = 0.6;
    }
    return out;
  }

  // Outside the colour question, a colour word counts only after « mets / change / plutôt / du / en … »
  // (« des robes en wax rouge » or « savon noir » are products, not a palette)
  function triggeredColor(s, idx, amb) {
    const w = s.slice(Math.max(0, idx - 26), idx);
    if (/(?:^|\s)(?:mets?|mettez|mettre|change[rz]?|passe[rz]?|prends?|prenez|veux|voudrais|prefere|aime|adore|plutot|couleurs?|palette|teintes?|tons?|fond|theme)\s+(?:\S+\s+)?$/.test(w)) {
      // « je veux du karité » is a product; « je veux la palette karité » or « mets karité » is a colour
      return !amb || !/(?:^|\s)(?:veux|voudrais|prends?|prenez|aime|adore)\s+(?:du|de la|des|un|une)\s+$/.test(w);
    }
    return !amb && /(?:^|\s)(?:en|du|tout en)\s+$/.test(w);
  }

  function detectPalette(t, lenient, moods, ctx) {
    const r = scan(t, PALETTE_LEX);
    const field = PALETTE_FIELD_RE.test(t);
    const out = { value: undefined, excluded: [], excludedWords: [], auto: false, word: null, mood: null };
    const pos = [];
    r.hits.forEach((h) => {
      if (!h.key) return;
      if (!lenient && !(field && !h.amb) && !triggeredColor(r.s, h.start, h.amb)) return;
      if (h.neg) { if (out.excluded.indexOf(h.key) < 0) { out.excluded.push(h.key); out.excludedWords.push(h.word.trim()); } return; }
      pos.push(h);
    });
    if (pos.length) { out.value = pos[0].key; out.word = pos[0].word.trim(); return out; }
    if (moods) {
      const m = scan(r.rest.trim(), MOOD_LEX).hits.filter((h) => !h.neg)[0];
      if (m) {
        out.mood = m.key;
        const nichePal = ctx && ctx.niche && D() && known(D().niches, ctx.niche) ? D().niches[ctx.niche].palette : null;
        if (m.key === 'light') out.value = nichePal && nichePal !== 'nuit' ? nichePal : (nichePal ? 'sable' : null);
        else if (m.key === 'vivid') out.value = 'mangue';
        else if (m.key === 'dark') out.value = 'nuit';
        else if (m.key === 'cool') out.value = 'indigo';
        out.word = m.word.trim();
        if (out.value !== undefined) return out;
      }
    }
    if (lenient && AUTO_RE.test(t)) { out.auto = true; out.value = null; }
    return out;
  }

  const NEED_SPLIT = /\s*(,|;|\.|!|\?|\bmais\b|\bpar contre\b|\bpuis\b|\bet\b|\bsauf\b|\ba part\b|\bexcepte\b|\bhormis\b|\bsans\b|\bni\b|\bou\b)\s*/g;
  const NEED_NEG = W('pas|aucune?|jamais|enleve[rz]?|enlever|retire[rz]?|supprime[rz]?|vire[rz]?|desactive[rz]?|inutile|non|oublie[rz]?|zappe[rz]?|rien|laisse tomber|pas besoin');
  const NEED_POS = W('avec|ajoute[rz]?|remets?|remettez|garde[rz]?|gardez|mets?|mettez|je veux|il faut|j\'ai besoin|besoin|active[rz]?|oui|inclus|inclure|conserve[rz]?|aussi|veux');
  const NEED_ALL = W('tout|toutes|tous|tout ca|l\'ensemble|les six|les 6');
  const NEED_NONE = /^(?:rien|aucun|aucune|aucune option|rien du tout|non merci|pas d'options?|le minimum|rien de tout ca|aucun des deux|zero|nada|aucun besoin|enleve tout|retire tout|supprime tout)$/;
  const NEED_ONLY = /(?:^|\s)(?:seulement|juste|uniquement|rien que|only)(?:\s|$)|(?:^|\s)ne \S+ que(?:\s|$)|(?:^|\s)que (?:le |la |les |l'|du |des )?(?=whats|livr|paiement|cash|avis|categ|bandeau|annonce)/;
  const NEED_CONFIRM = /^(?:c'est bon|c'est ok|ca me va|ca va|continue[rz]?|suivant|next|on continue|valide[rz]?|ok c'est bon|c'est parfait|parfait|ok|oui|d'accord|nickel|super|top|go|garde ca|comme ca)(?:\s|$)/;
  const LIST_STOP = new Set(['le', 'la', 'les', 'l\'', 'de', 'des', 'du', 'd\'', 'et', 'avec', 'un', 'une', 'mes', 'nos', 'ma', 'mon', 'sur', 'par', 'pour', 'aussi', 'a', 'au',
    'aux', 'en', 'seulement', 'juste', 'uniquement', 'que', 'ne', 'je', 'veux', 'oui', 'ok', 'clients', ',', '.', ';', '!', '?']);

  function clausesOf(t) {
    const out = [];
    let last = 0;
    let sep = '';
    let m;
    NEED_SPLIT.lastIndex = 0;
    while ((m = NEED_SPLIT.exec(t)) !== null) {
      out.push({ text: t.slice(last, m.index), sep: sep });
      last = m.index + m[0].length;
      sep = m[1];
    }
    out.push({ text: t.slice(last), sep: sep });
    return out;
  }

  function detectNeeds(t, lenient) {
    const out = { mode: null, patch: {}, mentioned: [] };
    if (lenient && NEED_NONE.test(t)) { out.mode = 'none'; out.patch = allNeeds(false); return out; }
    const cls = clausesOf(t);
    let baseline = null;
    cls.forEach((c) => {
      if (!baseline && NEED_ALL.test(c.text)) baseline = NEED_NEG.test(c.text) ? 'none' : 'all';
    });
    let prev = 0;
    const found = [];
    cls.forEach((c) => {
      const hits = scan(c.text, NEEDS_LEX).hits.filter((h) => h.key);
      let pol = 0;
      if (NEED_NEG.test(c.text)) pol = -1;
      else if (NEED_POS.test(c.text)) pol = 1;
      if (c.sep === 'sans' || c.sep === 'ni') pol = -1;
      else if (['sauf', 'a part', 'excepte', 'hormis'].indexOf(c.sep) >= 0) pol = baseline === 'none' ? 1 : -1;
      else if (c.sep === 'et' && pol === 0 && prev !== 0) pol = prev;
      if (hits.length) {
        prev = pol;
        hits.forEach((h) => found.push({ key: h.key, pol: pol }));
      } else if (c.text.trim() && pol !== 0 && !NEED_ALL.test(c.text)) prev = pol;
    });
    found.forEach((f) => { if (out.mentioned.indexOf(f.key) < 0) out.mentioned.push(f.key); });
    if (lenient && baseline) {
      out.mode = baseline;
      out.patch = allNeeds(baseline === 'all');
      found.forEach((f) => { if (f.pol !== 0) out.patch[f.key] = f.pol > 0; });
      return out;
    }
    if (!found.length) {
      if (lenient && NEED_CONFIRM.test(t)) out.mode = 'confirm';
      return out;
    }
    const only = NEED_ONLY.test(t);
    let listLike = false;
    if (lenient && !only) {
      const rest = scan(t, NEEDS_LEX).rest.trim();
      listLike = !rest || rest.split(/\s+/).every((w) => LIST_STOP.has(w));
    }
    if ((only || (listLike && found.every((f) => f.pol === 0))) && found.some((f) => f.pol >= 0)) {
      out.mode = 'only';
      out.patch = allNeeds(false);
      found.forEach((f) => { if (f.pol >= 0) out.patch[f.key] = true; });
      return out;
    }
    found.forEach((f) => {
      if (f.pol !== 0) out.patch[f.key] = f.pol > 0;
      else if (lenient) out.patch[f.key] = true;
    });
    if (Object.keys(out.patch).length) out.mode = 'patch';
    return out;
  }

  // Phone numbers: the longest run of at least 8 digits, with spaces, dots or dashes
  function findPhone(raw) {
    const re = /(?:\+|00)?\d[\d\s.\-/()]{6,24}\d/g;
    let best = null;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 16 && (!best || digits.length > best.digits.length)) best = { match: m[0], digits: digits };
    }
    if (!best) return null;
    const d = D();
    const number = d && d.normalizeWhatsapp ? d.normalizeWhatsapp(best.match) : '+' + best.digits;
    let issue = null;
    if (number.indexOf('+225') === 0) {
      const local = number.slice(4);
      if (local.length === 8) issue = 'old';
      else if (local.length !== 10) issue = 'length';
    } else if (!/^\+\d{8,15}$/.test(number)) issue = 'length';
    return { match: best.match, number: number, display: displayPhone(number), issue: issue };
  }
  function displayPhone(p) {
    const m = /^\+225(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(p || ''));
    return m ? '+225' + NB + m.slice(1).join(NB) : String(p || '');
  }

  const CITY_FILLER = new Set(('je j\' suis sommes est c\'est ce mon ma mes notre nos numero num tel telephone whatsapp wa contact ville quartier commune habite ' +
    'j\'habite vis vit base basee installe installee a au aux en dans sur de du des la le les l\' d\' et ou on nous moi voici voila ici pres cote vers chez joignable ' +
    'appelle appelez appelez-moi ecris ecrivez ecrire plus tard pas encore merci svp stp ok oui non bonjour salut and is my number c sais veux peux ' +
    'connais comprends ai as avez fais fait vais va donne donner c\'est-a-dire aussi bien voila n\'ai pas maintenant pour l\'instant mais bon alors donc ' +
    'il elle y the from in at boutique shop magasin pareil meme numero-whatsapp lieu adresse situe situee livre livrer livraison').split(/\s+/));
  const NONPLACE_RE = W('aide|help|comment|pourquoi|quoi|rien|aucun|aucune|idee|question|style|couleur|couleurs|avis|nom|merci|test|bonjour|salut');

  function detectCity(rawRest, t, lenient) {
    const r = scan(t, PLACE_LEX);
    const s = r.s;
    let area = null;
    let city = null;
    let abidjan = false;
    let strong = CITY_MARKER_RE.test(t);
    r.hits.forEach((h) => {
      if (h.neg) return;
      const type = PLACE_TYPE[h.key];
      if (/(?:^|\s)(?:a|au|depuis|vers|habite|viens de|suis de)\s+$/.test(s.slice(Math.max(0, h.start - 10), h.start))) strong = true;
      if (type === 'abidjan') abidjan = true;
      else if (type === 'abj' && !area) area = h.key;
      else if (type === 'city' && !city) city = h.key;
    });
    if (area) return { city: area + ', Abidjan', strong: strong, gaz: true, words: r.hits.map((h) => h.key) };
    if (city) return { city: city, strong: strong, gaz: true, words: r.hits.map((h) => h.key) };
    if (abidjan) return { city: 'Abidjan', strong: strong, gaz: true, words: ['Abidjan'] };
    if (!lenient) return null;
    // Unknown place: what is left once the filler words are gone (« je suis à Toulepleu » -> Toulepleu)
    if (AUTO_RE.test(t) || HELP_RE.test(t) || NOPHONE_RE.test(t) || NONPLACE_RE.test(t) || YES_RE.test(t) || NO_RE.test(t)) return null;
    const toks = String(rawRest).split(/[\s,;.!?:()«»"“”/]+/).filter(Boolean);
    const keep = toks.filter((w) => { const n = norm(w); return n && !CITY_FILLER.has(n) && !/\d/.test(n); });
    if (!keep.length || keep.length > 3) return null;
    const cand = keep.join(' ');
    if (cand.length > 40 || cand.length < 3 || !/^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]+$/.test(cand)) return null;
    // « je suis à Toulepleu » or « Tiébissou » yes; « grmbl » or « asdf » no
    const vowels = (fold(cand).match(/[aeiou]/g) || []).length;
    const marked = strong || /(?:^|\s)(?:a|au|depuis|vers)\s/.test(' ' + t + ' ');
    if (!vowels || (!marked && !/^[A-ZÀ-Ö]/.test(cand) && vowels < 2) || (!marked && !/[aeiou][^aeiou\s]*[aeiou]|^[^aeiou]*[aeiou][^aeiou]{0,2}$/.test(fold(cand)))) return null;
    return { city: cand.split(' ').map(cap).join(' '), strong: false, gaz: false, words: keep };
  }

  /* ---------- store name ---------- */

  const GREET_LEAD = /^(?:(?:bonjour|bonsoir|salut|hello|coucou|bjr|slt|hey|yo|cc)(?:\s+(?:a vous|a toi|l'assistant|assistant|jeere))?[\s,!.:;]*)+/;
  const NAME_MARKERS = [
    /(?:^|\s)(?:ma|notre|la|mon|sa) (?:petite )?(?:boutique|magasin|business|marque|page|entreprise|shop|store|commerce|structure|societe|enseigne|affaire|activite|compagnie)(?: (?:en ligne|a moi))? (?:s'appelle|s'appellera|se nomme|se nommera|c'est|ce sera|sera|est|=|:)\s*/g,
    /(?:^|\s)(?:elle|il|ca|cela) s'appel(?:le|lera)\s*/g,
    /(?:^|\s)(?:on|je|nous) (?:l'appel(?:le|lons|lerai|lera|lerons|lais)|la nomme|l'ai appelee?|l'avons appelee?|l'a appelee?)\s*/g,
    /(?:^|\s)(?:le|son) nom(?: de (?:la|ma|notre) boutique)?(?: c'est| est| sera| ce sera)?\s*[:=]?\s*/g,
    /(?:^|\s)(?:appelle|appelez|appelons|nomme|nommez|renomme|renommez)(?:[- ]la| la boutique| ma boutique)?\s+/g,
    /(?:^|\s)je (?:veux|voudrais|vais) (?:l'appeler|la nommer|appeler (?:ma|la) boutique)\s*/g,
    /(?:^|\s)change(?:r|z)? (?:le |son )?nom(?: de la boutique)? (?:en|pour|par|:)\s*/g
  ];
  const NAME_GENERIC = [/^nom\s*[:=]?\s+/g, /^(?:c'est|cest|c)\s+/g, /^(?:ca s'appelle|elle s'appelle)\s+/g];
  const PERSON_RE = /(?:^|\s)(?:je m'appelle|moi c'est|mon prenom (?:c'est|est)|mon petit nom c'est)\s+/g;
  const NAME_CUT_A = /\s*(?:[,;.!?]|\s(?:et|mais|puis))\s*(?=(?:je|j'|on|nous|jvds?|jvends?|jfais|mets?|mettez|change[rz]?|passe[rz]?|plutot|avec|sans|style|couleurs?|en fait)(?:\s|'|$))/;
  const NAME_CUT_B = /\s+(?=(?:(?:je|j'|on|nous) ?(?:vends?|vend|vds?|fais|fait|propose|suis|cuisine|couds|fabrique|cree|livre|travaille|veux|voudrais|habite)|jvds?|jvends?|jfais)(?:\s|$))/;
  const NAME_CUT_C = /[.!?](?:\s|$)/;
  const NAME_BAD = /^(?:oui|non|ok|okay|d'accord|rien|aucun|aucune|merci|bonjour|salut|test|nom|le nom|boutique|ma boutique|je|moi|quoi|hein|euh+|bof|ah|oh|hello|hi)$/;
  const NAME_STOP = new Set(['des', 'du', 'de', 'la', 'le', 'les', 'l\'', 'd\'', 'et', 'un', 'une', 'mes', 'nos', 'ma', 'mon', 'en', 'au', 'aux', 'a', 'beaucoup',
    'surtout', 'aussi', 'trucs', 'truc', 'choses', 'produits', 'articles', 'tout', 'ca', 'ce', 'vends', 'vend', 'je', 'moi', 'c\'est', 'on', 'fais', 'genre', 'plein',
    'quelques', 'bien', 'sur', 'pour', 'avec', ',', '.', '!', '?', ';']);

  function lastMarker(f, list, generic) {
    let best = null;
    list.forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(f)) !== null) {
        const end = m.index + m[0].length;
        if (!best || end > best.end) best = { start: m.index, end: end, generic: !!generic };
        if (!m[0].length) re.lastIndex++;
      }
    });
    return best;
  }
  function smartCase(s) {
    if (/[A-ZÀ-ÖØ-Þ]/.test(s)) return s; // typed with capitals: keep as typed
    const small = /^(?:de|du|des|la|le|les|et|d'|l'|d’|l’|à|au|aux|en|pour|sur|par)$/;
    return s.split(' ').map((w, i) => (i > 0 && small.test(w)) ? w : cap(w)).join(' ');
  }
  function cleanName(s) {
    s = String(s || '').replace(/\s+/g, ' ');
    for (let i = 0; i < 3; i++) {
      s = s.replace(/^[\s«»"“”'‘’:=\-–—,.!;]+/, '').replace(/[\s«»"“”'‘’,.;:!?\-–—]+$/, '')
        .replace(/\s+(?:merci(?: beaucoup)?|svp|stp|s['’]il (?:vous|te) pla[iî]t)$/i, '');
    }
    s = s.trim();
    // 40 characters, like the store name field of the editor (and schema.json)
    if (s.length > 40) s = s.slice(0, 41).replace(/\s+\S*$/, '').slice(0, 40).trim();
    return s;
  }
  function cutName(raw, f, from) {
    let end = raw.length;
    [NAME_CUT_A, NAME_CUT_B, NAME_CUT_C].forEach((re) => {
      const m = re.exec(f.slice(from));
      if (m && from + m.index < end && m.index > 0) end = from + m.index;
    });
    return { name: raw.slice(from, end), rest: raw.slice(end) };
  }
  function nicheOnly(candidate) {
    const t = norm(candidate);
    if (!t) return null;
    const nd = detectNiche(t);
    if (!nd.value || nd.score < 2) return null;
    const left = nd.rest.trim().split(/\s+/).filter((w) => w && !NAME_STOP.has(w));
    return left.length ? null : nd;
  }

  // Name step: « Ma boutique s’appelle Awa Beauté, je vends du karité » -> name + the rest for the other detectors
  function readName(raw) {
    const f = fold(raw);
    const g = GREET_LEAD.exec(f);
    const off = g ? g[0].length : 0;
    const out = { name: null, rest: raw.slice(off), person: null, skip: false, nicheOnly: null, greeting: false, hint: null };
    if (!raw.slice(off).trim()) { out.greeting = true; out.rest = ''; return out; }
    const fs = f.slice(off);
    const rs = raw.slice(off);
    const mk = lastMarker(fs, NAME_MARKERS) || lastMarker(fs, NAME_GENERIC, true);
    // « c’est gratuit ? », « comment ça ? » : a question, not a name
    if ((!mk || mk.generic) && /\?\s*$/.test(rs)) return out;
    if (!mk) {
      PERSON_RE.lastIndex = 0;
      const p = PERSON_RE.exec(fs);
      if (p) {
        const from = p.index + p[0].length;
        const cut = cutName(rs, fs, from);
        const words = cleanName(cut.name).split(' ').slice(0, 3).join(' ');
        const pn = /^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]{2,30}$/.test(words) && !nicheOnly(words) && !NAME_BAD.test(norm(words)) ? smartCase(words) : null;
        const andMore = /(?:^|\s)et (?:ma|la|mon) (?:boutique|magasin|marque)\s/.test(fs.slice(from));
        if (pn && !andMore) { out.person = pn.split(' ')[0]; out.rest = rs.slice(0, p.index) + ' ' + cut.rest; return out; }
        if (nicheOnly(cut.name)) { out.nicheOnly = nicheOnly(cut.name); out.rest = cut.name + ' ' + cut.rest; return out; }
      }
      if (NONAME_RE.test(norm(rs))) { out.skip = true; return out; }
    }
    const from = mk ? mk.end : 0;
    const cut = cutName(rs, fs, from);
    const name = cleanName(cut.name);
    out.rest = rs.slice(0, mk ? mk.start : 0) + ' ' + cut.rest;
    if (!name) return out;
    const nn = norm(name);
    if (!nn || NAME_BAD.test(nn) || !/[a-z0-9]/.test(nn)) return out;
    // « des perruques », « c’est du karité » : what they sell, not a name (« ma boutique s’appelle Perruques » stays a name)
    const only = (!mk || mk.generic) ? nicheOnly(name) : null;
    if (only) { out.nicheOnly = only; out.rest = rs; return out; }
    out.name = smartCase(name);
    const nd = detectNiche(nn);
    if (nd.value && nd.score >= 2) out.hint = nd.value;
    return out;
  }
  // Other steps: only an explicit « le nom c’est … », « appelle-la … », « change le nom en … »
  function readNameMarker(raw) {
    const f = fold(raw);
    const mk = lastMarker(f, NAME_MARKERS);
    if (!mk) return null;
    const cut = cutName(raw, f, mk.end);
    const name = cleanName(cut.name);
    const nn = norm(name);
    if (!name || !nn || NAME_BAD.test(nn)) return null;
    return { name: smartCase(name), rest: raw.slice(0, mk.start) + ' ' + cut.rest };
  }

  /* ================================================================== understand */

  const STEP_ALIAS = { style: 'template', couleur: 'palette', couleurs: 'palette', color: 'palette', colour: 'palette', city: 'contact', ville: 'contact',
    whatsapp: 'contact', phone: 'contact', nom: 'name', store: 'name', vente: 'niche', options: 'needs', fiche: 'summary', done: 'summary' };
  function normStep(step) {
    const s = STEP_ALIAS[step] || step;
    return STEPS.indexOf(s) >= 0 || s === 'summary' ? s : 'name';
  }
  function fieldStep(f) { return f === 'city' || f === 'whatsapp' ? 'contact' : f; }

  // The word as the seller typed it, accents included (« doré », not « dore »), to echo it back
  function typedWord(raw, w) {
    const i = fold(raw).indexOf(w);
    return i >= 0 ? raw.substr(i, w.length) : w;
  }

  function understandInner(text, stepIn, ctx) {
    const step = normStep(stepIn);
    const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 400);
    const res = { step: step, intent: 'unclear', value: undefined, confidence: 0, values: {}, explicit: {}, strong: {}, info: {} };
    if (!raw) return res;
    if (/^[?¿\s.]+$/.test(raw)) { res.intent = 'help'; res.confidence = 0.6; return res; }
    const tAll = norm(raw);
    const isQuestion = /\?/.test(raw) || QUESTION_START_RE.test(tAll);
    const correction = CORRECTION_RE.test(tAll);
    const summary = step === 'summary';
    res.info.correction = correction;
    res.info.question = isQuestion;

    if (RESTART_RE.test(tAll)) { res.intent = 'restart'; res.confidence = 0.9; return res; }

    // 1. store name
    let rest = raw;
    let nameRead = null;
    if (step === 'name') {
      nameRead = readName(raw);
      rest = nameRead.rest;
      if (nameRead.name) { res.values.name = nameRead.name; res.value = nameRead.name; res.confidence = nameRead.name.length <= 40 ? 0.85 : 0.6; }
      if (nameRead.person) res.info.person = nameRead.person;
      if (nameRead.hint) res.info.nameHint = nameRead.hint;
    } else {
      const nm = readNameMarker(raw);
      if (nm) { res.values.name = nm.name; res.explicit.name = res.strong.name = true; rest = nm.rest; }
    }

    // 2. phone number
    const phone = findPhone(rest);
    if (phone) {
      res.values.whatsapp = phone.number;
      res.explicit.whatsapp = res.strong.whatsapp = true;
      res.info.phone = phone.display;
      if (phone.issue) res.info.phoneIssue = phone.issue;
      rest = rest.replace(phone.match, ' ');
    }
    const t = norm(rest);
    const sales = SALES_RE.test(t);

    // 3. what they sell
    const nd = t ? detectNiche(t) : { value: null };
    if (nameRead && nameRead.nicheOnly) {
      res.values.niche = nameRead.nicheOnly.value;
      res.strong.niche = true;
      if (nameRead.nicheOnly.alt) res.info.nicheAlt = nameRead.nicheOnly.alt;
    } else if (nd.value) {
      const ok = step === 'niche' || sales || (summary && nd.score >= 3) || (correction && nd.score >= 3);
      if (ok) {
        res.values.niche = nd.value;
        res.strong.niche = true;
        res.explicit.niche = sales || correction || summary;
        if (nd.alt) res.info.nicheAlt = nd.alt;
      }
    }
    if (nd.unsupported && step === 'niche') res.info.unsupported = nd.unsupported;

    // 4. style
    const sd = t ? detectStyle(t, step === 'template' || summary, step === 'template') : { value: null, excluded: [] };
    if (sd.value) {
      res.values.template = sd.value;
      res.explicit.template = correction || STYLE_FIELD_RE.test(t) || summary;
      res.strong.template = sd.strong || res.explicit.template;
    }
    if (sd.excluded.length) res.info.excludedTemplates = sd.excluded;

    // 5. colours
    const pd = t ? detectPalette(t, step === 'palette' || summary, step === 'palette', ctx) : { value: undefined, excluded: [] };
    if (pd.value !== undefined && !(pd.auto && step !== 'palette')) {
      res.values.palette = pd.value;
      res.explicit.palette = correction || PALETTE_FIELD_RE.test(t) || summary || step === 'palette';
      res.strong.palette = true;
      if (pd.word) res.info.colorWord = typedWord(raw, pd.word);
      if (pd.auto) res.info.auto = true;
    }
    if (pd.excluded.length) { res.info.excludedPalettes = pd.excluded; res.info.excludedWords = pd.excludedWords; }

    // 6. options
    const ned = t ? detectNeeds(t, step === 'needs') : { mode: null };
    if (ned.mode && ned.mode !== 'confirm') {
      res.values.needs = ned.patch;
      res.explicit.needs = res.strong.needs = true;
      res.info.needsMode = ned.mode;
    } else if (ned.mode === 'confirm') res.info.needsMode = 'confirm';

    // 7. city
    const cd = t ? detectCity(rest, t, step === 'contact') : null;
    if (cd && !(sd.value && cd.words.length === 1 && /^(?:Cocody|Plateau|Treichville)$/.test(cd.words[0]) && !cd.strong)) {
      if (step === 'contact' || cd.strong || (summary && cd.gaz && !/^(?:Cocody|Plateau|Treichville)/.test(cd.city))) {
        res.values.city = cd.city;
        res.strong.city = true;
        res.explicit.city = cd.strong || summary || step === 'contact';
      }
    }
    if (step === 'contact' && NOPHONE_RE.test(t) && !phone) res.info.noPhone = true;
    // A number given ahead of time with a place next to it (« Yopougon 07 07 12 34 56 »): the place is the city
    if (phone && step !== 'contact' && res.values.city === undefined && t && !sd.value) {
      const words = t.split(' ').filter((x) => /[a-z]/.test(x)).length;
      const cp = detectCity(rest, t, words <= 3);
      if (cp && cp.city && (cp.gaz || words <= 3)) { res.values.city = cp.city; res.strong.city = true; res.explicit.city = true; }
    }
    // A colour alone while another question is asked (« vert » at the style question): note it for later
    if (t && !summary && (step === 'template' || step === 'needs' || step === 'contact') && res.values.palette === undefined &&
      !res.values.template && !res.values.niche && !res.values.needs && res.values.city === undefined && !phone && t.split(' ').length <= 3) {
      const pb = detectPalette(t, true, false, ctx);
      if (pb.value && !pb.auto) {
        res.values.palette = pb.value;
        res.strong.palette = true;
        res.explicit.palette = false;
        if (pb.word) res.info.colorWord = typedWord(raw, pb.word);
      }
    }

    // 8. the value for the step asked
    const helpFirst = HELP_RE.test(tAll) && isQuestion && (step === 'template' || step === 'palette');
    switch (step) {
      case 'niche':
        if (res.values.niche) { res.value = res.values.niche; res.confidence = nameRead ? 0.8 : (nd.conf || 0.8); }
        break;
      case 'template':
        if (res.values.template && !helpFirst) { res.value = res.values.template; res.confidence = sd.conf; }
        break;
      case 'palette':
        if (res.values.palette !== undefined && !helpFirst) {
          res.value = res.values.palette;
          res.confidence = pd.auto ? 0.7 : (pd.mood ? 0.6 : 0.9);
          if (pd.auto) res.intent = 'auto';
        }
        break;
      case 'needs':
        if (res.values.needs) { res.value = res.values.needs; res.confidence = 0.85; }
        else if (ned.mode === 'confirm') { res.value = {}; res.confidence = 0.8; }
        break;
      case 'contact':
        if (res.values.city !== undefined || res.values.whatsapp !== undefined) {
          res.value = {};
          if (res.values.city !== undefined) res.value.city = res.values.city;
          if (res.values.whatsapp !== undefined) res.value.whatsapp = res.values.whatsapp;
          res.confidence = res.values.whatsapp && !phone.issue ? 0.9 : 0.7;
        }
        break;
    }

    // 9. intent
    const others = Object.keys(res.values).filter((k) => fieldStep(k) !== step);
    if (res.value !== undefined) { if (res.intent !== 'auto') res.intent = 'answer'; return res; }
    if (step === 'name' && nameRead && nameRead.skip) { res.intent = 'auto'; res.confidence = 0.8; return res; }
    if (summary && Object.keys(res.values).length) { res.intent = 'correction'; res.confidence = 0.8; return res; }
    if (others.length) { res.intent = 'correction'; res.confidence = 0.75; return res; }
    if (step === 'name' && nameRead && nameRead.person) { res.intent = 'person'; res.confidence = 0.8; return res; }
    if (helpFirst || (HELP_RE.test(tAll) && !summary)) { res.intent = 'help'; res.confidence = 0.7; return res; }
    if ((step === 'template' || step === 'palette') && AUTO_RE.test(tAll)) { res.intent = 'auto'; res.confidence = 0.75; return res; }
    if (step === 'niche' && res.info.unsupported) { res.intent = 'unsupported'; res.confidence = 0.8; return res; }
    if (step === 'template' && sd.excluded.length) { res.intent = 'excluded'; res.confidence = 0.6; return res; }
    if (step === 'palette' && pd.excluded.length) { res.intent = 'excluded'; res.confidence = 0.6; return res; }
    if (step === 'contact' && res.info.noPhone) { res.intent = 'skip'; res.confidence = 0.8; return res; }
    if (summary && OPEN_RE.test(tAll)) { res.intent = 'open'; res.confidence = 0.8; return res; }
    if (isQuestion) {
      const faq = FAQ.filter((x) => x.re.test(tAll))[0];
      if (faq) { res.intent = 'faq'; res.info.faq = faq.a; res.confidence = 0.6; return res; }
    }
    if (BACK_RE.test(tAll)) { res.intent = 'back'; res.confidence = 0.7; return res; }
    if (GREET_RE.test(tAll) || (nameRead && nameRead.greeting)) { res.intent = 'greeting'; res.confidence = 0.9; return res; }
    if (THANKS_RE.test(tAll)) { res.intent = 'thanks'; res.confidence = 0.9; return res; }
    if (NO_RE.test(tAll)) { res.intent = 'no'; res.confidence = 0.7; return res; }
    if (YES_RE.test(tAll)) { res.intent = 'yes'; res.confidence = 0.7; return res; }
    return res;
  }

  function understand(text, step, ctx) {
    try { return understandInner(text, step, isObj(ctx) ? ctx : {}); } catch (e) {
      return { step: normStep(step), intent: 'unclear', value: undefined, confidence: 0, values: {}, explicit: {}, strong: {}, info: { error: String(e && e.message) } };
    }
  }

  /* ================================================================== generate (pure) */

  function relocate(text, city) {
    return String(text || '').replace(/(^|\s)(dans tout|partout à|à) (?:Abidjan|Cocody)(?=[\s.,;·]|$)/g, (m, sp, p) => sp + p + ' ' + city);
  }
  function heroTitle(tpl, name) {
    const d = D();
    const t = d.applyName(tpl, name);
    if (t.length <= 70) return t;
    const tail = String(tpl).replace(/^\s*\{name\}\s*:\s*/, '').split('{name}').join('');
    return cap(tail).slice(0, 70);
  }

  function generate(answers) {
    const d = D();
    const a = isObj(answers) ? answers : {};
    const nicheId = known(d.niches, a.niche) ? a.niche : null;
    const tplId = known(d.templates, a.template) ? a.template : (nicheId ? d.niches[nicheId].template : 'plateau');
    const cfg = d.defaultConfig(tplId, nicheId || undefined);
    const niche = d.niches[cfg.store.niche];
    const name = cleanName(typeof a.name === 'string' ? a.name : '') || PROVISIONAL_NAME;
    // 40 characters at most, like the city field of the editor (and schema.json)
    let city = String(typeof a.city === 'string' ? a.city : '').replace(/\s+/g, ' ').trim();
    if (city.length > 40) city = city.slice(0, 41).replace(/\s+\S*$/, '').slice(0, 40).replace(/[\s,;.-]+$/, '');
    city = city || 'Abidjan';
    const inAbidjan = /abidjan/i.test(city);
    const cityShort = city.split(',')[0].trim() || city;
    const needs = allNeeds(true);
    if (isObj(a.needs)) NEED_KEYS.forEach((k) => { if (a.needs[k] === false) needs[k] = false; });
    // The seller's city instead of Abidjan, as long as the text stays within its field's limit
    const local = (s, max) => { if (inAbidjan) return s; const r = relocate(s, cityShort); return r.length <= max ? r : s; };

    cfg.store.name = name;
    cfg.store.city = city;
    cfg.store.whatsapp = d.normalizeWhatsapp(typeof a.whatsapp === 'string' ? a.whatsapp : '');
    cfg.store.tagline = local(cfg.store.tagline, 80);
    cfg.theme.palette = known(d.palettes, a.palette) ? a.palette : niche.palette;
    // Vivid colours: the seller's colour carries the whole store (the founder found the soft look pale)
    cfg.theme.intensity = 'vivid';
    cfg.payments.cod = needs.cod;
    cfg.sections.forEach((s) => {
      const st = s.settings;
      switch (s.type) {
        case 'announcement': s.enabled = needs.announcement; st.text = local(st.text, 90); break;
        case 'hero': st.title = heroTitle(niche.hero.title, name); st.text = local(st.text, 220); break;
        case 'categories': s.enabled = needs.categories; break;
        case 'reviews': s.enabled = needs.reviews; break;
        case 'delivery':
          s.enabled = needs.delivery;
          st.zones = inAbidjan ? d.clone(d.communes) : [{ name: cityShort.slice(0, 40), fee: 1500 }];
          break;
        case 'whatsapp': s.enabled = needs.whatsapp; break;
      }
    });
    const out = d.normalizeConfig(cfg);
    if (out.theme && out.theme.intensity === undefined) out.theme.intensity = 'vivid'; // an older data.js drops the key
    return out;
  }

  /* ================================================================== conversation state */

  function freshAnswers() {
    return { name: null, niche: null, template: null, palette: null, needs: allNeeds(true), city: null, whatsapp: '' };
  }
  const S = {
    built: false, open: false, started: false, el: {}, gen: 0,
    answers: freshAnswers(), filled: {}, step: null, misses: {}, hash: 2166136261,
    person: null, nameHint: null, provisional: false, reask: null, fixFrom: null,
    contactCity: null, contactPhone: null, askedPhone: false, phoneRetry: false, pendingPhone: null,
    config: null, queue: [], post: [], current: null, flushing: false, timer: 0, burst: 0, excl: {}, summarized: false,
    lastPointer: '', prevFocus: null, inerted: [], replaceAsk: null, shotRO: null, stick: true, notedNeeds: false
  };
  function resetState() {
    S.gen++;
    clearTimeout(S.timer);
    Object.assign(S, {
      started: false, answers: freshAnswers(), filled: {}, step: null, misses: {}, hash: 2166136261,
      person: null, nameHint: null, provisional: false, reask: null, fixFrom: null,
      contactCity: null, contactPhone: null, askedPhone: false, phoneRetry: false, pendingPhone: null,
      config: null, queue: [], post: [], current: null, flushing: false, burst: 0, replaceAsk: null, notedNeeds: false,
      excl: {}, summarized: false, cityNoted: null
    });
    if (S.el.log) { S.el.log.textContent = ''; S.el.quick.textContent = ''; S.el.typing.hidden = true; updateProgress(); }
  }

  function pick(list, salt) { return list[(S.hash + hashStr(String(salt || ''))) % list.length]; }
  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function nicheOf() { return S.answers.niche || null; }
  // The recommendation for the niche, unless the seller said « pas ça »
  function allowed(step, id, all) {
    const ex = S.excl[step] || [];
    return ex.indexOf(id) < 0 ? id : (all.filter((x) => ex.indexOf(x) < 0)[0] || id);
  }
  function recTemplate() { const n = nicheOf(); return allowed('template', n ? D().niches[n].template : 'cocody', Object.keys(STYLE)); }
  function recPalette() {
    const n = nicheOf();
    const id = n ? D().niches[n].palette : (S.answers.template ? D().templates[S.answers.template].defaults.palette : 'sable');
    return allowed('palette', id, idsOf(D().palettes));
  }
  function shopPhrase() { const n = nicheOf(); return n ? NICHE_COPY[n].shop : 'votre boutique'; }
  function nicheShort() { const n = nicheOf(); return n ? NICHE_COPY[n].short : 'votre boutique'; }
  function paletteName(id) { return D().palettes[id] ? D().palettes[id].name : id; }
  function cityPhrase(city) { const m = /^(.+), Abidjan$/.exec(city || ''); return m ? m[1] + ', à Abidjan' : city; }

  /* ================================================================== bot output queue */

  function say(text, o) { S.queue.push({ kind: 'bot', text: fr(text), sr: o && o.sr ? fr(o.sr) : '' }); }
  function then(fn) { S.queue.push({ kind: 'call', fn: fn }); }
  // UI work decided while an answer is applied, shown after the confirmation bubble (sayNotes)
  function post(fn) { S.post.push(fn); }
  function flushPost() { while (S.post.length) then(S.post.shift()); }
  function typingDelay(text) {
    if (reduced()) return 0;
    const base = Math.min(1150, 360 + text.length * 7);
    S.burst++;
    return S.burst > 1 ? Math.round(base * 0.75) : base + 120;
  }
  function run() { if (!S.flushing) { S.burst = 0; pump(); } }
  function pump() {
    const item = S.queue.shift();
    if (!item) { S.flushing = false; S.current = null; showTyping(false); return; }
    S.flushing = true;
    if (item.kind === 'call') { try { item.fn(); } catch (e) { /* keep the chat alive */ } pump(); return; }
    const ms = S.open ? typingDelay(item.text) : 0;
    if (!ms) { addBot(item); pump(); return; }
    S.current = item;
    showTyping(true);
    const gen = S.gen;
    S.timer = setTimeout(() => {
      if (gen !== S.gen) return;
      S.current = null;
      showTyping(false);
      addBot(item);
      pump();
    }, ms);
  }
  // A new answer arrives while the assistant is "typing": show everything at once
  function fastForward() {
    clearTimeout(S.timer);
    showTyping(false);
    if (S.current) { addBot(S.current); S.current = null; }
    while (S.queue.length) {
      const it = S.queue.shift();
      if (it.kind === 'call') { try { it.fn(); } catch (e) { /* ignore */ } } else addBot(it);
    }
    S.flushing = false;
  }

  /* ================================================================== the steps */

  const Q = {
    intro: ['Bonjour ! Je suis l’assistant Jeere. En six petites questions, je prépare votre boutique : textes, produits d’exemple et couleurs. Vous pourrez tout changer ensuite.',
      'Bonjour ! Moi, c’est l’assistant Jeere. Répondez à six petites questions et je monte votre boutique, prête à être retouchée.'],
    name: ['Pour commencer, comment s’appelle votre boutique ?', 'D’abord, quel est le nom de votre boutique ?', 'On commence par le nom : comment s’appelle votre boutique ?'],
    niche: ['Que vendez-vous ? Touchez une catégorie, ou dites-le avec vos mots.',
      'Qu’est-ce que vous vendez ? Choisissez ci-dessous, ou écrivez-le simplement : « des perruques », « attiéké et garba »…',
      'Et vous vendez quoi ? Une catégorie suffit, ou décrivez-le avec vos mots.'],
    template: ['Quel style vous ressemble le plus ?', 'Côté look, vous voyez votre boutique plutôt comment ?', 'Quelle ambiance voulez-vous pour votre boutique ?'],
    palette: ['Quelles couleurs voulez-vous ? Touchez une palette, ou laissez-moi choisir.',
      'Une couleur préférée ? Choisissez une palette, ou écrivez une couleur : « vert », « rose »…', 'Passons aux couleurs : laquelle vous plaît ?'],
    needs: ['De quoi avez-vous besoin ? J’ai tout coché : décochez ce qui ne vous sert pas, puis touchez « C’est bon ».',
      'Voici ce que je mets dans votre boutique. Enlevez ce qui ne vous sert pas, ou dites-le-moi, par exemple « pas d’avis ».'],
    contact: ['Dernière question : dans quelle ville êtes-vous, et sur quel numéro WhatsApp recevez-vous les commandes ?',
      'Pour finir : votre ville et votre numéro WhatsApp ? Par exemple « Yopougon, 07 07 12 34 56 ».']
  };
  const AGAIN = {
    name: 'Et comment s’appelle votre boutique ?',
    niche: 'Et que vendez-vous ?',
    template: 'On reprend : quel style préférez-vous ?',
    palette: 'On reprend : quelles couleurs voulez-vous ?',
    needs: 'On reprend : de quoi avez-vous besoin ? Touchez « C’est bon » quand c’est prêt.',
    contact: 'Et pour finir : votre ville et votre numéro WhatsApp ?'
  };
  const FIX_ASK = {
    name: 'D’accord : quel nom voulez-vous ?',
    niche: 'D’accord : que vendez-vous ?',
    template: 'D’accord : quel style préférez-vous ?',
    palette: 'D’accord : quelles couleurs voulez-vous ?',
    needs: 'D’accord : voici vos options. Touchez « C’est bon » quand c’est prêt.',
    contact: 'D’accord : votre ville et votre numéro WhatsApp ?'
  };
  const UNCLEAR = {
    name: ['Je n’ai pas bien saisi le nom. Écrivez-le simplement, par exemple « Awa Beauté ».', 'Pardon, je n’ai pas compris. Quel nom voulez-vous voir en haut de votre boutique ?'],
    niche: ['Je n’ai pas reconnu ce que vous vendez. Touchez la catégorie la plus proche : vous changerez les produits ensuite.',
      'Je ne suis pas sûr de comprendre. Choisissez la catégorie la plus proche de vos produits.'],
    template: ['Je n’ai pas compris le style. Choisissez parmi ces trois-là :', 'Pardon, je n’ai pas saisi. Lequel de ces trois styles vous plaît ?'],
    palette: ['Je ne connais pas cette couleur. Choisissez une palette, ou laissez-moi faire.', 'Pardon, je n’ai pas reconnu de couleur. Touchez la palette qui vous plaît.'],
    needs: ['Je n’ai pas compris ce qu’il faut enlever. Touchez les options pour les cocher ou les décocher, puis « C’est bon ».',
      'Pardon, je n’ai pas saisi. Décochez ce qui ne vous sert pas, puis touchez « C’est bon ».'],
    contact: ['Je n’ai trouvé ni ville ni numéro. Écrivez par exemple « Cocody, 07 07 12 34 56 », ou touchez votre ville.',
      'Pardon, je n’ai pas compris. Dans quelle ville êtes-vous ? Vous pouvez aussi ajouter votre numéro WhatsApp.']
  };
  const HELP = {
    name: 'C’est le nom que vos clients verront en haut de votre boutique. Si vous n’en avez pas encore, touchez « Je n’ai pas encore de nom » : on le trouvera plus tard.',
    niche: 'Dites-moi ce que vous vendez avec vos mots : « des robes en wax », « des perruques », « attiéké et garba »… Je prépare des produits d’exemple que vous remplacerez par les vôtres.',
    needs: 'Ce sont les blocs de votre page : la commande sur WhatsApp, les frais de livraison par commune, le paiement à la livraison, les avis de vos clients, les catégories et le bandeau d’annonce tout en haut. Décochez ceux qui ne vous servent pas.',
    contact: 'La ville sert à préparer vos frais de livraison. Le numéro WhatsApp reçoit les commandes de vos clients. Écrivez par exemple « Cocody, 07 07 12 34 56 ».'
  };

  function start(again) {
    S.started = true;
    say(again ? 'C’est reparti ! On reprend depuis le début.' : pick(Q.intro, 'intro'));
    ask('name');
    run();
  }

  function isFilled(step) { return !!S.filled[step]; }
  function nextStep() { return STEPS.filter((s) => !S.filled[s])[0] || null; }
  function advance() { const n = nextStep(); if (n) ask(n); else summary(); }

  function ask(step, mode) {
    S.step = step;
    S.misses[step] = 0;
    then(updateProgress);
    then(() => setPlaceholder(step));
    if (step === 'name') {
      say(mode === 'fix' ? FIX_ASK.name : mode === 'again' ? AGAIN.name : pick(Q.name, 'q-name'));
    } else if (step === 'niche') {
      if (S.nameHint && mode !== 'fix' && mode !== 'nohint') say('D’après le nom, je devine : ' + D().niches[S.nameHint].label.toLowerCase() + '. C’est bien ça ?');
      else say(mode === 'fix' ? FIX_ASK.niche : mode === 'again' ? AGAIN.niche : pick(Q.niche, 'q-niche'));
    } else if (step === 'template') {
      const rec = recTemplate();
      const line = nicheOf() ? ' Pour ' + nicheShort() + ', je conseille le style ' + STYLE[rec].low + '.' : '';
      say((mode === 'fix' ? FIX_ASK.template : mode === 'again' ? AGAIN.template : pick(Q.template, 'q-tpl')) + line);
    } else if (step === 'palette') {
      say(mode === 'fix' ? FIX_ASK.palette : mode === 'again' ? AGAIN.palette : pick(Q.palette, 'q-pal'));
    } else if (step === 'needs') {
      const pre = !mode && S.notedNeeds ? ' J’ai déjà tenu compte de ce que vous m’avez dit.' : '';
      say((mode === 'fix' ? FIX_ASK.needs : mode === 'again' ? AGAIN.needs : pick(Q.needs, 'q-needs')) + pre);
    } else if (step === 'contact') {
      const optional = S.answers.needs.whatsapp === false;
      if (S.contactPhone && !S.contactCity) say('Dernière question : dans quelle ville êtes-vous ? J’ai déjà votre numéro WhatsApp.');
      else if (S.contactCity && !S.contactPhone) { S.askedPhone = true; say('Dernière question : sur quel numéro WhatsApp vos clients peuvent-ils vous écrire ?' + (optional ? ' C’est facultatif.' : '')); }
      else if (mode === 'fix') say(FIX_ASK.contact);
      else if (mode === 'again') say(AGAIN.contact);
      else say(optional ? 'Dernière question : dans quelle ville êtes-vous ? Et si vous voulez, votre numéro WhatsApp.' : pick(Q.contact, 'q-contact'));
    }
    then(() => setQuick(chipsFor(step)));
  }

  /* ---------- confirmations ---------- */

  function nameNote(kind) {
    const n = S.answers.name;
    if (kind === 'answer') return pick(['« ' + n + ' » : c’est noté.', 'Très bien, va pour « ' + n + ' ».', 'Parfait : votre boutique s’appelle « ' + n + ' ».'], n);
    return kind === 'correction' ? 'C’est corrigé : la boutique s’appelle « ' + n + ' ».' : 'Je note le nom : « ' + n + ' ».';
  }
  function nicheNote(kind, alt) {
    let s = kind === 'answer' ? pick(['Parfait : ', 'Très bien : ', 'Noté : '], 'n' + S.answers.niche) + shopPhrase() + '.'
      : kind === 'correction' ? 'C’est corrigé : ' + shopPhrase() + '.' : 'Noté : ' + shopPhrase() + '.';
    if (alt && alt !== S.answers.niche) s += ' Vos ' + NICHE_COPY[alt].alt + ' auront aussi leur place : vous les ajouterez dans l’éditeur.';
    return s;
  }
  function templateNote(kind) {
    const st = STYLE[S.answers.template];
    if (kind === 'answer') return pick(['Parfait : ' + shopPhrase() + ', style ' + st.low + '.', 'Très bien : ' + shopPhrase() + ', avec un style ' + st.low + '.',
      'C’est noté : ' + shopPhrase() + ', style ' + st.low + '.'], 't' + S.answers.template);
    return kind === 'correction' ? 'C’est noté : style ' + st.low + ' à la place.' : 'Et je note le style ' + st.low + '.';
  }
  function paletteNote(kind, word) {
    const auto = S.answers.palette === null;
    const id = auto ? recPalette() : S.answers.palette;
    const P = paletteName(id);
    const desc = PALETTE_DESC[id] || '';
    if (auto) return 'Je vous propose ' + P + ' : ' + desc + '. Elle va très bien avec ' + nicheShort() + '.';
    if (kind === 'answer') {
      if (word && norm(word) !== norm(P)) return cap(word) + ', très bien : ce sera la palette ' + P + ', ' + desc + '.';
      return pick([P + ' : ' + desc + '. Bon choix.', 'Va pour ' + P + ' : ' + desc + '.', 'Noté : la palette ' + P + ', ' + desc + '.'], 'p' + id);
    }
    if (kind === 'correction') return 'C’est noté : la palette ' + P + ', ' + desc + '.';
    return word && norm(word) !== norm(P) ? 'Pour les couleurs, je note le ' + word.toLowerCase() + ' : ce sera la palette ' + P + '.' : 'Pour les couleurs, je note ' + P + '.';
  }
  function needsNote(before, after, mode, atStep) {
    const off = NEED_KEYS.filter((k) => after[k] === false);
    const added = NEED_KEYS.filter((k) => after[k] && before[k] === false);
    const removed = NEED_KEYS.filter((k) => !after[k] && before[k] !== false);
    if (mode === 'none' || off.length === NEED_KEYS.length) return 'Une boutique toute simple, alors : vos produits et votre histoire, sans les options.';
    if (atStep) {
      if (!off.length) return mode === 'all' ? 'Parfait, je garde tout.' : pick(['Parfait, je garde tout.', 'Tout est gardé, parfait.'], 'all');
      if (mode === 'only') return 'Noté : seulement ' + joinList(NEED_KEYS.filter((k) => after[k]).map((k) => NEED_COPY[k].low), 'et') + '.';
      return 'Noté : sans ' + joinList(off.map((k) => NEED_COPY[k].low), 'ni') + '.';
    }
    const parts = [];
    if (added.length) parts.push('avec ' + joinList(added.map((k) => NEED_COPY[k].low), 'et'));
    if (removed.length) parts.push('sans ' + joinList(removed.map((k) => NEED_COPY[k].low), 'ni'));
    return parts.length ? 'Noté : ' + parts.join(', ') + '.' : '';
  }
  function deliveryNote(city) {
    if (S.answers.needs.delivery === false) return '';
    if (/abidjan/i.test(city)) return ' Je mets les frais de livraison pour les ' + D().communes.length + ' communes d’Abidjan.';
    return ' Je crée une zone de livraison « ' + city.split(',')[0] + ' » à ' + D().formatPrice(1500) + ' : vous ajusterez le prix.';
  }

  /* ---------- apply values ---------- */

  function setNeeds(patch) {
    const before = Object.assign({}, S.answers.needs);
    NEED_KEYS.forEach((k) => { if (typeof patch[k] === 'boolean') S.answers.needs[k] = patch[k]; });
    return before;
  }

  // Values for the other questions: corrections of earlier answers, or answers given ahead of time
  function applyOthers(u, step, notes) {
    let any = false;
    ['name', 'niche', 'template', 'palette', 'needs', 'city', 'whatsapp'].forEach((f) => {
      if (fieldStep(f) === step || u.values[f] === undefined) return;
      const filled = step === 'summary' || (f === 'city' ? (isFilled('contact') || !!S.contactCity) : f === 'whatsapp' ? (isFilled('contact') || !!S.contactPhone) : isFilled(f));
      if (!(filled ? u.explicit[f] : (u.strong[f] || u.explicit[f]))) return;
      const kind = filled ? 'correction' : 'prefill';
      const v = u.values[f];
      if (f === 'name') { S.answers.name = v; S.filled.name = true; S.provisional = false; notes.push(nameNote(kind)); }
      else if (f === 'niche') {
        if (S.answers.niche === v && filled) return;
        S.answers.niche = v; S.filled.niche = true; S.nameHint = null;
        notes.push(nicheNote(kind, u.info.nicheAlt));
      } else if (f === 'template') {
        if (S.answers.template === v && filled) return;
        S.answers.template = v; S.filled.template = true; notes.push(templateNote(kind));
      } else if (f === 'palette') {
        if (v === null && !filled) return;
        S.answers.palette = v; S.filled.palette = true; notes.push(paletteNote(kind, u.info.colorWord));
      } else if (f === 'needs') {
        const before = setNeeds(v);
        const n = needsNote(before, S.answers.needs, u.info.needsMode, false);
        if (!n) return;
        if (!isFilled('needs')) S.notedNeeds = true;
        notes.push(n);
      } else if (f === 'city') {
        if (isFilled('contact')) { S.answers.city = v; notes.push('Noté : ' + cityPhrase(v) + '.' + deliveryNote(v)); }
        else { S.contactCity = v; notes.push('Je note ' + cityPhrase(v) + ' pour la ville.'); }
      } else if (f === 'whatsapp') {
        if (isFilled('contact')) { S.answers.whatsapp = v; notes.push('Noté : votre numéro WhatsApp est le ' + displayPhone(v) + '.'); }
        else { S.contactPhone = v; notes.push('Je note votre numéro WhatsApp, le ' + displayPhone(v) + '.'); }
      }
      any = true;
    });
    if (!isFilled('contact') && S.contactCity && S.contactPhone && step !== 'contact' && step !== 'summary') {
      S.answers.city = S.contactCity; S.answers.whatsapp = S.contactPhone; S.filled.contact = true;
    }
    return any;
  }

  function sayNotes(notes, extra) {
    const text = notes.concat(extra ? [extra] : []).filter(Boolean).join(' ');
    if (text) say(text);
    flushPost();
  }

  /* ---------- one answer ---------- */

  function respond(u) {
    const step = S.step;
    if (u.intent === 'restart') { restart(); return; }
    if (step === 'fix') { respondFix(u); return; }
    if (step === 'summary') { respondSummary(u); return; }

    const notes = [];
    const cur = [];
    // the step asked comes first in the reply
    let done = false;
    if (u.value !== undefined || u.intent === 'auto') done = applyCurrent(step, u, cur);
    applyOthers(u, step, notes);
    if (done === 'wait') { sayNotes(cur.concat(notes)); run(); return; }
    if (done) { sayNotes(cur.concat(notes)); advance(); return; }
    if (cur.length || notes.length) {
      sayNotes(cur.concat(notes));
      if (isFilled(step)) advance(); else reAsk(step);
      return;
    }
    respondIntent(step, u);
  }

  // Returns true when the step is answered, 'wait' when the step asked a follow-up itself, false otherwise
  function applyCurrent(step, u, out) {
    const A = S.answers;
    switch (step) {
      case 'name': {
        if (u.intent === 'auto') {
          A.name = PROVISIONAL_NAME; S.provisional = true; S.filled.name = true;
          out.push('Pas de souci : je mets « ' + PROVISIONAL_NAME + ' » pour l’instant. Dites-moi le vrai nom quand vous voulez, par exemple « le nom c’est … ».');
          return true;
        }
        A.name = u.value; S.filled.name = true; S.provisional = false;
        if (u.info.nameHint && !isFilled('niche')) S.nameHint = u.info.nameHint;
        out.push(nameNote('answer') + (u.value.length > 32 ? ' Il est un peu long pour un logo : vous pourrez le raccourcir dans l’éditeur.' : ''));
        return true;
      }
      case 'niche': {
        A.niche = u.value; S.filled.niche = true; S.nameHint = null;
        out.push(nicheNote('answer', u.info.nicheAlt));
        return true;
      }
      case 'template': {
        if (u.intent === 'auto' || u.value === undefined) {
          A.template = recTemplate(); S.filled.template = true;
          out.push('Je choisis pour vous : le style ' + STYLE[A.template].low + ', celui que je conseille pour ' + nicheShort() + '.');
          return true;
        }
        A.template = u.value; S.filled.template = true;
        out.push(templateNote('answer'));
        return true;
      }
      case 'palette': {
        A.palette = u.value === undefined ? null : u.value; S.filled.palette = true;
        out.push(paletteNote('answer', u.info.colorWord));
        return true;
      }
      case 'needs': {
        const before = setNeeds(u.value || {});
        S.filled.needs = true;
        out.push(needsNote(before, A.needs, u.info.needsMode, true));
        return true;
      }
      case 'contact': return applyContact(u.value || {}, u, out);
    }
    return false;
  }

  function applyContact(v, u, out) {
    if (v.city) S.contactCity = v.city;
    if (v.whatsapp) {
      if (u && u.info.phoneIssue && !S.phoneRetry) {
        S.phoneRetry = true;
        S.pendingPhone = v.whatsapp;
        out.push(u.info.phoneIssue === 'old'
          ? 'Votre numéro semble n’avoir que 8 chiffres. Depuis 2021, les numéros ivoiriens en ont 10 : ajoutez 07, 05 ou 01 devant, selon votre opérateur. Pouvez-vous me le redonner ?'
          : 'Ce numéro me semble incomplet. Pouvez-vous le vérifier ? Par exemple 07 07 12 34 56.');
        post(() => setQuick(phoneFixChips()));
        post(() => setPlaceholder('phone'));
        return 'wait';
      }
      finishContact(S.contactCity, v.whatsapp, out);
      return true;
    }
    if (u && u.info.noPhone) { finishContact(S.contactCity, '', out); return true; }
    if (S.contactPhone && S.contactCity) { finishContact(S.contactCity, S.contactPhone, out); return true; }
    if (v.city && !S.askedPhone) {
      S.askedPhone = true;
      S.cityNoted = v.city;
      out.push('Noté : ' + cityPhrase(v.city) + '. Et votre numéro WhatsApp ? C’est là que vos clients vous écriront.');
      post(() => setQuick(laterChips()));
      post(() => setPlaceholder('phone'));
      return 'wait';
    }
    if (v.city) { finishContact(v.city, '', out); return true; }
    return false;
  }
  function finishContact(city, phone, out) {
    const defaulted = !city;
    const c = city || 'Abidjan';
    S.answers.city = c;
    S.answers.whatsapp = phone || '';
    S.filled.contact = true;
    S.contactCity = c; S.contactPhone = phone || null;
    let s = defaulted ? 'Je mets Abidjan comme ville : dites-le-moi si vous êtes ailleurs.' : (S.cityNoted === c ? '' : 'Noté : ' + cityPhrase(c) + '.');
    s += phone ? ' Les commandes arriveront sur le ' + displayPhone(phone) + '.' : (S.cityNoted === c ? 'D’accord, pas de numéro pour l’instant : vous l’ajouterez dans l’éditeur.' : ' Pas de numéro pour l’instant : vous l’ajouterez dans l’éditeur.');
    s = s.trim();
    s += deliveryNote(c);
    out.push(s);
  }

  function reAsk(step) {
    if (step === 'contact' && S.contactCity && !S.contactPhone) {
      say('Et votre numéro WhatsApp ?');
      then(() => setQuick(laterChips()));
      then(() => setPlaceholder('phone'));
      return;
    }
    say(AGAIN[step]);
    then(() => setPlaceholder(step));
    then(() => setQuick(chipsFor(step)));
  }

  function respondIntent(step, u) {
    const it = u.intent;
    if (it === 'help') {
      if (step === 'template') {
        const d = D();
        say(Object.keys(STYLE).map((k) => STYLE[k].label + ' (' + d.templates[k].name + ') : ' + STYLE[k].help).join('\n'));
        say('Pour ' + nicheShort() + ', je conseille le style ' + STYLE[recTemplate()].low + '. Vous pourrez en changer à tout moment.');
      } else if (step === 'palette') {
        const id = recPalette();
        say('Chaque palette a une couleur de fond et une couleur pour les boutons. Pour ' + nicheShort() + ', je conseille ' + paletteName(id) + ' : ' + PALETTE_DESC[id] + '. Vous pouvez aussi écrire une couleur, par exemple « vert » ou « rose ».');
      } else say(HELP[step]);
      then(() => setQuick(chipsFor(step)));
      return;
    }
    if (it === 'person') {
      S.person = u.info.person;
      say('Enchanté, ' + S.person + ' ! Et votre boutique, comment s’appelle-t-elle ?');
      then(() => setQuick(chipsFor('name')));
      return;
    }
    if (it === 'unsupported') {
      say('Je ne sais pas encore préparer ' + u.info.unsupported + ' : ce sera pour bientôt. En attendant, touchez la catégorie la plus proche, vous remplacerez les produits d’exemple par les vôtres.');
      S.misses[step] = (S.misses[step] || 0) + 1;
      then(() => setQuick(chipsFor(step)));
      return;
    }
    if (it === 'excluded') {
      const ex = step === 'template' ? u.info.excludedTemplates : u.info.excludedPalettes;
      S.excl[step] = (S.excl[step] || []).concat(ex.filter((x) => (S.excl[step] || []).indexOf(x) < 0));
      const all = step === 'template' ? Object.keys(STYLE) : idsOf(D().palettes);
      const left = all.filter((k) => S.excl[step].indexOf(k) < 0);
      if (left.length === 1) {
        // only one left: that is the answer
        const o = []; applyCurrent(step, { value: left[0], info: {} }, o); sayNotes(o); advance(); return;
      }
      if (step === 'template') {
        say('D’accord, pas ' + joinList(u.info.excludedTemplates.map((k) => STYLE[k].low), 'ni') + '. Alors plutôt ' + joinList(left.map((k) => STYLE[k].low), 'ou') + ' ?');
      } else {
        const words = (u.info.excludedWords || []).length ? u.info.excludedWords : u.info.excludedPalettes.map((k) => paletteName(k));
        say('D’accord, pas de ' + joinList(words, 'ni') + '. Laquelle vous plaît, alors ?');
      }
      then(() => setQuick(chipsFor(step)));
      return;
    }
    if (it === 'skip' && step === 'contact') {
      const o = []; finishContact(S.contactCity, '', o); sayNotes(o); advance(); return;
    }
    if (it === 'auto' && (step === 'template' || step === 'palette')) {
      const o = []; applyCurrent(step, { intent: 'auto', value: step === 'palette' ? null : undefined, info: {} }, o); sayNotes(o); advance(); return;
    }
    if (it === 'faq') { say(u.info.faq); reAsk(step); return; }
    if (it === 'greeting') {
      if (step === 'name' && !S.misses.name) { say('Bonjour ! Pour commencer, comment s’appelle votre boutique ?'); then(() => setQuick(chipsFor('name'))); return; }
      say('Bonjour !'); reAsk(step); return;
    }
    if (it === 'thanks') { say('Avec plaisir !'); reAsk(step); return; }
    if (it === 'back') {
      const prev = STEPS.slice(0, STEPS.indexOf(step)).filter((s) => isFilled(s)).pop();
      if (prev) { S.filled[prev] = false; S.reask = prev; ask(prev, 'fix'); return; }
      say('Nous sommes au tout début.'); reAsk(step); return;
    }
    if (it === 'yes' && step === 'niche' && S.nameHint) {
      const o = []; applyCurrent('niche', { value: S.nameHint, info: {} }, o); sayNotes(o); advance(); return;
    }
    if (it === 'no' && step === 'niche' && S.nameHint) {
      S.nameHint = null; say('D’accord. Alors, que vendez-vous ?'); then(() => setQuick(chipsFor('niche'))); return;
    }
    if (it === 'no' && STEPS.some((s) => isFilled(s)) && step !== 'name') { openFix(step); return; }
    missed(step);
  }

  // Unclear answer: say so and show the choices; the second time, choose a sensible default and move on
  function missed(step, quiet) {
    S.misses[step] = (S.misses[step] || 0) + 1;
    if (S.misses[step] < 2) {
      if (!quiet) say(pick(UNCLEAR[step], 'u' + step + S.misses[step]));
      then(() => setQuick(chipsFor(step)));
      return;
    }
    const o = [];
    if (S.reask === step && S.answers[step === 'contact' ? 'city' : step] != null) {
      S.filled[step] = true; S.reask = null;
      o.push('Pas de souci, je garde ce que vous m’aviez dit.');
    } else if (step === 'name') applyCurrent('name', { intent: 'auto', info: {} }, o);
    else if (step === 'niche') {
      const guess = S.nameHint && known(D().niches, S.nameHint) ? S.nameHint : 'fashion';
      S.answers.niche = guess; S.filled.niche = true;
      o.push('Je pars sur ' + (guess === 'fashion' ? 'la mode' : NICHE_COPY[guess].short) + ' pour les exemples : vous les remplacerez par vos produits dans l’éditeur. Vous pouvez aussi me dire « en fait je vends … » à tout moment.');
    } else if (step === 'template') applyCurrent('template', { intent: 'auto', info: {} }, o);
    else if (step === 'palette') applyCurrent('palette', { intent: 'auto', value: null, info: {} }, o);
    else if (step === 'needs') { S.filled.needs = true; o.push(needsNote(S.answers.needs, S.answers.needs, 'confirm', true)); }
    else if (step === 'contact') finishContact(S.contactCity, S.contactPhone || '', o);
    sayNotes(o);
    advance();
  }

  /* ---------- « non » : what should I fix? ---------- */

  function openFix(from) {
    S.fixFrom = from;
    S.step = 'fix';
    say('D’accord. Qu’est-ce que je dois corriger ?');
    then(() => setPlaceholder('fix'));
    then(() => setQuick(fixChips()));
  }
  function fixChips() {
    const list = STEPS.filter((s) => isFilled(s)).map((s) => ({ label: FIELD_LABEL[s], onPick: () => fixField(s) }));
    list.push({ label: 'Rien, on continue', onPick: () => fixNothing() });
    return chips(list, 'Ce que je dois corriger');
  }
  function fixField(s) {
    S.filled[s] = false;
    S.reask = s;
    if (s === 'contact') { S.contactCity = null; S.contactPhone = null; S.askedPhone = false; S.phoneRetry = false; }
    ask(s, 'fix');
  }
  function fixNothing() {
    say('Très bien, on continue.');
    const from = S.fixFrom;
    S.fixFrom = null;
    if (from === 'summary' || !nextStep()) summary(true); else { S.step = from; reAsk(from); }
  }
  function respondFix(u) {
    const t = norm(u.raw || '');
    const field = /(?:^|\s)nom(?:\s|$)/.test(t) ? 'name' : /vend|produit|categorie/.test(t) ? 'niche' : STYLE_FIELD_RE.test(t) ? 'template'
      : PALETTE_FIELD_RE.test(t) ? 'palette' : /option|avis|livraison|bandeau|categorie/.test(t) ? 'needs' : CONTACT_FIELD_RE.test(t) ? 'contact' : null;
    if (field && isFilled(field) && !Object.keys(u.values).length) { fixField(field); return; }
    const notes = [];
    if (applyOthers(u, 'summary', notes)) {
      sayNotes(notes);
      const from = S.fixFrom; S.fixFrom = null;
      if (from === 'summary' || !nextStep()) summary(true); else { S.step = from; reAsk(from); }
      return;
    }
    fixNothing();
  }

  /* ---------- the end: a summary card ---------- */

  function summary(update) {
    S.step = 'summary';
    S.reask = null;
    S.config = generate(S.answers);
    then(updateProgress);
    then(() => setPlaceholder('summary'));
    if (!update && S.summarized) say(pick(['Voilà, la fiche est à jour.', 'C’est fait : la fiche est à jour.'], 'resum'));
    else if (!update) {
      S.summarized = true;
      say('Je prépare votre boutique…');
      const v = D().validate(S.config);
      say(pick(['C’est prêt ! Voici votre boutique. Les 6 produits sont des exemples : vous mettrez les vôtres dans l’éditeur.',
        'Voilà votre boutique ! Je l’ai remplie avec 6 produits d’exemple, que vous remplacerez par les vôtres.'], 'sum'),
      { sr: 'Modèle ' + D().templates[S.config.template].name + ', palette ' + paletteName(S.config.theme.palette) + ', qualité ' + v.score + ' sur 100, ' + v.status.toLowerCase() + '.' });
    }
    then(() => setQuick(buildCard(S.config)));
  }

  function respondSummary(u) {
    const notes = [];
    if (applyOthers(u, 'summary', notes)) {
      S.config = generate(S.answers);
      sayNotes(notes, pick(['La fiche est à jour.', 'J’ai mis la fiche à jour.'], 'upd'));
      then(() => setQuick(buildCard(S.config)));
      run();
      return;
    }
    const it = u.intent;
    if (it === 'open') { openEditorFromChat(false); return; }
    if (it === 'no') { openFix('summary'); run(); return; }
    if (it === 'faq') say(u.info.faq);
    else if (it === 'thanks' || it === 'yes') say('Avec plaisir ! Touchez « Ouvrir l’éditeur » pour ajouter vos produits, vos prix et vos photos.');
    else if (it === 'greeting') say('Bonjour ! Votre boutique est prête : ouvrez l’éditeur, ou dites-moi ce qu’il faut changer.');
    else if (it === 'help') say('Dites-moi ce qu’il faut changer, par exemple « mets du vert », « style audacieux », « pas d’avis » ou « le nom c’est … ». Tout se modifie aussi dans l’éditeur.');
    else say('Je n’ai pas compris ce qu’il faut changer. Dites-moi par exemple « mets du vert », « style audacieux », « pas d’avis » ou « le nom c’est … ». Tout se modifie aussi dans l’éditeur.');
    then(() => setQuick(buildCard(S.config)));
    run();
  }

  function restart() {
    resetState();
    start(true);
    focusInputSoon();
  }

  /* ================================================================== DOM: chips, cards, messages */

  const ICON = {
    // The blue J of the Jeere logo (same shapes as #mark in index.html, inlined so the chat needs no symbol)
    mark: '<svg class="jwz-mark" viewBox="0 0 300 372" aria-hidden="true" focusable="false"><circle cx="237" cy="62" r="62"/><path d="M0 199H126V222A24 24 0 0 0 174 222V154H300V222A150 150 0 0 1 0 222Z"/></svg>',
    x: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    restart: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>',
    send: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5.5M6 11.5l6-6 6 6"/></svg>',
    check: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    arrow: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
    sparkle: '<svg class="jwz-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 10.9 10.2 9z"/></svg>'
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function chips(list, label, cls) {
    const wrap = el('div', 'jwz-chips' + (cls ? ' ' + cls : ''));
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', label);
    list.forEach((c) => {
      const b = el('button', 'jwz-chip' + (c.cls ? ' ' + c.cls : ''));
      b.type = 'button';
      if (c.pre) b.appendChild(c.pre);
      if (c.sub) {
        const tx = el('span', 'jwz-chip__txt');
        tx.appendChild(el('span', 'jwz-chip__label', c.label));
        tx.appendChild(el('span', 'jwz-chip__sub', c.sub));
        b.appendChild(tx);
      } else b.appendChild(el('span', 'jwz-chip__label', c.label));
      if (c.tag) b.appendChild(el('span', 'jwz-chip__tag', c.tag));
      if (c.aria) b.setAttribute('aria-label', fr(c.aria));
      b.addEventListener('click', () => answerWith(c.say || c.label, c.onPick));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function nicheArt(n) {
    const box = el('span', 'jwz-chip__art');
    box.setAttribute('aria-hidden', 'true');
    box.style.background = n.color || '#E9D8BD';
    try {
      if (root.JeereRender && typeof root.JeereRender.artSVG === 'function') box.innerHTML = root.JeereRender.artSVG(n.art, n.color);
    } catch (e) { /* the colour tile alone is fine */ }
    return box;
  }
  function swatch(id) {
    const c = D().palettes[id].colors;
    const sw = el('span', 'jwz-sw');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.setProperty('--sw-bg', c.bg);
    sw.style.setProperty('--sw-ac', c.accent);
    return sw;
  }
  function glyph(tplId) {
    const g = el('span', 'jwz-aa', tplId === 'treichville' ? 'AA' : 'Aa');
    g.setAttribute('aria-hidden', 'true');
    const fp = D().fontPairs[STYLE[tplId].fonts];
    if (fp) { g.style.fontFamily = fp.display.family; g.style.fontWeight = String(fp.display.weight); }
    return g;
  }

  // The signed-in seller ('jeere-account'): her store name and number are offered as quick answers
  function account() {
    let a = null;
    try { a = JSON.parse(root.localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch (e) { return null; }
    return a && typeof a === 'object' && a.loggedIn === true ? a : null;
  }
  function accountStoreName() {
    const a = account();
    return a && typeof a.storeName === 'string' ? a.storeName.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  }
  function accountPhone() {
    const a = account();
    return a && typeof a.phone === 'string' && /^\+\d{8,15}$/.test(a.phone) ? a.phone : '';
  }
  function chipsFor(step) {
    const d = D();
    if (step === 'name') {
      const list = [];
      const mine = accountStoreName();
      if (mine) list.push({ label: mine, onPick: () => pickName(mine) });
      if (S.person && 'Chez ' + S.person !== mine) list.push({ label: 'Chez ' + S.person, onPick: () => pickName('Chez ' + S.person) });
      list.push({ label: 'Je n’ai pas encore de nom', onPick: () => { const o = []; applyCurrent('name', { intent: 'auto', info: {} }, o); sayNotes(o); advance(); } });
      return chips(list, 'Réponses rapides');
    }
    if (step === 'niche') {
      const list = [];
      if (S.nameHint) list.push({ label: 'Oui, c’est ça', say: 'Oui, c’est ça', cls: 'jwz-chip--yes', onPick: () => pickNiche(S.nameHint) });
      idsOf(d.niches).forEach((id) => {
        const n = d.niches[id];
        list.push({ label: n.label, cls: 'jwz-chip--art', pre: nicheArt(n), onPick: () => pickNiche(id) });
      });
      return chips(list, 'Ce que vous vendez', 'jwz-chips--grid');
    }
    if (step === 'template') {
      try { if (root.JeereRender && root.JeereRender.ensureFonts) Object.keys(STYLE).forEach((k) => root.JeereRender.ensureFonts({ theme: { fonts: STYLE[k].fonts } })); } catch (e) { /* ignore */ }
      const rec = recTemplate();
      return chips(Object.keys(STYLE).map((k) => ({
        label: STYLE[k].label, sub: STYLE[k].sub, cls: 'jwz-chip--style', pre: glyph(k), tag: nicheOf() && k === rec ? 'conseillé' : '',
        onPick: () => pickTemplate(k)
      })), 'Styles', 'jwz-chips--stack');
    }
    if (step === 'palette') {
      const list = idsOf(d.palettes).map((id) => ({
        label: d.palettes[id].name, cls: 'jwz-chip--sw', pre: swatch(id), aria: d.palettes[id].name + ' : ' + PALETTE_DESC[id],
        onPick: () => pickPalette(id)
      }));
      list.push({ label: 'Choisissez pour moi', cls: 'jwz-chip--auto', onPick: () => pickPalette(null) });
      return chips(list, 'Palettes de couleurs');
    }
    if (step === 'needs') return needsChips();
    if (step === 'contact') {
      return chips(CITY_CHIPS.map((c) => ({ label: c, onPick: () => pickCity(c) })), 'Villes');
    }
    return document.createDocumentFragment();
  }

  function needsChips() {
    const box = el('div', 'jwz-needs');
    const wrap = el('div', 'jwz-chips');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Options de votre boutique');
    NEED_KEYS.forEach((k) => {
      const b = el('button', 'jwz-chip jwz-chip--toggle');
      b.type = 'button';
      b.setAttribute('aria-pressed', S.answers.needs[k] ? 'true' : 'false');
      const box2 = el('span', 'jwz-check');
      box2.innerHTML = ICON.check;
      b.appendChild(box2);
      b.appendChild(el('span', 'jwz-chip__label', NEED_COPY[k].chip));
      b.addEventListener('click', () => {
        S.answers.needs[k] = !S.answers.needs[k];
        b.setAttribute('aria-pressed', S.answers.needs[k] ? 'true' : 'false');
      });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
    const go = el('button', 'jwz-btn jwz-btn--primary jwz-go');
    go.type = 'button';
    go.innerHTML = '<span>C’est bon</span>' + ICON.arrow;
    go.addEventListener('click', () => answerWith('C’est bon', () => {
      const o = []; S.filled.needs = true; o.push(needsNote(S.answers.needs, S.answers.needs, 'confirm', true)); sayNotes(o); advance();
    }));
    box.appendChild(go);
    return box;
  }
  function laterChips() {
    const list = [];
    const mine = accountPhone();
    if (mine) list.push({ label: displayPhone(mine), onPick: () => { const o = []; finishContact(S.contactCity, mine, o); sayNotes(o); advance(); } });
    list.push({ label: 'Plus tard', onPick: () => { const o = []; finishContact(S.contactCity, '', o); sayNotes(o); advance(); } });
    return chips(list, 'Réponses rapides');
  }
  function phoneFixChips() {
    return chips([
      { label: 'Garder ce numéro', onPick: () => { const o = []; finishContact(S.contactCity, S.pendingPhone, o); sayNotes(o); advance(); } },
      { label: 'Plus tard', onPick: () => { const o = []; finishContact(S.contactCity, '', o); sayNotes(o); advance(); } }
    ], 'Réponses rapides');
  }

  function pickName(n) { const o = []; applyCurrent('name', { value: n, info: {} }, o); sayNotes(o); advance(); }
  function pickNiche(id) { const o = []; applyCurrent('niche', { value: id, info: {} }, o); sayNotes(o); advance(); }
  function pickTemplate(id) { const o = []; applyCurrent('template', { value: id, info: {} }, o); sayNotes(o); advance(); }
  function pickPalette(id) { const o = []; applyCurrent('palette', { value: id, intent: id === null ? 'auto' : 'answer', info: {} }, o); sayNotes(o); advance(); }
  function pickCity(c) {
    const o = [];
    const r = applyContact({ city: c }, null, o);
    sayNotes(o);
    if (r === true) advance(); else if (r === 'wait') run();
  }

  // A chip or a typed answer: the same path
  function answerWith(label, fn) {
    if (!S.open) return;
    const via = S.lastPointer;
    fastForward();
    clearQuick();
    addMe(label);
    S.hash = hashStr(S.hash + '|' + label);
    // Focus goes back to the input, except after a tap on a phone, where it would open the keyboard over the next choices
    if (via === 'touch' || via === 'pen') focusEl(S.el.scroll); else focusEl(S.el.input);
    try { fn(); } catch (e) { say('Oups, quelque chose s’est mal passé. Réessayez, ou touchez « Recommencer ».'); }
    run();
  }

  function submitText(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text || !S.open) return;
    fastForward();
    clearQuick();
    addMe(text);
    S.hash = hashStr(S.hash + '|' + text);
    const step = S.step === 'fix' ? 'summary' : S.step;
    const u = understand(text, step, { niche: S.answers.niche });
    u.raw = text;
    try { respond(u); } catch (e) { say('Oups, je me suis emmêlé. Pouvez-vous reformuler ?'); then(() => setQuick(chipsFor(S.step))); }
    run();
  }

  function addRow(row) {
    S.el.log.appendChild(row);
    scrollToShow(row);
  }
  function addBot(item) {
    const row = el('div', 'jwz-msg jwz-msg--bot');
    const av = el('span', 'jwz-msg__av');
    av.setAttribute('aria-hidden', 'true');
    av.innerHTML = ICON.mark;
    const b = el('p', 'jwz-bubble', item.text);
    if (item.sr) b.appendChild(el('span', 'jwz-sr', ' ' + item.sr));
    row.appendChild(av);
    row.appendChild(b);
    addRow(row);
  }
  function addMe(text) {
    const row = el('div', 'jwz-msg jwz-msg--me');
    const b = el('p', 'jwz-bubble');
    b.appendChild(el('span', 'jwz-sr', 'Vous : '));
    b.appendChild(document.createTextNode(text));
    row.appendChild(b);
    addRow(row);
  }
  function showTyping(on) {
    if (!S.el.typing) return;
    S.el.typing.hidden = !on;
    if (on) scrollToShow(S.el.typing);
  }
  function clearQuick() {
    if (S.shotRO) { try { S.shotRO.disconnect(); } catch (e) { /* ignore */ } S.shotRO = null; }
    if (S.el.quick) S.el.quick.textContent = '';
  }
  function setQuick(node) {
    clearQuick();
    if (!node) return;
    S.el.quick.appendChild(node);
    scrollToShow(S.el.quick, S.el.log.lastElementChild);
    fitShot();
  }

  function scrollToShow(node, anchor) {
    const sc = S.el.scroll;
    if (!sc || !S.open) return;
    const go = () => {
      const max = sc.scrollHeight - sc.clientHeight;
      let top = max;
      if (node && node.getBoundingClientRect) {
        const base = sc.getBoundingClientRect().top - sc.scrollTop;
        const nodeTop = node.getBoundingClientRect().top - base;
        const anchorTop = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect().top - base : nodeTop;
        // A block taller than the view (summary card, long chips): show its start, with the question above when it fits
        if (node.offsetHeight > sc.clientHeight - 24) top = Math.min(max, Math.max(0, (nodeTop - anchorTop < sc.clientHeight * 0.5 ? anchorTop : nodeTop) - 12));
      }
      try { sc.scrollTo({ top: top, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { sc.scrollTop = top; }
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(go); else go();
  }

  function setPlaceholder(step) {
    const P = {
      name: 'Le nom de votre boutique', niche: 'Ce que vous vendez', template: 'Le style, en un mot', palette: 'Une couleur : vert, rose…',
      needs: 'Par exemple : pas d’avis', contact: 'Ville et numéro WhatsApp', phone: 'Votre numéro WhatsApp', summary: 'Par exemple : mets du vert',
      fix: 'Ce que je dois corriger'
    };
    if (S.el.input) S.el.input.placeholder = fr(P[step] || 'Votre réponse');
    if (S.el.input) S.el.input.setAttribute('autocapitalize', step === 'name' ? 'words' : 'sentences');
  }
  function updateProgress() {
    if (!S.el.bar) return;
    const n = STEPS.filter((s) => isFilled(s)).length;
    S.el.bar.style.width = (S.step === 'summary' ? 100 : Math.round((n / STEPS.length) * 100)) + '%';
  }

  /* ---------- summary card ---------- */

  function buildCard(cfg) {
    const d = D();
    const v = d.validate(cfg);
    const tpl = d.templates[cfg.template];
    const pal = d.palettes[cfg.theme.palette];
    const fp = d.fontPairs[cfg.theme.fonts];
    const total = cfg.sections.length;
    const on = cfg.sections.filter((s) => s.enabled).length;
    const frag = document.createDocumentFragment();
    const card = el('section', 'jwz-card');
    card.setAttribute('aria-labelledby', 'jwz-card-title');

    if (root.JeereRender && typeof root.JeereRender.render === 'function') {
      const shot = el('div', 'jwz-shot');
      shot.setAttribute('aria-hidden', 'true');
      shot.setAttribute('inert', '');
      const scale = el('div', 'jwz-shot__scale');
      const store = el('div');
      scale.appendChild(store);
      shot.appendChild(scale);
      try { root.JeereRender.render(cfg, store, { device: 'phone' }); card.appendChild(shot); } catch (e) { /* no preview */ }
    }

    const body = el('div', 'jwz-card__body');
    body.appendChild(el('p', 'jwz-card__eyebrow', 'Votre boutique'));
    const h = el('h3', 'jwz-card__title', cfg.store.name);
    h.id = 'jwz-card-title';
    body.appendChild(h);
    if (S.provisional) body.appendChild(el('p', 'jwz-card__hint', fr('Nom provisoire : dites-moi « le nom c’est … » quand vous l’avez.')));

    const dl = el('dl', 'jwz-facts');
    const fact = (k, val, pre) => {
      const row = el('div', 'jwz-fact');
      row.appendChild(el('dt', '', k));
      const dd = el('dd');
      if (pre) dd.appendChild(pre);
      if (typeof val === 'string') dd.appendChild(document.createTextNode(val)); else dd.appendChild(val);
      row.appendChild(dd);
      dl.appendChild(row);
    };
    fact('Modèle', tpl.name + ' · ' + (STYLE[tpl.id] ? STYLE[tpl.id].label : tpl.style));
    const vivid = cfg.theme.intensity !== 'soft';
    fact('Couleurs', pal.name + ' · ' + (vivid ? 'vives' : 'douces'), swatch(pal.id));
    fact('Polices', fp.name);
    fact('Sections', on === total ? on + ' sections' : on + ' sur ' + total);
    fact('Produits', cfg.products.length + ' exemples');
    const q2 = el('span', 'jwz-score');
    q2.appendChild(el('strong', '', v.score + '/100'));
    q2.appendChild(el('span', 'jwz-badge' + (v.status === 'APPROUVÉ' ? '' : ' jwz-badge--todo'), v.status));
    fact('Qualité', q2);
    body.appendChild(dl);

    const first = v.issues.filter((i) => i.level !== 'tip')[0] || v.issues[0];
    if (first) {
      const nx = el('p', 'jwz-card__next');
      nx.appendChild(el('strong', '', fr('À faire ensuite : ')));
      nx.appendChild(document.createTextNode(fr(first.message)));
      body.appendChild(nx);
    }

    const actions = el('div', 'jwz-card__actions');
    if (S.replaceAsk) {
      const warn = el('p', 'jwz-card__warn', fr('Une autre boutique, « ' + S.replaceAsk + ' », est enregistrée dans ce navigateur. Ouvrir celle-ci la remplacera.'));
      warn.id = 'jwz-replace-warn';
      actions.appendChild(warn);
      const yes = el('button', 'jwz-btn jwz-btn--primary', 'Remplacer et ouvrir');
      yes.type = 'button';
      yes.setAttribute('aria-describedby', 'jwz-replace-warn');
      yes.addEventListener('click', () => openEditorFromChat(true));
      const no = el('button', 'jwz-btn jwz-btn--ghost', 'Garder l’ancienne');
      no.type = 'button';
      no.addEventListener('click', () => { S.replaceAsk = null; setQuick(buildCard(S.config)); focusEl(S.el.quick.querySelector('.jwz-btn--primary')); });
      actions.appendChild(yes);
      actions.appendChild(no);
    } else {
      const open = el('button', 'jwz-btn jwz-btn--primary');
      open.type = 'button';
      open.innerHTML = '<span>Ouvrir l’éditeur</span>' + ICON.arrow;
      open.addEventListener('click', () => openEditorFromChat(false));
      const again = el('button', 'jwz-btn jwz-btn--ghost', 'Recommencer');
      again.type = 'button';
      again.addEventListener('click', () => restart());
      actions.appendChild(open);
      actions.appendChild(again);
    }
    body.appendChild(actions);
    card.appendChild(body);
    frag.appendChild(card);
    frag.appendChild(el('p', 'jwz-note', fr('Démo : ici l’assistant comprend des mots-clés. Dans Jeere, une seule IA répondra à sa place et remplira la même fiche boutique.')));
    return frag;
  }

  function fitShot() {
    const shot = S.el.quick && S.el.quick.querySelector('.jwz-shot');
    if (!shot) return;
    const apply = () => {
      const w = shot.clientWidth;
      if (w) shot.style.setProperty('--jwz-s', String(Math.min(1, w / PHONE_W)));
    };
    apply();
    if (root.ResizeObserver) { S.shotRO = new root.ResizeObserver(apply); S.shotRO.observe(shot); }
  }

  /* ---------- to the editor ---------- */

  function savedOther(cfg) {
    let raw = null;
    try { raw = root.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const d = D();
      const saved = d.normalizeConfig(raw);
      const js = JSON.stringify(saved);
      if (js === JSON.stringify(d.normalizeConfig(cfg))) return null;
      if (js === JSON.stringify(d.normalizeConfig(d.defaultConfig(saved.template))) ||
        js === JSON.stringify(d.normalizeConfig(d.defaultConfig(saved.template, saved.store && saved.store.niche)))) return null;
      return String(saved.store && saved.store.name || '').trim() || 'Ma boutique';
    } catch (e) { return null; }
  }

  function openEditorFromChat(confirmed) {
    const B = root.JeereBuilder;
    const cfg = S.config || generate(S.answers);
    if (!B || typeof B.openEditor !== 'function') {
      say('L’éditeur n’est pas encore chargé. Patientez une seconde, puis touchez à nouveau « Ouvrir l’éditeur ».');
      then(() => setQuick(buildCard(cfg)));
      run();
      return;
    }
    if (!confirmed) {
      const other = savedOther(cfg);
      if (other) {
        S.replaceAsk = other;
        setQuick(buildCard(cfg));
        focusEl(S.el.quick.querySelector('.jwz-btn--primary'));
        return;
      }
    }
    S.replaceAsk = null;
    try { root.history.replaceState({ jeere: 'editor' }, '', '#editeur'); } catch (e) { /* file:// or sandbox */ }
    close({ toEditor: true });
    resetState();
    try { B.openEditor(cfg); } catch (e) { /* the editor shows its own errors */ }
  }

  /* ================================================================== overlay */

  function focusEl(node) {
    if (!node || !node.focus) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }
  function focusInputSoon() {
    const fine = !(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    if (fine) focusEl(S.el.input); else focusEl(S.el.title);
  }

  function build() {
    if (S.built) return;
    S.built = true;
    const box = el('div', 'jwz');
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'jwz-title');
    box.setAttribute('aria-describedby', 'jwz-sub');
    box.innerHTML =
      '<header class="jwz-head">' +
        '<span class="jwz-av" aria-hidden="true">' + ICON.mark + '</span>' +
        '<div class="jwz-head__txt">' +
          '<h2 class="jwz-title" id="jwz-title" tabindex="-1">L’assistant Jeere</h2>' +
          '<p class="jwz-sub" id="jwz-sub">' + fr('Démo · 6 petites questions') + '</p>' +
        '</div>' +
        '<button type="button" class="jwz-ibtn" data-jwz="restart" aria-label="Recommencer la conversation" title="Recommencer">' + ICON.restart + '</button>' +
        '<button type="button" class="jwz-ibtn" data-jwz="close" aria-label="Fermer l’assistant" title="Fermer (Échap)">' + ICON.x + '</button>' +
      '</header>' +
      '<div class="jwz-progress" aria-hidden="true"><span></span></div>' +
      '<div class="jwz-scroll" tabindex="-1">' +
        '<div class="jwz-inner">' +
          '<div class="jwz-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation avec l’assistant Jeere"></div>' +
          '<div class="jwz-msg jwz-msg--bot jwz-typing" hidden aria-hidden="true"><span class="jwz-msg__av">' + ICON.mark + '</span>' +
            '<span class="jwz-bubble jwz-dots"><i></i><i></i><i></i></span></div>' +
          '<div class="jwz-quick"></div>' +
        '</div>' +
      '</div>' +
      '<form class="jwz-composer" novalidate>' +
        '<div class="jwz-composer__in">' +
          '<label class="jwz-sr" for="jwz-input">Votre réponse à l’assistant</label>' +
          '<input id="jwz-input" class="jwz-input" type="text" autocomplete="off" enterkeyhint="send" maxlength="300" spellcheck="true">' +
          '<button type="submit" class="jwz-send" aria-label="Envoyer">' + ICON.send + '</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(box);
    const $ = (sel) => box.querySelector(sel);
    S.el = {
      root: box, title: $('#jwz-title'), bar: $('.jwz-progress span'), scroll: $('.jwz-scroll'), log: $('.jwz-log'),
      typing: $('.jwz-typing'), quick: $('.jwz-quick'), form: $('.jwz-composer'), input: $('#jwz-input')
    };
    S.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = S.el.input.value;
      S.el.input.value = '';
      S.lastPointer = 'key';
      submitText(v);
      focusEl(S.el.input);
    });
    $('[data-jwz="close"]').addEventListener('click', () => close());
    $('[data-jwz="restart"]').addEventListener('click', () => restart());
    box.addEventListener('pointerdown', (e) => { S.lastPointer = e.pointerType || 'mouse'; }, true);
    box.addEventListener('keydown', onKey);
    S.el.scroll.addEventListener('scroll', () => {
      const sc = S.el.scroll;
      S.stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    }, { passive: true });
    const vv = root.visualViewport;
    if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); }
    root.addEventListener('resize', fitViewport);
    root.addEventListener('popstate', (e) => {
      if (S.open && !(e.state && e.state.jeere === 'wizard')) close({ fromPop: true });
    });
  }

  function onKey(e) {
    S.lastPointer = 'key';
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = Array.prototype.filter.call(S.el.root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
      (n) => !n.disabled && !n.closest('[hidden]') && !n.closest('[inert]') && n.getClientRects().length);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    const a = document.activeElement;
    if (e.shiftKey && (a === first || !S.el.root.contains(a) || f.indexOf(a) < 0 && a === S.el.scroll)) { e.preventDefault(); focusEl(last); }
    else if (!e.shiftKey && (a === last || !S.el.root.contains(a))) { e.preventDefault(); focusEl(first); }
  }

  function fitViewport() {
    if (!S.open || !S.el.root) return;
    const vv = root.visualViewport;
    const h = vv ? vv.height : root.innerHeight;
    S.el.root.style.height = Math.round(h) + 'px';
    S.el.root.style.top = (vv ? Math.max(0, Math.round(vv.offsetTop)) : 0) + 'px';
    if (S.stick) {
      const sc = S.el.scroll;
      sc.scrollTop = sc.scrollHeight;
    }
  }

  function setInert(on) {
    if (on) {
      S.inerted = [];
      Array.prototype.forEach.call(document.body.children, (n) => {
        if (n === S.el.root || n.tagName === 'SCRIPT' || n.hasAttribute('inert')) return;
        n.setAttribute('inert', '');
        S.inerted.push(n);
      });
    } else {
      S.inerted.forEach((n) => n.removeAttribute('inert'));
      S.inerted = [];
    }
  }

  function open() {
    if (typeof document === 'undefined') return;
    if (!D()) throw new Error('JEERE_DATA manquant');
    build();
    if (S.open) return;
    S.open = true;
    S.prevFocus = document.activeElement;
    S.el.root.hidden = false;
    document.documentElement.classList.add('jwz-lock');
    setInert(true);
    S.stick = true;
    fitViewport();
    try { if (!(root.history.state && root.history.state.jeere === 'wizard')) root.history.pushState({ jeere: 'wizard' }, '', '#assistant'); } catch (e) { /* ignore */ }
    if (!S.started) start(false);
    else { run(); scrollToShow(S.el.quick.firstChild ? S.el.quick : S.el.log.lastElementChild); fitShot(); }
    focusInputSoon();
  }

  function close(o) {
    o = o || {};
    if (!S.open) return;
    fastForward();
    S.open = false;
    S.el.root.hidden = true;
    S.el.root.style.height = '';
    document.documentElement.classList.remove('jwz-lock');
    setInert(false);
    if (!o.fromPop && !o.toEditor) {
      try { if (root.history.state && root.history.state.jeere === 'wizard') root.history.back(); } catch (e) { /* ignore */ }
    }
    if (!o.toEditor && S.prevFocus && document.contains(S.prevFocus)) focusEl(S.prevFocus);
    S.prevFocus = null;
  }

  function reset() { resetState(); }

  root.JeereWizard = { open: open, close: () => close(), reset: reset, understand: understand, generate: generate, STEPS: STEPS.slice() };

  // A link to …/creer/#assistant opens the assistant directly
  if (typeof document !== 'undefined' && document.addEventListener) {
    const boot = () => {
      try {
        if (root.location && root.location.hash === '#assistant' && D()) {
          root.history.replaceState(null, '', root.location.pathname + root.location.search);
          open();
        }
      } catch (e) { /* ignore */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();
