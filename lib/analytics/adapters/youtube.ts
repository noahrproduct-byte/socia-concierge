// YouTube adapter — maps the signed-in user's own channel data (lib/youtubeData,
// which reads the YouTube Data + Analytics APIs live) into the normalized
// bundle. YouTube is the one platform with a genuine per-day series (views,
// watch time, subscribers gained), so those become trueSeries; the subscriber
// LEVEL has no stored history yet, so it's a KPI only until the snapshot job
// records it. Shares and saves are never emitted — the API doesn't expose them.

import type { YouTubeAnalytics, YtDaily } from "../../youtubeData";
import type { YtVideo } from "../../youtube";
import { platformCapability } from "../capabilities";
import { computeBaselines, multiplierFor } from "../baseline";
import { snapshotSeries } from "../derive";
import { youtubeFormat } from "../format";
import type {
  Metric,
  NormalizedAccountAnalytics,
  NormalizedPost,
  NormalizedSeries,
  SeriesPoint,
} from "../types";

export type YouTubeAdapterInput = { data: YouTubeAnalytics; days: number; history?: { day: string; followers: number | null }[]; now?: Date };

function knownSum(parts: (number | null | undefined)[]): number | null {
  const known = parts.filter((x): x is number => x != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

const verified = (value: number | null, source: string, method: string, period: string, sampleSize: number | null = null): Metric => ({
  value,
  status: value == null ? "UNAVAILABLE" : "VERIFIED",
  source,
  method,
  period,
  sampleSize,
});

// Build a normalized daily series from YouTube's Analytics day rows. YouTube
// doesn't return a comparable previous period, so `previous`/`prevTotal` stay
// empty rather than being invented.
function daySeries(
  rows: YtDaily[],
  pick: (d: YtDaily) => number,
  metric: NormalizedSeries["metric"],
  label: string,
  unit: NormalizedSeries["unit"],
  total: number | null,
  note: string,
): NormalizedSeries {
  const current: SeriesPoint[] = rows.map((d) => ({ day: d.day, value: pick(d), postIds: [] }));
  const has = current.some((p) => p.value != null);
  return {
    metric,
    label,
    unit,
    provenance: has ? "platform_daily" : "unavailable",
    trueSeries: has,
    render: "bar",
    note,
    current,
    previous: [],
    total: has ? total : null,
    prevTotal: null,
  };
}

export function adaptYouTube(input: YouTubeAdapterInput): NormalizedAccountAnalytics {
  const { data } = input;
  const cap = platformCapability("youtube");
  const ch = data.channel;
  const hasSeries = data.series.length > 0 && data.range != null;
  const emptyNote = data.note ?? "YouTube Analytics returned no data for this period.";

  // ---- posts (recent videos, with format-segmented vs-typical) ----
  const scored = data.topVideos.map((v: YtVideo) => ({
    v,
    format: youtubeFormat({ durationSec: v.durationSec }),
    engagement: knownSum([v.likes, v.comments]),
  }));
  const baselines = computeBaselines(scored.map((p) => ({ format: p.format, engagement: p.engagement })));
  const posts: NormalizedPost[] = scored.map((p) => ({
    id: p.v.videoId,
    platform: "youtube",
    format: p.format,
    title: p.v.title,
    caption: p.v.title,
    publishedAt: p.v.publishedAt,
    thumb: p.v.thumb,
    permalink: `https://www.youtube.com/watch?v=${p.v.videoId}`,
    metrics: { views: p.v.views, likes: p.v.likes, comments: p.v.comments },
    engagement: p.engagement,
    multiplier: multiplierFor(p.engagement, p.format, baselines),
  }));

  // ---- series (real daily where the Analytics API served it) ----
  const series: NormalizedAccountAnalytics["series"] = hasSeries
    ? {
        views: daySeries(data.series, (d) => d.views, "views", "Views", "count", data.range!.views, "Daily views, YouTube Analytics."),
        watch_time: daySeries(data.series, (d) => d.minutes, "watch_time", "Watch time", "minutes", data.range!.minutes, "Estimated minutes watched per day, YouTube Analytics."),
        net_followers: daySeries(data.series, (d) => d.subs, "net_followers", "Net subscribers", "count", data.range!.subs, "Subscribers gained per day, YouTube Analytics."),
      }
    : {
        views: { metric: "views", label: "Views", unit: "count", provenance: "unavailable", trueSeries: false, render: "bar", note: emptyNote, current: [], previous: [], total: null, prevTotal: null },
      };

  // Subscriber history from SOCIA's own daily snapshots (YouTube gives no level
  // series), once enough days have been recorded.
  if (input.history?.length) {
    const fs = snapshotSeries(input.history.map((h) => ({ day: h.day, value: h.followers })), input.days, input.now ?? new Date(), "followers", "Subscribers", "Subscribers, recorded daily by SOCIA from connect onward.");
    if (fs.trueSeries) series.followers = fs;
  }

  // ---- KPIs ----
  const kpis: NormalizedAccountAnalytics["kpis"] = {
    followers: {
      value: ch.subscribers,
      status: ch.subscribers == null ? "UNAVAILABLE" : "VERIFIED",
      source: "YouTube Data API: channel statistics.subscriberCount",
      method: "Current subscriber total reported by YouTube",
      period: "now",
      sampleSize: null,
    },
    views: verified(data.range?.views ?? null, "YouTube Analytics API: views", "Sum of daily views in the period", `last ${input.days} days`),
    watch_time: verified(data.range?.minutes ?? null, "YouTube Analytics API: estimatedMinutesWatched", "Sum of daily minutes watched in the period", `last ${input.days} days`),
    net_followers: verified(data.range?.subs ?? null, "YouTube Analytics API: subscribersGained", "Sum of daily subscribers gained in the period", `last ${input.days} days`),
    posts: verified(ch.videoCount, "YouTube Data API: channel statistics.videoCount", "Lifetime public video count", "all time"),
  };

  // ---- demographics (age only today; YouTube sums gender in lib/youtubeData) ----
  const demographics: NormalizedAccountAnalytics["demographics"] =
    data.demographics.length > 0
      ? {
          status: "ok",
          reason: "",
          basis: cap.demographicsBasis,
          dimensions: {
            age: data.demographics.map((b) => ({ label: b.label, value: b.value, share: b.value > 0 ? b.value / 100 : 0 })),
          },
        }
      : { status: "unavailable", reason: emptyNote, basis: cap.demographicsBasis, dimensions: {} };

  return {
    account: {
      platform: "youtube",
      accountId: ch.handle ?? "",
      handle: ch.handle,
      name: ch.title,
      avatar: ch.avatar,
      audienceLabel: cap.audienceLabel,
      connectedAt: null,
      syncedAt: null,
    },
    kpis,
    series,
    posts,
    demographics,
    baseline: baselines,
    collecting: false,
  };
}
