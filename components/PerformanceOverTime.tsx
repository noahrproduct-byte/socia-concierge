"use client";

// Performance over time — the analytics centerpiece. Every number is computed
// client-side (in the viewer's own time zone) from real synced posts and real
// daily follower snapshots. Honesty rules:
// - views/saves aren't provided by the Instagram Login API → never shown
// - follower change appears only once real snapshots span the period
// - a day's "engagement" is the lifetime likes+comments of content POSTED
//   that day (the API has no per-day breakdown) — tooltips say so
// - period comparisons always use the equivalent preceding window

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Activity,
  Heart,
  MessageCircle,
  ExternalLink,
  ArrowRight,
  Flame,
  Info,
} from "lucide-react";
import { median, pctChange, fmtMult } from "@/lib/metrics";

export type PerfPost = {
  t: string;
  likes: number;
  comments: number;
  type: string;
  caption: string;
  thumb: string | null;
  permalink: string | null;
};
export type FollowerSnap = { day: string; followers: number };

const DAY_MS = 86400000;
const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
] as const;

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
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - (v / mx) * (H - 5)}`)
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
}: {
  posts: PerfPost[];
  followers: number | null;
  snaps: FollowerSnap[];
}) {
  // Date math waits for mount so SSR (UTC) and the browser never disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [rangeId, setRangeId] = useState<string>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [metric, setMetric] = useState<"eng" | "lc" | "followers">("eng");
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!now) return null;
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // exclusive
    let days: number = RANGES.find((r) => r.id === rangeId)?.days ?? 30;
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
      dayList.push({ date, eng: 0, likes: 0, comments: 0, posts: [] });
    }
    for (const p of cur) {
      const i = idx.get(dayKey(new Date(p.t)));
      if (i == null) continue;
      dayList[i].eng += p.likes + p.comments;
      dayList[i].likes += p.likes;
      dayList[i].comments += p.comments;
      dayList[i].posts.push(p);
    }

    const sum = (xs: PerfPost[], f: (p: PerfPost) => number) => xs.reduce((a, p) => a + f(p), 0);
    const engCur = sum(cur, (p) => p.likes + p.comments);
    const engPrev = prev.length ? sum(prev, (p) => p.likes + p.comments) : null;
    const likesCur = sum(cur, (p) => p.likes);
    const likesPrev = prev.length ? sum(prev, (p) => p.likes) : null;
    const comCur = sum(cur, (p) => p.comments);
    const comPrev = prev.length ? sum(prev, (p) => p.comments) : null;

    // Spike days: ≥2× the median of active days, with at least one post.
    const active = dayList.filter((d) => d.eng > 0).map((d) => d.eng);
    const dayMed = median(active);
    const spikes = new Set<number>();
    if (dayMed != null && active.length >= 3) {
      dayList.forEach((d, i) => {
        if (d.posts.length && d.eng >= dayMed * 2) spikes.add(i);
      });
    }

    // Follower baseline: last snapshot on/before the window start.
    const startStr = start.toISOString().slice(0, 10);
    const before = snaps.filter((s) => s.day <= startStr);
    const baseline = before.length ? before[before.length - 1].followers : null;
    const folDelta = followers != null && baseline != null ? pctChange(followers, baseline) : null;
    const folSeries = snaps
      .filter((s) => s.day > startStr)
      .map((s) => ({ day: s.day, v: s.followers }));

    // Top post of the window vs the window's per-post median.
    const postMed = median(cur.map((p) => p.likes + p.comments));
    const top = cur.length
      ? [...cur].sort((a, b) => b.likes + b.comments - (a.likes + a.comments))[0]
      : null;
    const topMult =
      top && postMed && postMed > 0 ? (top.likes + top.comments) / postMed : null;
    const topShare = top && engCur > 0 ? Math.round(((top.likes + top.comments) / engCur) * 100) : null;

    return {
      start, end, days, dayList, spikes,
      engCur, likesCur, comCur, postCount: cur.length, prevCount: prev.length,
      engDelta: pctChange(engCur, engPrev),
      likesDelta: pctChange(likesCur, likesPrev),
      comDelta: pctChange(comCur, comPrev),
      folDelta, folSeries, baseline,
      top, topMult, topShare, dayMed,
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

  // ---- chart geometry ----
  const W = 920, H = 250, padL = 46, padR = metric === "lc" ? 46 : 14, padT = 14, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = m.dayList.length;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);

  const primary = m.dayList.map((d) => (metric === "lc" ? d.likes : d.eng));
  const secondary = metric === "lc" ? m.dayList.map((d) => d.comments) : null;
  const maxP = niceCeil(Math.max(...primary, 1));
  const maxS = secondary ? niceCeil(Math.max(...secondary, 1)) : null;
  const yP = (v: number) => padT + (1 - v / maxP) * plotH;
  const yS = (v: number) => padT + (1 - v / (maxS ?? 1)) * plotH;
  const line = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = (vals: number[], y: (v: number) => number) =>
    `M${x(0)},${padT + plotH} ${vals.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} Z`;
  const xTicks = Array.from({ length: Math.min(6, n) }, (_, k) =>
    Math.round((k / Math.max(1, Math.min(6, n) - 1)) * (n - 1))
  );

  // Followers view uses real snapshots inside the window.
  const fol = m.folSeries;
  const folVals = fol.map((f) => f.v);
  const folMin = folVals.length ? Math.min(...folVals) : 0;
  const folMax = folVals.length ? Math.max(...folVals) : 1;
  const folPad = Math.max(1, Math.round((folMax - folMin) * 0.25));
  const yF = (v: number) =>
    padT + (1 - (v - (folMin - folPad)) / (folMax + folPad - (folMin - folPad))) * plotH;
  const xF = (i: number) => padL + (fol.length > 1 ? (i / (fol.length - 1)) * plotW : plotW / 2);

  const hoverDay = hover != null ? m.dayList[hover] : null;
  const hoverSpikePost = hover != null && m.spikes.has(hover) ? m.dayList[hover].posts[0] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (metric === "followers") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const empty = m.postCount === 0;

  return (
    <section className="an3 db2-rise" style={{ animationDelay: "360ms" }}>
      {/* header */}
      <div className="an3-head">
        <div>
          <h3>Performance over time</h3>
          <p>See how your audience and content are growing.</p>
        </div>
        <div className="an3-controls">
          <select
            className="an3-select"
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value)}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
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

      {/* KPI cards */}
      <div className="an3-kpis">
        <div className="an3-kpi">
          <span className="an3-kpi-ico blue"><Users size={15} /></span>
          <span className="an3-kpi-label">Followers</span>
          <b>{followers != null ? followers.toLocaleString("en-US") : "–"}</b>
          <Delta
            pct={m.folDelta}
            note={m.folDelta != null ? compareNote : "history builds from today"}
          />
          <Spark data={folVals} color="#2563ff" />
        </div>
        <div className="an3-kpi">
          <span className="an3-kpi-ico purple"><Activity size={15} /></span>
          <span className="an3-kpi-label">
            Engagement{" "}
            <i className="an3-info" title="Likes + comments on content posted in this period (lifetime totals — Instagram's API has no per-day breakdown).">
              <Info size={11} />
            </i>
          </span>
          <b>{fmtNum(m.engCur)}</b>
          <Delta pct={m.engDelta} note={compareNote} />
          <Spark data={m.dayList.map((d) => d.eng)} color="#8b5cf6" />
        </div>
        <div className="an3-kpi">
          <span className="an3-kpi-ico rose"><Heart size={15} /></span>
          <span className="an3-kpi-label">Likes</span>
          <b>{fmtNum(m.likesCur)}</b>
          <Delta pct={m.likesDelta} note={compareNote} />
          <Spark data={m.dayList.map((d) => d.likes)} color="#f43f5e" />
        </div>
        <div className="an3-kpi">
          <span className="an3-kpi-ico amber"><MessageCircle size={15} /></span>
          <span className="an3-kpi-label">Comments</span>
          <b>{fmtNum(m.comCur)}</b>
          <Delta pct={m.comDelta} note={compareNote} />
          <Spark data={m.dayList.map((d) => d.comments)} color="#f5b04c" />
        </div>
      </div>
      <p className="an3-unavail">
        Views and saves aren&apos;t provided by Instagram&apos;s Login API — SOCIA never estimates
        them.
      </p>

      {/* metric tabs */}
      <div className="an3-tabs" role="tablist">
        {(
          [
            ["eng", "Engagement"],
            ["lc", "Likes vs Comments"],
            ["followers", "Followers"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={metric === id}
            className={metric === id ? "on" : ""}
            onClick={() => { setMetric(id); setHover(null); }}
          >
            {label}
          </button>
        ))}
        {metric === "lc" && (
          <span className="an3-legend">
            <i className="likes" /> Likes <i className="comments" /> Comments
          </span>
        )}
      </div>

      {/* chart */}
      <div className="an3-chartwrap">
        {metric === "followers" ? (
          fol.length >= 2 ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="an3-chart" role="img" aria-label="Follower count over time">
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
              ))}
              <text x={padL - 8} y={yF(folMax) + 3} className="an3-axis" textAnchor="end">{fmtNum(folMax)}</text>
              <text x={padL - 8} y={yF(folMin) + 3} className="an3-axis" textAnchor="end">{fmtNum(folMin)}</text>
              <path d={`M${xF(0)},${padT + plotH} ${fol.map((f, i) => `L${xF(i)},${yF(f.v)}`).join(" ")} L${xF(fol.length - 1)},${padT + plotH} Z`} fill="rgba(37,99,255,0.08)" />
              <polyline points={fol.map((f, i) => `${xF(i)},${yF(f.v)}`).join(" ")} className="an3-line blue an3-draw" fill="none" />
              {fol.map((f, i) => (
                <circle key={f.day} cx={xF(i)} cy={yF(f.v)} r="3" className="an3-dot">
                  <title>{`${f.day}: ${f.v.toLocaleString("en-US")} followers`}</title>
                </circle>
              ))}
            </svg>
          ) : (
            <p className="an3-empty">
              Follower history starts now — SOCIA records a real snapshot each day your data syncs.
              No history is ever reconstructed, so this chart fills in over the coming days.
              {followers != null && <> Today: <b>{followers.toLocaleString("en-US")}</b> followers.</>}
            </p>
          )
        ) : empty ? (
          <p className="an3-empty">No posts in this period — pick a longer range or keep posting.</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="an3-chart"
              role="img"
              aria-label="Engagement on content posted, by day"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} className="an3-grid" />
              ))}
              {[maxP, maxP / 2].map((v) => (
                <text key={v} x={padL - 8} y={yP(v) + 3} className="an3-axis" textAnchor="end">{fmtNum(v)}</text>
              ))}
              {secondary && [maxS!, maxS! / 2].map((v) => (
                <text key={v} x={W - padR + 8} y={yS(v) + 3} className="an3-axis purple" textAnchor="start">{fmtNum(v)}</text>
              ))}
              {xTicks.map((i) => (
                <text key={i} x={x(i)} y={H - 6} className="an3-axis" textAnchor="middle">
                  {shortDate(m.dayList[i].date)}
                </text>
              ))}
              <path d={area(primary, yP)} fill={metric === "lc" ? "rgba(244,63,94,0.06)" : "rgba(37,99,255,0.07)"} />
              <polyline points={line(primary, yP)} className={`an3-line ${metric === "lc" ? "rose" : "blue"} an3-draw`} fill="none" />
              {secondary && (
                <polyline points={line(secondary, yS)} className="an3-line purple an3-draw d2" fill="none" />
              )}
              {[...m.spikes].map((i) => {
                const d = m.dayList[i];
                const post = d.posts[0];
                const marker = (
                  <g key={i} className="an3-spike">
                    <circle cx={x(i)} cy={yP(metric === "lc" ? d.likes : d.eng)} r="4.5" />
                    <circle cx={x(i)} cy={yP(metric === "lc" ? d.likes : d.eng)} r="8" className="ring" />
                  </g>
                );
                return post?.permalink ? (
                  <a key={i} href={post.permalink} target="_blank" rel="noreferrer" aria-label="Open the post behind this spike">
                    {marker}
                  </a>
                ) : (
                  marker
                );
              })}
              {hover != null && (
                <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="an3-cross" />
              )}
            </svg>

            {hoverDay && (
              <div
                className="an3-tip"
                style={{
                  left: `${Math.min(84, Math.max(4, (x(hover!) / W) * 100))}%`,
                }}
              >
                <b>{hoverDay.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
                <div><span>Engagement</span><em>{hoverDay.eng.toLocaleString("en-US")}</em></div>
                <div><span>Likes</span><em>{hoverDay.likes.toLocaleString("en-US")}</em></div>
                <div><span>Comments</span><em>{hoverDay.comments.toLocaleString("en-US")}</em></div>
                <div><span>Posts published</span><em>{hoverDay.posts.length}</em></div>
                {hoverSpikePost && (
                  <div className="an3-tip-spike">
                    {hoverSpikePost.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hoverSpikePost.thumb} alt="" width={34} height={34} />
                    )}
                    <span>
                      <small><Flame size={10} /> Performance spike</small>
                      <p>{hoverSpikePost.caption.split("\n")[0].slice(0, 44) || "(no caption)"}</p>
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* insights */}
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
                    {fmtNum(m.top.likes)} likes · {fmtNum(m.top.comments)} comments
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
          <small className="an3-card-label">Changes vs previous {m.days} days</small>
          <ul className="an3-rows">
            {(
              [
                ["Engagement", m.engDelta],
                ["Likes", m.likesDelta],
                ["Comments", m.comDelta],
                ["Followers", m.folDelta],
              ] as const
            ).map(([label, pct]) => (
              <li key={label}>
                <span>{label}</span>
                <em className={pct == null ? "flat" : Math.abs(pct) < 2 ? "flat" : pct > 0 ? "up" : "down"}>
                  {pct == null
                    ? label === "Followers"
                      ? "history builds from today"
                      : "no earlier period"
                    : `${pct > 0 ? "↑" : pct < 0 ? "↓" : ""} ${Math.abs(pct).toFixed(1)}%`}
                </em>
              </li>
            ))}
            <li>
              <span>Posts published</span>
              <em className="flat">{m.postCount} vs {m.prevCount}</em>
            </li>
          </ul>
        </div>

        <div className="an3-card">
          <small className="an3-card-label">Performance summary</small>
          <Summary m={m} />
        </div>
      </div>

      <p className="an3-foot">
        <Info size={11} /> Engagement is attributed to the day content was posted (lifetime likes +
        comments). Times shown in your device&apos;s time zone.
      </p>
    </section>
  );
}

// Templated strictly from the computed numbers above — no freeform claims.
function Summary({ m }: { m: { engDelta: number | null; postCount: number; prevCount: number; days: number; topShare: number | null; top: PerfPost | null } }) {
  if (!m.postCount) {
    return <p className="an3-card-empty">Nothing to summarize — no posts in this period.</p>;
  }
  const head =
    m.engDelta == null ? "First measurable period"
    : m.engDelta >= 15 ? "Strong momentum"
    : m.engDelta <= -15 ? "Cooling off"
    : "Steady";
  const bits: string[] = [];
  if (m.engDelta != null) {
    bits.push(
      `Engagement on new content is ${m.engDelta >= 0 ? "up" : "down"} ${Math.abs(m.engDelta).toFixed(0)}% vs the previous ${m.days} days (${m.postCount} vs ${m.prevCount} posts).`
    );
  } else {
    bits.push(`${m.postCount} post${m.postCount === 1 ? "" : "s"} in this period, with no earlier period to compare yet.`);
  }
  if (m.top && m.topShare != null && m.topShare >= 40) {
    bits.push(`“${m.top.caption.split("\n")[0].slice(0, 36)}” drove ${m.topShare}% of it.`);
  }
  return (
    <>
      <b className="an3-sum-head">{head}</b>
      <p className="an3-sum-body">{bits.join(" ")}</p>
    </>
  );
}
