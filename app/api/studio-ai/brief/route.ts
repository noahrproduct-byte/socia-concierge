import { NextResponse } from "next/server";
import { aiRequest } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/anthropic";
import { writeBrief } from "@/lib/generation/brief";
import { isStudioGoal } from "@/lib/generation/goals";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { idea, goal } -> { brief }: AI Studio's creative brief for one chosen
// idea (lib/generation/brief.ts). Writing it spends no generation credits; the
// page keeps it, so moving between steps never asks again.
export async function POST(req: Request) {
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const limited = await perUserLimit(r.ctx.ownerId, "studio_brief", 30, "AI Studio briefs");
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as { idea?: Record<string, unknown>; goal?: unknown } | null;
  const i = b?.idea ?? {};
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const idea = {
    hook: str(i.hook, 160), concept: str(i.concept, 500), shot: str(i.shot, 1200), caption: str(i.caption, 2200),
    kind: i.kind === "text_to_image" ? "text_to_image" as const : "text_to_video" as const,
    ref: i.ref && typeof i.ref === "object" && typeof (i.ref as { url?: unknown }).url === "string"
      ? { url: str((i.ref as { url: string }).url, 300), account: str((i.ref as { account?: unknown }).account, 80), result: str((i.ref as { result?: unknown }).result, 80) || null }
      : undefined,
  };
  if (!idea.hook && !idea.concept) return NextResponse.json({ error: "Pick an idea first." }, { status: 400 });
  try {
    const brief = await writeBrief(r.ctx, { idea, goal: isStudioGoal(b?.goal) ? b.goal : "ideas" });
    return NextResponse.json({ brief });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status) return NextResponse.json({ error: (err as Error).message }, { status });
    const k = aiFailureKind(err);
    console.error("[studio-ai/brief]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}
