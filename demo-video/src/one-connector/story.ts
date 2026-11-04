// "One connector" (reference: instagram.com/reel/De9RuthIkyL, a cream "illustrated explainer":
// mono section labels, black caption with red italic accent words, a new sticker-style picture
// on almost every phrase; studied 2026-11-03, refs/reel-6). SOCIA version, v2 per Noah: no
// waitlist; ends "if you want access, comment SOCIA", promo code SOCIA50 (Noah's code, his
// word), "comment LINK"; hook names our real top reel; SOCIA's features named.
// Times are word starts in audio/vo.mp3 (Declan Sage v2 take a, silences cut to 0.2 s, atempo
// 1.08, whisper-cli -ml 1).
//
// Honesty: every number is real, from the SOCIA MCP tools for the Socia workspace
// (@socia.appmedia), 2026-11-03: top reel 1,958 views, 1,659 reach, 125 interactions, 9.6x the
// account's median interactions (13). That reel ("Connect Claude to your Instagram in 60
// seconds") was built in Remotion by Claude, never filmed. The rules are SOCIA's findings on
// this account (Content Plan top fix: named tool + outcome + time box; one reel a day). The music
// track and the editor settings are illustrative and say EXAMPLE. Framing (Noah): Claude builds
// the video; SOCIA is the data, its music generator and editor, the rating, publishing, tracking.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 44.0; // the take ends at 42.6 s
export const TOTAL_FRAMES = Math.round(END * FPS);

/** [word, start, accent?]: accent words set in red italic serif. */
export type Word = [string, number, boolean?];
export const GROUPS: Word[][] = [
  [["1,958", 0.02, true], ["views", 1.64], ["on", 2.23], ["one", 2.46], ["reel,", 2.8]],
  [["and", 3.32], ["we", 3.5], ["never", 3.62], ["filmed", 4.03, true], ["a", 4.32], ["single", 4.4], ["frame.", 4.86, true]],
  [["Claude", 5.28, true], ["built", 5.76], ["it,", 6.14], ["right", 6.3], ["here", 6.74], ["on", 7.0], ["a", 7.16], ["Mac.", 7.28, true]],
  [["And", 7.52], ["the", 7.7], ["secret", 7.88, true], ["isn't", 8.25], ["Claude.", 8.55]],
  [["It's", 9.16], ["one", 9.43], ["connector:", 9.62, true], ["S", 10.4, true], ["O", 10.66, true], ["C", 10.92, true], ["I", 11.18, true], ["A.", 11.44, true]],
  [["It", 12.04], ["reads", 12.18, true], ["our", 12.55], ["posts", 12.77]],
  [["and", 13.16], ["finds", 13.34], ["the", 13.68], ["rules", 13.83, true], ["our", 14.12], ["best", 14.32], ["reels", 14.6, true], ["follow.", 14.95]],
  [["Name", 15.4], ["a", 15.67], ["tool,", 15.73, true], ["an", 16.13], ["outcome,", 16.26, true], ["and", 16.86], ["a", 17.06], ["time", 17.12, true], ["limit.", 17.4, true]],
  [["One", 18.0], ["reel", 18.27], ["a", 18.49], ["day.", 18.56, true]],
  [["Claude", 19.0, true], ["writes", 19.34], ["the", 19.68], ["script,", 19.85, true]],
  [["records", 20.32], ["the", 20.78], ["voice,", 21.0, true]],
  [["and", 21.32], ["animates", 21.51, true], ["every", 22.02], ["scene.", 22.34]],
  [["Then", 22.88], ["SOCIA", 23.28, true], ["takes", 23.61], ["over.", 23.95]],
  [["Its", 24.48], ["AI", 24.75, true], ["music", 24.87, true], ["generator", 25.21, true], ["scores", 25.94], ["it.", 26.23]],
  [["Its", 26.6], ["video", 26.87, true], ["editor", 27.14, true], ["polishes", 27.5], ["it.", 28.05]],
  [["It", 28.33], ["rates", 28.45, true], ["the", 28.8], ["reel,", 28.98], ["plans", 29.37, true], ["our", 29.77], ["week,", 29.96]],
  [["posts", 30.32], ["when", 30.8], ["I", 30.96], ["approve,", 31.04, true], ["and", 31.64], ["tracks", 31.91, true], ["every", 32.25], ["view.", 32.59]],
  [["I", 33.08], ["don't", 33.14], ["film,", 33.46, true], ["I", 33.85], ["don't", 33.91], ["edit,", 34.23, true], ["I", 34.62], ["don't", 34.72], ["guess.", 35.09, true]],
  [["If", 35.56], ["you", 35.71], ["want", 35.94], ["access,", 36.25, true], ["comment", 36.87], ["SOCIA.", 37.41, true]],
  [["And", 37.84], ["there's", 38.01], ["a", 38.4], ["promo", 38.45, true], ["code,", 38.73, true], ["SOCIA50.", 39.07, true]],
  [["Comment", 39.92], ["LINK", 40.65, true], ["and", 41.13], ["I'll", 41.36], ["send", 41.69, true], ["it", 42.01], ["to", 42.17], ["you.", 42.33]],
];

