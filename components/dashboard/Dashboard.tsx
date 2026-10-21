"use client";

// The Dashboard answers one question: what should I do today? Every number
// arrives computed on the server from the account's own rows (lib/overview,
// lib/dailyRecs, lib/platformSummaries); this file only lays it out. One
// component for every state: nothing connected, other platforms only, and
// Instagram live.

import "@/app/(app)/dashboard/dashboard.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Film, Plus } from "lucide-react";
import OverviewChart from "@/components/ov/OverviewChart";
import ContentRow from "@/components/ov/ContentRow";
import ContentDrawer from "@/components/ov/ContentDrawer";
import { InsightList } from "@/components/ov/Insights";
import Mounted from "@/components/ov/Mounted";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import UpdatedAgo from "@/components/UpdatedAgo";
import TodayCard, { useTodaySummary, type TodayCardProps } from "@/components/TodayCard";
import RepurposeCard from "@/components/RepurposeCard";
import {
  Button,
  ButtonLink,
  Card,
  CardGrid,
  CardHeader,
  CardSource,
  Empty,
  KpiCell,
  KpiStrip,
  PageTitle,
  PlatformMark,
  PostStatusPill,
  Skeleton,
  TableWrap,
  Toolbar,
  Unavailable,
  type Platform,
} from "@/components/system";
import type { Candidate } from "@/lib/repurpose";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import { fmtNum, audienceInsight, type Kpi, type Series, type Insight, type PostCard, type Focus, type Upcoming, type GoalTracker } from "@/lib/overview";
import type { CalPost } from "@/lib/audience";

