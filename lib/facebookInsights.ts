// Facebook Page Insights (the /insights edge) — the metrics that need the
// read_insights permission: Page views, video views and the daily follower
// flow. Server only.
//
// Meta retired the impressions/reach/page_fans family across all API versions
// (2025–2026), so this deliberately asks only for metrics that survived. Each
// metric is fetched on its own and any failure resolves to null: when
// read_insights hasn't been granted (public users pre-review, or a connection
// made before the scope was added) every call fails and the reader reports
// `available: false`, and the UI keeps saying "not available" instead of
// inventing numbers. Nothing here is estimated.

import { FB_GRAPH_V } from "./facebook";
import { activeWorkspaceId, workspacesEnabled } from "./workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;

export type FbInsightPoint = { day: string; value: number };
export type FbInsightSeries = { series: FbInsightPoint[]; total: number };

export type FbInsights = {
  /** true when at least one insight came back (read_insights is working). */
  available: boolean;
  /** Page views per day (page_views_total). */
  views: FbInsightSeries | null;
  /** Video views per day across the Page's videos (page_video_views). */
  videoViews: FbInsightSeries | null;
  /** New follows per day, from Facebook itself (page_daily_follows). */
  dailyFollows: FbInsightSeries | null;
};

type Conn = { page_id: string; access_token: string };

/** The active workspace's usable Facebook connection (token + Page), or null. */
async function readConn(supabase: Supa, userId: string): Promise<Conn | null> {
  try {
    const wsId = (await workspacesEnabled(supabase)) ? await activeWorkspaceId(supabase, userId) : null;
    let q = supabase
      .from("facebook_connections")
      .select("page_id, access_token, plan_suspended_at, connection_status")
      .eq("user_id", userId);
    if (wsId) q = q.eq("workspace_id", wsId);
    const { data, error } = await q.limit(1);
    if (error) return null;
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
    if (!row?.access_token || !row.page_id) return null;
    if (row.plan_suspended_at != null) return null;
    if (row.connection_status === "expired" || row.connection_status === "choose_page") return null;
    return { page_id: String(row.page_id), access_token: String(row.access_token) };
  } catch {
    return null;
  }
}

// Meta serves at most 90 days of Page Insights per query, so a longer range is
// read in consecutive windows (kept a day under the limit to be safe).
const MAX_WINDOW_S = 89 * 86400;

/** Split [since, until) into consecutive windows no longer than Meta allows. */
export function insightWindows(since: number, until: number, maxSpan = MAX_WINDOW_S): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = since; s < until; s += maxSpan) out.push([s, Math.min(until, s + maxSpan)]);
  return out;
}

/** One daily metric over any range, read window by window. All-or-nothing: if
 *  any window fails the metric is null (unavailable) — a total missing a chunk
 *  would silently undercount. Days at a window edge are de-duplicated. */
async function fetchDailyMetric(token: string, pageId: string, metric: string, since: number, until: number): Promise<FbInsightPoint[] | null> {
  const parts = await Promise.all(insightWindows(since, until).map(([s, u]) => fetchMetricWindow(token, pageId, metric, s, u)));
  if (!parts.length || parts.some((p) => p == null)) return null;
  const byDay = new Map<string, number>();
  for (const p of parts) for (const pt of p!) byDay.set(pt.day, pt.value);
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([day, value]) => ({ day, value }));
}

/** One daily metric for a single ≤90-day window from /{page}/insights, or null
 *  on any error (including "permission not granted" and "invalid metric"). */
async function fetchMetricWindow(token: string, pageId: string, metric: string, since: number, until: number): Promise<FbInsightPoint[] | null> {
  try {
    const u = new URL(`${BASE}/${pageId}/insights`);
    u.searchParams.set("metric", metric);
    u.searchParams.set("period", "day");
    u.searchParams.set("since", String(since));
    u.searchParams.set("until", String(until));
    u.searchParams.set("access_token", token);
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: Array<{ values?: Array<{ value?: unknown; end_time?: string }> }> } | null;
    const entry = j?.data?.[0];
    if (!entry?.values) return null;
    // end_time is the END of the day bucket; the value belongs to the day before it.
    return entry.values
      .map((v) => {
        const end = v.end_time ? new Date(v.end_time) : null;
        const day = end ? new Date(end.getTime() - 86400000).toISOString().slice(0, 10) : "";
        const n = typeof v.value === "number" ? v.value : Number(v.value);
        return { day, value: Number.isFinite(n) ? n : 0 };
      })
      .filter((p) => p.day);
  } catch {
    return null;
  }
}

const pack = (s: FbInsightPoint[] | null): FbInsightSeries | null =>
  s ? { series: s, total: s.reduce((a, p) => a + p.value, 0) } : null;

/** Page Insights for the active workspace's Page over the last `days` days.
 *  null when there is no usable connection; `available: false` when the
 *  connection exists but read_insights isn't granted (or every metric failed). */
export async function getFacebookInsights(supabase: Supa, userId: string, days: number): Promise<FbInsights | null> {
  const conn = await readConn(supabase, userId);
  if (!conn) return null;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const [views, videoViews, follows] = await Promise.all([
    fetchDailyMetric(conn.access_token, conn.page_id, "page_views_total", since, until),
    fetchDailyMetric(conn.access_token, conn.page_id, "page_video_views", since, until),
    fetchDailyMetric(conn.access_token, conn.page_id, "page_daily_follows", since, until),
  ]);
  const available = Boolean(views || videoViews || follows);
  return { available, views: pack(views), videoViews: pack(videoViews), dailyFollows: pack(follows) };
}
