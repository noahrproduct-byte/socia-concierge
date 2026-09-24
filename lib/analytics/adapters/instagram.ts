// Instagram adapter — the reference. It bridges SOCIA's proven Instagram
// analytics (lib/overview + lib/engagement + lib/igDemographics) into the
// normalized cross-platform bundle, so Instagram quality is preserved exactly
// while its shape becomes universal. No new Instagram math lives here; this is
// translation, plus format-segmented vs-typical from the shared baseline engine.

import type { IgMediaItem, IgSnapshot } from "../../instagramSync";
import type { DailySnapshot } from "../../dashboardMetrics";
import type { Demographics } from "../../igDemographics";
import { interactionsTotal } from "../../engagement";
import { buildKpis, buildSeries, displayTitle, type Kpi, type MetricId, type Series } from "../../overview";
import { platformCapability } from "../capabilities";
import { computeBaselines, multiplierFor } from "../baseline";
import { instagramFormat } from "../format";
import type {
  MetricKey,
  NormalizedAccountAnalytics,
  NormalizedDemographics,
  NormalizedPost,
  NormalizedSeries,
  SeriesPoint,
  Status,
} from "../types";

export type InstagramAdapterInput = {
  snap: IgSnapshot;
  daily: (DailySnapshot & { followers_gained?: number | null })[];
  demographics: Demographics;
  days: number;
  now?: Date;
};

/** Sum only the interaction components the platform actually returned; null
 *  when none are known (unknown ≠ 0). */
