import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { checkGeneration, quoteGeneration } from "@/lib/generation/server";
import type { GenerationKind } from "@/lib/credits/config";

export const runtime = "nodejs";
export const maxDuration = 30;

const KINDS = new Set<GenerationKind>(["text_to_video", "image_to_video", "text_to_image"]);

// What a generation would cost in credits, from the provider's live estimate.
// Nothing is generated or spent. SOCIA's dollar cost stays on the server.
//   POST { kind, modelId, durationSec?, aspectRatio? } -> { credits }
export async function POST(req: Request) {
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, "studio_ai_quote", 120, "AI Studio price checks");
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = b?.kind as GenerationKind;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Choose text to video, image to video or text to image." }, { status: 400 });
  const input = {
    kind,
    modelId: String(b?.modelId ?? ""),
    durationSec: typeof b?.durationSec === "number" ? Math.round(b.durationSec) : undefined,
    aspectRatio: typeof b?.aspectRatio === "string" ? b.aspectRatio : undefined,
  };
  const checked = checkGeneration(input);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  try {
    const { credits } = await quoteGeneration({ ...input, prompt: "" });
    return NextResponse.json({ credits });
  } catch (e) {
    return aiErrorResponse("studio-ai/quote", e);
  }
}
