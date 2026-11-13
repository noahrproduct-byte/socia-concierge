import { describe, expect, it } from "vitest";
import { findTakes, profane, sameLine, scoreTake, takesNote } from "./takes";
import type { TranscriptWord } from "./types";

const w = (s: string, t0 = 0): TranscriptWord[] => s.split(" ").map((text, i) => ({ text, startMs: Math.round((t0 + i * 0.3) * 1000), endMs: Math.round((t0 + i * 0.3 + 0.25) * 1000), confidence: 1 }));
// The rug shop takes from the live test of 2026-11-13.
const c13 = { id: "c13", position: 13, durationSec: 3.5, words: w("Come see this carpet for yourself here.") };
const c14 = { id: "c14", position: 14, durationSec: 4, words: w("Come see this rug for yourself here at ZenRugs and Furniture.") };
const c15 = { id: "c15", position: 15, durationSec: 7.5, words: [...w("Come see this rug for—", 1), ...w("come see this rug for yourself here at Zen Rugs and Furniture.", 4.2)] };
const c16 = { id: "c16", position: 16, durationSec: 4, words: w("Come see this rug for yourself at Zane Rugs and Furniture.") };
const c11 = { id: "c11", position: 11, durationSec: 6, words: w("Take it. Fuck, just read it. I'm gonna read it, bro. Okay, all right, go ahead.") };
const c9 = { id: "c9", position: 9, durationSec: 4, words: w("Look at this beautiful carpet. How much you think this rug costs, huh?") };
const broll = { id: "b1", position: 0, durationSec: 3, words: null };

describe("takes", () => {
  it("knows two takes of one line, and a different line", () => {
    expect(sameLine(c14, c16)).toBe(true);
    expect(sameLine(c14, c15)).toBe(true);
    expect(sameLine(c14, c9)).toBe(false);
    expect(sameLine(c14, broll)).toBe(false);
  });
  it("prefers the complete, clean take; marks the broken one and the profane one", () => {
    expect(scoreTake(c14).score).toBeGreaterThan(scoreTake(c15).score);
    expect(scoreTake(c15).reasons.join(" ")).toMatch(/restart|broken/);
    expect(profane(c11.words)).toBe(true);
    expect(scoreTake(c11).reasons).toContain("profanity");
  });
  it("groups the four 'come see this rug' takes, keeps one, lists the rest as repeats", () => {
    const t = findTakes([broll, c9, c11, c13, c14, c15, c16]);
    expect(t.groups).toHaveLength(1);
    const g = t.groups[0];
    expect(g.clipIds.sort()).toEqual(["c13", "c14", "c15", "c16"]);
    expect(["c14", "c16"]).toContain(g.keep);
    expect(t.repeats.has("c15")).toBe(true);
    expect(t.repeats.has("c9")).toBe(false);
    expect(takesNote(t)).toMatch(/cleanest take/);
    expect(takesNote({ groups: [], repeats: new Map() })).toBe("");
  });
});
