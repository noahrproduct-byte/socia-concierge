"use client";

// The scheduling workspace. Scheduled posts are a labeled sample (there is no
// scheduling backend yet), but every intelligence element — best days, best
// window, and the per-day audience activity bars — is computed from the user's
// real posts, in the browser's own time zone. Nothing analytical is invented:
// with too little data the intelligence simply doesn't render.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  Info,
  Camera,
  Music2,
  Star,
} from "lucide-react";

export type CalPost = { t: string; e: number };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86400000;

// Sample schedule (clearly labeled in the toolbar) — anchored to the current week.
const SAMPLE = [
  { d: 0, time: "8:00 AM", title: "Dough-tossing Reel", fmt: "Reel", plat: "Instagram" },
  { d: 1, time: "12:00 PM", title: "Behind the scenes: oven", fmt: "Reel", plat: "TikTok" },
  { d: 1, time: "7:00 PM", title: "“3 mistakes” carousel", fmt: "Carousel", plat: "Instagram" },
  { d: 3, time: "7:00 PM", title: "Weekly special drop", fmt: "Story", plat: "Instagram" },
  { d: 4, time: "6:00 PM", title: "Friday night pies", fmt: "Reel", plat: "Instagram" },
  { d: 6, time: "11:00 AM", title: "Sunday brunch menu", fmt: "Carousel", plat: "Instagram" },
];

const hourLabel = (h: number) =>
  h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

/** Monday 00:00 of the week containing d (local time). */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (m.getDay() + 6) % 7; // Mon=0
  m.setDate(m.getDate() - dow);
  return m;
}

type Audience = {
  enough: boolean;
  // per weekday (Mon-first): 24 smoothed values normalized 0..1
  days: number[][];
  bestDays: number[]; // weekday indexes worth flagging
  bestHour: (day: number) => number;
  peak: { day: number; hour: number } | null;
  postCount: number;
};

/** Bucket real posts into weekday × hour engagement, smoothed across hours.
 *  Runs client-side so hours land in the viewer's time zone. */
function buildAudience(posts: CalPost[]): Audience {
  const raw: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dayPosts = Array(7).fill(0);
  for (const p of posts) {
    const d = new Date(p.t);
    if (isNaN(d.getTime())) continue;
    const day = (d.getDay() + 6) % 7;
    raw[day][d.getHours()] += Math.max(1, p.e);
    dayPosts[day]++;
  }
  const days = raw.map((hs) =>
    hs.map((_, h) => 0.5 * (hs[h - 1] ?? 0) + hs[h] + 0.5 * (hs[h + 1] ?? 0))
  );
  let max = 0;
  let peak: { day: number; hour: number } | null = null;
  days.forEach((hs, day) =>
    hs.forEach((v, hour) => {
      if (v > max) {
        max = v;
        peak = { day, hour };
      }
    })
  );
  if (max > 0) days.forEach((hs) => hs.forEach((v, h) => (hs[h] = v / max)));

  const totals = days.map((hs) => hs.reduce((a, b) => a + b, 0));
  const topTotal = Math.max(...totals);
  const bestDays = totals
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => t > 0 && t >= topTotal * 0.8 && dayPosts[i] >= 2)
    .sort((a, b) => b.t - a.t)
    .slice(0, 2)
    .map(({ i }) => i);

  const enough = posts.length >= 5 && max > 0;
  return {
    enough,
    days,
    bestDays: enough ? bestDays : [],
    bestHour: (day) => days[day].indexOf(Math.max(...days[day])),
    peak: enough ? peak : null,
    postCount: posts.length,
  };
}

const lvl = (v: number) => (v <= 0.02 ? "n" : v < 0.28 ? "l" : v < 0.55 ? "m" : v < 0.8 ? "h" : "p");
const LVL_NAME: Record<string, string> = {
  n: "quiet",
  l: "low",
  m: "medium",
  h: "high",
  p: "peak",
};

function PlatIcon({ plat }: { plat: string }) {
  return plat === "TikTok" ? <Music2 size={11} /> : <Camera size={11} />;
}

