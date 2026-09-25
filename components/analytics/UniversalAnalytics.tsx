"use client";

// The universal Analytics shell. One page, every platform: it reads the
// normalized NormalizedAccountAnalytics bundle produced by the platform
// adapters and never touches a platform's raw shape. The account selector
// switches between one account and All-Accounts; the same tree renders both.
// Every figure is real — a metric a platform doesn't expose is "—", never 0;
// a platform with no daily series simply has no line; TikTok stays a
// coming-soon chip until its integration and credentials exist. Developed
// behind ?v=2 until it reaches parity with the live page.

import { useMemo, useState } from "react";
import { ChevronDown, Clock, Download, Eye, FileText, Flame, Heart, Lightbulb, TrendingDown, TrendingUp, Users, Zap, type LucideIcon } from "lucide-react";
import { askSocia } from "@/lib/ask";
import DateRangeSelector from "@/components/DateRangeSelector";
import UniTrend from "./UniTrend";
import MultiTrend, { type TrendLine } from "./MultiTrend";
import ContentTimeline from "./ContentTimeline";
import ContentTable from "./ContentTable";
import ContentDrawer from "./ContentDrawer";
import Heatmap from "./Heatmap";
import { median } from "@/lib/metrics";
import { metricCapability, metricLabel, platformCapability } from "@/lib/analytics/capabilities";
import { breakdownMetric, bucketSeries, engagementSplit, filterPosts, formatBreakdown, formatTable, postingWindows, type PostFilter } from "@/lib/analytics/derive";
import { accountInsights, crossPlatformInsights, type AnalyticsInsight, type InsightKind } from "@/lib/analytics/insights";
import { aggregateAccounts } from "@/lib/analytics/aggregate";
import { relText } from "@/lib/postingTimes";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedPost, NormalizedSeries, Platform } from "@/lib/analytics/types";
import "./universal.css";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };
const INSIGHT_ICON: Record<InsightKind, LucideIcon> = { breakout: Flame, format: Lightbulb, timing: Clock, trend: TrendingUp, cadence: TrendingDown, platform: Zap };
const KPI_ICON: Record<string, LucideIcon> = { views: Eye, engagement: Heart, engagement_rate: Heart, followers: Users, posts: FileText, watch_time: Clock, net_followers: Users };

type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content Performance"], ["audience", "Audience"], ["times", "Posting Times"], ["growth", "Growth"]];
const SERIES_PREF: MetricKey[] = ["views", "engagement", "watch_time", "net_followers", "reach", "followers"];

type Unit = "count" | "percent" | "minutes" | "seconds";
function fmtValue(v: number | null, unit: Unit = "count"): string {
  if (v == null) return "—";
  if (unit === "percent") return `${v.toFixed(v < 1 ? 2 : 1)}%`;
  if (unit === "minutes") { const h = v / 60; return h >= 1 ? `${h >= 10 ? Math.round(h) : h.toFixed(1)}h` : `${Math.round(v)}m`; }
  return v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US");
}
const fmtN = (v: number | null) => fmtValue(v, "count");
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;

