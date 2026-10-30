"use client";

// Winning formats on Discover (lib/nicheFormats.ts): repeatable structures
// across the posts the last research run found, each with its evidence
// (examples and their results against their creators' own medians), how to
// make one, and Add to plan. When the formats are older than the research
// run, they are rebuilt once on opening (one model call, cached server-side).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Lock, Plus, Shapes } from "lucide-react";
import { formatBasis, formatBrief, type FormatsDoc, type NicheFormat } from "@/lib/nicheFormats";
import type { CompetitorsData } from "./types";

const PLATFORM: Record<string, string> = { youtube: "YouTube", instagram: "Instagram" };

export default function WinningFormats({ d }: { d: CompetitorsData }) {
  const router = useRouter();
  const { doc, stale } = d.formats;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (!d.nicheAccess || !d.lastRun || !stale || tried.current) return;
    tried.current = true;
    setBusy(true);
    fetch("/api/discover/formats", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Couldn't look for formats just now.");
        router.refresh();
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [d.nicheAccess, d.lastRun, stale, router]);

  if (!d.nicheAccess) {
    return (
      <section className="ov-card cx2-card cx3-locked">
        <Lock size={15} aria-hidden />
        <div>
          <b>Winning formats</b>
          <p>Repeatable formats from your niche are on {d.nicheUpgrade ? d.nicheUpgrade[0].toUpperCase() + d.nicheUpgrade.slice(1) : "a paid plan"} and up.</p>
        </div>
        <Link href="/settings#plan" className="ov-btn primary small">See plans</Link>
      </section>
    );
  }

  return (
    <section className="ov-card cx2-card wf">
      <div className="cx2-card-head">
        <h2><Shapes size={14} /> Winning formats</h2>
        <span className="cx2-micro">{doc ? `From ${doc.examplesRead} posts in your niche` : "From your last research run"}</span>
      </div>
      {!d.lastRun ? (
        <p className="cx3-empty">Formats appear after SOCIA&apos;s first research run. Press Refresh at the top of the page to start one.</p>
      ) : busy && !doc?.formats.length ? (
        <p className="cx3-empty" role="status">Looking for structures that repeat across the posts from your last research run.</p>
      ) : err && !doc ? (
        <p className="s-error" role="alert">{err}</p>
      ) : !doc || doc.formats.length === 0 ? (
        <p className="cx3-empty">
          No format repeats yet{doc ? ` across the ${doc.examplesRead} posts SOCIA could read` : ""}. A format needs at least 3 posts from 2 different accounts sharing a structure. More research runs, or tracking a few accounts, add posts to compare.
        </p>
      ) : (
        <div className="wf-list">
          {doc.formats.map((f) => <FormatCard key={f.name} f={f} />)}
        </div>
      )}
      {doc && doc.formats.length > 0 && <Footnote doc={doc} />}
    </section>
  );
}

function FormatCard({ f }: { f: NicheFormat }) {
  const [copied, setCopied] = useState(false);
  const brief = formatBrief(f);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this brief", brief);
    }
  };
  const len = f.stats.length;
  return (
    <article className="wf-card">
      <header className="wf-head">
        <h3>{f.name}</h3>
        {f.leads && <span className="wf-leads">Leads in your niche</span>}
      </header>
      <p className="wf-basis">{formatBasis(f)}</p>
      <p>{f.summary}</p>

      <div className="wf-cols">
        {f.steps.length > 0 && (
          <div>
            <h4>How it goes</h4>
            <ol>{f.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        )}
        {f.hooks.length > 0 && (
          <div>
            <h4>Openings to try</h4>
            <ul>{f.hooks.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {f.filming.length > 0 && (
          <div>
            <h4>Filming</h4>
            <ul>{f.filming.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="wf-len">
              {len
                ? `The examples run ${len.min} to ${len.max} s (median ${len.median} s, ${len.n} with a published length).`
                : f.lengthSuggestion
                  ? `Suggested length: ${f.lengthSuggestion}. SOCIA's suggestion; these examples' lengths aren't published.`
                  : null}
            </p>
          </div>
        )}
        {f.adaptations.length > 0 && (
          <div>
            <h4>Your version</h4>
            <ul>{f.adaptations.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="wf-examples">
        {f.examples.slice(0, 4).map((e) => (
          <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" className="wf-ex">
            <span className="cx3-thumb">
              {e.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="cx3-noimg">{PLATFORM[e.platform]}</span>
              )}
              {e.multiplier != null && <b className="cx3-mult">{e.multiplier.toFixed(1)}×</b>}
              <ExternalLink size={13} className="cx3-open" aria-label="Open the original" />
            </span>
            <small>{e.account}, {PLATFORM[e.platform]}{e.multiplier != null ? `, ${e.multiplier.toFixed(1)}× their usual` : ", no baseline"}</small>
          </a>
        ))}
      </div>

      <div className="cx3-actions">
        <Link href={`/plan?note=${encodeURIComponent(brief)}`} className="ov-btn ghost small"><Plus size={13} /> Add to plan</Link>
        <button type="button" className="ov-btn ghost small" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy brief"}
        </button>
      </div>
    </article>
  );
}

function Footnote({ doc }: { doc: FormatsDoc }) {
  const parts = !doc.fromInstagram ? "all from YouTube" : !doc.fromYouTube ? "all from Instagram" : `${doc.fromYouTube} from YouTube and ${doc.fromInstagram} from Instagram`;
  return (
    <small className="cx2-foot">
      SOCIA grouped {doc.examplesRead} posts, {parts}, by what their titles and captions show; it didn&apos;t watch the videos. The numbers are the platforms&apos; own, each against its creator&apos;s median: views on YouTube, likes and comments on Instagram. How to make one and your version are SOCIA&apos;s suggestions. Adapt the structure; don&apos;t copy the video.
    </small>
  );
}
