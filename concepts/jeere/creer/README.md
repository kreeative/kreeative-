# Jeere Studio — store editor prototype

A working prototype of the Jeere store builder: a seller picks a template **or** describes her
store to the Jeere assistant, then edits it in an editor with a live preview of the **whole
store**, from the home page to the checkout and the order confirmation, and can see the
**fiche boutique** (the store config JSON) behind it.

It demonstrates Jeere's key architecture: **the AI never writes code.** It fills a fiche
boutique; our three tested templates render it; the editor edits the very same JSON. A store is
data, not a generated website.

Live (unlisted): https://kreeative.xyz/concepts/jeere/creer/ — `noindex, nofollow`, not linked
from the landing page and not in the sitemap. French only (Côte d'Ivoire, prices in FCFA).

```
Start screen « Créez votre boutique »
 ├─ Partir d'un modèle ─ Plateau · Cocody · Treichville ─┐
 ├─ Décrire ma boutique ─ l'assistant Jeere (chat) ──────┼──► Editor + live preview ──► Fiche boutique (JSON)
 └─ Partir de zéro ─ « Bientôt »                         │      (same JSON in and out)
                                                          └─ JEERE_DATA.defaultConfig / JeereWizard.generate

Live preview, « Page : Accueil ▾ » (one fiche, five pages):
 Accueil ──► Fiche produit ──► Panier ──► Paiement ──► Confirmation
 (home)      (product)         (cart)     (checkout)    (confirmation)
```

## Open it

- Online: `/concepts/jeere/creer/` on kreeative.xyz.
- Locally: serve the repository root (the page uses `../favicon.svg` and links back to the landing):

  ```sh
  python3 -m http.server 8000 --directory /path/to/kreeative-
  # then open http://localhost:8000/concepts/jeere/creer/
  ```

## Files and who does what

Plain static files: no build step, no framework, no library. Classic scripts loaded with
`defer`, in this order; each is an IIFE that exposes exactly one global.

| File | Role | Global |
| --- | --- | --- |
| `data.js` | The contract: templates, 8 palettes (contrast-checked), the 2 colour intensities, 6 font pairs, the 8 section types and their form fields, 8 niches with French example content, Abidjan communes and fees, the payment methods with their checkout texts, the 5 store pages. Pure helpers: `defaultConfig`, `normalizeConfig`, `validate`, `formatPrice`, `normalizeWhatsapp`, `newId`, `clone`. No DOM access, so it also loads in Node and in a Supabase Edge Function. | `window.JEERE_DATA` |
| `render.js`, `store.css` | Renders a fiche into one of the 5 store pages (header and footer on every page) for a phone (390 px) or desktop (1200 px) frame, in vivid or soft colours. Handles the navigation inside the preview and a demo cart. Pure and defensive: escapes every string, never throws, draws product illustrations in SVG when there is no photo, never makes a network request. Store CSS is scoped under `.jst`. | `window.JeereRender` |
| `index.html`, `builder.css`, `editor.js` | The start screen and the editor: tabs Sections, Produits, Thème, Boutique, Qualité; the page selector; device toggle; undo/redo; autosave to `localStorage` (`jeere-studio-config`); the « Fiche boutique » modal (copy, download, import); the « Publier » dialog (prototype: nothing is published). `index.html` holds the logo's SVG symbols. | `window.JeereBuilder` |
| `wizard.js`, `wizard.css` | « Décrire ma boutique »: the local Jeere assistant, a chat that asks 6 questions (name, what you sell, style, colour, needs, city and WhatsApp), understands free text by keywords, handles corrections, and ends with a summary card. `generate(answers)` (always a vivid fiche) and `understand(text, step)` are pure and exposed for tests. Styles scoped under `.jwz`. | `window.JeereWizard` |
| `schema.json` | JSON Schema (draft 2020-12) of the fiche boutique v1. | — |
| `prompts.md` | In French: the single AI assistant of the real product — system prompt, its one tool, the free code around it, the self-improvement loop, the TypeScript orchestration and the cost estimate. | — |
| `README.md` | This file. | — |

The builder chrome (start screen, editor, chat) is black and white only, in Poppins with a
Montserrat fallback for ɛ ɔ ŋ, like the landing page; its only grey is the silver of the logo.
The stores in the preview are in colour: sellers bring the colour.

## The fiche boutique contract (version 1)

One JSON object, fully described by [`schema.json`](schema.json) (`$id`
`https://kreeative.xyz/concepts/jeere/creer/schema.json`). Ids, labels and limits come from
`data.js`. One fiche renders the whole store: nothing in it is specific to a page.

```json
{
  "version": 1,
  "template": "cocody",
  "store": { "name": "Awa Beauté", "tagline": "Soins naturels faits à Abidjan", "whatsapp": "+2250707123456", "city": "Abidjan", "niche": "beauty" },
  "theme": { "palette": "karite", "fonts": "doux", "radius": "round", "buttons": "solid", "intensity": "vivid" },
  "payments": { "wave": true, "orange": true, "mtn": true, "moov": false, "cod": true, "card": false },
  "sections": [
    { "id": "s1", "type": "announcement", "enabled": true, "settings": { "text": "Livraison offerte dès 20 000 FCFA à Cocody" } },
    { "id": "s2", "type": "hero", "enabled": true, "settings": { "kicker": "Nouvelle collection", "title": "Awa Beauté : des soins simples et naturels", "text": "…", "button": "Découvrir", "image": null } }
  ],
  "products": [
    { "id": "p1", "name": "Beurre de karité fouetté", "price": 6500, "category": "Corps", "badge": "best", "art": "jar", "color": "#E9D8BD", "description": "…", "image": null }
  ]
}
```

| Key | Values |
| --- | --- |
| `template` | `plateau` (Éditorial), `cocody` (Doux), `treichville` (Audacieux) |
| `store.niche` | `fashion`, `hair`, `beauty`, `jewellery`, `shoes`, `food`, `home`, `crafts`, or `null` |
| `store.whatsapp` | `""` or an international number (`+2250707123456`); the editor and the assistant normalise what the seller types |
| `theme.palette` | `sable`, `karite`, `lagune`, `hibiscus`, `indigo`, `mangue`, `menthe`, `nuit` (the fiche names a palette; the colours live in `data.js`) |
| `theme.intensity` | `vivid` (Vives, the default) or `soft` (Douces) — see [Colour intensity](#colour-intensity) |
| `theme.fonts` | `editorial`, `moderne`, `doux`, `audacieux`, `classique`, `simple` |
| `theme.radius` / `theme.buttons` | `none`, `soft`, `round` / `solid`, `outline` |
| `payments` | exactly `wave`, `orange`, `mtn`, `moov`, `cod`, `card` (booleans), shown as plain text, never with the operators' logos or colours: in the footer, on the product page and as the checkout's payment options |
| `sections[]` | ordered; ids `s1`, `s2`…; `type` is one of `announcement`, `hero`, `categories`, `products`, `about`, `reviews`, `delivery`, `whatsapp`; `enabled`; `settings` specific to the type (the schema checks each type with `if`/`then`). The zones of the first enabled `delivery` section are also the checkout's commune list |
| `products[]` | ids `p1`, `p2`…; `price` is a whole number of FCFA (`6500`, formatted `6 500 FCFA` for display); `badge` `null`, `new`, `best` or `promo`; `art` one of 12 illustrations; `color` `#RRGGBB`; `image` `null` or a JPEG data URL (≤ 800 px wide) |

The header and the footer are always rendered and are not sections. Character limits (hero
title 70, announcement 90, product name 60, store name 40…) are the editor's and are in the
schema.

Three layers check a fiche:

1. **`schema.json`** — structure, enums, integers, ranges and character limits. This is the
   contract the real AI assistant's output is checked against. Every key is required, including
   `theme.intensity`.
2. **`JEERE_DATA.validate(config)`** — quality rules with a score out of 100 and a status
   (`APPROUVÉ` or `À CORRIGER`): empty store name, no payment method, products section with no
   product, unknown template, palette, fonts or colour intensity, missing WhatsApp number, fewer
   than 3 products, products without a photo… The editor's Qualité tab shows them. A default
   fiche scores 92. Each issue has a `target` (`{ kind: 'theme', id: 'intensity' }`…) that the
   Qualité tab uses to open the right control.
3. **`JEERE_DATA.normalizeConfig(anything)`** — repairs: fills missing keys, drops unknown types,
   fixes ids, parses prices (`'12 500 FCFA'` → `12500`), reads a fiche saved without
   `theme.intensity` as `vivid`. The editor runs it on import and on load. Unique ids are
   guaranteed here (JSON Schema cannot express them).

## The store pages and the checkout journey

Like the page selector of Shopify's theme editor, the preview shows every page of the store,
and the buying journey works inside it.

```js
JEERE_DATA.PAGES = [
  { id: 'home', label: 'Accueil' },          // the enabled sections, in order
  { id: 'product', label: 'Fiche produit' },
  { id: 'cart', label: 'Panier' },
  { id: 'checkout', label: 'Paiement' },
  { id: 'confirmation', label: 'Confirmation' }
];

JeereRender.render(config, rootEl, { device: 'phone' | 'desktop', page: 'home', productId: 'p2' });
```

`page` defaults to `'home'`; `productId` picks the product of the product page (the first product
when it is missing or unknown). Every page has the store's header and footer; the checkout may use
the simplified header of real checkouts (logo, « Paiement sécurisé », a back link). All five pages
follow the template (Plateau editorial, Cocody soft and rounded, Treichville bold), the palette,
the fonts, the radius, the buttons and the colour intensity, at both devices.

**Navigation inside the preview.** The renderer handles its own links: it re-renders the same
`rootEl` with the new page, then dispatches a bubbling, cancelable `CustomEvent('jst:navigate',
{ detail: { page, productId } })` on `rootEl` (`productId` is `null` except on the product page), so
the editor can sync its page selector; cancelling it stops the default scroll back to the top of
the store. It never touches `location` or `history`. `JeereRender.PAGES` mirrors
`JEERE_DATA.PAGES` (with the same fallback when `data.js` is older).

| Click | Goes to |
| --- | --- |
| A product card | the product page of that product |
| « Ajouter au panier » | the cart |
| « Passer au paiement » | the checkout |
| « Payer 14 500 FCFA » / « Confirmer la commande » | the confirmation |
| The header logo, « Retour à la boutique », « Continuer mes achats » | home |
| Back links | the previous step |

**Demo cart.** The cart lives on the root element: `rootEl.__jstCart = { [productId]: qty }`. It
survives re-renders, drops ids that no longer exist, and, when the cart, checkout or confirmation
page is rendered with an empty cart, it is seeded with the first product × 1 (and with the product
of the product page when coming from there). Quantity steppers (− / +, from 1 to 20) and the remove
button work in the preview. What the customer types on the checkout is kept in `rootEl.__jstForm`
for the confirmation page, and nowhere else.

**What each page shows**

- **Fiche produit**: a large visual (the photo, or the illustration on the product colour, at the
  template's image ratio), the badge, name, price, short description, a quantity stepper, the
  primary « Ajouter au panier », the secondary « Commander sur WhatsApp » (chat icon), a delivery
  line (« Livraison dès 1 500 FCFA · Cocody, Plateau… »), chips for the enabled payment methods,
  and « Vous aimerez aussi » with up to 4 other products.
- **Panier**: one line per product (thumbnail, name, unit price, stepper, remove), the subtotal,
  « Frais de livraison calculés à l'étape suivante », the primary « Passer au paiement » and the link
  « Continuer mes achats ».
- **Paiement** (the checkout, designed as a trustworthy mobile-money checkout): the steps
  « Panier › Livraison et paiement › Confirmation »; contact (Prénom, Numéro WhatsApp); delivery
  (a commune select with the fee of each option, « Quartier, repère : ex. près de la pharmacie »,
  an estimated delay); payment (a radio card per **enabled** method, label and hint from
  `JEERE_DATA.PAYMENTS`, neutral text chips or icons, never the companies' logos or colours); the
  order summary (lines, subtotal, delivery fee of the selected commune, total), which updates live
  when the commune or a quantity changes; the primary « Payer 14 500 FCFA » (« Confirmer la
  commande » when « Paiement à la livraison » is selected); the secondary « Commander sur
  WhatsApp »; the trust line « Paiement traité par un partenaire agréé par la BCEAO. Jeere ne garde
  jamais votre argent. ». With no payment method enabled, a clear placeholder replaces the form.
- **Confirmation**: a big check, « Merci Awa ! » (or « Merci ! » without a first name),
  « Commande n° 1042 confirmée », a status line for the chosen method (« Paiement Wave reçu »,
  « À payer à la livraison »…), the delivery estimate, the summary, the primary « Suivre ma commande
  sur WhatsApp » and the link « Retour à la boutique ».

**Where the data comes from.** Everything comes from the fiche and `data.js`; the checkout adds
nothing to the fiche.

- Delivery: the zones of the first enabled `delivery` section, or `JEERE_DATA.communes` (11
  Abidjan communes, 1 500 to 3 000 FCFA) when there is none. The cheapest fee gives « Livraison
  dès … ».
- Payment methods: `config.payments`, in the order of `JEERE_DATA.PAYMENTS`. Each entry has
  `key`, `label`, `kind` (`mobile`, `cod` or `card`), `hint` (the line under the method on the
  checkout) and `status` (the line on the confirmation):

  | key | label | hint | status |
  | --- | --- | --- | --- |
  | `wave` | Wave | Vous recevrez une demande de paiement sur votre numéro Wave. | Paiement Wave reçu |
  | `orange` | Orange Money | Validez le paiement sur votre téléphone. | Paiement Orange Money reçu |
  | `mtn` | MTN MoMo | Validez le paiement sur votre téléphone. | Paiement MTN MoMo reçu |
  | `moov` | Moov Money | Validez le paiement sur votre téléphone. | Paiement Moov Money reçu |
  | `cod` | Paiement à la livraison | Vous payez le livreur en espèces ou par mobile money à la réception. | À payer à la livraison |
  | `card` | Carte bancaire | Visa ou Mastercard, idéal depuis l'étranger. | Paiement par carte reçu |

- Prices: `JEERE_DATA.formatPrice` (`14 500 FCFA`). Product visuals: the same photos and SVG
  illustrations as the home page.

**Rules inside the preview.** Everything stays scoped under `.jst`. The inputs work (typing a
first name shows it on the confirmation) but nothing is sent, stored or validated: no network
request, no `fetch`, no form submission. `keydown` events inside `.jst` inputs stop propagating,
so typing in the checkout never triggers the editor's shortcuts (undo, redo…).

**In the editor.** A page selector « Page : Accueil ▾ » lists the 5 pages, in the top bar on
desktop and in the preview toolbar on mobile (outlined when the preview is not on Accueil).
Choosing a page re-renders the preview on it; the « Fiche produit » page shows the product open in
the Produits tab, else the last product viewed, else the first one. The selector listens to
`jst:navigate` (and cancels it, to scroll its own stage) to follow clicks inside the preview.
Re-renders caused by edits, undo/redo and device switches keep the current page and product.
Clicks on the store's own buttons and fields (`[data-jst-action]`, inputs) are left to the
renderer; a click elsewhere on a section or a product still opens it in the panel. Opening a
section from the Sections tab while on another page brings the preview back to Accueil, except
the Livraison section, whose zones feed the product page, the checkout and the confirmation.
`JeereBuilder.showPage(page, productId)` and `JeereBuilder.getPage()` expose the same thing to
scripts. The start screen thumbnails and template cards always render the home page.

## Colour intensity

The founder felt the stores looked pale. A fiche now says how much of the page its colour covers,
with the Thème tab's control « Couleurs : Vives / Douces »:

```js
JEERE_DATA.INTENSITY_OPTIONS = [
  { value: 'vivid', label: 'Vives', hint: 'Votre couleur habille toute la boutique.' },
  { value: 'soft', label: 'Douces', hint: 'Des fonds clairs, la couleur en touches.' }
];
JEERE_DATA.DEFAULT_INTENSITY = 'vivid';
```

- **`soft`** is the round-1 look: light backgrounds, the accent on buttons and details.
- **`vivid`** lets the palette's strong colour (`accent`) carry the page: the announcement bar in
  accent; the hero on an accent background or a strongly tinted one (Treichville: full accent
  blocks; Cocody: saturated soft blocks; Plateau: a deep accent band behind the hero text or an
  accent frame around the hero image); section backgrounds alternating with tinted surfaces
  (`color-mix(in srgb, var(--st-accent) 10–18%, var(--st-bg))`); richer category and product tiles
  (the product colour pushed towards more saturation, never washed out); badges and prices in
  accent; solid accent buttons.
- **How**: `render` sets `data-intensity="vivid|soft"` on the store root and `store.css` switches
  CSS variables under `.jst[data-intensity="vivid"]`. The palettes in `data.js` never change.
- **Vivid is the default everywhere**: `defaultConfig`, `normalizeConfig` (a fiche saved before
  this key existed, or with an unknown value, becomes `vivid`), the local assistant's
  `generate()`, and the real AI assistant (it keeps `vivid` unless the seller asks for softer,
  lighter or pastel colours — see `prompts.md`). Switching template keeps the current intensity.
- **Editor**: Thème tab, control « Couleurs » with the two options Vives / Douces (`aria-pressed`,
  each with a tiny store drawn in the current palette), right under the « Palette » group, with the
  hint « Vives : votre couleur habille toute la boutique. Douces : des fonds clairs, la couleur en
  touches. ». It goes through undo/redo like any edit; the Qualité tab's intensity issue opens it.
- **Checks**: `schema.json` has `"enum": ["vivid", "soft"]` (required, default `vivid`);
  `validate` reports any other value as an error with target `{ kind: 'theme', id: 'intensity' }`
  (a missing value is not an error: it reads as vivid).

**Contrast budget** (WCAG, computed from the palettes in `data.js`; must hold for 8 palettes × 3
templates × 2 intensities). On accent backgrounds, text uses `onAccent`; on tinted backgrounds,
text uses `text`. `text` keeps at least 10.7:1 on every tint up to 18 %, but `muted` and accent
coloured text need care:

| Palette | onAccent / accent | accent / bg | muted on 10 % / 14 % / 18 % tint | Max tint for muted ≥ 4.5 | accent text on 10 % / 18 % tint |
| --- | --- | --- | --- | --- | --- |
| Sable | 17.12 | 15.33 | 4.84 / 4.43 / 4.05 | 13 % | 12.64 / 10.59 |
| Karité | 5.84 | 5.34 | 5.64 / 5.30 / 5.02 | 25 % | 4.69 / 4.18 |
| Lagune | 7.60 | 7.60 | 5.69 / 5.31 / 4.98 | 23 % | 6.51 / 5.70 |
| Hibiscus | 7.57 | 6.77 | 5.45 / 5.11 / 4.74 | 20 % | 5.70 / 4.97 |
| Indigo | 8.68 | 7.76 | 5.47 / 5.12 / 4.80 | 21 % | 6.63 / 5.81 |
| Mangue | 5.24 | 3.22 | 6.05 / 5.80 / 5.57 | 36 % | 2.88 / 2.66 |
| Menthe | 6.56 | 5.95 | 5.22 / 4.91 / 4.65 | 19 % | 5.17 / 4.60 |
| Nuit | 14.30 | 14.30 | 6.26 / 5.57 / 4.94 | 20 % | 11.50 / 9.07 |

So: keep Sable tints at 12 % or less (or use `text` instead of `muted` on them); Mangue's accent
(3.22:1 on its background) is for large text, buttons, badges with `onAccent` and graphics only,
never for small text such as prices; Karité's accent text needs a tint of 12 % or less. Tint =
`color-mix(in srgb, accent p%, bg)`.

## The logo

The builder (editor top bar, start screen header) and the chat use the landing page's logo: a
geometric silver « j » mark and the word « Jeere » (capital J, Outfit SemiBold, SIL OFL, converted
to a path so the logo needs no font). It replaces the old « JEERE » wordmark (the linked-EE
symbol) and the EE monogram.

- **Symbols**: `index.html`'s hidden `<svg><defs>` holds the gradients `jeere-silver` (for dark
  backgrounds), `jeere-silver-dark` (for light backgrounds) and `jeere-silver-word`, and the
  symbols `mark` (viewBox `0 0 300 372`) and `word` (viewBox `19 297 2497 713`), copied exactly
  from the landing page (`../index.html`).
- **Usage**:

  ```html
  <a href="../" aria-label="Jeere, retour à l'accueil">
    <svg class="logo__mark" viewBox="0 0 300 372" aria-hidden="true" focusable="false"><use href="#mark"/></svg>
    <svg class="logo__word" viewBox="0 0 2497 713" aria-hidden="true" focusable="false"><use href="#word"/></svg>
  </a>
  ```

  ```css
  .logo__mark { height: 28px; width: auto; aspect-ratio: 300 / 372; fill: url(#jeere-silver-dark); } /* on light */
  .logo__word { height: 19px; width: auto; aspect-ratio: 2497 / 713; fill: currentColor; }        /* ink */
  /* on dark backgrounds: mark fill url(#jeere-silver), word fill url(#jeere-silver-word) */
  ```

  Header lockup: the mark about 28 px tall, the word about 19 px, 8 px apart, vertically centred.
- **Chat avatar**: the silver « j » mark on a black circle.
- **Favicon**: `../favicon.svg`, already the silver « j ».
- **The brand word** is written « Jeere » in the UI copy (« l'assistant Jeere », « Retour à
  Jeere »). Code identifiers keep their names: `JEERE_DATA`, `jeere-studio-config`, `.jst`, `.jwz`.

## What is simulated

- **The assistant runs locally, without AI.** In this prototype, « l'assistant Jeere » understands
  keywords (accents and case ignored), handles corrections and always ends with a valid, vivid
  fiche. It says so under its summary card. In the real product, **one** AI assistant (one model,
  one API key, one tool that fills the same fiche) takes its place, and this local assistant stays
  as the free fallback when the AI is down or the monthly budget is reached. Everything about it is
  in [`prompts.md`](prompts.md): the ready-to-paste French system prompt (it also sets
  `theme.intensity`, vivid by default), the `mettre_a_jour_fiche` tool, validation and retries done
  by code, the self-improvement loop (Supabase nightly job, no retraining), the TypeScript Edge
  Function with the Anthropic SDK (`claude-haiku-5-5` by default), and a cost estimate (about
  $0.007 per generated store with Claude Haiku 5.5).
- **Nothing is published and nothing leaves the browser.** « Publier » opens a dialog that
  explains this and points to the waitlist (`../#liste`). The work is saved in `localStorage` on
  this device only.
- **The cart, the checkout and the confirmation are a demo inside the preview.** The cart is held
  in memory on the preview element; the form fields work but nothing is sent; « Payer » never
  charges anyone and always leads to the same confirmation (« Commande n° 1042 »). WhatsApp links
  and the order tracking are shown as they would look; none of them works. Every store, product,
  price, review and person is a made-up example.
- **« Partir de zéro »** is shown as « Bientôt ». It will be an empty template with the same
  sections, rendered by the same templates.

## How to test

In a browser, at 360 px wide (Chrome device mode, a cheap Android phone) and on desktop:

1. Start screen: the new logo (silver « j » + « Jeere ») in the header; the three template cards
   show live previews of their home page; « Partir de zéro » is disabled.
2. Pick a template: the editor opens with the matching default fiche, in vivid colours. Switch
   Téléphone / Ordinateur, edit a section, add a product with a photo, change the palette and the
   template (the intensity stays), undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), check the Qualité
   tab.
3. Thème tab, « Couleurs »: switch Vives / Douces with every template and a few palettes (try
   Sable, Mangue and Nuit): vivid fills the announcement bar, the hero and alternate sections with
   the accent; soft is the light look. All text stays readable.
4. Page selector: go through Accueil, Fiche produit, Panier, Paiement, Confirmation on both
   devices and the three templates. Select a product in the Produits tab: « Fiche produit » shows it.
5. Inside the preview: click a product card, « Ajouter au panier », change quantities (1 to 20),
   remove a line, « Passer au paiement »; the page selector follows. On the checkout, type a first
   name (Ctrl/Cmd+Z in the field must not undo the editor), pick another commune (the delivery fee
   and the total change), pick « Paiement à la livraison » (the button becomes « Confirmer la
   commande »), then confirm: « Merci {prénom} ! ». Turn every payment method off in the Boutique
   tab: the checkout shows its placeholder; hide the Livraison section: the checkout uses the
   default communes.
6. « Fiche boutique »: the JSON (photos shown as `[photo]`, `theme.intensity` present), Copier,
   Télécharger, Importer (import an older fiche without `intensity`: it opens in vivid).
7. Reload: « Reprendre ma boutique » brings the store back, on its saved intensity.
8. « Décrire ma boutique »: the avatar is the silver « j » on black, the copy says « l'assistant
   Jeere ». Answer by chips and by free text (« slt c Mariam Hair, jvd des perruques »), try a
   correction (« non, plutôt audacieux »), then « Ouvrir l'éditeur »: the store is vivid.
9. No horizontal scroll at 360 px, the input stays above the on-screen keyboard, Esc closes the
   dialogs, everything works with the keyboard.

From the command line (Node, from this folder):

```sh
# data.js has no DOM access: load it in Node and print a default fiche (prints: 92 APPROUVÉ vivid)
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('cocody','beauty');const v=D.validate(c);console.log(v.score, v.status, c.theme.intensity);require('fs').writeFileSync('/tmp/fiche.json', JSON.stringify(c,null,2))"

# an older fiche without theme.intensity is read as vivid; an unknown value is an error
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('plateau');delete c.theme.intensity;console.log(D.normalizeConfig(c).theme.intensity);c.theme.intensity='fluo';const i=D.validate(c).issues[0];console.log(i.level, JSON.stringify(i.target), i.message)"

# validate a fiche against schema.json (draft 2020-12), with either tool
npx ajv-cli validate --spec=draft2020 -s schema.json -d /tmp/fiche.json
python3 -c "import json,jsonschema;jsonschema.Draft202012Validator(json.load(open('schema.json'))).validate(json.load(open('/tmp/fiche.json')));print('valid')"
```

When the schema was written, every `defaultConfig(template, niche)` (3 templates × 8 niches),
`normalizeConfig` of garbage input and an editor-like fiche with a photo validated, with both
Python `jsonschema` and Ajv in strict mode; 41 broken fiches (unknown palette, price as text,
rating 6, image URL, wrong settings for the type…) were rejected. With `theme.intensity` (round 2)
the same 36 fiches still validate, all 27 `defaultConfig` fiches are vivid with 0 errors and a
score of 92, `normalizeConfig` turns older fiches into vivid ones, and the schema and `validate`
both reject `"bright"`, `null`, `1` and the label `"Vives"` (the schema also rejects a missing
value).

## Known limits

- One store per browser, saved in `localStorage`: no account, no sync between devices. Large
  photos can fill the storage quota; the editor then saves the store without its photos, says so
  and keeps working. Download the fiche boutique to keep the photos.
- The local assistant only knows its keyword lists; an unusual phrasing gets « je n'ai pas
  compris » and the chips. It never invents products: it uses the niche's example products.
- The example reviews in the default fiches are made up. A real store must never publish invented
  reviews as genuine; the real assistant disables the section until the seller adds real ones
  (see `prompts.md`).
- Product illustrations are generic SVG drawings; a real store needs real photos (the Qualité tab
  says so).
- The checkout is a front-end demo: no order is created, no payment request leaves the page, no
  stock, no promo code, no product variants (size, colour), one delivery fee per commune, and the
  order number is always 1042. The cart is lost when the page reloads.
- Fonts come from Google Fonts: offline, the store falls back to system fonts.

## Next steps

1. **Connect the single assistant described in [`prompts.md`](prompts.md)**: a Supabase Edge
   Function holding the Anthropic API key as a secret, the system prompt and its one tool, code
   validation with `schema.json` and `JEERE_DATA.validate`, monthly and per-store budget caps, and
   this prototype's local assistant as the free fallback.
2. Save fiches in Supabase (one row per store) instead of `localStorage`, with a seller account.
3. Start the « il se nourrit lui-même » loop: anonymised kept stores (opt-in), the nightly job that
   updates the defaults library (template, palette and intensity per niche), the few-shot examples
   and the keyword lists.
4. A real public store page that renders a saved fiche with `render.js` at its own address, with
   its five pages at real URLs.
5. « Partir de zéro », then real orders: the checkout creates the order and sends it on WhatsApp,
   delivery by commune, and mobile-money payments through a payment partner approved by the BCEAO.

## Ground rules

- Private for now: `<meta name="robots" content="noindex, nofollow">`, not linked from the
  portfolio and not in the sitemap.
- No logos or brand colours of Wave, Orange, MTN or Moov, on any page including the checkout:
  they appear as plain text with neutral chips or icons.
- Jeere never holds the sellers' money: the checkout says so, and the real payments go through a
  partner approved by the BCEAO.
- All content is a made-up example (Awa Beauté, Maison Adjoa, Pointure 225…).
