"use client";

// Analytics: see what happened, understand why, find the pattern, see what's
// missing, act. Every figure arrives from the server already computed and
// labelled; the browser only groups, filters and lays out.

import "@/app/(app)/analytics/analytics.css";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Sparkles, Info, Lock, TrendingUp, Minus } from "lucide-react";
import { askSocia } from "@/lib/ask";
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
import Mounted from "./ov/Mounted";
import MultiLineChart, { type OverlayLine } from "./ov/MultiLineChart";
import WhatChanged, { type ChangeItem } from "./ov/WhatChanged";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CardSource,
  Empty,
  KpiCell,
  KpiStrip,
  PlatformMark,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Skeleton,
  Tab as SectionTab,
  TabList,
  TabPanel,
  TableWrap,
  Tabs,
  Unavailable,
} from "@/components/system";
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
import { pricingHref, PLANS, minPlanWithFeature, type PlanId } from "@/lib/plans";

const DASH = String.fromCharCode(0x2014);

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

/** A quiet locked panel: what the section is, and the plan that unlocks it.
 *  Never an empty box; the person always sees the feature exists and its value. */
export function Locked({ plan, title, blurb, from }: { plan: PlanId; title: string; blurb: string; from: string }) {
  return (
    <div className="s-empty" role="group" aria-label={`${title} (locked)`}>
      <Lock aria-hidden />
      <b>{title}</b>
      <p>{blurb}</p>
      <ButtonLink
        href={pricingHref(plan)}
        size="sm"
        onClick={() => {
          fetch("/api/events", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "upgrade_clicked", props: { from } }), keepalive: true,
          }).catch(() => {});
        }}
      >
        Unlock with {PLANS[plan].name}
      </ButtonLink>
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
  /** The period's headline numbers against the previous period. */
  changes?: ChangeItem[];
  /** One plain next step: the top gap's action or the first insight's recommendation. */
  nextStep?: string | null;
};

const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };

const OVERLAY_METRIC_ORDER: GraphMetric[] = ["views", "engagement", "reach", "followers", "watch_time", "net_followers"];

type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content performance"], ["audience", "Audience"], ["times", "Posting times"], ["growth", "Growth"]];
const FG: { value: FollowerGranularity; label: string }[] = [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }];
/** Which chart series a KPI tile selects. Total Posts has no series. */
const KPI_METRIC: Partial<Record<Kpi["id"], MetricId>> = { views: "views", engagement_rate: "engagement", followers: "followers", reach: "reach" };
const GROWTH_METRICS: MetricId[] = ["followers", "reach", "views", "engagement"];
type ContentView = "top" | "under" | "format" | "breakout";

