"use client";

// The Dashboard's Today card (daily recommendations, Growth and up). The
// server sends the facts; the card works out "today" in the viewer's own time
// zone after mount, so the server (UTC) and the browser never disagree on what
// today is. Every line comes from lib/dailyRecs.ts. The Dashboard computes the
// summary once (useTodaySummary) and shares it with its Next line.

import { useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, CheckCircle2, Clapperboard, ClipboardList, Clock, MessageSquare, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button, ButtonLink, Card, CardHeader, CardSource, Empty, Skeleton } from "@/components/system";
import { dailyRecommendations, type RecKind, type TodayFacts, type TodaySummary } from "@/lib/dailyRecs";
import { viewerTimeZone } from "@/lib/publishing/timing";
import { cn } from "@/lib/utils";

const ICON: Record<RecKind, LucideIcon> = {
  failed: TriangleAlert,
  today_post: CalendarClock,
  plan_item: ClipboardList,
  comments: MessageSquare,
  gap: CalendarPlus,
  best_time: Clock,
  breakout: TrendingUp,
  studio: Clapperboard,
};

export type TodayCardProps =
  | { locked: { planName: string; href: string }; facts?: undefined }
  | { facts: TodayFacts; locked?: undefined };

export type TodayView = { summary: TodaySummary; date: string };

export function useTodaySummary(facts: TodayFacts | undefined): TodayView | null {
  const [view, setView] = useState<TodayView | null>(null);
  useEffect(() => {
    if (!facts) return;
    const tz = viewerTimeZone() ?? "UTC";
    const now = new Date();
    setView({
      summary: dailyRecommendations(facts, now, tz),
      date: now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }),
    });
  }, [facts]);
  return view;
}

export default function TodayCard(props: TodayCardProps & { view: TodayView | null }) {
  if (props.locked) {
    return (
      <Card>
        <CardHeader title="Today" />
        <Empty
          action={
            <ButtonLink href={props.locked.href} size="sm">
              See {props.locked.planName}
            </ButtonLink>
          }
        >
          <b>Daily recommendations are on {props.locked.planName}.</b> The few things worth doing today, from your own Calendar, plan, comments and posts.
        </Empty>
      </Card>
    );
  }

  const view = props.view;
  return (
    <Card>
      <CardHeader title="Today" period={view?.date} />
      {!view ? (
        <div className="s-stack" aria-busy="true">
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="50%" />
        </div>
      ) : view.summary.recs.length ? (
        <ul className="dash-rows">
          {view.summary.recs.map((r) => {
            const Icon = ICON[r.kind];
            return (
              <li key={r.kind} className={cn("dash-row", `is-${r.tone}`)}>
                <Icon aria-hidden />
                <span className="dash-row-body">
                  <b>{r.title}</b>
                  <small>
                    {r.detail}
                    {r.external && (
                      <>
                        {" "}
                        <a href={r.external.href} target="_blank" rel="noopener noreferrer">
                          {r.external.label}
                        </a>
                      </>
                    )}
                  </small>
                </span>
                <span className="dash-row-acts">
                  <ButtonLink href={r.href} size="sm" variant={r.tone === "urgent" ? "primary" : "secondary"}>
                    {r.cta}
                  </ButtonLink>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dash-notice">
          <CheckCircle2 aria-hidden />
          <span>
            <b>Nothing needs you today.</b>
            {view.summary.next ? ` Your next post, "${view.summary.next.title}", goes out ${view.summary.next.when}.` : ""}
          </span>
        </p>
      )}
      <CardSource>From your Calendar, Content Plan, comments and posts, in your time zone.</CardSource>
    </Card>
  );
}

export { Button as TodayButton };
