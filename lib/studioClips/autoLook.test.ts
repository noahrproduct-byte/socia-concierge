import { describe, expect, it } from "vitest";
import { lookFromMeasures, wantsAutoLook } from "./autoLook";
import { revalidateEdl, type ClipForEdl } from "./edl";
import type { Edl } from "./types";

const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 },
  segments: [{ id: "s1", clipId: "a", in: 0, out: 8, role: "opener", note: "" }, { id: "s2", clipId: "b", in: 0, out: 8, role: "body", note: "" }],
  text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
};

/** A clip's sampled pixels: dark and cold, the kind of footage that needs correcting. */
const darkCold = () => {
  const px = new Uint8Array(3000 * 3);
  for (let i = 0; i < 3000; i++) { const v = 20 + (i % 40); px[i * 3] = v; px[i * 3 + 1] = v + 6; px[i * 3 + 2] = v + 30; }
  return px;
};
const now = new Date("2026-11-03T12:00:00Z");

describe("automatic colour", () => {
  it("runs once per cut: not after it was tried, nor over a look the person chose", () => {
    expect(wantsAutoLook(edl)).toBe(true);
    expect(wantsAutoLook({ ...edl, lookAuto: "2026-11-01T00:00:00Z" })).toBe(false);
    expect(wantsAutoLook({ ...edl, finish: { look: "off", grades: {}, sound: true, sounds: {}, pausesCut: null, measuredAt: "" } })).toBe(false);
    expect(wantsAutoLook({ ...edl, segments: [] })).toBe(false);
    expect(wantsAutoLook(null)).toBe(false);
  });

  it("applies Auto enhance to clips that need it and stamps the cut", () => {
    const out = lookFromMeasures(edl, { a: { pixels: darkCold() }, b: { pixels: null } }, now);
    expect(out.corrected).toBe(1);
    expect(out.edl.finish?.look).toBe("enhance");
    expect(Object.keys(out.edl.finish!.grades)).toEqual(["a"]);
    expect(out.edl.finish!.grades.a.params.exposure).toBeGreaterThan(0);
    expect(out.edl.lookAuto).toBe(now.toISOString());
  });

  it("leaves a cut it couldn't measure unchanged, but stamped so it isn't retried", () => {
    const out = lookFromMeasures(edl, {}, now);
    expect(out.corrected).toBe(0);
    expect(out.edl.finish).toBeUndefined();
    expect(out.edl.lookAuto).toBe(now.toISOString());
  });

  it("keeps the stamp through a save", () => {
    const clip = (id: string, position: number): ClipForEdl => ({ id, position, durationSec: 20, words: null, silences: null, medianLuma: 0.2, warmth: 0, brightness: "dark", contrastLevel: "ok", rmsDb: -30, audioLevel: "quiet", hasSpeech: false });
    const { edl: saved } = revalidateEdl({ ...edl, lookAuto: now.toISOString() }, [clip("a", 0), clip("b", 1)]);
    expect(saved.lookAuto).toBe(now.toISOString());
    expect(revalidateEdl({ ...edl, lookAuto: "not a date" }, [clip("a", 0), clip("b", 1)]).edl.lookAuto).toBeUndefined();
  });
});
