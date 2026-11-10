import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { aiFailure } from "@/lib/anthropic";
import { requireFeature, requireUsage } from "@/lib/planGuard";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { accountContext, loadBuildRow } from "@/lib/studioClips/server";
import { signUrls } from "@/lib/studioClips/storage";
import { scopeToWorkspace } from "@/lib/workspaces";
import { autoLevels, cutHasSpeech, makePlaylist, makeTrack } from "@/lib/music/server";
import { MusicError, musicConfigured } from "@/lib/music/elevenlabs";
import { readMusicAuto, readPicks } from "@/lib/music/store";
import { musicPath, sanitizeSoundtrack } from "@/lib/music/taste";
import { publicMessage } from "@/lib/dbError";
import { perUserLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 240;

// POST: music added on its own (Growth/Pro), once per cut. When the brand
// hasn't turned it off and the cut has no track yet: the playlist from the
// account's taste (made if there isn't one), its first track made (one music
// track counted, given back if it fails) and mixed in, lower under speech.
// Every other track stays in the playlist to pick instead. Tried once per
// cut whatever happens, so opening a cut again never spends another track.
//   -> { state: "added", playlist, soundtrack, url } | { state: "has" | "tried" | "off" }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!musicConfigured()) return NextResponse.json({ error: "Music isn't set up on this server yet.", notConfigured: true }, { status: 503 });
  const wsId = ctx.workspace?.id ?? null;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    if (row.edl.soundtrack) return NextResponse.json({ state: "has" });
    if (row.edl.musicAuto) return NextResponse.json({ state: "tried" });
    if (!(await readMusicAuto(ctx))) return NextResponse.json({ state: "off" });
    // Making the playlist is a model call: the same hourly and monthly AI ceilings as asking for one by hand.
    if (!row.edl.playlist) {
      const limited = await perUserLimit(ctx.ownerId, "music-playlist", 20, "playlists");
      if (limited) return limited;
    }

    const save = async (edl: typeof row.edl) => {
      const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
      if (error) throw error;
    };
    await save({ ...row.edl, musicAuto: new Date().toISOString() });

    let playlist = row.edl.playlist ?? null;
    if (!playlist) {
      const [acct, picks] = await Promise.all([accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx)), readPicks(ctx)]);
      const brand = acct.brand as { voice?: string; tone?: string } | null;
      playlist = await makePlaylist(ctx.client, { ownerId: ctx.ownerId, wsId, buildId: id, picks, ctx: { niche: acct.niche, brand: brand?.voice ?? brand?.tone ?? null, title: row.edl.caption?.split("\n")[0]?.slice(0, 80) ?? null } });
    }
    const track = playlist.tracks[0];

    const u = await requireUsage(ctx.client, ctx.ownerId, "music_tracks", { feature: "auto_build" });
    if (u.denied) return u.denied;
    let path: string;
    try {
      const made = await makeTrack(ctx.client, { ownerId: ctx.ownerId, wsId, buildId: id, trackId: track.id });
      if (!made.made) await u.release();
      path = made.path;
    } catch (e) {
      await u.release();
      // The music service itself isn't available (not set up, or its plan has no Music API):
      // take the stamp back off so this cut gets its track once it is.
      if (e instanceof MusicError && e.kind === "not_configured") {
        const cur = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id).catch(() => null);
        if (cur?.edl?.musicAuto) { const { musicAuto: _drop, ...rest } = cur.edl; void _drop; await save(rest).catch(() => null); }
      }
      throw e;
    }

    const fresh = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!fresh?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    // The person may have picked a track while this one was being made: theirs stays.
    if (fresh.edl.soundtrack) return NextResponse.json({ state: "has" });
    const speech = await cutHasSpeech(ctx.client, fresh.edl, fresh.project_id);
    const soundtrack = sanitizeSoundtrack({ trackId: track.id, ...autoLevels(speech, Boolean(fresh.edl.actionSound)) }, fresh.edl.playlist, (t) => musicPath(ctx.ownerId, fresh.project_id, id, t));
    if (!soundtrack) return NextResponse.json({ error: "SOCIA couldn't add the track." }, { status: 500 });
    await save({ ...fresh.edl, soundtrack });
    const url = (await signUrls(ctx.client, [path]))[path] ?? null;
    return NextResponse.json({ state: "added", playlist: fresh.edl.playlist, soundtrack, url, usage: u.usage });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    if (e instanceof MusicError) return NextResponse.json({ error: e.message, kind: e.kind, notConfigured: e.kind === "not_configured" }, { status: e.kind === "busy" ? 429 : e.kind === "not_configured" ? 503 : 502 });
    const kind = aiFailure("studio/builds/music/auto", e);
    return NextResponse.json({ error: kind === "failed" ? publicMessage("studio/builds/[id]/music/auto", e, "SOCIA couldn't add music. Pick a track in Music.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
