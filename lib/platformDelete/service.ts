// Delete on platform, the server side. Finds what a request may delete (always
// from SOCIA's own rows, never from the request body), answers whether it can
// be deleted, and performs the deletion: freeze the last measurement, call the
// platform, confirm a "not found" answer with an independent read, then record
// the deletion in the ledger and on the post. Nothing is marked deleted unless
// the platform confirmed it.
//
// Tokens are read here and passed only to lib/platformDelete/deleters.ts; they
// never leave the server, never appear in a log line and never reach a route
// response.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "../context";
import type { Platform } from "../publishing/types";
import { PLATFORM_LABEL } from "../publishing/types";
import { isMissingTableError, loadItem, updateDestination } from "../publishing/db";
import { getActiveConnection, getIgSnapshot, syncInstagram, type IgMediaItem } from "../instagramSync";
import { getFbSnapshot } from "../facebookSync";
import { youtubeAccessToken } from "../youtubeData";
import { connectionWorkspaceId } from "../workspaces";
import { loadMeasureSources } from "../planOutcomesLoad";
import { measureDestination } from "../postResults";
import { clearLiveCache } from "../liveCache";
import { scheduleBackground } from "../background";
import { resolveDeleteCapability, type DeleteInputs } from "./capability";
import { ledgerAvailable, ledgerRow } from "./ledger";
export { deletionsByExternalId, ledgerAvailable } from "./ledger";
import { deleters as realDeleters, type Deleters, type PlatformAnswer } from "./deleters";
import type { DeleteCapability, DeletedResult, DeleteOutcome, DeleteTarget } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** The workspace argument the connection readers expect: the ctx's workspace, or "the owner's active one". */
const wsArg = (ctx: Ctx): string | undefined => (ctx.workspace ? ctx.workspace.id : undefined);

/** A target plus what the UI needs to describe it. */
export type ResolvedTarget = {
  target: DeleteTarget;
  /** "REELS", "IMAGE", "CAROUSEL_ALBUM", "video", ... when known, for the noun in the confirm copy. */
  format: string | null;
  /** Already deleted through SOCIA. */
  deletedAt: string | null;
};

export type TargetError = { error: string; status: 404 | 409 };

// ---------------------------------------------------------------------------
// Connections (server only: these hold tokens)
// ---------------------------------------------------------------------------

type FbRow = {
  page_id?: string | null;
  ig_business_id?: string | null;
  ig_business_username?: string | null;
  access_token?: string | null;
  user_access_token?: string | null;
  user_token_expires_at?: string | null;
  scopes?: string[] | null;
  connection_status?: string | null;
  plan_suspended_at?: string | null;
};

const FB_SELECTS = [
  "page_id, ig_business_id, ig_business_username, access_token, user_access_token, user_token_expires_at, scopes, connection_status, plan_suspended_at",
  // before supabase/platform-deletions.sql
  "page_id, ig_business_id, ig_business_username, access_token, connection_status, plan_suspended_at",
  "page_id, ig_business_id, ig_business_username, access_token, connection_status",
  "page_id, access_token, connection_status",
];

/** The Facebook row for a Page id, or the workspace's row. First match; the widest select that works. */
async function readFacebookRow(ctx: Ctx, pageId: string | null): Promise<FbRow | null> {
  // Always this workspace's row: a Page connected in another of the owner's
  // workspaces is never used, even when its id is asked for.
  const wsId = await connectionWorkspaceId(ctx.client, ctx.ownerId, wsArg(ctx));
  for (const sel of FB_SELECTS) {
    try {
      let q = ctx.client.from("facebook_connections").select(sel).eq("user_id", ctx.ownerId);
      if (pageId) q = q.eq("page_id", pageId);
      if (wsId) q = q.eq("workspace_id", wsId);
      const { data, error } = await q.limit(1);
      if (!error) return ((data as FbRow[] | null) ?? [])[0] ?? null;
    } catch {
      /* try the narrower select */
    }
  }
  return null;
}

