// A plan's one-line diagnosis, without a score. Plans used to be asked for "a
// health score", and the writer put one in the headline ("Health 40/100:
// ..."). Nothing measures it, so it is never shown (Noah's standard: no
// invented scores; found on the Dashboard 2026-11-16 beside the real content
// score of 94). New plans aren't asked for one; this also cleans the plans
// already saved, wherever a headline is read. Pure and browser-safe.

const HEALTH = /\b(?:(?:account|content|overall|profile)\s+)?health(?:\s+score)?\s*(?:is|of|at)?\s*[:\-]?\s*\d{1,3}\s*(?:\/|out of)\s*100\b\s*[:.,;\-\u2013\u2014]?\s*/gi;
const OUT_OF_100 = /\(?\b\d{1,3}\s*(?:\/|out of)\s*100\b\)?\s*[:.,;\-\u2013\u2014]?\s*/gi;

/** The headline with any score out of 100 taken out. */
export function planHeadline(raw: string | null | undefined): string {
  const s = (raw ?? "").replace(HEALTH, "").replace(OUT_OF_100, "").replace(/\s+/g, " ").replace(/^[\s:.,;\-\u2013\u2014]+/, "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
