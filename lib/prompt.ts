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
- Cite only numbers that appear in the evidence you were given. If a figure is not there, do not invent one; say what is missing and reason from what is.
- Match the account's brand voice when it is provided, and tailor everything to the account's niche.`;

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

  parts.push(
    `\n# Task\nProduce the full deliverable: a health score with a one-line diagnosis, an honest audit, the account's strengths, its concrete problems (with the evidence and the impact of each), the top 3 fixes ranked by expected impact, competitor insights with the specific gap this account should close, and a 5-7 post plan for the coming week where each post has a written hook and cites its evidence.`,
  );

  return parts.join("\n");
}
