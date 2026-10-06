import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { loadProject, getProjectRow, updateProject, deleteProject } from "@/lib/studioClips/server";

export const runtime = "nodejs";

// One project: everything the page renders (clips with signed thumbnails,
// progress while understanding, the Content Yield when ready).
//   GET            -> StudioProject
//   PATCH { title } -> { ok }
//   DELETE         -> { ok } (footage removed from storage, rows cascade)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  try {
    const project = await loadProject(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    return NextResponse.json(project);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const forbidden = requireMutate(r.ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  if (typeof body?.title !== "string") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  try {
    const row = await getProjectRow(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!row) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    await updateProject(r.ctx.client, id, { title: body.title.trim().slice(0, 120) || null });
    return NextResponse.json({ ok: true });
  } catch (e) {
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
    const ok = await deleteProject(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, id);
    if (!ok) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
