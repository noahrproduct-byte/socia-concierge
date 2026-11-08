import { describe, it, expect } from "vitest";
import { BAND_SCALE, MAX_MOVES, MAX_SAMPLES, TIGHT_SCALE, cleanCropPath, cropShare, readCropPath, sampleTimes, shotScale, viewAt, viewBox } from "./reframe";

const share = cropShare(1280, 720); // about 0.316
const num = (s: string) => parseFloat(s);
const person = (t: number, center = 0.65) => ({ t, shot: "person", center, y: 0.35 });
const wide = (t: number) => ({ t, shot: "wide", center: 0, y: 0 });

describe("choosing shots", () => {
  it("knows how much of a landscape source fits", () => {
    expect(share).toBeCloseTo(0.316, 2);
    expect(cropShare(1080, 1920)).toBe(1);
  });

  it("samples a frame every 2 seconds, and spreads them out on a long clip", () => {
    expect(sampleTimes(10)).toEqual([0.2, 2.2, 4.2, 6.2, 8.2]);
    const long = sampleTimes(180);
    expect(long).toHaveLength(MAX_SAMPLES);
    expect(long[long.length - 1]).toBeLessThan(180);
  });

  it("makes the answer calm: starts at 0, in order, no wobble, no quick changes, nothing unknown", () => {
    const path = cleanCropPath({ moves: [
      wide(20),
      person(0.4),
      person(6, 0.67), // Too small a move.
      person(21), // Too soon after the last.
      { t: 30, shot: "tight", center: 0.65, y: 0.3 },
      wide(99), // Past the end.
      { t: 35, shot: "sideways", center: 0.5, y: 0.5 },
      { t: "x", shot: "wide", center: 0, y: 0 },
    ] }, 40, share)!;
    expect(path.map((k) => [k.t, k.s])).toEqual([[0, 1], [20, Math.round(share * 1000) / 1000], [30, TIGHT_SCALE]]);
  });

  it("has nothing to do on a vertical source, or with no usable answer", () => {
    expect(cleanCropPath({ moves: [person(0)] }, 40, 1)).toBeNull();
    expect(cleanCropPath({ moves: [] }, 40, share)).toBeNull();
    expect(cleanCropPath(null, 40, share)).toBeNull();
  });

  it("caps how often it changes shot", () => {
    const moves = Array.from({ length: 40 }, (_, i) => (i % 2 ? wide(i * 5) : person(i * 5)));
    expect(cleanCropPath({ moves }, 200, share)!.length).toBeLessThanOrEqual(MAX_MOVES + 1);
  });
});

describe("changing shot", () => {
  const p = { t: 0, c: 0.65, y: 0.35, s: 1 };
  const w = { t: 10, c: 0.5, y: 0.5, s: 0.316 };

  it("is always a hard cut, with no in-between", () => {
    expect(viewAt([p, w], 9.99)).toMatchObject({ c: 0.65, s: 1 });
    expect(viewAt([p, w], 10)).toMatchObject({ c: 0.5, s: 0.316 });
    expect(viewAt([p, w], 30)).toMatchObject({ s: 0.316 });
    expect(viewAt([], 3)).toEqual({ c: 0.5, y: 0.5, s: 1 });
  });

  it("shows a square-ish band of a landscape source, in the middle, on black", () => {
    expect(shotScale("band", share)).toBe(BAND_SCALE);
    expect(shotScale("band", 0.9)).toBe(0.9); // Never narrower than the whole picture.
    const b = viewBox(1280, 720, 1080, 1920, { c: 0.3, y: 0.5, s: BAND_SCALE });
    expect(num(b.height)).toBeCloseTo(56, 0);
    expect(num(b.top)).toBeCloseTo(28, 0);
    expect(num(b.width)).toBeGreaterThan(100);
  });
});

describe("where the picture sits", () => {
  it("fills the frame with the subject centred, and never shows past the picture's edge", () => {
    const b = viewBox(1280, 720, 1080, 1920, { c: 0.65, y: 0.5, s: 1 });
    expect(num(b.height)).toBe(100);
    expect(num(b.top)).toBe(0);
    expect(num(b.width)).toBeCloseTo(316, 0);
    expect(num(b.left)).toBeCloseTo(50 - 0.65 * 316.05, 0); // The subject's point is mid-frame.
    expect(num(viewBox(1280, 720, 1080, 1920, { c: 0, y: 0.5, s: 1 }).left)).toBe(0);
    expect(num(viewBox(1280, 720, 1080, 1920, { c: 1, y: 0.5, s: 1 }).left)).toBeCloseTo(100 - 316.05, 0);
  });

  it("shows the whole picture when wide, below the headline, on black", () => {
    const b = viewBox(1280, 720, 1080, 1920, { c: 0.5, y: 0.5, s: 0.3164 });
    expect(num(b.width)).toBeCloseTo(100, 0);
    expect(num(b.left)).toBeCloseTo(0, 0);
    expect(num(b.height)).toBeCloseTo(31.64, 1);
    expect(num(b.top)).toBeCloseTo(40.18, 1);
  });

  it("punches in around the face", () => {
    const b = viewBox(1280, 720, 1080, 1920, { c: 0.65, y: 0.6, s: TIGHT_SCALE });
    expect(num(b.height)).toBe(125);
    expect(num(b.top)).toBe(-25); // The face's point is mid-frame.
    expect(num(viewBox(1280, 720, 1080, 1920, { c: 0.65, y: 0.1, s: TIGHT_SCALE }).top)).toBe(0); // Never past the picture's top.
  });
});

describe("a saved path", () => {
  it("only accepts a real one", () => {
    expect(readCropPath([{ t: 0, c: 2, y: 0.5, s: 1 }])).toEqual([{ t: 0, c: 1, y: 0.5, s: 1 }]);
    expect(readCropPath([{ t: 0, x: 0.5 }])).toBeNull();
    expect(readCropPath(null)).toBeNull();
    expect(readCropPath([])).toBeNull();
  });
});
