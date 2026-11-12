import { describe, expect, it } from "vitest";
import { CARD_DETAIL, cardIsCurrent, cleanEndCard, editFrames, endLineSize, ENDING_MIN_SEC, joinContinuous, QUIET_ROOM_VOLUME, siteName, teachEdit } from "./teach";
import { denseKeyframes } from "./facts";
import { revalidateEdl, type ClipForEdl } from "./edl";
import type { Edl } from "./types";

const seg = (id: string, a: number, b: number, more: Partial<Edl["segments"][number]> = {}) => ({ id, clipId: "c", in: a, out: b, role: "body" as const, note: "", ...more });
const edl = (over: Partial<Edl> = {}): Edl => ({
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 10, max: 20 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  segments: [seg("s1", 1, 5.8), seg("s2", 12.4, 13.6, { sound: true, transition: "fade" }), seg("s3", 33, 34.9, { transition: "fade" })],
  ...over,
});
const clips = [{ id: "c", durationSec: 35, words: null }];
const brand = { location: "Hermitage, TN", website: "https://www.salvopizza.com/menu" };

describe("what a clip gets looked at with", () => {
  it("keeps a frame about every 1.5 seconds of a long take, not one a scene", () => {
    const t = denseKeyframes(35, [], 1.5);
    expect(t.length).toBeGreaterThanOrEqual(20);
    expect(t.length).toBeLessThanOrEqual(24);
    const gaps = t.slice(1).map((x, i) => x - t[i]);
    expect(Math.max(...gaps)).toBeLessThan(3.2);
  });
  it("still gives a short clip a few frames, and a long one no more than the cap", () => {
    expect(denseKeyframes(2, [], 1.5).length).toBeGreaterThanOrEqual(2);
    expect(denseKeyframes(600, [10, 200], 1.5).length).toBe(24);
    expect(denseKeyframes(35, [], 1.5)).toEqual([...denseKeyframes(35, [], 1.5)].sort((a, b) => a - b));
  });
  it("shows the editor frames across a clip, and at least one of every clip", () => {
    const frames = Array.from({ length: 24 }, (_, i) => ({ t: i * 1.5 }));
    const one = editFrames([{ id: "a", frames }]);
    expect(one[0].frames.length).toBe(24);
    const two = editFrames([{ id: "a", frames }, { id: "b", frames: [{ t: 1 }] }], 24);
    expect(two[0].frames.length).toBe(12);
    expect(two[0].frames[11].t).toBeGreaterThan(30);
    expect(two[1].frames.length).toBe(1);
    const many = editFrames(Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, frames }))); 
    expect(many.every((c) => c.frames.length === 1)).toBe(true);
  });
  it("reads old coarse cards again, and keeps current ones", () => {
    expect(cardIsCurrent(null)).toBe(false);
    expect(cardIsCurrent({ detail: undefined })).toBe(false);
    expect(cardIsCurrent({ detail: CARD_DETAIL })).toBe(true);
  });
});

describe("the ending card", () => {
  it("takes the website from the brand settings, never the model", () => {
    const out = teachEdit(edl(), brand, clips, { location: "Nashville, Tennessee", cta: "ORDER NOW", site: "evil.example" } as never);
    expect(out.endCard).toEqual({ location: "Nashville, Tennessee", cta: "ORDER NOW", site: "salvopizza.com" });
  });
  it("names no place when the brand has none", () => {
    const out = teachEdit(edl(), { location: null, website: null }, clips, { location: "Nashville, Tennessee", cta: "ORDER NOW" });
    expect(out.endCard).toEqual({ location: "", cta: "ORDER NOW", site: "" });
  });
  it("has no card when there's no place and no ask, even with a website", () => {
    expect(teachEdit(edl(), { location: null, website: "salvopizza.com" }, clips, { location: "", cta: "" }).endCard).toBeUndefined();
    expect(teachEdit(edl(), brand, clips, null).endCard).toBeUndefined();
  });
  it("gives the last shot room, drops a typed ask and stops other text before the card", () => {
    const out = teachEdit(edl({
      segments: [seg("s1", 1, 5), seg("s2", 33, 34, { transition: "fade" })],
      text: [{ id: "t1", at: 0, end: 40, text: "when it comes out", role: "opening" }, { id: "t2", at: 4, end: 6, text: "order now", role: "cta" }],
    }), brand, clips, { location: "Nashville, Tennessee", cta: "ORDER NOW" });
    const last = out.segments[out.segments.length - 1];
    // The last shot starts earlier rather than running past where it was chosen to end (2026-11-12).
    expect(last.out).toBe(34);
    expect(last.out - last.in).toBeCloseTo(ENDING_MIN_SEC, 1);
    expect(out.text.map((t) => t.text)).toEqual(["when it comes out"]);
    expect(out.text[0].end).toBeLessThan(5);
  });
  it("is bounded, and survives the person's edits, and empty means none", () => {
    expect(cleanEndCard({ location: "  x  ", cta: "y".repeat(90), site: "" })).toEqual({ location: "x", cta: "y".repeat(24), site: "" });
    expect(cleanEndCard({ location: " ", cta: "", site: "" })).toBeNull();
    const clip: ClipForEdl = { id: "c", position: 0, durationSec: 35, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false };
    const kept = revalidateEdl(edl({ endCard: { location: "Nashville", cta: "ORDER NOW", site: "a.com" }, actionSound: true }), [clip]).edl;
    expect(kept.endCard?.cta).toBe("ORDER NOW");
    expect(kept.actionSound).toBe(true);
    expect(kept.segments[1].sound).toBe(true);
    expect(revalidateEdl(edl(), [clip]).edl.endCard).toBeUndefined();
  });
  it("reads a website the way people say it", () => {
    expect(siteName("https://www.salvopizza.com/menu?x=1")).toBe("salvopizza.com");
    expect(siteName("salvopizza.com")).toBe("salvopizza.com");
    expect(siteName("not a site")).toBe("");
    expect(siteName(null)).toBe("");
  });
  it("sizes long lines to fit the frame", () => {
    expect(endLineSize("ORDER NOW", 330, 1080)).toBeLessThanOrEqual(330);
    const long = endLineSize("NASHVILLE, TENNESSEE", 168, 1080);
    expect(long * 20 * 0.46).toBeLessThanOrEqual(1080 * 0.83);
    expect(endLineSize("ORDER NOW", 330, 540)).toBeLessThanOrEqual(165);
  });
});

