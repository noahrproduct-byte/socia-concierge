import { describe, expect, it } from "vitest";
import { postsStarted, typicalSeconds } from "./planProgress";
import { withoutSkipped } from "./planEvidence";

describe("plan progress", () => {
  it("counts the posts started, only inside weeklyPlan", () => {
    expect(postsStarted('{"headline":"x","day":"no"')).toBe(0);
    expect(postsStarted('{"weeklyPlan":[{"maker":"you","day":"Monday","hook":"a"},{"day": "Tue')).toBe(2);
  });
  it("takes the middle of earlier build times", () => {
    expect(typicalSeconds([90])).toBeNull();
    expect(typicalSeconds([60, 120, 600, undefined])).toBe(120);
    expect(typicalSeconds([60, 120])).toBe(90);
  });
});

describe("unticked competitors", () => {
  it("are left out by handle or name", () => {
    const rows = [{ h: "@Rival" }, { h: "other" }, { h: null }];
    expect(withoutSkipped(rows, new Set(["rival"]), (r) => [r.h])).toEqual([{ h: "other" }, { h: null }]);
    expect(withoutSkipped(rows, new Set(), (r) => [r.h])).toHaveLength(3);
  });
});
