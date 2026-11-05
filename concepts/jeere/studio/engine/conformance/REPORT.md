# DualEngine — Conformance report (Phase A)

Generated 2026-11-05T18:41:21.926Z · Chromium (Playwright) · 272 fixtures · **271 pass / 0 fail** · 1 documented limit (not counted as passes)

Criteria (§0.6): boxes |Δx|,|Δy|,|Δw|,|Δh| ≤ 0.5 px at every breakpoint (getBoundingClientRect, rotated bbox); every declaration accepted by `CSS.supports` and retained by the CSSOM; pixel fixtures ΔE00 mean ≤ 1 and ≤ 2 % of pixels with ΔE00 > 5 (text excluded).

K_BLUR used: **0.52** — K_BLUR = 0.52 (mean ΔE00 0.0238 over r=4, r=8, r=16, r=24, r=40, Chromium 153.0.8010.12)

## K_BLUR calibration

| K | mean ΔE00 |
| --- | --- |
| 0.30 | 0.2616 |
| 0.32 | 0.2427 |
| 0.34 | 0.2194 |
| 0.36 | 0.2008 |
| 0.38 | 0.1725 |
| 0.40 | 0.1442 |
| 0.42 | 0.1208 |
| 0.44 | 0.1023 |
| 0.46 | 0.0748 |
| 0.48 | 0.0518 |
| 0.50 | 0.0275 |
| 0.52 | 0.0238 ← best |
| 0.54 | 0.0330 |
| 0.56 | 0.0503 |
| 0.58 | 0.0782 |
| 0.60 | 0.1012 |
| 0.62 | 0.1285 |
| 0.64 | 0.1514 |
| 0.66 | 0.1842 |
| 0.68 | 0.1934 |
| 0.70 | 0.2261 |

Totals: max box error 0.063 px · 13729 declarations checked · 83 pixel comparisons (worst mean ΔE00 0.136, worst % > 5: 0.19)

