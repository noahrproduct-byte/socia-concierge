// "3 tools" reel (reference: instagram.com/reel/DfFdUJLlSl9, "5 places to get free users",
// studied 2026-10-30, refs/three-tools). Same format: dark hook, lavender list scenes with a
// number tile, a top rail, dark interludes, struck-through closer, Like/Follow end.
// Noah's brief (v2): Claude, ElevenLabs, then SOCIA kept a mystery until the reveal; the hook
// says the last one most people don't know; SOCIA pitched as a fully AI social media strategist. Times are word starts in audio/vo.mp3 (Declan Sage take2-b,
// silences cut to 0.2 s, atempo 1.22, whisper-cli -ml 1). Change copy here.
//
// Honesty: the idea, trends, rater scores and best-time chart are examples and say
// EXAMPLE; no follower or growth numbers. SOCIA is "coming soon", no site.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 43.9; // the take ends at 42.9 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Word = { w: string; t: number; em?: boolean };
const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

/** Top caption: one phrase at a time, words revealed on their start. */
export const PHRASES: Word[][] = [
  [wd("If", 0.02), wd("you're", 0.15), wd("a", 0.43), wd("growing", 0.48, true), wd("content", 0.87), wd("creator,", 1.26, true)],
  [wd("use", 1.8), wd("these", 1.97), wd("three", 2.31, true), wd("tools.", 2.58, true)],
  [wd("The", 3.08), wd("last", 3.25, true), wd("one,", 3.47), wd("most", 3.75), wd("people", 3.97), wd("don't", 4.31), wd("even", 4.75), wd("know", 4.81, true), wd("exists.", 5.05, true)],
  [wd("You", 5.6), wd("film,", 5.8), wd("edit,", 6.2), wd("post,", 6.6)],
  [wd("and", 7.0), wd("get", 7.27), wd("four", 7.4, true), wd("likes.", 7.67, true)],
  [wd("One", 8.28), wd("is", 8.5), wd("your", 8.65), wd("mom.", 8.93, true)],
  [wd("One.", 9.4), wd("Claude.", 9.72, true)],
  [wd("Give", 10.32), wd("it", 10.54), wd("your", 10.65), wd("idea,", 10.87, true)],
  [wd("and", 11.09), wd("it", 11.25), wd("writes", 11.36), wd("the", 11.72), wd("script,", 11.99, true), wd("the", 12.32), wd("hook,", 12.49, true), wd("and", 12.79), wd("the", 12.95), wd("caption.", 13.11, true)],
  [wd("Then", 13.68), wd("it", 13.92), wd("builds", 14.05, true), wd("the", 14.4), wd("video", 14.57)],
  [wd("and", 14.88), wd("animates", 15.06, true), wd("every", 15.54), wd("scene.", 15.84)],
  [wd("Two.", 16.36), wd("ElevenLabs.", 16.69, true)],
  [wd("Paste", 17.6), wd("your", 17.85), wd("script,", 18.05, true), wd("pick", 18.48), wd("a", 18.72), wd("voice,", 18.79, true)],
  [wd("and", 19.27), wd("your", 19.31), wd("voice-over", 19.47, true), wd("is", 19.91), wd("done.", 19.97)],
  [wd("No", 20.44), wd("mic,", 20.61, true), wd("no", 20.99), wd("retakes.", 21.15, true)],
  [wd("Three.", 21.96)],
  [wd("This", 22.34), wd("one", 22.51), wd("is", 22.67), wd("different.", 22.76, true)],
  [wd("It's", 23.4), wd("a", 23.66), wd("fully", 23.72, true), wd("AI", 24.05, true), wd("social", 24.18), wd("media", 24.56), wd("strategist.", 25.07, true)],
  [wd("It", 25.8), wd("analyzes", 25.95, true), wd("everything", 26.35, true), wd("for", 26.9), wd("you.", 27.07)],
  [wd("Every", 27.44), wd("post,", 27.73, true), wd("your", 28.07), wd("audience,", 28.3, true), wd("your", 28.92), wd("competitors,", 29.15, true)],
  [wd("and", 29.82), wd("what's", 29.95), wd("trending", 30.22, true), wd("in", 30.6), wd("your", 30.69), wd("niche.", 30.9)],
  [wd("Then", 31.28), wd("it", 31.52), wd("tells", 31.65), wd("you", 31.94), wd("exactly", 32.12, true), wd("what", 32.55), wd("to", 32.91), wd("make,", 32.95, true)],
  [wd("rates", 33.32, true), wd("your", 33.6), wd("video", 33.83), wd("before", 34.11), wd("you", 34.44), wd("post,", 34.62)],
  [wd("and", 34.88), wd("posts", 35.05, true), wd("it", 35.33), wd("at", 35.44), wd("your", 35.55), wd("best", 35.77, true), wd("time.", 36.0, true)],
  [wd("It's", 36.44), wd("called", 36.65), wd("SOCIA,", 37.02, true), wd("and", 37.22), wd("it's", 37.38), wd("coming", 37.59), wd("soon.", 37.91)],
  [wd("You're", 38.36), wd("not", 38.65), wd("making", 38.8), wd("bad", 39.09, true), wd("content.", 39.24, true)],
  [wd("You're", 39.76), wd("making", 40.04), wd("it", 40.33), wd("alone.", 40.42, true)],
  [wd("So", 40.84), wd("like", 41.08, true), wd("the", 41.32), wd("reel", 41.5), wd("and", 41.73), wd("follow", 41.94, true), wd("for", 42.29), wd("more.", 42.51)],
];

