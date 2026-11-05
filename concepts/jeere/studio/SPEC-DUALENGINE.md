# DualEngine — Spécifications techniques, fonctionnelles et architecturales

*Moteur de design et de développement no-code fusionnant la liberté vectorielle au pixel près (Figma) et la structure sémantique Web native (Framer). Version 1.0 — base du Studio Jeere v3.*

---

## 0. Fondations

### 0.1 Principe directeur : un seul arbre, deux lectures

Il n'y a **pas deux documents** (un « design » et un « code »). Il y a un seul arbre de nœuds, dont chaque nœud porte simultanément :

1. une **lecture vectorielle** — sa boîte absolue dans le repère de son parent : `{ x, y, w, h, rotation }` en pixels CSS, résolue (jamais devinée) ;
2. une **lecture sémantique** — sa boîte de contenu Web : élément HTML, `display`, participation à un Flexbox/Grid, contraintes de dimension.

Les deux lectures sont liées par le **Layout Engine** (module 2) qui est une implémentation déterministe du modèle de boîtes CSS. La lecture vectorielle est *dérivée* de la lecture sémantique par résolution de layout, et toute modification vectorielle directe (drag, resize, saisie de X/Y) est *retraduite* en modification sémantique (changement d'index dans un stack, d'override de breakpoint, de contrainte). Il n'y a jamais d'état où les deux divergent.

Invariant central (vérifié par la suite de conformité, §0.6) :

```
∀ nœud n, ∀ breakpoint b :
  layoutEngine.resolve(doc, b).box(n)  ==  navigateur.getBoundingClientRect(render(doc, b), n)   à ± 0.5 px
```

### 0.2 Unités et précision

| Grandeur | Type de stockage | Unité | Note |
| --- | --- | --- | --- |
| Coordonnées, dimensions | `float64` | px CSS (1 px = 1/96 in) | Jamais `float32` côté document (précision requise au zoom 25 600 %). |
| Rotation | `float64` | degrés, sens horaire, `[-180, 180)` | CSS `rotate()` est aussi horaire. |
| Opacité | `float64` | `[0, 1]` | |
| Couleurs | `{ r, g, b, a }` en `float64` `[0,1]` + espace `srgb` \| `display-p3` | | Sérialisées en `#RRGGBBAA` ou `color(display-p3 …)`. |
| Angles de dégradé | degrés CSS (0° = vers le haut, horaire) | | Conversion §3.3. |
| Temps | ms | | |

Les valeurs affichées dans l'inspecteur sont arrondies à **2 décimales** ; les valeurs stockées ne le sont jamais, sauf par snapping explicite (§1.3).

### 0.3 Modèle de document (types)

```ts
type NodeId = string;            // UUID v4, stable pour toute la vie du nœud (copies incluses : voir §4.1)
type BreakpointId = 'base' | string;

interface Document {
  version: 3;
  id: string;
  name: string;
  pages: Page[];
  components: Record<NodeId, ComponentDef>;   // §4
  tokens: TokenStore;                          // §4.4
  styles: StyleStore;                          // styles nommés (texte, couleur, effet, grille)
  assets: Record<string, Asset>;               // images, polices, SVG
  breakpoints: Breakpoint[];                   // §1.5 — ordonnés par largeur décroissante
  settings: { snapToPixel: boolean; pixelGrid: boolean; rulers: boolean; units: 'px' };
}

interface Page { id: NodeId; name: string; children: NodeId[]; /* frames racines */ }

type Node =
  | FrameNode | StackNode | GridNode | TextNode | ImageNode | VectorNode
  | RectangleNode | EllipseNode | LineNode | ComponentNode | InstanceNode | SliceNode;

interface BaseNode {
  id: NodeId;
  type: Node['type'];
  name: string;
  parent: NodeId | null;
  children?: NodeId[];
  visible: boolean;
  locked: boolean;
  opacity: number;                     // 0..1
  blendMode: BlendMode;                // §3.3
  isolate: boolean;                    // groupe isolé (PASS_THROUGH = false)
  semantic: Semantic;                  // §0.4
  geometry: Geometry;                  // lecture vectorielle de base
  layoutChild: LayoutChild;            // comment je me place dans mon parent (§2)
  layoutParent?: LayoutParent;         // comment je place mes enfants (§2) — Frame/Stack/Grid seulement
  fills: Paint[];                      // §3.3, du bas vers le haut
  strokes: Stroke[];                   // §3.4
  effects: Effect[];                   // §3.5
  corners: Corners;                    // §3.2
  overrides: Record<BreakpointId, Partial<Overridable>>;   // §1.5
  states?: Record<StateName, Partial<Overridable>>;         // §4.3 (Hover, Pressed…)
  animation?: AnimationConfig;         // §5
  meta: { createdAt: number; updatedAt: number; };
}

interface Geometry {
  x: number; y: number;        // par rapport au coin haut-gauche du parent, AVANT rotation
  w: number; h: number;
  rotation: number;            // autour du centre de la boîte
  flipH: boolean; flipV: boolean;
}

/** Propriétés qui acceptent des overrides par breakpoint et par état */
type Overridable = Pick<BaseNode, 'visible' | 'opacity' | 'geometry' | 'layoutChild' | 'layoutParent'
  | 'fills' | 'strokes' | 'effects' | 'corners'> & { text?: Partial<TextStyle> };
```

Les nœuds de forme :

```ts
interface FrameNode extends BaseNode { type: 'frame'; clipsContent: boolean; layoutParent: LayoutParent /* mode 'absolute' | 'stack' | 'grid' */; }
interface StackNode extends BaseNode { type: 'stack'; layoutParent: LayoutParent & { mode: 'stack' }; }   // sucre : Frame en mode stack
interface GridNode  extends BaseNode { type: 'grid';  layoutParent: LayoutParent & { mode: 'grid' }; }
interface RectangleNode extends BaseNode { type: 'rect'; }
interface EllipseNode   extends BaseNode { type: 'ellipse'; arc?: { start: number; sweep: number; innerRatio: number }; }
interface LineNode      extends BaseNode { type: 'line'; }        // h = 0 ; stroke uniquement
interface VectorNode    extends BaseNode { type: 'vector'; network: VectorNetwork; fillRule: 'nonzero' | 'evenodd'; }
interface TextNode      extends BaseNode { type: 'text'; text: RichText; style: TextStyle; resize: 'autoWidth' | 'autoHeight' | 'fixed'; truncate?: { lines: number }; }
interface ImageNode     extends BaseNode { type: 'image'; asset: string; fit: 'fill' | 'fit' | 'crop' | 'tile'; crop?: { x: number; y: number; w: number; h: number }; alt: string; }
interface ComponentNode extends BaseNode { type: 'component'; def: NodeId; }   // maître (§4.1)
interface InstanceNode  extends BaseNode { type: 'instance'; of: NodeId; props: Record<string, PropValue>; overrides: InstanceOverrides; }
```

### 0.4 Sémantique Web attachée

```ts
interface Semantic {
  tag: 'div' | 'section' | 'header' | 'nav' | 'main' | 'footer' | 'article' | 'aside'
     | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'a' | 'button' | 'img' | 'ul' | 'li' | 'form' | 'input' | 'label';
  attrs: Record<string, string>;   // id, href, aria-*, alt…
  className?: string;              // classe stable générée : `de-${nodeId.slice(0,8)}` + classes utilisateur
}
```

Règle : un `TextNode` nommé « Titre » dont le style est lié au style nommé `Heading/1` reçoit `tag: 'h1'` par défaut (inférence), modifiable dans l'inspecteur. Un `InstanceNode` d'un composant « Bouton » reçoit `button` ou `a` selon la présence d'un `href`.

### 0.5 Transactions et historique

Toute mutation passe par un **patch JSON (RFC 6902)** appliqué au document, avec son inverse calculé au moment de l'application :

```ts
interface Transaction { id: string; label: string; patches: JsonPatch[]; inverse: JsonPatch[]; at: number; coalesceKey?: string; }
```

