// Server reads and writes for the Growth Profile tables (growth_goals,
// onboarding_state), always for the brand in `ctx` and always scoped to its
// workspace. Before supabase/growth-profile.sql has run, every read reports
// tableReady: false and every write is refused with a clear reason; nothing
// pretends to have saved.
//
// Server only.

import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { scopeToWorkspace, updateWorkspace } from "./workspaces";
import { isMissingTableError } from "./publishing/db";
import { goalsSummary, type Goal } from "./growth";
import type { OnboardingRow, Step } from "./onboarding";

export const NOT_READY = "Saving goals and setup progress needs the growth-profile database update first.";

type Supa = Ctx["client"];
const wsOf = (ctx: Ctx) => ctx.workspace?.id ?? null;

export async function readOnboarding(ctx: Ctx): Promise<{ tableReady: boolean; row: OnboardingRow | null }> {
  try {
    const { data, error } = await scopeToWorkspace(
      ctx.client.from("onboarding_state").select("step, answers, completed_at").eq("user_id", ctx.ownerId),
      wsOf(ctx),
    ).limit(1);
    if (error) return { tableReady: !isMissingTableError(error), row: null };
    return { tableReady: true, row: ((data as OnboardingRow[] | null) ?? [])[0] ?? null };
  } catch {
    return { tableReady: false, row: null };
  }
}

/** Save where the brand's setup stands. `mark` records flow bookkeeping (e.g. the account read ran). */
export async function saveOnboarding(
  ctx: Ctx,
  patch: { step?: Step; mark?: Record<string, unknown>; completed?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const cur = await readOnboarding(ctx);
  if (!cur.tableReady) return { ok: false, error: NOT_READY };
  const answers = { ...(cur.row?.answers ?? {}), ...(patch.mark ?? {}) };
  const row: Record<string, unknown> = { answers, updated_at: now };
  if (patch.step) row.step = patch.step;
  if (patch.completed) row.completed_at = cur.row?.completed_at ?? now;
  const res = cur.row
    ? await scopeToWorkspace(ctx.client.from("onboarding_state").update(row).eq("user_id", ctx.ownerId), wsOf(ctx))
    : await ctx.client.from("onboarding_state").insert({ ...row, user_id: ctx.ownerId, workspace_id: wsOf(ctx), step: patch.step ?? "connect" });
  return res.error ? { ok: false, error: "Couldn't save your progress. Try again." } : { ok: true };
}

const GOAL_COLS = "id, kind, metric, platforms, baseline, baseline_at, current_value, current_at, target, due_date, status";

export async function listGoals(ctx: Ctx, opts: { includeDropped?: boolean } = {}): Promise<{ tableReady: boolean; goals: Goal[] }> {
  try {
    let q = scopeToWorkspace(ctx.client.from("growth_goals").select(GOAL_COLS).eq("user_id", ctx.ownerId), wsOf(ctx));
    if (!opts.includeDropped) q = q.neq("status", "dropped");
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) return { tableReady: !isMissingTableError(error), goals: [] };
    return { tableReady: true, goals: (data ?? []) as Goal[] };
  } catch {
    return { tableReady: false, goals: [] };
  }
}

/** Add a goal, or update one of this brand's goals by id. A brand has one primary goal: a new primary demotes the old one. */
export async function saveGoal(ctx: Ctx, goal: Goal): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { tableReady } = await listGoals(ctx);
  if (!tableReady) return { ok: false, error: NOT_READY };
  const row: Record<string, unknown> = {
    kind: goal.kind, metric: goal.metric, platforms: goal.platforms, baseline: goal.baseline, target: goal.target, due_date: goal.due_date,
    current_value: goal.current_value ?? null, updated_at: now,
  };
  if (goal.baseline != null) row.baseline_at = goal.baseline_at ?? now;
  if (goal.current_value != null) row.current_at = now;
  if (goal.kind === "primary") {
    let dq = scopeToWorkspace(ctx.client.from("growth_goals").update({ kind: "secondary", updated_at: now }).eq("user_id", ctx.ownerId), wsOf(ctx)).eq("kind", "primary");
    if (goal.id) dq = dq.neq("id", goal.id);
    await dq;
  }
  if (goal.id) {
    const { data, error } = await scopeToWorkspace(ctx.client.from("growth_goals").update(row).eq("user_id", ctx.ownerId), wsOf(ctx)).eq("id", goal.id).select("id");
    if (error || !data?.length) return { ok: false, error: "That goal wasn't found in this brand." };
    return { ok: true, id: goal.id };
  }
  const { data, error } = await ctx.client.from("growth_goals").insert({ ...row, user_id: ctx.ownerId, workspace_id: wsOf(ctx), status: "active" }).select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't save that goal. Try again." };
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteGoal(ctx: Ctx, id: string): Promise<boolean> {
  const { error } = await scopeToWorkspace(ctx.client.from("growth_goals").delete().eq("user_id", ctx.ownerId), wsOf(ctx)).eq("id", id);
  return !error;
}

/** Record a goal's starting point once, when SOCIA first reads the number. */
export async function setGoalBaseline(ctx: Ctx, id: string, value: number): Promise<void> {
  await scopeToWorkspace(
    ctx.client.from("growth_goals").update({ baseline: value, baseline_at: new Date().toISOString() }).eq("user_id", ctx.ownerId),
    wsOf(ctx),
  ).eq("id", id).is("baseline", null);
}

/**
 * Write the goals as the brand's `goals` text, so the plan, Ask, captions and
 * Studio (which all read that field) follow the structured goals. Routed like
 * /api/profile: a non-default brand keeps it on its workspace, the default
 * brand on the owner's profile.
 */
export async function syncGoalsText(ctx: Ctx): Promise<void> {
  const { tableReady, goals } = await listGoals(ctx);
  if (!tableReady) return;
  const text = goalsSummary(goals);
  if (text == null) return;
  const brandWs = brandWorkspace(ctx);
  if (brandWs) await updateWorkspace(ctx.client, ctx.ownerId, brandWs.id, { goals: text });
  else await (ctx.client as Supa).from("profiles").upsert({ user_id: ctx.ownerId, goals: text, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}
