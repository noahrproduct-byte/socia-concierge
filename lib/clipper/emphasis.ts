// The one word on each caption line that gets the colour: the word the picker
// marked as the point of the line, otherwise a number. Pure, client-safe.

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");

export const readEmphasis = (v: unknown): string[] => (Array.isArray(v) ? v.filter((w): w is string => typeof w === "string").map(norm).filter(Boolean) : []);

/** The token to colour on one line, or -1. Marked words come first, then anything with a digit. */
export function emphasisIndex(tokens: string[], marked: string[]): number {
  const clean = tokens.map(norm);
  const hit = clean.findIndex((t) => t && marked.includes(t));
  return hit >= 0 ? hit : clean.findIndex((t) => /\d/.test(t));
}

/** The picker's marked words that are really in the clip, at most `max`. */
export function checkEmphasis(raw: unknown, spoken: string[], max = 16): string[] {
  const said = new Set(spoken.map(norm));
  return Array.from(new Set(readEmphasis(raw))).filter((w) => said.has(w)).slice(0, max);
}
