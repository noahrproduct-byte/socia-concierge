// The research card of an answer, from what the model picked and what SOCIA
// really found. The model names examples by [R#] and says why each fits; the
// link, creator, thumbnail and every number come from the research itself, so
// a ref the model made up, or a number it wrote, can't reach the screen.
// Browser-safe.

import type { AskAction, AskResearch, ModelAnswer, ResearchStep } from "../ask";
import type { ResearchExample } from "./examples";
import type { IntentKind } from "./intent";
import { LETTERS, isCreativeStyle } from "./direction";

const q = (s: string) => encodeURIComponent(s.replace(/\s+/g, " ").trim().slice(0, 400));

/** A next step's page. The draft (or the approach) is carried in so the page opens with it. */
export function stepHref(type: ResearchStep, seed: string): string {
  switch (type) {
    case "content_plan": return `/plan?note=${q(seed)}`;
    case "writer": return `/create?caption=${q(seed)}`;
    case "editor": return "/studio?mode=edit";
    case "idea": return `/plan/calendar?compose=1&caption=${q(seed)}`;
  }
}

const STEP_LABEL: Record<ResearchStep, string> = {
  content_plan: "Add to Content Plan",
  writer: "Open in Create Post",
  editor: "Make it in the Video editor",
  idea: "Save as a calendar draft",
};

/** Numbers never travel in the model's words for an example: anything that looks like a count is cut from "why". */
const UNIT = "views?|likes?|comments?|followers?|subscribers?|shares?|saves?";
const noNumbers = (s: string) => s
  .replace(new RegExp(`\\b\\d[\\d,.]*\\s*(?:(?:k|m|b|million|thousand|x|×|%)\\s*(?:${UNIT})?|times|${UNIT})(?=\\W|$)`, "gi"), "")
  .replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").replace(/[\s,;:]+$/, "").trim();

export function buildResearch(opts: {
  raw: ModelAnswer["research"] | null | undefined;
  kind: IntentKind;
  examples: ResearchExample[];
  notes: string[];
  seed: string;
  /** a ready caption from the draft, for Create Post */
  caption?: string | null;
  clean: (s: string) => string;
}): AskResearch | null {
  const r = opts.raw;
  const byRef = new Map(opts.examples.map((x) => [x.ref, x]));
  const picked: AskResearch["examples"] = [];
  // Up to four, each in a different creative style: four near-identical videos are no choice at all.
  for (const e of r?.examples ?? []) {
    const ref = String(e?.ref ?? "").replace(/^\[|\]$/g, "").trim().toUpperCase();
    const x = byRef.get(ref);
    if (!x || picked.some((p) => p.ref === ref)) continue;
    const style = isCreativeStyle(e.style) ? e.style : null;
    if (!style || picked.some((p) => p.style === style)) continue;
    const techniques = (Array.isArray(e.techniques) ? e.techniques : []).map((t) => noNumbers(opts.clean(String(t ?? ""))).slice(0, 120)).filter(Boolean).slice(0, 3);
    picked.push({ ...x, why: noNumbers(opts.clean(String(e.why ?? ""))).slice(0, 240), letter: LETTERS[picked.length], style, techniques });
    if (picked.length >= LETTERS.length) break;
  }
  const approach = opts.clean(r?.approach ?? "");
  if (!approach && !picked.length) return null;
  const seen = new Set<ResearchStep>();
  const steps: AskAction[] = [];
  for (const s of r?.steps ?? []) {
    if (!s || !(s.type in STEP_LABEL) || seen.has(s.type)) continue;
    seen.add(s.type);
    steps.push({ label: STEP_LABEL[s.type], href: stepHref(s.type, s.type === "writer" && opts.caption ? opts.caption : opts.seed || approach) });
  }
  return {
    kind: opts.kind,
    approach,
    examples: picked,
    why: opts.clean(r?.why ?? ""),
    test: opts.clean(r?.test ?? ""),
    steps: steps.slice(0, 4),
    notes: opts.notes,
  };
}
