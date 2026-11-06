import { describe, expect, it } from "vitest";
import { clipLines, ENHANCE_SYSTEM, sanitizeEnhanced } from "./enhancePrompt";
import type { ClipCard } from "./types";

const card = (over: Partial<ClipCard> = {}): ClipCard => ({
  subject: "double crust pizza", setting: "kitchen counter", action: "hands press the top crust on",
  people: "one",
  moments: [
    { start: 4, end: 7, label: "cheese pull", strength: "strong", why: "" },
    { start: 9, end: 10, label: "blurry pan", strength: "weak", why: "" },
  ],
  speech: { present: false, summary: "", hookLine: null },
  quality: { visual: "ok", audio: "ok", notes: [] }, tags: [], openerCandidate: true, model: "x", createdAt: "2026-11-05T00:00:00Z",
  ...over,
});

describe("clipLines", () => {
  it("describes understood clips by number, with their usable moments", () => {
    const lines = clipLines([{ position: 2, duration_s: 12.4, card: card() }]);
    expect(lines).toContain("Clip 3 (12s): double crust pizza");
    expect(lines).toContain("0:04-0:07 cheese pull (strong)");
    expect(lines).not.toContain("blurry pan");
    expect(lines).toContain("no speech");
    expect(lines).toContain("Could open a post.");
  });
  it("quotes a spoken hook", () => {
    const c = card({ speech: { present: true, summary: "talks about the crust", hookLine: "Nobody in Nashville does this" } });
    expect(clipLines([{ position: 0, duration_s: 5, card: c }])).toContain("says “Nobody in Nashville does this”");
  });
  it("counts clips it hasn't looked at, and never describes them", () => {
    expect(clipLines([{ position: 0, duration_s: 5, card: card() }, { position: 1, duration_s: 5, card: null }])).toContain("1 more clip SOCIA hasn't looked at yet");
    expect(clipLines([])).toBe("No clips described yet.");
  });
});

describe("sanitizeEnhanced", () => {
  it("keeps the brief, drops em dashes and headings, bounds the list", () => {
    const out = sanitizeEnhanced({ prompt: "## Brief\n20 seconds — open on Clip 3, the cheese pull.", added: ["a length", "", "an opening", "a", "b", "c", "d"] })!;
    expect(out.prompt).toBe("Brief\n20 seconds, open on Clip 3, the cheese pull.");
    expect(out.added).toEqual(["a length", "an opening", "a", "b", "c"]);
  });
  it("refuses an empty answer", () => {
    expect(sanitizeEnhanced({ prompt: "ok", added: [] })).toBeNull();
    expect(sanitizeEnhanced(null)).toBeNull();
  });
});

describe("ENHANCE_SYSTEM", () => {
  it("forbids invented shots and facts, and keeps the person's idea", () => {
    expect(ENHANCE_SYSTEM).toMatch(/Use only the footage listed/);
    expect(ENHANCE_SYSTEM).toMatch(/Never invent facts/);
    expect(ENHANCE_SYSTEM).toMatch(/never change the idea/);
    expect(ENHANCE_SYSTEM).toMatch(/big ending of its own/);
    expect(ENHANCE_SYSTEM).toMatch(/throwaway speech/);
    expect(ENHANCE_SYSTEM).not.toMatch(/—/);
  });
});
