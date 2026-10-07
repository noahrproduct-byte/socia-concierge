import { describe, it, expect } from "vitest";
import { SOUND, cutPauses, findPauses, gainAtDb, planSound, soundStats, type SoundWindow } from "./sound";
import type { Edl } from "./types";

/** 100 ms windows: speech at `rms` with peaks `crest` dB above, optional quiet gaps. */
function speech(sec: number, rms: number, { crest = 12, gaps = [] as [number, number][], bursts = [] as [number, number, number][], t0 = 0, floor = -60 } = {}): SoundWindow[] {
  const out: SoundWindow[] = [];
  for (let i = 0; i < Math.round(sec * 10); i++) {
    const t = Number((t0 + i / 10).toFixed(2));
    const gap = gaps.some(([a, b]) => t >= a && t < b);
    const burst = bursts.find(([a, b]) => t >= a && t < b);
    const r = gap ? floor : burst ? burst[2] : rms + (i % 3) - 1;
    out.push({ t, rmsDb: r, peakDb: gap ? floor + 6 : r + crest });
  }
  return out;
}

describe("audio cleanup plan", () => {
  it("brings quiet speech up to the target without letting peaks clip", () => {
    const ws = speech(10, -32);
    const p = planSound(ws)!;
    expect(p.gainDb).toBeGreaterThan(8);
    expect(p.after.levelDb!).toBeGreaterThan(-22);
    expect(p.after.peakDb!).toBeLessThanOrEqual(SOUND.ceilingDb + 0.05);
    expect(p.reasons[0]).toMatch(/^Sound measured -32 dB \(quiet\) → about -\d+ dB\.$/);
  });

  it("evens out loud bursts", () => {
    const ws = speech(10, -18, { bursts: [[4, 5, -5]] });
    const p = planSound(ws)!;
    const at = (t: number) => p.curve.db[Math.round(t * 10)];
    expect(at(4.5)).toBeLessThan(-5);
    expect(at(8)).toBeGreaterThan(at(4.5) + 4);
    expect(p.reasons.join(" ")).toMatch(/Moments much louder than the rest evened out \(peaks reached -?\d+ dB\)/);
  });

  it("won't push background hiss up with the voice", () => {
    const ws = speech(10, -34, { gaps: [[2, 4], [6, 8]], floor: -46 });
    const p = planSound(ws)!;
    expect(p.after.noiseDb!).toBeLessThanOrEqual(SOUND.noiseCeilingDb + 0.05);
    expect(p.reasons.join(" ")).toMatch(/so the background/);
  });

  it("leaves well-recorded sound alone", () => {
    expect(planSound(speech(8, -18, { crest: 10 }))).toBeNull();
  });

  it("never boosts outside what it measured", () => {
    const p = planSound(speech(5, -32, { t0: 2 }))!;
    expect(gainAtDb(p, 4)).toBeGreaterThan(5);
    expect(gainAtDb(p, 20)).toBe(0);
    expect(gainAtDb({ ...p, gainDb: -3 }, 20)).toBe(-3);
  });

  it("reports levels from the windows", () => {
    expect(soundStats([])).toEqual({ levelDb: null, peakDb: null, noiseDb: null });
  });
});

describe("cutting long pauses", () => {
  const edl = (segments: Edl["segments"], text: Edl["text"] = []): Edl => ({
    version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 }, segments, text,
    captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  });

  it("splits a cut around a pause and moves the text after it", () => {
    const e = edl([{ id: "s1", clipId: "a", in: 0, out: 10, role: "opener", note: "x" }], [{ id: "t1", at: 8, end: 9.5, text: "hi", role: "mid" }]);
    const r = cutPauses(e, { a: [{ start: 4, end: 6 }] });
    expect(r.edl.segments.map((s) => [s.in, s.out, s.role])).toEqual([[0, 4.15, "opener"], [5.85, 10, "body"]]);
    expect(r.count).toBe(1);
    expect(r.seconds).toBe(1.7);
    expect(r.edl.text[0]).toMatchObject({ at: 6.3, end: 7.8 });
  });

  it("trims a pause at either edge and keeps a short breath", () => {
    const e = edl([{ id: "s1", clipId: "a", in: 0, out: 6, role: "body", note: "" }, { id: "s2", clipId: "b", in: 1, out: 5, role: "ending", note: "" }]);
    const r = cutPauses(e, { a: [{ start: 0, end: 1.2 }], b: [{ start: 3.8, end: 5 }] });
    expect(r.edl.segments.map((s) => [s.in, s.out])).toEqual([[1.05, 6], [1, 3.95]]);
    expect(r.edl.segments[1].role).toBe("ending");
  });

  it("never leaves a sliver: a pause too close to an edge piece stays", () => {
    const e = edl([{ id: "s1", clipId: "a", in: 0, out: 3, role: "body", note: "" }]);
    expect(cutPauses(e, { a: [{ start: 0.5, end: 1.5 }] }).count).toBe(0);
  });

  it("finds pauses from measured windows", () => {
    expect(findPauses(speech(6, -20, { gaps: [[2, 3.2]] }))).toEqual([{ start: 2, end: 3.2 }]);
  });
});
