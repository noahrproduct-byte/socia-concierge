// Everything the Dashboard and Analytics pages show, assembled from real rows
// with deterministic arithmetic. Every number carries its provenance and the
// UI renders "—" / "Not available" / "Collecting" when a source is missing.
//
//   raw platform data → normalized → calculated here → rendered → AI interprets

import type { IgMediaItem } from "./instagramSync";
import type { DailySnapshot } from "./dashboardMetrics";
import { median, postsPerWeek, pctChange } from "./metrics";
import { interactionsTotal, engagementRateOf } from "./engagement";
import { buildWindows, relText, type TimedPost } from "./postingTimes";
import type { CalPost } from "./audience";
import type { Deliverable } from "./schema";
import type { ScheduledPost } from "./scheduling";

export const DAY_MS = 86400000;

export const RANGES = [
  { id: "7", days: 7, label: "Last 7 days" },
  { id: "28", days: 28, label: "Last 28 days" },
  { id: "30", days: 30, label: "Last 30 days" },
  { id: "90", days: 90, label: "Last 90 days" },
  { id: "365", days: 365, label: "Last 12 months" },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];
export const rangeDays = (id: string | undefined): number =>
  RANGES.find((r) => r.id === id)?.days ?? 30;

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : n.toLocaleString("en-US");

export const FORMAT_LABEL: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Photo" };
export const formatOf = (m: { media_type?: string }) => FORMAT_LABEL[m.media_type ?? ""] ?? "Post";

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayList = (endExclusive: Date, days: number): string[] =>
  Array.from({ length: days }, (_, i) => new Date(endExclusive.getTime() - (days - i) * DAY_MS).toISOString().slice(0, 10));

// ---------------------------------------------------------------- posts ----

export type PostCard = {
  id: string;
  title: string;
  caption: string;
  published: string;
  format: string;
  platform: "instagram";
  isVideo: boolean;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  engagements: number;
  /** interactions ÷ the account's median post. null until a baseline exists. */
  multiplier: number | null;
  thumb: string | null;
  permalink: string | null;
};

export function displayTitle(caption: string): string {
  const first = caption.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const noTags = first.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return noTags || first || "(no caption)";
}

