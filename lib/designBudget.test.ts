// The design system's budget. It reads the system's stylesheets and components
// and fails when a value is declared outside the tokens, when the token scale
// grows past its budget, or when a banned device (gradient, blur, glow,
// entrance keyframes, an em dash in copy) appears. As pages migrate, add their
// stylesheet to SYSTEM_CSS and their components to SYSTEM_TSX so the budget
// covers them too. See docs/design/redesign-direction.md, section 9.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TOKENS = "app/styles/tokens.css";
const SYSTEM_CSS = ["app/styles/base.css", "app/styles/primitives.css", "app/styles/shell.css", "app/styles/charts.css", "app/(app)/dashboard/dashboard.css", "app/(app)/analytics/analytics.css", "components/landing/landing.css"];
const SYSTEM_TSX = ["components/system"];

const BUDGET = {
  fontSizes: 10, // five app sizes, four marketing sizes, and the first-screen wordmark
  fontWeights: 3,
  radii: 6, // chip, control, card, panel, dialog, pill
  durations: 4,
  keyframes: 1, // the spinner
};

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function listFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...listFiles(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const tokens = stripComments(read(TOKENS));
const system = SYSTEM_CSS.map((p) => stripComments(read(p))).join("\n");
const all = `${tokens}\n${system}`;

describe("design budget: tokens", () => {
  it("keeps the type scale within budget", () => {
    const sizes = new Set(Array.from(tokens.matchAll(/--fs-[\w-]+:\s*([^;]+);/g), (m) => m[1].trim()));
    expect(sizes.size).toBeLessThanOrEqual(BUDGET.fontSizes);
    const weights = new Set(Array.from(tokens.matchAll(/--fw-[\w-]+:\s*(\d+);/g), (m) => m[1]));
    expect(weights.size).toBeLessThanOrEqual(BUDGET.fontWeights);
  });

  it("keeps radii and durations within budget", () => {
    const radii = new Set(Array.from(tokens.matchAll(/--r-[\w-]+:\s*([^;]+);/g), (m) => m[1].trim()));
    expect(radii.size).toBeLessThanOrEqual(BUDGET.radii);
    const durations = new Set(Array.from(tokens.matchAll(/--t-[\w-]+:\s*([^;]+);/g), (m) => m[1].trim()));
    expect(durations.size).toBeLessThanOrEqual(BUDGET.durations);
  });
});

describe("design budget: system stylesheets", () => {
  it("declare type, radius and timing through tokens only", () => {
    const literalSizes = system.match(/font-size:\s*\d/g) ?? [];
    expect(literalSizes, "literal font-size").toEqual([]);
    const literalWeights = system.match(/font-weight:\s*\d/g) ?? [];
    expect(literalWeights, "literal font-weight").toEqual([]);
    const literalRadii = (system.match(/border-radius:\s*[^;]+;/g) ?? []).filter((d) => !/var\(--r-/.test(d));
    expect(literalRadii, "literal border-radius").toEqual([]);
    const literalTimes = (system.match(/transition[^;]*;/g) ?? []).filter((d) => /\d+ms|\d*\.\d+s\b/.test(d));
    expect(literalTimes, "literal duration in a transition").toEqual([]);
  });

  it("carry no gradients, blur, glow or decorative keyframes", () => {
    expect(all.match(/gradient\(/g) ?? [], "gradients").toEqual([]);
    expect(all.match(/backdrop-filter/g) ?? [], "backdrop blur").toEqual([]);
    expect(all.match(/drop-shadow\(/g) ?? [], "glow filters").toEqual([]);
    const shadows = (system.match(/box-shadow:\s*[^;]+;/g) ?? []).filter((d) => /rgba\(var\(--accent-rgb\)/.test(d));
    expect(shadows, "coloured glow shadows").toEqual([]);
    const keyframes = all.match(/@keyframes\s+[\w-]+/g) ?? [];
    expect(keyframes.length, `keyframes: ${keyframes.join(", ")}`).toBeLessThanOrEqual(BUDGET.keyframes);
    expect(all.match(/animation:/g) ?? [], "animations outside the spinner").toHaveLength(1);
  });

  it("gate hover motion to real pointers", () => {
    const hoverTransforms = (system.match(/:hover[^{]*\{[^}]*transform/g) ?? []).length;
    expect(hoverTransforms, "hover rules that move things").toBe(0);
  });

  it("use one class namespace", () => {
    const withoutUrls = system.replace(/url\([^)]*\)/g, "url()");
    const classes = new Set(Array.from(withoutUrls.matchAll(/\.([a-zA-Z][\w-]*)/g), (m) => m[1]));
    const allowed = /^(s-|is-|has-|dash-|an-|lp-|num$|id$|sub$|act$|key$|sorted$|dark$|brandmark$|instagram$|youtube$|facebook$|tiktok$)/;
    const strays = [...classes].filter((c) => !allowed.test(c));
    expect(strays, "classes outside the s- namespace").toEqual([]);
  });

  it("set no text below the 12px floor", () => {
    const tiny = Array.from(tokens.matchAll(/--fs-[\w-]+:\s*(\d+)px/g), (m) => Number(m[1])).filter((n) => n < 12);
    expect(tiny).toEqual([]);
  });
});

describe("design budget: system components", () => {
  const files = SYSTEM_TSX.flatMap((d) => listFiles(d, /\.tsx?$/));

  it("exist", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("use no em dashes in copy (a dash glyph is written as an escape)", () => {
    for (const f of files) {
      expect(read(f).includes("—"), `em dash in ${f}`).toBe(false);
    }
  });

  it("use no emoji, no Sparkles icon and no Tailwind utility classes", () => {
    for (const f of files) {
      const src = read(f);
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), `emoji in ${f}`).toBe(false);
      expect(/\bSparkles?\b/.test(src), `Sparkles in ${f}`).toBe(false);
      expect(/className="[^"]*\b(flex|grid|p-\d|px-\d|text-sm|rounded-\w+|bg-\w+)\b/.test(src), `Tailwind utilities in ${f}`).toBe(false);
    }
  });
});
