"use client";

// Dashboard: quick understanding. Every number arrives computed on the server
// from the account's own rows (lib/overview); this file only lays it out.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Send, Target, Film, MapPin, Users, Zap, Plus, CalendarDays, Star } from "lucide-react";
import KpiCard from "./ov/KpiCard";
import OverviewChart from "./ov/OverviewChart";
import Donut from "./ov/Donut";
import ContentRow from "./ov/ContentRow";
import ContentDrawer from "./ov/ContentDrawer";
import { InsightList } from "./ov/Insights";
import DateRangeSelector from "./DateRangeSelector";
import AccountSwitcher from "./AccountSwitcher";
import Mounted from "./ov/Mounted";
import { useGreeting } from "./ov/Greeting";
import { audienceInsight, type Kpi, type Series, type Insight, type PostCard, type Focus, type Upcoming, type GoalTracker, type PlatformRow, type Slice } from "@/lib/overview";
import type { CalPost } from "@/lib/audience";
import { askSocia } from "@/lib/ask";

export type DashboardData = {
  name: string;
  handle: string | null;
  rangeLabel: string;
  kpis: Kpi[];
  series: Record<"views" | "engagement" | "followers", Series>;
  platforms: PlatformRow[];
  platformTotal: number | null;
  platformMetric: "views" | "engagement";
  insights: Insight[];
  top: PostCard[];
  posts: PostCard[];
  baseline: number | null;
  medianViews: number | null;
  focus: Focus | null;
  upcoming: Upcoming[];
  goals: string[];
  trackers: GoalTracker[];
  timed: CalPost[];
};

const TILE_ICON = { video: Film, map: MapPin, users: Users, target: Target } as const;
const STATUS: Record<Upcoming["status"], { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "success" },
  draft: { label: "Draft", tone: "info" },
  publishing: { label: "Publishing", tone: "primary" },
  failed: { label: "Needs review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
};
const CHIPS = [
  { label: "Give me post ideas", href: "/chat?q=Give%20me%20five%20post%20ideas%20for%20this%20week%20based%20on%20what%20is%20working." },
  { label: "What's trending?", href: "/competitors#trends" },
  { label: "Analyze my last post", href: "/chat?q=Analyze%20my%20most%20recent%20post%20and%20tell%20me%20what%20to%20change." },
  { label: "Create a content plan", href: "/tool" },
];

