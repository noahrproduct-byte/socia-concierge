"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Play,
  ArrowRight,
  Download,
  Image as ImageIcon,
  ExternalLink,
  Loader2,
  AtSign,
} from "lucide-react";
import type { ViralDoc, ViralItem } from "@/app/api/niche-viral/route";

// Competitors page client pieces. The old fictional competitor strip is gone;
// "Viral in your niche" shows REAL posts by other creators, discovered via
// live web search on the server (see /api/niche-viral for the honesty rules).

/** Print the page — the same lightweight export the plan report uses. */
export function ExportButton() {
  return (
    <button className="cp3-export" type="button" onClick={() => window.print()}>
      <Download size={14} /> Export report
    </button>
  );
}

const TONES = ["amber", "blue", "green", "purple"] as const;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function ViralCard({ item, tone, delay }: { item: ViralItem; tone: string; delay: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <article className="cp3-out" style={{ animationDelay: `${delay}ms` }}>
      <a href={item.url} target="_blank" rel="noreferrer" aria-label="Watch the original post">
        <div className={`cp3-out-media${!item.thumb || broken ? " ph" : ""}`}>
          {item.thumb && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumb} alt="" loading="lazy" onError={() => setBroken(true)} />
          ) : (
            <span className="cp3-media-ph" aria-hidden>
              <ImageIcon size={26} />
            </span>
          )}
          <span
            className={`cp3-mult ${tone}`}
            title={
              item.views
                ? "View count as reported by the platform page where SOCIA found this — not independently verified."
                : "The platform didn't report a view count in what SOCIA read, so none is shown."
            }
          >
            {item.views ? `${item.views} views` : item.platform === "tiktok" ? "TikTok" : "Shorts"}
          </span>
          <span className="cp3-play" aria-hidden>
            <Play size={14} fill="currentColor" />
          </span>
        </div>
      </a>
      <div className="cp3-out-body">
        <div className="cp3-out-top">
          <b title={item.title}>{item.title || "Untitled post"}</b>
          <span className="cp3-fmt">{item.platform === "tiktok" ? "TIKTOK" : "SHORTS"}</span>
        </div>
        <p
          className="cp3-why"
          title="AI interpretation of a real post SOCIA found — not a measured statistic."
        >
          <span>Why it&apos;s working:</span> {item.why}
        </p>
        <div className="cp3-out-metrics">
          <span>
            <AtSign size={12} /> <b>{item.creator.replace(/^@/, "")}</b>
          </span>
          <a className="cp3-watch" href={item.url} target="_blank" rel="noreferrer">
            <ExternalLink size={11} /> Watch original
          </a>
        </div>
        <Link href="/tool" className="cp3-out-cta">
          Turn this into a post <ArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}

export function NicheViral() {
  const [doc, setDoc] = useState<ViralDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/niche-viral")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Search failed.");
        setDoc(j as ViralDoc);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Search failed."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) {
    return (
      <>
        <div className="cp3-outgrid">
          {[0, 1, 2, 3].map((i) => (
            <div className="cp3-out cp3-skel" key={i} style={{ animationDelay: `${i * 70}ms` }}>
              <div className="cp3-out-media" />
              <div className="cp3-out-body">
                <span className="cp3-skel-line w60" />
                <span className="cp3-skel-line" />
                <span className="cp3-skel-line w80" />
              </div>
            </div>
          ))}
        </div>
        <p className="cp3-nodata">
          <Loader2 size={13} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />
          Searching the open web for what&apos;s genuinely viral in your niche — about 20–40s on the
          first load of the day.
        </p>
      </>
    );
  }

  if (error || !doc) {
    return (
      <div className="cp3-nodata">
        {error ?? "Couldn't load viral posts."}{" "}
        <button className="cp3-retry" type="button" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="cp3-outgrid">
        {doc.items.map((item, i) => (
          <ViralCard key={item.url} item={item} tone={TONES[i % TONES.length]} delay={i * 70} />
        ))}
      </div>
      <p className="cp3-viral-foot">
        Found by live web search · refreshed {ago(doc.found_at)} · links open the original posts
      </p>
    </>
  );
}
