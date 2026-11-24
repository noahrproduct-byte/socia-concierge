import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { firstTooLong, tooLongResponse } from "@/lib/inputLimits";
import { perUserLimit } from "@/lib/rateLimit";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { APIError } from "@anthropic-ai/sdk";
import { StepError } from "@/lib/planSteps";
import { acceptStep, editStep, retryStep, rewriteStep, startStepPlan, stepPlan, pickEarlierStep } from "@/lib/planStepsServer";
import type { GenerateInput, IdeaCard } from "@/lib/schema";

export const runtime = "nodejs";
// A day's idea is quick; an accepted day's full post is written after the answer, within this limit.
export const maxDuration = 300;

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Planner, one day at a time (lib/planSteps.ts):
//   GET  ?plan=<id>                                   -> { plan }
//   POST { action: "start", ...form }                 -> { plan }   (charges one plan; 2 a week)
//   POST { action: "accept", plan, day, idea? }       -> { plan }   (the day's post is written in the background)
//   POST { action: "retry", plan, day }               -> { plan }   (2 a day)
//   POST { action: "edit", plan, day, idea }          -> { plan }
//   POST { action: "earlier", plan, day, earlier }    -> { plan }
//   POST { action: "rewrite", plan, day }             -> { plan }
async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, ctx: await resolveContext(supabase, user.id) };
}

function failure(e: unknown): NextResponse {
  if (e instanceof StepError) {
    const body = (e as StepError & { body?: Record<string, unknown> }).body;
    return NextResponse.json(body ?? { error: e.message }, { status: e.status });
  }
  if (e instanceof APIError) {
    const kind = aiFailureKind(e);
    console.error(`[ai] plan/steps ${kind} status=${e.status ?? "none"}: ${e.message.replace(/\s+/g, " ").slice(0, 300)}`);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
  console.error("[plan/steps]", (e as Error)?.message ?? e);
  return NextResponse.json({ error: "SOCIA hit an error on its side. Try again in a moment." }, { status: 500 });
}

const ideaFrom = (v: unknown): Partial<IdeaCard> | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const pick = (k: string, n: number) => (typeof o[k] === "string" ? (o[k] as string).slice(0, n) : undefined);
  const out: Partial<IdeaCard> = { title: pick("title", 200), pillar: pick("pillar", 100), description: pick("description", 600), format: pick("format", 120) };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as Partial<IdeaCard>;
};

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("plan") ?? "";
  if (!PLAN_ID.test(id)) return NextResponse.json({ error: "Open a saved plan first." }, { status: 400 });
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    return NextResponse.json({ plan: await stepPlan(w.ctx, id) });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof b?.action === "string" ? b.action : "";
  // Every step that calls the AI is also limited per person per hour (and by the owner's monthly AI ceiling).
  if (action === "start" || action === "accept" || action === "retry" || action === "rewrite") {
    const limited = await perUserLimit(w.user.id, "plan_steps", 120, "plan steps", w.ctx.ownerId);
    if (limited) return limited;
  }
  try {
    if (action === "start") {
      const form = b as unknown as GenerateInput;
      const long = firstTooLong({
        clientHandle: { value: form.clientHandle, max: 100, label: "The handle" },
        niche: { value: form.niche, max: 200, label: "The niche" },
        platform: { value: form.platform, max: 50, label: "The platform" },
        brandVoice: { value: form.brandVoice, max: 3_000, label: "Brand voice" },
        recentPosts: { value: form.recentPosts, max: 10_000, label: "Recent posts" },
        competitors: { value: form.competitors, max: 4_000, label: "Competitors" },
        goal: { value: form.goal, max: 1_500, label: "The goal" },
        ideas: { value: form.ideas, max: 3_000, label: "Your ideas" },
        audienceWindows: { value: form.audienceWindows, max: 3_000, label: "Audience timing" },
      });
      if (long) return tooLongResponse(long.label, long.max);
      if (!form.clientHandle?.trim() && !form.niche?.trim()) return NextResponse.json({ error: "Enter at least a handle or a niche." }, { status: 400 });
      const input: GenerateInput = {
        clientHandle: String(form.clientHandle ?? ""), niche: String(form.niche ?? ""), platform: String(form.platform ?? "Instagram"),
        brandVoice: String(form.brandVoice ?? ""), recentPosts: String(form.recentPosts ?? ""), competitors: String(form.competitors ?? ""),
        goal: String(form.goal ?? ""), ideas: typeof form.ideas === "string" ? form.ideas : undefined,
        audienceWindows: typeof form.audienceWindows === "string" ? form.audienceWindows : undefined,
        onCamera: typeof form.onCamera === "number" ? form.onCamera : undefined, animated: typeof form.animated === "number" ? form.animated : undefined,
        skipCompetitors: Array.isArray(form.skipCompetitors) ? form.skipCompetitors : undefined,
      };
      const started = await startStepPlan(w.ctx, input);
      return NextResponse.json({ plan: started.plan, usage: started.usage });
    }
    const plan = typeof b?.plan === "string" ? b.plan : "";
    const day = typeof b?.day === "number" && Number.isInteger(b.day) && b.day >= 0 && b.day < 40 ? b.day : -1;
    if (!PLAN_ID.test(plan) || day < 0) return NextResponse.json({ error: "Open a saved plan first." }, { status: 400 });
    if (action === "accept") {
      const { plan: saved, writing } = await acceptStep(w.ctx, plan, day, ideaFrom(b?.idea));
      after(() => writing);
      return NextResponse.json({ plan: saved });
    }
    if (action === "retry") return NextResponse.json({ plan: await retryStep(w.ctx, plan, day) });
    if (action === "edit") {
      const idea = ideaFrom(b?.idea);
      if (!idea) return NextResponse.json({ error: "Send the edited idea." }, { status: 400 });
      return NextResponse.json({ plan: await editStep(w.ctx, plan, day, idea) });
    }
    if (action === "earlier") {
      const earlier = typeof b?.earlier === "number" && Number.isInteger(b.earlier) ? b.earlier : -1;
      return NextResponse.json({ plan: await pickEarlierStep(w.ctx, plan, day, earlier) });
    }
    if (action === "rewrite") {
      const { plan: saved, writing } = await rewriteStep(w.ctx, plan, day);
      after(() => writing);
      return NextResponse.json({ plan: saved });
    }
    return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  } catch (e) {
    return failure(e);
  }
}
