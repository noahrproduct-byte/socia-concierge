// Calendar post Mon Nov 2, 7:00 PM: "Drop your handle below. I'll run it through SOCIA and
// reply with the one post you should make next." Built without a face: kinetic type and voice.
// Proof is the real weekly Content Plan for @socia.appmedia (get_content_plan, workspace
// 76cbbf46..., generated 2026-11-02): headline "Health 34/100" and top fix 1, shortened.
// Times are word starts in audio/vo.mp3 (Declan Sage take b, silences cut to 0.2 s,
// atempo 1.217, whisper-cli -ml 1).

import { wd, type Word } from "./kit";

export const W = 1080;
export const H = 1920;
export const END = 21.6; // the take ends at 19.15 s
export const TOTAL_FRAMES = Math.round(END * 30);

/** The black opening: three type cards, one per phrase. */
export const OPEN: Word[][] = [
  [wd("Drop", 0.05), wd("your", 0.29), wd("handle", 0.46, true), wd("below.", 0.81)],
  [wd("I'll", 1.2), wd("run", 1.36), wd("it", 1.52), wd("through", 1.57), wd("SOCIA", 1.87, true)],
  [wd("and", 2.15), wd("reply", 2.28), wd("with", 2.6), wd("the", 2.76), wd("one", 2.93, true), wd("post", 3.18, true), wd("you", 3.47), wd("should", 3.53), wd("make", 3.72), wd("next.", 4.08)],
];

/** Top caption over the proof card. */
export const PROOF_CAPTION: Word[][] = [
  [wd("Here's", 4.72), wd("what", 5.01), wd("it", 5.11), wd("told", 5.19), wd("us", 5.35), wd("about", 5.43), wd("our", 5.62), wd("own", 5.86, true), wd("account.", 5.87, true)],
  [wd("Health:", 6.3), wd("34", 6.72, true), wd("out", 7.14), wd("of", 7.35), wd("100.", 7.49)],
  [wd("Top", 8.31), wd("fix:", 8.55), wd("build", 8.99), wd("every", 9.24), wd("Reel", 9.52), wd("on", 9.81), wd("our", 9.92), wd("breakout's", 10.12, true), wd("formula.", 10.73, true)],
  [wd("A", 11.34), wd("named", 11.41, true), wd("tool,", 11.75, true), wd("a", 12.15), wd("specific", 12.28, true), wd("outcome,", 12.77, true), wd("a", 13.43), wd("time", 13.45, true), wd("box.", 13.72, true)],
  [wd("And", 14.05), wd("retire", 14.25), wd("\"stop", 15.16, true), wd("guessing.\"", 15.45, true)],
];

export const CLOSE: Word[][] = [
  [wd("Your", 16.16), wd("turn.", 16.36, true)],
  [wd("Drop", 16.66), wd("your", 16.86), wd("handle.", 17.06, true)],
  [wd("I'll", 17.46), wd("reply", 17.68), wd("to", 17.91), wd("every", 18.01, true), wd("handle", 18.26), wd("this", 18.56), wd("week.", 18.76)],
];

export const T = {
  proof: 4.62,
  health: 6.72,
  fix: 8.31,
  chips: [11.41, 12.28, 13.43],
  retire: 14.25,
  strike: 15.16,
  close: 16.05,
  comment: 16.66,
  end: 19.4,
};

/** Real, from get_content_plan (plan e49ad568, created 2026-11-02 13:22 UTC). */
export const PLAN = {
  score: 34,
  headline: "Your 'Connect Claude in 60 seconds' tutorial is the one formula that works, and the recycled 'Stop guessing what to post' ad is burying it.",
  fix: "Build every Reel on the breakout's formula",
  parts: ["Named tool", "Specific outcome", "Time box"],
  retire: "Stop guessing what to post",
  source: "SOCIA Content Plan · @socia.appmedia · Nov 2",
};
