import { describe, it, expect } from "vitest";
import { cleanIdeas, ideasBlock, ideasThatFit, markIdeaPosts, MAX_IDEAS } from "./planIdeas";
import { buildUserPrompt } from "./prompt";
import { deliverableSchema, type GenerateInput } from "./schema";

describe("cleanIdeas", () => {
  it("reads one idea per line, dropping list markers, blanks and repeats", () => {
    expect(cleanIdeas("- Behind the scenes of Saturday\n\n2. How we make the dough\n• behind the scenes of saturday\nok")).toEqual([
      "Behind the scenes of Saturday",
      "How we make the dough",
    ]);
  });
  it("keeps at most a week's worth and no em dashes", () => {
    expect(cleanIdeas(Array.from({ length: 12 }, (_, k) => `Idea number ${k + 1}`).join("\n"))).toHaveLength(MAX_IDEAS);
    expect(cleanIdeas("Our oven — up close")[0]).toBe("Our oven, up close");
  });
  it("is empty for nothing", () => {
    expect(cleanIdeas(undefined)).toEqual([]);
    expect(cleanIdeas("   \n ")).toEqual([]);
  });
});

describe("ideasBlock", () => {
  it("lists only the ideas that fit the week's filmed posts", () => {
    const ideas = ["One", "Two", "Three"];
    expect(ideasThatFit(ideas, 2)).toBe(2);
    const block = ideasBlock(ideas, 2);
    expect(block).toContain("1. One");
    expect(block).toContain("2. Two");
    expect(block).not.toContain("3. Three");
    expect(block).toMatch(/fromIdea/);
    expect(block).toMatch(/never call it proven/);
  });
  it("says nothing with no ideas or no filmed posts", () => {
    expect(ideasBlock([], 3)).toBe("");
    expect(ideasBlock(["One"], 0)).toBe("");
  });
  it("reaches the strategist's prompt", () => {
    const input: GenerateInput = { clientHandle: "@shop", niche: "Pizza", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "", onCamera: 3, ideas: "Saturday rush behind the scenes" };
    expect(buildUserPrompt(input)).toContain("1. Saturday rush behind the scenes");
  });
});

describe("markIdeaPosts", () => {
  it("marks posts made from an idea as the person's own and lists the ideas left out", () => {
    const { items, left } = markIdeaPosts([{ fromIdea: 2 }, { fromIdea: 0 }, { fromIdea: 2 }, { fromIdea: 9 }], ["A", "B", "C"]);
    expect(items.map((i) => (i as { source?: string }).source)).toEqual(["own", undefined, undefined, undefined]);
    expect(items.every((i) => !("fromIdea" in i))).toBe(true);
    expect(left).toEqual(["A", "C"]);
  });
});

describe("plan schema", () => {
  it("asks for fromIdea on every post", () => {
    const item = (deliverableSchema as unknown as { properties: { weeklyPlan: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.weeklyPlan.items;
    expect(item.properties.fromIdea).toEqual({ type: "integer" });
    expect(item.required).toContain("fromIdea");
  });
});
