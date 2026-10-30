import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_INFO, SCORE_LABEL, studioSchema, type CategoryId } from "./studio";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the video review checks what the brief lists", () => {
  it("has a category for each: hook, structure, pacing, visual clarity, audio, caption readability, call to action, goal fit", () => {
    const ids = Object.keys(CATEGORY_INFO) as CategoryId[];
    for (const id of ["hook", "structure", "pacing", "clarity", "visual", "captions", "audio", "cta", "goal"] as CategoryId[]) expect(ids).toContain(id);
    const schemaIds: readonly string[] = studioSchema.properties.categories.items.properties.id.enum;
    expect(new Set(schemaIds)).toEqual(new Set(ids));
  });

  it("marks what a still image can't show, and never guesses caption readability without text", () => {
    expect(CATEGORY_INFO.structure.video_only).toBe(true);
    expect(CATEGORY_INFO.captions.analyzes.join(" ")).toMatch(/not assessable when no on-screen text is visible/);
  });
});

describe("the score is a creative assessment, never a prediction", () => {
  it("labels the top band as ready to post, not as potential", () => {
    expect(SCORE_LABEL(90)).toBe("Ready to post");
    expect(Object.values([90, 75, 60, 40].map(SCORE_LABEL)).join(" ")).not.toMatch(/potential|viral|reach/i);
  });

  it("says so on screen and in the model's instructions", () => {
    expect(read("components/studio/StudioPanels.tsx")).toMatch(/A creative assessment of this draft, not a prediction of reach, views or virality\./);
    expect(read("app/api/studio/analyze/route.ts")).toMatch(/creative readiness assessment of this draft[^.]*\. Never predict views, reach, virality or retention/);
  });
});
