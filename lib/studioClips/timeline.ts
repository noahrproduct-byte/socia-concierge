// The EDL on a frame timeline. Shared by the Remotion composition (preview
// and render), the builder's controls and the tests, so every surface agrees
// on where each cut, text line and caption falls. Pure.
import type { Edl, EdlSegment, TranscriptWord, TransitionKind } from "./types";
import { OUTPUT } from "./types";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import { cleanCaptionWords } from "./captionClean";

export const FPS = OUTPUT.fps;
export const secToFrames = (s: number): number => Math.max(0, Math.round(s * FPS));
export const framesToSec = (f: number): number => f / FPS;
/** dB → linear gain for volume props. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** A transition overlaps two cuts for this many frames (about 0.27 s, CapCut's usual length). */
export const TRANSITION_FRAMES = 8;

/** Frames a cut overlaps the one before it: none for a hard cut, and never more than half of either cut. */
export function overlapFrames(kind: TransitionKind | undefined, prevFrames: number, curFrames: number): number {
  if (!kind || kind === "cut") return 0;
  return Math.max(0, Math.min(TRANSITION_FRAMES, Math.floor(prevFrames / 2), Math.floor(curFrames / 2)));
}

export type TimelineSegment = EdlSegment & {
  /** output-relative start, seconds / frames */
  startSec: number;
  startFrame: number;
  durationFrames: number;
  /** frames this cut overlaps the previous one (its transition in) and the next one (the next cut's transition) */
  overlapIn: number;
  overlapOut: number;
  /** clip-relative in point in frames (the trim) */
  inFrame: number;
  /** measured balance for this clip (0 when none) */
  gainDb: number;
};

export type Timeline = { segments: TimelineSegment[]; durationFrames: number; durationSec: number };

export function timeline(edl: Edl): Timeline {
  const gain = new Map(edl.audio.map((a) => [a.clipId, a.gainDb]));
  // Each cut starts where the one before ends, less the overlap of its transition.
  let frame = 0;
  const segments: TimelineSegment[] = [];
  edl.segments.forEach((s, i) => {
    const durationFrames = Math.max(1, secToFrames(s.out - s.in));
    const prev = segments[i - 1];
    const overlapIn = prev ? overlapFrames(s.transition, prev.durationFrames, durationFrames) : 0;
    if (prev) prev.overlapOut = overlapIn;
    const startFrame = Math.max(0, frame - overlapIn);
    segments.push({ ...s, startSec: framesToSec(startFrame), startFrame, durationFrames, overlapIn, overlapOut: 0, inFrame: secToFrames(s.in), gainDb: gain.get(s.clipId) ?? 0 });
    frame = startFrame + durationFrames;
  });
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
  const cleaned = new Map<string, TranscriptWord[]>();
  for (const s of timeline(edl).segments) {
    const said = words[s.clipId];
    if (!said?.length) continue;
    // What the caption shows: broken-off words, stutters and filler sounds tidied (lib/studioClips/captionClean.ts).
    const ws = cleaned.get(s.clipId) ?? cleaned.set(s.clipId, cleanCaptionWords(said)).get(s.clipId)!;
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

/** Two frames of fade at each segment's edge, so a cut never clicks and a word never ducks; 0..1 by frame within the segment. */
export const EDGE_FADE_FRAMES = 2;
export function edgeEnvelope(frameInSegment: number, durationFrames: number, fadeFrames = EDGE_FADE_FRAMES): number {
  const fade = Math.max(1, Math.min(fadeFrames, Math.floor(durationFrames / 2)));
  const inRamp = Math.min(1, (frameInSegment + 1) / fade);
  const outRamp = Math.min(1, (durationFrames - frameInSegment) / fade);
  return Math.max(0, Math.min(1, Math.min(inRamp, outRamp)));
}

/**
 * Where a clip's video sits in the output frame (Editor V1 reframe). The
 * element keeps the footage's own aspect (so "fill" never distorts it), is
 * sized to cover the frame, scaled by the zoom, and offset so the chosen
 * focus point (0..1 each way) sits in view; anything outside the frame is
 * simply not drawn. Unknown footage size: null, and the clip is drawn
 * centred with object-fit cover as before. With no reframe this matches
 * cover, centred.
 */
export function videoBox(srcW: number | null, srcH: number | null, outW: number, outH: number, frame?: { zoom: number; x: number; y: number }): { position: "absolute"; width: string; height: string; left: string; top: string } | null {
  if (!srcW || !srcH || !outW || !outH) return null;
  const srcA = srcW / srcH, outA = outW / outH;
  const z = Math.min(3, Math.max(1, frame?.zoom ?? 1));
  const w = (srcA > outA ? (srcA / outA) * 100 : 100) * z;
  const h = (srcA > outA ? 100 : (outA / srcA) * 100) * z;
  const x = Math.min(1, Math.max(0, frame?.x ?? 0.5)), y = Math.min(1, Math.max(0, frame?.y ?? 0.5));
  const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
  return { position: "absolute", width: pct(w), height: pct(h), left: pct(-(w - 100) * x), top: pct(-(h - 100) * y) };
}

/** Captions page every ~1.2 s, like the short-form captions people are used to. */
export const CAPTION_PAGE_MS = 1200;

export type CaptionPageSpan = { page: TikTokPage; from: number; durationInFrames: number };

/**
 * The caption pages on the frame timeline. A page runs from its first word
 * to the end of its last word (never cut off at the page length: a word that
 * starts late in the page still finishes), and never past the next page.
 */
export function captionPages(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, fps: number = FPS, pageMs: number = CAPTION_PAGE_MS): CaptionPageSpan[] {
  if (!edl.captions) return [];
  const captions = captionsForEdl(edl, words);
  if (!captions.length) return [];
  const { pages } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: pageMs });
  const total = timeline(edl).durationFrames;
  const out: CaptionPageSpan[] = [];
  pages.forEach((page, i) => {
    const from = Math.round((page.startMs / 1000) * fps);
    const lastMs = Math.max(page.startMs + pageMs, ...page.tokens.map((t) => t.toMs));
    const next = pages[i + 1];
    const end = Math.min(next ? Math.round((next.startMs / 1000) * fps) : total, Math.round((lastMs / 1000) * fps), total);
    if (end - from > 0) out.push({ page, from, durationInFrames: end - from });
  });
  return out;
}
