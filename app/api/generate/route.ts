import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import type { GenerateInput } from "@/lib/schema";
import { generatePlan, PlanGenerationError } from "@/lib/planGenerate";
import { createClient } from "@/lib/supabase/server";
import { getIgSnapshot } from "@/lib/instagramSync";
import { loadEvidence, type Evidence } from "@/lib/planEvidence";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { competitorScopeId } from "@/lib/workspaces";
import { recentPlanOutcomes } from "@/lib/planOutcomesLoad";

export const runtime = "nodejs";
// Opus 5 thinks before answering; give the request room.
export const maxDuration = 300;

export async function POST(req: Request) {
  // Signed-in users only: a plan is the most expensive thing SOCIA generates
  // and it counts against the Content Plan allowance.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // The plan is built from, saved to, and charged against the active Brand
  // Workspace's owner (the viewer, unless they were invited into it).
  const ctx = await resolveContext(supabase, user.id);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key, then restart the dev server.",
      },
      { status: 500 },
    );
  }

  let input: GenerateInput;
  try {
    input = (await req.json()) as GenerateInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!input.clientHandle?.trim() && !input.niche?.trim()) {
    return NextResponse.json(
      { error: "Enter at least a client handle or a niche to analyze." },
      { status: 400 },
    );
  }

  // The user's saved brand & strategist settings sharpen the plan, and the
  // evidence SOCIA already holds (posts, competitors, winning content) is what
  // the strategist reasons over. All best-effort: generation still works with
  // the typed brief alone, and the plan records what it was built from.
  let brand = null;
  let evidence: Evidence | null = null;
  try {
    brand = (await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)))?.brand_detail ?? null;
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
    // The last two plans and what became of them, so the strategist learns
    // from what was posted, skipped, and how each post did.
    const outcomes = await recentPlanOutcomes(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => []);
    evidence = await loadEvidence(ctx.client, ctx.ownerId, snap, await competitorScopeId(ctx.client, ctx.workspace?.id), { outcomes });
    evidence.used.windows = Boolean(input.audienceWindows?.trim());
  } catch {
    // generation still works without settings or evidence
  }

  // Weekly plans are a Starter feature, and each one counts against the
  // period's allowance. Counted right before the model is called, and given
  // back when no plan comes out of the call.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_plan", { feature: "content_plan" });
  if (u.denied) return u.denied;

  try {
    const { data, saved } = await generatePlan({ client: ctx.client, ownerId: ctx.ownerId, workspaceId: ctx.workspace?.id ?? null, input, brand, evidence });
    return NextResponse.json({ data, saved, usage: u.usage });
  } catch (err: unknown) {
    await u.release();
    if (err instanceof PlanGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === "refusal" ? 422 : 502 });
    }
    const message =
      err instanceof Error ? err.message : "Unexpected error generating the plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