- Historique linéaire, 1 000 transactions, coalescence des saisies continues (même `coalesceKey` dans une fenêtre de 500 ms : drag, scrub numérique, frappe).
- Undo = application de `inverse`, redo = `patches`. Les ids ne changent jamais, donc la sélection survit à l'undo.
- Le même format de patch sert à la collaboration temps réel (transport CRDT/OT hors périmètre de ce document ; le modèle est conçu pour).

### 0.6 Suite de conformité (obligatoire pour chaque module)

Un **harnais de conformité** rend chaque fixture de deux façons : (a) par le moteur (`layoutEngine` + `renderer`), (b) par un navigateur headless (Chromium) à partir du HTML/CSS exporté. Il compare :

- boîtes : `|Δx|, |Δy|, |Δw|, |Δh| ≤ 0.5 px` pour chaque nœud, à chaque breakpoint ;
- pixels : rendu rastérisé du moteur vs capture du navigateur, **ΔE₀₀ moyen ≤ 1.0** et **≤ 2 % de pixels avec ΔE₀₀ > 5** (texte exclu des zones de comparaison stricte : anti-aliasing différent) ;
- CSS : chaque propriété exportée est parsée par le navigateur sans être rejetée (`CSS.supports`).

Un module n'est « conforme » que si ses fixtures passent. Les constantes empiriques (ex. `K_BLUR`, §3.5) sont fixées par ce harnais, pas à la main.

---

## MODULE 1 : CANVAS HYBRIDE ET GESTION DE LA GRILLE PONT (PIXEL VS CODE)

### 1.1 Repères et transformation de vue

Trois repères :

| Repère | Unité | Origine |
| --- | --- | --- |
| **Document** `D` | px doc (`float64`) | (0,0) de la page ; les frames racines y sont posés librement. |
| **Écran** `S` | px CSS écran | coin haut-gauche du viewport du canvas. |
| **Device** | px physiques | `S × dpr` (`devicePixelRatio`, 1 à 3). |

Caméra : `{ panX, panY, zoom }`, `zoom ∈ [0.10, 256]` (10 % à 25 600 %).

```
S = (D − pan) · zoom
D = S / zoom + pan
```

**Zoom vers le curseur** (molette, pincement) — le point doc sous le curseur reste fixe :

```
z' = clamp(z · exp(−Δwheel · 0.0015), 0.10, 256)
pan' = cursorD − (cursorD − pan) · (z / z')         // cursorD = cursorS / z + pan
```

Paliers de zoom clavier : `… 10, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600 %` (`Ctrl+±`), `Ctrl+0` = ajuster la sélection/page, `Ctrl+1` = 100 %, `Shift+2` = zoom sur la sélection.

**Précision au zoom maximal.** À 25 600 %, 1 px doc = 256 px écran. Pour que l'erreur écran reste < 0,5 px, l'erreur doc doit rester < 0,002 px : `float64` côté document le garantit (ε ≈ 2·10⁻¹⁶ relatif). Côté GPU (`float32`, ε ≈ 1,2·10⁻⁷ relatif), des coordonnées absolues de 10⁵ px perdraient ~0,01 px : **toutes les géométries envoyées au GPU sont exprimées relativement à l'origine de la tuile courante** (`D − tileOrigin`), jamais en absolu.

### 1.2 Moteur de rendu d'affichage

Architecture en deux chemins, sélectionnée automatiquement :

| Chemin | Quand | Technique |
| --- | --- | --- |
| **GPU (WebGL2)** | par défaut si disponible ; obligatoire au-delà de 2 000 nœuds visibles | Rendu par lots : un seul `drawArraysInstanced` par type de primitive (rectangles arrondis + bordures + ombres par SDF ; images par atlas ; texte par atlas de glyphes MSDF). Flous gaussiens en deux passes séparables sur FBO. |
| **Canvas2D** | repli (WebGL indisponible, contexte perdu) ; export d'images | `OffscreenCanvas` dans un Worker, mêmes primitives, `ctx.filter` pour les flous. |

Pipeline de frame (budget **8 ms à 120 Hz, 16 ms à 60 Hz**) :

1. **Culling** : quadtree des boîtes monde (mise à jour incrémentale par patch) → nœuds intersectant le viewport élargi de 10 %.
2. **LOD** : taille écran `wS = w · zoom`.
   - `wS < 2 px` : nœud ignoré ;
   - texte avec taille de police écran `< 4 px` : rectangle de la couleur moyenne (« greeking ») ;
   - images : mipmap de niveau `⌈log₂(wImage / wS)⌉`.
3. **Cache raster par bande de zoom** : un sous-arbre inchangé (hash de contenu + hash de style) est rastérisé une fois par bande `[2ᵏ, 2ᵏ⁺¹)` de zoom et réutilisé (les bandes évitent le flou de rééchantillonnage > 2×). Invalidation par le hash. Quota : 512 Mo de textures, éviction LRU.
4. **Tuiles** : le viewport est découpé en tuiles de 512 px device ; seules les tuiles sales (touchées par un patch ou par un déplacement de caméra) sont redessinées.
5. **Overlays** (sélection, guides, poignées, grille) rendus dans une couche séparée, jamais mis en cache, toujours à l'échelle écran (épaisseur constante 1 px device).

**Grille de pixels** (`Ctrl+Shift+'`) : visible quand `zoom ≥ 8` (800 %) ; lignes de 1 px device, couleur `rgba(0,0,0,.08)` sur fond clair, tous les 1 px doc. Grille de mise en page (colonnes/lignes/grilles) : définie sur un frame, en px, affichée à toutes les échelles.

**Règles** (`Shift+R`) : graduées en px doc, pas d'échelle `[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]` choisi pour que deux graduations majeures soient espacées d'au moins 60 px écran. **Guides** : tirés depuis les règles, stockés par page `{ axis: 'x'|'y', value: number }` en px doc, snapping actif (§1.3), verrouillables.

### 1.3 Algorithme de « Pixel Snapping » intelligent

Le snapping n'est pas une rastérisation : c'est une **contrainte appliquée à l'entrée** (drag, resize, saisie), composée de quatre sources par ordre de priorité, chacune avec une tolérance exprimée en px écran puis convertie en px doc (`tolD = tolS / zoom`).

```ts
interface SnapCandidate { axis: 'x' | 'y'; value: number; kind: 'pixel' | 'object' | 'guide' | 'stack'; dist: number; }

function snap(pointerD: Vec2, dragged: Node, ctx: Ctx): { pos: Vec2; guides: SmartGuide[] } {
  const cands: SnapCandidate[] = [];
  // 1. Insertion dans un stack (prioritaire : change la sémantique, voir ci-dessous)
  if (ctx.hoverParent?.layoutParent.mode === 'stack') return snapIntoStack(pointerD, dragged, ctx.hoverParent);
  // 2. Guides utilisateur et guides de grille de mise en page     (tol 6 px écran)
  // 3. Objets voisins : bords, centres, espacements égaux          (tol 6 px écran)
  // 4. Grille de pixels                                            (tol 0.5 px doc, si settings.snapToPixel)
  …
  // On retient, par axe, le candidat de distance minimale ; égalité → priorité kind (guide > object > pixel)
}
```

**Snap pixel** : pour un rectangle non tourné, les quatre bords sont arrondis à l'entier :
`x' = round(x)`, `w' = round(x + w) − x'` (on arrondit les *bords*, pas la largeur, pour éviter la dérive cumulative). Pour un trait de 1 px (`LineNode`, bordure de 1 px), la ligne centrale est posée sur `n + 0.5` afin d'occuper exactement un pixel sans anti-aliasing. En mode `dpr > 1`, l'arrondi se fait sur la grille device : `x' = round(x · dpr) / dpr`. Une rotation ≠ 0 désactive le snap pixel sur l'objet (ses bords ne sont plus alignés à la grille) mais pas sur sa boîte englobante.

