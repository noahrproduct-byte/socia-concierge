"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Images, CircleDashed, Type } from "lucide-react";

// Interactive, honest chart components for the Analytics page. Everything here
// renders exactly the numbers it is given; entry animations respect
// prefers-reduced-motion.

function useInView<T extends HTMLElement>(threshold = 0.25): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/** Generic reveal wrapper: adds .in when scrolled into view. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  return (
    <div
      ref={ref}
      className={`an2-reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ---- Growth / engagement line chart with hover tooltip ----
export type GrowthPoint = { label: string; value: number };

export function GrowthChart({
  points,
  baseline,
  baselineName,
  unit = "",
  ariaLabel,
}: {
  points: GrowthPoint[];
  baseline?: number[] | null; // optional second series (dashed gray)
  baselineName?: string;
  unit?: string;
  ariaLabel: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [hover, setHover] = useState<number | null>(null);
  const fine = useRef(false);
  useEffect(() => {
    fine.current = window.matchMedia("(pointer: fine)").matches;
  }, []);

  const W = 680;
  const H = 240;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = points.map((p) => p.value);
  const all = baseline ? [...values, ...baseline] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const min = lo - (hi - lo || 1) * 0.12;
  const max = hi + (hi - lo || 1) * 0.12;
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;

  const youPts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${padT + plotH} ${values.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(points.length - 1)},${padT + plotH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * plotH);
  const fmt = (v: number) =>
    unit === "%" ? v.toFixed(1) + "%" : Math.round(v).toLocaleString("en-US");

  function onMove(e: React.PointerEvent) {
    if (!fine.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    const px = frac * W;
    if (px < padL - 10 || px > W - padR + 10) return setHover(null);
    const i = Math.round(((px - padL) / plotW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const hv = hover != null ? points[hover] : null;

  return (
    <div
      ref={ref}
      className={`an2-growth ${inView ? "in" : ""}`}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="svgchart" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="an2area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563FF" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2563FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => (
          <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="grid" />
        ))}
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={padL - 8} y={padT + (1 - t) * plotH + 4} textAnchor="end" className="axislabel">
            {fmt(min + t * (max - min))}
          </text>
        ))}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 8} className="axislabel" textAnchor="middle">
            {p.label}
          </text>
        ))}
        <path className="an2-area" d={area} fill="url(#an2area)" />
        {baseline && (
          <polyline
            points={baseline.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            className="line niche"
            strokeDasharray="5 5"
            fill="none"
          />
        )}
        <polyline points={youPts} className="line you an2-line" fill="none" pathLength={100} />
        {hover != null && (
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="an2-cursor" />
        )}
        {values.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={hover === i ? 4.5 : 3.2}
            className={`dot you ${hover === i ? "hot" : ""}`}
          />
        ))}
      </svg>
      {hv && (
        <div className="an2-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <b>{hv.label}</b>
          <span>
            <i className="sw you" /> You <em>{fmt(hv.value)}</em>
          </span>
          {baseline && baseline[hover!] != null && (
            <span>
              <i className="sw niche" /> {baselineName ?? "Baseline"} <em>{fmt(baseline[hover!])}</em>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Engagement by format: vertical gradient columns ----
const FORMAT_ICONS: Record<string, React.ReactNode> = {
  Reels: <Clapperboard size={15} />,
  Carousels: <Images size={15} />,
  Stories: <CircleDashed size={15} />,
  Static: <Type size={15} />,
};

export function FormatBars({
  items,
}: {
  items: { label: string; value: number; note?: string }[];
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const max = Math.max(...items.map((f) => f.value)) || 1;
  return (
    <div ref={ref} className={`an2-formats ${inView ? "in" : ""}`}>
      {items.map((f, i) => (
        <div
          className="an2-format"
          key={f.label}
          title={f.note ? `${f.label}: ${f.value}% avg engagement · ${f.note}` : `${f.label}: ${f.value}%`}
        >
          <b className="an2-format-val">{f.value}%</b>
          <div className="an2-format-colwrap">
            <i
              className={`an2-format-col c${i}`}
              style={{
                height: inView ? `${Math.max(14, (f.value / max) * 100)}%` : "0%",
                transitionDelay: `${i * 90}ms`,
              }}
            >
              <span className="an2-format-ico">{FORMAT_ICONS[f.label] ?? <Type size={15} />}</span>
            </i>
          </div>
          <span className="an2-format-label">{f.label}</span>
        </div>
      ))}
    </div>
  );
}
