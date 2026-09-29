"use client";

// Analytics: see what happened, understand why, find the pattern, see what's
// missing, act. Every figure arrives from the server already computed and
// labelled; the browser only groups, filters and lays out.

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Download, Lightbulb, ArrowRight, Target, Sparkles } from "lucide-react";
import { askSocia } from "@/lib/ask";
import KpiCard from "./ov/KpiCard";
import OverviewChart from "./ov/OverviewChart";
import PointDrawer from "./ov/PointDrawer";
import FollowerChart from "./ov/FollowerChart";
import PostingHeatmap from "./ov/PostingHeatmap";
import GapList from "./ov/GapList";
import EngagementCard from "./ov/EngagementCard";
import Donut from "./ov/Donut";
import ContentRow from "./ov/ContentRow";
import ContentDrawer from "./ov/ContentDrawer";
import ContentLibrary, { type LibraryPost } from "./ContentLibrary";
import { InsightList } from "./ov/Insights";
import BestTimes from "./ov/BestTimes";
import AudienceBars from "./ov/AudienceBars";
import DateRangeSelector from "./DateRangeSelector";
import AccountSwitcher from "./AccountSwitcher";
import Mounted from "./ov/Mounted";
import MultiLineChart, { type OverlayLine } from "./ov/MultiLineChart";
import {
  rankPosts, fmtNum, audienceInsight, seriesBaseline, granularityOptions, bucketize, detectOutliers, bucketTitle,
  GRAPH_METRIC_LABEL,
  type Kpi, type Series, type SeriesPoint, type MetricId, type Insight, type PostCard, type Slice, type PlatformRow, type Granularity, type Bucket, type GraphAccount, type GraphMetric,
} from "@/lib/overview";
import { median } from "@/lib/metrics";
import { summarizeFollowers, inRange as followersInRange, type FollowerPoint, type FollowerGranularity } from "@/lib/followers";
import { buildWindows, type TimedPost } from "@/lib/postingTimes";
import { timingGap, type Gap } from "@/lib/gaps";
import type { EngagementRate, Breakdown, QualityNote } from "@/lib/engagement";
import type { Demographics } from "@/lib/igDemographics";
import { pricingHref, PLANS, type PlanId } from "@/lib/plans";
import { Lock } from "lucide-react";
import "./planRange.css";

/** Which analytics sections the viewer's plan unlocks. A PlanId means the
 *  section is LOCKED and names the plan that opens it; null/absent means open.
 *  Computed on the server from the workspace owner's entitlements. */
export type AnalyticsGate = {
  postingTimes: PlanId | null;
  growth: PlanId | null;
  comparison: PlanId | null;
  deeperInsights: PlanId | null;
  crossPlatform: PlanId | null;
};

/** A tasteful locked panel: what the section is, and the plan that unlocks it.
 *  Never an empty box; the person always sees the feature exists and its value. */
function Locked({ plan, title, blurb, from }: { plan: PlanId; title: string; blurb: string; from: string }) {
  return (
    <div className="av-locked" role="group" aria-label={`${title} (locked)`}>
      <span className="av-locked-ico"><Lock size={16} /></span>
      <div className="av-locked-body">
        <b>{title}</b>
        <p>{blurb}</p>
      </div>
      <Link
        href={pricingHref(plan)}
        className="av-locked-cta"
        onClick={() => {
          fetch("/api/events", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "upgrade_clicked", props: { from } }), keepalive: true,
          }).catch(() => {});
        }}
      >
        Unlock with {PLANS[plan].name}
      </Link>
    </div>
  );
}

export type AnalyticsData = {
  handle: string | null;
  rangeLabel: string;
  rangeDays: number;
  /** UTC date the server rendered on; partial buckets are judged against it. */
  today: string;
  /** Earliest post or snapshot day, for the yearly-grouping gate. */
  firstDataDay: string | null;
  kpis: Kpi[];
  series: Record<MetricId, Series>;
  /** Instagram's new-followers-per-day series inside the range (gains only). */
  gains: SeriesPoint[];
  insights: Insight[];
  gaps: Gap[];
  /**
   * Free only: how many evidence-backed gaps the server found beyond the one
   * in `gaps`. A real count, never an estimate. Undefined on paid plans and
   * whenever there was nothing to hold back, so nothing extra renders.
   */
  lockedGaps?: number;
  /** Longest window the viewer's plan may look back over; ranges beyond it show as locked. */
  maxDays?: number;
  posts: PostCard[];
  library: LibraryPost[];
  baseline: number | null;
  medianViews: number | null;
  breakdown: { slices: Slice[]; metric: "views" | "engagement"; total: number };
  platforms: PlatformRow[];
  demo: Demographics;
  timed: TimedPost[];
  followers: number | null;
  followerPoints: FollowerPoint[];
  engagement: { rate: EngagementRate; breakdown: Breakdown; quality: QualityNote[] };
  formats: Record<string, number>;
  /** Connected accounts the Performance graph can overlay (IG first). Instagram
   *  and YouTube carry real per-day series; Facebook/TikTok are listed but with
   *  no series, so the graph reports "no daily trend" instead of faking a line. */
  graphAccounts: GraphAccount[];
  /** Which sections the plan unlocks. Absent = everything open (e.g. legacy callers). */
  gate?: AnalyticsGate;
};

