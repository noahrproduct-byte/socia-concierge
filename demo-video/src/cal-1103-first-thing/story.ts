// Calendar post Tue Nov 3, 11:00 AM: "I connected Claude to my Instagram. Here's the first thing it
// told me." Claude's first account-level finding: one opener reused, and every repeat did worse.
//
// The answer is real: Claude called SOCIA's MCP tools (get_top_posts, get_content_plan,
// get_performance_insights) on workspace 76cbbf46-2622-4864-9515-650d2974edd3 at 2026-11-03 00:43
// UTC and answered the on-screen question from those results only. By title, 5 of the 9 Reels open
// with "stop guessing" (the Content Plan's "6 of 9" was corrected); the chart shows all 5 in date
// order, including the Oct 31 bounce to 21. Interactions = likes + comments + saves + shares. Dates are America/Chicago.
// Times are word starts in audio/vo.mp3 (Declan Sage take d, re-recorded for the 5-of-9 correction, silences cut to 0.2 s, atempo 1.2,
// whisper-cli -ml 1, checked against silencedetect).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 31.1; // the take ends at 29.26 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const SOURCE = "SOCIA Analytics · @socia.appmedia · Nov 2";
export const QUESTION = "What's the first thing you notice about my account?";

/** The 9 Reels of the last 30 days, oldest first, as get_top_posts returned them. */
export const REELS = [
  { date: "Oct 27", title: "Stop guessing what to post.", v: 75, opener: true },
  { date: "Oct 27", title: "I stopped guessing what to post. SOCIA audits...", v: 27, opener: true },
  { date: "Oct 28", title: "I stopped guessing what to post.", v: 10, opener: true },
  { date: "Oct 29", title: "Stop guessing what to post.", v: 9, opener: true },
  { date: "Oct 29", title: "Connect Claude to your Instagram. SOCIA reads...", v: 20, opener: false },
  { date: "Oct 30", title: "If you're a growing content creator, use these 3 tools...", v: 11, opener: false },
  { date: "Oct 31", title: "Stop guessing what to post.", v: 21, opener: true },
  { date: "Nov 1", title: "Connect Claude to your Instagram in 60 seconds...", v: 118, opener: false },
  { date: "Nov 1", title: "One reel went viral. The other flopped...", v: 13, opener: false },
];
export const SERIES = REELS.filter((r) => r.opener); // 75, 27, 10, 9, 21

export const PHRASES: Word[][] = [
  [wd("I", 3.08), wd("asked:", 3.18), wd("what's", 3.94), wd("the", 4.1), wd("first", 4.18, true), wd("thing", 4.32, true), wd("you", 4.48), wd("notice", 4.79), wd("about", 4.92), wd("my", 5.18), wd("account?", 5.28)],
  [wd("It", 5.88), wd("read", 6.09), wd("my", 6.77), wd("last", 6.87), wd("nine", 7.08, true), wd("Reels", 7.29, true), wd("through", 7.59), wd("SOCIA.", 7.96)],
  [wd("Five", 8.41, true), wd("of", 8.63), wd("them", 8.74), wd("open", 8.96), wd("with", 9.18), wd("the", 9.41), wd("same", 9.56, true), wd("line.", 9.78, true)],
  [wd("Stop", 10.26), wd("guessing", 10.57), wd("what", 11.01), wd("to", 11.26), wd("post.", 11.38)],
  [wd("The", 11.9), wd("first", 12.09), wd("one", 12.42), wd("got", 12.65), wd("75", 12.82, true), wd("interactions.", 13.22)],
  [wd("Then", 14.29), wd("the", 14.5), wd("repeats.", 14.66), wd("27.", 15.18, true), wd("10.", 16.0, true), wd("9.", 16.56, true), wd("21.", 17.25, true)],
  [wd("Not", 17.94), wd("one", 18.12), wd("came", 18.31), wd("close", 18.56, true), wd("to", 18.87), wd("the", 18.99), wd("first.", 19.18, true)],
  [wd("Claude's", 19.76), wd("advice:", 20.13), wd("retire", 20.66, true), wd("that", 21.04, true), wd("line", 21.29, true)],
  [wd("and", 21.56), wd("build", 21.74), wd("every", 22.04), wd("Reel", 22.34), wd("like", 22.7), wd("my", 22.82), wd("breakout.", 22.94, true)],
  [wd("A", 23.62), wd("named", 23.7, true), wd("tool,", 24.01, true), wd("a", 24.4), wd("clear", 24.46, true), wd("outcome,", 24.79, true), wd("a", 25.38), wd("time", 25.44, true), wd("limit.", 25.7, true)],
  [wd("SOCIA", 26.34, true), wd("is", 26.65), wd("coming", 26.79), wd("soon.", 27.14)],
  [wd("Follow", 27.65, true), wd("to", 27.98), wd("see", 28.11), wd("what", 28.26), wd("happens", 28.48), wd("next.", 28.87)],
];

export const T = {
  hook2: 1.68,
  ask: 3.05,
  typeFrom: 3.4,
  typeTo: 5.5,
  read: 5.88,
  readDone: 7.96,
  six: 8.41, // "Five of them..." the five opener tiles light up
  answer: 9.6, // the grid gives way to Claude's answer
  opener: 10.26,
  chart: 11.85,
  points: [12.82, 15.18, 16.0, 16.56, 17.25],
  close: 17.94,
  advice: 19.7,
  retire: 20.66,
  breakout: 21.74,
  chips: [23.7, 24.46, 25.44],
  end: 26.28,
  follow: 27.65,
};
