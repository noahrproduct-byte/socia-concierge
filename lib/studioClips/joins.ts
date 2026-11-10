// How each shot joins the one before it, decided join by join from what is on
// either side, with the reason kept. The editing playbook Noah sent
// (2026-11-10): a transition is chosen for what it does, never sprinkled. Two
// joins are told apart today:
//   - someone is talking at the join: a hard cut. A dissolve would play two
//     voices and two faces at once, and the words dip under the crossfade;
//   - anything else: the 0.3 s soft dissolve Noah approved on his hand cut
//     (2026-11-06), which also shows time passing when a shot skips ahead.
// A person who names a transition in their own words keeps every join as
// given. Pure, unit-tested (joins.test.ts).
import type { ClipForEdl } from "./edl";
import type { TransitionKind } from "./types";

/** Speech this close to a join (seconds, either side) counts as talking across it. */
export const SPEECH_AT_JOIN_SEC = 0.3;

export type JoinWhy = "asked" | "speech" | "skip" | "montage";
export type Join = { index: number; transition: TransitionKind; why: JoinWhy };

export const JOIN_WHY: Record<JoinWhy, string> = {
  asked: "the transition you asked for",
  speech: "someone is talking here, so a hard cut keeps the words clear",
  skip: "the shot skips ahead, so a short dissolve shows the time passing",
  montage: "a new shot, joined with a short soft dissolve",
};

/** The words a person named that mean they chose the joins themselves. */
const ASKED = /\b(whip|zoom|hard cuts?|jump cuts?|no transitions?|dissolves?|crossfades?)\b/i;

type Seg = { clipId: string; in: number; out: number; transition?: TransitionKind };

/** Whether a word of this clip is being said within `pad` seconds of time `t`. */
function talkingAt(clip: Pick<ClipForEdl, "words"> | undefined, t: number, side: "before" | "after", pad = SPEECH_AT_JOIN_SEC): boolean {
  const ms = t * 1000, padMs = pad * 1000;
  return Boolean(clip?.words?.some((w) => (side === "before" ? w.endMs > ms - padMs && w.startMs < ms : w.startMs < ms + padMs && w.endMs > ms)));
}

/**
 * Every join after the first shot, decided. The segments come back with their
 * transitions set (a hard cut is no transition); `joins` says why for each.
 */
export function decideJoins<T extends Seg>(segments: T[], clips: Pick<ClipForEdl, "id" | "words">[], asked?: string | null): { segments: T[]; joins: Join[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  if (asked && ASKED.test(asked)) {
    return { segments, joins: segments.slice(1).map((s, k) => ({ index: k + 1, transition: s.transition ?? "cut", why: "asked" as const })) };
  }
  const joins: Join[] = [];
  const out = segments.map((s, i) => {
    if (!i) { const { transition: _t, ...rest } = s; void _t; return rest as T; }
    const prev = segments[i - 1];
    const speech = talkingAt(byId.get(prev.clipId), prev.out, "before") || talkingAt(byId.get(s.clipId), s.in, "after");
    if (speech) {
      joins.push({ index: i, transition: "cut", why: "speech" });
      const { transition: _t, ...rest } = s; void _t;
      return rest as T;
    }
    joins.push({ index: i, transition: "fade", why: prev.clipId === s.clipId && s.in > prev.out ? "skip" : "montage" });
    return { ...s, transition: "fade" as const };
  });
  return { segments: out, joins };
}

/** One line for the cut's notes: how the joins were chosen. "" when there is only one shot. */
export function joinsNote(joins: Join[]): string {
  if (!joins.length || joins.every((j) => j.why === "asked")) return "";
  const n = (why: JoinWhy) => joins.filter((j) => j.why === why).length;
  const soft = n("skip") + n("montage"), hard = n("speech");
  const parts = [
    soft ? `${soft} soft dissolve${soft === 1 ? "" : "s"} between shots` : "",
    hard ? `${hard} hard cut${hard === 1 ? "" : "s"} where someone is talking, so the words stay clear` : "",
  ].filter(Boolean);
  return `SOCIA chose each join: ${parts.join(" and ")}.`;
}
