import { NextResponse } from "next/server";
import { aiRequest } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/anthropic";
import { writeStudioIdeas } from "@/lib/generation/ideas";
import { loadIdeaContext } from "@/lib/generation/ideaContext";
import { isStudioGoal } from "@/lib/generation/goals";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { about?, goal?, draft? } -> { ideas, used, missing }: content ideas from the brand's own profile and,
// by goal, its best posts, the niche's trending Reels or the person's own draft (lib/generation/goals.ts).
export async function POST(req: Request) {
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const limited = await perUserLimit(r.ctx.ownerId, "studio_ideas", 20, "AI Studio ideas");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { about?: unknown; goal?: unknown; draft?: unknown } | null;
  const about = typeof body?.about === "string" ? body.about.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
  const goal = isStudioGoal(body?.goal) ? body.goal : "ideas";
  const draft = typeof body?.draft === "string" ? body.draft.trim().slice(0, 1500) || null : null;
  if (goal === "improve" && !draft) return NextResponse.json({ error: "Paste the idea or script to improve." }, { status: 400 });
  try {
    // What the goal reads beyond the profile; when there is none (no posts yet, no Reels read), the page says so and ideas still come.
    const { context, used } = await loadIdeaContext(r.ctx, r.viewerId, goal, draft);
    const missing = !used && (goal === "best" || goal === "trending")
      ? goal === "best" ? "SOCIA has no posts with numbers for this account yet, so these ideas come from your profile." : "SOCIA hasn't found Reels that took off in your niche yet, so these ideas come from your profile. Discover reads more."
      : null;
    const ideas = await writeStudioIdeas(r.ctx, { about, context, count: goal === "improve" ? 3 : undefined });
    return NextResponse.json({ ideas, used, missing });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status) return NextResponse.json({ error: (err as Error).message }, { status });
    const k = aiFailureKind(err);
    console.error("[studio-ai/ideas]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}
