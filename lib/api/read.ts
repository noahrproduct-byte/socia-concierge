// SOCIA's read API: the service layer behind the MCP tools (and, later, the
// developer API). Every function takes a request context for one workspace
// and returns plain data built by the SAME builders the Dashboard and
// Analytics pages use, so an assistant can never state a number SOCIA's own
// pages wouldn't. Plan gates match the pages: a section the plan doesn't
// include comes back as unavailable with the reason, never as zeros. A
// number SOCIA doesn't have is null with a note, never 0.
//
// Output never includes platform tokens, internal storage paths or other
// accounts' data.
import type { Ctx } from "../context";
import type { Entitlements } from "../entitlements";
import { canUseFeature } from "../entitlements";
import { minPlanWithFeature, PLANS, type FeatureKey } from "../plans";
import { median } from "../metrics";
import { interactionsTotal } from "../engagement";
import { buildGaps } from "../gaps";
import { buildFacebookAnalytics } from "../metrics/facebook";
import { buildTikTokAnalytics } from "../metrics/tiktok";
import { buildYouTubeAnalytics } from "../metrics/youtube";
import { buildAllPlatforms } from "../metrics/allPlatforms";
import { instagramSummary, facebookSummary, youtubeSummary, tiktokSummary } from "../platformSummaries";
import { DAY_MS, buildInsights, buildKpis, buildSeries, formatOf, postCards, rankPosts, type Kpi, type PostCard, type Series } from "../overview";
import { getAlerts } from "../alerts";
import { scopeToWorkspace } from "../workspaces";
import { loadPickerAccountsDetailed, loadDestinationRows, trialReelsByMedia } from "../publishing/db";
import { availabilityFor } from "../publishing/capabilities";
import { trialOf } from "../publishing/trial";
import type { DestinationSettings, Platform } from "../publishing/types";
import { recommendedWindows, betweenPhrase } from "../publishing/timing";
import { DOW_LONG } from "../postingTimes";
import { loadPlanOutcome } from "../planOutcomesLoad";
import { dailyRecommendations } from "../dailyRecs";
import { loadStudioNext, loadWaitingComments, todayFacts } from "../dailyRecsLoad";
import type { Deliverable } from "../schema";
import type { ScheduledPost } from "../scheduling";
import type { TtVideo } from "../tiktokAuth";
import { appOrigin } from "../oauth/config";
import { ApiFailure } from "./context";
import { loadSources, PLATFORM_KEYS, type PlatformKey, type Sources } from "./sources";

const NAME: Record<PlatformKey, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const link = (path: string) => `${appOrigin()}${path}`;

/** The section is on a higher plan: say which, never return a zero. */
function locked(ent: Entitlements, feature: FeatureKey) {
  const plan = minPlanWithFeature(feature);
  return { available: false as const, reason: `${PLANS[plan].name} plan and up (this workspace is on ${PLANS[ent.plan].name}).` };
}

const total = (s: Series, compare: boolean) => ({
  value: s.total,
  previous_period: compare ? s.prevTotal : null,
  note: s.note,
  source: s.provenance,
});

const kpiOut = (k: Kpi, compare: boolean) => ({
  id: k.id, label: k.label, value: k.raw, display: k.value,
  change_pct: compare ? k.deltaPct : null, status: k.status, note: k.note, source: k.source,
});

/** A timezone the caller passed, checked. */
export function checkTimezone(tz: string | undefined): string {
  const z = tz?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    throw new ApiFailure("invalid_input", `"${z}" isn't a time zone. Use an IANA name like "America/Chicago".`);
  }
}

// ----------------------------------------------------- per-platform views

type IgView = {
  handle: string | null;
  followers: number | null;
  posts: PostCard[];
  inRange: PostCard[];
  kpis: Kpi[];
  series: Record<"views" | "engagement" | "followers" | "reach", Series>;
  baseline: number | null;
};

