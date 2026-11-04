// Background Instagram sync: every connected account's profile, posts and
// post insights are re-read once they are older than SYNC_EVERY_MS, whether or
// not anyone opens SOCIA. Run by pg_cron every 10 minutes
// (supabase/instagram-sync-cron.sql -> /api/sync/instagram); each run refreshes
// only the accounts that are due, oldest first, so every account stays about
// half an hour fresh with room to spare as accounts grow.
//
// One account per Brand Workspace: the workspace's active account, the same one
// its pages show (syncInstagram reads it by workspace). Accounts paused by a
// plan downgrade are never read.
//
// Server only (service role).

import { syncInstagram, SYNC_EVERY_MS } from "@/lib/instagramSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type SyncRow = {
  user_id: string;
  workspace_id?: string | null;
  ig_user_id?: string | null;
  is_active?: boolean | null;
  access_token?: string | null;
  plan_suspended_at?: string | null;
  last_synced_at?: string | null;
};

export type SyncRun = { due: number; synced: number; failed: number; leftForNextRun: number };

/** Which accounts are due, oldest first; never-synced ones lead. Pure, for tests. */
export function dueAccounts(rows: SyncRow[], now: number, everyMs = SYNC_EVERY_MS): SyncRow[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => r.access_token && r.plan_suspended_at == null && r.is_active !== false)
    .filter((r) => !r.last_synced_at || now - new Date(r.last_synced_at).getTime() >= everyMs)
    .sort((a, b) => (a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0) - (b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0))
    .filter((r) => {
      // One sync per workspace (or per owner before workspaces).
      const k = `${r.user_id}:${r.workspace_id ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

async function readRows(svc: Supa): Promise<SyncRow[]> {
  // Narrower selects keep a pre-migration schema working.
  for (const cols of [
    "user_id, workspace_id, ig_user_id, is_active, access_token, plan_suspended_at, last_synced_at",
    "user_id, ig_user_id, is_active, access_token, plan_suspended_at, last_synced_at",
    "user_id, ig_user_id, access_token, last_synced_at",
  ]) {
    try {
      const { data, error } = await svc.from("instagram_connections").select(cols);
      if (!error) return (data ?? []) as SyncRow[];
    } catch {
      /* try the next shape */
    }
  }
  return [];
}

/** Refresh the due accounts within the time budget, a few at a time. */
export async function runInstagramSyncs(svc: Supa, now = new Date(), budgetMs = 45000, parallel = 4): Promise<SyncRun> {
  const deadline = Date.now() + budgetMs;
  const due = dueAccounts(await readRows(svc), now.getTime());
  const run: SyncRun = { due: due.length, synced: 0, failed: 0, leftForNextRun: 0 };
  let next = 0;
  const worker = async () => {
    while (next < due.length && Date.now() < deadline) {
      const r = due[next++];
      try {
        const snap = await syncInstagram(svc, r.user_id, r.workspace_id ?? null);
        if (snap) run.synced++;
        else run.failed++;
      } catch {
        run.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  run.leftForNextRun = Math.max(0, due.length - next);
  return run;
}
