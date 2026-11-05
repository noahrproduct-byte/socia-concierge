import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { EXT_FOR, mediaPath, signedUploadUrl } from "@/lib/aiStudio/media";
import { perUserLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
const MAX_MB = 20;

// POST { contentType, bytes } -> { path, signedUrl, token }: where the browser PUTs a start image (image to video).
export async function POST(req: Request) {
  const r = await aiRequest("ai_studio", { mutate: true });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, "studio_ai_upload", 40, "image uploads");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { contentType?: string; bytes?: number } | null;
  const type = (body?.contentType ?? "").toLowerCase();
  const ext = type.startsWith("image/") ? EXT_FOR[type] : undefined;
  if (!ext) return NextResponse.json({ error: "Upload a .jpg, .png or .webp image." }, { status: 400 });
  if (typeof body?.bytes !== "number" || body.bytes <= 0 || body.bytes > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `The image must be under ${MAX_MB} MB.` }, { status: 400 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  try {
    const path = mediaPath(r.ctx.ownerId, "studio-inputs", ext);
    const up = await signedUploadUrl(svc, path);
    if (!up) return NextResponse.json({ error: "Storage did not give an upload address. Run supabase/ai-studio.sql." }, { status: 503 });
    return NextResponse.json({ path, ...up });
  } catch (e) {
    return aiErrorResponse("studio-ai/upload", e);
  }
}
