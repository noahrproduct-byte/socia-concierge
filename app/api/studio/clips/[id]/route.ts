import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { completeClip, deleteClip, type CompleteInput } from "@/lib/studioClips/server";
import type { ClipFacts } from "@/lib/studioClips/types";

export const runtime = "nodejs";

// One clip.
//   PATCH { sourcePath, frames: [{t, path}], audioPath, facts } -> the clip, now uploaded
//   DELETE -> { ok } (its footage leaves storage; the project needs a new Understand)

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as Partial<CompleteInput> | null;
  if (!body || typeof body.sourcePath !== "string" || !Array.isArray(body.frames)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // The browser may only point at objects under its own uid prefix.
  const mine = (p: unknown) => typeof p === "string" && p.startsWith(`${viewerId}/`);
  if (!mine(body.sourcePath) || body.frames.some((f) => !mine(f?.path)) || (body.audioPath != null && !mine(body.audioPath))) {
    return NextResponse.json({ error: "Storage paths must be your own." }, { status: 400 });
  }
  try {
    const clip = await completeClip(ctx.client, ctx.ownerId, id, {
      sourcePath: body.sourcePath,
      frames: body.frames.filter((f) => typeof f?.t === "number").map((f) => ({ t: Number(f.t), path: String(f.path) })).slice(0, 12),
      audioPath: typeof body.audioPath === "string" ? body.audioPath : null,
      facts: (body.facts as ClipFacts | undefined) ?? null,
    });
    if (!clip) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    return NextResponse.json(clip);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const forbidden = requireMutate(r.ctx);
  if (forbidden) return forbidden;
  try {
    const ok = await deleteClip(r.ctx.client, r.ctx.ownerId, id);
    if (!ok) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
