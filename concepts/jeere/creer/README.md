# JEERE Studio — store editor prototype

A working prototype of the JEERE store builder: a seller picks a template **or** describes her
store to the JEERE assistant, then edits it in an editor with a live preview, and can see the
**fiche boutique** (the store config JSON) behind it.

It demonstrates JEERE's key architecture: **the AI never writes code.** It fills a fiche
boutique; our three tested templates render it; the editor edits the very same JSON. A store is
data, not a generated website.

Live (unlisted): https://kreeative.xyz/concepts/jeere/creer/ — `noindex, nofollow`, not linked
from the landing page and not in the sitemap. French only (Côte d'Ivoire, prices in FCFA).

```
Start screen « Créez votre boutique »
 ├─ Partir d'un modèle ─ Plateau · Cocody · Treichville ─┐
 ├─ Décrire ma boutique ─ l'assistant JEERE (chat) ──────┼──► Editor + live preview ──► Fiche boutique (JSON)
 └─ Partir de zéro ─ « Bientôt »                         │      (same JSON in and out)
                                                          └─ JEERE_DATA.defaultConfig / JeereWizard.generate
```

## Open it

- Online: `/concepts/jeere/creer/` on kreeative.xyz.
- Locally: serve the repository root (the page uses `../favicon.svg` and links back to the landing):

  ```sh
  python3 -m http.server 8000 --directory /path/to/kreeative-
  # then open http://localhost:8000/concepts/jeere/creer/
  ```

## Files and who does what

Plain static files: no build step, no framework, no library. Classic scripts loaded with
`defer`, in this order; each is an IIFE that exposes exactly one global.

| File | Role | Global |
| --- | --- | --- |
| `data.js` | The contract: templates, 8 palettes (contrast-checked), 6 font pairs, the 8 section types and their form fields, 8 niches with French example content, Abidjan communes and fees. Pure helpers: `defaultConfig`, `normalizeConfig`, `validate`, `formatPrice`, `normalizeWhatsapp`, `newId`, `clone`. No DOM access, so it also loads in Node and in a Supabase Edge Function. | `window.JEERE_DATA` |
| `render.js`, `store.css` | Renders a fiche into a store (header, enabled sections, footer) for a phone (390 px) or desktop (1200 px) frame. Pure and defensive: escapes every string, never throws, draws product illustrations in SVG when there is no photo. Store CSS is scoped under `.jst`. | `window.JeereRender` |
| `index.html`, `builder.css`, `editor.js` | The start screen and the editor: tabs Sections, Produits, Thème, Boutique, Qualité; device toggle; undo/redo; autosave to `localStorage` (`jeere-studio-config`); the « Fiche boutique » modal (copy, download, import); the « Publier » dialog (prototype: nothing is published). | `window.JeereBuilder` |
| `wizard.js`, `wizard.css` | « Décrire ma boutique »: the local JEERE assistant, a chat that asks 6 questions (name, what you sell, style, colour, needs, city and WhatsApp), understands free text by keywords, handles corrections, and ends with a summary card. `generate(answers)` and `understand(text, step)` are pure and exposed for tests. Styles scoped under `.jwz`. | `window.JeereWizard` |
| `schema.json` | JSON Schema (draft 2020-12) of the fiche boutique v1. | — |
| `prompts.md` | In French: the single AI assistant of the real product — system prompt, its one tool, the free code around it, the self-improvement loop, the TypeScript orchestration and the cost estimate. | — |
| `README.md` | This file. | — |

The builder chrome (start screen, editor, chat) is black and white only, in Poppins with a
Montserrat fallback for ɛ ɔ ŋ, like the landing page. The stores in the preview are in colour:
sellers bring the colour.

## The fiche boutique contract (version 1)

One JSON object, fully described by [`schema.json`](schema.json) (`$id`
`https://kreeative.xyz/concepts/jeere/creer/schema.json`). Ids, labels and limits come from
`data.js`.

```json
{
  "version": 1,
  "template": "cocody",
  "store": { "name": "Awa Beauté", "tagline": "Soins naturels faits à Abidjan", "whatsapp": "+2250707123456", "city": "Abidjan", "niche": "beauty" },
  "theme": { "palette": "karite", "fonts": "doux", "radius": "round", "buttons": "solid" },
  "payments": { "wave": true, "orange": true, "mtn": true, "moov": false, "cod": true, "card": false },
  "sections": [
    { "id": "s1", "type": "announcement", "enabled": true, "settings": { "text": "Livraison offerte dès 20 000 FCFA à Cocody" } },
    { "id": "s2", "type": "hero", "enabled": true, "settings": { "kicker": "Nouvelle collection", "title": "Awa Beauté : des soins simples et naturels", "text": "…", "button": "Découvrir", "image": null } }
  ],
  "products": [
    { "id": "p1", "name": "Beurre de karité fouetté", "price": 6500, "category": "Corps", "badge": "best", "art": "jar", "color": "#E9D8BD", "description": "…", "image": null }
  ]
}
```

| Key | Values |
| --- | --- |
| `template` | `plateau` (Éditorial), `cocody` (Doux), `treichville` (Audacieux) |
| `store.niche` | `fashion`, `hair`, `beauty`, `jewellery`, `shoes`, `food`, `home`, `crafts`, or `null` |
| `store.whatsapp` | `""` or an international number (`+2250707123456`); the editor and the assistant normalise what the seller types |
| `theme.palette` | `sable`, `karite`, `lagune`, `hibiscus`, `indigo`, `mangue`, `menthe`, `nuit` (the fiche names a palette; the colours live in `data.js`) |
| `theme.fonts` | `editorial`, `moderne`, `doux`, `audacieux`, `classique`, `simple` |
| `theme.radius` / `theme.buttons` | `none`, `soft`, `round` / `solid`, `outline` |
| `payments` | exactly `wave`, `orange`, `mtn`, `moov`, `cod`, `card` (booleans), shown as plain text, never with the operators' logos |
| `sections[]` | ordered; ids `s1`, `s2`…; `type` is one of `announcement`, `hero`, `categories`, `products`, `about`, `reviews`, `delivery`, `whatsapp`; `enabled`; `settings` specific to the type (the schema checks each type with `if`/`then`) |
| `products[]` | ids `p1`, `p2`…; `price` is a whole number of FCFA (`6500`, formatted `6 500 FCFA` for display); `badge` `null`, `new`, `best` or `promo`; `art` one of 12 illustrations; `color` `#RRGGBB`; `image` `null` or a JPEG data URL (≤ 800 px wide) |

The header and the footer are always rendered and are not sections. Character limits (hero
title 70, announcement 90, product name 60, store name 40…) are the editor's and are in the
schema.

Three layers check a fiche:

1. **`schema.json`** — structure, enums, integers, ranges and character limits. This is the
   contract the real AI assistant's output is checked against.
2. **`JEERE_DATA.validate(config)`** — quality rules with a score out of 100 and a status
   (`APPROUVÉ` or `À CORRIGER`): empty store name, no payment method, products section with no
   product, missing WhatsApp number, fewer than 3 products, products without a photo… The editor's
   Qualité tab shows them. A default fiche scores 92.
3. **`JEERE_DATA.normalizeConfig(anything)`** — repairs: fills missing keys, drops unknown types,
   fixes ids, parses prices (`'12 500 FCFA'` → `12500`). The editor runs it on import and on load.
   Unique ids are guaranteed here (JSON Schema cannot express them).

## What is simulated

- **The assistant runs locally, without AI.** In this prototype, « l'assistant JEERE » understands
  keywords (accents and case ignored), handles corrections and always ends with a valid fiche. It
  says so under its summary card. In the real product, **one** AI assistant (one model, one API
  key, one tool that fills the same fiche) takes its place, and this local assistant stays as the
  free fallback when the AI is down or the monthly budget is reached. Everything about it is in
  [`prompts.md`](prompts.md): the ready-to-paste French system prompt, the `mettre_a_jour_fiche`
  tool, validation and retries done by code, the self-improvement loop (Supabase nightly job, no
  retraining), the TypeScript Edge Function with the Anthropic SDK (`claude-haiku-5-5` by
  default), and a cost estimate (about $0.007 per generated store with Claude Haiku 5.5).
- **Nothing is published and nothing leaves the browser.** « Publier » opens a dialog that
  explains this and points to the waitlist (`../#liste`). The work is saved in `localStorage` on
  this device only.
- **Payments, orders, WhatsApp and delivery** are shown as they would look in a store; none of
  them works. Every store, product, price, review and person is a made-up example.
- **« Partir de zéro »** is shown as « Bientôt ». It will be an empty template with the same
  sections, rendered by the same templates.

## How to test

In a browser, at 360 px wide (Chrome device mode, a cheap Android phone) and on desktop:

1. Start screen: the three template cards show live previews; « Partir de zéro » is disabled.
2. Pick a template: the editor opens with the matching default fiche. Switch Téléphone /
   Ordinateur, edit a section, add a product with a photo, change the palette and the template,
   undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), check the Qualité tab.
