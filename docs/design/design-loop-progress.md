# Design loop: SOCIA homepage against raycast.com

Live progress page. Round count and pieces, not token cost.

Bar: docs/design/bar.md (7 mechanisms). System doc: docs/design/anti-slop-standard.md + the token block in components/home/home.css.

| Piece | Round | Builder | Brief critic | System critic | Craft critic | Biggest gap named |
|---|---|---|---|---|---|---|
| 1. Hero + load sequence + atmosphere still | 1 | built | FAIL | FAIL | FAIL (B better) | The cobalt streak sits behind the lead text, washes it out, and is not SOCIA's own artwork; the frame is not mostly empty |
| 2. The product window with click-to-expand "why" pop-ups | 1 | built | FAIL | FAIL | FAIL (B better) | Reads as a card, not the app; rows not marked as example data; a pop-up states 1.6x without its baseline and window |
| 3. Story spine: the question, the loop, what's inside, the screens | 1 | built | FAIL | FAIL | FAIL (B better) | Stock photos (desk, keycaps) stand in for the product; the loop does not visibly return to its start; 16 equal tiles |
| 4. Brand close: the mark, the closing statement, the footer | 1 | built | FAIL | FAIL | FAIL | A cobalt glow around the mark; the closing line is a slogan, not the promise; persona voice in the footer |

## Gap history

**Round 1 (12 critics, 12 fails).** Shared root causes:
- Colour used as atmosphere: the hero streak, the loop orb and the close halo all put cobalt on the canvas instead of inside the mark or the product (bar 2 and 7, standard section 2).
- Imagery standing in for the product: the desk and keycap stills (bar 3, standard 17.3).
- Example data not labelled where it appears (standard 7, P0).
- Critics worked from 480 to 560px screenshots; round 2 sends full-resolution frames plus crops.

**Round 2 plan.** Hero becomes headline, one line, one button and a meta strip on bare canvas, with the SOCIA mark rendered as the artwork below the text. The window gets app chrome (title bar, sidebar, an Example badge on the window itself), uppercase mono key labels, and every pop-up states its baseline and window. The desk, keycap and loop stills come out. The question becomes a text-only statement. The loop draws a visible return from 04 to 01. The 16 tiles become four jobs with the features listed under each. The close loses its halo and says the promise.
