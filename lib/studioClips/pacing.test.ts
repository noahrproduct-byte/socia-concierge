import { describe, expect, it } from "vitest";
import { MAX_WITH_FINDINGS, PACING, applyPacing, minReadSec, pacingReport } from "./pacing";
import type { ClipForEdl } from "./edl";
import type { Edl, EdlSegment, EdlText } from "./types";

const clip = (over: Partial<ClipForEdl> & { id: string; position: number }): ClipForEdl => ({ durationSec: 20, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false, ...over });
const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs, confidence: 1 });
/** Speech from 1.5 s to 6 s, silence before it and from 6.5 s on. */
const talking = clip({ id: "a", position: 0, hasSpeech: true, words: [w("wait", 1500, 1800), w("for", 1850, 2000), w("it", 2050, 2300), w("here", 5500, 6000)], silences: [{ start: 0, end: 1.5 }, { start: 6.5, end: 20 }] });
const silent = clip({ id: "b", position: 1 });
const seg = (id: string, clipId: string, a: number, b: number, role: EdlSegment["role"] = "body", extra: Partial<EdlSegment> = {}): EdlSegment => ({ id, clipId, in: a, out: b, role, note: "", ...extra });
const edl = (segments: EdlSegment[], text: EdlText[] = []): Edl => ({ version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 8, max: 30 }, segments, text, captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] });

describe("reading time", () => {
  it("gives a short line a second and a long one up to four", () => {
    expect(minReadSec("Wait")).toBe(1);
    expect(minReadSec("Wait for the cheese pull")).toBeCloseTo(0.8 + 24 * 0.045, 2);
    expect(minReadSec("a".repeat(200))).toBe(4);
  });
});

describe("pacing SOCIA's cut", () => {
  it("starts the opener where the sound starts, not in the silent lead-in", () => {
    const { edl: out, changes } = applyPacing(edl([seg("s1", "a", 0, 4, "opener"), seg("s2", "b", 0, 3, "ending")]), [talking, silent]);
    expect(out.segments[0].in).toBeCloseTo(1.4, 2);
    expect(changes[0].what).toMatch(/Clip 1 starts at 1.4s/);
  });

  it("ends a cut after its last sound instead of running into silence", () => {
    const { edl: out } = applyPacing(edl([seg("s1", "a", 1.5, 12, "opener"), seg("s2", "b", 0, 3, "ending")]), [talking, silent]);
    expect(out.segments[0].out).toBeCloseTo(6.5 + PACING.tailSec, 2);
  });

  it("caps a silent cut at five seconds and a spoken one at ten", () => {
    const { edl: out } = applyPacing(edl([seg("s1", "b", 0, 9, "opener"), seg("s2", "a", 1.5, 6), seg("s3", "b", 2, 14), seg("s4", "a", 1.5, 6, "ending")]), [talking, silent]);
    expect(out.segments[0].out - out.segments[0].in).toBeCloseTo(PACING.openerMaxSec, 2);
    expect(out.segments[2].out - out.segments[2].in).toBeCloseTo(PACING.silentMaxSec, 2);
  });

  it("won't score a cut 100 while the cut check has found something", () => {
    const cut = edl([seg("s1", "b", 0, 2, "opener"), seg("s2", "b", 4, 6), seg("s3", "b", 8, 10, "ending")]);
    const clean = pacingReport(cut, [talking, silent]);
    expect(clean.score).toBe(100);
    const one = pacingReport(cut, [talking, silent], null, { findings: [{ id: "text", segmentId: null, detail: "x" }] });
    expect(one.score).toBe(MAX_WITH_FINDINGS);
    expect(one.line).toMatch(/Held at 80 until the thing below is fixed\./);
    const three = pacingReport(cut, [talking, silent], null, { findings: [1, 2, 3].map(() => ({ id: "ghost" as const, segmentId: null, detail: "x" })) });
    expect(three.score).toBe(60);
  });

  it("gives the ending room to land", () => {
    const { edl: out } = applyPacing(edl([seg("s1", "b", 0, 3, "opener"), seg("s2", "b", 5, 5.9, "ending")]), [talking, silent]);
    expect(out.segments[1].out - out.segments[1].in).toBeGreaterThanOrEqual(PACING.endingMinSec);
  });

  it("keeps every line up long enough to read and the opening line up from the start", () => {
    const text: EdlText[] = [{ id: "t1", at: 1.2, end: 1.6, text: "Wait for the cheese pull", role: "opening", presetId: "hook_title" }, { id: "t2", at: 4, end: 4.4, text: "Only twenty a day", role: "mid", presetId: "caption_bar" }];
    const { edl: out } = applyPacing(edl([seg("s1", "b", 0, 3, "opener"), seg("s2", "b", 3, 6), seg("s3", "b", 6, 9, "ending")], text), [talking, silent]);
    expect(out.text[0].at).toBe(0.2);
    expect(out.text[0].end - out.text[0].at).toBeGreaterThanOrEqual(minReadSec("Wait for the cheese pull") - 0.01);
    expect(out.text[1].end - out.text[1].at).toBeGreaterThanOrEqual(minReadSec("Only twenty a day") - 0.01);
  });

  it("leaves a cut that already follows the rules alone", () => {
    const good = edl([seg("s1", "a", 1.5, 4, "opener"), seg("s2", "b", 0, 3), seg("s3", "b", 4, 6.5, "ending")], [{ id: "t1", at: 0.2, end: 3, text: "Wait for it", role: "opening", presetId: "hook_title" }]);
    const { edl: out, changes } = applyPacing(good, [talking, silent]);
    expect(changes).toEqual([]);
    expect(out).toEqual(good);
  });
});

describe("the pacing report", () => {
  it("scores a well-paced cut 100 and says so in one sentence", () => {
    const r = pacingReport(edl([seg("s1", "a", 1.5, 4, "opener"), seg("s2", "b", 0, 3), seg("s3", "b", 4, 6.5, "ending")], [{ id: "t1", at: 0.2, end: 3, text: "Wait for it", role: "opening", presetId: "hook_title" }]), [talking, silent]);
    expect(r.score).toBe(100);
    expect(r.line).toMatch(/^Paced like a good short-form edit: 3 cuts averaging 2.7s/);
  });

  it("names what fails, deterministically", () => {
    const e = edl([seg("s1", "b", 0, 9, "opener"), seg("s2", "b", 0, 0.9, "ending")]);
    const a = pacingReport(e, [talking, silent]), b = pacingReport(e, [talking, silent]);
    expect(a).toEqual(b);
    expect(a.score).toBeLessThan(100);
    expect(a.parts.find((p) => p.id === "drag")?.ok).toBe(false);
    expect(a.parts.find((p) => p.id === "ending")?.ok).toBe(false);
    expect(a.line).toMatch(/pacing rules met/);
  });

  it("judges the beat only when a tempo is known", () => {
    const e = edl([seg("s1", "b", 0, 2, "opener"), seg("s2", "b", 0, 2), seg("s3", "b", 0, 2, "ending")]);
    expect(pacingReport(e, [silent]).parts.some((p) => p.id === "beat")).toBe(false);
    const on = pacingReport(e, [silent], { bpm: 120, offsetSec: 0 }); // cuts at 2 s and 4 s, beats every 0.5 s
    expect(on.parts.find((p) => p.id === "beat")).toMatchObject({ ok: true, detail: "2 of 2 cuts land on the music's beat (120 BPM)." });
    const off = pacingReport(e, [silent], { bpm: 120, offsetSec: 0.3 });
    expect(off.parts.find((p) => p.id === "beat")?.ok).toBe(false);
  });
});
