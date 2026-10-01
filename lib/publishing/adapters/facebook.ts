// Facebook Page publisher behind the PublishAdapter contract. Server only.
//
// Facebook publishes synchronously from a public media URL, so publish() does
// the whole thing and returns a terminal status — there is no container to poll
// like Instagram. The three shapes the Page feed supports:
//   text         POST /{page}/feed        { message }
//   one photo    POST /{page}/photos      { url, caption, published:true }
//   many photos  POST /{page}/photos      { url, published:false } each, then
//                POST /{page}/feed        { message, attached_media:[{media_fbid}] }
//   one video    POST /{page}/videos      { file_url, description }
//
// It posts with the stored PAGE access token (facebook_connections.access_token,
// saved from /me/accounts at connect). Nothing is marked published unless
// Facebook returns an id, and every failure carries Facebook's own reason.

import type { PublishAdapter, PublishContext, PublishOutcome } from "../adapter";
import type { FacebookSettings, MediaItem } from "../types";
import { effectiveCaption } from "../validate";
import { FB_GRAPH_V } from "../../facebook";

const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;
const CALL_TIMEOUT_MS = 30_000;

type Conn = { page_id: string; access_token: string; plan_suspended_at?: string | null };

const fail = (message: string, code: string | null = null, retryable = false): PublishOutcome => ({
  status: "failed", errorCode: code, errorMessage: message, retryable,
});

const permalinkFor = (id: string | null): string | null => (id ? `https://www.facebook.com/${id}` : null);
const published = (postId: string): PublishOutcome => ({
  status: "published", externalPostId: postId || null, permalink: permalinkFor(postId || null), errorCode: null, errorMessage: null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fbFail(httpStatus: number, body: any): PublishOutcome {
  const e = (body && body.error) || {};
  const code: number | undefined = typeof e.code === "number" ? e.code : undefined;
  // Missing/insufficient permission: the Page token lacks pages_manage_posts.
  if (code === 200 || code === 10 || code === 3) {
    return fail("Facebook hasn't granted publishing permission for this Page. Reconnect Facebook to enable publishing.", String(code), false);
  }
  // Expired/invalid token.
  if (code === 190) {
    return fail("Facebook's access token for this Page has expired. Reconnect Facebook to publish.", "190", false);
  }
  // Transient: server errors and the documented rate-limit / temporary codes.
  const transient = httpStatus >= 500 || (code != null && [1, 2, 4, 17, 32, 341, 368, 613].includes(code));
  const msg = e.message ? `Facebook: ${e.message}` : `Facebook returned an error (HTTP ${httpStatus}).`;
  return fail(msg, code != null ? String(code) : String(httpStatus), transient);
}

type PostResult = { ok: true; data: Record<string, unknown> } | { ok: false; out: PublishOutcome };

async function fbPost(path: string, params: Record<string, string>, budgetMs: number): Promise<PostResult> {
  const timeout = Math.max(1, Math.min(CALL_TIMEOUT_MS, budgetMs));
  try {
    const res = await fetch(`${BASE}/${path}`, { method: "POST", body: new URLSearchParams(params), signal: AbortSignal.timeout(timeout) });
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON error body */ }
    if (!res.ok || data.error) return { ok: false, out: fbFail(res.status, data) };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, out: fail(`Facebook did not respond: ${(err as Error).message}`, "network", true) };
  }
}

/** The connection row for (user, page); tolerant of the pre-plan schema. */
async function readConnection(ctx: PublishContext): Promise<Conn | null> {
  const cols = "page_id, access_token";
  for (const sel of [`${cols}, plan_suspended_at`, cols]) {
    try {
      const { data, error } = await ctx.supabase
        .from("facebook_connections")
        .select(sel)
        .eq("user_id", ctx.userId)
        .eq("page_id", ctx.destination.accountId)
        .maybeSingle();
      if (!error) return (data as Conn | null) ?? null;
    } catch {
      /* try the narrower select */
    }
  }
  return null;
}

async function publish(ctx: PublishContext): Promise<PublishOutcome> {
  // Already has a post id: it went out. Never publish the same destination twice.
  if (ctx.destination.externalPostId) {
    return { status: "published", externalPostId: ctx.destination.externalPostId, permalink: ctx.destination.permalink ?? permalinkFor(ctx.destination.externalPostId), errorCode: null, errorMessage: null };
  }

  const conn = await readConnection(ctx);
  if (!conn?.access_token || !conn.page_id) return fail("This Facebook Page is not connected to SOCIA.", "no_connection");
  if (conn.plan_suspended_at != null) return fail("This Facebook Page is paused by your plan.", "plan_suspended");

  const settings = ctx.destination.settings as FacebookSettings;
  const caption = effectiveCaption("facebook", ctx.item.caption, settings);
  const token = conn.access_token;
  const page = conn.page_id;
  const budget = ctx.budgetMs;

  const withUrl = (m: MediaItem) => Boolean(m.url);
  const videos = ctx.item.media.filter((m) => m.kind === "video" && withUrl(m));
  const images = ctx.item.media.filter((m) => m.kind === "image" && withUrl(m));

  // A single video post.
  if (videos.length) {
    const r = await fbPost(`${page}/videos`, { file_url: videos[0].url!, description: caption, access_token: token }, budget);
    if (!r.ok) return r.out;
    // Facebook returns the video id; the post appears once Facebook finishes
    // transcoding. Accepted-with-an-id is our published signal.
    return published(String(r.data.id ?? ""));
  }

  // A single photo.
  if (images.length === 1) {
    const r = await fbPost(`${page}/photos`, { url: images[0].url!, caption, published: "true", access_token: token }, budget);
    if (!r.ok) return r.out;
    return published(String((r.data.post_id as string) ?? (r.data.id as string) ?? ""));
  }

  // Several photos: upload each unpublished, then one feed post attaching them.
  if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images) {
      const r = await fbPost(`${page}/photos`, { url: img.url!, published: "false", access_token: token }, budget);
      if (!r.ok) return r.out;
      if (r.data.id) ids.push(String(r.data.id));
    }
    const params: Record<string, string> = { access_token: token };
    if (caption) params.message = caption;
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const r = await fbPost(`${page}/feed`, params, budget);
    if (!r.ok) return r.out;
    return published(String(r.data.id ?? ""));
  }

  // Text only.
  if (!caption.trim()) return fail("Add a caption or media before publishing to Facebook.", "empty_post");
  const r = await fbPost(`${page}/feed`, { message: caption, access_token: token }, budget);
  if (!r.ok) return r.out;
  return published(String(r.data.id ?? ""));
}

/** Facebook publishes synchronously, so there is nothing to poll. If a prior
 *  pass left the destination short of a post id, run the publish again. */
async function poll(ctx: PublishContext): Promise<PublishOutcome> {
  if (ctx.destination.externalPostId) {
    return { status: "published", externalPostId: ctx.destination.externalPostId, permalink: ctx.destination.permalink ?? permalinkFor(ctx.destination.externalPostId), errorCode: null, errorMessage: null };
  }
  return publish(ctx);
}

export const facebookAdapter: PublishAdapter = { platform: "facebook", publish, poll };
