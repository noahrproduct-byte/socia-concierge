// Facebook Page data sync. Same principles as the Instagram sync:
// real values or clearly unavailable — a missing key means Meta didn't
// provide it, never zero. Tokens stay server-side.

import { FB_GRAPH_V } from "./facebook";

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
};

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

    // published_posts (the Page's OWN posts) needs only pages_read_engagement,
    // which SOCIA requests. /posts reads all content incl. visitor posts and
    // needs pages_read_user_content (error #10), so we don't use it.
    const postsUrl = new URL(`${BASE}/${pageId}/published_posts`);
    postsUrl.searchParams.set(
      "fields",
      "id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
    );
    postsUrl.searchParams.set("limit", "25");
    postsUrl.searchParams.set("access_token", token);

    const [pRes, mRes] = await Promise.all([
      fetch(pageUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(postsUrl, { signal: AbortSignal.timeout(10000) }),
    ]);
    const pJson = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      const code = pJson?.error?.code;
      return { page: {}, posts: [], authExpired: code === 190 };
    }
    let posts: FbPost[] = [];
    const mJson = await mRes.json().catch(() => null);
    if (mRes.ok) {
      type Raw = {
        id?: string; message?: string; created_time?: string; permalink_url?: string;
        full_picture?: string; status_type?: string;
        shares?: { count?: number };
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
      };
      posts = ((mJson?.data ?? []) as Raw[]).map((r) => ({
        id: r.id,
        message: r.message,
        created_time: r.created_time,
        permalink_url: r.permalink_url,
        full_picture: r.full_picture,
        status_type: r.status_type,
        // presence-checked: absent in the API response stays absent here
        ...(r.reactions?.summary?.total_count != null ? { reactions: r.reactions.summary.total_count } : {}),
        ...(r.comments?.summary?.total_count != null ? { comments: r.comments.summary.total_count } : {}),
        ...(r.shares?.count != null ? { shares: r.shares.count } : {}),
      }));
    }
    // Diagnostic (temporary): the Page fields call succeeds with basic access,
    // but reading the Page's posts needs pages_read_engagement — when it's
    // missing, /posts errors and we'd silently store zero posts. Surface the
    // exact status/error so we can tell "no permission" from "no posts". No
    // tokens are logged. Remove once Facebook post data is confirmed working.
    console.error("[fb-diag]", postsUrl.pathname, JSON.stringify({ status: mRes.status, ok: mRes.ok, stored: posts.length, apiCount: Array.isArray(mJson?.data) ? mJson.data.length : null, error: mRes.ok ? null : (mJson?.error ?? null) }));
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
      .eq("user_id", userId);
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
    .eq("user_id", userId);

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

/** The connection row, reading plan_suspended_at when that column exists. */
async function readFbRow(supabase: Supa, userId: string): Promise<FbRow | null> {
  try {
    const { data, error } = await supabase
      .from("facebook_connections")
      .select(`${FB_SNAPSHOT_COLS}, plan_suspended_at`)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return (data as FbRow | null) ?? null;
  } catch {
    /* pre-migration: retry without the column */
  }
  const { data } = await supabase
    .from("facebook_connections")
    .select(FB_SNAPSHOT_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as FbRow | null) ?? null;
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
