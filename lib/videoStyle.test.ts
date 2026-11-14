import { describe, expect, it } from "vitest";
import { applyStyleEdits, cleanStyleRead, cutTimes, cutsPer10s, mergePalettes, paletteFromPixels, readSavedStyle } from "./videoStyle";

const px = (rgb: [number, number, number], n: number) => Array.from({ length: n }, () => rgb).flat();

describe("measuring a Reel", () => {
  it("counts the palette from real pixels", () => {
    const navy: [number, number, number] = [20, 28, 60];
    const yellow: [number, number, number] = [245, 200, 40];
    const p = paletteFromPixels(new Uint8Array([...px(navy, 80), ...px(yellow, 20), ...px([22, 30, 62], 10)]));
    expect(p[0].hex).toBe("#141C3C");
    expect(p[0].share).toBeCloseTo(0.82, 1);
    expect(p[1].hex).toBe("#F5C828");
  });
  it("merges several videos' palettes", () => {
    const m = mergePalettes([[{ hex: "#151D3D", share: 0.8 }], [{ hex: "#141C3C", share: 0.6 }, { hex: "#F5C828", share: 0.3 }]]);
    expect(m).toHaveLength(2);
    expect(m[0].share).toBeCloseTo(0.7, 1);
  });
  it("reads cuts from ffmpeg's log", () => {
    const log = "[Parsed_showinfo_1] n:0 pts:1 pts_time:1.2 x\n n:1 pts_time:1.3 \n n:2 pts_time:4.8";
    expect(cutTimes(log)).toEqual([1.2, 4.8]);
    expect(cutsPer10s(3, 15)).toBe(2);
  });
});

describe("the style read", () => {
  const ctx = {
    sources: [
      { id: "a", from: "own" as const, account: "@b", permalink: null, thumb: null, views: 1500, multiple: 1.7, seconds: 12 },
      { id: "b", from: "own" as const, account: "@b", permalink: null, thumb: null, views: 1300, multiple: 1.4, seconds: 10 },
      { id: "x", from: "competitor" as const, account: "@kaya", permalink: null, thumb: null, views: 40000, multiple: 5.8, seconds: 20 },
    ],
    palette: [{ hex: "#151D3D", share: 0.7 }, { hex: "#FFFFFF", share: 0.1 }, { hex: "#F5C828", share: 0.08 }],
    own: { seconds: 11, cutsPer10s: 1 }, competitors: { seconds: 20, cutsPer10s: 3 }, now: new Date("2026-11-14T00:00:00Z"),
  };
  it("keeps only measured colours and own Reels in a kind of video", () => {
    const s = cleanStyleRead({
      identity: { background: "#141C3E", text: "#FFFFFF", accent: "#00FF00", font: "condensed", type: "Bold condensed caps", logo: { spot: "top-right", what: "green mark" }, characters: "stick figure", stage: "navy wall",
        formats: [{ name: "Climber scenes", made: "animated", look: "A climber on a wall.", spine: "a short story", reels: ["a", "b", "x"] }, { name: "One-off", made: "animated", look: "x", spine: "", reels: ["a"] }] },
      structure: { hooks: ["Opens mid-fall"], pacing: "Cuts every 2 s", spines: [], endings: ["A question"] }, limitations: [],
    }, ctx);
    expect(s.identity.background).toBe("#151D3D");
    expect(s.identity.accent).toBe("#F5C828"); // a colour the frames don't have falls back to a measured one
    expect(s.identity.formats).toHaveLength(1);
    expect(s.identity.formats[0].ids).toEqual(["a", "b"]); // never a competitor's Reel
    expect(s.identity.font).toBe("condensed");
    expect(readSavedStyle(s)).not.toBeNull();
  });
  it("takes the person's corrections, made safe", () => {
    const s = cleanStyleRead({}, ctx);
    const e = applyStyleEdits(s, { identity: { accent: "#ff0000", font: "nope", characters: "a climber", logo: { spot: "top-left" } } }, new Date("2026-11-15T00:00:00Z"));
    expect(e.identity.accent).toBe("#FF0000");
    expect(e.identity.font).toBe(s.identity.font);
    expect(e.identity.logo.spot).toBe("top-left");
    expect(e.confirmed_at).toBe("2026-11-15T00:00:00.000Z");
  });
});