3. « Fiche boutique »: the JSON (photos shown as `[photo]`), Copier, Télécharger, Importer.
4. Reload: « Reprendre ma boutique » brings the store back.
5. « Décrire ma boutique »: answer by chips and by free text (« slt c Mariam Hair, jvd des
   perruques »), try a correction (« non, plutôt audacieux »), then « Ouvrir l'éditeur ».
6. No horizontal scroll at 360 px, the input stays above the on-screen keyboard, Esc closes the
   dialogs, everything works with the keyboard.

From the command line (Node, from this folder):

```sh
# data.js has no DOM access: load it in Node and print a default fiche
node -e "global.window={};require('./data.js');const D=window.JEERE_DATA;const c=D.defaultConfig('cocody','beauty');console.log(D.validate(c).score, D.validate(c).status);require('fs').writeFileSync('/tmp/fiche.json', JSON.stringify(c,null,2))"

# validate a fiche against schema.json (draft 2020-12), with either tool
npx ajv-cli validate --spec=draft2020 -s schema.json -d /tmp/fiche.json
python3 -c "import json,jsonschema;jsonschema.Draft202012Validator(json.load(open('schema.json'))).validate(json.load(open('/tmp/fiche.json')));print('valid')"
```

When the schema was written, every `defaultConfig(template, niche)` (3 templates × 8 niches),
`normalizeConfig` of garbage input and an editor-like fiche with a photo validated, with both
Python `jsonschema` and Ajv in strict mode; 41 broken fiches (unknown palette, price as text,
rating 6, image URL, wrong settings for the type…) were rejected.

