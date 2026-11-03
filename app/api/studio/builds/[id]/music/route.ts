import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/aiStatus";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { accountContext, loadBuildRow } from "@/lib/studioClips/server";
import { makePlaylist } from "@/lib/music/server";
import { musicConfigured } from "@/lib/music/elevenlabs";
import { readPicks } from "@/lib/music/store";
import { publicMessage } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 60;

// Music for a cut (Growth/Pro).
//   POST -> a new playlist from the account's taste: six original-track
//           descriptions and a few searches for the platforms' own sound
//           libraries. Writing the playlist costs no track; each track is
//           made (and counted) on its own: POST ./music/[trackId].

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!musicConfigured()) return NextResponse.json({ error: "Music isn't set up on this server yet.", notConfigured: true }, { status: 503 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const limited = await perUserLimit(ctx.ownerId, "music-playlist", 20, "playlists");
    if (limited) return limited;
    const wsId = ctx.workspace?.id ?? null;
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const [acct, picks] = await Promise.all([accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx)), readPicks(ctx)]);
    const brand = acct.brand as { voice?: string; tone?: string } | null;
    const playlist = await makePlaylist(ctx.client, { ownerId: ctx.ownerId, wsId, buildId: id, picks, ctx: { niche: acct.niche, brand: brand?.voice ?? brand?.tone ?? null, title: row.edl?.caption?.split("\n")[0]?.slice(0, 80) ?? null } });
    return NextResponse.json({ playlist });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? publicMessage("studio/builds/[id]/music", e, "SOCIA couldn't put a playlist together. Try again.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
