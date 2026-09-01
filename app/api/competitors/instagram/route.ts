import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  businessDiscovery, discoveryStats, IG_DISCOVERY_REASON,
} from "@/lib/igBusinessDiscovery";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real Instagram competitor data, via Business Discovery.
//
// This is the only official route to another account's Instagram metrics, and
// it only works for PUBLIC Business/Creator accounts, through a Facebook Page
// linked to the user's own Instagram Professional account. Every value comes
// from Meta; anything Meta withholds (reach, saves, impressions, follower
// history) is absent here entirely rather than estimated.

const FRESH_MS = 6 * 60 * 60 * 1000;

export type IgCompetitor = {
  handle: string;
  found: boolean;
  reason?: string;
  displayName?: string | null;
  biography?: string | null;
  profilePicture?: string | null;
  followers?: number | null;
  mediaCount?: number | null;
  postsPerWeek?: number | null;
  medianEngagement?: number | null;
  engagementRate?: number | null;
  topPosts?: {
    permalink: string | null; caption: string | null; thumbnail: string | null;
    likes: number | null; comments: number | null; timestamp: string | null; mediaType: string | null;
  }[];
  fetchedAt?: string;
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const one = url.searchParams.get("handle");

  // The connection that makes discovery possible at all.
  let igUserId: string | null = null;
  let pageToken: string | null = null;
  try {
    const { data } = await supabase
      .from("facebook_connections")
      .select("ig_business_id, access_token, connection_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.connection_status === "connected") {
      igUserId = data.ig_business_id ?? null;
      pageToken = data.access_token ?? null;
    }
  } catch {
    /* treated as not connected below */
  }

  if (!igUserId || !pageToken) {
    return NextResponse.json({
      enabled: false,
      reason: IG_DISCOVERY_REASON.not_connected,
      competitors: [],
    });
  }

  // Which handles to look up.
  let handles: string[] = [];
  if (one) {
    handles = [one.replace(/^@/, "")];
  } else {
    try {
      const { data } = await supabase
        .from("tracked_competitors")
        .select("handle")
        .eq("user_id", user.id)
        .eq("platform", "instagram");
      handles = (data ?? []).map((r: { handle: string }) => r.handle);
    } catch {
      handles = [];
    }
  }
  if (!handles.length) return NextResponse.json({ enabled: true, competitors: [] });

  // Serve cached rows when fresh — Business Discovery is rate limited.
  const cached = new Map<string, IgCompetitor>();
  if (!refresh) {
    try {
      const { data } = await supabase
        .from("ig_competitor_snapshots")
        .select("*")
        .eq("user_id", user.id)
        .in("handle", handles);
      for (const r of data ?? []) {
        if (Date.now() - new Date(r.fetched_at).getTime() < FRESH_MS) {
          cached.set(r.handle, {
            handle: r.handle, found: true, displayName: r.display_name,
            biography: r.biography, profilePicture: r.profile_picture,
            followers: r.followers, mediaCount: r.media_count,
            postsPerWeek: r.posts_per_week != null ? Number(r.posts_per_week) : null,
            medianEngagement: r.median_engagement != null ? Number(r.median_engagement) : null,
            engagementRate: r.engagement_rate != null ? Number(r.engagement_rate) : null,
            topPosts: r.media ?? [], fetchedAt: r.fetched_at,
          });
        }
      }
    } catch {
      /* cache table may not exist yet */
    }
  }

  const competitors: IgCompetitor[] = await Promise.all(
    handles.slice(0, 10).map(async (h): Promise<IgCompetitor> => {
      const hit = cached.get(h);
      if (hit) return hit;

      const res = await businessDiscovery(igUserId!, pageToken!, h);
      if (!res.ok) {
        return { handle: h, found: false, reason: IG_DISCOVERY_REASON[res.reason] };
      }
      const a = res.account;
      const stats = discoveryStats(a);
      const topPosts = [...a.media]
        .sort((x, y) => ((y.likes ?? 0) + (y.comments ?? 0)) - ((x.likes ?? 0) + (x.comments ?? 0)))
        .slice(0, 3)
        .map((m) => ({
          permalink: m.permalink, caption: m.caption, thumbnail: m.thumbnailUrl ?? m.mediaUrl,
          likes: m.likes, comments: m.comments, timestamp: m.timestamp, mediaType: m.mediaType,
        }));
      const fetchedAt = new Date().toISOString();

      try {
        await supabase.from("ig_competitor_snapshots").upsert(
          {
            user_id: user.id, handle: a.username.toLowerCase(), display_name: a.name,
            biography: a.biography, profile_picture: a.profilePicture, followers: a.followers,
            media_count: a.mediaCount, posts_per_week: stats.postsPerWeek,
            median_engagement: stats.medianEngagement, engagement_rate: stats.engagementRate,
            media: topPosts, fetched_at: fetchedAt,
          },
          { onConflict: "user_id,handle" },
        );
      } catch {
        /* caching is best-effort */
      }

      return {
        handle: a.username, found: true, displayName: a.name, biography: a.biography,
        profilePicture: a.profilePicture, followers: a.followers, mediaCount: a.mediaCount,
        postsPerWeek: stats.postsPerWeek, medianEngagement: stats.medianEngagement,
        engagementRate: stats.engagementRate, topPosts, fetchedAt,
      };
    }),
  );

  return NextResponse.json({ enabled: true, competitors });
}
