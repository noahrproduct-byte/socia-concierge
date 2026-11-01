import { NextResponse } from "next/server";
import { requireUsage } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadBuildRow } from "@/lib/studioClips/server";
import { signUrls } from "@/lib/studioClips/storage";
import { scopeToWorkspace } from "@/lib/workspaces";
import { makeTrack } from "@/lib/music/server";
import { MusicError } from "@/lib/music/elevenlabs";
import { rememberPick } from "@/lib/music/store";
import { musicPath, sanitizeSoundtrack } from "@/lib/music/taste";

export const runtime = "nodejs";
export const maxDuration = 180;

// One track of a cut's playlist.
//   POST   -> make it (one music track counted; given back if it fails or was
//             already made) -> { url } a short-lived link to play it
//   PUT    { musicVolume, originalVolume } -> use it in the cut, at those
//             levels; remembered as one of the brand's picks
//   DELETE -> take the music out of the cut

const bad = (e: unknown) => NextResponse.json({ error: (e as Error)?.message || "Something went wrong." }, { status: 500 });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; trackId: string }> }) {
  const { id, trackId } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const u = await requireUsage(ctx.client, ctx.ownerId, "music_tracks", { feature: "auto_build" });
  if (u.denied) return u.denied;
  try {
    const { path, made } = await makeTrack(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, buildId: id, trackId });
    if (!made) await u.release();
    const url = (await signUrls(ctx.client, [path]))[path] ?? null;
    return NextResponse.json({ url, usage: made ? u.usage : null });
  } catch (e) {
    await u.release();
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    if (e instanceof MusicError) return NextResponse.json({ error: e.message, kind: e.kind, notConfigured: e.kind === "not_configured" }, { status: e.kind === "busy" ? 429 : e.kind === "not_configured" ? 503 : 502 });
    return bad(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; trackId: string }> }) {
  const { id, trackId } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { musicVolume?: unknown; originalVolume?: unknown } | null;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const soundtrack = sanitizeSoundtrack({ trackId, musicVolume: body?.musicVolume, originalVolume: body?.originalVolume }, row.edl.playlist, (t) => musicPath(ctx.ownerId, row.project_id, id, t));
    if (!soundtrack) return NextResponse.json({ error: "That track isn't in this cut's playlist." }, { status: 400 });
    const edl = { ...row.edl, soundtrack };
    const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
    if (error) throw error;
    const t = row.edl.playlist!.tracks.find((x) => x.id === trackId)!;
    await rememberPick(ctx, { style: t.style, mood: t.mood, bpm: t.bpm, energy: t.energy, at: new Date().toISOString() });
    return NextResponse.json({ soundtrack });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return bad(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; trackId: string }> }) {
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
