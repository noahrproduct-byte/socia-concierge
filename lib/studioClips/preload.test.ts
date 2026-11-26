import { describe, expect, it } from "vitest";
import { PRELOAD_TOTAL_MAX, PRELOAD_TOTAL_SMALL, preloadBudget, preloadOrder } from "./preload";

const seg = (id: string, clipId: string) => ({ id, clipId, in: 0, out: 2, role: "body" as const, note: "" });
const sources = { a: { url: "https://x.test/a.mp4" }, b: { url: "https://x.test/b.mp4" }, c: { url: "https://x.test/c.mp4" } };

describe("what the editor fetches ahead", () => {
  it("is each clip of the cut once, in the order the cut reaches it, sounds first", () => {
    const edl = { segments: [seg("1", "b"), seg("2", "a"), seg("3", "b")], broll: [] };
    expect(preloadOrder(edl, sources, ["https://x.test/music.mp3", null])).toEqual(["https://x.test/music.mp3", "https://x.test/b.mp4", "https://x.test/a.mp4"]);
  });
  it("leaves out clips the cut doesn't use and links that aren't fetchable", () => {
    const edl = { segments: [seg("1", "a"), seg("2", "gone")], broll: [{ id: "x", clipId: "c", at: 1, in: 0, out: 1 }] };
    expect(preloadOrder(edl as never, { ...sources, d: { url: "blob:local" } })).toEqual(["https://x.test/a.mp4", "https://x.test/c.mp4"]);
  });
  it("holds nothing with data saving on or very little memory, and less on a small device", () => {
    expect(preloadBudget({ saveData: true, memoryGb: 8 })).toBe(0);
    expect(preloadBudget({ memoryGb: 2 })).toBe(0);
    expect(preloadBudget({ memoryGb: 4 })).toBe(PRELOAD_TOTAL_SMALL);
    expect(preloadBudget({ memoryGb: null })).toBe(PRELOAD_TOTAL_MAX);
  });
});