export default function DashboardV3({ d }: { d: DashboardData }) {
  const router = useRouter();
  const [metric, setMetric] = useState<"views" | "engagement" | "followers">(d.series.views.provenance === "unavailable" ? "engagement" : "views");
  const [open, setOpen] = useState<PostCard | null>(null);
  const [ask, setAsk] = useState("");
  const series = d.series[metric];
  // Anything that depends on the viewer's clock renders after mount: the
  // server (UTC) and the browser must agree on the first paint.
  const greet = useGreeting();
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    setClock(new Date());
  }, []);
  // Timing is a client-side insight (viewer's time zone); it joins the list last.
  const insights = useMemo(() => {
    if (!clock) return d.insights;
    const w = audienceInsight(d.timed);
    return w ? [...d.insights, w] : d.insights;
  }, [d.insights, d.timed, clock]);
  const slices: Slice[] = d.platforms
    .filter((p) => p.connected && p.value != null && p.value > 0)
    .map((p) => ({ label: p.label, value: p.value!, share: p.share, count: 0, tone: p.id === "instagram" ? "primary" : p.id === "tiktok" ? "info" : p.id === "youtube" ? "danger" : "info" }));

  return (
    <div className="dv">
      <header className="dv-head">
        <div>
          <h1>{greet}, {d.name} <span aria-hidden>👋</span></h1>
          <p>Here&apos;s what&apos;s happening with your content.</p>
        </div>
        <div className="dv-head-actions">
          <Mounted fallback={<span className="ov-ctl-ph" aria-hidden />}>
            <AccountSwitcher />
            <DateRangeSelector />
          </Mounted>
          <Link href="/tool" className="ov-btn primary"><Sparkles size={14} /> Generate Content</Link>
        </div>
      </header>

      <div className="dv-grid">
        <div className="dv-main">
          <div className="ov-kpis four">
            {d.kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
          </div>

          <section className="ov-card dv-perf" aria-labelledby="dv-perf-h">
            <div className="ov-card-head">
              <h2 id="dv-perf-h">Performance Overview</h2>
              <div className="ov-legend-tabs" role="tablist" aria-label="Metric">
                {(["views", "engagement", "followers"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={metric === m} className={`${metric === m ? "on" : ""} ${m}`} onClick={() => setMetric(m)} disabled={d.series[m].provenance === "unavailable"} title={d.series[m].note}>
                    <i /> {d.series[m].label}
                  </button>
                ))}
              </div>
              <span className="ov-range-label">{d.rangeLabel}</span>
            </div>
            <div className="dv-perf-body">
              <div className="dv-perf-chart">
                <OverviewChart series={series} showPrevious={false} height={220} compact />
                <p className="ov-source">{series.note}</p>
              </div>
              <div className="dv-platforms">
                <h3>Platform Breakdown</h3>
                {slices.length ? (
                  <Donut slices={slices} total={d.platformTotal ?? 0} centerLabel={d.platformMetric === "views" ? "Total Views" : "Interactions"} size={118} />
                ) : (
                  <div className="ov-empty small">No platform data for this period.</div>
                )}
                <ul className="dv-plat-list">
                  {d.platforms.map((p) => (
                    <li key={p.id} className={p.connected ? "" : "off"}>
                      <i className={`dot ${p.id}`} /><span>{p.label}</span>
                      {/* Only Facebook has a connect flow today; TikTok and YouTube say so instead of pretending. */}
                      <b>{p.connected ? (p.value != null ? `${Math.round(p.share * 100)}%` : "—") : p.id === "facebook" ? <Link href="/settings#accounts">Connect</Link> : <small>Not available yet</small>}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="ov-card" aria-labelledby="dv-top-h">
            <div className="ov-card-head">
              <div>
                <h2 id="dv-top-h">Top Performing Content</h2>
                <p className="ov-card-sub">Your best performing posts from the selected period.</p>
              </div>
              <Link href="/analytics#content" className="ov-link">View all <ArrowRight size={13} /></Link>
            </div>
            <ContentRow posts={d.top} onOpen={setOpen} emptyText="No posts in this period." />
          </section>

          <div className="dv-bottom">
            <section className="ov-card" aria-labelledby="dv-focus-h">
              <div className="ov-card-head">
                <h2 id="dv-focus-h"><span className="ov-h-ico primary"><Target size={14} /></span> This Week&apos;s Focus</h2>
                {d.focus && <Link href="/tool" className="ov-link">View strategy <ArrowRight size={13} /></Link>}
              </div>
              {d.focus ? (
                <>
                  <p className="dv-focus-line">{d.focus.headline}</p>
                  <small className="ov-source">From your Content Plan of {new Date(d.focus.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, built on your performance, goals and competitors.</small>
                  <div className="dv-tiles">
                    {d.focus.tiles.map((t, i) => {
                      const Icon = TILE_ICON[t.icon];
                      return (
                        <div className="dv-tile" key={i}>
                          <span className="dv-tile-ico"><Icon size={14} /></span>
                          <small>{t.label}</small>
                          <b>{t.title}</b>
                          <p>{t.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="ov-empty">
                  <b>No plan yet</b>
                  <p>Generate a Content Plan and this week&apos;s three priorities appear here.</p>
                  <Link href="/tool" className="ov-btn primary small"><Sparkles size={13} /> Generate my week</Link>
                </div>
              )}
            </section>

            <section className="ov-card" aria-labelledby="dv-up-h">
              <div className="ov-card-head">
                <h2 id="dv-up-h"><span className="ov-h-ico info"><CalendarDays size={14} /></span> Upcoming Content</h2>
                <Link href="/calendar" className="ov-link">View calendar <ArrowRight size={13} /></Link>
              </div>
              {d.upcoming.length ? (
                <ul className="dv-upcoming">
                  {d.upcoming.map((u) => {
                    const s = STATUS[u.status];
                    const when = new Date(u.at);
                    let dayLabel = "";
                    let timeLabel = "";
                    if (clock) {
                      const tomorrow = new Date(clock.getTime() + 86400000);
                      dayLabel = when.toDateString() === clock.toDateString() ? "Today" : when.toDateString() === tomorrow.toDateString() ? "Tomorrow" : when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      timeLabel = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    }
                    return (
                      <li key={u.id}>
                        <Link href="/calendar" className="dv-up-row">
                          <span className="dv-up-when"><b>{dayLabel || " "}</b><small>{timeLabel || " "}</small></span>
                          {u.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.thumb} alt="" width={40} height={40} />
                          ) : <span className="dv-up-ph"><Film size={14} /></span>}
                          <span className="dv-up-body"><b>{u.title}</b><small>{u.format}</small></span>
                          <span className={`ov-chip ${s.tone}`}>{s.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="ov-empty">
                  <b>Nothing scheduled</b>
                  <p>Add a post for this week and SOCIA publishes it at your audience&apos;s hour.</p>
                  <Link href="/calendar?compose=1" className="ov-btn ghost small"><Plus size={13} /> Add content</Link>
                </div>
              )}
            </section>
          </div>
        </div>

        <aside className="dv-side">
          <section className="ov-card dv-ai" aria-labelledby="dv-ai-h">
            <div className="ov-card-head">
              <h2 id="dv-ai-h"><span className="dv-ai-mark"><Sparkles size={13} /></span> SOCIA AI</h2>
            </div>
            <p className="ov-card-sub">Your personal content strategist.</p>
            <div className="dv-ai-bubble">
              {greet}, {d.name}! {insights.length
                ? <>I looked at {d.handle ? `@${d.handle}` : "your account"}&apos;s recent performance. Here {Math.min(insights.length, 3) === 1 ? "is the key opportunity" : `are ${Math.min(insights.length, 3)} key opportunities`} for this week:</>
                : <>I need a few more posts on {d.handle ? `@${d.handle}` : "your account"} before I can point at anything I can prove.</>}
            </div>
            <InsightList insights={insights.slice(0, 3)} numbered posts={d.posts} compact onTab={(t) => router.push(`/analytics#${t}`)} />
            <Link href="/tool" className="ov-btn outline full">View full strategy <ArrowRight size={13} /></Link>
            <form className="dv-ask" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) { askSocia({ question: ask.trim(), autoSend: true, context: { page: "dashboard" } }); setAsk(""); } }}>
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask SOCIA anything..." aria-label="Ask SOCIA" />
              <button type="submit" aria-label="Ask"><Send size={14} /></button>
            </form>
            <div className="dv-chips">
              {CHIPS.map((c) => <Link key={c.label} href={c.href} className="dv-chip">{c.label}</Link>)}
            </div>
          </section>

          <section className="ov-card" aria-labelledby="dv-goals-h">
            <div className="ov-card-head">
              <h2 id="dv-goals-h">Goals Progress</h2>
              <Link href="/settings#brand" className="ov-link">Edit goals</Link>
            </div>
            {d.goals.length > 0 && (
              <ul className="dv-goals-list">
                {d.goals.map((g) => <li key={g}><Star size={11} /> {g}</li>)}
              </ul>
            )}
            <ul className="dv-trackers">
              {d.trackers.map((t) => {
                const pct = t.target && t.current != null ? Math.min(100, Math.round((t.current / t.target) * 100)) : null;
                return (
                  <li key={t.label} title={t.note}>
                    <span className="dv-tr-label">{t.label}</span>
                    {pct != null ? <span className="dv-tr-bar"><i style={{ width: `${pct}%` }} /></span> : <span className="dv-tr-bar none" />}
                    <b>{t.display}</b>
                  </li>
                );
              })}
            </ul>
            {!d.goals.length && <small className="ov-source">Set your goals in Settings → Profile &amp; Brand and they steer every plan.</small>}
          </section>

          <section className="dv-generate">
            <span className="dv-gen-ico"><Zap size={18} /></span>
            <h2>Generate Your Week</h2>
            <p>Let SOCIA build a complete content plan from your goals, performance and competitors.</p>
            <Link href="/tool" className="ov-btn primary full">Generate my week <ArrowRight size={14} /></Link>
          </section>
        </aside>
      </div>

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
    </div>
  );
}
