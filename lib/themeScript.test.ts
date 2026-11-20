import { describe, expect, it } from "vitest";
import { SCRIPT } from "./themeScript";
import { THEME_COLOR, isLightOnly, resolveAppearance } from "./appearance";

/** Runs the head script against a fake page and returns what it painted. */
function paint(opts: { saved?: string | null; path: string; deviceDark?: boolean }) {
  const classes = new Set<string>();
  const html = {
    dataset: {} as Record<string, string>,
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    style: {} as Record<string, string>,
  };
  const meta = { content: "" };
  const g = globalThis as Record<string, unknown>;
  const before = { document: g.document, localStorage: g.localStorage, location: g.location, window: g.window };
  g.document = { documentElement: html, querySelector: () => meta };
  g.localStorage = { getItem: () => opts.saved ?? null };
  g.location = { pathname: opts.path };
  g.window = { matchMedia: () => ({ matches: Boolean(opts.deviceDark) }) };
  try {
    new Function(SCRIPT)();
  } finally {
    Object.assign(g, before);
  }
  return { theme: html.dataset.theme, dark: classes.has("dark"), scheme: html.style.colorScheme, meta: meta.content };
}

describe("theme script", () => {
  it("is valid JavaScript (a syntax error stops it running at all)", () => {
    expect(() => new Function(SCRIPT)).not.toThrow();
  });

  it("paints light when nothing is saved, or what is saved isn't a choice", () => {
    expect(paint({ path: "/dashboard" })).toEqual({ theme: "light", dark: false, scheme: "light", meta: THEME_COLOR.light });
    expect(paint({ saved: "purple", path: "/dashboard" }).theme).toBe("light");
  });

  it("paints dark for Dark, and for System on a device set to dark", () => {
    expect(paint({ saved: "dark", path: "/dashboard" })).toEqual({ theme: "dark", dark: true, scheme: "dark", meta: THEME_COLOR.dark });
    expect(paint({ saved: "system", path: "/plan", deviceDark: true }).theme).toBe("dark");
    expect(paint({ saved: "system", path: "/plan", deviceDark: false }).theme).toBe("light");
  });

  it("keeps the public site light whatever the choice", () => {
    for (const path of ["/", "/pricing", "/privacy", "/terms", "/login", "/signup", "/l/salvos"]) {
      expect(paint({ saved: "dark", path }).theme, path).toBe("light");
    }
    expect(paint({ saved: "dark", path: "/plan/calendar" }).theme).toBe("dark");
  });
});

describe("appearance", () => {
  it("resolves System from the device and matches the script's public pages", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(isLightOnly("/pricing")).toBe(true);
    expect(isLightOnly("/dashboard")).toBe(false);
    expect(isLightOnly("/plan")).toBe(false);
  });
});
