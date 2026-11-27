import { describe, expect, it } from "vitest";
import { isGraphicsLost, renderErrorCopy } from "./renderErrors";

describe("what a failed render says", () => {
  it("turns the renderer's graphics error into plain words (the one Noah was shown, 2026-11-26)", () => {
    const raw = new Error("WebGL context was lost during canvas effect rendering. This typically happens in headless or memory-constrained environments (e.g. Remotion Lambda). Try reducing concurrency or increasing the Lambda function memory.");
    expect(isGraphicsLost(raw)).toBe(true);
    const copy = renderErrorCopy(raw);
    expect(copy).toMatch(/graphics memory/);
    expect(copy).not.toMatch(/WebGL|Lambda|Remotion|concurrency/);
  });
  it("keeps SOCIA's own plain messages", () => {
    expect(renderErrorCopy(new Error("Some of its clips have expired from storage, so it can't be made."))).toBe("Some of its clips have expired from storage, so it can't be made.");
    expect(renderErrorCopy(new Error("Upload failed: The file is too large."))).toBe("The file is too large.");
  });
  it("never shows code", () => {
    for (const m of ["Cannot read properties of undefined (reading 'x')", "TypeError: a.b is not a function", ""]) {
      expect(renderErrorCopy(new Error(m))).toMatch(/couldn't be made this time/);
    }
    expect(renderErrorCopy(new Error("Failed to fetch"))).toMatch(/lost its connection/);
  });
});
