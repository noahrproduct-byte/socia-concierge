// One structured finding, shared by every page. The pieces are kept apart so
// nothing reads as more certain than it is:
//   observation    FACT: what the data shows
//   explanations   INTERPRETATION (reasonable from the evidence) or
//                  HYPOTHESIS (possible, needs testing), never a cause
//   recommendation RECOMMENDATION: what to do, why, and what it will teach
// plus the metrics and posts it rests on, a confidence with the rule that
// set it, the limits of the data, and where it came from.
//
// Pure: types, validation and confidence rules. Producers live in
// lib/intel/producers.ts; storage in lib/intel/insightStore.ts.

import type { GoalPlatform } from "../growth";

export type InsightCategory = "performance" | "content" | "diagnostic" | "niche" | "goal";

export type InsightMetric = { label: string; value: number | null; unit?: "count" | "percent" | "multiple" | "per_week" | "hours"; basis: string };
export type InsightPost = { platform: GoalPlatform; id: string; title: string; permalink: string | null };
export type Explanation = { type: "interpretation" | "hypothesis"; text: string };
export type InsightRecommendation = { action: string; why: string; learning: string; href: string | null };

/** What a producer hands to the store. */
export type InsightDraft = {
  fingerprint: string;
  producer: string;
  category: InsightCategory;
  platform: GoalPlatform | null;
  title: string;
  observation: string;
  metrics: InsightMetric[];
  posts: InsightPost[];
  periodStart: string | null;
  periodEnd: string | null;
  explanations: Explanation[];
  confidence: number;
  limitations: string[];
  recommendation: InsightRecommendation | null;
  /** The rule that set the confidence, and the data it read. */
  source: { rule: string; data: string[]; retrievedAt: string | null };
};

/** A stored finding, as pages read it. */
export type StoredInsight = InsightDraft & {
  id: string;
  status: "active" | "dismissed" | "resolved" | "superseded";
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

/**
 * Confidence from sample size, the one rule every producer uses: a finding
 * from one post is a lead, from a handful a signal, from a dozen or more a
 * pattern. Capped by how fresh the data is.
 */
export function confidenceFor(n: number, opts: { stale?: boolean } = {}): number {
  const base = n <= 1 ? 35 : n < 4 ? 45 : n < 8 ? 60 : n < 12 ? 70 : 80;
  return opts.stale ? Math.min(base, 40) : base;
}

export const confidenceWord = (c: number) => (c >= 75 ? "Strong pattern" : c >= 55 ? "Signal" : "Early lead");

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** A draft checked before it is stored: bounded text, known kinds, confidence 0-100, at least a title and an observation. */
export function cleanDraft(d: InsightDraft): InsightDraft | null {
  const title = s(d.title, 160), observation = s(d.observation, 600);
  if (!d.fingerprint || !title || !observation) return null;
  return {
    ...d,
    fingerprint: s(d.fingerprint, 200),
    title,
    observation,
    metrics: d.metrics.slice(0, 8).map((m) => ({ ...m, label: s(m.label, 80), basis: s(m.basis, 160) })),
    posts: d.posts.slice(0, 6),
    explanations: d.explanations.filter((e) => e.type === "interpretation" || e.type === "hypothesis").slice(0, 5).map((e) => ({ type: e.type, text: s(e.text, 400) })),
    confidence: Math.max(0, Math.min(100, Math.round(d.confidence))),
    limitations: d.limitations.map((l) => s(l, 300)).filter(Boolean).slice(0, 5),
    recommendation: d.recommendation ? { action: s(d.recommendation.action, 200), why: s(d.recommendation.why, 400), learning: s(d.recommendation.learning, 300), href: d.recommendation.href } : null,
  };
}
