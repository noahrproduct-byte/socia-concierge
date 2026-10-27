import { NextResponse } from "next/server";
import { getEntitlements, getUsage, canUseFeature } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getLibraryRow, getOrCreateLibrary, loadProject, studioLimits, isMissingColumn } from "@/lib/studioClips/server";
import type { LibraryBuild } from "@/lib/studioClips/library";
import { transcriptionConfigured } from "@/lib/transcribe";
import type { Ctx } from "@/lib/context";

export const runtime = "nodejs";

// Footage: the active workspace's standing clip library (supabase/footage.sql).
//   GET  -> { library | null, builds, limits, usage, transcription, features }
//   POST -> the same, creating the library on first use (owners and admins,
//           plan feature build_from_clips)
// Clips, understanding, builds and planning go through the Build-from-Clips
// routes with the library's id: a library is a project of kind "library".

const FOOTAGE_MIGRATION_HINT = "Footage needs one more database column. Run supabase/footage.sql in the Supabase SQL editor.";

async function payload(ctx: Ctx, libraryId: string | null) {
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const wsId = ctx.workspace?.id ?? null;
  const [library, usage] = await Promise.all([libraryId ? loadProject(ctx.client, ctx.ownerId, wsId, libraryId) : Promise.resolve(null), getUsage(ctx.client, ent)]);
  let builds: LibraryBuild[] = [];
  if (library) {
    const { data } = await ctx.client.from("studio_builds").select("opportunity_idx, render_path, post_id").eq("project_id", library.id);
    builds = ((data ?? []) as { opportunity_idx: number; render_path: string | null; post_id: string | null }[]).map((b) => ({
      opportunityIdx: b.opportunity_idx,
      title: library.yield?.opportunities.find((o) => o.idx === b.opportunity_idx)?.title ?? `Post ${b.opportunity_idx + 1}`,
      rendered: Boolean(b.render_path),
      postId: b.post_id,
    }));
  }
  return {
    library, builds,
    limits: studioLimits(ent), usage: usage.content_build, transcription: transcriptionConfigured(),
    features: { autoBuild: canUseFeature(ent, "auto_build") }, videoBuilds: usage.video_builds,
  };
}

const failure = (e: unknown) => {
  if (isMissingColumn(e)) return NextResponse.json({ error: FOOTAGE_MIGRATION_HINT, migration: true }, { status: 503 });
  if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
};

export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const row = await getLibraryRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null);
    return NextResponse.json(await payload(ctx, row?.id ?? null));
  } catch (e) {
    return failure(e);
  }
}

export async function POST() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
  if (denied) return denied;
  try {
    const row = await getOrCreateLibrary(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, viewerId);
    return NextResponse.json(await payload(ctx, row.id));
  } catch (e) {
    return failure(e);
  }
}
