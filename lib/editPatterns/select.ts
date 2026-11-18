// Which patterns fit one video: matched on the niche and the kind of video,
// ranked by where the evidence comes from (this brand's own results, then its
// niche's measured Reels, then the studies), how sure SOCIA is and how much
// evidence there is. Pure.
import type { Confidence, EditPattern, PatternSource } from "./types";

export type PatternQuery = {
  niche: string | null;
  /** The kind of video when known: a house genre or a Reel format. */
  category?: string | null;
  /** Words from the request ("before and after", "demo", "pizza"). */
  words?: string[];
};

const SOURCE_RANK: Record<PatternSource, number> = { results: 3, scan: 2, study: 1 };
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const tokens = (s: string | null | undefined) => (s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** How well a pattern fits the request; 0 when nothing matches. */
export function fitScore(p: EditPattern, q: PatternQuery): number {
  const want = new Set([...tokens(q.niche), ...(q.words ?? []).flatMap(tokens)]);
  const applies = p.appliesTo.flatMap(tokens);
  let fit = applies.filter((w) => want.has(w)).length;
  if (q.category && p.category === q.category) fit += 3;
  // A scan pattern was found in this brand's own niche.
  if (p.source === "scan" || p.source === "results") fit += 2;
  if (p.appliesTo.includes("any")) fit += 0.5;
  return fit;
}

/** The patterns that fit, best first, at most `max`. */
export function relevantPatterns(all: EditPattern[], q: PatternQuery, max = 4): EditPattern[] {
  return all
    .map((p) => ({ p, fit: fitScore(p, q) }))
    .filter((x) => x.fit > 0)
    .sort((a, b) => b.fit - a.fit || SOURCE_RANK[b.p.source] - SOURCE_RANK[a.p.source] || CONF_RANK[b.p.confidence] - CONF_RANK[a.p.confidence] || b.p.observed.reels - a.p.observed.reels)
    .slice(0, max)
    .map((x) => x.p);
}
