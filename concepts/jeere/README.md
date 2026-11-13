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

The form saves to Supabase, in the **Jeere** project (organisation « Jeere », region Paris, ref
`aezchxfvzfoqlvzchqyk`), table `public.jeere_waitlist` (migration `create_jeere_waitlist`). Until 5 November 2026 it
went to the « Kreeative Teach » project, now paused: sign-ups made before that are still there. The page posts straight to the REST API with the
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
(the FAQ gives contact.jeere@kreeative.xyz for that). A hidden honeypot field drops most bots.

## Seller accounts (Supabase Auth)

`compte/` creates real accounts in the same **Jeere** Supabase project, with a choice of how the
seller receives her one-time code. Not everyone has WhatsApp on the number she types, so e-mail
comes first; SMS and WhatsApp are there, and switch on as soon as an SMS provider is configured.

```
#inscription  « Votre prénom »
              « Recevoir mon code par »  [ E-mail ] [ SMS ] [ WhatsApp ]   (e-mail selected by default)
              E-mail: « Adresse e-mail » + « Numéro WhatsApp (facultatif) » (for her orders, never required)
              SMS / WhatsApp: « Numéro de téléphone » / « Numéro WhatsApp »
   └─ « Entrez le code »: 6 boxes (one input: paste, autofill, auto-advance), « Changer d'adresse »,
      « Renvoyer le code » after 60 s, « Autre méthode »
       └─ « Le nom de votre boutique » ─► « Comment voulez-vous commencer ? »
#connexion    the same choice (the device's account as a one-tap card) ─► code ─► ../admin/
```

- **Sending the code**: `signInWithOtp({ email })` / `signInWithOtp({ phone, options: { channel: 'sms' | 'whatsapp' } })`,
  checked with `verifyOtp({ type: 'email' })` / `verifyOtp({ type: 'sms' })` (WhatsApp codes too). Sign-up sends
  `first_name` and the optional number as user metadata; log-in sends `shouldCreateUser: false`, so an unknown address
  gets « Aucun compte avec cette adresse » and a « Créer un compte » button.
- **SMS or WhatsApp not configured**: `GET /auth/v1/settings` says whether phone sign-in is on; if not, picking SMS or
  WhatsApp shows at once « Les codes par SMS ne sont pas encore activés sur Jeere. Recevez votre code par e-mail pour
  l'instant… » with a « Recevoir mon code par e-mail » button. The same message comes when the API answers
  `phone_provider_disabled` (« Unsupported phone provider ») or `sms_send_failed`.
- **Errors in plain French** (`JeereAuth.describeError`): wrong or expired code, too many e-mails or codes (429), an
  address refused (`email_address_invalid`: Supabase refuses example.com and test domains), no network, sign-ups closed.
  Field errors go under the field (`aria-invalid`, `aria-describedby`, focus moves there); the others are announced
  (`role="alert"`).
- **Links in the e-mail**: if the template still sends a link, opening it on `compte/` finishes the login
  (`#access_token=…`, read by supabase-js) and asks for the store name when there is none; an expired link says so.

### Real mode and « mode démo »

| When | Mode |
| --- | --- |
| The live site | real: codes go out, the account is in Supabase |
| `?demo=1` | demo, forced |
| `localhost`, `127.0.0.1`, `file:` | demo by default, so the tests and offline work never send codes; `?demo=0` uses Supabase locally |
| Supabase or the CDN unreachable (offline, timeout) | demo, with « Jeere est injoignable… » and « Réessayer »; an error while sending offers « Continuer en mode démo » |

Demo is written on the screen (« Mode démo » banner, « aucun e-mail, SMS ni WhatsApp n'est envoyé » on the code step,
the footer): any 6-digit code works and the account stays in `localStorage`, as before. The e2e suite runs in it.

### Files

