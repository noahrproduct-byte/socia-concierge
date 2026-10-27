# Design loop: SOCIA homepage against raycast.com

Live progress page. Round count and pieces, not token cost.

Bar: docs/design/bar.md (7 mechanisms). System doc: docs/design/anti-slop-standard.md + the token block in components/home/home.css.

| Piece | Round | Builder | Brief critic | System critic | Craft critic | Biggest gap named |
|---|---|---|---|---|---|---|
| 1. Hero: the promise, with the product rising into the first screen | 4 | built | PASS | PASS | FAIL (B better) | The product window crowds the statement (bar mechanism 1); three-line headline; gap under 100px |
| 2. The product window with click-to-expand "why" pop-ups | 4 | built | FAIL | FAIL | FAIL (B better) | "Best window" without the comparison; coach-style example titles; rows off the 8px grid; outlined chips lost the keycap depth |
| 3. Story spine: the loop and what's inside | 4 | built | FAIL | FAIL | FAIL (B better) | Content Studio shown as footage, not as the product; half-width screens with equal weight; four different border greys |
| 4. Brand close: the mark, the closing statement, the footer | 4 | built | FAIL | FAIL | PASS | A tagline, not the promise in the visitor's terms; the mark's PNG carries a black matte |

## Gap history

**Round 1 (12 critics, 12 fails).** Shared root causes:
- Colour used as atmosphere: the hero streak, the loop orb and the close halo all put cobalt on the canvas instead of inside the mark or the product (bar 2 and 7, standard section 2).
- Imagery standing in for the product: the desk and keycap stills (bar 3, standard 17.3).
- Example data not labelled where it appears (standard 7, P0).
- Critics worked from 480 to 560px screenshots; round 2 sends full-resolution frames plus crops.

**Round 2 (12 critics, 3 passes).** The brief critic passed the hero; the craft critics passed the story and the close. The capture for the story's brief critic was wrong (sips centre-cropped the first slice); round 3 crops with Pillow. Shared root causes now: a secondary grey below WCAG AA, the 3D mark used where the product should be, and cards that all look alike.

**Round 3 (12 critics, 3 passes, all craft).** Every craft critic judging against raycast.com passed: the look now holds. The brief and system critics fail on content: generic hero words, contradictory example data, a phone layout bug (a general img rule outranked the thumbnail hide), the phone loop losing its cycle, a duplicate index section, and the 3D render at the close.

**Round 4 (12 critics, 3 passes).** The hero passed brief and system for the first time; the close passed craft again. Two critics now pull in opposite directions on the hero: the standard's homepage rule (show the real product) against the bar's mechanism 1 (the statement alone). The standard is Noah's release gate, so it wins; round 5 keeps the product in the first screen and answers mechanism 1's measurable parts (two-line headline, 120px+ gap). The window's craft critic reversed round 3's verdict on the controls; round 5 uses keycap-styled controls at 28px, which answers both.

**Round 5 plan.** Hero: two lines, weight 560, a wider gap before the window. Window: rows on the 8px grid, keycap controls, the best-window evidence names the next-best window, café-appropriate titles, non-breaking times. Content Studio becomes a product window around the example footage (moments found, the first cut, where it goes next). Screens: the Content Plan full width, no per-row buttons, wider gaps, one border recipe. Phone loop draws its return line. Close: the promise in the visitor's terms, the app icon cut from its matte.

**Round 4 plan (done).** Hero words name SOCIA's method (your own median); the product window moves into the hero; one action label everywhere ("Sign up free"). Distinct example posters; nothing tinted until opened; mono only for labels; chips as small outlined controls. Phone loop gets arrows between steps and a "04 leads back to 01" return. The four-jobs index is removed; the screens below it carry the jobs (Understand, Decide, Publish; Make is Content Studio). The close uses the flat app icon; facts in the mono meta line; footer tokens corrected. The glass render is kept in docs/design/brand for later use.

**Round 3 plan (done).** The first screen becomes the statement alone, headline at 600. The 3D mark moves to the close as the page's signature, replacing the tile. The window: secondary grey lifted to AA, no drop shadow, every chip reads WHY, consistent numbers, an example-account line in the title bar, the example Reel's thumbnail in its rows. The loop becomes a 2x2 cycle with arrows going round. The jobs become ruled columns with one core screen leading each. The close states what, why and when, with the facts in readable text.

**Round 2 plan (done).** Hero becomes headline, one line, one button and a meta strip on bare canvas, with the SOCIA mark rendered as the artwork below the text. The window gets app chrome (title bar, sidebar, an Example badge on the window itself), uppercase mono key labels, and every pop-up states its baseline and window. The desk, keycap and loop stills come out. The question becomes a text-only statement. The loop draws a visible return from 04 to 01. The 16 tiles become four jobs with the features listed under each. The close loses its halo and says the promise.
