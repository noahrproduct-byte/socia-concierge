// Music for a cut, server side: the playlist (taste facts → six track
// descriptions and a few sounds to search for in the platforms' own
// libraries), and each track made on request by ElevenLabs and stored
// privately beside the project's clips. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, modelFor, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { ownAudio } from "@/lib/audio/server";
import { scopeToWorkspace } from "@/lib/workspaces";
import { clipRows, loadBuildRow } from "@/lib/studioClips/server";
import { storageClient } from "@/lib/studioClips/storage";
import { edlDurationSec } from "@/lib/studioClips/edl";
import { STUDIO_BUCKET, type Edl } from "@/lib/studioClips/types";
import { composeTrack } from "./elevenlabs";
import { cleanPlaylist, musicPath, PLAYLIST_SCHEMA, PLAYLIST_SIZE, tasteLines, trackPrompt, type MusicPick, type Playlist, type TasteInput } from "./taste";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const SYSTEM = `You write a short playlist of original instrumental tracks for one short vertical social video (a Reel, TikTok or Short), from the account's measured taste. A music model will make each track from your description, so describe how each one SOUNDS.
Rules you never break:
- Never name an artist, band, song, album, film or game, and never write "in the style of" anyone. Describe genre, mood, tempo, energy and instruments only.
- Never promise results (views, reach, virality).
- Ground the playlist in the taste lines: the first two tracks sit closest to it, the next two vary it (tempo or instruments), the last two explore something nearby the account hasn't tried. Each "why" says which taste line it follows, or that it explores.
- bpm between 60 and 180. When the video has speech, keep the tracks gentle enough to sit under a voice.
- name: 2 to 4 plain words that say how it sounds ("Warm acoustic bounce"), not a fake song title.
- suggestions: 3 or 4 searches the person can type into Instagram's or TikTok's own sound library to find a licensed song in the same spirit (genre and mood words only, never a song or artist), each with a short why.`;

export type PlaylistContext = { niche: string | null; brand: string | null; title: string | null };

/** Taste facts for a cut: its length and speech, the account's measured sound, and past picks. */
export async function tasteFor(client: Supa, ownerId: string, wsId: string | null, edl: Edl, projectId: string, picks: MusicPick[]): Promise<TasteInput> {
  const [rows, own] = await Promise.all([clipRows(client, projectId), ownAudio(client, ownerId, wsId)]);
  const used = new Set(edl.segments.map((s) => s.clipId));
  const hasSpeech = rows.some((r) => used.has(r.id) && (r.transcript?.words?.length ?? 0) > 0);
  return {
    profile: own?.profile ?? null,
    library: own?.baseline ? own.library : null,
    original: own?.baseline ? own.original : null,
    picks, videoSec: edlDurationSec(edl), hasSpeech,
    cutNote: edl.music ?? null, niche: null,
  };
}

/** A new playlist for a cut. The track chosen before (if any) stays at the top so the cut keeps playing it. */
export async function makePlaylist(client: Supa, args: { ownerId: string; wsId: string | null; buildId: string; picks: MusicPick[]; ctx: PlaylistContext; now?: Date }): Promise<Playlist> {
  const { ownerId, wsId, buildId, picks, ctx } = args;
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row?.edl) throw new Error("That cut does not exist.");
  const taste = await tasteFor(client, ownerId, wsId, row.edl, row.project_id, picks);
  const lines = tasteLines({ ...taste, niche: ctx.niche });
  const model = modelFor("fast");
  const res = await anthropic.messages.create({
    model, max_tokens: 1500, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: PLAYLIST_SCHEMA }, ...effortFor(model) },
    messages: [{ role: "user", content: `The account: ${ctx.niche ? `niche ${ctx.niche}` : "niche not set"}${ctx.brand ? `; voice: ${ctx.brand}` : ""}.
The video: "${ctx.title ?? "untitled"}", ${Math.round(taste.videoSec)} seconds, ${taste.hasSpeech ? "with speech" : "no speech"}.${taste.cutNote ? ` The editor's music note for this cut: ${taste.cutNote}` : ""}
Taste:
${lines.map((l) => `- ${l}`).join("\n")}

Write ${PLAYLIST_SIZE} tracks and the searches.` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ownerId, "music_playlist", res);
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  let n = 0;
  const stamp = (args.now ?? new Date()).getTime().toString(36);
  const { tracks, suggestions } = cleanPlaylist(raw, () => `m${stamp}${n++}`);
  if (!tracks.length) throw new Error("SOCIA couldn't put a playlist together just now. Try again.");
  // The model call takes a while and the person may have changed the cut
  // meanwhile: merge into the cut as it is now, not as it was when this started.
  const fresh = (await loadBuildRow(client, ownerId, wsId, buildId))?.edl ?? row.edl;
  const kept = fresh.soundtrack ? fresh.playlist?.tracks.find((t) => t.id === fresh.soundtrack!.trackId) : null;
  const playlist: Playlist = { taste: lines, tracks: kept ? [kept, ...tracks] : tracks, suggestions, createdAt: (args.now ?? new Date()).toISOString() };
  const { error } = await scopeToWorkspace(client.from("studio_builds").update({ edl: { ...fresh, playlist }, updated_at: new Date().toISOString() }).eq("id", buildId).eq("user_id", ownerId), wsId);
  if (error) throw error;
  return playlist;
}

/** Whether any clip the cut uses has speech (music then sits lower under the voice). */
export async function cutHasSpeech(client: Supa, edl: Edl, projectId: string): Promise<boolean> {
  const rows = await clipRows(client, projectId);
  const used = new Set(edl.segments.map((s) => s.clipId));
  return rows.some((r) => used.has(r.id) && (r.transcript?.words?.length ?? 0) > 0);
}

/** Levels for a track SOCIA adds on its own: lower under speech, the clips' own sound kept. */
export const autoLevels = (speech: boolean) => ({ musicVolume: speech ? 0.35 : 0.6, originalVolume: 1 });

/** Make one track of the cut's playlist and store it; returns its storage path. Already made = returned as is. */
export async function makeTrack(client: Supa, args: { ownerId: string; wsId: string | null; buildId: string; trackId: string }): Promise<{ path: string; made: boolean }> {
  const { ownerId, wsId, buildId, trackId } = args;
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row?.edl) throw new Error("That cut does not exist.");
  const track = row.edl.playlist?.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error("That track isn't in this cut's playlist.");
  const path = musicPath(ownerId, row.project_id, buildId, trackId);
  const st = storageClient(client).storage.from(STUDIO_BUCKET);
  const existing = await st.list(`${ownerId}/${row.project_id}/music`, { search: `${buildId}-${trackId}` }).catch(() => null);
  if (existing?.data?.some((o) => o.name === `${buildId}-${trackId}.mp3`)) return { path, made: false };
  const rows = await clipRows(client, row.project_id);
  const used = new Set(row.edl.segments.map((s) => s.clipId));
  const underSpeech = rows.some((r) => used.has(r.id) && (r.transcript?.words?.length ?? 0) > 0);
  const { prompt, lengthMs } = trackPrompt(track, edlDurationSec(row.edl) + 1, underSpeech);
  const bytes = await composeTrack({ prompt, lengthMs, signal: AbortSignal.timeout(170_000) });
  const { error } = await st.upload(path, new Blob([bytes], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: true });
  if (error) throw error;
  return { path, made: true };
}
