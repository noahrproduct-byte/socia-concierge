import { describe, expect, it } from "vitest";
import { addEntry, entryFor, finding, lessons, logEvidence, nextStep, sanitizeEntry, sanitizeLog, LOG_MAX, type RaterEntry, type RaterOutcome } from "./raterLog";

const entry = (over: Partial<RaterEntry> = {}): RaterEntry => ({
  postId: "post-0001", at: "2026-11-01T12:00:00.000Z", score: 61, diagnosis: "Weak opening.",
  fixes: [{ title: "Fix your opening", kind: "opening", priority: "critical", applied: true }], direction: null, hook: "Wait for it", cta: null, ...over,
});
const outcome = (over: Partial<RaterOutcome> = {}): RaterOutcome => ({ ...entry(), state: "published", publishedAt: "2026-11-02T12:00:00.000Z", permalink: null, result: { short: "1.6x your median", text: "1.6x your typical post.", measured: true, early: false, multiplier: 1.6 }, ...over });

describe("what is recorded", () => {
  it("bounds an entry and refuses one without a post id", () => {
    expect(sanitizeEntry({ postId: "x" })).toBeNull();
    expect(sanitizeEntry({ postId: "../../etc", fixes: [] })).toBeNull();
    const e = sanitizeEntry({ postId: "post-0001", score: 240, diagnosis: "d".repeat(400), fixes: [{ title: "A", kind: "opening", applied: true }, { title: "B", kind: "made_up" }, { title: "", kind: "ending" }], hook: "  hi  " })!;
    expect(e.score).toBe(100);
    expect(e.diagnosis).toHaveLength(160);
    expect(e.fixes).toEqual([{ title: "A", kind: "opening", priority: "medium", applied: true }]);
    expect(e.hook).toBe("hi");
  });

  it("keeps the newest first, one entry a post, and no more than the cap", () => {
    let log: RaterEntry[] = [];
    for (let i = 0; i < LOG_MAX + 3; i++) log = addEntry(log, entry({ postId: `post-${String(i).padStart(4, "0")}` }));
    expect(log).toHaveLength(LOG_MAX);
    expect(log[0].postId).toBe(`post-${String(LOG_MAX + 2).padStart(4, "0")}`);
    const again = addEntry(log, entry({ postId: log[3].postId, score: 80 }));
    expect(again).toHaveLength(LOG_MAX);
    expect(again[0]).toMatchObject({ postId: log[3].postId, score: 80 });
    expect(sanitizeLog({ log: [...again, again[0], "junk"] })).toHaveLength(LOG_MAX);
    expect(sanitizeLog(null)).toEqual([]);
  });

  it("counts a fix as applied only when its line is in use or that part was changed", () => {
    const e = entryFor({
      postId: "post-0001", score: 61, diagnosis: "d",
      fixes: [
        { title: "Fix your opening", kind: "opening", priority: "critical", apply: { field: "hook", value: "Wait for the cheese pull" } },
        { title: "Simplify the ending", kind: "ending", priority: "high", apply: null },
        { title: "Even out the voice", kind: "audio", priority: "medium", apply: null },
        { title: "Rewrite the caption", kind: "caption", priority: "medium", apply: null },
      ],
      current: { hook: "Old line", cta: "Follow, comment and use the code", caption: null },
      working: { hook: "Wait for the cheese pull", cta: "Follow, comment and use the code", caption: "Twenty a day.", onscreen: [] },
      direction: { name: "Payoff first", opening: "Wait for the cheese pull" },
    })!;
    // The suggested hook is in use; the ending was left as it was; sound is fixed in the editor, not here; a caption was written.
    expect(e.fixes.map((f) => f.applied)).toEqual([true, false, false, true]);
    expect(e.direction).toBe("Payoff first");
    const other = entryFor({ postId: "post-0001", score: 61, diagnosis: "d", fixes: [], current: { hook: null, cta: null, caption: null }, working: { hook: "My own line", cta: "", caption: "", onscreen: [] }, direction: { name: "Payoff first", opening: "Wait for the cheese pull" } })!;
    expect(other.direction).toBeNull();
  });
});

describe("what a result does and doesn't say", () => {
  it("never credits the change from one post, and says nothing is measured before it is", () => {
    expect(finding(outcome())).toBe("It did better than your usual. One post can't say the changes are why: other things differed too.");
    expect(finding(outcome({ result: { short: "0.6x", text: "t", measured: true, early: true, multiplier: 0.6 } }))).toBe("It did below your usual so far (the number is still moving). One post can't say the changes are why: other things differed too.");
    expect(finding(outcome({ fixes: [{ title: "x", kind: "opening", priority: "high", applied: false }] }))).toMatch(/No recommended change was applied to it/);
    expect(finding(outcome({ state: "draft", result: null }))).toMatch(/^Still a draft/);
    expect(finding(outcome({ result: null }))).toBe("Published, and the platform has not reported its numbers yet.");
  });

  it("suggests a next step only for a settled, measured post with a change applied", () => {
    expect(nextStep(outcome())).toBe("Test the same approach again on your next comparable post.");
    expect(nextStep(outcome({ result: { short: "", text: "", measured: true, early: true, multiplier: 2 } }))).toBe("Look again once it has been out three days.");
    expect(nextStep(outcome({ state: "scheduled", result: null }))).toBeNull();
    expect(nextStep(outcome({ fixes: [] }))).toBeNull();
  });

  it("states a lesson about a kind of change only from three settled posts", () => {
    const o = (id: string, m: number, early = false) => outcome({ postId: `post-000${id}`, result: { short: "", text: "", measured: true, early, multiplier: m } });
    expect(lessons([o("1", 1.6), o("2", 1.1)])).toEqual([]);
    // An early result doesn't count toward the three.
    expect(lessons([o("1", 1.6), o("2", 1.1), o("3", 2, true)])).toEqual([]);
    const l = lessons([o("1", 1.6), o("2", 1.1), o("3", 1.4)]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "opening", posts: 3, above: 2, median: 1.4 });
    expect(l[0].line).toBe("When you changed the opening: 3 posts, median 1.4x your usual, 2 of 3 above it. A pattern in your own posts, not proof the change is the reason.");
  });

  it("gives the next analysis what was applied and what happened, and nothing when there is nothing", () => {
    expect(logEvidence([])).toBe("");
    expect(logEvidence([outcome({ state: "draft", result: null, fixes: [{ title: "x", kind: "opening", priority: "high", applied: false }] })])).toBe("");
    const text = logEvidence([outcome({ direction: "Payoff first" })]);
    expect(text).toBe("- 2026-11-01: scored 61. Applied: Fix your opening. Direction used: Payoff first. Result: 1.6x your median.");
  });
});
