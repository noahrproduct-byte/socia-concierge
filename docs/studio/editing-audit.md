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
| 3 Pacing | real | `pacing.ts`: start on the action, no shot drags, room for the ending, readable text, beat. **Phase 3:** `speech.ts` classifies every pause from the word timings (set-up pauses kept, sentence breaks trimmed, hesitation and dead air cut) and takes out earlier takes, false starts and lone fillers | Pauses are judged from the transcript only, not from tone of voice |
| 4 Transitions | partial | Cut, dissolve, zoom blur, whip blur render in preview and export. Before phase 1 every join of a SOCIA cut was forced to a dissolve. **Phase 1:** each join decided from what is on either side, with the reason | **Phase 3:** L-cuts (a voice finishes its sentence over the next quiet shot). No J-cut, match cut, cut-on-action detection, speed ramp or mask transitions |
| 5 Motion and keyframes | partial | Reframe (zoom and focus point), a moving reframe path from the clipper, jump-cut punch-in (manual switch) | No eased push-in on emphasis, no subject tracking in the editor |
| 6 Colour | real | Measured correction toward a shared target so clips match (`grade.ts`), gentle limits, before and after | No creative grade per niche; no "can't be fixed" warning for blown or out-of-focus footage |
| 7 Audio | partial | Noise reduction, action-sound lift, level balance between clips, edge fades, crossfades under transitions | No loudness (LUFS) or true-peak check of the finished file; no de-essing |
| 8 Music | real | Original tracks made for the account (licence-safe), measured beat, cuts on the beat, ducking under speech (off by default) | Track structure (drops, sections) not used |
| 9 Captions and text | real | Word captions from the transcript, tidied; locked presets in the safe zone; end card. **Phase 5:** one highlighted word a line at most (`emphasis.ts`): the model's marks that were really said, then numbers, then names; about one for every six words; a switch in Text & captions | Highlight colour is fixed yellow, not the brand's |
| 10 Niche-aware editing | real | **Phase 4:** five editing styles (`profiles.ts`): food and process, talking to camera, product demo or how-to, fast and energetic, calm and premium. Picked from the prompt, then how much of the footage is talk, then the niche; each sets pacing numbers, joins, how much of each pause is kept, and the model's instructions. Regenerate can make the cut again in another style | Styles are rules, not yet learned from each account's results |
| 11 Editorial plan (EDL) | real | Source in and out, transitions, sound, colour, text, notes; validated in code; undo and redo | No confidence per decision |
| 12 Rendering | real | Same composition for preview and export, in the browser | None found in this audit |
| 13 Quality assurance | partial | Before phase 1: the pacing report only. **Phase 1:** `cutCheck.ts` checks every cut for stutters, repeats, sentences cut off, transitions over speech, too-short shots, black frames and overlapping text; safe fixes are applied to SOCIA's own cuts, the rest shown in the editor. **Phase 2:** `renderCheck.ts` + `inspectRender.ts` watch the finished file (length, size, black and frozen frames at every join, missing or dropped sound, clipping, level); a render fault gets one more try, then asks before saving | Loudness is an average level in dB, not a true LUFS measure |
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

1. ~~Check the rendered file~~ (done in phase 2, branch `render-check`).
2. ~~Speech editing~~ (done in phase 3, branch `speech-edit`).
3. ~~Niche profiles~~ (done in phase 4, branch `edit-styles`).
4. ~~Caption emphasis in the editor~~ (done in phase 5, branch `caption-emphasis`).
