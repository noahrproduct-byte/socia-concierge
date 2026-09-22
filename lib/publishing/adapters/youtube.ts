// YouTube publisher behind the PublishAdapter contract. Server only.
//
// publish():  builds the video resource from YouTubeSettings, opens a resumable
//             upload session and hands the browser the session URI (the bytes
//             go browser -> YouTube; SOCIA's server never relays the file).
// complete(): the browser reports the video id; the id is confirmed to belong
//             to the connected channel, then the thumbnail and playlist are set
//             best-effort and the real upload state is returned.
// poll():     videos.list uploadStatus -> processing | published | scheduled | failed.
//
// Facts honoured (developers.google.com/youtube/v3, 2026-09-21): resumable start
// POST .../upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,recordingDetails;
// publishAt needs privacyStatus=private; thumbnails.set answers 403 for channels
// without custom thumbnails; uploads from an unaudited API project stay private.

import type { PublishAdapter, PublishContext, PublishOutcome } from "../adapter";
import type { YouTubePrivacy, YouTubeSettings } from "../types";
import { effectiveCaption } from "../validate";
import { YT_WRITE_SCOPES } from "../capabilities";
import { youtubeAccessToken, type YouTubeAccess } from "../../youtubeData";

const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const DATA = "https://www.googleapis.com/youtube/v3";

const fail = (message: string, code: string | null = null, retryable = false): PublishOutcome => ({
  status: "failed", errorCode: code, errorMessage: message, retryable,
});

export const RECONNECT_MESSAGE = "Reconnect YouTube to allow uploads.";

export const hasWriteScope = (scopes: string[] | null | undefined): boolean =>
  Array.isArray(scopes) && scopes.some((s) => YT_WRITE_SCOPES.includes(s));

// ---------------------------------------------------------------------------
// Pure builders (unit-tested)
// ---------------------------------------------------------------------------

export type VideoMetadata = {
  snippet: { title: string; description: string; tags?: string[]; categoryId?: string; defaultLanguage?: string };
  status: {
    privacyStatus: "public" | "unlisted" | "private";
    publishAt?: string;
    selfDeclaredMadeForKids?: boolean;
    containsSyntheticMedia: boolean;
    license: "youtube" | "creativeCommon";
    embeddable: boolean;
  };
  recordingDetails?: { recordingDate: string };
};

/**
 * The videos.insert body. A future scheduledAt makes the video private with
 * publishAt (YouTube's own scheduling); otherwise the chosen visibility is
 * sent. madeForKids null is left out rather than guessed (validation blocks
 * publishing before that happens).
 */
export function buildYouTubeMetadata(settings: YouTubeSettings, description: string, scheduledAt: string | null, now: Date): VideoMetadata {
  const at = scheduledAt ? new Date(scheduledAt) : null;
  const scheduled = at != null && !Number.isNaN(at.getTime()) && at.getTime() > now.getTime();
  const snippet: VideoMetadata["snippet"] = { title: settings.title.trim(), description };
  const tags = settings.tags.map((t) => t.trim()).filter(Boolean);
  if (tags.length) snippet.tags = tags;
  if (settings.categoryId) snippet.categoryId = settings.categoryId;
  if (settings.language) snippet.defaultLanguage = settings.language;
  const status: VideoMetadata["status"] = {
    privacyStatus: scheduled ? "private" : settings.privacy,
    containsSyntheticMedia: settings.syntheticMedia,
    license: settings.license,
    embeddable: settings.embeddable,
  };
  if (scheduled && at) status.publishAt = at.toISOString();
  if (settings.madeForKids != null) status.selfDeclaredMadeForKids = settings.madeForKids;
  const out: VideoMetadata = { snippet, status };
  if (settings.recordingDate) {
    const d = new Date(settings.recordingDate);
    if (!Number.isNaN(d.getTime())) out.recordingDetails = { recordingDate: d.toISOString() };
  }
  return out;
}

export type VideoResource = {
  id?: string;
  snippet?: { channelId?: string; title?: string };
  status?: {
    uploadStatus?: "uploaded" | "processed" | "failed" | "rejected" | "deleted" | string;
    failureReason?: string;
    rejectionReason?: string;
    privacyStatus?: "public" | "unlisted" | "private" | string;
    publishAt?: string;
  };
  processingDetails?: { processingStatus?: string; processingFailureReason?: string };
};

export const permalinkFor = (videoId: string) => `https://youtu.be/${videoId}`;

