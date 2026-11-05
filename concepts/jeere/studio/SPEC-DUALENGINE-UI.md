# DualEngine — Directives de design visuel et spécifications micro-géométriques

*Complément de `SPEC-DUALENGINE.md` (moteur). Ce document fixe l'apparence et le comportement de l'interface de l'outil (chrome, panneaux, barres, icônes), pas celui des sites produits par l'utilisateur. Toute valeur citée est un token (§0) ; aucune valeur brute n'est autorisée dans le CSS de l'application.*

---

## 0. Socle : tokens, unités, règles de rendu

### 0.1 Principes non négociables

1. **Grille de 4 px.** Toute distance (padding, gap, marge, taille de contrôle, rayon) est un multiple de 4 px. Exceptions listées et bornées : bordures (0.5 / 1 px), traits d'icônes (1 / 1.5 px), décalages optiques d'icônes (≤ 1 px), épaisseur d'indicateurs (2 px).
2. **Animer uniquement `transform` et `opacity`** (composités par le GPU). Les changements de taille passent par FLIP (§3.3). Exceptions bornées : `grid-template-rows` pour les accordéons (§3.4), `color`/`background-color`/`box-shadow` pour les états de survol (§4.2).
3. **Rendu net au pixel device.** Toute ligne fine, tout bord de conteneur et tout trait d'icône tombe sur la grille device (`1 / devicePixelRatio` px).
4. **Aucune information portée par la seule couleur ni par la seule animation.** `prefers-reduced-motion` désactive tout mouvement non essentiel (§3.6).

### 0.2 Tokens primitifs

```css
:root {
  /* Espacement — échelle 4 px */
  --sp-0: 0; --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px;

  /* Tailles de contrôles */
  --ctl-xs: 20px;   /* puces, toggles d'œil/cadenas dans l'arbre */
  --ctl-sm: 24px;   /* champs numériques de l'inspecteur */
  --ctl-md: 28px;   /* boutons et champs standard, lignes de calques */
  --ctl-lg: 32px;   /* boutons d'outils de la barre du haut */
  --ctl-xl: 40px;   /* barre d'outils flottante (44px en pointeur grossier) */

  /* Rayons (lissage : §1.2) */
  --r-xs: 4px;   /* puces, kbd */
  --r-sm: 6px;   /* champs, boutons d'icônes */  /* 6 = exception tolérée (2 × 3), seul rayon hors grille */
  --r-md: 8px;   /* boutons, menus, items de liste */
  --r-lg: 12px;  /* popovers, cartes, barre flottante (rayon interne des items : 8) */
  --r-xl: 16px;  /* dialogues, palette de commandes */
  --r-pill: 999px;

  /* Typographie (Inter, chiffres tabulaires dans l'inspecteur) */
  --font-ui: "Inter", "Inter var", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --fs-11: 11px; --lh-11: 16px;   /* défaut des panneaux */
  --fs-12: 12px; --lh-12: 16px;   /* labels de groupes, menus */
  --fs-13: 13px; --lh-13: 20px;   /* titres de panneaux, palette */
  --fs-15: 15px; --lh-15: 20px;   /* titres de dialogues */
  --fw-regular: 450;  --fw-medium: 550;  --fw-semibold: 620;   /* axes variables d'Inter */
  --tracking-11: 0.005em; --tracking-13: -0.006em;               /* Inter : approché de la table dynamique officielle */

  /* Mouvement */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);   /* courbe signature : départ vif, arrivée longue */
  --ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1);
  --ease-out:      cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-instant: 80ms;  --dur-fast: 120ms;  --dur-base: 160ms;  --dur-panel: 200ms;  --dur-slow: 280ms;
}
```

### 0.3 Tokens sémantiques de couleur (OKLCH, mode sombre par défaut)

Les couleurs sont définies en **OKLCH** : les interpolations de survol (§4.2) sont alors perceptuellement régulières (pas de passage terne en milieu de transition) et la luminosité se règle indépendamment de la teinte. Repli sRGB par `@supports not (color: oklch(0 0 0))`.

