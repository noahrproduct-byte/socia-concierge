// AI Studio's job lifecycle (supabase/ai-studio.sql generation_jobs,
// generations): price the request in credits, spend them, save the job, hand
// it to the provider; poll (or take the webhook); copy the output into
// SOCIA's bucket; refund on failure. Service role after the caller was
// checked. Server only.
import { createServiceClient } from "@/lib/supabase/service";
import type { Ctx } from "@/lib/context";
import { generationCredits, modelById, type GenerationKind } from "@/lib/credits/config";
import { spendCredits, refundCredits } from "@/lib/credits/ledger";
import { generationProvider } from "./higgsfield";
import { GenerationError, type GenerationOutput, type GenerationStatus } from "./provider";
import { copyUrlToBucket, extOf, mediaPath, removePaths, signedUrl } from "@/lib/aiStudio/media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type GenerationJobRow = {
  id: string; user_id: string; workspace_id: string | null; kind: GenerationKind; model: string; prompt: string;
  input_image_path: string | null; input: { durationSec?: number; aspectRatio?: string; statusUrl?: string | null };
  idea: Record<string, unknown> | null; provider: string; provider_request_id: string | null;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  credits_reserved: number; credits_charged: number | null; error: string | null;
  created_at: string; updated_at: string; last_polled_at: string | null; finished_at: string | null;
};
export type GenerationRow = {
  id: string; job_id: string; kind: "video" | "image"; output_url: string | null; output_path: string | null; thumbnail_path: string | null;
  duration_ms: number | null; title: string | null; caption: string | null; hashtags: string[]; created_at: string;
};
export type GenerationView = GenerationRow & { playUrl: string | null; downloadUrl: string | null };

const JOB_COLS = "id, user_id, workspace_id, kind, model, prompt, input_image_path, input, idea, provider, provider_request_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at";
const GEN_COLS = "id, job_id, kind, output_url, output_path, thumbnail_path, duration_ms, title, caption, hashtags, created_at";

export const GEN_POLL_SECONDS = 10;
export const GEN_MAX_AGE_MS = 2 * 3600_000;

const svcOrThrow = (): Supa => {
  const svc = createServiceClient();
  if (!svc) throw new GenerationError("SUPABASE_SERVICE_ROLE_KEY is not set.", "no_service");
  return svc;
};

export type CreateGenerationInput = {
  kind: GenerationKind;
  modelId: string;
  prompt: string;
  durationSec?: number;
  aspectRatio?: string;
  /** An image in ai-media (image_to_video). */
  inputImagePath?: string | null;
  idea?: Record<string, unknown> | null;
  /** Where the provider should call back; set by the route from the request origin. */
  webhookUrl?: string;
  caption?: string | null;
  hashtags?: string[];
};

/** Credits a request would cost, or null when the model and kind don't go together. Pure. */
export function priceGeneration(input: Pick<CreateGenerationInput, "kind" | "modelId" | "durationSec">): number | null {
  const m = modelById(input.modelId);
  if (!m || !m.kinds.includes(input.kind)) return null;
  const seconds = input.kind === "text_to_image" ? 0 : (input.durationSec ?? m.durations?.[0] ?? 5);
  if (input.kind !== "text_to_image" && m.durations && !m.durations.includes(seconds)) return null;
  return generationCredits(m.id, input.kind, seconds);
}

export async function createGenerationJob(ctx: Ctx, input: CreateGenerationInput): Promise<GenerationJobRow> {
  const svc = svcOrThrow();
  const model = modelById(input.modelId);
  const credits = priceGeneration(input);
  if (!model || credits == null) throw new GenerationError("Pick a model that does this kind of generation.", "bad_model");
  if (input.kind === "image_to_video" && !input.inputImagePath) throw new GenerationError("Image to video needs a start image.", "no_image");
  const prompt = input.prompt.replace(/\s+/g, " ").trim().slice(0, 2500);
  if (!prompt) throw new GenerationError("Write what the video or image should show.", "no_prompt");
  const { data, error } = await svc.from("generation_jobs").insert({
    user_id: ctx.ownerId, workspace_id: ctx.workspace?.id ?? null, kind: input.kind, model: model.id, prompt,
    input_image_path: input.inputImagePath ?? null,
    input: { durationSec: input.kind === "text_to_image" ? undefined : (input.durationSec ?? model.durations?.[0]), aspectRatio: input.aspectRatio, caption: input.caption ?? null, hashtags: input.hashtags ?? [] },
    idea: input.idea ?? null, provider: generationProvider()?.name ?? "higgsfield", status: "queued", credits_reserved: credits,
  }).select(JOB_COLS).single();
  if (error) throw new GenerationError(error.message, "db");
  const job = data as GenerationJobRow;
  try {
    await spendCredits(ctx.ownerId, credits, { kind: "generation_job", id: job.id }, `${model.name}: ${input.kind.replace(/_/g, " ")}`);
  } catch (e) {
    await svc.from("generation_jobs").delete().eq("id", job.id).eq("user_id", ctx.ownerId);
    throw e;
  }
  return submitGenerationJob(svc, job, input.webhookUrl);
}

