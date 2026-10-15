// Collab posts the connected account joined as a collaborator (another account
// posted them; this one accepted the invite). Instagram's /media edge leaves
// them out, so they are read from `collaborative_media` (Meta changelog,
// 2026-04-22: "retrieve all media where your app user is an accepted
// collaborator"). Meta documents that edge for the Facebook-Login API; SOCIA
// connects through Instagram Login, so whether Instagram serves it here is
// only known from its answer, which the sync records (collab_status).
//
// Numbers are the post's own totals as Instagram reports them to a
// collaborator: likes, comments, total views, saves, shares. Reach and other
// insights belong to the account that posted it and are never filled in.

import type { IgMediaItem } from "./instagramSync";

const IG_V = "v23.0";

const FULL_FIELDS = "id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url,username,saved_count,shares_count,total_views_count";
const BASE_FIELDS = "id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url,username";

export type CollabFetch =
  | { ok: true; media: IgMediaItem[] }
  | { ok: false; error: string; code: number | null };

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** One collaborative_media row as a media item. Pure. A metric is set only when Instagram returned it. */
export function collabItem(raw: Record<string, unknown>): IgMediaItem | null {
  const id = str(raw.id);
  if (!id) return null;
  const insights: NonNullable<IgMediaItem["insights"]> = {};
  const views = num(raw.total_views_count);
  const saved = num(raw.saved_count);
  const shares = num(raw.shares_count);
  if (views != null) insights.views = views;
  if (saved != null) insights.saved = saved;
  if (shares != null) insights.shares = shares;
  return {
    id,
    caption: str(raw.caption),
    media_type: str(raw.media_type),
    media_product_type: str(raw.media_product_type),
    like_count: num(raw.like_count),
    comments_count: num(raw.comments_count),
    timestamp: str(raw.timestamp),
    permalink: str(raw.permalink),
    media_url: str(raw.media_url),
    thumbnail_url: str(raw.thumbnail_url),
    // Who posted it. Without a username the row still counts as a collab.
    collab_owner: str(raw.username) ?? "another account",
    ...(Object.keys(insights).length ? { insights } : {}),
  };
}

/** The account's own posts plus the collabs it joined, newest first, never twice. Pure. */
export function mergeCollab(own: IgMediaItem[], collab: IgMediaItem[]): IgMediaItem[] {
  const seen = new Set(own.map((m) => m.id).filter(Boolean));
  const extra = collab.filter((m) => m.id && !seen.has(m.id));
  if (!extra.length) return own;
  const at = (m: IgMediaItem) => (m.timestamp ? new Date(m.timestamp).getTime() : 0);
  return [...own, ...extra].sort((a, b) => at(b) - at(a));
}

async function call(token: string, fields: string): Promise<{ ok: true; data: unknown[] } | { ok: false; error: string; code: number | null }> {
  const u = new URL(`https://graph.instagram.com/${IG_V}/me/collaborative_media`);
  u.searchParams.set("fields", fields);
  u.searchParams.set("limit", "50");
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as { data?: unknown[]; error?: { message?: string; code?: number } } | null;
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}`, code: typeof json?.error?.code === "number" ? json.error.code : null };
    }
    return { ok: true, data: Array.isArray(json?.data) ? json!.data : [] };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "Request failed", code: null };
  }
}

/** Ask Instagram for the collabs this account joined. Never throws; returns Instagram's own error when it refuses. */
export async function fetchCollabMedia(token: string): Promise<CollabFetch> {
  let r = await call(token, FULL_FIELDS);
  // The newer count fields may not exist on this API: ask again without them.
  if (!r.ok && /nonexisting field|Tried accessing/i.test(r.error)) r = await call(token, BASE_FIELDS);
  if (!r.ok) return r;
  const media = r.data
    .map((d) => (d && typeof d === "object" ? collabItem(d as Record<string, unknown>) : null))
    .filter((m): m is IgMediaItem => m != null);
  return { ok: true, media };
}