```css
:root[data-theme="dark"] {
  --bg-canvas:   oklch(0.205 0 0);        /* ≈ #1E1E1E — fond du canvas */
  --bg-panel:    oklch(0.235 0 0);        /* ≈ #262626 — panneaux latéraux */
  --bg-raised:   oklch(0.27 0 0);         /* popovers, barre flottante, menus */
  --bg-overlay:  oklch(0.30 0 0);         /* dialogues */
  --bg-hover:    oklch(1 0 0 / 0.06);     /* fond de survol des items */
  --bg-active:   oklch(1 0 0 / 0.10);     /* pressé / sélectionné neutre */
  --bg-input:    oklch(1 0 0 / 0.04);

  --fg-1: oklch(0.97 0 0);                /* texte principal ≈ #F5F5F5 — 14.9:1 sur --bg-panel */
  --fg-2: oklch(0.80 0 0);                /* secondaire — 9.0:1 */
  --fg-3: oklch(0.66 0 0);                /* tertiaire, placeholders — 5.0:1 (≥ 4.5 exigé) */
  --fg-disabled: oklch(0.50 0 0);         /* désactivé (exempté WCAG, jamais seul porteur d'info) */

  --line-1: oklch(1 0 0 / 0.08);          /* hairline : séparation de panneaux */
  --line-2: oklch(1 0 0 / 0.12);          /* contour de champs au repos */
  --line-3: oklch(1 0 0 / 0.20);          /* contour au survol */
  --highlight-top: oklch(1 0 0 / 0.06);   /* arête lumineuse (§2.3) */

  --accent:      oklch(0.57 0.23 266);    /* bleu sélection ≈ #3657FF */
  --accent-hover:oklch(0.62 0.21 266);
  --accent-fg:   oklch(1 0 0);            /* texte sur accent — 5.3:1 */
  --accent-soft: oklch(0.57 0.23 266 / 0.18);
  --focus-ring:  oklch(0.70 0.17 266);    /* anneau de focus, 3:1 min sur tous les fonds */
}
```

Contrastes : vérifiés par la suite automatique (§5) ; tout token de texte doit atteindre **4.5:1** sur `--bg-panel` et `--bg-raised`, tout token d'icône ou de contour de contrôle **3:1** (WCAG 1.4.11).

---

## 1. Micro-géométrie des icônes et courbures

### 1.1 Grille d'icônes et traits

Deux grilles exclusives, chacune avec son épaisseur unique :

| Grille | Usage | Zone vive (live area) | Trait | Coordonnées de trait |
| --- | --- | --- | --- | --- |
| **16 × 16** | inspecteur, arbre de calques, menus, palette | 14 × 14 centrée (marge 1 px) | **1 px** à 1× ; **1.5 px** à ≥ 2× | centres sur `n + 0.5` (1×) ; sur `n + 0.25 / n + 0.75` (1.5 px à 2×) |
| **24 × 24** | barre flottante, barre du haut, dialogues | 20 × 20 centrée (marge 2 px) | **1.5 px** | centres sur `n + 0.75` ou `n + 0.25` (1.5 px à 2× = 3 px device) |

**Pourquoi la position du centre du trait importe.** Un trait SVG est centré sur le chemin. Un trait de 1 px dont le centre est sur une coordonnée entière couvre deux demi-pixels → deux pixels gris à 50 %, donc flou. Règle :

```
largeur de trait en px device  wD = w · dpr
si wD est impair (1, 3) : centre du trait sur n + 0.5 px device  → en px CSS : (k + 0.5) / dpr
si wD est pair   (2, 4) : centre du trait sur n px device         → en px CSS : k / dpr
```

À 1× : trait 1 px → centres sur `.5`. À 2× : trait 1.5 px = 3 px device (impair) → centres sur `(k + 0.5)/2` = `.25` ou `.75`. Le pipeline d'icônes (§1.4) vérifie cette règle sur chaque segment horizontal et vertical, et refuse l'icône sinon.

**« Inside stroke » des icônes.** SVG n'a pas d'alignement intérieur pour les traits. On l'obtient à la construction, pas au rendu : le chemin source est dessiné comme le **contour extérieur** de l'icône, puis décalé vers l'intérieur de `w/2` (offset de chemin, outil de build, §1.4). Résultat : le bord extérieur du trait coïncide avec la zone vive, et l'icône garde la même emprise quelle que soit l'épaisseur.

Autres règles de construction :

- `stroke-linecap: round`, `stroke-linejoin: round` partout (cohérence avec la typographie Inter et le logo dessiné). Les segments purement horizontaux/verticaux gardent des terminaisons `round` : elles n'introduisent pas de flou car le capuchon déborde de `w/2` exactement.
- **Formes de base dans la zone vive** (keylines) : cercle Ø 20 (sur 24), carré 18 × 18, rectangle vertical 16 × 20, rectangle horizontal 20 × 16 ; les icônes de masse visuelle similaire paraissent ainsi de même taille.
- **Rayons internes des icônes** : 2 px (sur 24) / 1.5 px (sur 16) ; jamais de coin vif, sauf sémantique (curseur de sélection).
- **Couleur** : `currentColor` uniquement ; aucune icône multicolore dans le chrome (les icônes de type de section en couleur sont réservées aux vignettes d'insertion).
- **Remplissage d'état** : une icône « active » (outil sélectionné) peut passer en variante remplie (`fill: currentColor; stroke: none`) dessinée sur la même grille, jamais par un simple `fill` ajouté au trait.
- **Un seul jeu** : pas de mélange de bibliothèques. Un écart de style (épaisseur, rayon, capuchons) entre deux icônes visibles en même temps est un défaut bloquant.

### 1.2 Courbure continue (squircle / lissage des coins)

Un `border-radius` CSS est un quart de cercle raccordé à un segment droit : la courbure passe brutalement de 0 à `1/r` au point de raccord (continuité G¹ seulement), ce que l'œil perçoit comme une « cassure » sur les grands rayons. Le lissage des coins (Figma, iOS) remplace ce raccord par une courbe dont la courbure croît progressivement (continuité G² approchée).

**Barème d'application** (le lissage n'est perceptible qu'à partir d'un certain rayon ; en dessous il coûte sans rien apporter) :