async function instagramView(ctx: Ctx, src: Sources): Promise<IgView | null> {
  if (!src.ig) return null;
  const { snap, media, daily } = src.ig;
  const followers = snap.followers_count ?? null;
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  const trials = await trialReelsByMedia(ctx.client, ctx.ownerId, posts.map((p) => p.id));
  for (const p of posts) p.trial = trials.get(p.id) ?? null;
  const since = src.now.getTime() - src.days * DAY_MS;
  return {
    handle: snap.username ?? null, followers, posts, baseline,
    inRange: posts.filter((p) => new Date(p.published).getTime() >= since),
    kpis: buildKpis({ media, daily, followers, days: src.days, now: src.now }),
    series: {
      views: buildSeries("views", media, daily, src.days, src.now),
      engagement: buildSeries("engagement", media, daily, src.days, src.now),
      followers: buildSeries("followers", media, daily, src.days, src.now),
      reach: buildSeries("reach", media, daily, src.days, src.now),
    },
  };
}

const fbView = (src: Sources) => (src.fb ? buildFacebookAnalytics({ snap: src.fb.snap, snapshots: src.fb.snaps, days: src.days, rangeLabel: src.rangeLabel, now: src.now, insights: src.fb.insights }) : null);
const ytView = (src: Sources) => (src.yt ? buildYouTubeAnalytics({ yt: src.yt, days: src.days, rangeLabel: src.rangeLabel, now: src.now }) : null);
const ttView = (src: Sources) => (src.tt ? buildTikTokAnalytics({ row: src.tt as never, days: src.days, rangeLabel: src.rangeLabel, now: src.now }) : null);

const rangeOut = (src: Sources) => ({ days: src.days, label: src.rangeLabel, ...(src.clampedFrom ? { note: `Shortened from ${src.clampedFrom} days to the plan's analytics history.` } : {}) });

// ------------------------------------------------------------- the reads

export async function listConnectedAccounts(ctx: Ctx) {
  const { accounts, complete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id);
  return {
    accounts: accounts.map((a) => {
      const av = availabilityFor(a.platform, { status: a.status, suspended: a.suspended, scopes: a.scopes });
      return {
        platform: a.platform, account_id: a.accountId, name: a.label, handle: a.handle,
        connection: a.suspended ? "paused_by_plan" : a.status === "expired" ? "needs_reconnect" : "connected",
        publishing_through_socia: av.state === "available" ? "available" : av.state,
        ...(av.state !== "available" && "reason" in av ? { publishing_note: av.reason } : {}),
      };
    }),
    ...(complete ? {} : { note: "Some connections couldn't be read just now; this list may be incomplete." }),
  };
}

export async function getAccountAnalytics(ctx: Ctx, ent: Entitlements, input: { platform?: PlatformKey; days?: number }) {
  const platforms = input.platform ? [input.platform] : PLATFORM_KEYS;
  const src = await loadSources(ctx, ent, { days: input.days, platforms });
  const compare = canUseFeature(ent, "period_comparison");
  const out: Record<string, unknown>[] = [];
  const notConnected: string[] = [];

  if (platforms.includes("instagram")) {
    const ig = await instagramView(ctx, src);
    if (!ig) notConnected.push("instagram");
    else out.push({
      platform: "instagram", account: ig.handle ? `@${ig.handle}` : "Instagram", followers: ig.followers,
      kpis: ig.kpis.map((k) => kpiOut(k, compare)),
      totals: { views: total(ig.series.views, compare), reach: total(ig.series.reach, compare), interactions: total(ig.series.engagement, compare), followers: total(ig.series.followers, compare) },
      posts_in_range: ig.inRange.length,
    });
  }
  if (platforms.includes("youtube")) {
    const yt = ytView(src);
    if (!yt) notConnected.push("youtube");
    else out.push({
      platform: "youtube", account: yt.channel.title, subscribers: yt.subscribers,
      kpis: yt.kpis.map((k) => ({ id: k.key, label: k.label, display: k.value, change: compare ? k.delta : null, status: k.status, note: k.note })),
      totals: Object.fromEntries(Object.entries(yt.series).map(([k, s]) => [k, total(s, compare)])),
      uploads: yt.uploads, last_reported_day: yt.lastDay, note: yt.note, unavailable: yt.unavailable,
    });
  }
  if (platforms.includes("facebook")) {
    const fb = fbView(src);
    if (!fb) notConnected.push("facebook");
    else out.push({
      platform: "facebook", account: fb.page.name,
      kpis: fb.kpis.map((k) => ({ id: k.key, label: k.label, display: k.value, change: compare ? k.delta : null, status: k.status, note: k.note })),
      followers: fb.followerStats,
      totals: { engagement: total(fb.engagement, compare), ...(fb.views ? { views: total(fb.views, compare) } : {}) },
      new_follows: fb.newFollows, unfollows: fb.unfollows, net_follows: fb.netFollows, video_views: fb.videoViews,
      publishing: fb.publishing, insights_available: fb.insightsAvailable, unavailable: fb.unavailable,
    });
  }
  if (platforms.includes("tiktok")) {
    const tt = ttView(src);
    if (!tt) notConnected.push("tiktok");
    else out.push({
      platform: "tiktok", account: tt.profile.username ? `@${tt.profile.username}` : tt.profile.name,
      stats: tt.stats.map((s) => ({ id: s.key, label: s.label, display: s.value, status: s.status, note: s.note })),
      videos_in_range: tt.videosInRange, history_note: tt.historyNote, unavailable: tt.unavailable,
    });
  }
  return {
    range: rangeOut(src),
    platforms: out,
    not_connected: notConnected.map((p) => NAME[p as PlatformKey]),
    ...(compare ? {} : { previous_period: locked(ent, "period_comparison") }),
  };
}