type Secrets = { igLoginToken: string | null; fbUserToken: string | null; fbPageToken: string | null; ytToken: string | null };

/** The resolver's inputs and, separately, the tokens a deletion would use. */
export async function loadDeleteInputs(ctx: Ctx, target: DeleteTarget, now: Date = new Date()): Promise<{ inputs: DeleteInputs; secrets: Secrets }> {
  const secrets: Secrets = { igLoginToken: null, fbUserToken: null, fbPageToken: null, ytToken: null };
  const inputs: DeleteInputs = { target, facebook: null, instagram: null, youtube: null, ledgerAvailable: await ledgerAvailable(ctx.client), now };

  if (target.platform === "instagram" || target.platform === "facebook") {
    if (target.platform === "instagram") {
      const ig = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id, username, access_token", wsArg(ctx)).catch(() => null)) as
        | { ig_user_id?: string | null; username?: string | null; access_token?: string | null }
        | null;
      if (ig?.ig_user_id) {
        inputs.instagram = { igUserId: String(ig.ig_user_id), username: ig.username ?? null };
        secrets.igLoginToken = ig.access_token ?? null;
      }
    }
    const fb = await readFacebookRow(ctx, target.platform === "facebook" ? target.accountId : null);
    if (fb) {
      inputs.facebook = {
        pageId: fb.page_id ?? null,
        igBusinessId: fb.ig_business_id ?? null,
        igBusinessUsername: fb.ig_business_username ?? null,
        hasPageToken: Boolean(fb.access_token),
        hasUserToken: Boolean(fb.user_access_token),
        userTokenExpiresAt: fb.user_token_expires_at ?? null,
        scopes: Array.isArray(fb.scopes) ? fb.scopes : null,
        status: fb.connection_status ?? null,
        suspended: fb.plan_suspended_at != null,
      };
      secrets.fbUserToken = fb.user_access_token ?? null;
      secrets.fbPageToken = fb.access_token ?? null;
    }
  }

  if (target.platform === "youtube") {
    const yt = await youtubeAccessToken(ctx.client, ctx.ownerId, wsArg(ctx)).catch(() => null);
    if (yt) {
      inputs.youtube = { channelId: yt.channelId, scopes: yt.scopes };
      secrets.ytToken = yt.token;
    }
  }

  return { inputs, secrets };
}

/** What the UI shows before anyone presses anything. */
export async function capabilityFor(ctx: Ctx, target: DeleteTarget): Promise<DeleteCapability> {
  const { inputs } = await loadDeleteInputs(ctx, target);
  return resolveDeleteCapability(inputs);
}

// ---------------------------------------------------------------------------
// Targets: always from SOCIA's rows
// ---------------------------------------------------------------------------

/**
 * A post belongs to the context's workspace (or has no workspace yet, from
 * before Brand Workspaces). An admin of one workspace never reaches another
 * workspace's posts by id. Pre-migration (no workspace_id column): true.
 */
async function inThisWorkspace(ctx: Ctx, postId: string): Promise<boolean> {
  if (!ctx.workspace) return true;
  try {
    const { data, error } = await ctx.client.from("scheduled_posts").select("workspace_id").eq("id", postId).eq("user_id", ctx.ownerId).limit(1);
    if (error) return true;
    const ws = ((data as { workspace_id?: string | null }[] | null) ?? [])[0]?.workspace_id ?? null;
    return ws == null || ws === ctx.workspace.id;
  } catch {
    return true;
  }
}

type LegacyRow = {
  id: string;
  status: string;
  published_media_id: string | null;
  permalink: string | null;
  caption: string | null;
  media_type: string | null;
  ig_user_id?: string | null;
  deleted_at?: string | null;
};