export function postCards(media: IgMediaItem[], baseline: number | null): PostCard[] {
  return media
    .filter((m) => m.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .map((m, i) => {
      const e = interactionsTotal(m);
      return {
        id: m.id ?? String(i),
        title: displayTitle(m.caption ?? ""),
        caption: m.caption ?? "",
        published: m.timestamp!,
        format: formatOf(m),
        platform: "instagram",
        isVideo: m.media_type === "VIDEO",
        views: m.insights?.views ?? null,
        reach: m.insights?.reach ?? null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        saves: m.insights?.saved ?? null,
        shares: m.insights?.shares ?? null,
        engagements: e,
        multiplier: baseline && baseline > 0 ? e / baseline : null,
        thumb: m.thumbnail_url || m.media_url || null,
        permalink: m.permalink ?? null,
      };
    });
}

/** Top posts by the metric the platform actually served; views when every
 *  post has them, engagement otherwise. */
export function rankPosts(posts: PostCard[], by: "views" | "engagements" = "views", limit = 6): PostCard[] {
  const haveViews = posts.some((p) => p.views != null);
  const key = by === "views" && haveViews ? "views" : "engagements";
  return [...posts].sort((a, b) => ((b[key] as number | null) ?? -1) - ((a[key] as number | null) ?? -1)).slice(0, limit);
}

// --------------------------------------------------------------- series ----

export type MetricId = "views" | "engagement" | "followers" | "reach";
export type Provenance = "instagram_daily" | "publish_totals" | "snapshot" | "unavailable";
export type SeriesPoint = { day: string; value: number | null; postIds: string[] };
export type Series = {
  metric: MetricId;
  label: string;
  provenance: Provenance;
  /** One sentence the chart shows about where the numbers come from. */
  note: string;
  current: SeriesPoint[];
  previous: SeriesPoint[];
  total: number | null;
  prevTotal: number | null;
};

const META_DAILY = "instagram_api";

export function buildSeries(
  metric: MetricId,
  media: IgMediaItem[],
  daily: DailySnapshot[],
  days: number,
  now = new Date(),
): Series {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const curDays = dayList(end, days);
  const prevDays = dayList(new Date(end.getTime() - days * DAY_MS), days);
  const rows = new Map(daily.map((d) => [d.day, d]));
  const byPublishDay = new Map<string, IgMediaItem[]>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const k = utcDay(m.timestamp);
    byPublishDay.set(k, [...(byPublishDay.get(k) ?? []), m]);
  }
  const ids = (ms: IgMediaItem[]) => ms.map((m) => m.id ?? "").filter(Boolean);

  const make = (dayKeys: string[], pick: (d: string) => { value: number | null; postIds: string[] }): SeriesPoint[] =>
    dayKeys.map((d) => ({ day: d, ...pick(d) }));

  const sum = (pts: SeriesPoint[]): number | null => {
    const vals = pts.map((p) => p.value).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const last = (pts: SeriesPoint[]): number | null => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value != null) return pts[i].value;
    return null;
  };

  if (metric === "views") {
    const metaDays = curDays.filter((d) => rows.get(d)?.views != null && rows.get(d)?.source === META_DAILY);
    if (metaDays.length) {
      const pick = (d: string) => {
        const r = rows.get(d);
        return { value: r?.source === META_DAILY ? (r.views ?? null) : null, postIds: ids(byPublishDay.get(d) ?? []) };
      };
      const current = make(curDays, pick), previous = make(prevDays, pick);
      return { metric, label: "Views", provenance: "instagram_daily", note: "Instagram's own daily views series.", current, previous, total: sum(current), prevTotal: sum(previous) };
    }
    const anyViews = media.some((m) => m.insights?.views != null);
    if (anyViews) {
      const pick = (d: string) => {
        const ms = (byPublishDay.get(d) ?? []).filter((m) => m.insights?.views != null);
        return { value: ms.length ? ms.reduce((s, m) => s + (m.insights!.views ?? 0), 0) : null, postIds: ids(ms) };
      };
      const current = make(curDays, pick), previous = make(prevDays, pick);
      return { metric, label: "Views", provenance: "publish_totals", note: "Each post's total views, placed on the day it was published. Instagram hasn't served a daily views series for this account yet.", current, previous, total: sum(current), prevTotal: sum(previous) };
    }
    return { metric, label: "Views", provenance: "unavailable", note: "Instagram hasn't returned views for this account.", current: make(curDays, () => ({ value: null, postIds: [] })), previous: [], total: null, prevTotal: null };
  }

  if (metric === "engagement") {
    const pick = (d: string) => {
      const ms = byPublishDay.get(d) ?? [];
      return { value: ms.length ? ms.reduce((s, m) => s + interactionsTotal(m), 0) : null, postIds: ids(ms) };
    };
    const current = make(curDays, pick), previous = make(prevDays, pick);
    return { metric, label: "Engagement", provenance: "publish_totals", note: "Likes + comments + saves + shares on each post, placed on the day it was published.", current, previous, total: sum(current) ?? 0, prevTotal: sum(previous) };
  }

  if (metric === "followers") {
    const pick = (d: string) => ({ value: rows.get(d)?.followers ?? null, postIds: [] });
    const current = make(curDays, pick), previous = make(prevDays, pick);
    const first = daily.find((d) => d.followers != null)?.day;
    const has = current.some((p) => p.value != null);
    return {
      metric, label: "Followers",
      provenance: has ? "snapshot" : "unavailable",
      note: first ? `Your follower count, recorded by SOCIA once a day since ${new Date(first + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}. Counts before that are not available from Instagram.` : "SOCIA records your follower count once a day from the moment you connect; no history yet.",
      current, previous, total: last(current), prevTotal: last(previous),
    };
  }

  // reach
  const pick = (d: string) => {
    const r = rows.get(d);
    return { value: r?.source === META_DAILY ? (r.reach ?? null) : null, postIds: ids(byPublishDay.get(d) ?? []) };
  };
  const current = make(curDays, pick), previous = make(prevDays, pick);
  const has = current.some((p) => p.value != null);
  return { metric, label: "Reach", provenance: has ? "instagram_daily" : "unavailable", note: has ? "Accounts reached per day, Instagram's own daily series." : "Instagram hasn't returned daily reach for this account yet.", current, previous, total: sum(current), prevTotal: sum(previous) };
}

/** Sum consecutive days into ISO weeks (Mon-start) for the weekly view. */
export function weekly(points: SeriesPoint[], mode: "sum" | "last" = "sum"): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let bucket: SeriesPoint | null = null;
  for (const p of points) {
    const d = new Date(p.day + "T00:00:00Z");
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    if (!bucket || bucket.day !== monday) {
      bucket = { day: monday, value: null, postIds: [] };
      out.push(bucket);
    }
    if (p.value != null) bucket.value = mode === "last" ? p.value : (bucket.value ?? 0) + p.value;
    bucket.postIds.push(...p.postIds);
  }
  return out;
}

// --------------------------------------------------------------- buckets ---

export type Granularity = "day" | "week" | "month" | "year";
export type Bucket = {
  key: string;
  /** First calendar day of the bucket (ISO). */
  start: string;
  /** Last calendar day of the bucket that lies inside the series (ISO). */
  end: string;
  value: number | null;
  postIds: string[];
  /** Days inside the bucket that had a value. */
  days: number;
  /** The bucket containing today: still accumulating. */
  partial: boolean;
};

