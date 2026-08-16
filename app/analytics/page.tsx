import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Analytics — SOCIA" };

// ---- demo data (replace with real platform data once connected) ----
const LABELS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];
const YOU = [10.9, 11.2, 11.4, 11.3, 11.8, 12.0, 12.3, 12.5]; // followers, thousands
const NICHE = [10.8, 10.9, 11.0, 11.1, 11.2, 11.3, 11.35, 11.4];

const FORMATS = [
  { label: "Reels", value: 7.2 },
  { label: "Carousels", value: 5.1 },
  { label: "Stories", value: 3.9 },
  { label: "Static", value: 2.8 },
];

const BENCH = [
  { label: "Engagement rate", you: 5.8, niche: 3.9, unit: "%" },
  { label: "Save rate", you: 2.1, niche: 1.2, unit: "%" },
  { label: "Follows / post", you: 34, niche: 21, unit: "" },
];

const TOP_POSTS = [
  { title: "Owner tossing dough (Reel)", metric: "22.4k views", sub: "610 saves", up: true },
  { title: "Cheese pull close-up (Reel)", metric: "14.1k views", sub: "420 saves", up: true },
  { title: "Behind the scenes: new oven", metric: "9.8k views", sub: "180 saves", up: true },
  { title: "Menu update (Carousel)", metric: "0.8k views", sub: "12 saves", up: false },
];

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Analytics</h1>
          <p className="page-sub">
            Your performance across the last 8 weeks, benchmarked against your niche.
          </p>
        </div>
        <div className="range" role="group" aria-label="Date range">
          <button>7d</button>
          <button className="on">30d</button>
          <button>90d</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatTile label="Followers" value="12,480" delta="+3.2%" up />
        <StatTile label="Reach / week" value="1.24M" delta="+34%" up />
        <StatTile label="Engagement rate" value="5.8%" delta="+0.6pt" up />
        <StatTile label="Best time to post" value="Tue 7PM" delta="Consistent" />
      </div>

      <div className="panel-grid">
        <section className="chart-card wide">
          <div className="chart-head">
            <h3>Follower growth</h3>
            <div className="legend">
              <span className="legend-item">
                <span className="swatch you" /> You
              </span>
              <span className="legend-item">
                <span className="swatch niche" /> Niche avg
              </span>
            </div>
          </div>
          <LineChart />
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3>Engagement by format</h3>
          </div>
          <BarChart />
        </section>
      </div>

      <div className="panel-grid">
        <section className="chart-card">
          <div className="chart-head">
            <h3>Top performing posts</h3>
          </div>
          <ul className="post-list">
            {TOP_POSTS.map((p, i) => (
              <li key={i}>
                <span className="rankdot">{i + 1}</span>
                <span className="post-meta">
                  <b>{p.title}</b>
                  <small>{p.sub}</small>
                </span>
                <span className={`post-metric ${p.up ? "up" : "down"}`}>
                  {p.up ? "▲" : "▼"} {p.metric}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3>Benchmarked vs your niche</h3>
          </div>
          <div className="bench">
            {BENCH.map((b) => {
              const max = Math.max(b.you, b.niche);
              return (
                <div className="bench-row" key={b.label}>
                  <div className="bench-label">{b.label}</div>
                  <div className="bench-bars">
                    <span className="bench-track">
                      <span
                        className="bench-fill you"
                        style={{ width: `${(b.you / max) * 100}%` }}
                      />
                    </span>
                    <span className="bench-num">
                      {b.you}
                      {b.unit} <em>you</em>
                    </span>
                  </div>
                  <div className="bench-bars">
                    <span className="bench-track">
                      <span
                        className="bench-fill niche"
                        style={{ width: `${(b.niche / max) * 100}%` }}
                      />
                    </span>
                    <span className="bench-num muted">
                      {b.niche}
                      {b.unit} <em>niche</em>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  delta,
  up,
}: {
  label: string;
  value: string;
  delta: string;
  up?: boolean;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <b className="stat-val">{value}</b>
      <span className={`stat-delta ${up === undefined ? "flat" : up ? "up" : "down"}`}>
        {up === true ? "▲ " : up === false ? "▼ " : ""}
        {delta}
      </span>
    </div>
  );
}

// ---- inline SVG charts (no chart library; brand hue + neutral benchmark) ----
function LineChart() {
  const W = 680,
    H = 240,
    padL = 34,
    padR = 14,
    padT = 16,
    padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const all = [...YOU, ...NICHE];
  const min = Math.min(...all) - 0.3;
  const max = Math.max(...all) + 0.3;
  const x = (i: number) => padL + (i / (LABELS.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;

  const youPts = YOU.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const nichePts = NICHE.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(YOU[0])} ${YOU.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(YOU.length - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * plotH);

  return (
    <svg className="svgchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Follower growth vs niche average">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563FF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2563FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((gy, i) => (
        <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="grid" />
      ))}
      {LABELS.map((l, i) => (
        <text key={l} x={x(i)} y={H - 8} className="axislabel" textAnchor="middle">
          {l}
        </text>
      ))}
      <path d={area} fill="url(#areaFill)" />
      <polyline points={nichePts} className="line niche" strokeDasharray="5 5" />
      <polyline points={youPts} className="line you" />
      {YOU.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" className="dot you">
          <title>{`${LABELS[i]}: ${v}k followers`}</title>
        </circle>
      ))}
    </svg>
  );
}

function BarChart() {
  const W = 320,
    H = 240,
    padL = 10,
    padR = 10,
    padT = 14,
    padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...FORMATS.map((f) => f.value));
  const gap = 16;
  const bw = (plotW - gap * (FORMATS.length - 1)) / FORMATS.length;

  return (
    <svg className="svgchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Engagement rate by content format">
      {FORMATS.map((f, i) => {
        const h = (f.value / max) * plotH;
        const bx = padL + i * (bw + gap);
        const by = padT + (plotH - h);
        return (
          <g key={f.label}>
            <rect x={bx} y={by} width={bw} height={h} rx="5" className="bar">
              <title>{`${f.label}: ${f.value}%`}</title>
            </rect>
            <text x={bx + bw / 2} y={by - 6} textAnchor="middle" className="barval">
              {f.value}%
            </text>
            <text x={bx + bw / 2} y={H - 10} textAnchor="middle" className="axislabel">
              {f.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