export async function comparePlatforms(ctx: Ctx, ent: Entitlements, input: { days?: number }) {
  if (!canUseFeature(ent, "cross_platform_analytics")) return { comparison: locked(ent, "cross_platform_analytics") };
  const src = await loadSources(ctx, ent, { days: input.days });
  const ig = await instagramView(ctx, src);
  const summaries = [
    instagramSummary(ig ? { username: ig.handle, followers: ig.followers, views: ig.series.views, engagement: ig.series.engagement, postsInRange: ig.inRange.length } : null),
    facebookSummary(src.fb?.snap ?? null, fbView(src)),
    youtubeSummary(src.yt),
    tiktokSummary(src.tt, ttView(src)),
  ];
  const all = buildAllPlatforms(summaries);
  return {
    range: rangeOut(src),
    platforms: all.platforms.map((s) => ({
      platform: s.platform, connected: s.connected, account: s.label, audience: s.audience, audience_label: s.audienceLabel,
      views: s.views, views_note: s.viewsNote, interactions: s.engagement, content_published: s.contentPublished,
    })),
    combined: all.combined,
    insights: all.insights,
    note: "Each platform's numbers are its own: views and interactions aren't counted the same way across platforms, so compare them with care.",
  };
}

export async function getTopPosts(ctx: Ctx, ent: Entitlements, input: { platform?: PlatformKey; days?: number; limit?: number; sortBy?: "views" | "engagement" }) {
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  const src = await loadSources(ctx, ent, { days: input.days, platforms: input.platform ? [input.platform] : PLATFORM_KEYS, deepYouTube: true });
  const platform: PlatformKey | null = input.platform ?? (src.ig ? "instagram" : src.yt ? "youtube" : src.fb ? "facebook" : src.tt ? "tiktok" : null);
  if (!platform) return { range: rangeOut(src), posts: [], note: "No platform is connected in this workspace." };

  if (platform === "instagram") {
    const ig = await instagramView(ctx, src);
    if (!ig) return { range: rangeOut(src), platform: "Instagram", posts: [], note: "Instagram isn't connected in this workspace." };
    const ranked = rankPosts(ig.inRange, input.sortBy === "engagement" ? "engagements" : "views", limit);
    return {
      range: rangeOut(src), platform: "Instagram", sorted_by: input.sortBy === "engagement" || !ig.inRange.some((p) => p.views != null) ? "interactions" : "views",
      median_interactions: ig.baseline,
      posts: ranked.map((p) => ({
        id: p.id, title: p.title, published_at: p.published, format: p.format, url: p.permalink,
        views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares, interactions: p.engagements,
        vs_your_median: p.multiplier != null ? Math.round(p.multiplier * 100) / 100 : null,
        ...(p.trial ? { trial_reel: true } : {}),
        ...(p.collabWith ? { collab_posted_by: p.collabWith } : {}),
      })),
    };
  }
  if (platform === "youtube") {
    const yt = ytView(src);
    if (!yt) return { range: rangeOut(src), platform: "YouTube", posts: [], note: "YouTube isn't connected in this workspace." };
    const videos = [...yt.videos].sort((a, b) => b.views - a.views).slice(0, limit);
    return {
      range: rangeOut(src), platform: "YouTube", sorted_by: "views",
      basis: yt.videoBasis === "range" ? "Views inside the range, from YouTube Analytics." : "Lifetime public views (YouTube didn't return range figures).",
      median_views: yt.medianViews,
      posts: videos.map((v) => ({ id: v.id, title: v.title, published_at: v.publishedAt, type: v.type, url: v.url, views: v.views, watch_minutes: v.minutes, likes: v.likes, comments: v.comments, shares: v.shares, subscribers_gained: v.subsGained })),
    };
  }
  if (platform === "facebook") {
    const fb = fbView(src);
    if (!fb) return { range: rangeOut(src), platform: "Facebook", posts: [], note: "Facebook isn't connected in this workspace." };
    const posts = [...fb.posts].sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1)).slice(0, limit);
    return {
      range: rangeOut(src), platform: "Facebook", sorted_by: "engagement (reactions + comments + shares)", median_engagement: fb.medianEngagement,
      posts: posts.map((p) => ({ id: p.id, title: p.title, published_at: p.published, url: p.permalink, reactions: p.reactions, comments: p.comments, shares: p.shares, engagement: p.engagement, vs_your_median: p.multiplier })),
    };
  }
  const tt = ttView(src);
  if (!tt) return { range: rangeOut(src), platform: "TikTok", posts: [], note: "TikTok isn't connected in this workspace." };
  return {
    range: rangeOut(src), platform: "TikTok", sorted_by: "views (TikTok's per-video totals)",
    posts: tt.topVideos.slice(0, limit).map((v) => ({ id: v.id, title: v.title, url: v.url, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares })),
  };
}

