// SOCIA's own clip picker, the pure half: the transcript as timed lines for
// the model, the brief it works from (the brand, Noah's examples of good and
// bad clips, this brand's own clip results, the niche's leading hooks and
// topics), and the check on what comes back: every clip snapped to whole
// words, inside the video, at a length the person asked for, not overlapping
// another. The model only chooses ranges and words about them; the cut,
// captions and numbers come from the transcript and SOCIA's own reads.

import type { TranscriptWord } from "@/lib/transcribe/types";
import type { ClipLength, ClipperOptions, ClipType } from "./provider";
import { RANKING_MOMENT_SEC, TRAILER_MOMENT_SEC } from "./ranking";
import { checkEmphasis } from "./emphasis";

/** Words as stored on the job: [text, startMs, endMs], then who said it when that is known. */
export type StoredWord = [string, number, number, string?];

export const packWords = (words: TranscriptWord[]): StoredWord[] => words.map((w) => (w.speaker ? [w.text, Math.round(w.startMs), Math.round(w.endMs), w.speaker] : [w.text, Math.round(w.startMs), Math.round(w.endMs)]));
export const unpackWords = (stored: unknown): TranscriptWord[] =>
  Array.isArray(stored)
    ? stored.filter((w): w is StoredWord => Array.isArray(w) && typeof w[0] === "string" && Number.isFinite(w[1]) && Number.isFinite(w[2]))
        .map(([text, startMs, endMs, speaker]) => ({ text, startMs, endMs, confidence: null, ...(typeof speaker === "string" ? { speaker } : {}) }))
    : [];

/** Seconds each length choice allows. "auto" is the short-form sweet spot. */
export const LENGTH_SECONDS: Record<ClipLength, [number, number]> = {
  auto: [15, 90], under30: [8, 30], "30to60": [30, 60], "60to90": [60, 90], "90to180": [90, 180],
};

export function lengthRange(lengths: ClipLength[]): { min: number; max: number } {
  const picked = lengths.length ? lengths : (["auto"] as ClipLength[]);
  return { min: Math.min(...picked.map((l) => LENGTH_SECONDS[l][0])), max: Math.max(...picked.map((l) => LENGTH_SECONDS[l][1])) };
}

type RangeOptions = Pick<ClipperOptions, "lengths" | "clipType">;
/** The seconds one moment may run: a ranking's are short, because several share a clip. */
export const momentRange = (o: RangeOptions) => (o.clipType === "ranking" ? RANKING_MOMENT_SEC : o.clipType === "trailer" ? TRAILER_MOMENT_SEC : lengthRange(o.lengths));

/** Plain seconds, the unit the answer is in, so a time can't be misread as minutes and seconds. */
const secs = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);

export type Line = { startMs: number; endMs: number; text: string; speaker?: string };

/** The transcript as lines: broken at sentence ends, at pauses over 0.9 s, when the speaker changes, or after 28 words. */
export function transcriptLines(words: TranscriptWord[]): Line[] {
  const out: Line[] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (cur.length) out.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, text: cur.map((w) => w.text).join(" "), ...(cur[0].speaker ? { speaker: cur[0].speaker } : {}) });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length && (w.startMs - cur[cur.length - 1].endMs > 900 || (w.speaker && w.speaker !== cur[0].speaker))) flush();
    cur.push(w);
    if (/[.!?…]["')\]]?$/.test(w.text) || cur.length >= 28) flush();
  }
  flush();
  return out;
}

export const formatLines = (lines: Line[]): string => lines.map((l) => `[${secs(l.startMs)}-${secs(l.endMs)}]${l.speaker ? ` Speaker ${l.speaker}:` : ""} ${l.text}`).join("\n");

/** One of Noah's labelled clips (docs/clipper/examples.json). */
export type ClipExample = { verdict: "good" | "bad"; transcript: string; seconds: number; why: string; niche?: string };

export type PickBrief = {
  brand: string;
  lines: Line[];
  durationMs: number;
  options: Pick<ClipperOptions, "maxClips" | "lengths" | "clipType">;
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
          emphasis: { type: "array", items: { type: "string" } },
        },
        required: ["start", "end", "title", "hook", "score", "reason", "emphasis"],
      },
    },
  },
  required: ["clips"],
} as const;

export const PICK_SYSTEM = `You pick the moments from a long video that stand alone as short vertical clips for Instagram Reels, TikTok and YouTube Shorts.

A good clip:
- Opens on its strongest line: a claim, a question, a surprise or the middle of an action. Never on a greeting, "so", "um", a setup or a reference to something said earlier.
- Makes complete sense to someone who has seen nothing else of the video.
- Has one idea, delivered and finished. It stops on its strongest line, with no wind-down after it, and never mid-sentence.
- When someone asks a question and it gets a strong answer, start on the question. Shorter is better when the idea is complete: most strong clips run 14 to 40 seconds.
- Earns the viewer's time: a story, an opinion, a useful tip, a result, a funny or emotional moment.

Rules:
- The transcript's timestamps are plain seconds from the start of the video: [230.5-236.8] runs from 230.5 to 236.8 seconds. start and end are plain seconds too, copied from those timestamps: start where a line starts, end where a line ends.
- Keep every clip inside the length range you are given. Clips never overlap.
- Return the best moments the video has, up to the number asked for, best first, and let the score say how strong each one is: a weaker moment gets a lower score, not left out. Return an empty list only when nothing in the transcript makes sense on its own.
- title: a headline that stays on screen for the whole clip, at most 10 words in sentence case, in the language the video is spoken in. Say who or what it is about and include the number or result when there is one, so someone reading only this knows why to watch. Promise only what is in the clip, and never claim a reaction nobody had, such as "I laughed so hard".
- emphasis: the words that carry the point, one for about every six spoken, each copied exactly as a single word from the transcript. Choose names, numbers and strong words, never words like "the" or "really".
- hook: the clip's opening words exactly as spoken in the transcript.
- score: 0 to 10, how well the clip meets the bar above. Judge the moment, not the topic's popularity.
- reason: one sentence on why this moment works as a clip, quoting what is said.
- Never invent words, numbers or claims that aren't in the transcript.
- When you are given the brand's own clip results or Noah's examples, follow what they show works. When you are given the niche's hooks and topics, prefer moments that open the way leading hooks do, but only when the moment is genuinely good. Those are other accounts' results, not a promise.`;

