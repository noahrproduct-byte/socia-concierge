import { describe, it, expect } from "vitest";
import { cleanEvidenceSplit, normalizePlanItem, platformName, sanitizeOwnPost, sanitizePlanItems, withItemIds } from "./planItems";
import { buildUserPrompt, SYSTEM } from "./prompt";
import { deliverableSchema } from "./schema";

const base = { day: "Friday", concept: "The Friday special from dough to box", hook: "Watch Friday happen", format: "Reel", rationale: "Kitchen Reels beat your median", evidence: "1.8x across 6 posts", predictedPerformance: "Above your median" };

describe("plan item fields", () => {
  it("asks the model for every per-post field the brief lists", () => {
    const items = (deliverableSchema.properties.weeklyPlan as { items: { required: string[] } }).items.required;
    for (const k of ["title", "purpose", "audience", "platform", "direction", "production", "successMetric"]) expect(items).toContain(k);
    expect(SYSTEM).toMatch(/never more equipment, editing skill or help than they said they have/);
  });

  it("maps the platform to one SOCIA publishes to, and drops one it doesn't", () => {
    expect(platformName("instagram reels")).toBe("Instagram");
    expect(platformName("YouTube Shorts")).toBe("YouTube");
    expect(platformName("LinkedIn")).toBeNull();
    expect(normalizePlanItem({ ...base, platform: "Pinterest" }).platform).toBeUndefined();
  });

  it("bounds the new fields and strips em dashes", () => {
    const n = normalizePlanItem({ ...base, title: `Dough to box — Friday ${"x".repeat(200)}`, successMetric: "  " });
    expect(n.title!.length).toBeLessThanOrEqual(80);
    expect(n.title).not.toMatch(/—/);
    expect(n.successMetric).toBeUndefined();
  });
});

describe("edits sent back by the browser", () => {
  it("keep known fields only, bounded, and drop days without a concept", () => {
    const out = sanitizePlanItems([{ ...base, injected: "<script>", concept: "c".repeat(5000) }, { day: "Monday", concept: "" }, "junk", null]);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0])).not.toContain("injected");
    expect(out[0].concept.length).toBe(1200);
  });
});

describe("older plans", () => {
  it("still build a prompt and render without the new fields", () => {
    expect(normalizePlanItem(base).title).toBeUndefined();
    expect(buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "a", goal: "", niche: "b", platform: "instagram" } as never)).toMatch(/# My account/);
  });
});

