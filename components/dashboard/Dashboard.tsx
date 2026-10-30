"use client";

// The Dashboard answers one question: what should I do today? Every number
// arrives computed on the server from the account's own rows (lib/overview,
// lib/dailyRecs, lib/platformSummaries); this file only lays it out. One
// component for every state: nothing connected, other platforms only, and
// Instagram live.
//
// Layout (Noah's light reference, 2026-10-28): the date, the title and the
// page's controls beside a compact priority line, four metric instruments
// with their own trend, the daily chart beside top content, then audience,
// upcoming content and competitors, then the deeper cards. Compact on purpose:
// small figures, tight padding, hairline edges. Nothing on it is a sample: a
// module without data says why instead.

import "@/app/(app)/dashboard/dashboard.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDownRight, CalendarDays, CheckCircle2, Eye, FileText, Film, Heart, MessageCircle, Plus, Users } from "lucide-react";
import OverviewChart from "@/components/ov/OverviewChart";
import ContentDrawer from "@/components/ov/ContentDrawer";
import { InsightList } from "@/components/ov/Insights";
import Mounted from "@/components/ov/Mounted";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import UpdatedAgo from "@/components/UpdatedAgo";
import TodayCard, { useTodaySummary, type TodayCardProps } from "@/components/TodayCard";
import RepurposeCard from "@/components/RepurposeCard";
import {
  ButtonLink,
  Card,
  CardGrid,
  CardHeader,
  CardSource,
  Empty,
  PlatformMark,
  Skeleton,
  TableWrap,
  Unavailable,
  type Platform,
} from "@/components/system";
import type { Candidate } from "@/lib/repurpose";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import { fmtNum, audienceInsight, type Kpi, type Series, type Insight, type PostCard, type Focus, type Upcoming, type GoalTracker } from "@/lib/overview";
import type { CalPost } from "@/lib/audience";
import { GrowthBriefingBand, NextActionsCard, WhatsWorkingCard, GoalProgressCard, RecentLearningCard, type IntelData } from "./IntelSections";

export type DashboardData = {
  /** Briefing, what's working, next actions, goals and learning (lib/intel/overview.ts). */
  intel: IntelData;
  rangeLabel: string;
  /** Longest window the viewer's plan may look back over; ranges beyond it show as locked. */
  maxDays?: number;
  /** When the reused live platform reads on this page were fetched (null: none were reused). */
  updatedAt?: string | null;
  /** Instagram data is live (daily rows and media). */
  live: boolean;
  handle: string | null;
  /** Set once, right after the Instagram OAuth return. */
  justConnected: boolean;
  /** Where "Connect" goes for a platform that is not connected. */
  connectHref: string;
  kpis: Kpi[] | null;
  series: Record<"views" | "engagement" | "followers", Series> | null;
  summaries: PlatformSummary[];
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
  today: TodayCardProps;
  repurpose: Candidate[];
  /** The person's first name from their sign-in account; null when it carries none. */
  firstName?: string | null;
  /** The most recent published post SOCIA reads, for the priority line. */
  lastPost?: { platform: string; at: string } | null;
  /** Tracked competitors with a cached public read, on the same measure as you; null when unreadable. */
  competitors?: { tracked: number; rows: { handle: string; name: string; avatar: string | null; value: number }[]; you: number | null } | null;
};

type Metric = "views" | "engagement" | "followers";
const KPI_METRIC: Partial<Record<Kpi["id"], Metric>> = { views: "views", engagement_rate: "engagement", followers: "followers" };

/** The browser's clock, after mount, so server (UTC) and client never disagree on "today". */
function useClock() {
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => setClock(new Date()), []);
  return clock;
}

