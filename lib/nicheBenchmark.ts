// lib/nicheBenchmark.ts
//
// The competitors page currently prints "—" in the Niche average and Position
// columns, because Instagram exposes no analytics for accounts you don't own.
// That honesty is right and stays — we are NOT inventing competitor numbers.
//
// But there is a third category the page wasn't using: PUBLISHED BENCHMARKS.
// These are measured, sourced figures for what a given follower tier averages.
// They are not competitor data and not a guess — they're a citable reference
// point, and they turn an empty table into one a user can act on.
//
// Every value here is traceable to lib/benchmarks.ts (version 2026.08).

export type Tier = {
  id: "nano" | "micro" | "mid" | "macro" | "mega";
  label: string;
  /** Inclusive lower bound on followers. */
  min: number;
  /** Typical Reels engagement rate range for this tier, in percent. */
  engLow: number;
  engHigh: number;
};

/**
 * Engagement rate falls sharply as follower count rises — nano accounts run
 * roughly 6x the rate of mega accounts. Comparing any account to a single
 * global average is the most common way these tools mislead people.
 */
export const TIERS: Tier[] = [
  { id: "nano",  label: "Nano (1K to 10K)",     min: 0,       engLow: 5.0, engHigh: 9.0 },
  { id: "micro", label: "Micro (10K to 100K)",  min: 10_000,  engLow: 4.0, engHigh: 5.5 },
  { id: "mid",   label: "Mid (100K to 500K)",   min: 100_000, engLow: 1.5, engHigh: 3.0 },
  { id: "macro", label: "Macro (500K to 1M)",   min: 500_000, engLow: 1.2, engHigh: 2.0 },
  { id: "mega",  label: "Mega (1M+)",        min: 1_000_000, engLow: 0.8, engHigh: 1.4 },
];

export function tierFor(followers: number | null): Tier | null {
  if (followers == null || followers < 0) return null;
  let match = TIERS[0];
  for (const t of TIERS) if (followers >= t.min) match = t;
  return match;
}

export type Position = {
  /** Short verdict shown in the Position column. */
  text: string;
  /** "up" beats the benchmark, "mid" sits inside it, "down" trails it. */
  tone: "up" | "mid" | "down" | "none";
  /** Longer explanation for the tooltip. */
  detail?: string;
};

const NO_DATA: Position = { tone: "none", text: "Not enough data" };

/** Where the user's engagement rate sits against their own tier's published range. */
export function engagementPosition(
  rate: number | null,
  followers: number | null,
): Position {
  const tier = tierFor(followers);
  if (rate == null || !tier) return NO_DATA;

  if (rate >= tier.engHigh) {
    return {
      tone: "up",
      text: "Above tier benchmark",
      detail: `${rate.toFixed(1)}% is above the ${tier.engLow} to ${tier.engHigh}% range typical for ${tier.label} accounts.`,
    };
  }
  if (rate >= tier.engLow) {
    return {
      tone: "mid",
      text: "Within tier benchmark",
      detail: `${rate.toFixed(1)}% sits inside the ${tier.engLow} to ${tier.engHigh}% range typical for ${tier.label} accounts.`,
    };
  }
  return {
    tone: "down",
    text: "Below tier benchmark",
    detail: `${rate.toFixed(1)}% is under the ${tier.engLow} to ${tier.engHigh}% range typical for ${tier.label} accounts.`,
  };
}

/** Posting cadence against common growth guidance of 3–5 posts a week. */
export function frequencyPosition(perWeek: number | null): Position {
  if (perWeek == null) return NO_DATA;
  if (perWeek >= 3 && perWeek <= 7) {
    return { tone: "up", text: "On cadence", detail: `${perWeek.toFixed(1)}/week is inside the commonly cited 3 to 5 a week range.` };
  }
  if (perWeek > 7) {
    return { tone: "mid", text: "Very high cadence", detail: `${perWeek.toFixed(1)}/week is above 5/week. Volume is fine if quality holds.` };
  }
  return { tone: "down", text: "Under-posting", detail: `${perWeek.toFixed(1)}/week is below the commonly cited 3 to 5 a week range.` };
}

/**
 * The benchmark value to show in the "Niche average" column for a given row.
 * Returns null where no published benchmark exists — those rows keep showing
 * "—" rather than getting a fabricated number.
 */
export function benchmarkFor(
  label: string,
  followers: number | null,
): { value: string; note: string } | null {
  const tier = tierFor(followers);

  switch (label) {
    case "Engagement rate":
      return tier
        ? {
            value: `${tier.engLow} to ${tier.engHigh}%`,
            note: `Published benchmark for ${tier.label} accounts on Reels. Not competitor data.`,
          }
        : null;

    case "Posting frequency":
      return {
        value: "3 to 5 a week",
        note: "Common growth guidance, not measured competitor data.",
      };

    case "Reel performance":
      return {
        value: "3.2× static",
        note: "Reels average 3.8% engagement vs 1.2% for static feed posts across all tiers.",
      };

    // Followers, median engagement, median views and growth have no meaningful
    // published benchmark — an account's median views depend entirely on its
    // own reach. Deliberately left empty.
    default:
      return null;
  }
}

/** Shown once under the table so the numbers are attributable. */
export const BENCHMARK_ATTRIBUTION =
  "Benchmarks are published 2026 industry figures for your follower tier, not measured data from the accounts you track. Instagram exposes no analytics for accounts you don't own.";
