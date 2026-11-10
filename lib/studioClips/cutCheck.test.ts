import { describe, expect, it } from "vitest";
import { checkCut, repairCut, sentenceEnd } from "./cutCheck";
import type { ClipForEdl } from "./edl";
import type { Edl } from "./types";

const w = (text: string, a: number, b: number) => ({ text, startMs: a * 1000, endMs: b * 1000, confidence: 1 });
const clip = (id: string, position: number, more: Partial<ClipForEdl> = {}): ClipForEdl => ({
  id, position, durationSec: 30, words: null, silences: null, medianLuma: null, warmth: null, brightness: null, contrastLevel: null, rmsDb: null, audioLevel: null, hasSpeech: false, ...more,
});
const seg = (id: string, clipId: string, a: number, b: number, more: Partial<Edl["segments"][number]> = {}) => ({ id, clipId, in: a, out: b, role: "body" as const, note: "", ...more });
const edl = (segments: Edl["segments"], over: Partial<Edl> = {}): Edl => ({
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 10, max: 30 }, segments, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [], ...over,
});

// A speaker: two sentences, the first running from 1 s to 4.4 s.
const speaker = clip("t", 2, { hasSpeech: true, words: [w("Most", 1, 1.3), w("Reels", 1.3, 1.7), w("lose", 1.7, 2), w("people", 2, 2.5), w("in", 2.5, 2.6), w("the", 2.6, 2.7), w("first", 2.7, 3.1), w("two", 3.1, 3.4), w("seconds.", 3.4, 4.4), w("Here's", 5.5, 5.8), w("why.", 5.8, 6.2)] });
const pizza = clip("p", 1, { lumaSamples: [{ t: 0, luma: 0.01 }, { t: 1.5, luma: 0.4 }, { t: 3, luma: 0.42 }] });

describe("the cut check", () => {
  it("finds the stutter from Noah's 'worst video': one take cut into slivers", () => {
    const r = checkCut(edl([seg("s1", "p", 2, 4.5), seg("s2", "p", 4.7, 6.1, { transition: "fade" }), seg("s3", "p", 19.8, 25, { transition: "fade" })]), [pizza]);
    expect(r.findings.map((f) => f.id)).toEqual(["stutter"]);
    expect(r.findings[0].detail).toMatch(/skips only 0\.2 s/);
  });
  it("finds the same moment shown twice, a black frame and a shot too short to see", () => {
    const r = checkCut(edl([seg("s1", "p", 0, 2), seg("s2", "t", 0, 0.4), seg("s3", "p", 1.2, 4)]), [pizza, speaker]);
    expect(r.findings.map((f) => f.id).sort()).toEqual(["black", "repeat", "short"]);
  });
  it("finds a shot that ends mid-sentence and a dissolve over speech", () => {
    const r = checkCut(edl([seg("s1", "t", 1, 2.55), seg("s2", "p", 5, 8, { transition: "fade" })]), [pizza, speaker]);
    const ids = r.findings.map((f) => f.id);
    expect(ids).toContain("sentence");
    expect(ids).toContain("voice");
    expect(sentenceEnd(speaker, { in: 1, out: 2.55 })).toBe(4.52);
    // Ending at the full stop, or at a long pause, is fine.
    expect(sentenceEnd(speaker, { in: 1, out: 4.5 })).toBeNull();
    expect(sentenceEnd(clip("x", 3, { words: [w("no", 0, 0.2), w("punctuation", 0.3, 0.8), w("here", 0.9, 1.1)] }), { in: 0, out: 0.85 })).toBeNull();
  });
  it("finds two lines on top of each other", () => {
    const r = checkCut(edl([seg("s1", "p", 1.5, 6)], { text: [{ id: "t1", at: 0, end: 3, text: "when it comes out", role: "mid" }, { id: "t2", at: 2, end: 4, text: "like this", role: "mid" }] }), [pizza]);
    expect(r.findings.map((f) => f.id)).toEqual(["text"]);
  });
  it("says what it checked when the cut is clean, naming only checks it could run", () => {
    const r = checkCut(edl([seg("s1", "p", 1.5, 4), seg("s2", "p", 10, 13, { transition: "fade" })]), [pizza]);
    expect(r.findings).toEqual([]);
    expect(r.line).toBe("Checked: no shot stutters, nothing plays twice, every shot is long enough to see, no black frames.");
  });
});

describe("repairing SOCIA's own cut", () => {
  it("joins slivers of one take back into one shot", () => {
    const r = repairCut(edl([seg("s1", "p", 2, 4.5), seg("s2", "p", 4.7, 6.1, { transition: "fade" }), seg("s3", "p", 6.3, 8, { transition: "fade" })]), [pizza]);
    expect(r.edl.segments.map((s) => [s.in, s.out])).toEqual([[2, 8]]);
    expect(r.fixed[0]).toMatch(/joined 2 pieces/);
  });
  it("trims a repeated moment off the later showing, and drops a showing that is all repeat", () => {
    const r = repairCut(edl([seg("s1", "p", 2, 6), seg("s2", "t", 6, 7), seg("s3", "p", 5, 9), seg("s4", "p", 3, 4), seg("s5", "t", 10, 12)]), [pizza, speaker]);
    expect(r.edl.segments.map((s) => [s.clipId, s.in, s.out])).toEqual([["p", 2, 6], ["t", 6, 7], ["p", 6, 9], ["t", 10, 12]]);
    expect(r.edl.segments.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(r.edl.segments[3].role).toBe("ending");
  });
  it("lets a sentence finish over the next quiet shot (an L-cut), or by running on when the next shot talks", () => {
    const r = repairCut(edl([seg("s1", "p", 5, 8), seg("s2", "t", 1, 2.55, { transition: "fade" }), seg("s3", "p", 12, 15, { transition: "fade" })]), [pizza, speaker]);
    expect(r.edl.segments[1].out).toBe(2.55);
    expect(r.edl.segments[1].voiceTail).toBe(1.97);
    expect(r.fixed).toContain("Clip 3 finishes its sentence over the next shot");
    const last = repairCut(edl([seg("s1", "p", 5, 8), seg("s2", "t", 1, 2.55, { transition: "fade" })]), [pizza, speaker]);
    expect(last.edl.segments[1].out).toBe(4.52);
    expect(last.edl.segments[1].voiceTail).toBeUndefined();
  });
  it("makes a dissolve over speech a hard cut", () => {
    const r = repairCut(edl([seg("s1", "p", 5, 8), seg("s2", "t", 1, 2.55, { transition: "fade" }), seg("s3", "p", 12, 15, { transition: "fade" })]), [pizza, speaker]);
    expect(r.edl.segments[1].transition).toBeUndefined();
    expect(r.edl.segments[2].transition).toBeUndefined();
    expect(checkCut(r.edl, [pizza, speaker]).findings).toEqual([]);
  });
  it("keeps the transitions a person chose, and leaves a clean cut untouched", () => {
    const chosen = edl([seg("s1", "t", 1, 4.5), seg("s2", "p", 5, 8, { transition: "whip" })]);
    expect(repairCut(chosen, [pizza, speaker], { keepTransitions: true }).fixed).toEqual([]);
    const clean = edl([seg("s1", "p", 1.5, 4), seg("s2", "p", 10, 13, { transition: "fade" })]);
    expect(repairCut(clean, [pizza]).edl).toBe(clean);
  });
});
