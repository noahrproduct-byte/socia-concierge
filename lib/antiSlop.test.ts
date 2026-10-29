// SOCIA's anti-AI-slop guard (docs/design/anti-slop-standard.md, section 18).
//
// Scans every page, component and stylesheet for the signs a pattern match
// can catch reliably. It is a ratchet: lib/antiSlop.baseline.json records the
// occurrences that exist today, per rule and file. A new occurrence anywhere
// fails; so does a stale allowance (a file got cleaner but its entry wasn't
// lowered). The baseline only ever shrinks.
//
// After cleaning a page:  UPDATE_SLOP_BASELINE=1 npx vitest run lib/antiSlop.test.ts
// rewrites the baseline, and refuses to if any count went up.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "lib/antiSlop.baseline.json");

type Rule = { id: string; why: string; kind: "tsx" | "css"; count: (src: string) => number };

const matches = (rx: RegExp) => (src: string) => (src.match(rx) ?? []).length;

/** Code without comments, so notes to developers never count as UI. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Lucide icons that read as generic "AI" decoration (sparkles, wands, rockets, brains, bots). */
const AI_ICONS = /\b(Sparkles|Sparkle|Wand|Wand2|WandSparkles|Rocket|Brain|BrainCircuit|BrainCog|Bot|BotMessageSquare)\b/g;

const RULES: Rule[] = [
  {
    id: "fake-proof",
    why: "Invented proof: placeholder people, brands, logos or audit counts (P0, sections 1, 7, 17.3)",
    kind: "tsx",
    count: matches(/Trusted by|accounts audited|Lorem ipsum|John Doe|Jane (Doe|Cooper)|\bAcme\b|Competitor [ABC]\b|As seen (in|on)\b|★★★/g),
  },
  {
    id: "stock-phrase",
    why: "Generic marketing phrase (P1, section 6)",
    kind: "tsx",
    count: matches(/unlock the power|supercharge|\belevate your|revolutioni[sz]e|cutting-edge|harness the power|\bseamless(ly)?\b|\beffortless(ly)?\b|all-in-one|next-generation|the future of|actionable intelligence|everything you need to|say goodbye to|from chaos to clarity|work smarter|endless possibilities|focus on what matters|in today's fast-paced|let's dive in|great question/gi),
  },
  { id: "dead-link", why: 'href="#" goes nowhere (P0, section 5)', kind: "tsx", count: matches(/href=(\{\s*)?["']#["']/g) },
  {
    id: "ai-icon",
    why: "Generic AI icon (sparkles, wand, rocket, brain, bot) (P1, section 4)",
    kind: "tsx",
    count: (src) => {
      const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/);
      return imp ? (imp[1].match(AI_ICONS) ?? []).length : 0;
    },
  },
  { id: "emoji", why: "Emoji or sparkle characters in UI text (P2, sections 6, 17.5)", kind: "tsx", count: matches(/[\u{1F300}-\u{1FAFF}✨⭐⚡\u{1F680}]/gu) },
  { id: "em-dash", why: "Em dash in user-facing text (SOCIA rule; section 6)", kind: "tsx", count: matches(/—/g) },
  { id: "oops-error", why: '"Oops" / "Something went wrong" instead of what failed and what to do (P1, section 17.6)', kind: "tsx", count: matches(/\boops\b|something went wrong/gi) },
  { id: "gradient-text", why: "Gradient-clipped text (P1, section 2)", kind: "css", count: matches(/background-clip:\s*text/g) },
  { id: "glass", why: "Frosted glass / backdrop blur (P1, section 2)", kind: "css", count: matches(/backdrop-filter/g) },
  { id: "gradient", why: "Decorative gradient (P1, section 2)", kind: "css", count: matches(/(linear|radial|conic)-gradient\(/g) },
  { id: "glow", why: "Text glow (P1, section 2)", kind: "css", count: matches(/text-shadow\s*:\s*(?!none)/g) },
  { id: "loop-animation", why: "Looping animation (only the spinner may loop) (P1, section 5)", kind: "css", count: matches(/\binfinite\b/g) },
];

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) { if (n !== "node_modules" && !n.startsWith(".")) files(p, ext, out); }
    else if (ext.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

type Counts = Record<string, Record<string, number>>;

function scan(): Counts {
  const tsx = [...files("app", /\.tsx$/), ...files("components", /\.tsx$/)];
  const css = [...files("app", /\.css$/), ...files("components", /\.css$/)];
  const out: Counts = {};
  for (const rule of RULES) {
    const list = rule.kind === "tsx" ? tsx : css;
    for (const f of list) {
      const raw = readFileSync(join(ROOT, f), "utf8");
      const n = rule.count(rule.kind === "tsx" ? stripComments(raw) : raw.replace(/\/\*[\s\S]*?\*\//g, ""));
      if (n) (out[rule.id] ??= {})[f] = n;
    }
  }
  return out;
}

const readBaseline = (): Counts => (existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {});

describe("anti-AI-slop guard (docs/design/anti-slop-standard.md)", () => {
  const now = scan();
  const base = readBaseline();

  it("adds no new sign anywhere", () => {
    const grew: string[] = [];
    for (const rule of RULES) {
      for (const [f, n] of Object.entries(now[rule.id] ?? {})) {
        const allowed = base[rule.id]?.[f] ?? 0;
        if (n > allowed) grew.push(`${rule.id}: ${f} has ${n} (allowed ${allowed}). ${rule.why}`);
      }
    }
    expect(grew).toEqual([]);
  });

  it("keeps the baseline honest: cleaned files must lower their allowance", () => {
    if (process.env.UPDATE_SLOP_BASELINE) {
      writeFileSync(BASELINE_PATH, JSON.stringify(now, null, 2) + "\n");
      return;
    }
    const stale: string[] = [];
    for (const [id, byFile] of Object.entries(base)) {
      for (const [f, n] of Object.entries(byFile)) {
        if ((now[id]?.[f] ?? 0) < n) stale.push(`${id}: ${f} now ${now[id]?.[f] ?? 0}, baseline ${n}`);
      }
    }
    // Lower it with: UPDATE_SLOP_BASELINE=1 npx vitest run lib/antiSlop.test.ts
    expect(stale).toEqual([]);
  });

  it("every rule explains itself", () => {
    for (const r of RULES) expect(r.why.length).toBeGreaterThan(10);
  });
});
