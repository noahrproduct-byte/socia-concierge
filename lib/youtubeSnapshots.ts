// YouTube daily snapshot persistence. YouTube's Analytics API returns a genuine
// per-day series (views, watch-time minutes, subscribers gained), but SOCIA only
// ever fetched it live, so history was bounded by whatever a single query
// returned. This job writes that series into platform_snapshots on the daily
// cron so the trend becomes durable — the same durability Instagram has.
//
// YouTube finalizes recent days late, so we re-fetch a window each run and
// OVERWRITE (not first-write-wins). The Analytics API also serves history, so a
// brand-new connection is backfilled across the window on its first run.
//
// Service-role only (cron). Everything is best-effort: a channel that fails to
// refresh or returns no data is counted and skipped, never guessed.

import { refreshAccessToken } from "./youtubeAuth";
import { writePlatformSnapshotsBatch, type PlatformSnapshotRun, type SnapshotUpsertRow } from "./platformSnapshots";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const WINDOW_DAYS = 365; // one call; backfills a year and keeps recent days fresh
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type YtConn = {
  user_id: string;
  workspace_id?: string | null;
  channel_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  plan_suspended_at?: string | null;
};

/** A valid token for this channel, refreshing and persisting when near expiry. */
async function ensureToken(supabase: Supa, row: YtConn): Promise<string | null> {
  if (!row.access_token) return null;
  const expMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expMs - Date.now() > 120_000) return row.access_token;
  if (!row.refresh_token) return row.access_token;
  const tok = await refreshAccessToken(row.refresh_token);
  if (!tok) return row.access_token;
  let uq = supabase
    .from("youtube_connections")
    .update({
      access_token: tok.access_token,
      token_expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      ...(tok.refresh_token && tok.refresh_token !== row.refresh_token ? { refresh_token: tok.refresh_token } : {}),
    })
    .eq("user_id", row.user_id);
  if (row.channel_id) uq = uq.eq("channel_id", row.channel_id);
  await uq.then(() => undefined, () => undefined);
  return tok.access_token;
}

type Daily = { day: string; views: number; minutes: number; subs: number };

/** The channel's daily series over the window, or null on an API error. An
 *  empty array means the channel has no analytics data (or the scope was not
 *  granted) — distinct from a failure. */
async function fetchDaily(token: string, days: number): Promise<Daily[] | null> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const url = `${ANALYTICS}?ids=channel==MINE&startDate=${ymd(start)}&endDate=${ymd(end)}&metrics=views,estimatedMinutesWatched,subscribersGained&dimensions=day&sort=day`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000), cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  const j = (await res.json().catch(() => null)) as { columnHeaders?: { name?: string }[]; rows?: unknown[][] } | null;
  if (!j) return null;
  const headers = Array.isArray(j.columnHeaders) ? j.columnHeaders.map((h) => h.name ?? "") : [];
  const rows = Array.isArray(j.rows) ? j.rows : [];
  const iDay = headers.indexOf("day");
  const iV = headers.indexOf("views");
  const iM = headers.indexOf("estimatedMinutesWatched");
  const iS = headers.indexOf("subscribersGained");
  if (iDay < 0) return [];
  return rows.map((r) => ({ day: String(r[iDay] ?? ""), views: Number(r[iV] ?? 0), minutes: Number(r[iM] ?? 0), subs: Number(r[iS] ?? 0) }));
}

/** Persist each connected channel's daily series into platform_snapshots. */
export async function runYouTubeDailySnapshots(supabase: Supa, now = new Date(), budgetMs = 20000): Promise<PlatformSnapshotRun> {
  const day = now.toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;
  const run: PlatformSnapshotRun = { platform: "youtube", day, accounts: 0, written: 0, skipped: 0, errors: 0 };

  let conns: YtConn[] | null = null;
  for (const cols of [
    "user_id, workspace_id, channel_id, access_token, refresh_token, token_expires_at, plan_suspended_at",
    "user_id, channel_id, access_token, refresh_token, token_expires_at",
  ]) {
    try {
      const { data, error } = await supabase.from("youtube_connections").select(cols);
      if (error) throw error;
      conns = (data ?? []) as YtConn[];
      break;
    } catch {
      conns = null;
    }
  }
  if (!conns) return run;

  const usable = conns.filter((c) => c.access_token && c.channel_id && c.plan_suspended_at == null);
  run.accounts = usable.length;

  for (const c of usable) {
    if (Date.now() > deadline) break;
    const token = await ensureToken(supabase, c);
    if (!token) { run.errors++; continue; }
    const series = await fetchDaily(token, WINDOW_DAYS);
    if (series == null) { run.errors++; continue; }
    if (!series.length) { run.skipped++; continue; }
    const rows: SnapshotUpsertRow[] = series
      .filter((s) => s.day)
      .map((s) => ({
        user_id: c.user_id,
        workspace_id: c.workspace_id ?? null,
        platform: "youtube",
        account_id: c.channel_id!,
        day: s.day,
        views: s.views,
        watch_time_minutes: s.minutes,
        followers_gained: s.subs,
        source: "youtube_api",
      }));
    const wrote = await writePlatformSnapshotsBatch(supabase, rows, { overwrite: true });
    if (wrote > 0) run.written++; else run.errors++;
  }
  return run;
}
