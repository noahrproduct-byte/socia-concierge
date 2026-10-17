import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { getActiveConnection } from "@/lib/instagramSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET — why Comments finds nothing: asks Instagram for the comments on the
// connected account's most-commented recent posts in three ways and reports
// what came back (HTTP status, how many, the error, which fields). Never
// returns a token or anyone's comment text. Owner or admin of the workspace.

const BASE = "https://graph.instagram.com/v23.0";

type Probe = { status: number; count: number | null; error: string | null; code: number | null; fields: string[] };

async function probe(path: string, params: Record<string, string>, token: string, pick: (j: Record<string, unknown>) => unknown[] | null): Promise<Probe> {
  const u = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    const j = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const err = j.error as { message?: string; code?: number } | undefined;
    const list = err ? null : pick(j);
    const first = list?.[0] as Record<string, unknown> | undefined;
    return { status: res.status, count: list ? list.length : null, error: err?.message ?? null, code: err?.code ?? null, fields: first ? Object.keys(first) : [] };
  } catch (e) {
    return { status: 0, count: null, error: (e as Error)?.message ?? "request failed", code: null, fields: [] };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });

  const conn = ((await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id, username, access_token, scopes, media", ctx.workspace?.id ?? null).catch(() => null))
    ?? (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id, username, access_token, media", ctx.workspace?.id ?? null))) as Record<string, unknown> | null;
  if (!conn?.access_token) return NextResponse.json({ error: "Instagram isn't connected in this workspace." }, { status: 400 });
  const token = String(conn.access_token);

  const media = (Array.isArray(conn.media) ? conn.media : []) as { id?: string; comments_count?: number; collab_owner?: string; timestamp?: string }[];
  const withComments = media.filter((m) => m.id && !m.collab_owner && (m.comments_count ?? 0) > 0).slice(0, 3);

  const me = await probe("/me", { fields: "user_id,username,account_type" }, token, (j) => [j]);
  const posts = await Promise.all(withComments.map(async (m) => ({
    posted: m.timestamp ?? null,
    instagram_says_comments: m.comments_count ?? null,
    as_socia_asks: await probe(`/${m.id}/comments`, { fields: "id,text,username,timestamp,like_count,from{id,username}", limit: "25" }, token, (j) => (Array.isArray(j.data) ? j.data : null)),
    default_fields: await probe(`/${m.id}/comments`, {}, token, (j) => (Array.isArray(j.data) ? j.data : null)),
    via_media: await probe(`/${m.id}`, { fields: "comments_count,comments{id,text,username}" }, token, (j) => {
      const c = j.comments as { data?: unknown[] } | undefined;
      return Array.isArray(c?.data) ? c!.data! : [];
    }),
  })));

  return NextResponse.json({
    account: conn.username ?? null,
    granted_at_connect: Array.isArray(conn.scopes) ? conn.scopes : "not recorded",
    me,
    synced_posts: media.length,
    posts_with_comments: withComments.length,
    posts,
  });
}
