// The weekly plan built one day at a time (Noah, 2026-11-23, after a day of plans that kept failing burned a
// top-up): SOCIA writes a short idea for one day, the person accepts it, asks for another (twice a day at most)
// or edits it, and only an accepted idea gets its full post (hook, shots and script, filming direction, the
// Reel to film from, evidence), written in the background while the next day's idea is shown. A plan that
// stops halfway keeps what was accepted and picks up at the next day. The week-level read (headline, audit,
// fixes, competitors) is written once, when the last day is accepted.
//
// This file is the pure part: the days, the idea card, the prompts for each step and the state changes.
// lib/planStepsServer.ts makes the calls and saves the plan. Pure and browser-safe.

import type { GenerateInput, IdeaCard, PlanBuild, BuildSlot } from "./schema";
import { WEEK, animatedDay } from "./animated/day";
import { animatedSlots, MIX_MAX } from "./planMix";
import { cleanIdeas } from "./planIdeas";
import type { Weekday } from "./routine";

/** New plans a brand may start in seven days (the person's own edits and continuing a plan don't count). */
export const PLANS_PER_WEEK = 2;
/** "Try another idea" per day of a plan. */
export const TRIES_PER_DAY = 2;
/** Times SOCIA may try to write a day's full post (the first try and one more). */
export const WRITES_PER_DAY = 2;

