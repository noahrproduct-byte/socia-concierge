// The AI Clipper's job lifecycle (supabase/ai-studio.sql clip_jobs, clips):
//   create   check the plan, price the source in credits, spend them, save the job
//   submit   hand it to the provider (its own rate limit respected; queued otherwise)
//   poll     ask the provider; when done, copy every clip into SOCIA's bucket,
//            write captions, save the clips; when failed, refund the credits
// Everything writes with the service role after the caller was checked. Server only.
import { createServiceClient } from "@/lib/supabase/service";
import { rateHit } from "@/lib/oauth/runtime";
import { getProfile } from "@/lib/profile";
import type { Ctx } from "@/lib/context";
import { clipCredits } from "@/lib/credits/config";
import { spendCredits, refundCredits, CreditsError } from "@/lib/credits/ledger";
import { clipperProvider } from "./vizard";
import { ClipperError, MAX_CLIPS, isClipLength, type ClipperOptions, type ClipperSource, type ProviderClip, DEFAULT_CLIPPER_OPTIONS } from "./provider";
import { AI_BUCKET, copyUrlToBucket, mediaPath, removePaths, signedUrl } from "@/lib/aiStudio/media";
import { brandLine, writeClipCaptions } from "@/lib/aiStudio/captions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type ClipJobRow = {
  id: string; user_id: string; workspace_id: string | null;
  source_kind: "youtube" | "upload" | "url"; source_url: string; source_path: string | null; source_minutes: number;
  options: ClipperOptions; provider: string; provider_job_id: string | null;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  credits_reserved: number; credits_charged: number | null; error: string | null;
  created_at: string; updated_at: string; last_polled_at: string | null; finished_at: string | null;
};
export type ClipRow = {
  id: string; job_id: string; provider_clip_id: string | null; video_url: string | null; video_path: string | null; thumbnail_path: string | null;
  duration_ms: number | null; title: string | null; score: number | null; score_reason: string | null; transcript: string | null;
  caption: string | null; hashtags: string[]; created_at: string;
};
export type ClipView = ClipRow & { playUrl: string | null; downloadUrl: string | null };

const JOB_COLS = "id, user_id, workspace_id, source_kind, source_url, source_path, source_minutes, options, provider, provider_job_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at";
const CLIP_COLS = "id, job_id, provider_clip_id, video_url, video_path, thumbnail_path, duration_ms, title, score, score_reason, transcript, caption, hashtags, created_at";

/** Vizard allows 3 submissions a minute and 20 an hour per key; SOCIA queues past that. */
const PROVIDER_PER_MINUTE = 3;
const PROVIDER_PER_HOUR = 20;
/** How often one job is asked about (Vizard suggests 30 s). */
export const CLIP_POLL_SECONDS = 30;
/** A job still processing after this long is failed and refunded. */
export const CLIP_MAX_AGE_MS = 6 * 3600_000;

const svcOrThrow = (): Supa => {
  const svc = createServiceClient();
  if (!svc) throw new ClipperError("SUPABASE_SERVICE_ROLE_KEY is not set.", "no_service", false);
  return svc;
};

export const YOUTUBE_RE = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

/** Minutes of a YouTube video, read from the watch page; null when it can't be read. */
export async function youtubeMinutes(url: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SOCIA clipper)", "Accept-Language": "en" } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html) ?? /<meta itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/.exec(html);
    if (!m) return null;
    const seconds = m.length === 2 ? Number(m[1]) : Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    return seconds > 0 ? Math.ceil(seconds / 60) : null;
  } catch {
    return null;
  }
}

/** Clean request options: anything off the list becomes the default. Pure. */
export function cleanOptions(raw: unknown): ClipperOptions {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lengths = Array.isArray(o.lengths) ? o.lengths.filter(isClipLength) : [];
  const n = typeof o.maxClips === "number" ? Math.round(o.maxClips) : DEFAULT_CLIPPER_OPTIONS.maxClips;
  return {
    maxClips: Math.min(MAX_CLIPS, Math.max(1, n)),
    lengths: lengths.length ? Array.from(new Set(lengths)) : DEFAULT_CLIPPER_OPTIONS.lengths,
    captions: typeof o.captions === "boolean" ? o.captions : true,
    headline: typeof o.headline === "boolean" ? o.headline : true,
    lang: typeof o.lang === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(o.lang) ? o.lang : "en",
    clipModel: o.clipModel === "clip_v2" ? "clip_v2" : "clip_v1",
  };
}

export type CreateClipJobInput = {
  source: { kind: "youtube" | "url" | "upload"; url: string; path?: string | null; ext?: string };
  /** Minutes of source video, when the server cannot measure it (uploads and remote files). */
  minutes: number | null;
  options: ClipperOptions;
};

