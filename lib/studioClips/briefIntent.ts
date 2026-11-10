// What a prompt in the video editor asks for (Noah, 2026-11-09). "add captions"
// on an 86-second speech came back as a 26-second highlight cut with reaction
// text, music and an ending nobody asked for: every prompt went down the
// "make a short cut" path. A prompt that only asks to finish the footage
// (captions, music, sound, colour, vertical) keeps the whole video, in order,
// and only does that. Anything else (a length, a part to show, a cut, a hook,
// a style) is a cut SOCIA makes. When unsure, it is a cut, as before. Pure.

/** Words a finishing-only prompt is made of. A word outside this list means the person wants more than a finish. */
const FINISH_WORDS = new Set([
  "add", "put", "include", "turn", "on", "give", "with", "the", "a", "an", "to", "this", "that", "it", "its", "my", "our", "video", "clip", "clips",
  "and", "some", "please", "pls", "just", "only", "me", "in", "of", "for", "burn", "burned", "auto", "automatic", "word", "words", "spoken", "what", "i", "say", "said", "he", "she", "they", "says",
  "style", "nice", "good", "background", "low", "lower", "quiet", "quieter", "soft", "clean", "up", "out", "keep", "whole", "full", "entire", "everything", "same", "as", "is", "be", "can", "you",
  "make", "vertical", "crop", "reframe", "remove", "reduce", "fix", "improve", "better", "louder", "volume", "level", "levels",
  "caption", "captions", "captioned", "subtitle", "subtitles", "subs", "music", "song", "track", "sound", "audio", "noise", "hum", "echo",
  "colour", "color", "colours", "colors", "brighten", "brighter", "warmer", "grade", "look",
]);
/** At least one of these: what the finish is. */
const FINISH_ASKS = /\b(captions?|captioned|subtitles?|subs|music|song|track|sound|audio|noise|hum|echo|colou?rs?|brighten|brighter|warmer|grade|vertical|crop|reframe|louder|volume)\b/i;

export type BriefIntent = { keepWhole: boolean; music: boolean; captions: boolean };

export function briefIntent(prompt: string | null | undefined, hasReference = false): BriefIntent {
  const p = (prompt ?? "").toLowerCase().replace(/\b9\s*:\s*16\b/g, "vertical");
  const music = /\b(music|song|track|beat)\b/.test(p);
  const captions = /\b(captions?|captioned|subtitles?|subs)\b/.test(p);
  if (hasReference || !p.trim() || !FINISH_ASKS.test(p)) return { keepWhole: false, music, captions };
  const words = p.match(/[a-z]+/g) ?? [];
  return { keepWhole: words.every((w) => FINISH_WORDS.has(w)), music, captions };
}
