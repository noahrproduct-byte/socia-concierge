import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate } from "@/lib/studioClips/auth";
import { listTracks, readDetail, writeMusic } from "@/lib/music/tracks";
import { normalizePlaylists } from "@/lib/music/playlists";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

// The playlists of your music library (lib/music/playlists.ts), kept on the brand's own row.
//   GET -> { playlists }: the four built-in lists, then yours; sounds no longer in the library are left out
//   PUT { playlists } -> { playlists }: all of them, as saved (cleaned: names, at most 20 of yours, only your sounds)
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const wsId = ctx.workspace?.id ?? null;
    const [detail, tracks] = await Promise.all([readDetail(ctx.client, ctx.ownerId, wsId), listTracks(ctx.client, ctx.ownerId, wsId)]);
    return NextResponse.json({ playlists: normalizePlaylists(detail.music?.playlists, tracks.map((t) => t.id)) });
  } catch (e) {
    return errorResponse("studio/tracks/playlists", e);
  }
}

export async function PUT(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { playlists?: unknown } | null;
  if (!Array.isArray(body?.playlists)) return NextResponse.json({ error: "Send the playlists." }, { status: 400 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const wsId = ctx.workspace?.id ?? null;
    const tracks = await listTracks(ctx.client, ctx.ownerId, wsId);
    const playlists = normalizePlaylists(body.playlists, tracks.map((t) => t.id));
    await writeMusic(ctx.client, ctx.ownerId, wsId, { playlists: playlists.map(({ id, name, trackIds }) => ({ id, name, trackIds })) });
    return NextResponse.json({ playlists });
  } catch (e) {
    return errorResponse("studio/tracks/playlists", e);
  }
}
