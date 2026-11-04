// Calendar post Wed Nov 4, 7:00 PM CST: "Get next week's content plan from your own Instagram
// data in 60 seconds. Here's the exact prompt." The prompt below was run for real on 2026-11-03
// 00:44 UTC by Claude with the SOCIA connector (workspace 76cbbf46-2622-4864-9515-650d2974edd3):
// get_account_analytics (30 d, instagram), get_top_posts (30 d, 10), get_performance_insights
// (30 d), get_posting_recommendations (America/Chicago). ANSWER is that answer, shortened for the
// screen; every number in it is from those tool results. Times are word starts in audio/vo.mp3
// (Declan Sage re-take c with "five times", silences cut to 0.2 s, atempo 1.18, 2.2 s of silence added after
// "Screenshot it now." so the prompt holds on screen, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 43.3; // the take ends at 41.0 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const PROMPT =
  "Use SOCIA to read my Instagram from the last 30 days. Then plan next week: 5 posts, at most one a day. For each post, give me the day, the hook, the format, and which of my own posts it builds on, with that post's real numbers. Only use numbers SOCIA returns, and tell me what it can't measure.";

export const SOURCE = "SOCIA · Instagram @socia.appmedia · last 30 days · Nov 2";

export const T = {
  hook: [0.02, 0.18, 0.42, 0.78, 1.21], // get next week's content plan
  hook2: [1.48, 1.71, 1.95, 2.12, 2.64], // from your own instagram data
  minute: [2.88, 3.24],
  exact: 3.68,
  open: 5.0,
  paste: 6.98,
  shot: 7.72,
  read: 10.92,
  stats: 13.2,
  stat: [13.2, 14.12, 15.6, 16.56], // 9 Reels, 3,610 views, 304, median 20
  plans: 18.12,
  days: [20.52, 23.0, 26.48, 28.4, 30.08], // Mon, Tue, Wed, Thu, Fri
  cant: 33.44,
  cantRows: [33.94, 35.2, 36.3],
  every: 37.96,
  end: 39.8,
  endWords: [39.8, 39.98, 40.27, 40.36, 40.46, 40.61], // the prompt is in the caption.
};

export const PHRASES: Word[][] = [
  [wd("Open", 5.0), wd("Claude", 5.26, true), wd("with", 5.65), wd("SOCIA", 5.91, true), wd("connected,", 6.16), wd("and", 6.8), wd("paste", 6.98, true), wd("this.", 7.28)],
  [wd("Screenshot", 7.72, true), wd("it", 8.32), wd("now.", 8.49)],
  [wd("Claude", 10.92), wd("pulls", 11.31), wd("my", 11.56), wd("real", 11.69, true), wd("numbers", 11.9, true), wd("through", 12.3), wd("SOCIA.", 12.55)],
  [wd("9", 13.2, true), wd("Reels,", 13.54), wd("3,610", 14.12, true), wd("views,", 15.32)],
  [wd("a", 16.04), wd("median", 16.09), wd("of", 16.44), wd("20", 16.56, true), wd("interactions", 16.9), wd("a", 17.61), wd("post.", 17.66)],
  [wd("Then", 18.12), wd("it", 18.42), wd("plans", 18.59), wd("5", 18.94, true), wd("posts,", 19.28, true), wd("one", 19.75), wd("a", 19.97), wd("day.", 20.04)],
  [wd("Monday:", 20.52, true), wd("ask", 21.36), wd("Claude", 21.52), wd("why", 21.85), wd("your", 22.01), wd("last", 22.28), wd("Reel", 22.45), wd("flopped.", 22.67)],
  [wd("That", 23.24), wd("builds", 23.48), wd("on", 23.83), wd("my", 23.95), wd("breakout,", 24.07, true), wd("at", 24.56), wd("5.9×", 24.7, true), wd("my", 25.68), wd("median.", 25.82)],
  [wd("Wednesday:", 26.48, true), wd("comment", 27.09), wd("your", 27.48), wd("handle,", 27.7)],
  [wd("built", 28.04), wd("on", 28.3), wd("the", 28.43), wd("post", 28.56), wd("that", 28.81), wd("got", 29.0), wd("20", 29.2, true), wd("comments.", 29.48, true)],
  [wd("Friday:", 30.08, true), wd("I", 30.61), wd("used", 30.67), wd("the", 30.87), wd("same", 31.07, true), wd("opener", 31.34, true), wd("five", 31.74), wd("times.", 32.01)],
  [wd("Here's", 32.6), wd("what", 32.87), wd("happened.", 33.07)],
  [wd("And", 33.44), wd("it", 33.58), wd("tells", 33.67), wd("me", 33.91), wd("what", 34.0), wd("it", 34.21), wd("can't", 34.28, true), wd("measure", 34.51, true), wd("yet.", 34.85)],
  [wd("There's", 35.2), wd("no", 35.67, true), wd("best", 35.79, true), wd("time", 36.06, true), wd("to", 36.36), wd("post", 36.46)],
  [wd("until", 36.76), wd("I", 37.0), wd("have", 37.05), wd("more", 37.25), wd("history.", 37.45, true)],
  [wd("Every", 37.96), wd("number", 38.24, true), wd("is", 38.6), wd("from", 38.73), wd("my", 38.92), wd("own", 39.03, true), wd("account.", 39.2, true)],
];

export const TOOLS = ["get_account_analytics", "get_top_posts", "get_performance_insights", "get_posting_recommendations"];

export const STATS = [
  { v: "9", l: "Reels" },
  { v: "3,610", l: "views" },
  { v: "304", l: "interactions" },
  { v: "20", l: "median per post" },
];

/** Claude's real answer, shortened. */
export const ANSWER = [
  { day: "Mon", hook: "Ask Claude why your last Reel flopped. Answer in 45 seconds.", from: "\"Connect Claude to your Instagram in 60 seconds\": 1,826 views, 118 interactions, 5.9× your median" },
  { day: "Tue", hook: "My best Reel got more saves than likes. Here's what it did.", from: "the same post: 41 saves, 40 likes" },
  { day: "Wed", hook: "Comment your handle and I'll reply with your next post.", from: "\"Stop guessing what to post.\" (Oct 27): 20 comments, 27 shares, 3.75×" },
  { day: "Thu", hook: "Next week's plan from your own data. Here's the prompt.", from: "your breakout's formula: named tool, specific outcome, time box" },
  { day: "Fri", hook: "I used the same opener 5 times. Here's what happened.", from: "your \"stop guessing\" Reels: 513 views on the first, then 241, 150, 144, 152" },
];

export const CANT = [
  "Best time to post: your 9 posts don't show a clearly better window yet.",
  "Whether your breakout reached non-followers.",
  "Views per day: Instagram doesn't serve them for this account yet.",
];
