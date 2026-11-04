// "Launch calendar" v4 (adds a feature section per Noah, "add the other features"): Noah's launch script (Telegram, 2026-11-03) plus his additions: sound
// (Declan voice-over), the connector loop (add SOCIA to Claude as a connector; SOCIA hands Claude
// the ideas, formats and hooks for the week; Claude makes the videos and gives them back; SOCIA
// schedules them), an eye-catching hook, and the close "follow and comment LINK, I'll DM you the
// link". No music. Times are word starts in audio/vo.mp3 (v4 take b, silences cut to 0.2 s,
// atempo 1.1, whisper-cli -ml 1).
// Honesty: the hook is true (this week's calendar Reels were built by Claude from SOCIA's
// calendar drafts, demo-video/reel-bot/calendar-videos.json). "Without doing anything" became
// "you just tap approve": nothing posts until it's approved. The cards are the Socia workspace's
// real drafts for the week of Nov 2; the stats are real (SOCIA MCP, 2026-11-03). SOCIA50 is
// Noah's launch code, his word.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 36.2; // the take ends at 34.8 s
export const TOTAL_FRAMES = Math.round(END * FPS);

/** [word, start, accent?]. Groups replace each other; words ease in. */
export type Word = [string, number, boolean?];
export const GROUPS: Word[][] = [
  [["I", 0.06], ["didn't", 0.06], ["make", 0.45], ["a", 0.71], ["single", 0.77, true], ["one", 1.16, true], ["of", 1.35], ["this", 1.53], ["week's", 1.75], ["Reels.", 2.13]],
  [["Blank", 2.64, true], ["calendar,", 2.93], ["no", 3.52, true], ["ideas?", 3.69]],
  [["Here's", 4.38], ["the", 4.66], ["trick.", 4.8, true]],
  [["Add", 5.22], ["SOCIA", 5.44, true], ["to", 5.79], ["Claude", 5.93, true], ["as", 6.37], ["a", 6.51], ["connector.", 6.58, true]],
  [["SOCIA", 7.5, true], ["reads", 7.82], ["your", 8.14], ["Instagram", 8.4], ["data", 8.98]],
  [["and", 9.26], ["hands", 9.46], ["Claude", 9.8, true]],
  [["the", 10.18], ["ideas,", 10.38, true], ["formats", 10.86, true], ["and", 11.42], ["hooks", 11.59, true], ["for", 11.88], ["the", 12.05], ["whole", 12.22], ["week.", 12.51]],
  [["Claude", 12.94, true], ["makes", 13.35], ["every", 13.69], ["video,", 14.03, true]],
  [["then", 14.48], ["gives", 14.69], ["them", 14.94], ["back", 15.13, true], ["to", 15.33], ["SOCIA.", 15.42]],
  [["SOCIA", 15.86, true], ["schedules", 16.11, true], ["them", 16.6], ["out.", 16.82]],
  [["You", 17.18], ["just", 17.37], ["tap", 17.62], ["approve.", 17.81, true]],
  [["And", 18.4], ["that's", 18.56], ["not", 18.87, true], ["all.", 19.03, true]],
  [["SOCIA", 19.38, true], ["has", 19.75], ["an", 19.98], ["AI", 20.13, true], ["music", 20.28, true], ["generator,", 20.67, true]],
  [["a", 21.59], ["video", 21.66, true], ["editor,", 22.07, true]],
  [["Ask", 22.58, true], ["SOCIA,", 22.86, true], ["your", 23.35], ["AI", 23.63], ["assistant,", 23.77]],
  [["trending", 24.58, true], ["Reels", 25.04], ["in", 25.32], ["your", 25.43], ["niche,", 25.66]],
  [["a", 26.11], ["caption", 26.16, true], ["writer,", 26.61], ["Trial", 27.14, true], ["Reels,", 27.51, true]],
  [["and", 28.03], ["it", 28.25], ["tracks", 28.4, true], ["every", 28.84], ["view.", 29.22, true]],
  [["Launch", 29.84], ["promo", 30.21], ["code", 30.57], ["SOCIA50", 30.86, true], ["is", 31.67], ["live.", 31.78]],
  [["Follow", 32.34, true], ["and", 32.66], ["comment", 32.82], ["LINK,", 33.19, true]],
  [["and", 33.52], ["I'll", 33.7], ["DM", 33.96, true], ["you", 34.09], ["the", 34.27], ["link.", 34.46]],
];

export const T = {
  hookFill: 0.1,
  hookStep: 0.13,
  stamp: 1.16,
  blank: 2.64,
  note: 3.52,
  connector: 5.22,
  toggle: 6.58,
  reads: 7.5,
  stats: [8.1, 8.55, 9.0],
  hands: 9.46,
  chips: [10.38, 10.86, 11.59],
  makes: 12.94,
  videos: 13.69,
  back: 14.69,
  schedules: 15.86,
  dropStep: 0.12,
  approve: 17.81,
  more: 18.4,
  features: [20.13, 21.66, 22.58, 24.58, 26.16, 27.14, 28.4],
  promo: 29.84,
  code: 30.86,
  live: 31.78,
  follow: 32.34,
  link: 32.82,
  linkType: 33.19,
  post: 33.6,
  dm: 33.96,
};

/** Real SOCIA features (demo-video/reel-bot/daily-ideas.md + memory notes). */
export const FEATURES = ["AI music generator", "Video editor", "Ask SOCIA, your AI assistant", "Trending Reels in your niche", "Caption writer", "Trial Reels", "Tracks every view, save and share"];

/** Real drafts, Socia workspace calendar, week of Nov 2 (one per day). */
export const DAYS = [
  { d: "Mon", n: "Nov 2", hook: "Drop your handle below", time: "7:00 PM" },
  { d: "Tue", n: "Nov 3", hook: "I connected Claude to my Instagram", time: "11:00 AM" },
  { d: "Wed", n: "Nov 4", hook: "My whole content week, planned", time: "6:00 PM" },
  { d: "Thu", n: "Nov 5", hook: "Why my last Reel flopped", time: "6:00 PM" },
  { d: "Fri", n: "Nov 6", hook: "Same idea, three hooks", time: "11:00 AM" },
  { d: "Sat", n: "Nov 7", hook: "What's working for accounts like yours?", time: "11:00 AM" },
  { d: "Sun", n: "Nov 8", hook: "My calendar, before and after", time: "11:00 AM" },
];
export const STATS = ["11 Reels, last 30 days", "Top reel: 1,958 views", "9.6× our median"];
export const PROMO = "SOCIA50";
