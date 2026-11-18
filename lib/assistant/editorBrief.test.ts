import { describe, expect, it } from "vitest";
import { editorPrompt, isFilmedScript } from "./editorBrief";
import { PROMPT_MAX } from "@/lib/studioClips/reference";

const body = `1. 0 to 2s
Film: phone at eye level, you mid-sentence.
On screen: Stop guessing what to post
Say: If you spend Sunday guessing what to post, watch this.
Transition: cut on action

2. 2 to 8s
Film: screen recording of SOCIA's plan.
Say: SOCIA reads your account and writes the week.

Caption: Stop guessing. #socialmedia
Sound: light beat
Filming notes: face a window.
Editing: fast cuts every 2 seconds, captions low third, punch-in on the hook.
Your lines: If you spend Sunday guessing...`;

describe("editorPrompt", () => {
  const p = editorPrompt({ title: "SOCIA pitch", body }, { approach: "Open on the problem." });

  it("carries the beats and the editing directions, not the caption, sound or read-aloud lines", () => {
    expect(p).toContain("Edit my clips into this video: SOCIA pitch.");
    expect(p).toContain("Open on the problem.");
    expect(p).toContain("Editing: fast cuts every 2 seconds");
    expect(p).toContain("Say: SOCIA reads your account");
    expect(p).toContain("Transition: cut on action");
    expect(p).not.toContain("#socialmedia");
    expect(p).not.toContain("light beat");
    expect(p).not.toContain("Your lines");
  });

  it("fits the editor's prompt limit, cutting the beats at a word", () => {
    const long = editorPrompt({ title: "T", body: `${"Film: a wide shot of the room. ".repeat(200)}\nEditing: slow.` });
    expect(long.length).toBeLessThanOrEqual(PROMPT_MAX);
    expect(long).toContain("Editing: slow.");
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("isFilmedScript", () => {
  it("is a script with shots to film, not a caption or hooks", () => {
    expect(isFilmedScript({ kind: "script", body })).toBe(true);
    expect(isFilmedScript({ kind: "caption", body })).toBe(false);
    expect(isFilmedScript({ kind: "script", body: "Just an outline" })).toBe(false);
    expect(isFilmedScript(null)).toBe(false);
  });
});
