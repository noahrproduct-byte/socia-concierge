"use client";

// A research answer in Ask SOCIA (lib/research): the approach first, then the
// real videos it rests on (thumbnail, creator and the numbers their platform
// publishes), the person's own version, why, how to test it and where to take
// it next. How the research was done, and anything it couldn't reach, sits in
// one fold at the end. Every number shown comes from the platform; the model
// only chose the videos and said why each fits.

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { AskResearch } from "@/lib/ask";

const PLATFORM: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null);

export default function ResearchCard({ r, version, details }: {
  r: AskResearch;
  /** the person's own version (the script or caption), rendered by the caller */
  version?: ReactNode;
  /** the labelled evidence lines, if the answer has any */
  details?: ReactNode;
}) {
  return (
    <div className="rs">
      {r.approach && (
        <section className="rs-part">
          <h4>Recommended approach</h4>
          <p>{r.approach}</p>
        </section>
      )}

      {r.examples.length > 0 && (
        <section className="rs-part">
          <h4>Relevant examples</h4>
          <ul className="rs-examples">
            {r.examples.map((x) => {
              const nums = [
                x.views != null ? `${compact(x.views)} views` : null,
                x.likes != null ? `${compact(x.likes)} likes` : null,
                x.comments != null ? `${compact(x.comments)} comments` : null,
                x.durationSec != null ? `${x.durationSec}s` : null,
                when(x.publishedAt),
              ].filter(Boolean);
              return (
                <li key={x.ref}>
                  <a className="rs-ex" href={x.url} target="_blank" rel="noreferrer">
                    {x.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.thumb} alt="" loading="lazy" />
                    ) : <span className="rs-ph" aria-hidden />}
                    <span className="rs-ex-body">
                      <b>{x.title}</b>
                      <em>{x.creator} on {PLATFORM[x.platform] ?? x.platform} <ExternalLink size={11} aria-hidden /></em>
                      {nums.length > 0 && <span className="rs-nums">{nums.join(" · ")}</span>}
                      {x.vsUsual != null && <span className="rs-lift">{x.vsUsual.toFixed(1)}× {x.usualBasis ?? "the creator's usual"}</span>}
                    </span>
                  </a>
                  {x.why && <p className="rs-why">{x.why}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {version && (
        <section className="rs-part">
          <h4>Your version</h4>
          {version}
        </section>
      )}

      {r.why && (
        <section className="rs-part">
          <h4>Why this approach</h4>
          <p>{r.why}</p>
        </section>
      )}

      {r.test && (
        <section className="rs-part">
          <h4>How to test it</h4>
          <p>{r.test}</p>
        </section>
      )}

      {r.steps.length > 0 && (
        <div className="ask-actions">
          {r.steps.map((s) => <Link key={s.href + s.label} href={s.href} className="ov-btn ghost small">{s.label} <ArrowRight size={12} /></Link>)}
        </div>
      )}

      {(r.notes.length > 0 || details) && (
        <details className="rs-more">
          <summary>How SOCIA researched this</summary>
          {r.notes.length > 0 && <ul>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {details}
        </details>
      )}
    </div>
  );
}