export async function getPerformanceInsights(ctx: Ctx, ent: Entitlements, input: { days?: number }) {
  const src = await loadSources(ctx, ent, { days: input.days });
  const insights: Record<string, unknown>[] = [];
  const ig = await instagramView(ctx, src);
  let gapsOut: Record<string, unknown> = {};
  if (ig && src.ig) {
    const location = src.profile?.brand_detail?.location ?? null;
    for (const i of buildInsights({ media: src.ig.media, baseline: ig.baseline, location, handle: ig.handle })) {
      insights.push({ platform: "Instagram", tag: i.tag, title: i.title, finding: i.body, observed: i.observed, interpretation: i.interpretation, recommendation: i.recommendation });
    }
    const freq = src.profile?.brand_detail?.strategist?.frequency ?? null;
    const target = freq ? parseInt(freq.match(/\d+/)?.[0] ?? "", 10) : NaN;
    const all = buildGaps({ media: src.ig.media, followers: ig.followers, goals: src.profile?.goals ?? null, location, frequencyTarget: Number.isFinite(target) ? target : null, now: src.now });
    // Same hold-back as the Analytics page.
    const full = canUseFeature(ent, "deeper_insights");
    const gaps = full ? all : all.slice(0, 1);
    gapsOut = {
      gaps: gaps.map((g) => ({ area: g.title, finding: g.headline, observed: g.observed, impact: g.impact, ...("action" in g ? { action: (g as { action?: string }).action } : {}) })),
      ...(!full && all.length > 1 ? { more_gaps: { count: all.length - 1, ...locked(ent, "deeper_insights") } } : {}),
    };
  }
  const yt = ytView(src);
  for (const i of yt?.insights ?? []) insights.push({ platform: "YouTube", tag: i.tag, title: i.title, finding: i.body, observed: i.observed, interpretation: i.interpretation, recommendation: i.recommendation });
  const fb = fbView(src);
  for (const i of fb?.insights ?? []) insights.push({ platform: "Facebook", tag: i.tag, title: i.title, finding: i.body, observed: i.observed, interpretation: i.interpretation, recommendation: i.recommendation });
  const alerts = await getAlerts(ctx.client, ctx.ownerId, 10, ctx.workspace?.id ?? null, ctx.viewerId).catch(() => []);
  return {
    range: rangeOut(src),
    insights,
    ...gapsOut,
    next_steps: [...(yt?.nextSteps ?? []), ...(fb?.nextSteps ?? [])],
    recent_alerts: alerts.map((a) => ({ type: a.type, platform: a.platform, severity: a.severity, title: a.title, detail: a.body, detected_at: a.detectedAt })),
    note: "Every insight is computed from this workspace's own posts and numbers; none is a guess or a sample.",
  };
}

