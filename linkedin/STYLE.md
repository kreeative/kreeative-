# Kreeative LinkedIn style guide

Written from what is in `./assets` and `./docs/DESIGN.md`: the site’s design tokens, the
self-hosted fonts, the logo files, the social preview images (`assets/img/og/*.jpg`) and
the 15-page Brand Collab Guide (`assets/guides/`), which is the closest thing to a past
carousel. Nothing here is invented; where something is missing it is listed at the end.

## 1. Colours

| Role | Hex | Where it comes from |
|---|---|---|
| Ink / dark ground | `#0f0f0f` | `--c-black`, the guide pages, the OG images |
| Dark page (case studies) | `#262626` | `--c-page-dark` |
| Paper / light ground | `#fcfcfc` | `--c-page`, the guide’s light pages |
| Body text on dark | `#ffffff` at 100%, secondary at 60% (`rgba(255,255,255,.6)`) | guide subtitle |
| Body text on light | `#313336` | `--c-text` |
| Muted / labels | `rgba(255,255,255,.4)` on dark, `rgba(0,0,0,.4)` on light | `--c-text-40` |
| **Pink accent** | `#ff0090` | `--c-pink`, every italic word, every kicker |
| Pink highlight (light pages) | `#ffe0f7` | `--c-pink-border`, the `[placeholder]` highlight in the guide |
| Hairlines | `rgba(255,255,255,.12)` on dark, `rgba(0,0,0,.08)` on light | the guide’s grid lines |
| Surface 2 (cards) | `#f8f8f8` light, `#1a1a1a` dark | `--c-surface-2`, OG phone mockups |

Rule: one accent only. Pink carries one italic word in a headline, the kicker above it and
a footer link. Never pink body text. Contrast checked: white on `#0f0f0f` 19:1,
`#ff0090` on `#0f0f0f` 5.6:1 (fine for display and labels, not for long body),
`#313336` on `#fcfcfc` 11.6:1.

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

The guide alternates: dark (`#0f0f0f`) for the cover and chapter openers, light (`#fcfcfc`)
for content pages. On LinkedIn: **page 1 dark, content pages light, last page dark**.
Single images default to dark (it is the look of every OG image). Before/afters: light.

## 5. Photos, mockups, icons

- Phone mockups: black rounded phones (radius ≈ 44px on a 220px-wide phone) with a
  1px `rgba(255,255,255,.15)` border, screens slightly rotated or staggered, as in `og/home.jpg`.
  Screens come from `assets/img/sites/*-phone-*.webp` or are drawn as original mock UI.
- Photos: only Kee (`assets/img/portrait-*.webp`, black and white). Product photos only from
  the case-study assets.
- Icons: Phosphor, inline SVG, `currentColor`, 24 to 32px (`assets/icons/`).
- Decorations used on the site: the dotted pixel strip (`assets/img/dots.svg`), the diagonal
  meteor streaks, dashed-border pills. Use the pixel strip sparingly as a footer band.
- Placeholders in copy: shown in brackets with a pink highlight (`#ffe0f7` on light, a
  `rgba(255,0,144,.15)` tint on dark), exactly as the guide does.

## 6. Signature and footer

- Top-right: `@aissakee` in the guide (Instagram/TikTok handle). For LinkedIn use **KEE · KREEATIVE** in DM Mono.
- Bottom-left: the series or post label in DM Mono uppercase. Bottom-right: page number `01 / 08`.
- Last carousel page (dark): the K mark (`assets/img/logo-dark-512.webp` on dark,
  `logo-512.webp` on light), “Follow Kee for design, tech and building in public”, “Save this”, and `kreeative.xyz`.
- The K mark never sits closer than its own height to other elements.

## 7. Voice on slides

Short lines. One idea per slide. Headline in Fraunces with one pink italic word. No em dashes.
French posts entirely in French.

## 8. What is missing in ./assets

- **No portfolio PDF and no past LinkedIn carousels.** The Brand Collab Guide is the only
  multi-page document; the style above is taken from it and from the OG images.
- **No `./assets/jeere`.** The live JEERE site (jeere.kreeative.xyz) has its own look:
  ink `#111111` on white `#FFFFFF` and warm grey `#F5F5F3`, **Poppins** for everything,
  an orange highlight `#EE5A2A`, and a set of six swatches (teal `#00BFCB`, green `#14C46C`,
  blue `#3657FF`, pink `#DE0F7B`, orange `#EE5A2A`, yellow `#FFB000`). Not used until you
  confirm, see the questions in chat.
- **No lettering sketches or process files** for Lyzma, The Bakery or GloryWalk: only the
  final brand images in `assets/img/case-*.webp` and `project-*.webp`. Sketch slides will
  need your files or will be marked as placeholders.
- **No Rich & Friends screens at phone size** except the live-site screenshots (`site-rich-phone-*.webp`).
