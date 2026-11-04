"use client";

// The Overview, read in five seconds (Noah's brief, 2026-11-03; reordered by
// the redesign brief the same day): one hero with the content score and
// today's one sentence, the week as a strip, three numbers, the chart and your
// best posts. Everything else (what's working, next actions, competitors,
// goals, audience, platforms, video ideas, reposts, learning) waits behind
// "More from your account", closed until the person opens it. Every number arrives computed on the
// server from the account's own rows (lib/overview, lib/intel, lib/dailyRecs,
// lib/contentScore); this file only lays it out. Longer reading sits behind
// each card's Details. One component for every state: nothing connected,
// other platforms only, and Instagram live. Nothing on it is a sample.

import "@/app/(app)/dashboard/dashboard.css";
import "@/app/(app)/dashboard/dashboard-motion.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDownRight, CalendarDays, CheckCircle2, ChevronDown, CircleDot, Eye, FileText, Film, Heart, Image as ImageIcon, Images, Plus, Users } from "lucide-react";
import OverviewChart from "@/components/ov/OverviewChart";
import ContentDrawer from "@/components/ov/ContentDrawer";
import { InsightList } from "@/components/ov/Insights";
import Mounted from "@/components/ov/Mounted";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import UpdatedAgo from "@/components/UpdatedAgo";
import TodayCard, { useTodaySummary, type TodayCardProps } from "@/components/TodayCard";
import RepurposeCard from "@/components/RepurposeCard";
import VideoIdeasCard from "@/components/VideoIdeasCard";
import { ButtonLink, Card, CardHeader, Empty, PlatformMark, SegmentedControl, Skeleton, TableWrap, Unavailable, type Platform } from "@/components/system";
import type { Candidate } from "@/lib/repurpose";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import { fmtNum, audienceInsight, type Kpi, type Series, type Insight, type PostCard, type Focus, type Upcoming, type GoalTracker } from "@/lib/overview";
import type { CalPost } from "@/lib/audience";
import { buildWeek, compareBars, describeDay, scoreTone, COMPETITOR_METRICS, type CalendarItem, type CompetitorMetric, type Competitors, type PlanDayItem, type WeekDay } from "@/lib/overviewVisual";
import { ActionChips, BriefingLines, GoalBars, GoalNotes, LearningLines, WorksBars, WorksNotes, type IntelData } from "./IntelSections";
import { Bar, CountUp, Details, Reveal, Ring, useMotionOk } from "./motion";

const DASH = String.fromCharCode(0x2014);

export type ScoreData = { score: number; verdict: string; dims: { label: string; value: number; method: string }[]; sampleSize: number };

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
  timed: (CalPost & { id: string; format: string })[];
  today: TodayCardProps;
  repurpose: Candidate[];
  /** The person's first name from their sign-in account; null when it carries none. */
  firstName?: string | null;
  /** The most recent published post SOCIA reads, for the priority line. */
  lastPost?: { platform: string; at: string } | null;
  /** Tracked competitors with a cached public read, on the same measures as you; null when unreadable. */
  competitors?: Competitors | null;
  /** The calculated content score (lib/contentScore.ts); null until five dated posts exist. */
  score?: ScoreData | null;
  /** Calendar posts around this week, for the strip. */
  calendar?: CalendarItem[];
  /** The latest plan's week, when that plan is this week's. */
  planWeek?: PlanDayItem[] | null;
};

type Metric = "views" | "engagement" | "followers";
const KPI_METRIC: Partial<Record<Kpi["id"], Metric>> = { views: "views", engagement_rate: "engagement", followers: "followers" };
const KPI_ICON: Record<string, typeof Eye> = { views: Eye, engagement_rate: Heart, followers: Users, posts: FileText, reach: Eye };
const KIND_ICON = { reel: Film, photo: ImageIcon, carousel: Images, story: CircleDot, post: FileText } as const;
const STATUS_WORD = { posted: "Posted", scheduled: "Scheduled", planned: "Planned", draft: "Draft", failed: "Failed" } as const;
/** The stat row shows three numbers: the three that drive the chart. */
const STAT_COUNT = 3;
/** Remembers on this device whether "More from your account" was left open. */
const MORE_KEY = "socia-dash-more";

