// Calendar post Sun Nov 8, 6:00 PM: "Likes feel good. Saves tell you what people want to keep."
// Real comparison from @socia.appmedia, then where SOCIA shows saves and shares per post
// (Analytics > Content Performance > All posts, components/AnalyticsV3.tsx + ContentLibrary.tsx,
// whose columns include Likes, Saves and Shares; this video shows 5 of its columns).
//
// Real data (SOCIA MCP get_top_posts, 30 days, workspace Socia, 2026-11-03 00:43 UTC = Nov 2 CST):
//   Breakout "Connect Claude to your Instagram in 60 seconds" (Nov 1): 40 likes, 41 saves, 18 shares.
//   "Stop guessing what to post." (Oct 27): 23 likes, 5 saves, 27 shares.
//   ROWS = all 9 Reels exactly as get_top_posts returned them (dates in Central time).
// Nothing in this video is an example.
//
// Times are word starts in audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s,
// atempo 1.29, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 32.6; // the take ends at 31.05 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

export const HOOK_A: Word[] = [wd("Likes", 0.0), wd("feel", 0.3), wd("good.", 0.6)];
export const HOOK_B: Word[] = [wd("Saves", 1.12, true), wd("tell", 1.41), wd("you", 1.65), wd("what", 1.81), wd("people", 2.04), wd("want", 2.38), wd("to", 2.52), wd("keep.", 2.67, true)];

export const PHRASES: Word[][] = [
  [wd("Here's", 2.96), wd("my", 3.24), wd("own", 3.33), wd("proof.", 3.47, true)],
  [wd("My", 3.88), wd("best", 4.01, true), wd("Reel", 4.27), wd("got", 4.53), wd("40", 4.73), wd("likes", 5.12)],
  [wd("and", 5.48), wd("41", 5.71, true), wd("saves.", 6.16, true)],
  [wd("18", 6.8, true), wd("people", 7.12), wd("shared", 7.44, true), wd("it.", 7.74)],
  [wd("My", 8.04), wd("October", 8.15), wd("27th", 8.56), wd("Reel?", 9.19)],
  [wd("23", 9.4), wd("likes,", 9.82), wd("27", 10.32, true), wd("shares,", 11.0, true)],
  [wd("and", 11.32), wd("only", 11.53), wd("five", 11.81, true), wd("saves.", 12.09, true)],
  [wd("One", 12.68), wd("got", 12.89), wd("kept.", 13.17, true)],
  [wd("The", 13.52), wd("other", 13.84), wd("got", 13.95), wd("passed", 14.11, true), wd("on.", 14.43, true)],
  [wd("In", 23.4), wd("SOCIA,", 23.52, true), wd("open", 24.02), wd("Analytics,", 24.27, true)],
  [wd("then", 25.0), wd("Content", 25.21, true), wd("Performance.", 25.58, true)],
  [wd("Every", 26.32), wd("post", 26.62), wd("shows", 26.86), wd("its", 27.15), wd("own", 27.47), wd("saves", 27.52, true), wd("and", 27.82), wd("shares.", 28.0, true)],
];
export const CAPTION_SPANS: [number, number][] = [[2.96, 14.72], [23.4, 28.56]];

export const MEANINGS = [
  { icon: "heart", word: "A like", text: "takes half a second.", at: 14.72, textAt: 15.02 },
  { icon: "save", word: "A save", text: "I'll come back to this.", at: 16.2, textAt: 17.28 },
  { icon: "share", word: "A share", text: "someone else needs this.", at: 18.16, textAt: 18.94 },
];

export const TRACK = {
  line1: [wd("So", 20.36), wd("track", 20.48), wd("saves", 20.85, true), wd("and", 21.1), wd("shares", 21.52, true)],
  line2: [wd("on", 21.65), wd("every", 21.77), wd("post.", 22.08)],
  line3: [wd("Not", 22.56), wd("just", 22.72), wd("likes.", 22.94)],
};

export const CTA: Word[] = [wd("Which", 28.56), wd("one", 28.82), wd("do", 28.91), wd("you", 29.05), wd("check", 29.12, true), wd("first?", 29.34, true)];

export const T = {
  proof: 2.96,
  aLikes: 4.73,
  aSaves: 5.71,
  aShares: 6.8,
  bCard: 8.04,
  bLikes: 9.4,
  bShares: 10.32,
  bSaves: 11.81,
  kept: 13.17,
  passed: 14.11,
  meanings: 14.72,
  track: 20.36,
  app: 23.4,
  analytics: 24.27,
  content: 25.21,
  cols: 27.52,
  colShares: 28.0,
  cta: 28.56,
  brand: 29.74,
  soon: 30.21,
};

export const A = { title: "Connect Claude to your Instagram in 60 seconds", date: "Nov 1", likes: 40, saves: 41, shares: 18 };
export const B = { title: "Stop guessing what to post.", date: "Oct 27", likes: 23, saves: 5, shares: 27 };

export const SOURCE = "SOCIA Analytics · @socia.appmedia · as of Nov 2";

/** All 9 Reels, last 30 days, as SOCIA returned them. */
export const ROWS = [
  { title: "Connect Claude to your Instagram in 60 seconds", date: "Nov 1", views: 1826, likes: 40, saves: 41, shares: 18 },
  { title: "Stop guessing what to post.", date: "Oct 27", views: 513, likes: 23, saves: 5, shares: 27 },
  { title: "One reel went viral. The other flopped...", date: "Nov 1", views: 245, likes: 9, saves: 2, shares: 1 },
  { title: "I stopped guessing what to post.", date: "Oct 27", views: 241, likes: 12, saves: 1, shares: 8 },
  { title: "Connect Claude to your Instagram.", date: "Oct 29", views: 176, likes: 8, saves: 3, shares: 0 },
  { title: "If you're a growing content creator...", date: "Oct 30", views: 163, likes: 6, saves: 1, shares: 1 },
  { title: "Stop guessing what to post.", date: "Oct 31", views: 152, likes: 9, saves: 2, shares: 2 },
  { title: "I stopped guessing what to post.", date: "Oct 28", views: 150, likes: 7, saves: 1, shares: 1 },
  { title: "Stop guessing what to post.", date: "Oct 29", views: 144, likes: 9, saves: 0, shares: 0 },
];

export const TABS = ["Overview", "Content Performance", "Audience", "Posting Times", "Growth"];
