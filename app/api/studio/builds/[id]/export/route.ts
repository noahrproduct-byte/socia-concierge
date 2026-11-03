import { NextResponse } from "next/server";
import { getEntitlements, releaseUsage } from "@/lib/entitlements";
import { requireFeature, requireUsage } from "@/lib/planGuard";
import { rateHit } from "@/lib/oauth/runtime";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadBuildRow, isOwnCutIdx } from "@/lib/studioClips/server";
import { signedExportPath, verifyExportPath } from "@/lib/studioClips/exportToken";
import { cutCounted, handOverCut } from "@/lib/studioClips/cutMeter";

export const runtime = "nodejs";

// The video is rendered in the browser; this is where the plan is enforced.
//   POST   -> SOCIA's cut counts one "video build" when it is handed over
//             (opened in the builder: lib/studioClips/cutMeter.ts), so here
//             only a cut not counted yet counts; the person's own edit
//             (Editor V1) never does: it costs SOCIA no AI and no server
//             render. Returns the signed storage path the browser uploads
//             the result to (its own uid prefix in scheduled-media). Saving
//             the draft requires that signature.
//             Before supabase/studio-cut-meter.sql has run, cuts aren't
//             tracked and every export of SOCIA's cut counts, as before.
//   DELETE { path } -> the render or upload failed afterwards: give back a
//             unit the export itself took (untracked cuts only), once per
//             issued path, and never for a path that was saved. A cut counted
//             when it was opened stays counted: the person has it.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!row) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    const path = signedExportPath(viewerId, id);
    if (!path) return NextResponse.json({ error: "Exporting isn't set up on this server." }, { status: 503 });
    if (isOwnCutIdx(row.opportunity_idx)) {
      const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
      if (denied) return denied;
      return NextResponse.json({ path, usage: null });
    }
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const handed = await handOverCut(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, row);
    if (!handed.ok) return handed.res;
    if (handed.tracked) return NextResponse.json({ path, usage: handed.usage });
    const u = await requireUsage(ctx.client, ctx.ownerId, "video_builds", { feature: "auto_build" });
    if (u.denied) return u.denied;
    return NextResponse.json({ path, usage: u.usage });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    console.error("[studio/export]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "Couldn't start the export." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!verifyExportPath(path, viewerId, id)) return NextResponse.json({ error: "Nothing to give back for that export." }, { status: 400 });
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!row) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    // The person's own edit counted nothing, so there is nothing to give back.
    if (isOwnCutIdx(row.opportunity_idx)) return NextResponse.json({ ok: true, refunded: false });
    // A render that was kept is not refunded.
    if ((row as { render_path?: string | null }).render_path === path) return NextResponse.json({ ok: true, refunded: false });
    // Counted when it was opened, not by this export: nothing of the export's to give back.
    if ((await cutCounted(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id)) !== null) return NextResponse.json({ ok: true, refunded: false });
    // Once per issued path (atomic): a second DELETE for the same export does nothing.
    if ((await rateHit(`build-refund:${path}`, 7 * 24 * 3600, 1)) !== "ok") return NextResponse.json({ ok: true, refunded: false });
    await releaseUsage(ctx.client, await getEntitlements(ctx.client, ctx.ownerId), "video_builds");
    return NextResponse.json({ ok: true, refunded: true });
  } catch (e) {
    console.error("[studio/export] refund", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "Couldn't give the build back just now." }, { status: 500 });
  }
}
