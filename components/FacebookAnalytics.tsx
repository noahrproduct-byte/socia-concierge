"use client";

// Facebook analytics panel. Receives already-computed, honest data from the
// server (lib/metrics/facebook.ts) and lays it out in SOCIA's visual language.
// Followers draw as a line (a level); engagement draws as bars (content totals
// by publish date). Metrics Facebook no longer provides are stated, never faked.

import { useState } from "react";
import { Users, Heart, FileText, BarChart3, Eye, ExternalLink, Info } from "lucide-react";
import OverviewChart from "./ov/OverviewChart";
import StatTile from "./ov/StatTile";
import { fmtNum, type Granularity } from "@/lib/overview";
import type { FacebookAnalyticsData, FbStat } from "@/lib/metrics/facebook";
import "./platformAnalytics.css";

const TILE: Record<string, { Icon: typeof Users; tone: string }> = {
  followers: { Icon: Users, tone: "info" },
  views: { Icon: Eye, tone: "primary" },
  engagement: { Icon: Heart, tone: "pink" },
  posts: { Icon: FileText, tone: "primary" },
  avg: { Icon: BarChart3, tone: "success" },
};

type Metric = "views" | "followers" | "engagement";

export default function FacebookAnalytics({ data }: { data: FacebookAnalyticsData }) {
  const canViews = Boolean(data.views && data.views.provenance !== "unavailable");
  const canFollowers = data.followers.provenance !== "unavailable";
  const canEngagement = data.engagement.provenance !== "unavailable";
  const [metric, setMetric] = useState<Metric>(canViews ? "views" : canFollowers ? "followers" : "engagement");
  const [gran, setGran] = useState<Granularity>("day");
  const series = metric === "views" && data.views ? data.views : metric === "followers" ? data.followers : data.engagement;

  return (
    <section className="pa" aria-label="Facebook analytics">
      <header className="pa-head">
        {data.page.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pa-avatar" src={data.page.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="pa-avatar pa-avatar-ph" aria-hidden>f</span>
        )}
        <div className="pa-head-meta">
          <h2>{data.page.name ?? "Facebook Page"}</h2>
          <small>Facebook{data.page.username ? ` · @${data.page.username}` : ""}</small>
        </div>
        <span className="pa-badge facebook">Facebook</span>
      </header>

      <div className="ov-kpis four">
        {data.stats.map((s: FbStat) => {
          const t = TILE[s.key] ?? TILE.posts;
          return <StatTile key={s.key} Icon={t.Icon} tone={t.tone} label={s.label} value={s.value} note={s.note} status={s.status} />;
        })}
      </div>

      <section className="ov-card">
        <div className="ov-card-head wrap">
          <h2>Performance over time</h2>
          <div className="pa-controls">
            <div className="ov-seg" role="tablist" aria-label="Metric">
              <button className={metric === "views" ? "on" : ""} onClick={() => setMetric("views")} disabled={!canViews} title={canViews ? "" : "Needs the read_insights permission — reconnect Facebook"}>Views</button>
              <button className={metric === "followers" ? "on" : ""} onClick={() => setMetric("followers")} disabled={!canFollowers} title={canFollowers ? "" : "No follower history yet"}>Followers</button>
              <button className={metric === "engagement" ? "on" : ""} onClick={() => setMetric("engagement")} disabled={!canEngagement} title={canEngagement ? "" : "No engagement data yet"}>Engagement</button>
            </div>
            <div className="ov-seg" role="tablist" aria-label="Grouping">
              <button className={gran === "day" ? "on" : ""} onClick={() => setGran("day")}>Daily</button>
              <button className={gran === "week" ? "on" : ""} onClick={() => setGran("week")}>Weekly</button>
            </div>
          </div>
        </div>
        <OverviewChart series={series} granularity={gran} showPrevious={false} height={260} />
        <p className="pa-note">{series.note}</p>
      </section>

      <section className="ov-card">
        <div className="ov-card-head"><h2>Top posts</h2><span className="ov-card-sub">by engagement</span></div>
        {data.topPosts.length ? (
          <ul className="pa-posts">
            {data.topPosts.map((p) => (
              <li key={p.id} className="pa-post">
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" width={52} height={52} />
                ) : (
                  <span className="pa-post-ph" aria-hidden />
                )}
                <span className="pa-post-title" title={p.title}>{p.title}</span>
                <span className="pa-post-stats">
                  <em>{p.reactions != null ? `${fmtNum(p.reactions)} reactions` : "—"}</em>
                  <em>{p.comments != null ? `${fmtNum(p.comments)} comments` : "—"}</em>
                  <em>{p.shares != null ? `${fmtNum(p.shares)} shares` : "—"}</em>
                </span>
                {p.permalink && (
                  <a className="pa-post-link" href={p.permalink} target="_blank" rel="noopener noreferrer" aria-label="Open on Facebook"><ExternalLink size={14} /></a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="ov-empty small"><b>No posts in this range</b><p>Posts you publish to this Page will appear here with their engagement.</p></div>
        )}
      </section>

      <section className="ov-card pa-unavail">
        <div className="ov-card-head"><h2><Info size={15} /> Not available from Facebook</h2></div>
        <ul>
          {data.unavailable.map((u) => (
            <li key={u.label}><b>{u.label}</b><span>{u.why}</span></li>
          ))}
        </ul>
      </section>
    </section>
  );
}
