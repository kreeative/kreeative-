# JEERE — landing page and waitlist

The first public face of **JEERE**, the all-in-one commerce platform built for Africa: build and
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
  runs through the double E links them, for the link between a chat and a sale; in black on
  white and white on black. The monogram (favicon) is the linked EE, white on black.
- **Colours**: black and white only. White `#FFFFFF`, greys `#F5F5F3` / `#EBEBE8`, ink
  `#111111`, muted text `#5E5E5E`. No accent colour: the sellers’ photos and stores bring the
  colour, so only the demo stores and product pictures on the page are in colour.
- **Type**: Poppins (SIL OFL) for everything. Poppins has no ɛ, ɔ or ŋ (needed for Dioula and
  Bambara names), so the page also loads those six letters alone from Montserrat (SIL OFL), a
  few KB, and the browser uses them in place of the missing ones.

## Page

1. Hero: “Tout votre commerce, au même endroit”, the store on a phone (Plateau template) and a WhatsApp order that plays out
   in three bubbles, then the payment methods.
2. Tout-en-un: online store, payments, orders and stock, sell everywhere, everything included.
3. Aujourd’hui / Avec JEERE.
4. Three promises.
5. How it works, in four steps.
6. Delivery by commune: pick one of 13 communes and the receipt updates (fee, total, delay).
7. Templates: Plateau, Cocody and Treichville tabs switch the phone preview.
8. Diaspora mode (marked “coming soon”).
9. Pricing: Gratuit, Essentiel, Pro, Business.
10. FAQ.
11. Waitlist form (seller or diaspora buyer), with a WhatsApp share button after sign-up.

## Files

```
index.html   markup and French copy
i18n.js      English strings (French stays in the HTML)
style.css    tokens, layout, responsive rules (360 px first)
site.js      language, delivery demo, template tabs, waitlist form, scroll-in
favicon.svg  the EE monogram
img/og.jpg   share image (a screenshot of the hero)
```

Plain static files, no build step, no library. Fonts from Google Fonts (Poppins, plus Montserrat for ɛ, ɔ and ŋ). Animations are CSS
only and respect reduced motion. Check 390 px and 1440 px before publishing; there should be
no horizontal scroll on a phone.

## To do before sharing

- Pick the domain: `jeere.com` is taken; `jeere.shop`, `jeere.app` and `getjeere.com` were
  free on 3 November 2026 (GoDaddy). `.ci` must be checked with the Ivorian registry. The page
  uses `jeere.shop` in the examples; change it if you choose another.
- Add the @annklyy links (TikTok, Instagram) to the footer once you start posting.
