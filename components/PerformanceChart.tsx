"use client";

import { useState } from "react";

// Renders a real daily series supplied by the server. There is no built-in
// data: if the caller has nothing real to pass, it doesn't render.
export type SeriesPoint = { day: string; v: number };

function fmt(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

export default function PerformanceChart({
  series,
  label,
  note,
}: {
  series: SeriesPoint[];
  label: string;
  note: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const data = series.map((p) => p.v);
  const n = data.length;

  const W = 720,
    H = 260,
    padL = 44,
    padR = 16,
    padT = 18,
    padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...data);
  const min = Math.min(...data) * 0.92;
  const x = (i: number) => padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * plotH;

  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(data[0])} ${data.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`;
  const gridY = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * (n - 1)));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((xv - padL) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div className="perf">
      <div className="perf-toolbar">
        <div className="seg"><button className="on">{label}</button></div>
        <span className="perf-note">{note}</span>
      </div>

      <div className="perf-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="perfchart"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={label}
        >
          <defs>
            <linearGradient id="perfArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridY.map((t, i) => {
            const gy = padT + t * plotH;
            const val = max - t * (max - min);
            return (
              <g key={i}>
                <line x1={padL} y1={gy} x2={W - padR} y2={gy} className="pgrid" />
                <text x={padL - 8} y={gy + 3} className="paxis" textAnchor="end">
                  {fmt(Math.round(val))}
                </text>
              </g>
            );
          })}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 10} className="paxis" textAnchor="middle">
              {new Date(series[i].day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </text>
          ))}
          <path d={area} fill="url(#perfArea)" />
          <polyline points={line} className="pline" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="pcross" />
              <circle cx={x(hover)} cy={y(data[hover])} r="4.5" className="pdot" />
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="perf-tip"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              top: `${(y(data[hover]) / H) * 100}%`,
            }}
          >
            <b>{fmt(data[hover])}</b>
            <span>
              {new Date(series[hover].day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
