# SPEC: SOCIA promo (storyline A, "Monday, 8:12 AM")

GOAL:    A creator or business owner thinks "it already knows what I should do next" and goes to sociaos.com.
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps, silent (no music source in this environment; one `<audio>` slot reserved).
TIME:    87 s x 30 = 2610 frames. No music, so the clock is the reading time: a line holds 0.5 s + 0.3 s a word.

LOOK:    Ground #0a0a0a, flat (no grid, no vignette, no grain). Ink #f2efe9. Secondary ink rgba(242,239,233,.62).
         One accent, gold #c9b27c: one word or one number per frame, the winning cell, the end card rule. Never a glow.
         The product's cobalt #2563ff appears only inside product UI where the app itself uses it (a primary button, a selected day).
         Display: Inter Tight 700/800, titles 88 px (4.6% of height) for the white line, 112 px for the gold line, tracking -0.03em.
         Reading copy: Inter 600 at 38 px, 1.3 line height. Inside product panels nothing under 28 px (the phone floor), sentence case, no tracking, no caps.
         Numbers: Inter Tight 700 tabular.
         The medium is the product on a phone-width panel: app ground #0f0f10, raised rgba(255,255,255,.04), rule rgba(255,255,255,.1), radius 20 px, no shadow.
         Footage (the homepage's own clips, labelled "Example footage") is the only colour; shown inside the Studio panel, never behind text.
         Safe band: every word and the product between y=168 and y=1330; below 1330 only ground.

OBJECTS: The SOCIA mark (the real PNG, never redrawn). Platform marks (the app's own PlatformMark paths, grey chrome, brand hue only on the connect rows).
         A phone-width app panel (900 px wide) with the app's own labels. A calendar week. A chat drawer. A clip tray with the homepage's own footage, labelled as example footage.

MOTION:  Enter: opacity 0→1 with blur 8→0 px in 0.2 s, `power4.out`, no translate on titles; rows rise 14 px in 0.3 s `expo.out`, 60 ms apart.
         Chapter seams: blur swap on one stage (out: opacity→0 + blur 8 px in 0.15 s; in: blur→0 in 0.17 s), the ground never cuts.
         One seam differs: the Studio panel whips in from the right with a 10 px horizontal blur (0.35 s power3.out).
         Built with one seam kind on purpose, like the reference; caused transitions (a button growing into the next screen) are the next upgrade, see REVIEW.md.
         Counters: ease-out `power2.out` over 1.2 s, never from 0 (they start at the previous period's real value).
         Cells and chips land with `back.out(1.4)` at 0.25 s (damping ~0.8). Opacity never bounces.
         Titles land dead still. Exits are 40% shorter than entrances. Nothing loops, breathes or floats.

SHOTS:   see STORYBOARD.md (one line per beat with frame range, hero move, the read, the hand-off).

BANNED:  glow, bloom, neon; a radial spotlight; the grid background; grain; cards floating in a void with nothing behind them;
         every element fading and sliding up; three cards in a row; KPI grids with no "what to do"; a title over a dimmed screenshot;
         the logo docked in a corner; counters from 0; invented numbers or handles; "AI-powered"; em dashes; Title Case labels;
         a typewriter on text SOCIA did not generate in that moment; gradient text; glass cards; a watch-list of real third-party creators.

QA:      t=0.5 (phone with the real Today card, line readable), t=7 (mark lands once, centred), t=13 (four platform rows, TikTok "Not connected"),
         t=19 (KPI tiles with windows and deltas, "Perfection." row), t=26 (formats, Tuesday window with sample size), t=32 (competitor strip, "Observed numbers only"),
         t=39 (seven plan rows), t=46 (footage plays inside the tray, "From dough to box"), t=52 (per-post metrics row, the alert),
         t=59 (Observed / Recommendation sections), t=65 (post card on Tuesday 9:15 AM, destination chips), t=71 (Claude bubble with the tool chip),
         t=76 (claim line), t=82 (end card held 2 s+). Every line ≥ 28 px; phone sheet legible at 360 px.
