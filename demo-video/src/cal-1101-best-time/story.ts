// Calendar post Sun Nov 1, 6:00 PM: "Stop guessing when to post. Ask your own data."
// Rewritten hook (the content plan retires "stop guessing"): "When should you post? I asked
// my own data." The honest twist: SOCIA's posting-time view looked at the 9 Reels and found
// no window that stands out, and it doesn't invent one.
//
// Real data (SOCIA MCP get_posting_recommendations + get_top_posts, workspace Socia,
// @socia.appmedia, 2026-11-03 00:43 UTC = Nov 2 CST, America/Chicago):
//   based_on_posts 9, enough_history false, "Your 9 Instagram posts do not show a time window
//   with clearly higher median engagement yet."
//   Publish times bucketed into weekday x 3-hour blocks exactly like lib/postingTimes.ts:
//   all 9 posts land in 9 different blocks (1 post each), so nothing reaches SIGNAL_N = 2.
// The rule copy is the app's own (components/ov/PostingHeatmap.tsx, lib/postingTimes.ts:
// SIGNAL_N 2 to be ranked, RELIABLE_N 4 for high confidence).
// The "next posts" ghosts in the fill-in scene are illustrative and say EXAMPLE.
//
// Times are word starts in audio/vo.mp3 (Declan Sage take b, silences cut to 0.2 s,
// atempo 1.158, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 28.2; // the take ends at 26.67 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const HOOK: Word[] = [wd("When", 0.0), wd("should", 0.2), wd("you", 0.45), wd("post?", 0.66, true)];
export const HOOK_SUB: Word[] = [wd("I", 1.2), wd("asked", 1.27), wd("my", 1.59), wd("own", 1.73, true), wd("data.", 2.01, true)];

/** Top caption for the light scenes. */
export const PHRASES: Word[][] = [
  [wd("SOCIA", 2.44, true), wd("lined", 2.81), wd("up", 3.19), wd("all", 3.34), wd("nine", 3.64, true), wd("of", 3.87), wd("my", 4.03), wd("Reels", 4.17)],
  [wd("by", 4.59), wd("day", 4.89, true), wd("and", 5.16), wd("time.", 5.41, true)],
  [wd("Every", 5.76), wd("single", 6.1), wd("one", 6.5), wd("landed", 6.72), wd("in", 7.1), wd("a", 7.23), wd("different", 7.35, true), wd("slot.", 7.9, true)],
  [wd("So", 8.42), wd("it", 8.55), wd("said", 8.68), wd("it", 8.99), wd("straight:", 9.13)],
  [wd("no", 9.88, true), wd("window", 10.04, true), wd("stands", 10.53), wd("out", 11.08), wd("yet,", 11.26)],
  [wd("and", 11.61), wd("it", 11.76), wd("won't", 11.86, true), wd("make", 12.1, true), wd("one", 12.32, true), wd("up.", 12.45, true)],
  [wd("A", 12.72), wd("time", 12.78), wd("slot", 13.05), wd("needs", 13.31), wd("at", 13.65), wd("least", 13.92), wd("two", 14.11, true), wd("posts", 14.31, true)],
  [wd("before", 14.67), wd("SOCIA", 15.13), wd("ranks", 15.39, true), wd("it,", 15.72)],
  [wd("and", 15.88), wd("four", 16.06, true), wd("before", 16.3), wd("it", 16.65), wd("calls", 16.77), wd("it", 17.08), wd("high", 17.18, true), wd("confidence.", 17.47, true)],
  [wd("So", 18.22), wd("I'll", 18.35), wd("post", 18.6), wd("at", 18.86), wd("a", 18.99), wd("few", 19.04), wd("different", 19.42, true), wd("times,", 19.83, true)],
  [wd("and", 20.2), wd("the", 20.35), wd("map", 20.5, true), wd("fills", 20.65, true), wd("in.", 20.9)],
  [wd("Every", 21.16), wd("post", 21.47), wd("makes", 21.73), wd("the", 22.03), wd("answer", 22.36), wd("sharper.", 22.58, true)],
];

export const T = {
  grid: 2.44,
  drop: 3.0, // first post lands; one every 0.29 s
  every: 5.76,
  slot: 7.9,
  verdict: 9.88,
  wont: 11.86,
  rule: 12.72,
  two: 14.11,
  ranks: 15.39,
  four: 16.06,
  high: 17.47,
  fill: 18.22,
  map: 20.5,
  sharper: 22.58,
  end: 23.24,
  socia: 25.28,
  soon: 25.9,
};

export const DARK: [number, number][] = [[0, T.grid], [T.end, 999]];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const BLOCKS = ["12AM", "3AM", "6AM", "9AM", "12PM", "3PM", "6PM", "9PM"];

/** The 9 Reels (Instagram, last 30 days), in publish order, Central time. day 0 = Mon, block = hour / 3. */
export const POSTS = [
  { day: 1, block: 4, when: "Tue Oct 27, 12:19 PM" },
  { day: 1, block: 7, when: "Tue Oct 27, 9:19 PM" },
  { day: 2, block: 4, when: "Wed Oct 28, 1:51 PM" },
  { day: 3, block: 5, when: "Thu Oct 29, 3:15 PM" },
  { day: 3, block: 7, when: "Thu Oct 29, 9:45 PM" },
  { day: 4, block: 5, when: "Fri Oct 30, 4:00 PM" },
  { day: 5, block: 3, when: "Sat Oct 31, 11:04 AM" },
  { day: 6, block: 6, when: "Sun Nov 1, 7:22 PM" },
  { day: 6, block: 7, when: "Sun Nov 1, 10:45 PM" },
];

/** Illustrative future posts for the fill-in scene (EXAMPLE). */
export const GHOSTS = [
  { day: 1, block: 4 },
  { day: 6, block: 6 },
  { day: 3, block: 5 },
  { day: 1, block: 4 },
  { day: 6, block: 6 },
];

export const SOURCE = "SOCIA Analytics · Posting Times · @socia.appmedia · Nov 2 · Central time";
