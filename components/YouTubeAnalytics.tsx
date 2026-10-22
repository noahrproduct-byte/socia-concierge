"use client";

// YouTube analytics, built to the same standard as the Instagram page but
// around what matters on YouTube: watch time, retention, subscribers, Shorts
// vs long-form and how viewers find the channel. Every figure arrives computed
// on the server from YouTube's own reports (lib/metrics/youtube.ts); a report
// YouTube didn't return shows as "not available", never as a zero.

import { useMemo, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import OverviewChart from "./ov/OverviewChart";
import WhatChanged from "./ov/WhatChanged";
import PostingHeatmap from "./ov/PostingHeatmap";
import Mounted from "./ov/Mounted";
import { InsightList } from "./ov/Insights";
import { Locked, type AnalyticsGate } from "./AnalyticsV3";
import {
  Button,
  Card,
  CardHeader,
  CardSource,
  Checkbox,
  Empty,
  KpiCell,
  KpiStrip,
  PlatformMark,
  SegmentedControl,
  StatusPill,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TableWrap,
  Unavailable,
  type KpiDelta,
} from "@/components/system";
import { fmtNum, seriesBaseline, type Granularity, type Series } from "@/lib/overview";
import { fmtClock, fmtHours, type YouTubeAnalyticsData, type YtKpi, type YtMetric, type YtShare, type YtVideoRow } from "@/lib/metrics/youtube";
import "@/app/(app)/analytics/analytics.css";

type Section = "overview" | "content" | "audience" | "times" | "growth";
const SECTIONS: [Section, string][] = [["overview", "Overview"], ["content", "Content performance"], ["audience", "Audience"], ["times", "Posting times"], ["growth", "Growth"]];
const METRICS: [YtMetric, string][] = [["views", "Views"], ["watch_time", "Watch time"], ["subscribers", "Subscribers"], ["engagement", "Engagement"]];
/** The KPI tiles that double as the chart's metric tabs. */
const KPI_METRIC: Partial<Record<YtKpi["key"], YtMetric>> = { views: "views", watch: "watch_time", subs: "subscribers" };
const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };
const NOT_RETURNED = "YouTube didn't return this count";
const DEMO_REASON = "YouTube only reports demographics once a channel has enough signed-in viewers in the period.";
const DASH = String.fromCharCode(0x2014);