async function readLegacyRow(client: Supa, ownerId: string, by: { id?: string; mediaId?: string }): Promise<LegacyRow | null> {
  const base = "id, status, published_media_id, permalink, caption, media_type";
  for (const sel of [`${base}, ig_user_id, deleted_at`, `${base}, ig_user_id`, base]) {
    try {
      let q = client.from("scheduled_posts").select(sel).eq("user_id", ownerId);
      if (by.id) q = q.eq("id", by.id);
      if (by.mediaId) q = q.eq("published_media_id", by.mediaId);
      const { data, error } = await q.limit(1);
      if (!error) return ((data as unknown as LegacyRow[] | null) ?? [])[0] ?? null;
    } catch {
      /* narrower select */
    }
  }
  return null;
}

async function activeIgUserId(ctx: Ctx): Promise<string | null> {
  const ig = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", wsArg(ctx)).catch(() => null)) as { ig_user_id?: string | null } | null;
  return ig?.ig_user_id ? String(ig.ig_user_id) : null;
}

/**
 * One published destination of a post (destinationId), or the post's legacy
 * Instagram row (destinationId null). The item is loaded as the workspace
 * owner, so a post from another account or workspace is simply not found.
 */
export async function targetForDestination(ctx: Ctx, postId: string, destinationId: string | null): Promise<ResolvedTarget | TargetError> {
  const item = await loadItem(ctx.client, postId, ctx.ownerId).catch(() => null);
  if (!item) return { error: "Post not found.", status: 404 };
  if (!(await inThisWorkspace(ctx, postId))) return { error: "Post not found.", status: 404 };
  const caption = item.caption ? item.caption.slice(0, 300) : null;

  if (destinationId) {
    const d = item.destinations.find((x) => x.id === destinationId);
    if (!d) return { error: "Post not found.", status: 404 };
    if (d.status !== "published" || !d.externalPostId) return { error: "Only a published post can be deleted from the platform.", status: 409 };
    const settings = d.settings as unknown as Record<string, unknown>;
    const format = typeof settings?.format === "string" ? settings.format : typeof settings?.mediaType === "string" ? settings.mediaType : null;
    return {
      target: { platform: d.platform, accountId: d.accountId, externalId: d.externalPostId, permalink: d.permalink, postId: item.id, destinationId: d.id, collabOwner: null, caption },
      format,
      deletedAt: d.deletedAt ?? null,
    };
  }

  if (item.destinations.length) return { error: "Choose which platform to delete it from.", status: 409 };
  const row = await readLegacyRow(ctx.client, ctx.ownerId, { id: postId });
  if (!row) return { error: "Post not found.", status: 404 };
  if (row.status !== "published" || !row.published_media_id) return { error: "Only a published post can be deleted from the platform.", status: 409 };
  // An old row without the account it went to is trusted only when the post
  // is in the account connected here now (its synced media).
  let accountId = row.ig_user_id ?? null;
  if (!accountId) {
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, wsArg(ctx)).catch(() => null);
    if (snap?.media.some((m) => m.id === row.published_media_id)) accountId = await activeIgUserId(ctx);
  }
  if (!accountId) return { error: "SOCIA could not match this post to the Instagram account connected here. Delete it in the Instagram app.", status: 409 };
  return {
    target: { platform: "instagram", accountId: String(accountId), externalId: row.published_media_id, permalink: row.permalink, postId: row.id, destinationId: null, collabOwner: null, caption: row.caption ? row.caption.slice(0, 300) : caption },
    format: row.media_type,
    deletedAt: row.deleted_at ?? null,
  };
}

/** SOCIA's own record of a published post, when SOCIA published it: a destination, or a legacy Instagram row. */
async function sociaRecordFor(ctx: Ctx, platform: Platform, externalId: string): Promise<{ postId: string | null; destinationId: string | null }> {
  try {
    const { data } = await ctx.client
      .from("post_destinations")
      .select("id, post_id")
      .eq("user_id", ctx.ownerId)
      .eq("platform", platform)
      .eq("status", "published")
      .eq("external_post_id", externalId)
      .limit(1);
    const hit = ((data as { id: string; post_id: string }[] | null) ?? [])[0];
    if (hit) return { postId: hit.post_id, destinationId: hit.id };
  } catch {
    /* no destinations table: maybe a legacy row */
  }
  if (platform === "instagram") {
    const legacy = await readLegacyRow(ctx.client, ctx.ownerId, { mediaId: externalId });
    if (legacy) return { postId: legacy.id, destinationId: null };
  }
  return { postId: null, destinationId: null };
}