| Élément | Rayon | Lissage | Implémentation |
| --- | --- | --- | --- |
| Puces, kbd, cases, champs (`--r-xs`, `--r-sm`) | 4–6 px | 0 % | `border-radius` |
| Boutons, items de menu, lignes de calques (`--r-md`) | 8 px | 0 % | `border-radius` (le lissage à 8 px change < 0.3 px : imperceptible) |
| Popovers, cartes, barre flottante (`--r-lg`) | 12 px | **60 %** | `corner-shape` ou chemin généré |
| Dialogues, palette de commandes, panneaux flottants (`--r-xl`) | 16 px | **60 %** | idem |
| Vignettes d'artboard, aperçus | 12–16 px | 60 % | idem |

60 % est la valeur de référence (équivalent iOS selon Figma) ; 100 % est réservé aux éléments décoratifs de grande taille (≥ 24 px de rayon) où la forme doit paraître organique.

**Implémentation, du plus natif au plus coûteux :**

1. **`corner-shape` (CSS Borders Level 4)**, natif, n'affecte ni les ombres ni les bordures :

```css
.surface-smooth {
  border-radius: var(--r-lg);
}
@supports (corner-shape: squircle) {
  .surface-smooth { corner-shape: superellipse(var(--smooth-k, 1.6)); }
}
```

`superellipse(k)` paramètre l'exposant de la superellipse (`squircle` = `superellipse(2)`). La correspondance avec le pourcentage de lissage Figma n'est pas linéaire : on fixe `--smooth-k` par **calibration** (§5) en comparant le chemin Figma 60 % (formule de `SPEC-DUALENGINE.md` §3.2) au rendu natif pour `r ∈ {12, 16, 24}` et `w, h ∈ {120, 240, 480}`, en minimisant l'écart maximal entre les deux contours (objectif < 0.25 px). Valeur initiale proposée : `1.6`.

