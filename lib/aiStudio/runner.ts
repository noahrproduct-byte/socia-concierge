// Moves open AI jobs along: submits what is queued (within the providers'
// rate limits) and polls what is processing. Called by the cron route every
// minute and, so the page works without pg_cron, by a job's own GET when it
// has not been looked at for a while. Service role. Server only.
import { createServiceClient } from "@/lib/supabase/service";
import { removePaths } from "./media";
import { pollClipJob, CLIP_POLL_SECONDS, type ClipJobRow } from "@/lib/clipper/server";
import { pollGenerationJob, GEN_POLL_SECONDS, type GenerationJobRow } from "@/lib/generation/server";

const CLIP_COLS = "id, user_id, workspace_id, source_kind, source_url, source_path, source_minutes, options, provider, provider_job_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at";
const GEN_COLS = "id, user_id, workspace_id, kind, model, prompt, input_image_path, input, idea, provider, provider_request_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at";

const due = (lastPolled: string | null, seconds: number, now: number) => !lastPolled || now - new Date(lastPolled).getTime() >= seconds * 1000;

export async function runOpenJobs(opts: { limit?: number; now?: Date } = {}): Promise<{ clips: number; generations: number; errors: number; removedUploads: number }> {
  const svc = createServiceClient();
  if (!svc) return { clips: 0, generations: 0, errors: 0, removedUploads: 0 };
  const now = (opts.now ?? new Date()).getTime();
  const limit = opts.limit ?? 25;
  let errors = 0;
  let clips = 0;
  let generations = 0;
  const { data: cj } = await svc.from("clip_jobs").select(CLIP_COLS).in("status", ["queued", "processing"]).order("created_at").limit(limit);
  for (const job of (cj ?? []) as ClipJobRow[]) {
    if (job.status === "processing" && !due(job.last_polled_at, CLIP_POLL_SECONDS, now)) continue;
    try { await pollClipJob(svc, job); clips++; } catch (e) { errors++; console.error("[ai-poll] clip job", job.id, (e as Error)?.message ?? e); }
  }
  const { data: gj } = await svc.from("generation_jobs").select(GEN_COLS).in("status", ["queued", "processing"]).order("created_at").limit(limit);
  for (const job of (gj ?? []) as GenerationJobRow[]) {
    if (job.status === "processing" && !due(job.last_polled_at, GEN_POLL_SECONDS, now)) continue;
    try { await pollGenerationJob(svc, job); generations++; } catch (e) { errors++; console.error("[ai-poll] generation job", job.id, (e as Error)?.message ?? e); }
  }
  const removedUploads = await removeStaleUploads(svc).catch((e) => { errors++; console.error("[ai-poll] upload cleanup", (e as Error)?.message ?? e); return 0; });
  return { clips, generations, errors, removedUploads };
}

/** Clipper sources and start images a day old that no open job needs (supabase/ai-studio.sql). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeStaleUploads(svc: any): Promise<number> {
  const { data, error } = await svc.rpc("socia_ai_media_stale_uploads", { p_limit: 100 });
  if (error) throw new Error(error.message);
  const names = ((data ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Record<string, string>)?.socia_ai_media_stale_uploads)).filter(Boolean) as string[];
  await removePaths(svc, names);
  return names.length;
}

/** Poll one job now if it is open and has not been looked at recently (the page's own refresh drives progress without cron). */
export async function refreshClipJob(job: ClipJobRow, now = Date.now()): Promise<ClipJobRow> {
  const svc = createServiceClient();
  if (!svc) return job;
  if (job.status === "queued" || (job.status === "processing" && due(job.last_polled_at, CLIP_POLL_SECONDS, now))) {
    try { return await pollClipJob(svc, job); } catch (e) { console.error("[clipper] refresh", job.id, (e as Error)?.message ?? e); }
  }
  return job;
}

export async function refreshGenerationJob(job: GenerationJobRow, now = Date.now()): Promise<GenerationJobRow> {
  const svc = createServiceClient();
  if (!svc) return job;
  if (job.status === "queued" || (job.status === "processing" && due(job.last_polled_at, GEN_POLL_SECONDS, now))) {
    try { return await pollGenerationJob(svc, job); } catch (e) { console.error("[ai-studio] refresh", job.id, (e as Error)?.message ?? e); }
  }
  return job;
}
