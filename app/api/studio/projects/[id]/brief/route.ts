import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/aiStatus";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { accountContext, buildFromBrief, getProjectRow, listBriefBuilds } from "@/lib/studioClips/server";
import { breakDownReference } from "@/lib/studioClips/analysis";
import { cleanBreakdown, cleanPrompt, referenceBrief, sanitizeReference, shotStats } from "@/lib/studioClips/reference";
import { readPresets } from "@/lib/studioClips/styleStore";
import { errorResponse, publicMessage } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 120;

// Make a video from a prompt or a reference (Growth/Pro, like Make This Video).
//   GET  -> the project's cuts made from a brief: [{ id, title, referenceName, createdAt }]
//   POST { prompt?, reference? } -> one new cut over every understood clip that
//        follows the written brief and/or recreates the reference's structure,
//        pacing and text style. The reference arrives as what the browser
//        measured (length, cut times, a few frames, timed speech); the video
//        itself never reaches SOCIA and nothing of it is stored except the
//        written breakdown on the cut.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    return NextResponse.json({ builds: await listBriefBuilds(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, project.id) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/projects/[id]/brief", e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { prompt?: unknown; reference?: unknown } | null;
  const prompt = cleanPrompt(body?.prompt);
  const reference = body?.reference != null ? sanitizeReference(body.reference) : null;
  if (body?.reference != null && !reference) return NextResponse.json({ error: "SOCIA couldn't read that reference video. Try an MP4 under 3 minutes." }, { status: 400 });
  if (!prompt && !reference) return NextResponse.json({ error: "Write what you want, or add a reference video." }, { status: 400 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const limited = await perUserLimit(ctx.ownerId, "studio-brief", 20, "videos from a brief");
    if (limited) return limited;
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null);
    let ref: { name: string; breakdown: NonNullable<ReturnType<typeof cleanBreakdown>>; brief: string } | null = null;
    if (reference) {
      const { raw } = await breakDownReference(reference, acct);
      const breakdown = cleanBreakdown(raw, reference.durationSec);
      if (!breakdown) return NextResponse.json({ error: "SOCIA couldn't break that reference down. Try a clearer or shorter video." }, { status: 422 });
      ref = { name: reference.name, breakdown, brief: referenceBrief(breakdown, reference.durationSec, shotStats(reference)) };
    }
    const preset = (await readPresets(ctx).catch(() => null))?.brand ?? null;
    const build = await buildFromBrief(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, project, acct, prompt, reference: ref, preset });
    return NextResponse.json({ build, breakdown: ref?.breakdown ?? null });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    console.error("[studio/brief]", (e as Error)?.message ?? e);
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? publicMessage("studio/projects/[id]/brief", e, "SOCIA couldn't make that cut. Try again.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
