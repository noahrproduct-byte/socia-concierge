"use client";

// Hooks and topics in the niche: what the recent Reels that beat their own
// creator's usual have in common (lib/trendSignals.ts). Each group carries its
// sample (Reels, accounts) and the median result of the posts with a
// baseline; a group that doesn't beat the usual says so. Opening lines are
// other accounts' words, so the action here is a brief to write your own.

import Link from "next/link";
import { ExternalLink, Plus, Quote } from "lucide-react";
import { STRONG_HOOK_AT, TREND_LEADS_AT, TREND_MIN_ACCOUNTS, TREND_MIN_POSTS, type TrendExample, type TrendGroup } from "@/lib/trendSignals";
import type { CompetitorsData } from "./types";
import { Locked } from "./TrendingNiche";

const x = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}×`;

function sample(g: TrendGroup): string {
  return `${g.posts} Reels from ${g.accounts} accounts`;
}

function result(g: TrendGroup): string {
  if (g.medianMultiplier == null) return "No baselines to compare yet";
  return `Median ${x(g.medianMultiplier)} their usual`;
}

/** A brief for the user's own version: the structure, never the other account's wording. */
function brief(e: TrendExample, structure: string | null): string {
  return [
    structure ? `Hook idea: open with a ${structure.toLowerCase()} line` : "Hook idea from a Reel in my niche",
    `Example: "${e.line}" (${e.account}${e.multiplier != null ? `, ${x(e.multiplier)} their median ${e.basis}` : ""})`,
    "Write my own opening line in this structure, about my own subject.",
    `Original: ${e.url}`,
  ].join("\n");
}

function GroupList({ title, groups, empty }: { title: string; groups: TrendGroup[]; empty: string }) {
  return (
    <div className="cx4-col">
      <h3>{title}</h3>
      {groups.length ? (
        <ul>
          {groups.map((g) => {
            const top = g.examples[0];
            return (
              <li key={g.label}>
                <div className="cx4-row">
                  <b>{g.label}</b>
                  {g.leads ? <span className="cx4-leads">Leads</span> : <span className="cx4-flat">Not ahead</span>}
                </div>
                <small>
                  {result(g)} | {sample(g)}
                </small>
                {top && (
                  <a href={top.url} target="_blank" rel="noopener noreferrer" className="cx4-example" title="Open the original">
                    <span>&ldquo;{top.line}&rdquo;</span>
                    <small>
                      {top.account}
                      {top.multiplier != null ? `, ${x(top.multiplier)}` : ""}
                    </small>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cx3-empty">{empty}</p>
      )}
    </div>
  );
}

export function TrendingHooks({ d }: { d: CompetitorsData }) {
  if (!d.nicheAccess) return <Locked what="Hooks and topics in your niche" upgrade={d.nicheUpgrade} />;
  const t = d.trends;
  const structureOf = (e: TrendExample) => t.hooks.find((g) => g.examples.some((x) => x.url === e.url))?.label ?? null;
  const rule = `A hook or topic shows here once ${TREND_MIN_POSTS} Reels from ${TREND_MIN_ACCOUNTS} accounts share it.`;

  return (
    <section className="ov-card cx2-card cx3" aria-labelledby="cx4-title">
      <div className="cx2-card-head">
        <h2 id="cx4-title">
          <Quote size={14} /> Hooks and topics in your niche
        </h2>
        {t.reelsRead > 0 && (
          <span className="cx2-micro">
            {t.reelsRead} Reels, {t.accounts} accounts
          </span>
        )}
      </div>
      {t.reelsRead === 0 ? (
        <p className="cx3-empty">
          {d.ig.enabled || d.ytConfigured
            ? "No recent Reels or Shorts from your niche yet. Refresh discovery or track a few accounts."
            : "Link a Facebook Page to your Instagram to read Reels from accounts in your niche."}
        </p>
      ) : (
        <>
          <div className="cx4-cols">
            <GroupList title="How they open" groups={t.hooks} empty={`No shared opening style yet. ${rule}`} />
            <GroupList title="What they're about" groups={t.topics} empty={`No shared topic yet. ${rule}`} />
          </div>
          <div className="cx4-lines">
            <h3>Opening lines from the Reels that beat their usual</h3>
            {t.strongLines.length ? (
              <ul>
                {t.strongLines.map((e) => (
                  <li key={e.url}>
                    <div>
                      <p>&ldquo;{e.line}&rdquo;</p>
                      <small>
                        {e.account} | {x(e.multiplier!)} their median {e.basis}
                      </small>
                    </div>
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="ov-btn ghost small" aria-label={`Open the Reel by ${e.account}`}>
                      <ExternalLink size={13} />
                    </a>
                    <Link href={`/plan?note=${encodeURIComponent(brief(e, structureOf(e)))}`} className="ov-btn ghost small">
                      <Plus size={13} /> Add to my plan
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cx3-empty">None of the recent Reels SOCIA read beat their creator&apos;s usual by {STRONG_HOOK_AT}× or more yet.</p>
            )}
          </div>
        </>
      )}
      <small className="cx2-foot">
        &ldquo;Leads&rdquo; means the Reels sharing it reached a median of {TREND_LEADS_AT}× their own creator&apos;s usual. Your content plans and video ideas build on the ones that lead. Opening lines are other accounts&apos; words: borrow the structure and write your own.
      </small>
    </section>
  );
}
