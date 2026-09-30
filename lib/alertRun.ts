// Alert detection run: read each active workspace's real, already-stored data
// and turn it into verified alert events. No new API calls and no model. Runs
// from the daily cron (service role), after the snapshot job.
//
// Detectors (from stored data, per active workspace):
//   breakout            a recent post above its own format's median
//   performance_change  reach / views / new-followers vs the previous 7 days
//   competitor_move     a tracked competitor's followers moved (competitor_snapshots)
//   trend               a niche tag carried by several recent winners (discovered_content)
//   opportunity         a winning niche format the account barely posts
// The last three are Growth+ features and run daily for EVERY workspace (not
// only those with Instagram); their fingerprints are namespaced per workspace.

import { formatOf } from "./overview";
import { interactionsTotal } from "./engagement";
import type { IgMediaItem } from "./instagramSync";
import {
  detectBreakouts, detectPerformanceChange, detectCompetitorMoves, detectNicheTrends, detectFormatGap,
  isoWeekKey, type AlertCandidate, type BreakoutPost, type CompetitorSeries,
} from "./alertDetectors";
import { recordAlerts, alertsEnabled } from "./alerts";
import { getEntitlements, canUseFeature, type Entitlements } from "./entitlements";
import { competitorScopeId } from "./workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type AlertRun = { workspaces: number; candidates: number; recorded: number; errors: number };

type IgConn = { user_id: string; ig_user_id: string | null; workspace_id: string | null; media: unknown; is_active?: boolean | null; plan_suspended_at?: string | null };
type Snap = { day: string; reach: number | null; views: number | null; followers_gained: number | null; source: string | null };

const dayMs = 86400000;

/** Breakouts from the account's stored posts. */
function breakoutsFor(platform: string, media: IgMediaItem[], now: number): AlertCandidate[] {
  const posts: BreakoutPost[] = media
    .filter((m) => m.id && m.timestamp)
    .map((m) => ({
      id: m.id!,
      format: formatOf(m),
      interactions: interactionsTotal(m),
      timestampMs: new Date(m.timestamp!).getTime(),
      permalink: m.permalink ?? null,
      caption: m.caption ?? null,
    }))
    .filter((p) => Number.isFinite(p.timestampMs));
  return detectBreakouts({ platform, posts, now });
}

