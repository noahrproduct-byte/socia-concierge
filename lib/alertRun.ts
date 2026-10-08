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
//   cross-platform      (Growth+) breakouts on Facebook and TikTok, performance
//                       changes on YouTube and Facebook, and one post that did
//                       very differently on the platforms it went to
// The last three are Growth+ features and run daily for EVERY workspace (not
// only those with Instagram); their fingerprints are namespaced per workspace.

import { formatOf } from "./overview";
import { interactionsTotal } from "./engagement";
import type { IgMediaItem } from "./instagramSync";
import {
  detectBreakouts, detectPerformanceChange, detectCompetitorMoves, detectNicheTrends, detectFormatGap, detectPlanResults,
  detectCrossPlatformSplit, isoWeekKey, type AlertCandidate, type BreakoutPost, type CompetitorSeries, type PlanResultItem, type CrossPlatformItem,
} from "./alertDetectors";
import { recentPlanOutcomes, loadDestinationsLite } from "./planOutcomesLoad";
import { measureDestination, resultLine, PLATFORM_NAME } from "./postResults";
import { fbPostEngagement } from "./metrics/facebook";
import type { FbPost } from "./facebookSync";
import type { TtVideo } from "./tiktokAuth";
import type { Platform } from "./publishing/types";
import { recordAlerts, alertsEnabled } from "./alerts";
import { getEntitlements, canUseFeature, type Entitlements } from "./entitlements";
import { competitorScopeId, competitorsScopedEnabled } from "./workspaces";

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

