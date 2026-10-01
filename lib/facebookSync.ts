// Facebook Page data sync. Same principles as the Instagram sync:
// real values or clearly unavailable — a missing key means Meta didn't
// provide it, never zero. Tokens stay server-side.

import { FB_GRAPH_V } from "./facebook";
import { activeWorkspaceId, workspacesEnabled } from "./workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type FbPost = {
  id?: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  reactions?: number; // total reactions, when provided
  comments?: number; // total comments, when provided
  shares?: number; // share count, when provided
  /** Reactions by type, when Facebook returned the per-type breakdown. */
  reactionTypes?: Partial<Record<FbReaction, number>>;
};

export const FB_REACTIONS = ["like", "love", "care", "haha", "wow", "sad", "angry"] as const;
export type FbReaction = (typeof FB_REACTIONS)[number];

/** How many of the Page's most recent posts a sync reads (the API's per-call maximum). */
export const FB_POST_LIMIT = 100;

export type FbSnapshot = {
  page_id: string | null;
  page_name: string | null;
  username: string | null;
  followers_count: number | null;
  picture_url: string | null;
  posts: FbPost[];
  last_synced_at: string | null;
  /**
   * connected | choose_page | expired | suspended | error
   * "suspended" = paused by a plan downgrade: the row is kept, nothing is read.
   */
  status: "connected" | "choose_page" | "expired" | "suspended" | "error";
  /** What this Page's data actually provides (capability map). */
  capabilities: {
    followers: boolean;
    reactions: boolean;
    comments: boolean;
    shares: boolean;
    posts: boolean;
    views: false; // regular Page posts don't expose a views count here — never faked
  };
};

const STALE_MS = 6 * 60 * 60 * 1000;
const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;

function caps(posts: FbPost[], followers: number | null): FbSnapshot["capabilities"] {
  return {
    followers: followers != null,
    reactions: posts.some((p) => p.reactions != null),
    comments: posts.some((p) => p.comments != null),
    shares: posts.some((p) => p.shares != null),
    posts: posts.length > 0,
    views: false,
  };
}

async function fetchPage(token: string, pageId: string): Promise<{
  page: Record<string, unknown>;
  posts: FbPost[];
  authExpired: boolean;
} | null> {
  try {
    const pageUrl = new URL(`${BASE}/${pageId}`);
    pageUrl.searchParams.set("fields", "id,name,username,followers_count,fan_count,picture{url},link");
    pageUrl.searchParams.set("access_token", token);

    // The Page's own posts (/published_posts). Reactions/comments summaries
    // need pages_read_user_content (Advanced Access via App Review); requesting
    // them when the app lacks it makes the WHOLE call fail with error #10, so
    // zero posts would be stored. Try the full field set, then fall back to the
    // fields pages_read_engagement allows (posts + shares) — so posts always
    // sync, and reactions/comments fill in automatically once
    // pages_read_user_content is granted.
    const POST_FIELDS_FULL = "id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
    const POST_FIELDS_SAFE = "id,message,created_time,permalink_url,full_picture,status_type,shares";
    // Richest set: the reactions total plus one aliased count per reaction
    // type. Field aliasing isn't supported on every edge, so this is tried
    // first and the call falls back to the plain total if Facebook rejects it.
    const POST_FIELDS_TYPES =
      "id,message,created_time,permalink_url,full_picture,status_type,shares,comments.summary(total_count).limit(0),reactions.summary(total_count).limit(0).as(rx_total)," +
      FB_REACTIONS.map((t) => `reactions.type(${t.toUpperCase()}).summary(total_count).limit(0).as(rx_${t})`).join(",");
    const getPosts = async (fields: string) => {
      const u = new URL(`${BASE}/${pageId}/published_posts`);
      u.searchParams.set("fields", fields);
      u.searchParams.set("limit", String(FB_POST_LIMIT));
      u.searchParams.set("access_token", token);
      const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
      return { r, j: (await r.json().catch(() => null)) as { data?: unknown[] } | null };
    };

    const pRes = await fetch(pageUrl, { signal: AbortSignal.timeout(10000) });
    const pJson = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      const code = pJson?.error?.code;
      return { page: {}, posts: [], authExpired: code === 190 };
    }

    let postsResp = await getPosts(POST_FIELDS_TYPES);
    if (!postsResp.r.ok) postsResp = await getPosts(POST_FIELDS_FULL);
    if (!postsResp.r.ok) postsResp = await getPosts(POST_FIELDS_SAFE);
    const mRes = postsResp.r;
    const mJson = postsResp.j;
    let posts: FbPost[] = [];
    if (mRes.ok) {
      type Raw = {
        id?: string; message?: string; created_time?: string; permalink_url?: string;
        full_picture?: string; status_type?: string;
        shares?: { count?: number };
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
      } & Record<string, unknown>;
      const aliased = (r: Raw, key: string): number | undefined => {
        const v = r[key] as { summary?: { total_count?: number } } | undefined;
        return typeof v?.summary?.total_count === "number" ? v.summary.total_count : undefined;
      };
      posts = ((mJson?.data ?? []) as Raw[]).map((r) => {
        const total = r.reactions?.summary?.total_count ?? aliased(r, "rx_total");
        const types: Partial<Record<FbReaction, number>> = {};
        for (const t of FB_REACTIONS) {
          const n = aliased(r, `rx_${t}`);
          if (n != null) types[t] = n;
        }
        return {
          id: r.id,
          message: r.message,
          created_time: r.created_time,
          permalink_url: r.permalink_url,
          full_picture: r.full_picture,
          status_type: r.status_type,
          // presence-checked: absent in the API response stays absent here
          ...(total != null ? { reactions: total } : {}),
          ...(r.comments?.summary?.total_count != null ? { comments: r.comments.summary.total_count } : {}),
          ...(r.shares?.count != null ? { shares: r.shares.count } : {}),
          ...(Object.keys(types).length ? { reactionTypes: types } : {}),
        };
      });
    }
    return { page: pJson ?? {}, posts, authExpired: false };
  } catch {
    return null;
  }
}

