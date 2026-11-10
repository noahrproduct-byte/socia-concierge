import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { loadClipJob, loadClips, deleteClipJob } from "@/lib/clipper/server";
import { refreshClipJob } from "@/lib/aiStudio/runner";

export const runtime = "nodejs";
export const maxDuration = 120;

// One clipping job.
//   GET    -> { job, clips }: looking at an open job also moves it along (no cron needed locally)
//   DELETE -> { ok }: a finished or failed job and its clips; a processing one is left to finish
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper");
  if (!r.ok) return r.res;
  try {
    let job = await loadClipJob(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
    job = await refreshClipJob(job);
    const clips = job.status === "done" ? await loadClips(r.ctx.client, r.ctx.ownerId, job.id, job) : [];
    return NextResponse.json({ job, clips });
  } catch (e) {
    return aiErrorResponse("clipper/jobs/[id]", e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  try {
    const job = await loadClipJob(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
    const ok = await deleteClipJob(r.ctx.ownerId, job);
    if (!ok) return NextResponse.json({ error: "This video is still being clipped. It can be removed once it finishes." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiErrorResponse("clipper/jobs/[id]", e);
  }
}
