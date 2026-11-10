import { NextResponse } from "next/server";
import { aiRequest } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/anthropic";
import { writeStudioIdeas } from "@/lib/generation/ideas";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { about? } -> { ideas }: content ideas from the brand's own profile, for AI Studio.
export async function POST(req: Request) {
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const limited = await perUserLimit(r.ctx.ownerId, "studio_ideas", 20, "AI Studio ideas");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { about?: unknown } | null;
  const about = typeof body?.about === "string" ? body.about.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
  try {
    const ideas = await writeStudioIdeas(r.ctx, { about });
    return NextResponse.json({ ideas });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status) return NextResponse.json({ error: (err as Error).message }, { status });
    const k = aiFailureKind(err);
    console.error("[studio-ai/ideas]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}
