import { loadPlanOutcome } from "@/lib/planOutcomesLoad";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { trialReelsByMedia } from "@/lib/publishing/db";
import { scopeToWorkspace } from "@/lib/workspaces";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getFacebookInsights } from "@/lib/facebookInsights";
import { cachedLive, oldestFetch } from "@/lib/liveCache";
import { getIgSnapshot, readDailySnapshots } from "@/lib/instagramSync";
import { getYouTubeAnalytics } from "@/lib/youtubeData";
import type { DailySnapshot } from "@/lib/dashboardMetrics";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import Dashboard, { type DashboardData } from "@/components/dashboard/Dashboard";
import { buildFacebookAnalytics } from "@/lib/metrics/facebook";
import { buildTikTokAnalytics } from "@/lib/metrics/tiktok";
import { instagramSummary, facebookSummary, youtubeSummary, tiktokSummary } from "@/lib/platformSummaries";
import {
  RANGES, rangeDays, clampRangeId, DAY_MS, postCards, rankPosts, buildKpis, buildSeries, buildInsights, buildFocus, buildGoals, buildUpcoming, formatOf,
} from "@/lib/overview";
import { getEntitlements, maxHistoryDays, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature, pricingHref, PLANS } from "@/lib/plans";
import { loadWaitingComments, loadStudioNext, todayFacts } from "@/lib/dailyRecsLoad";
import { loadRepurpose } from "@/lib/repurposeLoad";
import type { Candidate } from "@/lib/repurpose";
import type { TodayCardProps } from "@/components/TodayCard";
import type { TtVideo } from "@/lib/tiktokAuth";
import type { Deliverable } from "@/lib/schema";
import type { ScheduledPost } from "@/lib/scheduling";
import { captionlessLabels } from "@/lib/publishing/postLabelLoad";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { isOwnAccount, ownAccounts } from "@/lib/ownAccounts";
import { buildAccountSample } from "@/lib/intel/accountSample";
import { growthBriefing, goalLine, nextActions, recentLearning, whatWorks } from "@/lib/intel/overview";
import { listInsights } from "@/lib/intel/insightStore";
import { listGoals } from "@/lib/growthStore";
import { currentFor } from "@/lib/briefing";
import { engagementRateOf } from "@/lib/engagement";
import { postsPerWeek } from "@/lib/metrics";
import { GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, goalProgress, type GoalPlatform } from "@/lib/growth";

export const metadata = { title: "Dashboard · SOCIA" };

