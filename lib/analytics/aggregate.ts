// All-Accounts aggregation. Cross-platform totals are only formed where they
// are mathematically defensible: additive counts (views, watch time,
// interactions, posts, net audience adds) are summed; ratios are never summed;
// and combined audience size is kept separate because followers/subscribers on
// different platforms are different people, not one audience — the UI states
// that caveat. The platform breakdown is by views, the one metric every video
// platform reports.

import { isCrossPlatformAdditive, platformCapability } from "./capabilities";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedPost, Platform } from "./types";

const ADDITIVE: MetricKey[] = ["views", "watch_time", "engagement", "posts", "net_followers"];

export type PlatformShare = {
  platform: Platform;
  label: string;
  views: number | null;
  netAudience: number | null;
  share: number;
};

export type AllAccounts = {
  /** Summed additive metrics; `followers` is the summed audience size, kept
   *  separate and shown with a "not unique people" caveat. */
  totals: Partial<Record<MetricKey, number | null>>;
  /** Per-platform view share, largest first. */
  platforms: PlatformShare[];
  /** Every account's posts, combined and ranked by their headline stat. */
  posts: NormalizedPost[];
  /** Platforms whose audiences were summed into `totals.followers`. */
  audiencePlatforms: string[];
};

export function aggregateAccounts(accounts: NormalizedAccountAnalytics[], rangeDays?: number, now: Date = new Date()): AllAccounts {
  const totals: Partial<Record<MetricKey, number | null>> = {};
  for (const k of ADDITIVE) {
    if (!isCrossPlatformAdditive(k)) continue;
    if (k === "posts") continue; // period-consistent count computed below, not summed from mixed KPIs
    // A metric's period total may live on the KPI (views) or only on the series
    // (Instagram engagement). Prefer the KPI, fall back to the series total.
    const vals = accounts.map((a) => a.kpis[k]?.value ?? a.series[k]?.total ?? null).filter((v): v is number => v != null);
    totals[k] = vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }
  // Content published in the period, counted from each account's own posts so
  // platforms with different "posts" semantics (YouTube's KPI is lifetime video
  // count) are never mixed into one period total.
  if (rangeDays != null) {
    const since = now.getTime() - rangeDays * 86400000;
    const inRange = accounts.reduce((s, a) => s + a.posts.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= since).length, 0);
    totals.posts = inRange;
  } else {
    const vals = accounts.map((a) => a.kpis.posts?.value ?? null).filter((v): v is number => v != null);
    totals.posts = vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }
  // Combined audience — the sum of followers/subscribers, explicitly not unique.
  const aud = accounts.map((a) => a.kpis.followers?.value ?? null).filter((v): v is number => v != null);
  totals.followers = aud.length ? aud.reduce((s, v) => s + v, 0) : null;
  const audiencePlatforms = accounts.filter((a) => a.kpis.followers?.value != null).map((a) => platformCapability(a.account.platform).label);

  const totalViews = totals.views ?? 0;
  const platforms: PlatformShare[] = accounts
    .map((a) => {
      const views = a.kpis.views?.value ?? null;
      const netAudience = a.series.net_followers?.total ?? a.kpis.net_followers?.value ?? null;
      return { platform: a.account.platform, label: platformCapability(a.account.platform).label, views, netAudience, share: totalViews > 0 && views ? views / totalViews : 0 };
    })
    .sort((x, y) => (y.views ?? -1) - (x.views ?? -1));

  const posts = accounts
    .flatMap((a) => a.posts)
    .sort((a, b) => (b.metrics.views ?? b.engagement ?? -1) - (a.metrics.views ?? a.engagement ?? -1));

  return { totals, platforms, posts, audiencePlatforms };
}
