// Server-side readers for the signed-in user's own TikTok connection: a valid
// access token (refreshed when near expiry) and a profile + videos sync that
// writes the public counts onto the connection row. Never sends tokens down.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMyProfile, fetchMyVideos, refreshAccessToken, type TtProfile, type TtVideo } from "./tiktokAuth";

export type TikTokAccess = {
  token: string;
  openId: string | null;
  scopes: string[] | null;
};

type ConnRow = {
  open_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes?: string[] | null;
  plan_suspended_at?: string | null;
};

async function readConnRow(supabase: SupabaseClient, userId: string): Promise<ConnRow | null> {
  const full = "open_id, access_token, refresh_token, token_expires_at, scopes, plan_suspended_at";
  const { data, error } = await supabase.from("tiktok_connections").select(full).eq("user_id", userId).maybeSingle();
  if (!error) return (data as ConnRow | null) ?? null;
  // Pre-migration schema (no plan_suspended_at / scopes): read what exists.
  const { data: legacy } = await supabase
    .from("tiktok_connections")
    .select("open_id, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (legacy as ConnRow | null) ?? null;
}

/**
 * A usable access token for the user's TikTok account, or null when there is
 * no connection or it is paused by the plan. Refreshes when under 2 minutes
 * remain; TikTok rotates the refresh token on every refresh, so the new one is
 * always stored.
 */
export async function tiktokAccessToken(supabase: SupabaseClient, userId: string): Promise<TikTokAccess | null> {
  const row = await readConnRow(supabase, userId);
  if (!row?.access_token) return null;
  if (row.plan_suspended_at != null) return null;
  const scopes = Array.isArray(row.scopes) ? row.scopes : null;
  const current = { token: row.access_token, openId: row.open_id, scopes };

  const expMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expMs - Date.now() > 120_000) return current;
  if (!row.refresh_token) return current;

  const tok = await refreshAccessToken(row.refresh_token);
  if (!tok) return current;
  await supabase
    .from("tiktok_connections")
    .update({
      access_token: tok.access_token,
      token_expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      ...(tok.refresh_token ? { refresh_token: tok.refresh_token } : {}),
      ...(tok.refreshExpiresIn != null ? { refresh_expires_at: new Date(Date.now() + tok.refreshExpiresIn * 1000).toISOString() } : {}),
      ...(tok.scopes.length ? { scopes: tok.scopes } : {}),
    })
    .eq("user_id", userId)
    .then(() => undefined, () => undefined);
  return { token: tok.access_token, openId: row.open_id ?? tok.open_id, scopes: tok.scopes.length ? tok.scopes : scopes };
}

/** Column patch for a fetched profile (shared by the callback and the sync). */
export function profileColumns(p: TtProfile): Record<string, unknown> {
  return {
    open_id: p.openId,
    union_id: p.unionId,
    display_name: p.displayName,
    username: p.username,
    avatar_url: p.avatar,
    profile_url: p.profileUrl,
    bio: p.bio,
    is_verified: p.isVerified,
    follower_count: p.followers,
    following_count: p.following,
    likes_count: p.likes,
    video_count: p.videos,
  };
}

/**
 * Refresh the stored profile counts and the latest videos. Best effort: a
 * failed read leaves the previous snapshot in place. Returns what was written.
 */
export async function syncTikTok(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: TtProfile | null; videos: TtVideo[] | null }> {
  const auth = await tiktokAccessToken(supabase, userId);
  if (!auth) return { profile: null, videos: null };
  const [profile, videos] = await Promise.all([fetchMyProfile(auth.token), fetchMyVideos(auth.token, 20)]);
  const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (profile) Object.assign(patch, profileColumns(profile));
  if (videos) patch.videos = videos;
  if (profile || videos) {
    await supabase.from("tiktok_connections").update(patch).eq("user_id", userId).then(() => undefined, () => undefined);
  }
  return { profile, videos };
}
