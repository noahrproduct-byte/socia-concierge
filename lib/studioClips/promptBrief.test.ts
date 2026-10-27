import { describe, it, expect } from "vitest";
import { cleanPrompt, nextPromptIdx, opportunityFromPrompt, titleFromPrompt } from "./promptBrief";
import type { ClipCard } from "./types";

const card = (over: Partial<ClipCard> = {}): ClipCard => ({
  subject: "latte", setting: "counter", action: "pour", people: "one",
  moments: [{ start: 1, end: 4, label: "pour", strength: "strong", why: "" }, { start: 6, end: 7, label: "shaky", strength: "weak", why: "" }],
  speech: { present: false, summary: "", hookLine: null }, quality: { visual: "ok", audio: "ok", notes: [] }, tags: ["coffee"], openerCandidate: false,
  model: "t", createdAt: "2026-10-27T00:00:00Z", ...over,
});

describe("titleFromPrompt", () => {
  it("takes the first sentence and shortens long ones", () => {
    expect(titleFromPrompt("Make a fast 15 second reel of the pour. Then show the room.")).toBe("Make a fast 15 second reel of the pour");
    expect(titleFromPrompt("x".repeat(100)).length).toBeLessThanOrEqual(70);
    expect(titleFromPrompt("   ")).toBe("Video from your brief");
  });
});

describe("cleanPrompt", () => {
  it("bounds and rejects briefs that are too short", () => {
    expect(cleanPrompt("hi")).toBeNull();
    expect(cleanPrompt(42)).toBeNull();
    expect(cleanPrompt("  A reel of the morning pour, upbeat.  ")).toBe("A reel of the morning pour, upbeat.");
    expect(cleanPrompt("a".repeat(5000))!.length).toBe(2000);
  });
});

describe("opportunityFromPrompt", () => {
  it("offers only non-weak moments of understood clips and picks an opener candidate", () => {
    const o = opportunityFromPrompt("A reel of the morning pour", [
      { id: "a", position: 0, durationSec: 10, card: card() },
      { id: "b", position: 1, durationSec: 10, card: card({ openerCandidate: true, speech: { present: true, summary: "intro", hookLine: "Nobody tells you this" } }) },
      { id: "c", position: 2, durationSec: 10, card: null },
    ]);
    expect(o.idx).toBe(-1);
    expect(o.clipIds).toEqual(["a", "b"]);
    expect(o.moments).toHaveLength(2);
    expect(o.opener?.clipId).toBe("b");
    expect(o.opener?.why).toContain("Nobody tells you this");
    expect(o.evidence).toMatchObject({ clips: 2, distinctMoments: 2, hasOpener: true, hasSpeech: true, usableSec: 6 });
    expect(o.strength).toBe("possible");
  });

  it("has no opener and no clips when nothing is understood", () => {
    const o = opportunityFromPrompt("Anything", [{ id: "c", position: 0, durationSec: 10, card: null }], -3);
    expect(o).toMatchObject({ idx: -3, clipIds: [], opener: null, strength: "possible" });
  });
});

describe("nextPromptIdx", () => {
  it("counts down from -1 and ignores yield builds", () => {
    expect(nextPromptIdx([])).toBe(-1);
    expect(nextPromptIdx([0, 2])).toBe(-1);
    expect(nextPromptIdx([0, -1, -2])).toBe(-3);
  });
});
