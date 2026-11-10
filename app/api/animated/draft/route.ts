import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { getActiveConnection } from "@/lib/instagramSync";
import { isMissingColumnError, scopeToWorkspace } from "@/lib/workspaces";
import { isOwnPath } from "@/lib/storagePaths";
import { stampPostAuthor } from "@/lib/teamWorkServer";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

// POST { path, caption, planId?, planDay? } -> { postId, href }
// An animated "Make it with AI" video this browser rendered and uploaded to
// scheduled-media/<uid>/animated/: save it as a DRAFT post (never scheduled or
// published from here; the person reviews it in Create Post), tied to its plan
// day when it came from one.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { path?: unknown; caption?: unknown; planId?: unknown; planDay?: unknown } | null;
  const path = typeof b?.path === "string" ? b.path : "";
  if (!path || !isOwnPath(path, [user.id]) || path.split("/")[1] !== "animated" || !/\.mp4$/.test(path)) return NextResponse.json({ error: "That media file is not yours." }, { status: 403 });
  const caption = typeof b?.caption === "string" ? b.caption.slice(0, 2200) : "";
  let planId = typeof b?.planId === "string" && /^[0-9a-f-]{36}$/i.test(b.planId) ? b.planId : null;
  const planDay = typeof b?.planDay === "string" ? b.planDay.slice(0, 20) : null;
  if (planId) {
    const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id").eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
    if (!data) planId = null;
  }
  const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null).catch(() => null)) as { ig_user_id?: string } | null;
  const { data: pub } = ctx.client.storage.from("scheduled-media").getPublicUrl(path);
  // A placeholder slot a day out, on the hour: the person picks the real time in Create Post.
  const when = new Date(Date.now() + 24 * 3600_000);
  when.setUTCMinutes(0, 0, 0);
  const draft: Record<string, unknown> = {
    user_id: ctx.ownerId, ig_user_id: conn?.ig_user_id ?? null, scheduled_at: when.toISOString(),
    caption, media_type: "REELS", media_path: path, media_url: pub.publicUrl, status: "draft",
    ...(planId ? { plan_id: planId, plan_day: planDay } : {}),
  };
  let ins = ctx.workspace
    ? await ctx.client.from("scheduled_posts").insert({ ...draft, workspace_id: ctx.workspace.id }).select("id").single()
    : await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
  if (ins.error && ctx.workspace && isMissingColumnError(ins.error)) ins = await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
  if (ins.error) return dbErrorResponse("animated/draft", ins.error);
  const postId = (ins.data as { id: string }).id;
  await stampPostAuthor(ctx.client, ctx.ownerId, postId, user.id);
  return NextResponse.json({ postId, href: `/create?post=${encodeURIComponent(postId)}&from=ai` });
}
