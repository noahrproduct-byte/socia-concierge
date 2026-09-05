"use client";

// Performance over time — the analytics centerpiece.
//
// The governing rule: THE CHART FORM MUST MATCH THE DATA SOCIA ACTUALLY HAS.
// Each metric resolves to an explicit visualization mode:
//   followers  -> snapshot_history | gains_history | history_unavailable
//   reach      -> daily_history    | history_unavailable
//   views      -> daily_history    | post_totals
//   engagement -> post_totals      (see below)
//   posts      -> publish_history  (always true time, publish dates are known)
//
// A day only counts as a true time-series point when the value genuinely
// describes that day. Two things qualify: SOCIA's own follower observation (a
// point-in-time total is valid whenever it is read) and Meta's historical
// daily series (source `instagram_api`), which returns finalised days. A
// counter read taken at sync time does not qualify, so it is never plotted —
// otherwise the chart would show sync timing dressed up as a trend. Today is
// excluded from activity series for the same reason: it is still running.
//
// Instagram serves no daily engagement series, so engagement is always
// per-post totals. If that changes, fetchDailySeries starts returning the
// metric and this promotes itself, exactly as views does.
//
// In post_totals mode nothing is plotted against a date axis — Instagram
// reports each post's CURRENT total, not when the activity happened — so we
// render a ranked list of real posts instead.
//
// value vs availability stays separate: 0 is a confirmed zero, "—" means the
// platform didn't provide it.

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Activity,
  Play,
  FileText,
  ExternalLink,
  ArrowRight,
  Info,
  TrendingUp,
  BarChart3,
  Radar,
} from "lucide-react";
import { median, pctChange, fmtMult, isChartableDay, localDayStr } from "@/lib/metrics";

export type PerfPost = {
  t: string;
  likes: number;
  comments: number;
  views: number | null;
  saved: number | null;
  shares: number | null;
  type: string;
  caption: string;
  thumb: string | null;
  permalink: string | null;
};

export type DailyRow = {
  day: string;
  /** SOCIA's own observation of the exact follower total that day. */
  followers: number | null;
  /** Views that day, only when Meta served them as a historical daily series. */
  views: number | null;
  /** Unique accounts reached that day — Meta's real daily series. */
  reach: number | null;
  /** New followers gained that day (Instagram's follower_count metric).
   *  Gains only — unfollows aren't provided, so totals can't be rebuilt. */
  followers_gained: number | null;
  /** Where the row's activity numbers came from. `instagram_api` = Meta's
   *  finalised daily series, the only provenance a daily chart may plot. */
  source: string | null;
};

type Metric = "followers" | "reach" | "views" | "eng" | "posts";
type Mode =
  | "snapshot_history"
  | "gains_history"
  | "history_unavailable"
  | "daily_history"
  | "post_totals"
  | "publish_history";

const DAY_MS = 86400000;
const CHIPS = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
  { id: "180", label: "6M", days: 180 },
  { id: "365", label: "1Y", days: 365 },
  { id: "all", label: "All", days: 0 }, // resolved from the oldest known data
] as const;

type ChartType = "line" | "bar";

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "followers", label: "Followers", color: "blue" },
  { id: "reach", label: "Reach", color: "teal" },
  { id: "views", label: "Views", color: "green" },
  { id: "eng", label: "Engagement", color: "purple" },
  { id: "posts", label: "Posts", color: "amber" },
];

const FMT_LABEL: Record<string, string> = {
  VIDEO: "Reel",
  CAROUSEL_ALBUM: "Carousel",
  IMAGE: "Static",
};

