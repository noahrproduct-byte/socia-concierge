"use client";

// Performance over time — the analytics centerpiece.
// Metric model rules (the whole point of this module):
// - LIFETIME POST TOTALS ARE NEVER TURNED INTO DAILY POINTS. Instagram gives
//   us each post's current totals, not when the activity happened, so views/
//   engagement render as "by post" bars until real daily history exists.
// - Daily lines come only from SOCIA's own daily snapshots of Instagram's
//   account-level day metrics (real daily activity) — never reconstructed.
// - value and availability are separate: 0 is a confirmed zero, null/absent
//   means the platform didn't provide it, and the UI says "Unavailable".
// - Period deltas compare the selected window with the immediately preceding
//   equal-length window; a zero previous period reads "up from 0", never an
//   absurd percentage.
// - Every chart carries its data-quality label (real daily data / snapshot
//   history / post-level totals) via an info chip.

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Activity,
  Play,
  FileText,
  ExternalLink,
  ArrowRight,
  Info,
} from "lucide-react";
import { median, pctChange, fmtMult } from "@/lib/metrics";

export type PerfPost = {
  t: string;
  likes: number;
  comments: number;
  /** From media insights; null = Meta did not provide it (never zero). */
  views: number | null;
  saved: number | null;
  shares: number | null;
  type: string;
  caption: string;
  thumb: string | null;
  permalink: string | null;
};

/** One daily account snapshot. null column = not provided that day. */
export type DailyRow = {
  day: string;
  followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  total_interactions: number | null;
  saves: number | null;
  shares: number | null;
};

type Metric = "followers" | "views" | "eng" | "posts";

const DAY_MS = 86400000;
const CHIPS = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
] as const;

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "followers", label: "Followers", color: "blue" },
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

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Period delta with sane zero-handling: {pct} normally, "up from 0" when the
 *  previous window had nothing, null when no comparison exists. */
type DeltaVal = { kind: "pct"; pct: number } | { kind: "new" } | null;
function deltaOf(cur: number, prev: number | null, prevWindowMeasured: boolean): DeltaVal {
  if (!prevWindowMeasured || prev == null) return null;
  if (prev === 0) return cur > 0 ? { kind: "new" } : { kind: "pct", pct: 0 };
  return { kind: "pct", pct: pctChange(cur, prev)! };
}

function Delta({ d, note }: { d: DeltaVal; note: string }) {
  const cls =
    d == null ? "flat" : d.kind === "new" ? "up" : Math.abs(d.pct) < 2 ? "flat" : d.pct > 0 ? "up" : "down";
  return (
    <span className="an3-delta-wrap">
      <em className={`an3-delta ${cls}`}>
        {d == null ? "–" : d.kind === "new" ? "up from 0" : `${d.pct > 0 ? "↑" : d.pct < 0 ? "↓" : ""} ${Math.abs(d.pct).toFixed(1)}%`}
      </em>
      <small>{note}</small>
    </span>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 3 || Math.max(...data) === 0) return null;
  const W = 72, H = 22;
  const mx = Math.max(...data);
  const mn = Math.min(...data);
  const span = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - mn) / span) * (H - 5)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an3-spark" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const W = 920, H = 250, padL = 46, padR = 14, padT = 18, padB = 26;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

/** Category bar chart (posts-per-bucket or metric-by-post). Native tooltips;
 *  bars can link to the real post. */
