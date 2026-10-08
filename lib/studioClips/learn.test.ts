import { describe, it, expect } from "vitest";
import { cutFeatures, learnedBlock, studioLessons, type StudioOutcome, type CutFeatures } from "./learn";
import type { Edl } from "./types";

const f = (over: Partial<CutFeatures> = {}): CutFeatures => ({ lengthSec: 15, cuts: 3, openingText: true, captions: true, look: "off", sound: false, pausesCut: false, cta: true, ...over });
const o = (title: string, mult: number | null, over: Partial<CutFeatures> = {}, extra: { early?: boolean; measured?: boolean; published?: boolean } = {}): StudioOutcome => ({
  buildId: title, projectId: "p", opportunityIdx: 0, projectTitle: "Project", title, postId: `post-${title}`, status: extra.published === false ? "draft" : "published", features: f(over),
  result: extra.published === false ? null : { short: mult == null ? "measuring" : `${mult}× your median`, text: "", multiplier: mult, early: Boolean(extra.early), measured: extra.measured ?? true, platform: "Instagram" },
});

describe("what a cut is made of", () => {
  it("reads the features from the EDL", () => {
    const edl: Edl = {
      version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 },
      segments: [{ id: "s1", clipId: "a", in: 0, out: 8, role: "opener", note: "" }, { id: "s2", clipId: "b", in: 2, out: 9, role: "body", note: "" }],
      text: [{ id: "t", at: 0, end: 2, text: "Hi", role: "opening" }], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      finish: { look: "match", grades: {}, sound: true, sounds: {}, pausesCut: { count: 1, seconds: 1 }, measuredAt: "2026-10-07T00:00:00Z" },
    };
    expect(cutFeatures(edl)).toEqual({ lengthSec: 15, cuts: 2, openingText: true, captions: true, look: "match", sound: true, pausesCut: true, cta: false });
  });
});

describe("lessons from Studio posts", () => {
  it("draws nothing before three results have settled, and says why", () => {
    const l = studioLessons([o("a", 2), o("b", null, {}, { measured: false }), o("c", 1.5, {}, { early: true }), o("d", null, {}, { published: false })]);
    expect(l.lessons).toEqual([]);
    expect(l.summary).toBe("3 Studio posts published, 1 with settled results. SOCIA draws lessons once 3 have settled.");
    expect(l.best?.title).toBe("a");
  });

  it("compares only when both sides have two posts and the gap is real", () => {
    const l = studioLessons([
      o("short1", 2.0, { lengthSec: 14 }), o("short2", 1.8, { lengthSec: 18 }), o("short3", 1.6, { lengthSec: 12 }),
      o("long1", 0.9, { lengthSec: 28 }), o("long2", 0.8, { lengthSec: 35 }),
    ]);
    expect(l.lessons).toEqual(["Your cuts under 20 s have done 1.8× your median (3 posts), against 0.9× for cuts of 20 s or more (2 posts)."]);
    expect(l.summary).toMatch(/5 Studio posts with settled results \(a small sample/);
  });

  it("stays quiet when the groups are too close or one side is a single post", () => {
    const l = studioLessons([o("a", 1.1, { captions: false }), o("b", 1.0), o("c", 1.05), o("d", 0.95)]);
    expect(l.lessons).toEqual([]);
  });

  it("gives the prompt the measured posts and patterns, or nothing", () => {
    expect(learnedBlock([o("x", null, {}, { published: false })])).toBeNull();
    const block = learnedBlock([o("Oven reel", 2.1), o("b", 1.2), o("c", 0.7)])!;
    expect(block).toMatch(/^Posts this account made with Content Studio, measured against its own median \(only 3 posts: treat as hints, not rules\):/);
    expect(block).toContain(`- "Oven reel": 2.1× your median on Instagram (15 s, 3 cuts, captions on, opening line yes)`);
  });
});
