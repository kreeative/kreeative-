# Jessica’s Secrets — concept by Kreeative

A one-page concept for Jessica’s Secrets, a lingerie, swimwear and loungewear brand,
prepared by [Kreeative](https://kreeative.xyz). **This is a design proposal, not an
official store.** It is in French (Quebec) by default, with an English version.

Live: https://kreeative.xyz/concepts/jessicas-secrets/ (a copy of this folder in the Kreeative
portfolio repository, under `concepts/jessicas-secrets/`, so update both together).

## Ground rules

- Keep the "Concept préparé par Kreeative" bar, the footer note and
  `<meta name="robots" content="noindex">`.
- No real forms that collect data or payments. The bag adds up prices in the page
  and checkout is switched off. The newsletter form only shows a thank-you message
  once the address looks right and the box is ticked. Nothing is sent or stored.
- The reviews are samples written for the concept, and the page says so.

## Design

The layout follows the client’s "Transparency" mockup, section by section:

1. **Hero**: a full-width photo under a transparent header, a huge italic
   "Nouvelle collection" crossed by a scrolling pink ribbon, "Lingerie ——— Détente",
   a short paragraph and a white pill button. `site.js` sizes the title to fill the
   width in either language.
2. **Les nouveautés**: a large Instrument Serif italic title, as in the hero, and three
   product cards on white with a "style & confort" label across the left edge, then an
   outlined pill button.
3. **Catégories**: black and white photos in pink frames with pink tags (one wide tile,
   two small, two tall). Hovering a tile brings its colour back.
4. **À propos**: pink corner marks, a big pink italic title, a bold statement with
   outlined words, and the pink tulle set (an underwire bra with ribbon straps and bows,
   and a tie-side thong, embroidered with hearts) cut out on white beside three points.
5. **Nos chouchous**: a hot pink panel of white product cards with a grey caption strip
   and arrows to scroll.
6. **Avis**: two tilted pink ribbons crossing the section, and a review beside a
   heart-shaped photo with a scalloped edge.
7. **Le journal**: a photo beside four article rows, then a "Lire la suite" pill.
8. **Footer**: a charcoal panel with four columns, a newsletter field and the name set
   edge to edge in huge capitals.

Palette: hot pink `#f7509a` for panels, ribbons and display titles; a deeper
`#d92a7c` for pink text, tags and buttons on white (4.6:1 contrast); ink `#2e2e2e`;
charcoal `#303030` for the footer; white. Type from Google Fonts: Poppins (bold
uppercase titles with one word in italic, and all text) and Instrument Serif italic
(the hero, "Les nouveautés" and "À propos" titles), set tight: -0.045em between letters,
with a little word spacing added back so the words stay apart.

Every product card adds to the bag and to favourites. The page switches between French
and English with the FR/EN buttons (or `?lang=en`), and the choice is remembered on the
device.

## Stack

Plain static HTML, CSS and JS, with no build step.

```
index.html          markup, French content
i18n.js             every string in French and English
style.css           tokens, layout, responsive rules
site.js             language switch, header, bag, favourites, carousel, reviews, newsletter, ribbons, Motion
favicon.svg         heart-keyhole mark
img/photos/         hero, product, category, review and journal photos (WebP, two or three widths each)
img/og.jpg          social preview
```

### Photos

