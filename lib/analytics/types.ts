// The normalized cross-platform analytics contract.
//
// SOCIA speaks one analytics language regardless of platform. Each platform
// adapter (lib/analytics/adapters/*) maps that platform's raw API shape into
// these types; the universal shell, the visualization selector and the insight
// engine only ever read these types — they never see a platform's raw fields.
//
//   raw platform data → adapter → NormalizedAccountAnalytics → select viz → render → AI interprets
//
// Two rules are load-bearing here and enforced by the capability registry
// (./capabilities): a metric a platform does not expose is UNAVAILABLE, never
// zero; and only a genuine per-day platform series may be charted as time
// (trueSeries), so content totals stamped on a publish date are never dressed
// up as a daily account series.

import type { Metric, Status } from "../dashboardMetrics";

// Re-exported so the analytics layer has one import surface. The provenance
// envelope (value/status/source/method/period/sampleSize) is reused verbatim
// from dashboardMetrics — it is already the right shape, just Instagram-only
// in its current callers.
export type { Metric, Status };

export type Platform = "instagram" | "youtube" | "facebook" | "tiktok";

export const PLATFORMS: Platform[] = ["instagram", "youtube", "facebook", "tiktok"];

// Canonical, platform-independent metric identifiers. A platform declares in
// the capability registry which of these it actually provides and at what
// level; the label shown to the user is platform-specific (YouTube's
// `followers` reads "Subscribers").
export type MetricKey =
  | "followers" //       audience size (followers / subscribers), a level
  | "net_followers" //   followers gained/lost within a period
  | "views" //           content / video views
  | "reach" //           unique accounts reached
  | "watch_time" //      minutes watched (video platforms)
  | "engagement" //      total interactions (likes + comments + shares + saves)
  | "engagement_rate" // engagement ÷ (reach | followers), a ratio
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "posts"; //          content items published in a period

export type MetricUnit = "count" | "percent" | "minutes" | "seconds";

// What kind of data a metric is for a given platform. A metric may be
// available at several levels (Instagram `views` is series + content).
//   snapshot — a point-in-time account total (followers now, lifetime views)
//   series   — a genuine per-day account series returned by the platform API
//   content  — a per-post / per-video value
//   derived  — computed here from verified values
export type MetricLevel = "snapshot" | "series" | "content" | "derived";

// How a displayed value was obtained. Generalizes overview.ts's Instagram-only
// Provenance so every platform speaks it.
//   platform_daily — a real per-day series the platform reports (TREND-eligible)
//   publish_totals — content totals stamped on each item's publish day; NOT a
//                    daily account series and must never be labeled as one
//   snapshot       — a level SOCIA records once a day from connect onward
//   derived        — computed here from verified inputs
//   unavailable    — the platform does not expose it
export type Provenance = "platform_daily" | "publish_totals" | "snapshot" | "derived" | "unavailable";

// Normalized content formats across platforms. Adapters map native types
// (Instagram media_type, YouTube duration, Facebook status_type) into these so
// baselines can compare like with like (Reels vs Reels, Shorts vs Shorts).
export type ContentFormat =
  | "reel"
  | "short"
  | "video"
  | "photo"
  | "carousel"
  | "story"
  | "live"
  | "text"
  | "link"
  | "post"; // fallback when the platform doesn't tell us

export type DemographicDimension = "age" | "gender" | "city" | "country";

export type SeriesPoint = { day: string; value: number | null; postIds: string[] };

// A normalized metric series. `trueSeries` is the honesty gate: only when it is
// true may the visualization selector place this in TREND mode as a time axis.
export type NormalizedSeries = {
  metric: MetricKey;
  label: string;
  unit: MetricUnit;
  provenance: Provenance;
  /** True only for a genuine per-day platform series. Gates TREND-mode charts. */
  trueSeries: boolean;
  /** Default render when shown as-is; the selector may still override per mode. */
  render: "line" | "area" | "bar";
  /** One sentence shown with the chart about where the numbers come from. */
  note: string;
  current: SeriesPoint[];
  previous: SeriesPoint[];
  total: number | null;
  prevTotal: number | null;
};

// A normalized content item. Unknown metrics are null, never 0.
export type NormalizedPost = {
  id: string;
  platform: Platform;
  format: ContentFormat;
  title: string;
  caption: string;
  publishedAt: string;
  thumb: string | null;
  permalink: string | null;
  /** Per-metric values actually returned for this item; absent/unknown = null. */
  metrics: Partial<Record<MetricKey, number | null>>;
  /** Total interactions, for engagement baselines. null when none are known. */
  engagement: number | null;
  /** interactions ÷ the account's median comparable post. null until a baseline exists. */
  multiplier: number | null;
};

export type DemographicBar = { label: string; value: number; share: number };

export type NormalizedDemographics = {
  status: "ok" | "unavailable";
  /** Why it's unavailable, shown verbatim; empty when status is "ok". */
  reason: string;
  /** Only the dimensions the platform actually returns are present. */
  dimensions: Partial<Record<DemographicDimension, DemographicBar[]>>;
  /** Stated basis, e.g. "current followers" (IG) vs "viewers in this period" (YouTube). */
  basis: string;
};

export type NormalizedAccount = {
  platform: Platform;
  accountId: string;
  handle: string | null;
  name: string | null;
  avatar: string | null;
  /** "Followers" or "Subscribers" — the platform's word for audience size. */
  audienceLabel: string;
  connectedAt: string | null;
  syncedAt: string | null;
};

// The full normalized bundle one connected account produces for a period. This
// is the single object the universal shell renders and the insight engine
// reads — identical shape for every platform.
export type NormalizedAccountAnalytics = {
  account: NormalizedAccount;
  /** KPI snapshot metrics as Metric<T> so each carries status + sample size. */
  kpis: Partial<Record<MetricKey, Metric>>;
  /** Time-oriented series keyed by metric; only present metrics appear. */
  series: Partial<Record<MetricKey, NormalizedSeries>>;
  posts: NormalizedPost[];
  demographics: NormalizedDemographics;
  /** The account's median comparable-post interactions, per format, for vs-typical. */
  baseline: Partial<Record<ContentFormat, number>> & { all?: number };
  /** True when the platform is connected but still collecting first data. */
  collecting: boolean;
};