/** Scenes: hard cuts like the reference. label = the mono section line; right = top-right tag. */
export type SceneId =
  | "proof" | "camera" | "mac" | "vault" | "connector" | "reads" | "rule1" | "rule2"
  | "build" | "handoff" | "music" | "editor" | "jobs" | "notools" | "access" | "promo";
export const SCENES: { id: SceneId; from: number; label: string; right?: string }[] = [
  { id: "proof", from: 0, label: "// 01 · the proof" },
  { id: "camera", from: 3.32, label: "// 01 · the proof" },
  { id: "mac", from: 5.28, label: "// made on a mac" },
  { id: "vault", from: 7.52, label: "// 02 · the secret" },
  { id: "connector", from: 9.16, label: "// 03 · one connector" },
  { id: "reads", from: 12.04, label: "// 04 · the rules" },
  { id: "rule1", from: 15.4, label: "// 04 · the rules", right: "RULE 1/2" },
  { id: "rule2", from: 18.0, label: "// 04 · the rules", right: "RULE 2/2" },
  { id: "build", from: 19.0, label: "// 05 · claude builds it", right: "LAYERS" },
  { id: "handoff", from: 22.88, label: "// 06 · socia takes over" },
  { id: "music", from: 24.48, label: "// 06 · ai music generator" },
  { id: "editor", from: 26.6, label: "// 06 · video editor" },
  { id: "jobs", from: 28.33, label: "// 06 · socia takes over" },
  { id: "notools", from: 33.08, label: "// 07 · no tools" },
  { id: "access", from: 35.56, label: "// comment SOCIA", right: "COMMENT SOCIA" },
  { id: "promo", from: 37.84, label: "// promo code", right: "COMMENT LINK" },
];

export const T = {
  count: [0.02, 1.5] as [number, number],
  oneReel: 2.46,
  filmed: 4.03,
  frame: 4.86,
  claude: 5.28,
  fly: 6.3,
  mac: 7.28,
  secret: 7.88,
  notClaude: 8.55,
  one: 9.43,
  letters: [10.4, 10.66, 10.92, 11.18, 11.44],
  reads: 12.18,
  rules: 13.83,
  best: 14.32,
  tool: 15.73,
  outcome: 16.26,
  time: 17.12,
  day: 18.56,
  script: 19.85,
  voice: 21.0,
  scenes: 21.51,
  socia: 23.28,
  music: 24.75,
  scores: 25.94,
  video: 26.87,
  polish: 27.5,
  rates: 28.45,
  plans: 29.37,
  approve: 31.04,
  tracks: 31.91,
  film: 33.46,
  edit: 34.23,
  guess: 35.09,
  access: 36.25,
  comment: 36.87,
  commentSocia: 37.41,
  promo: 38.45,
  code: 39.07,
  link: 39.92,
  linkWord: 40.65,
  send: 41.69,
};

/** Real, from SOCIA (get_top_posts, Socia workspace, last 30 days, as of 2026-11-03). */
export const TOP = { title: "Connect Claude to your Instagram in 60 seconds", views: 1958, reach: 1659, interactions: 125, saves: 43, shares: 19, vsMedian: "9.6×", median: 13, date: "Nov 2" };
export const POSTS = [
  { t: "Connect Claude to your Instagram in 60 seconds", i: 125, cover: "linear-gradient(150deg,#1d1f24,#3a3f4a)" },
  { t: "Stop guessing what to post.", i: 75, cover: "linear-gradient(150deg,#f2d7c4,#d98b63)" },
  { t: "I stopped guessing what to post.", i: 27, cover: "linear-gradient(150deg,#dfe4ef,#8ea0c4)" },
  { t: "Connect Claude to your Instagram.", i: 20, cover: "linear-gradient(150deg,#e8e2d4,#b9a888)" },
  { t: "One reel went viral. The other flopped.", i: 13, cover: "linear-gradient(150deg,#e6d9f0,#a98fc7)" },
];
export const SOURCE = "SOCIA Analytics · @socia.appmedia · Nov 3";
export const PROMO = "SOCIA50";
