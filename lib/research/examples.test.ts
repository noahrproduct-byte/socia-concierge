import { describe, expect, it } from "vitest";
import { exampleLine, rankExamples, topicMatch, words, type ResearchExample } from "./examples";
import { buildResearch, stepHref } from "./answer";

const now = new Date("2026-11-17T12:00:00Z");
const ex = (o: Partial<ResearchExample>): ResearchExample => ({
  ref: "", source: "youtube", platform: "youtube", url: `https://youtube.com/shorts/${o.title ?? "x"}`, title: "Video", creator: "Chan",
  thumb: null, views: 1000, likes: 10, comments: 1, durationSec: 30, publishedAt: "2026-10-01T00:00:00Z",
  vsUsual: null, usualBasis: null, foundBy: "test", ...o,
});

describe("rankExamples", () => {
  const opts = { topic: "founder pitch saas app", now, freshDays: 365, shortOnly: true, max: 6 };

  it("puts the closest match first and numbers the refs", () => {
    const out = rankExamples([ex({ title: "Cooking pasta at home", creator: "A" }), ex({ title: "Founder pitches his SaaS app in 30 seconds", creator: "B" })], opts);
    expect(out[0].creator).toBe("B");
    expect(out.map((x) => x.ref)).toEqual(["R1", "R2"]);
  });

  it("keeps one video per creator and drops repeated links", () => {
    const out = rankExamples([
      ex({ title: "Founder pitch one", creator: "Same" }), ex({ title: "Founder pitch two", creator: "Same" }),
      ex({ title: "SaaS pitch", creator: "Other", url: "https://youtube.com/shorts/z" }), ex({ title: "SaaS pitch copy", creator: "Third", url: "https://www.youtube.com/shorts/z/" }),
    ], opts);
    expect(out.map((x) => x.creator)).toEqual(expect.arrayContaining(["Same", "Other"]));
    expect(out.length).toBe(2);
  });

  it("drops stale videos and long videos when the request is short-form", () => {
    const out = rankExamples([
      ex({ title: "Founder pitch old", creator: "Old", publishedAt: "2024-01-01T00:00:00Z" }),
      ex({ title: "Founder pitch long", creator: "Long", durationSec: 900 }),
      ex({ title: "Founder pitch fresh", creator: "Fresh" }),
    ], opts);
    expect(out.map((x) => x.creator)).toEqual(["Fresh"]);
  });

  it("a video that beat its creator's usual ranks above an equal match that didn't", () => {
    const out = rankExamples([ex({ title: "Founder pitch", creator: "Flat", vsUsual: 0.8 }), ex({ title: "Founder pitch", creator: "Lift", vsUsual: 6 })], opts);
    expect(out[0].creator).toBe("Lift");
  });

  it("topicMatch and words ignore filler", () => {
    expect(words("The best Reels for my SaaS")).toEqual(["best", "saas"]);
    expect(topicMatch("SaaS founder demo", ["saas", "founder", "pizza"])).toBeCloseTo(2 / 3);
  });

  it("an evidence line carries the real numbers and says when one isn't published", () => {
    const line = exampleLine({ ...ex({ title: "T", likes: null, vsUsual: 3.2, usualBasis: "this channel's average views per video" }), ref: "R1" });
    expect(line).toContain("[R1]");
    expect(line).toContain("views 1,000");
    expect(line).toContain("likes not published");
    expect(line).toContain("3.2× this channel's average views per video");
  });
});

describe("buildResearch", () => {
  const found = rankExamples([ex({ title: "Founder pitch", creator: "Real", views: 52000 })], { topic: "founder pitch", now, freshDays: 365, shortOnly: true, max: 6 });
  const clean = (s: string) => s.trim();

  it("shows only videos SOCIA found, with SOCIA's numbers, never the model's", () => {
    const r = buildResearch({
      raw: { approach: "Lead with the problem.", examples: [{ ref: "[R1]", why: "Same founder-to-camera pitch, 9.9M views" }, { ref: "R7", why: "Invented" }], why: "w", test: "t", steps: [{ type: "editor", label: "x" }, { type: "editor", label: "dup" }] },
      kind: "create_content", examples: found, notes: ["Searched YouTube"], seed: "Lead with the problem.", clean,
    })!;
    expect(r.examples).toHaveLength(1);
    expect(r.examples[0].views).toBe(52000);
    expect(r.examples[0].why).toBe("Same founder-to-camera pitch");
    expect(r.steps).toEqual([{ label: "Make it in the Video editor", href: "/studio?mode=edit" }]);
    expect(r.notes).toEqual(["Searched YouTube"]);
  });

  it("is absent when the model gave no approach and no example", () => {
    expect(buildResearch({ raw: { approach: "", examples: [], why: "", test: "", steps: [] }, kind: "general", examples: found, notes: [], seed: "", clean })).toBeNull();
  });

  it("Create Post opens with the draft's caption when there is one", () => {
    const r = buildResearch({ raw: { approach: "A", examples: [], why: "", test: "", steps: [{ type: "writer", label: "" }] }, kind: "create_content", examples: [], notes: [], seed: "A", caption: "Try it today #socia", clean })!;
    expect(r.steps[0].href).toBe(`/create?caption=${encodeURIComponent("Try it today #socia")}`);
    expect(stepHref("idea", "Hook")).toBe("/plan/calendar?compose=1&caption=Hook");
  });
});
