// The Content Rater's memory (Noah's brief, 2026-11-05): what SOCIA
// recommended for a video, what the person applied, and, once the post is
// out, how it did against the account's own usual. That is what lets the
// rater answer "did the change help?" and stop repeating advice that didn't.
//
// One post is never proof. A finding about a kind of change is stated only
// from LESSON_MIN settled posts, and even then as a pattern: other things
// differed between the posts. Nothing here predicts a result. Pure and
// browser-safe; the record lives on the brand (lib/raterLogLoad.ts).

import type { FixPriority } from "./studioVerdict";

export const LOG_MAX = 12;
/** Settled, measured posts a lesson about one kind of change needs. */
export const LESSON_MIN = 3;
/** A post reads as above or below the account's usual outside this band. */
export const ABOVE = 1.2;
export const BELOW = 0.8;

export type FixKind = "opening" | "hook_text" | "ending" | "pacing" | "text" | "audio" | "visual" | "caption";
const KINDS = new Set<string>(["opening", "hook_text", "ending", "pacing", "text", "audio", "visual", "caption"]);
const PRIORITIES = new Set<string>(["critical", "high", "medium", "experiment"]);

/** What the change was about, in words a person uses. */
export const KIND_LABEL: Record<FixKind, string> = {
  opening: "the opening", hook_text: "the opening line", ending: "the ending", pacing: "the pacing", text: "on-screen text",
  audio: "the sound", visual: "the picture", caption: "the caption",
};

export type LoggedFix = { title: string; kind: FixKind; priority: FixPriority; /** The person used the line, or sent the fix to the editor. */ applied: boolean };

export type RaterEntry = {
  /** The Calendar post the rated video was saved as. */
  postId: string;
  at: string;
  score: number;
  diagnosis: string;
  fixes: LoggedFix[];
  /** The creative direction whose opening was used, when one was. */
  direction: string | null;
  hook: string | null;
  cta: string | null;
};

const text = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** One entry as sent by the browser or read back from storage, bounded; null when it isn't one. */
export function sanitizeEntry(v: unknown, now: Date = new Date()): RaterEntry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const postId = typeof o.postId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(o.postId) ? o.postId : null;
  if (!postId) return null;
  const at = typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? new Date(o.at).toISOString() : now.toISOString();
  const fixes = (Array.isArray(o.fixes) ? o.fixes : []).flatMap((f): LoggedFix[] => {
    if (!f || typeof f !== "object") return [];
    const x = f as Record<string, unknown>;
    const title = text(x.title, 90);
    if (!title || !KINDS.has(x.kind as string)) return [];
    return [{ title, kind: x.kind as FixKind, priority: PRIORITIES.has(x.priority as string) ? (x.priority as FixPriority) : "medium", applied: x.applied === true }];
  }).slice(0, 5);
  const score = typeof o.score === "number" && Number.isFinite(o.score) ? Math.max(0, Math.min(100, Math.round(o.score))) : 0;
  return { postId, at, score, diagnosis: text(o.diagnosis, 160), fixes, direction: text(o.direction, 40) || null, hook: text(o.hook, 120) || null, cta: text(o.cta, 120) || null };
}

export function sanitizeLog(v: unknown): RaterEntry[] {
  const raw = (v && typeof v === "object" ? (v as { log?: unknown }).log : null) ?? [];
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : []).flatMap((e): RaterEntry[] => {
    const x = sanitizeEntry(e);
    if (!x || seen.has(x.postId)) return [];
    seen.add(x.postId);
    return [x];
  }).slice(0, LOG_MAX);
}

/**
 * Which of the analysis's fixes the person had applied when they saved the
 * video: the suggested line is in use, or they chose their own new opening,
 * ending or caption for a fix about that part. Edits made in the Video editor
 * leave the rater and are tracked with that video there.
 */
export function entryFor(input: {
  postId: string;
  score: number;
  diagnosis: string;
  fixes: { title: string; kind: string; priority?: string; apply: { field: string; value: string } | null }[];
  current: { hook: string | null; cta: string | null; caption: string | null };
  working: { hook: string; cta: string; caption: string; onscreen: string[] };
  direction: { name: string; opening: string } | null;
}): RaterEntry | null {
  const w = input.working;
  const used = (field: string, value: string) => (field === "onscreen" ? w.onscreen.includes(value) : field === "hook" ? w.hook === value : field === "cta" ? w.cta === value : w.caption.trim() === value.trim());
  const changed = (now: string, before: string | null) => Boolean(now.trim()) && now.trim() !== (before ?? "").trim();
  return sanitizeEntry({
    postId: input.postId, score: input.score, diagnosis: input.diagnosis,
    fixes: input.fixes.map((f) => ({
      title: f.title, kind: f.kind, priority: f.priority,
      applied: f.apply
        ? used(f.apply.field, f.apply.value)
        : f.kind === "opening" || f.kind === "hook_text" ? changed(w.hook, input.current.hook)
        : f.kind === "ending" ? changed(w.cta, input.current.cta)
        : f.kind === "caption" ? changed(w.caption, input.current.caption)
        : false,
    })),
    direction: input.direction && w.hook === input.direction.opening ? input.direction.name : null,
    hook: w.hook, cta: w.cta,
  });
}

