import { describe, it, expect } from "vitest";
import { DOCK, NAV, NAV_GROUPS, activeNavGroup, activeNavKey, navIndex } from "./nav";

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

  it("is null off the menu and for a missing path", () => {
    expect(activeNavKey("/pricing")).toBeNull();
    expect(activeNavKey(null)).toBeNull();
  });

  it("covers every menu entry", () => {
    for (const n of NAV) expect(activeNavKey(n.href)).toBe(n.key);
  });
});

describe("activeNavGroup and navIndex", () => {
  it("puts every section in a headbar group, and every group has a section", () => {
    for (const g of NAV_GROUPS) expect(NAV.some((n) => n.group === g.key)).toBe(true);
    expect(activeNavGroup("/roundup")).toBe("overview");
    expect(activeNavGroup("/competitors")).toBe("intelligence");
    expect(activeNavGroup("/calendar")).toBe("plan");
    expect(activeNavGroup("/studio/abc")).toBe("create");
    expect(activeNavGroup("/settings")).toBe("manage");
    expect(activeNavGroup("/pricing")).toBeNull();
  });

  it("orders sections the way the menu lists them", () => {
    expect(navIndex("/dashboard")).toBe(0);
    expect(navIndex("/analytics")).toBeGreaterThan(navIndex("/reports"));
    expect(navIndex("/pricing")).toBe(-1);
  });
});

describe("DOCK", () => {
  it("links six real sections directly, each once", () => {
    expect(DOCK).toHaveLength(6);
    expect(new Set(DOCK.map((d) => d.key)).size).toBe(DOCK.length);
    for (const d of DOCK) expect(NAV.some((n) => n.key === d.key)).toBe(true);
  });
});
