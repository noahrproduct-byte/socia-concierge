import { describe, expect, it } from "vitest";
import { playbookText } from "../studioClips/analysis";
import { buildUserPrompt } from "../prompt";

const BLOCK = "What goes viral in this niche (SOCIA studied 6 real Reels and Shorts from 9 accounts; read 2026-11-12):\n- Proven on-screen text: \"send this to someone you'd ___ with\" (2 Reels, 2 accounts).";

describe("the playbook reaches the prompts", () => {
  it("is a block in the editor's cut prompt when there is one, and nothing otherwise", () => {
    expect(playbookText({ niche: "pizza", location: null, goals: null, brand: null, playbook: BLOCK })).toBe(`\n\n# ${BLOCK}`);
    expect(playbookText({ niche: "pizza", location: null, goals: null, brand: null })).toBe("");
  });
  it("is a section of the plan prompt, to build on and name in a post's evidence", () => {
    const evidence = { postsBlock: "", competitorsBlock: "", outcomesBlock: "", formatsBlock: "", decisionsBlock: "", experimentsBlock: "", trendsBlock: "", playbookBlock: BLOCK, used: {} as never };
    const prompt = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "salvos", goal: "", niche: "Pizza", platform: "instagram" } as never, null, evidence);
    expect(prompt).toContain(`# ${BLOCK}`);
    expect(prompt).toContain("name the pattern and its basis in that post's evidence field");
    const without = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "salvos", goal: "", niche: "Pizza", platform: "instagram" } as never, null, { ...evidence, playbookBlock: "" });
    expect(without).not.toContain("What goes viral in this niche");
  });
});
