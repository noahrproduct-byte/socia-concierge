import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { syncAudioCandidates, audioData } from "@/lib/audio/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/studio/audio[?refresh=1] — what sound has worked for this
// workspace's account (and its tracked Instagram competitors when a Facebook
// Page is linked), plus the posts whose files the browser can still measure.
export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const competitors = await syncAudioCandidates(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, { refreshCompetitors: refresh });
    return NextResponse.json(await audioData(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, competitors));
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "Audio insights need their table. Run supabase/studio-audio.sql in the Supabase SQL editor.", migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
