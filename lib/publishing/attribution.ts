// Analytics attribution: the closed loop. Link a post SOCIA published (a
// ContentItem's destinations) to the performance it later earned, using only
// data SOCIA already holds. No performance is predicted and no number is
// invented: a post analytics have not caught up to yet is `found: false` with
// null metrics, never a fabricated zero.
//
// Today only Instagram exposes per-post history (the synced media list on
// instagram_connections.media). YouTube does not store per-video historical
// stats for the user's own uploads beyond the live pull, and Facebook/TikTok
// have no read path, so those destinations return `found: false` honestly.
//
// Server only (reads the active Instagram connection). Pure apart from that one
// read; the median/multiplier math is deterministic and matches lib/overview.ts.

import { getActiveConnection, type IgMediaItem } from "../instagramSync";
import { interactionsTotal } from "../engagement";
import { median, fmtMult } from "../metrics";
import { PLATFORM_LABEL, type ContentItem, type Platform } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/**
 * One published destination's measured performance.
 *
 *   found        true only when SOCIA located this post's real data.
 *   interactions likes + comments + saves + shares (lib/engagement), or null.
 *   views        the platform's views for this post when present, else null.
 *   median       the account's median interactions per post (the baseline every
 *                other SOCIA surface compares against), or null when there is no
 *                baseline yet. Account-level: it is known even before this
 *                specific post is matched, which is what the caller compares
 *                against once analytics arrive.
 *   multiplier   interactions ÷ median when median > 0, else null. null while
 *                the post is unmatched.
 *   sampleSize   how many dated posts went into the median (0 when none).
 */
export type PostPerformance = {
  destinationId: string;
  platform: Platform;
  externalPostId: string;
  found: boolean;
  interactions: number | null;
  views: number | null;
  median: number | null;
  multiplier: number | null;
  sampleSize: number;
};

/** All-null performance for a published destination SOCIA cannot measure yet. */
function unmeasured(
  destinationId: string,
  platform: Platform,
  externalPostId: string,
  median: number | null = null,
  sampleSize = 0,
): PostPerformance {
  return {
    destinationId,
    platform,
    externalPostId,
    found: false,
    interactions: null,
    views: null,
    median,
    multiplier: null,
    sampleSize,
  };
}

/**
 * Attribute every PUBLISHED destination of a ContentItem to the performance it
 * has earned so far, from data SOCIA already holds.
 *
 * Instagram: the destination's external_post_id is the synced media item's id,
 * so it is matched against the active connection's cached media. The baseline is
 * the median of interactions across the account's dated posts (same definition
 * as lib/overview.ts; synced media always carry a timestamp, so this equals
 * `median(media.map(interactionsTotal))` while guaranteeing the sample size is
 * exactly the number of posts in the median).
 *
 * YouTube/Facebook/TikTok: no stored per-post history, so `found: false`.
 */
export async function attributePost(
  supabase: Supa,
  userId: string,
  item: ContentItem,
): Promise<PostPerformance[]> {
  const published = item.destinations.filter(
    (d): d is typeof d & { externalPostId: string } =>
      d.status === "published" && Boolean(d.externalPostId),
  );
  if (!published.length) return [];

  // The Instagram baseline is account-level and shared by every Instagram
  // destination, so read the active connection and compute the median once, and
  // only when an Instagram destination actually needs it.
  let igLoaded = false;
  let igMedia: IgMediaItem[] = [];
  let igMedian: number | null = null;
  let igSampleSize = 0;
  const ensureIg = async (): Promise<void> => {
    if (igLoaded) return;
    igLoaded = true;
    try {
      const conn = await getActiveConnection(supabase, userId, "media");
      if (conn && Array.isArray(conn.media)) igMedia = conn.media as IgMediaItem[];
    } catch {
      // No readable connection: Instagram destinations degrade to found:false
      // with null metrics, never a fabricated zero.
      igMedia = [];
    }
    const dated = igMedia.filter((m) => m.timestamp);
    igSampleSize = dated.length;
    igMedian = median(dated.map(interactionsTotal));
  };

  const out: PostPerformance[] = [];
  for (const d of published) {
    if (d.platform === "instagram") {
      await ensureIg();
      const matched = igMedia.find((m) => m.id === d.externalPostId);
      if (!matched) {
        // Analytics have not caught up to this post yet: the account baseline is
        // still known, but the post's own metrics are unknown, not zero.
        out.push(unmeasured(d.id, "instagram", d.externalPostId, igMedian, igSampleSize));
        continue;
      }
      const interactions = interactionsTotal(matched);
      out.push({
        destinationId: d.id,
        platform: "instagram",
        externalPostId: d.externalPostId,
        found: true,
        interactions,
        views: matched.insights?.views ?? null,
        median: igMedian,
        multiplier: igMedian != null && igMedian > 0 ? interactions / igMedian : null,
        sampleSize: igSampleSize,
      });
      continue;
    }
    // YouTube: SOCIA does not store per-video historical stats for the user's
    // own uploads beyond the live pull. Facebook/TikTok: no read path. Honest
    // null shape rather than an invented number.
    out.push(unmeasured(d.id, d.platform, d.externalPostId));
  }
  return out;
}

/**
 * One deterministic sentence about how a published post performed against the
 * account's own baseline, or null when nothing can be said honestly.
 *
 * A line is produced only when a destination found real data whose baseline is
 * defensible: median > 0 and at least 5 posts in the sample. Below that the
 * caller shows "SOCIA will measure this against your median once analytics
 * arrive." No prediction, no fabricated numbers.
 */
export function learningLine(
  perf: PostPerformance[],
): { text: string; multiplier: number | null } | null {
  const usable = perf.filter(
    (p) =>
      p.found &&
      p.multiplier != null &&
      p.median != null &&
      p.median > 0 &&
      p.sampleSize >= 5,
  );
  if (!usable.length) return null;
  // Instagram is the only platform with a defensible per-post baseline today;
  // prefer it so the sentence's platform label is right, then fall back to the
  // first usable destination (order is deterministic from lib/publishing/db).
  const chosen = usable.find((p) => p.platform === "instagram") ?? usable[0];
  return {
    text: `This post reached ${fmtMult(chosen.multiplier!)} your typical ${PLATFORM_LABEL[chosen.platform]} post (median of ${chosen.sampleSize} posts).`,
    multiplier: chosen.multiplier,
  };
}
