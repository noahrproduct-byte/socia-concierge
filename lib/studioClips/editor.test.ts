import { describe, it, expect } from "vitest";
import { videoBox } from "./timeline";
import { cleanFrame, revalidateEdl, validateEdl, type ClipForEdl } from "./edl";
import { aspectOf } from "./types";
import { buildFeature, MANUAL_IDX } from "./server";

describe("reframe: where a clip sits in the output", () => {
  it("matches centred cover with no reframe (landscape footage in a vertical frame)", () => {
    // 16:9 into 9:16: the element is 16/9 ÷ 9/16 = 3.16 times as wide, centred.
    const b = videoBox(1920, 1080, 1080, 1920)!;
    expect(b.height).toBe("100%");
    expect(parseFloat(b.width)).toBeCloseTo(316.05, 1);
    expect(parseFloat(b.left)).toBeCloseTo(-(316.05 - 100) / 2, 1);
    expect(b.top).toBe("0%");
  });

  it("moves the frame to the left or right edge of the footage, never past it", () => {
    expect(videoBox(1920, 1080, 1080, 1920, { zoom: 1, x: 0, y: 0.5 })!.left).toBe("0%");
    const right = videoBox(1920, 1080, 1080, 1920, { zoom: 1, x: 1, y: 0.5 })!;
    expect(parseFloat(right.left) + parseFloat(right.width)).toBeCloseTo(100, 1);
  });

  it("zooms by scaling both ways, and stays in frame at any focus", () => {
    const b = videoBox(1080, 1920, 1080, 1920, { zoom: 2, x: 1, y: 1 })!;
    expect(b).toMatchObject({ width: "200%", height: "200%", left: "-100%", top: "-100%" });
  });

  it("returns null when the footage size isn't known, so the clip stays centred", () => {
    expect(videoBox(null, null, 1080, 1920)).toBeNull();
  });

  it("bounds a reframe and drops the default", () => {
    expect(cleanFrame({ zoom: 9, x: -1, y: 2 })).toEqual({ zoom: 3, x: 0, y: 1 });
    expect(cleanFrame({ zoom: 1, x: 0.5, y: 0.5 })).toBeNull();
    expect(cleanFrame(null)).toBeNull();
  });
});

describe("the edit keeps its size and reframes", () => {
  const clips = [{ id: "c1", position: 0, durationSec: 10, words: null, pauses: [] } as unknown as ClipForEdl];
  it("accepts the editor's sizes only", () => {
    expect(validateEdl({ width: 1080, height: 1080, segments: [{ clipId: "c1", in: 0, out: 5 }] }, clips).edl).toMatchObject({ width: 1080, height: 1080 });
    expect(validateEdl({ width: 640, height: 480, segments: [{ clipId: "c1", in: 0, out: 5 }] }, clips).edl).toMatchObject({ width: 1080, height: 1920 });
    expect(aspectOf(1920, 1080).id).toBe("16:9");
  });

  it("carries size and reframe through a save, and never trims the person's own length", () => {
    const first = validateEdl({ targetSec: { min: 1, max: 11 }, width: 1920, height: 1080, segments: [{ clipId: "c1", in: 0, out: 9, frame: { zoom: 1.5, x: 0.2, y: 0.5 } }] }, clips).edl;
    const again = revalidateEdl(first, clips).edl;
    expect(again).toMatchObject({ width: 1920, height: 1080 });
    expect(again.segments[0].frame).toEqual({ zoom: 1.5, x: 0.2, y: 0.5 });
    expect(again.segments[0].out - again.segments[0].in).toBeGreaterThan(8.5);
  });
});

describe("plans", () => {
  it("the person's own edit is on every plan; SOCIA's first cut is Growth and Pro", () => {
    expect(buildFeature(true)).toBe("build_from_clips");
    expect(buildFeature(false)).toBe("auto_build");
    expect(MANUAL_IDX).toBe(-1);
  });
});
