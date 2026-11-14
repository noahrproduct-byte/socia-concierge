import { describe, expect, it } from "vitest";
import { cleanBeats, sanitizePlanItems } from "./planItems";

describe("a post's timed beats", () => {
  it("keeps beats in order, each with a label and what to show", () => {
    const b = cleanBeats([
      { label: "The problem", from: 0, to: 7, show: "A climber falls." },
      { label: "Bad", from: 7, to: 5, show: "ends before it starts" },
      { label: "The fix", from: 7, to: 15, show: "The scan." },
      { label: "", from: 15, to: 20, show: "no label" },
      { label: "The ending", from: 15, to: 30, show: "The send." },
      { label: "Fourth", from: 30, to: 40, show: "the last one kept" },
      { label: "Fifth", from: 40, to: 50, show: "one too many" },
    ]);
    expect(b?.map((x) => x.label)).toEqual(["The problem", "The fix", "The ending", "Fourth"]);
  });
  it("needs two beats or none", () => {
    expect(cleanBeats([{ label: "Only", from: 0, to: 5, show: "x" }])).toBeUndefined();
    expect(cleanBeats("nope")).toBeUndefined();
  });
  it("survive an edit sent back from the page", () => {
    const [item] = sanitizePlanItems([{ day: "Monday", concept: "c", hook: "h", format: "Reel", beats: [{ label: "A", from: 0, to: 5, show: "x" }, { label: "B", from: 5, to: 9, show: "y" }] }]);
    expect(item.beats).toHaveLength(2);
  });
});
