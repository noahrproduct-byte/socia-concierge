// The weekly plan's per-post fields after the model writes them: bounded,
// with the platform mapped to one SOCIA publishes to (or left out when it
// names none). Older saved plans lack the newer fields; readers treat them
// as optional. Pure.

import type { Deliverable, PlanDecision } from "./schema";
import { sanitizeGuide } from "./studioGuide";
import { isExperimentId } from "./strategy";
import { sanitizeRef } from "./trendSignals";

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

const clip = (s: unknown, n: number): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = s.trim().replace(/\u2014/g, ",").slice(0, n);
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

export function normalizePlanItem(p: PlanItem): PlanItem {
  return {
    ...p,
    maker: isMaker(p.maker) ? p.maker : undefined,
    title: clip(p.title, 80),
    purpose: clip(p.purpose, 200),
    audience: clip(p.audience, 160),
    platform: platformName(p.platform) ?? undefined,
    direction: clip(p.direction, 400),
    production: clip(p.production, 300),
    successMetric: clip(p.successMetric, 160),
    experiment: isExperimentId(p.experiment) ? p.experiment : undefined,
    // The model's cited id never reaches a saved plan; the Reel it named does, bounded.
    reference: undefined,
    ref: sanitizeRef(p.ref) ?? undefined,
  };
}

const CORE: Record<string, number> = { day: 20, concept: 1200, hook: 400, format: 200, rationale: 800, evidence: 800, predictedPerformance: 200 };

/** Plan days sent back by the browser (an edit, a decision, an added idea): known fields only, each bounded, at most 21; anything else is dropped. */
export function sanitizePlanItems(items: unknown[]): PlanItem[] {
  return items.slice(0, 21).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const core = Object.fromEntries(Object.entries(CORE).map(([k, n]) => [k, typeof r[k] === "string" ? (r[k] as string).slice(0, n) : ""])) as Pick<PlanItem, "day" | "concept" | "hook" | "format" | "rationale" | "evidence" | "predictedPerformance">;
    if (!core.day || !core.concept) return [];
    const item = normalizePlanItem({ ...core, title: r.title as string, purpose: r.purpose as string, audience: r.audience as string, platform: r.platform as string, direction: r.direction as string, production: r.production as string, successMetric: r.successMetric as string, experiment: r.experiment as string, maker: r.maker as PlanItem["maker"], ref: r.ref as PlanItem["ref"] });
    const decision = cleanDecision(r.decision);
    const guide = sanitizeGuide(r.guide, new Date());
    return [{ ...item, ...(isItemId(r.id) ? { id: r.id } : {}), ...(r.source === "own" ? { source: "own" as const } : {}), ...(decision ? { decision } : {}), ...(guide ? { guide } : {}) }];
  });
}
