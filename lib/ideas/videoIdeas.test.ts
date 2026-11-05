import { describe, expect, it } from "vitest";
import { cleanIdeas, ideaText, sanitizeIdeaSet, type VideoIdea } from "./videoIdeas";

const shot = (from: number, to: number, extra: Record<string, unknown> = {}) => ({ from, to, onCamera: `shot at ${from}`, onScreenText: "", say: "", ...extra });
const raw = (over: Record<string, unknown> = {}) => ({
  title: "Morning dough", style: "in_person", premise: "Show the dough going in at 6 AM.", themeFit: "Your kitchen Reels did best.", lengthSec: 15,
  sound: { kind: "original", feel: "kitchen sounds" }, shots: [shot(0, 4), shot(4, 9), shot(9, 15)], script: "", caption: "Every morning.", needs: "Phone, 10 minutes.", ...over,
});
let n = 0;
const ids = () => `x${n++}`;

describe("video ideas", () => {
  it("keeps only the styles the person picked", () => {
    const out = cleanIdeas({ ideas: [raw(), raw({ title: "Talk", style: "face" }), raw({ title: "Anim", style: "animation" })] }, ["in_person", "animation"], ids);
    expect(out.map((i) => i.style)).toEqual(["in_person", "animation"]);
  });

  it("puts shots in order inside the length, the last one running to the end", () => {
    const [i] = cleanIdeas({ ideas: [raw({ lengthSec: 12, shots: [shot(5, 8), shot(0, 6), shot(10, 30), shot(14, 16)] })] }, ["in_person"], ids);
    expect(i.shots.map((s) => [s.from, s.to])).toEqual([[0, 5], [5, 8], [10, 12]]);
  });

  it("writes on-screen text the way a person would, or not at all", () => {
    const [i] = cleanIdeas({ ideas: [raw({ shots: [shot(0, 5, { onScreenText: "Unlock The Secret Recipe" }), shot(5, 15, { onScreenText: "“Fresh Out The Oven” — Daily" })] })] }, ["in_person"], ids);
    expect(i.shots.map((s) => s.onScreenText)).toEqual([null, "Fresh out the oven, daily"]);
  });

  it("takes dashes out of prose and bounds the length", () => {
    const [i] = cleanIdeas({ ideas: [raw({ premise: "Fast — then slow", lengthSec: 400 })] }, [], ids);
    expect(i.premise).toBe("Fast, then slow");
    expect(i.lengthSec).toBe(90);
  });

  it("drops an animation's script unless it has a voiceover", () => {
    const [a, b] = cleanIdeas({ ideas: [raw({ title: "A", style: "animation", script: "hello", sound: { kind: "music", feel: "" } }), raw({ title: "B", style: "animation", script: "hello", sound: { kind: "voiceover", feel: "" } })] }, ["animation"], ids);
    expect(a.script).toBe("");
    expect(b.script).toBe("hello");
  });

  it("drops ideas with no shots, no title or a repeat title", () => {
    expect(cleanIdeas({ ideas: [raw({ shots: [] }), raw({ title: "" }), raw(), raw()] }, [], ids)).toHaveLength(1);
  });

  it("reads as a filming plan when copied", () => {
    const [i] = cleanIdeas({ ideas: [raw({ shots: [shot(0, 4, { onScreenText: "6 am", say: "We start early" }), shot(4, 15)] })] }, [], ids) as VideoIdea[];
    expect(ideaText(i)).toContain("0:00 to 0:04: shot at 0 On screen: \"6 am\". Say: \"We start early\"");
    expect(ideaText(i)).toContain("Sound: Its own sound, kitchen sounds.");
  });

  it("keeps a treatment only when it fits the style, else the style's default", () => {
    const [a, b, c] = cleanIdeas({ ideas: [
      raw({ title: "A", treatment: "sketch" }),
      raw({ title: "B", treatment: "talking" }),
      raw({ title: "C", style: "face", treatment: "pov" }),
    ] }, [], ids) as VideoIdea[];
    expect(a.treatment).toBe("sketch");
    expect(b.treatment).toBe("behind_scenes"); // talking isn't filmed in person
    expect(c.treatment).toBe("pov");
    expect(ideaText(a)).toContain("(Sketch, about 15 seconds)");
  });

  it("keeps an evidence label only when it is one SOCIA knows; older ideas have none", () => {
    const [a, b] = cleanIdeas({ ideas: [raw({ title: "A", evidence: "promising" }), raw({ title: "B", evidence: "proven" })] }, [], ids) as VideoIdea[];
    expect(a.evidence).toBe("promising");
    expect(b.evidence).toBeNull();
  });

  it("keeps a stored set's ids", () => {
    const s = sanitizeIdeaSet({ at: "2026-11-01T00:00:00Z", styles: ["in_person"], about: null, ideas: [{ ...raw(), id: "keepme" }] });
    expect(s?.ideas[0].id).toBe("keepme");
    expect(sanitizeIdeaSet({ ideas: [] })).toBeNull();
  });
});

describe("the Reel an idea is built on", () => {
  const base = { title: "Slice POV", style: "in_person", treatment: "pov", evidence: "untested", premise: "The camera walks in and finds the slice.", themeFit: "", lengthSec: 15, sound: { kind: "original", feel: "" }, shots: [{ from: 0, to: 15, onCamera: "Door, then counter", onScreenText: "", say: "" }], script: "", caption: "", needs: "" };
  const proven = [{ id: "R1", proven: true, url: "https://instagram.com/reel/a1", platform: "instagram", accountName: "A", accountHandle: "a", accountAvatar: null, title: "POV: best slice", thumb: null, publishedAt: null, views: 240000, likes: 10, comments: 1, multiplier: 6, basis: "views" as const, format: "Reel", line: "POV: best slice", structures: ["POV"], topics: [] }];

  it("comes from the listed Reel the model cited, never from the model's own text", () => {
    const [idea] = cleanIdeas({ ideas: [{ ...base, reference: "R1" }] }, ["in_person"], () => "a", proven);
    expect(idea.ref).toMatchObject({ url: "https://instagram.com/reel/a1", account: "@a", views: 240000, multiplier: 6 });
    expect(ideaText(idea)).toContain("Built on a Reel that took off: @a on Instagram: 240K views, 6.0x their usual. https://instagram.com/reel/a1");
    expect(cleanIdeas({ ideas: [{ ...base, reference: "R7" }] }, ["in_person"], () => "a", proven)[0].ref).toBeNull();
    expect(cleanIdeas({ ideas: [{ ...base, reference: "" }] }, ["in_person"], () => "a", proven)[0].ref).toBeNull();
  });

  it("survives being stored and read back", () => {
    const [idea] = cleanIdeas({ ideas: [{ ...base, reference: "R1" }] }, ["in_person"], () => "a", proven);
    const back = sanitizeIdeaSet({ at: "2026-11-05", styles: ["in_person"], about: null, ideas: [idea] });
    expect(back?.ideas[0].ref).toEqual(idea.ref);
  });
});
