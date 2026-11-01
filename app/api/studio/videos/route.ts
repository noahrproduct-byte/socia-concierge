import { NextResponse } from "next/server";
import { studioRequest, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { listVideos } from "@/lib/studioClips/server";

export const runtime = "nodejs";

// GET /api/studio/videos -> { videos }: every cut of the active Brand
// Workspace, newest first, for Content Studio's Edit tab.
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    return NextResponse.json({ videos: await listVideos(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: "Couldn't load your videos." }, { status: 500 });
  }
}
