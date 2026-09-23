// Instagram Content Publishing (Instagram API with Instagram Login).
//
// Publishing is two steps, and the second is asynchronous:
//   1. create a media container from a PUBLIC media URL + caption
//   2. once Instagram reports the container FINISHED, publish it
// A Reel can take anywhere from seconds to a couple of minutes to process, so
// callers poll `containerStatus` and may finish on a later run.
//
// Requires the `instagram_business_content_publish` scope on the token. Every
// function returns Instagram's own error message on failure; the UI shows
// that message, not a guess at what went wrong.
//
// Facts honoured here (developers.facebook.com/docs/instagram-platform/content-publishing, 2026-09-21):
//   REELS      media_type=REELS, video_url, share_to_feed, thumb_offset (ms), is_ai_generated
//   IMAGE      image_url, alt_text, user_tags (JSON [{username,x,y}]), is_ai_generated
//   CAROUSEL   children first (is_carousel_item=true, image_url, alt_text), then the
//              parent with media_type=CAROUSEL, children=<comma-separated ids>, caption
//   containers expire after 24 h; 100 API publishes per account per 24 h (read at runtime).

const IG_V = "v23.0";
const BASE = `https://graph.instagram.com/${IG_V}`;

export type IgResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: number; subcode?: number };

/** Every call to Instagram gives up after this long unless the caller passes a tighter signal. */
export const IG_CALL_TIMEOUT_MS = 20000;

