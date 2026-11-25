import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/anthropic", () => ({ anthropic: {}, effortFor: () => ({}), modelFor: () => "m" }));
vi.mock("@/lib/aiUsage", () => ({ recordAiUsage: () => undefined }));
vi.mock("@/lib/brandKnowledgeLoad", () => ({ readSite: async () => ({ ok: false, reason: "unreadable" }) }));
import { cleanImproved, wordsFor } from "./improve";
import { sanitizeVoiceAsk } from "@/lib/studioClips/types";
import { secondsFromPrompt } from "@/lib/studioClips/voiceover";

describe("voiceover auto improve", () => {
  it("keeps only the four fields, bounded, with dashes turned into commas", () => {
    const c = cleanImproved({ script: "Need catering? Call us — we deliver.", facts: [{ fact: "We deliver", from: "your notes" }, { nope: 1 }], missing: ["catering phone number"], questions: ["What number should people call?"] });
    expect(c.script).toBe("Need catering? Call us, we deliver.");
    expect(c.facts).toEqual([{ fact: "We deliver", from: "your notes" }]);
    expect(c.missing).toEqual(["catering phone number"]);
    expect(cleanImproved(null)).toEqual({ script: "", facts: [], missing: [], questions: [] });
  });
  it("sizes the script to the video", () => {
    expect(wordsFor(30)).toBe(78);
    expect(secondsFromPrompt("make a 20 second reel")).toBe(20);
    expect(secondsFromPrompt("a 45s video")).toBe(45);
    expect(secondsFromPrompt("make it smooth")).toBe(30);
  });
  it("carries the chosen voice and the approval into the brief, and nothing else", () => {
    expect(sanitizeVoiceAsk({ on: true, notes: "Call 615-555-0100", voiceId: "21m00Tcm4TlvDq8ikWAM", approved: true })).toEqual({ on: true, notes: "Call 615-555-0100", voiceId: "21m00Tcm4TlvDq8ikWAM", approved: true });
    expect(sanitizeVoiceAsk({ on: true, notes: "", approved: true })).toEqual({ on: true, notes: null });
    expect(sanitizeVoiceAsk({ on: true, notes: "x", voiceId: "bad id!" })).toEqual({ on: true, notes: "x" });
  });
});
