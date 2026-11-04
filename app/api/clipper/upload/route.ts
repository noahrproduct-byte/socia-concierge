import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { mediaPath, signedUploadUrl } from "@/lib/aiStudio/media";

export const runtime = "nodejs";

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/3gpp": "3gp" };
/** Largest source upload, MB. Must not exceed the Supabase project's file-size limit. */
const MAX_SOURCE_MB = Number(process.env.CLIPPER_MAX_FILE_MB ?? 2000);

// POST { contentType, bytes } -> { path, signedUrl, token }: where the browser PUTs the source video.
export async function POST(req: Request) {
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  const body = (await req.json().catch(() => null)) as { contentType?: string; bytes?: number } | null;
  const ext = EXT[(body?.contentType ?? "").toLowerCase()];
  if (!ext) return NextResponse.json({ error: "Upload an .mp4, .mov, .avi or .3gp file." }, { status: 400 });
  if (typeof body?.bytes !== "number" || body.bytes <= 0 || body.bytes > MAX_SOURCE_MB * 1024 * 1024) return NextResponse.json({ error: `The file must be under ${MAX_SOURCE_MB >= 1000 ? `${MAX_SOURCE_MB / 1000} GB` : `${MAX_SOURCE_MB} MB`}.` }, { status: 400 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  try {
    const path = mediaPath(r.ctx.ownerId, "clipper-sources", ext);
    const up = await signedUploadUrl(svc, path);
    if (!up) return NextResponse.json({ error: "Storage did not give an upload address. Run supabase/ai-studio.sql." }, { status: 503 });
    return NextResponse.json({ path, ...up });
  } catch (e) {
    return aiErrorResponse("clipper/upload", e);
  }
}
