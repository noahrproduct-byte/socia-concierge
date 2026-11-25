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

describe("voices and script changes", () => {
  it("offers four voices that sound different, one per style, never the same voice twice", async () => {
    const { featuredVoices, voiceStyle } = await import("@/lib/studioClips/voiceover");
    const v = (id: string, d: string) => ({ id, name: id, description: d, preview: null });
    const all = [v("Liam", "energetic, young, social media"), v("Brian", "deep, resonant, narration"), v("Sarah", "friendly, conversational, warm"), v("Bill", "confident, authoritative, professional"), v("Joe", "calm, soothing")];
    const f = featuredVoices(all);
    expect(f.map((x) => [x.id, x.style])).toEqual([["Liam", "Energetic and engaging"], ["Brian", "Calm and cinematic"], ["Sarah", "Natural and conversational"], ["Bill", "Bold and confident"]]);
    expect(voiceStyle(v("x", "nothing that matches"))).toBeNull();
  });
  it("knows the one-change requests and nothing else", async () => {
    const { isScriptChange, SCRIPT_CHANGES } = await import("./improve");
    expect(Object.keys(SCRIPT_CHANGES)).toEqual(["shorter", "engaging", "hook", "natural", "cinematic", "less_promo", "again"]);
    expect(isScriptChange("hook")).toBe(true);
    expect(isScriptChange("make it viral")).toBe(false);
  });
});
