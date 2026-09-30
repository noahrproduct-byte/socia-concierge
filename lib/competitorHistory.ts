// Competitor history: append each tracked competitor's public counts once a
// day so momentum (followers over time) is real, and so the phase-2
// competitor/trend alert detectors have prior state to compare against. Public
// data only, first-of-day wins, no overwrite. Service role, from the daily cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { igCompetitorRows } from "./igCompetitorData";
import { channelStats, ytConfigured } from "./youtube";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type CompetitorPoint = { day: string; followers: number | null; media_count: number | null; views_total: number | null };
export type CompetitorMomentum = { current: number | null; previous: number | null; deltaPct: number | null; days: number; points: number };

export type CompetitorRun = { users: number; competitors: number; written: number; skipped: number; errors: number };

let enabledSince: number | null = null;
export async function competitorHistoryEnabled(supabase: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await supabase.from("competitor_snapshots").select("handle", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

type TrackedRow = { platform: string; handle: string; user_id: string; workspace_id?: string | null };

/** Has this competitor already got a row for `day`? Keeps the job cheap on re-runs. */
async function hasRow(svc: Supa, userId: string, platform: string, handle: string, day: string): Promise<boolean> {
  const { data } = await svc.from("competitor_snapshots").select("handle", { head: false }).eq("user_id", userId).eq("platform", platform).eq("handle", handle).eq("day", day).limit(1);
  return Boolean(data?.length);
}

async function writeRow(svc: Supa, row: { user_id: string; workspace_id: string | null; platform: string; handle: string; day: string; followers: number | null; media_count: number | null; views_total: number | null }): Promise<boolean> {
  const { error } = await svc.from("competitor_snapshots").upsert(row, { onConflict: "user_id,platform,handle,day" });
  return !error;
}

/**
 * Record today's public counts for every active tracked competitor. Budget-
 * bounded: IG competitors of one owner are fetched in a single Business
 * Discovery batch (shares the 6-hour cache), YouTube one channel at a time.
 */
export async function recordCompetitorSnapshots(svc: Supa, now = new Date(), budgetMs = 20000): Promise<CompetitorRun> {
  const run: CompetitorRun = { users: 0, competitors: 0, written: 0, skipped: 0, errors: 0 };
  if (!(await competitorHistoryEnabled(svc))) return run;
  const day = now.toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;

  // Every active tracked competitor across all owners, grouped by owner.
  let rows: TrackedRow[] = [];
  try {
    // listTracked is per-user; read the table directly for the cron sweep.
    const { data, error } = await svc.from("tracked_competitors").select("user_id, platform, handle, is_active");
    if (error) throw error;
    rows = ((data ?? []) as (TrackedRow & { is_active?: boolean })[]).filter((r) => r.is_active !== false);
  } catch {
    try {
      const { data } = await svc.from("tracked_competitors").select("user_id, platform, handle");
      rows = (data ?? []) as TrackedRow[];
    } catch {
      return run;
    }
  }

  // Map each owner to its default workspace id (best-effort; nullable).
  const wsByOwner = new Map<string, string | null>();
  const byOwner = new Map<string, TrackedRow[]>();
  for (const r of rows) byOwner.set(r.user_id, [...(byOwner.get(r.user_id) ?? []), r]);

  for (const [ownerId, list] of byOwner) {
    if (Date.now() > deadline) break;
    run.users++;
    if (!wsByOwner.has(ownerId)) {
      try {
        const { data } = await svc.from("workspaces").select("id").eq("owner_id", ownerId).eq("is_default", true).limit(1);
        wsByOwner.set(ownerId, (data?.[0]?.id as string | undefined) ?? null);
      } catch { wsByOwner.set(ownerId, null); }
    }
    const wsId = wsByOwner.get(ownerId) ?? null;

    // Instagram, in one batch (Business Discovery, cached).
    const igHandles = list.filter((r) => r.platform === "instagram").map((r) => r.handle);
    if (igHandles.length && Date.now() < deadline) {
      try {
        const res = await igCompetitorRows(svc, ownerId, igHandles);
        for (const c of res.competitors) {
          run.competitors++;
          if (!c.found || c.followers == null) { run.skipped++; continue; }
          if (await hasRow(svc, ownerId, "instagram", c.handle, day)) { run.skipped++; continue; }
          const ok = await writeRow(svc, { user_id: ownerId, workspace_id: wsId, platform: "instagram", handle: c.handle, day, followers: c.followers ?? null, media_count: c.mediaCount ?? null, views_total: null });
          if (ok) run.written++; else run.errors++;
        }
      } catch { run.errors++; }
    }

    // YouTube, one channel at a time (public Data API).
    const ytHandles = list.filter((r) => r.platform === "youtube").map((r) => r.handle);
    if (ytHandles.length && ytConfigured()) {
      for (const h of ytHandles) {
        if (Date.now() > deadline) break;
        run.competitors++;
        try {
          if (await hasRow(svc, ownerId, "youtube", h, day)) { run.skipped++; continue; }
          const s = await channelStats(h);
          if (!s.found || s.subscribers == null) { run.skipped++; continue; }
          const ok = await writeRow(svc, { user_id: ownerId, workspace_id: wsId, platform: "youtube", handle: h, day, followers: s.subscribers ?? null, media_count: s.videoCount ?? null, views_total: s.lifetimeViews ?? null });
          if (ok) run.written++; else run.errors++;
        } catch { run.errors++; }
      }
    }
  }
  return run;
}

/** A competitor's stored history (newest first), for momentum. */
export async function readCompetitorHistory(supabase: Supa, ownerId: string, platform: string, handle: string, days = 30): Promise<CompetitorPoint[]> {
  if (!(await competitorHistoryEnabled(supabase))) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("competitor_snapshots")
    .select("day, followers, media_count, views_total")
    .eq("user_id", ownerId).eq("platform", platform).eq("handle", handle.replace(/^@/, "").toLowerCase())
    .gte("day", since)
    .order("day", { ascending: false });
  if (error) return [];
  return (data ?? []) as CompetitorPoint[];
}

/**
 * Follower momentum over the window: the latest value against the earliest
 * within `days`. null when there are fewer than two points (history still
 * collecting) — never a guess, and never 0 for unknown.
 */
export function competitorMomentum(points: CompetitorPoint[], days = 7): CompetitorMomentum {
  const withF = points.filter((p) => p.followers != null) as (CompetitorPoint & { followers: number })[];
  if (withF.length < 2) return { current: withF[0]?.followers ?? null, previous: null, deltaPct: null, days, points: withF.length };
  // points are newest-first; current = newest, previous = oldest in window.
  const current = withF[0].followers;
  const previous = withF[withF.length - 1].followers;
  const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { current, previous, deltaPct, days, points: withF.length };
}
