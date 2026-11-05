# Jeere Studio — store editor prototype

A working prototype of the Jeere store builder: a seller picks a template **or** describes her
store to the Jeere assistant, then edits it in an editor with a live preview of the **whole
store**, from the home page to the checkout and the order confirmation, and can see the
**fiche boutique** (the store config JSON) behind it.

It demonstrates Jeere's key architecture: **the AI never writes code.** It fills a fiche
boutique; our three tested templates render it; the editor edits the very same JSON. A store is
data, not a generated website.

Since round 3 the prototype also answers the founder's question « how do sellers sign up to manage
their pages, and where are the connectors and the other settings? »: a phone-first **account**
page (`../compte/`), a Shopify-class **seller dashboard** (`../admin/`) with orders, products,
customers, the store's own pages, payments, delivery, **connectors** and settings, and custom
store pages in the fiche (`config.pages`). Everything stays a front-end demo: no backend, the
state lives in this browser's `localStorage`, and every screen says so where it matters.

Live (unlisted): https://kreeative.xyz/concepts/jeere/creer/ (and `/concepts/jeere/compte/`,
`/concepts/jeere/admin/`) — `noindex, nofollow`, not linked from the landing page and not in the
sitemap. French only (Côte d'Ivoire, prices in FCFA).

```
../compte/  « Créer un compte » / « Se connecter »                 ../admin/  Tableau de bord
 prénom + numéro WhatsApp ─► code à 6 chiffres (démo) ─►            Accueil · Commandes · Produits · Clients
 nom de la boutique ─► « Comment voulez-vous commencer ? » ──────►  Boutique en ligne · Pages · Paiements
      │ Choisir un modèle / Discuter avec l'assistant                Livraison · Connecteurs · Paramètres
      ▼                                                                  │ « Personnaliser », « Voir »
Start screen « Créez votre boutique »                                    ▼ ('jeere-studio-open')
 ├─ Partir d'un modèle ─ Plateau · Cocody · Treichville ─┐
 ├─ Décrire ma boutique ─ l'assistant Jeere (chat) ──────┼──► Editor + live preview ──► Fiche boutique (JSON)
 └─ Partir de zéro ─ « Bientôt »                         │      (same JSON in and out; the dashboard
                                                          │       reads and writes it too)
                                                          └─ JEERE_DATA.defaultConfig / JeereWizard.generate

Live preview, « Page : Accueil ▾ » (one fiche, five pages, plus the store's own pages):
 Accueil ──► Fiche produit ──► Panier ──► Paiement ──► Confirmation     Vos pages: À propos · Livraison
 (home)      (product)         (cart)     (checkout)    (confirmation)   et retours · Contact · Conditions
                                                                         de vente (page: 'page', pageId)
```

## Open it

- Online: `/concepts/jeere/creer/` (editor), `/concepts/jeere/compte/` (account) and
  `/concepts/jeere/admin/` (dashboard) on kreeative.xyz.
- Locally: serve the repository root (the pages use `../favicon.svg`, `../creer/data.js` and link
  back to the landing):

  ```sh
  python3 -m http.server 8000 --directory /path/to/kreeative-
  # then open http://localhost:8000/concepts/jeere/creer/, …/compte/ or …/admin/
  ```

## Files and who does what

Plain static files: no build step, no framework, no library. Classic scripts loaded with
`defer`, in this order; each is an IIFE that exposes exactly one global.

| File | Role | Global |
| --- | --- | --- |
| `data.js` | The contract: templates, 8 palettes (contrast-checked), the 2 colour intensities, the custom colours (`COLOR_GROUPS`, `themeColors`, `sectionColors`, `colorChecks`, `fixColors`), 6 font pairs, the 8 section types and their form fields, 8 niches with French example content (including the 4 default custom pages of each niche), Abidjan communes and fees, the payment methods with their checkout texts, the 5 store pages. The seller side: `PLANS`, `CONNECTORS` and `CONNECTOR_CATEGORIES`, `ADMIN_DEFAULTS`, `ORDER_STATUSES`, `STORAGE_KEYS`, `demoOrders`. Pure helpers: `defaultConfig`, `normalizeConfig`, `validate`, `formatPrice`, `normalizeWhatsapp`, `slugify`, `newId`, `clone`… No DOM access, so it also loads in Node and in a Supabase Edge Function. | `window.JEERE_DATA` |
| `render.js`, `store.css` | Renders a fiche into one of the 5 store pages (header and footer on every page) for a phone (390 px) or desktop (1200 px) frame, in vivid or soft colours. Handles the navigation inside the preview and a demo cart. Pure and defensive: escapes every string, never throws, shows the seller's photo, else the demo photo, else draws the product illustration in SVG, never makes a network request to another site. Store CSS is scoped under `.jst`. | `window.JeereRender` |
| `img/demo/` | The demo photos of the example stores (WebP), with `CREDITS.md`: see [Demo photos](#demo-photos). 69 photos from Unsplash: 8 per niche (6 products, the hero, the about section) and 5 in `landing/` for the mock-ups of the landing page. | — |
| `index.html`, `builder.css`, `editor.js` | The start screen and the editor: tabs Sections, Produits, Thème, Boutique, Qualité; the page selector; device toggle; undo/redo; autosave to `localStorage` (`jeere-studio-config`); the « Fiche boutique » modal (copy, download, import); the « Publier » dialog (prototype: nothing is published). `index.html` holds the logo's SVG symbols. | `window.JeereBuilder` |
| `tour.js`, `tour.css` | The guided tour shared by the editor and the dashboard: a spotlight on one area, a short bubble with the cloud as the guide, « Suivant » / « Retour » / « Passer », « 2/8 ». See [Guided tours and « Premiers pas »](#guided-tours-and-premiers-pas). Styles scoped under `.jt`. | `window.JeereTour` |
| `wizard.js`, `wizard.css` | « Décrire ma boutique »: the local Jeere assistant, a chat that asks 6 questions (name, what you sell, style, colour, needs, city and WhatsApp), understands free text by keywords, handles corrections, and ends with a summary card. `generate(answers)` (always a vivid fiche) and `understand(text, step)` are pure and exposed for tests. Styles scoped under `.jwz`. | `window.JeereWizard` |
| `schema.json` | JSON Schema (draft 2020-12) of the fiche boutique v1, `pages` included. | — |
| `prompts.md` | In French: the single AI assistant of the real product — system prompt, its one tool, the free code around it, the self-improvement loop, the TypeScript orchestration and the cost estimate. The assistant can also adapt the 4 default pages. | — |
| `README.md` | This file: the whole prototype, the account and the dashboard included. | — |
| `../compte/` (`index.html`, `compte.css`, `compte.js`) | Sign-up and login, phone number first, no e-mail: see [Seller accounts](#seller-accounts-compte). Loads `../creer/data.js`. | — |
| `../admin/` (`index.html`, `admin.css`, `admin.js`) | The seller dashboard: see [The seller dashboard](#the-seller-dashboard-admin). Loads `../creer/data.js`, `../creer/render.js` and `../creer/store.css` (for its mini preview of the store), and `../creer/tour.js` and `../creer/tour.css` (its guided tour). | — |

The three apps share five `localStorage` keys, listed in
[Shared browser storage](#shared-browser-storage).

The builder chrome (start screen, editor, chat) is black and white, in Poppins with a
Montserrat fallback for ɛ ɔ ŋ, like the landing page; the logo is black ink too (the hand-drawn cloud).
The stores in the preview are in colour: sellers bring the colour. The platform UI (editor, assistant,
dashboard, account) only adds colour when it means something: see [Couleurs d’état](#couleurs-détat).

### Couleurs d’état

Black and white everywhere is tiring and hides what needs attention, so the platform UI (`builder.css`,
`wizard.css`, `../admin/admin.css`, `../compte/compte.css`; never `store.css`, `render.js` or the landing page)
uses four colour codes, like apps do. Only in small doses: a badge, a dot, an icon, a thin line, a chart bar,
never a big coloured area. Never colour alone either: there is always the word (« Payée ») or an icon
(✓ ! × i) next to it, so the meaning survives for colour-blind people and in greyscale.

| Meaning | Where | Dot / icon / line | Tint (background) | Text on the tint |
|---|---|---|---|---|
| **OK, done** (`--ok`) | « Payée », « Livrée », « Encaissée », « Connecté », « Prête », « Enregistré dans ce navigateur », done checklist steps and timeline steps, « APPROUVÉ », code accepted, « Compte créé » | `#22C55E` (4.3:1 on white) | `#DCFCE7` | `#166534` (5.8:1 on the tint) |
| **Attention** (`--warn`) | « Paiement en attente », « À encaisser », « En attente », « Stock faible » (fewer than 3), « À vérifier », « À relire », « À améliorer » in Qualité, « Enregistré, sans les photos », warning notes | `#F5B800` (3.8:1) | `#FEF6D3` | `#7A5A00` (6.3:1) |
| **Problem** (`--err`) | « Annulée », failed delivery, « Épuisé », « Ce navigateur bloque l’enregistrement », form errors (`aria-invalid`, `.a-error`, `.c-err`, `.b-error`), « À corriger » in Qualité, « Non enregistré », delete buttons | `#EF4444` (5.5:1) | `#FDE8E8` | `#B91C1C` (6.4:1) |
| **Info, in progress** (`--info`) | « Nouvelle », « Expédiée » (on its way), « Conseils » in Qualité, help notes (info icon), demo notices | `#3B82F6` (sky blue) | `#E6F0FF` | `#1D4ED8` |

Each CSS file defines the tokens once on `:root` (`.jwz` for the assistant, which only needs `--warn…`): `--ok`, `--ok-bg`, `--ok-ink`,
then `--warn…`, `--err…`, `--info…`, with the same values everywhere. The `-ink` colours also pass 4.5:1 on
white and on `--grey-1`. A class gives an element its meaning: `.a-tone--ok|warn|err|info` in the dashboard,
`.b-tone--…` in the editor; it sets `--t`, `--t-bg` and `--t-ink`, which pills (`.a-pill`), chips
(`.a-chip`), dots (`.a-dot`), stock lines (`.a-stock`), payment boxes (`.a-paystate`), the Qualité badge
(`.b-status`), its meter and its counters read. Toasts (`.a-toast--…`, `.b-toast[data-tone]`) get a small
round icon on a tint; `toast(msg, { tone })` in the dashboard and `toast(msg, ms, tone)` in the editor take the
tone, and without one it is guessed from the wording (« n’a pas pu » = problem, « d’abord » = attention,
« enregistré », « ajouté » = OK…). The order filter chips show a dot of their status colour; « Toutes » and
« À préparer » have none.

**Charts** use five series colours. None of them is a status colour: green, orange and red keep their
meaning, so a chart bar never reads as « attention » or « problem ». `--chart-1` `#3657FF` (brand blue, main
series, 5.3:1 on white), `--chart-2` `#B79CFF` (light purple), `--chart-3` `#22C55E`
(green), `--chart-4` `#FACC15` (yellow), `--chart-5` `#7DD3FC` (light sky). Neighbours
differ in lightness as well as hue (CIE L 45 / 33 / 58 / 27 / 60), so two stacked segments are at least 1.5:1
apart even in greyscale. In a simulation (Machado 2009, full severity, CIE76 ΔE) series 1 and 2 stay apart
for protanopia (ΔE 38), deuteranopia (ΔE 56) and tritanopia (ΔE 66); the closest pair of all five series, for
any vision, is ΔE 23 (magenta / slate, deuteranopia), and the closest series to a status colour is turquoise
vs green for tritanopes (ΔE 11). Every chart has a legend that names each colour. The dashboard home chart
« Ventes par jour et par canal » stacks each day's bar by sales channel (Boutique en ligne, WhatsApp,
Instagram, TikTok, in that order from the bottom, with a 2 px white gap between segments); the legend under
the bars says « De bas en haut » and lists the channels in the stack order with their totals, and the
`role="img"` label reads the amounts per channel for every day. Before changing a chart colour, check
its contrast on white (3:1), its contrast with its neighbours in the stack, and its ΔE to the other series and
to `--ok`, `--warn`, `--err` under the three simulations.

**Same situation, same colour, in every app.** « Ce navigateur bloque l’enregistrement » (changes will be
lost) is red everywhere: the dashboard toast, the editor save state, the account page notice
(`.c-notice--err`). A partial save (« Enregistré, sans les photos », the editor toast about photos filling the
memory) is orange. A failed delivery that cancels the order is red in both the timeline and its note
(`.a-note--err`); « à relivrer » (back to « Nouvelle ») is orange. In the order timeline the green line stops
before a red « Commande annulée » step. Status changes pass their tone to the toast explicitly
(`STATUS_TONE`), as do failed saves (« n’a pas été enregistré(e) » = red), so a green check never sits on a
problem.

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
    { "id": "s2", "type": "hero", "enabled": true, "settings": { "kicker": "Nouvelle collection", "title": "Awa Beauté : des soins simples et naturels", "text": "…", "button": "Découvrir", "image": null, "photo": "beauty-hero" } }
  ],
  "products": [
    { "id": "p1", "name": "Beurre de karité brut", "price": 6500, "category": "Corps", "badge": "best", "art": "jar", "color": "#E9D8BD", "description": "…", "image": null, "photo": "beauty-beurre-karite-fouette" }
  ],
  "pages": [
    { "id": "pg1", "title": "À propos", "slug": "a-propos", "body": "Awa Beauté, ce sont des soins simples…\n\nTout a commencé dans notre cuisine à Cocody…", "inMenu": true, "inFooter": true },
    { "id": "pg3", "title": "Contact", "slug": "contact", "body": "Le plus simple pour nous joindre, c'est WhatsApp…", "inMenu": true, "inFooter": true }
  ]
}
```

| Key | Values |
| --- | --- |
| `template` | `plateau` (Éditorial), `cocody` (Doux), `treichville` (Audacieux) |
| `store.niche` | `fashion`, `hair`, `beauty`, `jewellery`, `shoes`, `food`, `home`, `crafts`, or `null` |
| `store.whatsapp` | `""` or an international number (`+2250707123456`); the editor and the assistant normalise what the seller types |
| `store.logo`, `store.logoSize`, `store.logoPosition`, `store.showName`, `store.icon` | optional: the seller's logo (data URL), its size (`S`/`M`/`L` or 24–72 px), its place (`left`/`center`, `null` = the template's), the name next to it, the tab icon. A fiche without them shows its name as text, exactly as before — see [The store's logo](#the-stores-logo-storelogo) |
| `theme.palette` | `sable`, `karite`, `lagune`, `hibiscus`, `indigo`, `mangue`, `menthe`, `nuit` (the fiche names a palette; the colours live in `data.js`) |
| `theme.intensity` | `vivid` (Vives, the default) or `soft` (Douces) — see [Colour intensity](#colour-intensity) |
| `theme.colors`, `sections[].settings.bg` / `fg`, hero `buttonBg` / `buttonText` | optional: the seller's own colours over the palette (any of its six colours, the announcement bar, the header, the footer, the badges) and each section's ground and text. A fiche without them renders exactly as before — see [Custom colours](#custom-colours-themecolors-section-colours) |
| `theme.fonts` | `editorial`, `moderne`, `doux`, `audacieux`, `classique`, `simple` |
| `theme.radius` / `theme.buttons` | `none`, `soft`, `round` / `solid`, `outline` |
| `payments` | exactly `wave`, `orange`, `mtn`, `moov`, `cod`, `card` (booleans), shown as plain text, never with the operators' logos or colours: in the footer, on the product page and as the checkout's payment options |
| `sections[]` | ordered; ids `s1`, `s2`…; `type` is one of `announcement`, `hero`, `categories`, `products`, `about`, `reviews`, `delivery`, `whatsapp`; `enabled`; `settings` specific to the type (the schema checks each type with `if`/`then`); `hero` and `about` have `image` and the optional demo `photo`. The zones of the first enabled `delivery` section (else of a hidden one) are also the checkout's commune list |
| `products[]` | ids `p1`, `p2`…; `price` is a whole number of FCFA (`6500`, formatted `6 500 FCFA` for display); `badge` `null`, `new`, `best` or `promo`; `art` one of 12 illustrations; `color` `#RRGGBB`; `image` `null` or a JPEG data URL (≤ 800 px wide); `photo` `null` or a demo photo id (optional, see [Demo photos](#demo-photos)) |
| `pages[]` | the store's own pages, 20 at most: ids `pg1`, `pg2`…; `title` ≤ 60; `slug` unique, `[a-z0-9]` words joined by hyphens; `body` plain text ≤ 4 000 characters, paragraphs separated by a blank line; `inMenu`, `inFooter` booleans — see [The store's own pages](#the-stores-own-pages-configpages) |

The header and the footer are always rendered and are not sections. Character limits (hero
title 70, announcement 90, product name 60, store name 40, page title 60, page body 4 000…) are
the editor's and the dashboard's, and are in the schema.

Three layers check a fiche:

1. **`schema.json`** — structure, enums, integers, ranges and character limits. This is the
   contract the real AI assistant's output is checked against. Every key is required, including
   `theme.intensity`, except the optional demo photo ids (`photo`).
2. **`JEERE_DATA.validate(config)`** — quality rules with a score out of 100 and a status
   (`APPROUVÉ` or `À CORRIGER`): empty store name, no payment method, products section with no
   product, unknown template, palette, fonts or colour intensity, missing WhatsApp number, fewer
   than 3 products, products without a photo, a page without a title… The editor's Qualité tab
   shows them. A default fiche scores 92 (the « Ajoutez votre logo » tip is `free: true`: shown, never
   counted in the score). Each issue has a `target` (`{ kind: 'theme', id:
   'intensity' }`, `{ kind: 'page', id: 'pg2' }`…) that the Qualité tab uses to open the right
   control.
3. **`JEERE_DATA.normalizeConfig(anything)`** — repairs: fills missing keys, drops unknown types,
   fixes ids, parses prices (`'12 500 FCFA'` → `12500`), reads a fiche saved without
   `theme.intensity` as `vivid`, gives a fiche saved without `pages` the 4 default pages of its
   niche. The editor runs it on import and on load, the dashboard on every write. Unique ids and
   page slugs are guaranteed here (JSON Schema cannot express them).

## Demo photos

The example stores show real photos instead of the illustrations: « demo photos », hosted with
the app in `img/demo/<niche>/<file>.webp` (never loaded from another site). There are 69: 8 per
niche (6 products, the hero, the about section) and 5 in `img/demo/landing/` for the mock-ups of
the landing page (in the catalogue so that they are credited and checked like the others). Without
the catalogue (`DEMO_PHOTOS` emptied), every fiche has `photo: null` everywhere and every store
renders as it did before the photos, byte for byte, apart from two later changes that have nothing
to do with photos: a category tile shows the category's last product (the product grid opens with
the first ones), and a product picture next to the product's name has `alt=""`.

- **The catalogue**, `JEERE_DATA.DEMO_PHOTOS` in `data.js`, keyed by photo id (lower case words
  joined by hyphens, `^[a-z0-9]+(?:-[a-z0-9]+)*$`): `<folder>-<file name>`, so `beauty/hero.webp`
  is `beauty-hero` and `landing/casquette.webp` is `landing-casquette`. An entry:

  ```js
  'beauty-savon-noir-karite': {
    file: 'beauty/savon-noir-karite.webp', focus: '50% 50%',   // path under creer/img/demo/; optional CSS object-position of the crop
    alt: 'Pain de savon noir posé sur du marbre blanc, avec un brin de lavande et un linge en lin',  // French description of the photo
    credit: { name: 'Miguel Constantin Montes', username: 'createwithconstantin', photoUrl: 'https://unsplash.com/photos/a-gray-book-sitting-on-top-of-a-table-next-to-flowers-x4021J6aHfw', profileUrl: 'https://unsplash.com/@createwithconstantin' }
  }
  ```

  Sizes: products 1000 × 1250 (4:5), heroes 1600 × 1600, about photos 1200 × 1500, landing photos
  800 × 1000.

- **Which store uses which photo**, `NICHE_PHOTOS` in `data.js`: `niche -> { hero, about,
  products: [ids in the order of the niche's products] }` (`null`, or a short list, leaves a product
  on its illustration). It is applied to the niches when `data.js` loads (`niche.hero.photo`,
  `niche.about.photo`, `niche.products[i].photo`); `defaultConfig` and `sectionSettings` copy them
  into new fiches, so the editor's templates, the assistant (`generate`) and a niche change all get
  them. Every id must be in `DEMO_PHOTOS`: an unknown id becomes `null`.
- **In the fiche**: `products[].photo` and `settings.photo` of the `hero` and `about` sections, a
  `DEMO_PHOTOS` id or `null`. Optional in `schema.json` (an older fiche without them is valid);
  `normalizeConfig` keeps a known id and turns anything else into `null`, never throws; `validate`
  never reports a missing photo. Its photo tip counts a demo photo as « not your photo yet »
  (« 2 produits utilisent encore une photo d’exemple… »). The assistant never writes a photo
  (`prompts.md`).
- **What shows, everywhere**: the seller's own image (`image`, a data URL) first, then the demo
  photo, then the illustration. An upload in the editor or the dashboard sets `image` and clears
  `photo`. « Retirer » on the seller's image clears `image` only, so a demo photo still set (an
  imported fiche can hold both) shows again; « Retirer la photo » on a demo photo clears `photo`,
  so the illustration shows.
- **A file that does not load** (missing, misspelt, offline): the store, the editor and the
  dashboard fall back to what they show without a photo (the illustration, the hero or about
  composition), never a broken image. The renderer forgets that id for the rest of the page's life
  (`photoInfo` answers `null`) and draws the store again; it finds out from the `<img>`'s load
  error (`data-demo-photo`), so this is a safety net: the check below must still pass.
- **The renderer**: `JeereRender.photoSrc(id)` gives the URL, `JeereRender.photoInfo(id)` the
  entry with its `src` (null for an unknown id). The folder is `img/demo/` next to `render.js`,
  read from the script's own address when it loads (`JeereRender.PHOTO_BASE`), so the same id works
  from `creer/`, `../admin/` and `../compte/`. Every product picture (cards, category tiles, the
  hero's circle, arch or block, the about collage, the product page and « Vous aimerez aussi »,
  cart lines, checkout and confirmation summaries) and the hero and about images use it, with
  `object-fit: cover` and the entry's `focus`. On the product page the photo has the product name
  as `alt`; everywhere else (cards, category tiles, the hero's float card, cart lines, summaries)
  the name is written right next to it, so the picture is decorative (`alt=""`), like the hero and
  about images and like the seller's own photos in the same places.
- **The editor** shows a demo photo in the product form, the product rows and the hero and about
  image fields, with « Photo d’exemple · photographer / Unsplash » under it (the name links to the
  photographer's profile, « Unsplash » to the photo, in a new tab), « Mettre ma photo » and
  « Retirer la photo ». Undo and redo cover both fields. **The dashboard** shows it in its
  thumbnails and its product page (a « Photo d’exemple » chip on the photo, « Photo : photographer
  / Unsplash » under it, same actions); the
  « Sans vraie photo » filter and the checklist still count it as not the seller's photo.
- **Credits**: the photos come from Unsplash. The Unsplash License lets anyone use them for free,
  commercial use included, without asking. We credit the photographers anyway: in the editor and
  the dashboard under each photo, and in [`img/demo/CREDITS.md`](img/demo/CREDITS.md): one line per
  photo with the file, what it is used for, what it shows, the photographer (linked to the
  profile) and the photo's page, and a note where the photo was retouched (a label or a logo
  removed, a backdrop extended) or only stands in for the product. « Unavailable Photographer »
  (`fashion/about.webp`) is the real display name of that Unsplash account
  (`@unavailablephotographer`), so it is credited as it is.
- **Products renamed to match their photo.** A demo product must look like its photo, so these
  example products of `data.js` were renamed when the photos came in (their description, their
  illustration colour and the reviews and texts that named them follow):

  | Niche | Before | Now | Why |
  | --- | --- | --- | --- |
  | fashion | Robe portefeuille Lagune | Robe portefeuille noire | a black sleeveless wrap dress |
  | fashion | Ensemble en pagne tissé | Ensemble homme en pagne tissé | a man's striped woven tunic |
  | hair | Perruque bouclée coupe carré | Perruque bouclée mi-longue | shoulder length, honey-copper curls |
  | hair | Perruque bob blond miel | Perruque courte blond platine | a short platinum pixie cut with a fringe |
  | hair | Mèches kinky pour tresses | Mèches pour tresses | finished box braids, not kinky hair |
  | beauty | Beurre de karité fouetté | Beurre de karité brut | raw chunks, not whipped |
  | jewellery | Créoles martelées dorées | Créoles torsadées dorées | twisted hoops |
  | food | Attiéké poisson braisé | Tilapias braisés pour deux | two braised tilapias (priced for two); the attiéké comes on the side |
  | food | Sauce graine et riz | Sauce gombo et riz | an okra stew with rice |
  | food | Alloco et poulet braisé | Alloco et poisson braisé | the grilled meat is fish |
  | food | Plateau traiteur 20 personnes | Plateau alloco, 20 personnes | only alloco in the chafing dishes; fish and beignets as options |
  | food | Mini-beignets, boîte de 30 | Beignets maison, la corbeille | a basket of about ten plain puff-puff |
  | food | Jus de bissap maison, 1 L | Jus de bissap maison | served in a glass |
  | crafts | Pochette en toile de Korhogo | Pochette en pagne wax | a wax-print clutch |

  Other descriptions were corrected to what the photos show (colours, sleeves, a lid or none,
  materials: ochre suede, the woven tunic's trousers « en option »), and so were the texts around
  them: the food hero leads with what its photo shows (« Foutou sauce, alloco et poisson braisé »),
  the food pages say « poisson braisé, sauce gombo et alloco », the crafts hero and about no longer promise Korhogo cloth, and the
  jewellery about says « Nos montures dorées sont plaquées or » (the resin earrings have a silver
  frame). File names and ids come from the photo search and were kept:
  `food/sauce-graine-riz.webp` (`food-sauce-graine-riz`) is the « Sauce gombo et riz ».
- **The crop (`focus`)**: products and about photos are 4:5. Plateau shows them whole in its cards,
  product page and cart lines; its checkout and confirmation summaries crop them to 1:1, and so do
  Cocody and Treichville everywhere (cards, category tiles, the product page, cart lines, summaries,
  the hero's circle or block, the about frame), so the second value picks the part kept: `50% 5%`
  keeps the head of a full-length portrait. Hero photos are square. The Plateau hero never puts
  text on its photo: a phone shows the whole square above the text; a desktop shows it in the right
  56 % of the stage (680 px high, up to 820 px on a wide screen), whole at 1200 px and cropped in
  height on wider screens, where the second value counts (`50% 40%` keeps the bed and the lamps of
  `home/hero.webp`). The Cocody desktop hero is 4:5, where the first value counts (`25% 50%` keeps
  the profile of `jewellery/hero.webp`). Each focus was checked on the three templates, phone and
  desktop.
- **Adding or replacing a photo**: put the WebP file in `img/demo/<niche>/` (sizes above), add or
  replace its entry in `DEMO_PHOTOS` and its id in `NICHE_PHOTOS`, and its line in
  `img/demo/CREDITS.md`. Nothing else changes. Hero photos: the Plateau text sits on a dark ground
  that the photo melts into (under the photo on a phone, beside it on a desktop), never on the photo,
  so its white text keeps 11.9:1 whatever the photo (checked with the 8 hero photos at 360, 390,
  1024, 1200, 1440 and 1920 px, default and long texts). Then run, from this folder (prints `ok · 69 photos`, else one line per
  problem):

  ```sh
  # every demo photo is on disk and in CREDITS.md, every NICHE_PHOTOS id is in DEMO_PHOTOS
  node -e "global.window={};require('./data.js');const D=window.JEERE_DATA,fs=require('fs'),P=D.DEMO_PHOTOS,bad=[];const cr=fs.existsSync('img/demo/CREDITS.md')?fs.readFileSync('img/demo/CREDITS.md','utf8'):'';Object.keys(P).forEach(id=>{const f=P[id].file;if(!fs.existsSync('img/demo/'+f))bad.push(id+': no file img/demo/'+f);else if(!cr.includes(f))bad.push(id+': '+f+' not in CREDITS.md')});Object.keys(D.NICHE_PHOTOS).forEach(n=>{const x=D.NICHE_PHOTOS[n];[x.hero,x.about].concat(x.products||[]).forEach(id=>{if(id&&!P[id])bad.push(n+': unknown id '+id)})});console.log(bad.length?bad.join('\n'):'ok · '+Object.keys(P).length+' photos');process.exitCode=bad.length?1:0"
  ```

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
| « Ajouter » on a product card (quick add, × 1) | the cart |
| « Ajouter au panier » | the cart |
| The header bag | the cart (from a product page with an empty cart, seeded with that product) |
| « Passer au paiement » | the checkout |
| « Payer 14 500 FCFA » / « Confirmer la commande » | the confirmation |
| The header logo, « Retour à la boutique », « Continuer mes achats » | home |
| Back links | the previous step |

**Demo cart.** The cart lives on the root element: `rootEl.__jstCart = { [productId]: qty }`. It
survives re-renders, drops ids that no longer exist, and, when the cart, checkout or confirmation
page is rendered with an empty cart, it is seeded with the first product × 1 (and with the product
of the product page when coming from there, by « Ajouter au panier » or by the header bag). Quantity
steppers (− / +, from 1 to 20) and the remove button work in the cart. What the customer types on
the checkout is kept in `rootEl.__jstForm` for the confirmation page, and nowhere else; the open
order summary of the phone checkout (`rootEl.__jstPeek`) and the commune error (`rootEl.__jstErr`)
live there too. On the confirmation the order is placed: the header bag shows no count.

**What each page shows**

- **Accueil**: the enabled sections in order. Each product card opens its page; its « Ajouter »
  button (bag icon) is a quick add (× 1) that leads to the cart.
- **Fiche produit**: a large visual (the photo, or the illustration on the product colour, at the
  template's image ratio), the badge, name, price, short description, a quantity stepper, the
  primary « Ajouter au panier », the secondary « Commander sur WhatsApp » (chat icon), a delivery
  line (« Livraison dès 1 500 FCFA · Cocody, Plateau… »), chips for the enabled payment methods,
  and « Vous aimerez aussi » with up to 4 other products.
- **Panier**: one line per product (thumbnail, name, unit price, stepper, remove), the subtotal,
  « Frais de livraison calculés à l'étape suivante », the primary « Passer au paiement » and the link
  « Continuer mes achats ».
- **Paiement** (the checkout, designed as a trustworthy mobile-money checkout): the steps
  « Panier › Livraison et paiement › Confirmation » (on the phone: numbered dots and only the
  current label, so the line never wraps); on the phone, a folded « Voir ma commande » bar with the
  item count and the amount right under the steps, which opens on the lines and the totals; contact
  (Prénom, Numéro WhatsApp); delivery (a commune select with the fee of each option, « Quartier,
  repère : ex. près de la pharmacie », an estimated delay); payment (a radio card per **enabled**
  method, label from `JEERE_DATA.PAYMENTS`, the hint shown under the selected method only, neutral
  text chips or icons, never the companies' logos or colours); the order summary (read-only lines
  with a quantity badge, « Modifier » back to the cart, subtotal, delivery fee of the selected
  commune, total), which updates live when the commune changes and follows the quantities set in
  the cart; then, right under the total (on desktop in the right column, sticky in a real store
  page), the primary « Payer 14 500 FCFA » (« Confirmer la commande » when « Paiement à la
  livraison » is selected) with a note under it (mobile money: « Vous recevrez une demande de
  14 500 FCFA sur votre téléphone (Wave). Validez-la avec votre code secret : ne le donnez jamais,
  ni au vendeur ni au livreur. »), the secondary « Commander sur WhatsApp » and the trust line
  « Paiement traité par un partenaire agréé par la BCEAO. Jeere ne garde jamais votre argent. ».
  - **The commune is never preselected** (its fee would sit in the total unseen; a store with a
    single zone is the exception): the select opens on « Choisissez votre commune », the summary
    says « Livraison : À choisir », the button « Payer 13 000 FCFA + livraison » and the delay line
    asks for the commune. Like a real checkout, « Payer » without a commune does not go on: the
    select is outlined in red with « Choisissez votre commune : elle fixe les frais de livraison. »
    and brought into view. Choosing one fills the fee, the total, the button and the delay live.
  - **No payment method enabled**: the page speaks to shoppers (« Le paiement en ligne arrive
    bientôt. Passez votre commande sur WhatsApp : {boutique} vous répond et vous indique comment
    payer. »), with the summary and « Commander sur WhatsApp », and no trust line (nothing is paid
    on that page). What the seller has to do is said by the editor, above the preview, and by the
    Qualité tab.
- **Confirmation**: a big check, « Merci Awa ! » (or « Merci ! » without a first name),
  « Commande n° 1042 confirmée », a status line for the chosen method (« Paiement Wave reçu »,
  « À payer à la livraison »…), the delivery estimate (with « Le récapitulatif vous est envoyé sur
  WhatsApp au +225 07 07 12 34 56. » when the shopper typed her number), the summary, the primary
  « Suivre ma commande sur WhatsApp » and the link « Retour à la boutique ». Opened straight from the
  page selector (no commune chosen yet), it shows the first zone as an example.

**Where the data comes from.** Everything comes from the fiche and `data.js`; the checkout adds
nothing to the fiche.

- Delivery: the zones of the first enabled `delivery` section, else of a hidden one (hiding the
  section on the home page keeps the seller's fees), or `JEERE_DATA.communes` (11 Abidjan communes,
  1 500 to 3 000 FCFA) when the fiche has no delivery section (or no zone). The cheapest fee gives
  « Livraison dès … ».
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
first name shows it on the confirmation) but nothing is sent or stored, and the only check is the
commune before « Payer »: no network request, no `fetch`, no form submission. `keydown` events inside `.jst` inputs stop propagating,
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

## The store's own pages (`config.pages`)

Besides the five pages of the buying journey, a store has its own pages, like Shopify's « Pages »:
« À propos », « Livraison et retours », « Contact », « Conditions de vente », or anything the seller
adds (« Guide des tailles »…). They live in the fiche, so the assistant, the editor, the dashboard
and the renderer all see the same ones.

```js
config.pages = [
  { id: 'pg1', title: 'À propos', slug: 'a-propos', body: '…', inMenu: true, inFooter: true },
  { id: 'pg2', title: 'Livraison et retours', slug: 'livraison-et-retours', body: '…', inMenu: false, inFooter: true },
  { id: 'pg3', title: 'Contact', slug: 'contact', body: '…', inMenu: true, inFooter: true },
  { id: 'pg4', title: 'Conditions de vente', slug: 'conditions-de-vente', body: '…', inMenu: false, inFooter: true }
];
JEERE_DATA.PAGE_LIMITS = { title: 60, slug: 60, body: 4000, max: 20 };
JeereRender.render(config, rootEl, { device, page: 'page', pageId: 'pg3' });
```

- **`body`** is plain text, never HTML or Markdown: paragraphs separated by a blank line (the
  renderer escapes it). **`slug`** is the page's address, `JEERE_DATA.slugify(title)` by default:
  accents removed (also ɛ ɔ ŋ, œ, æ), lower case, words joined by hyphens, 60 characters at most
  (`slugify('Conditions d’utilisation !')` → `'conditions-d-utilisation'`).
- **The 4 default pages**, written for each of the 8 niches (and a generic set when the store has
  no niche), in French, with the store's name and city:
  - « À propos » (menu and footer): who the store is, the niche's story (the same as the home
    page's À propos section), how it works, and an invitation to ask on WhatsApp.
  - « Livraison et retours » (footer): days, fees by commune shown before paying, the niche's
    delays, checking the parcel in front of the courier, delivery outside the city, a return
    policy that fits the niche (hygiene for wigs and cosmetics, fresh food never taken back,
    7-day size exchange for clothes and shoes, handmade variations for crafts), refunds by mobile
    money. The renderer adds the store's fees by commune under it.
  - « Contact » (menu and footer): WhatsApp first (hours as an example to edit), where the store
    is (`{city}`), what to send for an order already placed. The renderer adds the WhatsApp
    contact block with the store's number; the text never contains the number.
  - « Conditions de vente » (footer): seller, order, prices in FCFA, payment through an approved
    partner (never give your secret code), delivery, returns, personal data, disputes under
    Ivorian law. It **starts with « À adapter : ce texte est un modèle général. Faites-le vérifier
    par un juriste avant d’ouvrir votre boutique, puis supprimez ce paragraphe. »**: it is a
    sensible template, not legal advice.
  - The example promises stay those of the niche's example content (the shoe store's free size
    exchange, the jewellery's one-year clasp repair…): the seller edits them, like the products.
- **`JEERE_DATA.pageKind(page)`** returns `'about'`, `'shipping'`, `'contact'` or `'terms'` for the
  4 default slugs (else `null`); `JEERE_DATA.defaultPages(nicheId, { name, city })` returns fresh
  default pages; `JEERE_DATA.uniqueSlug(config, title, exceptId)` a free slug for the dashboard's
  address field; `JEERE_DATA.newId(config, 'pg')` the next free id.
- **`normalizeConfig`**: a fiche without `pages` (saved before round 3) gets the 4 default pages
  of its niche; an array is the seller's list and is kept, even empty, and repaired: non-objects
  dropped, ids `pgN` made unique, the title on one line and clipped at 60, the body clipped at
  4 000 (line breaks normalised to `\n`), `inMenu` / `inFooter` read as booleans (missing: footer
  only), the slug slugified, taken from the title when missing, made unique with `-2`, `-3`… (the
  first page keeps it), `'page'` when nothing is left.
- **Untouched default pages follow the store.** A default body is written with `{name}` and
  `{city}`; `normalizeConfig` recognises an untouched default body (any niche, any name, any city)
  and rewrites it with the current store name and city, so a store renamed by the assistant
  (`JeereWizard.generate` renames the store after `defaultConfig`) or relocated in the dashboard
  never shows the example store's name. A page the seller has edited, even by one character, is
  never touched. An empty name reads « Notre boutique », an empty city « Abidjan ».
- **`validate`** (target `{ kind: 'page', id }`): a page without a title is an **error**; a
  duplicate slug, an invalid slug, a title over 60 or a body over 4 000 characters are
  **warnings**; an empty body, or a page in neither the menu nor the footer, is a **tip**. The 4
  default pages raise nothing, so a default fiche still scores 92.
- **In the store** (renderer): on desktop the header nav shows the pages with `inMenu` after the
  section links (5 links at most in all); on the phone the menu icon opens a small in-preview menu
  (home, the `inMenu` pages, the cart). The footer has a column of the `inFooter` pages. Clicking
  them navigates inside the preview and dispatches `jst:navigate` with `{ page: 'page', pageId }`.
  Every store page ends with a discreet « Propulsé par Jeere » (the mark is inline SVG in
  `currentColor`, so the store does not depend on the builder's symbols).
- **In the editor**: the page selector lists the 5 pages in « Parcours d'achat », then the group
  « Vos pages » (option values `'page:pg1'`…), with a « Gérer les pages » link to
  `../admin/#pages`; the Boutique tab has a « Vos pages » group (one row per page, « Voir »). Text
  is edited in the dashboard, not in the editor. **In the dashboard**: `#pages` lists, adds, edits
  (title, slug auto-filled and editable, body with a counter, menu, footer), reorders and deletes
  them; `#boutique` › « Navigation » toggles `inMenu` / `inFooter`.
- **Address**: a page is shown everywhere as `<store>.jeere.shop/pages/<slug>` (the dashboard's
  address field, the editor's desktop frame and its « Vos pages » rows), like Shopify's
  `/pages/…`. `<store>.jeere.shop` follows the store's name until the seller confirms an address
  or adds her own domain in the dashboard (Paramètres › Domaine); the editor's frame then shows
  that one (it reads `'jeere-admin'`, never writes it).

## Colour intensity

The founder felt the stores looked pale. A fiche now says how much of the page its colour covers,
with the Thème tab's control « Intensité des couleurs : Vives / Douces »:

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
  CSS variables under `.jst[data-intensity="vivid"]`. The palettes in `data.js` never change (the seller's own colours
  are `theme.colors`, see [Custom colours](#custom-colours-themecolors-section-colours)).
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

**Pop colours.** The palettes are bright and saturated on purpose (3 November 2026: the sellers
want « des couleurs pop, vivantes »): a light tint of the hue behind the page and a vivid accent,
terracotta, turquoise, fuchsia, electric blue, mango yellow, green and lime. The bright accents
carry dark text (`onAccent` near-black on Karité, Lagune, Mangue, Menthe and Nuit), the pink and
the blue carry white. The ids and the colour families stay, so the assistant's colour words
(« rose », « jaune », « turquoise »…) still pick the same palette.

**Contrast budget** (WCAG, computed from the palettes in `data.js`; must hold for 8 palettes × 3
templates × 2 intensities). An automated pass over 8 palettes × 3 templates × 2 intensities × 5
pages × 2 devices (with the checkout's commune error and the phone order summary open) finds no
text under 4.5:1 (3:1 for large text); text drawn on product tiles and photos is not counted. On accent backgrounds, text uses `onAccent` (and `onAccentSoft` for secondary text); on tinted backgrounds,
text uses `text`, which keeps at least 10:1 on every tint up to 30 %.

| Palette | onAccent / accent | accent / bg | text / bg | muted on 10 % / 14 % / 18 % tint | Max tint for muted ≥ 4.5 | raw accent as text on bg / 18 % tint |
| --- | --- | --- | --- | --- | --- | --- |
| Sable | 18.88 | 17.16 | 17.16 | 5.08 / 4.66 / 4.26 | 15 % | 17.16 / 11.64 |
| Karité | 5.54 | 3.10 | 15.83 | 6.43 / 6.16 / 5.88 | 40 % | 3.10 / 2.54 |
| Lagune | 7.00 | 2.12 | 15.50 | 6.19 / 6.01 / 5.80 | 50 % | 2.12 / 1.83 |
| Hibiscus | 4.71 | 4.19 | 16.17 | 6.37 / 5.97 / 5.60 | 31 % | 4.19 / 3.16 |
| Indigo | 5.30 | 4.72 | 15.74 | 6.09 / 5.73 / 5.43 | 30 % | 4.72 / 3.68 |
| Mangue | 9.45 | 1.71 | 16.19 | 6.31 / 6.16 / 6.02 | 60 % | 1.71 / 1.55 |
| Menthe | 7.04 | 2.14 | 15.07 | 6.45 / 6.20 / 6.01 | 54 % | 2.14 / 1.85 |
| Nuit | 16.27 | 16.27 | 17.39 | 6.48 / 5.80 / 5.06 | 21 % | 16.27 / 10.14 |

The raw accent is a **fill**: the announcement bar, the hero blocks, solid buttons, badges and
selected states, always with `onAccent` on it. It is never small text on the page: prices, stars,
links and outline buttons (text and border) use `--st-accent-text` / `--st-accent-ink`, the accent
deepened by `readable()` in `render.js` until it reads at 4.5:1 on the background, the surface and
both tints. That is why a yellow (Mangue, 1.71:1 on its background) or a turquoise (Lagune) accent
is fine. Sable's vivid tints are deeper shades of its background (its accent is black), and the
renderer keeps `muted` readable on them (`mutedTint`, `mutedStrong`).

Nuit is dark, and a bright accent mixed into near-black turns olive: its vivid « tints » are not
accent mixes but neutral raised surfaces, `surface` (#1C1E1C) and `surface` + 7 % `text`. The lime
(#CCFF33) fills the announcement bar, the hero blocks, the buttons, the badges and the selected
states. Plateau on a dark palette puts the hero text on the stronger surface with a lime title, a
lime top rule and a lime button, instead of a neon slab. Tint =
`color-mix(in srgb, accent p%, bg)`.

## The logo

The builder (editor top bar, start screen header), the dashboard, the account pages and the chat
use the landing page's logo, drawn by hand by the founder in black ink and traced to paths (no
font, no image request).

- **Symbols** (hidden `<svg><defs>` of each `index.html`, copied from `../index.html`):
  `cloud` = the mark, a cloud with two eyes (viewBox `0 0 600 446`, `fill-rule: evenodd`);
  `wordmark` = « jeere » written by hand in lowercase (viewBox `0 0 900 479`; in the landing page
  and this page only, for the footers). The account and dashboard pages carry `cloud` alone.
- **Usage**: headers show the cloud alone, black ink, 32 px tall on phones and 36 px from 560 px:

  ```html
  <span class="b-logo__lock">
    <svg class="logo__cloud" viewBox="0 0 600 446" aria-hidden="true" focusable="false"><use href="#cloud"/></svg>
  </span>
  ```

  ```css
  .logo__cloud { display: block; height: 32px; width: auto; aspect-ratio: 600 / 446; fill: currentColor; }
  .logo__wordmark { display: block; height: 28px; width: auto; aspect-ratio: 900 / 479; fill: currentColor; }
  ```

  The link around it carries the accessible name (« Jeere, retour à l’accueil »). The start
  screen footer shows the cloud and the handwritten « jeere » side by side.
- **Chat avatar** (wizard and the start screen's chat demo): the cloud in white on a black circle.
  The account page's message uses it in ink on a white circle; its dark aside has a large, faint
  white cloud; the dashboard's loading splash shows the cloud in ink.
- **« Propulsé par Jeere »** in a store's footer: the cloud drawn inline by `render.js` (a
  simplified trace of about 2.7KB, 12 px tall, `currentColor`), so a store never needs the page's symbols.
- **Favicon**: `../favicon.svg`, the black cloud (simplified trace, bolder eyes, sized for 16 px tabs)
  on a bright pop blue `#3657FF` rounded square, and
  `../apple-touch-icon.png` (180×180) for home screens.
- **The brand word** is written « Jeere » in the UI copy (« l'assistant Jeere », « Retour à
  Jeere »). Code identifiers keep their names: `JEERE_DATA`, `jeere-studio-config`, `.jst`, `.jwz`.

## The store's logo (`store.logo`)

The founder: « les gens ne peuvent même pas ajouter leur logo ». Now they can, in the editor (Boutique ›
« Logo et icône », also opened by a click on the header in the preview), and the dashboard shows it.

**Contract** — five optional keys of `store`, all described in `schema.json`. They are never added by
`defaultConfig` or `normalizeConfig`: a fiche without them is unchanged and renders **byte for byte as
before** (checked on every niche × template × page × device, vivid and soft, with and without the keys at
their default values; see `logo-test.js` below).

| Key | Values | `normalizeConfig` (never throws) |
| --- | --- | --- |
| `logo` | `null` or a data URL image: PNG or WebP (transparency kept) or JPEG; the editor makes it at most **600 px on the long side** and trims empty margins; an SVG is drawn to PNG | anything else, or longer than `LOGO_LIMITS.chars` (2 000 000 characters, about 1.5 MB), → `null` |
| `logoSize` | `'S'`, `'M'` (default), `'L'` — 34 / 46 / 60 px tall on a computer, 28 / 36 / 46 on a phone (`LOGO_SIZES`) — or a height in px, **24 to 72** (a phone shows 80 % of it, at least 24) | `'m'` → `'M'`, `'40px'` → `40`, numbers clamped to 24..72, anything else → `'M'` |
| `logoPosition` | `'left'`, `'center'`, or `null`: the template's place (`LOGO_DEFAULT_POSITION`: Plateau `center`, Cocody and Treichville `left`) | anything else → `null` |
| `showName` | `true`: the store name written next to the logo (the image's `alt` is then empty); default `false`, the logo alone | any value read as a boolean |
| `icon` | `null` or a square image for the browser tab and the phone's home screen (the editor makes a 192 × 192 PNG) | like `logo` |

Helpers in `data.js` (no DOM, so they also run in Node): `brand(config)` → `{ name, initial, logo, dims,
size, position, positionSet, showName, icon, iconFrom: 'icon' | 'logo' | 'initial', logoBox(device, maxW) }`
(`initial`: the first letter or digit of the name in any script, Œ, ɔ, ŋ included; `iconFrom` is `'logo'` only
for a logo at most 1.5 times wider than tall, `LOGO_LIMITS.iconWide`: a wider one shrunk into a 16 px square
cannot be read, so the tab shows the initial on the accent colour);
`imageSize(dataUrl)` reads the width and height from the header of a PNG, JPEG, WebP or GIF data URL;
`logoHeight(size, device)`; `LOGO_SIZES`, `LOGO_SIZE_OPTIONS`, `LOGO_POSITIONS`, `LOGO_DEFAULT_POSITION`,
`LOGO_LIMITS`, `BRAND_KEYS`. `JeereRender.brand(config)` adds the palette's accent for the initial.

**Render** (`render.js`, `store.css` « the seller's logo »): with a logo, the header of the three
templates (phone and desktop, the phone menu open too), the checkout header (« Paiement sécurisé »; the
confirmation uses the normal header) and the footer's brand column show
`<img class="jst-logo-img" alt="{store name}" width height>` instead of the name; « Propulsé par Jeere »
stays. render.js computes the display size from the image's own proportions: the height of
`logoSize`, narrowed (never stretched, `object-fit: contain` as a safety) to fit 200 px on a phone header and
360 px on a computer (120 / 220 px when the name is next to it), at most 36 / 48 px tall at the checkout
and 48 / 56 px in the footer. A `logoPosition` that differs from the template's puts
`.jst-header--logo-left` (Plateau: beside the menu on a phone; logo, links, bag on a computer) or
`.jst-header--logo-center` (Cocody, Treichville: menu, logo, bag on a phone; links, logo, bag on a computer)
on the header; it also moves the name when there is no logo.

**Editor** (Boutique tab, group `#b-g-brand` « Logo et icône », right after « Informations »):

- « Logo »: the logo on a light and on a dark chip (does it read on both?), its size in px, « Importer mon
  logo » (a file input: on a phone the system offers the camera and the gallery; PNG, JPEG, WebP, SVG, GIF),
  « Changer le logo », « Retirer ». The upload is drawn to a canvas: at most 600 px on the long side, the
  transparent margins (or a plain background, when the four corners are alike) trimmed, PNG (WebP when the
  PNG passes 700 KB and the browser can make WebP), a JPEG stays a JPEG; an SVG gets a size first.
- « Pas de logo ? Créez-en un simple » (only without a logo): the store name (editable), one of the 6 store
  fonts, a colour (« Principale », « Texte », black, white: the store's own colours; until she picks one, the
  first that reads at 3:1 on the header and the footer), « En majuscules », a live preview, « Utiliser ce
  logo » (a transparent PNG drawn with canvas; `showName` stays `false`). A long name goes on two centred
  lines (split at the space nearest the middle) so the logo stays under 4.5:1 and never gets Qualité's « très
  allongé »; a single very long word gets a little room above and below.
- « Taille » Petit / Moyen / Grand, « Place du logo » (« Place du nom » without a logo) À gauche / Au centre
  — choosing the template's own place removes `logoPosition`, so a later template change brings its own —,
  « Afficher le nom à côté du logo » (a switch).
- « Icône de l’onglet »: a browser tab drawn with the icon, the icon at 48 px, « Importer une icône »,
  « Créer depuis le logo » (the logo trimmed and centred in a 192 px square; a logo wider than 1.5:1 gives
  the square on its left, where most wordmarks have their mark or first letter), « Retirer ». Without one the
  preview's address bar (`#b-device-fav`) shows the logo when it is square-ish, else the initial on the accent
  colour. The file buttons go back to their label once the file is read (the same file twice too).
- Uploads are never drawn above their own pixels: a small mark inside a big transparent file stays its real
  size after trimming, so Qualité's « petit » warning still sees it.
- Thème starts with a « Votre logo » / « Ajouter votre logo » row that opens Boutique › Logo et icône.
- Every change is one undo step (Ctrl/Cmd+Z), saved with the fiche (`jeere-studio-config`). A click on the
  logo in the preview while it shows the home page (elsewhere the logo still leads home), or on the header
  outside its links and buttons (« Modifier le logo » on a phone), opens the group; so do
  the Qualité issues about the logo (target `{ kind: 'store', id: 'logo' }`) and `'jeere-studio-open'` with
  `focus: 'logo'` (no guided tour then). The tour's targets did not move.

**Qualité** (`validate`): no logo → tip « Ajoutez votre logo : il s’affiche en haut de chaque page. Pas de
logo ? Le Studio en crée un simple avec le nom de votre boutique. » (`free: true`, 0 point); a logo more than 6
times wider than tall → warning « très allongé »; a logo under 120 px on its long side or 40 px tall → warning
« petit … risque d’être flou ». **The logo on her colours**: `JEERE_DATA.logoTone(url)` measures a transparent
logo once in the browser (a canvas: its average ink and how its opaque pixels spread over 64 luminance bins;
an opaque logo brings its own background, `null`; Node resolves `null`) and keeps it (`logoToneOf(url)`).
`logoGrounds(config)` gives the grounds the logo is drawn on: the header (every page, the checkout included,
`headerBg` or the template's) and the footer (`footerBg` or the template's). `logoChecks(config)` lists those
where 15 % or more of the logo reads under 1.6:1 (`LOGO_LIMITS.faded`, `LOGO_LIMITS.tone`): a dark word next to
an orange mark vanishes on a navy header even while the mark shows. Once the tone is known, `validate()` adds
the warning « Votre logo se voit mal sur le fond de l’en-tête et du pied de page : importez une version claire de
votre logo, ou changez la couleur de ces fonds dans Thème. » (`issue.logoTone: ['header', 'footer']`). The
editor and the dashboard measure the logo when they show it, so both scores agree. In the editor the same
note sits under the chips, with buttons « Couleur de l’en-tête » / « Couleur du pied de page » that open those
pickers, and inside the En-tête and Pied de page ground pickers (« Votre logo se voit mal sur ce fond »,
updated while the colour moves). The dark chip is captioned « Si votre logo disparaît sur l’un de ces fonds… ».

**Dashboard**: the store's avatar (sidebar store card, top bar) shows the logo on white instead of the
initial; « Boutique en ligne › Thème » has a « Logo » line (« Ajouter un logo » / « Modifier », to the Studio);
the mini previews draw it (they use `JeereRender`); « Premiers pas » has the step « Ajoutez votre logo ».

## Custom colours (`theme.colors`, section colours)

The founder: « pourquoi on ne peut pas changer les couleurs pour chaque truc ? pourquoi être coincé avec un
thème ? ». The 8 palettes stay as starting points (« Choisir une palette » sets every colour at once); after
that the seller can change any colour of the store, and the colour of each section.

**Contract** — two optional keys, never added by `defaultConfig` or `normalizeConfig`: a fiche without them
(or with `theme.colors: {}`) renders **byte for byte as before** (`colours-test.js` and `snap.js`, below).

| Key | Values | `normalizeConfig` (never throws) |
| --- | --- | --- |
| `theme.colors` | an object of `#RRGGBB`, any of: `bg` (Fond de la page), `surface` (Fond des cartes et des blocs), `text` (Texte), `muted` (Texte secondaire), `accent` (Couleur principale: boutons, liens, prix), `onAccent` (Texte des boutons), and the parts `announcementBg` / `announcementText` (Bandeau d’annonce), `headerBg` / `headerText` (En-tête, every page and the checkout), `footerBg` / `footerText` (Pied de page), `badgeBg` / `badgeText` (Badges et promos: every product badge) | known keys kept in upper case (`#abc` → `#AABBCC`), unknown keys and invalid values dropped, an empty object dropped |
| `sections[].settings.bg` | `'page'` (the page's colour), `'surface'` (the cards' colour), `'accent'`, or `#RRGGBB`. Absent: « Automatique », the template's colour, which depends on Vives / Douces. Hero: Plateau's stage, Cocody's banner card, Treichville's band; announcement and WhatsApp: their panel; the others: the band | `'auto'` or anything else dropped |
| `sections[].settings.fg` | `#RRGGBB`, the section's text; absent: chosen to read on `bg` | dropped without a `bg` |
| hero `settings.buttonBg` / `settings.buttonText` | `#RRGGBB`: the hero button, always drawn **filled** with these two colours, outline buttons too (so the pair Qualité checks is the pair the customer sees); `buttonText` absent: chosen to read on it | dropped on other types |

`'page'`, `'surface'` and `'accent'` follow the palette and `theme.colors`: change the palette and those
sections change with it. Choosing a palette **removes `theme.colors`**: the toast says so for 7 s with an
**« Annuler »** button that brings them back (so does the undo arrow). Choosing a **template keeps
`theme.colors`** (it changes the layout, the palette under them, the fonts and the corners; the toast says
« Vos couleurs personnalisées sont gardées »). Section colours always stay. A palette colour set to the
palette's own value is no colour of hers: `themeColors` ignores it and the editor deletes the key.

**Derived colours** (`data.js`, no DOM): `themeColors(config)` → `{ palette, base: { bg, surface, text, muted,
accent, onAccent, line }, set, custom, dark, vivid, defaults, zones: { announcement, header, footer, badge } }`;
`zoneColors(ground, fg, base)` → the colours of a part with its own ground (`fg`, `surface`, `muted`, two tints,
`line`, `ink` = the accent as text, `acc` / `onAcc` = the accent fill, or the text colour when the accent would
vanish on that ground); `sectionColors(section, base)`. A colour the seller did not pick is derived so it reads:
a dark `bg` gets a light text, a raised surface; the palette's muted stays while it still reads, else a
lighter one; an `accent` gets an `onAccent` that reads at 4.5:1 (near-black, white, else pure black, which
always reaches 4.58:1); a new `bg` / `surface` the palette's accent melts into (under 1.25:1,
`CONTRAST_MIN.fill`: black buttons on a black page, lime on white) moves that accent to the nearest shade that
stands out (a grey accent takes the text colour); part and section texts are chosen the same way. **A colour
she picked is kept as she picked it.** `themeColors().paletteSet` says whether one of the six palette colours is
set; `defaults.footer` is the footer as render.js draws it (its tint fallback included), so the editor's rows
show the colours the store really uses. render.js reads everything through these helpers,
then recomputes the vivid set (tints, readable accent, muted on tints, onAccentSoft, field lines) from the
merged colours, so Vives / Douces work unchanged and a dark page switches `data-tone="dark"`. When one of the
six palette colours is set (`paletteSet`) it also makes sure the derived colours still read on mid-tone
grounds (tints, the accent's light tint, soft text, the form error red fall back on a shade that reads, or on
the text colour) and puts `data-colors="custom"` on the root (texts the templates soften with opacity are drawn
solid). A header, footer, bar or badge colour alone changes only that part (inside a `.jst-cz` part the
softened texts are solid too). `data-c-badge` marks badges with colours. On Cocody, payment chips on a coloured
footer take a raised shade of it and a fine line.

**Render**: the header, the footer and each coloured section get `class="… jst-cz"` and their colours as
`--sc-*` variables in a `style` attribute (`jst-sec--cbg` on a section, `jst-sec--cbtn` on a hero with button
colours); `store.css` « CUSTOM COLOURS » redefines the store's variables inside them, so every template rule
keeps working, with selectors that start with the five root attributes so they win over the template and vivid
rules. A coloured section is not tinted by the vivid alternation, and the others keep theirs.

**Readability.** Automated: `colours-test.js` runs the contrast audit of `agents2/fix/audit.js` on 504 renders
of customised stores (dark page, neon accent with coloured parts, every section on a different ground, a light
page on Nuit, three seeded random stores where every ground is random) × 3 templates × 2 devices × 2
intensities × 6 pages, texts automatic: no text under 4.5:1 (3:1 large). Seller's choices:
`colorChecks(config)` lists the pairs she set (or changed the ground of) that read under 4.5:1, each with
`fix`, the nearest shade of the same hue that reads (`nearestReadable(color, grounds, min)`);
`validate()` turns them into warnings « Peu lisible : vos clients auront du mal à lire le texte … (contraste
1,1:1, il faut au moins 4,5:1). » (6 points each, target `{ kind: 'theme', id: 'colors', key }` or
`{ kind: 'section', id, key }`, `issue.fix = { key: 'theme:text' | 'section:s2:fg', value }`); `fixColors(config)`
applies all of them (« Corriger tout »). An accent she picked that melts into her page or cards (under 1.25:1;
yellow on white, 1.3:1, still shows) is a check of `kind: 'fill'`: « Peu visible : les boutons, le bandeau et les
badges se confondent avec le fond de la page », its fix a shade at 3:1. **Severe**: the main text, the buttons'
text or the hero button's text under 3:1 (`check.severe`, `issue.severe`): `validate()` then returns
`status: 'À CORRIGER'` whatever the score, with `unreadable: n`, and the editor's verdict reads « Presque prête :
une couleur se lit très mal… » until « Corriger »; milder pairs (a secondary text at 4,4:1) stay plain warnings.
`nearestReadable` searches in 1 % lightness steps, then 0.1 %, then one RGB unit, so a narrow readable window
(#777777 between white and black → #767676) is found. `setColorKey` works on a fiche without `theme`.
A default fiche has no check (still 92) and the contrast audit of the default fiches stays empty.

**Editor**:

- Thème › « Choisir une palette » (was « Palette ») then, after « Intensité des couleurs : Vives / Douces »,
  **« Personnaliser les couleurs »** (`#b-g-theme-colors`): 14 rows in 6 groups (La page, Couleur principale,
  Bandeau d’annonce, En-tête, Pied de page, Badges et promos; `COLOR_GROUPS`). A row shows the colour the store
  uses, its code and « Palette », « Auto » (differs from the untouched palette's: it follows a colour she
  picked, e.g. the bar follows her accent) or « Modifiée »; it opens a picker: the native `<input
  type="color">` (with a rainbow dot and « Plus de couleurs »), a `#RRGGBB` field (Enter confirms), « Vos
  couleurs » (the colours the store uses now), « Couleurs de la palette Karité » (the palette's own, when she
  changed some), the 16 « Couleurs pop » (`POP_COLORS`), all 44 × 44 px; « Réinitialiser » (back to the palette:
  the key is deleted, and `theme.colors` with its last key). « Réinitialiser toutes les couleurs » at the bottom.
  « Choisir une palette » has a « Personnaliser les couleurs » button that brings the group into view; the
  Vives / Douces group is « Intensité des couleurs ».
- On a phone, « Aperçu » with a colour row open scrolls the preview to the part it paints (bar, header, footer,
  the first badge, the first button, the section) and outlines it.
- Each section's settings: **« Couleur de fond »** Automatique / Couleur de la page / Couleur des cartes /
  Couleur principale / Personnalisée (a picker), then « Couleur du texte » (Automatique, or a picker), and on the
  hero « Couleurs du bouton » (fond, texte). Automatique deletes `bg` and `fg`.
- Under any picker whose colour makes a text read under 4.5:1: **« Peu lisible »** (« vos clients auront du
  mal à lire… », the ratio in smaller text) and
  **« Corriger »** (the text gets the nearest readable shade; a ground, the nearest shade on which its texts
  read). The row shows « Peu lisible » too. Qualité lists the problems with « Corriger » on each and
  **« Corriger tout »**; a click on the issue opens its picker.
- Every change is one undo step (dragging the native picker is one), saved with the fiche. The logo's
  contrast note and the text-logo colours use the store's colours, the seller's included.

**Assistant** (`wizard.js`): colour phrases are read at the palette question, and elsewhere only with a verb
(« mets », « je veux », « change »…), never in the answer about what she sells nor in her name (« je vends des
boutons rouges », « un bandeau rouge pour les cheveux » are products). `colorRequests(text)` reads « mets les boutons en rose », « le texte en bleu
marine », « l’en-tête en noir », « pied de page vert », « badges jaunes », « fond rose » (a light pink): those
become `answers.colors`, then `theme.colors` in `generate()` (only the ones that differ from the palette). The
phrase is taken out before the palette is chosen, so « les boutons en rose » keeps the recommended palette with
pink buttons; « fond noir » still picks Nuit (black and white grounds are left to the palettes); « rose » alone
and « des robes en wax rouge » are unchanged. The assistant says « Je note aussi les boutons à votre couleur ».

**Dashboard**: « Boutique en ligne › Thème » shows the store's colours (the seller's included) and
« Karité, avec vos couleurs »; its mini previews use `JeereRender`, so they show everything.

## Seller accounts (`../compte/`)

How a seller signs up to manage her store: **phone number first, no e-mail, no password**, like
the brainstorm and like the mobile-money apps she already uses. One step per screen, big inputs,
built for 360 px with the on-screen keyboard open.

```
#inscription (default when there is no account)
  Prénom + Numéro WhatsApp (+225 by default, the landing form's country list)
   └─ « Recevoir le code » ─► 6 boxes (paste works, autocomplete="one-time-code", resend after 30 s)
       └─ « Le nom de votre boutique » (prefilled from the fiche when there is one)
           └─ « Comment voulez-vous commencer ? »
                Choisir un modèle → ../creer/ · Discuter avec l'assistant → ../creer/#assistant
                Aller au tableau de bord → ../admin/
#connexion
  Numéro ─► code ─► ../admin/   (another number than the saved account's: offer to create one)
```

- **Demo, said on the screen**: « Démo : aucun SMS ni WhatsApp n'est envoyé. Tapez n'importe quel
  code à 6 chiffres. » The consent line reads « En continuant, vous acceptez les conditions et la
  politique de confidentialité de Jeere. »
- **Saved** as `'jeere-account'` = `{ version: 1, firstName, phone, storeName, createdAt, plan,
  loggedIn }` (`phone` normalised with `normalizeWhatsapp`, `+2250707123456`; `plan` `'gratuit'` at
  sign-up; `loggedIn: true`). When a fiche exists, its name is prefilled on « Le nom de votre
  boutique »: if she types another one, the saved store takes it (and the hero titles that carried
  the old name follow, as in the dashboard's Préférences); `store.whatsapp` is set only if it is
  empty. `JEERE_DATA.normalizeAccount(raw)` turns whatever was saved into that shape, or `null`
  when there is no account; an account without a usable number (`+` and 8 to 15 digits) is no
  account, for the account page, the dashboard and the editor alike.
- **Routes**: `#inscription` and `#connexion` (the links of the editor and the dashboard). With no
  hash the page picks sign-up when there is no account, login when the saved account is logged
  out (with a one-tap « Continuer » card for it), and a « Bonjour {prénom} » screen (store, number,
  plan; « Aller au tableau de bord », « Ouvrir l'éditeur », « Se déconnecter ») when it is logged
  in. Each step is a history entry, so the phone's Back button goes back one step. An account
  whose number is not a valid `+` number (8 to 15 digits) counts as no account. The page never
  writes `'jeere-admin'` or `'jeere-studio-open'`; `window.JeereCompte = { parsePhone,
  formatPhone, maskPhone }` holds its pure helpers for tests.
- **After sign-up**: a template chosen in the editor carries her store name and number; « Discuter
  avec l'assistant » offers the same name and number as the first quick answers of its name and
  WhatsApp questions (`wizard.js` reads `'jeere-account'`, never writes it).
- **In the real product**: the same screens on Supabase Auth's phone sign-in, with a one-time code
  sent over WhatsApp (an approved WhatsApp Business provider) or by SMS as a fallback; rate limits
  per number; the session in an HTTP-only cookie; the store row tied to the user id.

## The seller dashboard (`../admin/`)

A Shopify-class admin, mobile-first because the seller runs her shop from her phone: a left
sidebar from 960 px (logo, store name, « Voir la boutique », the sections), a bottom bar below
(Accueil, Commandes, Produits, Boutique, Plus, which opens a sheet with the other sections; a
768 px tablet gets the phone shell). Hash routes, so the Back button works, and sub-routes such as
`#commandes/1055`, `#produits/nouveau`, `#pages/pg3` or `#parametres/abonnement`. A search box
(full screen on the phone, « / » on desktop) finds orders, products and customers; the account
menu shows the plan, « Retour à Jeere » (`../`) and « Se déconnecter » (`loggedIn: false`, back to
the gate). A form with unsaved changes shows a save bar (« Ignorer » / « Enregistrer », Ctrl+S)
and is kept as a draft when she leaves it. `window.JeereAdmin = { go(hash), state(), reload() }`
is there for tests.

- **Gate**: without a logged-in account, « Connectez-vous pour gérer votre boutique », with « Créer
  un compte » (`../compte/#inscription`) / « Se connecter » (`../compte/#connexion`) and « Voir la
  démo » (a demo account « Awa », plan gratuit, and `defaultConfig('cocody', 'beauty')` when there
  is no fiche). A seller who logged out is greeted « Bon retour, {prénom} » with « Se connecter »
  first.

| Route | What it does |
| --- | --- |
| `#accueil` | Greeting; an « Aujourd'hui » strip (orders to prepare, cash to collect, « Nouvelle commande »); the « Premiers pas » checklist with its progress bar, computed from the real state (see [Guided tours and « Premiers pas »](#guided-tours-and-premiers-pas): 3 products with photos, Wave / mobile money connected, WhatsApp number, delivery communes, the store customised in the Studio, a logo, the link shared on WhatsApp, pages complete, quality score ≥ 80 from `validate`, domain chosen), showing the next 3 steps (« Voir les 10 étapes »), a one-tap « Utiliser mon numéro » for the WhatsApp step, « Masquer », and « Publier ma boutique » (the editor's honest publish dialog) when all is done; KPI cards over the last 10 days (Ventes split into Encaissé / À encaisser, « dont … chez vos livreurs » / En attente; Commandes, Panier moyen, Commandes à préparer; « Données d'exemple » while example orders are there); a small live preview of the store (`JeereRender`) with « Personnaliser », « Voir », « Partager »; recent orders; the plan card warns from 80 % of the monthly order limit |
| `#commandes` | Orders with status filters (À préparer, À encaisser…), counts and search (a table on desktop, cards on the phone, each with how it is paid: « À encaisser », « Payée · Wave », « Paiement en attente »); opens on « À préparer » when there is something to prepare. « Nouvelle commande » records an order received on WhatsApp or by phone (customer, number, commune and its fee, products with a quantity stepper, payment, channel, note; `manual: true`), then offers to send the customer a recap. The detail is its own page, `#commandes/1055`: items, a Livraison card (where, what the courier collects, the courier: her own couriers or Yango / Gozem, « Envoyer au livreur sur WhatsApp »), customer, payment, channel, timeline. Cash on delivery: « Demander la confirmation » (a `wa.me` message, « Répondez OUI ») → « Le client a confirmé » → « Confier au livreur » (the courier's WhatsApp message, status Expédiée) → « Livrée, argent reçu »; « Livraison échouée » (absent, injoignable, a refusé → Annulée with the reason; à relivrer → Nouvelle); a deposit by mobile money from 20 000 FCFA. « Écrire sur WhatsApp » and « Appeler » for the customer; « Plus d'actions »: « Imprimer le bon » (print stylesheet; the browser's own Print on an order page prints that slip), send the slip on WhatsApp, cancel. « Rétablir la commande » brings back the status it had. « Retirer les commandes d'exemple » once she has her own |
| `#produits` | The fiche's products: add, edit, duplicate, delete, photo (downscaled like the editor: ≤ 800 px, JPEG 0.8); an optional stock kept outside the fiche in `'jeere-admin'.stock[productId]`; « Voir dans la boutique » opens the editor on that product page |
| `#clients` | Customers aggregated from the orders (orders, total spent), a WhatsApp button on each row |
| `#boutique` | « Boutique en ligne »: theme (template, palette, intensity, « Personnaliser »), pages, navigation (`inMenu` / `inFooter`), a preferences summary (→ `#parametres/boutique`), « Voir » and « Partager » |
| `#pages` | The fiche's pages (see above); on the phone, « Monter » / « Descendre » are in each page's « ⋯ » sheet |
| `#promos` | « Codes promo »: a small list kept in `'jeere-admin'.promos` (`{ code, kind: 'pct' \| 'fcfa', value, active }`); demo: the store's checkout does not apply them yet |
| `#paiements` | « Encaissement » first (a strong note and « Connecter le paiement mobile money » when Wave / Orange Money / MTN MoMo are on but cannot be collected; each « À connecter » chip opens it), the 6 methods on or off (`fiche.payments`), « Argent chez les livreurs » (cash-on-delivery orders on the road, « Reçu du livreur »), the plan's Jeere fee per sale and the partner's fee (« par exemple 1,95 % pour le mobile money »), how fees are taken (by the partner at payout; nothing on cash on delivery: to confirm with the founder), « Versements » (each online sale and what is paid out after the fees), « Jeere ne garde jamais votre argent » |
| `#livraison` | Delivery zones and fees (the delivery section's `settings.zones`, a delivery section is created if there is none), delays, couriers (« Mes livreurs », Yango, Gozem) |
| `#connecteurs` | The connectors catalogue (below): category chips that jump to each group, « Pour bien démarrer » (mobile money, WhatsApp, Mes livreurs) first, compact rows for the rest on the phone; « Démo : aucune connexion réelle n'est faite. » |
| `#parametres` | A hub: Paiements, Livraison, Connecteurs (their own pages), then Boutique (name, tagline, city, WhatsApp, language FR/EN, FCFA), Domaine (`<slug>.jeere.shop`, a custom domain with DNS instructions, « À vérifier »), Équipe (invite by name, phone and role; the signed-in seller cannot remove herself), Abonnement (the 4 plans, change, what happens at the order limit, mois/semaine for paid plans, « Mettre en pause », « Payer par mobile money »: a demo dialog), Notifications, Pages légales, Données (export the fiche as JSON, the orders as CSV, « Supprimer mon compte » with a typed confirmation, which clears the 4 keys) |

Every phone number typed in the dashboard (WhatsApp, payout, team, couriers, a new order, payment) follows the
account page's rule: `+` and 8 to 15 digits, and exactly 10 digits after +225. « ? Aide » (top bar) and « Aide · une
vraie personne sur WhatsApp » (account menu, « Plus », sidebar) open the Aide dialog: « Revoir la visite guidée »,
« Afficher les premiers pas » when they were hidden, and the real person on WhatsApp (a demo). « Partager » (home, boutique, a product,
empty states) shows the store's address with « Envoyer sur WhatsApp » (`wa.me/?text=`), « Copier le lien »
and the phone's own share sheet. « Voir la boutique » opens the editor on the storefront alone on a computer
(no panel; « Modifier la boutique » brings it back) and on the preview on a phone.

The dashboard writes the fiche through `JEERE_DATA.normalizeConfig`, so the editor opens exactly
what the dashboard saved. To open the editor on a given page it sets `'jeere-studio-open'`
(below); the editor's top bar has « Tableau de bord » (`../admin/`), and its start screen says
« Bonjour {prénom} » with « Tableau de bord » when an account is logged in, else « Se connecter »
and « Créer un compte ».

**`'jeere-admin'`** = `{ version: 1, orders: [Order], settings, connectors, stock? }`, created
lazily:

```js
JEERE_DATA.ADMIN_DEFAULTS = {            // the settings; subdomain '' = fill with subdomainFor(name)
  language: 'fr', subdomain: '', customDomain: '', payoutPhone: '', payoutMethod: 'wave',
  notifications: { newOrderWhatsapp: true, newOrderSms: false, dailySummary: true, lowStock: false },
  team: [],                              // { name, phone, role: 'proprietaire' | 'gestion' | 'livraison' }
  billing: { cycle: 'mois', paused: false }  // or 'semaine'
};
JEERE_DATA.subdomainFor('Awa Beauté');  // 'awa-beaute.jeere.shop'
JEERE_DATA.adminDefaults(config, account, now);   // a fresh 'jeere-admin': settings (subdomain, payout
                                                  // number, the owner in the team), {} connectors, 14 demo orders
JEERE_DATA.normalizeAdmin(saved, config, now);    // repairs any saved value; keeps unknown keys (stock…)
```

`TEAM_ROLES` gives the three roles with a French hint, `OPERATOR_OPTIONS` the four payout
operators (plain text), `DNS_TARGET` the CNAME target (`boutiques.jeere.shop`, a placeholder).
`ADMIN_DEFAULTS` is shared: clone it before changing it.

## Connectors

The catalogue of `#connecteurs`, in `data.js` so the real product and the prototype list the same
services. Service names appear as plain text; never their logos or brand colours (`icon` is a
neutral pictogram name the dashboard draws itself).

```js
JEERE_DATA.CONNECTOR_CATEGORIES = [{ id, label, hint }]   // in this order
JEERE_DATA.CONNECTORS = [{ id, category, name, description, icon, fields: [{ key, label, type, placeholder?, options?, default? }], note?, soon?, payments? }]
// fields[].type: 'text' | 'tel' | 'select' (options [{ value, label }]) | 'toggle' (stored as 'true' / 'false')
// state: 'jeere-admin'.connectors[id] = { status: 'connected' | 'off', values: { [key]: string }, connectedAt }
```

| Category | id | Name | Fields |
| --- | --- | --- | --- |
| Paiements | `mobile-money` | Paiement mobile money (Wave, Orange Money, MTN MoMo, Moov Money through a partner approved by the BCEAO; `payments: wave, orange, mtn, moov`) | payout number, payout operator |
| | `card` | Carte bancaire et diaspora (`payments: card`) | payout number, name on the customer's statement |
| Messagerie | `whatsapp` | WhatsApp Business | number, automatic order messages |
| | `sms` | SMS | sender name, order confirmation SMS |
| Réseaux sociaux | `instagram` | Instagram | account, import posts as products, link in bio |
| | `tiktok` | TikTok | account, link on the profile |
| | `facebook` | Facebook | page, show products on the page |
| Livraison | `yango` | Yango | account number, pick-up address |
| | `gozem` | Gozem | account number, pick-up address |
| | `livreurs` | Mes livreurs | none of its own: the couriers are the team members with the « Livraison » role (any number); the dashboard counts it as connected when there is at least one. Older two-courier values are moved into the team |
| Mesure d'audience | `google-analytics` | Google Analytics | measurement id |
| | `meta-pixel` | Pixel Meta | pixel id |
| | `tiktok-pixel` | Pixel TikTok | pixel id |
| Nom de domaine | `domain` | Nom de domaine | domain (CNAME `www` → `boutiques.jeere.shop`) |
| Intelligence artificielle | `assistant` | Assistant Jeere (writes descriptions, answers customers on WhatsApp) | none: `soon: true`, « Bientôt » |

Every connector has a one-sentence French `description`; `note` carries the honest small print
(the partner's fees, « Jeere ne garde jamais votre argent », consent before any measurement). In
the prototype nothing is connected: the dialog saves the values in `'jeere-admin'` and the page
says « Démo : aucune connexion réelle n'est faite. » In the real product each connector is a
server-side integration (the payment partner's API and webhooks, the WhatsApp Business Platform,
Meta and TikTok catalogue APIs…), with secrets that never reach the browser.

## Plans

`JEERE_DATA.PLANS` is exactly the landing page's pricing (`../index.html#tarifs`):

| id | name | price | orders per month | Jeere fee per online sale |
| --- | --- | --- | --- | --- |
| `gratuit` | Gratuit | 0 FCFA | 20 | 3 % |
| `essentiel` | Essentiel (`recommended`) | 3 000 FCFA / mois, or 1 000 FCFA par semaine | 150 | 1 % |
| `pro` | Pro | 10 000 FCFA / mois | 600 | 0 % |
| `business` | Business | 25 000 FCFA / mois | unlimited (`orders: null`, `unlimited: true`) | 0 % |

Each plan has `priceMonth`, `priceWeek` (`null` when there is no weekly price), `orders`, `fee` (a
percentage), ready-made French labels (`priceLabel`, `priceWeekLabel`, `ordersLabel`, `feeLabel`),
`for` (« Pour démarrer »…), `support: true` and `features` (= `PLAN_FEATURES`): every feature and
human support are in every plan, a seller moves up when she sells more. `PLAN_NOTE` is the
landing's small print (« Tarifs prévus pour le lancement… par exemple 1,95 % pour le mobile
money »).

## Demo orders

```js
JEERE_DATA.demoOrders(config, n = 14, now = new Date())   // also (config, { n, now }) and (config, now)
// demoOrders(defaultConfig('cocody', 'beauty'), 14, '2026-11-03T12:00:00Z')[0] →
//    { id: '#1055', date: '2026-11-03T11:28:00.000Z',
//      customer: { name: 'Yao N.', phone: '+2250100451676', commune: 'Adjamé', address: 'Williamsville, face au marché' },
//      items: [{ productId: 'p2', name: 'Savon noir au karité', qty: 1, price: 3000 }],
//      subtotal: 3000, delivery: 2000, total: 5000,
//      payment: 'orange', status: 'new', channel: 'boutique' }      // some orders also have a note
JEERE_DATA.ORDER_STATUSES = [{ id: 'new', label: 'Nouvelle' }, { id: 'paid', label: 'Payée' },
  { id: 'shipped', label: 'Expédiée' }, { id: 'delivered', label: 'Livrée' }, { id: 'cancelled', label: 'Annulée' }];
JEERE_DATA.ORDER_CHANNELS = [{ id: 'boutique', … }, { id: 'whatsapp', … }, { id: 'instagram', … }, { id: 'tiktok', … }];
```

- **Deterministic**: a seeded generator (no `Math.random`): the same fiche and the same `now` give
  the same orders, byte for byte; another `now` only shifts the dates.
- Made from the fiche: items are its products (name and price), 1 to 3 per order; the customer's
  commune is one of the checkout's zones (`JEERE_DATA.deliveryZones(config)`: the first enabled
  delivery section, else a hidden one, else the communes) and the delivery fee is that zone's;
  the payment is one of the **enabled** methods (`'cod'` when none is: the order came by
  WhatsApp). No product: no order.
- Newest first; ids from `#1042` (the oldest) up; dates over the last 10 days, never after `now`
  (Abidjan is on UTC, so the ISO time is the local time); a realistic mix of statuses (a few
  « Nouvelle » and « Payée » to prepare, some « Expédiée », mostly « Livrée », one « Annulée »;
  a cash-on-delivery order is never « Payée » before it is delivered); a few customers order
  twice; some orders carry a note.
- The customers are made up (an Ivorian first name and an initial, a `+225 07 00…` style number,
  a real quartier and a landmark). The dashboard labels everything built on them « Données
  d'exemple ».

## Shared browser storage

The editor, the account page and the dashboard are separate pages that share five
`localStorage` keys (`JEERE_DATA.STORAGE_KEYS`). Every read and write is in `try/catch`; a
missing, corrupted or older value falls back to the defaults, and a browser where `localStorage`
throws still works for the session.

| Key | Holds | Written by | Read by |
| --- | --- | --- | --- |
| `jeere-studio-config` | The fiche boutique, always through `normalizeConfig` | editor, dashboard, account (the store name she types at sign-up; WhatsApp when empty) | all three |
| `jeere-account` | `{ version: 1, firstName, phone, storeName, createdAt, plan, loggedIn }` | account page, dashboard (plan, log out, demo account) | all three (`normalizeAccount`) |
| `jeere-admin` | `{ version: 1, orders, settings, connectors, stock? }`, created from `ADMIN_DEFAULTS` and `demoOrders(config)` | dashboard | dashboard (`normalizeAdmin`) |
| `jeere-studio-open` | One-shot `{ page, pageId?, productId?, view? }`: the editor opens directly on that page, then deletes the key. `page` is `'home'`, `'product'` (with `productId`) or `'page'` (with `pageId`); the optional `view` (`'preview'` or `'edit'`) says what to show first: the dashboard sends `'preview'` for « Voir la boutique » / « Voir dans la boutique » (a phone opens on the preview; a computer shows the storefront alone, without the panel, until « Modifier la boutique ») | dashboard | editor |
| `jeere-tour` | `{ version: 1, seen: { editor?: iso date, admin?: iso date } }`: the guided tours already shown in this browser (`JeereTour.seen(id)`), written when a tour first shows, so it starts by itself only once | `tour.js` (editor, dashboard) | `tour.js` |

What each app adds around these keys:

- **`jeere-admin` extra keys** (kept by `normalizeAdmin`, which preserves unknown top-level keys):
  `stock` (`{ [productId]: integer }`, never in the fiche), `demoSeeded` (the example orders were
  made from a real fiche: none while there is no store, 14 from its own products as soon as one
  exists), `subdomainChosen` (the seller confirmed her address; until then the address follows
  the store's name, also when it is renamed in the editor), `prefs` (`{ productView: 'list' |
  'grid' }`), `notify` (`{ [connectorId]: true }`, « Me prévenir » on a « Bientôt » connector),
  `onboarding` (`{ checklistHidden?: true, sharedAt?: iso date }`: « Masquer » on « Premiers pas », and the
  first « Envoyer sur WhatsApp » of the share sheet, which ticks the share step), `demoFor` (`template/niche` the example orders were made for: another template or niche in the
  Studio makes them again, unless the seller touched them), `ownerPhone` (whose dashboard it is: a
  new account on the same device takes the payout number over and the previous owner leaves the
  team), `promos` (the codes promo) and `orders[].history` (`[{ status, date }]` or `{ event:
  'confirmed', date }`). An order can also carry `manual` (recorded by the seller), `confirmedAt`,
  `courier` (`{ name, phone }` or `{ service: 'yango' | 'gozem' }`), `deposit` (`{ amount, op, paid
  }`), `cashIn`, `cancelledFrom`, `cancelReason` and `failNote`; `normalizeAdmin` keeps them.
- **`jeere-account`**: the dashboard keeps `storeName` equal to the fiche's name (also after a
  rename in the editor), writes `plan`, `loggedIn: false` on « Se déconnecter » and the demo
  account « Awa ». The editor only reads it.
- **`sessionStorage` `'jeere-compte-flow'`** (account page only, per tab): the sign-up or login step
  in progress (mode, first name, number, when the code was asked), so a reload or Android
  closing the tab while she reads her code does not lose it. No other app reads it.
- **Sync between open pages**: the editor and the dashboard re-read the fiche and the account on
  the `storage` event and on `pageshow` (back from the browser cache); the editor takes a fiche
  changed elsewhere in as an undo step, the dashboard never overwrites a form with unsaved
  changes.

« Supprimer mon compte » (dashboard › Paramètres › Données) clears all five (the tours start again). In the real product
they become Supabase rows (the store, the account, orders, settings, connectors), shared by the
seller's devices and her team.

## Guided tours and « Premiers pas »

One small engine, `tour.js` (`window.JeereTour`, styles in `tour.css`, scoped under `.jt`), shows people how
to use the Studio and the dashboard. A tour is a list of steps; each step puts a spotlight on one area (a
rounded hole in a dark veil, with a white and black ring) and a short bubble: the cloud as the guide's
avatar, « 2/8 », a title, one or two sentences, a progress bar, « Retour », « Suivant » (« C’est parti » on
the last step) and « Passer ».

```js
JeereTour.start({
  id: 'editor',                       // remembered in 'jeere-tour' when the first step shows
  steps: [{ target: '#b-g-theme-palette' /* selector, element, array (one spotlight around all) or function */,
            title: 'Vos couleurs', text: '…', prepare: (dir) => { /* switch the tab or the view first; may return a Promise */ } }],
  insets: () => ({ top, bottom }),    // the sticky bars to keep clear when a target is scrolled in
  returnFocus: () => button,          // where the focus goes when the tour ends (default: where it was)
  onEnd: (reason, index) => {}        // 'done' | 'skip' | 'esc' | 'outside' | 'replaced' | 'empty'
});
JeereTour.seen('editor'); JeereTour.forget('editor'); JeereTour.current(); // { id, index, total, targets }
```

- **Never blocks the page.** The veil lets every click through (`pointer-events: none`); a click, a tap or a
  focus anywhere outside the bubble closes the tour (`'outside'`) and goes on to what was touched. On a touch
  screen only a real tap does (the finger lifted within 10 px of where it went down): scrolling the page to
  read the rest of a tall target keeps the tour open. Turning the phone or resizing the window scrolls the
  target back into view and places the spotlight and the bubble again. A step
  whose target is missing or hidden is skipped. A tour starts by itself only once per browser, about a
  second after the page is ready, and not at all if the seller has already clicked or typed by then
  (it waits for the next visit).
- **Keyboard and screen readers.** The bubble is a non-modal `role="dialog"` (`aria-modal="false"`: the page
  stays usable) named by « Étape 1 sur 8 » and the step's title, described by its text; the focus goes into
  it, so the first step is read from there, once. Tab / Shift+Tab stay in it; Échap closes; ← and → move
  between steps; each following step is announced in an `aria-live="polite"` region (« Étape 2 sur 8 : Vos
  couleurs. … »). Every button is at least 44 px tall. The wording follows the device: « touchez » on a
  phone, « cliquez » on a computer.
- **Phones (< 600 px).** The bubble is a bottom sheet, at the top of the screen instead when the target sits
  at the bottom (the dashboard's tab bar). The target is scrolled into the free part of the screen, under
  the sticky bars and above the sheet; a target taller than that part gets a spotlight on what can be seen.
  **Computers.** A 360 px bubble below, above, then beside the target, kept on screen.
- `prefers-reduced-motion`: no transition, no animation, no smooth scrolling. `forced-colors`: the veil
  goes, the ring uses `Highlight`. Nothing of the tour is printed.

**The Studio's tour** (8 steps, `tourSteps()` in `editor.js`): Votre modèle (Thème › Modèle) · Vos couleurs
(the palettes) · Vives ou Douces · Modifier une section (the hero in the preview: « Cliquez » on a computer,
« Touchez, puis Modifier » on a phone) · Ajouter un produit (« Ajouter un produit » in Produits) · Téléphone ou
ordinateur (the device toggle) · La relecture Qualité (the tab and the score) · Publier, et revoir la visite
(« ? Aide » and « Publier »). On a phone each step switches to the view that shows its area (Modifier or
Aperçu), as the seller would; « Passer », Échap or the last step bring her back to the tab and the view
she was on (a click elsewhere leaves the editor as it is). It starts by itself the first time the editor
opens (a template, the assistant, « Reprendre ma boutique », or « Personnaliser » and the « Premiers pas »
steps in the dashboard, which open the home page), not when the dashboard sends her to a precise place
(`'jeere-studio-open'` with another page, a product, one of her pages or a view) nor when the Back button
brings her back to the editor. « ? Aide » in the top bar (an icon below 1200 px) replays it;
`JeereBuilder.startTour()` too.

**The dashboard's tour** (6 steps on `#accueil`, `tourSteps()` in `admin.js`): Vos premiers pas (the
checklist) · Vos commandes (the sidebar link, the tab bar on the phone) · Vos paiements (the sales card:
Encaissé / À encaisser, and where to connect Wave) · Vos produits · Partagez votre lien (« Partager » on the
store card) · Besoin d’aide ? (« ? Aide »). It starts by itself on the first visit to the home page (signed
in or « Voir la démo »); going to another page ends it. A toast on screen (« Bienvenue dans la démo ») is
cleared when it starts, so nothing shows through the spotlight. « ? Aide » (top bar) › « Revoir la visite guidée »
replays it (from any page: it goes back to Accueil first); `JeereAdmin.startTour()` too.

**« Premiers pas »** (the home page's checklist, `checklist()` in `admin.js`): a progress bar (« 3 sur 10 »,
a `progressbar` with `aria-valuenow`) and steps that tick themselves from the real state; nothing is ticked
by hand. Each step opens the screen where it is done:

| Step | Done when | Opens |
| --- | --- | --- |
| Ajoutez 3 produits avec une vraie photo | 3 products have a photo of her own (`products[].image`; a demo photo does not count) | `#produits` |
| Connectez Wave et le mobile money | the `mobile-money` connector is connected (payout number and operator, e.g. Wave) | `#paiements` |
| Ajoutez votre numéro WhatsApp | `store.whatsapp` is a valid number (« Utiliser mon numéro » does it in one tap) | `#parametres/boutique` |
| Choisissez vos communes de livraison | the delivery section has zones | `#livraison` |
| Personnalisez votre boutique | the theme (her own colours, `theme.colors`, included) or a section differs from the template she started from (the hero title carrying her store name does not count) | the Studio |
| Ajoutez votre logo | `store.logo` is set (an upload or the Studio's text logo) | the Studio, Boutique › « Logo et icône » (`'jeere-studio-open'` `focus: 'logo'`) |
| Partagez le lien sur WhatsApp | she shared from the share sheet: « Envoyer sur WhatsApp », « Copier le lien » (copied) or « Autres applications » (the system share completed) (`'jeere-admin'.onboarding.sharedAt`) | the share sheet |
| Relisez vos pages | the pages are written and checked | `#pages` |
| Atteignez un score qualité de 80 | `validate(fiche).score >= 80` | the Studio |
| Choisissez l’adresse de votre boutique | an address confirmed or a custom domain | `#parametres/domaine` |

The first steps are the five the founder asked for (with the WhatsApp number among them), then the logo;
the last three lead to the launch. The card shows the next 3 steps to do (« Voir les 10 étapes » for all). « Masquer »
hides the card (`'jeere-admin'.onboarding.checklistHidden`); « ? Aide » › « Afficher les premiers pas »
brings it back. When every step is done the card becomes « Votre boutique est prête » with « Publier ma
boutique ».

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
- **The account is a demo.** No SMS or WhatsApp message is sent and any 6-digit code is
  accepted (the screen says so); the account is a `localStorage` entry on this device, not a
  login anyone could use elsewhere.
- **The dashboard's orders, customers and KPIs are examples** computed by `demoOrders` from the
  fiche (labelled « Données d'exemple »); changing a status only changes this browser's copy.
  Its WhatsApp buttons open `wa.me` links to made-up numbers. **Connectors connect nothing**
  (« Démo : aucune connexion réelle n'est faite. »); the custom domain is never verified;
  changing plan and « Payer par mobile money » open a demo dialog and charge nobody. What the
  dashboard writes to the fiche (products, pages, payments, delivery zones, store preferences)
  is real fiche data: the editor shows it.
- **The cart, the checkout and the confirmation are a demo inside the preview.** The cart is held
  in memory on the preview element; the form fields work but nothing is sent; « Payer » never
  charges anyone and always leads to the same confirmation (« Commande n° 1042 »). WhatsApp links
  and the order tracking are shown as they would look; none of them works. Every store, product,
  price, review and person is a made-up example.
- **« Partir de zéro »** is shown as « Bientôt ». It will be an empty template with the same
  sections, rendered by the same templates.

## How to test

In a browser, at 360 px wide (Chrome device mode, a cheap Android phone) and on desktop:

1. Start screen: the logo (the hand-drawn cloud, black ink) in the header; the three template cards
   show live previews of their home page; « Partir de zéro » is disabled.
2. Pick a template: the editor opens with the matching default fiche, in vivid colours, and after a
   second the guided tour (8 steps): go through it with « Suivant » / « Retour », Tab, ← →, then Échap; reload
   and « Reprendre »: no tour; « ? Aide » replays it. Clicking anywhere outside the bubble closes it. Switch
   Téléphone / Ordinateur, edit a section, add a product with a photo, change the palette and the
   template (the intensity stays), undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), check the Qualité
   tab.
3. Thème tab, « Intensité des couleurs »: switch Vives / Douces with every template and a few palettes (try
   Sable, Mangue and Nuit): vivid fills the announcement bar, the hero and alternate sections with
   the accent; soft is the light look. All text stays readable. « Personnaliser les couleurs »: open « Fond de
   la page », pick a dark colour (the text turns light by itself), then pick a dark « Texte »: « Peu lisible »
   and « Corriger »; open a section and try each « Couleur de fond »; Qualité › « Corriger tout »; pick a
   palette (your colours give way, « Annuler » in the toast brings them back); switch the template (your
   colours stay). Boutique › Logo: import a logo with a dark word, then set « Fond de l’en-tête » to navy: the
   note under the logo, in the picker and in Qualité. Automated: `colours-test.js`, `logo-test.js` and
   `fx/review-test.js` (scratchpad `brand/`), see [Custom colours](#custom-colours-themecolors-section-colours).
4. Page selector: go through Accueil, Fiche produit, Panier, Paiement, Confirmation on both
   devices and the three templates. Select a product in the Produits tab: « Fiche produit » shows it.
5. Inside the preview: click a product card, « Ajouter au panier », change quantities (1 to 20),
   remove a line, « Passer au paiement »; the page selector follows. On the checkout, type a first
   name (Ctrl/Cmd+Z in the field must not undo the editor), press « Payer » before choosing a
   commune (the select turns red), pick a commune (the delivery fee, the total and the button
   change), pick « Paiement à la livraison » (the button becomes « Confirmer la commande »), then
   confirm: « Merci {prénom} ! », and the header bag is empty. Turn every payment method off in the Boutique
   tab: the checkout shows its placeholder (and the editor says what to do above the preview);
   hide the Livraison section: the checkout keeps its zones; delete it: the checkout uses the
   default communes.
6. « Fiche boutique »: the JSON (photos shown as `[photo]`, `theme.intensity` present), Copier,
   Télécharger, Importer (import an older fiche without `intensity`: it opens in vivid).
7. Reload: « Reprendre ma boutique » brings the store back, on its saved intensity.
8. « Décrire ma boutique »: the avatar is the white cloud on black, the copy says « l'assistant
   Jeere ». Answer by chips and by free text (« slt c Mariam Hair, jvd des perruques »), try a
   correction (« non, plutôt audacieux »), then « Ouvrir l'éditeur »: the store is vivid.
9. No horizontal scroll at 360 px, the input stays above the on-screen keyboard, Esc closes the
   dialogs, everything works with the keyboard.
10. Page selector, « Vos pages »: open À propos, Livraison et retours, Contact (with its WhatsApp
    block) and Conditions de vente, on both devices; the header menu (desktop) and the phone menu
    list the `inMenu` pages, the footer lists the `inFooter` pages and ends with « Propulsé par
    Jeere ». Ask the assistant for « Chez Fanta » in Bouaké: the pages say « Chez Fanta » and
    « Bouaké ».
11. `../compte/`: sign up with a first name and a number (any 6-digit code; paste a code; wait for
    « Renvoyer le code »), name the store, pick « Aller au tableau de bord ». Log out from the
    dashboard and log in again with the same number; try another number (it offers to create an
    account).
12. `../admin/`: without an account, the gate and « Voir la démo »; then every route at 360 px and
    on desktop: change an order's status, write to a customer, print a slip; add a product with a
    photo; edit, reorder and delete a page and see it in the editor; turn payment methods off;
    edit delivery fees; connect and disconnect a connector; change plan and cycle; export the
    fiche and the orders; « Supprimer mon compte ». Reload after each step: everything persists.
13. Corrupt each key in the console (`localStorage.setItem('jeere-admin', '{oops')`…) and reload
    the three pages: they fall back to the defaults without an error.
14. The whole journey in one browser, at 360 px and on desktop: sign up (`../compte/`) → « Choisir
    un modèle » → edit the hero → « Tableau de bord » (same store, the edited hero in its preview)
    → add a product with a photo → « Voir dans la boutique » (the editor shows it) → add a page
    « Nos engagements » in the menu → « Voir dans la boutique » (it is in the page selector and in
    the store's menu; clicking it in the preview opens it) → Paiements: turn Moov off (the editor's
    checkout no longer offers it) → Livraison: add a commune (it is in the checkout's list) →
    Connecteurs: WhatsApp Business and mobile money (the Accueil checklist ticks them) → change an
    order's status → change plan, invite someone, export the fiche and the orders → log out →
    log in again with the same number. The logo of each page leads back to the landing (`../`).
15. Demo photos, before the real ones exist: in the editor's console, add an entry
    (`JEERE_DATA.DEMO_PHOTOS['test-p1'] = { file: 'test/p1.webp', alt: '…', credit: { name: 'Test', photoUrl: 'https://unsplash.com/photos/x', profileUrl: 'https://unsplash.com/@x' } }`,
    with a file at `img/demo/test/p1.webp` that you delete afterwards), set `photo: 'test-p1'` on a
    product of an imported fiche: the store, the product form (with its credit), the dashboard's
    thumbnails show it; upload a photo (it wins), « Retirer la photo », undo, redo.

From the command line (Node, from this folder):

```sh
# data.js has no DOM access: load it in Node and print a default fiche (prints: 92 APPROUVÉ vivid)
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('cocody','beauty');const v=D.validate(c);console.log(v.score, v.status, c.theme.intensity);require('fs').writeFileSync('/tmp/fiche.json', JSON.stringify(c,null,2))"

# an older fiche without theme.intensity is read as vivid; an unknown value is an error
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('plateau');delete c.theme.intensity;console.log(D.normalizeConfig(c).theme.intensity);c.theme.intensity='fluo';const i=D.validate(c).issues[0];console.log(i.level, JSON.stringify(i.target), i.message)"

# validate a fiche against schema.json (draft 2020-12), with either tool
npx ajv-cli validate --spec=draft2020 -s schema.json -d /tmp/fiche.json
python3 -c "import json,jsonschema;jsonschema.Draft202012Validator(json.load(open('schema.json'))).validate(json.load(open('/tmp/fiche.json')));print('valid')"

# pages: a fiche saved before round 3 gets the 4 default pages, with its own name and city
# (prints: 4 a-propos,livraison-et-retours,contact,conditions-de-vente true)
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('plateau','fashion');delete c.pages;c.store.city='Bouaké';const n=D.normalizeConfig(c);console.log(n.pages.length, n.pages.map(p=>p.slug).join(), n.pages[2].body.includes('Bouaké'))"

# demo orders are deterministic for a given date and use only the enabled payment methods (prints: true [ 'cod', 'mtn', 'orange', 'wave' ])
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('cocody','beauty');const a=D.demoOrders(c,14,'2026-11-03T12:00:00Z'),b=D.demoOrders(c,14,'2026-11-03T12:00:00Z');console.log(JSON.stringify(a)===JSON.stringify(b),[...new Set(a.map(o=>o.payment))].sort())"
```

**Round 3 checks** (Node and Python `jsonschema`, about 5 000 assertions): all 27
`defaultConfig(template, niche)` fiches (3 templates × 8 niches, and without a niche) validate
with 0 errors, score 92, pass `schema.json` and are unchanged by `normalizeConfig`; a fiche
without `pages` gets the 4 default pages with its own name and city; the assistant's
`generate()` (renamed, relocated stores) gives pages with the new name and city and passes the
schema; an edited page is never rewritten; garbage pages (duplicate ids and slugs, accents,
missing fields, non-objects, a title of 80 and a body of 5 000 characters) are repaired into a
fiche that passes the schema, and `normalizeConfig` is stable on its own output; `validate`
reports the empty title (error), the duplicate or invalid slug (warnings), the empty or
unreachable page (tips) and never throws; the schema rejects a missing `pages`, a bad id, slugs
with accents, capitals or a trailing hyphen, a title of 61, a body of 4 001, a string boolean, an
extra key and 21 pages. `demoOrders` is identical for the same date for every template × niche,
dates are within the 10 days before `now`, newest first, totals add up, fees are those of the
customer's commune, items are the fiche's products, the payments are only enabled ones (only
`moov` when only Moov is on, `cod` when none is), and it returns `[]` without products. `PLANS`
match the landing; every new string follows French typography (non-breaking spaces before
: ; ? ! % and inside « », 12 500 FCFA, 14 h).

When the schema was written, every `defaultConfig(template, niche)` (3 templates × 8 niches),
`normalizeConfig` of garbage input and an editor-like fiche with a photo validated, with both
Python `jsonschema` and Ajv in strict mode; 41 broken fiches (unknown palette, price as text,
rating 6, image URL, wrong settings for the type…) were rejected. With `theme.intensity` (round 2)
the same 36 fiches still validate, all 27 `defaultConfig` fiches are vivid with 0 errors and a
score of 92, `normalizeConfig` turns older fiches into vivid ones, and the schema and `validate`
both reject `"bright"`, `null`, `1` and the label `"Vives"` (the schema also rejects a missing
value).

## Known limits

- One store and one demo account per browser, saved in `localStorage`: no real login, no sync
  between devices, no team that actually shares the store. Large photos can fill the storage
  quota; the editor then saves the store without its photos, says so and keeps working.
  Download the fiche boutique to keep the photos.
- The default pages are good starting texts, not legal advice: « Conditions de vente » says to
  have it checked by a lawyer, and the return promises are examples to adapt.
- Stock lives in the dashboard's storage, outside the fiche (the fiche has no stock): the store
  never shows « épuisé ».
- The local assistant only knows its keyword lists; an unusual phrasing gets « je n'ai pas
  compris » and the chips. It never invents products: it uses the niche's example products.
- The example reviews in the default fiches are made up. A real store must never publish invented
  reviews as genuine; the real assistant disables the section until the seller adds real ones
  (see `prompts.md`).
- Product illustrations are generic SVG drawings, and demo photos (once there are some) are not the
  seller's products; a real store needs real photos (the Qualité tab says so).
- The checkout is a front-end demo: no order is created, no payment request leaves the page, no
  stock, no promo code, no product variants (size, colour), one delivery fee per commune, and the
  order number is always 1042. The cart is lost when the page reloads.
- Fonts come from Google Fonts: offline, the store falls back to system fonts.
- The dashboard's language setting only records `fr` or `en` (a toast says so): every screen
  stays in French for now. The custom domain and the connectors are never really checked.
- The account's « store name » follows the fiche when the dashboard loads; a seller who renames her
  store in the editor and then picks another template there gets the name the dashboard last saw.

## Next steps

1. **Connect the single assistant described in [`prompts.md`](prompts.md)**: a Supabase Edge
   Function holding the Anthropic API key as a secret, the system prompt and its one tool, code
   validation with `schema.json` and `JEERE_DATA.validate`, monthly and per-store budget caps, and
   this prototype's local assistant as the free fallback.
2. Save fiches in Supabase (one row per store) instead of `localStorage`, with the seller
   account of `../compte/` on Supabase Auth's phone sign-in (one-time code over WhatsApp, SMS as
   a fallback), and the dashboard's orders, settings, team and connectors as rows of their own.
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
