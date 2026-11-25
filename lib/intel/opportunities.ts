// Growth opportunities (intelligence engine phase 3, Noah 2026-11-25): what
// comparable accounts do that works for them and the brand hasn't tried, each
// with the evidence, real examples, why it may work and how to try it.
//
// Worked out in code from what SOCIA already holds, never written by a model:
//   hook      an opening structure leading across the niche's recent Reels
//             (lib/trendSignals.ts) that the brand's own captions don't use
//   topic     a subject leading in the niche the brand hasn't covered
//   format    the niche's proven posts are short videos and the brand posts few
//   cadence   the accounts it learns from post more often than it does, and its
//             own target allows more
// Everything is labelled for what it is: seen on other accounts and untested
// on this one. Nothing promises it will work here; each "how" is a small test
// to run, so the brand's own results decide (phase 4 tracks them).
// Pure and browser-safe.

import { hookLine, hookStructures, type TrendExample, type TrendGroup, type TrendSignals } from "../trendSignals";
import { tagsFor } from "../competitorPatterns";
import { tagGroup } from "../discovery";

export type OpportunityKind = "hook" | "topic" | "format" | "cadence";

export type Opportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  /** what SOCIA observed on other accounts, with its numbers */
  observed: string;
  /** where the brand stands on it, from its own posts */
  you: string;
  /** why it may work, kept apart from the observation; never a promise */
  why: string;
  /** a small, concrete way to try it */
  how: string;
  examples: TrendExample[];
  /** for ordering only */
  strength: number;
};

export type OwnPost = { caption: string | null; format: string; at: string | null };

export type OpportunityInput = {
  signals: TrendSignals | null;
  /** the niche's proven Reels' formats ("Reel", "Short", "Carousel", "Photo") */
  provenFormats: string[];
  /** the brand's own recent posts (newest first is fine) */
  own: OwnPost[];
  /** posts a week by the accounts it learns from (known values only) */
  rosterPace: number[];
  /** the brand's own posting target (Creator Routine), if it set one */
  targetPerWeek: number | null;
  /** tokens of the brand's location, for local-language topics */
  loc: string[];
  now: Date;
};

