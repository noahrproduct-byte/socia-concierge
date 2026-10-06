import { describe, it, expect } from "vitest";
import { snapTime, validateEdl, guideFromEdl, gateEnhancements, audioBalance, edlDurationSec, type ClipForEdl, type RawEdl } from "./edl";

const clip = (over: Partial<ClipForEdl> & { id: string; position: number }): ClipForEdl => ({
  durationSec: 20, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false, ...over,
});

const talking = clip({
  id: "c1", position: 0, hasSpeech: true,
  words: [{ text: "We", startMs: 1000, endMs: 1300, confidence: 1 }, { text: "fed", startMs: 1300, endMs: 1700, confidence: 1 }, { text: "two", startMs: 1800, endMs: 2200, confidence: 1 }, { text: "hundred", startMs: 2200, endMs: 2900, confidence: 1 }],
  silences: [{ start: 5.0, end: 6.2 }],
});
const dark = clip({ id: "c2", position: 1, medianLuma: 0.2, brightness: "dark", rmsDb: -28 });
const bright = clip({ id: "c3", position: 2, medianLuma: 0.55, rmsDb: -19 });

describe("snapTime", () => {
  it("never cuts inside a word: in-points go to the word start, out-points to its end", () => {
    expect(snapTime(1.5, talking, "in")).toBe(1.3);
    expect(snapTime(1.5, talking, "out")).toBe(1.7);
  });
  it("lands on a nearby pause: in-points at the end of the pause, out-points at its start", () => {
    expect(snapTime(6.0, talking, "in")).toBe(6.2);
    expect(snapTime(5.2, talking, "out")).toBe(5.0);
    expect(snapTime(10, talking, "in")).toBe(10); // nothing nearby
  });
});

describe("validateEdl", () => {
  const raw: RawEdl = {
    targetSec: { min: 15, max: 20 },
    segments: [
      { clipId: "c1", in: 1.5, out: 8, note: "the spoken hook" },
      { clipId: "c2", in: 0, out: 10, note: "boxing the order" },
      { clipId: "c3", in: 2, out: 12, note: "the cheese pull" },
      { clipId: "nope", in: 0, out: 5 },
    ],
    text: [{ at: 0, text: "200 people. One kitchen.", role: "opening" }, { at: 99, end: 120, text: "Book your event", role: "cta" }],
    enhance: [{ clipId: "c2", kind: "brighten", amount: "slight", why: "" }, { clipId: "c3", kind: "brighten", amount: "slight", why: "" }, { clipId: "c1", kind: "sepia" }],
    cta: "Book your event", music: "Upbeat instrumental, 110–125 BPM, low under speech", caption: "We fed 200 people.",
  };

  it("snaps, drops unknown clips, trims to the target and keeps only supported fixes", () => {
    const { edl, warnings } = validateEdl(raw, [talking, dark, bright]);
    expect(edl.segments.map((s) => s.clipId)).toEqual(["c1", "c2", "c3"]);
    expect(edl.segments[0].in).toBe(1.3); // off the middle of "fed"
    expect(edl.segments[0].role).toBe("opener");
    expect(edl.segments[2].role).toBe("ending");
    expect(edlDurationSec(edl)).toBeLessThanOrEqual(20);
    expect(warnings.some((w) => /unknown clip/.test(w))).toBe(true);
    expect(warnings.some((w) => /trimmed to/.test(w))).toBe(true);
    expect(edl.enhance).toEqual([{ clipId: "c2", kind: "brighten", amount: "slight", why: "" }]);
    expect(edl.captions).toEqual({ source: "transcript" });
    expect(edl.text[1].end).toBeLessThanOrEqual(edlDurationSec(edl));
    expect(edl.audio).toEqual([{ clipId: "c2", gainDb: 8, why: "quieter than the other clips" }]);
  });

  it("renders the same EDL as plain steps", () => {
    const { edl } = validateEdl(raw, [talking, dark, bright]);
    const steps = guideFromEdl(edl, [talking, dark, bright]).map((s) => s.text);
    expect(steps[0]).toMatch(/^Start with Clip 1, 0:01–0:0\d — the spoken hook$/);
    expect(steps[1]).toMatch(/^Cut to Clip 2, 0:00–/);
    expect(steps[2]).toMatch(/^Finish on Clip 3/);
    expect(steps).toContainEqual(expect.stringMatching(/Put “200 people. One kitchen.” on screen as it opens/));
    expect(steps).toContainEqual("Add captions from the transcript (speech is in Clip 1).");
    expect(steps).toContainEqual("Brighten Clip 2 slightly — it's darker than the rest of the footage.");
    expect(steps).toContainEqual("Raise Clip 2 by about 8 dB — quieter than the other clips.");
    expect(steps).toContainEqual("Music: Upbeat instrumental, 110–125 BPM, low under speech");
    expect(steps[steps.length - 1]).toMatch(/^Recommended length: 15–20 seconds \(this cut runs \d+(\.\d+)?s\)\.$/);
  });

  it("says when there is no speech and when the cut is short", () => {
    const { edl } = validateEdl({ segments: [{ clipId: "c2", in: 0, out: 5 }, { clipId: "c3", in: 0, out: 4 }] }, [dark, bright]);
    expect(edl.captions).toBeNull();
    expect(edl.notes[0]).toMatch(/runs 9s, under the recommended 15s/);
    expect(guideFromEdl(edl, [dark, bright]).map((s) => s.text)).toContain("No speech was detected in these clips — skip captions.");
  });
});

describe("measured corrections", () => {
  it("balances levels toward the median and ignores silent clips", () => {
    const silent = clip({ id: "s", position: 3, rmsDb: -80, audioLevel: "silent" });
    expect(audioBalance([talking, dark, bright, silent])).toEqual([{ clipId: "c2", gainDb: 8, why: "quieter than the other clips" }]);
  });
  it("drops fixes the numbers do not support", () => {
    const r = gateEnhancements([{ clipId: "c3", kind: "brighten" }, { clipId: "c2", kind: "contrast" }], [talking, dark, bright]);
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(2);
  });
});
