"use client";

import { useEffect, useRef, useState } from "react";

// Animated sparkline for the KPI cards: draws itself in on mount, and on
// pointer-fine devices shows a tiny tooltip with the point's label + value.
const W = 120;
const H = 34;

export default function SparkLive({
  data,
  labels,
  variant = "line",
  up = true,
}: {
  data: number[];
  labels?: string[];
  variant?: "line" | "bar";
  up?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const fine = useRef(false);

  useEffect(() => {
    fine.current = window.matchMedia("(pointer: fine)").matches;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const color = up ? "var(--accent)" : "var(--danger)";
  const px = (i: number) => (i / (data.length - 1)) * W;
  const py = (v: number) => H - 3 - ((v - min) / span) * (H - 6);

  function onMove(e: React.PointerEvent) {
    if (!fine.current || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(frac * (data.length - 1));
    const label = labels?.[i];
    setTip({
      x: (px(i) / W) * r.width,
      y: variant === "bar" ? 0 : (py(data[i]) / H) * r.height,
      text: `${label ? label + " · " : ""}${data[i].toLocaleString("en-US")}`,
    });
  }

  const bars = () => {
    const gap = 3;
    const bw = (W - gap * (data.length - 1)) / data.length;
    return data.map((v, i) => {
      const h = ((v - min) / span) * (H - 4) + 4;
      return (
        <rect
          key={i}
          x={i * (bw + gap)}
          y={H - h}
          width={bw}
          height={h}
          rx="1.5"
          fill={color}
          opacity="0.85"
          style={{ transitionDelay: `${i * 30}ms` }}
        />
      );
    });
  };

  const pts = data.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const area = `M0,${H} L${pts.split(" ").join(" L")} L${W},${H} Z`;

  return (
    <div
      ref={wrap}
      className={`sl ${drawn ? "drawn" : ""} ${variant}`}
      onPointerMove={onMove}
      onPointerLeave={() => setTip(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none" aria-hidden>
        {variant === "bar" ? (
          bars()
        ) : (
          <>
            <defs>
              <linearGradient id={`slg-${up}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="sl-area" d={area} fill={`url(#slg-${up})`} />
            <polyline
              className="sl-line"
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              pathLength={100}
            />
          </>
        )}
      </svg>
      {tip && (
        <span className="sl-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </span>
      )}
    </div>
  );
}
