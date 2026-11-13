// Speech editing, from the word timings of the transcript (Noah's editing
// playbook, 2026-11-10, phase 3). An editor never removes a pause just for
// being long: it first asks what the pause is doing.
//   setup       before a punchline or a short last line, or after a question:
//               kept (up to 0.8 s), it's what makes the line land
//   sentence    between two sentences: trimmed to a natural 0.45 s
//   hesitation  in the middle of a sentence, after a filler or before a
//               repeated word: cut down to a breath
//   dead air    a long gap in the middle of a sentence: cut down to a breath
// and three kinds of mistake are taken out:
//   retake      the same sentence said twice close together: the last take
//               is kept (people redo a line until it's right)
//   restart     a run of words said and then said again ("we open at, we
//               open at five"): the first go is taken out
//   filler      a lone "um", "uh" or "er"
// Nothing is reworded or reordered: every word left is a word that was said,
// where it was said. A cut that would leave a piece too short to play is
// skipped. Pure, unit-tested (speech.test.ts).
import type { TranscriptWord, EdlSegment } from "./types";

export const SPEECH = {
  /** gaps shorter than this are breaths, never touched */
  breathSec: 0.35,
  keep: { setup: 0.8, sentence: 0.45, clause: 0.35, hesitation: 0.12, dead: 0.2 },
  /** a mid-sentence gap this long is dead air */
  deadSec: 1,
  /** a cut must remove at least this much to be worth a jump */
  minCutSec: 0.25,
  /** no piece of a shot shorter than this is left behind */
  minPieceSec: 0.5,
  /** a cut this close to the start of a shot trims its head instead of leaving a stub */
  headSec: 0.35,
  /** a hesitation gap inside a sentence shorter than this is left alone: a jump cut for a fraction of a second reads worse than the pause */
  hesitationCutSec: 0.9,
  /** a restarted phrase may be this many words long */
  restartWords: 6,
  /** a last line this short (words) after a pause is a punchline */
  punchWords: 4,
  /** two sentences that start with the same two words and share this much are the same line said twice */
  retakeOverlap: 0.7,
  retakeMinWords: 3,
  /** the earlier take must start within this many sentences of the later one */
  retakeReach: 2,
} as const;

export type PauseKind = "setup" | "sentence" | "hesitation" | "dead";
export type SpeechCutWhy = "pause" | "retake" | "restart" | "filler";
/** A stretch of a clip (clip seconds) taken out of the cut, and why. */
export type SpeechCut = { start: number; end: number; why: SpeechCutWhy; kind?: PauseKind };

