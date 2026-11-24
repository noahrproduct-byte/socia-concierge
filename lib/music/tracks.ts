// Your playlist, server side: the sounds a person dropped into the editor and
// trimmed (components/studio/MusicBox.tsx). Each is one file in the
// studio-sources bucket under the uploader's own folder, and one record:
// in studio_tracks when that table exists (supabase/studio-tracks.sql), else
// on the brand's own row (brand_detail.music.tracks), so the playlist works
// before the table is made and nothing is lost either way. A record is
// registered before the upload (the browser gets the path), confirmed after
// it (the file is checked), and never listed until then. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { scopeToWorkspace } from "@/lib/workspaces";
import { soundName } from "./soundName";

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
/** Postgres "relation does not exist" or PostgREST's "could not find the table": the table has not been made. */
const missingTable = (e: unknown) => /relation .* does not exist|PGRST205|Could not find the table|schema cache/i.test((e as { message?: string })?.message ?? String(e));

// ---------------------------------------------------------------- the two stores

/** The record store: the table when it exists, the brand row otherwise. Each call picks on its own, so a table made later takes over. */
async function viaTable<T>(table: () => Promise<T>, row: () => Promise<T>): Promise<T> {
  try {
    return await table();
  } catch (e) {
    if (!missingTable(e)) throw e;
    return row();
  }
}

type Stored = { id: string; name: string; sourceName: string | null; path: string; durationSec: number; bytes: number; ready: boolean; createdAt: string; lastUsedAt: string | null };
type Detail = Record<string, unknown> & { music?: { tracks?: unknown } };

async function readDetail(client: Supa, ownerId: string, wsId: string | null): Promise<Detail> {
  if (wsId) {
    const { data, error } = await client.from("workspaces").select("brand_detail").eq("id", wsId).eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    return ((data as { brand_detail?: Detail } | null)?.brand_detail ?? {}) as Detail;
  }
  const { data, error } = await client.from("profiles").select("brand_detail").eq("user_id", ownerId).maybeSingle();
  if (error) throw error;
  return ((data as { brand_detail?: Detail } | null)?.brand_detail ?? {}) as Detail;
}
const storedList = (d: Detail): Stored[] => (Array.isArray(d.music?.tracks) ? (d.music!.tracks as unknown[]) : []).filter((t): t is Stored => Boolean(t && typeof t === "object" && typeof (t as Stored).id === "string" && typeof (t as Stored).path === "string"));
async function writeList(client: Supa, ownerId: string, wsId: string | null, list: Stored[]): Promise<void> {
  const detail = await readDetail(client, ownerId, wsId);
  const next = { ...detail, music: { ...(detail.music ?? {}), tracks: list.slice(0, MAX_TRACKS) } };
  if (wsId) {
    const { error } = await client.from("workspaces").update({ brand_detail: next, updated_at: new Date().toISOString() }).eq("id", wsId).eq("owner_id", ownerId);
    if (error) throw error;
    return;
  }
  const { error } = await client.from("profiles").upsert({ user_id: ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}
const rowOf = (s: Stored, ownerId: string, wsId: string | null): TrackRow => ({ id: s.id, user_id: ownerId, workspace_id: wsId, name: s.name, source_name: s.sourceName, path: s.path, duration_s: s.durationSec, bytes: s.bytes, ready: s.ready, created_at: s.createdAt, last_used_at: s.lastUsedAt });

// ---------------------------------------------------------------- the playlist

export async function listTracks(client: Supa, ownerId: string, wsId: string | null): Promise<Track[]> {
  const rows = await viaTable<TrackRow[]>(
    async () => {
      const { data, error } = await scopeToWorkspace(client.from("studio_tracks").select(COLS).eq("user_id", ownerId).eq("ready", true).order("created_at", { ascending: false }).limit(MAX_TRACKS), wsId);
      if (error) throw error;
      return (data ?? []) as TrackRow[];
    },
    async () => storedList(await readDetail(client, ownerId, wsId)).filter((s) => s.ready).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => rowOf(s, ownerId, wsId)),
  );
  const urls = await signUrls(client, rows.map((r) => r.path)).catch(() => ({}) as Record<string, string>);
  return rows.map((r) => toTrack(r, urls[r.path] ?? null));
}

export async function loadTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<TrackRow | null> {
  return viaTable<TrackRow | null>(
    async () => {
      const { data, error } = await scopeToWorkspace(client.from("studio_tracks").select(COLS).eq("user_id", ownerId).eq("id", id).limit(1), wsId);
      if (error) throw error;
      return ((data ?? [])[0] as TrackRow | undefined) ?? null;
    },
    async () => { const s = storedList(await readDetail(client, ownerId, wsId)).find((x) => x.id === id); return s ? rowOf(s, ownerId, wsId) : null; },
  );
}

/** Register a track the browser is about to upload: its record and the path to put the file at. */
export async function registerTrack(client: Supa, args: { ownerId: string; wsId: string | null; uploaderId: string; name: unknown; sourceName: unknown; durationSec: unknown; ext: unknown }): Promise<{ id: string; path: string }> {
  const ext = TRACK_EXTS.find((e) => e === String(args.ext ?? "").toLowerCase()) ?? "m4a";
  const dur = typeof args.durationSec === "number" && Number.isFinite(args.durationSec) ? Math.min(MAX_TRACK_SEC, Math.max(0, args.durationSec)) : 0;
  const id = crypto.randomUUID();
  const path = trackPath(args.uploaderId, id, ext);
  const name = cleanName(args.name, "Untitled sound");
  const sourceName = typeof args.sourceName === "string" ? args.sourceName.slice(0, 120) : null;
  await viaTable<void>(
    async () => {
      const { error } = await client.from("studio_tracks").insert({ id, user_id: args.ownerId, workspace_id: args.wsId, name, source_name: sourceName, path, duration_s: dur, bytes: 0, ready: false });
      if (error) throw error;
    },
    async () => {
      const list = storedList(await readDetail(client, args.ownerId, args.wsId));
      await writeList(client, args.ownerId, args.wsId, [{ id, name, sourceName, path, durationSec: dur, bytes: 0, ready: false, createdAt: new Date().toISOString(), lastUsedAt: null }, ...list]);
    },
  );
  return { id, path };
}

async function fileSize(client: Supa, path: string): Promise<number> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const file = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await storageClient(client).storage.from(STUDIO_BUCKET).list(folder, { search: file, limit: 5 });
  const obj = (data ?? []).find((o) => o.name === file);
  return Number((obj?.metadata as { size?: number } | undefined)?.size ?? 0);
}

