// SOCIA adds competitors next to the ones the person added (Noah, 2026-11-24): about as many again, so the
// roster is roughly twice what they chose, never past 30 in all or the plan's own limit, and never an account
// they removed. Candidates are accounts SOCIA has already read on Instagram and judged to fit the niche (the
// background read, lib/discoverRead.ts), so no account, number or Reel is made up. They must clear a quality bar,
// then rank by how useful they are to learn from: big accounts doing well and small ones punching above their
// size both count. The person's own picks are never removed. Pure and browser-safe.

import type { FitVerdict } from "./discoverStyle";

/** The most accounts SOCIA's own picks bring the roster to. */
export const ROSTER_MAX = 30;
/** Accounts added in one background read: the rest follow on the next. */
export const ADDS_PER_READ = 5;

/** How many more accounts SOCIA may add now: as many as the person added, within 30 and the plan's limit. Pure. */
export function openAutoSlots(manual: number, auto: number, planLimit: number): number {
  const allowed = Math.max(0, Math.min(manual, ROSTER_MAX - manual, planLimit - manual));
  return Math.max(0, Math.min(allowed - auto, planLimit - manual - auto));
}

export type TopUpCandidate = {
  handle: string;
  name: string | null;
  fit: FitVerdict | null;
  followers: number | null;
  /** Median views of its Reels (null when Instagram shares none). */
  medianViews: number | null;
  /** Likes and comments per post against followers. */
  engagement: number | null;
  postsPerWeek: number | null;
  /** Reels in the last 60 days. */
  recentReels: number;
  /** Its Reels that did 3x its usual or more, in the posts read. */
  breakouts: number;
  /** Its videos are made the way the brand's are. */
  sameStyle: boolean;
  /** The brand is an app: there, niche accounts are creators to copy, not competitors. */
  app?: boolean;
};

/** The bar an account must clear before SOCIA adds it: it fits, it's active, and people watch it. Pure. */
export function qualifies(c: TopUpCandidate): boolean {
  if (c.fit !== "competitor" && !(c.fit === "niche" && !c.app)) return false;
  if ((c.followers ?? 0) < 1000) return false;
  if (c.recentReels < 2 || (c.postsPerWeek ?? 0) < 0.25) return false;
  return (c.medianViews ?? 0) >= 1000 || (c.engagement ?? 0) >= 0.01;
}

/**
 * How useful an account is to learn from: a direct competitor first, then how many people watch its Reels,
 * how far those reach past its followers (a small account that outperforms its size), Reels that broke out,
 * steady posting, and videos made like the brand's. Pure.
 */
export function topUpScore(c: TopUpCandidate): number {
  const views = c.medianViews && c.medianViews > 0 ? Math.min(Math.log10(c.medianViews) - 3, 3) : 0;
  const reach = c.medianViews && c.followers ? Math.min(Math.log2(Math.max(1, c.medianViews / c.followers) + 1), 2) : 0;
  const steady = Math.min(c.postsPerWeek ?? 0, 5) / 5;
  return (c.fit === "competitor" ? 2 : 1) + views + reach + Math.min(c.breakouts, 3) * 0.3 + steady + (c.sameStyle ? 0.5 : 0) + Math.min(c.engagement ?? 0, 0.1) * 5;
}

/** The accounts to add now, best first; none that fall short of the bar, however many slots are open. Pure. */
export function chooseTopUp(candidates: TopUpCandidate[], open: number, skip: Set<string>): TopUpCandidate[] {
  if (open <= 0) return [];
  const seen = new Set<string>();
  return candidates
    .filter((c) => { const h = c.handle.toLowerCase(); if (skip.has(h) || seen.has(h)) return false; seen.add(h); return qualifies(c); })
    .sort((a, b) => topUpScore(b) - topUpScore(a))
    .slice(0, Math.min(open, ADDS_PER_READ));
}

const n = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(v));

/** Why SOCIA added it, from the numbers Instagram returned. Pure. */
export function topUpReason(c: TopUpCandidate): string {
  return [
    c.fit === "competitor" ? "A business like yours" : "In your niche",
    c.followers != null ? `${n(c.followers)} followers` : null,
    c.medianViews != null ? `Reels usually reach ${n(c.medianViews)} views` : null,
    c.breakouts ? `${c.breakouts} Reel${c.breakouts === 1 ? "" : "s"} at 3x its usual or more` : null,
    c.postsPerWeek != null && c.postsPerWeek >= 1 ? `posts ${c.postsPerWeek >= 10 ? Math.round(c.postsPerWeek) : c.postsPerWeek.toFixed(1)} a week` : null,
  ].filter(Boolean).join(", ") + ".";
}