describe("the action's own sound", () => {
  it("goes up front with the room low everywhere else when no one is talking", () => {
    const out = teachEdit(edl(), brand, clips, null);
    expect(out.actionSound).toBe(true);
    expect(out.segments.map((s) => s.volume)).toEqual([QUIET_ROOM_VOLUME, undefined, QUIET_ROOM_VOLUME]);
  });
  it("stays off when someone is really talking, or nothing was marked", () => {
    const words = Array.from({ length: 20 }, (_, i) => ({ startMs: 1000 + i * 200 }));
    const out = teachEdit(edl(), brand, [{ id: "c", durationSec: 35, words }], null);
    expect(out.actionSound).toBeUndefined();
    expect(out.segments.every((s) => s.sound === undefined && s.volume === undefined)).toBe(true);
    expect(teachEdit(edl({ segments: [seg("s1", 1, 5)] }), brand, clips, null).actionSound).toBeUndefined();
  });
});

describe("one continuous stretch stays one shot", () => {
  it("joins the near-touching pieces of a single take Noah called not smooth", () => {
    const made = [[2, 4.5], [4.7, 6.1], [6.2, 8.4], [8.8, 12.4], [12.7, 14.5], [15, 16.8], [19.8, 21], [21.2, 22.4], [22.6, 25]]
      .map(([a, b], i) => seg(`s${i + 1}`, a, b, i ? { transition: "fade" } : {}));
    const out = joinContinuous(made);
    expect(out.map((s) => [s.in, s.out])).toEqual([[2, 16.8], [19.8, 25]]);
  });
  it("keeps shots that are really apart, and dissolves only there", () => {
    const out = teachEdit(edl({ segments: [seg("s1", 1, 5.8), seg("s2", 12.4, 13.6, { transition: "fade" }), seg("s3", 14.5, 15.7, { transition: "fade" }), seg("s4", 16, 17, { transition: "fade" })] }), brand, clips, null);
    expect(out.segments.map((s) => [s.in, s.out, s.transition])).toEqual([[1, 5.8, undefined], [12.4, 13.6, "fade"], [14.5, 17, "fade"]]);
    expect(out.segments.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
  it("never lets the footage run backwards between two shots", () => {
    expect(joinContinuous([seg("a", 3, 6), seg("b", 5.5, 8)]).map((s) => [s.in, s.out])).toEqual([[3, 8]]);
  });
  it("keeps the action's sound up for the whole joined shot, without a flip in the middle", () => {
    const out = joinContinuous([seg("a", 1, 3, { volume: 0.08 }), seg("b", 3.2, 5, { sound: true })]);
    expect(out).toHaveLength(1);
    expect(out[0].sound).toBe(true);
    expect(out[0].volume).toBeUndefined();
  });
  it("leaves different clips alone, however close their times", () => {
    const out = joinContinuous([seg("a", 1, 3), { ...seg("b", 3.1, 5), clipId: "other" }]);
    expect(out).toHaveLength(2);
  });
});
