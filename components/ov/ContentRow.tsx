"use client";

// Horizontal row of real posts: thumbnail, platform badge, views (or
// engagement when Instagram served no views), title, date, × baseline. Scrolls
// with the trackpad, arrow buttons and the keyboard. Click opens the drawer.

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { fmtNum, type PostCard } from "@/lib/overview";

const IG = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export default function ContentRow({ posts, onOpen, size = "md" }: { posts: PostCard[]; onOpen: (p: PostCard) => void; size?: "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCan({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [posts.length]);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.7), behavior: "smooth" });

  if (!posts.length) {
    return <div className="ov-empty">No posts synced yet.</div>;
  }
  const haveViews = posts.some((p) => p.views != null);
  return (
    <div className={`ov-row ${size}`}>
      <button type="button" className={`ov-row-nav left${can.left ? "" : " off"}`} aria-label="Scroll left" onClick={() => by(-1)} disabled={!can.left}><ChevronLeft size={16} /></button>
      <div className="ov-row-scroll" ref={ref} role="list" aria-label="Top performing content">
        {posts.map((p) => (
          <button type="button" role="listitem" key={p.id} className="ov-card" onClick={() => onOpen(p)} aria-label={`${p.title}, ${haveViews && p.views != null ? `${fmtNum(p.views)} views` : `${fmtNum(p.engagements)} engagements`}`}>
            <span className="ov-card-media">
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" loading="lazy" />
              ) : (
                <span className="ov-card-ph" aria-hidden />
              )}
              <span className="ov-card-plat" aria-hidden>{IG}</span>
              {p.isVideo && <span className="ov-card-play" aria-hidden><Play size={12} fill="currentColor" /></span>}
              <span className="ov-card-stat">
                {p.isVideo && <Play size={10} fill="currentColor" />}
                {haveViews && p.views != null ? fmtNum(p.views) : `${fmtNum(p.engagements)} eng.`}
              </span>
            </span>
            <span className="ov-card-body">
              <span className="ov-card-title">{p.title}</span>
              {p.multiplier != null && p.multiplier >= 1.05 && <span className="ov-card-mult">+{p.multiplier.toFixed(1)}x</span>}
            </span>
            <span className="ov-card-date">{new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </button>
        ))}
      </div>
      <button type="button" className={`ov-row-nav right${can.right ? "" : " off"}`} aria-label="Scroll right" onClick={() => by(1)} disabled={!can.right}><ChevronRight size={16} /></button>
    </div>
  );
}
