# REVIEW: SOCIA promo (storyline A), 2026-10-27

## Creative calls

- Storyline A ("Monday, 8:12 AM"): one owner, one real post ("Perfection.", 102K views, 84.6x the account's median) travels through all nine features. Not built: B (split screen, guessing vs knowing) and C (type cut on the beat); both are in STORYLINES.md.
- The reference reel's grammar is kept where it works (two-beat titles, element-by-element builds, one takeaway line per chapter, blur-swap seams) and dropped where it was the weak part (orange glow on everything, a grid in a void, an invented-looking watch list of third-party creators, every chapter entering the same way with nothing on screen but a diagram).
- Palette is the homepage's: near-black, warm white, gold for one word per frame. The product's cobalt appears only inside product UI where the app uses it. No glow, no grid, no grain.
- Every number is real (SOCIA's MCP tools, Salvo's Pizza workspace, read 2026-10-27). Labels are the app's own. Where no real value exists it is not invented: competitor "Them" cells say "add one"; audience demographics are named, not numbered; the Studio footage is the homepage's own and is labelled "Example footage".

## What was measured, what was looked at

- `npx hyperframes check`: lint, runtime, layout, contrast and craft all pass; the only remaining warning is `film_silent`.
- `npx hyperframes snapshot --review`: 28 beat frames, 13 seam strips and the 360 px phone sheet were read. Four frames were re-snapshotted after fixes (0.6, 19.5, 32.5, 46.5 s).
- Not checked by anyone: sound (there is none), and the rendered file was decoded only as a contact sheet, not watched in real time.

## Fixes made in review

- t=46 s · Studio · takeaway collided with the last row → shorter row copy, smaller clip cells, takeaway at 1236 px.
- t=32 s · Competitors · "27 interactions" wrapped inside its column → label "Median interactions", value "27".
- t=19 s · Analytics · post row crowded → sub cut to "Reel · Aug 18 · 102K views".
- Panel type raised to a 28 px floor everywhere; ask and MCP scenes lengthened so their real sentences get their reading time (ask 9 s, MCP 7 s; film 87 s).
- Clip tags over footage given an opaque ground (contrast 1.38:1 before).

## Weakest shot, and what I would change with more time

- Step 04 (Competitors). Without a competitor in this workspace it shows the page's structure with "add one" cells, which is honest but the least alive frame. With a tracked YouTube competitor in the workspace, the "Them" column would carry real public numbers and "Momentum" a real trajectory.
- Real product screens. Every panel is rebuilt from the app's components and labels, not captured. With a signed-in session, Playwright captures of the live Dashboard, Analytics, Competitors, Content Plan, Studio and Calendar would replace the rebuilt panels one by one.

## Warnings kept on purpose

- `film_silent`: no music source is available in this environment (no HeyGen sign-in, no local MusicGen; the Higgsfield catalog exposes only speech models and a game-pipeline music model). The bed slots in as the commented `<audio id="bed">` in index.html.
- `data-hold` on the Ask SOCIA recommendation: the 20-word real sentence needs its reading time.
