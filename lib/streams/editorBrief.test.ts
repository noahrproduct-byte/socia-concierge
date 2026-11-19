import { describe, expect, it } from "vitest";
import { clipEditorBrief, clipFileName } from "./editorBrief";
import { PROMPT_MAX } from "@/lib/studioClips/reference";

describe("clipEditorBrief", () => {
  const c = { login: "stableronaldo", title: "the garage", why: "Chat ran 74x its usual pace with 30 people, for 20 s.", duration: 30, score: 83 };
  it("asks for a vertical, captioned Reel that opens on the moment chat reacted to", () => {
    const b = clipEditorBrief(c);
    expect(b).toContain("vertical 9:16 Reel");
    expect(b).toContain("stableronaldo");
    expect(b).toContain("Chat ran 74x");
    expect(b).toContain("in a 30-second clip");
    expect(b).toMatch(/Open on that moment/);
    expect(b).toMatch(/captions from what is said/);
    expect(b).toMatch(/Add no music/);
    expect(b.length).toBeLessThanOrEqual(PROMPT_MAX);
  });
  it("leaves out what isn't known", () => {
    const b = clipEditorBrief({ login: "x", title: null, why: null, duration: null, score: null });
    expect(b).not.toContain("Why SOCIA clipped it");
    expect(b).not.toContain("-second clip");
  });
  it("names the file after the channel and day", () => {
    expect(clipFileName({ login: "stable_ronaldo!", spikeAt: "2026-11-18T22:32:00Z" })).toBe("stable_ronaldo-clip-2026-11-18.mp4");
  });
});
