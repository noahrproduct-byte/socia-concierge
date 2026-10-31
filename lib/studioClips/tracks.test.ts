import { describe, it, expect } from "vitest";
import { moveSpan, resizeSpan, rulerTicks, tracksFor, MIN_TEXT_SEC } from "./tracks";
import type { Edl } from "./types";

const edl: Edl = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 10 }, segments: [{ id: "s1", clipId: "a", in: 1, out: 4, role: "opener", note: "" }, { id: "s2", clipId: "b", in: 0, out: 2.5, role: "body", note: "" }], text: [{ id: "t1", at: 0.5, end: 3, text: "Hook", role: "opening" }], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] };
const words = { a: [{ text: "hello", startMs: 1200, endMs: 1500, confidence: 1 }, { text: "there", startMs: 1600, endMs: 1900, confidence: 1 }, { text: "later", startMs: 3200, endMs: 3600, confidence: 1 }] } as never;

describe("the timeline's tracks", () => {
  it("places cuts end to end, text by its times, and merges close captions", () => {
    const t = tracksFor(edl, (id) => `Clip ${id}`, words, true);
    expect(t.duration).toBeCloseTo(5.5, 1);
    expect(t.video.map((v) => [v.start, v.end])).toEqual([[0, 3], [3, 5.5]]);
    expect(t.text[0]).toMatchObject({ start: 0.5, end: 3, label: "Hook" });
    expect(t.captions).toEqual([{ start: 0.2, end: 0.9 }, { start: 2.2, end: 2.6 }]);
    expect(tracksFor(edl, (id) => id, words, false).captions).toEqual([]);
  });
});

describe("dragging a text line", () => {
  it("moves it without changing its length, inside the video", () => {
    expect(moveSpan(1, 3, 10, 5.5)).toEqual({ at: 3.5, end: 5.5 });
    expect(moveSpan(1, 3, -5, 5.5)).toEqual({ at: 0, end: 2 });
  });
  it("resizes one end, never shorter than the minimum or past the edges", () => {
    expect(resizeSpan(1, 3, "start", 5, 5.5)).toEqual({ at: 3 - MIN_TEXT_SEC, end: 3 });
    expect(resizeSpan(1, 3, "end", 10, 5.5)).toEqual({ at: 1, end: 5.5 });
    expect(resizeSpan(1, 3, "end", -5, 5.5)).toEqual({ at: 1, end: 1 + MIN_TEXT_SEC });
  });
  it("labels the ruler at a sensible step", () => {
    expect(rulerTicks(5.5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rulerTicks(30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });
});
