import { describe, expect, it } from "vitest";
import { alignToBeats, cutPoint, nearestBeat } from "./beats";
import type { ClipForEdl } from "./edl";
import type { Edl, EdlSegment } from "./types";
import { timeline } from "./timeline";

const clip = (id: string, position: number, over: Partial<ClipForEdl> = {}): ClipForEdl => ({ id, position, durationSec: 20, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false, ...over });
const seg = (id: string, clipId: string, a: number, b: number, extra: Partial<EdlSegment> = {}): EdlSegment => ({ id, clipId, in: a, out: b, role: "body", note: "", ...extra });
const edl = (segments: EdlSegment[]): Edl => ({ version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 8, max: 30 }, segments, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] });
const clips = [clip("a", 0), clip("b", 1), clip("c", 2)];

describe("the beat grid", () => {
  it("finds the nearest beat from the offset and tempo", () => {
    expect(nearestBeat(2.1, { bpm: 120, offsetSec: 0 })).toBe(2);
    expect(nearestBeat(2.3, { bpm: 120, offsetSec: 0.1 })).toBe(2.1);
  });
  it("places the cut point in the middle of a transition's overlap", () => {
    const e = edl([seg("s1", "a", 0, 2), seg("s2", "b", 0, 2, { transition: "zoom" })]);
    expect(cutPoint(e, 1)).toBeCloseTo(2 - 9 / 30 + 4.5 / 30, 2);
  });
});

describe("cuts on the beat", () => {
  it("moves each boundary onto the nearest beat by trimming the cut before it", () => {
    // Beats every 0.5 s. The boundaries at 2.17 s and 4.17 s (frame-rounded) move to 2 s and 4 s.
    const r = alignToBeats(edl([seg("s1", "a", 0, 2.15), seg("s2", "b", 0, 2.15), seg("s3", "c", 0, 2)]), clips, { bpm: 120, offsetSec: 0 });
    expect(r.moved).toBe(2);
    const tl = timeline(r.edl);
    expect(tl.segments[1].startSec).toBeCloseTo(2, 2);
    expect(tl.segments[2].startSec).toBeCloseTo(4, 2);
  });

  it("leaves a boundary further than the tolerance, and never makes a cut too short or longer than its clip", () => {
    const short = clip("d", 3, { durationSec: 1.85 });
    const e = edl([seg("s1", "d", 0, 1.85), seg("s2", "b", 10, 10.6), seg("s3", "c", 0, 2)]);
    // 1.85 s wants 2 s but clip d is only 1.85 s long; 2.45 s wants 2.5 s but that leaves the second cut under 0.8 s.
    const r = alignToBeats(e, [...clips, short], { bpm: 120, offsetSec: 0 });
    expect(r.edl.segments.map((s) => s.out)).toEqual([1.85, 10.6, 2]);
    expect(r.moved).toBe(0);
    // A boundary further than half a beat is not pulled.
    expect(alignToBeats(edl([seg("s1", "a", 0, 2.45), seg("s2", "b", 0, 2)]), clips, { bpm: 60, offsetSec: 0 }).moved).toBe(0);
  });

  it("keeps cuts off the middle of a word", () => {
    const talking = clip("a", 0, { words: [{ text: "hello", startMs: 1850, endMs: 2300, confidence: 1 }, { text: "there", startMs: 2450, endMs: 2900, confidence: 1 }], hasSpeech: true });
    // Boundary at 2.2 s, beat at 2.0 s falls inside "hello": the end of the word (2.3 s) is off the beat, so nothing moves.
    const r = alignToBeats(edl([seg("s1", "a", 0, 2.2), seg("s2", "b", 0, 2)]), [talking, clips[1]], { bpm: 120, offsetSec: 0 });
    expect(r.moved).toBe(0);
    expect(r.edl.segments[0].out).toBe(2.2);
  });

  it("does nothing without a tempo or with one cut", () => {
    const one = edl([seg("s1", "a", 0, 2)]);
    expect(alignToBeats(one, clips, { bpm: 120, offsetSec: 0 }).edl).toBe(one);
    expect(alignToBeats(edl([seg("s1", "a", 0, 2.2), seg("s2", "b", 0, 2)]), clips, { bpm: 0, offsetSec: 0 }).moved).toBe(0);
  });
});
