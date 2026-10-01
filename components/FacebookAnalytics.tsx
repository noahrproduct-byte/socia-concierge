"use client";

// Facebook analytics, to the same standard as the Instagram and YouTube pages
// but shaped around what a Page actually offers: followers (SOCIA's own daily
// history plus Facebook's follows/unfollows), Page views from Insights, and
// every post measured against the Page's own median. There is no Audience tab:
// Meta provides no audience demographics for Pages, and the page says so
// instead of leaving an empty section. Figures arrive computed on the server
// (lib/metrics/facebook.ts); unavailable is never shown as zero.

import { useMemo, useState } from "react";
import { Users, Heart, FileText, BarChart3, Eye, ExternalLink, Info, Lightbulb, ListChecks, ArrowRight, ImageIcon } from "lucide-react";
import OverviewChart from "./ov/OverviewChart";
import FollowerChart from "./ov/FollowerChart";
import StatTile from "./ov/StatTile";
import WhatChanged from "./ov/WhatChanged";
import PostingHeatmap from "./ov/PostingHeatmap";
import Mounted from "./ov/Mounted";
import { InsightList } from "./ov/Insights";
import DateRangeSelector from "./DateRangeSelector";
import { Locked, type AnalyticsGate } from "./AnalyticsV3";
import { fmtNum, seriesBaseline, type Granularity, type Series } from "@/lib/overview";
import type { FollowerGranularity } from "@/lib/followers";
import type { FacebookAnalyticsData, FbPostRow } from "@/lib/metrics/facebook";
import "./planRange.css";
import "./platformAnalytics.css";

type Tab = "overview" | "content" | "times" | "growth";
const TABS: [Tab, string][] = [["overview", "Overview"], ["content", "Content Performance"], ["times", "Posting Times"], ["growth", "Growth"]];
type Metric = "views" | "engagement" | "followers" | "follows";
const KPI_ICON = {
  followers: { Icon: Users, tone: "info" },
  views: { Icon: Eye, tone: "primary" },
  engagement: { Icon: Heart, tone: "pink" },
  posts: { Icon: FileText, tone: "primary" },
  avg: { Icon: BarChart3, tone: "success" },
} as const;
const OPEN_GATE: AnalyticsGate = { postingTimes: null, growth: null, comparison: null, deeperInsights: null, crossPlatform: null };

