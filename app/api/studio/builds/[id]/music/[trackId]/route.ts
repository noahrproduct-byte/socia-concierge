import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadBuildRow } from "@/lib/studioClips/server";
import { signUrls } from "@/lib/studioClips/storage";
import { scopeToWorkspace } from "@/lib/workspaces";
import { loadTrack, touchTrack } from "@/lib/music/tracks";
import { sanitizeSoundtrack } from "@/lib/music/taste";
import { soundName } from "@/lib/music/soundName";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

const bad = (e: unknown) => errorResponse("studio/builds/[id]/music/[trackId]", e);

// The music in a cut: one sound from the person's playlist (lib/music/tracks.ts).
//   PUT    { musicVolume, originalVolume, duck } -> { soundtrack, url }: use it in the cut at those levels
//   DELETE -> take the music out of the cut
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; trackId: string }> }) {
  const { id, trackId } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { musicVolume?: unknown; originalVolume?: unknown; duck?: unknown } | null;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const track = await loadTrack(ctx.client, ctx.ownerId, wsId, trackId);
    if (!track?.ready) return NextResponse.json({ error: "That sound isn't in your playlist." }, { status: 404 });
    const soundtrack = sanitizeSoundtrack({ trackId, musicVolume: body?.musicVolume, originalVolume: body?.originalVolume, duck: body?.duck }, null, () => ({ name: soundName(track.name), path: track.path }));
    if (!soundtrack) return NextResponse.json({ error: "That sound can't be used." }, { status: 400 });
    const edl = { ...row.edl, soundtrack };
    const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
    if (error) throw error;
    await touchTrack(ctx.client, ctx.ownerId, wsId, trackId);
    const urls = await signUrls(ctx.client, [track.path]).catch(() => ({}) as Record<string, string>);
    return NextResponse.json({ soundtrack, url: urls[track.path] ?? null });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
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
  const wsId = ctx.workspace?.id ?? null;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const { soundtrack: _drop, ...rest } = row.edl; void _drop;
    const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl: rest, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e);
  }
}
