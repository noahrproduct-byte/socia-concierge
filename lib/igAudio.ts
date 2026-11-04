// Trending audio on Instagram, from Meta's Instagram Audio API.
//
// GET /ig_audio?audio_type=music|original_sound&user_id={ig-user-id} with no
// search query returns "trending original sounds or music" (Meta's Audio API
// guide). It needs a Facebook USER token with instagram_basic and
// instagram_content_publish, for an Instagram account linked to a Page; it is
// not available through Instagram Login. So it asks with the customer's own
// Facebook connection when that has the permission, else with SOCIA's research
// account (lib/igResearch.ts settings).
//
// What Meta returns is a list, not a ranking: no play counts, no Reel counts,
// no "is trending" score. SOCIA shows the list as Meta orders it and never
// numbers it. Meta also says the selection is audio "authorized for third party
// use" and may differ from the in-app list, and the UI says so.
//
// Answers are cached per server instance for an hour; download_url expires
// after about 1.5 days, so nothing is stored in the database.
//
// Server only: tokens never leave the server.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FB_GRAPH_V, FB_IG_AUDIO_SCOPE } from "@/lib/facebook";
import { researchRows } from "@/lib/igResearch";

const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;
const TTL_MS = 60 * 60 * 1000;
export const AUDIO_SCOPE = FB_IG_AUDIO_SCOPE;

export type AudioKind = "music" | "original_sound";

export type TrendingAudioItem = {
  id: string;
  kind: AudioKind;
  title: string;
  /** Artist for music; the creator's @username for an original sound. */
  by: string | null;
  cover: string | null;
  durationSec: number | null;
  /** Instagram's own page for the sound, when Meta gives one. */
  link: string | null;
  /** A short-lived preview file (about 1.5 days), when Meta gives one. */
  preview: string | null;
};

export type TrendingAudio =
  | { status: "ok"; music: TrendingAudioItem[]; sounds: TrendingAudioItem[]; fetchedAt: string }
  | { status: "unavailable"; reason: string };

type Conn = { igUserId: string; userToken: string };
type Row = { ig_business_id?: string | null; ig_business_username?: string | null; user_access_token?: string | null; scopes?: unknown; connection_status?: string | null; user_token_expires_at?: string | null };

const COLS = "ig_business_id, ig_business_username, user_access_token, scopes, connection_status, user_token_expires_at";

/** A connected row whose user token can ask the Audio API. */
export function usableAudioRow(r: Row, now = Date.now()): boolean {
  const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
  const expired = r.user_token_expires_at ? new Date(r.user_token_expires_at).getTime() <= now : false;
  return r.connection_status === "connected" && Boolean(r.ig_business_id && r.user_access_token) && scopes.includes(AUDIO_SCOPE) && !expired;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

async function audioConnection(client: Supa, ownerId: string): Promise<Conn | null> {
  const pick = (rows: Row[] | null | undefined) => {
    const r = (rows ?? []).find((x) => usableAudioRow(x));
    return r ? { igUserId: r.ig_business_id!, userToken: r.user_access_token! } : null;
  };
  try {
    const { data } = await client.from("facebook_connections").select(COLS).eq("user_id", ownerId).limit(20);
    const own = pick(data as Row[]);
    if (own) return own;
  } catch {
    /* fall through to SOCIA's account */
  }
  // SOCIA's research account (lib/igResearch.ts), for customers without one.
  return pick(await researchRows<Row>("user_access_token, scopes, user_token_expires_at"));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** One /ig_audio item, normalised. Exported for tests. */
export function toItem(raw: Record<string, unknown>, kind: AudioKind): TrendingAudioItem | null {
  const id = str(raw.audio_id);
  const title = str(raw.title);
  if (!id || !title) return null;
  const ms = typeof raw.duration_in_ms === "number" && raw.duration_in_ms > 0 ? raw.duration_in_ms : null;
  const user = str(raw.ig_username);
  return {
    id, kind, title,
    by: kind === "music" ? str(raw.display_artist) : user ? `@${user.replace(/^@/, "")}` : null,
    cover: str(raw.cover_artwork_thumbnail_uri) ?? str(raw.cover_artwork_thumbnail_url) ?? (kind === "original_sound" ? str(raw.profile_picture_url) : null),
    durationSec: ms ? Math.round(ms / 1000) : null,
    link: str(raw.on_platform_audio_preview_link),
    preview: str(raw.download_url),
  };
}

async function fetchKind(conn: Conn, kind: AudioKind): Promise<TrendingAudioItem[] | { error: string }> {
  const u = new URL(`${BASE}/ig_audio`);
  u.searchParams.set("audio_type", kind);
  u.searchParams.set("user_id", conn.igUserId);
  u.searchParams.set("access_token", conn.userToken);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const j = (await res.json()) as { audio?: Record<string, unknown>[]; error?: { message?: string } };
    if (j.error) return { error: (j.error.message ?? "Instagram returned an error.").slice(0, 200) };
    const seen = new Set<string>();
    return (j.audio ?? [])
      .map((a) => toItem(a, kind))
      .filter((a): a is TrendingAudioItem => Boolean(a) && !seen.has(a!.id) && Boolean(seen.add(a!.id)))
      .slice(0, 12);
  } catch {
    return { error: "Instagram couldn't be reached." };
  }
}

let memo: { at: number; value: TrendingAudio & { status: "ok" } } | null = null;

/** Test seam. */
export function resetAudioMemo(): void {
  memo = null;
}

/**
 * Instagram's trending music and original sounds. `detail` on failure is
 * Meta's own message, for the owner-only check page; the reason is what a
 * customer reads.
 */
export async function trendingAudio(client: Supa, ownerId: string): Promise<TrendingAudio & { detail?: string }> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const conn = await audioConnection(client, ownerId);
  if (!conn) return { status: "unavailable", reason: "Trending audio isn't available right now." };
  const [music, sounds] = await Promise.all([fetchKind(conn, "music"), fetchKind(conn, "original_sound")]);
  if (!Array.isArray(music) && !Array.isArray(sounds)) {
    return { status: "unavailable", reason: "Instagram didn't share trending audio right now.", detail: music.error };
  }
  const value = { status: "ok" as const, music: Array.isArray(music) ? music : [], sounds: Array.isArray(sounds) ? sounds : [], fetchedAt: new Date().toISOString() };
  if (value.music.length || value.sounds.length) memo = { at: Date.now(), value };
  return value;
}
