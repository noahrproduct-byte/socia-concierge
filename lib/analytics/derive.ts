// Deterministic derivations the universal tabs render — format breakdowns, the
// format comparison table, posting windows and the engagement split. Pure
// functions over normalized posts; unknown values are excluded, never zeroed,
// and medians are used so one breakout can't move a summary.

import { median } from "../metrics";
import { buildWindows, type TimedPost, type Windows } from "../postingTimes";
import { formatLabel, formatLabelPlural } from "./format";
import type { ContentFormat, MetricKey, NormalizedPost } from "./types";

/** Which metric a content breakdown should use: views when every post has one,
 *  otherwise engagement (the same honest fallback the IG page uses). */
export function breakdownMetric(posts: NormalizedPost[]): "views" | "engagement" {
  const withPosts = posts.length > 0;
  return withPosts && posts.every((p) => p.metrics.views != null) ? "views" : "engagement";
}

export type BreakdownSlice = { key: ContentFormat; label: string; value: number; share: number; count: number };

export function formatBreakdown(posts: NormalizedPost[], metric: "views" | "engagement"): { slices: BreakdownSlice[]; total: number; metric: "views" | "engagement" } {
  const groups = new Map<ContentFormat, { value: number; count: number }>();
  for (const p of posts) {
    const v = metric === "views" ? p.metrics.views ?? null : p.engagement;
    if (v == null) continue;
    const g = groups.get(p.format) ?? { value: 0, count: 0 };
    g.value += v;
    g.count += 1;
    groups.set(p.format, g);
  }
  const total = [...groups.values()].reduce((s, g) => s + g.value, 0);
  const slices = [...groups.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .map(([key, g]) => ({ key, label: formatLabelPlural(key), value: g.value, share: total ? g.value / total : 0, count: g.count }));
  return { slices, total, metric };
}

export type FormatRow = { format: ContentFormat; label: string; count: number; medViews: number | null; medEng: number | null; medMult: number | null };

export function formatTable(posts: NormalizedPost[]): FormatRow[] {
  const groups = new Map<ContentFormat, NormalizedPost[]>();
  for (const p of posts) groups.set(p.format, [...(groups.get(p.format) ?? []), p]);
  return [...groups.entries()]
    .map(([format, ps]) => ({
      format,
      label: formatLabelPlural(format),
      count: ps.length,
      medViews: median(ps.map((p) => p.metrics.views).filter((v): v is number => v != null)),
      medEng: median(ps.map((p) => p.engagement).filter((v): v is number => v != null)),
      medMult: median(ps.map((p) => p.multiplier).filter((v): v is number => v != null)),
    }))
    .sort((a, b) => (b.medEng ?? 0) - (a.medEng ?? 0));
}

/** Normalized posts → the TimedPost shape the posting-window engine expects.
 *  Only dated posts with known engagement contribute. */
export function toTimed(posts: NormalizedPost[]): TimedPost[] {
  return posts
    .filter((p) => p.engagement != null && p.publishedAt && !isNaN(new Date(p.publishedAt).getTime()))
    .map((p) => ({ id: p.id, t: p.publishedAt, e: p.engagement!, format: formatLabel(p.format) }));
}

export function postingWindows(posts: NormalizedPost[]): Windows {
  return buildWindows(toTimed(posts));
}

export type EngPart = { key: MetricKey; value: number; share: number | null };

/** Total interactions split into likes/comments/shares/saves, using only the
 *  components the platform actually returned. A component absent everywhere is
 *  omitted (not shown as 0). */
export function engagementSplit(posts: NormalizedPost[]): { parts: EngPart[]; total: number | null } {
  const keys: MetricKey[] = ["likes", "comments", "shares", "saves"];
  const sums = new Map<MetricKey, number | null>();
  for (const k of keys) {
    const vals = posts.map((p) => p.metrics[k] ?? null).filter((v): v is number => v != null);
    sums.set(k, vals.length ? vals.reduce((a, b) => a + b, 0) : null);
  }
  const present = keys.filter((k) => sums.get(k) != null);
  const total = present.length ? present.reduce((s, k) => s + (sums.get(k) as number), 0) : null;
  const parts = present.map((k) => ({ key: k, value: sums.get(k) as number, share: total && total > 0 ? (sums.get(k) as number) / total : null }));
  return { parts, total };
}

export type PostFilter = "top" | "under" | "breakout" | "all";

/** Content sub-views. Underperforming/breakouts need a baseline (multiplier);
 *  when none exists yet they return empty and the UI says why. */
export function filterPosts(posts: NormalizedPost[], kind: PostFilter): NormalizedPost[] {
  const byStat = (a: NormalizedPost, b: NormalizedPost) => ((b.metrics.views ?? b.engagement ?? -1) - (a.metrics.views ?? a.engagement ?? -1));
  if (kind === "under") return posts.filter((p) => p.multiplier != null && p.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0));
  if (kind === "breakout") return posts.filter((p) => p.multiplier != null && p.multiplier >= 3).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0));
  return [...posts].sort(byStat);
}