const mondayOfDay = (day: string) => { const d = new Date(day + "T00:00:00Z"); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10); };
const bucketKeyOf = (day: string, g: Granularity) => (g === "day" ? day : g === "week" ? mondayOfDay(day) : g === "month" ? day.slice(0, 7) : day.slice(0, 4));

/** Group daily points by calendar period. Flow metrics (views, engagement,
 *  reach) are summed; the follower level takes the last observed value. A
 *  bucket with no data at all stays null (never zero). */
export function bucketize(points: SeriesPoint[], g: Granularity, mode: "sum" | "last", today = new Date().toISOString().slice(0, 10)): Bucket[] {
  const out: Bucket[] = [];
  for (const p of points) {
    const key = bucketKeyOf(p.day, g);
    let b = out[out.length - 1];
    if (!b || b.key !== key) { b = { key, start: p.day, end: p.day, value: null, postIds: [], days: 0, partial: false }; out.push(b); }
    b.end = p.day;
    if (p.value != null) { b.value = mode === "last" ? p.value : (b.value ?? 0) + p.value; b.days++; }
    b.postIds.push(...p.postIds);
  }
  const todayKey = bucketKeyOf(today, g);
  for (const b of out) b.partial = g !== "day" && b.key === todayKey;
  return out;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (day: string) => `${MON[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
/** Axis label for a bucket. */
export function bucketLabel(b: Bucket, g: Granularity): string {
  if (g === "day") return md(b.start);
  if (g === "week") return md(b.start);
  if (g === "month") return MON[+b.key.slice(5, 7) - 1];
  return b.key;
}
/** Tooltip title for a bucket, e.g. "Aug 17–23", "August 2026". */
export function bucketTitle(b: Bucket, g: Granularity): string {
  if (g === "day") return new Date(b.start + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (g === "week") { const e = new Date(new Date(b.start + "T00:00:00Z").getTime() + 6 * DAY_MS).toISOString().slice(0, 10); return `${md(b.start)}–${e.slice(0, 7) === b.start.slice(0, 7) ? +e.slice(8, 10) : md(e)}`; }
  if (g === "month") return new Date(b.key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return b.key;
}

/** Which groupings the data can honestly support for a range. Yearly needs
 *  two calendar years of data; monthly needs a range that spans whole months. */
export function granularityOptions(days: number, firstDataDay: string | null, today = new Date().toISOString().slice(0, 10)): { id: Granularity; label: string; enabled: boolean; why: string }[] {
  const years = firstDataDay ? +today.slice(0, 4) - +firstDataDay.slice(0, 4) + 1 : 0;
  return [
    { id: "day", label: "Daily", enabled: true, why: "" },
    { id: "week", label: "Weekly", enabled: true, why: "" },
    { id: "month", label: "Monthly", enabled: days >= 90, why: days >= 90 ? "" : "Choose a range of 90 days or more to group by month." },
    { id: "year", label: "Yearly", enabled: days >= 365 && years >= 2, why: days >= 365 && years >= 2 ? "" : "Available after SOCIA has collected more history." },
  ];
}

// -------------------------------------------------------------- baseline ---

export type Baseline = { label: string; value: number; kind: "median_day" | "median_post" } | null;

/** The reference every bucket is compared against. Post-total series compare
 *  a day with the account's median post; a platform daily series compares it
 *  with the median day. Medians, so one breakout post cannot move the bar. */
export function seriesBaseline(series: Series, postValues: number[] = []): Baseline {
  if (series.provenance === "unavailable" || series.metric === "followers") return null;
  if (series.provenance === "publish_totals") {
    const m = median(postValues);
    return m != null && m > 0 ? { label: "Median post", value: m, kind: "median_post" } : null;
  }
  const m = median(series.current.map((p) => p.value).filter((v): v is number => v != null && v > 0));
  return m != null ? { label: "Typical day", value: m, kind: "median_day" } : null;
}

/** Indexes of values far above the rest: beyond median + 6·MAD and at least
 *  3× the median. Robust to the very spikes it looks for. */
export function detectOutliers(values: (number | null)[]): Set<number> {
  const xs = values.filter((v): v is number => v != null && v > 0);
  const out = new Set<number>();
  if (xs.length < 4) return out;
  const med = median(xs)!;
  const mad = median(xs.map((v) => Math.abs(v - med)))!;
  const thr = Math.max(med + 6 * mad, 3 * med);
  values.forEach((v, i) => { if (v != null && v > thr) out.add(i); });
  return out;
}

// ----------------------------------------------------------------- KPIs ----

export type Kpi = {
  id: "views" | "engagement_rate" | "followers" | "reach" | "posts";
  label: string;
  value: string;
  raw: number | null;
  deltaPct: number | null;
  deltaText: string | null;
  positive: boolean | null;
  note: string;
  status: "ok" | "unavailable" | "collecting";
  source: string;
};

export function buildKpis(input: {
  media: IgMediaItem[];
  daily: DailySnapshot[];
  followers: number | null;
  days: number;
  now?: Date;
}): Kpi[] {
  const { media, daily, followers, days } = input;
  const now = input.now ?? new Date();
  const views = buildSeries("views", media, daily, days, now);
  const reach = buildSeries("reach", media, daily, days, now);
  const foll = buildSeries("followers", media, daily, days, now);
  const since = now.getTime() - days * DAY_MS;
  const prevSince = since - days * DAY_MS;
  const inRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const prevRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= prevSince && new Date(m.timestamp).getTime() < since);
  const oldest = media.length ? Math.min(...media.filter((m) => m.timestamp).map((m) => new Date(m.timestamp!).getTime())) : null;
  const coversPrev = oldest != null && oldest <= prevSince;
  const period = `vs. previous ${days} days`;

  const delta = (cur: number | null, prev: number | null): { pct: number | null; text: string | null } => {
    if (cur == null || prev == null) return { pct: null, text: null };
    if (prev === 0) return { pct: null, text: cur > 0 ? "new" : null };
    const pct = pctChange(cur, prev);
    return { pct, text: pct == null ? null : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(pct >= 100 ? 0 : 1)}%` };
  };

  // Engagement rate: interactions ÷ reach when every post has reach, else ÷ followers (labelled).
  const erCur = engagementRateOf(inRange, followers);
  const erPrev = coversPrev || prevRange.length ? engagementRateOf(prevRange, followers) : null;
  const rateCur = erCur.value;
  const ratePrev = erPrev && erPrev.method === erCur.method ? erPrev.value : null;
  const fdays = daily.filter((d) => d.followers != null).length;

  const v = delta(views.total, views.prevTotal);
  const r = delta(reach.total, reach.prevTotal);
  const f = delta(foll.total, foll.prevTotal);
  const e = delta(rateCur, ratePrev);
  const p = coversPrev || prevRange.length ? inRange.length - prevRange.length : null;

  return [
    {
      id: "views", label: "Total Views", value: views.total != null ? fmtNum(views.total) : "—", raw: views.total,
      deltaPct: v.pct, deltaText: v.text, positive: v.pct == null ? null : v.pct >= 0,
      note: views.total == null ? "Not returned by Instagram yet" : v.text ? period : `last ${days} days`,
      status: views.total == null ? "unavailable" : "ok", source: views.note,
    },
    {
      id: "engagement_rate", label: "Engagement Rate", value: rateCur != null ? `${rateCur.toFixed(rateCur < 1 ? 2 : 1)}%` : "—", raw: rateCur,
      deltaPct: e.pct, deltaText: e.pct != null ? `${e.pct >= 0 ? "↑" : "↓"} ${Math.abs(rateCur! - ratePrev!).toFixed(2)} pts` : null, positive: e.pct == null ? null : e.pct >= 0,
      note: rateCur == null ? (inRange.length ? "Needs reach or a follower count" : `No posts in the last ${days} days`) : e.pct != null ? `${period} · ${erCur.suffix}` : `${inRange.length} post${inRange.length === 1 ? "" : "s"} · ${erCur.suffix}`,
      status: rateCur == null ? "unavailable" : "ok", source: `How SOCIA calculates engagement: ${erCur.formula}.`,
    },
    {
      id: "followers", label: "Followers", value: followers != null ? followers.toLocaleString("en-US") : "—", raw: followers,
      deltaPct: f.pct, deltaText: f.text ?? (foll.total != null && foll.prevTotal == null ? null : null), positive: f.pct == null ? null : f.pct >= 0,
      note: followers == null ? "Connect Instagram" : f.text ? period : fdays <= 1 ? "Tracking started today" : `${fdays} days of history collected`,
      status: followers == null ? "unavailable" : f.text ? "ok" : "collecting", source: foll.note,
    },
    {
      id: "reach", label: "Reach", value: reach.total != null ? fmtNum(reach.total) : "—", raw: reach.total,
      deltaPct: r.pct, deltaText: r.text, positive: r.pct == null ? null : r.pct >= 0,
      note: reach.total == null ? "Daily reach not returned yet" : r.text ? period : `last ${days} days`,
      status: reach.total == null ? "collecting" : "ok", source: reach.note,
    },
    {
      id: "posts", label: "Total Posts", value: String(inRange.length), raw: inRange.length,
      deltaPct: null, deltaText: p != null ? `${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}` : null, positive: p == null ? null : p >= 0,
      note: p != null ? period : `published in the last ${days} days`, status: "ok", source: "Posts published in the period, from Instagram's media list.",
    },
  ];
}

