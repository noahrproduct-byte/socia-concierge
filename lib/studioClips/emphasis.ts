// The word in each caption line that gets the highlight (Noah's editing
// playbook, 2026-11-10, phase 5: "highlight meaningful words, not random
// words"). Restraint first: at most one word a line, about one for every six
// spoken in the cut, and never a filler like "the", "your" or "but". In order:
//   1. the words the editing model marked as the point of a line, when they
//      were really said in the cut;
//   2. numbers: digits, prices, percentages and number words ("twenty");
//   3. names: a capitalised word in the middle of a sentence ("Nashville").
// The caption renderer colours the first listed word of each line
// (lib/clipper/emphasis.ts emphasisIndex). Pure, unit-tested.
import { checkEmphasis } from "@/lib/clipper/emphasis";
import { captionsForEdl } from "./timeline";
import type { Edl, TranscriptWord } from "./types";

/** One highlight for about this many spoken words. */
export const WORDS_PER_HIGHLIGHT = 6;

// "one", "first" and "second" are left out: they are as often "this one", "first of all", "wait a second".
const NUMBER_WORDS = new Set(["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty", "hundred", "thousand", "million", "billion", "half", "double", "triple", "dozen"]);
/** Never highlighted, however they were marked. */
const NEVER = new Set(["the", "a", "an", "and", "but", "or", "so", "this", "that", "these", "those", "it", "its", "your", "you", "my", "our", "we", "i", "they", "is", "are", "was", "be", "to", "of", "in", "on", "for", "with", "really", "very", "just", "like", "um", "uh", "okay", "ok", "yeah", "reel", "reels", "post", "posts", "story", "stories", "video", "videos"]);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");
const isNumber = (raw: string) => /\d/.test(raw) || NUMBER_WORDS.has(norm(raw));
const SENTENCE_END = /[.!?…]["')\]]?$/;

/**
 * The words to highlight in this cut's captions, normalised the way the
 * renderer matches them. `marked`: the editing model's picks (checked against
 * what was said). [] when the cut has no captions.
 */
export function pickEmphasis(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, marked: unknown = []): string[] {
  const said = captionsForEdl({ ...edl, captions: edl.captions ?? { source: "transcript" } }, words);
  if (!said.length) return [];
  const tokens = said.map((c) => c.text.trim());
  const budget = Math.max(1, Math.round(tokens.length / WORDS_PER_HIGHLIGHT));
  const out: string[] = [];
  const add = (w: string) => { const n = norm(w); if (n && !NEVER.has(n) && !out.includes(n) && out.length < budget) out.push(n); };
  for (const w of checkEmphasis(marked, tokens)) add(w);
  for (const t of tokens) if (isNumber(t)) add(t);
  tokens.forEach((t, i) => {
    // A capital in the middle of a sentence is a name (not "I", not the first word after a full stop).
    if (i && /^\p{Lu}/u.test(t) && t.length > 1 && !SENTENCE_END.test(tokens[i - 1]) && norm(t) !== "i") add(t);
  });
  return out;
}

/** The words a person sees listed under the switch, as said (first spelling in the cut). */
export function emphasisLabels(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, list: string[]): string[] {
  const said = captionsForEdl({ ...edl, captions: edl.captions ?? { source: "transcript" } }, words).map((c) => c.text.trim().replace(/[.,!?;:…"')\]]+$/, ""));
  return list.map((n) => said.find((t) => norm(t) === n) ?? n);
}
