"use client";

// A small row of Reels to make the video like, above the Video editor: the
// same Reels the Dashboard's "Going viral in your niche" shows (Discover's,
// app/api/dashboard/viral), cut to the ones that took off by their own
// published numbers. Each shows its cover, its account and the numbers the
// platform gave; Preview plays it; Use as reference reads it as the reference
// for this video. When there are none (no access, nothing proven yet, an
// error), the row isn't shown: nothing unrelated fills it.
import { useEffect, useState } from "react";
import { ExternalLink, Play, X } from "lucide-react";
import type { ViralReel } from "@/lib/viralPick";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));

/** The numbers the platform gave, the strongest first: its multiple of the account's usual, then views or likes. */
function numbers(r: ViralReel): string | null {
  const parts = [
    r.multiplier != null ? `${r.multiplier >= 10 ? r.multiplier.toFixed(0) : r.multiplier.toFixed(1)}× their usual` : null,
    r.views != null ? `${fmt(r.views)} views` : r.likes != null ? `${fmt(r.likes)} likes` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The link SOCIA serves the Reel's file through, signed for this viewer; null when official data gave no file. */
export const reelVideoUrl = (r: Pick<ViralReel, "video" | "refToken">): string | null =>
  r.video && r.refToken ? `/api/studio/reference/media?url=${encodeURIComponent(r.video)}&token=${r.refToken}` : null;
export const reelName = (r: Pick<ViralReel, "accountHandle" | "accountName" | "format">) => `${r.accountHandle ? `@${r.accountHandle}` : r.accountName} ${r.format}.mp4`;

export default function Inspiration({ chosen, onUse }: {
  /** the URL of the Reel in use as the reference, if it came from here */
  chosen: string | null;
  onUse: (r: ViralReel) => void;
}) {
  const [reels, setReels] = useState<ViralReel[] | null>(null);
  const [preview, setPreview] = useState<ViralReel | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/viral?max=6")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { access?: boolean; reels?: ViralReel[] } | null) => { if (alive) setReels(j?.access && Array.isArray(j.reels) ? j.reels.slice(0, 6) : []); })
      .catch(() => { if (alive) setReels([]); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  if (!reels?.length) return null;
  const previewUrl = preview ? reelVideoUrl(preview) : null;
  return (
    <section className="qe-insp" aria-labelledby="qe-insp-h">
      <div className="qe-insp-head">
        <h3 id="qe-insp-h">Make it like one of these</h3>
        <small>Optional. Reels in your niche that took off by their own numbers.</small>
      </div>
      <ul>
        {reels.map((r) => {
          const n = numbers(r);
          const canUse = Boolean(reelVideoUrl(r));
          const on = chosen === r.url;
          return (
            <li key={r.url} className={on ? "is-on" : undefined}>
              <button type="button" className="qe-insp-cover" onClick={() => (reelVideoUrl(r) ? setPreview(r) : window.open(r.url, "_blank", "noopener,noreferrer"))} aria-label={`Preview the ${r.format} by ${r.accountName}`}>
                {r.thumb
                  // eslint-disable-next-line @next/next/no-img-element -- the platform's own cover image
                  ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  : <span className="qe-insp-blank">{r.format}</span>}
                <span className="qe-insp-play" aria-hidden><Play size={14} /></span>
              </button>
              <b>{r.accountHandle ? `@${r.accountHandle}` : r.accountName}</b>
              {n && <small>{n}</small>}
              <button type="button" className="qe-link" disabled={!canUse || on} title={canUse ? undefined : "Instagram doesn't give SOCIA this Reel's video file."} onClick={() => onUse(r)}>
                {on ? "In use" : "Use as reference"}
              </button>
            </li>
          );
        })}
      </ul>
      {preview && (
        <div className="qe-insp-modal" role="dialog" aria-modal="true" aria-label={`The ${preview.format} by ${preview.accountName}`} onClick={() => setPreview(null)}>
          <div className="qe-insp-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ov-x" aria-label="Close" onClick={() => setPreview(null)}><X size={16} /></button>
            {previewUrl && <video src={previewUrl} controls autoPlay playsInline />}
            <div className="qe-insp-sheet-foot">
              <span><b>{preview.accountHandle ? `@${preview.accountHandle}` : preview.accountName}</b>{numbers(preview) ? ` · ${numbers(preview)}` : ""}</span>
              <a href={preview.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden /> Open on Instagram</a>
              <button type="button" className="qe-btn is-primary" disabled={chosen === preview.url} onClick={() => { onUse(preview); setPreview(null); }}>{chosen === preview.url ? "In use" : "Use as reference"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
