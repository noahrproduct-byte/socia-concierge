// Studio, stages 1 and 2: the concept (what to make and why, from a planned
// post, a Discover format or the person's own idea) and the production guide
// (hooks, script, shot list, structure, filming, framing, editing, caption,
// calls to action) written for this account's brand and resources. The
// concept is assembled here from SOCIA's own records; only the guide is
// written by the model, and it is bounded here before anyone sees it. Pure.

import type { PlanItem } from "./planItems";
import type { NicheFormat } from "./nicheFormats";
import { formatBasis } from "./nicheFormats";

export type ConceptSource = "plan" | "format" | "idea";

export type StudioConcept = {
  source: ConceptSource;
  title: string;
  concept: string;
  /** Strategic reasoning: why this, from the plan or the format's evidence. */
  reasoning: string;
  audience: string | null;
  /** The person's main goal (the plan's purpose is part of the reasoning). */
  goal: string | null;
  /** How success is read, when the plan says. */
  successMetric: string | null;
  /** Supporting research lines (evidence, a format's basis). */
  research: string[];
  format: string;
  platform: string | null;
  /** The plan it belongs to, when it came from one. */
  planId: string | null;
  day: string | null;
};

export type GuideHook = { style: string; text: string };
export type GuideBeat = { beat: string; line: string; seconds: number | null };
export type GuideShot = { shot: string; framing: string; seconds: number | null; notes: string };

export type ProductionGuide = {
  v: 1;
  length_sec: number | null;
  structure: string[];
  hooks: GuideHook[];
  script: GuideBeat[];
  shots: GuideShot[];
  filming: string[];
  editing: string[];
  caption: string;
  ctas: string[];
  generated_at: string;
  edited_at: string | null;
};

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\u2014/g, ",").slice(0, n) : "");
const clipList = (xs: unknown, max: number, each: number) => (Array.isArray(xs) ? xs.map((x) => clip(x, each)).filter(Boolean).slice(0, max) : []);
const secs = (v: unknown, max: number): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};
const objs = (xs: unknown) => (Array.isArray(xs) ? (xs as Record<string, unknown>[]) : []);

// ---------------------------------------------------------------------------
// Stage 1: the concept, from what SOCIA already holds
// ---------------------------------------------------------------------------

export function conceptFromPlanItem(item: PlanItem, planId: string, mainGoal: string | null): StudioConcept {
  return {
    source: "plan",
    title: item.title || item.concept.slice(0, 80),
    concept: item.concept,
    reasoning: [item.purpose, item.rationale].filter(Boolean).join(". "),
    audience: item.audience ?? null,
    goal: mainGoal,
    successMetric: item.successMetric ?? null,
    research: [item.evidence].filter((x): x is string => Boolean(x && x.trim())),
    format: item.format,
    platform: item.platform ?? null,
    planId,
    day: item.day,
  };
}

export function conceptFromFormat(f: NicheFormat, mainGoal: string | null): StudioConcept {
  return {
    source: "format",
    title: f.name,
    concept: f.adaptations[0] ?? f.summary,
    reasoning: `${f.summary} ${f.leads ? "It leads in your niche." : "It repeats in your niche."}`,
    audience: null,
    goal: mainGoal,
    successMetric: "Views or interactions against your own median",
    research: [formatBasis(f), ...f.examples.slice(0, 3).map((e) => `${e.account}: ${e.title.slice(0, 90)}${e.multiplier != null ? ` (${e.multiplier}x their usual)` : ""}`)],
    format: "Reel",
    platform: null,
    planId: null,
    day: null,
  };
}

export function conceptFromIdea(text: string, format: string, platform: string | null, mainGoal: string | null): StudioConcept {
  const t = clip(text, 1200);
  return { source: "idea", title: t.slice(0, 80), concept: t, reasoning: "Your own idea.", audience: null, goal: mainGoal, successMetric: null, research: [], format: clip(format, 40) || "Reel", platform, planId: null, day: null };
}

// ---------------------------------------------------------------------------
// Stage 2: the production guide
// ---------------------------------------------------------------------------

export const guideSchema = {
  type: "object", additionalProperties: false,
  properties: {
    length_sec: { type: "integer" },
    structure: { type: "array", items: { type: "string" } },
    hooks: { type: "array", items: { type: "object", additionalProperties: false, properties: { style: { type: "string" }, text: { type: "string" } }, required: ["style", "text"] } },
    script: { type: "array", items: { type: "object", additionalProperties: false, properties: { beat: { type: "string" }, line: { type: "string" }, seconds: { type: "integer" } }, required: ["beat", "line", "seconds"] } },
    shots: { type: "array", items: { type: "object", additionalProperties: false, properties: { shot: { type: "string" }, framing: { type: "string" }, seconds: { type: "integer" }, notes: { type: "string" } }, required: ["shot", "framing", "seconds", "notes"] } },
    filming: { type: "array", items: { type: "string" } },
    editing: { type: "array", items: { type: "string" } },
    caption: { type: "string" },
    ctas: { type: "array", items: { type: "string" } },
  },
  required: ["length_sec", "structure", "hooks", "script", "shots", "filming", "editing", "caption", "ctas"],
} as const;

