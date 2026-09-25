# Kreeative — portfolio website

The website of Kreeative, the graphic design studio of Anne-Kelly Kouyaté.
This is a plain, dependency-free static site (HTML + CSS + a little JS): no
Framer, no build step, no subscription. Open `index.html` in a browser and it
works.

## Pages

| URL                                                         | File                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `/`                                                         | `index.html`                                                     |
| `/portfolio/revitalizing-customer-engagement-for-fluxcrm/`  | `portfolio/revitalizing-customer-engagement-for-fluxcrm/index.html` (The Bakery) |
| `/portfolio/streamlining-e-commerce-for-zenithcart/`        | `portfolio/streamlining-e-commerce-for-zenithcart/index.html` (Gogiya) |
| `/portfolio/designing-a-seamless-user-experience-for-taskflow/` | `portfolio/designing-a-seamless-user-experience-for-taskflow/index.html` (GloryWalk) |
| `/portfolio/nexatech/`                                      | `portfolio/nexatech/index.html` (Lyzma Industries)               |
| `/websites/rich-and-friends/`                               | `websites/rich-and-friends/index.html`                           |
| `/websites/the-ivory-sukundu/`                              | `websites/the-ivory-sukundu/index.html`                          |
| `/websites/keewal-meere/`                                   | `websites/keewal-meere/index.html`                               |
| `/websites/cameleon/`                                       | `websites/cameleon/index.html`                                   |
| `/websites/tabouret/`                                       | `websites/tabouret/index.html`                                   |
| `/pricing/`                                                 | `pricing/index.html`                                             |
| `/the-kreeative-designer-newsletter/`                       | `the-kreeative-designer-newsletter/index.html`                   |
| any unknown URL                                             | `404.html`                                                       |

The portfolio URLs are the ones the old Framer site used, so existing links
keep working.

## Folder structure

```
assets/css/base.css        fonts, colour/type tokens, reset, typography, page frame
assets/css/components.css  nav, buttons, footer, pills, animations, decorations
assets/css/home.css        home-page sections
assets/css/case-study.css  case-study template
assets/css/pricing.css     pricing page
assets/css/misc.css        newsletter + 404 pages
assets/js/site.js          scroll-in animations, hero headline, pixel canvases, menu
assets/fonts/              self-hosted woff2 fonts
assets/img/                optimised WebP images (+ favicons, social image)
assets/icons/              Phosphor icon SVGs used inline in the pages
tools/site-screenshots.mjs screenshots the sites shown on the home page
.github/workflows/         the workflow that runs that script
docs/DESIGN.md             design tokens and breakpoints, for reference
```

## Preview locally

Any static server works, for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Hosting

The site is deployed to Vercel from this repository (project
**kreeative-site**, connected to the GitHub repo). Live preview:
https://kreeative-site.vercel.app

Two free ways to serve it on **kreeative.xyz** — pick one:

### Option A — Vercel (recommended)

1. In Vercel open the **kreeative-site** project → **Settings → Domains** →
   **Add** `kreeative.xyz` (Vercel will also suggest `www.kreeative.xyz`;
   accept it so both work).
2. In GoDaddy → **My Products → kreeative.xyz → DNS**, remove any existing
   `A` record for `@` and any `CNAME` for `www`, then add:

| Type  | Name | Value                  | TTL     |
| ----- | ---- | ---------------------- | ------- |
| A     | @    | 76.76.21.21            | default |
| CNAME | www  | cname.vercel-dns.com   | default |

Once DNS propagates (minutes to a few hours) Vercel issues the HTTPS
certificate automatically. Also check **Settings → Git → Production Branch**
matches the branch you push to, so every push goes live.

### Option B — GitHub Pages

1. On GitHub open the repository → **Settings → Pages**.
2. Under **Build and deployment** choose **Deploy from a branch**, pick the
   branch (`main`) and the folder `/ (root)`, then **Save**.
3. After about a minute the site is live at `https://<user>.github.io/<repo>/`.
   The `CNAME` file in this repo tells GitHub Pages the custom domain is
   `kreeative.xyz`; once DNS (below) is set, Pages will serve the site on the
   domain and provision HTTPS automatically. Tick **Enforce HTTPS** when it
   becomes available.

#### Point kreeative.xyz at GitHub Pages (GoDaddy DNS)

In GoDaddy → **My Products → kreeative.xyz → DNS**, remove any existing `A`
record for `@` and any `CNAME` for `www`, then add:

| Type  | Name | Value                   | TTL     |
| ----- | ---- | ----------------------- | ------- |
| A     | @    | 185.199.108.153         | default |
| A     | @    | 185.199.109.153         | default |
| A     | @    | 185.199.110.153         | default |
| A     | @    | 185.199.111.153         | default |
| CNAME | www  | `<user>.github.io`      | default |

Replace `<user>` with the GitHub account or organisation that owns this
repository. DNS changes take from a few minutes to a few hours to propagate.

## Editing content

* Text: edit the HTML files directly; the copy is plain text inside the
  `<p>`, `<h2>`… tags.
* Adding a case study: copy one of the `portfolio/*/index.html` folders, change
  the copy and image names, add a card to the **Featured Projects** grid in
  `index.html`, and add the URL to `sitemap.xml`.
* Images: put optimised WebP files in `assets/img/` (a few sizes each, e.g.
  660 / 1000 / 2000 px wide) and reference them with `srcset`.
* **Websites I built** (home page): the screenshots in `assets/img/sites/` are
  taken automatically by the **Site screenshots** workflow (GitHub → Actions →
  *Site screenshots* → *Run workflow*). Run it again whenever one of the sites
  changes; it commits the fresh images. To add a site, add it to the list at
  the top of `tools/site-screenshots.mjs`, copy a card in `index.html` and copy
  one of the `websites/*/index.html` pages for its story.

## Credits

Fonts: Fraunces, Inter, Inter Tight, DM Mono (SIL Open Font License).
Icons: [Phosphor Icons](https://phosphoricons.com) (MIT).