/**
 * A post from the workspace's synced Instagram media (Analytics, Dashboard),
 * which SOCIA may or may not have published. The id must be in this
 * workspace's snapshot; a SOCIA record of the same post is marked too.
 */
export async function targetForSyncedMedia(ctx: Ctx, mediaId: string): Promise<(ResolvedTarget & { media: IgMediaItem }) | TargetError> {
  const snap = await getIgSnapshot(ctx.client, ctx.ownerId, wsArg(ctx)).catch(() => null);
  const media = snap?.media.find((m) => m.id === mediaId);
  if (!media) return { error: "This post is not in this workspace's Instagram account.", status: 404 };
  const accountId = await activeIgUserId(ctx);
  if (!accountId) return { error: "Instagram is not connected in this workspace.", status: 409 };

  const { postId, destinationId } = await sociaRecordFor(ctx, "instagram", mediaId);
  const deleted = await ledgerRow(ctx.client, ctx.ownerId, "instagram", mediaId);
  return {
    target: {
      platform: "instagram",
      accountId,
      externalId: mediaId,
      permalink: media.permalink ?? null,
      postId,
      destinationId,
      collabOwner: media.collab_owner ?? null,
      caption: media.caption ? media.caption.slice(0, 300) : null,
    },
    format: media.media_product_type === "REELS" ? "REELS" : media.media_type ?? null,
    deletedAt: deleted?.deleted_at ?? null,
    media,
  };
}

// ---------------------------------------------------------------------------
// The deletion
// ---------------------------------------------------------------------------

/** The last measurement before the platform call. null when nothing was reported (never 0). */
async function freeze(ctx: Ctx, target: DeleteTarget, now: Date): Promise<{ frozen: DeletedResult | null; raw: Record<string, unknown> | null }> {
  if (target.platform === "tiktok") return { frozen: null, raw: null };
  try {
    const lite = { postId: target.postId ?? "", platform: target.platform, status: "published", externalPostId: target.externalId, publishedAt: null, permalink: target.permalink };
    const sources = await loadMeasureSources(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, [], [lite]);
    const m = measureDestination(target.platform, target.externalId, sources);
    const frozen: DeletedResult | null = m.found ? { ...m, measuredAt: now.toISOString() } : null;
    let raw: Record<string, unknown> | null = null;
    if (target.platform === "instagram") {
      const hit = sources.instagram?.find((x) => x.id === target.externalId);
      if (hit) raw = { likes: hit.like_count ?? null, comments: hit.comments_count ?? null, insights: hit.insights ?? null, timestamp: hit.timestamp ?? null };
    }
    return { frozen, raw };
  } catch {
    return { frozen: null, raw: null };
  }
}

async function callPlatform(target: DeleteTarget, secrets: Secrets, d: Deleters): Promise<PlatformAnswer> {
  if (target.platform === "instagram") return d.deleteInstagramMedia(target.externalId, secrets.fbUserToken ?? "");
  if (target.platform === "facebook") return d.deleteFacebookPost(target.externalId, secrets.fbPageToken ?? "");
  if (target.platform === "youtube") return d.deleteYouTubeVideo(target.externalId, secrets.ytToken ?? "");
  return { ok: false, code: null, message: "TikTok's API has no way to delete a video. Delete it in the TikTok app.", kind: "final" };
}

