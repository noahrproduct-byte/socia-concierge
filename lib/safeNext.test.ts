import { describe, it, expect } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNext("/oauth/authorize?client_id=x&state=y")).toBe("/oauth/authorize?client_id=x&state=y");
    expect(safeNext("/settings#ai-assistants")).toBe("/settings#ai-assistants");
  });
  it("never leaves the site", () => {
    for (const bad of ["@evil.example", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil", ""]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
    expect(safeNext(null, "/x")).toBe("/x");
  });
});
