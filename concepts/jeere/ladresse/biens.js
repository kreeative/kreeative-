/* L’ADRESSE — the properties shown in « Sélection du moment ».
 * EXAMPLES for the first version: to be replaced by her own properties (and, later, read from her dashboard so she
 * adds and changes them herself). type: 'louer' | 'vendre'. photos: addresses of pictures, or [] for none yet. */
window.LADRESSE_BIENS = [
  { type: 'louer', name: 'Confort & Modernité', district: 'Abatta', city: 'Abidjan', price: 'Prix à préciser / mois',
    desc: '1 chambre climatisée, salon spacieux et moderne, cuisine équipée, toilettes visiteurs, Wi-Fi haut débit, parking, résidence sécurisée avec gardien.',
    criteria: ['1 chambre', 'Climatisé', 'Cuisine équipée', 'Wi-Fi', 'Parking', 'Gardien'], photos: [] },
  { type: 'louer', name: 'Exemple de bien à louer', district: 'Quartier', city: 'Ville', price: 'Prix / mois',
    desc: 'Nombre de chambres, surface, équipements principaux.', criteria: ['Chambres', 'Surface', 'Équipements'], photos: [] },
  { type: 'vendre', name: 'Exemple de bien à vendre', district: 'Quartier', city: 'Ville', price: 'Prix',
    desc: 'Type de bien, surface, atouts de l’investissement.', criteria: ['Type de bien', 'Surface', 'Atouts'], photos: [] }
];