/** After a "not found": is the object really gone? Asked through the API that can see it. */
async function stillThere(target: DeleteTarget, secrets: Secrets, d: Deleters): Promise<boolean | null> {
  if (target.platform === "instagram") return secrets.igLoginToken ? d.instagramMediaExists(target.externalId, secrets.igLoginToken) : null;
  if (target.platform === "facebook") return secrets.fbPageToken ? d.facebookObjectExists(target.externalId, secrets.fbPageToken) : null;
  if (target.platform === "youtube") return secrets.ytToken ? d.youtubeVideoExists(target.externalId, secrets.ytToken) : null;
  return null;
}

const log = (o: Record<string, unknown>) => console.log("[platform-delete]", JSON.stringify(o));

/**
 * Delete `target` from its platform and record it. Idempotent: a target
 * already in the ledger returns its deletion without calling the platform.
 * The caller has already checked the role (can(ctx, "delete_on_platform")).
 */
export async function performPlatformDelete(
  ctx: Ctx,
  target: DeleteTarget,
  opts: { deps?: Deleters; now?: Date; format?: string | null } = {},
): Promise<DeleteOutcome> {
  const d = opts.deps ?? realDeleters;
  const now = opts.now ?? new Date();
  const name = PLATFORM_LABEL[target.platform];

  const { inputs, secrets } = await loadDeleteInputs(ctx, target, now);
  if (inputs.ledgerAvailable) {
    const existing = await ledgerRow(ctx.client, ctx.ownerId, target.platform, target.externalId);
    if (existing) return { ok: true, deletedAt: existing.deleted_at, gone: false };
  }
  const capability = resolveDeleteCapability(inputs);
  if (!capability.canDelete) return { ok: false, capability };

  const { frozen, raw } = await freeze(ctx, target, now);

  let answer = await callPlatform(target, secrets, d);
  let gone = false;
  if (!answer.ok && answer.kind === "not_found") {
    const there = await stillThere(target, secrets, d);
    if (there === false) {
      gone = true;
      answer = { ok: true, gone: true, response: { gone: true, code: answer.code } };
    } else if (there === true) {
      log({ platform: target.platform, ok: false, code: answer.code, verified: "still_there" });
      return { ok: false, error: `${name} did not delete it, and the post is still live. ${answer.message}`, code: answer.code };
    } else {
      log({ platform: target.platform, ok: false, code: answer.code, verified: "unknown" });
      return { ok: false, error: `${answer.message} SOCIA could not confirm the post is gone, so nothing was changed.`, code: answer.code };
    }
  }
  if (!answer.ok) {
    log({ platform: target.platform, ok: false, code: answer.code, kind: answer.kind });
    return { ok: false, error: answer.message, code: answer.code };
  }

  // The platform confirmed. From here on the record must follow; a failed
  // write is logged loudly but never turned into "not deleted".
  const deletedAt = now.toISOString();
  const lastMetrics = frozen || raw ? { ...(raw ?? {}), measurement: frozen } : null;
  const { error: ledgerError } = await ctx.client.from("platform_deletions").insert({
    user_id: ctx.ownerId,
    workspace_id: ctx.workspace?.id ?? null,
    platform: target.platform,
    account_id: target.accountId,
    external_id: target.externalId,
    post_id: target.postId,
    destination_id: target.destinationId,
    deleted_by: ctx.viewerId,
    deleted_at: deletedAt,
    permalink: target.permalink,
    caption: target.caption,
    media_kind: opts.format ?? null,
    last_metrics: lastMetrics,
    platform_response: answer.response,
  });
  if (ledgerError && (ledgerError as { code?: string }).code !== "23505") {
    console.error("[platform-delete] ledger write failed after the platform deleted:", ledgerError.message);
  }

  if (target.destinationId) {
    await updateDestination(ctx.client, target.destinationId, { deletedAt, deletedBy: ctx.viewerId, deletedResult: frozen }).catch((e) =>
      console.error("[platform-delete] destination write failed after the platform deleted:", (e as Error).message),
    );
  } else if (target.postId && target.platform === "instagram") {
    let { error } = await ctx.client.from("scheduled_posts").update({ deleted_at: deletedAt, deleted_by: ctx.viewerId, deleted_result: frozen }).eq("id", target.postId).eq("user_id", ctx.ownerId);
    if (error && !isMissingTableError(error)) {
      // deleted_result arrived in a later revision of the migration: keep the mark without it.
      ({ error } = await ctx.client.from("scheduled_posts").update({ deleted_at: deletedAt, deleted_by: ctx.viewerId }).eq("id", target.postId).eq("user_id", ctx.ownerId));
    }
    if (error && !isMissingTableError(error)) console.error("[platform-delete] post write failed after the platform deleted:", error.message);
  }

  clearLiveCache(ctx.ownerId);
  if (target.platform === "instagram") {
    const client = ctx.client;
    const owner = ctx.ownerId;
    const ws = wsArg(ctx);
    scheduleBackground("platform-delete resync", () => syncInstagram(client, owner, ws));
  }
  log({ platform: target.platform, ok: true, gone });
  return { ok: true, deletedAt, gone };
}

