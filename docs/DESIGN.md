# Kreeative — design reference

This site is a hand-written static rebuild of the original Framer site
(`kreeative.framer.website`, published May 2026). Every value below was read
from the original's rendered CSS so the rebuild matches it 1:1.

## Breakpoints

| Name    | Media query                               | Design width |
| ------- | ----------------------------------------- | ------------ |
| Desktop | `(min-width: 1200px)`                     | 1200 px      |
| Tablet  | `(min-width: 810px) and (max-width: 1199.98px)` | 810 px  |
| Phone   | `(max-width: 809.98px)`                   | 390 px       |

## Page frame

Every page is a flex column of white "cards" (`.card`: radius 24 px, section
shadow) separated by an 8 px gap inside an 8 px page padding. Light pages use
`#fcfcfc` as the page background; case studies and the 404 page use `#262626`
(`body.theme-dark`).

## Fonts (self-hosted in `assets/fonts/`)

| Family        | Weights | Used for                                   |
| ------------- | ------- | ------------------------------------------ |
| Fraunces      | 300     | All headings (h1 hero, h2, h3)             |
| Inter         | 400/500/600/700 | Body copy, labels, buttons, nav    |
| Inter Tight   | 600     | Phone menu links                           |
| DM Mono       | 400     | "SKILLS" label, experience dates           |
| Inter Variable| var     | Newsletter "coming soon" heading           |

Fraunces, Inter Tight and DM Mono are Google Fonts (OFL). Inter is the copy
Framer served (OFL). Metric-matched `*Placeholder` faces avoid layout shift.

## Colour tokens (`assets/css/base.css`)

`--c-black #0f0f0f` headings / footer · `--c-text #313336` body ·
`--c-page #fcfcfc` · `--c-page-dark #262626` · `--c-pink #ff0090` CTA ·
`--c-blue #09f` rich-text links · `--c-line #ededed` borders ·
`--c-dashed rgba(49,51,54,.3)` dashed borders · `--c-hairline rgba(0,0,0,.08)`.

## Type scale (`.t-*` classes)

| Class       | Font / weight | Desktop | Tablet | Phone | letter-spacing | line-height |
| ----------- | ------------- | ------- | ------ | ----- | -------------- | ----------- |
| `.t-display`| Fraunces 300  | 48      | 38     | 38    | -0.08em        | 1.2         |
| `.t-h2`     | Fraunces 300  | 44      | 40     | 32    | -0.06em        | 1.15        |
| `.t-h3`     | Fraunces 300  | 38      | 32     | 32    | -0.06em        | 1.2         |
| `.t-h4`     | Inter 400     | 24      | 24     | 22    | -0.04em        | 1.4         |
| `.t-body-l` | Inter 400     | 18      | 18     | 16    | -0.03em        | 1.65        |
| `.t-body-m` | Inter 400     | 16      | 16     | 16    | -0.03em        | 1.65        |
| `.t-caption`| Inter 400     | 14      | 14     | 14    | -0.03em        | 1.2         |
| `.t-link`   | Inter 400     | 15      | 15     | 15    | -0.04em        | 1.8         |
| `.t-mono`   | DM Mono 400   | 16      | 16     | 16    | -0.02em        | 1.25        |

## Animations (`assets/js/site.js`)

* `[data-appear="section|card|image|hero-image|scale|title|text|fade"]` —
  scroll-in reveals driven by an IntersectionObserver; the initial transforms
  copy the Framer appear presets (e.g. sections start at
  `translateY(50px) scale(.8) rotateX(5deg)`).
* `[data-split]` — the hero headline is split into letters that blur in.
* `[data-pixels]` — the animated dot strips (hero, testimonial, 404) are a
  `<canvas>` re-creation of Framer's "Pixel Canvas" component
  (4 px squares, 2 px gap).
* `.meteor` — the diagonal streaks in the hero (CSS keyframes, randomised in JS).
* Everything respects `prefers-reduced-motion`.

## Icons

Phosphor Icons (MIT), inlined as SVG so they take `currentColor`. Source
files live in `assets/icons/` (`*-regular.svg`, `*-fill.svg`).

## Images

Optimised WebP renditions live in `assets/img/` with the width in the file
name (`project-bakery-660.webp` …) and are referenced through `srcset`.
`og-image.jpg` is the social preview image.
