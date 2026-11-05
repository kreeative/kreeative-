# DualEngine — Phase A (engine)

Implementation of `../SPEC-DUALENGINE.md` (sections 0–3 and 5.2; Annexe C, phase A). There is a single
node tree, and each node has two readings. The **vector** reading is the box `{x, y, w, h, rotation}`
resolved by a deterministic layout solver. The **semantic** reading is the HTML/CSS that the
generator exports. The conformance harness proves that the two readings agree in Chromium
(at most 0.5 px for boxes, plus checks on CSS validity and ΔE00 pixel distance).

No build step and no npm dependencies. Each file is a classic script (an IIFE that augments
`window.DualEngine`) and also a CommonJS module (`module.exports`, guarded), so the same code runs
in the Studio and in Node.

## Files (load order)

| file | role (spec section) |
| --- | --- |
| `model.js` | Document / Node types (JSDoc), `createDocument`, `createNode(type, props)`, UUID v4 ids, `classOf` (`de-xxxxxxxx`), tree helpers (`parentOf`, `childrenOf`, `ancestors`, `descendants`, `addNode`, `removeNode`, `worldBox`, `rotatedBBox`), `validateDocument → issues[]` (errors and warnings, checked on the resolved values of **every breakpoint**), `inferTag` / `inferTags` (§0.4: `Heading/N` text → `hN`, `Bouton` instance → `button` / `a`), `serialize` / `deserialize` (§0.3–0.4, §1.4) |
| `history.js` | RFC 6902 JSON Patch `applyPatch` (returns the exact inverse; atomic: a failing patch is rolled back, `move` included) / `invertPatch`, `History` (transactions, `coalesceKey` with a 500 ms window — never across an undo —, 1000-entry undo stack, redo, `seal`; a failing undo/redo leaves both stacks unchanged), `Emitter` change events, `setProp` patch builder (§0.5). Pointers through `__proto__` / `constructor` / `prototype` are refused (the format is meant for collaboration) |
| `resolve.js` | cascade `resolve(doc, node, prop, bp, state)`: state > breakpoint chain > base; object props merge per key; state overrides per breakpoint (§1.5, §4.3). `mediaBounds` / `mediaQuery` (the `.98` convention), `activeBreakpoint`. Tokens: `resolveToken(ref, mode)` with aliases, cycle detection and a depth limit of 32 (throws), `resolveRefs` for `{ref}` values (copy-on-write; an unresolvable reference falls back to `ref.fallback` or a neutral value and is reported, never thrown), `checkTokens`, `cssVarName` (§4.4) |
| `text-metrics.js` | generated advance and kerning tables for the fixture fonts (Inter 400–700, DejaVu Sans 400/700), measured in Chromium by `conformance/tools/gen-font-metrics.js` |
| `text.js` | pluggable measurer `measureText(text, style, availableWidth, opts) → {width, height, lines, …}` (memoised by content). Shared line breaker (simplified UAX #14: breaks after spaces and hyphens, one CJK character per chunk, trailing spaces hang, `overflow-wrap: anywhere` inside over-long words; tabs advance to tab-size 8 stops; NBSP measures as a space; an empty paragraph keeps one line). `line-height: normal` follows Blink: round(asc) + round(desc) + round(gap) from hhea metrics, overridable per family. A CJK fallback-font model widens the line box (union of the inline boxes, CSS 2.1 §10.8). `createTableMeasurer()` for Node, `createCanvasMeasurer()` for the browser (canvas `measureText`) (§2.7, §3.6) |
| `layout.js` | `LayoutEngine`: absolute mode with constraints (left/right/leftRight/center/scale, using the wider breakpoint's layout as the reference size, border-box reference minus real borders) (§2.5). Flexbox per CSS Flexbox §9: single line and wrap, gap and `auto` (space-between), negative spacing as margins, padding plus real borders with the border-box floor (a box is never smaller than padding + border), justify/align including baseline (container baselines synthesised from the first item's border box, §8.5), `flex: 1 1 0%` for fill, min/max freeze loop (min wins over max), grow factors < 1 (§9.7 4b), hug = fit-content, cyclic percentages (auto in a hug parent, then resolved), align-content stretch for wrapped lines (§2.2–2.3). Grid: CSS placement order (explicit, row-locked, then auto), implicit columns, track sizing for px/fr/auto/minmax with gaps, spans and justify/align-self (§2.6). Absolute children inside stacks (§2.4), text resize modes (§2.7), rotation bounding boxes (§1.4), aspect-locked leaves (§3.1). **Blink LayoutUnit**: specified lengths are the exported value (2 decimals) truncated to 1/64 px and saturated at ±33 554 431 px. Output per breakpoint: `boxes` (parent coordinates), `world` (page coordinates, rotated bbox), `matrices`, `text` — `world` / `matrices` are views (`get`, `has`, `forEach`, `size`) over root-relative values. **Incremental** (§2.3): see below |
| `motion.js` | cubic-bezier solver (8 Newton iterations at ε 1e-6, then bisection, as in WebKit; x control values clamped to [0, 1], non-finite values replaced, both reported in `warnings`); closed-form springs for ζ < 1, ζ = 1 and ζ > 1 (the over-damped one as two decaying exponentials: finite for any damping) with v0; velocity in px/s normalised by `opts.distance` (px); rest detection (restDelta/restSpeed, 1 ms steps then bisection, 10 s cap); `linear()` sampler with N = clamp(round(T/8 ms), 24, 240) **points**; WAAPI keyframes fallback (§5.2) |
| `css.js` | generator §3.7 with mappings §3.1–3.6: stable classes, fixed declaration order, number formatting (integers bare, ≤ 2 decimals, no superfluous zero: `.5`, `0` without a unit, colours minimised `#rgb`), `@media` blocks from wide to narrow, state selectors (`:hover`, `:active`, `:focus-visible`, `[disabled]` + `[aria-disabled="true"]`, `[aria-checked]`, `[data-state]`) whose cascade with the media blocks reproduces the engine's (state > breakpoint > base), transform composition (`rotate scaleX scaleY` plus state scale). Radii: CSS proportional reduction then ≤ min(w, h)/2 (§3.2); squircle `clip-path: path()` in absolute coordinates; squircles with strokes or drop shadows are split into an unclipped wrapper (strokes as an SVG ring in `::after`, shadows as `drop-shadow()`) and a clipped inner box. Fills: solid, linear with the exact angle and stop remap, radial (Mat3 `transform` or handles; rotated ellipses → SVG background), conic, diamond (exact SVG background: four quadrant linear gradients), image. Blend-mode table, Normal groups isolated (`isolation: isolate`); strokes as inside/outside/center box-shadow, dashed border/outline, per-side borders, gradient border; lines as inline SVG `<line>` (caps, dashes). Effects: box-shadow lists, `drop-shadow()` for squircles and `showBehindTransparent: false`, `filter: blur(K_BLUR·r)`, `backdrop-filter` (+ `-webkit-backdrop-filter` under `@supports`). Layout extras: `aspect-ratio`, `object-position` from an image crop, margins for negative spacing, px sizes for hug absolute-mode frames, z-index for reverseZ (absolute children on top). Typography table, tokens → `:root` variables plus `var()` (broken alias chains → neutral fallback + warning), `@font-face`, `prefers-reduced-motion` block. **`K_BLUR` is a named constant written by the harness** |
| `html.js` | HTML emission: semantic tags, nesting, `<img alt>`, text runs → `<span>`, paragraphs (an empty paragraph holds a `<br>`), squircle wrapper (`.cls-in`), line SVG, document wrapper |
| `raster.js` | Phase A reference Canvas2D rasteriser: rects with clamped or squircle radii, ellipses, solid/linear/radial (rotated)/conic/diamond fills, strokes (squircle strokes as clipped path strokes, line caps), drop and inner shadows (σ = blur/2), layer blur as a true Gaussian (σ = radius/2, Figma semantics), opacity and blend layers, isolated Normal groups, the export's paint order (absolute children and reverseZ), clipping, rotation. Text is drawn but excluded from pixel comparison |
| `index.js` | assembles `DualEngine` (`exportDocument(doc, opts) → {html, css, rules, layouts, warnings}`, `createEngine(doc)`) |

Browser:

```html
<script src="engine/model.js"></script> <script src="engine/history.js"></script> <script src="engine/resolve.js"></script>
<script src="engine/text-metrics.js"></script> <script src="engine/text.js"></script> <script src="engine/layout.js"></script>
<script src="engine/motion.js"></script> <script src="engine/css.js"></script> <script src="engine/html.js"></script>
<script src="engine/raster.js"></script> <script src="engine/index.js"></script>
<!-- window.DualEngine; DualEngine.SCRIPTS lists this order -->
```

Node: `const DE = require('./engine/index.js')`.

## API sketch

```js
const DE = require('./engine/index.js'), M = DE.model, H = DE.history;
const doc = M.createDocument();                                  // breakpoints base 1440 / tablet 834 / phone 390
const row = M.addNode(doc, M.createNode('frame', {
  layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'hug' },
  layoutParent: { mode: 'stack', direction: 'horizontal', gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 } },
  overrides: { phone: { layoutParent: { gap: 4 } } }
}), null);
const card = M.addNode(doc, M.createNode('rect', { layoutChild: { position: 'flow', widthMode: 'fill', heightMode: 'fixed' }, fills: [M.solid('#3657ff')] }), row.id);

const engine = DE.createEngine(doc);                             // incremental layout engine
const base = engine.layout('base');                              // { boxes, world, matrices, text, … } Map<id, {x,y,w,h}>
const history = new H.History();
history.on('change', e => e.patches.forEach(p => engine.invalidateFromPatch(p)));
history.commit(doc, [H.setProp(doc, card.id, 'opacity', 0.5)], { label: 'Opacity', coalesceKey: 'scrub:opacity' });
history.undo(doc);

const out = DE.exportDocument(doc);                              // { html, css, rules, layouts, warnings }
DE.resolve.resolve(doc, card, 'fills', 'phone', 'hover');        // state > breakpoint chain > base
DE.motion.springToLinear({ mass: 1, stiffness: 100, damping: 10 }).css;   // 'linear(0, …, 1)'
```

`validateDocument` returns `[{ path, message, level }]`. It rejects, among other things, a hug
container with a fill child on its main axis (§2.2), unordered breakpoints, broken parent links,
cycles, and `de-` class collisions.

Generator warnings (`out.warnings[].code`) flag the places where the export is approximate or the
document needs attention: `squircle-shadow` (inner shadow on a squircle), `shadow-approx` (spread on
drop-shadow), `dash-approx`, `blend-fallback` (linear burn → multiply), `rasterised` (rotated radial
or diamond gradient → SVG background), `ellipse-stroke` (inside/outside stroke on a non-circular
ellipse), `negative-gap` (negative row / grid gap → 0), `backdrop-opaque`, `border-align`, `easing`
(sanitised cubic-bezier), `token` (broken alias chain → fallback) and `validate` (warnings of
`validateDocument`: token cycles, negative gaps on wrapping stacks, x/y overrides on flow children,
rotation outside [−180, 180), coordinates beyond Blink's range).

## Incremental layout (§2.3)

`invalidateFromPatch(patch)` classifies the patch: paint-only paths (fills, effects, opacity, blend,
corners, name, semantic…) only drop the node's resolved view — no layout runs; layout paths drop the
node's caches and its ancestors' layout caches; structural paths (children, visibility, node
add/remove) also rebuild the persisted maps. Each cached layout call records only its own writes
(child boxes, measured text, nested calls); a breakpoint's result is persistent and a nested call
that already owns its subtree in it is not replayed, so an untouched sibling costs one lookup.
World boxes are root-relative views, recomputed only for subtrees whose box or transform changed.
Subtrees without overrides / viewport units / constraints share their cache entries across
breakpoints. The cache key of a container includes the wider-breakpoint reference sizes its
constraints read, so incremental == full layout: `tests/incremental.test.js` fuzzes 600 random
recorded edits (sizes, modes, direction, wrap, negative gaps, overrides, visibility, moves, removals,
undo/redo, constraints, text with tabs) and compares every world box and text height with a fresh
layout after each one.

## Tests

```sh
node engine/tests/run.js            # 89 assertion-based unit tests (model, history, resolve, motion, layout/css/text,
                                    # incremental == full fuzz, review regressions)
node engine/tests/run.js history    # filter by name
```

## Conformance harness (§0.6)

```sh
node engine/conformance/gen-fixtures.js                    # regenerate fixtures 001–203 (keeps the others)
node engine/conformance/gen-fixtures-review.js             # regenerate the review-fix fixtures (258–272)
node engine/conformance/perf.js --md engine/conformance/PERF.md   # 50 000-node benchmark (appended to REPORT.md)
node engine/conformance/harness.js                         # full run → conformance/REPORT.md
node engine/conformance/harness.js --calibrate --write-kblur   # also re-fit K_BLUR and write it into css.js
#   --filter <substr>  --group <name>  --no-pixel  --save-diffs <dir> [--save-all]  --report <path>  --quiet
```

For every fixture the harness does four things:

1. Lays the fixture out with the engine in Node, using the table measurer.
2. Renders the exported HTML/CSS in headless Chromium (Playwright) at each breakpoint's viewport width. It compares every node's `getBoundingClientRect` with the engine's world box, with a tolerance of 0.5 px on x, y, w and h.
3. Checks every emitted declaration with `CSS.supports` and confirms that it survives in the parsed CSSOM.
4. For pixel fixtures (83), compares the engine's Canvas2D raster (`raster.js`, run in the page) with a Chromium screenshot. The thresholds are a mean ΔE00 ≤ 1.0 and ≤ 2 % of pixels with ΔE00 > 5, with text areas masked out.

The fixtures cover:
- every row of the §2.2 matrix (direction, wrap, gap and auto, padding, 3×4 alignment, clip, reverseZ, fixed/vw/hug/fill/min/max, order, alignSelf)
- nested stacks, wrap with space-between, baseline alignment
- grids (px/fr/auto/minmax, spans, self-alignment, per-breakpoint columns)
- absolute positioning and every constraint at 3 breakpoints
- text resize modes, truncation, letter-spacing, runs and CJK
- rotation, radius clamping, squircles
- every stroke alignment, dashed and per-side strokes, gradient borders
- shadows and blur
- gradients at 8 angles with off-box handles, radial/conic, stops outside [0, 1]
- all blend modes, states, tokens with modes, responsive overrides, images and semantics
- 54 adversarial fixtures from the review (204–257: 20-deep nesting, padding larger than the box,
  negative and fractional spacing, huge coordinates, bordered constraint parents, grid spans past the
  explicit tracks, grow < 1, cyclic percentages, empty / tab / NBSP text, baselines of rect-first
  containers…); two of them must be **refused** by `validateDocument` (`expectInvalid`)
- 15 fixtures for the review fixes (258–272: squircle strokes, lone large corner, Normal-group
  isolation, Mat3 / rotated radial / diamond gradients, line caps, reverseZ with absolute children,
  negative-gap overlap, aspect lock, grid placement order, `drop-shadow()`)

**Status: 271/272 pass, 0 fail, 1 documented limit.** The largest box error is 0.063 px, 13 729
declarations are checked, and the worst pixel fixture has a mean ΔE00 of 0.14. The limit is
`huge-4e7` (a 40 000 000 px rect): Blink saturates layout values at ±33 554 431 px; the engine
saturates the same way and `validateDocument` warns, but Chromium's float32 `DOMRect` puts the
width 4 px lower — the harness reports it as LIMIT, never as a pass. See `conformance/REPORT.md`.

**K_BLUR calibration.** The calibration minimises mean ΔE00 over the blurred-disc fixtures
(r = 4, 8, 16, 24, 40) for candidates 0.30 to 0.70 in steps of 0.02. The reference is the engine's
true Gaussian with σ = r/2 (Figma semantics). The comparison is against Chromium's `filter: blur(K·r)`.
The result is `K_BLUR = 0.52` (mean ΔE00 0.0238; 0.50 gives 0.0275). The value and the whole
candidate table are in the comment above the constant in `css.js`.

Fonts: the fixtures use Inter and DejaVu Sans, which are installed system fonts. CJK glyphs fall back
to WenQuanYi Zen Hei, as fontconfig does on this machine. `text-metrics.js` holds Chromium-measured
tables for the Node measurer. In the browser, `createCanvasMeasurer()` measures with the page's real
fonts instead. You can pass per-family vertical metrics with
`createTableMeasurer(tables, { Family: { upm, ascender, descender, lineGap } })`.

## Performance (Annexe A / §2.3)

`conformance/perf.js` (50 sections × 20 wrapping rows × 10 cards = 51 050 nodes, 20 000 texts,
Node, table measurer; figures vary ±20 % run to run on this machine):

| | before the review fixes | now | budget |
| --- | --- | --- | --- |
| local patch + incremental layout (leaf height / text / card width / opacity), median | 932 / 845 / 856 / 843 ms | 2.0 / 0.6 / 0.6 / 0.01 ms | < 4 ms |
| same, worst of 25 | 4 225 ms | 5.5 ms (GC pauses) | ≤ 12 ms with redraw |
| open: parse + validate + first base layout | 2 628 ms | ≈ 1 900–2 300 ms | ≤ 1 500 ms + first frame |
| full export (HTML + CSS, 3 breakpoints) | 15 546 ms | ≈ 3 700 ms | ≤ 2 000 ms |

The incremental budgets are met. Opening and exporting a 50 000-node document are 4× faster but
still over budget: the remaining cost is allocation (GC ≈ 25 %), per-node map lookups and JSON
parsing of a 50 MB document. Next steps (Phase B): typed-array box storage per breakpoint, export
streamed per section in a Worker, lazy layout of off-screen breakpoints, a compact document encoding.

## Spec notes and errata (to fold into SPEC-DUALENGINE.md)

The spec is not edited from here (engine scope); these points are implemented as described:

- **§2.5, rows right / bottom**: `x' = W − (W0 − x − w)` is the right edge; the left position is
  `x' = W − (W0 − x − w) − w` (same for `y'`). The CSS column (`right: (W0 − x − w)px`) is right.
  With a real CSS border, every value is in the padding box: `x − bw` replaces `x` everywhere.
- **§3.2**: when a corner has no room for the full smoothing (L/2 < (1 + ξ)·R), ξ is reduced to
  p/R − 1 (the figma-squircle behaviour the spec cites); the literal formula is used otherwise.
  Paths are emitted in absolute coordinates.
- **§3.5 / §3.7**: colours are minimised (`#000`, `#fff`, `rgba(…, .25)`) and numbers drop the
  leading zero everywhere (`.5px`, `opacity: .5`) — §3.7's rule; §3.5's `#RRGGBB` should read
  "hex minimised".
- **§3.5**: Chromium's `CSS.supports` rejects `-webkit-backdrop-filter`; the prefixed declaration is
  emitted in `@supports (-webkit-backdrop-filter: none) and (not (backdrop-filter: none))`, which the
  harness checks only where the condition holds.
- **§5.2**: `Easing.velocity` is in px/s; it is normalised by the animated distance
  (`opts.distance`, px). Without a distance it is taken as a fraction of the distance per second.
  N counts points (`linear()` has N values, the first at 0 and the last at T).
- **§0.3**: `isolate = false` means pass-through; a group with `blendMode: 'normal'` is isolated.
- **§3.4**: lines are SVG strokes (`<line>` with `stroke-linecap`); ellipses keep box-shadow strokes
  (exact for circles, a warning otherwise).

## Phase B additions (the Studio)

- `LayoutEngine(doc, { viewport, nominalReference: true })`: a canvas laid out at a width that is not
  its breakpoint's (a 1440 or a 360 artboard) reads the constraint reference sizes from the nominal
  layouts (each breakpoint at its own width), exactly like the exported CSS whose `right` / `center` /
  `scale` values come from those layouts. Off by default: the export and the conformance runs are
  unchanged (`nominalEngine()` forwards every invalidation).
- `TextStyle.family` may be a fallback list (`"Playfair, Playfair Display, Georgia, serif"`):
  `css.js` quotes each name (generic keywords bare, `sans-serif` added only without one) and the canvas
  measurer builds the same `font` string. A single family is emitted as before.
- The Studio's bridge, detach, canvas and inspector are in `../studio-engine.js`,
  `../studio-canvas.js`, `../studio-inspector.js`; the store side in `../../creer/engine-sections.js`.

## Next phases (Annexe C)

- **B — Canvas.** WebGL2 renderer (instanced SDF rects, borders and shadows; image atlas; MSDF glyph atlas; two-pass separable blur on FBOs), with a Canvas2D/OffscreenCanvas fallback built on `raster.js`. Zoom from 10 % to 25 600 % with tile-relative GPU coordinates, quadtree culling, LOD, raster caches per zoom band, and 512 px tiles. Snapping (pixel, objects, guides, stack insertion by the midpoint rule §1.3), rulers, guides, pixel grid, breakpoint artboards, the two-column inspector (controls ↔ CSS from `css.nodeDeclarations`), and the floating toolbar. The existing store sections become components; "Detach" makes every element editable.
- **C — System.** Components and instances (`materialize(def.root)` with overrides keyed by master node id), variants, props, interactive states in the inspector, tokens and named styles, DTCG 2024 import/export, `modeOverride` → `[data-theme]` / `prefers-color-scheme`.
- **D — Motion.** Smart Animate (node matching, Oklab colour interpolation, path morphing §5.1.1), spring and bezier transitions driven by `motion.js` (`linear()` output and the WAAPI fallback already exist), triggers (`hover` / `press` / `appear` / `scroll` / `load`), and a 120 Hz preview evaluated against real time.
