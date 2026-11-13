// The EDL on a frame timeline. Shared by the Remotion composition (preview
// and render), the builder's controls and the tests, so every surface agrees
// on where each cut, text line and caption falls. Pure.
import type { Edl, EdlSegment, TranscriptWord, TransitionKind } from "./types";
import { OUTPUT } from "./types";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import { cleanCaptionWords } from "./captionClean";
import { clipSecAt, segmentFrames } from "./motion";

export const FPS = OUTPUT.fps;
export const secToFrames = (s: number): number => Math.max(0, Math.round(s * FPS));
export const framesToSec = (f: number): number => f / FPS;
/** dB → linear gain for volume props. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** A transition overlaps two cuts for this many frames (about 0.27 s, CapCut's usual length). */
export const TRANSITION_FRAMES = 9;

/** Frames a cut overlaps the one before it: none for a hard cut, and never more than half of either cut. */
export function overlapFrames(kind: TransitionKind | undefined, prevFrames: number, curFrames: number): number {
  if (!kind || kind === "cut" || kind === "flash" || kind === "tape") return 0;
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
    const durationFrames = Math.max(1, segmentFrames(s));
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
    // A voice carried over the next shot (an L-cut) keeps its captions.
    const inMs = s.in * 1000, outMs = (s.out + (s.voiceTail ?? 0)) * 1000, offsetMs = s.startSec * 1000 - inMs;
    // A cut with a speed change: a word's time in the output follows the clip time through the speed pieces.
    const sped = Boolean(s.motion?.speed && s.motion.speed.rate !== 1);
    const toOut = (clipMs: number): number => (sped ? Math.round(s.startSec * 1000 + outputMsFor(s, clipMs / 1000)) : Math.round(clipMs + offsetMs));
    for (const w of ws) {
      const mid = (w.startMs + w.endMs) / 2;
      if (mid < inMs || mid > outMs) continue;
      out.push({
        text: ` ${w.text}`,
        startMs: toOut(Math.max(inMs, w.startMs)),
        endMs: toOut(Math.min(outMs, w.endMs)),
        timestampMs: toOut(mid),
        confidence: w.confidence,
      });
    }
  }
  // A voiceover's words caption like anyone's (lib/studioClips/voiceover.ts), while it is on.
  const vo = edl.voiceover;
  if (vo?.on) {
    const endMs = timeline(edl).durationSec * 1000;
    for (const l of vo.lines) {
      if (!l.path || !l.words) continue;
      for (const w of l.words) {
        const startMs = Math.round((l.at + w.start) * 1000), wEnd = Math.round((l.at + w.end) * 1000);
        if (startMs >= endMs) continue;
        out.push({ text: ` ${w.text}`, startMs, endMs: Math.min(wEnd, Math.round(endMs)), timestampMs: Math.round((startMs + wEnd) / 2), confidence: 1 });
      }
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The output time (ms from the cut's start) at which `clipSec` of a sped cut plays: the inverse of clipSecAt, by search. */
function outputMsFor(s: { in: number; out: number; motion?: EdlSegment["motion"] }, clipSec: number): number {
  const frames = segmentFrames(s);
  let lo = 0, hi = frames;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (clipSecAt(s, mid) < clipSec) lo = mid; else hi = mid; }
  return (hi / FPS) * 1000;
}

/** Two frames of fade at each segment's edge, so a cut never clicks and a word never ducks; 0..1 by frame within the segment. */
export const EDGE_FADE_FRAMES = 2;
export function edgeEnvelope(frameInSegment: number, durationFrames: number, fadeFrames = EDGE_FADE_FRAMES): number {
  const fade = Math.max(1, Math.min(fadeFrames, Math.floor(durationFrames / 2)));
  const inRamp = Math.min(1, (frameInSegment + 1) / fade);
  const outRamp = Math.min(1, (durationFrames - frameInSegment) / fade);
  return Math.max(0, Math.min(1, Math.min(inRamp, outRamp)));
}

/** An L-cut's sound: the next shot's own sound sits this low while the voice before it carries over. */
export const UNDER_VOICE = 0.15;
const VOICE_RAMP_FRAMES = 6;
/** How loud a shot's own sound is at `frame` while the previous shot's voice carries over its first `tailFrames`. */
export function underVoice(frame: number, tailFrames: number): number {
  if (tailFrames <= 0 || frame >= tailFrames + VOICE_RAMP_FRAMES) return 1;
  if (frame < tailFrames) return UNDER_VOICE;
  return UNDER_VOICE + (1 - UNDER_VOICE) * ((frame - tailFrames) / VOICE_RAMP_FRAMES);
}
/** The carried voice itself: full, then a short fade at its end so it never clicks. */
export function voiceTailEnvelope(frame: number, tailFrames: number): number {
  return Math.max(0, Math.min(1, (tailFrames - frame) / (EDGE_FADE_FRAMES * 2)));
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

/** One page as several of at most `maxWords` words, each new one starting when its first word is spoken. A sentence's end always closes a page. */
export function splitCaptionPage(page: TikTokPage, maxWords: number): TikTokPage[] {
  const groups: TikTokPage["tokens"][] = [[]];
  page.tokens.forEach((t, i) => {
    const cur = groups[groups.length - 1];
    cur.push(t);
    if ((cur.length >= maxWords || /[.!?…]["')\]]?\s*$/.test(t.text)) && i < page.tokens.length - 1) groups.push([]);
  });
  return groups.map((tokens) => {
    const clean = tokens.map((t, i) => (i ? t : { ...t, text: t.text.trimStart() }));
    const startMs = clean[0].fromMs;
    return { text: clean.map((t) => t.text).join(""), startMs, durationMs: clean[clean.length - 1].toMs - startMs, tokens: clean };
  });
}

/**
 * The caption pages on the frame timeline. A page runs from its first word
 * to the end of its last word (never cut off at the page length: a word that
 * starts late in the page still finishes), and never past the next page.
 */
export function captionPages(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, fps: number = FPS, pageMs: number = CAPTION_PAGE_MS, maxWords: number = 0): CaptionPageSpan[] {
  if (!edl.captions) return [];
  const captions = captionsForEdl(edl, words);
  if (!captions.length) return [];
  const tl = timeline(edl);
  const total = tl.durationFrames;
  // A page never runs across a cut, or the next shot's first word shows over this one.
  const starts = tl.segments.map((s) => (s.startFrame / fps) * 1000);
  const shotOf = (ms: number) => starts.reduce((at, s, i) => (ms >= s ? i : at), 0);
  const pages = starts.flatMap((_, i) => {
    const inShot = captions.filter((c) => shotOf(c.startMs) === i);
    const made = inShot.length ? createTikTokStyleCaptions({ captions: inShot, combineTokensWithinMilliseconds: pageMs }).pages : [];
    return maxWords > 0 ? splitPages(made, maxWords) : made;
  });
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

/**
 * One text at a time (Noah, 2026-11-12): spoken captions step aside while a
 * designed line or the ending card is on screen. A page that starts under one
 * is left out; a page that runs into one ends where it comes in.
 * `cardFrom` is the frame the ending card comes in (Infinity when there is none).
 */
export function clearOfText(pages: CaptionPageSpan[], edl: Pick<Edl, "text">, fps: number = FPS, cardFrom: number = Infinity): CaptionPageSpan[] {
  const busy = edl.text
    .filter((t) => t.text.trim())
    .map((t) => ({ from: Math.round(t.at * fps), to: Math.round(t.end * fps) }))
    .concat(Number.isFinite(cardFrom) ? [{ from: Math.round(cardFrom), to: Infinity }] : []);
  if (!busy.length) return pages;
  return pages.flatMap((p) => {
    if (busy.some((b) => p.from >= b.from && p.from < b.to)) return [];
    const end = Math.min(p.from + p.durationInFrames, ...busy.filter((b) => b.from > p.from).map((b) => b.from));
    return end - p.from >= Math.round(fps * 0.3) ? [{ ...p, durationInFrames: end - p.from }] : [];
  });
}

/**
 * Pages with at most `maxWords` words each (a caption style's "three words at
 * a time", "one word at a time"). A page with more is cut into runs of that
 * many; each run starts when its first word does. Word timings are untouched.
 */
export function splitPages(pages: TikTokPage[], maxWords: number): TikTokPage[] {
  const out: TikTokPage[] = [];
  for (const p of pages) {
    const tokens = p.tokens.filter((t) => t.text.trim());
    if (tokens.length <= maxWords) { out.push(p); continue; }
    for (let i = 0; i < tokens.length; i += maxWords) {
      const run = tokens.slice(i, i + maxWords);
      const startMs = run[0].fromMs;
      out.push({ text: run.map((t) => t.text).join(""), startMs, durationMs: Math.max(0, run[run.length - 1].toMs - startMs), tokens: run });
    }
  }
  return out;
}
