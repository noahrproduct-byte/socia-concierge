// The editor's multi-track timeline (Editor V2): what sits on each track and
// where, in output seconds, and how a text line moves or resizes when it is
// dragged. Shared by the timeline component and the tests. Pure.

import type { Edl } from "./types";
import { timeline, captionsForEdl } from "./timeline";
import type { TranscriptWord } from "@/lib/transcribe/types";

export type TrackItem = { index: number; start: number; end: number; label: string };
export type Tracks = { duration: number; video: TrackItem[]; text: TrackItem[]; captions: { start: number; end: number }[]; /** B-roll laid over the picture (edl.broll), by its index */ broll: TrackItem[] };

/** Captions closer than this merge into one span on the track. */
const CAPTION_GAP_SEC = 0.6;
/** The shortest a text line may be. */
export const MIN_TEXT_SEC = 0.5;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function tracksFor(edl: Edl, label: (clipId: string) => string, words: Record<string, TranscriptWord[] | null | undefined>, captionsOn: boolean): Tracks {
  const tl = timeline(edl);
  const video = tl.segments.map((s, index) => ({ index, start: r2(s.startSec), end: r2(s.startSec + s.durationFrames / edl.fps), label: label(s.clipId) }));
  const text = edl.text.map((t, index) => ({ index, start: t.at, end: t.end, label: t.text }));
  const captions: { start: number; end: number }[] = [];
  if (captionsOn && edl.captions) {
    for (const c of captionsForEdl(edl, words)) {
      const start = c.startMs / 1000, end = c.endMs / 1000;
      const last = captions[captions.length - 1];
      if (last && start - last.end < CAPTION_GAP_SEC) last.end = Math.max(last.end, end);
      else captions.push({ start, end });
    }
  }
  const broll = (edl.broll ?? []).map((b, index) => ({ index, start: b.at, end: r2(b.at + (b.out - b.in)), label: label(b.clipId) }));
  return { duration: tl.durationSec, video, text, captions: captions.map((c) => ({ start: r2(c.start), end: r2(c.end) })), broll };
}

/** Move a span by delta seconds, kept inside 0..total and its length unchanged. */
export function moveSpan(at: number, end: number, delta: number, total: number): { at: number; end: number } {
  const len = end - at;
  const a = Math.min(Math.max(0, at + delta), Math.max(0, total - len));
  return { at: r2(a), end: r2(a + len) };
}

/** Move one edge of a span, never shorter than MIN_TEXT_SEC and never outside 0..total. */
export function resizeSpan(at: number, end: number, edge: "start" | "end", delta: number, total: number): { at: number; end: number } {
  if (edge === "start") return { at: r2(Math.min(Math.max(0, at + delta), end - MIN_TEXT_SEC)), end };
  return { at, end: r2(Math.max(Math.min(total, end + delta), at + MIN_TEXT_SEC)) };
}

/**
 * Tick marks for a ruler. Without a scale: every second on short edits, every
 * five or ten on longer ones. With pixels per second (the timeline zoomed),
 * the smallest step that keeps labels at least RULER_MIN_PX apart.
 */
const RULER_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60];
const RULER_MIN_PX = 56;
export function rulerTicks(duration: number, pxPerSec?: number): number[] {
  const step = pxPerSec
    ? RULER_STEPS.find((st) => st * pxPerSec >= RULER_MIN_PX) ?? RULER_STEPS[RULER_STEPS.length - 1]
    : duration > 40 ? 10 : duration > 15 ? 5 : 1;
  const out: number[] = [];
  for (let i = 0; i * step <= duration + 1e-6; i++) out.push(r2(i * step));
  return out;
}

// ---- cuts on the video track ----------------------------------------------

/** The shortest a cut may be. */
export const MIN_CUT_SEC = 0.8;

/**
 * Drag one end of a cut by `delta` seconds of output time. The left edge
 * moving right starts the cut later in its clip; the right edge moving left
 * ends it sooner. Never shorter than MIN_CUT_SEC, never outside the clip.
 */
export function trimCut(cut: { in: number; out: number }, edge: "in" | "out", delta: number, clipSec: number): { in: number; out: number } {
  if (edge === "in") return { in: r2(Math.min(Math.max(0, cut.in + delta), cut.out - MIN_CUT_SEC)), out: cut.out };
  return { in: cut.in, out: r2(Math.max(Math.min(clipSec, cut.out + delta), cut.in + MIN_CUT_SEC)) };
}

/** The list with the item at `from` moved to `to` (an index in the result). */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const rest = list.filter((_, i) => i !== from);
  const at = Math.min(Math.max(0, to), rest.length);
  return [...rest.slice(0, at), list[from], ...rest.slice(at)];
}

/** Where a cut dragged to `sec` lands: after every other cut whose middle is left of the pointer. */
export function dropIndex(video: TrackItem[], sec: number, from: number): number {
  return video.filter((v, i) => i !== from && (v.start + v.end) / 2 < sec).length;
}

/** The time the drop marker shows for landing at `to`: the end of the cut it lands after. */
export function dropMarker(video: TrackItem[], from: number, to: number): number {
  const rest = video.filter((_, i) => i !== from);
  return to === 0 ? 0 : rest[Math.min(to, rest.length) - 1]?.end ?? 0;
}

/** Pull `t` onto the nearest target within `tol` seconds (cut boundaries, the playhead), else leave it. */
export function snapTo(t: number, targets: number[], tol: number): number {
  let best = t, gap = tol;
  for (const x of targets) {
    const g = Math.abs(x - t);
    if (g <= gap) { best = x; gap = g; }
  }
  return r2(best);
}


/** "0:03.2" style time for the timeline's readout. */
export function fmtTenths(sec: number): string {
  const t = Math.max(0, Math.round(sec * 10) / 10);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
