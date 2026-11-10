// AI Studio's job lifecycle (supabase/ai-studio.sql generation_jobs,
// generations): price the request in credits, spend them, save the job, hand
// it to the provider; poll (or take the webhook); copy the output into
// SOCIA's bucket; refund on failure. Service role after the caller was
// checked. Server only.
import { createServiceClient } from "@/lib/supabase/service";
import type { Ctx } from "@/lib/context";
import { creditsForUsd, modelById, type GenerationKind, type GenerationModel } from "@/lib/credits/config";
import { spendCredits, refundCredits } from "@/lib/credits/ledger";
import { generationProvider } from "./higgsfield";
import { GenerationError, type GenerationOutput, type GenerationStatus } from "./provider";
import { copyUrlToBucket, extOf, mediaPath, removePaths, signedUrl } from "@/lib/aiStudio/media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type GenerationJobRow = {
  id: string; user_id: string; workspace_id: string | null; kind: GenerationKind; model: string; prompt: string;
  input_image_path: string | null; input: { durationSec?: number; aspectRatio?: string; statusUrl?: string | null; quotedUsd?: number };
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

const ideaText = (v: unknown, n: number): string => (typeof v === "string" ? v.trim().slice(0, n) : "");
const IDEA_KINDS: GenerationKind[] = ["text_to_video", "image_to_video", "text_to_image"];

/**
 * The idea a request came from, as the page sent it: only the fields an idea
 * has (lib/generation/ideas.ts), each a bounded string, so what is saved and
 * shown later is always text. null when nothing usable is left. Pure.
 */
export function cleanIdea(raw: unknown): { id: string; hook: string; concept: string; shot: string; kind: GenerationKind | ""; caption: string; hashtags: string[] } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const idea = {
    id: ideaText(o.id, 40), hook: ideaText(o.hook, 120), concept: ideaText(o.concept, 400), shot: ideaText(o.shot, 1200),
    kind: IDEA_KINDS.includes(o.kind as GenerationKind) ? (o.kind as GenerationKind) : ("" as const),
    caption: ideaText(o.caption, 2200),
    hashtags: (Array.isArray(o.hashtags) ? o.hashtags : []).filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 5),
  };
  return idea.hook || idea.concept || idea.shot ? idea : null;
}

export type GenerationShape = { model: GenerationModel; durationSec?: number; aspectRatio?: string };

/** The model, length and shape a request will run with, or the sentence that says what's wrong. Pure. */
export function checkGeneration(input: Pick<CreateGenerationInput, "kind" | "modelId" | "durationSec" | "aspectRatio">): GenerationShape | { error: string } {
  const model = modelById(input.modelId);
  if (!model || !model.kinds.includes(input.kind)) return { error: "Pick a model that does this kind of generation." };
  const durationSec = input.kind === "text_to_image" ? undefined : (input.durationSec ?? model.durations?.[0]);
  if (input.kind !== "text_to_image" && (!durationSec || !(model.durations ?? []).includes(durationSec))) {
    return { error: `Pick a length this model offers: ${(model.durations ?? []).join(", ")} seconds.` };
  }
  // Image to video takes its shape from the start image.
  const shapes = input.kind === "image_to_video" ? [] : (model.aspectRatios ?? []);
  const aspectRatio = shapes.length ? (input.aspectRatio && shapes.includes(input.aspectRatio) ? input.aspectRatio : shapes[0]) : undefined;
  return { model, durationSec, aspectRatio };
}

/**
 * What a request costs, from the provider's live estimate for exactly this
 * request: SOCIA's dollar cost and the credits charged for it (with the margin).
 * Throws when the price can't be read, so nothing runs at a guessed price.
 */
export async function quoteGeneration(input: Pick<CreateGenerationInput, "kind" | "modelId" | "prompt" | "durationSec" | "aspectRatio"> & { imageUrl?: string }): Promise<{ credits: number; usd: number; shape: GenerationShape }> {
  const shape = checkGeneration(input);
  if ("error" in shape) throw new GenerationError(shape.error, "bad_model");
  const provider = generationProvider();
  if (!provider) throw new GenerationError("AI Studio's generation service is not configured.", "not_configured");
  const usd = await provider.estimate({
    kind: input.kind, model: shape.model, prompt: (input.prompt || "price check").slice(0, 2500),
    durationSec: shape.durationSec, aspectRatio: shape.aspectRatio,
    // Before an image is uploaded, a price check uses SOCIA's own icon as the start image.
    imageUrl: input.kind === "image_to_video" ? (input.imageUrl ?? "https://sociaos.com/icon.png") : undefined,
  });
  return { credits: creditsForUsd(usd), usd, shape };
}

