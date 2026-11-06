// Music for a cut, server side: the playlist (taste facts → six track
// descriptions and a few sounds to search for in the platforms' own
// libraries), and each track made on request by ElevenLabs and stored
// privately beside the project's clips. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, modelFor, effortFor } from "@/lib/anthropic";
import { recordAiUsage, recordMusic } from "@/lib/aiUsage";
import { ownAudio } from "@/lib/audio/server";
import { scopeToWorkspace } from "@/lib/workspaces";
import { clipRows, loadBuildRow } from "@/lib/studioClips/server";
import { storageClient } from "@/lib/studioClips/storage";
import { edlDurationSec } from "@/lib/studioClips/edl";
import { STUDIO_BUCKET, type Edl } from "@/lib/studioClips/types";
import { composeTrack } from "./elevenlabs";
import { cleanPlaylist, cutSpeaks, musicPath, PLAYLIST_SCHEMA, PLAYLIST_SIZE, tasteLines, trackPrompt, trackSeconds, type MusicPick, type Playlist, type TasteInput } from "./taste";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const SYSTEM = `You write a short playlist of original instrumental tracks for one short vertical social video (a Reel, TikTok or Short), from the account's measured taste. A music model will make each track from your description, so describe how each one SOUNDS.
Rules you never break:
- Never name an artist, band, song, album, film or game, and never write "in the style of" anyone. Describe genre, mood, tempo, energy and instruments only.
- Never promise results (views, reach, virality).
- Ground the playlist in the taste lines: the first two tracks sit closest to it, the next two vary it (tempo or instruments), the last two explore something nearby the account hasn't tried. Each "why" says which taste line it follows, or that it explores.
- Every track is one consistent groove from the first second to the last: a clear steady beat at a constant tempo, the same energy and instruments throughout, no intro, build, breakdown or ending. Never write "no steady beat", "free time", "drifting" or anything that wanders, even if a taste line mentions a beat that couldn't be measured.
- Fit the music to this kind of video first and the taste lines second: a food video gets a warm, upbeat, feel-good groove, never a corporate one, and a fast edit gets a tempo that moves with it. Use the account's niche only if it matches what the video shows.
- bpm between 90 and 130. When the video has speech, keep the tracks gentle enough to sit under a voice.
- name: 2 to 4 plain words that say how it sounds ("Warm acoustic bounce"), not a fake song title.
- suggestions: 3 or 4 searches the person can type into Instagram's or TikTok's own sound library to find a licensed song in the same spirit (genre and mood words only, never a song or artist), each with a short why.`;

export type PlaylistContext = { niche: string | null; brand: string | null; title: string | null };

const speechIn = (rows: Awaited<ReturnType<typeof clipRows>>, edl: Edl) => cutSpeaks(edl.segments, Object.fromEntries(rows.map((r) => [r.id, r.transcript?.words ?? null])));

/** Taste facts for a cut: its length and speech, the account's measured sound, and past picks. */
export async function tasteFor(client: Supa, ownerId: string, wsId: string | null, edl: Edl, projectId: string, picks: MusicPick[]): Promise<TasteInput & { shows: string | null }> {
  const [rows, own] = await Promise.all([clipRows(client, projectId), ownAudio(client, ownerId, wsId)]);
  const used = new Set(edl.segments.map((s) => s.clipId));
  const hasSpeech = speechIn(rows, edl);
  const shows = rows.filter((r) => used.has(r.id) && r.card?.subject).slice(0, 4).map((r) => r.card!.subject.slice(0, 140)).join("; ") || null;
  return {
    shows,
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
The video: "${ctx.title ?? "untitled"}", ${Math.round(taste.videoSec)} seconds, ${taste.hasSpeech ? "with speech" : "no speech"}.${taste.shows ? ` What it shows: ${taste.shows}.` : ""}${taste.cutNote ? ` The editor's music note for this cut: ${taste.cutNote}` : ""}
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
  return speechIn(await clipRows(client, projectId), edl);
}

/** Levels for a track SOCIA adds on its own: low under real speech; with no one talking the music leads and the room sound sits under it. */
export const autoLevels = (speech: boolean) => (speech ? { musicVolume: 0.35, originalVolume: 1 } : { musicVolume: 0.85, originalVolume: 0.2 });

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
  const underSpeech = speechIn(rows, row.edl);
  const { prompt, lengthMs } = trackPrompt(track, trackSeconds(edlDurationSec(row.edl)), underSpeech);
  const bytes = await composeTrack({ prompt, lengthMs, signal: AbortSignal.timeout(170_000) });
  // Billed by length: counted toward the owner's monthly AI ceiling.
  recordMusic(args.ownerId, lengthMs / 1000);
  const { error } = await st.upload(path, new Blob([bytes], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: true });
  if (error) throw error;
  return { path, made: true };
}
