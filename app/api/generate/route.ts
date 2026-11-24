import { NextResponse } from "next/server";
import { firstTooLong, tooLongResponse } from "@/lib/inputLimits";
import type { GenerateInput } from "@/lib/schema";
import { generatePlan, PlanGenerationError } from "@/lib/planGenerate";
import { DeadlineError, TOOK_TOO_LONG, deadlineFor, withDeadline } from "@/lib/deadline";
import { createClient } from "@/lib/supabase/server";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext } from "@/lib/context";
import { loadPlanContext, planMixFor } from "@/lib/planContext";
import type { PlanEvent } from "@/lib/planProgress";

export const runtime = "nodejs";
// Opus 5.5 thinks before answering; give the request room.
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

  const long = firstTooLong({
    clientHandle: { value: input.clientHandle, max: 100, label: "The handle" },
    niche: { value: input.niche, max: 200, label: "The niche" },
    platform: { value: input.platform, max: 50, label: "The platform" },
    brandVoice: { value: input.brandVoice, max: 3_000, label: "Brand voice" },
    recentPosts: { value: input.recentPosts, max: 10_000, label: "Recent posts" },
    competitors: { value: input.competitors, max: 4_000, label: "Competitors" },
    goal: { value: input.goal, max: 1_500, label: "The goal" },
    ideas: { value: input.ideas, max: 3_000, label: "Your ideas" },
    audienceWindows: { value: input.audienceWindows, max: 3_000, label: "Audience timing" },
  });
  if (long) return tooLongResponse(long.label, long.max);

  if (!input.clientHandle?.trim() && !input.niche?.trim()) {
    return NextResponse.json(
      { error: "Enter at least a client handle or a niche to analyze." },
      { status: 400 },
    );
  }

  // The plan is built step by step; the page asks to hear each step as it
  // happens (lib/planProgress.ts) with this header, and gets one JSON object
  // a line. Without it the answer is a single JSON response, as before.
  const live = req.headers.get("x-plan-progress") === "1";
  if (!live) {
    const r = await build(ctx, input, () => {});
    return NextResponse.json(r.body, { status: r.status });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PlanEvent) => {
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* the page went away */ }
      };
      try {
        const r = await build(ctx, input, send);
        send(r.status === 200 ? { type: "done", ...(r.body as { data: unknown; saved: unknown; usage: unknown }) } : { type: "error", status: r.status, body: r.body });
      } catch (err) {
        send({ type: "error", status: 500, body: { error: err instanceof Error ? err.message : "Unexpected error generating the plan." } });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

type Built = { status: number; body: unknown };

/** Everything after the request checks: read the evidence, count the use, build and save the plan. */
async function build(ctx: Awaited<ReturnType<typeof resolveContext>>, input: GenerateInput, send: (e: PlanEvent) => void): Promise<Built> {
  // The user's saved brand & strategist settings sharpen the plan, and the
  // evidence SOCIA already holds (posts, competitors, winning content) is what
  // the strategist reasons over. All best-effort: generation still works with
  // the typed brief alone, and the plan records what it was built from.
  send({ type: "step", step: "ideas", state: "active" });
  const { brand, evidence } = await loadPlanContext(ctx, input);
  send({ type: "found", competitors: evidence?.used.competitors ?? 0, reels: evidence?.proven?.length ?? 0, posts: evidence?.used.posts ?? 0 });
  send({ type: "step", step: "ideas", state: "done" });

  // How many filmed and animated posts (lib/planContext.ts planMixFor).
  input = await planMixFor(ctx, input, brand);

  // Weekly plans are a Starter feature, and each one counts against the
  // period's allowance. Counted right before the model is called, and given
  // back when no plan comes out of the call.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_plan", { feature: "content_plan" });
  if (u.denied) return { status: u.denied.status, body: await u.denied.json().catch(() => ({ error: "This plan can't build a Content Plan right now." })) };

  try {
    const { data, saved } = await withDeadline(generatePlan({ client: ctx.client, ownerId: ctx.ownerId, workspaceId: ctx.workspace?.id ?? null, input, brand, evidence, onProgress: send }), deadlineFor(maxDuration));
    return { status: 200, body: { data, saved, usage: u.usage } };
  } catch (err: unknown) {
    await u.release();
    if (err instanceof DeadlineError) {
      console.error("[generate] stopped at our own time limit");
      return { status: 504, body: { error: TOOK_TOO_LONG, kind: "timeout" } };
    }
    if (err instanceof PlanGenerationError) {
      return { status: err.kind === "refusal" ? 422 : 502, body: { error: err.message } };
    }
    const message =
      err instanceof Error ? err.message : "Unexpected error generating the plan.";
    return { status: 500, body: { error: message } };
  }
}
