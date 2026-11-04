// "Connector reel" (reference: instagram.com/reel/De6Rc7GCGnm, a dark warm film-strip explainer:
// "one click to Claude can make unlimited animated reels"; white bold + orange serif titles, one
// visual per beat, bottom karaoke caption with orange-boxed key words; studied 2026-11-03,
// refs/reel-7). SOCIA version: SOCIA connected to Claude makes your whole week of reels.
// Times are word starts in audio/vo.mp3 (Declan Sage take a, silences cut to 0.2 s, atempo 1.05,
// whisper-cli -ml 1).
// Honesty: every reel frame shown is a real frame from a reel we made this way (demo-video/out,
// thumbs/); 1,958 views is our real top reel (SOCIA get_top_posts, 2026-11-03); the tool lines
// name SOCIA's real MCP tools. Framing (Noah): SOCIA = the data + rate/schedule/track, Claude =
// builds the video. SOCIA50 + follow/comment LINK/DM close as in Noah's launch reel.

export const FPS = 60;
export const W = 1080;
export const H = 1920;
export const END = 41.6; // the take ends at 40.3 s
export const TOTAL_FRAMES = Math.round(END * FPS);

/** Bottom caption chunks: [word, start, boxed?]. */
export type Word = [string, number, boolean?];
export const CAPS: Word[][] = [
  [["Did", 0.08], ["you", 0.18], ["know", 0.36]],
  [["one", 0.61], ["connector", 0.79, true]],
  [["in", 1.35], ["Claude", 1.47, true], ["can", 1.76], ["make", 1.92]],
  [["your", 2.12], ["whole", 2.5], ["week", 2.74, true]],
  [["of", 3.07], ["animated", 3.2], ["reels?", 3.74, true]],
  [["Let", 4.28], ["me", 4.46], ["show", 4.58], ["you", 4.81]],
  [["how", 4.99], ["it", 5.17], ["works.", 5.29, true]],
  [["You", 5.64], ["connect", 5.89, true], ["SOCIA", 6.49, true]],
  [["to", 6.87], ["Claude.", 7.03]],
  [["SOCIA", 7.4, true], ["reads", 7.72], ["your", 8.05], ["posts", 8.31, true]],
  [["and", 8.68], ["what's", 8.86], ["trending,", 9.17, true]],
  [["and", 9.63], ["tells", 9.9], ["Claude", 10.12]],
  [["what", 10.36], ["to", 10.6], ["make.", 10.72, true]],
  [["Claude", 11.16, true], ["writes", 11.5]],
  [["the", 12.01], ["whole", 12.32], ["reel", 12.68]],
  [["in", 13.02], ["code.", 13.19, true]],
  [["Not", 13.78], ["a", 14.11], ["video", 14.23], ["AI.", 14.78]],
  [["Code.", 15.0, true]],
  [["So", 15.48], ["there", 15.59], ["are", 15.88], ["no", 16.05, true]],
  [["video", 16.16], ["credits", 16.45, true], ["to", 16.86], ["burn.", 16.97]],
  [["Any", 17.44], ["style", 17.66, true]],
  [["you", 18.03], ["want.", 18.25, true]],
  [["Explainers,", 18.72, true]],
  [["tutorials,", 19.62, true]],
  [["launch", 20.56], ["reels,", 20.98, true]],
  [["calendars", 21.48, true], ["that", 21.96]],
  [["fill", 22.17], ["themselves", 22.38], ["in.", 22.94]],
  [["Same", 23.2, true], ["system,", 23.53]],
  [["every", 24.05, true], ["time.", 24.44]],
  [["And", 25.04], ["this", 25.18], ["reel", 25.36]],
  [["you're", 25.54], ["watching", 25.82], ["right", 26.2], ["now?", 26.42]],
  [["Made", 26.6, true], ["the", 26.87], ["same", 27.02], ["way.", 27.26, true]],
  [["Every", 27.72], ["word,", 28.03, true]],
  [["every", 28.49], ["animation,", 28.88, true]],
  [["every", 29.75], ["sound", 30.15, true], ["effect.", 30.51, true]],
  [["Then", 31.0], ["SOCIA", 31.27, true], ["rates", 31.59], ["it,", 31.92]],
  [["schedules", 32.18, true], ["it", 32.83]],
  [["when", 32.92], ["you", 33.19], ["approve,", 33.51, true]],
  [["and", 33.92], ["tracks", 34.12, true], ["every", 34.53], ["view.", 34.87]],
  [["Launch", 35.36], ["code", 35.86], ["SOCIA50", 36.21, true]],
  [["is", 37.09], ["live.", 37.25, true]],
  [["Follow", 37.64, true], ["and", 38.01], ["comment", 38.18], ["LINK,", 38.62, true]],
  [["and", 38.86], ["I'll", 39.04], ["DM", 39.28, true], ["you", 39.4], ["the", 39.58], ["link.", 39.76]],
];

export const T = {
  connector: 0.79,
  reels: 3.2,
  how: 4.28,
  type: [5.64, 6.4] as [number, number],
  connect: 6.49,
  reads: 7.72,
  trending: 9.17,
  tells: 9.9,
  code: 11.16,
  inCode: 13.19,
  notAI: 13.78,
  ai: 14.78,
  codeTag: 15.0,
  credits: 15.48,
  zero: 16.05,
  style: 17.44,
  items: [18.72, 19.62, 20.56, 21.48],
  same: 23.2,
  thisReel: 25.04,
  made: 26.6,
  tracks: [27.72, 28.49, 29.75],
  socia: 31.0,
  rates: 31.59,
  schedules: 32.18,
  approve: 33.51,
  views: 34.12,
  cta: 35.36,
  code50: 36.21,
  live: 37.25,
  follow: 37.64,
  link: 38.18,
  linkType: 38.62,
  dm: 39.28,
};

export const ITEMS = ["explainers", "tutorials", "launch reels", "calendars"];
export const TOP_VIEWS = 1958;