function knownSum(parts: (number | null | undefined)[]): number | null {
  const known = parts.filter((x): x is number => x != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

// Instagram provenance → normalized provenance + the render/trueSeries it implies.
function mapSeries(s: Series, metric: MetricKey, render: "line" | "bar"): NormalizedSeries {
  const provenance =
    s.provenance === "instagram_daily" ? "platform_daily"
    : s.provenance === "publish_totals" ? "publish_totals"
    : s.provenance === "snapshot" ? "snapshot"
    : "unavailable";
  // A genuine per-day observation (platform daily OR SOCIA's daily snapshot) is
  // TREND-eligible; content totals stamped on a publish day are not.
  const trueSeries = provenance === "platform_daily" || provenance === "snapshot";
  return {
    metric,
    label: s.label,
    unit: "count",
    provenance,
    trueSeries,
    render,
    note: s.note,
    current: s.current as SeriesPoint[],
    previous: s.previous as SeriesPoint[],
    total: s.total,
    prevTotal: s.prevTotal,
  };
}

const KPI_STATUS: Record<Kpi["id"], Status> = {
  views: "VERIFIED",
  reach: "VERIFIED",
  followers: "VERIFIED",
  engagement_rate: "CALCULATED",
  posts: "CALCULATED",
};
const KPI_METRIC: Record<Kpi["id"], MetricKey> = {
  views: "views",
  reach: "reach",
  followers: "followers",
  engagement_rate: "engagement_rate",
  posts: "posts",
};

export function adaptInstagram(input: InstagramAdapterInput): NormalizedAccountAnalytics {
  const { snap, daily, demographics, days } = input;
  const now = input.now ?? new Date();
  const media: IgMediaItem[] = snap.media ?? [];
  const followers = snap.followers_count ?? null;
  const cap = platformCapability("instagram");

  // ---- posts (with format-segmented vs-typical) ----
  const scored = media
    .filter((m) => m.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .map((m) => {
      const likes = m.like_count ?? null;
      const comments = m.comments_count ?? null;
      const saves = m.insights?.saved ?? null;
      const shares = m.insights?.shares ?? null;
      const views = m.insights?.views ?? null;
      const reach = m.insights?.reach ?? null;
      // interactionsTotal is Instagram's own interaction sum; keep it for
      // engagement so the normalized number matches the live IG UI exactly.
      const hasAny = likes != null || comments != null || saves != null || shares != null;
      const engagement = hasAny ? interactionsTotal(m) : null;
      return { m, format: instagramFormat(m.media_type), likes, comments, saves, shares, views, reach, engagement };
    });
  const baselines = computeBaselines(scored.map((p) => ({ format: p.format, engagement: p.engagement })));
  const posts: NormalizedPost[] = scored.map((p, i) => ({
    id: p.m.id ?? String(i),
    platform: "instagram",
    format: p.format,
    title: displayTitle(p.m.caption ?? ""),
    caption: p.m.caption ?? "",
    publishedAt: p.m.timestamp!,
    thumb: p.m.thumbnail_url || p.m.media_url || null,
    permalink: p.m.permalink ?? null,
    metrics: { views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares },
    engagement: p.engagement,
    multiplier: multiplierFor(p.engagement, p.format, baselines),
  }));

  // ---- series ----
  const build = (m: MetricId) => buildSeries(m, media, daily, days, now);
  const viewsS = build("views");
  const reachS = build("reach");
  const follS = build("followers");
  const engS = build("engagement");

  const rows = new Map(daily.map((d) => [d.day, d]));
  const gainAt = (day: string): number | null => {
    const r = rows.get(day);
    return r && r.source === "instagram_api" ? (r.followers_gained ?? null) : null;
  };
  const netCur: SeriesPoint[] = viewsS.current.map((p) => ({ day: p.day, value: gainAt(p.day), postIds: [] }));
  const netPrev: SeriesPoint[] = viewsS.previous.map((p) => ({ day: p.day, value: gainAt(p.day), postIds: [] }));
  const sumOf = (pts: SeriesPoint[]) => {
    const vs = pts.map((p) => p.value).filter((v): v is number => v != null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  };
  const netHas = netCur.some((p) => p.value != null);

  const series: NormalizedAccountAnalytics["series"] = {
    views: mapSeries(viewsS, "views", "bar"),
    reach: mapSeries(reachS, "reach", "bar"),
    followers: mapSeries(follS, "followers", "line"),
    engagement: mapSeries(engS, "engagement", "bar"),
    net_followers: {
      metric: "net_followers",
      label: "New followers",
      unit: "count",
      provenance: netHas ? "platform_daily" : "unavailable",
      trueSeries: netHas,
      render: "bar",
      note: netHas ? "New followers per day, from Instagram's daily follower_count series." : "Instagram hasn't returned a daily follower series for this account yet.",
      current: netCur,
      previous: netPrev,
      total: sumOf(netCur),
      prevTotal: sumOf(netPrev),
    },
  };

  // ---- KPIs (mapped from the proven buildKpis into the Metric envelope) ----
  const kpiList = buildKpis({ media, daily, followers, days, now });
  const kpis: NormalizedAccountAnalytics["kpis"] = {};
  for (const k of kpiList) {
    kpis[KPI_METRIC[k.id]] = {
      value: k.raw,
      status: k.raw == null ? "UNAVAILABLE" : KPI_STATUS[k.id],
      source: k.source,
      method: k.source,
      period: k.note,
      sampleSize: k.id === "posts" ? k.raw : null,
    };
  }

  // ---- demographics ----
  const demographicsN: NormalizedDemographics =
    demographics.status === "ok"
      ? {
          status: "ok",
          reason: "",
          basis: cap.demographicsBasis,
          dimensions: { age: demographics.age, gender: demographics.gender, city: demographics.city },
        }
      : { status: "unavailable", reason: demographics.reason ?? "Not available for this account", basis: cap.demographicsBasis, dimensions: {} };

  const fdays = daily.filter((d) => d.followers != null).length;

  return {
    account: {
      platform: "instagram",
      accountId: snap.ig_user_id ?? "",
      handle: snap.username,
      name: snap.name,
      avatar: snap.profile_picture_url,
      audienceLabel: cap.audienceLabel,
      connectedAt: null,
      syncedAt: snap.last_synced_at,
    },
    kpis,
    series,
    posts,
    demographics: demographicsN,
    baseline: baselines,
    collecting: followers != null && fdays < 2,
  };
}
