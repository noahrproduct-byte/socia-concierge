import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable } from "@/lib/studioClips/auth";
import { listTracks, registerTrack, MAX_TRACKS } from "@/lib/music/tracks";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

const TRACKS_HINT = "Your playlist needs its table. Run supabase/studio-tracks.sql in the Supabase SQL editor.";
const bad = (e: unknown) => (isMissingTable(e) ? NextResponse.json({ error: TRACKS_HINT, migration: true }, { status: 503 }) : errorResponse("studio/tracks", e));

// Your playlist (lib/music/tracks.ts).
//   GET  -> { tracks }: every sound saved, newest first, each with a short-lived link to play it
//   POST { name, sourceName, durationSec, ext } -> { id, path }: a row for a sound the browser is about to
//        upload to studio-sources at that path (under the uploader's own folder); PUT ./[id] { uploaded: true } after.
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    return NextResponse.json({ tracks: await listTracks(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null) });
  } catch (e) {
    return bad(e);
  }
}

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { name?: unknown; sourceName?: unknown; durationSec?: unknown; ext?: unknown } | null;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const wsId = ctx.workspace?.id ?? null;
    const have = await listTracks(ctx.client, ctx.ownerId, wsId);
    if (have.length >= MAX_TRACKS) return NextResponse.json({ error: `Your playlist holds ${MAX_TRACKS} sounds. Remove one to add another.` }, { status: 400 });
    const made = await registerTrack(ctx.client, { ownerId: ctx.ownerId, wsId, uploaderId: viewerId, name: body?.name, sourceName: body?.sourceName, durationSec: body?.durationSec, ext: body?.ext });
    return NextResponse.json(made);
  } catch (e) {
    return bad(e);
  }
}
