// Server side of experiments (lib/experiments.ts): the test posts the recent
// plans tagged for each of the strategy's experiments, with what became of
// each (lib/planOutcomesLoad.ts), and the verdict. Read-only. Server only.

import { scopeToWorkspace } from "./workspaces";
import { loadPlanOutcomes } from "./planOutcomesLoad";
import type { Deliverable } from "./schema";
import type { GrowthStrategy } from "./strategy";
import { evaluateExperiment, type ExperimentRow, type ExperimentTest } from "./experiments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** Plans looked back over for test posts: about two months of weekly plans. */
const PLANS_BACK = 10;

export type { ExperimentRow };

export async function experimentResults(supabase: Supa, ownerId: string, workspaceId: string | null, strategy: GrowthStrategy | null | undefined, now = new Date()): Promise<ExperimentRow[]> {
  const exps = (strategy?.experiments ?? []).filter((e) => e.id);
  if (!exps.length) return [];
  let plans: { id: string; data: Deliverable; created_at: string }[] = [];
  try {
    const { data, error } = await scopeToWorkspace(supabase.from("plans").select("id, data, created_at").eq("user_id", ownerId), workspaceId)
      .order("created_at", { ascending: false }).limit(PLANS_BACK);
    if (error) throw error;
    plans = (data ?? []) as typeof plans;
  } catch {
    plans = [];
  }
  const tagged = plans.filter((p) => (p.data?.weeklyPlan ?? []).some((it) => it.experiment));
  const outcomes = tagged.length ? await loadPlanOutcomes(supabase, ownerId, workspaceId, tagged, now).catch(() => new Map()) : new Map();
  const testsFor = new Map<string, ExperimentTest[]>();
  for (const p of tagged) {
    const o = outcomes.get(p.id);
    (p.data.weeklyPlan ?? []).forEach((it, i) => {
      if (!it.experiment || it.decision?.status === "rejected") return;
      const io = o?.items[i];
      const t: ExperimentTest = {
        planId: p.id, planCreatedAt: p.created_at, day: it.day, title: it.title || it.concept.slice(0, 80),
        state: io?.state ?? "unscheduled", permalink: io?.permalink ?? null,
        multiplier: io?.result?.measured ? io.result.multiplier : null, early: io?.result?.early ?? false,
      };
      testsFor.set(it.experiment, [...(testsFor.get(it.experiment) ?? []), t]);
    });
  }
  return exps.map((e) => ({ id: e.id!, hypothesis: e.hypothesis, status: e.status ?? "running", result: evaluateExperiment(testsFor.get(e.id!) ?? []) }));
}
