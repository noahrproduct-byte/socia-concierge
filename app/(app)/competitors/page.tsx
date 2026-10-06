import { timed } from "@/lib/timing";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import CompetitorsPage from "@/components/competitors/CompetitorsPage";
import type { CompetitorsData, FollowerPoint, Tracked, NicheRange, PlatformFilter, YouSeriesPoint } from "@/components/competitors/types";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem } from "@/lib/instagramSync";
import { channelStats, ytConfigured, ytFormat, type YtStats } from "@/lib/youtube";
import { nameKey } from "@/lib/discovery";
import { cell, absent, type LeaderRow } from "@/lib/competitorRollup";
import { competitorHistoryEnabled, competitorMomentum, type CompetitorPoint } from "@/lib/competitorHistory";
import { competitorScopeId } from "@/lib/workspaces";
import { withBaseline, type CompetitorRow, type CompPost, type PostsGate } from "@/lib/competitorIntel";
import { igCompetitorRows, type IgCompetitor } from "@/lib/igCompetitorData";
import { locationTokens, tagsFor } from "@/lib/competitorPatterns";
import { tagGroup } from "@/lib/discovery";
import { goalKeywords } from "@/lib/gaps";
import { engagementRateOf, interactionsTotal } from "@/lib/engagement";
import { median, isChartableDay, localDayStr } from "@/lib/metrics";
import type { NichePost, OwnPost } from "@/lib/nicheTrends";
import { getEntitlements, clampDays, maxHistoryDays } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { resolveContext, brandWorkspace } from "@/lib/context";

export const metadata = { title: "Competitors — SOCIA" };

// Competitors. The honesty contract:
//   YOU            authenticated Instagram data
//   Competitors    YouTube's public API, or Instagram Business Discovery once a
//                  Facebook Page is linked; otherwise a stated absence, never a guess
//   Niche posts    real posts found by the discovery pipeline, with the public
//                  counts the platform served and a baseline only where the
//                  creator's own median is known
// The page only assembles; lib/competitorIntel and lib/nicheTrends do the maths.

type Suggested = {
  platform: string; handle: string | null; displayName: string | null; profileImage: string | null; profileUrl: string | null;
  followers: number | null; location: string | null; classification: string; relevanceScore: number | null; relevanceReasons: string[];
};

const CLASS_ORDER: Record<string, number> = {
  local_competitor: 0, direct_competitor: 1, emerging_creator: 2, content_inspiration: 3, niche_leader: 4, adjacent_competitor: 5,
};

const IG_FORMAT: Record<string, string> = { VIDEO: "Reel", IMAGE: "Photo", CAROUSEL_ALBUM: "Carousel" };

function ytPosts(s: YtStats): CompPost[] {
  return withBaseline((s.recent ?? []).map((v) => ({
    url: v.url, title: v.title || null, thumb: v.thumb, views: v.views, likes: v.likes, comments: v.comments,
    publishedAt: v.publishedAt || null, format: ytFormat(v.durationSec), durationSec: v.durationSec, multiplier: null,
  })));
}

