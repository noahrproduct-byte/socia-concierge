// TikTok analytics panel. Server component: no interactivity and no chart,
// because TikTok's API gives no daily series. It shows real per-video totals
// and says so honestly, rather than drawing a fabricated trend line.

import { Film, LineChart } from "lucide-react";
import { Card, CardHeader, CardSource, Empty, KpiCell, KpiStrip, PlatformMark, TableWrap, Unavailable } from "@/components/system";
import { fmtNum } from "@/lib/overview";
import type { TikTokAnalyticsData, TtStat } from "@/lib/metrics/tiktok";
import "@/app/(app)/analytics/analytics.css";

const NOT_RETURNED = "TikTok didn't return this count";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const count = (n: number | null) => (n == null ? <Unavailable reason={NOT_RETURNED} compact /> : fmtNum(n));

export default function TikTokAnalytics({ data }: { data: TikTokAnalyticsData }) {
  const byViews = data.topVideos.some((v) => v.views != null);
  return (
    <section className="an-stack" aria-label="TikTok analytics">
      <header className="an-panel-head">
        {data.profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="an-avatar" src={data.profile.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="an-avatar is-ph" aria-hidden>
            <PlatformMark platform="tiktok" />
          </span>
        )}
        <div className="an-panel-meta">
          <b>{data.profile.name ?? "TikTok"}</b>
          <small>
            TikTok{data.profile.username ? ` · @${data.profile.username}` : ""}
            {data.profile.verified ? " · Verified" : ""}
          </small>
        </div>
      </header>

      <KpiStrip cols={4}>
        {data.stats.map((s: TtStat) => (
          <KpiCell key={s.key} label={s.label} value={s.status === "unavailable" ? null : s.value} reason={s.note} note={s.status === "unavailable" ? undefined : s.note} />
        ))}
      </KpiStrip>

      <Card flush>
        <CardHeader title="Top videos" period={`by ${byViews ? "views" : "engagement"}`} />
        {data.topVideos.length ? (
          <TableWrap>
            <table className="s-table s-table--stack">
              <thead>
                <tr>
                  <th>Video</th>
                  <th className="num">Views</th>
                  <th className="num">Likes</th>
                  <th className="num">Comments</th>
                  <th className="num">Shares</th>
                </tr>
              </thead>
              <tbody>
                {data.topVideos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="an-cell-media">
                        {v.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="an-thumb" src={v.cover} alt="" width={40} height={40} />
                        ) : (
                          <span className="an-thumb is-ph" aria-hidden>
                            <Film />
                          </span>
                        )}
                        <span className="an-cell-text">
                          {v.url ? (
                            <a className="s-link an-clamp" href={v.url} target="_blank" rel="noopener noreferrer">
                              {v.title}
                              <span className="s-sr"> (opens on TikTok)</span>
                            </a>
                          ) : (
                            <span className="id an-clamp">{v.title}</span>
                          )}
                          {v.published && <span className="sub">{fmtDay(v.published)}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="num key" data-label="Views">{count(v.views)}</td>
                    <td className="num" data-label="Likes">{count(v.likes)}</td>
                    <td className="num" data-label="Comments">{count(v.comments)}</td>
                    <td className="num" data-label="Shares">{count(v.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="an-inset">
            <Empty>
              <b>No videos synced yet.</b> Your recent TikTok videos will appear here with their view and engagement counts.
            </Empty>
          </div>
        )}
        <CardSource className="an-inset">
          TikTok gives totals only, so these are each video&apos;s lifetime counts, not counts inside the {data.rangeLabel.toLowerCase()}. {data.videosInRange} {data.videosInRange === 1 ? "video" : "videos"} published in the period.
        </CardSource>
      </Card>

      <div className="an-two">
        <Card>
          <CardHeader title="Performance history" />
          <div className="s-empty">
            <LineChart aria-hidden />
            <p>
              <b>A daily trend isn&apos;t available for TikTok.</b> {data.historyNote}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Not available from TikTok" />
          <ul className="an-unavail">
            {data.unavailable.map((u) => (
              <li key={u.label}>
                <b>{u.label}</b>
                <span>{u.why}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
