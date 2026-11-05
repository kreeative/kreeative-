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
  The artisan's stall in the hero (« Votre boutique physique, maintenant en ligne ») is an Unsplash photo too (credited on the photo itself).

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
1b. (Now the hero, `#top`, before the sign-up card.) « Votre boutique physique, maintenant en ligne. »: a real
   artisan's stall (a basket weaver among her jars and gourds) is there first. Brush strokes in the logo's hand (every
   line a bundle of 2 to 5 opaque strands that drift and cross, a comb of loose strands ending in round drops, her eyes
   as two solid drops like the cloud's) trace it while the photo sinks into black, until only the drawing is left; «
   jeere » is written over the copy. Then a burst (a flash, streaks and drops of ink in the store's colours, the frame
   shakes) and the same stall comes back online: « Chez Awa » (its own basket mark, its name in Fraunces italic), a
   plain white store window laid out like the Tabouret concept, in black and white, with cut-out products in colour
   standing out of their cards in a scrolling row (the cards stay in the window, the objects go over its edges), the cart, a « Payé avec Wave » notice and the
   dock breaking out of its frame. The copy follows: « Votre boutique physique, » with the photo, « maintenant en ligne. », the line and «
   Créer ma boutique e-commerce maintenant » (to sign-up) with the store; then « Revoir ».
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
anim/boutique.js  the hero animation: the traced stall lines, the brush-stroke builder, the burst, play and
             replay (the motion itself is CSS in style.css, « Physical to online »)
img/boutique.webp, img/boutique-720.webp  the stall photo (portrait), 1080×1350 and 720×900 (phones)
img/shop/…   the online store's products: transparent cut-outs (WebP with alpha, 360 px) made
             from creer/img/demo photos with rembg (isnet-general-use)
favicon.svg  the white cloud on pop blue #3657FF (tab icon)
apple-touch-icon.png  the same, 180×180, for home screens
img/og.jpg   share image: a 1200×630 screenshot of the top of the page, Hibiscus swatch, reduced
             motion, JPEG quality 86
creer/img/demo/…  the photos, shared with the store builder (not copied: see Photos)
```

Plain static files, no build step, no library. Fonts from Google Fonts (Poppins, plus Montserrat for ɛ, ɔ and ŋ):
the only requests to another site; every image is local. Animations are CSS (plus SVG built by a small script for
the hero) and respect reduced motion.
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

The stall in the hero is its own file, `img/boutique.webp` (1080×1350, portrait) and `img/boutique-720.webp` (720×900,
up to 599 px wide through `<picture>`), loaded eagerly (it is the page's first paint). It is shown as a rounded card in
the same box as the online store that replaces it (the right-hand column from 1280 px, the stage below). Photo by Tuke
(@prince_edja on Instagram), credited on the photo with a link to his post. **Temporary file**: it was made from a
399×501 copy, upscaled, so it is soft; replace both files with the 1080×1350 original (same framing, so `LINES` stays
valid).

| File | Size | Photographer | Photo |
| --- | --- | --- | --- |
| `img/boutique.webp`, `img/boutique-720.webp` (the hero) | 1080×1350 / 720×900 | Tuke ([@prince_edja](https://www.instagram.com/prince_edja/)) | [Instagram](https://www.instagram.com/p/CnHB84TrQEX/?img_index=1) |
| `img/shop/*.webp` (the online store) | cut-outs of `creer/img/demo` photos | see `creer/img/demo/CREDITS.md` | — |

Known weak spot: the delivery photo was taken in South Africa, not West Africa (nothing better was
found on Unsplash); replace it with a real Jeere delivery photo when there is one.

## Physical to online animation (the hero)

`anim/boutique.js` (classic script, deferred, no library) builds the drawing in idle time (`requestIdleCallback`, a
line at a time) when the section is within a screen of the viewport, and plays it once when 40 % of it is on screen
(IntersectionObserver); « Revoir » plays it again. Classes on `.bt__stage`, motion in style.css (« Physical to online »):

- **is-real** (0.6 s): the photo alone; the eyebrow and « Votre boutique physique, » come in (wide screens).
- **is-draw** (about 3.2 s, `PACE`): the strokes draw in, in drawing order (the stall, him, the goods behind, the goods
  in front), and a black cover rises over the photo with the drawing (a first dim so the cream strokes read on it,
  then all the way down, an animation whose duration the script sets to the drawing's). **is-sign**: « jeere » is
  written over the copy as the last strokes land.
- **is-boom** (after a 0.35 s `HOLD`): the ink layers fly apart (scale and fade), a flash, about 34 streaks and drops
  in cream, white and grey flung out from the store's centre (`.bt__burst`, built once), the frame shakes.
- **is-shop** (+0.17 s): the store window pops in, then the cart, the « Coup de cœur » card, the dock and the Wave
  notice land one by one; the row of products scrolls (the script writes each card twice, the row slides by one copy's
  width, 34 s a lap). « maintenant en ligne. », the line and the button come in. **is-done** (+1.1 s, `BOOM`).

- **The lines** (`LINES`) are traced by hand on the photo, in its own pixels (1080×1350): about 55 lines and loops
  (the roof beam, the post, the platform and the mat, him with two solid drops for the eyes, the hanging bags and the
  painted cloths, the stacked bowls, the tall lidded baskets, the little pots, the round trays),
  each with a start time, a duration, a weight and a number of strands. The SVG uses
  `preserveAspectRatio="xMidYMid slice"`, exactly like the photo's `object-fit: cover`.
- **The brush** copies the logo: each line becomes a bundle of 2 to 5 seeded strands, all opaque and about the same
  weight, drifting so neighbours touch and cross, with a comb of strands ending in round drops where the brush lifts.
  Each strand is a single dash (`pathLength="1"`) slid in with `stroke-dashoffset`. Phones get one strand fewer.
- **The store** (`.bt__shop`, in the HTML, decorative, `aria-hidden`) sits beside the copy from 1280 px and fills the
  stage below. Its sizes follow its box (container queries, `cq` units); under 560 px of box (`@container shop`) the window
  takes the whole width. Everything is in Poppins except the store's name (Fraunces italic, loaded for those 7 letters only). Product cut-outs are WebP with alpha and a CSS `drop-shadow`.
- **LCP**: the `<img>` is visible from the start (eager, high priority): the cover only darkens it during the drawing.
- **Speed**: about 250 paths; the ink is split over three stacked SVG layers plus one for the eyes, so a finished
  layer is not repainted; the cover, the burst and the store only use opacity and transforms. If the median frame of
  the first 40 (after the first 10) is over 21 ms, the stage gets `is-slow`: no burst, a plain fade.
- **Without JavaScript** the section is the photo, the text and the button. **With reduced motion**, or if the script
  fails, it is the store, still, over the dimmed photo (`is-static`), its products not moving.
- **To change the photo**: replace the three files, then retrace `LINES` on it (load the page, add `is-draw` to
  `[data-bt-stage]`, remove the cover and compare), and update the alt, the credit and the table above.
- **Test**: `rev-test.js` (scratchpad) checks the photo at the start, the darkening, the black at the end of the
  drawing, the burst, the store and its scrolling row, replay, the title not jumping, reduced motion and no JS.

## To do before sharing

- Pick the domain: `jeere.com` is taken; `jeere.shop`, `jeere.app` and `getjeere.com` were
  free on 3 November 2026 (GoDaddy). `.ci` must be checked with the Ivorian registry. The page
  uses `jeere.shop` in the examples; change it if you choose another.
- Add the @annklyy links (TikTok, Instagram) to the footer once you start posting.
