# Design loop: SOCIA homepage against raycast.com

Live progress page. Round count and pieces, not token cost.

Bar: docs/design/bar.md (7 mechanisms). System doc: docs/design/anti-slop-standard.md + the token block in components/home/home.css.

| Piece | Round | Builder | Brief critic | System critic | Craft critic | Biggest gap named |
|---|---|---|---|---|---|---|
| 1. Hero: the promise, with the product rising into the first screen | 3 | built | FAIL | FAIL | PASS (A better) | Generic words ("could be Buffer's"); no product above the fold |
| 2. The product window with click-to-expand "why" pop-ups | 3 | built | FAIL | FAIL | PASS (A better) | The same thumbnail on two different posts; row 1 looks opened when it isn't; phone chips drop below their rows |
| 3. Story spine: the loop and what's inside | 3 | built | FAIL | FAIL | PASS (A better) | The phone loop loses its arrows; the four-jobs index gives equal weight and duplicates the screens section |
| 4. Brand close: the mark, the closing statement, the footer | 3 | built | FAIL | FAIL | FAIL | The glass render reads as a different logo, its reflection cut off; the facts line off-system; footer tokens swapped |

## Gap history

**Round 1 (12 critics, 12 fails).** Shared root causes:
- Colour used as atmosphere: the hero streak, the loop orb and the close halo all put cobalt on the canvas instead of inside the mark or the product (bar 2 and 7, standard section 2).
- Imagery standing in for the product: the desk and keycap stills (bar 3, standard 17.3).
- Example data not labelled where it appears (standard 7, P0).
- Critics worked from 480 to 560px screenshots; round 2 sends full-resolution frames plus crops.

**Round 2 (12 critics, 3 passes).** The brief critic passed the hero; the craft critics passed the story and the close. The capture for the story's brief critic was wrong (sips centre-cropped the first slice); round 3 crops with Pillow. Shared root causes now: a secondary grey below WCAG AA, the 3D mark used where the product should be, and cards that all look alike.

**Round 3 (12 critics, 3 passes, all craft).** Every craft critic judging against raycast.com passed: the look now holds. The brief and system critics fail on content: generic hero words, contradictory example data, a phone layout bug (a general img rule outranked the thumbnail hide), the phone loop losing its cycle, a duplicate index section, and the 3D render at the close.

**Round 4 plan.** Hero words name SOCIA's method (your own median); the product window moves into the hero; one action label everywhere ("Sign up free"). Distinct example posters; nothing tinted until opened; mono only for labels; chips as small outlined controls. Phone loop gets arrows between steps and a "04 leads back to 01" return. The four-jobs index is removed; the screens below it carry the jobs (Understand, Decide, Publish; Make is Content Studio). The close uses the flat app icon; facts in the mono meta line; footer tokens corrected. The glass render is kept in docs/design/brand for later use.

**Round 3 plan (done).** The first screen becomes the statement alone, headline at 600. The 3D mark moves to the close as the page's signature, replacing the tile. The window: secondary grey lifted to AA, no drop shadow, every chip reads WHY, consistent numbers, an example-account line in the title bar, the example Reel's thumbnail in its rows. The loop becomes a 2x2 cycle with arrows going round. The jobs become ruled columns with one core screen leading each. The close states what, why and when, with the facts in readable text.

**Round 2 plan (done).** Hero becomes headline, one line, one button and a meta strip on bare canvas, with the SOCIA mark rendered as the artwork below the text. The window gets app chrome (title bar, sidebar, an Example badge on the window itself), uppercase mono key labels, and every pop-up states its baseline and window. The desk, keycap and loop stills come out. The question becomes a text-only statement. The loop draws a visible return from 04 to 01. The 16 tiles become four jobs with the features listed under each. The close loses its halo and says the promise.
