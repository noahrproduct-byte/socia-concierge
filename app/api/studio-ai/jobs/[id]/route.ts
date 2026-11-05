import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { loadGenerationJob, loadGenerations, deleteGenerationJob } from "@/lib/generation/server";
import { refreshGenerationJob } from "@/lib/aiStudio/runner";

export const runtime = "nodejs";
export const maxDuration = 120;

// One generation job: GET -> { job, outputs } (looking also moves it along); DELETE -> { ok }.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  try {
    let job = await loadGenerationJob(r.ctx.client, r.ctx.ownerId, id);
    if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
    job = await refreshGenerationJob(job);
    const outputs = job.status === "done" ? await loadGenerations(r.ctx.client, r.ctx.ownerId, job.id) : [];
    return NextResponse.json({ job, outputs });
  } catch (e) {
    return aiErrorResponse("studio-ai/jobs/[id]", e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_studio", { mutate: true });
  if (!r.ok) return r.res;
  try {
    const job = await loadGenerationJob(r.ctx.client, r.ctx.ownerId, id);
    if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
    const ok = await deleteGenerationJob(r.ctx.ownerId, job);
    if (!ok) return NextResponse.json({ error: "This one is already generating and can't be cancelled. It can be removed once it finishes." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiErrorResponse("studio-ai/jobs/[id]", e);
  }
}
