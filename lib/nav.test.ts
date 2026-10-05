import { describe, it, expect } from "vitest";
import { NAV, activeNavKey } from "./nav";

describe("activeNavKey", () => {
  it("names the section a path belongs to, including nested paths", () => {
    expect(activeNavKey("/analytics")).toBe("analytics");
    expect(activeNavKey("/create/draft/123")).toBe("create");
    expect(activeNavKey("/settings")).toBe("settings");
  });

  it("does not match a section that merely shares a prefix", () => {
    expect(activeNavKey("/toolbox")).toBeNull();
    expect(activeNavKey("/dashboards")).toBeNull();
  });

  it("is null off the sidebar and for a missing path", () => {
    expect(activeNavKey("/pricing")).toBeNull();
    expect(activeNavKey(null)).toBeNull();
  });

  it("covers every sidebar entry", () => {
    for (const n of NAV) expect(activeNavKey(n.href)).toBe(n.key);
  });
});
