import { describe, it, expect } from "vitest";
import { tasteLines, addPick, sanitizePicks, cleanPlaylist, trackPrompt, sanitizeSoundtrack, sanitizePlaylist, musicPath, type TasteInput, type MusicPick } from "./taste";

const base: TasteInput = { profile: null, library: null, original: null, picks: [], videoSec: 21.4, hasSpeech: true, cutNote: null, niche: null };

describe("taste lines", () => {
  it("say what was measured, plainly", () => {
    const lines = tasteLines({
      ...base,
      profile: { basedOn: 6, bpmRange: [100, 120], energy: "medium", musicShare: 0.5 },
      library: { n: 4, medianMultiplier: 1.6 }, original: { n: 5, medianMultiplier: 0.8 },
      picks: [{ style: "acoustic pop", mood: "warm", bpm: 110, energy: "medium", at: "" }],
    });
    expect(lines).toEqual([
      "Your best measured posts (6) run 100 to 120 BPM, medium energy, with music in 50% of them.",
      "Posts with music have done 1.6× your median, original sound 0.8×.",
      "You've picked warm acoustic pop (110 BPM).",
      "This video: 21 seconds, with speech, so the tracks are instrumental and sit under the voice.",
    ]);
  });
  it("leans on original sound when it has done better, and admits when nothing is known", () => {
    expect(tasteLines({ ...base, library: { n: 3, medianMultiplier: 0.7 }, original: { n: 4, medianMultiplier: 1.3 } })[0]).toMatch(/^Original sound has done 1\.3×.*keep the music low/);
    expect(tasteLines(base).at(-1)).toMatch(/hasn't measured your posts' sound yet/);
    expect(tasteLines({ ...base, library: { n: 1, medianMultiplier: 3 }, original: { n: 9, medianMultiplier: 1 } }).some((l) => /median/.test(l))).toBe(false);
  });
});

describe("picks", () => {
  const p = (style: string, mood: string): MusicPick => ({ style, mood, bpm: 100, energy: "medium", at: "" });
  it("keep the newest first without repeats, at most 20", () => {
    let picks: MusicPick[] = [];
    for (let i = 0; i < 25; i++) picks = addPick(picks, p(`s${i}`, "warm"));
    expect(picks).toHaveLength(20);
    expect(addPick([p("lofi", "chill"), p("pop", "bright")], p("LoFi", "Chill")).map((x) => x.style)).toEqual(["LoFi", "pop"]);
  });
  it("drop malformed stored picks", () => {
    expect(sanitizePicks([{ style: "pop", mood: "bright", bpm: 400, energy: "loud" }, { style: "" }, null])).toEqual([{ style: "pop", mood: "bright", bpm: null, energy: "medium", at: "" }]);
  });
});

describe("the playlist", () => {
  it("is bounded and gets stable ids", () => {
    let n = 0;
    const raw = { tracks: [{ name: "Warm acoustic bounce", style: "acoustic pop", mood: "warm", bpm: 300, energy: "high", instruments: "guitar, claps", why: "closest to your best posts" }, { name: "", style: "x", mood: "y" }], suggestions: [{ search: "upbeat acoustic", why: "same feel" }, { search: "" }] };
    const p = cleanPlaylist(raw, () => `m${n++}abcd`);
    expect(p.tracks).toEqual([{ id: "m0abcd", name: "Warm acoustic bounce", style: "acoustic pop", mood: "warm", bpm: 180, energy: "high", instruments: "guitar, claps", why: "closest to your best posts" }]);
    expect(p.suggestions).toEqual([{ search: "upbeat acoustic", why: "same feel" }]);
  });
  it("asks the music model for how it sounds, at the video's length", () => {
    const t = { id: "m1abcd", name: "Warm", style: "acoustic pop", mood: "warm", bpm: 110, energy: "medium" as const, instruments: "guitar", why: "" };
    const r = trackPrompt(t, 21.4, true);
    expect(r.lengthMs).toBe(21000);
    expect(r.prompt).toMatch(/^warm acoustic pop instrumental with guitar, about 110 BPM, medium energy, 21 seconds.*a voice sits clearly on top/);
    expect(trackPrompt(t, 3, false).lengthMs).toBe(10000);
    expect(trackPrompt(t, 500, false).lengthMs).toBe(120000);
  });
  it("only lets a cut use one of its own tracks, with the path made on the server", () => {
    const playlist = sanitizePlaylist({ taste: ["a"], tracks: [{ id: "m1abcd", name: "Warm", style: "pop", mood: "warm", bpm: 110, energy: "medium" }], suggestions: [], createdAt: "x" })!;
    const pathFor = (id: string) => musicPath("u1", "p1", "b1", id);
    expect(sanitizeSoundtrack({ trackId: "m1abcd", musicVolume: 2, originalVolume: -1, path: "../../evil" }, playlist, pathFor)).toEqual({ trackId: "m1abcd", name: "Warm", path: "u1/p1/music/b1-m1abcd.mp3", musicVolume: 1, originalVolume: 0 });
    expect(sanitizeSoundtrack({ trackId: "other" }, playlist, pathFor)).toBeNull();
    expect(sanitizeSoundtrack({ trackId: "m1abcd" }, null, pathFor)).toBeNull();
    expect(sanitizePlaylist({ tracks: [{ id: "bad id", name: "x", style: "y", mood: "z" }] })).toBeNull();
  });
});
