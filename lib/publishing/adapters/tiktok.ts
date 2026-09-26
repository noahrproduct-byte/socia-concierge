// TikTok publisher behind the PublishAdapter contract. Server only.
//
// Content Posting API (developers.tiktok.com/doc/content-posting-api-*, 2026-09):
//   inbox  : POST /v2/post/publish/inbox/video/init/   (scope video.upload)
//            The video lands in the creator's TikTok inbox as a draft; they add
//            the caption/settings and post from the TikTok app.
//   direct : POST /v2/post/publish/video/init/         (scope video.publish)
//            Posts straight to the profile with post_info. Unaudited apps may
//            only post SELF_ONLY (private) until TikTok's audit completes.
//   status : POST /v2/post/publish/status/fetch/       { publish_id }
//   creator: POST /v2/post/publish/creator_info/query/ (privacy options, max duration)
//
// Bytes go storage -> SOCIA server -> TikTok's upload_url, one chunk at a time
// (Range reads from Supabase storage, so the whole file is never in memory).
// The publish_id is kept in external_container_id; the public video id (direct
// posts only) becomes external_post_id when TikTok reports PUBLISH_COMPLETE.

import type { PublishAdapter, PublishContext, PublishOutcome } from "../adapter";
import type { MediaItem, TikTokSettings } from "../types";
import { effectiveCaption } from "../validate";
import { TT_PUBLISH_SCOPE, TT_UPLOAD_SCOPE } from "../capabilities";
import { storageFetchUrl, storageOrigin } from "./youtube";
import { TT_API } from "../../tiktokAuth";
import { tiktokAccessToken, type TikTokAccess } from "../../tiktokData";

const MB = 1024 * 1024;
export const MIN_CHUNK = 5 * MB;
export const MAX_CHUNK = 64 * MB;

const fail = (message: string, code: string | null = null, retryable = false): PublishOutcome => ({
  status: "failed", errorCode: code, errorMessage: message, retryable,
});

export const RECONNECT_MESSAGE = "Reconnect TikTok to allow uploads.";
export const INBOX_NOTE = "Sent to your TikTok inbox. Open the TikTok app, finish the caption and settings, and post.";

export const canUpload = (scopes: string[] | null | undefined): boolean =>
  !Array.isArray(scopes) || scopes.includes(TT_UPLOAD_SCOPE) || scopes.includes(TT_PUBLISH_SCOPE);
export const canPublishDirect = (scopes: string[] | null | undefined): boolean =>
  Array.isArray(scopes) && scopes.includes(TT_PUBLISH_SCOPE);

// ---------------------------------------------------------------------------
// Pure builders (unit-tested)
// ---------------------------------------------------------------------------

export type ChunkPlan = { videoSize: number; chunkSize: number; totalChunks: number };

/**
 * TikTok's chunking rules: 5–64 MB per chunk, total_chunk_count =
 * floor(size / chunk_size), the final chunk absorbs the remainder (and may
 * therefore run up to 128 MB). Files under 5 MB go up whole as one chunk.
 */
export function planChunks(videoSize: number): ChunkPlan {
  if (videoSize <= MIN_CHUNK) return { videoSize, chunkSize: videoSize, totalChunks: 1 };
  const chunkSize = Math.min(MAX_CHUNK, videoSize);
  const totalChunks = Math.max(1, Math.floor(videoSize / chunkSize));
  return { videoSize, chunkSize, totalChunks };
}

/** Byte ranges for chunk i (0-based); the last one runs to the end of the file. */
export function chunkRange(plan: ChunkPlan, i: number): { start: number; end: number } {
  const start = i * plan.chunkSize;
  const end = i === plan.totalChunks - 1 ? plan.videoSize - 1 : start + plan.chunkSize - 1;
  return { start, end };
}

export type PostInfo = {
  title: string;
  privacy_level: string;
  disable_duet: boolean;
  disable_comment: boolean;
  disable_stitch: boolean;
  video_cover_timestamp_ms?: number;
  brand_content_toggle: boolean;
  brand_organic_toggle: boolean;
  is_aigc: boolean;
};

/** post_info for a direct post. `title` is TikTok's name for the caption (2200 chars). */
export function buildPostInfo(settings: TikTokSettings, caption: string, privacyLevel: string): PostInfo {
  const out: PostInfo = {
    title: caption.slice(0, 2200),
    privacy_level: privacyLevel,
    disable_duet: !settings.allowDuet,
    disable_comment: !settings.allowComments,
    disable_stitch: !settings.allowStitch,
    brand_content_toggle: settings.brandContent,
    brand_organic_toggle: settings.brandOrganic,
    is_aigc: settings.aiGenerated,
  };
  if (settings.coverTimestampMs != null && settings.coverTimestampMs >= 0) out.video_cover_timestamp_ms = Math.floor(settings.coverTimestampMs);
  return out;
}

