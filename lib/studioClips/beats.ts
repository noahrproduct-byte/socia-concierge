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
import { endOpeningWithShot } from "./cutCheck";
import type { Edl, EdlSegment } from "./types";

export type Beat = { bpm: number; /** seconds from the start of the cut to the first beat */ offsetSec: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How far a boundary may move to reach a beat: up to half a beat, never more than PACING.beatMoveSec. */
export const beatMove = (bpm: number): number => (bpm > 0 ? Math.min(PACING.beatMoveSec, 60 / bpm / 2) : PACING.beatMoveSec);
/** How close to a beat counts as on it: a quarter of a beat, never more than PACING.beatToleranceSec. */
export const beatTolerance = (bpm: number): number => (bpm > 0 ? Math.min(PACING.beatToleranceSec, 60 / bpm / 4) : PACING.beatToleranceSec);

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
 * Every cut boundary onto the beat where it can be. Boundaries are visited in
 * order, so each move already counts the ones before it.
 */
export function alignToBeats(edl: Edl, clips: ClipForEdl[], beat: Beat, maxMoveSec: number = beatMove(beat.bpm)): BeatResult {
  if (!(beat.bpm > 0) || edl.segments.length < 2) return { edl, moved: 0, total: Math.max(0, edl.segments.length - 1), bpm: beat.bpm };
  const byId = new Map(clips.map((c) => [c.id, c]));
  const segments: EdlSegment[] = edl.segments.map((s) => ({ ...s }));
  let moved = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const clip = byId.get(prev.clipId);
    if (!clip) continue;
    const at = cutPoint({ segments, fps: edl.fps }, i);
    const target = nearestBeat(at, beat);
    const delta = target - at;
    if (Math.abs(delta) < 0.02 || Math.abs(delta) > maxMoveSec) continue;
    // The outgoing cut gives or takes the difference, inside its clip and off the middle of a word.
    const wantOut = prev.out + delta;
    // In whole frames of the cut's rounded length, so the timeline lands exactly on the beat.
    const frames = Math.round((prev.out - prev.in) * edl.fps) + Math.round(delta * edl.fps);
    const framed = r3(Math.min(clip.durationSec, Math.max(0, prev.in + frames / edl.fps)));
    const out = clip.words?.length ? snapTime(wantOut, clip, "out") : framed;
    if (out - prev.in < EDL_DEFAULTS.minSegmentSec || out > clip.durationSec + 1e-6) continue;
    // Snapping to a word may have pulled it off the beat again: keep it only if still inside the tolerance.
    const trial = segments.map((s, k) => (k === i - 1 ? { ...s, out } : s));
    const after = cutPoint({ segments: trial, fps: edl.fps }, i);
    if (Math.abs(after - nearestBeat(after, beat)) > beatTolerance(beat.bpm)) continue;
    if (Math.abs(out - prev.out) < 0.02) continue;
    prev.out = out;
    moved++;
  }
  // An opening line still ends with its shot after the cut moved (lib/studioClips/cutCheck.ts).
  return { edl: endOpeningWithShot({ ...edl, segments }).edl, moved, total: segments.length - 1, bpm: beat.bpm };
}

/** Whether the overlap of a transition would be wider than the beat allows; exported for the report. */
export const overlapSec = (edl: Edl, i: number): number => {
  const cur = edl.segments[i], prev = edl.segments[i - 1];
  if (!cur || !prev) return 0;
  return overlapFrames(cur.transition, Math.round((prev.out - prev.in) * edl.fps), Math.round((cur.out - cur.in) * edl.fps)) / edl.fps;
};
