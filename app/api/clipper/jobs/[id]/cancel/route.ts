import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { cancelClipJob, loadClipJob } from "@/lib/clipper/server";
import { creditBalance } from "@/lib/credits/ledger";

export const runtime = "nodejs";

// POST -> { job, balance }: stop a job that is still running; its credits come back.
// 409 when it can't be stopped any more (finished, or already with an outside provider).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  try {
    const job = await loadClipJob(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
    const cancelled = await cancelClipJob(job);
    if (!cancelled) return NextResponse.json({ error: "This job can't be cancelled any more. Reload the page to see where it is." }, { status: 409 });
    const balance = await creditBalance(r.ctx.ownerId, r.ent.plan).catch(() => null);
    return NextResponse.json({ job: cancelled, balance });
  } catch (e) {
    return aiErrorResponse("clipper/jobs/[id]/cancel", e);
  }
}
