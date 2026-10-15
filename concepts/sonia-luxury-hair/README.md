# Sonia Luxury Hair — concept by Kreeative

A one-page proposal for **Sonia Luxury Hair**, the hair boutique of the influencer Sonia
(TikTok [@sonia110.camaraa](https://www.tiktok.com/@sonia110.camaraa)): a new identity and an
online shop that take the brand to the luxury level it is aiming for. **This is a design
proposal, not the official site.** French by default (Côte d’Ivoire, prices in F CFA), with an
English version.

Live (unlisted): https://kreeative.xyz/concepts/sonia-luxury-hair/

## Ground rules

- Private proposal: `<meta name="robots" content="noindex, nofollow">`, not linked from the
  portfolio and not in the sitemap. Keep the concept bar and the footer note.
- Nothing is sent or stored. The bag adds up prices in the page and checkout is switched off;
  the newsletter and “Rejoindre le Cercle” only show a message.
- The reviews are samples written for the concept, and the page says so.

## Identity

- **Wordmark**: SONIA in Bodoni Moda capitals with wide letter spacing, LUXURY HAIR underneath
  in small Jost capitals spaced even wider. Pink on black, black on pink, gold on white.
- **Monogram**: a Bodoni “S” in a ring of text (SONIA · LUXURY HAIR), for stickers, tags,
  the favicon and social posts.
- **Palette**: hot pink `#e97db0` (from the shop’s pink storefront and the campaign photos),
  rose `#eaa2c1`, blush `#f8dbe6`, ink `#141012`, gold `#c9a45c`, and a deep pink `#a8285f`
  for text on light pink (4.9:1).
- **Packaging**: a black and a white hang tag on a gold rail (the white one has boxes for
  style, length and origin) and a white bag with pink rope handles and a gold logo.
- **Motto**: “Une belle chevelure n’est pas une dépense, c’est un investissement”, as written
  on the boutique’s window.

## Page

1. **Hero**: SONIA set as wide as the screen in white on hot pink, with the model in front of
   the letters (after the “Mulans” reference layout). `site.js` sizes the name.
2. **Marquee** of short promises.
3. **Nos best-sellers**: four products cut out on white, with tags, favourites and the bag.
4. **Acheter par catégorie**: five pink circles (bundles, wigs, closures and frontals, satin
   bonnets, accessories).
5. **Campagne 01 · L’édition Rose**: an editorial block for the ready-to-wear wigs.
6. **Textures**: the four textures on a gold ring, numbered.
7. **Trouvez votre longueur**: pick 12″ to 30″; the hair on the drawing grows to that length,
   with the length in cm, a line about it and how many bundles make a full look.
8. **La devise** and three promises.
9. **L’emballage**: the hang tags and the bag, drawn in HTML/SVG.
10. **Le Cercle Sonia**: a loyalty programme in three levels (Rose, Or, Diamant), as on
    The Ivory Sukundu.
11. **Avis**, then **L’univers Sonia**: six posts set in the new identity and a link to TikTok.
12. **Footer**: newsletter, links and the name edge to edge.

## Stack

Plain static HTML, CSS and JS, no build step. Fonts from Google Fonts (Bodoni Moda, Jost);
animations with [Motion](https://motion.dev) 13.4.3 from jsDelivr, with a reduced-motion
fallback and a 3-second safety timeout.

```
index.html     markup, French content
i18n.js        every string in French and English
style.css      tokens, layout, responsive rules
site.js        language, header, bag, favourites, length guide, forms, marquee, Motion
favicon.svg    the S monogram
img/cut/       cut-out hero, products, categories and textures (WebP with transparency)
img/photos/    campaign and social photos (WebP)
img/og.jpg     share image (a screenshot of the hero)
```

Check 1440 px and 390 px before publishing; there should be no horizontal scroll on a phone.
Add `?lang=en` to open the English version.

## Images

**All photos are placeholders taken from Pinterest, at the client’s request, to show the
direction.** They belong to their owners and are not licensed for this use: keep the page
private, and replace every one with Sonia’s own photos (ideally Sonia herself in the hero)
or licensed photos before the site goes public. They were chosen without other brands’ logos
or watermarks; the cut-outs were made with [rembg](https://github.com/danielgatis/rembg)
(BiRefNet models).

| Files | Image on Pinterest (`https://i.pinimg.com/originals/…`) | Found with the search |
| --- | --- | --- |
| `img/cut/hero-model-*` | `24/c5/d1/24c5d1e1192e63a5773bab8d5a503e7c.jpg` | black woman sleek straight wig pink background |
| `img/photos/campaign-*` | `85/b5/59/85b5596f9b7eb0dff85d8795c99bd03b.jpg` | black woman sleek straight wig pink background |
| `img/photos/post-profile-*` | `3e/03/8f/3e038fc830e0eebfb2d5d5655b786466.jpg` | black woman sleek straight wig pink background |
| `img/photos/post-back-*` | `45/33/84/453384c92dcee0e113ab48528af42807.jpg` | wig photoshoot pink hair clips black girl |
| `img/photos/post-comb-*` | `8f/06/bc/8f06bcbd2ff448885520fc9d5eea624f.jpg` | wig photoshoot pink hair clips black girl |
| `img/cut/prod-wave-*` | `75/3b/98/753b98110af9d3fefa46fcbb839b065a.jpg` | hair bundles product photography white background |
| `img/cut/prod-lisse-*` | `ca/d4/a3/cad4a38657ad75911a2805c60d1fc6ff.jpg` (736x) | hair bundles product photography white background |
| `img/cut/cat-meches-*`, `img/photos/post-bundle-*` | `de/f8/d5/def8d5c0eb1957eab421fc8f6d339df2.jpg` | hair bundles product photography white background |
| `img/cut/textures-*` | `1e/92/7c/1e927c473d53ee19686a446c4dd81007.jpg` | hair bundles product photography white background |
| `img/cut/prod-frontal-*` | `03/86/59/03865972b5c4037e02cbf1a73bb07f50.jpg` | lace frontal closure product photo |
| `img/cut/cat-frontals-*` | `d2/c6/f1/d2c6f1bc9805913fcae18e484b05b541.jpg` | lace frontal closure product photo |
| `img/cut/prod-perruque-*`, `img/cut/cat-perruques-*` | `e9/e1/06/e9e1062695e5d43fdea5c9b6b1a12ced.jpg` | lace frontal closure product photo |
| `img/cut/cat-bonnets-*` | `2a/ec/bb/2aecbb977e27a027a80337dd07ff527c.jpg` (736x) | pink satin bonnet product photo |
| `img/cut/cat-accessoires-*` | `38/8b/08/388b085e971c41e942b4f3c85e22a7cd.jpg` | pink hair clips flatlay |

`(736x)` means the image is at `https://i.pinimg.com/736x/…` instead of `originals`.