describe("who makes each post, and its id", () => {
  it("asks the model who makes every post, and tells it how to choose", () => {
    const items = (deliverableSchema.properties.weeklyPlan as { items: { required: string[]; properties: Record<string, { enum?: string[] }> } }).items;
    expect(items.required).toContain("maker");
    expect(items.properties.maker.enum).toEqual(["you", "claude"]);
    expect(SYSTEM).toMatch(/My Claude makes them/);
    expect(SYSTEM).toMatch(/no filming and no footage of the person/);
  });

  it("keeps a known maker and drops anything else", () => {
    expect(normalizePlanItem({ ...base, maker: "claude" }).maker).toBe("claude");
    expect(normalizePlanItem({ ...base, maker: "robot" as never }).maker).toBeUndefined();
  });

  it("gives every post an id, keeps the ones it has, and never repeats one", () => {
    let n = 0;
    const next = () => `00000000-0000-4000-8000-00000000000${++n}`;
    const kept = "aaaaaaaa-0000-4000-8000-000000000001";
    const out = withItemIds([{ ...base, id: kept }, { ...base }, { ...base, id: kept }, { ...base, id: "bad id!" }], next);
    expect(out.map((i) => i.id)).toEqual([kept, "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
  });

  it("an edit sent back by the browser keeps each post's id and maker", () => {
    const [it] = sanitizePlanItems([{ ...base, id: "aaaaaaaa-0000-4000-8000-000000000001", maker: "claude" }]);
    expect(it).toMatchObject({ id: "aaaaaaaa-0000-4000-8000-000000000001", maker: "claude" });
  });
});

describe("the Reel a plan post is built on", () => {
  const post = { day: "Monday", concept: "c", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "" };
  const ref = { url: "https://instagram.com/reel/a1", platform: "instagram", account: "@a", title: null, views: 240000, likes: null, comments: null, multiplier: 6, basis: "views" as const, structure: "POV" };

  it("keeps a real reference, drops the model's cited id and anything that is not a reference", () => {
    const n = normalizePlanItem({ ...post, reference: "R1", ref });
    expect(n.ref).toEqual(ref);
    expect(n.reference).toBeUndefined();
    expect(normalizePlanItem({ ...post, ref: { url: "javascript:x", platform: "instagram", account: "@a" } as never }).ref).toBeUndefined();
  });

  it("survives an edit sent back by the browser", () => {
    expect(sanitizePlanItems([{ ...post, ref }])[0].ref).toEqual(ref);
  });
});

describe("a post's evidence in three kinds", () => {
  const known = new Set(["P1", "P3", "R2"]);
  it("keeps an observed line only when every id it cites was shown to the model", () => {
    const s = cleanEvidenceSplit({ observed: ["[P3] Your kitchen Reel had 412 interactions", "[R9] A Reel that was never listed", "Posts do well on Fridays", "[P1] and [R2] both open on a face"], reading: "Faces first.", expect: "Above your median, a guess.", basis: "data" }, known);
    expect(s?.observed).toEqual(["[P3] Your kitchen Reel had 412 interactions", "[P1] and [R2] both open on a face"]);
    expect(s?.basis).toBe("data");
  });
  it("calls the basis thin when no observed line survives", () => {
    const s = cleanEvidenceSplit({ observed: ["Everyone loves pizza"], reading: "A guess at what works.", expect: "Unknown.", basis: "data" }, known);
    expect(s).toEqual({ observed: [], reading: "A guess at what works.", expect: "Unknown.", basis: "thin" });
  });
  it("keeps an experiment an experiment, and drops an empty split", () => {
    expect(cleanEvidenceSplit({ observed: [], reading: "Test a menu POV.", expect: "", basis: "experiment" }, known)?.basis).toBe("experiment");
    expect(cleanEvidenceSplit({ observed: [], reading: "", expect: "", basis: "data" }, known)).toBeUndefined();
    expect(cleanEvidenceSplit(null, known)).toBeUndefined();
  });
});

describe("own posts a plan post cites", () => {
  it("reads back only a real post reference, bounded", () => {
    expect(sanitizeOwnPost({ id: "P4", url: "https://www.instagram.com/reel/a/", date: "2026-11-01", title: "Hi", format: "Reel", likes: 3, comments: 1, views: 200, reach: null })).toMatchObject({ id: "P4", views: 200, reach: null, saved: null });
    expect(sanitizeOwnPost({ id: "R4", likes: 1 })).toBeNull();
    expect(sanitizeOwnPost({ id: "P4", url: "javascript:alert(1)" })?.url).toBeNull();
  });
  it("survives a round trip through the browser with the new fields", () => {
    const [item] = sanitizePlanItems([{ day: "Monday", concept: "A", hook: "B", format: "Reel", rationale: "", evidence: "", predictedPerformance: "", cta: "Book a table", editing: "Cut on every beat", evidenceSplit: { observed: ["[P1] 10 likes"], reading: "r", expect: "e", basis: "data" }, ownPosts: [{ id: "P1", likes: 10, comments: 1 }], beats: [{ label: "Hook", from: 0, to: 3, show: "Face", say: "Stop scrolling" }, { label: "End", from: 3, to: 8, show: "Plate", say: "" }] }]);
    expect(item.cta).toBe("Book a table");
    expect(item.editing).toBe("Cut on every beat");
    expect(item.evidenceSplit?.observed).toEqual(["[P1] 10 likes"]);
    expect(item.ownPosts?.[0].id).toBe("P1");
    expect(item.beats?.[0].say).toBe("Stop scrolling");
    expect(item.beats?.[1].say).toBeUndefined();
  });
});

describe("the plan prompt", () => {
  const input = { clientHandle: "@cafe", niche: "Cafe", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "" };
  it("asks for split evidence, a script, a call to action and editing, and only measurable success measures", () => {
    expect(SYSTEM).toContain("evidenceSplit");
    expect(SYSTEM).toContain("say (the actual words spoken or written");
    expect(SYSTEM).toContain("cta (the one action");
    expect(SYSTEM).toContain('"Interactions against your median"');
    expect(SYSTEM).not.toContain("Saves against your median");
    for (const f of ["cta", "editing", "ownRefs", "evidenceSplit"]) expect(deliverableSchema.properties.weeklyPlan.items.required).toContain(f);
  });
  it("passes the week's Calendar and the measurable goals when there are some", () => {
    const ev = { postsBlock: "", competitorsBlock: "", outcomesBlock: "", formatsBlock: "", decisionsBlock: "", experimentsBlock: "", trendsBlock: "", calendarBlock: "- Wednesday, Nov 18 · scheduled · \"Pull\"", goalsBlock: "- Main goal: Bookings: to 60", used: { outcomes: 0, posts: 0, competitors: 0, winning: 0, windows: false, followers: null, trends: 0 } };
    const p = buildUserPrompt(input, null, ev);
    expect(p).toContain("# Already on the Calendar for the next two weeks");
    expect(p).toContain("# The account's measurable goals");
    // With no posts of its own, every post is a test.
    expect(p).toContain('basis of "thin" or "experiment"');
  });
});
