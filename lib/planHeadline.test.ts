import { describe, expect, it } from "vitest";
import { planHeadline } from "./planHeadline";

describe("a plan's headline", () => {
  it("drops a score nobody measured (seen live on 2026-11-16)", () => {
    expect(planHeadline("Health 40/100: concrete Claude how-tos win, but recent posts drifted away")).toBe("Concrete Claude how-tos win, but recent posts drifted away");
    expect(planHeadline("Account health score: 72 out of 100. Strong hooks, thin posting")).toBe("Strong hooks, thin posting");
    expect(planHeadline("Strong hooks but thin posting (62/100)")).toBe("Strong hooks but thin posting");
  });
  it("leaves an ordinary headline alone", () => {
    expect(planHeadline("Your how-tos win; post them three times a week")).toBe("Your how-tos win; post them three times a week");
    expect(planHeadline("Views are up 40% on Reels with a face in the first second")).toBe("Views are up 40% on Reels with a face in the first second");
    expect(planHeadline("A healthy week: 5 posts planned")).toBe("A healthy week: 5 posts planned");
  });
  it("copes with nothing", () => {
    expect(planHeadline(null)).toBe("");
    expect(planHeadline("Health 40/100")).toBe("");
  });
});
