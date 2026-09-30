// Alert detection run: read each active workspace's real, already-stored data
// and turn it into verified alert events. No new API calls and no model. Runs
// from the daily cron (service role), after the snapshot job.
//
// Launch detectors (Instagram, from stored data):
//   breakout            a recent post above its own format's median
//   performance_change  reach / views / new-followers vs the previous 7 days
// YouTube, TikTok and the trend/competitor detectors follow once their history
// is stored; the fingerprint scheme already namespaces by platform and type.

import { formatOf } from "./overview";
import { interactionsTotal } from "./engagement";
import type { IgMediaItem } from "./instagramSync";
import { detectBreakouts, detectPerformanceChange, isoWeekKey, type AlertCandidate, type BreakoutPost } from "./alertDetectors";
import { recordAlerts, alertsEnabled } from "./alerts";
import { getEntitlements, canUseFeature, type Entitlements } from "./entitlements";

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

/** Read active Instagram connections, detect, and record. Cheap: no external calls. */
export async function runAlertDetection(svc: Supa, now = new Date(), budgetMs = 15000): Promise<AlertRun> {
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
  return run;
}
