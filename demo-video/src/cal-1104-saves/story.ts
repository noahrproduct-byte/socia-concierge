// Calendar post Wed Nov 4, 11:00 AM: "This Reel got 32 saves. Here's what Claude said made it
// different." The draft's 32 is stale: the real count is 41 saves (SOCIA, Nov 2).
//
// Real data (SOCIA MCP, workspace Socia, @socia.appmedia, 2026-11-03 00:43 UTC = Nov 2 CST):
//   get_top_posts (30 days, 9 Reels, median 20 interactions):
//     "Connect Claude to your Instagram in 60 seconds..." Nov 1: 1,826 views, 1,550 reach,
//     40 likes, 19 comments, 41 saves, 18 shares, 118 interactions, 5.9x median.
//     Openers "Stop guessing / I stopped guessing what to post": 5 of the 9 Reels by title
//     (Central time: Oct 27 513 views; repeats Oct 27 241, Oct 28 150, Oct 29 144, Oct 31 152).
//     (The brief and the content plan say 6 of 9; get_top_posts' titles show 5, so 5 is used.)
//   get_content_plan: the breakout is "the only one combining a named tool, a concrete promise
//     and a time limit".
//   get_performance_insights: "The hook or the subject may explain it; one post can't show
//     which, so treat it as something to test, not a conclusion."
// CLAUDE below is Claude's real answer to the on-screen question, written from those three
// tool results only (shortened for the screen). SOCIA gives the caption and numbers, not the
// video, so the answer says so.
//
// Times are word starts in audio/vo.mp3 (Declan Sage take a of the corrected script, silences
// cut to 0.2 s, atempo 1.27, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 34.4; // the take ends at 32.86 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const HOOK: Word[] = [wd("This", 0.0), wd("Reel", 0.3), wd("got", 0.78)];

export const PHRASES: Word[][] = [
  [wd("So", 3.24), wd("I", 3.33), wd("asked", 3.37), wd("Claude", 3.61, true), wd("what", 3.9), wd("made", 4.09), wd("it", 4.28), wd("different.", 4.37, true)],
  [wd("Claude", 5.0, true), wd("pulled", 5.29), wd("my", 5.58), wd("real", 5.67, true), wd("numbers", 5.86, true), wd("through", 6.22), wd("SOCIA.", 6.76)],
  [wd("Over", 7.38), wd("1,800", 7.65, true), wd("views,", 8.47), wd("41", 8.92, true), wd("saves,", 9.46, true)],
  [wd("5.9×", 10.06, true), wd("my", 11.05), wd("usual", 11.19), wd("post.", 11.55)],
  [wd("Then", 12.08), wd("it", 12.27), wd("broke", 12.36, true), wd("it", 12.6, true), wd("down.", 12.68, true)],
  [wd("The", 13.04), wd("hook", 13.22), wd("names", 13.45), wd("a", 13.8), wd("tool,", 13.88, true), wd("a", 14.18), wd("result", 14.24, true), wd("and", 14.74), wd("a", 14.96), wd("time", 15.05, true), wd("limit:", 15.16, true)],
  [wd("connect", 15.56), wd("Claude", 15.94), wd("to", 16.38), wd("your", 16.41), wd("Instagram", 16.6), wd("in", 17.09), wd("60", 17.21, true), wd("seconds.", 17.57, true)],
  [wd("Five", 18.12, true), wd("of", 18.39), wd("my", 18.51), wd("nine", 18.64), wd("Reels", 18.96), wd("opened", 19.26), wd("with", 19.56), wd("\"stop", 19.76, true), wd("guessing\"", 20.13, true), wd("instead.", 20.58)],
  [wd("After", 21.28), wd("the", 21.55), wd("first", 21.67), wd("one,", 21.91), wd("none", 22.18, true), wd("of", 22.42), wd("the", 22.54), wd("repeats", 22.72), wd("came", 23.29, true), wd("close.", 23.37, true)],
  [wd("And", 23.68), wd("Claude", 23.82), wd("was", 24.1), wd("honest:", 24.24, true)],
  [wd("one", 24.68, true), wd("post", 24.85, true), wd("can't", 25.08), wd("prove", 25.53), wd("if", 25.65), wd("it", 25.76), wd("was", 25.87), wd("the", 26.08), wd("hook", 26.25, true), wd("or", 26.48), wd("the", 26.69), wd("topic.", 26.85, true)],
  [wd("So", 27.24), wd("test", 27.37, true), wd("it", 27.64, true), wd("again.", 27.76, true)],
];

export const CTA: Word[] = [wd("Which", 28.34), wd("of", 28.59), wd("your", 28.7), wd("Reels", 28.92), wd("got", 29.19), wd("more", 29.35, true), wd("saves", 29.57, true), wd("than", 29.84), wd("likes?", 30.06)];

export const T = {
  saves: 0.99,
  more: 2.12,
  ask: 3.24,
  typeFrom: 3.3,
  typeTo: 4.75,
  pull: 5.0,
  tools: [5.35, 5.75, 6.15],
  views: 7.65,
  savesN: 8.92,
  mult: 10.06,
  answer: 12.08,
  hook: 13.04,
  tool: 13.88,
  result: 14.24,
  time: 15.05,
  quote: 15.56,
  structure: 17.0,
  contrast: 18.12,
  bars: 19.76,
  close: 22.18,
  honest: 23.68,
  caveat: 24.68,
  test: 27.24,
  cta: 28.34,
  comments: 30.56,
  end: 31.56,
  soon: 32.02,
};

export const ASK = "Break down my Reel with 41 saves. What made its hook and structure different from my other Reels?";

export const REEL = {
  title: "Connect Claude to your Instagram in 60 seconds",
  date: "Nov 1, 7:22 PM",
  views: 1826,
  likes: 40,
  comments: 19,
  saves: 41,
  shares: 18,
  interactions: 118,
  median: 20,
  mult: "5.9×",
};

export const SOURCE = "SOCIA Analytics · @socia.appmedia · as of Nov 2";

/** The "stop guessing" Reels by views, in publish order, dates in Central time (get_top_posts). */
export const OPENERS = [
  { date: "Oct 27", views: 513 },
  { date: "Oct 27", views: 241 },
  { date: "Oct 28", views: 150 },
  { date: "Oct 29", views: 144 },
  { date: "Oct 31", views: 152 },
];

/** Claude's answer, shortened for the screen. */
export const CLAUDE = {
  intro: "Here's what stands out, from SOCIA's numbers for your last 30 days (9 Reels).",
  hookHead: "The hook",
  hookBody: "The only one of your 9 Reels whose first line has all three.",
  structHead: "The structure",
  structBody: "The promise comes first, SOCIA is named after it, and it ends with a comment prompt.",
  contrastHead: "The contrast",
  contrastBody: "5 of your 9 Reels open with \"stop guessing\". After the first, the repeats got under half its views.",
  caveatHead: "What I can't tell you",
  caveatBody: "I see the caption and the numbers, not the video. One post can't show whether the hook or the topic did it. Make another with the same structure and compare it with your median of 20.",
};
