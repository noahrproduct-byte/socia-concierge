import { describe, expect, it } from "vitest";
import { VOICE_READ_RATE as RATE, pitchGap, pitchWord, readHeard, readVoice, voiceKind } from "./voiceRead";

/** Speech-like sound: syllables of about 180 ms whose pitch glides down a few semitones, with a short gap after each. */
function talk(baseHz: number, seconds = 8): Float32Array {
  const x = new Float32Array(RATE * seconds);
  const syllable = Math.round(RATE * 0.18), gap = Math.round(RATE * 0.07);
  let phase = 0;
  for (let start = 0, n = 0; start + syllable < x.length; start += syllable + gap, n++) {
    const from = baseHz * (1 + 0.12 * ((n * 7) % 5) / 4), to = from * 0.8;
    for (let i = 0; i < syllable; i++) {
      const k = i / syllable, hz = from + (to - from) * k;
      phase += (2 * Math.PI * hz) / RATE;
      const env = Math.sin(Math.PI * k);
      x[start + i] = 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
  }
  return x;
}
/** Music-like sound: notes held for half a second each, with no glide. */
function notes(seconds = 8): Float32Array {
  const scale = [220, 247, 262, 294, 330, 294, 262, 247];
  return Float32Array.from({ length: RATE * seconds }, (_, i) => {
    const hz = scale[Math.floor(i / (RATE * 0.5)) % scale.length];
    return 0.3 * (Math.sin((2 * Math.PI * hz * i) / RATE) + 0.4 * Math.sin((4 * Math.PI * hz * i) / RATE));
  });
}
/** Noise from a fixed seed. */
function noise(seconds = 6): Float32Array {
  let s = 7;
  return Float32Array.from({ length: RATE * seconds }, () => { s = (s * 16807) % 2147483647; return (s / 2147483647 - 0.5) * 0.4; });
}

describe("reading the kind of voice in a clip", () => {
  it("hears a speaking voice and its pitch", () => {
    const low = readVoice(talk(115)), high = readVoice(talk(205));
    expect(low.speech).toBe(true);
    expect(high.speech).toBe(true);
    expect(low.pitchHz!).toBeGreaterThan(95);
    expect(low.pitchHz!).toBeLessThan(135);
    expect(high.pitchHz!).toBeGreaterThan(170);
    expect(high.pitchHz!).toBeLessThan(240);
    expect(low.seconds).toBe(8);
  });
  it("doesn't take held notes, noise or silence for speech", () => {
    for (const x of [notes(), noise(), new Float32Array(RATE * 5), new Float32Array(100)]) {
      const r = readVoice(x);
      expect(r.speech).toBe(false);
      expect(r.pitchHz).toBeNull();
    }
  });
  it("still hears the voice over music", () => {
    const voice = talk(120), bed = notes();
    const mix = Float32Array.from(voice, (v, i) => v + 0.15 * bed[i]);
    expect(readVoice(mix).speech).toBe(true);
  });
  it("sums up a set of videos", () => {
    expect(voiceKind([readVoice(talk(115)), readVoice(talk(125)), readVoice(notes()), null])).toMatchObject({ reels: 3, spoken: 2 });
    expect(voiceKind([]).pitchHz).toBeNull();
    expect(voiceKind([readVoice(notes())])).toEqual({ reels: 1, spoken: 0, pitchHz: null });
  });
  it("puts a pitch in everyday words and reads a saved result back", () => {
    expect(pitchWord(110)).toBe("a lower voice");
    expect(pitchWord(160)).toBe("a mid-range voice");
    expect(pitchWord(210)).toBe("a higher voice");
    expect(pitchGap(220, 110)).toBeCloseTo(12, 5);
    const saved = { own: { reels: 2, spoken: 0, pitchHz: null }, competitors: { reels: 6, spoken: 4, pitchHz: 118 }, stock: [{ id: "a", pitchHz: 208 }, { id: "bad", pitchHz: 0 }, null] };
    expect(readHeard(JSON.parse(JSON.stringify(saved)))?.stock).toEqual([{ id: "a", pitchHz: 208 }]);
    expect(readHeard({ own: {}, competitors: {} })).toBeNull();
    expect(readHeard(undefined)).toBeNull();
  });
});
