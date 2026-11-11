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
| p1 | T-shirt Lèvres | Hauts | 22 000 | best (old price 28 000 shown on the site) |
| p2 | T-shirt Masque | Hauts | 24 000 | new |
| p3 | T-shirt Console | Hauts | 22 000 | — |
| p4 | T-shirt Racing Délavé | Hauts | 26 000 | new (old price 32 000) |
| p5 | T-shirt Croix | Hauts | 24 000 | — |
| p6 | Jort Denim Noir | Bas | 30 000 | best |
| p7 | Jort Charpentier | Bas | 32 000 | new |
| p8 | Casquette Étoile | Accessoires | 15 000 | — (one size: « TU ») |

The old prices are written in the page (the fiche has no « compare at » price).

## Images: Pinterest

All the images were chosen by the owner on Pinterest and **belong to their authors and brands**
(among them Cold Culture, Protect, Supermade, 4YE, Twojeys). The concept bar, the « Vu sur
Pinterest » moodboard and the footer say so; keep those notes as long as these images are used, and
never use them for a real client.

- Products (`img/<produit>.webp`, 640 × 800, ground #f7f7f7): figures cut from a Pinterest grid of
  fifteen studio looks, the racing tee from a Pinterest product shot (Supermade), the red caps.
- `hero-1` (Cold Culture), `hero-2`, `edito-1` (4YE), `edito-2` (Twojeys), `lookbook` (rotated a
  quarter turn), `mood-1`, `mood-2` (Protect), `mood-3`.