/** The note shown when YouTube's visibility is not the one chosen. Uploads from
 *  an API project Google has not audited stay private whatever was asked. */
export function privacyMismatchNote(actual: string, chosen: YouTubePrivacy): string {
  const first = `YouTube lists this video as ${actual}, not ${chosen}.`;
  return actual === "private" ? `${first} Until Google completes its audit of SOCIA, uploads stay private.` : first;
}

/** What a videos.list answer means for the destination. Never invents: an
 *  uploaded-but-unprocessed video stays processing. `chosenPrivacy` is the
 *  visibility the person asked for; a processed video whose visibility differs
 *  is still published, with a note saying what YouTube actually did. */
export function statusFromVideo(v: VideoResource, now: Date, chosenPrivacy: YouTubePrivacy | null = null): PublishOutcome {
  const id = v.id ?? null;
  const base = { externalPostId: id, permalink: id ? permalinkFor(id) : null, errorCode: null, errorMessage: null };
  const s = v.status ?? {};
  switch (s.uploadStatus) {
    case "failed":
      return fail(`YouTube could not process the upload (${s.failureReason ?? "no reason given"}).`, s.failureReason ?? "failed", false);
    case "rejected":
      return fail(`YouTube rejected the video (${s.rejectionReason ?? "no reason given"}).`, s.rejectionReason ?? "rejected", false);
    case "deleted":
      return fail("The video was deleted on YouTube.", "deleted", false);
    case "processed": {
      const publishAt = s.publishAt ? new Date(s.publishAt).getTime() : null;
      const pending = publishAt != null && !Number.isNaN(publishAt) && publishAt > now.getTime();
      if (pending && s.privacyStatus === "private") {
        return { status: "scheduled", ...base };
      }
      if (chosenPrivacy && s.privacyStatus && s.privacyStatus !== chosenPrivacy) {
        return { status: "published", ...base, errorMessage: privacyMismatchNote(s.privacyStatus, chosenPrivacy) };
      }
      if (!chosenPrivacy && publishAt != null && !Number.isNaN(publishAt) && !pending && s.privacyStatus === "private") {
        return { status: "published", ...base, errorMessage: "YouTube still lists this video as private." };
      }
      return { status: "published", ...base };
    }
    default:
      return { status: "processing", ...base };
  }
}

// ---------------------------------------------------------------------------
// Google HTTP helpers
// ---------------------------------------------------------------------------

type GoogleError = { error?: { code?: number; message?: string; errors?: { reason?: string; message?: string }[] } };

function describeGoogle(status: number, j: GoogleError | null): { code: string; message: string; retryable: boolean } {
  const reason = j?.error?.errors?.[0]?.reason;
  const message = j?.error?.message || j?.error?.errors?.[0]?.message || `YouTube returned ${status}.`;
  const retryable = status >= 500 || status === 429 || reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "backendError";
  return { code: reason ?? String(status), message, retryable };
}

async function google(url: string, token: string, init: RequestInit = {}): Promise<{ ok: true; status: number; json: Record<string, unknown> | null; headers: Headers } | { ok: false; status: number; error: ReturnType<typeof describeGoogle> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
      signal: init.signal ?? AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: { code: "network", message: e instanceof Error ? e.message : "YouTube could not be reached.", retryable: true } };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, status: res.status, error: describeGoogle(res.status, json as GoogleError | null) };
  return { ok: true, status: res.status, json, headers: res.headers };
}

const authFailure = (e: ReturnType<typeof describeGoogle>, status: number): PublishOutcome | null => {
  if (status === 401 || (status === 403 && (e.code === "authError" || e.code === "insufficientPermissions" || e.code === "forbidden"))) {
    return fail(`${RECONNECT_MESSAGE} YouTube said: ${e.message}`, e.code, false);
  }
  return null;
};

async function resolve(ctx: PublishContext): Promise<{ auth: YouTubeAccess } | { failure: PublishOutcome }> {
  const auth = await youtubeAccessToken(ctx.supabase, ctx.userId);
  if (!auth) return { failure: fail("YouTube is not connected to SOCIA, or the channel is paused by your plan.", "no_connection") };
  if (auth.channelId && auth.channelId !== ctx.destination.accountId) {
    return { failure: fail("The connected YouTube channel is not the one this post was created for.", "channel_mismatch") };
  }
  if (!hasWriteScope(auth.scopes)) return { failure: fail(RECONNECT_MESSAGE, "needs_scope") };
  return { auth };
}

