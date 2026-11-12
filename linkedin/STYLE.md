# Kreeative LinkedIn style guide

Written from what is in `./assets` and `./docs/DESIGN.md`: the site’s design tokens, the
self-hosted fonts, the logo files, the social preview images (`assets/img/og/*.jpg`) and
the 15-page Brand Collab Guide (`assets/guides/`), which is the closest thing to a past
carousel. Nothing here is invented; where something is missing it is listed at the end.

## 1. Colours

Kee’s personal palette, sampled from the media kits in `assets/img/shop/` (Minimal Brown,
Soft Blue & Cocoa, Pink Scrapbook) and the Brand Collab Guide. This is the LinkedIn palette.

| Role | Hex | Where it comes from |
|---|---|---|
| **Ivory** (main ground) | `#fdfbf7` | a light white cream, lighter than the Cocoa kit `#f9f3ee` |
| Cream, deeper (cards, bands) | `#ede5de` | Minimal Brown kit |
| **White** (second ground, cards) | `#ffffff` | the kits’ white panels |
| **Deep brown** (ink: headlines, body) | `#321c14` | the darkest brown in the kits: the Cocoa kit lettering |
| Brown, secondary text | `rgba(50,28,20,.66)` | |
| Brown, labels | `rgba(50,28,20,.46)` | |
| **Pink, baby bright** (fills, highlights, pills) | `#ffb3d1` | a brighter take on the Pink Scrapbook kit ground |
| **Pink, accent** (one italic word, kickers) | `#ff0090` on cream and white; `#ffb3d9` on brown | `--c-pink` from the site; the light tint for dark pages |
| Pink, small text | `#b0005f` | `teach.css`, the deep rose of the pink kit |
| Hairlines | `rgba(50,28,20,.16)` on cream, `rgba(255,255,255,.16)` on brown | the guide’s grid lines |

Dark pages use **deep warm brown `#321c14`** as the ground with ivory text, instead of black.

Contrast (WCAG): deep brown on ivory 15.9:1 · deep brown on baby pink 9.4:1 · `#ff0090` on ivory
3.5:1 (display sizes and kickers only, never body) · `#b0005f` on ivory 7.3:1 · ivory on
deep brown 15.9:1 · `#ffb3d9` on deep brown 11:1.

Rule: one accent only. Pink carries one italic word in a headline, the kicker above it and
a footer link. Baby pink is a surface (a pill, a highlight behind a placeholder, a band), not
a text colour. Never pink body text.

## 2. Type

All self-hosted in `assets/fonts/` (woff2), licences in README.

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display / headlines | **Fraunces** | 300 (Light), italic 300 for the accent word | letter-spacing −0.04em to −0.06em, line-height 1.05 to 1.15 |
| Body | **Inter** | 400, 500 for emphasis, 600/700 sparingly | letter-spacing −0.03em, line-height 1.4 to 1.6 |
| Kickers, labels, footer, page numbers | **DM Mono** | 400 | UPPERCASE, letter-spacing 0.12em to 0.2em |
| Phone-menu style | Inter Tight 600 | | not needed on LinkedIn |

Sizes on a 1080-wide canvas (matches the guide at 1080 × 1350):

| Element | Size |
|---|---|
| Carousel hook (page 1) | 112 to 128px Fraunces |
| Carousel page headline | 72 to 88px Fraunces |
| Body | 36 to 40px Inter (minimum 32px anywhere) |
| Kicker | 26 to 28px DM Mono, uppercase |
| Footer | 22 to 24px DM Mono, uppercase, 40% opacity |

Banner (1584 × 396): headline 64 to 76px, kicker 22px, footer 20px.
Featured covers (1200 × 627): headline 72px, kicker 24px.

## 3. Grid and margins (1080 × 1350)

Copied from the guide pages:

- Outer margin **108px** left (there is a vertical hairline at x = 108 running full height),
  **72px** right. Content column is 108 → 1008.
- Top band: a horizontal hairline at y = 108, handle or label top-right at y = 68.
- Bottom band: hairline at y = 1242, footer at y = 1292: left `BRAND COLLAB GUIDE` style
  label, right `01 / 15` page number.
- The headline block sits in the lower half of the page on a hook, upper half on a content page.
- Section breaks inside a page are a full-width hairline.

