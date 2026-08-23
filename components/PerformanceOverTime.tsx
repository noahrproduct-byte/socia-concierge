"use client";

// Performance over time — the analytics centerpiece. One metric at a time:
// click a KPI card (or tab) and the chart tells that metric's story.
// Every number is computed client-side (viewer's time zone) from real synced
// posts and real daily follower snapshots. Honesty rules:
// - views/saves aren't provided by the Instagram Login API → the cards and
//   tabs exist, but they show proper unavailable states, never numbers
// - follower history is real snapshots only; until it accrues, the chart
//   says so instead of drawing fake history
// - a day's "engagement" is the lifetime likes+comments of content POSTED
//   that day (the API has no per-day breakdown) — labeled as such
// - period comparisons always use the equivalent preceding window
// - spike markers say "published near this spike" — never false attribution

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Activity,
  Heart,
  MessageCircle,
  Play,
  Bookmark,
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
  type: string;
  caption: string;
  thumb: string | null;
  permalink: string | null;
};
export type FollowerSnap = { day: string; followers: number };

type Metric = "followers" | "views" | "eng" | "saves";

const DAY_MS = 86400000;
const CHIPS = [
  { id: "1", label: "1D", days: 1 },
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
] as const;

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "followers", label: "Followers", color: "blue" },
  { id: "views", label: "Views", color: "green" },
  { id: "eng", label: "Engagement", color: "purple" },
  { id: "saves", label: "Saves", color: "amber" },
];

const fmtNum = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A friendly axis ceiling: 1/2/5 × 10^k just above v. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

type Day = {
  date: Date;
  eng: number;
  likes: number;
  comments: number;
  views: number;
  saves: number;
  posts: PerfPost[];
};

