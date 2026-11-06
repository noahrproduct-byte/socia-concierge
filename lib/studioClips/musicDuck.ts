// Music under speech. A soundtrack at one level either buries the words or is
// too quiet where nobody talks. With ducking on, the music sits low while
// someone is speaking and comes up in the stretches without speech, moving
// between the two over a fraction of a second so it never pumps. The speech
// comes from the transcript's own word timings, placed on the cut. Pure,
// unit-tested; the renderer multiplies the person's music level by this.
import type { TranscriptWord } from "@/lib/transcribe/types";
import { timeline } from "./timeline";
import type { Edl } from "./types";

export const DUCK = {
  /** the music's level under speech, as a share of the level the person chose */
  under: 0.4,
  /** a gap in the speech shorter than this stays ducked: the music would only bob up and down */
  minGapSec: 1.2,
  /** how long the music takes to come down, finishing as the speech starts */
  fallSec: 0.4,
  /** how long it holds after the last word, then how long it takes to come back up */
  tailSec: 0.2,
  riseSec: 0.6,
} as const;

export type Span = { start: number; end: number };

/** Where someone is speaking on the cut's own timeline, in seconds, with short gaps closed. */
export function speechSpans(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>): Span[] {
  const raw: Span[] = [];
  for (const s of timeline(edl).segments) {
    const ws = words[s.clipId];
    if (!ws?.length) continue;
    const inMs = s.in * 1000, outMs = s.out * 1000, offset = s.startSec - s.in;
    for (const w of ws) {
      const mid = (w.startMs + w.endMs) / 2;
      if (mid < inMs || mid > outMs) continue;
      raw.push({ start: Math.max(inMs, w.startMs) / 1000 + offset, end: Math.min(outMs, w.endMs) / 1000 + offset });
    }
  }
  raw.sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start - last.end < DUCK.minGapSec) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** The music's level at time t (seconds), 0..1 of the level the person chose: low under speech, full away from it. */
export function duckLevel(t: number, spans: Span[]): number {
  let level = 1;
  for (const s of spans) {
    const holdEnd = s.end + DUCK.tailSec;
    let l = 1;
    if (t >= s.start && t <= holdEnd) l = DUCK.under;
    else if (t < s.start && t > s.start - DUCK.fallSec) l = DUCK.under + (1 - DUCK.under) * ((s.start - t) / DUCK.fallSec);
    else if (t > holdEnd && t < holdEnd + DUCK.riseSec) l = DUCK.under + (1 - DUCK.under) * ((t - holdEnd) / DUCK.riseSec);
    if (l < level) level = l;
  }
  return level;
}

/** How much of the cut has speech, for saying what ducking will do before it is switched on. */
export function speechShare(spans: Span[], durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, spans.reduce((a, s) => a + (s.end - s.start), 0) / durationSec);
}
