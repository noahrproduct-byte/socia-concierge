import { NextResponse } from "next/server";
import { getEntitlements, releaseUsage } from "@/lib/entitlements";
import { requireUsage } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadBuildRow } from "@/lib/studioClips/server";

export const runtime = "nodejs";

// The video is rendered in the browser; this is where the plan is enforced.
//   POST   -> one "video build" counted; returns the storage path the browser
//             may upload the result to (its own uid prefix in scheduled-media)
//   DELETE -> the render or upload failed afterwards: give the unit back
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, id);
    if (!row) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    const u = await requireUsage(ctx.client, ctx.ownerId, "video_builds", { feature: "auto_build" });
    if (u.denied) return u.denied;
    return NextResponse.json({ path: `${viewerId}/studio/${id}/${Date.now()}.mp4`, usage: u.usage });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, id);
    if (!row) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    await releaseUsage(ctx.client, await getEntitlements(ctx.client, ctx.ownerId), "video_builds");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
