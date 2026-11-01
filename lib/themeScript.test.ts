import { describe, expect, it } from "vitest";
import { SCRIPT } from "./themeScript";

describe("theme script", () => {
  it("is valid JavaScript (a syntax error stops it running at all)", () => {
    expect(() => new Function(SCRIPT)).not.toThrow();
  });
  it("keeps the public-page pattern intact", () => {
    expect(SCRIPT).toContain("/^\\/(login|");
  });
});
