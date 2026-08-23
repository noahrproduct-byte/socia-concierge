"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Layers,
  ArrowRight,
  Download,
  Heart,
  MessageCircle,
  Image as ImageIcon,
  Info,
} from "lucide-react";

// Competitor strip (labeled examples — SOCIA has no competitor data access
// yet) + the user's REAL outlier posts, computed from their synced media.

const IgGlyph = (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#d92e7f" strokeWidth="2.4" className="cp3-acct-ig" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.4" fill="#d92e7f" stroke="none" />
  </svg>
);

export type Tracked = {
  handle: string;
  followers: string;
  eng: string;
  momentum: number;
  spark: number[];
  avatar?: string | null;
};

// A real post from the user's own account, with its computed outlier math.
export type Outlier = {
  title: string; // first caption line (or format label)
  img: string | null;
  permalink: string | null;
  format: string; // REEL / CAROUSEL / STATIC
  isVideo: boolean;
  mult: string; // e.g. "4.1×" — engagement vs same-format median
  basis: string; // tooltip: what the multiplier was compared against
  evidence: string; // factual, calculated line — no invented claims
  likes: number | null;
  comments: number | null;
  tone: "amber" | "blue" | "green" | "purple";
};

/** Print the page — the same lightweight export the plan report uses. */
export function ExportButton() {
  return (
    <button className="cp3-export" type="button" onClick={() => window.print()}>
      <Download size={14} /> Export report
    </button>
  );
}

function MiniSpark({ data }: { data: number[] }) {
  const W = 58;
  const H = 20;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cp3-spark" aria-hidden preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--cobalt)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        pathLength={100}
        className="cp3-sparkline"
      />
    </svg>
  );
}

function OutlierMedia({ o }: { o: Outlier }) {
  const [broken, setBroken] = useState(false);
  const body = (
    <div className={`cp3-out-media${!o.img || broken ? " ph" : ""}`}>
      {o.img && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.img} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="cp3-media-ph" aria-hidden>
          <ImageIcon size={26} />
        </span>
      )}
      <span className={`cp3-mult ${o.tone}`} title={o.basis}>
        {o.mult} median
      </span>
      <span className="cp3-play" aria-hidden>
        {o.isVideo ? <Play size={14} fill="currentColor" /> : <Layers size={14} />}
      </span>
    </div>
  );
  // Clicking opens the real post on Instagram when we have its permalink.
  return o.permalink ? (
    <a href={o.permalink} target="_blank" rel="noreferrer" aria-label="Open this post on Instagram">
      {body}
    </a>
  ) : (
    body
  );
}

export default function CompetitorsBoard({
  tracked,
  outliers,
  filterNote,
  emptyNote,
  children,
}: {
  tracked: Tracked[];
  outliers: Outlier[];
  /** Honest description of the outlier calculation + data freshness. */
  filterNote: string;
  /** Shown when there are no qualifying outliers (or no data). */
  emptyNote?: string | null;
  /** Center + right intelligence columns, rendered by the page. */
  children?: React.ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollRail(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  return (
    <>
      {/* competitor strip — illustrative examples until live tracking ships */}
      <div className="cp3-stripwrap">
        <span
          className="cp3-demo-chip"
          title="Illustrative example accounts. SOCIA can't read competitor accounts until live tracking ships with the Growth plan."
        >
          Examples
        </span>
        <button className="cp3-railbtn l" onClick={() => scrollRail(-1)} aria-label="Scroll competitors left" type="button">
          <ChevronLeft size={15} />
        </button>
        <div className="cp3-strip" ref={railRef}>
          {tracked.map((c, i) => (
            <div
              key={c.handle}
              className="cp3-acct"
              style={{ animationDelay: `${i * 60}ms` }}
              title="Example account — not real competitor data"
            >
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cp3-avatar" src={c.avatar} alt="" width={40} height={40} loading="lazy" />
              ) : (
                <span className="cp3-avatar ph">{c.handle.replace("@", "")[0].toUpperCase()}</span>
              )}
              <span className="cp3-acct-meta">
                <b>
                  {IgGlyph} {c.handle}
                </b>
                <small>{c.followers} followers</small>
                <small className="cp3-eng">
                  Eng. {c.eng} <em>▲ {c.momentum}%</em>
                </small>
              </span>
              <MiniSpark data={c.spark} />
            </div>
          ))}
        </div>
        <button className="cp3-railbtn r" onClick={() => scrollRail(1)} aria-label="Scroll competitors right" type="button">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* intelligence columns */}
      <div className="cp3-cols">
        {/* the user's real outliers */}
        <section className="cp3-outcard">
          <div className="cp3-card-head">
            <h3>
              Your top outliers{" "}
              <span
                className="cp3-info"
                title="Your own posts whose engagement (likes + comments) runs at least 1.5× the median of your comparable posts. Competitor posts aren't available yet."
              >
                <Info size={12} />
              </span>
            </h3>
            <span className="cp3-filter">{filterNote}</span>
          </div>
          {outliers.length > 0 ? (
            <div className="cp3-outgrid">
              {outliers.map((o, i) => (
                <article className="cp3-out" key={o.title + i} style={{ animationDelay: `${i * 70}ms` }}>
                  <OutlierMedia o={o} />
                  <div className="cp3-out-body">
                    <div className="cp3-out-top">
                      <b title={o.title}>{o.title}</b>
                      <span className="cp3-fmt">{o.format}</span>
                    </div>
                    <p className="cp3-why" title={o.evidence}>
                      <span>Evidence:</span> {o.evidence}
                    </p>
                    <div className="cp3-out-metrics">
                      {o.likes != null && (
                        <span>
                          <Heart size={12} /> <b>{o.likes.toLocaleString("en-US")}</b> likes
                        </span>
                      )}
                      {o.comments != null && (
                        <span>
                          <MessageCircle size={12} /> <b>{o.comments.toLocaleString("en-US")}</b> comments
                        </span>
                      )}
                    </div>
                    <Link href="/tool" className="cp3-out-cta">
                      Turn this into a post <ArrowRight size={12} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="cp3-nodata">{emptyNote ?? "Not enough history yet."}</p>
          )}
          <Link href="/analytics" className="cp3-viewmore">
            View all your posts <ArrowRight size={13} />
          </Link>
        </section>

        {children}
      </div>
    </>
  );
}
