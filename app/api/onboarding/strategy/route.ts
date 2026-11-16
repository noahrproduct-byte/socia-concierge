import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { generateInitialPlan, needsInitialPlan } from "@/lib/initialPlan";
import { perUserLimit } from "@/lib/rateLimit";
import { startNicheScan } from "@/lib/nicheScan/run";
import { runStrategyBuild } from "@/lib/onboardingBuildRun";
import type { BuildEvent } from "@/lib/onboardingBuild";

export const runtime = "nodejs";
// The strategy is written inside the request; the first weekly plan keeps
// working after it (next/server `after`), as it always has.
export const maxDuration = 300;

// Onboarding's strategy step: read the accounts, look at the recent posts,
// check the niche and write the strategy, telling the page about each step as
// it starts and as it ends (one JSON object a line, lib/onboardingBuild.ts),
// then everything the reveal shows. Asking again is safe: a strategy that is
// already written is read back, not written twice. Afterwards, for a brand
// with no plan yet, its first weekly plan is written in the background and
// the research into its niche starts, exactly as the old last step did.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const limited = await perUserLimit(ctx.ownerId, "onboarding_strategy", 12, "strategy builds");
  if (limited) return limited;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: BuildEvent) => {
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* the page went away */ }
      };
      try {
        const reveal = await runStrategyBuild(ctx, send);
        send({ type: "done", reveal });
      } catch (e) {
        console.error("[onboarding/strategy]", (e as Error)?.message ?? e);
        send({ type: "error", message: "SOCIA couldn't finish reading your accounts just now. Try again in a minute." });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });

  // One first plan per brand, on SOCIA; a repeat within the hour starts nothing new.
  after(async () => {
    try {
      if (process.env.ANTHROPIC_API_KEY && (await needsInitialPlan(ctx)) && !(await perUserLimit(ctx.ownerId, "initial_plan", 1, "first plans"))) {
        const r = await generateInitialPlan(ctx).catch((e) => `failed: ${e instanceof Error ? e.message : String(e)}`);
        console.log("[initial-plan]", ctx.ownerId, r);
      }
      await startNicheScan(ctx, "onboarding").catch(() => null);
    } catch (e) {
      console.error("[onboarding/strategy] after:", (e as Error)?.message ?? e);
    }
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
