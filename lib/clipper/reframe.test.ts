import { describe, it, expect } from "vitest";
import { MAX_MOVES, PAN_SEC, MAX_SAMPLES, centerToX, cleanCropPath, cropShare, cropXAt, readCropPath, sampleTimes } from "./reframe";

const share = cropShare(1280, 720); // about 0.316

describe("the frame moves with the video", () => {
  it("knows how much of a landscape source fits, and where a point sits", () => {
    expect(share).toBeCloseTo(0.316, 2);
    expect(cropShare(1080, 1920)).toBe(1);
    expect(centerToX(0.5, share)).toBeCloseTo(0.5);
    expect(centerToX(share / 2, share)).toBeCloseTo(0); // A subject at the far left: the frame against the left edge.
    expect(centerToX(0.99, share)).toBe(1); // Past the reachable range: as far as it goes.
    expect(centerToX(0.2, 1)).toBe(0.5);
  });

  it("samples a frame every 2 seconds, and spreads them out on a long clip", () => {
    expect(sampleTimes(10)).toEqual([0.2, 2.2, 4.2, 6.2, 8.2]);
    const long = sampleTimes(180);
    expect(long).toHaveLength(MAX_SAMPLES);
    expect(long[long.length - 1]).toBeLessThan(180);
  });

  it("turns the answer into a calm path: starts at 0, in order, no wobble, no quick moves", () => {
    const path = cleanCropPath({ moves: [
      { t: 20, center: 0.2 },
      { t: 0.4, center: 0.7 },
      { t: 6, center: 0.72 }, // Too small a move.
      { t: 21, center: 0.8 }, // Too soon after the last.
      { t: 30, center: 0.7 },
      { t: 99, center: 0.1 }, // Past the end.
      { t: "x", center: 0.1 },
    ] }, 40, share)!;
    expect(path.map((k) => k.t)).toEqual([0, 20, 30]);
    expect(path[0].x).toBeCloseTo(centerToX(0.7, share), 2);
    expect(path[1].x).toBeLessThan(path[0].x);
  });

  it("has nothing to do on a vertical source, or with no usable answer", () => {
    expect(cleanCropPath({ moves: [{ t: 0, center: 0.2 }] }, 40, 1)).toBeNull();
    expect(cleanCropPath({ moves: [] }, 40, share)).toBeNull();
    expect(cleanCropPath(null, 40, share)).toBeNull();
  });

  it("caps how often it moves", () => {
    const moves = Array.from({ length: 40 }, (_, i) => ({ t: i * 5, center: i % 2 ? 0.2 : 0.8 }));
    expect(cleanCropPath({ moves }, 200, share)!.length).toBeLessThanOrEqual(MAX_MOVES + 1);
  });

  it("holds, then eases across and arrives on time", () => {
    const path = [{ t: 0, x: 0.8 }, { t: 10, x: 0.2 }];
    expect(cropXAt(path, 0)).toBe(0.8);
    expect(cropXAt(path, 10 - PAN_SEC)).toBe(0.8);
    expect(cropXAt(path, 10 - PAN_SEC / 2)).toBeCloseTo(0.5, 5);
    expect(cropXAt(path, 10)).toBe(0.2);
    expect(cropXAt(path, 30)).toBe(0.2);
    const a = cropXAt(path, 10 - PAN_SEC * 0.75), b = cropXAt(path, 10 - PAN_SEC * 0.25);
    expect(a).toBeGreaterThan(b);
    expect(cropXAt([], 3)).toBe(0.5);
  });

  it("only accepts a real path back from storage", () => {
    expect(readCropPath([{ t: 0, x: 2 }])).toEqual([{ t: 0, x: 1 }]);
    expect(readCropPath([{ t: 0 }])).toBeNull();
    expect(readCropPath(null)).toBeNull();
    expect(readCropPath([])).toBeNull();
  });
});
