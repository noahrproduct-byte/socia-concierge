// TikTok analytics panel. Server component — no interactivity, no chart,
// because TikTok's API gives no daily series. It shows real per-video totals
// and says so honestly, rather than drawing a fabricated trend line.

import { Users, Heart, Film, BarChart3, ExternalLink, Info, LineChart } from "lucide-react";
import StatTile from "./ov/StatTile";
import { fmtNum } from "@/lib/overview";
import type { TikTokAnalyticsData, TtStat } from "@/lib/metrics/tiktok";
import "./platformAnalytics.css";

const TILE: Record<string, { Icon: typeof Users; tone: string }> = {
  followers: { Icon: Users, tone: "info" },
  likes: { Icon: Heart, tone: "pink" },
  videos: { Icon: Film, tone: "primary" },
  avg: { Icon: BarChart3, tone: "success" },
};

export default function TikTokAnalytics({ data }: { data: TikTokAnalyticsData }) {
  return (
    <section className="pa" aria-label="TikTok analytics">
      <header className="pa-head">
        {data.profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pa-avatar" src={data.profile.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="pa-avatar pa-avatar-ph" aria-hidden>t</span>
        )}
        <div className="pa-head-meta">
          <h2>{data.profile.name ?? "TikTok"}</h2>
          <small>TikTok{data.profile.username ? ` · @${data.profile.username}` : ""}{data.profile.verified ? " · Verified" : ""}</small>
        </div>
        <span className="pa-badge tiktok">TikTok</span>
      </header>

      <div className="ov-kpis four">
        {data.stats.map((s: TtStat) => {
          const t = TILE[s.key] ?? TILE.videos;
          return <StatTile key={s.key} Icon={t.Icon} tone={t.tone} label={s.label} value={s.value} note={s.note} status={s.status} />;
        })}
      </div>

      <section className="ov-card">
        <div className="ov-card-head"><h2>Top videos</h2><span className="ov-card-sub">by {data.topVideos.some((v) => v.views != null) ? "views" : "engagement"}</span></div>
        {data.topVideos.length ? (
          <ul className="pa-posts">
            {data.topVideos.map((v) => (
              <li key={v.id} className="pa-post">
                {v.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.cover} alt="" width={52} height={52} />
                ) : (
                  <span className="pa-post-ph" aria-hidden />
                )}
                <span className="pa-post-title" title={v.title}>{v.title}</span>
                <span className="pa-post-stats">
                  <em>{v.views != null ? `${fmtNum(v.views)} views` : "—"}</em>
                  <em>{v.likes != null ? `${fmtNum(v.likes)} likes` : "—"}</em>
                  <em>{v.comments != null ? `${fmtNum(v.comments)} comments` : "—"}</em>
                </span>
                {v.url && (
                  <a className="pa-post-link" href={v.url} target="_blank" rel="noopener noreferrer" aria-label="Open on TikTok"><ExternalLink size={14} /></a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="ov-empty small"><b>No videos synced yet</b><p>Your recent TikTok videos will appear here with their view and engagement counts.</p></div>
        )}
      </section>

      <section className="ov-card">
        <div className="ov-card-head"><h2><LineChart size={15} /> Performance history</h2></div>
        <div className="ov-empty"><b>A daily trend isn't available for TikTok</b><p>{data.historyNote}</p></div>
      </section>

      <section className="ov-card pa-unavail">
        <div className="ov-card-head"><h2><Info size={15} /> Not available from TikTok</h2></div>
        <ul>
          {data.unavailable.map((u) => (
            <li key={u.label}><b>{u.label}</b><span>{u.why}</span></li>
          ))}
        </ul>
      </section>
    </section>
  );
}