/** Whether "More from your account" is open: closed by default, remembered per device. */
function useMoreOpen(): [boolean, () => void] {
  const [more, setMore] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(MORE_KEY) === "1") setMore(true);
    } catch {
      /* storage blocked: stays closed */
    }
  }, []);
  const toggle = () =>
    setMore((v) => {
      try {
        localStorage.setItem(MORE_KEY, v ? "0" : "1");
      } catch {
        /* storage blocked: still toggles */
      }
      return !v;
    });
  return [more, toggle];
}

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

/** A small trend inside a stat card: bars for counts, a line for a rate. Real points only. */
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
  if (!values.some((v) => v != null)) return [];
  const size = Math.max(1, Math.ceil(values.length / n));
  const out: number[] = [];
  for (let i = 0; i < values.length; i += size) {
    const xs = values.slice(i, i + size).filter((v): v is number => v != null);
    if (!xs.length) continue;
    out.push(mode === "sum" ? xs.reduce((a, b) => a + b, 0) : mode === "mean" ? xs.reduce((a, b) => a + b, 0) / xs.length : xs[xs.length - 1]);
  }
  return out;
}
/** The figure's own format, so the count-up lands on exactly what the server wrote. */
const kpiFormat = (k: Kpi): ((n: number) => string) =>
  k.id === "engagement_rate" ? (n) => `${n.toFixed(k.raw != null && k.raw < 1 ? 2 : 1)}%` : k.id === "followers" ? (n) => Math.round(n).toLocaleString("en-US") : k.id === "posts" ? (n) => String(Math.round(n)) : (n) => fmtNum(Math.round(n));