function Delta({ pct, note }: { pct: number | null; note: string }) {
  const cls = pct == null ? "flat" : Math.abs(pct) < 2 ? "flat" : pct > 0 ? "up" : "down";
  return (
    <span className="an3-delta-wrap">
      <em className={`an3-delta ${cls}`}>
        {pct == null ? "–" : `${pct > 0 ? "↑" : pct < 0 ? "↓" : ""} ${Math.abs(pct).toFixed(1)}%`}
      </em>
      <small>{note}</small>
    </span>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 3 || Math.max(...data) === 0) return null;
  const W = 72;
  const H = 22;
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

export default function PerformanceOverTime({
  posts,
  followers,
  snaps,
  insightsOk = null,
}: {
  posts: PerfPost[];
  followers: number | null;
  snaps: FollowerSnap[];
  /** false = the stored token lacks the insights permission. */
  insightsOk?: boolean | null;
}) {
  // Date math waits for mount so SSR (UTC) and the browser never disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [rangeId, setRangeId] = useState<string>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // One metric at a time. Followers is the reference default, but until real
  // snapshot history exists the engagement story is the useful first view.
  const [metric, setMetric] = useState<Metric>(snaps.length >= 2 ? "followers" : "eng");
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

    const inWin = (p: PerfPost, a: Date, b: Date) => {
      const t = new Date(p.t).getTime();
      return t >= a.getTime() && t < b.getTime();
    };
    const cur = posts.filter((p) => inWin(p, start, end));
    const prev = posts.filter((p) => inWin(p, prevStart, start));

    const dayList: Day[] = [];
    const idx = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * DAY_MS);
      idx.set(dayKey(date), i);
      dayList.push({ date, eng: 0, likes: 0, comments: 0, views: 0, saves: 0, posts: [] });
    }
    for (const p of cur) {
      const i = idx.get(dayKey(new Date(p.t)));
      if (i == null) continue;
      dayList[i].eng += p.likes + p.comments;
      dayList[i].likes += p.likes;
      dayList[i].comments += p.comments;
      dayList[i].views += p.views ?? 0;
      dayList[i].saves += p.saved ?? 0;
      dayList[i].posts.push(p);
    }

    const sum = (xs: PerfPost[], f: (p: PerfPost) => number) => xs.reduce((a, p) => a + f(p), 0);
    const engCur = sum(cur, (p) => p.likes + p.comments);
    const engPrev = prev.length ? sum(prev, (p) => p.likes + p.comments) : null;

    // Views/saves exist only when Meta actually provided media insights.
    const viewsAvail = cur.some((p) => p.views != null);
    const savesAvail = cur.some((p) => p.saved != null);
    const viewsCur = sum(cur, (p) => p.views ?? 0);
    const savesCur = sum(cur, (p) => p.saved ?? 0);
    const viewsPrev = prev.some((p) => p.views != null) ? sum(prev, (p) => p.views ?? 0) : null;
    const savesPrev = prev.some((p) => p.saved != null) ? sum(prev, (p) => p.saved ?? 0) : null;

    // Spike days: ≥2× the median of active days, with at least one post.
    const active = dayList.filter((d) => d.eng > 0).map((d) => d.eng);
    const dayMed = median(active);
    const spikes: number[] = [];
    if (dayMed != null && active.length >= 3) {
      dayList.forEach((d, i) => {
        if (d.posts.length && d.eng >= dayMed * 2) spikes.push(i);
      });
    }

    // Follower series inside the window + baseline just before it.
    const startStr = start.toISOString().slice(0, 10);
    const before = snaps.filter((s) => s.day <= startStr);
    const baseline = before.length ? before[before.length - 1].followers : null;
    const folSeries = snaps.filter((s) => s.day > startStr);
    const folNet =
      folSeries.length >= 2
        ? folSeries[folSeries.length - 1].followers - folSeries[0].followers
        : null;
    const folDelta = followers != null && baseline != null ? pctChange(followers, baseline) : null;

    const postMed = median(cur.map((p) => p.likes + p.comments));
    const top = cur.length
      ? [...cur].sort((a, b) => b.likes + b.comments - (a.likes + a.comments))[0]
      : null;
    const topMult = top && postMed && postMed > 0 ? (top.likes + top.comments) / postMed : null;
    const topShare = top && engCur > 0 ? Math.round(((top.likes + top.comments) / engCur) * 100) : null;

    return {
      days, dayList, spikes,
      engCur, likesCur: sum(cur, (p) => p.likes), comCur: sum(cur, (p) => p.comments),
      postCount: cur.length, prevCount: prev.length,
      engDelta: pctChange(engCur, engPrev),
      viewsAvail, savesAvail, viewsCur, savesCur,
      viewsDelta: pctChange(viewsCur, viewsPrev),
      savesDelta: pctChange(savesCur, savesPrev),
      folSeries, folNet, folDelta,
      top, topMult, topShare,
    };
  }, [now, rangeId, customStart, customEnd, posts, snaps, followers]);

  if (!model) {
    return (
      <section className="an3">
        <div className="an3-head"><div><h3>Performance over time</h3></div></div>
        <div className="an3-loading"><span className="an3-skelbar" /><span className="an3-skelbar tall" /></div>
      </section>
    );
  }

  const m = model;
  const compareNote = m.prevCount ? `vs previous ${m.days} days` : "no earlier period to compare";
  const pick = (id: Metric) => { setMetric(id); setHover(null); };

  // ---- chart geometry ----
  const W = 920, H = 250, padL = 46, padR = 14, padT = 40, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = m.dayList.length;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const engVals = m.dayList.map((d) => d.eng);
  const maxE = niceCeil(Math.max(...engVals, 1));
  const yE = (v: number) => padT + (1 - v / maxE) * plotH;
  const xTicks = Array.from({ length: Math.min(6, n) }, (_, k) =>
    Math.round((k / Math.max(1, Math.min(6, n) - 1)) * (n - 1))
  );

  const fol = m.folSeries;
  const folVals = fol.map((f) => f.followers);
  const folMin = folVals.length ? Math.min(...folVals) : 0;
  const folMax = folVals.length ? Math.max(...folVals) : 1;
  const folPad = Math.max(1, Math.round((folMax - folMin) * 0.25));
  const yF = (v: number) =>
    padT + (1 - (v - (folMin - folPad)) / (folMax + folPad - (folMin - folPad))) * plotH;
  const xF = (i: number) => padL + (fol.length > 1 ? (i / (fol.length - 1)) * plotW : plotW / 2);

  const hoverDay =
    metric !== "followers" && hover != null ? m.dayList[hover] : null;
  const hoverSnap = metric === "followers" && hover != null ? fol[hover] : null;

  function onMoveEng(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / plotW) * (n - 1)))));
  }
  function onMoveFol(e: React.PointerEvent<SVGSVGElement>) {
    if (fol.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(fol.length - 1, Math.round(((px - padL) / plotW) * (fol.length - 1)))));
  }

  const empty = m.postCount === 0;
  const metricLabel = METRICS.find((mm) => mm.id === metric)!.label;

  // The active post-metric series (one metric → one chart → one story).
  const S =
    metric === "views"
      ? { label: "Views", cls: "green", fill: "rgba(16,185,129,0.07)", get: (d: Day) => d.views, avail: m.viewsAvail, total: m.viewsCur, delta: m.viewsDelta }
      : metric === "saves"
        ? { label: "Saves", cls: "amber", fill: "rgba(217,119,6,0.08)", get: (d: Day) => d.saves, avail: m.savesAvail, total: m.savesCur, delta: m.savesDelta }
        : { label: "Engagement", cls: "purple", fill: "rgba(139,92,246,0.07)", get: (d: Day) => d.eng, avail: true, total: m.engCur, delta: m.engDelta };
  const sVals = m.dayList.map(S.get);
  const maxV = niceCeil(Math.max(...sVals, 1));
  const yV = (v: number) => padT + (1 - v / maxV) * plotH;
  const sActive = sVals.filter((v) => v > 0);
  const sMed = median(sActive);
  const sSpikes =
    sMed != null && sActive.length >= 3
      ? m.dayList.map((d, i) => (d.posts.length && S.get(d) >= sMed * 2 ? i : -1)).filter((i) => i >= 0)
      : [];
  const hoverSpikePost = hoverDay && hover != null && sSpikes.includes(hover) ? hoverDay.posts[0] : null;

  const kpis: {
    id: Metric; label: string; color: string; Ico: typeof Users;
    value: string | null; delta: number | null; note: string; spark?: { data: number[]; color: string };
  }[] = [
    {
      id: "followers", label: "Followers", color: "blue", Ico: Users,
      value: followers != null ? followers.toLocaleString("en-US") : null,
      delta: m.folDelta,
      note: m.folDelta != null ? compareNote : "history builds from today",
      spark: { data: folVals, color: "#2563ff" },
    },
    {
      id: "views", label: "Views", color: "green", Ico: Play,
      value: m.viewsAvail ? fmtNum(m.viewsCur) : null,
      delta: m.viewsDelta, note: compareNote,
      spark: { data: m.dayList.map((d) => d.views), color: "#10b981" },
    },
    {
      id: "eng", label: "Engagement", color: "purple", Ico: Activity,
      value: fmtNum(m.engCur), delta: m.engDelta, note: compareNote,
      spark: { data: engVals, color: "#8b5cf6" },
    },
    {
      id: "saves", label: "Saves", color: "amber", Ico: Bookmark,
      value: m.savesAvail ? fmtNum(m.savesCur) : null,
      delta: m.savesDelta, note: compareNote,
      spark: { data: m.dayList.map((d) => d.saves), color: "#f5b04c" },
    },
  ];

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
            value={["1", "7", "30", "90"].includes(rangeId) ? rangeId : "custom"}
            onChange={(e) => setRangeId(e.target.value)}
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="1">Today</option>
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
        {kpis.map(({ id, label, color, Ico, value, delta, note, spark }) => (
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
                <i className="an3-info" title="Likes + comments on content posted in this period (lifetime totals — Instagram's API has no per-day breakdown).">
                  <Info size={11} />
                </i>
              )}
            </span>
            {value != null ? (
              <>
                <b>{value}</b>
                <Delta pct={delta} note={note} />
                {spark && <Spark data={spark.data} color={spark.color} />}
              </>
            ) : (
              <>
                <b className="na">—</b>
                <span className="an3-kpi-na">Not provided by the connected account</span>
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
            <button
              key={c.id}
              type="button"
              className={rangeId === c.id ? "on" : ""}
              onClick={() => setRangeId(c.id)}
            >
              {c.label}
            </button>
          ))}
        </span>
      </div>

      {/* one metric → one chart → one story */}
      <div className="an3-chartwrap">
        {metric !== "followers" && !S.avail ? (
          <div className="an3-unavailable">
            {insightsOk === false ? (
              <>
                <b>Reconnect Instagram to enable {metricLabel.toLowerCase()}.</b>
                <p>
                  Your stored connection predates full analytics permissions.{" "}
                  <a href="/settings#accounts">Reconnect in Settings</a> and this chart lights up
                  on the next sync.
                </p>
              </>
            ) : (
              <>
                <b>Instagram didn&apos;t provide {metricLabel.toLowerCase()} for these posts.</b>
                <p>
                  SOCIA shows only verified numbers. If {metricLabel.toLowerCase()} arrive with a
                  future sync, this chart fills in automatically — try Sync now in Settings.
                </p>
              </>
            )}
          </div>
        ) : metric === "followers" ? (
          fol.length >= 2 ? (
            <>
              <div className="an3-hero">
                <div><b>{followers != null ? followers.toLocaleString("en-US") : "–"}</b><small>Total followers</small></div>
                {m.folNet != null && (
                  <div><b>{m.folNet >= 0 ? "+" : ""}{m.folNet.toLocaleString("en-US")}</b><small>Net change</small></div>
                )}
                {m.folDelta != null && (
                  <div><b className={m.folDelta >= 0 ? "up" : "down"}>{m.folDelta >= 0 ? "↑" : "↓"} {Math.abs(m.folDelta).toFixed(1)}%</b><small>{compareNote}</small></div>
                )}
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="an3-chart"
                role="img"
                aria-label="Total followers over time"
                onPointerMove={onMoveFol}
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
                <path d={`M${xF(0)},${padT + plotH} ${fol.map((f, i) => `L${xF(i)},${yF(f.followers)}`).join(" ")} L${xF(fol.length - 1)},${padT + plotH} Z`} fill="rgba(37,99,255,0.08)" />
                <polyline points={fol.map((f, i) => `${xF(i)},${yF(f.followers)}`).join(" ")} className="an3-line blue an3-draw" fill="none" />
                {fol.map((f, i) => (
                  <circle key={f.day} cx={xF(i)} cy={yF(f.followers)} r="3" className="an3-dot blue" />
                ))}
                {hover != null && hoverSnap && (
                  <line x1={xF(hover)} y1={padT} x2={xF(hover)} y2={padT + plotH} className="an3-cross" />
                )}
              </svg>
              {hoverSnap && (
                <div className="an3-tip" style={{ left: `${Math.min(84, Math.max(6, (xF(hover!) / W) * 100))}%` }}>
                  <b>{new Date(hoverSnap.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                  <div><span>Followers</span><em>{hoverSnap.followers.toLocaleString("en-US")}</em></div>
                  {hover! > 0 && (
                    <>
                      <div><span>Net change</span><em>{(hoverSnap.followers - fol[hover! - 1].followers >= 0 ? "+" : "") + (hoverSnap.followers - fol[hover! - 1].followers).toLocaleString("en-US")}</em></div>
                      {fol[hover! - 1].followers > 0 && (
                        <div><span>vs previous day</span><em>{(((hoverSnap.followers - fol[hover! - 1].followers) / fol[hover! - 1].followers) * 100).toFixed(2)}%</em></div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="an3-unavailable">
              <b>
                {followers != null ? `${followers.toLocaleString("en-US")} followers · ` : ""}history
                started today
              </b>
              <p>
                Follower history will appear here as SOCIA collects real daily snapshots — it never
                draws history it didn&apos;t observe. Check back in a few days.
              </p>
            </div>
          )
        ) : empty ? (
          <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>
        ) : (
          <>
            <div className="an3-hero">
              <div><b>{fmtNum(S.total)}</b><small>Total {S.label.toLowerCase()}</small></div>
              <div><b>{m.postCount}</b><small>Posts published</small></div>
              {S.delta != null && (
                <div><b className={S.delta >= 0 ? "up" : "down"}>{S.delta >= 0 ? "↑" : "↓"} {Math.abs(S.delta).toFixed(1)}%</b><small>{compareNote}</small></div>
              )}
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="an3-chart"
              role="img"
              aria-label={`${S.label} on content posted, by day`}
              onPointerMove={onMoveEng}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                {sSpikes.map((i) => (
                  <clipPath id={`an3clip${i}`} key={i}>
                    <rect x={x(i) - 14} y={4} width={28} height={28} rx={7} />
                  </clipPath>
                ))}
              </defs>
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
              ))}
              {[maxV, maxV / 2].map((v) => (
                <text key={v} x={padL - 8} y={yV(v) + 3} className="an3-axis" textAnchor="end">{fmtNum(v)}</text>
              ))}
              {xTicks.map((i) => (
                <text key={i} x={x(i)} y={H - 6} className="an3-axis" textAnchor="middle">
                  {shortDate(m.dayList[i].date)}
                </text>
              ))}
              <path d={`M${x(0)},${padT + plotH} ${sVals.map((v, i) => `L${x(i)},${yV(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} Z`} fill={S.fill} />
              <polyline points={sVals.map((v, i) => `${x(i)},${yV(v)}`).join(" ")} className={`an3-line ${S.cls} an3-draw`} fill="none" />
              {/* content markers: thumbnail above, dotted guide down to the point */}
              {sSpikes.map((i) => {
                const d = m.dayList[i];
                const post = d.posts[0];
                const g = (
                  <g key={i} className="an3-mark">
                    <line x1={x(i)} y1={34} x2={x(i)} y2={yV(S.get(d))} className="an3-mark-line" />
                    <circle cx={x(i)} cy={yV(S.get(d))} r="4" className={`an3-dot ${S.cls}`} />
                    {post?.thumb && (
                      <image
                        href={post.thumb}
                        x={x(i) - 14}
                        y={4}
                        width={28}
                        height={28}
                        clipPath={`url(#an3clip${i})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    )}
                  </g>
                );
                return post?.permalink ? (
                  <a key={i} href={post.permalink} target="_blank" rel="noreferrer" aria-label="Open the post published near this spike">
                    {g}
                  </a>
                ) : (
                  g
                );
              })}
              {hover != null && (
                <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="an3-cross" />
              )}
            </svg>
            {hoverDay && (
              <div className="an3-tip" style={{ left: `${Math.min(84, Math.max(6, (x(hover!) / W) * 100))}%` }}>
                <b>{hoverDay.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                <div><span>Engagement</span><em>{hoverDay.eng.toLocaleString("en-US")}</em></div>
                <div><span>Likes</span><em>{hoverDay.likes.toLocaleString("en-US")}</em></div>
                <div><span>Comments</span><em>{hoverDay.comments.toLocaleString("en-US")}</em></div>
                {m.viewsAvail && (
                  <div><span>Views</span><em>{hoverDay.views.toLocaleString("en-US")}</em></div>
                )}
                {m.savesAvail && (
                  <div><span>Saves</span><em>{hoverDay.saves.toLocaleString("en-US")}</em></div>
                )}
                <div><span>Posts published</span><em>{hoverDay.posts.length}</em></div>
                {hoverSpikePost && (
                  <div className="an3-tip-spike">
                    {hoverSpikePost.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hoverSpikePost.thumb} alt="" width={34} height={34} />
                    )}
                    <span>
                      <small>Published near this spike</small>
                      <p>{hoverSpikePost.caption.split("\n")[0].slice(0, 44) || "(no caption)"}</p>
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
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
                      <em title={`vs the median post of this period (${m.postCount} posts)`}>
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
          <small className="an3-card-label">Growth insights · vs previous {m.days} days</small>
          <ul className="an3-rows">
            <li className={metric === "followers" ? "hot" : ""}>
              <span><Users size={12} /> Followers</span>
              <em className={m.folDelta == null ? "flat" : m.folDelta >= 0 ? "up" : "down"}>
                {m.folDelta == null
                  ? "history builds from today"
                  : `${m.folNet != null ? `${m.folNet >= 0 ? "+" : ""}${m.folNet.toLocaleString("en-US")} · ` : ""}${m.folDelta >= 0 ? "↑" : "↓"} ${Math.abs(m.folDelta).toFixed(1)}%`}
              </em>
            </li>
            <li className={metric === "views" ? "hot" : ""}>
              <span><Play size={12} /> Views</span>
              <em className={m.viewsDelta == null ? "flat" : m.viewsDelta >= 0 ? "up" : "down"}>
                {!m.viewsAvail
                  ? "not provided"
                  : m.viewsDelta == null
                    ? `+${fmtNum(m.viewsCur)}`
                    : `+${fmtNum(m.viewsCur)} · ${m.viewsDelta >= 0 ? "↑" : "↓"} ${Math.abs(m.viewsDelta).toFixed(1)}%`}
              </em>
            </li>
            <li className={metric === "eng" ? "hot" : ""}>
              <span><Activity size={12} /> Engagement</span>
              <em className={m.engDelta == null ? "flat" : m.engDelta >= 0 ? "up" : "down"}>
                {m.engDelta == null
                  ? "no earlier period"
                  : `+${fmtNum(m.engCur)} · ${m.engDelta >= 0 ? "↑" : "↓"} ${Math.abs(m.engDelta).toFixed(1)}%`}
              </em>
            </li>
            <li className={metric === "saves" ? "hot" : ""}>
              <span><Bookmark size={12} /> Saves</span>
              <em className={m.savesDelta == null ? "flat" : m.savesDelta >= 0 ? "up" : "down"}>
                {!m.savesAvail
                  ? "not provided"
                  : m.savesDelta == null
                    ? `+${fmtNum(m.savesCur)}`
                    : `+${fmtNum(m.savesCur)} · ${m.savesDelta >= 0 ? "↑" : "↓"} ${Math.abs(m.savesDelta).toFixed(1)}%`}
              </em>
            </li>
            <li>
              <span><Heart size={12} /> Likes / <MessageCircle size={12} /> Comments</span>
              <em className="flat">{fmtNum(m.likesCur)} / {fmtNum(m.comCur)}</em>
            </li>
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
        <Info size={11} /> Engagement, views and saves are attributed to the day content was posted
        (lifetime totals from Instagram Insights). Times shown in your device&apos;s time zone.
      </p>
    </section>
  );
}

// Templated strictly from the computed numbers above — no freeform claims.
function Summary({ m }: { m: { engDelta: number | null; postCount: number; prevCount: number; days: number; topShare: number | null; top: PerfPost | null; folNet: number | null; folDelta: number | null } }) {
  if (!m.postCount && m.folNet == null) {
    return <p className="an3-card-empty">Nothing to summarize — no posts or follower history in this period yet.</p>;
  }
  const head =
    m.engDelta == null ? "First measurable period"
    : m.engDelta >= 15 ? "Strong momentum"
    : m.engDelta <= -15 ? "Cooling off"
    : "Steady";
  const bits: string[] = [];
  if (m.folNet != null && m.folDelta != null) {
    bits.push(
      `You ${m.folNet >= 0 ? "gained" : "lost"} ${Math.abs(m.folNet).toLocaleString("en-US")} followers (${m.folDelta >= 0 ? "+" : ""}${m.folDelta.toFixed(1)}%).`
    );
  }
  if (m.engDelta != null) {
    bits.push(
      `Engagement on new content is ${m.engDelta >= 0 ? "up" : "down"} ${Math.abs(m.engDelta).toFixed(0)}% vs the previous ${m.days} days (${m.postCount} vs ${m.prevCount} posts).`
    );
  } else if (m.postCount) {
    bits.push(`${m.postCount} post${m.postCount === 1 ? "" : "s"} in this period, with no earlier period to compare yet.`);
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
