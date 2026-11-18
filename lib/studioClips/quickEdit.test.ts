import { describe, expect, it } from "vitest";
import { PICTURE_BRIEF, quickCut, quickLook, quickStats, rawOf } from "./quickEdit";
import { briefIntent } from "./briefIntent";
import { themeById } from "./themes";
import type { BuildSource, Edl, TranscriptWord } from "./types";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
// One talking clip: a sentence, two seconds of nothing, then three more sentences.
const talk: TranscriptWord[] = [w("So", 0.3, 0.5), w("we", 0.5, 0.6), w("opened", 0.6, 0.9), w("in", 0.9, 1.0), w("March.", 1.0, 1.4), w("We", 3.6, 3.8), w("sell", 3.8, 4.1), w("two", 4.1, 4.3), w("hundred", 4.3, 4.7), w("a", 4.7, 4.8), w("day.", 4.8, 5.3), w("Every", 5.6, 5.9), w("burger", 5.9, 6.2), w("is", 6.2, 6.3), w("smashed", 6.3, 6.7), w("to", 6.7, 6.8), w("order.", 6.8, 7.3), w("Fresh", 7.6, 7.9), w("buns", 7.9, 8.2), w("every", 8.2, 8.5), w("morning.", 8.5, 9.1)];
const source: BuildSource = { clipId: "talk", position: 0, name: "raw.mp4", url: "https://example.test/raw.mp4", thumb: null, durationSec: 10, width: 1080, height: 1920, words: talk, moments: [] };
const base: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 11 },
  segments: [{ id: "s1", clipId: "talk", in: 0, out: 10, role: "opener", note: "" }],
  text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
};
const theme = themeById("clean-minimal")!;

describe("quickCut", () => {
  it("takes the dead air out, turns captions on and keeps every word", () => {
    const { edl, notes } = quickCut(base, theme, [source]);
    const stats = quickStats(base, edl, { talk });
    expect(stats.rawSec).toBe(10);
    expect(stats.cutSec).toBeLessThan(9);
    expect(stats.words).toBe(talk.length);
    expect(stats.wordsKept).toBe(talk.length);
    expect(stats.removed).toBeGreaterThanOrEqual(1);
    expect(stats.captions).toBe(true);
    expect(edl.theme?.id).toBe("clean-minimal");
    expect(notes.length).toBeGreaterThan(0);
    // Every piece is inside the clip and in order of use.
    for (const s of edl.segments) { expect(s.in).toBeGreaterThanOrEqual(0); expect(s.out).toBeLessThanOrEqual(10); expect(s.out).toBeGreaterThan(s.in); }
  });

  it("gives a clip with no words no captions and invents no speech edit", () => {
    const silent: BuildSource = { ...source, words: [] };
    const { edl, notes } = quickCut(base, theme, [silent]);
    const stats = quickStats(base, edl, { talk: [] });
    expect(stats.words).toBe(0);
    expect(stats.wordsKept).toBe(0);
    expect(stats.captions).toBe(false);
    expect(notes.some((n) => /tightened the speech/.test(n))).toBe(false);
    // Nothing to cut by, so the clip plays whole.
    expect(stats.removed).toBe(0);
    expect(stats.cutSec).toBeCloseTo(10, 0);
    expect(edl.theme?.id).toBe("clean-minimal");
  });
});

describe("quickStats", () => {
  it("counts what is gone from the cut itself", () => {
    const cut: Edl = { ...base, segments: [{ id: "s1", clipId: "talk", in: 0.2, out: 1.5, role: "opener", note: "" }, { id: "s2", clipId: "talk", in: 5.5, out: 9.2, role: "body", note: "" }] };
    const stats = quickStats(base, cut, { talk });
    // Gone: the head (0 to 0.2), the middle (1.5 to 5.5, the second sentence with it) and the tail.
    expect(stats.removed).toBe(3);
    expect(stats.wordsKept).toBe(talk.length - 6);
    expect(stats.shots).toBe(2);
  });
});

describe("the graphics and the beat", () => {
  // Long enough for a figure to be said clear of the opening and the ending.
  const long: TranscriptWord[] = [...talk, w("And", 9.6, 9.8), w("that", 9.8, 10.0), w("is", 10.0, 10.1), w("the", 10.1, 10.2), w("plan.", 10.2, 10.6), w("We", 11.0, 11.2), w("serve", 11.2, 11.5), w("900", 11.5, 11.9), w("people", 11.9, 12.2), w("a", 12.2, 12.3), w("week", 12.3, 12.6), w("here.", 12.6, 13.0), w("Come", 13.4, 13.6), w("and", 13.6, 13.7), w("see", 13.7, 13.9), w("us", 13.9, 14.1), w("on", 14.1, 14.2), w("the", 14.2, 14.3), w("corner", 14.3, 14.7), w("of", 14.7, 14.8), w("Main", 14.8, 15.1), w("and", 15.1, 15.2), w("Fifth", 15.2, 15.6), w("this", 15.6, 15.8), w("very", 15.8, 16.0), w("weekend.", 16.0, 16.6), w("Bring", 17.0, 17.3), w("the", 17.3, 17.4), w("whole", 17.4, 17.7), w("family", 17.7, 18.1), w("along", 18.1, 18.4), w("too.", 18.4, 18.8)];
  const src: BuildSource = { ...source, durationSec: 20, words: long };
  const whole: Edl = { ...base, targetSec: { min: 1, max: 21 }, segments: [{ id: "s1", clipId: "talk", in: 0, out: 20, role: "opener", note: "" }] };

  it("places graphics only when asked, from words that are in the cut", () => {
    expect(quickCut(whole, theme, [src]).edl.scenes).toBeUndefined();
    const { edl, notes } = quickCut(whole, theme, [src], { scenes: true });
    expect(edl.scenes?.some((s) => s.kind === "stat" && s.text === "900")).toBe(true);
    expect(quickStats(whole, edl, { talk: long }).scenes).toBe(edl.scenes!.length);
    expect(notes.some((n) => /animated graphic/.test(n))).toBe(true);
  });

  it("leaves a cut already in the look as it was chosen, and puts another look on top", () => {
    const made: Edl = { ...whole, theme: { id: theme.id }, segments: [{ id: "s1", clipId: "talk", in: 0, out: 5.5, role: "opener", note: "" }, { id: "s2", clipId: "talk", in: 9, out: 20, role: "ending", note: "" }] };
    const same = quickLook(made, theme, [src]);
    expect(same.edl.segments).toEqual(made.segments);
    const other = quickLook(made, themeById("bold-hook")!, [src]);
    expect(other.edl.theme?.id).toBe("bold-hook");
  });

  it("counts a cut from several clips against all the footage", () => {
    const b: BuildSource = { ...source, clipId: "b", position: 1, durationSec: 6, words: [] };
    const cut: Edl = { ...base, segments: [{ id: "s1", clipId: "b", in: 1, out: 3, role: "opener", note: "" }, { id: "s2", clipId: "talk", in: 0, out: 4, role: "ending", note: "" }] };
    const raw = rawOf(cut, [source, b]);
    expect(raw.segments.map((s) => [s.clipId, s.in, s.out])).toEqual([["talk", 0, 10], ["b", 0, 6]]);
    const stats = quickStats(raw, cut, { talk, b: [] });
    expect(stats.rawSec).toBe(16);
    expect(stats.cutSec).toBeCloseTo(6, 0);
    expect(stats.shots).toBe(2);
  });

  it("asks for a cut, never a finish of the whole footage", () => {
    expect(briefIntent(PICTURE_BRIEF).keepWhole).toBe(false);
  });
});
