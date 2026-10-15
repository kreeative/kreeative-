---
name: creator-study
description: Study what is working for another creator (Instagram handles, or TikTok and YouTube Shorts URLs) and turn their moves into Kee's content plan. Use when Kee shares a creator's profile, screenshots or handle and asks to analyse their videos, copy their strategy, or build content from what works for them.
---

# Creator study

Kee's tool for "analyse this creator and copy what works". It runs on the
**vidIQ** connector (tools named `mcp__vidIQ__vidiq_*`), which already reads
public Instagram Reels and watches short-form videos. Load the tools with
ToolSearch: `select:mcp__vidIQ__vidiq_balance,mcp__vidIQ__vidiq_ig_profile_reels,mcp__vidIQ__vidiq_watch_shortform_content,mcp__vidIQ__vidiq_job_poll`.

## Credits first

vidIQ charges credits per call and Kee's plan is small (150 a month).

1. `vidiq_balance` is free: check it before anything else.
2. Costs: `vidiq_ig_profile_reels` 5 per handle (12 Reels with plays, likes,
   comments, length, caption, cover); `vidiq_watch_shortform_content` 10 per
   Reel (scene by scene, async: poll `vidiq_job_poll`, free);
   `vidiq_ig_profile` 5 (skip it when Kee sent a screenshot of the profile).
3. Default budget: one Reel list per creator, plus one watch per creator on
   their biggest outlier. Leave at least 15 credits unless Kee says otherwise,
   and say in the reply what was spent and what is left.

## Steps

1. Pull the Reel list for each handle in parallel.
2. Rank by plays against that creator's own typical numbers. Note pinned
   Reels, comment counts (a high comment count usually means a keyword or a
   free event), length, and the hook written on the cover.
3. Watch the top outlier per creator with a prompt asking for every on-screen
   line word for word, each shot, timing, sound, and the structure as a
   reusable template.
4. Write `content/<month>/creator-study-<handles>.md`: the data tables, the
   watched breakdowns, what works (the moves, with numbers), what Kee copies
   and where it lands in her plan, what she doesn't copy, and the limits of
   the data.
5. Turn the moves into Kee's content with every rule in `CLAUDE.md` and the
   facts in `docs/PERSONAL-BRAND.md`:
   - copy the move, never the words; their income claims stay theirs;
   - the viewer test on every first line;
   - Instagram and YouTube in English, TikTok bilingual and never a repost;
   - real numbers from the proof bank only, prices from the pricing pages;
   - the course described by outcomes only.
6. Deliver the way the month of 17 October was delivered: the plan file with
   a day-by-day list and a run sheet for each Saturday (Kee films every
   Saturday, about four hours), the deck (Figma when the MCP limit allows,
   the web deck otherwise) with each week opening on its Saturday, the
   ready-made posts rendered to `content/<month>/posts-*/`, and the brief
   updated.

## Rendering note

Headless Chrome's viewport is 87 px shorter than `--window-size`. Render a
1080×1350 post with `--window-size=1080,1437` and crop the PNG to 2160×2700,
or the bottom strip is never drawn.