/** Reach / views / new-followers, last 7 days vs the 7 before, from stored snapshots. */
async function performanceFor(svc: Supa, conn: IgConn, now: Date): Promise<AlertCandidate[]> {
  const since = new Date(now.getTime() - 14 * dayMs).toISOString().slice(0, 10);
  let rows: Snap[] = [];
  try {
    let q = svc.from("account_snapshots").select("day, reach, views, followers_gained, source").eq("user_id", conn.user_id).gte("day", since);
    if (conn.ig_user_id) q = q.eq("ig_user_id", conn.ig_user_id);
    const { data, error } = await q;
    if (error) throw error;
    rows = (data ?? []) as Snap[];
  } catch {
    return [];
  }
  const midMs = now.getTime() - 7 * dayMs;
  const inCur = (day: string) => new Date(`${day}T00:00:00Z`).getTime() >= midMs;
  const daily = rows.filter((r) => r.source === "instagram_api");
  const sum = (pick: (r: Snap) => number | null, cur: boolean) => {
    const vals = daily.filter((r) => inCur(r.day) === cur).map(pick).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const weekKey = isoWeekKey(now);
  const metrics: { metric: string; label: string; pick: (r: Snap) => number | null }[] = [
    { metric: "reach", label: "Reach", pick: (r) => r.reach },
    { metric: "views", label: "Views", pick: (r) => r.views },
    { metric: "new_followers", label: "New followers", pick: (r) => r.followers_gained },
  ];
  const out: AlertCandidate[] = [];
  for (const m of metrics) {
    const a = detectPerformanceChange({
      platform: "instagram", metric: m.metric, metricLabel: m.label,
      current: sum(m.pick, true), previous: sum(m.pick, false),
      periodDays: 7, weekKey, minPct: 25, floor: m.metric === "new_followers" ? 5 : 50,
    });
    if (a) out.push(a);
  }
  return out;
}

type TrackedRow = { platform: string; handle: string };
type SnapRow = { platform: string; handle: string; day: string; followers: number | null };
type ContentRow = { trend_tags: unknown; multiplier: number | null; content_type: string | null; last_checked: string | null; published_at: string | null };

/** Competitor follower moves, from this workspace's tracked handles and stored snapshots. */
async function competitorMovesFor(svc: Supa, userId: string, workspaceId: string | null, now: Date): Promise<AlertCandidate[]> {
  try {
    const cwid = await competitorScopeId(svc, workspaceId);
    let tq = svc.from("tracked_competitors").select("platform, handle").eq("user_id", userId);
    if (cwid) tq = tq.eq("workspace_id", cwid);
    const { data: tracked } = await tq;
    const rows = (tracked ?? []) as TrackedRow[];
    if (!rows.length) return [];
    const handles = [...new Set(rows.map((r) => r.handle.toLowerCase()))];
    const since = new Date(now.getTime() - 12 * dayMs).toISOString().slice(0, 10);
    const { data: snaps } = await svc.from("competitor_snapshots")
      .select("platform, handle, day, followers")
      .eq("user_id", userId).in("handle", handles).gte("day", since);
    const byKey = new Map<string, CompetitorSeries>();
    for (const s of (snaps ?? []) as SnapRow[]) {
      const key = `${s.platform}:${s.handle.toLowerCase()}`;
      const cur = byKey.get(key) ?? { handle: s.handle, points: [] };
      cur.points.push({ day: s.day, followers: s.followers });
      byKey.set(key, cur);
    }
    const weekKey = isoWeekKey(now);
    const out: AlertCandidate[] = [];
    for (const platform of ["instagram", "youtube"] as const) {
      const comps = [...byKey.entries()].filter(([k]) => k.startsWith(`${platform}:`)).map(([, v]) => v);
      if (comps.length) out.push(...detectCompetitorMoves({ platform, competitors: comps, weekKey }));
    }
    return out;
  } catch {
    return [];
  }
}

/** Niche trend + format-opportunity, from this workspace's discovered content and the account's own posts. */
async function nicheSignalsFor(svc: Supa, userId: string, workspaceId: string | null, ent: Entitlements, media: IgMediaItem[], now: Date): Promise<AlertCandidate[]> {
  const wantTrend = canUseFeature(ent, "trend_alerts");
  const wantOpp = canUseFeature(ent, "opportunity_alerts");
  if (!wantTrend && !wantOpp) return [];
  try {
    const cwid = await competitorScopeId(svc, workspaceId);
    let q = svc.from("discovered_content").select("trend_tags, multiplier, content_type, last_checked, published_at").eq("user_id", userId);
    if (cwid) q = q.eq("workspace_id", cwid);
    const { data } = await q.limit(200);
    const rows = (data ?? []) as ContentRow[];
    if (!rows.length) return [];
    const weekKey = isoWeekKey(now);
    const out: AlertCandidate[] = [];
    if (wantTrend) {
      const items = rows.map((r) => ({
        trendTags: Array.isArray(r.trend_tags) ? (r.trend_tags as unknown[]).map((t) => String(t)) : [],
        multiplier: r.multiplier,
        whenMs: new Date(r.last_checked ?? r.published_at ?? 0).getTime(),
      }));
      out.push(...detectNicheTrends({ items, now: now.getTime(), weekKey }));
    }
    if (wantOpp) {
      const nicheWinnerFormats = rows.filter((r) => (r.multiplier ?? 0) >= 2).map((r) => r.content_type ?? "").filter(Boolean);
      const userFormats = [...media]
        .filter((m) => m.timestamp)
        .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
        .slice(0, 20)
        .map((m) => formatOf(m));
      const opp = detectFormatGap({ userFormats, nicheWinnerFormats, weekKey });
      if (opp) out.push(opp);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Read active Instagram connections, detect, and record. No external calls.
 * The cheap detectors (breakout, performance) run on every publisher tick; the
 * Phase-2 detectors (competitor / trend / opportunity) query per-workspace
 * competitor + discovery data and only change daily, so they run when
 * `opts.phase2` is set — from the daily cron, not every 5-minute tick.
 */
export async function runAlertDetection(svc: Supa, now = new Date(), budgetMs = 15000, opts: { phase2?: boolean } = {}): Promise<AlertRun> {
  const run: AlertRun = { workspaces: 0, candidates: 0, recorded: 0, errors: 0 };
  if (!(await alertsEnabled(svc))) return run;
  const deadline = Date.now() + budgetMs;

  let conns: IgConn[] = [];
  try {
    const { data, error } = await svc
      .from("instagram_connections")
      .select("user_id, ig_user_id, workspace_id, media, is_active, plan_suspended_at");
    if (error) throw error;
    conns = ((data ?? []) as IgConn[]).filter((c) => c.is_active !== false && c.plan_suspended_at == null);
  } catch {
    // pre-workspaces schema: no workspace_id column
    try {
      const { data } = await svc.from("instagram_connections").select("user_id, ig_user_id, media, is_active");
      conns = ((data ?? []) as IgConn[]).filter((c) => c.is_active !== false).map((c) => ({ ...c, workspace_id: null }));
    } catch {
      return run;
    }
  }

  // Which alert types an owner gets is a plan feature: every plan has breakout
  // alerts, Starter and up add performance-change alerts. Resolve once per owner.
  const entByOwner = new Map<string, Entitlements>();
  const entFor = async (owner: string): Promise<Entitlements> => {
    let e = entByOwner.get(owner);
    if (!e) { e = await getEntitlements(svc, owner); entByOwner.set(owner, e); }
    return e;
  };

  // Pass 1: Instagram-specific detectors (breakout, performance), per active
  // Instagram connection. These read the account's own posts and snapshots.
  for (const c of conns) {
    if (Date.now() > deadline) break;
    run.workspaces++;
    try {
      const ent = await entFor(c.user_id);
      const media = Array.isArray(c.media) ? (c.media as IgMediaItem[]) : [];
      const candidates: AlertCandidate[] = [];
      if (canUseFeature(ent, "breakout_alerts")) candidates.push(...breakoutsFor("instagram", media, now.getTime()));
      if (canUseFeature(ent, "performance_change_alerts")) candidates.push(...(await performanceFor(svc, c, now)));
      run.candidates += candidates.length;
      if (candidates.length) run.recorded += await recordAlerts(svc, { userId: c.user_id, workspaceId: c.workspace_id ?? null }, candidates);
    } catch {
      run.errors++;
    }
  }

  // Pass 2 (daily): workspace-level detectors — competitor moves, niche trends,
  // format gaps. These run for EVERY workspace, not just those with Instagram,
  // so a YouTube-only or discovery-only brand still gets them.
  if (opts.phase2) await runWorkspacePhase2(svc, conns, entFor, now, deadline, run);

  return run;
}

/** Phase-2 detectors across all workspaces (post-migration) or per user (before it). */
async function runWorkspacePhase2(
  svc: Supa,
  conns: IgConn[],
  entFor: (owner: string) => Promise<Entitlements>,
  now: Date,
  deadline: number,
  run: AlertRun,
): Promise<void> {
  // The account's own posts, per workspace, for the opportunity detector.
  const mediaByWs = new Map<string, IgMediaItem[]>();
  for (const c of conns) if (c.workspace_id) mediaByWs.set(c.workspace_id, Array.isArray(c.media) ? (c.media as IgMediaItem[]) : []);

  // Every non-suspended workspace; before the workspaces migration, fall back to
  // one implicit workspace per user (via the Instagram connections).
  let wss: { id: string; owner_id: string }[] | null = null;
  try {
    const { data, error } = await svc.from("workspaces").select("id, owner_id").is("plan_suspended_at", null);
    if (!error) wss = (data ?? []) as { id: string; owner_id: string }[];
  } catch {
    wss = null;
  }
  const units: { userId: string; workspaceId: string | null; media: IgMediaItem[] }[] = wss
    ? wss.map((w) => ({ userId: w.owner_id, workspaceId: w.id, media: mediaByWs.get(w.id) ?? [] }))
    : conns.map((c) => ({ userId: c.user_id, workspaceId: null, media: Array.isArray(c.media) ? (c.media as IgMediaItem[]) : [] }));

  for (const u of units) {
    if (Date.now() > deadline) break;
    try {
      const ent = await entFor(u.userId);
      const candidates: AlertCandidate[] = [];
      if (canUseFeature(ent, "competitor_alerts")) candidates.push(...(await competitorMovesFor(svc, u.userId, u.workspaceId, now)));
      candidates.push(...(await nicheSignalsFor(svc, u.userId, u.workspaceId, ent, u.media, now)));
      if (!candidates.length) continue;
      // Namespace the fingerprint by workspace so the same competitor, tag or
      // format alerts each brand independently (dedup is per user + fingerprint).
      const scoped = u.workspaceId
        ? candidates.map((a) => ({ ...a, fingerprint: `${a.fingerprint}:ws:${u.workspaceId}` }))
        : candidates;
      run.candidates += scoped.length;
      run.recorded += await recordAlerts(svc, { userId: u.userId, workspaceId: u.workspaceId }, scoped);
    } catch {
      run.errors++;
    }
  }
}
