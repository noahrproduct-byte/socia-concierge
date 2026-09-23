// Instagram publisher behind the PublishAdapter contract. Server only.
//
// publish(): checks the connection, scope, token freshness and the account's
//            24 h publishing quota, then creates the container(s) for the
//            chosen format and returns "processing" with the parent container id.
// poll():    watches the container within the budget; FINISHED publishes it,
//            ERROR is final, EXPIRED asks for a new container, IN_PROGRESS waits.
//
// Every failure carries Instagram's own code and message verbatim. Nothing is
// marked published until Instagram returns a media id.

import type { PublishAdapter, PublishContext, PublishOutcome } from "../adapter";
import type { InstagramSettings, MediaItem } from "../types";
import { effectiveCaption } from "../validate";
import {
  canPublish, containerStatus, createContainer, igRetryable, mediaPermalink, publishContainer, publishingLimit,
  refreshLongLivedToken, IG_CALL_TIMEOUT_MS, IG_TOKEN_LIFETIME_MS, type ContainerInput, type IgResult,
} from "../../igPublish";

type Conn = {
  ig_user_id: string;
  access_token: string;
  scopes: string[] | null;
  token_expires_at: string | null;
  plan_suspended_at?: string | null;
};

const DAY_MS = 86400_000;
const REFRESH_WINDOW_MS = 10 * DAY_MS;
export const POLL_EVERY_MS = 4000;
/** The least budget worth spending on one Instagram call; below it the pass ends and the next run continues. */
export const MIN_CALL_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Budget arithmetic for one poll pass. Every Instagram call is bounded by an
 * AbortSignal of `callTimeoutMs` (the usual 20 s, or less when less of the
 * budget is left), so the worst case for a pass is the budget itself and one
 * slow answer can never push the cron past its deadline. `callFits` says a
 * call still has MIN_CALL_MS to work with; `waitAgain` says a sleep and one
 * more call both fit. Pure, unit-tested.
 */
export function pollBudget(elapsedMs: number, budgetMs: number): { callTimeoutMs: number; callFits: boolean; waitAgain: boolean } {
  const remaining = Math.max(0, budgetMs - elapsedMs);
  return {
    callTimeoutMs: Math.max(1, Math.min(IG_CALL_TIMEOUT_MS, remaining)),
    callFits: remaining >= MIN_CALL_MS,
    waitAgain: remaining - POLL_EVERY_MS >= MIN_CALL_MS,
  };
}

const fail = (message: string, code: string | null = null, retryable = false): PublishOutcome => ({
  status: "failed", errorCode: code, errorMessage: message, retryable,
});

const failFromIg = (r: { error: string; code?: number }, retryableOverride?: boolean): PublishOutcome =>
  fail(r.error, r.code != null ? String(r.code) : null, retryableOverride ?? igRetryable(r.code));

/** The connection row for (user, ig account); tolerant of the pre-plan schema. */
async function readConnection(ctx: PublishContext): Promise<Conn | null> {
  const cols = "ig_user_id, access_token, scopes, token_expires_at";
  for (const sel of [`${cols}, plan_suspended_at`, cols]) {
    try {
      const { data, error } = await ctx.supabase
        .from("instagram_connections")
        .select(sel)
        .eq("user_id", ctx.userId)
        .eq("ig_user_id", ctx.destination.accountId)
        .maybeSingle();
      if (!error) return (data as Conn | null) ?? null;
    } catch {
      /* retry with fewer columns */
    }
  }
  return null;
}

/**
 * Refresh a long-lived token that is close to expiry (within 10 days) and old
 * enough to be refreshable (24 h since issue; issue time follows from the
 * 60-day lifetime). Best effort: a failed refresh of a still-valid token is
 * ignored; a failed refresh of an expired token is a final failure.
 */
