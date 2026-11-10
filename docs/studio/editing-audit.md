# Studio video editor: audit against the professional editing playbook

Noah sent "SOCIA Video Editor: the professional editing playbook" on 2026-11-10. It asks for an audit
before any code: what is real, partial, simulated or broken. This file is that audit, read from the
code on `main` at 59fd377, plus what phase 1 (branch `editing-engine`) changed.

Status words: **real** works end to end and is tested; **partial** works but covers part of the
module; **missing** does not exist. Nothing in the editor is simulated: every control changes the
EDL, and the preview and the export render the same EDL (`components/studio/remotion/ClipComposition.tsx`).

## How a cut is made today

1. **Ingest (browser, `lib/studioClips/ingest.ts`, `facts.ts`)**: measured brightness, contrast,
   warmth, clipped highlights and crushed shadows per sampled frame, scene changes, sound level,
   silences; a transcript with word times; up to 24 keyframes, one every 1.5 s.
2. **Clip cards (model pass 1, `analysis.ts clipCard`)**: what happens, logged as moments with
   times, strength and whether the action's sound matters.
3. **Posts (pass 2) or a brief**: which clips belong together, the opener, the ask.
4. **The cut (pass 3, `opportunityEdl`)**: an edit decision list (EDL) of shots with clip in and
   out points, text, colour hints, music advice, an ending.
5. **Held to rules in code**: `validateEdl` (cuts snapped to word and pause edges, length),
   `applyPacing`, `teachEdit` (Noah's taught rules, `joinContinuous`), then, new in phase 1,
   `decideJoins` and `repairCut`.
6. **Finishing in the browser**: measured colour (`grade.ts`, `autoLook.ts`), noise reduction and
   action sound (`cleanSound.ts`), made music on the beat (`lib/music`, `beats.ts`), captions.
7. **Render**: Remotion web renderer in the browser, saved as a draft post.

## Module by module

| Playbook module | Status | What exists | Gap |
| --- | --- | --- | --- |
| 1 Video understanding | partial | Measured picture and sound facts, word-timed transcript, 24 frames a clip, moment log | No camera-motion, face or object tracking; frames every 1.5 s miss fast moments |
| 2 Narrative | partial | Opener, roles, ask; **phase 1:** every shot now carries its purpose (hook, context, development, payoff, close) and the model is told to drop shots that add nothing | No check that the payoff the hook promises is in the cut; no repeated-sentence detection |
| 3 Pacing | real | `pacing.ts`: start on the action, no shot drags, room for the ending, readable text, beat; pause cutting in `sound.ts` | Pauses are cut by length, not classified (set-up pause vs hesitation) |
| 4 Transitions | partial | Cut, dissolve, zoom blur, whip blur render in preview and export. Before phase 1 every join of a SOCIA cut was forced to a dissolve. **Phase 1:** each join decided from what is on either side, with the reason | No J-cut or L-cut, match cut, cut-on-action detection, speed ramp or mask transitions |
| 5 Motion and keyframes | partial | Reframe (zoom and focus point), a moving reframe path from the clipper, jump-cut punch-in (manual switch) | No eased push-in on emphasis, no subject tracking in the editor |
| 6 Colour | real | Measured correction toward a shared target so clips match (`grade.ts`), gentle limits, before and after | No creative grade per niche; no "can't be fixed" warning for blown or out-of-focus footage |
| 7 Audio | partial | Noise reduction, action-sound lift, level balance between clips, edge fades, crossfades under transitions | No loudness (LUFS) or true-peak check of the finished file; no de-essing |
| 8 Music | real | Original tracks made for the account (licence-safe), measured beat, cuts on the beat, ducking under speech (off by default) | Track structure (drops, sections) not used |
| 9 Captions and text | real | Word captions from the transcript, tidied; locked presets in the safe zone; end card | Caption emphasis exists for the clipper (`lib/clipper/emphasis.ts`) but not in the editor |
| 10 Niche-aware editing | missing | One rule set for everything; the niche only reaches the prompt | Pacing and join profiles per kind of video |
| 11 Editorial plan (EDL) | real | Source in and out, transitions, sound, colour, text, notes; validated in code; undo and redo | No confidence per decision |
| 12 Rendering | real | Same composition for preview and export, in the browser | None found in this audit |
| 13 Quality assurance | partial | Before phase 1: the pacing report only. **Phase 1:** `cutCheck.ts` checks every cut for stutters, repeats, sentences cut off, transitions over speech, too-short shots, black frames and overlapping text; safe fixes are applied to SOCIA's own cuts, the rest shown in the editor | The rendered file itself is not inspected yet |
| 14 Performance learning | real | `learn.ts` compares the account's own Studio posts with its median, with sample sizes; rater outlook stays Low confidence until results exist | None in scope |

## Known problems carried in

- Noah's 2026-11-10 cut stuttered: one take chopped into nine slivers under dissolves. Fixed by
  PR #239 (`joinContinuous`); phase 1 adds a check that would have flagged it in the editor.
- The model passes cannot be run locally (the local key has no credit). New prompt rules need a
  real cut on the live site.
- Salvo's brand settings say Hermitage with no website, so its ending says "Hermitage, Tennessee"
  with no site.

## Phase 1 (this branch)

- `lib/studioClips/joins.ts`: each join chosen and explained. Someone talking at the join gets a
  hard cut (a dissolve plays two voices at once); anything else keeps the 0.3 s dissolve Noah
  approved. A person who names transitions in their brief keeps them.
- `lib/studioClips/cutCheck.ts`: `checkCut` (live in the editor under the pacing score, with
  "Show me" to jump to the shot) and `repairCut` (runs on every cut SOCIA makes, writes what it
  fixed into the cut's notes).
- Shot purpose in the model's plan and in the edit guide; the playbook's speech rules in the prompt.

## Proposed next phases

1. **Check the rendered file**: after export, decode the MP4, look at frames on both sides of every
   join for black, frozen or repeated frames, and measure loudness and true peak; fix or warn
   before the draft is saved.
2. **Speech editing**: classify pauses, find repeated sentences and false starts, L-cuts when a
   voice runs over the next shot.
3. **Niche profiles**: food and process, talking to camera, product demo; each sets pacing
   numbers and joins.
4. **Caption emphasis in the editor**: reuse `lib/clipper/emphasis.ts` for numbers and contrasts.