function igPosts(c: IgCompetitor): CompPost[] {
  return (c.media ?? []).map((m) => ({
    url: m.permalink ?? "", title: m.caption ? m.caption.split("\n")[0].slice(0, 140) : null, thumb: m.thumbnail,
    views: null, likes: m.likes, comments: m.comments, publishedAt: m.timestamp,
    format: m.mediaType ? IG_FORMAT[m.mediaType] ?? null : null, durationSec: null, multiplier: null,
  })).filter((p) => p.url);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; platform?: string; niche_range?: string }> }) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  // Everything below reads the ACTIVE Brand Workspace, which may belong to
  // someone who invited this person: data helpers take (ctx.client, ctx.ownerId).
  const ctx = await resolveContext(supabase, user.id);

  const sp = await searchParams;
  // The range never exceeds the plan's analytics history; niche_range is discovery content, not history, so it is left alone.
  const brandWs = brandWorkspace(ctx);
  // Independent reads run together (this page used to wait for them in turn).
  // Competitors, discovery and discovery-runs are scoped to this workspace once
  // the competitors migration has run; null keeps the pooled behaviour.
  const [ent, snap, cwid, profile] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
    competitorScopeId(ctx.client, ctx.workspace?.id),
    getProfile(ctx.client, ctx.ownerId, brandWs).catch(() => null),
  ]);
  const days = clampDays(ent, sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30);
  const platform: PlatformFilter = sp.platform === "instagram" || sp.platform === "youtube" || sp.platform === "facebook" ? sp.platform : "all";
  const nicheRange: NicheRange = sp.niche_range === "30" ? 30 : sp.niche_range === "all" ? 0 : 90;
  const now = new Date();
  const cutoff = now.getTime() - days * 86400000;

  // Everything below that only needs the scope starts now and is awaited where
  // it is used. Each resolves to "nothing" on a missing table or a failed read.
  const trackedP: Promise<Tracked[]> = listTracked<Tracked>(ctx.client, ctx.ownerId, "platform, handle, added_at", { byAdded: true, workspaceId: cwid }).catch(() => []);
  const suggestedRowsP: Promise<Record<string, unknown>[]> = (async () => {
    try {
      let dq = ctx.client
        .from("discovered_accounts")
        .select("platform, handle, display_name, profile_image, profile_url, followers, location, classification, relevance_score, relevance_reasons")
        .eq("user_id", ctx.ownerId);
      if (cwid) dq = dq.eq("workspace_id", cwid);
      const { data } = await dq.order("relevance_score", { ascending: false }).limit(40);
      return (data ?? []) as Record<string, unknown>[];
    } catch { return []; } // discovery tables may not exist yet
  })();
  const historyP: Promise<(CompetitorPoint & { platform: string; handle: string })[] | null> = (async () => {
    try {
      if (!(await competitorHistoryEnabled(ctx.client))) return null;
      const { data } = await ctx.client
        .from("competitor_snapshots")
        .select("platform, handle, day, followers, media_count, views_total")
        .eq("user_id", ctx.ownerId).gte("day", localDayStr(new Date(cutoff))).order("day", { ascending: false });
      return (data ?? []) as (CompetitorPoint & { platform: string; handle: string })[];
    } catch { return null; } // history table absent
  })();
  const runP: Promise<{ ran_at?: string | null; sources?: unknown } | null> = (async () => {
    try {
      let rq = ctx.client.from("discovery_runs").select("ran_at, sources").eq("user_id", ctx.ownerId);
      if (cwid) rq = rq.eq("workspace_id", cwid);
      return (await rq.maybeSingle()).data ?? null;
    } catch { return null; } // no run recorded
  })();
  const contentRowsP: Promise<Record<string, unknown>[]> = (async () => {
    try {
      let cq = ctx.client
        .from("discovered_content")
        .select("content_url, platform, account_name, account_handle, title, thumbnail_url, views, likes, comments, published_at, content_type, multiplier, relevance_score, why_recommended, data_source")
        .eq("user_id", ctx.ownerId);
      if (cwid) cq = cq.eq("workspace_id", cwid);
      const { data } = await cq.order("relevance_score", { ascending: false }).limit(200);
      return (data ?? []) as Record<string, unknown>[];
    } catch { return []; } // no discovery yet
  })();
  const savedP: Promise<NichePost[]> = (async () => {
    try {
      // Keyed by the owner; the service client is what lets a guest read it.
      const { data } = await ctx.client.from("niche_trends").select("data").eq("niche", `saved:${ctx.ownerId}`).maybeSingle();
      const doc = data?.data as { v: number; items: NichePost[] } | undefined;
      return doc?.v === 1 && Array.isArray(doc.items) ? doc.items : [];
    } catch { return []; } // none
  })();

  // ---- the user -----------------------------------------------------------
  const all: IgMediaItem[] = snap?.media ?? [];
  const posts = all.filter((p) => p.timestamp && new Date(p.timestamp).getTime() >= cutoff);
  const followers = snap?.followers_count ?? null;
  const location = profile?.brand_detail?.location ?? null;
  let subNiche: string | null = null;
  try {
    // A non-default workspace's niche_detail lives on the workspace, not the profile.
    const nicheDetail = brandWs
      ? brandWs.niche_detail
      : (await ctx.client.from("profiles").select("niche_detail").eq("user_id", ctx.ownerId).maybeSingle()).data?.niche_detail;
    subNiche = (nicheDetail as { sub_niche?: string } | null)?.sub_niche ?? null;
  } catch { /* optional */ }

  let momentumCell = absent("insufficient");
  let followerSeries: FollowerPoint[] = [];
  try {
    const rows = await readDailySnapshots<{ day: string; followers: number | null; followers_gained: number | null; source: string | null }>(
      ctx.client, ctx.ownerId, snap?.ig_user_id ?? null, "day, followers, followers_gained, source",
    );
    const from = localDayStr(new Date(cutoff));
    const series = rows.filter((r) => r.day >= from && r.followers != null && isChartableDay(r, localDayStr(now)));
    if (series.length >= 2) momentumCell = cell(series[series.length - 1].followers! - series[0].followers!, "socia_snapshot", series.length);
    followerSeries = series.map((r) => ({ day: r.day, followers: r.followers! }));
  } catch { /* history absent */ }

  // Your posts in range as chartable points — the trajectory chart's left line.
  const youSeries: YouSeriesPoint[] = posts
    .filter((p) => p.timestamp)
    .map((p) => ({ t: p.timestamp!, interactions: interactionsTotal(p), views: p.insights?.views ?? null }));

  const N = posts.length;
  const viewsVals = posts.filter((p) => p.insights?.views != null).map((p) => p.insights!.views!);
  const medViews = median(viewsVals);
  const er = engagementRateOf(all, followers);
  const byFormat = new Map<string, number[]>();
  for (const p of posts) byFormat.set(p.media_type ?? "IMAGE", [...(byFormat.get(p.media_type ?? "IMAGE") ?? []), interactionsTotal(p)]);
  const FORMAT_LABEL: Record<string, string> = { VIDEO: "Reels", CAROUSEL_ALBUM: "Carousels", IMAGE: "Photos" };
  const yourTopFormat = [...byFormat.entries()].filter(([, xs]) => xs.length >= 2).map(([t, xs]) => ({ t, m: median(xs) ?? 0 })).sort((a, b) => b.m - a.m)[0]?.t;

  const you: LeaderRow | null = snap ? {
    id: "you", platform: "instagram", handle: snap.username ?? "you", name: snap.username ? `@${snap.username}` : "Your account",
    avatar: snap.profile_picture_url ?? null, url: snap.username ? `https://instagram.com/${snap.username}` : null,
    isYou: true, tracked: true, classification: null,
    audience: cell(followers, "live_api"),
    engagement: er.value != null ? cell(er.value, "calculated", er.posts) : absent("insufficient"),
    cadence: N ? cell((N / days) * 7, "calculated", N) : absent("insufficient"),
    medianViews: medViews != null ? cell(Math.round(medViews), "live_api", viewsVals.length) : absent("insufficient"),
    momentum: momentumCell, match: null, topFormat: yourTopFormat ? FORMAT_LABEL[yourTopFormat] ?? yourTopFormat : null,
  } : null;

  // ---- tracked + discovered accounts --------------------------------------
  const [tracked, suggestedRows] = await Promise.all([trackedP, suggestedRowsP]);
  const trackedKeys = new Set(tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`));

  let suggested: Suggested[] = [];
  {
    const seenName = new Set<string>();
    suggested = suggestedRows
      .map((r) => ({
        platform: String(r.platform), handle: (r.handle as string) ?? null, displayName: (r.display_name as string) ?? null,
        profileImage: (r.profile_image as string) ?? null, profileUrl: (r.profile_url as string) ?? null,
        followers: (r.followers as number) ?? null, location: (r.location as string) ?? null, classification: String(r.classification),
        relevanceScore: (r.relevance_score as number) ?? null, relevanceReasons: (r.relevance_reasons as string[]) ?? [],
      }))
      .filter((sg) => sg.handle && !trackedKeys.has(`${sg.platform}:${sg.handle.toLowerCase()}`))
      .sort((a, b) => (CLASS_ORDER[a.classification] ?? 9) - (CLASS_ORDER[b.classification] ?? 9) || (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1))
      // One card per business: the same restaurant surfaces on two platforms.
      .filter((sg) => { const k = nameKey(sg.displayName ?? sg.handle); if (!k) return true; if (seenName.has(k)) return false; seenName.add(k); return true; })
      .slice(0, 24);
  }

  // YouTube: public stats and recent uploads for every channel shown.
  const ytHandles = [
    ...tracked.filter((t) => t.platform === "youtube").map((t) => t.handle),
    ...suggested.filter((s) => s.platform === "youtube" && s.handle).map((s) => s.handle!),
  ].slice(0, 14);
  // Instagram: Business Discovery for tracked and discovered handles when a Page is linked.
  const igHandles = [
    ...tracked.filter((t) => t.platform === "instagram").map((t) => t.handle),
    ...suggested.filter((s) => s.platform === "instagram" && s.handle).map((s) => s.handle!),
  ].slice(0, 8);
  // Both platforms' public reads go out together.
  const [ytRes, igRes] = await Promise.all([
    ytHandles.length && ytConfigured()
      ? timed("competitors.youtubeStats", () => Promise.all(ytHandles.map((h) => channelStats(h).catch(() => ({ handle: h, found: false } as YtStats)))))
      : Promise.resolve([] as YtStats[]),
    igCompetitorRows(ctx.client, ctx.ownerId, igHandles).catch(() => ({ enabled: false, reason: null as string | null, competitors: [] as IgCompetitor[] })),
  ]);
  const yt = new Map<string, YtStats>();
  for (const r of ytRes) yt.set(r.handle.toLowerCase(), r);
  const ig = new Map(igRes.competitors.map((c) => [c.handle.toLowerCase(), c]));

  // Competitor follower momentum from the daily history: measured once two days
  // exist, "collecting" with one, "unavailable" with none. Read in one query.
  const momByKey = new Map<string, ReturnType<typeof cell> | ReturnType<typeof absent>>();
  try {
    const history = await historyP;
    if (history) {
      const byKey = new Map<string, CompetitorPoint[]>();
      for (const r of history) {
        const k = `${r.platform}:${String(r.handle).toLowerCase()}`;
        byKey.set(k, [...(byKey.get(k) ?? []), r]);
      }
      for (const [k, pts] of byKey) {
        const m = competitorMomentum(pts, days);
        if (m.current != null && m.previous != null) momByKey.set(k, cell(m.current - m.previous, "socia_snapshot", m.points));
        else if (m.points >= 1) momByKey.set(k, absent("insufficient"));
      }
    }
  } catch { /* history absent */ }
  const momentumFor = (p: string, h: string) => momByKey.get(`${p}:${h.toLowerCase()}`) ?? absent("unavailable");
  const igGate = (c: IgCompetitor | undefined): PostsGate => !igRes.enabled ? "connection_needed" : !c ? "unavailable" : c.found ? "unavailable" : (c.reasonKind === "no_permission" ? "no_permission" : c.reasonKind === "not_business" ? "not_business" : c.reasonKind === "not_found" ? "not_found" : "failed");

  const matchFor = (p: string, h: string) => suggested.find((sg) => sg.platform === p && sg.handle?.toLowerCase() === h.toLowerCase());

  const rows: CompetitorRow[] = [];
  const seen = new Set<string>();
  const push = (r: CompetitorRow) => { if (seen.has(r.id)) return; seen.add(r.id); rows.push(r); };

  const build = (p: "instagram" | "youtube" | "facebook", handle: string, isTracked: boolean, sg: Suggested | undefined): CompetitorRow => {
    const key = `${p}:${handle.toLowerCase()}`;
    if (p === "youtube") {
      const s = yt.get(handle.toLowerCase());
      const live = s?.found ? s : null;
      const postsRead = live ? ytPosts(live) : [];
      const n = postsRead.length || null;
      return {
        id: key, platform: p, handle, name: (live?.title ?? sg?.displayName ?? `@${handle}`).replace(/\s+/g, " ").trim(),
        avatar: live?.avatar ?? sg?.profileImage ?? null, url: live?.url ?? sg?.profileUrl ?? `https://youtube.com/@${handle}`,
        isYou: false, tracked: isTracked, classification: sg?.classification ?? (isTracked ? "direct_competitor" : null),
        audience: live ? cell(live.subscribers ?? null, "public_api") : sg?.followers != null ? cell(sg.followers, "public_api") : absent("unknown"),
        engagement: live ? cell(live.engagementRate ?? null, "calculated", n) : absent("unknown"),
        cadence: live ? cell(live.uploadsPerWeek ?? null, "calculated", n) : absent("unknown"),
        medianViews: live ? cell(live.medianViews ?? null, "public_api", n) : absent("unknown"),
        momentum: momentumFor(p, handle), match: sg?.relevanceScore ?? null,
        topFormat: postsRead.length ? (postsRead.filter((x) => x.format === "Short").length >= postsRead.length / 2 ? "Shorts" : "Videos") : null,
        description: live?.description ?? null, location: sg?.location ?? null, reasons: sg?.relevanceReasons ?? [],
        postsCount: live?.videoCount ?? null, posts: postsRead, postsSource: postsRead.length ? "youtube_api" : null,
        postsGate: postsRead.length ? null : ytConfigured() ? (live ? "unavailable" : "not_found") : "unavailable",
      };
    }
    if (p === "instagram") {
      const c = ig.get(handle.toLowerCase());
      const live = c?.found ? c : null;
      const postsRead = live ? igPosts(live) : [];
      const n = postsRead.length || null;
      const gate = live && postsRead.length ? null : igGate(c);
      return {
        id: key, platform: p, handle, name: (live?.displayName ?? sg?.displayName ?? `@${handle}`).replace(/\s+/g, " ").trim(),
        avatar: live?.profilePicture ?? sg?.profileImage ?? null, url: sg?.profileUrl ?? `https://instagram.com/${handle}`,
        isYou: false, tracked: isTracked, classification: sg?.classification ?? (isTracked ? "direct_competitor" : null),
        audience: live ? cell(live.followers ?? null, "public_api") : absent(igRes.enabled ? "unknown" : "connection_needed"),
        engagement: live ? cell(live.engagementRate ?? null, "calculated", n) : absent(igRes.enabled ? "unknown" : "connection_needed"),
        cadence: live ? cell(live.postsPerWeek ?? null, "calculated", n) : absent(igRes.enabled ? "unknown" : "connection_needed"),
        // Meta never publishes another account's views.
        medianViews: absent("unavailable"),
        momentum: momentumFor(p, handle), match: sg?.relevanceScore ?? null,
        topFormat: postsRead.length ? (postsRead.filter((x) => x.format === "Reel").length >= postsRead.length / 2 ? "Reels" : "Photos") : null,
        description: live?.biography ?? null, location: sg?.location ?? null, reasons: sg?.relevanceReasons ?? [],
        postsCount: live?.mediaCount ?? null, posts: postsRead, postsSource: postsRead.length ? "instagram_discovery" : null, postsGate: gate,
      };
    }
    return {
      id: key, platform: p, handle, name: (sg?.displayName ?? `@${handle}`).replace(/\s+/g, " ").trim(),
      avatar: sg?.profileImage ?? null, url: sg?.profileUrl ?? `https://facebook.com/${handle}`,
      isYou: false, tracked: isTracked, classification: sg?.classification ?? (isTracked ? "direct_competitor" : null),
      audience: absent("unavailable"), engagement: absent("unavailable"), cadence: absent("unavailable"), medianViews: absent("unavailable"),
      momentum: absent("unavailable"), match: sg?.relevanceScore ?? null, topFormat: null,
      description: null, location: sg?.location ?? null, reasons: sg?.relevanceReasons ?? [], postsCount: null, posts: [], postsSource: null, postsGate: "unavailable",
    };
  };

  for (const t of tracked) {
    const p = t.platform === "youtube" ? "youtube" : t.platform === "facebook" ? "facebook" : "instagram";
    push(build(p, t.handle, true, matchFor(p, t.handle)));
  }
  for (const sg of suggested) {
    if (!sg.handle) continue;
    const p = sg.platform === "youtube" ? "youtube" : sg.platform === "facebook" ? "facebook" : "instagram";
    push(build(p, sg.handle, false, sg));
  }

  // ---- discovery run + niche content --------------------------------------
  const [run, contentRows, saved] = await Promise.all([runP, contentRowsP, savedP]);
  const lastRun: string | null = run?.ran_at ?? null;
  const sources = (run?.sources as { youtube: string; web: string } | null) ?? null;

  const loc = locationTokens(location);
  const FORMAT: Record<string, string> = { short: "Short", video: "Video", reel: "Reel" };
  const content: NichePost[] = contentRows.map((r) => ({
      url: String(r.content_url), platform: String(r.platform), accountName: (r.account_name as string) ?? null, accountHandle: (r.account_handle as string) ?? null,
      title: (r.title as string) ?? null, thumb: (r.thumbnail_url as string) ?? null,
      views: (r.views as number) ?? null, likes: (r.likes as number) ?? null, comments: (r.comments as number) ?? null,
      publishedAt: (r.published_at as string) ?? null, multiplier: r.multiplier != null ? Number(r.multiplier) : null,
      relevanceScore: (r.relevance_score as number) ?? 0,
      // Re-tagged with the current vocabulary; stored tags may predate it.
      tags: tagsFor((r.title as string) ?? null, loc),
      format: r.content_type ? FORMAT[String(r.content_type)] ?? null : null,
      why: (r.why_recommended as string) ?? null, dataSource: String(r.data_source ?? "web_research"),
  }));

  // The user's own posts, tagged the same way, for the opportunity maths.
  const ownBase = median(all.map(interactionsTotal));
  const own: OwnPost[] = all.map((m) => ({
    tags: tagsFor((m.caption ?? "").split("\n")[0], loc).filter((t) => tagGroup(t) !== "style"),
    multiplier: ownBase && ownBase > 0 ? interactionsTotal(m) / ownBase : null,
  }));

  const data: CompetitorsData = {
    connected: Boolean(snap), igConnectHref: igConfigured() ? "/api/auth/instagram/start" : "/settings#accounts",
    you, rows, tracked, days, maxDays: maxHistoryDays(ent), platform, lastRun, sources,
    ig: { enabled: igRes.enabled, reason: igRes.enabled ? null : (igRes.reason ?? null) }, ytConfigured: ytConfigured(),
    niche: profile?.niche ?? null, subNiche, nicheRange, content, saved, own, youSeries, followerSeries,
    goalKeywords: goalKeywords(profile?.goals ?? null), goalText: profile?.goals ?? null, location, now: now.toISOString(),
  };

  return (
    <>
      <CompetitorsPage d={data} />
    </>
  );
}
