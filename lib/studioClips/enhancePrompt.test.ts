import { describe, expect, it } from "vitest";
import { clipLines, ENHANCE_SYSTEM, sanitizeEnhanced, shouldAutoImprove, stripMeta } from "./enhancePrompt";
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
    expect(clipLines([{ position: 0, duration_s: 5, card: card() }, { position: 1, duration_s: 5, card: null }])).toContain("1 more clip with no description yet");
    // The note to the model never names SOCIA: it used to be copied into the person's prompt.
    expect(clipLines([{ position: 0, duration_s: 5, card: null }])).toBe("- 1 clip with no description yet (not seen).");
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
    expect(ENHANCE_SYSTEM).toMatch(/added afterwards as an ending/);
    expect(ENHANCE_SYSTEM).toMatch(/throwaway speech/);
    expect(ENHANCE_SYSTEM).not.toMatch(/—/);
  });
});

describe("improving every prompt before the cut", () => {
  it("improves what the person wrote", () => {
    expect(shouldAutoImprove({ prompt: "make this post ready with music" })).toBe(true);
  });
  it("never improves an empty or one-word prompt", () => {
    expect(shouldAutoImprove({ prompt: "  " })).toBe(false);
    expect(shouldAutoImprove({ prompt: "ok" })).toBe(false);
  });
  it("doesn't improve SOCIA's own improved words again", () => {
    expect(shouldAutoImprove({ prompt: "A 15 second cut.", improvedText: "A 15 second cut. " })).toBe(false);
  });
  it("keeps the person's words after they chose them, until they write something else", () => {
    expect(shouldAutoImprove({ prompt: "my words", ownWords: "my words" })).toBe(false);
    expect(shouldAutoImprove({ prompt: "my new words", ownWords: "my words" })).toBe(true);
  });
});

describe("SOCIA's notes to itself stay out of the prompt (Noah's screenshot, 2026-11-27)", () => {
  const leaked = "Make a 15 to 20 second reel from the one clip, which SOCIA hasn't looked at yet, so don't name specific shots. Open on the most appetizing moment of action in the clip, already in motion, never a slow wide shot. End on the clearest shot of the food. The place, the ask and the website go in SOCIA's ending, so leave them off the on-screen text.";
  it("takes the notes out and keeps the brief", () => {
    expect(stripMeta(leaked)).toBe("Make a 15 to 20 second reel from the one clip. Open on the most appetizing moment of action in the clip, already in motion, never a slow wide shot. End on the clearest shot of the food.");
    expect(sanitizeEnhanced({ prompt: leaked, added: [] })!.prompt).not.toMatch(/SOCIA|specific shots/);
  });
  it("leaves a brief whose subject is SOCIA alone", () => {
    const own = "Open on the SOCIA dashboard loading. Show SOCIA's weekly plan next, then the calendar. End on the logo.";
    expect(stripMeta(own)).toBe(own);
  });
  it("tells the model not to explain itself or guess at footage it has not seen", () => {
    expect(ENHANCE_SYSTEM).toMatch(/never for the brief/);
    expect(ENHANCE_SYSTEM).toMatch(/you have not seen it/);
  });
});
