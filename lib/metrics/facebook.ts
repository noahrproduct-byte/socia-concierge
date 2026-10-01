// Facebook analytics, assembled from what SOCIA can honestly measure today:
//   - the Page's follower count, plus the daily trend SOCIA records itself
//     (platform_snapshots), and — when read_insights is granted — Facebook's
//     own daily follow count;
//   - Page views per day from Facebook Page Insights (needs read_insights;
//     reported as unavailable, never 0, when it isn't granted);
//   - per-post engagement (reactions + comments + shares) placed on the day a
//     post was published — content totals, drawn as bars, never faked as a
//     daily activity series;
//   - what Facebook no longer exposes (reach/impressions, retired by Meta),
//     stated plainly.
//
// Pure: the page fetches, this shapes. null is never coerced to 0.

import { DAY_MS, fmtNum, type Series, type SeriesPoint } from "../overview";
import type { FbSnapshot, FbPost } from "../facebookSync";
import type { PlatformSnapshotRow } from "../platformSnapshots";
import type { FbInsights } from "../facebookInsights";

const dayList = (end: Date, days: number): string[] =>
  Array.from({ length: days }, (_, i) => new Date(end.getTime() - (days - i) * DAY_MS).toISOString().slice(0, 10));

const fmtDate = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Reactions + comments + shares on a post, or null when Facebook returned none
 *  of them (e.g. pages_read_user_content not granted) — never a guessed 0. */
