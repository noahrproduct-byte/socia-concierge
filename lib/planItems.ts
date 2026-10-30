// The weekly plan's per-post fields after the model writes them: bounded,
// with the platform mapped to one SOCIA publishes to (or left out when it
// names none). Older saved plans lack the newer fields; readers treat them
// as optional. Pure.

import type { Deliverable } from "./schema";

export type PlanItem = Deliverable["weeklyPlan"][number];

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
  const t = s.trim().replace(/—/g, ",").slice(0, n);
  return t || undefined;
};

export function normalizePlanItem(p: PlanItem): PlanItem {
  return {
    ...p,
    title: clip(p.title, 80),
    purpose: clip(p.purpose, 200),
    audience: clip(p.audience, 160),
    platform: platformName(p.platform) ?? undefined,
    direction: clip(p.direction, 400),
    production: clip(p.production, 300),
    successMetric: clip(p.successMetric, 160),
  };
}

const CORE: Record<string, number> = { day: 20, concept: 1200, hook: 400, format: 200, rationale: 800, evidence: 800, predictedPerformance: 200 };

/** Plan days sent back by the browser (an applied edit): known fields only, each bounded; anything else is dropped. */
export function sanitizePlanItems(items: unknown[]): PlanItem[] {
  return items.slice(0, 14).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const core = Object.fromEntries(Object.entries(CORE).map(([k, n]) => [k, typeof r[k] === "string" ? (r[k] as string).slice(0, n) : ""])) as Pick<PlanItem, "day" | "concept" | "hook" | "format" | "rationale" | "evidence" | "predictedPerformance">;
    if (!core.day || !core.concept) return [];
    return [normalizePlanItem({ ...core, title: r.title as string, purpose: r.purpose as string, audience: r.audience as string, platform: r.platform as string, direction: r.direction as string, production: r.production as string, successMetric: r.successMetric as string })];
  });
}
