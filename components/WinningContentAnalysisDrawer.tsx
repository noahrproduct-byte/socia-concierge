"use client";

// Analysis drawer for one winning post. Two clearly separated halves:
// OBSERVED DATA — values SOCIA measured or the platform published.
// AI INTERPRETATION — a reading of why it may have worked, labelled as such.
// The interpretation never adds a number the observed half doesn't have.

import { X, ExternalLink, ArrowRight, Info } from "lucide-react";
import type { WinningItem } from "@/components/CompetitorWorkspace";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

export default function WinningContentAnalysisDrawer({ item, onClose }: { item: WinningItem; onClose: () => void }) {
  const format = item.platform === "youtube" ? "Short / video" : item.platform === "facebook" ? "Facebook video" : "Reel";
  const ask = `Analyse this ${format}: "${item.title ?? item.url}"${item.accountName ? ` by ${item.accountName}` : ""}. Observed: ${fmtN(item.views)} views, ${fmtN(item.likes)} likes, ${fmtN(item.comments)} comments${item.multiplier ? `, ${item.multiplier.toFixed(1)}× the creator's median` : ""}${item.trendTags.length ? `; detected features: ${item.trendTags.join(", ")}` : ""}. Using only those facts, explain why it likely worked and give me a version for my own account.`;

  return (
    <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label="Post analysis">
      <div className="cp4-scrim" onClick={onClose} />
      <aside className="cp4-drawer wa">
        <div className="cp4-modal-head">
          <div className="cp4-drawer-id">
            <h3>{item.title ?? "(untitled)"}</h3>
            <small>{item.accountName ?? "Unknown creator"} · {format}</small>
          </div>
          <button type="button" className="cp4-x" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        {item.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wa-thumb" src={item.thumbnailUrl} alt="" />
        )}
        <a className="cp4-drawer-visit" href={item.url} target="_blank" rel="noreferrer">
          View original <ExternalLink size={13} />
        </a>

        <div className="cp4-drawer-sec">
          <h4>Observed data</h4>
          <ul className="cp4-drawer-metrics">
            <li><span>Format</span><b className="real">{format}</b></li>
            <li><span>Views</span><b className="real">{fmtN(item.views)}</b></li>
            <li><span>Likes</span><b className="real">{fmtN(item.likes)}</b></li>
            <li><span>Comments</span><b className="real">{fmtN(item.comments)}</b></li>
            <li><span>Published</span><b className="real">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</b></li>
            <li>
              <span>Performance</span>
              <b className="real" title="This post's views ÷ the creator's own median views across their recent uploads.">
                {item.multiplier != null ? `${item.multiplier.toFixed(1)}× creator baseline` : "Baseline not available"}
              </b>
            </li>
            {item.trendTags.length > 0 && (
              <li><span>Detected features</span><b className="real">{item.trendTags.join(" · ")}</b></li>
            )}
          </ul>
          <p className="cp4-drawer-note">
            <Info size={11} /> Views, likes and comments are the platform&apos;s public counts. Detected features come
            from the title text. Nothing here is estimated.
          </p>
        </div>

        <div className="cp4-drawer-sec wa-ai">
          <h4>AI interpretation</h4>
          {item.why ? (
            <p className="wa-why">{item.why}</p>
          ) : (
            <p className="cp4-drawer-note">No interpretation has been generated for this post yet.</p>
          )}
          <a className="cw-link" href={`/chat?q=${encodeURIComponent(ask)}`} data-ask-context={JSON.stringify({ page: "competitors", competitorName: item.accountName ?? undefined, competitorPlatform: item.platform })} data-ask-label={`Post: ${(item.title ?? item.url).slice(0, 40)}`} data-ask-send="1">
            {item.why ? "Go deeper with SOCIA" : "Ask SOCIA why it worked"} <ArrowRight size={13} />
          </a>
          <p className="cp4-drawer-note">
            <Info size={11} /> Interpretation is a reading of the observed data above, not a measurement.
          </p>
        </div>
      </aside>
    </div>
  );
}
