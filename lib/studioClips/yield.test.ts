import { describe, it, expect } from "vitest";
import { validateYield, mergeRanges, yieldHeadline, evidenceLine, type ClipForYield, type ProposedGroup } from "./yield";
import type { ClipCard } from "./types";

const card = (over: Partial<ClipCard> = {}): ClipCard => ({
  subject: "pizza", setting: "kitchen", action: "stretching dough", people: "one",
  moments: [{ start: 0, end: 4, label: "cheese pull", strength: "strong", why: "" }, { start: 6, end: 9, label: "oven", strength: "good", why: "" }],
  speech: { present: false, summary: "", hookLine: null },
  quality: { visual: "ok", audio: "ok", notes: [] }, tags: ["pizza"], openerCandidate: true,
  model: "test", createdAt: "2026-10-05T00:00:00Z", ...over,
});

const clips: ClipForYield[] = [
  { id: "c1", position: 0, durationSec: 12, card: card() },
  { id: "c2", position: 1, durationSec: 10, card: card({ openerCandidate: false, moments: [{ start: 1, end: 8, label: "boxing", strength: "good", why: "" }] }) },
  { id: "c3", position: 2, durationSec: 15, card: card({ moments: [{ start: 0, end: 15, label: "shaky pan", strength: "weak", why: "" }], openerCandidate: false }) },
  { id: "c4", position: 3, durationSec: 20, card: card({ speech: { present: true, summary: "talks about catering", hookLine: "We fed 200 people" }, moments: [{ start: 0, end: 20, label: "talking", strength: "good", why: "" }] }) },
];

const pizza: ProposedGroup = {
  title: "Making a pepperoni pizza", angle: "Dough to oven.", clipIds: ["c1", "c2"],
  moments: [{ clipId: "c1", start: 0, end: 4 }, { clipId: "c1", start: 6, end: 9 }, { clipId: "c2", start: 1, end: 8 }],
  opener: { clipId: "c1", start: 0, end: 3, why: "cheese pull" }, cta: "Order tonight",
};

describe("validateYield", () => {
  it("accepts a post backed by enough distinct footage and computes its evidence", () => {
    const y = validateYield([pizza], clips);
    expect(y.opportunities).toHaveLength(1);
    const o = y.opportunities[0];
    expect(o.evidence).toEqual({ clips: 2, usableSec: 14, distinctMoments: 3, hasOpener: true, hasSpeech: false });
    expect(o.strength).toBe("possible"); // 14 s is under the 15 s "strong" bar
    expect(evidenceLine(o)).toBe("2 clips · 14 sec usable footage · strong opening · 3 distinct moments");
  });

  it("does not count footage the clip card rated weak", () => {
    const shaky: ProposedGroup = { title: "Behind the scenes", angle: "", clipIds: ["c3"], moments: [{ clipId: "c3", start: 0, end: 15 }], opener: null, cta: null };
    const y = validateYield([shaky], clips);
    expect(y.opportunities).toHaveLength(0);
    expect(y.rejected[0].reason).toMatch(/Only 0s of usable footage/);
  });

  it("gives a clip to one post only and explains the loss", () => {
    const again: ProposedGroup = { ...pizza, title: "Pizza again", clipIds: ["c1"], moments: [{ clipId: "c1", start: 0, end: 9 }] };
    const y = validateYield([pizza, again], clips);
    expect(y.opportunities).toHaveLength(1);
    expect(y.rejected[0]).toEqual({ title: "Pizza again", reason: "Its footage is already used by “Making a pepperoni pizza”." });
  });

  it("needs more than one moment", () => {
    const one: ProposedGroup = { title: "Catering", angle: "", clipIds: ["c4"], moments: [{ clipId: "c4", start: 0, end: 12 }], opener: null, cta: null };
    const y = validateYield([one], clips);
    expect(y.rejected[0].reason).toMatch(/One moment only/);
  });

  it("marks strong posts and puts them first; the headline counts them", () => {
    const talk: ProposedGroup = {
      title: "Catering story", angle: "", clipIds: ["c4"],
      moments: [{ clipId: "c4", start: 0, end: 6 }, { clipId: "c4", start: 8, end: 13 }, { clipId: "c4", start: 15, end: 20 }],
      opener: { clipId: "c4", start: 0, end: 3, why: "spoken hook" }, cta: null,
    };
    const y = validateYield([pizza, talk], clips);
    expect(y.opportunities.map((o) => [o.title, o.strength, o.idx])).toEqual([["Catering story", "strong", 0], ["Making a pepperoni pizza", "possible", 1]]);
    expect(y.opportunities[0].evidence.hasSpeech).toBe(true);
    expect(yieldHeadline({ ...y, clipsAnalyzed: 4 })).toBe("You uploaded 4 clips. SOCIA found 1 strong post and 1 possible post you can make.");
    expect(yieldHeadline({ opportunities: [], clipsAnalyzed: 20 })).toMatch(/didn't find enough distinct footage/);
  });

  it("merges overlapping ranges", () => {
    expect(mergeRanges([{ start: 0, end: 2 }, { start: 1.5, end: 4 }, { start: 4.1, end: 5 }, { start: 8, end: 9 }])).toEqual([{ start: 0, end: 5 }, { start: 8, end: 9 }]);
  });
});
