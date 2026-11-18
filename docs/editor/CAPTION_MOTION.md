# Caption motion presets and their joins

Ten caption treatments built from the owner's two reference boards (Nov
2026), each with an entrance, an emphasis on one word and an exit, and three
clip joins that match some of them. Read `ARCHITECTURE.md` first; this sits
on the caption and transition parts of it.

## What the boards show, and what SOCIA chose

Each preset records the board's observation (`observed` in
`lib/studioClips/captionMotion.ts`): what moves first, what is emphasised
and what motivates the exit. Every timing is SOCIA's own choice, not a
measurement of the reference videos: entrances and exits are about a quarter
second, the emphasis a quarter to a third, and a page always keeps a still
hold of at least ten frames (`fitPhases` shortens the entrance and exit
together on a short caption, never below two frames each).

| Preset | Reference | In | Emphasis | Out | Matching join |
| --- | --- | --- | --- | --- | --- |
| Editorial Highlight | Vox | yellow marker wipes in behind the fixed line | underline sweeps under the key word | the paper strip tears away up and left | Paper tear |
| Cinematic Serif | Iman Gadzhi | thin serif fades in | key word becomes a giant italic and pushes forward | the line blurs out | Fade |
| Documentary Annotation | Johnny Harris | mono label types onto a paper strip | rough red circle draws round the key word | the strip is carried out by a push | Push in |
| Clean Callout | Ali Abdaal | cream card slides up | mint pill grows behind the spoken word, sentence never shifts | the card slides down | Fade |
| Punch Captions | MrBeast | heavy outlined capitals pop in, three words at a time | stressed word jumps forward in the accent colour | hard cut to the next words | Cut |
| Cinematic Title | Sam Kolder | thin spaced capitals fade up | letter spacing keeps opening across the page | the title dissolves into light | Motion blur |
| Handwritten Tape | Casey Neistat | marker lettering writes across masking tape | uneven double underline under the key word | the tape peels from a corner | Slide |
| Product Callout | Daniel Schiffer | leader line draws from a point the person places to a boxed label | the key word brightens | the line retracts | none |
| Beat Cutout | Lyrical Lemonade | cut-paper letters slam in, on the track's beats when it has them | acid-green duplicate jitters off the key word | the letters scatter | Flash |
| Symmetrical Title Card | Wes Anderson | hard cut to a centred serif on a flat colour card | two fine rules extend from either side | hard cut away | Cut |

## Where it lives

- `lib/studioClips/captionMotion.ts` (pure): the presets, their timings and
  defaults, `fitPhases`, the emphasised word (`emphasisWord`: the person's
  pick, else the cut's highlighted words, else the last carrying word), when
  it lands (`emphasisFrame`: the beat the person set, else the word's own
  time, else 40% into a phrase with one timestamp), `beatBefore` for Beat
  Cutout, the torn-edge polygons, and the per-caption override shape.
- `lib/studioClips/style.ts`: the ten presets are `CAPTION_STYLES` entries
  with `mark: "motion"`, so themes, the instruct ops and `sanitizeStyle`
  accept them unchanged; `withCaptionStyle` sets each one's face, position
  and colour (`CAPTION_MOTION_DEFAULTS`), which the person then changes with
  the existing font, colour, size, position and case controls.
- `components/studio/remotion/CaptionMotion.tsx`: `MotionCaption`, one
  component for the ten looks, driven by the frame only (inline SVG and CSS,
  no image assets). `CaptionPage` in `ClipComposition.tsx` delegates to it
  when the style's mark is `motion`, so the Player, a scrub and the browser
  export draw the same frame.
- `lib/studioClips/transitions.ts` + `timeline.ts`: joins `tear` (a torn
  paper edge crosses the frame over the incoming shot, 12 frames), `pushin`
  (the outgoing shot pushes in and blurs, the incoming one starts close and
  settles sharp in the same place, 12 frames) and `motionblur` (both shots
  move up through a vertical blur, 9 frames). `SegmentLayer` draws the tear
  with a paper strip along the edge. The blur effect now takes an axis.
- `components/studio/CaptionStylesPanel.tsx`: the picker in the Words tool.
  Ten tiles, each a small looping Player of the phrase "Find your focus" in
  that preset (plays when pointed at, focused or picked; a replay button on
  each; rests on its emphasis frame). With nothing selected a tile styles
  every caption; with a caption selected on the timeline it styles that
  caption alone, and the panel offers the emphasised word (chips), the
  emphasis beat (a range, set by hand or the word's own time), a callout's
  point (ranges, or Place the point on the preview and click the picture),
  Replay this caption, Apply to every caption and Back to the track's style.
  The matching join is shown with a Use it on every join button: picking a
  caption style never changes a cut on its own.
- `components/studio/Timeline.tsx` + `lib/studioClips/tracks.ts`: the caption
  track is now one item per page (the pages the composition shows, in the
  track's caption style), each with the caption's key; a click selects it and
  seeks the preview to it. Delete clears that caption's own style (captions
  come from the words said; they go when captions are switched off).

## Saved with the cut

`edl.captionOverrides` maps a caption key to `{ preset?, emphasis?, beatMs?,
anchor? }`. The key is the clip id and the first word's time in the clip
(`captionKey`), so it survives trims and moves. `revalidateEdl` keeps it,
bounded (`sanitizeCaptionOverrides`). A style for every caption clears the
styles single captions carried, in the same undo step. Old projects have no
overrides and read as before.

## Checking it

`/dev/studio-lab?screen=editor`, Words tool, Caption motion card. Verified
2026-11-17 in the lab: every preset previews; Editorial Highlight on the
track and Punch Captions on one caption with "twenty" emphasised; Paper tear
on every join (the edge mid-frame at 3.0 s); undo and redo; Cmd+S; a browser
export of 10.9 s whose frames at 3.0 s and 3.5 s match the Player at the same
times; a two-line five-word caption and a one-word caption in a vertical cut.
Not verified: a landscape cut in the browser (the type is sized on the short
side of the frame in code), save and reopen against the real backend (covered
by the revalidation test), and the three new joins in an export other than
the tear.

Tests: `lib/studioClips/captionMotion.test.ts` (presets, fitting, emphasis,
beats, overrides, joins, torn edges, revalidation).
