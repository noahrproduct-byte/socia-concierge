import { describe, expect, it } from "vitest";
import { applyOps, describeCut, parseOps, type InstructClip } from "./instruct";
import type { Edl, TranscriptWord } from "./types";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
const clips: InstructClip[] = [
  { id: "talk", position: 0, durationSec: 8, words: [w("How", 2.0, 2.2), w("much", 2.2, 2.5), w("is", 2.5, 2.6), w("this", 2.6, 2.9), w("rug?", 2.9, 3.4)] },
  { id: "rug", position: 1, durationSec: 5, words: null, moments: [{ start: 1, end: 3 }] },
  { id: "weave", position: 2, durationSec: 6, words: [] },
];
const base: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 25 },
  segments: [
    { id: "s1", clipId: "talk", in: 1.8, out: 4, role: "opener", note: "" },
    { id: "s2", clipId: "rug", in: 2, out: 3.5, role: "body", note: "" },
    { id: "s3", clipId: "weave", in: 1, out: 3, role: "ending", note: "" },
  ],
  text: [{ id: "t1", at: 0, end: 2, text: "look at those\ndiamond panels", role: "opening", presetId: "hook_pair" }],
  captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  style: { font: "montserrat", accent: "#ffd400", textBox: "outline", captions: { position: "bottom", size: "m", box: false, uppercase: false, preset: "classic", highlight: "#ffd60a" } },
};

describe("describeCut", () => {
  it("numbers the cuts and lines the way the editor shows them, with what each says", () => {
    const d = describeCut(base, clips);
    expect(d).toContain("cut 1: Clip 1 1.8-4.0s");
    expect(d).toContain('says: "How much is this rug?"');
    expect(d).toContain("cut 2: Clip 2");
    expect(d).toContain("line 1:");
    expect(d).toContain("Captions: on");
  });
});

describe("applyOps", () => {
  it("mutes the silent cuts, removes a cut and trims another, then checks the cut", () => {
    const r = applyOps(base, [{ op: "volume", index: "silent", level: 0 }, { op: "remove_cut", index: 3 }, { op: "trim_cut", index: 2, lengthSec: 1 }], clips);
    expect(r.edl.segments).toHaveLength(2);
    expect(r.edl.segments[0].volume).toBeUndefined();
    expect(r.edl.segments[1].volume).toBe(0);
    expect(r.edl.segments[1].out - r.edl.segments[1].in).toBeCloseTo(1, 1);
    expect(r.done).toHaveLength(3);
    expect(r.skipped).toEqual([]);
  });
  it("says what it cannot do instead of guessing", () => {
    const r = applyOps(base, [{ op: "remove_cut", index: 9 }, { op: "theme", id: "disco" }, { op: "music", volume: 0.3 }], clips);
    expect(r.edl).toEqual(expect.objectContaining({ segments: base.segments }));
    expect(r.skipped).toHaveLength(3);
    expect(r.skipped[0]).toMatch(/no cut 9/);
    expect(r.skipped[1]).toMatch(/no theme/);
  });
  it("adds, edits and removes text lines, fitted to their preset", () => {
    const a = applyOps(base, [{ op: "text_add", text: "feel that weave", atSec: 4, endSec: 5.5 }], clips);
    expect(a.edl.text).toHaveLength(2);
    expect(a.edl.text[1]).toEqual(expect.objectContaining({ text: "feel that weave", at: 4, end: 5.5, role: "mid" }));
    const e = applyOps(a.edl, [{ op: "text_edit", index: 2, text: "details that matter" }, { op: "text_remove", index: 1 }], clips);
    expect(e.edl.text).toHaveLength(1);
    expect(e.edl.text[0].text).toBe("details that matter");
  });
  it("applies a theme by name and keeps caption changes as overrides on it", () => {
    const r = applyOps(base, [{ op: "theme", id: "Showroom" }, { op: "caption_style", size: "l", uppercase: true }], clips);
    expect(r.edl.theme?.id).toBe("showroom");
    expect(r.edl.theme?.overrides).toBeTruthy();
    expect(r.edl.style?.captions.uppercase).toBe(true);
    expect(r.done[0]).toMatch(/Showroom/);
  });
  it("turns captions off and on, sets joins, speed and the ending", () => {
    const r = applyOps(base, [{ op: "captions", on: false }, { op: "transition", index: "all", kind: "fade" }, { op: "speed", index: 2, rate: 0.5 }, { op: "end_card", cta: "Come get your rug", location: "Nashville" }], clips);
    expect(r.edl.captions).toBeNull();
    expect(r.edl.captionsOff).toBe(true);
    expect(r.edl.segments.slice(1).every((s) => s.transition === "fade")).toBe(true);
    expect(r.edl.segments[1].motion?.speed?.rate).toBe(0.5);
    expect(r.edl.endCard).toEqual({ cta: "Come get your rug", location: "Nashville", site: "" });
  });
  it("hands a structural request to Make it again", () => {
    const r = applyOps(base, [{ op: "regenerate", directive: "shorter" }], clips);
    expect(r.regenerate).toBe("shorter");
    expect(r.edl.segments).toHaveLength(3);
  });
});

describe("parseOps", () => {
  it("keeps the operations that fit and counts the rest", () => {
    const r = parseOps([{ op: "volume", index: 2, level: 0 }, { op: "fly", index: 1 }, { op: "volume", index: 2, level: 9 }, "x"]);
    expect(r.ops).toHaveLength(1);
    expect(r.rejected).toBe(3);
  });
});
