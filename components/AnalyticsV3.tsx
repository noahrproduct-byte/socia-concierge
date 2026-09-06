"use client";

// Analytics: investigate performance. Deeper than the dashboard, same rules:
// every figure comes from the server already computed and labelled.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Lightbulb, ArrowRight } from "lucide-react";
import KpiCard from "./ov/KpiCard";
import OverviewChart from "./ov/OverviewChart";
import Donut from "./ov/Donut";
import ContentRow from "./ov/ContentRow";
import ContentDrawer from "./ov/ContentDrawer";
import { InsightList } from "./ov/Insights";
import BestTimes from "./ov/BestTimes";
import AudienceBars from "./ov/AudienceBars";
import MiniArea from "./ov/MiniArea";
import DateRangeSelector from "./DateRangeSelector";
import AccountSwitcher from "./AccountSwitcher";
import Mounted from "./ov/Mounted";
import { weekly, rankPosts, fmtNum, audienceInsight, type Kpi, type Series, type MetricId, type Insight, type PostCard, type Slice, type PlatformRow } from "@/lib/overview";
import type { Demographics } from "@/lib/igDemographics";
import type { CalPost } from "@/lib/audience";

export type AnalyticsData = {
  handle: string | null;
  rangeLabel: string;
  rangeDays: number;
  kpis: Kpi[];
  series: Record<MetricId, Series>;
  insights: Insight[];
  posts: PostCard[];
  baseline: number | null;
  medianViews: number | null;
  breakdown: { slices: Slice[]; metric: "views" | "engagement"; total: number };
  platforms: PlatformRow[];
  demo: Demographics;
  timed: CalPost[];
  followerDelta: number | null;
  followers: number | null;
};

const TABS = [
  ["overview", "Overview"], ["content", "Content Performance"], ["audience", "Audience"], ["times", "Posting Times"], ["growth", "Growth"],
] as const;
const METRICS: MetricId[] = ["views", "engagement", "followers", "reach"];

