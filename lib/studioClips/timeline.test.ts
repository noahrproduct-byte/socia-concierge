import { describe, it, expect } from "vitest";
import { timeline, captionsForEdl, edgeEnvelope, dbToGain, FPS } from "./timeline";
import type { Edl } from "./types";

const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 },
  segments: [
    { id: "s1", clipId: "a", in: 2, out: 6, role: "opener", note: "" },
    { id: "s2", clipId: "b", in: 0, out: 3.5, role: "body", note: "" },
  ],
  text: [], captions: { source: "transcript" }, enhance: [], audio: [{ clipId: "b", gainDb: 6, why: "" }], cta: null, music: null, caption: "", notes: [],
};

describe("timeline", () => {
  it("lays segments end to end in frames and carries the measured gain", () => {
    const t = timeline(edl);
    expect(t.segments[0]).toMatchObject({ startFrame: 0, durationFrames: 120, inFrame: 60, gainDb: 0 });
    expect(t.segments[1]).toMatchObject({ startFrame: 120, durationFrames: 105, inFrame: 0, gainDb: 6, startSec: 4 });
    expect(t.durationFrames).toBe(225);
    expect(t.durationSec).toBeCloseTo(7.5, 5);
    expect(FPS).toBe(30);
  });

  it("moves only the words inside each trim onto the output clock", () => {
    const caps = captionsForEdl(edl, {
      a: [
        { text: "Before", startMs: 500, endMs: 900, confidence: 1 },   // before the in point → dropped
        { text: "We", startMs: 2100, endMs: 2400, confidence: 1 },     // → 100–400 ms
        { text: "fed", startMs: 5600, endMs: 6100, confidence: 1 },    // straddles the out point, middle inside → end clipped to 6000
        { text: "two", startMs: 5950, endMs: 6400, confidence: 1 },    // middle past the out point → dropped
      ],
      b: [{ text: "hundred", startMs: 1000, endMs: 1300, confidence: 0.9 }], // → 4000 + 1000
    });
    expect(caps.map((c) => [c.text, c.startMs, c.endMs])).toEqual([[" We", 100, 400], [" fed", 3600, 4000], [" hundred", 5000, 5300]]);
    expect(captionsForEdl(edl, { a: null, b: [] })).toEqual([]);
  });

  it("fades edges without ever exceeding unity", () => {
    expect(edgeEnvelope(0, 120)).toBeLessThan(0.5);
    expect(edgeEnvelope(60, 120)).toBe(1);
    expect(edgeEnvelope(119, 120)).toBeLessThan(0.5);
    expect(edgeEnvelope(0, 2)).toBeGreaterThan(0);
    expect(dbToGain(6)).toBeCloseTo(1.995, 2);
    expect(dbToGain(0)).toBe(1);
  });
});