type Delta = { pct: number; text: string; up: boolean } | null;
function deltaFrom(total: number | null, prev: number | null): Delta {
  if (total == null || prev == null || prev === 0) return null;
  const pct = ((total - prev) / prev) * 100;
  return { pct, text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(0)}%`, up: pct >= 0 };
}
// Period-over-period delta, but ONLY from genuine daily series. Publish-date
// content totals swing wildly when a viral post ages out of the window, so a
// delta built on them would mislead — those get no delta rather than a false one.
function sumSeriesDelta(accts: NormalizedAccountAnalytics[], key: MetricKey): Delta {
  let total: number | null = null, prev: number | null = null;
  for (const a of accts) {
    const s = a.series[key];
    if (!s || !s.trueSeries) continue;
    if (s.total != null) total = (total ?? 0) + s.total;
    if (s.prevTotal != null) prev = (prev ?? 0) + s.prevTotal;
  }
  return deltaFrom(total, prev);
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className="uni-badge" style={{ background: TINT[platform] }}>{platformCapability(platform).label}</span>;
}

function Bars({ items }: { items: { label: string; value: number; share: number; sub?: string; color?: string }[] }) {
  return (
    <div className="uni-bars">
      {items.map((b) => (
        <div key={b.label} className="uni-demo-row">
          <span className="uni-demo-key">{b.label}</span>
          <span className="uni-demo-track"><span className="uni-demo-fill" style={{ width: `${Math.max(2, Math.round(b.share * 100))}%`, background: b.color }} /></span>
          <span className="uni-demo-val">{b.sub ?? `${Math.round(b.share * 100)}%`}</span>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="uni-chart-note uni-empty-block">{children}</p>;

function InsightCard({ ins }: { ins: AnalyticsInsight }) {
  const Icon = INSIGHT_ICON[ins.kind] ?? Lightbulb;
  return (
    <div className={`uni-insight tone-${ins.tone}`}>
      <span className="uni-insight-ico"><Icon size={15} /></span>
      <div className="uni-insight-body-wrap">
        <p className="uni-insight-title">{ins.title}</p>
        <p className="uni-insight-body">{ins.body}</p>
        {ins.recommendation && <p className="uni-insight-rec">→ {ins.recommendation}</p>}
      </div>
    </div>
  );
}

// Brand-coloured platform-share donut for the All-Accounts view.
function PlatformDonut({ slices, total, label }: { slices: { platform: Platform; value: number; share: number }[]; total: number; label: string }) {
  const R = 52, C = 2 * Math.PI * R, sw = 18;
  let offset = 0;
  return (
    <div className="uni-donut">
      <svg viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--surface-muted)" strokeWidth={sw} />
        {slices.map((s) => {
          const len = s.share * C;
          const el = <circle key={s.platform} cx="65" cy="65" r={R} fill="none" stroke={TINT[s.platform]} strokeWidth={sw} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 65 65)" />;
          offset += len;
          return el;
        })}
        <text x="65" y="61" textAnchor="middle" className="uni-donut-val">{fmtN(total)}</text>
        <text x="65" y="77" textAnchor="middle" className="uni-donut-lbl">{label}</text>
      </svg>
      <div className="uni-donut-legend">
        {slices.map((s) => (
          <div key={s.platform} className="uni-donut-row">
            <span className="uni-legend-dot" style={{ background: TINT[s.platform] }} />
            <span className="uni-donut-name">{platformCapability(s.platform).label}</span>
            <span className="uni-donut-num">{fmtN(s.value)}</span>
            <span className="uni-donut-pct">{Math.round(s.share * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostingTimesPanel({ account }: { account: NormalizedAccountAnalytics }) {
  const w = postingWindows(account.posts);
  const label = platformCapability(account.account.platform).label;
  return (
    <section className="uni-panel">
      <div className="uni-panel-head"><h3>{label} posting times</h3><span className="uni-sub">medians vs its typical post · {w.posts} dated posts</span></div>
      {w.enough ? (
        <>
          {w.best.length ? (
            <div className="uni-windows">{w.best.map((win) => <div key={`${win.day}-${win.block}`} className="uni-window"><span className="uni-window-label">{win.label}</span><span className={`uni-window-rel${win.rel >= 1 ? " up" : ""}`}>{relText(win.rel)}</span><span className="uni-window-n">{win.n} posts{win.confidence === "early" ? " · early signal" : ""}</span></div>)}</div>
          ) : <Empty>No single window stands out above its typical yet.</Empty>}
          <div style={{ marginTop: 16 }}><Heatmap windows={w} /></div>
        </>
      ) : <Empty>Not enough dated posts yet to find a reliable posting time for {label} — {w.posts} so far.</Empty>}
    </section>
  );
}

export default function UniversalAnalytics({
  accounts, rangeLabel, rangeDays, maxDays, canCrossPlatform = false, tiktokComingSoon = true, initialPlatform,
}: {
  accounts: NormalizedAccountAnalytics[];
  rangeLabel: string; rangeDays: number; maxDays?: number; canCrossPlatform?: boolean; tiktokComingSoon?: boolean; initialPlatform?: Platform;
}) {
  const showAllOption = canCrossPlatform && accounts.length > 1;
  const initialIdx = initialPlatform ? accounts.findIndex((a) => a.account.platform === initialPlatform) : -1;
  const [sel, setSel] = useState<number | "all">(initialIdx >= 0 ? initialIdx : showAllOption ? "all" : 0);
  const [selOpen, setSelOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [metricTab, setMetricTab] = useState<"views" | "engagement" | "followers" | "content">("views");
  const [gran, setGran] = useState<"day" | "week" | "month">("day");
  const [display, setDisplay] = useState<"raw" | "typical">("raw");
  const [dispOpen, setDispOpen] = useState(false);
  const [visible, setVisible] = useState<Set<number>>(() => new Set(accounts.map((_, i) => i)));
  const [openPost, setOpenPost] = useState<NormalizedPost | null>(null);
  const isAll = sel === "all";
  const acc = accounts[isAll ? 0 : (sel as number)];
  const platform = acc.account.platform;
  const cap = platformCapability(platform);
  const ctx = isAll ? accounts : [acc];

  const all = useMemo(() => aggregateAccounts(accounts, rangeDays), [accounts, rangeDays]);
  const insights = useMemo(() => (isAll ? crossPlatformInsights(accounts) : accountInsights(acc)), [isAll, accounts, acc]);

  // Which accounts feed the GRAPH: in All-Accounts the visible (toggled) ones,
  // otherwise just the selected account. Visibility only affects the graph —
  // KPIs, donut and ranks always reflect every account.
  const graphIdx = useMemo(() => (isAll ? accounts.map((_, i) => i).filter((i) => visible.has(i)) : [sel as number]), [isAll, accounts, visible, sel]);
  const graphAccounts = graphIdx.map((i) => accounts[i]);

  // The metric-pill → series metric for TREND. "Followers" prefers the level
  // series, falling back to net-followers where that's all a platform has.
  const trendMetric: MetricKey = metricTab === "engagement" ? "engagement" : metricTab === "followers" ? (graphAccounts.some((a) => a.series.followers) ? "followers" : "net_followers") : "views";
  const activeMetric: MetricKey = metricTab === "content" ? "views" : trendMetric;
  const lines: TrendLine[] = graphAccounts.filter((a) => a.series[trendMetric]).map((a) => ({ platform: a.account.platform, label: platformCapability(a.account.platform).label, series: bucketSeries(a.series[trendMetric]!, gran) }));
  const graphPosts = useMemo(() => graphAccounts.flatMap((a) => a.posts), [graphAccounts]);

  // COMPARE mode: each account vs its OWN typical — median multiplier of its
  // posts in the period (multiplier = post ÷ that account's baseline).
  const compareData = useMemo(() => {
    const since = Date.now() - rangeDays * 86400000;
    return graphAccounts
      .map((a) => {
        const per = a.posts.filter((p) => p.multiplier != null && p.publishedAt && new Date(p.publishedAt).getTime() >= since);
        const m = median(per.map((p) => p.multiplier!));
        return { platform: a.account.platform, mult: m, n: per.length };
      })
      .filter((r): r is { platform: Platform; mult: number; n: number } => r.mult != null)
      .sort((a, b) => b.mult - a.mult);
  }, [graphAccounts, rangeDays]);

  // Content across the current context.
  const ctxPosts = useMemo(() => ctx.flatMap((a) => a.posts), [ctx]);
  const topPerformer = useMemo(() => {
    const byMult = [...ctxPosts].filter((p) => p.multiplier != null).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0];
    return byMult ?? [...ctxPosts].sort((a, b) => (b.metrics.views ?? b.engagement ?? -1) - (a.metrics.views ?? a.engagement ?? -1))[0] ?? null;
  }, [ctxPosts]);

  // Platform ranks by best-post multiplier (All-Accounts only).
  const platformRanks = useMemo(() => accounts
    .map((a) => { const top = [...a.posts].filter((p) => p.multiplier != null).sort((x, y) => (y.multiplier ?? 0) - (x.multiplier ?? 0))[0]; return { platform: a.account.platform, mult: top?.multiplier ?? null }; })
    .filter((r): r is { platform: Platform; mult: number } => r.mult != null)
    .sort((a, b) => b.mult - a.mult), [accounts]);
  const maxRank = platformRanks[0]?.mult ?? 1;

  // KPI cards for the current context. Icons + real deltas; no provenance chips
  // (provenance lives in the source tooltip). All-Accounts engagement rate is
  // total interactions ÷ total views — both additive, so it's defensible.
  const allEngRate = all.totals.views && all.totals.engagement != null ? (all.totals.engagement / all.totals.views) * 100 : null;
  const kpiCards: { key: string; label: string; value: number | null; unit: Unit; delta: Delta; note?: string; icon: LucideIcon }[] = isAll
    ? [
        { key: "views", label: "Total Views", value: all.totals.views ?? null, unit: "count", delta: sumSeriesDelta(accounts, "views"), icon: Eye },
        { key: "engagement_rate", label: "Engagement Rate", value: allEngRate, unit: "percent", delta: null, note: "interactions ÷ views", icon: Heart },
        { key: "followers", label: "Total Audience", value: all.totals.followers ?? null, unit: "count", delta: null, note: `across ${all.audiencePlatforms.length} platform${all.audiencePlatforms.length === 1 ? "" : "s"}`, icon: Users },
        { key: "posts", label: "Content Published", value: all.totals.posts ?? null, unit: "count", delta: null, note: "in this period", icon: FileText },
      ]
    : (["views", "engagement_rate", "followers", "posts"] as MetricKey[])
        .filter((k) => acc.kpis[k])
        .map((k) => ({ key: k, label: metricLabel(platform, k), value: acc.kpis[k]!.value, unit: metricCapability(platform, k)?.unit ?? "count", delta: sumSeriesDelta([acc], k), note: acc.kpis[k]!.period, icon: KPI_ICON[k] ?? Eye }));

  const [pf, setPf] = useState<PostFilter>("top");
  const breakdown = useMemo(() => formatBreakdown(acc.posts, breakdownMetric(acc.posts)), [acc]);
  const table = useMemo(() => formatTable(acc.posts), [acc]);
  const split = useMemo(() => engagementSplit(acc.posts), [acc]);
  const demoDims = acc.demographics.status === "ok" ? acc.demographics.dimensions : {};
  const hasDemo = acc.demographics.status === "ok" && Object.values(demoDims).some((d) => d && d.length);

  // Baseline lookup for the content drawer (each post is scored vs its own account).
  const accByPlatform = useMemo(() => new Map(accounts.map((a) => [a.account.platform, a])), [accounts]);
  const openBaseline = openPost ? (accByPlatform.get(openPost.platform)?.baseline[openPost.format] ?? accByPlatform.get(openPost.platform)?.baseline.all ?? null) : null;

  // A newly-connected / barely-active single account: show a useful low-data
  // state rather than a giant empty chart.
  const lowData = !isAll && acc.posts.length < 2 && !Object.values(acc.series).some((s) => s && s.current.some((p) => p.value != null));

  return (
    <div className="uni">
      {/* ---- title header ---- */}
      <div className="uni-titlebar">
        <div className="uni-titlecopy">
          <h1>Analytics</h1>
          <p>See what happened, understand why, and find what your strategy is missing.</p>
        </div>
        <div className="uni-controls">
          <DateRangeSelector maxDays={maxDays} />
          <a href="/api/export" download className="uni-btn ghost"><Download size={14} /> Export</a>
        </div>
      </div>

      {/* ---- tabs ---- */}
      <div className="uni-tabs" role="tablist" aria-label="Analytics sections">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={t === tab} className={`uni-tab${t === tab ? " on" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ================= OVERVIEW ================= */}
      {tab === "overview" && (
        <>
          {/* KPI row */}
          <div className="uni-kpis uni-kpis-lg">
            {kpiCards.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.key} className="uni-kpi" title={!isAll ? acc.kpis[k.key as MetricKey]?.source : undefined}>
                  <span className="uni-kpi-top">
                    <span className="uni-kpi-ico"><Icon size={15} /></span>
                    <span className="uni-kpi-label">{k.label}</span>
                  </span>
                  <span className="uni-kpi-value">{fmtValue(k.value, k.unit)}
                    {k.delta && <span className={`uni-kpi-delta ${k.delta.up ? "up" : "down"}`}>{k.delta.text}</span>}
                  </span>
                  <span className="uni-kpi-sub">{k.value == null ? "not available" : k.delta ? "vs. previous 30 days" : (k.note ?? "")}</span>
                </div>
              );
            })}
            {topPerformer && (
              <div className="uni-kpi uni-top">
                <span className="uni-kpi-top"><span className="uni-kpi-ico hot"><Flame size={14} /></span><span className="uni-kpi-label">Top Performer</span></span>
                <div className="uni-top-body">
                  <span className="uni-top-thumb" style={{ backgroundImage: topPerformer.thumb ? `url(${topPerformer.thumb})` : undefined }} />
                  <div className="uni-top-meta">
                    <span className="uni-top-title">{topPerformer.title || "(no caption)"}</span>
                    <span className="uni-top-stat">{fmtN(topPerformer.metrics.views ?? topPerformer.engagement)} {topPerformer.metrics.views != null ? "views" : "interactions"}{topPerformer.multiplier != null ? ` · ${fmtMult(topPerformer.multiplier)} typical` : ""}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {lowData ? (
            <section className="uni-panel uni-lowdata">
              <h3>Limited activity</h3>
              <p>SOCIA needs more activity on {acc.account.name ?? cap.label} before it can calculate a meaningful trend.</p>
              <div className="uni-lowdata-stats">
                {kpiCards.filter((k) => k.value != null).map((k) => (
                  <span key={k.key} className="uni-lowdata-stat"><b>{fmtValue(k.value, k.unit)}</b> {k.label.toLowerCase()}</span>
                ))}
              </div>
              <p className="uni-chart-note">As {cap.label} activity grows, this fills into full analytics.</p>
            </section>
          ) : (
          <div className="uni-grid">
            {/* left column */}
            <div className="uni-col-main">
              <section className="uni-panel">
                <div className="uni-panel-head uni-perf-head">
                  <h3>Performance Over Time</h3>
                  <div className="uni-perf-ctrls">
                    <div className="uni-seg">
                      {([["views", "Views"], ["engagement", "Engagement"], ["followers", "Followers"], ["content", "Content"]] as const).map(([m, l]) => (
                        <button key={m} className={`uni-seg-b${metricTab === m ? " on" : ""}`} onClick={() => setMetricTab(m)}>{l}</button>
                      ))}
                    </div>
                    <div className="uni-perf-right">
                      {metricTab !== "content" && display === "raw" && (
                        <div className="uni-seg">
                          {([["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]] as const).map(([g, l]) => (
                            <button key={g} className={`uni-seg-b${gran === g ? " on" : ""}`} onClick={() => setGran(g)}>{l}</button>
                          ))}
                        </div>
                      )}
                      <div className="uni-disp">
                        <button className="uni-disp-btn" onClick={() => setDispOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={dispOpen}>
                          {display === "raw" ? "Raw performance" : "vs. Typical"} <ChevronDown size={13} />
                        </button>
                        {dispOpen && (
                          <>
                            <div className="uni-acctsel-scrim" onClick={() => setDispOpen(false)} />
                            <div className="uni-disp-menu" role="listbox">
                              <button className={`uni-disp-item${display === "raw" ? " on" : ""}`} onClick={() => { setDisplay("raw"); setDispOpen(false); }}>Raw performance</button>
                              <button className={`uni-disp-item${display === "typical" ? " on" : ""}`} onClick={() => { setDisplay("typical"); setDispOpen(false); }}>vs. Typical</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {display === "typical" ? (
                  compareData.length ? (
                    <div className="uni-compare">
                      {compareData.map((r) => (
                        <div key={r.platform} className="uni-rank">
                          <span className="uni-rank-top"><span className="uni-rank-mult">{fmtMult(r.mult)}</span> <span className="uni-rank-lbl">{platformCapability(r.platform).label} · vs. its typical · {r.n} post{r.n === 1 ? "" : "s"}</span></span>
                          <span className="uni-rank-track"><span className="uni-rank-fill" style={{ width: `${Math.max(6, Math.min(100, Math.round((r.mult / (compareData[0]?.mult || 1)) * 100)))}%`, background: TINT[r.platform] }} /></span>
                        </div>
                      ))}
                      <p className="uni-chart-note">Each account&apos;s median post this period vs its own baseline. 1× is typical; above 1× is outperforming its norm.</p>
                    </div>
                  ) : <Empty>Not enough posts with a baseline to compare accounts yet.</Empty>
                ) : metricTab === "content" ? (
                  <ContentTimeline posts={graphPosts} metric={activeMetric} rangeDays={rangeDays} onOpen={setOpenPost} />
                ) : (
                  lines.length ? <MultiTrend lines={lines} height={240} /> : <Empty>No {metricLabel(platform, trendMetric).toLowerCase()} time-series on the selected accounts — try the Content view.</Empty>
                )}

                {/* account chips row */}
                <div className="uni-chips">
                  <div className="uni-acctsel">
                    <button className="uni-acctsel-btn chip" onClick={() => setSelOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={selOpen}>
                      {isAll ? <><span className="uni-ctx-ico">∑</span> All Accounts ({accounts.length})</> : <><span className="uni-legend-dot" style={{ background: TINT[acc.account.platform] }} /> {acc.account.handle ? `@${acc.account.handle.replace(/^@/, "")}` : acc.account.name}</>}
                      <ChevronDown size={13} />
                    </button>
                    {selOpen && (
                      <>
                        <div className="uni-acctsel-scrim" onClick={() => setSelOpen(false)} />
                        <div className="uni-acctsel-menu" role="listbox">
                          {showAllOption && <button role="option" aria-selected={isAll} className={`uni-acctsel-item${isAll ? " on" : ""}`} onClick={() => { setSel("all"); setSelOpen(false); }}><span className="uni-ctx-ico">∑</span><span className="uni-acctsel-name">All Accounts</span><span className="uni-acctsel-sub">{accounts.length} connected</span></button>}
                          {accounts.map((a, i) => (
                            <button key={`${a.account.platform}-${a.account.accountId}`} role="option" aria-selected={sel === i} className={`uni-acctsel-item${sel === i ? " on" : ""}`} onClick={() => { setSel(i); setPf("top"); setSelOpen(false); }}>
                              <span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />
                              <span className="uni-acctsel-name">{a.account.name ?? a.account.handle ?? platformCapability(a.account.platform).label}</span>
                              <span className="uni-acctsel-sub">{platformCapability(a.account.platform).label}{a.account.handle ? ` · @${a.account.handle.replace(/^@/, "")}` : ""}</span>
                            </button>
                          ))}
                          {tiktokComingSoon && <span className="uni-acctsel-item soon"><span className="uni-legend-dot" style={{ background: TINT.tiktok }} /><span className="uni-acctsel-name">TikTok</span><span className="uni-acctsel-sub">Coming soon</span></span>}
                          <a href="/settings#accounts" className="uni-acctsel-item add">+ Connect account</a>
                        </div>
                      </>
                    )}
                  </div>
                  {isAll && accounts.map((a, i) => (
                    <button key={`${a.account.platform}-${a.account.accountId}`} className={`uni-chip${visible.has(i) ? " on" : ""}`} onClick={() => setVisible((v) => { const n = new Set(v); if (n.has(i)) { if (n.size > 1) n.delete(i); } else n.add(i); return n; })} title="Toggle on the graph">
                      <span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />{a.account.handle ? `@${a.account.handle.replace(/^@/, "")}` : platformCapability(a.account.platform).label}
                    </button>
                  ))}
                  {isAll && tiktokComingSoon && <span className="uni-chip soon">TikTok · soon</span>}
                  <a href="/settings#accounts" className="uni-chip-add">+ Add account</a>
                </div>
              </section>

              <section className="uni-panel">
                <div className="uni-panel-head"><h3>Recent Content Performance</h3></div>
                <ContentTable posts={ctxPosts} onOpen={setOpenPost} />
              </section>
            </div>

            {/* right rail */}
            <div className="uni-col-rail">
              {isAll && all.platforms.some((p) => p.views != null) && (
                <section className="uni-panel">
                  <div className="uni-panel-head"><h3>Platform Breakdown</h3></div>
                  <PlatformDonut slices={all.platforms.filter((p) => p.views != null).map((p) => ({ platform: p.platform, value: p.views!, share: p.share }))} total={all.totals.views ?? 0} label="Total views" />
                </section>
              )}

              <section className="uni-panel">
                <div className="uni-panel-head"><h3>SOCIA Insights</h3><button className="uni-link" onClick={() => askSocia({ context: { page: "analytics", range: String(rangeDays), metric: activeMetric ?? undefined } })}>Ask</button></div>
                {insights.length ? <div className="uni-insights-col">{insights.slice(0, 4).map((ins) => <InsightCard key={ins.id} ins={ins} />)}</div> : <Empty>Insights appear once SOCIA has enough posts to back them with evidence.</Empty>}
              </section>

              {isAll && platformRanks.length > 0 && (
                <section className="uni-panel">
                  <div className="uni-panel-head"><h3>Top Performing Platforms</h3></div>
                  <div className="uni-ranks">
                    {platformRanks.map((r) => (
                      <div key={r.platform} className="uni-rank">
                        <span className="uni-rank-top"><span className="uni-rank-mult">{fmtMult(r.mult)}</span> <span className="uni-rank-lbl">{platformCapability(r.platform).label} · typical performance</span></span>
                        <span className="uni-rank-track"><span className="uni-rank-fill" style={{ width: `${Math.max(6, Math.round((r.mult / maxRank) * 100))}%`, background: TINT[r.platform] }} /></span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
          )}
        </>
      )}

      {/* ================= CONTENT ================= */}
      {tab === "content" && (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Recent Content Performance</h3></div>
            <ContentTable posts={ctxPosts} onOpen={setOpenPost} />
          </section>
          {!isAll && (
            <>
              <section className="uni-panel">
                <div className="uni-panel-head"><h3>Content performance</h3>
                  <div className="uni-seg">{(["top", "under", "breakout"] as PostFilter[]).map((k) => <button key={k} className={`uni-seg-b${pf === k ? " on" : ""}`} onClick={() => setPf(k)}>{k === "top" ? "Top" : k === "under" ? "Underperforming" : "Breakouts"}</button>)}</div>
                </div>
                {filterPosts(acc.posts, pf).length ? (
                  <div className="uni-content">{filterPosts(acc.posts, pf).slice(0, 18).map((p) => (
                    <a key={p.id} className="uni-card" href={p.permalink ?? undefined} target="_blank" rel="noreferrer">
                      <span className="uni-card-thumb" style={{ backgroundImage: p.thumb ? `url(${p.thumb})` : undefined }}><PlatformBadge platform={p.platform} />{p.multiplier != null && <span className={`uni-mult${p.multiplier >= 1 ? " up" : ""}`}>{fmtMult(p.multiplier)}</span>}</span>
                      <span className="uni-card-stat">{p.metrics.views != null ? `${fmtN(p.metrics.views)} views` : p.engagement != null ? `${fmtN(p.engagement)} interactions` : "—"}</span>
                      <span className="uni-card-title">{p.title || "(no caption)"}</span>
                    </a>
                  ))}</div>
                ) : <Empty>{pf === "top" ? "No posts synced yet." : acc.baseline.all ? "Nothing here in this period." : "Appears once SOCIA has a baseline (a few posts with known engagement)."}</Empty>}
              </section>
              <section className="uni-panel">
                <div className="uni-panel-head"><h3>By format</h3><span className="uni-sub">{breakdown.metric === "views" ? "Views" : "Interactions"} by format · {rangeLabel}</span></div>
                {breakdown.slices.length ? (
                  <>
                    <Bars items={breakdown.slices.map((s) => ({ label: `${s.label} (${s.count})`, value: s.value, share: s.share, sub: `${fmtN(s.value)} · ${Math.round(s.share * 100)}%` }))} />
                    {table.length > 1 && (
                      <table className="uni-table">
                        <thead><tr><th>Format</th><th>Posts</th><th>Median views</th><th>Median interactions</th><th>Median ×</th></tr></thead>
                        <tbody>{table.map((r) => <tr key={r.format}><td>{r.label}</td><td>{r.count}</td><td>{fmtN(r.medViews)}</td><td>{fmtN(r.medEng)}</td><td>{r.medMult != null ? fmtMult(r.medMult) : "—"}</td></tr>)}</tbody>
                      </table>
                    )}
                  </>
                ) : <Empty>No posts in this period to break down.</Empty>}
              </section>
            </>
          )}
        </>
      )}

      {/* ================= AUDIENCE ================= */}
      {tab === "audience" && (isAll ? (
        <>
          <div className="uni-kpis">
            <div className="uni-kpi" title="Followers and subscribers on different platforms are different people, not one unique audience.">
              <span className="uni-kpi-label">Total audience</span>
              <span className="uni-kpi-value">{fmtValue(all.totals.followers ?? null, "count")}</span>
              <span className="uni-kpi-foot"><span className="uni-kpi-period">across {all.audiencePlatforms.length} platform{all.audiencePlatforms.length === 1 ? "" : "s"} · not unique people</span></span>
            </div>
          </div>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Audience by platform</h3></div>
            {accounts.some((a) => a.kpis.followers?.value != null) ? (
              <Bars items={accounts.filter((a) => a.kpis.followers?.value != null).sort((a, b) => (b.kpis.followers!.value! - a.kpis.followers!.value!)).map((a) => ({ label: `${platformCapability(a.account.platform).label} · ${a.account.audienceLabel}`, value: a.kpis.followers!.value!, share: all.totals.followers ? a.kpis.followers!.value! / all.totals.followers : 0, sub: fmtN(a.kpis.followers!.value) }))} />
            ) : <Empty>No audience counts returned yet.</Empty>}
          </section>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Audience change this period</h3></div>
            {accounts.some((a) => a.series.net_followers?.total != null) ? (
              <div className="uni-changes">
                {accounts.filter((a) => a.series.net_followers?.total != null).map((a) => { const net = a.series.net_followers!.total!; return (
                  <div key={a.account.platform} className="uni-change">
                    <span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />
                    <span className="uni-change-lbl">{platformCapability(a.account.platform).label}</span>
                    <span className={`uni-change-val ${net >= 0 ? "up" : "down"}`}>{net >= 0 ? "+" : ""}{fmtN(net)} {a.account.audienceLabel.toLowerCase()}</span>
                  </div>
                ); })}
              </div>
            ) : <Empty>No audience-change series yet — SOCIA records it daily from connect onward.</Empty>}
          </section>
        </>
      ) : (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>{acc.account.audienceLabel} history</h3></div>
            {acc.series.followers ? <UniTrend series={acc.series.followers} /> : <Empty>{cap.label} doesn&apos;t provide {acc.account.audienceLabel.toLowerCase()} history. SOCIA records it once a day from connect onward.</Empty>}
          </section>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Demographics</h3>{acc.demographics.basis && <span className="uni-sub">{acc.demographics.basis}</span>}</div>
            {hasDemo ? (
              <div className="uni-demo">
                {demoDims.age?.length ? <div className="uni-demo-col"><h4>Age</h4><Bars items={demoDims.age.map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
                {demoDims.gender?.length ? <div className="uni-demo-col"><h4>Gender</h4><Bars items={demoDims.gender.map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
                {demoDims.city?.length ? <div className="uni-demo-col"><h4>Top locations</h4><Bars items={demoDims.city.slice(0, 6).map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
              </div>
            ) : <Empty>{acc.demographics.reason || `${cap.label} doesn't provide audience demographics for this account.`}</Empty>}
          </section>
        </>
      ))}

      {/* ================= POSTING TIMES ================= */}
      {tab === "times" && (
        isAll ? (
          <>
            <p className="uni-sub uni-times-intro">Posting times are specific to each platform — SOCIA never invents one universal &quot;best time.&quot;</p>
            {accounts.map((a) => <PostingTimesPanel key={a.account.platform} account={a} />)}
          </>
        ) : (
          <PostingTimesPanel account={acc} />
        )
      )}

      {/* ================= GROWTH ================= */}
      {tab === "growth" && (isAll ? (
        <section className="uni-panel">
          <div className="uni-panel-head"><h3>Growth by account</h3><span className="uni-sub">{rangeLabel}</span></div>
          <table className="uni-table">
            <thead><tr><th>Account</th><th>Net audience</th><th>Views</th><th>Posts</th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const net = a.series.net_followers?.total ?? null;
                const views = a.kpis.views?.value ?? null;
                const since = Date.now() - rangeDays * 86400000;
                const posts = a.posts.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= since).length;
                return (
                  <tr key={a.account.platform}>
                    <td className="l"><span className="uni-ct-plat"><span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />{platformCapability(a.account.platform).label}</span></td>
                    <td>{net == null ? "—" : <span className={net >= 0 ? "uni-ct-mult up" : "uni-ct-mult down"}>{net >= 0 ? "+" : ""}{fmtN(net)}</span>}</td>
                    <td>{fmtN(views)}</td>
                    <td>{posts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="uni-chart-note">Net audience is each platform&apos;s own followers/subscribers gained this period, where it reports a daily series. Views and posts are period totals per account.</p>
        </section>
      ) : (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>{acc.account.audienceLabel} change</h3></div>
            {acc.series.net_followers ? <UniTrend series={acc.series.net_followers} /> : acc.series.followers ? <UniTrend series={acc.series.followers} /> : <Empty>SOCIA records {acc.account.audienceLabel.toLowerCase()} daily from connect; a change series builds over time.</Empty>}
          </section>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Engagement</h3></div>
            {split.parts.length ? <Bars items={split.parts.map((p) => ({ label: metricLabel(platform, p.key), value: p.value, share: p.share ?? 0, sub: `${fmtN(p.value)}${p.share != null ? ` · ${Math.round(p.share * 100)}%` : ""}` }))} /> : <Empty>{cap.label} didn&apos;t return an interaction breakdown for these posts.</Empty>}
          </section>
        </>
      ))}

      <ContentDrawer post={openPost} baseline={openBaseline} onClose={() => setOpenPost(null)} />
    </div>
  );
}
