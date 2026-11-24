import { describe, expect, it } from "vitest";
import { editorBrief, planPostTitle } from "./planEditorBrief";

const post = {
  day: "Tuesday", concept: "A Double Crust and a regular pepperoni come out together.", hook: "Double Crust or regular? Same pepperoni, two totally different pies 🍕",
  format: "Reel", rationale: "", evidence: "", predictedPerformance: "", title: "Double Crust vs Regular, cut live",
  cta: "Pick one in the comments.", editing: "One continuous shoot, trimmed. Labels DOUBLE and REGULAR.",
  beats: [
    { label: "The question", from: 0, to: 3, show: "Cutter rolling through the Double Crust in close-up", say: "DOUBLE or REGULAR?" },
    { label: "Version one", from: 3, to: 8, show: "Double Crust cut and a slice lifted" },
  ],
};

describe("editorBrief", () => {
  it("writes the planned post as the editor's prompt, from its own fields", () => {
    const b = editorBrief(post as never);
    expect(b).toContain('Make my planned Reel, about 8 seconds: "Double Crust vs Regular, cut live".');
    expect(b).toContain('It opens with: "Double Crust or regular? Same pepperoni, two totally different pies 🍕"');
    expect(b).toContain('- 0:00 to 0:03, The question: Cutter rolling through the Double Crust in close-up. Say or show: "DOUBLE or REGULAR?"');
    expect(b).toContain("- 0:03 to 0:08, Version one: Double Crust cut and a slice lifted.");
    expect(b).toContain("End with: Pick one in the comments.");
    expect(b).toContain("How to edit it: One continuous shoot, trimmed.");
  });
  it("leaves out what the plan doesn't have, and stays within the prompt limit", () => {
    const bare = editorBrief({ day: "Friday", concept: "Office lunch boxes stacking up.", hook: "", format: "Reel" } as never);
    expect(bare).toContain("What it shows: Office lunch boxes stacking up.");
    expect(bare).not.toContain("It opens with");
    expect(bare).not.toContain("End with");
    expect(editorBrief({ ...post, beats: Array.from({ length: 60 }, (_, k) => ({ label: `Shot ${k}`, from: k, to: k + 1, show: "x ".repeat(40) })) } as never).length).toBeLessThanOrEqual(2000);
    expect(planPostTitle({ day: "Friday", concept: "Office lunch boxes. Then a lid lifts." } as never)).toBe("Office lunch boxes.");
  });
});
