import { describe, expect, it } from "vitest";
import { editorPromptOf, planItemOf, sanitizeDirection, sanitizePlan, isPlanChange } from "./videoWorkspace";

const raw = {
  title: "Dough to first slice", objective: "Show the signature pizza", audience: "Local diners", seconds: 28, platform: "Instagram", format: "Reel", direction: "Fast-paced food Reel",
  hook: { visual: "Cheese pull from a fresh slice", say: "", text: "This is why they come back", sound: "Crunch of the crust" },
  script: "Dough at six. Sauce by hand. Out at nine hundred degrees.",
  shots: [{ from: 0, to: 2, film: "Cheese pull, close up", angle: "eye level", move: "slow pull back", say: "", text: "This is why they come back", edit: "hard cut on the beat" }, { from: 2, to: 8, film: "Hands stretch the dough", angle: "top down", move: "static", say: "Dough at six.", text: "", edit: "speed ramp" }],
  editing: "Cuts every 2 seconds", music: "Upbeat Italian", voiceover: "", caption: "Our signature pie. Come by Friday.", hashtags: ["pizza", "#hermitagetn"], cta: "Come by Friday", postTime: "x",
};

describe("video workspace", () => {
  it("keeps a plan bounded and cleans hashtags and dashes", () => {
    const p = sanitizePlan({ ...raw, editing: "Cuts every 2 seconds — on the beat" })!;
    expect(p.hashtags).toEqual(["#pizza", "#hermitagetn"]);
    expect(p.editing).toBe("Cuts every 2 seconds, on the beat");
    expect(p.shots).toHaveLength(2);
    expect(sanitizePlan({ title: "x", shots: [] })).toBeNull();
  });
  it("hands the editor the plan, never a link or a reference's numbers", () => {
    const prompt = editorPromptOf(sanitizePlan(raw)!);
    expect(prompt).toContain('Make my reel, about 28 seconds: "Dough to first slice".');
    expect(prompt).toContain('Open on: Cheese pull from a fresh slice On screen first: "This is why they come back"');
    expect(prompt).toContain("- 0:02 to 0:08: Hands stretch the dough Edit: speed ramp");
    expect(prompt).toContain("The words, as written:\nDough at six.");
    expect(prompt).not.toMatch(/https?:|views|x their usual/);
  });
  it("adds to the weekly plan as the person's own post, on the chosen day", () => {
    const item = planItemOf(sanitizePlan(raw)!, "Friday");
    expect(item).toMatchObject({ day: "Friday", source: "own", format: "Reel", title: "Dough to first slice", hook: "This is why they come back" });
    expect((item.beats as unknown[]).length).toBe(2);
  });
  it("keeps only directions it can show and refs it knows", () => {
    const d = sanitizeDirection({ title: "Cinematic", concept: "Slow close-ups", seconds: 300, refKeys: ["a", "zzz"] }, 1, new Set(["a"]))!;
    expect(d).toMatchObject({ id: "B", seconds: 90, refKeys: ["a"], recommended: false });
    expect(sanitizeDirection({ title: "" }, 0, new Set())).toBeNull();
    expect(isPlanChange("hook")).toBe(true);
    expect(isPlanChange("go viral")).toBe(false);
  });
});