// ------------------------------------------------------------ breakdowns ---

export type Slice = { label: string; value: number; share: number; count: number; tone: "primary" | "info" | "success" | "warning" | "danger" | "muted"; note?: string };

/** Views (or engagement) by format for the period. Only formats that exist. */
export function formatBreakdown(media: IgMediaItem[], days: number, now = new Date()): { slices: Slice[]; metric: "views" | "engagement"; total: number } {
  const since = now.getTime() - days * DAY_MS;
  const ms = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const haveViews = ms.length > 0 && ms.every((m) => m.insights?.views != null);
  const metric = haveViews ? "views" : "engagement";
  const val = (m: IgMediaItem) => (metric === "views" ? (m.insights?.views ?? 0) : interactionsTotal(m));
  const groups: Record<string, { value: number; count: number }> = {};
  for (const m of ms) {
    const f = formatOf(m) + (formatOf(m) === "Photo" ? "s" : "s");
    groups[f] = { value: (groups[f]?.value ?? 0) + val(m), count: (groups[f]?.count ?? 0) + 1 };
  }
  const total = Object.values(groups).reduce((s, g) => s + g.value, 0);
  const tones: Slice["tone"][] = ["primary", "info", "success", "warning", "muted"];
  const slices = Object.entries(groups)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, g], i) => ({ label, value: g.value, share: total ? g.value / total : 0, count: g.count, tone: tones[i % tones.length] }));
  return { slices, metric, total };
}

