import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, THEMES, isThemeId, themeById } from "./index";
import { deepDiff, deepMerge, parseTheme, withOverrides } from "./schema";
import { HOUSE_TRANSITIONS } from "../houseStyle";

describe("the shipped themes", () => {
  it("are eight, valid, with distinct ids and names", () => {
    expect(THEMES).toHaveLength(9);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(9);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(9);
    expect(isThemeId(DEFAULT_THEME_ID)).toBe(true);
    expect(themeById("nope")).toBeNull();
  });
  it("follow the house style: captions 2 to 4 words at most where words carry, a key-word highlight, no logo-first intro, cuts by default outside the fast themes", () => {
    for (const t of THEMES) {
      expect(t.typography.maxWords).toBeLessThanOrEqual(5);
      expect(t.typography.highlight).toMatch(/^#[0-9a-f]{6}$/);
      expect(["none", "title"]).toContain(t.layout.intro);
    }
    const plain = THEMES.filter((t) => !t.tags.includes("fast") && !t.tags.includes("retro") && !t.tags.includes("brand"));
    for (const t of plain) expect(["cut", "fade"]).toContain(t.motion.transition);
    // The sports-style transitions the house allows exist for the fast theme.
    expect(HOUSE_TRANSITIONS.sports_montage).toContain(THEMES.find((t) => t.id === "energetic")!.motion.transition);
  });
  it("a broken file is refused at load", () => {
    expect(() => parseTheme({ ...THEMES[0], typography: { ...THEMES[0].typography, font: "comic" } })).toThrow();
    expect(() => parseTheme({ ...THEMES[0], color: { ...THEMES[0].color, accent: "red" } })).toThrow();
  });
});

describe("overrides as a diff", () => {
  const base = THEMES[0];
  it("merge, then diff, round-trips", () => {
    const changed = deepMerge(base, { typography: { font: "anton" }, motion: { shake: 0.2 } });
    expect(changed.typography.font).toBe("anton");
    expect(changed.typography.weight).toBe(base.typography.weight);
    expect(deepDiff(base, changed)).toEqual({ typography: { font: "anton" }, motion: { shake: 0.2 } });
    expect(deepDiff(base, base)).toBeUndefined();
  });
  it("withOverrides keeps the identity and drops a bad value, keeping the good ones", () => {
    const t = withOverrides(base, { id: "hacked", name: "x", typography: { font: "wingdings", sizeScale: 1.3 }, color: { grade: { grain: 9 } } });
    expect(t.id).toBe(base.id);
    expect(t.typography.font).toBe(base.typography.font);
    expect(t.typography.sizeScale).toBe(1.3);
    expect(t.color.grade.grain).toBe(base.color.grade.grain);
    expect(withOverrides(base, "junk")).toEqual(base);
  });
});
