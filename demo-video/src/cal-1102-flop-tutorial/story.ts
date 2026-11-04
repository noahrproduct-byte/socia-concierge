// Calendar post Mon Nov 2, 12:00 PM: "Ask Claude why your last Reel flopped. Here's the answer
// it gave me in 45 seconds." Tutorial format (content plan, Tuesday slot): hook burned in at 0 s,
// the exact question typed, then three zoomed callouts of Claude's real answer.
//
// The answer is real: Claude called SOCIA's MCP tools (get_top_posts, get_performance_insights,
// get_content_plan, get_account_analytics) on workspace 76cbbf46-2622-4864-9515-650d2974edd3 at
// 2026-11-03 00:43 UTC and answered the on-screen question from those results only. Numbers are
// Instagram @socia.appmedia, last 30 days. Times are word starts in audio/vo.mp3 (Declan Sage take a,
// silences cut to 0.2 s, atempo 1.2, whisper-cli -ml 1, checked against silencedetect).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 38.4; // the take ends at 35.97 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const SOURCE = "SOCIA Analytics · @socia.appmedia · Nov 2";
export const QUESTION = "Why did my last Reel get fewer likes than the one before?";

/** The two Reels, exactly as get_top_posts returned them (times in CST). */
export const BREAKOUT = { title: "Connect Claude to your Instagram in 60 seconds", when: "Nov 1, 7:22 PM", views: 1826, reach: 1550, likes: 40, comments: 19, saves: 41, shares: 18 };
export const FLOP = { title: "One reel went viral. The other flopped...", when: "Nov 1, 10:45 PM", views: 245, reach: 207, likes: 9, comments: 1, saves: 2, shares: 1 };

/** Top caption phrases (the hook and the CTA carry their own big type). */
export const PHRASES: Word[][] = [
  [wd("Step", 4.62), wd("one,", 4.96, true), wd("connect", 5.32), wd("SOCIA", 5.79, true), wd("to", 6.11), wd("Claude.", 6.22)],
  [wd("Step", 6.88), wd("two,", 7.22, true), wd("ask", 7.53), wd("it", 7.75), wd("this.", 7.88)],
  [wd("Why", 8.44), wd("did", 8.65), wd("my", 8.86), wd("last", 9.0), wd("Reel", 9.28), wd("get", 9.56), wd("fewer", 9.77, true), wd("likes", 10.08, true), wd("than", 10.48), wd("the", 10.69), wd("one", 10.79), wd("before?", 10.92)],
  [wd("Claude", 11.36), wd("pulls", 11.7), wd("the", 11.97), wd("real", 12.13, true), wd("numbers", 12.35, true), wd("from", 12.74), wd("SOCIA.", 12.96)],
  [wd("Here's", 13.44), wd("what", 13.78), wd("it", 13.91), wd("found.", 14.0)],
  [wd("One,", 14.4, true), wd("it", 14.81), wd("was", 14.95), wd("seen", 15.19, true), wd("far", 15.51, true), wd("less.", 15.75, true)],
  [wd("Nine", 16.32, true), wd("likes", 16.66), wd("against", 16.9), wd("40,", 17.35, true)],
  [wd("but", 17.83), wd("it", 17.94), wd("reached", 18.01), wd("207", 18.34, true), wd("accounts", 19.02), wd("against", 19.68), wd("1,550.", 20.12, true)],
  [wd("Two,", 21.2, true), wd("the", 21.54), wd("opener.", 21.71, true)],
  [wd("My", 22.32), wd("breakout", 22.45), wd("names", 23.0), wd("a", 23.34), wd("tool,", 23.4, true), wd("an", 23.84), wd("outcome", 23.96, true), wd("and", 24.57), wd("a", 24.68), wd("time", 24.73, true), wd("limit.", 24.95, true)],
  [wd("The", 25.4), wd("flop", 25.59), wd("opens", 25.83), wd("with", 26.14), wd("a", 26.39), wd("story.", 26.45, true)],
  [wd("Three,", 27.0, true), wd("saves.", 27.57, true)],
  [wd("41", 28.24, true), wd("against", 28.7), wd("two.", 29.24, true)],
  [wd("People", 29.75), wd("kept", 30.06, true), wd("the", 30.21), wd("first", 30.36), wd("one.", 30.6)],
  [wd("So", 30.92), wd("my", 31.02), wd("next", 31.12), wd("Reel", 31.33), wd("gets", 31.54), wd("the", 31.75), wd("breakout's", 31.91, true), wd("opener.", 32.44, true)],
];

/** The CTA, spoken and shown big. */
export const CTA: Word[] = [wd("Comment", 33.0), wd("FLOP", 33.51, true), wd("and", 33.92), wd("I'll", 34.13), wd("tell", 34.41), wd("you", 34.69), wd("what", 34.9), wd("to", 35.18), wd("ask", 35.32), wd("Claude", 35.52), wd("about", 35.95), wd("yours.", 36.3)];

export const T = {
  hook2: 2.24, // "Here's the answer..."
  step1: 4.62,
  connect: 5.32,
  toggle: 5.85,
  step2: 6.88,
  typeFrom: 8.44,
  typeTo: 11.15,
  send: 11.25,
  pulls: 11.36,
  toolDone: 12.96,
  answer: 13.44,
  c1: 14.4,
  likes: 16.32,
  reach: 17.94,
  c2: 21.2,
  tool: 23.4,
  outcome: 23.96,
  timebox: 24.73,
  story: 26.14,
  c3: 27.0,
  saves: 28.24,
  kept: 29.75,
  next: 30.92,
  cta: 33.0,
};
