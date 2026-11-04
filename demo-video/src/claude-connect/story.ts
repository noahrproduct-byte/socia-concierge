// "Connect Claude to your Instagram" reel (reference: instagram.com/reel/DdyGMwiDxIN,
// studied 2026-10-30, refs/reel-dd). Same structure, layout and timing; the content is
// SOCIA as the connector. Every time below is a word start in audio/vo.mp3 (Declan Sage
// take3-b, silences cut to 0.2 s, atempo 1.1, whisper-cli -ml 1). Change copy here.
//
// Honesty: Instagram gives no retention curve, so the answer is reach against the usual
// and the posting time (both real SOCIA reads); the account, posts and numbers are an
// example and say EXAMPLE on screen. v2 (Noah, 2026-10-30): SOCIA is the data (reads
// posts and what's trending, tells Claude what to make), Claude builds the video
// (edit, animations, captions), SOCIA rates, publishes on approval and tracks.
// Site not ready: "coming soon".

export const FPS = 60;
export const W = 1080;
export const H = 1920;
export const END = 41.9; // the take ends at 40.7 s; the last frame holds
export const TOTAL_FRAMES = Math.round(END * FPS);

/** A caption word: text, start time, accent colour. */
export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

/** The hook headline (two lines) and its sub line (two lines), revealed word by word. */
export const HOOK = {
  head: [
    [wd("Connect", 0.01), wd("Claude", 0.42)],
    [wd("to", 0.78), wd("your", 0.9), wd("Instagram", 1.14, true)],
  ],
  sub: [
    [wd("and", 1.79), wd("it", 1.94), wd("tells", 2.0), wd("you", 2.18), wd("why", 2.32)],
    [wd("your", 2.64), wd("last", 2.9), wd("reel", 3.16), wd("flopped", 3.43, true)],
  ],
  card: { at: 4.1, text: "Your last reel reached half your usual audience" },
  end: 5.18,
};

/** The top pill: one line per beat, accent words in peach. */
export const PILLS: { at: number; step?: number; words: Word[] }[] = [
  { at: 5.18, words: [wd("By default it can't see it", 0)] },
  { at: 7.67, words: [wd("Scraper hacks", 0), wd("break", 0, true)] },
  { at: 9.06, words: [wd("One", 0), wd("connector", 0, true), wd("instead", 0)] },
  { at: 11.29, step: 1, words: [wd("Add", 0), wd("SOCIA", 0, true), wd("in Claude's settings", 0)] },
  { at: 13.04, step: 2, words: [wd("Ask it", 0), wd("why", 0, true), wd("your reel flopped", 0)] },
  { at: 15.38, words: [wd("SOCIA reads your", 0), wd("real posts", 0, true)] },
  { at: 18.46, words: [wd("Half your usual", 0), wd("reach", 0, true)] },
  { at: 21.34, words: [wd("SOCIA reads", 0), wd("what's trending", 0, true)] },
  { at: 23.07, words: [wd("and tells Claude", 0), wd("what to make", 0, true)] },
  { at: 25.02, words: [wd("Claude", 0), wd("builds it", 0, true)] },
  { at: 29.0, words: [wd("SOCIA", 0), wd("rates it", 0, true), wd("before you post", 0)] },
  { at: 30.98, words: [wd("Approve it, SOCIA", 0), wd("publishes it", 0, true)] },
  { at: 33.26, words: [wd("It tracks", 0), wd("every view and save", 0, true)] },
  { at: 37.22, words: [wd("Comment", 0), wd("CLAUDE", 0, true), wd("for early access", 0)] },
];

/** Scene start times (the word that opens each beat). */
export const T = {
  noSee: 5.18,
  scraper: 7.67,
  connector: 9.06,
  connected: 10.82, // "SOCIA"
  settings: 11.29,
  addClick: 12.5,
  ask: 13.04,
  typeFrom: 13.69,
  typeTo: 15.06,
  read: 15.38,
  readDone: 16.67,
  answer: 18.46,
  fix: 19.92,
  trend: 21.34,
  tell: 23.07,
  build: 25.02,
  tracks: [26.46, 27.06, 28.04], // edit, animations, captions
  buildDone: 28.6,
  rate: 29.0,
  publish: 30.98,
  approveClick: 31.3,
  published: 32.0,
  track: 33.26,
  trackNodes: [34.15, 35.05, 35.72, 36.08],
  trackPill: 36.4,
  cta: 37.22,
  comment: 37.69,
  notify: 39.22,
};

export const CHAT = {
  noSeeAsk: "can you open my Instagram?",
  noSeeReply: "I can't see your Instagram by default.",
  ask: "why did my last reel flop?",
};

export const SCRAPER = [
  { req: "GET /p/DZCY6…", code: "200", ok: true },
  { req: "GET /p/DaLLp…", code: "200", ok: true },
  { req: "GET /p/Db8EI…", code: "429", ok: false },
];

/** Example account's last eight reels: reach as a share of the usual (1 = usual). */
export const REACH = [0.92, 1.18, 0.86, 1.04, 1.26, 0.97, 1.1, 0.5];

/** Example trending reels in the niche (titles only, no real creator's numbers). */
export const TRENDING = ["\"why your reel flopped\" breakdowns", "one stat, answered on screen", "before and after edits"];
export const NEXT_IDEA = "Make next: a \"why it flopped\" explainer. Put the answer in the first second.";

/** Example rater scores in the Content Studio categories (lib/studio.ts CATEGORY_INFO). */
export const RATER = { overall: 82, rows: [["Hook", 88], ["Pacing", 79], ["Clarity", 85], ["Visual interest", 80], ["CTA", 74], ["Audio fit", 83]] as [string, number][], fix: "CTA: ask for the comment two seconds sooner" };

export const TRACK = [
  { k: "views", sub: "every reel" },
  { k: "saves", sub: "what people keep" },
  { k: "reach", sub: "vs your usual" },
  { k: "plans", sub: "what's next" },
];

export const FOOTER = "SOCIA · coming soon";
