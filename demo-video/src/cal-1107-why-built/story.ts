// Calendar post Sat Nov 7, 6:00 PM: "Why I built an AI strategist instead of hiring one."
// The draft is talk-to-camera; this version is bold kinetic type with the voice-over, no face.
//
// Facts used: Noah builds SOCIA and tests it on a real local pizzeria account (not named).
// No biography, costs, agency quotes or hours saved. The problem lines (guessing what to post,
// numbers spread across apps, no time) are first person and need Noah's check.
// What SOCIA does (reel-bot/daily-ideas.md): reads Instagram, Facebook, YouTube and TikTok in
// one place; finds posts that beat your own average; builds a weekly plan where every post
// lands as a draft; nothing posts until you approve it. "When it doesn't know, it says so":
// the quoted line is the app's own copy (components/ov/PostingHeatmap.tsx) and is what SOCIA
// shows for @socia.appmedia today (get_posting_recommendations, Nov 2).
//
// Times are word starts in audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s,
// atempo 1.177, whisper-cli -ml 1).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 31.0; // the take ends at 29.42 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

/** Each card: lines of words, shown from its first word until the next card starts. */
export type Card = { lines: Word[][]; size: number; top: number; light?: boolean };

export const CARDS: Card[] = [
  { size: 150, top: 520, lines: [[wd("Why", 0.0), wd("I", 0.2)], [wd("built", 0.34)], [wd("an", 0.82), wd("AI", 1.0, true)], [wd("strategist,", 1.18, true)]] },
  { size: 104, top: 640, lines: [[wd("instead", 2.23)], [wd("of", 2.62), wd("hiring", 2.73)], [wd("one.", 3.06)]] },
  { size: 84, top: 470, lines: [[wd("Every", 3.24), wd("week,", 3.57)], [wd("the", 3.97), wd("same", 4.17), wd("question.", 4.44)]] },
  { size: 190, top: 700, lines: [[wd("What", 5.2)], [wd("do", 5.48), wd("I", 5.62)], [wd("post?", 5.71, true)]] },
];

export const T = {
  scattered: 6.2,
  scatterWord: 6.91,
  views: 7.56,
  comments: 8.64,
  notes: 9.68,
  noTime: 10.72,
  build: 12.44,
  socia: 13.61,
  test: 14.14,
  pizzeria: 15.11,
  reads: 16.68,
  finds: 18.76,
  plans: 20.84,
  nothing: 22.52,
  approve: 23.85,
  honest: 24.6,
  says: 25.71,
  less: 26.32,
  more: 27.14,
  end: 28.04,
  soon: 28.43,
};

export const SCATTER = {
  line: [wd("The", 6.2), wd("answers", 6.35), wd("were", 6.71), wd("scattered.", 6.91, true)],
  chips: [
    { label: "Views", sub: "in one app", at: 7.56, x: 90, y: 760, rot: -7 },
    { label: "Comments", sub: "in another", at: 8.64, x: 520, y: 900, rot: 6 },
    { label: "Notes", sub: "in a third", at: 9.68, x: 160, y: 1080, rot: -3 },
  ],
  noTime: [wd("And", 10.72), wd("no", 10.91, true), wd("time", 11.06, true), wd("to", 11.33), wd("line", 11.45), wd("it", 11.83), wd("all", 11.85), wd("up.", 12.05)],
};

export const BUILD = {
  line1: [wd("So", 12.44), wd("I'm", 12.75), wd("building", 12.98)],
  line2: [wd("and", 14.14), wd("I", 14.29), wd("test", 14.35, true), wd("it", 14.59), wd("on", 14.68), wd("a", 14.8), wd("real", 14.86, true), wd("local", 15.11, true), wd("pizzeria's", 15.42, true), wd("account.", 16.06)],
};

export const DOES = [
  { n: "1", words: [wd("It", 16.68), wd("reads", 16.82, true), wd("your", 17.19), wd("posts", 17.45), wd("in", 17.8), wd("one", 17.94, true), wd("place.", 18.15, true)] },
  { n: "2", words: [wd("It", 18.76), wd("finds", 18.86, true), wd("the", 19.12), wd("ones", 19.28), wd("that", 19.49), wd("beat", 19.7, true), wd("your", 19.91), wd("own", 20.14, true), wd("average.", 20.28, true)] },
  { n: "3", words: [wd("It", 20.84), wd("plans", 20.98, true), wd("your", 21.35), wd("week", 21.63), wd("as", 21.92), wd("drafts.", 22.05, true)] },
];
export const NOTHING = [wd("Nothing", 22.69, true), wd("posts", 23.1), wd("until", 23.42), wd("you", 23.68), wd("approve", 23.85, true), wd("it.", 24.27)];

export const HONEST = [wd("And", 24.6), wd("when", 24.75), wd("it", 24.95), wd("doesn't", 25.05, true), wd("know,", 25.41, true), wd("it", 25.71), wd("says", 25.81), wd("so.", 26.01)];
export const LESS = [[wd("Less", 26.32), wd("guessing.", 26.56)], [wd("More", 27.14, true), wd("posting.", 27.38, true)]];

export const PLATFORMS = ["Instagram", "Facebook", "YouTube", "TikTok"];
