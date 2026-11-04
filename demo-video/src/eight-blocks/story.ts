// "8 blocks" reel (reference: instagram.com/reel/De1_SdZt527, the short-form structure stack,
// studied 2026-10-31, refs/reel-4). Noah: copy this exact video, then add a SOCIA ending
// (follow, comment SOCIA, I'll send you the link). Rebuilt frame for frame rather than
// reusing their file. Times are word starts in audio/vo.mp3 (Declan Sage take b, silences
// cut to 0.2 s, atempo 1.2, whisper-cli -ml 1). Change copy here.
//
// Honesty: the SOCIA check uses the real Content Studio rater categories and says EXAMPLE;
// no viewer or retention numbers are claimed beyond the reference's illustrative clock.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 39.6; // the take ends at 38.5 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export const BLOCKS = [
  { k: "Hook", c: "#ff4fd8", at: 0.03 },
  { k: "Lead", c: "#ffc247", at: 0.49 },
  { k: "Body 1", c: "#3fd8f0", at: 1.01 },
  { k: "Open loop", c: "#9b6bff", at: 1.62 },
  { k: "Body 2", c: "#39c9e8", at: 2.34 },
  { k: "Open loop", c: "#8f62ff", at: 2.92 },
  { k: "Body 3", c: "#2ee6c0", at: 3.62 },
  { k: "CTA", c: "#3cf08a", at: 4.2 },
];

export const T = {
  perfect: 4.96,
  hook: 7.48,
  breaks: 7.78,
  lead: 9.48,
  clockFrom: 9.96,
  tenMark: 11.13,
  anchored: 12.0,
  notOff: 13.14,
  body: 13.88,
  value: 15.06,
  loop: 16.36,
  oneLine: 17.68,
  quoteFrom: 19.71,
  quoteTo: 21.17,
  stay: 21.36,
  closeIt: 22.54,
  repeat: 23.2,
  x1: 23.68,
  x2: 24.38,
  last: 25.32,
  cta: 26.2,
  warmest: 28.41,
  nextStep: 30.19,
  eight: 31.24,
  save: 32.08,
  socia: 34.08,
  check: 35.09,
  follow: 36.16,
  comment: 36.64,
  send: 37.51,
};

/** Bottom caption chunks: [start, words, accent index, accent colour]. */
export const CHUNKS: { at: number; text: string; em?: number; c?: string }[] = [
  ...BLOCKS.map((b) => ({ at: b.at, text: `${b.k.replace(/ \d/, "")}.`, em: 0, c: b.c })),
  { at: 4.96, text: "This is the", c: "#9b6bff" },
  { at: 5.44, text: "perfect structure", em: 0, c: "#ff4fd8" },
  { at: 6.24, text: "for short-form", em: 1, c: "#3fd8f0" },
  { at: 6.9, text: "content.", c: "#3fd8f0" },
  { at: 7.48, text: "The hook breaks", em: 1, c: "#ff4fd8" },
  { at: 8.12, text: "the pattern", em: 1, c: "#ff4fd8" },
  { at: 8.49, text: "of what they're", c: "#ff4fd8" },
  { at: 8.93, text: "scrolling.", em: 0, c: "#ff4fd8" },
  { at: 9.48, text: "The lead pulls", em: 1, c: "#ffc247" },
  { at: 10.08, text: "them to the", c: "#ffc247" },
  { at: 10.53, text: "10-second mark.", em: 0, c: "#ffc247" },
  { at: 11.52, text: "Once they're", c: "#ffc247" },
  { at: 12.0, text: "anchored there,", em: 0, c: "#ffc247" },
  { at: 12.6, text: "they're not", em: 1, c: "#ffc247" },
  { at: 13.14, text: "scrolling off.", em: 1, c: "#ffc247" },
  { at: 13.88, text: "Then body 1:", em: 1, c: "#3fd8f0" },
  { at: 14.89, text: "your first piece", em: 2, c: "#3fd8f0" },
  { at: 15.68, text: "of value.", em: 1, c: "#3fd8f0" },
  { at: 16.36, text: "Then an open", c: "#9b6bff" },
  { at: 17.17, text: "loop.", em: 0, c: "#9b6bff" },
  { at: 17.68, text: "One line that", c: "#9b6bff" },
  { at: 18.29, text: "creates curiosity,", em: 1, c: "#9b6bff" },
  { at: 19.4, text: "like \"but that's", em: 0, c: "#9b6bff" },
  { at: 20.17, text: "not the craziest part.\"", c: "#9b6bff" },
  { at: 21.36, text: "Now they have", em: 2, c: "#9b6bff" },
  { at: 22.05, text: "to stay to close it.", em: 2, c: "#9b6bff" },
  { at: 23.2, text: "You repeat that", em: 1, c: "#8f62ff" },
  { at: 23.89, text: "structure twice,", em: 1, c: "#8f62ff" },
  { at: 24.84, text: "then one last", em: 2, c: "#2ee6c0" },
  { at: 25.85, text: "body.", c: "#2ee6c0" },
  { at: 26.2, text: "And finally,", em: 1, c: "#3cf08a" },
  { at: 27.21, text: "the CTA.", em: 1, c: "#3cf08a" },
  { at: 27.88, text: "It takes your", c: "#3cf08a" },
  { at: 28.41, text: "warmest viewers", em: 0, c: "#3cf08a" },
  { at: 29.14, text: "and moves them", em: 2, c: "#3cf08a" },
  { at: 29.8, text: "into the next", c: "#3cf08a" },
  { at: 30.44, text: "step of your funnel.", em: 0, c: "#3cf08a" },
  { at: 31.24, text: "8 blocks.", em: 1, c: "#3fd8f0" },
  { at: 32.08, text: "Save this before", em: 0, c: "#3fd8f0" },
  { at: 33.09, text: "you write your", c: "#3fd8f0" },
  { at: 33.5, text: "next script.", em: 1, c: "#3fd8f0" },
  { at: 34.08, text: "And if you want", c: "#9b6bff" },
  { at: 34.68, text: "SOCIA to check", em: 0, c: "#9b6bff" },
  { at: 35.48, text: "your videos for this,", em: 1, c: "#9b6bff" },
  { at: 36.16, text: "follow,", em: 0, c: "#9b6bff" },
  { at: 36.64, text: "comment SOCIA,", em: 1, c: "#ff4fd8" },
  { at: 37.19, text: "and I'll send you the link.", em: 5, c: "#3cf08a" },
];

/** Which block each scene lights on the top progress bar. */
export const SCENE_BLOCK: [number, number][] = [[T.hook, 0], [T.lead, 1], [T.body, 2], [T.loop, 3], [T.repeat, 5], [T.last, 6], [T.cta, 7]];

/** Example SOCIA check in the Content Studio rater categories. */
export const CHECK = [["Hook", 88], ["Pacing", 81], ["Clarity", 85], ["CTA", 79]] as [string, number][];
