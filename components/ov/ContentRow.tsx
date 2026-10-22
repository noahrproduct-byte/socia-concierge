"use client";

// A sideways row of real posts as .an-post tiles: thumbnail, views (or
// engagement when Instagram served no views), Trial or Collab tag, title,
// platform, date and the multiplier against the account's median. Scrolls with
// the trackpad, the arrow buttons and the keyboard (every tile is a button).
// Clicking a tile opens the drawer. The Dashboard's Top content renders this
// too, so the analytics stylesheet is imported here rather than by the page.

import "@/app/(app)/analytics/analytics.css";
import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Empty, IconButton, PlatformMark } from "@/components/system";
import { fmtNum, type PostCard } from "@/lib/overview";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

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
    return (
      <Empty>
        <b>No posts synced yet.</b>
      </Empty>
    );
  }
  const haveViews = posts.some((p) => p.views != null);
  return (
    <div className="an-scroller">
      {can.left && (
        <IconButton label="Scroll left" variant="secondary" size="sm" className="s-btn--round an-scroller-nav is-left" onClick={() => by(-1)}>
          <ChevronLeft size={14} />
        </IconButton>
      )}
      <div className="an-posts s-scroll" ref={ref} role="group" aria-label="Top performing content">
        {posts.map((p) => {
          const stat = haveViews && p.views != null ? `${fmtNum(p.views)} views` : `${fmtNum(p.engagements)} engagements`;
          const lift = p.multiplier != null && p.multiplier >= 1.05 ? `+${p.multiplier.toFixed(1)}x` : null;
          const tags = [
            p.trial ? { label: "Trial", why: "Submitted as a Trial Reel: shown to non-followers first" } : null,
            p.collabWith ? { label: "Collab", why: `Collab post by @${p.collabWith}; you're a collaborator` } : null,
          ].filter((t): t is { label: string; why: string } => t != null);
          const name = [
            p.title,
            stat,
            p.isVideo ? "video" : null,
            lift ? `${lift} your median` : null,
            ...tags.map((t) => t.why),
            fmtDate(p.published),
          ].filter(Boolean).join(", ");
          return (
            <button type="button" key={p.id} className={`an-post${size === "lg" ? " is-lg" : ""}`} onClick={() => onOpen(p)} aria-label={name}>
              <span className="an-post-media">
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" loading="lazy" />
                ) : null}
                {tags.length > 0 && (
                  <span className="an-post-tag" title={tags.map((t) => t.why).join(". ")} aria-hidden>
                    {tags.map((t) => t.label).join(" · ")}
                  </span>
                )}
                <span className="an-post-stat" aria-hidden>
                  {p.isVideo && <Play size={12} fill="currentColor" />}
                  {haveViews && p.views != null ? fmtNum(p.views) : `${fmtNum(p.engagements)} eng.`}
                </span>
              </span>
              <span className="an-post-title" aria-hidden>{p.title}</span>
              <span className="an-post-meta" aria-hidden>
                <span>
                  <PlatformMark platform={p.platform} size="sm" /> {fmtDate(p.published)}
                </span>
                {lift && <span className="is-good">{lift}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {can.right && (
        <IconButton label="Scroll right" variant="secondary" size="sm" className="s-btn--round an-scroller-nav is-right" onClick={() => by(1)}>
          <ChevronRight size={14} />
        </IconButton>
      )}
    </div>
  );
}
