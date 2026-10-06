// Reading and replying to comments on the workspace's own posts — Facebook
// Page posts (Page access token; pages_read_engagement + pages_read_user_content
// to read, pages_manage_engagement to reply) and Instagram media (Instagram
// Login user token; instagram_business_manage_comments). Server only.
//
// Honest by design: a platform that doesn't return comments yields an empty
// list (never a guess), and a reply either returns the platform's own reply id
// or the platform's own error message. The caller decides what to do with it;
// nothing here sends anything on its own.

import { FB_GRAPH_V } from "./facebook";
import { getActiveConnection } from "./instagramSync";
import { activeWorkspaceId, workspacesEnabled } from "./workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const FB_BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;
const IG_V = "v23.0";
const IG_BASE = `https://graph.instagram.com/${IG_V}`;
const TIMEOUT = 10000;

export type CommentPlatform = "facebook" | "instagram";

export type SocialComment = {
  platform: CommentPlatform;
  accountId: string;
  postId: string;
  postCaption: string | null;
  commentId: string;
  author: string | null;
  text: string;
  createdAt: string | null;
  likeCount: number | null;
};

export type ReplyResult = { ok: true; replyId: string | null } | { ok: false; error: string };

// ------------------------------------------------------------- facebook ----

type FbConn = { page_id: string; access_token: string };

async function readFbConn(supabase: Supa, userId: string): Promise<FbConn | null> {
  try {
    const wsId = (await workspacesEnabled(supabase)) ? await activeWorkspaceId(supabase, userId) : null;
    let q = supabase.from("facebook_connections").select("page_id, access_token, plan_suspended_at, connection_status").eq("user_id", userId);
    if (wsId) q = q.eq("workspace_id", wsId);
    const { data, error } = await q.limit(1);
    if (error) return null;
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
    if (!row?.access_token || !row.page_id || row.plan_suspended_at != null) return null;
    if (row.connection_status === "expired" || row.connection_status === "choose_page") return null;
    return { page_id: String(row.page_id), access_token: String(row.access_token) };
  } catch {
    return null;
  }
}

/** What one platform read produced: the comments, and how many posts could
 *  not be read and why. A failed read is reported, never shown as "0 comments". */
export type CommentRead = {
  comments: SocialComment[];
  postsChecked: number;
  postsFailed: number;
  problem: string | null;
  /** Comments the platform returned before SOCIA dropped the account's own ones. */
  returned: number;
};

export const IG_COMMENTS_SCOPE = "instagram_business_manage_comments";

/** A platform error as a sentence a person can act on. */
async function readProblem(res: Response, platformName: string): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
  const code = j?.error?.code;
  if (code === 10 || code === 200 || code === 3 || res.status === 403) {
    return `SOCIA doesn't have permission to read ${platformName} comments yet. Reconnect ${platformName} in Settings and allow comment access.`;
  }
  if (code === 190 || res.status === 401) return `The ${platformName} connection has expired. Reconnect it in Settings.`;
  return j?.error?.message ? `${platformName} said: ${j.error.message}` : `${platformName} returned HTTP ${res.status}.`;
}

/** Top-level comments on the given Facebook posts (newest first), excluding
 *  the Page's own comments so SOCIA never drafts replies to itself. */
export async function fetchFacebookComments(
  supabase: Supa,
  userId: string,
  posts: Array<{ id?: string; message?: string }>,
  perPost = 25,
): Promise<CommentRead> {
  const conn = await readFbConn(supabase, userId);
  if (!conn) return { comments: [], postsChecked: 0, postsFailed: 0, problem: "Facebook isn't connected in this workspace.", returned: 0 };
  const out: SocialComment[] = [];
  let checked = 0, failed = 0, returned = 0;
  let problem: string | null = null;
  for (const p of posts) {
    if (!p.id) continue;
    checked++;
    try {
      const u = new URL(`${FB_BASE}/${p.id}/comments`);
      u.searchParams.set("fields", "id,message,from{id,name},created_time,like_count");
      u.searchParams.set("filter", "toplevel");
      u.searchParams.set("order", "reverse_chronological");
      u.searchParams.set("limit", String(perPost));
      u.searchParams.set("access_token", conn.access_token);
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) {
        failed++;
        problem ??= await readProblem(res, "Facebook");
        continue;
      }
      const j = (await res.json().catch(() => null)) as { data?: Array<Record<string, unknown>> } | null;
      returned += (j?.data ?? []).length;
      for (const c of j?.data ?? []) {
        const from = c.from as { id?: string; name?: string } | undefined;
        if (from?.id && from.id === conn.page_id) continue; // our own reply
        const text = typeof c.message === "string" ? c.message.trim() : "";
        if (!text || !c.id) continue;
        out.push({
          platform: "facebook",
          accountId: conn.page_id,
          postId: p.id,
          postCaption: p.message ?? null,
          commentId: String(c.id),
          author: from?.name ?? null,
          text,
          createdAt: typeof c.created_time === "string" ? c.created_time : null,
          likeCount: typeof c.like_count === "number" ? c.like_count : null,
        });
      }
    } catch (err) {
      // this post's comments stay absent — never guessed — and the read is reported as failed
      failed++;
      problem ??= `Couldn't reach the platform: ${(err as Error).message}`;
    }
  }
  return { comments: out, postsChecked: checked, postsFailed: failed, problem, returned };
}

// ------------------------------------------------------------ instagram ----

