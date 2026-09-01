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

    // Rows stored before name-matching existed can still hold the same
    // business twice ("Mozzarella Pizzeria" / "Mozzarella (Hermitage)"), so
    // collapse on read as well as at discovery time. First wins, and the sort
    // above means that is the better-classified one.
    const seenName = new Set<string>();
    suggested = suggested
      .filter((sg) => {
        const k = `${sg.platform}:${nameKey(sg.displayName ?? sg.handle)}`;
        if (!nameKey(sg.displayName ?? sg.handle)) return true;
        if (seenName.has(k)) return false;
        seenName.add(k);
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

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="cp4">
        {/* 1 — header */}
        <div className="cp4-head db2-rise">
          <div>
            <h1>Competitor Intelligence</h1>
            <p>See who&apos;s winning in your niche, what they&apos;re doing differently, and where you can gain ground.</p>
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

        {/* 2 — who you're competing against */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "60ms" }}>
          <div className="cp4-sec-head">
            <h2>Who you&apos;re competing against</h2>
            <small>Your live numbers, the accounts you track, and the strongest competitors SOCIA found. Metrics appear only where a platform publishes them.</small>
          </div>
          <CompetitorStrip you={youStrip} tracked={tracked} ytStats={ytStats} suggested={suggested} />
        </section>

        {/* 3 — how you compare */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "120ms" }}>
          <div className="cp4-sec-head">
            <h2>How you compare</h2>
            <small>Last {days} days · your column is live Instagram data</small>
          </div>
          <div className="cp4-tablewrap">
            <table className="cp4-table">
              <thead>
                <tr><th>Metric</th><th>You{snap?.username ? ` · @${snap.username}` : ""}</th><th>Tier benchmark</th><th>Top competitor</th><th>Position</th></tr>
              </thead>
              <tbody>
                {compareRows.map((r) => {
                  const bench = benchmarkFor(r.label, followers);
                  const pos = positions[r.label];
                  return (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="cp4-you" title={r.tip}>{r.you}</td>
                      <td className={bench ? undefined : "cp4-na"} title={bench?.note}>
                        {bench ? bench.value : "—"}
                      </td>
                      <td className="cp4-na">—</td>
                      <td>
                        {pos && pos.tone !== "none" ? (
                          <span className={`cp4-pos ${pos.tone}`} title={pos.detail}>{pos.text}</span>
                        ) : (
                          <span className="cp4-pos">No verified data</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="cp4-note">
            <Info size={11} /> {BENCHMARK_ATTRIBUTION} Top-competitor stays empty rather than
            estimated, and fills in automatically if platforms ever open public data.
          </p>
        </section>

        {/* 4 — discovery: content, patterns and accounts SOCIA found */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "180ms" }}>
          <CompetitorDiscovery
            trackedKeys={tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`)}
            ownHandle={snap?.username ?? null}
          />
        </section>

        <div>
          {/* 6 — competitive position */}
          <section className="cp4-sec db2-rise" style={{ animationDelay: "300ms" }}>
            <div className="cp4-sec-head">
              <h2>Your competitive position</h2>
              <small>Measured from your own synced posts</small>
            </div>
            {advantages.length || gapsList.length ? (
              <div className="cp4-pos-grid">
                <div>
                  <small className="cp4-pos-label adv">YOUR ADVANTAGES</small>
                  <ul>
                    {advantages.map((a) => (
                      <li key={a.title}><CheckCircle2 size={14} className="cp4-adv-ico" /><span><b>{a.title}</b><p>{a.body}</p></span></li>
                    ))}
                    {advantages.length === 0 && <li className="cp4-empty">No measured advantage stands out yet.</li>}
                  </ul>
                </div>
                <div>
                  <small className="cp4-pos-label gap">YOUR GAPS</small>
                  <ul>
                    {gapsList.map((g) => (
                      <li key={g.title}><AlertTriangle size={14} className="cp4-gap-ico" /><span><b>{g.title}</b><p>{g.body}</p></span></li>
                    ))}
                    {gapsList.length === 0 && <li className="cp4-empty">No measurable gaps right now.</li>}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="cp4-empty">SOCIA needs at least 5 synced posts to measure advantages and gaps honestly.</p>
            )}
          </section>
        </div>

        {/* 7 — competitor breakdown */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "360ms" }}>
          <div className="cp4-sec-head">
            <h2>Competitor breakdown</h2>
            <small>Click a competitor for its detail view</small>
          </div>
          <div className="cp4-tablewrap">
            <table className="cp4-table cp4-btable">
              <thead>
                <tr><th>Account</th><th>Followers / subs</th><th>Eng. rate</th><th>Posts / week</th><th>Median views</th><th>Source</th><th></th></tr>
              </thead>
              <tbody>
                <tr className="cp4-yourow">
                  <td>
                    {youStrip.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="cp4-face sm" src={youStrip.avatar} alt="" width={26} height={26} />
                    ) : <span className="cp4-face ph sm">Y</span>}
                    <b>@{snap?.username ?? "you"}</b><span className="cp4-tag you">YOU</span>
                  </td>
                  <td>{followers != null ? fmtNum(followers) : "—"}</td>
                  <td>{rate != null ? `${rate.toFixed(1)}%` : "—"}</td>
                  <td>{freq.toFixed(1)}</td>
                  <td>{medViews != null ? fmtNum(Math.round(medViews)) : "—"}</td>
                  <td><span className="cp4-srcnote" title="Your authenticated Instagram data.">Your account</span></td>
                  <td></td>
                </tr>
                <BreakdownRows tracked={tracked} ytStats={ytStats} />
              </tbody>
            </table>
          </div>
          {tracked.length === 0 && (
            <p className="cp4-empty">Track competitors with the button above — SOCIA links their public profiles and flags them in niche research.</p>
          )}
        </section>

        {/* 7b — Instagram competitor data via Business Discovery */}
        <section className="cp4-sec db2-rise" style={{ animationDelay: "400ms" }}>
          <div className="cp4-sec-head">
            <h2>Instagram competitor data</h2>
            <small>Public Business Discovery data, available once a linked Facebook Page is connected</small>
          </div>
          <IgCompetitorData hasTracked={tracked.some((t) => t.platform === "instagram")} />
        </section>

        {/* 8 — recommendations */}
        {recs.length > 0 && (
          <section className="cp4-sec db2-rise" style={{ animationDelay: "420ms" }}>
            <div className="cp4-sec-head">
              <h2>What SOCIA recommends this week</h2>
              <small>Each recommendation traces to a computation shown above</small>
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
