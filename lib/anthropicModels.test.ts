import { describe, expect, it } from "vitest";
import { EASY_TASKS, FAST_MODEL, MODEL, modelFor } from "./anthropic";

describe("which model a task runs on", () => {
  it("runs the easier tasks on the fast model", () => {
    expect(FAST_MODEL).not.toBe(MODEL);
    for (const task of EASY_TASKS) expect(modelFor(task)).toBe(FAST_MODEL);
    expect([...EASY_TASKS]).toEqual(["caption", "improve", "comment_reply", "animated_pick", "animated_fit"]);
  });
  it("keeps the work the product is judged on on the main model", () => {
    expect(modelFor("default")).toBe(MODEL);
    expect(modelFor("clipper_pick")).toBe(MODEL);
    expect(modelFor("studio_batch")).toBe(MODEL);
  });
});
