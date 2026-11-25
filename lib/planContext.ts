// What a plan is written from: the brand's saved settings and the evidence SOCIA holds (its posts, the
// last plans and what became of them, competitors, niche Reels), and the week's mix of on-camera and
// animated posts. Shared by the plan built in one go (app/api/generate) and the plan built one day at a
// time (lib/planStepsServer.ts), so both read exactly the same brief. Best effort: a plan still works from
// the typed brief alone. Server only.
import { getProfile, type BrandDetail } from "@/lib/profile";
import type { GenerateInput } from "@/lib/schema";
import { getIgSnapshot } from "@/lib/instagramSync";
import { loadEvidence, type Evidence } from "@/lib/planEvidence";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { competitorScopeId } from "@/lib/workspaces";
import { recentPlanOutcomes } from "@/lib/planOutcomesLoad";
import { resolveMix } from "@/lib/planMix";
import { startingMix } from "@/lib/planMixLoad";

/** Competitors (handles) the person unticked on the form: handles only, a bounded list. Pure. */
export function skipList(input: Pick<GenerateInput, "skipCompetitors">): string[] {
  return Array.isArray(input.skipCompetitors)
    ? input.skipCompetitors.filter((h): h is string => typeof h === "string" && h.length > 0 && h.length <= 80).slice(0, 60)
    : [];
}

export async function loadPlanContext(ctx: Ctx, input: GenerateInput): Promise<{ brand: BrandDetail | null; evidence: Evidence | null }> {
  let brand: BrandDetail | null = null;
  let evidence: Evidence | null = null;
  try {
    brand = (await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)))?.brand_detail ?? null;
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
    // The last two plans and what became of them, so the strategist learns from what was posted, skipped, and how each post did.
    const outcomes = await recentPlanOutcomes(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => []);
    evidence = await loadEvidence(ctx.client, ctx.ownerId, snap, await competitorScopeId(ctx.client, ctx.workspace?.id), {
      outcomes, strategy: brand?.strategy ?? null, location: brand?.location ?? null, skip: skipList(input), brandWorkspaceId: ctx.workspace?.id ?? null, targetPerWeek: brand?.growth?.routine?.post_days ?? null,
      timeZone: brand?.timezone ?? null, discover: (brand as { discover?: unknown } | null)?.discover,
    });
    evidence.used.windows = Boolean(input.audienceWindows?.trim());
  } catch {
    // a plan still works without settings or evidence
  }
  return { brand, evidence };
}

/**
 * How many on-camera and animated posts: what the form sent, made safe, with the brand's last plan as the
 * fallback (lib/planMix.ts). No animated posts on a plan without animated videos.
 */
export async function planMixFor(ctx: Ctx, input: GenerateInput, brand: BrandDetail | null): Promise<GenerateInput> {
  try {
    const start = await startingMix(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, brand);
    const mix = resolveMix({ onCamera: input.onCamera, animated: input.animated }, start.mix, start.animatedAllowed);
    return { ...input, onCamera: mix.onCamera, animated: mix.animated };
  } catch {
    return { ...input, onCamera: undefined, animated: undefined };
  }
}
