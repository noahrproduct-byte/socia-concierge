// SOCIA Performance Score — a 0-100 composite over the user's REAL metrics,
// each sub-score mapped against the published 2026 benchmarks in
// lib/nicheBenchmark. Nothing here is generated or guessed: every component
// carries the formula sentence it was computed from, and a component whose
// input the platform didn't publish stays null rather than defaulting.
// The overall score only exists when at least two components do.

import type { LeaderRow } from "./competitorRollup";
import { tierFor } from "./nicheBenchmark";

export type ScoreComponent = {
  key: "engagement" | "consistency" | "growth" | "reach";
  label: string;
  /** 0-100, or null when the input metric is absent. */
  value: number | null;
  /** The formula + inputs, shown on hover. Absence reason when value is null. */
  note: string;
};

export type PerformanceScore = {
  /** null until at least two components are computable. */
  overall: number | null;
  components: ScoreComponent[];
  /** How many components the overall is averaged from. */
  basis: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const okVal = (c: LeaderRow[keyof Pick<LeaderRow, "engagement" | "cadence" | "audience" | "medianViews" | "momentum">]) =>
  c.state === "ok" && c.value != null ? c.value : null;

/** Engagement rate positioned inside the follower tier's published range:
 *  the bottom of the band maps to 50, the top to 85, 2× the top caps at 100. */
function engagementScore(rate: number | null, followers: number | null): ScoreComponent {
  const tier = tierFor(followers);
  if (rate == null || !tier)
    return { key: "engagement", label: "Engagement", value: null, note: rate == null ? "Needs your synced posts to compute an engagement rate." : "Needs your follower count to pick a benchmark tier." };
  const { engLow: lo, engHigh: hi } = tier;
  const value =
    rate >= hi ? clamp(85 + ((rate - hi) / hi) * 15)
    : rate >= lo ? clamp(50 + ((rate - lo) / (hi - lo)) * 35)
    : clamp((rate / lo) * 50);
  return { key: "engagement", label: "Engagement", value, note: `${rate.toFixed(1)}% rate against the ${lo}–${hi}% published range for ${tier.label} accounts.` };
}

/** Posting cadence against the commonly cited 3–5/week guidance. */
function consistencyScore(perWeek: number | null): ScoreComponent {
  if (perWeek == null)
    return { key: "consistency", label: "Consistency", value: null, note: "No posts in the selected range." };
  const value =
    perWeek >= 3 && perWeek <= 7 ? clamp(85 + (Math.min(perWeek, 5) - 3) * 7.5)
    : perWeek > 7 ? 75
    : clamp(25 + (perWeek / 3) * 60);
  return { key: "consistency", label: "Consistency", value, note: `${perWeek.toFixed(1)} posts/week against the 3–5/week growth guidance.` };
}

/** Net followers gained across the range, as a share of the audience. */
function growthScore(gained: number | null, followers: number | null): ScoreComponent {
  if (gained == null || followers == null || followers <= 0)
    return { key: "growth", label: "Growth", value: null, note: "Needs daily follower snapshots — they build up after connecting." };
  const pct = (gained / followers) * 100;
  const value =
    pct >= 2 ? 100
    : pct > 0 ? clamp(55 + (pct / 2) * 45)
    : pct === 0 ? 50
    : clamp(45 + (pct / 2) * 45);
  return { key: "growth", label: "Growth", value, note: `${gained >= 0 ? "+" : ""}${gained.toLocaleString("en-US")} followers over the range (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% of your audience).` };
}

/** Median views relative to audience size — how far a typical post travels. */
function reachScore(medianViews: number | null, followers: number | null): ScoreComponent {
  if (medianViews == null || followers == null || followers <= 0)
    return { key: "reach", label: "Reach", value: null, note: medianViews == null ? "Instagram insights views are needed — they arrive with a professional account." : "Needs your follower count." };
  const ratio = medianViews / followers;
  const value =
    ratio >= 1 ? clamp(85 + Math.min(ratio - 1, 1) * 15)
    : ratio >= 0.3 ? clamp(50 + ((ratio - 0.3) / 0.7) * 35)
    : clamp((ratio / 0.3) * 50);
  return { key: "reach", label: "Reach", value, note: `Median ${Math.round(medianViews).toLocaleString("en-US")} views ≈ ${(ratio * 100).toFixed(0)}% of your ${followers.toLocaleString("en-US")} followers per post.` };
}

export function performanceScore(you: LeaderRow | null): PerformanceScore {
  if (!you) {
    return {
      overall: null, basis: 0,
      components: [
        { key: "engagement", label: "Engagement", value: null, note: "Connect Instagram to compute this." },
        { key: "consistency", label: "Consistency", value: null, note: "Connect Instagram to compute this." },
        { key: "growth", label: "Growth", value: null, note: "Connect Instagram to compute this." },
        { key: "reach", label: "Reach", value: null, note: "Connect Instagram to compute this." },
      ],
    };
  }
  const followers = okVal(you.audience);
  const components = [
    engagementScore(okVal(you.engagement), followers),
    consistencyScore(okVal(you.cadence)),
    growthScore(okVal(you.momentum), followers),
    reachScore(okVal(you.medianViews), followers),
  ];
  const have = components.filter((c) => c.value != null) as (ScoreComponent & { value: number })[];
  return {
    overall: have.length >= 2 ? Math.round(have.reduce((s, c) => s + c.value, 0) / have.length) : null,
    components,
    basis: have.length,
  };
}

/** Rank among accounts whose engagement rate is actually published — the one
 *  metric comparable across you, YouTube channels and discovered IG accounts.
 *  Null when fewer than two accounts (including you) have a real rate. */
export function engagementRank(you: LeaderRow | null, rows: LeaderRow[]): { rank: number; of: number } | null {
  const mine = you ? okVal(you.engagement) : null;
  if (mine == null) return null;
  const rates = rows.map((r) => okVal(r.engagement)).filter((v): v is number => v != null);
  if (!rates.length) return null;
  const ahead = rates.filter((v) => v > mine).length;
  return { rank: ahead + 1, of: rates.length + 1 };
}