async function videoById(token: string, id: string): Promise<{ video: VideoResource | null } | { failure: PublishOutcome }> {
  const r = await google(`${DATA}/videos?part=status,snippet,processingDetails&id=${encodeURIComponent(id)}`, token);
  if (!r.ok) return { failure: authFailure(r.error, r.status) ?? fail(r.error.message, r.error.code, r.error.retryable) };
  const items = (r.json?.items as VideoResource[] | undefined) ?? [];
  return { video: items[0] ?? null };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Headers for opening a resumable session. The byte count is sent only when
 * it is known; a legacy item with no recorded size must not announce "0".
 */
export function resumableStartHeaders(media: { mime: string; size: number | null }): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json; charset=UTF-8",
    "x-upload-content-type": media.mime || "video/*",
  };
  if (typeof media.size === "number" && Number.isFinite(media.size) && media.size > 0) h["x-upload-content-length"] = String(Math.floor(media.size));
  return h;
}

async function publish(ctx: PublishContext): Promise<PublishOutcome> {
  // A destination that already holds a video id was uploaded; never open another session for it.
  if (ctx.destination.externalPostId) return poll(ctx);
  if (!ctx.interactive) return fail("A YouTube upload needs the browser that started it. Open the post and publish it again.", "needs_browser", false);
  const r = await resolve(ctx);
  if ("failure" in r) return r.failure;
  const { token } = r.auth;
  const media = ctx.item.media[0];
  if (!media) return fail("Add a video before publishing to YouTube.", "media_missing");
  if (media.kind !== "video") return fail("YouTube needs a video file.", "media_kind");
  if (ctx.item.media.length > 1) return fail("YouTube takes one video per post.", "media_count");

  const settings = ctx.destination.settings as YouTubeSettings;
  const description = effectiveCaption("youtube", ctx.item.caption, settings);
  const metadata = buildYouTubeMetadata(settings, description, ctx.destination.scheduledAt, ctx.now);

  const u = new URL(`${UPLOAD}/videos`);
  u.searchParams.set("uploadType", "resumable");
  u.searchParams.set("part", "snippet,status,recordingDetails");
  u.searchParams.set("notifySubscribers", settings.notifySubscribers ? "true" : "false");
  const start = await google(u.toString(), token, {
    method: "POST",
    headers: resumableStartHeaders(media),
    body: JSON.stringify(metadata),
  });
  if (!start.ok) return authFailure(start.error, start.status) ?? fail(start.error.message, start.error.code, start.error.retryable);
  const sessionUri = start.headers.get("location");
  if (!sessionUri) return fail("YouTube did not return an upload session.", "no_session", true);

  return {
    status: "uploading",
    errorCode: null,
    errorMessage: null,
    clientAction: { kind: "youtube_resumable_upload", sessionUri, accessToken: token, mediaId: media.id, videoId: null },
  };
}

// ---------------------------------------------------------------------------
// Thumbnail: fetched server-side, only ever from this project's own storage
// ---------------------------------------------------------------------------

export const THUMBNAIL_LIMIT_BYTES = 50 * 1024 * 1024;
const MEDIA_BUCKET = "scheduled-media";

/** Origin of the project's Supabase storage, or null when the env is not set. */
export function storageOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try { return new URL(raw).origin; } catch { return null; }
}

/**
 * The URL the server may fetch a stored media object from: rebuilt from the
 * object's path through the public-object pattern, or the stored URL when its
 * origin is the project's storage. Anything else (a foreign host, no env) is
 * null and is never fetched. Pure, unit-tested.
 */
export function storageFetchUrl(media: { path: string | null; url: string | null }, origin: string | null): string | null {
  if (!origin) return null;
  if (media.path) {
    const segments = media.path.split("/").filter(Boolean).map(encodeURIComponent);
    if (segments.length) return `${origin}/storage/v1/object/public/${MEDIA_BUCKET}/${segments.join("/")}`;
  }
  if (media.url) {
    try {
      const u = new URL(media.url);
      if (u.origin === origin && u.pathname.startsWith("/storage/v1/object/public/")) return u.toString();
    } catch { /* not a URL */ }
  }
  return null;
}

/**
 * Download a response body up to `limit` bytes. The declared content-length is
 * checked first; a missing one is checked while streaming. Returns null when
 * the body is over the limit. Never relies on a client-supplied size.
 */
