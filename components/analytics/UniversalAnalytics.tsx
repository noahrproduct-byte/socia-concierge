"use client";

// The universal Analytics shell. One page, every platform: it reads the
// normalized NormalizedAccountAnalytics bundle produced by the platform
// adapters and never touches a platform's raw shape. Instagram, YouTube and
// Facebook render through the exact same tree; the differences between them are
// data (which metrics exist, which are true series), declared by the capability
// registry — not four hand-built dashboards.
//
// v1 scope: account/platform selector, date range, Export (where it applies),
// Ask SOCIA, and a cross-platform Overview (KPIs, a real trend, top content,
// demographics). Content / Audience / Times / Growth tabs and All-Accounts are
// the next increments; this is developed behind ?v=2 so the live page is not
// regressed until it reaches parity.

import { useMemo, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { askSocia } from "@/lib/ask";
import DateRangeSelector from "@/components/DateRangeSelector";
import UniTrend from "./UniTrend";
import { metricCapability, metricLabel, platformCapability } from "@/lib/analytics/capabilities";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedSeries, Platform, Status } from "@/lib/analytics/types";
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

// The order KPIs appear in, when present for the platform.
const KPI_ORDER: MetricKey[] = ["followers", "views", "watch_time", "net_followers", "reach", "engagement", "engagement_rate", "posts"];
// Which series a viewer can switch the primary chart between, in preference order.
const SERIES_PREF: MetricKey[] = ["views", "watch_time", "net_followers", "reach", "engagement", "followers"];

function fmtValue(v: number | null, unit: "count" | "percent" | "minutes" | "seconds"): string {
  if (v == null) return "—";
  if (unit === "percent") return `${v.toFixed(v < 1 ? 2 : 1)}%`;
  if (unit === "minutes") {
    const h = v / 60;
    return h >= 1 ? `${h >= 10 ? Math.round(h) : h.toFixed(1)}h` : `${Math.round(v)}m`;
  }
  return v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US");
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="uni-badge" style={{ background: PLATFORM_TINT[platform] }}>
      {platformCapability(platform).label}
    </span>
  );
}

