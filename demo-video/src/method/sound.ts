// The soundtrack of the SOCIA reel.
//
// Voice: ElevenLabs v4, voice "Declan Sage - Wise, Deliberate, Captivating"
// (library voice kqVT88a5QfII1HNAEPTJ, Noah's pick on 2026-10-27), generated
// through Noah's ElevenLabs connector, one short clip per chapter. Each clip
// starts 0.15 s into its chapter (0.11 s for the hook, as in the reference).
// Clips are trimmed, sped 1.2x and levelled by audio/process-vo.sh, so the reel
// runs about a minute at roughly the reference's pace; see audio/README.md.
//
// Effects: Pixabay-licensed sounds bundled with HyperFrames (audio/sfx/CREDITS.md),
// each on a visible action of the reel, one frame after the picture. Their times
// follow the beats in Method.tsx, which follow the narrator's word timings.
//
// Music: none, by Noah's choice (2026-10-27). BED stays null.

export type Cue = { file: string; at: number; volume?: number };

/** One narration clip per chapter, at the chapter's start. */
export const VO: Cue[] = [
  { file: "00", at: 0.11 }, // hook
  { file: "01", at: 5.15 }, // meet SOCIA
  { file: "02", at: 12.05 }, // step one: connect
  { file: "03", at: 22.45 }, // step two: outliers (+ MCP as an option)
  { file: "04", at: 30.15 }, // step three: content plan
  { file: "05", at: 38.55 }, // step four: Content Studio + the rater
  { file: "06", at: 50.50 }, // step five: schedule, post, double down
  { file: "07", at: 57.30 }, // follow, comment, first 50 get a week free
];

/** Effects on the reel's visible actions. `at` is the picture's frame time; the clip lands one frame later. */
export const SFX: Cue[] = [
  { file: "whoosh-short", at: 5.00, volume: 0.5 }, // seam into meet
  { file: "click-soft", at: 6.37, volume: 0.5 }, // a verb lands
  { file: "click-soft", at: 7.45, volume: 0.5 }, // a verb lands
  { file: "click-soft", at: 8.37, volume: 0.5 }, // a verb lands
  { file: "click-soft", at: 9.43, volume: 0.5 }, // a verb lands
  { file: "click-soft", at: 10.58, volume: 0.5 }, // a verb lands
  { file: "whoosh-short", at: 11.90, volume: 0.5 }, // seam into context
  { file: "pop", at: 17.13, volume: 0.6 }, // the SOCIA hub
  { file: "click-soft", at: 18.16, volume: 0.6 }, // a spoke lands
  { file: "click-soft", at: 18.76, volume: 0.6 }, // a spoke lands
  { file: "click-soft", at: 19.39, volume: 0.6 }, // a spoke lands
  { file: "click-soft", at: 20.13, volume: 0.6 }, // a spoke lands
  { file: "click-soft", at: 21.32, volume: 0.6 }, // a spoke lands
  { file: "whoosh-short", at: 22.30, volume: 0.5 }, // seam into outliers
  { file: "click-soft", at: 23.90, volume: 0.5 }, // top post row 1
  { file: "click-soft", at: 24.05, volume: 0.5 }, // top post row 2
  { file: "click-soft", at: 24.20, volume: 0.5 }, // top post row 3
  { file: "click-soft", at: 24.35, volume: 0.5 }, // top post row 4
  { file: "pop", at: 25.38, volume: 0.7 }, // multipliers flip
  { file: "pop", at: 27.75, volume: 0.5 }, // the MCP option
  { file: "whoosh-short", at: 30.00, volume: 0.5 }, // seam into plan
  { file: "pop", at: 37.20, volume: 0.7 }, // three winning cells
  { file: "whoosh-short", at: 38.40, volume: 0.5 }, // seam into make
  { file: "click-soft", at: 39.68, volume: 0.4 }, // clip 1 dropped
  { file: "click-soft", at: 39.83, volume: 0.4 }, // clip 2 dropped
  { file: "click-soft", at: 39.98, volume: 0.4 }, // clip 3 dropped
  { file: "click-soft", at: 40.13, volume: 0.4 }, // clip 4 dropped
  { file: "click-soft", at: 40.28, volume: 0.4 }, // clip 5 dropped
  { file: "click-soft", at: 40.43, volume: 0.4 }, // clip 6 dropped
  { file: "click-soft", at: 40.58, volume: 0.4 }, // clip 7 dropped
  { file: "click-soft", at: 40.73, volume: 0.4 }, // clip 8 dropped
  { file: "pop", at: 42.11, volume: 0.45 }, // a cut built
  { file: "pop", at: 42.50, volume: 0.45 }, // a cut built
  { file: "pop", at: 43.02, volume: 0.45 }, // a cut built
  { file: "click-soft", at: 45.14, volume: 0.5 }, // a rater line
  { file: "click-soft", at: 45.51, volume: 0.5 }, // a rater line
  { file: "click-soft", at: 46.00, volume: 0.5 }, // a rater line
  { file: "click-soft", at: 46.63, volume: 0.5 }, // a rater line
  { file: "riser", at: 47.15, volume: 0.3 }, // into the call to action (10 s file, peaks near its end)
  { file: "click-soft", at: 47.27, volume: 0.5 }, // a rater line
  { file: "click-soft", at: 48.21, volume: 0.5 }, // a rater line
  { file: "whoosh-short", at: 50.35, volume: 0.5 }, // seam into loop
  { file: "pop", at: 55.35, volume: 0.6 }, // two winners light
  { file: "impact-bass-1", at: 57.15, volume: 0.8 }, // the mark lands
  { file: "pop", at: 60.78, volume: 0.6 }, // the week-free offer
];

export const BED: { volume: number } | null = null;
