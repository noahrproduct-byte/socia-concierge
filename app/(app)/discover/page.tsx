import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import DiscoverPage from "@/components/discover/DiscoverPage";
import type { Tracked } from "@/components/competitors/types";
import type { DiscoverAccount, DiscoverData } from "@/components/discover/types";
import { getIgSnapshot } from "@/lib/instagramSync";
import { channelStats, ytConfigured, type YtStats } from "@/lib/youtube";
import { youtubeRecentUploads } from "@/lib/youtubeData";
import { nicheVetted } from "@/lib/discovery";
import { cell, absent } from "@/lib/competitorRollup";
import { competitorScopeId } from "@/lib/workspaces";
import { type CompetitorRow } from "@/lib/competitorIntel";
import { igCompetitorRows, igRowStale, type IgCompetitor } from "@/lib/igCompetitorData";
import { median } from "@/lib/metrics";
import { provenReels, rankTrendingReels } from "@/lib/trendSignals";
import type { NichePost } from "@/lib/nicheTrends";
import { igPosts, ytPosts } from "@/lib/trendSignalsLoad";
import { getEntitlements, getLimit, canUseFeature, upgradeFor } from "@/lib/entitlements";
import { isOwnAccount, ownAccounts, type OwnAccounts } from "@/lib/ownAccounts";
import { listTracked } from "@/lib/trackedCompetitors";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { createServiceClient } from "@/lib/supabase/service";
import { dismissedHandles } from "@/lib/competitorAutoPick";
import { mainPlatform, sameStyle, styleKey, styleStale, styleWord, triedRecently, type AccountStyle, type StyleMemory } from "@/lib/discoverStyle";
import { readStyleMemory } from "@/lib/discoverStyleLoad";
import { SUGGESTIONS_READ } from "@/lib/discoverRead";
import { signRefUrl } from "@/lib/studioClips/refToken";
import { isPlatformMediaUrl } from "@/lib/fetchGuard";

export const metadata = { title: "Discover | SOCIA" };

// Discover (Noah, 2026-11-14): the competitors the person tracks at the top, the
// Reels of theirs worth copying, and accounts like them to track next, on the
// platform the brand mostly uses. The honesty contract is unchanged: numbers
// come from the platforms (YouTube's public API, Instagram Business Discovery),
// an account never read says so, and nothing is estimated. Instagram is read
// in the background (app/api/discover/read), so this page shows what is saved
// and never waits on Instagram.

const SUGGESTIONS_SHOWN = 12;
/** Niche Reels under the competitors': a few, so the competitors' stay the most. */
const NICHE_REELS = 6;

