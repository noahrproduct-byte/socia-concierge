import { NextResponse } from "next/server";
import { studioRequest, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { listLibrary } from "@/lib/studioClips/server";

export const runtime = "nodejs";

// GET /api/studio/library -> { clips }: every clip of the active Brand
// Workspace whose footage is stored, one per piece of footage, newest first.
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    return NextResponse.json({ clips: await listLibrary(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: "Couldn't load your clips." }, { status: 500 });
  }
}