/** Price, spend and save a job, then try to submit it at once. Throws ClipperError or CreditsError. */
export async function createClipJob(ctx: Ctx, input: CreateClipJobInput): Promise<ClipJobRow> {
  const svc = svcOrThrow();
  let minutes = input.minutes;
  if (input.source.kind === "youtube") minutes = (await youtubeMinutes(input.source.url)) ?? minutes;
  if (!minutes || !(minutes > 0)) throw new ClipperError("SOCIA could not tell how long the video is. Enter its length in minutes.", "no_length");
  minutes = Math.min(600, Math.ceil(minutes));
  const credits = clipCredits(minutes, input.options.clipModel);
  const { data, error } = await svc.from("clip_jobs").insert({
    user_id: ctx.ownerId, workspace_id: ctx.workspace?.id ?? null,
    source_kind: input.source.kind, source_url: input.source.url, source_path: input.source.path ?? null,
    source_minutes: minutes, options: input.options, provider: clipperProvider()?.name ?? "vizard",
    status: "queued", credits_reserved: credits,
  }).select(JOB_COLS).single();
  if (error) throw new ClipperError(error.message, "db");
  const job = data as ClipJobRow;
  try {
    await spendCredits(ctx.ownerId, credits, { kind: "clip_job", id: job.id }, `Clip ${minutes} min of video`);
  } catch (e) {
    await svc.from("clip_jobs").delete().eq("id", job.id).eq("user_id", ctx.ownerId);
    throw e;
  }
  return (await submitClipJob(svc, job)) ?? job;
}

