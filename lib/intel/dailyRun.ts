// The scheduled intelligence refresh: runs the detectors (runInsights) for
// every brand with a connected Instagram or YouTube account, at most once a
// day each. Called every few hours by supabase/intel-refresh-cron.sql
// through /api/jobs/intel-refresh; each call refreshes the brands not
// refreshed in the last REFRESH_EVERY_H hours, oldest first, within its time
// budget, so the day's calls work through every brand.
//
// YouTube is quota-aware: a brand with YouTube costs one channel read and one
// videos read (a few units of the project's daily Data API quota), and a run
// reads at most YT_PER_RUN of them. A brand over that allowance is deferred
// whole to the next run, never refreshed without its YouTube posts: that
// would mark its YouTube findings as no longer showing when nothing changed.
//
// No AI call. Service role; server only.

import type { Ctx } from "../context";
import { workspacesByIds } from "../workspaces";
import { runInsights } from "./runIntel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const REFRESH_EVERY_H = 20;
export const YT_PER_RUN = 25;
const AT_ONCE = 3;

export type Brand = { userId: string; workspaceId: string | null; youtube: boolean };
export type DailyIntelRun = { brands: number; due: number; refreshed: number; deferredYouTube: number; outOfTime: number; errors: number };

const keyOf = (b: { userId: string; workspaceId: string | null }) => `${b.userId}:${b.workspaceId ?? "-"}`;

/**
 * Which brands this run refreshes: those not refreshed in the last
 * REFRESH_EVERY_H hours, never-refreshed first, then the oldest; brands with
 * YouTube only while the run's YouTube allowance lasts. Pure.
 */
export function planRun(brands: Brand[], lastRefreshed: Map<string, number>, now: number, ytPerRun = YT_PER_RUN): { run: Brand[]; due: number; deferredYouTube: number } {
  const cutoff = now - REFRESH_EVERY_H * 3_600_000;
  const due = brands
    .filter((b) => (lastRefreshed.get(keyOf(b)) ?? 0) < cutoff)
    .sort((a, b) => (lastRefreshed.get(keyOf(a)) ?? 0) - (lastRefreshed.get(keyOf(b)) ?? 0));
  const run: Brand[] = [];
  let yt = 0, deferredYouTube = 0;
  for (const b of due) {
    if (b.youtube) {
      if (yt >= ytPerRun) { deferredYouTube++; continue; }
      yt++;
    }
    run.push(b);
  }
  return { run, due: due.length, deferredYouTube };
}

/** One brand per connected, unpaused account's (owner, workspace); YouTube marked. */
export function brandsFrom(ig: { user_id: string; workspace_id?: string | null }[], yt: { user_id: string; workspace_id?: string | null }[]): Brand[] {
  const out = new Map<string, Brand>();
  for (const c of ig) {
    const b = { userId: c.user_id, workspaceId: c.workspace_id ?? null, youtube: false };
    if (!out.has(keyOf(b))) out.set(keyOf(b), b);
  }
  for (const c of yt) {
    const b = { userId: c.user_id, workspaceId: c.workspace_id ?? null, youtube: true };
    out.set(keyOf(b), b);
  }
  return [...out.values()];
}

async function connections(svc: Supa, table: string, cols: string): Promise<{ user_id: string; workspace_id?: string | null; plan_suspended_at?: string | null }[]> {
  // workspace_id / plan_suspended_at may not exist on an old schema.
  for (const c of [cols, "user_id"]) {
    const { data, error } = await svc.from(table).select(c);
    if (!error) return (data ?? []) as { user_id: string; workspace_id?: string | null; plan_suspended_at?: string | null }[];
  }
  return [];
}

export async function runDailyInsights(svc: Supa, now = new Date(), budgetMs = 240_000): Promise<DailyIntelRun> {
  const deadline = Date.now() + budgetMs;
  const [ig, yt] = await Promise.all([
    connections(svc, "instagram_connections", "user_id, workspace_id, plan_suspended_at"),
    connections(svc, "youtube_connections", "user_id, workspace_id, plan_suspended_at"),
  ]);
  const live = (c: { plan_suspended_at?: string | null }) => c.plan_suspended_at == null;
  const brands = brandsFrom(ig.filter(live), yt.filter(live));

  // When each brand's insights were last refreshed (by this job, onboarding or Check again).
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const last = new Map<string, number>();
  const { data: jobs, error: jobsErr } = await svc
    .from("intelligence_jobs").select("user_id, workspace_id, finished_at")
    .eq("kind", "refresh_insights").eq("status", "done").gte("finished_at", since);
  // Without the jobs table the insights table is missing too: nothing to do.
  if (jobsErr) return { brands: brands.length, due: 0, refreshed: 0, deferredYouTube: 0, outOfTime: 0, errors: 0 };
  for (const j of (jobs ?? []) as { user_id: string; workspace_id: string | null; finished_at: string }[]) {
    const k = keyOf({ userId: j.user_id, workspaceId: j.workspace_id });
    last.set(k, Math.max(last.get(k) ?? 0, Date.parse(j.finished_at)));
  }

  const plan = planRun(brands, last, now.getTime());
  const workspaces = await workspacesByIds(svc, [...new Set(plan.run.map((b) => b.workspaceId).filter((x): x is string => Boolean(x)))]);
  const result: DailyIntelRun = { brands: brands.length, due: plan.due, refreshed: 0, deferredYouTube: plan.deferredYouTube, outOfTime: 0, errors: 0 };

  for (let i = 0; i < plan.run.length; i += AT_ONCE) {
    if (Date.now() > deadline) { result.outOfTime = plan.run.length - i; break; }
    await Promise.all(plan.run.slice(i, i + AT_ONCE).map(async (b) => {
      const ws = b.workspaceId ? workspaces.get(b.workspaceId) ?? null : null;
      // A deleted or paused brand: its rows stay as they are.
      if (b.workspaceId && (!ws || ws.suspended)) return;
      const ctx: Ctx = { viewerId: b.userId, ownerId: b.userId, workspace: ws, role: "owner", client: svc, isOwner: true };
      try {
        await runInsights(ctx, "cron");
        result.refreshed++;
      } catch (e) {
        result.errors++;
        console.error("[intel-refresh]", b.userId, b.workspaceId, (e as Error)?.message ?? e);
      }
    }));
  }
  return result;
}
