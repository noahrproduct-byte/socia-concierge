import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { getActiveConnection } from "@/lib/instagramSync";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadBuildRow, markRendered } from "@/lib/studioClips/server";

export const runtime = "nodejs";

// POST { path, durationSec, caption } — the rendered video is in storage:
// save it as a DRAFT post in the Calendar (never scheduled or published from
// here; the person reviews it in Create Post) and record the render on the
// build. The path must be the one this browser was given (its own uid prefix).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { path?: string; durationSec?: number; caption?: string } | null;
  if (!body?.path || !body.path.startsWith(`${viewerId}/studio/${id}/`)) return NextResponse.json({ error: "That media file is not yours." }, { status: 403 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const row = await loadBuildRow(ctx.client, ctx.ownerId, id);
    if (!row) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });

    const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null)) as { ig_user_id?: string } | null;
    const { data: pub } = ctx.client.storage.from("scheduled-media").getPublicUrl(body.path);

    // A post already planned for this build (Plan These Posts) keeps its day: the video goes onto that draft.
    if (row.post_id) {
      const { data: cur } = await ctx.client.from("scheduled_posts").select("id, status").eq("id", row.post_id).eq("user_id", ctx.ownerId).maybeSingle();
      if ((cur as { status?: string } | null)?.status === "draft") {
        const { error } = await ctx.client.from("scheduled_posts").update({
          media_path: body.path, media_url: pub.publicUrl, media_type: "REELS",
          caption: (body.caption ?? row.caption ?? "").slice(0, 2200), updated_at: new Date().toISOString(),
        }).eq("id", row.post_id).eq("user_id", ctx.ownerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await markRendered(ctx.client, ctx.ownerId, id, { path: body.path, durationSec: typeof body.durationSec === "number" ? body.durationSec : null, postId: row.post_id });
        return NextResponse.json({ postId: row.post_id, planned: true });
      }
    }
    // A placeholder slot a day out, on the hour: the person picks the real time in Create Post.
    const when = new Date(Date.now() + 24 * 3600_000);
    when.setUTCMinutes(0, 0, 0);
    const draft: Record<string, unknown> = {
      user_id: ctx.ownerId,
      ig_user_id: conn?.ig_user_id ?? null,
      scheduled_at: when.toISOString(),
      caption: (body.caption ?? row.caption ?? "").slice(0, 2200),
      media_type: "REELS",
      media_path: body.path,
      media_url: pub.publicUrl,
      status: "draft",
    };
    let ins = ctx.workspace
      ? await ctx.client.from("scheduled_posts").insert({ ...draft, workspace_id: ctx.workspace.id }).select("id").single()
      : await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
    if (ins.error && ctx.workspace) ins = await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    const postId = (ins.data as { id: string }).id;
    await markRendered(ctx.client, ctx.ownerId, id, { path: body.path, durationSec: typeof body.durationSec === "number" ? body.durationSec : null, postId });
    return NextResponse.json({ postId });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