const END = /[.!?…]["')\]]?$/;
const CLAUSE = /[,;:—-]["')\]]?$/;
const FILLER = new Set(["um", "uh", "er", "erm", "uhm", "umm", "hmm", "ah"]);
const HESITANT = new Set([...FILLER, "like", "so", "and", "but", "the", "a", "i"]);
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
const sec = (ms: number) => ms / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

const sorted = (words: TranscriptWord[]) => [...words].sort((a, b) => a.startMs - b.startMs);
const punctuated = (words: TranscriptWord[]) => words.some((w) => END.test(w.text.trim()));

/** The clip's sentences, as word index ranges [first, last]. Without punctuation, a gap of a second ends one. */
export function sentences(words: TranscriptWord[]): [number, number][] {
  const ws = sorted(words);
  const byStop = punctuated(ws);
  const out: [number, number][] = [];
  let first = 0;
  ws.forEach((w, i) => {
    const next = ws[i + 1];
    const ends = byStop ? END.test(w.text.trim()) : !next || sec(next.startMs - w.endMs) >= SPEECH.deadSec;
    if (ends || !next) { out.push([first, i]); first = i + 1; }
  });
  return out;
}

/** Every pause worth cutting in a clip's speech, classified, with how much of it to keep. */
/** "natural" keeps half as much again of every pause (demos and calm videos need room to take things in). */
export type SpeechPace = "tight" | "natural";
const PACE_SCALE: Record<SpeechPace, number> = { tight: 1, natural: 1.5 };

export function classifyPauses(words: TranscriptWord[], pace: SpeechPace = "tight"): (SpeechCut & { kind: PauseKind })[] {
  const ws = sorted(words);
  const byStop = punctuated(ws);
  const sents = sentences(ws);
  const sentenceOf = (i: number) => sents.findIndex(([a, b]) => i >= a && i <= b);
  const out: (SpeechCut & { kind: PauseKind })[] = [];
  for (let i = 0; i < ws.length - 1; i++) {
    const a = ws[i], b = ws[i + 1];
    const gap = sec(b.startMs - a.endMs);
    if (gap < SPEECH.breathSec) continue;
    const text = a.text.trim();
    let kind: PauseKind;
    let keep: number;
    if (!byStop) {
      // No punctuation to read: only a long gap is cut, and gently.
      if (gap < SPEECH.deadSec) continue;
      kind = "dead"; keep = SPEECH.keep.sentence;
    } else if (END.test(text)) {
      const [, last] = sents[sentenceOf(i + 1)] ?? [i + 1, i + 1];
      const nextLen = last - i;
      const isLast = sentenceOf(i + 1) === sents.length - 1;
      if (text.endsWith("?") || (isLast && nextLen <= SPEECH.punchWords)) { kind = "setup"; keep = SPEECH.keep.setup; }
      else { kind = "sentence"; keep = SPEECH.keep.sentence; }
    } else if (/[:…]["')\]]?$/.test(text)) {
      kind = "setup"; keep = SPEECH.keep.setup;
    } else if (CLAUSE.test(text)) {
      kind = "sentence"; keep = SPEECH.keep.clause;
    } else if (HESITANT.has(norm(text)) || norm(text) === norm(b.text)) {
      kind = "hesitation"; keep = SPEECH.keep.hesitation;
    } else if (gap >= SPEECH.deadSec) {
      kind = "dead"; keep = SPEECH.keep.dead;
    } else {
      kind = "hesitation"; keep = SPEECH.keep.hesitation;
    }
    keep *= PACE_SCALE[pace];
    if (kind === "hesitation" && gap < SPEECH.hesitationCutSec) continue;
    if (gap - keep < SPEECH.minCutSec) continue;
    // Keep half of what stays on each side, so the words never feel clipped.
    out.push({ start: r2(sec(a.endMs) + keep / 2), end: r2(sec(b.startMs) - keep / 2), why: "pause", kind });
  }
  return out;
}

/** How much of the shorter word list the other one shares (0..1). */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const pool = new Map<string, number>();
  for (const w of b) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of a) { const n = pool.get(w) ?? 0; if (n) { hit++; pool.set(w, n - 1); } }
  return hit / Math.min(a.length, b.length);
}

/** The mistakes in a clip's speech: earlier takes of a line said again, restarted phrases, lone fillers. */
export function findMistakes(words: TranscriptWord[]): SpeechCut[] {
  const ws = sorted(words);
  const cuts: SpeechCut[] = [];
  const sents = sentences(ws);
  const said = sents.map(([a, b]) => ws.slice(a, b + 1).map((w) => norm(w.text)).filter(Boolean));
  // A retake: the earlier sentence goes, up to where the next sentence starts.
  const gone = new Set<number>();
  for (let j = 1; j < sents.length; j++) {
    for (let i = Math.max(0, j - SPEECH.retakeReach); i < j; i++) {
      if (gone.has(i) || said[i].length < SPEECH.retakeMinWords || said[j].length < SPEECH.retakeMinWords) continue;
      const sameStart = said[i][0] === said[j][0] && said[i][1] === said[j][1];
      if (sameStart && overlap(said[i], said[j]) >= SPEECH.retakeOverlap) {
        // Everything from the earlier take up to the later one is the retake.
        for (let k = i; k < j; k++) gone.add(k);
        cuts.push({ start: r2(sec(ws[sents[i][0]].startMs)), end: r2(sec(ws[sents[j][0]].startMs)), why: "retake" });
        break;
      }
    }
  }
  sents.forEach(([a, b], si) => {
    if (gone.has(si)) return;
    const t = ws.slice(a, b + 1).map((w) => norm(w.text));
    for (let i = 0; i < t.length; i++) {
      // A restart: words i..i+k-1 said again straight after (the longest run wins).
      let k = Math.min(SPEECH.restartWords, Math.floor((t.length - i) / 2));
      for (; k >= 1; k--) {
        const first = t.slice(i, i + k), again = t.slice(i + k, i + 2 * k);
        if (first.every(Boolean) && first.join(" ") === again.join(" ") && (k > 1 || !["very", "so", "really", "no", "yes", "ha"].includes(first[0]))) break;
      }
      if (k >= 1) {
        cuts.push({ start: r2(sec(ws[a + i].startMs)), end: r2(sec(ws[a + i + k].startMs)), why: "restart" });
        i += k - 1;
        continue;
      }
      // A broken-off word ("es-") goes like a restart; a lone filler on its own.
      const next = ws[a + i + 1];
      if (!next) continue;
      if (/[-—]$/.test(ws[a + i].text.trim()) && t[i]) {
        // "Come see this rug for— come see this rug for yourself": the words before the break said again after
        // it make the whole first try the restart, from its first word to where the second try starts.
        let from = i;
        for (let n = Math.min(SPEECH.restartWords, i); n >= 1; n--) {
          const before = t.slice(i - n, i), after = t.slice(i + 1, i + 1 + n);
          if (before.every(Boolean) && before.join(" ") === after.join(" ")) { from = i - n; break; }
        }
        cuts.push({ start: r2(sec(ws[a + from].startMs)), end: r2(sec(next.startMs)), why: "restart" });
      }
      else if (FILLER.has(t[i])) cuts.push({ start: r2(sec(ws[a + i].startMs)), end: r2(sec(next.startMs)), why: "filler" });
    }
  });
  return cuts.filter((c) => c.end - c.start > 0.05);
}

/** All the speech cuts for a clip, merged where they touch. */
export function speechCuts(words: TranscriptWord[] | null | undefined, pace: SpeechPace = "tight"): SpeechCut[] {
  if (!words?.length) return [];
  const all = [...findMistakes(words), ...classifyPauses(words, pace)].sort((a, b) => a.start - b.start);
  const out: SpeechCut[] = [];
  for (const c of all) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 0.02) {
      if (c.end > last.end) last.end = c.end;
      // A mistake beats a pause as the reason.
      if (last.why === "pause" && c.why !== "pause") { last.why = c.why; delete last.kind; }
      continue;
    }
    out.push({ ...c });
  }
  return out;
}

