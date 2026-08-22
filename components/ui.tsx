import { ArrowUpRight, ArrowDownRight, Camera, Music2, Play } from "lucide-react";
import type { Kpi } from "@/lib/demoData";
import CountUp from "@/components/CountUp";
import SparkLive from "@/components/SparkLive";

// ---- TrendBadge ----
export function TrendBadge({ change, up }: { change: number; up: boolean }) {
  return (
    <span className={`trendbadge ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(change)}%
    </span>
  );
}

// ---- Sparkline ----
export function Sparkline({
  data,
  variant = "line",
  up = true,
}: {
  data: number[];
  variant?: "line" | "bar";
  up?: boolean;
}) {
  const W = 120,
    H = 34;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const color = up ? "var(--accent)" : "var(--danger)";

  if (variant === "bar") {
    const gap = 3;
    const bw = (W - gap * (data.length - 1)) / data.length;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none">
        {data.map((v, i) => {
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
            />
          );
        })}
      </svg>
    );
  }

  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 3 - ((v - min) / span) * (H - 6)}`)
    .join(" ");
  const area = `M0,${H} L${pts.split(" ").join(" L")} L${W},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${up}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${up})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// ---- MetricCard ----
export function MetricCard({
  kpi,
  icon,
  index = 0,
}: {
  kpi: Kpi;
  icon: React.ReactNode;
  index?: number;
}) {
  return (
    <section className="db2-kpi db2-rise" style={{ animationDelay: `${80 + index * 70}ms` }}>
      <div className="db2-kpi-top">
        <span className="db2-kpi-ico">{icon}</span>
        <span className="db2-kpi-label">{kpi.label}</span>
      </div>
      <div className="db2-kpi-value">
        <CountUp value={kpi.value} />
      </div>
      <span className="db2-kpi-compare">{kpi.compare}</span>
      <div className="db2-kpi-foot">
        {kpi.change !== null ? (
          <span className={`db2-kpi-delta ${kpi.up ? "up" : "down"}`}>
            {kpi.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(kpi.change)}%
          </span>
        ) : (
          <span />
        )}
        {kpi.spark.length > 1 && (
          <span className="db2-kpi-spark">
            <SparkLive
              data={kpi.spark}
              labels={kpi.sparkLabels}
              variant={kpi.variant}
              up={kpi.up}
            />
          </span>
        )}
      </div>
    </section>
  );
}

// ---- PlatformBadge ----
export function PlatformBadge({ platform }: { platform: "ig" | "tt" | "yt" }) {
  if (platform === "tt")
    return (
      <span className="plat tt" title="TikTok">
        <Music2 size={12} />
      </span>
    );
  if (platform === "yt")
    return (
      <span className="plat yt" title="YouTube">
        <Play size={12} fill="#fff" />
      </span>
    );
  return (
    <span className="plat ig" title="Instagram">
      <Camera size={12} />
    </span>
  );
}
