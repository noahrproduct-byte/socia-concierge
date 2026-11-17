// The stream clipper on SOCIA's server: the Twitch connection (tokens stay
// here, read through the service role; lib/supabase/privateTables.ts), the
// channels a person watches and the clips the watcher made. The watcher
// (worker/stream-watcher) uses the same token helper. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshTokens, me, usersByLogin, TwitchError, type TwitchUser } from "./twitch";
import { MAX_WATCHED } from "./channels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const STREAM_MIGRATION_HINT = "Live stream clips need their database tables. Run supabase/stream-clipper.sql in the Supabase SQL editor.";

import type { StreamClip, StreamWatch, TwitchConnection } from "./types";
export type { StreamClip, StreamWatch, TwitchConnection };

const CONN_COLS = "twitch_user_id, login, display_name, avatar_url, scopes";

/** The person's Twitch account, without its tokens. Null when not connected. */
export async function readConnection(db: Supa, ownerId: string): Promise<TwitchConnection | null> {
  const { data, error } = await db.from("twitch_connections").select(CONN_COLS).eq("user_id", ownerId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as { twitch_user_id: string; login: string; display_name: string | null; avatar_url: string | null; scopes: string[] | null };
  return { twitchUserId: r.twitch_user_id, login: r.login, displayName: r.display_name, avatarUrl: r.avatar_url, scopes: r.scopes ?? [] };
}

/** Saves the account a person just approved (the callback). */
export async function saveConnection(db: Supa, ownerId: string, tok: { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }): Promise<TwitchUser> {
  const user = await me(tok.accessToken);
  const { error } = await db.from("twitch_connections").upsert({
    user_id: ownerId, twitch_user_id: user.id, login: user.login, display_name: user.display_name, avatar_url: user.profile_image_url || null,
    access_token: tok.accessToken, refresh_token: tok.refreshToken, scopes: tok.scopes, token_expires_at: tok.expiresAt,
    connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return user;
}

/** Forgets the account and stops everything it was watching. */
export async function removeConnection(db: Supa, ownerId: string): Promise<void> {
  await db.from("stream_watches").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("user_id", ownerId).eq("status", "watching");
  const { error } = await db.from("twitch_connections").delete().eq("user_id", ownerId);
  if (error) throw error;
}

/**
 * A working Twitch token for the person, refreshed when it has under two
 * minutes left (Twitch rotates the refresh token too, so both are saved).
 */
export async function twitchToken(db: Supa, ownerId: string): Promise<{ token: string; twitchUserId: string }> {
  const { data, error } = await db.from("twitch_connections").select("twitch_user_id, access_token, refresh_token, token_expires_at").eq("user_id", ownerId).maybeSingle();
  if (error) throw error;
  const r = data as { twitch_user_id: string; access_token: string; refresh_token: string; token_expires_at: string } | null;
  if (!r) throw new TwitchError(401, "auth", "Connect Twitch first.");
  if (new Date(r.token_expires_at).getTime() - Date.now() > 120_000) return { token: r.access_token, twitchUserId: r.twitch_user_id };
  const tok = await refreshTokens(r.refresh_token);
  const { error: upErr } = await db.from("twitch_connections").update({ access_token: tok.accessToken, refresh_token: tok.refreshToken, token_expires_at: tok.expiresAt, scopes: tok.scopes, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
  if (upErr) throw upErr;
  return { token: tok.accessToken, twitchUserId: r.twitch_user_id };
}

const WATCH_COLS = "id, channel_id, channel_login, channel_name, avatar_url, status, live, stream_title, messages_seen, last_chat_at, watcher_seen_at, can_download, last_error, started_at, stopped_at";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toWatch = (r: any): StreamWatch => ({
  id: r.id, channelId: r.channel_id, login: r.channel_login, name: r.channel_name, avatarUrl: r.avatar_url, status: r.status, live: r.live, streamTitle: r.stream_title,
  messagesSeen: r.messages_seen ?? 0, lastChatAt: r.last_chat_at, watcherSeenAt: r.watcher_seen_at, canDownload: r.can_download, lastError: r.last_error, startedAt: r.started_at, stoppedAt: r.stopped_at,
});

const CLIP_COLS = "id, watch_id, channel_login, status, twitch_clip_id, url, embed_url, edit_url, thumbnail_url, title, duration, spike_at, score, why, people, video_path, error, created_at";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toClip = (r: any): StreamClip => ({
  id: r.id, watchId: r.watch_id, login: r.channel_login, status: r.status, twitchClipId: r.twitch_clip_id, url: r.url, embedUrl: r.embed_url, editUrl: r.edit_url,
  thumbnailUrl: r.thumbnail_url, title: r.title, duration: r.duration == null ? null : Number(r.duration), spikeAt: r.spike_at, score: r.score, why: r.why, people: r.people,
  hasVideo: Boolean(r.video_path), error: r.error, createdAt: r.created_at,
});

/** What the Live streams tab shows: the channels being watched (and the last few stopped) and the newest clips. */
export async function streamState(db: Supa, ownerId: string): Promise<{ watches: StreamWatch[]; clips: StreamClip[] }> {
  const [w, c] = await Promise.all([
    db.from("stream_watches").select(WATCH_COLS).eq("user_id", ownerId).order("started_at", { ascending: false }).limit(12),
    db.from("stream_clips").select(CLIP_COLS).eq("user_id", ownerId).order("created_at", { ascending: false }).limit(60),
  ]);
  if (w.error) throw w.error;
  if (c.error) throw c.error;
  return { watches: (w.data ?? []).map(toWatch), clips: (c.data ?? []).map(toClip) };
}

export class WatchError extends Error {}

/**
 * Starts watching these channels (logins), up to MAX_WATCHED at once in all.
 * A channel already being watched is left as it is. Unknown names are refused
 * by name, so nothing is watched by mistake.
 */
export async function startWatching(db: Supa, ownerId: string, workspaceId: string | null, logins: string[]): Promise<StreamWatch[]> {
  const wanted = Array.from(new Set(logins.map((l) => l.toLowerCase())));
  if (!wanted.length) throw new WatchError("Paste a Twitch channel link or name.");
  const { data: cur, error } = await db.from("stream_watches").select(WATCH_COLS).eq("user_id", ownerId).eq("status", "watching");
  if (error) throw error;
  const watching = (cur ?? []).map(toWatch);
  const fresh = wanted.filter((l) => !watching.some((w) => w.login === l));
  if (watching.length + fresh.length > MAX_WATCHED) throw new WatchError(`SOCIA watches up to ${MAX_WATCHED} channels at once. Stop one first.`);
  if (!fresh.length) return watching;
  const { token } = await twitchToken(db, ownerId);
  const users = await usersByLogin(token, fresh);
  const missing = fresh.filter((l) => !users.some((u) => u.login.toLowerCase() === l));
  if (missing.length) throw new WatchError(`Twitch has no channel called ${missing.join(", ")}.`);
  const rows = users.map((u) => ({ user_id: ownerId, workspace_id: workspaceId, channel_id: u.id, channel_login: u.login.toLowerCase(), channel_name: u.display_name, avatar_url: u.profile_image_url || null, status: "watching" }));
  const { data: made, error: insErr } = await db.from("stream_watches").insert(rows).select(WATCH_COLS);
  if (insErr) throw insErr;
  return [...watching, ...(made ?? []).map(toWatch)];
}

/** Stops one channel. Its clips stay. */
export async function stopWatching(db: Supa, ownerId: string, watchId: string): Promise<boolean> {
  const { data, error } = await db.from("stream_watches").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("user_id", ownerId).eq("id", watchId).eq("status", "watching").select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

/** Removes one clip from SOCIA's list (the clip stays on Twitch). */
export async function deleteClip(db: Supa, ownerId: string, clipId: string): Promise<{ videoPath: string | null } | null> {
  const { data, error } = await db.from("stream_clips").delete().eq("user_id", ownerId).eq("id", clipId).select("video_path");
  if (error) throw error;
  const r = (data ?? [])[0] as { video_path: string | null } | undefined;
  return r ? { videoPath: r.video_path } : null;
}

/** The clip's stored video path, for a signed link (own or edited channels only have one). */
export async function clipVideoPath(db: Supa, ownerId: string, clipId: string): Promise<string | null> {
  const { data, error } = await db.from("stream_clips").select("video_path").eq("user_id", ownerId).eq("id", clipId).maybeSingle();
  if (error) throw error;
  return (data as { video_path: string | null } | null)?.video_path ?? null;
}

/** Where a downloaded clip's video is stored. */
export const streamClipPath = (ownerId: string, clipId: string) => `${ownerId}/streams/${clipId}.mp4`;