const fmtDay = (day: string | null) => (day ? new Date(day.length > 10 ? day : day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const mult = (x: number | null) => (x == null ? "—" : `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`);
const num = (n: number | null) => (n == null ? "—" : fmtNum(n));

function PostTable({ rows }: { rows: FbPostRow[] }) {
  return (
    <div className="dsh-tablescroll">
      <table className="dsh-table yt-table">
        <thead>
          <tr><th>Post</th><th className="num">Reactions</th><th className="num">Comments</th><th className="num">Shares</th><th className="num">Engagement</th><th className="num">vs median</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <a className="yt-vid" href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" width={64} height={36} />
                  ) : <span className="yt-vid-ph" aria-hidden><ImageIcon size={12} /></span>}
                  <span className="yt-vid-meta">
                    <b title={p.title}>{p.title}</b>
                    <small>{fmtDay(p.published)}</small>
                  </span>
                  {p.permalink && <ExternalLink size={12} className="yt-vid-ext" />}
                </a>
              </td>
              <td className="num">{num(p.reactions)}</td>
              <td className="num">{num(p.comments)}</td>
              <td className="num">{num(p.shares)}</td>
              <td className="num">{num(p.engagement)}</td>
              <td className="num"><span className={`yt-mult${p.multiplier != null && p.multiplier >= 3 ? " hot" : p.multiplier != null && p.multiplier < 0.7 ? " cold" : ""}`}>{mult(p.multiplier)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="ov-bars wide">
      {items.map((i) => (
        <li key={i.label} title={`${i.value.toLocaleString("en-US")}`}>
          <span className="ov-bars-label">{i.label}</span>
          <span className="ov-bars-track"><i style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <b>{total > 0 ? Math.round((i.value / total) * 100) : 0}%</b>
        </li>
      ))}
    </ul>
  );
}

export default function FacebookAnalytics({ data: d, gate: gateIn, maxDays }: { data: FacebookAnalyticsData; gate?: AnalyticsGate; maxDays?: number }) {
  const gate = gateIn ?? OPEN_GATE;
  const ok = (s: Series | null) => Boolean(s && s.provenance !== "unavailable");
  const metrics: [Metric, string, Series | null][] = [["views", "Views", d.views], ["engagement", "Engagement", d.engagement], ["followers", "Followers", d.followers], ["follows", "New follows", d.follows]];
  const firstOk = (metrics.find(([, , s]) => ok(s))?.[0] ?? "engagement") as Metric;
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<Metric>(firstOk);
  const [gran, setGran] = useState<Granularity>(d.rangeDays > 31 ? "week" : "day");
  const [compare, setCompare] = useState(true);
  const [postTab, setPostTab] = useState<"top" | "under" | "breakout">("top");
  const [fgran, setFgran] = useState<FollowerGranularity>("day");

  const series: Series = (metrics.find(([m]) => m === metric)?.[2] ?? d.engagement) as Series;
  const postValues = useMemo(() => d.posts.map((p) => p.engagement).filter((v): v is number => v != null), [d.posts]);
  const baseline = useMemo(() => seriesBaseline(series, postValues), [series, postValues]);
  const postById = useMemo(() => Object.fromEntries(d.evidence.map((p) => [p.id, p])), [d.evidence]);
  const delta = series.total != null && series.prevTotal != null && series.prevTotal > 0 && metric !== "followers" ? ((series.total - series.prevTotal) / series.prevTotal) * 100 : null;
  const granOptions: [Granularity, string][] = d.rangeDays >= 90 ? [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]] : [["day", "Daily"], ["week", "Weekly"]];
  const jumpTab = (t: "content" | "audience" | "times" | "growth") => { setTab(t === "audience" ? "growth" : t); window.scrollTo({ top: 0, behavior: "smooth" }); };

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
  const trendCards: [string, Series | null][] = [["Page views", d.views], ["Engagement", d.engagement], ["New follows", d.follows]];

  return (
    <div className="av yta2" aria-label="Facebook analytics">
      <header className="pa-head">
        {d.page.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pa-avatar" src={d.page.avatar} alt="" width={40} height={40} />
        ) : <span className="pa-avatar pa-avatar-ph" aria-hidden>f</span>}
        <div className="pa-head-meta">
          <h2>{d.page.name ?? "Facebook Page"}</h2>
          <small>Facebook{d.page.username ? ` · @${d.page.username}` : ""}{d.followerStats.now != null ? ` · ${d.followerStats.now.toLocaleString("en-US")} followers` : ""}</small>
        </div>
        <div className="pa-head-actions">
          <Mounted fallback={<span className="ov-ctl-ph" aria-hidden />}>
            <DateRangeSelector maxDays={maxDays} />
          </Mounted>
        </div>
      </header>

      <nav className="av-tabs" aria-label="Facebook analytics sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "true" : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {/* ================================================== OVERVIEW */}
      {tab === "overview" && (
        <>
          <div className="ov-kpis four">
            {d.kpis.map((k) => {
              const t = KPI_ICON[k.key];
              return <StatTile key={k.key} Icon={t.Icon} tone={t.tone} label={k.label} value={k.value} note={k.note} status={k.status} delta={gate.comparison ? null : k.delta} positive={k.positive} />;
            })}
          </div>

          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="fb-perf-h">
                <div className="ov-card-head wrap">
                  <h2 id="fb-perf-h">Performance Over Time</h2>
                  <div className="ov-seg" role="tablist" aria-label="Metric">
                    {metrics.map(([m, label, s]) => (
                      <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? "on" : ""} disabled={!ok(s)}
                        title={s ? s.note : "Needs the read_insights permission — reconnect Facebook"} onClick={() => setMetric(m)}>{label}</button>
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
                  <b>{series.total != null ? fmtNum(series.total) : "—"}</b>
                  <span>{series.label.toLowerCase()} {metric === "followers" ? "now" : `in the ${d.rangeLabel.toLowerCase()}`}</span>
                  {!gate.comparison && delta != null && <em className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}% vs. previous period</em>}
                  {baseline && <em className="muted">· {baseline.label.toLowerCase()} {fmtNum(Math.round(baseline.value))}</em>}
                  <span className="av-perf-ctl">
                    {!gate.comparison && metric !== "followers" && series.previous.length > 0 && <button type="button" className={`ov-toggle${compare ? " on" : ""}`} aria-pressed={compare} onClick={() => setCompare((v) => !v)}>vs. previous</button>}
                  </span>
                </div>
                <OverviewChart series={series} granularity={gran} showPrevious={compare && !gate.comparison && metric !== "followers"} height={260} baseline={baseline} postById={postById} today={d.today} />
                <p className="ov-source">{series.note}</p>
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="fb-ins-h">
                <div className="ov-card-head">
                  <h2 id="fb-ins-h"><span className="ov-h-ico primary"><Lightbulb size={14} /></span> Key Insights</h2>
                </div>
                {!d.insights.length ? (
                  <div className="ov-empty small">Nothing stands out against your own baseline yet. Insights appear once the Page has at least five posts with engagement counts, or a clear change between periods.</div>
                ) : gate.deeperInsights ? (
                  <>
                    <InsightList insights={d.insights.slice(0, 1)} posts={d.evidence} compact onTab={jumpTab} />
                    <Locked plan={gate.deeperInsights} title="What's working, and what to do next" blurb={d.insights.length > 1 ? `SOCIA found ${d.insights.length - 1} more ${d.insights.length - 1 === 1 ? "insight" : "insights"} in your Facebook data.` : "See What Changed and What To Do Next, drawn from your own Page."} from="facebook_insights" />
                  </>
                ) : (
                  <InsightList insights={d.insights.slice(0, 5)} posts={d.evidence} compact onTab={jumpTab} />
                )}
              </section>
            </aside>
          </div>

          <section className="ov-card" aria-labelledby="fb-wc-h">
            <div className="ov-card-head">
              <h2 id="fb-wc-h">What changed</h2>
              <span className="ov-card-sub">{d.rangeLabel} against the {d.rangeDays} days before.</span>
            </div>
            {gate.comparison ? (
              <Locked plan={gate.comparison} title="Previous-period comparisons" blurb="See how views, followers, engagement and posting moved against the period before." from="facebook_what_changed" />
            ) : (
              <WhatChanged items={d.changes} />
            )}
          </section>

          <div className="av-grid">
            <div className="av-main">
              <section className="ov-card" aria-labelledby="fb-top-h">
                <div className="ov-card-head wrap">
                  <h2 id="fb-top-h">What&apos;s working</h2>
                  <span className="ov-range-label">Top posts by engagement</span>
                  <button type="button" className="ov-link" onClick={() => jumpTab("content")}>All posts <ArrowRight size={13} /></button>
                </div>
                {d.posts.length ? <PostTable rows={d.posts.slice(0, 5)} /> : <div className="ov-empty small"><b>No posts synced yet</b><p>Posts you publish to this Page will appear here with their engagement.</p></div>}
              </section>
            </div>
            <aside className="av-side">
              <section className="ov-card" aria-labelledby="fb-next-h">
                <div className="ov-card-head">
                  <h2 id="fb-next-h"><span className="ov-h-ico success"><ListChecks size={14} /></span> What to do next</h2>
                </div>
                {gate.deeperInsights ? (
                  <Locked plan={gate.deeperInsights} title="Recommendations" blurb="Specific next steps, each tied to the numbers behind it." from="facebook_next_steps" />
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
          <section className="ov-card" aria-labelledby="fb-ct-h">
            <div className="ov-card-head wrap">
              <h2 id="fb-ct-h">Post performance</h2>
              <div className="ov-seg" role="tablist" aria-label="Post view">
                {([["top", "Top posts"], ["under", "Underperforming"], ["breakout", "Breakouts"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={postTab === id} className={postTab === id ? "on" : ""} onClick={() => setPostTab(id)}>{label}</button>
                ))}
              </div>
              <span className="ov-range-label">{medianLabel}</span>
            </div>
            {postTab === "under" && !postRows.length && <div className="ov-empty small">No post fell below 70% of your median engagement{d.medianEngagement == null ? " (a baseline needs at least five posts with counts)" : ""}.</div>}
            {postTab === "breakout" && !postRows.length && <div className="ov-empty small">No post reached 3× your median engagement{d.medianEngagement == null ? " (a baseline needs at least five posts with counts)" : ""}.</div>}
            {postTab === "top" && !postRows.length && <div className="ov-empty small">No posts synced yet.</div>}
            {postRows.length > 0 && <PostTable rows={postRows} />}
            <p className="ov-source">
              Engagement = reactions + comments + shares, exactly as Facebook returned them. “vs median” compares each post with the median of your last {d.publishing.analysed} posts{d.publishing.capped ? " (the most Facebook returns per sync)" : ""}. A “—” means Facebook didn&apos;t return that count.
            </p>
          </section>

          <div className="av-two">
            <section className="ov-card" aria-labelledby="fb-mix-h">
              <div className="ov-card-head">
                <h2 id="fb-mix-h">Engagement mix</h2>
                <span className="ov-range-label">{d.rangeLabel}</span>
              </div>
              {mixItems.length ? <Bars items={mixItems} /> : <div className="ov-empty small">No engagement counts for posts in this period.</div>}
              {d.mix.types && d.mix.types.length > 0 && (
                <>
                  <h3 className="pa-subh">Reactions by type</h3>
                  <Bars items={d.mix.types.map((t) => ({ label: t.label, value: t.value }))} />
                </>
              )}
              <p className="ov-source">Share of each kind across posts published in the period.</p>
            </section>
            <section className="ov-card" aria-labelledby="fb-pub-h">
              <div className="ov-card-head">
                <h2 id="fb-pub-h">Publishing</h2>
                <span className="ov-range-label">{d.rangeLabel}</span>
              </div>
              <div className="au-stats">
                <div><small>Published</small><b>{d.publishing.inRange}</b></div>
                <div><small>Per week</small><b>{d.publishing.perWeek != null ? d.publishing.perWeek.toFixed(1) : "—"}</b></div>
                <div><small>Posts analysed</small><b>{d.publishing.analysed}</b></div>
              </div>
              <p className="ov-source">From the Page&apos;s published posts{d.publishing.capped ? `; SOCIA reads the ${d.publishing.analysed} most recent` : ""}.</p>
            </section>
          </div>
        </>
      )}

      {/* ================================================== POSTING TIMES */}
      {tab === "times" && (
        <section className="ov-card" aria-labelledby="fb-pt-h">
          <div className="ov-card-head">
            <h2 id="fb-pt-h">Posting Times</h2>
            <span className="ov-card-sub">When your own posts have performed best, with the sample behind every claim.</span>
          </div>
          {gate.postingTimes ? (
            <Locked plan={gate.postingTimes} title="Posting-time analysis" blurb="A weekday-by-hour heatmap of your own posts, each window backed by its real sample size." from="facebook_times_tab" />
          ) : (
            <Mounted fallback={<div className="ov-empty small">Computing in your time zone…</div>}>
              <PostingHeatmap posts={d.timed} formats={{}} />
            </Mounted>
          )}
        </section>
      )}

      {/* ================================================== GROWTH */}
      {tab === "growth" && gate.growth && (
        <section className="ov-card" aria-labelledby="fb-gr-lock-h">
          <div className="ov-card-head"><h2 id="fb-gr-lock-h">Growth</h2><span className="ov-card-sub">How your followers, views and engagement are trending.</span></div>
          <Locked plan={gate.growth} title="Growth analysis" blurb="Follower history, trend cards for views and engagement, and your strong and weak weeks against your typical week." from="facebook_growth_tab" />
        </section>
      )}
      {tab === "growth" && !gate.growth && (
        <>
          <section className="ov-card" aria-labelledby="fb-fol-h">
            <div className="ov-card-head wrap">
              <h2 id="fb-fol-h">Follower history</h2>
              <div className="ov-seg" role="group" aria-label="Group by">
                {(["day", "week", "month"] as const).map((g) => <button key={g} type="button" className={fgran === g ? "on" : ""} aria-pressed={fgran === g} onClick={() => setFgran(g)}>{g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}</button>)}
              </div>
              <span className="ov-range-label">{d.rangeLabel}</span>
            </div>
            <div className="au-stats">
              <div><small>Followers now</small><b>{d.followerStats.now != null ? d.followerStats.now.toLocaleString("en-US") : "—"}</b></div>
              <div><small>Net change</small><b className={d.followerStats.net == null ? "" : d.followerStats.net >= 0 ? "up" : "down"}>{d.followerStats.net == null ? "—" : `${d.followerStats.net >= 0 ? "+" : "−"}${Math.abs(d.followerStats.net).toLocaleString("en-US")}`}</b></div>
              <div><small>Growth rate</small><b className={d.followerStats.growthPct == null ? "" : d.followerStats.growthPct >= 0 ? "up" : "down"}>{d.followerStats.growthPct == null ? "—" : `${d.followerStats.growthPct >= 0 ? "+" : "−"}${Math.abs(d.followerStats.growthPct).toFixed(2)}%`}</b></div>
              <div><small>New follows</small><b className={d.newFollows != null ? "up" : ""}>{d.newFollows != null ? `+${d.newFollows.toLocaleString("en-US")}` : "—"}</b></div>
              <div><small>Unfollows</small><b className={d.unfollows ? "down" : ""}>{d.unfollows != null ? `−${d.unfollows.toLocaleString("en-US")}` : "—"}</b></div>
              <div><small>History</small><b>{d.followerStats.days} day{d.followerStats.days === 1 ? "" : "s"}</b></div>
            </div>
            <FollowerChart points={fPoints} granularity={fgran} height={220} today={d.today} />
            <div className="au-note">
              <b>{d.followerStats.days <= 1 ? "Follower tracking has just started." : `${d.followerStats.days} days of follower history collected${d.followerStats.firstDay ? ` since ${fmtDay(d.followerStats.firstDay)}` : ""}.`}</b>
              <p>Recorded by SOCIA once a day. Counts from before the Page was connected are not available from Facebook and are never estimated.{d.newFollows == null ? " New follows and unfollows need the read_insights permission." : ""}</p>
            </div>
          </section>

          <div className="gr-grid">
            {trendCards.filter(([, s]) => s != null).map(([label, s]) => {
              const sr = s as Series;
              const dl = sr.total != null && sr.prevTotal != null && sr.prevTotal > 0 ? ((sr.total - sr.prevTotal) / sr.prevTotal) * 100 : null;
              return (
                <section key={label} className="ov-card gr-card" aria-label={`${label} trend`}>
                  <div className="ov-card-head">
                    <h2>{label} trend</h2>
                    {!gate.comparison && dl != null && <em className={`gr-delta ${dl >= 0 ? "up" : "down"}`}>{dl >= 0 ? "↑" : "↓"} {Math.abs(dl).toFixed(1)}%</em>}
                  </div>
                  <div className="av-growth-num"><b>{sr.total != null ? fmtNum(sr.total) : "—"}</b><span>{d.rangeLabel.toLowerCase()}</span></div>
                  <OverviewChart series={sr} granularity={d.rangeDays > 31 ? "week" : "day"} showPrevious={false} height={150} compact baseline={seriesBaseline(sr, postValues)} postById={postById} today={d.today} />
                  <p className="ov-source">{sr.note}</p>
                </section>
              );
            })}
          </div>

          <div className="av-two">
            <section className="ov-card" aria-labelledby="fb-per-h">
              <div className="ov-card-head"><h2 id="fb-per-h">Growth and decline weeks</h2><span className="ov-range-label">Page views · 7-day blocks</span></div>
              {d.weeks.median == null ? (
                <div className="ov-empty small">{d.views && d.views.provenance !== "unavailable" ? "Needs at least four complete weeks in the range to compare weeks with your typical week." : "Needs Page views from Facebook Insights (the read_insights permission)."}</div>
              ) : (
                <ul className="gr-periods">
                  {d.weeks.growth.map((w) => <li key={`g${w.start}`} className="up"><i /><span>{fmtDay(w.start)} – {fmtDay(w.end)}</span><b>{fmtNum(w.value)}</b><small>{w.ratio.toFixed(1)}× typical week</small></li>)}
                  {d.weeks.decline.map((w) => <li key={`d${w.start}`} className="down"><i /><span>{fmtDay(w.start)} – {fmtDay(w.end)}</span><b>{fmtNum(w.value)}</b><small>{Math.round(w.ratio * 100)}% of typical week</small></li>)}
                  {!d.weeks.growth.length && !d.weeks.decline.length && <li className="flat"><span>No week ran far above or below your typical week ({fmtNum(Math.round(d.weeks.median))} views).</span></li>}
                </ul>
              )}
            </section>
            <section className="ov-card pa-unavail">
              <div className="ov-card-head"><h2><Info size={15} /> Not available from Facebook</h2></div>
              <ul>
                {d.unavailable.map((u) => <li key={u.label}><b>{u.label}</b><span>{u.why}</span></li>)}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
