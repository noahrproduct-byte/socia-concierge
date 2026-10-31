import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, manualBuild } from "@/lib/studioClips/server";
import { readPresets } from "@/lib/studioClips/styleStore";

export const runtime = "nodejs";

// POST -> the project's own edit (Editor V1, every plan): opened as it was,
// or started from every ready clip in upload order. No model call and nothing
// counted; the video is rendered in the browser.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    // A new edit starts in the brand's preset style and size, when it has one.
    const preset = (await readPresets(ctx).catch(() => null))?.brand ?? null;
    const build = await manualBuild(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, project, preset });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
