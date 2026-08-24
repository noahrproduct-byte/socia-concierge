"use client";

// SOCIA dashboard workspace. All interaction (metric switching, range,
// table sorting, chart hover) lives here; every value is supplied by the
// server from lib/dashboardMetrics, so nothing is computed twice.
//
// Honesty rules carried over from the data audit:
//  - a metric renders as a time series ONLY when a real daily series exists
//  - post-level totals are never plotted against a date axis
//  - missing data shows "—" / an explanation, never 0

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Info,
  ChevronUp,
  ChevronDown,
  Users,
  Activity,
  Heart,
  Percent,
  FileText,
  ShieldCheck,
} from "lucide-react";

const METRIC_ICON: Record<string, typeof Users> = {
  followers: Users,
  reach: Activity,
  engagements: Heart,
  engrate: Percent,
  posts: FileText,
};

export type DashPost = {
  id: string;
  caption: string;
  published: string;
  format: string;
  views: number | null;
  reach: number | null;
  engagements: number;
  engRate: number | null;
  multiplier: number | null;
  thumb: string | null;
  permalink: string | null;
};

export type DashDaily = {
  day: string;
  followers: number | null;
  followersGained: number | null;
  reach: number | null;
  views: number | null;
  posts: number;
};

export type DashMetric = {
  key: string;
  label: string;
  value: string;
  raw: number | null;
  delta: string | null;
  deltaPct: string | null;
  positive: boolean;
  note: string;
  spark: number[];
  tooltip: string;
};

export type DashInsight = { title: string; body: string; multiplier: string | null; thumb: string | null };

type SeriesMode = "daily" | "unavailable";
type MetricKey = "followers" | "reach" | "views" | "engagement" | "posts";

const RANGES = [
  { id: "7", label: "7D" },
  { id: "30", label: "30D" },
  { id: "90", label: "90D" },
  { id: "180", label: "6M" },
  { id: "365", label: "1Y" },
  { id: "all", label: "All" },
] as const;

const fmtNum = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : String(Math.round(n));

