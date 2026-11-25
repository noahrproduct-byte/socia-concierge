import { NextResponse } from "next/server";
import { requireUsage } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable } from "@/lib/studioClips/auth";
import { storageClient } from "@/lib/studioClips/storage";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { confirmTrack, deleteTrack, listTracks, registerTrack, MAX_TRACKS } from "@/lib/music/tracks";
import { aiMusicName, aiMusicSeconds, musicPrompt } from "@/lib/music/aiMusic";
import { composeMusic, musicConfigured, MusicError } from "@/lib/music/elevenMusic";
import { recordMusic } from "@/lib/aiUsage";
import { perUserLimit } from "@/lib/rateLimit";
import { publicMessage } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 300;

// AI music for one video (lib/music/aiMusic.ts, lib/music/elevenMusic.ts), saved to the person's library.
//   POST { videoSec, mood?, reference?: { bpm, drops, speechShare, musicLikely } }
//     -> { track, seconds, usage }: one AI music credit action (lib/credits/config.ts music_tracks), counted
//        only when the music is made and saved; given back on any failure.
// The reference is only the numbers SOCIA measured in the browser; no song, artist or audio is sent.
type Body = { videoSec?: unknown; mood?: unknown; reference?: unknown };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function referenceOf(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const bpm = num(r.bpm);
  return {
    musicLikely: r.musicLikely === true,
    bpm: bpm && bpm >= 40 && bpm <= 240 ? Math.round(bpm) : null,
    drops: (Array.isArray(r.drops) ? r.drops : []).map(num).filter((d): d is number => d != null && d >= 0 && d <= 600).slice(0, 3),
    speechShare: Math.min(1, Math.max(0, num(r.speechShare) ?? 0)),
  };
}

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!musicConfigured()) return NextResponse.json({ error: "AI music isn't set up on this server yet.", notConfigured: true }, { status: 503 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const seconds = aiMusicSeconds(num(body.videoSec) ?? 0);
  const reference = referenceOf(body.reference);
  const mood = typeof body.mood === "string" ? body.mood : "";
  const wsId = ctx.workspace?.id ?? null;
  try {
    const limited = await perUserLimit(ctx.ownerId, "ai-music", 10, "AI music");
    if (limited) return limited;
    const have = await listTracks(ctx.client, ctx.ownerId, wsId);
    if (have.length >= MAX_TRACKS) return NextResponse.json({ error: `Your library holds ${MAX_TRACKS} sounds. Remove one to make another.` }, { status: 400 });

    const u = await requireUsage(ctx.client, ctx.ownerId, "music_tracks", { feature: "build_from_clips" });
    if (u.denied) return u.denied;
    let made: { id: string; path: string } | null = null;
    try {
      const { audio } = await composeMusic({ prompt: musicPrompt({ reference, mood, seconds }), seconds });
      recordMusic(ctx.ownerId, seconds);
      made = await registerTrack(ctx.client, { ownerId: ctx.ownerId, wsId, uploaderId: viewerId, name: aiMusicName({ mood, bpm: reference?.bpm }), sourceName: "SOCIA AI music", durationSec: seconds, ext: "mp3" });
      const { error } = await storageClient(ctx.client).storage.from(STUDIO_BUCKET).upload(made.path, audio, { contentType: "audio/mpeg", upsert: true });
      if (error) throw error;
      const track = await confirmTrack(ctx.client, ctx.ownerId, wsId, made.id);
      if (!track) throw new Error("The music was made but couldn't be listed.");
      return NextResponse.json({ track, seconds, usage: u.usage });
    } catch (e) {
      await u.release();
      if (made) await deleteTrack(ctx.client, ctx.ownerId, wsId, made.id).catch(() => null);
      throw e;
    }
  } catch (e) {
    if (e instanceof MusicError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.kind === "busy" ? 429 : e.kind === "not_configured" ? 503 : e.kind === "rejected" ? 400 : 502 });
    if (isMissingTable(e)) return NextResponse.json({ error: "Your library needs its table. Run supabase/studio-tracks.sql in the Supabase SQL editor.", migration: true }, { status: 503 });
    return NextResponse.json({ error: publicMessage("studio/tracks/generate", e, "SOCIA couldn't save the music. No credits were used.") }, { status: 500 });
  }
}
