// Stored posts in the shape the breakout detector reads (lib/alertDetectors.ts),
// one mapper per platform. Shared by the daily alert run and the Dashboard's
// Today card so both judge a post against the same peers.
import { formatOf } from "./overview";
import { interactionsTotal } from "./engagement";
import { fbPostEngagement } from "./metrics/facebook";
import type { IgMediaItem } from "./instagramSync";
import type { FbPost } from "./facebookSync";
import type { TtVideo } from "./tiktokAuth";
import type { BreakoutPost } from "./alertDetectors";

const FB_FORMAT: Record<string, string> = { added_video: "Video", added_photos: "Photo", shared_story: "Link", mobile_status_update: "Post", created_note: "Post" };

/** Instagram: interactions per post, by format (Reel, Carousel, Photo). */
export function igBreakoutPosts(media: IgMediaItem[]): BreakoutPost[] {
  return media
    .filter((m) => m.id && m.timestamp)
    .map((m) => ({
      id: m.id!,
      format: formatOf(m),
      interactions: interactionsTotal(m),
      timestampMs: new Date(m.timestamp!).getTime(),
      permalink: m.permalink ?? null,
      caption: m.caption ?? null,
    }))
    .filter((p) => Number.isFinite(p.timestampMs));
}

/** Facebook: reactions + comments + shares per post; posts without counts are left out. */
export function fbBreakoutPosts(posts: FbPost[]): BreakoutPost[] {
  return posts
    .map((p) => ({ id: p.id ?? "", format: FB_FORMAT[p.status_type ?? ""] ?? "Post", interactions: fbPostEngagement(p) ?? -1, timestampMs: p.created_time ? new Date(p.created_time).getTime() : NaN, permalink: p.permalink_url ?? null, caption: p.message ?? null }))
    .filter((p) => p.id && p.interactions >= 0 && Number.isFinite(p.timestampMs));
}

/** TikTok: views per video (TikTok's own per-video totals). */
export function ttBreakoutPosts(videos: TtVideo[]): BreakoutPost[] {
  return videos
    .map((v) => ({ id: v.id, format: "Video", interactions: v.views ?? -1, timestampMs: v.createdAt ? new Date(v.createdAt).getTime() : NaN, permalink: v.url ?? null, caption: v.caption ?? null }))
    .filter((p) => p.id && p.interactions >= 0 && Number.isFinite(p.timestampMs));
}
