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

- **Logo**: « Jeere », in blue `#809EE6` (the blue of the founder's inspiration). The J is the
  geometric mark drawn in SVG (`#mark` in `index.html`: a round dot above a thick curved base with
  a small notch); « eere » is set in Poppins ExtraBold (800, SIL OFL), aligned on the J's stem and
  base, and converted to a path (`#word`), so the logo needs no font. `#logo` is the whole « Jeere »
  in one symbol. Three uses: the whole word, the J alone (favicon, avatars), or « Jeere » alone.
  It stays blue on light and dark backgrounds; the rest of the site stays black and white.
  The footer echoes the brand board: « Jeere » with four small icons (store, payment, chat,
  delivery) beside a large J. The favicon is the white J on a blue rounded square.
- **Name**: always written « Jeere » (only the J in capital), never « JEERE ».
- **Text weights**: light on purpose: titles in Poppins 400, buttons and labels 500, body 400.
- **Colours**: black and white only. White `#FFFFFF`, greys `#F5F5F3` / `#EBEBE8`, ink
  `#111111`, muted text `#5E5E5E`. No accent colour: the sellers’ photos and stores bring the
  colour, so only the demo stores and product pictures on the page are in colour.
- **Type**: Poppins (SIL OFL) for everything. Poppins has no ɛ, ɔ or ŋ (needed for Dioula and
  Bambara names), so the page also loads those six letters alone from Montserrat (SIL OFL), a
  few KB, and the browser uses them in place of the missing ones.

## Page

1. Hero, on a light grey band: “Créez votre boutique en ligne gratuitement” and a black card that asks for a
   WhatsApp number. The card sends nothing: it copies the number into the waitlist form, scrolls there and asks for
   the first name (without JavaScript it simply links to the waitlist). On the right, an editor canvas on a faint grid:
   a store page (shea butter jar) with floating editor tools: a text toolbar with the Jeere assistant, a colour tray
   (Karité, Lagune, Hibiscus, Indigo, Menthe, white) that recolours the store, a product card whose quantity updates
   the “Paiement Wave reçu” chip, and a pause button. The colours change by themselves every 2.8 s until the visitor
   hovers, focuses or pauses; with reduced motion they start paused. Then “Encaissez comme vos clients paient” with
   the payment methods.
2. Tout-en-un: online store, payments, orders and stock, sell everywhere, everything included.
3. Aujourd’hui / Avec Jeere.
4. Pourquoi Jeere: nine common complaints about the big e-commerce platforms (six from sellers,
   three from their customers), each with Jeere’s answer. Other platforms are not named on the page.
5. How it works, in four steps.
6. Delivery by commune: pick one of 13 communes and the receipt updates (fee, total, delay).
7. Templates: Plateau, Cocody and Treichville tabs switch the phone preview.
8. Diaspora mode (marked “coming soon”).
9. Pricing by sales volume, not features: every plan (even Gratuit) has every feature, human
   support on WhatsApp, import/export and one-tap pause. Plans differ only by orders a month
   (20, 150, 600, unlimited) and Jeere’s fee per online sale (3 %, 1 %, 0 %, 0 %).
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
