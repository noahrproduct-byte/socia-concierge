// How each shot joins the one before it, decided join by join from what is on
// either side, with the reason kept. The editing playbook Noah sent
// (2026-11-10): a transition is chosen for what it does, never sprinkled.
//   - someone is talking at the join: a hard cut. A dissolve would play two
//     voices and two faces at once, and the words dip under the crossfade;
//   - either shot is quick (under 2.5 s): a hard cut. A dissolve between quick
//     shots blurs two pictures together and slows the edit (Noah's pizza cut,
//     2026-11-11: seven dissolves between 1.4 s shots);
//   - the same clip a few seconds on: a hard cut. A dissolve would show the
//     same thing twice, one picture ghosted over the other;
//   - two longer shots of different moments, in a style that dissolves (food
//     and process, calm): the 0.3 s soft dissolve Noah approved on his hand cut
//     (2026-11-06), which shows time passing. Styles that join with hard cuts
//     (talking to camera, demos, fast edits; lib/studioClips/profiles.ts) cut.
// A person who names a transition in their own words keeps every join as
// given. Pure, unit-tested (joins.test.ts).
import type { ClipForEdl } from "./edl";
import type { TransitionKind } from "./types";

/** Speech this close to a join (seconds, either side) counts as talking across it. */
export const SPEECH_AT_JOIN_SEC = 0.3;
/** Both shots at least this long before a dissolve joins them. */
export const DISSOLVE_MIN_SHOT_SEC = 2.5;
/** The same clip has to skip ahead more than this for a dissolve not to ghost the same picture. */
export const DISSOLVE_MIN_SKIP_SEC = 3;

export type JoinWhy = "asked" | "speech" | "skip" | "montage" | "style" | "quick" | "near";
export type Join = { index: number; transition: TransitionKind; why: JoinWhy };

export const JOIN_WHY: Record<JoinWhy, string> = {
  asked: "the transition you asked for",
  speech: "someone is talking here, so a hard cut keeps the words clear",
  skip: "the shot skips ahead, so a short dissolve shows the time passing",
  montage: "a new shot, joined with a short soft dissolve",
  style: "a hard cut, as this editing style joins its shots",
  quick: "a hard cut: the shots are quick, and a dissolve would blur two pictures together",
  near: "a hard cut: it's the same shot a moment later, and a dissolve would show it twice",
};

/** The words a person named that mean they chose the joins themselves. */
const ASKED = /\b(whip|zoom|hard cuts?|jump cuts?|no transitions?|dissolves?|crossfades?)\b/i;

type Seg = { clipId: string; in: number; out: number; transition?: TransitionKind; voiceTail?: number };

/** Whether a word of this clip is being said within `pad` seconds of time `t`. */
function talkingAt(clip: Pick<ClipForEdl, "words"> | undefined, t: number, side: "before" | "after", pad = SPEECH_AT_JOIN_SEC): boolean {
  const ms = t * 1000, padMs = pad * 1000;
  return Boolean(clip?.words?.some((w) => (side === "before" ? w.endMs > ms - padMs && w.startMs < ms : w.startMs < ms + padMs && w.endMs > ms)));
}

/**
 * Every join after the first shot, decided. The segments come back with their
 * transitions set (a hard cut is no transition); `joins` says why for each.
 */
export function decideJoins<T extends Seg>(segments: T[], clips: Pick<ClipForEdl, "id" | "words">[], asked?: string | null, between: "dissolve" | "cut" = "dissolve"): { segments: T[]; joins: Join[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  if (asked && ASKED.test(asked)) {
    return { segments, joins: segments.slice(1).map((s, k) => ({ index: k + 1, transition: s.transition ?? "cut", why: "asked" as const })) };
  }
  const joins: Join[] = [];
  const out = segments.map((s, i) => {
    if (!i) { const { transition: _t, ...rest } = s; void _t; return rest as T; }
    const prev = segments[i - 1];
    const speech = Boolean(prev.voiceTail) || talkingAt(byId.get(prev.clipId), prev.out, "before") || talkingAt(byId.get(s.clipId), s.in, "after");
    if (speech) {
      joins.push({ index: i, transition: "cut", why: "speech" });
      const { transition: _t, ...rest } = s; void _t;
      return rest as T;
    }
    // A style that joins with hard cuts (talking, demos, fast edits; lib/studioClips/profiles.ts).
    if (between === "cut") {
      joins.push({ index: i, transition: "cut", why: "style" });
      const { transition: _t, ...rest } = s; void _t;
      return rest as T;
    }
    // Quick shots, or the same shot a moment later: a dissolve would blur or double the picture.
    const why: JoinWhy | null = prev.out - prev.in < DISSOLVE_MIN_SHOT_SEC || s.out - s.in < DISSOLVE_MIN_SHOT_SEC ? "quick"
      : prev.clipId === s.clipId && Math.abs(s.in - prev.out) <= DISSOLVE_MIN_SKIP_SEC ? "near" : null;
    if (why) {
      joins.push({ index: i, transition: "cut", why });
      const { transition: _t, ...rest } = s; void _t;
      return rest as T;
    }
    joins.push({ index: i, transition: "fade", why: prev.clipId === s.clipId ? "skip" : "montage" });
    return { ...s, transition: "fade" as const };
  });
  return { segments: out, joins };
}

/** One line for the cut's notes: how the joins were chosen. "" when there is only one shot. */
export function joinsNote(joins: Join[]): string {
  if (!joins.length || joins.every((j) => j.why === "asked")) return "";
  const n = (why: JoinWhy) => joins.filter((j) => j.why === why).length;
  const soft = n("skip") + n("montage"), hard = n("speech"), styled = n("style"), sharp = n("quick") + n("near");
  const parts = [
    soft ? `${soft} soft dissolve${soft === 1 ? "" : "s"} where time passes between longer shots` : "",
    sharp ? `${sharp} hard cut${sharp === 1 ? "" : "s"} between quick shots, so the picture stays sharp` : "",
    hard ? `${hard} hard cut${hard === 1 ? "" : "s"} where someone is talking, so the words stay clear` : "",
    styled ? `${styled} hard cut${styled === 1 ? "" : "s"} between shots, as this style is cut` : "",
  ].filter(Boolean);
  return `SOCIA chose each join: ${parts.join(" and ")}.`;
}