export default function AnalyticsV3({ d }: { d: AnalyticsData }) {
  const [tab, setTab] = useState<string>("overview");
  const [metric, setMetric] = useState<MetricId>(d.series.views.provenance === "unavailable" ? "engagement" : "views");
  const [compare, setCompare] = useState(true);
  const [gran, setGran] = useState<"day" | "week">(d.rangeDays > 31 ? "week" : "day");
  const [contentTab, setContentTab] = useState<"top" | "under" | "format" | "platform">("top");
  const [open, setOpen] = useState<PostCard | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The timing insight needs the viewer's clock: added after mount only.
  const insights = useMemo(() => {
    if (!mounted) return d.insights;
    const w = audienceInsight(d.timed);
    return w ? [...d.insights, w] : d.insights;
  }, [d.insights, d.timed, mounted]);

  // Section tabs follow the scroll position.
  useEffect(() => {
    const els = TABS.map(([id]) => document.getElementById(`an-${id}`)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setTab(vis[0].target.id.replace("an-", ""));
    }, { rootMargin: "-20% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const jump = (id: string) => {
    setTab(id);
    document.getElementById(`an-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const base = d.series[metric];
  const series: Series = useMemo(() => {
    if (gran === "day") return base;
    const mode = metric === "followers" ? "last" : "sum";
    return { ...base, current: weekly(base.current, mode), previous: weekly(base.previous, mode) };
  }, [base, gran, metric]);

  const contentPosts = useMemo(() => {
    if (contentTab === "top") return rankPosts(d.posts, "views", 10);
    if (contentTab === "under") return d.posts.filter((p) => p.multiplier != null && p.multiplier < 0.8).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0)).slice(0, 10);
    if (contentTab === "format") {
      const seen = new Map<string, PostCard[]>();
      for (const p of rankPosts(d.posts, "views", d.posts.length)) seen.set(p.format, [...(seen.get(p.format) ?? []), p].slice(0, 3));
      return [...seen.values()].flat();
    }
    return rankPosts(d.posts, "views", 10);
  }, [contentTab, d.posts]);

  const totalDelta = series.total != null && series.prevTotal != null && series.prevTotal > 0 ? ((series.total - series.prevTotal) / series.prevTotal) * 100 : null;

  return (
    <div className="av">
      <header className="dv-head">
        <div>
          <h1>Analytics</h1>
          <p>Understand what&apos;s working, what&apos;s not, and where to grow.</p>
        </div>
        <div className="dv-head-actions">
          <Mounted fallback={<span className="ov-ctl-ph" aria-hidden />}>
            <AccountSwitcher />
            <DateRangeSelector />
          </Mounted>
          <a href="/api/export" download className="ov-btn ghost"><Download size={14} /> Export</a>
        </div>
      </header>

      <nav className="av-tabs" aria-label="Analytics sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "true" : undefined} onClick={() => jump(id)}>{label}</button>
        ))}
      </nav>

      <div id="an-overview" className="ov-kpis four">
        {d.kpis.map((k) => <KpiCard key={k.id} kpi={k} iconLeft />)}
      </div>

      <div className="av-grid">
        <div className="av-main">
          <section className="ov-card" aria-labelledby="av-perf-h">
            <div className="ov-card-head wrap">
              <h2 id="av-perf-h">Performance Over Time</h2>
              <div className="ov-seg" role="tablist" aria-label="Metric">
                {METRICS.map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? "on" : ""} disabled={d.series[m].provenance === "unavailable"} title={d.series[m].note} onClick={() => setMetric(m)}>{d.series[m].label}</button>
                ))}
              </div>
              <div className="av-controls">
                <button type="button" className={`ov-toggle${compare ? " on" : ""}`} aria-pressed={compare} onClick={() => setCompare((v) => !v)}>vs. previous period</button>
                <select className="ov-select" value={gran} onChange={(e) => setGran(e.target.value as "day" | "week")} aria-label="Granularity">
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                </select>
              </div>
            </div>
            <div className="av-perf-summary">
              <b>{series.total != null ? fmtNum(series.total) : "—"}</b>
              <span>{series.label.toLowerCase()} {metric === "followers" ? "now" : `in the ${d.rangeLabel.toLowerCase()}`}</span>
              {totalDelta != null && <em className={totalDelta >= 0 ? "up" : "down"}>{totalDelta >= 0 ? "↑" : "↓"} {Math.abs(totalDelta).toFixed(1)}% vs. previous period</em>}
              {series.prevTotal == null && series.total != null && <em className="muted">no comparable previous period yet</em>}
            </div>
            <OverviewChart series={series} granularity={gran} showPrevious={compare} height={260} />
            <p className="ov-source">{series.note}</p>
          </section>

          <section id="an-content" className="ov-card" aria-labelledby="av-content-h">
            <div className="ov-card-head wrap">
              <h2 id="av-content-h">Content Performance</h2>
              <div className="ov-seg" role="tablist" aria-label="Content view">
                {([["top", "Top Content"], ["under", "Underperforming"], ["format", "By Format"], ["platform", "By Platform"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={contentTab === id} className={contentTab === id ? "on" : ""} onClick={() => setContentTab(id)}>{label}</button>
                ))}
              </div>
              <Link href="#posts" className="ov-link" onClick={(e) => { e.preventDefault(); document.getElementById("posts")?.scrollIntoView({ behavior: "smooth" }); }}>View all <ArrowRight size={13} /></Link>
            </div>
            {contentTab === "platform" && (
              <p className="ov-source">Only Instagram is connected, so every post here is Instagram. Connect another account in Settings to compare platforms.</p>
            )}
            {contentTab === "under" && !contentPosts.length && <div className="ov-empty small">No post in this period fell below 80% of your median. Nothing is underperforming by your own baseline.</div>}
            {(contentTab !== "under" || contentPosts.length > 0) && <ContentRow posts={contentPosts} onOpen={setOpen} size="lg" />}
          </section>

          <div className="av-two">
            <section id="an-audience" className="ov-card" aria-labelledby="av-demo-h">
              <div className="ov-card-head">
                <h2 id="av-demo-h">Audience Demographics</h2>
              </div>
              <AudienceBars demo={d.demo} />
            </section>
            <section className="ov-card" aria-labelledby="av-break-h">
              <div className="ov-card-head">
                <h2 id="av-break-h">Content Breakdown</h2>
                <span className="ov-range-label">{d.breakdown.metric === "views" ? "Views" : "Engagement"} by format</span>
              </div>
              {d.breakdown.slices.length ? (
                <Donut slices={d.breakdown.slices} total={d.breakdown.total} centerLabel={d.breakdown.metric === "views" ? "Total Views" : "Engagement"} size={150} />
              ) : (
                <div className="ov-empty small">No posts in this period.</div>
              )}
            </section>
          </div>
        </div>

        <aside className="av-side">
          <section className="ov-card" aria-labelledby="av-ins-h">
            <div className="ov-card-head">
              <h2 id="av-ins-h"><span className="ov-h-ico primary"><Lightbulb size={14} /></span> Key Insights</h2>
              <Link href="/chat" className="ov-link">Ask</Link>
            </div>
            <InsightList insights={insights.slice(0, 4)} posts={d.posts} />
          </section>

          <section id="an-growth" className="ov-card" aria-labelledby="av-growth-h">
            <div className="ov-card-head">
              <h2 id="av-growth-h">Audience Growth</h2>
              <Link href="#an-overview" className="ov-link" onClick={(e) => { e.preventDefault(); setMetric("followers"); jump("overview"); }}>View details</Link>
            </div>
            <div className="av-growth-num">
              <b>{d.followers != null ? d.followers.toLocaleString("en-US") : "—"}</b>
              <span>Total followers</span>
              {d.followerDelta != null && <em className={d.followerDelta >= 0 ? "up" : "down"}>{d.followerDelta >= 0 ? "↑" : "↓"} {Math.abs(d.followerDelta).toLocaleString("en-US")} <small>{d.rangeLabel.toLowerCase()}</small></em>}
            </div>
            <MiniArea points={d.series.followers.current} />
            <p className="ov-source">{d.series.followers.note}</p>
          </section>

          <section className="ov-card" aria-labelledby="av-plat-h">
            <div className="ov-card-head">
              <h2 id="av-plat-h">Platform Breakdown</h2>
              <span className="ov-range-label">{d.rangeLabel}</span>
            </div>
            <ul className="av-plat">
              {d.platforms.map((p) => (
                <li key={p.id} className={p.connected ? "" : "off"}>
                  <i className={`dot ${p.id}`} />
                  <span className="av-plat-name">{p.label}</span>
                  {p.connected ? (
                    <>
                      <b>{p.value != null ? fmtNum(p.value) : "—"}</b>
                      {p.deltaPct != null && <em className={p.deltaPct >= 0 ? "up" : "down"}>{p.deltaPct >= 0 ? "↑" : "↓"} {Math.abs(p.deltaPct).toFixed(0)}%</em>}
                      <span className="av-plat-bar"><i style={{ width: `${Math.round(p.share * 100)}%` }} /></span>
                    </>
                  ) : (
                    <Link href="/settings#accounts" className="av-plat-connect">Not connected</Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section id="an-times" className="ov-card" aria-labelledby="av-times-h">
            <div className="ov-card-head">
              <h2 id="av-times-h">Best Times to Post</h2>
            </div>
            <BestTimes posts={d.timed} />
          </section>
        </aside>
      </div>

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
    </div>
  );
}
