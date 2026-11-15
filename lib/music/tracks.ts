// Your playlist, server side: the sounds a person dropped into the editor and
// trimmed (components/studio/MusicBox.tsx), one row each in studio_tracks and
// one file each in the studio-sources bucket under the uploader's own folder.
// A row is registered before the upload (the browser gets the path), confirmed
// after it (the file is checked), and swept if never confirmed. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { scopeToWorkspace } from "@/lib/workspaces";

type Supa = SupabaseClient;

export type TrackRow = { id: string; user_id: string; workspace_id: string | null; name: string; source_name: string | null; path: string; duration_s: number; bytes: number; ready: boolean; created_at: string; last_used_at: string | null };
/** A track as the editor lists it. */
export type Track = { id: string; name: string; sourceName: string | null; durationSec: number; createdAt: string; lastUsedAt: string | null; url: string | null };

export const TRACK_EXTS = ["m4a", "mp3", "wav", "aac", "ogg"] as const;
export const MAX_TRACK_SEC = 180;
export const MIN_TRACK_SEC = 2;
export const MAX_TRACK_BYTES = 40 * 1024 * 1024;
export const MAX_TRACKS = 200;

export const trackPath = (uploaderId: string, id: string, ext: string) => `${uploaderId}/library/music/${id}.${ext}`;
/** The uploader's own folder: what the bucket's owner policies allow the browser to write. */
export const ownsTrackPath = (uploaderId: string, path: string) => path.startsWith(`${uploaderId}/library/music/`);

const COLS = "id, user_id, workspace_id, name, source_name, path, duration_s, bytes, ready, created_at, last_used_at";
const cleanName = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : fallback);

export async function listTracks(client: Supa, ownerId: string, wsId: string | null): Promise<Track[]> {
  const { data, error } = await scopeToWorkspace(client.from("studio_tracks").select(COLS).eq("user_id", ownerId).eq("ready", true).order("created_at", { ascending: false }).limit(MAX_TRACKS), wsId);
  if (error) throw error;
  const rows = (data ?? []) as TrackRow[];
  const urls = await signUrls(client, rows.map((r) => r.path)).catch(() => ({}) as Record<string, string>);
  return rows.map((r) => toTrack(r, urls[r.path] ?? null));
}

export async function loadTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<TrackRow | null> {
  const { data, error } = await scopeToWorkspace(client.from("studio_tracks").select(COLS).eq("user_id", ownerId).eq("id", id).limit(1), wsId);
  if (error) throw error;
  return ((data ?? [])[0] as TrackRow | undefined) ?? null;
}

/** Register a track the browser is about to upload: its row and the path to put the file at. */
export async function registerTrack(client: Supa, args: { ownerId: string; wsId: string | null; uploaderId: string; name: unknown; sourceName: unknown; durationSec: unknown; ext: unknown }): Promise<{ id: string; path: string }> {
  const ext = TRACK_EXTS.find((e) => e === String(args.ext ?? "").toLowerCase()) ?? "m4a";
  const dur = typeof args.durationSec === "number" && Number.isFinite(args.durationSec) ? Math.min(MAX_TRACK_SEC, Math.max(0, args.durationSec)) : 0;
  const id = crypto.randomUUID();
  const path = trackPath(args.uploaderId, id, ext);
  const { error } = await client.from("studio_tracks").insert({
    id, user_id: args.ownerId, workspace_id: args.wsId, name: cleanName(args.name, "Untitled sound"), source_name: typeof args.sourceName === "string" ? args.sourceName.slice(0, 120) : null,
    path, duration_s: dur, bytes: 0, ready: false,
  });
  if (error) throw error;
  return { id, path };
}

/** The file is up: check it is there and not empty, then the track joins the playlist. */
export async function confirmTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<Track | null> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return null;
  const folder = row.path.slice(0, row.path.lastIndexOf("/"));
  const file = row.path.slice(row.path.lastIndexOf("/") + 1);
  const { data } = await storageClient(client).storage.from(STUDIO_BUCKET).list(folder, { search: file, limit: 5 });
  const obj = (data ?? []).find((o) => o.name === file);
  const bytes = Number((obj?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (!obj || !bytes) throw new Error("The sound didn't arrive. Drop it again.");
  const { error } = await client.from("studio_tracks").update({ ready: true, bytes }).eq("id", id).eq("user_id", ownerId);
  if (error) throw error;
  const urls = await signUrls(client, [row.path]).catch(() => ({}) as Record<string, string>);
  return toTrack({ ...row, ready: true, bytes }, urls[row.path] ?? null);
}

export async function renameTrack(client: Supa, ownerId: string, wsId: string | null, id: string, name: unknown): Promise<boolean> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return false;
  const { error } = await client.from("studio_tracks").update({ name: cleanName(name, row.name) }).eq("id", id).eq("user_id", ownerId);
  if (error) throw error;
  return true;
}

export async function touchTrack(client: Supa, ownerId: string, id: string): Promise<void> {
  await client.from("studio_tracks").update({ last_used_at: new Date().toISOString() }).eq("id", id).eq("user_id", ownerId);
}

/** The row and the file go; a cut that used it keeps its own copy of the path and plays nothing until another is picked. */
export async function deleteTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<boolean> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return false;
  await storageClient(client).storage.from(STUDIO_BUCKET).remove([row.path]).catch(() => null);
  const { error } = await client.from("studio_tracks").delete().eq("id", id).eq("user_id", ownerId);
  if (error) throw error;
  return true;
}

export function toTrack(r: TrackRow, url: string | null): Track {
  return { id: r.id, name: r.name, sourceName: r.source_name, durationSec: r.duration_s, createdAt: r.created_at, lastUsedAt: r.last_used_at, url };
}