export type PublishStatus = {
  status?: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED" | string;
  fail_reason?: string;
  publicaly_available_post_id?: (string | number)[];
  uploaded_bytes?: number;
};

export const permalinkFor = (username: string | null, videoId: string) =>
  username ? `https://www.tiktok.com/@${username.replace(/^@/, "")}/video/${videoId}` : null;

/** What a status/fetch answer means for the destination. Never invents. */
export function statusFromFetch(s: PublishStatus, publishId: string, direct: boolean, username: string | null): PublishOutcome {
  const base = { externalContainerId: publishId, errorCode: null, errorMessage: null };
  switch (s.status) {
    case "FAILED":
      return { ...fail(describeFailReason(s.fail_reason), s.fail_reason ?? "failed", false), externalContainerId: publishId };
    case "PUBLISH_COMPLETE": {
      const id = s.publicaly_available_post_id?.[0];
      const videoId = id != null ? String(id) : null;
      return { status: "published", ...base, externalPostId: videoId, permalink: videoId ? permalinkFor(username, videoId) : null };
    }
    case "SEND_TO_USER_INBOX":
      // Terminal for the inbox flow: TikTok has the video; the creator posts it in the app.
      return { status: "published", ...base, externalPostId: null, permalink: null, errorMessage: direct ? null : INBOX_NOTE };
    default:
      return { status: "processing", ...base };
  }
}

const FAIL_REASONS: Record<string, string> = {
  file_format_check_failed: "TikTok could not read the video file (unsupported format or codec).",
  duration_check_failed: "The video is outside the length TikTok allows for this account.",
  frame_rate_check_failed: "The video's frame rate is outside 23–60 fps.",
  picture_size_check_failed: "The video's resolution is outside what TikTok accepts (360–4096 px).",
  video_pull_failed: "TikTok could not download the video.",
  publish_cancelled: "The post was cancelled in the TikTok app.",
  auth_removed: "TikTok access was removed. Reconnect TikTok and try again.",
  spam_risk_too_many_posts: "TikTok's daily posting limit for this account was reached.",
  spam_risk_user_banned_from_posting: "TikTok is not allowing this account to post right now.",
  spam_risk_text: "TikTok flagged the caption as spam.",
  spam_risk: "TikTok flagged the post as spam.",
  internal: "TikTok had an internal error. Try again later.",
};

export function describeFailReason(reason: string | undefined): string {
  if (!reason) return "TikTok could not process the video (no reason given).";
  return FAIL_REASONS[reason] ?? `TikTok could not process the video (${reason}).`;
}

// ---------------------------------------------------------------------------
// TikTok HTTP helpers
// ---------------------------------------------------------------------------

type Envelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

function describeError(status: number, code: string | undefined, message: string | undefined): { code: string; message: string; retryable: boolean } {
  const c = code ?? String(status);
  const known: Record<string, string> = {
    access_token_invalid: "TikTok no longer accepts SOCIA's access. Reconnect TikTok.",
    scope_not_authorized: "The TikTok connection does not include posting permission. Reconnect TikTok.",
    rate_limit_exceeded: "TikTok's rate limit was hit. It will be retried.",
    spam_risk_too_many_posts: "TikTok's daily posting limit for this account was reached.",
    spam_risk_user_banned_from_posting: "TikTok is not allowing this account to post right now.",
    reached_active_user_cap: "SOCIA has reached TikTok's cap of creators for an unaudited app. Try again later.",
    unaudited_client_can_only_post_to_private_accounts: "Until TikTok completes its audit of SOCIA, direct posts must be private (Only me). Change the visibility or use inbox upload.",
    privacy_level_option_mismatch: "That visibility is not available for this TikTok account.",
    url_ownership_unverified: "TikTok could not verify the video's source.",
  };
  const retryable = status >= 500 || status === 429 || c === "rate_limit_exceeded" || c === "internal_error";
  return { code: c, message: known[c] ?? message ?? `TikTok returned ${status}.`, retryable };
}