export default async function Page() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  // Everything below reads the ACTIVE Brand Workspace, which may belong to
  // someone who invited this person: data helpers take (ctx.client, ctx.ownerId).
  const ctx = await resolveContext(supabase, user.id);
  const now = new Date();
  const since = now.getTime() - 60 * 86_400_000;

  const [ent, snap, cwid, profile, ownFound, memory, ytRecent] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
    competitorScopeId(ctx.client, ctx.workspace?.id),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
    readStyleMemory(ctx).catch((): StyleMemory => ({ own: null, accounts: {}, tried: {} })),
    youtubeRecentUploads(ctx.client, ctx.ownerId, 25, ctx.workspace?.id ?? undefined).catch(() => []),
  ]);
  // Every account the owner has connected: never shown, suggested or counted as a competitor.
  const mine: OwnAccounts = ownFound ?? { keys: new Set(), ids: new Set(), handles: [] };
  if (snap?.username) mine.keys.add(snap.username.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (snap?.ig_user_id) mine.ids.add(String(snap.ig_user_id));

  // Where the brand mostly posts: suggestions come from there.
  const main = mainPlatform({
    instagram: (snap?.media ?? []).filter((m) => m.timestamp && Date.parse(m.timestamp) >= since).length,
    youtube: ytRecent.filter((v) => v.publishedAt && Date.parse(v.publishedAt) >= since).length,
  });
  const suggestOn = main ?? "instagram";
  const limit = getLimit(ent, "competitors");

  // ---- who is tracked, and who could be ------------------------------------
  const [trackedAll, suggestedRows, dismissed, runAt, contentRows] = await Promise.all([
    listTracked<Tracked>(ctx.client, ctx.ownerId, "platform, handle, added_at, added_by, pick_reason", { byAdded: true, workspaceId: cwid })
      .catch(() => listTracked<Tracked>(ctx.client, ctx.ownerId, "platform, handle, added_at", { byAdded: true, workspaceId: cwid }))
      .catch(() => [] as Tracked[]),
    (async () => {
      try {
        let dq = ctx.client
          .from("discovered_accounts")
          .select("platform, handle, display_name, profile_image, profile_url, followers, location, classification, relevance_score, relevance_reasons, data_source")
          .eq("user_id", ctx.ownerId).eq("platform", suggestOn);
        if (cwid) dq = dq.eq("workspace_id", cwid);
        const { data } = await dq.order("relevance_score", { ascending: false }).limit(60);
        // YouTube search results count only once they passed the niche check (lib/nicheCheck.ts).
        return ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted);
      } catch { return []; } // discovery tables may not exist yet
    })(),
    (async () => {
      const svc = createServiceClient();
      return svc ? (await dismissedHandles(svc, ctx.ownerId, cwid)) ?? new Set<string>() : new Set<string>();
    })(),
    (async () => {
      try {
        let rq = ctx.client.from("discovery_runs").select("ran_at").eq("user_id", ctx.ownerId);
        if (cwid) rq = rq.eq("workspace_id", cwid);
        return ((await rq.maybeSingle()).data?.ran_at as string | null) ?? null;
      } catch { return null; }
    })(),
    // Reels and Shorts SOCIA's niche research found (lib/discoveryRun.ts), for the few niche Reels under the competitors'.
    (async () => {
      try {
        let cq = ctx.client
          .from("discovered_content")
          .select("content_url, platform, account_name, account_handle, title, thumbnail_url, views, likes, comments, published_at, content_type, multiplier, relevance_score, data_source")
          .eq("user_id", ctx.ownerId).eq("platform", suggestOn);
        if (cwid) cq = cq.eq("workspace_id", cwid);
        const { data } = await cq.order("relevance_score", { ascending: false }).limit(80);
        return ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted);
      } catch { return [] as Record<string, unknown>[]; } // no discovery yet
    })(),
  ]);
  const tracked = trackedAll.filter((t) => !isOwnAccount(mine, { handle: t.handle })).slice(0, Math.max(limit, 1));
  const trackedKeys = new Set(tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`));
  const suggested = suggestedRows
    .filter((r) => r.handle && !trackedKeys.has(`${r.platform}:${String(r.handle).toLowerCase()}`) && !dismissed.has(String(r.handle).toLowerCase()))
    .filter((r) => !isOwnAccount(mine, { handle: r.handle as string, name: (r.display_name as string) ?? null }))
    .slice(0, SUGGESTIONS_READ);

  // ---- what the platforms say about them -----------------------------------
  const igHandles = [...tracked.filter((t) => t.platform === "instagram").map((t) => t.handle), ...suggested.filter((r) => r.platform === "instagram").map((r) => String(r.handle))];
  const ytHandles = [...tracked.filter((t) => t.platform === "youtube").map((t) => t.handle), ...suggested.filter((r) => r.platform === "youtube").map((r) => String(r.handle))].slice(0, 20);
  const [igRes, ytRes] = await Promise.all([
    igHandles.length
      ? igCompetitorRows(ctx.client, ctx.ownerId, igHandles, false, { max: igHandles.length, cacheOnly: true }).catch(() => ({ enabled: false, reason: null as string | null, competitors: [] as IgCompetitor[] }))
      : igCompetitorRows(ctx.client, ctx.ownerId, [], false).catch(() => ({ enabled: false, reason: null as string | null, competitors: [] as IgCompetitor[] })),
    ytHandles.length && ytConfigured()
      ? Promise.all(ytHandles.map((h) => channelStats(h).catch(() => ({ handle: h, found: false } as YtStats))))
      : Promise.resolve([] as YtStats[]),
  ]);
  const ig = new Map(igRes.competitors.map((c) => [c.handle.toLowerCase(), c]));
  const yt = new Map(ytRes.map((r) => [r.handle.toLowerCase(), r]));

  const styleOf = (platform: string, handle: string): AccountStyle | null => memory.accounts[styleKey(platform, handle)] ?? null;

  const build = (platform: string, handle: string, sg: Record<string, unknown> | null, t: Tracked | null): DiscoverAccount => {
    const p: "instagram" | "youtube" | "facebook" = platform === "youtube" ? "youtube" : platform === "facebook" ? "facebook" : "instagram";
    const id = `${p}:${handle.toLowerCase()}`;
    const reasons = (sg?.relevance_reasons as string[] | undefined) ?? [];
    const why = t?.pick_reason ?? reasons[0] ?? null;
    const style = styleOf(p, handle);
    const base = {
      id, platform: p, handle, isYou: false, tracked: Boolean(t), classification: (sg?.classification as string) ?? (t ? "direct_competitor" : null),
      location: (sg?.location as string) ?? null, reasons, match: (sg?.relevance_score as number) ?? null, momentum: absent("unavailable"),
      addedBy: t ? (t.added_by === "socia" ? "socia" as const : "you" as const) : null, style: styleWord(style), sameStyle: sameStyle(style, memory.own), why,
    };
    if (p === "instagram") {
      const c = ig.get(handle.toLowerCase());
      const live = c?.found ? c : null;
      // Tried in the last day: show what came back rather than "Reading" (the read waits a day either way).
      const recent = triedRecently(memory, styleKey(p, handle), now);
      const miss = recent ? memory.tried[styleKey(p, handle)]?.miss : undefined;
      const postsRead = live ? igPosts(live) : [];
      const n = postsRead.length || null;
      const views = postsRead.map((x) => x.views).filter((v): v is number => v != null);
      const row: CompetitorRow = {
        ...base, name: (live?.displayName ?? (sg?.display_name as string) ?? `@${handle}`).replace(/\s+/g, " ").trim(),
        avatar: live?.profilePicture ?? (sg?.profile_image as string) ?? null, url: (sg?.profile_url as string) ?? `https://instagram.com/${handle}`,
        audience: live ? cell(live.followers ?? null, "public_api") : (sg?.followers as number) != null ? cell(sg!.followers as number, "public_api") : absent(igRes.enabled ? "unknown" : "connection_needed"),
        engagement: live ? cell(live.engagementRate ?? null, "calculated", n) : absent("unknown"),
        cadence: live ? cell(live.postsPerWeek ?? null, "calculated", n) : absent("unknown"),
        medianViews: views.length ? cell(median(views), "public_api", views.length) : absent("unavailable"),
        topFormat: null, description: live?.biography ?? null, postsCount: live?.mediaCount ?? null,
        posts: postsRead, postsSource: postsRead.length ? "instagram_discovery" : null,
        postsGate: !igRes.enabled ? "connection_needed" : postsRead.length ? null : (miss ?? c?.reasonKind) === "not_business" ? "not_business" : (miss ?? c?.reasonKind) === "not_found" ? "not_found" : "unavailable",
      };
      return { ...base, ...row, reading: igRes.enabled && !recent && (!live || igRowStale(live, now) || (live.media?.length ? styleStale(style, now) : false)) };
    }
    if (p === "youtube") {
      const s = yt.get(handle.toLowerCase());
      const live = s?.found ? s : null;
      const postsRead = live ? ytPosts(live) : [];
      const n = postsRead.length || null;
      const row: CompetitorRow = {
        ...base, name: (live?.title ?? (sg?.display_name as string) ?? `@${handle}`).replace(/\s+/g, " ").trim(),
        avatar: live?.avatar ?? (sg?.profile_image as string) ?? null, url: live?.url ?? (sg?.profile_url as string) ?? `https://youtube.com/@${handle}`,
        audience: live ? cell(live.subscribers ?? null, "public_api") : absent("unknown"),
        engagement: live ? cell(live.engagementRate ?? null, "calculated", n) : absent("unknown"),
        cadence: live ? cell(live.uploadsPerWeek ?? null, "calculated", n) : absent("unknown"),
        medianViews: live ? cell(live.medianViews ?? null, "public_api", n) : absent("unknown"),
        topFormat: null, description: live?.description ?? null, postsCount: live?.videoCount ?? null,
        posts: postsRead, postsSource: postsRead.length ? "youtube_api" : null,
        postsGate: postsRead.length ? null : ytConfigured() ? (live ? "unavailable" : "not_found") : "unavailable",
      };
      return { ...base, ...row, reading: false };
    }
    const row: CompetitorRow = {
      ...base, name: ((sg?.display_name as string) ?? `@${handle}`).replace(/\s+/g, " ").trim(), avatar: (sg?.profile_image as string) ?? null,
      url: (sg?.profile_url as string) ?? `https://facebook.com/${handle}`, audience: absent("unavailable"), engagement: absent("unavailable"),
      cadence: absent("unavailable"), medianViews: absent("unavailable"), topFormat: null, description: null, postsCount: null, posts: [], postsSource: null, postsGate: "unavailable",
    };
    return { ...base, ...row, reading: false };
  };

  const competitors = tracked.map((t) => build(t.platform, t.handle, suggestedRows.find((r) => r.platform === t.platform && String(r.handle).toLowerCase() === t.handle.toLowerCase()) ?? null, t));
  // Suggestions SOCIA could read and that are doing well lead; ones it couldn't read follow, never above them.
  const suggestions = suggested.map((r) => build(String(r.platform), String(r.handle), r, null))
    .sort((a, b) => Number(b.posts.length > 0) - Number(a.posts.length > 0) || Number(b.sameStyle) - Number(a.sameStyle) || (b.match ?? 0) - (a.match ?? 0))
    .slice(0, SUGGESTIONS_SHOWN);

  // ---- the Reels worth copying: only from the competitors tracked --------
  const allReels = rankTrendingReels(competitors.map((r) => ({ platform: r.platform, name: r.name, handle: r.handle, avatar: r.avatar, posts: r.posts })), [], now);
  // Reels made the way the brand makes its own come first (Noah: "if an account is posting only animated videos, then it should look for animated videos").
  const same = new Set(competitors.filter((c) => c.sameStyle).map((c) => c.handle.toLowerCase()));
  const ordered = [...allReels.filter((r) => same.has((r.accountHandle ?? "").toLowerCase())), ...allReels.filter((r) => !same.has((r.accountHandle ?? "").toLowerCase()))];
  const tookOff = provenReels(ordered, { max: 12, perAccount: 3 });
  const reelsToCopy = tookOff.length >= 4 ? tookOff : provenReels(ordered, { max: 9, perAccount: 3, fill: true });

  // A few from the niche under them (Noah: "most of the reels should be from the competitors, but there should also be some from just like niches"):
  // the suggested accounts SOCIA read, and Reels its niche research found, never a competitor's or the brand's own.
  const competitorKeys = new Set(competitors.map((c) => c.handle.toLowerCase()));
  const notOurs = (handle: string | null, name: string | null) =>
    !(handle && competitorKeys.has(handle.toLowerCase())) && !isOwnAccount(mine, { handle, name });
  const FORMAT: Record<string, string> = { short: "Short", video: "Video", reel: "Reel" };
  const content: NichePost[] = contentRows
    .filter((r) => notOurs((r.account_handle as string) ?? null, (r.account_name as string) ?? null))
    .map((r) => ({
      url: String(r.content_url), platform: String(r.platform), accountName: (r.account_name as string) ?? null, accountHandle: (r.account_handle as string) ?? null,
      title: (r.title as string) ?? null, thumb: (r.thumbnail_url as string) ?? null,
      views: (r.views as number) ?? null, likes: (r.likes as number) ?? null, comments: (r.comments as number) ?? null,
      publishedAt: (r.published_at as string) ?? null, multiplier: r.multiplier != null ? Number(r.multiplier) : null,
      relevanceScore: (r.relevance_score as number) ?? 0, tags: [],
      format: r.content_type ? FORMAT[String(r.content_type)] ?? null : null,
      why: null, dataSource: String(r.data_source ?? "web_research"),
    }));
  const nicheAll = rankTrendingReels(
    suggestions.filter((a) => a.posts.length && notOurs(a.handle, a.name)).map((r) => ({ platform: r.platform, name: r.name, handle: r.handle, avatar: r.avatar, posts: r.posts })),
    content, now,
  ).filter((r) => notOurs(r.accountHandle, r.accountName));
  const nicheTookOff = provenReels(nicheAll, { max: NICHE_REELS, perAccount: 2 });
  const nicheReels = (nicheTookOff.length >= 3 ? nicheTookOff : provenReels(nicheAll, { max: NICHE_REELS, perAccount: 2, fill: true }))
    .map((r, i) => ({ ...r, id: `N${i + 1}` }));

  const ownStale = Boolean(snap?.media?.length) && styleStale(memory.own, now) && !triedRecently(memory, "own", now);
  // "Make a video like this": a Reel whose file official data gives is offered as the reference, its link signed for this viewer.
  const withRef = (list: typeof reelsToCopy) => list.map((r) => { const t = r.video && isPlatformMediaUrl(r.video) ? signRefUrl(user.id, r.video) : null; return t ? { ...r, refToken: t } : r; });
  const data: DiscoverData = {
    now: now.toISOString(),
    igEnabled: igRes.enabled, igReason: igRes.enabled ? null : (igRes.reason ?? null), ytConfigured: ytConfigured(),
    main, ownStyle: styleWord(memory.own), limit,
    tracked, competitors, suggestions,
    reelsToCopy: withRef(reelsToCopy),
    nicheReels: withRef(nicheReels),
    reelsRead: { reels: allReels.length, accounts: new Set(allReels.map((r) => (r.accountHandle ?? r.accountName).toLowerCase())).size },
    needsRead: igRes.enabled && (ownStale || [...competitors, ...suggestions].some((a) => a.reading)),
    lastRun: runAt,
    niche: profile?.niche ?? null,
    nicheAccess: canUseFeature(ent, "niche_intelligence"),
    nicheUpgrade: upgradeFor(ent, "niche_intelligence"),
  };

  return <DiscoverPage d={data} />;
}
