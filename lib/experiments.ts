// Experiments: how SOCIA learns which recommendations actually help. Each
// one is a hypothesis from the Growth Strategy (lib/strategy.ts) with an id;
// the weekly plan tags the posts that test it (weeklyPlan[].experiment), and
// SOCIA measures those posts once published, each against the account's own
// median on its platform (lib/postResults.ts). The verdict is arithmetic over
// settled results with stated thresholds; too few posts is "too early",
// never a guess. Pure.

import type { ItemOutcome } from "./planOutcomes";
import type { Platform } from "./publishing/types";
import { confidenceFor, type InsightDraft } from "./intel/insight";

/** Settled, measured test posts needed before a verdict. */
export const MIN_TESTS = 3;
/** Median result (against the account's own median) that supports a hypothesis, or fails to. */
export const SUPPORTS_AT = 1.2;
export const FAILS_BELOW = 0.9;

export type Verdict = "too_early" | "supported" | "not_supported" | "mixed";

export type ExperimentTest = {
  planId: string;
  planCreatedAt: string;
  day: string;
  title: string;
  state: ItemOutcome["state"];
  /** The platform its headline result came from, once published. */
  platform: Platform | null;
  permalink: string | null;
  /** Settled result against the account's own median; null until measured and settled. */
  multiplier: number | null;
  early: boolean;
};

export type ExperimentResult = {
  planned: number;
  published: number;
  /** Settled measurements behind the verdict. */
  measured: number;
  medianMultiplier: number | null;
  beat: number;
  verdict: Verdict;
  interpretation: string;
  nextAction: string;
  tests: ExperimentTest[];
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The verdict and its plain reading, from the test posts' settled results. */
export function evaluateExperiment(tests: ExperimentTest[]): ExperimentResult {
  const published = tests.filter((t) => t.state === "published");
  const settled = published.filter((t) => t.multiplier != null && !t.early).map((t) => t.multiplier!);
  const med = median(settled);
  const beat = settled.filter((m) => m > 1).length;
  const base = { planned: tests.length, published: published.length, measured: settled.length, medianMultiplier: med != null ? r1(med) : null, beat, tests };

  if (settled.length < MIN_TESTS) {
    const need = MIN_TESTS - settled.length;
    return {
      ...base,
      verdict: "too_early",
      interpretation: settled.length
        ? `${plural(settled.length, "test post")} measured so far (median ${r1(med!)}x your median). ${MIN_TESTS} are needed before SOCIA reads a result.`
        : tests.length ? "No test post has a settled result yet." : "No post has tested it yet.",
      nextAction: tests.length - published.length > 0
        ? `Publish the ${plural(tests.length - published.length, "planned test post")} still waiting${need > tests.length - published.length ? `, then ${plural(need - (tests.length - published.length), "more")}` : ""}.`
        : `Plan ${plural(need, "more test post")}; the next weekly plan includes them.`,
    };
  }
  const head = `${plural(settled.length, "test post")} measured: median ${r1(med!)}x your median, ${beat} of ${settled.length} above it.`;
  if (med! >= SUPPORTS_AT && beat * 3 >= settled.length * 2) {
    return { ...base, verdict: "supported", interpretation: `${head} That supports the hypothesis for your account, though ${settled.length} posts are a small sample and other things changed too.`, nextAction: "Make it a regular part of your plan, and keep measuring it against your median." };
  }
  if (med! < FAILS_BELOW) {
    return { ...base, verdict: "not_supported", interpretation: `${head} That doesn't support the hypothesis for your account so far.`, nextAction: "Stop this test, or change one thing about it and run it again." };
  }
  return { ...base, verdict: "mixed", interpretation: `${head} Mixed: not a clear lead or a clear miss.`, nextAction: "Run two more test posts before deciding." };
}

/** One strategy experiment with its result (built by lib/experimentsLoad.ts). */
export type ExperimentRow = { id: string; hypothesis: string; status: string; result: ExperimentResult };

export const VERDICT_LABEL: Record<Verdict, string> = { too_early: "Too early", supported: "Supported", not_supported: "Not supported", mixed: "Mixed" };

/** Results as evidence lines for the plan writer and Ask SOCIA. */
export function experimentsEvidence(rows: { id: string; hypothesis: string; status: string; result: ExperimentResult }[]): string {
  if (!rows.length) return "";
  return rows.map((r) => `- [${r.id}] ${r.hypothesis} (${r.status}). ${VERDICT_LABEL[r.result.verdict]}: ${r.result.interpretation} Next: ${r.result.nextAction}`).join("\n");
}

// ---------------------------------------------------------------------------
// Into the shared intelligence store, so Overview's Recent learning,
// Diagnostics, Reports and Ask SOCIA see what the experiments showed
// ---------------------------------------------------------------------------

export const EXPERIMENTS_PRODUCER = "experiments";

/**
 * One finding per experiment with a verdict. The verdict is in the
 * fingerprint, so a change (mixed, then supported) reads as a new finding and
 * the old one as no longer showing. Too-early experiments make none.
 */
export function experimentInsights(rows: ExperimentRow[], now: Date): InsightDraft[] {
  return rows.filter((r) => r.result.verdict !== "too_early").map((r) => {
    const res = r.result;
    const label = res.verdict === "supported" ? "supported" : res.verdict === "not_supported" ? "not supported" : "mixed so far";
    return {
      fingerprint: `experiment:${r.id}:${res.verdict}`,
      producer: EXPERIMENTS_PRODUCER,
      category: "performance" as const,
      platform: null,
      title: `Experiment ${label}: ${r.hypothesis.replace(/\.$/, "")}`,
      observation: res.interpretation.split(". ")[0] + ".",
      metrics: [
        { label: "Median result", value: res.medianMultiplier, unit: "multiple" as const, basis: "test posts against your own median" },
        { label: "Test posts measured", value: res.measured, unit: "count" as const, basis: `${res.beat} above your median` },
      ],
      posts: res.tests.filter((t) => t.platform && t.permalink && t.state === "published").slice(0, 4).map((t) => ({ platform: t.platform!, id: t.permalink!, title: t.title, permalink: t.permalink })),
      periodStart: res.tests.map((t) => t.planCreatedAt).sort()[0] ?? null,
      periodEnd: now.toISOString(),
      explanations: [
        { type: "interpretation" as const, text: res.interpretation },
        { type: "hypothesis" as const, text: "Other things changed in the same weeks (topics, timing, the audience), so the test posts can't prove the cause on their own." },
      ],
      confidence: Math.min(70, confidenceFor(res.measured)),
      limitations: [
        "Measured by the number SOCIA can read on each platform (interactions on Instagram and Facebook, views on YouTube), which may differ from the experiment's own measure.",
        `${res.measured} posts are a small sample.`,
      ],
      recommendation: { action: res.nextAction, why: res.interpretation.split(". ")[0] + ".", learning: "Whether the result holds as more posts test it.", href: "/plan/strategy" },
      source: { rule: `experiment.verdict: >=${MIN_TESTS} settled tests, supported >=${SUPPORTS_AT}x median with 2/3 above, not supported <${FAILS_BELOW}x`, data: [`${res.planned} planned, ${res.published} published, ${res.measured} measured`], retrievedAt: now.toISOString() },
    };
  });
}
