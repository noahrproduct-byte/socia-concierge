// The weekly plan's per-post fields after the model writes them: bounded,
// with the platform mapped to one SOCIA publishes to (or left out when it
// names none). Older saved plans lack the newer fields; readers treat them
// as optional. Pure.

import type { Deliverable, EvidenceSplit, PlanBeat, PlanDecision, PlanMade } from "./schema";
import type { OwnPostRef } from "./planEvidenceFormat";
import { sanitizeGuide } from "./studioGuide";
import { isExperimentId } from "./strategy";
import { sanitizeRef } from "./trendSignals";
import { isFrameJob, isFramePath } from "./storyboardDraw";

export type PlanItem = Deliverable["weeklyPlan"][number];

/** Why someone turned an idea down (the brief's examples); the next plan reads them. */
export const FEEDBACK_REASONS = [
  { id: "hard_to_film", label: "Too difficult to film" },
  { id: "not_relevant", label: "Not relevant to my brand" },
  { id: "repetitive", label: "Too repetitive" },
  { id: "dislike_format", label: "I don't like this format" },
  { id: "more_creative", label: "I want something more creative" },
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]["id"];
const REASON_IDS = new Set<string>(FEEDBACK_REASONS.map((r) => r.id));
export const reasonLabel = (id: string) => FEEDBACK_REASONS.find((r) => r.id === id)?.label ?? id;

function cleanDecision(v: unknown): PlanDecision | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as Record<string, unknown>;
  if (d.status !== "approved" && d.status !== "rejected") return undefined;
  const at = typeof d.at === "string" && !Number.isNaN(Date.parse(d.at)) ? d.at : new Date().toISOString();
  if (d.status === "approved") return { status: "approved", at };
  const reasons = Array.isArray(d.reasons) ? d.reasons.filter((r): r is string => typeof r === "string" && REASON_IDS.has(r)).slice(0, 5) : [];
  const note = typeof d.note === "string" && d.note.trim() ? d.note.trim().replace(/\u2014/g, ",").slice(0, 300) : null;
  return { status: "rejected", at, reasons, note };
}

const PLATFORMS: Record<string, string> = { instagram: "Instagram", ig: "Instagram", facebook: "Facebook", fb: "Facebook", youtube: "YouTube", "youtube shorts": "YouTube", tiktok: "TikTok" };

export function platformName(v: string | null | undefined): string | null {
  const k = (v ?? "").toLowerCase().trim();
  if (!k) return null;
  if (PLATFORMS[k]) return PLATFORMS[k];
  const hit = Object.keys(PLATFORMS).find((p) => k.includes(p));
  return hit ? PLATFORMS[hit] : null;
}

/**
 * Text cut to at most `n` characters at the end of a sentence (or, with none in the back half, a word), never
 * mid-word: a filming direction cut at "Keep the phone moving slowly and th" reads as broken.
 */
export function cutClean(t: string, n: number): string {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const end = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((m) => cut.lastIndexOf(m)));
  if (end >= n * 0.5) return cut.slice(0, end + 1).trim();
  // Room for the ellipsis, so the result is never longer than n.
  const room = cut.slice(0, n - 1), space = room.lastIndexOf(" ");
  return `${room.slice(0, space > n * 0.5 ? space : n - 1).trim()}\u2026`;
}

/** Saved text that was cut mid-sentence before cutClean: shown up to its last whole sentence when one is in the back half. */
export function wholeSentences(t: string): string {
  const s = t.trim();
  if (!s || /[.!?\u2026)"'\u201d]$/.test(s)) return s;
  const end = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((m) => s.lastIndexOf(m)));
  return end >= s.length * 0.4 ? s.slice(0, end + 1).trim() : s;
}

const clip = (s: unknown, n: number): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = cutClean(s.trim().replace(/\u2014/g, ","), n);
  return t || undefined;
};

/** "claude" when the person's own Claude makes the video (Growth Profile: who makes the videos); "you" otherwise. */
export const isMaker = (v: unknown): v is "you" | "claude" => v === "you" || v === "claude";

/** A plan post's own id: the link between the plan and the video made for it. Server-assigned, never from the model. */
export const isItemId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

/** Every post with an id, keeping the ones it has: a plan's posts can be matched to their videos even after edits reorder them. */
export function withItemIds<T extends object>(items: T[], newId: () => string = () => crypto.randomUUID()): (T & { id: string })[] {
  const seen = new Set<string>();
  return items.map((it) => {
    const had = (it as { id?: unknown }).id;
    const id = isItemId(had) && !seen.has(had) ? had : newId();
    seen.add(id);
    return { ...it, id };
  });
}

