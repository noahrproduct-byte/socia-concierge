"use client";

// Two sections at the top of Competitors:
//  - Accounts in your niche (no trend is computed, so it isn't called trending): as many accounts as the plan tracks
//    (Starter: 5), never the user's own, each with its top Reels or Shorts.
//  - Recent Reels in your niche: recent short-form posts ranked against each
//    account's OWN median, with "Copy idea" and "Add to my plan".
// "Copy" means the idea, never the video: the brief names the format, the
// angle and why it is working, then asks for the user's own footage and words.
// Nothing is created without the user: "Add to my plan" only pre-fills the
// Content Plan's notes, which they review there.

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Lock, Plus, TrendingUp, Users } from "lucide-react";
import type { CompetitorRow, CompPost } from "@/lib/competitorIntel";
import type { CompetitorsData, TrendingReel } from "./types";
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

function Locked({ what, upgrade }: { what: string; upgrade: string | null }) {
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
        Top Reels and Shorts by what each platform publishes: views for YouTube, likes and comments for Instagram. Your own accounts are never listed.
      </small>
    </section>
  );
}

/** A short brief for the user's own version: the idea, never the video. */
function brief(r: TrendingReel): string {
  const lines = [
    `Reel idea from ${r.accountHandle ? `@${r.accountHandle}` : r.accountName} on ${PLATFORM[r.platform] ?? r.platform}`,
    r.title ? `What it is: ${r.title}` : null,
    r.multiplier != null ? `How it did: ${r.multiplier.toFixed(1)}x the account's own median ${r.basis}` : null,
    metricLine(r) ? `Published counts: ${metricLine(r)}` : null,
    `Format: ${r.format}`,
    "Your version: same format and angle, your own footage, your own words.",
    `Original: ${r.url}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function TrendingReels({ d }: { d: CompetitorsData }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!d.nicheAccess) return <Locked what="Recent Reels in your niche" upgrade={d.nicheUpgrade} />;
  const now = new Date(d.now);

  const copy = async (r: TrendingReel) => {
    const text = brief(r);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.url);
      setTimeout(() => setCopied((c) => (c === r.url ? null : c)), 2000);
    } catch {
      // Clipboard refused: show the brief so it can be copied by hand.
      window.prompt("Copy this idea", text);
    }
  };

  return (
    <section className="ov-card cx2-card cx3">
      <div className="cx2-card-head">
        <h2>
          <TrendingUp size={14} /> Recent Reels in your niche
        </h2>
        <span className="cx2-micro">Last 60 days, ranked against each account&apos;s usual</span>
      </div>
      {d.trendingReels.length === 0 ? (
        <p className="cx3-empty">
          {d.ig.enabled || d.ytConfigured
            ? "No Reels or Shorts found in your niche yet. Refresh discovery or track a few accounts."
            : "Link a Facebook Page to your Instagram to see Reels from accounts in your niche."}
        </p>
      ) : (
        <div className="cx3-grid">
          {d.trendingReels.map((r) => (
            <article key={r.url} className="cx3-card">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="cx3-thumb">
                {r.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span className="cx3-noimg">{r.format}</span>
                )}
                {r.multiplier != null && <b className="cx3-mult">{r.multiplier.toFixed(1)}×</b>}
                <ExternalLink size={13} className="cx3-open" aria-label="Open the original" />
              </a>
              <div className="cx3-body">
                <span className="cx3-acct">
                  {r.accountName} | {PLATFORM[r.platform] ?? r.platform}
                </span>
                {r.title && <p>{r.title}</p>}
                <small>
                  {r.multiplier != null ? `${r.multiplier.toFixed(1)}× their median ${r.basis}` : "No baseline for this account yet"}
                  {metricLine(r) ? ` | ${metricLine(r)}` : ""}
                  {ago(r.publishedAt, now) ? ` | ${ago(r.publishedAt, now)}` : ""}
                </small>
                <div className="cx3-actions">
                  <button type="button" className="ov-btn ghost small" onClick={() => copy(r)}>
                    {copied === r.url ? <Check size={13} /> : <Copy size={13} />} {copied === r.url ? "Copied" : "Copy idea"}
                  </button>
                  <Link href={`/plan?note=${encodeURIComponent(brief(r))}`} className="ov-btn ghost small">
                    <Plus size={13} /> Add to my plan
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <small className="cx2-foot">
        Ranked against each account&apos;s own median: likes and comments on Instagram, which publishes no views for other accounts, and views on YouTube. Copy the idea, not the video: make your version with your own footage.
      </small>
    </section>
  );
}
