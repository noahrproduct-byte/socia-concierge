import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { brandWorkspace } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, accountContext, buildFromPrompt, listPromptBuilds, isMissingColumn } from "@/lib/studioClips/server";
import { AnalysisError } from "@/lib/studioClips/analysis";
import { cleanPrompt, PROMPT_MIN } from "@/lib/studioClips/promptBrief";

export const runtime = "nodejs";
export const maxDuration = 120;

// Prompt mode: cut a video from a written brief over the project's understood clips.
//   GET  -> the project's prompt builds, newest first
//   POST { prompt } -> a new StudioBuild (EDL + guide), opened in the builder
// Needs Build from Clips on the plan and shares the hourly edit ceiling; the
// clips must have been understood (that run carried the clip build credit).

const PROMPT_MIGRATION = "Prompt mode needs one more database column. Run supabase/studio-prompt.sql in the Supabase SQL editor.";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    return NextResponse.json({ builds: await listPromptBuilds(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = cleanPrompt(body?.prompt);
  if (!prompt) return NextResponse.json({ error: `Describe the video in at least ${PROMPT_MIN} characters.` }, { status: 400 });
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    if (project.status === "understanding") return NextResponse.json({ error: "SOCIA is still understanding the clips. Wait for it to finish.", running: true }, { status: 409 });
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips");
    if (denied) return denied;
    const limited = await perUserLimit(ctx.ownerId, "clip_edl", 40, "video edits");
    if (limited) return limited;
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null);
    const build = await buildFromPrompt(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, project, prompt, acct });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingColumn(e)) return NextResponse.json({ error: PROMPT_MIGRATION, migration: true }, { status: 503 });
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const msg = e instanceof AnalysisError ? `${e.message} Try again.` : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
