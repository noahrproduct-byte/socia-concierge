// Platform-general daily snapshots — the sibling of lib/snapshotJob.ts (which
// handles Instagram). Writes one point-in-time row per connected account per
// UTC day into public.platform_snapshots so a follower/subscriber trend keeps
// accumulating whether or not anyone opens SOCIA. Service-role only (cron).
//
// Today this snapshots Facebook Page follower counts — Facebook's own Insights
// API no longer offers a usable daily series (Meta deprecated the impressions/
// reach/fans family), and we don't yet hold read_insights, so SOCIA builds the
// follower trend itself from the count it can already read. YouTube subscriber/
// day persistence (Phase 3) writes to the same table.
//
// Every write is best-effort and tolerant of a pre-migration schema: if the
// platform_snapshots table isn't there yet, the job degrades to a no-op rather
// than throwing.

import { FB_GRAPH_V } from "./facebook";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const FB_BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;

export type PlatformSnapshotRun = {
  platform: string;
  day: string;
  accounts: number;
  written: number;
  skipped: number;
  errors: number;
};

export type SnapshotMetrics = {
  followers?: number | null;
  views?: number | null;
  followers_gained?: number | null;
  watch_time_minutes?: number | null;
  /** 'socia_snapshot' (point-in-time) | '<platform>_api' (finalised daily). */
  source?: string;
};

/** Upsert one account's metrics for `day`. By default the first write of the
 *  day wins (point-in-time snapshots), tolerating the pre-migration schema. Pass
 *  `overwrite` when the platform's own daily series finalizes late (YouTube) and
 *  a re-fetched value should replace the stored one. */
export async function writePlatformSnapshot(
  supabase: Supa,
  row: { user_id: string; workspace_id?: string | null; platform: string; account_id: string; day: string },
  metrics: SnapshotMetrics,
  opts: { overwrite?: boolean } = {},
): Promise<boolean> {
  // Nothing worth recording — never store a fabricated 0.
  if (metrics.followers == null && metrics.views == null && metrics.followers_gained == null && metrics.watch_time_minutes == null) {
    return false;
  }
  const base: Record<string, unknown> = {
    user_id: row.user_id,
    platform: row.platform,
    account_id: row.account_id,
    day: row.day,
    followers: metrics.followers ?? null,
    views: metrics.views ?? null,
    followers_gained: metrics.followers_gained ?? null,
    watch_time_minutes: metrics.watch_time_minutes ?? null,
    source: metrics.source ?? "socia_snapshot",
    retrieved_at: new Date().toISOString(),
  };
  const withWs = row.workspace_id ? { ...base, workspace_id: row.workspace_id } : base;
  for (const candidate of withWs === base ? [base] : [withWs, base]) {
    try {
      const { error } = await supabase
        .from("platform_snapshots")
        .upsert(candidate, { onConflict: "user_id,platform,account_id,day", ignoreDuplicates: !opts.overwrite });
      if (!error) return true;
    } catch {
      /* try the narrower shape, then give up */
    }
  }
  return false;
}

export type SnapshotUpsertRow = {
  user_id: string;
  workspace_id?: string | null;
  platform: string;
  account_id: string;
  day: string;
} & SnapshotMetrics;

/** Upsert many snapshot rows in one call (a platform's whole daily series). Used
 *  by the YouTube job, whose Analytics API returns the full window at once.
 *  Returns the number of rows sent, or 0 on failure / pre-migration schema. */
export async function writePlatformSnapshotsBatch(supabase: Supa, rows: SnapshotUpsertRow[], opts: { overwrite?: boolean } = {}): Promise<number> {
  const clean = rows.filter((r) => r.day && (r.followers != null || r.views != null || r.followers_gained != null || r.watch_time_minutes != null));
  if (!clean.length) return 0;
  const retrieved_at = new Date().toISOString();
  const shape = (withWs: boolean) =>
    clean.map((r) => ({
      user_id: r.user_id,
      ...(withWs && r.workspace_id ? { workspace_id: r.workspace_id } : {}),
      platform: r.platform,
      account_id: r.account_id,
      day: r.day,
      followers: r.followers ?? null,
      views: r.views ?? null,
      followers_gained: r.followers_gained ?? null,
      watch_time_minutes: r.watch_time_minutes ?? null,
      source: r.source ?? "socia_snapshot",
      retrieved_at,
    }));
  const hasWs = clean.some((r) => r.workspace_id);
  for (const payload of hasWs ? [shape(true), shape(false)] : [shape(false)]) {
    try {
      const { error } = await supabase
        .from("platform_snapshots")
        .upsert(payload, { onConflict: "user_id,platform,account_id,day", ignoreDuplicates: !opts.overwrite });
      if (!error) return payload.length;
    } catch {
      /* try the narrower shape */
    }
  }
  return 0;
}

