import { describe, expect, it } from "vitest";
import { alignSection, cutsOnBeatShare, dropsOf, envelopeFromRms, rankForReference, readReferenceMusic, referenceMusicLines, speechSpans, tempoFit, ENV_HOP_SEC } from "./referenceMusic";

/** A deterministic made-up song as 10 ms RMS levels: a beat, sections of different loudness, a melody wobble. */
function song(seed: number, sec: number, bpm = 120): Float32Array {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const n = Math.round(sec * 100);
  const out = new Float32Array(n);
  const sections: number[] = [];
  for (let s = 0; s < sec; s += 4 + rnd() * 6) sections.push(s);
  const levels = sections.map(() => 0.03 + rnd() * 0.25);
  const period = 60 / bpm;
  // Every recording's own accents: how hard each beat (and the off-beat) hits.
  const accents = Array.from({ length: Math.ceil(sec / period) + 1 }, () => [0.4 + rnd() * 1.2, rnd() * 0.8]);
  for (let i = 0; i < n; i++) {
    const t = i / 100;
    let sec = 0;
    while (sec + 1 < sections.length && sections[sec + 1] <= t) sec++;
    const b = Math.floor(t / period), phase = (t % period) / period;
    const hit = accents[b][0] * Math.exp(-phase * 12) + accents[b][1] * Math.exp(-Math.abs(phase - 0.5) * 24);
    out[i] = levels[sec] * (0.4 + 0.6 * hit) * (0.9 + 0.2 * rnd());
  }
  return out;
}

const slice = (a: Float32Array, fromSec: number, toSec: number) => a.slice(Math.round(fromSec * 100), Math.round(toSec * 100));

/** Played `speed` times faster: the reference's second t is the song's second t * speed. */
function sped(a: Float32Array, fromSec: number, lenSec: number, speed: number): Float32Array {
  const n = Math.round(lenSec * 100);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[Math.min(a.length - 1, Math.round(fromSec * 100 + i * speed))];
  return out;
}

const refOf = (rms: Float32Array, extra: Partial<Parameters<typeof readReferenceMusic>[0]> = {}) =>
  readReferenceMusic({ rms, durationSec: rms.length / 100, musicScore: 0.8, musicLikelyAt: 0.5, beat: { bpm: 120, offsetSec: 0 }, ...extra });

describe("reference music", () => {
  const track = song(7, 150);
  const trackEnv = envelopeFromRms(track);

  it("finds the exact stretch of the same recording the reference used", () => {
    const ref = refOf(slice(track, 42, 57));
    const a = alignSection(ref, trackEnv);
    expect(a.level).toBe("matched");
    expect(Math.abs(a.startSec - 42)).toBeLessThanOrEqual(0.1);
    expect(a.speed).toBe(1);
  });

  it("still finds it when talking sits on top of the music", () => {
    const rms = slice(track, 80, 95);
    for (let i = 300; i < 900; i++) rms[i] += 0.15 * Math.abs(Math.sin(i / 7));
    const ref = refOf(rms, { words: [{ startMs: 3000, endMs: 9000 }] });
    const a = alignSection(ref, trackEnv);
    expect(a.level).not.toBe("none");
    expect(Math.abs(a.startSec - 80)).toBeLessThanOrEqual(0.2);
  });

  it("finds a sped-up version and says how much faster it plays", () => {
    const ref = refOf(sped(track, 30, 15, 1.03));
    const a = alignSection(ref, trackEnv);
    expect(a.level).toBe("matched");
    expect(a.speed).toBe(1.03);
    expect(Math.abs(a.startSec - 30)).toBeLessThanOrEqual(0.2);
  });

  it("never calls a different song a match", () => {
    const ref = refOf(slice(song(99, 60, 120), 10, 25));
    expect(alignSection(ref, trackEnv).level).not.toBe("matched");
  });

  it("doesn't align when the reference has no music", () => {
    const ref = refOf(slice(track, 10, 25), { musicScore: 0.2 });
    expect(ref.musicLikely).toBe(false);
    expect(alignSection(ref, trackEnv).level).toBe("none");
    expect(referenceMusicLines(ref)[0]).toMatch(/no clear music/);
  });

  it("ranks the same recording first, then the closer tempo", () => {
    const ref = refOf(slice(track, 42, 57));
    const ranked = rankForReference(ref, [
      { id: "other", env: envelopeFromRms(song(3, 90, 140)), bpm: 140 },
      { id: "same", env: trackEnv, bpm: 120 },
      { id: "near", env: envelopeFromRms(song(5, 90, 121)), bpm: 121 },
    ]);
    expect(ranked[0].id).toBe("same");
    expect(ranked[0].alignment.level).toBe("matched");
    expect(ranked.findIndex((r) => r.id === "near")).toBeLessThan(ranked.findIndex((r) => r.id === "other"));
  });

  it("counts half and double time as the same feel", () => {
    expect(tempoFit(120, 60)).toBe(1);
    expect(tempoFit(120, 240)).toBe(1);
    expect(tempoFit(120, 122)).toBeGreaterThan(0.7);
    expect(tempoFit(120, 140)).toBe(0);
    expect(tempoFit(null, 120)).toBe(0);
  });

  it("finds a drop, and not where someone starts talking", () => {
    const env = [...Array(60).fill(-40), ...Array(60).fill(-20), ...Array(60).fill(-20)];
    expect(dropsOf(env)).toEqual([3]);
    expect(dropsOf(env, [[3.1, 6]])).toEqual([]);
  });

  it("measures whether the cuts land on the beat", () => {
    const beat = { bpm: 120, offsetSec: 0 };
    expect(cutsOnBeatShare([0.5, 1, 2.02, 3.5], beat)).toBe(1);
    expect(cutsOnBeatShare([0.25, 1.25, 2.27, 3.5], beat)).toBe(0.25);
    expect(cutsOnBeatShare([1], beat)).toBeNull();
    expect(cutsOnBeatShare([1, 2], null)).toBeNull();
  });

  it("merges spoken words into spans", () => {
    expect(speechSpans([{ startMs: 0, endMs: 400 }, { startMs: 600, endMs: 900 }, { startMs: 2000, endMs: 2500 }])).toEqual([[0, 0.9], [2, 2.5]]);
  });

  it("describes what was measured and never names a song", () => {
    const ref = refOf(slice(track, 42, 57), { cuts: [0.5, 1, 1.5, 2, 3] });
    const lines = referenceMusicLines(ref);
    expect(lines[0]).toBe("Music with a steady beat, about 120 BPM.");
    expect(lines.join(" ")).toMatch(/cuts land on the beat/);
    expect(lines.join(" ")).not.toMatch(/song by|artist|—/i);
    expect(ref.env.length).toBe(Math.round(15 / ENV_HOP_SEC));
  });

  it("says when there is no sound at all", () => {
    const ref = refOf(new Float32Array(1500));
    expect(ref.hasSound).toBe(false);
    expect(referenceMusicLines(ref)).toEqual(["The reference has no sound."]);
  });
});