function BarChart({
  items,
  cls,
  ariaLabel,
}: {
  items: { label: string; v: number; title: string; href?: string | null }[];
  cls: string;
  ariaLabel: string;
}) {
  const n = items.length;
  const maxV = niceCeil(Math.max(...items.map((i) => i.v), 1));
  const y = (v: number) => padT + (1 - v / maxV) * plotH;
  const step = plotW / Math.max(1, n);
  const bw = Math.min(44, step * 0.62);
  const labelEvery = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an3-chart" role="img" aria-label={ariaLabel}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
      ))}
      {[maxV, maxV / 2].map((v) => (
        <text key={v} x={padL - 8} y={y(v) + 3} className="an3-axis" textAnchor="end">{fmtNum(v)}</text>
      ))}
      {items.map((it, i) => {
        const cx = padL + step * i + step / 2;
        const bar = (
          <g key={i} className="an3-barg">
            <rect
              x={cx - bw / 2}
              y={y(it.v)}
              width={bw}
              height={Math.max(2, padT + plotH - y(it.v))}
              rx={4}
              className={`an3-bar ${cls}`}
            >
              <title>{it.title}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={cx} y={H - 6} className="an3-axis" textAnchor="middle">{it.label}</text>
            )}
          </g>
        );
        return it.href ? (
          <a key={i} href={it.href} target="_blank" rel="noreferrer" aria-label={`Open post: ${it.title}`}>
            {bar}
          </a>
        ) : (
          bar
        );
      })}
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
  /** false = the stored token lacks the insights permission. */
  insightsOk?: boolean | null;
}) {
  // Date math waits for mount so SSR (UTC) and the browser never disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [rangeId, setRangeId] = useState<string>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [metric, setMetric] = useState<Metric>("eng");
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!now) return null;
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // exclusive
    let days: number = CHIPS.find((r) => r.id === rangeId)?.days ?? 30;
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

    const inWin = (t: string, a: Date, b: Date) => {
      const ms = new Date(t).getTime();
      return ms >= a.getTime() && ms < b.getTime();
    };
    const cur = posts.filter((p) => inWin(p.t, start, end)).sort(
      (a, b) => new Date(a.t).getTime() - new Date(b.t).getTime()
    );
    const prev = posts.filter((p) => inWin(p.t, prevStart, start));
    // "Measured" = the account's history reaches back through the previous
    // window (oldest known post predates it), so an empty window is a real 0.
    const oldestPost = posts.length
      ? Math.min(...posts.map((p) => new Date(p.t).getTime()))
      : null;
    const prevMeasured = oldestPost != null && oldestPost <= prevStart.getTime();

    const sum = (xs: PerfPost[], f: (p: PerfPost) => number) => xs.reduce((a, p) => a + f(p), 0);
    const engCur = sum(cur, (p) => p.likes + p.comments);
    const engPrev = sum(prev, (p) => p.likes + p.comments);
    const likesCur = sum(cur, (p) => p.likes);
    const comCur = sum(cur, (p) => p.comments);
    const viewsAvail = cur.some((p) => p.views != null);
    const viewsCur = sum(cur, (p) => p.views ?? 0);
    const viewsPrevAvail = prev.some((p) => p.views != null);
    const viewsPrev = sum(prev, (p) => p.views ?? 0);
    const savesAvail = cur.some((p) => p.saved != null);
    const savesCur = savesAvail ? sum(cur, (p) => p.saved ?? 0) : null;
    const sharesAvail = cur.some((p) => p.shares != null);
    const sharesCur = sharesAvail ? sum(cur, (p) => p.shares ?? 0) : null;

    // Real daily series from snapshots (account-level day metrics).
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const inRows = daily.filter((r) => r.day >= startStr && r.day < endStr);
    const folRows = inRows.filter((r) => r.followers != null);
    const viewsRows = inRows.filter((r) => r.views != null);
    const engRows = inRows.filter(
      (r) => r.total_interactions != null || (r.likes != null && r.comments != null)
    );
    const engOfRow = (r: DailyRow) => r.total_interactions ?? (r.likes ?? 0) + (r.comments ?? 0);

    const before = daily.filter((r) => r.day <= startStr && r.followers != null);
    const folBaseline = before.length ? before[before.length - 1].followers : null;
    const folNet =
      folRows.length >= 2 ? folRows[folRows.length - 1].followers! - folRows[0].followers! : null;
    const folDelta: DeltaVal =
      followers != null && folBaseline != null && folBaseline > 0
        ? { kind: "pct", pct: pctChange(followers, folBaseline)! }
        : null;

    // Posts buckets: daily for ≤31 days, weekly beyond.
    const weekly = days > 31;
    const bucketCount = weekly ? Math.ceil(days / 7) : days;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      date: new Date(start.getTime() + i * (weekly ? 7 : 1) * DAY_MS),
      posts: [] as PerfPost[],
    }));
    for (const p of cur) {
      const i = Math.min(
        bucketCount - 1,
        Math.floor((new Date(p.t).getTime() - start.getTime()) / ((weekly ? 7 : 1) * DAY_MS))
      );
      if (i >= 0) buckets[i].posts.push(p);
    }
    const freq = (cur.length / days) * 7;
    const fmtCounts = new Map<string, number>();
    for (const p of cur) fmtCounts.set(p.type, (fmtCounts.get(p.type) ?? 0) + 1);
    const topFmt = [...fmtCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const postMed = median(cur.map((p) => p.likes + p.comments));
    // Best performing format = highest median engagement among formats with ≥2 posts.
    let bestFmt: string | null = null;
    let bestFmtRatio = 0;
    if (postMed && postMed > 0) {
      for (const [t] of fmtCounts) {
        const xs = cur.filter((p) => p.type === t).map((p) => p.likes + p.comments);
        if (xs.length < 2) continue;
        const r = (median(xs) ?? 0) / postMed;
        if (r > bestFmtRatio) { bestFmtRatio = r; bestFmt = t; }
      }
    }

    const top = cur.length
      ? [...cur].sort((a, b) => b.likes + b.comments - (a.likes + a.comments))[0]
      : null;
    const topViews = viewsAvail && cur.length
      ? [...cur].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0]
      : null;
    const topMult = top && postMed && postMed > 0 ? (top.likes + top.comments) / postMed : null;
    const topShare = top && engCur > 0 ? Math.round(((top.likes + top.comments) / engCur) * 100) : null;

    return {
      days, start, cur, prevCount: prev.length, prevMeasured,
      engCur, likesCur, comCur,
      engDelta: deltaOf(engCur, engPrev, prevMeasured || prev.length > 0),
      viewsAvail, viewsCur,
      viewsDelta: viewsAvail ? deltaOf(viewsCur, viewsPrevAvail ? viewsPrev : null, viewsPrevAvail) : null,
      savesAvail, savesCur, sharesAvail, sharesCur,
      folRows, folNet, folDelta,
      viewsRows, engRows, engOfRow,
      buckets, weekly, freq, topFmt, bestFmt, bestFmtRatio,
      top, topViews, topMult, topShare,
      postsDeltaAbs: prevMeasured || prev.length > 0 ? cur.length - prev.length : null,
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
  const compareNote = `vs previous ${m.days} days`;
  const pick = (id: Metric) => { setMetric(id); setHover(null); };
  const empty = m.cur.length === 0;

  // Followers line geometry (snapshot history).
  const fol = m.folRows;
  const folVals = fol.map((f) => f.followers!);
  const folMin = folVals.length ? Math.min(...folVals) : 0;
  const folMax = folVals.length ? Math.max(...folVals) : 1;
  const folPad = Math.max(1, Math.round((folMax - folMin) * 0.25));
  const yF = (v: number) =>
    padT + (1 - (v - (folMin - folPad)) / (folMax + folPad - (folMin - folPad))) * plotH;
  const xF = (i: number) => padL + (fol.length > 1 ? (i / (fol.length - 1)) * plotW : plotW / 2);

  // Daily line geometry for views/engagement snapshot series.
  const lineRows = metric === "views" ? m.viewsRows : metric === "eng" ? m.engRows : [];
  const lineVal = (r: DailyRow) => (metric === "views" ? r.views! : m.engOfRow(r));
  const lineVals = lineRows.map(lineVal);
  const lineMax = niceCeil(Math.max(...lineVals, 1));
  const yL = (v: number) => padT + (1 - v / lineMax) * plotH;
  const xL = (i: number) => padL + (lineRows.length > 1 ? (i / (lineRows.length - 1)) * plotW : plotW / 2);
  const dailyLineReady = lineRows.length >= 3;

  const hoverRow =
    hover != null
      ? metric === "followers"
        ? fol[hover] ?? null
        : dailyLineReady
          ? lineRows[hover] ?? null
          : null
      : null;

  function onMoveLine(e: React.PointerEvent<SVGSVGElement>, count: number) {
    if (count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(count - 1, Math.round(((px - padL) / plotW) * (count - 1)))));
  }

  const kpis: {
    id: Metric; label: string; color: string; Ico: typeof Users;
    value: string | null; naText?: string; d: DeltaVal; note: string; spark?: { data: number[]; color: string };
  }[] = [
    {
      id: "followers", label: "Followers", color: "blue", Ico: Users,
      value: followers != null ? followers.toLocaleString("en-US") : null,
      naText: "not synced yet",
      d: m.folDelta, note: m.folDelta ? compareNote : "history builds from daily snapshots",
      spark: { data: folVals, color: "#2563ff" },
    },
    {
      id: "views", label: "Views", color: "green", Ico: Play,
      value: m.viewsAvail ? fmtNum(m.viewsCur) : null,
      naText: "Unavailable from the connected account",
      d: m.viewsDelta, note: m.viewsAvail ? `on posts this period · ${compareNote}` : "",
      spark: { data: m.viewsRows.map((r) => r.views!), color: "#10b981" },
    },
    {
      id: "eng", label: "Engagement", color: "purple", Ico: Activity,
      value: fmtNum(m.engCur),
      d: m.engDelta, note: `on posts this period · ${compareNote}`,
      spark: { data: m.engRows.map(m.engOfRow), color: "#8b5cf6" },
    },
    {
      id: "posts", label: "Posts", color: "amber", Ico: FileText,
      value: String(m.cur.length),
      d: m.postsDeltaAbs == null ? null : { kind: "pct", pct: 0 }, // rendered specially below
      note: "",
      spark: { data: m.buckets.map((b) => b.posts.length), color: "#f5b04c" },
    },
  ];

  const qualityChip = (text: string, tip: string) => (
    <span className="an3-quality" title={tip}>
      <Info size={10} /> {text}
    </span>
  );

  return (
    <section className="an3 db2-rise" style={{ animationDelay: "360ms" }}>
      {/* header */}
      <div className="an3-head">
        <div>
          <h3>Performance over time</h3>
          <p>Track how your audience and content are growing.</p>
        </div>
        <div className="an3-controls">
          <select
            className="an3-select"
            value={["7", "30", "90"].includes(rangeId) ? rangeId : "custom"}
            onChange={(e) => setRangeId(e.target.value)}
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
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

      {/* KPI cards — clicking one selects its metric */}
      <div className="an3-kpis">
        {kpis.map(({ id, label, color, Ico, value, naText, d, note, spark }) => (
          <button
            key={id}
            type="button"
            className={`an3-kpi${metric === id ? ` on ${color}` : ""}${value == null ? " na" : ""}`}
            onClick={() => pick(id)}
            aria-pressed={metric === id}
          >
            <span className={`an3-kpi-ico ${color}`}><Ico size={15} /></span>
            <span className="an3-kpi-label">
              {label}
              {id === "eng" && (
                <i className="an3-info" title="Likes + comments on posts published in the period (current totals — the by-post chart shows exactly this; daily activity comes from snapshots as they accrue).">
                  <Info size={11} />
                </i>
              )}
            </span>
            {value != null ? (
              <>
                <b>{value}</b>
                {id === "posts" ? (
                  <span className="an3-delta-wrap">
                    <em className={`an3-delta ${m.postsDeltaAbs == null ? "flat" : m.postsDeltaAbs >= 0 ? "up" : "down"}`}>
                      {m.postsDeltaAbs == null ? "–" : `${m.postsDeltaAbs >= 0 ? "+" : ""}${m.postsDeltaAbs}`}
                    </em>
                    <small>{m.postsDeltaAbs == null ? "no earlier period" : compareNote}</small>
                  </span>
                ) : (
                  <Delta d={d} note={note} />
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

      {/* metric tabs + time chips */}
      <div className="an3-tabs" role="tablist">
        {METRICS.map(({ id, label, color }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={metric === id}
            className={metric === id ? `on ${color}` : ""}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
        <span className="an3-chips">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className={rangeId === c.id ? "on" : ""} onClick={() => setRangeId(c.id)}>
              {c.label}
            </button>
          ))}
        </span>
      </div>

      {/* one metric → one honest chart */}
      <div className="an3-chartwrap">
        {metric === "followers" ? (
          fol.length >= 2 ? (
            <>
              <div className="an3-hero">
                <div><b>{followers != null ? followers.toLocaleString("en-US") : "–"}</b><small>Total followers</small></div>
                {m.folNet != null && (
                  <div><b>{m.folNet >= 0 ? "+" : ""}{m.folNet.toLocaleString("en-US")}</b><small>Net change</small></div>
                )}
                {m.folDelta?.kind === "pct" && (
                  <div><b className={m.folDelta.pct >= 0 ? "up" : "down"}>{m.folDelta.pct >= 0 ? "↑" : "↓"} {Math.abs(m.folDelta.pct).toFixed(1)}%</b><small>{compareNote}</small></div>
                )}
                {qualityChip("Snapshot history", "Built from SOCIA's real daily follower snapshots — never reconstructed.")}
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="an3-chart"
                role="img"
                aria-label="Total followers over time"
                onPointerMove={(e) => onMoveLine(e, fol.length)}
                onPointerLeave={() => setHover(null)}
              >
                {[0.25, 0.5, 0.75, 1].map((t) => (
                  <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
                ))}
                <text x={padL - 8} y={yF(folMax) + 3} className="an3-axis" textAnchor="end">{fmtNum(folMax)}</text>
                <text x={padL - 8} y={yF(folMin) + 3} className="an3-axis" textAnchor="end">{fmtNum(folMin)}</text>
                {fol.length > 1 && [0, Math.floor((fol.length - 1) / 2), fol.length - 1].map((i) => (
                  <text key={i} x={xF(i)} y={H - 6} className="an3-axis" textAnchor="middle">
                    {shortDate(new Date(fol[i].day + "T00:00:00"))}
                  </text>
                ))}
                <path d={`M${xF(0)},${padT + plotH} ${fol.map((f, i) => `L${xF(i)},${yF(f.followers!)}`).join(" ")} L${xF(fol.length - 1)},${padT + plotH} Z`} fill="rgba(37,99,255,0.08)" />
                <polyline points={fol.map((f, i) => `${xF(i)},${yF(f.followers!)}`).join(" ")} className="an3-line blue an3-draw" fill="none" />
                {fol.map((f, i) => (
                  <circle key={f.day} cx={xF(i)} cy={yF(f.followers!)} r="3" className="an3-dot blue" />
                ))}
                {hover != null && hoverRow && (
                  <line x1={xF(hover)} y1={padT} x2={xF(hover)} y2={padT + plotH} className="an3-cross" />
                )}
              </svg>
              {hoverRow && metric === "followers" && (
                <div className="an3-tip" style={{ left: `${Math.min(84, Math.max(6, (xF(hover!) / W) * 100))}%` }}>
                  <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                  <div><span>Followers</span><em>{hoverRow.followers!.toLocaleString("en-US")}</em></div>
                  {hover! > 0 && fol[hover! - 1].followers != null && (
                    <div><span>Net change</span><em>{(hoverRow.followers! - fol[hover! - 1].followers! >= 0 ? "+" : "") + (hoverRow.followers! - fol[hover! - 1].followers!).toLocaleString("en-US")}</em></div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="an3-unavailable">
              <b>
                {followers != null ? `${followers.toLocaleString("en-US")} followers · ` : ""}
                follower history started {fol.length === 1 ? shortDate(new Date(fol[0].day + "T00:00:00")) : "today"}
              </b>
              <p>
                SOCIA records one real snapshot per day and never reconstructs history — the line
                appears once a few days have accumulated.
              </p>
            </div>
          )
        ) : metric === "posts" ? (
          empty ? (
            <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>
          ) : (
            <>
              <div className="an3-hero">
                <div><b>{m.cur.length}</b><small>Posts published</small></div>
                <div><b>{m.freq.toFixed(1)}</b><small>Posts / week</small></div>
                {m.topFmt && <div><b>{FMT_LABEL[m.topFmt] ?? m.topFmt}</b><small>Most-used format</small></div>}
                {qualityChip("Real daily data", "Publish dates come straight from your posts — this chart is exact.")}
              </div>
              <BarChart
                cls="amber"
                ariaLabel={`Posts published per ${m.weekly ? "week" : "day"}`}
                items={m.buckets.map((b) => {
                  const fmts = [...b.posts.reduce((acc, p) => acc.set(p.type, (acc.get(p.type) ?? 0) + 1), new Map<string, number>())]
                    .map(([t, c]) => `${c} ${FMT_LABEL[t] ?? t}${c > 1 ? "s" : ""}`)
                    .join(", ");
                  return {
                    label: shortDate(b.date),
                    v: b.posts.length,
                    title: `${m.weekly ? "Week of " : ""}${shortDate(b.date)} — ${b.posts.length} post${b.posts.length === 1 ? "" : "s"}${fmts ? ` (${fmts})` : ""}`,
                  };
                })}
              />
            </>
          )
        ) : (
          // views / engagement
          (() => {
            const isViews = metric === "views";
            if (isViews && !m.viewsAvail) {
              return (
                <div className="an3-unavailable">
                  {insightsOk === false ? (
                    <>
                      <b>Reconnect Instagram to enable views.</b>
                      <p>
                        Your stored connection predates full analytics permissions.{" "}
                        <a href="/settings#accounts">Reconnect in Settings</a> and this chart lights
                        up on the next sync.
                      </p>
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
            if (empty) {
              return <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>;
            }
            const cls = isViews ? "green" : "purple";
            const heroTotal = isViews ? m.viewsCur : m.engCur;
            const heroDelta = isViews ? m.viewsDelta : m.engDelta;
            return (
              <>
                <div className="an3-hero">
                  <div><b>{fmtNum(heroTotal)}</b><small>Total {isViews ? "views" : "engagement"} · posts this period</small></div>
                  <div><b>{m.cur.length}</b><small>Posts published</small></div>
                  {heroDelta && (
                    <div>
                      <b className={heroDelta.kind === "new" || heroDelta.pct >= 0 ? "up" : "down"}>
                        {heroDelta.kind === "new" ? "up from 0" : `${heroDelta.pct >= 0 ? "↑" : "↓"} ${Math.abs(heroDelta.pct).toFixed(1)}%`}
                      </b>
                      <small>{compareNote}</small>
                    </div>
                  )}
                  {dailyLineReady
                    ? qualityChip("Real daily data", "Daily account-level activity from Instagram Insights, recorded by SOCIA's snapshots.")
                    : qualityChip("Post-level totals", "Instagram provides each post's current totals, not when the activity happened — so this chart shows totals per post, never fake daily points. A real daily line appears as snapshot history accumulates.")}
                </div>

                {!isViews && (
                  <div className="an3-breakdown">
                    <span><small>Likes</small><b>{fmtNum(m.likesCur)}</b></span>
                    <span><small>Comments</small><b>{fmtNum(m.comCur)}</b></span>
                    <span><small>Shares</small><b>{m.sharesAvail ? fmtNum(m.sharesCur!) : <i title="Not provided by the connected account">— Unavailable</i>}</b></span>
                    <span><small>Saves</small><b>{m.savesAvail ? fmtNum(m.savesCur!) : <i title="Not provided by the connected account">— Unavailable</i>}</b></span>
                  </div>
                )}

                {dailyLineReady ? (
                  <>
                    <svg
                      viewBox={`0 0 ${W} ${H}`}
                      className="an3-chart"
                      role="img"
                      aria-label={`Daily ${isViews ? "views" : "engagement"} from account insights`}
                      onPointerMove={(e) => onMoveLine(e, lineRows.length)}
                      onPointerLeave={() => setHover(null)}
                    >
                      {[0.25, 0.5, 0.75, 1].map((t) => (
                        <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
                      ))}
                      {[lineMax, lineMax / 2].map((v) => (
                        <text key={v} x={padL - 8} y={yL(v) + 3} className="an3-axis" textAnchor="end">{fmtNum(v)}</text>
                      ))}
                      {lineRows.length > 1 && [0, Math.floor((lineRows.length - 1) / 2), lineRows.length - 1].map((i) => (
                        <text key={i} x={xL(i)} y={H - 6} className="an3-axis" textAnchor="middle">
                          {shortDate(new Date(lineRows[i].day + "T00:00:00"))}
                        </text>
                      ))}
                      <path d={`M${xL(0)},${padT + plotH} ${lineRows.map((r, i) => `L${xL(i)},${yL(lineVal(r))}`).join(" ")} L${xL(lineRows.length - 1)},${padT + plotH} Z`} fill={isViews ? "rgba(16,185,129,0.07)" : "rgba(139,92,246,0.07)"} />
                      <polyline points={lineRows.map((r, i) => `${xL(i)},${yL(lineVal(r))}`).join(" ")} className={`an3-line ${cls} an3-draw`} fill="none" />
                      {lineRows.map((r, i) => (
                        <circle key={r.day} cx={xL(i)} cy={yL(lineVal(r))} r="3" className={`an3-dot ${cls}`} />
                      ))}
                      {hover != null && hoverRow && (
                        <line x1={xL(hover)} y1={padT} x2={xL(hover)} y2={padT + plotH} className="an3-cross" />
                      )}
                    </svg>
                    {hoverRow && (
                      <div className="an3-tip" style={{ left: `${Math.min(84, Math.max(6, (xL(hover!) / W) * 100))}%` }}>
                        <b>{new Date(hoverRow.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                        {isViews ? (
                          <div><span>Views</span><em>{hoverRow.views!.toLocaleString("en-US")}</em></div>
                        ) : (
                          <>
                            <div><span>Engagement</span><em>{m.engOfRow(hoverRow).toLocaleString("en-US")}</em></div>
                            {hoverRow.likes != null && <div><span>Likes</span><em>{hoverRow.likes.toLocaleString("en-US")}</em></div>}
                            {hoverRow.comments != null && <div><span>Comments</span><em>{hoverRow.comments.toLocaleString("en-US")}</em></div>}
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <BarChart
                    cls={cls}
                    ariaLabel={`${isViews ? "Views" : "Engagement"} by post`}
                    items={m.cur.map((p) => {
                      const v = isViews ? p.views ?? 0 : p.likes + p.comments;
                      const cap = p.caption.split("\n")[0].slice(0, 60) || "(no caption)";
                      return {
                        label: shortDate(new Date(p.t)),
                        v,
                        title: `${cap}\n${shortDate(new Date(p.t))} · ${FMT_LABEL[p.type] ?? p.type} · ${v.toLocaleString("en-US")} ${isViews ? "views" : "engagements"} (current total)`,
                        href: p.permalink,
                      };
                    })}
                  />
                )}
                <p className="an3-chart-note">
                  {dailyLineReady
                    ? `Daily ${isViews ? "views" : "engagement"} recorded from Instagram's account insights.`
                    : `${isViews ? "Views" : "Engagement"} by post — current totals per post, shown on publish dates. Instagram doesn't say which day the activity happened, so SOCIA doesn't guess. A daily line replaces this as snapshot history accumulates.`}
                </p>
              </>
            );
          })()
        )}
      </div>

      {/* bottom cards */}
      <div className="an3-insights">
        <div className="an3-card">
          <small className="an3-card-label">Top performing content</small>
          {m.top ? (
            <>
              <div className="an3-top">
                {m.top.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.top.thumb} alt="" width={52} height={52} />
                ) : (
                  <span className="an3-top-ph" aria-hidden />
                )}
                <span className="an3-top-meta">
                  <b>{m.top.caption.split("\n")[0].slice(0, 48) || "(no caption)"}</b>
                  <small>
                    {new Date(m.top.t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" · "}
                    {new Date(m.top.t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </small>
                  <small>
                    {m.top.views != null && <>{fmtNum(m.top.views)} views · </>}
                    {fmtNum(m.top.likes)} likes · {fmtNum(m.top.comments)} comments
                    {m.top.saved != null && <> · {fmtNum(m.top.saved)} saves</>}
                    {m.topMult != null && m.topMult >= 1.2 && (
                      <em title={`vs the median post of this period (${m.cur.length} posts)`}>
                        {" "}· {fmtMult(m.topMult)} your median
                      </em>
                    )}
                  </small>
                </span>
              </div>
              {m.top.permalink && (
                <a className="an3-card-cta" href={m.top.permalink} target="_blank" rel="noreferrer">
                  View post <ExternalLink size={12} />
                </a>
              )}
            </>
          ) : (
            <p className="an3-card-empty">No posts in this period.</p>
          )}
        </div>

        <div className="an3-card">
          <small className="an3-card-label">
            {metric === "followers" ? "Follower insights" : metric === "views" ? "View insights" : metric === "posts" ? "Publishing insights" : "Engagement insights"}
          </small>
          <ul className="an3-rows">
            {metric === "followers" && (
              <>
                <li><span>Net growth</span><em className="flat">{m.folNet != null ? `${m.folNet >= 0 ? "+" : ""}${m.folNet.toLocaleString("en-US")}` : "history builds daily"}</em></li>
                <li><span>Snapshot days recorded</span><em className="flat">{fol.length}</em></li>
                <li><span>Current followers</span><em className="flat">{followers != null ? followers.toLocaleString("en-US") : "—"}</em></li>
              </>
            )}
            {metric === "views" && (
              <>
                <li><span>Total views (posts this period)</span><em className="flat">{m.viewsAvail ? fmtNum(m.viewsCur) : "— Unavailable"}</em></li>
                <li><span>Highest-viewed post</span><em className="flat">{m.topViews?.views != null ? fmtNum(m.topViews.views) : "—"}</em></li>
                <li><span>Avg views / post</span><em className="flat">{m.viewsAvail && m.cur.length ? fmtNum(Math.round(m.viewsCur / m.cur.length)) : "—"}</em></li>
              </>
            )}
            {metric === "eng" && (
              <>
                <li><span>Total engagement</span><em className="flat">{fmtNum(m.engCur)}</em></li>
                <li><span>Per post</span><em className="flat">{m.cur.length ? fmtNum(Math.round(m.engCur / m.cur.length)) : "—"}</em></li>
                <li><span>Likes / Comments</span><em className="flat">{fmtNum(m.likesCur)} / {fmtNum(m.comCur)}</em></li>
                <li><span>Shares / Saves</span><em className="flat">{m.sharesAvail ? fmtNum(m.sharesCur!) : "—"} / {m.savesAvail ? fmtNum(m.savesCur!) : "—"}</em></li>
              </>
            )}
            {metric === "posts" && (
              <>
                <li><span>Posts published</span><em className="flat">{m.cur.length}{m.postsDeltaAbs != null ? ` (${m.postsDeltaAbs >= 0 ? "+" : ""}${m.postsDeltaAbs} ${compareNote})` : ""}</em></li>
                <li><span>Average / week</span><em className="flat">{m.freq.toFixed(1)}</em></li>
                <li><span>Most-used format</span><em className="flat">{m.topFmt ? FMT_LABEL[m.topFmt] ?? m.topFmt : "—"}</em></li>
                <li><span>Best-performing format</span><em className="flat">{m.bestFmt ? `${FMT_LABEL[m.bestFmt] ?? m.bestFmt} (${fmtMult(m.bestFmtRatio)} median)` : "needs more posts"}</em></li>
              </>
            )}
          </ul>
        </div>

        <div className="an3-card">
          <small className="an3-card-label">Performance summary</small>
          <Summary m={m} />
          <a className="an3-card-cta" href="/tool">
            See content ideas <ArrowRight size={12} />
          </a>
        </div>
      </div>

      <p className="an3-foot">
        <Info size={11} /> Post charts show current totals for content published in the period —
        never invented daily timing. Daily lines use SOCIA&apos;s recorded snapshots. Times shown in
        your device&apos;s time zone.
      </p>
    </section>
  );
}

// Templated strictly from the computed numbers above — no freeform claims.
function Summary({ m }: {
  m: {
    engDelta: DeltaVal; cur: PerfPost[]; prevCount: number; days: number;
    topShare: number | null; top: PerfPost | null; folNet: number | null; freq: number;
  };
}) {
  if (!m.cur.length && m.folNet == null) {
    return <p className="an3-card-empty">Nothing to summarize — no posts or follower history in this period yet.</p>;
  }
  const d = m.engDelta;
  const head =
    d == null ? "First measurable period"
    : d.kind === "new" ? "New activity"
    : d.pct >= 15 ? "Strong momentum"
    : d.pct <= -15 ? "Cooling off"
    : "Steady";
  const bits: string[] = [];
  if (m.folNet != null) {
    bits.push(`You ${m.folNet >= 0 ? "gained" : "lost"} ${Math.abs(m.folNet).toLocaleString("en-US")} followers over the recorded days.`);
  }
  if (d != null) {
    bits.push(
      d.kind === "new"
        ? `Engagement on new content is up from a quiet previous ${m.days} days (${m.cur.length} vs ${m.prevCount} posts).`
        : `Engagement on new content is ${d.pct >= 0 ? "up" : "down"} ${Math.abs(d.pct).toFixed(0)}% vs the previous ${m.days} days (${m.cur.length} vs ${m.prevCount} posts).`
    );
  } else if (m.cur.length) {
    bits.push(`${m.cur.length} post${m.cur.length === 1 ? "" : "s"} at ${m.freq.toFixed(1)}/week, with no earlier period to compare yet.`);
  }
  if (m.top && m.topShare != null && m.topShare >= 40) {
    bits.push(`“${m.top.caption.split("\n")[0].slice(0, 36)}” drove ${m.topShare}% of the engagement.`);
  }
  return (
    <>
      <b className="an3-sum-head">{head}</b>
      <p className="an3-sum-body">{bits.join(" ")}</p>
    </>
  );
}
