// Text cut to a length without breaking a word, and text that was stored cut mid-word shown tidily. Pure.

/**
 * Text cut to at most `n` characters at the end of a sentence (or, with none in the back half, a word), never
 * mid-word: a filming direction cut at "Keep the phone moving slowly and th" reads as broken.
 */
export function cutClean(t: string, n: number): string {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const end = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((m) => cut.lastIndexOf(m)));
  if (end >= n * 0.5) return cut.slice(0, end + 1).trim();
  // Room for the ellipsis, so the result is never longer than n.
  const room = cut.slice(0, n - 1), space = room.lastIndexOf(" ");
  return `${room.slice(0, space > n * 0.5 ? space : n - 1).trim()}\u2026`;
}

/** Saved text that was cut mid-sentence before cutClean: shown up to its last whole sentence when one is in the back half. */
export function wholeSentences(t: string): string {
  const s = t.trim();
  if (!s || /[.!?\u2026)"'\u201d]$/.test(s)) return s;
  const end = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((m) => s.lastIndexOf(m)));
  return end >= s.length * 0.4 ? s.slice(0, end + 1).trim() : s;
}

/** Text that was stored cut at `cap` mid-word (it fills the cap and ends without punctuation): its last part-word dropped, and an ellipsis. */
export function markCut(t: string, cap: number): string {
  const s = t.trim();
  if (s.length < cap || /[.!?\u2026)"'\u201d]$/.test(s)) return s;
  const space = s.lastIndexOf(" ");
  return `${(space > cap * 0.5 ? s.slice(0, space) : s).replace(/[\s,;:]+$/, "")}\u2026`;
}
