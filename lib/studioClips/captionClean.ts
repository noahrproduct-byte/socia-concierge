// Captions are for reading, so the words on the video are the transcript
// tidied the way a person captions by hand: a word the speaker broke off is
// left out, a stuttered start is joined to its word, and a filler sound (um,
// uh) is dropped. Nothing is added or reworded: every caption word is still a
// word that was said, at the time it was said. The transcript itself is never
// changed; this only decides what the caption shows. Pure, unit-tested.
import type { TranscriptWord } from "@/lib/transcribe/types";

const letters = (s: string) => s.replace(/[^\p{L}\p{N}'-]/gu, "");
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** A word the speaker abandoned: it ends on a dash ("es-", "A--", "wh—"). */
const brokenOff = (text: string) => /[\p{L}\p{N}][-–—]+[.,!?…]*$/u.test(text.trim());

/** Prefixes that make real words with a hyphen ("re-record", "co-cook"): never read as a stutter. */
const PREFIXES = new Set(["re", "co", "un", "de", "pre", "pro", "non", "bi", "tri", "mid", "sub", "ex", "in", "out", "up", "on", "off", "by"]);

/**
 * "wh-what" -> "what", "I-I" -> "I": a false start of up to three letters that
 * the word after the hyphen begins with, or the same word twice. Real
 * compounds and prefixed words (well-known, re-record) are left alone.
 */
export function joinStutter(text: string): string {
  const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}']+)-([\p{L}\p{N}'][\p{L}\p{N}'-]*)(.*)$/u.exec(text);
  if (!m) return text;
  const [, lead, start, rest, tail] = m;
  const a = start.toLowerCase(), b = rest.toLowerCase();
  const falseStart = b.length > a.length && b.startsWith(a) && a.length <= 3 && !PREFIXES.has(a);
  return falseStart || a === b ? `${lead}${rest}${tail}` : text;
}

/** A filler sound held long ("uuum", "hmmm", "ahhh"): three of the same letter in a row, and no other letters. Any language. */
const drawnOut = (w: string) => /^(?:u+h*m*|e+r*m*|h*m+|a+h+|e+h+|[ãéèêeoa]+h*)$/u.test(w) && /(.)\1\1/u.test(w);

/** English filler sounds. Only dropped when the transcript reads as English: "um" is a real word in Portuguese, "er" in German. */
const ENGLISH_FILLERS = new Set(["um", "uh", "umm", "uhh", "uhm", "erm", "hmm", "mm", "mhm"]);
const ENGLISH_COMMON = new Set(["the", "and", "to", "you", "is", "it", "of", "that", "in", "this", "we", "for", "so", "are", "have", "with"]);

/** Whether a transcript reads as English: enough of its words are the commonest English ones. */
export function readsAsEnglish(words: Pick<TranscriptWord, "text">[]): boolean {
  if (words.length < 6) return false;
  const hits = words.filter((w) => ENGLISH_COMMON.has(bare(w.text))).length;
  return hits / words.length >= 0.12;
}

/**
 * The words a caption shows, from the words that were said. Timings are kept;
 * a dropped word simply shows nothing for its moment. When a dropped word
 * opened a sentence, the next word takes its capital.
 */
export function cleanCaptionWords<W extends Pick<TranscriptWord, "text">>(words: W[]): W[] {
  const english = readsAsEnglish(words);
  const out: W[] = [];
  let capNext = false;
  for (const w of words) {
    const core = bare(w.text);
    const drop = !core || brokenOff(w.text) || drawnOut(core) || (english && ENGLISH_FILLERS.has(core));
    if (drop) {
      const first = letters(w.text)[0];
      if (first && first !== first.toLowerCase()) capNext = true;
      continue;
    }
    let text = joinStutter(w.text);
    if (capNext) {
      text = text.replace(/[\p{L}]/u, (c) => c.toUpperCase());
      capNext = false;
    }
    out.push(text === w.text ? w : { ...w, text });
  }
  return out;
}
