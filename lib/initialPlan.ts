// The plan right after onboarding (Noah, 2026-10-30): the brand's Growth
// Strategy, then a first weekly plan written from it and the same evidence
// as the Sunday plan, in the background. Not counted against the plan
// allowance; only for a brand with no plan yet. Server only.

import type { Ctx } from "./context";
import { scopeToWorkspace } from "./workspaces";
import { getIgSnapshot } from "./instagramSync";
import { generatePlan } from "./planGenerate";
import { alertsEnabled, recordAlerts } from "./alerts";
import { planReadyAlert } from "./alertDetectors";
import { generateStrategy, readStrategy, saveStrategy } from "./strategyLoad";
import { comingWeekLabel, planInputsFor } from "./weeklyPlanJob";

/** True when this brand has no plan yet, so the first one is on SOCIA. */
export async function needsInitialPlan(ctx: Ctx): Promise<boolean> {
  try {
    const { count, error } = await scopeToWorkspace(
      ctx.client.from("plans").select("id", { count: "exact", head: true }).eq("user_id", ctx.ownerId),
      ctx.workspace?.id ?? null,
    );
    return !error && (count ?? 0) === 0;
  } catch {
    return false;
  }
}

export async function generateInitialPlan(ctx: Ctx, now = new Date()): Promise<"generated" | "exists" | "no_inputs"> {
  if (!(await needsInitialPlan(ctx))) return "exists";
  // The plan is built from the strategy, so write that first when it's missing.
  if (!(await readStrategy(ctx))) {
    const s = await generateStrategy(ctx, now).catch(() => null);
    if (s) await saveStrategy(ctx, s).catch(() => false);
  }
  const wsId = ctx.workspace?.id ?? null;
  const snap = await getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null);
  const inputs = await planInputsFor(ctx.client, ctx.ownerId, ctx.workspace, snap);
  if (!inputs) return "no_inputs";
  const { data, saved } = await generatePlan({ client: ctx.client, ownerId: ctx.ownerId, workspaceId: wsId, input: inputs.input, brand: inputs.brand, evidence: inputs.evidence });
  if (saved && (await alertsEnabled(ctx.client))) {
    const tz = inputs.brand?.timezone ?? "UTC";
    await recordAlerts(ctx.client, { userId: ctx.ownerId, workspaceId: wsId }, [
      planReadyAlert({ id: saved.id, headline: data.headline ?? "", posts: data.weeklyPlan?.length ?? 0, weekLabel: comingWeekLabel(now, tz) }),
    ]);
  }
  return "generated";
}
