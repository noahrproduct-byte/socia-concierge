"use client";

// The Dashboard's Today card (daily recommendations, Growth and up). The
// server sends the facts; the card works out "today" in the viewer's own time
// zone after mount, so the server (UTC) and the browser never disagree on what
// today is. Every line comes from lib/dailyRecs.ts.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun, TriangleAlert, CalendarClock, ClipboardList, MessageSquare, CalendarPlus, Clock, TrendingUp, Clapperboard, ArrowRight, ArrowUpRight, CheckCircle2, Lock } from "lucide-react";
import { dailyRecommendations, type RecKind, type TodayFacts, type TodaySummary } from "@/lib/dailyRecs";
import { viewerTimeZone } from "@/lib/publishing/timing";

const ICON: Record<RecKind, typeof Sun> = {
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

export default function TodayCard(props: TodayCardProps) {
  const [view, setView] = useState<{ summary: TodaySummary; date: string } | null>(null);
  const facts = props.facts;
  useEffect(() => {
    if (!facts) return;
    const tz = viewerTimeZone() ?? "UTC";
    const now = new Date();
    setView({
      summary: dailyRecommendations(facts, now, tz),
      date: now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }),
    });
  }, [facts]);

  if (props.locked) {
    return (
      <section className="ov-card td" aria-labelledby="td-h">
        <div className="ov-card-head">
          <h2 id="td-h"><span className="ov-h-ico primary"><Sun size={14} /></span> Today</h2>
        </div>
        <div className="td-locked">
          <Lock size={14} aria-hidden />
          <p>Daily recommendations are on {props.locked.planName}: the few things worth doing today, from your own Calendar, plan, comments and posts.</p>
          <Link href={props.locked.href} className="ov-link">See {props.locked.planName} <ArrowRight size={13} /></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="ov-card td" aria-labelledby="td-h">
      <div className="ov-card-head">
        <h2 id="td-h"><span className="ov-h-ico primary"><Sun size={14} /></span> Today</h2>
        <span className="ov-range-label">{view?.date ?? " "}</span>
      </div>
      {!view ? (
        <ul className="td-list" aria-busy="true">
          {[0, 1, 2].map((i) => <li key={i} className="td-row td-ph" aria-hidden><span className="td-ico" /><span className="td-body"><i /><i /></span></li>)}
        </ul>
      ) : view.summary.recs.length ? (
        <ul className="td-list">
          {view.summary.recs.map((r) => {
            const Icon = ICON[r.kind];
            return (
              <li key={r.kind} className={`td-row ${r.tone}`}>
                <span className="td-ico"><Icon size={15} /></span>
                <span className="td-body">
                  <b>{r.title}</b>
                  <small>{r.detail}</small>
                </span>
                <span className="td-acts">
                  <Link href={r.href} className="td-cta">{r.cta} <ArrowRight size={12} /></Link>
                  {r.external && <a href={r.external.href} target="_blank" rel="noopener noreferrer" className="td-ext">{r.external.label} <ArrowUpRight size={12} /></a>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="td-clear">
          <CheckCircle2 size={16} aria-hidden />
          <p>
            <b>Nothing needs you today.</b>{" "}
            {view.summary.next ? <>Your next post, {`“${view.summary.next.title}”`}, goes out {view.summary.next.when}.</> : null}
          </p>
        </div>
      )}
      <small className="ov-source">From your Calendar, Content Plan, comments and posts, in your time zone.</small>
    </section>
  );
}
