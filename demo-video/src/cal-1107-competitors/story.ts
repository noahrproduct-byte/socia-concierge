// Calendar post Sat Nov 7, 11:00 AM: "Want to see what's working for accounts like yours?"
// Shows SOCIA's Discover page (app/(app)/discover, components/competitors/TrendingNiche.tsx):
// "Accounts in your niche" ("n of limit on your plan", Track) and "Recent Reels in your
// niche" ("Last 60 days, ranked against each account's usual", "N× their median likes and
// comments" for Instagram, Copy idea, Add to my plan). The wording is the page's own.
// No competitor data is available through the tools, so EVERY account, number and Reel here
// is made up and labelled EXAMPLE; the handles are placeholders (@example.*) so no real
// account is named. The pattern is phrased as something to test. Times are word starts in
// audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s, atempo 1.10, whisper-cli -ml 1).

import { wd, type Word } from "../cal-1102-drop-handle/kit";

export const W = 1080;
export const H = 1920;
export const END = 28.2; // the take ends at 25.89 s
export const TOTAL_FRAMES = Math.round(END * 30);

export const HOOK: Word[] = [wd("Want", 0.02), wd("to", 0.19), wd("see", 0.28), wd("what's", 0.42), wd("working", 0.7, true), wd("for", 1.07), wd("accounts", 1.18), wd("like", 1.57), wd("yours?", 1.76, true)];

export const CAPTION: Word[][] = [
  [wd("SOCIA's", 2.24, true), wd("Discover", 2.62, true), wd("page", 3.14), wd("finds", 3.4), wd("accounts", 3.72), wd("in", 4.27), wd("your", 4.51), wd("niche,", 4.71, true)],
  [wd("and", 5.1), wd("ranks", 5.28), wd("their", 5.58), wd("recent", 5.88), wd("Reels", 6.24), wd("against", 6.58), wd("each", 6.92), wd("account's", 7.37, true), wd("own", 7.6, true), wd("usual.", 7.88, true)],
  [wd("So", 8.52), wd("a", 8.63), wd("small", 8.68, true), wd("account's", 8.97), wd("hit", 9.48), wd("shows", 9.65), wd("up", 9.94), wd("too,", 10.16)],
  [wd("not", 10.56), wd("just", 10.74), wd("the", 10.98), wd("big", 11.18, true), wd("names.", 11.34, true)],
  [wd("Here's", 11.84), wd("a", 12.14), wd("pattern", 12.19, true), wd("worth", 12.55, true), wd("testing.", 12.81, true)],
  [wd("In", 13.36), wd("these", 13.49), wd("three,", 13.82), wd("the", 14.3), wd("result", 14.51, true), wd("is", 14.93), wd("on", 15.07), wd("screen", 15.21), wd("in", 15.64), wd("the", 15.77), wd("first", 15.97, true), wd("second.", 16.32, true)],
  [wd("That's", 16.92), wd("not", 17.26), wd("proof.", 17.43, true), wd("It's", 17.92), wd("a", 18.2), wd("test.", 18.27, true)],
  [wd("Copy", 18.8, true), wd("the", 19.15), wd("idea,", 19.42, true), wd("not", 19.96), wd("the", 20.19), wd("video,", 20.42)],
  [wd("and", 21.06), wd("add", 21.13, true), wd("it", 21.3), wd("to", 21.41), wd("your", 21.55), wd("plan.", 21.76, true)],
  [wd("Every", 22.16), wd("account", 22.48), wd("here", 22.93), wd("is", 23.23), wd("an", 23.32), wd("example.", 23.45, true)],
  [wd("Yours", 24.12), wd("will", 24.44), wd("show", 24.7), wd("your", 24.97), wd("own", 25.22, true), wd("niche.", 25.41, true)],
];

export const T = {
  page: 2.1,
  accounts: 3.4,
  reels: 5.1,
  ranked: 6.58,
  small: 8.68,
  big: 11.18,
  pattern: 11.84,
  marks: [14.51, 14.8, 15.1],
  first: 15.97,
  test: 16.92,
  copy: 18.8,
  add: 21.13,
  example: 22.16,
  yours: 24.12,
  end: 26.05,
};

/** EXAMPLE only. Placeholder handles, invented numbers. */
export const ACCOUNTS = [
  { handle: "@example.studio", letter: "S", followers: "48.2K", tracked: true, color: "#6b7a8f" },
  { handle: "@example.kitchen", letter: "K", followers: "9.6K", tracked: false, color: "#a0785a" },
  { handle: "@example.coach", letter: "C", followers: "2.1K", tracked: false, color: "#5d8a6e" },
];

/** EXAMPLE Reels, ranked by multiplier against each account's own median. */
export const REELS = [
  { handle: "@example.coach", followers: "2.1K", mult: "3.1×", thumb: "the finished edit", ago: "2 weeks ago", cover: "linear-gradient(165deg,#d9e4dc,#5d8a6e)" },
  { handle: "@example.studio", followers: "48.2K", mult: "2.4×", thumb: "the final room", ago: "5 days ago", cover: "linear-gradient(165deg,#dfe3ea,#6b7a8f)" },
  { handle: "@example.kitchen", followers: "9.6K", mult: "1.9×", thumb: "the plated dish", ago: "3 weeks ago", cover: "linear-gradient(165deg,#ecdccb,#a0785a)" },
];

/** The Copy idea brief, in the page's own template (TrendingNiche.tsx brief()). */
export const BRIEF = [
  "Reel idea from @example.coach on Instagram",
  "How it did: 3.1x the account's own median likes and comments",
  "Format: Reel",
  "Your version: same format and angle, your own footage, your own words.",
];