export type DashboardData = {
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

export default function Dashboard({ d }: { d: DashboardData }) {
  const connected = d.summaries.filter((s) => s.connected);
  const nothingConnected = connected.length === 0;
  const clock = useClock();
  const todayView = useTodaySummary(d.today.facts);
  const [metric, setMetric] = useState<Metric>(d.series?.views.provenance === "unavailable" ? "engagement" : "views");
  const [open, setOpen] = useState<PostCard | null>(null);
  const series = d.series?.[metric] ?? null;

  // Timing is a client-side insight (viewer's time zone); it joins the list last.
  const insights = useMemo(() => {
    if (!clock) return d.insights;
    const w = audienceInsight(d.timed);
    return w ? [...d.insights, w] : d.insights;
  }, [d.insights, d.timed, clock]);

  // The Next line: today's one finding, from the same facts as the Today card.
  const next = (() => {
    if (nothingConnected) {
      return (
        <>
          <b>Connect a platform to see your numbers.</b> Instagram, Facebook, YouTube and TikTok each bring their own.
        </>
      );
    }
    if (d.today.facts) {
      if (!todayView) return <Skeleton variant="text" width="60%" />;
      const rec = todayView.summary.recs[0];
      if (rec) {
        return (
          <>
            <b>{rec.title}.</b> {rec.detail}
          </>
        );
      }
      return (
        <>
          <b>Nothing needs you today.</b>
          {todayView.summary.next ? ` Your next post, "${todayView.summary.next.title}", goes out ${todayView.summary.next.when}.` : ""}
        </>
      );
    }
    const first = d.upcoming[0];
    if (first) {
      return (
        <>
          <b>Next up: {first.title}</b>
          {clock ? ` on ${dayLabel(new Date(first.at), clock)} at ${new Date(first.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.` : "."}
        </>
      );
    }
    return (
      <>
        <b>Nothing is scheduled.</b> Create a post to fill the next days.
      </>
    );
  })();

  const kpiCells = d.kpis
    ? d.kpis.map((k) => {
        const m = KPI_METRIC[k.id];
        const selectable = Boolean(m && d.series && d.series[m].provenance !== "unavailable");
        return (
          <KpiCell
            key={k.id}
            label={k.label}
            value={k.status === "unavailable" ? null : k.value}
            reason={k.note}
            delta={k.deltaText ? { text: k.deltaText, tone: k.positive === false ? "bad" : k.positive ? "good" : undefined } : undefined}
            note={k.status === "unavailable" ? undefined : k.note}
            selected={selectable && metric === m}
            onSelect={selectable ? () => setMetric(m as Metric) : undefined}
          />
        );
      })
    : summaryCells(connected, d.connectHref);

  return (
    <div className="dash-stack">
      <PageTitle
        title="Dashboard"
        next={next}
        stamp={<UpdatedAgo at={d.updatedAt ?? null} />}
        meta={
          <span>
            {d.handle ? `@${d.handle} · ` : ""}
            {d.rangeLabel}
          </span>
        }
        actions={
          nothingConnected ? (
            <ButtonLink href="/settings#accounts" variant="primary">
              Connect a platform
            </ButtonLink>
          ) : (
            <ButtonLink href="/create" variant="primary">
              <Plus /> Create post
            </ButtonLink>
          )
        }
      />

      {d.justConnected && (
        <p className="dash-notice" role="status">
          <CheckCircle2 aria-hidden />
          Instagram connected{d.handle ? ` as @${d.handle}` : ""}. Your numbers fill in as SOCIA syncs; the first sync takes a minute.
        </p>
      )}

      {!nothingConnected && (
        <Toolbar>
          <Mounted fallback={<Skeleton variant="value" width={150} />}>
            <AccountSwitcher />
            <DateRangeSelector maxDays={d.maxDays} />
          </Mounted>
        </Toolbar>
      )}

      {!nothingConnected && <TodayCard {...d.today} view={todayView} />}

      <KpiStrip cols={4}>{kpiCells}</KpiStrip>

      {series && d.series && (
        <Card>
          <CardHeader title={`${series.label} by day`} period={d.rangeLabel} />
          <OverviewChart series={series} showPrevious={false} height={220} compact still />
          <CardSource>{series.note}</CardSource>
        </Card>
      )}

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
            title="Upcoming"
            period="Next 7 days"
            actions={
              <Link href="/calendar" className="s-link">
                View all
              </Link>
            }
          />
          {d.upcoming.length ? (
            <ul className="dash-rows">
              {d.upcoming.map((u) => {
                const when = new Date(u.at);
                return (
                  <li key={u.id} className="dash-row">
                    <span className="dash-when">
                      {clock ? (
                        <>
                          <b>{dayLabel(when, clock)}</b>
                          <small>{when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small>
                        </>
                      ) : (
                        <Skeleton variant="text" width={56} />
                      )}
                    </span>
                    {u.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.thumb} alt="" width={40} height={40} className="dash-thumb" />
                    ) : (
                      <span className="dash-thumb dash-thumb--ph" aria-hidden>
                        <Film />
                      </span>
                    )}
                    <span className="dash-row-body">
                      <b>{u.title}</b>
                      <small>{u.format}</small>
                    </span>
                    <PostStatusPill status={u.status} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              action={
                <ButtonLink href="/create" size="sm">
                  Create post
                </ButtonLink>
              }
            >
              <b>Nothing is scheduled.</b> Posts you schedule appear here with their platform and time.
            </Empty>
          )}
        </Card>

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
          {d.trackers.length > 0 && (
            <ul className="dash-goals" aria-label="Goals">
              {d.trackers.map((t) => {
                const pct = t.target && t.current != null ? Math.min(100, Math.round((t.current / t.target) * 100)) : null;
                return (
                  <li key={t.label} className="dash-goal">
                    <span>{t.label}</span>
                    <b>{t.display}</b>
                    {pct != null && (
                      <span className="dash-goal-track" aria-hidden>
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </CardGrid>

      {d.live && (
        <Card>
          <CardHeader
            title="Top content"
            period={d.rangeLabel}
            actions={
              <Link href="/analytics#content" className="s-link">
                View all
              </Link>
            }
          />
          <ContentRow posts={d.top} onOpen={setOpen} />
        </Card>
      )}

      {d.live && insights.length > 0 && (
        <Card>
          <CardHeader title="What stands out" period={d.rangeLabel} />
          <InsightList insights={insights.slice(0, 3)} posts={d.posts} compact />
        </Card>
      )}

      {d.repurpose.length > 0 && <RepurposeCard candidates={d.repurpose} />}

      <ContentDrawer post={open} baseline={d.baseline} medianViews={d.medianViews} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Without live Instagram the strip shows each connected platform's own headline numbers, never a blend. */
function summaryCells(connected: PlatformSummary[], connectHref: string) {
  if (!connected.length) {
    return ["Views", "Engagement", "Audience", "Posts"].map((label) => <KpiCell key={label} label={label} value={null} reason="Connect a platform" />);
  }
  const cells: React.ReactNode[] = [];
  for (const s of connected) {
    if (cells.length >= 4) break;
    cells.push(<KpiCell key={`${s.platform}-aud`} label={`${s.label} ${s.audienceLabel || "audience"}`} value={s.audience != null ? fmtNum(s.audience) : null} reason="Not reported" />);
    if (cells.length >= 4) break;
    cells.push(
      s.views != null ? (
        <KpiCell key={`${s.platform}-views`} label={`${s.label} views`} value={fmtNum(s.views)} note={s.viewsNote ?? undefined} />
      ) : (
        <KpiCell key={`${s.platform}-eng`} label={`${s.label} engagement`} value={s.engagement != null ? fmtNum(s.engagement) : null} reason={s.viewsNote ?? "Not reported for this period"} />
      ),
    );
  }
  void connectHref;
  return cells;
}

export function CreatePostButton() {
  return (
    <Button variant="primary">
      <Plus /> Create post
    </Button>
  );
}
