import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { ExportButton } from "@/components/CompetitorsBoard";
import IgCompetitorData from "@/components/IgCompetitorData";
import {
  ManageCompetitors,
  type Tracked,
  type Suggested,
} from "@/components/CompetitorIntel";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem } from "@/lib/instagramSync";
import { channelStats, ytConfigured, type YtStats } from "@/lib/youtube";
import { nameKey } from "@/lib/discovery";
import CompetitorWorkspace, { type WinningItem } from "@/components/CompetitorWorkspace";
import RefreshDiscovery from "@/components/RefreshDiscovery";
import { cell, absent, type LeaderRow } from "@/lib/competitorRollup";
import {
  engagementOf,
  median,
  engagementRate,
  fmtMult,
  isChartableDay,
  localDayStr,
} from "@/lib/metrics";

export const metadata = { title: "Competitors — SOCIA" };

// Competitor Intelligence. The page's honesty contract:
//   YOU            -> authenticated Instagram data (verified)
//   Competitors    -> handles the user tracks; platforms expose no analytics
//                     for other accounts, so their metrics are "—", never guesses
//   Winning posts  -> real posts by other creators found by live web search,
//                     labeled Trending creator vs Tracked competitor
//   Patterns       -> niche web research, labeled as AI-estimated momentum
// Niche averages don't exist in any data SOCIA can verify, so the comparison
// table says so instead of inventing a number.

