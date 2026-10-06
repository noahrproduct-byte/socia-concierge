// Keeps Instagram snapshots fresh in the background. Pages render whatever
// snapshot they have and refresh after the response (lib/instagramSync.ts);
// this runs on the publisher's five-minute tick and re-syncs the OLDEST stale
// accounts, a couple per run, so that a workspace nobody has opened for a
// while is still current when someone switches into it. Paused accounts and
// accounts that never synced (a dead token would just fail again) are skipped.
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncInstagram } from "./instagramSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** Older than this and the account is refreshed on the next tick with time to spare. */
export const REFRESH_AFTER_MS = 5 * 60 * 60 * 1000;
const PER_RUN = 2;
/** A sync is tens of Graph calls; stop starting new ones when less than this is left. */
const MIN_LEFT_MS = 12_000;

export type SnapshotRefreshRun = { considered: number; refreshed: number; errors: number; skipped: number };

export async function refreshStaleSnapshots(svc: Supa, now: Date, budgetMs: number): Promise<SnapshotRefreshRun> {
  const run: SnapshotRefreshRun = { considered: 0, refreshed: 0, errors: 0, skipped: 0 };
  const deadline = Date.now() + budgetMs;
  const before = new Date(now.getTime() - REFRESH_AFTER_MS).toISOString();
  let rows: { user_id: string; ig_user_id: string | null; workspace_id: string | null; last_synced_at: string | null }[] = [];
  try {
    const { data, error } = await svc
      .from("instagram_connections")
      .select("user_id, ig_user_id, workspace_id, last_synced_at")
      .is("plan_suspended_at", null)
      .not("access_token", "is", null)
      .not("last_synced_at", "is", null)
      .lt("last_synced_at", before)
      .order("last_synced_at", { ascending: true })
      .limit(PER_RUN);
    if (error) throw error;
    rows = (data ?? []) as typeof rows;
  } catch (e) {
    console.error("[snapshot-refresh] could not list stale accounts:", (e as Error)?.message ?? e);
    return run;
  }
  run.considered = rows.length;
  for (const r of rows) {
    if (Date.now() > deadline - MIN_LEFT_MS) { run.skipped++; continue; }
    try {
      const fresh = await syncInstagram(svc, r.user_id, r.workspace_id ?? undefined);
      if (fresh) run.refreshed++; else run.errors++;
    } catch (e) {
      run.errors++;
      console.error(`[snapshot-refresh] ${r.user_id}/${r.ig_user_id}:`, (e as Error)?.message ?? e);
    }
  }
  return run;
}