export type PlatformSnapshotRow = {
  day: string;
  followers: number | null;
  views: number | null;
  followers_gained: number | null;
  watch_time_minutes: number | null;
  source: string | null;
};

/** One account's daily snapshot rows, oldest first. Empty on any error or when
 *  the table isn't there yet — an unreadable history is "none", never a guess. */
export async function readPlatformSnapshots(
  supabase: Supa,
  userId: string,
  platform: string,
  accountId: string,
): Promise<PlatformSnapshotRow[]> {
  try {
    const { data, error } = await supabase
      .from("platform_snapshots")
      .select("day, followers, views, followers_gained, watch_time_minutes, source")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("account_id", accountId)
      .order("day", { ascending: true });
    if (error) return [];
    return (data ?? []) as PlatformSnapshotRow[];
  } catch {
    return [];
  }
}

/** Does this account already have a snapshot row for `day`? */
export async function hasPlatformSnapshot(supabase: Supa, platform: string, accountId: string, day: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("platform_snapshots")
      .select("account_id")
      .eq("platform", platform)
      .eq("account_id", accountId)
      .eq("day", day)
      .limit(1);
    if (!error) return Boolean(data?.length);
  } catch {
    /* table may not exist yet */
  }
  return false;
}

// ----------------------------------------------------------------- facebook ---

type FbConn = {
  user_id: string;
  workspace_id?: string | null;
  page_id: string | null;
  access_token: string | null;
  plan_suspended_at?: string | null;
  connection_status?: string | null;
};

/** The Page's current follower count — followers_count, falling back to the
 *  legacy fan_count. null on any error (never a guessed 0). */
async function fetchFbFollowers(token: string, pageId: string): Promise<number | null> {
  try {
    const u = new URL(`${FB_BASE}/${pageId}`);
    u.searchParams.set("fields", "followers_count,fan_count");
    u.searchParams.set("access_token", token);
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { followers_count?: number; fan_count?: number };
    return j.followers_count ?? j.fan_count ?? null;
  } catch {
    return null;
  }
}

/** Record today's follower count for every connected Facebook Page that does
 *  not have one yet. Cheap when nothing is missing: one read per connection and
 *  no API call. Pages paused by a plan downgrade, expired, or awaiting Page
 *  selection are skipped — no snapshot, no call. */
export async function runFacebookDailySnapshots(supabase: Supa, now = new Date(), budgetMs = 15000): Promise<PlatformSnapshotRun> {
  const day = now.toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;
  const run: PlatformSnapshotRun = { platform: "facebook", day, accounts: 0, written: 0, skipped: 0, errors: 0 };

  // Progressively narrower selects keep a pre-migration schema working.
  let conns: FbConn[] | null = null;
  for (const cols of [
    "user_id, workspace_id, page_id, access_token, plan_suspended_at, connection_status",
    "user_id, page_id, access_token, connection_status",
    "user_id, page_id, access_token",
  ]) {
    try {
      const { data, error } = await supabase.from("facebook_connections").select(cols);
      if (error) throw error;
      conns = (data ?? []) as FbConn[];
      break;
    } catch {
      conns = null;
    }
  }
  if (!conns) return run;

  const usable = conns.filter(
    (c) =>
      c.access_token &&
      c.page_id &&
      c.plan_suspended_at == null &&
      c.connection_status !== "expired" &&
      c.connection_status !== "choose_page",
  );
  run.accounts = usable.length;

  for (const c of usable) {
    if (Date.now() > deadline) break;
    if (await hasPlatformSnapshot(supabase, "facebook", c.page_id!, day)) { run.skipped++; continue; }
    const followers = await fetchFbFollowers(c.access_token!, c.page_id!);
    if (followers == null) { run.errors++; continue; }
    const ok = await writePlatformSnapshot(
      supabase,
      { user_id: c.user_id, workspace_id: c.workspace_id ?? null, platform: "facebook", account_id: c.page_id!, day },
      { followers, source: "socia_snapshot" },
    );
    if (ok) run.written++; else run.errors++;
  }
  return run;
}