export const T = {
  notif: [1.97, 2.31, 2.58],
  last: 3.08,
  problem: 5.6,
  likes: 7.4,
  mom: 8.65,
  claude: 9.4,
  idea: 10.32,
  writes: [11.99, 12.49, 13.11],
  build: 13.68,
  animate: 15.06,
  eleven: 16.36,
  paste: 17.6,
  pick: 18.72,
  done: 19.97,
  noMic: 20.44,
  mic: [20.61, 21.15],
  three: 21.96,
  different: 22.34,
  strategist: 23.4,
  analyze: 25.8,
  scans: [27.73, 28.3, 29.15, 30.22],
  tell: 31.28,
  rate: 33.32,
  best: 34.88,
  bestHit: 35.77,
  reveal: 36.44,
  name: 37.02,
  soon: 37.59,
  closer: 38.36,
  strike: 39.24,
  alone: 40.42,
  cta: 40.84,
  like: 41.08,
  follow: 41.94,
};

/** Dark scenes; everything else sits on the lavender ground. */
export const DARK: [number, number][] = [[0, T.problem], [T.different, T.analyze], [T.rate, T.best], [T.reveal, T.cta]];

export const RAIL = ["script", "build", "voice", "analyze", "plan", "rate", "post"];
/** Which rail stop is lit: [time, index]. */
export const RAIL_STEPS: [number, number][] = [[T.claude, 0], [T.build, 1], [T.eleven, 2], [T.analyze, 3], [T.tell, 4], [T.rate, 5], [T.best, 6]];

export const SCANS = [
  { k: "every post", sub: "what worked, what didn't" },
  { k: "your audience", sub: "who watches, and when" },
  { k: "your competitors", sub: "what's working for them" },
  { k: "trending in your niche", sub: "formats and hooks" },
];

export const IDEA = "ranking every snack at the gas station";
export const WRITES = [
  { k: "script", text: "0:00 open on the worst one, already biting" },
  { k: "hook", text: "\"I tried all 41 so you don't have to\"" },
  { k: "caption", text: "Which one did I get wrong? 👇" },
];
export const RATER = { overall: 82, rows: [["Hook", 88], ["Pacing", 79], ["Clarity", 85], ["Visual interest", 80], ["CTA", 74], ["Audio fit", 83]] as [string, number][] };
/** Example week of reach by posting hour (relative). */
export const BEST = [["9a", 0.35], ["12p", 0.55], ["3p", 0.5], ["6p", 1], ["9p", 0.7], ["11p", 0.3]] as [string, number][];
export const VOICES = ["Declan Sage", "Grady", "James"];