/** Settled results of planned posts (plan -> Calendar -> published -> measured), from the last two plans. */
async function planResultsFor(svc: Supa, userId: string, workspaceId: string | null, now: Date): Promise<AlertCandidate[]> {
  try {
    const outcomes = await recentPlanOutcomes(svc, userId, workspaceId, 2, now);
    const items: PlanResultItem[] = [];
    for (const o of outcomes) {
      for (const it of o.items) {
        if (it.state !== "published" || !it.result) continue;
        items.push({
          planId: o.planId, index: it.index, day: it.day, concept: it.concept, format: it.format, platform: it.result.platform,
          multiplier: it.result.multiplier, measured: it.result.measured, early: it.result.early, short: it.result.short, text: it.result.text, permalink: it.permalink,
        });
      }
    }
    return detectPlanResults(items);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cross-platform (Growth+): the other platforms' stored data, no API calls.
// ---------------------------------------------------------------------------

type PlatSnap = { day: string; followers: number | null; views: number | null; followers_gained: number | null; watch_time_minutes: number | null; source: string | null };

/** A connection row in this workspace (or the user's, before workspaces). */
async function connectionRow<T>(svc: Supa, table: string, cols: string, userId: string, workspaceId: string | null): Promise<T | null> {
  try {
    let q = svc.from(table).select(cols).eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q.limit(1);
    if (error) return null;
    return ((data ?? [])[0] as T) ?? null;
  } catch {
    return null;
  }
}

async function platformSnaps(svc: Supa, userId: string, platform: string, accountId: string, now: Date): Promise<PlatSnap[]> {
  try {
    const since = new Date(now.getTime() - 15 * dayMs).toISOString().slice(0, 10);
    const { data, error } = await svc.from("platform_snapshots").select("day, followers, views, followers_gained, watch_time_minutes, source")
      .eq("user_id", userId).eq("platform", platform).eq("account_id", accountId).gte("day", since);
    if (error) return [];
    return (data ?? []) as PlatSnap[];
  } catch {
    return [];
  }
}

/** Sum of a daily metric over the last 7 days and the 7 before (null when a period has no values). */
function weekSums(rows: PlatSnap[], pick: (r: PlatSnap) => number | null, now: Date): { cur: number | null; prev: number | null } {
  const mid = now.getTime() - 7 * dayMs, start = now.getTime() - 14 * dayMs;
  const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  const sum = (xs: PlatSnap[]) => { const v = xs.map(pick).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  return { cur: sum(rows.filter((r) => t(r.day) >= mid)), prev: sum(rows.filter((r) => t(r.day) >= start && t(r.day) < mid)) };
}

/** Net follower change over the last 7 days and the 7 before, from point-in-time follower snapshots. */
function followerNet(rows: PlatSnap[], now: Date): { cur: number | null; prev: number | null } {
  const byDay = new Map(rows.filter((r) => r.followers != null).map((r) => [r.day, r.followers as number]));
  const at = (daysAgo: number) => {
    for (let k = 0; k <= 1; k++) { const d = new Date(now.getTime() - (daysAgo + k) * dayMs).toISOString().slice(0, 10); if (byDay.has(d)) return byDay.get(d)!; }
    return null;
  };
  const f0 = at(0), f7 = at(7), f14 = at(14);
  return { cur: f0 != null && f7 != null ? f0 - f7 : null, prev: f7 != null && f14 != null ? f7 - f14 : null };
}

const FB_FORMAT: Record<string, string> = { added_video: "Video", added_photos: "Photo", shared_story: "Link", mobile_status_update: "Post", created_note: "Post" };

async function crossPlatformFor(svc: Supa, userId: string, workspaceId: string | null, igMedia: IgMediaItem[], now: Date): Promise<AlertCandidate[]> {
  const out: AlertCandidate[] = [];
  const weekKey = isoWeekKey(now);
  const [fb, yt, tt] = await Promise.all([
    connectionRow<{ page_id: string | null; media: unknown; connection_status: string | null }>(svc, "facebook_connections", "page_id, media, connection_status", userId, workspaceId),
    connectionRow<{ channel_id: string | null }>(svc, "youtube_connections", "channel_id", userId, workspaceId),
    connectionRow<{ open_id: string | null; videos: unknown }>(svc, "tiktok_connections", "open_id, videos", userId, workspaceId),
  ]);
  const fbPosts = fb && fb.connection_status !== "choose_page" && Array.isArray(fb.media) ? (fb.media as FbPost[]) : [];

  // Facebook: breakout posts, and new followers week over week.
  if (fbPosts.length) {
    const posts: BreakoutPost[] = fbPosts
      .map((p) => ({ id: p.id ?? "", format: FB_FORMAT[p.status_type ?? ""] ?? "Post", interactions: fbPostEngagement(p) ?? -1, timestampMs: p.created_time ? new Date(p.created_time).getTime() : NaN, permalink: p.permalink_url ?? null, caption: p.message ?? null }))
      .filter((p) => p.id && p.interactions >= 0 && Number.isFinite(p.timestampMs));
    out.push(...detectBreakouts({ platform: "facebook", posts, now: now.getTime(), platformLabel: "Facebook" }));
  }
  if (fb?.page_id) {
    const net = followerNet(await platformSnaps(svc, userId, "facebook", fb.page_id, now), now);
    const a = detectPerformanceChange({ platform: "facebook", metric: "new_followers", metricLabel: "Facebook new followers", current: net.cur, previous: net.prev, periodDays: 7, weekKey, minPct: 25, floor: 5 });
    if (a) out.push(a);
  }

  // YouTube: views, subscribers gained and watch time from the stored daily series.
  if (yt?.channel_id) {
    const rows = (await platformSnaps(svc, userId, "youtube", yt.channel_id, now)).filter((r) => r.source === "youtube_api");
    const metrics: { metric: string; label: string; pick: (r: PlatSnap) => number | null; floor: number }[] = [
      { metric: "views", label: "YouTube views", pick: (r) => r.views, floor: 50 },
      { metric: "subscribers_gained", label: "YouTube subscribers gained", pick: (r) => r.followers_gained, floor: 5 },
      { metric: "watch_time", label: "YouTube watch time", pick: (r) => r.watch_time_minutes, floor: 30 },
    ];
    for (const m of metrics) {
      const w = weekSums(rows, m.pick, now);
      const a = detectPerformanceChange({ platform: "youtube", metric: m.metric, metricLabel: m.label, current: w.cur, previous: w.prev, periodDays: 7, weekKey, minPct: 25, floor: m.floor });
      if (a) out.push(a);
    }
  }

  // TikTok: breakout videos by views (TikTok's own per-video totals).
  const videos = tt && Array.isArray(tt.videos) ? (tt.videos as TtVideo[]) : [];
  if (videos.length) {
    const posts: BreakoutPost[] = videos
      .map((v) => ({ id: v.id, format: "Video", interactions: v.views ?? -1, timestampMs: v.createdAt ? new Date(v.createdAt).getTime() : NaN, permalink: v.url ?? null, caption: v.caption ?? null }))
      .filter((p) => p.id && p.interactions >= 0 && Number.isFinite(p.timestampMs));
    out.push(...detectBreakouts({ platform: "tiktok", posts, now: now.getTime(), metric: "views", platformLabel: "TikTok" }));
  }

  // One post on several platforms: Instagram and Facebook are measured from stored data.
  try {
    let q = svc.from("scheduled_posts").select("id, caption, status, published_media_id, updated_at, permalink").eq("user_id", userId).eq("status", "published")
      .gte("updated_at", new Date(now.getTime() - 30 * dayMs).toISOString());
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data } = await q.limit(100);
    const posts = (data ?? []) as { id: string; caption: string | null }[];
    if (posts.length) {
      const dests = await loadDestinationsLite(svc, posts.map((p) => p.id));
      const sources = { instagram: igMedia.length ? igMedia : null, facebook: fbPosts.length ? fbPosts : null, youtube: null, youtubeRecent: null };
      const items: CrossPlatformItem[] = [];
      for (const p of posts) {
        const published = dests.filter((d) => d.postId === p.id && d.status === "published" && d.externalPostId && (d.platform === "instagram" || d.platform === "facebook"));
        if (new Set(published.map((d) => d.platform)).size < 2) continue;
        items.push({
          postId: p.id,
          caption: p.caption,
          results: published.map((d) => {
            const line = resultLine(measureDestination(d.platform as Platform, d.externalPostId!, sources), d.publishedAt, now);
            return { platform: d.platform, label: PLATFORM_NAME[d.platform as Platform], multiplier: line.multiplier, settled: line.measured && !line.early };
          }),
        });
      }
      out.push(...detectCrossPlatformSplit(items));
    }
  } catch { /* no comparison this run */ }
  return out;
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

  // Every connected account, in every workspace: is_active only points at the
  // owner's active workspace, and a workspace without Instagram leaves all of
  // their rows inactive — the other workspaces still get their alerts. Paused
  // accounts (plan downgrade) are not read.
  let conns: IgConn[] = [];
  try {
    const { data, error } = await svc
      .from("instagram_connections")
      .select("user_id, ig_user_id, workspace_id, media, plan_suspended_at");
    if (error) throw error;
    conns = ((data ?? []) as IgConn[]).filter((c) => c.plan_suspended_at == null);
  } catch {
    // pre-workspaces schema: no workspace_id column
    try {
      const { data } = await svc.from("instagram_connections").select("user_id, ig_user_id, media");
      conns = ((data ?? []) as IgConn[]).map((c) => ({ ...c, workspace_id: null }));
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

  // Pass 1: Instagram-specific detectors (breakout, performance), per
  // connected Instagram account. These read the account's own posts and snapshots.
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

  // Enumerate per workspace only once competitors + discovery are actually
  // isolated (the competitors migration). Before that their data is still pooled
  // per user, so iterating workspaces would record the same pooled signal once
  // per workspace (distinct :ws: fingerprints defeat dedup); fall back to one
  // pass per user instead. Ordered for deterministic coverage under the budget.
  let wss: { id: string; owner_id: string }[] | null = null;
  if (await competitorsScopedEnabled(svc)) {
    try {
      const { data, error } = await svc.from("workspaces").select("id, owner_id").is("plan_suspended_at", null).order("created_at", { ascending: true });
      if (!error) wss = (data ?? []) as { id: string; owner_id: string }[];
    } catch {
      wss = null;
    }
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
      candidates.push(...(await planResultsFor(svc, u.userId, u.workspaceId, now)));
      if (canUseFeature(ent, "cross_platform_alerts")) candidates.push(...(await crossPlatformFor(svc, u.userId, u.workspaceId, u.media, now)));
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
