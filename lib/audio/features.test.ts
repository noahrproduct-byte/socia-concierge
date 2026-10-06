import { describe, it, expect } from "vitest";
import { analyzeAudio, estimateTempo, frameLevels, spectralFlatness } from "./features";

const RATE = 16000;

/** A click track: a decaying 200 Hz burst every beat, with a quiet tonal bed. */
function clickTrack(bpm: number, seconds: number): Float32Array {
  const n = RATE * seconds;
  const out = new Float32Array(n);
  const period = (60 / bpm) * RATE;
  for (let i = 0; i < n; i++) {
    const sinceBeat = i % period;
    const burst = Math.exp(-sinceBeat / (RATE * 0.04)) * Math.sin((2 * Math.PI * 200 * i) / RATE);
    const bed = 0.08 * (Math.sin((2 * Math.PI * 330 * i) / RATE) + 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));
    out[i] = 0.7 * burst + bed;
  }
  return out;
}

function noise(seconds: number, seed = 7): Float32Array {
  const n = RATE * seconds;
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; out[i] = ((s / 4294967296) * 2 - 1) * 0.5; }
  return out;
}

describe("measured audio features", () => {
  it("finds the tempo of a steady beat", () => {
    const t = estimateTempo(frameLevels(clickTrack(120, 12), RATE).rms);
    expect(t.bpm).not.toBeNull();
    expect(Math.abs((t.bpm ?? 0) - 120)).toBeLessThanOrEqual(3);
    expect(t.confidence).toBeGreaterThan(0.3);
    const slow = estimateTempo(frameLevels(clickTrack(92, 12), RATE).rms);
    expect(Math.abs((slow.bpm ?? 0) - 92)).toBeLessThanOrEqual(3);
  });

  it("reports no beat for noise and no sound for silence", () => {
    expect(estimateTempo(frameLevels(noise(10), RATE).rms).bpm).toBeNull();
    const silent = analyzeAudio(new Float32Array(RATE * 5), RATE);
    expect(silent.audibleRatio).toBe(0);
    expect(silent.energyDb).toBeNull();
    expect(silent.bpm).toBeNull();
    expect(silent.musicLikely).toBe(false);
  });

  it("tells tonal sound from broadband noise", () => {
    const tone = new Float32Array(RATE * 3);
    for (let i = 0; i < tone.length; i++) tone[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / RATE) + 0.2 * Math.sin((2 * Math.PI * 660 * i) / RATE);
    const fTone = spectralFlatness(tone, RATE)!;
    const fNoise = spectralFlatness(noise(3), RATE)!;
    expect(fTone).toBeLessThan(0.1);
    expect(fNoise).toBeGreaterThan(0.4);
  });

  it("does not call speech music just because voices are tonal", () => {
    // Syllable-like tonal bursts at varying pitch with irregular gaps.
    const out: number[] = [];
    let seed = 3;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    while (out.length < RATE * 10) {
      const syl = Math.round(RATE * (0.12 + rnd() * 0.13));
      const hz = 140 + rnd() * 120;
      for (let i = 0; i < syl; i++) out.push(0.35 * Math.sin((2 * Math.PI * hz * i) / RATE) * Math.sin((Math.PI * i) / syl));
      const gap = Math.round(RATE * (0.08 + rnd() * 0.25));
      for (let i = 0; i < gap; i++) out.push(0);
    }
    const speech = analyzeAudio(Float32Array.from(out.slice(0, RATE * 10)), RATE);
    expect(speech.audibleRatio).toBeLessThan(0.8);
    expect(speech.musicLikely).toBe(false);
  });

  it("calls a tonal, steady track music and noise not", () => {
    const music = analyzeAudio(clickTrack(118, 12), RATE);
    expect(music.musicLikely).toBe(true);
    expect(music.bpm).not.toBeNull();
    expect(music.audibleRatio).toBeGreaterThan(0.9);
    const hiss = analyzeAudio(noise(8), RATE);
    expect(hiss.musicLikely).toBe(false);
    expect(hiss.durationSec).toBe(8);
  });
});