async function freshToken(ctx: PublishContext, conn: Conn): Promise<{ token: string } | { failure: PublishOutcome }> {
  const now = ctx.now.getTime();
  const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : null;
  if (expMs == null || Number.isNaN(expMs)) return { token: conn.access_token };
  const issuedMs = expMs - IG_TOKEN_LIFETIME_MS;
  const nearExpiry = expMs - now < REFRESH_WINDOW_MS;
  const oldEnough = now - issuedMs >= DAY_MS;
  if (!nearExpiry || !oldEnough) {
    if (expMs <= now) return { failure: fail("Instagram's access token for this account has expired. Reconnect Instagram to publish.", "190") };
    return { token: conn.access_token };
  }
  const r = await refreshLongLivedToken(conn.access_token);
  if (!r.ok) {
    if (expMs > now) return { token: conn.access_token };
    return { failure: fail(`Instagram's access token for this account has expired and could not be refreshed: ${r.error}`, r.code != null ? String(r.code) : "190") };
  }
  await ctx.supabase
    .from("instagram_connections")
    .update({ access_token: r.value.accessToken, token_expires_at: new Date(now + r.value.expiresIn * 1000).toISOString() })
    .eq("user_id", ctx.userId)
    .eq("ig_user_id", conn.ig_user_id)
    .then(() => undefined, () => undefined);
  return { token: r.value.accessToken };
}

async function resolve(ctx: PublishContext): Promise<{ conn: Conn; token: string } | { failure: PublishOutcome }> {
  const conn = await readConnection(ctx);
  if (!conn?.access_token) return { failure: fail("This Instagram account is not connected to SOCIA.", "no_connection") };
  if (conn.plan_suspended_at != null) return { failure: fail("This Instagram account is paused by your plan.", "plan_suspended") };
  // A recorded scope list without publishing is a definite no; an absent list
  // (connected before scopes were recorded) is tried and Instagram answers.
  if (Array.isArray(conn.scopes) && !canPublish(conn.scopes)) {
    return { failure: fail("Instagram has not granted publishing permission for this account. Reconnect Instagram to enable it.", "needs_scope") };
  }
  const t = await freshToken(ctx, conn);
  if ("failure" in t) return t;
  return { conn, token: t.token };
}

const url = (m: MediaItem | undefined): string | null => m?.url ?? null;

/**
 * The container inputs for a format, in creation order: carousel children
 * first, the parent last. `children` on the parent is filled in at run time.
 * Pure, so the tests can check what each format sends.
 */
export function containerPlan(settings: InstagramSettings, media: MediaItem[], caption: string): { children: ContainerInput[]; parent: ContainerInput } {
  if (settings.format === "reel") {
    return {
      children: [],
      parent: {
        mediaType: "REELS", mediaUrl: url(media[0]), caption, shareToFeed: settings.shareToFeed,
        thumbOffsetMs: settings.coverTimestampMs, isAiGenerated: settings.aiGenerated,
      },
    };
  }
  if (settings.format === "image") {
    return {
      children: [],
      parent: {
        mediaType: "IMAGE", mediaUrl: url(media[0]), caption, altText: settings.altText,
        userTags: settings.userTags, isAiGenerated: settings.aiGenerated,
      },
    };
  }
  return {
    children: media.map((m) => ({ mediaType: "CAROUSEL_ITEM" as const, mediaUrl: url(m), altText: settings.altText, isCarouselItem: true })),
    parent: { mediaType: "CAROUSEL", caption, isAiGenerated: settings.aiGenerated, children: [] },
  };
}

/** The stored published state, with the id and permalink keys only when known. */
function alreadyPublished(ctx: PublishContext, containerId: string | null): PublishOutcome {
  const out: PublishOutcome = { status: "published", externalContainerId: containerId, errorCode: null, errorMessage: null };
  if (ctx.destination.externalPostId) out.externalPostId = ctx.destination.externalPostId;
  if (ctx.destination.permalink) out.permalink = ctx.destination.permalink;
  return out;
}