/** The log with this entry first; a post rated again replaces its earlier entry. */
export function addEntry(log: RaterEntry[], entry: RaterEntry): RaterEntry[] {
  return [entry, ...log.filter((e) => e.postId !== entry.postId)].slice(0, LOG_MAX);
}

// ------------------------------------------------------------------ outcomes ----

export type PostState = "draft" | "scheduled" | "published" | "failed" | "gone";
/** How the post did, as lib/postResults measures it; null until it is published. */
export type OutcomeResult = { short: string; text: string; measured: boolean; early: boolean; multiplier: number | null };
export type RaterOutcome = RaterEntry & { state: PostState; publishedAt: string | null; permalink: string | null; result: OutcomeResult | null };

/** What one post's result does and doesn't say about the changes made to it. */
export function finding(o: RaterOutcome): string {
  const applied = o.fixes.filter((f) => f.applied).length;
  if (o.state === "gone") return "This post is no longer on the Calendar.";
  if (o.state === "draft") return "Still a draft: nothing to measure until it is posted.";
  if (o.state === "scheduled") return "Scheduled: SOCIA measures it once it has been out for about three days.";
  if (o.state === "failed") return "It did not publish, so there is no result.";
  if (!o.result || !o.result.measured) return "Published, and the platform has not reported its numbers yet.";
  const m = o.result.multiplier;
  const caveat = applied ? "One post can't say the changes are why: other things differed too." : "No recommended change was applied to it, so it says nothing about them.";
  if (m == null) return `${o.result.text} ${caveat}`;
  const early = o.result.early ? " so far (the number is still moving)" : "";
  if (m >= ABOVE) return `It did better than your usual${early}. ${caveat}`;
  if (m < BELOW) return `It did below your usual${early}. ${caveat}`;
  return `It did about your usual${early}. ${caveat}`;
}

/** What to do next, from one post's result. */
export function nextStep(o: RaterOutcome): string | null {
  if (o.state !== "published" || !o.result?.measured || o.result.multiplier == null) return null;
  if (!o.fixes.some((f) => f.applied)) return null;
  if (o.result.early) return "Look again once it has been out three days.";
  if (o.result.multiplier >= ABOVE) return "Test the same approach again on your next comparable post.";
  if (o.result.multiplier < BELOW) return "Try it once more before dropping it, or test a different opening.";
  return "Keep the change if it was easy to make; it has not moved the result either way yet.";
}

export type Lesson = { kind: FixKind; posts: number; above: number; median: number; line: string };

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * What the settled posts show about each kind of change the person applied.
 * A kind needs LESSON_MIN settled, measured posts; with fewer it is left out
 * rather than guessed. A pattern, never a cause.
 */
export function lessons(outcomes: RaterOutcome[]): Lesson[] {
  const settled = outcomes.filter((o) => o.state === "published" && o.result?.measured && !o.result.early && o.result.multiplier != null);
  const byKind = new Map<FixKind, number[]>();
  for (const o of settled) {
    for (const kind of new Set(o.fixes.filter((f) => f.applied).map((f) => f.kind))) byKind.set(kind, [...(byKind.get(kind) ?? []), o.result!.multiplier!]);
  }
  return [...byKind.entries()].filter(([, ms]) => ms.length >= LESSON_MIN).map(([kind, ms]) => {
    const med = Math.round(median(ms) * 10) / 10;
    const above = ms.filter((m) => m >= ABOVE).length;
    return {
      kind, posts: ms.length, above, median: med,
      line: `When you changed ${KIND_LABEL[kind]}: ${ms.length} posts, median ${med.toFixed(1)}x your usual, ${above} of ${ms.length} above it. A pattern in your own posts, not proof the change is the reason.`,
    };
  }).sort((a, b) => b.median - a.median);
}

/** The log as evidence for the next analysis: what was recommended, what was applied and what happened. */
export function logEvidence(outcomes: RaterOutcome[]): string {
  const rows = outcomes.filter((o) => o.state === "published" || o.fixes.some((f) => f.applied)).slice(0, 6);
  if (!rows.length) return "";
  const lines = rows.map((o) => {
    const applied = o.fixes.filter((f) => f.applied).map((f) => f.title);
    const skipped = o.fixes.filter((f) => !f.applied).map((f) => f.title);
    const result = o.state !== "published" ? `not posted yet (${o.state})` : o.result?.measured ? `${o.result.short}${o.result.early ? ", early" : ""}` : "posted, not measured yet";
    return `- ${o.at.slice(0, 10)}: scored ${o.score}. Applied: ${applied.length ? applied.join("; ") : "nothing"}.${skipped.length ? ` Not applied: ${skipped.join("; ")}.` : ""}${o.direction ? ` Direction used: ${o.direction}.` : ""} Result: ${result}.`;
  });
  const ls = lessons(outcomes).map((l) => `- ${l.line}`);
  return [...lines, ...(ls.length ? ["Across settled posts:", ...ls] : [])].join("\n");
}