/** What each type of clip looks for. "best" adds nothing to the bar above; a ranking has its own rules below. */
export const CLIP_TYPE_BRIEF: Record<Exclude<ClipType, "best" | "ranking" | "trailer">, string> = {
  answers: "A question being asked and answered. Start on the question itself so the viewer hears it, and end when the answer lands. A question with a weak or rambling answer doesn't count.",
  takes: "A strong opinion or a claim that goes against what most people think, said plainly enough that someone would want to argue with it. A mild or balanced view doesn't count.",
  stories: "A story with a beginning, a turn and a payoff, told from the first line that sets it up to the line that lands it. A passing anecdote with no payoff doesn't count.",
  tips: "One specific thing the viewer can do, with enough said to do it. General encouragement doesn't count.",
  funny: "A joke, banter or an exchange that is funny from the words alone, from the setup through the punchline. Something that may only be funny to have been there doesn't count.",
};

export const RANKING_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { title: { type: "string" }, clips: PICK_SCHEMA.properties.clips },
  required: ["title", "clips"],
} as const;

export const TRAILER_SYSTEM = `${PICK_SYSTEM}

This job is a trailer: short lines from across the whole video are joined into one clip that tells a story, so the rules above change in these ways:
- Return the lines in the order they should play. They need not be in the order they were said. Shape them as a story: start on a line that raises a question or shows what was at stake, build through the turning point, and land on the strongest line.
- Each line is a complete thought said in full, and joined together they must never make the person seem to say something they did not mean. Never join a line to an answer it wasn't given to.
- The top-level title says what the video is about, in at most 8 words, in sentence case, only about what is in the transcript.
- Each clip's title is a two or three word name for that line.
- score: how strong the line is. It doesn't set the order.`;

export const RANKING_SYSTEM = `${PICK_SYSTEM}

This job is a ranking: the moments are joined into one clip and counted down, so the rules above change in these ways:
- Choose moments that belong on one list, around one theme this video really has. Each one is still a complete thought that makes sense alone.
- The top-level title says what is being ranked and by what measure, for example "Ranking his hardest lessons about money". Sentence case, at most 8 words, only about what is in the transcript.
- Each clip's title is its name on the list: at most 4 words, sentence case, so a viewer knows which moment it is.
- score decides the order: the highest score is number one. No two the same. Keep the moment with the biggest payoff for number one.`;

/** The user message: the brief, then the timed transcript. */
export function pickMessage(b: PickBrief): string {
  const { min, max } = momentRange(b.options);
  const type = b.options.clipType;
  const parts = [
    `Brand: ${b.brand || "unknown"}`,
    `Video length: ${secs(b.durationMs)} seconds.`,
    type === "trailer" ? `Pick up to ${b.options.maxClips} lines for one trailer, each ${min} to ${max} seconds long.` : type === "ranking" ? `Pick up to ${b.options.maxClips} moments for one ranking, each ${min} to ${max} seconds long.` : `Pick up to ${b.options.maxClips} clips, each ${min} to ${max} seconds long.`,
  ];
  if (type && type !== "best" && type !== "ranking" && type !== "trailer") parts.push("# The kind of clip wanted", `${CLIP_TYPE_BRIEF[type]}\nOnly return moments of this kind. If the video has fewer than asked for, return fewer.`);
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

export type RawPick = { start: number; end: number; title: string; hook: string; score: number; reason: string; emphasis: string[] };
export type ClipPick = { startMs: number; endMs: number; title: string; hook: string; score: number; reason: string; text: string; emphasis?: string[]; order?: number };

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
export function validatePicks(raw: unknown, words: TranscriptWord[], opts: PickBrief["options"]): ClipPick[] {
  return checkPicks(raw, words, opts).picks;
}

/** What the model answered and what the check did with it: counts only, for the log. */
export type PickCheck = { picks: ClipPick[]; returned: number; badTimes: number; tooFewWords: number; wrongLength: number; overlaps: number };

export function checkPicks(raw: unknown, words: TranscriptWord[], opts: PickBrief["options"]): PickCheck {
  const list = (raw as { clips?: unknown })?.clips;
  const check: PickCheck = { picks: [], returned: Array.isArray(list) ? list.length : 0, badTimes: 0, tooFewWords: 0, wrongLength: 0, overlaps: 0 };
  if (!Array.isArray(list) || !words.length) return check;
  const { min, max } = momentRange(opts);
  const picks: ClipPick[] = [];
  for (const [order, r] of (list as Partial<RawPick>[]).entries()) {
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
      startMs, endMs, score, order, emphasis: checkEmphasis(r.emphasis, words.slice(first, last + 1).map((w) => w.text)),
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
  // A trailer plays in the order it was written; everything else is best first.
  check.picks = opts.clipType === "trailer" ? kept.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : kept;
  return check;
}

/** The words inside a clip, at their times in the source video, for its captions. */
export function clipWords(words: TranscriptWord[], startMs: number, endMs: number): TranscriptWord[] {
  return words.filter((w) => w.startMs >= startMs - 50 && w.endMs <= endMs + 50);
}
