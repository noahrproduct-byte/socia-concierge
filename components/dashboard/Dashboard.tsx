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
import "@/app/(app)/dashboard/dashboard-week.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronDown, CircleDot, FileText, Film, Image as ImageIcon, Images, Plus, Target, Zap } from "lucide-react";
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
import ViralNow from "./ViralNow";
import Momentum from "@/components/dashboard/Momentum";
import FilmingSessions from "@/components/filming/FilmingSessions";
import ShareWins from "@/components/dashboard/ShareWins";
import { ButtonLink, Card, CardHeader, Empty, PlatformMark, SegmentedControl, Skeleton, TableWrap, Unavailable, type Platform } from "@/components/system";
import type { Candidate } from "@/lib/repurpose";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import { fmtNum, audienceInsight, type Kpi, type Series, type Insight, type PostCard, type Focus, type Upcoming, type GoalTracker } from "@/lib/overview";
import type { CalPost } from "@/lib/audience";
import { buildWeek, compareBars, describeDay, COMPETITOR_METRICS, type CalendarItem, type CompetitorMetric, type Competitors, type PlanDayItem, type WeekCover, type WeekDay } from "@/lib/overviewVisual";
import { AngleSections, BriefingLines, GoalBars, GoalNotes, LearningLines, WorksBars, WorksNotes, type IntelData } from "./IntelSections";
import { Bar, CountUp, Details, Reveal, Ring, useMotionOk } from "./motion";
import YourTasks from "./YourTasks";
import type { MyTask } from "@/lib/teamWork";
import { standout } from "@/lib/postVerdicts";

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
  timed: (CalPost & { id: string; format: string; cover?: WeekCover | null })[];
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
  /** Plan posts handed to the viewer to film (lib/teamWorkServer); empty without a team. */
  tasks?: MyTask[];
};

type Metric = "views" | "engagement" | "followers";
const KPI_METRIC: Partial<Record<Kpi["id"], Metric>> = { views: "views", engagement_rate: "engagement", followers: "followers" };
const KIND_ICON = { reel: Film, photo: ImageIcon, carousel: Images, story: CircleDot, post: FileText } as const;
const STATUS_WORD = { posted: "Posted", scheduled: "Scheduled", planned: "Planned", draft: "Draft", failed: "Failed" } as const;
/** The post's own cover on the week strip: its picture, or its video's opening
 *  frame. It sits over the kind icon, so a file that no longer loads leaves the icon. */
