import { NextResponse } from "next/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, isMissingTable } from "@/lib/studioClips/auth";
import { syncAudioCandidates, audioData } from "@/lib/audio/server";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/studio/audio[?refresh=1] — what sound has worked for this
// workspace's account (and its tracked Instagram competitors when a Facebook
// Page is linked), plus the posts whose files the browser can still measure.
export async function GET(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    // The sync (the account's reels and its competitors') can fail on its own: the insights still come from
    // what is stored, and the panel says the sync didn't run (2026-11-15: a 500 here took the panel away).
    const competitors = await syncAudioCandidates(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, { refreshCompetitors: refresh }).catch((e: unknown) => {
      if (isMissingTable(e)) throw e;
      console.error("[studio/audio] sync failed:", e instanceof Error ? e.message : e);
      return { enabled: false, reason: "SOCIA couldn't read new posts just now; what it measured before is shown.", refreshed: false, accounts: 0 };
    });
    return NextResponse.json(await audioData(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, competitors));
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "Audio insights need their table. Run supabase/studio-audio.sql in the Supabase SQL editor.", migration: true }, { status: 503 });
    return errorResponse("studio/audio", e);
  }
}