function agoText(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? "" : "s"} ago`;
}

const fmtNum = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { range } = await searchParams;
  const days = range === "7" ? 7 : range === "90" ? 90 : 30;

  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);
  const all: IgMediaItem[] = snap?.media ?? [];
  const cutoff = Date.now() - days * 86400000;
  const posts = all.filter((p) => p.timestamp && new Date(p.timestamp).getTime() >= cutoff);
  const followers = snap?.followers_count ?? null;

  // Tracked competitors (table may not exist yet — page renders without it).
  let tracked: Tracked[] = [];
  try {
    const { data, error } = await supabase
      .from("tracked_competitors")
      .select("platform, handle, added_at")
      .eq("user_id", user.id)
      .order("added_at", { ascending: true });
    if (!error) tracked = (data ?? []) as Tracked[];
  } catch {
    /* not migrated yet */
  }

  // Real follower history for the YOU sparkline + growth.
  let folSeries: { day: string; followers: number }[] = [];
  let gains: number | null = null;
  try {
    const rows = await readDailySnapshots<{ day: string; followers: number | null; followers_gained: number | null; source: string | null }>(
      supabase, user.id, snap?.ig_user_id ?? null, "day, followers, followers_gained, source",
    );
    const from = localDayStr(new Date(cutoff));
    const today = localDayStr(new Date());
    folSeries = rows
      .filter((r) => r.day >= from && r.followers != null)
      .map((r) => ({ day: r.day, followers: r.followers! }));
    const gainRows = rows.filter((r) => r.day >= from && r.followers_gained != null && isChartableDay(r, today));
    gains = gainRows.length ? gainRows.reduce((a, r) => a + (r.followers_gained ?? 0), 0) : null;
  } catch {
    /* history simply absent */
  }
  const growth =
    folSeries.length >= 2
      ? { text: `${folSeries.at(-1)!.followers - folSeries[0].followers >= 0 ? "+" : ""}${(folSeries.at(-1)!.followers - folSeries[0].followers).toLocaleString("en-US")}`, note: "net, from daily snapshots" }
      : gains != null
        ? { text: `+${gains.toLocaleString("en-US")}`, note: "new followers (unfollows not reported)" }
        : null;

  // ---- YOUR metrics for the window (all real; null = not available) ------
  const N = posts.length;
  const viewsVals = posts.filter((p) => p.insights?.views != null).map((p) => p.insights!.views!);
  const medViews = median(viewsVals);
  const reels = posts.filter((p) => p.media_type === "VIDEO");
  const freq = N ? (N / days) * 7 : 0;
  // Same definition as Analytics/Dashboard (all synced posts), so the same
  // label can't show a different number per page. A 2-post window average
  // dominated by one outlier is real math but a misleading "rate".
  const rate = engagementRate(all, followers);

  const ytTracked = tracked.filter((t) => t.platform === "youtube");
  let ytStats: Record<string, YtStats> = {};
  if (ytTracked.length && ytConfigured()) {
    try {
      const results = await Promise.all(ytTracked.slice(0, 10).map((t) => channelStats(t.handle)));
      ytStats = Object.fromEntries(results.map((r) => [r.handle, r]));
    } catch {
      // the table simply shows dashes if YouTube is unreachable
    }
  }

  const trackedKeys = new Set(tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`));
  const CLASS_ORDER: Record<string, number> = {
    local_competitor: 0, direct_competitor: 1, emerging_creator: 2,
    content_inspiration: 3, niche_leader: 4, adjacent_competitor: 5,
  };
  let suggested: Suggested[] = [];
  try {
    const { data } = await supabase
      .from("discovered_accounts")
      .select("platform, handle, display_name, profile_image, profile_url, followers, classification, relevance_score, relevance_reasons")
      .eq("user_id", user.id)
      .order("relevance_score", { ascending: false })
      .limit(40);
    suggested = ((data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        platform: String(r.platform),
        handle: (r.handle as string) ?? null,
        displayName: (r.display_name as string) ?? null,
        profileImage: (r.profile_image as string) ?? null,
        profileUrl: (r.profile_url as string) ?? null,
        followers: (r.followers as number) ?? null,
        classification: String(r.classification),
        relevanceScore: (r.relevance_score as number) ?? null,
        relevanceReasons: (r.relevance_reasons as string[]) ?? [],
      }))
      .filter((sg) => sg.handle && !trackedKeys.has(`${sg.platform}:${sg.handle.toLowerCase()}`))
      .sort((a, b) => (CLASS_ORDER[a.classification] ?? 9) - (CLASS_ORDER[b.classification] ?? 9));

    // One card per BUSINESS, not per account. The same restaurant surfaces as
    // an Instagram page and a Facebook page; both are real, but this strip
    // answers "who am I competing against", where showing it twice is noise.
    // The per-platform breakdown stays available further down the page.
    // Ties resolve to whichever row sorted higher — better classification
    // first, then relevance — so the more useful listing is the one kept.
    const seenName = new Set<string>();
    suggested = suggested
      .filter((sg) => {
        const key = nameKey(sg.displayName ?? sg.handle);
        if (!key) return true;
        if (seenName.has(key)) return false;
        seenName.add(key);
        return true;
      })
      .slice(0, 6);
  } catch {
    // discovery tables may not exist yet — the strip still shows tracked accounts
  }

  const youStrip = {
    username: snap?.username ?? null,
    avatar: snap?.profile_picture_url ?? null,
    followers,
    engRate: rate,
    spark: folSeries.map((r) => r.followers),
  };

  // Discovery stores a channel's subscriber count but not its posting cadence
  // or engagement — those need its recent uploads. YouTube publishes them, so
  // leaving the columns empty would be understating what SOCIA can know. Read
  // them for the handful shown, which also gives the niche medians a real
  // sample instead of "not enough data".
  let ytDiscovered: Record<string, YtStats> = {};
  if (ytConfigured()) {
    try {
      const ytSuggested = suggested
        .filter((sg) => sg.platform === "youtube" && sg.handle)
        .slice(0, 8);
      if (ytSuggested.length) {
        const results = await Promise.all(ytSuggested.map((sg) => channelStats(sg.handle!)));
        ytDiscovered = Object.fromEntries(results.filter((r) => r.found).map((r) => [r.handle, r]));
      }
    } catch {
      // partial enrichment is fine — unenriched rows keep their dashes
    }
  }

  // Strongest discovered accounts the user isn't already tracking. Local and
  // direct competitors first — "who am I competing against" is answered by the
  // pizzeria down the road before it's answered by a national channel.
  // Only shown when a discovery run genuinely exists — the header must not
  // imply freshness the app cannot vouch for.
  let lastRun: string | null = null;
  try {
    const { data } = await supabase
      .from("discovery_runs")
      .select("ran_at")
      .eq("user_id", user.id)
      .maybeSingle();
    lastRun = data?.ran_at ?? null;
  } catch {
    // no run recorded — the status line simply doesn't render
  }

  // ---- leaderboard rows: the user, tracked accounts, then discovery -------
  // Each cell states its provenance, and an absent value states WHY it is
  // absent. Instagram and Facebook publish nothing about accounts the user
  // doesn't own, so those rows carry connection_needed / unavailable rather
  // than a dash that could be mistaken for zero.
  const leaderRows: LeaderRow[] = [];

  // The user's strongest format: highest median engagement among formats with
  // at least two posts in the window. Fewer than that and no format is named.
  const FORMAT_LABEL: Record<string, string> = { VIDEO: "Reels", CAROUSEL_ALBUM: "Carousels", IMAGE: "Static" };
  const byFormat = new Map<string, number[]>();
  for (const p of posts) byFormat.set(p.media_type ?? "IMAGE", [...(byFormat.get(p.media_type ?? "IMAGE") ?? []), engagementOf(p)]);
  const yourTopFormat = [...byFormat.entries()]
    .filter(([, xs]) => xs.length >= 2)
    .map(([t, xs]) => ({ t, m: median(xs) ?? 0 }))
    .sort((a, b) => b.m - a.m)[0]?.t;
  const matchFor = (platform: string, handle: string): number | null =>
    suggested.find((sg) => sg.platform === platform && sg.handle?.toLowerCase() === handle.toLowerCase())?.relevanceScore ?? null;

  leaderRows.push({
    id: "you",
    platform: "instagram",
    handle: snap?.username ?? "you",
    name: snap?.username ? `@${snap.username}` : "Your account",
    avatar: snap?.profile_picture_url ?? null,
    url: snap?.username ? `https://instagram.com/${snap.username}` : null,
    isYou: true,
    tracked: true,
    classification: null,
    audience: cell(followers, "live_api"),
    engagement: cell(rate, "calculated", all.length || null),
    cadence: cell(N ? freq : null, "calculated", N || null),
    medianViews: medViews != null ? cell(Math.round(medViews), "live_api", viewsVals.length) : absent("insufficient"),
    momentum: growth && folSeries.length >= 2
      ? cell(folSeries.at(-1)!.followers - folSeries[0].followers, "socia_snapshot", folSeries.length)
      : absent("insufficient"),
    match: null,
    topFormat: yourTopFormat ? FORMAT_LABEL[yourTopFormat] ?? yourTopFormat : null,
  });

  for (const t of tracked) {
    const yt = t.platform === "youtube" ? ytStats[t.handle] : undefined;
    const live = yt?.found ? yt : null;
    leaderRows.push({
      id: `${t.platform}:${t.handle}`,
      platform: t.platform === "youtube" ? "youtube" : t.platform === "facebook" ? "facebook" : "instagram",
      handle: t.handle,
      name: (live?.title ?? `@${t.handle}`).trim(),
      avatar: live?.avatar ?? null,
      url: live?.url
        ?? (t.platform === "facebook" ? `https://facebook.com/${t.handle}` : `https://instagram.com/${t.handle}`),
      isYou: false,
      tracked: true,
      classification: "direct_competitor",
      audience: live ? cell(live.subscribers ?? null, "public_api") : absent(t.platform === "youtube" ? "unknown" : "connection_needed"),
      engagement: live ? cell(live.engagementRate ?? null, "calculated", 10) : absent(t.platform === "youtube" ? "unknown" : "connection_needed"),
      cadence: live ? cell(live.uploadsPerWeek ?? null, "calculated", 10) : absent(t.platform === "youtube" ? "unknown" : "connection_needed"),
      medianViews: live ? cell(live.medianViews ?? null, "public_api", 10) : absent(t.platform === "youtube" ? "unknown" : "connection_needed"),
      momentum: absent("unavailable"),
      // A hand-added account has a score only if discovery also found it.
      match: matchFor(t.platform, t.handle),
      // YouTube is video by definition; Instagram formats arrive only via
      // Business Discovery, so until then nothing is claimed.
      topFormat: live ? "Video" : null,
    });
  }

  const inLeader = new Set(leaderRows.map((r) => `${r.platform}:${r.handle.toLowerCase()}`));
  for (const sg of suggested) {
    const key = `${sg.platform}:${(sg.handle ?? "").toLowerCase()}`;
    if (!sg.handle || inLeader.has(key)) continue;
    inLeader.add(key);
    const isYt = sg.platform === "youtube";
    const enriched = isYt ? ytDiscovered[sg.handle] : undefined;
    leaderRows.push({
      id: key,
      platform: isYt ? "youtube" : sg.platform === "facebook" ? "facebook" : "instagram",
      handle: sg.handle,
      name: (sg.displayName ?? `@${sg.handle}`).trim(),
      avatar: enriched?.avatar ?? sg.profileImage,
      url: enriched?.url ?? sg.profileUrl,
      isYou: false,
      tracked: false,
      classification: sg.classification,
      audience: enriched
        ? cell(enriched.subscribers ?? null, "public_api")
        : sg.followers != null ? cell(sg.followers, "public_api")
        : absent(isYt ? "unknown" : "connection_needed"),
      // Enriched from the channel's recent uploads where YouTube publishes
      // them; Instagram and Facebook expose nothing for accounts you don't own.
      engagement: enriched ? cell(enriched.engagementRate ?? null, "calculated", 10) : absent(isYt ? "unknown" : "connection_needed"),
      cadence: enriched ? cell(enriched.uploadsPerWeek ?? null, "calculated", 10) : absent(isYt ? "unknown" : "connection_needed"),
      medianViews: enriched ? cell(enriched.medianViews ?? null, "public_api", 10) : absent(isYt ? "unknown" : "connection_needed"),
      momentum: absent("unavailable"),
      match: sg.relevanceScore,
      topFormat: enriched ? "Video" : null,
    });
  }

  // Winning content: what discovery stored, read server-side so it renders
  // with the page rather than after it.
  let content: WinningItem[] = [];
  try {
    const { data } = await supabase
      .from("discovered_content")
      .select("content_url, platform, account_name, title, thumbnail_url, views, likes, comments, published_at, multiplier, relevance_score, trend_tags")
      .eq("user_id", user.id)
      .order("relevance_score", { ascending: false })
      .limit(40);
    content = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      url: String(r.content_url),
      platform: String(r.platform),
      accountName: (r.account_name as string) ?? null,
      title: (r.title as string) ?? null,
      thumbnailUrl: (r.thumbnail_url as string) ?? null,
      views: (r.views as number) ?? null,
      likes: (r.likes as number) ?? null,
      comments: (r.comments as number) ?? null,
      publishedAt: (r.published_at as string) ?? null,
      multiplier: r.multiplier != null ? Number(r.multiplier) : null,
      relevanceScore: (r.relevance_score as number) ?? 0,
      trendTags: (r.trend_tags as string[]) ?? [],
    }));
  } catch {
    // no discovery yet — the section shows its empty state
  }

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="cp4">
        {/* header */}
        <div className="cp4-head cw-head db2-rise">
          <div>
            <h1>Competitors</h1>
            <p>See who&apos;s outperforming you, why they&apos;re winning, and what you can learn from them.</p>
            <span className="cw-status">
              <i className={lastRun ? "live" : ""} />
              {lastRun ? <>Live data · Refreshed {agoText(lastRun)}</> : <>No discovery run yet</>}
              <RefreshDiscovery />
            </span>
          </div>
          <div className="cp4-controls">
            <span className="cp4-chipset" role="group" aria-label="Platform">
              <span className="cp4-chip on" title="Facebook joins when a Page is connected.">Instagram</span>
            </span>
            <span className="cp4-chipset" role="group" aria-label="Date range">
              {[7, 30, 90].map((d) => (
                <Link key={d} href={`/competitors?range=${d}`} className={`cp4-chip${days === d ? " on" : ""}`}>
                  {d === 7 ? "Last 7 days" : d === 30 ? "Last 30 days" : "Last 90 days"}
                </Link>
              ))}
            </span>
            <ExportButton />
            <ManageCompetitors initial={tracked} />
          </div>
        </div>

        <CompetitorWorkspace rows={leaderRows} content={content} />

        {/* Instagram connection — compact, and only while it is required */}
        {tracked.some((t) => t.platform === "instagram") && (
          <IgCompetitorData hasTracked />
        )}

      </div>
    </AppShell>
  );
}