export default function Dashboard({ d }: { d: DashboardData }) {
  const connected = d.summaries.filter((s) => s.connected);
  const nothingConnected = connected.length === 0;
  const clock = useClock();
  const motionOk = useMotionOk();
  const todayView = useTodaySummary(d.today.facts);
  const [metric, setMetric] = useState<Metric>(d.series?.views.provenance === "unavailable" ? "engagement" : "views");
  const [compMetric, setCompMetric] = useState<CompetitorMetric>("engagement");
  const [open, setOpen] = useState<PostCard | null>(null);
  const [more, toggleMore] = useMoreOpen();
  // The chart draws in once; a metric switch shows the new series at once.
  const [chartStill, setChartStill] = useState(true);
  useEffect(() => { if (motionOk) setChartStill(false); }, [motionOk]);
  const pickMetric = (m: Metric) => { setChartStill(true); setMetric(m); };
  const series = d.series?.[metric] ?? null;

  // Timing is a client-side insight (viewer's time zone); it joins the list last.
  const timing = useMemo(() => (clock ? audienceInsight(d.timed) : null), [d.timed, clock]);
  const insights = useMemo(() => (timing ? [...d.insights, timing] : d.insights), [d.insights, timing]);

  // ---- greeting ----------------------------------------------------------------
  const part = partOfDay(clock);
  const greeting = d.firstName ? `${part ?? "Welcome back"}, ${d.firstName}` : "Your overview";

  // ---- today's one sentence: the account's real schedule and recommendations ---
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
        href: "/plan/calendar",
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

  // ---- the score ring -------------------------------------------------------
  const score = d.score ?? null;
  const tone = score ? scoreTone(score.score) : null;
  const ringLabel = score ? `Content score ${score.score} of 100, ${tone!.word.toLowerCase()}` : nothingConnected ? "No content score: nothing connected" : "No content score yet: needs five posts on Instagram";

  // ---- stat cards with their own trend -------------------------------------------
  const rangeDays = d.series?.views.current.length ?? 30;
  const sparkFor = (id: Kpi["id"]): { values: number[]; kind: "bars" | "line" } | null => {
    if (!d.series) return null;
    if (id === "views") return { values: bucket(d.series.views.current.map((p) => p.value), 7, "sum"), kind: "bars" };
    if (id === "engagement_rate") return { values: bucket(d.series.engagement.current.map((p) => p.value), 10, "mean"), kind: "line" };
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

  // ---- the week ------------------------------------------------------------------
  const week: WeekDay[] | null = useMemo(() => (clock ? buildWeek({ now: clock, published: d.timed, calendar: d.calendar ?? [], plan: d.planWeek ?? null }) : null), [clock, d.timed, d.calendar, d.planWeek]);

  // ---- audience: what this account's own posts show --------------------------------
  const formats = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const p of d.posts) if (p.multiplier != null) by.set(p.format, [...(by.get(p.format) ?? []), p.multiplier]);
    return [...by.entries()]
      .filter(([, xs]) => xs.length >= 2)
      .map(([f, xs]) => {
        const s2 = [...xs].sort((a, b) => a - b);
        const mid = Math.floor(s2.length / 2);
        return { format: f, m: s2.length % 2 ? s2[mid] : (s2[mid - 1] + s2[mid]) / 2, n: xs.length };
      })
      .sort((a, b) => b.m - a.m)
      .slice(0, 4);
  }, [d.posts]);
  const maxFormat = Math.max(1, ...formats.map((f) => f.m));

  // ---- competitors: you and the top three on one measure -----------------------------
  const comp = d.competitors;
  const compRows = comp ? compareBars(comp, compMetric) : [];
  const compMax = Math.max(1, ...compRows.map((r) => r.value));
  const compSource = COMPETITOR_METRICS.find((m) => m.id === compMetric)!.source;

  let i = 0;
  const next = () => i++;

  return (
    <div className="dash-stack">
      <header className="dash-head">
        <div className="dash-hello">
          <span className="dash-date">{clock ? clock.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : " "}</span>
          <h1>{greeting}{d.handle ? <span> @{d.handle}</span> : null}</h1>
        </div>
        <div className="dash-head-actions">
          {!nothingConnected && (
            <Mounted fallback={<Skeleton variant="value" width={150} />}>
              <AccountSwitcher />
              <DateRangeSelector maxDays={d.maxDays} />
            </Mounted>
          )}
          {/* One primary action per screen: the hero's. Nothing connected, the hero
              already says "Connect a platform", so the header adds nothing. */}
          {!nothingConnected && <ButtonLink href="/create"><Plus /> Create post</ButtonLink>}
          <span className="dash-updated"><UpdatedAgo at={d.updatedAt ?? null} /></span>
        </div>
      </header>

      {d.justConnected && (
        <p className="dash-notice" role="status">
          <CheckCircle2 aria-hidden />
          Instagram connected{d.handle ? ` as @${d.handle}` : ""}. Your numbers fill in as SOCIA syncs; the first sync takes a minute.
        </p>
      )}

      {/* ---- hero: the score and today's one sentence ------------------------------ */}
      <Reveal index={next()}>
      <section className="dash-hero dash-lift" aria-labelledby="dash-hero-title">
        <div className="dash-hero-ring">
          <Ring share={score ? score.score / 100 : 0} tone={tone?.tone ?? "none"} label={ringLabel}>
            {score ? <b><CountUp value={score.score} /></b> : <b className="is-na">{DASH}</b>}
            <small>{score ? "of 100" : "no score"}</small>
          </Ring>
          <span className={`dash-hero-word is-${tone?.tone ?? "none"}`}>{score ? tone!.word : nothingConnected ? "Nothing connected" : "Needs 5 posts"}</span>
        </div>
        <div className="dash-hero-body">
          <span className="dash-eyebrow"><CalendarDays aria-hidden /> Today</span>
          {priority ? (
            <>
              <h2 id="dash-hero-title">{priority.title}</h2>
              <p>{priority.sub}</p>
              <div className="dash-hero-actions">
                <ButtonLink href={priority.href} variant="primary" size="sm">{priority.cta} <ArrowRight aria-hidden /></ButtonLink>
                {score && <span className="dash-hero-verdict">{score.verdict}</span>}
              </div>
            </>
          ) : (
            <div className="s-stack" aria-busy="true"><Skeleton variant="title" width="70%" /><Skeleton variant="text" width="50%" /></div>
          )}
          <Details label="Details" openLabel="Less">
            {score && (
              <div className="dash-dims">
                <span className="dash-mini-label">How the score is built</span>
                <ul className="dash-bars">
                  {score.dims.map((x) => (
                    <li key={x.label} role="img" aria-label={`${x.label}: ${x.value} of 100. ${x.method}`}>
                      <span className="dash-bars-name"><b>{x.label}</b><small>{x.method}</small></span>
                      <Bar share={x.value / 100} />
                      <b className="dash-bars-num">{x.value}</b>
                    </li>
                  ))}
                </ul>
                <p className="dash-note">Calculated from {score.sampleSize} posts, your followers and daily reach. A measure of what is visible, never a prediction of reach or virality.</p>
              </div>
            )}
            <BriefingLines b={d.intel.briefing} />
            {!nothingConnected && <div className="dash-nested"><TodayCard {...d.today} view={todayView} /></div>}
          </Details>
        </div>
      </section>
      </Reveal>

      {/* ---- this week ------------------------------------------------------------ */}
      <Reveal index={next()}>
        <Card className="dash-lift">
          <CardHeader title="This week" actions={<Link href="/plan/calendar" className="s-link">Calendar</Link>} />
          {week ? (
            <ol className="dash-strip" aria-label="This week">
              {week.map((day) => (
                <li key={day.date} className={`dash-day${day.isToday ? " is-today" : ""}${day.isPast ? " is-past" : ""}`}>
                  <span className="s-sr">{describeDay(day)}</span>
                  <span className="dash-day-head" aria-hidden><small>{day.label}</small><b>{day.dayNum}</b></span>
                  <span className="dash-day-items" aria-hidden>
                    {day.items.length ? day.items.map((it, k) => {
                      const Icon = KIND_ICON[it.kind];
                      return (
                        <span key={k} className={`dash-day-item is-${it.status}`} title={`${it.title}: ${STATUS_WORD[it.status]}`}>
                          <Icon />
                          <i />
                        </span>
                      );
                    }) : day.isPast ? <span className="dash-day-none" /> : <Link href="/create" className="dash-day-add" aria-label={`Create a post for ${day.label} ${day.dayNum}`} tabIndex={-1}><Plus /></Link>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="dash-strip is-loading" aria-busy="true">{Array.from({ length: 7 }, (_, k) => <Skeleton key={k} variant="block" className="dash-day-skel" />)}</div>
          )}
          <ul className="dash-legend" aria-hidden>
            <li className="is-posted"><i />Posted</li>
            <li className="is-scheduled"><i />Scheduled</li>
            <li className="is-planned"><i />Planned</li>
            <li className="is-draft"><i />Draft</li>
          </ul>
          {d.focus ? (
            <p className="dash-line"><Link href="/plan" className="s-link">Plan</Link>: {d.focus.headline}</p>
          ) : (
            <p className="dash-line dash-line--empty">No plan yet. <Link href="/plan" className="s-link">Generate a Content Plan</Link></p>
          )}
          {(d.focus || d.upcoming.length > 0) && (
            <Details label="Details" openLabel="Less">
              {d.focus && (
                <>
                  {d.focus.outcomeLine && <p className="dash-note">So far: {d.focus.outcomeLine}</p>}
                  <ul className="dash-notes">
                    {d.focus.tiles.map((t, k) => <li key={k}><b>{t.title}</b> {t.detail}</li>)}
                  </ul>
                  <p className="dash-note">From your Content Plan of {new Date(d.focus.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, built on your performance, goals and competitors.</p>
                </>
              )}
              {d.upcoming.length > 0 && (
                <>
                  <span className="dash-mini-label">Next up</span>
                  <ul className="dash-notes">
                    {d.upcoming.map((u) => <li key={u.id}><b>{clock ? dayLabel(new Date(u.at), clock) : ""}</b> {u.title} <small>({u.format})</small></li>)}
                  </ul>
                </>
              )}
            </Details>
          )}
        </Card>
      </Reveal>

      {/* ---- stat cards -------------------------------------------------------------- */}
      <Reveal index={next()} className="dash-stats">
        {d.kpis
          ? d.kpis.slice(0, STAT_COUNT).map((k) => {
              const m = KPI_METRIC[k.id];
              const selectable = Boolean(m && d.series && d.series[m].provenance !== "unavailable");
              const Icon = KPI_ICON[k.id] ?? Eye;
              const spark = k.status === "ok" ? sparkFor(k.id) : null;
              const body = (
                <>
                  <span className="dash-stat-label"><Icon aria-hidden /> {k.label}</span>
                  <span className="dash-stat-row">
                    <b className="dash-stat-value">{k.status === "unavailable" || k.raw == null ? (k.status === "unavailable" ? DASH : k.value) : <CountUp value={k.raw} format={kpiFormat(k)} />}</b>
                    {spark && <Spark values={spark.values} kind={spark.kind} />}
                  </span>
                  <span className="dash-stat-foot">
                    {k.deltaText && k.status === "ok" ? (
                      <span className={`dash-stat-delta${k.positive === false ? " is-bad" : k.positive ? " is-good" : ""}`}>
                        {k.positive === false ? <ArrowDownRight aria-hidden /> : k.positive ? <ArrowUpRight aria-hidden /> : null}
                        {k.deltaText}
                      </span>
                    ) : <small>{k.note}</small>}
                  </span>
                </>
              );
              return selectable ? (
                <button key={k.id} type="button" className={`dash-stat dash-lift${metric === m ? " is-on" : ""}`} aria-pressed={metric === m} onClick={() => pickMetric(m as Metric)}>{body}</button>
              ) : (
                <div key={k.id} className="dash-stat dash-lift">{body}</div>
              );
            })
          : summaryTiles(connected)}
      </Reveal>

      {/* ---- chart beside the best posts ------------------------------------------------ */}
      <Reveal index={next()} className={`dash-main${d.live ? "" : " is-single"}`}>
        {series && d.series ? (
          <Card className="dash-lift">
            <CardHeader title={`${series.label} by day`} period={d.rangeLabel} />
            <OverviewChart series={series} showPrevious={false} height={216} compact still={chartStill} />
            {d.live && insights.length > 0 ? (
              <Details label="What stands out" openLabel="Less">
                <p className="dash-note">{series.note}</p>
                <InsightList insights={insights.slice(0, 3)} posts={d.posts} compact />
              </Details>
            ) : (
              <p className="dash-note">{series.note}</p>
            )}
          </Card>
        ) : (
          <Card className="dash-lift">
            <CardHeader title="Views by day" period={d.rangeLabel} />
            <Empty>
              <b>No daily series yet.</b> {nothingConnected ? "Connect Instagram to see views by day." : "Appears once SOCIA has synced Instagram's daily numbers."}
            </Empty>
          </Card>
        )}

        {d.live && (
          <Card className="dash-lift">
            <CardHeader title="Best posts" period={d.rangeLabel} actions={<Link href="/analytics#content" className="s-link">All</Link>} />
            {d.top.length ? (
              <ul className="dash-top">
                {d.top.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="dash-top-item" onClick={() => setOpen(p)} aria-label={`${p.title}: ${p.views != null ? `${fmtNum(p.views)} views` : `${fmtNum(p.engagements)} interactions`}${p.multiplier != null ? `, ${p.multiplier.toFixed(1)} times your median` : ""}`}>
                      <span className="dash-top-media">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" width={64} height={64} loading="lazy" />
                        ) : (
                          <Film aria-hidden />
                        )}
                        <span className="dash-top-plat"><PlatformMark platform={p.platform as Platform} brand /></span>
                      </span>
                      <span className="dash-top-num"><b>{p.views != null ? fmtNum(p.views) : fmtNum(p.engagements)}</b><small>{p.views != null ? "views" : "interactions"}</small></span>
                      {p.multiplier != null && <span className="dash-top-mult">{p.multiplier.toFixed(1)}x</span>}
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
      </Reveal>

      {/* ---- more from your account: closed until opened -------------------------------- */}
      <section className="dash-more" aria-labelledby="dash-more-title">
        <button type="button" className="dash-more-toggle" aria-expanded={more} aria-controls="dash-more-body" onClick={toggleMore}>
          <span className="dash-more-text">
            <b id="dash-more-title">More from your account</b>
            <small>What&apos;s working, next actions, competitors, goals, audience, platforms and ideas</small>
          </span>
          <ChevronDown aria-hidden />
        </button>
        {more && (
          <div id="dash-more-body" className="dash-stack dash-more-body">
            {/* ---- you against competitors, and what's working ------------------------------ */}
            <Reveal index={next()} className="dash-duo">
              <Card className="dash-lift">
                <CardHeader title="Competitors" actions={<Link href="/discover" className="s-link">All</Link>} />
                {comp == null ? (
                  <Empty>
                    <b>Competitors couldn&apos;t be read right now.</b> Open Discover to see them.
                  </Empty>
                ) : compRows.length > 1 ? (
                  <>
                    <SegmentedControl
                      className="dash-seg"
                      label="Measure"
                      value={compMetric}
                      onChange={setCompMetric}
                      options={COMPETITOR_METRICS.map((m) => ({ value: m.id, label: m.id === "engagement" ? "Per post" : "Followers" }))}
                    />
                    <ul className="dash-bars dash-comp" aria-label={`You against competitors, ${COMPETITOR_METRICS.find((m) => m.id === compMetric)!.label.toLowerCase()}`}>
                      {compRows.map((r) => (
                        <li key={r.handle} className={r.you ? "is-you" : undefined} role="img" aria-label={`${r.name}: ${fmtNum(Math.round(r.value))}`}>
                          <span className="dash-bars-name dash-comp-who">
                            {r.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.avatar} alt="" width={20} height={20} referrerPolicy="no-referrer" />
                            ) : (
                              <i aria-hidden>{r.name.replace(/^@/, "")[0]?.toUpperCase() ?? "?"}</i>
                            )}
                            <b>{r.name}</b>
                          </span>
                          <Bar share={r.value / compMax} tone={r.you ? "you" : "data"} />
                          <b className="dash-bars-num">{fmtNum(Math.round(r.value))}</b>
                        </li>
                      ))}
                    </ul>
                    <Details label="Details" openLabel="Less"><p className="dash-note">{compSource}</p></Details>
                  </>
                ) : (
                  <Empty action={<ButtonLink href="/discover" size="sm">Open Competitors</ButtonLink>}>
                    <b>{comp.tracked ? "No public numbers read yet." : "No competitors tracked yet."}</b> {comp.tracked ? "Open Competitors to read their latest posts." : "Track accounts in your niche to compare them here."}
                  </Empty>
                )}
              </Card>

              <Card className="dash-lift">
                <CardHeader title="What's working" />
                <WorksBars works={d.intel.works} />
                {d.intel.works.length > 0 && (
                  <Details label="Details" openLabel="Less"><WorksNotes works={d.intel.works} themes={d.intel.themes} postsRead={d.intel.postsRead} /></Details>
                )}
              </Card>
            </Reveal>

            {/* ---- next actions as chips ------------------------------------------------------ */}
            <Reveal index={next()}>
              <Card className="dash-lift">
                <CardHeader title="Next actions" period="From your own posts" />
                <ActionChips actions={d.intel.actions} />
              </Card>
            </Reveal>

            {/* ---- goals and audience ---------------------------------------------------------- */}
            <Reveal index={next()} className="dash-duo">
              <Card className="dash-lift">
                <CardHeader title="Goals" actions={<Link href="/settings#growth" className="s-link">Edit</Link>} />
                <GoalBars goals={d.intel.goals} ready={d.intel.goalsReady} />
                {d.intel.goals.length > 0 && <Details label="Details" openLabel="Less"><GoalNotes goals={d.intel.goals} /></Details>}
              </Card>

              <Card className="dash-lift">
                <CardHeader title="Audience" actions={<Link href="/analytics#audience" className="s-link">All</Link>} />
                {timing || formats.length ? (
                  <div className="dash-aud">
                    {timing && <p className="dash-line"><b>{timing.title}</b></p>}
                    {formats.length > 0 && (
                      <ul className="dash-bars" aria-label="Formats that land">
                        {formats.map((f) => (
                          <li key={f.format} role="img" aria-label={`${f.format}: ${f.m.toFixed(1)} times your median post, ${f.n} posts`}>
                            <span className="dash-bars-name"><b>{f.format}</b></span>
                            <Bar share={f.m / maxFormat} />
                            <b className="dash-bars-num">{f.m.toFixed(1)}x</b>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Details label="Details" openLabel="Less">
                      {timing && <p className="dash-note">{timing.body}</p>}
                      {formats.length > 0 && <p className="dash-note">Median interactions per post by format, against your median post. Formats with two or more posts.</p>}
                    </Details>
                  </div>
                ) : (
                  <Empty>
                    <b>Not enough posts yet.</b> Patterns appear after a few dated posts.
                  </Empty>
                )}
              </Card>
            </Reveal>

            {/* ---- platforms -------------------------------------------------------------- */}
            <Reveal index={next()}>
              <Card className="dash-lift">
                <CardHeader title="Platforms" period={d.rangeLabel} />
                <ul className="dash-plats">
                  {[...d.summaries].sort((a, b) => Number(b.connected) - Number(a.connected)).map((s) => (
                    <li key={s.platform} className={s.connected ? "is-on" : undefined}>
                      <PlatformMark platform={s.platform as Platform} brand={s.connected} />
                      <span className="dash-plat-body">
                        <b>{s.label}</b>
                        {s.connected ? (
                          <small>{s.audience != null ? `${fmtNum(s.audience)} ${s.audienceLabel || "audience"}` : "Connected"}</small>
                        ) : (
                          <ButtonLink href={s.platform === "instagram" ? d.connectHref : "/settings#accounts"} size="sm">Connect</ButtonLink>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <Details label="All numbers" openLabel="Less">
                  <TableWrap>
                    <table className="s-table s-table--stack">
                      <thead>
                        <tr><th>Platform</th><th className="num">Posted</th><th className="num">Audience</th><th className="num">Views</th><th className="num">Engagement</th><th className="act" /></tr>
                      </thead>
                      <tbody>
                        {d.summaries.map((s) => (
                          <tr key={s.platform}>
                            <td className="id"><b>{s.label}</b><span className="sub">{s.connected ? "Connected" : "Not connected"}</span></td>
                            <td className="num key" data-label="Posted">{s.connected ? s.contentPublished != null ? fmtNum(s.contentPublished) : <Unavailable reason="Not reported for this period" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}</td>
                            <td className="num" data-label="Audience">{s.connected ? s.audience != null ? fmtNum(s.audience) : <Unavailable reason="Not reported" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}</td>
                            <td className="num" data-label="Views">{s.connected ? s.views != null ? fmtNum(s.views) : <Unavailable reason={s.viewsNote ?? "Not reported by the platform"} compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}</td>
                            <td className="num" data-label="Engagement">{s.connected ? s.engagement != null ? fmtNum(s.engagement) : <Unavailable reason="Not reported for this period" compact /> : <Unavailable reason={`Connect ${s.label}`} compact />}</td>
                            <td className="act">{s.connected ? <Link href={`/analytics?platform=${s.platform}`} className="s-link">Analytics</Link> : null}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                  <p className="dash-note">Each platform reports its own metrics. A dash means the platform did not report that number for this period, not zero.</p>
                </Details>
              </Card>
            </Reveal>

            {/* ---- more: ideas, reposting, learning -------------------------------------------- */}
            <Reveal index={next()} className="dash-trio">
              {!nothingConnected && (
                <Card className="dash-lift">
                  <CardHeader title="Video ideas" />
                  <p className="dash-line">Ideas in the theme of your own posts, with a shot plan.</p>
                  <Details label="Open" openLabel="Close"><div className="dash-nested"><VideoIdeasCard /></div></Details>
                </Card>
              )}
              {d.repurpose.length > 0 && (
                <Card className="dash-lift">
                  <CardHeader title="Worth posting again" />
                  <ul className="dash-thumbs" aria-label="Posts worth reposting">
                    {d.repurpose.slice(0, 4).map((c) => (
                      <li key={c.key} title={c.title}>
                        {c.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumb} alt={c.title} width={56} height={56} loading="lazy" />
                        ) : (
                          <span className="dash-thumb-ph" aria-label={c.title}>{c.kind === "video" ? <Film aria-hidden /> : <ImageIcon aria-hidden />}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Details label="Open" openLabel="Close"><div className="dash-nested"><RepurposeCard candidates={d.repurpose} /></div></Details>
                </Card>
              )}
              <Card className="dash-lift">
                <CardHeader title="This week's learning" period="Last 7 days" />
                <LearningLines lines={d.intel.learning} storeReady={d.intel.storeReady} />
              </Card>
            </Reveal>
          </div>
        )}
      </section>

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Without live Instagram the stat cards show each connected platform's own headline numbers, never a blend. */
function summaryTiles(connected: PlatformSummary[]) {
  if (!connected.length) {
    return ["Views", "Engagement", "Audience"].map((label) => (
      <div key={label} className="dash-stat">
        <span className="dash-stat-label">{label}</span>
        <span className="dash-stat-row"><b className="dash-stat-value is-na">{DASH}</b></span>
        <span className="dash-stat-foot"><small>Connect a platform</small></span>
      </div>
    ));
  }
  const tiles: { key: string; label: string; value: number | null; note: string }[] = [];
  for (const s of connected) {
    if (tiles.length < STAT_COUNT) tiles.push({ key: `${s.platform}-aud`, label: `${s.label} ${s.audienceLabel || "audience"}`, value: s.audience, note: s.audience != null ? "Current" : "Not reported" });
    if (tiles.length < STAT_COUNT)
      tiles.push(
        s.views != null
          ? { key: `${s.platform}-views`, label: `${s.label} views`, value: s.views, note: s.viewsNote ?? "In this range" }
          : { key: `${s.platform}-eng`, label: `${s.label} engagement`, value: s.engagement, note: s.viewsNote ?? "Not reported for this period" },
      );
  }
  return tiles.map((t) => (
    <div key={t.key} className="dash-stat dash-lift">
      <span className="dash-stat-label">{t.label}</span>
      <span className="dash-stat-row"><b className={`dash-stat-value${t.value == null ? " is-na" : ""}`}>{t.value != null ? <CountUp value={t.value} format={(n) => fmtNum(Math.round(n))} /> : DASH}</b></span>
      <span className="dash-stat-foot"><small>{t.note}</small></span>
    </div>
  ));
}
