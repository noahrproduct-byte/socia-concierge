import { describe, expect, it } from "vitest";
import { HOUSE_GENRE_IDS, HOUSE_PACING, HOUSE_STYLE, applyHouseStyle, isHouseGenre } from "./houseStyle";
import { overlapFrames } from "./timeline";
import { transitionLook } from "./transitions";
import { applyPacing, PACING } from "./pacing";
import type { ClipForEdl } from "./edl";
import type { Edl } from "./types";

const base = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 30 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] } as const;
const edl = (segs: Edl["segments"], genre?: Edl["genre"]): Edl => ({ ...base, segments: segs, ...(genre ? { genre } : {}) } as unknown as Edl);
const clip = (id: string, durationSec: number): ClipForEdl => ({ id, position: 1, durationSec, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false } as ClipForEdl);

describe("house style genres", () => {
  it("every genre id has pacing numbers and is named in the prompt", () => {
    for (const g of HOUSE_GENRE_IDS) {
      expect(HOUSE_PACING[g]).toBeDefined();
      expect(HOUSE_STYLE).toContain(g);
    }
    expect(isHouseGenre("one_take_skit")).toBe(true);
    expect(isHouseGenre("montage")).toBe(false);
  });
});

describe("flash transition", () => {
  it("is a hard cut (no overlap) whose first two frames wash to white", () => {
    expect(overlapFrames("flash", 60, 60)).toBe(0);
    expect(transitionLook({ frame: 0, frames: 30, into: "flash", overlapIn: 0, overlapOut: 0 }).flash).toBe(1);
    expect(transitionLook({ frame: 1, frames: 30, into: "flash", overlapIn: 0, overlapOut: 0 }).flash).toBeGreaterThan(0);
    expect(transitionLook({ frame: 2, frames: 30, into: "flash", overlapIn: 0, overlapOut: 0 }).flash).toBe(0);
    expect(transitionLook({ frame: 0, frames: 30, into: "cut", overlapIn: 0, overlapOut: 0 }).flash).toBe(0);
  });
});

describe("genre-aware pacing", () => {
  const segs: Edl["segments"] = [{ id: "s1", clipId: "a", in: 0, out: 10, role: "opener", note: "" }];
  it("shortens a silent 10 s shot to the silent cap when the cut has no genre", () => {
    const { edl: out } = applyPacing(edl(segs), [clip("a", 12)]);
    expect(out.segments[0].out - out.segments[0].in).toBeLessThanOrEqual(PACING.openerMaxSec + 0.05);
  });
  it("keeps the whole hold for a one-take skit", () => {
    const { edl: out, changes } = applyPacing(edl(segs, "one_take_skit"), [clip("a", 12)]);
    expect(out.segments[0].out - out.segments[0].in).toBeCloseTo(10, 1);
    expect(changes.filter((c) => /shortened/.test(c.what))).toHaveLength(0);
  });
});

