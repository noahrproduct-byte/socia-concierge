import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { clipBuild, getProjectRow } from "@/lib/studioClips/server";
import { readPresets } from "@/lib/studioClips/styleStore";

export const runtime = "nodejs";

// POST { clipId } -> one clip as its own post (Make and schedule: "each clip
// on its own"): opened as it was, or started from the whole clip in the
// brand's preset. No model call and nothing counted; rendered in the browser.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { clipId?: unknown } | null;
  const clipId = typeof body?.clipId === "string" ? body.clipId : "";
  if (!clipId) return NextResponse.json({ error: "Choose a clip." }, { status: 400 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const preset = (await readPresets(ctx).catch(() => null))?.brand ?? null;
    const build = await clipBuild(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, project, clipId, preset });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
