// Calendar post Sun Nov 8, 11:00 AM CST: "My content calendar before SOCIA, and after."
// Before: an EXAMPLE empty week. After: the real SOCIA Calendar for the Socia workspace, read with
// get_scheduled_posts (workspace 76cbbf46-2622-4864-9515-650d2974edd3, 2026-11-02 to 2026-11-09,
// include_published, read 2026-11-03 00:43 UTC). UTC times converted to America/Chicago (CST, UTC-6
// since Nov 1); only posts that fall Mon Nov 2 to Sun Nov 8 local are shown: 14, all drafts on
// Instagram. Titles are verbatim (cut off by the chip width only). Times are word starts in
// audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s, atempo 1.3, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 25.2; // the take ends at 23.95 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const SOURCE = "SOCIA Calendar · @socia.appmedia · Nov 2 to 8 · Central time";

export const T = {
  before: 2.44,
  after: 5.96,
  count: 8.56,
  days: 9.45,
  times: 11.26,
  hooks: 11.86,
  mon: 12.36,
  wed: 15.08,
  sun: 17.36,
  draft: 19.0,
  approve: 20.76,
  end: 22.8,
  soon: 23.22,
};

export const PHRASES: Word[][] = [
  [wd("My", 0.0), wd("content", 0.14), wd("calendar", 0.56), wd("before", 1.07, true), wd("SOCIA,", 1.45), wd("and", 1.8), wd("after.", 2.04, true)],
  [wd("Before:", 2.44, true), wd("a", 3.01), wd("blank", 3.08, true), wd("week,", 3.51)],
  [wd("and", 3.76), wd("one", 3.93), wd("sticky", 4.21), wd("note", 4.44), wd("that", 4.68), wd("says", 4.89), wd("\"post", 5.1, true), wd("something.\"", 5.31, true)],
  [wd("After:", 5.96, true), wd("this", 6.38), wd("is", 6.62), wd("my", 6.74), wd("real", 6.86, true), wd("SOCIA", 7.1), wd("Calendar", 7.4), wd("for", 7.92), wd("this", 8.04), wd("week.", 8.2)],
  [wd("14", 8.56, true), wd("posts,", 8.95, true), wd("Monday", 9.45), wd("to", 9.8), wd("Sunday,", 9.93)],
  [wd("each", 10.36), wd("with", 10.6), wd("a", 10.86), wd("day,", 10.9, true), wd("a", 11.2), wd("time", 11.26, true), wd("and", 11.62), wd("a", 11.8), wd("hook.", 11.86, true)],
  [wd("Monday", 12.36, true), wd("at", 12.71), wd("noon:", 12.86, true), wd("ask", 13.2), wd("Claude", 13.43), wd("why", 13.71), wd("your", 13.9), wd("last", 14.14), wd("Reel", 14.38), wd("flopped.", 14.62)],
  [wd("Wednesday", 15.08, true), wd("at", 15.63), wd("six:", 15.75, true), wd("my", 16.15), wd("whole", 16.17), wd("content", 16.47), wd("week.", 16.9)],
  [wd("Sunday", 17.36, true), wd("at", 17.71), wd("eleven:", 17.84, true), wd("this", 18.28), wd("video.", 18.51, true)],
  [wd("Every", 19.0), wd("single", 19.32), wd("one", 19.71), wd("is", 19.9), wd("still", 20.07), wd("a", 20.35), wd("draft,", 20.4, true)],
  [wd("because", 20.76), wd("nothing", 21.14, true), wd("posts", 21.52), wd("until", 21.83), wd("I", 22.06), wd("approve", 22.11, true), wd("it.", 22.53)],
];

export type Post = { time: string; title: string; mark?: "mon" | "wed" | "sun" };
/** get_scheduled_posts, Monday Nov 2 to Sunday Nov 8 in Central time. All status "draft", Instagram. */
export const WEEK: { day: string; date: string; posts: Post[] }[] = [
  { day: "Mon", date: "Nov 2", posts: [
    { time: "12:00 PM", title: "Ask Claude why your last Reel flopped. Here's the answer it gave me in 45 seconds.", mark: "mon" },
    { time: "7:00 PM", title: "Drop your handle below. I'll run it through SOCIA and reply with the one post you should make next." },
  ] },
  { day: "Tue", date: "Nov 3", posts: [
    { time: "11:00 AM", title: "I connected Claude to my Instagram. Here's the first thing it told me." },
  ] },
  { day: "Wed", date: "Nov 4", posts: [
    { time: "11:00 AM", title: "This Reel got 32 saves. Here's what Claude said made it different." },
    { time: "6:00 PM", title: "Here's my whole content week, planned from my own Instagram data.", mark: "wed" },
    { time: "7:00 PM", title: "Get next week's content plan from your own Instagram data in 60 seconds. Here's the exact prompt." },
  ] },
  { day: "Thu", date: "Nov 5", posts: [
    { time: "11:00 AM", title: "You dropped your handle. Here's what SOCIA found." },
    { time: "6:00 PM", title: "Ask Claude why your last Reel flopped. The answer surprised me." },
  ] },
  { day: "Fri", date: "Nov 6", posts: [
    { time: "11:00 AM", title: "Same idea, three hooks. Which one would stop your scroll?" },
    { time: "6:00 PM", title: "Paste in a weak caption, get a sharper one out." },
  ] },
  { day: "Sat", date: "Nov 7", posts: [
    { time: "11:00 AM", title: "Want to see what's working for accounts like yours?" },
    { time: "6:00 PM", title: "Why I built an AI strategist instead of hiring one." },
  ] },
  { day: "Sun", date: "Nov 8", posts: [
    { time: "11:00 AM", title: "My content calendar before SOCIA, and after.", mark: "sun" },
    { time: "6:00 PM", title: "Likes feel good. Saves tell you what people want to keep." },
  ] },
];
