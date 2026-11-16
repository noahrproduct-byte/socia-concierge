// The rhythm SIO's words arrive in (Noah, 2026-11-16: the text "should come
// out in a rhythm, just as if SIO is talking", matched to its face). A line is
// split into words, each with the moment it appears, how long SIO's mouth is
// open for it, and the pause that follows punctuation. The screen reveals the
// words and moves the mouth from this one plan, so the two cannot drift
// apart. Pure and browser-safe.

/** Milliseconds a short word takes to say. */
export const WORD_MS = 120;
/** Extra for each letter past the third, so long words take longer. */
export const LETTER_MS = 16;
export const MAX_WORD_MS = 300;
/** The pause after a comma, a sentence, and between two lines. */
export const COMMA_MS = 140;
export const SENTENCE_MS = 300;
export const LINE_MS = 260;
/** The share of a word's time SIO's mouth is open. */
export const OPEN_SHARE = 0.6;

export type SpokenWord = {
  text: string;
  /** Which line (segment) it belongs to, and its place in that line. */
  line: number;
  index: number;
  /** When it appears, in milliseconds from the start. */
  at: number;
  /** How long the mouth stays open for it. */
  open: number;
  /** It starts a sentence: SIO gives a small nod. */
  starts: boolean;
};

export type SpeechPlan = { words: SpokenWord[]; total: number; counts: number[] };

const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;

/** The words of several lines with their timing. Empty lines are skipped but keep their place. */
export function speechPlan(lines: (string | null | undefined)[]): SpeechPlan {
  const words: SpokenWord[] = [];
  const counts: number[] = [];
  let t = 0;
  lines.forEach((raw, line) => {
    const parts = (raw ?? "").split(/\s+/).filter(Boolean);
    counts.push(parts.length);
    if (!parts.length) return;
    if (words.length) t += LINE_MS;
    let starts = true;
    parts.forEach((text, index) => {
      const dur = Math.min(MAX_WORD_MS, WORD_MS + Math.max(0, letters(text) - 3) * LETTER_MS);
      words.push({ text, line, index, at: Math.round(t), open: Math.round(dur * OPEN_SHARE), starts });
      t += dur;
      starts = /[.!?]["')\]]?$/.test(text);
      if (starts) t += SENTENCE_MS;
      else if (/[,;:]$/.test(text)) t += COMMA_MS;
    });
  });
  // The last pause is silence after SIO has finished: it isn't part of the line.
  const last = words[words.length - 1];
  const total = last ? Math.round(last.at + last.open / OPEN_SHARE) : 0;
  return { words, total, counts };
}

/** How many words of each line have appeared by `elapsed` ms, and whether the mouth is open then. */
export function speechAt(plan: SpeechPlan, elapsed: number): { shown: number[]; mouthOpen: boolean; speaking: boolean; nods: number } {
  const shown = plan.counts.map(() => 0);
  let mouthOpen = false, nods = 0;
  for (const w of plan.words) {
    if (w.at > elapsed) break;
    shown[w.line] = w.index + 1;
    if (w.starts) nods++;
    mouthOpen = elapsed < w.at + w.open;
  }
  return { shown, mouthOpen, speaking: elapsed < plan.total, nods };
}