export type PlatformRow = { id: "instagram" | "tiktok" | "facebook" | "youtube"; label: string; connected: boolean; value: number | null; deltaPct: number | null; share: number };

// ------------------------------------------------------------- insights ----

export type Insight = {
  id: string;
  kind: "outlier" | "format" | "location" | "window" | "cadence" | "trend";
  tone: "up" | "down" | "info" | "warn";
  /** Short uppercase label, e.g. "BREAKOUT POST". */
  tag: string;
  title: string;
  body: string;
  /** What the row's button says; the evidence drawer opens either way. */
  action: { label: string; tab?: "content" | "audience" | "times" | "growth" };
  observed: string[];
  interpretation: string;
  recommendation: string;
  postIds: string[];
  /** For "Add to Content Plan": the note dropped into the brief. */
  planNote: string;
};

const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildInsights(input: {
  media: IgMediaItem[];
  baseline: number | null;
  location: string | null;
  handle: string | null;
}): Insight[] {
  const { media, baseline, location } = input;
  const out: Insight[] = [];
  const dated = media.filter((m) => m.timestamp);
  const eng = (m: IgMediaItem) => interactionsTotal(m);
  const label = (m: IgMediaItem) => `"${displayTitle(m.caption ?? "").slice(0, 40)}"`;

  // 1. Outlier: one post far above the account's own median
  if (baseline && baseline > 0 && dated.length >= 5) {
    const top = [...dated].sort((a, b) => eng(b) - eng(a))[0];
    const mult = eng(top) / baseline;
    if (mult >= 3) {
      out.push({
        id: "outlier", kind: "outlier", tone: "up", tag: "Breakout post", action: { label: "See why" },
        title: `One ${formatOf(top).toLowerCase()} earned ${fmtMult(mult)} your median interactions`,
        body: `${label(top)}: ${eng(top).toLocaleString("en-US")} interactions against a median of ${Math.round(baseline).toLocaleString("en-US")}.`,
        observed: [
          `${label(top)}: ${eng(top).toLocaleString("en-US")} interactions${top.insights?.views != null ? `, ${fmtNum(top.insights.views)} views` : ""}`,
          `Your median post: ${Math.round(baseline).toLocaleString("en-US")} interactions (last ${dated.length} posts)`,
        ],
        interpretation: "A post this far above the median was distributed well beyond your followers. The hook and subject are the likeliest reasons; one post can't prove which, so treat it as a pattern to test, not a conclusion.",
        recommendation: `Make a second post with the same format and opening structure as ${label(top)}, and compare it against the ${Math.round(baseline)} median.`,
        postIds: [top.id ?? ""],
        planNote: `Repeat the format and hook of ${label(top)} (${fmtMult(mult)} my median).`,
      });
    }
  }

  // 2. Format: a format whose median beats the account median by 15%+
  if (baseline && baseline > 0) {
    const byFmt = new Map<string, IgMediaItem[]>();
    for (const m of dated) byFmt.set(formatOf(m), [...(byFmt.get(formatOf(m)) ?? []), m]);
    let best: { fmt: string; med: number; n: number } | null = null;
    let worst: { fmt: string; med: number; n: number } | null = null;
    for (const [fmt, ms] of byFmt) {
      if (ms.length < 3) continue;
      const med = median(ms.map(eng))!;
      if (!best || med > best.med) best = { fmt, med, n: ms.length };
      if (!worst || med < worst.med) worst = { fmt, med, n: ms.length };
    }
    if (best && best.med / baseline >= 1.15 && byFmt.size > 1) {
      const vs = worst && worst.fmt !== best.fmt ? ` ${best.fmt}s: ${Math.round(best.med)} median vs ${worst.fmt}s: ${Math.round(worst.med)}.` : "";
      out.push({
        id: "format", kind: "format", tone: "up", tag: "Format", action: { label: "See posts", tab: "content" },
        title: `${best.fmt}s are your strongest format`,
        body: `Median ${Math.round(best.med).toLocaleString("en-US")} interactions across ${plural(best.n, best.fmt.toLowerCase())}, ${fmtMult(best.med / baseline)} your overall median.`,
        observed: [`${best.fmt}s: median ${Math.round(best.med)} interactions (${best.n} posts)`, `All posts: median ${Math.round(baseline)}`, ...(vs ? [vs.trim()] : [])],
        interpretation: "In this sample the format travels further; Instagram tends to show it to more non-followers than your other formats. Sample sizes are small, so keep measuring.",
        recommendation: `Plan the next week so at least two thirds of posts are ${best.fmt.toLowerCase()}s.`,
        postIds: (byFmt.get(best.fmt) ?? []).slice(0, 3).map((m) => m.id ?? ""),
        planNote: `${best.fmt}s earn ${fmtMult(best.med / baseline)} my median; weight the week toward them.`,
      });
    }
  }

  // 3. Location mentions
  if (location && dated.length >= 5) {
    const tokens = location.split(/[,/]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2 && !/^[a-z]{2}$/.test(t));
    if (tokens.length) {
      const mentions = dated.filter((m) => tokens.some((t) => (m.caption ?? "").toLowerCase().includes(t)));
      const rest = dated.filter((m) => !mentions.includes(m));
      const place = location.split(",")[0].trim();
      if (mentions.length === 0) {
        out.push({
          id: "location", kind: "location", tone: "warn", tag: "Local content", action: { label: "Investigate" },
          title: `None of your last ${dated.length} posts mention ${place}`,
          body: "For a local business, reach that isn't local doesn't turn into visits.",
          observed: [`0 of ${dated.length} captions mention ${tokens.map((t) => `"${t}"`).join(" or ")}`],
          interpretation: "Instagram uses caption text and location tags when it decides who nearby sees a post. Without them your reach is spread wherever the format travels, not where your customers are.",
          recommendation: `Add ${place} to captions and tag the location on every post this week; compare local follower growth after two weeks.`,
          postIds: [],
          planNote: `No recent post mentions ${place}; every post this week should name it.`,
        });
      } else if (mentions.length >= 2 && rest.length >= 2) {
        const mm = median(mentions.map(eng))!, mr = median(rest.map(eng))!;
        if (mr > 0 && (mm / mr >= 1.3 || mm / mr <= 0.7)) {
          const up = mm >= mr;
          out.push({
            id: "location", kind: "location", tone: up ? "up" : "info", tag: "Local content", action: { label: "Investigate" },
            title: up ? `Posts mentioning ${place} had ${fmtMult(mm / mr)} the median interactions` : `Posts mentioning ${place} are underperforming your other posts`,
            body: `Median ${Math.round(mm)} interactions on ${plural(mentions.length, "post")} mentioning ${place}, vs ${Math.round(mr)} on the other ${rest.length}, in this sample.`,
            observed: [`${mentions.length} posts mention ${place}: median ${Math.round(mm)} interactions`, `${rest.length} posts don't: median ${Math.round(mr)}`],
            interpretation: up ? "The local posts landed better in this sample. That is consistent with Instagram showing them to nearby people, but the sample can't separate the place from the hooks and subjects of those posts." : "The local posts landed softer in this sample. That doesn't show the mention itself hurt; those posts may simply have had weaker hooks or subjects.",
            recommendation: up ? `Keep ${place} in the caption and add the location tag on every post, then re-check in two weeks.` : `Keep naming ${place}, but open those posts with the same hook style as your best performers and compare.`,
            postIds: mentions.slice(0, 3).map((m) => m.id ?? ""),
            planNote: up ? `Local mentions earn ${fmtMult(mm / mr)}; name ${place} in every caption.` : `Local posts underperform; pair ${place} mentions with stronger hooks.`,
          });
        }
      }
    }
  }

  // 4. Best window lives in audienceInsight(): it must run in the viewer's
  //    time zone, so the client adds it.

  // 5. Cadence
  const cur = postsPerWeek(dated.map((m) => m.timestamp), 30);
  const prev = postsPerWeek(dated.map((m) => m.timestamp), 60);
  if (cur != null && prev != null) {
    const prev30 = Math.max(0, prev * 2 - cur); // posts/week in the 30 days before the last 30
    if (prev30 > 0 && cur / prev30 <= 0.7) {
      out.push({
        id: "cadence", kind: "cadence", tone: "down", tag: "Cadence", action: { label: "See posts", tab: "content" },
        title: `Posting dropped to ${cur.toFixed(1)}/week`,
        body: `From ${prev30.toFixed(1)}/week in the 30 days before.`,
        observed: [`Last 30 days: ${cur.toFixed(1)} posts/week`, `Previous 30 days: ${prev30.toFixed(1)} posts/week`],
        interpretation: "Fewer posts means fewer chances for the algorithm to test your content with new people; reach tends to follow cadence with a lag.",
        recommendation: `Get back to ${Math.max(3, Math.round(prev30))} posts a week; the Calendar can place them at your best hour.`,
        postIds: [],
        planNote: `Cadence fell to ${cur.toFixed(1)}/week; plan ${Math.max(3, Math.round(prev30))} posts.`,
      });
    }
  }

  // 6. Trend: last 5 vs previous 5
  if (dated.length >= 10) {
    const sorted = [...dated].sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
    const a = median(sorted.slice(0, 5).map(eng))!, b = median(sorted.slice(5, 10).map(eng))!;
    if (b > 0 && Math.abs(a / b - 1) >= 0.25) {
      const up = a > b;
      out.push({
        id: "trend", kind: "trend", tone: up ? "up" : "down", tag: up ? "Recent lift" : "Recent decline", action: { label: "See posts", tab: "content" },
        title: up ? `Your last 5 posts earned ${fmtMult(a / b)} the median interactions of the 5 before` : `Your last 5 posts earned ${Math.round((1 - a / b) * 100)}% fewer median interactions than the 5 before`,
        body: `Median ${Math.round(a)} vs ${Math.round(b)} interactions per post.`,
        observed: [`Last 5 posts: median ${Math.round(a)}`, `Previous 5: median ${Math.round(b)}`],
        interpretation: up ? "Whatever changed in the last five is working; hold it constant while you test one variable at a time." : "The recent five share something the earlier ones didn't; compare hooks and formats between the two groups before changing more.",
        recommendation: up ? "Keep the current format mix for another week and measure again." : "Re-run the best-performing format from the earlier group this week.",
        postIds: sorted.slice(0, 5).map((m) => m.id ?? ""),
        planNote: up ? "Recent posts trending up; keep the mix." : "Recent posts trending down; revisit the earlier winning format.",
      });
    }
  }

  const order: Insight["kind"][] = ["outlier", "format", "location", "trend", "window", "cadence"];
  return out.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
}

