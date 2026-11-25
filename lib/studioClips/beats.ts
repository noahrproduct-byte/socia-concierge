// Cuts on the beat. When a cut has music, each boundary between two cuts is
// moved onto the nearest beat of the track (its measured tempo and where its
// first beat falls, or the tempo the track was made at), by trimming the
// outgoing cut inside its own clip. A boundary further than the tolerance
// from a beat, one that would leave a cut shorter than the minimum, or one
// whose move would land inside a word, stays where it is. Pure, unit-tested.
import type { ClipForEdl } from "./edl";
import { EDL_DEFAULTS, snapTime } from "./edl";
import { overlapFrames, timeline } from "./timeline";
import { PACING } from "./pacing";
import { endOpeningWithShot, jumpsInTake } from "./cutCheck";
import type { Edl, EdlSegment } from "./types";

export type Beat = { bpm: number; /** seconds from the start of the cut to the first beat */ offsetSec: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How far a boundary may move to reach a beat: up to half a beat, never more than PACING.beatMoveSec. */
export const beatMove = (bpm: number): number => (bpm > 0 ? Math.min(PACING.beatMoveSec, 60 / bpm / 2) : PACING.beatMoveSec);
/** How close to a beat counts as on it: a quarter of a beat, never more than PACING.beatToleranceSec. */
export const beatTolerance = (bpm: number): number => (bpm > 0 ? Math.min(PACING.beatToleranceSec, 60 / bpm / 4) : PACING.beatToleranceSec);

/** A track's beat as the cut hears it when its music starts `startSec` into the track (Soundtrack.startSec). */
export function beatFromStart<B extends Beat>(beat: B, startSec: number | undefined): B {
  const period = 60 / beat.bpm;
  if (!startSec || !(period > 0)) return beat;
  return { ...beat, offsetSec: r3((((beat.offsetSec - startSec) % period) + period) % period) };
}

/** The beat nearest to `t` on the grid. */
export function nearestBeat(t: number, beat: Beat): number {
  const period = 60 / beat.bpm;
  const k = Math.round((t - beat.offsetSec) / period);
  return r2(beat.offsetSec + k * period);
}

/** The output second where the cut into segment `i` is seen: the middle of its transition's overlap. */
export function cutPoint(edl: Pick<Edl, "segments" | "fps">, i: number): number {
  const tl = timeline({ ...edl, audio: [] } as unknown as Edl);
  const s = tl.segments[i];
  return s ? r2(s.startSec + s.overlapIn / 2 / edl.fps) : 0;
}

export type BeatResult = { edl: Edl; moved: number; total: number; bpm: number };

/**
 * Move the cut into segment `i` onto `target` (an output second) by trimming the outgoing
 * cut inside its own clip, when that lands within `tolerance` of a point `on(after)` and breaks
 * nothing (a cut too short, a word split, a jump inside one moving shot). Mutates `segments`.
 */
function moveCut(segments: EdlSegment[], i: number, target: number, maxMoveSec: number, tolerance: number, on: (t: number) => number, byId: Map<string, ClipForEdl>, fps: Edl["fps"]): boolean {
  const prev = segments[i - 1];
  const clip = byId.get(prev.clipId);
  if (!clip) return false;
  const at = cutPoint({ segments, fps }, i);
  const delta = target - at;
  if (Math.abs(delta) < 0.02 || Math.abs(delta) > maxMoveSec) return false;
  // The outgoing cut gives or takes the difference, inside its clip and off the middle of a word.
  const wantOut = prev.out + delta;
  // In whole frames of the cut's rounded length, so the timeline lands exactly on the target.
  const frames = Math.round((prev.out - prev.in) * fps) + Math.round(delta * fps);
  const framed = r3(Math.min(clip.durationSec, Math.max(0, prev.in + frames / fps)));
  const out = clip.words?.length ? snapTime(wantOut, clip, "out") : framed;
  if (out - prev.in < EDL_DEFAULTS.minSegmentSec || out > clip.durationSec + 1e-6) return false;
  // Snapping to a word may have pulled it off the target again: keep it only if still inside the tolerance.
  const trial = segments.map((s, k) => (k === i - 1 ? { ...s, out } : s));
  const after = cutPoint({ segments: trial, fps }, i);
  if (Math.abs(after - on(after)) > tolerance) return false;
  if (Math.abs(out - prev.out) < 0.02) return false;
  // Never move a cut so that one moving shot skips a second or two inside itself (a glitch, 2026-11-12).
  const next = segments[i];
  if (next && jumpsInTake({ clipId: prev.clipId, out }, next, clip) && !jumpsInTake(prev, next, clip)) return false;
  prev.out = out;
  return true;
}

/**
 * Every cut boundary onto the beat where it can be. Boundaries are visited in
 * order, so each move already counts the ones before it.
 */
export function alignToBeats(edl: Edl, clips: ClipForEdl[], beat: Beat, maxMoveSec: number = beatMove(beat.bpm)): BeatResult {
  if (!(beat.bpm > 0) || edl.segments.length < 2) return { edl, moved: 0, total: Math.max(0, edl.segments.length - 1), bpm: beat.bpm };
  const byId = new Map(clips.map((c) => [c.id, c]));
  const segments: EdlSegment[] = edl.segments.map((s) => ({ ...s }));
  let moved = 0;
  for (let i = 1; i < segments.length; i++) {
    const target = nearestBeat(cutPoint({ segments, fps: edl.fps }, i), beat);
    if (moveCut(segments, i, target, maxMoveSec, beatTolerance(beat.bpm), (t) => nearestBeat(t, beat), byId, edl.fps)) moved++;
  }
  // An opening line still ends with its shot after the cut moved (lib/studioClips/cutCheck.ts).
  return { edl: endOpeningWithShot({ ...edl, segments }).edl, moved, total: segments.length - 1, bpm: beat.bpm };
}

/** How far a cut may move to land on a musical moment, and how close counts as on it. */
export const MOMENT_MOVE_SEC = 0.6;
const MOMENT_TOLERANCE_SEC = 0.08;

/**
 * A cut onto each musical moment (where the reference's music lifts: lib/music/referenceMusic.ts
 * drops, as output seconds): the nearest cut boundary moves onto it when it is within MOMENT_MOVE_SEC.
 * Run after alignToBeats, so a moment wins over the plain beat for the cut nearest it.
 */
export function alignToMoments(edl: Edl, clips: ClipForEdl[], moments: number[], maxMoveSec = MOMENT_MOVE_SEC): { edl: Edl; moved: number; landed: number } {
  if (!moments.length || edl.segments.length < 2) return { edl, moved: 0, landed: 0 };
  const byId = new Map(clips.map((c) => [c.id, c]));
  const segments: EdlSegment[] = edl.segments.map((s) => ({ ...s }));
  let moved = 0, landed = 0;
  for (const m of moments) {
    let best = -1, gap = Infinity;
    for (let i = 1; i < segments.length; i++) { const d = Math.abs(cutPoint({ segments, fps: edl.fps }, i) - m); if (d < gap) { gap = d; best = i; } }
    if (best < 1 || gap > maxMoveSec) continue;
    if (gap <= MOMENT_TOLERANCE_SEC) { landed++; continue; }
    if (moveCut(segments, best, r2(m), maxMoveSec, MOMENT_TOLERANCE_SEC, () => r2(m), byId, edl.fps)) { moved++; landed++; }
  }
  return { edl: moved ? endOpeningWithShot({ ...edl, segments }).edl : edl, moved, landed };
}

/** Whether the overlap of a transition would be wider than the beat allows; exported for the report. */
export const overlapSec = (edl: Edl, i: number): number => {
  const cur = edl.segments[i], prev = edl.segments[i - 1];
  if (!cur || !prev) return 0;
  return overlapFrames(cur.transition, Math.round((prev.out - prev.in) * edl.fps), Math.round((cur.out - cur.in) * edl.fps)) / edl.fps;
};