const fmtNum = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const dateTime = (d: Date) =>
  `${shortDate(d)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Period delta with sane zero-handling. */
type DeltaVal = { kind: "pct"; pct: number } | { kind: "new" } | null;
function deltaOf(cur: number, prev: number | null): DeltaVal {
  if (prev == null) return null;
  if (prev === 0) return cur > 0 ? { kind: "new" } : { kind: "pct", pct: 0 };
  return { kind: "pct", pct: pctChange(cur, prev)! };
}

function Delta({ d, note, tip }: { d: DeltaVal; note: string; tip?: string }) {
  const cls = d == null ? "flat" : d.kind === "new" ? "up" : Math.abs(d.pct) < 2 ? "flat" : d.pct > 0 ? "up" : "down";
  return (
    <span className="an3-delta-wrap">
      <em className={`an3-delta ${cls}`} title={d != null ? tip : undefined}>
        {d == null ? "–" : d.kind === "new" ? "up from 0" : `${d.pct > 0 ? "↑" : d.pct < 0 ? "↓" : ""} ${Math.abs(d.pct).toFixed(1)}%`}
      </em>
      <small>{note}</small>
    </span>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 3 || Math.max(...data) === 0) return null;
  const W = 72, H = 22;
  const mx = Math.max(...data), mn = Math.min(...data);
  const span = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - mn) / span) * (H - 5)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an3-spark" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const W = 920, H = 250, padL = 46, padR = 14, padT = 18, padB = 26;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

/** Ranked posts — the honest rendering of current per-post totals.
 *  No date axis: each row is one real post, and the hover card describes that
 *  post rather than a day, because a day is exactly what we don't know. */
function RankedPosts({
  posts,
  value,
  unit,
  cls,
  med,
  viewsMed,
  engMed,
  engOf,
  hover,
  onHover,
}: {
  posts: PerfPost[];
  value: (p: PerfPost) => number;
  unit: string;
  cls: string;
  med: number | null;
  viewsMed: number | null;
  engMed: number | null;
  engOf: (p: PerfPost) => number;
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const ranked = [...posts].sort((a, b) => value(b) - value(a)).slice(0, 8);
  const max = Math.max(...ranked.map(value), 1);
  return (
    <ul className="an3-ranked" onPointerLeave={() => onHover(null)}>
      {ranked.map((p, i) => {
        const v = value(p);
        const mult = med && med > 0 ? v / med : null;
        const d = new Date(p.t);
        const cap = p.caption.split("\n")[0].slice(0, 60) || "(no caption)";
        const row = (
          <>
            {p.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="an3-rank-thumb" src={p.thumb} alt="" width={38} height={38} loading="lazy" />
            ) : (
              <span className="an3-rank-thumb ph" aria-hidden />
            )}
            <span className="an3-rank-meta">
              <b>{cap}</b>
              <small>{shortDate(d)} · {FMT_LABEL[p.type] ?? p.type}</small>
            </span>
            <span className="an3-rank-barwrap">
              <span className={`an3-rank-bar ${cls}`} style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
            </span>
            <span className="an3-rank-val">
              <b>{fmtNum(v)}</b>
              {mult != null && mult >= 1.2 && <em>{fmtMult(mult)}</em>}
            </span>
          </>
        );
        return (
          <li
            className={`an3-rank${hover === i ? " on" : ""}`}
            key={p.t + i}
            style={{ animationDelay: `${i * 45}ms` }}
            onPointerEnter={() => onHover(i)}
          >
            {p.permalink ? (
              <a href={p.permalink} target="_blank" rel="noreferrer" aria-label={`Open post: ${cap}`}>{row}</a>
            ) : (
              <span className="an3-rank-inner">{row}</span>
            )}
            {hover === i && (
              <div className="an3-tip an3-rank-tip">
                <b>{cap}</b>
                <div><span>Published</span><em>{dateTime(d)}</em></div>
                <div><span>Format</span><em>{FMT_LABEL[p.type] ?? p.type}</em></div>
                <div>
                  <span>Current views</span>
                  <em>{p.views != null ? p.views.toLocaleString("en-US") : "—"}</em>
                </div>
                <div><span>Current engagement</span><em>{engOf(p).toLocaleString("en-US")}</em></div>
                <div>
                  <span>Account median</span>
                  <em>
                    {(unit === "views" ? viewsMed : engMed) != null
                      ? `${Math.round((unit === "views" ? viewsMed : engMed)!).toLocaleString("en-US")} ${unit === "views" ? "views" : "eng."}`
                      : "—"}
                  </em>
                </div>
                <div><span>Performance</span><em>{mult != null ? `${fmtMult(mult)} median` : "—"}</em></div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One renderer for every true time series — line or bars, the user's choice.
 *  `zeroBased: false` keeps follower counts readable (no forced 0 baseline). */
function TimeSeries({
  items,
  type,
  cls,
  fill,
  ariaLabel,
  zeroBased = true,
  hover,
  onHover,
}: {
  items: { label: string; v: number; title: string }[];
  type: ChartType;
  cls: string;
  fill: string;
  ariaLabel: string;
  zeroBased?: boolean;
  hover?: number | null;
  onHover?: (i: number | null) => void;
}) {
  const n = items.length;
  const vals = items.map((i) => i.v);
  const rawMax = Math.max(...vals, 1);
  const rawMin = Math.min(...vals, 0);
  const max = zeroBased ? niceCeil(rawMax) : rawMax + Math.max(1, Math.round((rawMax - rawMin) * 0.25));
  const min = zeroBased ? 0 : rawMin - Math.max(1, Math.round((rawMax - rawMin) * 0.25));
  const y = (v: number) => padT + (1 - (v - min) / Math.max(1, max - min)) * plotH;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const step = plotW / Math.max(1, n);
  const bw = Math.min(44, step * 0.62);
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="an3-chart"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={
        onHover
          ? (e) => {
              if (n < 2) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * W;
              const i = type === "bar"
                ? Math.floor((px - padL) / step)
                : Math.round(((px - padL) / plotW) * (n - 1));
              onHover(Math.max(0, Math.min(n - 1, i)));
            }
          : undefined
      }
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
      ))}
      {(zeroBased ? [max, max / 2] : [rawMax, rawMin]).map((v, k) => (
        <text key={k} x={padL - 8} y={y(v) + 3} className="an3-axis" textAnchor="end">{fmtNum(Math.round(v))}</text>
      ))}
      {items.map((it, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text key={`l${i}`} x={type === "bar" ? padL + step * i + step / 2 : x(i)} y={H - 6} className="an3-axis" textAnchor="middle">
            {it.label}
          </text>
        ) : null,
      )}

      {type === "line" ? (
        <>
          <path d={`M${x(0)},${padT + plotH} ${vals.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} Z`} fill={fill} />
          <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} className={`an3-line ${cls} an3-draw`} fill="none" />
          {n <= 60 && vals.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3" className={`an3-dot ${cls}`}>
              <title>{items[i].title}</title>
            </circle>
          ))}
        </>
      ) : (
        items.map((it, i) => {
          const cx = padL + step * i + step / 2;
          return (
            <g key={i} className="an3-barg">
              <rect x={cx - bw / 2} y={y(it.v)} width={bw} height={Math.max(2, padT + plotH - y(it.v))} rx={4} className={`an3-bar ${cls}`}>
                <title>{it.title}</title>
              </rect>
            </g>
          );
        })
      )}
      {hover != null && hover >= 0 && hover < n && (
        <line
          x1={type === "bar" ? padL + step * hover + step / 2 : x(hover)}
          y1={padT}
          x2={type === "bar" ? padL + step * hover + step / 2 : x(hover)}
          y2={padT + plotH}
          className="an3-cross"
        />
      )}
    </svg>
  );
}

export default function PerformanceOverTime({
  posts,
  followers,
  daily,
  insightsOk = null,
}: {
  posts: PerfPost[];
  followers: number | null;
  daily: DailyRow[];
  insightsOk?: boolean | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [rangeId, setRangeId] = useState<string>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Reach is the one metric with a genuine daily series from Meta, so it
  // opens the section when history exists.
  const [metric, setMetric] = useState<Metric>(
    daily.some((r) => r.reach != null) ? "reach" : "eng",
  );
  // Line is the default shape, except for posts: a count per day is a set of
  // discrete events, and bars say that where a line would imply a continuum.
  const [typeBy, setTypeBy] = useState<Partial<Record<Metric, ChartType>>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [rankHover, setRankHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!now) return null;
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let days: number = CHIPS.find((r) => r.id === rangeId)?.days ?? 30;
    if (rangeId === "all") {
      // Everything SOCIA actually knows about: oldest post or snapshot.
      const oldestPost = posts.length ? Math.min(...posts.map((p) => new Date(p.t).getTime())) : null;
      const oldestSnap = daily.length ? new Date(daily[0].day + "T00:00:00").getTime() : null;
      const oldest = Math.min(oldestPost ?? Infinity, oldestSnap ?? Infinity);
      days = Number.isFinite(oldest)
        ? Math.max(7, Math.ceil((end.getTime() - oldest) / DAY_MS))
        : 30;
    }
    if (rangeId === "custom" && customStart && customEnd) {
      const s = new Date(customStart + "T00:00:00");
      const e = new Date(customEnd + "T00:00:00");
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
        end = new Date(e.getTime() + DAY_MS);
        days = Math.min(365, Math.round((end.getTime() - s.getTime()) / DAY_MS));
      }
    }
    const start = new Date(end.getTime() - days * DAY_MS);
    const prevStart = new Date(start.getTime() - days * DAY_MS);

    const within = (t: string, a: Date, b: Date) => {
      const ms = new Date(t).getTime();
      return ms >= a.getTime() && ms < b.getTime();
    };
    const cur = posts.filter((p) => within(p.t, start, end));
    const prev = posts.filter((p) => within(p.t, prevStart, start));
    const oldest = posts.length ? Math.min(...posts.map((p) => new Date(p.t).getTime())) : null;
    // A previous window only counts as comparable when the account's history
    // actually covers it (otherwise "0 posts" is ignorance, not a fact).
    const prevComparable = oldest != null && oldest <= prevStart.getTime();

    const sum = (xs: PerfPost[], f: (p: PerfPost) => number) => xs.reduce((a, p) => a + f(p), 0);
    const engOf = (p: PerfPost) => p.likes + p.comments;
    const engCur = sum(cur, engOf);
    const engPrev = prevComparable || prev.length ? sum(prev, engOf) : null;
    const viewsAvail = cur.some((p) => p.views != null);
    const viewsCur = sum(cur, (p) => p.views ?? 0);
    // A previous-period total is only real when the window is comparable.
    // No posts in a covered window is a true 0; an uncovered window, or posts
    // Instagram gave no views for, is ignorance and must stay null.
    const viewsPrev =
      !viewsAvail ? null
      : prev.length ? (prev.some((p) => p.views != null) ? sum(prev, (p) => p.views ?? 0) : null)
      : prevComparable ? 0
      : null;
    const savesAvail = cur.some((p) => p.saved != null);
    const sharesAvail = cur.some((p) => p.shares != null);

    // Real recorded daily series.
    const startStr = localDayStr(start);
    const endStr = localDayStr(end);
    const prevStr = localDayStr(prevStart);
    const todayStr = localDayStr(now);
    const inRows = daily.filter((r) => r.day >= startStr && r.day < endStr);
    // Follower totals are point-in-time observations: today's is as valid as
    // any other, so snapshots keep the current day.
    const folRows = inRows.filter((r) => r.followers != null);
    // Activity series: Meta's finalised daily numbers only, and never the
    // current day — it is still accumulating, and plotting a part-day next to
    // whole ones reads as a drop that did not happen.
    const finalised = (r: DailyRow) => isChartableDay(r, todayStr);
    const activityRows = inRows.filter(finalised);
    const viewsRows = activityRows.filter((r) => r.views != null);
    // Reach is the one activity metric Meta serves as a genuine daily series.
    const reachRows = activityRows.filter((r) => r.reach != null);
    const gainRows = activityRows.filter((r) => r.followers_gained != null);
    const gainsCur = gainRows.reduce((a, r) => a + (r.followers_gained ?? 0), 0);
    const prevActivity = daily.filter((r) => r.day >= prevStr && r.day < startStr && finalised(r));
    const gainPrevRows = prevActivity.filter((r) => r.followers_gained != null);
    const gainsPrev = gainPrevRows.length
      ? gainPrevRows.reduce((a, r) => a + (r.followers_gained ?? 0), 0)
      : null;
    const reachCur = reachRows.reduce((a, r) => a + (r.reach ?? 0), 0);
    const prevRows = prevActivity.filter((r) => r.reach != null);
    const reachPrev = prevRows.length ? prevRows.reduce((a, r) => a + (r.reach ?? 0), 0) : null;
    // How much of the chosen window the daily record actually covers — stated
    // outright rather than left for the reader to infer from the axis.
    const coverage = (n: number) => `${n} of ${days} day${days === 1 ? "" : "s"} recorded`;

    const before = daily.filter((r) => r.day <= startStr && r.followers != null);
    const folBaseline = before.length ? before[before.length - 1].followers : null;
    const folNet = folRows.length >= 2 ? folRows[folRows.length - 1].followers! - folRows[0].followers! : null;
    const folDelta: DeltaVal =
      followers != null && folBaseline != null && folBaseline > 0
        ? { kind: "pct", pct: pctChange(followers, folBaseline)! }
        : null;
    const firstSnapDay = daily.find((r) => r.followers != null)?.day ?? null;

    // Modes — the whole point.
    const modes: Record<Metric, Mode> = {
      // Exact totals beat gains-only activity, which beats nothing.
      followers:
        folRows.length >= 2 ? "snapshot_history"
        : gainRows.length >= 3 ? "gains_history"
        : "history_unavailable",
      reach: reachRows.length >= 3 ? "daily_history" : "history_unavailable",
      views: viewsRows.length >= 3 ? "daily_history" : "post_totals",
      // Instagram publishes no daily engagement series, so there is nothing
      // truthful to plot against dates. Per-post totals it is.
      eng: "post_totals",
      posts: "publish_history",
    };

    // Posts buckets (always real time); weekly past a month, monthly past a year.
    const weekly = days > 31;
    const bucketCount = weekly ? Math.ceil(days / 7) : days;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      date: new Date(start.getTime() + i * (weekly ? 7 : 1) * DAY_MS),
      posts: [] as PerfPost[],
    }));
    for (const p of cur) {
      const i = Math.min(bucketCount - 1, Math.floor((new Date(p.t).getTime() - start.getTime()) / ((weekly ? 7 : 1) * DAY_MS)));
      if (i >= 0) buckets[i].posts.push(p);
    }
    const freq = (cur.length / days) * 7;
    const fmtCounts = new Map<string, number>();
    for (const p of cur) fmtCounts.set(p.type, (fmtCounts.get(p.type) ?? 0) + 1);
    const topFmt = [...fmtCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Account-wide medians (all synced posts) — the honest baseline.
    const engMedAll = median(posts.map(engOf));
    const viewsMedAll = median(posts.filter((p) => p.views != null).map((p) => p.views!));

    const topEng = cur.length ? [...cur].sort((a, b) => engOf(b) - engOf(a))[0] : null;
    const topViews = viewsAvail && cur.length ? [...cur].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] : null;

    return {
      days, start, cur, prev, prevComparable, modes,
      engCur, likesCur: sum(cur, (p) => p.likes), comCur: sum(cur, (p) => p.comments),
      engDelta: deltaOf(engCur, engPrev),
      viewsAvail, viewsCur, viewsDelta: viewsAvail ? deltaOf(viewsCur, viewsPrev) : null,
      savesAvail, savesCur: savesAvail ? sum(cur, (p) => p.saved ?? 0) : null,
      sharesAvail, sharesCur: sharesAvail ? sum(cur, (p) => p.shares ?? 0) : null,
      folRows, folNet, folDelta, firstSnapDay,
      reachRows, reachCur, reachDelta: deltaOf(reachCur, reachPrev),
      gainRows, gainsCur, gainsDelta: deltaOf(gainsCur, gainsPrev),
      viewsRows, engOf, coverage,
      buckets, weekly, freq, topFmt,
      engMedAll, viewsMedAll, topEng, topViews,
      postsDeltaAbs: prevComparable || prev.length ? cur.length - prev.length : null,
    };
  }, [now, rangeId, customStart, customEnd, posts, daily, followers]);

  if (!model) {
    return (
      <section className="an3">
        <div className="an3-head"><div><h3>Performance over time</h3></div></div>
        <div className="an3-loading"><span className="an3-skelbar" /><span className="an3-skelbar tall" /></div>
      </section>
    );
  }

  const m = model;
  const mode = m.modes[metric];
  const chartType: ChartType = typeBy[metric] ?? (metric === "posts" ? "bar" : "line");
  const setChartType = (t: ChartType) => setTypeBy((prev) => ({ ...prev, [metric]: t }));
  const postsNote = `on posts from the last ${m.days} days`;
  const prevNote = `vs posts published previous ${m.days} days`;
  const vsPrev = `vs previous ${m.days} days`;
  const pick = (id: Metric) => { setMetric(id); setHover(null); setRankHover(null); };
  const empty = m.cur.length === 0;
  // The line/bar toggle only appears where a real time series is drawn.
  const isTimeSeries =
    mode === "snapshot_history" || mode === "daily_history" || mode === "publish_history";

  // Series the charts read from (geometry lives in TimeSeries).
  const fol = m.folRows;
  const folVals = fol.map((f) => f.followers!);
  const lineRows =
    metric === "views" ? m.viewsRows
    : metric === "reach" ? m.reachRows
    : [];
  const lineVal = (r: DailyRow) => (metric === "views" ? r.views! : r.reach!);

  // Whichever series the active chart is actually drawing — the tooltip must
  // index into the same array the points came from.
  const activeRows: DailyRow[] =
    metric === "followers"
      ? mode === "snapshot_history" ? fol : mode === "gains_history" ? m.gainRows : []
      : mode === "daily_history" ? lineRows
      : [];
  const hoverRow = hover == null ? null : activeRows[hover] ?? null;

  // Estimated follower total per day, walked backwards from today's exact
  // count through Instagram's daily gains. Unfollows aren't published, so
  // this is an approximation (a lower bound on past counts) — computed on the
  // fly and labeled as an estimate, never stored as if it were a snapshot.
  const estTotals: (number | null)[] = (() => {
    if (metric !== "followers" || mode !== "gains_history" || followers == null) return [];
    const out: (number | null)[] = new Array(m.gainRows.length).fill(null);
    if (!m.gainRows.length) return out;
    out[m.gainRows.length - 1] = followers;
    for (let i = m.gainRows.length - 2; i >= 0; i--) {
      const next = out[i + 1];
      const gainNext = m.gainRows[i + 1].followers_gained ?? 0;
      out[i] = next == null ? null : next - gainNext;
    }
    return out;
  })();
  const tipLeft = `${Math.min(84, Math.max(6, ((hover ?? 0) + 0.5) / Math.max(1, activeRows.length) * 100))}%`;
  const isReach = metric === "reach";

  const kpis: {
    id: Metric; label: string; color: string; Ico: typeof Users;
    value: string | null; naText?: string; d: DeltaVal; note: string; tip?: string;
    /** Absolute change, shown when a percentage isn't the right shape. */
    gain?: number | null;
    gainTip?: string;
    spark?: { data: number[]; color: string };
  }[] = [
    {
      id: "followers", label: "Followers", color: "blue", Ico: Users,
      value: followers != null ? followers.toLocaleString("en-US") : null,
      naText: "not synced yet",
      // With two exact snapshots the change is measured. Before that,
      // Instagram's own gains are the real number to show — a bare "–" would
      // hide data SOCIA actually has.
      d: m.folDelta,
      gain: m.folDelta == null && m.gainRows.length ? m.gainsCur : null,
      tip: vsPrev,
      note: m.folDelta
        ? `total followers today`
        : m.gainRows.length
          ? `new followers · last ${m.days} days`
          : m.firstSnapDay
            ? `history started ${shortDate(new Date(m.firstSnapDay + "T00:00:00"))}`
            : "history starts today",
      spark: { data: folVals, color: "var(--primary)" },
    },
    {
      id: "reach", label: "Reach", color: "teal", Ico: Radar,
      value: m.reachRows.length ? fmtNum(m.reachCur) : null,
      naText: "daily reach history is building",
      d: m.reachDelta,
      tip: vsPrev,
      note: m.reachDelta
        ? `accounts reached · last ${m.days} days`
        : `accounts reached · ${m.coverage(m.reachRows.length)}`,
      spark: { data: m.reachRows.map((r) => r.reach!), color: "#0d9488" },
    },
    {
      id: "views", label: "Views", color: "green", Ico: Play,
      value: m.viewsAvail ? fmtNum(m.viewsCur) : null,
      naText: "Not provided by the connected account",
      d: m.viewsDelta, note: postsNote, tip: prevNote,
      // No sparkline: a spark is a time-series affordance, and per-post totals
      // are exactly what SOCIA refuses to plot against time.
      spark: m.viewsRows.length ? { data: m.viewsRows.map((r) => r.views!), color: "var(--success)" } : undefined,
    },
    {
      id: "eng", label: "Engagement", color: "purple", Ico: Activity,
      value: fmtNum(m.engCur),
      d: m.engDelta, note: postsNote, tip: prevNote,
    },
    {
      id: "posts", label: "Posts", color: "amber", Ico: FileText,
      value: String(m.cur.length), d: null,
      // Publish dates are exact, so a change in cadence is measurable whenever
      // the account's history covers the previous window.
      gain: m.postsDeltaAbs,
      gainTip: vsPrev,
      note: `published in the last ${m.days} days`,
      spark: { data: m.buckets.map((b) => b.posts.length), color: "var(--warning-text)" },
    },
  ];

  const qualityChip = (text: string, tip: string) => (
    <span className="an3-quality" title={tip}>
      <Info size={10} /> {text}
    </span>
  );
  const totalsChip = qualityChip(
    "Current totals by post",
    "Instagram provides the current total for each post, not the exact day each view or interaction happened — so SOCIA ranks real posts instead of drawing a daily line.",
  );

  return (
    <section className="an3 db2-rise" style={{ animationDelay: "360ms" }}>
      <div className="an3-head">
        <div>
          <h3>Performance over time</h3>
          <p>Track how your audience and content are growing.</p>
        </div>
        <div className="an3-controls">
          <select
            className="an3-select"
            value={CHIPS.some((c) => c.id === rangeId) ? rangeId : "custom"}
            onChange={(e) => setRangeId(e.target.value)}
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
          {rangeId === "custom" && (
            <span className="an3-custom">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="Start date" />
              <span>–</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="End date" />
            </span>
          )}
        </div>
      </div>

      <div className="an3-kpis">
        {kpis.map(({ id, label, color, Ico, value, naText, d, note, tip, gain, gainTip, spark }) => (
          <button
            key={id}
            type="button"
            className={`an3-kpi${metric === id ? ` on ${color}` : ""}${value == null ? " na" : ""}`}
            onClick={() => pick(id)}
            aria-pressed={metric === id}
          >
            <span className={`an3-kpi-ico ${color}`}><Ico size={15} /></span>
            <span className="an3-kpi-label">{label}</span>
            {value != null ? (
              <>
                <b>{value}</b>
                {gain != null ? (
                  <span className="an3-delta-wrap">
                    <em className={`an3-delta ${gain > 0 ? "up" : gain < 0 ? "down" : "flat"}`} title={gainTip}>
                      {gain >= 0 ? "+" : ""}{gain.toLocaleString("en-US")}
                    </em>
                    <small>{note}</small>
                  </span>
                ) : (
                  <Delta d={d} note={note} tip={tip} />
                )}
                {spark && <Spark data={spark.data} color={spark.color} />}
              </>
            ) : (
              <>
                <b className="na">—</b>
                <span className="an3-kpi-na">{naText}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="an3-tabs" role="tablist">
        {METRICS.map(({ id, label, color }) => (
          <button key={id} type="button" role="tab" aria-selected={metric === id} className={metric === id ? `on ${color}` : ""} onClick={() => pick(id)}>
            {label}
          </button>
        ))}
        <span className="an3-chips">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className={rangeId === c.id ? "on" : ""} onClick={() => setRangeId(c.id)}>{c.label}</button>
          ))}
        </span>
        {isTimeSeries && (
          <span className="an3-chips an3-typetoggle" role="group" aria-label="Chart type">
            <button type="button" className={chartType === "line" ? "on" : ""} onClick={() => setChartType("line")} aria-label="Line chart" title="Line chart">
              <TrendingUp size={13} />
            </button>
            <button type="button" className={chartType === "bar" ? "on" : ""} onClick={() => setChartType("bar")} aria-label="Bar chart" title="Bar chart">
              <BarChart3 size={13} />
            </button>
          </span>
        )}
      </div>

      <div className="an3-chartwrap">
        {/* ---------- FOLLOWERS ---------- */}
        {metric === "followers" ? (
          mode === "snapshot_history" ? (
            <>
              <div className="an3-hero">
                <div><b>{followers != null ? followers.toLocaleString("en-US") : "–"}</b><small>Total followers</small></div>
                {m.folNet != null && (
                  <div>
                    <b>{m.folNet >= 0 ? "+" : ""}{m.folNet.toLocaleString("en-US")}</b>
                    {/* Net change spans the snapshots SOCIA holds, which is
                        usually less than the window. Saying so stops it
                        reading as a contradiction of Instagram's 30-day
                        gains figure in the KPI above. */}
                    <small>Net change · {m.coverage(fol.length)}</small>
                  </div>
                )}
                {m.folDelta?.kind === "pct" && (
                  <div><b className={m.folDelta.pct >= 0 ? "up" : "down"}>{m.folDelta.pct >= 0 ? "↑" : "↓"} {Math.abs(m.folDelta.pct).toFixed(1)}%</b><small>vs previous {m.days} days</small></div>
                )}
                {qualityChip("Daily snapshots", "Real daily follower counts recorded by SOCIA — never reconstructed.")}
              </div>
              <TimeSeries
                type={chartType}
                cls="blue"
                fill="rgba(var(--primary-rgb),0.08)"
                zeroBased={false}
                ariaLabel="Total followers over time"
                hover={hover}
                onHover={setHover}
                items={fol.map((f) => ({
                  label: shortDate(new Date(f.day + "T00:00:00")),
                  v: f.followers!,
                  title: `${shortDate(new Date(f.day + "T00:00:00"))} — ${f.followers!.toLocaleString("en-US")} followers`,
                }))}
              />
              {hoverRow && (
                <div className="an3-tip" style={{ left: tipLeft }}>
                  <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                  <div><span>Followers</span><em>{hoverRow.followers!.toLocaleString("en-US")}</em></div>
                  {hover! > 0 && fol[hover! - 1].followers != null && (
                    <div><span>Net change</span><em>{(hoverRow.followers! - fol[hover! - 1].followers! >= 0 ? "+" : "") + (hoverRow.followers! - fol[hover! - 1].followers!).toLocaleString("en-US")}</em></div>
                  )}
                </div>
              )}
            </>
          ) : mode === "gains_history" ? (
            <>
              <div className="an3-hero">
                <div><b>{followers != null ? followers.toLocaleString("en-US") : "–"}</b><small>Followers today</small></div>
                <div><b>+{m.gainsCur.toLocaleString("en-US")}</b><small>New followers · {m.coverage(m.gainRows.length)}</small></div>
                {m.gainsDelta?.kind === "pct" && (
                  <div><b className={m.gainsDelta.pct >= 0 ? "up" : "down"}>{m.gainsDelta.pct >= 0 ? "↑" : "↓"} {Math.abs(m.gainsDelta.pct).toFixed(1)}%</b><small>vs previous {m.days} days</small></div>
                )}
                {qualityChip("Instagram historical insights", "New followers per day, straight from Instagram's insights (up to 90 days). Instagram doesn't report unfollows for this account, so exact past totals can't be reconstructed — SOCIA records the exact count daily from now on.")}
              </div>
              <TimeSeries
                type={chartType}
                cls="blue"
                fill="rgba(var(--primary-rgb),0.08)"
                ariaLabel="New followers per day"
                hover={hover}
                onHover={setHover}
                items={m.gainRows.map((r) => ({
                  label: shortDate(new Date(r.day + "T00:00:00")),
                  v: r.followers_gained!,
                  title: `${shortDate(new Date(r.day + "T00:00:00"))} — +${r.followers_gained!.toLocaleString("en-US")} new followers`,
                }))}
              />
              {hoverRow && (
                <div className="an3-tip" style={{ left: tipLeft }}>
                  <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                  {estTotals[hover!] != null && (
                    <div title="Estimated by subtracting Instagram's daily new-follower counts back from today's exact total. Instagram doesn't publish unfollows, so treat this as an approximation.">
                      <span>Est. total</span>
                      <em>≈ {estTotals[hover!]!.toLocaleString("en-US")}</em>
                    </div>
                  )}
                  <div><span>New followers</span><em>+{hoverRow.followers_gained!.toLocaleString("en-US")}</em></div>
                  {hover! > 0 && activeRows[hover! - 1]?.followers_gained != null && (
                    <div>
                      <span>Previous day</span>
                      <em>+{activeRows[hover! - 1].followers_gained!.toLocaleString("en-US")}</em>
                    </div>
                  )}
                  {m.gainRows.length > 0 && (
                    <div>
                      <span>Period average</span>
                      <em>+{(m.gainsCur / m.gainRows.length).toFixed(1)}</em>
                    </div>
                  )}
                </div>
              )}
              <p className="an3-chart-note">
                Instagram provides new followers per day for this period, but not unfollows — so this
                is follower <em>activity</em>, not an exact follower-count line. SOCIA is recording exact
                daily counts going forward and will switch to the true growth curve automatically.
              </p>
            </>
          ) : (
            <div className="an3-unavailable">
              <b>
                {followers != null ? `${followers.toLocaleString("en-US")} followers · ` : ""}
                history started {m.firstSnapDay ? shortDate(new Date(m.firstSnapDay + "T00:00:00")) : "today"}
              </b>
              <p>Follower history will build as SOCIA collects daily snapshots. Nothing is drawn until the data is real.</p>
            </div>
          )
        ) : metric === "posts" ? (
          /* ---------- POSTS (always true time) ---------- */
          empty ? (
            <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>
          ) : (
            <>
              <div className="an3-hero">
                <div><b>{m.cur.length}</b><small>Posts published</small></div>
                <div><b>{m.freq.toFixed(1)}</b><small>Posts / week</small></div>
                {m.topFmt && <div><b>{FMT_LABEL[m.topFmt] ?? m.topFmt}</b><small>Most-used format</small></div>}
                {qualityChip("Real publish dates", "Publish timestamps are exact, so this is a true time series. Counted from Instagram's own media list, which leaves out stories and collab posts published by a partner account.")}
              </div>
              <TimeSeries
                type={chartType}
                cls="amber"
                fill="rgba(var(--warning-rgb),0.10)"
                ariaLabel={`Posts published per ${m.weekly ? "week" : "day"}`}
                items={m.buckets.map((b) => {
                  const fmts = [...b.posts.reduce((acc, p) => acc.set(p.type, (acc.get(p.type) ?? 0) + 1), new Map<string, number>())]
                    .map(([t, c]) => `${c} ${FMT_LABEL[t] ?? t}${c > 1 ? "s" : ""}`).join(", ");
                  return {
                    label: shortDate(b.date),
                    v: b.posts.length,
                    title: `${m.weekly ? "Week of " : ""}${shortDate(b.date)} — ${b.posts.length} post${b.posts.length === 1 ? "" : "s"}${fmts ? ` (${fmts})` : ""}`,
                  };
                })}
              />
            </>
          )
        ) : isReach ? (
          /* ---------- REACH: Meta's real daily series ---------- */
          mode === "daily_history" ? (
            <>
              <div className="an3-hero">
                <div><b>{fmtNum(m.reachCur)}</b><small>Accounts reached · {m.coverage(m.reachRows.length)}</small></div>
                <div><b>{fmtNum(Math.round(m.reachCur / Math.max(1, m.reachRows.length)))}</b><small>Average per day</small></div>
                {m.reachDelta && (
                  <div>
                    <b className={m.reachDelta.kind === "new" || m.reachDelta.pct >= 0 ? "up" : "down"}>
                      {m.reachDelta.kind === "new" ? "up from 0" : `${m.reachDelta.pct >= 0 ? "↑" : "↓"} ${Math.abs(m.reachDelta.pct).toFixed(1)}%`}
                    </b>
                    <small>vs previous {m.days} days</small>
                  </div>
                )}
                {qualityChip("Real daily data", "Instagram reports reach as a genuine per-day series — this chart is actual daily activity, not post totals. Today is left out until the day finishes.")}
              </div>
              <TimeSeries
                type={chartType}
                cls="teal"
                fill="rgba(13,148,136,0.08)"
                ariaLabel="Accounts reached per day"
                hover={hover}
                onHover={setHover}
                items={m.reachRows.map((r) => ({
                  label: shortDate(new Date(r.day + "T00:00:00")),
                  v: r.reach!,
                  title: `${shortDate(new Date(r.day + "T00:00:00"))} — ${r.reach!.toLocaleString("en-US")} accounts reached`,
                }))}
              />
              {hoverRow && (
                <div className="an3-tip" style={{ left: tipLeft }}>
                  <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                  <div><span>Accounts reached</span><em>{hoverRow.reach!.toLocaleString("en-US")}</em></div>
                  {hover! > 0 && lineRows[hover! - 1]?.reach != null && (
                    <div>
                      <span>vs previous day</span>
                      <em>{(((hoverRow.reach! - lineRows[hover! - 1].reach!) / Math.max(1, lineRows[hover! - 1].reach!)) * 100).toFixed(1)}%</em>
                    </div>
                  )}
                </div>
              )}
              <p className="an3-chart-note">
                Reach is the number of unique accounts that saw your content each day, straight from
                Instagram&apos;s daily insights. Today is excluded until it finishes, so a part-day
                never reads as a drop.
              </p>
            </>
          ) : (
            <div className="an3-unavailable">
              <b>Daily reach history is building.</b>
              <p>
                SOCIA pulls Instagram&apos;s daily reach series on every sync. Hit Sync now in
                Settings, or check back after the next automatic refresh.
              </p>
            </div>
          )
        ) : (
          /* ---------- VIEWS / ENGAGEMENT ---------- */
          (() => {
            const isViews = metric === "views";
            const isDaily = mode === "daily_history";
            if (isViews && !isDaily && !m.viewsAvail) {
              return (
                <div className="an3-unavailable">
                  {insightsOk === false ? (
                    <>
                      <b>Reconnect Instagram to enable views.</b>
                      <p>Your stored connection predates full analytics permissions. <a href="/settings#accounts">Reconnect in Settings</a> and this lights up on the next sync.</p>
                    </>
                  ) : (
                    <>
                      <b>Instagram didn&apos;t provide views for these posts.</b>
                      <p>SOCIA shows only verified numbers — try Sync now in Settings.</p>
                    </>
                  )}
                </div>
              );
            }
            if (!isDaily && empty) {
              return <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>;
            }

            const cls = isViews ? "green" : "purple";
            const med = isViews ? m.viewsMedAll : m.engMedAll;
            // In daily mode the headline has to describe the chart underneath
            // it — the daily series — not the per-post totals, or the panel
            // states two different numbers under one word.
            const dailyTotal = m.viewsRows.reduce((a, r) => a + (r.views ?? 0), 0);
            const total = isDaily ? dailyTotal : isViews ? m.viewsCur : m.engCur;
            const delta = isDaily ? null : isViews ? m.viewsDelta : m.engDelta;

            return (
              <>
                <div className="an3-hero">
                  {isDaily ? (
                    <>
                      <div><b>{fmtNum(total)}</b><small>Views · {m.coverage(m.viewsRows.length)}</small></div>
                      <div>
                        <b>{fmtNum(Math.round(total / Math.max(1, m.viewsRows.length)))}</b>
                        <small>Average per day</small>
                      </div>
                    </>
                  ) : (
                    <>
                      <div><b>{fmtNum(total)}</b><small>Current {isViews ? "views" : "engagement"} · {postsNote}</small></div>
                      <div><b>{m.cur.length}</b><small>Posts published</small></div>
                    </>
                  )}
                  {delta && (
                    <div>
                      <b className={delta.kind === "new" || delta.pct >= 0 ? "up" : "down"}>
                        {delta.kind === "new" ? "up from 0" : `${delta.pct >= 0 ? "↑" : "↓"} ${Math.abs(delta.pct).toFixed(1)}%`}
                      </b>
                      <small>{prevNote}</small>
                    </div>
                  )}
                  {isDaily
                    ? qualityChip("Real daily data", "Finished days from Instagram's historical daily series. Today is left out until it completes.")
                    : totalsChip}
                </div>

                {!isViews && (
                  <div className="an3-breakdown">
                    <span><small>Likes</small><b>{fmtNum(m.likesCur)}</b></span>
                    <span><small>Comments</small><b>{fmtNum(m.comCur)}</b></span>
                    <span><small>Shares</small><b>{m.sharesAvail ? fmtNum(m.sharesCur!) : <i title="Not provided by the connected account">—</i>}</b></span>
                    <span><small>Saves</small><b>{m.savesAvail ? fmtNum(m.savesCur!) : <i title="Not provided by the connected account">—</i>}</b></span>
                  </div>
                )}

                {isDaily ? (
                  <>
                    <TimeSeries
                      type={chartType}
                      cls={cls}
                      fill="rgba(var(--success-rgb),0.07)"
                      ariaLabel="Views per day"
                      hover={hover}
                      onHover={setHover}
                      items={lineRows.map((r) => ({
                        label: shortDate(new Date(r.day + "T00:00:00")),
                        v: lineVal(r),
                        title: `${shortDate(new Date(r.day + "T00:00:00"))} — ${lineVal(r).toLocaleString("en-US")} views`,
                      }))}
                    />
                    {hoverRow && (
                      <div className="an3-tip" style={{ left: tipLeft }}>
                        <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                        <div><span>Views</span><em>{hoverRow.views!.toLocaleString("en-US")}</em></div>
                      </div>
                    )}
                    <p className="an3-chart-note">
                      Instagram now serves views as a real per-day series, so this is daily activity.
                      Today is excluded until the day finishes.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="an3-ranked-head">
                      <b>{isViews ? "Views" : "Engagement"} by post</b>
                      <small>Ranked by current total · hover a row for detail</small>
                    </div>
                    <RankedPosts
                      posts={m.cur}
                      value={isViews ? (p) => p.views ?? 0 : m.engOf}
                      unit={isViews ? "views" : "engagement"}
                      cls={cls}
                      med={med}
                      viewsMed={m.viewsMedAll}
                      engMed={m.engMedAll}
                      engOf={m.engOf}
                      hover={rankHover}
                      onHover={setRankHover}
                    />
                    <p className="an3-chart-note">
                      Instagram reports each post&apos;s current total, not the day each {isViews ? "view" : "interaction"} happened —
                      so SOCIA ranks real posts here. A true daily line appears automatically if Instagram starts serving one.
                    </p>
                  </>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* ---------- bottom cards, adapted to the active metric ---------- */}
      <div className="an3-insights">
        <div className="an3-card">
          <small className="an3-card-label">
            {metric === "views" ? "Top viewed post" : metric === "posts" ? "Most recent post" : metric === "reach" ? "Recent top post" : "Top performing content"}
          </small>
          {(() => {
            const p =
              metric === "views" ? m.topViews
              : metric === "posts" ? [...m.cur].sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())[0]
              : m.topEng;
            if (!p) return <p className="an3-card-empty">No posts in this period.</p>;
            const v = metric === "views" ? p.views ?? 0 : m.engOf(p);
            const med = metric === "views" ? m.viewsMedAll : m.engMedAll;
            const mult = med && med > 0 ? v / med : null;
            return (
              <>
                <div className="an3-top">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" width={52} height={52} />
                  ) : (
                    <span className="an3-top-ph" aria-hidden />
                  )}
                  <span className="an3-top-meta">
                    <b>{p.caption.split("\n")[0].slice(0, 48) || "(no caption)"}</b>
                    <small>{dateTime(new Date(p.t))}</small>
                    <small>
                      {p.views != null && <>{fmtNum(p.views)} views · </>}
                      {fmtNum(p.likes)} likes · {fmtNum(p.comments)} comments
                      {p.saved != null && <> · {fmtNum(p.saved)} saves</>}
                      {mult != null && mult >= 1.2 && (
                        <em title={`vs your account median across all synced posts`}> · {fmtMult(mult)} median</em>
                      )}
                    </small>
                  </span>
                </div>
                {p.permalink && (
                  <a className="an3-card-cta" href={p.permalink} target="_blank" rel="noreferrer">View post <ExternalLink size={12} /></a>
                )}
              </>
            );
          })()}
        </div>

        <div className="an3-card">
          <small className="an3-card-label">
            {metric === "followers" ? "Follower insights" : metric === "reach" ? "Reach insights" : metric === "views" ? "View insights" : metric === "posts" ? "Publishing insights" : "Engagement breakdown"}
          </small>
          <ul className="an3-rows">
            {metric === "followers" && (
              <>
                <li><span>Net growth (exact)</span><em className="flat">{m.folNet != null ? `${m.folNet >= 0 ? "+" : ""}${m.folNet.toLocaleString("en-US")}` : "recording daily"}</em></li>
                <li><span>New followers ({m.gainRows.length} of {m.days}d)</span><em className="flat">{m.gainRows.length ? `+${m.gainsCur.toLocaleString("en-US")}` : "—"}</em></li>
                <li><span>Best day</span><em className="flat">{m.gainRows.length ? `+${Math.max(...m.gainRows.map((r) => r.followers_gained!))}` : "—"}</em></li>
                <li><span>Exact snapshot days</span><em className="flat">{fol.length}</em></li>
                <li><span>Current followers</span><em className="flat">{followers != null ? followers.toLocaleString("en-US") : "—"}</em></li>
              </>
            )}
            {metric === "reach" && (
              <>
                <li><span>Accounts reached</span><em className="flat">{m.reachRows.length ? fmtNum(m.reachCur) : "—"}</em></li>
                <li><span>Average per day</span><em className="flat">{m.reachRows.length ? fmtNum(Math.round(m.reachCur / m.reachRows.length)) : "—"}</em></li>
                <li><span>Best day</span><em className="flat">{m.reachRows.length ? fmtNum(Math.max(...m.reachRows.map((r) => r.reach!))) : "—"}</em></li>
                <li><span>Days recorded</span><em className="flat">{m.reachRows.length} of {m.days}</em></li>
              </>
            )}
            {metric === "views" && (
              <>
                <li><span>Total views {postsNote}</span><em className="flat">{m.viewsAvail ? fmtNum(m.viewsCur) : "—"}</em></li>
                <li><span>Posts published</span><em className="flat">{m.cur.length}</em></li>
                <li><span>Average views / post</span><em className="flat">{m.viewsAvail && m.cur.length ? fmtNum(Math.round(m.viewsCur / m.cur.length)) : "—"}</em></li>
                <li><span>Account median / post</span><em className="flat">{m.viewsMedAll != null ? fmtNum(Math.round(m.viewsMedAll)) : "—"}</em></li>
              </>
            )}
            {metric === "eng" && (
              <>
                <li><span>Likes</span><em className="flat">{fmtNum(m.likesCur)}</em></li>
                <li><span>Comments</span><em className="flat">{fmtNum(m.comCur)}</em></li>
                <li><span>Shares</span><em className="flat">{m.sharesAvail ? fmtNum(m.sharesCur!) : "—"}</em></li>
                <li><span>Saves</span><em className="flat">{m.savesAvail ? fmtNum(m.savesCur!) : "—"}</em></li>
                <li><span>Per post</span><em className="flat">{m.cur.length ? fmtNum(Math.round(m.engCur / m.cur.length)) : "—"}</em></li>
              </>
            )}
            {metric === "posts" && (
              <>
                <li><span>Posts published</span><em className="flat">{m.cur.length}{m.postsDeltaAbs != null ? ` (${m.postsDeltaAbs >= 0 ? "+" : ""}${m.postsDeltaAbs})` : ""}</em></li>
                <li><span>Average / week</span><em className="flat">{m.freq.toFixed(1)}</em></li>
                <li><span>Most-used format</span><em className="flat">{m.topFmt ? FMT_LABEL[m.topFmt] ?? m.topFmt : "—"}</em></li>
              </>
            )}
          </ul>
        </div>

        <div className="an3-card">
          <small className="an3-card-label">Performance summary</small>
          <Summary m={m} metric={metric} />
          <a className="an3-card-cta" href="/tool">See content ideas <ArrowRight size={12} /></a>
        </div>
      </div>

      <p className="an3-foot">
        <Info size={11} /> Views and engagement are each post&apos;s current total — SOCIA never guesses which day the
        activity happened, so they are ranked by post rather than drawn on a date axis. Daily lines are only
        drawn from finished days Instagram reports as a real per-day series. Instagram&apos;s data leaves out
        stories and collab posts published by a partner account, so post counts can differ from your profile
        grid. Times shown in your device&apos;s time zone.
      </p>
    </section>
  );
}

type SummaryModel = {
  cur: PerfPost[]; days: number; engCur: number; likesCur: number; comCur: number;
  viewsCur: number; viewsAvail: boolean; engDelta: DeltaVal; freq: number;
  topEng: PerfPost | null; topViews: PerfPost | null;
  engMedAll: number | null; viewsMedAll: number | null; folNet: number | null;
  engOf: (p: PerfPost) => number;
};

// Templated strictly from computed numbers — and never implies activity timing.
function Summary({ m, metric }: { m: SummaryModel; metric: Metric }) {
  if (!m.cur.length && m.folNet == null) {
    return <p className="an3-card-empty">Nothing to summarize yet for this period.</p>;
  }
  const n = m.cur.length;
  const postWord = `${n} post${n === 1 ? "" : "s"}`;

  if (metric === "views") {
    if (!m.viewsAvail || !n) return <p className="an3-card-empty">No view data for posts published in this period.</p>;
    const mult = m.topViews && m.viewsMedAll ? (m.topViews.views ?? 0) / m.viewsMedAll : null;
    return (
      <>
        <b className="an3-sum-head">{mult && mult >= 1.5 ? "Above your baseline" : "Tracking your baseline"}</b>
        <p className="an3-sum-body">
          {postWord} published this period, currently holding {fmtNum(m.viewsCur)} views in total
          {mult ? `. The top one is at ${fmtMult(mult)} your account median` : ""}.
        </p>
      </>
    );
  }
  if (metric === "posts") {
    return (
      <>
        <b className="an3-sum-head">{m.freq >= 3 ? "Consistent cadence" : m.freq >= 1 ? "Steady cadence" : "Light cadence"}</b>
        <p className="an3-sum-body">
          {postWord} published over the last {m.days} days — about {m.freq.toFixed(1)} per week.
        </p>
      </>
    );
  }
  if (metric === "followers") {
    return (
      <>
        <b className="an3-sum-head">{m.folNet == null ? "History building" : m.folNet >= 0 ? "Growing" : "Slipping"}</b>
        <p className="an3-sum-body">
          {m.folNet == null
            ? "SOCIA records one real follower snapshot per day — the trend appears as those accumulate."
            : `${m.folNet >= 0 ? "Gained" : "Lost"} ${Math.abs(m.folNet).toLocaleString("en-US")} followers across the recorded days.`}
        </p>
      </>
    );
  }
  // engagement
  if (!n) return <p className="an3-card-empty">No posts published in this period.</p>;
  const d = m.engDelta;
  const head = d == null ? "First measurable period" : d.kind === "new" ? "New activity" : d.pct >= 15 ? "Strong momentum" : d.pct <= -15 ? "Cooling off" : "Steady";
  const dominant = m.likesCur >= m.comCur * 4 ? "mostly from likes" : m.comCur > m.likesCur ? "driven by comments" : "a mix of likes and comments";
  const top = m.topEng;
  return (
    <>
      <b className="an3-sum-head">{head}</b>
      <p className="an3-sum-body">
        {top
          ? `Your post published ${shortDate(new Date(top.t))} currently has ${m.engOf(top).toLocaleString("en-US")} engagements, ${dominant}.`
          : `${postWord} published this period.`}
        {d?.kind === "pct" && ` Posts from this period are ${d.pct >= 0 ? "up" : "down"} ${Math.abs(d.pct).toFixed(0)}% vs those published in the previous ${m.days} days.`}
      </p>
    </>
  );
}