/** The timing insight, computed where the viewer's clock is (client side), with
 *  the same rule the Calendar and Best Times use. null below five posts. */
export function audienceInsight(posts: (CalPost & { id?: string; format?: string })[]): Insight | null {
  const timed: TimedPost[] = posts.map((p, i) => ({ id: p.id ?? String(i), t: p.t, e: p.e, format: p.format ?? "Post" }));
  const w = buildWindows(timed);
  if (!w.enough || !w.best.length) return null;
  const top = w.best[0];
  const early = top.confidence === "early";
  return {
    id: "window", kind: "window", tone: "info", tag: early ? "Early signal" : "Best time signal", action: { label: "View posting times", tab: "times" },
    title: `Your strongest recent engagement landed ${top.label}`,
    body: `Median ${relText(top.rel)} across ${plural(top.n, "post")} in that window, in your time zone.${early ? " Fewer than 4 posts, so an early signal." : ""}`,
    observed: [`${top.label}: ${relText(top.rel)} (${plural(top.n, "post")})`, ...w.best.slice(1).map((b) => `${b.label}: ${relText(b.rel)} (${plural(b.n, "post")})`), `Sample: ${w.posts} dated posts, medians against your typical post`],
    interpretation: "Posts in that window earned more in this sample. That is when they landed, not proof that the hour caused it; the posts themselves may simply have been stronger.",
    recommendation: `Schedule this week's most important post for ${top.label} and compare it with your median.`,
    postIds: top.postIds,
    planNote: `Best window so far: ${top.label} (${relText(top.rel)}, ${top.n} posts).`,
  };
}