For single images the same frame applies (108 / 72 margins, hairlines, footer).

## 4. Dark and light pages

The guide alternates a dark cover with light content pages. On LinkedIn: **page 1 brown,
content pages ivory (or white for mock UI), last page brown**. Single images default to
ivory. Before/afters: ivory with white panels.

## 5. Photos, mockups, icons

- Phone mockups: a modern phone drawn in CSS (`.phone` in `_shared/kee.css`): dark metal edge,
  side buttons, island, status bar and home bar. Apple’s official bezels are not used: their
  licence only covers mock-ups of apps that run solely on Apple systems, and these are web apps.
  Screens come from `assets/img/sites/*-phone-*.webp` or are drawn as original mock UI.
- **Real screens, not drawn ones.** Kee’s own products are shown with real captures in
  `_shared/img/`: Rich & Friends (Goals, Home, Board, from the app’s own `shoot-store.mjs`
  with its demo data) and JEERE (sign-up, Produits, the Chez Awa storefront from the live
  prototype). Screens about payment, money or showing a person are left out. Drawn mock UI is
  only for concepts that are not Kee’s products (the Atelier Coco salon, the booking form) and
  for wireframes, and is labelled.
- Photos: only Kee (`assets/img/portrait-*.webp`, black and white). Product photos only from
  the case-study assets.
- Icons: Phosphor, inline SVG, `currentColor`, 24 to 32px (`assets/icons/`).
- Decorations used on the site: the dotted pixel strip (`assets/img/dots.svg`), the diagonal
  meteor streaks, dashed-border pills. Use the pixel strip sparingly as a footer band.
- Placeholders in copy: shown in brackets with a baby pink highlight (`#ffb3d1` on ivory,
  `rgba(255,179,209,.25)` on brown), as the guide does.

## 6. Signature and footer

- Top-right: `@aissakee` in the guide (Instagram/TikTok handle). For LinkedIn use **KEE · KREEATIVE** in DM Mono.
- Bottom-left: the series or post label in DM Mono uppercase. Bottom-right: page number `01 / 08`.
- Last carousel page (brown): the K mark in cream (`logo-512.webp` inverted), on cream pages in brown, “Follow Kee for design, tech and building in public”, “Save this”, and `kreeative.xyz`.
- The K mark never sits closer than its own height to other elements.

## 7. Voice on slides

Short lines. One idea per slide. Headline in Fraunces with one pink italic word. No em dashes.
French posts entirely in French.

## 8. What is missing in ./assets

- **No portfolio PDF and no past LinkedIn carousels.** The Brand Collab Guide is the only
  multi-page document; the style above is taken from it and from the OG images.
- **No `./assets/jeere`.** JEERE posts follow the live site (jeere.kreeative.xyz and its
  `rainbow.css`): **black and white everywhere**, Poppins for everything, and a **seven-colour
  rainbow only on buttons and the logo**: pink-red `#E8467C`, orange `#F08A3C`, yellow `#F0C414`,
  green `#22C97E`, blue `#1E9BE0`, violet `#6A4CFF`, magenta `#C13CE0` (deeper versions for
  rainbow text on white). Buttons on white: white fill, rainbow edge, rainbow letters. The cloud
  logo is in `_shared/jeere-logo-rainbow.svg` (and plain black in `jeere-logo.svg`). Confirm before posting.
- **No lettering sketches or process files** for Lyzma, The Bakery or GloryWalk: only the
  final brand images in `assets/img/case-*.webp` and `project-*.webp`. Sketch slides will
  need your files or will be marked as placeholders.
- **No Rich & Friends screens at phone size** except the live-site screenshots (`site-rich-phone-*.webp`).

## 9. How the files are built

- `_shared/kee.css` holds every token and component, including the original mock UIs
  (Rich & Friends screens, JEERE shop, wireframes, a neutral chat, the Atelier Coco concept
  salon, booking forms). Change a colour there and re-render: every post follows.
- `_build/build.py` holds the slide text, alt text and placeholders and writes each post’s
  `source.html` and `copy.md`. Captions come from `CALENDAR.md`.
- `_build/render-all.mjs` renders PNG and PDF with Playwright (`node _build/render-all.mjs M1-02`
  for one post), and `_build/contact_sheet.py` rebuilds `CONTACT_SHEET.png`.
