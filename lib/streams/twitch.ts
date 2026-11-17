// Twitch's API for the stream clipper, server side only. What each call is
// allowed to do comes from Twitch's docs (checked 2026-11-16):
//   - Create Clip (POST /helix/clips, user token with clips:edit): any live
//     channel that allows clips. Captures about 85 s before the call and 5 s
//     after, and publishes the last `duration` seconds (5 to 60, default 30).
//     Asynchronous: the clip exists once Get Clips returns it (allow 60 s).
//     403 when the channel has clips off or limited to followers/subscribers,
//     404 when it isn't live.
//   - Get Clips Download (GET /helix/clips/downloads, editor:manage:clips or
//     channel:manage:clips): only for the broadcaster and their editors. So
//     SOCIA downloads a clip's video only on the person's own channel or one
//     they edit; any other channel's clip stays on Twitch (player + edit link).
//   - Reading chat: EventSub channel.chat.message over WebSocket with a user
//     token that has user:read:chat (the watcher, worker/stream-watcher).
// Tokens never reach the browser: this module is imported by routes and the
// watcher only.

export const TWITCH_SCOPES = ["clips:edit", "user:read:chat", "editor:manage:clips"] as const;
const HELIX = "https://api.twitch.tv/helix";
const OAUTH = "https://id.twitch.tv/oauth2";

export class TwitchError extends Error {
  constructor(public status: number, public kind: "auth" | "clips_off" | "not_live" | "not_found" | "rate" | "failed", message: string) { super(message); }
}

export function twitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim());
}
const clientId = () => process.env.TWITCH_CLIENT_ID!.trim();
const clientSecret = () => process.env.TWITCH_CLIENT_SECRET!.trim();

/** Where the person approves SOCIA on Twitch. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri, response_type: "code", scope: TWITCH_SCOPES.join(" "), state, force_verify: "true" });
  return `${OAUTH}/authorize?${q}`;
}

export type TwitchTokens = { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] };

async function tokenCall(body: Record<string, string>): Promise<TwitchTokens> {
  const res = await fetch(`${OAUTH}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }) });
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[] } | null;
  if (!res.ok || !j?.access_token || !j.refresh_token) throw new TwitchError(res.status, "auth", "Twitch didn't accept the sign-in. Connect Twitch again.");
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(), scopes: j.scope ?? [] };
}

export const exchangeCode = (code: string, redirectUri: string) => tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
export const refreshTokens = (refreshToken: string) => tokenCall({ refresh_token: refreshToken, grant_type: "refresh_token" });

/** One Helix call with a user token. */
async function helix<T>(token: string, path: string, init?: { method?: string; query?: Record<string, string | string[]> }): Promise<{ status: number; data: T }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  const res = await fetch(`${HELIX}${path}${q.size ? `?${q}` : ""}`, { method: init?.method ?? "GET", headers: { "client-id": clientId(), authorization: `Bearer ${token}` } });
  const j = (await res.json().catch(() => null)) as { data?: T; message?: string } | null;
  if (res.status === 401) throw new TwitchError(401, "auth", "Twitch signed SOCIA out. Connect Twitch again.");
  if (res.status === 429) throw new TwitchError(429, "rate", "Twitch asked SOCIA to slow down. It tries again shortly.");
  if (!res.ok) {
    const msg = j?.message ?? "";
    if (res.status === 403) throw new TwitchError(403, "clips_off", /clip/i.test(msg) ? "This channel doesn't allow clips (clips are off, or only for followers or subscribers)." : msg || "Twitch refused that.");
    if (res.status === 404) throw new TwitchError(404, "not_live", "The channel isn't live.");
    throw new TwitchError(res.status, "failed", msg || `Twitch answered ${res.status}.`);
  }
  return { status: res.status, data: (j?.data ?? ([] as unknown)) as T };
}

export type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string };

/** Channels by login name ("xqc"), as Twitch users. Unknown names are left out. */
export async function usersByLogin(token: string, logins: string[]): Promise<TwitchUser[]> {
  if (!logins.length) return [];
  return (await helix<TwitchUser[]>(token, "/users", { query: { login: logins } })).data;
}

/** The person who connected. */
export async function me(token: string): Promise<TwitchUser> {
  const [u] = (await helix<TwitchUser[]>(token, "/users")).data;
  if (!u) throw new TwitchError(401, "auth", "Twitch didn't say who signed in. Connect Twitch again.");
  return u;
}

export type LiveStream = { user_id: string; user_login: string; title: string; game_name: string; viewer_count: number; started_at: string };

/** Which of these channels are live now. */
export async function liveStreams(token: string, userIds: string[]): Promise<LiveStream[]> {
  if (!userIds.length) return [];
  return (await helix<LiveStream[]>(token, "/streams", { query: { user_id: userIds, type: "live" } })).data;
}

/** Ask Twitch for a clip of the last moments of a live channel. Returns its id and edit link; the clip itself arrives a little later. */
export async function createClip(token: string, broadcasterId: string, durationSec = 30, title?: string): Promise<{ id: string; editUrl: string }> {
  const query: Record<string, string> = { broadcaster_id: broadcasterId, duration: String(Math.max(5, Math.min(60, Math.round(durationSec * 10) / 10))) };
  if (title) query.title = title.slice(0, 100);
  const { data } = await helix<{ id: string; edit_url: string }[]>(token, "/clips", { method: "POST", query });
  if (!data[0]?.id) throw new TwitchError(500, "failed", "Twitch didn't make the clip.");
  return { id: data[0].id, editUrl: data[0].edit_url };
}

export type TwitchClip = { id: string; url: string; embed_url: string; broadcaster_id: string; broadcaster_name: string; title: string; thumbnail_url: string; duration: number; created_at: string; view_count: number; vod_offset: number | null; video_id: string };

/** Clips by id; one Twitch hasn't finished making yet is simply missing. */
export async function clipsById(token: string, ids: string[]): Promise<TwitchClip[]> {
  if (!ids.length) return [];
  return (await helix<TwitchClip[]>(token, "/clips", { query: { id: ids.slice(0, 100) } })).data;
}

/**
 * Download links for clips on a channel the person owns or edits (Twitch
 * allows nobody else). Temporary links; null when Twitch gives none.
 */
export async function clipDownloads(token: string, editorId: string, broadcasterId: string, clipIds: string[]): Promise<{ clipId: string; landscape: string | null; portrait: string | null }[]> {
  if (!clipIds.length) return [];
  const { data } = await helix<{ clip_id: string; landscape_download_url: string | null; portrait_download_url: string | null }[]>(token, "/clips/downloads", { query: { editor_id: editorId, broadcaster_id: broadcasterId, clip_id: clipIds.slice(0, 10) } });
  return data.map((d) => ({ clipId: d.clip_id, landscape: d.landscape_download_url, portrait: d.portrait_download_url }));
}