async function publish(ctx: PublishContext): Promise<PublishOutcome> {
  // A destination that already holds a media id was published; never create another container for it.
  if (ctx.destination.externalPostId) return alreadyPublished(ctx, ctx.destination.externalContainerId);
  const r = await resolve(ctx);
  if ("failure" in r) return r.failure;
  const { conn, token } = r;
  const settings = ctx.destination.settings as InstagramSettings;
  const media = ctx.item.media;
  // Only the URL matters here; size and mime may be unknown (null / "") on legacy rows and are never compared.
  if (!media.length || media.some((m) => !m.url)) return fail("Add media before publishing to Instagram.", "media_missing");

  // The account's own 24 h quota, read from Instagram. Unknown (call failed) is
  // not treated as exhausted; Instagram gives the real answer on create.
  const limit = await publishingLimit(conn.ig_user_id, token);
  if (limit.ok && limit.value.quotaTotal != null && limit.value.quotaUsage >= limit.value.quotaTotal) {
    return fail(
      `Instagram's publishing limit for this account is used up (${limit.value.quotaUsage} of ${limit.value.quotaTotal} in 24 hours). SOCIA will retry later.`,
      "quota_exhausted", true,
    );
  }

  const caption = effectiveCaption("instagram", ctx.item.caption, settings);
  const plan = containerPlan(settings, media, caption);

  const childIds: string[] = [];
  for (const child of plan.children) {
    const c = await createContainer(conn.ig_user_id, token, child);
    if (!c.ok) return failFromIg(c);
    childIds.push(c.value.id);
  }
  const parentInput: ContainerInput = plan.parent.mediaType === "CAROUSEL" ? { ...plan.parent, children: childIds } : plan.parent;
  const p = await createContainer(conn.ig_user_id, token, parentInput);
  if (!p.ok) return failFromIg(p);
  return { status: "processing", externalContainerId: p.value.id, errorCode: null, errorMessage: null };
}

async function poll(ctx: PublishContext): Promise<PublishOutcome> {
  const containerId = ctx.destination.externalContainerId;
  // Nothing at Instagram yet: this destination never got its container.
  if (!containerId) return publish(ctx);

  // The media id is already known: nothing left to ask Instagram for.
  if (ctx.destination.externalPostId) return alreadyPublished(ctx, containerId);

  const r = await resolve(ctx);
  if ("failure" in r) return r.failure;
  const { conn, token } = r;
  const started = Date.now();
  const budget = () => pollBudget(Date.now() - started, ctx.budgetMs);
  const inFlight = (): PublishOutcome => ({ status: "processing", externalContainerId: containerId, errorCode: null, errorMessage: null });

  while (true) {
    const b = budget();
    if (!b.callFits) return inFlight();
    const s: IgResult<{ status_code: string; status?: string }> = await containerStatus(containerId, token, AbortSignal.timeout(b.callTimeoutMs));
    if (!s.ok) {
      if (igRetryable(s.code)) return { status: "processing", externalContainerId: containerId, errorCode: s.code != null ? String(s.code) : null, errorMessage: s.error };
      return failFromIg(s, false);
    }
    const code = s.value.status_code;
    if (code === "FINISHED") {
      // Publishing is the one call that must not be cut short: when too little
      // budget is left the next pass publishes the same container.
      const p = budget();
      if (!p.callFits) return inFlight();
      const pub = await publishContainer(conn.ig_user_id, token, containerId, AbortSignal.timeout(p.callTimeoutMs));
      if (!pub.ok) {
        // 9007 "media not ready" and rate limits are worth another pass with the same container.
        if (igRetryable(pub.code)) return { status: "processing", externalContainerId: containerId, errorCode: pub.code != null ? String(pub.code) : null, errorMessage: pub.error, retryable: true };
        return failFromIg(pub, false);
      }
      const l = budget();
      const permalink = await mediaPermalink(pub.value.id, token, AbortSignal.timeout(l.callTimeoutMs));
      const out: PublishOutcome = { status: "published", externalPostId: pub.value.id, externalContainerId: containerId, errorCode: null, errorMessage: null };
      if (permalink) out.permalink = permalink;
      return out;
    }
    if (code === "PUBLISHED") {
      // Instagram already published this container on an earlier pass. The id
      // and permalink keys are set only when known, so this never erases a stored id.
      return alreadyPublished(ctx, containerId);
    }
    if (code === "ERROR") {
      return fail(s.value.status ?? "Instagram reported ERROR while processing the media.", "container_error", false);
    }
    if (code === "EXPIRED") {
      return { status: "failed", externalContainerId: null, errorCode: "container_expired", errorMessage: "Instagram's upload container expired; retry to create a new one.", retryable: true };
    }
    // IN_PROGRESS (or an unlisted state): wait while a sleep and one more call still fit.
    if (!budget().waitAgain) return inFlight();
    await sleep(POLL_EVERY_MS);
  }
}

export const instagramAdapter: PublishAdapter = { platform: "instagram", publish, poll };
