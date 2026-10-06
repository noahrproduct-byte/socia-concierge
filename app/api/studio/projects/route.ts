import { NextResponse } from "next/server";
import { getEntitlements, getUsage, canUseFeature } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { listProjects, createProject, studioLimits } from "@/lib/studioClips/server";
import { transcriptionConfigured } from "@/lib/transcribe";

export const runtime = "nodejs";

// Build-from-Clips projects of the active workspace.
//   GET  -> { projects, limits, usage, transcription }
//   POST { title? } -> { id }

export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const [projects, usage] = await Promise.all([listProjects(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null), getUsage(ctx.client, ent)]);
    return NextResponse.json({
      projects, limits: studioLimits(ent), usage: usage.content_build, transcription: transcriptionConfigured(),
      // Make This Video (Phase B) is a Growth/Pro feature; the UI shows a plan note otherwise.
      features: { autoBuild: canUseFeature(ent, "auto_build") }, videoBuilds: usage.video_builds,
    });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) || null : null;
  try {
    const row = await createProject(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, viewerId, title);
    return NextResponse.json({ id: row.id });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
