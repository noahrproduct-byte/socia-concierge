import { describe, expect, it } from "vitest";
import { clipSecAt, ease, keyframeValue, motionAt, sanitizeMotion, segmentFrames, speedPieces, transformCss } from "./motion";

describe("easing and keyframes", () => {
  it("ease in-out starts slow and ends slow, never linear", () => {
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeLessThan(0.25);
    expect(ease(0.75)).toBeGreaterThan(0.75);
    expect(ease(0.5, "linear")).toBe(0.5);
  });
  it("keyframes hold outside the range and ease between", () => {
    const k = [{ t: 0, v: 1 }, { t: 10, v: 2 }];
    expect(keyframeValue(-1, k)).toBe(1); expect(keyframeValue(11, k)).toBe(2);
    expect(keyframeValue(5, k)).toBeCloseTo(1.5, 5);
  });
});

describe("motionAt", () => {
  it("a slow zoom goes from the start scale to the end scale with the focal point as its origin", () => {
    const m = { zoom: { from: 1, to: 1.1, x: 0.3, y: 0.6, ease: "inOut" as const } };
    expect(motionAt(m, 0, 60, 0)).toMatchObject({ scale: 1, ox: 0.3, oy: 0.6 });
    expect(motionAt(m, 59, 60, 0).scale).toBeCloseTo(1.1, 5);
    expect(motionAt(m, 30, 60, 0).scale).toBeCloseTo(1.05, 2);
  });
  it("a punch steps in at the word and settles back within PUNCH_SEC", () => {
    const m = { punch: { at: [2], amount: 0.1 } };
    expect(motionAt(m, 0, 90, 2.0).scale).toBeCloseTo(1.1, 5);
    expect(motionAt(m, 0, 90, 2.2).scale).toBeGreaterThan(1);
    expect(motionAt(m, 0, 90, 2.4).scale).toBe(1);
    expect(motionAt(m, 0, 90, 1.9).scale).toBe(1);
  });
  it("shake is deterministic per frame and seed, and never larger than the span", () => {
    const m = { shake: 1 };
    const a = motionAt(m, 7, 90, 0, 3), b = motionAt(m, 7, 90, 0, 3), c = motionAt(m, 8, 90, 0, 3);
    expect(a).toEqual(b);
    expect(a.x).not.toBe(c.x);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(0.012);
    expect(a.scale).toBeGreaterThan(1);
  });
  it("nothing to do gives the identity", () => {
    expect(transformCss(motionAt(undefined, 3, 10, 0)).transform).toBeUndefined();
  });
});

describe("speed", () => {
  const cut = { in: 2, out: 8 };
  it("without a speed, one piece at 1x and the plain frame count", () => {
    expect(speedPieces(cut)).toEqual([{ in: 2, out: 8, rate: 1, frames: 180 }]);
    expect(segmentFrames(cut)).toBe(180);
  });
  it("slow motion at 0.5x with ramps takes about twice as long and eases in", () => {
    const s = { ...cut, motion: { speed: { rate: 0.5, rampSec: 0.4 } } };
    const p = speedPieces(s);
    expect(p).toHaveLength(3);
    expect(p[0].rate).toBeCloseTo(0.75, 5);
    expect(p[1].rate).toBe(0.5);
    const total = segmentFrames(s);
    expect(total).toBeGreaterThan(300); expect(total).toBeLessThan(360);
    // The clip time at the end is the out point; in the middle it lags real time.
    expect(clipSecAt(s, total)).toBe(8);
    expect(clipSecAt(s, 90)).toBeLessThan(2 + 3);
    expect(clipSecAt(s, 0)).toBe(2);
  });
  it("a bounded motion from stored JSON", () => {
    expect(sanitizeMotion({ zoom: { from: 1, to: 9, x: 2, y: -1, ease: "weird" }, shake: 4, speed: { rate: 0.1, rampSec: 9 }, punch: { at: [1, 99, "x"], amount: 2 } }, 0, 10)).toEqual({
      zoom: { from: 1, to: 1.6, x: 1, y: 0, ease: "inOut" }, shake: 1, speed: { rate: 0.25, rampSec: 2 }, punch: { at: [1], amount: 0.3 },
    });
    expect(sanitizeMotion({ zoom: { from: 1, to: 1 } }, 0, 10)).toBeUndefined();
    expect(sanitizeMotion("x", 0, 10)).toBeUndefined();
  });
});