export async function getToday(ctx: Ctx, ent: Entitlements, input: { timezone?: string }) {
  const tz = checkTimezone(input.timezone);
  if (!canUseFeature(ent, "daily_recommendations")) return { today: locked(ent, "daily_recommendations") };
  const wsId = ctx.workspace?.id ?? null;
  const now = new Date();
  const [src, schedRes, plansRes, comments, studio] = await Promise.all([
    loadSources(ctx, ent, { platforms: ["instagram", "facebook", "tiktok"] }),
    scopeToWorkspace(ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).neq("status", "cancelled").gte("scheduled_at", new Date(now.getTime() - 30 * DAY_MS).toISOString()), wsId)
      .order("scheduled_at", { ascending: true }).limit(200),
    scopeToWorkspace(ctx.client.from("plans").select("id, data, created_at").eq("user_id", ctx.ownerId), wsId).order("created_at", { ascending: false }).limit(1),
    canUseFeature(ent, "comment_replies") ? loadWaitingComments(ctx.client, ctx.ownerId, wsId) : Promise.resolve(null),
    canUseFeature(ent, "build_from_clips") ? loadStudioNext(ctx.client, ctx.ownerId, wsId) : Promise.resolve(null),
  ]);
  const plan = (plansRes.data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined) ?? null;
  const tt = src.tt && Array.isArray(src.tt.videos) ? (src.tt.videos as TtVideo[]) : null;
  const facts = todayFacts({
    plan, scheduled: (schedRes.data ?? []) as ScheduledPost[], igMedia: src.ig?.media ?? null, fbPosts: src.fb?.snap.posts ?? null, ttVideos: tt,
    comments, studio, now: now.getTime(),
  });
  const s = dailyRecommendations(facts, now, tz);
  return {
    date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz }),
    timezone: tz,
    recommendations: s.recs.map((r) => ({ priority: r.tone, title: r.title, detail: r.detail, action: r.cta, open_in_socia: link(r.href), ...(r.external ? { see: r.external.href } : {}) })),
    next_scheduled_post: s.next,
    ...(s.recs.length ? {} : { note: "Nothing needs doing today." }),
  };
}

export async function getPostingRecommendations(ctx: Ctx, ent: Entitlements, input: { timezone?: string }) {
  const tz = checkTimezone(input.timezone);
  if (!canUseFeature(ent, "posting_time_analysis")) return { posting_times: locked(ent, "posting_time_analysis") };
  const src = await loadSources(ctx, ent, { platforms: ["instagram"] });
  if (!src.ig) return { available: false, reason: "Posting times come from Instagram posting history, and Instagram isn't connected in this workspace." };
  const timed = src.ig.media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }));
  const rec = recommendedWindows(timed, src.now, tz);
  return {
    timezone: tz,
    based_on_posts: rec.posts,
    enough_history: rec.enough,
    summary: rec.sentence ?? `Not enough posting history yet (SOCIA needs at least 8 Instagram posts to name a time).`,
    windows: rec.best.map((w) => ({
      day: DOW_LONG[w.day], time: betweenPhrase(w.block), engagement_vs_typical_pct: Math.round((w.rel - 1) * 100), posts_in_window: w.n,
      confidence: w.confidence === "high" ? "high" : "early signal", next_occurrence: w.nextAt,
    })),
  };
}

