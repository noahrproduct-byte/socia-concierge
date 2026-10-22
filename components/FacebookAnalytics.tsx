"use client";

// Facebook analytics, to the same standard as the Instagram and YouTube pages
// but shaped around what a Page actually offers: followers (SOCIA's own daily
// history plus Facebook's follows/unfollows), Page views from Insights, and
// every post measured against the Page's own median. There is no Audience tab:
// Meta provides no audience demographics for Pages, and the page says so
// instead of leaving an empty section. Figures arrive computed on the server
// (lib/metrics/facebook.ts); unavailable is never shown as zero.

import { useMemo, useState } from "react";
import { ArrowRight, ImageIcon } from "lucide-react";
import OverviewChart from "./ov/OverviewChart";
import FollowerChart from "./ov/FollowerChart";
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
import type { FollowerGranularity } from "@/lib/followers";
import type { FacebookAnalyticsData, FbKpi, FbPostRow } from "@/lib/metrics/facebook";
import "@/app/(app)/analytics/analytics.css";

type Section = "overview" | "content" | "times" | "growth";
const SECTIONS: [Section, string][] = [["overview", "Overview"], ["content", "Content performance"], ["times", "Posting times"], ["growth", "Growth"]];
type Metric = "views" | "engagement" | "followers" | "follows";
/** The KPI tiles that double as the chart's metric tabs. */
const KPI_METRIC: Partial<Record<FbKpi["key"], Metric>> = { followers: "followers", views: "views", engagement: "engagement" };
const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };
const NEEDS_INSIGHTS = "Needs the read_insights permission. Reconnect Facebook.";
const NOT_RETURNED = "Facebook didn't return this count";
const DASH = String.fromCharCode(0x2014);

const fmtDay = (day: string | null) => (day ? new Date(day.length > 10 ? day : day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : DASH);
const multText = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const pctChange = (s: Series | null) => (s && s.total != null && s.prevTotal != null && s.prevTotal > 0 ? ((s.total - s.prevTotal) / s.prevTotal) * 100 : null);
const pctText = (p: number) => `${p >= 0 ? "↑" : "↓"} ${Math.abs(p).toFixed(1)}%`;
const pctDelta = (p: number | null, window?: string): KpiDelta | undefined => (p == null ? undefined : { text: pctText(p), tone: p >= 0 ? "good" : "bad", window });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US")}`;

function Mult({ x }: { x: number | null }) {
  if (x == null) return <Unavailable reason="No baseline yet: it needs five posts with engagement counts" compact />;
  if (x >= 3) return <StatusPill tone="positive">{multText(x)}</StatusPill>;
  if (x < 0.7) return <StatusPill tone="warning">{multText(x)}</StatusPill>;
  return <>{multText(x)}</>;
}

function Count({ n }: { n: number | null }) {
  return n == null ? <Unavailable reason={NOT_RETURNED} compact /> : <>{fmtNum(n)}</>;
}

function PostTable({ rows }: { rows: FbPostRow[] }) {
  return (
    <TableWrap>
      <table className="s-table s-table--stack">
        <thead>
          <tr>
            <th>Post</th>
            <th className="num">Reactions</th>
            <th className="num">Comments</th>
            <th className="num">Shares</th>
            <th className="num">Engagement</th>
            <th className="num">vs median</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="an-cell-media">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="an-thumb is-wide" src={p.thumb} alt="" width={64} height={36} />
                  ) : (
                    <span className="an-thumb is-wide is-ph" aria-hidden>
                      <ImageIcon />
                    </span>
                  )}
                  <span className="an-cell-text">
                    {p.permalink ? (
                      <a className="s-link an-clamp" href={p.permalink} target="_blank" rel="noopener noreferrer">
                        {p.title}
                        <span className="s-sr"> (opens on Facebook)</span>
                      </a>
                    ) : (
                      <span className="id an-clamp">{p.title}</span>
                    )}
                    <span className="sub">{fmtDay(p.published)}</span>
                  </span>
                </span>
              </td>
              <td className="num" data-label="Reactions"><Count n={p.reactions} /></td>
              <td className="num" data-label="Comments"><Count n={p.comments} /></td>
              <td className="num" data-label="Shares"><Count n={p.shares} /></td>
              <td className="num key" data-label="Engagement"><Count n={p.engagement} /></td>
              <td className="num" data-label="vs median"><Mult x={p.multiplier} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="s-bars">
      {items.map((i) => (
        <li key={i.label}>
          <span>{i.label}</span>
          <span className="s-bars-track" aria-hidden>
            <i style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <b>
            {total > 0 ? Math.round((i.value / total) * 100) : 0}%<small>{fmtNum(i.value)}</small>
          </b>
        </li>
      ))}
    </ul>
  );
}

