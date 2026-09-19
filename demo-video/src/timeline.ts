// The 30-second storyboard, in frames at 60fps. Scene boundaries are where the
// violet scan-sweep transitions fire.

// All timing is expressed in seconds and derived from FPS, so a different
// rate re-times cleanly: REMOTION_FPS=30 npx remotion render …
export const FPS = Number(process.env.REMOTION_FPS ?? 60) || 60;
export const TOTAL_FRAMES = 30 * FPS; // 1800 — exactly 30.000s
export const MS_PER_FRAME = 1000 / FPS;

export const T = {
  s1: 0, //          0:00 competitors load
  s2: 3 * FPS, //    0:03 push-in on intel strip → re-derive → gap bars
  s3: 9 * FPS, //    0:09 scorer
  s4: 16 * FPS, //   0:16 dashboard (2s) → Ask SOCIA (3s)
  s4b: 18 * FPS, //  0:18 chat starts
  s5: 21 * FPS, //   0:21 slow push on the next-move card
  s6: 26 * FPS, //   0:26 zoom out with URL
  end: 27.5 * FPS, // 0:27.5 end card
} as const;

export const CUTS = [T.s2, T.s3, T.s4, T.s5, T.s6];

export const BRAND = {
  bg: "#0B1220",
  violet: "#7B6CF6",
  text: "#F3F4FA",
  muted: "rgba(243,244,250,0.62)",
  font: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
} as const;

/** Set to e.g. "audio/vo.mp3" (under captures/) to drop in a soundtrack. */
export const AUDIO_SRC: string | null = null;
