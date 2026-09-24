"use client";

// The universal Analytics shell. One page, every platform: it reads the
// normalized NormalizedAccountAnalytics bundle produced by the platform
// adapters and never touches a platform's raw shape. Instagram, YouTube and
// Facebook render through the exact same five tabs; the differences between
// them are data (which metrics exist, which are true series), declared by the
// capability registry — not four hand-built dashboards. Every tab degrades to
// an honest, specific empty state when a platform doesn't expose something;
// nothing is estimated. Developed behind ?v=2 until it reaches parity.

import { useMemo, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { askSocia } from "@/lib/ask";
import DateRangeSelector from "@/components/DateRangeSelector";
import UniTrend from "./UniTrend";
import { metricCapability, metricLabel, platformCapability } from "@/lib/analytics/capabilities";
import { breakdownMetric, engagementSplit, filterPosts, formatBreakdown, formatTable, postingWindows, type PostFilter } from "@/lib/analytics/derive";
import { accountInsights, crossPlatformInsights, type AnalyticsInsight } from "@/lib/analytics/insights";
import { aggregateAccounts } from "@/lib/analytics/aggregate";
import { relText } from "@/lib/postingTimes";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedPost, NormalizedSeries, Platform, Status } from "@/lib/analytics/types";
import "./universal.css";

const PLATFORM_TINT: Record<Platform, string> = {
  instagram: "#d6357a",
  youtube: "#e0332a",
  facebook: "#1877f2",
  tiktok: "#111827",
};

const STATUS_CHIP: Record<Status, { label: string; cls: string } | null> = {
  VERIFIED: { label: "Observed", cls: "obs" },
  CALCULATED: { label: "Derived", cls: "der" },
  AI_DERIVED: { label: "AI", cls: "ai" },
  UNAVAILABLE: null,
};

type Tab = "overview" | "content" | "audience" | "times" | "growth";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["content", "Content"],
  ["audience", "Audience"],
  ["times", "Posting Times"],
  ["growth", "Growth"],
];

const KPI_ORDER: MetricKey[] = ["followers", "views", "watch_time", "net_followers", "reach", "engagement", "engagement_rate", "posts"];
const SERIES_PREF: MetricKey[] = ["views", "watch_time", "net_followers", "reach", "engagement", "followers"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS = ["12–3a", "3–6a", "6–9a", "9a–12p", "12–3p", "3–6p", "6–9p", "9p–12a"];

function fmtValue(v: number | null, unit: "count" | "percent" | "minutes" | "seconds"): string {
  if (v == null) return "—";
  if (unit === "percent") return `${v.toFixed(v < 1 ? 2 : 1)}%`;
  if (unit === "minutes") {
    const h = v / 60;
    return h >= 1 ? `${h >= 10 ? Math.round(h) : h.toFixed(1)}h` : `${Math.round(v)}m`;
  }
  return v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US");
}
const fmtN = (v: number | null) => fmtValue(v, "count");
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="uni-badge" style={{ background: PLATFORM_TINT[platform] }}>
      {platformCapability(platform).label}
    </span>
  );
}

