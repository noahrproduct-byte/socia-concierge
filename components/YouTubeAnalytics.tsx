"use client";

// YouTube analytics, built to the same standard as the Instagram page but
// around what matters on YouTube: watch time, retention, subscribers, Shorts
// vs long-form and how viewers find the channel. Every figure arrives computed
// on the server from YouTube's own reports (lib/metrics/youtube.ts); a report
// YouTube didn't return shows as "not available", never as a zero.

import { useMemo, useState } from "react";
import { Eye, Clock, Users, Timer, Lightbulb, ArrowRight, ExternalLink, Info, ListChecks, Play } from "lucide-react";
import OverviewChart from "./ov/OverviewChart";
import StatTile from "./ov/StatTile";
import WhatChanged from "./ov/WhatChanged";
import PostingHeatmap from "./ov/PostingHeatmap";
import Mounted from "./ov/Mounted";
import { InsightList } from "./ov/Insights";
import DateRangeSelector from "./DateRangeSelector";
import { Locked, type AnalyticsGate } from "./AnalyticsV3";
import { fmtNum, seriesBaseline, type Granularity } from "@/lib/overview";
import { fmtClock, fmtHours, type YouTubeAnalyticsData, type YtMetric, type YtShare, type YtVideoRow } from "@/lib/metrics/youtube";
import "./planRange.css";
import "./platformAnalytics.css";

type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content Performance"], ["audience", "Audience"], ["times", "Posting Times"], ["growth", "Growth"]];
const METRICS: [YtMetric, string][] = [["views", "Views"], ["watch_time", "Watch time"], ["subscribers", "Subscribers"], ["engagement", "Engagement"]];
const KPI_ICON = { views: { Icon: Eye, tone: "primary" }, watch: { Icon: Clock, tone: "info" }, subs: { Icon: Users, tone: "success" }, avd: { Icon: Timer, tone: "pink" } } as const;
const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };

const fmtDay = (day: string | null) => (day ? new Date(day.length > 10 ? day : day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const mult = (x: number | null) => (x == null ? "—" : `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`);

function ShareBars({ items, empty }: { items: YtShare[] | null; empty: string }) {
  if (items == null) return <div className="ov-empty small"><b>Not available</b><p>{empty}</p></div>;
  if (!items.length) return <div className="ov-empty small">No views recorded in this period.</div>;
  const max = Math.max(...items.map((i) => i.share), 0.0001);
  return (
    <ul className="ov-bars wide">
      {items.map((i) => (
        <li key={i.label} title={`${i.value.toLocaleString("en-US")} views`}>
          <span className="ov-bars-label">{i.label}</span>
          <span className="ov-bars-track"><i style={{ width: `${(i.share / max) * 100}%` }} /></span>
          <b>{Math.round(i.share * 100)}%</b>
        </li>
      ))}
    </ul>
  );
}

function VideoTable({ rows, basis, compact = false }: { rows: YtVideoRow[]; basis: "range" | "lifetime"; compact?: boolean }) {
  return (
    <div className="dsh-tablescroll">
      <table className="dsh-table yt-table">
        <thead>
          <tr>
            <th>Video</th>
            <th className="num">Views</th>
            {basis === "range" && <th className="num">Watch time</th>}
            {basis === "range" && <th className="num">Avg duration</th>}
            {basis === "range" && !compact && <th className="num">% viewed</th>}
            {!compact && <th className="num">Likes</th>}
            {!compact && <th className="num">Comments</th>}
            {basis === "range" && !compact && <th className="num">Shares</th>}
            {basis === "range" && !compact && <th className="num">Subs</th>}
            <th className="num">vs median</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>
                <a className="yt-vid" href={v.url} target="_blank" rel="noopener noreferrer">
                  {v.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumb} alt="" width={64} height={36} />
                  ) : <span className="yt-vid-ph" aria-hidden><Play size={12} /></span>}
                  <span className="yt-vid-meta">
                    <b title={v.title}>{v.title}</b>
                    <small>
                      {v.type && <i className={`yt-type ${v.type === "Short" ? "short" : "long"}`}>{v.type}</i>}
                      {v.publishedAt ? fmtDay(v.publishedAt) : ""}{v.durationSec != null ? ` · ${fmtClock(v.durationSec)}` : ""}
                    </small>
                  </span>
                  <ExternalLink size={12} className="yt-vid-ext" />
                </a>
              </td>
              <td className="num">{fmtNum(v.views)}</td>
              {basis === "range" && <td className="num">{fmtHours(v.minutes)}</td>}
              {basis === "range" && <td className="num">{fmtClock(v.avgViewDurationSec)}</td>}
              {basis === "range" && !compact && <td className="num">{v.avgViewPct != null ? `${v.avgViewPct.toFixed(0)}%` : "—"}</td>}
              {!compact && <td className="num">{v.likes != null ? fmtNum(v.likes) : "—"}</td>}
              {!compact && <td className="num">{v.comments != null ? fmtNum(v.comments) : "—"}</td>}
              {basis === "range" && !compact && <td className="num">{v.shares != null ? fmtNum(v.shares) : "—"}</td>}
              {basis === "range" && !compact && <td className="num">{v.subsGained != null ? `+${v.subsGained}` : "—"}</td>}
              <td className="num"><span className={`yt-mult${v.multiplier != null && v.multiplier >= 3 ? " hot" : v.multiplier != null && v.multiplier < 0.7 ? " cold" : ""}`}>{mult(v.multiplier)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function YouTubeAnalytics({ data: d, gate: gateIn, maxDays }: { data: YouTubeAnalyticsData; gate?: AnalyticsGate; maxDays?: number }) {
  const gate = gateIn ?? OPEN_GATE;
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<YtMetric>("views");
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [compare, setCompare] = useState(true);
  const [videoTab, setVideoTab] = useState<"top" | "under" | "breakout">("top");

  const series = d.series[metric];
  const baseline = useMemo(() => seriesBaseline(series), [series]);
  const postById = useMemo(() => Object.fromEntries(d.evidence.map((p) => [p.id, p])), [d.evidence]);
  const delta = series.total != null && series.prevTotal != null && series.prevTotal > 0 ? ((series.total - series.prevTotal) / series.prevTotal) * 100 : null;
  const granOptions: [Granularity, string][] = d.rangeDays >= 90 ? [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]] : [["day", "Daily"], ["week", "Weekly"]];
  const jumpTab = (t: "content" | "audience" | "times" | "growth") => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const videoRows = useMemo(() => {
    if (videoTab === "under") return d.videos.filter((v) => v.multiplier != null && v.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0));
    if (videoTab === "breakout") return d.videos.filter((v) => v.multiplier != null && v.multiplier >= 3);
    return d.videos;
  }, [d.videos, videoTab]);
  const basisLabel = d.videoBasis === "range" ? `stats inside the ${d.rangeLabel.toLowerCase()}` : "lifetime public totals";
  const medianLabel = d.medianViews != null ? `Median video ${fmtNum(Math.round(d.medianViews))} views` : "No baseline yet";
  const summaryValue = series.total == null ? "—" : metric === "watch_time" ? fmtHours(series.total) : fmtNum(series.total);

  return (
    <div className="av yta2">
      <header className="pa-head">
        {d.channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pa-avatar" src={d.channel.avatar} alt="" width={40} height={40} />
        ) : <span className="pa-avatar pa-avatar-ph" aria-hidden>▶</span>}
        <div className="pa-head-meta">
          <h2>{d.channel.title}</h2>
          <small>YouTube{d.channel.handle ? ` · ${d.channel.handle}` : ""}{d.channel.subscribers != null ? ` · ${d.channel.subscribers.toLocaleString("en-US")} subscribers` : ""}</small>
        </div>
        <div className="pa-head-actions">
          <Mounted fallback={<span className="ov-ctl-ph" aria-hidden />}>
            <DateRangeSelector maxDays={maxDays} />
          </Mounted>
        </div>
      </header>

      <nav className="av-tabs" aria-label="YouTube analytics sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "true" : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {d.note && <p className="pa-note" role="status">{d.note}</p>}

      {/* ================================================== OVERVIEW */}
      {tab === "overview" && (
        <>
          <div className="ov-kpis four">
            {d.kpis.map((k) => {
              const t = KPI_ICON[k.key];
              return <StatTile key={k.key} Icon={t.Icon} tone={t.tone} label={k.label} value={k.value} note={gate.comparison && k.delta ? d.rangeLabel.toLowerCase() : k.note} status={k.status} delta={gate.comparison ? null : k.delta} positive={k.positive} />;
            })}
          </div>

          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="yt-perf-h">
                <div className="ov-card-head wrap">
                  <h2 id="yt-perf-h">Performance Over Time</h2>
                  <div className="ov-seg" role="tablist" aria-label="Metric">
                    {METRICS.map(([m, label]) => (
                      <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? "on" : ""} disabled={d.series[m].provenance === "unavailable"} title={d.series[m].note} onClick={() => setMetric(m)}>{label}</button>
                    ))}
                  </div>
                  <div className="av-controls">
                    <div className="ov-seg" role="group" aria-label="Group by">
                      {granOptions.map(([g, label]) => (
                        <button key={g} type="button" className={gran === g ? "on" : ""} aria-pressed={gran === g} onClick={() => setGran(g)}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="av-perf-summary">
                  <b>{summaryValue}</b>
                  <span>{metric === "watch_time" ? "watched" : series.label.toLowerCase()} in the {d.rangeLabel.toLowerCase()}</span>
                  {!gate.comparison && delta != null && <em className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}% vs. previous period</em>}
                  {!gate.comparison && series.prevTotal == null && series.total != null && <em className="muted">no comparable previous period yet</em>}
                  {baseline && <em className="muted">· {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}</em>}
                  <span className="av-perf-ctl">
                    {!gate.comparison && series.previous.length > 0 && <button type="button" className={`ov-toggle${compare ? " on" : ""}`} aria-pressed={compare} onClick={() => setCompare((v) => !v)}>vs. previous</button>}
                  </span>
                </div>
                <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison} height={260} baseline={baseline} postById={postById} today={d.today} />
                <p className="ov-source">{series.note}</p>
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="yt-ins-h">
                <div className="ov-card-head">
                  <h2 id="yt-ins-h"><span className="ov-h-ico primary"><Lightbulb size={14} /></span> Key Insights</h2>
                </div>
                {!d.insights.length ? (
                  <div className="ov-empty small">Nothing stands out against your own baseline in this period yet. Insights appear when a video, format or trend moves clearly away from your typical numbers.</div>
                ) : gate.deeperInsights ? (
                  <>
                    <InsightList insights={d.insights.slice(0, 1)} posts={d.evidence} compact onTab={jumpTab} />
                    <Locked plan={gate.deeperInsights} title="What's working, and what to do next" blurb={d.insights.length > 1 ? `SOCIA found ${d.insights.length - 1} more ${d.insights.length - 1 === 1 ? "insight" : "insights"} in your YouTube data.` : "See What Changed and What To Do Next, drawn from your own channel."} from="youtube_insights" />
                  </>
                ) : (
                  <InsightList insights={d.insights.slice(0, 5)} posts={d.evidence} compact onTab={jumpTab} />
                )}
              </section>
            </aside>
          </div>

          <section className="ov-card" aria-labelledby="yt-wc-h">
            <div className="ov-card-head">
              <h2 id="yt-wc-h">What changed</h2>
              <span className="ov-card-sub">{d.rangeLabel} against the {d.rangeDays} days before{d.lastDay && d.lastDay < d.today ? `, both ending ${fmtDay(d.lastDay)}` : ""}.</span>
            </div>
            {gate.comparison ? (
              <Locked plan={gate.comparison} title="Previous-period comparisons" blurb="See how views, watch time, subscribers and retention moved against the period before." from="youtube_what_changed" />
            ) : (
              <WhatChanged items={d.changes} />
            )}
          </section>

          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="yt-top-h">
                <div className="ov-card-head wrap">
                  <h2 id="yt-top-h">What&apos;s working</h2>
                  <span className="ov-range-label">Top videos · {basisLabel}</span>
                  <button type="button" className="ov-link" onClick={() => jumpTab("content")}>All videos <ArrowRight size={13} /></button>
                </div>
                {d.videos.length ? <VideoTable rows={d.videos.slice(0, 5)} basis={d.videoBasis} compact /> : <div className="ov-empty small">No videos with views in this period.</div>}
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="yt-next-h">
                <div className="ov-card-head">
                  <h2 id="yt-next-h"><span className="ov-h-ico success"><ListChecks size={14} /></span> What to do next</h2>
                </div>
                {gate.deeperInsights ? (
                  <Locked plan={gate.deeperInsights} title="Recommendations" blurb="Specific next steps, each tied to the numbers behind it." from="youtube_next_steps" />
                ) : d.nextSteps.length ? (
                  <ol className="pa-steps">
                    {d.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                ) : (
                  <div className="ov-empty small">No recommendation SOCIA can back with your data yet. They appear alongside insights.</div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {/* ================================================== CONTENT */}
      {tab === "content" && (
        <>
          <section className="ov-card" aria-labelledby="yt-ct-h">
            <div className="ov-card-head wrap">
              <h2 id="yt-ct-h">Video performance</h2>
              <div className="ov-seg" role="tablist" aria-label="Video view">
                {([["top", "Top videos"], ["under", "Underperforming"], ["breakout", "Breakouts"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={videoTab === id} className={videoTab === id ? "on" : ""} onClick={() => setVideoTab(id)}>{label}</button>
                ))}
              </div>
              <span className="ov-range-label">{medianLabel} · {basisLabel}</span>
            </div>
            {videoTab === "under" && !videoRows.length && <div className="ov-empty small">No video fell below 70% of your median views{d.videos.length < 5 ? " (a baseline needs at least five videos)" : ""}.</div>}
            {videoTab === "breakout" && !videoRows.length && <div className="ov-empty small">No video reached 3× your median views{d.videos.length < 5 ? " (a baseline needs at least five videos)" : ""}.</div>}
            {videoTab === "top" && !videoRows.length && <div className="ov-empty small">No videos with views in this period.</div>}
            {videoRows.length > 0 && <VideoTable rows={videoRows} basis={d.videoBasis} />}
            <p className="ov-source">
              {d.videoBasis === "range" ? `Top ${d.videos.length} videos by views inside the period, from YouTube Analytics. “vs median” compares each video with the median of this list.` : "YouTube didn't return per-video stats for this period, so these are lifetime public totals — newer uploads have had less time to collect views."}
            </p>
          </section>

          <div className="av-two">
            <section className="ov-card" aria-labelledby="yt-fmt-h">
              <div className="ov-card-head">
                <h2 id="yt-fmt-h">Shorts vs long-form</h2>
                <span className="ov-range-label">YouTube&apos;s own classification · {d.rangeLabel}</span>
              </div>
              {d.formats == null ? (
                <div className="ov-empty small"><b>Not available</b><p>YouTube didn&apos;t return its content-type report for this channel.</p></div>
              ) : !d.formats.length ? (
                <div className="ov-empty small">No views recorded in this period.</div>
              ) : (
                <>
                  <div className="dsh-tablescroll">
                    <table className="dsh-table av-fmt">
                      <thead><tr><th>Format</th><th className="num">Views</th><th className="num">Share</th><th className="num">Watch time</th><th className="num">Videos</th><th className="num">Median views</th></tr></thead>
                      <tbody>
                        {d.formats.map((f) => (
                          <tr key={f.key}>
                            <td>{f.label}</td>
                            <td className="num">{fmtNum(f.views)}</td>
                            <td className="num">{Math.round(f.share * 100)}%</td>
                            <td className="num">{fmtHours(f.minutes)}</td>
                            <td className="num">{f.videos != null ? f.videos : "—"}</td>
                            <td className="num">{f.medianViews != null ? fmtNum(Math.round(f.medianViews)) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="ov-source">Views and watch time are totals for the period. Median views needs at least three videos of a format among the period&apos;s top videos.</p>
                </>
              )}
            </section>
            <section className="ov-card" aria-labelledby="yt-up-h">
              <div className="ov-card-head">
                <h2 id="yt-up-h">Publishing</h2>
                <span className="ov-range-label">{d.rangeLabel}</span>
              </div>
              <div className="au-stats">
                <div><small>Published</small><b>{d.uploads.inRange}</b></div>
                <div><small>Per week</small><b>{d.uploads.perWeek != null ? d.uploads.perWeek.toFixed(1) : "—"}</b></div>
                <div><small>Uploads analysed</small><b>{d.uploads.analysed}{d.uploads.total != null ? ` of ${d.uploads.total}` : ""}</b></div>
              </div>
              <p className="ov-source">Counts public uploads from your channel&apos;s uploads list{d.uploads.total != null && d.uploads.analysed < d.uploads.total ? `; SOCIA reads the ${d.uploads.analysed} most recent` : ""}.</p>
            </section>
          </div>
        </>
      )}

      {/* ================================================== AUDIENCE */}
      {tab === "audience" && (
        <>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="yt-age-h">
              <div className="ov-card-head"><h2 id="yt-age-h">Viewers by age</h2><span className="ov-range-label">share of views · {d.rangeLabel}</span></div>
              {d.audience.ages.length ? (
                <ul className="ov-bars">
                  {d.audience.ages.map((a) => (
                    <li key={a.label}><span className="ov-bars-label">{a.label}</span><span className="ov-bars-track"><i style={{ width: `${(a.value / Math.max(...d.audience.ages.map((x) => x.value), 0.0001)) * 100}%` }} /></span><b>{a.value}%</b></li>
                  ))}
                </ul>
              ) : <div className="ov-empty small"><b>Not available</b><p>YouTube only reports demographics once a channel has enough signed-in viewers in the period.</p></div>}
            </section>
            <section className="ov-card" aria-labelledby="yt-gen-h">
              <div className="ov-card-head"><h2 id="yt-gen-h">Viewers by gender</h2><span className="ov-range-label">share of views · {d.rangeLabel}</span></div>
              {d.audience.genders.length ? (
                <ul className="ov-bars">
                  {d.audience.genders.map((a) => (
                    <li key={a.label}><span className="ov-bars-label">{a.label}</span><span className="ov-bars-track"><i style={{ width: `${(a.value / Math.max(...d.audience.genders.map((x) => x.value), 0.0001)) * 100}%` }} /></span><b>{a.value}%</b></li>
                  ))}
                </ul>
              ) : <div className="ov-empty small"><b>Not available</b><p>YouTube only reports demographics once a channel has enough signed-in viewers in the period.</p></div>}
            </section>
          </div>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="yt-src-h">
              <div className="ov-card-head"><h2 id="yt-src-h">How viewers find you</h2><span className="ov-range-label">traffic sources · share of views</span></div>
              <ShareBars items={d.audience.traffic} empty="YouTube didn't return the traffic-source report for this channel." />
            </section>
            <section className="ov-card" aria-labelledby="yt-geo-h">
              <div className="ov-card-head"><h2 id="yt-geo-h">Top countries</h2><span className="ov-range-label">share of views</span></div>
              <ShareBars items={d.audience.countries} empty="YouTube didn't return the geography report for this channel." />
            </section>
          </div>
          <section className="ov-card" aria-labelledby="yt-dev-h">
            <div className="ov-card-head"><h2 id="yt-dev-h">Devices</h2><span className="ov-range-label">share of views · {d.rangeLabel}</span></div>
            <ShareBars items={d.audience.devices} empty="YouTube didn't return the device report for this channel." />
          </section>
        </>
      )}

      {/* ================================================== POSTING TIMES */}
      {tab === "times" && (
        <section className="ov-card" aria-labelledby="yt-pt-h">
          <div className="ov-card-head">
            <h2 id="yt-pt-h">Posting Times</h2>
            <span className="ov-card-sub">When your own uploads have performed best, with the sample behind every claim.</span>
          </div>
          {gate.postingTimes ? (
            <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A weekday-by-hour heatmap of your own uploads, each window backed by its real sample size." from="youtube_times_tab" />
          ) : (
            <>
              <Mounted fallback={<div className="ov-empty small">Computing in your time zone…</div>}>
                <PostingHeatmap posts={d.timed} formats={{}} unit="views" />
              </Mounted>
              <p className="ov-source">Based on each upload&apos;s public views against your median upload ({d.timed.length} uploads). Views are lifetime totals, so newer videos have had less time to collect them — read recent uploads with that in mind.</p>
            </>
          )}
        </section>
      )}

      {/* ================================================== GROWTH */}
      {tab === "growth" && gate.growth && (
        <section className="ov-card" aria-labelledby="yt-gr-lock-h">
          <div className="ov-card-head"><h2 id="yt-gr-lock-h">Growth</h2><span className="ov-card-sub">How your views, watch time and subscribers are trending.</span></div>
          <Locked plan={gate.growth} title="Growth analysis" blurb="Trend cards for views, watch time, subscribers and engagement, plus your strong and weak weeks against your typical week." from="youtube_growth_tab" />
        </section>
      )}
      {tab === "growth" && !gate.growth && (
        <>
          <div className="gr-grid">
            {METRICS.map(([m]) => {
              const s = d.series[m];
              const dl = s.total != null && s.prevTotal != null && s.prevTotal > 0 ? ((s.total - s.prevTotal) / s.prevTotal) * 100 : null;
              return (
                <section key={m} className="ov-card gr-card" aria-label={`${s.label} trend`}>
                  <div className="ov-card-head">
                    <h2>{s.label} trend</h2>
                    {!gate.comparison && dl != null && <em className={`gr-delta ${dl >= 0 ? "up" : "down"}`}>{dl >= 0 ? "↑" : "↓"} {Math.abs(dl).toFixed(1)}%</em>}
                  </div>
                  <div className="av-growth-num"><b>{s.total == null ? "—" : m === "watch_time" ? fmtHours(s.total) : fmtNum(s.total)}</b><span>{d.rangeLabel.toLowerCase()}</span></div>
                  <OverviewChart series={s} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={150} compact baseline={seriesBaseline(s)} today={d.today} />
                  <p className="ov-source">{s.note}</p>
                </section>
              );
            })}
          </div>
          <div className="av-two">
            <section className="ov-card" aria-labelledby="yt-subs-h">
              <div className="ov-card-head"><h2 id="yt-subs-h">Subscribers</h2><span className="ov-range-label">{d.rangeLabel}</span></div>
              <div className="au-stats">
                <div><small>Subscribers now</small><b>{d.subscribers.now != null ? d.subscribers.now.toLocaleString("en-US") : "—"}</b></div>
                <div><small>Gained</small><b className="up">{d.subscribers.gained != null ? `+${d.subscribers.gained.toLocaleString("en-US")}` : "—"}</b></div>
                <div><small>Lost</small><b className={d.subscribers.lost ? "down" : ""}>{d.subscribers.lost != null ? `−${d.subscribers.lost.toLocaleString("en-US")}` : "—"}</b></div>
                <div><small>Net change</small><b className={d.subscribers.net == null ? "" : d.subscribers.net >= 0 ? "up" : "down"}>{d.subscribers.net != null ? `${d.subscribers.net >= 0 ? "+" : "−"}${Math.abs(d.subscribers.net).toLocaleString("en-US")}` : "—"}</b></div>
              </div>
              <p className="ov-source">Gained and lost are YouTube&apos;s own daily counts for the period. {d.subscribers.now == null ? "This channel hides its subscriber count." : ""}</p>
            </section>
            <section className="ov-card" aria-labelledby="yt-per-h">
              <div className="ov-card-head"><h2 id="yt-per-h">Growth and decline weeks</h2><span className="ov-range-label">views · 7-day blocks</span></div>
              {d.weeks.median == null ? (
                <div className="ov-empty small">Needs at least four complete weeks in the range to compare weeks with your typical week.</div>
              ) : (
                <ul className="gr-periods">
                  {d.weeks.growth.map((w) => <li key={`g${w.start}`} className="up"><i /><span>{fmtDay(w.start)} – {fmtDay(w.end)}</span><b>{fmtNum(w.value)}</b><small>{w.ratio.toFixed(1)}× typical week</small></li>)}
                  {d.weeks.decline.map((w) => <li key={`d${w.start}`} className="down"><i /><span>{fmtDay(w.start)} – {fmtDay(w.end)}</span><b>{fmtNum(w.value)}</b><small>{Math.round(w.ratio * 100)}% of typical week</small></li>)}
                  {!d.weeks.growth.length && !d.weeks.decline.length && <li className="flat"><span>No week ran far above or below your typical week ({fmtNum(Math.round(d.weeks.median))} views).</span></li>}
                </ul>
              )}
            </section>
          </div>
          <section className="ov-card pa-unavail">
            <div className="ov-card-head"><h2><Info size={15} /> Not available from YouTube</h2></div>
            <ul>
              {d.unavailable.map((u) => <li key={u.label}><b>{u.label}</b><span>{u.why}</span></li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