type IgConn = { ig_user_id: string | null; username: string | null; access_token: string; scopes: string[] | null };

async function readIgConn(supabase: Supa, userId: string, workspaceId: string | null | undefined): Promise<IgConn | null> {
  // scopes (what Instagram granted at connect) may be absent on older rows
  const row = ((await getActiveConnection(supabase, userId, "ig_user_id, username, access_token, scopes", workspaceId).catch(() => null))
    ?? (await getActiveConnection(supabase, userId, "ig_user_id, username, access_token", workspaceId))) as Record<string, unknown> | null;
  if (!row?.access_token) return null;
  return {
    ig_user_id: row.ig_user_id ? String(row.ig_user_id) : null,
    username: row.username ? String(row.username) : null,
    access_token: String(row.access_token),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : null,
  };
}

/** Top-level comments on the given Instagram media (newest first), excluding
 *  the account's own comments. */
export async function fetchInstagramComments(
  supabase: Supa,
  userId: string,
  media: Array<{ id?: string; caption?: string }>,
  perPost = 25,
  workspaceId?: string | null,
): Promise<CommentRead> {
  const conn = await readIgConn(supabase, userId, workspaceId);
  if (!conn) return { comments: [], postsChecked: 0, postsFailed: 0, problem: "Instagram isn't connected in this workspace.", returned: 0 };
  const withIds = media.filter((m) => m.id).length;
  // Instagram records what it granted at connect. Without comment access it may
  // answer with an empty list rather than an error, so don't ask: say so.
  if (conn.scopes && !conn.scopes.includes(IG_COMMENTS_SCOPE)) {
    return {
      comments: [], postsChecked: withIds, postsFailed: withIds, returned: 0,
      problem: "Instagram was connected before comment access was added. Reconnect Instagram in Settings and allow comment access.",
    };
  }
  const out: SocialComment[] = [];
  let checked = 0, failed = 0, returned = 0;
  let problem: string | null = null;
  for (const m of media) {
    if (!m.id) continue;
    checked++;
    try {
      const u = new URL(`${IG_BASE}/${m.id}/comments`);
      u.searchParams.set("fields", "id,text,username,timestamp,like_count,from{id,username}");
      u.searchParams.set("limit", String(perPost));
      u.searchParams.set("access_token", conn.access_token);
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) {
        failed++;
        problem ??= await readProblem(res, "Instagram");
        continue;
      }
      const j = (await res.json().catch(() => null)) as { data?: Array<Record<string, unknown>> } | null;
      returned += (j?.data ?? []).length;
      for (const c of j?.data ?? []) {
        const from = c.from as { id?: string; username?: string } | undefined;
        const username = (from?.username ?? (typeof c.username === "string" ? c.username : null)) || null;
        if ((from?.id && conn.ig_user_id && from.id === conn.ig_user_id) || (username && conn.username && username === conn.username)) continue;
        const text = typeof c.text === "string" ? c.text.trim() : "";
        if (!text || !c.id) continue;
        out.push({
          platform: "instagram",
          accountId: conn.ig_user_id ?? "me",
          postId: m.id,
          postCaption: m.caption ?? null,
          commentId: String(c.id),
          author: username ? `@${username}` : null,
          text,
          createdAt: typeof c.timestamp === "string" ? c.timestamp : null,
          likeCount: typeof c.like_count === "number" ? c.like_count : null,
        });
      }
    } catch (err) {
      // this post's comments stay absent — never guessed — and the read is reported as failed
      failed++;
      problem ??= `Couldn't reach the platform: ${(err as Error).message}`;
    }
  }
  return { comments: out, postsChecked: checked, postsFailed: failed, problem, returned };
}

// ---------------------------------------------------------------- reply ----

async function postReply(url: URL, body: Record<string, string>): Promise<ReplyResult> {
  try {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams(body), signal: AbortSignal.timeout(TIMEOUT) });
    const j = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string; code?: number } } | null;
    if (!res.ok || j?.error) {
      const e = j?.error;
      const code = e?.code;
      if (code === 200 || code === 10 || code === 3) return { ok: false, error: "This account hasn't granted comment permissions yet. Reconnect it to enable replies." };
      if (code === 190) return { ok: false, error: "The access token has expired. Reconnect the account to reply." };
      return { ok: false, error: e?.message ? `The platform said: ${e.message}` : `The platform returned HTTP ${res.status}.` };
    }
    return { ok: true, replyId: j?.id ? String(j.id) : null };
  } catch (err) {
    return { ok: false, error: `Couldn't reach the platform: ${(err as Error).message}` };
  }
}

/** Post a reply to a comment as the connected Page / Instagram account. */
export async function replyToComment(supabase: Supa, userId: string, platform: CommentPlatform, commentId: string, message: string, workspaceId?: string | null): Promise<ReplyResult> {
  const text = message.trim();
  if (!text) return { ok: false, error: "The reply is empty." };
  if (platform === "facebook") {
    const conn = await readFbConn(supabase, userId);
    if (!conn) return { ok: false, error: "Facebook isn't connected in this workspace." };
    return postReply(new URL(`${FB_BASE}/${commentId}/comments`), { message: text, access_token: conn.access_token });
  }
  const conn = await readIgConn(supabase, userId, workspaceId);
  if (!conn) return { ok: false, error: "Instagram isn't connected in this workspace." };
  return postReply(new URL(`${IG_BASE}/${commentId}/replies`), { message: text, access_token: conn.access_token });
}
