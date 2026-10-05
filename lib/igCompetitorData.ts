// Instagram competitor rows via Business Discovery, shared by the API route
// and the server-rendered Competitors page.
//
// Meta serves another account's public numbers only through a Facebook Page
// linked to the user's Instagram Professional account. Without that link the
// result says so (enabled: false) and nothing is estimated. Fresh rows are
// cached in ig_competitor_snapshots because Discovery is rate limited.

import { timedFn } from "@/lib/timing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessDiscovery, discoveryStats, IG_DISCOVERY_REASON, type IgDiscoveryReason } from "@/lib/igBusinessDiscovery";

const FRESH_MS = 6 * 60 * 60 * 1000;

export type IgCompetitorPost = {
  permalink: string | null; caption: string | null; thumbnail: string | null;
  likes: number | null; comments: number | null; timestamp: string | null; mediaType: string | null;
};

export type IgCompetitor = {
  handle: string;
  found: boolean;
  reason?: string;
  reasonKind?: IgDiscoveryReason;
  displayName?: string | null;
  biography?: string | null;
  profilePicture?: string | null;
  followers?: number | null;
  mediaCount?: number | null;
  postsPerWeek?: number | null;
  medianEngagement?: number | null;
  engagementRate?: number | null;
  /** Recent media Meta returned (up to 12), newest first. */
  media?: IgCompetitorPost[];
  fetchedAt?: string;
};

export type IgCompetitorResult = { enabled: boolean; reason?: string; competitors: IgCompetitor[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export async function igConnection(supabase: Supa, userId: string): Promise<{ igUserId: string; pageToken: string } | null> {
  try {
    const { data } = await supabase
      .from("facebook_connections")
      .select("ig_business_id, access_token, connection_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.connection_status === "connected" && data.ig_business_id && data.access_token) {
      return { igUserId: data.ig_business_id, pageToken: data.access_token };
    }
  } catch {
    /* treated as not connected */
  }
  return null;
}

async function igCompetitorRowsImpl(supabase: Supa, userId: string, handles: string[], refresh = false): Promise<IgCompetitorResult> {
  const conn = await igConnection(supabase, userId);
  if (!conn) return { enabled: false, reason: IG_DISCOVERY_REASON.not_connected, competitors: [] };
  const wanted = [...new Set(handles.map((h) => h.replace(/^@/, "").toLowerCase()))].slice(0, 10);
  if (!wanted.length) return { enabled: true, competitors: [] };

  const cached = new Map<string, IgCompetitor>();
  if (!refresh) {
    try {
      const { data } = await supabase.from("ig_competitor_snapshots").select("*").eq("user_id", userId).in("handle", wanted);
      for (const r of data ?? []) {
        if (Date.now() - new Date(r.fetched_at).getTime() < FRESH_MS) {
          cached.set(r.handle, {
            handle: r.handle, found: true, displayName: r.display_name, biography: r.biography, profilePicture: r.profile_picture,
            followers: r.followers, mediaCount: r.media_count,
            postsPerWeek: r.posts_per_week != null ? Number(r.posts_per_week) : null,
            medianEngagement: r.median_engagement != null ? Number(r.median_engagement) : null,
            engagementRate: r.engagement_rate != null ? Number(r.engagement_rate) : null,
            media: r.media ?? [], fetchedAt: r.fetched_at,
          });
        }
      }
    } catch {
      /* cache table may not exist yet */
    }
  }

  const competitors = await Promise.all(
    wanted.map(async (h): Promise<IgCompetitor> => {
      const hit = cached.get(h);
      if (hit) return hit;
      const res = await businessDiscovery(conn.igUserId, conn.pageToken, h);
      if (!res.ok) return { handle: h, found: false, reason: IG_DISCOVERY_REASON[res.reason], reasonKind: res.reason };
      const a = res.account;
      const stats = discoveryStats(a);
      const media: IgCompetitorPost[] = a.media.map((m) => ({
        permalink: m.permalink, caption: m.caption, thumbnail: m.thumbnailUrl ?? m.mediaUrl,
        likes: m.likes, comments: m.comments, timestamp: m.timestamp, mediaType: m.mediaType,
      }));
      const fetchedAt = new Date().toISOString();
      try {
        await supabase.from("ig_competitor_snapshots").upsert(
          {
            user_id: userId, handle: a.username.toLowerCase(), display_name: a.name, biography: a.biography,
            profile_picture: a.profilePicture, followers: a.followers, media_count: a.mediaCount,
            posts_per_week: stats.postsPerWeek, median_engagement: stats.medianEngagement,
            engagement_rate: stats.engagementRate, media, fetched_at: fetchedAt,
          },
          { onConflict: "user_id,handle" },
        );
      } catch {
        /* caching is best-effort */
      }
      return {
        handle: a.username.toLowerCase(), found: true, displayName: a.name, biography: a.biography,
        profilePicture: a.profilePicture, followers: a.followers, mediaCount: a.mediaCount,
        postsPerWeek: stats.postsPerWeek, medianEngagement: stats.medianEngagement,
        engagementRate: stats.engagementRate, media, fetchedAt,
      };
    }),
  );
  return { enabled: true, competitors };
}

/** igCompetitorRows, logged when slow (lib/timing.ts). */
export const igCompetitorRows = timedFn("igCompetitorRows", igCompetitorRowsImpl);
