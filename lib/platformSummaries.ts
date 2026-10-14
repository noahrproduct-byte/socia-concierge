// One platform's headline numbers for the cross-platform views (Dashboard
// snapshot, Analytics "All Platforms", and the AI-assistant API), built from
// the same platform builders those pages use. One function per platform, so
// the Dashboard, Analytics and an AI assistant can never state different
// numbers. Pure.
import type { PlatformSummary } from "./metrics/allPlatforms";
import type { FacebookAnalyticsData } from "./metrics/facebook";
import type { TikTokAnalyticsData } from "./metrics/tiktok";
import type { YouTubeAnalytics } from "./youtubeData";
import type { Series } from "./overview";
import type { FbSnapshot } from "./facebookSync";

/** Instagram: followers, and views / interactions / posts inside the range (null input = not live). */
export function instagramSummary(ig: { username: string | null; followers: number | null; views: Series; engagement: Series; postsInRange: number } | null): PlatformSummary {
  if (!ig) return { platform: "instagram", connected: false, label: "Instagram", audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null };
  return {
    platform: "instagram", connected: true, label: ig.username ? `@${ig.username}` : "Instagram",
    audience: ig.followers, audienceLabel: "followers", views: ig.views.total, viewsNote: null, engagement: ig.engagement.total, contentPublished: ig.postsInRange,
  };
}

/** Facebook: Page followers, engagement and posts in range; views only where Page Insights report them. */
export function facebookSummary(fb: FbSnapshot | null, data: FacebookAnalyticsData | null): PlatformSummary {
  const connected = fb?.status === "connected";
  const out: PlatformSummary = { platform: "facebook", connected, label: fb?.page_name ?? "Facebook", audience: fb?.followers_count ?? null, audienceLabel: "followers", views: null, viewsNote: "Facebook doesn't report post views", engagement: null, contentPublished: null };
  if (!connected || !data) return out;
  out.engagement = data.engagement.total;
  out.contentPublished = data.postsInRange;
  if (data.views && data.views.total != null) {
    out.views = data.views.total;
    out.viewsNote = null;
  }
  return out;
}

/** YouTube: subscribers and the channel's views in range, as YouTube Analytics reports them. */
export function youtubeSummary(yt: YouTubeAnalytics | null): PlatformSummary {
  return { platform: "youtube", connected: Boolean(yt), label: yt?.channel.title ?? "YouTube", audience: yt?.channel.subscribers ?? null, audienceLabel: "subscribers", views: yt?.range?.views ?? null, viewsNote: null, engagement: null, contentPublished: null };
}

/** TikTok: followers and videos in range; TikTok gives per-video totals, not a range view count. */
export function tiktokSummary(row: Record<string, unknown> | null, data: TikTokAnalyticsData | null): PlatformSummary {
  const out: PlatformSummary = { platform: "tiktok", connected: Boolean(row), label: "TikTok", audience: null, audienceLabel: "followers", views: null, viewsNote: "TikTok reports per-video totals, not a range view count", engagement: null, contentPublished: null };
  if (!row || !data) return out;
  out.label = data.profile.username ? `@${data.profile.username}` : (data.profile.name || "TikTok");
  out.audience = (row.follower_count as number | null) ?? null;
  out.contentPublished = data.videosInRange;
  return out;
}
