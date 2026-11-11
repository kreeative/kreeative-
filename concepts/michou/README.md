# MICHOU — model shop by Kreeative for Jeere

A streetwear shop for a **fictional brand**, made as a model for Jeere: a dark editorial hero, a
black ribbon, product cards on light grey (after the « Represent » layout), and a product page in
monospace lowercase with sizes in round pills and « porté avec » (after an iPad reference).
French, prices in FCFA. Fonts: Archivo (expanded, extra bold) for the wordmark and titles, Fragment
Mono for everything else (Google Fonts).

Live (unlisted): https://kreeative.xyz/concepts/michou/

## Ground rules

- `noindex, nofollow`, not linked from the portfolio, not in the sitemap.
- Keep the concept bar: MICHOU is fictional, the photos are illustration images, nothing is sold.

## Pages

- `index.html` — hero (two photos), ribbon, « Nouveautés » (4), editorial pair, « Les essentiels »
  (4), lookbook, footer. The header sits over the hero and turns white on scroll.
- `boutique/index.html` — every product, filters tout / vestes / hauts / bas (also `#bas` etc.).
- `produits/<produit>/index.html` — photo, price (old price struck through), « autres pièces »,
  sizes XXS–XXL, add button, details / size guide / delivery, « porté avec ».
- `commande/` — the Jeere checkout (store `michou`), as in ANSE.

## Sizes (Jeere has no variants)

The « + » on a card and the product page ask for a size before adding to the cart. `site.js` keeps
the sizes in `localStorage` (`michou:tailles`, one size per item), shows them in the cart lines, and
`commande/commande.js` writes them at the top of the order's note, for example
« Tailles : Doudoune Brillante M ; Cargo Chaîne L, L ». The shop sees them in the order.

## The Jeere store `michou` (to create — Jeere session)

| id | name | category | price (FCFA) | badge |
|---|---|---|---|---|
| p1 | Doudoune Brillante | Vestes | 65 000 | new (old price 85 000 shown on the site) |
| p2 | Bomber Utilitaire | Vestes | 55 000 | new |
| p3 | Veste Denim Délavée | Vestes | 48 000 | promo (old price 60 000) |
| p4 | Gilet Tactique | Vestes | 30 000 | — |
| p5 | T-shirt Lourd | Hauts | 18 000 | best |
| p6 | T-shirt Oversize Délavé | Hauts | 20 000 | promo (old price 25 000) |
| p7 | Cargo Chaîne | Bas | 35 000 | best |
| p8 | Pantalon Large | Bas | 32 000 | new |

The old prices are written in the page (the fiche has no « compare at » price).

## Images (placeholders until the owner's Pinterest selection)

- Products (`img/<produit>.webp`, 1000 × 1250, grey #f2f2f0): full-length Unsplash studio photos cut
  out by script. Some show third-party logos (a cap, a t-shirt print): replace before real use.
- Editorial: `edito-1`, `edito-2` (hero), `edito-3`, `edito-4` (editorial pair, crops of the
  lookbook), `lookbook`.
- Unsplash (free licence): Temuujin Purevjav, Moses Malik Roldan, kevin Clonee, Praise Judah,
  Ali Choubin, Joel Muniz, Lucas Gouvêa, Anton K Wibowo, sattar kazemi, Gift Habeshaw, Julian Tong.

When the Pinterest images arrive: replace the editorial files under the same names, and add their
credit to the concept bar and the footer.
