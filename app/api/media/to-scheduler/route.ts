import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveConnection } from "@/lib/instagramSync";
import { isMissingColumnError } from "@/lib/workspaces";
import { copyToScheduledMedia } from "@/lib/aiStudio/media";
import { aiErrorResponse } from "@/lib/aiStudio/auth";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { kind: "clip" | "generation", id } -> { postId, href }
// Copies a finished clip or generation into the scheduler's bucket and saves
// it as a DRAFT post (never scheduled or published from here); the person
// reviews it in Create Post.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { kind?: string; id?: string } | null;
  if ((body?.kind !== "clip" && body?.kind !== "generation") || typeof body.id !== "string") return NextResponse.json({ error: "Say which clip or generation." }, { status: 400 });
  const feature = body.kind === "clip" ? "ai_clipper" : "ai_studio";
  const { ent, denied } = await requireFeature(ctx.client, ctx.ownerId, feature);
  if (denied) return denied;
  const { denied: noScheduling } = await requireFeature(ctx.client, ctx.ownerId, "scheduling", ent);
  if (noScheduling) return noScheduling;
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  try {
    let path: string | null = null;
    let caption = "";
    let isVideo = true;
    let ext = "mp4";
    if (body.kind === "clip") {
      const { data } = await ctx.client.from("clips").select("video_path, caption, hashtags").eq("id", body.id).eq("user_id", ctx.ownerId).maybeSingle();
      const c = data as { video_path: string | null; caption: string | null; hashtags: string[] } | null;
      if (!c) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
      path = c.video_path;
      caption = [c.caption ?? "", (c.hashtags ?? []).map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
    } else {
      const { data } = await ctx.client.from("generations").select("output_path, kind, caption, hashtags").eq("id", body.id).eq("user_id", ctx.ownerId).maybeSingle();
      const g = data as { output_path: string | null; kind: "video" | "image"; caption: string | null; hashtags: string[] } | null;
      if (!g) return NextResponse.json({ error: "That generation does not exist." }, { status: 404 });
      path = g.output_path;
      isVideo = g.kind === "video";
      ext = isVideo ? "mp4" : (g.output_path ?? "").split(".").pop() || "jpg";
      caption = [g.caption ?? "", (g.hashtags ?? []).map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
    }
    if (!path) return NextResponse.json({ error: "This file is not stored yet. Try again in a moment." }, { status: 409 });
    const media = await copyToScheduledMedia(svc, path, ctx.ownerId, ext);
    const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null).catch(() => null)) as { ig_user_id?: string } | null;
    const when = new Date(Date.now() + 24 * 3600_000);
    when.setUTCMinutes(0, 0, 0);
    const draft: Record<string, unknown> = {
      user_id: ctx.ownerId, ig_user_id: conn?.ig_user_id ?? null, scheduled_at: when.toISOString(),
      caption: caption.slice(0, 2200), media_type: isVideo ? "REELS" : "IMAGE", media_path: media.path, media_url: media.publicUrl, status: "draft",
    };
    let ins = ctx.workspace
      ? await ctx.client.from("scheduled_posts").insert({ ...draft, workspace_id: ctx.workspace.id }).select("id").single()
      : await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
    if (ins.error && ctx.workspace && isMissingColumnError(ins.error)) ins = await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
    if (ins.error) return dbErrorResponse("media/to-scheduler", ins.error);
    const postId = (ins.data as { id: string }).id;
    // The clip remembers the post it became, so SOCIA's clipper learns from how it did (lib/clipper/learn.ts).
    if (body.kind === "clip") {
      const link = await svc.from("clips").update({ post_id: postId }).eq("id", body.id).eq("user_id", ctx.ownerId);
      if (link.error) console.error("[media/to-scheduler] clip not linked to its post:", link.error.message);
    }
    return NextResponse.json({ postId, href: `/create?post=${encodeURIComponent(postId)}&from=ai` });
  } catch (e) {
    return aiErrorResponse("media/to-scheduler", e);
  }
}
