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
