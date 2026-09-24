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
import { ChevronDown, Clock, Download, Flame, Lightbulb, Sparkles, TrendingDown, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import { askSocia } from "@/lib/ask";
import DateRangeSelector from "@/components/DateRangeSelector";
import UniTrend from "./UniTrend";
import MultiTrend, { type TrendLine } from "./MultiTrend";
import ContentTimeline from "./ContentTimeline";
import ContentTable from "./ContentTable";
import { median } from "@/lib/metrics";
import { metricCapability, metricLabel, platformCapability } from "@/lib/analytics/capabilities";
import { breakdownMetric, engagementSplit, filterPosts, formatBreakdown, formatTable, postingWindows, type PostFilter } from "@/lib/analytics/derive";
import { accountInsights, crossPlatformInsights, type AnalyticsInsight, type InsightKind } from "@/lib/analytics/insights";
import { aggregateAccounts } from "@/lib/analytics/aggregate";
import { relText } from "@/lib/postingTimes";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedPost, NormalizedSeries, Platform, Status } from "@/lib/analytics/types";
import "./universal.css";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };
const STATUS_CHIP: Record<Status, { label: string; cls: string } | null> = {
  VERIFIED: { label: "Observed", cls: "obs" }, CALCULATED: { label: "Derived", cls: "der" }, AI_DERIVED: { label: "AI", cls: "ai" }, UNAVAILABLE: null,
};
const INSIGHT_ICON: Record<InsightKind, LucideIcon> = { breakout: Flame, format: Lightbulb, timing: Clock, trend: TrendingUp, cadence: TrendingDown, platform: Zap };