/** A post's timed beats, made safe: at most four, each with a label and what to show, times in order within three minutes. Pure. */
export function cleanBeats(v: unknown): PlanBeat[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PlanBeat[] = [];
  for (const raw of v.slice(0, 12)) {
    if (out.length >= 4) break;
    const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const label = clip(b.label as string, 40);
    const show = clip(b.show as string, 220);
    const say = clip(b.say as string, 240);
    const from = Math.max(0, Math.min(180, Math.round(Number(b.from))));
    const to = Math.max(0, Math.min(180, Math.round(Number(b.to))));
    if (!label || !show || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    if (out.length && from < out[out.length - 1].from) continue;
    out.push({ label, from, to, show, ...(say ? { say } : {}), ...(isFrameJob(b.frameJob) ? { frameJob: b.frameJob } : {}), ...(isFramePath(b.frame) ? { frame: b.frame } : {}) });
  }
  return out.length >= 2 ? out : undefined;
}

/** The ids an observed line may cite: P# for the account's own posts, R# for niche Reels. */
const CITED = /\b[PR]\d{1,2}\b/g;

/**
 * A post's evidence in its three kinds, made safe. With `known` (the ids the
 * model was shown), an observed line is kept only when every id it cites is
 * one of them and it cites at least one: a "fact" with no source isn't kept as
 * a fact. With no observed line left, the basis can't be "data". Pure.
 */
export function cleanEvidenceSplit(v: unknown, known?: Set<string>): EvidenceSplit | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const lines = Array.isArray(o.observed) ? o.observed : [];
  const observed = lines.slice(0, 6).flatMap((l) => {
    const t = clip(l as string, 240);
    if (!t) return [];
    if (!known) return [t];
    const ids = t.toUpperCase().match(CITED) ?? [];
    return ids.length && ids.every((id) => known.has(id)) ? [t] : [];
  }).slice(0, 4);
  const reading = clip(o.reading as string, 400) ?? "";
  const expect = clip(o.expect as string, 300) ?? "";
  let basis: EvidenceSplit["basis"] = o.basis === "thin" || o.basis === "experiment" ? o.basis : "data";
  if (basis === "data" && !observed.length) basis = "thin";
  if (!observed.length && !reading && !expect) return undefined;
  return { observed, reading, expect, basis };
}

const nn = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** One of the account's own posts as a plan post cites it, read back bounded; null when it isn't one. */
export function sanitizeOwnPost(v: unknown): OwnPostRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^P\d{1,2}$/.test(o.id)) return null;
  const url = typeof o.url === "string" && /^https:\/\/[^\s"'<>]+$/.test(o.url) && o.url.length <= 400 ? o.url : null;
  return {
    id: o.id, url,
    date: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
    title: clip(o.title as string, 80) ?? "(no caption)",
    format: clip(o.format as string, 20) ?? "Post",
    likes: nn(o.likes) ?? 0, comments: nn(o.comments) ?? 0,
    views: nn(o.views), reach: nn(o.reach), saved: nn(o.saved), shares: nn(o.shares),
  };
}

export function normalizePlanItem(p: PlanItem): PlanItem {
  return {
    ...p,
    maker: isMaker(p.maker) ? p.maker : undefined,
    title: clip(p.title, 80),
    purpose: clip(p.purpose, 200),
    audience: clip(p.audience, 160),
    platform: platformName(p.platform) ?? undefined,
    direction: clip(p.direction, 900),
    filmLike: clip(p.filmLike, 600),
    filmReference: undefined,
    filmRef: sanitizeRef(p.filmRef) ?? undefined,
    production: clip(p.production, 600),
    beats: cleanBeats(p.beats),
    successMetric: clip(p.successMetric, 160),
    cta: clip(p.cta, 200),
    editing: clip(p.editing, 600),
    evidenceSplit: cleanEvidenceSplit(p.evidenceSplit),
    ownPosts: Array.isArray(p.ownPosts) ? p.ownPosts.map(sanitizeOwnPost).filter((x): x is OwnPostRef => x != null).slice(0, 4) : undefined,
    experiment: isExperimentId(p.experiment) ? p.experiment : undefined,
    // The model's cited id never reaches a saved plan; the Reel it named does, bounded.
    reference: undefined,
    ref: sanitizeRef(p.ref) ?? undefined,
    animated: p.animated === true ? true : undefined,
    slot: p.animated === true && (p.slot === 1 || p.slot === 2) ? p.slot : undefined,
  };
}

const CORE: Record<string, number> = { day: 32, concept: 1200, hook: 400, format: 200, rationale: 800, evidence: 800, predictedPerformance: 200 };

/** Plan days sent back by the browser (an edit, a decision, an added idea): known fields only, each bounded, at most 28 (7 filmed, up to 14 animated, ideas the person added); anything else is dropped. */
/** The person's "filmed" or "edited" mark, kept only in its exact shape. */
function cleanMade(v: unknown): PlanMade | null {
  const m = v as Partial<PlanMade> | null;
  if (!m || typeof m !== "object" || (m.step !== "filmed" && m.step !== "edited")) return null;
  return { step: m.step, at: typeof m.at === "string" && !Number.isNaN(Date.parse(m.at)) ? m.at : new Date().toISOString() };
}

export function sanitizePlanItems(items: unknown[]): PlanItem[] {
  return items.slice(0, 28).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const core = Object.fromEntries(Object.entries(CORE).map(([k, n]) => [k, typeof r[k] === "string" ? (r[k] as string).slice(0, n) : ""])) as Pick<PlanItem, "day" | "concept" | "hook" | "format" | "rationale" | "evidence" | "predictedPerformance">;
    if (!core.day || !core.concept) return [];
    const item = normalizePlanItem({ ...core, title: r.title as string, purpose: r.purpose as string, audience: r.audience as string, platform: r.platform as string, direction: r.direction as string, production: r.production as string, successMetric: r.successMetric as string, cta: r.cta as string, editing: r.editing as string, evidenceSplit: r.evidenceSplit as PlanItem["evidenceSplit"], ownPosts: r.ownPosts as PlanItem["ownPosts"], beats: r.beats as PlanItem["beats"], experiment: r.experiment as string, maker: r.maker as PlanItem["maker"], ref: r.ref as PlanItem["ref"], filmRef: r.filmRef as PlanItem["filmRef"], filmLike: r.filmLike as string, animated: r.animated as boolean, slot: r.slot as PlanItem["slot"] });
    const decision = cleanDecision(r.decision);
    const guide = sanitizeGuide(r.guide, new Date());
    const made = cleanMade(r.made);
    return [{ ...item, ...(isItemId(r.id) ? { id: r.id } : {}), ...(r.source === "own" ? { source: "own" as const } : {}), ...(decision ? { decision } : {}), ...(guide ? { guide } : {}), ...(made ? { made } : {}) }];
  });
}
