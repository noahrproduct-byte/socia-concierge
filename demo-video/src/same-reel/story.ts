// "Same reel" (reference: instagram.com/reel/De7CN1WIxnF, a calm "invisible details" explainer:
// two phones load in the same 2 s, one feels slow, one instant, because of a skeleton screen;
// studied 2026-11-02, refs/reel-5). SOCIA version per Noah: two reels from the same creator, one
// goes viral, one flops, you can't figure out why, so you ask SOCIA and it gives what it found and
// the fix. Ends on Noah's waitlist line (25 of 50, his
// number, 2026-11-02). Times are word starts in audio/vo.mp3 (Declan Sage take a, silences cut to
// 0.2 s, atempo 1.08, whisper-cli -ml 1).
// Honesty: Content Studio's video rating (app/api/studio/analyze/route.ts) judges the hook, the
// caption and the sound it measures on the device (level, pauses, music). The fix uses real
// features: hook rewrites (Studio), the AI music generator (Studio music, Growth/Pro) and the
// video editor's sound and pause controls (Build from clips, Look & sound). The reels, views,
// findings and the fix text are an example and say EXAMPLE.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 43.0; // the take ends at 41.2 s
export const TOTAL_FRAMES = Math.round(END * FPS);

export type Tone = "red" | "blue" | undefined;
export type Word = [string, number, Tone?];
export type Line = { from: number; to: number; title: Word[]; sub?: Word[]; sub2?: Word[] };

export const LINES: Line[] = [
  { from: 0, to: 2.8, title: [["Two", 0.04], ["reels.", 0.3]],
    sub: [["Same", 1.0], ["creator,", 1.34], ["same", 2.1], ["week.", 2.43]] },
  { from: 2.8, to: 4.76, title: [["One", 2.8], ["goes", 3.04], ["viral.", 3.35, "blue"]],
    sub: [["One", 3.92], ["flops.", 4.16, "red"]] },
  { from: 4.76, to: 6.68, title: [["Same", 4.76], ["camera.", 5.08]], sub: [["Same", 5.72], ["effort.", 6.09]] },
  { from: 6.68, to: 10.48, title: [["And", 6.68], ["you", 6.86], ["can't", 7.04], ["figure", 7.33], ["out", 7.68], ["why.", 7.86, "red"]],
    sub: [["Bad", 8.24], ["hook?", 8.43], ["Wrong", 8.79], ["time?", 9.19], ["The", 9.5], ["algorithm?", 9.68]] },
  { from: 10.48, to: 16.16, title: [["So", 10.48], ["let's", 10.62], ["ask", 10.96, "blue"], ["SOCIA.", 11.18, "blue"]],
    sub: [["It", 11.76], ["checks", 11.87], ["the", 12.2], ["reel", 12.35], ["against", 12.71], ["your", 13.02], ["own", 13.19], ["numbers:", 13.34]],
    sub2: [["the", 13.96], ["hook,", 14.14, "blue"], ["the", 14.5], ["caption,", 14.68, "blue"], ["even", 15.22], ["the", 15.46], ["sound.", 15.64, "blue"]] },
  { from: 16.16, to: 20.76, title: [["Here's", 16.16], ["what", 16.44], ["it", 16.62], ["found.", 16.71, "blue"]],
    sub: [["The", 17.12], ["hook", 17.33], ["came", 17.6], ["too", 18.06], ["late.", 18.1, "red"]],
    sub2: [["The", 18.64], ["voice", 18.82], ["was", 19.12], ["too", 19.3], ["quiet", 19.59, "red"], ["under", 19.78], ["the", 20.08], ["music.", 20.26]] },
  { from: 20.76, to: 23.6, title: [["Now", 20.76], ["the", 21.01], ["fix.", 21.26, "blue"]],
    sub: [["SOCIA", 21.76, "blue"], ["writes", 22.06], ["you", 22.44], ["a", 22.69], ["sharper", 22.71], ["hook.", 23.13, "blue"]] },
  { from: 23.6, to: 26.68, title: [["Its", 23.6], ["AI", 23.81, "blue"], ["music", 23.95, "blue"], ["generator", 24.29, "blue"]],
    sub: [["makes", 24.91], ["a", 25.25], ["new", 25.32], ["track", 25.54], ["that", 25.87], ["fits.", 26.15]] },
  { from: 26.68, to: 29.76, title: [["Its", 26.68], ["video", 26.87, "blue"], ["editor", 27.18, "blue"]],
    sub: [["levels", 27.63], ["the", 27.95], ["sound", 28.14], ["and", 28.62], ["cuts", 28.66], ["the", 28.92], ["pauses.", 29.25]] },
  { from: 29.76, to: 30.98, title: [["All", 29.76], ["in", 29.97], ["one", 30.13, "blue"], ["place.", 30.38, "blue"]] },
  { from: 30.98, to: 33.36, title: [["Same", 30.98], ["two", 31.27], ["reels.", 31.66]],
    sub: [["Now", 32.24], ["you", 32.45], ["know", 32.66], ["why.", 32.94, "blue"]] },
  { from: 33.36, to: 36.72, title: [["So", 33.36], ["far,", 33.5], ["25", 33.84, "blue"], ["of", 34.3], ["50", 34.39]],
    sub: [["people", 34.8], ["have", 35.3], ["joined", 35.49], ["the", 35.9], ["waitlist.", 36.16]] },
  { from: 36.72, to: END + 1, title: [["At", 36.72], ["50,", 36.86], ["SOCIA", 37.43, "blue"], ["launches.", 37.78]],
    sub: [["Comment", 38.6], ["SOCIA", 39.54, "blue"], ["to", 40.05], ["join.", 40.29]] },
];

