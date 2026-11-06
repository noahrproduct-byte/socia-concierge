// SOCIA's own clip picker, the pure half: the transcript as timed lines for
// the model, the brief it works from (the brand, Noah's examples of good and
// bad clips, this brand's own clip results, the niche's leading hooks and
// topics), and the check on what comes back: every clip snapped to whole
// words, inside the video, at a length the person asked for, not overlapping
// another. The model only chooses ranges and words about them; the cut,
// captions and numbers come from the transcript and SOCIA's own reads.

import type { TranscriptWord } from "@/lib/transcribe/types";
import type { ClipLength, ClipperOptions } from "./provider";

/** Words as stored on the job: [text, startMs, endMs]. */
export type StoredWord = [string, number, number];

export const packWords = (words: TranscriptWord[]): StoredWord[] => words.map((w) => [w.text, Math.round(w.startMs), Math.round(w.endMs)]);
export const unpackWords = (stored: unknown): TranscriptWord[] =>
  Array.isArray(stored)
    ? stored.filter((w): w is StoredWord => Array.isArray(w) && typeof w[0] === "string" && Number.isFinite(w[1]) && Number.isFinite(w[2]))
        .map(([text, startMs, endMs]) => ({ text, startMs, endMs, confidence: null }))
    : [];

/** Seconds each length choice allows. "auto" is the short-form sweet spot. */
export const LENGTH_SECONDS: Record<ClipLength, [number, number]> = {
  auto: [15, 90], under30: [8, 30], "30to60": [30, 60], "60to90": [60, 90], "90to180": [90, 180],
};

export function lengthRange(lengths: ClipLength[]): { min: number; max: number } {
  const picked = lengths.length ? lengths : (["auto"] as ClipLength[]);
  return { min: Math.min(...picked.map((l) => LENGTH_SECONDS[l][0])), max: Math.max(...picked.map((l) => LENGTH_SECONDS[l][1])) };
}

/** Plain seconds, the unit the answer is in, so a time can't be misread as minutes and seconds. */
const secs = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);

export type Line = { startMs: number; endMs: number; text: string };

/** The transcript as lines: broken at sentence ends, at pauses over 0.9 s, or after 28 words. */
export function transcriptLines(words: TranscriptWord[]): Line[] {
  const out: Line[] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (cur.length) out.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, text: cur.map((w) => w.text).join(" ") });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length && w.startMs - cur[cur.length - 1].endMs > 900) flush();
    cur.push(w);
    if (/[.!?…]["')\]]?$/.test(w.text) || cur.length >= 28) flush();
  }
  flush();
  return out;
}

export const formatLines = (lines: Line[]): string => lines.map((l) => `[${secs(l.startMs)}-${secs(l.endMs)}] ${l.text}`).join("\n");

/** One of Noah's labelled clips (docs/clipper/examples.json). */
export type ClipExample = { verdict: "good" | "bad"; transcript: string; seconds: number; why: string; niche?: string };

export type PickBrief = {
  brand: string;
  lines: Line[];
  durationMs: number;
  options: Pick<ClipperOptions, "maxClips" | "lengths" | "lang">;
  examples: ClipExample[];
  /** This brand's posted clips and how each did against its own median, one line each. */
  results: string[];
  /** The niche's hooks and topics, from lib/trendSignals trendsEvidence. */
  niche: string | null;
};

export const PICK_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          start: { type: "number" }, end: { type: "number" },
          title: { type: "string" }, hook: { type: "string" },
          score: { type: "number" }, reason: { type: "string" },
        },
        required: ["start", "end", "title", "hook", "score", "reason"],
      },
    },
  },
  required: ["clips"],
} as const;

export const PICK_SYSTEM = `You pick the moments from a long video that stand alone as short vertical clips for Instagram Reels, TikTok and YouTube Shorts.

A good clip:
- Opens on its strongest line: a claim, a question, a surprise or the middle of an action. Never on a greeting, "so", "um", a setup or a reference to something said earlier.
- Makes complete sense to someone who has seen nothing else of the video.
- Has one idea, delivered and finished. It ends on the payoff or the last word of a thought, never mid-sentence.
- Earns the viewer's time: a story, an opinion, a useful tip, a result, a funny or emotional moment.

Rules:
- The transcript's timestamps are plain seconds from the start of the video: [230.5-236.8] runs from 230.5 to 236.8 seconds. start and end are plain seconds too, copied from those timestamps: start where a line starts, end where a line ends.
- Keep every clip inside the length range you are given. Clips never overlap.
- Return the best moments the video has, up to the number asked for, best first, and let the score say how strong each one is: a weaker moment gets a lower score, not left out. Return an empty list only when nothing in the transcript makes sense on its own.
- title: a short headline in sentence case that says what the clip is about, written for the viewer.
- hook: the clip's opening words exactly as spoken in the transcript.
- score: 0 to 10, how well the clip meets the bar above. Judge the moment, not the topic's popularity.
- reason: one sentence on why this moment works as a clip, quoting what is said.
- Never invent words, numbers or claims that aren't in the transcript.
- When you are given the brand's own clip results or Noah's examples, follow what they show works. When you are given the niche's hooks and topics, prefer moments that open the way leading hooks do, but only when the moment is genuinely good. Those are other accounts' results, not a promise.`;

