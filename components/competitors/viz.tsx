"use client";

// SVG visual primitives for the Competitors command center. No chart library:
// every mark is a few dozen lines of SVG bound directly to real values, which
// keeps the bundle small and makes "no data" states first-class instead of a
// library afterthought. All animation is CSS-driven and honors reduced motion.

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtN } from "./shared";

/* ---------- shared ---------- */

export type Pt = { t: number; v: number };

// Pinned to UTC: these components render on the server first, and the label
// must not change between that render and the browser's.
const NICE_DATE = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** True once the element first scrolls into view — charts draw themselves then. */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/* ---------- score ring ---------- */

export function ScoreRing({ value, size = 148, label = "PERFORMANCE" }: { value: number | null; size?: number; label?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : value / 100;
  return (
    <div className="cx2-ring" ref={ref} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="cx2-ring-track" strokeWidth={9} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="cx2-ring-arc" strokeWidth={9} fill="none"
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={seen ? c * (1 - pct) : c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="cx2-ring-center">
        {value == null ? <b className="none">—</b> : <b><CountNum to={value} run={seen} /></b>}
        <small>{value == null ? "no score yet" : "/100"}</small>
        <span className="cx2-micro">{label}</span>
      </div>
    </div>
  );
}

/** Integer count-up used inside rings and the intelligence strip. Re-runs
 *  whenever `to` changes (range switch, refresh), counting from the value
 *  last shown so the number never lags behind the mark it sits inside. */
export function CountNum({ to, run = true, duration = 850 }: { to: number; run?: boolean; duration?: number }) {
  const [n, setN] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (!run) return;
    const from = shown.current;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { shown.current = to; setN(to); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      shown.current = v;
      setN(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to, duration]);
  return <>{n}</>;
}

/* ---------- trajectory (per-post series, you vs them) ---------- */

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx.toFixed(1)} ${p0.y.toFixed(1)}, ${mx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export function Trajectory({ you, them, themName, height = 240, unit, animateKey }: {
  you: Pt[]; them: Pt[]; themName: string; height?: number;
  unit: (v: number) => string;
  /** Changing this re-runs the draw animation (metric/competitor switches). */
  animateKey: string;
}) {
  const [wrapRef, seen] = useInView<HTMLDivElement>();
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<{ x: number; t: number; yv: number | null; tv: number | null } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef]);

  const pad = { l: 44, r: 16, t: 14, b: 24 };
  const all = [...you, ...them];
  const geom = useMemo(() => {
    if (all.length < 2) return null;
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    const v1 = Math.max(...all.map((p) => p.v), 1);
    const X = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
    const Y = (v: number) => pad.t + (1 - v / v1) * (height - pad.t - pad.b);
    return { t0, t1, v1, X, Y };
    // Depends on the series themselves: same-length series with new values
    // (a range switch) must rescale too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, height, animateKey, you, them]);

  if (!geom || all.length < 2) {
    return <div ref={wrapRef} className="cx2-chart-empty" style={{ height }}><p>Not enough dated posts in this range to draw a trajectory.</p></div>;
  }

  const yPts = you.map((p) => ({ x: geom.X(p.t), y: geom.Y(p.v), ...p })).sort((a, b) => a.x - b.x);
  const tPts = them.map((p) => ({ x: geom.X(p.t), y: geom.Y(p.v), ...p })).sort((a, b) => a.x - b.x);
  const gridY = [0.25, 0.5, 0.75].map((f) => pad.t + f * (height - pad.t - pad.b));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * w;
    const nearest = (pts: typeof yPts) => {
      if (!pts.length) return null;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
      return Math.abs(best.x - x) < 48 ? best : null;
    };
    const ny = nearest(yPts), nt = nearest(tPts);
    if (!ny && !nt) { setHover(null); return; }
    const anchor = ny ?? nt!;
    setHover({ x: anchor.x, t: anchor.t, yv: ny?.v ?? null, tv: nt?.v ?? null });
  };

  return (
    <div ref={wrapRef} className="cx2-chart" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Performance trajectory">
        {gridY.map((y) => <line key={y} x1={pad.l} x2={w - pad.r} y1={y} y2={y} className="cx2-grid-line" />)}
        <text x={pad.l - 8} y={pad.t + 8} className="cx2-axis" textAnchor="end">{fmtN(geom.v1)}</text>
        <text x={pad.l - 8} y={height - pad.b} className="cx2-axis" textAnchor="end">0</text>
        <text x={pad.l} y={height - 7} className="cx2-axis">{NICE_DATE(geom.t0)}</text>
        <text x={w - pad.r} y={height - 7} className="cx2-axis" textAnchor="end">{NICE_DATE(geom.t1)}</text>

        {tPts.length >= 2 && <path key={`t-${animateKey}`} d={smoothPath(tPts)} className="cx2-line them draw" style={seen ? undefined : { animation: "none", strokeDashoffset: 1400 }} />}
        {yPts.length >= 2 && <path key={`y-${animateKey}`} d={smoothPath(yPts)} className="cx2-line you draw" style={seen ? undefined : { animation: "none", strokeDashoffset: 1400 }} />}
        {tPts.map((p, i) => <circle key={`tp${i}`} cx={p.x} cy={p.y} r={2.5} className="cx2-dot them" />)}
        {yPts.map((p, i) => <circle key={`yp${i}`} cx={p.x} cy={p.y} r={2.5} className="cx2-dot you" />)}
        {tPts.length > 0 && <circle cx={tPts[tPts.length - 1].x} cy={tPts[tPts.length - 1].y} r={4} className="cx2-dot-end them" />}
        {yPts.length > 0 && <circle cx={yPts[yPts.length - 1].x} cy={yPts[yPts.length - 1].y} r={4} className="cx2-dot-end you" />}

        {hover && <line x1={hover.x} x2={hover.x} y1={pad.t} y2={height - pad.b} className="cx2-cursor" />}
      </svg>
      {hover && (
        <div className="cx2-tip" style={{ left: `${(hover.x / w) * 100}%`, transform: `translateX(${hover.x > w * 0.7 ? "-105%" : "8px"})` }}>
          <b>{NICE_DATE(hover.t)}</b>
          {hover.yv != null && <span><i className="you" /> You {unit(hover.yv)}</span>}
          {hover.tv != null && <span><i className="them" /> {themName} {unit(hover.tv)}</span>}
          {hover.yv != null && hover.tv != null && (
            <span className={hover.yv >= hover.tv ? "up" : "down"}>Gap {hover.yv >= hover.tv ? "+" : "−"}{unit(Math.abs(hover.yv - hover.tv))}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- donut (their format mix) ---------- */

export function Donut({ slices, size = 132 }: { slices: { label: string; share: number; count: number }[]; size?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const total = slices.reduce((s, x) => s + x.share, 0) || 1;
  return (
    <div className="cx2-donut" ref={ref} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="cx2-ring-track" strokeWidth={13} fill="none" />
        {slices.map((s, i) => {
          const frac = s.share / total;
          const off = acc; acc += frac;
          return (
            <circle
              key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={13}
              className={`cx2-donut-arc s${i}`} strokeLinecap="butt"
              strokeDasharray={`${Math.max(0.001, frac * c - 2)} ${c}`}
              strokeDashoffset={seen ? -off * c : 0}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ opacity: seen ? 1 : 0, transitionDelay: `${i * 90}ms` }}
            />
          );
        })}
      </svg>
      <div className="cx2-ring-center small">
        <b>{slices[0] ? `${Math.round((slices[0].share / total) * 100)}%` : "—"}</b>
        <small>{slices[0]?.label ?? ""}</small>
      </div>
    </div>
  );
}

/* ---------- posting heatmap ---------- */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = [
  { label: "Morning", from: 5, to: 12 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Evening", from: 17, to: 22 },
  { label: "Night", from: 22, to: 29 }, // wraps past midnight
];

/** Buckets in UTC, the one zone the server render and the browser share; the
 *  card's footnote says so. A runtime-zone bucket would differ between them. */
export function postingGrid(times: Date[]): { grid: number[][]; max: number; total: number } {
  const grid = SLOTS.map(() => DAYS.map(() => 0));
  for (const d of times) {
    const day = (d.getUTCDay() + 6) % 7; // Mon = 0
    const h = d.getUTCHours();
    const si = SLOTS.findIndex((s) => (h >= s.from && h < Math.min(s.to, 24)) || (s.to > 24 && h < s.to - 24));
    if (si >= 0) grid[si][day]++;
  }
  return { grid, max: Math.max(1, ...grid.flat()), total: times.length };
}

export function Heatmap({ times }: { times: Date[] }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { grid, max } = useMemo(() => postingGrid(times), [times]);
  return (
    <div className="cx2-heat" ref={ref}>
      <div className="cx2-heat-row head"><span /> {DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      {SLOTS.map((s, si) => (
        <div className="cx2-heat-row" key={s.label}>
          <span className="cx2-heat-slot">{s.label}</span>
          {DAYS.map((d, di) => {
            const v = grid[si][di];
            return (
              <i
                key={d} className="cx2-heat-cell" data-on={v > 0 || undefined}
                title={`${v} post${v === 1 ? "" : "s"} · ${d} ${s.label.toLowerCase()}`}
                style={{ ["--heat" as string]: seen ? v / max : 0, transitionDelay: `${(si * 7 + di) * 14}ms` }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- content performance scatter ---------- */

export type ScatterPost = {
  url: string; title: string | null; thumb: string | null; format: string | null;
  t: number; y: number; comments: number | null; multiplier: number | null;
};

export function Scatter({ posts, yLabel, height = 210, unit }: { posts: ScatterPost[]; yLabel: string; height?: number; unit: (v: number) => string }) {
  const [wrapRef, seen] = useInView<HTMLDivElement>();
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<ScatterPost & { x: number; py: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef]);

  const pad = { l: 44, r: 18, t: 16, b: 24 };
  if (posts.length < 3) return <div className="cx2-chart-empty" style={{ height }}><p>Fewer than three dated posts, so no honest pattern to plot yet.</p></div>;
  const t0 = Math.min(...posts.map((p) => p.t)), t1 = Math.max(...posts.map((p) => p.t));
  const v1 = Math.max(...posts.map((p) => p.y), 1);
  const X = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / v1) * (height - pad.t - pad.b);
  const maxC = Math.max(1, ...posts.map((p) => p.comments ?? 0));
  const best = [...posts].sort((a, b) => b.y - a.y)[0];

  return (
    <div ref={wrapRef} className="cx2-chart" style={{ height }}>
      {/* role="group", not "img": the bubbles inside are focusable buttons and must stay in the accessibility tree. */}
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="group" aria-label="Content performance">
        {[0.5].map((f) => <line key={f} x1={pad.l} x2={w - pad.r} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} className="cx2-grid-line" />)}
        <text x={pad.l - 8} y={pad.t + 8} className="cx2-axis" textAnchor="end">{fmtN(v1)}</text>
        <text x={pad.l - 8} y={height - pad.b} className="cx2-axis" textAnchor="end">0</text>
        <text x={pad.l} y={height - 7} className="cx2-axis">{NICE_DATE(t0)}</text>
        <text x={w - pad.r} y={height - 7} className="cx2-axis" textAnchor="end">{NICE_DATE(t1)}</text>
        <text x={14} y={pad.t + 4} className="cx2-axis" transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle" dominantBaseline="middle" dy={height / 2 - pad.t - 4}>{yLabel}</text>
        {posts.map((p, i) => (
          <circle
            key={p.url + i} cx={X(p.t)} cy={Y(p.y)}
            r={seen ? 4 + ((p.comments ?? 0) / maxC) * 6 : 0}
            className={`cx2-bubble${p === best ? " best" : ""}`}
            style={{ transitionDelay: `${i * 24}ms` }}
            tabIndex={0} role="button"
            aria-label={`${p.title ?? "Untitled post"}, ${unit(p.y)} ${yLabel.toLowerCase()}. Opens the post.`}
            onMouseEnter={() => setHover({ ...p, x: X(p.t), py: Y(p.y) })}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover({ ...p, x: X(p.t), py: Y(p.y) })}
            onBlur={() => setHover(null)}
            onClick={() => window.open(p.url, "_blank", "noopener")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.open(p.url, "_blank", "noopener"); } }}
          />
        ))}
      </svg>
      {hover && (
        <div className="cx2-tip post" style={{ left: `${(hover.x / w) * 100}%`, top: Math.max(4, hover.py - 8), transform: `translate(${hover.x > w * 0.65 ? "-105%" : "10px"}, -100%)` }}>
          {hover.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={hover.thumb} alt="" />}
          <div>
            {hover.format && <em>{hover.format}</em>}
            <b>{hover.title ?? "Untitled post"}</b>
            <span>{unit(hover.y)}{hover.comments != null ? ` · ${fmtN(hover.comments)} comments` : ""}{hover.multiplier != null ? ` · ${hover.multiplier.toFixed(1)}× their baseline` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- radar (you vs them, normalized per shared metric) ---------- */

export function Radar({ axes, size = 210, themName }: {
  axes: { label: string; you: number; them: number }[]; size?: number; themName: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  if (axes.length < 3) return null;
  const cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i: number, f: number) => `${(cx + Math.cos(angle(i)) * R * f).toFixed(1)},${(cy + Math.sin(angle(i)) * R * f).toFixed(1)}`;
  const poly = (pick: (a: { you: number; them: number }) => number) => axes.map((a, i) => pt(i, Math.max(0.06, pick(a)))).join(" ");
  return (
    <div className="cx2-radar" ref={ref}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`You vs ${themName}`}>
        {[0.33, 0.66, 1].map((f) => <polygon key={f} points={axes.map((_, i) => pt(i, f)).join(" ")} className="cx2-radar-grid" />)}
        {axes.map((_, i) => <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle(i)) * R} y2={cy + Math.sin(angle(i)) * R} className="cx2-radar-grid" />)}
        <polygon points={poly((a) => a.them)} className={`cx2-radar-fill them${seen ? " on" : ""}`} />
        <polygon points={poly((a) => a.you)} className={`cx2-radar-fill you${seen ? " on" : ""}`} />
        {axes.map((a, i) => {
          const lx = cx + Math.cos(angle(i)) * (R + 18), ly = cy + Math.sin(angle(i)) * (R + 16);
          return <text key={a.label} x={lx} y={ly} className="cx2-axis mid" textAnchor="middle" dominantBaseline="middle">{a.label}</text>;
        })}
      </svg>
    </div>
  );
}
