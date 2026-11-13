import { NextResponse, after } from "next/server";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { scopeToWorkspace } from "@/lib/workspaces";
import { signUrls } from "@/lib/studioClips/storage";
import { STAB_MAX_SEC, STAB_STALE_MS, stabilizeClip, type StabRecord, type StabilizedMap } from "@/lib/studioClips/stabilize";
import { isStabilizeStrength, type StabilizeStrength } from "@/lib/studioClips/types";
import { errorResponse } from "@/lib/dbError";
import type { Ctx } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 300;

// Stabilize one clip on the server (lib/studioClips/stabilize.ts).
//   POST { strength } -> { status: "working" | "done", urls? }: starts the job (in after(), up to 280 s) or returns the copy that exists
//   GET ?strength=    -> { status, progress, error, urls? }: the job's state; `urls` holds signed links of every finished copy
// The copy is stored next to the clip's source; supabase/studio-stabilize.sql adds the column.

type Row = { id: string; project_id: string; user_id: string; source_path: string | null; duration_s: number | null; stabilized: StabilizedMap | null };

async function loadRow(ctx: Ctx, id: string): Promise<Row | null> {
  const { data, error } = await scopeToWorkspace(ctx.client.from("studio_clips").select("id, project_id, user_id, source_path, duration_s, stabilized").eq("id", id).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).limit(1);
  if (error) throw error;
  return ((data ?? []) as Row[])[0] ?? null;
}

async function finishedUrls(ctx: Ctx, map: StabilizedMap | null): Promise<Partial<Record<StabilizeStrength, string>>> {
  const done = Object.entries(map ?? {}).filter(([, r]) => r?.status === "done" && r.path) as [StabilizeStrength, StabRecord][];
  if (!done.length) return {};
  const urls = await signUrls(ctx.client, done.map(([, r]) => r.path!)).catch(() => ({}) as Record<string, string>);
  return Object.fromEntries(done.map(([k, r]) => [k, urls[r.path!]]).filter(([, u]) => Boolean(u)));
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const strength = new URL(req.url).searchParams.get("strength");
  if (!isStabilizeStrength(strength)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const row = await loadRow(r.ctx, id);
    if (!row) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    const rec = row.stabilized?.[strength];
    const urls = await finishedUrls(r.ctx, row.stabilized);
    if (!rec) return NextResponse.json({ status: "failed", error: "No stabilized copy has been asked for.", urls });
    const stale = rec.status === "working" && Date.now() - Date.parse(rec.at) > STAB_STALE_MS;
    return NextResponse.json({ status: stale ? "failed" : rec.status, progress: rec.progress ?? 0, error: stale ? "The job stopped before it finished. Try again." : rec.error ?? null, urls });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/clips/[id]/stabilize", e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { strength?: unknown } | null;
  const strength = body?.strength;
  if (!isStabilizeStrength(strength)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const row = await loadRow(ctx, id);
    if (!row) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    if (!row.source_path) return NextResponse.json({ error: "This clip hasn't finished uploading." }, { status: 409 });
    if ((row.duration_s ?? 0) > STAB_MAX_SEC) return NextResponse.json({ error: `Clips up to ${STAB_MAX_SEC} seconds can be stabilized on the server. Trim this one first, or stabilize a shorter part.` }, { status: 413 });
    const cur = row.stabilized?.[strength];
    if (cur?.status === "done" && cur.path) return NextResponse.json({ status: "done", urls: await finishedUrls(ctx, row.stabilized) });
    if (cur?.status === "working" && Date.now() - Date.parse(cur.at) < STAB_STALE_MS) return NextResponse.json({ status: "working", progress: cur.progress ?? 0 });
    const write = async (rec: StabRecord) => {
      const { data } = await scopeToWorkspace(ctx.client.from("studio_clips").select("stabilized").eq("id", id).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).limit(1);
      const map = (((data ?? []) as { stabilized: StabilizedMap | null }[])[0]?.stabilized ?? {}) as StabilizedMap;
      await scopeToWorkspace(ctx.client.from("studio_clips").update({ stabilized: { ...map, [strength]: rec } }).eq("id", id).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null);
    };
    await write({ status: "working", progress: 0, at: new Date().toISOString() });
    const clip = { id: row.id, project_id: row.project_id, user_id: row.user_id, source_path: row.source_path, duration_s: row.duration_s };
    after(async () => {
      let lastWrite = 0;
      try {
        const path = await stabilizeClip({
          client: ctx.client, clip, strength,
          onProgress: async (share) => { const t = Date.now(); if (t - lastWrite < 2000) return; lastWrite = t; await write({ status: "working", progress: Math.round(share * 100) / 100, at: new Date().toISOString() }).catch(() => null); },
        });
        await write({ status: "done", path, progress: 1, error: null, at: new Date().toISOString() });
      } catch (e) {
        console.error("[studio/stabilize]", (e as Error)?.message ?? e);
        await write({ status: "failed", error: `Couldn't stabilize this clip: ${(e as Error)?.message ?? "ffmpeg failed"}.`, at: new Date().toISOString() }).catch(() => null);
      }
    });
    return NextResponse.json({ status: "working", progress: 0 });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return errorResponse("studio/clips/[id]/stabilize", e);
  }
}
