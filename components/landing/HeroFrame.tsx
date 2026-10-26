"use client";

import { useState } from "react";
import BrandMark from "@/components/BrandMark";
import { KpiStrip, KpiCell, PlatformMark } from "@/components/system";

// The homepage's one live product moment: SOCIA's Analytics view, with the
// KPI tiles switching the chart exactly as they do in the app. Every number
// here is example data and the frame says so; nothing claims to be a
// customer's result (docs/design/anti-slop-standard.md, sections 7 and 17.1).

type MetricId = "views" | "reach" | "interactions" | "followers";

// Thirty days, deliberately uneven: real accounts spike on good posts and dip
// on quiet days.
const VIEWS = [1240, 980, 1510, 1120, 1890, 2410, 1330, 1080, 1420, 1260, 1710, 2980, 1650, 1190, 1370, 1540, 1210, 2260, 3120, 1780, 1300, 1460, 1620, 1350, 1980, 2740, 1590, 1410, 1730, 1880];
const REACH = VIEWS.map((v, i) => Math.round(v * (0.41 + ((i * 7) % 9) / 100)));
const INTERACTIONS = VIEWS.map((v, i) => Math.round(v * (0.042 + ((i * 5) % 7) / 1000)));
const FOLLOWERS = [3826, 3828, 3829, 3833, 3836, 3842, 3843, 3843, 3846, 3848, 3851, 3862, 3864, 3864, 3866, 3869, 3870, 3877, 3886, 3889, 3890, 3891, 3894, 3895, 3899, 3905, 3906, 3907, 3910, 3912];

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const METRICS: Record<MetricId, { label: string; series: number[]; value: string; delta: { text: string; tone?: "good" | "bad" }; chartLabel: string }> = {
  views: { label: "Views", series: VIEWS, value: compact(sum(VIEWS)), delta: { text: "+14%", tone: "good" }, chartLabel: "Views per day" },
  reach: { label: "Reach", series: REACH, value: compact(sum(REACH)), delta: { text: "+9%", tone: "good" }, chartLabel: "Accounts reached per day" },
  interactions: { label: "Interactions", series: INTERACTIONS, value: sum(INTERACTIONS).toLocaleString("en-US"), delta: { text: "-4%", tone: "bad" }, chartLabel: "Likes, comments, shares and saves per day" },
  followers: { label: "Followers", series: FOLLOWERS, value: FOLLOWERS[FOLLOWERS.length - 1].toLocaleString("en-US"), delta: { text: `+${FOLLOWERS[FOLLOWERS.length - 1] - FOLLOWERS[0]}`, tone: "good" }, chartLabel: "Followers at the end of each day" },
};

const W = 600;
const H = 168;

function points(series: number[]): string {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series
    .map((v, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(H - 8 - ((v - min) / span) * (H - 16)).toFixed(1)}`)
    .join(" ");
}

export default function HeroFrame() {
  const [metric, setMetric] = useState<MetricId>("views");
  const m = METRICS[metric];

  return (
    <div className="lp-screen" data-theme="light">
      <div className="lp-screen-top">
        <BrandMark size={18} />
        <b>Analytics</b>
        <span>Instagram, last 30 days</span>
        <em className="lp-example">Example data</em>
      </div>

      <div className="lp-screen-body lp-hero-grid">
        <div>
          <KpiStrip cols={4}>
            {(Object.keys(METRICS) as MetricId[]).map((id) => (
              <KpiCell
                key={id}
                label={METRICS[id].label}
                value={METRICS[id].value}
                delta={{ ...METRICS[id].delta, window: "vs prior 30 days" }}
                selected={metric === id}
                onSelect={() => setMetric(id)}
              />
            ))}
          </KpiStrip>

          <div className="lp-chart">
            <div className="lp-chart-head">
              <b>{m.chartLabel}</b>
              <span>Sep 24 to Oct 23</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${m.chartLabel}, example data, September 24 to October 23`}>
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />
              ))}
              <polyline points={points(m.series)} fill="none" stroke="var(--chart-series)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="lp-chart-axis" aria-hidden="true">
              <span>Sep 24</span>
              <span>Oct 8</span>
              <span>Oct 23</span>
            </div>
          </div>
        </div>

        <aside className="lp-next" aria-label="What SOCIA concluded">
          <div>
            <h3>What changed</h3>
            <ul>
              <li><b>Reels</b> were 9 of your 14 posts and brought 71% of your views.</li>
              <li><b>Thursday, 6 to 8pm</b> was your strongest posting window over 12 weeks.</li>
              <li><b>Carousels</b> were saved less often than in September.</li>
            </ul>
          </div>
          <div>
            <h3>Do this next</h3>
            <p><b>Post a Reel on Thursday at 7pm.</b> Based on 14 of your posts, a small sample, so SOCIA checks it again next week.</p>
          </div>
          <p className="lp-source">
            <PlatformMark platform="instagram" size="sm" /> Every figure comes from your connected Instagram account.
          </p>
        </aside>
      </div>
    </div>
  );
}