export function fbPostEngagement(p: FbPost): number | null {
  const parts = [p.reactions, p.comments, p.shares].filter((v): v is number => v != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

export type FbStat = {
  key: string;
  label: string;
  value: string;
  note: string;
  status: "ok" | "unavailable" | "collecting";
};

export type FbTopPost = {
  id: string;
  title: string;
  permalink: string | null;
  thumb: string | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  published: string;
};

export type FacebookAnalyticsData = {
  page: { name: string | null; username: string | null; avatar: string | null };
  status: FbSnapshot["status"];
  rangeLabel: string;
  stats: FbStat[];
  /** Follower trend from SOCIA's own daily snapshots (a line). */
  followers: Series;
  /** Per-post engagement by publish date (bars). */
  engagement: Series;
  /** Page views per day from Facebook Insights; null until read_insights works. */
  views: Series | null;
  /** Video views across the Page's videos in range, from Insights. */
  videoViews: number | null;
  /** New follows in range, from Facebook's own page_daily_follows. */
  newFollows: number | null;
  /** true when the Insights edge returned data (read_insights granted). */
  insightsAvailable: boolean;
  topPosts: FbTopPost[];
  /** Metrics that are genuinely not available, each with an honest reason. */
  unavailable: { label: string; why: string }[];
  postsInRange: number;
};

export function buildFacebookAnalytics(input: {
  snap: FbSnapshot;
  snapshots: PlatformSnapshotRow[];
  days: number;
  rangeLabel: string;
  now?: Date;
  /** Page Insights, when the page fetched them (read_insights). */
  insights?: FbInsights | null;
}): FacebookAnalyticsData {
  const { snap, snapshots, days, rangeLabel } = input;
  const insights = input.insights ?? null;
  const now = input.now ?? new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const curDays = dayList(end, days);
  const prevDays = dayList(new Date(end.getTime() - days * DAY_MS), days);

  const sum = (pts: SeriesPoint[]): number | null => {
    const v = pts.map((p) => p.value).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const lastVal = (pts: SeriesPoint[]): number | null => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value != null) return pts[i].value;
    return null;
  };

  // ---- Follower trend (SOCIA's own daily snapshots) ----
  const byDay = new Map(snapshots.map((r) => [r.day, r.followers]));
  const followerPts: SeriesPoint[] = curDays.map((d) => ({ day: d, value: byDay.has(d) ? byDay.get(d)! ?? null : null, postIds: [] }));
  const prevFollowerPts: SeriesPoint[] = prevDays.map((d) => ({ day: d, value: byDay.has(d) ? byDay.get(d)! ?? null : null, postIds: [] }));
  const haveFollowerHistory = followerPts.some((p) => p.value != null);
  const firstDay = snapshots.find((r) => r.followers != null)?.day ?? null;
  const followers: Series = {
    metric: "followers",
    label: "Followers",
    provenance: haveFollowerHistory ? "snapshot" : "unavailable",
    note: firstDay
      ? `Your Facebook follower count, recorded by SOCIA once a day since ${fmtDate(firstDay)}. Facebook doesn't provide earlier daily history.`
      : "SOCIA records your Facebook follower count once a day — the trend builds from here. Facebook doesn't provide past daily history.",
    current: followerPts,
    previous: prevFollowerPts,
    total: lastVal(followerPts),
    prevTotal: lastVal(prevFollowerPts),
  };

  // ---- Per-post engagement by publish date (content totals, drawn as bars) ----
  const posts = (snap.posts ?? []).filter((p) => p.created_time);
  const byPubDay = new Map<string, number>();
  for (const p of posts) {
    const e = fbPostEngagement(p);
    if (e == null || !p.created_time) continue;
    const d = new Date(p.created_time).toISOString().slice(0, 10);
    byPubDay.set(d, (byPubDay.get(d) ?? 0) + e);
  }
  const engPts: SeriesPoint[] = curDays.map((d) => ({ day: d, value: byPubDay.has(d) ? byPubDay.get(d)! : null, postIds: [] }));
  const engPrevPts: SeriesPoint[] = prevDays.map((d) => ({ day: d, value: byPubDay.has(d) ? byPubDay.get(d)! : null, postIds: [] }));
  const anyEng = posts.some((p) => fbPostEngagement(p) != null);
  const engagement: Series = {
    metric: "engagement",
    label: "Engagement",
    provenance: anyEng ? "publish_totals" : "unavailable",
    note: anyEng
      ? "Reactions + comments + shares on each Facebook post, placed on the day it was published."
      : "Reactions and comments need the pages_read_user_content permission — reconnect Facebook to fill these in.",
    current: engPts,
    previous: engPrevPts,
    total: sum(engPts),
    prevTotal: sum(engPrevPts),
  };

  // ---- Page views per day (Facebook Insights; needs read_insights) ----
  let views: Series | null = null;
  if (insights?.views) {
    const vm = new Map(insights.views.series.map((p) => [p.day, p.value]));
    const cur: SeriesPoint[] = curDays.map((d) => ({ day: d, value: vm.has(d) ? vm.get(d)! : null, postIds: [] }));
    const has = cur.some((p) => p.value != null);
    views = {
      metric: "views",
      label: "Views",
      provenance: has ? "platform_daily" : "unavailable",
      note: has ? "Page views per day, from Facebook Page Insights." : "Facebook Insights returned no Page views for this period.",
      current: cur,
      previous: [],
      total: has ? sum(cur) : null,
      prevTotal: null,
    };
  }
  const videoViews = insights?.videoViews?.total ?? null;
  const newFollows = insights?.dailyFollows?.total ?? null;

  // ---- Stat tiles (always four) ----
  const since = now.getTime() - days * DAY_MS;
  const inRange = posts.filter((p) => new Date(p.created_time!).getTime() >= since);
  const engCounted = inRange.some((p) => fbPostEngagement(p) != null);
  const engTotalRange = inRange.reduce((a, p) => a + (fbPostEngagement(p) ?? 0), 0);

  const followersStat: FbStat = {
    key: "followers",
    label: "Followers",
    value: snap.followers_count != null ? snap.followers_count.toLocaleString("en-US") : "—",
    // Prefer Facebook's own follow count for the period when Insights serve it.
    note: newFollows != null
      ? `${newFollows >= 0 ? "+" : ""}${newFollows.toLocaleString("en-US")} new follows · ${rangeLabel.toLowerCase()} (Facebook)`
      : haveFollowerHistory ? "recorded daily by SOCIA" : snap.followers_count != null ? "trend starts building today" : "not provided by Facebook",
    status: snap.followers_count != null ? (haveFollowerHistory || newFollows != null ? "ok" : "collecting") : "unavailable",
  };
  const engagementStat: FbStat = {
    key: "engagement",
    label: "Engagement",
    value: engCounted ? fmtNum(engTotalRange) : "—",
    note: engCounted ? `reactions + comments + shares · ${rangeLabel.toLowerCase()}` : "needs pages_read_user_content",
    status: engCounted ? "ok" : "unavailable",
  };
  const postsStat: FbStat = {
    key: "posts",
    label: "Posts",
    value: String(inRange.length),
    note: `published · ${rangeLabel.toLowerCase()}`,
    status: "ok",
  };
  const avgStat: FbStat = {
    key: "avg",
    label: "Avg engagement / post",
    value: engCounted && inRange.length ? fmtNum(Math.round(engTotalRange / inRange.length)) : "—",
    note: engCounted ? "per post in range" : "needs engagement data",
    status: engCounted && inRange.length ? "ok" : "unavailable",
  };
  const viewsStat: FbStat | null = views && views.total != null
    ? {
        key: "views",
        label: "Page views",
        value: fmtNum(views.total),
        note: videoViews != null ? `incl. ${fmtNum(videoViews)} video views · ${rangeLabel.toLowerCase()}` : `Facebook Page Insights · ${rangeLabel.toLowerCase()}`,
        status: "ok",
      }
    : null;
  const stats: FbStat[] = viewsStat ? [followersStat, viewsStat, engagementStat, postsStat] : [followersStat, engagementStat, postsStat, avgStat];

  // ---- Top posts by engagement ----
  const topPosts: FbTopPost[] = [...posts]
    .map((p) => ({ p, e: fbPostEngagement(p) }))
    .sort((a, b) => (b.e ?? -1) - (a.e ?? -1))
    .slice(0, 6)
    .map(({ p, e }) => ({
      id: p.id ?? "",
      title: (p.message ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 80) || "(no caption)",
      permalink: p.permalink_url ?? null,
      thumb: p.full_picture ?? null,
      reactions: p.reactions ?? null,
      comments: p.comments ?? null,
      shares: p.shares ?? null,
      engagement: e,
      published: p.created_time ?? "",
    }));

  // ---- Honest "not available" list ----
  const unavailable: { label: string; why: string }[] = [
    { label: "Reach & impressions", why: "Meta retired these Page metrics across all API versions (2025–2026), so Facebook no longer provides them." },
  ];
  if (!views || views.provenance === "unavailable") {
    unavailable.push({
      label: "Page & video views",
      why: insights?.available
        ? "Facebook Insights returned no view data for this Page in this period."
        : "Needs the read_insights permission — reconnect Facebook to grant it (public access arrives with App Review).",
    });
  }

  return {
    page: { name: snap.page_name, username: snap.username, avatar: snap.picture_url },
    status: snap.status,
    rangeLabel,
    stats,
    followers,
    engagement,
    views,
    videoViews,
    newFollows,
    insightsAvailable: Boolean(insights?.available),
    topPosts,
    unavailable,
    postsInRange: inRange.length,
  };
}