Most photos are free photos from [Pexels](https://www.pexels.com/license/); four category
tiles, the first four "Nos chouchous" cards and the pink set in "À propos" are reference
photos the client supplied. All are
listed under Photo credits below. The models are mainly Black women and other women of colour,
across a range of sizes. They were cropped to the shape each slot needs, given one light
grade and saved as WebP; the grade is kept light so skin tones stay true. The page picks
a size with `srcset` and `sizes`, and every image has `width` and `height` so nothing
jumps while it loads. The category tiles are turned black and white in CSS, as in the
mockup. The three new arrivals are shown on white, like the mockup's product shots: their
backgrounds were removed with [rembg](https://github.com/danielgatis/rembg) (the
BiRefNet portrait model) and the light grade was applied to the person only.

The crops stay off faces, because the Pexels License does not allow suggesting that the
people in a photo endorse a brand; the client's photos are cropped the same way. Before a
real launch these should be replaced with the brand’s own photography.

### Motion

Animations use [Motion](https://motion.dev) 13.4.3 (the framework-free build of
Framer Motion), loaded from jsDelivr: the hero entrance (the photo settles, the title
rises and the ribbon unrolls), reveals on scroll, the "À propos" set settling into
place, the bag drawer and the review change. The ribbons scroll with CSS. With
`prefers-reduced-motion`, or if the CDN fails, the page shows everything statically.
A 3-second safety timeout in `<head>` reveals the page if scripts never run.

## Run it locally

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Check 1440 px and 390 px wide before publishing. There should be no horizontal
scroll on a phone. Add `?lang=en` to the URL to open the English version.

## Photo credits

The photos in `img/photos/` are from [Pexels](https://www.pexels.com) and used under the
[Pexels License](https://www.pexels.com/license/), which allows free use without
attribution. They are credited here anyway, and were cropped and colour graded for this
page.

| Files | Photo on Pexels | Used for |
| --- | --- | --- |
| `img/photos/hero-wide-*.webp`, `img/photos/hero-tall-*.webp`, `img/photos/rosalie-*.webp` | [Studio shot of a young woman in black lingerie](https://www.pexels.com/photo/studio-shot-of-a-young-woman-in-black-lingerie-23831252/) | hero (16:10 and 9:16 for phones) and Rosalie (4:5, background removed) |
| `img/photos/margaux-*.webp` | [Woman in a black strapless bodysuit](https://www.pexels.com/photo/14122527/) | Margaux, 4:5, background removed |
| `img/photos/colette-*.webp` | [Model in white lace lingerie on a burgundy backdrop](https://www.pexels.com/photo/12698518/) | Colette, 4:5, background removed |
| `img/photos/camille-*.webp` | [Woman in a pink satin robe sitting on a bench](https://www.pexels.com/photo/6976227/) | Camille, 4:5 |
| `img/photos/ines-*.webp` | [Woman in a powder-pink bra and high-waist brief holding flowers](https://www.pexels.com/photo/7065200/) | Inès, 4:5 |
| `img/photos/lea-*.webp` | [Woman in a powder-pink seamless set with a tulip](https://www.pexels.com/photo/7065214/) | Léa, 4:5 |
| `img/photos/review-lace-*.webp` | [Black lace lingerie on a bed](https://www.pexels.com/photo/blacky-lacy-lingerie-on-bed-26968036/) | the lace in the review heart (1:1) |
| `img/photos/cat-swim-*.webp` | [Back view of a woman in a black swimsuit](https://www.pexels.com/photo/close-up-photo-of-woman-in-black-swimwear-8723411/) | swimwear tile, 4:3 |
| `img/photos/blog-mannequin-*.webp` | [Mannequin in black and white](https://www.pexels.com/photo/mannequin-in-black-and-white-20316833/) | journal, 1:1 |

### Photos supplied by the client

These were sent as references for the concept; where they come from is not recorded here.
**Confirm the right to use each one, or replace it, before the site goes live.**

| Files | Photo | Used for |
| --- | --- | --- |
| `img/photos/about-set-*.webp` | Pink tulle set embroidered with hearts, flat on a bed | "À propos": cut out with [rembg](https://github.com/danielgatis/rembg) (BiRefNet), the bed sheet and a gift card removed, and the two ribbon ends that ran off the photo finished with an angled cut |
| `img/photos/cat-bodys-wide-*.webp` | Woman kneeling in a black one-piece on a white background | bodysuits tile, 2:1, cropped below the face |
| `img/photos/cat-bras-tall-*.webp` | Close-up of a nude eyelash-lace bra under an open white shirt | bras tile, 3:5 |
| `img/photos/cat-lounge-knit-*.webp` | White ribbed knit top, printed-paper look | loungewear tile, 3:5, cropped inside the paper border |
| `img/photos/cat-briefs-satin-*.webp` | Black satin set with white lace, black and white | briefs tile, 6:5, cropped to the briefs |
| `img/photos/odette-*.webp` | Cream cable-knit cardigan with pink bows, pink tights, leg warmers and pointe shoes | Odette card, 4:5, cropped beside the face |
| `img/photos/clara-*.webp` | Pink ribbed cami and shorts with a white shrug, on pink | Clara card, 4:5, cropped below the face and inside the screenshot's arrows |
| `img/photos/gisele-*.webp` | Ivory ruffled satin bandeau and white knit shorts, on grey | Gisèle card, 4:5, cropped beside the face (small source, 300 px wide) |
| `img/photos/nina-*.webp` | The same kneeling black one-piece as the bodysuits tile | Nina card, 4:5, cropped below the face |

A fifth reference (jeans and underwear, black and white) is not used: the underwear
waistband carries another brand's name all the way round.

`img/og.jpg` is a screenshot of this page.
