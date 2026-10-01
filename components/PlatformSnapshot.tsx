// "Platform snapshot" for the Dashboard: one compact card per platform showing
// that platform's OWN native metrics, with a one-click drill-in to its analytics
// tab. Shared by the Instagram dashboard and the no-Instagram dashboard. Links
// navigate to /analytics?platform=<id>, which the analytics switcher honours.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { platformMark, PLATFORM_TINT } from "./platformMarks";
import { fmtNum } from "@/lib/overview";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import "./platformAnalytics.css";

function Card({ s }: { s: PlatformSummary }) {
  if (!s.connected) {
    return (
      <div className="pa-pcard" style={{ opacity: 0.7 }}>
        <div className="pa-pcard-head">
          <span className="pa-pcard-ico" style={{ background: PLATFORM_TINT[s.platform] }}>{platformMark(s.platform, "#fff", 14)}</span>
          <b>{s.label}</b>
          <small>Not connected</small>
        </div>
        <Link className="pa-pcard-link" href="/settings#accounts">Connect {s.label} <ArrowRight size={13} /></Link>
      </div>
    );
  }
  const secondary = s.views != null
    ? { value: fmtNum(s.views), label: "views", dim: false }
    : s.engagement != null
      ? { value: fmtNum(s.engagement), label: "engagement", dim: false }
      : { value: "—", label: "engagement", dim: true };
  return (
    <div className="pa-pcard">
      <div className="pa-pcard-head">
        <span className="pa-pcard-ico" style={{ background: PLATFORM_TINT[s.platform] }}>{platformMark(s.platform, "#fff", 14)}</span>
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
      <Link className="pa-pcard-link" href={`/analytics?platform=${s.platform}`}>View {s.label} analytics <ArrowRight size={13} /></Link>
    </div>
  );
}

export default function PlatformSnapshot({ summaries, title = "Platform snapshot", sub }: { summaries: PlatformSummary[]; title?: string; sub?: string }) {
  if (!summaries.some((s) => s.connected)) return null;
  return (
    <section className="ov-card" aria-label="Platform snapshot">
      <div className="ov-card-head">
        <h2>{title}</h2>
        {sub && <span className="ov-card-sub">{sub}</span>}
      </div>
      <div className="pa-grid">
        {summaries.map((s) => <Card key={s.platform} s={s} />)}
      </div>
    </section>
  );
}
