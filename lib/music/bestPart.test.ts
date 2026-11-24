import { describe, expect, it } from "vitest";
import { LEVEL_HOP_SEC, bestParts, clampStart, latestStart } from "./bestPart";

/** Levels at LEVEL_HOP_SEC from pieces of [seconds, level(t)]. */
function song(pieces: [number, (t: number) => number][]): Float32Array {
  const out: number[] = [];
  let at = 0;
  for (const [sec, f] of pieces) {
    for (let i = 0; i < Math.round(sec / LEVEL_HOP_SEC); i++) out.push(f(at + i * LEVEL_HOP_SEC));
    at += sec;
  }
  return Float32Array.from(out);
}
// A beat: loud on every half second, softer between.
const pulse = (lo: number, hi: number) => (t: number) => ((t % 0.5) < 0.1 ? hi : lo);

describe("bestParts", () => {
  const track = song([[40, () => 0.05], [30, pulse(0.3, 0.8)], [50, () => 0.2]]);

  it("finds the loud, busy chorus and says why", () => {
    const r = bestParts(track, 20);
    expect(r.choice).toBe(true);
    const best = r.picks[0];
    expect(best.startSec).toBeGreaterThanOrEqual(38);
    expect(best.startSec).toBeLessThanOrEqual(50);
    expect(best.reason).toMatch(/^The 20 seconds from 0:[34]\d: /);
    expect(best.reason).toMatch(/loudest|going on|lifts/);
  });

  it("gives other picks at least half a video apart, none running off the end", () => {
    const r = bestParts(track, 20);
    expect(r.picks.length).toBeGreaterThan(1);
    for (let i = 0; i < r.picks.length; i++) {
      expect(r.picks[i].startSec + 20).toBeLessThanOrEqual(120 + 1e-6);
      for (let j = 0; j < i; j++) expect(Math.abs(r.picks[i].startSec - r.picks[j].startSec)).toBeGreaterThanOrEqual(10);
    }
  });

  it("starts on the beat grid when the sound has a beat", () => {
    const r = bestParts(track, 20, { bpm: 120, offsetSec: 0.2 });
    for (const p of r.picks) expect(Math.abs(((p.startSec - 0.2) / 0.5) - Math.round((p.startSec - 0.2) / 0.5))).toBeLessThan(0.21);
  });

  it("has no choice to make when the sound is about as long as the video", () => {
    expect(bestParts(song([[20.5, () => 0.3]]), 20)).toEqual({ choice: false, picks: [{ startSec: 0, reason: "" }] });
    expect(bestParts(song([[10, () => 0.3]]), 20).choice).toBe(false);
  });
});

describe("start limits", () => {
  it("keeps the stretch inside the sound", () => {
    expect(latestStart(120, 20)).toBe(100);
    expect(clampStart(115, 120, 20)).toBe(100);
    expect(clampStart(-3, 120, 20)).toBe(0);
    expect(clampStart(Number.NaN, 120, 20)).toBe(0);
    expect(clampStart(12.34, 120, 20)).toBe(12.3);
    expect(clampStart(5, 10, 20)).toBe(0);
  });
});

describe("a saved start", () => {
  const resolve = () => ({ name: "Song", path: "u/library/music/t.m4a" });
  it("is kept on the soundtrack, tidied, and left out when it is the start or nonsense", async () => {
    const { sanitizeSoundtrack } = await import("./taste");
    expect(sanitizeSoundtrack({ trackId: "t", startSec: 42.345 }, null, resolve)?.startSec).toBe(42.3);
    expect(sanitizeSoundtrack({ trackId: "t", startSec: 999 }, null, resolve)?.startSec).toBe(180);
    for (const v of [0, -4, "12", Number.NaN, undefined]) expect(sanitizeSoundtrack({ trackId: "t", startSec: v }, null, resolve)).not.toHaveProperty("startSec");
  });
});