**Exemple** : un rectangle déposé à `X = 142.3` avec `snapToPixel` actif et sans autre candidat plus proche → `X = 142` ; le panneau affiche `142`, le CSS exporté `left: 142px`. Sans snap, `X = 142.3` est conservé tel quel et exporté `left: 142.3px` (le navigateur rastérise avec anti-aliasing : c'est précisément ce que le snap évite).

**Snap objet (« smart guides »)** : candidats = bords gauche/centre/droit et haut/milieu/bas des frères visibles dans le même parent (et du parent lui-même), + **espacements égaux** : si `|gap(A,dragged) − gap(dragged,B)| ≤ tolD`, le dragged est centré entre A et B et deux cotes roses « 24 » s'affichent. Les guides rouges s'affichent à la position snapée, épaisseur 1 px device.

**Insertion dans un Stack (le pont vectoriel → sémantique).** Quand le pointeur survole un parent en mode `stack`, le drag ne positionne plus librement : il calcule un **index d'insertion** par la règle du point médian sur l'axe principal.

```
children = enfants visibles du stack, triés par position sur l'axe principal
i = nombre d'enfants dont le centre (sur l'axe principal) < coordonnée du pointeur sur cet axe
→ insertion à l'index i ; une ligne bleue de 2 px est dessinée à la frontière (gap/2 avant l'enfant i)
```

Au relâchement : `layoutChild.position = 'flow'`, l'enfant est inséré à `i`, le moteur de layout **recalcule** sa boîte absolue (`x, y`) — la lecture vectorielle est désormais dérivée. Si l'utilisateur maintient `Ctrl` (Cmd) pendant le drag, l'insertion est désactivée : l'enfant devient `position: 'absolute'` dans le stack (§2.4) à la coordonnée relâchée, snapée pixel.

Inversement, un enfant en flux déplacé **hors** de son stack reprend des coordonnées absolues dans son nouveau parent : sa boîte monde est conservée (`xWorld, yWorld` inchangés au pixel près), convertie dans le repère du nouveau parent.

### 1.4 Repère d'un enfant tourné

La boîte stockée est la boîte **non tournée** ; le rendu applique `rotate(θ)` autour de `(x + w/2, y + h/2)`. La boîte englobante (utilisée pour le culling, le snap de bords et l'export `getBoundingClientRect`) est :

```
cx = x + w/2 ; cy = y + h/2
bw = |w·cos θ| + |h·sin θ| ; bh = |w·sin θ| + |h·cos θ|
bbox = { cx − bw/2, cy − bh/2, bw, bh }
```

CSS : `transform: rotate(θdeg); transform-origin: 50% 50%;` — la boîte de layout CSS ignore la transformation, ce qui correspond exactement à la boîte stockée. Les rotations ne participent donc jamais au flux : c'est la règle CSS, et c'est la règle du moteur.

### 1.5 Breakpoints responsives (façon Framer)

```ts
interface Breakpoint { id: BreakpointId; name: string; width: number; minWidth?: number; }
// Exemple par défaut, ordonné par largeur décroissante :
[ { id: 'base',   name: 'Desktop',  width: 1440 },     // PRIMARY : pas de media query
  { id: 'tablet', name: 'Tablette', width: 834 },      // @media (max-width: 1199.98px)  → voir calcul
  { id: 'phone',  name: 'Mobile',   width: 390 } ]     // @media (max-width: 809.98px)
```

**Cascade descendante.** Toute propriété est définie sur `base`. Un breakpoint plus étroit **hérite** de la valeur du breakpoint immédiatement plus large, sauf s'il porte un *override* pour cette propriété. Résolution :

```ts
function resolve<P extends keyof Overridable>(node: Node, prop: P, bp: BreakpointId): Overridable[P] {
  const chain = breakpointsFrom(bp).concat('base');       // ex. phone → ['phone', 'tablet', 'base']
  for (const b of chain) if (b !== 'base' && node.overrides[b]?.[prop] !== undefined) return node.overrides[b][prop];
  return node[prop];
}
```

**Bornes de media queries.** Le breakpoint `b` (largeur `wb`) s'applique aux viewports `[wb_next_smaller + 1, wb_next_larger − 1]` ; par convention on exporte :

```
tablet : @media (max-width: ${base.width − 1 + 0.02}px) → (max-width: 1439.98px)   si on veut que 1440 soit encore desktop
```

Convention retenue : un breakpoint s'active pour `viewport < largeur du breakpoint plus large` :
`tablet ⇒ max-width: 1439.98px`, `phone ⇒ max-width: 833.98px`. Le `.98` (et non `.99`) évite l'arrondi de certains navigateurs ; `float` stocké exact. L'artboard « Tablette 834 » montre donc le document à 834 px = première largeur qui n'est plus desktop… et pour que 834 soit *dans* tablet, la borne est `max-width: 1439.98` (834 < 1439.98 ✔) et `phone` commence sous 834 : `max-width: 833.98`.

**Verrouillage des overrides au pixel près.** Modifier une propriété sur un artboard non-`base` crée `overrides[bp][prop] = valeur exacte` (jamais un delta). L'inspecteur affiche un **cadenas bleu** sur la propriété. `Ctrl+clic` sur le cadenas = « Réinitialiser au desktop » (suppression de l'override, retour à la cascade). Les overrides sont par propriété, pas par nœud : changer la couleur sur mobile ne gèle pas la largeur.

**Géométrie et cascade.** Sur un enfant en flux, `x, y` ne sont pas overridables (dérivés). Sur un enfant absolu, `x, y, w, h` le sont. Les contraintes (§2.5) permettent le cas fréquent « même design, largeur différente » sans override : un frame `Fill container` suit la largeur de l'artboard.

**Rendu CSS** : une classe stable par nœud, propriétés `base` dans la règle principale, overrides dans des blocs `@media` ordonnés du plus large au plus étroit (la cascade CSS reproduit exactement la cascade du moteur).

```css
.de-3f9a1c2e { width: 1200px; padding: 64px; }
@media (max-width: 1439.98px) { .de-3f9a1c2e { width: 100%; padding: 40px; } }
@media (max-width: 833.98px)  { .de-3f9a1c2e { padding: 20px; } }
```

---

## MODULE 2 : LE MOTEUR DE MISE EN PAGE UNIFIÉ (AUTO LAYOUT ↔ STACKS & GRIDS)

### 2.1 Types

```ts
interface LayoutParent {
  mode: 'absolute' | 'stack' | 'grid';
  // stack
  direction?: 'horizontal' | 'vertical';
  wrap?: boolean;
  gap?: number | 'auto';                 // 'auto' = space-between (Figma « Auto » spacing)
  rowGap?: number;                       // si wrap
  padding?: { top: number; right: number; bottom: number; left: number };
  alignMain?: 'start' | 'center' | 'end' | 'spaceBetween';
  alignCross?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  // grid
  columns?: Track[]; rows?: Track[]; columnGap?: number; rowGap?: number;
  // commun
  clip: boolean;                         // overflow: hidden
  reverseZ?: boolean;                    // ordre z inversé (Figma « first on top »)
}
type Track = { kind: 'px'; value: number } | { kind: 'fr'; value: number } | { kind: 'auto' } | { kind: 'minmax'; min: Track; max: Track };

interface LayoutChild {
  position: 'flow' | 'absolute';
  // dimensionnement (par axe)
  widthMode:  'fixed' | 'hug' | 'fill';
  heightMode: 'fixed' | 'hug' | 'fill';
  minW?: number; maxW?: number; minH?: number; maxH?: number;
  // 'fixed' peut aussi être exprimé en unités relatives au viewport (Framer) :
  widthUnit?: 'px' | 'vw' | '%';  heightUnit?: 'px' | 'vh' | '%';
  grow?: number;                         // part de l'espace libre quand 'fill' (défaut 1)
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  // absolu : contraintes (§2.5)
  constraints?: { h: HConstraint; v: VConstraint };
  // grid
  gridArea?: { col: number; colSpan: number; row: number; rowSpan: number };
  order?: number;
}
```

### 2.2 Matrice de conversion Auto Layout ↔ CSS

Conversion **bidirectionnelle et sans perte** (chaque ligne est inversible) :

| Auto Layout (Figma) | Modèle DualEngine | CSS exporté |
| --- | --- | --- |
| Direction Horizontal / Vertical | `direction` | `display:flex; flex-direction: row \| column` |
| Wrap | `wrap: true` | `flex-wrap: wrap` |
| Item spacing `g` px | `gap: g` | `gap: g px` (ou `column-gap`/`row-gap` si différents) |
| Spacing « Auto » | `gap: 'auto'` | `justify-content: space-between` |
| Padding T R B L | `padding` | `padding: T R B L` (+ `box-sizing: border-box` global) |
| Alignement 3×3 (ex. haut-gauche, centre…) | `alignMain` × `alignCross` | `justify-content` × `align-items` (table ci-dessous) |
| Clip content | `clip` | `overflow: hidden` |
| Canvas stacking « first on top » | `reverseZ` | enfants émis en ordre inverse + `flex-direction: row-reverse`… **non** : on conserve l'ordre DOM et on assigne `z-index` décroissant (plus fidèle). |

Alignement :

| Figma (axe principal → `alignMain`) | CSS `justify-content` | Figma (axe croisé → `alignCross`) | CSS `align-items` |
| --- | --- | --- | --- |
| start | `flex-start` | start | `flex-start` |
| center | `center` | center | `center` |
| end | `flex-end` | end | `flex-end` |
| spaceBetween | `space-between` | stretch (Fill sur l'axe croisé de tous les enfants) | `stretch` |
| | | baseline (texte) | `baseline` |

**Dimensionnement d'un enfant** (par axe, l'autre axe est symétrique) :

| Figma | DualEngine | CSS (enfant d'un flex `row`, pour la largeur) | CSS (hors flex / absolu) |
| --- | --- | --- | --- |
| Fixed width `W` | `widthMode:'fixed', w: W` | `width: Wpx; flex: 0 0 auto` | `width: Wpx` |
| Fixed `W vw` (Framer) | `widthUnit:'vw'` | `width: Wvw` | idem |
| Hug contents | `widthMode:'hug'` | `width: fit-content; flex: 0 0 auto` (texte sur une ligne : `max-content`) | `width: fit-content` |
| Fill container | `widthMode:'fill', grow: 1` | `flex: 1 1 0%; min-width: 0` | `width: 100%` |
| Fill container (axe **croisé**) | `alignSelf:'stretch'` | `align-self: stretch` (et pas de `height`) | `height: 100%` |
| Fill dans un **Grid** | `widthMode:'fill'` | la piste est `1fr` ; l'enfant `width: auto; justify-self: stretch` | — |
| Min / Max | `minW, maxW` | `min-width / max-width` | idem |

Détails qui font la différence au pixel :

- `flex: 1 1 0%` (et non `flex: 1`) pour que deux enfants Fill partagent l'espace **indépendamment de leur contenu** — c'est le comportement de Figma. `min-width: 0` neutralise le `min-width: auto` des flex items (sinon un texte long empêche la réduction : divergence Figma/CSS classique).
- Hug + texte multi-ligne : Figma donne la largeur du contenu *dans la limite du parent* ; CSS : `width: fit-content` fait exactement cela (`min(max-content, max(min-content, available))`).
- Hug sur un parent dont un enfant est Fill : contradiction (Figma l'interdit aussi) ; le moteur refuse l'état et l'inspecteur grise l'option.
- Un stack **vertical** inverse les rôles : les tableaux ci-dessus s'appliquent à `height`/`flex-direction: column`.

### 2.3 Solveur de layout

Le moteur embarque un solveur **Flexbox (CSS Flexible Box Level 1, §9 de la spec, lignes 9.1 à 9.7) et Grid (CSS Grid Level 1, algorithme de dimensionnement des pistes §11)** implémenté en TypeScript, déterministe, sans DOM. Il est de la famille Yoga/Taffy. Les écarts connus avec les navigateurs (arrondis de sous-pixels, `baseline`) sont couverts par la suite de conformité ; l'objectif est `≤ 0.5 px`.

Ordre de résolution d'un breakpoint :

1. résoudre les valeurs effectives de chaque propriété via la cascade (§1.5) et les états (§4.3, neutres au design) ;
2. mesurer les nœuds intrinsèques : texte (mise en forme par le moteur de texte, §3.6, avec les mêmes polices que le navigateur via `FontFace` + métriques `hhea/OS/2`), images (ratio) ;
3. passer le solveur de haut en bas ; les nœuds `absolute` sont posés **après** le layout de leur parent, par contraintes (§2.5) ;
4. écrire `geometry` résolue dans le cache de layout (`Map<NodeId, Box>` par breakpoint). La lecture vectorielle de l'inspecteur lit ce cache.

Performance : layout incrémental — un patch invalide le sous-arbre touché et ses ancêtres en `hug` ; un document de 50 000 nœuds doit se re-layouter en < 4 ms pour une modification locale.

### 2.4 Positionnement absolu dans un Stack

Un enfant `position: 'absolute'` dans un stack **sort du flux** et se positionne par ses contraintes relativement à la **boîte de padding** du parent (comme CSS `position: absolute` par rapport à un parent `position: relative`).

CSS :

```css
.parent { display: flex; position: relative; /* toujours émis sur tout Frame/Stack/Grid */ }
.child  { position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx; }
```

Conversion depuis la lecture vectorielle : `x, y` stockés sont déjà relatifs au coin haut-gauche de la boîte de **bordure** du parent ; CSS positionne par rapport à la boîte de **padding** (`left: 0` = bord intérieur de la bordure). Comme les bordures sont rendues en `box-shadow` (§3.4) et non en `border`, les deux boîtes coïncident : `left = x`, `top = y`. Si un `border` CSS réel est utilisé (bordure intérieure en pointillés, §3.4), on soustrait son épaisseur : `left = x − bw`.

Un absolu **ne contribue pas** au `hug` du parent (règle Figma = règle CSS). `z-index` : les absolus sont dessinés au-dessus des enfants en flux par défaut (Figma) ; CSS : `position: absolute` crée déjà cet empilement, et `z-index: 1` est émis pour garantir l'ordre face aux frères en flux positionnés.

### 2.5 Contraintes (enfants absolus et frames en mode `absolute`)

```ts
type HConstraint = 'left' | 'right' | 'leftRight' | 'center' | 'scale';
type VConstraint = 'top' | 'bottom' | 'topBottom' | 'center' | 'scale';
```

Résolution quand le parent passe de `(W0, H0)` (breakpoint de définition) à `(W, H)` :

| Contrainte | Position/dimension résolue | CSS |
| --- | --- | --- |
| left | `x` inchangé | `left: xpx` |
| right | `x' = W − (W0 − x − w)` | `right: (W0−x−w)px` |
| leftRight | `x` et `W0−x−w` inchangés, `w' = W − x − (W0−x−w)` | `left: xpx; right: rpx` (pas de width) |
| center | `x' = W/2 − (W0/2 − x)` | `left: calc(50% + (x − W0/2)px)` ou `left: 50%; margin-left: (x−W0/2)px` |
| scale | `x' = x · W/W0`, `w' = w · W/W0` | `left: (100·x/W0)%; width: (100·w/W0)%` |

Même tableau en vertical. Ces formules sont exactement celles de Figma ; l'export CSS les reproduit sans JavaScript.

### 2.6 Grilles

`GridNode` → `display: grid; grid-template-columns: <tracks>; grid-template-rows: <tracks>; gap`. Pistes : `px` → `Npx`, `fr` → `Nfr`, `auto` → `auto`, `minmax` → `minmax(a, b)`. Enfant : `grid-column: c / span s; grid-row: r / span t`. Un enfant Fill dans une piste `fr` : `justify-self: stretch; align-self: stretch` (défaut CSS ; émis explicitement quand l'autre mode est `start/center/end`).

### 2.7 Texte dans le layout

| Mode de redimensionnement | Largeur | Hauteur | CSS |
| --- | --- | --- | --- |
| Auto width | contenu, une ligne par paragraphe | contenu | `width: max-content; white-space: pre; height: auto` |
| Auto height | fixe `W` | contenu | `width: Wpx; white-space: pre-wrap; overflow-wrap: anywhere; height: auto` |
| Fixed | `W` | `H` | `width: Wpx; height: Hpx; overflow: hidden` |
| Truncate `n` lignes | | | `display: -webkit-box; -webkit-line-clamp: n; -webkit-box-orient: vertical; overflow: hidden` |

---

## MODULE 3 : INSPECTION DES PROPRIÉTÉS ET RENDU CSS BROWSER-NATIVE

Le panneau de droite est **à deux colonnes synchronisées** : à gauche les contrôles graphiques, à droite (repliable, « Code ») la ou les déclarations CSS produites par **ces contrôles-là**, mises à jour à chaque frappe. Le CSS affiché est strictement celui de l'export (même générateur, §3.7). Chaque champ numérique accepte les expressions (`100+24`, `50%` du parent, `1/3`), le scrub horizontal (1 px par px de souris, `Shift` ×10, `Alt` ×0,1) et les flèches (`↑/↓` ±1, `Shift` ±10).

### 3.1 Géométrie

| Contrôle | Modèle | CSS (enfant absolu) | CSS (enfant en flux) |
| --- | --- | --- | --- |
| X, Y | `geometry.x, y` (résolus) | `left, top` | lecture seule (dérivés) — affichés grisés avec « Position dans le flux » |
| W, H | `geometry.w, h` + `widthMode/heightMode` | `width/height` ou `100%`/`fit-content` | idem §2.2 |
| Verrou de ratio | `aspectLocked` | `aspect-ratio: w / h` (si un axe est `fill`) | idem |
| Angle | `rotation` | `transform: rotate(θdeg)` | idem |
| Flip H/V | `flipH/V` | `transform: … scaleX(-1)` | idem |

Ordre des transformations exporté : `rotate(θ) scaleX(sx) scaleY(sy)`, origine `50% 50%` ; le moteur applique le même ordre.

### 3.2 Coins : rayon, rayons indépendants, lissage (squircle)

```ts
interface Corners { tl: number; tr: number; br: number; bl: number; smoothing: number /* 0..1 (0 = arc circulaire, 0.6 = iOS) */; }
```

Rayon effectif par coin : `r = min(r, w/2, h/2)` après réduction proportionnelle si la somme des rayons adjacents dépasse le côté (règle CSS `border-radius` §5.5 reproduite : facteur `f = min(1, L / (r1 + r2))` appliqué à tous les rayons).

- `smoothing = 0` → `border-radius: tl tr br bl` (px). Fidélité exacte.
- `smoothing > 0` → CSS n'a pas de lissage de coins. Le moteur génère la **superellipse par Bézier cubiques** (construction de Figma, implémentation `figma-squircle`) et l'exporte en `clip-path: path('…')` (coordonnées absolues en px, recalculées par breakpoint) ; quand l'élément porte une bordure ou une ombre (qui ne suivent pas `clip-path`), le générateur émet un **SVG de fond** (`background-image: url("data:image/svg+xml,…")` avec le remplissage) + `clip-path` pour le contenu, et une ombre par `filter: drop-shadow()` sur le wrapper. Construction, pour un coin de rayon `R`, lissage `ξ`, côté le plus court `L` :

```
p   = min((1 + ξ)·R, L/2)                       // distance du coin où la courbe commence
θ   = 90·(1 − ξ)                                 // ouverture de l'arc circulaire restant (degrés)
arc = sin(θ/2) · R · √2                          // longueur de corde de l'arc
α   = (90 − θ)/2 ;  d34 = R · tan(α/2)
β   = 45·ξ ;  c = d34·cos β ;  d = c·tan β
b   = (p − arc − c − d)/3 ;  a = 2b
Chemin (coin haut-droit, origine au coin) :  M(−p,0)  C(−p+a,0  −p+a+b,0  −p+a+b+c,d)
                                             A(R,R 0 0 1  −d,p−a−b−c)   // arc circulaire
                                             C(0,p−a−b  0,p−a  0,p)
```

Le chemin complet enchaîne les quatre coins ; les segments droits sont des `L`. Pour `ξ = 0`, `a = b = c = d = 0` et le chemin se réduit à quatre arcs = `border-radius`.

### 3.3 Remplissages (Fills)

```ts
type Paint =
  | { type: 'solid'; color: Color; opacity: number; blend: BlendMode; visible: boolean }
  | { type: 'linear' | 'radial' | 'angular' | 'diamond'; stops: Stop[]; transform: Mat3 /* repère normalisé [0,1]² */; opacity; blend; visible }
  | { type: 'image'; asset: string; fit: 'fill' | 'fit' | 'crop' | 'tile'; scale?: number; transform?: Mat3; filters?: ImageFilters; opacity; blend; visible };
```

Plusieurs remplissages → `background: <haut>, …, <bas>` (CSS empile le premier au-dessus : on émet la liste **inversée**), chacun avec `background-blend-mode` pour les modes de fusion *entre remplissages*. Le `blendMode` du **nœud** va dans `mix-blend-mode`.

**Dégradé linéaire.** Figma stocke les poignées `P0 → P1` dans le repère normalisé de la boîte. CSS définit un angle et une ligne de dégradé de longueur `Lcss = |W·sin θ| + |H·cos θ|` passant par le centre. Conversion exacte :

```
dx = (P1.x − P0.x)·W ;  dy = (P1.y − P0.y)·H            // vecteur en px
θ  = (atan2(dx, −dy) · 180/π + 360) mod 360              // CSS : 0° = vers le haut, horaire
Lcss = |W·sin θ| + |H·cos θ|
// projection d'une position t ∈ [0,1] sur la ligne CSS (centre de la boîte = milieu de Lcss) :
C = centre ; u = (sin θ, −cos θ)                           // direction CSS
s(t) = ((P0 + t·(P1−P0)) · (W,H) − C) · u / Lcss + 0.5    // position CSS en fraction de Lcss
→ background: linear-gradient(θdeg, c₀ s(0)·100%, …, cₙ s(1)·100%)
```

Les stops hors `[0,1]` sont autorisés par CSS (le dégradé est prolongé par la couleur extrême), ce qui garantit l'identité pixel à pixel avec Figma.

**Radial** : `radial-gradient(ellipse Rx Ry at Cx Cy, …)` avec `Rx, Ry` tirés de la matrice. **Angular** : `conic-gradient(from θdeg at Cx Cy, …)`. **Diamond** : pas d'équivalent CSS → rastérisé en PNG/SVG de fond (signalé dans la colonne Code par une pastille « Rasterisé »).

**Image fill** : `fill` → `background-size: cover`, `fit` → `contain`, `crop` → `background-size: (W/cw·100)% auto; background-position: …` calculés depuis `crop`, `tile` → `background-repeat: repeat; background-size: (scale·100)%`. Sur un `ImageNode` (balise `<img>`), on utilise `object-fit: cover|contain` et `object-position`. Filtres d'image (exposition, contraste, saturation, teinte, ombres/hautes lumières simplifiés) → `filter: brightness() contrast() saturate() hue-rotate()` ; les ajustements sans équivalent (ombres/hautes lumières) sont **cuits** dans l'asset exporté.

**Modes de fusion**

| Figma | CSS `mix-blend-mode` / `background-blend-mode` |
| --- | --- |
| Pass through (groupe) | `isolation: auto` (le groupe n'est pas un contexte d'empilement) |
| Normal | `normal` (+ `isolation: isolate` sur un groupe Normal) |
| Darken / Multiply / Color burn | `darken` / `multiply` / `color-burn` |
| Linear burn | ∅ → repli `multiply` (signalé) |
| Lighten / Screen / Color dodge | `lighten` / `screen` / `color-dodge` |
| Linear dodge (Add) | `plus-lighter` (Compositing 2 ; supporté Chrome 100+, Safari 15.4+) |
| Overlay / Soft light / Hard light | `overlay` / `soft-light` / `hard-light` |
| Difference / Exclusion | `difference` / `exclusion` |
| Hue / Saturation / Color / Luminosity | `hue` / `saturation` / `color` / `luminosity` |

Opacité de calque : `opacity`. Opacité d'un remplissage solide : intégrée dans la couleur (`rgba`), jamais dans `opacity` (sinon elle affecterait les enfants).

### 3.4 Bordures (Strokes)

```ts
interface Stroke { paint: Paint; width: number | { top: number; right: number; bottom: number; left: number }; align: 'inside' | 'center' | 'outside'; dash?: [number, number]; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel'; visible: boolean; }
```

Principe : la boîte de layout **ne doit pas bouger** quand on ajoute une bordure (règle Figma). Donc on n'utilise jamais `border` seul pour une bordure centrée ou extérieure.

| Alignement | CSS (couleur unie, continu) | Rayon de courbure du bord extérieur |
| --- | --- | --- |
| Inside | `box-shadow: inset 0 0 0 Wpx C` | `r` |
| Outside | `box-shadow: 0 0 0 Wpx C` | `r + W` (CSS l'ajoute automatiquement) |
| Center | `box-shadow: inset 0 0 0 (W/2)px C, 0 0 0 (W/2)px C` | `r + W/2` |

Plusieurs bordures / bordures + ombres : une seule liste `box-shadow`, bordures d'abord (les ombres viennent après, §3.5), car CSS dessine la première ombre au-dessus.

Cas particuliers :
- **Inside + pointillés** : `border: Wpx dashed C; box-sizing: border-box` (le motif de tirets CSS n'est pas paramétrable : `dash` est approché ; pour un rendu exact, repli SVG : `stroke-dasharray`).
- **Par côté** (épaisseurs différentes, inside uniquement) : `border-top/right/bottom/left: Wpx solid C` avec `box-sizing: border-box` ; les enfants absolus corrigent `left/top` de l'épaisseur (§2.4).
- **Dégradé en bordure** : `border: Wpx solid transparent; background: linear-gradient(fond) padding-box, linear-gradient(bordure) border-box` (inside) ; sinon SVG.
- **Formes vectorielles, lignes, ellipses** : rendu SVG inline, `stroke`, `stroke-width`, `stroke-linecap/linejoin`, `stroke-dasharray`, `vector-effect: non-scaling-stroke` ; alignement inside/outside obtenu par `clip-path`/masque du chemin (centre : natif).

### 3.5 Effets

```ts
type Effect =
  | { type: 'dropShadow' | 'innerShadow'; x: number; y: number; blur: number; spread: number; color: Color; visible: boolean; showBehindTransparent?: boolean }
  | { type: 'layerBlur' | 'backgroundBlur'; radius: number; visible: boolean };
```

**Ombres** → chaîne stricte `box-shadow: Xpx Ypx Bpx Spx rgba(r,g,b,a)` (`inset` en tête pour `innerShadow`). Figma et CSS définissent toutes deux le flou d'ombre par un noyau gaussien d'écart-type `σ = B/2` : la correspondance est **1:1**, sans coefficient. Ordre : liste des effets du haut vers le bas, après les bordures. Formatage : nombres sans zéro superflu (`0 4px 12px 0 rgba(0,0,0,.25)`), couleurs en `rgba()` si `a < 1` sinon `#RRGGBB`.

Ombre sur un élément avec `clip-path` (coins lissés) ou sur une image PNG transparente avec `showBehindTransparent = false` → `filter: drop-shadow(Xpx Ypx Bpx C)` (pas de `spread` : si `S ≠ 0`, signalé « approximé »).

**Flou de calque** → `filter: blur(σpx)` avec `σ = K_BLUR · radius`. Figma exprime le flou de calque comme un rayon ≈ `2σ` ; valeur initiale `K_BLUR = 0.5`, **fixée définitivement par le harnais de conformité** (§0.6) sur des fixtures de disques flous (minimisation de ΔE). **Flou d'arrière-plan** → `backdrop-filter: blur(σpx)` (même `K_BLUR`) + préfixe `-webkit-`. Un flou d'arrière-plan exige un fond partiellement transparent : le moteur avertit si l'alpha du dernier fill est 1.

### 3.6 Typographie

```ts
interface TextStyle {
  family: string; weight: number /* 100..900 */; italic: boolean; axes?: Record<string, number>;   // polices variables (wght, wdth, opsz…)
  size: number; lineHeight: { unit: 'auto' | 'px' | '%'; value?: number }; letterSpacing: { unit: 'px' | '%'; value: number };
  paragraphSpacing: number; paragraphIndent: number; align: 'left' | 'center' | 'right' | 'justify'; verticalAlign: 'top' | 'middle' | 'bottom';
  case: 'none' | 'upper' | 'lower' | 'title'; decoration: 'none' | 'underline' | 'strike'; fills: Paint[];
  features?: Record<string, boolean>;    // liga, tnum, ss01…
}
```

| Propriété | CSS |
| --- | --- |
| family / weight / italic | `font-family: "X", fallback; font-weight; font-style` |
| axes | `font-variation-settings: "wght" 640, "wdth" 110` |
| size | `font-size: Npx` |
| lineHeight auto / px / % | `line-height: normal` / `Npx` / `(N/100)` (sans unité) |
| letterSpacing px / % | `letter-spacing: Npx` / `(N/100)em` |
| paragraphSpacing | `margin-bottom: Npx` sur chaque `<p>` sauf le dernier ; `paragraphIndent` → `text-indent` |
| align / verticalAlign | `text-align` ; vertical via le flex du conteneur (`justify-content` en colonne) |
| case | `text-transform: uppercase \| lowercase \| capitalize` |
| decoration | `text-decoration: underline \| line-through` |
| fills | `color` (uni) ; dégradé → `background: …; -webkit-background-clip: text; color: transparent` |
| features | `font-feature-settings: "tnum" 1, "liga" 0` |

Texte riche : runs de styles → `<span>` avec classes dérivées. Le moteur de texte du canvas mesure avec les **mêmes polices** (chargées via `FontFace`, métriques `ascender/descender/lineGap` lues dans `hhea`/`OS/2` via un parseur de police embarqué) et reproduit l'algorithme de `line-height: normal` des navigateurs (`ascender + |descender| + lineGap`) ; la césure suit UAX #14 (comme les navigateurs). Les polices sont exportées en `@font-face` (`woff2`, sous-ensembles `unicode-range` par script, `font-display: swap`).

### 3.7 Générateur CSS et HTML

- Un nœud → un élément (`semantic.tag`) portant `class="de-xxxxxxxx [classes utilisateur]"`.
- Déclarations triées dans un ordre fixe (layout → boîte → fond → bordure → effets → texte → transform) pour que le diff entre deux exports soit lisible.
- Valeurs : px entiers sans décimale, sinon ≤ 2 décimales ; couleurs minimisées ; `0` sans unité.
- Les propriétés identiques à la valeur initiale CSS ne sont pas émises (sauf `box-sizing: border-box`, `position: relative` sur les conteneurs, `min-width: 0` sur les Fill, qui sont des **garanties de fidélité**).
- Chaque override de breakpoint → bloc `@media` ; chaque état (§4.3) → sélecteur `:hover`, `:active`, `:focus-visible`, `[disabled]`.
- Export React : mêmes classes, composants (§4) → fonctions React avec props typées ; styles dans un fichier CSS statique (pas de CSS-in-JS runtime), tokens (§4.4) → `:root { --t-… }`.

---

## MODULE 4 : SYSTÈME DE COMPOSANTS, VARIANTES ET TOKENS INTERACTIFS

### 4.1 Architecture des composants maîtres et des instances

```ts
interface ComponentDef {
  id: NodeId;                      // = id du ComponentNode maître
  name: string;                    // « Bouton », « Carte produit »
  props: PropDef[];                // §4.2
  variants?: VariantSet;           // §4.2
  states?: StateName[];            // §4.3
  root: NodeId;                    // sous-arbre maître (nœuds ordinaires, stockés dans le document)
}
type PropDef =
  | { kind: 'boolean'; name: string; default: boolean; bindsVisibilityOf: NodeId[] }
  | { kind: 'text';    name: string; default: string;  bindsTextOf: NodeId[] }
  | { kind: 'instanceSwap'; name: string; default: NodeId; bindsNode: NodeId; allowed?: NodeId[] }
  | { kind: 'variant'; name: string; values: string[]; default: string }
  | { kind: 'number' | 'color' | 'image' | 'link'; name: string; default: unknown; binds: { node: NodeId; path: string }[] };
```

**Correspondance stable des nœuds.** Chaque nœud du maître a un id. Une instance ne copie **pas** le sous-arbre : elle référence le maître et stocke des overrides indexés par **id du nœud maître** :

```ts
interface InstanceOverrides { [masterNodeId: NodeId]: Partial<Overridable & { text: RichText; asset: string; semantic: Partial<Semantic> }>; }
```

Rendu d'une instance = `materialize(def.root)` : clonage virtuel (en mémoire, sans ids nouveaux : chaque nœud matérialisé est adressé par le couple `(instanceId, masterNodeId)`) + application des props + application des overrides. **Non destructif** par construction : une modification du maître change `def.root`, et toutes les instances sont rematérialisées au prochain layout (invalidation par dépendance `def.id → instances`) ; seules les propriétés *overridées* dans une instance résistent, exactement comme Figma.

Règles d'override (identiques à Figma) : une instance peut changer texte, images, fills/strokes/effets, visibilité, props, états, overrides de breakpoint et **swap** d'instances imbriquées ; elle ne peut ni ajouter, ni retirer, ni réordonner des nœuds (sinon : « Détacher l'instance », `Ctrl+Alt+B`, qui copie le sous-arbre avec de **nouveaux ids** et perd le lien). Suppression d'un nœud du maître → les overrides orphelins sont conservés 30 jours (restauration si le nœud revient par undo) puis purgés.

Propagation : un patch sur un nœud du maître est appliqué une fois ; le coût est celui d'un re-layout des instances visibles (le cache de layout des instances hors écran est simplement invalidé).

### 4.2 Variantes et propriétés de composant

Un **jeu de variantes** est un composant dont le maître est une matrice de sous-maîtres indexée par les valeurs des props `variant` (`Taille = S | M | L`, `Style = Plein | Contour`). Changer une prop de variante sur une instance = changer le sous-maître référencé **en conservant les overrides par id** quand les ids correspondent (les sous-maîtres créés par duplication partagent les ids de leurs nœuds d'origine : c'est ce qui rend le passage `S → L` sans perte de texte).

Export : `<Button size="L" style="outline">` ; CSS : une classe par valeur de variante (`.de-btn--size-L`).

### 4.3 États interactifs natifs (Hover, Pressed, Focused, Disabled)

Plus de câblage entre frames. Un nœud (le plus souvent la racine d'un composant) porte des **états** = overrides nommés :

```ts
type StateName = 'hover' | 'pressed' | 'focused' | 'disabled' | 'checked' | string /* états personnalisés */;
states: { hover: { fills: [...], geometry: { ... }, effects: [...] }, pressed: { ... } }
```

- Résolution : `resolve(node, prop, bp, state)` ajoute l'état en tête de la cascade (état > breakpoint > base). Un état peut lui-même être overridé par breakpoint (`overrides[bp].states?.hover`) : utile pour supprimer le hover sur mobile.
- Édition « au pixel près » : l'inspecteur a un sélecteur d'état ; tout contrôle modifié pendant qu'un état est sélectionné écrit dans `states[état]`. Le canvas peut **épingler** un état (`Alt+clic` sur la puce d'état) pour le voir en permanence.
- Transition par défaut entre états : §5.2 (spring ou courbe), réglable par propriété.
- Export CSS : `:hover`, `:active`, `:focus-visible`, `[disabled]`/`[aria-disabled="true"]`, `[aria-checked="true"]` ; états personnalisés → `[data-state="…"]`. Le `scale` d'un état pressé → `transform: scale(.97)` **composé** avec la rotation existante (le générateur fusionne les transforms). Un décalage d'ombre → nouvelle liste `box-shadow` complète (CSS ne modifie pas une ombre individuellement).

```css
.de-btn { transition: background-color 180ms cubic-bezier(.2,.8,.2,1), transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms …; }
.de-btn:hover  { background-color: #2440C9; box-shadow: 0 6px 16px -6px rgba(0,0,0,.35); }
.de-btn:active { transform: scale(.97); }
.de-btn:focus-visible { outline: 2px solid #3657FF; outline-offset: 2px; }
.de-btn[disabled] { opacity: .5; pointer-events: none; }
```

### 4.4 Variables et Design Tokens unifiés

```ts
interface TokenStore { sets: TokenSet[]; modes: Mode[]; activeMode: Record<string /*setId*/, string /*modeId*/>; }
interface TokenSet { id: string; name: string; tokens: Record<string, Token>; }
interface Token {
  type: 'color' | 'dimension' | 'number' | 'string' | 'boolean' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'shadow' | 'typography';
  valueByMode: Record<string, TokenValue | { alias: string /* '{color.brand.500}' */ }>;
  description?: string;
}
```

- **Liaison** : toute propriété de l'inspecteur acceptant une valeur primitive (couleur, px, texte, booléen de visibilité, famille, graisse, durée) peut être liée à un token : le champ affiche une pastille `{color.brand.500}` ; la valeur stockée devient `{ ref: 'color.brand.500' }` et est résolue à la lecture (`resolveToken(ref, mode)`), avec détection de cycles d'alias (limite de profondeur 32).
- **Modes** (Clair/Sombre, Compact/Confort) : un token a une valeur par mode ; un frame peut forcer un mode (`modeOverride`) → export en `[data-theme="dark"]` ou `@media (prefers-color-scheme)`.
- **Export CSS** : `:root { --color-brand-500: #3657FF; --space-4: 16px; }` et les propriétés liées sont émises `background-color: var(--color-brand-500)` — l'export reste vivant côté code.
- **Import/export W3C Design Tokens (DTCG, format 2024)** :

```json
{
  "color": { "brand": { "500": { "$type": "color", "$value": "#3657FF" },
                        "600": { "$type": "color", "$value": "{color.brand.500}", "$description": "alias" } } },
  "space": { "4": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } } },
  "motion": { "spring": { "$type": "cubicBezier", "$value": [0.2, 0.8, 0.2, 1] } },
  "shadow": { "card": { "$type": "shadow", "$value": { "color": "#00000040", "offsetX": {"value":0,"unit":"px"}, "offsetY": {"value":4,"unit":"px"}, "blur": {"value":12,"unit":"px"}, "spread": {"value":0,"unit":"px"} } } }
}
```

Les **styles nommés** (texte, couleur, effet, grille) sont des tokens composites (`typography`, `shadow`) : un style de texte lie `family/weight/size/lineHeight/letterSpacing`, et son export est une classe utilitaire (`.t-heading-1`) plus les variables.

---

## MODULE 5 : MOTEUR D'ANIMATION (SMART ANIMATE NATIF ET PHYSIQUE DES RESSORTS)

### 5.1 Smart Animate : interpolation de calques entre écrans

Une transition `A → B` (deux frames, deux variantes, deux états) est calculée par **appariement de nœuds** puis **interpolation par propriété**.

**Appariement** (dans l'ordre) :
1. même `NodeId` (variantes et instances partagent les ids des nœuds : §4.2 — c'est le cas nominal, infaillible) ;
2. sinon, même **chemin de noms** (`Carte / Image / Badge`) et même `type` ;
3. sinon, même nom au même niveau de profondeur (tolérant à un déplacement) ;
4. sinon : le nœud n'existe que d'un côté → **fondu** (opacité 0 → 1 ou 1 → 0) à sa position, avec un léger `scale(0.98 → 1)` optionnel.

**Interpolation par type de propriété** (paramètre `t ∈ [0,1]` fourni par la courbe ou le ressort) :

| Propriété | Interpolation |
| --- | --- |
| position, taille, padding, gap, rayon, épaisseur, flou, offsets d'ombre | linéaire sur les valeurs **résolues** (boîtes monde, pour éviter les sauts dus à un changement de parent) |
| rotation | linéaire sur le plus court arc (`Δθ` ramené dans `(−180, 180]`) |
| opacité | linéaire |
| couleur | dans l'espace **Oklab** (évite les gris sales du mélange sRGB), alpha prémultiplié |
| dégradé | stops appariés par index après égalisation du nombre de stops (insertion de stops interpolés), angle sur le plus court arc |
| texte | pas d'interpolation du contenu ; fondu croisé si le contenu change ; propriétés typographiques interpolées |
| chemin vectoriel | §5.1.1 |
| visibilité | fondu |

**5.1.1 Morphing de chemins.** Deux `VectorNode` appariés : (1) chaque chemin est converti en sous-chemins de cubiques (`L`→cubique dégénérée, `A`→cubiques par découpage en arcs ≤ 90°) ; (2) les sous-chemins sont appariés par ordre et par proximité de centroïde ; (3) pour chaque paire, le sous-chemin le moins dense est **rééchantillonné par longueur d'arc** jusqu'à égaliser le nombre de segments (subdivision de De Casteljau au milieu du plus long segment, itérée) ; (4) rotation de l'index de départ pour minimiser la somme des distances point à point (chemins fermés) ; (5) interpolation linéaire des points de contrôle. Les chemins sont exportés comme SVG avec `<animate attributeName="d">` (même nombre de commandes garanti) ou animés par WAAPI sur l'attribut `d` via `path()`.

**Rendu de la transition** : pendant `[0, T]`, le moteur rend l'arbre **A** avec les propriétés interpolées (pas un fondu de deux images) ; les nœuds « B seulement » sont ajoutés à leur place dans l'ordre z de B. Les mises en page `stack` sont interpolées sur les boîtes résolues, puis le document bascule sur B à `t = 1`.

### 5.2 Moteur de physique : courbes et ressorts

```ts
type Easing =
  | { kind: 'linear' }
  | { kind: 'bezier'; p1x: number; p1y: number; p2x: number; p2y: number }    // ease-in = (.42,0,1,1), ease-out = (0,0,.58,1), ease-in-out = (.42,0,.58,1)
  | { kind: 'spring'; mass: number; stiffness: number; damping: number; velocity?: number /* px/s */; restDelta?: number; restSpeed?: number };
interface AnimationConfig { trigger: 'onChange' | 'hover' | 'press' | 'appear' | 'scroll' | 'load' | 'delay'; delay?: number; duration?: number; easing: Easing; perProperty?: Record<string, { easing: Easing; delay?: number }>; }
```

**Courbes** : `cubic-bezier(p1x, p1y, p2x, p2y)` ; le moteur résout `t(x)` par Newton-Raphson (8 itérations, ε 10⁻⁶) puis bissection, comme WebKit. Durée explicite `duration` (ms).

**Ressort** — oscillateur harmonique amorti autour de la cible (`x` = écart à la cible, `x(0) = x₀`, `v(0) = v₀`) :

```
m·x'' + c·x' + k·x = 0         avec  m = mass, k = stiffness, c = damping
ω₀ = √(k/m)                     pulsation propre
ζ  = c / (2·√(k·m))             taux d'amortissement

ζ < 1 (sous-amorti) :  ωd = ω₀·√(1−ζ²)
    x(t) = e^(−ζ·ω₀·t) · ( x₀·cos(ωd·t) + ((v₀ + ζ·ω₀·x₀)/ωd)·sin(ωd·t) )
ζ = 1 (critique) :
    x(t) = e^(−ω₀·t) · ( x₀ + (v₀ + ω₀·x₀)·t )
ζ > 1 (sur-amorti) :  ωd = ω₀·√(ζ²−1)
    x(t) = e^(−ζ·ω₀·t) · ( x₀·cosh(ωd·t) + ((v₀ + ζ·ω₀·x₀)/ωd)·sinh(ωd·t) )
```

Valeur rendue : `value(t) = target − x(t)` (le ressort est appliqué à chaque propriété animée, normalisée sur `[0,1]` : `x₀ = 1`). Défauts (Framer) : `mass 1, stiffness 100, damping 10` → `ζ = 0.5`, `ω₀ = 10 rad/s`. **Durée de repos** : premier `t` tel que `|x(t)| < restDelta` **et** `|x'(t)| < restSpeed` (défauts `0.001` et `0.001` en fraction/s), cherché par pas de 1 ms puis affiné par bissection ; borne dure 10 s. Vitesse initiale `v₀` : reprise d'un drag ou d'une animation interrompue (continuité C¹, pas de saut).

**Sortie CSS** : un ressort n'a pas d'équivalent `cubic-bezier`. Le générateur émet la fonction **`linear()`** (CSS Easing Level 2, Chrome 113+, Firefox 112+, Safari 17.2+) en échantillonnant `value(t)` :

```
N = clamp(round(durée_repos / 8 ms), 24, 240) points      // ≥ 120 Hz de résolution temporelle
transition: transform 612ms linear(0, 0.0431, 0.1567, 0.3112 … 1.0021, 0.9994, 1);
```

(les dépassements > 1 sont légaux dans `linear()` et reproduisent le rebond). Repli pour les navigateurs sans `linear()` : WAAPI (`element.animate(keyframes, { easing: 'linear', duration })` avec les mêmes échantillons en keyframes), chargé uniquement si `CSS.supports('transition-timing-function', 'linear(0,1)')` est faux.

**Prévisualisation 60/120 FPS** : le canvas évalue la forme fermée à chaque `requestAnimationFrame` avec le **temps réel** (`performance.now()`), jamais par incrément de frame — identique à 60 et 120 Hz, robuste aux frames perdues. Le panneau d'animation affiche la courbe `value(t)`, la durée de repos et un scrubber ; `Shift+Espace` rejoue.

**Déclencheurs** : `hover/press/focus` → états (§4.3) ; `appear/scroll` → `IntersectionObserver` + classes (`.de-in-view`) ; `scroll` lié (parallaxe, progression) → `animation-timeline: scroll()`/`view()` quand disponible, sinon rAF ; `load` → `@keyframes` + `animation`. Les animations respectent `prefers-reduced-motion` : le générateur émet une version sans mouvement (opacité seule) sous `@media (prefers-reduced-motion: reduce)`.

---

## Annexes

### A. Budgets de performance (document de 50 000 nœuds, 10 000 visibles)

| Opération | Budget |
| --- | --- |
| Frame canvas (pan/zoom) | ≤ 8 ms à 120 Hz |
| Patch local + layout incrémental + redraw | ≤ 12 ms |
| Ouverture d'un document | ≤ 1,5 s (parse + premier layout + première frame) |
| Export HTML/CSS complet | ≤ 2 s |
| Mémoire GPU (caches) | ≤ 512 Mo, LRU |

### B. Raccourcis (parité Figma, AZERTY-safe : `e.code` pour les chiffres, `e.key` pour les lettres)

`V` déplacer · `K` échelle · `F` frame · `R` rectangle · `O` ellipse · `L` ligne · `P` plume · `Shift+P` crayon · `T` texte · `Shift+Ctrl+K` image · `C` commentaire · `H` main · `Espace` main temporaire · `Shift+A` auto layout · `Ctrl+Alt+K` créer un composant · `Ctrl+Alt+B` détacher · `Ctrl+G` grouper · `Ctrl+Shift+G` dégrouper · `Ctrl+D` dupliquer · `Ctrl+Shift+H` masquer · `Ctrl+Shift+L` verrouiller · `Ctrl+R` renommer · `Ctrl+]`/`[` ordre z · `Alt` (maintenu) cotes · `Shift+2` zoom sélection · `Ctrl+Shift+'` grille de pixels · `Shift+E` prototype · `Shift+D` mode dev · `Ctrl+K` palette de commandes · `?` aide.

### C. Feuille de route d'implémentation (Studio Jeere v3)

| Phase | Périmètre | Critère de sortie |
| --- | --- | --- |
| **A — Moteur** | Modèle (§0), solveur Flex/Grid (§2.3), générateur CSS (§3.7), harnais de conformité (§0.6) | 200 fixtures ≤ 0,5 px vs Chromium ; `K_BLUR` fixé |
| **B — Canvas** | Rendu GPU + Canvas2D, zoom 10–25 600 %, snapping, guides, règles, grille, breakpoints (module 1), inspecteur complet (module 3), barre d'outils flottante | Les sections de boutique existantes deviennent des composants ; « Détacher » permet d'éditer chaque élément |
| **C — Système** | Composants, variantes, états, tokens, styles (module 4) | Import/export DTCG ; états exportés en CSS pur |
| **D — Mouvement** | Smart animate, ressorts, `linear()`, déclencheurs (module 5) | Prévisualisation 120 Hz ; sortie sans JS pour hover/press/appear |

Chaque phase est livrée avec sa suite de conformité et une revue par des évaluateurs « Figma », « Framer » et « Webflow » notant /10 avant et après.