- `compte/auth.js` (`window.JeereAuth`): the Supabase client, the mode, sending and checking codes, the French errors,
  the bridge and the sync. It loads supabase-js **on demand** from a pinned build with Subresource Integrity
  (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js`,
  `sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o`, ~110 KB): on `compte/` in real mode, and on
  `creer/`, `admin/`, `studio/`, `abonnements/` only while a real session is open. Demo visitors never download it.
  To upgrade, change the version and recompute the hash
  (`curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`). Use the file `dist/umd/supabase.js`, not
  `supabase.min.js`: jsDelivr generates the `.min` one and it must not be used with SRI.
- `compte/compte.js`, `compte/index.html`, `compte/compte.css`: the screens.
- The URL and the **publishable** key are in `auth.js` (`CONFIG`); they are public by design, row level security
  protects the data. Never put the secret key in the site.

### Schema (migration `create_profiles`)

`public.profiles`, one row per seller, created by a trigger when Supabase creates the user:

| Column | Type | What it holds |
| --- | --- | --- |
| `id` | `uuid`, primary key, → `auth.users(id)` `on delete cascade` | the user |
| `first_name` | `text`, ≤ 40 | « Votre prénom » |
| `phone` | `text`, `+` and 8 to 15 digits, or null | her WhatsApp number for orders (the login number for an SMS/WhatsApp account) |
| `store_name` | `text`, ≤ 40 | « Le nom de votre boutique » |
| `plan` | `gratuit` / `essentiel` / `pro` / `business` | the store plan (dashboard) |
| `studio` | `jsonb` object or null, < 60 KB | the Studio subscription kept by `studio/plans.js` |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` is set by a trigger |

- **RLS**: on. `authenticated` may `select` and `update` only the row where `id = auth.uid()`; `anon` has no access at
  all (the REST API answers « permission denied »). No insert or delete through the API; only the columns
  `first_name, phone, store_name, plan, studio` can be updated (column privileges).
- **Trigger** `on_auth_user_created` → `private.handle_new_user()` (`security definer`, `search_path = ''`, in a
  `private` schema the API does not expose): copies `first_name`, `phone`, `store_name` from the sign-up metadata (or
  the auth phone), cleaned, and never fails a sign-up on bad input.
- `get_advisors` (security) after the migration: no finding on the schema. The one left is « Leaked password protection
  disabled », a dashboard setting about passwords, which Jeere does not use.
- **Before real payments**: `plan` and `studio` are writable by the seller today because the checkout is a demo. When
  payments are real, revoke `update (plan, studio)` from `authenticated` and set them from the payment webhook (service role).

### The bridge to `jeere-account`

After a real login, the profile is written to `localStorage['jeere-account']` in the same shape as before
(`{ version: 1, firstName, phone, storeName, createdAt, plan, loggedIn, studio? }`) plus `email`, `userId` and `method`,
so the editor, the dashboard, the Studio and the plans work unchanged (`JEERE_DATA.normalizeAccount` now accepts an
account with an e-mail and no number; `phone` is then `''`). The server wins; what it does not have yet (a store name,
a number, a Studio subscription already on this device for the same seller) is taken from the device and sent up.
Then every change those pages make to the profile (store name, number) is sent to `profiles`: a snapshot of what the
server has (`jeere-auth-sync`) says what changed. **The plan and the Studio subscription are the server's** (wave 2):
browsers cannot write `profiles.plan` / `profiles.studio` any more (migration `jeere_wave2`); the Edge Function
**`studio-plan`** reads them (`get`), starts the one 14-day trial (`trial`) and, only while billing is in demo mode
(`JEERE_BILLING_MODE` ≠ `live`), keeps the subscription the demo checkout made (`sync`, `demo: true`, cleaned and
marked `source: 'demo'`); its answer overwrites the local copy. Trade-off, said plainly: in demo mode anyone signed in
can still give herself a plan, as before, but only through that function; set `JEERE_BILLING_MODE=live` once
Paystack / Wave are connected and only the payment webhook (to be written) changes a plan. The badge on her stores
is decided by the database from the server's copy (`stores.badge`, trigger `stores_badge`). « Se déconnecter » (account page or dashboard) and « Supprimer mon
compte » end the Supabase session too. Real deletion of the user needs a service-role Edge Function (not built yet):
today « Supprimer mon compte » clears the device and signs out.

### What the founder must configure in Supabase

Dashboard → project **Jeere** → **Authentication**.

1. **URL Configuration** (`/auth/url-configuration`): Site URL `https://kreeative.xyz/concepts/jeere/compte/`; Redirect
   URLs: add `https://kreeative.xyz/concepts/jeere/compte/**` (and `http://localhost:8911/concepts/jeere/compte/**` to
   test locally with `?demo=0`). It is still the default `http://localhost:3000` today (seen in the auth logs), so a link
   in an e-mail would open nowhere.
2. **Email templates** (**Emails → Templates**): Supabase's defaults send only a link. To send the 6-digit code, put
   `{{ .Token }}` in **Confirm signup** (first code of a new account) and **Magic link** (every later code), in French,
   for example: subject « Votre code Jeere : {{ .Token }} », body
   `<p>Bonjour {{ .Data.first_name }},</p><p>Votre code Jeere : <strong>{{ .Token }}</strong></p><p>Il est valable
   1 heure. Ne le partagez avec personne, même pas avec l'équipe Jeere.</p>`. Keep the link out, or keep it too: the
   page handles both. In **Sign In / Providers → Email**, check that the email OTP length is **6** (the page reads 6
   digits) and keep « Confirm email » on.
3. **Custom SMTP, before any real seller** (**Emails → SMTP Settings**). Supabase's built-in mailer is for trying Auth
   only: it is limited to a few e-mails an hour for the whole project (the test hit `429 over_email_send_rate_limit` after
   two requests on 6 November 2026) and Supabase documents that it only sends to members of the organisation's team
   (`email_address_not_authorized` for everyone else; that day the logs still showed one delivered to an outside
   address, but do not count on it). With **Resend**: verify a sending domain (`jeere.shop` or the one
   chosen), create an API key, then in Supabase: host `smtp.resend.com`, port `465`, user `resend`, password = the API
   key, sender `Jeere <code@…>`. Resend's free plan is 3 000 e-mails a month and 100 a day; Pro is 20 $ a month for
   50 000. Then raise **Rate Limits → emails per hour**.
4. **SMS** (**Sign In / Providers → Phone**): turn Phone on, choose **Twilio** (the one Supabase documents best, and the
   only one that also does WhatsApp; Vonage, MessageBird and Textlocal are the other choices), paste the Account SID, Auth
   Token and Messaging Service SID from the Twilio console (a Messaging Service with an alphanumeric sender « Jeere »,
   free at Twilio), set the SMS message to « Votre code Jeere : {{ .Code }} », raise the code lifetime from 60 s to
   300 s, and set **Rate Limits → SMS per hour**. **Cost to Côte d'Ivoire: 0.4925 $ per SMS segment on Twilio**
   (about 300 FCFA, October 2026 price list), i.e. about 50 times an e-mail. Plivo's public list gives 0.30 $ (Orange),
   0.33 $ (MTN) and 0.50 $ (Moov) for comparison; Vonage and MessageBird publish their Ivorian prices only in their
   consoles. Turn on Twilio's SMS pumping protection before opening SMS, and consider a CAPTCHA (Supabase **Attack
   Protection**; the page would then need the widget and to pass `captchaToken`): Africa-bound SMS is a classic target
   of SMS pumping fraud. A cheaper route later: a « Send SMS » Auth Hook
   (an Edge Function) calling a local aggregator.
