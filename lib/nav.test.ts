import { describe, it, expect } from "vitest";
import { DOCK, NAV, NAV_GROUPS, activeNavGroup, activeNavKey, activeNavLabel, dockKeyFor, navIndex } from "./nav";

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
    expect(activeNavGroup("/discover")).toBe("intelligence");
    expect(activeNavGroup("/plan/calendar")).toBe("plan");
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
  it("links Overview, Analytics, Discover, Plan and Studio directly, each a real section, once", () => {
    expect(DOCK.map((d) => d.label)).toEqual(["Overview", "Analytics", "Discover", "Plan", "Studio"]);
    expect(new Set(DOCK.map((d) => d.key)).size).toBe(DOCK.length);
    for (const d of DOCK) expect(NAV.some((n) => n.key === d.key)).toBe(true);
    for (const k of DOCK.flatMap((d) => d.also ?? [])) expect(NAV.some((n) => n.key === k)).toBe(true);
  });

  it("lights Plan on both the Content Plan and the Calendar", () => {
    expect(activeNavKey("/plan")).toBe("plan");
    expect(activeNavKey("/plan/calendar")).toBe("calendar");
    expect(dockKeyFor(activeNavKey("/plan"))).toBe("plan");
    expect(dockKeyFor(activeNavKey("/plan/calendar"))).toBe("plan");
    expect(activeNavLabel("/plan/calendar")).toBe("Calendar");
    expect(dockKeyFor(activeNavKey("/comments"))).toBeNull();
  });
});
