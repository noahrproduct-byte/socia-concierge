// The editor's multi-track timeline (Editor V2): what sits on each track and
// where, in output seconds, and how a text line moves or resizes when it is
// dragged. Shared by the timeline component and the tests. Pure.

import type { Edl } from "./types";
import { timeline, captionsForEdl } from "./timeline";
import type { TranscriptWord } from "@/lib/transcribe/types";

export type TrackItem = { index: number; start: number; end: number; label: string };
export type Tracks = { duration: number; video: TrackItem[]; text: TrackItem[]; captions: { start: number; end: number }[] };

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
  return { duration: tl.durationSec, video, text, captions: captions.map((c) => ({ start: r2(c.start), end: r2(c.end) })) };
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

/** Tick marks for a ruler: every second on short edits, every five on longer ones. */
export function rulerTicks(duration: number): number[] {
  const step = duration > 40 ? 10 : duration > 15 ? 5 : 1;
  const out: number[] = [];
  for (let t = 0; t <= duration + 1e-6; t += step) out.push(t);
  return out;
}
