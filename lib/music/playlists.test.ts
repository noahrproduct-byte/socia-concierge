import { describe, expect, it } from "vitest";
import { addList, filterTracks, MAX_CUSTOM, normalizePlaylists, removeList, toggleInList } from "./playlists";
import type { Track } from "./tracks";

const track = (id: string, name: string, sourceName: string | null = null): Track => ({ id, name, sourceName, durationSec: 30, createdAt: "2026-11-20T00:00:00Z", lastUsedAt: null, url: null });
const tracks = [track("a", "Sunset drive", "sunset.mp3"), track("b", "Hype beat"), track("c", "Piano", "calm-keys.m4a")];

describe("playlists", () => {
  it("always has the four built-in lists first, even when nothing is stored", () => {
    expect(normalizePlaylists(undefined).map((p) => p.name)).toEqual(["Favorites", "Trending sounds", "Cinematic", "Energetic"]);
  });

  it("keeps the person's own lists, cleaned, and drops sounds no longer in the library", () => {
    const lists = normalizePlaylists([
      { id: "favorites", trackIds: ["a", "gone", "a"] },
      { id: "own-1", name: "  Cafe   mornings ", trackIds: ["c", 5] },
      { id: "own-2", name: "" },
      { id: "favorites", name: "Hijack" },
      "junk",
    ], ["a", "b", "c"]);
    expect(lists.find((p) => p.id === "favorites")).toMatchObject({ name: "Favorites", trackIds: ["a"] });
    expect(lists.filter((p) => !p.builtIn)).toEqual([{ id: "own-1", name: "Cafe mornings", trackIds: ["c"] }]);
  });

  it("caps the person's own lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `own-${i}`, name: `List ${i}`, trackIds: [] }));
    expect(normalizePlaylists(many).filter((p) => !p.builtIn)).toHaveLength(MAX_CUSTOM);
  });

  it("puts a sound in a list and takes it out again", () => {
    const base = normalizePlaylists([]);
    const once = toggleInList(base, "cinematic", "c");
    expect(once.find((p) => p.id === "cinematic")?.trackIds).toEqual(["c"]);
    expect(toggleInList(once, "cinematic", "c").find((p) => p.id === "cinematic")?.trackIds).toEqual([]);
  });

  it("adds a list with a new name only, and never removes a built-in one", () => {
    const base = normalizePlaylists([]);
    const added = addList(base, "Launch week", "own-x")!;
    expect(added.at(-1)).toEqual({ id: "own-x", name: "Launch week", trackIds: [] });
    expect(addList(added, "launch WEEK", "own-y")).toBeNull();
    expect(addList(added, "   ", "own-z")).toBeNull();
    expect(removeList(added, "own-x")).toHaveLength(4);
    expect(removeList(added, "favorites")).toHaveLength(5);
  });

  it("shows the chosen list's sounds that match the search, by name or file", () => {
    const lists = toggleInList(toggleInList(normalizePlaylists([]), "energetic", "b"), "energetic", "a");
    expect(filterTracks(tracks, lists, "all", "").map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(filterTracks(tracks, lists, "energetic", "").map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTracks(tracks, lists, "energetic", "hype").map((t) => t.id)).toEqual(["b"]);
    expect(filterTracks(tracks, lists, "all", "keys").map((t) => t.id)).toEqual(["c"]);
  });
});
