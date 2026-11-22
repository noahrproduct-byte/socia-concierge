// The one camera move a storyboard beat describes, read from the plan's own
// words for the shot. A small fixed set: the drawing shows the kind of move,
// never a picture of the actual scene. "still" when the words name no move.
export type ShotMove = "walk" | "tilt" | "pan" | "push" | "pull" | "screen" | "cuts" | "close" | "text" | "handheld" | "still";

const RULES: [ShotMove, RegExp][] = [
  ["screen", /\bscreen[ -]?(recording|record|capture|share)|\bscrolling\b|\bscreenshot/i],
  ["cuts", /\b(quick|fast|rapid|jump) cuts?\b|\bmontage\b|\bcuts? of\b|\bb-?roll\b|\bseries of (clips|shots)/i],
  ["tilt", /\btilt(s|ing)?\b|\bcamera (moves|pans) (up|down)|\b(crane|pedestal)\b/i],
  ["pan", /\bpan(s|ning)?\b|\bsweep(s|ing)?\b|\bwhip\b|\borbit/i],
  ["push", /\b(push|zoom|punch)(es|ing|s)? in\b|\bdolly in\b|\bmoves? (in )?closer\b/i],
  ["pull", /\b(pull|zoom)(s|ing)? (out|back)\b|\bdolly out\b|\breveal(s|ing)?\b/i],
  ["walk", /\bwalk(s|ing)?\b|\bstep(s|ping)? (in|into|toward)|\benters? (the )?frame|\binto frame\b/i],
  ["handheld", /\bhand-?held\b|\bselfie\b|\bpov\b|\bfollow(s|ing)? (you|him|her|them)\b|\bvlog/i],
  ["close", /\bclose[- ]?up\b|\bmacro\b|\btight (shot|on)\b|\bdetail shot/i],
  ["text", /\btext on screen\b|\bon-screen text\b|\bwords on screen\b|\btitle card\b|\bcaption (reads|says)/i],
];

export function shotMove(show: string): ShotMove {
  for (const [move, re] of RULES) if (re.test(show)) return move;
  return "still";
}

export const MOVE_LABEL: Record<ShotMove, string> = {
  walk: "Walk in", tilt: "Tilt", pan: "Pan", push: "Push in", pull: "Pull back", screen: "Screen recording",
  cuts: "Quick cuts", close: "Close-up", text: "Words on screen", handheld: "Handheld", still: "Hold still",
};
