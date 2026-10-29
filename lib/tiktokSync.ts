// Daily TikTok refresh (service role, cron). Kept apart from tiktokData.ts,
// whose reads are all for one signed-in owner: this job reads every
// connection row, like the other platforms' snapshot jobs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncTikTok } from "./tiktokData";
import { writePlatformSnapshot } from "./platformSnapshots";

export type TikTokSyncRun = { platform: "tiktok"; day: string; accounts: number; synced: number; skipped: number; errors: number };

const SYNC_EVERY_MS = 20 * 60 * 60 * 1000;

/**
 * Daily refresh of every connected TikTok account (service role, cron). Until
 * this ran, the counts were read once at connect and never again. Each account
 * is synced in its own workspace; one synced in the last 20 hours is skipped.
 * The follower count also goes into platform_snapshots as that day's point, so
 * a real follower trend starts accumulating. Best effort throughout.
 */
export async function runTikTokDailySync(supabase: SupabaseClient, now = new Date(), budgetMs = 8000): Promise<TikTokSyncRun> {
  const day = now.toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;
  const run: TikTokSyncRun = { platform: "tiktok", day, accounts: 0, synced: 0, skipped: 0, errors: 0 };

  type Row = { user_id: string; workspace_id?: string | null; open_id: string | null; access_token: string | null; last_synced_at: string | null; plan_suspended_at?: string | null };
  let rows: Row[] | null = null;
  for (const cols of [
    "user_id, workspace_id, open_id, access_token, last_synced_at, plan_suspended_at",
    "user_id, open_id, access_token, last_synced_at",
  ]) {
    const { data, error } = await supabase.from("tiktok_connections").select(cols);
    if (!error) { rows = (data ?? []) as unknown as Row[]; break; }
  }
  if (!rows) return run;

  const usable = rows.filter((r) => r.access_token && r.plan_suspended_at == null);
  run.accounts = usable.length;
  for (const r of usable) {
    if (Date.now() > deadline) break;
    if (r.last_synced_at && now.getTime() - new Date(r.last_synced_at).getTime() < SYNC_EVERY_MS) { run.skipped++; continue; }
    const res = await syncTikTok(supabase, r.user_id, r.workspace_id ?? null).catch(() => null);
    if (!res || (!res.profile && !res.videos)) { run.errors++; continue; }
    run.synced++;
    const accountId = res.profile?.openId ?? r.open_id;
    if (res.profile?.followers != null && accountId) {
      await writePlatformSnapshot(
        supabase,
        { user_id: r.user_id, workspace_id: r.workspace_id ?? null, platform: "tiktok", account_id: accountId, day },
        { followers: res.profile.followers },
      ).catch(() => false);
    }
  }
  return run;
}