export async function createGenerationJob(ctx: Ctx, input: CreateGenerationInput): Promise<GenerationJobRow> {
  const svc = svcOrThrow();
  if (input.kind === "image_to_video" && !input.inputImagePath) throw new GenerationError("Image to video needs a start image.", "no_image");
  const prompt = input.prompt.replace(/\s+/g, " ").trim().slice(0, 2500);
  if (!prompt) throw new GenerationError("Write what the video or image should show.", "no_prompt");
  const imageUrl = input.kind === "image_to_video" ? (await signedUrl(svc, input.inputImagePath ?? null, 3600)) ?? undefined : undefined;
  if (input.kind === "image_to_video" && !imageUrl) throw new GenerationError("The start image could not be read.", "no_image");
  const { credits, usd, shape } = await quoteGeneration({ ...input, prompt, imageUrl });
  const model = shape.model;
  const { data, error } = await svc.from("generation_jobs").insert({
    user_id: ctx.ownerId, workspace_id: ctx.workspace?.id ?? null, kind: input.kind, model: model.id, prompt,
    input_image_path: input.inputImagePath ?? null,
    input: { durationSec: shape.durationSec, aspectRatio: shape.aspectRatio, quotedUsd: usd, caption: input.caption ?? null, hashtags: input.hashtags ?? [] },
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
    // Only a job still queued moves on: one removed or settled meanwhile is left as it is.
    const { data, error } = await svc.from("generation_jobs").update({ provider_request_id: providerRequestId, input: { ...job.input, statusUrl }, status: "processing", last_polled_at: now, updated_at: now }).eq("id", job.id).eq("status", "queued").select(JOB_COLS).maybeSingle();
    if (!data && !error) return reread(svc, job);
    return (data as GenerationJobRow) ?? { ...job, provider_request_id: providerRequestId, status: "processing" };
  } catch (e) {
    const err = e as GenerationError;
    if (err.retryable) return job;
    return fail(svc, job, err.message || "The generation service refused the request.", true);
  }
}

async function fail(svc: Supa, job: GenerationJobRow, message: string, refund: boolean): Promise<GenerationJobRow> {
  const now = new Date().toISOString();
  const { data, error } = await svc.from("generation_jobs").update({ status: "failed", error: message.slice(0, 500), finished_at: now, updated_at: now, credits_charged: refund ? 0 : job.credits_reserved }).eq("id", job.id).in("status", ["queued", "processing"]).select(JOB_COLS).maybeSingle();
  // A job that had already finished is left as it is, and so are its credits.
  if (!data && !error) return reread(svc, job);
  if (refund) await refundCredits(job.user_id, { kind: "generation_job", id: job.id }, "Generation failed");
  return (data as GenerationJobRow) ?? { ...job, status: "failed", error: message };
}

/** The job as it is stored now (after an update that only applies to an open job matched nothing). */
async function reread(svc: Supa, job: GenerationJobRow): Promise<GenerationJobRow> {
  const { data } = await svc.from("generation_jobs").select(JOB_COLS).eq("id", job.id).maybeSingle();
  return (data as GenerationJobRow | null) ?? job;
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
      title: cleanIdea(job.idea)?.hook || job.prompt.slice(0, 120),
      caption: input?.caption ?? (cleanIdea(job.idea)?.caption || null),
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
  return ((data ?? []) as GenerationJobRow[]).map((j) => ({ ...j, idea: cleanIdea(j.idea) }));
}

/** One job of the owner's, in the active Brand Workspace when there is one (as the list shows them). */
export async function loadGenerationJob(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<GenerationJobRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let q = client.from("generation_jobs").select(JOB_COLS).eq("id", id).eq("user_id", ownerId);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q.maybeSingle();
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
