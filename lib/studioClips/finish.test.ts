import { describe, it, expect } from "vitest";
import { sanitizeFinish, finishSteps } from "./finish";
import { guideFromEdl, revalidateEdl, type ClipForEdl } from "./edl";
import { NEUTRAL } from "./grade";
import type { Edl, EdlFinish } from "./types";

const look = { luma: 0.3, contrast: 0.15, clipHi: 0, clipLo: 0.02, warmth: 0.01, tint: 0, saturation: 0.2 };
const grade = { params: { ...NEUTRAL, exposure: 0.4 }, before: look, after: { ...look, luma: 0.4 }, reasons: ["Brightness 30% → 40% (exposure +0.4 stops)."] };
const sound = { gainDb: 6, curve: { t0: 0, step: 0.1, db: [6, 6, 5.5] }, before: { levelDb: -24, peakDb: -9, noiseDb: null }, after: { levelDb: -18, peakDb: -3, noiseDb: null }, reasons: ["Sound measured -24 dB (quiet) → about -18 dB."] };

describe("stored corrections", () => {
  it("keeps only clips in the cut and clamps what it keeps", () => {
    const f = sanitizeFinish({ look: "enhance", grades: { a: { ...grade, params: { ...grade.params, exposure: 9 } }, gone: grade }, sound: true, sounds: { a: sound }, pausesCut: null, measuredAt: "2026-10-07T00:00:00Z" }, new Set(["a"]))!;
    expect(Object.keys(f.grades)).toEqual(["a"]);
    expect(f.grades.a.params.exposure).toBe(0.8);
    expect(f.sounds.a.curve.db).toEqual([6, 6, 5.5]);
  });

  it("drops malformed entries and returns nothing when everything is off", () => {
    expect(sanitizeFinish({ look: "off", sound: false }, new Set(["a"]))).toBeUndefined();
    const f = sanitizeFinish({ look: "match", grades: { a: { params: "x" } }, sound: true, sounds: { a: { curve: { t0: 0, step: 0.1, db: [1, "x"] }, gainDb: 1 } } }, new Set(["a"]))!;
    expect(f.grades).toEqual({});
    expect(f.sounds).toEqual({});
  });
});

describe("edit guide with corrections", () => {
  const clip = (id: string, position: number): ClipForEdl => ({ id, position, durationSec: 20, words: null, silences: null, medianLuma: 0.2, warmth: 0, brightness: "dark", contrastLevel: "ok", rmsDb: -30, audioLevel: "quiet", hasSpeech: false });
  const clips = [clip("a", 0), clip("b", 1)];
  const finish: EdlFinish = { look: "enhance", grades: { a: grade }, sound: true, sounds: { a: sound }, pausesCut: { count: 2, seconds: 1.8 }, measuredAt: "2026-10-07T00:00:00Z" };
  const edl: Edl = {
    version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 },
    segments: [{ id: "s1", clipId: "a", in: 0, out: 8, role: "opener", note: "" }, { id: "s2", clipId: "b", in: 0, out: 8, role: "body", note: "" }],
    text: [], captions: null, enhance: [{ clipId: "a", kind: "brighten", amount: "slight", why: "" }, { clipId: "b", kind: "brighten", amount: "slight", why: "" }],
    audio: [{ clipId: "a", gainDb: 4, why: "quieter" }], cta: null, music: null, caption: "", notes: [], finish,
  };

  it("shows the measured numbers instead of the generic advice for corrected clips", () => {
    const steps = guideFromEdl(edl, clips).map((s) => s.text);
    expect(steps).toContain("Clip 1 (auto enhanced): Brightness 30% → 40% (exposure +0.4 stops). Settings: exposure +0.4 stops.");
    expect(steps.some((t) => t.startsWith("Brighten Clip 1"))).toBe(false);
    expect(steps.some((t) => t.startsWith("Brighten Clip 2"))).toBe(true);
    expect(steps.some((t) => t.startsWith("Raise Clip 1"))).toBe(false);
    expect(steps).toContain("2 long pauses cut out (1.8s).");
  });

  it("survives the server's re-validation", () => {
    const { edl: out } = revalidateEdl(edl, clips);
    expect(out.finish?.grades.a.params.exposure).toBe(0.4);
    expect(finishSteps(out.finish, (id) => id).steps).toHaveLength(3);
  });
});