export default function CalendarBoard({
  posts,
  igUsername,
  connected,
}: {
  posts: CalPost[];
  igUsername: string | null;
  connected: boolean;
}) {
  // Everything date/timezone-dependent renders after mount so SSR (UTC) and the
  // browser never disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [view, setView] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [account, setAccount] = useState("all");

  const aud = useMemo(() => buildAudience(posts), [posts]);

  const events = SAMPLE.filter(
    (e) => account === "all" || e.plat.toLowerCase() === account
  );

  const openDays =
    7 - new Set(SAMPLE.map((e) => e.d)).size; // days with nothing scheduled this week

  const bestLine =
    aud.peak != null
      ? `${DOW[aud.peak.day]} around ${hourLabel(aud.peak.hour)} gets the most reach with your audience.`
      : null;

  return (
    <div className="cal2">
      {/* header */}
      <div className="cal2-head">
        <div>
          <small className="cal2-eyebrow">Scheduling</small>
          <h1>Calendar</h1>
          <p>Plan your week around when your audience is actually online.</p>
          {aud.enough && aud.peak && now ? (
            <div className="cal2-live">
              <span className="cal2-dot" aria-hidden />
              <b>Audience data</b>
              <span className="cal2-live-sep">·</span>
              <span>from your recent posts</span>
              <em>
                Best window: <b>{DOW[aud.peak.day]} {hourLabel(aud.peak.hour)}</b>
              </em>
            </div>
          ) : connected ? (
            <div className="cal2-live muted">
              Not enough posts yet to map your audience windows.
            </div>
          ) : (
            <div className="cal2-live muted">
              <Link href="/settings">Connect your Instagram</Link>&nbsp;to see your audience
              windows.
            </div>
          )}
        </div>
        <Link href="/tool" className="cal2-new">
          <Plus size={15} /> New post
        </Link>
      </div>

      {/* calendar container */}
      <div className="cal2-card">
        {now && (
          <>
            <Toolbar
              now={now}
              view={view}
              setView={setView}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              monthOffset={monthOffset}
              setMonthOffset={setMonthOffset}
              account={account}
              setAccount={setAccount}
              igUsername={igUsername}
            />
            {view === "week" ? (
              <WeekGrid now={now} weekOffset={weekOffset} aud={aud} events={events} />
            ) : (
              <MonthGrid now={now} monthOffset={monthOffset} aud={aud} events={events} />
            )}
          </>
        )}
      </div>

      {/* intelligence bar */}
      <div className="cal2-insight">
        <span className="cal2-insight-ico">
          <Lightbulb size={15} />
        </span>
        <div className="cal2-insight-body">
          <b>Optimal times — based on your audience.</b>
          <p>
            {bestLine ??
              "Connect your Instagram and SOCIA maps when your audience actually engages."}
            {bestLine && openDays > 0 && (
              <> {openDays} day{openDays === 1 ? " is" : "s are"} still open this week.</>
            )}
          </p>
        </div>
        <Link href="/analytics" className="cal2-insight-link">
          View audience insights <ArrowRight size={13} />
        </Link>
      </div>

      {/* legend */}
      <div className="cal2-legend">
        <span className="cal2-legend-label">
          Audience activity{aud.enough ? " · est. from your Instagram posts" : ""}
        </span>
        <span className="cal2-key"><i className="l" /> Low</span>
        <span className="cal2-key"><i className="m" /> Medium</span>
        <span className="cal2-key"><i className="h" /> High</span>
        <span className="cal2-key"><i className="p" /> Peak</span>
        <span className="cal2-tz">
          <Info size={11} /> Times shown in your device&apos;s time zone
        </span>
      </div>
    </div>
  );
}

