import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse, publicOrigin } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { recordEvent } from "@/lib/planGuard";
import { createGenerationJob, listGenerationJobs, priceGeneration } from "@/lib/generation/server";
import { modelById, type GenerationKind } from "@/lib/credits/config";
import { creditBalance } from "@/lib/credits/ledger";
import { isOwnPath } from "@/lib/storagePaths";
import { cleanTag } from "@/lib/aiStudio/captions";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = new Set<GenerationKind>(["text_to_video", "image_to_video", "text_to_image"]);

// AI Studio's generation jobs (Scale).
//   GET  -> { jobs, balance }
//   POST { kind, modelId, prompt, durationSec?, aspectRatio?, inputImagePath?, idea?, caption?, hashtags? } -> { job, balance }
export async function GET() {
  const r = await aiRequest("ai_studio");
  if (!r.ok) return r.res;
  try {
    const [jobs, balance] = await Promise.all([
      listGenerationJobs(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null),
      creditBalance(r.ctx.ownerId, r.ent.plan).catch(() => null),
    ]);
    return NextResponse.json({ jobs, balance });
  } catch (e) {
    return aiErrorResponse("studio-ai/jobs", e);
  }
}

export async function POST(req: Request) {
  const r = await aiRequest("ai_studio", { mutate: true });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, "studio_ai_submit", 30, "AI Studio generations");
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = b?.kind as GenerationKind;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Choose text to video, image to video or text to image." }, { status: 400 });
  const model = modelById(String(b?.modelId ?? ""));
  if (!model || !model.kinds.includes(kind)) return NextResponse.json({ error: "Pick a model that does this kind of generation." }, { status: 400 });
  const prompt = typeof b?.prompt === "string" ? b.prompt : "";
  const durationSec = typeof b?.durationSec === "number" ? Math.round(b.durationSec) : undefined;
  const aspectRatio = typeof b?.aspectRatio === "string" && (model.aspectRatios ?? []).includes(b.aspectRatio) ? b.aspectRatio : model.aspectRatios?.[0];
  const inputImagePath = typeof b?.inputImagePath === "string" ? b.inputImagePath : null;
  if (inputImagePath && !isOwnPath(inputImagePath, [r.ctx.ownerId, r.viewerId])) return NextResponse.json({ error: "That image is not yours." }, { status: 403 });
  if (priceGeneration({ kind, modelId: model.id, durationSec }) == null) return NextResponse.json({ error: `Pick a length this model offers: ${(model.durations ?? []).join(", ")} seconds.` }, { status: 400 });
  const idea = b?.idea && typeof b.idea === "object" ? (b.idea as Record<string, unknown>) : null;
  const origin = publicOrigin(req);
  try {
    const job = await createGenerationJob(r.ctx, {
      kind, modelId: model.id, prompt, durationSec, aspectRatio, inputImagePath, idea,
      caption: typeof b?.caption === "string" ? b.caption.slice(0, 2200) : null,
      hashtags: Array.isArray(b?.hashtags) ? (b.hashtags as unknown[]).filter((t): t is string => typeof t === "string").map(cleanTag).filter(Boolean).slice(0, 5) : [],
      webhookUrl: origin && process.env.HIGGSFIELD_WEBHOOK_SECRET ? `${origin}/api/webhooks/higgsfield` : undefined,
    });
    recordEvent(r.ctx.client, r.ctx.ownerId, "ai_usage", { feature: "studio_generation", kind, model: model.id, credits: job.credits_reserved });
    const balance = await creditBalance(r.ctx.ownerId, r.ent.plan).catch(() => null);
    return NextResponse.json({ job, balance });
  } catch (e) {
    return aiErrorResponse("studio-ai/jobs", e);
  }
}
