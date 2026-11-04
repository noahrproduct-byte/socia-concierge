// "Laptop connect" reel (reference: instagram.com/reel/Dd_4tGHDSk4, a dark laptop tutorial
// that connects Claude to a connector, studied 2026-11-02, refs/reel-3). SOCIA version with
// every feature Noah named: AI music generator, video editor, Ask SOCIA (AI assistant).
// Times are word starts in audio/vo.mp3 (Declan Sage take b, silences cut to 0.2 s,
// atempo 1.18, whisper-cli -ml 1). Change copy here.
//
// Honesty: the setup steps follow SOCIA's real Claude connector (custom connector, SOCIA
// sign-in, choose accounts, Allow). The profile, reels, tracks and week are an example and
// say EXAMPLE. Site not ready: the URL field says "SOCIA connector link", no domain.

export const FPS = 60;
export const W = 1080;
export const H = 1920;
export const END = 44.2; // the take ends at 43.1 s
export const TOTAL_FRAMES = Math.round(END * FPS);

/** Spoken words in order with start times; the caption shows them two at a time. */
export const WORDS: [string, number][] = [
  ["This", 0.04], ["honestly", 0.25], ["doesn't", 0.76], ["make", 1.2], ["sense.", 1.48],
  ["Come,", 1.82], ["I'll", 2.08], ["show", 2.25], ["you.", 2.43],
  ["Step", 2.72], ["one,", 3.0], ["open", 3.35], ["Claude,", 3.63], ["go", 4.24], ["to", 4.38], ["Customize,", 4.59],
  ["then", 5.47], ["Connectors.", 5.55],
  ["Click", 6.32], ["Add", 6.69], ["custom", 6.84], ["connector.", 7.23],
  ["Name", 8.04], ["it", 8.3], ["SOCIA", 8.43], ["and", 8.75], ["paste", 8.95], ["the", 9.28], ["SOCIA", 9.54], ["link.", 9.91],
  ["Click", 10.32], ["Connect,", 10.69], ["then", 11.21], ["Allow.", 11.47],
  ["Sign", 12.0], ["in", 12.28], ["to", 12.4], ["SOCIA,", 12.56], ["choose", 13.08], ["your", 13.39], ["Instagram,", 13.61], ["and", 14.2], ["click", 14.38], ["Allow.", 14.75],
  ["That's", 15.16], ["it.", 15.53], ["Your", 15.67], ["Instagram", 15.88], ["is", 16.36], ["connected", 16.46], ["to", 17.03], ["Claude.", 17.04],
  ["Now", 17.6], ["ask", 17.78], ["Claude", 17.97], ["for", 18.33], ["your", 18.51], ["week", 18.76], ["of", 19.01], ["reels.", 19.13],
  ["SOCIA", 19.68], ["hands", 20.05], ["it", 20.34], ["your", 20.48], ["whole", 20.72], ["profile,", 21.05],
  ["and", 21.56], ["what's", 21.7], ["working", 21.98], ["in", 22.31], ["your", 22.4], ["niche.", 22.59],
  ["Claude", 23.0], ["writes", 23.37], ["the", 23.7], ["hook", 23.87], ["and", 24.1], ["the", 24.27], ["script,", 24.51],
  ["and", 24.84], ["builds", 24.99], ["the", 25.3], ["motion", 25.45], ["graphics.", 25.76],
  ["SOCIA's", 26.36], ["AI", 26.82], ["music", 26.95], ["generator", 27.29], ["makes", 27.96], ["a", 28.23], ["track", 28.25], ["for", 28.56], ["each", 28.68], ["one.", 28.89],
  ["Its", 29.28], ["video", 29.43], ["editor", 29.75], ["polishes", 30.13], ["your", 30.63], ["own", 30.89], ["clips.", 31.11],
  ["The", 31.64], ["colour,", 31.85], ["the", 32.35], ["sound,", 32.56], ["the", 33.06], ["pauses.", 33.27],
  ["And", 33.76], ["Ask", 33.98], ["SOCIA,", 34.2], ["the", 34.72], ["AI", 34.94], ["assistant,", 35.09],
  ["schedules", 35.8], ["your", 36.36], ["whole", 36.61], ["week", 36.92], ["in", 37.17], ["plain", 37.31], ["words.", 37.67],
  ["Nothing", 38.12], ["posts", 38.52], ["until", 38.8], ["you", 39.08], ["approve", 39.27], ["it.", 39.65],
  ["If", 39.96], ["you", 40.05], ["want", 40.19], ["the", 40.38], ["link,", 40.52], ["comment", 40.84], ["SOCIA,", 41.47],
  ["and", 41.8], ["I'll", 41.96], ["send", 42.17], ["it", 42.39], ["to", 42.5], ["your", 42.61], ["DMs.", 42.83],
];

/** Words the caption marks in gold. */
export const ACCENT = new Set(["SOCIA", "SOCIA,", "SOCIA's", "Allow.", "connected", "music", "editor", "Ask", "approve", "comment"]);

export const T = {
  screenOn: 1.82,
  zoomIn: 2.0,
  home: 3.35,
  customize: 4.59,
  connectors: 5.55,
  list: 6.32,
  addBtn: 6.69,
  dialog: 8.04,
  name: 8.43,
  url: 9.0,
  connect: 10.69,
  access: 10.95,
  allow1: 11.47,
  signIn: 12.0,
  consent: 13.08,
  igToggle: 13.61,
  allow2: 14.75,
  connected: 15.16,
  stamp: 16.46,
  chat: 17.6,
  typeFrom: 17.78,
  typeTo: 19.0,
  reading: 19.68,
  grid: 20.48,
  niche: 21.7,
  making: 23.0,
  chips: [23.87, 24.51, 25.45],
  fan: 24.99,
  music: 26.36,
  tracks: 27.96,
  editor: 29.28,
  fixes: [31.85, 32.56, 33.27],
  ask: 33.76,
  askType: [34.2, 35.6],
  confirm: 35.8,
  approve: 38.12,
  cta: 39.96,
  comment: 40.84,
};

/** Camera: [time, scale, x offset, y offset]. Scale 0.74 puts the screen edge to edge. */
export const CAMERA: [number, number, number, number][] = [
  [0, 0.34, 0, 120], [2.0, 0.34, 0, 120], [3.1, 0.74, 0, 0],
  [7.9, 0.74, 0, 0], [8.4, 0.92, 0, 40], [12.0, 0.92, 0, 40], [12.4, 0.74, 0, 0],
  [24.6, 0.74, 0, 0], [25.2, 0.6, 0, 80], [26.2, 0.6, 0, 80], [26.6, 0.74, 0, 0],
  [39.8, 0.74, 0, 0], [40.4, 0.62, 0, 90], [44.2, 0.64, 0, 90],
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TIMES = ["6 PM", "12 PM", "6 PM", "7 PM", "6 PM", "11 AM", "5 PM"];
export const TRACKS = ["warm lo-fi, 92 bpm", "bright pop, 118 bpm", "soft piano, 76 bpm"];
