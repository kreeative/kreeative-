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
| `data.js` | The contract: templates, 8 palettes (contrast-checked), the 2 colour intensities, the custom colours (`COLOR_GROUPS`, `themeColors`, `sectionColors`, `colorChecks`, `fixColors`), 6 font pairs (the « Suggestions ») and 33 Google Fonts in 5 styles (`FONTS`, `typography`: see [Fonts](#fonts-themetypography)), the 8 section types and their form fields, 8 niches with French example content (including the 4 default custom pages of each niche), Abidjan communes and fees, the payment methods with their checkout texts, the 5 store pages. The seller side: `PLANS`, `CONNECTORS` and `CONNECTOR_CATEGORIES`, `ADMIN_DEFAULTS`, `ORDER_STATUSES`, `STORAGE_KEYS`, `demoOrders`. Pure helpers: `defaultConfig`, `normalizeConfig`, `validate`, `formatPrice`, `normalizeWhatsapp`, `slugify`, `newId`, `clone`… No DOM access, so it also loads in Node and in a Supabase Edge Function. | `window.JEERE_DATA` |
| `render.js`, `store.css` | Renders a fiche into one of the 5 store pages (header and footer on every page) for a phone (390 px) or desktop (1200 px) frame, in vivid or soft colours. Handles the navigation inside the preview and a demo cart. Pure and defensive: escapes every string, never throws, shows the seller's photo, else the demo photo, else draws the product illustration in SVG, never makes a network request to another site. Store CSS is scoped under `.jst`. | `window.JeereRender` |
| `elstyles.js` | Element styles, the design layer of the Studio's Design tab and of the quick-style sheet: the element registry, the property whitelist and sanitiser (used by `normalizeConfig`), the breakpoint / state cascade, the CSS generator and `apply(config, root)` (called at the end of `render()`; a no-op without `elementStyles`). Loaded right after `render.js` on every page that reads the fiche (`creer/`, `admin/`, `studio/`, `compte/`). See [Element styles](#element-styles-elementstyles). | `window.JeereElStyles` |
| `engine-sections.js` | The store side of the Studio's detached sections (`sections[].engine`): the sanitiser (used by `normalizeConfig`, also in Node), the DualEngine document of a section, its scoped HTML/CSS (container queries) for `render.js`, the on-demand loading of `../studio/engine/`. See [Detached sections](#detached-sections-sectionsengine). | `window.JeereEngineSections` |
| `jcolor.js`, `jcolor.css` | The colour picker of the Studio and of the editor (never a native `<input type="color">`): HSV square, hue, alpha, Hex / RGB / HSL, pipette, palette and recent chips, a « Dégradé » tab; popover or inline, dark or light, mouse or finger. | `window.JeereColor` |
| `quickstyle.js` | The editor's quick-style bottom sheet: a tap on a button, a title, a text, an image or an icon of the phone preview (see [Element styles](#element-styles-elementstyles)). | `window.JeereQuickStyle` |
| `img/demo/` | The demo photos of the example stores (WebP), with `CREDITS.md`: see [Demo photos](#demo-photos). 69 photos from Unsplash: 8 per niche (6 products, the hero, the about section) and 5 in `landing/` for the mock-ups of the landing page. | — |
| `index.html`, `builder.css`, `editor.js` | The start screen and the editor: tabs Sections, Produits, Thème, Boutique, Qualité; the page selector; device toggle; undo/redo; autosave to `localStorage` (`jeere-studio-config`); the « Fiche boutique » modal (copy, download, import); the « Publier » dialog (the real publication of `publish.js`, under the quality score). `index.html` holds the logo's SVG symbols. | `window.JeereBuilder` |
| `publish.js`, `publish.css` | Publishing for real: the address rules and its live check (`rpc/slug_available`), the Supabase session, publish / update / unpublish (`public.stores`), the live link with copy and WhatsApp share, and the public read of a published fiche. One panel, mounted in the editor's, the Studio's and the dashboard's « Publier ». See `../README.md`, « Domaines ». | `window.JeerePublish` |
| `domains.js` | A seller's own domain: validation, the DNS records to add, registrar guides, the DNS-over-HTTPS check, the resale prices in FCFA, the `domains` Edge Function client, domain search. Loaded by the dashboard and the checkout. | `window.JeereDomains` |
| `tour.js`, `tour.css` | The guided tour shared by the editor and the dashboard: a spotlight on one area, a short bubble with the cloud as the guide, « Suivant » / « Retour » / « Passer », « 2/8 ». See [Guided tours and « Premiers pas »](#guided-tours-and-premiers-pas). Styles scoped under `.jt`. | `window.JeereTour` |
| `fontfile.js`, `brotli-dict.bin` | Reads a font file the seller imports (« Mes polices »): its family name, weight and style from the `name`, `OS/2`, `head`, `fvar` tables, its letters from `cmap`; TTF, OTF, WOFF (zlib through `DecompressionStream`) and WOFF2 (its own Brotli decoder, RFC 7932; `brotli-dict.bin` is Brotli's static dictionary, RFC 7932 Appendix A, 122 784 bytes, MIT, fetched only for a WOFF2 that uses it); packs a TTF / OTF as WOFF (`toWoff`, `CompressionStream`). Pure, no DOM, loads in Node. Editor only. See [Her own fonts](#her-own-fonts-mes-polices-themecustomfonts). | `window.JeereFontFile` |
| `wizard.js`, `wizard.css` | « Décrire ma boutique »: the local Jeere assistant, a chat that asks 6 questions (name, what you sell, style, colour, needs, city and WhatsApp), understands free text by keywords, handles corrections, and ends with a summary card. `generate(answers)` (always a vivid fiche) and `understand(text, step)` are pure and exposed for tests. Styles scoped under `.jwz`. | `window.JeereWizard` |
| `schema.json` | JSON Schema (draft 2020-12) of the fiche boutique v1, `pages` included. | — |
| `prompts.md` | In French: the single AI assistant of the real product — system prompt, its one tool, the free code around it, the self-improvement loop, the TypeScript orchestration and the cost estimate. The assistant can also adapt the 4 default pages. | — |
| `README.md` | This file: the whole prototype, the account and the dashboard included. | — |
| `../compte/` (`index.html`, `compte.css`, `compte.js`, `auth.js`) | Sign-up and login with a one-time code by e-mail (default), SMS or WhatsApp, real accounts on Supabase Auth: see [Seller accounts](#seller-accounts-compte) and `../README.md`, « Seller accounts (Supabase Auth) ». Loads `../creer/data.js`. `auth.js` is also loaded by `creer/`, `admin/`, `studio/` and `abonnements/` (it keeps `public.profiles` in step with `'jeere-account'`; nothing happens without a real session). | `window.JeereAuth` |
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
| `theme.fonts` | `editorial`, `moderne`, `doux`, `audacieux`, `classique`, `simple`: the font pair, shown as « Suggestions » in the Thème tab |
| `theme.typography` | optional: the seller's heading font and text font chosen apart (33 fonts, or one of hers: `'custom:cf1'`), the titles' size `S`/`M`/`L`, weight and capitals. A fiche without it renders exactly as before — see [Fonts](#fonts-themetypography) |
| `theme.customFonts` | optional: her own fonts, « Mes polices »: up to 4 imported files (a base64 data URL each, 400 KB at most) and 4 Google Fonts added by name. Never written by the assistant. A fiche without it renders exactly as before — see [Her own fonts](#her-own-fonts-mes-polices-themecustomfonts) |
| `theme.radius` / `theme.buttons` | `none`, `soft`, `round` / `solid`, `outline` |
| `payments` | exactly `wave`, `orange`, `mtn`, `moov`, `cod`, `card` (booleans), shown as plain text, never with the operators' logos or colours: in the footer, on the product page and as the checkout's payment options |
| `sections[].engine` | optional: a section detached in the Studio, drawn from its DualEngine nodes — see [Detached sections](#detached-sections-sectionsengine) |
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
- **Address**: a page is shown everywhere as `jeere.kreeative.xyz/b/<store>/pages/<slug>` (the dashboard's
  address field, the editor's desktop frame and its « Vos pages » rows), like Shopify's
  `/pages/…`. `jeere.kreeative.xyz/b/<store>` follows the store's name until the seller publishes at an address
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

## Fonts (`theme.typography`)

The founder: « la police aussi, on devrait avoir plus de choix ». The 6 pairs stay, as « Suggestions » (one click
sets both fonts); after that the seller chooses the heading font and the text font apart, among 33 Google Fonts
in 5 styles, each shown in its own face, with the titles' size, weight and capitals.

**Contract** — one optional key, never added by `defaultConfig` or `normalizeConfig`: a fiche without it renders
**byte for byte as before** (snap.js: 1 440 renders, and the same pixels with the new `store.css`; `fonts-test.js`).
It holds only what differs from the suggestion (`theme.fonts`, still required):

| Key | Values | `normalizeConfig` (never throws) |
| --- | --- | --- |
| `display` | a font id of `FONTS` (`'bodoni-moda'`): the titles, the name in the header without a logo, prices and big numbers in Treichville… everything the pair's heading font drew | trimmed, lower case; unknown → dropped |
| `text` | a font id with `text: true` (`TEXT_FONT_IDS`, 14 fonts): paragraphs, buttons, forms | a display or handwritten font (`'caveat'`), or one too small for paragraphs (`'eb-garamond'`) → dropped |
| `weight` | the titles' weight, one the heading font has (`FONTS[].weights`) | a number from 1 to 1000 or 3 digits (`'650'`) → the nearest the font has (a tie goes up: 700); anything else (`'gras'`, `'700px'`, `'9e99'`, `[700]`, `-5`) → dropped |
| `pair` | the suggestion the fonts were chosen over (filled by `normalizeConfig` when `display`, `text` or `weight` is set) | when `theme.fonts` no longer matches it, a tool that only knows the pairs (the Studio today) changed the pair: `display`, `text`, `weight` no longer apply (render ignores them) and are dropped |
| `size` | `'S'` (× 0.86), `'M'`, `'L'` (× 1.16): every title of the store, not the texts nor the name in the header | `'l'`, `'grand'` → `'L'` |
| `upper` | `true` / `false`: titles, the name in the header and the checkout's step titles in capitals or not. Absent: `upperDefault(template, display)`, the template's (`HEADING_UPPER_DEFAULT`: Treichville in capitals), except under a handwriting heading font: never in capitals unless `upper: true` | read as a boolean |

An empty object, or one with nothing valid left, is dropped. `schema.json` describes it (`fontId`, `textFontId`).

**The 33 fonts** (`JEERE_DATA.FONTS`, a collection like the palettes; `FONT_STYLES` gives the 5 styles with a
label, a short label for the chips and a hint). Each has `family`, `stack`, `style`, `kind` (`serif`/`sans`),
`weights` (the ones offered for titles, all in the font), `weight` (its default), `text`, `glyphs`, `fallback`,
`scale`, `opsz`, `italic` (a real italic on Google Fonts), `displayStack` / `localFb` (see Loading). ★ = also
offered for texts (an x-height of at least 0.48 em: EB Garamond, 0.40, and Baloo 2, 0.46, read too small in
paragraphs at 15 px, so they are for titles only); † = no ɛ ɔ, drawn with the fallback (‡: no ŋ either).

| Style | Fonts | For |
| --- | --- | --- |
| Élégant (serif) | Playfair, Cormorant Garamond †, EB Garamond, Bodoni Moda †, DM Serif Display † ‡, Libre Baskerville ★, Lora ★ †, Fraunces ★ †, Marcellus † | fashion, jewellery, upscale beauty |
| Moderne | Inter ★, Montserrat ★, Poppins ★ † ‡, DM Sans ★ †, Manrope ★ †, Space Grotesk ★ †, Fira Sans ★, Onest ★ | any store |
| Doux et arrondi (« Arrondi ») | Nunito ★ †, Quicksand ★ †, Comfortaa †, Baloo 2 †, Fredoka † ‡ | beauty, kids, sweets |
| Audacieux | Unbounded, Anton, Bebas Neue †, Archivo Black †, Oswald †, Bricolage Grotesque ★ † | sneakers, street, food |
| Manuscrit (titles only) | Pacifico †, Dancing Script †, Caveat †, Great Vibes, Amatic SC † | crafts, pastry, gifts |

The pairs' fonts are in the list with the very same stacks and weights (`fontPairs[].displayFont` / `.textFont`),
so choosing the pair's own font is no change at all. Space Grotesk took the place of Plus Jakarta Sans, which
could not be told from Inter and Manrope on a phone (x-heights within 2 %): Moderne keeps a quirkier grotesk.

**French accents and ɛ ɔ ŋ.** Checked on 5 November 2026 with fontTools on the files Google serves
(`fonts/coverage.py` in the scratchpad; `fonts-test.js` compares its `coverage.json` with the `glyphs` flags):
all 33 have every French accent, « » ’ œ æ. Only 10 have ɛ ɔ ŋ Ɛ Ɔ Ŋ (Playfair, EB Garamond, Libre Baskerville,
Inter, Montserrat, Fira Sans, Onest, Unbounded, Anton, Great Vibes). The 23 others lack ɛ ɔ Ɛ Ɔ, but 20 of them
have their own ŋ Ŋ (the browser uses it, the subset only brings ɛ ɔ Ɛ Ɔ); only DM Serif Display, Poppins and
Fredoka lack ŋ too. For those 23, the landing page's trick: the six letters alone from Montserrat
(sans, display, script) or Noto Serif (serifs), `css2?family=…&text=ɛɔƐƆŋŊ` (a few KB, its `@font-face` has
`unicode-range` for those six code points only), named right after the font in its stack (`'Bodoni Moda', 'Noto
Serif', Georgia, …`), so a Dioula or Baoulé name (« Kɔnan Bɛnɛ ») is drawn whole, in a close face, never as boxes.
A fallback family that is already the store's other font (Montserrat as the text font) is not loaded twice.

**Loading** — `JEERE_DATA.typography(config)` → `{ pair, custom, display, text, weight, weights, size, scale, hs,
hf, upper, upperSet, upperDefault, hcase, italic, displayStack, textStack, links: [{ id, href, fallback? }],
families, fallbacks, faces: [{ id, css }] }`.
`custom: false` (no own font, or the pair's own ones): `links` is the pair's `googleUrl`, as before. Otherwise one
stylesheet with **at most 2 families** and **only the weights used** (the heading font: its weight and 400, for
Plateau's quotes and signatures; the text font: 400, 500, 600, 700, or the nearest it has; one family when both
are the same font; the optical-size axis for Playfair, Bodoni Moda, Fraunces, Bricolage Grotesque; on Plateau,
the heading font's real italic 400 too, for the signature, when it has one), plus at most one glyph-subset
stylesheet; every URL ends with `&display=swap`. `JeereRender.fontLinks(config)` returns them and `ensureFonts`
adds each once per page (ids `jst-font-<pair>`, `jst-font-c-<hash>`, `jst-font-fb-<hash>`).
A heading font drawn bigger or smaller (`scale` ≠ 1: the handwritings, Bebas Neue, Cormorant…) has a local
stand-in in its `displayStack`, right before the system font: `faces` holds its `@font-face` (`local('Arial')`,
`local('Roboto')`… or Georgia for serifs, `size-adjust: 1 / scale`), which `ensureFonts` adds as a `<style
id="jst-font-l-<id>">`. Nothing is downloaded; until the web font arrives (or if it never does on slow mobile
data) the titles keep the size the pairs' titles have instead of a system font blown up by the scale.
`fonts-test.js` checks the budget on all 528 heading × text combinations, and counts what a page that renders one
store really requests.

**Render** (`render.js`, `store.css` « the seller's fonts »): `--st-font-display`, `--st-font-text` and
`--st-display-weight` carry her fonts like the pair's. The 119 title `font-size` rules of `store.css` are
`calc(<px> * var(--st-hs, 1))` and the 14 rules of the name in the header `calc(<px> * var(--st-hf, 1))`;
render.js sets `--st-hs` (size × the font's `scale`) and `--st-hf` (the font's `scale`: a handwriting with a small
x-height, Caveat, is drawn × 1.24) only when they are not 1, and `data-hcase="upper" | "none"` only when the
capitals differ from what the template writes (her choice, or a handwriting on Treichville: `none`). With her own
fonts (`custom`) it also sets `data-fonts="custom"` (`font-synthesis-weight: none`: every weight used is loaded, so
no smeared fake bold of Anton or Great Vibes), `data-hital="none"` when the heading font has no italic (Plateau's
signature upright, not slanted by the browser), and `data-hstyle="manuscrit"` for a handwriting: the prices,
figures, badges and paragraphs the templates draw in the heading font (Treichville's prices, Plateau's review
quotes and cart lines…) then use the text font. When one of the two fonts takes ɛ ɔ ŋ from the fallback, render.js also sets `--st-fsa: from-font` and
`store.css` gives every element `font-size-adjust: var(--st-fsa, none)`: those letters take the x-height of the
font they sit in (a Montserrat ɛ inside Caveat no longer looks like a capital), the font's own letters do not move.
Without the key nothing is set, and `calc(34px * 1)` is 34 px: same HTML, same pixels.

**Editor** (Thème › « Polices », `#b-g-theme-fonts`):

- An « Aperçu » card: the store's name in the heading font (weight, size, capitals) and a line of text in the
  text font, on the store's own colours.
- « Suggestions »: the 6 pairs (`data-fk="font-<id>"`); pressed only while she has no font of her own. Choosing
  one replaces her fonts (`setFontPair`: size and capitals stay); the toast says so for 7 s with « Annuler ».
- « Titres »: « Police des titres », a field in the font's own face that opens the list: chips Élégant / Moderne /
  Arrondi / Audacieux / Manuscrit (44 px), the style's hint, and the style's fonts, each written in its own face
  (`fd-<id>`; the editor loads only the letters of each name, `fontSampleUrl`, a few KB per font). « Taille des
  titres » Petits / Moyens / Grands; « Épaisseur des titres »: the weights the font has, each chip written at its
  weight (Fin, Normal, Moyen, Semi-gras, Gras, Très gras, Noir; « n’existe qu’en une épaisseur » for Anton,
  Pacifico…); « Titres en majuscules » (a switch). A new heading font brings its own default weight, and a
  handwriting comes without capitals (she can turn them back on). The picker's samples are loaded under a private
  family (`jeere-s-<id>`, the stylesheet fetched and renamed): a static subset never mixes with the store's own
  family in the preview (an optical-size font would otherwise get a few letters at the wrong size).
- « Textes »: « Police des textes », the same list with the 14 text fonts only (no Manuscrit tab).
- A note when a font lacks ɛ ɔ ŋ: « quand une police ne les a pas, ils sont écrits dans une police proche ».
- A choice equal to the suggestion's is deleted (and an empty `typography`): the fiche is the pair's again.
  Every change is one undo step, saved with the fiche, back after a reload. Choosing a **template keeps her
  fonts** over its suggestion (`pair` follows; « Vos polices sont gardées »); her capitals choice stays only when it
  differs from the new template's. The logo chips and the text logo use her heading font.
- **Qualité**: an unknown heading font, or a text font that is not for paragraphs → error (target `{ kind: 'theme',
  id: 'fonts' }`); a handwriting in capitals → warning « Une écriture manuscrite se lit mal en majuscules »
  (`key: 'upper'`). A default fiche still scores 92, and so does one with her own fonts.

**Assistant** (`wizard.js`, `fontRequests(text)`): « une police élégante », « une écriture manuscrite », « des
lettres écrites à la main », « une typo moderne », « une police arrondie », « une police audacieuse », « les
titres en majuscules », « pas de majuscules » are read at the style question, in the summary, or with a verb
(« mets », « je veux »…), never in her name nor in what she sells (« des cartes écrites à la main » is a
product). The phrase is taken out before the style is read: « je veux une police élégante » keeps the
recommended template (it does not pick Plateau), « style audacieux avec une police manuscrite » gives both. The
assistant says « Je note aussi une écriture manuscrite pour les titres. Vous pourrez changer les polices dans
Thème › Polices. »; `generate()` writes `theme.typography.display` by style and niche (`FONT_PICK`: élégant →
Bodoni Moda for fashion, Playfair for beauty, Fraunces for food, else Cormorant Garamond; manuscrit → Great Vibes
for jewellery, Dancing Script for fashion and beauty, Pacifico for food, else Caveat; moderne → Montserrat;
arrondi → Quicksand; audacieux → Anton…), and `upper` when it differs from `upperDefault` (a handwriting is not
in capitals, on Treichville too, unless she asks). The
summary card says « Polices : Caveat · Onest ».

**Dashboard**: « Boutique en ligne › Thème › Polices » shows « Quicksand · Nunito » instead of the pair's name;
`customised()` counts her fonts; the mini previews use `JeereRender`, so they show them.

**The Studio** (`../studio/`) only knows the pairs today and keeps working: it reads `fontPairs` and sets
`theme.fonts`; a fiche with her own fonts renders with them, and when the Studio changes the pair, `pair` no
longer matches, so its choice wins (render ignores the stale fonts, `normalizeConfig` drops them). Still to
do there (not in `creer/`): its PNG export embeds only `fontPairs[theme.fonts].googleUrl`, so a store with her own
fonts exports with system fonts (it should fetch every `typography(config).links[].href`, the `text=` subset
included); its font field and token row show the pair, not `typography(config).families`; its thumbnail cache
key should include `theme.typography`. To offer the
fonts there: `FONTS`, `FONT_STYLES`, `typography(config)` (the stacks, the weights, the links), `setFontPair(config,
id)` (a pair, the seller's size and capitals kept), `fontSampleUrl(id)` for a picker in the fonts' own faces.

### Her own fonts (« Mes polices », `theme.customFonts`)

The founder: « ajoute une option pour que chaque personne puisse importer les fonts qu’elle veut directement ». Both
font lists of Thème › Polices (titles, texts) end with a tab **« Mes polices »**: a font file from the phone or the
computer, or any Google Font by its name, beyond the 33.

**Contract** — one optional key, never added by `defaultConfig` or `normalizeConfig`: a fiche without it renders **byte
for byte as before**, and so does a fiche whose `customFonts` no choice uses (`customfonts-test.js`, snap.js). Her
choice names one with `theme.typography.display` / `.text` = `'custom:<id>'` (for the titles **and** for the texts:
nothing tells us a font of hers is too decorative for paragraphs).

| Entry | Keys | `normalizeConfig` (never throws) |
| --- | --- | --- |
| an imported file (4 at most, `CUSTOM_FONT_LIMITS.files`) | `id` (`cf1`, `cf2`…), `name` (her name for it, 40 characters), `weight` (100…900), `style` (`normal` / `italic`), `format` (`woff2`, `woff`, `ttf`, `otf`), `data` (`data:font/<format>;base64,…`), `size` (bytes, 400 KB at most), and optionally `weightRange` (`[min, max]`, a variable font's weight axis), `glyphs` (has ɛ ɔ ŋ Ɛ Ɔ Ŋ), `accents` (has é è à ç « » ’…), `kind` (`serif` / `sans`: which ɛ ɔ ŋ fallback) | the data URL must be base64 of a known font mime (`font/*`, `application/font-woff`, `application/octet-stream`…), its **first bytes** must be a font (`wOF2`, `wOFF`, `OTTO`, `0x00010000` / `true`: `format` comes from them and the prefix is rewritten `data:font/<format>`), 400 KB decoded at most (`CUSTOM_FONT_LIMITS.chars`), else the entry goes; the name loses control characters and `" ' \` \ < > { } ;`; weights round to the 100s (`'650'` → 700, `9e99` → 400); unknown keys go; duplicate or bad ids are renumbered |
| a Google font (4 at most) | `id`, `name` (Google's family name: `'Josefin Sans'`), `source: 'google'`, `weights` (`[400, 700]`: the ones Google serves), optionally `italic`, `glyphs`, `kind` | the name must be letters, digits and spaces (`googleFamilyName`), else the entry goes; a name twice: the first stays |

Then `typography.display` / `.text` = `'custom:<id>'` is kept only when that id is in the list (repaired first); otherwise it
goes (the store gets the suggestion's font back). An empty list is dropped. `schema.json` describes it all (`customFonts`,
`customFontFile`, `customFontGoogle`, `customFontRef`).

**Families.** Files with the same name (case and spaces aside) are **one font**: a Regular and a Bold of « Josefin Sans » give
one family with two weights (two `@font-face` of one private family `jeere-u-<hash of the name>`), offered once in the list; a
choice names any of their ids. `customFamilies(config)` returns them as font objects shaped like `FONTS` entries (`style:
'mine'`, `custom: true`, `source: 'file' | 'google'`, `ids`, `weights`, `weight` = the nearest to 650, `stack`, `fallback`…);
`fontOf(config, id)` finds one of the 33 or one of hers. A variable file offers every weight of its axis.

**Render**. `typography()` treats her fonts like the 33: `custom`, the stacks (`'jeere-u-x0l2nd', 'Montserrat', system-ui…` —
a private family, never her name, so nothing she types reaches the CSS), only the weights used, `--st-fsa` and the
Montserrat / Noto Serif subset when a font has no ɛ ɔ ŋ (`glyphs` is read from the file's `cmap`; a Google font's is measured when
it is added). A **Google font** of hers gets its own stylesheet (`css2?family=Josefin+Sans:wght@400;700&display=swap`, only the
weights used; separate so a weight Google stops serving cannot take the other font down): still at most 2 families + the glyph
subset. An **imported file** costs no request: `typography().faces` holds one `@font-face{font-family:'jeere-u-…';src:url(data:…)
format('woff2');font-weight:700;font-style:normal;font-display:swap}` per file of the families used (ids `jst-font-u-<hash>`),
`own` their names. `JeereRender.ensureFonts(config, doc)` adds them to the `<head>` of the document the store is drawn in (render
passes its root's), once, so the editor's preview, the dashboard's mini previews and the Studio all draw them; it lets through only
the two exact `@font-face` shapes (local stand-ins, or one `data:font/…;base64` URL). A text font of hers with no weight of 600 or
more (an imported Regular alone) sets `data-fsynth="weight"`: `store.css` then allows the browser's bold for prices and buttons
(`[data-fonts="custom"]` otherwise forbids fake bold).

**Reading a file** (`fontfile.js`, `window.JeereFontFile`): `sniff(bytes)` (the first 4 bytes); `read(bytes, { inflate, dict })`
→ `{ format, family, subfamily, weight, style, weightRange, kind, glyphs, accents, latin, missing }`: the family is name ID 16, else
1 (Windows Unicode, else Mac Roman); « Josefin Sans Thin » with style « Bold » at weight 700 — how Google's static cuts of a variable
font are named — becomes « Josefin Sans »; the weight is `OS/2.usWeightClass` (or the `fvar` default), italic from `fsSelection`,
`head.macStyle` or the style name; `kind` from the PANOSE serif style, else the name; the letters from the `cmap` (formats 4, 6, 12,
13). WOFF tables are inflated with `DecompressionStream('deflate')`. **WOFF2** packs every table in one Brotli stream and no browser
offers Brotli to JavaScript, so `brotliDecode()` implements RFC 7932 (prefix codes, context maps, block switches, the distance ring,
the 121 dictionary transforms); every WOFF2 we tried uses the static dictionary, so the editor fetches `brotli-dict.bin` (same site,
122 784 bytes, sha256 `20e42eb1…5c70`) the first time one needs it. Checked against Node's zlib on 486 streams (every quality, window
and mode, random data, text, fonts) and byte for byte on the WOFF2 streams of 6 real fonts. `toWoff(bytes, deflate)` packs a TTF /
OTF as WOFF (each table zlib-compressed: Young Serif 104 → 49 KB).

**Editor** (Thème › Polices › « Mes polices », in the titles' list and in the texts' list):

- Her fonts, each written in its own face, « Votre fichier » / « Google Fonts » under it; a click chooses it for that list.
- **« Importer une police »** (a file button: on a phone the system offers its files; `.woff2,.woff,.ttf,.otf` and their mime types,
  except on an iPhone or iPad, whose Files app greys out the types it does not know: every file is offered, the first bytes decide).
  The file is read (a 4 MB file is refused before reading), a TTF / OTF is packed as WOFF, then the browser must load it
  (`new FontFace(…).load()`: its sanitizer refuses a broken or hostile file). Nothing is added yet: a card shows the font in its
  own face (« Àà Éé Çç ɛ ɔ ŋ 0123 »), what was read (« Gras (700) · WOFF2, 12 Ko », « TTF, 104 Ko → WOFF, 49 Ko »), **« Nom de la
  police »** (the name read from the file, which she can change; « Ce fichier ne donne pas son nom » when it has none; « ce fichier
  s’y ajoute (2 épaisseurs) » when the name is one of hers), « n’a pas tous les accents (é è …) » (orange), « n’a pas les lettres ɛ,
  ɔ et ŋ : elles seront écrites dans une police proche », the **licence reminder** « Vérifiez que vous avez le droit d’utiliser cette
  police sur le web : sa licence doit le permettre (c’est le cas des polices Google Fonts et des polices sous licence OFL). » (a note,
  never an error), « Pour les titres » / « Pour les textes » (the list she came from is on), « Ajouter cette police » / « Annuler ».
- Refused, in red under the list and in a toast: over 400 KB once packed (« Cette police pèse 457 Ko, même compressée : c’est trop
  lourd pour une boutique qui s’ouvre sur un téléphone (400 Ko au plus). Importez plutôt sa version WOFF2, bien plus légère. »; a
  WOFF2 too heavy: « Choisissez une seule épaisseur, ou une police plus légère »), not a font (« Ce fichier n’est pas une police.
  Choisissez un fichier WOFF2, WOFF, TTF ou OTF. »), a `.ttc` collection, a file with no Latin letters, a broken file, a WOFF2 offline
  (the dictionary could not be fetched). With 4 files: « Vous avez déjà 4 polices importées : retirez-en une ».
- **« Ajouter une police Google Fonts »**: her exact name (« josefin sans » works: the name as typed, then in capitals; « IBM plex
  sans » keeps IBM), « Chercher ». The css2 API answers only for a family it has: the 9 weights are asked in parallel (`text=Aa`, a
  few hundred bytes each), then the italic, then ɛ ɔ ŋ (a `text=ɛɔƐƆŋŊ` subset under a private name, measured on a canvas over two
  fallbacks). A name that does not exist: « Aucune police Google Fonts ne s’appelle « … ». Vérifiez l’orthographe sur fonts.google.com »
  (no connection at all: « Pas de connexion »); one of the 33: « Montserrat est déjà dans nos polices : choisissez-la dans l’onglet
  Moderne » with « Choisir Montserrat »; letters other than A–Z, digits and spaces are refused. Found: the same card, then « Ajouter ».
- **« Gérer mes polices »**: each family with « 2 fichiers WOFF2 · 2 épaisseurs · 24 Ko · Titres », **« Renommer »** (her files: every
  file of the family takes the name; Google fonts keep Google's) and **« Retirer »** (a choice that used it goes back to the suggestion's
  font; the toast has « Annuler »). Every change is one undo step, saved with the fiche, back after a reload; a template change keeps
  them; a suggestion replaces her choices but keeps « Mes polices ».
- **A full browser memory** (`saveNow`): when the fiche no longer fits in `localStorage`, her newest imported files are left out
  one at a time until it fits — of the fiche she edits too (and of the current undo step), so what she sees is what is saved — with
  « La mémoire du navigateur est pleine : la police « Sora » n’a pas pu être gardée. Votre boutique est bien enregistrée.
  Téléchargez la fiche boutique pour tout garder, ou retirez des photos. ». When dropping fonts does not help, the photos go as
  before (and fonts too, only if even that does not fit). A store is never left unsaved because of a font.
- **Qualité**: a heavy file in use (over 200 KB, `CUSTOM_FONT_LIMITS.heavy`) → warning « La police « Fraunces » pèse 352 Ko : votre
  boutique s’ouvrira plus lentement sur un téléphone. Importez plutôt sa version WOFF2… »; a font in use without the French accents →
  warning; without ɛ ɔ ŋ → a warning when the store writes them, else a tip, both free (no point lost: they are drawn in a close font,
  like the 23 fonts of the list without them); a file no choice uses → a free tip « … n’est utilisée ni pour les titres ni pour les
  textes. Retirez-la… ». Each opens Thème › Polices › Mes polices (`target: { kind: 'theme', id: 'fonts', key: 'custom:cf1' }`). An
  unknown `'custom:…'` reference is the usual « Police des titres inconnue » error. A default fiche still scores 92.

**Dashboard**: « Polices » shows « Josefin Sans · Young Serif »; the mini previews draw her files (they use `JeereRender`); writing
the fiche keeps them (`normalizeConfig`). Nothing to change there.

**Assistant**: the local assistant never writes `customFonts`. The real one (`prompts.md`) must not either: the rule says so, the tool
description says so, and `appliquerPatch` strips `theme.customFonts` and any `'custom:…'` from its patches.

**Still to do**: the Studio's PNG export (see above) does not embed her files either. In the real product the files belong in
Supabase Storage (one URL in the fiche, cached by the CDN), not in the fiche; the 400 KB cap then can grow. A licence cannot be
checked by code: the reminder is all we can do.

**Tests** (scratchpad `customfonts/`): `customfonts-test.js` (contract and hostile inputs, schema, the 3 templates × phone and
desktop in her files with the ɛ ɔ ŋ fallback, the editor at 390 and 1440 px, Google Fonts by name, a full memory, the dashboard,
snap.js) and `fontfile-node.js` (Brotli vs zlib, `read()` vs fontTools); screenshots in `customfonts/shots/`.

**Tests** (scratchpad `fonts/`): `fonts-test.js` — the contract (33 fonts, 5 styles, repairs, the stale pair,
`setFontPair`, `validate`, schema with Python `jsonschema`), the glyph flags against fontTools, all 528
combinations within the loading budget, the 33 fonts × 3 templates rendered (each `FontFace` loaded at its weight,
titles and texts in their fonts), heading and text independent, size S/M/L, weight, capitals on and off (header
name and checkout included), ɛ ɔ ŋ in a store name (Bodoni Moda → Noto Serif) and a product name (Poppins →
Montserrat) drawn with the fallback, what one store requests, the editor at 390 and 1440 px (every font of the
picker in its own face, choices, undo / redo, reload, suggestions, template change, Qualité), the assistant's
words, the dashboard, and the old fiches byte for byte (snap.js) and pixel for pixel. Screenshots in
`fonts/shots/`.

## Element styles (`elementStyles`)

The design of each element of the store, set in the Studio's **Design** tab (`../studio/`) or, more
simply, in the editor's quick-style sheet. An optional top-level key of the fiche, **never added**: a
fiche without it renders byte-identically (`render()` calls `JeereElStyles.apply`, which returns at once).

```json
"elementStyles": {
  "s2/button":   { "base": { "rTL": 24, "rTR": 24, "rBR": 24, "rBL": 24, "smooth": 60, "fillType": "linear",
                             "gradAngle": 135, "gradStops": [{ "c": "#FF6A3D", "p": 0 }, { "c": "#B5179E", "p": 100 }],
                             "shadows": [{ "x": 0, "y": 6, "blur": 16, "spread": -4, "c": "#0000001F", "inset": false }],
                             "tDur": 320, "tEase": "spring" },
                   "phone": { "pt": 22, "pb": 22 },
                   "hover": { "scale": 106, "fillType": "solid", "fill": "#1F1A17" } },
  "s3/section":  { "base": { "fillType": "image", "bgImage": "demo:beauty-about", "bgTint": "#FFF7F0CC", "pt": 96 } },
  "s2/image":    { "base": { "zoom": 140, "focusX": 30, "focusY": 40, "ratio": 0.8 } },
  "s4/card~p3":  { "base": { "bW": 2, "bColor": "@accent/40", "bAlign": "outside" } },
  "@header/bag": { "base": { "icon": "basket", "shape": "circle", "fillType": "solid", "fill": "@accent/15", "pt": 8, "pr": 8, "pb": 8, "pl": 8 } },
  "@page/page":  { "base": { "contentW": 1040, "fontDisplay": "montserrat" } }
}
```

- **Keys** `"<sectionId>/<elementKey>"`: a section id of the fiche, or `@header`, `@footer`, `@page`;
  `elementKey` from `JeereElStyles.REGISTRY[type]`; `card~<productId>` styles one product card.
- **Layers** (all optional): `base` (every screen), `desktop` (computer only, ≥ 1024 px),
  `tablet` (tablet **and** phone: the phone inherits it), `phone`, then the states `hover`
  (`:hover`, under `@media (hover: hover)`), `pressed` (`:active`), `focus` (`:focus-visible`).
  Cascade (SPEC-DUALENGINE §1.5, §4.3): base → desktop; base → tablet → phone; a state wins over the
  screen it is shown on. `hide` (visibility per screen) is never cascaded: each screen says itself.
- **The registry** (selector inside `[data-section-id]`, kind): hero `section`, `copy`, `kicker`,
  `title`, `text`, `actions`, `button`, `image`; announcement `section`, `text`; categories `section`,
  `title`, `card`, `cardImage`, `cardName`, `arrow`; products `section`, `title`, `grid`, `card` (kind
  card), `cardImage`, `badge`, `fav`, `category`, `name`, `price`, `cardButton`; about `section`,
  `image`, `kicker`, `title`, `text`, `sign`; reviews `section`, `title`, `rating`, `card`, `stars`,
  `quote`, `author`; delivery `section`, `icon`, `title`, `text`, `zones`, `zone`, `price`; whatsapp
  `section`, `panel`, `icon`, `title`, `text`, `button`; `@header` `header`, `logo`, `nav`, `menu`,
  `search`, `bag`; `@footer` `footer`, `name`, `heading`, `link`, `bottom`; `@page` `page`. The kind
  (section, container, text, button, image, badge, icon, card, page) decides which groups apply.
- **Properties** (whitelist `JeereElStyles.PROPS`, px unless noted): layout `wMode`/`hMode`
  (hug, fill, fixed), `w`, `h`, `wUnit` (px, %, vw), `hUnit`, `minW`, `maxW`, `minH`, `maxH`,
  `pt pr pb pl`, `mt mr mb ml`, `gap`, `stack` (col, row), `alignX`, `alignY`, `wrap`, `textAlign`,
  `contentW`, `pos`, `top right bottom left`, `z`, `overflow`, `hide`; radius `rTL rTR rBR rBL`,
  `smooth` (%, `corner-shape: superellipse()`); fill `fillType` (solid, linear, radial, image, none),
  `fill`, `gradAngle`, `gradStops`, `gradShape`, `gradX`, `gradY`, `bgImage`, `bgFit`, `bgPosX`,
  `bgPosY`, `bgTint`, `opacity` (%), `blend`; border `bW`, `bWT bWR bWB bWL`, `bStyle`, `bColor`,
  `bAlign` (inside, center, outside — a uniform solid stroke is a `box-shadow`, so nothing moves);
  `shadows`; effects `blur`, `bblur`, `rotate`, `scale` (%), `skewX`, `skewY`, `tx`, `ty`;
  typography `font` (a `FONTS` id, `@display`, `@text`), `fontSize`, `fontWeight`, `italic`,
  `lh` (× size), `ls` (% of size), `textCase`, `deco`, `color`; image `fit`, `focusX`, `focusY`,
  `zoom` (100–400 %, about the focal point, clipped back to the frame), `ratio`, `brightness`,
  `contrast`, `saturate`, `grayscale`, `sepia`, `hue`; icons `icon` (an id of `JeereElStyles.ICONS`,
  drawn by a CSS mask in the element's colour), `iconSize`, `iconStroke`, `shape`, `btnIcon`,
  `btnIconPos`; cards `hidePrice`, `hideBadge`, `hideButton`, `hideCat`, `mediaRatio`; page
  `fontDisplay`, `fontText`; transition (base only) `tDur`, `tEase` (ease, ease-out, ease-in-out,
  expo, linear, spring, bounce — the springs as CSS `linear()` with a cubic-bezier fallback).
- **Sanitised** by `normalizeConfig` (`JeereElStyles.sanitize`): unknown keys, layers and props are
  dropped, numbers clamped to their range, colours are `#RRGGBB`, `#RRGGBBAA` or a palette token
  (`@accent`, `@accent/40`, which follow a palette change), images a demo photo (`demo:<id>`) or a
  base64 `data:image/…` (≤ 1.6 MB) — never raw CSS, never `url()` or `expression()`; entries of a
  missing section are dropped; never throws. Duplicating a section in the Studio copies its styles.
- **Applied** by `JeereElStyles.apply(config, root)`: one `<style data-jst-es>` at the end of the
  store root, scoped by `data-jst-es="<n>"` on the root, every declaration `!important` (the
  designer's choice beats the template, its states and inline styles). The breakpoint is on the
  root too: `data-jst-bp` = `desktop` | `tablet` | `tablet phone`, from the layout
  (`data-device`) and the root's width (< 1024 px = tablet), kept fresh by a `ResizeObserver` —
  the store never reads the window, so the Studio's artboards, the editor's preview, the dashboard
  and the real store agree. `JeereElStyles.css(config, { scope: '.jst', only: key })` gives the same
  CSS for reading (the Studio's « CSS » tab).

**In the editor** (`quickstyle.js`): a tap on a button, a title, a text, an image or an icon of the
phone preview opens a bottom sheet — colours (the picker of `jcolor.js`, made for the finger), corner
rounding, size S / M / L, border on / off + colour, bold, alignment; for a photo, its crop: drag it
in the preview, pinch or the slider to zoom, a format (1:1, 4:5, 16:9). It writes the same
`elementStyles` (`base` layer) through the editor's one change path (undo, autosave). The store's
own controls (add to cart, menu, links: `data-jst-action`) and the product cards keep working.

## Detached sections (`sections[].engine`)

In the Studio, « Détacher la section » (Réglages, the context menu, `Ctrl Alt B`) turns a section of
the template into free DualEngine nodes (`../studio/engine/`, SPEC-DUALENGINE). An optional key of
the section, **never added**: a fiche without it renders byte-identically (`render.js` only takes the
engine path for a section that has it, and the engine is not even loaded).

```json
{ "id": "s2", "type": "hero", "enabled": true, "settings": { "title": "…" },
  "engine": { "v": 1, "root": "72d5e379-…",
              "nodes": { "72d5e379-…": { "id": "72d5e379-…", "type": "frame", "parent": null, "children": ["…"],
                                         "layoutChild": { "position": "flow", "widthMode": "fill", "heightMode": "hug" },
                                         "layoutParent": { "mode": "stack", "direction": "vertical", "gap": 0, … },
                                         "overrides": { "phone": { "geometry": { "h": 728 } } }, … }, … },
              "assets": { "a1": { "src": "demo:beauty-hero", "w": 1200, "h": 1500 } } } }
```

- **Nodes**: DualEngine nodes (`frame`, `stack`, `grid`, `rect`, `ellipse`, `line`, `text`, `image`), one
  tree under `root` (the section itself, always full width). Breakpoints: `base` = computer (1200 px and
  wider), `tablet` (< 1200 px), `phone` (< 768 px); `overrides.tablet` / `overrides.phone` hold exact
  values (SPEC §1.5). `id`, `type`, `enabled` and `settings` stay as they were: « Rattacher au modèle »
  just removes `engine`, and the simple editor keeps editing the settings.
- **Sanitised** by `normalizeConfig` through `JeereEngineSections.sanitize` (`engine-sections.js`, also
  in Node): whitelisted types and properties, numbers clamped, colours `{ r, g, b, a }` in [0, 1], fonts
  a list of plain family names, links `https://`, `#`, `/`, `tel:`, `mailto:` only, images `demo:<id>`
  or a base64 `data:image/…` (≤ 1.7 MB), no `vw` / `vh` (a store in an artboard is not the window),
  unreachable nodes and cycles dropped, 3 000 nodes at most. A page without `engine-sections.js` keeps
  the key as it is (never a silent loss).
- **Rendered** by `JeereEngineSections.sectionHTML` (called from `render.js`'s `renderSection`): the
  engine's `exportDocument` HTML in `<section class="jst-eng" data-section-id data-eng>`, with its CSS
  in a `<style>` scoped under `.jst [data-eng="<id>"]` and the breakpoint media queries rewritten as
  **container queries** on the section (`container-type: inline-size`): the Studio's artboards, the
  editor's preview, the dashboard and the real store pick the breakpoint from the store's width. The
  engine (`../studio/engine/*.js`) is loaded on demand the first time a fiche has a detached section;
  until then the section keeps its place and the store renders again once (`apply`). Exports are cached
  by content.
- `engine-sections.js` is loaded right after `elstyles.js` on every page that reads the fiche
  (`creer/`, `admin/`, `compte/`, `studio/`). Global `window.JeereEngineSections`.
- **Wave 1 of the Studio audit** (all optional, kept by the sanitiser, never added):
  - `semantic.attrs` keeps a store behaviour: `data-jst-action` (one of `go`, `add`, `menu`, `wa`,
    `scroll`, `ext`, `qty`, `pdp-qty`, `remove`) with its `data-product` / `data-page` / `data-page-id`
    / `data-section` / `data-delta` / `data-quick`, and `target="_blank"` with an href. render.js's
    delegated clicks then work on a detached section (« Ajouter » adds to the cart).
  - `node.bind = { product, field: 'name' | 'price' | 'image' }` on a text or an image: `sectionHTML(s, m)`
    (render.js passes its model) draws the product's current name, price or photo there
    (`boundSection(s, m)`), so a detached products section follows the catalogue.
  - image nodes: `crop.fx` / `crop.fy` (the focal point; with them `crop.w < 1` is a zoom of `1 / w`,
    drawn as a scale about the focal point clipped back to the box) and `adjust { brightness, contrast,
    saturate (0–200, %), grayscale, sepia (0–100), hue (−180–180°) }` (CSS filters).

## Links, alternative texts, buttons and SEO (wave 1 of the Studio audit)

- **Every store link has an `href`** (`render.js`, `withHrefs`): a link with `data-jst-action="go"` gets an
  in-page address (`#/`, `#/produits/<id>`, `#/pages/<slug>`, `#/panier`, `#/paiement`, `#/confirmation`),
  or, with `render(config, root, { linkBase: '/b/<slug>' })`, a path address under that base for a
  published store. The previews keep intercepting the clicks. The category tiles link to the first
  products section (`#<section id>`, `data-jst-action="scroll"`).
- **Alternative texts**: hero and « À propos » photos read `settings.imageAlt`, else the demo photo's
  description, else the section's title; product photos read `products[].alt`, else the product's name.
- **A button's link** (hero, WhatsApp): `settings.buttonLink` = `home` | `cart` | `whatsapp` | `page:<id>` |
  `product:<id>` | `section:<id>` | `https://…`, `settings.buttonNewTab: true`. With it the button is an
  `<a class="jst-btn" href>`; without it, exactly the template's `<button>` as before.
- **SEO** apart from the store's name and tagline: `store.seo` and `pages[].seo` =
  `{ title (70), description (160), noindex }`. Empty: the name, the tagline, the page's title and text.
- All of them are optional keys, repaired by `normalizeConfig` (`normSectionExtras`, `normSeo`) and never
  added: a fiche without them is unchanged.

## Seller accounts (`../compte/`)

How a seller signs up to manage her store: **a first name and a one-time code, no password**. Not
everyone has WhatsApp on the number she types, so she chooses where the code goes: **e-mail
(default)**, SMS or WhatsApp. One step per screen, big inputs, built for 360 px with the on-screen
keyboard open. Real accounts live in Supabase (see `../README.md`, « Seller accounts (Supabase
Auth) »: schema, modes, what to configure).

```
#inscription (default when there is no account)
  Prénom + « Recevoir mon code par » [E-mail | SMS | WhatsApp]
    E-mail: adresse e-mail + numéro WhatsApp (facultatif, for her orders)
    SMS / WhatsApp: the number (+225 by default, the landing form's country list)
   └─ « Recevoir mon code » ─► 6 boxes (paste works, autocomplete="one-time-code", resend after 60 s,
      « Changer d'adresse », « Autre méthode »)
       └─ « Le nom de votre boutique » (prefilled from the fiche when there is one)
           └─ « Comment voulez-vous commencer ? »
                Choisir un modèle → ../creer/ · Discuter avec l'assistant → ../creer/#assistant
                Aller au tableau de bord → ../admin/
#connexion
  E-mail or number ─► code ─► ../admin/   (an address with no account: offer to create one)
```

- **Real or demo**: real on the live site (Supabase sends the code; SMS and WhatsApp say « pas encore
  activés » until an SMS provider is configured); « Mode démo » with `?demo=1`, on localhost and when
  Supabase is unreachable: then nothing is sent, any 6-digit code works, and the screen says so (a
  « Mode démo » banner, « aucun e-mail, SMS ni WhatsApp n'est envoyé » on the code step). The consent
  line reads « En continuant, vous acceptez les conditions et la politique de confidentialité de Jeere. »
- **Saved** as `'jeere-account'` = `{ version: 1, firstName, phone, storeName, createdAt, plan,
  loggedIn }` plus, when present, `email`, `userId` (a real Supabase account), `method` (`'email'`,
  `'sms'` or `'whatsapp'`) and `studio`. `phone` is normalised with `normalizeWhatsapp`
  (`+2250707123456`), or `''` for an e-mail account without a number; `plan` is `'gratuit'` at
  sign-up; `loggedIn: true`. A real login writes the profile row (`public.profiles`) in this shape,
  and `../compte/auth.js` sends the changes the other pages make back to it. When a fiche exists,
  its name is prefilled on « Le nom de votre boutique »: if she types another one, the saved store
  takes it (and the hero titles that carried the old name follow, as in the dashboard's
  Préférences); `store.whatsapp` is set only if it is empty. `JEERE_DATA.normalizeAccount(raw)`
  turns whatever was saved into that shape, or `null` when there is no account; an account with
  neither a usable number (`+` and 8 to 15 digits) nor a usable e-mail is no account, for the
  account page, the dashboard and the editor alike.
- **Routes**: `#inscription` and `#connexion` (the links of the editor and the dashboard). With no
  hash the page picks sign-up when there is no account, login when the saved account is logged
  out (with a one-tap « Continuer » card for it, showing the masked e-mail or number), and a
  « Bonjour {prénom} » screen (store, e-mail, number, plan; « Aller au tableau de bord », « Ouvrir
  l'éditeur », « Se déconnecter », which also ends the Supabase session) when it is logged in.
  Each step is a history entry, so the phone's Back button goes back one step. The page never
  writes `'jeere-admin'` or `'jeere-studio-open'`; `window.JeereCompte = { parsePhone,
  formatPhone, maskPhone, maskEmail, normEmail }` holds its pure helpers for tests.
- **After sign-up**: a template chosen in the editor carries her store name and number; « Discuter
  avec l'assistant » offers the same name and number as the first quick answers of its name and
  WhatsApp questions (`wizard.js` reads `'jeere-account'`, never writes it).

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
| `#parametres` | A hub: Paiements, Livraison, Connecteurs (their own pages), then Boutique (name, tagline, city, WhatsApp, language FR/EN, FCFA), Domaine (`admin/domaines.js`: the free address `jeere.kreeative.xyz/b/<slug>` and « Publier », her own domain with the exact DNS records, guides per registrar and a real DNS check, and « Acheter un nom de domaine »: see `../README.md`, « Domaines »), Équipe (invite by name, phone and role; the signed-in seller cannot remove herself), Abonnement (the 4 plans, change, what happens at the order limit, mois/semaine for paid plans, « Mettre en pause », « Payer par mobile money »: a demo dialog), Studio avancé (`#parametres/studio`: the Studio subscription — plan, renewal, cancel / resume, a move down, seats, demo invoices; see `../studio/README.md`, « Abonnements Studio »), Notifications, Pages légales, Données (export the fiche as JSON, the orders as CSV, « Supprimer mon compte » with a typed confirmation, which clears the 4 keys) |

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
JEERE_DATA.subdomainFor('Awa Beauté');  // 'jeere.kreeative.xyz/b/awa-beaute' (storeAddress(storeSlugFor(name)))
JEERE_DATA.adminDefaults(config, account, now);   // a fresh 'jeere-admin': settings (subdomain, payout
                                                  // number, the owner in the team), {} connectors, 14 demo orders
JEERE_DATA.normalizeAdmin(saved, config, now);    // repairs any saved value; keeps unknown keys (stock…)
```

`TEAM_ROLES` gives the three roles with a French hint, `OPERATOR_OPTIONS` the four payout
operators (plain text), `DNS_APEX_A` (`76.76.21.21`) and `DNS_TARGET` (`cname.vercel-dns.com`), the generic Vercel
records of a seller's own domain. The store address: `PUBLIC_HOST`, `STORE_PATH`, `ADDRESS_MODE` (`'path'` today,
`'subdomain'` once jeere.shop is Jeere's), `storeAddress(slug)`, `storeUrl(slug)`, `storeSlug(any old address)`,
`storeSlugFor(name)`, `checkStoreSlug(slug)` and `STORE_SLUG_RESERVED` (the same list as the database).
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
| Nom de domaine | `domain` | Nom de domaine | domain (A `@` → `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`; the whole flow is Paramètres › Domaine) |
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
| `jeere-account` | `{ version: 1, firstName, phone, storeName, createdAt, plan, loggedIn, email?, userId?, method?, studio? }` (`phone` may be `''` for an e-mail account; `userId` = a real Supabase account, mirrored to `public.profiles` by `../compte/auth.js`); `studio` is the Studio subscription (`../studio/plans.js`, see `../studio/README.md`, « Abonnements Studio »), kept as it is by `normalizeAccount` and only when there is one | account page, dashboard (plan, log out, demo account, Studio subscription), Studio and `../abonnements/` (Studio subscription, through `JeerePlans`) | all of them (`normalizeAccount`) |
| `jeere-admin` | `{ version: 1, orders, settings, connectors, stock? }`, created from `ADMIN_DEFAULTS` and `demoOrders(config)` | dashboard | dashboard (`normalizeAdmin`) |
| `jeere-studio-open` | One-shot `{ page, pageId?, productId?, view? }`: the editor opens directly on that page, then deletes the key. `page` is `'home'`, `'product'` (with `productId`) or `'page'` (with `pageId`); the optional `view` (`'preview'` or `'edit'`) says what to show first: the dashboard sends `'preview'` for « Voir la boutique » / « Voir dans la boutique » (a phone opens on the preview; a computer shows the storefront alone, without the panel, until « Modifier la boutique ») | dashboard | editor |
| `jeere-tour` | `{ version: 1, seen: { editor?: iso date, admin?: iso date } }`: the guided tours already shown in this browser (`JeereTour.seen(id)`), written when a tour first shows, so it starts by itself only once | `tour.js` (editor, dashboard) | `tour.js` |
| `jeere-publish` | `{ version: 1, slug, storeId, ownerId, published, publishedAt, hash }`: the store this browser published (`publish.js`); `hash` tells « your last changes are not online yet ». `jeere-admin` also gets `domain` (`{ status, checkedAt, records }`) and `domainOrders` (demo domain purchases) | `publish.js` (editor, Studio, dashboard), the checkout (`domainOrders`) | the same, the dashboard |

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
- **Publishing is real, once the seller is signed in to Supabase.** « Publier » writes the fiche to
  `public.stores` and the store is online at `https://jeere.kreeative.xyz/b/<adresse>` (`../b/`). Until the
  account page signs sellers in with Supabase Auth, the dialog says the store is saved in this browser only;
  the editor still autosaves to `localStorage` on this device. See `../README.md`, « Domaines ».
- **The account is a demo.** No SMS or WhatsApp message is sent and any 6-digit code is
  accepted (the screen says so); the account is a `localStorage` entry on this device, not a
  login anyone could use elsewhere.
- **The dashboard's orders, customers and KPIs are examples** computed by `demoOrders` from the
  fiche (labelled « Données d'exemple »); changing a status only changes this browser's copy.
  Its WhatsApp buttons open `wa.me` links to made-up numbers. **Connectors connect nothing**
  (« Démo : aucune connexion réelle n'est faite. »); the custom domain is never verified;
  changing plan and « Payer par mobile money » open a demo dialog and charge nobody. The custom domain's DNS check
  is real (dns.google); attaching it needs the Vercel token on the server, and buying a domain is a demo checkout. What the
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
   « Polices »: pick a suggestion, then « Police des titres » › Manuscrit › Caveat, « Grands », capitals on
   (Qualité warns) and off, « Police des textes » › Lora; name the store « Kɔnan Bɛnɛ » (ɛ ɔ drawn whole); switch
   the template (your fonts stay), pick a suggestion (« Annuler » brings them back). Automated: `fonts-test.js`
   (scratchpad `fonts/`), see [Fonts](#fonts-themetypography).
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
11. `../compte/` (`?demo=1`): sign up with a first name and an e-mail, then by SMS and by WhatsApp
    (any 6-digit code; paste a code; wait for « Renvoyer le code »), name the store, pick « Aller au
    tableau de bord ». Log out from the dashboard and log in again with the same address; try
    another address (it offers to create an account). Without `?demo=` on the live site, the code
    really arrives by e-mail.
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
- Her imported fonts live inside the fiche (base64), so they weigh in the browser's storage like photos: when it is full, the newest
  font goes, with a toast, and the store is saved without it. The real product should store them as files (Supabase Storage) and keep
  only a URL in the fiche.
- The dashboard's language setting only records `fr` or `en` (a toast says so): every screen
  stays in French for now. The custom domain and the connectors are never really checked.
- The account's « store name » follows the fiche when the dashboard loads; a seller who renames her
  store in the editor and then picks another template there gets the name the dashboard last saw.

## Next steps

1. **Connect the single assistant described in [`prompts.md`](prompts.md)**: a Supabase Edge
   Function holding the Anthropic API key as a secret, the system prompt and its one tool, code
   validation with `schema.json` and `JEERE_DATA.validate`, monthly and per-store budget caps, and
   this prototype's local assistant as the free fallback.
2. Save fiches in Supabase (one row per store) instead of `localStorage`, tied to the seller
   account of `../compte/` (Supabase Auth, done: e-mail code today, SMS and WhatsApp once a provider
   is configured; `public.profiles`), and the dashboard's orders, settings, team and connectors as
   rows of their own.
3. Start the « il se nourrit lui-même » loop: anonymised kept stores (opt-in), the nightly job that
   updates the defaults library (template, palette and intensity per niche), the few-shot examples
   and the keyword lists.
4. ~~A real public store page~~: done (`../b/`, `jeere.kreeative.xyz/b/<adresse>`, pages in the hash). Next: render
   the meta tags on a server so WhatsApp and Facebook previews show the store.
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