// --------------------------------------------------------- plan & goals ----

export type FocusTile = { icon: "video" | "map" | "users" | "target"; label: string; title: string; detail: string };
export type Focus = { planId: string; headline: string; tiles: FocusTile[]; createdAt: string };

export function buildFocus(plan: { id: string; data: Deliverable; created_at: string } | null): Focus | null {
  if (!plan?.data?.topFixes?.length) return null;
  const iconFor = (s: string): FocusTile["icon"] =>
    /reel|video|short/i.test(s) ? "video" : /local|location|geotag|nearby|hermitage|nashville|neighbou?rhood|city/i.test(s) ? "map" : /people|staff|face|customer|team|owner|human/i.test(s) ? "users" : "target";
  const labelFor = (s: string): string =>
    /reel|video/i.test(s) ? "REELS" : /local|location|geotag/i.test(s) ? "LOCAL" : /people|staff|face|customer|team/i.test(s) ? "PEOPLE" : /hook|caption|first line/i.test(s) ? "HOOKS" : /cta|order|book|link/i.test(s) ? "ORDERS" : "FOCUS";
  return {
    planId: plan.id,
    headline: plan.data.headline,
    createdAt: plan.created_at,
    tiles: plan.data.topFixes.slice(0, 3).map((f) => ({ icon: iconFor(f.fix + " " + f.why), label: labelFor(f.fix + " " + f.why), title: f.fix, detail: f.why })),
  };
}

