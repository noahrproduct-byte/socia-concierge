import { describe, expect, it } from "vitest";
import { muteSilentShots, shotHasSpeech, shotSoundNote } from "./shotSound";
import { cutSpeaks } from "../music/taste";
import type { Edl, TranscriptWord } from "./types";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
const talk = [w("How", 2.0, 2.2), w("much", 2.2, 2.5), w("is", 2.5, 2.6), w("this", 2.6, 2.9), w("rug?", 2.9, 3.4)];
const edl = (segments: Edl["segments"]): Edl => ({
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 25 }, segments,
  text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
});
const seg = (id: string, clipId: string, i: number, o: number, extra: Partial<Edl["segments"][number]> = {}): Edl["segments"][number] => ({ id, clipId, in: i, out: o, role: "body", note: "", ...extra });

describe("shotHasSpeech", () => {
  it("is true only when a word of the clip falls inside the shot", () => {
    expect(shotHasSpeech(talk, 1.8, 4)).toBe(true);
    expect(shotHasSpeech(talk, 0, 1.9)).toBe(false);
    expect(shotHasSpeech(talk, 3.3, 5)).toBe(true);
    expect(shotHasSpeech(null, 0, 5)).toBe(false);
  });
});

describe("muteSilentShots", () => {
  const words = { talk: talk, rug: null, weave: [] as TranscriptWord[] };
  it("mutes the shots with no words when someone speaks in the cut, and leaves the speaking ones as recorded", () => {
    const r = muteSilentShots(edl([seg("s1", "talk", 1.8, 4), seg("s2", "rug", 2, 3.5), seg("s3", "weave", 1, 3), seg("s4", "talk", 4.2, 6.8)]), words);
    expect(r.muted).toBe(3);
    expect(r.edl.segments.map((s) => s.volume)).toEqual([undefined, 0, 0, 0]);
  });
  it("keeps every shot's sound in a cut with no speech at all", () => {
    const cut = edl([seg("s1", "rug", 0, 2), seg("s2", "weave", 0, 2)]);
    const r = muteSilentShots(cut, words);
    expect(r.muted).toBe(0);
    expect(r.edl).toBe(cut);
  });
  it("never touches a level the person set or a shot whose sound matters", () => {
    const r = muteSilentShots(edl([seg("s1", "talk", 1.8, 4), seg("s2", "rug", 0, 2, { volume: 0.5 }), seg("s3", "weave", 0, 2, { sound: true }), seg("s4", "rug", 2, 3)]), words);
    expect(r.muted).toBe(1);
    expect(r.edl.segments.map((s) => s.volume)).toEqual([undefined, 0.5, undefined, 0]);
  });
  it("leaves every shot's sound alone when the only speech is in a shot that was muted (Noah's pizza Reel, 2026-11-26)", () => {
    // Kitchen chatter in one clip, switched off as unrelated; eight shots of food with their own sound.
    const cut = edl([seg("s1", "talk", 1.8, 4, { volume: 0 }), seg("s2", "rug", 2, 3.5), seg("s3", "weave", 1, 3)]);
    const r = muteSilentShots(cut, words);
    expect(r.muted).toBe(0);
    expect(r.edl).toBe(cut);
  });
  it("says what it did", () => {
    expect(shotSoundNote(0)).toBe("");
    expect(shotSoundNote(1)).toMatch(/the one shot/);
    expect(shotSoundNote(3)).toMatch(/3 shots/);
  });
});

describe("music under a voice (lib/music/taste.ts cutSpeaks)", () => {
  const many = Array.from({ length: 12 }, (_, i) => w(`w${i}`, 2 + i * 0.2, 2.1 + i * 0.2));
  it("sits under talking that is heard, and plays at its own level when the talking shot is muted", () => {
    expect(cutSpeaks([{ clipId: "t", in: 0, out: 6 }], { t: many })).toBe(true);
    expect(cutSpeaks([{ clipId: "t", in: 0, out: 6, volume: 0 }, { clipId: "food", in: 0, out: 3 }], { t: many, food: null })).toBe(false);
  });
});