// The dashboard answers: what should I do today, and how am I doing across
// EVERY connected platform, not just Instagram. Every figure is computed from
// the account's own rows; nothing here is a sample. One component renders
// every state (nothing connected, other platforms only, Instagram live).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string; range?: string }>;
}) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);

  const { ig, range: rangeParam } = await searchParams;
  const justConnected = ig === "connected";

  // Loads start as early as their inputs allow and are awaited together, so
  // the page waits for the slowest read rather than for each in turn.
  const wsId = ctx.workspace?.id ?? null;
  const fbP = getFbSnapshot(ctx.client, ctx.ownerId, wsId ?? undefined).catch(() => null);
  const ttP = scopeToWorkspace(
    ctx.client.from("tiktok_connections").select("username, display_name, avatar_url, is_verified, follower_count, likes_count, video_count, videos").eq("user_id", ctx.ownerId),
    wsId,
  ).limit(1).then((r) => (r.data ?? [])[0] ?? null, () => null);
  // Scheduled posts and the latest plan.
  const schedPlansP = Promise.all([
    scopeToWorkspace(
      ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).neq("status", "cancelled")
        .gte("scheduled_at", new Date(Date.now() - 30 * DAY_MS).toISOString()),
      wsId,
    ).order("scheduled_at", { ascending: true }).limit(200),
    scopeToWorkspace(
      ctx.client.from("plans").select("id, data, created_at, client_handle").eq("user_id", ctx.ownerId),
      wsId,
    ).order("created_at", { ascending: false }).limit(1),
  ]);

  // Competitors preview: tracked Instagram accounts whose public numbers SOCIA
  // has already read (Business Discovery, cached 6 hours), compared on the
  // only measure both sides publish: median likes + comments per post.
  // No live calls here; an account without a cached read is simply left out.
  const compP: Promise<Omit<NonNullable<DashboardData["competitors"]>, "you"> | null> = (async () => {
    try {
      const cwid = await competitorScopeId(ctx.client, wsId ?? undefined);
      const [tracked, own] = await Promise.all([
        listTracked<{ platform: string; handle: string }>(ctx.client, ctx.ownerId, "platform, handle", { byAdded: true, workspaceId: cwid }),
        ownAccounts(ctx.client, ctx.ownerId),
      ]);
      const theirs = tracked.filter((t) => !isOwnAccount(own, { handle: t.handle }));
      const ig = theirs.filter((t) => t.platform === "instagram").map((t) => t.handle.toLowerCase()).slice(0, 6);
      if (!ig.length) return { tracked: theirs.length, rows: [] };
      const { data } = await ctx.client.from("ig_competitor_snapshots").select("handle, display_name, profile_picture, median_engagement").eq("user_id", ctx.ownerId).in("handle", ig);
      const rows = ((data ?? []) as { handle: string; display_name: string | null; profile_picture: string | null; median_engagement: number | null }[])
        .filter((r) => r.median_engagement != null)
        .map((r) => ({ handle: r.handle, name: r.display_name ?? `@${r.handle}`, avatar: r.profile_picture, value: Number(r.median_engagement) }));
      return { tracked: theirs.length, rows };
    } catch {
      return null; // competitor tables absent: the card says so
    }
  })();

  // The shared intelligence store and the brand's goals (both empty before their migrations).
  const intelP = Promise.all([
    listInsights(ctx, { limit: 30 }).catch(() => ({ tableReady: false, insights: [] })),
    listInsights(ctx, { status: "superseded", limit: 5 }).catch(() => ({ tableReady: false, insights: [] })),
    listGoals(ctx).catch(() => ({ tableReady: false, goals: [] })),
  ]);
  const [profile, ent] = await Promise.all([getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)), getEntitlements(ctx.client, ctx.ownerId)]);
  const igConnected = profile?.account_connected ?? false;
  // Daily recommendations (Growth+): the two reads only the Today card needs
  // start now, alongside the platform reads.
  const recsOn = canUseFeature(ent, "daily_recommendations");
  const todayExtrasP = recsOn
    ? Promise.all([
        canUseFeature(ent, "comment_replies") ? loadWaitingComments(ctx.client, ctx.ownerId, wsId) : Promise.resolve(null),
        canUseFeature(ent, "build_from_clips") ? loadStudioNext(ctx.client, ctx.ownerId, wsId) : Promise.resolve(null),
      ])
    : Promise.resolve([null, null] as const);

  // Range (per-plan clamp), needed before fetching ranged platform data.
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";
  const now = new Date();

  // Live platform reads, reused for a few minutes per workspace and range
  // (lib/liveCache.ts). A guest's reads are kept apart from the owner's.
  const scope = [wsId, ctx.isOwner ? "owner" : `guest:${ctx.viewerId}`];
  const ytP = cachedLive(
    ctx.ownerId, ["yt", ...scope, days],
    () => getYouTubeAnalytics(ctx.client, ctx.ownerId, days, { workspaceId: wsId ?? undefined }),
    (v) => v.note == null, // a degraded read (live call failed) is not reused
  ).catch(() => null);
  const fbInsightsP = fbP.then((f) =>
    f?.status === "connected"
      ? cachedLive(ctx.ownerId, ["fb-insights", ...scope, f.page_id, days], () => getFacebookInsights(ctx.client, ctx.ownerId, days, wsId ?? undefined), (v) => v.available).catch(() => null)
      : null,
  );
  const snapP = igConnected ? getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null) : Promise.resolve(null);
  // Instagram's stored daily rows; the table may not exist yet, in which case
  // the series render their empty states.
  const dailyRowsP: Promise<DailySnapshot[]> = snapP.then(
    (sn) => (sn && sn.followers_count != null
      ? readDailySnapshots<DailySnapshot>(ctx.client, ctx.ownerId, sn.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as DailySnapshot[])
      : []),
    () => [],
  );

  // Every platform, in parallel. null/absent when not connected.
  const [snap, fb, ytC, ttRow, fbInsightsC, dailyRows] = await Promise.all([snapP, fbP, ytP, ttP, fbInsightsP, dailyRowsP]);
  const yt = ytC?.value ?? null;
  const live = Boolean(snap && snap.followers_count != null);
  // How old the reused live reads on this page are (null when none were used).
  const updatedAt = oldestFetch(ytC, fbInsightsC);
  const fbConnected = fb?.status === "connected";
  const ttConnected = Boolean(ttRow);
  const since = now.getTime() - days * DAY_MS;

  // Per-platform summaries. Each uses the platform's OWN native metrics; nothing is faked.
  const fbSummary = facebookSummary(fb, fbConnected && fb ? buildFacebookAnalytics({ snap: fb, snapshots: [], days, rangeLabel, now, insights: fbInsightsC?.value ?? null }) : null);
  const ytSummary = youtubeSummary(yt);
  const ttSummary = tiktokSummary(ttConnected ? ttRow : null, ttConnected && ttRow ? buildTikTokAnalytics({ row: ttRow, days, rangeLabel, now }) : null);

  // Repurposing (Growth+): the best recent posts not yet on the other platforms.
  const repurposeP: Promise<Candidate[]> = canUseFeature(ent, "repurposing")
    ? loadRepurpose(ctx.client, ctx.ownerId, wsId, {
        igMedia: live ? snap!.media ?? [] : null,
        fbPosts: fbConnected ? fb!.posts : null,
        ttVideos: ttConnected && Array.isArray(ttRow!.videos) ? (ttRow!.videos as TtVideo[]) : null,
        now: now.getTime(),
      }).catch(() => [])
    : Promise.resolve([]);

  const [schedRes, plansRes] = await schedPlansP;
  const scheduled = (schedRes.data ?? []) as ScheduledPost[];
  const upcoming = buildUpcoming(scheduled, 4, await captionlessLabels(ctx.client, ctx.ownerId, scheduled));
  const planRow = plansRes.data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined;
  const latestPlan = planRow ? { id: planRow.id, data: planRow.data, created_at: planRow.created_at } : null;

  // The Today card: the facts for Growth and up, an upgrade line below that.
  const [[waiting, studioNext], repurpose] = await Promise.all([todayExtrasP, repurposeP]);
  const lockedPlan = minPlanWithFeature("daily_recommendations");
  const today: TodayCardProps = recsOn
    ? {
        facts: todayFacts({
          plan: latestPlan, scheduled,
          igMedia: live ? snap!.media ?? [] : null,
          fbPosts: fbConnected ? fb!.posts : null,
          ttVideos: ttConnected && Array.isArray(ttRow!.videos) ? (ttRow!.videos as TtVideo[]) : null,
          comments: waiting, studio: studioNext, now: now.getTime(),
        }),
      }
    : { locked: { planName: PLANS[lockedPlan].name, href: pricingHref(lockedPlan) } };

  // ---- Instagram-specific parts, only when Instagram data is live ----
  const media = live ? snap!.media ?? [] : [];
  let kpis: DashboardData["kpis"] = null;
  let series: DashboardData["series"] = null;
  let top: DashboardData["top"] = [];
  let posts: DashboardData["posts"] = [];
  let insights: DashboardData["insights"] = [];
  let baseline: number | null = null;
  let medianViews: number | null = null;
  let igSummary = instagramSummary(null);
  if (live) {
    baseline = median(media.map(interactionsTotal));
    posts = postCards(media, baseline);
    // Trial Reels SOCIA published are labelled from its own record.
    const trials = await trialReelsByMedia(ctx.client, ctx.ownerId, posts.map((p) => p.id));
    for (const p of posts) p.trial = trials.get(p.id) ?? null;
    top = rankPosts(posts, "views", 8);
    medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));
    const kpisAll = buildKpis({ media, daily: dailyRows, followers: snap!.followers_count ?? null, days });
    kpis = (["views", "engagement_rate", "followers", "posts"] as const).map((id) => kpisAll.find((k) => k.id === id)!);
    series = {
      views: buildSeries("views", media, dailyRows, days),
      engagement: buildSeries("engagement", media, dailyRows, days),
      followers: buildSeries("followers", media, dailyRows, days),
    };
    const brand = profile?.brand_detail ?? null;
    insights = buildInsights({ media, baseline, location: brand?.location ?? null, handle: snap!.username ?? null });
    igSummary = instagramSummary({
      username: snap!.username ?? null, followers: snap!.followers_count ?? null, views: series.views, engagement: series.engagement,
      postsInRange: media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since).length,
    });
  }

  const brand = profile?.brand_detail ?? null;
  const focus = buildFocus(latestPlan);
  // What became of the latest plan: posted, measured against the median, skipped.
  if (focus && latestPlan) {
    try {
      const outcome = await loadPlanOutcome(ctx.client, ctx.ownerId, wsId, latestPlan, now);
      focus.outcomeLine = outcome.summary.line;
    } catch {
      focus.outcomeLine = null;
    }
  }

  const follRows = dailyRows.filter((d) => d.followers != null && d.day >= new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10));
  const followerDelta30 = follRows.length >= 2 ? follRows[follRows.length - 1].followers! - follRows[0].followers! : null;
  const { goals, trackers } = buildGoals({
    goalsText: profile?.goals ?? null, plan: latestPlan, scheduled, media,
    frequency: brand?.strategist?.frequency ?? null, followerDelta30,
  });

  // Your side of the competitor comparison, on the same definition: median
  // likes + comments over your last 12 posts.
  const recent12 = [...media].filter((m) => m.timestamp).sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!)).slice(0, 12);
  const yourLC = recent12.length >= 3 ? median(recent12.map((m) => (m.like_count ?? 0) + (m.comments_count ?? 0))) : null;
  const comp = await compP;
  // The most recent post on any connected platform SOCIA reads, for the priority line.
  const lastIg = media.reduce<string | null>((acc, m) => (m.timestamp && (!acc || m.timestamp > acc) ? m.timestamp : acc), null);
  // The person's first name, only if their sign-in account carries one.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = [meta.first_name, meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const firstName = rawName ? rawName.trim().split(/\s+/)[0].slice(0, 40) : null;

  // ---- intelligence sections: briefing, what works, next actions, goals, learning ----
  const [activeIntel, endedIntel, goalsRes] = await intelP;
  const sample = buildAccountSample({
    now,
    ig: live ? { username: snap!.username, name: snap!.name, biography: snap!.biography, followers: snap!.followers_count, media } : null,
    fb: fbConnected && fb ? { name: fb.page_name, followers: fb.followers_count, posts: fb.posts ?? [] } : null,
    yt: yt ? { title: yt.channel.title, handle: yt.channel.handle, subscribers: yt.channel.subscribers, videos: yt.topVideos ?? [] } : null,
    tt: ttConnected && ttRow ? { username: (ttRow.username as string | null) ?? null, followers: (ttRow.follower_count as number | null) ?? null, videos: Array.isArray(ttRow.videos) ? (ttRow.videos as TtVideo[]) : [] } : null,
  });
  const works = whatWorks(sample);
  const summaries = [igSummary, fbSummary, ytSummary, ttSummary];
  const connectedPlatforms = summaries.filter((x) => x.connected).map((x) => x.platform as GoalPlatform);
  const extras = {
    days,
    igEngagementRate: live ? engagementRateOf(media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since), snap!.followers_count ?? null).value : null,
    igPostsPerWeek: live ? postsPerWeek(media.map((m) => m.timestamp), 30, now.getTime()) ?? 0 : null,
    ttPostsPerWeek: ttConnected && Array.isArray(ttRow?.videos) ? postsPerWeek((ttRow!.videos as TtVideo[]).map((v) => v.createdAt ?? undefined), 30, now.getTime()) ?? 0 : null,
  };
  const goalRows = goalsRes.goals.map((g) => {
    const m = goalMetric(g.metric);
    const cur = currentFor(g, summaries, extras);
    const value = m?.measuredOn.length ? cur.value : g.current_value ?? null;
    const prog = goalProgress(g, value, now);
    return {
      id: g.id ?? g.metric,
      primary: g.kind === "primary",
      label: `${m?.label ?? g.metric}${g.platforms.length ? ` on ${g.platforms.map((x) => GOAL_PLATFORM_NAME[x]).join(" and ")}` : ""}`,
      current: value != null ? formatGoalValue(g.metric, value) : null,
      target: formatGoalValue(g.metric, g.target),
      start: g.baseline != null ? formatGoalValue(g.metric, g.baseline) : null,
      share: prog.share,
      remaining: prog.remaining != null && !prog.reached ? formatGoalValue(g.metric, prog.remaining) : null,
      due: g.due_date ? new Date(`${g.due_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null,
      daysLeft: prog.daysLeft,
      reached: prog.reached,
      note: m?.measuredOn.length ? (cur.why ?? prog.missing) : prog.missing,
    };
  });
  const primaryGoal = goalRows.find((g) => g.primary) ?? null;
  const growth = profile?.brand_detail?.growth ?? null;
  const briefing = growthBriefing({
    brandName: profile?.brand_name ?? (live ? snap!.username : null) ?? null,
    niche: profile?.niche ?? null,
    growth,
    sample,
    works,
    insights: activeIntel.insights,
    goalLine: goalLine(growth, primaryGoal ? { label: primaryGoal.label, current: primaryGoal.current, remaining: primaryGoal.remaining, due: primaryGoal.due } : null),
  });
  const goalPlatformMissing = goalsRes.goals.flatMap((g) => g.platforms).find((x) => !connectedPlatforms.includes(x)) ?? null;
  const actions = nextActions({
    insights: activeIntel.insights,
    connectedCount: connectedPlatforms.length,
    goalPlatformMissing,
    planThisWeek: Boolean(latestPlan && now.getTime() - Date.parse(latestPlan.created_at) < 7 * DAY_MS),
    scheduledSoon: upcoming.filter((u) => Date.parse(u.at) - now.getTime() < 3 * DAY_MS && Date.parse(u.at) >= now.getTime()).length,
    trackedCompetitors: comp?.tracked ?? 0,
  });
  const learning = recentLearning({ planOutcome: focus?.outcomeLine ?? null, planAt: latestPlan?.created_at ?? null, active: activeIntel.insights, ended: endedIntel.insights, now });

  const d: DashboardData = {
    rangeLabel, maxDays, updatedAt,
    live,
    handle: live ? snap!.username ?? null : null,
    justConnected,
    connectHref: igConfigured() ? "/api/auth/instagram/start" : "/settings#accounts",
    kpis, series,
    summaries: [igSummary, fbSummary, ytSummary, ttSummary],
    insights, top, posts, baseline, medianViews,
    focus, upcoming, goals, trackers,
    timed: media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) })),
    today,
    repurpose,
    firstName,
    lastPost: lastIg ? { platform: "Instagram", at: lastIg } : null,
    competitors: comp ? { ...comp, you: yourLC } : null,
    intel: {
      briefing,
      works,
      themes: growth?.understanding?.themes ?? [],
      postsRead: sample.posts.length,
      actions,
      goals: goalRows,
      goalsReady: goalsRes.tableReady,
      learning,
      storeReady: activeIntel.tableReady,
    },
  };

  return <Dashboard d={d} />;
}