export default function FacebookAnalytics({ data: d, gate: gateIn, maxDays }: { data: FacebookAnalyticsData; gate?: AnalyticsGate; maxDays?: number }) {
  // The range control lives in the Analytics page's query bar; the prop stays for the page's call.
  void maxDays;
  const gate = gateIn ?? OPEN_GATE;
  const ok = (s: Series | null) => Boolean(s && s.provenance !== "unavailable");
  const metrics: [Metric, string, Series | null][] = [["views", "Views", d.views], ["engagement", "Engagement", d.engagement], ["followers", "Followers", d.followers], ["follows", "New follows", d.follows]];
  const firstOk = (metrics.find(([, , s]) => ok(s))?.[0] ?? "engagement") as Metric;
  const [tab, setTab] = useState<Section>("overview");
  const [metric, setMetric] = useState<Metric>(firstOk);
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [compare, setCompare] = useState(true);
  const [postTab, setPostTab] = useState<"top" | "under" | "breakout">("top");
  const [fgran, setFgran] = useState<FollowerGranularity>("day");
  const [trendKey, setTrendKey] = useState<string>("Page views");

  const seriesOf = (m: Metric) => metrics.find(([x]) => x === m)?.[2] ?? null;
  const series: Series = (seriesOf(metric) ?? d.engagement) as Series;
  const postValues = useMemo(() => d.posts.map((p) => p.engagement).filter((v): v is number => v != null), [d.posts]);
  const baseline = useMemo(() => seriesBaseline(series, postValues), [series, postValues]);
  const postById = useMemo(() => Object.fromEntries(d.evidence.map((p) => [p.id, p])), [d.evidence]);
  const delta = metric !== "followers" ? pctChange(series) : null;
  const granOptions: [Granularity, string][] = d.rangeDays >= 90 ? [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]] : [["day", "Daily"], ["week", "Weekly"]];
  const jumpTab = (t: "content" | "audience" | "times" | "growth") => {
    setTab(t === "audience" ? "growth" : t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const range = d.rangeLabel.toLowerCase();

  const postRows = useMemo(() => {
    if (postTab === "under") return d.posts.filter((p) => p.multiplier != null && p.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0));
    if (postTab === "breakout") return d.posts.filter((p) => p.multiplier != null && p.multiplier >= 3);
    return d.posts;
  }, [d.posts, postTab]);
  const medianLabel = d.medianEngagement != null ? `Median post ${fmtNum(Math.round(d.medianEngagement))} engagement · last ${d.publishing.analysed} posts` : "No baseline yet";
  const rangeStart = d.followers.current[0]?.day ?? "0000";
  const fPoints = useMemo(() => d.followerPoints.filter((p) => p.day >= rangeStart), [d.followerPoints, rangeStart]);
  const mixItems = [
    ...(d.mix.reactions != null ? [{ label: "Reactions", value: d.mix.reactions }] : []),
    ...(d.mix.comments != null ? [{ label: "Comments", value: d.mix.comments }] : []),
    ...(d.mix.shares != null ? [{ label: "Shares", value: d.mix.shares }] : []),
  ];
  const trendCards = ([["Page views", d.views], ["Engagement", d.engagement], ["New follows", d.follows]] as [string, Series | null][]).filter((t): t is [string, Series] => t[1] != null);
  const trend = trendCards.find(([label]) => label === trendKey) ?? trendCards[0];
  const canCompare = !gate.comparison && metric !== "followers" && series.previous.length > 0;
  const noBaseline = d.medianEngagement == null ? " (a baseline needs at least five posts with counts)" : "";

  const kpiCells = [
    ...d.kpis.map((k) => {
      const m = KPI_METRIC[k.key];
      const selectable = Boolean(m && ok(seriesOf(m)));
      const na = k.status === "unavailable";
      return (
        <KpiCell
          key={k.key}
          label={k.label}
          value={na ? null : k.value}
          reason={k.note}
          delta={!na && !gate.comparison && k.delta ? { text: k.delta, tone: k.positive === false ? "bad" : k.positive ? "good" : undefined } : undefined}
          note={na ? undefined : k.note}
          selected={selectable && metric === m}
          onSelect={selectable ? () => setMetric(m as Metric) : undefined}
        />
      );
    }),
    <KpiCell
      key="follows"
      label="New follows"
      value={d.newFollows != null ? `+${d.newFollows.toLocaleString("en-US")}` : null}
      reason={d.follows && d.follows.provenance === "unavailable" ? d.follows.note : NEEDS_INSIGHTS}
      delta={gate.comparison ? undefined : pctDelta(pctChange(d.follows))}
      note={d.newFollows != null ? `in the ${range}` : undefined}
      selected={ok(d.follows) && metric === "follows"}
      onSelect={ok(d.follows) ? () => setMetric("follows") : undefined}
    />,
  ];

  return (
    <section className="an-stack" aria-label="Facebook analytics">
      <header className="an-panel-head">
        {d.page.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="an-avatar" src={d.page.avatar} alt="" width={40} height={40} />
        ) : (
          <span className="an-avatar is-ph" aria-hidden>
            <PlatformMark platform="facebook" />
          </span>
        )}
        <div className="an-panel-meta">
          <b>{d.page.name ?? "Facebook Page"}</b>
          <small>
            Facebook{d.page.username ? ` · @${d.page.username}` : ""}
            {d.followerStats.now != null ? ` · ${d.followerStats.now.toLocaleString("en-US")} followers` : ""}
          </small>
        </div>
      </header>

      <Tabs className="an-stack" value={tab} onValueChange={(v) => setTab(v as Section)}>
        <TabList aria-label="Facebook analytics sections">
          {SECTIONS.map(([id, label]) => (
            <Tab key={id} value={id}>
              {label}
            </Tab>
          ))}
        </TabList>

        {/* ================================================== OVERVIEW */}
        <TabPanel value="overview" className="an-stack">
          <KpiStrip cols={3}>{kpiCells}</KpiStrip>

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
                <b>{series.total != null ? fmtNum(series.total) : DASH}</b>
                <span>
                  {series.label.toLowerCase()} {metric === "followers" ? "now" : `in the ${range}`}
                </span>
                {!gate.comparison && delta != null && <em className={delta >= 0 ? "is-good" : "is-bad"}>{pctText(delta)} vs previous period</em>}
                {baseline && (
                  <em>
                    {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}
                  </em>
                )}
              </div>
              <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison && metric !== "followers"} height={260} baseline={baseline} postById={postById} today={d.today} />
              <CardSource>{series.note}</CardSource>
            </Card>

            <Card>
              <CardHeader title="Key insights" />
              {!d.insights.length ? (
                <Empty>
                  <b>Nothing stands out against your own baseline yet.</b> Insights appear once the Page has at least five posts with engagement counts, or a clear change between periods.
                </Empty>
              ) : gate.deeperInsights ? (
                <>
                  <InsightList insights={d.insights.slice(0, 1)} posts={d.evidence} compact onTab={jumpTab} />
                  <Locked plan={gate.deeperInsights} title="What's working, and what to do next" blurb={d.insights.length > 1 ? `SOCIA found ${d.insights.length - 1} more ${d.insights.length - 1 === 1 ? "insight" : "insights"} in your Facebook data.` : "See What Changed and What To Do Next, drawn from your own Page."} from="facebook_insights" />
                </>
              ) : (
                <InsightList insights={d.insights.slice(0, 5)} posts={d.evidence} compact onTab={jumpTab} />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="What changed" period={d.rangeLabel} />
            {gate.comparison ? (
              <Locked plan={gate.comparison} title="Previous-period comparisons" blurb="See how views, followers, engagement and posting moved against the period before." from="facebook_what_changed" />
            ) : (
              <WhatChanged items={d.changes} />
            )}
            <CardSource>
              {d.rangeLabel} against the {d.rangeDays} days before.
            </CardSource>
          </Card>

          <div className="an-grid">
            <Card flush>
              <CardHeader
                title="What's working"
                period="Top posts by engagement"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => jumpTab("content")}>
                    All posts <ArrowRight />
                  </Button>
                }
              />
              {d.posts.length ? (
                <PostTable rows={d.posts.slice(0, 5)} />
              ) : (
                <div className="an-inset">
                  <Empty>
                    <b>No posts synced yet.</b> Posts you publish to this Page will appear here with their engagement.
                  </Empty>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="What to do next" />
              {gate.deeperInsights ? (
                <Locked plan={gate.deeperInsights} title="Recommendations" blurb="Specific next steps, each tied to the numbers behind it." from="facebook_next_steps" />
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
              <h2 className="s-card-title">Post performance</h2>
              <span className="s-card-period">{medianLabel}</span>
              <SegmentedControl
                className="s-seg--sm"
                label="Post view"
                options={[
                  { value: "top", label: "Top posts" },
                  { value: "under", label: "Underperforming" },
                  { value: "breakout", label: "Breakouts" },
                ]}
                value={postTab}
                onChange={setPostTab}
              />
            </div>
            {!postRows.length && (
              <div className="an-inset">
                <Empty>
                  {postTab === "under" && `No post fell below 70% of your median engagement${noBaseline}.`}
                  {postTab === "breakout" && `No post reached 3× your median engagement${noBaseline}.`}
                  {postTab === "top" && "No posts synced yet."}
                </Empty>
              </div>
            )}
            {postRows.length > 0 && <PostTable rows={postRows} />}
            <CardSource className="an-inset">
              Engagement = reactions + comments + shares, exactly as Facebook returned them. &ldquo;vs median&rdquo; compares each post with the median of your last {d.publishing.analysed} posts{d.publishing.capped ? " (the most Facebook returns per sync)" : ""}. A dash means Facebook didn&apos;t return that count.
            </CardSource>
          </Card>

          <div className="an-two">
            <Card>
              <CardHeader title="Engagement mix" period={d.rangeLabel} />
              {mixItems.length ? (
                <Bars items={mixItems} />
              ) : (
                <Empty>No engagement counts for posts in this period.</Empty>
              )}
              {d.mix.types && d.mix.types.length > 0 && (
                <>
                  <h3 className="an-subhead">Reactions by type</h3>
                  <Bars items={d.mix.types.map((t) => ({ label: t.label, value: t.value }))} />
                </>
              )}
              <CardSource>Share of each kind across posts published in the period.</CardSource>
            </Card>
            <Card>
              <CardHeader title="Publishing" period={d.rangeLabel} />
              <dl className="an-stats">
                <div>
                  <dt>Published</dt>
                  <dd>{d.publishing.inRange}</dd>
                </div>
                <div>
                  <dt>Per week</dt>
                  <dd className={d.publishing.perWeek == null ? "is-na" : undefined}>
                    {d.publishing.perWeek != null ? d.publishing.perWeek.toFixed(1) : <Unavailable reason="No posts in the period to count" compact />}
                  </dd>
                </div>
                <div>
                  <dt>Posts analysed</dt>
                  <dd>{d.publishing.analysed}</dd>
                </div>
              </dl>
              <CardSource>From the Page&apos;s published posts{d.publishing.capped ? `; SOCIA reads the ${d.publishing.analysed} most recent` : ""}.</CardSource>
            </Card>
          </div>
        </TabPanel>

        {/* ================================================== POSTING TIMES */}
        <TabPanel value="times" className="an-stack">
          <Card>
            <CardHeader title="Posting times" />
            {gate.postingTimes ? (
              <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A weekday-by-hour heatmap of your own posts, each window backed by its real sample size." from="facebook_times_tab" />
            ) : (
              <Mounted fallback={<p className="an-note">Computing in your time zone…</p>}>
                <PostingHeatmap posts={d.timed} formats={{}} />
              </Mounted>
            )}
            <CardSource>When your own posts have performed best, with the sample behind every claim.</CardSource>
          </Card>
        </TabPanel>

        {/* ================================================== GROWTH */}
        <TabPanel value="growth" className="an-stack">
          {gate.growth ? (
            <Card>
              <CardHeader title="Growth" />
              <Locked plan={gate.growth} title="Growth analysis" blurb="Follower history, trend cards for views and engagement, and your strong and weak weeks against your typical week." from="facebook_growth_tab" />
              <CardSource>How your followers, views and engagement are trending.</CardSource>
            </Card>
          ) : (
            <>
              <Card>
                <div className="an-head">
                  <h2 className="s-card-title">Follower history</h2>
                  <span className="s-card-period">{d.rangeLabel}</span>
                  <SegmentedControl
                    className="s-seg--sm"
                    label="Group by"
                    options={[
                      { value: "day", label: "Daily" },
                      { value: "week", label: "Weekly" },
                      { value: "month", label: "Monthly" },
                    ]}
                    value={fgran}
                    onChange={(g) => setFgran(g as FollowerGranularity)}
                  />
                </div>
                <dl className="an-stats">
                  <div>
                    <dt>Followers now</dt>
                    <dd className={d.followerStats.now == null ? "is-na" : undefined}>
                      {d.followerStats.now != null ? d.followerStats.now.toLocaleString("en-US") : <Unavailable reason="Facebook didn't return the follower count" compact />}
                    </dd>
                  </div>
                  <div>
                    <dt>Net change</dt>
                    <dd className={d.followerStats.net == null ? "is-na" : d.followerStats.net >= 0 ? "is-good" : "is-bad"}>
                      {d.followerStats.net == null ? <Unavailable reason="Needs two daily snapshots inside the range" compact /> : signed(d.followerStats.net)}
                    </dd>
                  </div>
                  <div>
                    <dt>Growth rate</dt>
                    <dd className={d.followerStats.growthPct == null ? "is-na" : d.followerStats.growthPct >= 0 ? "is-good" : "is-bad"}>
                      {d.followerStats.growthPct == null ? (
                        <Unavailable reason="Needs two daily snapshots inside the range" compact />
                      ) : (
                        `${d.followerStats.growthPct >= 0 ? "+" : "−"}${Math.abs(d.followerStats.growthPct).toFixed(2)}%`
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>New follows</dt>
                    <dd className={d.newFollows != null ? "is-good" : "is-na"}>{d.newFollows != null ? `+${d.newFollows.toLocaleString("en-US")}` : <Unavailable reason={NEEDS_INSIGHTS} compact />}</dd>
                  </div>
                  <div>
                    <dt>Unfollows</dt>
                    <dd className={d.unfollows == null ? "is-na" : d.unfollows ? "is-bad" : undefined}>{d.unfollows != null ? `−${d.unfollows.toLocaleString("en-US")}` : <Unavailable reason={NEEDS_INSIGHTS} compact />}</dd>
                  </div>
                  <div>
                    <dt>History</dt>
                    <dd>
                      {d.followerStats.days} day{d.followerStats.days === 1 ? "" : "s"}
                    </dd>
                  </div>
                </dl>
                <FollowerChart points={fPoints} granularity={fgran} height={220} today={d.today} />
                <p className="an-next">
                  <b>{d.followerStats.days <= 1 ? "Follower tracking has just started." : `${d.followerStats.days} days of follower history collected${d.followerStats.firstDay ? ` since ${fmtDay(d.followerStats.firstDay)}` : ""}.`}</b>{" "}
                  Recorded by SOCIA once a day. Counts from before the Page was connected are not available from Facebook and are never estimated.{d.newFollows == null ? " New follows and unfollows need the read_insights permission." : ""}
                </p>
              </Card>

              {trend && (
                <>
                  <KpiStrip cols={trendCards.length}>
                    {trendCards.map(([label, s]) => (
                      <KpiCell
                        key={label}
                        label={`${label} trend`}
                        value={s.total != null ? fmtNum(s.total) : null}
                        reason={s.provenance === "unavailable" ? s.note : "Not reported for this period"}
                        delta={gate.comparison ? undefined : pctDelta(pctChange(s))}
                        note={s.total != null ? range : undefined}
                        selected={label === trend[0]}
                        onSelect={() => setTrendKey(label)}
                      />
                    ))}
                  </KpiStrip>
                  <Card>
                    <CardHeader title={`${trend[0]} trend`} period={d.rangeLabel} />
                    <OverviewChart series={trend[1]} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={180} compact baseline={seriesBaseline(trend[1], postValues)} postById={postById} today={d.today} />
                    <CardSource>{trend[1].note}</CardSource>
                  </Card>
                </>
              )}

              <div className="an-two">
                <Card>
                  <CardHeader title="Growth and decline weeks" period="Page views · 7-day blocks" />
                  {d.weeks.median == null ? (
                    <Empty>{d.views && d.views.provenance !== "unavailable" ? "Needs at least four complete weeks in the range to compare weeks with your typical week." : "Needs Page views from Facebook Insights (the read_insights permission)."}</Empty>
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
                <Card>
                  <CardHeader title="Not available from Facebook" />
                  <ul className="an-unavail">
                    {d.unavailable.map((u) => (
                      <li key={u.label}>
                        <b>{u.label}</b>
                        <span>{u.why}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </TabPanel>
      </Tabs>
    </section>
  );
}