function Toolbar({
  now,
  view,
  setView,
  weekOffset,
  setWeekOffset,
  monthOffset,
  setMonthOffset,
  account,
  setAccount,
  igUsername,
}: {
  now: Date;
  view: "week" | "month";
  setView: (v: "week" | "month") => void;
  weekOffset: number;
  setWeekOffset: (fn: (n: number) => number) => void;
  monthOffset: number;
  setMonthOffset: (fn: (n: number) => number) => void;
  account: string;
  setAccount: (a: string) => void;
  igUsername: string | null;
}) {
  let label: string;
  if (view === "week") {
    const start = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    const sameMonth = start.getMonth() === end.getMonth();
    const f = (d: Date, m: boolean) =>
      d.toLocaleDateString("en-US", { month: m ? "short" : undefined, day: "numeric" });
    label = `${f(start, true)} – ${f(end, !sameMonth)}, ${end.getFullYear()}`;
  } else {
    const m = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    label = m.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const nav = (dir: 1 | -1) =>
    view === "week" ? setWeekOffset((n) => n + dir) : setMonthOffset((n) => n + dir);
  const isNow = view === "week" ? weekOffset === 0 : monthOffset === 0;

  return (
    <div className="cal2-toolbar">
      <div className="cal2-tb-left">
        <button className="cal2-nav" onClick={() => nav(-1)} aria-label="Previous" type="button">
          <ChevronLeft size={15} />
        </button>
        <span className="cal2-range">{label}</span>
        <button className="cal2-nav" onClick={() => nav(1)} aria-label="Next" type="button">
          <ChevronRight size={15} />
        </button>
        {!isNow && (
          <button
            className="cal2-today"
            type="button"
            onClick={() => (view === "week" ? setWeekOffset(() => 0) : setMonthOffset(() => 0))}
          >
            Today
          </button>
        )}
      </div>
      <div className="cal2-tb-right">
        <span
          className="cal2-demo"
          title="Example posts — the audience activity below is computed from your real account."
        >
          Sample schedule
        </span>
        <div className="cal2-seg" role="tablist">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
              onClick={() => setView(v)}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <select
          className="cal2-select"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          aria-label="Filter by account"
        >
          <option value="all">All accounts</option>
          <option value="instagram">{igUsername ? `@${igUsername}` : "Instagram"}</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>
    </div>
  );
}

function WeekGrid({
  now,
  weekOffset,
  aud,
  events,
}: {
  now: Date;
  weekOffset: number;
  aud: Audience;
  events: typeof SAMPLE;
}) {
  const monday = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY_MS);
  const todayKey = now.toDateString();

  return (
    <div className="cal2-grid" key={weekOffset /* re-run entrance animation per week */}>
      {DOW.map((dow, i) => {
        const date = new Date(monday.getTime() + i * DAY_MS);
        const isToday = date.toDateString() === todayKey;
        const best = aud.bestDays.includes(i);
        const dayEvents = weekOffset === 0 ? events.filter((e) => e.d === i) : [];
        const bars = aud.days[i];
        const bestHour = aud.bestHour(i);
        const strength = bars[bestHour] ?? 0;

        return (
          <div className={`cal2-col${best ? " best" : ""}`} key={dow}>
            <div className="cal2-dayhead">
              <span className="cal2-dow">{dow}</span>
              <span className={`cal2-num${isToday ? " today" : ""}`}>{date.getDate()}</span>
              {best && (
                <span className="cal2-best">
                  <Star size={9} fill="currentColor" /> BEST
                </span>
              )}
            </div>

            <div className="cal2-slots">
              {best && aud.enough && (
                <div className="cal2-window">
                  <small>Best window</small>
                  <b>{hourLabel(bestHour)}</b>
                  <span className="cal2-meter" aria-hidden>
                    {Array.from({ length: 10 }, (_, s) => (
                      <i key={s} className={s < Math.round(strength * 10) ? "on" : ""} />
                    ))}
                  </span>
                  <em>Peak activity</em>
                </div>
              )}

              {dayEvents.map((e) => (
                <article className="cal2-post" key={e.title}>
                  <span className="cal2-time">{e.time}</span>
                  <span className="cal2-title">{e.title}</span>
                  <span className="cal2-meta">
                    <span className="cal2-plat">
                      <PlatIcon plat={e.plat} /> {e.plat}
                    </span>
                    <span className={`cal2-fmt ${e.fmt.toLowerCase()}`}>{e.fmt}</span>
                  </span>
                </article>
              ))}

              <Link href="/tool" className="cal2-add">
                <Plus size={14} />
                <span>Schedule post</span>
              </Link>
            </div>

            {aud.enough && (
              <div className="cal2-bars">
                <div className="cal2-bars-row">
                  {bars.map((v, h) => (
                    <i
                      key={h}
                      className={`b-${lvl(v)}`}
                      style={{
                        height: `${Math.max(9, Math.round(v * 100))}%`,
                        animationDelay: `${i * 40 + h * 9}ms`,
                      }}
                      title={`${hourLabel(h)} — ${LVL_NAME[lvl(v)]} (est. from your posts)`}
                    />
                  ))}
                </div>
                <div className="cal2-bars-x">
                  <span>12a</span>
                  <span>12p</span>
                  <span>12a</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  now,
  monthOffset,
  aud,
  events,
}: {
  now: Date;
  monthOffset: number;
  aud: Audience;
  events: typeof SAMPLE;
}) {
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const todayKey = now.toDateString();
  const monday = mondayOf(now);

  // Absolute dates of the sample events (anchored to the current week).
  const eventByDate = new Map<string, typeof SAMPLE>();
  for (const e of events) {
    const d = new Date(monday.getTime() + e.d * DAY_MS);
    const k = d.toDateString();
    eventByDate.set(k, [...(eventByDate.get(k) ?? []), e]);
  }

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)
    ),
  ];

  return (
    <div className="cal2-month">
      <div className="cal2-mhead">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal2-mgrid">
        {cells.map((d, i) => {
          if (!d) return <div className="cal2-mcell blank" key={`b${i}`} />;
          const wd = (d.getDay() + 6) % 7;
          const best = aud.bestDays.includes(wd);
          const evs = eventByDate.get(d.toDateString()) ?? [];
          return (
            <div className={`cal2-mcell${best ? " best" : ""}`} key={d.getTime()}>
              <span className={`cal2-mnum${d.toDateString() === todayKey ? " today" : ""}`}>
                {d.getDate()}
              </span>
              {evs.map((e) => (
                <span className="cal2-mevent" key={e.title} title={`${e.time} · ${e.title}`}>
                  {e.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
