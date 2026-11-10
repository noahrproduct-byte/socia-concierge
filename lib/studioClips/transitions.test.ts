import { describe, expect, it } from "vitest";
import { overlapFrames, timeline, TRANSITION_FRAMES } from "./timeline";
import { transitionLook, transitionSound } from "./transitions";
import { edlDurationSec, validateEdl } from "./edl";
import type { Edl } from "./types";

const base = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 30 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] } as const;
const edl = (segs: Edl["segments"]): Edl => ({ ...base, segments: segs } as unknown as Edl);

describe("transitions overlap two cuts", () => {
  it("a hard cut doesn't overlap; a transition overlaps up to its length, never more than half a cut", () => {
    expect(overlapFrames(undefined, 60, 60)).toBe(0);
    expect(overlapFrames("cut", 60, 60)).toBe(0);
    expect(overlapFrames("zoom", 60, 60)).toBe(TRANSITION_FRAMES);
    expect(overlapFrames("whip", 60, 10)).toBe(5);
  });
  it("places each cut where the one before ends, less the overlap, and the length agrees", () => {
    const e = edl([
      { id: "s1", clipId: "a", in: 0, out: 2, role: "opener", note: "" },
      { id: "s2", clipId: "b", in: 0, out: 2, role: "body", note: "", transition: "zoom" },
      { id: "s3", clipId: "c", in: 0, out: 2, role: "ending", note: "" },
    ]);
    const tl = timeline(e);
    expect(tl.segments.map((s) => s.startFrame)).toEqual([0, 60 - TRANSITION_FRAMES, 120 - TRANSITION_FRAMES]);
    expect(tl.segments[0].overlapOut).toBe(TRANSITION_FRAMES);
    expect(tl.segments[1].overlapIn).toBe(TRANSITION_FRAMES);
    expect(tl.durationFrames).toBe(180 - TRANSITION_FRAMES);
    expect(edlDurationSec(e)).toBeCloseTo((180 - TRANSITION_FRAMES) / 30, 2);
  });
});

describe("how a transition looks and sounds", () => {
  it("a zoom starts the incoming cut zoomed and blurred, and it lands sharp", () => {
    const start = transitionLook({ frame: 0, frames: 60, into: "zoom", overlapIn: 8, overlapOut: 0 });
    expect(start.zoomBlur).toBeGreaterThan(10);
    expect(start.zoomBlur).toBeLessThanOrEqual(24);
    expect(start.scale).toBeGreaterThan(1.05);
    expect(start.scale).toBeLessThan(1.15);
    expect(start.opacity).toBe(0);
    const done = transitionLook({ frame: 8, frames: 60, into: "zoom", overlapIn: 8, overlapOut: 0 });
    expect([done.zoomBlur, done.scale, done.opacity]).toEqual([0, 1, 1]);
  });
  it("a whip slides out sideways with a horizontal blur; the sound crossfades", () => {
    const end = transitionLook({ frame: 59, frames: 60, out: "whip", overlapIn: 0, overlapOut: 8 });
    expect(end.x).toBeLessThan(-10);
    expect(end.x).toBeGreaterThan(-25);
    expect(end.whip).toBe(true);
    expect(end.blur).toBeGreaterThan(10);
    expect(end.blur).toBeLessThanOrEqual(24);
    expect(transitionSound(0, 60, 8, 0)).toBe(0);
    expect(transitionSound(30, 60, 8, 8)).toBe(1);
  });
  it("runs a dissolve for 0.3 seconds", () => {
    expect(TRANSITION_FRAMES / 30).toBeCloseTo(0.3, 2);
  });
  it("a cut keeps the transition it was given; the first cut and unknown ones are hard cuts", () => {
    const raw = { segments: [{ clipId: "a", in: 0, out: 3, transition: "zoom" }, { clipId: "b", in: 0, out: 3, transition: "whip" }, { clipId: "c", in: 0, out: 3, transition: "spin" }], text: [] };
    const clips = ["a", "b", "c"].map((id, position) => ({ id, position, durationSec: 5, words: null, silences: [], hasSpeech: false, facts: null })) as never;
    const { edl: v } = validateEdl(raw as never, clips);
    expect(v.segments.map((s) => s.transition)).toEqual([undefined, "whip", undefined]);
  });
});