/**
 * Any post the workspace's connected accounts show in Analytics, whether or
 * not SOCIA published it: Instagram media (posts, Reels, carousels), Facebook
 * Page posts, YouTube videos and Shorts. Ownership is always proven from the
 * workspace's own data: the Instagram and Facebook snapshots, or YouTube's
 * own answer about which channel the video is on. TikTok is resolved only so
 * the UI can say why it cannot be deleted from here.
 */
export async function targetForSyncedPost(ctx: Ctx, platform: Platform, id: string, deps: Pick<Deleters, "youtubeVideoChannel"> = realDeleters): Promise<ResolvedTarget | TargetError> {
  if (platform === "instagram") return targetForSyncedMedia(ctx, id);

  if (platform === "facebook") {
    const snap = await getFbSnapshot(ctx.client, ctx.ownerId, wsArg(ctx)).catch(() => null);
    const post = snap?.posts.find((p) => p.id === id);
    if (!snap?.page_id || !post) return { error: "This post is not on this workspace's Facebook Page.", status: 404 };
    const { postId, destinationId } = await sociaRecordFor(ctx, "facebook", id);
    const deleted = await ledgerRow(ctx.client, ctx.ownerId, "facebook", id);
    return {
      target: { platform: "facebook", accountId: snap.page_id, externalId: id, permalink: post.permalink_url ?? null, postId, destinationId, collabOwner: null, caption: post.message ? post.message.slice(0, 300) : null },
      format: post.status_type ?? null,
      deletedAt: deleted?.deleted_at ?? null,
    };
  }

  if (platform === "youtube") {
    const deleted = await ledgerRow(ctx.client, ctx.ownerId, "youtube", id);
    const yt = await youtubeAccessToken(ctx.client, ctx.ownerId, wsArg(ctx)).catch(() => null);
    if (!yt?.channelId) return { error: "YouTube is not connected in this workspace.", status: 409 };
    const permalink = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    const { postId, destinationId } = await sociaRecordFor(ctx, "youtube", id);
    if (!deleted) {
      // Ask YouTube which channel the video is on: only this workspace's channel's videos are offered.
      const channel = await deps.youtubeVideoChannel(id, yt.token);
      if (channel === false) return { error: "YouTube has no video with this id.", status: 404 };
      if (channel !== null && channel !== yt.channelId) return { error: "This video is not on this workspace's YouTube channel.", status: 404 };
      if (channel === null) return { error: "SOCIA could not confirm which channel this video is on. Try again in a minute.", status: 409 };
    }
    return {
      target: { platform: "youtube", accountId: yt.channelId, externalId: id, permalink, postId, destinationId, collabOwner: null, caption: null },
      format: "video",
      deletedAt: deleted?.deleted_at ?? null,
    };
  }

  return {
    target: { platform: "tiktok", accountId: "", externalId: id, permalink: null, postId: null, destinationId: null, collabOwner: null, caption: null },
    format: "video",
    deletedAt: null,
  };
}