/** The user message: the brief, then the timed transcript. */
export function pickMessage(b: PickBrief): string {
  const { min, max } = lengthRange(b.options.lengths);
  const parts = [
    `Brand: ${b.brand || "unknown"}`,
    `Video length: ${secs(b.durationMs)} seconds. Language: ${b.options.lang}.`,
    `Pick up to ${b.options.maxClips} clips, each ${min} to ${max} seconds long.`,
  ];
  if (b.examples.length) {
    parts.push(
      "# Noah's examples of clips (his judgement of what works and what doesn't)",
      b.examples.map((e) => `- ${e.verdict.toUpperCase()} (${Math.round(e.seconds)} s${e.niche ? `, ${e.niche}` : ""}): "${e.transcript.slice(0, 400)}"\n  Why: ${e.why}`).join("\n"),
    );
  }
  if (b.results.length) parts.push("# This brand's posted clips and how they did against its own usual", b.results.map((r) => `- ${r}`).join("\n"));
  if (b.niche) parts.push("# The brand's niche right now (other accounts' Reels)", b.niche);
  parts.push("# Transcript", formatLines(b.lines));
  return parts.join("\n\n");
}

export type RawPick = { start: number; end: number; title: string; hook: string; score: number; reason: string };
export type ClipPick = { startMs: number; endMs: number; title: string; hook: string; score: number; reason: string; text: string };

/** How far a clip's start or end moves to reach a sentence's edge. */
const SENTENCE_SNAP_MS = 1500;
const endsSentence = (w: TranscriptWord) => /[.!?…]["')\]]?$/.test(w.text);

/** The word index nearest `ms` (by `at`) that `ok` accepts, within SENTENCE_SNAP_MS; `fallback` when there is none. */
function nearestEdge(words: TranscriptWord[], ms: number, fallback: number, at: (w: TranscriptWord) => number, ok: (i: number) => boolean): number {
  let best = fallback, bestGap = SENTENCE_SNAP_MS + 1;
  for (let i = 0; i < words.length; i++) {
    const gap = Math.abs(at(words[i]) - ms);
    if (gap < bestGap && ok(i)) { best = i; bestGap = gap; }
  }
  return best;
}

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/**
 * The model's picks, made safe: a clip starts with the word being spoken at its
 * start and ends with the last word that begins before its end, so no word is
 * cut in half, then moves to a sentence's edge when one is within SENTENCE_SNAP_MS
 * (an answer a moment too long would otherwise end on the next sentence's first
 * word); at least 3 words, inside the allowed length with 15% slack, not
 * overlapping a better clip by more than a quarter, best first.
 */
export function validatePicks(raw: unknown, words: TranscriptWord[], opts: Pick<PickBrief["options"], "maxClips" | "lengths">): ClipPick[] {
  return checkPicks(raw, words, opts).picks;
}

/** What the model answered and what the check did with it: counts only, for the log. */
export type PickCheck = { picks: ClipPick[]; returned: number; badTimes: number; tooFewWords: number; wrongLength: number; overlaps: number };

export function checkPicks(raw: unknown, words: TranscriptWord[], opts: Pick<PickBrief["options"], "maxClips" | "lengths">): PickCheck {
  const list = (raw as { clips?: unknown })?.clips;
  const check: PickCheck = { picks: [], returned: Array.isArray(list) ? list.length : 0, badTimes: 0, tooFewWords: 0, wrongLength: 0, overlaps: 0 };
  if (!Array.isArray(list) || !words.length) return check;
  const { min, max } = lengthRange(opts.lengths);
  const picks: ClipPick[] = [];
  for (const r of list as Partial<RawPick>[]) {
    const s = Number(r.start) * 1000, e = Number(r.end) * 1000;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) { check.badTimes++; continue; }
    let first = words.findIndex((w) => w.endMs > s);
    let last = -1;
    for (let i = words.length - 1; i >= 0; i--) if (words[i].startMs < e) { last = i; break; }
    if (first >= 0 && last >= first) {
      first = nearestEdge(words, s, first, (w) => w.startMs, (i) => i === 0 || endsSentence(words[i - 1]));
      last = nearestEdge(words, e, last, (w) => w.endMs, (i) => endsSentence(words[i]));
    }
    if (first < 0 || last < first || last - first + 1 < 3) { check.tooFewWords++; continue; }
    const startMs = words[first].startMs, endMs = words[last].endMs;
    const sec = (endMs - startMs) / 1000;
    if (sec < min * 0.85 || sec > max * 1.15) { check.wrongLength++; continue; }
    const score = Math.max(0, Math.min(10, Math.round(Number(r.score) * 10) / 10 || 0));
    picks.push({
      startMs, endMs, score,
      title: clean(r.title, 120) || "Clip", hook: clean(r.hook, 200), reason: clean(r.reason, 400),
      text: words.slice(first, last + 1).map((w) => w.text).join(" "),
    });
  }
  picks.sort((a, b) => b.score - a.score);
  const kept: ClipPick[] = [];
  for (const p of picks) {
    const clash = kept.some((k) => {
      const overlap = Math.min(k.endMs, p.endMs) - Math.max(k.startMs, p.startMs);
      return overlap > 0.25 * Math.min(k.endMs - k.startMs, p.endMs - p.startMs);
    });
    if (clash) { check.overlaps++; continue; }
    kept.push(p);
    if (kept.length >= opts.maxClips) break;
  }
  check.picks = kept;
  return check;
}

/** The words inside a clip, at their times in the source video, for its captions. */
export function clipWords(words: TranscriptWord[], startMs: number, endMs: number): TranscriptWord[] {
  return words.filter((w) => w.startMs >= startMs - 50 && w.endMs <= endMs + 50);
}
