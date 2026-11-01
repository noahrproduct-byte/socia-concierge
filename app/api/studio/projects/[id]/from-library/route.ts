import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { copyClipsInto, getProjectRow } from "@/lib/studioClips/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { clipIds } -> { added, skipped }: clips from Your clips copied into
// this project (files and what SOCIA understood about each), within the plan.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { clipIds?: unknown } | null;
  const clipIds = Array.isArray(body?.clipIds) ? body.clipIds.filter((x): x is string => typeof x === "string" && x.length <= 64) : [];
  if (!clipIds.length) return NextResponse.json({ error: "Pick at least one clip." }, { status: 400 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const wsId = ctx.workspace?.id ?? null;
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    return NextResponse.json(await copyClipsInto(ctx.client, { ownerId: ctx.ownerId, viewerId, wsId, ent, project, clipIds }));
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
