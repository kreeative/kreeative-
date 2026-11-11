# SÈVE — model shop by Kreeative for Jeere

A botanical skincare shop for a **fictional brand**, made as a model to show what a Jeere shop can
look like: real product photos (amber glass, warm neutral grounds), condensed serif titles, a dark green rounded header,
a split hero, a product carousel, a catalogue with category filters. French, prices in FCFA.

Live (unlisted): https://kreeative.xyz/concepts/seve/

## Ground rules

- `noindex, nofollow`, not linked from the portfolio, not in the sitemap.
- Keep the concept bar: SÈVE is fictional, orders placed here are test orders and nothing ships.
- The photos are free Unsplash photos of unbranded products (credits below). No photo shows a
  real brand's label.

## Pages

- `index.html` — split hero, « Trouvez votre soin » carousel (tabs Tout / Best-sellers /
  Nouveautés), « Formules » cards, six products of the catalogue, commitments, footer.
- `catalogue/index.html` — the whole catalogue, filters by category with counts (also from the
  address: `catalogue/#visage`), sort by price.
- `produits/<produit>/index.html` — one page per product: packshot, price, description,
  « Ajouter au panier », « Commander maintenant », benefits / ingredients / use, related products.
- `commande/` — the checkout, the same as ANSE's (`commande.js`, store `seve`): contact, delivery
  commune and fee, payment method from the store's fiche, order placed with Jeere's `orders`
  function, card payments through `payments` (Stripe), confirmation with the order number.
- `site.js` — carousel, tabs, filters, sort, cart drawer, cart thumbnails, « Commander maintenant ».

## The Jeere store `seve` (to create — Jeere session)

The site reads `data-store="seve"`. Products, one per id, no variants:

| id | name | category | price (FCFA) | badge |
|---|---|---|---|---|
| p1 | Huile Visage Réparatrice | Visage | 24 000 | best |
| p2 | Sérum Hydratation Intense | Visage | 26 000 | best |
| p3 | Crème de Nuit Régénérante | Visage | 28 000 | new |
| p4 | Savon Mains Apothicaire | Bain & corps | 18 000 | — |
| p5 | Huile Corps Karité & Néroli | Bain & corps | 22 000 | — |
| p6 | Gel Douche Vétiver | Bain & corps | 16 000 | best |
| p7 | Gélules Éclat | Compléments | 20 000 | new |
| p8 | Crème Mains Karité | Bain & corps | 12 000 | — |
| p9 | Brume d'Oreiller Lavande | Brumes | 15 000 | new |

Also: a delivery section with the Abidjan communes and fees (the checkout reads them), the payment
methods (Wave, Orange Money, MTN MoMo, cash on delivery; card once Stripe is connected), and the
folder `concepts/seve/` with its sub-pages in the Studio's editable sites.

Until the store exists, the page shows its own names and prices and the cart works, but
« Confirmer la commande » answers « Boutique introuvable ».

## Duplicate for a client

Copy the folder, replace texts, images (`img/`, and the `PHOTOS` map in `site.js`), `data-store`
in every page and `SLUG` in `commande/commande.js`. Photo brief for a real client: product alone,
warm neutral background, soft side light, a leaf shadow or a natural prop (stone, wood, linen).

## Photo credits (Unsplash licence)

- Kadarius Seegars — `hero`, `huile-visage`, `brume`, `formule-visage`
- Nataliya Melnychuk — `serum`
- pmv chamara — `creme-nuit`
- Anna Khromova — `savon-mains`
- Denley Photography — `huile-corps`, `gel-douche`
- NutraSeller Manufacturing — `gelules`, `formule-gelules`
- Bharath Kumar — `creme-mains`
- Iain Robertson — `eucalyptus`
- Jessica Irani — `formule-rituels`