export async function submitGenerationJob(svc: Supa, job: GenerationJobRow, webhookUrl?: string): Promise<GenerationJobRow> {
  if (job.status !== "queued") return job;
  const provider = generationProvider();
  const model = modelById(job.model);
  if (!provider) return fail(svc, job, "AI Studio's generation service is not configured.", true);
  if (!model) return fail(svc, job, "That model is no longer offered.", true);
  let imageUrl: string | undefined;
  if (job.kind === "image_to_video") {
    const url = await signedUrl(svc, job.input_image_path, 24 * 3600);
    if (!url) return fail(svc, job, "The start image could not be read.", true);
    imageUrl = url;
  }
  try {
    const { providerRequestId, statusUrl } = await provider.submit({
      kind: job.kind, model, prompt: job.prompt, durationSec: job.input?.durationSec, aspectRatio: job.input?.aspectRatio, imageUrl,
      webhookUrl, idempotencyKey: job.id,
    });
    const now = new Date().toISOString();
    const { data } = await svc.from("generation_jobs").update({ provider_request_id: providerRequestId, input: { ...job.input, statusUrl }, status: "processing", last_polled_at: now, updated_at: now }).eq("id", job.id).select(JOB_COLS).single();
    return (data as GenerationJobRow) ?? { ...job, provider_request_id: providerRequestId, status: "processing" };
  } catch (e) {
    const err = e as GenerationError;
    if (err.retryable) return job;
    return fail(svc, job, err.message || "The generation service refused the request.", true);
  }
}

async function fail(svc: Supa, job: GenerationJobRow, message: string, refund: boolean): Promise<GenerationJobRow> {
  const now = new Date().toISOString();
  const { data } = await svc.from("generation_jobs").update({ status: "failed", error: message.slice(0, 500), finished_at: now, updated_at: now, credits_charged: refund ? 0 : job.credits_reserved }).eq("id", job.id).select(JOB_COLS).single();
  if (refund) await refundCredits(job.user_id, { kind: "generation_job", id: job.id }, "Generation failed");
  return (data as GenerationJobRow) ?? { ...job, status: "failed", error: message };
}

export async function pollGenerationJob(svc: Supa, job: GenerationJobRow): Promise<GenerationJobRow> {
  if (job.status === "queued") return submitGenerationJob(svc, job);
  if (job.status !== "processing" || !job.provider_request_id) return job;
  if (Date.now() - new Date(job.created_at).getTime() > GEN_MAX_AGE_MS) return fail(svc, job, "The generation took too long and was stopped.", true);
  const provider = generationProvider();
  if (!provider) return job;
  const now = new Date().toISOString();
  await svc.from("generation_jobs").update({ last_polled_at: now, updated_at: now }).eq("id", job.id);
  let status: GenerationStatus;
  try {
    status = await provider.status(job.provider_request_id, job.input?.statusUrl ?? null);
  } catch (e) {
    const err = e as GenerationError;
    if (err.retryable || err.code === "not_configured") return job;
    return fail(svc, job, err.message, true);
  }
  return applyGenerationStatus(svc, job, status);
}

/** Apply what the provider said (from a poll or a webhook). */
export async function applyGenerationStatus(svc: Supa, job: GenerationJobRow, status: GenerationStatus): Promise<GenerationJobRow> {
  if (job.status !== "processing" && job.status !== "queued") return job;
  if (status.status === "failed") return fail(svc, job, status.error, true);
  if (status.status !== "done") return job;
  return finishGenerationJob(svc, job, status.outputs);
}