async function ig<T>(path: string, init: RequestInit & { params?: Record<string, string>; base?: string }): Promise<IgResult<T>> {
  const u = new URL(`${init.base ?? BASE}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) u.searchParams.set(k, v);
  try {
    const res = await fetch(u, { method: init.method ?? "GET", signal: init.signal ?? AbortSignal.timeout(IG_CALL_TIMEOUT_MS) });
    const j = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } })
      | null;
    if (!res.ok || j?.error) {
      const e = j?.error;
      return { ok: false, error: e?.error_user_msg || e?.message || `Instagram returned ${res.status}`, code: e?.code, subcode: e?.error_subcode };
    }
    return { ok: true, value: j as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Instagram couldn't be reached" };
  }
}

export type IgMediaType = "REELS" | "IMAGE" | "CAROUSEL" | "CAROUSEL_ITEM";

export type IgUserTag = { username: string; x?: number; y?: number };

export type ContainerInput = {
  mediaType: IgMediaType;
  /** Public URL Instagram fetches. Required for REELS, IMAGE and CAROUSEL_ITEM; ignored for CAROUSEL. */
  mediaUrl?: string | null;
  /** Caption for the post. Ignored on carousel children. */
  caption?: string | null;
  /** Reels: also show in the Feed tab. Default true (matches the legacy publisher). */
  shareToFeed?: boolean;
  /** Reels cover frame in ms. */
  thumbOffsetMs?: number | null;
  /** Images and carousel images. */
  altText?: string | null;
  /** Images only. */
  userTags?: IgUserTag[] | null;
  isAiGenerated?: boolean;
  /** CAROUSEL parent: child container ids in order. */
  children?: string[] | null;
  /** CAROUSEL_ITEM children. Implied by mediaType CAROUSEL_ITEM. */
  isCarouselItem?: boolean;
};

/**
 * The exact query parameters Instagram receives for a container, minus the
 * token. Pure, so it is unit-tested per format. Only fields the API documents
 * for that media type are sent; nothing is invented for the others.
 */
export function buildContainerParams(input: ContainerInput): Record<string, string> {
  const p: Record<string, string> = {};
  const isChild = input.mediaType === "CAROUSEL_ITEM" || input.isCarouselItem === true;
  if (input.mediaType === "REELS") {
    p.media_type = "REELS";
    if (input.mediaUrl) p.video_url = input.mediaUrl;
    p.share_to_feed = input.shareToFeed === false ? "false" : "true";
    if (input.thumbOffsetMs != null && input.thumbOffsetMs >= 0) p.thumb_offset = String(Math.round(input.thumbOffsetMs));
  } else if (input.mediaType === "CAROUSEL") {
    p.media_type = "CAROUSEL";
    if (input.children?.length) p.children = input.children.join(",");
  } else {
    // IMAGE or CAROUSEL_ITEM (an image child)
    if (input.mediaUrl) p.image_url = input.mediaUrl;
    if (input.altText) p.alt_text = input.altText.slice(0, 1000);
    if (isChild) p.is_carousel_item = "true";
    if (!isChild && input.userTags?.length) {
      p.user_tags = JSON.stringify(
        input.userTags.map((t) => (t.x != null && t.y != null ? { username: t.username, x: t.x, y: t.y } : { username: t.username })),
      );
    }
  }
  if (!isChild && input.caption != null) p.caption = input.caption.slice(0, 2200);
  if (input.isAiGenerated) p.is_ai_generated = "true";
  return p;
}

/** Step 1: a container. The media URL must be publicly fetchable by Instagram's servers.
 *  Legacy callers pass { mediaType: "REELS" | "IMAGE", mediaUrl, caption } and get the
 *  same behaviour as before. */
export async function createContainer(
  igUserId: string,
  token: string,
  input: ContainerInput,
): Promise<IgResult<{ id: string }>> {
  const params = { ...buildContainerParams(input), access_token: token };
  return ig<{ id: string }>(`/${igUserId}/media`, { method: "POST", params });
}

/** Processing state of a container. `signal` (optional) bounds the call to the
 *  caller's remaining budget; without it the 20 s default applies. */
export async function containerStatus(
  containerId: string,
  token: string,
  signal?: AbortSignal,
): Promise<IgResult<{ status_code: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED"; status?: string }>> {
  return ig(`/${containerId}`, { params: { fields: "status_code,status", access_token: token }, signal });
}

/** Step 2: publish a FINISHED container. Returns the real media id. */
export async function publishContainer(
  igUserId: string,
  token: string,
  containerId: string,
  signal?: AbortSignal,
): Promise<IgResult<{ id: string }>> {
  return ig<{ id: string }>(`/${igUserId}/media_publish`, {
    method: "POST",
    params: { creation_id: containerId, access_token: token },
    signal,
  });
}

/** The published post's permalink, for the calendar to link to. */
export async function mediaPermalink(mediaId: string, token: string, signal?: AbortSignal): Promise<string | null> {
  const r = await ig<{ permalink?: string }>(`/${mediaId}`, { params: { fields: "permalink", access_token: token }, signal });
  return r.ok ? r.value.permalink ?? null : null;
}

/** The account's API publishing quota as Instagram reports it right now:
 *  quota_usage posts made in the rolling 24 h window and config.quota_total
 *  allowed. The total is read, never assumed. */
export async function publishingLimit(
  igUserId: string,
  token: string,
): Promise<IgResult<{ quotaUsage: number; quotaTotal: number | null }>> {
  const r = await ig<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
    `/${igUserId}/content_publishing_limit`,
    { params: { fields: "quota_usage,config", access_token: token } },
  );
  if (!r.ok) return r;
  const row = r.value.data?.[0];
  const usage = Number(row?.quota_usage);
  const total = Number(row?.config?.quota_total);
  return {
    ok: true,
    value: { quotaUsage: Number.isFinite(usage) ? usage : 0, quotaTotal: Number.isFinite(total) && total > 0 ? total : null },
  };
}

/** Long-lived tokens last 60 days and can be refreshed once they are at least
 *  24 h old. Returns the new token and its lifetime in seconds. */
export async function refreshLongLivedToken(token: string): Promise<IgResult<{ accessToken: string; expiresIn: number }>> {
  const r = await ig<{ access_token?: string; expires_in?: number }>("/refresh_access_token", {
    base: "https://graph.instagram.com",
    params: { grant_type: "ig_refresh_token", access_token: token },
  });
  if (!r.ok) return r;
  if (!r.value.access_token) return { ok: false, error: "Instagram returned no token." };
  return { ok: true, value: { accessToken: r.value.access_token, expiresIn: Number(r.value.expires_in) || 60 * 86400 } };
}

/** Long-lived tokens are issued for 60 days; their age follows from the expiry. */
export const IG_TOKEN_LIFETIME_MS = 60 * 86400_000;

/** Whether the token can publish at all. Instagram Login returns the granted
 *  permissions with the token; the connection stores them. */
export const PUBLISH_SCOPE = "instagram_business_content_publish";
export const canPublish = (scopes: string[] | null | undefined): boolean =>
  Array.isArray(scopes) && scopes.includes(PUBLISH_SCOPE);

/**
 * Whether an Instagram error is worth another attempt later. Documented
 * transient codes: 1, 2 (unknown / service), 4, 17, 32, 613 (rate limits),
 * 341 (temporary block), 9007 (media not ready). Everything else (190 token,
 * 100 bad parameter, 9004 media fetch, 36000+ media rules) is final.
 */
export function igRetryable(code: number | undefined): boolean {
  if (code == null) return true; // network / unreadable answer
  return [1, 2, 4, 17, 32, 341, 613, 9007].includes(code);
}
