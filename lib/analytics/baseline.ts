// The baseline engine — the account's "typical" performance, computed the same
// way for every platform so vs-typical (COMPARE mode) is comparable.
//
// Two rules from the spec:
//   • Segment like-with-like. A Reel is compared to the median Reel, a Short to
//     the median Short — never a Reel to a Short. A format needs a minimum
//     sample before it earns its own baseline; below that it falls back to the
//     account-wide median so one or two posts can't define "typical".
//   • Medians, not means, so a single breakout post can't move the baseline.
//
// Unknown engagement (a post whose interaction counts the platform didn't
// return) is EXCLUDED, never counted as zero — the same discipline as
// dashboardMetrics.getAverageLikes.

import { median } from "../metrics";
import type { ContentFormat } from "./types";

export type Baselines = Partial<Record<ContentFormat, number>> & {
  /** Account-wide median comparable-post interactions; the fallback. */
  all?: number;
};

type Scored = { format: ContentFormat; engagement: number | null };

/** Median interactions per format (and overall), for posts whose engagement is
 *  actually known. A format-specific baseline is only emitted once at least
 *  `minPerFormat` posts of that format have known engagement; the account-wide
 *  fallback needs at least `minAll` known posts, so a tiny account never gets a
 *  noisy "vs typical". */
export function computeBaselines(posts: Scored[], minPerFormat = 3, minAll = 5): Baselines {
  const known = posts.filter((p): p is { format: ContentFormat; engagement: number } => p.engagement != null && p.engagement >= 0);
  const out: Baselines = {};
  if (known.length >= minAll) {
    const all = median(known.map((p) => p.engagement));
    if (all != null && all > 0) out.all = all;
  }

  const groups = new Map<ContentFormat, number[]>();
  for (const p of known) groups.set(p.format, [...(groups.get(p.format) ?? []), p.engagement]);
  for (const [format, xs] of groups) {
    if (xs.length < minPerFormat) continue;
    const m = median(xs);
    if (m != null && m > 0) out[format] = m;
  }
  return out;
}

/** A post's performance relative to its like-with-like typical. Prefers the
 *  format baseline, falls back to the account-wide one; null when neither
 *  exists yet or the post's engagement is unknown. */
export function multiplierFor(engagement: number | null, format: ContentFormat, baselines: Baselines): number | null {
  if (engagement == null) return null;
  const base = baselines[format] ?? baselines.all;
  return base && base > 0 ? engagement / base : null;
}

/** The baseline actually used for a format (format-specific or the fallback),
 *  with which one it was — for honest "vs your median Reel" vs "vs your median
 *  post" labelling. null when no baseline exists. */
export function baselineUsed(format: ContentFormat, baselines: Baselines): { value: number; kind: "format" | "all" } | null {
  if (baselines[format] != null) return { value: baselines[format]!, kind: "format" };
  if (baselines.all != null) return { value: baselines.all, kind: "all" };
  return null;
}
