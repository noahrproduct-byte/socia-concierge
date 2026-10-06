// Weekly trend roundup: a once-a-week digest for a Brand Workspace, assembled
// from the SAME real data and pure detectors the alerts use — so nothing here is
// invented. It is its own Starter+ feature and computes its view directly
// (niche trends, competitor moves, the account's own wins and the one format
// gap), independent of the real-time alert plan gates. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem } from "./instagramSync";
import { buildKpis, formatOf, type Kpi } from "./overview";
import { interactionsTotal } from "./engagement";
import { competitorScopeId } from "./workspaces";
import {
  detectBreakouts, detectNicheTrends, detectCompetitorMoves, detectFormatGap,
  isoWeekKey, type AlertCandidate, type BreakoutPost, type CompetitorSeries,
} from "./alertDetectors";
import type { DailySnapshot } from "./dashboardMetrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;
const DAY = 86400000;

/** One line of the roundup — the detector's own title, body and evidence. */
export type RoundupItem = { title: string; body: string; evidence: Record<string, unknown> };

export type WeeklyRoundup = {
  rangeLabel: string;
  days: number;
  /** Instagram is connected in this workspace (KPIs and breakouts come from it). */
  connected: boolean;
  kpis: Kpi[];
  trends: RoundupItem[];
  competitorMoves: RoundupItem[];
  breakouts: RoundupItem[];
  opportunities: RoundupItem[];
  /** Nothing to show yet (no account connected and no niche/competitor signals). */
  empty: boolean;
};

const toItem = (c: AlertCandidate): RoundupItem => ({ title: c.title, body: c.body, evidence: c.evidence });

const KPI_IDS = ["views", "engagement_rate", "followers", "posts"] as const;

export async function buildWeeklyRoundup(
  supabase: Supa,
  ownerId: string,
  workspaceId: string | null,
  now: Date = new Date(),
): Promise<WeeklyRoundup> {
  const days = 7;
  const nowMs = now.getTime();
  const weekKey = isoWeekKey(now);
  const cwid = await competitorScopeId(supabase, workspaceId);

  // ---- The account's own week: KPIs + breakout posts (Instagram) -----------
  let kpis: Kpi[] = [];
  let breakouts: RoundupItem[] = [];
  let media: IgMediaItem[] = [];
  let connected = false;
  const snap = await getIgSnapshot(supabase, ownerId, workspaceId).catch(() => null);
  if (snap) {
    connected = true;
    media = (Array.isArray(snap.media) ? snap.media : []) as IgMediaItem[];
    let daily: DailySnapshot[] = [];
    try {
      daily = await readDailySnapshots<DailySnapshot>(supabase, ownerId, snap.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source");
    } catch { /* KPIs still build from posts */ }
    const all = buildKpis({ media, daily, followers: snap.followers_count ?? null, days });
    kpis = KPI_IDS.map((id) => all.find((k) => k.id === id)).filter((k): k is Kpi => Boolean(k));
    const posts: BreakoutPost[] = media
      .filter((m) => m.id && m.timestamp)
      .map((m) => ({ id: m.id!, format: formatOf(m), interactions: interactionsTotal(m), timestampMs: new Date(m.timestamp!).getTime(), permalink: m.permalink ?? null, caption: m.caption ?? null }))
      .filter((p) => Number.isFinite(p.timestampMs));
    breakouts = detectBreakouts({ platform: "instagram", posts, now: nowMs }).map(toItem);
  }

  // ---- The niche: trends + the one format gap (discovered content) ---------
  let trends: RoundupItem[] = [];
  let opportunities: RoundupItem[] = [];
  try {
    let q = supabase.from("discovered_content").select("trend_tags, multiplier, content_type, last_checked, published_at").eq("user_id", ownerId);
    if (cwid) q = q.eq("workspace_id", cwid);
    const { data } = await q.limit(200);
    const rows = (data ?? []) as { trend_tags: unknown; multiplier: number | null; content_type: string | null; last_checked: string | null; published_at: string | null }[];
    if (rows.length) {
      const items = rows.map((r) => ({
        trendTags: Array.isArray(r.trend_tags) ? (r.trend_tags as unknown[]).map((t) => String(t)) : [],
        multiplier: r.multiplier,
        whenMs: new Date(r.last_checked ?? r.published_at ?? 0).getTime(),
      }));
      trends = detectNicheTrends({ items, now: nowMs, weekKey }).map(toItem);
      const nicheWinnerFormats = rows.filter((r) => (r.multiplier ?? 0) >= 2).map((r) => r.content_type ?? "").filter(Boolean);
      const userFormats = [...media]
        .filter((m) => m.timestamp)
        .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
        .slice(0, 20)
        .map((m) => formatOf(m));
      const opp = detectFormatGap({ userFormats, nicheWinnerFormats, weekKey });
      if (opp) opportunities = [toItem(opp)];
    }
  } catch { /* no niche data yet */ }

  // ---- Competitors: follower moves (tracked handles + snapshots) -----------
  let competitorMoves: RoundupItem[] = [];
  try {
    let tq = supabase.from("tracked_competitors").select("platform, handle").eq("user_id", ownerId);
    if (cwid) tq = tq.eq("workspace_id", cwid);
    const { data: tracked } = await tq;
    const trows = (tracked ?? []) as { platform: string; handle: string }[];
    if (trows.length) {
      const handles = [...new Set(trows.map((r) => r.handle.toLowerCase()))];
      const since = new Date(nowMs - 12 * DAY).toISOString().slice(0, 10);
      const { data: snaps } = await supabase.from("competitor_snapshots")
        .select("platform, handle, day, followers")
        .eq("user_id", ownerId).in("handle", handles).gte("day", since);
      const byKey = new Map<string, CompetitorSeries>();
      for (const s of (snaps ?? []) as { platform: string; handle: string; day: string; followers: number | null }[]) {
        const key = `${s.platform}:${s.handle.toLowerCase()}`;
        const cur = byKey.get(key) ?? { handle: s.handle, points: [] };
        cur.points.push({ day: s.day, followers: s.followers });
        byKey.set(key, cur);
      }
      const out: AlertCandidate[] = [];
      for (const platform of ["instagram", "youtube"] as const) {
        const comps = [...byKey.entries()].filter(([k]) => k.startsWith(`${platform}:`)).map(([, v]) => v);
        if (comps.length) out.push(...detectCompetitorMoves({ platform, competitors: comps, weekKey }));
      }
      competitorMoves = out.map(toItem);
    }
  } catch { /* no competitor history yet */ }

  const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const rangeLabel = `${fmtDay(nowMs - (days - 1) * DAY)} – ${fmtDay(nowMs)}`;
  const empty = !connected && !trends.length && !competitorMoves.length && !opportunities.length;

  return { rangeLabel, days, connected, kpis, trends, competitorMoves, breakouts, opportunities, empty };
}
