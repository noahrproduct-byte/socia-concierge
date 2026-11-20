"use client";

// The reference gallery in Ask SOCIA (lib/research/direction.ts): three or four
// real public videos, each in a different creative style, as compact cards
// with Watch example and Choose this style. Under them: combine two styles,
// different examples, the person's own style, or skip. YouTube plays in place
// through its privacy-enhanced embed; Instagram and TikTok open on the
// platform, since SOCIA can't embed or analyse them. Every number shown is the
// platform's; the style and techniques are SOCIA's reading of the title,
// length and numbers, and say so.

import { useState } from "react";
import { Check, ExternalLink, Play } from "lucide-react";
import type { AskResearch } from "@/lib/ask";
import { styleLabel, type CreativeDirection, type DirectionRef } from "@/lib/research/direction";

type Example = AskResearch["examples"][number];

const PLATFORM: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const ytId = (url: string) => /(?:shorts\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,15})/.exec(url)?.[1] ?? null;

export const refOf = (x: Example): DirectionRef => ({ letter: x.letter, style: x.style, title: x.title, creator: x.creator, url: x.url, techniques: x.techniques });

export default function ReferenceGallery({ examples, chosen, onChoose, onAsk, hasScript }: {
  examples: Example[];
  /** letters the person already chose in this chat */
  chosen: string[];
  /** on the latest answer only */
  onChoose?: (d: CreativeDirection, label: string) => void;
  onAsk?: (text: string, opts?: { moreRefs?: string[] }) => void;
  hasScript: boolean;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [combine, setCombine] = useState<string[] | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const live = Boolean(onChoose && onAsk) && !chosen.length;

  if (skipped) return null;

  const pick = (x: Example) => {
    if (combine) {
      const next = combine.includes(x.letter) ? combine.filter((l) => l !== x.letter) : [...combine, x.letter].slice(-2);
      setCombine(next);
      return;
    }
    onChoose?.({ kind: "reference", refs: [refOf(x)] }, `Use option ${x.letter}: ${styleLabel(x.style)}.`);
  };

  return (
    <div className="rg">
      <ul className="rg-cards">
        {examples.map((x) => {
          const yt = x.platform === "youtube" ? ytId(x.url) : null;
          const on = chosen.includes(x.letter) || combine?.includes(x.letter);
          const nums = [x.views != null ? `${compact(x.views)} views` : null, x.likes != null ? `${compact(x.likes)} likes` : null, x.durationSec != null ? `${x.durationSec}s` : null].filter(Boolean);
          return (
            <li key={x.ref} className={`rg-card${on ? " on" : ""}`}>
              <div className="rg-media">
                {playing === x.ref && yt ? (
                  <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`} title={x.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                ) : x.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
                  <img src={x.thumb} alt="" loading="lazy" />
                ) : <span className="rg-ph" aria-hidden />}
                <span className="rg-letter" aria-hidden>{x.letter}</span>
              </div>
              <div className="rg-body">
                <b className="rg-style">{styleLabel(x.style)}</b>
                <span className="rg-title">{x.title}</span>
                <small>{x.creator} on {PLATFORM[x.platform] ?? x.platform}</small>
                {nums.length > 0 && <small className="rg-nums">{nums.join(" · ")}</small>}
                {x.vsUsual != null && x.vsUsual >= 1.5 && <small className="rg-lift">{x.vsUsual.toFixed(1)}× {x.usualBasis ?? "the creator's usual"}</small>}
                {x.why && <p>{x.why}</p>}
                {x.techniques.length > 0 && <ul className="rg-tech">{x.techniques.map((t) => <li key={t}>{t}</li>)}</ul>}
                <div className="rg-actions">
                  {yt ? (
                    playing === x.ref
                      ? <a className="ov-btn ghost small" href={x.url} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={11} aria-hidden /></a>
                      : <button type="button" className="ov-btn ghost small" onClick={() => setPlaying(x.ref)}><Play size={12} aria-hidden /> Watch example</button>
                  ) : (
                    <a className="ov-btn ghost small" href={x.url} target="_blank" rel="noreferrer">Watch on {PLATFORM[x.platform] ?? "the platform"} <ExternalLink size={11} aria-hidden /></a>
                  )}
                  {live && (
                    <button type="button" className={`ov-btn ${on ? "primary" : "ghost"} small`} aria-pressed={Boolean(on)} onClick={() => pick(x)}>
                      {on ? <><Check size={12} aria-hidden /> {combine ? "Selected" : "Chosen"}</> : combine ? "Select" : "Choose this style"}
                    </button>
                  )}
                  {!live && chosen.includes(x.letter) && <span className="rg-chosen"><Check size={12} aria-hidden /> Your direction</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="rg-note">Styles and techniques are SOCIA&apos;s reading of each video&apos;s title, length and numbers; it doesn&apos;t watch them. Use them as starting points, never copies.</p>

      {live && (
        <div className="rg-choose">
          <b>Which creative direction do you want to take?</b>
          {combine ? (
            <div className="rg-row">
              <span>{combine.length < 2 ? `Pick ${2 - combine.length} more to combine.` : `Combine ${combine.join(" and ")}.`}</span>
              <button type="button" className="ov-btn primary small" disabled={combine.length < 2} onClick={() => {
                const refs = combine.map((l) => examples.find((x) => x.letter === l)).filter((x): x is Example => Boolean(x)).map(refOf);
                onChoose?.({ kind: "combined", refs }, `Combine options ${combine.join(" and ")}: ${refs.map((r) => styleLabel(r.style)).join(" with ")}.`);
              }}>Use these two</button>
              <button type="button" className="ov-btn ghost small" onClick={() => setCombine(null)}>Cancel</button>
            </div>
          ) : own !== null ? (
            <form className="rg-row" onSubmit={(e) => { e.preventDefault(); const t = own.trim(); if (t) onChoose?.({ kind: "own", refs: [], own: t }, `My own style: ${t}`); }}>
              <input className="rg-own" value={own} onChange={(e) => setOwn(e.target.value)} maxLength={400} placeholder="For example: calm, one take, me talking at my desk" aria-label="Describe your own style" autoFocus />
              <button type="submit" className="ov-btn primary small" disabled={!own.trim()}>Use my style</button>
              <button type="button" className="ov-btn ghost small" onClick={() => setOwn(null)}>Cancel</button>
            </form>
          ) : (
            <div className="rg-row">
              {examples.length >= 2 && <button type="button" className="ov-btn ghost small" onClick={() => setCombine([])}>Combine two styles</button>}
              <button type="button" className="ov-btn ghost small" onClick={() => onAsk?.("Show me different reference examples.", { moreRefs: examples.map((x) => x.url) })}>Show different examples</button>
              <button type="button" className="ov-btn ghost small" onClick={() => setOwn("")}>Describe my own style</button>
              <button type="button" className="ov-btn ghost small" onClick={() => (hasScript ? setSkipped(true) : onAsk?.("Skip the references and write the script without one."))}>Skip references</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