type GraphMode = "trend" | "content" | "compare";
const MODES: [GraphMode, string][] = [["trend", "Trend"], ["content", "Content"], ["compare", "Compare"]];
type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content Performance"], ["audience", "Audience"], ["times", "Posting Times"], ["growth", "Growth"]];
const SERIES_PREF: MetricKey[] = ["views", "engagement", "watch_time", "net_followers", "reach", "followers"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS = ["12–3a", "3–6a", "6–9a", "9a–12p", "12–3p", "3–6p", "6–9p", "9p–12a"];

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

export default function UniversalAnalytics({
  accounts, rangeLabel, rangeDays, maxDays, canCrossPlatform = false, tiktokComingSoon = true,
}: {
  accounts: NormalizedAccountAnalytics[];
  rangeLabel: string; rangeDays: number; maxDays?: number; canCrossPlatform?: boolean; tiktokComingSoon?: boolean;
}) {
  const showAllOption = canCrossPlatform && accounts.length > 1;
  const [sel, setSel] = useState<number | "all">(showAllOption ? "all" : 0);
  const [selOpen, setSelOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<GraphMode>("trend");
  const [display, setDisplay] = useState<"raw" | "typical">("raw");
  const [visible, setVisible] = useState<Set<number>>(() => new Set(accounts.map((_, i) => i)));
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

  const chartMetrics = useMemo(() => {
    const present = new Set<MetricKey>();
    for (const a of graphAccounts) for (const k of Object.keys(a.series) as MetricKey[]) if (a.series[k]) present.add(k);
    (["views", "engagement"] as MetricKey[]).forEach((k) => present.add(k)); // content mode can chart these even without a series
    return SERIES_PREF.filter((k) => present.has(k)).concat([...present].filter((k) => !SERIES_PREF.includes(k)));
  }, [graphAccounts]);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const activeMetric: MetricKey = (metric && chartMetrics.includes(metric) ? metric : chartMetrics[0]) ?? "views";
  const lines: TrendLine[] = graphAccounts.filter((a) => a.series[activeMetric]).map((a) => ({ platform: a.account.platform, label: platformCapability(a.account.platform).label, series: a.series[activeMetric]! }));
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

  // KPI cards for the current context.
  const kpiCards: { key: string; label: string; value: number | null; unit: Unit; delta: Delta; note?: string; status: Status }[] = isAll
    ? [
        { key: "views", label: "Total Views", value: all.totals.views ?? null, unit: "count", delta: sumSeriesDelta(accounts, "views"), status: "VERIFIED" },
        { key: "engagement", label: "Interactions", value: all.totals.engagement ?? null, unit: "count", delta: null, status: "CALCULATED" },
        { key: "followers", label: "Total Audience", value: all.totals.followers ?? null, unit: "count", delta: null, note: `across ${all.audiencePlatforms.length} platform${all.audiencePlatforms.length === 1 ? "" : "s"}`, status: "VERIFIED" },
        { key: "posts", label: "Content Published", value: all.totals.posts ?? null, unit: "count", delta: null, status: "CALCULATED" },
      ]
    : (["views", "engagement_rate", "followers", "posts"] as MetricKey[])
        .filter((k) => acc.kpis[k])
        .map((k) => ({ key: k, label: metricLabel(platform, k) === "Followers" || metricLabel(platform, k) === "Subscribers" ? metricLabel(platform, k) : metricLabel(platform, k), value: acc.kpis[k]!.value, unit: metricCapability(platform, k)?.unit ?? "count", delta: sumSeriesDelta([acc], k), note: acc.kpis[k]!.period, status: acc.kpis[k]!.status }));

  const [pf, setPf] = useState<PostFilter>("top");
  const breakdown = useMemo(() => formatBreakdown(acc.posts, breakdownMetric(acc.posts)), [acc]);
  const table = useMemo(() => formatTable(acc.posts), [acc]);
  const windows = useMemo(() => postingWindows(acc.posts), [acc]);
  const split = useMemo(() => engagementSplit(acc.posts), [acc]);
  const demoDims = acc.demographics.status === "ok" ? acc.demographics.dimensions : {};
  const hasDemo = acc.demographics.status === "ok" && Object.values(demoDims).some((d) => d && d.length);

  return (
    <div className="uni">
      {/* ---- title header ---- */}
      <div className="uni-titlebar">
        <div className="uni-titlecopy">
          <h1>Analytics</h1>
          <p>See what happened, understand why, and find what your strategy is missing.</p>
        </div>
        <div className="uni-controls">
          <div className="uni-acctsel">
            <button className="uni-acctsel-btn" onClick={() => setSelOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={selOpen}>
              {isAll ? <><span className="uni-ctx-ico">∑</span> All Accounts</> : <><span className="uni-legend-dot" style={{ background: TINT[acc.account.platform] }} /> {acc.account.handle ? `@${acc.account.handle.replace(/^@/, "")}` : acc.account.name}</>}
              <ChevronDown size={14} />
            </button>
            {selOpen && (
              <>
                <div className="uni-acctsel-scrim" onClick={() => setSelOpen(false)} />
                <div className="uni-acctsel-menu" role="listbox">
                  {showAllOption && (
                    <button role="option" aria-selected={isAll} className={`uni-acctsel-item${isAll ? " on" : ""}`} onClick={() => { setSel("all"); setSelOpen(false); }}>
                      <span className="uni-ctx-ico">∑</span><span className="uni-acctsel-name">All Accounts</span><span className="uni-acctsel-sub">{accounts.length} connected</span>
                    </button>
                  )}
                  {accounts.map((a, i) => (
                    <button key={`${a.account.platform}-${a.account.accountId}`} role="option" aria-selected={sel === i} className={`uni-acctsel-item${sel === i ? " on" : ""}`} onClick={() => { setSel(i); setMetric(null); setPf("top"); setSelOpen(false); }}>
                      <span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />
                      <span className="uni-acctsel-name">{a.account.name ?? a.account.handle ?? platformCapability(a.account.platform).label}</span>
                      <span className="uni-acctsel-sub">{platformCapability(a.account.platform).label}{a.account.handle ? ` · @${a.account.handle.replace(/^@/, "")}` : ""}</span>
                    </button>
                  ))}
                  {tiktokComingSoon && <span className="uni-acctsel-item soon"><span className="uni-legend-dot" style={{ background: TINT.tiktok }} /><span className="uni-acctsel-name">TikTok</span><span className="uni-acctsel-sub">Coming soon</span></span>}
                  <a href="/settings" className="uni-acctsel-item add">+ Connect account</a>
                </div>
              </>
            )}
          </div>
          <DateRangeSelector maxDays={maxDays} />
          {!isAll && platform === "instagram" && <a href="/api/export" download className="uni-btn ghost"><Download size={14} /> Export</a>}
          <button type="button" className="uni-btn primary" onClick={() => askSocia({ context: { page: "analytics", range: String(rangeDays), metric: activeMetric ?? undefined } })}><Sparkles size={14} /> Ask SOCIA</button>
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
            {kpiCards.map((k) => (
              <div key={k.key} className="uni-kpi">
                <span className="uni-kpi-label">{k.label}</span>
                <span className="uni-kpi-value">{fmtValue(k.value, k.unit)}
                  {k.delta && <span className={`uni-kpi-delta ${k.delta.up ? "up" : "down"}`}>{k.delta.text}</span>}
                </span>
                <span className="uni-kpi-foot">{STATUS_CHIP[k.status] && k.value != null && <span className={`uni-tag ${STATUS_CHIP[k.status]!.cls}`}>{STATUS_CHIP[k.status]!.label}</span>}<span className="uni-kpi-period">{k.note ?? (k.delta ? "vs. previous period" : "")}</span></span>
              </div>
            ))}
            {topPerformer && (
              <div className="uni-kpi uni-top">
                <span className="uni-kpi-label"><Flame size={13} /> Top Performer</span>
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

          <div className="uni-grid">
            {/* left column */}
            <div className="uni-col-main">
              <section className="uni-panel">
                <div className="uni-panel-head uni-perf-head">
                  <h3>Performance Over Time</h3>
                  <div className="uni-perf-ctrls">
                    <div className="uni-seg">{MODES.map(([m, l]) => <button key={m} className={`uni-seg-b${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>{l}</button>)}</div>
                    {mode !== "compare" && chartMetrics.length > 1 && <div className="uni-seg">{chartMetrics.map((k) => <button key={k} className={`uni-seg-b${k === activeMetric ? " on" : ""}`} onClick={() => setMetric(k)}>{metricLabel(platform, k)}</button>)}</div>}
                    {mode === "content" && <div className="uni-seg">{(["raw", "typical"] as const).map((d) => <button key={d} className={`uni-seg-b${display === d ? " on" : ""}`} onClick={() => setDisplay(d)}>{d === "raw" ? "Raw" : "vs. Typical"}</button>)}</div>}
                  </div>
                </div>

                {mode === "trend" && (lines.length ? <MultiTrend lines={lines} /> : <Empty>No time-series for {metricLabel(platform, activeMetric).toLowerCase()} on the selected accounts. It may only exist as content totals — try Content mode.</Empty>)}
                {mode === "content" && <ContentTimeline posts={graphPosts} metric={activeMetric} rangeDays={rangeDays} display={display} />}
                {mode === "compare" && (compareData.length ? (
                  <div className="uni-compare">
                    {compareData.map((r) => (
                      <div key={r.platform} className="uni-rank">
                        <span className="uni-rank-top"><span className="uni-rank-mult">{fmtMult(r.mult)}</span> <span className="uni-rank-lbl">{platformCapability(r.platform).label} · vs. its typical · {r.n} post{r.n === 1 ? "" : "s"}</span></span>
                        <span className="uni-rank-track"><span className="uni-rank-fill" style={{ width: `${Math.max(6, Math.min(100, Math.round((r.mult / (compareData[0]?.mult || 1)) * 100)))}%`, background: TINT[r.platform] }} /></span>
                      </div>
                    ))}
                    <p className="uni-chart-note">Each account&apos;s median post this period against its own baseline. 1× is typical; above 1× is outperforming its own norm.</p>
                  </div>
                ) : <Empty>Not enough posts with a baseline to compare accounts yet.</Empty>)}

                {isAll && (
                  <div className="uni-ctxbar">
                    {accounts.map((a, i) => (
                      <button key={`${a.account.platform}-${a.account.accountId}`} className={`uni-ctx uni-vischip${visible.has(i) ? " on" : ""}`} onClick={() => setVisible((v) => { const n = new Set(v); if (n.has(i)) { if (n.size > 1) n.delete(i); } else n.add(i); return n; })}>
                        <span className="uni-legend-dot" style={{ background: TINT[a.account.platform] }} />{visible.has(i) ? "✓ " : ""}{platformCapability(a.account.platform).label}
                      </button>
                    ))}
                    {tiktokComingSoon && <span className="uni-ctx uni-ctx-soon">TikTok · soon</span>}
                  </div>
                )}
              </section>

              <section className="uni-panel">
                <div className="uni-panel-head"><h3>Recent Content Performance</h3></div>
                <ContentTable posts={ctxPosts} />
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
        </>
      )}

      {/* ================= CONTENT ================= */}
      {tab === "content" && (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Recent Content Performance</h3></div>
            <ContentTable posts={ctxPosts} />
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
        <section className="uni-panel"><Empty>Pick a single account above to see its audience — audiences aren&apos;t combined across platforms.</Empty></section>
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
        <section className="uni-panel">
          <div className="uni-panel-head"><h3>Posting times</h3><span className="uni-sub">medians vs your typical post, {windows.posts} dated posts{isAll ? " (selected account)" : ""}</span></div>
          {windows.enough ? (
            <>
              {windows.best.length ? (
                <div className="uni-windows">{windows.best.map((w) => <div key={`${w.day}-${w.block}`} className="uni-window"><span className="uni-window-label">{w.label}</span><span className={`uni-window-rel${w.rel >= 1 ? " up" : ""}`}>{relText(w.rel)}</span><span className="uni-window-n">{w.n} posts{w.confidence === "early" ? " · early signal" : ""}</span></div>)}</div>
              ) : <Empty>No single window stands out above your typical yet.</Empty>}
              <div className="uni-demo" style={{ marginTop: 16 }}>
                <div className="uni-demo-col"><h4>By weekday</h4><Bars items={windows.byDay.filter((r) => r.n > 0).map((r) => ({ label: DOW[r.index], value: r.rel ?? 0, share: r.rel != null && windows.maxRel > 0 ? Math.min(1, r.rel / windows.maxRel) : 0, sub: r.rel != null ? relText(r.rel) : `${r.n} posts` }))} /></div>
                <div className="uni-demo-col"><h4>By time of day</h4><Bars items={windows.byBlock.filter((r) => r.n > 0).map((r) => ({ label: BLOCKS[r.index], value: r.rel ?? 0, share: r.rel != null && windows.maxRel > 0 ? Math.min(1, r.rel / windows.maxRel) : 0, sub: r.rel != null ? relText(r.rel) : `${r.n} posts` }))} /></div>
              </div>
            </>
          ) : <Empty>Not enough dated posts yet to find a reliable posting time — this account has {windows.posts}.</Empty>}
        </section>
      )}

      {/* ================= GROWTH ================= */}
      {tab === "growth" && (isAll ? (
        <section className="uni-panel"><Empty>Pick a single account above to see its growth detail.</Empty></section>
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
    </div>
  );
}
