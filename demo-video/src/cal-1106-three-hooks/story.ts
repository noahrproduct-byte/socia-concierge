// Calendar post Fri Nov 6, 11:00 AM: "Same idea, three hooks. Which one would stop your scroll?"
// One topic (find out why a Reel flopped), three hook drafts, then a vote in the comments.
// Hook 1 is built on the formula from the real weekly Content Plan (get_content_plan,
// generated 2026-11-02: named tool + specific outcome + time box; the plan's own Tuesday
// hook). Hooks 2 and 3 are a bold-claim opener and a story opener. No result is claimed for
// any of them. Times are word starts in audio/vo.mp3 (Declan Sage take b, silences cut to
// 0.2 s, atempo 1.263, whisper-cli -ml 1).

import { wd, type Word } from "../cal-1102-drop-handle/kit";

export const W = 1080;
export const H = 1920;
export const END = 25.6; // the take ends at 23.24 s
export const TOTAL_FRAMES = Math.round(END * 30);

export const TITLE: Word[] = [wd("Same", 0.03), wd("idea,", 0.27), wd("three", 0.84, true), wd("hooks.", 1.0, true)];
export const ASK: Word[] = [wd("Which", 1.56), wd("one", 1.79), wd("would", 1.93), wd("stop", 2.16), wd("your", 2.4), wd("scroll?", 2.52)];

export type Hook = { badge: number; lines: Word[][]; style: "ink" | "paper" | "gold"; kind: string };
export const HOOKS: Hook[] = [
  {
    badge: 2.96,
    style: "ink",
    kind: "Named tool, outcome, time box",
    lines: [
      [wd("Ask", 3.24), wd("Claude", 3.41, true), wd("why", 3.8), wd("your", 3.93), wd("last", 4.2), wd("Reel", 4.53), wd("flopped.", 4.63)],
      [wd("Answer", 5.28), wd("in", 5.65), wd("45", 5.77, true), wd("seconds.", 6.14, true)],
    ],
  },
  {
    badge: 6.76,
    style: "paper",
    kind: "A bold claim",
    lines: [
      [wd("Your", 6.99), wd("Reels", 7.18), wd("aren't", 7.6), wd("the", 7.69), wd("problem.", 7.82)],
      [wd("Your", 8.4), wd("first", 8.68, true), wd("second", 9.24, true), wd("is.", 9.47)],
    ],
  },
  {
    badge: 9.65,
    style: "gold",
    kind: "A story",
    lines: [
      [wd("One", 10.2), wd("reel", 10.37), wd("went", 10.6), wd("viral.", 11.04, true)],
      [wd("The", 11.32), wd("other", 11.47), wd("flopped.", 11.72, true)],
      [wd("Here's", 12.22), wd("why.", 12.63)],
    ],
  },
];

/** Top caption once the three hooks sit side by side. */
export const CAPTION: Word[][] = [
  [wd("Same", 13.06), wd("idea,", 13.32), wd("every", 13.58, true), wd("time.", 13.9, true)],
  [wd("SOCIA's", 14.36, true), wd("plan", 14.69), wd("for", 14.91), wd("our", 15.2), wd("account", 15.26), wd("bets", 15.67, true), wd("on", 15.93), wd("hook", 16.03), wd("one:", 16.24, true)],
  [wd("a", 16.6), wd("named", 16.67, true), wd("tool,", 17.03, true), wd("a", 17.49), wd("specific", 17.54, true), wd("outcome,", 18.17, true), wd("a", 18.61), wd("time", 18.67, true), wd("box.", 18.97, true)],
  [wd("But", 19.44), wd("that's", 19.6), wd("a", 19.93), wd("bet,", 19.97, true), wd("not", 20.28), wd("a", 20.41), wd("result.", 20.46, true)],
  [wd("Vote", 21.0), wd("1,", 21.25, true), wd("2", 21.55, true), wd("or", 21.85), wd("3", 21.97, true), wd("in", 22.28), wd("the", 22.57), wd("comments.", 22.58)],
];

export const T = {
  stage1: 2.86,
  stage2: 6.6,
  stage3: 9.5,
  row: 12.95,
  plan: 14.36,
  parts: [16.67, 17.54, 18.67],
  bet: 19.44,
  vote: 21.0,
  votes: [21.25, 21.55, 21.97],
  end: 23.45,
};

export const PLAN = {
  parts: ["Named tool", "Specific outcome", "Time box"],
  source: "SOCIA Content Plan · @socia.appmedia · Nov 2",
};
