# SOYEUSE — model shop by Kreeative for Jeere

A hair shop (bundles, wigs, accessories) for a **fictional brand**, made as a model for Jeere: blush
pink, the thin display face Hastegi with its ligatures (`fonts/Hastegi.otf`, self-hosted) and Montserrat, an arched hero, a
scrolling ribbon, « shop by category » circles, a large « glam » visual, reviews, care tips.
French, prices in FCFA.

Live (unlisted): https://kreeative.xyz/concepts/soyeuse/

## Ground rules

- `noindex, nofollow`, not linked from the portfolio, not in the sitemap.
- Keep the concept bar: SOYEUSE is fictional, orders placed here are test orders and nothing ships.
- The reviews are samples written for the demo, and the page says so.
- The newsletter form only shows a message; nothing is sent.

## Pages

- `index.html` — hero on white (big SOYEUSE wordmark, tagline, delivery note, button, seated model),
  ribbon, categories, « Le luxe redéfini » (4 products), glam visual, reviews, care tips, footer.
- `boutique/index.html` — every product, filters Tout / Tissages / Perruques / Accessoires (also
  from the address: `boutique/#perruques`).
- `produits/<produit>/index.html` — one page per product: photo, price, specs, « Ajouter au
  panier », « Commander maintenant », care / delivery / payment, other products.
- `commande/` — the Jeere checkout, the same as ANSE's (`commande.js`, store `soyeuse`).
- `site.js` — filters, cart drawer, cart thumbnails, « Commander maintenant », newsletter message.

## Logo and palette

- **Logo**: SOYEUSE set in Hastegi with its alternate letters (private-use glyphs of the font):
  swash S `U+E020`, O with a star `U+E019`, curled E `U+E013`, S `U+E01D`, in `.logo__mark`
  (`aria-hidden`, the link carries `aria-label="SOYEUSE, accueil"`). The font loads with
  `font-display: block` so the alternates never show as empty boxes.
- **Candy pink (rose bonbon)**: backgrounds `#ffdcee` and `#ffaad5`, accent `#ff7cbd`, logo and large titles
  `#ff3d9e`, small pink text `#c8156f`. Hair cut-outs are cleaned of their light fringe and sit on
  the pink without a shadow, so the pink stays clean.

## Font

Hastegi is self-hosted in `fonts/` (the owner holds a commercial licence). Keep the licence proof;
for a client site, check that the licence covers web embedding for that client.

## Model photos (AI-generated, from the owner's own likeness)

- `img/modele-hero.webp` (hero: front portrait, sleek black lace, white backdrop) and
  `img/modele-glam.webp` (« glam » section: three-quarter, long body wave, pink satin top): generated
  with Higgsfield (Nano Banana Pro, `image_references`) from a cropped selfie of the owner, with her
  consent, so the model is her own likeness and not a stranger's. The backdrops were lifted to pure
  white with PIL. The alt texts say the images are AI-generated.
- The reference selfie is not in the repo. To regenerate, upload a new crop to Higgsfield and reuse
  the prompts in the git history of this file's session notes (front: sleek middle-part lace;
  glam: body wave, baby-pink satin slip, gold hoops).
- For a real client, replace them with the client's own photos (under the same names, or in the Studio).

## The Jeere store `soyeuse` (to create — Jeere session)

| id | name | category | price (FCFA) | badge |
|---|---|---|---|---|
| p1 | Tissage Ondulé (3 paquets · 18") | Tissages | 95 000 | best |
| p2 | Tissage Lisse (3 paquets · 18") | Tissages | 85 000 | best |
| p3 | Tissage Loose Wave (1 paquet · 20") | Tissages | 35 000 | new |
| p4 | Perruque Ondulée (frontal 13x4 · 26") | Perruques | 180 000 | best |
| p5 | Peigne Démêloir | Accessoires | 2 500 | — |

Plus the delivery zones, the payment methods, and `concepts/soyeuse/` with its sub-pages in the
Studio's editable sites. Until the store exists, « Confirmer la commande » answers « Boutique
introuvable ».

## Duplicate for a client

Copy the folder, replace texts, images (`img/`, the `PHOTOS` map in `site.js`), `data-store` in
every page and `SLUG` in `commande/commande.js`.

## Mentions légales and image rights

`mentions-legales/index.html` (linked from the concept bar and the footer of every page) says the
demo images are not ours, who they belong to, how to ask for removal, and that **anyone reusing this
model may take the layout and code but must replace every image before publishing**, and must not
download or repost the demo images. `img/IMAGES-A-NE-PAS-PUBLIER.txt` repeats it inside the image
folder, so it travels with any copy. When Jeere copies this model for a client, it should copy the
code only and leave the images out.