const shortDate = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export default function DashboardClient({
  metrics,
  daily,
  posts,
  insight,
  range,
  rangeBase,
  followersNow,
  historyStart,
}: {
  metrics: DashMetric[];
  daily: DashDaily[];
  posts: DashPost[];
  insight: DashInsight | null;
  range: string;
  /** Base path the range links point at, e.g. "/dashboard". */
  rangeBase: string;
  followersNow: number | null;
  historyStart: string | null;
}) {
  const [metric, setMetric] = useState<MetricKey>("reach");
  const [hover, setHover] = useState<number | null>(null);
  const [showCompare, setShowCompare] = useState(true);
  const [sort, setSort] = useState<{ col: keyof DashPost; dir: 1 | -1 }>({
    col: "engagements",
    dir: -1,
  });

  // Which series can honestly be drawn for the selected metric?
  const series = useMemo(() => {
    const pick = (f: (d: DashDaily) => number | null) =>
      daily.map((d) => ({ day: d.day, v: f(d) })).filter((p) => p.v != null) as { day: string; v: number }[];
    switch (metric) {
      case "followers": {
        const exact = pick((d) => d.followers);
        if (exact.length >= 3) return { rows: exact, mode: "daily" as SeriesMode, label: "Followers", exact: true };
        const gains = pick((d) => d.followersGained);
        return { rows: gains, mode: (gains.length >= 3 ? "daily" : "unavailable") as SeriesMode, label: "New followers", exact: false };
      }
      case "reach": {
        const r = pick((d) => d.reach);
        return { rows: r, mode: (r.length >= 3 ? "daily" : "unavailable") as SeriesMode, label: "Accounts reached", exact: true };
      }
      case "views": {
        const v = pick((d) => d.views);
        return { rows: v, mode: (v.length >= 3 ? "daily" : "unavailable") as SeriesMode, label: "Views", exact: true };
      }
      case "posts":
        return {
          rows: daily.map((d) => ({ day: d.day, v: d.posts })),
          mode: "daily" as SeriesMode,
          label: "Posts published",
          exact: true,
        };
      default: {
        // Engagement has no daily series from Instagram — post totals only.
        return { rows: [], mode: "unavailable" as SeriesMode, label: "Engagement", exact: false };
      }
    }
  }, [metric, daily]);

  const sorted = useMemo(() => {
    const dir = sort.dir;
    return [...posts].sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [posts, sort]);

  function toggleSort(col: keyof DashPost) {
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: -1 }));
  }

  // Chart geometry
  const W = 860, H = 260, padL = 52, padR = 18, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const rows = series.rows;
  const n = rows.length;
  const vals = rows.map((r) => r.v);
  const rawMax = n ? Math.max(...vals) : 1;
  const rawMin = n ? Math.min(...vals) : 0;
  const zeroBased = metric !== "followers" || !series.exact;
  const top = zeroBased ? rawMax * 1.1 || 1 : rawMax + (rawMax - rawMin) * 0.2 || 1;
  const bottom = zeroBased ? 0 : rawMin - (rawMax - rawMin) * 0.2;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => padT + (1 - (v - bottom) / Math.max(1, top - bottom)) * plotH;

  // Posts published on each charted day, for timeline markers.
  const markers = useMemo(() => {
    if (!n) return [];
    const byDay = new Map<string, DashPost[]>();
    for (const p of posts) {
      const d = p.published.slice(0, 10);
      byDay.set(d, [...(byDay.get(d) ?? []), p]);
    }
    return rows
      .map((r, i) => ({ i, day: r.day, items: byDay.get(r.day) ?? [] }))
      .filter((m) => m.items.length > 0);
  }, [rows, posts, n]);

  // Previous equal-length period, drawn as a dashed comparison line when the
  // history genuinely covers it (never extrapolated).
  const compare = useMemo(() => {
    if (!n || metric === "posts") return null;
    const first = rows[0].day;
    const idx = daily.findIndex((d) => d.day === first);
    if (idx < n) return null; // not enough earlier history
    const prev = daily.slice(idx - n, idx);
    const pick = (d: DashDaily) =>
      metric === "reach" ? d.reach : metric === "views" ? d.views
      : metric === "followers" ? (d.followers ?? d.followersGained) : null;
    const vs = prev.map(pick).filter((v) => v != null) as number[];
    if (vs.length < n * 0.6) return null;
    return { vals: vs, label: `${shortDate(prev[0].day)} – ${shortDate(prev[prev.length - 1].day)}` };
  }, [rows, daily, metric, n]);

  const hoverRow = hover != null ? rows[hover] : null;
  const hoverPrev = hover != null && hover > 0 ? rows[hover - 1] : null;
  const hoverMarker = hover != null ? markers.find((m) => m.i === hover) : undefined;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (n < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / plotW) * (n - 1)))));
  }

  const total = vals.reduce((a, b) => a + b, 0);
  const summary =
    series.mode !== "daily" || !n
      ? null
      : metric === "followers" && series.exact
        ? `You gained ${(vals[n - 1] - vals[0]).toLocaleString("en-US")} followers across ${n} recorded days.`
        : metric === "followers"
          ? `Instagram recorded ${total.toLocaleString("en-US")} new followers across ${n} days (unfollows aren't published).`
          : metric === "posts"
            ? `${total} post${total === 1 ? "" : "s"} published in this period.`
            : `${fmtNum(total)} total ${series.label.toLowerCase()} across ${n} days · ${fmtNum(Math.round(total / n))} per day on average.`;

  const COLS: { key: keyof DashPost; label: string; num?: boolean }[] = [
    { key: "caption", label: "Content" },
    { key: "published", label: "Published" },
    { key: "format", label: "Format" },
    { key: "views", label: "Views", num: true },
    { key: "reach", label: "Reach", num: true },
    { key: "engagements", label: "Engagements", num: true },
    { key: "engRate", label: "Eng. / reach", num: true },
    { key: "multiplier", label: "vs baseline", num: true },
  ];

  return (
    <>
      {/* metrics strip */}
      <div className="dsh-strip">
        {metrics.map((m) => {
          const Ico = METRIC_ICON[m.key] ?? Users;
          return (
          <div className="dsh-metric" key={m.key}>
            <div className="dsh-metric-label">
              <span className={`dsh-metric-ico ${m.key}`}><Ico size={13} /></span>
              {m.label}
              <span className="dsh-metric-info" title={m.tooltip}><Info size={11} /></span>
            </div>
            <div className="dsh-metric-value">{m.value}</div>
            <div className="dsh-metric-delta">
              {m.delta || m.deltaPct ? (
                <>
                  {m.delta && (
                    <em className={m.positive ? "up" : "down"}>
                      {m.positive ? "↑" : "↓"} {m.delta.replace(/^[+-]/, "")}
                    </em>
                  )}
                  {m.deltaPct && <em className={m.positive ? "up" : "down"}>{m.deltaPct}</em>}
                </>
              ) : null}
            </div>
            <div className="dsh-metric-note">{m.note}</div>
            {m.spark.length >= 3 && <Spark data={m.spark} up={m.positive} />}
          </div>
          );
        })}
      </div>

      <div className="dsh-main">
        {/* performance */}
        <section className="dsh-panel dsh-perf">
          <div className="dsh-panel-head">
            <h2>Performance</h2>
            <div className="dsh-ranges">
              {RANGES.map((r) => (
                <Link key={r.id} href={`${rangeBase}?range=${r.id}`} className={range === r.id ? "on" : ""} scroll={false}>
                  {r.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="dsh-tabrow">
            <div className="dsh-tabs" role="tablist">
            {(
              [
                ["followers", "Followers"],
                ["reach", "Reach"],
                ["views", "Views"],
                ["engagement", "Engagement"],
                ["posts", "Posts"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={metric === k}
                className={metric === k ? "on" : ""}
                onClick={() => { setMetric(k); setHover(null); }}
              >
                {label}
              </button>
              ))}
            </div>
            {compare && (
              <select
                className="dsh-compare"
                value={showCompare ? "prev" : "none"}
                onChange={(e) => setShowCompare(e.target.value === "prev")}
                aria-label="Comparison period"
              >
                <option value="prev">Compare: {compare.label}</option>
                <option value="none">No comparison</option>
              </select>
            )}
          </div>

          {series.mode === "daily" && n >= 3 ? (
            <div className="dsh-chartwrap">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="dsh-chart"
                role="img"
                aria-label={`${series.label} over time`}
                onPointerMove={onMove}
                onPointerLeave={() => setHover(null)}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const gy = padT + t * plotH;
                  const val = top - t * (top - bottom);
                  return (
                    <g key={t}>
                      <line x1={padL} y1={gy} x2={W - padR} y2={gy} className="dsh-grid" />
                      <text x={padL - 10} y={gy + 4} className="dsh-axis" textAnchor="end">
                        {fmtNum(Math.round(val))}
                      </text>
                    </g>
                  );
                })}
                {rows.map((r, i) =>
                  i % Math.max(1, Math.ceil(n / 7)) === 0 || i === n - 1 ? (
                    <text key={i} x={x(i)} y={H - 8} className="dsh-axis" textAnchor="middle">
                      {shortDate(r.day)}
                    </text>
                  ) : null,
                )}
                <path
                  d={`M${x(0)},${padT + plotH} ${vals.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} Z`}
                  className="dsh-area"
                />
                {compare && showCompare && (
                  <polyline
                    points={compare.vals.map((v, i) => `${x(Math.round((i / Math.max(1, compare.vals.length - 1)) * (n - 1)))},${y(v)}`).join(" ")}
                    className="dsh-line-compare"
                    fill="none"
                  />
                )}
                <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} className="dsh-line" fill="none" />
                {n <= 60 && vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" className="dsh-dot" />)}
                {markers.map((mk) => (
                  <g key={mk.i} className="dsh-marker">
                    <line x1={x(mk.i)} y1={padT} x2={x(mk.i)} y2={padT + plotH} className="dsh-marker-line" />
                    <rect x={x(mk.i) - 6} y={padT + plotH + 2} width={12} height={12} rx={3} className="dsh-marker-chip" />
                  </g>
                ))}
                {hover != null && (
                  <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="dsh-cross" />
                )}
                {hoverRow && <circle cx={x(hover!)} cy={y(hoverRow.v)} r="4.5" className="dsh-dot-active" />}
              </svg>

              {hoverRow && (
                <div
                  className="dsh-tip"
                  style={{ left: `${Math.min(78, Math.max(4, (x(hover!) / W) * 100))}%` }}
                >
                  <b>{shortDate(hoverRow.day)}</b>
                  <div><span>{series.label}</span><em>{hoverRow.v.toLocaleString("en-US")}</em></div>
                  {hoverPrev && (
                    <div>
                      <span>Change</span>
                      <em className={hoverRow.v >= hoverPrev.v ? "up" : "down"}>
                        {hoverRow.v - hoverPrev.v >= 0 ? "+" : ""}
                        {(hoverRow.v - hoverPrev.v).toLocaleString("en-US")}
                      </em>
                    </div>
                  )}
                  {hoverMarker && (
                    <div className="dsh-tip-post">
                      {hoverMarker.items[0].thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hoverMarker.items[0].thumb} alt="" width={30} height={30} />
                      )}
                      <span>
                        <b>{hoverMarker.items[0].caption.slice(0, 34) || "(no caption)"}</b>
                        <small>
                          {hoverMarker.items[0].format} · published this day
                          {hoverMarker.items[0].views != null && ` · ${fmtNum(hoverMarker.items[0].views)} views`}
                        </small>
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="dsh-legend">
                <span><i className="solid" /> {shortDate(rows[0].day)} – {shortDate(rows[n - 1].day)}</span>
                {compare && showCompare && <span><i className="dashed" /> {compare.label}</span>}
              </div>
            </div>
          ) : (
            <div className="dsh-nodata">
              {metric === "engagement" ? (
                <>
                  <b>Instagram doesn&apos;t report engagement per day.</b>
                  <p>
                    It returns each post&apos;s current total instead, so SOCIA shows engagement per
                    post in the table below rather than inventing a daily curve.
                  </p>
                </>
              ) : metric === "views" ? (
                <>
                  <b>Daily view history is still collecting.</b>
                  <p>
                    Instagram provides no per-day views series; SOCIA records the daily total on each
                    sync{historyStart ? ` (since ${historyStart})` : ""}. Per-post views are in the table below.
                  </p>
                </>
              ) : (
                <>
                  <b>
                    {followersNow != null && metric === "followers"
                      ? `${followersNow.toLocaleString("en-US")} followers · history collecting`
                      : "History collecting"}
                    {historyStart ? ` since ${historyStart}` : ""}
                  </b>
                  <p>SOCIA builds this from real daily snapshots. Nothing is drawn until the data exists.</p>
                </>
              )}
            </div>
          )}

          {summary && (
            <div className="dsh-summary">
              <span className="dsh-summary-ico"><ArrowUpRight size={14} /></span>
              <p>{summary}</p>
              <Link href="/analytics" className="dsh-link">
                View full breakdown <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </section>

        {/* right rail */}
        <div className="dsh-rail">
          <section className="dsh-panel">
            <div className="dsh-panel-head">
              <h2>Top performing content</h2>
              <Link href="/analytics" className="dsh-link">View all</Link>
            </div>
            {posts.length ? (
              <ol className="dsh-top">
                {[...posts]
                  .sort((a, b) => b.engagements - a.engagements)
                  .slice(0, 4)
                  .map((p, i) => (
                    <li key={p.id}>
                      <span className="dsh-top-rank">{String(i + 1).padStart(2, "0")}</span>
                      {p.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="dsh-top-thumb" src={p.thumb} alt="" width={44} height={44} loading="lazy" />
                      ) : (
                        <span className="dsh-top-thumb ph" aria-hidden />
                      )}
                      <span className="dsh-top-meta">
                        <b>{p.caption.slice(0, 30) || "(no caption)"}</b>
                        <small>{p.format} · {shortDate(p.published)}</small>
                      </span>
                      <span className="dsh-top-nums">
                        {p.views != null && (
                          <span className="dsh-top-stat"><b>{fmtNum(p.views)}</b><small>Views</small></span>
                        )}
                        <span className="dsh-top-stat">
                          <b>{p.engagements.toLocaleString("en-US")}</b>
                          <small>Engagements</small>
                        </span>
                        {p.multiplier != null && (
                          <em
                            className={p.multiplier >= 1 ? "up" : "down"}
                            title="This post's engagement ÷ your average post engagement"
                          >
                            {p.multiplier >= 1 ? "↑" : "↓"} {p.multiplier.toFixed(1)}×
                            <small>vs baseline</small>
                          </em>
                        )}
                      </span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="dsh-empty">No posts synced yet.</p>
            )}
          </section>

          {insight && (
            <section className="dsh-panel">
              <div className="dsh-panel-head">
                <h2>Insight</h2>
              </div>
              <div className="dsh-insight">
                <div>
                  <b>{insight.title}</b>
                  <p>
                    {insight.multiplier && <strong>{insight.multiplier}</strong>} {insight.body}
                  </p>
                  <Link href="/chat" className="dsh-link">
                    See full strategy <ArrowRight size={12} />
                  </Link>
                </div>
                {insight.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={insight.thumb} alt="" width={72} height={72} />
                )}
              </div>
            </section>
          )}

          <section className="dsh-panel">
            <div className="dsh-panel-head">
              <h2>Upcoming content</h2>
              <Link href="/calendar" className="dsh-link">View calendar</Link>
            </div>
            <div className="dsh-upcoming-empty">
              <span className="dsh-upcoming-ico"><Calendar size={18} /></span>
              <b>Nothing scheduled.</b>
              <small>SOCIA lists only real scheduled posts here.</small>
              <Link href="/tool" className="dsh-cta">
                Create content <ArrowRight size={12} />
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* recent content table */}
      <section className="dsh-panel dsh-tablewrap">
        <div className="dsh-panel-head">
          <h2>Recent content performance</h2>
          <Link href="/analytics" className="dsh-link">View all content</Link>
        </div>
        {posts.length ? (
          <div className="dsh-tablescroll">
            <table className="dsh-table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={String(c.key)}
                      title={
                        c.key === "engRate"
                          ? "Engagements ÷ that post's reach × 100 (the strip's account rate divides by followers instead)"
                          : c.key === "multiplier"
                            ? "This post's engagement ÷ your average post engagement"
                            : undefined
                      }
                      className={c.num ? "num" : ""}
                      onClick={() => toggleSort(c.key)}
                      aria-sort={sort.col === c.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
                    >
                      {c.label}
                      {sort.col === c.key && (sort.dir === -1 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} onClick={() => p.permalink && window.open(p.permalink, "_blank")}>
                    <td>
                      <span className="dsh-cell-content">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" width={32} height={32} loading="lazy" />
                        ) : (
                          <span className="dsh-top-thumb ph" aria-hidden />
                        )}
                        <b>{p.caption.slice(0, 40) || "(no caption)"}</b>
                      </span>
                    </td>
                    <td className="muted">
                      {new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {", "}
                      {new Date(p.published).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="muted">{p.format}</td>
                    <td className="num">{p.views != null ? fmtNum(p.views) : "—"}</td>
                    <td className="num">{p.reach != null ? fmtNum(p.reach) : "—"}</td>
                    <td className="num">{p.engagements.toLocaleString("en-US")}</td>
                    <td className="num">{p.engRate != null ? p.engRate.toFixed(1) + "%" : "—"}</td>
                    <td className="num">
                      {p.multiplier != null ? (
                        <span className={p.multiplier >= 1 ? "up" : "down"}>
                          {p.multiplier >= 1 ? "↑" : "↓"} {p.multiplier.toFixed(1)}×
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dsh-empty">Connect your account to see per-post performance.</p>
        )}
      </section>

      <p className="dsh-trust">
        <ShieldCheck size={13} /> All analytics come straight from your connected account. No
        estimates — anything SOCIA can&apos;t verify shows as &quot;—&quot;.
      </p>
    </>
  );
}

function Spark({ data, up }: { data: number[]; up: boolean }) {
  const W = 150, H = 30;
  const mx = Math.max(...data);
  const mn = Math.min(...data);
  const span = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 3 - ((v - mn) / span) * (H - 8)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dsh-spark" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={up ? "#16a34a" : "#dc2626"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
