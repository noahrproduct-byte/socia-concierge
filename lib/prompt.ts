import { growthLines } from "./growth";
import { strategyLines } from "./strategy";
import type { GenerateInput } from "./schema";
import type { BrandDetail } from "./profile";
import type { Evidence } from "./planEvidence";

/** Renders the user's saved brand & strategist settings as prompt context.
 *  Returns "" when nothing is set, so callers can append unconditionally. */
export function brandContext(brand?: BrandDetail | null): string {
  if (!brand) return "";
  const s = brand.strategist ?? {};
  const lines = [
    brand.voice ? `Brand voice: ${brand.voice}` : null,
    brand.location ? `Location / market: ${brand.location}` : null,
    brand.website ? `Website: ${brand.website}` : null,
    brand.description ? `About the brand: ${brand.description}` : null,
    brand.avoid ? `Words/topics to AVOID (hard rule): ${brand.avoid}` : null,
    s.aggressiveness
      ? `Recommendation appetite: ${s.aggressiveness} (safe = proven plays only; balanced = mostly proven with light experiments; experimental = push bolder, higher-variance ideas)`
      : null,
    s.formats?.length ? `Preferred formats: ${s.formats.join(", ")}` : null,
    s.frequency ? `Posting cadence target: ${s.frequency}` : null,
    s.prioritize ? `Topics to prioritize: ${s.prioritize}` : null,
    // The Growth Profile: what the person told SOCIA about the account, its
    // audience and what they can realistically produce.
    ...growthLines(brand.growth),
  ].filter(Boolean);
  if (!lines.length) return "";
  return `\n# Brand & strategist settings (saved by the user in SOCIA — follow them)\n${lines.join("\n")}`;
}

// The strategist persona. This is the "insight" the whole business is testing —
// keep it opinionated and specific, not generic social-media advice.
export const SYSTEM = `You are SOCIA, a senior social media strategist. You audit the user's OWN social account and produce a concrete, evidence-backed weekly content plan for it. Your output must be sharp and specific enough that the user acts on it today.

Rules:
- Be specific, never generic. "Post more Reels" is useless. "Open Reels on a face + spoken hook in the first 1.5s, because your top posts all did" is the bar.
- Every recommendation must cite its evidence — a specific pattern in the account's own data, or a specific behaviour from a competitor the user provided. Never invent metrics that weren't given; reason from what you were told and say when you are inferring.
- Score honestly. A healthScore of 90 should be rare. Most accounts that need help are 40-70.
- Diagnose the single biggest lever, not ten small ones. topFixes is ranked hardest-hitting first.
- Write hooks as the actual first line of the post, in the account's voice, not a description of a hook.
- weeklyPlan has 5-7 posts, balancing proven formats with one or two controlled experiments.
- weeklyPlan[].day is a weekday name (Monday … Sunday), so the plan can be placed on a calendar. Do not put times in it; SOCIA assigns times from the audience data.
- weeklyPlan[].format is one short label: Reel, Carousel, Static or Story. Shot length, camera notes, captions and CTAs belong in concept.
- weeklyPlan[].predictedPerformance is a label of at most five words (for example "High confidence", "Above your median", "Experiment"). Ranges, caveats and what to measure belong in rationale.
- Cite only numbers that appear in the evidence you were given. If a figure is not there, do not invent one; say what is missing and reason from what is.
- Match the account's brand voice when it is provided, and tailor everything to the account's niche.
- Every weeklyPlan item also carries: title (a working title, at most 8 words); purpose (which strategy pillar or priority it serves, or the goal when there is no strategy); audience (who it is for, in a few words); platform (one connected platform: Instagram, Facebook, YouTube or TikTok; the primary platform when unsure); direction (shots, look and pacing in one or two sentences); production (what it takes to make: people, gear and roughly how long, within the resources given; never more equipment, editing skill or help than they said they have); successMetric (the one number that says whether it worked, against the account's own median, for example "Saves against your median").`;

