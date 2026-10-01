// TikTok analytics, built only from what TikTok's developer API legitimately
// gives us: point-in-time profile counts and per-video totals (no daily series,
// no demographics via the Login Kit scopes we hold). So this shows real
// per-video performance and states plainly that a daily trend isn't available —
// it never fabricates a time series. Pure: the page reads the row, this shapes.

import { DAY_MS, fmtNum } from "../overview";
import type { TtVideo } from "../tiktokAuth";

export type TtConnRow = {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  follower_count?: number | null;
  likes_count?: number | null;
  video_count?: number | null;
  videos?: unknown;
  last_synced_at?: string | null;
};

/** Likes + comments + shares on a video, or null when TikTok returned none. */
export function ttVideoEngagement(v: TtVideo): number | null {
  const parts = [v.likes, v.comments, v.shares].filter((x): x is number => x != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

export type TtStat = { key: string; label: string; value: string; note: string; status: "ok" | "unavailable" | "collecting" };
export type TtTopVideo = {
  id: string;
  title: string;
  cover: string | null;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  published: string | null;
};

export type TikTokAnalyticsData = {
  profile: { name: string | null; username: string | null; avatar: string | null; verified: boolean };
  rangeLabel: string;
  stats: TtStat[];
  topVideos: TtTopVideo[];
  videosInRange: number;
  /** Honest note about the missing daily trend (no fake chart is drawn). */
  historyNote: string;
  unavailable: { label: string; why: string }[];
};

export function buildTikTokAnalytics(input: { row: TtConnRow; days: number; rangeLabel: string; now?: Date }): TikTokAnalyticsData {
  const { row, days, rangeLabel } = input;
  const now = input.now ?? new Date();
  const videos: TtVideo[] = Array.isArray(row.videos) ? (row.videos as TtVideo[]) : [];
  const since = now.getTime() - days * DAY_MS;
  const inRange = videos.filter((v) => v.createdAt && new Date(v.createdAt).getTime() >= since);

  const engVideos = videos.filter((v) => ttVideoEngagement(v) != null);
  const engTotal = engVideos.reduce((a, v) => a + (ttVideoEngagement(v) ?? 0), 0);
  const avgEng = engVideos.length ? Math.round(engTotal / engVideos.length) : null;

  const stats: TtStat[] = [
    {
      key: "followers",
      label: "Followers",
      value: row.follower_count != null ? row.follower_count.toLocaleString("en-US") : "—",
      note: row.follower_count != null ? "current, from TikTok" : "not provided by TikTok",
      status: row.follower_count != null ? "ok" : "unavailable",
    },
    {
      key: "likes",
      label: "Total likes",
      value: row.likes_count != null ? fmtNum(row.likes_count) : "—",
      note: row.likes_count != null ? "across all videos (lifetime)" : "not provided by TikTok",
      status: row.likes_count != null ? "ok" : "unavailable",
    },
    {
      key: "videos",
      label: "Videos",
      value: row.video_count != null ? row.video_count.toLocaleString("en-US") : String(videos.length || "—"),
      note: "published (lifetime)",
      status: row.video_count != null || videos.length ? "ok" : "unavailable",
    },
    {
      key: "avg",
      label: "Avg engagement / video",
      value: avgEng != null ? fmtNum(avgEng) : "—",
      note: avgEng != null ? `likes + comments + shares · last ${engVideos.length} videos` : "needs video data",
      status: avgEng != null ? "ok" : "unavailable",
    },
  ];

  // Rank by views when TikTok served them, else by engagement.
  const haveViews = videos.some((v) => v.views != null);
  const topVideos: TtTopVideo[] = [...videos]
    .map((v) => ({ v, key: haveViews ? v.views ?? -1 : ttVideoEngagement(v) ?? -1 }))
    .sort((a, b) => b.key - a.key)
    .slice(0, 6)
    .map(({ v }) => ({
      id: v.id,
      title: (v.caption ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 80) || "(no caption)",
      cover: v.cover,
      url: v.url,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      engagement: ttVideoEngagement(v),
      published: v.createdAt,
    }));

  return {
    profile: {
      name: row.display_name ?? null,
      username: row.username ?? null,
      avatar: row.avatar_url ?? null,
      verified: Boolean(row.is_verified),
    },
    rangeLabel,
    stats,
    topVideos,
    videosInRange: inRange.length,
    historyNote:
      "TikTok's developer API doesn't provide a day-by-day performance series for connected accounts, so SOCIA shows per-video totals instead of a daily trend. If TikTok grants analytics access to this connection, the trend will appear here.",
    unavailable: [
      { label: "Daily performance trend", why: "TikTok's current API returns per-video totals, not a per-day time series, for this connection type." },
      { label: "Audience demographics", why: "Not available through TikTok's current developer API for connected accounts." },
    ],
  };
}