const DAY = 86_400_000;
const x = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}x`;
/** Lowercase the first letter for use mid-sentence, leaving acronyms ("POV") as they are. */
const lower = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** Practical "how" per hook structure, in the brand's own words to come. */
const HOOK_HOW: Record<string, string> = {
  Question: "Open your next Reel with a question your customer actually asks, answered in the video.",
  Comparison: "Put two things side by side in the first second (before and after, cheap and premium, yours and the usual way).",
  "Time contrast": "Show the same thing at two speeds or times, and say the contrast in the first line.",
  "Levels / tiers": "Rank three versions of something you sell, from basic to best, and say the levels up front.",
  "Listicle hook": "Open with a number: three mistakes, five things, and deliver exactly that many.",
  "First-person challenge": "Start with \"I tried\" or \"We made\" and show the attempt, not just the result.",
  Superlative: "Lead with the biggest, fastest or most of something true about your business.",
  "High-drama framing": "Open on the moment something goes wrong or nearly does, then show how it turns out.",
  "Contrarian hook": "Open by naming a common belief in your niche and saying why it's wrong.",
  POV: "Film it from the viewer's point of view (\"POV: you just walked in\") so they're in the scene.",
};
const TOPIC_HOW = (label: string) => `Make one post about ${lower(label)} in the way you already film, so the subject is the only thing that changes.`;

function usesHook(own: OwnPost[], label: string): number {
  return own.filter((p) => { const l = hookLine(p.caption); return Boolean(l && hookStructures(l).includes(label)); }).length;
}
function usesTopic(own: OwnPost[], label: string, loc: string[]): number {
  return own.filter((p) => tagsFor(p.caption, loc).filter((t) => tagGroup(t) === "theme").includes(label)).length;
}

function fromGroup(g: TrendGroup, kind: "hook" | "topic", used: number, total: number): Opportunity | null {
  if (!g.leads || g.medianMultiplier == null) return null;
  // A structure the brand already uses in a fair share of its posts isn't an opportunity.
  if (used >= Math.max(2, Math.round(total * 0.2))) return null;
  const observed = `${g.posts} recent Reels from ${g.accounts} accounts in your niche ${kind === "hook" ? "open this way" : "are about this"}; their median is ${x(g.medianMultiplier)} their creators' usual (${g.aboveBaseline} of ${g.withBaseline} beat it).`;
  return {
    id: `${kind}:${g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    title: kind === "hook" ? `Try the ${lower(g.label)} hook` : `Cover ${lower(g.label)}`,
    observed,
    you: total ? (used ? `Used in ${used} of your last ${total} posts.` : `None of your last ${total} posts ${kind === "hook" ? "opens this way" : "is about this"}.`) : "SOCIA hasn't read your posts yet.",
    why: `It is working for several accounts like yours, not just one, so it's worth a test. That's a pattern in their results, not proof it will work for you.`,
    how: kind === "hook" ? HOOK_HOW[g.label] ?? `Open your next Reel with a line in this structure, adapted to your business.` : TOPIC_HOW(g.label),
    examples: g.examples.slice(0, 3),
    strength: (g.medianMultiplier - 1) * Math.log2(g.accounts + 1) * (used ? 0.6 : 1),
  };
}

export function findOpportunities(i: OpportunityInput, max = 6): Opportunity[] {
  const since = i.now.getTime() - 60 * DAY;
  const own = i.own.filter((p) => !p.at || Date.parse(p.at) >= since).slice(0, 30);
  const total = own.length;
  const out: Opportunity[] = [];

  for (const g of i.signals?.hooks ?? []) { const o = fromGroup(g, "hook", usesHook(own, g.label), total); if (o) out.push(o); }
  for (const g of i.signals?.topics ?? []) { const o = fromGroup(g, "topic", usesTopic(own, g.label, i.loc), total); if (o) out.push(o); }

  // Format: the niche's proven posts are short videos and the brand posts few of them.
  const video = (f: string) => f === "Reel" || f === "Short";
  if (i.provenFormats.length >= 4 && total >= 4) {
    const nicheShare = i.provenFormats.filter(video).length / i.provenFormats.length;
    const ownShare = own.filter((p) => video(p.format)).length / total;
    if (nicheShare >= 0.7 && ownShare < 0.5) {
      out.push({
        id: "format:short-video", kind: "format", title: "Post more Reels",
        observed: `${Math.round(nicheShare * 100)}% of the posts that took off in your niche are Reels or Shorts.`,
        you: `${Math.round(ownShare * 100)}% of your last ${total} posts are.`,
        why: "Short video is what's being rewarded for the accounts you learn from. Your own results will show whether it's true for you.",
        how: "Turn your next two planned photos into short Reels of the same thing, and compare them with your usual posts.",
        examples: [], strength: (nicheShare - ownShare) * 2,
      });
    }
  }

  // Cadence: the accounts it learns from post more, and the brand's own target leaves room.
  const pace = i.rosterPace.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  const ownPerWeek = i.own.filter((p) => p.at && Date.parse(p.at) >= i.now.getTime() - 30 * DAY).length / (30 / 7);
  if (pace.length >= 3) {
    const mid = pace[Math.floor(pace.length / 2)];
    const observed = `The accounts you learn from post a median of ${mid.toFixed(1)} times a week.`;
    const you = `You posted ${ownPerWeek.toFixed(1)} times a week over the last 30 days${i.targetPerWeek ? `; your own target is ${i.targetPerWeek}` : ""}.`;
    const why = "More posts give you more chances and more results to learn from. It isn't the number alone that grows an account.";
    if (mid >= ownPerWeek * 1.5 && mid - ownPerWeek >= 1) {
      if (i.targetPerWeek != null) {
        // Their own target is their decision: the opportunity is reaching it, never posting past it.
        if (i.targetPerWeek - ownPerWeek >= 0.5) {
          out.push({ id: "cadence:reach-target", kind: "cadence", title: "Get back to your posting target", observed, you, why,
            how: `Plan your next two weeks at ${i.targetPerWeek} posts a week, the target you set, before adding more.`,
            examples: [], strength: Math.min(2, (i.targetPerWeek - ownPerWeek) / Math.max(1, ownPerWeek)) });
        }
      } else {
        out.push({ id: "cadence:more-often", kind: "cadence", title: "Post a little more often", observed, you, why,
          how: "Add one post a week for the next month, and keep it to what you can keep up.",
          examples: [], strength: Math.min(2, (mid - ownPerWeek) / Math.max(1, ownPerWeek)) });
      }
    }
  }

  return out.sort((a, b) => b.strength - a.strength).slice(0, max);
}

/** The opportunities as prompt lines for the plan writer, the strategist and Ask SOCIA. */
export function opportunitiesEvidence(list: Opportunity[]): string {
  if (!list.length) return "";
  return [
    "Growth opportunities SOCIA found by comparing this account with the accounts it learns from (seen on other accounts, untested on this one; a test to run, never a promise):",
    ...list.map((o) => `- ${o.title}. Observed: ${o.observed} This account: ${o.you} How to try it: ${o.how}${o.examples.length ? ` Examples: ${o.examples.map((e) => `${e.account} "${e.line}"`).join("; ")}` : ""}`),
  ].join("\n");
}
