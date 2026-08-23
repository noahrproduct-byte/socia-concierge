import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Play,
  Layers,
  Image as ImageIcon,
  Clock,
  CalendarDays,
  Type,
  Zap,
  Activity,
  AlignLeft,
  Info,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { ExportButton, NicheViral } from "@/components/CompetitorsBoard";
import { Reveal } from "@/components/AnalyticsCharts";
import CountUp from "@/components/CountUp";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import {
  engagementOf,
  median,
  outlierMultiplier,
  pctChange,
  postsPerWeek,
  trendDirection,
  engagementRate,
  fmtMult,
} from "@/lib/metrics";
import type { BrandDetail } from "@/lib/profile";

export const metadata = { title: "Competitors — SOCIA" };

// Everything on this page is either computed from the user's own synced
// posts via lib/metrics, or (the viral section) real posts found by live
// web search. No fictional data remains.
const FMT: Record<string, { label: string; singular: string; chip: string }> = {
  VIDEO: { label: "Reels", singular: "Reel", chip: "REEL" },
  CAROUSEL_ALBUM: { label: "Carousels", singular: "Carousel", chip: "CAROUSEL" },
  IMAGE: { label: "Static posts", singular: "Static post", chip: "STATIC" },
};
const FMT_ICON: Record<string, LucideIcon> = {
  VIDEO: Play,
  CAROUSEL_ALBUM: Layers,
  IMAGE: ImageIcon,
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function CompetitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);
  const posts: IgMediaItem[] = snap?.media ?? [];
  const N = posts.length;
  const enough = N >= 5;
  const synced = snap?.last_synced_at ? ago(snap.last_synced_at) : null;

  let strategist: BrandDetail["strategist"] | undefined;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    strategist = (prof?.brand_detail as BrandDetail | null)?.strategist;
  } catch {
    // fine — frequency gap falls back to general guidance
  }

  // ---- central calculations (lib/metrics) --------------------------------
  const engs = posts.map(engagementOf);
  const overallMedian = median(engs);
  const byType = new Map<string, IgMediaItem[]>();
  for (const p of posts) {
    const t = p.media_type ?? "IMAGE";
    byType.set(t, [...(byType.get(t) ?? []), p]);
  }
  const typeMedian = (t: string) => median((byType.get(t) ?? []).map(engagementOf));

  const totalLikes = posts.reduce((a, p) => a + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((a, p) => a + (p.comments_count ?? 0), 0);
  const totalEng = totalLikes + totalComments;

  // ---- format performance rows -------------------------------------------
  type TrendRow = {
    t: string;
    label: string;
    note: string;
    mult: string;
    dir: "up" | "down" | "flat";
    status: string;
    spark: number[] | null;
  };
  const trendRows: TrendRow[] = [];
  if (enough && overallMedian && overallMedian > 0) {
    for (const [t, group] of byType) {
      if (!FMT[t]) continue;
      const m = typeMedian(t);
      if (m == null) continue;
      const sorted = [...group].sort(
        (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
      );
      const series = sorted.map(engagementOf);
      const half = Math.floor(series.length / 2);
      const dir =
        series.length >= 4 ? trendDirection(series.slice(half), series.slice(0, half)) : null;
      trendRows.push({
        t,
        label: FMT[t].label,
        note: `Median of your ${group.length} ${FMT[t].label.toLowerCase()}`,
        mult: fmtMult(m / overallMedian),
        dir: dir ?? "flat",
        status: dir === "up" ? "Rising" : dir === "down" ? "Declining" : dir === "flat" ? "Stable" : "Low sample",
        spark: series.length >= 3 ? series.slice(-7) : null,
      });
    }
    trendRows.sort((a, b) => parseFloat(b.mult) - parseFloat(a.mult));
  }

  // ---- strengths (all defined shares of the user's own data) -------------
  type Strength = { Ico: LucideIcon; tone: string; title: string; body: string; pct: number; basis: string };
  const strengths: Strength[] = [];
  if (enough && overallMedian != null && overallMedian > 0) {
    const topQ = [...posts]
      .sort((a, b) => engagementOf(b) - engagementOf(a))
      .slice(0, Math.max(3, Math.ceil(N / 4)));
    const counts = new Map<string, number>();
    for (const p of topQ) {
      const t = p.media_type ?? "IMAGE";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const [topFmt, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topShare = Math.round((topCount / topQ.length) * 100);
    const topRatio = (typeMedian(topFmt) ?? 0) / overallMedian;
    if (FMT[topFmt]) {
      strengths.push({
        Ico: Zap,
        tone: "purple",
        title: `${FMT[topFmt].label} drive your wins`,
        body: `${topShare}% of your top posts are ${FMT[topFmt].label.toLowerCase()}${topRatio > 1 ? ` — they run ${fmtMult(topRatio)} your overall median` : ""}.`,
        pct: topShare,
        basis: `Top posts = your top quartile by engagement, from your last ${N} posts.`,
      });
    }
    const stable = engs.filter((e) => e >= overallMedian * 0.5 && e <= overallMedian * 1.5).length;
    const stableShare = Math.round((stable / N) * 100);
    strengths.push({
      Ico: Activity,
      tone: "blue",
      title: "Consistent baseline",
      body: `${stableShare}% of your posts land within ±50% of your median — a stable base to build on.`,
      pct: stableShare,
      basis: `Share of your last ${N} posts with engagement between 0.5× and 1.5× your median.`,
    });
    const captioned = posts.filter((p) => (p.caption ?? "").trim().length > 0).length;
    const capShare = Math.round((captioned / N) * 100);
    strengths.push({
      Ico: AlignLeft,
      tone: "green",
      title: "Caption coverage",
      body: `${capShare}% of your posts carry captions SOCIA and the algorithm can learn from.`,
      pct: capShare,
      basis: `Share of your last ${N} posts with a non-empty caption.`,
    });
  }

  // ---- gaps (measurable differences only) --------------------------------
  type Gap = { Ico: LucideIcon; title: string; body: string; impact: string; tone: "hi" | "med"; cta: string; href: string };
  const gaps: Gap[] = [];
  if (enough) {
    const freq = postsPerWeek(posts.map((p) => p.timestamp), 30);
    if (freq != null) {
      const target = strategist?.frequency;
      gaps.push({
        Ico: CalendarDays,
        title: "Posting cadence",
        body: `You averaged ${freq.toFixed(1)} post${freq >= 1.05 ? "s" : ""}/week over the last 30 days.${
          target ? ` Your target: ${target}.` : " A 4–5×/week cadence is common guidance for growth accounts (general benchmark, not competitor data)."
        }`,
        impact: freq < 2 ? "High impact" : "Medium impact",
        tone: freq < 2 ? "hi" : "med",
        cta: "Plan more content",
        href: "/tool",
      });
    }
    if (overallMedian && overallMedian > 0) {
      const best = trendRows[0];
      if (best) {
        const share = Math.round(((byType.get(best.t)?.length ?? 0) / N) * 100);
        const ratio = (typeMedian(best.t) ?? 0) / overallMedian;
        if (ratio > 1.2 && share < 50) {
          gaps.push({
            Ico: Clock,
            title: `Lean into ${best.label.toLowerCase()}`,
            body: `${best.label} run ${fmtMult(ratio)} your median but are only ${share}% of your last ${N} posts.`,
            impact: "High impact",
            tone: "hi",
            cta: "Turn this into a post",
            href: "/tool",
          });
        }
      }
    }
    const uncaptioned = posts.filter((p) => !(p.caption ?? "").trim()).length;
    if (uncaptioned > 0) {
      gaps.push({
        Ico: Type,
        title: "Caption every post",
        body: `${uncaptioned} of your last ${N} posts have no caption — SOCIA (and search) can't index them.`,
        impact: "Medium impact",
        tone: "med",
        cta: "Get caption ideas",
        href: "/chat",
      });
    }
  }

  // ---- your performance ---------------------------------------------------
  const rate = engagementRate(posts, snap?.followers_count ?? null);
  const half = Math.floor(N / 2);
  const chrono = [...posts].sort(
    (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
  );
  // Median-based so a single viral post can't distort the trend.
  const olderMed = half >= 2 ? median(chrono.slice(0, half).map(engagementOf)) : null;
  const recentMed = N - half >= 2 ? median(chrono.slice(half).map(engagementOf)) : null;
  const engDelta = recentMed != null && olderMed != null ? pctChange(recentMed, olderMed) : null;

  const gaugeHalf = Math.PI * 62;
  const gaugeFrac = rate != null ? Math.max(0, Math.min(1, rate / 10)) : 0;

  // ---- smart takeaway (templated from the calculations above) ------------
  let takeaway: string;
  if (!snap) {
    takeaway = "Connect your Instagram and SOCIA turns your real numbers into a weekly takeaway.";
  } else if (!enough) {
    takeaway = `SOCIA has ${N} synced post${N === 1 ? "" : "s"} so far — it needs 5 to start calculating honest takeaways.`;
  } else {
    const best = trendRows[0];
    const bestRatio = best && overallMedian ? (typeMedian(best.t) ?? 0) / overallMedian : null;
    takeaway =
      best && bestRatio && bestRatio > 1.1
        ? `${best.label} are doing the heavy lifting — ${fmtMult(bestRatio)} your overall median across your last ${N} posts. Double down there this week.`
        : `Your formats perform evenly across your last ${N} posts — your biggest lever is cadence and stronger openers.`;
  }

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="cp3">
        {/* header */}
        <div className="cp3-head db2-rise">
          <div>
            <small className="cp3-eyebrow">Competitor intelligence</small>
            <h1>
              Competitors <Sparkles size={19} className="cp3-spark-ico" />
            </h1>
            <p>Track what&apos;s working for your competitors and find your edge.</p>
          </div>
          <div className="cp3-controls">
            <ExportButton />
          </div>
        </div>

        <div className="cp3-cols">
          {/* viral posts from other creators in the niche — real, web-found */}
          <section className="cp3-outcard">
            <div className="cp3-card-head">
              <h3>
                Viral in your niche{" "}
                <span
                  className="cp3-info"
                  title="Real short-form posts by other creators, found by live web search and linked to the originals. View counts appear only when the platform page reported them; the 'why' line is AI interpretation."
                >
                  <Info size={12} />
                </span>
              </h3>
              <span className="cp3-filter">
                Other creators · not your account{synced ? ` · your data synced ${synced}` : ""}
              </span>
            </div>
            <NicheViral />
          </section>

          {/* center intelligence column */}
          <div className="cp3-center">
            <Reveal className="cp3-panel">
              <div className="cp3-card-head">
                <h3>
                  Your format performance{" "}
                  <span
                    className="cp3-info"
                    title="Each format's median engagement vs your overall median, from your synced posts. Trend compares the newer half of that format with the older half."
                  >
                    <Info size={12} />
                  </span>
                </h3>
                <Link href="/analytics" className="link-mini">View all</Link>
              </div>
              {trendRows.length > 0 ? (
                <ul className="cp3-trends">
                  {trendRows.map(({ t, label, note, mult, dir, status, spark }) => {
                    const Ico = FMT_ICON[t] ?? Play;
                    const W = 74;
                    const H = 22;
                    let pts = "";
                    if (spark) {
                      const mx = Math.max(...spark);
                      const mn = Math.min(...spark);
                      pts = spark
                        .map((v, i) => `${(i / (spark.length - 1)) * W},${H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6)}`)
                        .join(" ");
                    }
                    return (
                      <li className="cp3-trend" key={t}>
                        <span className={`cp3-trend-ico ${dir}`}><Ico size={14} /></span>
                        <span className="cp3-trend-meta">
                          <b>{label}</b>
                          <small>{note}</small>
                        </span>
                        <span className="cp3-trend-mult" title="This format's median engagement ÷ your overall median">
                          <b>{mult}</b>
                          <small>vs your median</small>
                        </span>
                        {spark ? (
                          <svg viewBox={`0 0 ${W} ${H}`} className="cp3-trend-spark" preserveAspectRatio="none" aria-hidden>
                            <polyline className={`cp3-tline ${dir}`} points={pts} fill="none" strokeWidth="1.6" strokeLinejoin="round" pathLength={100} />
                          </svg>
                        ) : (
                          <span className="cp3-trend-spark" aria-hidden />
                        )}
                        <span className={`cp3-status ${dir}`}>{status}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cp3-nodata">
                  {snap ? "Not enough history yet — needs at least 5 synced posts." : "Connect your Instagram to see which formats work for you."}
                </p>
              )}
            </Reveal>

            <Reveal className="cp3-panel" delay={90}>
              <div className="cp3-card-head">
                <h3>
                  Gaps to close{" "}
                  <span className="cp3-info" title="Measured from your own posts. Competitor comparisons arrive with live tracking.">
                    <Info size={12} />
                  </span>
                </h3>
                <span className="cp3-filter">High impact first</span>
              </div>
              {gaps.length > 0 ? (
                <ul className="cp3-gaps">
                  {gaps.map(({ Ico, title, body, impact, tone, cta, href }, i) => (
                    <li className="cp3-gap" key={title}>
                      <span className="cp3-gap-num">{String(i + 1).padStart(2, "0")}</span>
                      <span className="cp3-gap-meta">
                        <b><Ico size={13} /> {title}</b>
                        <small>{body}</small>
                        <em className={`cp3-impact ${tone}`}><i /> {impact}</em>
                      </span>
                      <Link href={href} className="cp3-gap-cta">
                        {cta} <ArrowRight size={12} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cp3-nodata">
                  {snap ? "No measurable gaps in your recent posts." : "Connect your Instagram to get measured gaps."}
                </p>
              )}
              <Link href="/niche" className="cp3-viewmore">
                View all opportunities <ArrowRight size={13} />
              </Link>
            </Reveal>
          </div>

          {/* right intelligence column */}
          <aside className="cp3-right">
            <Reveal className="cp3-panel" delay={60}>
              <div className="cp3-card-head">
                <h3>
                  Strengths you can leverage{" "}
                  <span className="cp3-info" title="Defined shares of your own recent posts — hover each bar for the exact formula.">
                    <Info size={12} />
                  </span>
                </h3>
              </div>
              {strengths.length > 0 ? (
                <ul className="cp3-strengths">
                  {strengths.map(({ Ico, tone, title, body, pct, basis }) => (
                    <li className="cp3-str" key={title}>
                      <span className={`cp3-str-ico ${tone}`}><Ico size={14} /></span>
                      <span className="cp3-str-meta">
                        <b>{title}</b>
                        <small>{body}</small>
                        <span className="cp3-str-barrow" title={basis}>
                          <span className="cp3-str-bar">
                            <i className={tone} style={{ width: `${pct}%` }} />
                          </span>
                          <em className="cp3-str-pct">{pct}%</em>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cp3-nodata">
                  {snap ? "Not enough history yet — needs at least 5 synced posts." : "Connect your Instagram to see your strengths."}
                </p>
              )}
              <Link href="/analytics" className="cp3-viewmore">
                See full benchmark <ArrowRight size={13} />
              </Link>
            </Reveal>

            <Reveal className="cp3-panel cp3-niche" delay={130}>
              <div className="cp3-card-head">
                <h3>
                  Your performance{" "}
                  <span
                    className="cp3-info"
                    title={`Average per-post engagement (likes + comments) ÷ your followers, from your last ${N} posts. Competitor benchmarks arrive with live tracking.`}
                  >
                    <Info size={12} />
                  </span>
                </h3>
              </div>
              {rate != null ? (
                <>
                  <div className="cp3-gauge">
                    <svg viewBox="0 0 148 84" aria-hidden>
                      <path d="M 12 78 A 62 62 0 0 1 136 78" fill="none" stroke="#ede9fe" strokeWidth="11" strokeLinecap="round" />
                      <path
                        className="cp3-gauge-fill"
                        d="M 12 78 A 62 62 0 0 1 136 78"
                        fill="none"
                        stroke="url(#cp3g)"
                        strokeWidth="11"
                        strokeLinecap="round"
                        strokeDasharray={gaugeHalf}
                        style={{ ["--target" as string]: gaugeHalf * (1 - gaugeFrac) }}
                      />
                      <defs>
                        <linearGradient id="cp3g" x1="0" y1="1" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#4c86ff" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="cp3-gauge-val">
                      <b><CountUp value={`${rate.toFixed(1)}%`} /></b>
                      <small>Avg. engagement rate</small>
                    </div>
                    <span className="cp3-gauge-min">0%</span>
                    <span className="cp3-gauge-max">10%</span>
                  </div>
                  {engDelta != null && (
                    <p
                      className={`cp3-gauge-delta${engDelta < 0 ? " down" : ""}`}
                      title="Median engagement of the newer half of your posts vs the older half — medians so one viral post can't distort it."
                    >
                      {engDelta >= 0 ? "▲" : "▼"} {Math.abs(engDelta).toFixed(0)}% vs your earlier posts
                    </p>
                  )}
                  <div className="cp3-niche-kpis">
                    <div className="cp3-nkpi" title={`Sum of likes + comments across your last ${N} posts`}>
                      <b><CountUp value={totalEng.toLocaleString("en-US")} /></b>
                      <small>Engagements (last {N} posts)</small>
                    </div>
                    <div className="cp3-nkpi" title="Current follower count from your last sync">
                      <b><CountUp value={(snap?.followers_count ?? 0).toLocaleString("en-US")} /></b>
                      <small>Followers</small>
                    </div>
                  </div>
                </>
              ) : (
                <p className="cp3-nodata">
                  {snap ? "Not enough data for an engagement rate yet." : "Connect your Instagram to benchmark your performance."}
                </p>
              )}
              <Link href="/niche" className="cp3-viewmore">
                View niche trends <ArrowRight size={13} />
              </Link>
            </Reveal>
          </aside>
        </div>

        {/* smart takeaway — templated from the real calculations above */}
        <Reveal className="cp3-takeaway" delay={150}>
          <span className="cp3-take-ico"><Sparkles size={17} /></span>
          <div className="cp3-take-meta" title="Generated from your account's calculated metrics — no invented numbers.">
            <small>Smart takeaway</small>
            <p>{takeaway}</p>
          </div>
          <svg className="cp3-take-viz" viewBox="0 0 150 56" aria-hidden>
            <rect x="8" y="36" width="15" height="16" rx="3" fill="rgba(139,92,246,0.25)" />
            <rect x="33" y="28" width="15" height="24" rx="3" fill="rgba(76,134,255,0.3)" />
            <rect x="58" y="18" width="15" height="34" rx="3" fill="rgba(139,92,246,0.4)" />
            <rect x="83" y="8" width="15" height="44" rx="3" fill="rgba(76,134,255,0.5)" />
            <polyline points="12,30 40,22 66,13 104,4" fill="none" stroke="#8b5cf6" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
            <path d="M104 4 l-6 -1 4 5 z" fill="#8b5cf6" opacity="0.6" />
          </svg>
          <Link href="/tool" className="cp3-take-cta solid">
            <Sparkles size={13} /> See content ideas <ArrowRight size={13} />
          </Link>
        </Reveal>
      </div>
    </AppShell>
  );
}
