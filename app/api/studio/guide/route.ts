import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { conceptFromIdea, sanitizeGuide, type StudioConcept } from "@/lib/studioGuide";
import { formatConcept, planConcept, saveGuideOnPlan, writeGuide } from "@/lib/studioGuideLoad";
import { platformName } from "@/lib/planItems";

export const runtime = "nodejs";
export const maxDuration = 60;

// Studio's production guide (lib/studioGuide.ts). POST writes one for a
// planned post, a Discover format or the person's own idea: the concept is
// read here from SOCIA's records (only an idea's text comes from the
// browser), one generation is counted against the plan's allowance and given
// back if nothing comes out, and a planned post keeps its guide. PUT saves
// the person's edits to a planned post's guide.

type Source =
  | { kind: "plan"; planId: string; index: number }
  | { kind: "format"; name: string }
  | { kind: "idea"; text: string; format?: string; platform?: string };

async function ctxOrError(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return { error: crossSite };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  return { ctx: await resolveContext(supabase, user.id) };
}

export async function POST(req: Request) {
  const c = await ctxOrError(req);
  if (c.error) return c.error;
  const { ctx } = c;
  const body = (await req.json().catch(() => null)) as { source?: Source } | null;
  const src = body?.source;
  let concept: StudioConcept | null = null;
  if (src?.kind === "plan" && typeof src.planId === "string" && Number.isInteger(src.index)) concept = (await planConcept(ctx, src.planId, src.index))?.concept ?? null;
  else if (src?.kind === "format" && typeof src.name === "string") concept = await formatConcept(ctx, src.name.slice(0, 80));
  else if (src?.kind === "idea" && typeof src.text === "string" && src.text.trim().length >= 10) concept = conceptFromIdea(src.text, String(src.format ?? "Reel"), platformName(src.platform), null);
  if (!concept) return NextResponse.json({ error: "That post or format wasn't found. Describe the idea in a sentence or two instead." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_generation");
  if (u.denied) return u.denied;
  try {
    const guide = await writeGuide(ctx, concept);
    const saved = src?.kind === "plan" ? await saveGuideOnPlan(ctx, src.planId, src.index, guide).catch(() => false) : false;
    return NextResponse.json({ concept, guide, saved, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}

export async function PUT(req: Request) {
  const c = await ctxOrError(req);
  if (c.error) return c.error;
  const body = (await req.json().catch(() => null)) as { planId?: unknown; index?: unknown; guide?: unknown } | null;
  const now = new Date();
  const guide = sanitizeGuide(body?.guide, now);
  if (!guide || typeof body?.planId !== "string" || !Number.isInteger(body?.index)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ok = await saveGuideOnPlan(c.ctx, body.planId, body.index as number, { ...guide, edited_at: now.toISOString() });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That planned post wasn't found." }, { status: 404 });
}
