import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { generateStrategy, readStrategy, saveStrategy } from "@/lib/strategyLoad";
import { STRATEGY_REGEN_COOLDOWN_MS, applyEdits, type GrowthStrategy } from "@/lib/strategy";

export const runtime = "nodejs";
export const maxDuration = 60;

// The brand's Growth Strategy (lib/strategy.ts), on every plan. Written once
// on first open; regenerating replaces it at most once a day and is for owners
// and admins, as is editing. Each write is one model call, so the cooldown
// and the hourly ceiling live here, never in the UI.

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  return { ctx: await resolveContext(supabase, user.id) };
}

export async function GET() {
  const c = await context();
  if (c.error) return c.error;
  return NextResponse.json({ strategy: await readStrategy(c.ctx) });
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const c = await context();
  if (c.error) return c.error;
  const { ctx } = c;
  const body = (await req.json().catch(() => ({}))) as { regenerate?: boolean };
  const current = await readStrategy(ctx);
  if (current && !body.regenerate) return NextResponse.json({ strategy: current });
  if (current) {
    if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
    const next = Date.parse(current.generated_at) + STRATEGY_REGEN_COOLDOWN_MS;
    if (Date.now() < next) {
      return NextResponse.json({ error: `The strategy can be rewritten once a day. Next: ${new Date(next).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`, nextAt: new Date(next).toISOString() }, { status: 429 });
    }
  }
  const limited = await perUserLimit(ctx.ownerId, "growth_strategy", 4, "strategy writes");
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  try {
    const strategy = await generateStrategy(ctx);
    if (!(await saveStrategy(ctx, strategy))) return NextResponse.json({ error: "Couldn't save the strategy. Try again." }, { status: 500 });
    return NextResponse.json({ strategy });
  } catch (err) {
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}

export async function PATCH(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const c = await context();
  if (c.error) return c.error;
  const { ctx } = c;
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const patch = (await req.json().catch(() => null)) as Partial<GrowthStrategy> | null;
  if (!patch || typeof patch !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const current = await readStrategy(ctx);
  if (!current) return NextResponse.json({ error: "There's no strategy to edit yet." }, { status: 404 });
  const strategy = applyEdits(current, patch, new Date());
  if (!(await saveStrategy(ctx, strategy))) return NextResponse.json({ error: "Couldn't save your changes. Try again." }, { status: 500 });
  return NextResponse.json({ strategy });
}