function dayLabel(when: Date, clock: Date) {
  const tomorrow = new Date(clock.getTime() + 86400000);
  if (when.toDateString() === clock.toDateString()) return "Today";
  if (when.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Morning, afternoon or evening by the viewer's own clock; null until mounted. */
function partOfDay(clock: Date | null): string | null {
  if (!clock) return null;
  const h = clock.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function agoDays(iso: string, clock: Date): string {
  const days = Math.floor((new Date(clock.toDateString()).getTime() - new Date(new Date(iso).toDateString()).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** How a scheduled post's state reads in the compact plan preview. */
const STATUS_LABEL: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", publishing: "Publishing", published: "Published", failed: "Failed", pending_approval: "Needs approval", needs_media: "Needs media" };

const KPI_ICON: Record<string, typeof Eye> = { views: Eye, engagement_rate: Heart, followers: Users, posts: FileText, reach: Eye };

/** A small trend inside a metric: bars for counts, a line for a rate. Real points only. */
function Spark({ values, kind }: { values: number[]; kind: "bars" | "line" }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  if (kind === "line") {
    const min = Math.min(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / span) * 26).toFixed(1)}`);
    return (
      <svg className="dash-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
        <polyline points={pts.join(" ")} />
      </svg>
    );
  }
  const w = 100 / values.length;
  return (
    <svg className="dash-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 30);
        return <rect key={i} x={(i * w + w * 0.18).toFixed(2)} width={(w * 0.64).toFixed(2)} y={(32 - h).toFixed(2)} height={h.toFixed(2)} className={i === values.length - 1 ? "is-last" : undefined} />;
      })}
    </svg>
  );
}

/** At most `n` buckets of a daily series, summed (counts) or averaged (rates), oldest first. */
function bucket(values: (number | null)[], n: number, mode: "sum" | "mean" | "last"): number[] {
  const real = values.map((v) => (v == null ? null : v));
  if (!real.some((v) => v != null)) return [];
  const size = Math.max(1, Math.ceil(real.length / n));
  const out: number[] = [];
  for (let i = 0; i < real.length; i += size) {
    const xs = real.slice(i, i + size).filter((v): v is number => v != null);
    if (!xs.length) continue;
    out.push(mode === "sum" ? xs.reduce((a, b) => a + b, 0) : mode === "mean" ? xs.reduce((a, b) => a + b, 0) / xs.length : xs[xs.length - 1]);
  }
  return out;
}

export default function Dashboard({ d }: { d: DashboardData }) {
  const connected = d.summaries.filter((s) => s.connected);
  const nothingConnected = connected.length === 0;
  const clock = useClock();
  const todayView = useTodaySummary(d.today.facts);
  const [metric, setMetric] = useState<Metric>(d.series?.views.provenance === "unavailable" ? "engagement" : "views");
  const [open, setOpen] = useState<PostCard | null>(null);
  const series = d.series?.[metric] ?? null;

  // Timing is a client-side insight (viewer's time zone); it joins the list last.
  const timing = useMemo(() => (clock ? audienceInsight(d.timed) : null), [d.timed, clock]);
  const insights = useMemo(() => (timing ? [...d.insights, timing] : d.insights), [d.insights, timing]);

  // ---- greeting: a name only when the account carries one --------------------
  const part = partOfDay(clock);
  const greeting = d.firstName ? `${part ?? "Welcome back"}, ${d.firstName}` : "Your overview";

  // ---- today's priority: the account's real schedule and recommendations ------
  const priority = (() => {
    if (nothingConnected) {
      return { title: "Connect a platform to see your numbers.", sub: "Instagram, Facebook, YouTube and TikTok each bring their own.", href: "/settings#accounts", cta: "Connect a platform" };
    }
    const rec = todayView?.summary.recs[0];
    if (rec) return { title: `${rec.title}.`, sub: rec.detail, href: rec.href, cta: rec.cta };
    if (!clock) return null;
    const soon = d.upcoming.find((u) => new Date(u.at).getTime() - clock.getTime() < 3 * 86400000 && new Date(u.at).getTime() >= clock.getTime());
    if (soon) {
      const when = new Date(soon.at);
      return {
        title: `Your next post goes out ${/^(Today|Tomorrow)$/.test(dayLabel(when, clock)) ? dayLabel(when, clock).toLowerCase() : `on ${dayLabel(when, clock)}`} at ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`,
        sub: `"${soon.title}"${d.upcoming.length > 1 ? `, then ${d.upcoming.length - 1} more scheduled.` : "."}`,
        href: "/calendar",
        cta: "Open the Calendar",
      };
    }
    return {
      title: "Nothing is set to publish in the next 3 days.",
      sub: d.lastPost ? `Your last ${d.lastPost.platform} post went out ${agoDays(d.lastPost.at, clock)}.` : "Schedule a post to keep your audience hearing from you.",
      href: "/create",
      cta: "Create a post",
    };
  })();

  // ---- metrics with their own trend --------------------------------------------
  const rangeDays = d.series?.views.current.length ?? 30;
  const sparkFor = (id: Kpi["id"]): { values: number[]; kind: "bars" | "line" } | null => {
    if (!d.series) return null;
    if (id === "views") return { values: bucket(d.series.views.current.map((p) => p.value), 7, "sum"), kind: "bars" };
    if (id === "engagement_rate") return { values: bucket(d.series.engagement.current.map((p) => p.value), 10, "mean"), kind: "line" };
    // A level, not a count: a line scaled to its own range shows the change.
    if (id === "followers") return { values: bucket(d.series.followers.current.map((p) => p.value), 10, "last"), kind: "line" };
    if (id === "posts" && clock) {
      const start = clock.getTime() - rangeDays * 86400000;
      const counts = new Array(Math.min(6, Math.max(2, Math.ceil(rangeDays / 7)))).fill(0);
      const span = (rangeDays * 86400000) / counts.length;
      for (const p of d.timed) {
        const t = new Date(p.t).getTime();
        if (t >= start) counts[Math.min(counts.length - 1, Math.floor((t - start) / span))]++;
      }
      return { values: counts, kind: "bars" };
    }
    return null;
  };

  const kpiTiles = d.kpis
    ? d.kpis.map((k) => {
        const m = KPI_METRIC[k.id];
        const selectable = Boolean(m && d.series && d.series[m].provenance !== "unavailable");
        const Icon = KPI_ICON[k.id] ?? Eye;
        const spark = k.status === "ok" ? sparkFor(k.id) : null;
        const body = (
          <>
            <span className="dash-kpi-label">
              <Icon aria-hidden /> {k.label}
            </span>
            <span className="dash-kpi-row">
              <b className="dash-kpi-value">{k.status === "unavailable" ? "\u2014" : k.value}</b>
              {spark && <Spark values={spark.values} kind={spark.kind} />}
            </span>
            <span className="dash-kpi-foot">
              {k.deltaText && k.status === "ok" ? (
                <span className={`dash-kpi-delta${k.positive === false ? " is-bad" : k.positive ? " is-good" : ""}`}>
                  {k.positive === false ? <ArrowDownRight aria-hidden /> : k.positive ? <ArrowUpRight aria-hidden /> : null}
                  {k.deltaText}
                </span>
              ) : null}
              <small>{k.note}</small>
            </span>
          </>
        );
        return selectable ? (
          <button key={k.id} type="button" className={`dash-kpi${metric === m ? " is-on" : ""}`} aria-pressed={metric === m} onClick={() => setMetric(m as Metric)}>
            {body}
          </button>
        ) : (
          <div key={k.id} className="dash-kpi">
            {body}
          </div>
        );
      })
    : summaryTiles(connected);

  // ---- audience: what this account's own posts show ----------------------------
  const formats = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const p of d.posts) if (p.multiplier != null) by.set(p.format, [...(by.get(p.format) ?? []), p.multiplier]);
    const rows = [...by.entries()]
      .filter(([, xs]) => xs.length >= 2)
      .map(([f, xs]) => {
        const s2 = [...xs].sort((a, b) => a - b);
        const mid = Math.floor(s2.length / 2);
        return { format: f, m: s2.length % 2 ? s2[mid] : (s2[mid - 1] + s2[mid]) / 2, n: xs.length };
      })
      .sort((a, b) => b.m - a.m)
      .slice(0, 4);
    return rows;
  }, [d.posts]);
  const maxFormat = Math.max(1, ...formats.map((f) => f.m));

  // ---- competitors: the same measure on both sides --------------------------------
  const comp = d.competitors;
  const compRows = comp ? [...(comp.you != null ? [{ handle: "you", name: "You", avatar: null as string | null, value: comp.you, you: true }] : []), ...comp.rows.map((r) => ({ ...r, you: false }))].sort((a, b) => b.value - a.value).slice(0, 5) : [];
  const compMax = Math.max(1, ...compRows.map((r) => r.value));

  return (
    <div className="dash-stack">
      <header className="dash-head">
        <div className="dash-hello">
          <span className="dash-date">{clock ? clock.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "\u00a0"}</span>
          <h1>{greeting}</h1>
          <p>
            Here&apos;s what&apos;s happening with your content and audience today.
            {d.handle ? <span> @{d.handle}</span> : null}
          </p>
          <div className="dash-head-actions">
            {!nothingConnected && (
              <Mounted fallback={<Skeleton variant="value" width={150} />}>
                <AccountSwitcher />
                <DateRangeSelector maxDays={d.maxDays} />
              </Mounted>
            )}
            {nothingConnected ? (
              <ButtonLink href="/settings#accounts" variant="primary">
                Connect a platform
              </ButtonLink>
            ) : (
              <ButtonLink href="/create" variant="primary">
                <Plus /> Create post
              </ButtonLink>
            )}
            <span className="dash-updated">
              <UpdatedAgo at={d.updatedAt ?? null} />
            </span>
          </div>
        </div>

        <section className="dash-priority" aria-labelledby="dash-priority-title">
          <h2 id="dash-priority-title" className="dash-sr">
            Today&apos;s priority
          </h2>
          {priority ? (
            <Link href={priority.href} className="dash-priority-link">
              <span className="dash-priority-icon" aria-hidden>
                <CalendarDays />
              </span>
              <span className="dash-priority-body">
                <b>{priority.title}</b>
                <small>{priority.sub}</small>
              </span>
              <span className="dash-priority-go">
                <span className="dash-sr">{priority.cta}</span>
                <ArrowRight aria-hidden />
              </span>
            </Link>
          ) : (
            <div className="dash-priority-link">
              <span className="dash-priority-icon" aria-hidden>
                <CalendarDays />
              </span>
              <span className="dash-priority-body">
                <Skeleton variant="text" width="80%" />
              </span>
            </div>
          )}
        </section>
      </header>

      <GrowthBriefingBand b={d.intel.briefing} />

      {d.justConnected && (
        <p className="dash-notice" role="status">
          <CheckCircle2 aria-hidden />
          Instagram connected{d.handle ? ` as @${d.handle}` : ""}. Your numbers fill in as SOCIA syncs; the first sync takes a minute.
        </p>
      )}

      <div className="dash-kpis">{kpiTiles}</div>

      <div className="dash-intel">
        <NextActionsCard actions={d.intel.actions} />
        <WhatsWorkingCard works={d.intel.works} themes={d.intel.themes} postsRead={d.intel.postsRead} />
      </div>

      <div className={`dash-main${d.live ? "" : " is-single"}`}>
        {series && d.series ? (
          <Card className="dash-chart">
            <CardHeader title={`${series.label} by day`} period={d.rangeLabel} />
            <OverviewChart series={series} showPrevious={false} height={216} compact still />
            <CardSource>{series.note}</CardSource>
          </Card>
        ) : (
          <Card className="dash-chart">
            <CardHeader title="Views by day" period={d.rangeLabel} />
            <Empty>
              <b>No daily series yet.</b> {nothingConnected ? "Connect Instagram to see views by day." : "Instagram's daily numbers appear here once SOCIA has synced them."}
            </Empty>
          </Card>
        )}

        {d.live && (
          <Card className="dash-top">
            <CardHeader
              title="Top content"
              period={d.rangeLabel}
              actions={
                <Link href="/analytics#content" className="s-link">
                  View all
                </Link>
              }
            />
            {d.top.length ? (
              <ul className="dash-top-list">
                {d.top.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="dash-top-item" onClick={() => setOpen(p)}>
                      <span className="dash-top-media">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" width={44} height={44} loading="lazy" />
                        ) : (
                          <Film aria-hidden />
                        )}
                        <span className="dash-top-plat">
                          <PlatformMark platform={p.platform as Platform} brand />
                        </span>
                      </span>
                      <span className="dash-top-body">
                        <b>{p.title}</b>
                        <small>{new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</small>
                        <span className="dash-top-stats">
                          {p.likes != null && (
                            <span>
                              <Heart aria-hidden /> {fmtNum(p.likes)}
                            </span>
                          )}
                          {p.comments != null && (
                            <span>
                              <MessageCircle aria-hidden /> {fmtNum(p.comments)}
                            </span>
                          )}
                          {p.multiplier != null && <span>{p.multiplier.toFixed(1)}× median</span>}
                        </span>
                      </span>
                      <span className="dash-top-num">
                        <b>{p.views != null ? fmtNum(p.views) : fmtNum(p.engagements)}</b>
                        <small>{p.views != null ? "views" : "interactions"}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                <b>No posts in this range.</b> Your best posts appear here, ranked by views.
              </Empty>
            )}
          </Card>
        )}
      </div>

      <div className="dash-trio">
        <Card>
          <CardHeader
            title="Audience insights"
            actions={
              <Link href="/analytics#audience" className="s-link">
                View all
              </Link>
            }
          />
          {timing || formats.length ? (
            <div className="dash-aud">
              {timing && (
                <div className="dash-aud-time">
                  <span className="dash-mini-label">{timing.tag}</span>
                  <b>{timing.title}</b>
                  <p>{timing.body}</p>
                </div>
              )}
              {formats.length > 0 && (
                <div>
                  <span className="dash-mini-label">Formats that land</span>
                  <ul className="dash-bars">
                    {formats.map((f) => (
                      <li key={f.format}>
                        <span>{f.format}</span>
                        <span className="dash-bar">
                          <i style={{ width: `${(f.m / maxFormat) * 100}%` }} />
                        </span>
                        <b>{f.m.toFixed(1)}×</b>
                      </li>
                    ))}
                  </ul>
                  <CardSource>Median interactions per post by format, against your median post. Formats with two or more posts.</CardSource>
                </div>
              )}
            </div>
          ) : (
            <Empty>
              <b>Not enough posts yet.</b> Audience patterns appear once you have a few dated posts in range.
            </Empty>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Upcoming content"
            actions={
              <Link href="/calendar" className="s-link">
                View all
              </Link>
            }
          />
          {d.upcoming.length ? (
            <ul className="dash-week">
              {d.upcoming.slice(0, 4).map((u) => {
                const when = new Date(u.at);
                return (
                  <li key={u.id}>
                    <span className="dash-week-day">
                      {clock ? `${when.toLocaleDateString("en-US", { weekday: "short" })} ${when.getDate()}` : <Skeleton variant="text" width={40} />}
                    </span>
                    {u.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.thumb} alt="" width={64} height={80} loading="lazy" />
                    ) : (
                      <span className="dash-week-ph" aria-hidden>
                        <Film />
                      </span>
                    )}
                    <small title={u.title}>{u.title}</small>
                    <span className={`dash-week-status is-${u.status}`}>{STATUS_LABEL[u.status] ?? u.status}</span>
                  </li>
                );
              })}
              <li>
                <Link href="/create" className="dash-week-add" aria-label="Create a post">
                  <Plus aria-hidden />
                </Link>
              </li>
            </ul>
          ) : (
            <Empty
              action={
                <ButtonLink href="/create" size="sm">
                  Create post
                </ButtonLink>
              }
            >
              <b>Nothing is scheduled.</b> Posts you schedule appear here by day.
            </Empty>
          )}
          {d.focus && (
            <p className="dash-plan-line">
              <Link href="/tool" className="s-link">
                This week&apos;s plan
              </Link>
              : {d.focus.headline}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Competitors"
            actions={
              <Link href="/competitors" className="s-link">
                View all
              </Link>
            }
          />
          {comp == null ? (
            <Empty>
              <b>Competitors couldn&apos;t be read right now.</b> Open Competitors to see them.
            </Empty>
          ) : compRows.length > (comp.you != null ? 1 : 0) ? (
            <>
              <ul className="dash-comp">
                {compRows.map((r) => (
                  <li key={r.handle} className={r.you ? "is-you" : undefined}>
                    <span className="dash-comp-who">
                      {r.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar} alt="" width={24} height={24} referrerPolicy="no-referrer" />
                      ) : (
                        <i aria-hidden>{r.name.replace(/^@/, "")[0]?.toUpperCase() ?? "?"}</i>
                      )}
                      <span>{r.name}</span>
                    </span>
                    <span className="dash-bar">
                      <i style={{ width: `${(r.value / compMax) * 100}%` }} />
                    </span>
                    <b>{fmtNum(Math.round(r.value))}</b>
                  </li>
                ))}
              </ul>
              <CardSource>Median likes and comments per post, last 12 posts each, Instagram.</CardSource>
            </>
          ) : (
            <Empty
              action={
                <ButtonLink href="/competitors" size="sm">
                  Open Competitors
                </ButtonLink>
              }
            >
              <b>{comp.tracked ? "No public numbers read yet." : "No competitors tracked yet."}</b>{" "}
              {comp.tracked ? "Open Competitors to read their latest posts. Instagram needs a Facebook Page linked to your account." : "Track accounts in your niche to compare them here."}
            </Empty>
          )}
        </Card>
      </div>

      {!nothingConnected && d.today.facts && <TodayCard {...d.today} view={todayView} />}

      <Card flush>
        <CardHeader title="Platforms" period={d.rangeLabel} />
        <TableWrap>
          <table className="s-table s-table--stack">
            <thead>
              <tr>
                <th>Platform</th>
                <th className="num">Posted</th>
                <th className="num">Audience</th>
                <th className="num">Views</th>
                <th className="num">Engagement</th>
                <th className="act" />
              </tr>
            </thead>
            <tbody>
              {[...d.summaries].sort((a, b) => Number(b.connected) - Number(a.connected)).map((s) => (
                <tr key={s.platform}>
                  <td className="id">
                    <span className="dash-plat">
                      <PlatformMark platform={s.platform as Platform} brand={s.connected} />
                      <b>{s.label}</b>
                    </span>
                    <span className="sub">{s.connected ? "Connected" : "Not connected"}</span>
                  </td>
                  <td className="num key" data-label="Posted">
                    {s.connected ? s.contentPublished != null ? fmtNum(s.contentPublished) : <Unavailable reason="Not reported for this period" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}
                  </td>
                  <td className="num" data-label="Audience">
                    {s.connected ? s.audience != null ? fmtNum(s.audience) : <Unavailable reason="Not reported" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}
                  </td>
                  <td className="num" data-label="Views">
                    {s.connected ? s.views != null ? fmtNum(s.views) : <Unavailable reason={s.viewsNote ?? "Not reported by the platform"} compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}
                  </td>
                  <td className="num" data-label="Engagement">
                    {s.connected ? s.engagement != null ? fmtNum(s.engagement) : <Unavailable reason="Not reported for this period" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}
                  </td>
                  <td className="act">
                    {s.connected ? (
                      <Link href={`/analytics?platform=${s.platform}`} className="s-link">
                        Analytics
                      </Link>
                    ) : (
                      <ButtonLink href={s.platform === "instagram" ? d.connectHref : "/settings#accounts"} size="sm">
                        Connect
                      </ButtonLink>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <CardSource className="dash-table-source">Each platform reports its own metrics. A dash means the platform did not report that number for this period, not zero.</CardSource>
      </Card>

      <CardGrid cols={2}>
        <Card>
          <CardHeader
            title="This week's plan"
            actions={
              d.focus && (
                <Link href="/tool" className="s-link">
                  Open the plan
                </Link>
              )
            }
          />
          {d.focus ? (
            <>
              <p className="dash-plan-headline">{d.focus.headline}</p>
              {d.focus.outcomeLine && <p className="dash-plan-outcome">So far: {d.focus.outcomeLine}</p>}
              <ul className="dash-plan-list">
                {d.focus.tiles.map((t, i) => (
                  <li key={i}>
                    <b>{t.title}</b>
                    <p>{t.detail}</p>
                  </li>
                ))}
              </ul>
              <CardSource>
                From your Content Plan of {new Date(d.focus.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, built on your performance, goals and competitors.
              </CardSource>
            </>
          ) : (
            <Empty
              action={
                <ButtonLink href="/tool" size="sm">
                  Generate a plan
                </ButtonLink>
              }
            >
              <b>No plan yet.</b> Generate a Content Plan and this week&apos;s three priorities appear here.
            </Empty>
          )}
        </Card>

        {d.live && insights.length > 0 ? (
          <Card>
            <CardHeader title="What stands out" period={d.rangeLabel} />
            <InsightList insights={insights.slice(0, 3)} posts={d.posts} compact />
          </Card>
        ) : (
          <TodayLocked today={d.today} />
        )}
      </CardGrid>

      <CardGrid cols={2}>
        <GoalProgressCard goals={d.intel.goals} ready={d.intel.goalsReady} />
        <RecentLearningCard lines={d.intel.learning} storeReady={d.intel.storeReady} />
      </CardGrid>

      {d.repurpose.length > 0 && <RepurposeCard candidates={d.repurpose} />}

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Below Growth the Today card is an upgrade line; it keeps its place in the grid. */
function TodayLocked({ today }: { today: TodayCardProps }) {
  if (today.facts) return null;
  return <TodayCard {...today} view={null} />;
}

/** Without live Instagram the metrics show each connected platform's own headline numbers, never a blend. */
function summaryTiles(connected: PlatformSummary[]) {
  if (!connected.length) {
    return ["Views", "Engagement", "Audience", "Posts"].map((label) => (
      <div key={label} className="dash-kpi">
        <span className="dash-kpi-label">{label}</span>
        <b className="dash-kpi-value">{"\u2014"}</b>
        <span className="dash-kpi-foot">
          <small>Connect a platform</small>
        </span>
      </div>
    ));
  }
  const tiles: { key: string; label: string; value: number | null; note: string }[] = [];
  for (const s of connected) {
    if (tiles.length < 4) tiles.push({ key: `${s.platform}-aud`, label: `${s.label} ${s.audienceLabel || "audience"}`, value: s.audience, note: s.audience != null ? "Current" : "Not reported" });
    if (tiles.length < 4)
      tiles.push(
        s.views != null
          ? { key: `${s.platform}-views`, label: `${s.label} views`, value: s.views, note: s.viewsNote ?? "In this range" }
          : { key: `${s.platform}-eng`, label: `${s.label} engagement`, value: s.engagement, note: s.viewsNote ?? "Not reported for this period" },
      );
  }
  return tiles.map((t) => (
    <div key={t.key} className="dash-kpi">
      <span className="dash-kpi-label">{t.label}</span>
      <b className="dash-kpi-value">{t.value != null ? fmtNum(t.value) : "\u2014"}</b>
      <span className="dash-kpi-foot">
        <small>{t.note}</small>
      </span>
    </div>
  ));
}
