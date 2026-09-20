// YouTube analytics panel for the signed-in user's own channel. Server
// component: it receives already-fetched real data and renders it. No numbers
// are estimated; a value Google omits shows as "—".

import type { YouTubeAnalytics as YtData } from "@/lib/youtubeData";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}
function hours(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = minutes / 60;
  return h >= 1000 ? fmt(Math.round(h)) + " h" : h.toFixed(h >= 10 ? 0 : 1).replace(/\.0$/, "") + " h";
}

export default function YouTubeAnalytics({ data, rangeLabel }: { data: YtData; rangeLabel: string }) {
  const { channel, range, series, topVideos, demographics, note } = data;
  const maxViews = Math.max(1, ...series.map((d) => d.views));
  const maxDemo = Math.max(1, ...demographics.map((d) => d.value));

  return (
    <section className="yta">
      <div className="yta-head">
        {channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="yta-avatar" src={channel.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="yta-avatar yta-avatar-ph" aria-hidden>▶</span>
        )}
        <div className="yta-head-meta">
          <h2>{channel.title}</h2>
          <small>YouTube{channel.handle ? ` · ${channel.handle}` : ""}</small>
        </div>
        <span className="yta-badge">YouTube</span>
      </div>

      {/* lifetime + range totals, every figure straight from the API */}
      <div className="yta-kpis">
        <div className="yta-kpi"><b>{fmt(channel.subscribers)}</b><small>Subscribers</small></div>
        <div className="yta-kpi"><b>{fmt(channel.totalViews)}</b><small>Total views</small></div>
        <div className="yta-kpi"><b>{fmt(channel.videoCount)}</b><small>Videos</small></div>
        <div className="yta-kpi"><b>{range ? fmt(range.views) : "—"}</b><small>Views · {rangeLabel.toLowerCase()}</small></div>
        <div className="yta-kpi"><b>{range ? hours(range.minutes) : "—"}</b><small>Watch time</small></div>
        <div className="yta-kpi"><b>{range ? (range.subs >= 0 ? "+" : "") + fmt(range.subs) : "—"}</b><small>Subscribers</small></div>
      </div>

      {series.length > 0 ? (
        <div className="yta-block">
          <div className="yta-block-head">Daily views · {rangeLabel.toLowerCase()}</div>
          <svg className="yta-chart" viewBox={`0 0 ${Math.max(series.length * 6, 60)} 60`} preserveAspectRatio="none" role="img" aria-label={`Daily YouTube views for ${rangeLabel}`}>
            {series.map((d, i) => {
              const h = (d.views / maxViews) * 56;
              return <rect key={d.day} x={i * 6} y={60 - h} width={5} height={Math.max(h, 0.5)} className="yta-bar" />;
            })}
          </svg>
        </div>
      ) : note ? (
        <p className="yta-note">{note}</p>
      ) : null}

      {demographics.length > 0 && (
        <div className="yta-block">
          <div className="yta-block-head">Audience by age</div>
          <ul className="yta-demo">
            {demographics.map((d) => (
              <li key={d.label}>
                <span className="yta-demo-lab">{d.label}</span>
                <span className="yta-demo-track"><i style={{ width: `${(d.value / maxDemo) * 100}%` }} /></span>
                <span className="yta-demo-val">{d.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topVideos.length > 0 && (
        <div className="yta-block">
          <div className="yta-block-head">Recent videos</div>
          <ul className="yta-vids">
            {topVideos.map((v) => (
              <li key={v.videoId}>
                {v.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumb} alt="" width={72} height={40} />
                ) : (
                  <span className="yta-vid-ph" aria-hidden />
                )}
                <span className="yta-vid-title" title={v.title}>{v.title}</span>
                <span className="yta-vid-stats">
                  <em>{fmt(v.views)} views</em>
                  <em>{fmt(v.likes)} likes</em>
                  <em>{fmt(v.comments)} comments</em>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