export const GUIDE_SYSTEM = `You are SOCIA's producer. Write a production guide for one short-form post, for this account, from the concept and profile given.
Rules:
- Make it filmable with what they said they have: their equipment, their editing skill, and whether they film alone. Never ask for gear, skills or people they don't have. If they don't appear on camera, script voiceover or on-screen text instead.
- length_sec: a realistic total length in seconds for the format and platform.
- structure: the story beats in order, 3 to 5 short names (for example "Hook", "Problem", "Reveal", "Call to action").
- hooks: exactly 3 opening lines in the account's voice, each a different style (for example curiosity, direct, story). Original lines, never copied from a creator.
- script: one entry per beat with what is said or shown on screen and its seconds; the seconds add up to about length_sec.
- shots: the shot list in order: what is in frame, the framing (for example "overhead", "close-up at counter height", "handheld walk-in"), seconds and one practical note.
- filming: 2 to 4 practical instructions (light, sound, stability, takes).
- editing: 2 to 4 editing directions (cuts, text on screen, pacing, music only as a suggestion).
- caption: the post caption in their voice, with at most 5 hashtags at the end, never words or topics they asked to avoid.
- ctas: 2 or 3 calls to action fitting their goal.
- No claims about reach or algorithms, no guaranteed results, plain text, sentence case, no em dashes.`;

/** The model's guide, bounded: counts capped, seconds sane, text trimmed. */
export function normalizeGuide(raw: Record<string, unknown>, now: Date): ProductionGuide {
  return {
    v: 1,
    length_sec: secs(raw.length_sec, 600),
    structure: clipList(raw.structure, 6, 40),
    hooks: objs(raw.hooks).map((h) => ({ style: clip(h.style, 30), text: clip(h.text, 200) })).filter((h) => h.text).slice(0, 4),
    script: objs(raw.script).map((b) => ({ beat: clip(b.beat, 40), line: clip(b.line, 400), seconds: secs(b.seconds, 300) })).filter((b) => b.line).slice(0, 10),
    shots: objs(raw.shots).map((s) => ({ shot: clip(s.shot, 160), framing: clip(s.framing, 80), seconds: secs(s.seconds, 300), notes: clip(s.notes, 200) })).filter((s) => s.shot).slice(0, 12),
    filming: clipList(raw.filming, 5, 200),
    editing: clipList(raw.editing, 5, 200),
    caption: clip(raw.caption, 2200),
    ctas: clipList(raw.ctas, 4, 160),
    generated_at: now.toISOString(),
    edited_at: null,
  };
}

/** A guide sent back by the browser (edits), bounded the same way; null when it isn't one. */
export function sanitizeGuide(v: unknown, now: Date): ProductionGuide | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  if (g.v !== 1) return null;
  const n = normalizeGuide(g, now);
  const at = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null);
  return { ...n, generated_at: at(g.generated_at) ?? n.generated_at, edited_at: at(g.edited_at) };
}

/** The concept as the prompt's brief. */
export function conceptPrompt(c: StudioConcept): string {
  return [
    `Title: ${c.title}`,
    `Concept: ${c.concept}`,
    `Format: ${c.format}${c.platform ? ` for ${c.platform}` : ""}`,
    c.reasoning ? `Why: ${c.reasoning}` : "",
    c.audience ? `For: ${c.audience}` : "",
    c.goal ? `Goal: ${c.goal}` : "",
    c.successMetric ? `Success is read as: ${c.successMetric}` : "",
    c.research.length ? `Research:\n${c.research.map((r) => `- ${r}`).join("\n")}` : "",
    c.source === "format" ? "This is a structure that repeats in their niche: adapt it to their account, never copy a creator's video." : "",
  ].filter(Boolean).join("\n");
}

/** The whole guide as plain text, for Copy. */
export function guideText(c: StudioConcept, g: ProductionGuide): string {
  const lines = [
    c.title,
    "",
    `Hooks:\n${g.hooks.map((h) => `- ${h.text}`).join("\n")}`,
    g.structure.length ? `Structure: ${g.structure.join(" > ")}` : "",
    `Script:\n${g.script.map((b) => `- ${b.beat}${b.seconds ? ` (${b.seconds}s)` : ""}: ${b.line}`).join("\n")}`,
    `Shots:\n${g.shots.map((s, i) => `${i + 1}. ${s.shot}, ${s.framing}${s.seconds ? `, ${s.seconds}s` : ""}${s.notes ? `. ${s.notes}` : ""}`).join("\n")}`,
    g.filming.length ? `Filming:\n${g.filming.map((x) => `- ${x}`).join("\n")}` : "",
    g.editing.length ? `Editing:\n${g.editing.map((x) => `- ${x}`).join("\n")}` : "",
    g.caption ? `Caption:\n${g.caption}` : "",
    g.ctas.length ? `Calls to action:\n${g.ctas.map((x) => `- ${x}`).join("\n")}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n\n");
}
