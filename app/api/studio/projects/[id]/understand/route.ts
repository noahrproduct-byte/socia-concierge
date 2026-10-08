import { NextResponse, after } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { requireUsage } from "@/lib/planGuard";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, clipRows, updateProject, accountContext, loadProject } from "@/lib/studioClips/server";
import { runUnderstand } from "@/lib/studioClips/job";

export const runtime = "nodejs";
// Transcription + one model call per clip + the batch call: minutes, not
// seconds. The response goes out at once and the work continues in after().
export const maxDuration = 300;
const BUDGET_MS = 280_000;

// POST /api/studio/projects/:id/understand — one "clip build" credit, counted
// before anything runs and given back if nothing came of it. ?sync=1 waits
// for the result (tests).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    // A run that is still writing progress is left alone; a stale one (the
    // function died) may be restarted.
    const fresh = project.status === "understanding" && project.progress && Date.now() - new Date(project.progress.updatedAt).getTime() < 90_000;
    if (fresh) return NextResponse.json({ error: "SOCIA is already understanding this footage.", running: true }, { status: 409 });
    const clips = (await clipRows(ctx.client, id)).filter((c) => c.status === "uploaded" || c.status === "ready");
    if (!clips.length) return NextResponse.json({ error: "Add at least one clip first." }, { status: 400 });

    const usage = await requireUsage(ctx.client, ctx.ownerId, "content_build", { feature: "build_from_clips" });
    if (usage.denied) return usage.denied;

    const startedAt = new Date().toISOString();
    await updateProject(ctx.client, id, { status: "understanding", error: null, progress: { stage: "understanding", done: 0, total: clips.length, startedAt, updatedAt: startedAt } });
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null);
    const deadlineAt = Date.now() + BUDGET_MS;
    const run = async () => {
      const result = await runUnderstand(ctx.client, { projectId: id, acct, deadlineAt });
      if (!result.ok) await usage.release();
      console.log("[studio] understand", JSON.stringify({ project: id, ok: result.ok, posts: result.ok ? result.yield.opportunities.length : undefined, error: result.ok ? undefined : result.error }));
    };
    if (new URL(req.url).searchParams.get("sync") === "1") {
      await run();
      return NextResponse.json(await loadProject(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id));
    }
    after(run);
    return NextResponse.json({ started: true, usage: usage.usage }, { status: 202 });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
