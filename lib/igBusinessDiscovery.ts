// Instagram Business Discovery.
//
// This is the ONLY official way to read another Instagram account's metrics,
// and it needs a specific chain:
//
//   Facebook Login (instagram_basic)
//     -> the Pages the user manages
//     -> the Page's linked Instagram Professional account  (ig_user_id)
//     -> graph.facebook.com/{ig_user_id}?fields=business_discovery.username(X)
//
// What it genuinely returns for a PUBLIC Business/Creator account:
//   followers_count, media_count, username, profile_picture_url, biography,
//   and recent media with like_count / comments_count / caption / permalink.
//
// What it does NOT return, ever: reach, impressions, saves, shares, watch
// time, follower history, or anything else private to that account's owner.
// Those stay null and render as "—".
//
// It fails for personal and private accounts. That's a real answer, not an
// error to paper over — the UI says so.

import { FB_GRAPH_V } from "@/lib/facebook";

const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;

export type IgDiscoveryMedia = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
};

export type IgDiscoveryAccount = {
  username: string;
  name: string | null;
  biography: string | null;
  profilePicture: string | null;
  followers: number | null;
  mediaCount: number | null;
  media: IgDiscoveryMedia[];
};

export type IgDiscoveryReason =
  | "not_found"
  | "not_business"
  | "no_permission"
  | "not_connected"
  | "failed";

export type IgDiscoveryResult =
  | { ok: true; account: IgDiscoveryAccount }
  | { ok: false; reason: IgDiscoveryReason; detail?: string };

export const IG_DISCOVERY_REASON: Record<IgDiscoveryReason, string> = {
  not_found: "Instagram has no public account with that username.",
  not_business:
    "That account is personal or private. Instagram only publishes data for public Business and Creator accounts.",
  no_permission:
    "Reconnect Facebook to grant Instagram access. Business Discovery needs the instagram_basic permission.",
  not_connected:
    "Connect a Facebook Page linked to your Instagram Professional account to enable Instagram competitor data.",
  failed: "Instagram couldn't be reached right now.",
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Resolve the Instagram Professional account linked to a Facebook Page. */
export async function igAccountForPage(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; username: string | null } | null> {
  const u = new URL(`${BASE}/${pageId}`);
  u.searchParams.set("fields", "instagram_business_account{id,username}");
  u.searchParams.set("access_token", pageToken);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const j = (await res.json()) as {
      instagram_business_account?: { id?: string; username?: string };
    };
    const ig = j?.instagram_business_account;
    if (!ig?.id) return null;
    return { id: ig.id, username: ig.username ?? null };
  } catch {
    return null;
  }
}

/** Public data for one competitor username, via the user's own IG account. */
export async function businessDiscovery(
  igUserId: string,
  pageToken: string,
  competitor: string,
  mediaLimit = 12,
): Promise<IgDiscoveryResult> {
  const handle = competitor.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return { ok: false, reason: "not_found" };

  const fields =
    `business_discovery.username(${handle}){username,name,biography,profile_picture_url,followers_count,media_count,` +
    `media.limit(${mediaLimit}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count}}`;

  const u = new URL(`${BASE}/${igUserId}`);
  u.searchParams.set("fields", fields);
  u.searchParams.set("access_token", pageToken);

  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(12000) });
    const j = (await res.json()) as {
      business_discovery?: Record<string, unknown>;
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (j.error) {
      const msg = (j.error.message ?? "").toLowerCase();
      // Meta returns the same code for "no such user" and "not a business
      // account", so the message is what distinguishes them.
      if (msg.includes("cannot be found") || msg.includes("does not exist")) {
        return { ok: false, reason: "not_found" };
      }
      if (msg.includes("not a business") || msg.includes("business account")) {
        return { ok: false, reason: "not_business" };
      }
      if (j.error.code === 10 || j.error.code === 200 || msg.includes("permission")) {
        return { ok: false, reason: "no_permission", detail: j.error.message?.slice(0, 180) };
      }
      return { ok: false, reason: "failed", detail: j.error.message?.slice(0, 180) };
    }

    const bd = j.business_discovery;
    if (!bd) return { ok: false, reason: "not_found" };

    const mediaRaw = (bd.media as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
    return {
      ok: true,
      account: {
        username: String(bd.username ?? handle),
        name: (bd.name as string) ?? null,
        biography: (bd.biography as string) ?? null,
        profilePicture: (bd.profile_picture_url as string) ?? null,
        followers: num(bd.followers_count),
        mediaCount: num(bd.media_count),
        media: mediaRaw.map((m) => ({
          id: String(m.id ?? ""),
          caption: (m.caption as string) ?? null,
          mediaType: (m.media_type as string) ?? null,
          mediaUrl: (m.media_url as string) ?? null,
          thumbnailUrl: (m.thumbnail_url as string) ?? null,
          permalink: (m.permalink as string) ?? null,
          timestamp: (m.timestamp as string) ?? null,
          likes: num(m.like_count),
          comments: num(m.comments_count),
        })),
      },
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Derived, transparent metrics — computed only from values Meta returned.
 *  Engagement rate here is (likes + comments) / followers, the same
 *  definition SOCIA uses for the user's own account, so the two compare. */
export function discoveryStats(a: IgDiscoveryAccount): {
  postsPerWeek: number | null;
  medianEngagement: number | null;
  engagementRate: number | null;
} {
  const withTime = a.media.filter((m) => m.timestamp);
  const times = withTime
    .map((m) => new Date(m.timestamp!).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((x, y) => x - y);
  const spanDays = times.length >= 2 ? (times[times.length - 1] - times[0]) / 86400000 : null;
  const postsPerWeek = spanDays && spanDays >= 1 ? (times.length / spanDays) * 7 : null;

  const engs = a.media
    .map((m) => (m.likes ?? 0) + (m.comments ?? 0))
    .filter((_, i) => a.media[i].likes != null || a.media[i].comments != null)
    .sort((x, y) => x - y);
  const mid = Math.floor(engs.length / 2);
  const medianEngagement = engs.length
    ? engs.length % 2 ? engs[mid] : (engs[mid - 1] + engs[mid]) / 2
    : null;

  const engagementRate =
    medianEngagement != null && a.followers && a.followers > 0
      ? (medianEngagement / a.followers) * 100
      : null;

  return { postsPerWeek, medianEngagement, engagementRate };
}
