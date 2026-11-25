import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { completeClip, deleteClip, type CompleteInput } from "@/lib/studioClips/server";
import type { ClipFacts } from "@/lib/studioClips/types";
import { isOwnPath } from "@/lib/storagePaths";
import { errorResponse } from "@/lib/dbError";
import { MAX_KEYFRAMES } from "@/lib/studioClips/types";
import { scopeToWorkspace } from "@/lib/workspaces";
import { clipOwnsPath, signUrls } from "@/lib/studioClips/storage";

export const runtime = "nodejs";

// One clip.
//   GET -> { url, name }: a short-lived link to the clip's own file, so the Video editor can read it as a reference
//   PATCH { sourcePath, frames: [{t, path}], audioPath, facts } -> the clip, now uploaded
//   DELETE -> { ok } (its footage leaves storage; the project needs a new Understand)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  try {
    // The owner's clip in the active Brand Workspace, whose footage is still kept.
    const { data, error } = await scopeToWorkspace(
      ctx.client.from("studio_clips").select("id, project_id, name, source_path, status, purged_at").eq("user_id", ctx.ownerId).eq("id", id),
      ctx.workspace?.id ?? null,
    ).maybeSingle();
    if (error) throw error;
    const row = data as { id: string; project_id: string; name: string; source_path: string | null; status: string; purged_at: string | null } | null;
    if (!row || row.purged_at || !["ready", "uploaded"].includes(row.status) || !clipOwnsPath(row, row.source_path)) return NextResponse.json({ error: "That clip isn't available any more." }, { status: 404 });
    const urls = await signUrls(ctx.client, [row.source_path!], 600);
    const url = urls[row.source_path!];
    if (!url) return NextResponse.json({ error: "SOCIA couldn't open that clip just now. Try again." }, { status: 502 });
    return NextResponse.json({ url, name: row.name });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/clips/[id]", e);
  }
}

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
  const mine = (p: unknown) => typeof p === "string" && isOwnPath(p, [viewerId]) && p.split("/")[2] === id;
  if (!mine(body.sourcePath) || body.frames.some((f) => !mine(f?.path)) || (body.audioPath != null && !mine(body.audioPath))) {
    return NextResponse.json({ error: "Storage paths must be your own." }, { status: 400 });
  }
  try {
    const clip = await completeClip(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id, {
      sourcePath: body.sourcePath,
      frames: body.frames.filter((f) => typeof f?.t === "number").map((f) => ({ t: Number(f.t), path: String(f.path) })).slice(0, MAX_KEYFRAMES),
      audioPath: typeof body.audioPath === "string" ? body.audioPath : null,
      facts: (body.facts as ClipFacts | undefined) ?? null,
      bytes: typeof body.bytes === "number" && Number.isFinite(body.bytes) ? body.bytes : null,
      mime: typeof body.mime === "string" ? body.mime.slice(0, 64) : null,
    });
    if (!clip) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    return NextResponse.json(clip);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/clips/[id]", e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const forbidden = requireMutate(r.ctx);
  if (forbidden) return forbidden;
  try {
    const ok = await deleteClip(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!ok) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse("studio/clips/[id]", e);
  }
}
