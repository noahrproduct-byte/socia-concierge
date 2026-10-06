import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, registerClip, type RegisterInput } from "@/lib/studioClips/server";
import { sourcePath, framePath, audioPath } from "@/lib/studioClips/storage";
import { MAX_CLIP_SEC, MIN_CLIP_SEC } from "@/lib/studioClips/types";

export const runtime = "nodejs";

// Register a clip BEFORE its bytes move: plan limits are checked here and the
// browser receives the storage paths it may write to (its own uid prefix).
// POST { projectId, fingerprint, name, mime, bytes, durationSec, width, height, recordedAt, ext }
//   -> { clip, paths: { source, frame(i) pattern, audio }, reused, expiresAt }

type Body = Partial<RegisterInput> & { projectId?: string; ext?: string };

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.projectId || typeof body.fingerprint !== "string" || !body.fingerprint || typeof body.name !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < MIN_CLIP_SEC) return NextResponse.json({ error: "SOCIA needs at least one second of video per clip." }, { status: 400 });
  if (durationSec > MAX_CLIP_SEC) return NextResponse.json({ error: `Clips are capped at ${MAX_CLIP_SEC / 60} minutes each. Trim this one and add it again.` }, { status: 400 });

  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "build_from_clips", ent);
    if (denied) return denied;
    const project = await getProjectRow(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, body.projectId);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    if (project.status === "understanding") return NextResponse.json({ error: "Wait for the current analysis to finish before adding clips." }, { status: 409 });

    const input: RegisterInput = {
      fingerprint: body.fingerprint.slice(0, 128), name: body.name, mime: typeof body.mime === "string" ? body.mime : null,
      bytes: Math.max(0, Math.round(Number(body.bytes) || 0)), durationSec,
      width: Number.isFinite(Number(body.width)) ? Math.round(Number(body.width)) : null,
      height: Number.isFinite(Number(body.height)) ? Math.round(Number(body.height)) : null,
      recordedAt: typeof body.recordedAt === "string" && !Number.isNaN(Date.parse(body.recordedAt)) ? new Date(body.recordedAt).toISOString() : null,
    };
    const res = await registerClip(ctx.client, { ownerId: ctx.ownerId, viewerId, wsId: ctx.workspace?.id ?? null, ent, project, input });
    if (!res.ok) return NextResponse.json(res.body, { status: res.status });
    const ext = (body.ext || input.name.split(".").pop() || "mp4").toLowerCase();
    return NextResponse.json({
      clip: res.clip, reused: res.reused, expiresAt: res.expiresAt,
      paths: { folder: res.folder, source: sourcePath(res.folder, ext), frames: framePath(res.folder, 0).replace(/0\.jpg$/, ""), audio: audioPath(res.folder) },
    });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