export default function UniversalAnalytics({
  accounts,
  rangeLabel,
  rangeDays,
  maxDays,
  tiktokComingSoon = true,
}: {
  accounts: NormalizedAccountAnalytics[];
  rangeLabel: string;
  rangeDays: number;
  maxDays?: number;
  tiktokComingSoon?: boolean;
}) {
  const [sel, setSel] = useState(0);
  const acc = accounts[sel];
  const platform = acc.account.platform;

  const seriesKeys = useMemo(() => {
    const present = (Object.keys(acc.series) as MetricKey[]).filter((k) => acc.series[k]);
    return SERIES_PREF.filter((k) => present.includes(k)).concat(present.filter((k) => !SERIES_PREF.includes(k)));
  }, [acc]);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const activeMetric: MetricKey | null = metric && seriesKeys.includes(metric) ? metric : (seriesKeys[0] ?? null);
  const activeSeries: NormalizedSeries | null = activeMetric ? acc.series[activeMetric] ?? null : null;

  const kpis = KPI_ORDER.filter((k) => acc.kpis[k]);
  const primaryPostStat = (p: NormalizedAccountAnalytics["posts"][number]): { label: string; value: number | null } => {
    if (p.metrics.views != null) return { label: "views", value: p.metrics.views };
    return { label: "interactions", value: p.engagement };
  };
  const topPosts = [...acc.posts]
    .sort((a, b) => (primaryPostStat(b).value ?? -1) - (primaryPostStat(a).value ?? -1))
    .slice(0, 8);

  const canExport = platform === "instagram"; // /api/export currently serves Instagram
  const ageBars = acc.demographics.status === "ok" ? acc.demographics.dimensions.age ?? [] : [];
  const cityBars = acc.demographics.status === "ok" ? acc.demographics.dimensions.city ?? [] : [];

  return (
    <div className="uni">
      {/* ---- header ---- */}
      <div className="uni-head">
        <div className="uni-accounts" role="tablist" aria-label="Connected accounts">
          {accounts.map((a, i) => (
            <button
              key={`${a.account.platform}-${a.account.accountId}`}
              className={`uni-acct${i === sel ? " on" : ""}`}
              role="tab"
              aria-selected={i === sel}
              onClick={() => { setSel(i); setMetric(null); }}
            >
              {a.account.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.account.avatar} alt="" className="uni-acct-av" />
              ) : (
                <span className="uni-acct-av uni-acct-av-ph" style={{ background: PLATFORM_TINT[a.account.platform] }}>
                  {(a.account.name ?? a.account.handle ?? "?").slice(0, 1).toUpperCase()}
                </span>
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
              <span className="uni-acct-meta">
                <span className="uni-acct-name">TikTok</span>
                <span className="uni-acct-plat">Coming soon</span>
              </span>
            </span>
          )}
        </div>
        <div className="uni-controls">
          <DateRangeSelector maxDays={maxDays} />
          {canExport && (
            <a href="/api/export" download className="uni-btn ghost">
              <Download size={14} /> Export
            </a>
          )}
          <button type="button" className="uni-btn primary" onClick={() => askSocia({ context: { page: "analytics", range: String(rangeDays), metric: activeMetric ?? undefined } })}>
            <Sparkles size={14} /> Ask SOCIA
          </button>
        </div>
      </div>

      {/* ---- account line ---- */}
      <div className="uni-idline">
        <PlatformBadge platform={platform} />
        <span className="uni-idname">{acc.account.name ?? acc.account.handle ?? "Your account"}</span>
        {acc.account.handle && <span className="uni-idhandle">@{acc.account.handle.replace(/^@/, "")}</span>}
        <span className="uni-idrange">{rangeLabel}</span>
        <span className="uni-depth">{platformCapability(platform).depthNote}</span>
      </div>

      {acc.collecting && (
        <div className="uni-collecting">SOCIA started recording {acc.account.audienceLabel.toLowerCase()} history for this account. The trend fills in as days are collected.</div>
      )}

      {/* ---- KPIs ---- */}
      <div className="uni-kpis">
        {kpis.map((k) => {
          const m = acc.kpis[k]!;
          const unit = metricCapability(platform, k)?.unit ?? "count";
          const chip = STATUS_CHIP[m.status];
          return (
            <div key={k} className="uni-kpi" title={m.source}>
              <span className="uni-kpi-label">{metricLabel(platform, k)}</span>
              <span className="uni-kpi-value">{fmtValue(m.value, unit)}</span>
              <span className="uni-kpi-foot">
                {chip && <span className={`uni-tag ${chip.cls}`}>{chip.label}</span>}
                <span className="uni-kpi-period">{m.value == null ? m.method : m.period}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* ---- primary trend ---- */}
      {activeSeries ? (
        <section className="uni-panel">
          <div className="uni-panel-head">
            <h3>Performance</h3>
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
      ) : (
        <section className="uni-panel">
          <div className="uni-panel-head"><h3>Performance</h3></div>
          <div className="uni-chart uni-chart-empty" style={{ minHeight: 200 }}>
            <p className="uni-empty-title">{platformCapability(platform).label} doesn&apos;t provide a daily trend for this account</p>
            <p className="uni-chart-note">SOCIA shows what {platformCapability(platform).label} exposes and records history from connect onward — nothing is estimated.</p>
          </div>
        </section>
      )}

      {/* ---- top content ---- */}
      <section className="uni-panel">
        <div className="uni-panel-head"><h3>Top content</h3></div>
        {topPosts.length ? (
          <div className="uni-content">
            {topPosts.map((p) => {
              const stat = primaryPostStat(p);
              return (
                <a key={p.id} className="uni-card" href={p.permalink ?? undefined} target="_blank" rel="noreferrer">
                  <span className="uni-card-thumb" style={{ backgroundImage: p.thumb ? `url(${p.thumb})` : undefined }}>
                    <PlatformBadge platform={p.platform} />
                    {p.multiplier != null && <span className={`uni-mult${p.multiplier >= 1 ? " up" : ""}`}>{p.multiplier >= 10 ? p.multiplier.toFixed(0) : p.multiplier.toFixed(1)}×</span>}
                  </span>
                  <span className="uni-card-stat">{stat.value != null ? `${fmtValue(stat.value, "count")} ${stat.label}` : "—"}</span>
                  <span className="uni-card-title">{p.title || "(no caption)"}</span>
                  <span className="uni-card-date">{new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="uni-chart-note">No posts synced for this account yet.</p>
        )}
      </section>

      {/* ---- demographics ---- */}
      <section className="uni-panel">
        <div className="uni-panel-head"><h3>Audience</h3></div>
        {acc.demographics.status === "ok" && (ageBars.length || cityBars.length) ? (
          <div className="uni-demo">
            {ageBars.length > 0 && (
              <div className="uni-demo-col">
                <h4>Age <span className="uni-demo-basis">{acc.demographics.basis}</span></h4>
                {ageBars.map((b) => (
                  <div key={b.label} className="uni-demo-row">
                    <span className="uni-demo-key">{b.label}</span>
                    <span className="uni-demo-track"><span className="uni-demo-fill" style={{ width: `${Math.round(b.share * 100)}%` }} /></span>
                    <span className="uni-demo-val">{Math.round(b.share * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
            {cityBars.length > 0 && (
              <div className="uni-demo-col">
                <h4>Top locations <span className="uni-demo-basis">{acc.demographics.basis}</span></h4>
                {cityBars.slice(0, 6).map((b) => (
                  <div key={b.label} className="uni-demo-row">
                    <span className="uni-demo-key">{b.label}</span>
                    <span className="uni-demo-track"><span className="uni-demo-fill" style={{ width: `${Math.round(b.share * 100)}%` }} /></span>
                    <span className="uni-demo-val">{Math.round(b.share * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="uni-chart-note">{acc.demographics.reason || `${platformCapability(platform).label} doesn't provide audience demographics for this account.`}</p>
        )}
      </section>
    </div>
  );
}
