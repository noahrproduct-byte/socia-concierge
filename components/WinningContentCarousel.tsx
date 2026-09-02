"use client";

// Horizontal carousel of real competitor posts. Native overflow scrolling
// (trackpad, shift+wheel, keyboard) with working arrow buttons layered on
// top; no auto-scroll, no loop. Card widths are fixed so the next card peeks
// in from the right — that peek is what tells the user there is more.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Heart, MessageCircle } from "lucide-react";
import type { WinningItem } from "@/components/CompetitorWorkspace";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

export default function WinningContentCarousel({ items, onAnalyze }: { items: WinningItem[]; onAnalyze: (item: WinningItem) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [update, items.length]);

  const step = (dirn: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".wc-card");
    const by = (card?.offsetWidth ?? 240) + 12;
    el.scrollBy({ left: by * dirn, behavior: "smooth" });
  };

  return (
    <div className="wc-wrap">
      {canLeft && (
        <button type="button" className="wc-arrow left" onClick={() => step(-1)} aria-label="Previous winning content">
          <ChevronLeft size={16} />
        </button>
      )}
      <div
        className="wc-scroll"
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label="Winning content carousel"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        }}
      >
        {items.map((w) => {
          return (
            <article className="wc-card" key={w.url}>
              <a className="wc-thumb" href={w.url} target="_blank" rel="noreferrer" aria-label={`Open: ${w.title ?? "post"}`}>
                {w.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.thumbnailUrl} alt="" loading="lazy" />
                ) : <span className="wc-thumb-ph"><Play size={20} /></span>}
                <span className="wc-badge">{w.platform === "youtube" ? "Shorts" : w.platform === "facebook" ? "Facebook" : "Reels"}</span>
              </a>
              <b className="wc-title" title={w.title ?? undefined}>{w.title ?? "(untitled)"}</b>
              <small className="wc-creator">{w.accountName ?? "Unknown creator"}</small>
              <div className="wc-stats">
                <span><Play size={11} /> {fmtN(w.views)}</span>
                <span><Heart size={11} /> {fmtN(w.likes)}</span>
                <span><MessageCircle size={11} /> {fmtN(w.comments)}</span>
              </div>
              <div className="wc-meta">
                {w.multiplier != null && w.multiplier >= 1.2 ? (
                  <small className="wc-mult" title="This post's views ÷ the creator's own median across recent uploads. Both are real public numbers.">
                    {w.multiplier.toFixed(1)}× above baseline
                  </small>
                ) : <small className="wc-mult muted">Baseline not available</small>}
                <small className="wc-date">
                  {w.publishedAt ? new Date(w.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </small>
              </div>
              <div className="wc-actions">
                <a href={w.url} target="_blank" rel="noreferrer">View original</a>
                <button type="button" className="strong" onClick={() => onAnalyze(w)}>Analyze</button>
              </div>
            </article>
          );
        })}
      </div>
      {canRight && (
        <button type="button" className="wc-arrow right" onClick={() => step(1)} aria-label="Next winning content">
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
