import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable } from "@/lib/studioClips/auth";
import { confirmTrack, deleteTrack, renameTrack } from "@/lib/music/tracks";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

const TRACKS_HINT = "Your playlist needs its table. Run supabase/studio-tracks.sql in the Supabase SQL editor.";
const bad = (e: unknown) => (isMissingTable(e) ? NextResponse.json({ error: TRACKS_HINT, migration: true }, { status: 503 }) : errorResponse("studio/tracks/[id]", e));

// One sound of your playlist.
//   PUT { uploaded: true } -> { track }: the file is up; checked and listed from now on
//   PUT { name }           -> renamed
//   DELETE                 -> the row and the file go
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { uploaded?: unknown; name?: unknown } | null;
  const wsId = ctx.workspace?.id ?? null;
  try {
    if (body?.uploaded === true) {
      const track = await confirmTrack(ctx.client, ctx.ownerId, wsId, id);
      if (!track) return NextResponse.json({ error: "That sound isn't in your playlist." }, { status: 404 });
      return NextResponse.json({ track });
    }
    if (typeof body?.name === "string") {
      const ok = await renameTrack(ctx.client, ctx.ownerId, wsId, id, body.name);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That sound isn't in your playlist." }, { status: 404 });
    }
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  } catch (e) {
    return bad(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  try {
    const ok = await deleteTrack(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That sound isn't in your playlist." }, { status: 404 });
  } catch (e) {
    return bad(e);
  }
}