function DayCover({ cover }: { cover: WeekCover }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return cover.video ? (
    <video className="dash-day-cover" src={`${cover.src}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} onError={() => setGone(true)} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="dash-day-cover" src={cover.src} alt="" loading="lazy" onError={() => setGone(true)} />
  );
}

/** The stat row shows three numbers: the three that drive the chart. */
const STAT_COUNT = 4;
const TODO_ICON = [Zap, Target, CalendarDays] as const;
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

const kpiFormat = (k: Kpi): ((n: number) => string) =>
  k.id === "engagement_rate" ? (n) => `${n.toFixed(k.raw != null && k.raw < 1 ? 2 : 1)}%` : k.id === "followers" ? (n) => Math.round(n).toLocaleString("en-US") : k.id === "posts" ? (n) => String(Math.round(n)) : (n) => fmtNum(Math.round(n));

/** `look`: "dark" keeps the panel dark whatever the app's appearance is; "auto" follows the app. */
export default function Dashboard({ d, look = "auto" }: { d: DashboardData; look?: "dark" | "auto" }) {
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
  const greeting = d.firstName ? `${part ?? "Welcome back"}, ${d.firstName}` : "Dashboard";

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

  // ---- this week's posts: the last 7 days, newest first ---------------------------
  const inWeek = useMemo(() => (clock ? d.posts.filter((p) => clock.getTime() - new Date(p.published).getTime() < 7 * 86400000) : null), [d.posts, clock]);
  // A quiet week still shows the account's latest posts, however old, newest first.
  const quietWeek = Boolean(inWeek && !inWeek.length && d.posts.length);
  const weekPosts = quietWeek ? d.posts.slice(0, 5) : inWeek;

  const last7 = d.series && d.series.views.provenance !== "unavailable" && d.series.views.current.length ? d.series.views.current.slice(-7) : null;
  const max7 = Math.max(1, ...(last7 ?? []).map((pt) => pt.value ?? 0));
  // Three things to do: today's one sentence first, then the findings.
  const todo = [
    ...(priority ? [{ title: priority.title.replace(/\.$/, ""), sub: priority.sub, href: priority.href, cta: priority.cta }] : []),
    ...d.intel.actions.map((a) => ({ title: a.title, sub: a.reason, href: a.href, cta: "Open" })),
  ].slice(0, 3);

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
    <div className={`dash-stack dash-hud${look === "dark" ? " dark" : ""}`} data-theme={look === "dark" ? "dark" : undefined}>
      <header className="dash-head">
        <div className="dash-hello">
          <span className="dash-date">{clock ? clock.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : " "}</span>
          <h1>{greeting}</h1>
          {d.handle && <span className="dash-hud-sub">@{d.handle}{weekPosts && weekPosts.length && !quietWeek ? ` · ${weekPosts.length} ${weekPosts.length === 1 ? "video" : "videos"} posted this week` : ""}</span>}
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

      {/* ---- this week's videos: what went out and what each one got. Press one for its breakdown. ---- */}
      <Reveal index={next()}>
        <section className="dash-week" aria-labelledby="dash-week-title">
          <div className="dash-sec">
            <h2 id="dash-week-title">{quietWeek ? "Your latest videos" : "This week\u2019s videos"}</h2>
            {weekPosts && weekPosts.length > 0 && <span className="dash-sec-hint">{quietWeek ? "Nothing posted in the last 7 days. Press a video to see what worked and what didn\u2019t" : "Press a video to see what worked and what didn\u2019t"}</span>}
          </div>
          {!d.live ? (
            <Empty action={<ButtonLink href={d.connectHref} size="sm">Connect Instagram</ButtonLink>}>
              <b>Your videos show here.</b> Connect Instagram to see each one with its views and engagement.
            </Empty>
          ) : !weekPosts ? (
            <div className="dash-hud-grid" aria-busy="true">{Array.from({ length: 4 }, (_, k) => <Skeleton key={k} variant="block" className="dash-week-skel" />)}</div>
          ) : weekPosts.length ? (
            <ul className="dash-hud-grid">
              {weekPosts.map((p) => {
                const tag = standout(p);
                const seen = p.reach ?? p.views;
                // A rate over 100% means the platform's view count is behind its likes; no ring then.
                const rate = seen && p.engagements <= seen ? p.engagements / seen : null;
                const pct = rate != null ? `${(rate * 100).toFixed(1)}%` : null;
                return (
                  <li key={p.id}>
                    <button type="button" className={`dash-hud-card dash-lift${tag ? ` is-${tag.tone}` : ""}`} onClick={() => setOpen(p)} aria-label={`${p.title}: ${p.views != null ? `${fmtNum(p.views)} views, ` : ""}${pct ? `${pct} engagement` : `${fmtNum(p.engagements)} interactions`}${tag ? `, ${tag.word.toLowerCase()}` : ""}. Open the breakdown`}>
                      <span className="dash-week-cover">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" loading="lazy" />
                        ) : (
                          <Film aria-hidden />
                        )}
                        {tag && <span className={`dash-week-tag is-${tag.tone}`}>{tag.word}</span>}
                        <span className="dash-week-day">{quietWeek ? new Date(p.published).toLocaleDateString("en-US", clock && new Date(p.published).getFullYear() !== clock.getFullYear() ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" }) : new Date(p.published).toLocaleDateString("en-US", { weekday: "short" })}</span>
                      </span>
                      <span className="dash-hud-title">{p.title}</span>
                      <span className="dash-hud-row">
                        <span className="dash-week-num"><b>{p.views != null ? fmtNum(p.views) : fmtNum(p.engagements)}</b><small>{p.views != null ? "views" : "interactions"}</small></span>
                        {rate != null && pct && (
                          <span className="dash-hud-rate" aria-hidden>
                            <Ring share={Math.min(1, rate / 0.1)} size={40} stroke={5} tone={tag?.tone === "bad" ? "low" : "good"} label="" />
                            <b>{pct}</b>
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty action={<ButtonLink href="/create" size="sm">Create a post</ButtonLink>}>
              <b>Nothing posted in the last 7 days.</b> Each video you publish shows here with its views and engagement.
            </Empty>
          )}
        </section>
      </Reveal>

      {/* ---- onboarding, under the week's videos: a new account's first steps, and the posting streak (lib/perks) ---- */}
      <Momentum />

      {/* The session being filmed today, or the next one (lib/filmingPlan.ts). Nothing when there is none. */}
      <FilmingSessions where="dashboard" />

      {/* ---- plan posts handed to you ---------------------------------------------- */}
      {(d.tasks?.length ?? 0) > 0 && (
        <Reveal index={next()}>
          <YourTasks tasks={d.tasks!} />
        </Reveal>
      )}

      {/* ---- at a glance: four rings, then the two charts, then the best post ---- */}
      <div className="dash-sec">
        <h2>At a glance</h2>
        <span className="dash-sec-hint">{d.rangeLabel}{!nothingConnected && <> · <Link href="/analytics" className="s-link">Full analytics</Link></>}</span>
      </div>

      <Reveal index={next()} className="dash-stats">
        {d.kpis
          ? d.kpis.slice(0, STAT_COUNT).map((k) => {
              const m = KPI_METRIC[k.id];
              const selectable = Boolean(m && d.series && d.series[m].provenance !== "unavailable");
              const ok = k.status === "ok";
              const share = !ok ? 0 : k.deltaPct != null ? Math.min(1, Math.max(0.04, (1 + k.deltaPct / 100) / 2)) : 0.5;
              const body = (
                <>
                  <Ring share={share} size={132} stroke={10} tone={!ok ? "none" : k.positive === false ? "low" : k.positive ? "good" : "ok"} label={`${k.label}: ${k.value}${k.deltaText && ok ? `, ${k.deltaText}` : ""}`}>
                    <b>{k.status === "unavailable" || k.raw == null ? (k.status === "unavailable" ? DASH : k.value) : <CountUp value={k.raw} format={kpiFormat(k)} />}</b>
                    <small className={ok && k.positive === false ? "is-bad" : ok && k.positive ? "is-good" : undefined}>{k.deltaText && ok ? k.deltaText.replace(/ vs\..*$/, "") : k.status === "collecting" ? "collecting" : ""}</small>
                  </Ring>
                  <span className="dash-hud-label">{k.label}</span>
                </>
              );
              return selectable ? (
                <button key={k.id} type="button" className={`dash-hud-ring dash-lift${metric === m ? " is-on" : ""}`} aria-pressed={metric === m} onClick={() => pickMetric(m as Metric)}>{body}</button>
              ) : (
                <div key={k.id} className="dash-hud-ring dash-lift">{body}</div>
              );
            })
          : summaryTiles(connected)}
      </Reveal>

      <Reveal index={next()} className="dash-duo">
        <Card className="dash-lift">
          <CardHeader title="Views by day" period="Last 7 days" />
          {last7 ? (
            <ol className="dash-hud-days" aria-label="Views by day, last 7 days">
              {last7.map((pt) => {
                const v = pt.value ?? 0;
                return (
                  <li key={pt.day} className={v === max7 && max7 > 1 ? "is-top" : undefined} role="img" aria-label={`${new Date(`${pt.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}: ${fmtNum(v)} views`}>
                    <small aria-hidden>{fmtNum(v)}</small>
                    <span className="dash-hud-daybar" aria-hidden><i style={{ height: `${Math.max(2, (v / max7) * 100)}%` }} /></span>
                    <small aria-hidden>{new Date(`${pt.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" })}</small>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty>
              <b>No daily views yet.</b> {nothingConnected ? "Connect Instagram to see views by day." : "Appears once SOCIA has synced Instagram's daily numbers."}
            </Empty>
          )}
        </Card>
        <Card className="dash-lift">
          <CardHeader title="Performance over time" period={series ? `${series.label}, ${d.rangeLabel.toLowerCase()}` : d.rangeLabel} />
          {series && d.series ? (
            <>
              <OverviewChart series={series} showPrevious={false} height={200} compact still={chartStill} />
              {d.live && insights.length > 0 && (
                <Details label="What stands out" openLabel="Less">
                  <InsightList insights={insights.slice(0, 3)} posts={d.posts} compact />
                </Details>
              )}
            </>
          ) : (
            <Empty>
              <b>No series yet.</b> It fills in as SOCIA syncs your daily numbers.
            </Empty>
          )}
        </Card>
      </Reveal>

      {d.live && d.top.length > 0 && (
        <Reveal index={next()} className="dash-duo">
          <button type="button" className="dash-hud-best dash-lift" onClick={() => setOpen(d.top[0])} aria-label={`Best post: ${d.top[0].title}. Open the breakdown`}>
            <span className="dash-hud-best-media">
              {d.top[0].thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.top[0].thumb} alt="" loading="lazy" />
              ) : (
                <Film aria-hidden />
              )}
            </span>
            <span className="dash-hud-best-body">
              <span className="dash-hud-label">Best post</span>
              <b>{d.top[0].title}</b>
              <span className="dash-hud-best-nums">
                {d.top[0].views != null && <span><b>{fmtNum(d.top[0].views)}</b> views</span>}
                {d.top[0].likes != null && <span><b>{fmtNum(d.top[0].likes)}</b> likes</span>}
                {d.top[0].saves != null && <span><b>{fmtNum(d.top[0].saves)}</b> saves</span>}
              </span>
            </span>
          </button>
          <Card className="dash-lift">
            <CardHeader title="Next best" period={d.rangeLabel} actions={<Link href="/analytics#content" className="s-link">All</Link>} />
            <ul className="dash-top">
              {d.top.slice(1, 5).map((p) => (
                <li key={p.id}>
                  <button type="button" className="dash-top-item" onClick={() => setOpen(p)} aria-label={`${p.title}: ${p.views != null ? `${fmtNum(p.views)} views` : `${fmtNum(p.engagements)} interactions`}. Open the breakdown`}>
                    <span className="dash-top-media">
                      {p.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb} alt="" width={64} height={64} loading="lazy" />
                      ) : (
                        <Film aria-hidden />
                      )}
                    </span>
                    <span className="dash-top-num"><b>{p.views != null ? fmtNum(p.views) : fmtNum(p.engagements)}</b><small>{p.views != null ? "views" : "interactions"}</small></span>
                    {p.multiplier != null && <span className="dash-top-mult">{p.multiplier.toFixed(1)}x</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      )}

      {/* ---- what to do next: three things, most useful first ---- */}
      <div className="dash-sec">
        <h2>What to do next</h2>
        <span className="dash-sec-hint">Three things, most useful first</span>
      </div>
      <Reveal index={next()}>
        {todo.length ? (
          <ol className="dash-hud-todo">
            {todo.map((t, k) => {
              const Icon = TODO_ICON[k % TODO_ICON.length];
              return (
                <li key={`${t.href}-${k}`} className="dash-lift">
                  <span className="dash-hud-todo-head"><i className={`is-${k}`} aria-hidden><Icon /></i><b>{t.title}</b></span>
                  <p>{t.sub}</p>
                  <ButtonLink href={t.href} size="sm" variant={k === 0 ? "primary" : undefined}>{t.cta}</ButtonLink>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty>
            <b>Nothing to act on yet.</b> Actions appear once SOCIA has findings from your posts.
          </Empty>
        )}
        {!nothingConnected && (
          <Details label="Details" openLabel="Less">
            <BriefingLines b={d.intel.briefing} />
            <div className="dash-nested"><TodayCard {...d.today} view={todayView} /></div>
          </Details>
        )}
      </Reveal>

      {/* ---- more from your account: closed until opened -------------------------------- */}
      <section className="dash-more" aria-labelledby="dash-more-title">
        <button type="button" className="dash-more-toggle" aria-expanded={more} aria-controls="dash-more-body" onClick={toggleMore}>
          <span className="dash-more-text">
            <b id="dash-more-title">More from your account</b>
            <small>Your week, competitors, goals, audience, platforms and ideas</small>
          </span>
          <ChevronDown aria-hidden />
        </button>
        {more && (
          <div id="dash-more-body" className="dash-stack dash-more-body">
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
                                {it.cover && <DayCover cover={it.cover} />}
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

            {/* ---- posts that beat the account's usual result, with an image to share (lib/share) ---- */}
            <ShareWins />
            {/* ---- going viral in the niche: real Reels that took off (Discover's, app/api/dashboard/viral) ---- */}
            {!nothingConnected && (
              <Reveal index={next()}>
                <ViralNow />
              </Reveal>
            )}

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
                {/* Formats when there is more than one to compare; hooks, topics and niche trends always. */}
                {(d.intel.works.length > 0 || !d.intel.angles.length) && <WorksBars works={d.intel.works} gap={d.intel.worksGap} />}
                <AngleSections intel={d.intel} />
                {(d.intel.works.length > 0 || d.intel.angles.length > 0 || d.intel.nicheRead) && (
                  <Details label="Details" openLabel="Less"><WorksNotes works={d.intel.works} themes={d.intel.themes} postsRead={d.intel.postsRead} nicheRead={d.intel.nicheRead} /></Details>
                )}
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

      <ContentDrawer post={open} posts={d.posts} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
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
