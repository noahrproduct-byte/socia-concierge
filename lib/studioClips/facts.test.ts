import { describe, it, expect } from "vitest";
import { frameStats, histogramDistance, sceneCuts, chooseKeyframes, parseWav, pcmWindows, silences, audioSummary, visualSummary } from "./facts";

const solid = (r: number, g: number, b: number, px = 64): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  return d;
};

describe("picture facts", () => {
  it("measures brightness, contrast and warmth from pixels", () => {
    const dark = frameStats(solid(20, 20, 20), 0);
    const bright = frameStats(solid(240, 240, 240), 1);
    const warm = frameStats(solid(200, 120, 40), 2);
    expect(dark.luma).toBeLessThan(0.1);
    expect(bright.luma).toBeGreaterThan(0.9);
    expect(dark.contrast).toBeCloseTo(0, 6); // a flat colour has no contrast
    expect(warm.warmth).toBeGreaterThan(0.5);
    expect(frameStats(solid(255, 255, 255), 0).clipHi).toBe(1);
  });

  it("finds scene cuts where the histogram jumps", () => {
    const a = frameStats(solid(30, 30, 30), 0), a2 = frameStats(solid(32, 30, 31), 0.5);
    const b = frameStats(solid(220, 220, 220), 1.0), b2 = frameStats(solid(221, 219, 220), 1.5);
    expect(histogramDistance(a.hist, a2.hist)).toBeLessThan(0.1);
    expect(histogramDistance(a.hist, b.hist)).toBeGreaterThan(0.9);
    expect(sceneCuts([a, a2, b, b2])).toEqual([1.0]);
  });

  it("chooses an opening frame plus one per scene, within bounds", () => {
    const k = chooseKeyframes(20, [5, 12]);
    expect(k[0]).toBeCloseTo(0.4, 1);
    expect(k).toContain(2.5);  // middle of 0–5
    expect(k).toContain(8.5);  // middle of 5–12
    expect(k).toContain(16);   // middle of 12–20
    expect(chooseKeyframes(3, []).length).toBeGreaterThanOrEqual(3);
    expect(chooseKeyframes(120, Array.from({ length: 40 }, (_, i) => (i + 1) * 2.8)).length).toBeLessThanOrEqual(8);
  });

  it("summarises the picture honestly", () => {
    const v = visualSummary([frameStats(solid(20, 20, 20), 0), frameStats(solid(25, 25, 25), 1)], [1]);
    expect(v.brightness).toBe("dark");
    expect(v.sceneCuts).toEqual([1]);
  });
});

function wav(samples: Int16Array, sampleRate = 16000): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  new Int16Array(buf, 44).set(samples);
  return buf;
}

describe("sound facts", () => {
  it("parses a PCM WAV and measures level, silence and audible share", () => {
    const rate = 16000;
    const s = new Int16Array(rate * 3); // 3 s: 1 s tone, 1.3 s silence, 0.7 s tone
    for (let i = 0; i < rate; i++) s[i] = Math.round(Math.sin(i / 10) * 8000);
    for (let i = Math.round(rate * 2.3); i < rate * 3; i++) s[i] = Math.round(Math.sin(i / 10) * 8000);
    const parsed = parseWav(wav(s, rate));
    expect(parsed?.sampleRate).toBe(rate);
    const windows = pcmWindows(parsed!.samples, rate);
    expect(windows.length).toBe(30);
    const quiet = silences(windows);
    expect(quiet).toHaveLength(1);
    expect(quiet[0].start).toBeCloseTo(1.0, 1);
    expect(quiet[0].end).toBeCloseTo(2.3, 1);
    const a = audioSummary(windows);
    expect(a.hasAudio).toBe(true);
    expect(a.audibleRatio).toBeCloseTo(17 / 30, 1);
    expect(a.level).toBe("ok");
  });

  it("calls near-empty audio silent and rejects non-WAV bytes", () => {
    const s = new Int16Array(16000);
    const a = audioSummary(pcmWindows(parseWav(wav(s))!.samples, 16000));
    expect(a.level).toBe("silent");
    expect(parseWav(new ArrayBuffer(10))).toBeNull();
  });
});
