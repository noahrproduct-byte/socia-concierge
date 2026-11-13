import { describe, expect, it } from "vitest";
import { autoEdit, detectHook, joinContiguous, overlayBroll, paceBroll, pullHookToFront, trimSilences } from "./autoEdit";
import { themeById } from "./index";
import type { ClipForEdl } from "../edl";
import type { Edl, TranscriptWord } from "../types";
import { edlDurationSec } from "../edl";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
// A talking clip: an ordinary first sentence, a long pause, then the line with the number.
const talk: TranscriptWord[] = [w("So", 0.3, 0.5), w("we", 0.5, 0.6), w("opened", 0.6, 0.9), w("in", 0.9, 1.0), w("March.", 1.0, 1.4), w("We", 3.2, 3.4), w("sell", 3.4, 3.7), w("two", 3.7, 3.9), w("hundred", 3.9, 4.3), w("a", 4.3, 4.4), w("day.", 4.4, 4.9), w("Come", 5.4, 5.6), w("early.", 5.6, 6.1), w("Every", 6.4, 6.7), w("burger", 6.7, 7.0), w("is", 7.0, 7.1), w("smashed", 7.1, 7.5), w("to", 7.5, 7.6), w("order.", 7.6, 8.1), w("Fresh", 8.5, 8.8), w("buns", 8.8, 9.1), w("every", 9.1, 9.4), w("morning.", 9.4, 10.0)];
const words = { talk: talk, broll1: null, broll2: null };
const clips: ClipForEdl[] = [
  { id: "talk", position: 0, durationSec: 12, words: talk, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: true },
  { id: "broll1", position: 1, durationSec: 12, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -30, audioLevel: "quiet", hasSpeech: false },
  { id: "broll2", position: 2, durationSec: 12, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -30, audioLevel: "quiet", hasSpeech: false },
];
const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 20 },
  segments: [{ id: "s1", clipId: "broll1", in: 0, out: 9, role: "opener", note: "" }, { id: "s2", clipId: "talk", in: 0, out: 11, role: "body", note: "" }, { id: "s3", clipId: "broll2", in: 2, out: 10, role: "ending", note: "" }],
  text: [{ id: "t1", at: 10, end: 12, text: "Come early", role: "mid", presetId: "caption_bar" }], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
};

describe("trimSilences", () => {
  it("closes a pause longer than the threshold to a breath either side and moves later text up", () => {
    const r = trimSilences(edl, words, 0.7);
    expect(r.count).toBe(1);
    expect(r.seconds).toBeCloseTo(1.5, 1);
    const talkPieces = r.edl.segments.filter((s) => s.clipId === "talk");
    expect(talkPieces.map((s) => [s.in, s.out])).toEqual([[0, 1.55], [3.05, 11]]);
    // The line at 10 s sits before the pause (10.55 s in output time) and stays; one after it moves up.
    expect(r.edl.text[0].at).toBe(10);
    const later = trimSilences({ ...edl, text: [{ ...edl.text[0], at: 12, end: 14 }] }, words, 0.7);
    expect(later.edl.text[0].at).toBeCloseTo(10.55, 2);
    // A higher threshold leaves it.
    expect(trimSilences(edl, words, 2).count).toBe(0);
  });
});

describe("the hook", () => {
  it("finds the short line with the number, not the first sentence", () => {
    const h = detectHook(edl, words)!;
    expect(h.text).toBe("We sell two hundred a day.");
    expect(h.segmentIndex).toBe(1);
  });
  it("pulls it to the front as the opener and writes the opening line in the theme's title look", () => {
    const out = pullHookToFront(edl, detectHook(edl, words)!, "hook_title");
    expect(out.segments[0]).toMatchObject({ clipId: "talk", role: "opener", purpose: "hook" });
    expect(out.segments[0].in).toBeCloseTo(3.12, 2);
    expect(out.segments.map((s) => s.clipId)).toEqual(["talk", "broll1", "talk", "talk", "broll2"]);
    expect(out.text[0]).toMatchObject({ role: "opening", at: 0, text: "We sell two hundred a day", presetId: "hook_title" });
    // A hook that starts mid-sentence opens with a capital.
    expect(pullHookToFront(edl, { ...detectHook(edl, words)!, text: "called the agency" }, "hook_title").text[0].text).toBe("Called the agency");
    // The later line moved by the hook's length.
    expect(out.text[1].at).toBeGreaterThan(10);
    // Every piece is a usable cut.
    for (const s of out.segments) expect(s.out - s.in).toBeGreaterThanOrEqual(0.8);
  });
});

describe("B-roll", () => {
  it("paces silent shots to the theme and leaves speech alone", () => {
    const r = paceBroll(edl, words, 2.5, 6);
    expect(r.trimmed).toBe(2);
    expect(r.edl.segments[0].out).toBeCloseTo(3.25, 2);
    expect(r.edl.segments[1].out).toBe(11);
  });
  it("overlays silent shots on the speech for a talking-head theme, the voice unbroken", () => {
    const r = overlayBroll(edl, words, 3);
    expect(r.placed).toBeGreaterThan(0);
    expect(r.edl.segments.map((s) => s.clipId)).toEqual(["talk"]);
    expect(r.edl.broll![0]).toMatchObject({ clipId: "broll1", at: 2.5 });
    for (const b of r.edl.broll!) expect(b.at + (b.out - b.in)).toBeLessThanOrEqual(edlDurationSec(r.edl));
  });
});

describe("autoEdit", () => {
  it("the Bold Hook theme captions, trims, hooks and paces; the Talking Head theme overlays", () => {
    const bold = autoEdit(edl, themeById("bold-hook")!, { clips, words });
    expect(bold.edl.captions).toEqual({ source: "transcript" });
    // Captions a person switched off stay off.
    expect(autoEdit({ ...edl, captionsOff: true }, themeById("bold-hook")!, { clips, words }).edl.captions).toBeNull();
    expect(bold.edl.segments[0].clipId).toBe("talk");
    expect(bold.notes.join(" ")).toMatch(/dead air/);
    expect(bold.notes.join(" ")).toMatch(/Opens on/);
    const th = autoEdit(edl, themeById("talking-head")!, { clips, words });
    expect(th.edl.broll?.length).toBeGreaterThan(0);
    expect(th.edl.segments.every((s) => s.clipId === "talk")).toBe(true);
  });
  it("a cut nobody talks in is left as it is apart from pacing", () => {
    const silent: Edl = { ...edl, segments: [edl.segments[0], edl.segments[2]] };
    const r = autoEdit(silent, themeById("luxury")!, { clips, words });
    expect(r.edl.captions).toBeNull();
    expect(r.edl.segments).toHaveLength(2);
    expect(r.edl.text).toEqual(silent.text);
  });
});

describe("joinContiguous", () => {
  it("joins pieces of one clip that touch and leaves pieces with a gap or a soft join alone", () => {
    const e: Edl = { ...edl, segments: [{ id: "a", clipId: "talk", in: 0, out: 2, role: "opener", note: "" }, { id: "b", clipId: "talk", in: 2, out: 4, role: "body", note: "" }, { id: "c", clipId: "talk", in: 5, out: 7, role: "body", note: "" }, { id: "d", clipId: "talk", in: 7, out: 9, role: "ending", note: "", transition: "fade" }] };
    const out = joinContiguous(e);
    expect(out.segments.map((s) => [s.id, s.in, s.out])).toEqual([["a", 0, 4], ["c", 5, 7], ["d", 7, 9]]);
    expect(joinContiguous(edl)).toBe(edl);
  });
});
