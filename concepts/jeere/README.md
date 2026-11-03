# JEERE — landing page and waitlist

The first public face of **JEERE**, the store builder for people who sell on WhatsApp
(brainstorm of 2 November 2026). It pitches the product to Abidjan sellers and collects a
waitlist that doubles as the pool for the seller interviews and the 50-store concierge pilot.
French by default (Côte d’Ivoire, prices in FCFA), with an English version.

Live (unlisted): https://kreeative.xyz/concepts/jeere/ · English: add `?lang=en`

## Ground rules

- Private for now: `<meta name="robots" content="noindex, nofollow">`, not linked from the
  portfolio and not in the sitemap. Remove the `robots` meta and add it to `sitemap.xml` when
  you start sharing it (build in public, bio links).
- Every store, product, price, fee and person on the page is a made-up example (Awa Beauté,
  Maison Adjoa, Studio 225, delivery fees by commune). The plans are the brainstorm’s sample
  prices, labelled as “planned, may still change”.
- No logos of Wave, Orange, MTN or Moov are used: they appear as plain text.

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

- **Wordmark**: geometric capitals drawn in SVG (`#wordmark` in `index.html`). The bar that
  runs through the double E links them, for the link between a chat and a sale; it is the one
  place the accent always appears. The monogram (favicon) is the linked EE on black.
- **Colours**: JEERE itself is black and white, so the sellers’ photos and stores bring the
  colour. White `#FFFFFF`, grey `#F5F5F3` / `#EBEBE8`, ink `#111111`, muted `#5E5E5E`, and one
  accent used sparingly: deep green `#17594A` (8.2:1 on white), with `#8FCDB6` on black.
  Navy is ready as the alternative: swap the four `--accent*` values at the top of `style.css`
  for the ones in the comments (`#1E2E5A`, `#131E3D`, `#E3E8F3`, `#A7B6E0`).
  Buttons are black; the accent marks labels, the italic in the headline, ticks, the
  “payment received” bubble and focus rings. The demo stores keep their own colours.
- **Type**: Playfair (display, SIL OFL) and Onest (text, SIL OFL). Both cover French accents
  and ɛ, ɔ and ŋ, checked glyph by glyph; most popular display faces do not (Fraunces,
  Bricolage Grotesque, Instrument Serif and DM Serif Display all lack ɛ and ɔ).

## Page

1. Hero: headline, the store on a phone (Plateau template) and a WhatsApp order that plays out
   in three bubbles, then the payment methods.
2. Aujourd’hui / Avec JEERE.
3. Three promises.
4. How it works, in four steps.
5. Delivery by commune: pick one of 13 communes and the receipt updates (fee, total, delay).
6. Templates: Plateau, Cocody and Treichville tabs switch the phone preview.
7. Diaspora mode (marked “coming soon”).
8. Pricing: Gratuit, Essentiel, Pro, Business.
9. FAQ.
10. Waitlist form (seller or diaspora buyer), with a WhatsApp share button after sign-up.

## Files

```
index.html   markup and French copy
i18n.js      English strings (French stays in the HTML)
style.css    tokens, layout, responsive rules (360 px first)
site.js      language, delivery demo, template tabs, waitlist form, scroll-in
favicon.svg  the EE monogram
img/og.jpg   share image (a screenshot of the hero)
```

Plain static files, no build step, no library. Fonts from Google Fonts. Animations are CSS
only and respect reduced motion. Check 390 px and 1440 px before publishing; there should be
no horizontal scroll on a phone.

## To do before sharing

- Pick the domain: `jeere.com` is taken; `jeere.shop`, `jeere.app` and `getjeere.com` were
  free on 3 November 2026 (GoDaddy). `.ci` must be checked with the Ivorian registry. The page
  uses `jeere.shop` in the examples; change it if you choose another.
- Add the @annklyy links (TikTok, Instagram) to the footer once you start posting.
