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
  Eye,
  Bookmark,
} from "lucide-react";

// Interactive competitor strip + outlier grid (preview dataset).
// Selecting a competitor highlights their outlier posts below.

export type Tracked = {
  handle: string;
  followers: string;
  eng: string;
  momentum: number;
  spark: number[];
  avatar?: string | null;
};

export type Outlier = {
  handle: string;
  format: string;
  mult: string;
  why: string;
  views: string;
  saves: string;
  img: string;
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

function MiniSpark({ data, up }: { data: number[]; up: boolean }) {
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
        stroke={up ? "var(--cobalt)" : "#dc2626"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        pathLength={100}
        className="cp3-sparkline"
      />
    </svg>
  );
}

export default function CompetitorsBoard({
  tracked,
  outliers,
  children,
}: {
  tracked: Tracked[];
  outliers: Outlier[];
  /** Center + right intelligence columns, rendered by the page. */
  children?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  function scrollRail(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }
  function pick(handle: string) {
    setSelected((s) => (s === handle ? null : handle));
  }

  const selCount = selected ? outliers.filter((o) => o.handle === selected).length : null;

  return (
    <>
      {/* competitor strip */}
      <div className="cp3-stripwrap">
        <button className="cp3-railbtn l" onClick={() => scrollRail(-1)} aria-label="Scroll competitors left" type="button">
          <ChevronLeft size={15} />
        </button>
        <div className="cp3-strip" ref={railRef} role="listbox" aria-label="Tracked competitors">
          {tracked.map((c, i) => (
            <button
              key={c.handle}
              className={`cp3-acct ${selected === c.handle ? "on" : ""}`}
              onClick={() => pick(c.handle)}
              role="option"
              aria-selected={selected === c.handle}
              style={{ animationDelay: `${i * 60}ms` }}
              type="button"
            >
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cp3-avatar" src={c.avatar} alt="" width={40} height={40} loading="lazy" />
              ) : (
                <span className="cp3-avatar ph">{c.handle.replace("@", "")[0].toUpperCase()}</span>
              )}
              <span className="cp3-acct-meta">
                <b>{c.handle}</b>
                <small>{c.followers} followers</small>
                <small className="cp3-eng">
                  Eng. {c.eng} <em>▲ {c.momentum}%</em>
                </small>
              </span>
              <MiniSpark data={c.spark} up />
            </button>
          ))}
        </div>
        <button className="cp3-railbtn r" onClick={() => scrollRail(1)} aria-label="Scroll competitors right" type="button">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* intelligence columns */}
      <div className="cp3-cols">
        {/* outliers hero */}
        <section className="cp3-outcard">
          <div className="cp3-card-head">
            <h3>Top outliers this week</h3>
            <span className="cp3-filter">
              {selected && selCount != null
                ? `${selCount} from ${selected} · tap again to clear`
                : "Posts doing 2×+ their account's median"}
            </span>
          </div>
          <div className="cp3-outgrid">
            {outliers.map((o, i) => (
              <article
                key={o.handle + o.mult}
                className={`cp3-out ${selected ? (selected === o.handle ? "hi" : "dim") : ""}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="cp3-out-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.img} alt="" loading="lazy" />
                  <span className={`cp3-mult ${o.tone}`}>{o.mult} median</span>
                  <span className="cp3-play" aria-hidden>
                    {o.format === "CAROUSEL" ? <Layers size={14} /> : <Play size={14} fill="currentColor" />}
                  </span>
                </div>
                <div className="cp3-out-body">
                  <div className="cp3-out-top">
                    <b>{o.handle}</b>
                    <span className="cp3-fmt">{o.format}</span>
                  </div>
                  <p className="cp3-why">
                    <span>Why it won:</span> {o.why}
                  </p>
                  <div className="cp3-out-metrics">
                    <span><Eye size={12} /> <b>{o.views}</b> views</span>
                    <span><Bookmark size={12} /> <b>{o.saves}</b> saves</span>
                  </div>
                  <Link href="/tool" className="cp3-out-cta">
                    Turn this into a post <ArrowRight size={12} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Link href="/niche" className="cp3-viewmore">
            View more outliers <ArrowRight size={13} />
          </Link>
        </section>

        {children}
      </div>
    </>
  );
}
