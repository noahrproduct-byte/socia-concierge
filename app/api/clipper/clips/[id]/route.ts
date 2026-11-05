import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/service";
import { AI_BUCKET, mediaPath, removePaths, signedUploadUrl } from "@/lib/aiStudio/media";

export const runtime = "nodejs";

// One of SOCIA's own clips, rendered in the person's browser (components/ai/renderClip.ts).
//   POST  -> { path, signedUrl, token }: where the browser uploads the rendered MP4
//   PATCH { path, cropX } -> { ok }: the rendered file becomes the clip's video
// Only clips SOCIA picked (they have a range in the source) are rendered here.

type ClipRow = { id: string; user_id: string; video_path: string | null; start_ms: number | null };

async function ownClip(svc: ReturnType<typeof createServiceClient>, ownerId: string, id: string): Promise<ClipRow | null> {
  if (!svc || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await svc.from("clips").select("id, user_id, video_path, start_ms").eq("id", id).eq("user_id", ownerId).maybeSingle();
  const c = data as ClipRow | null;
  return c && c.start_ms != null ? c : null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, "clipper_render", 60, "clip renders");
  if (limited) return limited;
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  try {
    if (!(await ownClip(svc, r.ctx.ownerId, id))) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    const path = mediaPath(r.ctx.ownerId, "clips", "mp4");
    const up = await signedUploadUrl(svc, path);
    if (!up) return NextResponse.json({ error: "Storage did not give an upload address. Try again." }, { status: 503 });
    return NextResponse.json({ path, ...up });
  } catch (e) {
    return aiErrorResponse("clipper/clips/[id]", e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { path?: unknown; cropX?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const cropX = typeof body?.cropX === "number" && Number.isFinite(body.cropX) ? Math.min(1, Math.max(0, body.cropX)) : null;
  // Only a file this route handed out: the owner's clips folder, a SOCIA-made name.
  const prefix = `${r.ctx.ownerId}/clips/`;
  if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.mp4$/i.test(path.slice(prefix.length)) || cropX == null) {
    return NextResponse.json({ error: "Render the clip first." }, { status: 400 });
  }
  try {
    const clip = await ownClip(svc, r.ctx.ownerId, id);
    if (!clip) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    const name = path.slice(prefix.length);
    const { data: found } = await svc.storage.from(AI_BUCKET).list(prefix.slice(0, -1), { search: name, limit: 1 });
    if (!(found ?? []).some((f: { name: string }) => f.name === name)) return NextResponse.json({ error: "The rendered file didn't arrive. Render it again." }, { status: 409 });
    const { error } = await svc.from("clips").update({ video_path: path, crop_x: cropX }).eq("id", id).eq("user_id", r.ctx.ownerId);
    if (error) throw new Error(error.message);
    // A re-render replaces the earlier file.
    if (clip.video_path && clip.video_path !== path) await removePaths(svc, [clip.video_path]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiErrorResponse("clipper/clips/[id]", e);
  }
}
