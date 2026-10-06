// The EDL on a frame timeline. Shared by the Remotion composition (preview
// and render), the builder's controls and the tests, so every surface agrees
// on where each cut, text line and caption falls. Pure.
import type { Edl, EdlSegment, TranscriptWord } from "./types";
import { OUTPUT } from "./types";

export const FPS = OUTPUT.fps;
export const secToFrames = (s: number): number => Math.max(0, Math.round(s * FPS));
export const framesToSec = (f: number): number => f / FPS;
/** dB → linear gain for volume props. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export type TimelineSegment = EdlSegment & {
  /** output-relative start, seconds / frames */
  startSec: number;
  startFrame: number;
  durationFrames: number;
  /** clip-relative in point in frames (the trim) */
  inFrame: number;
  /** measured balance for this clip (0 when none) */
  gainDb: number;
};

export type Timeline = { segments: TimelineSegment[]; durationFrames: number; durationSec: number };

export function timeline(edl: Edl): Timeline {
  const gain = new Map(edl.audio.map((a) => [a.clipId, a.gainDb]));
  let frame = 0;
  const segments: TimelineSegment[] = [];
  for (const s of edl.segments) {
    const durationFrames = Math.max(1, secToFrames(s.out - s.in));
    segments.push({ ...s, startSec: framesToSec(frame), startFrame: frame, durationFrames, inFrame: secToFrames(s.in), gainDb: gain.get(s.clipId) ?? 0 });
    frame += durationFrames;
  }
  return { segments, durationFrames: Math.max(1, frame), durationSec: framesToSec(Math.max(1, frame)) };
}

/** The shape @remotion/captions expects (kept local so this module stays dependency-free). */
export type CaptionLike = { text: string; startMs: number; endMs: number; timestampMs: number | null; confidence: number | null };

/**
 * Transcript words that fall inside each segment's trim, moved onto the
 * output timeline. A word straddling a cut is kept if its middle is inside.
 * Captions come from real words only: no words, no captions.
 */
export function captionsForEdl(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>): CaptionLike[] {
  const out: CaptionLike[] = [];
  for (const s of timeline(edl).segments) {
    const ws = words[s.clipId];
    if (!ws?.length) continue;
    const inMs = s.in * 1000, outMs = s.out * 1000, offsetMs = s.startSec * 1000 - inMs;
    for (const w of ws) {
      const mid = (w.startMs + w.endMs) / 2;
      if (mid < inMs || mid > outMs) continue;
      out.push({
        text: ` ${w.text}`,
        startMs: Math.round(Math.max(inMs, w.startMs) + offsetMs),
        endMs: Math.round(Math.min(outMs, w.endMs) + offsetMs),
        timestampMs: Math.round(mid + offsetMs),
        confidence: w.confidence,
      });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Short fades at each segment's edges so cuts never click; 0..1 by frame within the segment. */
export function edgeEnvelope(frameInSegment: number, durationFrames: number, fadeFrames = Math.round(FPS * 0.15)): number {
  const fade = Math.max(1, Math.min(fadeFrames, Math.floor(durationFrames / 2)));
  const inRamp = Math.min(1, (frameInSegment + 1) / fade);
  const outRamp = Math.min(1, (durationFrames - frameInSegment) / fade);
  return Math.max(0, Math.min(1, Math.min(inRamp, outRamp)));
}