2. **Repli : masque SVG généré** pour les navigateurs sans `corner-shape`. Le chemin superellipse est calculé en JS à la taille réelle (via `ResizeObserver`), converti en `mask-image: url("data:image/svg+xml,…")` (et non `clip-path`, pour pouvoir garder l'ombre sur un parent) :

```
structure : .surface (ombre + fond via ::before)  >  ::before { mask: <chemin> ; background: var(--bg-raised) }
```

L'ombre est portée par `filter: drop-shadow()` sur le conteneur (elle suit alors la forme masquée) ; la bordure hairline est dessinée par un second `::after` masqué par le même chemin rétréci de 0.5 px. Le masque est recalculé seulement quand la taille change d'au moins 1 px (débounce `rAF`).

3. **Repli minimal** (aucun JS, navigateur ancien) : `border-radius` simple. C'est un dégradé esthétique accepté, jamais une casse.

**Rayons imbriqués** (règle obligatoire, cause n° 1 d'aspect « amateur ») : un enfant dans un conteneur arrondi utilise `r_enfant = max(0, r_parent − padding)`. Exemple : barre flottante `--r-lg` 12 px avec padding 4 px → items `8px` (`--r-md`). Le lissage de l'enfant suit celui du parent.

### 1.3 Alignement optique

Le centre mathématique d'une boîte n'est pas son centre perçu : un triangle « lecture » paraît décalé vers la gauche quand sa boîte est centrée, une flèche de curseur paraît trop haute, un `+` paraît plus petit qu'un `○` de même boîte.

**Algorithme de compensation (exécuté au build, résultat figé dans le SVG) :**

1. Rastériser l'icône à 8× (192 × 192 pour une grille 24) en niveaux de gris, en noir sur blanc.
2. Calculer le **centroïde pondéré par la couverture** (centre de masse de l'encre) :

```
Cx = Σ x·α(x,y) / Σ α(x,y)        Cy = Σ y·α(x,y) / Σ α(x,y)        α = couverture ∈ [0,1]
```

3. Comparer au centre de la zone vive `(Bx, By)` ; décalage brut `Δ = (Bx − Cx, By − Cy)`.
4. **Ne pas compenser à 100 %** : le centre perçu est entre le centre de masse et le centre de la boîte. Décalage appliqué :

```
δ = clamp(λ · Δ, −1px, +1px)        avec λ = 0.5 (valeur de départ, ajustée par revue visuelle)
δ arrondi au 0.25 px (= 0.5 px device à 2×) pour rester sur la grille de trait
```

5. Écrire le décalage dans le SVG (`<g transform="translate(δx δy)">`), jamais en CSS au rendu. Le pipeline vérifie qu'après décalage les traits horizontaux/verticaux respectent encore la règle de netteté (§1.1) ; sinon il arrondit δ vers la valeur la plus proche qui la respecte.

Exemples attendus (24 × 24) :

| Icône | Δ brut typique | δ appliqué |
| --- | --- | --- |
| Lecture ▶ (triangle pointe à droite) | +1.6 px en x | +0.75 px en x |
| Curseur de sélection (flèche haut-gauche) | +1.2 px x, +1.4 px y | +0.5 x, +0.75 y |
| Pause ❚❚, croix, cercle, carré | ≈ 0 | 0 |

**Taille optique** (même pipeline) : on mesure l'aire d'encre `A = Σ α` ; une icône dont `A` est inférieure de plus de 25 % à la médiane de son jeu (ex. `+`, `×`) est redessinée avec un trait de même épaisseur mais une emprise plus grande (keyline carré 18 au lieu de 16), jamais en changeant l'épaisseur.

**Alignement optique du texte et des icônes** : dans un bouton icône + label, l'icône est alignée sur la **hauteur d'x** du texte, pas sur la ligne de base : en Inter 11 px, l'icône 16 px est remontée de `0.5 px` (`translateY(-0.5px)` dans le composant). Les chiffres de l'inspecteur utilisent `font-variant-numeric: tabular-nums` et la fonctionnalité `ss01`/`cv11` d'Inter (zéro barré désactivé, `1` sans empattement) pour que les valeurs ne « dansent » pas pendant le scrub.

### 1.4 Pipeline d'icônes (outillage)

```
sources/  icons/*.svg (dessinées sur grille 16 ou 24, contour extérieur)
   │  1. lint : viewBox exacte, aucun fill parasite, couleurs → currentColor
   │  2. offset intérieur de w/2 (inside stroke)
   │  3. compensation optique (§1.3)
   │  4. vérification netteté (§1.1) à dpr 1 et 2 : test raster « aucun segment axial sur 2 pixels partiels »
   │  5. optimisation (précision 2 décimales, suppression des métadonnées)
   ▼
dist/  sprite.svg (<symbol id="i-…">) + icons.json (nom, grille, δ, aire)
```

Utilisation : `<svg class="ic ic-16"><use href="#i-hand"/></svg>`, `width/height` en px entiers, `shape-rendering: geometricPrecision` (laisser l'anti-aliasing ; la netteté vient des coordonnées, pas de `crispEdges` qui déforme les courbes).

---

## 2. Bordures et effets de surface

### 2.1 Bordures fines (hairlines)

Objectif : séparer les panneaux sans poids visuel, avec un trait d'**un pixel device** quelle que soit la densité.

```css
:root { --hair: 1px; }
@media (min-resolution: 2dppx) { :root { --hair: 0.5px; } }
@media (min-resolution: 3dppx) { :root { --hair: 0.334px; } }

.panel-left  { box-shadow: inset calc(-1 * var(--hair)) 0 0 var(--line-1); }   /* séparateur droit, sans changer la boîte */
.field       { box-shadow: inset 0 0 0 var(--hair) var(--line-2); }
.field:hover { box-shadow: inset 0 0 0 var(--hair) var(--line-3); }
```

Règles :

- **Toujours en `box-shadow: inset` ou en pseudo-élément**, jamais en `border` : une bordure change la boîte (décalage de 1 px du contenu au survol, sauts de layout) ; une ombre interne non.
- Les valeurs `0.5px` ne sont émises que sous `min-resolution: 2dppx` : à 1×, Chromium arrondit une bordure inférieure à 1 px au pixel device (donc 1 px) mais d'autres moteurs peuvent la faire disparaître.
- Opacité de référence : `--line-1` (8 % de blanc) pour les séparations de panneaux, `--line-2` (12 %) pour les contours de champs, `--line-3` (20 %) au survol. **Une seule hairline entre deux zones** : deux panneaux adjacents ne dessinent pas chacun leur bord (la règle est portée par le panneau de gauche/du haut).
- **Contraste des contrôles** : un champ dont la seule délimitation est la hairline à 12 % n'atteint pas 3:1 ; il est donc toujours accompagné d'un fond `--bg-input` et d'un label, et son état de focus (anneau 2 px `--focus-ring`, §4.3) atteint 3:1. C'est conforme à WCAG 1.4.11 (le composant est identifiable par son label et son fond).

### 2.2 Ombres étagées (élévation)

Une ombre réaliste n'est pas un flou unique : la lumière ambiante produit une ombre de contact courte et dense, et la lumière directionnelle une ombre longue et diffuse. On empile 3 à 4 couches dont le flou double à chaque niveau.

**Mode clair** (fonds clairs : les opacités très faibles fonctionnent) :

```css
--elev-1: 0 1px 1px rgb(0 0 0 / 0.03), 0 2px 4px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.025);
--elev-2: 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.03), 0 8px 16px rgb(0 0 0 / 0.03), 0 16px 32px rgb(0 0 0 / 0.025);
--elev-3: 0 2px 4px rgb(0 0 0 / 0.03), 0 8px 16px rgb(0 0 0 / 0.03), 0 16px 32px rgb(0 0 0 / 0.03), 0 32px 64px rgb(0 0 0 / 0.03);
```

**Mode sombre** — une ombre noire à 3 % sur un fond à 20 % de luminance est invisible : sur fond sombre, l'élévation est portée d'abord par la **luminosité de la surface** (`--bg-panel` → `--bg-raised` → `--bg-overlay`, +3 points de L OKLCH par niveau), ensuite par la hairline et l'arête lumineuse (§2.3), enfin par une ombre plus dense pour détacher l'objet du canvas :

```css
[data-theme="dark"] {
  --elev-1: 0 1px 2px rgb(0 0 0 / 0.24), 0 2px 6px rgb(0 0 0 / 0.16);
  --elev-2: 0 1px 2px rgb(0 0 0 / 0.30), 0 4px 10px rgb(0 0 0 / 0.20), 0 12px 24px rgb(0 0 0 / 0.16);
  --elev-3: 0 2px 4px rgb(0 0 0 / 0.32), 0 8px 16px rgb(0 0 0 / 0.24), 0 24px 48px rgb(0 0 0 / 0.24), 0 48px 96px rgb(0 0 0 / 0.16);
}
```

| Niveau | Éléments | Surface (sombre) |
| --- | --- | --- |
| 0 | panneaux ancrés, canvas | `--bg-panel`, `--bg-canvas` (aucune ombre) |
| 1 | barre contextuelle de sélection, infobulles | `--bg-raised` + `--elev-1` |
| 2 | barre flottante, menus, popovers | `--bg-raised` + `--elev-2` |
| 3 | dialogues, palette de commandes | `--bg-overlay` + `--elev-3` + voile `rgb(0 0 0 / 0.40)` |

Performance : les ombres larges (`48–96px`) sont coûteuses lors des animations ; un élément qui s'anime en position porte son ombre sur un **pseudo-élément** dont seule l'`opacity` varie, jamais `box-shadow` lui-même.

### 2.3 Arête lumineuse (inner glow / bevel)

Simule la lumière qui accroche le bord supérieur d'une surface. Une seule règle, appliquée par niveau :

```css
.surface-raised { box-shadow: inset 0 0.5px 0 var(--highlight-top), inset 0 0 0 var(--hair) var(--line-1), var(--elev-2); }
@media (max-resolution: 1.99dppx) { .surface-raised { box-shadow: inset 0 1px 0 var(--highlight-top), inset 0 0 0 1px var(--line-1), var(--elev-2); } }

.btn-primary {
  background: var(--accent);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.18),          /* arête haute */
    inset 0 -1px 0 oklch(0 0 0 / 0.12),         /* arête basse : contre-jour */
    0 1px 2px oklch(0 0 0 / 0.30);              /* contact */
}
```

Contraintes :

- Intensité **6 % sur surfaces neutres, 18 % sur boutons pleins colorés** ; au-delà, l'effet devient « skeuomorphe 2012 ».
- Jamais sur les éléments de niveau 0 (panneaux ancrés) ni sur les champs (l'arête suggère un objet saillant ; un champ est creux : il reçoit au contraire `inset 0 1px 0 rgb(0 0 0 / 0.20)` en mode sombre).
- L'ordre des couches `box-shadow` est fixé : arêtes internes → hairline → ombres externes, pour que les transitions (§4.2) interpolent des listes de même longueur (sinon le navigateur saute au lieu d'interpoler).

### 2.4 Verre et flou (usage restreint)

`backdrop-filter: blur(20px) saturate(1.4)` sur fond `oklch(0.27 0 0 / 0.72)` est **réservé** à la barre flottante et aux menus au-dessus du canvas (l'utilisateur doit deviner le contenu dessous). Interdit sur les panneaux (coût permanent) et désactivé par `@media (prefers-reduced-transparency: reduce)` (fond opaque `--bg-raised`).

---

## 3. Le « flow » responsif et spatial

### 3.1 Rythme spatial

Tous les espacements viennent de l'échelle `--sp-*` (§0.2). Gabarits de référence :

| Élément | Hauteur | Padding horizontal | Gap interne | Rayon |
| --- | --- | --- | --- | --- |
| Ligne de calque | 28 | 8 (+ 12 par niveau d'indentation) | 4 | 6 |
| Champ numérique de l'inspecteur | 24 | 8 | 4 (icône ↔ valeur) | 6 |
| Bouton standard | 28 | 12 | 8 | 8 |
| Bouton d'outil (barre du haut) | 32 | 8 | — | 8 |
| Bouton de la barre flottante | 40 (44 en `pointer: coarse`) | — | — | 8 (barre : 12, padding 4) |
| Item de menu / palette | 28 / 36 | 8 / 12 | 8 | 6 / 8 |
| En-tête de groupe de l'inspecteur | 32 | 12 | — | — |
| Panneau latéral | largeur 248 (calques) / 272 (inspecteur), redimensionnable de 4 en 4 px entre 200 et 400 | 12 | 8 entre champs, 16 entre groupes | — |

Densité typographique : texte par défaut 11/16 px ; aucune valeur intermédiaire (pas de 11.5, 12.5, 10.5) ; 4 tailles maximum dans l'interface (11, 12, 13, 15).

Alignement vertical : les lignes de base des labels et des valeurs d'une même rangée d'inspecteur sont alignées (même `line-height` et même hauteur de contrôle) ; les colonnes de champs (X / Y, W / H) partagent une grille à 2 colonnes de `(272 − 2·12 − 8) / 2 = 120 px`.

### 3.2 Transitions d'état : règles générales

```css
* { transition-timing-function: var(--ease-out-expo); }
```

| Changement | Propriétés | Durée | Courbe |
| --- | --- | --- | --- |
| Survol (entrée) | `color`, `background-color`, `box-shadow`, `fill` | 80 ms | `--ease-out` |
| Survol (sortie) | idem | 160 ms | `--ease-out` |
| Pressé | `transform: scale(0.96)` | 80 ms entrée / 160 ms sortie | `--ease-out-expo` |
| Ouverture de popover / menu | `opacity` 0→1, `transform: translateY(4px) scale(0.98)` → `none` | 160 ms | `--ease-out-expo` |
| Fermeture | inverse | 120 ms | `--ease-in-out` |
| Ouverture de panneau / tiroir | `transform: translateX(±100%)` → `0`, `opacity` | 200 ms | `--ease-out-expo` |
| Changement d'onglet (indicateur) | `transform: translateX() scaleX()` | 200 ms | `--ease-out-expo` |
| Dialogue / palette | `opacity`, `transform: scale(0.97)` → `1` | 200 ms | `--ease-out-expo` |
| Toast | `transform: translateY(8px)`, `opacity` | 200 ms / 160 ms | `--ease-out-expo` |

Origine des transformations : les popovers s'ouvrent depuis leur point d'ancrage (`transform-origin` calculé : `top center` sous un bouton, `bottom center` au-dessus de la barre flottante), jamais depuis le centre de l'écran.

Interdits : animer `width`, `height`, `top`, `left`, `margin`, `padding` directement ; animer au survol un élément de la zone de lecture (les lignes de l'inspecteur ne bougent pas au survol, seule leur couleur change).

### 3.3 Changements de taille sans saut : FLIP

Quand un panneau s'ouvre ou se redimensionne, le reste de l'interface doit **glisser**, pas sauter. Technique FLIP (First, Last, Invert, Play) :

```js
function flip(elements, mutate) {
  const first = new Map(elements.map((el) => [el, el.getBoundingClientRect()]));   // First
  mutate();                                                                        // changement de layout réel
  for (const el of elements) {
    const last = el.getBoundingClientRect();                                       // Last
    const f = first.get(el);
    const dx = f.left - last.left, dy = f.top - last.top;
    const sx = f.width / last.width, sy = f.height / last.height;
    if (!dx && !dy && sx === 1 && sy === 1) continue;
    el.animate(                                                                     // Invert + Play
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }
}
```

Le `scale` déforme le contenu (texte écrasé) : pour les conteneurs dont le contenu ne doit pas se déformer, on n'anime que la **translation** et on fait apparaître le contenu qui change par fondu (`opacity`, 120 ms, décalé de 40 ms).

Le canvas, lui, n'est **jamais** animé en FLIP : quand un panneau s'ouvre, la caméra du canvas compense instantanément la translation pour que l'objet sélectionné reste exactement au même endroit à l'écran (pas de mouvement du travail de l'utilisateur).

### 3.4 Accordéons (groupes de l'inspecteur)

Animer une hauteur `auto` sans saut et sans mesurer en JS :

```css
.group-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 200ms var(--ease-out-expo), opacity 160ms var(--ease-out); }
.group[data-collapsed] .group-body { grid-template-rows: 0fr; opacity: 0; }
.group-body > .inner { overflow: hidden; min-height: 0; }
.group-chevron { transition: transform 200ms var(--ease-out-expo); }
.group[data-collapsed] .group-chevron { transform: rotate(-90deg); }
```

C'est la seule animation de layout autorisée (exception §0.1) : elle reste limitée à un sous-arbre court et est désactivée pendant le scrub d'une valeur.

### 3.5 Continuité spatiale

- **Un objet ne téléporte jamais** : une section déplacée dans l'arbre glisse à sa nouvelle position (FLIP, 200 ms) ; une ligne supprimée se replie (accordéon) avant de disparaître.
- **Persistance du focus spatial** : fermer un popover rend le focus à son déclencheur ; changer d'onglet conserve la position de défilement de chaque onglet.
- **Hiérarchie du mouvement** : un seul élément « principal » bouge par interaction (celui que l'utilisateur a touché) ; les éléments secondaires suivent avec un décalage de 20 à 40 ms et une amplitude réduite, jamais l'inverse.

### 3.6 Mouvement réduit

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
```

Exceptions conservées en mouvement réduit : les changements de couleur (non spatiaux) à 80 ms, et l'indication de progression (barre de chargement). FLIP et effet magnétique sont désactivés (les éléments prennent leur position finale immédiatement).

---

## 4. Micro-interactions et retour visuel atomique

### 4.1 Effet magnétique

Le fond d'un bouton d'icône (et l'icône dans une moindre mesure) se décale légèrement vers le pointeur, comme attiré, donnant une sensation tactile. **Périmètre strict** : barre flottante, barre du haut, boutons primaires des dialogues. **Exclus** : inspecteur, arbre de calques, menus (zones de précision où un décalage nuirait à la lecture et au pointage).

Modèle (par bouton survolé) :

```
c = centre du bouton ; p = position du pointeur
d = (p − c) / (taille / 2)                     // ∈ [−1, 1]² à l'intérieur du bouton
cible_fond  = clamp(d, −1, 1) · Amax_fond       // Amax_fond = 3 px
cible_icône = clamp(d, −1, 1) · Amax_icône      // Amax_icône = 1.5 px (l'icône suit moins : effet de profondeur)
```

Lissage par **ressort critique** (pas d'oscillation), évalué à chaque `requestAnimationFrame` avec le temps réel :

```
ω₀ = 2π · 6 Hz ; ζ = 1
a = −ω₀² · (x − cible) − 2ω₀ · v
v += a · dt ; x += v · dt                       // dt borné à 32 ms (onglet en arrière-plan)
```

Implémentation :

```css
@media (hover: hover) and (pointer: fine) {
  .mag { --mx: 0px; --my: 0px; }
  .mag::before { transform: translate(var(--mx), var(--my)); }                       /* fond de survol */
  .mag > .ic   { transform: translate(calc(var(--mx) * 0.5), calc(var(--my) * 0.5)); }
}
```

Le JS écrit `--mx/--my` sur l'élément survolé seulement (un seul écouteur `pointermove` délégué sur la barre, `passive: true`). Garde-fous :

- **La zone cliquable ne bouge pas** : seul le fond (`::before`) et l'icône sont translatés ; la boîte du bouton reste fixe (pas de « fuite » sous le curseur).
- **Pas sur les écrans tactiles** (`hover: none`) ni en mouvement réduit.
- Au départ du pointeur, retour au centre par le même ressort (≈ 180 ms).
- Le fond de survol qui passe d'un bouton à son voisin dans la barre flottante **glisse** de l'un à l'autre (un seul élément de fond partagé, translaté en FLIP), comme dans Figma UI3.

### 4.2 Transitions de couleur synchronisées

Le texte, l'icône et le fond changent **ensemble**, avec la même durée et la même courbe, pour que le bouton paraisse changer d'état d'un bloc :

```css
.btn-ghost {
  color: var(--fg-2);
  background-color: oklch(1 0 0 / 0);                 /* transparent exprimé dans le même espace : interpolation sans gris parasite */
  transition: color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
  transition-behavior: normal;
}
.btn-ghost:hover  { color: var(--fg-1); background-color: var(--bg-hover);  transition-duration: var(--dur-instant); }
.btn-ghost:active { background-color: var(--bg-active); transform: scale(0.96); }
.btn-ghost[aria-pressed="true"] { color: var(--accent-fg); background-color: var(--accent); }
```

Règles :

- **Entrée plus rapide que la sortie** (80 ms / 160 ms) : la réponse paraît immédiate, la sortie douce évite le clignotement quand le pointeur traverse une rangée de boutons.
- `transparent` est toujours écrit dans l'espace de la couleur cible (`oklch(1 0 0 / 0)` vers un blanc translucide) : un `transparent` CSS générique interpolerait via du noir transparent et assombrirait le milieu de la transition.
- Les icônes utilisent `currentColor` : elles suivent `color` sans transition propre (pas de décalage entre texte et icône).
- **Pas d'interpolation sur la sélection** : un item qui devient sélectionné passe à l'accent **instantanément** (0 ms) ; le retour visuel d'une décision doit être immédiat, seule la « douceur » du survol est animée.

### 4.3 Focus, sélection, pression : états atomiques

| État | Rendu | Délai |
| --- | --- | --- |
| Survol | fond `--bg-hover`, texte `--fg-1` | 80 ms |
| Pressé | fond `--bg-active`, `scale(0.96)` (boutons d'icônes) / `scale(0.98)` (boutons texte) | 80 ms |
| Focus clavier | anneau `outline: 2px solid var(--focus-ring); outline-offset: 2px;` uniquement en `:focus-visible` ; épouse le rayon (`outline` suit `border-radius` dans les navigateurs actuels) | 0 ms |
| Sélectionné (liste) | fond `--accent-soft`, texte `--fg-1`, barre gauche 2 px `--accent` | 0 ms |
| Sélectionné (outil) | fond `--accent`, icône remplie, texte `--accent-fg` | 0 ms |
| Désactivé | opacité 0.4, `cursor: default`, pas de survol | — |
| Glisser (drag) | l'élément tiré : `--elev-2`, `scale(1.02)`, opacité 0.96 ; l'emplacement : ligne 2 px `--accent` avec deux pastilles de 6 px aux extrémités | 120 ms |
| Valeur modifiée (scrub) | le chiffre défile sans animation (tabulaire) ; le curseur devient `ew-resize` ; l'étiquette du champ passe en `--fg-1` | 0 ms |

Retour haptique logiciel complémentaire : les actions irréversibles (supprimer) déclenchent un toast avec « Annuler » ; les actions au clavier sans effet visible (Ctrl+S) affichent un état transitoire dans la barre du haut (« Enregistré », fondu 1.2 s).

### 4.4 Curseurs

Curseurs système pour le texte et le redimensionnement ; curseurs personnalisés (SVG 32 × 32, point chaud déclaré, rendus à 2×) pour les outils du canvas : main ouverte / fermée, pipette, commentaire, insertion de section (`+` avec une petite ligne). Le curseur change **sans délai** et reflète toujours l'outil actif, y compris pendant le maintien de `Espace`.

---

## 5. Contrôle qualité (exécuté à chaque modification de l'interface)

| Contrôle | Méthode | Seuil |
| --- | --- | --- |
| Netteté des icônes | rastérisation de chaque icône à dpr 1 et 2, détection des segments axiaux répartis sur deux pixels partiels | 0 défaut |
| Centrage optique | écart centroïde/centre après compensation | ≤ 0.5 px (24) |
| Grille de 4 px | lecture des styles calculés de tous les éléments visibles (padding, gap, margin, height des contrôles) | 100 % multiples de 4, sauf exceptions §0.1 |
| Échelle typographique | tailles de police calculées | ⊂ {11, 12, 13, 15} px (+ 18 pour les titres de dialogues) |
| Contrastes | texte ≥ 4.5:1, icônes et contours de contrôles ≥ 3:1, anneau de focus ≥ 3:1 sur chaque fond | 0 échec |
| Rayons imbriqués | pour chaque paire parent/enfant arrondie : `r_enfant = r_parent − padding ± 1` | 0 écart |
| Calibration du lissage | écart de contour `corner-shape` vs chemin Figma 60 % | < 0.25 px |
| Fluidité | trace de performance pendant ouverture de panneau, palette, drag de section, scrub | aucune frame > 16.7 ms à 60 Hz ; > 95 % des frames < 8.3 ms à 120 Hz |
| Animations | propriétés animées (via `getAnimations()`) | uniquement `transform`, `opacity`, couleurs, `grid-template-rows` (§3.4) |
| Mouvement réduit | même parcours avec `prefers-reduced-motion: reduce` | aucune translation animée |
| Revue humaine | panel « Figma / Framer / Linear » (même protocole que la revue du Studio) | note ≥ 8/10 sur la finition |

---

## Annexe — Feuille de tokens résumée

| Catégorie | Tokens |
| --- | --- |
| Espacement | `--sp-1…12` (4 → 48 px) |
| Contrôles | `--ctl-xs 20 · sm 24 · md 28 · lg 32 · xl 40` |
| Rayons | `--r-xs 4 · sm 6 · md 8 · lg 12 (lissé 60 %) · xl 16 (lissé 60 %) · pill` |
| Typographie | Inter · 11/16 · 12/16 · 13/20 · 15/20 · graisses 450 / 550 / 620 · chiffres tabulaires |
| Couleurs | `--bg-canvas · panel · raised · overlay · hover · active · input` · `--fg-1…3, disabled` · `--line-1…3` · `--highlight-top` · `--accent(-hover, -fg, -soft)` · `--focus-ring` |
| Élévation | `--elev-1…3` (clair / sombre) + arête lumineuse |
| Mouvement | `--ease-out-expo (0.16, 1, 0.3, 1)` · `--ease-out` · `--ease-in-out` · `--dur-instant 80 · fast 120 · base 160 · panel 200 · slow 280` |
