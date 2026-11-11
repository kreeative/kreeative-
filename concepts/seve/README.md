# SÈVE — model shop by Kreeative for Jeere

A scented body-care shop for a **fictional brand**, made as a model to show what a Jeere shop can
look like: studio packshots on one cream ground, condensed serif titles, a dark green rounded
header, a split hero, a product carousel, a catalogue with category filters. French, prices in FCFA.

Live (unlisted): https://kreeative.xyz/concepts/seve/

## Ground rules

- `noindex, nofollow`, not linked from the portfolio, not in the sitemap.
- **The products photographed belong to the brand CYKLAR** (photos supplied by the owner). The
  concept bar and the footer say so, and that they are not sold here; names, prices and texts are
  invented to show the layout. Keep those notes as long as these photos are used, and replace the
  photos with the client's own before any real use.
- Orders placed here are test orders and nothing ships.

## Pages

- `index.html` — split hero, « Trouvez votre soin » carousel (tabs Tout / Best-sellers /
  Nouveautés), « Formules » cards, six products of the catalogue, commitments, footer.
- `catalogue/index.html` — the whole catalogue, filters by category with counts (also from the
  address: `catalogue/#visage`), sort by price.
- `produits/<produit>/index.html` — one page per product: packshot, price, description,
  « Ajouter au panier », « Commander maintenant », benefits / notes / use, related products.
- `commande/` — the checkout, the same as ANSE's (`commande.js`, store `seve`): contact, delivery
  commune and fee, payment method from the store's fiche, order placed with Jeere's `orders`
  function, card payments through `payments` (Stripe), confirmation with the order number.
- `site.js` — carousel, tabs, filters, sort, cart drawer, cart thumbnails, « Commander maintenant ».

## The Jeere store `seve` (to create — Jeere session)

The site reads `data-store="seve"`. Products, one per id, no variants:

| id | name | category | price (FCFA) | badge |
|---|---|---|---|---|
| p1 | Gel Douche Vanille | Gels douche | 18 000 | best |
| p2 | Gel Douche Santal | Gels douche | 18 000 | best |
| p3 | Gel Douche Musc | Gels douche | 18 000 | new |
| p4 | Gel Douche Bergamote | Gels douche | 18 000 | — |
| p5 | Crème Corps Santal | Crèmes | 24 000 | best |
| p6 | Crème Corps Bergamote | Crèmes | 24 000 | — |
| p7 | Crème Mains Bergamote | Crèmes | 12 000 | new |
| p8 | Déodorant Bergamote | Déodorant | 14 000 | new |
| p9 | Huile de Parfum Santal | Parfums | 35 000 | — |

Also: a delivery section with the Abidjan communes and fees (the checkout reads them), the payment
methods (Wave, Orange Money, MTN MoMo, cash on delivery; card once Stripe is connected), and the
folder `concepts/seve/` with its sub-pages in the Studio's editable sites.

Until the store exists, the page shows its own names and prices and the cart works, but
« Confirmer la commande » answers « Boutique introuvable ».

## Duplicate for a client

Copy the folder, replace texts, images (`img/`, and the `PHOTOS` map in `site.js`), `data-store`
in every page and `SLUG` in `commande/commande.js`. Photo brief for a real client: product alone,
warm neutral background, soft side light, a leaf shadow or a natural prop (stone, wood, linen).

## Images

- Product packshots (`gel-*`, `creme-*`, `deodorant`, `huile-parfum-santal`) and `hero`,
  `formule-santal`, `formule-bergamote`: cut out of three CYKLAR group photos and set on one
  cream ground (#efeee5), 1000 × 1250.
- Unsplash (free licence): Iain Robertson — `eucalyptus`; Jessica Irani — `formule-rituels`.