export const T = {
  filled: 1.0,
  focusLeft: 2.8,
  focusRight: 3.92,
  equal: 4.76,
  guess: 6.68,
  ask: 10.48,
  askType: [10.7, 11.6] as [number, number],
  thumb: 11.87,
  check: [14.14, 14.68, 15.64], // hook, caption, sound rows start checking
  result: [17.33, 16.71, 18.82], // hook late, caption fine, sound quiet
  fix: 20.76,
  newHook: 21.76,
  music: 23.6,
  track: 24.91,
  editor: 26.68,
  levels: 27.63,
  pauses: 28.66,
  allDone: 29.76,
  pair2: 30.98,
  knowWhy: 32.24,
  waitlist: 33.36,
  count: 33.84,
  launch: 36.72,
  comment: 38.6,
};

/** The two example reels. */
export const REELS = {
  viral: { title: "the 30-second edit", cover: "linear-gradient(150deg,#b7c6ff,#c9b6f2 55%,#f6c3a8)", views: 248_000 },
  flop: { title: "my 5 desk must-haves", cover: "linear-gradient(150deg,#e8d3b0,#c9a27a 60%,#a98466)", views: 1_900 },
};

/** The guesses, timed to the voice. */
export const GUESSES: [string, number][] = [["bad hook?", 8.24], ["wrong time?", 8.79], ["the algorithm?", 9.5]];

export const QUESTION = "Why did this one flop?";

/** Example findings (Content Studio rates a video's hook, caption and measured sound). */
export const FINDINGS = [
  { label: "Hook", bad: true, result: "lands at 0:04", note: "Your viral reel hooks in the first second." },
  { label: "Caption", bad: false, result: "fine", note: "" },
  { label: "Sound", bad: true, result: "voice too quiet", note: "The music sits over your voice." },
];

/** Example fix. */
export const FIX = { oldHook: "My 5 desk must-haves", newHook: "Your desk is why you're tired.", track: "warm lo-fi · 92 bpm" };

export const WAITLIST = { joined: 25, goal: 50 };
