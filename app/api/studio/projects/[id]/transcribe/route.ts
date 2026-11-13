import { NextResponse, after } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, clipRows } from "@/lib/studioClips/server";
import { transcribeClips } from "@/lib/studioClips/job";
import { getTranscriptionProvider } from "@/lib/transcribe";
import { perUserLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 300;
const BUDGET_MS = 240_000;

// POST /api/studio/projects/:id/transcribe: the words of every clip with
// sound and no transcript yet, for the person's own edit (the Video editor),
// so captions and the themes' hooks work there as they do in Build. Only the
// transcription runs (no clip cards, no grouping, no build credit); it is
// billed by audio length like any transcription. Answers at once and works
// in after(); the editor polls its build for the words.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const provider = getTranscriptionProvider();
  if (!provider) return NextResponse.json({ started: false, notConfigured: true, error: "Transcription isn't set up on this server, so captions can't be made." }, { status: 200 });
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const rows = (await clipRows(ctx.client, id)).filter((c) => (c.status === "uploaded" || c.status === "ready") && c.audio_path && !c.transcript && c.facts?.audio?.hasAudio !== false);
    if (!rows.length) return NextResponse.json({ started: false, pending: 0 });
    const limited = await perUserLimit(ctx.ownerId, "studio_transcribe", 20, "transcriptions");
    if (limited) return limited;
    after(async () => {
      try { await transcribeClips(ctx.client, provider, rows, Date.now() + BUDGET_MS, async () => undefined); }
      catch (e) { console.error("[studio/transcribe-project]", (e as Error)?.message ?? e); }
    });
    return NextResponse.json({ started: true, pending: rows.length }, { status: 202 });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/projects/[id]/transcribe", e);
  }
}