describe("applyHouseStyle", () => {
  const seg = (id: string, clipId: string, a: number, b: number, extra: Partial<Edl["segments"][number]> = {}): Edl["segments"][number] => ({ id, clipId, in: a, out: b, role: "body", note: "", ...extra });
  const line = (id: string, at: number, end: number, text: string, role: "opening" | "mid" | "cta") => ({ id, at, end, text, role, presetId: "pov" as never });

  it("leaves a cut with no genre and a cut that already follows its genre alone", () => {
    const plain = edl([seg("s1", "a", 0, 3, { role: "opener" }), seg("s2", "b", 0, 3, { transition: "whip" })]);
    expect(applyHouseStyle(plain, [clip("a", 10), clip("b", 10)]).edl).toBe(plain);
    const good = { ...edl([seg("s1", "a", 0, 2, { role: "opener" }), seg("s2", "b", 0, 2), seg("s3", "b", 4, 8, { role: "ending" })], "food_reel"), targetSec: { min: 7, max: 14 }, text: [line("t1", 0, 2, "POV: Friday lunch rush", "opening")] };
    const r = applyHouseStyle(good, [clip("a", 10), clip("b", 10)]);
    expect(r.changes).toEqual([]);
    expect(r.edl).toBe(good);
  });

  it("merges a one-take skit cut into pieces of the same shot back into one shot", () => {
    const skit = edl([seg("s1", "a", 1, 4, { role: "opener" }), seg("s2", "a", 4, 7), seg("s3", "a", 7, 10, { role: "ending" })], "one_take_skit");
    const { edl: out, changes } = applyHouseStyle(skit, [clip("a", 12)]);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0]).toMatchObject({ clipId: "a", in: 1, out: 10, role: "opener" });
    expect(changes.map((c) => c.rule)).toContain("one_take");
  });

  it("turns whip and zoom into hard cuts outside sports, and keeps a sports flash", () => {
    const food = edl([seg("s1", "a", 0, 2, { role: "opener" }), seg("s2", "b", 0, 2, { transition: "whip" }), seg("s3", "b", 3, 5, { transition: "zoom" }), seg("s4", "b", 6, 8, { transition: "fade" })], "food_reel");
    const r = applyHouseStyle({ ...food, text: [line("t1", 0, 2, "Lunch rush", "opening")] }, [clip("a", 10), clip("b", 10)]);
    expect(r.edl.segments.map((s) => s.transition)).toEqual([undefined, undefined, undefined, "fade"]);
    expect(r.changes.filter((c) => c.rule === "transition")).toHaveLength(2);
    const sports = edl([seg("s1", "a", 0, 1.5, { role: "opener" }), seg("s2", "b", 0, 1, { transition: "flash" })], "sports_montage");
    expect(applyHouseStyle(sports, [clip("a", 10), clip("b", 10)]).edl.segments[1].transition).toBe("flash");
  });

  it("holds the after no shorter than the before when the clip has room", () => {
    const ba = { ...edl([seg("s1", "a", 0, 4, { role: "opener" }), seg("s2", "b", 0, 2, { role: "ending" })], "before_after_match"), text: [line("t1", 0, 4, "Before", "opening"), line("t2", 4, 6, "After", "mid")] };
    const { edl: out, changes } = applyHouseStyle(ba, [clip("a", 10), clip("b", 10)]);
    expect(out.segments[1].out).toBe(4);
    expect(changes.map((c) => c.rule)).toContain("before_after");
    // no room: the clip ends at 2.5 s, so it only grows that far
    expect(applyHouseStyle(ba, [clip("a", 10), clip("b", 2.5)]).edl.segments[1].out).toBe(2.5);
  });

  it("trims a food reel to the genre's 14 s band unless a brief set the length", () => {
    const long = { ...edl([seg("s1", "a", 0, 3, { role: "opener" }), seg("s2", "b", 0, 8), seg("s3", "a", 4, 12, { role: "ending" })], "food_reel"), targetSec: { min: 15, max: 30 }, text: [line("t1", 0, 2, "Lunch rush", "opening")] };
    const { edl: out, changes } = applyHouseStyle(long, [clip("a", 20), clip("b", 20)]);
    expect(out.targetSec).toEqual({ min: 7, max: 14 });
    expect(out.segments.reduce((a, s) => a + s.out - s.in, 0)).toBeLessThanOrEqual(14.05);
    expect(out.segments[0].out - out.segments[0].in).toBe(3); // the opener is never trimmed
    expect(changes.map((c) => c.rule)).toContain("length");
    const briefed = { ...long, brief: { prompt: "a full tour, 30 seconds" } as never };
    expect(applyHouseStyle(briefed, [clip("a", 20), clip("b", 20)]).edl.targetSec).toEqual({ min: 15, max: 30 });
  });

  it("moves an on-screen ask into the caption but keeps an address or a date as a label", () => {
    const base2 = edl([seg("s1", "a", 0, 3, { role: "opener" }), seg("s2", "b", 0, 3, { role: "ending" })], "food_reel");
    const r = applyHouseStyle({ ...base2, text: [line("t1", 0, 2, "Lunch rush", "opening"), line("t2", 4, 6, "Follow for more", "cta")] }, [clip("a", 10), clip("b", 10)]);
    expect(r.edl.text.map((t) => t.id)).toEqual(["t1"]);
    expect(r.edl.cta).toBe("Follow for more");
    const addr = applyHouseStyle({ ...base2, text: [line("t1", 0, 2, "Lunch rush", "opening"), line("t2", 4, 6, "216 Thompson Ln, Nashville", "cta")] }, [clip("a", 10), clip("b", 10)]);
    expect(addr.edl.text).toHaveLength(2);
    expect(addr.changes.filter((c) => c.rule === "cta")).toHaveLength(0);
  });

  it("puts the opening line on the first frame and asks for one when it is missing, never inventing it", () => {
    const base2 = edl([seg("s1", "a", 0, 3, { role: "opener" }), seg("s2", "b", 0, 3, { role: "ending" })], "product_ab");
    const late = applyHouseStyle({ ...base2, text: [line("t1", 1.2, 3, "Which one would you take?", "opening")] }, [clip("a", 10), clip("b", 10)]);
    expect(late.edl.text[0].at).toBe(0);
    expect(late.changes.map((c) => c.rule)).toContain("opening");
    const none = applyHouseStyle(base2, [clip("a", 10), clip("b", 10)]);
    expect(none.edl.text).toEqual([]);
    expect(none.edl.notes.some((n) => /opening line/.test(n))).toBe(true);
    expect(none.changes).toEqual([]);
    // a one-take skit may open on a visual setup instead
    const skit = applyHouseStyle(edl([seg("s1", "a", 0, 8, { role: "opener" })], "one_take_skit"), [clip("a", 10)]);
    expect(skit.edl.notes).toEqual([]);
  });
});
