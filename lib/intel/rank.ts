// How SOCIA ranks the accounts a brand learns from (intelligence engine phase
// 2, Noah 2026-11-25). One ranking for every feature: Discover's list, which
// accounts the niche read studies first, and the order plans see them in.
//
// Five parts, each from numbers SOCIA has already saved (no platform call):
//   business      a business like yours (SOCIA's fit check), or the same niche
//   audience      a similar size to you, and your city when you serve locally
//   growth        followers over the last 30 days, from SOCIA's daily history
//   performance   how many people watch its Reels, Reels that broke out past
//                 its own usual, and engagement; not follower count alone
//   practical     its videos are made the way yours are, and it posts steadily
// The person's priority accounts always come first. A part with no data adds
// nothing and is never guessed. Each account gets the reasons it ranks where
// it does, in plain words. Pure and browser-safe.

import type { FitVerdict } from "../discoverStyle";

export type RankInput = {
  platform: string;
  handle: string;
  fit: FitVerdict | null;
  followers: number | null;
  /** median views of its recent Reels or Shorts */
  medianViews: number | null;
  /** likes and comments per post, against followers (0.04 = 4%) */
  engagement: number | null;
  postsPerWeek: number | null;
  /** its Reels at 3x its own usual or more, in the posts read */
  breakouts: number;
  sameStyle: boolean;
  /** follower change over about 30 days (0.06 = +6%), from saved history; null when there isn't enough */
  growth30: number | null;
  /** its profile names the brand's city (only asked when the brand serves locally) */
  local: boolean | null;
  pinned: boolean;
};

export type BrandFacts = { followers: number | null; servesLocally: boolean };

export type RankPart = "business" | "audience" | "growth" | "performance" | "practical";
export type Ranked = {
  key: string; score: number; pinned: boolean; parts: Record<RankPart, number>; reasons: string[];
  /** the numbers it was ranked on that other features reuse (posting pace for opportunities); absent on older profiles */
  stats?: { followers: number | null; postsPerWeek: number | null; medianViews: number | null };
};

export const keyOf = (platform: string, handle: string) => `${platform}:${handle.replace(/^@/, "").toLowerCase()}`;

const WEIGHT: Record<RankPart, number> = { business: 2, audience: 1, growth: 1, performance: 2, practical: 1 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v)));

/** Followers growth over about 30 days from a daily history (oldest first or any order); null without 3 weeks of it. */
export function growth30(rows: { day: string; followers: number | null }[], now: Date): number | null {
  const pts = rows.filter((r) => r.followers != null && r.followers > 0 && Date.parse(r.day) >= now.getTime() - 40 * 86_400_000)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  if (Date.parse(last.day) - Date.parse(first.day) < 21 * 86_400_000) return null;
  return (last.followers! - first.followers!) / first.followers!;
}

export function rankOne(a: RankInput, brand: BrandFacts): Ranked {
  const reasons: string[] = [];
  // Business: SOCIA's fit check; an account it hasn't judged yet is neither credited nor ruled out.
  const business = a.fit === "competitor" ? 1 : a.fit === "niche" ? 0.6 : a.fit === "off" ? 0 : 0.4;
  if (a.fit === "competitor") reasons.push("A business like yours");
  else if (a.fit === "niche") reasons.push("In your niche");

  // Audience: closest in size scores highest (a tenth to ten times yours), plus the brand's city for a local business.
  let audience = 0;
  if (a.followers && brand.followers) {
    const ratio = a.followers / brand.followers;
    audience = clamp(1 - Math.abs(Math.log10(ratio)) / 2) * 0.7;
    if (ratio >= 0.3 && ratio <= 3) reasons.push("About your size");
    else if (ratio > 3 && ratio <= 30) reasons.push(`${Math.round(ratio)}x your followers`);
  }
  if (brand.servesLocally && a.local) { audience += 0.3; reasons.push("In your city"); }

  // Growth: +10% in 30 days counts fully; a shrinking account counts nothing.
  const growth = a.growth30 != null ? clamp(a.growth30 / 0.1) : 0;
  if (a.growth30 != null && a.growth30 >= 0.02) reasons.push(`Followers up ${Math.round(a.growth30 * 100)}% in 30 days`);

  // Performance: views first (log scale, so a giant doesn't win on size alone), reach past its own followers, breakouts, engagement.
  const views = a.medianViews && a.medianViews > 0 ? clamp((Math.log10(a.medianViews) - 2) / 4) : 0;
  const reach = a.medianViews && a.followers ? clamp(Math.log2(Math.max(1, a.medianViews / a.followers)) / 3) : 0;
  const performance = clamp(views * 0.5 + reach * 0.2 + Math.min(a.breakouts, 3) / 3 * 0.2 + clamp((a.engagement ?? 0) / 0.08) * 0.1);
  if (a.medianViews) reasons.push(`Reels usually reach ${short(a.medianViews)} views`);
  if (a.medianViews && a.followers && a.medianViews > a.followers * 1.5) reasons.push("Reaches well past its followers");
  if (a.breakouts) reasons.push(`${a.breakouts} Reel${a.breakouts === 1 ? "" : "s"} at 3x its usual or more`);

  // Practical: videos made the way the brand's are, and steady posting to learn a rhythm from.
  const practical = clamp((a.sameStyle ? 0.7 : 0) + Math.min(a.postsPerWeek ?? 0, 5) / 5 * 0.3);
  if (a.sameStyle) reasons.push("Makes videos the way you do");

  const parts = { business, audience: clamp(audience), growth, performance, practical };
  const score = (Object.keys(WEIGHT) as RankPart[]).reduce((s, k) => s + parts[k] * WEIGHT[k], 0);
  if (a.pinned) reasons.unshift("Your priority");
  return { key: keyOf(a.platform, a.handle), score: Math.round(score * 100) / 100, pinned: a.pinned, parts, reasons: reasons.slice(0, 4), stats: { followers: a.followers, postsPerWeek: a.postsPerWeek, medianViews: a.medianViews } };
}

/** Best first: the person's priority accounts, then by score; ties keep the order given. */
export function rankAccounts(list: RankInput[], brand: BrandFacts): Ranked[] {
  return list.map((a, i) => ({ r: rankOne(a, brand), i }))
    .sort((x, y) => Number(y.r.pinned) - Number(x.r.pinned) || y.r.score - x.r.score || x.i - y.i)
    .map((x) => x.r);
}

/** Priority accounts a brand may mark: enough to steer, few enough to mean something. */
export const MAX_PINS = 5;