const hashTab = (h: string): Tab | null => {
  const id = h.replace(/^#(an-)?/, "");
  if (id === "posts") return "content";
  return (TABS.find(([t]) => t === id)?.[0] as Tab | undefined) ?? null;
};

const signed = (n: number, digits = 0) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export default function AnalyticsV3({ d }: { d: AnalyticsData }) {
  const gate = d.gate ?? OPEN_GATE;
  const [tab, setTabState] = useState<Tab>("overview");
  const [metric, setMetric] = useState<MetricId>(d.series.views.provenance === "unavailable" ? "engagement" : "views");
  const [growthMetric, setGrowthMetric] = useState<MetricId>("followers");
  const [compare, setCompare] = useState(true);
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [fit, setFit] = useState<boolean | null>(null);
  const [fgran, setFgran] = useState<FollowerGranularity>("day");
  const [contentTab, setContentTab] = useState<ContentView>("top");
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
    for (const a of missingAccts) out.push({ tone: "muted", text: `${a.label} has no daily ${unit} series${a.platform === "facebook" ? ": Facebook doesn't provide one" : a.platform === "tiktok" ? ": TikTok isn't connected to time-series data yet" : ""}.` });
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

  // Segment labels carry their counts, so an empty Underperforming / Breakouts
  // view is visible before it is opened.
  const contentTabs = useMemo(() => {
    const under = d.posts.filter((p) => p.multiplier != null && p.multiplier < 0.7).length;
    const brk = d.posts.filter((p) => p.multiplier != null && p.multiplier >= 3).length;
    return [
      { value: "top", label: "Top content" },
      { value: "under", label: `Underperforming (${under})` },
      { value: "format", label: "By format" },
      { value: "breakout", label: `Breakouts (${brk})` },
    ] as { value: ContentView; label: string }[];
  }, [d.posts]);

  const followersNow = d.series.followers.current;
  const fPoints = useMemo(() => followersInRange(d.followerPoints, followersNow[0]?.day ?? "0000", d.today), [d.followerPoints, followersNow, d.today]);
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
  const ask = (question?: string) => askSocia({ context: { page: "analytics", range: String(d.rangeDays), metric }, ...(question ? { question } : {}) });

  // ---- the KPI row: each tile with a series is the chart's tab ----
  const kpiCells = d.kpis.map((k) => {
    const m = KPI_METRIC[k.id];
    const selectable = Boolean(isSingleIg && m && d.series[m].provenance !== "unavailable");
    const na = k.raw == null && k.status !== "ok";
    return (
      <KpiCell
        key={k.id}
        label={k.label}
        value={na ? null : k.value}
        reason={k.note}
        delta={!gate.comparison && k.deltaText ? { text: k.deltaText, tone: k.positive === false ? "bad" : k.positive ? "good" : undefined } : undefined}
        note={na ? undefined : gate.comparison ? `vs. previous period on ${PLANS[minPlanWithFeature("period_comparison")].name}` : k.note}
        selected={selectable && metric === m}
        onSelect={selectable ? () => setMetric(m as MetricId) : undefined}
      />
    );
  });

  // Where each headline number comes from, and why a grouping is switched off.
  const sources = (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant="ghost" />}>
        <Info aria-hidden /> Sources
      </PopoverTrigger>
      <PopoverContent align="end">
        <ul className="an-list">
          {d.kpis.map((k) => (
            <li key={k.id}>
              <span className="an-row-body">
                <b>{k.label}</b>
                <small>{k.source}</small>
              </span>
            </li>
          ))}
          {granOptions.filter((g) => !g.enabled).map((g) => (
            <li key={g.id}>
              <span className="an-row-body">
                <b>{g.label} grouping</b>
                <small>{g.why}</small>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );

  const growthSeries = d.series[growthMetric];

  const whatsMissing = (
    <Card>
      <CardHeader title="What's missing" />
      <GapList gaps={gaps} onTab={jumpTab} pending={d.posts.length < 5} />
      {lockedGaps > 0 && (
        <div className="s-empty" role="status">
          <Lock aria-hidden />
          <b>
            SOCIA found {lockedGaps} more {lockedGaps === 1 ? "opportunity" : "opportunities"} for this account.
          </b>
          <p>Unlock your full strategy with {PLANS[minPlanWithFeature("deeper_insights")].name}.</p>
          <ButtonLink
            href={pricingHref("starter")}
            size="sm"
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
          </ButtonLink>
        </div>
      )}
      <CardSource>The biggest gaps SOCIA found in your current strategy, ranked by evidence.</CardSource>
    </Card>
  );


  return (
    <div className="an-stack">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="an-stack">
        <TabList aria-label="Analytics sections">
          {TABS.map(([id, label]) => (
            <SectionTab key={id} value={id}>
              {label}
            </SectionTab>
          ))}
        </TabList>

        {/* ================================================== OVERVIEW */}
        <TabPanel value="overview" className="an-stack">
          <KpiStrip cols={d.kpis.length}>{kpiCells}</KpiStrip>

          <div className="an-grid">
            <Card>
              <CardHeader
                title="Performance over time"
                period={d.rangeLabel}
                actions={
                  <>
                    {sources}
                    <Button size="sm" onClick={() => ask()}>
                      <Sparkles aria-hidden /> Ask SOCIA
                    </Button>
                  </>
                }
              />

              <div className="an-controls">
                <SegmentedControl
                  label="Group by"
                  className="s-seg--sm"
                  value={gran}
                  onChange={setGran}
                  options={granOptions.map((g) => ({ value: g.id, label: g.label, disabled: !g.enabled }))}
                />
                {!isSingleIg && overlayMetrics.length > 0 && (
                  <SegmentedControl label="Metric" className="s-seg--sm" value={gmActive} onChange={setGm} options={overlayMetrics.map((m) => ({ value: m, label: GRAPH_METRIC_LABEL[m] }))} />
                )}
              </div>

              {d.graphAccounts.length > 1 && !gate.crossPlatform && (
                <div className="an-accts" role="group" aria-label="Accounts on the graph">
                  <button type="button" className="an-acct" aria-pressed={acctSel.length === d.graphAccounts.length} onClick={() => setAcctSel(d.graphAccounts.map((a) => a.id))}>
                    All accounts
                  </button>
                  {d.graphAccounts.map((a) => {
                    const on = acctSel.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="an-acct"
                        aria-pressed={on}
                        onClick={() => setAcctSel((sel) => (sel.includes(a.id) ? (sel.length > 1 ? sel.filter((x) => x !== a.id) : sel) : [...sel, a.id]))}
                      >
                        <PlatformMark platform={a.platform} brand size="sm" />
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {d.graphAccounts.length > 1 && gate.crossPlatform && (
                <p className="an-controls s-hint">
                  Overlay and compare your accounts on one graph with {PLANS[gate.crossPlatform].name}.{" "}
                  <Link href={pricingHref(gate.crossPlatform)} className="s-link">
                    See {PLANS[gate.crossPlatform].name}
                  </Link>
                </p>
              )}

              {isSingleIg ? (
                <>
                  <div className={series.total == null ? "an-stat is-na" : "an-stat"}>
                    <b>{series.total != null ? fmtNum(series.total) : DASH}</b>
                    <span>
                      {series.label.toLowerCase()} {metric === "followers" ? "now" : `in the ${d.rangeLabel.toLowerCase()}`}
                    </span>
                    {!gate.comparison && totalDelta != null && (
                      <em className={totalDelta >= 0 ? "is-good" : "is-bad"}>
                        {totalDelta >= 0 ? "↑" : "↓"} {Math.abs(totalDelta).toFixed(1)}% vs. previous period
                      </em>
                    )}
                    {!gate.comparison && series.prevTotal == null && series.total != null && <em>no comparable previous period yet</em>}
                    {baseline && (
                      <em>
                        {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}
                      </em>
                    )}
                    <span className="an-stat-end">
                      {!gate.comparison && (
                        <button type="button" className="an-acct" aria-pressed={compare} onClick={() => setCompare((v) => !v)}>
                          vs. previous
                        </button>
                      )}
                      {outliers.size > 0 && (
                        <button type="button" className="an-acct" aria-pressed={fitOn} aria-describedby="av-fit-why" onClick={() => setFit(!fitOn)}>
                          Fit typical range
                        </button>
                      )}
                    </span>
                  </div>
                  <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison} height={260} fitScale={fitOn} baseline={baseline} postById={postById} today={d.today} onPick={(b, o) => setPoint({ b, outlier: o })} />
                  <CardSource>
                    {series.note}
                    {outliers.size > 0 ? ` ${outliers.size} breakout ${gran}${outliers.size === 1 ? "" : "s"} marked; click a bar to see what drove it.` : " Click a bar to inspect it."}
                    {outliers.size > 0 && <span id="av-fit-why"> Fit typical range scales the axis to your typical range; breakout bars stay visible with their value.</span>}
                  </CardSource>
                </>
              ) : (
                <>
                  <MultiLineChart lines={overlayLines} granularity={gran} height={260} unit={GRAPH_METRIC_LABEL[gmActive].toLowerCase()} today={d.today} />
                  <CardSource>
                    {overlayLines.length ? `${GRAPH_METRIC_LABEL[gmActive]} across ${overlayLines.length} account${overlayLines.length === 1 ? "" : "s"}, ${d.rangeLabel.toLowerCase()}.` : "None of the selected accounts report this metric as a daily series."}
                    {overlayImpure ? " Publish-date lines show each post's totals on the day it was posted, not a daily account series; YouTube shows true daily values." : ""}
                    {missingAccts.length ? ` ${missingAccts.map((a) => a.label).join(", ")}: no daily ${GRAPH_METRIC_LABEL[gmActive].toLowerCase()} series.` : ""}
                  </CardSource>
                </>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Key insights"
                actions={
                  <button type="button" className="s-link" onClick={() => ask("What am I missing?")}>
                    Ask
                  </button>
                }
              />
              {gate.deeperInsights ? (
                <div className="an-col">
                  {insights.length > 0 && <InsightList insights={insights.slice(0, 1)} posts={d.posts} compact onTab={jumpTab} />}
                  <Locked
                    plan={gate.deeperInsights}
                    title="What's working, and what to do next"
                    blurb={insights.length > 1
                      ? `SOCIA found ${insights.length - 1} more ${insights.length - 1 === 1 ? "insight" : "insights"} in your data. See every one, plus What Changed and What To Do Next.`
                      : "See What's Working, What Changed and What To Do Next, drawn from your own performance."}
                    from="analytics_insights"
                  />
                </div>
              ) : isSingleIg ? (
                <InsightList insights={insights.slice(0, 5)} posts={d.posts} compact onTab={jumpTab} />
              ) : graphInsights.length ? (
                <ul className="an-list">
                  {graphInsights.map((g, i) => (
                    <li key={i} className={g.tone === "up" ? "is-good" : undefined}>
                      {g.tone === "up" ? <TrendingUp aria-hidden /> : g.tone === "muted" ? <Minus aria-hidden /> : <Info aria-hidden />}
                      <span className="an-row-body">{g.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Select accounts to see cross-account insights.</Empty>
              )}
            </Card>
          </div>

          {d.changes && d.changes.length > 0 ? (
            <div className="an-grid">
              {whatsMissing}
              <Card>
                <CardHeader title="What changed" period={`${d.rangeLabel} vs. the ${d.rangeDays} days before`} />
                {gate.comparison ? (
                  <Locked plan={gate.comparison} title="Previous-period comparisons" blurb="See how views, reach, interactions, followers and posting moved against the period before." from="analytics_what_changed" />
                ) : (
                  <WhatChanged items={d.changes} />
                )}
                {d.nextStep && !gate.deeperInsights && (
                  <p className="an-next">
                    <b>Do this next:</b> {d.nextStep}
                  </p>
                )}
              </Card>
            </div>
          ) : (
            whatsMissing
          )}

          <div className="an-grid">
            <Card>
              <CardHeader
                title="Content performance"
                period={d.rangeLabel}
                actions={
                  <button type="button" className="s-link" onClick={() => setTab("content")}>
                    All posts
                  </button>
                }
              />
              <div className="an-controls">
                <SegmentedControl label="Content view" className="s-seg--sm" value={contentTab} onChange={setContentTab} options={contentTabs} />
              </div>
              {contentTab === "under" && !contentPosts.length && <Empty>No post in this period fell below 70% of your median. Nothing is underperforming by your own baseline.</Empty>}
              {contentTab === "breakout" && !contentPosts.length && <Empty>No post reached 3× your median interactions in this period.</Empty>}
              {contentPosts.length > 0 && <ContentRow posts={contentPosts} onOpen={setOpen} size="lg" />}
            </Card>

            <div className="an-col">
              <Card>
                <CardHeader
                  title="Audience growth"
                  actions={
                    <button type="button" className="s-link" onClick={() => setTab("audience")}>
                      View details
                    </button>
                  }
                />
                <div className={d.followers == null ? "an-stat is-na" : "an-stat"}>
                  <b>{d.followers != null ? d.followers.toLocaleString("en-US") : DASH}</b>
                  <span>Followers</span>
                  {fSummary.net != null && (
                    <em className={fSummary.net >= 0 ? "is-good" : "is-bad"}>
                      {signed(fSummary.net)} {d.rangeLabel.toLowerCase()}
                    </em>
                  )}
                </div>
                <FollowerChart points={fPoints} granularity="day" height={110} today={d.today} compact />
                <CardSource>{fSummary.statusLine}</CardSource>
              </Card>
              <Card>
                <CardHeader
                  title="Best times to post"
                  actions={
                    !gate.postingTimes && (
                      <button type="button" className="s-link" onClick={() => setTab("times")}>
                        Full heatmap
                      </button>
                    )
                  }
                />
                {gate.postingTimes ? (
                  <Locked plan={gate.postingTimes} title="Know when to post" blurb="See the weekday-and-hour windows where your own posts have performed best, with the sample size behind every claim." from="analytics_besttimes" />
                ) : (
                  <Mounted fallback={<p className="an-note">Computing in your time zone…</p>}>
                    <BestTimes posts={d.timed} />
                  </Mounted>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* ================================================== CONTENT */}
        <TabPanel value="content" className="an-stack">
          <Card>
            <CardHeader
              title="Content performance"
              period={d.baseline != null ? `Median post ${Math.round(d.baseline).toLocaleString("en-US")} interactions · last ${d.posts.length} synced posts` : "No baseline yet"}
            />
            <div className="an-controls">
              <SegmentedControl label="Content view" className="s-seg--sm" value={contentTab} onChange={setContentTab} options={contentTabs} />
            </div>
            {contentTab === "under" && !contentPosts.length && <Empty>No post fell below 70% of your median interactions.</Empty>}
            {contentTab === "breakout" && !contentPosts.length && <Empty>No post reached 3× your median interactions.</Empty>}
            {contentPosts.length > 0 && <ContentRow posts={contentPosts} onOpen={setOpen} size="lg" />}
            <CardSource>Top content and By format rank by views. Underperforming and Breakouts compare each post&apos;s interactions (likes + comments + saves + shares) with your median post: below 70% and at least 3×.</CardSource>
          </Card>
          <div className="an-two">
            <Card>
              <CardHeader title="Content breakdown" period={`${d.breakdown.metric === "views" ? "Views" : "Interactions"} by format · ${d.rangeLabel}`} />
              {d.breakdown.slices.length ? (
                <Donut slices={d.breakdown.slices} total={d.breakdown.total} centerLabel={d.breakdown.metric === "views" ? "Total Views" : "Interactions"} size={150} />
              ) : (
                <Empty>No posts in this period.</Empty>
              )}
            </Card>
            <Card>
              <CardHeader title="Formats compared" period="Medians · all synced posts" />
              <TableWrap>
                <table className="s-table s-table--stack">
                  <thead>
                    <tr>
                      <th>Format</th>
                      <th className="num">Posts</th>
                      <th className="num">Median views</th>
                      <th className="num">Median interactions</th>
                      <th className="num">Median rate</th>
                      <th className="num">Median saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFormat.map((r) => (
                      <tr key={r.format}>
                        <td className="id">
                          {r.format}s{r.n < 3 ? <span className="sub">Too few to compare</span> : null}
                        </td>
                        <td className="num key" data-label="Posts">{r.n}</td>
                        <td className="num" data-label="Median views">{r.views != null ? fmtNum(Math.round(r.views)) : <Unavailable reason="Instagram did not return views for these posts" compact />}</td>
                        <td className="num" data-label="Median interactions">{r.inter != null ? fmtNum(Math.round(r.inter)) : <Unavailable reason="No interactions recorded for these posts" compact />}</td>
                        <td className="num" data-label="Median rate">{r.rate != null ? `${r.rate.toFixed(1)}%` : <Unavailable reason="Instagram did not return reach for these posts" compact />}</td>
                        <td className="num" data-label="Median saves">{r.saves != null ? fmtNum(Math.round(r.saves)) : <Unavailable reason="Instagram did not return saves for these posts" compact />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <CardSource>Rate = interactions ÷ accounts reached per post. A format needs 3 posts before SOCIA compares it. A dash means Instagram did not return that number, not zero.</CardSource>
            </Card>
          </div>
          <Card id="posts">
            <CardHeader title="All posts" period={`${d.library.length} synced · values exactly as Instagram returned them`} />
            <ContentLibrary posts={d.library} embedded />
          </Card>
        </TabPanel>

        {/* ================================================== AUDIENCE */}
        <TabPanel value="audience" className="an-stack">
          <Card>
            <CardHeader
              title="Follower history"
              period={d.rangeLabel}
              actions={<SegmentedControl label="Group by" className="s-seg--sm" value={fgran} onChange={setFgran} options={FG} />}
            />
            <dl className="an-stats is-lead">
              <div>
                <dt>Followers now</dt>
                <dd className={d.followers == null ? "is-na" : undefined}>{d.followers != null ? d.followers.toLocaleString("en-US") : DASH}</dd>
              </div>
              <div>
                <dt>Net change</dt>
                <dd className={fSummary.net == null ? "is-na" : fSummary.net >= 0 ? "is-good" : "is-bad"}>{fSummary.net == null ? DASH : signed(fSummary.net)}</dd>
              </div>
              <div>
                <dt>Growth rate</dt>
                <dd className={fSummary.growthPct == null ? "is-na" : fSummary.growthPct >= 0 ? "is-good" : "is-bad"}>{fSummary.growthPct == null ? DASH : `${signed(fSummary.growthPct, 2)}%`}</dd>
              </div>
              <div>
                <dt>Average daily change</dt>
                <dd className={fSummary.avgDailyNet == null ? "is-na" : undefined}>{fSummary.avgDailyNet == null ? DASH : `${signed(fSummary.avgDailyNet, 1)}/day`}</dd>
              </div>
              <div>
                <dt>History</dt>
                <dd>
                  {fSummary.daysCollected} day{fSummary.daysCollected === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>
            <FollowerChart points={fPoints} granularity={fgran} height={220} today={d.today} />
            <CardSource>
              {fSummary.statusLine} {fSummary.detailLine}
              {d.followerPoints[0] ? ` Tracking started ${fmtDay(d.followerPoints[0].day)}.` : ""}
            </CardSource>
          </Card>
          <div className="an-two">
            <Card>
              <CardHeader title="New followers per day" period={`Instagram · ${d.rangeLabel}`} />
              <OverviewChart series={gainsSeries} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={180} compact today={d.today} />
              <CardSource>{gainsSeries.note}</CardSource>
            </Card>
            <Card>
              <CardHeader title="Audience demographics" period="Instagram · current followers" />
              <AudienceBars demo={d.demo} />
            </Card>
          </div>
        </TabPanel>

        {/* ================================================== POSTING TIMES */}
        <TabPanel value="times" className="an-stack">
          <Card>
            <CardHeader title="Posting times" />
            {gate.postingTimes ? (
              <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A full weekday-by-hour heatmap of your own performance, and the best window per format, each backed by its real sample size." from="analytics_times_tab" />
            ) : (
              <Mounted fallback={<Skeleton variant="block" />}>
                <PostingHeatmap posts={d.timed} formats={d.formats} />
              </Mounted>
            )}
            <CardSource>When your own posts have performed best, with the sample behind every claim. Times are in your time zone.</CardSource>
          </Card>
        </TabPanel>

        {/* ================================================== GROWTH */}
        <TabPanel value="growth" className="an-stack">
          {gate.growth ? (
            <Card>
              <CardHeader title="Growth" />
              <Locked plan={gate.growth} title="Growth analysis" blurb="Trend cards for followers, reach, views and engagement, your strong and weak weeks against your typical week, and milestones as they happen." from="analytics_growth_tab" />
              <CardSource>How your reach, views, followers and engagement are trending.</CardSource>
            </Card>
          ) : (
            <>
              <KpiStrip cols={GROWTH_METRICS.length}>
                {GROWTH_METRICS.map((m) => {
                  const s = d.series[m];
                  const delta = s.total != null && s.prevTotal != null && s.prevTotal > 0 ? ((s.total - s.prevTotal) / s.prevTotal) * 100 : null;
                  return (
                    <KpiCell
                      key={m}
                      label={`${s.label} trend`}
                      value={s.total != null ? fmtNum(s.total) : null}
                      reason={s.provenance === "unavailable" ? s.note : "No data in this range yet"}
                      delta={delta != null ? { text: `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}%`, tone: delta >= 0 ? "good" : "bad", window: "vs. previous period" } : undefined}
                      note={s.total != null ? (m === "followers" ? "now" : d.rangeLabel.toLowerCase()) : undefined}
                      selected={growthMetric === m}
                      onSelect={() => setGrowthMetric(m)}
                    />
                  );
                })}
              </KpiStrip>
              <Card>
                <CardHeader title={`${growthSeries.label} trend`} period={growthMetric === "followers" ? "Now" : d.rangeLabel} />
                {growthMetric === "followers" ? (
                  <FollowerChart points={fPoints} granularity={d.rangeDays > 60 ? "week" : "day"} height={220} today={d.today} compact />
                ) : (
                  <OverviewChart
                    series={growthSeries}
                    granularity={d.rangeDays > 31 ? "week" : "day"}
                    showPrevious={false}
                    height={220}
                    compact
                    baseline={seriesBaseline(growthSeries, d.posts.map((p) => (growthMetric === "views" ? p.views : growthMetric === "engagement" ? p.engagements : null)).filter((v): v is number => v != null))}
                    postById={postById}
                    today={d.today}
                    onPick={(b, o) => { setMetric(growthMetric); setPoint({ b, outlier: o }); }}
                  />
                )}
                <CardSource>{growthSeries.note}</CardSource>
              </Card>
              <div className="an-two">
                <Card>
                  <CardHeader title="Engagement" period={d.rangeLabel} />
                  <EngagementCard rate={d.engagement.rate} breakdown={d.engagement.breakdown} quality={d.engagement.quality} rangeLabel={d.rangeLabel} />
                </Card>
                <div className="an-col">
                  <Card>
                    <CardHeader title="Growth and decline periods" period={`${periods.label} · weekly`} />
                    {periods.median == null ? (
                      <Empty>Needs at least four complete weeks in the range to compare weeks with your typical week.</Empty>
                    ) : (
                      <ul className="an-list an-periods">
                        {periods.growth.map((b) => (
                          <li key={`g${b.key}`} className="is-good">
                            <span>{bucketTitle(b, "week")}</span>
                            <b>{fmtNum(b.value)}</b>
                            <small>{(b.value! / periods.median!).toFixed(1)}× typical week</small>
                          </li>
                        ))}
                        {periods.decline.map((b) => (
                          <li key={`d${b.key}`} className="is-bad">
                            <span>{bucketTitle(b, "week")}</span>
                            <b>{fmtNum(b.value)}</b>
                            <small>{Math.round((b.value! / periods.median!) * 100)}% of typical week</small>
                          </li>
                        ))}
                        {!periods.growth.length && !periods.decline.length && (
                          <li>
                            <span>
                              No week ran far above or below your typical week ({fmtNum(Math.round(periods.median))} {periods.label.toLowerCase()}).
                            </span>
                          </li>
                        )}
                      </ul>
                    )}
                  </Card>
                  <Card>
                    <CardHeader title="Milestones" />
                    {milestones.length ? (
                      <ul className="an-list an-milestones">
                        {milestones.map((m, i) => (
                          <li key={i}>
                            <time dateTime={m.day}>{fmtDay(m.day)}</time>
                            <span>{m.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>Milestones appear as SOCIA records follower history and breakout posts.</Empty>
                    )}
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabPanel>
      </Tabs>

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
      <PointDrawer bucket={point?.b ?? null} isOutlier={point?.outlier ?? false} granularity={tab === "growth" ? (d.rangeDays > 31 ? "week" : "day") : gran} series={series} baseline={baseline} posts={d.posts} onClose={() => setPoint(null)} onAnalyze={(p) => { setPoint(null); setOpen(p); }} />
    </div>
  );
}
