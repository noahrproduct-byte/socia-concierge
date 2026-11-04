// Calendar post Thu Nov 5, 6:00 PM: "Ask Claude why your last Reel flopped. The answer surprised me."
// Same flop as cal-1102, told through the surprise (it was liked more per person, seen by fewer,
// posted the same evening as the breakout) and what Claude suggests changing.
//
// The answer is real: Claude called SOCIA's MCP tools (get_top_posts, get_content_plan,
// get_performance_insights, get_posting_recommendations) on workspace
// 76cbbf46-2622-4864-9515-650d2974edd3 at 2026-11-03 00:43 UTC and answered the on-screen question
// from those results only. Times are CST. The double-post pairs (47/7, 17/8, 18/8, likes + comments)
// are quoted from the Content Plan generated Nov 2. Word times are starts in audio/vo.mp3 (Declan
// Sage take b, silences cut to 0.2 s, atempo 1.12, whisper-cli -ml 1, checked against silencedetect).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 39.6; // the take ends at 37.86 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const SOURCE = "SOCIA Analytics · @socia.appmedia · Nov 2";
export const PLAN_SOURCE = "SOCIA Content Plan · Nov 2 · likes + comments when the plan was made";
export const QUESTION = "Why did my last Reel flop?";

export const BREAKOUT = { title: "Connect Claude to your Instagram in 60 seconds", time: "7:22 PM", reach: 1550, likes: 40, rate: 2.6 };
export const FLOP = { title: "One reel went viral. The other flopped...", time: "10:45 PM", reach: 207, likes: 9, rate: 4.3 };
/** Content Plan: "on all three days you posted twice, the later post did less than half as well (7 vs 47, 8 vs 17, 8 vs 18)". */
export const PAIRS = [
  { first: 47, second: 7 },
  { first: 17, second: 8 },
  { first: 18, second: 8 },
];

export const PHRASES: Word[][] = [
  [wd("I", 3.6), wd("thought", 3.66), wd("it", 4.08), wd("was", 4.2), wd("the", 4.38), wd("hook.", 4.56, true)],
  [wd("Claude", 5.0), wd("found", 5.35), wd("something", 5.53, true), wd("else.", 5.96, true)],
  [wd("Per", 6.32), wd("person", 6.52, true), wd("who", 6.92), wd("saw", 7.12), wd("it,", 7.32)],
  [wd("the", 7.6), wd("flop", 7.8), wd("got", 8.07), wd("more", 8.26, true), wd("likes", 8.72, true), wd("than", 8.92), wd("my", 9.19), wd("breakout.", 9.32)],
  [wd("4.3%", 10.0, true), wd("against", 11.32), wd("2.6%.", 11.81, true)],
  [wd("The", 12.72), wd("difference", 12.94), wd("was", 13.69), wd("how", 13.91, true), wd("many", 14.13, true), wd("people", 14.43), wd("saw", 14.88), wd("it.", 15.12)],
  [wd("207", 15.4, true), wd("against", 16.07), wd("1,550.", 16.59, true)],
  [wd("And", 17.86), wd("look", 17.96), wd("when", 18.11, true), wd("it", 18.28), wd("went", 18.34), wd("out.", 18.52)],
  [wd("The", 19.0), wd("same", 19.24, true), wd("evening.", 19.56, true)],
  [wd("Three", 20.36, true), wd("hours", 20.71, true), wd("and", 20.9), wd("20", 21.06, true), wd("minutes", 21.38, true), wd("after", 21.76), wd("the", 22.03), wd("breakout.", 22.09)],
  [wd("SOCIA's", 22.76), wd("plan", 23.15), wd("says", 23.42), wd("it's", 23.69), wd("a", 24.0), wd("pattern.", 24.01, true)],
  [wd("On", 24.72), wd("every", 24.86), wd("day", 25.21), wd("I", 25.42), wd("posted", 25.49), wd("twice,", 25.91, true)],
  [wd("the", 26.4), wd("second", 26.61), wd("post", 27.12), wd("did", 27.31), wd("less", 27.52, true), wd("than", 27.8, true), wd("half", 28.08, true), wd("as", 28.36), wd("well.", 28.56)],
  [wd("So", 29.07), wd("what", 29.15), wd("does", 29.39), wd("Claude", 29.61), wd("say", 29.96), wd("to", 30.13), wd("change?", 30.24, true)],
  [wd("One", 30.8, true), wd("post", 31.05, true), wd("a", 31.38), wd("day.", 31.46), wd("Five", 31.87, true), wd("a", 32.2), wd("week.", 32.28)],
  [wd("Give", 32.8), wd("every", 33.2), wd("Reel", 33.54), wd("its", 33.87, true), wd("own", 34.12, true), wd("day.", 34.44, true)],
  [wd("And", 34.76), wd("open", 34.91), wd("the", 35.11), wd("way", 35.31), wd("the", 35.56), wd("breakout", 35.6, true), wd("did.", 35.96)],
  [wd("SOCIA", 36.96, true), wd("is", 37.1), wd("coming", 37.17), wd("soon.", 37.41)],
];

export const T = {
  surprised: 2.44,
  guess: 3.6,
  strike: 4.56,
  chat: 5.0,
  answer: 6.32,
  more: 8.26,
  rateFlop: 9.7,
  rateBreak: 11.32,
  seen: 12.72,
  n207: 15.4,
  n1550: 16.59,
  dusk: 17.86,
  same: 19.24,
  hours: 20.36,
  plan: 22.76,
  pairs: [25.0, 25.5, 26.0],
  half: 27.52,
  change: 29.07,
  items: [30.8, 32.8, 34.76],
  end: 36.9,
};