const fmtDay = (day: string | null) => (day ? new Date(day.length > 10 ? day : day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : DASH);
const multText = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const pctChange = (s: Series) => (s.total != null && s.prevTotal != null && s.prevTotal > 0 ? ((s.total - s.prevTotal) / s.prevTotal) * 100 : null);
const pctText = (p: number) => `${p >= 0 ? "↑" : "↓"} ${Math.abs(p).toFixed(1)}%`;
const pctDelta = (p: number | null): KpiDelta | undefined => (p == null ? undefined : { text: pctText(p), tone: p >= 0 ? "good" : "bad" });
const metricValue = (m: YtMetric, total: number | null) => (total == null ? null : m === "watch_time" ? fmtHours(total) : fmtNum(total));

function Mult({ x }: { x: number | null }) {
  if (x == null) return <Unavailable reason="No baseline yet: it needs at least five videos" compact />;
  if (x >= 3) return <StatusPill tone="positive">{multText(x)}</StatusPill>;
  if (x < 0.7) return <StatusPill tone="warning">{multText(x)}</StatusPill>;
  return <>{multText(x)}</>;
}

/** A labelled bar per part: share of views, with the count beside it. */
function ShareBars({ items, empty }: { items: YtShare[] | null; empty: string }) {
  if (items == null)
    return (
      <Empty>
        <b>Not available.</b> {empty}
      </Empty>
    );
  if (!items.length) return <Empty>No views recorded in this period.</Empty>;
  const max = Math.max(...items.map((i) => i.share), 0.0001);
  return (
    <ul className="s-bars">
      {items.map((i) => (
        <li key={i.label}>
          <span>{i.label}</span>
          <span className="s-bars-track" aria-hidden>
            <i style={{ width: `${(i.share / max) * 100}%` }} />
          </span>
          <b>
            {Math.round(i.share * 100)}%<small>{fmtNum(i.value)} views</small>
          </b>
        </li>
      ))}
    </ul>
  );
}

function DemoBars({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length)
    return (
      <Empty>
        <b>Not available.</b> {DEMO_REASON}
      </Empty>
    );
  const max = Math.max(...items.map((x) => x.value), 0.0001);
  return (
    <ul className="s-bars">
      {items.map((a) => (
        <li key={a.label}>
          <span>{a.label}</span>
          <span className="s-bars-track" aria-hidden>
            <i style={{ width: `${(a.value / max) * 100}%` }} />
          </span>
          <b>{a.value}%</b>
        </li>
      ))}
    </ul>
  );
}

function VideoTable({ rows, basis, compact = false }: { rows: YtVideoRow[]; basis: "range" | "lifetime"; compact?: boolean }) {
  const num = (n: number | null, f: (n: number) => string = fmtNum) => (n == null ? <Unavailable reason={NOT_RETURNED} compact /> : f(n));
  return (
    <TableWrap>
      <table className="s-table s-table--stack">
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
                <span className="an-cell-media">
                  {v.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="an-thumb is-wide" src={v.thumb} alt="" width={64} height={36} />
                  ) : (
                    <span className="an-thumb is-wide is-ph" aria-hidden>
                      <Play />
                    </span>
                  )}
                  <span className="an-cell-text">
                    <a className="s-link an-clamp" href={v.url} target="_blank" rel="noopener noreferrer">
                      {v.title}
                      <span className="s-sr"> (opens on YouTube)</span>
                    </a>
                    <span className="sub">
                      {[v.type, v.publishedAt ? fmtDay(v.publishedAt) : null, v.durationSec != null ? fmtClock(v.durationSec) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
              </td>
              <td className="num key" data-label="Views">{fmtNum(v.views)}</td>
              {basis === "range" && <td className="num" data-label="Watch time">{num(v.minutes, (n) => fmtHours(n))}</td>}
              {basis === "range" && <td className="num" data-label="Avg duration">{num(v.avgViewDurationSec, (n) => fmtClock(n))}</td>}
              {basis === "range" && !compact && <td className="num" data-label="% viewed">{num(v.avgViewPct, (n) => `${n.toFixed(0)}%`)}</td>}
              {!compact && <td className="num" data-label="Likes">{num(v.likes)}</td>}
              {!compact && <td className="num" data-label="Comments">{num(v.comments)}</td>}
              {basis === "range" && !compact && <td className="num" data-label="Shares">{num(v.shares)}</td>}
              {basis === "range" && !compact && <td className="num" data-label="Subs">{num(v.subsGained, (n) => `+${n}`)}</td>}
              <td className="num" data-label="vs median"><Mult x={v.multiplier} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export default function YouTubeAnalytics({ data: d, gate: gateIn, maxDays }: { data: YouTubeAnalyticsData; gate?: AnalyticsGate; maxDays?: number }) {
  // The range control lives in the Analytics page's query bar; the prop stays for the page's call.
  void maxDays;
  const gate = gateIn ?? OPEN_GATE;
  const [tab, setTab] = useState<Section>("overview");
  const [metric, setMetric] = useState<YtMetric>("views");
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [compare, setCompare] = useState(true);
  const [videoTab, setVideoTab] = useState<"top" | "under" | "breakout">("top");
  const [trendMetric, setTrendMetric] = useState<YtMetric>("views");

  const series = d.series[metric];
  const baseline = useMemo(() => seriesBaseline(series), [series]);
  const postById = useMemo(() => Object.fromEntries(d.evidence.map((p) => [p.id, p])), [d.evidence]);
  const delta = pctChange(series);
  const granOptions: [Granularity, string][] = d.rangeDays >= 90 ? [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]] : [["day", "Daily"], ["week", "Weekly"]];
  const jumpTab = (t: "content" | "audience" | "times" | "growth") => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const range = d.rangeLabel.toLowerCase();

  const videoRows = useMemo(() => {
    if (videoTab === "under") return d.videos.filter((v) => v.multiplier != null && v.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0));
    if (videoTab === "breakout") return d.videos.filter((v) => v.multiplier != null && v.multiplier >= 3);
    return d.videos;
  }, [d.videos, videoTab]);
  const basisLabel = d.videoBasis === "range" ? `stats inside the ${range}` : "lifetime public totals";
  const medianLabel = d.medianViews != null ? `Median video ${fmtNum(Math.round(d.medianViews))} views` : "No baseline yet";
  const summaryValue = metricValue(metric, series.total) ?? DASH;
  const canCompare = !gate.comparison && series.previous.length > 0;
  const fewVideos = d.videos.length < 5 ? " (a baseline needs at least five videos)" : "";
  const trend = d.series[trendMetric];

  const kpiCells = [
    ...d.kpis.map((k) => {
      const m = KPI_METRIC[k.key];
      const selectable = Boolean(m && d.series[m].provenance !== "unavailable");
      const na = k.status === "unavailable";
      return (
        <KpiCell
          key={k.key}
          label={k.label}
          value={na ? null : k.value}
          reason={k.note}
          delta={!na && !gate.comparison && k.delta ? { text: k.delta, tone: k.positive === false ? "bad" : k.positive ? "good" : undefined } : undefined}
          note={na ? undefined : gate.comparison && k.delta ? range : k.note}
          selected={selectable && metric === m}
          onSelect={selectable ? () => setMetric(m as YtMetric) : undefined}
        />
      );
    }),
    <KpiCell
      key="engagement"
      label="Engagement"
      value={d.series.engagement.provenance === "unavailable" ? null : metricValue("engagement", d.series.engagement.total)}
      reason={d.series.engagement.provenance === "unavailable" ? d.series.engagement.note : "Not reported for this period"}
      delta={gate.comparison ? undefined : pctDelta(pctChange(d.series.engagement))}
      note={d.series.engagement.total != null ? `in the ${range}` : undefined}
      selected={metric === "engagement"}
      onSelect={d.series.engagement.provenance !== "unavailable" ? () => setMetric("engagement") : undefined}
    />,
  ];

  return (
    <section className="an-stack" aria-label="YouTube analytics">
      <header className="an-panel-head">
        {d.channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="an-avatar" src={d.channel.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="an-avatar is-ph" aria-hidden>
            <PlatformMark platform="youtube" />
          </span>
        )}
        <div className="an-panel-meta">
          <b>{d.channel.title}</b>
          <small>
            YouTube{d.channel.handle ? ` · ${d.channel.handle}` : ""}
            {d.channel.subscribers != null ? ` · ${d.channel.subscribers.toLocaleString("en-US")} subscribers` : ""}
          </small>
        </div>
      </header>

      {d.note && (
        <p className="an-next" role="status">
          {d.note}
        </p>
      )}

      <Tabs className="an-stack" value={tab} onValueChange={(v) => setTab(v as Section)}>
        <TabList aria-label="YouTube analytics sections">
          {SECTIONS.map(([id, label]) => (
            <Tab key={id} value={id}>
              {label}
            </Tab>
          ))}
        </TabList>

        {/* ================================================== OVERVIEW */}
        <TabPanel value="overview" className="an-stack">
          <KpiStrip cols={5}>{kpiCells}</KpiStrip>

          <div className="an-grid">
            <Card>
              <div className="an-head">
                <h2 className="s-card-title">{series.label} over time</h2>
                <div className="an-head-end">
                  {canCompare && <Checkbox label="Previous period" checked={compare} onChange={(e) => setCompare(e.target.checked)} />}
                  <SegmentedControl className="s-seg--sm" label="Group by" options={granOptions.map(([value, label]) => ({ value, label }))} value={gran} onChange={setGran} />
                </div>
              </div>
              <div className={`an-stat${series.total == null ? " is-na" : ""}`}>
                <b>{summaryValue}</b>
                <span>
                  {metric === "watch_time" ? "watched" : series.label.toLowerCase()} in the {range}
                </span>
                {!gate.comparison && delta != null && <em className={delta >= 0 ? "is-good" : "is-bad"}>{pctText(delta)} vs previous period</em>}
                {!gate.comparison && series.prevTotal == null && series.total != null && <em>no comparable previous period yet</em>}
                {baseline && (
                  <em>
                    {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}
                  </em>
                )}
              </div>
              <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison} height={260} baseline={baseline} postById={postById} today={d.today} />
              <CardSource>{series.note}</CardSource>
            </Card>

            <Card>
              <CardHeader title="Key insights" />
              {!d.insights.length ? (
                <Empty>
                  <b>Nothing stands out against your own baseline in this period yet.</b> Insights appear when a video, format or trend moves clearly away from your typical numbers.
                </Empty>
              ) : gate.deeperInsights ? (
                <>
                  <InsightList insights={d.insights.slice(0, 1)} posts={d.evidence} compact onTab={jumpTab} />
                  <Locked plan={gate.deeperInsights} title="What's working, and what to do next" blurb={d.insights.length > 1 ? `SOCIA found ${d.insights.length - 1} more ${d.insights.length - 1 === 1 ? "insight" : "insights"} in your YouTube data.` : "See What Changed and What To Do Next, drawn from your own channel."} from="youtube_insights" />
                </>
              ) : (
                <InsightList insights={d.insights.slice(0, 5)} posts={d.evidence} compact onTab={jumpTab} />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="What changed" period={d.rangeLabel} />
            {gate.comparison ? (
              <Locked plan={gate.comparison} title="Previous-period comparisons" blurb="See how views, watch time, subscribers and retention moved against the period before." from="youtube_what_changed" />
            ) : (
              <WhatChanged items={d.changes} />
            )}
            <CardSource>
              {d.rangeLabel} against the {d.rangeDays} days before{d.lastDay && d.lastDay < d.today ? `, both ending ${fmtDay(d.lastDay)}` : ""}.
            </CardSource>
          </Card>

          <div className="an-grid">
            <Card flush>
              <CardHeader
                title="What's working"
                period="Top videos"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => jumpTab("content")}>
                    All videos <ArrowRight />
                  </Button>
                }
              />
              {d.videos.length ? (
                <VideoTable rows={d.videos.slice(0, 5)} basis={d.videoBasis} compact />
              ) : (
                <div className="an-inset">
                  <Empty>No videos with views in this period.</Empty>
                </div>
              )}
              <CardSource className="an-inset">Top videos by views, {basisLabel}.</CardSource>
            </Card>

            <Card>
              <CardHeader title="What to do next" />
              {gate.deeperInsights ? (
                <Locked plan={gate.deeperInsights} title="Recommendations" blurb="Specific next steps, each tied to the numbers behind it." from="youtube_next_steps" />
              ) : d.nextSteps.length ? (
                <ol className="an-steps">
                  {d.nextSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : (
                <Empty>
                  <b>No recommendation SOCIA can back with your data yet.</b> They appear alongside insights.
                </Empty>
              )}
            </Card>
          </div>
        </TabPanel>

        {/* ================================================== CONTENT */}
        <TabPanel value="content" className="an-stack">
          <Card flush>
            <div className="an-head">
              <h2 className="s-card-title">Video performance</h2>
              <span className="s-card-period">
                {medianLabel} · {basisLabel}
              </span>
              <SegmentedControl
                className="s-seg--sm"
                label="Video view"
                options={[
                  { value: "top", label: "Top videos" },
                  { value: "under", label: "Underperforming" },
                  { value: "breakout", label: "Breakouts" },
                ]}
                value={videoTab}
                onChange={setVideoTab}
              />
            </div>
            {!videoRows.length && (
              <div className="an-inset">
                <Empty>
                  {videoTab === "under" && `No video fell below 70% of your median views${fewVideos}.`}
                  {videoTab === "breakout" && `No video reached 3× your median views${fewVideos}.`}
                  {videoTab === "top" && "No videos with views in this period."}
                </Empty>
              </div>
            )}
            {videoRows.length > 0 && <VideoTable rows={videoRows} basis={d.videoBasis} />}
            <CardSource className="an-inset">
              {d.videoBasis === "range"
                ? `Top ${d.videos.length} videos by views inside the period, from YouTube Analytics. "vs median" compares each video with the median of this list. A dash means YouTube didn't return that count.`
                : "YouTube didn't return per-video stats for this period, so these are lifetime public totals. Newer uploads have had less time to collect views."}
            </CardSource>
          </Card>

          <div className="an-two">
            <Card flush>
              <CardHeader title="Shorts vs long-form" period={d.rangeLabel} />
              {d.formats == null ? (
                <div className="an-inset">
                  <Empty>
                    <b>Not available.</b> YouTube didn&apos;t return its content-type report for this channel.
                  </Empty>
                </div>
              ) : !d.formats.length ? (
                <div className="an-inset">
                  <Empty>No views recorded in this period.</Empty>
                </div>
              ) : (
                <TableWrap>
                  <table className="s-table s-table--stack">
                    <thead>
                      <tr>
                        <th>Format</th>
                        <th className="num">Views</th>
                        <th className="num">Share</th>
                        <th className="num">Watch time</th>
                        <th className="num">Videos</th>
                        <th className="num">Median views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.formats.map((f) => (
                        <tr key={f.key}>
                          <td className="id">{f.label}</td>
                          <td className="num key" data-label="Views">{fmtNum(f.views)}</td>
                          <td className="num" data-label="Share">{Math.round(f.share * 100)}%</td>
                          <td className="num" data-label="Watch time">{fmtHours(f.minutes)}</td>
                          <td className="num" data-label="Videos">{f.videos != null ? f.videos : <Unavailable reason="YouTube didn't say how many videos of this format" compact />}</td>
                          <td className="num" data-label="Median views">
                            {f.medianViews != null ? fmtNum(Math.round(f.medianViews)) : <Unavailable reason="Needs at least three videos of this format among the period's top videos" compact />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <CardSource className="an-inset">
                YouTube&apos;s own classification. Views and watch time are totals for the period. Median views needs at least three videos of a format among the period&apos;s top videos.
              </CardSource>
            </Card>
            <Card>
              <CardHeader title="Publishing" period={d.rangeLabel} />
              <dl className="an-stats">
                <div>
                  <dt>Published</dt>
                  <dd>{d.uploads.inRange}</dd>
                </div>
                <div>
                  <dt>Per week</dt>
                  <dd className={d.uploads.perWeek == null ? "is-na" : undefined}>
                    {d.uploads.perWeek != null ? d.uploads.perWeek.toFixed(1) : <Unavailable reason="YouTube hasn't reported days in this period yet" compact />}
                  </dd>
                </div>
                <div>
                  <dt>Uploads analysed</dt>
                  <dd>
                    {d.uploads.analysed}
                    {d.uploads.total != null ? ` of ${d.uploads.total}` : ""}
                  </dd>
                </div>
              </dl>
              <CardSource>Counts public uploads from your channel&apos;s uploads list{d.uploads.total != null && d.uploads.analysed < d.uploads.total ? `; SOCIA reads the ${d.uploads.analysed} most recent` : ""}.</CardSource>
            </Card>
          </div>
        </TabPanel>

        {/* ================================================== AUDIENCE */}
        <TabPanel value="audience" className="an-stack">
          <div className="an-two">
            <Card>
              <CardHeader title="Viewers by age" period={d.rangeLabel} />
              <DemoBars items={d.audience.ages} />
              <CardSource>Share of views.</CardSource>
            </Card>
            <Card>
              <CardHeader title="Viewers by gender" period={d.rangeLabel} />
              <DemoBars items={d.audience.genders} />
              <CardSource>Share of views.</CardSource>
            </Card>
          </div>
          <div className="an-two">
            <Card>
              <CardHeader title="How viewers find you" period={d.rangeLabel} />
              <ShareBars items={d.audience.traffic} empty="YouTube didn't return the traffic-source report for this channel." />
              <CardSource>Traffic sources, as a share of views.</CardSource>
            </Card>
            <Card>
              <CardHeader title="Top countries" period={d.rangeLabel} />
              <ShareBars items={d.audience.countries} empty="YouTube didn't return the geography report for this channel." />
              <CardSource>Share of views.</CardSource>
            </Card>
          </div>
          <Card>
            <CardHeader title="Devices" period={d.rangeLabel} />
            <ShareBars items={d.audience.devices} empty="YouTube didn't return the device report for this channel." />
            <CardSource>Share of views.</CardSource>
          </Card>
        </TabPanel>

        {/* ================================================== POSTING TIMES */}
        <TabPanel value="times" className="an-stack">
          <Card>
            <CardHeader title="Posting times" />
            {gate.postingTimes ? (
              <>
                <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A weekday-by-hour heatmap of your own uploads, each window backed by its real sample size." from="youtube_times_tab" />
                <CardSource>When your own uploads have performed best, with the sample behind every claim.</CardSource>
              </>
            ) : (
              <>
                <Mounted fallback={<p className="an-note">Computing in your time zone…</p>}>
                  <PostingHeatmap posts={d.timed} formats={{}} unit="views" />
                </Mounted>
                <CardSource>
                  When your own uploads have performed best, with the sample behind every claim. Based on each upload&apos;s public views against your median upload ({d.timed.length} uploads). Views are lifetime totals, so newer videos have had less time to collect them; read recent uploads with that in mind.
                </CardSource>
              </>
            )}
          </Card>
        </TabPanel>

        {/* ================================================== GROWTH */}
        <TabPanel value="growth" className="an-stack">
          {gate.growth ? (
            <Card>
              <CardHeader title="Growth" />
              <Locked plan={gate.growth} title="Growth analysis" blurb="Trend cards for views, watch time, subscribers and engagement, plus your strong and weak weeks against your typical week." from="youtube_growth_tab" />
              <CardSource>How your views, watch time and subscribers are trending.</CardSource>
            </Card>
          ) : (
            <>
              <KpiStrip cols={METRICS.length}>
                {METRICS.map(([m]) => {
                  const s = d.series[m];
                  return (
                    <KpiCell
                      key={m}
                      label={`${s.label} trend`}
                      value={metricValue(m, s.total)}
                      reason={s.provenance === "unavailable" ? s.note : "Not reported for this period"}
                      delta={gate.comparison ? undefined : pctDelta(pctChange(s))}
                      note={s.total != null ? range : undefined}
                      selected={trendMetric === m}
                      onSelect={() => setTrendMetric(m)}
                    />
                  );
                })}
              </KpiStrip>
              <Card>
                <CardHeader title={`${trend.label} trend`} period={d.rangeLabel} />
                <OverviewChart series={trend} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={180} compact baseline={seriesBaseline(trend)} today={d.today} />
                <CardSource>{trend.note}</CardSource>
              </Card>

              <div className="an-two">
                <Card>
                  <CardHeader title="Subscribers" period={d.rangeLabel} />
                  <dl className="an-stats">
                    <div>
                      <dt>Subscribers now</dt>
                      <dd className={d.subscribers.now == null ? "is-na" : undefined}>
                        {d.subscribers.now != null ? d.subscribers.now.toLocaleString("en-US") : <Unavailable reason="This channel hides its subscriber count" compact />}
                      </dd>
                    </div>
                    <div>
                      <dt>Gained</dt>
                      <dd className={d.subscribers.gained != null ? "is-good" : "is-na"}>{d.subscribers.gained != null ? `+${d.subscribers.gained.toLocaleString("en-US")}` : <Unavailable reason={NOT_RETURNED} compact />}</dd>
                    </div>
                    <div>
                      <dt>Lost</dt>
                      <dd className={d.subscribers.lost == null ? "is-na" : d.subscribers.lost ? "is-bad" : undefined}>{d.subscribers.lost != null ? `−${d.subscribers.lost.toLocaleString("en-US")}` : <Unavailable reason={NOT_RETURNED} compact />}</dd>
                    </div>
                    <div>
                      <dt>Net change</dt>
                      <dd className={d.subscribers.net == null ? "is-na" : d.subscribers.net >= 0 ? "is-good" : "is-bad"}>
                        {d.subscribers.net != null ? `${d.subscribers.net >= 0 ? "+" : "−"}${Math.abs(d.subscribers.net).toLocaleString("en-US")}` : <Unavailable reason="Needs both gained and lost from YouTube" compact />}
                      </dd>
                    </div>
                  </dl>
                  <CardSource>
                    Gained and lost are YouTube&apos;s own daily counts for the period.{d.subscribers.now == null ? " This channel hides its subscriber count." : ""}
                  </CardSource>
                </Card>
                <Card>
                  <CardHeader title="Growth and decline weeks" period="Views · 7-day blocks" />
                  {d.weeks.median == null ? (
                    <Empty>Needs at least four complete weeks in the range to compare weeks with your typical week.</Empty>
                  ) : (
                    <ul className="an-list an-periods">
                      {d.weeks.growth.map((w) => (
                        <li key={`g${w.start}`} className="is-good">
                          <span>
                            {fmtDay(w.start)} – {fmtDay(w.end)}
                          </span>
                          <b>{fmtNum(w.value)}</b>
                          <small>{w.ratio.toFixed(1)}× typical week</small>
                        </li>
                      ))}
                      {d.weeks.decline.map((w) => (
                        <li key={`d${w.start}`} className="is-bad">
                          <span>
                            {fmtDay(w.start)} – {fmtDay(w.end)}
                          </span>
                          <b>{fmtNum(w.value)}</b>
                          <small>{Math.round(w.ratio * 100)}% of typical week</small>
                        </li>
                      ))}
                      {!d.weeks.growth.length && !d.weeks.decline.length && (
                        <li>
                          <span>No week ran far above or below your typical week ({fmtNum(Math.round(d.weeks.median))} views).</span>
                        </li>
                      )}
                    </ul>
                  )}
                </Card>
              </div>
              <Card>
                <CardHeader title="Not available from YouTube" />
                <ul className="an-unavail">
                  {d.unavailable.map((u) => (
                    <li key={u.label}>
                      <b>{u.label}</b>
                      <span>{u.why}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </TabPanel>
      </Tabs>
    </section>
  );
}
