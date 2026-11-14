import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { aiFailure } from "@/lib/anthropic";
import { perUserLimit } from "@/lib/rateLimit";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { buildPlayerData } from "@/lib/studioClips/server";
import { applyOps, describeCut, type InstructClip } from "@/lib/studioClips/instruct";
import { opsFor } from "@/lib/studioClips/instructModel";
import type { Edl } from "@/lib/studioClips/types";
import { publicMessage } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { instruction, edl } -> { edl, reply, done, skipped, regenerate }
// "Tell SOCIA what to change": the person's words (typed, or spoken and
// transcribed in the browser) about the cut they are looking at. The cut
// sent is the editor's working copy, so unsaved trims are respected; the
// result goes back to the editor as an undoable change and is saved when the
// person saves. Nothing is written here. Capped per user per hour.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { instruction?: string; edl?: Edl } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 600) : "";
  if (!instruction || !body?.edl || !Array.isArray(body.edl.segments) || !Array.isArray(body.edl.text)) return NextResponse.json({ error: "Say what to change, in a sentence or two." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const limited = await perUserLimit(ctx.ownerId, "studio_instruct", 60, "edit instructions");
  if (limited) return limited;
  try {
    const data = await buildPlayerData(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id, true);
    if (!data) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    const clips: InstructClip[] = data.sources.map((s) => ({ id: s.clipId, position: s.position, durationSec: s.durationSec, words: s.words, moments: s.moments }));
    const known = new Set(clips.map((c) => c.id));
    if (!body.edl.segments.every((s) => known.has(s.clipId))) return NextResponse.json({ error: "That cut uses footage that is no longer in this project. Reload the editor." }, { status: 409 });
    const description = describeCut(body.edl, clips);
    const { ops, reply, rejected } = await opsFor(instruction, description, ctx.ownerId);
    const result = applyOps(body.edl, ops, clips);
    const skipped = rejected ? [...result.skipped, `${rejected} step${rejected === 1 ? "" : "s"} SOCIA proposed did not fit the editor and ${rejected === 1 ? "was" : "were"} left out`] : result.skipped;
    return NextResponse.json({ edl: result.edl, reply: reply || (result.done.length ? "Done." : "Nothing changed."), done: result.done, skipped, regenerate: result.regenerate, changed: result.done.length > 0 && Boolean(ops.length) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const kind = aiFailure("studio/builds/instruct", e);
    if (kind !== "failed") return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: 503 });
    return NextResponse.json({ error: publicMessage("studio/builds/instruct", e, "Couldn't apply that change. Say it another way, or make the change in the sections below.") }, { status: 500 });
  }
}