/** Hand a queued job to the provider if its rate limit allows; otherwise leave it queued for the poller. */
export async function submitClipJob(svc: Supa, job: ClipJobRow): Promise<ClipJobRow | null> {
  if (job.status !== "queued") return job;
  const provider = clipperProvider();
  if (!provider) return fail(svc, job, "The clipping service is not configured.", true);
  const minute = await rateHit(`provider:${provider.name}:minute`, 60, PROVIDER_PER_MINUTE);
  const hour = minute === "ok" ? await rateHit(`provider:${provider.name}:hour`, 3600, PROVIDER_PER_HOUR) : minute;
  if (minute !== "ok" || hour !== "ok") {
    await svc.from("clip_jobs").update({ last_polled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return job; // still queued; the next poll tries again
  }
  let source: ClipperSource;
  if (job.source_kind === "youtube") source = { kind: "youtube", url: job.source_url };
  else if (job.source_kind === "upload") {
    const url = await signedUrl(svc, job.source_path, 24 * 3600);
    if (!url) return fail(svc, job, "The uploaded file could not be read.", true);
    source = { kind: "upload", url, ext: (job.source_path ?? "").split(".").pop() || "mp4" };
  } else source = { kind: "url", url: job.source_url, ext: (job.source_url.split("?")[0].split(".").pop() || "mp4").toLowerCase() };
  try {
    const { providerJobId } = await provider.submitJob(source, job.options);
    const { data } = await svc.from("clip_jobs").update({ provider_job_id: providerJobId, status: "processing", last_polled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).select(JOB_COLS).single();
    return (data as ClipJobRow) ?? { ...job, provider_job_id: providerJobId, status: "processing" };
  } catch (e) {
    const err = e as ClipperError;
    if (err.retryable) return job; // the provider is busy: stay queued
    return fail(svc, job, err.message || "The clipping service refused the request.", true);
  }
}

async function fail(svc: Supa, job: ClipJobRow, message: string, refund: boolean): Promise<ClipJobRow> {
  const now = new Date().toISOString();
  const { data } = await svc.from("clip_jobs").update({ status: "failed", error: message.slice(0, 500), finished_at: now, updated_at: now, credits_charged: refund ? 0 : job.credits_reserved }).eq("id", job.id).select(JOB_COLS).single();
  if (refund) await refundCredits(job.user_id, { kind: "clip_job", id: job.id }, "Clipping failed");
  return (data as ClipJobRow) ?? { ...job, status: "failed", error: message };
}

/** Ask the provider about a processing job and finish it when it is done. */
export async function pollClipJob(svc: Supa, job: ClipJobRow): Promise<ClipJobRow> {
  if (job.status === "queued") return (await submitClipJob(svc, job)) ?? job;
  if (job.status !== "processing" || !job.provider_job_id) return job;
  if (Date.now() - new Date(job.created_at).getTime() > CLIP_MAX_AGE_MS) return fail(svc, job, "The clipping took too long and was stopped. Your credits are back.", true);
  const provider = clipperProvider();
  if (!provider) return job;
  const now = new Date().toISOString();
  await svc.from("clip_jobs").update({ last_polled_at: now, updated_at: now }).eq("id", job.id);
  let status;
  try {
    status = await provider.getJobStatus(job.provider_job_id);
  } catch (e) {
    const err = e as ClipperError;
    if (err.retryable || err.code === "not_configured") return job;
    return fail(svc, job, err.message, true);
  }
  if (status.status === "processing") return job;
  if (status.status === "failed") return fail(svc, job, status.error, true);
  return finishClipJob(svc, job, status.clips);
}

/** Copy the clips in, caption them, save them, close the job. */
export async function finishClipJob(svc: Supa, job: ClipJobRow, clips: ProviderClip[]): Promise<ClipJobRow> {
  const profile = await getProfile(svc, job.user_id, job.workspace_id ? ({ id: job.workspace_id } as never) : null).catch(() => null);
  const captions = await writeClipCaptions(job.user_id, brandLine(profile), clips.map((c) => ({ title: c.title, transcript: c.transcript })));
  const rows = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    let path: string | null = null;
    try {
      path = (await copyUrlToBucket(svc, c.videoUrl, mediaPath(job.user_id, "clips", "mp4"), "video/mp4")).path;
    } catch (e) {
      console.error("[clipper] clip copy failed:", (e as Error)?.message ?? e);
    }
    rows.push({
      job_id: job.id, user_id: job.user_id, workspace_id: job.workspace_id, provider_clip_id: c.id,
      video_url: c.videoUrl, video_path: path, duration_ms: c.durationMs, title: c.title,
      score: c.score, score_reason: c.scoreReason, transcript: c.transcript,
      caption: captions[i]?.caption ?? c.title ?? "", hashtags: captions[i]?.hashtags ?? [],
    });
  }
  if (rows.length) {
    const { error } = await svc.from("clips").upsert(rows, { onConflict: "job_id,provider_clip_id" });
    if (error) console.error("[clipper] clips not saved:", error.message);
  }
  const now = new Date().toISOString();
  const { data } = await svc.from("clip_jobs").update({ status: "done", credits_charged: job.credits_reserved, finished_at: now, updated_at: now, error: rows.length ? null : "The provider returned no clips for this video." }).eq("id", job.id).select(JOB_COLS).single();
  return (data as ClipJobRow) ?? { ...job, status: "done" };
}

export async function listClipJobs(client: Supa, ownerId: string, wsId: string | null, limit = 30): Promise<ClipJobRow[]> {
  let q = client.from("clip_jobs").select(JOB_COLS).eq("user_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q;
  if (error) throw new ClipperError(error.message, "db");
  return (data ?? []) as ClipJobRow[];
}

export async function loadClipJob(client: Supa, ownerId: string, id: string): Promise<ClipJobRow | null> {
  const { data, error } = await client.from("clip_jobs").select(JOB_COLS).eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (error) throw new ClipperError(error.message, "db");
  return (data as ClipJobRow | null) ?? null;
}

/** The job's clips with play and download links (service role signs them). */
export async function loadClips(client: Supa, ownerId: string, jobId: string): Promise<ClipView[]> {
  const { data, error } = await client.from("clips").select(CLIP_COLS).eq("job_id", jobId).eq("user_id", ownerId).order("score", { ascending: false, nullsFirst: false }).order("created_at");
  if (error) throw new ClipperError(error.message, "db");
  const svc = createServiceClient();
  const out: ClipView[] = [];
  for (const r of (data ?? []) as ClipRow[]) {
    const playUrl = svc ? await signedUrl(svc, r.video_path) : null;
    const downloadUrl = svc ? await signedUrl(svc, r.video_path, undefined, `${(r.title ?? "clip").replace(/[^\w-]+/g, "_").slice(0, 60)}.mp4`) : null;
    out.push({ ...r, playUrl: playUrl ?? r.video_url, downloadUrl: downloadUrl ?? r.video_url });
  }
  return out;
}

/** Everything a signed-in owner's library shows: finished clips across jobs. */
export async function listClipsForLibrary(client: Supa, ownerId: string, wsId: string | null, limit = 60): Promise<ClipView[]> {
  let q = client.from("clips").select(CLIP_COLS).eq("user_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q;
  if (error) throw new ClipperError(error.message, "db");
  const svc = createServiceClient();
  const out: ClipView[] = [];
  for (const r of (data ?? []) as ClipRow[]) out.push({ ...r, playUrl: svc ? await signedUrl(svc, r.video_path) : r.video_url, downloadUrl: null });
  return out;
}

/** Delete a finished or failed job with its clips and files. A processing job is left to finish. */
export async function deleteClipJob(ownerId: string, job: ClipJobRow): Promise<boolean> {
  if (job.status === "processing") return false;
  const svc = svcOrThrow();
  const { data } = await svc.from("clips").select("video_path, thumbnail_path").eq("job_id", job.id).eq("user_id", ownerId);
  const paths = ((data ?? []) as { video_path: string | null; thumbnail_path: string | null }[]).flatMap((c) => [c.video_path, c.thumbnail_path]);
  await removePaths(svc, [...paths, job.source_path]);
  const { error } = await svc.from("clip_jobs").delete().eq("id", job.id).eq("user_id", ownerId);
  if (error) throw new ClipperError(error.message, "db");
  return true;
}

export { AI_BUCKET, CreditsError };
