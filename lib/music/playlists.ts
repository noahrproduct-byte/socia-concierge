// Playlists in the person's music library: four that are always there (Favorites, Trending
// sounds, Cinematic, Energetic) and up to MAX_CUSTOM of their own. A playlist is a name and
// the ids of the sounds in it; a sound can sit in any number of them, and removing a sound
// from the library drops it from every list on the next read. Stored on the brand's own row
// (brand_detail.music.playlists, lib/music/playlistsServer.ts). Pure and browser-safe.
import type { Track } from "./tracks";

export type Playlist = { id: string; name: string; trackIds: string[]; builtIn?: true };

export const BUILT_IN: readonly Pick<Playlist, "id" | "name">[] = [
  { id: "favorites", name: "Favorites" },
  { id: "trending", name: "Trending sounds" },
  { id: "cinematic", name: "Cinematic" },
  { id: "energetic", name: "Energetic" },
];
export const MAX_CUSTOM = 20;
export const MAX_IN_LIST = 200;
const NAME_MAX = 40;

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "");
const cleanIds = (v: unknown, known?: ReadonlySet<string>) =>
  [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64 && (!known || known.has(x))))].slice(0, MAX_IN_LIST);

/** Whatever was stored (or sent), as the lists to show: the four built-in ones first, then the person's own. */
export function normalizePlaylists(raw: unknown, knownTrackIds?: Iterable<string>): Playlist[] {
  const known = knownTrackIds ? new Set(knownTrackIds) : undefined;
  const list = (Array.isArray(raw) ? raw : []).filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object");
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of list) if (!byId.has(String(p.id ?? ""))) byId.set(String(p.id ?? ""), p);
  const builtIn: Playlist[] = BUILT_IN.map((b) => ({ id: b.id, name: b.name, trackIds: cleanIds(byId.get(b.id)?.trackIds, known), builtIn: true }));
  const seen = new Set(BUILT_IN.map((b) => b.id));
  const own: Playlist[] = [];
  for (const p of list) {
    const id = typeof p.id === "string" ? p.id.slice(0, 64) : "";
    const name = cleanName(p.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    own.push({ id, name, trackIds: cleanIds(p.trackIds, known) });
    if (own.length >= MAX_CUSTOM) break;
  }
  return [...builtIn, ...own];
}

/** The lists with `trackId` put in, or taken out of, one of them. */
export function toggleInList(lists: Playlist[], listId: string, trackId: string): Playlist[] {
  return lists.map((p) => (p.id !== listId ? p : { ...p, trackIds: p.trackIds.includes(trackId) ? p.trackIds.filter((x) => x !== trackId) : [trackId, ...p.trackIds].slice(0, MAX_IN_LIST) }));
}

/** A new list of the person's own, or null when the name is empty, taken or there are too many. */
export function addList(lists: Playlist[], name: string, id: string): Playlist[] | null {
  const n = cleanName(name);
  if (!n || lists.filter((p) => !p.builtIn).length >= MAX_CUSTOM) return null;
  if (lists.some((p) => p.name.toLowerCase() === n.toLowerCase())) return null;
  return [...lists, { id, name: n, trackIds: [] }];
}

/** The lists without one of the person's own (the built-in ones stay). */
export const removeList = (lists: Playlist[], listId: string): Playlist[] => lists.filter((p) => p.builtIn || p.id !== listId);

/** The sounds to show: those in the chosen list ("all" for every one) whose name or file matches the search. */
export function filterTracks(tracks: Track[], lists: Playlist[], listId: string, query: string): Track[] {
  const inList = listId === "all" ? null : new Set(lists.find((p) => p.id === listId)?.trackIds ?? []);
  const q = query.trim().toLowerCase();
  return tracks.filter((t) => (!inList || inList.has(t.id)) && (!q || t.name.toLowerCase().includes(q) || (t.sourceName ?? "").toLowerCase().includes(q)));
}