export async function finishGenerationJob(svc: Supa, job: GenerationJobRow, outputs: GenerationOutput[]): Promise<GenerationJobRow> {
  const rows = [];
  const input = job.input as { durationSec?: number; caption?: string | null; hashtags?: string[] };
  for (const o of outputs) {
    let path: string | null = null;
    try {
      const ext = o.kind === "video" ? "mp4" : extOf(o.contentType, "jpg");
      path = (await copyUrlToBucket(svc, o.url, mediaPath(job.user_id, "generations", ext), o.kind === "video" ? "video/mp4" : "image/jpeg")).path;
    } catch (e) {
      console.error("[ai-studio] output copy failed:", (e as Error)?.message ?? e);
    }
    rows.push({
      job_id: job.id, user_id: job.user_id, workspace_id: job.workspace_id, kind: o.kind, output_url: o.url, output_path: path,
      duration_ms: o.kind === "video" && input?.durationSec ? input.durationSec * 1000 : null,
      title: (job.idea as { hook?: string } | null)?.hook?.slice(0, 120) ?? job.prompt.slice(0, 120),
      caption: input?.caption ?? (job.idea as { caption?: string } | null)?.caption ?? null,
      hashtags: input?.hashtags ?? [],
    });
  }
  if (rows.length) {
    const { error } = await svc.from("generations").insert(rows);
    if (error) console.error("[ai-studio] generations not saved:", error.message);
  }
  const now = new Date().toISOString();
  const { data } = await svc.from("generation_jobs").update({ status: "done", credits_charged: job.credits_reserved, finished_at: now, updated_at: now, error: rows.length ? null : "The provider returned nothing for this request." }).eq("id", job.id).select(JOB_COLS).single();
  return (data as GenerationJobRow) ?? { ...job, status: "done" };
}

export async function listGenerationJobs(client: Supa, ownerId: string, wsId: string | null, limit = 30): Promise<GenerationJobRow[]> {
  let q = client.from("generation_jobs").select(JOB_COLS).eq("user_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q;
  if (error) throw new GenerationError(error.message, "db");
  return (data ?? []) as GenerationJobRow[];
}

export async function loadGenerationJob(client: Supa, ownerId: string, id: string): Promise<GenerationJobRow | null> {
  const { data, error } = await client.from("generation_jobs").select(JOB_COLS).eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (error) throw new GenerationError(error.message, "db");
  return (data as GenerationJobRow | null) ?? null;
}

export async function loadGenerationByProviderId(svc: Supa, providerRequestId: string): Promise<GenerationJobRow | null> {
  const { data } = await svc.from("generation_jobs").select(JOB_COLS).eq("provider_request_id", providerRequestId).maybeSingle();
  return (data as GenerationJobRow | null) ?? null;
}

async function withLinks(rows: GenerationRow[]): Promise<GenerationView[]> {
  const svc = createServiceClient();
  const out: GenerationView[] = [];
  for (const r of rows) {
    const playUrl = svc ? await signedUrl(svc, r.output_path) : null;
    const ext = r.kind === "video" ? "mp4" : (r.output_path ?? "").split(".").pop() || "jpg";
    const downloadUrl = svc ? await signedUrl(svc, r.output_path, undefined, `${(r.title ?? "socia").replace(/[^\w-]+/g, "_").slice(0, 60)}.${ext}`) : null;
    out.push({ ...r, playUrl: playUrl ?? r.output_url, downloadUrl: downloadUrl ?? r.output_url });
  }
  return out;
}

export async function loadGenerations(client: Supa, ownerId: string, jobId: string): Promise<GenerationView[]> {
  const { data, error } = await client.from("generations").select(GEN_COLS).eq("job_id", jobId).eq("user_id", ownerId).order("created_at");
  if (error) throw new GenerationError(error.message, "db");
  return withLinks((data ?? []) as GenerationRow[]);
}

export async function listGenerationsForLibrary(client: Supa, ownerId: string, wsId: string | null, limit = 60): Promise<GenerationView[]> {
  let q = client.from("generations").select(GEN_COLS).eq("user_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q;
  if (error) throw new GenerationError(error.message, "db");
  return withLinks((data ?? []) as GenerationRow[]);
}

export async function deleteGenerationJob(ownerId: string, job: GenerationJobRow): Promise<boolean> {
  const svc = svcOrThrow();
  if (job.status === "processing" && job.provider_request_id) {
    const cancelled = await generationProvider()?.cancel(job.provider_request_id);
    if (!cancelled) return false; // already generating: it will finish and be charged
    await refundCredits(ownerId, { kind: "generation_job", id: job.id }, "Cancelled before it started");
  }
  const { data } = await svc.from("generations").select("output_path, thumbnail_path").eq("job_id", job.id).eq("user_id", ownerId);
  const paths = ((data ?? []) as { output_path: string | null; thumbnail_path: string | null }[]).flatMap((g) => [g.output_path, g.thumbnail_path]);
  await removePaths(svc, [...paths, job.input_image_path]);
  const { error } = await svc.from("generation_jobs").delete().eq("id", job.id).eq("user_id", ownerId);
  if (error) throw new GenerationError(error.message, "db");
  return true;
}
