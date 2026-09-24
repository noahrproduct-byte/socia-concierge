"use client";

// Content detail drawer. Opens when a content row or bar is clicked and shows
// everything the platform actually returned for that post — only the metrics
// that exist, never a fake zero for one a platform doesn't provide. Relative
// performance is the post's multiplier against its own account's like-with-like
// baseline, and the observations are deterministic statements from that data.

import Drawer from "@/components/ov/Drawer";
import { metricLabel, platformCapability } from "@/lib/analytics/capabilities";
import { formatLabel } from "@/lib/analytics/format";
import type { MetricKey, NormalizedPost, Platform } from "@/lib/analytics/types";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };
const fmtN = (v: number | null | undefined): string => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US"));
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;

// The metrics we show, in order; only those present on the post appear.
const METRIC_ROWS: MetricKey[] = ["views", "reach", "likes", "comments", "shares", "saves", "watch_time"];

function observations(post: NormalizedPost, baseline: number | null): string[] {
  const out: string[] = [];
  const fmt = formatLabel(post.format).toLowerCase();
  if (post.multiplier != null) {
    if (post.multiplier >= 3) out.push(`A breakout — ${fmtMult(post.multiplier)} the interactions of your typical ${fmt}.`);
    else if (post.multiplier >= 1.15) out.push(`Above your norm — ${fmtMult(post.multiplier)} your typical ${fmt}.`);
    else if (post.multiplier < 0.7) out.push(`Below your norm — ${fmtMult(post.multiplier)} your typical ${fmt}.`);
    else out.push(`About typical for a ${fmt} on this account (${fmtMult(post.multiplier)}).`);
  } else if (baseline == null) {
    out.push(`SOCIA needs a few more ${fmt}s with known engagement before it can say how this compares.`);
  }
  if (post.metrics.views != null && post.engagement != null && post.metrics.views > 0) {
    const rate = (post.engagement / post.metrics.views) * 100;
    out.push(`${rate.toFixed(rate < 1 ? 2 : 1)}% of its views turned into interactions.`);
  }
  return out;
}

export default function ContentDrawer({ post, baseline, onClose }: { post: NormalizedPost | null; baseline: number | null; onClose: () => void }) {
  return (
    <Drawer open={!!post} title="Content detail" onClose={onClose} width={420}>
      {post && (
        <div className="uni-cd">
          {post.thumb && <div className="uni-cd-thumb" style={{ backgroundImage: `url(${post.thumb})` }} />}
          <div className="uni-cd-head">
            <span className="uni-badge" style={{ background: TINT[post.platform] }}>{platformCapability(post.platform).label}</span>
            <span className="uni-cd-format">{formatLabel(post.format)}</span>
            <span className="uni-cd-date">{new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          <h3 className="uni-cd-title">{post.title || "(no caption)"}</h3>
          {post.caption && post.caption !== post.title && <p className="uni-cd-caption">{post.caption.slice(0, 320)}{post.caption.length > 320 ? "…" : ""}</p>}

          <div className="uni-cd-metrics">
            {METRIC_ROWS.map((k) => (post.metrics[k] != null ? (
              <div key={k} className="uni-cd-metric"><span>{metricLabel(post.platform, k)}</span><b>{fmtN(post.metrics[k])}</b></div>
            ) : null))}
            {post.engagement != null && <div className="uni-cd-metric"><span>Engagement</span><b>{fmtN(post.engagement)}</b></div>}
          </div>

          {post.multiplier != null && (
            <div className="uni-cd-vs">
              <span className={`uni-cd-mult ${post.multiplier >= 1 ? "up" : "down"}`}>{fmtMult(post.multiplier)} typical</span>
              {baseline != null && <span className="uni-cd-base">vs a typical {formatLabel(post.format).toLowerCase()} of {fmtN(baseline)} interactions</span>}
            </div>
          )}

          <div className="uni-cd-obs">
            <h4>SOCIA observations</h4>
            <ul>{observations(post, baseline).map((o, i) => <li key={i}>{o}</li>)}</ul>
          </div>

          {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="uni-btn ghost uni-cd-open">Open on {platformCapability(post.platform).label} →</a>}
        </div>
      )}
    </Drawer>
  );
}