export async function readBodyWithin(res: Response, limit: number): Promise<ArrayBuffer | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    return buf.byteLength > limit ? null : buf;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const buffer = new ArrayBuffer(total);
  const out = new Uint8Array(buffer);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return buffer;
}

async function setThumbnail(ctx: PublishContext, token: string, videoId: string, settings: YouTubeSettings): Promise<string | null> {
  if (!settings.thumbnailMediaId) return null;
  const img = ctx.item.media.find((m) => m.id === settings.thumbnailMediaId);
  if (!img || img.kind !== "image" || (!img.path && !img.url)) return "The chosen thumbnail image was not uploaded, so YouTube kept its own.";
  const src = storageFetchUrl(img, storageOrigin());
  if (!src) return "The thumbnail image is not in SOCIA's storage, so YouTube kept its own.";
  let bytes: ArrayBuffer;
  let type = img.mime || "image/jpeg";
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!res.ok) return "The thumbnail image could not be fetched, so YouTube kept its own.";
    type = res.headers.get("content-type") || type;
    const body = await readBodyWithin(res, THUMBNAIL_LIMIT_BYTES);
    if (!body) return "The thumbnail is over YouTube's 50 MB limit, so YouTube kept its own.";
    bytes = body;
  } catch {
    return "The thumbnail image could not be fetched, so YouTube kept its own.";
  }
  const r = await google(`${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, token, {
    method: "POST", headers: { "content-type": type }, body: bytes, signal: AbortSignal.timeout(60000),
  });
  if (r.ok) return null;
  if (r.status === 403) return "YouTube kept its own thumbnail (custom thumbnails are not enabled for this channel).";
  return `YouTube kept its own thumbnail. YouTube said: ${r.error.message}`;
}

async function addToPlaylist(token: string, videoId: string, playlistId: string | null): Promise<string | null> {
  if (!playlistId) return null;
  const r = await google(`${DATA}/playlistItems?part=snippet`, token, {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
  });
  if (r.ok) return null;
  return `The video was not added to the playlist. YouTube said: ${r.error.message}`;
}

async function complete(ctx: PublishContext, body: { externalPostId: string }): Promise<PublishOutcome> {
  const r = await resolve(ctx);
  if ("failure" in r) return r.failure;
  const { token, channelId } = r.auth;
  const id = (body.externalPostId ?? "").trim();
  if (!id) return fail("The browser did not report a video id.", "no_video_id", true);

  const v = await videoById(token, id);
  // The upload happened; a confirmation that could not be read (network, 5xx,
  // auth) keeps the id on the row so a later poll finds the video instead of
  // a fresh upload. Only "no such video" and "not this channel" stay id-less.
  if ("failure" in v) return { ...v.failure, externalPostId: id };
  if (!v.video) return fail("YouTube has no video with that id.", "not_found", false);
  if (channelId && v.video.snippet?.channelId !== channelId) return fail("That video does not belong to the connected channel.", "channel_mismatch", false);

  const settings = ctx.destination.settings as YouTubeSettings;
  const notes = [await setThumbnail(ctx, token, id, settings), await addToPlaylist(token, id, settings.playlistId)].filter((n): n is string => Boolean(n));

  const outcome = statusFromVideo({ ...v.video, id }, ctx.now, settings.privacy);
  if (outcome.status === "failed") return { ...outcome, externalPostId: id };
  const joined = [outcome.errorMessage, ...notes].filter(Boolean).join(" ");
  return { ...outcome, externalPostId: id, permalink: permalinkFor(id), errorMessage: joined || null };
}

async function poll(ctx: PublishContext): Promise<PublishOutcome> {
  const id = ctx.destination.externalPostId;
  // No id yet: the browser is still uploading (or never finished). Nothing to ask YouTube.
  if (!id) return { status: ctx.destination.status === "uploading" ? "uploading" : "processing", errorCode: null, errorMessage: null };
  const r = await resolve(ctx);
  if ("failure" in r) return r.failure;
  const v = await videoById(r.auth.token, id);
  if ("failure" in v) return v.failure;
  if (!v.video) return fail("YouTube has no video with that id.", "not_found", false);
  const settings = ctx.destination.settings as YouTubeSettings;
  const outcome = statusFromVideo({ ...v.video, id }, ctx.now, settings.privacy);
  return { ...outcome, externalPostId: id, permalink: permalinkFor(id) };
}

export const youtubeAdapter: PublishAdapter = { platform: "youtube", publish, poll, complete };
