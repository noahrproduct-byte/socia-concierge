// The initialization that ends onboarding, run on the server for the brand
// in ctx: read the connected accounts the way Analytics does, record each
// measurable goal's starting point the first time it can be read, then build
// the briefing. Every outcome is what happened, including "not available".
//
// Server only.

import type { Ctx } from "./context";
import { getEntitlements } from "./entitlements";
import { loadSources } from "./api/sources";
import { platformSummaries } from "./api/read";
import { engagementRateOf } from "./engagement";
import { goalPostsPerWeek } from "./metrics";
import { listTracked } from "./trackedCompetitors";
import { competitorScopeId, scopeToWorkspace } from "./workspaces";
import { listGoals, setGoalBaseline, syncGoalsText } from "./growthStore";
import { buildBriefing, currentFor, type Briefing, type Extras, type StepOutcome } from "./briefing";
import { runInsights } from "./intel/runIntel";
import { GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, type Goal, type GrowthProfile } from "./growth";

/** The platform rows and extra numbers a goal's current value is read from. */
async function readNow(ctx: Ctx, ent: Awaited<ReturnType<typeof getEntitlements>>) {
  const src = await loadSources(ctx, ent, { days: 30 });
  const rows = await platformSummaries(ctx, src);
  const since = src.now.getTime() - src.days * 86_400_000;
  const igRecent = (src.ig?.media ?? []).filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const ttVideos = Array.isArray(src.tt?.videos) ? (src.tt!.videos as { createdAt?: string | null }[]) : [];
  const x: Extras = {
    days: src.days,
    igEngagementRate: src.ig ? engagementRateOf(igRecent, src.ig.snap.followers_count ?? null).value : null,
    igPostsPerWeek: src.ig ? goalPostsPerWeek((src.ig.media ?? []).map((m) => m.timestamp), 30, src.now.getTime()) : null,
    ttPostsPerWeek: src.tt ? goalPostsPerWeek(ttVideos.map((v) => v.createdAt), 30, src.now.getTime()) : null,
  };
  return { src, rows, x };
}

/**
 * Record a starting point for every measured goal that has none and whose
 * accounts are connected now. Used when a goal is saved, when Settings opens
 * with such a goal, and at the end of onboarding. Returns the goals, updated.
 */
export async function recordStartingPoints(ctx: Ctx, goals: Goal[]): Promise<Goal[]> {
  const pending = goals.filter((g) => g.id && g.baseline == null && goalMetric(g.metric)?.measuredOn.length);
  if (!pending.length) return goals;
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const { rows, x } = await readNow(ctx, ent);
  for (const g of pending) {
    const c = currentFor(g, rows, x);
    if (c.value != null) {
      await setGoalBaseline(ctx, g.id!, c.value);
      g.baseline = c.value;
    }
  }
  await syncGoalsText(ctx).catch(() => undefined);
  return goals;
}

export async function runInitialization(ctx: Ctx, opts: { understoodAt: string | null }): Promise<{ outcomes: StepOutcome[]; briefing: Briefing }> {
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const { src, rows, x } = await readNow(ctx, ent);

  const outcomes: StepOutcome[] = [];
  if (opts.understoodAt) outcomes.push({ label: "Read your profile and recent posts", status: "done", detail: "Used to fill in your account type, niche, audience and themes." });
  for (const r of rows.filter((row) => row.connected)) {
    const has = r.audience != null || r.views != null || r.contentPublished != null;
    outcomes.push({
      label: `Read ${GOAL_PLATFORM_NAME[r.platform]}`,
      status: has ? "done" : "unavailable",
      detail: has ? `${r.label}${r.audience != null ? `, ${r.audience.toLocaleString("en-US")} ${r.audienceLabel}` : ""}` : "Connected, but no numbers came back yet.",
    });
  }

  const { goals } = await listGoals(ctx);
  const currents = new Map<string, { value: number | null; why: string | null }>();
  for (const g of goals) {
    if (!g.id) continue;
    const c = currentFor(g, rows, x);
    currents.set(g.id, c);
    const label = `Starting point for "${goalMetric(g.metric)?.label ?? g.metric}"`;
    if (!goalMetric(g.metric)?.measuredOn.length) continue; // reported goals: nothing runs
    if (g.baseline != null) {
      outcomes.push({ label, status: "done", detail: `Already recorded: ${formatGoalValue(g.metric, g.baseline)}.` });
    } else if (c.value != null) {
      await setGoalBaseline(ctx, g.id, c.value);
      g.baseline = c.value;
      outcomes.push({ label, status: "done", detail: `Recorded ${formatGoalValue(g.metric, c.value)} today.` });
    } else {
      outcomes.push({ label, status: "unavailable", detail: c.why ?? "Not available yet." });
    }
  }
  await syncGoalsText(ctx).catch(() => undefined);

  // The first findings for the shared store, from the same data (no AI call).
  const intel = await runInsights(ctx, "onboarding").catch(() => null);
  if (intel?.tableReady) {
    outcomes.push({
      label: "Look for patterns and problems in your posts",
      status: "done",
      detail: intel.found ? `${intel.found} ${intel.found === 1 ? "finding" : "findings"} saved, each with its evidence and how sure SOCIA is.` : "Nothing stood out yet. SOCIA looks again as more posts come in.",
    });
  }

  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id).catch(() => null);
  const tracked = await listTracked(ctx.client, ctx.ownerId, "handle", { workspaceId: cwid }).catch(() => []);
  const { count: planCount } = await scopeToWorkspace(
    ctx.client.from("plans").select("id", { count: "exact", head: true }).eq("user_id", ctx.ownerId),
    ctx.workspace?.id ?? null,
  ).then((r: { count: number | null }) => r, () => ({ count: 0 }));

  const briefing = buildBriefing({
    days: src.days,
    rows,
    goals,
    currents,
    growth: (src.profile?.brand_detail?.growth ?? null) as GrowthProfile | null,
    trackedCompetitors: tracked.length,
    hasPlan: (planCount ?? 0) > 0,
  });
  return { outcomes, briefing };
}
