"use client";

// Two sections at the top of Competitors:
//  - Accounts in your niche (no trend is computed, so it isn't called trending): as many accounts as the plan tracks
//    (Starter: 5), never the user's own, each with its top Reels or Shorts.
//  - Reels you can copy: the recent short-form posts that took off against each
//    account's OWN median, with what each does, "Add to my plan" and "Copy brief".
// "Copy" means the idea, never the video: the brief names the format, the
// angle and why it is working, then asks for the user's own footage and words.
// Nothing is created without the user: "Add to my plan" only pre-fills the
// Content Plan's notes, which they review there.

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Lock, Plus, TrendingUp, Users } from "lucide-react";
import type { CompetitorRow, CompPost } from "@/lib/competitorIntel";
import { PROVEN_AT, PROVEN_VIEWS, TREND_WINDOW_DAYS, refResult } from "@/lib/trendSignals";
import type { CompetitorsData, ProvenReel } from "./types";
import { fmtN } from "./shared";

const PLATFORM: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" };
const SHORT = new Set(["Reel", "Short"]);

function ago(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const d = Math.round((now.getTime() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d < 0) return null;
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

const interactions = (p: { likes: number | null; comments: number | null }) =>
  p.likes != null || p.comments != null ? (p.likes ?? 0) + (p.comments ?? 0) : null;

/** The account's best recent short-form posts, by what the platform published. */
function topShorts(r: CompetitorRow, n = 3): CompPost[] {
  const shorts = r.posts.filter((p) => p.format && SHORT.has(p.format));
  const score = (p: CompPost) => p.views ?? interactions(p) ?? -1;
  return [...shorts].sort((a, b) => score(b) - score(a)).slice(0, n);
}

function gateText(r: CompetitorRow, igEnabled: boolean): string {
  if (r.platform === "instagram") {
    if (!igEnabled) return "Link a Facebook Page to your Instagram to see this account's Reels with their likes and comments.";
    if (r.postsGate === "not_business") return "Personal or private account: Instagram doesn't publish its posts.";
    if (r.postsGate === "not_found") return "Instagram has no public account with this username.";
    return "No recent Reels published by this account.";
  }
  if (r.platform === "facebook") return "Facebook doesn't publish other Pages' videos to apps.";
  return "No recent Shorts from this channel.";
}

function metricLine(x: { views: number | null; likes: number | null; comments: number | null }): string | null {
  if (x.views != null) return `${fmtN(x.views)} views`;
  const i = interactions(x);
  if (i == null) return null;
  return [x.likes != null ? `${fmtN(x.likes)} likes` : null, x.comments != null ? `${fmtN(x.comments)} comments` : null].filter(Boolean).join(", ");
}

export function Locked({ what, upgrade }: { what: string; upgrade: string | null }) {
  return (
    <section className="ov-card cx2-card cx3-locked">
      <Lock size={15} aria-hidden />
      <div>
        <b>{what}</b>
        <p>Accounts and recent Reels in your niche are on {upgrade ? upgrade[0].toUpperCase() + upgrade.slice(1) : "a paid plan"} and up.</p>
      </div>
      <Link href="/settings#plan" className="ov-btn primary small">
        See plans
      </Link>
    </section>
  );
}

export function TrendingAccounts({
  d,
  rows,
  onSelect,
  onTrack,
  tracking,
}: {
  d: CompetitorsData;
  rows: CompetitorRow[];
  onSelect: (id: string) => void;
  onTrack: (r: CompetitorRow) => void;
  tracking: string | null;
}) {
  if (!d.nicheAccess) return <Locked what="Accounts in your niche" upgrade={d.nicheUpgrade} />;
  // The accounts SOCIA found or you track, most relevant first, accounts with
  // posts to show ahead of those without. Never the user's own (page.tsx).
  const list = [...rows]
    .sort((a, b) => Number(b.posts.length > 0) - Number(a.posts.length > 0) || (b.match ?? -1) - (a.match ?? -1))
    .slice(0, d.trendingLimit);
  const now = new Date(d.now);

  return (
    <section className="ov-card cx2-card cx3">
      <div className="cx2-card-head">
        <h2>
          <Users size={14} /> Accounts in your niche
        </h2>
        <span className="cx2-micro">
          {list.length} of {d.trendingLimit} on your plan
        </span>
      </div>
      {list.length === 0 ? (
        <p className="cx3-empty">
          {d.niche
            ? "No accounts found yet. Refresh discovery and SOCIA searches your niche."
            : "Set your niche in Niche trends below and SOCIA finds the accounts to watch."}
        </p>
      ) : (
        <div className="cx3-accounts">
          {list.map((r) => {
            const top = topShorts(r);
            return (
              <article key={r.id} className="cx3-account">
                <header>
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar} alt="" width={36} height={36} referrerPolicy="no-referrer" />
                  ) : (
                    <i aria-hidden>{(r.name.replace(/^@/, "")[0] ?? "?").toUpperCase()}</i>
                  )}
                  <div>
                    <button type="button" className="cx3-name" onClick={() => onSelect(r.id)}>
                      {r.name}
                    </button>
                    <span>
                      {PLATFORM[r.platform] ?? r.platform}
                      {r.audience.state === "ok" && r.audience.value != null ? ` | ${fmtN(r.audience.value)} ${r.platform === "youtube" ? "subscribers" : "followers"}` : ""}
                    </span>
                  </div>
                  {r.tracked ? (
                    <span className="cx3-tag">
                      <Check size={12} /> Tracking
                    </span>
                  ) : (
                    <button type="button" className="ov-btn ghost small" onClick={() => onTrack(r)} disabled={tracking === r.id}>
                      <Plus size={13} /> {tracking === r.id ? "Adding" : "Track"}
                    </button>
                  )}
                </header>
                {top.length ? (
                  <div className="cx3-reels">
                    {top.map((p) => (
                      <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="cx3-reel" title={p.title ?? undefined}>
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="cx3-noimg">{p.format}</span>
                        )}
                        <span className="cx3-reel-meta">
                          {metricLine(p) ?? "No counts published"}
                          {ago(p.publishedAt, now) ? ` | ${ago(p.publishedAt, now)}` : ""}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="cx3-gate">{gateText(r, d.ig.enabled)}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      <small className="cx2-foot">
        Top Reels and Shorts by what each platform publishes: views for YouTube, and for Instagram views where Instagram shares them, otherwise likes and comments. Your own accounts are never listed.
      </small>
    </section>
  );
}

const hookName = (h: string) => h.replace(/ hook$/i, "");

/** How to open your own version, for each hook structure SOCIA recognises (lib/discovery.ts hook tags, plus "Question"). */
const HOOK_HOW: Record<string, string> = {
  "POV": "Open as a POV: the camera is the viewer, and the first words name their situation.",
  "Question": "Open with a question your audience is already asking.",
  "Listicle hook": "Open with the number and what the list is of.",
  "Contrarian hook": "Open by naming what most people get wrong.",
  "Comparison": "Open with the two things side by side.",
  "Time contrast": "Open on the before, then cut to the after.",
  "Levels / tiers": "Open on the first level and say how many there are.",
  "First-person challenge": "Open by saying what you are about to try.",
  "Superlative": "Open on the one thing you would call your best.",
  "High-drama framing": "Open on the moment with the most at stake.",
};

/** What the Reel does, in the words of its own data: its hook structure, topic and format. */
function does(r: ProvenReel): string[] {
  return [
    ...r.structures.slice(0, 1).map((h) => `Hook: ${hookName(h)}`),
    ...r.topics.slice(0, 1).map((t) => `About: ${t}`),
    `Format: ${r.format}`,
  ];
}

/** How to make your own version, from what the Reel does. */
function recipe(r: ProvenReel): string {
  const open = HOOK_HOW[r.structures[0] ?? ""] ?? "Open on the moment itself, with no setup line.";
  return `${open} Film it as a ${r.format} with your own subject, footage and words.`;
}

/** A short brief for the user's own version: the idea, never the video. */
function brief(r: ProvenReel): string {
  const lines = [
    `Make my version of a ${r.format} that took off for ${r.accountHandle ? `@${r.accountHandle}` : r.accountName} on ${PLATFORM[r.platform] ?? r.platform}`,
    r.line ? `It opens: "${r.line}"` : r.title ? `What it is: ${r.title}` : null,
    refResult(r) ? `How it did: ${refResult(r)}${r.multiplier != null ? ` (median ${r.basis})` : ""}` : null,
    ...does(r).slice(0, 2),
    "My version: the same format, hook structure and angle, with my own subject, footage and words. Never their wording.",
    `Original: ${r.url}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Reels you can copy: the recent Reels and Shorts from the niche that took off
 * (lib/trendSignals.ts provenReels), each with what it does and how to make
 * your own. The same Reels are what Content Plans and video ideas build on.
 */
export function ReelsToCopy({ d }: { d: CompetitorsData }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!d.nicheAccess) return <Locked what="Reels you can copy from your niche" upgrade={d.nicheUpgrade} />;
  const now = new Date(d.now);
  const proven = d.reelsToCopy.filter((r) => r.proven).length;

  const copy = async (r: ProvenReel) => {
    const text = brief(r);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.url);
      setTimeout(() => setCopied((c) => (c === r.url ? null : c)), 2000);
    } catch {
      // Clipboard refused: show the brief so it can be copied by hand.
      window.prompt("Copy this brief", text);
    }
  };

  return (
    <section className="ov-card cx2-card cx3" aria-labelledby="cx5-title">
      <div className="cx2-card-head">
        <h2 id="cx5-title">
          <TrendingUp size={14} /> Reels you can copy
        </h2>
        {d.reelsRead.reels > 0 && (
          <span className="cx2-micro">
            From {d.reelsRead.reels} Reels by {d.reelsRead.accounts} accounts, last {TREND_WINDOW_DAYS} days
          </span>
        )}
      </div>
      {d.reelsToCopy.length === 0 ? (
        <p className="cx3-empty">
          {d.ig.enabled || d.ytConfigured
            ? "No Reels or Shorts found in your niche yet. Refresh discovery or track a few accounts."
            : "Link a Facebook Page to your Instagram to see Reels from accounts in your niche."}
        </p>
      ) : (
        <>
          <p className="cx5-lead">
            {proven > 0
              ? `${proven === 1 ? "One Reel took off for an account" : `These ${proven} Reels took off for accounts`} in your niche: ${PROVEN_AT}× their own usual or more, or past ${fmtN(PROVEN_VIEWS)} views. Make your own version${proven === 1 ? "" : " of one"}. Your Content Plans and video ideas build on ${proven === 1 ? "it" : "them"} too.`
              : `None of the recent Reels SOCIA read beat their creator's usual by ${PROVEN_AT}× yet. These are the best of the last ${TREND_WINDOW_DAYS} days.`}
            {proven > 0 && proven < d.reelsToCopy.length ? " The others are the best of the rest SOCIA read." : ""}
          </p>
          <div className="cx3-grid cx5-grid">
            {d.reelsToCopy.map((r) => (
              <article key={r.url} className="cx3-card">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="cx3-thumb" aria-label={`Open the ${r.format} by ${r.accountName}`}>
                  {r.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="cx3-noimg">{r.format}</span>
                  )}
                  {r.multiplier != null && <b className="cx3-mult">{r.multiplier >= 10 ? r.multiplier.toFixed(0) : r.multiplier.toFixed(1)}× their usual</b>}
                  <ExternalLink size={13} className="cx3-open" aria-hidden />
                </a>
                <div className="cx3-body">
                  <span className="cx3-acct">
                    {r.accountName} | {PLATFORM[r.platform] ?? r.platform}
                  </span>
                  {(r.line ?? r.title) && <p>{r.line ? `\u201c${r.line}\u201d` : r.title}</p>}
                  <small>
                    {[metricLine(r), r.multiplier == null ? "no baseline for this account yet" : null, ago(r.publishedAt, now)].filter(Boolean).join(" | ")}
                  </small>
                  <ul className="cx5-does" aria-label="What it does">
                    {does(r).map((x) => <li key={x}>{x}</li>)}
                  </ul>
                  <p className="cx5-make"><b>Make yours:</b> {recipe(r)}</p>
                  <div className="cx3-actions">
                    <Link href={`/plan?note=${encodeURIComponent(brief(r))}`} className="ov-btn outline small">
                      <Plus size={13} /> Add to my plan
                    </Link>
                    <button type="button" className="ov-btn ghost small" onClick={() => copy(r)}>
                      {copied === r.url ? <Check size={13} /> : <Copy size={13} />} {copied === r.url ? "Copied" : "Copy brief"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <small className="cx2-foot">
        Every number is what the platform published: views on YouTube, and on Instagram views where Instagram shares them, otherwise likes and comments, each against that account&apos;s own median. They are other accounts&apos; results, not a forecast for yours. Copy the idea, not the video: your own footage and your own words.
      </small>
    </section>
  );
}
