import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_INFO, FRAME_MAX, SCORE_LABEL, frameTimes, studioSchema, type CategoryId } from "./studio";

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
    // The score sits on the Analyze page (components/studio/RaterPanels.tsx).
    expect(read("components/studio/RaterPanels.tsx")).toMatch(/A creative assessment of this draft, not a prediction of reach, views or virality\./);
    expect(read("app/api/studio/analyze/route.ts")).toMatch(/creative readiness assessment of this draft[^.]*\. Never predict views, reach, virality or retention/);
  });
});

describe("how much of a video the rater sees", () => {
  it("samples a short video 10 times, front-loaded", () => {
    const t = frameTimes(8);
    expect(t).toHaveLength(10);
    expect(t.slice(0, 4)).toEqual([0, 0.7, 1.5, 2.5]);
    expect(Math.max(...t)).toBeLessThan(8);
  });
  it("adds about one frame every two seconds on a longer video, up to the limit", () => {
    expect(frameTimes(30)).toHaveLength(4 + 14);
    expect(frameTimes(63)).toHaveLength(FRAME_MAX);
    expect(frameTimes(180)).toHaveLength(FRAME_MAX);
  });
  it("stays in order and inside the video, however short it is", () => {
    for (const d of [1.2, 3, 8, 63, 180]) {
      const t = frameTimes(d);
      expect(t.every((x, i) => x < d && (i === 0 || x > t[i - 1]))).toBe(true);
    }
  });
});
