import { describe, expect, it } from "vitest";
import { SCRIPT } from "./themeScript";
import { THEME_COLOR } from "./appearance";

describe("theme script", () => {
  it("is valid JavaScript (a syntax error stops it running at all)", () => {
    expect(() => new Function(SCRIPT)).not.toThrow();
  });
  it("paints the light theme with the light browser chrome color", () => {
    expect(SCRIPT).toContain('dataset.theme="light"');
    expect(SCRIPT).toContain(THEME_COLOR.light);
  });
});
