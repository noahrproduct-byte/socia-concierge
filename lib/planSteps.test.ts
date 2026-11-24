import { describe, it, expect } from "vitest";
import {
  PLANS_PER_WEEK, StepError, TRIES_PER_DAY, WRITES_PER_DAY, acceptDay, allWritten, auditSchema, beginRetry, cleanIdeaCard, detailsTask, editDay,
  filmedDays, finishDay, ideaTask, ideasBeyondSlots, newBuild, nextWaiting, ownIdeaFor, pickEarlier, planSlots, progress, reviewingIndex, rewriteDay, withIdea,
} from "./planSteps";
import { buildUserPrompt } from "./prompt";
import { deliverableSchema, type GenerateInput, type IdeaCard } from "./schema";

const input: GenerateInput = { clientHandle: "@salvos", niche: "Pizza", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "", onCamera: 3, animated: 1, ideas: "Saturday rush behind the scenes" };
const idea = (title: string): IdeaCard => ({ title, pillar: "Behind the scenes", description: `${title}, shown.`, format: "Reel, talking to camera" });
const NOW = new Date("2026-11-23T10:00:00Z");

describe("the days a plan covers", () => {
  it("has as many days as the week's posts, on-camera ones spread over the week", () => {
    const slots = planSlots({ onCamera: 3, animated: 1 });
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.kind === "filmed").map((s) => s.key)).toEqual(["Monday", "Wednesday", "Friday"]);
    expect(slots.find((s) => s.kind === "animated")?.key).toBe("Monday (animated)");
    expect(slots.every((s) => s.state === "waiting" && s.tries === 0)).toBe(true);
  });
  it("puts on-camera days on the person's posting days", () => {
    expect(filmedDays(2, ["tue", "thu", "sat"])).toEqual([1, 5]);
    expect(filmedDays(3, ["tue", "thu", "sat"])).toEqual([1, 3, 5]);
    expect(filmedDays(4, ["sat"])).toHaveLength(4);
    expect(filmedDays(0)).toEqual([]);
  });
});

describe("idea cards", () => {
  it("are bounded, have no em dashes, and keep a template and hook only on animated days", () => {
    const filmed = cleanIdeaCard({ title: "Dough — at 6 AM", pillar: "Craft", description: "x".repeat(500), format: "Reel", template: "words", hook: "Look" }, "filmed");
    expect(filmed).toMatchObject({ title: "Dough, at 6 AM", format: "Reel" });
    expect(filmed!.description.length).toBe(280);
    expect(filmed!.template).toBeUndefined();
    expect(filmed!.hook).toBeUndefined();
    expect(cleanIdeaCard({ title: "Slices per day", pillar: "", description: "A counter", format: "", template: "counter", hook: "One oven, 400 slices" }, "animated")).toMatchObject({ template: "counter", hook: "One oven, 400 slices", format: "Animated video" });
    expect(cleanIdeaCard({ title: " " }, "filmed")).toBeNull();
  });
  it("match the person's own ideas to the on-camera days in order", () => {
    const slots = planSlots({ onCamera: 2, animated: 1 });
    const firstFilmed = slots.findIndex((s) => s.kind === "filmed");
    expect(ownIdeaFor(input, slots, firstFilmed)).toEqual({ text: "Saturday rush behind the scenes", n: 1 });
    expect(ownIdeaFor(input, slots, slots.findIndex((s) => s.kind === "animated"))).toBeNull();
    expect(ideasBeyondSlots({ ideas: "One idea\nTwo idea\nThree idea" }, slots)).toEqual(["Three idea"]);
  });
});