5. **WhatsApp (optional, secondary)**: needs Twilio (or Twilio Verify) as the phone provider, plus a WhatsApp sender
   approved on Twilio (a Meta Business account, business verification, the display name « Jeere »). Supabase then sends
   the code with `channel: 'whatsapp'`. **Cost: Meta's « authentication » rate for Côte d'Ivoire (region « Rest of
   Africa ») is about 0.004 $ per message from 1 October 2026** (as copied from Meta's rate card by Zernio and SleekFlow;
   check the card itself), **plus 0.005 $ per message for Twilio**: about 0.009 $ (≈ 5 FCFA) per code, some 50 times
   cheaper than an SMS. With Twilio Verify add 0.05 $ per successful verification.
6. **Test numbers**: Phone → « Test Phone Numbers and OTPs » (`2250700000000=123456`, with an end date) lets you try SMS
   sign-in without sending anything, once a provider is set.

Sources: [Supabase, test auth flows](https://supabase.com/docs/guides/auth/testing-auth-flows) (built-in mailer limits),
[Supabase, phone login](https://supabase.com/docs/guides/auth/phone-login) (providers, WhatsApp only on Twilio),
[Supabase, signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp),
[Supabase, email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates) (`{{ .Token }}`),
[Twilio SMS pricing, Côte d'Ivoire](https://www.twilio.com/en-us/sms/pricing/ci) (0.4925 $),
[Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing) (0.005 $ per message),
[Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing) (0.05 $ per verification),
[Meta, WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing) (Côte d'Ivoire in « Rest of Africa »),
[Zernio](https://zernio.com/blog/whatsapp-business-api-pricing) and [SleekFlow](https://sleekflow.io/en-us/blog/whatsapp-business-price)
(Rest of Africa authentication 0.0040 $), [Plivo, Côte d'Ivoire](https://www.plivo.com/sms/pricing/ci/),
[Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Resend pricing](https://resend.com/pricing).
Prices checked on 6 November 2026.

### Tests

`auth-test.js` (scratchpad `auth/`): the demo flow, method switching and validation, a real e-mail code request (HTTP 200),
a wrong code on the real API, « SMS / WhatsApp not configured » (real API and mocked), the bridge on a mocked Supabase
(profile → `jeere-account`, store name and dashboard changes sent to `profiles`, log-out ending the session, the e-mail
link), the offline fallback, and the layout at 360 / 390 / 768 / 1440 (no horizontal scroll, 44 px targets, contrast).
Delete the test users afterwards (`delete from auth.users where email like 'jeere-auth-%@mailinator.com'`).

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
9b. « Le Studio · formule Avancée » (`#studio`, on black): the Studio's own subscriptions (Découverte free,
   Solo, Pro, Agence) with a monthly / yearly toggle (`site.js`), « Essayer le Studio 14 jours »
   (`studio/?essai=1`) and « Comparer les formules » (`abonnements/`, the pricing page with its comparison
   table, FAQ and demo checkout). The prices are those of `studio/plans.js`; see `studio/README.md`,
   « Abonnements Studio ».
10. FAQ.
11. Waitlist form (seller or diaspora buyer), with a WhatsApp share button after sign-up.

## Files

```
index.html   markup and French copy
i18n.js      English strings, the photos' alt texts included (French stays in the HTML)
style.css    tokens, layout, responsive rules (360 px first)
site.js      language, delivery demo, template tabs, waitlist form, hero canvas, hidden fallback
             for a photo that cannot load, scroll-in
abonnements/  the Studio's pricing page and checkout (« Abonnements Studio », see studio/README.md)
b/           the public store page (index.html, b.js, b.css): jeere.kreeative.xyz/b/<adresse> and sellers' own domains
supabase/    the SQL of public.stores (migrations/) and the Edge Function `domains` (functions/), see « Domaines »
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
(@prince_edja on Instagram), credited on the photo (an Instagram icon and @prince_edja) with a link to his post.
Made from a 1179×1466 copy, cropped to the framing `LINES` was traced on (x 2–1168, y 2–1466) and resized.

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

## Domaines

How a Jeere store gets a real address, how a seller connects a domain she bought elsewhere, and how she can
buy one through Jeere. Everything below is built; what still needs the founder is in
[What the founder must do](#what-the-founder-must-do).

### The free address: `jeere.kreeative.xyz/b/<adresse>`

Jeere does not own `jeere.shop` yet, and `kreeative.xyz`'s DNS is at GoDaddy (so no wildcard
`*.jeere.kreeative.xyz`). Every store therefore lives on a **path** of the free Jeere host:

```
https://jeere.kreeative.xyz/b/awa-beaute            the store (vercel.json routes /b/<slug> on that host to b/index.html)
https://kreeative.xyz/concepts/jeere/b/?s=awa-beaute the same page on any host (previews, kreeative.xyz, a local server)
https://awabeaute.com/                               her own domain (below): the store whose custom_domain is the host
```

The address shown everywhere comes from `JEERE_DATA.storeAddress(slug)` (`creer/data.js`: `PUBLIC_HOST`,
`STORE_PATH`, `ADDRESS_MODE = 'path'`). The dashboard, the editor's frame, the account page and the Studio
all go through it, so no screen promises « nom.jeere.shop » any more; an address saved before
(`awa-beaute.jeere.shop` in `'jeere-admin'`) is read back with `storeSlug()` and shown in the new form.

**Address rules** (the same in `JEERE_DATA.checkStoreSlug` and in the database's `CHECK`): 3 to 40 characters,
`a–z`, `0–9` and hyphens, no hyphen first, last or doubled, and none of Jeere's own words
(`STORE_SLUG_RESERVED` = `public.jeere_slug_reserved`: www, admin, api, app, studio, creer, compte,
abonnements, b, s, aide, panier, paiement, domaine, mail, ns1, test… 160 words, so they also stay free as
sub-domains later). `publish-test.js` checks that both lists are identical and that the live database refuses each word.

**The data: `public.stores`** (Supabase « Jeere », migration `create_jeere_stores`, the SQL is in
`supabase/migrations/`):

| Column | |
| --- | --- |
| `id` | uuid |
| `owner` | `auth.users(id)`, default `auth.uid()`; nullable while accounts are a demo (rows without an owner are written by the team, in SQL) |
| `slug` | unique, the rules above (CHECK) |
| `fiche` | the fiche boutique (jsonb object, 1 MiB of text at most; the browser refuses more than 0,9 MB before sending, with a message about the photos) |
| `show_badge` | « Fait avec Jeere » (true unless a paid Studio plan hides it: `JeerePlans.badgeShown()` when publishing) |
| `published`, `published_at` | the switch, and when it was last turned on (a trigger) |
| `custom_domain` | unique, lower case, never a Jeere / Vercel / Supabase host (CHECK) |
| `domain_status` | `none` · `pending` · `dns_ok` · `waiting_team` (no Vercel token: the team attaches it) · `attached` · `verified` · `error` |
| `domain_checked_at`, `created_at`, `updated_at` | |

Row level security and column privileges: **anyone** (`anon`, `authenticated`) reads published rows, and only
the public columns (never `owner`); **the owner** inserts, updates and deletes her rows (`owner = auth.uid()`)
and reads them unpublished; browsers can write only `slug`, `fiche`, `show_badge`, `published`;
`custom_domain` and `domain_status` are written only by the `domains` Edge Function (service key). A trigger
keeps `owner` and `created_at` unchanged and caps a person at 10 stores. Two functions:
`rpc/slug_available(p_slug)` → `{ available, reason: ok | format | reserved | taken | yours }` (security
definer, so an unpublished store's address reads « taken » too) and `rpc/my_stores()` (her stores, signed in only).
The security advisor flags both as « security definer callable »: that is their purpose.

**Publishing** (`creer/publish.js`, `window.JeerePublish`, styles `creer/publish.css`): one panel mounted in the
editor's « Publier », the Studio's « Publier » (dark) and the dashboard's « Publier ma boutique » and
« Domaine ». It proposes an address from the store's name, checks it as she types (`slug_available`),
offers free alternatives, then publishes (`POST /rest/v1/stores`, then `PATCH` for « Mettre à jour »),
shows the live link with « Copier le lien », « Partager sur WhatsApp » and « Ouvrir », warns when the latest
changes are not online yet, and « Retirer de la ligne » (published = false). This browser remembers the store in
`'jeere-publish'` = `{ slug, storeId, ownerId, published, publishedAt, hash }`, and the dashboard's address follows it.

Publishing needs a **signed-in Supabase user** (stores have an owner). The session is read from
`window.JeereAuth.getSession()` (the account page's auth module: return `{ access_token, user }`), else a
supabase-js client at `window.jeereSupabase`, else supabase-js's own storage key
`sb-aezchxfvzfoqlvzchqyk-auth-token`; an expired session counts as none. Until auth is live the panel says
« Votre boutique est enregistrée dans ce navigateur seulement » and offers « Se connecter pour publier »
(`../compte/?suite=publier#connexion`); she can still choose and check her address.

**The public store page** (`b/index.html`, `b/b.js`, `b/b.css`): reads the host and the path, fetches the published
fiche (REST, publishable key) — or takes it from the page itself when `api/store.js` served it (below) — and draws
it with `creer/render.js` + `store.css`. **Breakpoints** (`JEERE_DATA.BREAKPOINTS`, the Studio's, wave 2): the phone
layout under 768 px, the computer layout from 768 px (the Studio's 768 artboard), the element styles' tablet values
under 1200 px. Detached Studio sections render (`engine-sections.js` loads the DualEngine on demand).
**Addresses** (wave 2, one format end to end: `render.js` writes the links with `options.linkBase`, `b.js` reads and
pushes them): `jeere.kreeative.xyz/b/<slug>/produits/<id>`, `/pages/<slug>`, `/panier`, `/paiement`; on her own
domain the same from the root (`/produits/<id>`…); on any other host `…/b/?s=<slug>#/produits/<id>`. Older links
(`#/produits/…`, `#produit/p2`, `#page/a-propos`, `#panier`) still open the right view and the address is cleaned.
Back works, a link can be shared, opened in a new tab or indexed. **The `<head>`**: the Studio's référencement
first (`store.seo`, `pages[].seo`: title, description, share image, `noindex`), then the store's name and tagline;
a product page says « name · price · store » with its photo; canonical, `robots`, `og:*`, `twitter:*`
(`JeereRender.storeMeta`, shared with the server). « Fait avec Jeere » follows `stores.badge` (computed by the
database from the owner's plan, migration `jeere_wave2`), else `show_badge`. A loading state, a friendly
« Boutique introuvable » (noindex) for unknown or unpublished addresses, and « Connexion impossible » with
« Réessayer ». **Ordering**: the store's checkout has no real payment yet, so « Payer » / « Confirmer la commande »
opens WhatsApp to the shop's number with the order written (items, commune and fee, total, payment method, name)
and says so; the preview's demo confirmation is never shown to a customer. Assets are added by the page's first
script with the right base (`/` on jeere.kreeative.xyz, `/concepts/jeere/` elsewhere), never as relative links.

**Link previews and crawlers** (`api/store.js`, a Vercel serverless function, Node, no dependency; wave 2): WhatsApp,
Facebook and X do not run JavaScript, so `jeere.kreeative.xyz/b/<slug>…` and every page of her own domain go
through this function. It reads the published row (REST, publishable key), and serves `b/index.html` with the
store's own `<title>`, description, `og:*`, `twitter:*`, canonical (her verified domain if any), `robots`, JSON-LD
(`Store`, and `Product` with its price in XOF on a product page), the store drawn by `render.js` in the phone
layout (for readers without JavaScript; hidden on a wide screen until `b.js` redraws at its width), and the row
inline (`<script type="application/json" id="jb-data">`) so `b.js` makes no second request. Cached 60 s at
Vercel's edge (`stale-while-revalidate` 10 min). Any failure serves the static page as it is, and `b.js` loads
the store itself as before. Why not a Supabase Edge Function: Supabase serves every `GET` that returns `text/html`
as `text/plain` (documented), so a browser would show the source. Vercel serves `api/*.js` for a project without
a framework; `vercel.json › functions › includeFiles` ships `b/index.html`, `creer/data.js` and `creer/render.js`
with it. **Sitemap**: `jeere.kreeative.xyz/b/sitemap.xml` → `api/sitemap.js`, which serves as `application/xml`
the list made by the Edge Function **`store-sitemap`** (every published store, its pages and products; a
store on her verified domain is listed there; `noindex` pages left out). `jeere.kreeative.xyz/robots.txt`
(`concepts/jeere/robots.txt`) points to it.

### vercel.json: `routes`, not `rewrites`

Vercel serves a file that exists **before** `rewrites` (« the filesystem takes precedence over rewrites »), so the
old rule could never show Jeere at `jeere.kreeative.xyz/`: the repository root has its own `index.html` (the
portfolio). `routes` run before the filesystem, so the file now uses `routes` (it had only one rewrite, nothing
else to convert). In order:

1. `jeere.kreeative.xyz` + `/concepts/jeere/…` → 308 to `/…` (old links).
2. `jeere.kreeative.xyz` + `/creer`, `/admin`, `/compte`, `/abonnements`, `/studio`, `/b` → 308 with the final slash.
3. `jeere.kreeative.xyz` + `/b/sitemap.xml` → `/api/sitemap` (wave 2); `/b/<slug>` with an optional `/produits/<id>`, `/pages/<slug>`, `/panier` or `/paiement` (optional final slash) → `/api/store?slug=<slug>&path=<rest>` (wave 2; before: `b/index.html` directly).
4. `jeere.kreeative.xyz` + `/` → `/concepts/jeere/index.html`; a path ending in `/` → its `index.html`; any other path → `/concepts/jeere/<path>`.
5. **Any other host** that is not `kreeative.xyz`, `*.kreeative.xyz` (www, jeere), `*.vercel.app` (kreeative-site.vercel.app, previews) or `localhost`, for a path without a dot outside `/concepts/jeere/` → `/api/store?path=/<path>` (wave 2: a seller's domain, the host says which store; its files, `/concepts/jeere/creer/render.js`…, have a dot and fall through to the filesystem).

| Host | Path | Result |
| --- | --- | --- |
| kreeative.xyz, www.kreeative.xyz | everything | unchanged: the filesystem (portfolio, `/concepts/jeere/…`, `/robots.txt`, 404) |
| kreeative-site.vercel.app, `*-<team>.vercel.app` previews | everything | unchanged |
| jeere.kreeative.xyz | `/` | the Jeere landing (before: the portfolio's `index.html`) |
| jeere.kreeative.xyz | `/creer` · `/creer/` · `/creer/render.js` | 308 `/creer/` · editor · the file |
| jeere.kreeative.xyz | `/b/awa-beaute`, `/b/awa-beaute/`, `/b/awa-beaute/produits/p1`, `/b/awa-beaute/pages/a-propos`, `/b/awa-beaute/panier` | `api/store.js` (the store page with its own `<head>`) |
| jeere.kreeative.xyz | `/b/sitemap.xml` | `api/sitemap.js` (the `store-sitemap` Edge Function, as XML) |
| jeere.kreeative.xyz | `/b/awa-beaute/autre` | 404 |
| jeere.kreeative.xyz | `/b/b.js`, `/style.css`, `/studio/engine/model.js` | the Jeere files |
| jeere.kreeative.xyz | `/robots.txt` | `concepts/jeere/robots.txt` (wave 2: allow, sitemap) |
| awabeaute.com, www.awabeaute.com, boutique.awabeaute.ci | `/`, `/produits/p1`, `/une/page` | `api/store.js`, which finds the store by its host |
| kreeative.xyz | `/api/store` | the function, which serves the static page (no store asked) |
| awabeaute.com | `/concepts/jeere/creer/render.js`, demo photos | the files |

`vroute.js` (a model of this router) and `vroute-test.js` (scratchpad `publish/`) check each line; `vserver.js`
serves the worktree by `Host` header with the same model, so the tests open `http://jeere.kreeative.xyz:8921/b/…`
and `http://awabeaute.test:8921/` in Chromium. Not checked by a deploy: that `has`/`missing` host values match as
documented (`value` string, `{ suf }`). **Any other domain added to the project later that is not a store must be
added to the `missing` list of rule 5.**

### Her own domain (bought elsewhere)

Dashboard › Paramètres › Domaine (`admin/domaines.js`, `admin/domaines.css`, `creer/domains.js` =
`window.JeereDomains`):

1. She types her domain: apex (`awabeaute.com`), `www.awabeaute.com` or a sub-domain; « https:// » and a final
   slash are removed, accents and spaces refused, Jeere's own hosts refused.
2. She sees exactly what to add, each value with « Copier »: `A @ 76.76.21.21` (apex) and
   `CNAME www cname.vercel-dns.com` (the one she typed is « Obligatoire », the other « Conseillé »); a sub-domain
   gets `CNAME <sub> cname.vercel-dns.com`. Step-by-step guides for GoDaddy, Namecheap, Hostinger, OVHcloud and
   Cloudflare (« nuage gris »: Cloudflare's proxy blocks Vercel's certificate).
3. « Vérifier » asks `https://dns.google/resolve?name=…&type=A|CNAME` from the browser and marks each record ✓ or ✗
   with what it found (« Pas encore : trouvé parkingpage.namecheap.com »).
4. When the required record is right, the dashboard calls the Edge Function `domains` (`attach`, then `verify`), which
   checks she owns the store, saves `custom_domain` and adds the domain to the Vercel project. Without the Vercel token
   it answers « pas encore configuré » and the screen says the Jeere team links it by hand (status « Relié par
   l’équipe sous 24 h »). Without a published store she is told to publish first.
5. Routing: the domain is attached to the same Vercel project; rule 5 above sends it to the store page, which reads
   `location.host` and loads the store whose `custom_domain` is that host (or its www / apex twin).

### The Edge Function `domains`

Source in `supabase/functions/domains/index.ts`, deployed (version 1, `verify_jwt = false`: the publishable key is
not a JWT, the function checks the session itself with `/auth/v1/user`).
`POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/domains` with `{ action, … }`:

| Action | Who | What |
| --- | --- | --- |
| `status` | anyone | `{ configured, purchases }` |
| `search { name }` | anyone | with the token: Vercel's availability and price for .com .shop .store .online .net .co .site .boutique, in USD and FCFA; without: `configured: false` (the dashboard then guesses from the DNS) |
| `attach { storeId, domain }` | the store's owner | saves the domain, adds it **and its www/apex twin (308 redirect)** to project `prj_fD8DW3XmW3iyaGNXSCquGcApR4AC` (team `team_baaIo2HD3gXK1oOziipXPpAl`, linked to the branch in `VERCEL_GIT_BRANCH`, default `claude/session-setup-kcwzk4`; empty = production), reads its config, sets `domain_status` |
| `verify { storeId }` | owner | Vercel's verify + config → `attached` / `verified` (returns any TXT verification record to add) |
| `detach { storeId }` | owner | removes it from the project and the store (never a Jeere / Vercel host) |
| `buy { domain, years, expectedPrice, contact, storeId?, confirm: true }` | **the team only** | needs `VERCEL_TOKEN`, the `DOMAINS_ADMIN_KEY` secret sent as `x-jeere-admin`, and `confirm: true`; re-reads the price, refuses if it changed, buys (`autoRenew: false`), attaches it to the store |

Secrets (Supabase › Edge Functions › Secrets): `VERCEL_TOKEN` (missing today), `DOMAINS_ADMIN_KEY` (missing today),
optional `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_GIT_BRANCH`. The demo checkout never calls `buy`.
Tested in Node with a Deno shim (`fn-test.mjs`) and live (`live-api-test.js`).

### Buying a domain through Jeere

**Research (6 November 2026).**
- Vercel sells domains through its registrar API (`/v1/registrar/…`: availability, price, buy; buying needs the
  registrant's contact: name, e-mail, phone, address, country). Prices read with the Vercel API (`get_tld_price`,
  `get_bulk_price`) for team `team_baaIo2HD3gXK1oOziipXPpAl`.
- **.ci is not sold by Vercel** (not in `list_supported_tlds`; `get_tld_price ci` → 400), and neither is **.africa**.
  .ci is run by the ARTCI (ordonnance 2012-293), registry NIC.CI, sold through accredited registrars (36 in
  January 2024, legal entities): local prices of about 5 000 to 15 000 FCFA a year (Abidjan.net; Digitalmag.ci says
  9 000 to 10 000). International registrars with an API resell it much higher: INWX (DomRobot API) about CHF 33–46,
  EuroDNS about 211 € a year, Gandi only under a corporate contract; some ask for a local presence.
  Sources: [IANA .ci](https://www.iana.org/domains/root/db/ci.html), [ICANNWiki .ci](https://icannwiki.org/.ci),
  [Abidjan.net](https://news.abidjan.net/articles/508100/telecommunications-lartci-marque-sa-presence-au-siweb),
  [Digitalmag.ci](https://digitalmag.ci/les-noms-de-domaine-en-ci-une-identite-numerique-de-la-cote-divoire/),
  [INWX .ci](https://www.inwx.com/en/ci-domain), [EuroDNS .ci](https://www.eurodns.com/domain-extensions/ci-domain-registration),
  [Gandi .ci](https://www.gandi.net/fr-CA/domain/tld/ci), [101domain .ci](https://www.101domain.com/ci-information-help.htm),
  [Vercel: buy a domain](https://vercel.com/docs/rest-api/domains-registrar/buy-a-domain),
  [add a domain to a project](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project),
  [domain configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration).
  So .ci stays « sur demande »: the team buys it from an accredited Ivorian registrar by hand.

**Resale model.** Price in FCFA = Vercel's price in USD × 600 (a margin on ~575 FCFA per USD) + 25 % + 1 500 FCFA,
rounded up to 500 FCFA (`JeereDomains.fcfa`, the same in the Edge Function). The margin pays mobile-money fees
(~2 %), the exchange risk, the linking and the support. Renewals follow the same formula on the renewal price, and
the screens always show both: some extensions are a promotion the first year only.

| TLD | Vercel (buy / renew, USD) | Cost in FCFA (×600) | **Jeere, 1st year** | **Jeere, each renewal** | Margin 1st year / renewal |
| --- | --- | --- | --- | --- | --- |
| .com | 12,03 / 12,03 | 7 218 | **11 000** | **11 000** | 3 782 / 3 782 |
| .net | 13,50 / 13,50 | 8 100 | **12 000** | **12 000** | 3 900 / 3 900 |
| .shop | 2,99 / 38,39 | 1 794 / 23 034 | **4 000** | **30 500** | 2 206 / 7 466 |
| .store | 1,49 / 44,00 | 894 / 26 400 | **3 000** | **34 500** | 2 106 / 8 100 |
| .online | 1,49 / 27,00 | 894 / 16 200 | **3 000** | **22 000** | 2 106 / 5 800 |
| .site | 1,49 / 27,00 | 894 / 16 200 | **3 000** | **22 000** | 2 106 / 5 800 |
| .boutique | 3,99 / 33,00 | 2 394 / 19 800 | **4 500** | **26 500** | 2 106 / 6 700 |
| .co | 29,99 / 24,80 | 17 994 / 14 880 | **24 000** | **20 500** | 6 006 / 5 620 |
| .ci | not on Vercel | ~5 000–15 000 locally | **~15 000, sur demande** | same | depends on the registrar |

Advice shown to sellers: .com keeps the same price every year; .shop / .store / .online are cheap only the first year.

**Who owns the domain.** It is registered **in the seller's name** (she is the registrant contact; the checkout asks
her name and e-mail, which registries require), in Jeere's Vercel team, which manages its DNS. She can transfer it
out (after the 60-day ICANN lock). `autoRenew` is off: Jeere renews only after she pays, with a WhatsApp reminder
30 days before; unpaid, it lapses, and her free Jeere address keeps working.

**The flow.**
1. Dashboard › Domaine › « Acheter un nom de domaine »: she types a name; the dashboard asks `domains/search`. With the
   token it shows Vercel's real availability and price; without (today) it guesses from the DNS (`dns.google`
   `type=NS`: NXDOMAIN = « Probablement libre », name servers = « Déjà pris ») with « vérification finale par
   l’équipe », and the prices of the table above. .ci shows « Sur demande ».
2. « Acheter » opens the checkout `../abonnements/?domaine=awabeaute.shop#domaine` (product type `domain`): the price is
   computed there (never read from the URL), the holder's name and e-mail, then mobile money or card through
   `JeereBilling.startProductCheckout` (demo provider today: nothing is charged), and an honest confirmation. The order is
   kept in `'jeere-admin'.domainOrders` and listed in the dashboard.
3. For real: the payment provider's webhook confirms the payment on the server, then the team (or a future job) calls
   `buy` with `confirm: true` and `x-jeere-admin`; the function checks the price, buys, and attaches the domain. Until
   automated, by hand:

```sh
curl -X POST https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/domains \
  -H "apikey: sb_publishable_w0gqMepSQZn-DWRboBOR1w_rh6-jg_w" -H "x-jeere-admin: $DOMAINS_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"action":"buy","confirm":true,"domain":"awabeaute.shop","years":1,"expectedPrice":2.99,"storeId":"<stores.id>",
       "contact":{"firstName":"Awa","lastName":"Koné","email":"awa@exemple.com","phone":"+225.0707123456",
                  "address1":"Rue des Jardins","city":"Abidjan","state":"Abidjan","zip":"00225","country":"CI"}}'
```

### What the founder must do

1. **GoDaddy › kreeative.xyz › DNS**: add `CNAME` `jeere` → `659106b38f644a47.vercel-dns-017.com`. Then
   `https://jeere.kreeative.xyz/` shows Jeere and `https://jeere.kreeative.xyz/b/<adresse>` the stores. If a visitor
   is asked to log in to Vercel, the branch domain is behind Deployment Protection: allow it in Vercel › Project ›
   Settings › Deployment Protection, or point the domain at production.
2. **A Vercel token**: Vercel › Account Settings › Tokens › « Create », scope = the team that owns the project
   (`team_baaIo2HD3gXK1oOziipXPpAl`), an expiry you will remember. It can add domains to the project and buy domains:
   keep it only in Supabase.
3. **The secrets**: Supabase › project « Jeere » › Edge Functions › Secrets › add `VERCEL_TOKEN` = the token, and
   `DOMAINS_ADMIN_KEY` = a long random string kept by the team (only needed for purchases). No redeploy needed. Check with
   `{"action":"status"}`: `configured: true`.
4. Supabase Auth (the other agent's work): when the account page signs sellers in, expose `window.JeereAuth.getSession()`
   (or keep supabase-js's default storage key) and the « Publier » buttons publish for real.
5. Later, a payment provider (Wave Checkout / Paystack, see `studio/README.md`) for real domain payments.

### Later: `nom.jeere.shop`

1. Buy `jeere.shop` (free on Vercel on 6 November 2026: 2,99 $ the first year, then 38,39 $ a year).
2. Put its DNS on Vercel (Vercel nameservers), add `jeere.shop` and the wildcard `*.jeere.shop` to the project (a
   wildcard needs Vercel's nameservers).
3. Add a host-based route before rule 5: host `{ "suf": ".jeere.shop" }` (not `www.`), paths without a dot →
   `/concepts/jeere/b/index.html`, and add `*.jeere.shop` hosts to b.js's lookup (slug = the first label).
4. Set `ADDRESS_MODE = 'subdomain'` in `creer/data.js`: every screen shows `awa-beaute.jeere.shop`; old
   `jeere.kreeative.xyz/b/…` links keep working (keep rule 3).

## Jeere Connect (a custom-designed site on a Jeere store)

For sites the studio designs by hand (`concepts/joshua-cooker/`, `concepts/sonia-luxury-hair/`): they keep their
own design, and their products, prices and cart come from a Jeere store, edited in the Jeere editor.

```html
<script src="https://jeere.kreeative.xyz/connect/jeere-connect.js" data-store="<slug>" defer></script>
```

- `connect/jeere-connect.js` reads the store's **published** fiche (`GET /rest/v1/stores?slug=eq.<slug>&published=is.true&select=slug,fiche`,
  publishable key; RLS only shows published rows) and fills the site's markup by product id:
  `[data-jeere-product="p1"]` (gets `data-jeere-state="on" | "off"`), inside it `[data-jeere-name]`, `[data-jeere-price]`
  (« 7 000 FCFA »), `[data-jeere-desc]`, `[data-jeere-photo]` (an `<img>`, from an https `image`), `[data-jeere-add]`.
  A product missing from the fiche or out of stock is « off »: its add button is disabled, « Épuisé ».
- Cart: `[data-jeere-add]`, `[data-jeere-inc]`, `[data-jeere-dec]`, `[data-jeere-remove]`, `[data-jeere-count]`,
  `[data-jeere-total]`, `[data-jeere-lines]` (filled from its `<template data-jeere-line>` / `<template data-jeere-empty>`),
  `[data-jeere-checkout]`. Kept in `localStorage['jeere-connect:<slug>']`; `data-default-cart="p1:1,p2:1"` on the script
  fills a first visit (Joshua's mockup shows two dishes). A `jeere:cart` event on `document` after each change (and
  `jeere:ready` once the fiche is read), and `window.JeereConnect = { ready, status(), products(), product(id), cart(),
  add(id, q), set(id, q), clear(), checkoutUrl(), refresh(), formatPrice }` for a site's own script (Sonia's bag).
- Checkout: same tab to `https://jeere.kreeative.xyz/b/<slug>/panier?panier=p1:2,p3:1`. `b/b.js` fills the store's cart
  from it (its own product ids only, 1 to 20 each), opens the cart, and takes the parameter out of the address. The
  order then leaves on WhatsApp, as on every Jeere store: the store needs its WhatsApp number in the fiche.
- Never breaks the site: Supabase unreachable, store not published, or the script not loading → the hard-coded
  names and prices stay, and the cart still works on the page's prices.
- Ids are the fiche's (`p1`, `p2`…): `normalizeConfig` renumbers any other id, in the store page and on every publish,
  so the site binds to those. Deleting a product in the editor frees its id for the next new product: check the
  site's `data-jeere-product` after removing one. Names and descriptions are only written where the page is in
  French (`lang`), the fiche's language; prices everywhere (a site may set `JeereConnect.formatPrice`).
- Photos: Jeere keeps only photos uploaded to Jeere (Supabase Storage) or data URLs; an https photo elsewhere
  (`kreeative.xyz/…`) is shown by Jeere Connect but not by the Jeere store page, and the editor drops it on publish.
- Demo stores: `connect/seed-stores.sql` (`joshua-cooker`, `sonia-luxury-hair`, owner 706a1f96…), to run once in the
  SQL editor; it says what to set before sharing (WhatsApp number, delivery fees).
- The custom-designed demo shops (« Modèles sur mesure » on the home page, `#sur-mesure-modeles`): ANSE, SÈVE,
  SOYEUSE and MICHOU (`concepts/<slug>/` on the default branch), each sold through the Jeere store of the same slug
  (owner 706a1f96…, created in the SQL editor from the products listed in each site's README). They are in
  `admin.js` (`CUSTOM`, `MY_SHOPS`), `mes-sites.js` (`LINKED`), `build-manifest.mjs` (`COMMERCE`) and the folders
  `sites-publish` may write. « Choisir ce modèle » opens the store in the dashboard (`admin/#boutique=<slug>`).
  **When a model is copied for a client, copy the code only, never `img/`**: the demo images belong to their
  authors and brands (Pinterest, CYKLAR, the bag brands) — see each site's `mentions-legales/` page.

## Jeere Rendez-vous (appointments for service businesses)

Lashes, nails, hair, make-up: a store can take **bookings** as well as orders. Clients choose a service, a
day and a time on the store's site or on `rdv/?b=<slug>`; the studio runs its agenda in the dashboard
(« Rendez-vous »: agenda, services, hours and team, deposit and policies, clients). Tables `booking_settings`,
`appointments` and `booking_blocks`, Edge Function `bookings`, script `connect/jeere-booking.js`, dashboard
section `admin/rdv.js`; three model sites, `concepts/regard/` (lashes), `concepts/vernie/` (nails) and `concepts/minuit/` (lashes and nails, dark).
Everything is in [docs/rendez-vous.md](docs/rendez-vous.md).

## To do before sharing

- Pick the domain: `jeere.com` is taken; `jeere.shop`, `jeere.app` and `getjeere.com` were
  free on 3 November 2026 (GoDaddy); `jeere.shop` was still free on Vercel on 6 November 2026
  (2,99 $ the first year, then 38,39 $ a year). `.ci` must be checked with the Ivorian registry. Until a
  domain is bought, stores live at `jeere.kreeative.xyz/b/<adresse>` (see [Domaines](#domaines)); only the
  hero illustration still shows « chezawa.jeere.shop » (the hero is frozen: change `.bt__url` when it is not).
- Add the @annklyy links (TikTok, Instagram) to the footer once you start posting.
