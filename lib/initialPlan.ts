// The plan right after onboarding (Noah, 2026-10-30): the brand's Growth
// Strategy, then a first weekly plan written from it and the same evidence
// as the Sunday plan, in the background. Not counted against the plan
// allowance; once per brand, for a brand with no plan yet. Server only.

import type { Ctx } from "./context";
import { scopeToWorkspace } from "./workspaces";
import { getIgSnapshot } from "./instagramSync";
import { generatePlan } from "./planGenerate";
import { alertsEnabled, recordAlerts } from "./alerts";
import { planReadyAlert } from "./alertDetectors";
import { generateStrategy, readStrategy, saveStrategy } from "./strategyLoad";
import { comingWeekLabel, planInputsFor } from "./weeklyPlanJob";
import { createServiceClient } from "./supabase/service";
import { trackEvent } from "./events";

/**
 * Whether SOCIA already wrote this brand's first plan. Kept as a server-only
 * event, so emptying the plans list doesn't make another one free. When it
 * can't be read the answer is yes: a plan can still be made by hand.
 */
export async function initialPlanGiven(ownerId: string, workspaceId: string | null): Promise<boolean> {
  const svc = createServiceClient();
  if (!svc) return true;
  try {
    const q = svc.from("product_events").select("id").eq("user_id", ownerId).eq("name", "initial_plan");
    const { data, error } = await (workspaceId ? q.eq("props->>workspace_id", workspaceId) : q.is("props->>workspace_id", null)).limit(1);
    return Boolean(error) || (data ?? []).length > 0;
  } catch {
    return true;
  }
}

/** True when this brand has no plan yet and SOCIA hasn't written its first one, so that one is on SOCIA. */
export async function needsInitialPlan(ctx: Ctx): Promise<boolean> {
  try {
    const wsId = ctx.workspace?.id ?? null;
    const { count, error } = await scopeToWorkspace(
      ctx.client.from("plans").select("id", { count: "exact", head: true }).eq("user_id", ctx.ownerId),
      wsId,
    );
    if (error || (count ?? 0) > 0) return false;
    return !(await initialPlanGiven(ctx.ownerId, wsId));
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
  // The first plan is written once per brand, whatever happens to it afterwards.
  await trackEvent(null, ctx.ownerId, "initial_plan", { workspace_id: wsId });
  if (saved && (await alertsEnabled(ctx.client))) {
    const tz = inputs.brand?.timezone ?? "UTC";
    await recordAlerts(ctx.client, { userId: ctx.ownerId, workspaceId: wsId }, [
      planReadyAlert({ id: saved.id, headline: data.headline ?? "", posts: data.weeklyPlan?.length ?? 0, weekLabel: comingWeekLabel(now, tz) }),
    ]);
  }
  return "generated";
}