async function tiktok<T>(path: string, token: string, body: unknown, timeoutMs = 20000): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ReturnType<typeof describeError> }> {
  let res: Response;
  try {
    res = await fetch(`${TT_API}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: { code: "network", message: e instanceof Error ? e.message : "TikTok could not be reached.", retryable: true } };
  }
  const j = parseTikTokJson<T>(await res.text().catch(() => ""));
  const code = j?.error?.code;
  if (!res.ok || (code && code !== "ok")) return { ok: false, status: res.status, error: describeError(res.status, code, j?.error?.message) };
  return { ok: true, data: (j?.data ?? {}) as T };
}

/**
 * TikTok documents publicaly_available_post_id as int64. JSON.parse would round
 * a 19-digit id to the nearest double, so those numbers are quoted before
 * parsing and arrive as exact strings. Pure, unit-tested.
 */
export function parseTikTokJson<T>(text: string): Envelope<T> | null {
  if (!text) return null;
  const quoted = text.replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)(\])/g, (_m, open: string, inner: string, close: string) =>
    `${open}${inner.replace(/(^|,)(\s*)(\d{1,20})(?=\s*(,|$))/g, '$1$2"$3"')}${close}`);
  try { return JSON.parse(quoted) as Envelope<T>; } catch { return null; }
}

const authFailure = (e: ReturnType<typeof describeError>, status: number): PublishOutcome | null => {
  if (status === 401 || e.code === "access_token_invalid" || e.code === "scope_not_authorized") {
    return fail(`${RECONNECT_MESSAGE} TikTok said: ${e.message}`, e.code, false);
  }
  return null;
};

type Resolved = { auth: TikTokAccess; username: string | null; direct: boolean };

async function resolve(ctx: PublishContext): Promise<{ r: Resolved } | { failure: PublishOutcome }> {
  const auth = await tiktokAccessToken(ctx.supabase, ctx.userId);
  if (!auth) return { failure: fail("TikTok is not connected to SOCIA, or the account is paused by your plan.", "no_connection") };
  if (auth.openId && auth.openId !== ctx.destination.accountId) {
    return { failure: fail("The connected TikTok account is not the one this post was created for.", "account_mismatch") };
  }
  if (!canUpload(auth.scopes)) return { failure: fail(RECONNECT_MESSAGE, "needs_scope") };
  let username: string | null = null;
  try {
    const { data } = await ctx.supabase.from("tiktok_connections").select("username").eq("user_id", ctx.userId).maybeSingle();
    username = (data as { username?: string | null } | null)?.username ?? null;
  } catch { /* cosmetic */ }
  return { r: { auth, username, direct: canPublishDirect(auth.scopes) } };
}

type CreatorInfo = {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

// ---------------------------------------------------------------------------
// Upload: storage -> server -> TikTok, one chunk at a time
// ---------------------------------------------------------------------------

async function uploadChunks(media: MediaItem, plan: ChunkPlan, uploadUrl: string): Promise<PublishOutcome | null> {
  const src = storageFetchUrl(media, storageOrigin());
  if (!src) return fail("The video is not in SOCIA's storage, so it could not be sent to TikTok.", "media_source", false);
  const mime = media.mime || "video/mp4";
  for (let i = 0; i < plan.totalChunks; i++) {
    const { start, end } = chunkRange(plan, i);
    let bytes: ArrayBuffer;
    try {
      const res = await fetch(src, { headers: { range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(60000), cache: "no-store" });
      if (!res.ok) return fail("The video could not be read from storage.", "media_fetch", true);
      bytes = await res.arrayBuffer();
      // A server that ignores Range returns the whole object; slice it down.
      if (res.status === 200 && bytes.byteLength > end - start + 1) bytes = bytes.slice(start, end + 1);
    } catch {
      return fail("The video could not be read from storage.", "media_fetch", true);
    }
    if (bytes.byteLength !== end - start + 1) return fail("The stored video is not the size SOCIA recorded. Re-upload it and try again.", "media_size", false);
    let put: Response;
    try {
      put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": mime,
          "content-length": String(bytes.byteLength),
          "content-range": `bytes ${start}-${end}/${plan.videoSize}`,
        },
        body: bytes,
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      return fail(e instanceof Error ? `TikTok upload failed: ${e.message}` : "TikTok upload failed.", "upload_network", true);
    }
    // 206 = partial accepted, 201 = final chunk accepted.
    if (put.status !== 201 && put.status !== 206 && !put.ok) {
      const text = await put.text().catch(() => "");
      return fail(`TikTok rejected the upload (${put.status}).${text ? ` ${text.slice(0, 200)}` : ""}`, `upload_${put.status}`, put.status >= 500);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

async function publish(ctx: PublishContext): Promise<PublishOutcome> {
  // A destination that already holds a publish_id was uploaded; never start another.
  if (ctx.destination.externalContainerId) return poll(ctx);
  const res = await resolve(ctx);
  if ("failure" in res) return res.failure;
  const { auth, username, direct } = res.r;
  const media = ctx.item.media[0];
  if (!media) return fail("Add a video before publishing to TikTok.", "media_missing");
  if (media.kind !== "video") return fail("TikTok needs a video file.", "media_kind");
  if (ctx.item.media.length > 1) return fail("TikTok takes one video per post.", "media_count");
  if (typeof media.size !== "number" || !Number.isFinite(media.size) || media.size <= 0) {
    return fail("The video's size was not recorded. Re-upload it and try again.", "media_size", false);
  }
  const plan = planChunks(Math.floor(media.size));
  const source_info = { source: "FILE_UPLOAD", video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunks };
  const settings = ctx.destination.settings as TikTokSettings;

  let init: { ok: true; data: { publish_id?: string; upload_url?: string } } | { ok: false; status: number; error: ReturnType<typeof describeError> };
  if (direct) {
    // TikTok requires creator_info before every direct post: the privacy options
    // and limits are per creator and the chosen values must come from them.
    const ci = await tiktok<CreatorInfo>("/post/publish/creator_info/query/", auth.token, {});
    if (!ci.ok) return authFailure(ci.error, ci.status) ?? fail(ci.error.message, ci.error.code, ci.error.retryable);
    const options = ci.data.privacy_level_options ?? [];
    const privacy = settings.privacy && options.includes(settings.privacy) ? settings.privacy : null;
    if (!privacy) return fail(options.length ? `Choose who can see this video on TikTok (${options.map(humanPrivacy).join(", ")}).` : "TikTok did not offer any visibility for this account.", "privacy_unset", false);
    const maxSec = ci.data.max_video_post_duration_sec;
    if (maxSec != null && media.duration != null && media.duration > maxSec) return fail(`This TikTok account can post videos up to ${Math.floor(maxSec / 60)} minutes long.`, "duration", false);
    const caption = effectiveCaption("tiktok", ctx.item.caption, settings);
    init = await tiktok("/post/publish/video/init/", auth.token, { post_info: buildPostInfo(settings, caption, privacy), source_info });
  } else {
    init = await tiktok("/post/publish/inbox/video/init/", auth.token, { source_info });
  }
  if (!init.ok) return authFailure(init.error, init.status) ?? fail(init.error.message, init.error.code, init.error.retryable);
  const publishId = init.data.publish_id;
  const uploadUrl = init.data.upload_url;
  if (!publishId || !uploadUrl) return fail("TikTok did not return an upload session.", "no_session", true);

  const up = await uploadChunks(media, plan, uploadUrl);
  // The session exists either way; keep its id so a retry polls instead of re-initialising.
  if (up) return { ...up, externalContainerId: publishId };

  // Bytes are in. TikTok now processes; the first status read is usually immediate.
  const st = await tiktok<PublishStatus>("/post/publish/status/fetch/", auth.token, { publish_id: publishId });
  if (!st.ok) return { status: "processing", externalContainerId: publishId, errorCode: null, errorMessage: null };
  return statusFromFetch(st.data, publishId, direct, username);
}

async function poll(ctx: PublishContext): Promise<PublishOutcome> {
  const publishId = ctx.destination.externalContainerId;
  if (!publishId) return { status: ctx.destination.status === "uploading" ? "uploading" : "processing", errorCode: null, errorMessage: null };
  const res = await resolve(ctx);
  if ("failure" in res) return res.failure;
  const st = await tiktok<PublishStatus>("/post/publish/status/fetch/", res.r.auth.token, { publish_id: publishId });
  if (!st.ok) return authFailure(st.error, st.status) ?? fail(st.error.message, st.error.code, st.error.retryable);
  return statusFromFetch(st.data, publishId, res.r.direct, res.r.username);
}

export function humanPrivacy(level: string): string {
  switch (level) {
    case "PUBLIC_TO_EVERYONE": return "Everyone";
    case "MUTUAL_FOLLOW_FRIENDS": return "Friends";
    case "FOLLOWER_OF_CREATOR": return "Followers";
    case "SELF_ONLY": return "Only me";
    default: return level;
  }
}

export const tiktokAdapter: PublishAdapter = { platform: "tiktok", publish, poll };