export async function getContentPlan(ctx: Ctx) {
  const wsId = ctx.workspace?.id ?? null;
  const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data, created_at").eq("user_id", ctx.ownerId), wsId).order("created_at", { ascending: false }).limit(1);
  const row = (data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined) ?? null;
  if (!row) return { plan: null, note: "This workspace has no Content Plan yet. It can be generated in SOCIA (Content Plan)." , open_in_socia: link("/tool") };
  const outcome = await loadPlanOutcome(ctx.client, ctx.ownerId, wsId, row).catch(() => null);
  const d = row.data;
  return {
    plan: {
      id: row.id, created_at: row.created_at, headline: d.headline, summary: d.auditSummary,
      top_fixes: (d.topFixes ?? []).map((f) => ({ fix: f.fix, why: f.why })),
      posts: (d.weeklyPlan ?? []).map((it, i) => {
        const o = outcome?.items[i];
        return {
          day: it.day, concept: it.concept, hook: it.hook, format: it.format, why: it.rationale, confidence: it.predictedPerformance,
          status: o?.state ?? "unknown", scheduled_at: o?.scheduledAt ?? null, published_at: o?.publishedAt ?? null, url: o?.permalink ?? null,
          result: o?.result ? { platform: o.result.platform, line: o.result.text, vs_your_median: o.result.multiplier, early: o.result.early } : null,
        };
      }),
      progress: outcome?.summary.line ?? null,
    },
    open_in_socia: link("/tool"),
  };
}

const MAX_WINDOW_DAYS = 62;

export async function getScheduledPosts(ctx: Ctx, input: { from?: string; to?: string; includePublished?: boolean }) {
  const now = Date.now();
  const from = input.from ? new Date(input.from) : new Date(now - DAY_MS);
  const to = input.to ? new Date(input.to) : new Date(now + 14 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiFailure("invalid_input", "from and to must be ISO dates, e.g. 2026-10-14 or 2026-10-14T09:00:00Z.");
  if (to <= from) throw new ApiFailure("invalid_input", "to must be after from.");
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) throw new ApiFailure("invalid_input", `Ask for at most ${MAX_WINDOW_DAYS} days at a time.`);
  let q = scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, caption, status, scheduled_at, plan_day, permalink").eq("user_id", ctx.ownerId).neq("status", "cancelled"), ctx.workspace?.id ?? null)
    .gte("scheduled_at", from.toISOString()).lte("scheduled_at", to.toISOString());
  if (!input.includePublished) q = q.neq("status", "published");
  const { data, error } = await q.order("scheduled_at", { ascending: true }).limit(100);
  if (error) throw new ApiFailure("unavailable", "SOCIA couldn't read the Calendar just now.");
  const rows = (data ?? []) as { id: string; caption: string | null; status: string; scheduled_at: string; plan_day: string | null; permalink: string | null }[];
  const dests = await loadDestinationRows(ctx.client, rows.map((r) => r.id)).catch(() => []);
  const firstLine = (c: string | null) => (c ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || "(no caption)";
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    posts: rows.map((r) => {
      const ds = dests.filter((d) => d.post_id === r.id && d.status !== "cancelled");
      return {
        id: r.id, title: firstLine(r.caption), caption: (r.caption ?? "").slice(0, 600), status: r.status, scheduled_at: r.scheduled_at,
        ...(r.plan_day ? { content_plan_day: r.plan_day } : {}),
        destinations: ds.length
          ? ds.map((d) => ({
              platform: NAME[d.platform as PlatformKey] ?? d.platform, status: d.status, scheduled_at: d.scheduled_at, published_at: d.published_at, url: d.permalink,
              ...(d.error_message ? { error: d.error_message } : {}),
              ...(trialOf(d.platform as Platform, d.settings as DestinationSettings) ? { trial_reel: true } : {}),
            }))
          : [{ platform: "Instagram", status: r.status, url: r.permalink }],
        open_in_socia: link(`/create?post=${encodeURIComponent(r.id)}`),
      };
    }),
    ...(rows.length === 100 ? { note: "Only the first 100 posts are listed; narrow the dates for more." } : {}),
  };
}
