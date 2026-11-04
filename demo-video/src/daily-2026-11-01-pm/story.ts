// Daily reel, 2026-11-01 PM. Format: hot take. Feature: "Worth posting again" (Dashboard,
// Growth and up): posts at least 1.5x your own median over 90 days that aren't on your
// other platforms yet; one click copies the file and makes a draft with a fresh caption
// per platform (components/RepurposeCard.tsx, lib/repurpose.ts). Times are word starts in
// audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s, atempo 1.1, whisper-cli -ml 1).
// The posts and multipliers are an example and say EXAMPLE.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 30.8; // the take ends at 29.8 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

/** Top caption for the app scenes (the black scenes carry their own big type). */
export const PHRASES: Word[][] = [
  [wd("Your", 2.74), wd("best", 2.99, true), wd("reel", 3.26), wd("already", 3.52), wd("did", 3.96), wd("the", 4.07), wd("hard", 4.25, true), wd("part.", 4.49)],
  [wd("It's", 4.98), wd("just", 5.23), wd("only", 5.5, true), wd("on", 5.76), wd("one", 5.84, true), wd("platform.", 6.02)],
  [wd("SOCIA", 6.74, true), wd("has", 7.06), wd("a", 7.26), wd("section", 7.32), wd("called", 7.79), wd("Worth", 8.2, true), wd("posting", 8.54, true), wd("again.", 9.03, true)],
  [wd("It", 9.62), wd("looks", 9.74), wd("at", 10.04), wd("your", 10.17), wd("last", 10.41), wd("90", 10.65, true), wd("days,", 11.02, true)],
  [wd("finds", 11.42), wd("the", 11.69), wd("posts", 11.85), wd("that", 12.2), wd("did", 12.34), wd("at", 12.54), wd("least", 12.64), wd("1.5×", 12.9, true), wd("your", 13.9), wd("usual,", 14.15, true)],
  [wd("and", 14.42), wd("checks", 14.68), wd("where", 14.88), wd("they", 15.13), wd("haven't", 15.34, true), wd("gone", 15.71, true), wd("yet.", 15.93)],
  [wd("One", 16.3, true), wd("tap", 16.55, true), wd("copies", 16.75), wd("it", 17.18), wd("over,", 17.32)],
  [wd("writes", 17.78), wd("a", 18.06), wd("fresh", 18.11, true), wd("caption", 18.4, true), wd("for", 18.82), wd("each", 19.07), wd("platform,", 19.34)],
  [wd("and", 19.86), wd("saves", 20.07), wd("it", 20.41), wd("as", 20.55), wd("a", 20.69), wd("draft.", 20.76, true)],
  [wd("Nothing", 21.34, true), wd("posts", 21.86), wd("until", 22.13), wd("you", 22.46, true), wd("approve", 22.65, true), wd("it.", 23.11)],
];

export const T = {
  take: 0.04,
  open: [0.84, 1.05, 1.4, 1.68, 1.96, 2.17], // you don't need more new content
  reel: 2.74,
  onlyOne: 4.98,
  section: 6.74,
  title: 8.2,
  days: 10.65,
  rows: 11.42,
  threshold: 12.9,
  checks: 14.68,
  tap: 16.55,
  captions: 17.78,
  draft: 20.76,
  approve: 21.34,
  ideas: 23.46,
  proven: 25.02,
  soon: 26.78,
  follow: 28.33,
};

export const DARK: [number, number][] = [[0, T.reel], [T.ideas, T.soon]];

/** Example candidates in the card's own wording. */
export const ROWS = [
  { title: "3 cafés, 1 rule: order the second thing", mult: "2.1×", sample: 24, from: "Instagram", date: "Sep 18", not: "TikTok and YouTube", cover: "linear-gradient(160deg,#e8c9a0,#9c6b3c)" },
  { title: "the 30-second morning edit", mult: "1.8×", sample: 24, from: "Instagram", date: "Oct 2", not: "TikTok", cover: "linear-gradient(160deg,#c9d6ea,#5d7fb8)" },
  { title: "what I'd change about my first reel", mult: "1.6×", sample: 24, from: "Instagram", date: "Oct 9", not: "YouTube", cover: "linear-gradient(160deg,#d8d2c4,#6f6758)" },
];

export const DRAFTS = [
  { p: "TikTok", text: "3 cafés, 1 rule. The second thing on the menu is always the move." },
  { p: "YouTube", text: "3 cafés, 1 rule: why I always order the second thing #shorts" },
];
