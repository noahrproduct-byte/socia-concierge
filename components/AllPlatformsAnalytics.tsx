"use client";

// The "All Platforms" overview. Combined numbers appear ONLY where the server
// said the combination is valid (audience, content, directional engagement);
// there is no combined "views" by design. Per-platform cards keep each
// platform's own native metrics, and the Performance graph overlays only the
// platforms that actually have a real daily series.

import { useState } from "react";
import { Users, FileText, Heart, ArrowRight, Sparkles } from "lucide-react";
import MultiLineChart, { type OverlayLine } from "./ov/MultiLineChart";
import StatTile from "./ov/StatTile";
import { platformMark, PLATFORM_TINT as TINT } from "./platformMarks";
import { fmtNum, type Granularity } from "@/lib/overview";
import type { AllPlatformsData, PlatformSummary } from "@/lib/metrics/allPlatforms";
import "./platformAnalytics.css";

function PlatformCard({ s, onOpen }: { s: PlatformSummary; onOpen: (p: string) => void }) {
  if (!s.connected) {
    return (
      <div className="pa-pcard" style={{ opacity: 0.7 }}>
        <div className="pa-pcard-head">
          <span className="pa-pcard-ico" style={{ background: TINT[s.platform] }}>{platformMark(s.platform, "#fff", 14)}</span>
          <b>{s.label}</b>
          <small>Not connected</small>
        </div>
        <p className="pa-pcard-insight">Connect {s.label} to see it here and in the All-Platforms totals.</p>
        <a className="pa-pcard-link" href="/settings">Connect {s.label} <ArrowRight size={13} /></a>
      </div>
    );
  }
  // Secondary metric: prefer the platform's native views; else engagement.
  const secondary = s.views != null
    ? { value: fmtNum(s.views), label: "views", dim: false }
    : s.engagement != null
      ? { value: fmtNum(s.engagement), label: "engagement", dim: false }
      : { value: "—", label: s.viewsNote ? "views" : "engagement", dim: true };
  return (
    <div className="pa-pcard">
      <div className="pa-pcard-head">
        <span className="pa-pcard-ico" style={{ background: TINT[s.platform] }}>{platformMark(s.platform, "#fff", 14)}</span>
        <b>{s.label}</b>
        <small>{s.contentPublished != null ? `${s.contentPublished} posted` : ""}</small>
      </div>
      <div className="pa-pcard-metrics">
        <span className="pa-pcard-metric">
          <b className={s.audience == null ? "dim" : ""}>{s.audience != null ? fmtNum(s.audience) : "—"}</b>
          <small>{s.audienceLabel}</small>
        </span>
        <span className="pa-pcard-metric">
          <b className={secondary.dim ? "dim" : ""}>{secondary.value}</b>
          <small>{secondary.label}</small>
        </span>
      </div>
      <button type="button" className="pa-pcard-link" onClick={() => onOpen(s.platform)}>
        View {s.label} analytics <ArrowRight size={13} />
      </button>
    </div>
  );
}

export default function AllPlatformsAnalytics({
  data,
  overlay,
  today,
  onOpen,
}: {
  data: AllPlatformsData;
  overlay: { lines: OverlayLine[]; note: string };
  today?: string;
  onOpen: (p: string) => void;
}) {
  const [gran, setGran] = useState<Granularity>("day");
  const hasOverlay = overlay.lines.some((l) => l.points.some((p) => p.value != null));

  return (
    <section className="pa" aria-label="All platforms analytics">
      <section className="ov-card">
        <div className="ov-card-head"><h2>Connected presence</h2></div>
        <div className="pa-presence">
          {data.presence.map((p) => (
            <span key={p.platform} className={`pa-chip${p.connected ? "" : " off"}`}>
              <span className="pa-chip-dot" style={{ background: TINT[p.platform] }} />
              {p.label}{p.connected ? "" : " · off"}
            </span>
          ))}
        </div>
      </section>

      <div className="ov-kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <StatTile Icon={Users} tone="info" label="Total audience" value={data.combined.audience.value != null ? fmtNum(data.combined.audience.value) : "—"} note={data.combined.audience.note} status={data.combined.audience.value != null ? "ok" : "unavailable"} />
        <StatTile Icon={FileText} tone="primary" label="Content published" value={data.combined.contentPublished.value != null ? String(data.combined.contentPublished.value) : "—"} note={data.combined.contentPublished.note} status={data.combined.contentPublished.value != null ? "ok" : "unavailable"} />
        <StatTile Icon={Heart} tone="pink" label="Engagement" value={data.combined.engagement.value != null ? fmtNum(data.combined.engagement.value) : "—"} note={data.combined.engagement.note} status={data.combined.engagement.value != null ? "ok" : "unavailable"} />
      </div>

      <section className="ov-card">
        <div className="ov-card-head wrap">
          <h2>Views over time</h2>
          <div className="ov-seg" role="tablist" aria-label="Grouping">
            <button className={gran === "day" ? "on" : ""} onClick={() => setGran("day")}>Daily</button>
            <button className={gran === "week" ? "on" : ""} onClick={() => setGran("week")}>Weekly</button>
          </div>
        </div>
        {hasOverlay ? (
          <>
            <MultiLineChart lines={overlay.lines} granularity={gran} unit="views" today={today} height={280} />
            <p className="pa-note">{overlay.note}</p>
          </>
        ) : (
          <div className="ov-empty"><b>No daily views series yet</b><p>{overlay.note}</p></div>
        )}
      </section>

      <section className="ov-card">
        <div className="ov-card-head"><h2><Sparkles size={15} /> SOCIA insights</h2></div>
        <ul className="pa-unavail">
          {data.insights.map((i) => (
            <li key={i.id}><b>{i.title}</b><span>{i.body}</span></li>
          ))}
        </ul>
      </section>

      <div className="pa-grid">
        {data.platforms.map((s) => <PlatformCard key={s.platform} s={s} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
