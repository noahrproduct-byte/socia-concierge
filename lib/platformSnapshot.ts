// Cross-platform daily snapshots. Instagram keeps its own account_snapshots;
// this records YouTube subscribers/views and Facebook followers once a day so a
// real follower/subscriber history builds over time for every platform.
//
// Writes happen whenever fresh data is assembled (the analytics page load),
// first-of-day wins, and everything is defensive: if the platform_snapshots
// table hasn't been created yet the calls quietly no-op, so nothing breaks
// before the migration is run. NULL is never written as 0.

import type { createClient } from "./supabase/server";
import type { Platform } from "./analytics/types";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type PlatformSnapshotRow = { day: string; followers: number | null; views: number | null };

/** Record today's point-in-time values for a platform account. First write of
 *  the day wins (duplicates ignored), so the series is taken consistently. */
export async function recordPlatformSnapshot(
  supabase: Supa,
  userId: string,
  platform: Platform,
  accountId: string,
  day: string,
  vals: { followers?: number | null; views?: number | null; posts?: number | null },
): Promise<void> {
  if (vals.followers == null && vals.views == null) return; // nothing worth recording
  const row = {
    user_id: userId,
    platform,
    account_id: accountId || "",
    day,
    followers: vals.followers ?? null,
    views: vals.views ?? null,
    posts: vals.posts ?? null,
    source: "socia_snapshot",
    retrieved_at: new Date().toISOString(),
  };
  try {
    await supabase.from("platform_snapshots").upsert(row, { onConflict: "user_id,platform,account_id,day", ignoreDuplicates: true });
  } catch {
    // table not created yet — ignore
  }
}

/** Daily snapshots for a platform account since `sinceDay` (ISO), oldest first. */
export async function readPlatformSnapshots(
  supabase: Supa,
  userId: string,
  platform: Platform,
  accountId: string,
  sinceDay: string,
): Promise<PlatformSnapshotRow[]> {
  try {
    const { data, error } = await supabase
      .from("platform_snapshots")
      .select("day, followers, views")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("account_id", accountId || "")
      .gte("day", sinceDay)
      .order("day", { ascending: true });
    if (error) return [];
    return (data ?? []) as PlatformSnapshotRow[];
  } catch {
    return [];
  }
}