| # | fixture | group | status | max Δ (px) | worst node (bp) | decl | css issues | ΔE00 mean | % > 5 | warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | matrix-direction-horizontal | matrix | pass | 0.000 |  | 38 | 0 | 0.000 | 0.00 |  |
| 2 | matrix-direction-vertical | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 3 | matrix-wrap | matrix | pass | 0.000 |  | 61 | 0 |  |  |  |
| 4 | matrix-wrap-stretch | matrix | pass | 0.000 |  | 55 | 0 |  |  |  |
| 5 | matrix-wrap-align-end | matrix | pass | 0.000 |  | 50 | 0 |  |  |  |
| 6 | matrix-gap-auto | matrix | pass | 0.000 |  | 38 | 0 | 0.000 | 0.00 |  |
| 7 | matrix-gap-auto-single | matrix | pass | 0.000 |  | 28 | 0 |  |  |  |
| 8 | matrix-gap-auto-vertical | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 9 | matrix-padding-asym | matrix | pass | 0.000 |  | 33 | 0 |  |  |  |
| 10 | matrix-align-start-start | matrix | pass | 0.000 |  | 38 | 0 |  |  |  |
| 11 | matrix-align-start-center | matrix | pass | 0.000 |  | 38 | 0 |  |  |  |
| 12 | matrix-align-start-end | matrix | pass | 0.000 |  | 38 | 0 |  |  |  |
| 13 | matrix-align-start-stretch | matrix | pass | 0.000 |  | 38 | 0 |  |  |  |
| 14 | matrix-align-center-start | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 15 | matrix-align-center-center | matrix | pass | 0.000 |  | 39 | 0 | 0.000 | 0.00 |  |
| 16 | matrix-align-center-end | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 17 | matrix-align-center-stretch | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 18 | matrix-align-end-start | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 19 | matrix-align-end-center | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 20 | matrix-align-end-end | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 21 | matrix-align-end-stretch | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 22 | matrix-align-spaceBetween-start | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 23 | matrix-align-spaceBetween-center | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 24 | matrix-align-spaceBetween-end | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 25 | matrix-align-spaceBetween-stretch | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 26 | matrix-align-col-start-center | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 27 | matrix-align-col-center-center | matrix | pass | 0.000 |  | 40 | 0 |  |  |  |
| 28 | matrix-align-col-end-center | matrix | pass | 0.000 |  | 40 | 0 |  |  |  |
| 29 | matrix-align-col-spaceBetween-center | matrix | pass | 0.000 |  | 40 | 0 |  |  |  |
| 30 | matrix-clip | matrix | pass | 0.000 |  | 33 | 0 | 0.000 | 0.00 |  |
| 31 | matrix-reverse-z | matrix | pass | 0.000 |  | 40 | 0 | 0.000 | 0.00 |  |
| 32 | matrix-child-fixed-vw | matrix | pass | 0.000 |  | 33 | 0 |  |  |  |
| 33 | matrix-child-hug | matrix | pass | 0.000 |  | 62 | 0 |  |  |  |
| 34 | matrix-child-fill-two | matrix | pass | 0.000 |  | 38 | 0 | 0.000 | 0.00 |  |
| 35 | matrix-child-fill-grow | matrix | pass | 0.005 | Rect (base) | 38 | 0 |  |  |  |
| 36 | matrix-child-fill-cross | matrix | pass | 0.000 |  | 33 | 0 |  |  |  |
| 37 | matrix-child-fill-column | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 38 | matrix-child-minmax | matrix | pass | 0.000 |  | 39 | 0 |  |  |  |
| 39 | matrix-child-min-height | matrix | pass | 0.000 |  | 30 | 0 |  |  |  |
| 40 | matrix-child-order | matrix | pass | 0.000 |  | 40 | 0 |  |  |  |
| 41 | matrix-child-align-self | matrix | pass | 0.000 |  | 40 | 0 |  |  |  |
| 42 | matrix-hidden-child | matrix | pass | 0.000 |  | 34 | 0 |  |  |  |
| 43 | matrix-hug-root | matrix | pass | 0.000 |  | 33 | 0 |  |  |  |
| 44 | matrix-hug-wrap-limited | matrix | pass | 0.000 |  | 65 | 0 |  |  |  |
| 45 | nested-three-levels | nested | pass | 0.010 | Rect (base) | 85 | 0 | 0.010 | 0.06 |  |
| 46 | nested-wrap-space-between | nested | pass | 0.000 |  | 94 | 0 |  |  |  |
| 47 | nested-baseline-text | nested | pass | 0.013 | Text (base) | 50 | 0 |  |  |  |
| 48 | nested-baseline-mixed | nested | pass | 0.000 | Text (base) | 46 | 0 |  |  |  |
| 49 | nested-baseline-container | nested | pass | 0.004 | Text (base) | 56 | 0 |  |  |  |
| 50 | nested-column-stretch-text | nested | pass | 0.000 |  | 49 | 0 |  |  |  |
| 51 | nested-card-grid-like | nested | pass | 0.010 | Frame (base) | 188 | 0 |  |  |  |
| 52 | grid-px-fr | grid | pass | 0.010 | Rect (base) | 53 | 0 | 0.013 | 0.08 |  |
| 53 | grid-auto-tracks | grid | pass | 0.000 |  | 47 | 0 |  |  |  |
| 54 | grid-minmax | grid | pass | 0.000 |  | 59 | 0 |  |  |  |
| 55 | grid-spans | grid | pass | 0.010 | Rect (phone) | 48 | 0 | 0.023 | 0.12 |  |
| 56 | grid-self-alignment | grid | pass | 0.016 | Rect (base) | 42 | 0 |  |  |  |
| 57 | grid-gaps-different | grid | pass | 0.000 |  | 74 | 0 |  |  |  |
| 58 | grid-with-text | grid | pass | 0.000 | Text (base) | 52 | 0 |  |  |  |
| 59 | grid-nested-stack | grid | pass | 0.014 | Text (base) | 119 | 0 |  |  |  |
| 60 | absolute-constraint-left-top | absolute | pass | 0.000 |  | 34 | 0 |  |  |  |
| 61 | absolute-constraint-right-bottom | absolute | pass | 0.000 |  | 34 | 0 |  |  |  |
| 62 | absolute-constraint-leftRight-topBottom | absolute | pass | 0.000 |  | 34 | 0 |  |  |  |
| 63 | absolute-constraint-center-center | absolute | pass | 0.000 |  | 34 | 0 |  |  |  |
| 64 | absolute-constraint-scale-scale | absolute | pass | 0.063 | Rect (base) | 34 | 0 |  |  |  |
| 65 | absolute-constraint-matrix | absolute | pass | 0.063 | Rect (base) | 55 | 0 |  |  |  |
| 66 | absolute-constraint-vertical | absolute | pass | 0.010 | Rect (tablet) | 57 | 0 |  |  |  |
| 67 | absolute-in-stack | absolute | pass | 0.000 |  | 41 | 0 | 0.000 | 0.00 |  |
| 68 | absolute-in-stack-hug | absolute | pass | 0.000 |  | 37 | 0 |  |  |  |
| 69 | absolute-fill-child | absolute | pass | 0.000 |  | 34 | 0 |  |  |  |
| 70 | absolute-hug-child | absolute | pass | 0.008 | Frame (base) | 44 | 0 |  |  |  |
| 71 | absolute-nested-frames | absolute | pass | 0.031 | Rect (base) | 41 | 0 |  |  |  |
| 72 | absolute-geometry-override | absolute | pass | 0.000 |  | 29 | 0 |  |  |  |
| 73 | text-auto-width | text | pass | 0.014 | Text (base) | 78 | 0 |  |  |  |
| 74 | text-auto-width-bold | text | pass | 0.011 | Text (base) | 60 | 0 |  |  |  |
| 75 | text-auto-width-dejavu | text | pass | 0.016 | Text (base) | 60 | 0 |  |  |  |
| 76 | text-auto-height | text | pass | 0.000 |  | 44 | 0 |  |  |  |
| 77 | text-auto-height-anywhere | text | pass | 0.000 |  | 34 | 0 |  |  |  |
| 78 | text-fixed | text | pass | 0.000 |  | 63 | 0 |  |  |  |
| 79 | text-truncate | text | pass | 0.000 |  | 37 | 0 |  |  |  |
| 80 | text-line-height | text | pass | 0.008 | Text (base) | 51 | 0 |  |  |  |
| 81 | text-letter-spacing | text | pass | 0.010 | Text (base) | 54 | 0 |  |  |  |
| 82 | text-paragraphs | text | pass | 0.008 | Text (base) | 46 | 0 |  |  |  |
| 83 | text-align-case | text | pass | 0.008 | Text (base) | 67 | 0 |  |  |  |
| 84 | text-runs | text | pass | 0.036 | Text (base) | 35 | 0 |  |  |  |
| 85 | text-fill-in-row | text | pass | 0.000 |  | 43 | 0 |  |  |  |
| 86 | text-hug-in-row-overflow | text | pass | 0.001 | Frame (base) | 56 | 0 |  |  |  |
| 87 | text-semantic-tags | text | pass | 0.010 | Text (base) | 60 | 0 |  |  |  |
| 88 | text-cjk | text | pass | 0.000 |  | 34 | 0 |  |  |  |
| 89 | rotation-15 | rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  |  |
| 90 | rotation-45 | rotation | pass | 0.000 | Rect (base) | 37 | 0 | 0.001 | 0.00 |  |
| 91 | rotation-90 | rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  |  |
| 92 | rotation-137 | rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  |  |
| 93 | rotation-neg30 | rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  |  |
| 94 | rotation-180 | rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  | validate |
| 95 | rotation-nested | rotation | pass | 0.000 | Frame (base) | 44 | 0 |  |  |  |
| 96 | rotation-flip | rotation | pass | 0.000 | Rect (base) | 44 | 0 |  |  |  |
| 97 | radius-uniform | radius | pass | 0.000 |  | 40 | 0 | 0.000 | 0.00 |  |
| 98 | radius-clamp-large | radius | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 99 | radius-mixed | radius | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 100 | radius-ellipse | radius | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 101 | squircle-basic | squircle | pass | 0.000 |  | 44 | 0 | 0.010 | 0.09 |  |
| 102 | squircle-large-radius | squircle | pass | 0.000 |  | 37 | 0 | 0.017 | 0.15 |  |
| 103 | squircle-shadow | squircle | pass | 0.000 |  | 45 | 0 |  |  |  |
| 104 | squircle-stroke | squircle | pass | 0.000 |  | 41 | 0 |  |  |  |
| 105 | squircle-responsive | squircle | pass | 0.000 |  | 33 | 0 |  |  |  |
| 106 | stroke-inside | stroke | pass | 0.000 |  | 36 | 0 | 0.000 | 0.00 |  |
| 107 | stroke-center | stroke | pass | 0.000 |  | 36 | 0 | 0.001 | 0.01 |  |
| 108 | stroke-outside | stroke | pass | 0.000 |  | 36 | 0 | 0.003 | 0.02 |  |
| 109 | stroke-dashed-inside | stroke | pass | 0.000 |  | 34 | 0 |  |  | dash-approx |
| 110 | stroke-dashed-outside | stroke | pass | 0.000 |  | 37 | 0 |  |  | dash-approx |
| 111 | stroke-per-side | stroke | pass | 0.000 |  | 31 | 0 |  |  |  |
| 112 | stroke-per-side-stack | stroke | pass | 0.000 |  | 35 | 0 |  |  |  |
| 113 | stroke-gradient | stroke | pass | 0.000 |  | 30 | 0 |  |  |  |
| 114 | stroke-multiple | stroke | pass | 0.000 |  | 30 | 0 | 0.001 | 0.01 |  |
| 115 | stroke-line | stroke | pass | 0.000 |  | 41 | 0 |  |  |  |
| 116 | shadow-drop | shadow | pass | 0.000 |  | 44 | 0 | 0.002 | 0.01 |  |
| 117 | shadow-inner | shadow | pass | 0.000 |  | 36 | 0 | 0.000 | 0.00 |  |
| 118 | shadow-multiple | shadow | pass | 0.000 |  | 30 | 0 | 0.000 | 0.00 |  |
| 119 | shadow-on-group | shadow | pass | 0.000 |  | 43 | 0 | 0.000 | 0.00 |  |
| 120 | blur-disc-4 | blur | pass | 0.000 |  | 29 | 0 | 0.012 | 0.00 |  |
| 121 | blur-disc-8 | blur | pass | 0.000 |  | 29 | 0 | 0.017 | 0.00 |  |
| 122 | blur-disc-16 | blur | pass | 0.000 |  | 29 | 0 | 0.026 | 0.00 |  |
| 123 | blur-disc-24 | blur | pass | 0.000 |  | 29 | 0 | 0.030 | 0.00 |  |
| 124 | blur-disc-40 | blur | pass | 0.000 |  | 29 | 0 | 0.034 | 0.00 |  |
| 125 | blur-background | blur | pass | 0.000 |  | 30 | 0 |  |  |  |
| 126 | blur-layer-rect | blur | pass | 0.000 |  | 41 | 0 | 0.023 | 0.00 |  |
| 127 | gradient-linear-90 | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 128 | gradient-linear-0 | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 129 | gradient-linear-diag | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 130 | gradient-linear-diag-rev | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 131 | gradient-linear-off-box-1 | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 132 | gradient-linear-off-box-2 | gradient | pass | 0.000 |  | 33 | 0 | 0.009 | 0.00 |  |
| 133 | gradient-linear-inside-short | gradient | pass | 0.000 |  | 33 | 0 | 0.007 | 0.00 |  |
| 134 | gradient-linear-off-box-3 | gradient | pass | 0.000 |  | 33 | 0 | 0.008 | 0.00 |  |
| 135 | gradient-radial | gradient | pass | 0.000 |  | 33 | 0 | 0.006 | 0.00 |  |
| 136 | gradient-conic | gradient | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 137 | gradient-multi-fill | gradient | pass | 0.000 |  | 34 | 0 | 0.011 | 0.00 |  |
| 138 | gradient-stops-outside | gradient | pass | 0.000 |  | 28 | 0 | 0.000 | 0.00 |  |
| 139 | gradient-text | gradient | pass | 0.001 | Text (base) | 36 | 0 |  |  |  |
| 140 | blend-multiply | blend | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 141 | blend-screen | blend | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 142 | blend-overlay | blend | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 143 | blend-darken | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 144 | blend-lighten | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 145 | blend-colorDodge | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 146 | blend-colorBurn | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 147 | blend-hardLight | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 148 | blend-softLight | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 149 | blend-difference | blend | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 150 | blend-exclusion | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 151 | blend-hue | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 152 | blend-saturation | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 153 | blend-color | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 154 | blend-luminosity | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 155 | blend-linearDodge | blend | pass | 0.000 |  | 35 | 0 |  |  |  |
| 156 | blend-linearBurn | blend | pass | 0.000 |  | 35 | 0 |  |  | blend-fallback |
| 157 | blend-group-isolate | blend | pass | 0.000 |  | 49 | 0 | 0.000 | 0.00 |  |
| 158 | blend-opacity | blend | pass | 0.000 |  | 35 | 0 | 0.019 | 0.00 |  |
| 159 | state-hover-fill | state | pass | 0.009 | Frame (base) | 47 | 0 |  |  |  |
| 160 | state-spring-transition | state | pass | 0.000 |  | 33 | 0 |  |  |  |
| 161 | state-custom-and-checked | state | pass | 0.000 |  | 31 | 0 |  |  |  |
| 162 | state-breakpoint-override | state | pass | 0.000 |  | 30 | 0 |  |  |  |
| 163 | token-colors-dimensions | token | pass | 0.008 | Text (base) | 59 | 0 |  |  |  |
| 164 | token-dark-mode | token | pass | 0.000 |  | 44 | 0 |  |  |  |
| 165 | responsive-direction | responsive | pass | 0.000 |  | 40 | 0 |  |  |  |
| 166 | responsive-visibility | responsive | pass | 0.000 |  | 44 | 0 |  |  |  |
| 167 | responsive-padding-cascade | responsive | pass | 0.000 |  | 32 | 0 |  |  |  |
| 168 | responsive-size-override | responsive | pass | 0.000 |  | 32 | 0 |  |  |  |
| 169 | responsive-text-size | responsive | pass | 0.009 | Text (tablet) | 36 | 0 |  |  |  |
| 170 | responsive-custom-breakpoints | responsive | pass | 0.000 |  | 41 | 0 |  |  |  |
| 171 | image-node-fits | image | pass | 0.000 |  | 38 | 0 |  |  |  |
| 172 | image-fill-paint | image | pass | 0.000 |  | 47 | 0 |  |  |  |
| 173 | shape-vector | image | pass | 0.000 |  | 32 | 0 |  |  |  |
| 174 | semantic-landing | image | pass | 0.024 | Frame (tablet) | 155 | 0 |  |  |  |
| 175 | gradient-angle-0 | gradient | pass | 0.000 |  | 34 | 0 | 0.006 | 0.00 |  |
| 176 | gradient-angle-45 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 177 | gradient-angle-90 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 178 | gradient-angle-135 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 179 | gradient-angle-180 | gradient | pass | 0.000 |  | 34 | 0 | 0.006 | 0.00 |  |
| 180 | gradient-angle-225 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 181 | gradient-angle-270 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 182 | gradient-angle-315 | gradient | pass | 0.000 |  | 34 | 0 | 0.007 | 0.00 |  |
| 183 | blend-px-darken | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 184 | blend-px-lighten | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 185 | blend-px-colorDodge | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 186 | blend-px-colorBurn | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 187 | blend-px-hardLight | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 188 | blend-px-softLight | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 189 | blend-px-exclusion | blend | pass | 0.000 |  | 29 | 0 | 0.000 | 0.00 |  |
| 190 | rotation-shadow | rotation | pass | 0.000 | Rect (base) | 41 | 0 | 0.047 | 0.05 |  |
| 191 | rotation-stroke-radius | rotation | pass | 0.000 | Rect (base) | 31 | 0 | 0.017 | 0.11 |  |
| 192 | shadow-spread-negative | shadow | pass | 0.000 |  | 37 | 0 | 0.001 | 0.00 |  |
| 193 | stroke-center-radius-px | stroke | pass | 0.000 |  | 36 | 0 | 0.003 | 0.02 |  |
| 194 | radius-clamp-mixed-px | radius | pass | 0.000 |  | 35 | 0 | 0.000 | 0.00 |  |
| 195 | nested-pixel-card | nested | pass | 0.000 |  | 63 | 0 | 0.000 | 0.00 |  |
| 196 | matrix-wrap-column-stretch | matrix | pass | 0.010 | Rect (base) | 61 | 0 |  |  |  |
| 197 | matrix-wrap-hug-stretch | matrix | pass | 0.000 |  | 66 | 0 |  |  |  |
| 198 | text-cjk-mixed | text | pass | 0.013 | Text (base) | 53 | 0 |  |  |  |
| 199 | text-letter-spacing-percent | text | pass | 0.017 | Text (base) | 55 | 0 |  |  |  |
| 200 | grid-minmax-auto-fr | grid | pass | 0.008 | Text (tablet) | 58 | 0 |  |  |  |
| 201 | grid-responsive-columns | grid | pass | 0.000 |  | 55 | 0 |  |  |  |
| 202 | absolute-center-scale-3bp | absolute | pass | 0.000 |  | 43 | 0 |  |  |  |
| 203 | nested-hug-in-hug-text | nested | pass | 0.012 | Frame (tablet) | 67 | 0 |  |  |  |
| 204 | nest-20-alternating-fill | adv-nest | pass | 0.014 | Text (base) | 322 | 0 |  |  |  |
| 205 | nest-20-hug | adv-nest | pass | 0.014 | Frame (base) | 323 | 0 |  |  |  |
| 206 | nest-20-autoheight-text | adv-nest | pass | 0.000 |  | 213 | 0 |  |  |  |
| 207 | wrap-spacebetween-baseline | adv-wrap | pass | 0.017 | Text (tablet) | 109 | 0 |  |  |  |
| 208 | wrap-gap-baseline-autoheight | adv-wrap | pass | 0.000 |  | 106 | 0 |  |  |  |
| 209 | wrap-spacebetween-stretch-fill | adv-wrap | pass | 0.009 | Rect (phone) | 61 | 0 |  |  |  |
| 210 | nested-baseline-rect-first | adv-wrap | pass | 0.023 | Rect (base) | 60 | 0 |  |  |  |
| 211 | nested-baseline-column-first-rect | adv-wrap | pass | 0.005 | Frame (base) | 56 | 0 |  |  |  |
| 212 | hug-fill-main-axis | adv-hugfill | pass | 0.000 |  |  |  |  |  | refused: hug container with a fill child on the main axis (a0900004-0 |
| 213 | hug-fill-via-override | adv-hugfill | pass | 0.000 |  |  |  |  |  | refused: hug container with a fill child on the main axis (a0a00004-0 |
| 214 | hug-cross-fill-child | adv-hugfill | pass | 0.000 |  | 58 | 0 |  |  |  |
| 215 | hug-grid-fill-child | adv-hugfill | pass | 0.000 |  | 49 | 0 |  |  |  |
| 216 | hug-absolute-frame | adv-hugfill | pass | 0.000 |  | 44 | 0 |  |  |  |
| 217 | padding-exceeds-fixed | adv-hugfill | pass | 0.000 |  | 42 | 0 |  |  |  |
| 218 | fill-items-min-exceeds | adv-hugfill | pass | 0.000 |  | 39 | 0 |  |  |  |
| 219 | zero-sizes | adv-edge | pass | 0.000 |  | 71 | 0 |  |  |  |
| 220 | negative-gap | adv-edge | pass | 0.000 |  | 87 | 0 |  |  |  |
| 221 | negative-rowgap-wrap | adv-edge | pass | 0.000 |  | 70 | 0 |  |  | validate, negative-gap |
| 222 | huge-1e6 | adv-edge | pass | 0.016 | Rect (base) | 70 | 0 |  |  |  |
| 223 | huge-4e7 | adv-edge | limit | 3.984 | Rect (base) | 33 | 0 |  |  | validate |
| 224 | subpixel-accumulation | adv-edge | pass | 0.000 |  | 1032 | 0 |  |  |  |
| 225 | rotate-45-in-stack | adv-rotation | pass | 0.005 | Rect (base) | 77 | 0 |  |  |  |
| 226 | rotate-fill-child-tablet | adv-rotation | pass | 0.000 | Rect (base) | 37 | 0 |  |  |  |
| 227 | abs-leftright-scale-3bp | adv-absolute | pass | 0.063 | Rect (base) | 43 | 0 |  |  |  |
| 228 | abs-scale-geometry-override | adv-absolute | pass | 0.063 | Rect (base) | 39 | 0 |  |  |  |
| 229 | abs-in-stack-leftright-scale | adv-absolute | pass | 0.047 | Rect (base) | 48 | 0 |  |  |  |
| 230 | abs-hug-child-leftright | adv-absolute | pass | 0.000 | Text (base) | 45 | 0 |  |  |  |
| 231 | abs-nested-scale-scale | adv-absolute | pass | 0.016 | Rect (base) | 42 | 0 |  |  |  |
| 232 | grid-span-overflow-explicit | adv-grid | pass | 0.010 | Rect (tablet) | 40 | 0 |  |  |  |
| 233 | grid-span-overflow-auto | adv-grid | pass | 0.005 | Rect (tablet) | 39 | 0 |  |  |  |
| 234 | grid-rowspan-implicit | adv-grid | pass | 0.000 |  | 61 | 0 |  |  |  |
| 235 | grid-text-autowidth-overflow | adv-grid | pass | 0.001 | Text (base) | 43 | 0 |  |  |  |
| 236 | text-autowidth-long-word-narrow | adv-text | pass | 0.004 | Text (base) | 47 | 0 |  |  |  |
| 237 | text-autoheight-long-word | adv-text | pass | 0.000 |  | 44 | 0 |  |  |  |
| 238 | text-fill-long-word-in-row | adv-text | pass | 0.000 |  | 48 | 0 |  |  |  |
| 239 | text-hug-stack-wrap-text | adv-text | pass | 0.000 |  | 56 | 0 |  |  |  |
| 240 | text-spaces-only | adv-text | pass | 0.008 | Text (base) | 70 | 0 |  |  |  |
| 241 | text-tab-nbsp | adv-text | pass | 0.008 | Text (base) | 43 | 0 |  |  |  |
| 242 | order-negative | adv-misc | pass | 0.000 |  | 40 | 0 |  |  |  |
| 243 | percent-width-in-hug | adv-misc | pass | 0.000 |  | 52 | 0 |  |  |  |
| 244 | vw-in-nested | adv-misc | pass | 0.000 |  | 43 | 0 |  |  |  |
| 245 | spacebetween-overflow | adv-misc | pass | 0.000 |  | 99 | 0 |  |  |  |
| 246 | fill-grow-zero | adv-misc | pass | 0.000 |  | 60 | 0 |  |  |  |
| 247 | stretch-with-max | adv-misc | pass | 0.000 |  | 40 | 0 |  |  |  |
| 248 | hidden-first-child-baseline | adv-misc | pass | 0.010 | Text (tablet) | 56 | 0 |  |  |  |
| 249 | abs-right-center-border | adv-absolute | pass | 0.000 |  | 45 | 0 |  |  |  |
| 250 | abs-left-in-dashed-stack | adv-absolute | pass | 0.000 |  | 45 | 0 |  |  | dash-approx |
| 251 | wrap-fill-minw | adv-wrap | pass | 0.000 |  | 50 | 0 |  |  |  |
| 252 | grid-colspan-overflow-explicit-row | adv-grid | pass | 0.000 |  | 43 | 0 |  |  |  |
| 253 | text-truncate-2 | adv-text | pass | 0.000 |  | 56 | 0 |  |  |  |
| 254 | text-letterspacing-negative | adv-text | pass | 0.002 | Text (base) | 45 | 0 |  |  |  |
| 255 | text-lineheight-tiny | adv-text | pass | 0.014 | Text (base) | 47 | 0 |  |  |  |
| 256 | rotate-90-hug-text | adv-rotation | pass | 0.000 |  | 55 | 0 |  |  |  |
| 257 | reverseZ-absolute-mix | adv-misc | pass | 0.000 |  | 42 | 0 |  |  |  |
| 258 | squircle-stroke-outside | squircle-stroke | pass | 0.000 |  | 59 | 0 | 0.007 | 0.06 |  |
| 259 | squircle-stroke-inside-center | squircle-stroke | pass | 0.000 |  | 59 | 0 | 0.004 | 0.03 |  |
| 260 | squircle-stroke-shadow | squircle-stroke | pass | 0.000 |  | 42 | 0 | 0.136 | 0.00 |  |
| 261 | squircle-lone-corner | squircle-stroke | pass | 0.000 |  | 36 | 0 | 0.002 | 0.02 |  |
| 262 | isolation-normal-group | isolation | pass | 0.000 |  | 49 | 0 | 0.000 | 0.00 |  |
| 263 | gradient-diamond | gradient-transform | pass | 0.000 |  | 39 | 0 | 0.000 | 0.00 | rasterised |
| 264 | gradient-radial-rotated | gradient-transform | pass | 0.000 |  | 36 | 0 | 0.000 | 0.00 | rasterised |
| 265 | gradient-linear-transform | gradient-transform | pass | 0.000 |  | 33 | 0 | 0.001 | 0.00 |  |
| 266 | line-caps | line | pass | 0.000 |  | 46 | 0 | 0.000 | 0.00 |  |
| 267 | zorder-reverse-absolute | zorder | pass | 0.000 |  | 53 | 0 | 0.000 | 0.00 |  |
| 268 | negative-gap-overlap | gap | pass | 0.000 |  | 72 | 0 | 0.000 | 0.00 |  |
| 269 | aspect-fill-row | aspect | pass | 0.005 | Frame (base) | 40 | 0 | 0.037 | 0.19 |  |
| 270 | aspect-fill-column | aspect | pass | 0.010 | Frame (phone) | 52 | 0 |  |  |  |
| 271 | grid-placement-order | grid-placement | pass | 0.010 | Rect (phone) | 52 | 0 |  |  |  |
| 272 | shadow-behind-transparent | shadow | pass | 0.000 |  | 37 | 0 | 0.102 | 0.01 |  |

## Performance (Annexe A / §2.3) — 51050 nodes, Node v22.23.4, table measurer

| measure | ms | budget | |
| --- | --- | --- | --- |
| open: parse 583.3 + validate 283.9 + first base layout 1462.2 | 2329.4 | ≤ 1500 (+ first frame) | **over** |
| full export (3 breakpoints, 8917 KB CSS, 11149 KB HTML) | 3693 | ≤ 2000 | **over** |
| cold layout of the 3 breakpoints | 2036.9 | — | within |
| patch + incremental layout, leafHeight (median / max of 25) | 2.04 / 5.54 | < 4 (§2.3), ≤ 12 with redraw | within |
| patch + incremental layout, textEdit (median / max of 25) | 0.59 / 3.27 | < 4 (§2.3), ≤ 12 with redraw | within |
| patch + incremental layout, cardWidth (median / max of 25) | 0.61 / 0.86 | < 4 (§2.3), ≤ 12 with redraw | within |
| patch + incremental layout, opacityOnly (median / max of 25) | 0.01 / 0.07 | < 4 (§2.3), ≤ 12 with redraw | within |
| then the 2 other breakpoints (median) | 4.09 / 0.73 / 0.77 / 0 | — | within |

Limit — huge-4e7: beyond Blink LayoutUnit range (±33 554 431 px): validateDocument warns; the engine saturates like Blink to within 4 px (float32 DOMRect rounding) (max Δ 3.984 px)
