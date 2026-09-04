// Instagram Content Publishing (Instagram API with Instagram Login).
//
// Publishing is two steps, and the second is asynchronous:
//   1. create a media container from a PUBLIC media URL + caption
//   2. once Instagram reports the container FINISHED, publish it
// A Reel can take anywhere from seconds to a couple of minutes to process, so
// callers poll `containerStatus` and may finish on a later run.
//
// Requires the `instagram_business_content_publish` scope on the token. Every
// function returns Instagram's own error message on failure — the UI shows
// that message, not a guess at what went wrong.

const IG_V = "v23.0";
const BASE = `https://graph.instagram.com/${IG_V}`;

export type IgResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: number };

async function ig<T>(path: string, init: RequestInit & { params?: Record<string, string> }): Promise<IgResult<T>> {
  const u = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) u.searchParams.set(k, v);
  try {
    const res = await fetch(u, { method: init.method ?? "GET", signal: AbortSignal.timeout(20000) });
    const j = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: number; error_user_msg?: string } }) | null;
    if (!res.ok || j?.error) {
      const e = j?.error;
      return { ok: false, error: e?.error_user_msg || e?.message || `Instagram returned ${res.status}`, code: e?.code };
    }
    return { ok: true, value: j as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Instagram couldn't be reached" };
  }
}

/** Step 1: a container. Reels need `video_url`; images need `image_url`.
 *  The URL must be publicly fetchable by Instagram's servers. */
export async function createContainer(
  igUserId: string,
  token: string,
  input: { mediaType: "REELS" | "IMAGE"; mediaUrl: string; caption: string },
): Promise<IgResult<{ id: string }>> {
  const params: Record<string, string> = {
    caption: input.caption.slice(0, 2200),
    access_token: token,
  };
  if (input.mediaType === "REELS") {
    params.media_type = "REELS";
    params.video_url = input.mediaUrl;
    params.share_to_feed = "true";
  } else {
    params.image_url = input.mediaUrl;
  }
  return ig<{ id: string }>(`/${igUserId}/media`, { method: "POST", params });
}

/** Processing state of a container. */
export async function containerStatus(
  containerId: string,
  token: string,
): Promise<IgResult<{ status_code: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED"; status?: string }>> {
  return ig(`/${containerId}`, { params: { fields: "status_code,status", access_token: token } });
}

/** Step 2: publish a FINISHED container. Returns the real media id. */
export async function publishContainer(
  igUserId: string,
  token: string,
  containerId: string,
): Promise<IgResult<{ id: string }>> {
  return ig<{ id: string }>(`/${igUserId}/media_publish`, {
    method: "POST",
    params: { creation_id: containerId, access_token: token },
  });
}

/** The published post's permalink, for the calendar to link to. */
export async function mediaPermalink(mediaId: string, token: string): Promise<string | null> {
  const r = await ig<{ permalink?: string }>(`/${mediaId}`, { params: { fields: "permalink", access_token: token } });
  return r.ok ? r.value.permalink ?? null : null;
}

/** Whether the token can publish at all. Instagram Login returns the granted
 *  permissions with the token; the connection stores them. */
export const PUBLISH_SCOPE = "instagram_business_content_publish";
export const canPublish = (scopes: string[] | null | undefined): boolean =>
  Array.isArray(scopes) && scopes.includes(PUBLISH_SCOPE);
