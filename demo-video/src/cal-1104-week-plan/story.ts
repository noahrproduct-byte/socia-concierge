// Calendar post Wed Nov 4, 6:00 PM CST: "Here's my whole content week, planned from my own
// Instagram data." Walks through SOCIA's real weekly Content Plan for @socia.appmedia, read with
// get_content_plan (workspace 76cbbf46-2622-4864-9515-650d2974edd3, plan e49ad568, generated
// 2026-11-02 13:22 UTC, read 2026-11-03 00:43 UTC). Hooks and fixes are shortened, never changed
// in meaning. Times are word starts in audio/vo.mp3 (Declan Sage take b, silences cut to 0.2 s,
// atempo 1.3, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 37.7; // the take ends at 36.36 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const SOURCE = "SOCIA Content Plan · @socia.appmedia · generated Nov 2";

export const T = {
  hook: [0.03, 0.24, 0.35, 0.49, 0.76, 1.17], // here's my whole content week,
  hook2: [1.46, 1.83, 2.04, 2.14, 2.29, 2.91], // planned from my own Instagram data.
  plan: 3.18,
  diag: 5.52,
  health: 7.4,
  formula: 8.74,
  burying: 12.95,
  fixes: 13.62,
  fix: [14.78, 16.94, 18.46],
  week: 20.98,
  days: { Tuesday: 21.7, Wednesday: 23.94, Thursday: 26.26, Friday: 27.62, Sunday: 29.25 } as Record<string, number>,
  drafts: 31.74,
  approve: 33.54,
  end: 35.14,
  soon: 35.63,
};

/** The dark stretch: the diagnosis. */
export const DARK: [number, number][] = [[T.diag, T.fixes]];

export const PHRASES: Word[][] = [
  [wd("This", 3.18), wd("is", 3.39), wd("SOCIA's", 3.49, true), wd("weekly", 3.84), wd("content", 4.16, true), wd("plan", 4.63, true), wd("for", 4.8), wd("my", 4.95), wd("account.", 5.03)],
  [wd("First,", 5.52), wd("the", 6.01), wd("diagnosis.", 6.18, true)],
  [wd("Health:", 6.97), wd("34", 7.4, true), wd("out", 7.74), wd("of", 7.91), wd("100.", 8.01)],
  [wd("One", 8.74), wd("formula", 8.94, true), wd("works,", 9.4), wd("the", 9.88), wd("Connect", 10.19, true), wd("Claude", 10.45, true), wd("tutorial,", 10.67)],
  [wd("and", 11.14), wd("the", 11.3), wd("recycled", 11.46), wd("\"stop", 11.89, true), wd("guessing\"", 12.1, true), wd("opener", 12.59), wd("is", 12.85), wd("burying", 12.95), wd("it.", 13.32)],
  [wd("So,", 13.62), wd("three", 13.88, true), wd("fixes.", 14.22, true)],
  [wd("Build", 14.78), wd("every", 15.06), wd("Reel", 15.34), wd("on", 15.56), wd("the", 15.67), wd("formula", 15.84, true), wd("that", 16.23), wd("broke", 16.45, true), wd("out.", 16.73, true)],
  [wd("Post", 16.94), wd("at", 17.27), wd("most", 17.43, true), wd("once", 17.76, true), wd("a", 18.09), wd("day.", 18.19, true)],
  [wd("And", 18.46), wd("end", 18.63), wd("with", 18.8), wd("a", 19.03), wd("question", 19.08, true), wd("people", 19.57), wd("can", 19.91), wd("answer", 19.98, true), wd("in", 20.26), wd("the", 20.35), wd("comments.", 20.53)],
  [wd("Then", 20.98), wd("the", 21.19), wd("week.", 21.37, true)],
  [wd("Tuesday:", 21.7, true), wd("ask", 22.24), wd("Claude", 22.43), wd("why", 22.79), wd("a", 23.03), wd("Reel", 23.05), wd("flopped.", 23.28)],
  [wd("Wednesday:", 23.94, true), wd("a", 24.5), wd("carousel", 24.55), wd("that", 24.97), wd("audits", 25.19), wd("my", 25.45), wd("own", 25.55), wd("account.", 25.71)],
  [wd("Thursday:", 26.26, true), wd("drop", 26.76), wd("your", 26.96), wd("handle.", 27.16)],
  [wd("Friday:", 27.62, true), wd("the", 28.12), wd("exact", 28.31), wd("prompt.", 28.65)],
  [wd("Sunday:", 29.25, true), wd("two", 29.78), wd("Reels,", 29.99), wd("same", 30.48), wd("day,", 30.76), wd("here's", 31.14), wd("why.", 31.43)],
  [wd("They", 31.74), wd("land", 31.97), wd("on", 32.23), wd("my", 32.31), wd("Calendar", 32.42, true), wd("as", 32.87), wd("drafts,", 32.99, true)],
  [wd("and", 33.38), wd("nothing", 33.54, true), wd("posts", 33.91), wd("until", 34.17), wd("I", 34.44), wd("approve", 34.48, true), wd("it.", 34.85)],
];

// ── The plan, as get_content_plan returned it ─────────────────────────────

export const TABS = ["01 Overview", "02 Account audit", "03 Competitor insights", "04 Growth strategy", "05 Weekly plan"];

/** plan.headline, verbatim. */
export const HEADLINE_SCORE = 34;
export const HEADLINE_REST = "your 'Connect Claude in 60 seconds' tutorial is the one formula that works, and the recycled 'Stop guessing what to post' ad is burying it.";

/** plan.top_fixes, shortened. */
export const FIXES = [
  { title: "Build every Reel on the formula that worked", body: "Named tool + specific outcome + time box. Proof on screen. Name SOCIA after the result. Retire 'Stop guessing what to post'." },
  { title: "Post at most once a day, 5 times a week", body: "Every double-post day produced a weak second post." },
  { title: "End with a CTA people can answer in comments", body: "Then post the same file to TikTok, YouTube Shorts and Facebook Reels." },
];

/** plan.posts, Monday first. Hooks shortened (Thursday drops "run it through SOCIA and"); the real status per post. */
export const WEEK = [
  { day: "Monday" },
  { day: "Tuesday", hook: "Ask Claude why your last Reel flopped.", format: "Reel", conf: "Above your median", status: "Draft" },
  { day: "Wednesday", hook: "Our account has 26 followers. We asked our own AI strategist to audit it.", format: "Carousel", conf: "Experiment", status: "Not scheduled" },
  { day: "Thursday", hook: "Drop your handle below. I'll reply with the one post you should make next.", format: "Reel", conf: "Experiment", status: "Draft" },
  { day: "Friday", hook: "Get next week's content plan from your own Instagram data in 60 seconds.", format: "Reel", conf: "Above your median", status: "Draft" },
  { day: "Saturday" },
  { day: "Sunday", hook: "Two Reels. Same day. Here's why.", format: "Animated Reel", conf: "High confidence", status: "Not scheduled" },
] as { day: string; hook?: string; format?: string; conf?: string; status?: string }[];

/** weekSummary() from components/plan/PlanSections.tsx, applied to this plan. */
export const WEEK_LINE = "5 posts, Tuesday to Sunday. 3 Reels, 1 Carousel, 1 Animated Reel.";