const WEEKDAY_IDS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** `n` days spread over the week: the person's posting days first when they chose some, else evenly. Pure. */
export function filmedDays(n: number, postingDays?: Weekday[] | null): number[] {
  const count = Math.max(0, Math.min(7, Math.round(n)));
  if (!count) return [];
  const chosen = [...new Set((postingDays ?? []).map((d) => WEEKDAY_IDS.indexOf(d)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (chosen.length >= count) return chosen.filter((_, i) => i % (chosen.length / count) < 1).slice(0, count);
  const out = new Set(chosen);
  for (let i = 0; out.size < count && i < 7 * 2; i++) out.add(Math.floor((i * 7) / count) % 7);
  for (let d = 0; out.size < count && d < 7; d++) out.add(d);
  return [...out].sort((a, b) => a - b);
}

/**
 * The days a plan covers: as many as the week's posts (on-camera and animated), on-camera posts on the
 * person's posting days, animated ones spread over the week as before (lib/planMix.ts animatedSlots).
 * Each day's key is the day an item is saved under ("Monday", "Monday (animated)"). Pure.
 */
export function planSlots(mix: { onCamera: number; animated: number }, postingDays?: Weekday[] | null): BuildSlot[] {
  const filmed: BuildSlot[] = filmedDays(Math.min(mix.onCamera, 7), postingDays).map((weekday) => ({
    key: WEEK[weekday], weekday, kind: "filmed", state: "waiting", earlier: [], tries: 0,
  }));
  const animated: BuildSlot[] = animatedSlots(Math.max(0, Math.min(MIX_MAX, mix.animated))).map((s) => ({
    key: animatedDay(WEEK[s.weekday], s.slot), weekday: s.weekday, kind: "animated", slot: s.slot, state: "waiting", earlier: [], tries: 0,
  }));
  return [...filmed, ...animated].sort((a, b) => a.weekday - b.weekday || (a.kind === b.kind ? (a.slot ?? 1) - (b.slot ?? 1) : a.kind === "filmed" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// The idea card
// ---------------------------------------------------------------------------

/** The short idea a day starts as: enough to decide on, nothing that is thrown away when it's turned down. */
export const IDEA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "pillar", "description", "format", "template", "hook"],
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    pillar: { type: "string" },
    description: { type: "string" },
    format: { type: "string" },
    template: { type: "string", enum: ["compare", "counter", "words", ""] },
  },
} as const;

const line = (v: unknown, n: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, n) : "";

/** An idea card made safe: bounded text, no em dashes, a template only on an animated day. null when it has no title. Pure. */
export function cleanIdeaCard(raw: unknown, kind: BuildSlot["kind"], fromIdea?: number): IdeaCard | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = line(o.title, 80);
  if (!title) return null;
  const template = kind === "animated" && (o.template === "compare" || o.template === "counter" || o.template === "words") ? o.template : undefined;
  const hook = kind === "animated" ? line(o.hook, 160) : "";
  return {
    title,
    pillar: line(o.pillar, 40),
    description: line(o.description, 280),
    format: line(o.format, 60) || (kind === "animated" ? "Animated video" : "Reel"),
    ...(template ? { template } : {}),
    ...(hook ? { hook } : {}),
    ...(fromIdea ? { fromIdea } : {}),
  };
}

/** The person's own ideas from the plan form, matched to the on-camera days in order (index into the filmed days). Pure. */
export function ownIdeaFor(input: Pick<GenerateInput, "ideas">, slots: BuildSlot[], index: number): { text: string; n: number } | null {
  const slot = slots[index];
  if (!slot || slot.kind !== "filmed") return null;
  const filmedIndex = slots.slice(0, index).filter((s) => s.kind === "filmed").length;
  const ideas = cleanIdeas(input.ideas);
  return ideas[filmedIndex] ? { text: ideas[filmedIndex], n: filmedIndex + 1 } : null;
}

/** The person's ideas that no on-camera day of this plan can hold. Pure. */
export function ideasBeyondSlots(input: Pick<GenerateInput, "ideas">, slots: BuildSlot[]): string[] {
  return cleanIdeas(input.ideas).slice(slots.filter((s) => s.kind === "filmed").length);
}

const accepted = (slots: BuildSlot[], except: number) =>
  slots.flatMap((s, i) => (i !== except && s.idea && (s.state === "writing" || s.state === "done" || s.state === "failed") ? [`- ${s.key}: ${s.idea.title} (${s.idea.format})`] : []));

/** The step's instructions for one day's idea, after the shared (cached) context. Pure. */
export function ideaTask(build: Pick<PlanBuild, "input" | "slots">, index: number, animatedRules: string): string {
  const slot = build.slots[index];
  const own = slot.tries === 0 ? ownIdeaFor(build.input, build.slots, index) : null;
  const done = accepted(build.slots, index);
  const turned = slot.earlier.map((i) => `- ${i.title}: ${i.description}`);
  return [
    "# This step",
    `The week is planned one post at a time and the person approves each idea before the next. Write only the idea for ${slot.key}: ${slot.kind === "animated" ? "an animated post SOCIA makes in code, with no filming" : "a post the person films (on camera or their own footage)"}.`,
    done.length ? `Already approved this week (don't repeat their topic or format):\n${done.join("\n")}` : "",
    turned.length ? `Ideas the person passed on for this day (write a clearly different one):\n${turned.join("\n")}` : "",
    own ? `The person asked for this day to be their own idea: "${own.text}". Keep what it is about and their words for it in the title.` : "",
    slot.kind === "animated" ? `For this animated post:\n${animatedRules}\nSet template to compare, counter or words, and hook to the first line a viewer reads (at most 12 words).` : `Set template and hook to "".`,
    "Return only the idea: title (at most 8 words), pillar (the strategy pillar or priority it serves, at most 4 words), description (one or two sentences, at most 200 characters: what the video shows and why it should work for this account), and format (one short label, for a filmed post with how it's made, for example \"Reel, talking to camera\").",
    `${slot.kind === "filmed" ? "No hook, script, shots, caption or hashtags yet" : "No scenes, caption or hashtags yet"}: those are written only after the person approves the idea. Base it on the evidence above; don't claim results.`,
  ].filter(Boolean).join("\n\n");
}

/** The step's instructions for an accepted day's full post. Pure. */
export function detailsTask(build: Pick<PlanBuild, "slots">, index: number): string {
  const slot = build.slots[index];
  const idea = slot.idea!;
  const done = accepted(build.slots, index);
  return [
    "# This step",
    `The person approved this idea for ${slot.key}. Write this one post in full as a single weeklyPlan item, following every rule for weeklyPlan items, with day "${slot.key}".`,
    `The approved idea:\n- Title: ${idea.title}\n- Pillar: ${idea.pillar}\n- What it shows: ${idea.description}\n- Format: ${idea.format}`,
    "Keep the idea as approved: the same topic, format and title (tighten the wording only). Write the hook, the beats with what is said, the filming direction, the production, the editing, the CTA, the success metric, the Reel to film from and the evidence for it.",
    done.length ? `The other posts approved this week (don't repeat them):\n${done.join("\n")}` : "",
    "Set fromIdea to 0.",
  ].filter(Boolean).join("\n\n");
}

/** The step's instructions for the week-level read, once every day is approved. Pure. */
export function auditTask(build: Pick<PlanBuild, "slots">): string {
  const week = build.slots.flatMap((s) => (s.idea ? [`- ${s.key}: ${s.idea.title} (${s.idea.format})`] : []));
  return [
    "# This step",
    "The week's posts are planned and approved:",
    week.join("\n"),
    "Write only the week-level read: a one-line diagnosis in plain words (no score, grade or rating out of 100: nothing here is measured), an honest audit summary, the account's strengths, its concrete problems (with the evidence and the impact of each), the top 3 fixes ranked by expected impact, and competitor insights with the specific gap this account should close. Don't write posts.",
  ].join("\n\n");
}

/** The week-level read's schema: the plan's audit fields, without the posts. */
export function auditSchema(full: { properties: Record<string, unknown> }) {
  const keys = ["headline", "auditSummary", "strengths", "problems", "topFixes", "competitorInsights"] as const;
  return {
    type: "object",
    additionalProperties: false,
    required: [...keys],
    properties: Object.fromEntries(keys.map((k) => [k, full.properties[k]])),
  };
}

// ---------------------------------------------------------------------------
// State changes
// ---------------------------------------------------------------------------

/** The day waiting for the person's decision, if any. Pure. */
export const reviewingIndex = (b: PlanBuild): number => b.slots.findIndex((s) => s.state === "reviewing");
/** The next day with no idea yet, if any. Pure. */
export const nextWaiting = (b: PlanBuild): number => b.slots.findIndex((s) => s.state === "waiting");

/** Whether every day has its full post (or gave up on it), so the plan is complete. Pure. */
export const allWritten = (b: PlanBuild): boolean => b.slots.length > 0 && b.slots.every((s) => s.state === "done" || s.state === "failed");

/** How far the plan is: days approved out of all. Pure. */
export function progress(b: PlanBuild): { approved: number; total: number } {
  return { approved: b.slots.filter((s) => s.state === "writing" || s.state === "done" || s.state === "failed").length, total: b.slots.length };
}

/** Put a new idea on a day for review. Pure. */
export function withIdea(b: PlanBuild, index: number, idea: IdeaCard): PlanBuild {
  return { ...b, slots: b.slots.map((s, i) => (i === index ? { ...s, idea, state: "reviewing" as const, error: undefined } : s)) };
}

/** "Try another idea": the current idea moves to the earlier ones and a try is used. Throws when none are left. Pure. */
export function beginRetry(b: PlanBuild, index: number): PlanBuild {
  const s = b.slots[index];
  if (!s || s.state !== "reviewing" || !s.idea) throw new StepError("This day isn't waiting for a decision.", 409);
  if (s.tries >= TRIES_PER_DAY) throw new StepError(`You've asked for ${TRIES_PER_DAY} other ideas for this day. Pick one of them, or edit the idea yourself.`, 429);
  return { ...b, slots: b.slots.map((x, i) => (i === index ? { ...x, earlier: [...x.earlier, s.idea!].slice(-6), tries: x.tries + 1 } : x)) };
}

/** Accept a day, with the person's edits when they made any: it waits for its full post. Pure. */
export function acceptDay(b: PlanBuild, index: number, edited?: Partial<IdeaCard> | null): PlanBuild {
  const s = b.slots[index];
  if (!s || s.state !== "reviewing" || !s.idea) throw new StepError("This day isn't waiting for a decision.", 409);
  const idea = edited ? cleanIdeaCard({ ...s.idea, ...edited, template: edited.template ?? s.idea.template ?? "" }, s.kind, s.idea.fromIdea) ?? s.idea : s.idea;
  return { ...b, slots: b.slots.map((x, i) => (i === index ? { ...x, idea, state: "writing" as const, writes: 0 } : x)) };
}

/** Save the person's edits to the idea under review, without accepting it. Pure. */
export function editDay(b: PlanBuild, index: number, edited: Partial<IdeaCard>): PlanBuild {
  const s = b.slots[index];
  if (!s || s.state !== "reviewing" || !s.idea) throw new StepError("This day isn't waiting for a decision.", 409);
  const idea = cleanIdeaCard({ ...s.idea, ...edited, template: edited.template ?? s.idea.template ?? "" }, s.kind, s.idea.fromIdea);
  if (!idea) throw new StepError("Give the idea a title.", 400);
  return { ...b, slots: b.slots.map((x, i) => (i === index ? { ...x, idea } : x)) };
}

/** Go back to one of the day's earlier ideas (no AI). Pure. */
export function pickEarlier(b: PlanBuild, index: number, earlier: number): PlanBuild {
  const s = b.slots[index];
  const pick = s?.earlier[earlier];
  if (!s || s.state !== "reviewing" || !s.idea || !pick) throw new StepError("That idea isn't there any more.", 409);
  const rest = s.earlier.filter((_, k) => k !== earlier);
  return { ...b, slots: b.slots.map((x, i) => (i === index ? { ...x, idea: pick, earlier: [...rest, s.idea!] } : x)) };
}

/** A day's full post is written (or gave up). Pure. */
export function finishDay(b: PlanBuild, index: number, result: { itemId: string } | { error: string }): PlanBuild {
  const slots = b.slots.map((x, i) => (i !== index ? x : "itemId" in result ? { ...x, state: "done" as const, itemId: result.itemId, error: undefined } : { ...x, state: "failed" as const, error: result.error }));
  const next = { ...b, slots };
  return allWritten(next) && nextWaiting(next) < 0 && reviewingIndex(next) < 0 ? { ...next, status: "done" } : next;
}

/** Write a failed day again. Throws when it has had its tries. Pure. */
export function rewriteDay(b: PlanBuild, index: number): PlanBuild {
  const s = b.slots[index];
  if (!s || s.state !== "failed") throw new StepError("This day's post isn't waiting to be written again.", 409);
  if ((s.writes ?? 0) >= WRITES_PER_DAY) throw new StepError("SOCIA couldn't write this post. Edit the idea into the plan yourself with Add your own idea.", 429);
  return { ...b, status: "building", slots: b.slots.map((x, i) => (i === index ? { ...x, state: "writing" as const, error: undefined } : x)) };
}

export class StepError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A new plan's build state. Pure. */
export function newBuild(input: GenerateInput, slots: BuildSlot[], now: Date): PlanBuild {
  return { v: 1, rev: 0, status: "building", startedAt: now.toISOString(), input, slots };
}
