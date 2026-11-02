import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { canUseFeature, getEntitlements } from "@/lib/entitlements";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/anthropic";
import { writeIdeas } from "@/lib/ideas/server";
import { readIdeas, saveIdeas } from "@/lib/ideas/store";
import { isIdeaStyle } from "@/lib/ideas/videoIdeas";

export const runtime = "nodejs";
export const maxDuration = 300;

// Video ideas for the active Brand Workspace (Dashboard).
//   GET  -> { set, canMake } the last ideas written (or null), and whether
//        this plan can make one in the Video editor (SOCIA's first cut)
//   POST { styles, about? } -> { set, usage }: new ideas in those styles. One
//        batch of the plan's content ideas allowance, given back on failure.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const [set, ent] = await Promise.all([readIdeas(ctx), getEntitlements(ctx.client, ctx.ownerId).catch(() => null)]);
  return NextResponse.json({ set, canMake: ent ? canUseFeature(ent, "auto_build") : false });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { styles?: unknown; about?: unknown } | null;
  const styles = Array.from(new Set((Array.isArray(body?.styles) ? body.styles : []).filter(isIdeaStyle)));
  if (!styles.length) return NextResponse.json({ error: "Pick at least one kind of video." }, { status: 400 });
  const about = typeof body?.about === "string" ? body.about.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_ideas");
  if (u.denied) return u.denied;
  try {
    const set = await writeIdeas(ctx, { styles, about });
    await saveIdeas(ctx, set);
    return NextResponse.json({ set, usage: u.usage });
  } catch (err) {
    await u.release();
    const status = (err as { status?: number })?.status;
    if (status) return NextResponse.json({ error: (err as Error).message }, { status });
    const k = aiFailureKind(err);
    console.error("[ideas]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}