const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };

const OVERLAY_METRIC_ORDER: GraphMetric[] = ["views", "engagement", "reach", "followers", "watch_time", "net_followers"];
const PLATFORM_TINT: Record<GraphAccount["platform"], string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };

type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content Performance"], ["audience", "Audience"], ["times", "Posting Times"], ["growth", "Growth"]];
const METRICS: MetricId[] = ["views", "engagement", "followers", "reach"];
const FG: { id: FollowerGranularity; label: string }[] = [{ id: "day", label: "Daily" }, { id: "week", label: "Weekly" }, { id: "month", label: "Monthly" }];

const hashTab = (h: string): Tab | null => {
  const id = h.replace(/^#(an-)?/, "");
  if (id === "posts") return "content";
  return (TABS.find(([t]) => t === id)?.[0] as Tab | undefined) ?? null;
};

export default function AnalyticsV3({ d }: { d: AnalyticsData }) {
  const gate = d.gate ?? OPEN_GATE;
  const [tab, setTabState] = useState<Tab>("overview");
  const [metric, setMetric] = useState<MetricId>(d.series.views.provenance === "unavailable" ? "engagement" : "views");
  const [compare, setCompare] = useState(true);
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [fit, setFit] = useState<boolean | null>(null);
  const [fgran, setFgran] = useState<FollowerGranularity>("day");
  const [contentTab, setContentTab] = useState<"top" | "under" | "format" | "breakout">("top");
  const [open, setOpen] = useState<PostCard | null>(null);
  const [point, setPoint] = useState<{ b: Bucket; outlier: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  // Multi-account overlay for the Performance graph. Default = the Instagram
  // account alone, so the section behaves exactly as before until the user picks
  // more accounts.
  const igId = d.graphAccounts[0]?.id ?? "";
  const [acctSel, setAcctSel] = useState<string[]>(igId ? [igId] : []);
  const [gm, setGm] = useState<GraphMetric>("views");

  useEffect(() => {
    setMounted(true);
    const t = hashTab(window.location.hash);
    if (t) setTabState(t);
    if (window.location.hash === "#posts") setTimeout(() => document.getElementById("posts")?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const jumpTab = useCallback((t: "content" | "audience" | "times" | "growth") => setTab(t), [setTab]);

  // Viewer-time-zone items are added after mount only (server is UTC).
  const insights = useMemo(() => {
    if (!mounted) return d.insights;
    const w = audienceInsight(d.timed);
    return w ? [...d.insights, w] : d.insights;
  }, [d.insights, d.timed, mounted]);
  // The timing gap needs the viewer's clock, so it joins after mount. When the
  // server held gaps back (Free), it stays held back too and is counted, so the
  // number on the card is the real number of gaps this account is not seeing.
  const { gaps, lockedGaps } = useMemo(() => {
    if (!mounted) return { gaps: d.gaps, lockedGaps: d.lockedGaps ?? 0 };
    const tg = timingGap(buildWindows(d.timed), d.timed);
    if (d.lockedGaps != null) return { gaps: d.gaps, lockedGaps: d.lockedGaps + (tg ? 1 : 0) };
    return { gaps: tg ? [...d.gaps, tg].sort((a, b) => b.score - a.score).slice(0, 5) : d.gaps, lockedGaps: 0 };
  }, [d.gaps, d.lockedGaps, d.timed, mounted]);

  const series = d.series[metric];
  // ---- multi-account overlay derivations ----
  const selectedGA = useMemo(() => d.graphAccounts.filter((a) => acctSel.includes(a.id)), [d.graphAccounts, acctSel]);
  const isSingleIg = acctSel.length === 1 && acctSel[0] === igId;
  const overlayMetrics = useMemo(() => {
    const keys = new Set<GraphMetric>();
    for (const a of selectedGA) for (const k of Object.keys(a.series) as GraphMetric[]) keys.add(k);
    return OVERLAY_METRIC_ORDER.filter((k) => keys.has(k));
  }, [selectedGA]);
  const gmActive: GraphMetric = overlayMetrics.includes(gm) ? gm : (overlayMetrics[0] ?? "views");
  const overlayLines: OverlayLine[] = useMemo(
    () => selectedGA.filter((a) => a.series[gmActive]).map((a) => { const s = a.series[gmActive]!; return { id: a.id, platform: a.platform, label: a.label, points: s.points, mode: s.mode, trueSeries: s.trueSeries }; }),
    [selectedGA, gmActive],
  );
  const missingAccts = useMemo(() => selectedGA.filter((a) => !a.series[gmActive]), [selectedGA, gmActive]);
  const overlayImpure = overlayLines.some((l) => !l.trueSeries);
  const graphInsights = useMemo(() => {
    if (isSingleIg) return [] as { tone: string; text: string }[];
    const unit = GRAPH_METRIC_LABEL[gmActive].toLowerCase();
    const totals = overlayLines
      .map((l) => ({ label: l.label, total: l.points.reduce((s, p) => s + (p.value ?? 0), 0), has: l.points.some((p) => p.value != null) }))
      .filter((t) => t.has)
      .sort((a, b) => b.total - a.total);
    const out: { tone: string; text: string }[] = [];
    if (totals.length >= 2) out.push({ tone: "up", text: `${totals[0].label} led ${unit} this period.` });
    for (const t of totals) out.push({ tone: "info", text: `${t.label}: ${fmtNum(t.total)} ${unit} in the ${d.rangeLabel.toLowerCase()}.` });
    for (const a of missingAccts) out.push({ tone: "muted", text: `${a.label} has no daily ${unit} series${a.platform === "facebook" ? " — Facebook doesn't provide one" : a.platform === "tiktok" ? " — TikTok isn't connected to time-series data yet" : ""}.` });
    return out;
  }, [isSingleIg, overlayLines, missingAccts, gmActive, d.rangeLabel]);
  const postById = useMemo(() => Object.fromEntries(d.posts.map((p) => [p.id, p])), [d.posts]);
  const postValues = useMemo(() => d.posts.map((p) => (metric === "views" ? p.views : p.engagements)).filter((v): v is number => v != null), [d.posts, metric]);
  const baseline = useMemo(() => seriesBaseline(series, postValues), [series, postValues]);
  const granOptions = useMemo(() => granularityOptions(d.rangeDays, d.firstDataDay, d.today), [d.rangeDays, d.firstDataDay, d.today]);
  useEffect(() => { if (!granOptions.find((g) => g.id === gran)?.enabled) setGran("week"); }, [granOptions, gran]);
  const buckets = useMemo(() => bucketize(series.current, gran, metric === "followers" ? "last" : "sum", d.today), [series, gran, metric, d.today]);
  const outliers = useMemo(() => (metric === "followers" ? new Set<number>() : detectOutliers(buckets.map((b) => b.value))), [buckets, metric]);
  const fitOn = fit ?? outliers.size > 0;
  const totalDelta = series.total != null && series.prevTotal != null && series.prevTotal > 0 ? ((series.total - series.prevTotal) / series.prevTotal) * 100 : null;

  const contentPosts = useMemo(() => {
    if (contentTab === "top") return rankPosts(d.posts, "views", 10);
    if (contentTab === "under") return d.posts.filter((p) => p.multiplier != null && p.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0)).slice(0, 10);
    if (contentTab === "breakout") return d.posts.filter((p) => p.multiplier != null && p.multiplier >= 3).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0));
    const seen = new Map<string, PostCard[]>();
    for (const p of rankPosts(d.posts, "views", d.posts.length)) seen.set(p.format, [...(seen.get(p.format) ?? []), p].slice(0, 3));
    return [...seen.values()].flat();
  }, [contentTab, d.posts]);

  const fPoints = useMemo(() => followersInRange(d.followerPoints, d.series.followers.current[0]?.day ?? "0000", d.today), [d.followerPoints, d.series.followers.current, d.today]);
  const fSummary = useMemo(() => summarizeFollowers(fPoints, d.followerPoints), [fPoints, d.followerPoints]);

  const byFormat = useMemo(() => {
    const g = new Map<string, PostCard[]>();
    for (const p of d.posts) g.set(p.format, [...(g.get(p.format) ?? []), p]);
    return [...g.entries()].map(([f, ps]) => ({
      format: f, n: ps.length,
      views: median(ps.map((p) => p.views).filter((v): v is number => v != null)),
      inter: median(ps.map((p) => p.engagements)),
      rate: median(ps.map((p) => (p.reach ? (p.engagements / p.reach) * 100 : null)).filter((v): v is number => v != null)),
      saves: median(ps.map((p) => p.saves).filter((v): v is number => v != null)),
    })).sort((a, b) => ((b.views ?? b.inter) ?? 0) - ((a.views ?? a.inter) ?? 0));
  }, [d.posts]);

  const periods = useMemo(() => {
    const s = d.series.views.provenance === "unavailable" ? d.series.reach : d.series.views;
    const wk = bucketize(s.current, "week", "sum", d.today).filter((b) => b.value != null && !b.partial);
    const med = median(wk.map((b) => b.value!));
    if (med == null || med <= 0 || wk.length < 4) return { label: s.label, growth: [] as Bucket[], decline: [] as Bucket[], median: null as number | null };
    return { label: s.label, growth: wk.filter((b) => b.value! >= med * 1.5), decline: wk.filter((b) => b.value! <= med * 0.6), median: med };
  }, [d.series, d.today]);
  const milestones = useMemo(() => {
    const out: { day: string; text: string }[] = [];
    const pts = d.followerPoints;
    if (pts.length) out.push({ day: pts[0].day, text: `Follower tracking started at ${pts[0].followers.toLocaleString("en-US")}` });
    for (let i = 1; i < pts.length; i++) {
      const step = pts[i].followers >= 10000 ? 1000 : pts[i].followers >= 1000 ? 100 : 10;
      const a = Math.floor(pts[i - 1].followers / step), b = Math.floor(pts[i].followers / step);
      if (b > a) out.push({ day: pts[i].day, text: `Passed ${(b * step).toLocaleString("en-US")} followers` });
    }
    const brk = d.posts.filter((p) => p.multiplier != null && p.multiplier >= 3);
    for (const p of brk) out.push({ day: p.published.slice(0, 10), text: `Breakout post “${p.title.slice(0, 32)}” (${p.multiplier!.toFixed(p.multiplier! >= 10 ? 0 : 1)}× median)` });
    return out.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 8);
  }, [d.followerPoints, d.posts]);
  const gainsSeries: Series = useMemo(() => ({ metric: "reach", label: "New followers", provenance: d.gains.some((g) => g.value != null) ? "instagram_daily" : "unavailable", note: "New followers per day as reported by Instagram. Counts follows only, not unfollows, so it differs from the net change in your snapshots.", current: d.gains, previous: [], total: null, prevTotal: null }), [d.gains]);

  const fmtDay = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="av">
      <header className="dv-head">
        <div>
          <h1>Analytics</h1>
          <p>See what happened, understand why, and find what your strategy is missing.</p>
        </div>
        <div className="dv-head-actions">
          <Mounted fallback={<span className="ov-ctl-ph" aria-hidden />}>
            <AccountSwitcher />
            <DateRangeSelector maxDays={d.maxDays} />
          </Mounted>
          <a href="/api/export" download className="ov-btn ghost"><Download size={14} /> Export</a>
          <button type="button" className="ov-btn primary" onClick={() => askSocia({ context: { page: "analytics", range: String(d.rangeDays), metric } })}><Sparkles size={14} /> Ask SOCIA</button>
        </div>
      </header>

      <nav className="av-tabs" aria-label="Analytics sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "true" : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {/* ================================================== OVERVIEW */}
      {tab === "overview" && (
        <>
          <div className="ov-kpis four">
            {d.kpis.map((k) => <KpiCard key={k.id} kpi={k} iconLeft showDelta={!gate.comparison} />)}
          </div>
          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="av-perf-h">
                <div className="ov-card-head wrap">
                  <h2 id="av-perf-h">Performance Over Time</h2>
                  <div className="ov-seg" role="tablist" aria-label="Metric">
                    {isSingleIg
                      ? METRICS.map((m) => (
                          <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? "on" : ""} disabled={d.series[m].provenance === "unavailable"} title={d.series[m].note} onClick={() => setMetric(m)}>{d.series[m].label}</button>
                        ))
                      : overlayMetrics.map((m) => (
                          <button key={m} type="button" role="tab" aria-selected={gmActive === m} className={gmActive === m ? "on" : ""} onClick={() => setGm(m)}>{GRAPH_METRIC_LABEL[m]}</button>
                        ))}
                  </div>
                  <div className="av-controls">
                    <div className="ov-seg" role="group" aria-label="Group by">
                      {granOptions.map((g) => (
                        <button key={g.id} type="button" className={gran === g.id ? "on" : ""} disabled={!g.enabled} title={g.enabled ? `Group by ${g.label.toLowerCase()}` : g.why} aria-pressed={gran === g.id} onClick={() => setGran(g.id)}>{g.label}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {d.graphAccounts.length > 1 && !gate.crossPlatform && (
                  <div className="av-accts" role="group" aria-label="Accounts on the graph">
                    <button type="button" className={`av-acct${acctSel.length === d.graphAccounts.length ? " on" : ""}`} onClick={() => setAcctSel(d.graphAccounts.map((a) => a.id))}>All accounts</button>
                    {d.graphAccounts.map((a) => {
                      const on = acctSel.includes(a.id);
                      return (
                        <button key={a.id} type="button" className={`av-acct${on ? " on" : ""}`} aria-pressed={on}
                          onClick={() => setAcctSel((sel) => (sel.includes(a.id) ? (sel.length > 1 ? sel.filter((x) => x !== a.id) : sel) : [...sel, a.id]))}>
                          <span className="av-acct-dot" style={{ background: PLATFORM_TINT[a.platform] }} />{a.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {d.graphAccounts.length > 1 && gate.crossPlatform && (
                  <p className="av-xplat-hint"><Lock size={12} /> Overlay and compare your accounts on one graph with {PLANS[gate.crossPlatform].name}. <Link href={pricingHref(gate.crossPlatform)}>See {PLANS[gate.crossPlatform].name}</Link></p>
                )}

                {isSingleIg ? (
                  <>
                    <div className="av-perf-summary">
                      <b>{series.total != null ? fmtNum(series.total) : "—"}</b>
                      <span>{series.label.toLowerCase()} {metric === "followers" ? "now" : `in the ${d.rangeLabel.toLowerCase()}`}</span>
                      {!gate.comparison && totalDelta != null && <em className={totalDelta >= 0 ? "up" : "down"}>{totalDelta >= 0 ? "↑" : "↓"} {Math.abs(totalDelta).toFixed(1)}% vs. previous period</em>}
                      {!gate.comparison && series.prevTotal == null && series.total != null && <em className="muted">no comparable previous period yet</em>}
                      {baseline && <em className="muted">· {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}</em>}
                      <span className="av-perf-ctl">
                        {!gate.comparison && <button type="button" className={`ov-toggle${compare ? " on" : ""}`} aria-pressed={compare} onClick={() => setCompare((v) => !v)}>vs. previous</button>}
                        {outliers.size > 0 && <button type="button" className={`ov-toggle${fitOn ? " on" : ""}`} aria-pressed={fitOn} title="Scale the axis to your typical range; breakout bars stay visible with their value" onClick={() => setFit(!fitOn)}>Fit typical range</button>}
                      </span>
                    </div>
                    <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison} height={260} fitScale={fitOn} baseline={baseline} postById={postById} today={d.today} onPick={(b, o) => setPoint({ b, outlier: o })} />
                    <p className="ov-source">{series.note}{outliers.size > 0 ? ` ${outliers.size} breakout ${gran}${outliers.size === 1 ? "" : "s"} marked; click a bar to see what drove it.` : " Click a bar to inspect it."}</p>
                  </>
                ) : (
                  <>
                    <MultiLineChart lines={overlayLines} granularity={gran} height={260} unit={GRAPH_METRIC_LABEL[gmActive].toLowerCase()} today={d.today} />
                    <p className="ov-source">
                      {overlayLines.length ? `${GRAPH_METRIC_LABEL[gmActive]} across ${overlayLines.length} account${overlayLines.length === 1 ? "" : "s"}, ${d.rangeLabel.toLowerCase()}.` : "None of the selected accounts report this metric as a daily series."}
                      {overlayImpure ? " Publish-date lines show each post's totals on the day it was posted, not a daily account series; YouTube shows true daily values." : ""}
                      {missingAccts.length ? ` ${missingAccts.map((a) => a.label).join(", ")}: no daily ${GRAPH_METRIC_LABEL[gmActive].toLowerCase()} series.` : ""}
                    </p>
                  </>
                )}
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="av-ins-h">
                <div className="ov-card-head">
                  <h2 id="av-ins-h"><span className="ov-h-ico primary"><Lightbulb size={14} /></span> Key Insights</h2>
                  <button type="button" className="ov-link" onClick={() => askSocia({ context: { page: "analytics", range: String(d.rangeDays), metric }, question: "What am I missing?" })}>Ask</button>
                </div>
                {gate.deeperInsights ? (
                  <>
                    {insights.length > 0 && <InsightList insights={insights.slice(0, 1)} posts={d.posts} compact onTab={jumpTab} />}
                    <Locked
                      plan={gate.deeperInsights}
                      title="What's working, and what to do next"
                      blurb={insights.length > 1
                        ? `SOCIA found ${insights.length - 1} more ${insights.length - 1 === 1 ? "insight" : "insights"} in your data. See every one, plus What Changed and What To Do Next.`
                        : "See What's Working, What Changed and What To Do Next, drawn from your own performance."}
                      from="analytics_insights"
                    />
                  </>
                ) : isSingleIg ? (
                  <InsightList insights={insights.slice(0, 5)} posts={d.posts} compact onTab={jumpTab} />
                ) : graphInsights.length ? (
                  <ul className="av-ginsights">
                    {graphInsights.map((g, i) => <li key={i} className={`av-gins ${g.tone}`}>{g.text}</li>)}
                  </ul>
                ) : (
                  <p className="ov-source">Select accounts to see cross-account insights.</p>
                )}
              </section>
            </aside>
          </div>

          <section className="ov-card av-missing" aria-labelledby="av-gap-h">
            <div className="ov-card-head">
              <h2 id="av-gap-h"><span className="ov-h-ico warning"><Target size={14} /></span> What&apos;s Missing</h2>
              <span className="ov-card-sub">The biggest gaps SOCIA found in your current strategy, ranked by evidence.</span>
            </div>
            <GapList gaps={gaps} onTab={jumpTab} pending={d.posts.length < 5} />
            {lockedGaps > 0 && (
              <div className="pn compact gap-upsell" role="status">
                <div className="pn-body">
                  <p>SOCIA found {lockedGaps} more {lockedGaps === 1 ? "opportunity" : "opportunities"} for this account.</p>
                  <small>Unlock your full strategy with Starter.</small>
                </div>
                <Link
                  href={pricingHref("starter")}
                  className="pn-cta"
                  onClick={() => {
                    fetch("/api/events", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name: "upgrade_clicked", props: { from: "analytics_gaps", locked: lockedGaps } }),
                      keepalive: true,
                    }).catch(() => {});
                  }}
                >
                  See Starter
                </Link>
              </div>
            )}
          </section>

          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="av-content-h">
                <div className="ov-card-head wrap">
                  <h2 id="av-content-h">Content Performance</h2>
                  <div className="ov-seg" role="tablist" aria-label="Content view">
                    {([["top", "Top Content"], ["under", "Underperforming"], ["format", "By Format"], ["breakout", "Breakouts"]] as const).map(([id, label]) => (
                      <button key={id} type="button" role="tab" aria-selected={contentTab === id} className={contentTab === id ? "on" : ""} onClick={() => setContentTab(id)}>{label}</button>
                    ))}
                  </div>
                  <button type="button" className="ov-link" onClick={() => setTab("content")}>All posts <ArrowRight size={13} /></button>
                </div>
                {contentTab === "under" && !contentPosts.length && <div className="ov-empty small">No post in this period fell below 70% of your median. Nothing is underperforming by your own baseline.</div>}
                {contentTab === "breakout" && !contentPosts.length && <div className="ov-empty small">No post reached 3× your median interactions in this period.</div>}
                {contentPosts.length > 0 && <ContentRow posts={contentPosts} onOpen={setOpen} size="lg" />}
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="av-growth-h">
                <div className="ov-card-head">
                  <h2 id="av-growth-h">Audience Growth</h2>
                  <button type="button" className="ov-link" onClick={() => setTab("audience")}>View details</button>
                </div>
                <div className="av-growth-num">
                  <b>{d.followers != null ? d.followers.toLocaleString("en-US") : "—"}</b>
                  <span>Followers</span>
                  {fSummary.net != null && <em className={fSummary.net >= 0 ? "up" : "down"}>{fSummary.net >= 0 ? "+" : "−"}{Math.abs(fSummary.net).toLocaleString("en-US")} <small>{d.rangeLabel.toLowerCase()}</small></em>}
                </div>
                <FollowerChart points={fPoints} granularity="day" height={110} today={d.today} compact />
                <p className="ov-source">{fSummary.statusLine}</p>
              </section>
              <section className="ov-card" aria-labelledby="av-times-h">
                <div className="ov-card-head">
                  <h2 id="av-times-h">Best Times to Post</h2>
                  {!gate.postingTimes && <button type="button" className="ov-link" onClick={() => setTab("times")}>Full heatmap</button>}
                </div>
                {gate.postingTimes ? (
                  <Locked plan={gate.postingTimes} title="Know when to post" blurb="See the weekday-and-hour windows where your own posts have performed best, with the sample size behind every claim." from="analytics_besttimes" />
                ) : (
                  <Mounted fallback={<div className="ov-empty small">Computing in your time zone…</div>}>
                    <BestTimes posts={d.timed} />
                  </Mounted>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {/* ================================================== CONTENT */}
      {tab === "content" && (
        <>
          <section className="ov-card" aria-labelledby="ct-h">
            <div className="ov-card-head wrap">
              <h2 id="ct-h">Content Performance</h2>
              <div className="ov-seg" role="tablist" aria-label="Content view">
                {([["top", "Top Content"], ["under", "Underperforming"], ["format", "By Format"], ["breakout", "Breakouts"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={contentTab === id} className={contentTab === id ? "on" : ""} onClick={() => setContentTab(id)}>{label}</button>
                ))}
              </div>
              <span className="ov-range-label">{d.baseline != null ? `Median post ${Math.round(d.baseline).toLocaleString("en-US")} interactions` : "No baseline yet"}</span>
            </div>
            {contentTab === "under" && !contentPosts.length && <div className="ov-empty small">No post fell below 70% of your median interactions.</div>}
            {contentTab === "breakout" && !contentPosts.length && <div className="ov-empty small">No post reached 3× your median interactions.</div>}
            {contentPosts.length > 0 && <ContentRow posts={contentPosts} onOpen={setOpen} size="lg" />}
          </section>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="ct-break-h">
              <div className="ov-card-head">
                <h2 id="ct-break-h">Content Breakdown</h2>
                <span className="ov-range-label">{d.breakdown.metric === "views" ? "Views" : "Interactions"} by format · {d.rangeLabel}</span>
              </div>
              {d.breakdown.slices.length ? <Donut slices={d.breakdown.slices} total={d.breakdown.total} centerLabel={d.breakdown.metric === "views" ? "Total Views" : "Interactions"} size={150} /> : <div className="ov-empty small">No posts in this period.</div>}
            </section>
            <section className="ov-card" aria-labelledby="ct-fmt-h">
              <div className="ov-card-head">
                <h2 id="ct-fmt-h">Formats compared</h2>
                <span className="ov-range-label">medians · all synced posts</span>
              </div>
              <div className="dsh-tablescroll">
                <table className="dsh-table av-fmt">
                  <thead><tr><th>Format</th><th className="num">Posts</th><th className="num">Median views</th><th className="num">Median interactions</th><th className="num">Median rate</th><th className="num">Median saves</th></tr></thead>
                  <tbody>
                    {byFormat.map((r) => (
                      <tr key={r.format}>
                        <td>{r.format}s{r.n < 3 ? <small className="av-fmt-note"> · too few to compare</small> : null}</td>
                        <td className="num">{r.n}</td>
                        <td className="num">{r.views != null ? fmtNum(Math.round(r.views)) : "—"}</td>
                        <td className="num">{r.inter != null ? fmtNum(Math.round(r.inter)) : "—"}</td>
                        <td className="num">{r.rate != null ? `${r.rate.toFixed(1)}%` : "—"}</td>
                        <td className="num">{r.saves != null ? fmtNum(Math.round(r.saves)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ov-source">Rate = interactions ÷ accounts reached per post. A format needs 3 posts before SOCIA compares it.</p>
            </section>
          </div>
          <section className="ov-card" id="posts" aria-labelledby="ct-all-h">
            <div className="ov-card-head">
              <h2 id="ct-all-h">All posts</h2>
              <span className="ov-range-label">{d.library.length} synced · values exactly as Instagram returned them</span>
            </div>
            <ContentLibrary posts={d.library} embedded />
          </section>
        </>
      )}

      {/* ================================================== AUDIENCE */}
      {tab === "audience" && (
        <>
          <section className="ov-card" aria-labelledby="au-h">
            <div className="ov-card-head wrap">
              <h2 id="au-h">Follower history</h2>
              <div className="ov-seg" role="group" aria-label="Group by">
                {FG.map((g) => <button key={g.id} type="button" className={fgran === g.id ? "on" : ""} aria-pressed={fgran === g.id} onClick={() => setFgran(g.id)}>{g.label}</button>)}
              </div>
              <span className="ov-range-label">{d.rangeLabel}</span>
            </div>
            <div className="au-stats">
              <div><small>Followers now</small><b>{d.followers != null ? d.followers.toLocaleString("en-US") : "—"}</b></div>
              <div><small>Net change</small><b className={fSummary.net == null ? "" : fSummary.net >= 0 ? "up" : "down"}>{fSummary.net == null ? "—" : `${fSummary.net >= 0 ? "+" : "−"}${Math.abs(fSummary.net).toLocaleString("en-US")}`}</b></div>
              <div><small>Growth rate</small><b className={fSummary.growthPct == null ? "" : fSummary.growthPct >= 0 ? "up" : "down"}>{fSummary.growthPct == null ? "—" : `${fSummary.growthPct >= 0 ? "+" : "−"}${Math.abs(fSummary.growthPct).toFixed(2)}%`}</b></div>
              <div><small>Average daily change</small><b>{fSummary.avgDailyNet == null ? "—" : `${fSummary.avgDailyNet >= 0 ? "+" : "−"}${Math.abs(fSummary.avgDailyNet).toFixed(1)}/day`}</b></div>
              <div><small>History</small><b>{fSummary.daysCollected} day{fSummary.daysCollected === 1 ? "" : "s"}</b></div>
            </div>
            <FollowerChart points={fPoints} granularity={fgran} height={220} today={d.today} />
            <div className="au-note">
              <b>{fSummary.statusLine}</b>
              <p>{fSummary.detailLine}{d.followerPoints[0] ? ` Tracking started ${fmtDay(d.followerPoints[0].day)}.` : ""}</p>
            </div>
          </section>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="au-gain-h">
              <div className="ov-card-head">
                <h2 id="au-gain-h">New followers per day</h2>
                <span className="ov-range-label">Instagram · {d.rangeLabel}</span>
              </div>
              <OverviewChart series={gainsSeries} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={180} compact today={d.today} />
              <p className="ov-source">{gainsSeries.note}</p>
            </section>
            <section className="ov-card" aria-labelledby="au-demo-h">
              <div className="ov-card-head">
                <h2 id="au-demo-h">Audience Demographics</h2>
                <span className="ov-range-label">Instagram · current followers</span>
              </div>
              <AudienceBars demo={d.demo} />
            </section>
          </div>
        </>
      )}

      {/* ================================================== POSTING TIMES */}
      {tab === "times" && (
        <section className="ov-card" aria-labelledby="pt-h">
          <div className="ov-card-head">
            <h2 id="pt-h">Posting Times</h2>
            <span className="ov-card-sub">When your own posts have performed best, with the sample behind every claim.</span>
          </div>
          {gate.postingTimes ? (
            <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A full weekday-by-hour heatmap of your own performance, and the best window per format, each backed by its real sample size." from="analytics_times_tab" />
          ) : (
            <Mounted fallback={<div className="ov-empty small">Computing in your time zone…</div>}>
              <PostingHeatmap posts={d.timed} formats={d.formats} />
            </Mounted>
          )}
        </section>
      )}

      {/* ================================================== GROWTH */}
      {tab === "growth" && gate.growth && (
        <section className="ov-card" aria-labelledby="gr-lock-h">
          <div className="ov-card-head"><h2 id="gr-lock-h">Growth</h2><span className="ov-card-sub">How your reach, views, followers and engagement are trending.</span></div>
          <Locked plan={gate.growth} title="Growth analysis" blurb="Trend cards for followers, reach, views and engagement, your strong and weak weeks against your typical week, and milestones as they happen." from="analytics_growth_tab" />
        </section>
      )}
      {tab === "growth" && !gate.growth && (
        <>
          <div className="gr-grid">
            {(["followers", "reach", "views", "engagement"] as MetricId[]).map((m) => {
              const s = d.series[m];
              const delta = s.total != null && s.prevTotal != null && s.prevTotal > 0 ? ((s.total - s.prevTotal) / s.prevTotal) * 100 : null;
              return (
                <section key={m} className="ov-card gr-card" aria-label={`${s.label} trend`}>
                  <div className="ov-card-head">
                    <h2>{s.label} trend</h2>
                    {delta != null && <em className={`gr-delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%</em>}
                  </div>
                  <div className="av-growth-num"><b>{s.total != null ? fmtNum(s.total) : "—"}</b><span>{m === "followers" ? "now" : d.rangeLabel.toLowerCase()}</span></div>
                  {m === "followers" ? (
                    <FollowerChart points={fPoints} granularity={d.rangeDays > 60 ? "week" : "day"} height={150} today={d.today} compact />
                  ) : (
                    <OverviewChart series={s} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={150} compact baseline={seriesBaseline(s, d.posts.map((p) => (m === "views" ? p.views : m === "engagement" ? p.engagements : null)).filter((v): v is number => v != null))} postById={postById} today={d.today} onPick={(b, o) => { setMetric(m); setPoint({ b, outlier: o }); }} />
                  )}
                  <p className="ov-source">{s.note}</p>
                </section>
              );
            })}
          </div>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="gr-eng-h">
              <div className="ov-card-head">
                <h2 id="gr-eng-h">Engagement</h2>
                <span className="ov-range-label">{d.rangeLabel}</span>
              </div>
              <EngagementCard rate={d.engagement.rate} breakdown={d.engagement.breakdown} quality={d.engagement.quality} rangeLabel={d.rangeLabel} />
            </section>
            <div className="av-side">
              <section className="ov-card" aria-labelledby="gr-per-h">
                <div className="ov-card-head">
                  <h2 id="gr-per-h">Growth and decline periods</h2>
                  <span className="ov-range-label">{periods.label} · weekly</span>
                </div>
                {periods.median == null ? (
                  <div className="ov-empty small">Needs at least four complete weeks in the range to compare weeks with your typical week.</div>
                ) : (
                  <ul className="gr-periods">
                    {periods.growth.map((b) => <li key={`g${b.key}`} className="up"><i /><span>{bucketTitle(b, "week")}</span><b>{fmtNum(b.value)}</b><small>{(b.value! / periods.median!).toFixed(1)}× typical week</small></li>)}
                    {periods.decline.map((b) => <li key={`d${b.key}`} className="down"><i /><span>{bucketTitle(b, "week")}</span><b>{fmtNum(b.value)}</b><small>{Math.round((b.value! / periods.median!) * 100)}% of typical week</small></li>)}
                    {!periods.growth.length && !periods.decline.length && <li className="flat"><span>No week ran far above or below your typical week ({fmtNum(Math.round(periods.median))} {periods.label.toLowerCase()}).</span></li>}
                  </ul>
                )}
              </section>
              <section className="ov-card" aria-labelledby="gr-mil-h">
                <div className="ov-card-head"><h2 id="gr-mil-h">Milestones</h2></div>
                {milestones.length ? (
                  <ul className="gr-milestones">
                    {milestones.map((m, i) => <li key={i}><time>{fmtDay(m.day)}</time><span>{m.text}</span></li>)}
                  </ul>
                ) : <div className="ov-empty small">Milestones appear as SOCIA records follower history and breakout posts.</div>}
              </section>
            </div>
          </div>
        </>
      )}

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
      <PointDrawer bucket={point?.b ?? null} isOutlier={point?.outlier ?? false} granularity={tab === "growth" ? (d.rangeDays > 31 ? "week" : "day") : gran} series={series} baseline={baseline} posts={d.posts} onClose={() => setPoint(null)} onAnalyze={(p) => { setPoint(null); setOpen(p); }} />
    </div>
  );
}
