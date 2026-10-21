// The platform calls that delete a post, one per platform, and the pure
// mapping of each platform's error shape to something SOCIA can act on.
// Every function answers a typed PlatformAnswer; nothing throws a raw fetch
// error up to a route, and a token never appears in a message or a log.
//
// Server only (fetch); the describe* functions are pure and unit-tested.

import { FB_GRAPH_V } from "../facebook";

const GRAPH = `https://graph.facebook.com/${FB_GRAPH_V}`;
/** Instagram API with Instagram Login: the API SOCIA publishes and syncs with. */
const IG_GRAPH = "https://graph.instagram.com/v23.0";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const TIMEOUT_MS = 20_000;

export type PlatformAnswer =
  | { ok: true; gone: boolean; response: Record<string, unknown> }
  /**
   * not_found: the platform said the object does not exist. Meta gives that
   * same answer for a wrong id or a token that cannot see the object, so it
   * is NOT proof of deletion: service.ts confirms with a read (exists*)
   * before anything is marked deleted.
   */
  | { ok: false; code: string | null; message: string; kind: "permission" | "expired" | "transient" | "final" | "not_found" };

type MetaError = { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };

const META_TRANSIENT = [1, 2, 4, 17, 32, 341, 613];
const META_PERMISSION = [3, 10, 200];
const GONE_RE = /does not exist|unsupported (get|delete) request|cannot be loaded due to missing permissions/i;

const metaLabel = (platform: "instagram" | "facebook") => (platform === "instagram" ? "Instagram" : "Facebook");

/** What Meta's Graph API answered, in SOCIA's terms. Pure. */
export function describeMetaError(status: number, body: unknown, platform: "instagram" | "facebook" = "instagram"): PlatformAnswer {
  const err = (body && typeof body === "object" ? (body as { error?: MetaError }).error : null) ?? null;
  const code = typeof err?.code === "number" ? err.code : null;
  const message = typeof err?.message === "string" ? err.message : "";
  const name = metaLabel(platform);
  if (code === 190) {
    return { ok: false, code: "190", message: "Facebook's access token has expired. Reconnect Facebook to delete from SOCIA.", kind: "expired" };
  }
  if (code != null && META_PERMISSION.includes(code)) {
    const what = platform === "instagram" ? "the Instagram content permission" : "the permission to delete this";
    return { ok: false, code: String(code), message: `Facebook has not granted SOCIA ${what}. Reconnect Facebook, or delete it in the app.`, kind: "permission" };
  }
  if (code === 100 && GONE_RE.test(message)) {
    return { ok: false, code: "100", message: `${name} said: ${message.slice(0, 300)}`, kind: "not_found" };
  }
  if ((code != null && META_TRANSIENT.includes(code)) || status >= 500) {
    return { ok: false, code: code != null ? String(code) : String(status), message: `${name} could not process the request just now. Try again in a few minutes.`, kind: "transient" };
  }
  const said = message || `HTTP ${status}`;
  return { ok: false, code: code != null ? String(code) : String(status), message: `${name} said: ${said}`, kind: "final" };
}

type GoogleError = { code?: number; message?: string; errors?: { reason?: string; message?: string; domain?: string }[] };

/** What the YouTube Data API answered, in SOCIA's terms. Pure. */
export function describeGoogleError(status: number, body: unknown): PlatformAnswer {
  if (status === 204 || status === 200) return { ok: true, gone: false, response: { status } };
  const err = (body && typeof body === "object" ? (body as { error?: GoogleError }).error : null) ?? null;
  const reasons = (err?.errors ?? []).map((e) => e.reason ?? "").filter(Boolean);
  const message = typeof err?.message === "string" ? err.message : "";
  if (status === 404 || reasons.includes("videoNotFound")) {
    return { ok: false, code: reasons[0] ?? "videoNotFound", message: `YouTube said: ${message || "video not found"}`, kind: "not_found" };
  }
  if (status === 401 || reasons.includes("authError")) {
    return { ok: false, code: reasons[0] ?? "401", message: "YouTube's access has expired. Reconnect YouTube to delete from SOCIA, or delete it on YouTube.", kind: "expired" };
  }
  if (status === 403 && (reasons.includes("insufficientPermissions") || reasons.includes("insufficientScope"))) {
    return { ok: false, code: reasons[0] ?? "403", message: "Reconnect YouTube with the broader permission (Settings, Enable uploads) to delete videos from SOCIA. Until then, delete it on YouTube.", kind: "permission" };
  }
  if (status === 403 && reasons.includes("forbidden")) {
    return { ok: false, code: "forbidden", message: "YouTube says this channel may not delete that video.", kind: "final" };
  }
  if (status >= 500 || reasons.includes("backendError") || reasons.includes("quotaExceeded")) {
    return { ok: false, code: reasons[0] ?? String(status), message: "YouTube could not process the request just now. Try again in a few minutes.", kind: "transient" };
  }
  return { ok: false, code: reasons[0] ?? String(status), message: `YouTube said: ${message || `HTTP ${status}`}`, kind: "final" };
}

