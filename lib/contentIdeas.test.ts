import { describe, expect, it } from "vitest";
import { contentIdeasQuestion } from "./contentIdeas";

describe("contentIdeasQuestion", () => {
  it("asks for one idea, with or without a topic, grounded in real videos", () => {
    expect(contentIdeasQuestion("idea", "")).toMatch(/^Give me one strong video idea for this week\. Base it on my own results/);
    expect(contentIdeasQuestion("idea", "  our new  calzone ")).toMatch(/^Give me one strong video idea for this week about our new calzone\./);
  });
  it("keeps the person's own idea and asks for references before the script", () => {
    const q = contentIdeasQuestion("video", "how I built an AI startup at 16");
    expect(q).toContain("Help me make this video: how I built an AI startup at 16.");
    expect(q).toMatch(/real short videos .* inside or outside my niche/);
    expect(q).toMatch(/for the one I choose\.$/);
  });
});
