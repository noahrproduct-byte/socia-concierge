import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { runInitialization } from "@/lib/briefingLoad";
import { generateInitialPlan, needsInitialPlan } from "@/lib/initialPlan";
import { perUserLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
// The first plan keeps working after the response (next/server `after`): a
// strategy and a plan take one to three minutes.
export const maxDuration = 300;

// The end of onboarding: read the connected accounts, record goal starting
// points, and return each outcome plus the first briefing. Then, for a brand
// with no plan yet, write its strategy and first weekly plan in the
// background (lib/initialPlan.ts); the bell says when it's ready.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  try {
    const out = await runInitialization(ctx, { understoodAt: profile?.brand_detail?.growth?.understanding?.analyzed_at ?? null });
    // One first plan per brand, on SOCIA; a repeated click within the hour starts nothing new.
    if (process.env.ANTHROPIC_API_KEY && (await needsInitialPlan(ctx)) && !(await perUserLimit(ctx.ownerId, "initial_plan", 1, "first plans"))) {
      out.outcomes.push({ label: "Write your strategy and first weekly plan", status: "done", detail: "Started. It takes a few minutes; the plan appears under Plan and the bell tells you when it's ready." });
      // SOCIA is writing it, so it is no longer a step for the person.
      out.briefing.actions = out.briefing.actions.filter((a) => a.label !== "Make your first weekly plan");
      after(async () => {
        const r = await generateInitialPlan(ctx).catch((e) => `failed: ${e instanceof Error ? e.message : String(e)}`);
        console.log("[initial-plan]", ctx.ownerId, r);
      });
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Couldn't read your accounts just now. Try again in a minute." }, { status: 502 });
  }
}