function PostCard({ post }: { post: NormalizedPost }) {
  const stat = post.metrics.views != null ? { v: post.metrics.views, l: "views" } : { v: post.engagement, l: "interactions" };
  return (
    <a className="uni-card" href={post.permalink ?? undefined} target="_blank" rel="noreferrer">
      <span className="uni-card-thumb" style={{ backgroundImage: post.thumb ? `url(${post.thumb})` : undefined }}>
        <PlatformBadge platform={post.platform} />
        {post.multiplier != null && <span className={`uni-mult${post.multiplier >= 1 ? " up" : ""}`}>{fmtMult(post.multiplier)}</span>}
      </span>
      <span className="uni-card-stat">{stat.v != null ? `${fmtN(stat.v)} ${stat.l}` : "—"}</span>
      <span className="uni-card-title">{post.title || "(no caption)"}</span>
      <span className="uni-card-date">{new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
    </a>
  );
}

function Bars({ items }: { items: { label: string; value: number; share: number; sub?: string }[] }) {
  return (
    <div className="uni-bars">
      {items.map((b) => (
        <div key={b.label} className="uni-demo-row">
          <span className="uni-demo-key">{b.label}</span>
          <span className="uni-demo-track"><span className="uni-demo-fill" style={{ width: `${Math.max(2, Math.round(b.share * 100))}%` }} /></span>
          <span className="uni-demo-val">{b.sub ?? `${Math.round(b.share * 100)}%`}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="uni-chart-note uni-empty-block">{children}</p>;
}

function InsightCard({ ins }: { ins: AnalyticsInsight }) {
  return (
    <div className={`uni-insight tone-${ins.tone}`}>
      <span className="uni-insight-tag">{ins.tag}</span>
      <h4 className="uni-insight-title">{ins.title}</h4>
      <p className="uni-insight-body">{ins.body}</p>
      {ins.recommendation && <p className="uni-insight-rec">→ {ins.recommendation}</p>}
    </div>
  );
}

export default function UniversalAnalytics({
  accounts,
  rangeLabel,
  rangeDays,
  maxDays,
  canCrossPlatform = false,
  tiktokComingSoon = true,
}: {
  accounts: NormalizedAccountAnalytics[];
  rangeLabel: string;
  rangeDays: number;
  maxDays?: number;
  canCrossPlatform?: boolean;
  tiktokComingSoon?: boolean;
}) {
  const showAllOption = canCrossPlatform && accounts.length > 1;
  const [sel, setSel] = useState<number | "all">(0);
  const [tab, setTab] = useState<Tab>("overview");
  const isAll = sel === "all";
  const acc = accounts[isAll ? 0 : (sel as number)];
  const platform = acc.account.platform;
  const cap = platformCapability(platform);
  const insights = useMemo(() => accountInsights(acc), [acc]);
  const all = useMemo(() => (isAll ? aggregateAccounts(accounts) : null), [isAll, accounts]);
  const xInsights = useMemo(() => (isAll ? crossPlatformInsights(accounts) : []), [isAll, accounts]);

  const seriesKeys = useMemo(() => {
    const present = (Object.keys(acc.series) as MetricKey[]).filter((k) => acc.series[k]);
    return SERIES_PREF.filter((k) => present.includes(k)).concat(present.filter((k) => !SERIES_PREF.includes(k)));
  }, [acc]);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const activeMetric: MetricKey | null = metric && seriesKeys.includes(metric) ? metric : (seriesKeys[0] ?? null);
  const activeSeries: NormalizedSeries | null = activeMetric ? acc.series[activeMetric] ?? null : null;
  const [pf, setPf] = useState<PostFilter>("top");

  const kpiKeys = KPI_ORDER.filter((k) => acc.kpis[k]);
  const breakdown = useMemo(() => formatBreakdown(acc.posts, breakdownMetric(acc.posts)), [acc]);
  const table = useMemo(() => formatTable(acc.posts), [acc]);
  const windows = useMemo(() => postingWindows(acc.posts), [acc]);
  const split = useMemo(() => engagementSplit(acc.posts), [acc]);
  const filtered = filterPosts(acc.posts, pf);

  const canExport = platform === "instagram";
  const demoDims = acc.demographics.status === "ok" ? acc.demographics.dimensions : {};
  const hasDemo = acc.demographics.status === "ok" && (Object.values(demoDims).some((d) => d && d.length));

  function TrendPanel({ title = "Performance" }: { title?: string }) {
    if (!activeSeries) {
      return (
        <section className="uni-panel">
          <div className="uni-panel-head"><h3>{title}</h3></div>
          <div className="uni-chart uni-chart-empty" style={{ minHeight: 180 }}>
            <p className="uni-empty-title">{cap.label} doesn&apos;t provide a daily trend for this account</p>
            <p className="uni-chart-note">SOCIA shows what {cap.label} exposes and records history from connect onward — nothing is estimated.</p>
          </div>
        </section>
      );
    }
    return (
      <section className="uni-panel">
        <div className="uni-panel-head">
          <h3>{title}</h3>
          {seriesKeys.length > 1 && (
            <div className="uni-seg" role="tablist" aria-label="Metric">
              {seriesKeys.map((k) => (
                <button key={k} role="tab" aria-selected={k === activeMetric} className={`uni-seg-b${k === activeMetric ? " on" : ""}`} onClick={() => setMetric(k)}>
                  {acc.series[k]!.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <UniTrend series={activeSeries} />
        {!activeSeries.trueSeries && activeSeries.provenance === "publish_totals" && (
          <p className="uni-note-warn">This isn&apos;t a daily account trend — each mark is a post&apos;s total on the day it was published.</p>
        )}
      </section>
    );
  }

  function ContentGrid({ posts, empty }: { posts: NormalizedPost[]; empty: string }) {
    if (!posts.length) return <Empty>{empty}</Empty>;
    return (
      <div className="uni-content">
        {posts.slice(0, 24).map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    );
  }

  return (
    <div className="uni">
      {/* ---- header ---- */}
      <div className="uni-head">
        <div className="uni-accounts" role="tablist" aria-label="Connected accounts">
          {showAllOption && (
            <button className={`uni-acct${isAll ? " on" : ""}`} role="tab" aria-selected={isAll} onClick={() => setSel("all")}>
              <span className="uni-acct-av uni-acct-av-ph uni-all-av">∑</span>
              <span className="uni-acct-meta"><span className="uni-acct-name">All accounts</span><span className="uni-acct-plat">{accounts.length} connected</span></span>
            </button>
          )}
          {accounts.map((a, i) => (
            <button key={`${a.account.platform}-${a.account.accountId}`} className={`uni-acct${i === sel ? " on" : ""}`} role="tab" aria-selected={i === sel} onClick={() => { setSel(i); setMetric(null); setPf("top"); }}>
              {a.account.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.account.avatar} alt="" className="uni-acct-av" />
              ) : (
                <span className="uni-acct-av uni-acct-av-ph" style={{ background: PLATFORM_TINT[a.account.platform] }}>{(a.account.name ?? a.account.handle ?? "?").slice(0, 1).toUpperCase()}</span>
              )}
              <span className="uni-acct-meta">
                <span className="uni-acct-name">{a.account.name ?? a.account.handle ?? platformCapability(a.account.platform).label}</span>
                <span className="uni-acct-plat">{platformCapability(a.account.platform).label}</span>
              </span>
            </button>
          ))}
          {tiktokComingSoon && (
            <span className="uni-acct uni-acct-soon" aria-disabled title="TikTok connection coming soon">
              <span className="uni-acct-av uni-acct-av-ph" style={{ background: PLATFORM_TINT.tiktok }}>T</span>
              <span className="uni-acct-meta"><span className="uni-acct-name">TikTok</span><span className="uni-acct-plat">Coming soon</span></span>
            </span>
          )}
        </div>
        <div className="uni-controls">
          <DateRangeSelector maxDays={maxDays} />
          {canExport && <a href="/api/export" download className="uni-btn ghost"><Download size={14} /> Export</a>}
          <button type="button" className="uni-btn primary" onClick={() => askSocia({ context: { page: "analytics", range: String(rangeDays), metric: activeMetric ?? undefined } })}><Sparkles size={14} /> Ask SOCIA</button>
        </div>
      </div>

      {isAll && all ? (
        <>
          <div className="uni-idline">
            <span className="uni-badge" style={{ background: "var(--primary)" }}>All accounts</span>
            <span className="uni-idname">Everything you&apos;ve connected</span>
            <span className="uni-idrange">{rangeLabel}</span>
            <span className="uni-depth">Totals combine only what&apos;s comparable across platforms; audiences are counted per platform, not as unique people.</span>
          </div>

          <div className="uni-kpis">
            {([["views", "Total views", "count"], ["watch_time", "Watch time", "minutes"], ["engagement", "Interactions", "count"], ["net_followers", "Net audience", "count"], ["posts", "Posts", "count"]] as [MetricKey, string, "count" | "minutes"][]).map(([k, label, unit]) =>
              all.totals[k] == null ? null : (
                <div key={k} className="uni-kpi">
                  <span className="uni-kpi-label">{label}</span>
                  <span className="uni-kpi-value">{fmtValue(all.totals[k] ?? null, unit)}</span>
                  <span className="uni-kpi-foot"><span className="uni-tag obs">Observed</span><span className="uni-kpi-period">summed across platforms</span></span>
                </div>
              ),
            )}
            {all.totals.followers != null && (
              <div className="uni-kpi" title="Followers and subscribers on different platforms are different people, not one unique audience.">
                <span className="uni-kpi-label">Combined audience</span>
                <span className="uni-kpi-value">{fmtValue(all.totals.followers, "count")}</span>
                <span className="uni-kpi-foot"><span className="uni-kpi-period">≠ unique people</span></span>
              </div>
            )}
          </div>

          {xInsights.length > 0 && (
            <section className="uni-panel">
              <div className="uni-panel-head"><h3>SOCIA insights</h3></div>
              <div className="uni-insights">{xInsights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}</div>
            </section>
          )}

          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Platform breakdown</h3><span className="uni-sub">views · {rangeLabel}</span></div>
            {all.platforms.some((p) => p.views != null) ? (
              <Bars items={all.platforms.filter((p) => p.views != null).map((p) => ({ label: p.label, value: p.views!, share: p.share, sub: `${fmtN(p.views!)} · ${Math.round(p.share * 100)}%` }))} />
            ) : (
              <Empty>No platform reported views for this period.</Empty>
            )}
          </section>

          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Top content across platforms</h3></div>
            {all.posts.length ? (
              <div className="uni-content">{all.posts.slice(0, 12).map((p) => <PostCard key={`${p.platform}-${p.id}`} post={p} />)}</div>
            ) : (
              <Empty>No posts synced yet.</Empty>
            )}
          </section>
        </>
      ) : (
      <>
      {/* ---- account id line ---- */}
      <div className="uni-idline">
        <PlatformBadge platform={platform} />
        <span className="uni-idname">{acc.account.name ?? acc.account.handle ?? "Your account"}</span>
        {acc.account.handle && <span className="uni-idhandle">@{acc.account.handle.replace(/^@/, "")}</span>}
        <span className="uni-idrange">{rangeLabel}</span>
        <span className="uni-depth">{cap.depthNote}</span>
      </div>

      {/* ---- tabs ---- */}
      <div className="uni-tabs" role="tablist" aria-label="Analytics sections">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={t === tab} className={`uni-tab${t === tab ? " on" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {acc.collecting && tab !== "content" && (
        <div className="uni-collecting">SOCIA started recording {acc.account.audienceLabel.toLowerCase()} history for this account. The trend fills in as days are collected.</div>
      )}

      {/* ================= OVERVIEW ================= */}
      {tab === "overview" && (
        <>
          <div className="uni-kpis">
            {kpiKeys.map((k) => {
              const m = acc.kpis[k]!;
              const unit = metricCapability(platform, k)?.unit ?? "count";
              const chip = STATUS_CHIP[m.status];
              return (
                <div key={k} className="uni-kpi" title={m.source}>
                  <span className="uni-kpi-label">{metricLabel(platform, k)}</span>
                  <span className="uni-kpi-value">{fmtValue(m.value, unit)}</span>
                  <span className="uni-kpi-foot">{chip && <span className={`uni-tag ${chip.cls}`}>{chip.label}</span>}<span className="uni-kpi-period">{m.value == null ? m.method : m.period}</span></span>
                </div>
              );
            })}
          </div>
          {insights.length > 0 && (
            <section className="uni-panel">
              <div className="uni-panel-head"><h3>SOCIA insights</h3></div>
              <div className="uni-insights">{insights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}</div>
            </section>
          )}
          <TrendPanel />
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Top content</h3>{acc.posts.length > 6 && <button className="uni-link" onClick={() => setTab("content")}>See all</button>}</div>
            <ContentGrid posts={filterPosts(acc.posts, "top").slice(0, 6)} empty="No posts synced for this account yet." />
          </section>
        </>
      )}

      {/* ================= CONTENT ================= */}
      {tab === "content" && (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head">
              <h3>Content performance</h3>
              <div className="uni-seg">
                {(["top", "under", "breakout"] as PostFilter[]).map((k) => (
                  <button key={k} className={`uni-seg-b${pf === k ? " on" : ""}`} onClick={() => setPf(k)}>{k === "top" ? "Top" : k === "under" ? "Underperforming" : "Breakouts"}</button>
                ))}
              </div>
            </div>
            <ContentGrid
              posts={filtered}
              empty={
                pf === "under" ? (acc.baseline.all ? "No post fell below 70% of your typical in this period." : "Underperformers appear once SOCIA has a baseline (a few posts with known engagement).")
                : pf === "breakout" ? (acc.baseline.all ? "No post reached 3× your typical in this period." : "Breakouts appear once SOCIA has a baseline (a few posts with known engagement).")
                : "No posts synced for this account yet."
              }
            />
          </section>

          <section className="uni-panel">
            <div className="uni-panel-head"><h3>By format</h3><span className="uni-sub">{breakdown.metric === "views" ? "Views" : "Interactions"} by format · {rangeLabel}</span></div>
            {breakdown.slices.length ? (
              <>
                <Bars items={breakdown.slices.map((s) => ({ label: `${s.label} (${s.count})`, value: s.value, share: s.share, sub: `${fmtN(s.value)} · ${Math.round(s.share * 100)}%` }))} />
                {table.length > 1 && (
                  <table className="uni-table">
                    <thead><tr><th>Format</th><th>Posts</th><th>Median views</th><th>Median interactions</th><th>Median ×</th></tr></thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.format}><td>{r.label}</td><td>{r.count}</td><td>{fmtN(r.medViews)}</td><td>{fmtN(r.medEng)}</td><td>{r.medMult != null ? fmtMult(r.medMult) : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : <Empty>No posts in this period to break down.</Empty>}
          </section>
        </>
      )}

      {/* ================= AUDIENCE ================= */}
      {tab === "audience" && (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>{acc.account.audienceLabel} history</h3></div>
            {acc.series.followers ? (
              <UniTrend series={acc.series.followers} />
            ) : (
              <Empty>{cap.label} doesn&apos;t provide {acc.account.audienceLabel.toLowerCase()} history. SOCIA records it once a day from connect onward, so a trend builds over time.</Empty>
            )}
          </section>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Demographics</h3>{acc.demographics.basis && <span className="uni-sub">{acc.demographics.basis}</span>}</div>
            {hasDemo ? (
              <div className="uni-demo">
                {demoDims.age?.length ? <div className="uni-demo-col"><h4>Age</h4><Bars items={demoDims.age.map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
                {demoDims.gender?.length ? <div className="uni-demo-col"><h4>Gender</h4><Bars items={demoDims.gender.map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
                {demoDims.city?.length ? <div className="uni-demo-col"><h4>Top locations</h4><Bars items={demoDims.city.slice(0, 6).map((b) => ({ label: b.label, value: b.value, share: b.share }))} /></div> : null}
              </div>
            ) : <Empty>{acc.demographics.reason || `${cap.label} doesn't provide audience demographics for this account.`}</Empty>}
          </section>
        </>
      )}

      {/* ================= POSTING TIMES ================= */}
      {tab === "times" && (
        <section className="uni-panel">
          <div className="uni-panel-head"><h3>Posting times</h3><span className="uni-sub">medians vs your typical post, {windows.posts} dated posts</span></div>
          {windows.enough ? (
            <>
              {windows.best.length ? (
                <div className="uni-windows">
                  {windows.best.map((w) => (
                    <div key={`${w.day}-${w.block}`} className="uni-window">
                      <span className="uni-window-label">{w.label}</span>
                      <span className={`uni-window-rel${w.rel >= 1 ? " up" : ""}`}>{relText(w.rel)}</span>
                      <span className="uni-window-n">{w.n} posts{w.confidence === "early" ? " · early signal" : ""}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty>No single window stands out above your typical yet.</Empty>}
              <div className="uni-demo" style={{ marginTop: 16 }}>
                <div className="uni-demo-col">
                  <h4>By weekday</h4>
                  <Bars items={windows.byDay.filter((r) => r.n > 0).map((r) => ({ label: DOW[r.index], value: r.rel ?? 0, share: r.rel != null && windows.maxRel > 0 ? Math.min(1, r.rel / windows.maxRel) : 0, sub: r.rel != null ? relText(r.rel) : `${r.n} posts` }))} />
                </div>
                <div className="uni-demo-col">
                  <h4>By time of day</h4>
                  <Bars items={windows.byBlock.filter((r) => r.n > 0).map((r) => ({ label: BLOCKS[r.index], value: r.rel ?? 0, share: r.rel != null && windows.maxRel > 0 ? Math.min(1, r.rel / windows.maxRel) : 0, sub: r.rel != null ? relText(r.rel) : `${r.n} posts` }))} />
                </div>
              </div>
            </>
          ) : (
            <Empty>Not enough dated posts yet to find a reliable posting time — this account has {windows.posts}. A pattern needs more history.</Empty>
          )}
        </section>
      )}

      {/* ================= GROWTH ================= */}
      {tab === "growth" && (
        <>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>{acc.account.audienceLabel} change</h3></div>
            {acc.series.net_followers ? (
              <UniTrend series={acc.series.net_followers} />
            ) : acc.series.followers ? (
              <UniTrend series={acc.series.followers} />
            ) : (
              <div className="uni-chart uni-chart-empty" style={{ minHeight: 160 }}>
                <p className="uni-empty-title">No {acc.account.audienceLabel.toLowerCase()}-change series for this account yet</p>
                <p className="uni-chart-note">SOCIA records {acc.account.audienceLabel.toLowerCase()} daily from connect; a change series builds over time.</p>
              </div>
            )}
          </section>
          <section className="uni-panel">
            <div className="uni-panel-head"><h3>Engagement</h3></div>
            {split.parts.length ? (
              <Bars items={split.parts.map((p) => ({ label: metricLabel(platform, p.key), value: p.value, share: p.share ?? 0, sub: `${fmtN(p.value)}${p.share != null ? ` · ${Math.round(p.share * 100)}%` : ""}` }))} />
            ) : <Empty>{cap.label} didn&apos;t return an interaction breakdown for these posts.</Empty>}
          </section>
        </>
      )}
      </>
      )}
    </div>
  );
}