export type GoalTracker = { label: string; current: number | null; target: number | null; display: string; note: string };

export function buildGoals(input: {
  goalsText: string | null;
  plan: { id: string; data: Deliverable } | null;
  scheduled: ScheduledPost[];
  media: IgMediaItem[];
  frequency: string | null;
  followerDelta30: number | null;
}): { goals: string[]; trackers: GoalTracker[] } {
  const goals = (input.goalsText ?? "")
    .split(/[,;]|\band\b/i)
    .map((g) => g.trim())
    .filter((g) => g.length > 3)
    .slice(0, 4);
  const trackers: GoalTracker[] = [];
  if (input.plan) {
    const total = input.plan.data.weeklyPlan?.length ?? 0;
    const done = input.scheduled.filter((p) => p.plan_id === input.plan!.id && p.status !== "cancelled").length;
    if (total) trackers.push({ label: "Plan on the calendar", current: done, target: total, display: `${done} / ${total} posts`, note: "Drafts and scheduled posts created from your latest Content Plan." });
  }
  const weekAgo = Date.now() - 7 * DAY_MS;
  const thisWeek = input.media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= weekAgo).length;
  const target = input.frequency ? parseInt(input.frequency.match(/\d+/)?.[0] ?? "", 10) : NaN;
  trackers.push({
    label: "Posts this week",
    current: thisWeek,
    target: Number.isFinite(target) ? target : null,
    display: Number.isFinite(target) ? `${thisWeek} / ${target} posts` : `${thisWeek} post${thisWeek === 1 ? "" : "s"}`,
    note: Number.isFinite(target) ? "Against the cadence set in your strategist settings." : "Set a posting cadence in Settings → AI Strategist to track it here.",
  });
  if (input.followerDelta30 != null) {
    trackers.push({ label: "Followers, last 30 days", current: input.followerDelta30, target: null, display: `${input.followerDelta30 >= 0 ? "+" : ""}${input.followerDelta30.toLocaleString("en-US")}`, note: "From SOCIA's daily follower snapshots." });
  }
  return { goals, trackers };
}

// --------------------------------------------------------------- events ----

export type Activity = { id: string; kind: "scheduled" | "published" | "failed" | "draft" | "plan" | "sync"; title: string; detail: string; at: string };

export function buildActivity(input: { scheduled: ScheduledPost[]; plans: { id: string; created_at: string; client_handle: string | null }[]; syncedAt: string | null; handle: string | null }): Activity[] {
  const out: Activity[] = [];
  for (const p of input.scheduled) {
    const t = displayTitle(p.caption).slice(0, 44) || "Untitled post";
    if (p.status === "published") out.push({ id: `pub-${p.id}`, kind: "published", title: "Post published", detail: t, at: p.updated_at });
    else if (p.status === "scheduled") out.push({ id: `sch-${p.id}`, kind: "scheduled", title: "Post scheduled", detail: `${t} · ${new Date(p.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, at: p.updated_at });
    else if (p.status === "failed") out.push({ id: `fail-${p.id}`, kind: "failed", title: "Post needs attention", detail: p.error?.slice(0, 60) ?? t, at: p.updated_at });
    else if (p.status === "draft") out.push({ id: `draft-${p.id}`, kind: "draft", title: "Draft added", detail: t, at: p.created_at });
  }
  for (const pl of input.plans) out.push({ id: `plan-${pl.id}`, kind: "plan", title: "Content plan generated", detail: pl.client_handle ? `for ${pl.client_handle}` : "weekly plan", at: pl.created_at });
  if (input.syncedAt) out.push({ id: "sync", kind: "sync", title: "Instagram synced", detail: input.handle ? `@${input.handle}` : "account", at: input.syncedAt });
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
}

export type Upcoming = { id: string; at: string; title: string; status: ScheduledPost["status"]; format: string; thumb: string | null; platform: "instagram" };

export function buildUpcoming(scheduled: ScheduledPost[], limit = 4): Upcoming[] {
  const now = Date.now();
  return scheduled
    .filter((p) => p.status !== "cancelled" && p.status !== "published" && new Date(p.scheduled_at).getTime() >= now - DAY_MS)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, limit)
    .map((p) => ({
      id: p.id, at: p.scheduled_at, title: displayTitle(p.caption) || "Untitled post", status: p.status,
      format: p.media_type === "IMAGE" ? "Instagram Photo" : "Instagram Reel",
      thumb: p.media_type === "IMAGE" ? p.media_url : null, platform: "instagram",
    }));
}

export const relTime = (iso: string, now = Date.now()): string => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};