/** The file is up: check it is there and not empty, then the track joins the playlist. */
export async function confirmTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<Track | null> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return null;
  const bytes = await fileSize(client, row.path);
  if (!bytes) throw new Error("The sound didn't arrive. Drop it again.");
  await viaTable<void>(
    async () => { const { error } = await client.from("studio_tracks").update({ ready: true, bytes }).eq("id", id).eq("user_id", ownerId); if (error) throw error; },
    async () => { const list = storedList(await readDetail(client, ownerId, wsId)); await writeList(client, ownerId, wsId, list.map((s) => (s.id === id ? { ...s, ready: true, bytes } : s))); },
  );
  const urls = await signUrls(client, [row.path]).catch(() => ({}) as Record<string, string>);
  return toTrack({ ...row, ready: true, bytes }, urls[row.path] ?? null);
}

export async function renameTrack(client: Supa, ownerId: string, wsId: string | null, id: string, name: unknown): Promise<boolean> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return false;
  const next = cleanName(name, row.name);
  await viaTable<void>(
    async () => { const { error } = await client.from("studio_tracks").update({ name: next }).eq("id", id).eq("user_id", ownerId); if (error) throw error; },
    async () => { const list = storedList(await readDetail(client, ownerId, wsId)); await writeList(client, ownerId, wsId, list.map((s) => (s.id === id ? { ...s, name: next } : s))); },
  );
  return true;
}

export async function touchTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<void> {
  const at = new Date().toISOString();
  await viaTable<void>(
    async () => { await client.from("studio_tracks").update({ last_used_at: at }).eq("id", id).eq("user_id", ownerId); },
    async () => { const list = storedList(await readDetail(client, ownerId, wsId)); await writeList(client, ownerId, wsId, list.map((s) => (s.id === id ? { ...s, lastUsedAt: at } : s))); },
  ).catch(() => null);
}

/** The record and the file go; a cut that used it keeps its own copy of the path and plays nothing until another is picked. */
export async function deleteTrack(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<boolean> {
  const row = await loadTrack(client, ownerId, wsId, id);
  if (!row) return false;
  await storageClient(client).storage.from(STUDIO_BUCKET).remove([row.path]).catch(() => null);
  await viaTable<void>(
    async () => { const { error } = await client.from("studio_tracks").delete().eq("id", id).eq("user_id", ownerId); if (error) throw error; },
    async () => { const list = storedList(await readDetail(client, ownerId, wsId)); await writeList(client, ownerId, wsId, list.filter((s) => s.id !== id)); },
  );
  return true;
}

export function toTrack(r: TrackRow, url: string | null): Track {
  return { id: r.id, name: soundName(r.name), sourceName: r.source_name, durationSec: r.duration_s, createdAt: r.created_at, lastUsedAt: r.last_used_at, url };
}
