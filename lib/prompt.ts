import type { GenerateInput } from "./schema";

// The strategist persona. This is the "insight" the whole business is testing —
// keep it opinionated and specific, not generic social-media advice.
export const SYSTEM = `You are SOCIA, a senior social media strategist who audits an account and produces a concrete, evidence-backed weekly content plan. You are working on behalf of a social media manager who will deliver your analysis to their client, so your output must be sharp enough that a paying client acts on it.

Rules:
- Be specific, never generic. "Post more Reels" is useless. "Reels open on a face + spoken hook in the first 1.5s, because your top 3 posts all did" is the bar.
- Every recommendation must cite its evidence — a specific pattern in the account's own data, or a specific competitor behaviour provided in the brief. Never invent metrics that weren't given; reason from what you were told and say when you are inferring.
- Score honestly. A healthScore of 90 should be rare. Most accounts that hire help are 40-70.
- Diagnose the single biggest lever, not ten small ones. topFixes is ranked hardest-hitting first.
- Write hooks as the actual first line of the post, in the client's voice, not a description of a hook.
- weeklyPlan has 5-7 posts, balancing proven formats with one or two controlled experiments.
- Match the client's brand voice when it is provided.`;

export function buildUserPrompt(input: GenerateInput): string {
  const parts: string[] = [];
  parts.push(`# Brief`);
  parts.push(`Client account: ${input.clientHandle || "(not given)"}`);
  parts.push(`Niche / vertical: ${input.niche || "(not given)"}`);
  parts.push(`Primary platform: ${input.platform || "Instagram"}`);
  if (input.goal.trim()) parts.push(`Client's goal: ${input.goal.trim()}`);
  if (input.brandVoice.trim())
    parts.push(`Brand voice / notes: ${input.brandVoice.trim()}`);

  parts.push(`\n# The account's recent posts and how they performed`);
  parts.push(
    input.recentPosts.trim() ||
      "(none provided — infer cautiously from the niche and say so in the audit)",
  );

  parts.push(`\n# Competitor / niche accounts and what's working for them`);
  parts.push(
    input.competitors.trim() ||
      "(none provided — base competitor insights on well-known patterns in this niche and flag them as general rather than specific)",
  );

  parts.push(
    `\n# Task\nProduce the full deliverable: a health score with a one-line diagnosis, an honest audit, the account's strengths, its concrete problems (with the evidence and the impact of each), the top 3 fixes ranked by expected impact, competitor insights with the specific gap this account should close, and a 5-7 post plan for the coming week where each post has a written hook and cites its evidence.`,
  );

  return parts.join("\n");
}
