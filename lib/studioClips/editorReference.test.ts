import { describe, it, expect } from "vitest";
import { referenceOf, sourceOfLink, sourceOfRef } from "./referenceSource";
import { adaptationPrompt, adaptationText, cleanAdaptation } from "../discoverAdapt";
import { reelEditorPrompt } from "../reelBrief";
import { ideaEditorText, ideaText } from "../ideas/videoIdeas";
import type { ProvenReel, ReelRef } from "../trendSignals";

const URL_RE = /https?:\/\/|instagram\.com/i;

const reel: ProvenReel = {
  url: "https://www.instagram.com/reel/DAbc123xyz/", platform: "instagram", accountName: "Fashion House", accountHandle: "fashionhouse", accountAvatar: null,
  title: "Three outfits for three moods", thumb: null, publishedAt: "2026-11-20T00:00:00Z", views: 412000, likes: 9000, comments: 300, multiplier: 9.4, basis: "views", format: "Reel",
  id: "R1", proven: true, line: "Three outfits for three moods", structures: ["Listicle hook"], topics: ["Fashion"],
} as ProvenReel;

describe("the Video editor's prompt stays clean", () => {
  it("Make a video like this: creative instructions only, no link, account or numbers", () => {
    const p = reelEditorPrompt(reel);
    expect(p).not.toMatch(URL_RE);
    expect(p).not.toContain("fashionhouse");
    expect(p).not.toContain("412");
    expect(p).toContain("Hook: Listicle");
    expect(p).toContain("reference video");
  });
  it("Make this video (an adaptation): no link or account", () => {
    const a = cleanAdaptation({ concept: "Three pizzas for three moods", hook: "Your mood picks your pizza", keeps: "x", steps: ["Phone on a stand", "Film each pizza"], shots: ["Top down"], editing: "Cut on the beat", onScreenText: ["Tired"], cta: "Which one?", durationSec: 15, why: "Variety" }, new Date())!;
    expect(adaptationPrompt(a)).not.toMatch(URL_RE);
    expect(adaptationPrompt(a)).toContain("Opening: \"Your mood picks your pizza\"");
    expect(adaptationText(a, reel)).toContain(reel.url);
  });
  it("a video idea: no link to the Reel it's built on", () => {
    const ref: ReelRef = { url: reel.url, platform: "instagram", account: "@fashionhouse", title: "Three outfits", views: 412000, likes: null, comments: null, multiplier: 9.4, basis: "views", structure: "Listicle hook" };
    const idea = { id: "i1", title: "Three pizzas", style: "in_person", treatment: "demo", evidence: "promising", premise: "Three moods", themeFit: "", lengthSec: 15, sound: { kind: "original", feel: "" }, shots: [{ from: 0, to: 5, onCamera: "Top down", onScreenText: "Tired", say: "" }], script: "", caption: "c", needs: "", ref } as never;
    expect(ideaEditorText(idea)).not.toMatch(URL_RE);
    expect(ideaText(idea)).toContain(reel.url);
  });
});

describe("the Reel goes as the structured reference", () => {
  it("from a plan post or idea Reel", () => {
    const ref: ReelRef = { url: "https://www.instagram.com/reel/DAbc123xyz/?igsh=1", platform: "instagram", account: "@fashionhouse", title: "Three outfits", views: 412000, likes: null, comments: null, multiplier: 9.4, basis: "views", structure: "Listicle hook", thumb: "https://scontent.cdninstagram.com/c.jpg" };
    expect(referenceOf(sourceOfRef(ref))).toEqual({
      url: null, name: "@fashionhouse Reel.mp4",
      reel: { link: "https://www.instagram.com/reel/DAbc123xyz/", code: "DAbc123xyz", handle: "fashionhouse", account: "@fashionhouse", thumb: ref.thumb, caption: "Three outfits", format: "Reel", views: 412000, multiplier: 9.4, structure: "Listicle hook" },
    });
    expect(sourceOfRef({ ...ref, url: "https://www.youtube.com/shorts/abc" })).toBeNull();
    expect(referenceOf(null)).toBeNull();
  });
  it("from a Reel chosen in Ask SOCIA", () => {
    expect(sourceOfLink("https://www.instagram.com/reel/DAbc123xyz/", "@fashionhouse", "Three outfits")).toMatchObject({ code: "DAbc123xyz", handle: "fashionhouse", caption: "Three outfits" });
    expect(sourceOfLink("https://www.tiktok.com/@x/video/1", "x")).toBeNull();
  });
});

describe("a studied reference never breaks the creative direction", () => {
  it("leaves no setting undefined, whatever its pace", async () => {
    const { recommend, creativeSummary, DEFAULT_CREATIVE } = await import("./creative");
    for (const cuts of [[], [2, 4], [1, 2, 3, 4, 5, 6, 7]]) {
      const rec = recommend({ prompt: "Three pizzas for three moods", style: null, reference: { durationSec: 8, cuts, speech: false }, clips: null } as never);
      expect(Object.values(rec.creative).every((v) => v !== undefined)).toBe(true);
      expect(() => creativeSummary({ ...DEFAULT_CREATIVE, ...rec.creative }, "Clean")).not.toThrow();
    }
  });
});
