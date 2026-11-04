import { describe, expect, it } from "vitest";
import { bestMomentFor, clipScore, rankClips, whyPost, type RatedClip } from "./rank";
import type { ClipCard, ClipFacts, Opportunity } from "./types";

const facts = (over: { brightness?: "dark" | "ok" | "bright"; level?: "ok" | "quiet" | "loud" | "silent"; cuts?: number[]; clipped?: boolean }): ClipFacts => ({
  method: "mediabunny",
  visual: { sampled: [], sceneCuts: over.cuts ?? [], medianLuma: 0.5, brightness: over.brightness ?? "ok", contrast: "ok", warmth: "neutral", clippedHighlights: Boolean(over.clipped), crushedShadows: false },
  audio: { hasAudio: over.level !== "silent", rmsDb: -20, peakDb: -4, audibleRatio: 0.8, silences: [], level: over.level ?? "ok" },
});
const card = (over: Partial<ClipCard>): ClipCard => ({ subject: "", setting: "", action: "", people: "one", moments: [{ start: 0, end: 4, label: "the pour", strength: "good", why: "clear action" }], speech: { present: false, summary: "", hookLine: null }, quality: { visual: "ok", audio: "ok", notes: [] }, tags: [], openerCandidate: false, model: "t", createdAt: "", ...over });
const clip = (id: string, position: number, c: ClipCard | null, f: ClipFacts | null): RatedClip => ({ id, position, durationSec: 10, card: c, facts: f });

describe("a clip's score", () => {
  it("rewards a spoken hook, good light, a steady picture and clean sound, and says so", () => {
    const s = clipScore(clip("a", 0, card({ openerCandidate: true, speech: { present: true, summary: "", hookLine: "Wait for it" } }), facts({})));
    expect(s.score).toBe(100);
    expect(s.label).toBe("Strong clip");
    expect(s.reason).toBe("A spoken hook: “Wait for it”, well lit, a steady picture and clean sound.");
  });
  it("names what is wrong, and leaves out what wasn't measured", () => {
    const s = clipScore(clip("b", 1, card({}), facts({ brightness: "dark", level: "quiet", cuts: [1, 2, 3, 4, 5, 6] })));
    expect(s.score).toBeLessThan(60);
    expect(s.reason).toMatch(/, dark, the picture jumps around and quiet sound\.$/);
    const partial = clipScore(clip("c", 2, card({}), null));
    expect(partial.parts.filter((p) => p.value == null).map((p) => p.id)).toEqual(["light", "steady", "sound"]);
    expect(partial.score).toBe(40);
    expect(clipScore(clip("d", 3, null, null)).score).toBeNull();
  });
  it("is the same number every time and orders clips best first, ties by upload order", () => {
    const a = clip("a", 1, card({ openerCandidate: true }), facts({}));
    const b = clip("b", 0, card({}), facts({ brightness: "dark" }));
    const c = clip("c", 2, card({ openerCandidate: true }), facts({}));
    expect(clipScore(a)).toEqual(clipScore(a));
    expect(rankClips([b, c, a]).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});

describe("picking a moment and explaining a post", () => {
  it("takes the strongest, then the longest moment, capped, with a reason", () => {
    const m = bestMomentFor({ position: 0, durationSec: 20, moments: [{ start: 0, end: 3, label: "pan", strength: "weak", why: "" }, { start: 4, end: 12, label: "the pour", strength: "strong", why: "the glass fills" }, { start: 12, end: 20, label: "wide", strength: "strong", why: "" }] });
    expect(m).toEqual({ start: 4, end: 10, why: "Clip 1's strong moment “the pour”: the glass fills." });
    expect(bestMomentFor({ position: 1, durationSec: 3, moments: [] })).toEqual({ start: 0, end: 3, why: "Clip 2 has no rated moment, so its first 3 seconds go in." });
  });
  it("says why a post was picked in one sentence", () => {
    const o: Opportunity = { idx: 0, title: "t", angle: "", clipIds: ["a", "b"], moments: [], opener: { clipId: "a", start: 0, end: 2, why: "a hook line is spoken early" }, cta: null, evidence: { clips: 2, usableSec: 11, distinctMoments: 3, hasOpener: true, hasSpeech: true }, strength: "strong" };
    expect(whyPost(o)).toBe("A strong post because it opens on a hook line is spoken early, 11s of usable footage across 2 clips, 3 distinct moments and speech to caption.");
    expect(whyPost({ ...o, strength: "possible", opener: null, evidence: { ...o.evidence, hasOpener: false, hasSpeech: false, clips: 1 } })).toBe("Possible because 11s of usable footage across 1 clip and 3 distinct moments.");
  });
});
