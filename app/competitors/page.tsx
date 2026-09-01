import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  CalendarDays,
  Zap,
  Type,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { ExportButton } from "@/components/CompetitorsBoard";
import CompetitorDiscovery from "@/components/CompetitorDiscovery";
import IgCompetitorData from "@/components/IgCompetitorData";
import {
  CompetitorStrip,
  ManageCompetitors,
  BreakdownRows,
  type Tracked,
  type Suggested,
} from "@/components/CompetitorIntel";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem } from "@/lib/instagramSync";
import { channelStats, ytConfigured, type YtStats } from "@/lib/youtube";
import { nameKey } from "@/lib/discovery";
import CompetitorWorkspace from "@/components/CompetitorWorkspace";
import { cell, absent, type LeaderRow } from "@/lib/competitorRollup";
import {
  engagementOf,
  median,
  postsPerWeek,
  engagementRate,
  fmtMult,
  isChartableDay,
  localDayStr,
} from "@/lib/metrics";
import type { NicheIntel, PulseRow } from "@/lib/schema";
import {
  benchmarkFor,
  engagementPosition,
  frequencyPosition,
  BENCHMARK_ATTRIBUTION,
  type Position,
} from "@/lib/nicheBenchmark";

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
  const enough = all.length >= 5;
  const engs = posts.map(engagementOf);
  const medEng = median(engs);
  const viewsVals = posts.filter((p) => p.insights?.views != null).map((p) => p.insights!.views!);
  const medViews = median(viewsVals);
  const reels = posts.filter((p) => p.media_type === "VIDEO");
  const reelViews = median(reels.filter((p) => p.insights?.views != null).map((p) => p.insights!.views!));
  const reelEng = median(reels.map(engagementOf));
  const freq = N ? (N / days) * 7 : 0;
  // Same definition as Analytics/Dashboard (all synced posts), so the same
  // label can't show a different number per page. A 2-post window average
  // dominated by one outlier is real math but a misleading "rate".
  const rate = engagementRate(all, followers);

  type Row = { label: string; you: string; tip?: string };
  const compareRows: Row[] = [
    { label: "Followers", you: followers != null ? fmtNum(followers) : "—" },
    { label: "Engagement rate", you: rate != null ? `${rate.toFixed(1)}%` : "—", tip: `avg(likes+comments)/post ÷ followers × 100, across your last ${all.length} synced posts` },
    { label: "Posting frequency", you: `${freq.toFixed(1)} / week` },
    { label: "Median engagement", you: medEng != null ? fmtNum(Math.round(medEng)) : "—" },
    { label: "Median views", you: medViews != null ? fmtNum(Math.round(medViews)) : "—" },
    { label: "Reel performance", you: reelViews != null ? `${fmtNum(Math.round(reelViews))} views` : reelEng != null ? `${fmtNum(Math.round(reelEng))} eng.` : "—" },
    { label: "Growth (followers)", you: growth ? growth.text : "—", tip: growth?.note },
  ];

  // Position verdicts where a published tier benchmark exists. Rows without one
  // keep "No verified data" — the empty-over-invented rule above still applies.
  const positions: Record<string, Position> = {
    "Engagement rate": engagementPosition(rate, followers),
    "Posting frequency": frequencyPosition(N ? freq : null),
  };

  // ---- patterns from niche web research (labeled AI-estimated) -----------
  let niche: string | null = null;
  let pulse: (PulseRow & { group: string })[] = [];
  try {
    const { data: prof } = await supabase.from("profiles").select("niche").eq("user_id", user.id).maybeSingle();
    niche = prof?.niche ?? null;
    if (niche) {
      const { data: trendRow } = await supabase.from("niche_trends").select("data").eq("niche", niche).maybeSingle();
      const intel = (trendRow?.data ?? null) as NicheIntel | null;
      if (intel?.pulse) {
        pulse = [
          ...(intel.pulse.formats ?? []).map((r) => ({ ...r, group: "Format" })),
          ...(intel.pulse.hooks ?? []).map((r) => ({ ...r, group: "Hook" })),
          ...(intel.pulse.topics ?? []).map((r) => ({ ...r, group: "Topic" })),
        ]
          .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
          .slice(0, 5);
      }
    }
  } catch {
    /* trends simply absent */
  }

  // ---- advantages / gaps (measured from the user's own data only) --------
  type Point = { title: string; body: string };
  const advantages: Point[] = [];
  const gapsList: Point[] = [];
  const allMedian = median(all.map(engagementOf));
  if (enough && allMedian != null && allMedian > 0) {
    const byType = new Map<string, IgMediaItem[]>();
    for (const p of all) byType.set(p.media_type ?? "IMAGE", [...(byType.get(p.media_type ?? "IMAGE") ?? []), p]);
    const reelMed = median((byType.get("VIDEO") ?? []).map(engagementOf));
    if (reelMed != null && reelMed / allMedian >= 1.2) {
      advantages.push({ title: "Strong Reel performance", body: `Your Reels run ${fmtMult(reelMed / allMedian)} your overall median engagement (${byType.get("VIDEO")!.length} Reels of your last ${all.length} posts).` });
    }
    const captioned = all.filter((p) => (p.caption ?? "").trim()).length;
    if (captioned / all.length >= 0.9) {
      advantages.push({ title: "High caption consistency", body: `${Math.round((captioned / all.length) * 100)}% of your last ${all.length} posts carry captions the algorithm can index.` });
    }
    const top = Math.max(...all.map(engagementOf));
    if (top / allMedian >= 2) {
      advantages.push({ title: "Proven outlier content", body: `Your best post runs ${fmtMult(top / allMedian)} your median — you've already made content that breaks out.` });
    }

    const freq30 = postsPerWeek(all.map((p) => p.timestamp), 30);
    if (freq30 != null && freq30 < 2) {
      gapsList.push({ title: "Posting frequency", body: `You published ${freq30.toFixed(1)} post${freq30 >= 1.05 ? "s" : ""}/week over the last 30 days. 3–5/week is common growth guidance (a general benchmark — not competitor data).` });
    }
    const bestFmt = [...byType.entries()].map(([t, g]) => ({ t, m: median(g.map(engagementOf)) ?? 0, n: g.length })).sort((a, b) => b.m - a.m)[0];
    if (bestFmt && bestFmt.m / allMedian > 1.2 && bestFmt.n / all.length < 0.5) {
      const name = bestFmt.t === "VIDEO" ? "Reels" : bestFmt.t === "CAROUSEL_ALBUM" ? "Carousels" : "Static posts";
      gapsList.push({ title: "Format mix", body: `${name} run ${fmtMult(bestFmt.m / allMedian)} your median but are only ${Math.round((bestFmt.n / all.length) * 100)}% of your recent posts.` });
    }
    const uncap = all.length - captioned;
    if (uncap > 0) {
      gapsList.push({ title: "Uncaptioned posts", body: `${uncap} of your last ${all.length} posts have no caption — search and SOCIA can't index them.` });
    }
  }

  // ---- recommendations: max 3, each traced to a real computation ---------
  type Rec = { chip: string; tone: string; title: string; body: string; cta: string; href: string };
  const recs: Rec[] = [];
  const freq30 = postsPerWeek(all.map((p) => p.timestamp), 30);
  if (freq30 != null && freq30 < 2) {
    recs.push({
      chip: "HIGH PRIORITY", tone: "hi", title: "Increase posting frequency",
      body: `You averaged ${freq30.toFixed(1)} post${freq30 >= 1.05 ? "s" : ""}/week over the last 30 days. 3–5/week is common growth guidance (general benchmark, not competitor data).`,
      cta: "Open content plan", href: "/tool",
    });
  }
  const risingPattern = pulse.find((p) => p.change_pct > 0);
  if (risingPattern) {
    recs.push({
      chip: "OPPORTUNITY", tone: "opp", title: `${risingPattern.label} is gaining momentum`,
      body: `${risingPattern.group} with an AI-estimated +${Math.abs(risingPattern.change_pct)}% momentum in ${niche ?? "your niche"}, from SOCIA's web research — not measured platform data.`,
      cta: "Build a post around it", href: `/chat?q=${encodeURIComponent(`"${risingPattern.label}" is gaining momentum in my niche. Give me one concrete post idea using it: hook, structure, and caption.`)}`,
    });
  }
  if (recs.length < 3 && gapsList.length) {
    // Only a gap that isn't already covered by another recommendation —
    // fewer than three honest recommendations beats a repeated one.
    const g = gapsList.find(
      (x) => !recs.some((r) => r.title.toLowerCase().includes(x.title.toLowerCase())),
    );
    if (g) {
      recs.push({ chip: "CONSISTENCY", tone: "con", title: g.title, body: g.body, cta: "Get specific ideas", href: "/chat" });
    }
  }

  // Real public stats for tracked YouTube channels, fetched once on the server
  // (cached upstream) so the strip and the breakdown table agree exactly.
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

  // Strongest discovered accounts the user isn't already tracking. Local and
  // direct competitors first — "who am I competing against" is answered by the
  // pizzeria down the road before it's answered by a national channel.
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
  });

  for (const t of tracked) {
    const yt = t.platform === "youtube" ? ytStats[t.handle] : undefined;
    const live = yt?.found ? yt : null;
    leaderRows.push({
      id: `${t.platform}:${t.handle}`,
      platform: t.platform === "youtube" ? "youtube" : t.platform === "facebook" ? "facebook" : "instagram",
      handle: t.handle,
      name: live?.title ?? `@${t.handle}`,
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
    });
  }

  const inLeader = new Set(leaderRows.map((r) => `${r.platform}:${r.handle.toLowerCase()}`));
  for (const sg of suggested) {
    const key = `${sg.platform}:${(sg.handle ?? "").toLowerCase()}`;
    if (!sg.handle || inLeader.has(key)) continue;
    inLeader.add(key);
    const isYt = sg.platform === "youtube";
    leaderRows.push({
      id: key,
      platform: isYt ? "youtube" : sg.platform === "facebook" ? "facebook" : "instagram",
      handle: sg.handle,
      name: sg.displayName ?? `@${sg.handle}`,
      avatar: sg.profileImage,
      url: sg.profileUrl,
      isYou: false,
      tracked: false,
      classification: sg.classification,
      audience: sg.followers != null ? cell(sg.followers, "public_api") : absent(isYt ? "unknown" : "connection_needed"),
      // Discovery lists an account; it does not read that account's posts.
      // Those cells fill in once the account is tracked and fetched.
      engagement: absent(isYt ? "unknown" : "connection_needed"),
      cadence: absent(isYt ? "unknown" : "connection_needed"),
      medianViews: absent(isYt ? "unknown" : "connection_needed"),
      momentum: absent("unavailable"),
    });
  }

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="cp4">
        {/* 1 — header */}
        <div className="cp4-head db2-rise">
          <div>
            <h1>Competitor Intelligence</h1>
            <p>See who is winning your niche, why they&apos;re winning, and what you should do next.</p>
            {lastRun && (
              <span className="cw-status">
                <i /> Live competitor intelligence · refreshed {agoText(lastRun)}
              </span>
            )}
          </div>
          <div className="cp4-controls">
            <span className="cp4-chipset" role="group" aria-label="Platform">
              <span className="cp4-chip on" title="Facebook joins when a Page is connected.">Instagram</span>
            </span>
            <span className="cp4-chipset" role="group" aria-label="Date range">
              {[7, 30, 90].map((d) => (
                <Link key={d} href={`/competitors?range=${d}`} className={`cp4-chip${days === d ? " on" : ""}`}>
                  {d}D
                </Link>
              ))}
            </span>
            <ExportButton />
            <ManageCompetitors initial={tracked} />
          </div>
        </div>

        <CompetitorWorkspace rows={leaderRows} />

        {/* 4 — discovery: content, patterns and accounts SOCIA found */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "180ms" }}>
          <CompetitorDiscovery
            trackedKeys={tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`)}
            ownHandle={snap?.username ?? null}
          />
        </section>

        {/* Instagram connection — compact, and only while it is required */}
        {tracked.some((t) => t.platform === "instagram") && (
          <IgCompetitorData hasTracked />
        )}

        {/* 8 — recommendations */}
        {recs.length > 0 && (
          <section className="cp4-sec db2-rise" style={{ animationDelay: "420ms" }}>
            <div className="cp4-sec-head">
              <h2>Your next moves</h2>
              <small>Each move traces to a number measured above</small>
            </div>
            <div className="cp4-recs">
              {recs.map((r) => {
                const Ico = r.tone === "hi" ? CalendarDays : r.tone === "opp" ? Zap : Type;
                return (
                  <article className={`cp4-rec ${r.tone}`} key={r.title}>
                    <small className="cp4-rec-chip">{r.chip}</small>
                    <span className="cp4-rec-ico"><Ico size={15} /></span>
                    <b>{r.title}</b>
                    <p>{r.body}</p>
                    <Link href={r.href} className="cp4-rec-cta">{r.cta} <ArrowRight size={12} /></Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
