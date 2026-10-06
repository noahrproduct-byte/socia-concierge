import { NextResponse } from "next/server";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { can } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { buildPlayerData, saveBuildEdl } from "@/lib/studioClips/server";
import type { Edl } from "@/lib/studioClips/types";

export const runtime = "nodejs";

// One build for Make This Video (Growth/Pro).
//   GET          -> BuildPlayerData: the EDL, the guide and signed clip sources for the Player
//   PATCH { edl } -> the person's edit, re-validated (cuts snap to word/pause
//                    boundaries, nothing outside a clip) and saved; previous
//                    version kept for undo; guide re-rendered from the same EDL

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build", ent);
    if (denied) return denied;
    const data = await buildPlayerData(ctx.client, ctx.ownerId, id, checkFeature(ent, "auto_build").ok && can(ctx, "publish"));
    if (!data) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { edl?: Edl } | null;
  if (!body?.edl || !Array.isArray(body.edl.segments)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const build = await saveBuildEdl(ctx.client, ctx.ownerId, id, body.edl);
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
