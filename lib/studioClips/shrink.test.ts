import { describe, expect, it } from "vitest";
import { SHRINK_ABOVE, STORAGE_FILE_LIMIT, needsTranscode, shrinkPlan } from "./shrink";

const MB = 1024 * 1024;

describe("shrinkPlan", () => {
  it("leaves a clip under the limit alone", () => {
    expect(shrinkPlan(158 * MB, 25, 2160, 3840)).toEqual({ needed: false });
    expect(shrinkPlan(470 * MB, 300, 1080, 1920)).toEqual({ needed: false });
    expect(SHRINK_ABOVE).toBeLessThan(STORAGE_FILE_LIMIT);
    expect(STORAGE_FILE_LIMIT).toBe(500 * MB);
  });
  it("brings a long 4K phone clip down to 1080p at a bitrate that fits", () => {
    const p = shrinkPlan(1600 * MB, 240, 2160, 3840);
    expect(p).toMatchObject({ needed: true, possible: true, width: 1080, height: 1920 });
    if (p.needed && p.possible) {
      expect(p.videoBps).toBeLessThanOrEqual(8_000_000);
      expect(((p.videoBps + 128_000) * 240) / 8).toBeLessThan(SHRINK_ABOVE);
    }
  });
  it("lowers the bitrate for a long speech so it still fits", () => {
    const p = shrinkPlan(900 * MB, 600, 1080, 1920);
    expect(p.needed && p.possible && ((p.videoBps + 128_000) * 600) / 8 < SHRINK_ABOVE).toBe(true);
  });
  it("keeps the shape of a landscape clip, in even sizes", () => {
    expect(shrinkPlan(600 * MB, 120, 3840, 2160)).toMatchObject({ width: 1920, height: 1080 });
    expect(shrinkPlan(600 * MB, 120, 1281, 721)).toMatchObject({ width: 1282, height: 722 });
  });
  it("says so when a clip is too long to fit at a watchable quality", () => {
    expect(shrinkPlan(20000 * MB, 6000, 2160, 3840)).toEqual({ needed: true, possible: false });
  });
});

describe("needsTranscode (BUG-12: HEVC converted on the device)", () => {
  it("names HEVC however the file calls it, and nothing else", () => {
    expect(needsTranscode("hevc")).toBe(true);
    expect(needsTranscode("hvc1")).toBe(true);
    expect(needsTranscode("avc")).toBe(false);
    expect(needsTranscode(null)).toBe(false);
  });
  it("a forced plan converts a small clip without shrinking it", () => {
    const p = shrinkPlan(10 * 1024 * 1024, 20, 1920, 1080, true);
    expect(p.needed).toBe(true);
    expect(p.needed && p.possible && p.width).toBe(1920);
  });
});
