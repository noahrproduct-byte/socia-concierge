import { describe, it, expect } from "vitest";
import { quickAudioFrom, describeQuickAudio } from "./quick";

const RATE = 16000;
const tone = (seconds: number, amp = 0.3, hz = 220) => Float32Array.from({ length: RATE * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
const silence = (seconds: number) => new Float32Array(RATE * seconds);
const concat = (...xs: Float32Array[]) => { const out = new Float32Array(xs.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };

describe("Quick Analyze measured sound", () => {
  it("finds a silent opening and the longest pause", () => {
    const a = quickAudioFrom(concat(silence(1.5), tone(3), silence(2), tone(3)), RATE);
    expect(a.hasAudio).toBe(true);
    expect(a.silentOpeningSec).toBeCloseTo(1.5, 0);
    expect(a.longestPauseSec).toBeGreaterThanOrEqual(1.5);
    expect(a.audibleRatio).toBeCloseTo(6 / 9.5, 1);
    expect(a.durationSec).toBe(9.5);
    expect(describeQuickAudio(a)).toMatch(/silent for the first 1\.5s; longest pause 2s; no clear music/);
    expect(a.musicLikely).toBe(false); // a tone with gaps is not music
  });

  it("starts at once when there is sound from the first moment", () => {
    const a = quickAudioFrom(tone(5), RATE);
    expect(a.silentOpeningSec).toBe(0);
    expect(a.longestPauseSec).toBe(0);
    expect(describeQuickAudio(a)).toMatch(/^ok level .*; sound 100% of the time; sound from the first second; no long pauses/);
  });

  it("says there is no sound rather than inventing any", () => {
    const a = quickAudioFrom(silence(4), RATE);
    expect(a.hasAudio).toBe(false);
    expect(describeQuickAudio(a)).toBe("No audible sound in the file.");
  });
});
