import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Video Scorer — SOCIA" };

const DIMS = [
  { label: "Hook", value: 92 },
  { label: "Script", value: 78 },
  { label: "Visual", value: 85 },
  { label: "Audio", value: 80 },
];

// retention %, sampled each second
const RETENTION = [100, 97, 71, 68, 63, 58, 53, 49, 45, 42, 40];

const FIXES = [
  { time: "0:00–0:02", type: "Hook", sev: "high", text: "Cut the slow logo intro — 29% of viewers drop in the first 2 seconds." },
  { time: "0:06", type: "Pacing", sev: "med", text: "Move the cheese-pull payoff earlier; it's the moment people came for." },
  { time: "0:11", type: "Text", sev: "low", text: "Add an on-screen caption for the CTA — most watch on mute." },
  { time: "0:14", type: "Audio", sev: "med", text: "Music drowns the voiceover — duck it about 4dB." },
];

export default async function ScorerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="scorer" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Pre-post analysis</div>
          <h1>Video Scorer</h1>
          <p className="page-sub">
            Upload a draft and get it graded — hook, script, visual, audio — before you post.
          </p>
        </div>
      </div>

      <div className="dropzone">
        <div className="drop-icon">⬆</div>
        <div className="drop-title">Drop a video here, or click to browse</div>
        <div className="drop-note">MP4 or MOV · up to 3 minutes</div>
      </div>

      <div className="score-eyebrow">Example analysis · dough-tossing-reel.mp4</div>

      <div className="panel-grid">
        <section className="chart-card">
          <div className="scorer-top">
            <div className="overall">
              <Ring score={84} />
              <div className="overall-verdict">
                <b>Strong — with 2 quick wins</b>
                <span>Fix the intro and this likely beats your median.</span>
              </div>
            </div>
            <div className="dims">
              {DIMS.map((d) => (
                <div className="dim-row" key={d.label}>
                  <span className="dim-label">{d.label}</span>
                  <span className="dim-track">
                    <span className="dim-fill" style={{ width: `${d.value}%` }} />
                  </span>
                  <span className="dim-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-head" style={{ marginTop: 22 }}>
            <h3>Predicted retention</h3>
            <span className="head-note">Where viewers drop off</span>
          </div>
          <RetentionChart />
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3>Fix list</h3>
            <span className="head-note">Ranked by impact</span>
          </div>
          <ul className="fix-listx">
            {FIXES.map((f, i) => (
              <li key={i}>
                <span className={`fix-time ${f.sev}`}>{f.time}</span>
                <span className="fix-body">
                  <b>{f.type}</b>
                  <small>{f.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function Ring({ score }: { score: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <svg viewBox="0 0 120 120" className="ring" width="120" height="120">
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" className="ring-num" textAnchor="middle" dominantBaseline="central">
        {score}
      </text>
      <text x="60" y="82" className="ring-den" textAnchor="middle">
        / 100
      </text>
    </svg>
  );
}

function RetentionChart() {
  const W = 680,
    H = 200,
    padL = 34,
    padR = 14,
    padT = 14,
    padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = RETENTION.length;
  const x = (i: number) => padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + (1 - v / 100) * plotH;
  const line = RETENTION.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(RETENTION[0])} ${RETENTION.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * plotH);

  return (
    <svg className="svgchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Predicted viewer retention over time">
      <defs>
        <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563FF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#2563FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((gy, i) => (
        <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="grid" />
      ))}
      {[0, 25, 50, 75, 100].map((p, i) => (
        <text key={p} x={padL - 6} y={y(p) + 3} className="axislabel" textAnchor="end">
          {p}
        </text>
      ))}
      <path d={area} fill="url(#retFill)" />
      {/* drop-off marker between second 1 and 2 */}
      <line x1={x(2)} y1={padT} x2={x(2)} y2={padT + plotH} className="drop-line" />
      <polyline points={line} className="line you" />
      <circle cx={x(2)} cy={y(RETENTION[2])} r="4.5" className="drop-dot">
        <title>Big drop at 0:02 — 29% leave</title>
      </circle>
      {["0:00", "0:03", "0:06", "0:09"].map((l, i) => (
        <text key={l} x={x(i * 3)} y={H - 8} className="axislabel" textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
  );
}
