# Jeere — landing page and waitlist

The first public face of **Jeere**, the all-in-one commerce platform built for Africa: build and
run an online store and in-person sales from one dashboard, with mobile money (brainstorm of
2 November 2026). It pitches the product to Abidjan sellers and collects a
waitlist that doubles as the pool for the seller interviews and the 50-store concierge pilot.
French by default (Côte d’Ivoire, prices in FCFA), with an English version.

Live (unlisted): https://kreeative.xyz/concepts/jeere/ · English: add `?lang=en`

## Ground rules

- Private for now: `<meta name="robots" content="noindex, nofollow">`, not linked from the
  portfolio and not in the sitemap. Remove the `robots` meta and add it to `sitemap.xml` when
  you start sharing it (build in public, bio links).
- Every store, product, price, fee and person on the page is a made-up example (Awa Beauté,
  Maison Adjoa, Studio 225, delivery fees by commune). The plans use the brainstorm’s sample
  prices; the order caps (20 / 150 / 600) are guesses to test in the seller interviews. All are
  labelled as “planned, may still change”.
- No logos of Wave, Orange, MTN or Moov are used: they appear as plain text.
- The photos in the example stores are the store builder's demo photos (Unsplash, see
  [Photos](#photos)), not photos of real Jeere sellers. The footer says « Photos d’exemple : Unsplash ».
  The boutique in « De l’idée à la boutique » is an Unsplash photo too (credited on the photo itself).

## Waitlist

The form saves to Supabase, in the **Kreeative Teach** project, table `public.jeere_waitlist`
(migration `create_jeere_waitlist`). The page posts straight to the REST API with the
publishable key; row level security only lets visitors **add** a row, never read one. Read the
sign-ups in Supabase → Table Editor → `jeere_waitlist`.

| Column | What it holds |
| --- | --- |
| `role` | `seller` or `buyer` (diaspora buyer) |
| `first_name`, `whatsapp` | required; the number is stored as `+225…` and is unique, so a second sign-up with the same number shows “already on the list” |
| `shop_name`, `category`, `channels`, `handle`, `city`, `budget`, `pilot` | sellers’ answers (budget = what they would pay a month) |
| `lang`, `source` | page language, and UTM source or referrer (`?utm_source=tiktok`) |
| `consent` | must be true (WhatsApp contact about the launch) |

Numbers are personal data: keep the table private, and delete a row when someone asks
(the FAQ gives annklyy@gmail.com for that). A hidden honeypot field drops most bots.

## Identity used on the page

- **Logo**: drawn by hand by the founder in black ink, then traced to vector paths (no font, no
  image request): two pieces, kept as inline symbols in the page's hidden sprite.
  - `#cloud` (viewBox `0 0 600 446`): a scribbled cloud with two eyes, the **mark**. The header
    shows it alone (32 px tall on phones, 36 px from 560 px), with generous room around it.
  - `#wordmark` (viewBox `0 0 900 479`): « jeere » written by hand in lowercase, the **wordmark**,
    used where the name is meant as a word: « Avec jeere » in the before/after title and the footer.
  Both fill with `currentColor` (`fill-rule: evenodd`, the inside of the cloud stays open): ink
  `#111111` on the white UI, white on dark backgrounds (footer, the dark « Avec jeere » column).
  The footer echoes the brand board: the handwritten « jeere » with four small icons (store,
  payment, chat, delivery) beside a large cloud. Accessible names stay « Jeere ».
- **App and tab icon**: the white cloud on a bright, lively pop blue `#3657FF` (`favicon.svg`, 64×64
  rounded square, with a simplified trace of the cloud, slightly bolder eyes and a tight margin so it
  still reads at 16 px in a tab; `apple-touch-icon.png`, 180×180 full bleed: iOS rounds the corners). The pop blue
  is only for the icon: the site itself stays black and white.
- **Name**: always written « Jeere » in text (only the J in capital), never « JEERE »; only the
  handwritten wordmark is lowercase « jeere ».
- **Text weights**: light on purpose: titles in Poppins 400, buttons and labels 500, body 400.
- **Colours**: black and white for Jeere itself. White `#FFFFFF`, greys `#F5F5F3` / `#EBEBE8`, ink
  `#111111`, muted text `#5E5E5E`. No accent colour: the sellers’ photos and stores bring the
  colour, so only the demo stores and product pictures on the page are in colour. Inside the
  platform (editor, dashboard, account), small status badges, dots and chart bars carry colour codes
  with a meaning (green done, orange attention, red problem, blue info): see
  `creer/README.md`, « Couleurs d’état ».
- **Type**: Poppins (SIL OFL) for everything. Poppins has no ɛ, ɔ or ŋ (needed for Dioula and
  Bambara names), so the page also loads those six letters alone from Montserrat (SIL OFL), a
  few KB, and the browser uses them in place of the missing ones.

## Page

1. Hero, on a light grey band: “Créez votre boutique en ligne gratuitement” and a black card that asks for a
   WhatsApp number. The card sends nothing: it copies the number into the waitlist form, scrolls there and asks for
   the first name (without JavaScript it simply links to the waitlist). On the right, an editor canvas on a faint grid:
   a store page whose portrait (the beauty store's hero photo) sits in a thick ring of the store colour, with floating
   editor tools: a text toolbar with the Jeere assistant, a colour tray (Karité, Lagune, Hibiscus, Indigo, Mangue,
   Menthe, white: the same bright colours as the store palettes) that recolours the store (the ring, the page tint,
   the soft mat around the product card's photo, the « Ajouter » button; black ring for white), a product card (a real photo of
   raw shea butter) whose quantity updates the “Paiement Wave reçu” chip, and a pause button. The colours change by themselves every 2.8 s
   until the visitor hovers, focuses or pauses; with reduced motion they start paused. Then “Encaissez comme vos
   clients paient” with the payment methods.
1b. « De l’idée à la boutique » (`#idee`), full bleed on black: the founder's idea. In the logo's hand (every line a
   bundle of 2 to 5 opaque strands of the same weight that drift and cross, a comb of loose strands ending in round
   drops where the brush lifts, her eyes as two solid drops like the cloud's), brush strokes draw a real boutique: the
   room, the shelves, the seller at her counter, the products, the hanging opener. As the last strokes land, « jeere »
   is written over the copy. Then the drawing becomes the photo: the strands turn into windows onto it, her head and
   shoulders and then the rest of the room are painted in with wide bristly strokes, and the black lifts. On wide
   screens the copy follows the two halves: « Vous imaginez la boutique. » while it is drawn, « Jeere la rend réelle. »,
   one line and « Créer ma boutique » (to the editor) as the photo arrives; then « Revoir ». Under 5 s in all.
   See [Idea to store](#idea-to-store-animation).
2. Tout-en-un: online store, payments, orders and stock, sell everywhere, everything included.
3. Aujourd’hui / Avec Jeere.
4. Pourquoi Jeere: nine common complaints about the big e-commerce platforms (six from sellers,
   three from their customers), each with Jeere’s answer. Other platforms are not named on the page.
5. How it works, in four steps.
6. Delivery by commune: pick one of 13 communes and the receipt updates (fee, total, delay).
7. Templates: Plateau, Cocody and Treichville tabs switch the phone preview, a small store in real photos, each in
   its template's character and with its pop colours kept around the photos:
   - Plateau (« Maison Adjoa », editorial): « Nouvelle collection · Lagune » over a big portrait (blue gélé) in a
     turquoise frame, then « Robe portefeuille noire » and « Ensemble tunique et pantalon » full bleed, with
     the names and prices of the Maison Adjoa demo store.
   - Cocody (« awa beauté », soft and round): the banner portrait in a fuchsia ring, then « Beurre de karité »,
     « Savon noir », « Huile de coco » and « Baume à lèvres » on pastel mats.
   - Treichville (« Studio 225 », bold blocks): « DROP 07 », then « Sneakers blanches » (the shoes demo store's photo
     and price), « Casquette 225 »,
     « T-shirt oversize » and « Sac banane », each on a block of colour that sticks out like a hard shadow.
8. Diaspora mode (marked “coming soon”), with a delivery photo (a courier with the parcels) as the proof.
9. Pricing by sales volume, not features: every plan (even Gratuit) has every feature, human
   support on WhatsApp, import/export and one-tap pause. Plans differ only by orders a month
   (20, 150, 600, unlimited) and Jeere’s fee per online sale (3 %, 1 %, 0 %, 0 %).
10. FAQ.
11. Waitlist form (seller or diaspora buyer), with a WhatsApp share button after sign-up.

## Files

```
index.html   markup and French copy
i18n.js      English strings, the photos' alt texts included (French stays in the HTML)
style.css    tokens, layout, responsive rules (360 px first)
site.js      language, delivery demo, template tabs, waitlist form, hero canvas, hidden fallback
             for a photo that cannot load, scroll-in
anim/boutique.js  « De l’idée à la boutique »: the traced boutique lines, the brush-stroke builder, play
             and replay (the motion itself is CSS transitions in style.css, « Idea to store »)
img/boutique.webp, img/boutique-960.webp, img/boutique-2400.webp  the boutique photo, 1920×1080 (193 KB),
             960×540 (81 KB, phones and the reveal) and 2400×1350 (244 KB, large screens)
favicon.svg  the white cloud on pop blue #3657FF (tab icon)
apple-touch-icon.png  the same, 180×180, for home screens
img/og.jpg   share image: a 1200×630 screenshot of the top of the page, Hibiscus swatch, reduced
             motion, JPEG quality 86
creer/img/demo/…  the photos, shared with the store builder (not copied: see Photos)
```

Plain static files, no build step, no library. Fonts from Google Fonts (Poppins, plus Montserrat for ɛ, ɔ and ŋ):
the only requests to another site; every image is local. Animations are CSS (plus SVG built by a small script for
« De l’idée à la boutique ») and respect reduced motion.
Check 360, 390, 768 and 1440 px before publishing; there should be no horizontal scroll on a phone.

## Photos

The example stores on the page use the store builder's demo photos (`creer/img/demo/`, WebP, from
Unsplash, also credited in `creer/img/demo/CREDITS.md`), referenced from here with relative paths
(`creer/img/demo/<niche>/<file>.webp`): nothing is copied and nothing is loaded from Unsplash.

- **Markup**: `<img>` with `width` and `height` (the file's own size, so nothing jumps while it
  loads), `decoding="async"`, `object-fit: cover` and an `object-position` per tile in `style.css`.
  The hero's photo loads at once (it is on the first screen); the mock-ups and the diaspora photo
  are `loading="lazy"`, so the first screen costs two photos (the portrait in the ring, 86 KB, and the karité on the
  card, 67 KB) and the Cocody and Treichville
  tabs load theirs when they are opened (13 photos, 887 KB in all).
- **Alt texts**: the hero canvas and the diaspora card are hidden from screen readers
  (`aria-hidden`), so their photos have `alt=""`. The template panels are read, so each photo has a
  short alt (« Femme au gélé imprimé bleu »…), in English in `i18n.js` (`mini.*.a*`).
- **A photo that cannot load** (missing, offline) is hidden by `site.js`: its colour tile, ring or
  frame shows alone, never a broken image.
- **Contrast**: the white « Nouvelle collection » and « Lagune » on the Plateau portrait stay at
  4.8:1 or better on every pixel behind them (scrim included), at 360, 390, 768 and 1440 px, in FR
  and EN.
- To change a photo, pick another file in `creer/img/demo/` (its size, alt and credit are in the
  builder's catalogue), update `src`, `width`, `height`, the alt in both languages and the table
  below.

| File | Size | Photographer | Photo |
| --- | --- | --- | --- |
| `beauty/beurre-karite-fouette.webp` (hero card « Beurre de karité brut », Cocody) | 1000×1250, 67 KB | [Alex Bayev](https://unsplash.com/@alexbayev) | [Unsplash](https://unsplash.com/photos/a-bowl-of-food-that-is-on-a-table-dmusxNBR2hk) |
| `fashion/hero.webp` (Plateau) | 1600×1600, 107 KB | [Ben Iwara](https://unsplash.com/@1hundredimages) | [Unsplash](https://unsplash.com/photos/woman-in-blue-headwrap-in-lagos-VFiTzNzaTeU) |
| `fashion/robe-portefeuille.webp` (Plateau) | 1000×1250, 28 KB | [McFollis](https://unsplash.com/@thisismcfollis) | [Unsplash](https://unsplash.com/photos/young-woman-in-black-dress-and-glasses-on-blue-background-4myUEOinXxs) |
| `fashion/ensemble-tunique-pantalon.webp` (Plateau) | 1000×1250, 146 KB | [Delight Dzansi](https://unsplash.com/@alkebulanprints) | [Unsplash](https://unsplash.com/photos/a-person-in-a-colorful-dress-FiggxDNdkUs) |
| `beauty/serum-eclat-baobab.webp` (hero ring) and `beauty/masque-argile.webp` (Cocody banner) | 1000×1250 | see `creer/img/demo/CREDITS.md` | — |
| `beauty/savon-noir-karite.webp` (Cocody) | 1000×1250, 58 KB | [Miguel Constantin Montes](https://unsplash.com/@createwithconstantin) | [Unsplash](https://unsplash.com/photos/a-gray-book-sitting-on-top-of-a-table-next-to-flowers-x4021J6aHfw) |
| `beauty/huile-coco-vierge.webp` (Cocody) | 1000×1250, 102 KB | [Tijana Drndarski](https://unsplash.com/@izgubljenausvemiru) | [Unsplash](https://unsplash.com/photos/white-powder-in-clear-glass-jar-beside-brown-wooden-spoon-Bb8_yBkb_6E) |
| `landing/baume-levres.webp` (Cocody) | 800×1000, 37 KB | [lo lindo](https://unsplash.com/@lolindo) | [Unsplash](https://unsplash.com/photos/person-holding-red-and-silver-round-container-tF4SaFELfAI) |
| `shoes/sneakers-basses-blanches.webp` (Treichville) | 1000×1250, 43 KB | [Ervan M Wirawan](https://unsplash.com/@ervan_me) | [Unsplash](https://unsplash.com/photos/a-pair-of-white-shoes-sitting-on-top-of-a-black-bag-aC8CeQy5S-I) |
| `landing/casquette.webp` (Treichville) | 800×1000, 14 KB | [kofa boyah](https://unsplash.com/@kofaboyah) | [Unsplash](https://unsplash.com/photos/a-man-in-a-red-hat-looks-away-X038pJ3BBiI) |
| `landing/tshirt.webp` (Treichville) | 800×1000, 54 KB | [tian dayong](https://unsplash.com/@tonnnyj) | [Unsplash](https://unsplash.com/photos/a-white-t-shirt-hanging-from-a-tree-in-the-woods-CfZ4Y5WIYxc) |
| `landing/sac-banane.webp` (Treichville) | 800×1000, 100 KB | [StartVisuals](https://unsplash.com/@startvisuals) | [Unsplash](https://unsplash.com/photos/a-pink-purse-sitting-on-top-of-a-white-bench-kYQ2uqYm0aY) |
| `landing/livraison.webp` (diaspora proof) | 800×1000, 45 KB | [Luke Minnaar](https://unsplash.com/@lukeminnaar) | [Unsplash](https://unsplash.com/photos/a-man-with-a-box-on-a-city-street-xwbCZN4S9oA) |

The boutique in « De l’idée à la boutique » is its own file, `img/boutique.webp` (1920×1080, WebP q80, 193 KB),
`img/boutique-960.webp` (960×540, 81 KB, used up to 599 px wide through `<picture>`, and by the reveal) and
`img/boutique-2400.webp` (2400×1350, q78, 244 KB, picked by `srcset` on large or dense screens), `loading="lazy"`
with its `width` and `height`. It was cropped from the 2400×1600 Unsplash download (y 200 to 1550). Brand text was
softly blurred (the biscuit box at the bottom left, one jar label), the mobile-money sign at the top right got a wide,
greyed blur so it reads as an out-of-focus pale object, and the misspelt print on her T-shirt was lifted out (a
brightness-max filter keeps the cotton's folds), so nothing readable is left. The credit sits on the photo, bottom right: « Photo : Ali Mkumbwa / Unsplash ». It was
taken in Dar es Salaam (Tanzania), not Abidjan; replace it with a real Jeere seller's boutique when there is one, and
retrace the lines (see below).

| File | Size | Photographer | Photo |
| --- | --- | --- | --- |
| `img/boutique.webp`, `img/boutique-960.webp`, `img/boutique-2400.webp` (« De l’idée à la boutique ») | 1920×1080, 193 KB / 960×540, 81 KB / 2400×1350, 244 KB | [Ali Mkumbwa](https://unsplash.com/@mkumbwajr) | [Unsplash](https://unsplash.com/photos/a-woman-sitting-at-a-counter-in-a-store-EOkN2pRjFsg) |

Known weak spot: the delivery photo was taken in South Africa, not West Africa (nothing better was
found on Unsplash); replace it with a real Jeere delivery photo when there is one.

## Idea to store animation

`anim/boutique.js` (classic script, deferred, no library) builds the drawing in idle time
(`requestIdleCallback`, a line at a time) as soon as the section is within a screen of the viewport, and plays it
once when 40 % of it is on screen (IntersectionObserver); « Revoir » plays it again.

- **The lines** (`LINES`) are traced by hand on the photo, in its own pixels (1920×1080): about 80 lines, loops and
  rows of products (ceiling, uprights, shelves, the seller, the products, the counter…), each with a start time, a
  duration, a weight and a number of strands. The SVG uses `preserveAspectRatio="xMidYMid slice"`, exactly like the
  photo's `object-fit: cover`, so the drawing stays on the photo at every size (on phones both crop to the seller).
  Her face is only the head, the jaw and two solid drops for the eyes: no nose or mouth, the photo's smile does that.
- **The brush** copies the logo (the cloud and the wordmark): each line becomes a bundle of 2 to 5 strands (seeded,
  so the drawing is the same on every visit), all opaque and about the same weight (2.2 to 3 px on screen, 1.8 to
  2.4 px for small details), about two widths apart from centre to centre, each drifting slowly sideways so
  neighbours touch and cross now and then, landing and lifting a little apart. Where the brush lifts on the strong
  lines the strands run on, fan out a little and end in round drops (a zero-length segment with a round cap), with a
  couple of loose hairs. No filter. Phones (stage under 700 px) get one strand fewer and no loose hairs.
- **The motion** is CSS: each strand is a single dash (`pathLength="1"`) slid in with `stroke-dashoffset`, with its
  own delay and duration (ease-out), in drawing order: the room, the shelves, the seller, the details. About 2.9 s of
  drawing; « jeere » (the page's `#wordmark`, in the copy) is written with a `clip-path` wipe as the last strokes land;
  a 0.7 s hold; then a 1.3 s reveal; about 4.9 s in all.
- **The reveal** is four static photo layers over a black cover, each masked once and then only faded (composited):
  the strands themselves (windows onto the photo, so the lines take the photo's colours while the cream ink fades),
  then three bands of wide strokes by distance from her face, each a big brush made of wide strands side by side
  with combed, broken edges. The first band also holds a filled head-and-shoulders silhouette, so her face always
  arrives as one patch of skin, never as features cut out of black, and the drawn eyes leave before it. The cover
  then lifts off the real `<img>` underneath, and the reveal layers fade off it. The reveal layers use the 960 px
  photo: under moving strokes for a second it does not show, and being smaller than the page's `<img>` it never
  becomes the page's largest paint.
- **LCP**: the `<img>` is never hidden: it stays painted at full opacity under the black cover (`.bt__cover`, made by
  the script), so when the section is already on screen at load it is the LCP at once (about 0.4 to 0.7 s measured at
  1024×1366, 1280×1400 and 2560×1440, the same as without the script).
- **Copy** (wide screens, 1280 px and up, where it sits on the photo): the eyebrow and « Vous imaginez la boutique. »
  come in with the drawing, « Jeere la rend réelle. », the line and the button with the photo. Tabbing into the section
  shows everything at once. From 1280 px the photo frame is moved 12 % to the right (its right edge is cropped; the
  drawing moves with it) and the copy sits on solid black and a strong left gradient: the worst glyph column is 4.5:1
  or better at 1280, 1440 and 1920. Under 1280 px the copy sits on black under the stage.
- **Speed**: `PACE`, `HOLD` and `REVEAL` set the timing. About 320 paths on desktop and 250 on phones (strands, drops,
  masks); the ink is split over three stacked SVG layers (room and shelves, the seller, the details) plus one for the
  eyes, so a finished layer is not repainted; the photo layers are painted one after another during the hold at a
  near-zero opacity, so the reveal itself is opacity only. If the median frame of the first 40 (after the first 10) is
  over 21 ms, the stage gets `is-slow` and the reveal is a plain crossfade from the drawing to the photo. Measured in
  headless Chromium with software raster and compositing (no GPU, the worst case), no long tasks from scroll-in to the
  end: 55 fps drawing and 52 to 59 fps revealing at 1440×900; 54 / 35 fps at 1920×1080 (compositing nine full-HD layers
  in software); 58 / 60 fps on a 390 px phone emulation with the CPU slowed 4×.
- **Without JavaScript, with reduced motion, or if the script fails** the section is simply the photo, « jeere », the
  text and the button: only the script adds the cover, and an error while building removes it. If the photo cannot
  load, the drawing stays.
- **To change the photo**: replace the three files, then retrace `LINES` and `SILHOUETTE` on it (load the page, add
  `is-draw` to `[data-bt-stage]`, hide `.bt__cover` and compare), and update the alt, the credit and the table above.

## To do before sharing

- Pick the domain: `jeere.com` is taken; `jeere.shop`, `jeere.app` and `getjeere.com` were
  free on 3 November 2026 (GoDaddy). `.ci` must be checked with the Ivorian registry. The page
  uses `jeere.shop` in the examples; change it if you choose another.
- Add the @annklyy links (TikTok, Instagram) to the footer once you start posting.