/** A network failure or an unreadable answer; the token is never part of it. */
const unreachable = (name: string): PlatformAnswer => ({ ok: false, code: null, message: `${name} did not answer. Try again in a few minutes.`, kind: "transient" });

async function metaDelete(objectId: string, token: string, platform: "instagram" | "facebook"): Promise<PlatformAnswer> {
  const u = new URL(`${GRAPH}/${encodeURIComponent(objectId)}`);
  u.searchParams.set("access_token", token);
  let res: Response;
  let body: unknown = null;
  try {
    res = await fetch(u, { method: "DELETE", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    body = await res.json().catch(() => null);
  } catch {
    return unreachable(metaLabel(platform));
  }
  if (res.ok && body && typeof body === "object" && !(body as { error?: unknown }).error) {
    const b = body as Record<string, unknown>;
    if (b.success === false) return { ok: false, code: null, message: `${metaLabel(platform)} did not confirm the deletion.`, kind: "final" };
    return { ok: true, gone: false, response: { success: b.success ?? true, ...(b.deleted_id ? { deleted_id: String(b.deleted_id) } : {}) } };
  }
  return describeMetaError(res.status, body, platform);
}

/** DELETE /{ig-media-id} with the Facebook USER token (Instagram API with Facebook Login). */
export function deleteInstagramMedia(mediaId: string, facebookUserToken: string): Promise<PlatformAnswer> {
  return metaDelete(mediaId, facebookUserToken, "instagram");
}

/** DELETE /{post-id} with the Page token (Pages API). */
export function deleteFacebookPost(postId: string, pageToken: string): Promise<PlatformAnswer> {
  return metaDelete(postId, pageToken, "facebook");
}

/** videos.delete (50 quota units). 204 means deleted. */
export async function deleteYouTubeVideo(videoId: string, accessToken: string): Promise<PlatformAnswer> {
  const u = new URL(YT_VIDEOS);
  u.searchParams.set("id", videoId);
  let res: Response;
  let body: unknown = null;
  try {
    res = await fetch(u, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (res.status !== 204) body = await res.json().catch(() => null);
  } catch {
    return unreachable("YouTube");
  }
  return describeGoogleError(res.status, body);
}



// ---------------------------------------------------------------------------
// Existence checks: run only after a "not_found" answer, so SOCIA marks a post
// deleted only when a second, independent read agrees it is gone.
// true = still there, false = gone, null = could not tell (nothing is marked).
// ---------------------------------------------------------------------------

async function graphExists(base: string, objectId: string, token: string): Promise<boolean | null> {
  const u = new URL(`${base}/${encodeURIComponent(objectId)}`);
  u.searchParams.set("fields", "id");
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { id?: string; error?: MetaError } | null;
    if (res.ok && body?.id) return true;
    if (body?.error?.code === 100 && GONE_RE.test(body.error.message ?? "")) return false;
    return null;
  } catch {
    return null;
  }
}

/** Read the media with the Instagram Login token, the API that listed it in the first place. */
export function instagramMediaExists(mediaId: string, instagramLoginToken: string): Promise<boolean | null> {
  return graphExists(IG_GRAPH, mediaId, instagramLoginToken);
}

/** Read the Page post or video with the Page token. */
export function facebookObjectExists(objectId: string, pageToken: string): Promise<boolean | null> {
  return graphExists(GRAPH, objectId, pageToken);
}

/** videos.list for one id (1 quota unit). */
export async function youtubeVideoExists(videoId: string, accessToken: string): Promise<boolean | null> {
  const u = new URL(YT_VIDEOS);
  u.searchParams.set("part", "id");
  u.searchParams.set("id", videoId);
  try {
    const res = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
    if (!body || !Array.isArray(body.items)) return null;
    return body.items.length > 0;
  } catch {
    return null;
  }
}

/**
 * Which channel a video is on (videos.list, 1 quota unit): the channel id,
 * false when YouTube has no such video, null when it could not tell.
 */
export async function youtubeVideoChannel(videoId: string, accessToken: string): Promise<string | false | null> {
  const u = new URL(YT_VIDEOS);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("id", videoId);
  try {
    const res = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { items?: { snippet?: { channelId?: string } }[] } | null;
    if (!body || !Array.isArray(body.items)) return null;
    if (!body.items.length) return false;
    return body.items[0]?.snippet?.channelId ?? null;
  } catch {
    return null;
  }
}

export type Deleters = {
  deleteInstagramMedia: typeof deleteInstagramMedia;
  deleteFacebookPost: typeof deleteFacebookPost;
  deleteYouTubeVideo: typeof deleteYouTubeVideo;
  instagramMediaExists: typeof instagramMediaExists;
  facebookObjectExists: typeof facebookObjectExists;
  youtubeVideoExists: typeof youtubeVideoExists;
  youtubeVideoChannel: typeof youtubeVideoChannel;
};

export const deleters: Deleters = { deleteInstagramMedia, deleteFacebookPost, deleteYouTubeVideo, instagramMediaExists, facebookObjectExists, youtubeVideoExists, youtubeVideoChannel };
