// A hard cut between two pieces of the same clip is a jump cut: the picture
// jumps while the framing stays. Punching in slightly on every other piece of
// such a run makes each cut read as a change of shot, the way an editor does
// it by hand. A new clip always opens at its own framing, and a piece the
// person framed themselves is never touched. Pure, unit-tested.
import type { Edl, EdlSegment, SegmentFrame } from "./types";

export const JUMP = {
  /** how far the alternate pieces punch in */
  zoom: 1.08,
  /** where the punch-in looks: centred, a little above the middle, where a face usually is */
  x: 0.5,
  y: 0.45,
} as const;

const AUTO: SegmentFrame = { zoom: JUMP.zoom, x: JUMP.x, y: JUMP.y };

/** A framing this module set (and may change or remove), as opposed to one the person chose. */
export const isAutoFrame = (f: SegmentFrame | undefined): boolean => Boolean(f) && f!.zoom === AUTO.zoom && f!.x === AUTO.x && f!.y === AUTO.y;
const untouched = (s: EdlSegment) => !s.frame || isAutoFrame(s.frame) || (s.frame.zoom === 1 && s.frame.x === 0.5 && s.frame.y === 0.5);

/** Whether segment i joins the one before it with a jump cut: the same clip, a hard cut. */
const jumps = (segments: EdlSegment[], i: number) => i > 0 && segments[i].clipId === segments[i - 1].clipId && (segments[i].transition ?? "cut") === "cut";

/** How many jump cuts the edit has. */
export function jumpCutCount(edl: Edl): number {
  return edl.segments.filter((_, i) => jumps(edl.segments, i)).length;
}

/** How many pieces currently carry the punch-in. */
export function variedCount(edl: Edl): number {
  return edl.segments.filter((s) => isAutoFrame(s.frame)).length;
}

/**
 * Alternate the framing through each run of jump cuts: the first piece as it
 * is, the next punched in, the next back out. Idempotent, and it also takes
 * the punch-in off a piece that is no longer part of a run.
 */
export function varyJumpCuts(edl: Edl): { edl: Edl; changed: number } {
  let changed = 0;
  let position = 0; // 0 = the first piece of a run
  const segments = edl.segments.map((s, i) => {
    position = jumps(edl.segments, i) ? position + 1 : 0;
    if (!untouched(s)) return s;
    const want = position % 2 === 1;
    if (want === isAutoFrame(s.frame)) return s;
    changed++;
    if (want) return { ...s, frame: { ...AUTO } };
    const { frame: _drop, ...rest } = s;
    void _drop;
    return rest;
  });
  return changed ? { edl: { ...edl, segments }, changed } : { edl, changed: 0 };
}

/** Take every punch-in this module set back off. */
export function clearJumpCuts(edl: Edl): { edl: Edl; changed: number } {
  let changed = 0;
  const segments = edl.segments.map((s) => {
    if (!isAutoFrame(s.frame)) return s;
    changed++;
    const { frame: _drop, ...rest } = s;
    void _drop;
    return rest;
  });
  return changed ? { edl: { ...edl, segments }, changed } : { edl, changed: 0 };
}