/** Force-sync the connected Page; returns the fresh snapshot or null. */
export async function syncFacebook(supabase: Supa, userId: string): Promise<FbSnapshot | null> {
  const conn = await readFbRow(supabase, userId);
  // A Page paused by a plan downgrade is never read, not even on a manual sync.
  if (!conn?.access_token || !conn.page_id || conn.plan_suspended_at != null) return null;

  const fresh = await fetchPage(conn.access_token, conn.page_id);
  const now = new Date().toISOString();

  if (!fresh) return null;
  if (fresh.authExpired) {
    await supabase
      .from("facebook_connections")
      .update({ connection_status: "expired" })
      .eq("user_id", userId)
      .eq("page_id", conn.page_id);
    return null;
  }

  const p = fresh.page;
  const followers = (p.followers_count as number) ?? (p.fan_count as number) ?? null;
  const picture = (p.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null;

  await supabase
    .from("facebook_connections")
    .update({
      page_name: (p.name as string) ?? null,
      username: (p.username as string) ?? null,
      followers_count: followers,
      picture_url: picture,
      profile: p,
      media: fresh.posts,
      connection_status: "connected",
      last_synced_at: now,
    })
    .eq("user_id", userId)
    .eq("page_id", conn.page_id);

  return {
    page_id: conn.page_id,
    page_name: (p.name as string) ?? null,
    username: (p.username as string) ?? null,
    followers_count: followers,
    picture_url: picture,
    posts: fresh.posts,
    last_synced_at: now,
    status: "connected",
    capabilities: caps(fresh.posts, followers),
  };
}

const FB_SNAPSHOT_COLS = "page_id, page_name, username, access_token, picture_url, followers_count, media, connection_status, last_synced_at";

type FbRow = {
  page_id?: string | null;
  page_name?: string | null;
  username?: string | null;
  access_token?: string | null;
  picture_url?: string | null;
  followers_count?: number | null;
  media?: unknown;
  connection_status?: string | null;
  last_synced_at?: string | null;
  plan_suspended_at?: string | null;
};

/**
 * The connection row, reading plan_suspended_at when that column exists. When
 * Brand Workspaces are enabled the row is scoped to the active workspace (a
 * user may then hold one Facebook Page per workspace); otherwise it is the one
 * row per user. Reads take the first matching row rather than maybeSingle, so a
 * user with several workspaces never trips "multiple rows returned".
 */
async function readFbRow(supabase: Supa, userId: string): Promise<FbRow | null> {
  const wsId = (await workspacesEnabled(supabase)) ? await activeWorkspaceId(supabase, userId) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (wsId ? q.eq("workspace_id", wsId) : q);
  try {
    const { data, error } = await scope(
      supabase.from("facebook_connections").select(`${FB_SNAPSHOT_COLS}, plan_suspended_at`).eq("user_id", userId),
    ).limit(1);
    if (!error) return ((data as FbRow[] | null) ?? [])[0] ?? null;
  } catch {
    /* pre-migration: retry without the column */
  }
  const { data } = await scope(
    supabase.from("facebook_connections").select(FB_SNAPSHOT_COLS).eq("user_id", userId),
  ).limit(1);
  return ((data as FbRow[] | null) ?? [])[0] ?? null;
}

function idleStatus(row: FbRow): FbSnapshot["status"] {
  if (row.plan_suspended_at != null) return "suspended";
  if (row.connection_status === "choose_page" || row.connection_status === "expired") return row.connection_status;
  return "error";
}

/** Cached snapshot, auto-syncing when stale. Returns null when no usable
 *  connection exists; a non-null result with status "expired", "choose_page"
 *  or "suspended" tells the UI what attention is needed. A suspended Page
 *  (paused by a plan downgrade) is never read from Meta. */
export async function getFbSnapshot(supabase: Supa, userId: string): Promise<FbSnapshot | null> {
  const row = await readFbRow(supabase, userId);
  if (!row) return null;

  if (
    row.plan_suspended_at != null ||
    row.connection_status === "choose_page" ||
    row.connection_status === "expired" ||
    !row.access_token
  ) {
    return {
      page_id: row.page_id ?? null,
      page_name: row.page_name ?? null,
      username: row.username ?? null,
      followers_count: row.followers_count ?? null,
      picture_url: row.picture_url ?? null,
      posts: [],
      last_synced_at: row.last_synced_at ?? null,
      status: idleStatus(row),
      capabilities: caps([], null),
    };
  }

  const stale =
    !row.last_synced_at || Date.now() - new Date(row.last_synced_at).getTime() > STALE_MS;
  if (stale) {
    const fresh = await syncFacebook(supabase, userId);
    if (fresh) return fresh;
  }

  const posts: FbPost[] = Array.isArray(row.media) ? (row.media as FbPost[]) : [];
  return {
    page_id: row.page_id ?? null,
    page_name: row.page_name ?? null,
    username: row.username ?? null,
    followers_count: row.followers_count ?? null,
    picture_url: row.picture_url ?? null,
    posts,
    last_synced_at: row.last_synced_at ?? null,
    status: "connected",
    capabilities: caps(posts, row.followers_count ?? null),
  };
}
