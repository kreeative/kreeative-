# ANSE — concept by Kreeative

A clean bag shop where each bag sits in a pastel frame and its handles break out of the
frame onto the white page. **Demo shop:** the bags are not ours and are not really sold; the
photos only show the staging. French, prices in FCFA.

Live (unlisted): https://kreeative.xyz/concepts/anse/

## Ground rules

- Private proposal: `noindex, nofollow`, not linked from the portfolio, not in the sitemap.
  Keep the concept bar and the footer note.
- Products, prices and the cart come from the Jeere store **`anse`** through Jeere Connect
  (`data-store="anse"` in the `<head>`). If Jeere does not answer, the page keeps its own names
  and prices and the cart still adds them up.
- Orders are real Jeere orders (Gérer › Commandes, with the e-mails), placed on the site's own
  checkout. The concept bar says they are test orders and nothing is shipped.

## Pages

- `index.html` — home: hero, the 8 bags, atelier, photo brief, cart drawer.
- `produits/<bag>/index.html` — one page per bag: big frame, price, description, details,
  « Ajouter au panier », « Commander maintenant », three other bags.
- `commande/index.html` + `commande/commande.js` — the checkout:
  1. contact (name, phone, optional e-mail), delivery (commune with its fee, address, note),
     payment (Wave, Orange Money, MTN MoMo, Moov, cash on delivery, card);
  2. communes, fees and payment methods are read from the store's published fiche, so they follow
     the Jeere dashboard; « Carte bancaire » only shows when the store's Stripe is connected
     (`payments` → `available`);
  3. « Confirmer la commande » calls Jeere's `orders` function (`action: 'place'`, `source: 'site'`):
     it recomputes prices and fees from the fiche, records the order and sends the e-mails;
  4. for a card, the `payments` function opens Stripe Checkout, which comes back to
     `commande/?paiement=ok|annule&commande=<n>`;
  5. the confirmation shows the order number, lines, delivery and total, and empties the cart.
- `site.js` — reveal on scroll, the cart drawer, cart thumbnails, « Commander maintenant ».

## Products (one colour = one Jeere product, no variants)

| id | name | price (FCFA) | frame colour | image |
|---|---|---|---|---|
| p1 | Citrine | 145 000 | `#f5eed3` | `img/sac-citrine.webp` |
| p2 | Dragée | 155 000 | `#f6e3e6` | `img/sac-dragee.webp` |
| p3 | Brume | 140 000 | `#e2eaef` | `img/sac-brume.webp` |
| p4 | Ruban | 130 000 | `#e3eded` | `img/sac-ruban.webp` |
| p5 | Olivier | 120 000 | `#ebecd9` | `img/sac-olivier.webp` |
| p6 | Anneau | 230 000 | `#f0ebe2` | `img/sac-anneau.webp` |
| p7 | Cacao | 115 000 | `#ede3d8` | `img/sac-cacao.webp` |
| p8 | Menthe | 165 000 | `#e5eedf` | `img/sac-menthe.webp` |

The card photos carry `data-jeere-photo`: if the store's product has an `https` photo, it
replaces the page's. The frame effect needs a **cut-out photo on a transparent background**, so
either leave the product photo empty in Jeere or upload the same transparent `.webp`.

## Settings per bag (Studio, Design panel)

Each one is a plain CSS property in `style="…"` on its own element, no CSS variables:

- **Frame colour:** `background-color` on `.cadre`.
- **Bag size:** `width` on `.photo` (percent of the frame).
- **Bag position:** `margin-top` on `.photo`. More negative = the bag goes up and the handles
  break out further. Aim to keep the bag's body inside the frame.

## Photo brief for a client

Plain light background, front view at bag height, handles raised and fully visible, soft
light. Then cut out the background and save as `.webp` with transparency.

## Notes for Jeere

- The Studio needs `concepts/anse/` **and its sub-pages** (`produits/*/index.html`,
  `commande/index.html`) in its editable sites.
- The store has no WhatsApp number and no mobile money numbers (`store.pay`): after a Wave,
  Orange or MTN order the page says the shop will contact the buyer for payment. With numbers in
  the fiche, the confirmation could show them, as `b/b.js` does.

## Duplicate for a client

Copy `concepts/anse/` to `concepts/<client>/`, replace texts, images, `data-store` and `SLUG` in
`commande/commande.js` (plus the `PHOTOS` map in `site.js`), then ask
the Jeere session to create the store and add the folder to the Studio's editable sites.