export function buildUserPrompt(input: GenerateInput, brand?: BrandDetail | null, evidence?: Evidence | null): string {
  const parts: string[] = [];
  parts.push(`# My account`);
  parts.push(`Account / handle: ${input.clientHandle || "(not given)"}`);
  parts.push(`Niche: ${input.niche || "(not given)"}`);
  parts.push(`Primary platform: ${input.platform || "Instagram"}`);
  if (input.goal.trim()) parts.push(`My goal: ${input.goal.trim()}`);
  if (input.brandVoice.trim())
    parts.push(`Brand voice / notes: ${input.brandVoice.trim()}`);

  const brandBlock = brandContext(brand);
  if (brandBlock) parts.push(brandBlock);

  // The Growth Strategy (lib/strategy.ts): the week is built from it.
  const strategy = strategyLines(brand?.strategy);
  if (strategy) {
    parts.push(`\n# The account's growth strategy (written with SOCIA and kept by the user; build the week from it)`);
    parts.push(strategy);
    parts.push(`Plan ${brand!.strategy!.frequency.posts_per_week} posts this week, the strategy's pace, even where the general rule says 5 to 7. Spread them across the content pillars, include a running experiment's test when one is due, and say in each post's rationale which pillar or priority it serves.`);
  }

  // Real data first, the user's own notes after it. When SOCIA holds nothing,
  // the notes are all there is and the model is told so.
  parts.push(`\n# The account's recent posts and how they performed`);
  if (evidence?.postsBlock) {
    parts.push(`(Pulled by SOCIA from the connected Instagram account. Real numbers.)`);
    parts.push(evidence.postsBlock);
    if (input.recentPosts.trim()) parts.push(`\nThe user's own notes on recent posts:\n${input.recentPosts.trim()}`);
  } else {
    parts.push(
      input.recentPosts.trim() ||
        "(none provided — infer cautiously from the niche and say so in the audit)",
    );
  }

  parts.push(`\n# When this account's audience engages`);
  parts.push(
    input.audienceWindows?.trim() ||
      "(not enough of the account's own posts to map timing yet — do not guess posting times)",
  );

  parts.push(`\n# Competitor / niche accounts and what's working for them`);
  if (evidence?.competitorsBlock) {
    parts.push(`(Found and measured by SOCIA: YouTube figures come from the YouTube Data API; Instagram and Facebook accounts found by web research carry no metrics because those platforms don't publish them.)`);
    parts.push(evidence.competitorsBlock);
    if (input.competitors.trim()) parts.push(`\nThe user's own notes on competitors:\n${input.competitors.trim()}`);
  } else {
    parts.push(
      input.competitors.trim() ||
        "(none provided — base competitor insights on well-known patterns in this niche and flag them as general rather than specific)",
    );
  }

  if (evidence?.decisionsBlock) {
    parts.push(`\n# What the person approved, turned down and added`);
    parts.push(evidence.decisionsBlock);
    parts.push(`Respect these calls. Never propose a turned-down idea again, in any wording. Act on each reason: "Too difficult to film" means simpler production; "Too repetitive" means a different topic and format; "I don't like this format" means leave that format out; "I want something more creative" means a bolder concept; "Not relevant to my brand" means stay closer to their pillars. Build on what they approved and on their own ideas, and when a post follows from one, say so in its evidence field.`);
  }

  if (evidence?.formatsBlock) {
    parts.push(`\n# Formats that lead in this niche`);
    parts.push(`(Found by SOCIA across other accounts' public posts: each format has at least 3 examples from 2 accounts, and its numbers are those posts' results against their own creators' medians. Other accounts' results, not this account's.)`);
    parts.push(evidence.formatsBlock);
    parts.push(`You may build planned posts on these formats, adapted to this account and never copied. When a post uses one, name the format and its basis in that post's evidence field (for example "Uses the one-take build format: median 2.1x across 4 niche examples").`);
  }

  if (evidence?.outcomesBlock) {
    parts.push(`\n# What happened to the last plan`);
    parts.push(evidence.outcomesBlock);
    parts.push(
      `Use this. Keep and build on what beat the median (same format and hook structure, a new angle). Change what fell short: a different format, hook or topic, and say what you changed. A planned post that was never made is a signal about effort, not about the idea: re-propose it at most once, simplified so it is easier to film, and only if it still fits the goal. For every post in the new plan whose idea follows from a previous result, say so in its evidence field (for example "Follows last week's Friday Reel, which did 2.1× the median").`,
    );
  }

  parts.push(
    `\n# Task\nProduce the full deliverable: a health score with a one-line diagnosis, an honest audit, the account's strengths, its concrete problems (with the evidence and the impact of each), the top 3 fixes ranked by expected impact, competitor insights with the specific gap this account should close, and a 5-7 post plan for the coming week where each post has a written hook and cites its evidence.`,
  );

  return parts.join("\n");
}