## Known limits

- One store per browser, saved in `localStorage`: no account, no sync between devices. Large
  photos can fill the storage quota; the editor then saves the store without its photos, says so
  and keeps working. Download the fiche boutique to keep the photos.
- The local assistant only knows its keyword lists; an unusual phrasing gets « je n'ai pas
  compris » and the chips. It never invents products: it uses the niche's example products.
- The example reviews in the default fiches are made up. A real store must never publish invented
  reviews as genuine; the real assistant disables the section until the seller adds real ones
  (see `prompts.md`).
- Product illustrations are generic SVG drawings; a real store needs real photos (the Qualité tab
  says so).
- No cart, checkout, order flow or payment: the stores are previews.
- Fonts come from Google Fonts: offline, the store falls back to system fonts.

## Next steps

1. **Connect the single assistant described in [`prompts.md`](prompts.md)**: a Supabase Edge
   Function holding the Anthropic API key as a secret, the system prompt and its one tool, code
   validation with `schema.json` and `JEERE_DATA.validate`, monthly and per-store budget caps, and
   this prototype's local assistant as the free fallback.
2. Save fiches in Supabase (one row per store) instead of `localStorage`, with a seller account.
3. Start the « il se nourrit lui-même » loop: anonymised kept stores (opt-in), the nightly job that
   updates the defaults library, the few-shot examples and the keyword lists.
4. A real public store page that renders a saved fiche with `render.js` at its own address.
5. « Partir de zéro », then orders on WhatsApp, delivery by commune and mobile-money payments.

## Ground rules

- Private for now: `<meta name="robots" content="noindex, nofollow">`, not linked from the
  portfolio and not in the sitemap.
- No logos or brand colours of Wave, Orange, MTN or Moov: they appear as plain text.
- All content is a made-up example (Awa Beauté, Maison Adjoa, Pointure 225…).
