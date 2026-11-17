// The rhythm SIO's words arrive in (Noah, 2026-11-16: the text "should come
// out in a rhythm, just as if SIO is talking", matched to its face; later the
// same day: smoother, with more expression). A line is split into words, each
// with the moment it appears, the syllables SIO's mouth makes for it (a mouth
// shape per vowel sound) and the pause that follows punctuation. Each sentence
// also has a mood, read from how it ends, so SIO's face can follow what it is
// saying: a question looks curious, an exclamation looks pleased. The screen
// reveals the words and moves the face from this one plan, so the two cannot
// drift apart. Pure and browser-safe.

/** Milliseconds a short word takes to say. */
export const WORD_MS = 130;
/** Extra for each letter past the third, so long words take longer. */
export const LETTER_MS = 16;
export const MAX_WORD_MS = 320;
/** The pause after a comma, a sentence, and between two lines. */
export const COMMA_MS = 130;
export const SENTENCE_MS = 280;
export const LINE_MS = 240;
/** The share of a syllable's time SIO's mouth is open. */
export const OPEN_SHARE = 0.62;
/** At most this many mouth movements in one word. */
export const MAX_BEATS = 3;
/** How long SIO looks at its words as a sentence starts, before looking back at the person. */
export const GLANCE_MS = 420;

/** The shape of SIO's open mouth: wide open, rounded, or wide and flat. */
export type SioMouthShape = "a" | "o" | "e";
/** What kind of sentence is being said, from its last mark. */
export type SentenceMood = "plain" | "ask" | "bright";

/** One syllable: the mouth is open in `shape` from `at` until `until` (ms from the start). */
export type MouthBeat = { at: number; until: number; shape: SioMouthShape };

export type SpokenWord = {
  text: string;
  /** Which line (segment) it belongs to, and its place in that line. */
  line: number;
  index: number;
  /** When it appears, in milliseconds from the start. */
  at: number;
  /** How long the mouth is open for it, all syllables together. */
  open: number;
  /** Its syllables, in order. */
  beats: MouthBeat[];
  /** It starts a sentence: SIO makes a small gesture. */
  starts: boolean;
  /** Which sentence it belongs to. */
  sentence: number;
};

export type SpeechPlan = { words: SpokenWord[]; total: number; counts: number[]; moods: SentenceMood[] };

const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;

const SHAPE: Record<string, SioMouthShape> = { a: "a", o: "o", u: "o", e: "e", i: "e", y: "e" };

/** The mouth shapes of a word's syllables: one for each run of vowels (a silent last "e" aside), at least one. */
export function mouthShapes(word: string): SioMouthShape[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const runs = w.match(/[aeiouy]+/g) ?? [];
  if (runs.length > 1 && /[^aeiouy]e$/.test(w)) runs.pop();
  const shapes = runs.slice(0, MAX_BEATS).map((r) => SHAPE[r[0]]);
  return shapes.length ? shapes : ["e"];
}

const moodOf = (word: string): SentenceMood => (/\?["')\]]?$/.test(word) ? "ask" : /!["')\]]?$/.test(word) ? "bright" : "plain");

/** The words of several lines with their timing. Empty lines are skipped but keep their place. */
export function speechPlan(lines: (string | null | undefined)[]): SpeechPlan {
  const words: SpokenWord[] = [];
  const counts: number[] = [];
  const moods: SentenceMood[] = [];
  let t = 0;
  lines.forEach((raw, line) => {
    const parts = (raw ?? "").split(/\s+/).filter(Boolean);
    counts.push(parts.length);
    if (!parts.length) return;
    if (words.length) t += LINE_MS;
    let starts = true;
    parts.forEach((text, index) => {
      const dur = Math.min(MAX_WORD_MS, WORD_MS + Math.max(0, letters(text) - 3) * LETTER_MS);
      if (starts) moods.push("plain");
      const sentence = moods.length - 1;
      const shapes = mouthShapes(text);
      const slot = dur / shapes.length;
      const beats = shapes.map((shape, i) => ({ at: Math.round(t + i * slot), until: Math.round(t + i * slot + slot * OPEN_SHARE), shape }));
      words.push({ text, line, index, at: Math.round(t), open: Math.round(dur * OPEN_SHARE), beats, starts, sentence });
      t += dur;
      starts = /[.!?]["')\]]?$/.test(text);
      if (starts) { moods[sentence] = moodOf(text); t += SENTENCE_MS; }
      else if (/[,;:]$/.test(text)) t += COMMA_MS;
    });
  });
  // The last pause is silence after SIO has finished: it isn't part of the line.
  const last = words[words.length - 1];
  const total = last ? Math.round(last.at + last.open / OPEN_SHARE) : 0;
  return { words, total, counts, moods };
}

export type SpeechMoment = {
  /** How many words of each line have appeared. */
  shown: number[];
  /** The mouth's shape right now, or null while it rests between syllables. */
  mouth: SioMouthShape | null;
  speaking: boolean;
  /** Sentences begun so far. */
  nods: number;
  /** The mood of the sentence being said. */
  mood: SentenceMood;
  /** A sentence has just started: SIO looks at its words for a moment. */
  glance: boolean;
};

/** What is on screen and on SIO's face at `elapsed` ms. */
export function speechAt(plan: SpeechPlan, elapsed: number): SpeechMoment {
  const shown = plan.counts.map(() => 0);
  let mouth: SioMouthShape | null = null, nods = 0, mood: SentenceMood = "plain", startedAt = -Infinity;
  for (const w of plan.words) {
    if (w.at > elapsed) break;
    shown[w.line] = w.index + 1;
    if (w.starts) { nods++; startedAt = w.at; }
    mood = plan.moods[w.sentence] ?? "plain";
    mouth = w.beats.find((b) => elapsed >= b.at && elapsed < b.until)?.shape ?? null;
  }
  const speaking = elapsed < plan.total;
  return { shown, mouth: speaking ? mouth : null, speaking, nods, mood: speaking ? mood : "plain", glance: speaking && elapsed - startedAt < GLANCE_MS };
}