/**
 * Whether skipping from `a` to `b` (clip seconds) is a cut inside someone's
 * speech: words end just before it and start just after. Such a jump cut is
 * deliberate (a pause or a mistake taken out), not a stutter.
 */
export function speechJump(words: TranscriptWord[] | null | undefined, a: number, b: number): boolean {
  if (!words?.length || b <= a) return false;
  const near = 0.6;
  return words.some((w) => sec(w.endMs) <= a + 0.05 && sec(w.endMs) >= a - near) && words.some((w) => sec(w.startMs) >= b - 0.05 && sec(w.startMs) <= b + near);
}

export type SpeechEditResult<S> = { segments: S[]; removed: { why: SpeechCutWhy; sec: number }[] };

/**
 * A cut's shots with their speech tightened: each talking shot split around
 * the stretches to take out. The first piece keeps the shot's transition and
 * role; the pieces after it join with hard cuts (jump cuts).
 */
export function editSpeech<S extends Pick<EdlSegment, "id" | "clipId" | "in" | "out" | "role" | "transition">>(segments: S[], words: Record<string, TranscriptWord[] | null | undefined>, pace: SpeechPace = "tight"): SpeechEditResult<S> {
  const removed: { why: SpeechCutWhy; sec: number }[] = [];
  const cache = new Map<string, SpeechCut[]>();
  const out: S[] = [];
  for (const s of segments) {
    const cuts = (cache.get(s.clipId) ?? cache.set(s.clipId, speechCuts(words[s.clipId], pace)).get(s.clipId)!)
      .map((c) => ({ ...c, start: Math.max(c.start, s.in), end: Math.min(c.end, s.out) }))
      .filter((c) => c.end - c.start >= SPEECH.minCutSec);
    let pieceIn = s.in;
    const pieces: { in: number; out: number }[] = [];
    for (const c of cuts) {
      if (c.start < pieceIn) continue;
      // A cut at the very start of the shot just trims its head; anywhere else it must leave real pieces either side.
      const atHead = pieceIn === s.in && c.start - s.in < SPEECH.headSec;
      if (!atHead && c.start - pieceIn < SPEECH.minPieceSec) continue;
      if (s.out - c.end < SPEECH.minPieceSec) continue;
      if (!atHead) pieces.push({ in: pieceIn, out: c.start });
      removed.push({ why: c.why, sec: r2(c.end - c.start) });
      pieceIn = c.end;
    }
    pieces.push({ in: pieceIn, out: s.out });
    pieces.forEach((p, k) => {
      const piece = { ...s, in: r2(p.in), out: r2(p.out) } as S;
      if (k) { delete (piece as { transition?: unknown }).transition; if (piece.role === "opener") piece.role = "body"; }
      if (k < pieces.length - 1 && piece.role === "ending") piece.role = "body";
      out.push(piece);
    });
  }
  out.forEach((s, i) => { s.id = `s${i + 1}`; });
  return { segments: out, removed };
}

/** One line for the cut's notes: what the speech editing took out. "" when nothing. */
export function speechNote(removed: { why: SpeechCutWhy; sec: number }[]): string {
  if (!removed.length) return "";
  const n = (why: SpeechCutWhy) => removed.filter((r) => r.why === why).length;
  const total = removed.reduce((a, r) => a + r.sec, 0);
  const parts = [
    n("retake") ? `${n("retake")} earlier take${n("retake") === 1 ? "" : "s"} of a line said again` : "",
    n("restart") ? `${n("restart")} false start${n("restart") === 1 ? "" : "s"}` : "",
    n("filler") ? `${n("filler")} "um" or "uh"` : "",
    n("pause") ? `${n("pause")} pause${n("pause") === 1 ? "" : "s"} shortened (set-up pauses before a punchline are kept)` : "",
  ].filter(Boolean);
  return `SOCIA tightened the speech by ${total.toFixed(1)} s: ${parts.join(", ")}.`;
}
