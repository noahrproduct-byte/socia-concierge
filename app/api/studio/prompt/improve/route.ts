import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { brandWorkspace } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, clipRows, frameUrls, toClipInputs, accountContext } from "@/lib/studioClips/server";
import { improvePrompt, AnalysisError } from "@/lib/studioClips/analysis";
import { cleanPrompt, PROMPT_MIN } from "@/lib/studioClips/promptBrief";

export const runtime = "nodejs";
export const maxDuration = 60;

// Prompt mode: make a rough brief detailed and straightforward, from what the
// project's clips really contain. One content_generation credit per rewrite
// (the same meter as a caption or hook), given back if nothing comes back.
//   POST { projectId, prompt } -> { prompt, assumptions, usage }

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { projectId?: unknown; prompt?: unknown } | null;
  const prompt = cleanPrompt(body?.prompt);
  if (!prompt) return NextResponse.json({ error: `Write at least ${PROMPT_MIN} characters first.` }, { status: 400 });
  if (typeof body?.projectId !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const wsId = ctx.workspace?.id ?? null;
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, body.projectId);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const limited = await perUserLimit(ctx.ownerId, "prompt_improve", 30, "brief rewrites");
    if (limited) return limited;
    const u = await requireUsage(ctx.client, ctx.ownerId, "content_generation", { feature: "build_from_clips" });
    if (u.denied) return u.denied;
    try {
      const rows = (await clipRows(ctx.client, project.id)).filter((c) => !c.purged_at && c.status !== "expired" && c.status !== "failed");
      const urls = await frameUrls(ctx.client, rows.filter((c) => c.card));
      const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), wsId);
      const out = await improvePrompt(prompt, toClipInputs(rows, urls), acct);
      if (!out.prompt) { await u.release(); return NextResponse.json({ error: "SOCIA couldn't improve that brief. Try again." }, { status: 502 }); }
      return NextResponse.json({ prompt: out.prompt, assumptions: out.assumptions, usage: u.usage });
    } catch (e) {
      await u.release();
      throw e;
    }
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const msg = e instanceof AnalysisError ? `${e.message} Try again.` : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
