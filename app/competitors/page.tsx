import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Competitors — SOCIA" };

const TRACKED = [
  { handle: "@trendy.slice", followers: "112k", outliers: 5 },
  { handle: "@cheese.pull.daily", followers: "89k", outliers: 6 },
  { handle: "@rival.pizza", followers: "48.2k", outliers: 3 },
  { handle: "@nyc.pizza.tour", followers: "320k", outliers: 4 },
  { handle: "@doughbros", followers: "27.9k", outliers: 2 },
];

const OUTLIERS = [
  {
    competitor: "@cheese.pull.daily",
    format: "Reel",
    mult: "4.1×",
    why: "Trending audio + a fast 6-cut sequence, all under 8 seconds. Hook is the cheese pull in the very first frame.",
    views: "410k",
    saves: "12k",
    hue: "linear-gradient(135deg,#f59e0b,#ef4444)",
  },
  {
    competitor: "@trendy.slice",
    format: "Reel",
    mult: "3.2×",
    why: "First-person POV eating clip. No intro — it opens mid-bite, which kills the scroll.",
    views: "220k",
    saves: "8.4k",
    hue: "linear-gradient(135deg,#2563FF,#60A5FA)",
  },
  {
    competitor: "@rival.pizza",
    format: "Carousel",
    mult: "2.8×",
    why: '"5 mistakes people make with pizza" — slide 1 is a bold claim that forces a swipe.',
    views: "96k",
    saves: "5.1k",
    hue: "linear-gradient(135deg,#10b981,#2563FF)",
  },
  {
    competitor: "@nyc.pizza.tour",
    format: "Reel",
    mult: "2.5×",
    why: 'Location tag + "hidden gem" framing drives shares and saves from locals.',
    views: "180k",
    saves: "3.9k",
    hue: "linear-gradient(135deg,#8b5cf6,#ec4899)",
  },
];

const TRENDS = [
  { label: "POV eating clips", dir: "up", note: "spreading across 4 tracked accounts" },
  { label: '"3 mistakes" hooks', dir: "up", note: "2.6× median on average" },
  { label: "Static menu photos", dir: "down", note: "declining reach niche-wide" },
];

const GAPS = [
  "They open Reels on a face or motion in the first 0.5s — your posts open on the logo.",
  "They post 4–5× per week; you average 2.",
  "They burn on-screen text hooks into every Reel; only 1 of your last 10 had them.",
];

export default async function CompetitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Niche intelligence</div>
          <h1>Competitors</h1>
          <p className="page-sub">
            What&apos;s outperforming in your niche right now — and why.
          </p>
        </div>
        <button className="head-btn">+ Add competitor</button>
      </div>

      <div className="comp-accounts">
        {TRACKED.map((c) => (
          <div className="comp-acct" key={c.handle}>
            <span className="comp-avatar">{c.handle[1].toUpperCase()}</span>
            <div className="comp-acct-meta">
              <b>{c.handle}</b>
              <small>{c.followers} followers</small>
            </div>
            <span className="comp-outliers">▲ {c.outliers}</span>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <section className="chart-card">
          <div className="chart-head">
            <h3>Outliers this week</h3>
            <span className="head-note">Posts doing 2×+ their account&apos;s median</span>
          </div>
          <div className="outlier-grid">
            {OUTLIERS.map((o, i) => (
              <div className="outlier-card" key={i}>
                <div className="thumb" style={{ background: o.hue }}>
                  <span className="thumb-play">▶</span>
                  <span className="mult-badge">{o.mult} median</span>
                </div>
                <div className="outlier-body">
                  <div className="outlier-top">
                    <b>{o.competitor}</b>
                    <span className="tag fmt">{o.format}</span>
                  </div>
                  <p className="why">
                    <span>Why it won:</span> {o.why}
                  </p>
                  <div className="outlier-metrics">
                    <span>{o.views} views</span>
                    <span>{o.saves} saves</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="comp-side">
          <section className="chart-card">
            <div className="chart-head">
              <h3>Trending formats</h3>
            </div>
            <ul className="trend-list">
              {TRENDS.map((t) => (
                <li key={t.label}>
                  <span className={`trend-dir ${t.dir}`}>
                    {t.dir === "up" ? "▲" : "▼"}
                  </span>
                  <span className="trend-meta">
                    <b>{t.label}</b>
                    <small>{t.note}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="chart-card">
            <div className="chart-head">
              <h3>Gaps to close</h3>
            </div>
            <ul className="gap-list">
              {GAPS.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