describe("prompts", () => {
  it("cache the same account context for every step, without the task or the week's count", () => {
    const ctx = buildUserPrompt(input, null, null, { context: true });
    expect(ctx).toContain("Account / handle: @salvos");
    expect(ctx).not.toContain("# Task");
    expect(ctx).not.toContain("Saturday rush");
    expect(buildUserPrompt(input, null, null)).toContain("# Task");
  });
  it("ask for one short idea, never the full post, and say what was turned down", () => {
    let b = newBuild(input, planSlots({ onCamera: 2, animated: 0 }), NOW);
    b = withIdea(b, 0, idea("Oven at dawn"));
    b = beginRetry(b, 0);
    const task = ideaTask(b, 0, "ANIMATED RULES");
    expect(task).toContain("Write only the idea for Monday");
    expect(task).toContain("Oven at dawn");
    expect(task).toContain("No hook, script, shots, caption or hashtags yet");
    expect(task).not.toContain("ANIMATED RULES");
  });
  it("write the approved idea in full, keeping it", () => {
    let b = newBuild(input, planSlots({ onCamera: 2, animated: 0 }), NOW);
    b = acceptDay(withIdea(b, 0, idea("Oven at dawn")), 0);
    expect(detailsTask(b, 0)).toContain("Title: Oven at dawn");
    expect(detailsTask(b, 0)).toContain('day "Monday"');
  });
  it("the week's read asks only for the audit fields", () => {
    const s = auditSchema(deliverableSchema);
    expect(Object.keys(s.properties)).toEqual(["headline", "auditSummary", "strengths", "problems", "topFixes", "competitorInsights"]);
    expect(s.required).toEqual(Object.keys(s.properties));
  });
});

describe("a day's decisions", () => {
  const start = () => withIdea(newBuild(input, planSlots({ onCamera: 2, animated: 0 }), NOW), 0, idea("First"));

  it(`allows ${TRIES_PER_DAY} other ideas a day, keeping the earlier ones`, () => {
    let b = start();
    for (let k = 0; k < TRIES_PER_DAY; k++) b = withIdea(beginRetry(b, 0), 0, idea(`Other ${k}`));
    expect(b.slots[0].earlier.map((i) => i.title)).toEqual(["First", "Other 0"]);
    expect(() => beginRetry(b, 0)).toThrow(StepError);
    b = pickEarlier(b, 0, 0);
    expect(b.slots[0].idea!.title).toBe("First");
    expect(b.slots[0].earlier.map((i) => i.title)).toEqual(["Other 0", "Other 1"]);
  });
  it("accepts with the person's edits and moves on", () => {
    let b = editDay(start(), 0, { title: "My own title" });
    expect(b.slots[0].state).toBe("reviewing");
    b = acceptDay(b, 0, { description: "Changed" });
    expect(b.slots[0]).toMatchObject({ state: "writing", idea: { title: "My own title", description: "Changed" } });
    expect(nextWaiting(b)).toBe(1);
    expect(reviewingIndex(b)).toBe(-1);
    expect(progress(b)).toEqual({ approved: 1, total: 2 });
    expect(() => acceptDay(b, 0)).toThrow(StepError);
  });
  it("is done only when every day is written and none is waiting", () => {
    let b = acceptDay(start(), 0);
    b = finishDay(b, 0, { itemId: "item-0000-1" });
    expect(b.status).toBe("building");
    b = acceptDay(withIdea(b, 1, idea("Second")), 1);
    b = finishDay(b, 1, { error: "No post came back." });
    expect(allWritten(b)).toBe(true);
    expect(b.status).toBe("done");
    b = rewriteDay(b, 1);
    expect(b.slots[1].state).toBe("writing");
    expect(b.status).toBe("building");
  });
  it(`gives up writing a day after ${WRITES_PER_DAY} tries`, () => {
    let b = acceptDay(start(), 0);
    b = { ...b, slots: b.slots.map((s, i) => (i === 0 ? { ...s, writes: WRITES_PER_DAY } : s)) };
    b = finishDay(b, 0, { error: "x" });
    expect(() => rewriteDay(b, 0)).toThrow(StepError);
  });
  it(`limits new plans to ${PLANS_PER_WEEK} a week`, () => {
    expect(PLANS_PER_WEEK).toBe(2);
  });
});
