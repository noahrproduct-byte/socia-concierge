// Calendar post Fri Nov 6, 6:00 PM: "Paste in a weak caption, get a sharper one out."
// Before: a real caption from @socia.appmedia (Reel, Oct 28; 241 views, 27 interactions,
// get_top_posts 2026-11-03). After: written by Claude (this builder) from SOCIA's data, NOT
// by SOCIA's Generate caption (that feature exists in Create Post but wasn't run here), so
// the video says "Claude rewrote it with SOCIA's data". Facts used: 5 of the 9 Reel captions
// in the last 30 days open with "Stop guessing" / "I stopped guessing" (get_top_posts); the
// weekly Content Plan (Nov 2) says retire that opener, build on the breakout's formula and
// end with a CTA you can answer in comments. Times are word starts in audio/vo.mp3 (Declan
// Sage take b, silences cut to 0.2 s, atempo 1.136, whisper-cli -ml 1).

import { wd, type Word } from "../cal-1102-drop-handle/kit";

export const W = 1080;
export const H = 1920;
export const END = 29.2; // the take ends at 26.77 s
export const TOTAL_FRAMES = Math.round(END * 30);

export const HOOK: Word[][] = [
  [wd("Paste", 0.03), wd("in", 0.31), wd("a", 0.42), wd("weak", 0.48, true), wd("caption.", 0.79)],
  [wd("Get", 1.34), wd("a", 1.52), wd("sharper", 1.58, true), wd("one", 1.99), wd("out.", 2.17)],
];

export const CAPTION: Word[][] = [
  [wd("This", 2.54), wd("is", 2.77), wd("a", 2.88), wd("real", 2.93, true), wd("caption", 3.16), wd("from", 3.57), wd("our", 3.92), wd("account.", 3.97)],
  [wd("Here's", 4.62), wd("what", 4.93), wd("SOCIA's", 5.14, true), wd("data", 5.49, true), wd("says", 5.7), wd("is", 6.0), wd("wrong", 6.01), wd("with", 6.28), wd("it.", 6.49)],
  [wd("It", 6.86), wd("opens", 6.98), wd("with", 7.28), wd("\"I", 7.71, true), wd("stopped", 7.76, true), wd("guessing,\"", 8.25, true)],
  [wd("a", 8.78), wd("line", 8.85), wd("in", 9.15), wd("5", 9.3, true), wd("of", 9.6), wd("our", 9.75), wd("last", 10.17), wd("9", 10.27, true), wd("captions.", 10.57)],
  [wd("\"10", 11.42, true), wd("minutes", 11.74, true), wd("a", 12.17, true), wd("day\":", 12.21, true), wd("nothing", 12.46), wd("backs", 12.91), wd("that", 13.28), wd("up.", 13.48)],
  [wd("And", 13.62), wd("it", 13.83), wd("lists", 13.97), wd("5", 14.41, true), wd("features,", 14.6, true), wd("but", 15.28), wd("never", 15.48), wd("asks", 15.69), wd("you", 15.91), wd("anything.", 16.18)],
  [wd("So", 16.66), wd("Claude", 16.9, true), wd("rewrote", 17.27), wd("it", 17.7), wd("with", 17.83), wd("SOCIA's", 18.07, true), wd("data.", 18.52, true)],
  [wd("A", 18.98), wd("real", 19.06, true), wd("fact", 19.39, true), wd("first.", 19.77)],
  [wd("One", 20.42, true), wd("result,", 20.64, true), wd("not", 21.21), wd("5", 21.43), wd("features.", 21.81)],
  [wd("And", 22.36), wd("a", 22.55), wd("question", 22.61, true), wd("you", 23.15), wd("can", 23.31), wd("answer.", 23.5)],
  [wd("Before.", 23.9), wd("After.", 24.48, true)],
  [wd("Which", 25.1), wd("one", 25.41), wd("would", 25.53), wd("you", 25.89), wd("read", 25.96, true), wd("to", 26.18, true), wd("the", 26.3, true), wd("end?", 26.49, true)],
];

export const T = {
  paste: 0.48,
  real: 2.93,
  opener: 6.98,
  count: 9.3,
  minutes: 11.42,
  features: 14.41,
  noAsk: 15.48,
  claude: 16.9,
  seg: [
    { type: 17.55, hl: 18.98 },
    { type: 19.85, hl: 20.42 },
    { type: 21.75, hl: 22.55 },
  ],
  before: 23.9,
  after: 24.48,
  ask: 25.1,
  end: 27.0,
};

/** The real caption, split so parts can be marked. f = feature number (1 to 5). */
export const BEFORE: { s: string; mark?: "opener" | "minutes"; f?: number }[] = [
  { s: "I stopped guessing what to post.", mark: "opener" },
  { s: " SOCIA " },
  { s: "audits", f: 1 },
  { s: " your account, " },
  { s: "tracks", f: 2 },
  { s: " your competitors, " },
  { s: "plans", f: 3 },
  { s: " the week, " },
  { s: "scores", f: 4 },
  { s: " every post and " },
  { s: "schedules", f: 5 },
  { s: " it. " },
  { s: "10 minutes a day.", mark: "minutes" },
];

/** Claude's rewrite, from SOCIA's data only. */
export const AFTER = [
  "5 of my last 9 captions opened the same way.",
  "SOCIA flagged it and built this week's plan around the one Reel that broke out. Nothing posts until I approve.",
  "What line do you keep reusing? Tell me below.",
];

export const NOTES_BEFORE = [
  { at: T.opener, title: "Opener used in 5 of 9 captions", src: "SOCIA · last 30 days" },
  { at: T.minutes, title: "\"10 minutes a day\": no data backs it", src: "nothing in SOCIA supports it" },
  { at: T.features, title: "5 features, no question", src: "Plan fix 3: end with a CTA" },
];
export const NOTES_AFTER = ["Real fact first", "One result", "A question to answer"];
